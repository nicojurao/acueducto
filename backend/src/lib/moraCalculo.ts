// Cálculo de mora para reporte/visualización (no se cobra automáticamente todavía — la tasa
// vive en Tarifa.tasaMoraMensual, parametrizable por vigencia, en 0 hasta que la empresa decida
// activarla). "Días de mora" y "valor de mora/intereses" son campos que pide el reporte SUI
// (Formato 279); acá se calculan al vuelo a partir de la fecha de vencimiento y el saldo.
export interface MoraCalculada {
  diasMora: number;
  interesMora: number;
}

export function calcularMora(
  fechaVencimiento: Date | null,
  saldo: number,
  tasaMoraMensualPct: number,
  hoy: Date = new Date()
): MoraCalculada {
  if (!fechaVencimiento || saldo <= 0) return { diasMora: 0, interesMora: 0 };
  const diasMora = Math.max(0, Math.floor((hoy.getTime() - fechaVencimiento.getTime()) / (24 * 60 * 60 * 1000)));
  if (diasMora === 0 || tasaMoraMensualPct <= 0) return { diasMora, interesMora: 0 };
  // Interés simple proporcional a los días vencidos (tasa mensual prorrateada por día).
  const interesMora = Math.round(saldo * (tasaMoraMensualPct / 100) * (diasMora / 30));
  return { diasMora, interesMora };
}
