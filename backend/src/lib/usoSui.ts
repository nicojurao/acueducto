// Clasificación de "uso" del predio para reportes SUI: NO es un campo independiente que se
// pueda elegir a mano (se desincronizaría del estrato) — se deriva siempre del estrato del
// suscriptor. Estratos 1-6 (residenciales) = "residencial"; cualquier otro código del catálogo
// (Comercial, Oficial, y los que se agreguen a futuro) = "no_residencial".
export function usoDesdeEstrato(codigoEstrato: string | null | undefined): "residencial" | "no_residencial" {
  if (!codigoEstrato) return "residencial";
  return /^[1-6]$/.test(codigoEstrato) ? "residencial" : "no_residencial";
}
