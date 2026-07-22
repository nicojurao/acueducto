// Script puntual: carga las lecturas de junio 2026 desde un Excel (columnas NUID, LECTURA).
// Uso: dentro del contenedor backend -> npx tsx scripts/cargar-lecturas-junio.ts /tmp/lecturas.xlsx
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PERIODO = "2026-06";

function primerDiaMes(periodo: string): Date {
  const [y, m] = periodo.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

async function registrarCambioLectura(
  medidorId: number,
  periodo: Date,
  valorAnterior: string | null,
  valorNuevo: string | null
) {
  await prisma.historialCambio.create({
    data: {
      entidad: "medidor",
      entidadId: medidorId,
      campo: `Lectura ${periodo.getUTCFullYear()}-${String(periodo.getUTCMonth() + 1).padStart(2, "0")}`,
      valorAnterior,
      valorNuevo,
      usuarioId: null,
    },
  });
}

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
  const archivo = process.argv[2] ?? "/tmp/lecturas.xlsx";
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(archivo);
  const ws = wb.worksheets[0];

  const rows: { nuid: string; lectura: number; fila: number }[] = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const nuid = row.getCell(1).value;
    const lectura = row.getCell(2).value;
    if (nuid === null || nuid === undefined) continue;
    rows.push({ nuid: String(nuid).trim(), lectura: Number(lectura), fila: i });
  }
  console.log(`Filas leídas: ${rows.length}`);

  const fecha = primerDiaMes(PERIODO);
  const nuids = [...new Set(rows.map((r) => r.nuid))];
  const suscriptores = await prisma.suscriptor.findMany({ where: { codigo: { in: nuids } } });
  const suscriptorPorCodigo = new Map(suscriptores.map((s) => [s.codigo, s]));

  const medidoresActivos = await prisma.medidor.findMany({
    where: { suscriptorId: { in: suscriptores.map((s) => s.id) }, activo: true },
  });
  const medidoresPorSuscriptor = new Map<number, typeof medidoresActivos>();
  for (const m of medidoresActivos) {
    if (m.suscriptorId == null) continue;
    const lista = medidoresPorSuscriptor.get(m.suscriptorId) ?? [];
    lista.push(m);
    medidoresPorSuscriptor.set(m.suscriptorId, lista);
  }

  const medidorIds = medidoresActivos.map((m) => m.id);
  const lecturasAnteriores = await prisma.lectura.findMany({
    where: { medidorId: { in: medidorIds }, periodo: { lt: fecha } },
    orderBy: { periodo: "desc" },
  });
  const anteriorPorMedidor = new Map<number, (typeof lecturasAnteriores)[number]>();
  for (const l of lecturasAnteriores) {
    if (!anteriorPorMedidor.has(l.medidorId)) anteriorPorMedidor.set(l.medidorId, l);
  }

  let creados = 0;
  let actualizados = 0;
  let omitidos = 0;
  const nuidsVistos = new Set<string>();
  const observaciones: string[] = [];

  for (const r of rows) {
    if (nuidsVistos.has(r.nuid)) {
      omitidos++;
      observaciones.push(`Fila ${r.fila}: NUID ${r.nuid} repetido en el archivo`);
      continue;
    }
    nuidsVistos.add(r.nuid);

    if (Number.isNaN(r.lectura)) {
      omitidos++;
      observaciones.push(`Fila ${r.fila}: NUID ${r.nuid} - lectura no numérica`);
      continue;
    }

    const suscriptor = suscriptorPorCodigo.get(r.nuid);
    if (!suscriptor) {
      omitidos++;
      observaciones.push(`Fila ${r.fila}: NUID ${r.nuid} no existe entre los suscriptores`);
      continue;
    }

    const medidores = medidoresPorSuscriptor.get(suscriptor.id) ?? [];
    if (medidores.length === 0) {
      omitidos++;
      observaciones.push(`Fila ${r.fila}: NUID ${r.nuid} sin medidor activo asignado`);
      continue;
    }
    if (medidores.length > 1) {
      omitidos++;
      observaciones.push(`Fila ${r.fila}: NUID ${r.nuid} tiene más de un medidor activo`);
      continue;
    }

    const medidor = medidores[0];
    const base = anteriorPorMedidor.get(medidor.id)?.valorLectura ?? medidor.lecturaInicial ?? 0;
    const consumo = r.lectura - Number(base);
    if (consumo < 0) {
      omitidos++;
      observaciones.push(
        `Fila ${r.fila}: NUID ${r.nuid} - lectura (${r.lectura}) menor que la anterior (${base}), consumo negativo`
      );
      continue;
    }

    const existente = await prisma.lectura.findUnique({
      where: { medidorId_periodo: { medidorId: medidor.id, periodo: fecha } },
    });

    await prisma.lectura.upsert({
      where: { medidorId_periodo: { medidorId: medidor.id, periodo: fecha } },
      create: {
        medidorId: medidor.id,
        periodo: fecha,
        valorLectura: r.lectura,
        consumo,
        observaciones: "Cargado por Excel (lecturas junio)",
      },
      update: {
        valorLectura: r.lectura,
        consumo,
        observaciones: "Cargado por Excel (lecturas junio)",
      },
    });

    await registrarCambioLectura(medidor.id, fecha, existente?.valorLectura.toString() ?? null, String(r.lectura));
    await recalcularConsumoSiguiente(medidor.id, fecha);

    if (existente) actualizados++;
    else creados++;
  }

  console.log(`\nResultado: ${creados} creados, ${actualizados} actualizados, ${omitidos} omitidos`);
  if (observaciones.length > 0) {
    console.log("\nObservaciones:");
    observaciones.forEach((o) => console.log(" - " + o));
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
