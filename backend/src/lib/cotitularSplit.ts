// Un medidor con cotitulares (acometida multiusuario) reparte lectura/consumo entre todos
// (titular + cotitulares) en partes ENTERAS iguales; si no da exacto, el titular se queda con el
// resto (puede terminar con un poco más o un poco menos que los demás, nunca ellos). Esta regla
// vivía copiada 3 veces en reportes.ts (informe de lecturas, mapa de consumo, histórico de
// suscriptor) — un cambio de criterio ahí requería recordar tocar los 3 lugares.
export function repartirEntero(total: number, nIntegrantes: number, esCotitular: boolean): number {
  if (nIntegrantes <= 1) return total;
  const share = Math.floor(total / nIntegrantes);
  return esCotitular ? share : total - share * (nIntegrantes - 1);
}
