import { useCallback, useEffect, useState } from "react";
import { CheckSquare, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { api, PasoVerificacionPeriodo } from "../api/client";
import { useToast } from "../contexts/ToastContext";

// Checklist de verificación de un periodo: cada paso se calcula en vivo contra el estado real de
// la base de datos (ver backend lib/verificacionPeriodo.ts) — no hay nada que marcar a mano, así
// que no puede quedar marcado sin ser cierto. Es un requisito DURO: el backend rechaza generar
// facturación (/generar/preview y /generar/iniciar) mientras algún paso esté en rojo.
export default function VerificacionPeriodoPanel({
  periodo,
  onEstadoCambia,
}: {
  periodo: string;
  onEstadoCambia?: (pasos: PasoVerificacionPeriodo[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pasos, setPasos] = useState<PasoVerificacionPeriodo[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const { mostrarError } = useToast();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const p = await api.facturacion.periodos.verificacion(periodo);
      setPasos(p);
      onEstadoCambia?.(p);
    } catch (err) {
      mostrarError(err, "no se pudo calcular la verificación");
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  useEffect(() => {
    setPasos(null);
    cargar();
  }, [cargar]);

  const completados = pasos?.filter((p) => p.ok).length ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="btn-accion flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <CheckSquare className="h-4 w-4" />
        Verificación{pasos ? ` (${completados}/${pasos.length})` : ""}
      </button>

      {abierto && (
        <div className="absolute right-0 z-20 mt-2 w-96 rounded-xl border border-brand-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              Verificación del periodo {periodo}
            </div>
            <button
              onClick={cargar}
              disabled={cargando}
              title="Recalcular"
              className="text-slate-500 dark:text-slate-400 hover:text-brand-600 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} />
            </button>
          </div>
          {pasos === null ? (
            <div className="flex items-center gap-2 py-4 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculando...
            </div>
          ) : (
            <ul className="space-y-2">
              {pasos.map((p) => (
                <li key={p.paso} className="flex items-start gap-2 text-sm">
                  {p.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                  )}
                  <div className="min-w-0">
                    <div className="text-slate-800 dark:text-slate-100">{p.etiqueta}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{p.detalle}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {pasos !== null && pasos.some((p) => !p.ok) && (
            <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-amber-700 dark:border-slate-800 dark:text-amber-400">
              No se puede generar la facturación de este periodo hasta que todo esté en verde.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
