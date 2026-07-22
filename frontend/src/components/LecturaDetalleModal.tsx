import { X, Calendar, MapPin, User, Droplet, Gauge, StickyNote } from "lucide-react";
import { urlFoto } from "../api/client";
import { useCierreAnimado } from "../lib/useCierreAnimado";

function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LecturaDetalleModal({
  periodo,
  valorLectura,
  consumo,
  fotoUrl,
  latitud,
  longitud,
  fechaRegistro,
  capturadoPor,
  observaciones,
  consumoTotalMedidor,
  nIntegrantes,
  onClose,
}: {
  periodo: string;
  valorLectura: number | null;
  consumo: number;
  fotoUrl: string | null;
  latitud: number | null;
  longitud: number | null;
  fechaRegistro: string | null;
  capturadoPor: string | null;
  observaciones?: string | null;
  consumoTotalMedidor?: number | null;
  nIntegrantes?: number | null;
  onClose: () => void;
}) {
  const { saliendo, cerrar } = useCierreAnimado(onClose);
  return (
    <div className={`fixed inset-0 z-[2100] flex items-center justify-center bg-black/50 p-4 ${saliendo ? "animate-fade-out" : "animate-fade-in"}`} onClick={cerrar}>
      <div
        className={`flex max-h-[90vh] w-full max-w-md flex-col rounded-xl bg-white shadow-xl dark:bg-slate-900 ${saliendo ? "animate-scale-out" : "animate-scale-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-lg font-bold">Lectura de {periodo}</h2>
          <button onClick={cerrar} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {fotoUrl ? (
            <a href={urlFoto(fotoUrl)} target="_blank" rel="noreferrer">
              <img
                src={urlFoto(fotoUrl)}
                alt="Foto de la lectura"
                className="w-full rounded-lg border border-slate-200 object-cover dark:border-slate-700"
              />
            </a>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">Esta lectura no tiene foto (importada antes de exigirla).</p>
          )}

          <div className="space-y-2 text-sm">
            {valorLectura != null && (
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <Gauge className="h-4 w-4 shrink-0 text-brand-500" />
                Lectura: <strong>{valorLectura}</strong>
              </div>
            )}
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Droplet className="h-4 w-4 shrink-0 text-brand-500" />
              Consumo: <strong>{consumo} m³</strong>
            </div>
            {consumoTotalMedidor != null && nIntegrantes != null && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                Medidor compartido entre {nIntegrantes} usuarios. Lectura real del medidor (sin
                dividir): <strong>{consumoTotalMedidor} m³</strong>.
              </div>
            )}
            {fechaRegistro && (
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <Calendar className="h-4 w-4 shrink-0 text-brand-500" />
                Tomada el {fmtFechaHora(fechaRegistro)}
              </div>
            )}
            {capturadoPor && (
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <User className="h-4 w-4 shrink-0 text-brand-500" />
                Tomada por: {capturadoPor}
              </div>
            )}
            {latitud != null && longitud != null ? (
              <a
                href={`https://www.google.com/maps?q=${latitud},${longitud}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-brand-600 hover:underline dark:text-brand-400"
              >
                <MapPin className="h-4 w-4 shrink-0" />
                {latitud.toFixed(6)}, {longitud.toFixed(6)}
              </a>
            ) : (
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <MapPin className="h-4 w-4 shrink-0" />
                Sin coordenadas registradas
              </div>
            )}
            {observaciones && (
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                {observaciones}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
