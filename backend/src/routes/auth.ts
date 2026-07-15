import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma.js";
import { firmarToken, firmarTokenMedia, requireAuth } from "../middleware/auth.js";
import { guardarArchivo, borrarArchivo } from "../lib/storage.js";
import { resumenDispositivo } from "../lib/userAgent.js";
import { geolocalizarIp } from "../lib/geoip.js";
import { registrarCambioContrasena, registrarCambios, camposUsuario } from "../lib/historial.js";
import { ipCliente } from "../lib/ip.js";

export const authRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
});

// Frena fuerza bruta: 10 intentos de login por IP cada 15 minutos. La cédula es un dato
// bastante predecible/enumerable, así que sin esto el login queda expuesto a diccionario.
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera unos minutos e intenta de nuevo." },
});

function perfil(usuario: {
  id: number;
  nombre: string;
  nombreUsuario: string;
  activo: boolean;
  cedula: string | null;
  celular: string | null;
  fechaNacimiento: Date | null;
  foto: string | null;
  rol: { id: number; nombre: string; permisos: { permiso: { clave: string } }[] };
}) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    nombreUsuario: usuario.nombreUsuario,
    activo: usuario.activo,
    cedula: usuario.cedula,
    celular: usuario.celular,
    fechaNacimiento: usuario.fechaNacimiento,
    foto: usuario.foto,
    rol: { id: usuario.rol.id, nombre: usuario.rol.nombre },
    permisos: usuario.rol.permisos.map((rp) => rp.permiso.clave),
  };
}

// El login se hace con la cédula (usuarios normales) o con el nombre de usuario (el admin
// entra con su usuario, ej. "admin"): un mismo campo "identificador" que se busca contra
// ambas columnas.
authRouter.post("/login", limiteLogin, async (req, res) => {
  const { identificador, password } = req.body;
  if (!identificador || !password) {
    return res.status(400).json({ error: "identificador y password son requeridos" });
  }

  const valor = String(identificador).trim();
  const ipIntento = ipCliente(req);
  const userAgentIntento = req.headers["user-agent"];

  async function registrarIntentoFallido(motivo: string) {
    await prisma.intentoLoginFallido.create({
      data: {
        identificador: valor,
        ip: ipIntento,
        userAgent: userAgentIntento ?? null,
        dispositivo: resumenDispositivo(userAgentIntento),
        motivo,
      },
    });
  }

  const usuario = await prisma.usuario.findFirst({
    where: { OR: [{ nombreUsuario: valor }, { cedula: valor }] },
    include: { rol: { include: { permisos: { include: { permiso: true } } } } },
  });
  if (!usuario) {
    await registrarIntentoFallido("usuario_no_existe");
    return res.status(401).json({ error: "Credenciales inválidas" });
  }
  if (!usuario.activo) {
    await registrarIntentoFallido("cuenta_inactiva");
    return res.status(401).json({ error: "Credenciales inválidas" });
  }

  const valido = await bcrypt.compare(password, usuario.passwordHash);
  if (!valido) {
    await registrarIntentoFallido("contrasena_incorrecta");
    return res.status(401).json({ error: "Credenciales inválidas" });
  }

  const token = firmarToken({ id: usuario.id });

  // Registro de auditoría: la fila se crea antes de responder (rápido, solo INSERT local), pero
  // la geolocalización por IP pega a un servicio externo — se resuelve después, en segundo
  // plano, para no demorar el login si ip-api.com está lento o caído (ver lib/geoip.ts).
  const sesion = await prisma.inicioSesion.create({
    data: {
      usuarioId: usuario.id,
      ip: ipIntento,
      userAgent: userAgentIntento ?? null,
      dispositivo: resumenDispositivo(userAgentIntento),
    },
  });

  res.json({ token, usuario: perfil(usuario) });

  geolocalizarIp(ipIntento).then((geo) => {
    if (geo.ciudad || geo.region || geo.pais) {
      prisma.inicioSesion.update({ where: { id: sesion.id }, data: geo }).catch(() => {});
    }
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.usuario!.id },
    include: { rol: { include: { permisos: { include: { permiso: true } } } } },
  });
  if (!usuario) return res.status(404).json({ error: "No encontrado" });
  res.json(perfil(usuario));
});

// Autoservicio: cualquier usuario autenticado puede editar su propio nombre, celular, fecha de
// nacimiento, foto y contraseña — a diferencia de PUT /api/usuarios/:id (requiere el permiso
// "usuarios"), no permite tocar nombreUsuario, cédula, rol ni el estado activo.
authRouter.put("/perfil", requireAuth, upload.single("foto"), async (req, res) => {
  const existente = await prisma.usuario.findUnique({ where: { id: req.usuario!.id } });
  if (!existente) return res.status(404).json({ error: "No encontrado" });

  const { nombre, celular, fechaNacimiento, password, quitarFoto } = req.body;
  if (password && String(password).length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
  }

  let foto: string | null | undefined = undefined;
  if (req.file) {
    foto = await guardarArchivo("usuarios", req.file.buffer, req.file.originalname, req.file.mimetype);
    await borrarArchivo(existente.foto ?? "");
  } else if (quitarFoto === "true") {
    if (existente.foto) await borrarArchivo(existente.foto);
    foto = null;
  }

  const antes = camposUsuario(existente);

  const usuario = await prisma.usuario.update({
    where: { id: existente.id },
    data: {
      nombre: nombre !== undefined ? String(nombre).trim() : undefined,
      celular: celular === undefined ? undefined : celular || null,
      fechaNacimiento: fechaNacimiento === undefined ? undefined : fechaNacimiento ? new Date(fechaNacimiento) : null,
      passwordHash: password ? await bcrypt.hash(password, 10) : undefined,
      foto,
    },
    include: { rol: { include: { permisos: { include: { permiso: true } } } } },
  });
  await registrarCambios("usuario", existente.id, antes, camposUsuario(usuario), req.usuario!.id);
  if (password) await registrarCambioContrasena(existente.id, req.usuario!.id);
  res.json(perfil(usuario));
});

// Token de corta duración (20 min) solo para ver fotos vía /uploads/*. El frontend lo pide al
// iniciar sesión y lo renueva en segundo plano mientras haya sesión activa (ver
// frontend/src/api/client.ts, refrescarMediaToken) — así nunca se expone el token de sesión
// completo de 30 días en una URL.
authRouter.get("/media-token", requireAuth, (req, res) => {
  res.json({ token: firmarTokenMedia(req.usuario!.id), expiraEnSegundos: 20 * 60 });
});
