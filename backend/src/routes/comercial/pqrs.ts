import { Router } from "express";
import multer from "multer";
import { prisma } from "../../lib/prisma.js";
import { enviarCorreoPqrRespondida, enviarCorreoPqrMensaje } from "../../lib/correo.js";
import { generarConstanciaPqrPdf } from "../../lib/pqrConstancia.js";
import { guardarArchivo } from "../../lib/storage.js";
import { logger } from "../../lib/logger.js";
import { fechaLegibleColombia, horaLegibleColombia } from "../../lib/fechaColombia.js";
import { obtenerEmpresa } from "../../lib/empresaCache.js";
import { TIPOS_TRAMITE, TIPOS_RESPUESTA, TIPOS_NOTIFICACION } from "../../lib/suiCausales.js";

export const pqrsRouter = Router();

const ESTADOS = ["radicada", "en_proceso", "resuelta", "cerrada"] as const;

const includeDetalle = {
  tercero: { select: { id: true, tipoDocumento: true, numeroDocumento: true, nombre: true, email: true, telefono: true } },
  suscriptor: { select: { id: true, codigo: true, nombre: true, direccion: true, barrioCat: { select: { nombre: true } } } },
};

// Para el detalle de una sola PQR (no el listado): además de tercero/suscriptor, el hilo completo
// de mensajes en orden cronológico.
const includeCompleto = {
  ...includeDetalle,
  mensajes: { orderBy: { createdAt: "asc" as const } },
};

// El funcionario puede anexar imágenes o documentos comunes a sus mensajes (no cualquier archivo:
// nada de ejecutables ni tipos sin identificar).
const TIPOS_ADJUNTO_PERMITIDOS = /^image\/|^application\/pdf$|^application\/msword$|^application\/vnd\.openxmlformats-officedocument\.|^application\/vnd\.ms-excel$/;
const uploadAdjuntos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => cb(null, TIPOS_ADJUNTO_PERMITIDOS.test(file.mimetype)),
});

// Sin responder primero (las más antiguas sin contestar arriba de todo, para que no se queden
// olvidadas), y luego las que ya tienen respuesta, con la resuelta más reciente primero. No es un
// solo ORDER BY de SQL porque cada mitad necesita una dirección distinta (ASC en un grupo, DESC en
// el otro) — con los volúmenes de PQR de este acueducto (decenas, no miles), ordenar en memoria
// después de traerlas es más simple que armar el SQL crudo equivalente.
function compararPqrs(a: { respuesta: string | null; createdAt: Date; respondidaEn: Date | null; updatedAt: Date }, b: typeof a): number {
  const aSinResponder = !a.respuesta;
  const bSinResponder = !b.respuesta;
  if (aSinResponder !== bSinResponder) return aSinResponder ? -1 : 1;
  if (aSinResponder) return a.createdAt.getTime() - b.createdAt.getTime();
  const fechaA = (a.respondidaEn ?? a.updatedAt).getTime();
  const fechaB = (b.respondidaEn ?? b.updatedAt).getTime();
  return fechaB - fechaA;
}

// Listado paginado — filtrable por estado, por texto (radicado, nombre, documento o NUID) y por
// rango de fecha de radicación.
pqrsRouter.get("/", async (req, res) => {
  const { estado, q, page, limit, fechaDesde, fechaHasta } = req.query;
  const filtros: any[] = [];
  if (estado) filtros.push({ estado: String(estado) });
  if (q) {
    const texto = String(q).trim();
    filtros.push({
      OR: [
        { numeroRadicado: { contains: texto, mode: "insensitive" as const } },
        { nombre: { contains: texto, mode: "insensitive" as const } },
        { documento: { contains: texto, mode: "insensitive" as const } },
        { suscriptor: { codigo: { contains: texto, mode: "insensitive" as const } } },
      ],
    });
  }
  if (fechaDesde) filtros.push({ createdAt: { gte: new Date(String(fechaDesde)) } });
  if (fechaHasta) {
    // "Hasta" incluye todo ese día — se suma un día y se compara con < en vez de <=, así una
    // fecha con hora (createdAt) igual no queda excluida por caer después de medianoche.
    const fin = new Date(String(fechaHasta));
    fin.setDate(fin.getDate() + 1);
    filtros.push({ createdAt: { lt: fin } });
  }
  const where = filtros.length ? { AND: filtros } : {};
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 15);
  const [todas, total] = await Promise.all([
    prisma.pqr.findMany({ where, include: includeDetalle }),
    prisma.pqr.count({ where }),
  ]);
  todas.sort(compararPqrs);
  const data = todas.slice((pageNum - 1) * limitNum, pageNum * limitNum);
  res.json({ data, total, page: pageNum, limit: limitNum });
});

// Conteo por estado, para las tarjetitas de resumen arriba del listado.
pqrsRouter.get("/resumen", async (_req, res) => {
  const grupos = await prisma.pqr.groupBy({ by: ["estado"], _count: { _all: true } });
  const cantidades = new Map(grupos.map((g) => [g.estado, g._count._all]));
  res.json(Object.fromEntries(ESTADOS.map((e) => [e, cantidades.get(e) ?? 0])));
});

// Catálogo de causales/tipos para los combos del panel interno. Los detalles de causal ahora
// viven en la tabla PqrCausal (editable desde Parametrización, ver rutas /causales más abajo) —
// acá se devuelven TODOS (activos e inactivos), a diferencia de GET /api/publico/pqrs/causales
// (solo activos), porque el staff clasificando una PQR antigua necesita poder ver/conservar un
// código ya desactivado, aunque no se le ofrezca para radicaciones nuevas.
pqrsRouter.get("/sui/causales", async (_req, res) => {
  const detalles = await prisma.pqrCausal.findMany({ orderBy: { codigo: "asc" } });
  res.json({ detalles, tiposTramite: TIPOS_TRAMITE, tiposRespuesta: TIPOS_RESPUESTA, tiposNotificacion: TIPOS_NOTIFICACION });
});

// Gestión del catálogo de causales (Parametrización) — separado de /sui/causales (que es la
// lectura combinada con las demás taxonomías) porque acá sí hay mutaciones.
pqrsRouter.post("/causales", async (req, res) => {
  const { codigo, grupo, detalle } = req.body;
  const codigoNum = Number(codigo);
  if (!Number.isInteger(codigoNum) || codigoNum <= 0) return res.status(400).json({ error: "El código debe ser un número entero positivo" });
  if (grupo !== "F" && grupo !== "P") return res.status(400).json({ error: 'Grupo inválido (debe ser "F" o "P")' });
  if (!detalle || !String(detalle).trim()) return res.status(400).json({ error: "El detalle es requerido" });

  try {
    const causal = await prisma.pqrCausal.create({
      data: { codigo: codigoNum, grupo, detalle: String(detalle).trim() },
    });
    res.status(201).json(causal);
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ya existe una causal con ese código" });
    throw err;
  }
});

pqrsRouter.put("/causales/:id", async (req, res) => {
  const { grupo, detalle, activo } = req.body;
  const id = Number(req.params.id);
  const causal = await prisma.pqrCausal.findUnique({ where: { id } });
  if (!causal) return res.status(404).json({ error: "No encontrada" });

  if (grupo !== undefined && grupo !== "F" && grupo !== "P") {
    return res.status(400).json({ error: 'Grupo inválido (debe ser "F" o "P")' });
  }
  if (detalle !== undefined && !String(detalle).trim()) {
    return res.status(400).json({ error: "El detalle no puede quedar vacío" });
  }

  const actualizada = await prisma.pqrCausal.update({
    where: { id },
    data: {
      grupo: grupo === undefined ? undefined : grupo,
      detalle: detalle === undefined ? undefined : String(detalle).trim(),
      activo: activo === undefined ? undefined : Boolean(activo),
    },
  });
  res.json(actualizada);
});

// Solo se puede borrar si ninguna PQR (histórica o actual) la tiene asignada — de lo contrario,
// desactivarla (PUT con activo:false) es la forma correcta de retirarla sin perder el histórico.
pqrsRouter.delete("/causales/:id", async (req, res) => {
  const id = Number(req.params.id);
  const causal = await prisma.pqrCausal.findUnique({ where: { id } });
  if (!causal) return res.status(404).json({ error: "No encontrada" });

  const enUso = await prisma.pqr.count({ where: { detalleCausal: causal.codigo } });
  if (enUso > 0) {
    return res.status(400).json({ error: "No se puede eliminar: hay PQR con esta causal asignada. Desactívala en su lugar." });
  }

  await prisma.pqrCausal.delete({ where: { id } });
  res.status(204).end();
});

// Configuración editable del módulo — hoy los tres encabezados que se anteponen a cada correo que
// le llega al ciudadano (radicación, respuesta/aclaración, cierre — ver lib/correo.ts). Fila única
// sembrada por la migración, así que siempre existe.
pqrsRouter.get("/configuracion", async (_req, res) => {
  const config = await prisma.pqrConfiguracion.findUnique({ where: { id: 1 } });
  res.json(config ?? { id: 1, encabezadoRadicacion: "", encabezadoRespuesta: "", encabezadoCierre: "" });
});

pqrsRouter.put("/configuracion", async (req, res) => {
  const { encabezadoRadicacion, encabezadoRespuesta, encabezadoCierre } = req.body;
  const datos = {
    encabezadoRadicacion: String(encabezadoRadicacion ?? ""),
    encabezadoRespuesta: String(encabezadoRespuesta ?? ""),
    encabezadoCierre: String(encabezadoCierre ?? ""),
  };
  const actualizada = await prisma.pqrConfiguracion.upsert({
    where: { id: 1 },
    create: { id: 1, ...datos },
    update: datos,
  });
  res.json(actualizada);
});

// Filtro compartido entre el listado paginado de trazabilidad y su CSV — solo mensajes del
// staff (autor: "staff"): quién respondió/aclaró cada PQR es lo que se audita acá, no los
// mensajes que escribió el ciudadano en el mismo hilo.
function filtrosTrazabilidad(query: any): any[] {
  const { fechaDesde, fechaHasta, funcionario } = query;
  const filtros: any[] = [{ autor: "staff" }];
  if (funcionario) filtros.push({ autorNombre: String(funcionario) });
  if (fechaDesde) filtros.push({ createdAt: { gte: new Date(String(fechaDesde)) } });
  if (fechaHasta) {
    const fin = new Date(String(fechaHasta));
    fin.setDate(fin.getDate() + 1);
    filtros.push({ createdAt: { lt: fin } });
  }
  return filtros;
}

// Quién respondió/aclaró cada PQR, con fecha y hora — para poder auditar la gestión del equipo
// sin tener que revisar PQR por PQR. "funcionarios" siempre trae la lista completa (sin aplicar
// los filtros de fecha/texto) para que el selector del filtro no se vaya reduciendo solo.
pqrsRouter.get("/trazabilidad", async (req, res) => {
  const where = { AND: filtrosTrazabilidad(req.query) };
  const pageNum = Math.max(1, Number(req.query.page) || 1);
  const limitNum = Math.max(1, Number(req.query.limit) || 20);

  const [total, data, funcionariosRaw] = await Promise.all([
    prisma.pqrMensaje.count({ where }),
    prisma.pqrMensaje.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      include: { pqr: { select: { numeroRadicado: true, nombre: true } } },
    }),
    prisma.pqrMensaje.findMany({
      where: { autor: "staff", autorNombre: { not: null } },
      distinct: ["autorNombre"],
      select: { autorNombre: true },
      orderBy: { autorNombre: "asc" },
    }),
  ]);

  res.json({
    data,
    total,
    page: pageNum,
    limit: limitNum,
    funcionarios: funcionariosRaw.map((f) => f.autorNombre).filter((n): n is string => Boolean(n)),
  });
});

pqrsRouter.get("/trazabilidad/reporte.csv", async (req, res) => {
  const mensajes = await prisma.pqrMensaje.findMany({
    where: { AND: filtrosTrazabilidad(req.query) },
    orderBy: { createdAt: "asc" },
    include: { pqr: { select: { numeroRadicado: true } } },
  });

  const encabezados = ["Radicado", "Funcionario", "Tipo", "Fecha", "Hora", "Mensaje"];
  const filas = mensajes.map((m) =>
    [
      m.pqr.numeroRadicado ?? "",
      m.autorNombre ?? "",
      m.esRespuestaFinal ? "Respuesta final" : "Aclaración",
      fechaLegibleColombia(m.createdAt),
      horaLegibleColombia(m.createdAt),
      m.texto,
    ]
      .map(csvEscapar)
      .join(",")
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="trazabilidad_pqr.csv"`);
  res.send([encabezados.join(","), ...filas].join("\n"));
});

// PQR que se deben incluir en el reporte de un período (mes): las radicadas o respondidas EN ese
// mes, más las que sigan pendientes de resolver de meses anteriores — tal como lo pide el
// Artículo Primero de la Resolución 20151300054575. No se filtra por clasificación acá: eso lo
// hace filaSuiOIncompleta() más abajo, para poder avisarle al staff cuáles faltan por clasificar
// en vez de simplemente omitirlas en silencio.
function wherePeriodo(inicio: Date, fin: Date) {
  return {
    OR: [
      { createdAt: { gte: inicio, lt: fin } },
      { respondidaEn: { gte: inicio, lt: fin } },
      { AND: [{ createdAt: { lt: inicio } }, { estado: { notIn: ["resuelta", "cerrada"] } }] },
    ],
  };
}

function rangoMes(anio: number, mes: number): [Date, Date] {
  // mes: 1-12. Sin ajuste de zona horaria a propósito (a diferencia de fechaColombia.ts): acá solo
  // importa el mes calendario del reporte, no la hora exacta del corte.
  const inicio = new Date(Date.UTC(anio, mes - 1, 1));
  const fin = new Date(Date.UTC(anio, mes, 1));
  return [inicio, fin];
}

// Una fila solo se puede reportar si tiene la clasificación completa: tipoTramite/causal/
// detalleCausal siempre, y si ya se respondió, también tipoRespuesta. Si sigue pendiente (sin
// respuesta), tipoRespuesta se asume 9 "Pendiente de respuesta" sin que el staff tenga que
// marcarlo a mano — es el estado por defecto de cualquier PQR sin contestar.
function estaCompleta(pqr: { tipoTramite: number | null; causal: string | null; detalleCausal: number | null; respuesta: string | null; tipoRespuesta: number | null }): boolean {
  if (!pqr.tipoTramite || !pqr.causal || !pqr.detalleCausal) return false;
  if (pqr.respuesta && !pqr.tipoRespuesta) return false;
  return true;
}

// Vista previa antes de descargar: cuántas PQR del período están listas para el reporte y cuántas
// le faltan datos (con su radicado, para que el staff sepa cuáles ir a clasificar).
pqrsRouter.get("/sui/resumen", async (req, res) => {
  const anio = Number(req.query.anio);
  const mes = Number(req.query.mes);
  if (!anio || !mes || mes < 1 || mes > 12) return res.status(400).json({ error: "anio y mes (1-12) son requeridos" });
  const [inicio, fin] = rangoMes(anio, mes);
  const pqrs = await prisma.pqr.findMany({
    where: wherePeriodo(inicio, fin),
    select: { id: true, numeroRadicado: true, tipoTramite: true, causal: true, detalleCausal: true, respuesta: true, tipoRespuesta: true },
  });
  const incompletas = pqrs.filter((p) => !estaCompleta(p));
  res.json({
    total: pqrs.length,
    listas: pqrs.length - incompletas.length,
    incompletas: incompletas.map((p) => ({ id: p.id, numeroRadicado: p.numeroRadicado })),
  });
});

function csvEscapar(valor: string | number | null | undefined): string {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

// Genera el archivo plano del "Formato A" (Anexo A, Resolución SSPD 20151300054575 de 2015,
// modificada por la 20188000076635 de 2018) para el período pedido — las 16 columnas en el orden
// exacto que exige el Anexo, con su fila de encabezado. Solo incluye filas completas (ver
// estaCompleta); las que falten se quedan fuera del archivo, no con columnas vacías, para no
// subir al SUI un dato a medias.
pqrsRouter.get("/sui/reporte.csv", async (req, res) => {
  const anio = Number(req.query.anio);
  const mes = Number(req.query.mes);
  if (!anio || !mes || mes < 1 || mes > 12) return res.status(400).json({ error: "anio y mes (1-12) son requeridos" });
  const [inicio, fin] = rangoMes(anio, mes);
  const [pqrs, empresa] = await Promise.all([
    prisma.pqr.findMany({
      where: wherePeriodo(inicio, fin),
      include: { suscriptor: { select: { codigo: true } } },
      orderBy: { createdAt: "asc" },
    }),
    obtenerEmpresa(),
  ]);

  // Encabezado de las 16 columnas del Anexo A, en el mismo orden que exige la Resolución —
  // el Anexo se sube como archivo plano (no valida el texto del encabezado en sí, solo la
  // posición de cada columna), pero traerlo ya rotulado evita adivinar el orden a ojo si alguien
  // lo abre en Excel antes de subirlo al SUI.
  const encabezados = [
    "Código Departamento",
    "Código Municipio",
    "Código Centro Poblado",
    "Radicado Recibido",
    "Fecha Radicación",
    "Tipo de Trámite",
    "Causal",
    "Detalle de Causal",
    "Número de Cuenta",
    "Número o Identificador de Factura",
    "Tipo Respuesta",
    "Fecha Respuesta",
    "Radicado Respuesta",
    "Fecha Notificación o Ejecución",
    "Tipo de Notificación",
    "Fecha Traslado a la SSPD",
  ];

  const filas = pqrs
    .filter(estaCompleta)
    .map((p) => {
      const pendiente = !p.respuesta;
      const tipoRespuesta = pendiente ? 9 : p.tipoRespuesta!;
      const esPendienteOSinRespuesta = tipoRespuesta === 9 || tipoRespuesta === 10;
      return [
        empresa.daneDepartamento,
        empresa.daneMunicipio,
        empresa.daneCentroPoblado,
        p.numeroRadicado ?? "",
        fechaLegibleColombia(p.createdAt).replace(/\//g, "-"),
        p.tipoTramite,
        p.causal,
        p.detalleCausal,
        p.suscriptor?.codigo || "0000",
        "N", // Número o identificador de factura: no hay vínculo a una factura puntual todavía.
        tipoRespuesta,
        esPendienteOSinRespuesta || !p.respondidaEn ? "" : fechaLegibleColombia(p.respondidaEn).replace(/\//g, "-"),
        esPendienteOSinRespuesta ? "" : p.numeroRadicado ?? "",
        esPendienteOSinRespuesta || !p.respondidaEn ? "" : fechaLegibleColombia(p.respondidaEn).replace(/\//g, "-"),
        // Solo el código 3 "No aplica" es válido junto con 9/10 (ver Parágrafo del numeral 15 del
        // Anexo) — de resto, se usa lo que haya clasificado el staff o 4 "Notificación por aviso"
        // por defecto (las respuestas se avisan por correo, no personalmente ni por edicto).
        esPendienteOSinRespuesta ? 3 : p.tipoNotificacion ?? 4,
        p.fechaTrasladoSspd ? fechaLegibleColombia(p.fechaTrasladoSspd).replace(/\//g, "-") : "",
      ]
        .map(csvEscapar)
        .join(",");
    });

  const nombreArchivo = `sui_pqr_${anio}${String(mes).padStart(2, "0")}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
  res.send([encabezados.map(csvEscapar).join(","), ...filas].join("\n"));
});

pqrsRouter.get("/:id", async (req, res) => {
  const pqr = await prisma.pqr.findUnique({ where: { id: Number(req.params.id) }, include: includeCompleto });
  if (!pqr) return res.status(404).json({ error: "No encontrada" });
  res.json(pqr);
});

// Misma constancia imprimible que la pública (ver routes/publico/pqrs.ts), disponible acá para
// que el funcionario la pueda descargar/imprimir directo desde el panel sin salir a la web
// pública — útil al radicar una PQR verbal para entregarle el comprobante ahí mismo.
pqrsRouter.get("/:id/constancia.pdf", async (req, res) => {
  const pqr = await prisma.pqr.findUnique({
    where: { id: Number(req.params.id) },
    include: { suscriptor: { select: { codigo: true, direccion: true, barrioCat: { select: { nombre: true } } } } },
  });
  if (!pqr) return res.status(404).json({ error: "No encontrada" });
  await generarConstanciaPqrPdf(res, pqr);
});

pqrsRouter.put("/:id/estado", async (req, res) => {
  const { estado } = req.body;
  if (!ESTADOS.includes(estado)) return res.status(400).json({ error: `estado inválido (${ESTADOS.join(", ")})` });
  const id = Number(req.params.id);
  const existente = await prisma.pqr.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: "No encontrada" });
  const actualizada = await prisma.pqr.update({ where: { id }, data: { estado }, include: includeCompleto });
  res.json(actualizada);
});

// Clasificación para el reporte SUI (tipoTramite/causal/detalleCausal) — aparte de estado/
// respuesta porque la asigna el staff con criterio propio, sin que dependa de si ya se respondió.
pqrsRouter.put("/:id/clasificacion", async (req, res) => {
  const { tipoTramite, causal, detalleCausal, fechaTrasladoSspd } = req.body;
  const id = Number(req.params.id);
  const existente = await prisma.pqr.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: "No encontrada" });

  if (tipoTramite !== undefined && tipoTramite !== null && !TIPOS_TRAMITE[Number(tipoTramite)]) {
    return res.status(400).json({ error: "Tipo de trámite inválido" });
  }
  if (causal !== undefined && causal !== null && causal !== "F" && causal !== "P") {
    return res.status(400).json({ error: 'Causal inválida (debe ser "F" o "P")' });
  }
  if (detalleCausal !== undefined && detalleCausal !== null) {
    const detalle = await prisma.pqrCausal.findUnique({ where: { codigo: Number(detalleCausal) } });
    if (!detalle) return res.status(400).json({ error: "Detalle de causal inválido" });
    if (causal && detalle.grupo !== causal) {
      return res.status(400).json({ error: `El detalle "${detalle.detalle}" pertenece al grupo ${detalle.grupo}, no a ${causal}` });
    }
  }

  const actualizada = await prisma.pqr.update({
    where: { id },
    data: {
      tipoTramite: tipoTramite === undefined ? undefined : tipoTramite === null ? null : Number(tipoTramite),
      causal: causal === undefined ? undefined : causal,
      detalleCausal: detalleCausal === undefined ? undefined : detalleCausal === null ? null : Number(detalleCausal),
      fechaTrasladoSspd: fechaTrasladoSspd === undefined ? undefined : fechaTrasladoSspd ? new Date(fechaTrasladoSspd) : null,
    },
    include: includeCompleto,
  });
  res.json(actualizada);
});

// Nuevo mensaje del funcionario en el hilo — puede ser solo una aclaración (esRespuestaFinal
// false: el caso sigue abierto, se le avisa al ciudadano que hay novedades y puede seguir
// escribiendo) o la respuesta oficial que cierra el caso para el SUI (esRespuestaFinal true: pide
// tipoRespuesta/tipoNotificacion, y ahí sí se guardan como la respuesta "oficial" en la propia
// Pqr — ver lib/suiCausales.ts). El funcionario decide cuándo marcarla así: puede ser el primer
// mensaje, o uno posterior tras varias rondas, incluso para dejar constancia de que el ciudadano
// respondió por otro medio (llamada, en persona, etc).
pqrsRouter.post("/:id/mensajes", uploadAdjuntos.array("archivos", 5), async (req, res) => {
  const { texto } = req.body;
  const esFinal = req.body.esRespuestaFinal === "true" || req.body.esRespuestaFinal === true;
  if (!texto || !String(texto).trim()) return res.status(400).json({ error: "El mensaje no puede estar vacío" });
  const id = Number(req.params.id);
  const existente = await prisma.pqr.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: "No encontrada" });

  const tipoRespuesta = req.body.tipoRespuesta;
  const tipoNotificacion = req.body.tipoNotificacion;
  if (esFinal) {
    if (!tipoRespuesta || !TIPOS_RESPUESTA[Number(tipoRespuesta)]) {
      return res.status(400).json({ error: "Tipo de respuesta inválido" });
    }
    if (!tipoNotificacion || !TIPOS_NOTIFICACION[Number(tipoNotificacion)]) {
      return res.status(400).json({ error: "Tipo de notificación inválido" });
    }
  }

  const archivos = (req.files as Express.Multer.File[] | undefined) ?? [];
  const rutas = await Promise.all(archivos.map((f) => guardarArchivo("pqrs", f.buffer, f.originalname, f.mimetype)));
  const autor = req.usuario ? await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { nombre: true } }) : null;
  const textoLimpio = String(texto).trim();

  await prisma.pqrMensaje.create({
    data: { pqrId: id, autor: "staff", autorNombre: autor?.nombre, texto: textoLimpio, archivos: rutas, esRespuestaFinal: esFinal },
  });

  // Solo "radicada" sube a "en_proceso" automáticamente con un mensaje que no cierra el caso — si
  // ya estaba en_proceso, resuelta o cerrada, un mensaje de más no le cambia el estado por su
  // cuenta (eso lo decide el funcionario a mano, o al marcar esRespuestaFinal más abajo).
  const nuevoEstado = esFinal
    ? existente.estado === "cerrada"
      ? existente.estado
      : "resuelta"
    : existente.estado === "radicada"
      ? "en_proceso"
      : existente.estado;

  const actualizada = await prisma.pqr.update({
    where: { id },
    data: {
      estado: nuevoEstado,
      ...(esFinal
        ? {
            respuesta: textoLimpio,
            respondidaEn: new Date(),
            tipoRespuesta: Number(tipoRespuesta),
            tipoNotificacion: Number(tipoNotificacion),
          }
        : {}),
    },
    include: includeCompleto,
  });

  if (esFinal) {
    enviarCorreoPqrRespondida(actualizada).catch((err) => logger.error({ err }, "No se pudo enviar el correo de PQR respondida"));
  } else {
    enviarCorreoPqrMensaje({ ...actualizada, mensaje: textoLimpio }).catch((err) => logger.error({ err }, "No se pudo enviar el correo del mensaje"));
  }
  res.status(201).json(actualizada);
});
