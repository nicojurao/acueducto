import { prisma } from "./prisma.js";

const ESTADOS_FACTURACION = ["sin_medidor", "instalado_prueba", "facturando", "inactivo"] as const;

// Mismo criterio que periodoActualStr() en routes/dashboard.ts: las lecturas de un periodo no
// empiezan a capturarse hasta el día 20, así que antes de esa fecha el mes calendario en curso
// todavía es el periodo facturable vigente.
function periodoActualStr(fecha: Date): string {
  let anio = fecha.getFullYear();
  let mes = fecha.getDate() < 20 ? fecha.getMonth() : fecha.getMonth() + 1;
  if (mes === 0) {
    mes = 12;
    anio -= 1;
  }
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

// Calcula y guarda la foto del periodo que está por cerrar, evaluado como si hoy fuera día 19
// (antes de que periodoActualStr() cambie de periodo el día 20) — así da igual qué día del mes
// corra esto, siempre apunta al periodo correcto.
async function calcularYGuardarSnapshot(periodo: string): Promise<void> {
  const [suscriptoresActivos, medidoresActivos, grupos] = await Promise.all([
    prisma.suscriptor.count({ where: { estadoPredio: "activo" } }),
    prisma.medidor.count({ where: { activo: true } }),
    prisma.suscriptor.groupBy({
      by: ["estadoFacturacion"],
      where: { estadoPredio: "activo" },
      _count: { _all: true },
    }),
  ]);
  const cantidades = new Map(grupos.map((g) => [g.estadoFacturacion, g._count._all]));

  await prisma.snapshotPeriodo.upsert({
    where: { periodo },
    create: {
      periodo,
      suscriptoresActivos,
      medidoresActivos,
      sinMedidor: cantidades.get("sin_medidor") ?? 0,
      instaladoPrueba: cantidades.get("instalado_prueba") ?? 0,
      facturando: cantidades.get("facturando") ?? 0,
      inactivo: cantidades.get("inactivo") ?? 0,
    },
    update: {
      suscriptoresActivos,
      medidoresActivos,
      sinMedidor: cantidades.get("sin_medidor") ?? 0,
      instaladoPrueba: cantidades.get("instalado_prueba") ?? 0,
      facturando: cantidades.get("facturando") ?? 0,
      inactivo: cantidades.get("inactivo") ?? 0,
    },
  });
}

// Corre una vez al día. Solo actúa entre el día 19 y el 22 del mes: el 19 es el día "oficial"
// (justo antes de que arranque la captura del periodo siguiente el día 20); el margen hasta el
// 22 es para no perder la foto si el backend estuvo caído justo ese día — si para el periodo que
// tocaba cerrar todavía no hay fila, la crea; si ya existe (se tomó a tiempo), no la toca de nuevo.
export async function tomarSnapshotPeriodoSiToca(logger: { error: (obj: unknown, msg: string) => void }) {
  try {
    const hoy = new Date();
    const dia = hoy.getDate();
    if (dia < 19 || dia > 22) return;

    const referencia = new Date(hoy);
    referencia.setDate(19);
    const periodo = periodoActualStr(referencia);

    const existente = await prisma.snapshotPeriodo.findUnique({ where: { periodo } });
    if (existente) return;

    await calcularYGuardarSnapshot(periodo);
  } catch (err) {
    logger.error({ err }, "Fallo al tomar el snapshot mensual del dashboard");
  }
}

export function iniciarCronSnapshotPeriodo(logger: { error: (obj: unknown, msg: string) => void }) {
  tomarSnapshotPeriodoSiToca(logger);
  setInterval(() => tomarSnapshotPeriodoSiToca(logger), 24 * 60 * 60 * 1000);
}

export { ESTADOS_FACTURACION, periodoActualStr };
