// Reglas de "periodo" (mes de facturación, formato "YYYY-MM") centralizadas — antes vivían
// copiadas en dashboard.ts, reportes.ts y lecturas.ts (3 implementaciones de primerDiaMes()
// idénticas, y 2 versiones de la regla "factura arranca el día 20" con nombres distintos:
// periodoActualStr() usaba hora LOCAL del servidor y mesFacturableActual() usaba UTC — por
// coincidencia dan lo mismo porque el contenedor corre en UTC, pero es frágil: si alguna vez el
// contenedor corriera con otra zona horaria, las dos versiones se habrían desincronizado).
// Todo acá es explícitamente UTC, para que no dependa de la zona horaria del proceso.

// "YYYY-MM" → primer día de ese mes a medianoche UTC. Es la representación que usa la columna
// Lectura.periodo en la BD.
export function primerDiaMes(periodo: string): Date {
  const [y, m] = periodo.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

// El periodo facturable "vigente": la captura de lecturas de un mes arranca el día 20, así que
// antes de esa fecha el mes calendario en curso todavía no es facturable — sigue contando el
// anterior. Usado como default de ?periodo en KPIs, atípicos, pendientes y reportes.
export function periodoFacturableActual(): string {
  const now = new Date();
  let anio = now.getUTCFullYear();
  let mes = now.getUTCDate() < 20 ? now.getUTCMonth() : now.getUTCMonth() + 1;
  if (mes === 0) {
    mes = 12;
    anio -= 1;
  }
  return `${anio}-${String(mes).padStart(2, "0")}`;
}
