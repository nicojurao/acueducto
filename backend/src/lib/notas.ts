import type { Prisma } from "@prisma/client";
import type { ConceptoCalculado } from "./facturacionCalculo.js";

type Tx = Prisma.TransactionClient;

// Aplica las notas pendientes de un suscriptor como conceptos extra de la factura que se está por
// generar — una nota crédito resta del total (saldo a favor/descuento), una débito suma (cargo
// adicional). Se llama DENTRO del mismo bucle/transacción que crea cada Factura (ver
// POST /generar/iniciar), justo después de liquidarFactura() y antes de crear la Factura, pasando
// `totalTarifa` (el total que ya calculó la tarifa, ANTES de la nota) para poder topar el
// descuento.
//
// Una nota crédito NUNCA deja el total de una factura en negativo: si vale más que lo que la
// tarifa ya calculó, se aplica solo hasta agotar ese total (factura queda en $0, no negativa) y el
// SOBRANTE de la nota queda pendiente para la próxima factura de ese suscriptor — se actualiza el
// valor de la nota en vez de partirla en dos filas, así el consecutivo original se conserva. Una
// nota débito no tiene este problema (solo suma), así que siempre se aplica completa.
//
// Deja el estado ya actualizado en la propia base (marca "aplicada" o reduce el valor pendiente) —
// a diferencia de la versión anterior, no hace falta un segundo paso después de crear la Factura
// para las notas cuyo id todavía no se conoce en ese punto... salvo `facturaAplicadaId`, que sí
// necesita el id de la Factura recién creada: por eso se devuelve `notaIds` para completarlo con
// marcarNotasAplicadas() una vez exista esa Factura.
export async function conceptosDeNotasPendientes(
  tx: Tx,
  suscriptorId: number,
  totalTarifa: number
): Promise<{ conceptos: ConceptoCalculado[]; totalAjuste: number; notaIds: number[] }> {
  const notas = await tx.nota.findMany({ where: { suscriptorId, estado: "pendiente" }, orderBy: { createdAt: "asc" } });
  if (notas.length === 0) return { conceptos: [], totalAjuste: 0, notaIds: [] };

  const conceptos: ConceptoCalculado[] = [];
  const notaIds: number[] = [];
  let totalAjuste = 0;
  let saldoDisponible = totalTarifa;

  for (const nota of notas) {
    const valorNota = Number(nota.valor);
    let aplicado: number;
    if (nota.tipo === "credito") {
      aplicado = Math.min(valorNota, Math.max(saldoDisponible, 0));
      saldoDisponible -= aplicado;
      if (aplicado === 0) continue; // ya no queda nada del total de esta factura para descontar
      if (aplicado < valorNota) {
        // Solo se consume una parte — el resto queda pendiente en la MISMA nota para la próxima vez.
        await tx.nota.update({ where: { id: nota.id }, data: { valor: valorNota - aplicado } });
      } else {
        notaIds.push(nota.id);
      }
    } else {
      aplicado = valorNota; // débito siempre completo, no hay riesgo de total negativo
      notaIds.push(nota.id);
    }

    const signo = nota.tipo === "credito" ? -1 : 1;
    conceptos.push({
      tipo: nota.tipo === "credito" ? "nota_credito" : "nota_debito",
      descripcion: `Nota ${nota.tipo === "credito" ? "crédito" : "débito"} #${nota.numero} — ${nota.concepto}`,
      cantidad: null,
      valorUnitario: null,
      valor: signo * aplicado,
    });
    totalAjuste += signo * aplicado;
  }
  return { conceptos, totalAjuste, notaIds };
}

export async function marcarNotasAplicadas(tx: Tx, notaIds: number[], facturaId: number): Promise<void> {
  if (notaIds.length === 0) return;
  await tx.nota.updateMany({
    where: { id: { in: notaIds } },
    data: { estado: "aplicada", facturaAplicadaId: facturaId, aplicadaEn: new Date() },
  });
}
