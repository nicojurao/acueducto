// El servidor corre en UTC (contenedor Docker), pero todo lo que se le muestra al usuario como
// "ahora" (nombre de archivo con fecha/hora, "generado el..." en reportes/actas) debe verse en
// hora de Colombia, no UTC — si no, un backup generado a las 7pm en Mocoa aparece fechado al día
// siguiente. Colombia NO tiene horario de verano, así que es un offset fijo de -5, pero se usa
// Intl con el nombre de la zona (no un offset a mano) para que quede correcto sin depender de eso.
const ZONA_COLOMBIA = "America/Bogota";

function partes(fecha: Date): Record<string, string> {
  const campos = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_COLOMBIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(fecha);
  const obj: Record<string, string> = {};
  for (const p of campos) obj[p.type] = p.value;
  return obj;
}

// "2026-07-23-11-50-09" — para nombres de archivo (sin ":" ni espacios, válido en cualquier SO).
export function fechaHoraArchivoColombia(fecha: Date = new Date()): string {
  const p = partes(fecha);
  return `${p.year}-${p.month}-${p.day}-${p.hour}-${p.minute}-${p.second}`;
}

// "2026-07-23" — para nombres de archivo que solo necesitan el día.
export function fechaArchivoColombia(fecha: Date = new Date()): string {
  return fechaHoraArchivoColombia(fecha).slice(0, 10);
}

// "23/07/2026" — para el pie/encabezado de reportes en PDF/Excel ("Generado el ...").
export function fechaLegibleColombia(fecha: Date = new Date()): string {
  const p = partes(fecha);
  return `${p.day}/${p.month}/${p.year}`;
}
