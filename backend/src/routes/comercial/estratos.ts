import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requirePermiso } from "../../middleware/auth.js";

export const estratosRouter = Router();
const soloAvanzado = requirePermiso("suscriptores_avanzado");

estratosRouter.get("/", async (_req, res) => {
  const estratos = await prisma.estrato.findMany({
    orderBy: { id: "asc" },
    include: { _count: { select: { suscriptores: true } } },
  });
  res.json(
    estratos.map((e) => ({ id: e.id, codigo: e.codigo, etiqueta: e.etiqueta, suscriptores: e._count.suscriptores }))
  );
});

estratosRouter.post("/", soloAvanzado, async (req, res) => {
  const { codigo, etiqueta } = req.body;
  if (!codigo || !String(codigo).trim()) return res.status(400).json({ error: "El código es requerido" });
  if (!etiqueta || !String(etiqueta).trim()) return res.status(400).json({ error: "La etiqueta es requerida" });

  try {
    const estrato = await prisma.estrato.create({
      data: { codigo: String(codigo).trim(), etiqueta: String(etiqueta).trim() },
    });
    res.status(201).json({ id: estrato.id, codigo: estrato.codigo, etiqueta: estrato.etiqueta, suscriptores: 0 });
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ese código de estrato ya existe" });
    throw err;
  }
});

// Editar código y/o etiqueta: Suscriptor.estratoId es una FK real, así que el cambio se refleja
// solo en todos los suscriptores que lo tengan asignado — no hace falta propagar nada a mano.
estratosRouter.put("/:id", soloAvanzado, async (req, res) => {
  const { codigo, etiqueta } = req.body;
  if (!codigo || !String(codigo).trim()) return res.status(400).json({ error: "El código es requerido" });
  if (!etiqueta || !String(etiqueta).trim()) return res.status(400).json({ error: "La etiqueta es requerida" });
  const codigoNuevo = String(codigo).trim();
  const etiquetaNueva = String(etiqueta).trim();

  const estrato = await prisma.estrato.findUnique({ where: { id: Number(req.params.id) } });
  if (!estrato) return res.status(404).json({ error: "No encontrado" });

  try {
    const actualizado = await prisma.estrato.update({
      where: { id: estrato.id },
      data: { codigo: codigoNuevo, etiqueta: etiquetaNueva },
      include: { _count: { select: { suscriptores: true } } },
    });
    res.json({
      id: actualizado.id,
      codigo: actualizado.codigo,
      etiqueta: actualizado.etiqueta,
      suscriptores: actualizado._count.suscriptores,
    });
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ese código de estrato ya existe" });
    throw err;
  }
});

estratosRouter.delete("/:id", soloAvanzado, async (req, res) => {
  const estrato = await prisma.estrato.findUnique({ where: { id: Number(req.params.id) } });
  if (!estrato) return res.status(404).json({ error: "No encontrado" });

  const enUso = await prisma.suscriptor.count({ where: { estratoId: estrato.id } });
  if (enUso > 0) {
    return res.status(400).json({ error: "No se puede eliminar: hay suscriptores con este estrato asignado" });
  }

  await prisma.estrato.delete({ where: { id: estrato.id } });
  res.status(204).end();
});
