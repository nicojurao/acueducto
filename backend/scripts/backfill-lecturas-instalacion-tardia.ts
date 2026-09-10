// Backfill de lecturas faltantes por instalación tardía (medidor ingresado al sistema después de
// que ya había pasado la toma de lecturas de ese mes). Para cada caso, crea la lectura del
// periodo faltante con valorLectura = lecturaInicial (consumo 0), igual que se hizo a mano para
// el NUID 4314. Reemplaza al script manual de consola (mismo criterio, corrido directo contra la
// BD en vez de por HTTP) para los 45 casos detectados con ese patrón.
import { prisma } from "../src/lib/prisma.js";
import { primerDiaMes } from "../src/lib/periodo.js";
import { periodoEstaCerrado } from "../src/lib/periodoFacturacion.js";
import { registrarCambioLectura } from "../src/lib/historial.js";

const CASOS: { medidorId: number; periodo: string; lecturaInicial: number }[] = [
  { medidorId: 4509, periodo: "2023-07", lecturaInicial: 1.0 },
  { medidorId: 4350, periodo: "2024-04", lecturaInicial: 1.0 },
  { medidorId: 4363, periodo: "2024-04", lecturaInicial: 1.0 },
  { medidorId: 4355, periodo: "2024-04", lecturaInicial: 1.0 },
  { medidorId: 4364, periodo: "2024-04", lecturaInicial: 1.0 },
  { medidorId: 4361, periodo: "2024-04", lecturaInicial: 1.0 },
  { medidorId: 4359, periodo: "2024-04", lecturaInicial: 1.0 },
  { medidorId: 4362, periodo: "2024-04", lecturaInicial: 1.0 },
  { medidorId: 4482, periodo: "2024-04", lecturaInicial: 1.0 },
  { medidorId: 4354, periodo: "2024-04", lecturaInicial: 1.0 },
  { medidorId: 4360, periodo: "2024-04", lecturaInicial: 1.0 },
  { medidorId: 4365, periodo: "2024-04", lecturaInicial: 1.0 },
  { medidorId: 4356, periodo: "2024-04", lecturaInicial: 1.0 },
  { medidorId: 4357, periodo: "2024-04", lecturaInicial: 1.0 },
  { medidorId: 4358, periodo: "2024-04", lecturaInicial: 1.0 },
  { medidorId: 4351, periodo: "2024-04", lecturaInicial: 1.0 },
  { medidorId: 4352, periodo: "2024-04", lecturaInicial: 1.0 },
  { medidorId: 4353, periodo: "2024-04", lecturaInicial: 1.0 },
  { medidorId: 4391, periodo: "2024-08", lecturaInicial: 1.0 },
  { medidorId: 4393, periodo: "2024-08", lecturaInicial: 1.0 },
  { medidorId: 4392, periodo: "2024-08", lecturaInicial: 1.0 },
  { medidorId: 4390, periodo: "2024-08", lecturaInicial: 1.0 },
  { medidorId: 4445, periodo: "2025-01", lecturaInicial: 1.0 },
  { medidorId: 4440, periodo: "2025-01", lecturaInicial: 1.0 },
  { medidorId: 4444, periodo: "2025-01", lecturaInicial: 1.0 },
  { medidorId: 4439, periodo: "2025-01", lecturaInicial: 1.0 },
  { medidorId: 4442, periodo: "2025-01", lecturaInicial: 1.0 },
  { medidorId: 4443, periodo: "2025-01", lecturaInicial: 1.0 },
  { medidorId: 4441, periodo: "2025-01", lecturaInicial: 1.0 },
  { medidorId: 4453, periodo: "2025-04", lecturaInicial: 1.0 },
  { medidorId: 4507, periodo: "2025-04", lecturaInicial: 1.0 },
  { medidorId: 4451, periodo: "2025-04", lecturaInicial: 1.0 },
  { medidorId: 4452, periodo: "2025-04", lecturaInicial: 1.0 },
  { medidorId: 4454, periodo: "2025-04", lecturaInicial: 1.0 },
  { medidorId: 4508, periodo: "2025-04", lecturaInicial: 1.0 },
  { medidorId: 4468, periodo: "2025-08", lecturaInicial: 1.0 },
  { medidorId: 4480, periodo: "2025-09", lecturaInicial: 1.0 },
  { medidorId: 4487, periodo: "2025-10", lecturaInicial: 1.0 },
  { medidorId: 4490, periodo: "2025-11", lecturaInicial: 1.0 },
  { medidorId: 4504, periodo: "2025-12", lecturaInicial: 1.0 },
  { medidorId: 4503, periodo: "2025-12", lecturaInicial: 1.0 },
  { medidorId: 4530, periodo: "2026-05", lecturaInicial: 1.0 },
  { medidorId: 4532, periodo: "2026-05", lecturaInicial: 1.0 },
  { medidorId: 4697, periodo: "2026-07", lecturaInicial: 1.0 },
  { medidorId: 4698, periodo: "2026-07", lecturaInicial: 1.0 },
];

const OBSERVACION =
  "Lectura registrada retroactivamente: medidor ingresado al sistema después de la toma de lecturas de este periodo. Sin consumo desde la instalación (valorLectura = lecturaInicial).";

async function recalcularConsumoSiguiente(medidorId: number, periodo: Date) {
  const siguiente = await prisma.lectura.findFirst({
    where: { medidorId, periodo: { gt: periodo } },
    orderBy: { periodo: "asc" },
  });
  if (!siguiente) return;

  const anterior = await prisma.lectura.findFirst({
    where: { medidorId, periodo: { lt: siguiente.periodo } },
    orderBy: { periodo: "desc" },
  });
  const medidor = await prisma.medidor.findUnique({ where: { id: medidorId } });
  const base = anterior?.valorLectura ?? medidor?.lecturaInicial ?? 0;
  const consumoCorrecto = Number(siguiente.valorLectura) - Number(base);
  if (Number(siguiente.consumo) !== consumoCorrecto) {
    await prisma.lectura.update({ where: { id: siguiente.id }, data: { consumo: consumoCorrecto } });
  }
}

async function main() {
  const creados: number[] = [];
  const omitidos: { medidorId: number; motivo: string }[] = [];

  for (const caso of CASOS) {
    const fecha = primerDiaMes(caso.periodo);

    const medidor = await prisma.medidor.findUnique({ where: { id: caso.medidorId } });
    if (!medidor) {
      omitidos.push({ medidorId: caso.medidorId, motivo: "medidor no encontrado" });
      continue;
    }
    if (Number(medidor.lecturaInicial ?? 0) !== caso.lecturaInicial) {
      omitidos.push({
        medidorId: caso.medidorId,
        motivo: `lecturaInicial actual (${medidor.lecturaInicial}) no coincide con la esperada (${caso.lecturaInicial}) — se saltó por seguridad`,
      });
      continue;
    }

    const existente = await prisma.lectura.findUnique({
      where: { medidorId_periodo: { medidorId: caso.medidorId, periodo: fecha } },
    });
    if (existente) {
      omitidos.push({ medidorId: caso.medidorId, motivo: `ya existe una lectura para ${caso.periodo}` });
      continue;
    }

    if (await periodoEstaCerrado(fecha)) {
      omitidos.push({ medidorId: caso.medidorId, motivo: `periodo ${caso.periodo} está cerrado` });
      continue;
    }

    const novedadPrevia = await prisma.novedadLectura.findUnique({
      where: { medidorId_periodo: { medidorId: caso.medidorId, periodo: fecha } },
    });
    if (novedadPrevia) {
      omitidos.push({ medidorId: caso.medidorId, motivo: `ya tiene una novedad para ${caso.periodo}` });
      continue;
    }

    await prisma.lectura.create({
      data: {
        medidorId: caso.medidorId,
        periodo: fecha,
        valorLectura: caso.lecturaInicial,
        consumo: 0,
        observaciones: OBSERVACION,
        capturadoPorId: null,
      },
    });

    await registrarCambioLectura(caso.medidorId, fecha, null, String(caso.lecturaInicial));
    await recalcularConsumoSiguiente(caso.medidorId, fecha);

    creados.push(caso.medidorId);
    console.log(`OK  medidor ${caso.medidorId} periodo ${caso.periodo}`);
  }

  console.log(`\nCreadas: ${creados.length} de ${CASOS.length}`);
  if (omitidos.length > 0) {
    console.log("Omitidos:");
    for (const o of omitidos) console.log(`  medidor ${o.medidorId}: ${o.motivo}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
