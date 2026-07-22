import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { guardarArchivo, borrarArchivo } from "../lib/storage.js";

export const actasRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
});

// El PDF/imagen del acta ya firmada a mano no tiene por qué ser una foto (mimetype restringido
// arriba a "image/*"); acepta también PDF, sin límite de tipo.
const uploadDocumento = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function subirFotos(archivos: Express.Multer.File[]): Promise<string[]> {
  return Promise.all(archivos.map((f) => guardarArchivo("actas", f.buffer, f.originalname, f.mimetype)));
}

// Lista liviana de usuarios activos para el selector de "Instalado por" (reemplaza el texto
// libre de antes, que no validaba nada contra quién trabaja de verdad en la empresa). Cualquiera
// que pueda crear una acta puede ver esta lista, aunque no tenga el permiso "usuarios" completo.
actasRouter.get("/instaladores", async (_req, res) => {
  const usuarios = await prisma.usuario.findMany({
    where: { activo: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
  res.json(usuarios);
});

// El formulario elige "instaladoPor" de un combobox de usuarios activos y manda el usuarioId
// del seleccionado directo; si no viene (o viene inválido), se intenta enlazar por nombre exacto
// como respaldo. Las actas antiguas (creadas antes de que existiera esta FK) se quedan sin
// enlazar a propósito — no se adivina el vínculo con un backfill automático.
//
// "instaladoPor" YA NO es un snapshot congelado: si se resuelve un usuarioId real, el texto se
// pisa siempre con el nombre ACTUAL de ese usuario (usuario.nombre), para que renombrar a alguien
// no deje actas viejas mostrando "usuario inactivo/eliminado" solo porque el texto guardado no
// coincide con el nombre nuevo — la relación por ID manda, el texto es solo un espejo de eso.
async function resolverInstalador(usuarioIdBody: unknown, nombre: string): Promise<{ usuarioId: number | null; instaladoPor: string }> {
  if (usuarioIdBody) {
    const usuario = await prisma.usuario.findUnique({ where: { id: Number(usuarioIdBody) }, select: { id: true, nombre: true } });
    if (usuario) return { usuarioId: usuario.id, instaladoPor: usuario.nombre };
  }
  const usuario = await prisma.usuario.findFirst({ where: { nombre, activo: true }, select: { id: true, nombre: true } });
  if (usuario) return { usuarioId: usuario.id, instaladoPor: usuario.nombre };
  return { usuarioId: null, instaladoPor: nombre };
}

// ?suscriptorId= trae el historial completo de ese suscriptor (incluye actas con fechaRetiro,
// es decir medidores que ya no tiene asignados — el medidor.suscriptorId actual puede ser
// distinto o null, por eso esto NO se puede sacar solo de suscriptor.medidores).
actasRouter.get("/", async (req, res) => {
  const { suscriptorId } = req.query;
  const actas = await prisma.actaInstalacion.findMany({
    where: suscriptorId ? { suscriptorId: Number(suscriptorId) } : undefined,
    include: {
      suscriptor: true,
      medidor: { include: { marcaCat: true, modeloCat: true, diametroCat: true } },
      usuario: { select: { id: true, nombre: true, activo: true } },
    },
    orderBy: { id: "desc" },
  });
  res.json(actas);
});

actasRouter.get("/:id", async (req, res) => {
  const acta = await prisma.actaInstalacion.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      suscriptor: true,
      medidor: { include: { marcaCat: true, modeloCat: true, diametroCat: true } },
      usuario: { select: { id: true, nombre: true, activo: true } },
    },
  });
  if (!acta) return res.status(404).json({ error: "No encontrada" });
  res.json(acta);
});

actasRouter.post("/", upload.array("fotos", 10), async (req, res) => {
  const { medidorId, suscriptorId, fechaInstalacion, instaladoPor, usuarioId, observaciones } = req.body;
  if (!medidorId || !suscriptorId || !fechaInstalacion || !instaladoPor) {
    return res.status(400).json({ error: "medidorId, suscriptorId, fechaInstalacion e instaladoPor son requeridos" });
  }

  const medidor = await prisma.medidor.findUnique({ where: { id: Number(medidorId) } });
  if (!medidor) return res.status(404).json({ error: "Medidor no encontrado" });
  if (!medidor.serial) return res.status(400).json({ error: "El medidor no tiene serial registrado" });

  const suscriptorDestino = await prisma.suscriptor.findUnique({ where: { id: Number(suscriptorId) } });
  if (!suscriptorDestino) return res.status(404).json({ error: "Suscriptor no encontrado" });
  if (suscriptorDestino.estadoPredio === "inactivo") {
    return res.status(400).json({ error: "No se puede instalar un medidor en un predio inactivo" });
  }

  const archivos = (req.files as Express.Multer.File[] | undefined) ?? [];
  const fotos = await subirFotos(archivos);

  // Si el suscriptor ya tenía un medidor activo, este nuevo lo reemplaza:
  // el anterior queda marcado como inactivo (histórico) pero conserva sus lecturas.
  await prisma.medidor.updateMany({
    where: { suscriptorId: Number(suscriptorId), activo: true, id: { not: Number(medidorId) } },
    data: { activo: false },
  });

  const instalador = await resolverInstalador(usuarioId, instaladoPor);
  const acta = await prisma.actaInstalacion.create({
    data: {
      medidorId: Number(medidorId),
      suscriptorId: Number(suscriptorId),
      serial: medidor.serial,
      fechaInstalacion: new Date(fechaInstalacion),
      instaladoPor: instalador.instaladoPor,
      usuarioId: instalador.usuarioId,
      observaciones: observaciones || null,
      fotos,
    },
  });

  await prisma.medidor.update({
    where: { id: Number(medidorId) },
    data: {
      suscriptorId: Number(suscriptorId),
      estado: "instalado",
      activo: true,
      fechaInstalacion: new Date(fechaInstalacion),
    },
  });

  // Una instalación nueva mueve al suscriptor a "instalado_prueba" salvo que ya estuviera en un
  // estado más avanzado (facturando, o inactivo/dañado) — un reemplazo de medidor no reinicia
  // ese proceso ni resucita un predio que se marcó inactivo a propósito.
  if (!["facturando", "inactivo"].includes(suscriptorDestino.estadoFacturacion)) {
    await prisma.suscriptor.update({
      where: { id: Number(suscriptorId) },
      data: { estadoFacturacion: "instalado_prueba" },
    });
  }

  res.status(201).json(acta);
});

actasRouter.put("/:id", upload.array("fotos", 10), async (req, res) => {
  const acta = await prisma.actaInstalacion.findUnique({ where: { id: Number(req.params.id) } });
  if (!acta) return res.status(404).json({ error: "No encontrada" });

  const { fechaInstalacion, instaladoPor, usuarioId, observaciones, fotosARemover, fechaRetiro } = req.body;
  if (!fechaInstalacion || !instaladoPor) {
    return res.status(400).json({ error: "fechaInstalacion e instaladoPor son requeridos" });
  }

  const aRemover: string[] = fotosARemover
    ? Array.isArray(fotosARemover)
      ? fotosARemover
      : [fotosARemover]
    : [];

  const archivos = (req.files as Express.Multer.File[] | undefined) ?? [];
  const fotosNuevas = await subirFotos(archivos);
  const fotosFinales = [...acta.fotos.filter((f) => !aRemover.includes(f)), ...fotosNuevas];

  // fechaRetiro solo se envía al editar el historial de un medidor retirado (corregir la fecha
  // de retiro); si no viene en el body, no se toca (no es una forma de "reactivar" el medidor).
  const instalador = await resolverInstalador(usuarioId, instaladoPor);
  const actaActualizada = await prisma.actaInstalacion.update({
    where: { id: acta.id },
    data: {
      fechaInstalacion: new Date(fechaInstalacion),
      instaladoPor: instalador.instaladoPor,
      usuarioId: instalador.usuarioId,
      observaciones: observaciones || null,
      fotos: fotosFinales,
      fechaRetiro: fechaRetiro !== undefined ? new Date(fechaRetiro) : undefined,
    },
  });

  await Promise.all(aRemover.map((foto) => borrarArchivo(foto)));

  await prisma.medidor.update({
    where: { id: acta.medidorId },
    data: { fechaInstalacion: new Date(fechaInstalacion) },
  });

  res.json(actaActualizada);
});

// "Quitar" el medidor de un suscriptor NO borra el historial: la acta se conserva (con
// fechaRetiro) para que quede registro de que este suscriptor tuvo este medidor instalado
// hasta esta fecha — antes se borraba la acta entera y esa historia se perdía. El medidor
// vuelve a bodega; si quedó dañado, márcalo aparte desde Inventario (condicion).
actasRouter.delete("/:id", async (req, res) => {
  const acta = await prisma.actaInstalacion.findUnique({ where: { id: Number(req.params.id) } });
  if (!acta) return res.status(404).json({ error: "No encontrada" });

  await prisma.medidor.update({
    where: { id: acta.medidorId },
    data: { suscriptorId: null, estado: "en_bodega" },
  });
  await prisma.actaInstalacion.update({
    where: { id: acta.id },
    data: { fechaRetiro: new Date() },
  });

  // Sin medidor asignado, el suscriptor vuelve a facturación por aforo.
  await prisma.suscriptor.update({
    where: { id: acta.suscriptorId },
    data: { estadoFacturacion: "sin_medidor" },
  });

  res.status(204).end();
});

// Borrado DEFINITIVO de un acta (a diferencia de DELETE /:id de arriba, que "quita" el medidor
// pero conserva el acta como historial con fechaRetiro). Esto es para corregir un error real de
// asignación — ej. se le puso el medidor equivocado a un suscriptor por accidente — donde no
// tiene sentido dejar ese registro dando vueltas en el historial. Como este DELETE cae bajo
// requirePermisoVerAvanzado("actas_ver", "actas_avanzado") en index.ts, solo lo puede hacer
// quien tenga "actas_avanzado" (hoy: admin y Coordinador Operativo) — quien solo tenga
// "actas_ver" puede ver el historial pero no borrarlo.
actasRouter.delete("/:id/definitivo", async (req, res) => {
  const acta = await prisma.actaInstalacion.findUnique({ where: { id: Number(req.params.id) } });
  if (!acta) return res.status(404).json({ error: "No encontrada" });

  await Promise.all(acta.fotos.map((foto) => borrarArchivo(foto)));
  if (acta.actaFirmadaUrl) await borrarArchivo(acta.actaFirmadaUrl);

  // Si esta acta todavía representa la asignación activa (nunca se "quitó" y el medidor sigue
  // apuntando a este mismo suscriptor), hay que revertir ese estado igual que haría un "quitar"
  // normal — si no, el medidor queda con suscriptorId puesto pero sin ningún acta que lo respalde.
  const medidor = await prisma.medidor.findUnique({ where: { id: acta.medidorId } });
  if (!acta.fechaRetiro && medidor?.suscriptorId === acta.suscriptorId) {
    await prisma.medidor.update({ where: { id: acta.medidorId }, data: { suscriptorId: null, estado: "en_bodega" } });
    await prisma.suscriptor.update({ where: { id: acta.suscriptorId }, data: { estadoFacturacion: "sin_medidor" } });
  }

  await prisma.actaInstalacion.delete({ where: { id: acta.id } });
  res.status(204).end();
});

// El PDF que genera GET /:id/pdf es una plantilla para imprimir y firmar a mano; esto guarda el
// escaneo YA FIRMADO (documento legal), aparte de las "fotos" de evidencia de la instalación.
actasRouter.post("/:id/firmada", uploadDocumento.single("archivo"), async (req, res) => {
  const acta = await prisma.actaInstalacion.findUnique({ where: { id: Number(req.params.id) } });
  if (!acta) return res.status(404).json({ error: "No encontrada" });
  if (!req.file) return res.status(400).json({ error: "Falta el archivo (campo 'archivo')" });

  const actaFirmadaUrl = await guardarArchivo("actas-firmadas", req.file.buffer, req.file.originalname, req.file.mimetype);
  if (acta.actaFirmadaUrl) await borrarArchivo(acta.actaFirmadaUrl);

  const actualizada = await prisma.actaInstalacion.update({ where: { id: acta.id }, data: { actaFirmadaUrl } });
  res.json(actualizada);
});

actasRouter.delete("/:id/firmada", async (req, res) => {
  const acta = await prisma.actaInstalacion.findUnique({ where: { id: Number(req.params.id) } });
  if (!acta) return res.status(404).json({ error: "No encontrada" });
  if (acta.actaFirmadaUrl) await borrarArchivo(acta.actaFirmadaUrl);

  const actualizada = await prisma.actaInstalacion.update({ where: { id: acta.id }, data: { actaFirmadaUrl: null } });
  res.json(actualizada);
});

