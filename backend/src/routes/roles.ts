import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { PERMISOS } from "../lib/permisos.js";

export const rolesRouter = Router();

function conPermisos(rol: {
  id: number;
  nombre: string;
  descripcion: string | null;
  esSistema: boolean;
  createdAt: Date;
  permisos: { permiso: { clave: string } }[];
  _count?: { usuarios: number };
}) {
  return {
    id: rol.id,
    nombre: rol.nombre,
    descripcion: rol.descripcion,
    esSistema: rol.esSistema,
    createdAt: rol.createdAt,
    permisos: rol.permisos.map((p) => p.permiso.clave),
    usuarios: rol._count?.usuarios ?? 0,
  };
}

rolesRouter.get("/permisos", (_req, res) => {
  res.json(PERMISOS);
});

rolesRouter.get("/", async (_req, res) => {
  const roles = await prisma.rol.findMany({
    include: { permisos: { include: { permiso: true } }, _count: { select: { usuarios: true } } },
    orderBy: { id: "asc" },
  });
  res.json(roles.map(conPermisos));
});

rolesRouter.post("/", async (req, res) => {
  const { nombre, descripcion, permisos } = req.body;
  if (!nombre) return res.status(400).json({ error: "El nombre es requerido" });

  const claves: string[] = Array.isArray(permisos) ? permisos : [];
  const invalidas = claves.filter((c) => !PERMISOS.some((p) => p.clave === c));
  if (invalidas.length > 0) return res.status(400).json({ error: `Permisos inválidos: ${invalidas.join(", ")}` });

  try {
    const rol = await prisma.rol.create({
      data: {
        nombre,
        descripcion: descripcion || null,
        permisos: { create: claves.map((clave) => ({ permiso: { connect: { clave } } })) },
      },
      include: { permisos: { include: { permiso: true } }, _count: { select: { usuarios: true } } },
    });
    res.status(201).json(conPermisos(rol));
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ya existe un rol con ese nombre" });
    throw err;
  }
});

rolesRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existente = await prisma.rol.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: "No encontrado" });

  const { nombre, descripcion, permisos } = req.body;

  // El rol del sistema ("admin") sí se puede editar (descripción y permisos) para que
  // cualquier admin lo ajuste, pero conserva su nombre: scripts/create-admin.ts lo busca
  // por el nombre exacto "admin" para poder restablecer el acceso administrativo.
  if (existente.esSistema && nombre !== undefined && nombre !== existente.nombre) {
    return res.status(400).json({ error: "El nombre de un rol del sistema no se puede cambiar" });
  }

  const claves: string[] | undefined = Array.isArray(permisos) ? permisos : undefined;
  if (claves) {
    const invalidas = claves.filter((c) => !PERMISOS.some((p) => p.clave === c));
    if (invalidas.length > 0) return res.status(400).json({ error: `Permisos inválidos: ${invalidas.join(", ")}` });
  }

  try {
    const rol = await prisma.$transaction(async (tx) => {
      if (claves) {
        await tx.rolPermiso.deleteMany({ where: { rolId: id } });
        await tx.rolPermiso.createMany({
          data: await Promise.all(
            claves.map(async (clave) => {
              const p = await tx.permiso.findUniqueOrThrow({ where: { clave } });
              return { rolId: id, permisoId: p.id };
            })
          ),
        });
      }
      return tx.rol.update({
        where: { id },
        data: {
          nombre: existente.esSistema ? undefined : nombre,
          descripcion: descripcion === undefined ? undefined : descripcion || null,
        },
        include: { permisos: { include: { permiso: true } }, _count: { select: { usuarios: true } } },
      });
    });
    res.json(conPermisos(rol));
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ya existe un rol con ese nombre" });
    throw err;
  }
});

rolesRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const rol = await prisma.rol.findUnique({ where: { id }, include: { _count: { select: { usuarios: true } } } });
  if (!rol) return res.status(404).json({ error: "No encontrado" });
  if (rol.esSistema) return res.status(400).json({ error: "Los roles del sistema no se pueden eliminar" });
  if (rol._count.usuarios > 0) {
    return res.status(400).json({ error: "No se puede eliminar: hay usuarios con este rol asignado" });
  }
  await prisma.rol.delete({ where: { id } });
  res.status(204).end();
});
