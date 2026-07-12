import { prisma } from "./prisma.js";

type EntidadHistorial = "medidor" | "suscriptor";

const CONDICION_LABELS: Record<string, string> = { bueno: "Bueno", danado: "Dañado" };
const ESTADO_MEDIDOR_LABELS: Record<string, string> = { instalado: "Instalado", en_bodega: "En bodega" };
const ESTADO_FACTURACION_LABELS: Record<string, string> = {
  sin_medidor: "Sin medidor",
  instalado_prueba: "Instalado",
  facturando: "Facturando por medición",
  inactivo: "Medidor inactivo / dañado",
};
const ESTADO_PREDIO_LABELS: Record<string, string> = { activo: "Activo", inactivo: "Inactivo" };

function valorLegible(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "object" && "toNumber" in (v as any)) return String((v as any).toNumber());
  return String(v);
}

// Compara dos "snapshots" del mismo registro (mapas campo legible -> valor ya traducido a texto,
// nombres de catálogo resueltos en vez de IDs) y guarda un renglón de HistorialCambio por cada
// campo que haya cambiado. Se llama con el registro de ANTES y el de DESPUÉS de un mismo update;
// los campos que no vinieron en el body del PUT quedan iguales en ambos snapshots y no generan
// ningún renglón, así no hace falta distinguir a mano qué vino en el request.
export async function registrarCambios(
  entidad: EntidadHistorial,
  entidadId: number,
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
  usuarioId?: number
): Promise<void> {
  const campos = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  const registros: {
    entidad: string;
    entidadId: number;
    campo: string;
    valorAnterior: string | null;
    valorNuevo: string | null;
    usuarioId: number | null;
  }[] = [];

  for (const campo of campos) {
    const valorAnterior = valorLegible(antes[campo]);
    const valorNuevo = valorLegible(despues[campo]);
    if (valorAnterior !== valorNuevo) {
      registros.push({ entidad, entidadId, campo, valorAnterior, valorNuevo, usuarioId: usuarioId ?? null });
    }
  }

  if (registros.length > 0) await prisma.historialCambio.createMany({ data: registros });
}

// "Snapshot" legible de un Medidor para comparar antes/después. Recibe el registro con las
// relaciones de catálogo incluidas (marcaCat, modeloCat, diametroCat, lote).
export function camposMedidor(m: {
  serial: string | null;
  marcaCat: { nombre: string } | null;
  modeloCat: { nombre: string } | null;
  diametroCat: { valor: string } | null;
  lote: { serialInicial: string; serialFinal: string } | null;
  fechaInstalacion: Date | null;
  fechaFabricacion: Date | null;
  fechaCertificacion: Date | null;
  clase: string | null;
  certificado: string | null;
  lecturaInicial: unknown;
  activo: boolean;
  condicion: string;
  estado: string;
}): Record<string, unknown> {
  return {
    Serial: m.serial,
    Marca: m.marcaCat?.nombre ?? null,
    Modelo: m.modeloCat?.nombre ?? null,
    Diámetro: m.diametroCat?.valor ?? null,
    Lote: m.lote ? `${m.lote.serialInicial}-${m.lote.serialFinal}` : null,
    "Fecha de instalación": m.fechaInstalacion,
    "Fecha de fabricación": m.fechaFabricacion,
    "Fecha de certificación": m.fechaCertificacion,
    Clase: m.clase,
    "N° certificado": m.certificado,
    "Lectura inicial": m.lecturaInicial,
    Activo: m.activo,
    Condición: CONDICION_LABELS[m.condicion] ?? m.condicion,
    Estado: ESTADO_MEDIDOR_LABELS[m.estado] ?? m.estado,
  };
}

// "Snapshot" legible de un Suscriptor. Recibe el registro con barrioCat/estratoCat incluidos.
export function camposSuscriptor(s: {
  nombre: string;
  codigo: string;
  ruta: string | null;
  identificacion: string | null;
  barrioCat: { nombre: string } | null;
  direccion: string | null;
  direccionComercial: string | null;
  estratoCat: { codigo: string; etiqueta: string } | null;
  estadoFacturacion: string;
  estadoPredio: string;
}): Record<string, unknown> {
  return {
    Nombre: s.nombre,
    NUID: s.codigo,
    Ruta: s.ruta,
    Identificación: s.identificacion,
    Barrio: s.barrioCat?.nombre ?? null,
    Dirección: s.direccion,
    "Dirección comercial": s.direccionComercial,
    Estrato: s.estratoCat ? `${s.estratoCat.codigo} — ${s.estratoCat.etiqueta}` : null,
    "Estado de facturación": ESTADO_FACTURACION_LABELS[s.estadoFacturacion] ?? s.estadoFacturacion,
    "Estado del predio": ESTADO_PREDIO_LABELS[s.estadoPredio] ?? s.estadoPredio,
  };
}
