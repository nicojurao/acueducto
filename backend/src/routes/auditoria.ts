import { Router } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";
import { COLOR_MARCA_ARGB, enviarExcel } from "../lib/excelBranding.js";

export const auditoriaRouter = Router();

const MOTIVO_LABELS_EXCEL: Record<string, string> = {
  usuario_no_existe: "Usuario/cédula inexistente",
  contrasena_incorrecta: "Contraseña incorrecta",
  cuenta_inactiva: "Cuenta inactiva",
};

function fmtFechaExcel(f: Date): string {
  return f.toLocaleString("es-CO", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function hojaConEstilo(wb: ExcelJS.Workbook, nombre: string, columnas: { titulo: string; ancho?: number }[]) {
  const ws = wb.addWorksheet(nombre);
  ws.columns = columnas.map((c) => ({ width: c.ancho ?? 20 }));
  const fila = ws.addRow(columnas.map((c) => c.titulo));
  fila.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_MARCA_ARGB } };
    cell.alignment = { vertical: "middle" };
  });
  fila.height = 18;
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return ws;
}

// El JWT de sesión dura 1 día (ver firmarToken en middleware/auth.js) y no hay forma de
// invalidarlo antes salvo rotando JWT_SECRET a mano (ver EventoSeguridad en schema.prisma) —
// así que una sesión sigue siendo válida criptográficamente mientras no pase ese día NI se haya
// rotado el secreto después de que se emitió. "Activa" acá es esa combinación.
const DURACION_TOKEN_DIAS = 1;

// El corte real de validez es el más reciente entre "hace 1 día" y la última rotación de
// JWT_SECRET registrada — lo que haya pasado después invalida todo lo anterior.
async function corteSesionActiva(): Promise<Date> {
  const porDuracion = new Date();
  porDuracion.setDate(porDuracion.getDate() - DURACION_TOKEN_DIAS);

  const ultimaRotacion = await prisma.eventoSeguridad.findFirst({
    where: { tipo: "rotacion_secreto" },
    orderBy: { fecha: "desc" },
  });

  return ultimaRotacion && ultimaRotacion.fecha > porDuracion ? ultimaRotacion.fecha : porDuracion;
}

// Listado paginado de inicios de sesión, más recientes primero. Filtros opcionales por usuario
// y por "solo activas" (dentro de la ventana de validez real del token).
auditoriaRouter.get("/", async (req, res) => {
  const { usuarioId, activas } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const corte = await corteSesionActiva();

  const filtros: any[] = [];
  if (usuarioId) filtros.push({ usuarioId: Number(usuarioId) });
  if (activas === "1") filtros.push({ fecha: { gte: corte } });
  const where = filtros.length > 0 ? { AND: filtros } : undefined;

  const [items, total] = await Promise.all([
    prisma.inicioSesion.findMany({
      where,
      include: { usuario: { select: { id: true, nombre: true, nombreUsuario: true } } },
      orderBy: { fecha: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.inicioSesion.count({ where }),
  ]);

  // "IP/dispositivo nuevo": primera vez que ESE usuario se conecta desde esa IP/dispositivo,
  // comparado contra todo su historial (no solo la página actual) — para señalar de un vistazo
  // un login desde un lugar/equipo que nunca había usado antes.
  const usuarioIds = [...new Set(items.map((i) => i.usuarioId))];
  const historialCompleto = usuarioIds.length
    ? await prisma.inicioSesion.findMany({
        where: { usuarioId: { in: usuarioIds } },
        select: { usuarioId: true, ip: true, dispositivo: true, fecha: true },
        orderBy: { fecha: "asc" },
      })
    : [];
  const primeraVezIp = new Map<string, number>();
  const primeraVezDispositivo = new Map<string, number>();
  for (const h of historialCompleto) {
    const claveIp = `${h.usuarioId}|${h.ip ?? ""}`;
    if (!primeraVezIp.has(claveIp)) primeraVezIp.set(claveIp, h.fecha.getTime());
    const claveDisp = `${h.usuarioId}|${h.dispositivo ?? ""}`;
    if (!primeraVezDispositivo.has(claveDisp)) primeraVezDispositivo.set(claveDisp, h.fecha.getTime());
  }
  const data = items.map((i) => ({
    ...i,
    ipNueva: primeraVezIp.get(`${i.usuarioId}|${i.ip ?? ""}`) === i.fecha.getTime(),
    dispositivoNuevo: primeraVezDispositivo.get(`${i.usuarioId}|${i.dispositivo ?? ""}`) === i.fecha.getTime(),
    activa: i.fecha >= corte,
  }));

  res.json({ data, total, page, limit });
});

// Intentos de login fallidos, más recientes primero. Filtro opcional por identificador (cédula
// o nombre de usuario que se intentó).
auditoriaRouter.get("/fallidos", async (req, res) => {
  const { identificador } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));

  const where = identificador ? { identificador: { contains: String(identificador), mode: "insensitive" as const } } : undefined;

  const [items, total] = await Promise.all([
    prisma.intentoLoginFallido.findMany({ where, orderBy: { fecha: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.intentoLoginFallido.count({ where }),
  ]);

  res.json({ data: items, total, page, limit });
});

// Excel con todo el historial (sin paginar, ambas tablas completas): sesiones exitosas en una
// hoja y los intentos fallidos en otra. Pensado como respaldo/reporte para llevar afuera de la
// app, no para uso diario (para eso están las pantallas paginadas de arriba).
auditoriaRouter.get("/export", async (_req, res) => {
  const corte = await corteSesionActiva();
  const [sesiones, fallidos] = await Promise.all([
    prisma.inicioSesion.findMany({
      include: { usuario: { select: { nombre: true, nombreUsuario: true } } },
      orderBy: { fecha: "desc" },
    }),
    prisma.intentoLoginFallido.findMany({ orderBy: { fecha: "desc" } }),
  ]);

  // Mismo cálculo de ipNueva/dispositivoNuevo que en GET /, pero sobre el histórico completo.
  const porUsuarioIp = new Map<string, number>();
  const porUsuarioDispositivo = new Map<string, number>();
  for (const s of [...sesiones].reverse()) {
    const claveIp = `${s.usuarioId}|${s.ip ?? ""}`;
    if (!porUsuarioIp.has(claveIp)) porUsuarioIp.set(claveIp, s.fecha.getTime());
    const claveDisp = `${s.usuarioId}|${s.dispositivo ?? ""}`;
    if (!porUsuarioDispositivo.has(claveDisp)) porUsuarioDispositivo.set(claveDisp, s.fecha.getTime());
  }

  const wb = new ExcelJS.Workbook();

  const wsSesiones = hojaConEstilo(wb, "Inicios de sesión", [
    { titulo: "Fecha", ancho: 20 },
    { titulo: "Usuario", ancho: 22 },
    { titulo: "IP", ancho: 18 },
    { titulo: "Ubicación", ancho: 28 },
    { titulo: "Dispositivo", ancho: 22 },
    { titulo: "IP nueva", ancho: 12 },
    { titulo: "Dispositivo nuevo", ancho: 16 },
    { titulo: "Activa", ancho: 10 },
  ]);
  sesiones.forEach((s) => {
    const ubicacion = [s.ciudad, s.region, s.pais].filter(Boolean).join(", ") || "-";
    const ipNueva = porUsuarioIp.get(`${s.usuarioId}|${s.ip ?? ""}`) === s.fecha.getTime();
    const dispositivoNuevo = porUsuarioDispositivo.get(`${s.usuarioId}|${s.dispositivo ?? ""}`) === s.fecha.getTime();
    wsSesiones.addRow([
      fmtFechaExcel(s.fecha),
      s.usuario?.nombre ?? "Usuario eliminado",
      s.ip ?? "-",
      ubicacion,
      s.dispositivo ?? "-",
      ipNueva ? "Sí" : "No",
      dispositivoNuevo ? "Sí" : "No",
      s.fecha >= corte ? "Sí" : "No",
    ]);
  });

  const wsFallidos = hojaConEstilo(wb, "Intentos fallidos", [
    { titulo: "Fecha", ancho: 20 },
    { titulo: "Intentó entrar como", ancho: 24 },
    { titulo: "Motivo", ancho: 24 },
    { titulo: "IP", ancho: 18 },
    { titulo: "Dispositivo", ancho: 22 },
  ]);
  fallidos.forEach((f) => {
    wsFallidos.addRow([
      fmtFechaExcel(f.fecha),
      f.identificador,
      MOTIVO_LABELS_EXCEL[f.motivo] ?? f.motivo,
      f.ip ?? "-",
      f.dispositivo ?? "-",
    ]);
  });

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  enviarExcel(res, buffer, `auditoria-${new Date().toISOString().slice(0, 10)}.xlsx`);
});

// Cambios (HistorialCambio) hechos por el mismo usuario entre este login y el siguiente login
// suyo (o hasta ahora, si es el más reciente) — la mejor aproximación posible a "qué hizo en esa
// sesión" sin tener un id de sesión real en el JWT (ver comentario en schema.prisma).
auditoriaRouter.get("/:id/cambios", async (req, res) => {
  const sesion = await prisma.inicioSesion.findUnique({ where: { id: Number(req.params.id) } });
  if (!sesion) return res.status(404).json({ error: "No encontrado" });

  const siguiente = await prisma.inicioSesion.findFirst({
    where: { usuarioId: sesion.usuarioId, fecha: { gt: sesion.fecha } },
    orderBy: { fecha: "asc" },
  });

  const items = await prisma.historialCambio.findMany({
    where: {
      usuarioId: sesion.usuarioId,
      fecha: { gte: sesion.fecha, ...(siguiente ? { lt: siguiente.fecha } : {}) },
    },
    orderBy: { fecha: "desc" },
  });

  const idsMedidor = [...new Set(items.filter((i) => i.entidad === "medidor").map((i) => i.entidadId))];
  const idsSuscriptor = [...new Set(items.filter((i) => i.entidad === "suscriptor").map((i) => i.entidadId))];
  const idsUsuario = [...new Set(items.filter((i) => i.entidad === "usuario").map((i) => i.entidadId))];
  const [medidores, suscriptores, usuariosEntidad] = await Promise.all([
    idsMedidor.length
      ? prisma.medidor.findMany({ where: { id: { in: idsMedidor } }, select: { id: true, serial: true } })
      : [],
    idsSuscriptor.length
      ? prisma.suscriptor.findMany({ where: { id: { in: idsSuscriptor } }, select: { id: true, nombre: true, codigo: true } })
      : [],
    idsUsuario.length
      ? prisma.usuario.findMany({ where: { id: { in: idsUsuario } }, select: { id: true, nombre: true } })
      : [],
  ]);
  const nombreMedidor = new Map(medidores.map((m) => [m.id, m.serial ?? `#${m.id}`]));
  const nombreSuscriptor = new Map(suscriptores.map((s) => [s.id, `${s.nombre} (${s.codigo})`]));
  const nombreUsuarioEntidad = new Map(usuariosEntidad.map((u) => [u.id, u.nombre]));

  const data = items.map((i) => ({
    ...i,
    entidadNombre:
      i.entidad === "medidor"
        ? nombreMedidor.get(i.entidadId) ?? `#${i.entidadId}`
        : i.entidad === "usuario"
        ? nombreUsuarioEntidad.get(i.entidadId) ?? `#${i.entidadId}`
        : nombreSuscriptor.get(i.entidadId) ?? `#${i.entidadId}`,
  }));

  res.json(data);
});
