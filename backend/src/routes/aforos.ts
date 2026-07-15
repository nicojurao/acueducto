import { Router } from "express";
import multer from "multer";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma.js";
import { guardarArchivo, borrarArchivo, leerBuffer } from "../lib/storage.js";
import {
  encabezadoPdf,
  COLOR_PDF as COLOR,
  tituloSeccionPdf as tituloSeccion,
  saltoDePaginaSiHaceFaltaPdf as saltoDePaginaSiHaceFalta,
  tarjetaDatosPdf as tarjetaDatos,
} from "../lib/pdfBranding.js";
import { requirePermiso } from "../middleware/auth.js";

export const puntosAforoRouter = Router();
export const aforosRouter = Router();
export const aforosKpisRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
});

function promedio(valores: number[]): number {
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

function suma(valores: number[]): number {
  return valores.reduce((a, b) => a + b, 0);
}

// Caudal en L/s a partir del método usado en campo.
// Volumétrico: volumen conocido / tiempo en llenarlo (un solo tiempo, medición directa).
// Flotador: velocidad superficial (distancia/tiempo promedio) x área promedio de la sección
// transversal del cauce, sin factor de corrección. Por sección (alta/baja del tramo, porque
// el cauce rara vez es uniforme): ancho fijo x la SUMA de las profundidades medidas a lo ancho
// de esa sección (no el promedio). Esto replica el formato oficial de la empresa
// (F-SIG-GA-001 AFORO DE CAUDAL) — ahí el área es la suma de trapecios entre verticales de
// profundidad consecutivas (método de sección media); con ancho constante entre verticales esa
// suma de trapecios se simplifica algebraicamente a ancho x Σ(profundidades) (cada profundidad
// interior aporta una vez su ancho completo, y las dos de los bordes aportan medio ancho cada
// una desde su triángulo + medio desde el trapecio vecino = un ancho completo también).
// Verificado contra el Excel real: ancho 0.43 y profundidades 0.12/0.15/0.17/0.19 dan área
// 0.2709 (0.43 x 0.63), exactamente lo que calcula la planilla.
function calcularAforo(metodo: string, datos: {
  volumenLitros?: number; tiempoSegundos?: number; distanciaMetros?: number;
  tiempos?: number[];
  anchoAltaM?: number; profundidadesAltaM?: number[];
  anchoBajaM?: number; profundidadesBajaM?: number[];
}): { caudalLps: number; tiempoSegundos?: number; areaAltaM2?: number; areaBajaM2?: number; areaM2?: number } {
  const { volumenLitros, tiempoSegundos, distanciaMetros, tiempos, anchoAltaM, profundidadesAltaM, anchoBajaM, profundidadesBajaM } = datos;

  if (metodo === "volumetrico") {
    if (!volumenLitros || !tiempoSegundos) throw new Error("volumenLitros y tiempoSegundos son requeridos");
    return { caudalLps: volumenLitros / tiempoSegundos };
  }

  if (metodo === "flotador") {
    if (
      !distanciaMetros || !tiempos?.length || !anchoAltaM || !profundidadesAltaM?.length ||
      !anchoBajaM || !profundidadesBajaM?.length
    ) {
      throw new Error(
        "distanciaMetros, al menos un tiempo, anchoAltaM/profundidadesAltaM y anchoBajaM/profundidadesBajaM son requeridos"
      );
    }
    const tiempoProm = promedio(tiempos);
    const areaAltaM2 = anchoAltaM * suma(profundidadesAltaM);
    const areaBajaM2 = anchoBajaM * suma(profundidadesBajaM);
    const areaM2 = (areaAltaM2 + areaBajaM2) / 2;
    const velocidad = distanciaMetros / tiempoProm; // m/s
    return { caudalLps: velocidad * areaM2 * 1000, tiempoSegundos: tiempoProm, areaAltaM2, areaBajaM2, areaM2 };
  }

  throw new Error("Método inválido");
}

function numeros(valor: unknown): number[] {
  const arr = Array.isArray(valor) ? valor : valor !== undefined ? [valor] : [];
  return arr.map(Number).filter((n) => !Number.isNaN(n));
}

// Desglosa el área de una sección en sus sub-áreas por vertical (borde/trapecio/borde), igual
// que las filas de la planilla F-SIG-GA-001: primera vertical = triángulo de borde
// (ancho x profundidad / 2), verticales interiores = trapecio con la vertical anterior
// (ancho x (prof_anterior + prof_actual) / 2), y una fila de cierre extra que reutiliza la
// última profundidad (mismo triángulo de borde del otro lado). La suma de todas coincide con
// ancho x Σ(profundidades), la fórmula usada para el cálculo (ver calcularAforo).
function subareas(ancho: number, profundidades: number[]): { profundidad: number | null; area: number }[] {
  if (profundidades.length === 0) return [];
  const filas: { profundidad: number | null; area: number }[] = [
    { profundidad: profundidades[0], area: (ancho * profundidades[0]) / 2 },
  ];
  for (let i = 1; i < profundidades.length; i++) {
    filas.push({ profundidad: profundidades[i], area: (ancho * (profundidades[i - 1] + profundidades[i])) / 2 });
  }
  filas.push({ profundidad: null, area: (ancho * profundidades[profundidades.length - 1]) / 2 });
  return filas;
}

puntosAforoRouter.get("/", async (_req, res) => {
  const puntos = await prisma.puntoAforo.findMany({
    orderBy: { nombre: "asc" },
    include: { _count: { select: { aforos: true } } },
  });
  res.json(puntos.map((p) => ({ ...p, registros: p._count.aforos, _count: undefined })));
});

puntosAforoRouter.post("/", requirePermiso("aforos_avanzado"), async (req, res) => {
  const { nombre, descripcion, latitud, longitud } = req.body;
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: "El nombre es requerido" });

  const punto = await prisma.puntoAforo.create({
    data: {
      nombre: String(nombre).trim(),
      descripcion: descripcion || null,
      latitud: latitud !== undefined ? Number(latitud) : null,
      longitud: longitud !== undefined ? Number(longitud) : null,
    },
  });
  res.status(201).json(punto);
});

puntosAforoRouter.put("/:id", requirePermiso("aforos_avanzado"), async (req, res) => {
  const id = Number(req.params.id);
  const existente = await prisma.puntoAforo.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: "No encontrado" });

  const { nombre, descripcion, latitud, longitud, activo } = req.body;
  const punto = await prisma.puntoAforo.update({
    where: { id },
    data: {
      nombre: nombre !== undefined ? String(nombre).trim() : undefined,
      descripcion: descripcion !== undefined ? descripcion || null : undefined,
      latitud: latitud !== undefined ? (latitud === null ? null : Number(latitud)) : undefined,
      longitud: longitud !== undefined ? (longitud === null ? null : Number(longitud)) : undefined,
      activo: activo !== undefined ? Boolean(activo) : undefined,
    },
  });
  res.json(punto);
});

puntosAforoRouter.delete("/:id", requirePermiso("aforos_avanzado"), async (req, res) => {
  const id = Number(req.params.id);
  const punto = await prisma.puntoAforo.findUnique({ where: { id } });
  if (!punto) return res.status(404).json({ error: "No encontrado" });

  const enUso = await prisma.aforo.count({ where: { puntoAforoId: id } });
  if (enUso > 0) {
    return res.status(400).json({ error: "No se puede eliminar: tiene registros de aforo asociados" });
  }

  await prisma.puntoAforo.delete({ where: { id } });
  res.status(204).end();
});

// Historial de aforos. Sin "page" devuelve todo (compat); con "page" pagina. Filtro opcional
// por puntoAforoId.
aforosRouter.get("/", async (req, res) => {
  const { puntoAforoId, page, limit } = req.query;
  const where = puntoAforoId ? { puntoAforoId: Number(puntoAforoId) } : {};
  const include = {
    puntoAforo: true,
    capturadoPor: { select: { nombre: true } },
  };

  if (page) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 10);
    const [data, total] = await Promise.all([
      prisma.aforo.findMany({
        where, include, orderBy: { fecha: "desc" },
        skip: (pageNum - 1) * limitNum, take: limitNum,
      }),
      prisma.aforo.count({ where }),
    ]);
    return res.json({ data, total, page: pageNum, limit: limitNum });
  }

  const data = await prisma.aforo.findMany({ where, include, orderBy: { fecha: "desc" } });
  res.json(data);
});

aforosRouter.post("/", requirePermiso("aforos_avanzado"), upload.single("foto"), async (req, res) => {
  const {
    puntoAforoId, fecha, metodo, volumenLitros, tiempoSegundos, distanciaMetros,
    anchoAltaM, anchoBajaM, observaciones, latitud, longitud,
  } = req.body;
  const tiempos = numeros(req.body.tiempos);
  const profundidadesAltaM = numeros(req.body.profundidadesAltaM);
  const profundidadesBajaM = numeros(req.body.profundidadesBajaM);

  if (!puntoAforoId || !fecha || !metodo) {
    return res.status(400).json({ error: "puntoAforoId, fecha y metodo son requeridos" });
  }

  const punto = await prisma.puntoAforo.findUnique({ where: { id: Number(puntoAforoId) } });
  if (!punto) return res.status(404).json({ error: "Punto de aforo no encontrado" });

  let resultado: ReturnType<typeof calcularAforo>;
  try {
    resultado = calcularAforo(metodo, {
      volumenLitros: volumenLitros ? Number(volumenLitros) : undefined,
      tiempoSegundos: tiempoSegundos ? Number(tiempoSegundos) : undefined,
      distanciaMetros: distanciaMetros ? Number(distanciaMetros) : undefined,
      tiempos,
      anchoAltaM: anchoAltaM ? Number(anchoAltaM) : undefined,
      profundidadesAltaM,
      anchoBajaM: anchoBajaM ? Number(anchoBajaM) : undefined,
      profundidadesBajaM,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }

  const fotoUrl = req.file
    ? await guardarArchivo("aforos", req.file.buffer, req.file.originalname, req.file.mimetype)
    : null;

  const aforo = await prisma.aforo.create({
    data: {
      puntoAforoId: Number(puntoAforoId),
      fecha: new Date(fecha),
      metodo,
      volumenLitros: volumenLitros ? Number(volumenLitros) : null,
      tiempoSegundos: resultado.tiempoSegundos ?? (tiempoSegundos ? Number(tiempoSegundos) : null),
      tiempos: metodo === "flotador" ? tiempos : [],
      distanciaMetros: distanciaMetros ? Number(distanciaMetros) : null,
      anchoAltaM: anchoAltaM ? Number(anchoAltaM) : null,
      profundidadesAltaM: metodo === "flotador" ? profundidadesAltaM : [],
      anchoBajaM: anchoBajaM ? Number(anchoBajaM) : null,
      profundidadesBajaM: metodo === "flotador" ? profundidadesBajaM : [],
      areaAltaM2: resultado.areaAltaM2 ?? null,
      areaBajaM2: resultado.areaBajaM2 ?? null,
      areaM2: resultado.areaM2 ?? null,
      caudalLps: resultado.caudalLps,
      observaciones: observaciones || null,
      fotoUrl,
      latitud: latitud ? Number(latitud) : null,
      longitud: longitud ? Number(longitud) : null,
      capturadoPorId: req.usuario?.id,
    },
    include: { puntoAforo: true, capturadoPor: { select: { nombre: true } } },
  });
  res.status(201).json(aforo);
});

// Tabla real (encabezado sombreado + filas con líneas) para el desglose de una sección del
// flotador — reemplaza el texto columnar sin bordes del primer intento.
function tablaSeccion(
  doc: PDFKit.PDFDocument,
  titulo: string,
  ancho: number | null,
  profundidades: number[],
  areaTotal: number | null
) {
  if (!ancho || profundidades.length === 0) return;
  tituloSeccion(doc, titulo);

  const x = doc.page.margins.left;
  const wTotal = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const cols = [
    { titulo: "VERTICAL", ancho: wTotal * 0.15 },
    { titulo: "ANCHO (m)", ancho: wTotal * 0.25 },
    { titulo: "PROFUNDIDAD (m)", ancho: wTotal * 0.3 },
    { titulo: "ÁREA (m²)", ancho: wTotal * 0.3 },
  ];
  const filas = subareas(ancho, profundidades);
  const altoFila = 16;
  saltoDePaginaSiHaceFalta(doc, altoFila * (filas.length + 1) + 40);

  let y = doc.y;
  let cx = x;
  doc.rect(x, y, wTotal, altoFila).fill(COLOR.cian);
  doc.fillColor("#fff").fontSize(8).font("Helvetica-Bold");
  for (const c of cols) {
    doc.text(c.titulo, cx + 4, y + 4, { width: c.ancho - 8 });
    cx += c.ancho;
  }
  y += altoFila;

  doc.font("Helvetica").fontSize(9);
  filas.forEach((fila, i) => {
    cx = x;
    if (i % 2 === 1) doc.rect(x, y, wTotal, altoFila).fill(COLOR.cianClaro);
    doc.fillColor(COLOR.texto);
    const valores = [String(i + 1), ancho.toFixed(2), fila.profundidad !== null ? fila.profundidad.toFixed(2) : "—", fila.area.toFixed(4)];
    cols.forEach((c, j) => {
      doc.text(valores[j], cx + 4, y + 4, { width: c.ancho - 8 });
      cx += c.ancho;
    });
    doc.moveTo(x, y + altoFila).lineTo(x + wTotal, y + altoFila).strokeColor(COLOR.bordeSuave).stroke();
    y += altoFila;
  });
  doc.rect(x, doc.y, wTotal, y - doc.y).strokeColor(COLOR.borde).stroke();
  doc.y = y + 4;

  doc.fontSize(9).fillColor(COLOR.muted);
  doc.text(`Profundidad promedio: ${promedio(profundidades).toFixed(3)} m   ·   Área total: `, x, doc.y, { continued: true });
  doc.fillColor(COLOR.texto).font("Helvetica-Bold").text(`${areaTotal !== null ? areaTotal.toFixed(4) : "—"} m²`);
  doc.font("Helvetica").fillColor(COLOR.texto);
  doc.moveDown(0.8);
}

// Caja destacada con el caudal final — el resultado del reporte, así que va con más peso visual
// que el resto (fondo cian, número grande) en vez de una línea de texto en negrita como antes.
function cajaCaudal(doc: PDFKit.PDFDocument, caudalLps: number) {
  const x = doc.page.margins.left;
  const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const alto = 46;
  saltoDePaginaSiHaceFalta(doc, alto + 10);
  const y = doc.y;
  doc.rect(x, y, ancho, alto).fill(COLOR.cian);
  doc.fillColor("#fff").font("Helvetica").fontSize(9).text("CAUDAL RESULTANTE", x + 16, y + 10);
  doc.font("Helvetica-Bold").fontSize(20).text(`${caudalLps.toFixed(2)} L/s`, x, y + 10, { width: ancho - 16, align: "right" });
  doc.fillColor(COLOR.texto).font("Helvetica");
  doc.y = y + alto + 12;
}

// PDF con la misma información que el "F-SIG-GA-001 AFORO DE CAUDAL" en Excel de la empresa,
// pero con un formato propio (tarjetas, tabla con bordes, caja de resultado) — el primer intento
// era texto plano sin estructura visual y se veía mal.
aforosRouter.get("/:id/pdf", async (req, res) => {
  const aforo = await prisma.aforo.findUnique({
    where: { id: Number(req.params.id) },
    include: { puntoAforo: true, capturadoPor: { select: { nombre: true } } },
  });
  if (!aforo) return res.status(404).json({ error: "No encontrado" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="aforo-${aforo.id}.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);

  const anchoPagina = doc.page.width;
  encabezadoPdf(doc, "Aforo de caudal", `F-SIG-GA-001 · Gestión Ambiental · Registro #${aforo.id}`);

  tarjetaDatos(doc, [
    ["Fecha", aforo.fecha.toLocaleDateString("es-CO")],
    ["Hora", aforo.fecha.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })],
    ["Fuente", aforo.puntoAforo.nombre],
    ["Tipo de aforo", aforo.metodo === "flotador" ? "Flotador" : "Volumétrico"],
    ["Responsable", aforo.capturadoPor?.nombre ?? "—"],
  ]);

  if (aforo.metodo === "flotador") {
    tituloSeccion(doc, "Velocidad superficial");
    const velocidad =
      aforo.distanciaMetros && aforo.tiempoSegundos ? Number(aforo.distanciaMetros) / Number(aforo.tiempoSegundos) : null;
    tarjetaDatos(doc, [
      ["Distancia recorrida", `${aforo.distanciaMetros ?? "—"} m`],
      ["Tiempo promedio", `${Number(aforo.tiempoSegundos).toFixed(2)} s`],
      ["Tiempos registrados (s)", aforo.tiempos.map((t) => t.toFixed(2)).join(", ") || "—"],
      ["Velocidad superficial", velocidad !== null ? `${velocidad.toFixed(4)} m/s` : "—"],
    ]);

    tablaSeccion(
      doc,
      "Punto 1 · Sección alta",
      aforo.anchoAltaM ? Number(aforo.anchoAltaM) : null,
      aforo.profundidadesAltaM,
      aforo.areaAltaM2 ? Number(aforo.areaAltaM2) : null
    );
    tablaSeccion(
      doc,
      "Punto 2 · Sección baja",
      aforo.anchoBajaM ? Number(aforo.anchoBajaM) : null,
      aforo.profundidadesBajaM,
      aforo.areaBajaM2 ? Number(aforo.areaBajaM2) : null
    );

    tituloSeccion(doc, "Resultado");
    tarjetaDatos(doc, [
      ["Área promedio", aforo.areaM2 ? `${Number(aforo.areaM2).toFixed(4)} m²` : "—"],
      ["Velocidad superficial", velocidad !== null ? `${velocidad.toFixed(4)} m/s` : "—"],
    ]);
  } else {
    tituloSeccion(doc, "Resultado");
    tarjetaDatos(doc, [
      ["Volumen", `${aforo.volumenLitros ?? "—"} L`],
      ["Tiempo", `${aforo.tiempoSegundos ?? "—"} s`],
    ]);
  }

  cajaCaudal(doc, Number(aforo.caudalLps));

  if (aforo.observaciones) {
    tituloSeccion(doc, "Observaciones");
    doc.fontSize(10).fillColor(COLOR.texto).text(aforo.observaciones, { width: anchoPagina - 80 });
    doc.moveDown(0.8);
  }

  if (aforo.fotoUrl) {
    try {
      const buffer = await leerBuffer(aforo.fotoUrl);
      tituloSeccion(doc, "Registro fotográfico");
      saltoDePaginaSiHaceFalta(doc, 260);
      const x = doc.page.margins.left;
      const wTotal = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      doc.image(buffer, x, doc.y, { fit: [wTotal, 300], align: "center" });
    } catch {
      // ignora si la foto no existe o no es una imagen válida
    }
  }

  doc.end();
});

// Dashboard de Aforos: KPIs generales + tendencia de caudal por punto en el tiempo + alertas de
// caudal bajo. "Caudal bajo" se define de forma relativa a cada punto (por debajo del 50 % de su
// propio promedio histórico), no con un umbral fijo, porque cada fuente tiene su propio rango.
aforosKpisRouter.get("/", async (req, res) => {
  const meses = Math.min(36, Math.max(1, Number(req.query.meses) || 12));
  // Todo el manejo de meses es en UTC (igual que dashboard.ts) para que el bucketing por mes de
  // los aforos y el cursor de la serie temporal coincidan sin desfases por zona horaria.
  const ahora = new Date();
  const desde = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - meses + 1, 1));

  const [puntos, aforos] = await Promise.all([
    prisma.puntoAforo.findMany({ orderBy: { nombre: "asc" } }),
    prisma.aforo.findMany({
      where: { fecha: { gte: desde } },
      include: { puntoAforo: { select: { nombre: true } } },
      orderBy: { fecha: "asc" },
    }),
  ]);

  const totalRegistros = aforos.length;
  const caudales = aforos.map((a) => Number(a.caudalLps));
  const caudalPromedio = caudales.length ? suma(caudales) / caudales.length : 0;

  // Último aforo global (los aforos vienen ordenados ascendente por fecha).
  const ultimo = aforos.length ? aforos[aforos.length - 1] : null;

  // Agrupa por punto para: último caudal, promedio del punto y detectar caudal bajo.
  const porPunto = new Map<number, { nombre: string; valores: { fecha: Date; caudal: number }[] }>();
  for (const a of aforos) {
    const entrada = porPunto.get(a.puntoAforoId) ?? { nombre: a.puntoAforo.nombre, valores: [] };
    entrada.valores.push({ fecha: a.fecha, caudal: Number(a.caudalLps) });
    porPunto.set(a.puntoAforoId, entrada);
  }

  // Resumen por punto: último caudal medido y promedio del periodo.
  const resumenPorPunto = Array.from(porPunto.entries()).map(([puntoAforoId, { nombre, valores }]) => {
    const soloCaudales = valores.map((v) => v.caudal);
    const prom = soloCaudales.length ? suma(soloCaudales) / soloCaudales.length : 0;
    const ultimoDelPunto = valores[valores.length - 1];
    return {
      puntoAforoId,
      nombre,
      ultimoCaudal: ultimoDelPunto?.caudal ?? null,
      ultimaFecha: ultimoDelPunto?.fecha ?? null,
      promedio: Math.round(prom * 1000) / 1000,
      registros: valores.length,
    };
  });

  // Alertas de caudal bajo: el último aforo del punto quedó por debajo del 50 % del promedio
  // histórico de ese mismo punto (se necesitan al menos 2 registros para tener referencia).
  const alertasCaudalBajo = resumenPorPunto
    .filter((p) => p.registros >= 2 && p.ultimoCaudal !== null && p.promedio > 0 && p.ultimoCaudal < p.promedio * 0.5)
    .map((p) => ({
      puntoAforoId: p.puntoAforoId,
      nombre: p.nombre,
      ultimoCaudal: p.ultimoCaudal!,
      promedio: p.promedio,
      ultimaFecha: p.ultimaFecha,
    }));

  // Serie temporal para la gráfica: una fila por mes (YYYY-MM), una columna por punto con el
  // promedio de los aforos de ese punto en ese mes. Se rellenan todos los meses del rango para
  // que la línea no tenga huecos raros aunque un mes no tenga aforos.
  const nombresPuntos = resumenPorPunto.map((p) => p.nombre);
  const porMes = new Map<string, Map<string, number[]>>();
  for (const a of aforos) {
    const mes = `${a.fecha.getUTCFullYear()}-${String(a.fecha.getUTCMonth() + 1).padStart(2, "0")}`;
    const fila = porMes.get(mes) ?? new Map<string, number[]>();
    const lista = fila.get(a.puntoAforo.nombre) ?? [];
    lista.push(Number(a.caudalLps));
    fila.set(a.puntoAforo.nombre, lista);
    porMes.set(mes, fila);
  }

  const tendencia: Record<string, number | string>[] = [];
  const cursor = new Date(desde);
  while (cursor <= ahora) {
    const mes = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
    const fila: Record<string, number | string> = { mes };
    const datosMes = porMes.get(mes);
    for (const nombre of nombresPuntos) {
      const valores = datosMes?.get(nombre);
      if (valores?.length) fila[nombre] = Math.round((suma(valores) / valores.length) * 1000) / 1000;
    }
    tendencia.push(fila);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  res.json({
    meses,
    totalPuntos: puntos.length,
    puntosActivos: puntos.filter((p) => p.activo).length,
    totalRegistros,
    caudalPromedio: Math.round(caudalPromedio * 1000) / 1000,
    ultimoCaudal: ultimo ? Number(ultimo.caudalLps) : null,
    ultimoPunto: ultimo?.puntoAforo.nombre ?? null,
    ultimaFecha: ultimo?.fecha ?? null,
    nombresPuntos,
    resumenPorPunto,
    alertasCaudalBajo,
    tendencia,
  });
});

aforosRouter.delete("/:id", requirePermiso("aforos_avanzado"), async (req, res) => {
  const aforo = await prisma.aforo.findUnique({ where: { id: Number(req.params.id) } });
  if (!aforo) return res.status(404).json({ error: "No encontrado" });

  await prisma.aforo.delete({ where: { id: aforo.id } });
  if (aforo.fotoUrl) await borrarArchivo(aforo.fotoUrl);

  res.status(204).end();
});
