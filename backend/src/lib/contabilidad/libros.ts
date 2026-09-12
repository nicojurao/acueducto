import { prisma } from "../prisma.js";

export interface SaldoCuenta {
  cuentaId: number;
  codigo: string;
  nombre: string;
  naturaleza: "debito" | "credito";
  nivel: number;
  debito: number;
  credito: number;
  saldo: number;
}

// Saldo por cuenta en un rango de fechas: se agrupa directamente sobre MovimientoContable (nunca
// se postea contra una cuenta padre/grupo — todos los hooks de comprobantes.ts usan códigos hoja),
// así que no hay riesgo de contar doble sumando clase+grupo+cuenta a la vez.
async function saldosPorCuenta(desde: Date | null, hasta: Date | null): Promise<SaldoCuenta[]> {
  const filtroFecha: { gte?: Date; lte?: Date } = {};
  if (desde) filtroFecha.gte = desde;
  if (hasta) filtroFecha.lte = hasta;

  const grupos = await prisma.movimientoContable.groupBy({
    by: ["cuentaPucId"],
    _sum: { debito: true, credito: true },
    where: {
      comprobante: {
        estado: "contabilizado",
        ...(desde || hasta ? { fecha: filtroFecha } : {}),
      },
    },
  });
  if (grupos.length === 0) return [];

  const cuentas = await prisma.cuentaPuc.findMany({ where: { id: { in: grupos.map((g) => g.cuentaPucId) } } });
  const porId = new Map(cuentas.map((c) => [c.id, c]));

  return grupos
    .map((g) => {
      const cuenta = porId.get(g.cuentaPucId)!;
      const debito = Number(g._sum.debito ?? 0);
      const credito = Number(g._sum.credito ?? 0);
      const saldo = cuenta.naturaleza === "debito" ? debito - credito : credito - debito;
      return {
        cuentaId: cuenta.id,
        codigo: cuenta.codigo,
        nombre: cuenta.nombre,
        naturaleza: cuenta.naturaleza as "debito" | "credito",
        nivel: cuenta.nivel,
        debito,
        credito,
        saldo,
      };
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export async function libroDiario(desde: Date | null, hasta: Date | null) {
  const filtroFecha: { gte?: Date; lte?: Date } = {};
  if (desde) filtroFecha.gte = desde;
  if (hasta) filtroFecha.lte = hasta;
  return prisma.comprobanteContable.findMany({
    where: { estado: "contabilizado", ...(desde || hasta ? { fecha: filtroFecha } : {}) },
    include: { movimientos: { include: { cuentaPuc: true, tercero: { select: { nombre: true } } } } },
    orderBy: [{ fecha: "asc" }, { numero: "asc" }],
  });
}

export async function libroMayor(desde: Date | null, hasta: Date | null, cuentaId?: number) {
  const saldosIniciales = desde ? await saldosPorCuenta(null, new Date(desde.getTime() - 1)) : [];
  const filtroFecha: { gte?: Date; lte?: Date } = {};
  if (desde) filtroFecha.gte = desde;
  if (hasta) filtroFecha.lte = hasta;
  const movimientos = await prisma.movimientoContable.findMany({
    where: {
      ...(cuentaId ? { cuentaPucId: cuentaId } : {}),
      comprobante: { estado: "contabilizado", ...(desde || hasta ? { fecha: filtroFecha } : {}) },
    },
    include: { cuentaPuc: true, tercero: { select: { nombre: true } }, comprobante: true },
    orderBy: { comprobante: { fecha: "asc" } },
  });
  return { saldosIniciales: cuentaId ? saldosIniciales.filter((s) => s.cuentaId === cuentaId) : saldosIniciales, movimientos };
}

export async function estadoResultados(desde: Date, hasta: Date) {
  const saldos = await saldosPorCuenta(desde, hasta);
  const ingresos = saldos.filter((s) => s.codigo.startsWith("4"));
  const gastos = saldos.filter((s) => s.codigo.startsWith("5"));
  const costos = saldos.filter((s) => s.codigo.startsWith("6"));
  const totalIngresos = ingresos.reduce((a, s) => a + s.saldo, 0);
  const totalGastos = gastos.reduce((a, s) => a + s.saldo, 0);
  const totalCostos = costos.reduce((a, s) => a + s.saldo, 0);
  return { ingresos, gastos, costos, totalIngresos, totalGastos, totalCostos, utilidad: totalIngresos - totalGastos - totalCostos };
}

export async function balanceGeneral(corte: Date) {
  const saldos = await saldosPorCuenta(null, corte);
  const activo = saldos.filter((s) => s.codigo.startsWith("1"));
  const pasivo = saldos.filter((s) => s.codigo.startsWith("2"));
  const patrimonio = saldos.filter((s) => s.codigo.startsWith("3"));
  const totalActivo = activo.reduce((a, s) => a + s.saldo, 0);
  const totalPasivo = pasivo.reduce((a, s) => a + s.saldo, 0);

  // Resultado del ejercicio (ingresos - gastos - costos desde el inicio hasta el corte): todavía
  // no está "cerrado" a Patrimonio con un asiento contable formal (eso es un paso manual de fin de
  // año que no existe en este MVP), pero se incluye igual como línea de patrimonio para que el
  // balance cuadre en cualquier momento del año — práctica estándar en sistemas contables chicos
  // sin cierre automático.
  const resultado = await estadoResultados(new Date(0), corte);
  const totalPatrimonio = patrimonio.reduce((a, s) => a + s.saldo, 0) + resultado.utilidad;

  return {
    activo,
    pasivo,
    patrimonio,
    resultadoEjercicio: resultado.utilidad,
    totalActivo,
    totalPasivo,
    totalPatrimonio,
    cuadra: Math.abs(totalActivo - (totalPasivo + totalPatrimonio)) < 0.01,
  };
}
