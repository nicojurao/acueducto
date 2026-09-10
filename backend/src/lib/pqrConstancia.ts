import PDFDocument from "pdfkit";
import type { Response } from "express";
import bwipjs from "bwip-js/node";
import { encabezadoPdf, saltoDePaginaSiHaceFaltaPdf, COLOR_PDF } from "./pdfBranding.js";
import { fechaLegibleColombia, horaLegibleColombia } from "./fechaColombia.js";
import { obtenerEmpresa } from "./empresaCache.js";
import { leerBuffer } from "./storage.js";

interface PqrParaConstancia {
  numeroRadicado: string | null;
  nombre: string;
  documento: string | null;
  email: string;
  telefono: string;
  descripcion: string;
  estado: string;
  fotos: string[];
  createdAt: Date;
  suscriptor: { codigo: string; direccion: string | null; barrioCat: { nombre: string } | null } | null;
}

const ESTADO_LABELS: Record<string, string> = {
  radicada: "Radicada",
  en_proceso: "En proceso",
  resuelta: "Resuelta",
  cerrada: "Cerrada",
};

// Alto reservado al pie de página para el bloque del QR + instrucciones de seguimiento — se
// dibuja siempre en esta misma posición fija (relativa al alto de la página, no a dónde haya
// quedado el contenido de arriba), sin importar si la descripción es una línea o un párrafo
// largo, para que la constancia quede siempre igual de organizada visualmente.
const ALTO_PIE_QR = 100;

// Ficha formal (label/valor en grilla de 2 columnas, con líneas divisorias y bastante aire) —
// deliberadamente más espaciosa que tarjetaDatosPdf (el helper compacto de pdfBranding.ts usado
// en reportes internos): esto es un documento que se le entrega a una persona, tiene que leerse
// como un formulario oficial, no como una tabla apretada de datos operativos.
function fichaFormalPdf(doc: PDFKit.PDFDocument, titulo: string, pares: [string, string][]) {
  const x = doc.page.margins.left;
  const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const anchoCol = ancho / 2;
  const altoTitulo = 24;
  const altoFila = 34;
  const padX = 16;
  const filas = Math.ceil(pares.length / 2);
  const alto = altoTitulo + filas * altoFila;

  saltoDePaginaSiHaceFaltaPdf(doc, alto + 20);
  const y0 = doc.y;

  doc.lineWidth(1).rect(x, y0, ancho, alto).strokeColor(COLOR_PDF.borde).stroke();
  doc.rect(x, y0, ancho, altoTitulo).fill(COLOR_PDF.cianClaro);
  doc
    .fillColor(COLOR_PDF.cian)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(titulo.toUpperCase(), x + padX, y0 + 7, { characterSpacing: 0.6 });

  for (let f = 0; f < filas; f++) {
    const filaY = y0 + altoTitulo + f * altoFila;
    if (f > 0) {
      doc
        .moveTo(x, filaY)
        .lineTo(x + ancho, filaY)
        .lineWidth(0.5)
        .strokeColor(COLOR_PDF.bordeSuave)
        .stroke();
    }
    const hayColDerecha = pares[f * 2 + 1] !== undefined;
    if (hayColDerecha) {
      doc
        .moveTo(x + anchoCol, filaY)
        .lineTo(x + anchoCol, filaY + altoFila)
        .lineWidth(0.5)
        .strokeColor(COLOR_PDF.bordeSuave)
        .stroke();
    }
    for (let c = 0; c < 2; c++) {
      const par = pares[f * 2 + c];
      if (!par) continue;
      const [etiqueta, valor] = par;
      const px = x + padX + c * anchoCol;
      const anchoCelda = anchoCol - padX * 1.5;
      doc
        .fillColor(COLOR_PDF.muted)
        .font("Helvetica")
        .fontSize(7.5)
        .text(etiqueta.toUpperCase(), px, filaY + 7, { characterSpacing: 0.4, width: anchoCelda });
      doc
        .fillColor(COLOR_PDF.texto)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(valor, px, filaY + 17, { width: anchoCelda });
    }
  }

  doc.fillColor(COLOR_PDF.texto).font("Helvetica");
  doc.y = y0 + alto + 20;
}

// Mismo tratamiento visual que fichaFormalPdf (marco + banda de título) pero para un bloque de
// texto libre en vez de una grilla de datos — la descripción también se ve como parte del
// documento formal, no como un párrafo suelto flotando en la página.
function fichaTextoPdf(doc: PDFKit.PDFDocument, titulo: string, texto: string) {
  const x = doc.page.margins.left;
  const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const altoTitulo = 24;
  const padX = 16;
  const padY = 14;
  const anchoTexto = ancho - padX * 2;

  doc.font("Helvetica").fontSize(10.5);
  const altoTexto = doc.heightOfString(texto, { width: anchoTexto });
  const alto = altoTitulo + altoTexto + padY * 2;

  saltoDePaginaSiHaceFaltaPdf(doc, alto + 20);
  const y0 = doc.y;

  doc.lineWidth(1).rect(x, y0, ancho, alto).strokeColor(COLOR_PDF.borde).stroke();
  doc.rect(x, y0, ancho, altoTitulo).fill(COLOR_PDF.cianClaro);
  doc
    .fillColor(COLOR_PDF.cian)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(titulo.toUpperCase(), x + padX, y0 + 7, { characterSpacing: 0.6 });

  doc
    .fillColor(COLOR_PDF.texto)
    .font("Helvetica")
    .fontSize(10.5)
    .text(texto, x + padX, y0 + altoTitulo + padY, { width: anchoTexto });

  doc.y = y0 + alto + 20;
}

// Grilla de 2 columnas con las fotos que el ciudadano adjuntó al radicar — mismo marco + banda de
// título que las demás fichas, para que se vea como una sección más del documento y no como
// imágenes sueltas pegadas al final. Si una foto ya no existe en MinIO o no es una imagen válida,
// se omite en silencio (mismo criterio que el registro fotográfico de aforos.ts) en vez de tumbar
// la generación de toda la constancia.
function fichaFotosPdf(doc: PDFKit.PDFDocument, titulo: string, buffers: Buffer[]) {
  if (buffers.length === 0) return;
  const x = doc.page.margins.left;
  const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const altoTitulo = 24;
  const padX = 16;
  const padY = 14;
  const gap = 12;
  const cols = 2;
  const colAncho = (ancho - padX * 2 - gap * (cols - 1)) / cols;
  const altoImg = 130;
  const filas = Math.ceil(buffers.length / cols);
  const alto = altoTitulo + padY * 2 + filas * altoImg + (filas - 1) * gap;

  saltoDePaginaSiHaceFaltaPdf(doc, alto + 20);
  const y0 = doc.y;

  doc.lineWidth(1).rect(x, y0, ancho, alto).strokeColor(COLOR_PDF.borde).stroke();
  doc.rect(x, y0, ancho, altoTitulo).fill(COLOR_PDF.cianClaro);
  doc
    .fillColor(COLOR_PDF.cian)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(titulo.toUpperCase(), x + padX, y0 + 7, { characterSpacing: 0.6 });

  buffers.forEach((buffer, i) => {
    const col = i % cols;
    const fila = Math.floor(i / cols);
    const px = x + padX + col * (colAncho + gap);
    const py = y0 + altoTitulo + padY + fila * (altoImg + gap);
    try {
      doc.image(buffer, px, py, { fit: [colAncho, altoImg], align: "center", valign: "center" });
    } catch {
      // Ignora si el buffer no resultó ser una imagen válida.
    }
  });

  doc.fillColor(COLOR_PDF.texto).font("Helvetica");
  doc.y = y0 + alto + 20;
}

// Construye la constancia y la devuelve como Buffer — fuente única de verdad, usada tanto para
// servirla por HTTP (generarConstanciaPqrPdf) como para adjuntarla al correo de radicación (ver
// enviarCorreoPqrCreada en lib/correo.ts), así ambas siempre generan exactamente el mismo PDF.
export async function generarConstanciaPqrBuffer(pqr: PqrParaConstancia): Promise<Buffer> {
  const empresa = await obtenerEmpresa();
  const radicado = pqr.numeroRadicado ?? "—";
  const link = `https://${empresa.dominioPqrs}/consultar?q=${encodeURIComponent(pqr.numeroRadicado ?? "")}`;
  const qrBuffer = await bwipjs.toBuffer({ bcid: "qrcode", text: link, scale: 3 });
  const resultadosFotos = await Promise.allSettled(pqr.fotos.map((ruta) => leerBuffer(ruta)));
  const fotoBuffers = resultadosFotos
    .filter((r): r is PromiseFulfilledResult<Buffer> => r.status === "fulfilled")
    .map((r) => r.value);

  const doc = new PDFDocument({ margin: 40, size: "A4", info: { Title: pqr.numeroRadicado ?? "Constancia PQRS" } });
  const trozos: Buffer[] = [];
  doc.on("data", (trozo) => trozos.push(trozo));
  const listo = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(trozos))));

  encabezadoPdf(doc, "Constancia de radicación", `Peticiones, Quejas, Reclamos y Sugerencias · ${empresa.nombreCorto}`);

  const x = doc.page.margins.left;
  const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Línea de apertura con tono de certificación — es lo que le da a esto el carácter de
  // constancia oficial, no solo un ticket con datos sueltos.
  doc
    .fillColor(COLOR_PDF.muted)
    .font("Helvetica")
    .fontSize(9.5)
    .text(
      `El ${empresa.nombre} (${empresa.nombreCorto}) certifica la radicación de la siguiente Petición, ` +
        "Queja, Reclamo o Sugerencia, presentada a través de su sistema de PQRS:",
      x,
      doc.y,
      { width: ancho }
    );
  doc.moveDown(1);
  doc.fillColor(COLOR_PDF.texto);

  // Caja grande con el radicado — con borde propio para que se lea como un sello oficial, no
  // solo un bloque de color.
  const altoCaja = 72;
  const yCaja = doc.y;
  doc.lineWidth(1.5).rect(x, yCaja, ancho, altoCaja).fillAndStroke(COLOR_PDF.cian, "#00304f");
  doc
    .fillColor("#dbeafe")
    .font("Helvetica")
    .fontSize(9)
    .text("NÚMERO DE RADICADO — CONSÉRVALO PARA HACER SEGUIMIENTO", x, yCaja + 15, {
      width: ancho,
      align: "center",
      characterSpacing: 0.4,
    });
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(27).text(radicado, x, yCaja + 31, { width: ancho, align: "center" });
  doc.fillColor(COLOR_PDF.texto).font("Helvetica");
  doc.y = yCaja + altoCaja + 22;

  fichaFormalPdf(doc, "Datos de quien radica", [
    ["Nombre completo", pqr.nombre],
    ["Documento de identidad", pqr.documento ?? "No suministrado"],
    ["Correo electrónico", pqr.email],
    ["Celular", pqr.telefono],
    ["Fecha de radicación", fechaLegibleColombia(pqr.createdAt)],
    ["Hora de radicación", horaLegibleColombia(pqr.createdAt)],
    ["Estado actual del caso", ESTADO_LABELS[pqr.estado] ?? pqr.estado],
  ]);

  if (pqr.suscriptor) {
    fichaFormalPdf(doc, "Predio o servicio relacionado", [
      ["NUID", pqr.suscriptor.codigo],
      ["Barrio", pqr.suscriptor.barrioCat?.nombre ?? "—"],
      ["Dirección", pqr.suscriptor.direccion ?? "Sin dirección registrada"],
    ]);
  }

  fichaTextoPdf(doc, "Descripción de la petición, queja, reclamo o sugerencia", pqr.descripcion);

  fichaFotosPdf(doc, "Fotos adjuntas", fotoBuffers);

  dibujarPieConQr(doc, x, ancho, qrBuffer, link);

  doc.end();
  return listo;
}

// Sirve la constancia por HTTP (descarga pública/interna) — ver generarConstanciaPqrBuffer para
// la generación en sí.
export async function generarConstanciaPqrPdf(res: Response, pqr: PqrParaConstancia): Promise<void> {
  const buffer = await generarConstanciaPqrBuffer(pqr);
  const nombreArchivo = `${pqr.numeroRadicado ?? "constancia-pqr"}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${nombreArchivo}"`);
  // Sin esto, Cloudflare (y el navegador) pueden cachear la respuesta solo por terminar la URL en
  // ".pdf" — como el radicado del día se reutiliza numéricamente cada vez que la tabla queda en
  // cero (limpiezas de prueba, o simplemente el consecutivo del día siguiente empezando otra vez
  // en 1), esa caché servía la constancia de UNA PQR vieja para el radicado nuevo con la misma
  // URL. Mismo criterio que /adjuntos/:archivo (también datos personales, nunca cacheables).
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.send(buffer);
}

// El QR siempre queda anclado a esta misma altura desde el borde inferior de la página (no
// debajo del último renglón de la descripción) — si el contenido de arriba es corto, queda
// espacio de sobra antes del pie; si es largo y invade esa franja, se pasa a una página nueva
// en vez de encimarse.
function dibujarPieConQr(doc: PDFKit.PDFDocument, x: number, ancho: number, qrBuffer: Buffer, link: string) {
  const yFijo = doc.page.height - doc.page.margins.bottom - ALTO_PIE_QR;
  if (doc.y > yFijo) doc.addPage();

  doc
    .moveTo(x, yFijo - 14)
    .lineTo(x + ancho, yFijo - 14)
    .lineWidth(0.5)
    .strokeColor(COLOR_PDF.bordeSuave)
    .stroke();

  doc.image(qrBuffer, x, yFijo, { fit: [80, 80] });
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLOR_PDF.texto)
    .text("Haz seguimiento a tu caso en cualquier momento", x + 96, yFijo + 8, { width: ancho - 96 });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLOR_PDF.muted)
    .text(`Escanea este código, o ingresa a ${link} — también puedes consultar con tu número de documento.`, x + 96, yFijo + 26, {
      width: ancho - 96,
    });
}
