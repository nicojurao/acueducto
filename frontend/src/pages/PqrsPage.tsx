import { useEffect, useRef, useState } from "react";
import { MessageSquareWarning, ChevronLeft, ChevronRight, FileBarChart, History, SlidersHorizontal } from "lucide-react";
import { api, PqrResumen, EstadoPqr } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useEsMovil } from "../lib/useEsMovil";
import { useFilasAutoajustadas } from "../lib/useFilasAutoajustadas";
import { inputClass } from "../lib/ui";
import EmptyState from "../components/EmptyState";
import { SkeletonTabla } from "../components/Skeleton";
import KpiCard from "../components/KpiCard";
import PqrDetalleModal from "../components/PqrDetalleModal";
import ReporteSuiPanel from "../components/ReporteSuiPanel";
import TrazabilidadPqrPanel from "../components/TrazabilidadPqrPanel";
import ParametrizacionPqrPanel from "../components/ParametrizacionPqrPanel";

const TAMANOS_PAGINA = [5, 10, 25, 50, 100];

const ESTADO_LABELS: Record<EstadoPqr, string> = {
  radicada: "Radicada",
  en_proceso: "En proceso",
  resuelta: "Resuelta",
  cerrada: "Cerrada",
};
const ESTADO_COLORS: Record<EstadoPqr, string> = {
  radicada: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  en_proceso: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  resuelta: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  cerrada: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
};

function fmtFechaHora(fecha: string): string {
  return new Date(fecha).toLocaleString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Paginacion({
  total,
  pagina,
  totalPaginas,
  setPagina,
}: {
  total: number;
  pagina: number;
  totalPaginas: number;
  setPagina: (fn: (p: number) => number) => void;
}) {
  if (total === 0) return null;
  return (
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
  );
}

export default function PqrsPage() {
  const { usuario } = useAuth();
  const puedeAvanzado = usuario?.permisos?.includes("pqrs_avanzado") ?? false;
  const [reporteSuiAbierto, setReporteSuiAbierto] = useState(false);
  const [trazabilidadAbierta, setTrazabilidadAbierta] = useState(false);
  const [parametrizacionAbierta, setParametrizacionAbierta] = useState(false);
  // Fuerza a remontar el panel (y con eso, a repetir su propio fetch del resumen) cada vez que
  // algo cambia en una PQR — si no, quedaba mostrando "sin clasificar" a alguien que lo acababa
  // de clasificar desde el modal, hasta que cambiara de mes a mano.
  const [reporteSuiKey, setReporteSuiKey] = useState(0);
  const [trazabilidadKey, setTrazabilidadKey] = useState(0);
  const esMovil = useEsMovil();
  const { contenedorRef, filas: filasAuto } = useFilasAutoajustadas(44, { minimo: esMovil ? 4 : 6 });
  const [porPaginaManual, setPorPaginaManual] = useState<number | null>(null);
  const porPagina = porPaginaManual ?? filasAuto;

  const [pqrs, setPqrs] = useState<PqrResumen[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [resumen, setResumen] = useState<Record<EstadoPqr, number> | null>(null);

  const [estadoFiltro, setEstadoFiltro] = useState<EstadoPqr | "">("");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [seleccionada, setSeleccionada] = useState<PqrResumen | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  function cargarResumen() {
    api.pqrs.resumen().then(setResumen);
  }
  useEffect(cargarResumen, []);

  // Ver el comentario del mismo patrón en AuditoriaPage: descarta respuestas que lleguen
  // desordenadas si el usuario cambia de filtro antes de que vuelva el pedido anterior.
  const peticionIdRef = useRef(0);
  function cargar() {
    const idPeticion = ++peticionIdRef.current;
    setCargando(true);
    api.pqrs
      .listPaginado(pagina, porPagina, {
        estado: estadoFiltro || undefined,
        q: debounced || undefined,
        fechaDesde: fechaDesde || undefined,
        fechaHasta: fechaHasta || undefined,
      })
      .then((r) => {
        if (idPeticion !== peticionIdRef.current) return;
        setPqrs(r.data);
        setTotal(r.total);
      })
      .finally(() => {
        if (idPeticion === peticionIdRef.current) setCargando(false);
      });
  }
  useEffect(cargar, [pagina, porPagina, estadoFiltro, debounced, fechaDesde, fechaHasta]);
  useEffect(() => setPagina(1), [estadoFiltro, debounced, fechaDesde, fechaHasta]);

  function abrirDetalle(p: PqrResumen) {
    api.pqrs.get(p.id).then(setSeleccionada);
  }

  function verPqrPorId(id: number) {
    api.pqrs.get(id).then(setSeleccionada);
  }

  function cerrarDetalle() {
    setSeleccionada(null);
  }

  function alCambiar() {
    cargar();
    cargarResumen();
    setReporteSuiKey((k) => k + 1);
    setTrazabilidadKey((k) => k + 1);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">PQRS</h1>
        {puedeAvanzado && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setReporteSuiAbierto((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <FileBarChart className="h-4 w-4" />
              Reporte SUI
            </button>
            <button
              onClick={() => setTrazabilidadAbierta((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <History className="h-4 w-4" />
              Trazabilidad
            </button>
            <button
              onClick={() => setParametrizacionAbierta((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Parametrización
            </button>
          </div>
        )}
      </div>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        Peticiones, quejas, reclamos y sugerencias radicadas por el público en pqrs.acbum.com.co. Primero las que
        faltan por responder (la más antigua arriba), luego las resueltas más recientes. Haz clic en una fila para
        ver el detalle, cambiar el estado y registrar una respuesta.
      </p>

      {reporteSuiAbierto && <ReporteSuiPanel key={reporteSuiKey} onVerPqr={verPqrPorId} />}
      {trazabilidadAbierta && <TrazabilidadPqrPanel key={trazabilidadKey} onVerPqr={verPqrPorId} />}
      {parametrizacionAbierta && <ParametrizacionPqrPanel />}

      {resumen && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {(Object.keys(ESTADO_LABELS) as EstadoPqr[]).map((estado) => (
            <KpiCard
              key={estado}
              label={ESTADO_LABELS[estado]}
              value={String(resumen[estado] ?? 0)}
              onClick={() => setEstadoFiltro(estado)}
              icon={MessageSquareWarning}
            />
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          placeholder="Buscar por radicado, nombre, documento o NUID..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${inputClass} w-full max-w-xs`}
        />
        <select
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value as EstadoPqr | "")}
          className={inputClass}
        >
          <option value="">Todos los estados</option>
          {(Object.keys(ESTADO_LABELS) as EstadoPqr[]).map((estado) => (
            <option key={estado} value={estado}>
              {ESTADO_LABELS[estado]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          Desde
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className={inputClass} />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          Hasta
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className={inputClass} />
        </label>
        {(fechaDesde || fechaHasta) && (
          <button
            onClick={() => {
              setFechaDesde("");
              setFechaHasta("");
            }}
            className="text-xs font-medium text-slate-500 hover:underline dark:text-slate-400"
          >
            Limpiar fechas
          </button>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          Mostrar
          <select
            value={porPagina}
            onChange={(e) => setPorPaginaManual(Number(e.target.value))}
            className={inputClass}
          >
            {[...new Set([porPagina, ...TAMANOS_PAGINA])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div ref={contenedorRef} />
      {cargando ? (
        <SkeletonTabla columnas={5} filas={porPagina} />
      ) : pqrs.length === 0 ? (
        <EmptyState mensaje="No hay PQRS registradas con estos filtros." icon={MessageSquareWarning} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-brand-100 bg-brand-50 text-xs uppercase text-brand-800 dark:border-slate-800 dark:bg-transparent dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Radicado</th>
                <th className="px-4 py-2.5">Nombre</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Documento</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {pqrs.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => abrirDetalle(p)}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                    {p.numeroRadicado ?? `#${p.id}`}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{p.nombre}</td>
                  <td className="hidden px-4 py-2.5 text-slate-700 dark:text-slate-400 md:table-cell">
                    {p.documento ?? "-"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_COLORS[p.estado]}`}>
                      {ESTADO_LABELS[p.estado]}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-2.5 text-slate-700 dark:text-slate-400 sm:table-cell">
                    {fmtFechaHora(p.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && <Paginacion total={total} pagina={pagina} totalPaginas={totalPaginas} setPagina={setPagina} />}

      {seleccionada && <PqrDetalleModal pqr={seleccionada} onClose={cerrarDetalle} onCambio={alCambiar} />}
    </div>
  );
}
