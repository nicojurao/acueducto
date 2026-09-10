import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { crearInformeExcel, enviarExcel } from "../../lib/excelBranding.js";

export const historialRouter = Router();

const ENTIDAD_LABELS: Record<string, string> = {
  medidor: "Medidor",
  suscriptor: "Suscriptor",
  usuario: "Usuario",
  item_inventario: "Ítem de inventario",
};

function fmtFecha(fecha: Date): string {
  return fecha.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

// Historial de un registro puntual (para incrustar en el detalle de un medidor/suscriptor).
historialRouter.get("/:entidad/:entidadId", async (req, res) => {
  const { entidad, entidadId } = req.params;
  const items = await prisma.historialCambio.findMany({
    where: { entidad, entidadId: Number(entidadId) },
    include: { usuario: { select: { id: true, nombre: true } } },
    orderBy: { fecha: "desc" },
  });
  res.json(items);
});

function construirWhere(query: Record<string, unknown>) {
  const { entidad, usuarioId, desde, hasta, campo } = query;
  const where: any = {};
  if (entidad) where.entidad = String(entidad);
  if (usuarioId) where.usuarioId = Number(usuarioId);
  if (campo) where.campo = { contains: String(campo), mode: "insensitive" };
  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = new Date(String(desde));
    if (hasta) where.fecha.lte = new Date(`${String(hasta)}T23:59:59`);
  }
  return where;
}

// Los nombres de medidor/suscriptor/etc. se resuelven en consultas adicionales (una por tipo de
// entidad, no una por fila) para no caer en N+1 con listas grandes — la usan tanto el listado
// paginado como el export a Excel (que trae todo, sin paginar).
async function resolverNombresEntidad<T extends { entidad: string; entidadId: number }>(items: T[]) {
  const idsMedidor = [...new Set(items.filter((i) => i.entidad === "medidor").map((i) => i.entidadId))];
  const idsSuscriptor = [...new Set(items.filter((i) => i.entidad === "suscriptor").map((i) => i.entidadId))];
  const idsUsuario = [...new Set(items.filter((i) => i.entidad === "usuario").map((i) => i.entidadId))];
  const idsItemInventario = [...new Set(items.filter((i) => i.entidad === "item_inventario").map((i) => i.entidadId))];
  const [medidores, suscriptores, usuariosEntidad, itemsInventario] = await Promise.all([
    idsMedidor.length
      ? prisma.medidor.findMany({ where: { id: { in: idsMedidor } }, select: { id: true, serial: true } })
      : [],
    idsSuscriptor.length
      ? prisma.suscriptor.findMany({ where: { id: { in: idsSuscriptor } }, select: { id: true, nombre: true, codigo: true } })
      : [],
    idsUsuario.length
      ? prisma.usuario.findMany({ where: { id: { in: idsUsuario } }, select: { id: true, nombre: true } })
      : [],
    idsItemInventario.length
      ? prisma.itemInventario.findMany({ where: { id: { in: idsItemInventario } }, select: { id: true, nombre: true } })
      : [],
  ]);
  const nombreMedidor = new Map(medidores.map((m) => [m.id, m.serial ?? `#${m.id}`]));
  const nombreSuscriptor = new Map(suscriptores.map((s) => [s.id, `${s.nombre} (${s.codigo})`]));
  const nombreUsuarioEntidad = new Map(usuariosEntidad.map((u) => [u.id, u.nombre]));
  const nombreItemInventario = new Map(itemsInventario.map((i) => [i.id, i.nombre]));

  return items.map((i) => ({
    ...i,
    entidadNombre:
      i.entidad === "medidor"
        ? nombreMedidor.get(i.entidadId) ?? `#${i.entidadId}`
        : i.entidad === "usuario"
        ? nombreUsuarioEntidad.get(i.entidadId) ?? `#${i.entidadId}`
        : i.entidad === "item_inventario"
        ? nombreItemInventario.get(i.entidadId) ?? `#${i.entidadId}`
        : nombreSuscriptor.get(i.entidadId) ?? `#${i.entidadId}`,
  }));
}

// Auditoría global con filtros y paginación.
historialRouter.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const where = construirWhere(req.query as Record<string, unknown>);

  const [items, total] = await Promise.all([
    prisma.historialCambio.findMany({
      where,
      include: { usuario: { select: { id: true, nombre: true } } },
      orderBy: { fecha: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.historialCambio.count({ where }),
  ]);

  const data = await resolverNombresEntidad(items);
  res.json({ data, total, page, limit });
});

// Excel del historial con los mismos filtros que el listado, sin paginar (hasta 20.000 filas de
// una vez — de sobra para cualquier rango razonable; si hiciera falta más, el filtro de fechas
// permite acotar antes de exportar).
historialRouter.get("/export", async (req, res) => {
  const where = construirWhere(req.query as Record<string, unknown>);

  const items = await prisma.historialCambio.findMany({
    where,
    include: { usuario: { select: { id: true, nombre: true } } },
    orderBy: { fecha: "desc" },
    take: 20000,
  });
  const data = await resolverNombresEntidad(items);

  const filas = data.map((i) => ({
    fecha: fmtFecha(i.fecha),
    entidad: ENTIDAD_LABELS[i.entidad] ?? i.entidad,
    entidadNombre: i.entidadNombre,
    campo: i.campo,
    valorAnterior: i.valorAnterior ?? "",
    valorNuevo: i.valorNuevo ?? "",
    usuario: i.usuario?.nombre ?? "-",
  }));

  const buffer = await crearInformeExcel(
    "Historial",
    "Historial de cambios",
    `${filas.length} cambio${filas.length === 1 ? "" : "s"}`,
    [
      { titulo: "FECHA", clave: "fecha", ancho: 18 },
      { titulo: "ENTIDAD", clave: "entidad", ancho: 16 },
      { titulo: "REGISTRO", clave: "entidadNombre", ancho: 28 },
      { titulo: "CAMPO", clave: "campo", ancho: 22 },
      { titulo: "VALOR ANTERIOR", clave: "valorAnterior", ancho: 24 },
      { titulo: "VALOR NUEVO", clave: "valorNuevo", ancho: 24 },
      { titulo: "USUARIO", clave: "usuario", ancho: 20 },
    ],
    filas
  );
  enviarExcel(res, buffer, "historial_de_cambios.xlsx");
});
