// Umbral mínimo legal para poder suspender por mora: la Ley 142 de 1994, Art. 140, exige DOS
// periodos de facturación sin pagar cuando es bimestral, o TRES cuando es mensual — Fluvi factura
// mensualmente (ver Lectura.periodo, único por mes), así que el mínimo acá es 3.
export const MESES_MORA_MINIMO = 3;

// Texto del aviso previo — los 4 elementos que exige el Art. 140 de la Ley 142/1994 antes de
// poder suspender por mora: (i) causal, (ii) recursos que proceden, (iii) plazo para
// interponerlos, (iv) autoridad ante quien se interponen. Fuentes verificadas 2026-09-12:
//   - Plazo de 5 días hábiles: Ley 142/1994 Art. 154 (prevalece sobre el CPACA por especialidad,
//     según jurisprudencia y conceptos de la SSPD).
//   - El recurso de apelación es SIEMPRE subsidiario del de reposición, nunca directo: Ley
//     142/1994 Art. 159.
//   - Plazo de resolución del recurso por la empresa: 15 días hábiles, Ley 142/1994 Art. 158.
// Este texto es una plantilla razonable, no un concepto jurídico verificado para el caso
// puntual de ACBUM — antes de usarlo para un corte real, vale la pena que lo revise alguien con
// criterio legal.
export function generarAvisoMora(params: {
  nombreEmpresa: string;
  suscriptorNombre: string;
  suscriptorCodigo: string;
  facturasPendientes: number;
  saldoTotal: number;
}): string {
  const { nombreEmpresa, suscriptorNombre, suscriptorCodigo, facturasPendientes, saldoTotal } = params;
  return [
    `AVISO PREVIO DE SUSPENSIÓN DEL SERVICIO POR NO PAGO`,
    ``,
    `Predio: ${suscriptorCodigo} — ${suscriptorNombre}`,
    ``,
    `1. CAUSAL: el predio registra ${facturasPendientes} factura(s) pendiente(s) de pago, por un total de ` +
      `$${saldoTotal.toLocaleString("es-CO")}, superando el mínimo de ${MESES_MORA_MINIMO} periodos de facturación ` +
      `mensual sin pagar que exige el Artículo 140 de la Ley 142 de 1994 para proceder con la suspensión.`,
    ``,
    `2. RECURSOS QUE PROCEDEN: contra esta decisión proceden el recurso de reposición ante ${nombreEmpresa}, y en ` +
      `subsidio, el de apelación ante la Superintendencia de Servicios Públicos Domiciliarios (SSPD) — el recurso ` +
      `de apelación no puede presentarse de forma directa, solo junto con el de reposición (Ley 142 de 1994, Art. 159).`,
    ``,
    `3. PLAZO PARA INTERPONERLOS: cinco (5) días hábiles siguientes a la notificación de este aviso (Ley 142 de ` +
      `1994, Art. 154).`,
    ``,
    `4. AUTORIDAD ANTE QUIEN SE INTERPONEN: el recurso de reposición se presenta ante ${nombreEmpresa}; el de ` +
      `apelación (subsidiario), ante la Superintendencia de Servicios Públicos Domiciliarios (SSPD).`,
    ``,
    `${nombreEmpresa} resolverá el recurso dentro de los quince (15) días hábiles siguientes a su presentación ` +
      `(Ley 142 de 1994, Art. 158).`,
  ].join("\n");
}
