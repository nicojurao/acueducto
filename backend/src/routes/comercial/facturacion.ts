import { Router } from "express";
import multer from "multer";
import PDFDocument from "pdfkit";
import bwipjs from "bwip-js/node";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { guardarArchivo, borrarArchivo } from "../../lib/storage.js";
import { requirePermiso } from "../../middleware/auth.js";
import { primerDiaMes, periodoFacturableActual } from "../../lib/periodo.js";
import { repartirEntero } from "../../lib/cotitularSplit.js";
import { liquidarFactura, TarifaCalculo } from "../../lib/facturacionCalculo.js";
import { encabezadoPdf, tarjetaDatosPdf, tituloSeccionPdf, tablaPdf } from "../../lib/pdfBranding.js";
import { fechaLegibleColombia } from "../../lib/fechaColombia.js";
import { obtenerEmpresa } from "../../lib/empresaCache.js";
import { periodoEstaCerrado, MENSAJE_PERIODO_CERRADO } from "../../lib/periodoFacturacion.js";
import {
  calcularVerificacionPeriodo,
  periodoListoParaFacturar,
  MENSAJE_VERIFICACION_INCOMPLETA,
} from "../../lib/verificacionPeriodo.js";
import { calcularMora } from "../../lib/moraCalculo.js";
import { generarComprobanteVenta, generarComprobantePago, anularComprobante, anularComprobantesEnLote } from "../../lib/contabilidad/comprobantes.js";
import { conceptosDeNotasPendientes, marcarNotasAplicadas } from "../../lib/notas.js";
import { conceptoDeSiguienteCuota, marcarCuotaAplicada } from "../../lib/acuerdosPago.js";
import { randomUUID } from "node:crypto";
import {
  crearJobFacturacion,
  actualizarProgresoFacturacion,
  marcarListoFacturacion,
  marcarErrorFacturacion,
  obtenerJobFacturacion,
} from "../../lib/facturacionJobs.js";

export const facturacionRouter = Router();

const permisoVer = requirePermiso("facturacion_ver", "facturacion_avanzado", "pagos_registrar");
const permisoAvanzado = requirePermiso("facturacion_avanzado");
const permisoPagos = requirePermiso("pagos_registrar", "facturacion_avanzado");

const uploadImagenGuia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
});

const fmtPesos = (v: number | string) =>
  `$${Number(v).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;

function tarifaACalculo(t: {
  cma: unknown; cmo: unknown; cmi: unknown; cmt: unknown;
  rangoBasicoHastaM3: number; rangoComplementarioHastaM3: number;
  alcCma: unknown; alcCmo: unknown; alcCmi: unknown; alcCmt: unknown; aseoCargoFijo: unknown;
}): TarifaCalculo {
  return {
    cma: Number(t.cma),
    cmo: Number(t.cmo),
    cmi: Number(t.cmi),
    cmt: Number(t.cmt),
    rangoBasicoHastaM3: t.rangoBasicoHastaM3,
    rangoComplementarioHastaM3: t.rangoComplementarioHastaM3,
    alcCma: t.alcCma == null ? null : Number(t.alcCma),
    alcCmo: t.alcCmo == null ? null : Number(t.alcCmo),
    alcCmi: t.alcCmi == null ? null : Number(t.alcCmi),
    alcCmt: t.alcCmt == null ? null : Number(t.alcCmt),
    aseoCargoFijo: t.aseoCargoFijo == null ? null : Number(t.aseoCargoFijo),
  };
}

// Tarifa vigente para un periodo: la de vigenciaDesde más reciente <= periodo.
async function tarifaVigente(fechaPeriodo: Date) {
  return prisma.tarifa.findFirst({
    where: { vigenciaDesde: { lte: fechaPeriodo } },
    orderBy: { vigenciaDesde: "desc" },
    include: { estratos: { include: { estrato: true } } },
  });
}

// ============================== PERIODOS ==============================

facturacionRouter.get("/periodos", permisoVer, async (_req, res) => {
  const periodos = await prisma.periodoFacturacion.findMany({
    orderBy: { periodo: "desc" },
    include: { cerradoPor: { select: { nombre: true } } },
  });
  // Totales por periodo en una sola pasada (evita N+1 por periodo).
  const agregados = await prisma.factura.groupBy({
    by: ["periodo"],
    where: { estado: { not: "anulada" } },
    _count: { _all: true },
    _sum: { total: true },
  });
  const porPeriodo = new Map(agregados.map((a) => [a.periodo.getTime(), a]));
  res.json(
    periodos.map((p) => {
      const agg = porPeriodo.get(p.periodo.getTime());
      return {
        ...p,
        facturas: agg?._count._all ?? 0,
        totalFacturado: Number(agg?._sum.total ?? 0),
      };
    })
  );
});

facturacionRouter.get("/periodos/:periodo/estado", permisoVer, async (req, res) => {
  const p = await prisma.periodoFacturacion.findUnique({ where: { periodo: primerDiaMes(req.params.periodo) } });
  res.json({ existe: !!p, estado: p?.estado ?? null, fechaCierre: p?.fechaCierre ?? null });
});

facturacionRouter.post("/periodos/:periodo/cerrar", permisoAvanzado, async (req, res) => {
  const fechaPeriodo = primerDiaMes(req.params.periodo);
  const facturas = await prisma.factura.count({ where: { periodo: fechaPeriodo, estado: { not: "anulada" } } });
  if (facturas === 0) return res.status(400).json({ error: "No hay facturas generadas para este periodo" });
  const p = await prisma.periodoFacturacion.upsert({
    where: { periodo: fechaPeriodo },
    create: { periodo: fechaPeriodo, estado: "cerrado", fechaCierre: new Date(), cerradoPorId: req.usuario?.id ?? null },
    update: { estado: "cerrado", fechaCierre: new Date(), cerradoPorId: req.usuario?.id ?? null },
  });
  req.log?.info({ periodo: req.params.periodo, usuario: req.usuario?.id }, "Periodo de facturación cerrado");
  res.json(p);
});

// Reapertura excepcional: queda registrado quién lo hizo (en el propio registro y en el log).
facturacionRouter.post("/periodos/:periodo/reabrir", permisoAvanzado, async (req, res) => {
  const fechaPeriodo = primerDiaMes(req.params.periodo);
  const existente = await prisma.periodoFacturacion.findUnique({ where: { periodo: fechaPeriodo } });
  if (!existente || existente.estado !== "cerrado") return res.status(400).json({ error: "El periodo no está cerrado" });
  const quien = req.usuario?.id
    ? (await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { nombre: true } }))?.nombre
    : null;
  const p = await prisma.periodoFacturacion.update({
    where: { periodo: fechaPeriodo },
    data: {
      estado: "abierto",
      observaciones: `Reabierto por ${quien ?? "?"} el ${fechaLegibleColombia()}${existente.observaciones ? ` · ${existente.observaciones}` : ""}`,
    },
  });
  req.log?.warn({ periodo: req.params.periodo, usuario: req.usuario?.id }, "Periodo de facturación REABIERTO");
  res.json(p);
});

// ============================== VERIFICACIÓN DE PERIODO ==============================

// Checklist calculado contra el estado real de la base de datos (tarifa vigente, lecturas
// completas) — no hay nada que marcar a mano, ver lib/verificacionPeriodo.ts.
facturacionRouter.get("/periodos/:periodo/verificacion", permisoVer, async (req, res) => {
  const fechaPeriodo = primerDiaMes(req.params.periodo);
  res.json(await calcularVerificacionPeriodo(fechaPeriodo));
});

// ============================== TARIFAS ==============================

facturacionRouter.get("/tarifas", permisoVer, async (_req, res) => {
  const tarifas = await prisma.tarifa.findMany({
    orderBy: { vigenciaDesde: "desc" },
    include: { estratos: { include: { estrato: true } }, _count: { select: { facturas: true } } },
  });
  res.json(tarifas.map((t) => ({ ...t, facturas: t._count.facturas })));
});

facturacionRouter.post("/tarifas", permisoAvanzado, async (req, res) => {
  const { vigenciaDesde, cma, cmo, cmi, cmt, rangoBasicoHastaM3, rangoComplementarioHastaM3,
    alcCma, alcCmo, alcCmi, alcCmt, aseoCargoFijo, tasaMoraMensual, observaciones, estratos } = req.body;
  if (!vigenciaDesde || cma == null || cmo == null || cmi == null || cmt == null) {
    return res.status(400).json({ error: "vigenciaDesde, cma, cmo, cmi y cmt son requeridos" });
  }
  try {
    const tarifa = await prisma.tarifa.create({
      data: {
        vigenciaDesde: primerDiaMes(String(vigenciaDesde)),
        cma, cmo, cmi, cmt,
        rangoBasicoHastaM3: rangoBasicoHastaM3 ?? 16,
        rangoComplementarioHastaM3: rangoComplementarioHastaM3 ?? 32,
        alcCma: alcCma ?? null,
        alcCmo: alcCmo ?? null,
        alcCmi: alcCmi ?? null,
        alcCmt: alcCmt ?? null,
        aseoCargoFijo: aseoCargoFijo ?? null,
        tasaMoraMensual: tasaMoraMensual ?? 0,
        observaciones: observaciones || null,
        estratos: {
          create: (Array.isArray(estratos) ? estratos : []).map((e: { estratoId: number; porcentaje: number }) => ({
            estratoId: e.estratoId,
            porcentaje: e.porcentaje ?? 0,
          })),
        },
      },
      include: { estratos: { include: { estrato: true } } },
    });
    res.status(201).json(tarifa);
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ya existe una tarifa con esa vigencia" });
    throw err;
  }
});

facturacionRouter.put("/tarifas/:id", permisoAvanzado, async (req, res) => {
  const id = Number(req.params.id);
  const existente = await prisma.tarifa.findUnique({ where: { id }, include: { _count: { select: { facturas: true } } } });
  if (!existente) return res.status(404).json({ error: "No encontrada" });
  // Una tarifa con facturas emitidas no se puede modificar (las facturas la referencian como
  // fuente de sus valores): se crea una vigencia nueva en su lugar.
  if (existente._count.facturas > 0) {
    return res.status(400).json({ error: "Esta tarifa ya tiene facturas emitidas. Crea una vigencia nueva en su lugar." });
  }
  const { vigenciaDesde, cma, cmo, cmi, cmt, rangoBasicoHastaM3, rangoComplementarioHastaM3,
    alcCma, alcCmo, alcCmi, alcCmt, aseoCargoFijo, tasaMoraMensual, observaciones, estratos } = req.body;
  const tarifa = await prisma.$transaction(async (tx) => {
    if (Array.isArray(estratos)) {
      await tx.tarifaEstrato.deleteMany({ where: { tarifaId: id } });
      await tx.tarifaEstrato.createMany({
        data: estratos.map((e: { estratoId: number; porcentaje: number }) => ({
          tarifaId: id,
          estratoId: e.estratoId,
          porcentaje: e.porcentaje ?? 0,
        })),
      });
    }
    return tx.tarifa.update({
      where: { id },
      data: {
        vigenciaDesde: vigenciaDesde ? primerDiaMes(String(vigenciaDesde)) : undefined,
        cma, cmo, cmi, cmt, rangoBasicoHastaM3, rangoComplementarioHastaM3,
        alcCma: alcCma === undefined ? undefined : alcCma,
        alcCmo: alcCmo === undefined ? undefined : alcCmo,
        alcCmi: alcCmi === undefined ? undefined : alcCmi,
        alcCmt: alcCmt === undefined ? undefined : alcCmt,
        aseoCargoFijo: aseoCargoFijo === undefined ? undefined : aseoCargoFijo,
        tasaMoraMensual: tasaMoraMensual === undefined ? undefined : tasaMoraMensual,
        observaciones: observaciones === undefined ? undefined : observaciones || null,
      },
      include: { estratos: { include: { estrato: true } } },
    });
  });
  res.json(tarifa);
});

facturacionRouter.delete("/tarifas/:id", permisoAvanzado, async (req, res) => {
  const id = Number(req.params.id);
  const existente = await prisma.tarifa.findUnique({ where: { id }, include: { _count: { select: { facturas: true } } } });
  if (!existente) return res.status(404).json({ error: "No encontrada" });
  if (existente._count.facturas > 0) {
    return res.status(400).json({ error: "No se puede eliminar: tiene facturas emitidas" });
  }
  await prisma.tarifa.delete({ where: { id } });
  res.status(204).end();
});

// ============================== GENERACIÓN ==============================

// Consumo facturable por suscriptor en un periodo: lectura real de sus medidores (repartida
// con cotitulares — mismo criterio de reparto entero del resto del sistema) o, si no tiene
// medidor, el consumo predeterminado de la tarifa. Los suscriptores que NO se facturan
// (inactivos, predio inactivo, sin servicios activos) se devuelven aparte con su motivo, para
// que la generación los deje registrados como omitidos en vez de ignorarlos en silencio.
async function consumosDelPeriodo(fechaPeriodo: Date) {
  const todos = await prisma.suscriptor.findMany({
    include: {
      estratoCat: true,
      medidores: { where: { activo: true }, include: { lecturas: { where: { periodo: fechaPeriodo } }, cotitulares: true } },
      cotitularDe: { include: { medidor: { include: { lecturas: { where: { periodo: fechaPeriodo } }, cotitulares: true } } } },
    },
  });

  const omitidos: { suscriptorId: number; motivo: string }[] = [];
  const suscriptores: typeof todos = [];
  for (const s of todos) {
    if (s.estadoFacturacion === "inactivo") omitidos.push({ suscriptorId: s.id, motivo: "estado_inactivo" });
    else if (s.estadoPredio !== "activo") omitidos.push({ suscriptorId: s.id, motivo: "predio_inactivo" });
    else if (!s.tieneAcueducto && !s.tieneAlcantarillado) omitidos.push({ suscriptorId: s.id, motivo: "sin_servicios" });
    else suscriptores.push(s);
  }

  const facturables = suscriptores.map((s) => {
    let consumo = 0;
    let tieneLectura = false;
    for (const m of s.medidores) {
      const lectura = m.lecturas[0];
      if (!lectura) continue;
      tieneLectura = true;
      consumo += repartirEntero(Number(lectura.consumo), 1 + m.cotitulares.length, false);
    }
    if (s.cotitularDe) {
      const m = s.cotitularDe.medidor;
      const lectura = m.lecturas[0];
      if (lectura) {
        tieneLectura = true;
        consumo += repartirEntero(Number(lectura.consumo), 1 + m.cotitulares.length, true);
      }
    }
    const sinMedidor = !tieneLectura;
    return {
      suscriptor: s,
      consumoM3: sinMedidor ? Number(s.consumoPredeterminadoM3) : consumo,
      // Sin lectura real, alcantarillado usa SU PROPIO predeterminado (puede ser otra empresa
      // con otro promedio); con lectura real, es la misma agua medida para ambos servicios.
      consumoAlcantarilladoM3: sinMedidor ? Number(s.consumoPredeterminadoAlcantarilladoM3) : consumo,
      sinMedidor,
    };
  });

  return { facturables, omitidos };
}

// Previsualización: cuántas facturas se generarían y el total, sin escribir nada.
facturacionRouter.get("/generar/preview", permisoAvanzado, async (req, res) => {
  const periodo = String(req.query.periodo ?? periodoFacturableActual());
  const fechaPeriodo = primerDiaMes(periodo);
  if (!(await periodoListoParaFacturar(fechaPeriodo))) {
    return res.status(400).json({ error: MENSAJE_VERIFICACION_INCOMPLETA });
  }
  const tarifa = await tarifaVigente(fechaPeriodo);
  if (!tarifa) return res.status(400).json({ error: "No hay una tarifa vigente para ese periodo. Crea la tarifa primero." });

  const yaFacturados = await prisma.factura.count({ where: { periodo: fechaPeriodo, estado: { not: "anulada" } } });
  const { facturables, omitidos } = await consumosDelPeriodo(fechaPeriodo);
  const pctPorEstrato = new Map(tarifa.estratos.map((e) => [e.estratoId, Number(e.porcentaje)]));
  const calculo = tarifaACalculo(tarifa);

  let total = 0;
  let conLectura = 0;
  let sinMedidor = 0;
  for (const c of facturables) {
    const pct = c.suscriptor.estratoId ? pctPorEstrato.get(c.suscriptor.estratoId) ?? 0 : 0;
    total += liquidarFactura(
      c.consumoM3,
      calculo,
      pct,
      { tieneAcueducto: c.suscriptor.tieneAcueducto, tieneAlcantarillado: c.suscriptor.tieneAlcantarillado },
      c.consumoAlcantarilladoM3
    ).total;
    if (c.sinMedidor) sinMedidor++;
    else conLectura++;
  }
  res.json({
    periodo,
    tarifaId: tarifa.id,
    suscriptores: facturables.length,
    conLectura,
    sinMedidor,
    omitidos: omitidos.length,
    yaFacturados,
    totalEstimado: total,
  });
});

// Genera la facturación masiva de un periodo. Idempotente por suscriptor: si un suscriptor ya
// tiene factura (no anulada) de ese periodo, se omite — se puede correr de nuevo sin duplicar.
//
// Con ~4.300 suscriptores el proceso completo toma varios segundos: en vez de un único POST que
// deja al usuario esperando sin más señal que un spinner, arranca en segundo plano y responde con
// un jobId al toque (mismo patrón que los backups, ver lib/backupJobs.ts) — el frontend hace
// polling de /generar/:id/estado para mostrar una barra de progreso real (facturas creadas / total).
facturacionRouter.post("/generar/iniciar", permisoAvanzado, async (req, res) => {
  const periodo = String(req.body.periodo ?? periodoFacturableActual());
  const fechaPeriodo = primerDiaMes(periodo);
  const diasVencimiento = Number(req.body.diasVencimiento ?? 15);
  if (await periodoEstaCerrado(fechaPeriodo)) return res.status(400).json({ error: MENSAJE_PERIODO_CERRADO });
  if (!(await periodoListoParaFacturar(fechaPeriodo))) {
    return res.status(400).json({ error: MENSAJE_VERIFICACION_INCOMPLETA });
  }
  const tarifa = await tarifaVigente(fechaPeriodo);
  if (!tarifa) return res.status(400).json({ error: "No hay una tarifa vigente para ese periodo. Crea la tarifa primero." });

  const { facturables, omitidos } = await consumosDelPeriodo(fechaPeriodo);
  const existentes = await prisma.factura.findMany({
    where: { periodo: fechaPeriodo, estado: { not: "anulada" } },
    select: { suscriptorId: true },
  });
  const yaFacturados = new Set(existentes.map((f) => f.suscriptorId));
  const pendientes = facturables.filter((c) => !yaFacturados.has(c.suscriptor.id));

  const id = randomUUID();
  crearJobFacturacion(id, periodo, pendientes.length);
  res.status(202).json({ id });

  const pctPorEstrato = new Map(tarifa.estratos.map((e) => [e.estratoId, Number(e.porcentaje)]));
  const calculo = tarifaACalculo(tarifa);
  const fechaVencimiento = new Date(Date.now() + diasVencimiento * 24 * 60 * 60 * 1000);

  (async () => {
    try {
      let creadas = 0;
      let totalFacturado = 0;

      // En lotes dentro de transacciones cortas (no una sola gigante): con ~4.300 suscriptores una
      // transacción única mantendría locks demasiado tiempo.
      const LOTE = 200;
      for (let i = 0; i < pendientes.length; i += LOTE) {
        const lote = pendientes.slice(i, i + LOTE);
        await prisma.$transaction(async (tx) => {
          for (const c of lote) {
            const pct = c.suscriptor.estratoId ? pctPorEstrato.get(c.suscriptor.estratoId) ?? 0 : 0;
            const liq = liquidarFactura(
              c.consumoM3,
              calculo,
              pct,
              { tieneAcueducto: c.suscriptor.tieneAcueducto, tieneAlcantarillado: c.suscriptor.tieneAlcantarillado },
              c.consumoAlcantarilladoM3
            );
            const { conceptos: conceptosNota, totalAjuste, notaIds } = await conceptosDeNotasPendientes(tx, c.suscriptor.id, liq.total);
            const { concepto: conceptoCuota, cuotaId, acuerdoPagoId } = await conceptoDeSiguienteCuota(tx, c.suscriptor.id);
            const conceptosFinales = [...liq.conceptos, ...conceptosNota, ...(conceptoCuota ? [conceptoCuota] : [])];
            const totalFinal = liq.total + totalAjuste + (conceptoCuota?.valor ?? 0);
            const factura = await tx.factura.create({
              data: {
                // numero: lo asigna la secuencia de Postgres (default en el schema), no se
                // calcula acá — así dos generaciones en paralelo nunca chocan.
                suscriptorId: c.suscriptor.id,
                periodo: fechaPeriodo,
                tarifaId: tarifa.id,
                consumoM3: c.consumoM3,
                consumoAlcantarilladoM3: c.consumoAlcantarilladoM3,
                estratoCodigo: c.suscriptor.estratoCat?.codigo ?? null,
                estadoFacturacion: c.suscriptor.estadoFacturacion,
                sinMedidor: c.sinMedidor,
                subtotal: liq.subtotal,
                porcentajeAplicado: pct,
                ajusteEstrato: liq.ajusteEstrato,
                total: totalFinal,
                fechaVencimiento,
                conceptos: { create: conceptosFinales },
              },
            });
            await marcarNotasAplicadas(tx, notaIds, factura.id);
            if (cuotaId && acuerdoPagoId) await marcarCuotaAplicada(tx, cuotaId, acuerdoPagoId, factura.id);
            await generarComprobanteVenta(tx, factura.id, totalFinal, conceptosFinales, c.suscriptor.terceroId);
            totalFacturado += totalFinal;
            creadas++;
          }
        });
        actualizarProgresoFacturacion(id, creadas);
      }

      // Registra (o actualiza) el ciclo del periodo — nace "abierto"; el cierre es un paso aparte.
      await prisma.periodoFacturacion.upsert({
        where: { periodo: fechaPeriodo },
        create: { periodo: fechaPeriodo, fechaGeneracion: new Date() },
        update: { fechaGeneracion: new Date() },
      });

      // Los no facturados quedan documentados con su motivo (estado_inactivo/predio_inactivo/
      // sin_servicios) — el periodo tiene registro de TODOS los suscriptores, no solo los cobrados.
      for (const o of omitidos) {
        await prisma.facturacionOmitida.upsert({
          where: { suscriptorId_periodo: { suscriptorId: o.suscriptorId, periodo: fechaPeriodo } },
          create: { suscriptorId: o.suscriptorId, periodo: fechaPeriodo, motivo: o.motivo },
          update: { motivo: o.motivo },
        });
      }

      marcarListoFacturacion(id, { creadas, omitidas: yaFacturados.size, omitidos: omitidos.length, totalFacturado });
      req.log?.info({ periodo, creadas, omitidas: yaFacturados.size, omitidosSinFacturar: omitidos.length }, "Facturación generada");
    } catch (err: any) {
      marcarErrorFacturacion(id, err?.message ?? "Error desconocido al generar la facturación");
      req.log?.error({ err, periodo }, "Error generando facturación");
    }
  })();
});

facturacionRouter.get("/generar/:id/estado", permisoAvanzado, (req, res) => {
  const job = obtenerJobFacturacion(req.params.id);
  if (!job) return res.status(404).json({ error: "No encontrado (puede que ya haya expirado)" });
  res.json(job);
});

// Deshacer POR COMPLETO la facturación de un periodo (caso típico: se generó de prueba o con
// la tarifa equivocada). A diferencia de anular factura por factura (que deja el consecutivo
// lleno de anuladas), esto BORRA las facturas del periodo con sus conceptos — solo se permite
// si el periodo está abierto y NINGUNA factura tiene pagos registrados; si ya hay pagos, lo
// emitido está en la calle y ahí sí toca anular una por una.
facturacionRouter.delete("/generar/:periodo", permisoAvanzado, async (req, res) => {
  const fechaPeriodo = primerDiaMes(req.params.periodo);
  if (await periodoEstaCerrado(fechaPeriodo)) return res.status(400).json({ error: MENSAJE_PERIODO_CERRADO });

  const [totalFacturas, conPagos] = await Promise.all([
    prisma.factura.count({ where: { periodo: fechaPeriodo } }),
    prisma.factura.count({ where: { periodo: fechaPeriodo, pagos: { some: {} } } }),
  ]);
  if (totalFacturas === 0) return res.status(400).json({ error: "No hay facturas en ese periodo" });
  if (conPagos > 0) {
    return res.status(400).json({
      error: `${conPagos} factura(s) de ese periodo ya tienen pagos registrados — no se puede deshacer en bloque. Anula individualmente las que necesites.`,
    });
  }

  // El chequeo de "conPagos" de arriba tiene una ventana teórica de carrera (alguien registra un
  // pago justo entre ese count() y este borrado) — pero Pago.facturaId es ON DELETE RESTRICT en
  // la base, así que si eso llega a pasar, el deleteMany de Factura choca contra esa restricción
  // y Postgres revierte TODA la transacción sola (nada queda borrado a medias). Acá solo se
  // traduce ese choque a un mensaje claro en vez de dejarlo caer como error 500 genérico.
  try {
    const eliminadas = await prisma.$transaction(async (tx) => {
      const facturas = await tx.factura.findMany({ where: { periodo: fechaPeriodo }, select: { id: true } });
      await tx.facturaConcepto.deleteMany({ where: { factura: { periodo: fechaPeriodo } } });
      await tx.periodoFacturacion.deleteMany({ where: { periodo: fechaPeriodo } });
      await tx.facturacionOmitida.deleteMany({ where: { periodo: fechaPeriodo } });
      const eliminadas = await tx.factura.deleteMany({ where: { periodo: fechaPeriodo } });
      // Sin esto, los comprobantes de "venta" de las facturas borradas quedan huérfanos y
      // contabilizados — plata "facturada" en los libros que ya no corresponde a ninguna factura
      // real (bug real encontrado en producción: 3.875 comprobantes por $84,9M quedaron así tras
      // deshacer una generación).
      await anularComprobantesEnLote(tx, "Factura", facturas.map((f) => f.id));
      return eliminadas;
    });

    req.log?.warn(
      { periodo: req.params.periodo, eliminadas: eliminadas.count, usuario: req.usuario?.id },
      "Facturación de periodo ELIMINADA en bloque"
    );
    res.json({ eliminadas: eliminadas.count });
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return res.status(409).json({
        error: "Se registró un pago justo ahora sobre una factura de este periodo — ya no se puede deshacer en bloque. Vuelve a intentarlo o anula individualmente las facturas sin pago.",
      });
    }
    throw err;
  }
});

// Suscriptores omitidos en la generación de un periodo, con su motivo.
facturacionRouter.get("/omitidos", permisoVer, async (req, res) => {
  const { periodo } = req.query;
  if (!periodo) return res.status(400).json({ error: "periodo (YYYY-MM) es requerido" });
  const omitidos = await prisma.facturacionOmitida.findMany({
    where: { periodo: primerDiaMes(String(periodo)) },
    include: { suscriptor: { select: { id: true, codigo: true, nombre: true } } },
    orderBy: { suscriptorId: "asc" },
  });
  res.json(omitidos);
});

// ============================== FACTURAS ==============================

facturacionRouter.get("/facturas", permisoVer, async (req, res) => {
  const { periodo, estado, q, page, limit } = req.query;
  const filtros: any[] = [];
  if (periodo) filtros.push({ periodo: primerDiaMes(String(periodo)) });
  if (estado === "con_saldo") filtros.push({ estado: "pendiente" });
  else if (estado) filtros.push({ estado: String(estado) });
  if (q) {
    const texto = String(q).trim();
    const comoNumero = Number(texto);
    filtros.push({
      OR: [
        { suscriptor: { nombre: { contains: texto, mode: "insensitive" as const } } },
        { suscriptor: { codigo: { contains: texto, mode: "insensitive" as const } } },
        ...(Number.isInteger(comoNumero) && comoNumero > 0 ? [{ numero: comoNumero }] : []),
      ],
    });
  }
  const where = filtros.length ? { AND: filtros } : {};
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);
  const [facturas, total] = await Promise.all([
    prisma.factura.findMany({
      where,
      include: { suscriptor: { include: { barrioCat: true } }, pagos: { select: { valor: true } } },
      orderBy: [{ periodo: "desc" }, { numero: "desc" }],
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.factura.count({ where }),
  ]);
  res.json({
    data: facturas.map((f) => ({
      ...f,
      pagado: f.pagos.reduce((acc, p) => acc + Number(p.valor), 0),
      saldo: Number(f.total) - f.pagos.reduce((acc, p) => acc + Number(p.valor), 0),
      pagos: undefined,
    })),
    total,
    page: pageNum,
    limit: limitNum,
  });
});

facturacionRouter.get("/facturas/:id", permisoVer, async (req, res) => {
  const factura = await prisma.factura.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      suscriptor: { include: { barrioCat: true, estratoCat: true } },
      conceptos: true,
      pagos: { include: { registradoPor: { select: { nombre: true } } }, orderBy: { fecha: "desc" } },
      tarifa: true,
      pqr: { select: { id: true, numeroRadicado: true, estado: true } },
    },
  });
  if (!factura) return res.status(404).json({ error: "No encontrada" });
  const pagado = factura.pagos.reduce((acc, p) => acc + Number(p.valor), 0);
  const saldo = Number(factura.total) - pagado;
  const mora =
    factura.estado === "pendiente"
      ? calcularMora(factura.fechaVencimiento, saldo, Number(factura.tarifa.tasaMoraMensual))
      : { diasMora: 0, interesMora: 0 };
  res.json({ ...factura, pagado, saldo, ...mora });
});

// Anular (no borrar: la numeración es consecutiva y una factura emitida debe quedar rastreable).
// El motivo puede venir como texto libre y/o el número de radicado de una PQR ya existente — se
// resuelve por radicado en vez de ofrecer un buscador aparte (quien anula por una reclamación ya
// tiene ese número a la mano, y así no hace falta darle a esta pantalla el permiso de PQRS solo
// para buscar una). El vínculo estructurado (Factura.pqrId) deja rastro consultable, a diferencia
// de antes que solo quedaba el texto suelto en "observaciones".
facturacionRouter.put("/facturas/:id/anular", permisoAvanzado, async (req, res) => {
  const id = Number(req.params.id);
  const { motivo, numeroRadicadoPqr } = req.body;
  const factura = await prisma.factura.findUnique({ where: { id }, include: { pagos: true } });
  if (!factura) return res.status(404).json({ error: "No encontrada" });
  if (await periodoEstaCerrado(factura.periodo)) return res.status(400).json({ error: MENSAJE_PERIODO_CERRADO });
  if (factura.pagos.length > 0) return res.status(400).json({ error: "No se puede anular: ya tiene pagos registrados" });

  let pqrId: number | null = null;
  if (numeroRadicadoPqr) {
    const pqr = await prisma.pqr.findUnique({ where: { numeroRadicado: String(numeroRadicadoPqr).trim() } });
    if (!pqr) return res.status(400).json({ error: `No existe ninguna PQR con el radicado "${numeroRadicadoPqr}"` });
    pqrId = pqr.id;
  }

  const actualizada = await prisma.$transaction(async (tx) => {
    const actualizada = await tx.factura.update({
      where: { id },
      data: { estado: "anulada", observaciones: motivo ? `ANULADA: ${motivo}` : "ANULADA", pqrId },
    });
    await anularComprobante(tx, "Factura", id);
    return actualizada;
  });
  res.json(actualizada);
});

// ============================== PAGOS ==============================

facturacionRouter.post("/pagos", permisoPagos, async (req, res) => {
  const { facturaId, valor, medio, observaciones } = req.body;
  if (!facturaId || !valor || Number(valor) <= 0) {
    return res.status(400).json({ error: "facturaId y valor (> 0) son requeridos" });
  }
  const factura = await prisma.factura.findUnique({
    where: { id: Number(facturaId) },
    include: { pagos: true, suscriptor: { select: { terceroId: true } } },
  });
  if (!factura) return res.status(404).json({ error: "Factura no encontrada" });
  if (factura.estado === "anulada") return res.status(400).json({ error: "La factura está anulada" });
  const pagado = factura.pagos.reduce((acc, p) => acc + Number(p.valor), 0);
  const saldo = Number(factura.total) - pagado;
  if (Number(valor) > saldo) {
    return res.status(400).json({ error: `El valor supera el saldo pendiente (${fmtPesos(saldo)})` });
  }
  const valorRedondeado = Math.round(Number(valor));
  const nuevoSaldo = saldo - valorRedondeado;
  const pago = await prisma.$transaction(async (tx) => {
    const pago = await tx.pago.create({
      data: {
        facturaId: factura.id,
        valor: valorRedondeado,
        medio: medio === "consignacion" || medio === "otro" ? medio : "efectivo",
        observaciones: observaciones || null,
        registradoPorId: req.usuario?.id ?? null,
      },
      include: { registradoPor: { select: { nombre: true } } },
    });
    await tx.factura.update({ where: { id: factura.id }, data: { estado: nuevoSaldo <= 0 ? "pagada" : "pendiente" } });
    await generarComprobantePago(tx, pago.id, valorRedondeado, factura.suscriptor.terceroId);
    return pago;
  });
  res.status(201).json({ ...pago, saldoRestante: nuevoSaldo });
});

facturacionRouter.get("/pagos", permisoVer, async (req, res) => {
  const { desde, hasta, page, limit } = req.query;
  const filtroFecha: any = {};
  if (desde) filtroFecha.gte = new Date(String(desde));
  if (hasta) filtroFecha.lte = new Date(`${String(hasta)}T23:59:59`);
  const where = Object.keys(filtroFecha).length ? { fecha: filtroFecha } : {};
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);
  const [pagos, total, suma] = await Promise.all([
    prisma.pago.findMany({
      where,
      include: {
        factura: { include: { suscriptor: { select: { codigo: true, nombre: true } } } },
        registradoPor: { select: { nombre: true } },
      },
      orderBy: { fecha: "desc" },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.pago.count({ where }),
    prisma.pago.aggregate({ where, _sum: { valor: true } }),
  ]);
  res.json({ data: pagos, total, page: pageNum, limit: limitNum, sumaValor: Number(suma._sum.valor ?? 0) });
});

// Deshacer un pago mal registrado. Mismo permiso que registrarlo (pagos_registrar) — quien puede
// cobrar en caja debe poder corregir su propio error sin depender de alguien con permiso de
// Facturación (avanzado), que es un rol mucho más amplio (tarifas, anular facturas, etc.).
// Recalcula el saldo con los pagos QUE QUEDAN (no asume que se borra el único pago existente): si
// la factura tenía dos abonos y se borra uno, puede seguir "pagada" con el otro; si queda con
// saldo, vuelve a "pendiente". Una factura anulada no se reabre por esto — anular ya es la vía
// para dejarla sin efecto.
facturacionRouter.delete("/pagos/:id", permisoPagos, async (req, res) => {
  const pago = await prisma.pago.findUnique({
    where: { id: Number(req.params.id) },
    include: { factura: { include: { pagos: true } } },
  });
  if (!pago) return res.status(404).json({ error: "No encontrado" });
  const pagadoRestante = pago.factura.pagos
    .filter((p) => p.id !== pago.id)
    .reduce((acc, p) => acc + Number(p.valor), 0);
  const saldoRestante = Number(pago.factura.total) - pagadoRestante;
  await prisma.$transaction(async (tx) => {
    await tx.pago.delete({ where: { id: pago.id } });
    if (pago.factura.estado !== "anulada") {
      await tx.factura.update({
        where: { id: pago.facturaId },
        data: { estado: saldoRestante <= 0 ? "pagada" : "pendiente" },
      });
    }
    await anularComprobante(tx, "Pago", pago.id);
  });
  req.log?.info({ pagoId: pago.id, facturaId: pago.facturaId, usuario: req.usuario?.id }, "Pago eliminado");
  res.status(204).end();
});

// ============================== NOTAS (crédito/débito) ==============================
// Antes de esto, un ajuste al saldo de un suscriptor solo se podía meter a mano dentro de una
// factura ya generada (concepto tipo "manual") — sin documento propio con consecutivo, y sin que
// el ajuste se arrastrara solo a la siguiente factura si todavía no había una donde meterlo. Una
// nota queda "pendiente" hasta que la próxima generación masiva de ese suscriptor la aplica sola
// (ver conceptosDeNotasPendientes en lib/notas.ts, llamado desde POST /generar/iniciar).

facturacionRouter.get("/notas", permisoVer, async (req, res) => {
  const { suscriptorId, estado, page, limit } = req.query;
  const where: Record<string, unknown> = {};
  if (suscriptorId) where.suscriptorId = Number(suscriptorId);
  if (estado) where.estado = String(estado);
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 20);
  const [notas, total] = await Promise.all([
    prisma.nota.findMany({
      where,
      include: {
        suscriptor: { select: { codigo: true, nombre: true } },
        pqr: { select: { numeroRadicado: true } },
        facturaAplicada: { select: { numero: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.nota.count({ where }),
  ]);
  res.json({ data: notas, total, page: pageNum, limit: limitNum });
});

facturacionRouter.post("/notas", permisoAvanzado, async (req, res) => {
  const { suscriptorId, tipo, valor, concepto, numeroRadicadoPqr } = req.body;
  if (!suscriptorId) return res.status(400).json({ error: "El suscriptor es requerido" });
  if (tipo !== "credito" && tipo !== "debito") return res.status(400).json({ error: "Tipo inválido (credito | debito)" });
  const valorNum = Number(valor);
  if (!valorNum || valorNum <= 0) return res.status(400).json({ error: "El valor debe ser mayor a cero" });
  if (!concepto || !String(concepto).trim()) return res.status(400).json({ error: "El concepto es requerido" });

  const suscriptor = await prisma.suscriptor.findUnique({ where: { id: Number(suscriptorId) } });
  if (!suscriptor) return res.status(404).json({ error: "Suscriptor no encontrado" });

  let pqrId: number | null = null;
  if (numeroRadicadoPqr) {
    const pqr = await prisma.pqr.findUnique({ where: { numeroRadicado: String(numeroRadicadoPqr).trim() } });
    if (!pqr) return res.status(400).json({ error: `No existe ninguna PQR con el radicado "${numeroRadicadoPqr}"` });
    pqrId = pqr.id;
  }

  const nota = await prisma.nota.create({
    data: {
      suscriptorId: Number(suscriptorId),
      tipo,
      valor: valorNum,
      concepto: String(concepto).trim(),
      pqrId,
      creadoPorId: req.usuario?.id ?? null,
    },
    include: { suscriptor: { select: { codigo: true, nombre: true } }, pqr: { select: { numeroRadicado: true } } },
  });
  res.status(201).json(nota);
});

facturacionRouter.delete("/notas/:id", permisoAvanzado, async (req, res) => {
  const nota = await prisma.nota.findUnique({ where: { id: Number(req.params.id) } });
  if (!nota) return res.status(404).json({ error: "No encontrada" });
  if (nota.estado !== "pendiente") {
    return res.status(400).json({ error: "Solo se puede anular una nota que todavía no se ha aplicado a una factura" });
  }
  await prisma.nota.update({ where: { id: nota.id }, data: { estado: "anulada" } });
  res.status(204).end();
});

// ============================== ACUERDOS DE PAGO ==============================
// Financia UNA factura vencida en cuotas — antes de esto la única forma de manejar una mora alta
// era anular/reemitir facturas a mano, sin ningún rastro de que era un acuerdo. Al crear el
// acuerdo, la factura original se anula (mismo mecanismo que PUT /facturas/:id/anular) y su saldo
// se reparte en cuotas que se van aplicando UNA POR FACTURA en las próximas generaciones de ese
// suscriptor (ver lib/acuerdosPago.ts).

facturacionRouter.get("/acuerdos-pago", permisoVer, async (req, res) => {
  const { suscriptorId, estado, page, limit } = req.query;
  const where: Record<string, unknown> = {};
  if (suscriptorId) where.suscriptorId = Number(suscriptorId);
  if (estado) where.estado = String(estado);
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 20);
  const [acuerdos, total] = await Promise.all([
    prisma.acuerdoPago.findMany({
      where,
      include: {
        suscriptor: { select: { codigo: true, nombre: true } },
        factura: { select: { numero: true } },
        pqr: { select: { numeroRadicado: true } },
        cuotas: { orderBy: { numero: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.acuerdoPago.count({ where }),
  ]);
  res.json({ data: acuerdos, total, page: pageNum, limit: limitNum });
});

// Dos formas de crear un acuerdo: (a) financiando una FACTURA VENCIDA existente (facturaId) — la
// factura se anula y su total se reparte en cuotas; o (b) financiando un CARGO NUEVO que nunca
// existió como factura (suscriptorId + valorCargo) — ej. matrícula/conexión nueva en cuotas. No
// se puede mandar ambos ni ninguno.
facturacionRouter.post("/acuerdos-pago", permisoAvanzado, async (req, res) => {
  const { facturaId, suscriptorId, valorCargo, numeroCuotas, concepto, numeroRadicadoPqr } = req.body;
  const cuotas = Number(numeroCuotas);
  if (!Number.isInteger(cuotas) || cuotas < 2) return res.status(400).json({ error: "El número de cuotas debe ser 2 o más" });
  if (!concepto || !String(concepto).trim()) return res.status(400).json({ error: "El concepto es requerido" });
  if (!facturaId && !suscriptorId) return res.status(400).json({ error: "Indica una factura a financiar o un suscriptor + valor para un cargo nuevo" });
  if (facturaId && suscriptorId) return res.status(400).json({ error: "Indica solo una factura O un suscriptor, no ambos" });

  let pqrId: number | null = null;
  if (numeroRadicadoPqr) {
    const pqr = await prisma.pqr.findUnique({ where: { numeroRadicado: String(numeroRadicadoPqr).trim() } });
    if (!pqr) return res.status(400).json({ error: `No existe ninguna PQR con el radicado "${numeroRadicadoPqr}"` });
    pqrId = pqr.id;
  }

  let datosAcuerdo: { suscriptorId: number; facturaId: number | null; valorTotal: number };
  let anularFacturaEnTx: number | null = null;

  if (facturaId) {
    const factura = await prisma.factura.findUnique({ where: { id: Number(facturaId) }, include: { pagos: true } });
    if (!factura) return res.status(404).json({ error: "Factura no encontrada" });
    if (factura.estado !== "pendiente") return res.status(400).json({ error: "Solo se puede financiar una factura pendiente" });
    if (factura.pagos.length > 0) {
      return res.status(400).json({ error: "Esta factura ya tiene pagos registrados — no se puede financiar en un acuerdo" });
    }
    if (await periodoEstaCerrado(factura.periodo)) return res.status(400).json({ error: MENSAJE_PERIODO_CERRADO });
    datosAcuerdo = { suscriptorId: factura.suscriptorId, facturaId: factura.id, valorTotal: Math.round(Number(factura.total)) };
    anularFacturaEnTx = factura.id;
  } else {
    const valor = Math.round(Number(valorCargo));
    if (!valor || valor <= 0) return res.status(400).json({ error: "El valor del cargo debe ser mayor a cero" });
    const suscriptor = await prisma.suscriptor.findUnique({ where: { id: Number(suscriptorId) } });
    if (!suscriptor) return res.status(404).json({ error: "Suscriptor no encontrado" });
    datosAcuerdo = { suscriptorId: suscriptor.id, facturaId: null, valorTotal: valor };
  }

  const valorPorCuota = Math.floor(datosAcuerdo.valorTotal / cuotas);
  const cuotasData = Array.from({ length: cuotas }, (_, i) => ({
    numero: i + 1,
    valor: i === cuotas - 1 ? datosAcuerdo.valorTotal - valorPorCuota * (cuotas - 1) : valorPorCuota,
  }));

  const acuerdo = await prisma.$transaction(async (tx) => {
    if (anularFacturaEnTx) {
      await tx.factura.update({
        where: { id: anularFacturaEnTx },
        data: { estado: "anulada", observaciones: `ANULADA: financiada en acuerdo de pago — ${concepto}`, pqrId },
      });
      await anularComprobante(tx, "Factura", anularFacturaEnTx);
    }
    return tx.acuerdoPago.create({
      data: {
        suscriptorId: datosAcuerdo.suscriptorId,
        facturaId: datosAcuerdo.facturaId,
        valorTotal: datosAcuerdo.valorTotal,
        numeroCuotas: cuotas,
        concepto: String(concepto).trim(),
        pqrId,
        creadoPorId: req.usuario?.id ?? null,
        cuotas: { create: cuotasData },
      },
      include: { suscriptor: { select: { codigo: true, nombre: true } }, factura: { select: { numero: true } }, cuotas: true },
    });
  });
  res.status(201).json(acuerdo);
});

facturacionRouter.delete("/acuerdos-pago/:id", permisoAvanzado, async (req, res) => {
  const acuerdo = await prisma.acuerdoPago.findUnique({ where: { id: Number(req.params.id) } });
  if (!acuerdo) return res.status(404).json({ error: "No encontrado" });
  if (acuerdo.estado !== "activo") return res.status(400).json({ error: "Este acuerdo ya no está activo" });
  // Las cuotas ya aplicadas (en facturas ya generadas) quedan tal cual — solo se detiene que se
  // sigan aplicando cuotas futuras. No se intenta deshacer facturas que ya se emitieron con una
  // cuota de este acuerdo.
  await prisma.acuerdoPago.update({ where: { id: acuerdo.id }, data: { estado: "anulado" } });
  res.status(204).end();
});

// ============================== CARTERA ==============================

// Resumen de cartera: saldo total pendiente, por edades (según fechaEmision) y por barrio.
// El saldo (total - pagos) se calcula EN Postgres, no trayendo cada factura pendiente con sus
// pagos a Node para sumarlos ahí: con la cartera acumulada creciendo mes a mes, ese findMany()
// completo era la parte más pesada de esta pantalla. Los pagos se pre-agregan por factura en
// una subconsulta antes de unirlos, para no inflar el total al hacer join con varios pagos.
facturacionRouter.get("/cartera/resumen", permisoVer, async (_req, res) => {
  const filas = await prisma.$queryRaw<
    { barrio: string | null; dias: number; saldo: number }[]
  >`
    SELECT b.nombre AS barrio,
           EXTRACT(DAY FROM (now() - f."fechaEmision"))::float8 AS dias,
           (f.total - COALESCE(pg.pagado, 0))::float8 AS saldo
    FROM "Factura" f
    JOIN "Suscriptor" s ON s.id = f."suscriptorId"
    LEFT JOIN "Barrio" b ON b.id = s."barrioId"
    LEFT JOIN (
      SELECT "facturaId", SUM(valor) AS pagado FROM "Pago" GROUP BY "facturaId"
    ) pg ON pg."facturaId" = f.id
    WHERE f.estado = 'pendiente'
      AND f.total - COALESCE(pg.pagado, 0) > 0
  `;

  let total = 0;
  const edades = { d0_30: 0, d31_60: 0, d61_90: 0, d90mas: 0 };
  const porBarrio = new Map<string, number>();
  for (const f of filas) {
    total += f.saldo;
    if (f.dias <= 30) edades.d0_30 += f.saldo;
    else if (f.dias <= 60) edades.d31_60 += f.saldo;
    else if (f.dias <= 90) edades.d61_90 += f.saldo;
    else edades.d90mas += f.saldo;
    const barrio = f.barrio ?? "Sin barrio";
    porBarrio.set(barrio, (porBarrio.get(barrio) ?? 0) + f.saldo);
  }
  res.json({
    total,
    facturas: filas.length,
    edades,
    porBarrio: Array.from(porBarrio.entries())
      .map(([barrio, saldo]) => ({ barrio, saldo }))
      .sort((a, b) => b.saldo - a.saldo),
  });
});

// Cartera por suscriptor: quiénes deben, cuánto y hace cuántos periodos. Agrupado y paginado EN
// Postgres (antes traía TODAS las facturas pendientes de TODOS los suscriptores a memoria para
// agrupar y paginar en JS) — con COUNT(*) OVER() se saca el total de suscriptores con saldo en
// la misma consulta, sin un segundo roundtrip.
facturacionRouter.get("/cartera", permisoVer, async (req, res) => {
  const { q, page, limit } = req.query;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);
  const texto = q ? `%${String(q).trim()}%` : null;

  const filas = await prisma.$queryRaw<
    {
      suscriptorId: number;
      codigo: string;
      nombre: string;
      barrio: string | null;
      saldo: number;
      facturas: number;
      masAntigua: Date;
      totalFilas: number;
    }[]
  >`
    SELECT s.id AS "suscriptorId", s.codigo, s.nombre, b.nombre AS barrio,
           SUM(f.total - COALESCE(pg.pagado, 0))::float8 AS saldo,
           COUNT(*)::int AS facturas,
           MIN(f.periodo) AS "masAntigua",
           COUNT(*) OVER()::int AS "totalFilas"
    FROM "Factura" f
    JOIN "Suscriptor" s ON s.id = f."suscriptorId"
    LEFT JOIN "Barrio" b ON b.id = s."barrioId"
    LEFT JOIN (
      SELECT "facturaId", SUM(valor) AS pagado FROM "Pago" GROUP BY "facturaId"
    ) pg ON pg."facturaId" = f.id
    WHERE f.estado = 'pendiente'
      ${texto ? Prisma.sql`AND (s.nombre ILIKE ${texto} OR s.codigo ILIKE ${texto})` : Prisma.empty}
    GROUP BY s.id, s.codigo, s.nombre, b.nombre
    HAVING SUM(f.total - COALESCE(pg.pagado, 0)) > 0
    ORDER BY saldo DESC
    LIMIT ${limitNum} OFFSET ${(pageNum - 1) * limitNum}
  `;

  res.json({
    data: filas.map((f) => ({
      suscriptorId: f.suscriptorId,
      codigo: f.codigo,
      nombre: f.nombre,
      barrio: f.barrio,
      saldo: f.saldo,
      facturasPendientes: f.facturas,
      periodoMasAntiguo: f.masAntigua.toISOString().slice(0, 7),
    })),
    total: filas[0]?.totalFilas ?? 0,
    page: pageNum,
    limit: limitNum,
  });
});

// ============================== PDF ==============================

function pdfDeFactura(doc: PDFKit.PDFDocument, factura: {
  numero: number;
  periodo: Date;
  fechaEmision: Date;
  fechaVencimiento: Date | null;
  consumoM3: unknown;
  consumoAlcantarilladoM3: unknown;
  sinMedidor: boolean;
  estratoCodigo: string | null;
  subtotal: unknown;
  ajusteEstrato: unknown;
  total: unknown;
  suscriptor: {
    codigo: string;
    nombre: string;
    direccion: string | null;
    barrioCat: { nombre: string } | null;
    tercero?: { tipoDocumento: string; numeroDocumento: string | null; nombre: string } | null;
  };
  conceptos: { descripcion: string; cantidad: unknown; valorUnitario: unknown; valor: unknown }[];
  pagado?: number;
}) {
  const periodoStr = factura.periodo.toISOString().slice(0, 7);
  encabezadoPdf(doc, `Factura de servicios No. ${factura.numero}`, `Gestión Comercial · Periodo ${periodoStr}`);

  const tercero = factura.suscriptor.tercero;
  const documento =
    tercero?.numeroDocumento && !tercero.numeroDocumento.startsWith("PEND-")
      ? `${tercero.tipoDocumento} ${tercero.numeroDocumento}`
      : "—";
  tarjetaDatosPdf(doc, [
    ["NUID", factura.suscriptor.codigo],
    ["Titular", tercero?.nombre ?? factura.suscriptor.nombre],
    ["Documento", documento],
    ["Dirección", factura.suscriptor.direccion ?? "—"],
    ["Barrio", factura.suscriptor.barrioCat?.nombre ?? "—"],
    ["Estrato", factura.estratoCodigo ?? "—"],
    [
      "Consumo",
      (() => {
        const acu = Number(factura.consumoM3);
        const alc = Number(factura.consumoAlcantarilladoM3);
        const sufijo = factura.sinMedidor ? " (sin medidor)" : "";
        return acu === alc ? `${acu} m³${sufijo}` : `Acu. ${acu} m³ · Alc. ${alc} m³${sufijo}`;
      })(),
    ],
    ["Emisión", fechaLegibleColombia(factura.fechaEmision)],
    ["Vencimiento", factura.fechaVencimiento ? fechaLegibleColombia(factura.fechaVencimiento) : "—"],
  ]);

  tituloSeccionPdf(doc, "Detalle de la factura");
  tablaPdf(
    doc,
    [
      { titulo: "CONCEPTO", clave: "descripcion", ancho: 235 },
      { titulo: "CANTIDAD", clave: "cantidad", ancho: 90, align: "right" },
      { titulo: "VALOR UNITARIO", clave: "valorUnitario", ancho: 95, align: "right" },
      { titulo: "VALOR", clave: "valor", ancho: 95, align: "right" },
    ],
    factura.conceptos.map((c) => ({
      descripcion: c.descripcion,
      cantidad: c.cantidad != null ? `${Number(c.cantidad)} m³` : "",
      valorUnitario: c.valorUnitario != null ? fmtPesos(Number(c.valorUnitario)) : "",
      valor: fmtPesos(Number(c.valor)),
    }))
  );

  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text(`TOTAL A PAGAR: ${fmtPesos(Number(factura.total))}`, {
    align: "right",
  });
  if (factura.pagado && factura.pagado > 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#64748b").text(
      `Pagado: ${fmtPesos(factura.pagado)} · Saldo: ${fmtPesos(Number(factura.total) - factura.pagado)}`,
      { align: "right" }
    );
  }
  doc.font("Helvetica").fillColor("#0f172a");
}

// ===================== Plantillas de factura (sobreimpresión sobre papel pre-impreso) =====================
//
// Las facturas físicas de la imprenta ya traen su propio diseño/membrete: en vez del PDF completo
// de pdfDeFactura (pensado para papel en blanco), acá se genera uno que SOLO escribe cada dato en
// las coordenadas x/y que el usuario definió en el editor visual — nada de fondos, tablas ni logo.
//
// Forma completa que necesita valorDeCampo — el include real de cada endpoint que genera PDF debe
// traer al menos esto (ver /facturas/:id/pdf y /pdf-lote más abajo).
type FacturaParaPlantilla = {
  numero: number;
  periodo: Date;
  fechaEmision: Date;
  fechaVencimiento: Date | null;
  consumoM3: unknown;
  consumoAlcantarilladoM3: unknown;
  sinMedidor: boolean;
  estratoCodigo: string | null;
  subtotal: unknown;
  ajusteEstrato: unknown;
  total: unknown;
  suscriptor: {
    codigo: string;
    nombre: string;
    ruta: string | null;
    direccion: string | null;
    direccionComercial: string | null;
    barrioCat: { nombre: string } | null;
    tercero?: { tipoDocumento: string; numeroDocumento: string | null; nombre: string } | null;
  };
  conceptos: { tipo: string; cantidad: unknown; valor: unknown }[];
  pagado?: number;
};

// Catálogo de campos que se pueden arrastrar al lienzo del editor — la clave ("campo" en
// MarcadorPlantilla) es la que resuelve valorDeCampo de abajo. Mantenerlos sincronizados: un
// campo nuevo acá SIN su caso en valorDeCampo se imprimiría vacío.
export const CAMPOS_DISPONIBLES = [
  { clave: "numero", etiqueta: "N° de factura", categoria: "Factura" },
  // El "recaudo rápido" (ver /pagos/buscar) busca por este mismo número — al escanearlo desde una
  // factura impresa, encuentra la factura exacta sin tener que buscarla a mano en la lista.
  { clave: "numeroBarras", etiqueta: "N° de factura (código de barras)", categoria: "Factura" },
  { clave: "periodo", etiqueta: "Periodo facturado", categoria: "Factura" },
  { clave: "fechaEmision", etiqueta: "Fecha de emisión", categoria: "Factura" },
  { clave: "fechaVencimiento", etiqueta: "Fecha de vencimiento", categoria: "Factura" },
  { clave: "nuid", etiqueta: "NUID", categoria: "Suscriptor" },
  { clave: "titular", etiqueta: "Nombre del titular", categoria: "Suscriptor" },
  { clave: "documento", etiqueta: "Documento del titular", categoria: "Suscriptor" },
  { clave: "direccion", etiqueta: "Dirección del predio", categoria: "Suscriptor" },
  { clave: "direccionComercial", etiqueta: "Dirección de correspondencia", categoria: "Suscriptor" },
  { clave: "barrio", etiqueta: "Barrio", categoria: "Suscriptor" },
  { clave: "ruta", etiqueta: "Ruta", categoria: "Suscriptor" },
  { clave: "estrato", etiqueta: "Estrato", categoria: "Suscriptor" },
  { clave: "consumoM3", etiqueta: "Consumo acueducto (m³)", categoria: "Consumo" },
  { clave: "consumoAlcantarilladoM3", etiqueta: "Consumo alcantarillado (m³)", categoria: "Consumo" },
  { clave: "cargoFijo", etiqueta: "Cargo fijo", categoria: "Conceptos" },
  { clave: "consumoBasico", etiqueta: "Consumo básico", categoria: "Conceptos" },
  { clave: "consumoComplementario", etiqueta: "Consumo complementario", categoria: "Conceptos" },
  { clave: "consumoSuntuario", etiqueta: "Consumo suntuario", categoria: "Conceptos" },
  { clave: "alcantarilladoFijo", etiqueta: "Alcantarillado - cargo fijo", categoria: "Conceptos" },
  { clave: "alcantarilladoConsumo", etiqueta: "Alcantarillado - consumo", categoria: "Conceptos" },
  { clave: "aseo", etiqueta: "Aseo", categoria: "Conceptos" },
  { clave: "ajusteEstrato", etiqueta: "Subsidio/contribución por estrato", categoria: "Conceptos" },
  { clave: "subtotal", etiqueta: "Subtotal", categoria: "Totales" },
  { clave: "total", etiqueta: "Total a pagar", categoria: "Totales" },
  { clave: "pagado", etiqueta: "Pagado", categoria: "Totales" },
  { clave: "saldo", etiqueta: "Saldo pendiente", categoria: "Totales" },
  // GLN (Global Location Number, ver lib/empresaCache.ts) ante GS1 Colombia, para el convenio de
  // recaudo — fijo, igual en TODAS las facturas (no depende de cuál factura sea). Por ahora solo
  // lleva el AI (415), a pedido explícito y mientras el convenio sigue en desarrollo (aún no
  // público) — ver GENERAR_GS1 más abajo.
  { clave: "gs1Lineal", etiqueta: "GLN GS1 (código de barras lineal)", categoria: "GS1 (recaudo)" },
  { clave: "gs1DataMatrix", etiqueta: "GLN GS1 (DataMatrix)", categoria: "GS1 (recaudo)" },
] as const;

const TIPO_CONCEPTO_POR_CAMPO: Record<string, string> = {
  cargoFijo: "cargo_fijo",
  consumoBasico: "consumo_basico",
  consumoComplementario: "consumo_complementario",
  consumoSuntuario: "consumo_suntuario",
  alcantarilladoFijo: "alcantarillado_fijo",
  alcantarilladoConsumo: "alcantarillado_consumo",
  aseo: "aseo",
};

function valorDeCampo(campo: string, factura: FacturaParaPlantilla): string {
  const tercero = factura.suscriptor.tercero;
  switch (campo) {
    case "numero":
      return String(factura.numero);
    case "periodo":
      return factura.periodo.toISOString().slice(0, 7);
    case "fechaEmision":
      return fechaLegibleColombia(factura.fechaEmision);
    case "fechaVencimiento":
      return factura.fechaVencimiento ? fechaLegibleColombia(factura.fechaVencimiento) : "";
    case "nuid":
      return factura.suscriptor.codigo;
    case "titular":
      return tercero?.nombre ?? factura.suscriptor.nombre;
    case "documento":
      return tercero?.numeroDocumento && !tercero.numeroDocumento.startsWith("PEND-")
        ? `${tercero.tipoDocumento} ${tercero.numeroDocumento}`
        : "";
    case "direccion":
      return factura.suscriptor.direccion ?? "";
    case "direccionComercial":
      return factura.suscriptor.direccionComercial ?? "";
    case "barrio":
      return factura.suscriptor.barrioCat?.nombre ?? "";
    case "ruta":
      return factura.suscriptor.ruta ?? "";
    case "estrato":
      return factura.estratoCodigo ?? "";
    case "consumoM3":
      return `${Number(factura.consumoM3)}`;
    case "consumoAlcantarilladoM3":
      return `${Number(factura.consumoAlcantarilladoM3)}`;
    case "subtotal":
      return fmtPesos(Number(factura.subtotal));
    case "total":
      return fmtPesos(Number(factura.total));
    case "ajusteEstrato":
      return fmtPesos(Number(factura.ajusteEstrato));
    case "pagado":
      return fmtPesos(factura.pagado ?? 0);
    case "saldo":
      return fmtPesos(Number(factura.total) - (factura.pagado ?? 0));
    default: {
      const tipo = TIPO_CONCEPTO_POR_CAMPO[campo];
      if (!tipo) return "";
      const suma = factura.conceptos.filter((c) => c.tipo === tipo).reduce((acc, c) => acc + Number(c.valor), 0);
      return fmtPesos(suma);
    }
  }
}

// Código de barras Code128 del número de factura, como PNG — el mismo número que escanea la
// pantalla de "Recaudo rápido" para encontrar la factura sin buscarla a mano (ver /pagos/buscar).
// Se genera en una resolución fija (queda nítido) y pdfkit lo reescala al tamaño que pida el
// marcador, así que el tamaño "real" de generación acá no importa mucho.
async function bufferCodigoBarras(numero: number): Promise<Buffer> {
  return bwipjs.toBuffer({ bcid: "code128", text: String(numero), scale: 3, height: 10, includetext: false });
}

// GLN de la entidad ante GS1 Colombia (ver lib/empresaCache.ts), para el convenio de recaudo
// bancario — FIJO, igual en todas las facturas (no depende de cuál factura sea). AI (415) = "GLN
// de quien factura/recauda". Por ahora, a pedido explícito, va SOLO este AI (el convenio sigue en
// desarrollo, todavía no es público) — cuando se sume la referencia de pago (AI 8020) hay que
// agregarla acá también.
async function contenidoGlnGs1(): Promise<string> {
  const empresa = await obtenerEmpresa();
  return `(415)${empresa.glnGs1}`;
}

async function bufferGs1Lineal(): Promise<Buffer> {
  const text = await contenidoGlnGs1();
  return bwipjs.toBuffer({ bcid: "gs1-128", text, scale: 3, height: 10, includetext: false });
}

async function bufferGs1DataMatrix(): Promise<Buffer> {
  // GS1 exige que el AI (415) venga acompañado del AI (8020) — bwip-js valida esto y por defecto
  // rechaza generarlo solo. "dontlint" salta esa validación a propósito: el usuario confirmó que
  // por ahora va solo el GLN (desarrollo/pruebas). Si el convenio pasa a producción con el banco,
  // revisar si hace falta agregar (8020) y quitar este flag.
  // "dontlint" es una opción real de bwip-js en tiempo de ejecución que sus definiciones de tipos
  // no incluyen — de ahí el "as any" puntual, no es un error de tipos genuino.
  const text = await contenidoGlnGs1();
  const opciones = { bcid: "gs1datamatrix", text, scale: 3, includetext: false, dontlint: true };
  return bwipjs.toBuffer(opciones as any);
}

// Dibuja UNA factura sobre "doc" en las coordenadas de "plantilla" — sin membrete, sin tabla, sin
// fondo: cada marcador es un simple doc.text(valor, x, y) (o una imagen, para el código de
// barras). El tamaño de página se ajusta al de la plantilla (normalmente carta, igual al papel
// pre-impreso de la imprenta).
async function pdfFacturaPlantilla(
  doc: PDFKit.PDFDocument,
  factura: FacturaParaPlantilla,
  plantilla: { marcadores: { campo: string; x: number; y: number; fontSize: number; align: string; bold: boolean; anchoCaja: number | null }[] }
) {
  for (const m of plantilla.marcadores) {
    if (m.campo === "numeroBarras" || m.campo === "gs1Lineal" || m.campo === "gs1DataMatrix") {
      try {
        // Reutiliza los mismos dos campos numéricos que un marcador de texto (fontSize, anchoCaja)
        // pero con otro sentido acá: alto y ancho de la imagen en puntos — así no hace falta una
        // columna aparte en MarcadorPlantilla solo para esto. El DataMatrix es cuadrado, así que
        // sin un ancho guardado se usa el mismo valor que el alto (no 120pt de ancho por defecto).
        const alto = m.fontSize > 9 ? m.fontSize : 30;
        const ancho = m.anchoCaja ?? (m.campo === "gs1DataMatrix" ? alto : 120);
        const buffer =
          m.campo === "numeroBarras"
            ? await bufferCodigoBarras(factura.numero)
            : m.campo === "gs1Lineal"
            ? await bufferGs1Lineal()
            : await bufferGs1DataMatrix();
        doc.image(buffer, m.x, m.y, { width: ancho, height: alto });
      } catch {
        // si por lo que sea no se pudo generar, se sigue con el resto de marcadores — mejor una
        // factura sin el código de barras que una que no se genera del todo
      }
      continue;
    }
    const valor = valorDeCampo(m.campo, factura);
    if (!valor) continue;
    doc
      .font(m.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(m.fontSize)
      .fillColor("#000000")
      .text(valor, m.x, m.y, {
        width: m.anchoCaja ?? undefined,
        align: (m.align as "left" | "center" | "right") ?? "left",
        lineBreak: false,
      });
  }
}

facturacionRouter.get("/facturas/:id/pdf", permisoVer, async (req, res) => {
  const factura = await prisma.factura.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      suscriptor: { include: { barrioCat: true, tercero: true } },
      conceptos: true,
      pagos: { select: { valor: true } },
    },
  });
  if (!factura) return res.status(404).json({ error: "No encontrada" });
  const facturaConPagado = { ...factura, pagado: factura.pagos.reduce((acc, p) => acc + Number(p.valor), 0) };

  // plantillaId: sobreimpresión sobre papel pre-impreso (ver pdfFacturaPlantilla) en vez del PDF
  // completo con membrete de siempre — se usa el tamaño de página que la plantilla tenga guardado
  // (normalmente carta, el de la hoja física de la imprenta).
  const plantillaId = req.query.plantillaId ? Number(req.query.plantillaId) : null;
  const plantilla = plantillaId
    ? await prisma.plantillaFactura.findUnique({ where: { id: plantillaId }, include: { marcadores: true } })
    : null;
  if (plantillaId && !plantilla) return res.status(404).json({ error: "Plantilla no encontrada" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="factura-${factura.numero}.pdf"`);
  const doc = plantilla
    ? new PDFDocument({ margin: 0, size: [plantilla.anchoPt, plantilla.altoPt] })
    : new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);
  if (plantilla) await pdfFacturaPlantilla(doc, facturaConPagado, plantilla);
  else pdfDeFactura(doc, facturaConPagado);
  doc.end();
});

// Lote: todas las facturas (no anuladas) de un periodo, una por página, para imprimir. Filtrable
// por barrio y/o ruta (para imprimir solo lo que un fontanero va a repartir en su recorrido) y
// siempre ordenado de ruta menor a mayor (la ruta viene con ceros a la izquierda, ej. "01-001",
// así que el orden alfabético YA coincide con el numérico) y dentro de la misma ruta, por número
// de factura.
facturacionRouter.get("/pdf-lote", permisoVer, async (req, res) => {
  const { periodo, barrioId, ruta } = req.query;
  if (!periodo) return res.status(400).json({ error: "periodo (YYYY-MM) es requerido" });
  const facturas = await prisma.factura.findMany({
    where: {
      periodo: primerDiaMes(String(periodo)),
      estado: { not: "anulada" },
      suscriptor: {
        ...(barrioId ? { barrioId: Number(barrioId) } : {}),
        ...(ruta ? { ruta: { contains: String(ruta), mode: "insensitive" as const } } : {}),
      },
    },
    include: { suscriptor: { include: { barrioCat: true, tercero: true } }, conceptos: true },
    orderBy: [{ suscriptor: { ruta: "asc" } }, { numero: "asc" }],
  });
  if (facturas.length === 0) return res.status(404).json({ error: "No hay facturas para esos filtros" });

  const plantillaId = req.query.plantillaId ? Number(req.query.plantillaId) : null;
  const plantilla = plantillaId
    ? await prisma.plantillaFactura.findUnique({ where: { id: plantillaId }, include: { marcadores: true } })
    : null;
  if (plantillaId && !plantilla) return res.status(404).json({ error: "Plantilla no encontrada" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="facturas_${periodo}.pdf"`);
  const doc = plantilla
    ? new PDFDocument({ margin: 0, size: [plantilla.anchoPt, plantilla.altoPt] })
    : new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);
  for (let i = 0; i < facturas.length; i++) {
    if (i > 0) doc.addPage();
    if (plantilla) await pdfFacturaPlantilla(doc, facturas[i], plantilla);
    else pdfDeFactura(doc, facturas[i]);
  }
  doc.end();
});

// ===================== CRUD de plantillas (editor visual) =====================

// Antes que "/plantillas/:id" a propósito: si no, Express toma "campos" como si fuera un :id.
facturacionRouter.get("/plantillas/campos", permisoVer, (_req, res) => {
  res.json(CAMPOS_DISPONIBLES);
});

facturacionRouter.get("/plantillas", permisoVer, async (_req, res) => {
  const plantillas = await prisma.plantillaFactura.findMany({
    include: { _count: { select: { marcadores: true } } },
    orderBy: { nombre: "asc" },
  });
  res.json(plantillas.map((p) => ({ ...p, marcadores: p._count.marcadores, _count: undefined })));
});

facturacionRouter.get("/plantillas/:id", permisoVer, async (req, res) => {
  const plantilla = await prisma.plantillaFactura.findUnique({
    where: { id: Number(req.params.id) },
    include: { marcadores: true },
  });
  if (!plantilla) return res.status(404).json({ error: "No encontrada" });
  res.json(plantilla);
});

facturacionRouter.post("/plantillas", permisoAvanzado, async (req, res) => {
  const { nombre, anchoPt, altoPt } = req.body;
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: "El nombre es requerido" });
  const plantilla = await prisma.plantillaFactura.create({
    data: {
      nombre: String(nombre).trim(),
      anchoPt: anchoPt ? Number(anchoPt) : undefined,
      altoPt: altoPt ? Number(altoPt) : undefined,
    },
    include: { marcadores: true },
  });
  res.status(201).json(plantilla);
});

facturacionRouter.put("/plantillas/:id", permisoAvanzado, async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, anchoPt, altoPt } = req.body;
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: "El nombre es requerido" });
  const existente = await prisma.plantillaFactura.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: "No encontrada" });
  const plantilla = await prisma.plantillaFactura.update({
    where: { id },
    data: { nombre: String(nombre).trim(), anchoPt: Number(anchoPt), altoPt: Number(altoPt) },
    include: { marcadores: true },
  });
  res.json(plantilla);
});

facturacionRouter.delete("/plantillas/:id", permisoAvanzado, async (req, res) => {
  const id = Number(req.params.id);
  const existente = await prisma.plantillaFactura.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: "No encontrada" });
  if (existente.imagenGuiaUrl) await borrarArchivo(existente.imagenGuiaUrl);
  await prisma.plantillaFactura.delete({ where: { id } });
  res.status(204).end();
});

// Reemplaza TODOS los marcadores de la plantilla de una sola vez — el editor manda el arreglo
// completo cada vez que se guarda (agregar/mover/borrar un marcador, todo desde el mismo lienzo),
// así que no hace falta un endpoint separado por cada operación puntual.
facturacionRouter.put("/plantillas/:id/marcadores", permisoAvanzado, async (req, res) => {
  const plantillaId = Number(req.params.id);
  const existente = await prisma.plantillaFactura.findUnique({ where: { id: plantillaId } });
  if (!existente) return res.status(404).json({ error: "No encontrada" });

  const marcadores = req.body.marcadores as {
    campo: string;
    x: number;
    y: number;
    fontSize?: number;
    align?: string;
    bold?: boolean;
    anchoCaja?: number | null;
  }[];
  if (!Array.isArray(marcadores)) return res.status(400).json({ error: "marcadores debe ser un arreglo" });
  const clavesValidas = new Set<string>(CAMPOS_DISPONIBLES.map((c) => c.clave));
  for (const m of marcadores) {
    if (!clavesValidas.has(m.campo)) return res.status(400).json({ error: `Campo desconocido: ${m.campo}` });
  }

  await prisma.$transaction([
    prisma.marcadorPlantilla.deleteMany({ where: { plantillaId } }),
    prisma.marcadorPlantilla.createMany({
      data: marcadores.map((m) => ({
        plantillaId,
        campo: m.campo,
        x: m.x,
        y: m.y,
        fontSize: m.fontSize ?? 9,
        align: m.align ?? "left",
        bold: m.bold ?? false,
        anchoCaja: m.anchoCaja ?? null,
      })),
    }),
  ]);
  const plantillaActualizada = await prisma.plantillaFactura.findUnique({
    where: { id: plantillaId },
    include: { marcadores: true },
  });
  res.json(plantillaActualizada);
});

facturacionRouter.post(
  "/plantillas/:id/imagen-guia",
  permisoAvanzado,
  uploadImagenGuia.single("imagen"),
  async (req, res) => {
    const id = Number(req.params.id);
    const existente = await prisma.plantillaFactura.findUnique({ where: { id } });
    if (!existente) return res.status(404).json({ error: "No encontrada" });
    if (!req.file) return res.status(400).json({ error: "La imagen es requerida" });

    if (existente.imagenGuiaUrl) await borrarArchivo(existente.imagenGuiaUrl);
    const url = await guardarArchivo("plantillas-factura", req.file.buffer, req.file.originalname, req.file.mimetype);
    const plantilla = await prisma.plantillaFactura.update({
      where: { id },
      data: { imagenGuiaUrl: url },
      include: { marcadores: true },
    });
    res.json(plantilla);
  }
);

facturacionRouter.delete("/plantillas/:id/imagen-guia", permisoAvanzado, async (req, res) => {
  const id = Number(req.params.id);
  const existente = await prisma.plantillaFactura.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: "No encontrada" });
  if (existente.imagenGuiaUrl) await borrarArchivo(existente.imagenGuiaUrl);
  const plantilla = await prisma.plantillaFactura.update({
    where: { id },
    data: { imagenGuiaUrl: null },
    include: { marcadores: true },
  });
  res.json(plantilla);
});
