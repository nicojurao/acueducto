import { useEffect, useState } from "react";

// Estado de conexión del navegador, para mostrar un aviso persistente cuando no hay
// internet — separado de useColaPendientes() (offlineQueue.ts), que además carga la cola
// de IndexedDB: acá solo interesa el booleano, sin ese costo, para poder usarlo en el shell
// de la app (visible en todas las páginas) sin arrastrar la lógica de sincronización.
export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return online;
}
