import { Router } from "express";
import rateLimit from "express-rate-limit";
import { prisma } from "../../lib/prisma.js";
import { leerArchivo } from "../../lib/storage.js";

// Sitio público calidad.acbum.com.co: solo lectura, SIN sesión (igual que pqrsPublicoRouter),
// montado en index.ts antes de requireAuth. Solo expone documentos con estado="vigente" y
// activo=true — nunca obsoletos, en revisión, ni versiones históricas.
export const documentosSgcPublicoRouter = Router();

const limiteConsulta = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Espera un momento e intenta de nuevo." },
});

documentosSgcPublicoRouter.get("/", limiteConsulta, async (req, res) => {
  const { proceso, tipo, q } = req.query;
  const documentos = await prisma.documentoSgc.findMany({
    where: {
      activo: true,
      estado: "vigente",
      proceso: proceso ? String(proceso) : undefined,
      tipo: tipo ? String(tipo) : undefined,
      OR: q
        ? [
            { codigo: { contains: String(q), mode: "insensitive" } },
            { titulo: { contains: String(q), mode: "insensitive" } },
          ]
        : undefined,
    },
    select: {
      id: true,
      codigo: true,
      titulo: true,
      tipo: true,
      proceso: true,
      versiones: {
        where: { vigente: true },
        take: 1,
        select: { numeroVersion: true, fechaVigencia: true },
      },
    },
    orderBy: { codigo: "asc" },
  });
  res.json(documentos);
});

// Descarga la versión vigente del documento (nunca una versión histórica ni un documento
// obsoleto/en revisión, aunque se conozca su id).
documentosSgcPublicoRouter.get("/:id/descargar", limiteConsulta, async (req, res) => {
  const documento = await prisma.documentoSgc.findFirst({
    where: { id: Number(req.params.id), activo: true, estado: "vigente" },
    include: { versiones: { where: { vigente: true }, take: 1 } },
  });
  const version = documento?.versiones[0];
  if (!version) return res.status(404).json({ error: "Documento no encontrado" });

  try {
    const { stream, size, contentType } = await leerArchivo(version.archivoUrl);
    res.setHeader("Content-Type", contentType ?? "application/octet-stream");
    res.setHeader("Content-Length", String(size));
    res.setHeader("Content-Disposition", `inline; filename="${documento!.codigo}.${version.archivoUrl.split(".").pop()}"`);
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    stream.on("error", () => res.status(404).end());
    stream.pipe(res);
  } catch {
    res.status(404).json({ error: "Archivo no encontrado" });
  }
});
