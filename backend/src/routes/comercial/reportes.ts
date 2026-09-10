import { Router } from "express";
import PDFDocument from "pdfkit";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { crearInformeExcel, enviarExcel } from "../../lib/excelBranding.js";
import { encabezadoPdf, tituloSeccionPdf, tarjetaDatosPdf, tablaPdf } from "../../lib/pdfBranding.js";
import { requirePermiso } from "../../middleware/auth.js";
import { primerDiaMes as primerDiaMesPeriodo, periodoFacturableActual as mesFacturableActual } from "../../lib/periodo.js";
import { repartirEntero, integrantesDelMedidor } from "../../lib/cotitularSplit.js";
import { agregarPorClave } from "../../lib/consumoAgregado.js";
import { historicoSuscriptor } from "../../lib/historicoSuscriptor.js";

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
  const { periodo, desde, hasta, estadoLectura, alcance, formato } = req.query;
  const rangoDesde = desde ? String(desde) : periodo ? String(periodo) : null;
  const rangoHasta = hasta ? String(hasta) : periodo ? String(periodo) : null;
  if (!rangoDesde || !rangoHasta) {
    return res.status(400).json({ error: "periodo (YYYY-MM) o desde/hasta son requeridos" });
  }
  const periodos = periodosEnRango(rangoDesde, rangoHasta);

  // estadoLectura: "todas" (default) | "tomadas" | "no_tomadas"
  // alcance: "con_medidor" (default, cualquier suscriptor con medidor asignado) | "facturando"
  // formato: "lista" (default, una fila por suscriptor+periodo) | "horizontal" (una fila por
  // suscriptor, con un par de columnas LECTURA/CONSUMO por cada periodo del rango — mismo layout
  // "ancho" del Excel institucional del que se cargó el histórico).
  const filtroEstadoLectura = estadoLectura ? String(estadoLectura) : "todas";
  const filtroAlcance = alcance ? String(alcance) : "con_medidor";
  const filtroFormato = formato === "horizontal" ? "horizontal" : "lista";

  const medidores = await prisma.medidor.findMany({
    where: {
      activo: true,
      suscriptorId: { not: null },
      ...(filtroAlcance === "facturando" ? { suscriptor: { estadoFacturacion: "facturando" } } : {}),
    },
    include: {
      suscriptor: { include: { barrioCat: true } },
      lecturas: { where: { periodo: { in: periodos.map(primerDiaMesPeriodo) } } },
      novedadesLectura: { where: { periodo: { in: periodos.map(primerDiaMesPeriodo) } } },
      cotitulares: { include: { suscriptor: { include: { barrioCat: true } } } },
    },
  });

  const filas: (Record<string, unknown> & { _resaltar?: boolean; _cotitular?: boolean })[] = [];
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
      // Un periodo con novedad (medidor dañado, predio deshabitado, etc.) tiene un motivo
      // registrado para la falta de lectura — no es un pendiente que alguien deba salir a
      // resolver, así que no debe aparecer en este informe ni contar como "sin lectura".
      .filter((m) => !m.novedadesLectura.some((n) => n.periodo.getTime() === fechaPeriodo.getTime()))
      .filter((m) => {
        if (filtroEstadoLectura === "todas") return true;
        const tieneLectura = m.lecturas.some((l) => l.periodo.getTime() === fechaPeriodo.getTime());
        return filtroEstadoLectura === "tomadas" ? tieneLectura : !tieneLectura;
      })
      .flatMap((m) => {
        const lectura = m.lecturas.find((l) => l.periodo.getTime() === fechaPeriodo.getTime());
        const integrantes = integrantesDelMedidor(m);
        const nIntegrantes = integrantes.length;
        const repartir = (total: number, esCotitular: boolean) => repartirEntero(total, nIntegrantes, esCotitular);
        const consumoTotal = lectura ? Number(lectura.consumo) : 0;
        const lecturaActualTotal = lectura ? Number(lectura.valorLectura) : 0;
        const lecturaAnteriorTotal = lectura ? lecturaActualTotal - consumoTotal : 0;

        return integrantes.map(({ suscriptor: s, esCotitular }) => ({
          nuid: s?.codigo ?? "",
          suscriptor: s?.nombre ?? "",
          barrio: s?.barrioCat?.nombre ?? "",
          ruta: s?.ruta ?? "",
          periodo: periodoActual,
          lecturaAnterior: lectura ? repartir(lecturaAnteriorTotal, esCotitular) : "",
          lecturaActual: lectura ? repartir(lecturaActualTotal, esCotitular) : "",
          consumo: lectura ? repartir(consumoTotal, esCotitular) : "",
          observacion: lectura ? "" : "SIN LECTURA",
          _resaltar: !lectura,
          _cotitular: esCotitular,
          _ruta: m.suscriptor?.ruta ?? "",
          _suscriptor: m.suscriptor?.nombre ?? "",
          _orden: esCotitular ? 1 : 0,
        }));
      });

    // Se ordena por ruta/suscriptor del TITULAR (no del cotitular), con _orden como segundo
    // criterio, para que cada grupo de cotitulares quede pegado justo debajo de su titular.
    delPeriodo.sort(
      (a, b) => a._ruta.localeCompare(b._ruta) || a._suscriptor.localeCompare(b._suscriptor) || a._orden - b._orden
    );
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

  const nombreArchivo =
    periodos.length === 1 ? `informe_lecturas_${periodos[0]}.xlsx` : `informe_lecturas_${periodos[0]}_a_${periodos[periodos.length - 1]}.xlsx`;

  if (filtroFormato === "lista") {
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
    return enviarExcel(res, buffer, nombreArchivo);
  }

  // Horizontal: una fila por suscriptor, con un par LECTURA/CONSUMO por cada periodo del rango.
  // Mismo criterio de agrupación que en "lista": cada cotitular queda pegado debajo de su titular.
  const filasPorSuscriptor = new Map<
    string,
    Record<string, unknown> & { _resaltar?: boolean; _cotitular?: boolean; _ruta: string; _suscriptor: string; _orden: number }
  >();
  for (const fila of filas) {
    const clave = String(fila.nuid);
    let base = filasPorSuscriptor.get(clave);
    if (!base) {
      base = {
        nuid: fila.nuid,
        suscriptor: fila.suscriptor,
        barrio: fila.barrio,
        ruta: fila.ruta,
        _cotitular: fila._cotitular,
        _ruta: fila._ruta as string,
        _suscriptor: fila._suscriptor as string,
        _orden: fila._orden as number,
      };
      filasPorSuscriptor.set(clave, base);
    }
    base[`lectura_${fila.periodo}`] = fila.lecturaActual;
    base[`consumo_${fila.periodo}`] = fila.consumo;
    if (fila._resaltar) base._resaltar = true;
  }
  const filasHorizontal = Array.from(filasPorSuscriptor.values()).sort(
    (a, b) => a._ruta.localeCompare(b._ruta) || a._suscriptor.localeCompare(b._suscriptor) || a._orden - b._orden
  );

  // Azul claro institucional en las columnas de LECTURA, para distinguirlas de un vistazo de las
  // de CONSUMO — mismo criterio de color que usa el Excel del que se cargó el histórico. El ancho
  // de cada columna se calcula solo del título (sin "ancho" acá), así se ajusta solo.
  const columnasHorizontal = [
    { titulo: "NUID", clave: "nuid" },
    { titulo: "SUSCRIPTOR", clave: "suscriptor" },
    { titulo: "BARRIO", clave: "barrio" },
    { titulo: "RUTA", clave: "ruta" },
    ...periodos.flatMap((p) => [
      { titulo: `LECTURA ${p}`, clave: `lectura_${p}`, colorFondo: "FFDCEEFB" },
      { titulo: `CONSUMO ${p}`, clave: `consumo_${p}` },
    ]),
  ];

  const buffer = await crearInformeExcel("Lecturas", "Informe de lecturas", subtitulo, columnasHorizontal, filasHorizontal);
  enviarExcel(res, buffer, nombreArchivo);
});

// Consumo geolocalizado de un periodo, para el mapa de calor de la pantalla "Mapa de predios":
// un punto (lat/lng) por suscriptor con coordenadas, con su consumo de ese periodo (0 si no
// tiene lectura ese mes). Si el suscriptor es cotitular de un medidor compartido, se reparte el
// consumo total en partes iguales (mismo criterio que el resto de los reportes: el titular
// absorbe el resto de la división).
reportesRouter.get("/mapa-consumo", requirePermiso("reportes", "dashboard", "mapa"), async (req, res) => {
  const { periodo } = req.query;
  if (!periodo) return res.status(400).json({ error: "periodo (YYYY-MM) es requerido" });
  const fechaPeriodo = primerDiaMesPeriodo(String(periodo));

  const medidores = await prisma.medidor.findMany({
    where: { activo: true, suscriptorId: { not: null } },
    include: {
      suscriptor: true,
      cotitulares: { include: { suscriptor: true } },
      lecturas: { where: { periodo: fechaPeriodo } },
    },
  });

  const puntos: { id: number; latitud: number; longitud: number; consumo: number }[] = [];
  for (const m of medidores) {
    const lectura = m.lecturas[0];
    const consumoTotal = lectura ? Number(lectura.consumo) : 0;
    const integrantes = integrantesDelMedidor(m);
    const nIntegrantes = integrantes.length;
    for (const { suscriptor: s, esCotitular } of integrantes) {
      if (s.latitud == null || s.longitud == null) continue;
      const consumo = repartirEntero(consumoTotal, nIntegrantes, esCotitular);
      puntos.push({ id: s.id, latitud: s.latitud, longitud: s.longitud, consumo });
    }
  }

  res.json(puntos);
});

// Resumen mensual: # usuarios con lectura y consumo total, por mes. El frontend lo llama SIEMPRE
// sin desde/hasta (quiere el histórico completo para la gráfica de tendencia), así que agrupar
// en Postgres (GROUP BY) es lo que corresponde acá — traer cada lectura completa a Node solo
// para sumarla es el mismo problema que ya se resolvió en dashboard.ts /tendencia-multianio.
reportesRouter.get("/resumen-mensual", permisoReportesODashboard, async (req, res) => {
  const { desde, hasta } = req.query;
  const condiciones = [];
  if (desde) condiciones.push(Prisma.sql`periodo >= ${new Date(String(desde))}`);
  if (hasta) condiciones.push(Prisma.sql`periodo <= ${new Date(String(hasta))}`);
  const where = condiciones.length ? Prisma.sql`WHERE ${Prisma.join(condiciones, " AND ")}` : Prisma.empty;

  const filas = await prisma.$queryRaw<{ mes: string; usuarios: number; consumo: number }[]>`
    SELECT TO_CHAR(periodo, 'YYYY-MM') AS mes, COUNT(*)::int AS usuarios, SUM(consumo)::float8 AS consumo
    FROM "Lectura"
    ${where}
    GROUP BY 1
    ORDER BY 1
  `;

  res.json(filas);
});

reportesRouter.get("/consumo-suscriptor/:id", permisoConsumoSuscriptor, async (req, res) => {
  res.json(await historicoSuscriptor(Number(req.params.id)));
});


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

  return agregarPorClave(lecturas, (l) => claveFn(l.medidor.suscriptor!));
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
  const [grupos, barriosCatalogo] = await Promise.all([
    consumoAgrupadoPorPeriodo(periodo, (s) => s.barrioCat?.nombre ?? "Sin barrio", listaEstratos),
    prisma.barrio.findMany(),
  ]);
  const idPorNombre = new Map(barriosCatalogo.map((b) => [b.nombre, b.id]));
  res.json(
    Array.from(grupos.entries()).map(([barrio, v]) => ({ barrio, barrioId: idPorNombre.get(barrio) ?? null, ...v }))
  );
});

// Consumo total por estrato (1, 2, 3, 4, Comercial, Oficial) en un periodo dado
reportesRouter.get("/por-estrato", permisoReportesODashboard, async (req, res) => {
  const { periodo } = req.query;
  if (!periodo) return res.status(400).json({ error: "periodo es requerido (YYYY-MM)" });
  const [grupos, estratosCatalogo] = await Promise.all([
    consumoAgrupadoPorPeriodo(periodo, (s) => s.estratoCat?.codigo ?? "Sin estrato"),
    prisma.estrato.findMany(),
  ]);
  const idPorCodigo = new Map(estratosCatalogo.map((e) => [e.codigo, e.id]));
  res.json(
    Array.from(grupos.entries()).map(([estrato, v]) => ({ estrato, estratoId: idPorCodigo.get(estrato) ?? null, ...v }))
  );
});
