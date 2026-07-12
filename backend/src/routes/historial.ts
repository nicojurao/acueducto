import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const historialRouter = Router();

// Historial de un registro puntual (para incrustar en el detalle de un medidor/suscriptor).
historialRouter.get("/:entidad/:entidadId", async (req, res) => {
  const { entidad, entidadId } = req.params;
  const items = await prisma.historialCambio.findMany({
    where: { entidad, entidadId: Number(entidadId) },
    include: { usuario: { select: { id: true, nombre: true } } },
    orderBy: { fecha: "desc" },
  });
  res.json(items);
});

// Auditoría global con filtros y paginación. Los nombres de medidor/suscriptor se resuelven en
// dos consultas adicionales (no una por fila) para no caer en N+1 con listas grandes.
historialRouter.get("/", async (req, res) => {
  const { entidad, usuarioId, desde, hasta, campo } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));

  const where: any = {};
  if (entidad) where.entidad = String(entidad);
  if (usuarioId) where.usuarioId = Number(usuarioId);
  if (campo) where.campo = { contains: String(campo), mode: "insensitive" };
  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = new Date(String(desde));
    if (hasta) where.fecha.lte = new Date(`${String(hasta)}T23:59:59`);
  }

  const [items, total] = await Promise.all([
    prisma.historialCambio.findMany({
      where,
      include: { usuario: { select: { id: true, nombre: true } } },
      orderBy: { fecha: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.historialCambio.count({ where }),
  ]);

  const idsMedidor = [...new Set(items.filter((i) => i.entidad === "medidor").map((i) => i.entidadId))];
  const idsSuscriptor = [...new Set(items.filter((i) => i.entidad === "suscriptor").map((i) => i.entidadId))];
  const [medidores, suscriptores] = await Promise.all([
    idsMedidor.length
      ? prisma.medidor.findMany({ where: { id: { in: idsMedidor } }, select: { id: true, serial: true } })
      : [],
    idsSuscriptor.length
      ? prisma.suscriptor.findMany({ where: { id: { in: idsSuscriptor } }, select: { id: true, nombre: true, codigo: true } })
      : [],
  ]);
  const nombreMedidor = new Map(medidores.map((m) => [m.id, m.serial ?? `#${m.id}`]));
  const nombreSuscriptor = new Map(suscriptores.map((s) => [s.id, `${s.nombre} (${s.codigo})`]));

  const data = items.map((i) => ({
    ...i,
    entidadNombre:
      i.entidad === "medidor" ? nombreMedidor.get(i.entidadId) ?? `#${i.entidadId}` : nombreSuscriptor.get(i.entidadId) ?? `#${i.entidadId}`,
  }));

  res.json({ data, total, page, limit });
});
