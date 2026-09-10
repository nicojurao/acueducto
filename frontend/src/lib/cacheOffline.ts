// Cache genérica en localStorage para listados que el fontanero necesita poder seguir viendo
// si abre la app sin conexión (ver AuthContext.tsx para el mismo problema con la sesión). Cada
// pantalla decide su propia clave (ej. periodo+filtros) y guarda ahí la última respuesta buena
// del servidor; si el próximo fetch falla por falta de red, se usa esa copia en vez de dejar la
// pantalla vacía.
const PREFIJO = "medidores_cache_";

export function guardarEnCache<T>(clave: string, datos: T): void {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(datos));
  } catch {
    // localStorage lleno o no disponible — no es crítico, simplemente no habrá respaldo offline
  }
}

export function leerDeCache<T>(clave: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIJO + clave);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
