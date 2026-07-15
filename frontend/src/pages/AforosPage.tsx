import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Waves, Plus, Trash2, ChevronLeft, ChevronRight, Image as ImageIcon, FileText, Gauge, MapPin, Activity, AlertTriangle } from "lucide-react";
import { api, Aforo, AforoKpis, PuntoAforo, urlFoto } from "../api/client";
import AforoModal from "../components/AforoModal";
import ListCard from "../components/ListCard";
import KpiCard from "../components/KpiCard";
import ChartCard from "../components/ChartCard";
import { useConfirm, useErrorHandler } from "../components/ConfirmModal";
import { useEsMovil } from "../lib/useEsMovil";
import { SkeletonLista } from "../components/Skeleton";
import { inputClass } from "../lib/ui";
import EmptyState from "../components/EmptyState";

const GRID_STROKE = "#475569";

// Paleta cualitativa para distinguir las series (una por punto de aforo) en la gráfica de
// tendencia. No es el azul de marca a propósito: forzar un solo color haría indistinguibles
// los puntos entre sí.
const COLORES_SERIE = ["#00487f", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6", "#ec4899"];

function DashboardTab() {
  const [meses, setMeses] = useState(12);
  const [kpis, setKpis] = useState<AforoKpis | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    api.aforos
      .kpis(meses)
      .then(setKpis)
      .finally(() => setCargando(false));
  }, [meses]);

  if (cargando && !kpis) return <SkeletonLista />;
  if (!kpis) return null;

  const fmtCaudal = (n: number | null) => (n === null ? "—" : `${n.toFixed(2)} L/s`);
  const fmtFecha = (f: string | null) => (f ? new Date(f).toLocaleDateString() : "—");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-1 rounded-full border border-slate-200 p-1 dark:border-slate-800">
          {([6, 12, 24] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMeses(m)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                meses === m ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {m} meses
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Puntos de aforo" value={`${kpis.puntosActivos}/${kpis.totalPuntos}`} hint="activos / total" icon={MapPin} />
        <KpiCard label="Registros en el periodo" value={String(kpis.totalRegistros)} icon={Activity} />
        <KpiCard label="Caudal promedio" value={fmtCaudal(kpis.caudalPromedio)} icon={Gauge} />
        <KpiCard
          label="Último caudal"
          value={fmtCaudal(kpis.ultimoCaudal)}
          hint={kpis.ultimoPunto ? `${kpis.ultimoPunto} · ${fmtFecha(kpis.ultimaFecha)}` : undefined}
          icon={Waves}
        />
      </div>

      {kpis.alertasCaudalBajo.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            Alertas de caudal bajo
          </div>
          <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-200">
            {kpis.alertasCaudalBajo.map((a) => (
              <li key={a.puntoAforoId}>
                <span className="font-medium">{a.nombre}</span>: {a.ultimoCaudal.toFixed(2)} L/s
                {" "}(promedio {a.promedio.toFixed(2)} L/s) · {fmtFecha(a.ultimaFecha)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ChartCard title={`Tendencia de caudal por punto (últimos ${kpis.meses} meses)`} span>
        {kpis.tendencia.length === 0 || kpis.nombresPuntos.length === 0 ? (
          <EmptyState mensaje="No hay aforos registrados en el periodo seleccionado." className="border-none" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={kpis.tendencia}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} opacity={0.2} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit=" L/s" width={60} />
              <Tooltip formatter={(v: number) => `${v} L/s`} />
              <Legend />
              {kpis.nombresPuntos.map((nombre, i) => (
                <Line
                  key={nombre}
                  type="monotone"
                  dataKey={nombre}
                  stroke={COLORES_SERIE[i % COLORES_SERIE.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-brand-100 bg-brand-50 text-xs uppercase text-brand-800 dark:border-slate-800 dark:bg-transparent dark:text-slate-400">
            <tr>
              <th className="px-4 py-2.5">Punto de aforo</th>
              <th className="px-4 py-2.5">Último caudal</th>
              <th className="px-4 py-2.5">Promedio</th>
              <th className="px-4 py-2.5">Registros</th>
              <th className="px-4 py-2.5">Última medición</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {kpis.resumenPorPunto.map((p) => (
              <tr key={p.puntoAforoId}>
                <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{p.nombre}</td>
                <td className="px-4 py-2.5 text-slate-700 dark:text-slate-400">{fmtCaudal(p.ultimoCaudal)}</td>
                <td className="px-4 py-2.5 text-slate-700 dark:text-slate-400">{fmtCaudal(p.promedio)}</td>
                <td className="px-4 py-2.5 text-slate-700 dark:text-slate-400">{p.registros}</td>
                <td className="px-4 py-2.5 text-slate-700 dark:text-slate-400">{fmtFecha(p.ultimaFecha)}</td>
              </tr>
            ))}
            {kpis.resumenPorPunto.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6">
                  <EmptyState mensaje="No hay aforos registrados en el periodo seleccionado." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const METODO_LABELS: Record<string, string> = { volumetrico: "Volumétrico", flotador: "Flotador" };

function PuntosTab({ puntos, recargar }: { puntos: PuntoAforo[]; recargar: () => void }) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [creando, setCreando] = useState(false);
  const { pedirConfirmacion, modal } = useConfirm();
  const { error, run } = useErrorHandler();

  async function crear() {
    if (!nombre.trim()) return;
    await run(async () => {
      await api.puntosAforo.create({ nombre: nombre.trim(), descripcion: descripcion.trim() || undefined });
      setNombre("");
      setDescripcion("");
      setCreando(false);
      recargar();
    });
  }

  function eliminar(p: PuntoAforo) {
    pedirConfirmacion(`¿Eliminar el punto de aforo "${p.nombre}"?`, async () => {
      await run(() => api.puntosAforo.remove(p.id));
      recargar();
    });
  }

  return (
    <div>
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="mb-4">
        {creando ? (
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-brand-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Nombre</span>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} autoFocus />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Descripción (opcional)</span>
              <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={inputClass} />
            </label>
            <button onClick={crear} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500">
              Guardar
            </button>
            <button
              onClick={() => setCreando(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreando(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
          >
            <Plus className="h-4 w-4" />
            Nuevo punto de aforo
          </button>
        )}
      </div>

      <div className="hidden md:block overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-brand-100 bg-brand-50 text-xs uppercase text-brand-800 dark:border-slate-800 dark:bg-transparent dark:text-slate-400">
            <tr>
              <th className="px-4 py-2.5">Nombre</th>
              <th className="px-4 py-2.5">Descripción</th>
              <th className="px-4 py-2.5">Registros</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {puntos.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{p.nombre}</td>
                <td className="px-4 py-2.5 text-slate-700 dark:text-slate-400">{p.descripcion ?? "-"}</td>
                <td className="px-4 py-2.5 text-slate-700 dark:text-slate-400">{p.registros ?? 0}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => eliminar(p)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {puntos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-600">
                  Todavía no hay puntos de aforo registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {puntos.map((p) => (
          <ListCard key={p.id}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-800 dark:text-slate-100">{p.nombre}</div>
                {p.descripcion && (
                  <div className="truncate text-xs text-slate-600 dark:text-slate-400">{p.descripcion}</div>
                )}
                <div className="text-xs text-slate-600 dark:text-slate-400">{p.registros ?? 0} registros</div>
              </div>
              <button onClick={() => eliminar(p)} className="shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </ListCard>
        ))}
        {puntos.length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-slate-600">Todavía no hay puntos de aforo registrados.</p>
        )}
      </div>
      {modal}
    </div>
  );
}

function RegistrosTab({ puntos }: { puntos: PuntoAforo[] }) {
  const esMovil = useEsMovil();
  const porPagina = esMovil ? 5 : 10;
  const [puntoFiltro, setPuntoFiltro] = useState<number | "">("");
  const [filas, setFilas] = useState<Aforo[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const { pedirConfirmacion, modal } = useConfirm();
  const { error, run } = useErrorHandler();

  async function cargar() {
    setCargando(true);
    try {
      const resultado = await api.aforos.listPaginado(pagina, porPagina, puntoFiltro || undefined);
      setFilas(resultado.data);
      setTotal(resultado.total);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, porPagina, puntoFiltro]);

  useEffect(() => setPagina(1), [puntoFiltro]);

  function eliminar(a: Aforo) {
    pedirConfirmacion("¿Eliminar este registro de aforo?", async () => {
      await run(() => api.aforos.remove(a.id));
      cargar();
    });
  }

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <div>
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={puntoFiltro} onChange={(e) => setPuntoFiltro(e.target.value ? Number(e.target.value) : "")} className={inputClass}>
          <option value="">Todos los puntos</option>
          {puntos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <button
          onClick={() => setModalAbierto(true)}
          disabled={puntos.length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          Nuevo registro
        </button>
      </div>

      {cargando ? (
        <SkeletonLista />
      ) : filas.length === 0 ? (
        <EmptyState mensaje={`No hay registros de aforo${puntoFiltro ? " para este punto" : ""}.`} />
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {filas.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {a.puntoAforo?.nombre} · {Number(a.caudalLps).toFixed(2)} L/s
                </div>
                <div className="text-xs text-slate-700 dark:text-slate-400">
                  {new Date(a.fecha).toLocaleDateString()}{" "}
                  {new Date(a.fecha).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
                  {METODO_LABELS[a.metodo]}
                  {a.metodo === "flotador" && a.distanciaMetros && a.tiempoSegundos
                    ? ` · ${(Number(a.distanciaMetros) / Number(a.tiempoSegundos)).toFixed(3)} m/s`
                    : ""}
                  {a.capturadoPor ? ` · ${a.capturadoPor.nombre}` : ""}
                </div>
              </div>
              {a.fotoUrl && (
                <a href={urlFoto(a.fotoUrl)} target="_blank" rel="noreferrer" className="shrink-0 text-slate-600 hover:text-brand-600">
                  <ImageIcon className="h-4 w-4" />
                </a>
              )}
              <button
                onClick={() => api.aforos.verPdf(a.id)}
                className="shrink-0 rounded-lg p-1.5 text-slate-600 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/10"
                title="Ver PDF"
              >
                <FileText className="h-4 w-4" />
              </button>
              <button onClick={() => eliminar(a)} className="shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!cargando && total > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-700 dark:text-slate-400 sm:mt-4">
          <span>
            {total} resultado{total === 1 ? "" : "s"} · página {pagina} de {totalPaginas}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina <= 1}
              className="flex items-center gap-1 rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Anterior
            </button>
            <button
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={pagina >= totalPaginas}
              className="flex items-center gap-1 rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Siguiente
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {modalAbierto && (
        <AforoModal
          puntos={puntos}
          puntoInicial={puntoFiltro || undefined}
          onClose={() => setModalAbierto(false)}
          onCambio={cargar}
        />
      )}
      {modal}
    </div>
  );
}

export default function AforosPage() {
  const [tab, setTab] = useState<"dashboard" | "registros" | "puntos">("dashboard");
  const [puntos, setPuntos] = useState<PuntoAforo[]>([]);

  async function cargarPuntos() {
    setPuntos(await api.puntosAforo.list());
  }

  useEffect(() => {
    cargarPuntos();
  }, []);

  return (
    <div>
      <h1 className="mb-3 flex items-center gap-2 text-xl font-bold sm:mb-5 sm:text-2xl">
        <Waves className="h-6 w-6 text-brand-500" />
        Aforos
      </h1>

      <div className="mb-4 flex items-center gap-1 rounded-full border border-slate-200 p-1 dark:border-slate-800 w-fit">
        {(
          [
            ["dashboard", "Dashboard"],
            ["registros", "Registros de aforo"],
            ["puntos", "Puntos de aforo"],
          ] as [typeof tab, string][]
        ).map(([valor, etiqueta]) => (
          <button
            key={valor}
            onClick={() => setTab(valor)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === valor
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <DashboardTab />}
      {tab === "registros" && <RegistrosTab puntos={puntos} />}
      {tab === "puntos" && <PuntosTab puntos={puntos} recargar={cargarPuntos} />}
    </div>
  );
}
