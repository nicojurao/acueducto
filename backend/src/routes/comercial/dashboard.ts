import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { ESTADOS_FACTURACION as ESTADOS_FACTURACION_CLAVES } from "../../lib/snapshotPeriodo.js";
import { primerDiaMes, periodoFacturableActual } from "../../lib/periodo.js";
import { totalConsumo } from "../../lib/consumoAgregado.js";

export const dashboardRouter = Router();

// "Suscriptores activos", "Medidores activos" y el desglose por estado de facturación dependen
// del estado ACTUAL del suscriptor/medidor (no de un campo fechado como Lectura.periodo), así
// que para un periodo YA CERRADO se usa la foto que se tomó el día 19 de ese mes (ver
// lib/snapshotPeriodo.ts) en vez de recalcular con el estado de hoy — si no, el dashboard de un
// mes viejo iría cambiando cada vez que alguien edita un suscriptor actual. Para el periodo
// vigente (el que todavía no cerró) o para un periodo viejo que por algún motivo no tiene foto
// (ej. de antes de que existiera este mecanismo), se calcula en vivo con el estado de hoy —
// "historico: false" le avisa al frontend que ese número es una aproximación, no un dato exacto
// de ese mes.
async function obtenerEstadoSuscriptores(periodo: string) {
  const snapshot = await prisma.snapshotPeriodo.findUnique({ where: { periodo } });
  if (snapshot) {
    return {
      historico: true,
      suscriptoresActivos: snapshot.suscriptoresActivos,
      medidoresActivos: snapshot.medidoresActivos,
      sinMedidor: snapshot.sinMedidor,
      instaladoPrueba: snapshot.instaladoPrueba,
      facturando: snapshot.facturando,
      inactivo: snapshot.inactivo,
    };
  }

  const [suscriptoresActivos, medidoresActivos, grupos] = await Promise.all([
    prisma.suscriptor.count({ where: { estadoPredio: "activo" } }),
    prisma.medidor.count({ where: { activo: true, estado: "instalado" } }),
    prisma.suscriptor.groupBy({
      by: ["estadoFacturacion"],
      where: { estadoPredio: "activo" },
      _count: { _all: true },
    }),
  ]);
  const cantidades = new Map(grupos.map((g) => [g.estadoFacturacion, g._count._all]));

  return {
    historico: false,
    suscriptoresActivos,
    medidoresActivos,
    sinMedidor: cantidades.get("sin_medidor") ?? 0,
    instaladoPrueba: cantidades.get("instalado_prueba") ?? 0,
    facturando: cantidades.get("facturando") ?? 0,
    inactivo: cantidades.get("inactivo") ?? 0,
  };
}

function mesAnterior(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() - 1, 1));
}

function mismoMesAnioAnterior(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear() - 1, fecha.getUTCMonth(), 1));
}

async function sumaConsumoPeriodo(fecha: Date): Promise<{ consumo: number; usuarios: number }> {
  const lecturas = await prisma.lectura.findMany({ where: { periodo: fecha } });
  return totalConsumo(lecturas);
}

// hayDatosAnterior distingue "no hay lecturas ese mes" (null, no se puede comparar) de
// "hay lecturas pero el consumo total dio exactamente 0" (antes se confundían, porque
// `anterior === 0` también es falsy y devolvía null aunque sí hubiera datos reales).
function variacionPct(actual: number, anterior: number, hayDatosAnterior: boolean): number | null {
  if (!hayDatosAnterior || !anterior) return null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}

dashboardRouter.get("/kpis", async (req, res) => {
  const periodo = String(req.query.periodo ?? periodoFacturableActual());
  const fecha = primerDiaMes(periodo);

  // "Suscriptores activos" es sobre el PREDIO (estadoPredio), no sobre si ya tienen medidor —
  // un predio activo sin medidor asignado todavía sigue siendo un suscriptor activo. Antes esto
  // contaba "suscriptores con medidor activo", que en la práctica daba el mismo número que
  // "medidores activos" (redundante, y no era lo que decía la etiqueta).
  //
  // "pendientes" tiene que usar EXACTAMENTE el mismo criterio que la pantalla de Captura de
  // Lecturas (ver GET /api/lecturas): solo medidores con suscriptor asignado y ya instalados
  // para este periodo. Antes contaba TODOS los medidores activos (incluía medidores sin
  // suscriptor y medidores instalados después del periodo que se está viendo), lo que inflaba
  // el número acá por encima de lo que realmente aparece como pendiente en esa pantalla.
  // La captura de lecturas arranca el día 20 de cada mes: un medidor instalado el 21 o después
  // ya no alcanza a tener lectura ese mes y pasa derecho al periodo siguiente.
  const corteInstalacion = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 21));
  const wherePendientes = {
    activo: true,
    suscriptorId: { not: null },
    OR: [{ fechaInstalacion: null }, { fechaInstalacion: { lt: corteInstalacion } }],
    lecturas: { none: { periodo: fecha } },
    // Un suscriptor "inactivo" (medidor dañado) tampoco cuenta como pendiente aquí.
    suscriptor: { estadoFacturacion: { not: "inactivo" as const } },
  };

  const [estado, actual, anterior, anioAnterior, lecturasPendientes] = await Promise.all([
    obtenerEstadoSuscriptores(periodo),
    sumaConsumoPeriodo(fecha),
    sumaConsumoPeriodo(mesAnterior(fecha)),
    sumaConsumoPeriodo(mismoMesAnioAnterior(fecha)),
    prisma.medidor.count({ where: wherePendientes }),
  ]);
  const promedioPorUsuario = actual.usuarios > 0 ? actual.consumo / actual.usuarios : 0;
  const promedioMesAnterior = anterior.usuarios > 0 ? anterior.consumo / anterior.usuarios : 0;

  res.json({
    periodo,
    suscriptoresActivos: estado.suscriptoresActivos,
    medidoresActivos: estado.medidoresActivos,
    facturadosPorMedicion: estado.facturando,
    historico: estado.historico,
    consumoMesActual: actual.consumo,
    promedioPorUsuario,
    promedioMesAnterior,
    lecturasPendientes: Math.max(lecturasPendientes, 0),
    variacionMesAnterior: variacionPct(actual.consumo, anterior.consumo, anterior.usuarios > 0),
    variacionAnioAnterior: variacionPct(actual.consumo, anioAnterior.consumo, anioAnterior.usuarios > 0),
  });
});

dashboardRouter.get("/atipicos", async (req, res) => {
  const periodo = String(req.query.periodo ?? periodoFacturableActual());
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
  const periodo = String(req.query.periodo ?? periodoFacturableActual());
  const limit = Number(req.query.limit ?? 10);
  const { barrio, estrato } = req.query;
  const fecha = primerDiaMes(periodo);

  const lecturas = await prisma.lectura.findMany({
    where: {
      periodo: fecha,
      medidor: {
        suscriptorId: { not: null },
        suscriptor: {
          barrioId: barrio ? Number(barrio) : undefined,
          estratoId: estrato ? Number(estrato) : undefined,
        },
      },
    },
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
  // Cuenta con groupBy en vez de traer los ~280 medidores completos (con su relación de
  // diámetro) solo para contarlos en JS uno por uno.
  const [porTipoRaw, porDiametroRaw, diametros] = await Promise.all([
    prisma.medidor.groupBy({ by: ["tipo"], where: { activo: true }, _count: { _all: true } }),
    prisma.medidor.groupBy({ by: ["diametroId"], where: { activo: true }, _count: { _all: true } }),
    prisma.diametroMedidor.findMany(),
  ]);
  const valorDiametro = new Map(diametros.map((d) => [d.id, d.valor]));

  res.json({
    porTipo: porTipoRaw.map((g) => ({ tipo: g.tipo?.trim() || "Sin especificar", cantidad: g._count._all })),
    porDiametro: porDiametroRaw.map((g) => ({
      diametro: (g.diametroId != null ? valorDiametro.get(g.diametroId)?.trim() : null) || "Sin especificar",
      cantidad: g._count._all,
    })),
  });
});

dashboardRouter.get("/tendencia-multianio", async (_req, res) => {
  // Suma por año/mes en el propio Postgres (GROUP BY) en vez de traer CADA lectura completa a
  // Node para sumarlas ahí: con años de histórico esto evitaba transferir decenas de miles de
  // filas (con fotoUrl, observaciones, etc. que ni se usan acá) solo para un total mensual.
  const filas = await prisma.$queryRaw<{ anio: number; mes: number; consumo: number }[]>`
    SELECT EXTRACT(YEAR FROM periodo)::int AS anio, EXTRACT(MONTH FROM periodo)::int AS mes, SUM(consumo)::float8 AS consumo
    FROM "Lectura"
    GROUP BY 1, 2
  `;

  const porAnioMes = new Map<number, Map<number, number>>();
  for (const f of filas) {
    if (!porAnioMes.has(f.anio)) porAnioMes.set(f.anio, new Map());
    porAnioMes.get(f.anio)!.set(f.mes, f.consumo);
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

// Distribución de suscriptores por estado de facturación (sin_medidor, instalado_prueba,
// facturando, inactivo) — para el gráfico de cobertura de medición en el dashboard. Siempre
// incluye los 4 estados, incluso con cantidad 0, para que no desaparezcan de la UI. Usa la foto
// del periodo (ver obtenerEstadoSuscriptores) para que un mes ya cerrado no cambie con el estado
// de hoy; sin ?periodo, se asume el periodo facturable vigente (en vivo).
dashboardRouter.get("/estados-facturacion", async (req, res) => {
  const periodo = String(req.query.periodo ?? periodoFacturableActual());
  const estado = await obtenerEstadoSuscriptores(periodo);
  const cantidades: Record<string, number> = {
    sin_medidor: estado.sinMedidor,
    instalado_prueba: estado.instaladoPrueba,
    facturando: estado.facturando,
    inactivo: estado.inactivo,
  };
  res.json({
    historico: estado.historico,
    estados: ESTADOS_FACTURACION_CLAVES.map((clave) => ({ estado: clave, cantidad: cantidades[clave] ?? 0 })),
  });
});
