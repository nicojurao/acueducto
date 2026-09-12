import { useEffect, useState } from "react";
import { ShieldAlert, AlertTriangle, FileText, Plus, X } from "lucide-react";
import { api, Suscriptor, CandidatoSuspension, SuspensionItem } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../components/ConfirmModal";
import { inputClass } from "../lib/ui";
import { SkeletonLista } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import BusquedaInput from "../components/BusquedaInput";

const fmtPesos = (n: number) => n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

const ESTADO_LABELS: Record<string, string> = {
  pendiente: "Pendiente de aprobar",
  aprobada: "Aprobada, lista para ejecutar",
  ejecutada: "Ejecutada (servicio suspendido)",
  reactivada: "Reactivada",
  cancelada: "Cancelada",
};
const ESTADO_COLORS: Record<string, string> = {
  pendiente: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  aprobada: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  ejecutada: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  reactivada: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  cancelada: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
};

// Suspensión del servicio (forzosa por mora o voluntaria de mutuo acuerdo) con el debido proceso
// que exige la Ley 142/1994 (Art. 140-141): el aviso previo con sus 4 elementos legales se genera
// solo, pero CADA paso (aprobar/ejecutar/reactivar) siempre lo confirma una persona a mano — nunca
// pasa nada automático. Ver backend/src/lib/suspensiones.ts para el texto del aviso y las fuentes
// normativas citadas.
export default function SuspensionesPage() {
  const { usuario } = useAuth();
  const { mostrar, mostrarError } = useToast();
  const { pedirConfirmacion, modal } = useConfirm();
  const puedeGestionar = usuario?.permisos?.includes("suspensiones_avanzado") ?? false;

  const [candidatos, setCandidatos] = useState<CandidatoSuspension[] | null>(null);
  const [suspensiones, setSuspensiones] = useState<SuspensionItem[]>([]);
  const [cargandoCandidatos, setCargandoCandidatos] = useState(true);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [avisoAbierto, setAvisoAbierto] = useState<SuspensionItem | null>(null);
  const [mostrarFormVoluntaria, setMostrarFormVoluntaria] = useState(false);
  const [accionCargo, setAccionCargo] = useState<{ id: number; accion: "ejecutar" | "reactivar" } | null>(null);
  const [valorCargoInput, setValorCargoInput] = useState("");

  function cargarCandidatos() {
    setCargandoCandidatos(true);
    api.suspensiones
      .candidatos()
      .then(setCandidatos)
      .catch((err) => mostrarError(err, "cargar los candidatos a suspensión"))
      .finally(() => setCargandoCandidatos(false));
  }
  function cargarLista() {
    setCargandoLista(true);
    api.suspensiones
      .listPaginado(1, 50, { estado: filtroEstado || undefined })
      .then((r) => setSuspensiones(r.data))
      .catch((err) => mostrarError(err, "cargar las suspensiones"))
      .finally(() => setCargandoLista(false));
  }
  useEffect(cargarCandidatos, []);
  useEffect(cargarLista, [filtroEstado]);

  function recargarTodo() {
    cargarCandidatos();
    cargarLista();
  }

  async function iniciarAviso(candidato: CandidatoSuspension) {
    try {
      await api.suspensiones.crear({
        suscriptorId: candidato.id,
        tipo: "mora",
        motivo: `Mora de ${candidato.facturasPendientes} facturas — saldo ${fmtPesos(candidato.saldoTotal)}`,
      });
      mostrar("Aviso previo generado — queda pendiente de aprobar");
      recargarTodo();
    } catch (err) {
      mostrarError(err, "generar el aviso");
    }
  }

  function aprobar(s: SuspensionItem) {
    pedirConfirmacion(
      `¿Aprobar esta suspensión? Confirma que ya pasó el plazo del aviso (5 días hábiles) y que se revisó el caso.`,
      async () => {
        await api.suspensiones.aprobar(s.id);
        recargarTodo();
      },
      { textoConfirmar: "Aprobar", textoExito: "Suspensión aprobada", variante: "normal" }
    );
  }

  async function ejecutar(s: SuspensionItem, valorCargoSuspension?: number) {
    try {
      await api.suspensiones.ejecutar(s.id, valorCargoSuspension);
      mostrar("Servicio suspendido");
      setAccionCargo(null);
      recargarTodo();
    } catch (err) {
      mostrarError(err, "ejecutar la suspensión");
    }
  }

  async function reactivar(s: SuspensionItem, valorCargoReconexion?: number) {
    try {
      await api.suspensiones.reactivar(s.id, valorCargoReconexion);
      mostrar("Servicio reactivado");
      setAccionCargo(null);
      recargarTodo();
    } catch (err) {
      mostrarError(err, "reactivar el servicio");
    }
  }

  function cancelar(s: SuspensionItem) {
    pedirConfirmacion(
      `¿Cancelar este trámite de suspensión sin ejecutarlo?`,
      async () => {
        await api.suspensiones.cancelar(s.id);
        recargarTodo();
      },
      { textoConfirmar: "Cancelar trámite", textoExito: "Trámite cancelado", variante: "normal" }
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-brand-600 dark:text-brand-400" />
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Suspensión del servicio</h1>
      </div>

      {puedeGestionar && (
        <>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
            <AlertTriangle className="h-4 w-4" />
            Candidatos a suspensión por mora (3+ facturas pendientes)
          </h2>
          {cargandoCandidatos ? (
            <SkeletonLista filas={3} />
          ) : !candidatos || candidatos.length === 0 ? (
            <EmptyState mensaje="No hay suscriptores que cumplan el mínimo legal de mora ahora mismo." icon={ShieldAlert} />
          ) : (
            <div className="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-3 py-2">Suscriptor</th>
                    <th className="px-3 py-2 text-right">Facturas pendientes</th>
                    <th className="px-3 py-2 text-right">Saldo</th>
                    <th className="px-3 py-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {candidatos.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                        {c.codigo} · {c.nombre}
                      </td>
                      <td className="px-3 py-2 text-right">{c.facturasPendientes}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtPesos(c.saldoTotal)}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => iniciarAviso(c)} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
                          Generar aviso previo
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Suspensiones</h2>
        <div className="flex items-center gap-2">
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className={inputClass}>
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          {puedeGestionar && (
            <button
              onClick={() => setMostrarFormVoluntaria((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500"
            >
              <Plus className="h-4 w-4" />
              Suspensión voluntaria
            </button>
          )}
        </div>
      </div>

      {mostrarFormVoluntaria && (
        <FormSuspensionVoluntaria
          onCreada={() => {
            setMostrarFormVoluntaria(false);
            recargarTodo();
          }}
          onCancelar={() => setMostrarFormVoluntaria(false)}
        />
      )}

      {cargandoLista ? (
        <SkeletonLista />
      ) : suspensiones.length === 0 ? (
        <EmptyState mensaje="No hay suspensiones registradas." icon={ShieldAlert} />
      ) : (
        <div className="space-y-3">
          {suspensiones.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {s.suscriptor.codigo} · {s.suscriptor.nombre}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {s.tipo === "mora" ? "Por mora" : "Voluntaria (mutuo acuerdo)"} · {s.motivo}
                    {s.pqr && ` · PQR ${s.pqr.numeroRadicado}`}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    Creada {new Date(s.createdAt).toLocaleDateString()}
                    {s.creadoPor && ` por ${s.creadoPor.nombre}`}
                    {s.aprobadaPor && ` · Aprobada por ${s.aprobadaPor.nombre}`}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_COLORS[s.estado]}`}>{ESTADO_LABELS[s.estado]}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {s.textoAviso && (
                  <button onClick={() => setAvisoAbierto(s)} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
                    <FileText className="h-3.5 w-3.5" />
                    Ver texto del aviso
                  </button>
                )}
                {puedeGestionar && s.estado === "pendiente" && (
                  <>
                    <button onClick={() => aprobar(s)} className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                      Aprobar
                    </button>
                    <button onClick={() => cancelar(s)} className="text-xs font-medium text-slate-500 hover:underline dark:text-slate-400">
                      Cancelar
                    </button>
                  </>
                )}
                {puedeGestionar && s.estado === "aprobada" && accionCargo?.id !== s.id && (
                  <>
                    <button
                      onClick={() => {
                        setAccionCargo({ id: s.id, accion: "ejecutar" });
                        setValorCargoInput("");
                      }}
                      className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                    >
                      Ejecutar suspensión
                    </button>
                    <button onClick={() => cancelar(s)} className="text-xs font-medium text-slate-500 hover:underline dark:text-slate-400">
                      Cancelar
                    </button>
                  </>
                )}
                {puedeGestionar && s.estado === "ejecutada" && accionCargo?.id !== s.id && (
                  <button
                    onClick={() => {
                      setAccionCargo({ id: s.id, accion: "reactivar" });
                      setValorCargoInput("");
                    }}
                    className="text-xs font-medium text-green-600 hover:underline dark:text-green-400"
                  >
                    Reactivar servicio
                  </button>
                )}
              </div>

              {accionCargo?.id === s.id && (
                <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/60">
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                    {accionCargo.accion === "ejecutar" ? "Cargo por suspensión (opcional)" : "Cargo por reconexión (opcional)"}
                    <input
                      type="number"
                      min="0"
                      value={valorCargoInput}
                      onChange={(e) => setValorCargoInput(e.target.value)}
                      placeholder="Déjalo vacío para no cobrar nada"
                      className={`${inputClass} w-56`}
                    />
                  </label>
                  <button
                    onClick={() =>
                      accionCargo.accion === "ejecutar"
                        ? ejecutar(s, valorCargoInput ? Number(valorCargoInput) : undefined)
                        : reactivar(s, valorCargoInput ? Number(valorCargoInput) : undefined)
                    }
                    className={`rounded-lg px-3 py-2 text-sm font-semibold text-white ${
                      accionCargo.accion === "ejecutar" ? "bg-red-600 hover:bg-red-500" : "bg-green-600 hover:bg-green-500"
                    }`}
                  >
                    {accionCargo.accion === "ejecutar" ? "Confirmar suspensión" : "Confirmar reactivación"}
                  </button>
                  <button
                    onClick={() => setAccionCargo(null)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {avisoAbierto && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => setAvisoAbierto(null)}>
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-slate-100">Aviso previo de suspensión</h3>
              <button onClick={() => setAvisoAbierto(null)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{avisoAbierto.textoAviso}</pre>
          </div>
        </div>
      )}
      {modal}
    </div>
  );
}

function FormSuspensionVoluntaria({ onCreada, onCancelar }: { onCreada: () => void; onCancelar: () => void }) {
  const { mostrar, mostrarError } = useToast();
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Suscriptor[]>([]);
  const [suscriptorElegido, setSuscriptorElegido] = useState<Suscriptor | null>(null);
  const [motivo, setMotivo] = useState("");
  const [radicadoPqr, setRadicadoPqr] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!busqueda.trim() || suscriptorElegido) {
      setResultados([]);
      return;
    }
    const t = setTimeout(() => {
      api.suscriptores.listPaginado(1, 5, { q: busqueda }).then((r) => setResultados(r.data));
    }, 250);
    return () => clearTimeout(t);
  }, [busqueda, suscriptorElegido]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!suscriptorElegido || !motivo.trim()) return;
    setGuardando(true);
    try {
      await api.suspensiones.crear({
        suscriptorId: suscriptorElegido.id,
        tipo: "mutuo_acuerdo",
        motivo: motivo.trim(),
        numeroRadicadoPqr: radicadoPqr.trim() || undefined,
      });
      mostrar("Solicitud de suspensión voluntaria creada");
      onCreada();
    } catch (err) {
      mostrarError(err, "crear la suspensión voluntaria");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={crear} className="mb-4 space-y-3 rounded-xl border border-brand-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="relative flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
        Suscriptor
        {suscriptorElegido ? (
          <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
            <span className="text-slate-900 dark:text-slate-100">
              {suscriptorElegido.codigo} · {suscriptorElegido.nombre}
            </span>
            <button type="button" onClick={() => setSuscriptorElegido(null)} className="text-xs text-brand-600 hover:underline dark:text-brand-400">
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <BusquedaInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por NUID o nombre..." />
            {resultados.length > 0 && (
              <div className="absolute top-full z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                {resultados.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSuscriptorElegido(s);
                      setResultados([]);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {s.codigo} · {s.nombre}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
        Motivo (lo que pidió el suscriptor)
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Predio deshabitado temporalmente" required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
        N.º de radicado de PQR (opcional)
        <input value={radicadoPqr} onChange={(e) => setRadicadoPqr(e.target.value)} className={inputClass} />
      </label>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando || !suscriptorElegido}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
        >
          {guardando ? "Guardando..." : "Crear solicitud"}
        </button>
      </div>
    </form>
  );
}
