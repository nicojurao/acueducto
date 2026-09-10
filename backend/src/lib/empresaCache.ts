import { prisma } from "./prisma.js";
import type { Empresa } from "@prisma/client";

// Identidad de la entidad que opera este despliegue — antes vivía en variables de entorno
// (lib/empresa.ts, ya no existe) o hardcodeada; ahora es la fila única (id=1) del modelo Empresa,
// que el wizard de primer uso (o el panel de administración después) escribe. Se cachea en
// memoria porque se lee en CADA correo, CADA constancia en PDF, y en CADA request para CORS —
// invalidarEmpresaCache() se llama justo después de cualquier escritura (ver routes/administracion/
// empresa.ts) para que un cambio se refleje de inmediato, sin esperar a que expire nada.
let cache: Empresa | null = null;

const DEFAULTS: Omit<Empresa, "id" | "updatedAt"> = {
  nit: "",
  nitDv: "",
  nombre: "",
  nombreCorto: "",
  direccion: "",
  sitioWeb: "",
  email: "",
  telefonos: "",
  colorMarca: "#00487f",
  logoRuta: null,
  daneDepartamento: "",
  daneMunicipio: "",
  daneCentroPoblado: "",
  glnGs1: "",
  dominioOperativo: "",
  dominioPqrs: "",
  dominioCalidad: "",
  smtpHost: "",
  smtpPort: null,
  smtpUser: "",
  smtpPass: "",
  smtpFrom: "",
  configuradoEn: null,
};

export async function obtenerEmpresa(): Promise<Empresa> {
  if (cache) return cache;
  const fila = await prisma.empresa.findUnique({ where: { id: 1 } });
  cache = fila ?? { id: 1, updatedAt: new Date(), ...DEFAULTS };
  return cache;
}

export function invalidarEmpresaCache(): void {
  cache = null;
}
