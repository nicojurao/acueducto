import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import { prisma } from "../../lib/prisma.js";
import { guardarArchivo, borrarArchivo } from "../../lib/storage.js";
import { registrarCambioContrasena, registrarCambios, camposUsuario } from "../../lib/historial.js";

export const usuariosRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
});

function sinPassword(u: {
  id: number;
  nombre: string;
  nombreUsuario: string;
  activo: boolean;
  cedula: string | null;
  celular: string | null;
  fechaNacimiento: Date | null;
  foto: string | null;
  createdAt: Date;
  rol: { id: number; nombre: string; esSistema: boolean };
}) {
  return {
    id: u.id,
    nombre: u.nombre,
    nombreUsuario: u.nombreUsuario,
    activo: u.activo,
    cedula: u.cedula,
    celular: u.celular,
    fechaNacimiento: u.fechaNacimiento,
    foto: u.foto,
    createdAt: u.createdAt,
    rol: u.rol,
  };
}

usuariosRouter.get("/", async (_req, res) => {
  const usuarios = await prisma.usuario.findMany({ include: { rol: true }, orderBy: { nombre: "asc" } });
  res.json(usuarios.map(sinPassword));
});

usuariosRouter.post("/", upload.single("foto"), async (req, res) => {
  const { nombre, nombreUsuario, password, rolId, cedula, celular, fechaNacimiento, activo } = req.body;
  if (!nombre || !nombreUsuario || !password || !rolId) {
    return res.status(400).json({ error: "nombre, nombreUsuario, password y rolId son requeridos" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
  }

  const rol = await prisma.rol.findUnique({ where: { id: Number(rolId) } });
  if (!rol) return res.status(400).json({ error: "Rol inválido" });

  const passwordHash = await bcrypt.hash(password, 10);
  const foto = req.file ? await guardarArchivo("usuarios", req.file.buffer, req.file.originalname, req.file.mimetype) : null;
  try {
    const usuario = await prisma.usuario.create({
      data: {
        nombre,
        nombreUsuario: String(nombreUsuario).trim(),
        passwordHash,
        rolId: rol.id,
        cedula: cedula || null,
        celular: celular || null,
        fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : null,
        activo: activo === undefined ? true : activo === "true",
        foto,
      },
      include: { rol: true },
    });
    res.status(201).json(sinPassword(usuario));
  } catch (err: any) {
    if (foto) await borrarArchivo(foto);
    if (err?.code === "P2002") {
      const campo = err.meta?.target?.[0] === "cedula" ? "La cédula" : "El nombre de usuario";
      return res.status(400).json({ error: `${campo} ya está registrado` });
    }
    throw err;
  }
});

usuariosRouter.put("/:id", upload.single("foto"), async (req, res) => {
  const id = Number(req.params.id);
  const existente = await prisma.usuario.findUnique({ where: { id }, include: { rol: true } });
  if (!existente) return res.status(404).json({ error: "No encontrado" });

  const { nombre, rolId, activo, password, cedula, celular, fechaNacimiento, quitarFoto } = req.body;

  if (req.usuario!.id === id && activo === "false") {
    return res.status(400).json({ error: "No puedes desactivar tu propia cuenta" });
  }
  if (password && String(password).length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
  }

  let nuevoRolId: number | undefined;
  if (rolId !== undefined && rolId !== "") {
    const rol = await prisma.rol.findUnique({ where: { id: Number(rolId) } });
    if (!rol) return res.status(400).json({ error: "Rol inválido" });
    nuevoRolId = rol.id;
  }

  let foto: string | null | undefined = undefined;
  if (req.file) {
    foto = await guardarArchivo("usuarios", req.file.buffer, req.file.originalname, req.file.mimetype);
    await borrarArchivo(existente.foto ?? "");
  } else if (quitarFoto === "true") {
    if (existente.foto) await borrarArchivo(existente.foto);
    foto = null;
  }

  const antes = camposUsuario({ ...existente, rolNombre: existente.rol.nombre });

  try {
    const usuario = await prisma.usuario.update({
      where: { id },
      data: {
        nombre,
        rolId: nuevoRolId,
        activo: activo === undefined ? undefined : activo === "true" || activo === true,
        passwordHash: password ? await bcrypt.hash(password, 10) : undefined,
        cedula: cedula === undefined ? undefined : cedula || null,
        celular: celular === undefined ? undefined : celular || null,
        fechaNacimiento: fechaNacimiento === undefined ? undefined : fechaNacimiento ? new Date(fechaNacimiento) : null,
        foto,
      },
      include: { rol: true },
    });
    await registrarCambios("usuario", id, antes, camposUsuario({ ...usuario, rolNombre: usuario.rol.nombre }), req.usuario!.id);
    if (password) await registrarCambioContrasena(id, req.usuario!.id);
    res.json(sinPassword(usuario));
  } catch (err: any) {
    if (foto) await borrarArchivo(foto);
    if (err?.code === "P2002") {
      return res.status(400).json({ error: "La cédula ya está registrada en otro usuario" });
    }
    throw err;
  }
});

usuariosRouter.delete("/:id", async (req, res) => {
  if (req.usuario!.id === Number(req.params.id)) {
    return res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });
  }
  const usuario = await prisma.usuario.findUnique({ where: { id: Number(req.params.id) } });
  if (!usuario) return res.status(404).json({ error: "No encontrado" });
  await prisma.usuario.delete({ where: { id: usuario.id } });
  if (usuario.foto) await borrarArchivo(usuario.foto);
  res.status(204).end();
});
