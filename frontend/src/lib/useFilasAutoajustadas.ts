import { useLayoutEffect, useRef, useState } from "react";

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

  // useLayoutEffect (no useEffect): el cálculo real corre y aplica ANTES de que el navegador
  // pinte y antes de que se disparen los useEffect de quien use este hook — así el efecto que
  // pide los datos (en SuscriptoresPage, por ejemplo) ya ve el valor final la primera vez que
  // corre, en vez de ver primero el "minimo" de este hook, disparar un fetch con eso, y disparar
  // un segundo fetch cuando el cálculo real llega un instante después.
  useLayoutEffect(() => {
    let ultimoValor = minimo;
    function calcular() {
      const top = contenedorRef.current?.getBoundingClientRect().top ?? 0;
      const disponible = window.innerHeight - top - margenInferior;
      const nuevo = Math.min(maximo, Math.max(minimo, Math.floor(disponible / altoFila)));
      if (nuevo === ultimoValor) return;
      ultimoValor = nuevo;
      setFilas(nuevo);
    }
    // El ResizeObserver sobre <body> se retroalimenta a sí mismo: al calcular "filas" distinto
    // se piden más/menos filas al servidor, la tabla cambia de alto, el body cambia de alto, y
    // eso vuelve a disparar el observer — cada vuelta del ciclo dispara un fetch nuevo antes de
    // que el anterior siquiera se vea en pantalla. El debounce deja que el layout se asiente y
    // colapsa toda esa ráfaga en un solo cálculo (y un solo fetch) al final.
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    function calcularConDebounce() {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(calcular, 150);
    }
    // El cálculo inicial (sin debounce) evita que la tabla arranque mostrando el "minimo" de
    // relleno antes de ajustarse — pero de ahí en adelante TODO pasa por debounce (incluida la
    // corrección del próximo frame), para que la ráfaga inicial y el ciclo del ResizeObserver
    // colapsen en un solo cálculo final en vez de una serie de fetches, uno por cada valor
    // intermedio por el que pasa el layout mientras se asienta.
    calcular();
    // Un solo cálculo al montar puede quedar corto: el layout de arriba (barra de filtros,
    // sidebar) a veces todavía no terminó de asentarse en ese instante (fuentes cargando,
    // elementos condicionales). Antes esto solo se corregía si el usuario redimensionaba la
    // ventana a mano. Un ResizeObserver sobre <body> detecta CUALQUIER cambio de layout de la
    // página (no solo el resize de la ventana) y recalcula solo.
    const raf = requestAnimationFrame(calcularConDebounce);
    window.addEventListener("resize", calcularConDebounce);
    const observador = new ResizeObserver(calcularConDebounce);
    observador.observe(document.body);
    return () => {
      cancelAnimationFrame(raf);
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener("resize", calcularConDebounce);
      observador.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { contenedorRef, filas };
}
