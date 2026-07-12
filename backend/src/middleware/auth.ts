import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("Falta la variable de entorno JWT_SECRET");

export interface UsuarioToken {
  id: number;
  rol: string;
  permisos: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioToken;
    }
  }
}

export function firmarToken(payload: { id: number }): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: "30d" });
}

// Token aparte para ver fotos (/uploads/*), NO el de sesión. Vive poco (20 min) y solo sirve
// para eso: si un link de foto se filtra (queda en el historial del navegador, en logs de
// Cloudflare, etc.) expira rápido y no da acceso a nada más de la API, a diferencia de usar
// el token de sesión de 30 días directo en la URL.
export function firmarTokenMedia(id: number): string {
  return jwt.sign({ id, tipo: "media" }, JWT_SECRET!, { expiresIn: "20m" });
}

async function usuarioDesdeId(id: number): Promise<UsuarioToken | null> {
  const usuario = await prisma.usuario.findUnique({
    where: { id },
    include: { rol: { include: { permisos: { include: { permiso: true } } } } },
  });
  if (!usuario || !usuario.activo) return null;
  return {
    id: usuario.id,
    rol: usuario.rol.nombre,
    permisos: usuario.rol.permisos.map((rp) => rp.permiso.clave),
  };
}

// Valida un JWT de sesión normal y devuelve los datos del usuario (o null).
export async function verificarToken(token: string): Promise<UsuarioToken | null> {
  try {
    const payload = jwt.verify(token, JWT_SECRET!) as { id: number; tipo?: string };
    if (payload.tipo) return null; // es un token de otro tipo (ej. "media"), no de sesión
    return await usuarioDesdeId(payload.id);
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "No autenticado" });

  const usuario = await verificarToken(header.slice(7));
  if (!usuario) return res.status(401).json({ error: "Sesión inválida o expirada" });
  req.usuario = usuario;
  next();
}

// Protege /uploads/*: solo acepta un token de tipo "media" (ver firmarTokenMedia), nunca el
// token de sesión completo, y solo por query string (?token=...) ya que <img src>/<a href>
// no pueden mandar el header Authorization.
export async function requireAuthQuery(req: Request, res: Response, next: NextFunction) {
  const token = String(req.query.token ?? "");
  if (!token) return res.status(401).json({ error: "No autenticado" });

  try {
    const payload = jwt.verify(token, JWT_SECRET!) as { id: number; tipo?: string };
    if (payload.tipo !== "media") return res.status(401).json({ error: "Enlace de archivo no válido" });
    const usuario = await usuarioDesdeId(payload.id);
    if (!usuario) return res.status(401).json({ error: "No autenticado" });
    req.usuario = usuario;
    next();
  } catch {
    return res.status(401).json({ error: "Enlace de archivo expirado" });
  }
}

// Requiere que el usuario tenga AL MENOS UNO de los permisos indicados.
export function requirePermiso(...claves: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario || !claves.some((c) => req.usuario!.permisos.includes(c))) {
      return res.status(403).json({ error: "No autorizado" });
    }
    next();
  };
}
