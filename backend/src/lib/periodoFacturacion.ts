import { prisma } from "./prisma.js";

// Un periodo de facturación cerrado congela sus lecturas y facturas (ver PeriodoFacturacion en
// schema.prisma). Este helper es el único punto donde se consulta ese estado — lo usan tanto
// las rutas de lecturas como las de facturación para rechazar cambios sobre un mes cerrado.
export async function periodoEstaCerrado(fechaPeriodo: Date): Promise<boolean> {
  const p = await prisma.periodoFacturacion.findUnique({ where: { periodo: fechaPeriodo } });
  return p?.estado === "cerrado";
}

export const MENSAJE_PERIODO_CERRADO =
  "Este periodo de facturación ya está cerrado y no admite cambios. Un usuario con permiso de facturación avanzada puede reabrirlo si es indispensable.";
