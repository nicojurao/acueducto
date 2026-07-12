import { Router } from "express";
import multer from "multer";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma.js";
import { guardarArchivo, borrarArchivo, leerBuffer } from "../lib/storage.js";
import {
  encabezadoPdf,
  tituloSeccionPdf as tituloSeccion,
  saltoDePaginaSiHaceFaltaPdf as saltoDePaginaSiHaceFalta,
  tarjetaDatosPdf as tarjetaDatos,
} from "../lib/pdfBranding.js";

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
async function resolverUsuarioId(usuarioIdBody: unknown, nombre: string): Promise<number | null> {
  if (usuarioIdBody) {
    const usuario = await prisma.usuario.findUnique({ where: { id: Number(usuarioIdBody) }, select: { id: true } });
    if (usuario) return usuario.id;
  }
  const usuario = await prisma.usuario.findFirst({ where: { nombre, activo: true }, select: { id: true } });
  return usuario?.id ?? null;
}

// ?suscriptorId= trae el historial completo de ese suscriptor (incluye actas con fechaRetiro,
// es decir medidores que ya no tiene asignados — el medidor.suscriptorId actual puede ser
// distinto o null, por eso esto NO se puede sacar solo de suscriptor.medidores).
actasRouter.get("/", async (req, res) => {
  const { suscriptorId } = req.query;
  const actas = await prisma.actaInstalacion.findMany({
    where: suscriptorId ? { suscriptorId: Number(suscriptorId) } : undefined,
    include: { suscriptor: true, medidor: { include: { marcaCat: true, modeloCat: true, diametroCat: true } } },
    orderBy: { id: "desc" },
  });
  res.json(actas);
});

actasRouter.get("/:id", async (req, res) => {
  const acta = await prisma.actaInstalacion.findUnique({
    where: { id: Number(req.params.id) },
    include: { suscriptor: true, medidor: { include: { marcaCat: true, modeloCat: true, diametroCat: true } } },
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

  const acta = await prisma.actaInstalacion.create({
    data: {
      medidorId: Number(medidorId),
      suscriptorId: Number(suscriptorId),
      serial: medidor.serial,
      fechaInstalacion: new Date(fechaInstalacion),
      instaladoPor,
      usuarioId: await resolverUsuarioId(usuarioId, instaladoPor),
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
  const actaActualizada = await prisma.actaInstalacion.update({
    where: { id: acta.id },
    data: {
      fechaInstalacion: new Date(fechaInstalacion),
      instaladoPor,
      usuarioId: await resolverUsuarioId(usuarioId, instaladoPor),
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

actasRouter.get("/:id/pdf", async (req, res) => {
  const acta = await prisma.actaInstalacion.findUnique({
    where: { id: Number(req.params.id) },
    include: { suscriptor: true, medidor: { include: { marcaCat: true, modeloCat: true, diametroCat: true } } },
  });
  if (!acta) return res.status(404).json({ error: "No encontrada" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="acta-${acta.id}.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);

  const TIPO_LABEL: Record<string, string> = { volumetrico: "Volumétrico", velocidad: "Velocidad" };

  encabezadoPdf(doc, "Acta de instalación de medidor", `Gestión Comercial · Registro #${acta.id}`);

  tarjetaDatos(doc, [
    ["Fecha de instalación", acta.fechaInstalacion.toLocaleDateString("es-CO")],
    ["Instalado por", acta.instaladoPor],
  ]);

  tituloSeccion(doc, "Suscriptor");
  tarjetaDatos(doc, [
    ["NUID", acta.suscriptor.codigo],
    ["Nombre", acta.suscriptor.nombre],
    ["Dirección", acta.suscriptor.direccion ?? "—"],
    ["Ruta", acta.suscriptor.ruta ?? "—"],
  ]);

  tituloSeccion(doc, "Medidor");
  tarjetaDatos(doc, [
    ["Serial", acta.serial],
    ["Marca", acta.medidor.marcaCat?.nombre ?? "—"],
    ["Modelo", acta.medidor.modeloCat?.nombre ?? "—"],
    ["Tipo", acta.medidor.tipo ? TIPO_LABEL[acta.medidor.tipo] ?? acta.medidor.tipo : "—"],
    ["Diámetro", acta.medidor.diametroCat?.valor ?? "—"],
  ]);

  if (acta.observaciones) {
    tituloSeccion(doc, "Observaciones");
    saltoDePaginaSiHaceFalta(doc, 40);
    doc.fontSize(10).fillColor("#0f172a").font("Helvetica").text(acta.observaciones, { width: doc.page.width - 80 });
    doc.moveDown(0.8);
  }

  if (acta.fotos.length > 0) {
    tituloSeccion(doc, "Registro fotográfico");
    for (const fotoPath of acta.fotos) {
      try {
        const buffer = await leerBuffer(fotoPath);
        saltoDePaginaSiHaceFalta(doc, 260);
        doc.image(buffer, { fit: [450, 300], align: "center" });
        doc.moveDown(1);
      } catch {
        // ignora archivos que no existan o no sean imágenes válidas
      }
    }
  }

  doc.end();
});
