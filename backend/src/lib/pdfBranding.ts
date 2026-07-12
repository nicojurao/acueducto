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
