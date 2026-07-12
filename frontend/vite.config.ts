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
      injectRegister: "auto",
      manifest: {
        name: "Acueducto — Gestión de Medidores",
        short_name: "Medidores",
        theme_color: "#0891b2",
        background_color: "#0f172a",
        display: "standalone",
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
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
