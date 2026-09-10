import { Router } from "express";
import multer from "multer";
import { prisma } from "../../lib/prisma.js";
import { guardarArchivo, borrarArchivo, leerArchivo } from "../../lib/storage.js";

// Gestión interna (autenticada) de documentos SGC — montado en index.ts con
// requirePermisoVerAvanzado("documentos_sgc_ver", "documentos_sgc_avanzado"), que ya separa
// GET (cualquiera de los dos permisos) de crear/editar (solo "avanzado").
export const documentosSgcRouter = Router();

// El archivo puede ser PDF, Word o Excel — no se restringe por mimetype como sí se hace con
// fotos (image/*) en otros módulos.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const incluirVersiones = {
  versiones: { orderBy: { numeroVersion: "desc" as const } },
};

documentosSgcRouter.get("/", async (req, res) => {
  const { proceso, tipo, estado, q } = req.query;
  const documentos = await prisma.documentoSgc.findMany({
    where: {
      activo: true,
      proceso: proceso ? String(proceso) : undefined,
      tipo: tipo ? String(tipo) : undefined,
      estado: estado ? String(estado) : undefined,
      OR: q
        ? [
            { codigo: { contains: String(q), mode: "insensitive" } },
            { titulo: { contains: String(q), mode: "insensitive" } },
          ]
        : undefined,
    },
    include: { versiones: { where: { vigente: true }, take: 1 } },
    orderBy: { codigo: "asc" },
  });
  res.json(documentos);
});

// Descarga con el nombre real (código + versión), no el nombre interno que le puso MinIO
// (timestamp-random.ext) — que es lo que salía si se enlazaba directo a /uploads/* (ver urlFoto).
documentosSgcRouter.get("/versiones/:versionId/descargar", async (req, res) => {
  const version = await prisma.versionDocumentoSgc.findUnique({
    where: { id: Number(req.params.versionId) },
    include: { documento: true },
  });
  if (!version) return res.status(404).json({ error: "No encontrada" });

  try {
    const { stream, size, contentType } = await leerArchivo(version.archivoUrl);
    const ext = version.archivoUrl.split(".").pop();
    res.setHeader("Content-Type", contentType ?? "application/octet-stream");
    res.setHeader("Content-Length", String(size));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${version.documento.codigo}-v${version.numeroVersion}.${ext}"`
    );
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    stream.on("error", () => res.status(404).end());
    stream.pipe(res);
  } catch {
    res.status(404).json({ error: "Archivo no encontrado" });
  }
});

documentosSgcRouter.get("/:id", async (req, res) => {
  const documento = await prisma.documentoSgc.findUnique({
    where: { id: Number(req.params.id) },
    include: incluirVersiones,
  });
  if (!documento) return res.status(404).json({ error: "No encontrado" });
  res.json(documento);
});

documentosSgcRouter.post("/", upload.single("archivo"), async (req, res) => {
  const { codigo, titulo, tipo, proceso, fechaVigencia, descripcionCambio, elaboroPor, revisoPor, aproboPor } = req.body;
  if (!codigo?.trim() || !titulo?.trim() || !tipo?.trim() || !proceso?.trim() || !fechaVigencia) {
    return res.status(400).json({ error: "Código, título, tipo, proceso y fecha de vigencia son requeridos" });
  }
  if (!req.file) return res.status(400).json({ error: "Falta el archivo (campo 'archivo')" });

  const existente = await prisma.documentoSgc.findUnique({ where: { codigo: codigo.trim() } });
  if (existente) return res.status(409).json({ error: "Ya existe un documento con ese código" });

  const archivoUrl = await guardarArchivo("documentos-sgc", req.file.buffer, req.file.originalname, req.file.mimetype);
  try {
    const documento = await prisma.documentoSgc.create({
      data: {
        codigo: codigo.trim(),
        titulo: titulo.trim(),
        tipo: tipo.trim(),
        proceso: proceso.trim(),
        versiones: {
          create: {
            numeroVersion: 1,
            archivoUrl,
            fechaVigencia: new Date(fechaVigencia),
            descripcionCambio: descripcionCambio?.trim() || null,
            elaboroPor: elaboroPor?.trim() || null,
            revisoPor: revisoPor?.trim() || null,
            aproboPor: aproboPor?.trim() || null,
          },
        },
      },
      include: incluirVersiones,
    });
    res.status(201).json(documento);
  } catch (err) {
    await borrarArchivo(archivoUrl);
    throw err;
  }
});

// Datos de la ficha (código/título/tipo/proceso) — no toca versiones ni el archivo.
documentosSgcRouter.put("/:id", async (req, res) => {
  const documento = await prisma.documentoSgc.findUnique({ where: { id: Number(req.params.id) } });
  if (!documento) return res.status(404).json({ error: "No encontrado" });

  const { titulo, tipo, proceso, estado } = req.body;
  if (!titulo?.trim() || !tipo?.trim() || !proceso?.trim()) {
    return res.status(400).json({ error: "Título, tipo y proceso son requeridos" });
  }
  if (estado && !["vigente", "obsoleto", "en_revision"].includes(estado)) {
    return res.status(400).json({ error: "Estado inválido" });
  }

  const actualizado = await prisma.documentoSgc.update({
    where: { id: documento.id },
    data: { titulo: titulo.trim(), tipo: tipo.trim(), proceso: proceso.trim(), estado: estado || undefined },
    include: incluirVersiones,
  });
  res.json(actualizado);
});

// Sube una versión nueva: la anterior queda vigente=false (histórico de solo lectura), esta
// pasa a ser la vigente. No se borra ningún archivo previo.
documentosSgcRouter.post("/:id/versiones", upload.single("archivo"), async (req, res) => {
  const documento = await prisma.documentoSgc.findUnique({
    where: { id: Number(req.params.id) },
    include: { versiones: { orderBy: { numeroVersion: "desc" }, take: 1 } },
  });
  if (!documento) return res.status(404).json({ error: "No encontrado" });
  if (!req.file) return res.status(400).json({ error: "Falta el archivo (campo 'archivo')" });

  const { fechaVigencia, descripcionCambio, elaboroPor, revisoPor, aproboPor } = req.body;
  if (!fechaVigencia) return res.status(400).json({ error: "La fecha de vigencia es requerida" });

  const archivoUrl = await guardarArchivo("documentos-sgc", req.file.buffer, req.file.originalname, req.file.mimetype);
  const siguienteVersion = (documento.versiones[0]?.numeroVersion ?? 0) + 1;

  try {
    await prisma.versionDocumentoSgc.updateMany({ where: { documentoId: documento.id, vigente: true }, data: { vigente: false } });
    await prisma.versionDocumentoSgc.create({
      data: {
        documentoId: documento.id,
        numeroVersion: siguienteVersion,
        archivoUrl,
        fechaVigencia: new Date(fechaVigencia),
        descripcionCambio: descripcionCambio?.trim() || null,
        elaboroPor: elaboroPor?.trim() || null,
        revisoPor: revisoPor?.trim() || null,
        aproboPor: aproboPor?.trim() || null,
      },
    });
    // Subir una versión nueva reactiva el documento como vigente si estaba obsoleto/en revisión.
    const actualizado = await prisma.documentoSgc.update({
      where: { id: documento.id },
      data: { estado: "vigente" },
      include: incluirVersiones,
    });
    res.status(201).json(actualizado);
  } catch (err) {
    await borrarArchivo(archivoUrl);
    throw err;
  }
});

// Borrado lógico: no se eliminan versiones ni archivos (siguen sirviendo de histórico interno),
// solo deja de listarse y de ser accesible desde el sitio público.
documentosSgcRouter.delete("/:id", async (req, res) => {
  const documento = await prisma.documentoSgc.findUnique({ where: { id: Number(req.params.id) } });
  if (!documento) return res.status(404).json({ error: "No encontrado" });
  await prisma.documentoSgc.update({ where: { id: documento.id }, data: { activo: false } });
  res.status(204).end();
});
