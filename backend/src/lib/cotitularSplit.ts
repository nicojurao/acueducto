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

// Lista de "integrantes" de un medidor (titular + cotitulares) para repartirle lectura/consumo a
// cada uno con repartirEntero — vivía copiada en /lecturas-excel y /mapa-consumo (reportes.ts).
// El suscriptor titular se asume no-null: quien llama esto ya filtró medidores con
// suscriptorId: { not: null } en el where de Prisma.
export function integrantesDelMedidor<S>(medidor: {
  suscriptor: S | null;
  cotitulares: { suscriptor: S }[];
}): { suscriptor: S; esCotitular: boolean }[] {
  return [
    { suscriptor: medidor.suscriptor as S, esCotitular: false },
    ...medidor.cotitulares.map((c) => ({ suscriptor: c.suscriptor, esCotitular: true })),
  ];
}
