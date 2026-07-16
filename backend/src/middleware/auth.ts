import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("Falta la variable de entorno JWT_SECRET");

export interface UsuarioToken {
  id: number;
  rol: string;
  permisos: string[];
  jti?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioToken;
    }
  }
}

// Duración del token de sesión — reducida de 30 a 1 día tras un incidente donde una contraseña
// se cambió sin dejar rastro y una sesión vieja siguió activa igual (ver Auditoría de sesiones).
// Con datos sensibles de suscriptores de por medio, se prefiere que la gente vuelva a loguearse
// seguido en vez de dejar ventanas largas de token válido sin forma de revocarlo antes.
// jti (JWT ID): identificador aleatorio único de ESTE token puntual, no del usuario — es lo que
// permite revocar una sesión individual desde Auditoría (ver InicioSesion.jti/revocada en
// schema.prisma) sin afectar las demás sesiones del mismo usuario en otros dispositivos.
export function nuevoJti(): string {
  return randomUUID();
}

export function firmarToken(payload: { id: number; jti: string }): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: "1d" });
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

// Valida un JWT de sesión normal y devuelve los datos del usuario (o null). Además de la firma
// y expiración (que ya revisa jwt.verify), checkea que la sesión no haya sido revocada a mano
// desde Auditoría — es la única forma de "cerrar sesión" de otro dispositivo antes de que el
// token expire solo.
export async function verificarToken(token: string): Promise<UsuarioToken | null> {
  try {
    const payload = jwt.verify(token, JWT_SECRET!) as { id: number; tipo?: string; jti?: string };
    if (payload.tipo) return null; // es un token de otro tipo (ej. "media"), no de sesión

    if (payload.jti) {
      const sesion = await prisma.inicioSesion.findUnique({ where: { jti: payload.jti } });
      if (sesion?.revocada) return null;
    }

    const usuario = await usuarioDesdeId(payload.id);
    return usuario ? { ...usuario, jti: payload.jti } : null;
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

// Para catálogos de solo lectura (marca/modelo/diámetro/lote de medidores): cualquiera que
// pueda VER medidores necesita poder leer estos catálogos para que la pantalla cargue (filtros,
// nombre de marca/modelo en cada fila) — sin esto, un rol con "medidores_ver" pero sin
// "catalogos" ve la lista de medidores vacía, porque el frontend pide medidores y catálogos en
// paralelo con Promise.all y basta que uno de los catálogos devuelva 403 para que la promesa
// combinada se rechace y no se pinte nada. Crear/editar/borrar catálogos sigue exigiendo
// "catalogos" a secas.
export function requirePermisoCatalogos(req: Request, res: Response, next: NextFunction) {
  const lecturaClaves = ["catalogos", "medidores_ver", "medidores_avanzado"];
  const claves = req.method === "GET" ? lecturaClaves : ["catalogos"];
  if (!req.usuario || !claves.some((c) => req.usuario!.permisos.includes(c))) {
    return res.status(403).json({ error: "No autorizado" });
  }
  next();
}

// Patrón genérico "ver/avanzado": los GET aceptan cualquiera de los dos permisos, el resto de
// métodos (crear/editar/borrar) exige el de avanzado exclusivamente.
export function requirePermisoVerAvanzado(claveVer: string, claveAvanzado: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const claves = req.method === "GET" ? [claveVer, claveAvanzado] : [claveAvanzado];
    if (!req.usuario || !claves.some((c) => req.usuario!.permisos.includes(c))) {
      return res.status(403).json({ error: "No autorizado" });
    }
    next();
  };
}
