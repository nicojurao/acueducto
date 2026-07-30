import { Router } from "express";
import PDFDocument from "pdfkit";
import { prisma } from "../../lib/prisma.js";
import { requirePermiso } from "../../middleware/auth.js";
import { primerDiaMes, periodoFacturableActual } from "../../lib/periodo.js";
import { repartirEntero } from "../../lib/cotitularSplit.js";
import { liquidarFactura, TarifaCalculo } from "../../lib/facturacionCalculo.js";
import { encabezadoPdf, tarjetaDatosPdf, tituloSeccionPdf, tablaPdf } from "../../lib/pdfBranding.js";
import { fechaLegibleColombia } from "../../lib/fechaColombia.js";
import { periodoEstaCerrado, MENSAJE_PERIODO_CERRADO } from "../../lib/periodoFacturacion.js";
import { calcularMora } from "../../lib/moraCalculo.js";
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
      const ultimo = await prisma.factura.aggregate({ _max: { numero: true } });
      let numero = (ultimo._max.numero ?? 0) + 1;
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
            await tx.factura.create({
              data: {
                numero: numero++,
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
                total: liq.total,
                fechaVencimiento,
                conceptos: { create: liq.conceptos },
              },
            });
            totalFacturado += liq.total;
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

  const [, , , eliminadas] = await prisma.$transaction([
    prisma.facturaConcepto.deleteMany({ where: { factura: { periodo: fechaPeriodo } } }),
    prisma.periodoFacturacion.deleteMany({ where: { periodo: fechaPeriodo } }),
    prisma.facturacionOmitida.deleteMany({ where: { periodo: fechaPeriodo } }),
    prisma.factura.deleteMany({ where: { periodo: fechaPeriodo } }),
  ]);

  req.log?.warn(
    { periodo: req.params.periodo, eliminadas: eliminadas.count, usuario: req.usuario?.id },
    "Facturación de periodo ELIMINADA en bloque"
  );
  res.json({ eliminadas: eliminadas.count });
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
facturacionRouter.put("/facturas/:id/anular", permisoAvanzado, async (req, res) => {
  const id = Number(req.params.id);
  const factura = await prisma.factura.findUnique({ where: { id }, include: { pagos: true } });
  if (!factura) return res.status(404).json({ error: "No encontrada" });
  if (await periodoEstaCerrado(factura.periodo)) return res.status(400).json({ error: MENSAJE_PERIODO_CERRADO });
  if (factura.pagos.length > 0) return res.status(400).json({ error: "No se puede anular: ya tiene pagos registrados" });
  const actualizada = await prisma.factura.update({
    where: { id },
    data: { estado: "anulada", observaciones: req.body.motivo ? `ANULADA: ${req.body.motivo}` : "ANULADA" },
  });
  res.json(actualizada);
});

// Concepto manual (reconexión, matrícula, mora, descuento — valor negativo permitido).
facturacionRouter.post("/facturas/:id/conceptos", permisoAvanzado, async (req, res) => {
  const id = Number(req.params.id);
  const { descripcion, valor } = req.body;
  if (!descripcion || valor == null || Number(valor) === 0) {
    return res.status(400).json({ error: "descripcion y valor (distinto de 0) son requeridos" });
  }
  const factura = await prisma.factura.findUnique({ where: { id } });
  if (!factura) return res.status(404).json({ error: "No encontrada" });
  if (factura.estado === "anulada") return res.status(400).json({ error: "La factura está anulada" });
  if (await periodoEstaCerrado(factura.periodo)) return res.status(400).json({ error: MENSAJE_PERIODO_CERRADO });
  const [, actualizada] = await prisma.$transaction([
    prisma.facturaConcepto.create({
      data: { facturaId: id, tipo: "manual", descripcion: String(descripcion), valor: Math.round(Number(valor)) },
    }),
    prisma.factura.update({
      where: { id },
      data: {
        subtotal: { increment: Math.round(Number(valor)) },
        total: { increment: Math.round(Number(valor)) },
        // Si estaba "pagada" y se le agrega un cobro nuevo, vuelve a pendiente.
        estado: Number(valor) > 0 && factura.estado === "pagada" ? "pendiente" : undefined,
      },
    }),
  ]);
  res.status(201).json(actualizada);
});

facturacionRouter.delete("/facturas/:id/conceptos/:conceptoId", permisoAvanzado, async (req, res) => {
  const concepto = await prisma.facturaConcepto.findUnique({
    where: { id: Number(req.params.conceptoId) },
    include: { factura: { select: { periodo: true } } },
  });
  if (!concepto || concepto.facturaId !== Number(req.params.id)) return res.status(404).json({ error: "No encontrado" });
  if (concepto.tipo !== "manual") return res.status(400).json({ error: "Solo se pueden eliminar conceptos manuales" });
  if (await periodoEstaCerrado(concepto.factura.periodo)) return res.status(400).json({ error: MENSAJE_PERIODO_CERRADO });
  await prisma.$transaction([
    prisma.facturaConcepto.delete({ where: { id: concepto.id } }),
    prisma.factura.update({
      where: { id: concepto.facturaId },
      data: { subtotal: { decrement: Number(concepto.valor) }, total: { decrement: Number(concepto.valor) } },
    }),
  ]);
  res.status(204).end();
});

// ============================== PAGOS ==============================

facturacionRouter.post("/pagos", permisoPagos, async (req, res) => {
  const { facturaId, valor, medio, observaciones } = req.body;
  if (!facturaId || !valor || Number(valor) <= 0) {
    return res.status(400).json({ error: "facturaId y valor (> 0) son requeridos" });
  }
  const factura = await prisma.factura.findUnique({ where: { id: Number(facturaId) }, include: { pagos: true } });
  if (!factura) return res.status(404).json({ error: "Factura no encontrada" });
  if (factura.estado === "anulada") return res.status(400).json({ error: "La factura está anulada" });
  const pagado = factura.pagos.reduce((acc, p) => acc + Number(p.valor), 0);
  const saldo = Number(factura.total) - pagado;
  if (Number(valor) > saldo) {
    return res.status(400).json({ error: `El valor supera el saldo pendiente (${fmtPesos(saldo)})` });
  }
  const nuevoSaldo = saldo - Math.round(Number(valor));
  const [pago] = await prisma.$transaction([
    prisma.pago.create({
      data: {
        facturaId: factura.id,
        valor: Math.round(Number(valor)),
        medio: medio === "consignacion" || medio === "otro" ? medio : "efectivo",
        observaciones: observaciones || null,
        registradoPorId: req.usuario?.id ?? null,
      },
      include: { registradoPor: { select: { nombre: true } } },
    }),
    prisma.factura.update({ where: { id: factura.id }, data: { estado: nuevoSaldo <= 0 ? "pagada" : "pendiente" } }),
  ]);
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

// Deshacer un pago mal registrado. Recalcula el saldo con los pagos QUE QUEDAN (no asume que
// borrar el único pago existente): si la factura tenía dos abonos y se borra uno, puede seguir
// "pagada" con el otro; si queda con saldo, vuelve a "pendiente". Una factura anulada no se
// reabre por esto — anular ya es la vía para dejarla sin efecto.
facturacionRouter.delete("/pagos/:id", permisoAvanzado, async (req, res) => {
  const pago = await prisma.pago.findUnique({
    where: { id: Number(req.params.id) },
    include: { factura: { include: { pagos: true } } },
  });
  if (!pago) return res.status(404).json({ error: "No encontrado" });
  const pagadoRestante = pago.factura.pagos
    .filter((p) => p.id !== pago.id)
    .reduce((acc, p) => acc + Number(p.valor), 0);
  const saldoRestante = Number(pago.factura.total) - pagadoRestante;
  await prisma.$transaction([
    prisma.pago.delete({ where: { id: pago.id } }),
    ...(pago.factura.estado === "anulada"
      ? []
      : [
          prisma.factura.update({
            where: { id: pago.facturaId },
            data: { estado: saldoRestante <= 0 ? "pagada" : "pendiente" },
          }),
        ]),
  ]);
  req.log?.info({ pagoId: pago.id, facturaId: pago.facturaId, usuario: req.usuario?.id }, "Pago eliminado");
  res.status(204).end();
});

// ============================== CARTERA ==============================

// Resumen de cartera: saldo total pendiente, por edades (según fechaEmision) y por barrio.
facturacionRouter.get("/cartera/resumen", permisoVer, async (_req, res) => {
  const facturas = await prisma.factura.findMany({
    where: { estado: "pendiente" },
    include: { pagos: { select: { valor: true } }, suscriptor: { include: { barrioCat: true } } },
  });
  const ahora = Date.now();
  let total = 0;
  const edades = { d0_30: 0, d31_60: 0, d61_90: 0, d90mas: 0 };
  const porBarrio = new Map<string, number>();
  let facturasConSaldo = 0;
  for (const f of facturas) {
    const saldo = Number(f.total) - f.pagos.reduce((acc, p) => acc + Number(p.valor), 0);
    if (saldo <= 0) continue;
    facturasConSaldo++;
    total += saldo;
    const dias = (ahora - f.fechaEmision.getTime()) / (24 * 60 * 60 * 1000);
    if (dias <= 30) edades.d0_30 += saldo;
    else if (dias <= 60) edades.d31_60 += saldo;
    else if (dias <= 90) edades.d61_90 += saldo;
    else edades.d90mas += saldo;
    const barrio = f.suscriptor.barrioCat?.nombre ?? "Sin barrio";
    porBarrio.set(barrio, (porBarrio.get(barrio) ?? 0) + saldo);
  }
  res.json({
    total,
    facturas: facturasConSaldo,
    edades,
    porBarrio: Array.from(porBarrio.entries())
      .map(([barrio, saldo]) => ({ barrio, saldo }))
      .sort((a, b) => b.saldo - a.saldo),
  });
});

// Cartera por suscriptor: quiénes deben, cuánto y hace cuántos periodos.
facturacionRouter.get("/cartera", permisoVer, async (req, res) => {
  const { q, page, limit } = req.query;
  const facturas = await prisma.factura.findMany({
    where: {
      estado: "pendiente",
      ...(q
        ? {
            suscriptor: {
              OR: [
                { nombre: { contains: String(q).trim(), mode: "insensitive" as const } },
                { codigo: { contains: String(q).trim(), mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    },
    include: { pagos: { select: { valor: true } }, suscriptor: { include: { barrioCat: true } } },
  });
  const porSuscriptor = new Map<number, { suscriptor: (typeof facturas)[number]["suscriptor"]; saldo: number; facturas: number; masAntigua: Date }>();
  for (const f of facturas) {
    const saldo = Number(f.total) - f.pagos.reduce((acc, p) => acc + Number(p.valor), 0);
    if (saldo <= 0) continue;
    const acc = porSuscriptor.get(f.suscriptorId) ?? { suscriptor: f.suscriptor, saldo: 0, facturas: 0, masAntigua: f.periodo };
    acc.saldo += saldo;
    acc.facturas += 1;
    if (f.periodo < acc.masAntigua) acc.masAntigua = f.periodo;
    porSuscriptor.set(f.suscriptorId, acc);
  }
  const todos = Array.from(porSuscriptor.values()).sort((a, b) => b.saldo - a.saldo);
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);
  res.json({
    data: todos.slice((pageNum - 1) * limitNum, pageNum * limitNum).map((t) => ({
      suscriptorId: t.suscriptor.id,
      codigo: t.suscriptor.codigo,
      nombre: t.suscriptor.nombre,
      barrio: t.suscriptor.barrioCat?.nombre ?? null,
      saldo: t.saldo,
      facturasPendientes: t.facturas,
      periodoMasAntiguo: t.masAntigua.toISOString().slice(0, 7),
    })),
    total: todos.length,
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
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="factura-${factura.numero}.pdf"`);
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);
  pdfDeFactura(doc, { ...factura, pagado: factura.pagos.reduce((acc, p) => acc + Number(p.valor), 0) });
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

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="facturas_${periodo}.pdf"`);
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);
  facturas.forEach((f, i) => {
    if (i > 0) doc.addPage();
    pdfDeFactura(doc, f);
  });
  doc.end();
});
