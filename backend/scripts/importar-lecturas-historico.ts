// Carga puntual del historial de consumos desde /data/lecturas.xlsx, reusando la misma lógica
// del endpoint POST /api/lecturas/importar-historico (formato ancho: una hoja por año, columna
// LECTURA INICIAL + pares LECTURA/CONSUMO por mes). Se hizo como script, en vez de subir el
// archivo por la UI, para no depender de credenciales de usuario.
import type ExcelJS from "exceljs";
import { prisma } from "../src/lib/prisma.js";
import { leerLibroDesdeArchivo, hojaAFilas } from "../src/lib/xlsxCompat.js";

const filePath = process.argv[2] ?? "/data/lecturas.xlsx";

function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

function colIndexContains(headers: string[], ...palabras: string[]): number {
  return headers.findIndex((h) => {
    const n = norm(h);
    return palabras.every((p) => n.includes(p));
  });
}

function hojasDeAnio(wb: ExcelJS.Workbook): { nombre: string; anio: number }[] {
  return wb.worksheets
    .map((h) => h.name)
    .filter((n) => norm(n).includes("LECTURA"))
    .map((nombre) => {
      const match = nombre.match(/\d{4}/);
      return match ? { nombre, anio: Number(match[0]) } : null;
    })
    .filter((x): x is { nombre: string; anio: number } => x !== null)
    .sort((a, b) => a.anio - b.anio);
}

function leerHojaLecturas(wb: ExcelJS.Workbook, nombreHoja: string) {
  const sheet = wb.getWorksheet(nombreHoja);
  if (!sheet) return null;
  const rows: any[][] = hojaAFilas(sheet);
  const headerRowIdx = rows.findIndex((r) => r.some((c) => norm(c).startsWith("LECTURA INICIAL")));
  if (headerRowIdx === -1) return null;

  const headers = rows[headerRowIdx].map((h) => String(h ?? ""));
  const iCodigo = colIndexContains(headers, "CODIGO", "SUSCRIPTOR");
  const iLecturaInicialCol = headers.findIndex((h) => norm(h).startsWith("LECTURA INICIAL"));

  const clasificadas: { idx: number; tipo: "L" | "C" }[] = [];
  for (let i = iLecturaInicialCol + 1; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (!h) continue;
    if (h.includes("CONSUMO")) clasificadas.push({ idx: i, tipo: "C" });
    else if (h.includes("LECTURA")) clasificadas.push({ idx: i, tipo: "L" });
  }

  let baselineIdx: number | null = null;
  let resto = clasificadas;
  if (clasificadas.length % 2 === 1 && clasificadas[0].tipo === "L") {
    baselineIdx = clasificadas[0].idx;
    resto = clasificadas.slice(1);
  }

  return { filas: rows.slice(headerRowIdx + 1), iCodigo, baselineIdx, resto };
}

async function main() {
  const wb = await leerLibroDesdeArchivo(filePath);
  const hojas = hojasDeAnio(wb);
  if (hojas.length === 0) {
    console.error("No se encontró ninguna hoja de lecturas (el nombre debe traer 'LECTURA' y el año).");
    process.exit(1);
  }
  console.log("Hojas detectadas:", hojas.map((h) => `${h.nombre} (${h.anio})`).join(", "));

  const suscriptores = await prisma.suscriptor.findMany({
    include: { medidores: { where: { activo: true }, take: 1 } },
  });
  const suscriptorPorCodigo = new Map(suscriptores.map((s) => [s.codigo, s]));

  let creados = 0;
  let actualizados = 0;
  let omitidos = 0;
  const observaciones: string[] = [];

  for (const { nombre, anio } of hojas) {
    const hoja = leerHojaLecturas(wb, nombre);
    if (!hoja) {
      observaciones.push(`Hoja "${nombre}": no se encontró el encabezado "LECTURA INICIAL", se omitió completa`);
      continue;
    }

    let filasHoja = 0;
    for (const row of hoja.filas) {
      const codigo = row[hoja.iCodigo];
      if (!codigo) continue;
      filasHoja++;

      const suscriptor = suscriptorPorCodigo.get(String(codigo));
      if (!suscriptor) {
        omitidos++;
        observaciones.push(`[${anio}] Omitido: NUID "${codigo}" no corresponde a ningún suscriptor cargado`);
        continue;
      }
      const medidor = suscriptor.medidores[0];
      if (!medidor) {
        omitidos++;
        observaciones.push(`[${anio}] Omitido: NUID "${codigo}" (${suscriptor.nombre}) todavía no tiene un medidor asignado`);
        continue;
      }

      let lecturaPrevia = Number(medidor.lecturaInicial ?? 0);

      if (hoja.baselineIdx !== null) {
        const baseVal = Number(row[hoja.baselineIdx]);
        if (Number.isFinite(baseVal)) {
          const periodo = new Date(Date.UTC(anio - 1, 11, 1));
          const existente = await prisma.lectura.findUnique({ where: { medidorId_periodo: { medidorId: medidor.id, periodo } } });
          await prisma.lectura.upsert({
            where: { medidorId_periodo: { medidorId: medidor.id, periodo } },
            create: { medidorId: medidor.id, periodo, valorLectura: baseVal, consumo: baseVal - lecturaPrevia },
            update: { valorLectura: baseVal },
          });
          existente ? actualizados++ : creados++;
          lecturaPrevia = baseVal;
        }
      }

      let mes = 1;
      for (let i = 0; i + 1 < hoja.resto.length; i += 2, mes++) {
        const a = hoja.resto[i];
        const b = hoja.resto[i + 1];
        const lecturaCol = a.tipo === "L" ? a : b;
        const consumoCol = a.tipo === "C" ? a : b;
        const lectura = row[lecturaCol.idx];
        const consumo = row[consumoCol.idx];
        if (lectura == null || lectura === "") continue;

        const valorLectura = Number(lectura);
        if (!Number.isFinite(valorLectura)) continue;
        const consumoNum = Number.isFinite(Number(consumo)) ? Number(consumo) : valorLectura - lecturaPrevia;
        const periodo = new Date(Date.UTC(anio, mes - 1, 1));

        const existente = await prisma.lectura.findUnique({ where: { medidorId_periodo: { medidorId: medidor.id, periodo } } });
        await prisma.lectura.upsert({
          where: { medidorId_periodo: { medidorId: medidor.id, periodo } },
          create: { medidorId: medidor.id, periodo, valorLectura, consumo: consumoNum },
          update: { valorLectura, consumo: consumoNum },
        });
        existente ? actualizados++ : creados++;
        lecturaPrevia = valorLectura;
      }
    }
    console.log(`${nombre}: ${filasHoja} filas con NUID procesadas.`);
  }

  console.log(`\nResultado: ${creados} lecturas creadas, ${actualizados} actualizadas, ${omitidos} filas omitidas.`);
  if (observaciones.length > 0) {
    console.log(`\nObservaciones (${observaciones.length}):`);
    for (const o of observaciones.slice(0, 50)) console.log(" -", o);
    if (observaciones.length > 50) console.log(`   ...y ${observaciones.length - 50} más.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
