// Formatea una fecha "de calendario" (sin hora) sin que la conversión de zona horaria la corra
// un día. El backend guarda estos campos con new Date("YYYY-MM-DD") (medianoche UTC); si el
// frontend los muestra con `new Date(iso).toLocaleDateString()`, el navegador convierte esa
// medianoche UTC a hora LOCAL — en Colombia (UTC-5) eso cae en las 7pm del día anterior, y la
// fecha se ve un día antes de la que se guardó. Acá se parsean los componentes año/mes/día a
// mano y se arma la fecha en hora LOCAL, para que no haya conversión que la corra.
export function fmtFecha(fecha: string | null | undefined, opciones?: Intl.DateTimeFormatOptions): string {
  if (!fecha) return "-";
  const [anio, mes, dia] = fecha.slice(0, 10).split("-").map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString(
    "es-CO",
    opciones ?? { year: "numeric", month: "long", day: "numeric" }
  );
}
