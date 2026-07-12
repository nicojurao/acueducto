import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export const marcasRouter = Router();
export const modelosRouter = Router();
export const diametrosRouter = Router();
export const lotesRouter = Router();

function esErrorFK(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003";
}

marcasRouter.get("/", async (_req, res) => {
  const marcas = await prisma.marcaMedidor.findMany({
    include: { _count: { select: { modelos: true } } },
    orderBy: { nombre: "asc" },
  });
  res.json(marcas.map((m) => ({ id: m.id, nombre: m.nombre, modelos: m._count.modelos })));
});

marcasRouter.post("/", async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: "nombre es requerido" });
  const marca = await prisma.marcaMedidor.create({ data: { nombre } });
  res.status(201).json({ id: marca.id, nombre: marca.nombre, modelos: 0 });
});

marcasRouter.put("/:id", async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: "nombre es requerido" });
  const id = Number(req.params.id);
  const marca = await prisma.marcaMedidor.update({
    where: { id },
    data: { nombre },
    include: { _count: { select: { modelos: true } } },
  });
  res.json({ id: marca.id, nombre: marca.nombre, modelos: marca._count.modelos });
});

marcasRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.marcaMedidor.delete({ where: { id: Number(req.params.id) } });
    res.status(204).end();
  } catch (err) {
    if (esErrorFK(err)) {
      return res.status(400).json({ error: "No se puede eliminar: hay modelos o medidores que usan esta marca" });
    }
    throw err;
  }
});

modelosRouter.get("/", async (req, res) => {
  const { marcaId } = req.query;
  const modelos = await prisma.modeloMedidor.findMany({
    where: { marcaId: marcaId ? Number(marcaId) : undefined },
    include: { marca: true, diametros: true },
    orderBy: { nombre: "asc" },
  });
  res.json(modelos);
});

modelosRouter.post("/", async (req, res) => {
  const { nombre, tipo, marcaId } = req.body;
  if (!nombre || !tipo || !marcaId) {
    return res.status(400).json({ error: "nombre, tipo y marcaId son requeridos" });
  }
  const modelo = await prisma.modeloMedidor.create({
    data: { nombre, tipo, marcaId: Number(marcaId) },
  });
  res.status(201).json(modelo);
});

modelosRouter.put("/:id", async (req, res) => {
  const { nombre, tipo, marcaId } = req.body;
  if (!nombre || !tipo || !marcaId) {
    return res.status(400).json({ error: "nombre, tipo y marcaId son requeridos" });
  }
  const id = Number(req.params.id);
  const modelo = await prisma.modeloMedidor.update({
    where: { id },
    data: { nombre, tipo, marcaId: Number(marcaId) },
  });
  // Medidor.tipo es copia del catálogo (para no depender de un join al filtrar/mostrar);
  // si se corrige el tipo de un modelo ya en uso, hay que propagarlo a los medidores existentes.
  await prisma.medidor.updateMany({ where: { modeloId: id }, data: { tipo } });
  res.json(modelo);
});

modelosRouter.put("/:id/diametros", async (req, res) => {
  const { diametroIds } = req.body as { diametroIds: number[] };
  if (!Array.isArray(diametroIds)) return res.status(400).json({ error: "diametroIds debe ser un arreglo" });
  const modelo = await prisma.modeloMedidor.update({
    where: { id: Number(req.params.id) },
    data: { diametros: { set: diametroIds.map((id) => ({ id: Number(id) })) } },
    include: { diametros: true },
  });
  res.json(modelo);
});

modelosRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.modeloMedidor.delete({ where: { id: Number(req.params.id) } });
    res.status(204).end();
  } catch (err) {
    if (esErrorFK(err)) {
      return res.status(400).json({ error: "No se puede eliminar: hay medidores que usan este modelo" });
    }
    throw err;
  }
});

diametrosRouter.get("/", async (_req, res) => {
  const diametros = await prisma.diametroMedidor.findMany({ orderBy: { valor: "asc" } });
  res.json(diametros);
});

diametrosRouter.post("/", async (req, res) => {
  const { valor } = req.body;
  if (!valor) return res.status(400).json({ error: "valor es requerido" });
  const diametro = await prisma.diametroMedidor.create({ data: { valor } });
  res.status(201).json(diametro);
});

diametrosRouter.put("/:id", async (req, res) => {
  const { valor } = req.body;
  if (!valor) return res.status(400).json({ error: "valor es requerido" });
  const id = Number(req.params.id);
  const diametro = await prisma.diametroMedidor.update({ where: { id }, data: { valor } });
  res.json(diametro);
});

diametrosRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.diametroMedidor.delete({ where: { id: Number(req.params.id) } });
    res.status(204).end();
  } catch (err) {
    if (esErrorFK(err)) {
      return res.status(400).json({ error: "No se puede eliminar: hay medidores que usan este diámetro" });
    }
    throw err;
  }
});

// Un lote agrupa los medidores de una misma caja/compra por el rango de seriales (ej. la caja
// con seriales 23001 a 23020). Se identifica siempre por ese rango, no por un nombre libre.
lotesRouter.get("/", async (_req, res) => {
  const lotes = await prisma.lote.findMany({
    include: { _count: { select: { medidores: true } } },
    orderBy: { serialInicial: "asc" },
  });
  res.json(
    lotes.map((l) => ({
      id: l.id,
      serialInicial: l.serialInicial,
      serialFinal: l.serialFinal,
      fechaCompra: l.fechaCompra,
      observaciones: l.observaciones,
      medidores: l._count.medidores,
    }))
  );
});

lotesRouter.post("/", async (req, res) => {
  const { serialInicial, serialFinal, fechaCompra, observaciones } = req.body;
  if (!serialInicial || !serialFinal) {
    return res.status(400).json({ error: "serialInicial y serialFinal son requeridos" });
  }
  try {
    const lote = await prisma.lote.create({
      data: {
        serialInicial: String(serialInicial).trim(),
        serialFinal: String(serialFinal).trim(),
        fechaCompra: fechaCompra ? new Date(fechaCompra) : null,
        observaciones: observaciones || null,
      },
    });
    res.status(201).json({ ...lote, medidores: 0 });
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ya existe un lote con ese rango de seriales" });
    throw err;
  }
});

lotesRouter.put("/:id", async (req, res) => {
  const { serialInicial, serialFinal, fechaCompra, observaciones } = req.body;
  if (!serialInicial || !serialFinal) {
    return res.status(400).json({ error: "serialInicial y serialFinal son requeridos" });
  }
  try {
    const lote = await prisma.lote.update({
      where: { id: Number(req.params.id) },
      data: {
        serialInicial: String(serialInicial).trim(),
        serialFinal: String(serialFinal).trim(),
        fechaCompra: fechaCompra ? new Date(fechaCompra) : null,
        observaciones: observaciones || null,
      },
      include: { _count: { select: { medidores: true } } },
    });
    res.json({ ...lote, medidores: lote._count.medidores });
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ya existe un lote con ese rango de seriales" });
    throw err;
  }
});

lotesRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.lote.delete({ where: { id: Number(req.params.id) } });
    res.status(204).end();
  } catch (err) {
    if (esErrorFK(err)) {
      return res.status(400).json({ error: "No se puede eliminar: hay medidores que usan este lote" });
    }
    throw err;
  }
});
