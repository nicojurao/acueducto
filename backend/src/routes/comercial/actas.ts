import { Router } from "express";
import multer from "multer";
import { prisma } from "../../lib/prisma.js";
import { guardarArchivo, borrarArchivo, borrarArchivos } from "../../lib/storage.js";
import { LIMITE_DOCUMENTO_BYTES, filtroDocumento } from "../../lib/uploads.js";

export const actasRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
});

// El PDF/imagen del acta ya firmada a mano no tiene por qué ser una foto (mimetype restringido
// arriba a "image/*"); acepta también PDF, pero nada más (antes aceptaba cualquier tipo).
const uploadDocumento = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITE_DOCUMENTO_BYTES },
  fileFilter: filtroDocumento,
});

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
  // Un dato inválido se rechaza ANTES de subir nada a MinIO (no tiene sentido subir las fotos para
  // que después la BD rechace el guardado).
  if (Number.isNaN(new Date(fechaInstalacion).getTime())) {
    return res.status(400).json({ error: "La fecha de instalación no es válida" });
  }

  const archivos = (req.files as Express.Multer.File[] | undefined) ?? [];
  const fotos = await subirFotos(archivos);

  // TODO el guardado en UNA transacción, y si algo falla se borran las fotos recién subidas.
  // Antes el reemplazo del medidor anterior ocurría ANTES del try (y cada paso por separado), así
  // que un fallo de la BD a mitad dejaba dos problemas a la vez: las fotos huérfanas en MinIO, y
  // el medidor anterior ya desinstalado aunque el nuevo nunca llegó a quedar registrado.
  let acta;
  try {
    const instalador = await resolverInstalador(usuarioId, instaladoPor);
    acta = await prisma.$transaction(async (tx) => {
      // Si el suscriptor ya tenía un medidor activo, este nuevo lo reemplaza: el anterior queda
      // marcado como inactivo (histórico, conserva sus lecturas) y vuelve a bodega — se desvincula
      // del suscriptor para que no siga apareciendo como instalado en su predio.
      const medidoresReemplazados = await tx.medidor.findMany({
        where: { suscriptorId: Number(suscriptorId), activo: true, id: { not: Number(medidorId) } },
        select: { id: true },
      });
      if (medidoresReemplazados.length > 0) {
        await tx.medidor.updateMany({
          where: { id: { in: medidoresReemplazados.map((m) => m.id) } },
          data: { activo: false, estado: "en_bodega", suscriptorId: null },
        });
        // El acta del medidor reemplazado se cierra con fechaRetiro para que siga apareciendo en el
        // historial del suscriptor (el modal de historial filtra por fechaRetiro, no por si el
        // medidor sigue con suscriptorId asignado).
        await tx.actaInstalacion.updateMany({
          where: { medidorId: { in: medidoresReemplazados.map((m) => m.id) }, fechaRetiro: null },
          data: { fechaRetiro: new Date(fechaInstalacion) },
        });
      }

      const creada = await tx.actaInstalacion.create({
        data: {
          medidorId: Number(medidorId),
          suscriptorId: Number(suscriptorId),
          serial: medidor.serial!,
          fechaInstalacion: new Date(fechaInstalacion),
          instaladoPor: instalador.instaladoPor,
          usuarioId: instalador.usuarioId,
          observaciones: observaciones || null,
          fotos,
        },
      });

      // lecturaInicial NO se toca acá: ya quedó fijada cuando el medidor se agregó al inventario
      // (es el valor de fábrica, no cambia por instalarse).
      await tx.medidor.update({
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
        await tx.suscriptor.update({
          where: { id: Number(suscriptorId) },
          data: { estadoFacturacion: "instalado_prueba" },
        });
      }
      return creada;
    });
  } catch (err) {
    await borrarArchivos(fotos);
    throw err;
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
  if (Number.isNaN(new Date(fechaInstalacion).getTime())) {
    return res.status(400).json({ error: "La fecha de instalación no es válida" });
  }

  // Solo se aceptan rutas que de verdad son de esta acta — sin este filtro, un fotosARemover
  // arbitrario borraba de MinIO archivos de OTRO registro (que quedaba con la referencia rota).
  const pedidas: string[] = fotosARemover ? (Array.isArray(fotosARemover) ? fotosARemover : [fotosARemover]) : [];
  const aRemover = acta.fotos.filter((f) => pedidas.includes(f));

  const archivos = (req.files as Express.Multer.File[] | undefined) ?? [];
  const fotosNuevas = await subirFotos(archivos);
  const fotosFinales = [...acta.fotos.filter((f) => !aRemover.includes(f)), ...fotosNuevas];

  // fechaRetiro solo se envía al editar el historial de un medidor retirado (corregir la fecha
  // de retiro); si no viene en el body, no se toca (no es una forma de "reactivar" el medidor).
  let actaActualizada;
  try {
    const instalador = await resolverInstalador(usuarioId, instaladoPor);
    actaActualizada = await prisma.actaInstalacion.update({
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
  } catch (err) {
    await borrarArchivos(fotosNuevas);
    throw err;
  }

  await borrarArchivos(aRemover);

  // Medidor.fechaInstalacion es la de la instalación VIGENTE. Si lo que se corrige es un acta ya
  // retirada (el medidor pudo haberse instalado después en otro predio), no se debe pisar.
  if (!actaActualizada.fechaRetiro) {
    await prisma.medidor.update({
      where: { id: acta.medidorId },
      data: { fechaInstalacion: new Date(fechaInstalacion) },
    });
  }

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

  // Si esta acta todavía representa la asignación activa (nunca se "quitó" y el medidor sigue
  // apuntando a este mismo suscriptor), hay que revertir ese estado igual que haría un "quitar"
  // normal — si no, el medidor queda con suscriptorId puesto pero sin ningún acta que lo respalde.
  const medidor = await prisma.medidor.findUnique({ where: { id: acta.medidorId } });
  if (!acta.fechaRetiro && medidor?.suscriptorId === acta.suscriptorId) {
    await prisma.medidor.update({ where: { id: acta.medidorId }, data: { suscriptorId: null, estado: "en_bodega" } });
    await prisma.suscriptor.update({ where: { id: acta.suscriptorId }, data: { estadoFacturacion: "sin_medidor" } });
  }

  await prisma.actaInstalacion.delete({ where: { id: acta.id } });
  await borrarArchivos([...acta.fotos, acta.actaFirmadaUrl]);
  res.status(204).end();
});

// El PDF que genera GET /:id/pdf es una plantilla para imprimir y firmar a mano; esto guarda el
// escaneo YA FIRMADO (documento legal), aparte de las "fotos" de evidencia de la instalación.
actasRouter.post("/:id/firmada", uploadDocumento.single("archivo"), async (req, res) => {
  const acta = await prisma.actaInstalacion.findUnique({ where: { id: Number(req.params.id) } });
  if (!acta) return res.status(404).json({ error: "No encontrada" });
  if (!req.file) return res.status(400).json({ error: "Falta el archivo (campo 'archivo')" });

  const actaFirmadaUrl = await guardarArchivo("actas-firmadas", req.file.buffer, req.file.originalname, req.file.mimetype);
  let actualizada;
  try {
    actualizada = await prisma.actaInstalacion.update({ where: { id: acta.id }, data: { actaFirmadaUrl } });
  } catch (err) {
    await borrarArchivo(actaFirmadaUrl);
    throw err;
  }
  if (acta.actaFirmadaUrl) await borrarArchivo(acta.actaFirmadaUrl);
  res.json(actualizada);
});

actasRouter.delete("/:id/firmada", async (req, res) => {
  const acta = await prisma.actaInstalacion.findUnique({ where: { id: Number(req.params.id) } });
  if (!acta) return res.status(404).json({ error: "No encontrada" });
  const actualizada = await prisma.actaInstalacion.update({ where: { id: acta.id }, data: { actaFirmadaUrl: null } });
  if (acta.actaFirmadaUrl) await borrarArchivo(acta.actaFirmadaUrl);
  res.json(actualizada);
});

