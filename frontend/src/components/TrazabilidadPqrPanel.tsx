import { useEffect, useRef, useState } from "react";
import { FileDown, History } from "lucide-react";
import { api, PqrTrazabilidadItem } from "../api/client";
import { inputClass } from "../lib/ui";
import { useToast } from "../contexts/ToastContext";

const LIMITE = 15;

function fmtFechaHora(fecha: string): string {
  return new Date(fecha).toLocaleString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Auditoría de quién respondió/aclaró cada PQR, con fecha y hora — separado del hilo de cada PQR
// individual (ver PqrDetalleModal) para poder verlo de un vistazo, filtrar por funcionario o rango
// de fechas, y exportarlo.
export default function TrazabilidadPqrPanel({ onVerPqr }: { onVerPqr: (id: number) => void }) {
  const { mostrarError } = useToast();
  const [items, setItems] = useState<PqrTrazabilidadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [funcionarios, setFuncionarios] = useState<string[]>([]);
  const [funcionario, setFuncionario] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [cargando, setCargando] = useState(true);
  const [descargando, setDescargando] = useState(false);

  // Mismo patrón que PqrsPage/AuditoriaPage: descarta respuestas que lleguen desordenadas si el
  // usuario cambia de filtro antes de que vuelva el pedido anterior.
  const peticionIdRef = useRef(0);
  function cargar() {
    const idPeticion = ++peticionIdRef.current;
    setCargando(true);
    api.pqrs
      .trazabilidad(pagina, LIMITE, {
        fechaDesde: fechaDesde || undefined,
        fechaHasta: fechaHasta || undefined,
        funcionario: funcionario || undefined,
      })
      .then((r) => {
        if (idPeticion !== peticionIdRef.current) return;
        setItems(r.data);
        setTotal(r.total);
        setFuncionarios(r.funcionarios);
      })
      .catch((err) => mostrarError(err, "no se pudo cargar la trazabilidad"))
      .finally(() => {
        if (idPeticion === peticionIdRef.current) setCargando(false);
      });
  }
  useEffect(cargar, [pagina, funcionario, fechaDesde, fechaHasta]);
  useEffect(() => setPagina(1), [funcionario, fechaDesde, fechaHasta]);

  async function descargar() {
    setDescargando(true);
    try {
      await api.pqrs.descargarTrazabilidadCsv({
        fechaDesde: fechaDesde || undefined,
        fechaHasta: fechaHasta || undefined,
        funcionario: funcionario || undefined,
      });
    } catch (err) {
      mostrarError(err, "no se pudo descargar el reporte");
    } finally {
      setDescargando(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE));

  return (
    <div className="mb-4 rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
        <History className="h-4 w-4 text-brand-500" />
        Trazabilidad de respuestas
      </h3>
      <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
        Qué funcionario respondió o aclaró cada PQR, con fecha y hora. Haz clic en una fila para ver la PQR completa.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={funcionario} onChange={(e) => setFuncionario(e.target.value)} className={`${inputClass} text-xs`}>
          <option value="">Todos los funcionarios</option>
          {funcionarios.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          Desde
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className={`${inputClass} text-xs`} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          Hasta
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className={`${inputClass} text-xs`} />
        </label>
        <button
          onClick={descargar}
          disabled={descargando || total === 0}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <FileDown className="h-3.5 w-3.5" />
          {descargando ? "Descargando..." : "Exportar CSV"}
        </button>
      </div>

      {cargando ? (
        <p className="text-sm text-slate-500 dark:text-slate-500">Cargando...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-500">No hay respuestas registradas con estos filtros.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-2 py-1.5">Radicado</th>
                  <th className="px-2 py-1.5">Funcionario</th>
                  <th className="px-2 py-1.5">Tipo</th>
                  <th className="px-2 py-1.5">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => onVerPqr(m.pqrId)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <td className="whitespace-nowrap px-2 py-1.5 font-medium text-slate-800 dark:text-slate-100">
                      {m.pqr.numeroRadicado ?? `#${m.pqrId}`}
                    </td>
                    <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{m.autorNombre ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          m.esRespuestaFinal
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                            : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400"
                        }`}
                      >
                        {m.esRespuestaFinal ? "Respuesta final" : "Aclaración"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-700 dark:text-slate-400">{fmtFechaHora(m.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>
              {total} resultado{total === 1 ? "" : "s"} · página {pagina} de {totalPaginas}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina <= 1}
                className="rounded-lg border border-slate-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
              >
                Anterior
              </button>
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagina >= totalPaginas}
                className="rounded-lg border border-slate-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
              >
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
