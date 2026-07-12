import { useEffect, useState } from "react";

// Mismo corte que el breakpoint "md" de Tailwind (768px), usado para decidir cuántas
// filas mostrar por página en las tablas (menos en celular, para que la paginación
// quepa en pantalla sin tapar el resto de la vista).
const MEDIA_QUERY = "(max-width: 767px)";

export function useEsMovil(): boolean {
  const [esMovil, setEsMovil] = useState(() => window.matchMedia(MEDIA_QUERY).matches);

  useEffect(() => {
    const mq = window.matchMedia(MEDIA_QUERY);
    const onChange = () => setEsMovil(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return esMovil;
}
