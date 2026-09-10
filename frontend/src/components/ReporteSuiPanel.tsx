import { useEffect, useState } from "react";
import { FileDown, AlertTriangle } from "lucide-react";
import { api, ResumenSui } from "../api/client";
import { inputClass } from "../lib/ui";
import { useToast } from "../contexts/ToastContext";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Genera el archivo del "Formato A" que pide el SUI mensualmente (Resolución SSPD
// 20151300054575 de 2015, Anexo A, modificado por la 20188000076635 de 2018). Antes de descargar,
// muestra cuántas PQR del período están listas y cuáles faltan por clasificar — el generador del
// backend (ver comercial/pqrs.ts) omite del archivo cualquier PQR sin clasificación completa, en
// vez de subir al SUI una fila con columnas a medias.
export default function ReporteSuiPanel({ onVerPqr }: { onVerPqr: (id: number) => void }) {
  const hoy = new Date();
  // Por defecto el mes anterior: el reporte se sube durante los primeros días hábiles del mes
  // siguiente al período que reporta (Artículo Segundo de la Resolución), así que normalmente lo
  // que se va a generar es el mes que acaba de cerrar, no el actual (todavía incompleto).
  const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const [anio, setAnio] = useState(mesAnterior.getFullYear());
  const [mes, setMes] = useState(mesAnterior.getMonth() + 1);
  const [resumen, setResumen] = useState<ResumenSui | null>(null);
  const [cargando, setCargando] = useState(true);
  const [descargando, setDescargando] = useState(false);
  const { mostrarError } = useToast();

  useEffect(() => {
    setCargando(true);
    api.pqrs
      .resumenSui(anio, mes)
      .then(setResumen)
      .catch((err) => mostrarError(err, "no se pudo calcular el resumen del período"))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio, mes]);

  async function descargar() {
    setDescargando(true);
    try {
      await api.pqrs.descargarReporteSui(anio, mes);
    } catch (err) {
      mostrarError(err, "no se pudo descargar el reporte");
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Reporte mensual para el SUI</h3>
      <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
        Archivo del "Formato A" (Resolución SSPD 20151300054575) con las PQR radicadas, respondidas o pendientes del
        período elegido, listo para subir al SUI.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className={inputClass}>
          {MESES.map((nombre, i) => (
            <option key={nombre} value={i + 1}>
              {nombre}
            </option>
          ))}
        </select>
        <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className={inputClass}>
          {[hoy.getFullYear(), hoy.getFullYear() - 1].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {cargando ? (
        <p className="text-sm text-slate-500 dark:text-slate-500">Calculando...</p>
      ) : (
        resumen && (
          <>
            <p className="mb-2 text-sm text-slate-700 dark:text-slate-300">
              {resumen.total} PQR en el período · <strong>{resumen.listas}</strong> lista{resumen.listas === 1 ? "" : "s"}{" "}
              para el reporte
              {resumen.incompletas.length > 0 && (
                <>
                  {" "}
                  · <strong className="text-amber-600 dark:text-amber-400">{resumen.incompletas.length} sin clasificar</strong>
                </>
              )}
            </p>

            {resumen.incompletas.length > 0 && (
              <div className="mb-3 rounded-lg bg-amber-50 p-3 dark:bg-amber-500/10">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  No se incluyen hasta que se clasifiquen (tipo de trámite, causal y detalle; si ya tienen respuesta,
                  también tipo de respuesta y de notificación):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {resumen.incompletas.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onVerPqr(p.id)}
                      className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:hover:bg-amber-500/25"
                    >
                      {p.numeroRadicado ?? `#${p.id}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={descargar}
              disabled={descargando || resumen.listas === 0}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
            >
              <FileDown className="h-4 w-4" />
              {descargando ? "Descargando..." : `Descargar CSV (${resumen.listas} PQR)`}
            </button>
          </>
        )
      )}
    </div>
  );
}
