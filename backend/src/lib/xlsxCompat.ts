// Capa fina sobre exceljs que imita la forma en que se usaba el paquete "xlsx" (SheetJS) en este
// proyecto — solo lectura, wb.Sheets[nombre] + sheet_to_json({ header: 1, raw: true }) — para
// poder quitar "xlsx" del todo sin reescribir la lógica de import/export de cada ruta/script.
// Se quitó "xlsx" porque tiene dos CVEs altos (prototype pollution + ReDoS) sin fix disponible en
// la librería, y estas rutas procesan archivos subidos por cualquier usuario con permiso de
// importar (superficie de ataque real, a diferencia de un script de un solo uso).
import ExcelJS from "exceljs";

export async function leerLibroDesdeBuffer(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  return wb;
}

export async function leerLibroDesdeArchivo(ruta: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ruta);
  return wb;
}

function celdaAValor(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    // Fórmula: usar el resultado calculado, no la fórmula en sí.
    if ("result" in v) return (v as ExcelJS.CellFormulaValue).result;
    // Texto enriquecido: concatenar los fragmentos en un solo string plano.
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    if ("text" in v) return (v as any).text;
  }
  return v;
}

// Equivalente a XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }): una fila por cada
// fila de la hoja, como array de valores en orden de columna (sin encabezados propios).
export function hojaAFilas(hoja: ExcelJS.Worksheet): unknown[][] {
  const filas: unknown[][] = [];
  hoja.eachRow({ includeEmpty: true }, (row) => {
    // row.values de exceljs es 1-indexado (values[0] siempre vacío) — se recorta para que las
    // filas queden 0-indexadas, igual que devolvía sheet_to_json.
    const valores = (row.values as ExcelJS.CellValue[]).slice(1).map(celdaAValor);
    filas.push(valores);
  });
  return filas;
}
