/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Color corporativo (#00487f) como brand-600 — el resto de la escala se deriva de ahí
        // para poder usar las mismas variantes (hover, fondos suaves, texto en modo oscuro, etc.)
        // que antes daba la paleta "cyan" de Tailwind. Reemplaza cyan-* en toda la app.
        brand: {
          50: "#eef5fb",
          100: "#d6e7f4",
          200: "#aecfe9",
          300: "#7bb0da",
          400: "#4589bd",
          500: "#1f6699",
          600: "#00487f",
          700: "#003a68",
          800: "#002c4f",
          900: "#001f38",
          950: "#001120",
        },
      },
    },
  },
  plugins: [],
};
