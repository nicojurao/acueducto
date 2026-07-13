import { useEffect, useState } from "react";

// useState que además persiste en localStorage: los filtros de las tablas (barrio, ruta,
// estado...) sobreviven recargas y cierres del navegador, para no tener que reconfigurarlos
// cada vez. La clave lleva prefijo por pantalla (ej. "filtros.suscriptores.barrio").
// Sobrecargas: sin genérico explícito devuelve string plano (evita que TS infiera el literal
// del valor inicial, ej. "" y rechace cualquier otro valor); con genérico explícito
// (useFiltroPersistente<FiltroEstado>(...)) mantiene el tipo de unión.
export function useFiltroPersistente(clave: string, inicial: string): [string, (v: string) => void];
export function useFiltroPersistente<T extends string>(clave: string, inicial: T): [T, (v: T) => void];
export function useFiltroPersistente<T extends string>(clave: string, inicial: T): [T, (v: T) => void] {
  const [valor, setValor] = useState<T>(() => {
    try {
      const guardado = localStorage.getItem(`filtros.${clave}`);
      return guardado !== null ? (guardado as T) : inicial;
    } catch {
      return inicial;
    }
  });

  useEffect(() => {
    try {
      if (valor === inicial) localStorage.removeItem(`filtros.${clave}`);
      else localStorage.setItem(`filtros.${clave}`, valor);
    } catch {
      // localStorage lleno o bloqueado: el filtro funciona igual, solo no persiste.
    }
  }, [clave, valor, inicial]);

  return [valor, setValor];
}
