import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api, HistorialCambio } from "../api/client";

function fmtFechaHora(fecha: string): string {
  return new Date(fecha).toLocaleString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Lista compacta de cambios de un registro puntual (medidor o suscriptor), pensada para
// incrustarse dentro de su modal de detalle. La vista global con filtros vive en HistorialPage.
export default function HistorialTimeline({ entidad, entidadId }: { entidad: "medidor" | "suscriptor"; entidadId: number }) {
  const [cambios, setCambios] = useState<HistorialCambio[] | null>(null);

  useEffect(() => {
    setCambios(null);
    api.historial.porEntidad(entidad, entidadId).then(setCambios);
  }, [entidad, entidadId]);

  if (cambios === null) return <p className="text-sm text-slate-700 dark:text-slate-400">Cargando historial...</p>;
  if (cambios.length === 0) return <p className="text-sm text-slate-700 dark:text-slate-400">Sin cambios registrados todavía.</p>;

  return (
    <div className="space-y-2">
      {cambios.map((c) => (
        <div key={c.id} className="rounded-lg border border-slate-200 p-2.5 text-sm dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-slate-800 dark:text-slate-100">{c.campo}</span>
            <span className="shrink-0 text-xs text-slate-600 dark:text-slate-400">{fmtFechaHora(c.fecha)}</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-700 dark:text-slate-400">
            {c.valorAnterior ?? <em className="text-slate-500">(vacío)</em>}
            {" → "}
            {c.valorNuevo ?? <em className="text-slate-500">(vacío)</em>}
          </div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-500">{c.usuario?.nombre ?? "Usuario eliminado"}</div>
        </div>
      ))}
    </div>
  );
}

export function HistorialSeccion({ entidad, entidadId }: { entidad: "medidor" | "suscriptor"; entidadId: number }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div>
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
      >
        <History className="h-4 w-4 text-brand-500" />
        Historial de cambios
      </button>
      {abierto && (
        <div className="mt-2">
          <HistorialTimeline entidad={entidad} entidadId={entidadId} />
        </div>
      )}
    </div>
  );
}
