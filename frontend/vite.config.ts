import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // Cachea el app shell (HTML/JS/CSS) para poder abrir la app sin conexión. Solo tiene efecto
    // real en un build de producción (`vite build`) — en `vite --host` (modo desarrollo, que es
    // como corre el contenedor hoy) el plugin no genera un service worker instalable, queda
    // preparado para cuando se pase a servir el build.
    VitePWA({
      registerType: "autoUpdate",
      // "auto" solo inyecta un <script> que hace un `serviceWorker.register()` sencillo, sin
      // revisar nunca si hay una versión nueva ni recargar la pestaña — por eso "autoUpdate" no
      // alcanzaba solo con esto: el navegador quedaba con el service worker viejo indefinidamente
      // hasta un hard refresh. Se registra a mano en main.tsx con virtual:pwa-register, que sí
      // revisa periódicamente y recarga solo cuando encuentra una versión nueva.
      injectRegister: false,
      manifest: {
        name: "Fluvi — Gestión de Acueducto",
        short_name: "Fluvi",
        theme_color: "#00487f",
        background_color: "#0f172a",
        display: "standalone",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        // "registerType: autoUpdate" NO alcanza por sí solo para esto — son dos flags de workbox
        // aparte, y sin ellos el service worker generado se queda esperando un postMessage
        // "SKIP_WAITING" del cliente que nunca llega (eso es lo que hacía el <script> que se
        // sacó arriba), y nunca reclama el control de las pestañas ya abiertas. Con esto, el
        // service worker nuevo se activa solo apenas se instala y toma control de todo enseguida
        // — lo que a su vez dispara el "controllerchange" que main.tsx escucha para recargar.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ["operativo.acbum.com.co"],
    // Desactivado a propósito: en el celular, abrir la cámara para tomar la foto de la
    // lectura manda la pestaña a segundo plano y corta el WebSocket de HMR; al volver,
    // Vite lo detecta como desconexión y fuerza un location.reload(), perdiendo la foto
    // recién tomada. Los cambios de código igual se aplican reiniciando el contenedor.
    hmr: false,
    proxy: {
      "/api": "http://backend:3001",
      "/uploads": "http://backend:3001",
    },
  },
});
