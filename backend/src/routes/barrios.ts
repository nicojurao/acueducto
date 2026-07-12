import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requirePermiso } from "../middleware/auth.js";

export const barriosRouter = Router();
const soloAvanzado = requirePermiso("suscriptores_avanzado");

barriosRouter.get("/", async (_req, res) => {
  const barrios = await prisma.barrio.findMany({
    orderBy: { nombre: "asc" },
    include: { _count: { select: { suscriptores: true } } },
  });
  res.json(barrios.map((b) => ({ id: b.id, nombre: b.nombre, suscriptores: b._count.suscriptores })));
});

barriosRouter.post("/", soloAvanzado, async (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: "El nombre es requerido" });

  try {
    const barrio = await prisma.barrio.create({ data: { nombre: String(nombre).trim() } });
    res.status(201).json({ id: barrio.id, nombre: barrio.nombre, suscriptores: 0 });
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ese barrio ya existe" });
    throw err;
  }
});

// Renombrar un barrio: Suscriptor.barrioId es una FK real, así que renombrar acá se refleja
// solo en todos los suscriptores que lo tengan asignado — no hace falta propagar nada a mano.
barriosRouter.put("/:id", soloAvanzado, async (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: "El nombre es requerido" });
  const nombreNuevo = String(nombre).trim();

  const barrio = await prisma.barrio.findUnique({ where: { id: Number(req.params.id) } });
  if (!barrio) return res.status(404).json({ error: "No encontrado" });

  try {
    const actualizado = await prisma.barrio.update({
      where: { id: barrio.id },
      data: { nombre: nombreNuevo },
      include: { _count: { select: { suscriptores: true } } },
    });
    res.json({ id: actualizado.id, nombre: actualizado.nombre, suscriptores: actualizado._count.suscriptores });
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ese barrio ya existe" });
    throw err;
  }
});

barriosRouter.delete("/:id", soloAvanzado, async (req, res) => {
  const barrio = await prisma.barrio.findUnique({ where: { id: Number(req.params.id) } });
  if (!barrio) return res.status(404).json({ error: "No encontrado" });

  const enUso = await prisma.suscriptor.count({ where: { barrioId: barrio.id } });
  if (enUso > 0) {
    return res.status(400).json({ error: "No se puede eliminar: hay suscriptores con este barrio asignado" });
  }

  await prisma.barrio.delete({ where: { id: barrio.id } });
  res.status(204).end();
});
