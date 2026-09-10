/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Escala de marca — antes 11 hex literales fijos (derivados de #00487f, el color de
        // ACBUM); ahora cada escalón resuelve a una variable CSS (--brand-50 ... --brand-950) que
        // frontend/src/lib/empresaRuntime.ts calcula en tiempo de ejecución a partir del
        // "colorMarca" que cada cliente elige en el wizard/panel de administración, e inyecta en
        // :root ANTES del primer render — así ningún componente que ya use `bg-brand-600`,
        // `text-brand-700`, etc. (393 usos en 62 archivos) necesita cambiar. El formato
        // "rgb(var(--x) / <alpha-value>)" es el que pide Tailwind para poder seguir soportando
        // opacidad (`bg-brand-600/50`) sobre un valor que en realidad es una variable.
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
          950: "rgb(var(--brand-950) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
