import { useEffect, useState } from "react";

// Rota entre mensajes cada `intervaloMs` mientras `activo` sea true, en vez de dejar un
// "Cargando..." fijo. Un mensaje que cambia se percibe como progreso real aunque la tarea de
// fondo tarde exactamente lo mismo — clave para operaciones largas (backups, importaciones,
// informes) donde no hay un % real que reportar.
export function useMensajeProgresivo(mensajes: string[], activo: boolean, intervaloMs = 2200): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!activo) {
      setI(0);
      return;
    }
    const id = setInterval(() => setI((prev) => Math.min(prev + 1, mensajes.length - 1)), intervaloMs);
    return () => clearInterval(id);
  }, [activo, mensajes, intervaloMs]);
  return mensajes[Math.min(i, mensajes.length - 1)];
}
