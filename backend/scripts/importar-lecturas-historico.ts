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

// Saca mes/año de un encabezado de columna LECTURA a partir de la fecha que trae el título
// (ej. "LECTURA 20/01/2026", "JUNIO SEXTA LECTURA 20/06/2025"). Esto es inequívoco sin importar
// el orden de las columnas o si hay columnas extra (ej. una lectura de diciembre del año
// anterior colada como referencia) — a diferencia de emparejar por POSICIÓN, que se rompe en
// cuanto una hoja no sigue exactamente el mismo layout que las demás (ver [[project-convencion-
// lectura-periodo-2026-07]] en la memoria: esto YA se rompió una vez por confiar en la posición).
function fechaDeEncabezado(header: string): { mes: number; anio: number } | null {
  const m = header.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/);
  if (!m) return null;
  const mes = Number(m[2]);
  const anio = Number(m[3]);
  if (mes < 1 || mes > 12) return null;
  return { mes, anio };
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

  // Solo columnas de tipo LECTURA (no CONSUMO) — el consumo se recalcula siempre como
  // lectura_actual - lectura_previa, así no depende de emparejar bien la columna de CONSUMO.
  const columnasLectura: { idx: number; mes: number; anio: number }[] = [];
  for (let i = iLecturaInicialCol + 1; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (!h || !h.includes("LECTURA")) continue;
    const fecha = fechaDeEncabezado(headers[i]);
    if (fecha) columnasLectura.push({ idx: i, ...fecha });
  }

  return { filas: rows.slice(headerRowIdx + 1), iCodigo, columnasLectura };
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

      // Columnas de años anteriores (ej. diciembre del año pasado, colada en la hoja del año
      // actual como referencia) sirven para sembrar lecturaPrevia, pero no generan su propio
      // registro acá — ya deberían haber quedado guardadas al procesar la hoja de ese año.
      const columnasDelAnio = hoja.columnasLectura.filter((c) => c.anio === anio).sort((a, b) => a.mes - b.mes);
      const baseline = hoja.columnasLectura.filter((c) => c.anio === anio - 1).sort((a, b) => b.mes - a.mes)[0];
      if (baseline) {
        const baseVal = Number(row[baseline.idx]);
        if (Number.isFinite(baseVal)) lecturaPrevia = baseVal;
      }

      for (const col of columnasDelAnio) {
        const lectura = row[col.idx];
        if (lectura == null || lectura === "") continue;

        const valorLectura = Number(lectura);
        if (!Number.isFinite(valorLectura)) continue;
        const consumoNum = valorLectura - lecturaPrevia;
        const periodo = new Date(Date.UTC(col.anio, col.mes - 1, 1));

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
