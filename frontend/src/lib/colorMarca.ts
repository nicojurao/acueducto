// Genera la escala completa de 11 tonos (50→950) a partir de un solo color hex elegido por el
// cliente — mismo "H" (matiz) y "S" (saturación) del color elegido en todos los escalones, con la
// luminosidad (L) fija por escalón según una plantilla calcada de la escala original de ACBUM
// (#00487f), para que cualquier color que se elija mantenga el mismo contraste relativo que ya
// usa toda la app (fondos suaves en 50-100, texto en 600-700, fondos oscuros en 800-950, etc.).
const ESCALONES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const LUMINOSIDAD_POR_ESCALON: Record<(typeof ESCALONES)[number], number> = {
  50: 95.9,
  100: 89.8,
  200: 79.8,
  300: 66.9,
  400: 50.6,
  500: 36.1,
  600: 24.9,
  700: 20.4,
  800: 15.5,
  900: 11.0,
  950: 6.3,
};

function hexAHsl(hex: string): [number, number, number] {
  const limpio = hex.replace("#", "");
  const r = parseInt(limpio.slice(0, 2), 16) / 255;
  const g = parseInt(limpio.slice(2, 4), 16) / 255;
  const b = parseInt(limpio.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

// "R G B" separado por espacios (sin comas, sin paréntesis) — el formato que Tailwind espera
// cuando el color en el config es `rgb(var(--x) / <alpha-value>)`, para poder seguir soportando
// clases con opacidad (`bg-brand-600/50`) sobre una variable en vez de un hex fijo.
function hslATripletaRgb(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let [r, g, b] = [0, 0, 0];
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = lN - c / 2;
  const aBits = (v: number) => Math.round((v + m) * 255);
  return `${aBits(r)} ${aBits(g)} ${aBits(b)}`;
}

// Aplica la escala completa como variables CSS en :root — se llama una sola vez al arrancar la
// app (frontend/src/main.tsx), antes del primer render, con el "colorMarca" que venga de
// GET /api/publico/empresa (o el default de ACBUM si todavía no hay nada configurado).
export function aplicarColorMarca(colorBase: string): void {
  const [h, s] = hexAHsl(colorBase);
  for (const escalon of ESCALONES) {
    const rgb = hslATripletaRgb(h, s, LUMINOSIDAD_POR_ESCALON[escalon]);
    document.documentElement.style.setProperty(`--brand-${escalon}`, rgb);
  }
}
