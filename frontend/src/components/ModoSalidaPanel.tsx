import { useEffect, useState } from "react";
import { Download, CheckCircle2, Plane } from "lucide-react";
import { descargarSnapshot, leerSnapshot } from "../lib/offlineSnapshot";

function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

// Botón de "modo de salida": antes de ir a campo, descarga de una sola vez todo lo que se
// necesita para poder seguir trabajando sin conexión (suscriptores, medidores, lecturas
// históricas, catálogos — ver backend/.../offline.ts) y lo guarda en IndexedDB. A propósito
// no incluye fotos ni PDFs (eso vive en MinIO y pesa demasiado para esto). Vive en Inicio,
// justo debajo del saludo, para que sea lo primero que se vea antes de salir de la oficina.
export default function ModoSalidaPanel() {
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [progreso, setProgreso] = useState<{ recibidos: number; total: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    leerSnapshot().then((s) => {
      if (s) setUltimaActualizacion(s.generadoEn);
    });
  }, []);

  async function activar() {
    setDescargando(true);
    setError(null);
    setListo(false);
    setProgreso({ recibidos: 0, total: null });
    try {
      const data = await descargarSnapshot((recibidos, total) => setProgreso({ recibidos, total }));
      setUltimaActualizacion(data.generadoEn);
      setListo(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar la información");
    } finally {
      setDescargando(false);
    }
  }

  // Content-Length no siempre llega (ej. según cómo Cloudflare termine sirviendo la respuesta en
  // producción) — sin esto, la barra se quedaba fija en un 30% inventado toda la descarga (bug
  // reportado: "no avanza"). Con un tamaño estimado como respaldo, la barra sí avanza de verdad
  // según los bytes que van llegando, aunque el número no sea exacto — se limita a 95% mientras
  // no se sepa que ya terminó, para no mostrar "100%" de mentira antes de tiempo.
  const TAMANO_ESTIMADO_BYTES = 8 * 1024 * 1024;
  const total = progreso?.total ?? TAMANO_ESTIMADO_BYTES;
  const porcentajeReal = progreso ? Math.round((progreso.recibidos / total) * 100) : 0;
  const porcentaje = progreso?.total ? Math.min(100, porcentajeReal) : Math.min(95, porcentajeReal);

  return (
    <div className="mb-5 rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Plane className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Modo de salida</h3>
            <p className="text-xs text-slate-700 dark:text-slate-400">
              Descarga suscriptores, medidores y lecturas al dispositivo para poder seguir trabajando aunque se
              pierda la señal en campo.
            </p>
            {ultimaActualizacion && !descargando && (
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-500">
                Última actualización: {fmtFechaHora(ultimaActualizacion)}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={activar}
          disabled={descargando}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {descargando ? "Descargando..." : ultimaActualizacion ? "Actualizar" : "Activar modo de salida"}
        </button>
      </div>

      {descargando && progreso && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${porcentaje}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-500">
            {progreso.total
              ? `${porcentaje}% · ${fmtMB(progreso.recibidos)} de ${fmtMB(progreso.total)}`
              : `${fmtMB(progreso.recibidos)} descargados...`}
          </p>
        </div>
      )}

      {listo && !descargando && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Todo correcto — datos actualizados el {ultimaActualizacion && fmtFechaHora(ultimaActualizacion)}. Ya puedes
          salir a trabajar sin miedo a perder la conexión.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
