import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const auditoriaRouter = Router();

// Listado paginado de inicios de sesión, más recientes primero. Filtro opcional por usuario.
auditoriaRouter.get("/", async (req, res) => {
  const { usuarioId } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));

  const where = usuarioId ? { usuarioId: Number(usuarioId) } : undefined;

  const [items, total] = await Promise.all([
    prisma.inicioSesion.findMany({
      where,
      include: { usuario: { select: { id: true, nombre: true, nombreUsuario: true } } },
      orderBy: { fecha: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.inicioSesion.count({ where }),
  ]);

  res.json({ data: items, total, page, limit });
});

// Cambios (HistorialCambio) hechos por el mismo usuario entre este login y el siguiente login
// suyo (o hasta ahora, si es el más reciente) — la mejor aproximación posible a "qué hizo en esa
// sesión" sin tener un id de sesión real en el JWT (ver comentario en schema.prisma).
auditoriaRouter.get("/:id/cambios", async (req, res) => {
  const sesion = await prisma.inicioSesion.findUnique({ where: { id: Number(req.params.id) } });
  if (!sesion) return res.status(404).json({ error: "No encontrado" });

  const siguiente = await prisma.inicioSesion.findFirst({
    where: { usuarioId: sesion.usuarioId, fecha: { gt: sesion.fecha } },
    orderBy: { fecha: "asc" },
  });

  const items = await prisma.historialCambio.findMany({
    where: {
      usuarioId: sesion.usuarioId,
      fecha: { gte: sesion.fecha, ...(siguiente ? { lt: siguiente.fecha } : {}) },
    },
    orderBy: { fecha: "desc" },
  });

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

  res.json(data);
});
