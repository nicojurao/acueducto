import { Router } from "express";
import { leerArchivo } from "../../lib/storage.js";
import { obtenerEmpresa } from "../../lib/empresaCache.js";

// Identidad de la entidad, expuesta sin sesión — la necesitan la pantalla de login (antes de
// autenticarse), y los sitios 100% públicos de PQRS y Documentos SGC. Nunca expone SMTP ni NIT:
// solo lo que hace falta para la marca y para que el frontend sepa a qué dominio corresponde cada
// sitio (ver App.tsx) y si ya se completó el wizard de primer uso.
export const empresaPublicoRouter = Router();

empresaPublicoRouter.get("/", async (_req, res) => {
  const empresa = await obtenerEmpresa();
  res.json({
    nombre: empresa.nombre,
    nombreCorto: empresa.nombreCorto,
    direccion: empresa.direccion,
    sitioWeb: empresa.sitioWeb,
    email: empresa.email,
    telefonos: empresa.telefonos,
    colorMarca: empresa.colorMarca,
    tieneLogo: Boolean(empresa.logoRuta),
    dominioOperativo: empresa.dominioOperativo,
    dominioPqrs: empresa.dominioPqrs,
    dominioCalidad: empresa.dominioCalidad,
    configurado: empresa.configuradoEn != null,
    actualizadoEn: empresa.updatedAt,
  });
});

// A diferencia de /api/publico/pqrs/adjuntos/:archivo (datos personales, nunca cacheable), acá SÍ
// es correcto cachear: es la misma imagen para cualquiera que la pida, hasta que el admin suba
// otra — el frontend rompe la caché agregando "?v=<actualizadoEn>" a la URL cuando cambia.
empresaPublicoRouter.get("/logo", async (_req, res) => {
  try {
    const empresa = await obtenerEmpresa();
    if (!empresa.logoRuta) return res.status(404).json({ error: "No hay logo configurado" });
    const { stream, size, contentType } = await leerArchivo(empresa.logoRuta);
    res.setHeader("Content-Type", contentType ?? "application/octet-stream");
    res.setHeader("Content-Length", String(size));
    res.setHeader("Cache-Control", "public, max-age=3600");
    stream.on("error", () => res.status(404).end());
    stream.pipe(res);
  } catch {
    res.status(404).json({ error: "Archivo no encontrado" });
  }
});
