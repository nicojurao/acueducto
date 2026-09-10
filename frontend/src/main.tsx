import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./index.css";
import { cargarEmpresaPublica } from "./lib/empresaRuntime";
import { aplicarColorMarca } from "./lib/colorMarca";

// Registro nativo directo (sin virtual:pwa-register/workbox-window de por medio): esa librería
// tiraba "InvalidStateError: Failed to update a ServiceWorker... object is in an invalid state"
// al llamar registration.update() poco después de registrar, y con eso el registro entero fallaba
// en silencio — /sw.js ni se llegaba a pedir por red. El service worker generado necesita además
// "skipWaiting: true" y "clientsClaim: true" en el workbox de vite.config.ts (NO alcanza con
// registerType: "autoUpdate" solo) para activarse y tomar control de las pestañas sin esperar un
// postMessage del cliente — con esas dos piezas puestas, alcanza con: registrar, revisar de vez
// en cuando si cambió, y recargar cuando el navegador avise que un service worker nuevo tomó el
// control.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
    function revisarActualizacion() {
      registration.update().catch(() => {
        // Un chequeo fallido (ej. sin conexión un instante) no es grave — se reintenta en el
        // próximo intervalo o al volver a la pestaña, no hace falta hacer nada con el error acá.
      });
    }
    // El navegador ya revisa sw.js solo en cada navegación de página completa, pero esta es una
    // SPA: navegar entre pantallas no dispara eso. Sin este intervalo, una pestaña que se queda
    // abierta mucho tiempo (el fontanero con la app abierta todo el día) nunca se entera de un
    // deploy nuevo.
    setInterval(revisarActualizacion, 10_000);
    // Y el otro momento típico en que a alguien se le escapa una actualización: cuando la pestaña
    // vuelve a primer plano después de estar en segundo plano (se bloqueó el celular, se cambió
    // de app y se volvió).
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") revisarActualizacion();
    });
  });

  // Cuando un service worker nuevo termina de instalarse y toma el control (gracias a
  // skipWaiting+clientsClaim, sin esperar a que se cierren todas las pestañas), el navegador
  // dispara esto en TODAS las pestañas abiertas de la app — acá es donde se recarga sola para
  // que la pestaña deje de usar el JS viejo que ya tiene cargado en memoria.
  let yaRecargando = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (yaRecargando) return;
    yaRecargando = true;
    window.location.reload();
  });
}

// Se espera este fetch ANTES de montar React: App.tsx necesita saber a qué dominio corresponde
// el hostname actual (operativo/pqrs/calidad) para decidir qué sitio renderizar, y el color de
// marca hay que inyectarlo antes del primer pintado para no ver un parpadeo del azul de ACBUM
// seguido del color real del cliente. Si el backend no responde a tiempo, cargarEmpresaPublica()
// ya resuelve con valores por defecto (ver empresaRuntime.ts) en vez de colgar el arranque.
cargarEmpresaPublica().then((empresa) => {
  aplicarColorMarca(empresa.colorMarca);
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
