import type { Prisma } from "@prisma/client";
import type { ConceptoCalculado } from "./facturacionCalculo.js";

type Tx = Prisma.TransactionClient;

// A diferencia de Nota (que aplica TODAS las pendientes de una vez), un acuerdo de pago aplica
// SOLO LA SIGUIENTE cuota pendiente en cada factura que se genere — así el suscriptor paga poco a
// poco a lo largo de varios periodos, no todo junto. Si al aplicarse la última cuota el acuerdo
// queda sin cuotas pendientes, se marca "completado".
export async function conceptoDeSiguienteCuota(
  tx: Tx,
  suscriptorId: number
): Promise<{ concepto: ConceptoCalculado | null; cuotaId: number | null; acuerdoPagoId: number | null }> {
  const acuerdo = await tx.acuerdoPago.findFirst({
    where: { suscriptorId, estado: "activo" },
    include: { cuotas: { where: { estado: "pendiente" }, orderBy: { numero: "asc" }, take: 1 } },
  });
  if (!acuerdo || acuerdo.cuotas.length === 0) return { concepto: null, cuotaId: null, acuerdoPagoId: null };

  const cuota = acuerdo.cuotas[0];
  return {
    concepto: {
      tipo: "acuerdo_pago",
      descripcion: `Acuerdo de pago #${acuerdo.id} — cuota ${cuota.numero}/${acuerdo.numeroCuotas} — ${acuerdo.concepto}`,
      cantidad: null,
      valorUnitario: null,
      valor: Number(cuota.valor),
    },
    cuotaId: cuota.id,
    acuerdoPagoId: acuerdo.id,
  };
}

export async function marcarCuotaAplicada(tx: Tx, cuotaId: number, acuerdoPagoId: number, facturaId: number): Promise<void> {
  await tx.cuotaAcuerdoPago.update({
    where: { id: cuotaId },
    data: { estado: "aplicada", facturaAplicadaId: facturaId, aplicadaEn: new Date() },
  });
  const pendientes = await tx.cuotaAcuerdoPago.count({ where: { acuerdoPagoId, estado: "pendiente" } });
  if (pendientes === 0) {
    await tx.acuerdoPago.update({ where: { id: acuerdoPagoId }, data: { estado: "completado" } });
  }
}
