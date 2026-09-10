import { Router } from "express";
import multer from "multer";
import { prisma } from "../../lib/prisma.js";
import { guardarArchivo, borrarArchivo } from "../../lib/storage.js";
import { invalidarEmpresaCache } from "../../lib/empresaCache.js";

// Configuración de la entidad — pantalla de administración (después del wizard de primer uso, o
// para editar cualquiera de esos datos más adelante). Todo lo demás (correos, PDFs, reporte SUI,
// CORS, dominios públicos) lee de esta misma fila vía lib/empresaCache.ts.
export const empresaRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
});

// Campos que el formulario (wizard o pestaña) puede mandar — todos opcionales acá porque el
// wizard guarda paso a paso, no todo de una vez.
const CAMPOS_TEXTO = [
  "nit", "nitDv", "nombre", "nombreCorto", "direccion", "sitioWeb", "email", "telefonos",
  "colorMarca", "daneDepartamento", "daneMunicipio", "daneCentroPoblado", "glnGs1",
  "dominioOperativo", "dominioPqrs", "dominioCalidad", "smtpHost", "smtpUser", "smtpPass", "smtpFrom",
] as const;

empresaRouter.get("/", async (_req, res) => {
  const empresa = await prisma.empresa.findUnique({ where: { id: 1 } });
  res.json(empresa ?? { id: 1 });
});

empresaRouter.put("/", async (req, res) => {
  const datos: Record<string, string | number | undefined> = {};
  for (const campo of CAMPOS_TEXTO) {
    if (req.body[campo] !== undefined) datos[campo] = String(req.body[campo]).trim();
  }
  if (req.body.smtpPort !== undefined) {
    datos.smtpPort = req.body.smtpPort === "" || req.body.smtpPort === null ? undefined : Number(req.body.smtpPort);
  }

  const actualizada = await prisma.empresa.upsert({
    where: { id: 1 },
    create: { id: 1, ...datos },
    update: datos,
  });
  invalidarEmpresaCache();
  res.json(actualizada);
});

// Acción separada a propósito: guardar un paso del wizard nunca debe cerrar el wizard por
// accidente — solo esto lo hace, de forma explícita.
empresaRouter.post("/finalizar", async (_req, res) => {
  const actualizada = await prisma.empresa.upsert({
    where: { id: 1 },
    create: { id: 1, configuradoEn: new Date() },
    update: { configuradoEn: new Date() },
  });
  invalidarEmpresaCache();
  res.json(actualizada);
});

empresaRouter.post("/logo", upload.single("logo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo" });

  const existente = await prisma.empresa.findUnique({ where: { id: 1 } });
  const logoRuta = await guardarArchivo("empresa", req.file.buffer, req.file.originalname, req.file.mimetype);
  if (existente?.logoRuta) await borrarArchivo(existente.logoRuta);

  const actualizada = await prisma.empresa.upsert({
    where: { id: 1 },
    create: { id: 1, logoRuta },
    update: { logoRuta },
  });
  invalidarEmpresaCache();
  res.json(actualizada);
});
