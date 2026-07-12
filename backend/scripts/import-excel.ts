import XLSX from "xlsx";
import { prisma } from "../src/lib/prisma.js";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Uso: npm run import -- <ruta al .xlsx>");
  process.exit(1);
}

function excelDateToJSDate(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
}

function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

function colIndex(headers: string[], startsWith: string): number {
  return headers.findIndex((h) => norm(h).startsWith(startsWith));
}

function colIndexContains(headers: string[], ...palabras: string[]): number {
  return headers.findIndex((h) => {
    const n = norm(h);
    return palabras.every((p) => n.includes(p));
  });
}

async function importMedidores(wb: XLSX.WorkBook) {
  const sheet = wb.Sheets["MEDIDORES"];
  if (!sheet) {
    console.warn("Hoja MEDIDORES no encontrada, se omite.");
    return;
  }
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
  const headers = rows[0].map((h) => String(h ?? ""));

  const iNombre = colIndex(headers, "NOMBRE DE SUSCRIPTOR");
  const iFechaInst = colIndex(headers, "FECHA DE INSTALACION");
  const iTipo = colIndex(headers, "TIPO DE MEDIDOR");
  const iFechaFab = colIndex(headers, "FECHA DE FABRICACION");
  const iFechaCert = colIndex(headers, "FECHA DE CERTIFICACION");
  const iClase = colIndex(headers, "CLASE DE MEDIDOR");
  const iDiametro = colIndex(headers, "DIAMETRO");
  const iCertificado = colIndex(headers, "CERTIFICADO MEDIDOR");
  const iSerial = colIndexContains(headers, "SERIAL", "MEDIDOR");
  const iCodigo = colIndexContains(headers, "CODIGO", "SUSCRIPTOR"); // código numérico único del suscriptor (ej "1613")
  const iRuta = colIndex(headers, "RUTA"); // ruta con formato "01-383"
  const iLecturaInicial = colIndex(headers, "LECTURA INICIAL");

  let creados = 0;
  let cotitulares = 0;
  for (const row of rows.slice(1)) {
    const nombreRaw = row[iNombre];
    const codigoRaw = row[iCodigo];
    const rutaRaw = row[iRuta];
    if (!nombreRaw || !codigoRaw) continue;

    // Algunas celdas traen varios códigos/nombres/rutas separados por salto de línea: un medidor
    // multiusuario (una acometida que sirve a varios apartamentos/suscriptores).
    const codigos = String(codigoRaw)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const nombres = String(nombreRaw)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const rutas = rutaRaw != null
      ? String(rutaRaw)
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const nombreBase = nombres[0] ?? String(nombreRaw).trim();
    const rutaBase = rutas.length === codigos.length ? rutas[0] : rutaRaw != null ? String(rutaRaw) : null;

    const suscriptor = await prisma.suscriptor.upsert({
      where: { codigo: codigos[0] },
      create: {
        nombre: nombreBase,
        codigo: codigos[0],
        ruta: rutaBase,
      },
      update: { nombre: nombreBase, ruta: rutaBase },
    });

    const fechaInstalacion = row[iFechaInst];
    const fechaFabricacion = row[iFechaFab];
    const fechaCertificacion = row[iFechaCert];
    const lecturaInicial = row[iLecturaInicial];

    const serialRaw = iSerial >= 0 ? row[iSerial] : null;
    const serial = serialRaw != null && serialRaw !== "" ? String(serialRaw).trim() : null;

    let medidor = await prisma.medidor.findFirst({ where: { suscriptorId: suscriptor.id } });
    if (!medidor) {
      const diametroValor = iDiametro >= 0 ? String(row[iDiametro] ?? "").trim() : "";
      const diametroCat = diametroValor
        ? await prisma.diametroMedidor.upsert({ where: { valor: diametroValor }, create: { valor: diametroValor }, update: {} })
        : null;
      medidor = await prisma.medidor.create({
        data: {
          suscriptorId: suscriptor.id,
          serial,
          fechaInstalacion: typeof fechaInstalacion === "number" ? excelDateToJSDate(fechaInstalacion) : null,
          tipo: iTipo >= 0 ? String(row[iTipo] ?? "") : null,
          fechaFabricacion: typeof fechaFabricacion === "number" ? excelDateToJSDate(fechaFabricacion) : null,
          fechaCertificacion: typeof fechaCertificacion === "number" ? excelDateToJSDate(fechaCertificacion) : null,
          clase: iClase >= 0 ? String(row[iClase] ?? "") : null,
          diametroId: diametroCat?.id ?? null,
          certificado: iCertificado >= 0 ? String(row[iCertificado] ?? "") : null,
          lecturaInicial: typeof lecturaInicial === "number" ? lecturaInicial : 0,
        },
      });
      creados++;
    }

    // códigos adicionales = cotitulares del mismo medidor (acometida compartida)
    for (let i = 1; i < codigos.length; i++) {
      const nombreCotitular = nombres.length === codigos.length ? nombres[i] : `${nombreBase} (cotitular ${i + 1})`;
      const rutaCotitular = rutas.length === codigos.length ? rutas[i] : rutaBase;
      const cotitularSuscriptor = await prisma.suscriptor.upsert({
        where: { codigo: codigos[i] },
        create: {
          nombre: nombreCotitular,
          codigo: codigos[i],
          ruta: rutaCotitular,
        },
        update: { nombre: nombreCotitular, ruta: rutaCotitular },
      });
      await prisma.cotitular.upsert({
        where: { suscriptorId: cotitularSuscriptor.id },
        create: { suscriptorId: cotitularSuscriptor.id, medidorId: medidor.id },
        update: { medidorId: medidor.id },
      });
      cotitulares++;
    }
  }
  console.log(`MEDIDORES: ${creados} medidores creados, ${cotitulares} cotitulares vinculados.`);
}

async function importLecturas(wb: XLSX.WorkBook, sheetName: string, anio: number) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    console.warn(`Hoja ${sheetName} no encontrada, se omite.`);
    return;
  }
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

  // La fila de encabezado real no siempre es la primera (algunas hojas tienen un título arriba)
  const headerRowIdx = rows.findIndex((r) => r.some((c) => norm(c).startsWith("LECTURA INICIAL")));
  if (headerRowIdx === -1) {
    console.warn(`${sheetName}: no se encontró encabezado "LECTURA INICIAL", se omite.`);
    return;
  }
  const headers = rows[headerRowIdx].map((h) => String(h ?? ""));

  const iCodigo = colIndexContains(headers, "CODIGO", "SUSCRIPTOR");
  const iLecturaInicialCol = colIndex(headers, "LECTURA INICIAL");

  // Columnas posteriores a LECTURA INICIAL, clasificadas como LECTURA o CONSUMO (se ignoran columnas vacías/otras)
  const clasificadas: { idx: number; tipo: "L" | "C" }[] = [];
  for (let i = iLecturaInicialCol + 1; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (!h) continue;
    if (h.includes("CONSUMO")) clasificadas.push({ idx: i, tipo: "C" });
    else if (h.includes("LECTURA")) clasificadas.push({ idx: i, tipo: "L" });
  }

  // Si hay un número impar de columnas, la primera es la lectura base (diciembre del año anterior)
  let baselineIdx: number | null = null;
  let resto = clasificadas;
  if (clasificadas.length % 2 === 1 && clasificadas[0].tipo === "L") {
    baselineIdx = clasificadas[0].idx;
    resto = clasificadas.slice(1);
  }

  let creadas = 0;
  for (const row of rows.slice(headerRowIdx + 1)) {
    const codigo = row[iCodigo];
    if (!codigo) continue;

    const suscriptor = await prisma.suscriptor.findUnique({ where: { codigo: String(codigo) } });
    if (!suscriptor) continue;
    const medidor = await prisma.medidor.findFirst({ where: { suscriptorId: suscriptor.id } });
    if (!medidor) continue;

    let lecturaPrevia = Number(medidor.lecturaInicial ?? 0);
    if (baselineIdx !== null) {
      const baseVal = Number(row[baselineIdx]);
      if (Number.isFinite(baseVal)) {
        await prisma.lectura.upsert({
          where: { medidorId_periodo: { medidorId: medidor.id, periodo: new Date(Date.UTC(anio - 1, 11, 1)) } },
          create: {
            medidorId: medidor.id,
            periodo: new Date(Date.UTC(anio - 1, 11, 1)),
            valorLectura: baseVal,
            consumo: baseVal - lecturaPrevia,
          },
          update: { valorLectura: baseVal },
        });
        lecturaPrevia = baseVal;
        creadas++;
      }
    }

    // pares (LECTURA, CONSUMO) en cualquier orden, agrupados de a 2 = un mes cada uno
    let mes = 1;
    for (let i = 0; i + 1 < resto.length; i += 2, mes++) {
      const a = resto[i];
      const b = resto[i + 1];
      const lecturaCol = a.tipo === "L" ? a : b;
      const consumoCol = a.tipo === "C" ? a : b;
      const lectura = row[lecturaCol.idx];
      const consumo = row[consumoCol.idx];
      if (lectura == null || lectura === "") continue;

      const valorLectura = Number(lectura);
      if (!Number.isFinite(valorLectura)) continue;
      const consumoNum = Number.isFinite(Number(consumo)) ? Number(consumo) : valorLectura - lecturaPrevia;

      await prisma.lectura.upsert({
        where: { medidorId_periodo: { medidorId: medidor.id, periodo: new Date(Date.UTC(anio, mes - 1, 1)) } },
        create: {
          medidorId: medidor.id,
          periodo: new Date(Date.UTC(anio, mes - 1, 1)),
          valorLectura,
          consumo: consumoNum,
        },
        update: { valorLectura, consumo: consumoNum },
      });
      lecturaPrevia = valorLectura;
      creadas++;
    }
  }
  console.log(`${sheetName}: ${creadas} lecturas importadas.`);
}

async function main() {
  const wb = XLSX.readFile(filePath);
  await importMedidores(wb);
  await importLecturas(wb, "LECTURAS MEDIDORES 2024", 2024);
  await importLecturas(wb, "LECTURA MEDIDORES 2025", 2025);
  await importLecturas(wb, "LECTURA MEDIDORES 2026", 2026);
  console.log("Importación finalizada.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
