import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const dashboardRouter = Router();

// Las lecturas del mes no empiezan a capturarse hasta el día 20 (mismo criterio que
// mesFacturableActual() en reportes.ts y el periodo por defecto de ReportesPage.tsx). Antes de
// esa fecha, el mes calendario en curso todavía no es el periodo facturable: KPIs, atípicos y
// pendientes deben seguir mostrando el mes anterior.
function periodoActualStr(): string {
  const now = new Date();
  let anio = now.getFullYear();
  let mes = now.getDate() < 20 ? now.getMonth() : now.getMonth() + 1;
  if (mes === 0) {
    mes = 12;
    anio -= 1;
  }
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

function primerDiaMes(periodo: string): Date {
  const [y, m] = periodo.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

function mesAnterior(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() - 1, 1));
}

function mismoMesAnioAnterior(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear() - 1, fecha.getUTCMonth(), 1));
}

async function sumaConsumoPeriodo(fecha: Date): Promise<{ consumo: number; usuarios: number }> {
  const lecturas = await prisma.lectura.findMany({ where: { periodo: fecha } });
  return {
    consumo: lecturas.reduce((acc, l) => acc + Number(l.consumo), 0),
    usuarios: lecturas.length,
  };
}

function variacionPct(actual: number, anterior: number): number | null {
  if (!anterior) return null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}

dashboardRouter.get("/kpis", async (req, res) => {
  const periodo = String(req.query.periodo ?? periodoActualStr());
  const fecha = primerDiaMes(periodo);

  const [suscriptoresActivos, medidoresActivos, actual, anterior, anioAnterior] = await Promise.all([
    prisma.suscriptor.count({ where: { medidores: { some: { activo: true } } } }),
    prisma.medidor.count({ where: { activo: true } }),
    sumaConsumoPeriodo(fecha),
    sumaConsumoPeriodo(mesAnterior(fecha)),
    sumaConsumoPeriodo(mismoMesAnioAnterior(fecha)),
  ]);

  const lecturasPendientes = medidoresActivos - actual.usuarios;
  const promedioPorUsuario = actual.usuarios > 0 ? actual.consumo / actual.usuarios : 0;

  res.json({
    periodo,
    suscriptoresActivos,
    medidoresActivos,
    consumoMesActual: actual.consumo,
    promedioPorUsuario,
    lecturasPendientes: Math.max(lecturasPendientes, 0),
    variacionMesAnterior: variacionPct(actual.consumo, anterior.consumo),
    variacionAnioAnterior: variacionPct(actual.consumo, anioAnterior.consumo),
  });
});

dashboardRouter.get("/atipicos", async (req, res) => {
  const periodo = String(req.query.periodo ?? periodoActualStr());
  const fecha = primerDiaMes(periodo);
  const desdeHistorico = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() - 6, 1));

  const [lecturasActuales, historicasTodas] = await Promise.all([
    prisma.lectura.findMany({
      where: { periodo: fecha, medidor: { suscriptorId: { not: null } } },
      include: { medidor: { include: { suscriptor: true } } },
    }),
    // Una sola consulta con todo el histórico de 6 meses, agrupado luego en memoria por
    // medidorId, en vez de una consulta por cada lectura actual (N+1).
    prisma.lectura.findMany({
      where: { periodo: { gte: desdeHistorico, lt: fecha } },
      select: { medidorId: true, consumo: true },
    }),
  ]);

  const historicasPorMedidor = new Map<number, number[]>();
  for (const h of historicasTodas) {
    const lista = historicasPorMedidor.get(h.medidorId) ?? [];
    lista.push(Number(h.consumo));
    historicasPorMedidor.set(h.medidorId, lista);
  }

  const resultado: {
    medidorId: number;
    suscriptorId: number;
    codigo: string;
    nombre: string;
    consumoActual: number;
    promedioHistorico: number;
    desviacionPct: number;
  }[] = [];

  for (const l of lecturasActuales) {
    const historicas = historicasPorMedidor.get(l.medidorId) ?? [];
    if (historicas.length < 2) continue;

    const promedio = historicas.reduce((acc, c) => acc + c, 0) / historicas.length;
    if (promedio <= 0) continue;

    const consumoActual = Number(l.consumo);
    // Atípico = consumió el doble (o más) de su propio promedio histórico.
    if (consumoActual < promedio * 2) continue;
    const desviacion = (consumoActual - promedio) / promedio;

    resultado.push({
      medidorId: l.medidorId,
      suscriptorId: l.medidor.suscriptor!.id,
      codigo: l.medidor.suscriptor!.codigo,
      nombre: l.medidor.suscriptor!.nombre,
      consumoActual,
      promedioHistorico: Math.round(promedio * 100) / 100,
      desviacionPct: Math.round(desviacion * 10000) / 100,
    });
  }

  resultado.sort((a, b) => b.desviacionPct - a.desviacionPct);
  res.json(resultado);
});

dashboardRouter.get("/top-consumidores", async (req, res) => {
  const periodo = String(req.query.periodo ?? periodoActualStr());
  const limit = Number(req.query.limit ?? 10);
  const fecha = primerDiaMes(periodo);

  const lecturas = await prisma.lectura.findMany({
    where: { periodo: fecha, medidor: { suscriptorId: { not: null } } },
    include: { medidor: { include: { suscriptor: true } } },
    orderBy: { consumo: "desc" },
    take: limit,
  });

  res.json(
    lecturas.map((l) => ({
      codigo: l.medidor.suscriptor!.codigo,
      nombre: l.medidor.suscriptor!.nombre,
      consumo: Number(l.consumo),
    }))
  );
});

dashboardRouter.get("/distribucion-medidores", async (_req, res) => {
  const medidores = await prisma.medidor.findMany({ where: { activo: true }, include: { diametroCat: true } });

  const porTipo = new Map<string, number>();
  const porDiametro = new Map<string, number>();
  for (const m of medidores) {
    const tipo = m.tipo?.trim() || "Sin especificar";
    const diametro = m.diametroCat?.valor?.trim() || "Sin especificar";
    porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);
    porDiametro.set(diametro, (porDiametro.get(diametro) ?? 0) + 1);
  }

  res.json({
    porTipo: Array.from(porTipo.entries()).map(([tipo, cantidad]) => ({ tipo, cantidad })),
    porDiametro: Array.from(porDiametro.entries()).map(([diametro, cantidad]) => ({ diametro, cantidad })),
  });
});

dashboardRouter.get("/tendencia-multianio", async (_req, res) => {
  const lecturas = await prisma.lectura.findMany();

  const porAnioMes = new Map<number, Map<number, number>>();
  for (const l of lecturas) {
    const anio = l.periodo.getUTCFullYear();
    const mes = l.periodo.getUTCMonth() + 1;
    if (!porAnioMes.has(anio)) porAnioMes.set(anio, new Map());
    const meses = porAnioMes.get(anio)!;
    meses.set(mes, (meses.get(mes) ?? 0) + Number(l.consumo));
  }

  const anios = Array.from(porAnioMes.keys()).sort();
  const serie = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const fila: Record<string, number> = { mes };
    for (const anio of anios) {
      fila[String(anio)] = porAnioMes.get(anio)?.get(mes) ?? 0;
    }
    return fila;
  });

  res.json({ anios, serie });
});

const ESTADOS_FACTURACION = ["sin_medidor", "instalado_prueba", "facturando", "inactivo"];

// Distribución de suscriptores por estado de facturación (sin_medidor, instalado_prueba,
// facturando, inactivo) — para el gráfico de cobertura de medición en el dashboard.
// Siempre incluye los 4 estados, incluso con cantidad 0, para que no desaparezcan de la UI.
// Solo cuenta predios activos: uno inactivo (lote baldío, demolido) no debería contar como
// "sin medidor" y arrastrar la cobertura hacia abajo.
dashboardRouter.get("/estados-facturacion", async (_req, res) => {
  const grupos = await prisma.suscriptor.groupBy({
    by: ["estadoFacturacion"],
    where: { estadoPredio: "activo" },
    _count: { _all: true },
  });
  const cantidades = new Map(grupos.map((g) => [g.estadoFacturacion, g._count._all]));
  res.json(ESTADOS_FACTURACION.map((estado) => ({ estado, cantidad: cantidades.get(estado) ?? 0 })));
});
