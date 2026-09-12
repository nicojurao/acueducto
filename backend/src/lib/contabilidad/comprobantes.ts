import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";

type Tx = Prisma.TransactionClient;

// Marca como "anulado" el comprobante generado por una Factura/Pago que se anuló/eliminó — NUNCA
// se borra un comprobante ya contabilizado (misma filosofía que Factura.estado = "anulada": se
// deja constancia en vez de desaparecer el rastro). Los reportes de libros/estados financieros ya
// filtran por estado "contabilizado", así que uno anulado deja de afectar saldos automáticamente
// sin necesidad de un asiento de reverso aparte. No falla si no existe ningún comprobante (ej. una
// factura/pago de antes de que este módulo existiera) — simplemente no hay nada que anular.
export async function anularComprobante(tx: Tx, origenTabla: "Factura" | "Pago", origenId: number): Promise<void> {
  await tx.comprobanteContable.updateMany({
    where: { origenTabla, origenId, estado: "contabilizado" },
    data: { estado: "anulado" },
  });
}

// Igual que anularComprobante pero para muchos orígenes a la vez (un solo UPDATE) — usado al
// deshacer una generación masiva completa (hasta ~4.300 facturas de un periodo), donde llamar
// anularComprobante() factura por factura sería lentísimo. No falla si `origenIds` viene vacío.
export async function anularComprobantesEnLote(tx: Tx, origenTabla: "Factura" | "Pago", origenIds: number[]): Promise<void> {
  if (origenIds.length === 0) return;
  await tx.comprobanteContable.updateMany({
    where: { origenTabla, origenId: { in: origenIds }, estado: "contabilizado" },
    data: { estado: "anulado" },
  });
}

// Mapea el tipo de FacturaConcepto (ver backend/src/lib/facturacionCalculo.ts) a la cuenta PUC de
// ingreso que le corresponde. Los códigos son los del PUC genérico sembrado (migración
// 20260910130000_puc_seed_generico) — PROVISIONAL: cuando se reemplace por el PUC real de
// servicios públicos que exige la SSPD, este mapa hay que actualizarlo también.
const CUENTA_INGRESO_POR_CONCEPTO: Record<string, string> = {
  cargo_fijo: "414540",
  consumo_basico: "414540",
  consumo_complementario: "414540",
  consumo_suntuario: "414540",
  ajuste_estrato: "414540",
  alcantarillado_fijo: "414541",
  alcantarillado_consumo: "414541",
  aseo: "414542",
  manual: "414595",
  // Notas crédito/débito (ver lib/notas.ts) — sin una cuenta dedicada de "descuentos concedidos"
  // en el PUC provisional todavía, caen en "Otros servicios" igual que "manual" hasta que se
  // siembre el PUC real de servicios públicos.
  nota_credito: "414595",
  nota_debito: "414595",
  // Cuota de un acuerdo de pago (ver lib/acuerdosPago.ts): es la MISMA cartera reapareciendo en
  // una factura futura (la factura original financiada ya se anuló), así que contablemente es un
  // ingreso normal de "Otros servicios", no una cuenta especial.
  acuerdo_pago: "414595",
};

const CUENTA_CARTERA = "130501";
const CUENTA_CAJA = "110505";
const CUENTA_PROVEEDORES = "2205";

// Códigos PUC → id: son un puñado fijo de cuentas reutilizadas en CADA factura/pago (hasta ~4.300
// al mes en la generación masiva), así que se cachean en memoria para no repetir el mismo SELECT
// miles de veces en una sola corrida. Nunca se invalida (mismo criterio de riesgo aceptado que
// ESTRATO_LABELS en api/domains/comercial.ts): el código de una cuenta no se puede editar una vez
// creada (ver routes/comercial/contabilidad.ts), así que un id ya cacheado sigue siendo válido
// salvo que alguien borre y recree esa cuenta exacta, algo que no debería pasar en operación normal.
const cacheCuentaId = new Map<string, number>();

async function idCuenta(codigo: string): Promise<number> {
  const enCache = cacheCuentaId.get(codigo);
  if (enCache !== undefined) return enCache;
  const cuenta = await prisma.cuentaPuc.findUnique({ where: { codigo } });
  if (!cuenta) {
    throw new Error(
      `No existe la cuenta PUC "${codigo}" en el catálogo — revísalo en Contabilidad antes de facturar/cobrar.`
    );
  }
  cacheCuentaId.set(codigo, cuenta.id);
  return cuenta.id;
}

interface ConceptoParaComprobante {
  tipo: string;
  valor: number;
}

// Comprobante de venta: se llama DENTRO de la misma transacción que crea la Factura (ver
// facturacionRouter POST /generar/iniciar), para que nunca puedan quedar desincronizados. Un
// débito a Cartera por el total, un crédito por cada concepto positivo a su cuenta de ingreso (o
// un débito si el concepto es negativo, ej. subsidio por estrato — tratamiento estándar de
// "ingreso neto"). La suma cuadra por construcción: total = subtotal + ajusteEstrato, y el único
// concepto que puede ser negativo es justamente ajusteEstrato.
export async function generarComprobanteVenta(
  tx: Tx,
  facturaId: number,
  total: number,
  conceptos: ConceptoParaComprobante[],
  terceroId: number | null
): Promise<void> {
  const idCartera = await idCuenta(CUENTA_CARTERA);
  const movimientos: { cuentaPucId: number; terceroId: number | null; debito: number; credito: number; descripcion: string }[] = [
    { cuentaPucId: idCartera, terceroId, debito: total, credito: 0, descripcion: "Cartera por factura" },
  ];

  for (const c of conceptos) {
    const codigo = CUENTA_INGRESO_POR_CONCEPTO[c.tipo] ?? CUENTA_INGRESO_POR_CONCEPTO.manual;
    const idIngreso = await idCuenta(codigo);
    if (c.valor >= 0) {
      movimientos.push({ cuentaPucId: idIngreso, terceroId, debito: 0, credito: c.valor, descripcion: c.tipo });
    } else {
      movimientos.push({ cuentaPucId: idIngreso, terceroId, debito: -c.valor, credito: 0, descripcion: c.tipo });
    }
  }

  await tx.comprobanteContable.create({
    data: {
      tipo: "ingreso",
      concepto: `Factura de venta #${facturaId}`,
      origen: "venta",
      origenTabla: "Factura",
      origenId: facturaId,
      movimientos: { create: movimientos },
    },
  });
}

// Comprobante de recaudo: débito a Caja (se recibió el dinero), crédito a Cartera (se reduce lo
// que el suscriptor debía). Mismo criterio: dentro de la misma transacción que crea el Pago.
export async function generarComprobantePago(tx: Tx, pagoId: number, valor: number, terceroId: number | null): Promise<void> {
  const [idCaja, idCartera] = await Promise.all([idCuenta(CUENTA_CAJA), idCuenta(CUENTA_CARTERA)]);
  await tx.comprobanteContable.create({
    data: {
      tipo: "ingreso",
      concepto: `Pago #${pagoId}`,
      origen: "pago",
      origenTabla: "Pago",
      origenId: pagoId,
      movimientos: {
        create: [
          { cuentaPucId: idCaja, terceroId, debito: valor, credito: 0, descripcion: "Recaudo" },
          { cuentaPucId: idCartera, terceroId, debito: 0, credito: valor, descripcion: "Abono a cartera" },
        ],
      },
    },
  });
}

// Comprobante de un gasto/compra: débito a la cuenta de gasto que el usuario clasificó, crédito a
// Caja (si ya se pagó) o a Proveedores (si queda a deber). Simplificación deliberada del IVA: se
// suma al valor del gasto en vez de llevarlo a una cuenta de IVA descontable aparte — correcto
// para una entidad que no es responsable de IVA con derecho a descuento (el servicio de
// acueducto/alcantarillado que factura ACBUM está EXCLUIDO de IVA, ver análisis del plan de
// contabilidad), a revisar si algún cliente de Fluvi sí fuera responsable de IVA.
export async function generarComprobanteGasto(
  tx: Tx,
  gastoId: number,
  cuentaGastoId: number,
  valorTotal: number,
  pagado: boolean,
  terceroId: number
): Promise<void> {
  const idContrapartida = await idCuenta(pagado ? CUENTA_CAJA : CUENTA_PROVEEDORES);
  await tx.comprobanteContable.create({
    data: {
      tipo: "egreso",
      concepto: `Gasto #${gastoId}`,
      origen: "compra",
      origenTabla: "Gasto",
      origenId: gastoId,
      movimientos: {
        create: [
          { cuentaPucId: cuentaGastoId, terceroId, debito: valorTotal, credito: 0, descripcion: "Gasto" },
          {
            cuentaPucId: idContrapartida,
            terceroId,
            debito: 0,
            credito: valorTotal,
            descripcion: pagado ? "Pago del gasto" : "Queda a deber",
          },
        ],
      },
    },
  });
}
