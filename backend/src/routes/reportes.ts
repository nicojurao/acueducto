import { Router } from "express";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma.js";
import { crearInformeExcel, enviarExcel } from "../lib/excelBranding.js";
import { encabezadoPdf, tituloSeccionPdf, tarjetaDatosPdf, COLOR_MARCA } from "../lib/pdfBranding.js";
import { requirePermiso } from "../middleware/auth.js";

export const reportesRouter = Router();

// El resto de reportes (por ruta) exige el permiso "reportes" a secas. El consumo de UN
// suscriptor puntual (gráfica + PDF) se usa desde la ficha del suscriptor, no desde la pantalla
// de Reportes — cualquiera que pueda ver suscriptores necesita poder verlo también, o la ficha
// del suscriptor queda con el historial de consumo vacío para roles que tienen "suscriptores_ver"
// pero no "reportes".
const permisoReportes = requirePermiso("reportes");
const permisoConsumoSuscriptor = requirePermiso("reportes", "suscriptores_ver", "suscriptores_avanzado");
// Excel de lecturas, resumen mensual y desgloses por barrio/estrato viven TODOS dentro de la
// misma pantalla que el resto del Dashboard (/medicion, sidebar "Dashboard"), cuya ruta en el
// frontend solo exige el permiso "dashboard" — si estos endpoints solo aceptaran "reportes", un
// rol con "dashboard" pero sin "reportes" (ej. Asistente Coordinador Operativo) entraría a la
// página pero el Promise.all que carga todo junto fallaría por estas llamadas, dejando el
// dashboard entero en blanco.
const permisoReportesODashboard = requirePermiso("reportes", "dashboard");

function primerDiaMesPeriodo(periodo: string): Date {
  const [y, m] = periodo.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

function periodosEnRango(desde: string, hasta: string): string[] {
  const [y1, m1] = desde.split("-").map(Number);
  const [y2, m2] = hasta.split("-").map(Number);
  const periodos: string[] = [];
  let y = y1;
  let m = m1;
  while (y < y2 || (y === y2 && m <= m2)) {
    periodos.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return periodos;
}

// Excel con las lecturas de un periodo o un rango de periodos (?periodo=YYYY-MM o
// ?desde=YYYY-MM&hasta=YYYY-MM): NUID, suscriptor, barrio, ruta, periodo, lectura anterior,
// lectura actual y consumo — para entregar a quien factura o audita. Las filas donde el medidor
// ya estaba instalado ese mes pero no se le tomó lectura quedan resaltadas en rojo (mirando la
// fecha de instalación: no tiene sentido marcarle falta de lectura a un medidor que en ese
// periodo todavía no existía).
reportesRouter.get("/lecturas-excel", permisoReportesODashboard, async (req, res) => {
  const { periodo, desde, hasta, estadoLectura, alcance } = req.query;
  const rangoDesde = desde ? String(desde) : periodo ? String(periodo) : null;
  const rangoHasta = hasta ? String(hasta) : periodo ? String(periodo) : null;
  if (!rangoDesde || !rangoHasta) {
    return res.status(400).json({ error: "periodo (YYYY-MM) o desde/hasta son requeridos" });
  }
  const periodos = periodosEnRango(rangoDesde, rangoHasta);

  // estadoLectura: "todas" (default) | "tomadas" | "no_tomadas"
  // alcance: "con_medidor" (default, cualquier suscriptor con medidor asignado) | "facturando"
  const filtroEstadoLectura = estadoLectura ? String(estadoLectura) : "todas";
  const filtroAlcance = alcance ? String(alcance) : "con_medidor";

  const medidores = await prisma.medidor.findMany({
    where: {
      activo: true,
      suscriptorId: { not: null },
      ...(filtroAlcance === "facturando" ? { suscriptor: { estadoFacturacion: "facturando" } } : {}),
    },
    include: {
      suscriptor: { include: { barrioCat: true } },
      lecturas: { where: { periodo: { in: periodos.map(primerDiaMesPeriodo) } } },
    },
  });

  const filas: (Record<string, unknown> & { _resaltar?: boolean })[] = [];
  for (const periodoActual of periodos) {
    const fechaPeriodo = primerDiaMesPeriodo(periodoActual);
    const inicioMesPeriodo = new Date(Date.UTC(fechaPeriodo.getUTCFullYear(), fechaPeriodo.getUTCMonth(), 1));

    const delPeriodo = medidores
      .filter((m) => {
        if (!m.fechaInstalacion) return false;
        const inst = m.fechaInstalacion;
        const inicioMesInstalacion = new Date(Date.UTC(inst.getUTCFullYear(), inst.getUTCMonth(), 1));
        return inicioMesInstalacion <= inicioMesPeriodo;
      })
      .filter((m) => {
        if (filtroEstadoLectura === "todas") return true;
        const tieneLectura = m.lecturas.some((l) => l.periodo.getTime() === fechaPeriodo.getTime());
        return filtroEstadoLectura === "tomadas" ? tieneLectura : !tieneLectura;
      })
      .map((m) => {
        const s = m.suscriptor;
        const lectura = m.lecturas.find((l) => l.periodo.getTime() === fechaPeriodo.getTime());
        return {
          nuid: s?.codigo ?? "",
          suscriptor: s?.nombre ?? "",
          barrio: s?.barrioCat?.nombre ?? "",
          ruta: s?.ruta ?? "",
          periodo: periodoActual,
          lecturaAnterior: lectura ? Number(lectura.valorLectura) - Number(lectura.consumo) : "",
          lecturaActual: lectura ? Number(lectura.valorLectura) : "",
          consumo: lectura ? Number(lectura.consumo) : "",
          observacion: lectura ? "" : "SIN LECTURA",
          _resaltar: !lectura,
          _ruta: s?.ruta ?? "",
          _suscriptor: s?.nombre ?? "",
        };
      });

    delPeriodo.sort((a, b) => a._ruta.localeCompare(b._ruta) || a._suscriptor.localeCompare(b._suscriptor));
    filas.push(...delPeriodo);
  }

  const totalSinLectura = filas.filter((f) => f._resaltar).length;
  const etiquetaAlcance = filtroAlcance === "facturando" ? "solo suscriptores facturando" : "todos con medidor";
  const etiquetaEstado =
    filtroEstadoLectura === "tomadas" ? "solo tomadas" : filtroEstadoLectura === "no_tomadas" ? "solo sin lectura" : "todas";
  const subtitulo =
    (periodos.length === 1
      ? `Periodo ${periodos[0]} · ${filas.length} fila${filas.length === 1 ? "" : "s"}, ${totalSinLectura} sin lectura`
      : `Del ${periodos[0]} al ${periodos[periodos.length - 1]} · ${filas.length} filas, ${totalSinLectura} sin lectura`) +
    ` · Alcance: ${etiquetaAlcance} · Lecturas: ${etiquetaEstado}`;

  const buffer = await crearInformeExcel(
    "Lecturas",
    "Informe de lecturas",
    subtitulo,
    [
      { titulo: "NUID", clave: "nuid", ancho: 14 },
      { titulo: "SUSCRIPTOR", clave: "suscriptor", ancho: 28 },
      { titulo: "BARRIO", clave: "barrio", ancho: 18 },
      { titulo: "RUTA", clave: "ruta", ancho: 14 },
      { titulo: "PERIODO", clave: "periodo", ancho: 12 },
      { titulo: "LECTURA ANTERIOR", clave: "lecturaAnterior", ancho: 16 },
      { titulo: "LECTURA ACTUAL", clave: "lecturaActual", ancho: 16 },
      { titulo: "CONSUMO", clave: "consumo", ancho: 12 },
      { titulo: "OBSERVACIÓN", clave: "observacion", ancho: 16 },
    ],
    filas
  );
  const nombreArchivo =
    periodos.length === 1 ? `informe_lecturas_${periodos[0]}.xlsx` : `informe_lecturas_${periodos[0]}_a_${periodos[periodos.length - 1]}.xlsx`;
  enviarExcel(res, buffer, nombreArchivo);
});

// Resumen mensual: # usuarios con lectura y consumo total, por mes
reportesRouter.get("/resumen-mensual", permisoReportesODashboard, async (req, res) => {
  const { desde, hasta } = req.query;
  const where: any = {};
  if (desde) where.gte = new Date(String(desde));
  if (hasta) where.lte = new Date(String(hasta));

  const lecturas = await prisma.lectura.findMany({
    where: Object.keys(where).length ? { periodo: where } : undefined,
  });

  const porMes = new Map<string, { usuarios: number; consumo: number }>();
  for (const l of lecturas) {
    const key = l.periodo.toISOString().slice(0, 7);
    const acc = porMes.get(key) ?? { usuarios: 0, consumo: 0 };
    acc.usuarios += 1;
    acc.consumo += Number(l.consumo);
    porMes.set(key, acc);
  }

  const resultado = Array.from(porMes.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({ mes, ...v }));

  res.json(resultado);
});

// Las lecturas del mes no empiezan a capturarse hasta el día 20 (mismo criterio que usa
// ReportesPage.tsx para el periodo por defecto del Dashboard). Antes de esa fecha, el mes en
// curso todavía no está "vencido" — no debe aparecer como hueco/"sin lectura" en el histórico.
function mesFacturableActual(): string {
  const now = new Date();
  let anio = now.getUTCFullYear();
  let mes = now.getUTCDate() < 20 ? now.getUTCMonth() : now.getUTCMonth() + 1;
  if (mes === 0) {
    mes = 12;
    anio -= 1;
  }
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

// Histórico de consumo de un suscriptor (para gráfico de tendencia).
// Si el suscriptor es titular de un medidor, se cuenta el consumo completo.
// Si es cotitular de un medidor compartido (acometida multiusuario), se reparte
// el consumo en partes iguales entre el titular y todos sus cotitulares.
// Los meses entre la primera lectura y el periodo actual que no tengan lectura se
// marcan con sinLectura=true (y el motivo de la novedad, si se registró uno).
// Extraído para reusarse también en el PDF del informe de suscriptor (misma lógica de huecos,
// cotitulares y novedades, sin duplicarla).
async function historicoSuscriptor(suscriptorId: number) {
  const medidoresPropios = await prisma.medidor.findMany({
    where: { suscriptorId },
    include: {
      lecturas: { orderBy: { periodo: "asc" }, include: { capturadoPor: { select: { nombre: true } } } },
    },
  });

  const historico = medidoresPropios.flatMap((m) =>
    m.lecturas.map((l) => ({
      periodo: l.periodo.toISOString().slice(0, 7),
      valorLectura: Number(l.valorLectura),
      consumo: Number(l.consumo),
      medidorId: m.id,
      lecturaId: l.id,
      fotoUrl: l.fotoUrl,
      latitud: l.latitud,
      longitud: l.longitud,
      fechaRegistro: l.fechaRegistro.toISOString(),
      capturadoPor: l.capturadoPor?.nombre ?? null,
    }))
  );

  const medidorIds = medidoresPropios.map((m) => m.id);
  // Medidor a usar para los meses sin lectura (huecos): el activo actual, si hay uno.
  let medidorActivoId = medidoresPropios.find((m) => m.activo)?.id ?? medidoresPropios[0]?.id;

  const cotitularDe = await prisma.cotitular.findUnique({
    where: { suscriptorId },
    include: {
      medidor: {
        include: { lecturas: { include: { capturadoPor: { select: { nombre: true } } } }, cotitulares: true },
      },
    },
  });

  if (cotitularDe) {
    medidorIds.push(cotitularDe.medidor.id);
    medidorActivoId = medidorActivoId ?? cotitularDe.medidor.id;
    const factor = 1 / (1 + cotitularDe.medidor.cotitulares.length);
    for (const l of cotitularDe.medidor.lecturas) {
      historico.push({
        periodo: l.periodo.toISOString().slice(0, 7),
        valorLectura: Math.round(Number(l.valorLectura) * factor * 100) / 100,
        consumo: Math.round(Number(l.consumo) * factor * 100) / 100,
        medidorId: cotitularDe.medidor.id,
        lecturaId: l.id,
        fotoUrl: l.fotoUrl,
        latitud: l.latitud,
        longitud: l.longitud,
        fechaRegistro: l.fechaRegistro.toISOString(),
        capturadoPor: l.capturadoPor?.nombre ?? null,
      });
    }
  }

  if (historico.length === 0) return [];

  historico.sort((a, b) => a.periodo.localeCompare(b.periodo));

  const novedades = medidorIds.length
    ? await prisma.novedadLectura.findMany({ where: { medidorId: { in: medidorIds } } })
    : [];
  const novedadPorPeriodo = new Map(
    novedades.map((n) => [n.periodo.toISOString().slice(0, 7), { id: n.id, motivo: n.motivo, fotos: n.fotos }])
  );
  const existentePorPeriodo = new Map(historico.map((h) => [h.periodo, h]));

  const completo: {
    periodo: string;
    valorLectura: number | null;
    consumo: number;
    sinLectura: boolean;
    motivo?: string;
    novedadId?: number;
    fotos?: string[];
    medidorId?: number;
    lecturaId?: number;
    fechaRegistro?: string;
    capturadoPor?: string | null;
  }[] = [];

  // El rango llega hasta el mes calendario actual (o hasta el último periodo con novedad,
  // si por algún motivo es más reciente), para que una novedad recién marcada sea visible ya.
  const ultimaNovedad = novedades.reduce<string | null>((max, n) => {
    const p = n.periodo.toISOString().slice(0, 7);
    return !max || p > max ? p : max;
  }, null);
  const finRango = [mesFacturableActual(), ultimaNovedad ?? ""].sort().at(-1)!;

  let [y, m] = historico[0].periodo.split("-").map(Number);
  const [yFin, mFin] = finRango.split("-").map(Number);
  while (y < yFin || (y === yFin && m <= mFin)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const existente = existentePorPeriodo.get(key);
    if (existente) {
      completo.push({ ...existente, sinLectura: false });
    } else {
      const novedad = novedadPorPeriodo.get(key);
      completo.push({
        periodo: key,
        valorLectura: null,
        consumo: 0,
        sinLectura: true,
        motivo: novedad?.motivo,
        novedadId: novedad?.id,
        fotos: novedad?.fotos,
        medidorId: medidorActivoId,
      });
    }
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  return completo;
}

reportesRouter.get("/consumo-suscriptor/:id", permisoConsumoSuscriptor, async (req, res) => {
  res.json(await historicoSuscriptor(Number(req.params.id)));
});

// Tabla simple con encabezado en el color de marca y filas alternadas — mismo estilo que la de
// inventario.ts, reescrita acá para no tener que exportarla desde otro router.
type ColumnaPdf = { titulo: string; clave: string; ancho: number; align?: "left" | "right" };
function tablaPdf(doc: PDFKit.PDFDocument, columnas: ColumnaPdf[], filas: Record<string, string>[]) {
  const x = doc.page.margins.left;
  const anchoTotal = columnas.reduce((a, c) => a + c.ancho, 0);
  const altoFila = 18;

  function dibujarEncabezado(y: number) {
    doc.rect(x, y, anchoTotal, altoFila).fill(COLOR_MARCA);
    let cx = x;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#fff");
    for (const col of columnas) {
      doc.text(col.titulo, cx + 4, y + 5, { width: col.ancho - 8, align: col.align ?? "left" });
      cx += col.ancho;
    }
    doc.font("Helvetica").fillColor("#0f172a");
    return y + altoFila;
  }

  let y = dibujarEncabezado(doc.y);
  filas.forEach((fila, i) => {
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

const ESTADO_FACTURACION_LABELS_PDF: Record<string, string> = {
  sin_medidor: "Sin medidor",
  instalado_prueba: "Instalado",
  facturando: "Facturando por medición",
  inactivo: "Medidor inactivo / dañado",
};

// Informe de un suscriptor: datos básicos + tabla de lecturas y consumos, mismo histórico que
// alimenta el gráfico de barras de su ficha (con los meses "sin lectura" incluidos).
reportesRouter.get("/consumo-suscriptor/:id/pdf", permisoConsumoSuscriptor, async (req, res) => {
  const suscriptorId = Number(req.params.id);
  const suscriptor = await prisma.suscriptor.findUnique({
    where: { id: suscriptorId },
    include: { barrioCat: true, estratoCat: true },
  });
  if (!suscriptor) return res.status(404).json({ error: "No encontrado" });

  const historico = await historicoSuscriptor(suscriptorId);
  // ?meses=6|12 filtra el mismo rango que el gráfico; sin parámetro manda el histórico completo.
  const meses = Number(req.query.meses);
  const filas = meses > 0 ? historico.slice(-meses) : historico;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="informe-${suscriptor.codigo}.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);

  encabezadoPdf(doc, "Informe de suscriptor", `Gestión Comercial · NUID ${suscriptor.codigo}`);

  tarjetaDatosPdf(doc, [
    ["NUID", suscriptor.codigo],
    ["Nombre", suscriptor.nombre],
    ["Identificación", suscriptor.identificacion ?? "—"],
    ["Ruta", suscriptor.ruta ?? "—"],
    ["Barrio", suscriptor.barrioCat?.nombre ?? "—"],
    ["Estrato", suscriptor.estratoCat ? `${suscriptor.estratoCat.codigo} — ${suscriptor.estratoCat.etiqueta}` : "—"],
    ["Dirección", suscriptor.direccion ?? "—"],
    ["Estado de facturación", ESTADO_FACTURACION_LABELS_PDF[suscriptor.estadoFacturacion] ?? suscriptor.estadoFacturacion],
  ]);

  tituloSeccionPdf(doc, "Historial de lecturas y consumos");
  tablaPdf(
    doc,
    [
      { titulo: "PERIODO", clave: "periodo", ancho: 70 },
      { titulo: "LECTURA", clave: "lectura", ancho: 90, align: "right" },
      { titulo: "CONSUMO (m³)", clave: "consumo", ancho: 90, align: "right" },
      { titulo: "ESTADO", clave: "estado", ancho: 130 },
      { titulo: "CAPTURADO POR", clave: "capturadoPor", ancho: 135 },
    ],
    filas.map((f) => ({
      periodo: f.periodo,
      lectura: f.valorLectura != null ? f.valorLectura.toLocaleString("es-CO", { maximumFractionDigits: 2 }) : "—",
      consumo: f.sinLectura ? "—" : f.consumo.toLocaleString("es-CO", { maximumFractionDigits: 2 }),
      estado: f.sinLectura ? `Sin lectura${f.motivo ? ` — ${f.motivo}` : ""}` : "Tomada",
      capturadoPor: f.sinLectura ? "—" : f.capturadoPor ?? "—",
    }))
  );

  if (filas.length > 0) {
    const totalConsumo = filas.filter((f) => !f.sinLectura).reduce((acc, f) => acc + f.consumo, 0);
    const cantidadConLectura = filas.filter((f) => !f.sinLectura).length;
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a").text(
      `Consumo total del periodo: ${totalConsumo.toLocaleString("es-CO", { maximumFractionDigits: 2 })} m³` +
        (cantidadConLectura > 0
          ? ` · Promedio mensual: ${(totalConsumo / cantidadConLectura).toLocaleString("es-CO", { maximumFractionDigits: 2 })} m³`
          : "")
    );
    doc.font("Helvetica");
  }

  doc.end();
});

async function consumoAgrupadoPorPeriodo(
  periodo: unknown,
  claveFn: (suscriptor: { ruta: string | null; barrioCat: { nombre: string } | null; estratoCat: { codigo: string } | null }) => string,
  estratos?: string[]
) {
  const [y, m] = String(periodo).split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, 1));

  const lecturas = await prisma.lectura.findMany({
    where: {
      periodo: fecha,
      medidor: {
        suscriptorId: { not: null },
        suscriptor: estratos && estratos.length > 0 ? { estratoCat: { codigo: { in: estratos } } } : undefined,
      },
    },
    include: { medidor: { include: { suscriptor: { include: { barrioCat: true, estratoCat: true } } } } },
  });

  const grupos = new Map<string, { usuarios: number; consumo: number }>();
  for (const l of lecturas) {
    const clave = claveFn(l.medidor.suscriptor!);
    const acc = grupos.get(clave) ?? { usuarios: 0, consumo: 0 };
    acc.usuarios += 1;
    acc.consumo += Number(l.consumo);
    grupos.set(clave, acc);
  }
  return grupos;
}

// Consumo total por ruta en un periodo dado
reportesRouter.get("/por-ruta", permisoReportes, async (req, res) => {
  const { periodo } = req.query;
  if (!periodo) return res.status(400).json({ error: "periodo es requerido (YYYY-MM)" });
  const grupos = await consumoAgrupadoPorPeriodo(periodo, (s) => s.ruta ?? "Sin ruta");
  res.json(Array.from(grupos.entries()).map(([ruta, v]) => ({ ruta, ...v })));
});

// Consumo total por barrio en un periodo dado. Acepta `estratos` (coma-separado) para
// limitar el cálculo a ciertos estratos, ej. excluir Comercial/Oficial del promedio residencial.
reportesRouter.get("/por-barrio", permisoReportesODashboard, async (req, res) => {
  const { periodo, estratos } = req.query;
  if (!periodo) return res.status(400).json({ error: "periodo es requerido (YYYY-MM)" });
  const listaEstratos = estratos ? String(estratos).split(",").filter(Boolean) : undefined;
  const grupos = await consumoAgrupadoPorPeriodo(periodo, (s) => s.barrioCat?.nombre ?? "Sin barrio", listaEstratos);
  res.json(Array.from(grupos.entries()).map(([barrio, v]) => ({ barrio, ...v })));
});

// Consumo total por estrato (1, 2, 3, 4, Comercial, Oficial) en un periodo dado
reportesRouter.get("/por-estrato", permisoReportesODashboard, async (req, res) => {
  const { periodo } = req.query;
  if (!periodo) return res.status(400).json({ error: "periodo es requerido (YYYY-MM)" });
  const grupos = await consumoAgrupadoPorPeriodo(periodo, (s) => s.estratoCat?.codigo ?? "Sin estrato");
  res.json(Array.from(grupos.entries()).map(([estrato, v]) => ({ estrato, ...v })));
});
