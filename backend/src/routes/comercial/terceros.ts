import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requirePermiso } from "../../middleware/auth.js";

export const tercerosRouter = Router();

const permisoEditar = requirePermiso("suscriptores_avanzado");

const TIPOS_DOCUMENTO = ["CC", "NIT", "CE", "TI", "PP"];

tercerosRouter.get("/", async (req, res) => {
  const { q, pendientes, page, limit } = req.query;
  const filtros: any[] = [];
  if (q) {
    const texto = String(q).trim();
    filtros.push({
      OR: [
        { nombre: { contains: texto, mode: "insensitive" as const } },
        { numeroDocumento: { contains: texto, mode: "insensitive" as const } },
        { email: { contains: texto, mode: "insensitive" as const } },
      ],
    });
  }
  // Los "PEND-" son los creados por la migración inicial sin identificación real.
  if (pendientes === "1") filtros.push({ numeroDocumento: { startsWith: "PEND-" } });
  const where = filtros.length ? { AND: filtros } : {};
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);
  const [terceros, total] = await Promise.all([
    prisma.tercero.findMany({
      where,
      include: { suscriptores: { select: { id: true, codigo: true, nombre: true, ruta: true } } },
      orderBy: { nombre: "asc" },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.tercero.count({ where }),
  ]);
  res.json({ data: terceros, total, page: pageNum, limit: limitNum });
});

tercerosRouter.get("/:id", async (req, res) => {
  const tercero = await prisma.tercero.findUnique({
    where: { id: Number(req.params.id) },
    include: { suscriptores: { select: { id: true, codigo: true, nombre: true, ruta: true, estadoFacturacion: true } } },
  });
  if (!tercero) return res.status(404).json({ error: "No encontrado" });
  res.json(tercero);
});

tercerosRouter.post("/", permisoEditar, async (req, res) => {
  const { tipoDocumento, numeroDocumento, nombre, email, telefono, direccion, observaciones } = req.body;
  if (!nombre) return res.status(400).json({ error: "El nombre es requerido" });
  if (tipoDocumento && !TIPOS_DOCUMENTO.includes(tipoDocumento)) {
    return res.status(400).json({ error: `tipoDocumento inválido (${TIPOS_DOCUMENTO.join(", ")})` });
  }
  try {
    const tercero = await prisma.tercero.create({
      data: {
        tipoDocumento: tipoDocumento || "CC",
        numeroDocumento: numeroDocumento?.trim() || null,
        nombre: String(nombre).trim(),
        email: email?.trim() || null,
        telefono: telefono?.trim() || null,
        direccion: direccion?.trim() || null,
        observaciones: observaciones || null,
      },
    });
    res.status(201).json(tercero);
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ya existe un tercero con ese número de documento" });
    throw err;
  }
});

tercerosRouter.put("/:id", permisoEditar, async (req, res) => {
  const id = Number(req.params.id);
  const existente = await prisma.tercero.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: "No encontrado" });
  const { tipoDocumento, numeroDocumento, nombre, email, telefono, direccion, observaciones } = req.body;
  if (tipoDocumento && !TIPOS_DOCUMENTO.includes(tipoDocumento)) {
    return res.status(400).json({ error: `tipoDocumento inválido (${TIPOS_DOCUMENTO.join(", ")})` });
  }
  try {
    const tercero = await prisma.tercero.update({
      where: { id },
      data: {
        tipoDocumento: tipoDocumento === undefined ? undefined : tipoDocumento,
        numeroDocumento: numeroDocumento === undefined ? undefined : numeroDocumento?.trim() || null,
        nombre: nombre === undefined ? undefined : String(nombre).trim(),
        email: email === undefined ? undefined : email?.trim() || null,
        telefono: telefono === undefined ? undefined : telefono?.trim() || null,
        direccion: direccion === undefined ? undefined : direccion?.trim() || null,
        observaciones: observaciones === undefined ? undefined : observaciones || null,
      },
    });
    res.json(tercero);
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ya existe un tercero con ese número de documento" });
    throw err;
  }
});

// Reasignar un suscriptor a otro tercero (ej. el predio cambió de dueño, o quedó mal agrupado
// en la migración inicial).
tercerosRouter.put("/:id/suscriptores/:suscriptorId", permisoEditar, async (req, res) => {
  const terceroId = Number(req.params.id);
  const suscriptorId = Number(req.params.suscriptorId);
  const [tercero, suscriptor] = await Promise.all([
    prisma.tercero.findUnique({ where: { id: terceroId } }),
    prisma.suscriptor.findUnique({ where: { id: suscriptorId } }),
  ]);
  if (!tercero || !suscriptor) return res.status(404).json({ error: "No encontrado" });
  const actualizado = await prisma.suscriptor.update({ where: { id: suscriptorId }, data: { terceroId } });
  res.json(actualizado);
});

tercerosRouter.delete("/:id", permisoEditar, async (req, res) => {
  const id = Number(req.params.id);
  const tercero = await prisma.tercero.findUnique({ where: { id }, include: { _count: { select: { suscriptores: true } } } });
  if (!tercero) return res.status(404).json({ error: "No encontrado" });
  if (tercero._count.suscriptores > 0) {
    return res.status(400).json({ error: "No se puede eliminar: tiene suscriptores asociados. Reasígnalos primero." });
  }
  await prisma.tercero.delete({ where: { id } });
  res.status(204).end();
});
