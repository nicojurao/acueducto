import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { requirePermiso } from "../../middleware/auth.js";

export const categoriasInventarioRouter = Router();
export const ubicacionesInventarioRouter = Router();
export const proveedoresInventarioRouter = Router();

const soloAvanzado = requirePermiso("inventario_avanzado");

function esErrorFK(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003";
}

categoriasInventarioRouter.get("/", async (_req, res) => {
  const categorias = await prisma.categoriaInventario.findMany({
    include: { _count: { select: { items: { where: { activo: true } } } } },
    orderBy: { nombre: "asc" },
  });
  res.json(categorias.map((c) => ({ id: c.id, nombre: c.nombre, items: c._count.items })));
});

categoriasInventarioRouter.post("/", soloAvanzado, async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: "nombre es requerido" });
  try {
    const categoria = await prisma.categoriaInventario.create({ data: { nombre } });
    res.status(201).json({ id: categoria.id, nombre: categoria.nombre, items: 0 });
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ya existe una categoría con ese nombre" });
    throw err;
  }
});

categoriasInventarioRouter.put("/:id", soloAvanzado, async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: "nombre es requerido" });
  try {
    const categoria = await prisma.categoriaInventario.update({
      where: { id: Number(req.params.id) },
      data: { nombre },
      include: { _count: { select: { items: { where: { activo: true } } } } },
    });
    res.json({ id: categoria.id, nombre: categoria.nombre, items: categoria._count.items });
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ya existe una categoría con ese nombre" });
    throw err;
  }
});

categoriasInventarioRouter.delete("/:id", soloAvanzado, async (req, res) => {
  try {
    await prisma.categoriaInventario.delete({ where: { id: Number(req.params.id) } });
    res.status(204).end();
  } catch (err) {
    if (esErrorFK(err)) {
      return res.status(400).json({ error: "No se puede eliminar: hay ítems que usan esta categoría" });
    }
    throw err;
  }
});

ubicacionesInventarioRouter.get("/", async (_req, res) => {
  const ubicaciones = await prisma.ubicacionInventario.findMany({
    include: { _count: { select: { items: { where: { activo: true } } } } },
    orderBy: { nombre: "asc" },
  });
  res.json(ubicaciones.map((u) => ({ id: u.id, nombre: u.nombre, items: u._count.items })));
});

ubicacionesInventarioRouter.post("/", soloAvanzado, async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: "nombre es requerido" });
  try {
    const ubicacion = await prisma.ubicacionInventario.create({ data: { nombre } });
    res.status(201).json({ id: ubicacion.id, nombre: ubicacion.nombre, items: 0 });
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ya existe una ubicación con ese nombre" });
    throw err;
  }
});

ubicacionesInventarioRouter.put("/:id", soloAvanzado, async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: "nombre es requerido" });
  try {
    const ubicacion = await prisma.ubicacionInventario.update({
      where: { id: Number(req.params.id) },
      data: { nombre },
      include: { _count: { select: { items: { where: { activo: true } } } } },
    });
    res.json({ id: ubicacion.id, nombre: ubicacion.nombre, items: ubicacion._count.items });
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ya existe una ubicación con ese nombre" });
    throw err;
  }
});

ubicacionesInventarioRouter.delete("/:id", soloAvanzado, async (req, res) => {
  try {
    await prisma.ubicacionInventario.delete({ where: { id: Number(req.params.id) } });
    res.status(204).end();
  } catch (err) {
    if (esErrorFK(err)) {
      return res.status(400).json({ error: "No se puede eliminar: hay ítems que usan esta ubicación" });
    }
    throw err;
  }
});

proveedoresInventarioRouter.get("/", async (_req, res) => {
  const proveedores = await prisma.proveedorInventario.findMany({
    include: { _count: { select: { items: { where: { activo: true } } } } },
    orderBy: { nombre: "asc" },
  });
  res.json(
    proveedores.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      contacto: p.contacto,
      telefono: p.telefono,
      items: p._count.items,
    }))
  );
});

proveedoresInventarioRouter.post("/", soloAvanzado, async (req, res) => {
  const { nombre, contacto, telefono } = req.body;
  if (!nombre) return res.status(400).json({ error: "nombre es requerido" });
  try {
    const proveedor = await prisma.proveedorInventario.create({
      data: { nombre, contacto: contacto || null, telefono: telefono || null },
    });
    res.status(201).json({ ...proveedor, items: 0 });
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ya existe un proveedor con ese nombre" });
    throw err;
  }
});

proveedoresInventarioRouter.put("/:id", soloAvanzado, async (req, res) => {
  const { nombre, contacto, telefono } = req.body;
  if (!nombre) return res.status(400).json({ error: "nombre es requerido" });
  try {
    const proveedor = await prisma.proveedorInventario.update({
      where: { id: Number(req.params.id) },
      data: { nombre, contacto: contacto || null, telefono: telefono || null },
      include: { _count: { select: { items: { where: { activo: true } } } } },
    });
    res.json({
      id: proveedor.id,
      nombre: proveedor.nombre,
      contacto: proveedor.contacto,
      telefono: proveedor.telefono,
      items: proveedor._count.items,
    });
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ya existe un proveedor con ese nombre" });
    throw err;
  }
});

proveedoresInventarioRouter.delete("/:id", soloAvanzado, async (req, res) => {
  try {
    await prisma.proveedorInventario.delete({ where: { id: Number(req.params.id) } });
    res.status(204).end();
  } catch (err) {
    if (esErrorFK(err)) {
      return res.status(400).json({ error: "No se puede eliminar: hay ítems que usan este proveedor" });
    }
    throw err;
  }
});
