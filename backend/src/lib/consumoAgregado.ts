// La aritmética de "sumar consumo y contar usuarios de un conjunto de lecturas, opcionalmente
// agrupado por alguna clave (mes/ruta/barrio/estrato)" vivía reimplementada 3 veces de forma
// independiente: dashboard.ts (sumaConsumoPeriodo, sin agrupar), reportes.ts /resumen-mensual
// (agrupado por mes) y reportes.ts consumoAgrupadoPorPeriodo (agrupado por ruta/barrio/estrato).
// La consulta a Prisma de cada caso sigue siendo distinta (cada uno filtra/incluye lo que
// necesita) — lo que se centraliza acá es solo el cálculo posterior, que sí era código idéntico
// copiado tres veces.

interface ConLecturaConsumo {
  consumo: unknown; // Prisma.Decimal — se castea con Number() al sumar
}

export function totalConsumo<T extends ConLecturaConsumo>(lecturas: T[]): { consumo: number; usuarios: number } {
  return {
    consumo: lecturas.reduce((acc, l) => acc + Number(l.consumo), 0),
    usuarios: lecturas.length,
  };
}

export function agregarPorClave<T extends ConLecturaConsumo>(
  lecturas: T[],
  claveFn: (l: T) => string
): Map<string, { usuarios: number; consumo: number }> {
  const grupos = new Map<string, { usuarios: number; consumo: number }>();
  for (const l of lecturas) {
    const clave = claveFn(l);
    const acc = grupos.get(clave) ?? { usuarios: 0, consumo: 0 };
    acc.usuarios += 1;
    acc.consumo += Number(l.consumo);
    grupos.set(clave, acc);
  }
  return grupos;
}
