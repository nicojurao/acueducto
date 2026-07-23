import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, "../assets/logo-acbum.png");

export const COLOR_MARCA = "#00487f";

// Paleta y helpers de layout compartidos por todos los PDF con "cara" (actas, aforos): mismo
// azul corporativo, tarjetas con borde en vez de texto suelto, tabla real con encabezado
// sombreado. Centralizado acá para que un reporte nuevo no tenga que reinventar el estilo.
export const COLOR_PDF = {
  cian: COLOR_MARCA,
  cianClaro: "#eef5fb",
  texto: "#0f172a",
  muted: "#64748b",
  borde: "#cbd5e1",
  bordeSuave: "#e2e8f0",
};

export function tituloSeccionPdf(doc: PDFKit.PDFDocument, texto: string) {
  const x = doc.page.margins.left;
  doc.rect(x, doc.y + 1, 3, 12).fill(COLOR_PDF.cian);
  doc.fillColor(COLOR_PDF.texto).font("Helvetica-Bold").fontSize(11).text(texto, x + 8, doc.y);
  doc.font("Helvetica").fillColor(COLOR_PDF.texto);
  doc.moveDown(0.4);
}

export function saltoDePaginaSiHaceFaltaPdf(doc: PDFKit.PDFDocument, alturaNecesaria: number) {
  const limite = doc.page.height - doc.page.margins.bottom;
  if (doc.y + alturaNecesaria > limite) doc.addPage();
}

// Tarjeta de pares etiqueta/valor en dos columnas, con borde — reemplaza líneas de texto plano
// "Fecha: ... Hora: ...".
export function tarjetaDatosPdf(doc: PDFKit.PDFDocument, pares: [string, string][]) {
  const x = doc.page.margins.left;
  const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colAncho = ancho / 2;
  const filaAlto = 20;
  const filas = Math.ceil(pares.length / 2);
  const alto = filas * filaAlto + 12;
  saltoDePaginaSiHaceFaltaPdf(doc, alto + 10);
  const y0 = doc.y;
  doc.rect(x, y0, ancho, alto).fillAndStroke("#f8fafc", COLOR_PDF.bordeSuave);
  pares.forEach(([etiqueta, valor], i) => {
    const col = i % 2;
    const fila = Math.floor(i / 2);
    const px = x + 12 + col * colAncho;
    const py = y0 + 8 + fila * filaAlto;
    doc.fontSize(8).fillColor(COLOR_PDF.muted).font("Helvetica").text(etiqueta.toUpperCase(), px, py);
    doc.fontSize(10.5).fillColor(COLOR_PDF.texto).font("Helvetica-Bold").text(valor, px, py + 10);
  });
  doc.font("Helvetica").fillColor(COLOR_PDF.texto);
  doc.y = y0 + alto + 10;
}

// Tabla con encabezado sombreado en el color de marca y filas alternadas, con salto de página
// automático — usada por los PDF de inventario (ítems, préstamos, movimientos) y por el informe
// de consumo de suscriptor. Vivía duplicada en cada router (con una versión más simple copiada
// en reportes.ts, sin el alto de fila dinámico) — centralizada acá para que ambas dejen de
// poder desincronizarse.
export type ColumnaPdf = { titulo: string; clave: string; ancho: number; align?: "left" | "right" };

const ALTO_FILA_MIN = 18;

// Alto necesario para que el texto más largo de la fila (ej. un nombre de ítem con varias
// líneas) no se encime con la fila siguiente — sin esto, cualquier texto que envuelva a más
// de una línea quedaba dibujado a la misma altura que las demás columnas.
function altoNecesarioFila(doc: PDFKit.PDFDocument, columnas: ColumnaPdf[], fila: Record<string, string>): number {
  doc.font("Helvetica").fontSize(8);
  const alturas = columnas.map((col) => doc.heightOfString(fila[col.clave] ?? "", { width: col.ancho - 8 }));
  return Math.max(ALTO_FILA_MIN, Math.max(...alturas) + 10);
}

export function tablaPdf(doc: PDFKit.PDFDocument, columnas: ColumnaPdf[], filas: Record<string, string>[]) {
  const x = doc.page.margins.left;
  const anchoTotal = columnas.reduce((a, c) => a + c.ancho, 0);

  function dibujarEncabezado(y: number) {
    doc.rect(x, y, anchoTotal, ALTO_FILA_MIN).fill(COLOR_MARCA);
    let cx = x;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#fff");
    for (const col of columnas) {
      doc.text(col.titulo, cx + 4, y + 5, { width: col.ancho - 8, align: col.align ?? "left" });
      cx += col.ancho;
    }
    doc.font("Helvetica").fillColor("#0f172a");
    return y + ALTO_FILA_MIN;
  }

  let y = dibujarEncabezado(doc.y);

  filas.forEach((fila, i) => {
    const altoFila = altoNecesarioFila(doc, columnas, fila);
    if (y + altoFila > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = dibujarEncabezado(doc.page.margins.top);
    }
    if (i % 2 === 1) doc.rect(x, y, anchoTotal, altoFila).fill("#f1f5f9");
    doc.fillColor("#0f172a").font("Helvetica").fontSize(8);
    let cx = x;
    for (const col of columnas) {
      doc.text(fila[col.clave] ?? "", cx + 4, y + 5, { width: col.ancho - 8, align: col.align ?? "left" });
      cx += col.ancho;
    }
    y += altoFila;
  });

  if (filas.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#64748b").text("Sin registros.", x, y + 8);
  }

  doc.y = y + 10;
}

// Banda de encabezado con el logo de la empresa, usada por todos los reportes en PDF (actas,
// aforos). Centralizado acá para que un cambio de logo/color no haya que repetirlo por reporte.
export function encabezadoPdf(doc: PDFKit.PDFDocument, titulo: string, subtitulo: string) {
  const anchoPagina = doc.page.width;
  const alto = 70;
  doc.rect(0, 0, anchoPagina, alto).fill(COLOR_MARCA);

  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, 40, 11, { fit: [48, 48] });
  }

  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(15).text(titulo, 100, 18, { width: anchoPagina - 140 });
  doc.font("Helvetica").fontSize(8).fillColor("#dbeafe").text(subtitulo, 100, 38, { width: anchoPagina - 140 });
  doc.fillColor("#0f172a").font("Helvetica");
  doc.y = alto + 20;
}
