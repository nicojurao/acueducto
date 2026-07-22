import ExcelJS from "exceljs";
import { COLOR_MARCA } from "./pdfBranding.js";

export const COLOR_MARCA_ARGB = `FF${COLOR_MARCA.replace("#", "").toUpperCase()}`;

// colorFondo: color ARGB (ej. "FFDCEEFB") para pintar toda la columna (encabezado y datos) —
// útil para resaltar un grupo de columnas relacionadas, ej. las de LECTURA en el informe ancho.
// ancho: si se omite, se calcula del largo del título (para que el encabezado no quede cortado).
export type ColumnaExcel = { titulo: string; clave: string; ancho?: number; colorFondo?: string };

function anchoColumna(c: ColumnaExcel): number {
  return c.ancho ?? Math.max(c.titulo.length + 2, 10);
}

// Excel de un "informe" (solo lectura): banda de título en el azul de marca, subtítulo,
// encabezado de columnas sombreado y filas alternadas — misma plantilla visual que los PDF
// institucionales. Úsalo para reportes que la gente solo consulta/imprime (lecturas, inventario),
// NUNCA para archivos que luego se vuelven a subir (ver crearPlantillaImportExport).
export async function crearInformeExcel(
  hoja: string,
  tituloReporte: string,
  subtitulo: string,
  columnas: ColumnaExcel[],
  filas: Record<string, unknown>[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(hoja);
  ws.columns = columnas.map((c) => ({ key: c.clave, width: anchoColumna(c) }));

  const filaTitulo = ws.addRow([tituloReporte]);
  ws.mergeCells(filaTitulo.number, 1, filaTitulo.number, columnas.length);
  filaTitulo.height = 24;
  filaTitulo.getCell(1).font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  filaTitulo.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_MARCA_ARGB } };
  filaTitulo.getCell(1).alignment = { vertical: "middle" };

  const filaSubtitulo = ws.addRow([subtitulo]);
  ws.mergeCells(filaSubtitulo.number, 1, filaSubtitulo.number, columnas.length);
  filaSubtitulo.getCell(1).font = { italic: true, size: 9, color: { argb: "FF64748B" } };

  ws.addRow([]);

  const filaEncabezados = ws.addRow(columnas.map((c) => c.titulo));
  colorearFilaEncabezado(filaEncabezados);

  agregarFilasAlternadas(ws, columnas, filas);

  ws.views = [{ state: "frozen", ySplit: filaEncabezados.number }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Excel de "plantilla" (se descarga, se edita a mano y se vuelve a subir por /import): el
// encabezado va coloreado igual que en los informes, pero SIN filas de título ni subtítulo
// encima — el importador de cada módulo asume que la fila 1 son los encabezados de columna.
export async function crearPlantillaImportExport(
  hoja: string,
  columnas: ColumnaExcel[],
  filas: Record<string, unknown>[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(hoja);
  ws.columns = columnas.map((c) => ({ key: c.clave, width: c.ancho ?? 18 }));

  const filaEncabezados = ws.addRow(columnas.map((c) => c.titulo));
  colorearFilaEncabezado(filaEncabezados);

  agregarFilasAlternadas(ws, columnas, filas);

  ws.views = [{ state: "frozen", ySplit: 1 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function colorearFilaEncabezado(fila: ExcelJS.Row) {
  fila.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_MARCA_ARGB } };
    cell.alignment = { vertical: "middle" };
  });
  fila.height = 18;
}

// "_resaltar: true" en una fila la pinta de un color de aviso (ej. para marcar una lectura que
// no se tomó) en vez de la franja alterna normal — úsalo agregando esa clave al objeto de la fila,
// no hace falta declararla en la lista de columnas. "_cotitular: true" la pinta de azul
// institucional claro (ej. para las filas de cotitulares de un medidor compartido, debajo de su
// titular) — pierde contra _resaltar si ambas aplican (falta de lectura manda).
function agregarFilasAlternadas(ws: ExcelJS.Worksheet, columnas: ColumnaExcel[], filas: Record<string, unknown>[]) {
  filas.forEach((fila, i) => {
    const filaExcel = ws.addRow(columnas.map((c) => fila[c.clave] ?? ""));
    if (fila._resaltar) {
      filaExcel.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFECACA" } };
        cell.font = { color: { argb: "FF991B1B" } };
      });
    } else if (fila._cotitular) {
      filaExcel.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBFDEF5" } };
      });
    } else if (i % 2 === 1) {
      filaExcel.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      });
    }
    // Las columnas con colorFondo (ej. LECTURA en el informe horizontal) se pintan encima de la
    // franja alterna, salvo que la fila ya esté resaltada en rojo por falta de lectura.
    if (!fila._resaltar) {
      columnas.forEach((c, idx) => {
        if (c.colorFondo) {
          filaExcel.getCell(idx + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.colorFondo } };
        }
      });
    }
  });
}

export function enviarExcel(res: import("express").Response, buffer: Buffer, nombreArchivo: string) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename=${nombreArchivo}`);
  res.send(buffer);
}
