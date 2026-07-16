import { useEffect, useRef, useState } from "react";

// Calcula cuántas filas de una tabla/lista caben entre el borde superior del contenedor y el
// final de la pantalla, dejando espacio para la barra de paginación — así el "por página" por
// defecto no tapa los botones Anterior/Siguiente ni deja la pantalla con espacio vacío de sobra.
// Solo fija el valor INICIAL (se recalcula si cambia el tamaño de ventana, pero no si el usuario
// ya eligió un tamaño distinto a mano en el selector "Mostrar").
// altoFila: alto en px de una fila de tabla o tarjeta (aprox., medido en el navegador).
// margenInferior: alto reservado para la barra de paginación + su padding.
// maximo: tope duro (default 30) — en monitores grandes el cálculo puede dar 40-50+ filas, y
// cada fila de más es una fila más que hay que traer del servidor en cada página; un tope evita
// que la carga se sienta más lenta solo por llenar una pantalla gigante.
export function useFilasAutoajustadas(altoFila: number, opciones?: { minimo?: number; margenInferior?: number; maximo?: number }) {
  const minimo = opciones?.minimo ?? 5;
  const margenInferior = opciones?.margenInferior ?? 80;
  const maximo = opciones?.maximo ?? 30;
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [filas, setFilas] = useState(minimo);

  useEffect(() => {
    function calcular() {
      const top = contenedorRef.current?.getBoundingClientRect().top ?? 0;
      const disponible = window.innerHeight - top - margenInferior;
      setFilas(Math.min(maximo, Math.max(minimo, Math.floor(disponible / altoFila))));
    }
    calcular();
    // Un solo cálculo al montar puede quedar corto: el layout de arriba (barra de filtros,
    // sidebar) a veces todavía no terminó de asentarse en ese instante (fuentes cargando,
    // elementos condicionales). Antes esto solo se corregía si el usuario redimensionaba la
    // ventana a mano. Un ResizeObserver sobre <body> detecta CUALQUIER cambio de layout de la
    // página (no solo el resize de la ventana) y recalcula solo.
    const raf = requestAnimationFrame(calcular);
    window.addEventListener("resize", calcular);
    const observador = new ResizeObserver(calcular);
    observador.observe(document.body);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", calcular);
      observador.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { contenedorRef, filas };
}
