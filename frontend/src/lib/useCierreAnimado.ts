import { useState } from "react";

// Los modales se desmontan de inmediato al llamar la función "cerrar" que les pasa el padre
// (React no anima un unmount instantáneo) — por eso las salidas se sentían "toscas" a pesar de
// que las entradas ya tenían fade/scale-in. Este hook agrega un paso intermedio: al cerrar, en
// vez de desmontar ya mismo, marca "saliendo" (que dispara la animación de salida por CSS) y
// recién después de esa duración llama a la función real de cierre que desmonta el modal.
const DURACION_SALIDA_MS = 150;

export function useCierreAnimado(cerrarDeVerdad: () => void) {
  const [saliendo, setSaliendo] = useState(false);

  function cerrar() {
    if (saliendo) return;
    setSaliendo(true);
    setTimeout(() => {
      cerrarDeVerdad();
      // Sin este reset, un modal que vive "en línea" dentro de un componente que no se
      // desmonta (ej. una pestaña con el modal de edición embebido, no como componente aparte)
      // reabre la próxima vez con "saliendo" todavía en true: entra directo con la animación de
      // SALIDA, termina en opacity:0 pero sigue ocupando toda la pantalla (fixed inset-0) y
      // bloqueando todos los clics — invisible pero interceptando todo, sin ningún error visible.
      setSaliendo(false);
    }, DURACION_SALIDA_MS);
  }

  return { saliendo, cerrar };
}
