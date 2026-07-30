// Código de "ESTADO DE MEDIDOR" del reporte SUI (Formato 279 de facturación):
// 1 = sin medidor, 2 = medidor no funciona (dañado), 3 = medidor funciona correctamente.
// Se deriva SIEMPRE del estado real del suscriptor/medidor — no es un campo que se capture
// aparte, para que nunca quede desincronizado.
export function estadoMedidorSui(estadoFacturacion: string, condicionMedidor: string | null | undefined): 1 | 2 | 3 {
  if (estadoFacturacion === "sin_medidor") return 1;
  if (condicionMedidor === "danado" || estadoFacturacion === "inactivo") return 2;
  return 3;
}

// Código de "DETERMINACIÓN DEL CONSUMO": 1 = medido (lectura real), 2 = promedio/estimado
// (consumo predeterminado, sin lectura ese periodo).
export function determinacionConsumoSui(sinMedidor: boolean): 1 | 2 {
  return sinMedidor ? 2 : 1;
}
