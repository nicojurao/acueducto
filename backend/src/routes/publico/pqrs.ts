import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { prisma } from "../../lib/prisma.js";
import { guardarArchivo, leerArchivo } from "../../lib/storage.js";
import { enviarCorreoPqrCreada, enviarCorreoPqrMensajeCiudadano } from "../../lib/correo.js";
import { generarConstanciaPqrPdf, generarConstanciaPqrBuffer } from "../../lib/pqrConstancia.js";
import { logger } from "../../lib/logger.js";
import { fechaArchivoColombia } from "../../lib/fechaColombia.js";
import { GRUPOS_CAUSAL_CIUDADANO } from "../../lib/suiCausales.js";

// PQRS pública: a diferencia de TODO lo demás en el backend, esto NO pasa por requireAuth — lo
// monta index.ts antes de esa línea a propósito, para que cualquiera desde pqrs.acbum.com.co
// pueda radicar sin cuenta ni sesión. Por eso cada ruta acá tiene su propio límite de tasa (no
// hay req.usuario para repartir el cupo por persona, como sí pasa en limiteApi.ts).
export const pqrsPublicoRouter = Router();

// Búsqueda de un Tercero por cédula: 20 consultas cada 15 min por IP — generoso para que alguien
// se equivoque tecleando un par de veces, pero frena un barrido automatizado probando cédulas al
// azar (el número de documento no es secreto, pero tampoco hay que ponérselo fácil a un scraper).
const limiteBusqueda = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas búsquedas. Espera unos minutos e intenta de nuevo." },
});

// Radicar una PQR: 5 por hora por IP — suficiente para una persona con varios casos reales el
// mismo día, pero frena un bot mandando formularios en loop (cada uno sube fotos a MinIO).
const limiteRadicar = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Se alcanzó el límite de PQR radicadas desde este dispositivo. Intenta más tarde." },
});

// Consulta de estado por radicado o por documento: mismo límite generoso que buscar-tercero, es
// la misma clase de operación (lectura pública, ninguno de los dos datos es secreto pero no hay
// que ponérselo fácil a un barrido automatizado).
const limiteConsultar = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas consultas. Espera unos minutos e intenta de nuevo." },
});

const uploadFotos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
});

// Responder en el hilo de una PQR ya radicada: 10 por hora por IP — un poco más generoso que
// radicar, porque una conversación de ida y vuelta puede necesitar varios mensajes el mismo día.
const limiteResponderMensaje = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados mensajes desde este dispositivo. Espera un momento e intenta de nuevo." },
});

// Trae el Tercero (si existe) con TODO lo que se le pueda mostrar a quien radica, más sus
// suscriptores (para elegir a cuál NUID aplica la PQR, si aplica a alguno en particular).
pqrsPublicoRouter.get("/buscar-tercero", limiteBusqueda, async (req, res) => {
  const documento = String(req.query.documento ?? "").trim();
  if (!documento) return res.status(400).json({ error: "El número de documento es requerido" });

  const tercero = await prisma.tercero.findUnique({
    where: { numeroDocumento: documento },
    include: {
      suscriptores: {
        select: { id: true, codigo: true, nombre: true, direccion: true, ruta: true, barrioCat: { select: { nombre: true } } },
      },
    },
  });
  if (!tercero || tercero.numeroDocumento?.startsWith("PEND-")) {
    return res.status(404).json({ error: "No se encontró ningún registro con ese documento" });
  }
  res.json(tercero);
});

// Catálogo para el selector opcional "¿cuál describe mejor tu caso?" del formulario de radicar —
// grupos en lenguaje llano (ver lib/suiCausales.ts) y, si el ciudadano quiere afinar más, el
// detalle exacto de cada uno (solo los activos: uno desactivado desde Parametrización deja de
// ofrecerse acá, aunque siga preservado en el histórico de quien ya lo tenía asignado).
pqrsPublicoRouter.get("/causales", async (_req, res) => {
  const detalles = await prisma.pqrCausal.findMany({ where: { activo: true }, orderBy: { codigo: "asc" } });
  res.json({ grupos: GRUPOS_CAUSAL_CIUDADANO, detalles });
});

// Fecha (hora Colombia) + consecutivo del día: PQR-202609071, PQR-202609072... la segunda del
// mismo día. Nota: esto SÍ se puede barrer probando 1, 2, 3... por cada fecha (el usuario lo pidió
// así a propósito, priorizando que se vea organizado/legible por encima de eso).
async function generarNumeroRadicado(): Promise<string> {
  const hoy = fechaArchivoColombia(); // "2026-09-07"
  const inicioDia = new Date(`${hoy}T05:00:00.000Z`); // medianoche en Bogotá (UTC-5, sin horario de verano)
  const finDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000);
  const cantidadHoy = await prisma.pqr.count({ where: { createdAt: { gte: inicioDia, lt: finDia } } });
  return `PQR-${hoy.replace(/-/g, "")}${cantidadHoy + 1}`;
}

pqrsPublicoRouter.post("/", limiteRadicar, uploadFotos.array("fotos", 5), async (req, res) => {
  const { nombre, documento, email, telefono, descripcion, suscriptorId, causal, detalleCausal } = req.body;
  if (!nombre?.trim() || !email?.trim() || !telefono?.trim() || !descripcion?.trim()) {
    return res.status(400).json({ error: "Nombre, correo, celular y descripción son requeridos" });
  }

  // El ciudadano puede sugerir de una vez la clasificación (opcional, ver /causales) — se guarda
  // tal cual, y el staff la confirma o corrige al atenderla; no es vinculante como sí lo es cuando
  // el staff mismo la asigna desde el panel interno (PUT /:id/clasificacion).
  let causalValida: "F" | "P" | undefined;
  let detalleCausalValido: number | undefined;
  if (detalleCausal) {
    const detalle = await prisma.pqrCausal.findUnique({ where: { codigo: Number(detalleCausal) } });
    if (detalle) {
      detalleCausalValido = detalle.codigo;
      causalValida = detalle.grupo as "F" | "P";
    }
  } else if (causal === "F" || causal === "P") {
    causalValida = causal;
  }

  // Si el documento coincide con un Tercero ya registrado, la PQR queda enlazada a él Y se le
  // actualiza el correo/celular con los que acaba de escribir — a propósito: son los datos de
  // contacto más recientes que la persona misma acaba de confirmar, mejor que lo que hubiera
  // quedado desde una carga histórica o un dato viejo.
  let terceroId: number | undefined;
  if (documento?.trim()) {
    const tercero = await prisma.tercero.findUnique({ where: { numeroDocumento: documento.trim() } });
    if (tercero) {
      terceroId = tercero.id;
      await prisma.tercero.update({ where: { id: tercero.id }, data: { email: email.trim(), telefono: telefono.trim() } });
    }
  }

  const suscriptorIdNum = suscriptorId ? Number(suscriptorId) : undefined;
  if (suscriptorIdNum) {
    const existe = await prisma.suscriptor.findUnique({ where: { id: suscriptorIdNum } });
    if (!existe) return res.status(400).json({ error: "El suscriptor indicado no existe" });
  }

  const archivos = (req.files as Express.Multer.File[] | undefined) ?? [];
  const fotos = await Promise.all(
    archivos.map((f) => guardarArchivo("pqrs", f.buffer, f.originalname, f.mimetype))
  );

  // Reintenta si dos radicaciones caen en el mismo instante y ambas calculan el mismo consecutivo
  // del día — recalcula el conteo (ya con la otra fila insertada) y prueba con el siguiente número.
  let creada;
  for (let intento = 0; ; intento++) {
    try {
      creada = await prisma.pqr.create({
        data: {
          numeroRadicado: await generarNumeroRadicado(),
          terceroId,
          suscriptorId: suscriptorIdNum,
          nombre: nombre.trim(),
          documento: documento?.trim() || null,
          email: email.trim(),
          telefono: telefono.trim(),
          descripcion: descripcion.trim(),
          fotos,
          causal: causalValida,
          detalleCausal: detalleCausalValido,
        },
        include: { suscriptor: { select: { codigo: true, direccion: true, barrioCat: { select: { nombre: true } } } } },
      });
      break;
    } catch (err: any) {
      if (err?.code === "P2002" && intento < 5) continue;
      throw err;
    }
  }

  // Fire-and-forget: si el correo falla (SMTP mal configurado, proveedor caído) no debe tumbar
  // la radicación, que ya quedó guardada — solo se registra el error en el log. La constancia se
  // genera acá mismo (no dentro de correo.ts, para no crear un import circular con este archivo)
  // y si falla por lo que sea, el correo igual se manda, solo que sin el adjunto.
  generarConstanciaPqrBuffer(creada)
    .catch((err) => {
      logger.error({ err }, "No se pudo generar la constancia en PDF para adjuntar al correo de radicación");
      return undefined;
    })
    .then((constanciaPdf) => enviarCorreoPqrCreada(creada, constanciaPdf))
    .catch((err) => logger.error({ err }, "No se pudo enviar el correo de PQR creada"));

  res.status(201).json({ numeroRadicado: creada.numeroRadicado });
});

// Constancia imprimible (PDF) de la radicación — útil sobre todo cuando alguien radica su PQR de
// forma verbal (en persona o por teléfono) y el funcionario la registra por él/ella desde este
// mismo formulario público: con esto se le puede entregar un comprobante físico. Mismo modelo de
// acceso que /consultar: sin sesión, alcanza con conocer el radicado.
//
// La URL termina en "/<radicado>.pdf" (no "/constancia.pdf") a propósito: cuando el navegador
// sugiere un nombre de archivo al guardar un PDF que se muestra inline, en varios casos usa el
// último segmento de la URL en vez del "filename" del header Content-Disposition — con la ruta
// vieja, eso hacía que todas las constancias se guardaran literalmente como "constancia.pdf".
pqrsPublicoRouter.get("/constancia/:archivo", limiteConsultar, async (req, res) => {
  const radicadoCrudo = req.params.archivo.replace(/\.pdf$/i, "");
  const compacto = radicadoCrudo.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const radicado = compacto.startsWith("PQR") ? `PQR-${compacto.slice(3)}` : radicadoCrudo;
  const pqr = await prisma.pqr.findUnique({
    where: { numeroRadicado: radicado },
    include: { suscriptor: { select: { codigo: true, direccion: true, barrioCat: { select: { nombre: true } } } } },
  });
  if (!pqr) return res.status(404).json({ error: "No se encontró esa PQR" });
  await generarConstanciaPqrPdf(res, pqr);
});

// Campos que se le pueden mostrar a quien consulta sin sesión: nada de datos de contacto ni
// fotos, solo lo necesario para hacerle seguimiento a su propio caso. "documento" SÍ se trae acá
// pero solo para calcular tieneDocumento en mapConsulta() — nunca sale tal cual en la respuesta.
const seleccionConsulta = {
  numeroRadicado: true,
  nombre: true,
  estado: true,
  descripcion: true,
  respuesta: true,
  documento: true,
  createdAt: true,
  updatedAt: true,
  mensajes: {
    select: { autor: true, autorNombre: true, texto: true, archivos: true, esRespuestaFinal: true, createdAt: true },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

// Los archivos del hilo (fotos del funcionario o del ciudadano) viven en MinIO bajo /uploads/pqrs/
// — esa ruta exige sesión (requireAuthQuery), así que acá se reescribe a GET /adjuntos/:archivo
// (más abajo), que sirve lo mismo sin login. Poder verlas es parte de poder seguir la PQR.
function mapConsulta(pqr: {
  documento: string | null;
  mensajes: { autor: string; autorNombre: string | null; texto: string; archivos: string[]; esRespuestaFinal: boolean; createdAt: Date }[];
  [clave: string]: unknown;
}) {
  const { documento, mensajes, ...resto } = pqr;
  return {
    ...resto,
    tieneDocumento: Boolean(documento),
    mensajes: mensajes.map((m) => ({ ...m, archivos: m.archivos.map((ruta) => ruta.replace(/^\/uploads\/pqrs\//, "/api/publico/pqrs/adjuntos/")) })),
  };
}

// Consulta de estado: por número de radicado (un solo resultado) o por documento (todas las
// PQR que esa persona ha radicado, más reciente primero).
pqrsPublicoRouter.get("/consultar", limiteConsultar, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.status(400).json({ error: "Escribe un número de radicado o de documento" });

  // Se ignoran espacios/guiones al comparar y se vuelve a armar con el guion en su lugar — así
  // funciona igual si la persona lo escribe, pega o lee por teléfono sin el guion exacto.
  const compacto = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compacto.startsWith("PQR")) {
    const radicado = `PQR-${compacto.slice(3)}`;
    const pqr = await prisma.pqr.findUnique({ where: { numeroRadicado: radicado }, select: seleccionConsulta });
    return res.json(pqr ? [mapConsulta(pqr)] : []);
  }

  const pqrs = await prisma.pqr.findMany({
    where: { documento: q },
    select: seleccionConsulta,
    orderBy: { createdAt: "desc" },
  });
  res.json(pqrs.map(mapConsulta));
});

// El ciudadano responde en el hilo de su propia PQR — como no tiene cuenta, se le pide su número
// de documento y se valida contra el que quedó guardado al radicar (si radicó sin dar documento,
// no hay con qué validar, así que no puede usar esto — solo consultar de solo lectura).
pqrsPublicoRouter.post("/:radicado/mensajes", limiteResponderMensaje, uploadFotos.array("archivos", 5), async (req, res) => {
  const { documento, texto } = req.body;
  if (!texto || !String(texto).trim()) return res.status(400).json({ error: "El mensaje no puede estar vacío" });
  if (!documento || !String(documento).trim()) {
    return res.status(400).json({ error: "Escribe tu número de documento para confirmar que eres tú" });
  }

  const compacto = req.params.radicado.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const radicado = compacto.startsWith("PQR") ? `PQR-${compacto.slice(3)}` : req.params.radicado;
  const pqr = await prisma.pqr.findUnique({ where: { numeroRadicado: radicado } });
  if (!pqr) return res.status(404).json({ error: "No se encontró esa PQR" });
  if (!pqr.documento || pqr.documento !== String(documento).trim()) {
    return res.status(403).json({ error: "El número de documento no coincide con el de esta PQR" });
  }

  const archivos = (req.files as Express.Multer.File[] | undefined) ?? [];
  const rutas = await Promise.all(archivos.map((f) => guardarArchivo("pqrs", f.buffer, f.originalname, f.mimetype)));
  const textoLimpio = String(texto).trim();

  await prisma.pqrMensaje.create({
    data: { pqrId: pqr.id, autor: "ciudadano", autorNombre: pqr.nombre, texto: textoLimpio, archivos: rutas },
  });

  enviarCorreoPqrMensajeCiudadano({ ...pqr, mensaje: textoLimpio }).catch((err) =>
    logger.error({ err }, "No se pudo enviar el aviso de mensaje del ciudadano")
  );

  const actualizada = await prisma.pqr.findUnique({ where: { id: pqr.id }, select: seleccionConsulta });
  res.status(201).json(mapConsulta(actualizada!));
});

// Sirve los archivos adjuntos del hilo de PQRS sin necesitar sesión (a diferencia de /uploads/*,
// que sí la exige) — quien tiene el link ya demostró que conoce el radicado o el documento
// correspondiente, mismo modelo de acceso que el resto de esta consulta pública.
pqrsPublicoRouter.get("/adjuntos/:archivo", limiteConsultar, async (req, res) => {
  try {
    const { stream, size, contentType } = await leerArchivo(`/uploads/pqrs/${req.params.archivo}`);
    res.setHeader("Content-Type", contentType ?? "application/octet-stream");
    res.setHeader("Content-Length", String(size));
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    stream.on("error", () => res.status(404).end());
    stream.pipe(res);
  } catch {
    res.status(404).json({ error: "Archivo no encontrado" });
  }
});
