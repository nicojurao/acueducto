import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  Users,
  Upload,
  ChevronLeft,
  ChevronRight,
  X,
  SlidersHorizontal,
  MapPin,
  Plus,
  Trash2,
  Pencil,
  Download,
} from "lucide-react";
import {
  api,
  Suscriptor,
  Barrio,
  Estrato,
  ESTADO_FACTURACION_LABELS,
  ESTADO_FACTURACION_COLORS,
  ESTADO_PREDIO_LABELS,
  ESTADO_PREDIO_COLORS,
  cargarEstratos,
} from "../api/client";
import SuscriptorDetailModal from "../components/SuscriptorDetailModal";
import ImportExcelModal from "../components/ImportExcelModal";
import { useConfirm, useErrorHandler } from "../components/ConfirmModal";
import { useEsMovil } from "../lib/useEsMovil";
import { SkeletonTabla } from "../components/Skeleton";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500";

const TAMANOS_PAGINA = [5, 10, 25, 50, 100];

const TABS = [
  { id: "listado", label: "Listado" },
  { id: "barrios", label: "Barrios y estratos" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function SuscriptoresPage() {
  const [tab, setTab] = useState<TabId>("listado");

  return (
    <div>
      <h1 className="mb-3 flex items-center gap-2 text-xl font-bold sm:mb-5 sm:text-2xl">
        <Users className="h-6 w-6 text-brand-500" />
        Suscriptores
      </h1>

      <div className="mb-4 flex gap-2 border-b border-slate-200 dark:border-slate-800 sm:mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-slate-700 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "listado" && <ListadoTab />}
      {tab === "barrios" && <BarriosEstratosTab />}
    </div>
  );
}

function ListadoTab() {
  const [searchParams] = useSearchParams();
  const esMovil = useEsMovil();
  const [suscriptores, setSuscriptores] = useState<Suscriptor[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(() => (esMovil ? 5 : 10));
  const [filtro, setFiltro] = useState("");
  const [filtroDebounced, setFiltroDebounced] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState(searchParams.get("estado") ?? "");
  const [barrioFiltro, setBarrioFiltro] = useState("");
  const [estratoFiltro, setEstratoFiltro] = useState("");
  const [estadoPredioFiltro, setEstadoPredioFiltro] = useState("");
  const [barrios, setBarrios] = useState<{ id: number; nombre: string }[]>([]);
  const [estratos, setEstratos] = useState<Estrato[]>([]);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [importAbierto, setImportAbierto] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());

  function alternarSeleccion(id: number) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function alternarSeleccionTodos() {
    setSeleccionados((prev) =>
      prev.size === suscriptores.length ? new Set() : new Set(suscriptores.map((s) => s.id))
    );
  }

  useEffect(() => {
    api.suscriptores.barrios().then(setBarrios);
    api.estratos.list().then(setEstratos);
  }, []);

  // Llegar acá con ?suscriptorId=123 (ej. desde "Medidores" al abrir uno instalado) abre de una
  // vez la ficha de ese suscriptor, sin esperar a que aparezca en la tabla paginada/filtrada.
  useEffect(() => {
    const sid = searchParams.get("suscriptorId");
    if (sid) setDetalleId(Number(sid));
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => setFiltroDebounced(filtro), 300);
    return () => clearTimeout(t);
  }, [filtro]);

  useEffect(() => {
    setPagina(1);
  }, [filtroDebounced, estadoFiltro, barrioFiltro, estratoFiltro, estadoPredioFiltro, porPagina]);

  async function cargar() {
    setCargando(true);
    const resultado = await api.suscriptores.listPaginado(pagina, porPagina, {
      q: filtroDebounced,
      estadoFacturacion: estadoFiltro,
      barrioId: barrioFiltro ? Number(barrioFiltro) : undefined,
      estratoId: estratoFiltro ? Number(estratoFiltro) : undefined,
      estadoPredio: estadoPredioFiltro,
    });
    setSuscriptores(resultado.data);
    setTotal(resultado.total);
    setSeleccionados(new Set());
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, porPagina, filtroDebounced, estadoFiltro, barrioFiltro, estratoFiltro, estadoPredioFiltro]);

  function limpiarFiltros() {
    setFiltro("");
    setEstadoFiltro("");
    setBarrioFiltro("");
    setEstratoFiltro("");
    setEstadoPredioFiltro("");
  }

  const hayFiltrosActivos =
    filtro !== "" || estadoFiltro !== "" || barrioFiltro !== "" || estratoFiltro !== "" || estadoPredioFiltro !== "";
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-4">
        <button
          onClick={() => setImportAbierto((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Upload className="h-4 w-4" />
          Importar / exportar Excel
        </button>
        {seleccionados.size > 0 && (
          <button
            onClick={() => api.suscriptores.export([...seleccionados])}
            className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download className="h-4 w-4" />
            Exportar seleccionados ({seleccionados.size})
          </button>
        )}
      </div>

      {importAbierto && (
        <ImportExcelModal
          titulo="Importar suscriptores desde Excel"
          descripcion="Esta es la única forma de agregar suscriptores nuevos. La clave es siempre el NUID: si ya existe, se actualizan los campos que vengan llenos en la fila; si no existe, se crea. Antes de importar, el archivo se valida (barrios y estratos contra el catálogo, NUID repetido, etc.)."
          nombreReporte="suscriptores_con_observaciones.xlsx"
          onExportarPlantilla={() => api.suscriptores.export()}
          onValidar={(file) => api.suscriptores.validarImport(file)}
          onImportar={(file) => api.suscriptores.import(file)}
          onCerrar={() => setImportAbierto(false)}
          onImportado={() => cargar()}
        />
      )}

      <div className="mb-3 flex flex-col gap-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-slate-600" />
          <input
            placeholder="Buscar por nombre, NUID o ruta..."
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className={`${inputClass} w-full max-w-sm`}
          />
          <button
            onClick={() => setFiltrosAbiertos((v) => !v)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {hayFiltrosActivos && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
          </button>
        </div>
        <div className={`${filtrosAbiertos ? "flex" : "hidden"} flex-wrap items-center gap-3 md:flex`}>
          <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} className={inputClass}>
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_FACTURACION_LABELS).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
          <select value={barrioFiltro} onChange={(e) => setBarrioFiltro(e.target.value)} className={inputClass}>
            <option value="">Todos los barrios</option>
            {barrios.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
          <select value={estratoFiltro} onChange={(e) => setEstratoFiltro(e.target.value)} className={inputClass}>
            <option value="">Todos los estratos</option>
            {estratos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.codigo} — {e.etiqueta}
              </option>
            ))}
          </select>
          <select
            value={estadoPredioFiltro}
            onChange={(e) => setEstadoPredioFiltro(e.target.value)}
            className={inputClass}
          >
            <option value="">Predio: todos</option>
            {Object.entries(ESTADO_PREDIO_LABELS).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            Mostrar
            <select
              value={porPagina}
              onChange={(e) => setPorPagina(Number(e.target.value))}
              className={inputClass}
            >
              {TAMANOS_PAGINA.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {hayFiltrosActivos && (
            <button
              onClick={limpiarFiltros}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {cargando ? (
        <SkeletonTabla columnas={7} filas={porPagina} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-800 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <th className="w-8 px-3 py-2 sm:px-4 sm:py-3">
                    <input
                      type="checkbox"
                      checked={suscriptores.length > 0 && seleccionados.size === suscriptores.length}
                      onChange={alternarSeleccionTodos}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </th>
                  <th className="px-3 py-2 font-medium sm:px-4 sm:py-3">NUID</th>
                  <th className="px-3 py-2 font-medium sm:px-4 sm:py-3">Nombre</th>
                  <th className="px-3 py-2 font-medium sm:px-4 sm:py-3">Ruta</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Barrio</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Estrato</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Predio</th>
                  <th className="px-3 py-2 font-medium sm:px-4 sm:py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {suscriptores.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setDetalleId(s.id)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-1.5 sm:px-4 sm:py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={seleccionados.has(s.id)}
                        onChange={() => alternarSeleccion(s.id)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>
                    <td className="px-3 py-1.5 sm:px-4 sm:py-2.5">{s.codigo}</td>
                    <td className="px-3 py-1.5 sm:px-4 sm:py-2.5">{s.nombre}</td>
                    <td className="px-3 py-1.5 sm:px-4 sm:py-2.5">{s.ruta ?? "-"}</td>
                    <td className="hidden px-4 py-2.5 md:table-cell">{s.barrioCat?.nombre ?? "-"}</td>
                    <td className="hidden px-4 py-2.5 md:table-cell">
                      {s.estratoCat ? `${s.estratoCat.codigo} — ${s.estratoCat.etiqueta}` : "-"}
                    </td>
                    <td className="hidden px-4 py-2.5 md:table-cell">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_PREDIO_COLORS[s.estadoPredio]}`}>
                        {ESTADO_PREDIO_LABELS[s.estadoPredio]}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 sm:px-4 sm:py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          ESTADO_FACTURACION_COLORS[s.estadoFacturacion]
                        }`}
                      >
                        {ESTADO_FACTURACION_LABELS[s.estadoFacturacion]}
                      </span>
                    </td>
                  </tr>
                ))}
                {suscriptores.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-slate-600">
                      Sin resultados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 sm:mt-4">
            <span className="text-xs text-slate-700 dark:text-slate-400">
              {total === 0
                ? "0 resultados"
                : `${(pagina - 1) * porPagina + 1}–${Math.min(pagina * porPagina, total)} de ${total}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina <= 1}
                className="flex items-center gap-1 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </button>
              <span className="text-xs text-slate-700 dark:text-slate-400">
                Página {pagina} de {totalPaginas}
              </span>
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagina >= totalPaginas}
                className="flex items-center gap-1 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Siguiente
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}

      {detalleId !== null && (
        <SuscriptorDetailModal
          suscriptorId={detalleId}
          onClose={() => {
            setDetalleId(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function BarriosEstratosTab() {
  const [barrios, setBarrios] = useState<Barrio[]>([]);
  const [estratos, setEstratos] = useState<Estrato[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nuevoBarrio, setNuevoBarrio] = useState("");
  const [creando, setCreando] = useState(false);
  const [nuevoEstratoCodigo, setNuevoEstratoCodigo] = useState("");
  const [nuevoEstratoEtiqueta, setNuevoEstratoEtiqueta] = useState("");
  const [creandoEstrato, setCreandoEstrato] = useState(false);
  const [editandoBarrioId, setEditandoBarrioId] = useState<number | null>(null);
  const [editBarrioNombre, setEditBarrioNombre] = useState("");
  const [editandoEstratoId, setEditandoEstratoId] = useState<number | null>(null);
  const [editEstratoCodigo, setEditEstratoCodigo] = useState("");
  const [editEstratoEtiqueta, setEditEstratoEtiqueta] = useState("");
  const { error, run } = useErrorHandler();
  const { error: errorEstrato, run: runEstrato } = useErrorHandler();
  const { pedirConfirmacion, modal } = useConfirm();

  async function cargar() {
    setCargando(true);
    const [b, e] = await Promise.all([api.barrios.list(), api.estratos.list()]);
    setBarrios(b);
    setEstratos(e);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crearBarrio(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoBarrio.trim()) return;
    setCreando(true);
    await run(async () => {
      await api.barrios.create(nuevoBarrio.trim());
      setNuevoBarrio("");
      await cargar();
    });
    setCreando(false);
  }

  async function crearEstrato(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoEstratoCodigo.trim() || !nuevoEstratoEtiqueta.trim()) return;
    setCreandoEstrato(true);
    await runEstrato(async () => {
      await api.estratos.create(nuevoEstratoCodigo.trim(), nuevoEstratoEtiqueta.trim());
      setNuevoEstratoCodigo("");
      setNuevoEstratoEtiqueta("");
      await cargarEstratos();
      await cargar();
    });
    setCreandoEstrato(false);
  }

  function eliminarEstrato(e: Estrato) {
    pedirConfirmacion(`¿Eliminar el estrato "${e.codigo} — ${e.etiqueta}"?`, () =>
      runEstrato(async () => {
        await api.estratos.remove(e.id);
        await cargarEstratos();
        await cargar();
      })
    );
  }

  function eliminarBarrio(b: Barrio) {
    pedirConfirmacion(`¿Eliminar el barrio "${b.nombre}"?`, () =>
      run(async () => {
        await api.barrios.remove(b.id);
        await cargar();
      })
    );
  }

  function iniciarEdicionBarrio(b: Barrio) {
    setEditandoBarrioId(b.id);
    setEditBarrioNombre(b.nombre);
  }

  async function guardarEdicionBarrio(e: React.FormEvent) {
    e.preventDefault();
    if (editandoBarrioId === null || !editBarrioNombre.trim()) return;
    await run(async () => {
      await api.barrios.update(editandoBarrioId, editBarrioNombre.trim());
      setEditandoBarrioId(null);
      await cargar();
    });
  }

  function iniciarEdicionEstrato(e: Estrato) {
    setEditandoEstratoId(e.id);
    setEditEstratoCodigo(e.codigo);
    setEditEstratoEtiqueta(e.etiqueta);
  }

  async function guardarEdicionEstrato(e: React.FormEvent) {
    e.preventDefault();
    if (editandoEstratoId === null || !editEstratoCodigo.trim() || !editEstratoEtiqueta.trim()) return;
    await runEstrato(async () => {
      await api.estratos.update(editandoEstratoId, editEstratoCodigo.trim(), editEstratoEtiqueta.trim());
      setEditandoEstratoId(null);
      await cargarEstratos();
      await cargar();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {modal}

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <MapPin className="h-4 w-4 text-brand-500" />
          Barrios
        </h3>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={crearBarrio} className="mb-3 flex gap-2">
          <input
            placeholder="Nombre del barrio nuevo"
            value={nuevoBarrio}
            onChange={(e) => setNuevoBarrio(e.target.value)}
            className={`${inputClass} flex-1`}
          />
          <button
            type="submit"
            disabled={creando}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Crear
          </button>
        </form>

        {cargando ? (
          <p className="text-sm text-slate-700 dark:text-slate-400">Cargando...</p>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-brand-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {barrios.map((b) =>
              editandoBarrioId === b.id ? (
                <form key={b.id} onSubmit={guardarEdicionBarrio} className="flex items-center gap-2 px-4 py-2 text-sm">
                  <input
                    autoFocus
                    value={editBarrioNombre}
                    onChange={(e) => setEditBarrioNombre(e.target.value)}
                    className={`${inputClass} flex-1 py-1.5`}
                  />
                  <button type="submit" className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500">
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoBarrioId(null)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                </form>
              ) : (
              <div key={b.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-100">{b.nombre}</div>
                  <div className="text-xs text-slate-600">
                    {b.suscriptores} {b.suscriptores === 1 ? "suscriptor" : "suscriptores"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => iniciarEdicionBarrio(b)}
                    title="Editar barrio"
                    className="text-slate-600 hover:text-brand-600"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => eliminarBarrio(b)}
                    disabled={b.suscriptores > 0}
                    title={b.suscriptores > 0 ? "No se puede eliminar: tiene suscriptores asignados" : "Eliminar barrio"}
                    className="text-slate-600 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              )
            )}
            {barrios.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-600">Aún no hay barrios registrados.</p>
            )}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Estratos
        </h3>
        <p className="mb-3 text-xs text-slate-700 dark:text-slate-400">
          Cualquier valor que venga en el Excel de suscriptores y no coincida con uno de estos (por código o por
          etiqueta) se rechaza al importar en vez de guardarse tal cual.
        </p>

        {errorEstrato && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            {errorEstrato}
          </div>
        )}

        <form onSubmit={crearEstrato} className="mb-3 flex gap-2">
          <input
            placeholder="Código (ej. 5)"
            value={nuevoEstratoCodigo}
            onChange={(e) => setNuevoEstratoCodigo(e.target.value)}
            className={`${inputClass} w-28`}
          />
          <input
            placeholder="Etiqueta (ej. Medio - Alto)"
            value={nuevoEstratoEtiqueta}
            onChange={(e) => setNuevoEstratoEtiqueta(e.target.value)}
            className={`${inputClass} flex-1`}
          />
          <button
            type="submit"
            disabled={creandoEstrato}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Crear
          </button>
        </form>

        {cargando ? (
          <p className="text-sm text-slate-700 dark:text-slate-400">Cargando...</p>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-brand-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {estratos.map((e) =>
              editandoEstratoId === e.id ? (
                <form key={e.id} onSubmit={guardarEdicionEstrato} className="flex items-center gap-2 px-4 py-2 text-sm">
                  <input
                    autoFocus
                    placeholder="Código"
                    value={editEstratoCodigo}
                    onChange={(ev) => setEditEstratoCodigo(ev.target.value)}
                    className={`${inputClass} w-20 py-1.5`}
                  />
                  <input
                    placeholder="Etiqueta"
                    value={editEstratoEtiqueta}
                    onChange={(ev) => setEditEstratoEtiqueta(ev.target.value)}
                    className={`${inputClass} flex-1 py-1.5`}
                  />
                  <button type="submit" className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500">
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoEstratoId(null)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                </form>
              ) : (
              <div key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-100">{e.etiqueta}</div>
                  <div className="text-xs text-slate-600">
                    {e.suscriptores} {e.suscriptores === 1 ? "suscriptor" : "suscriptores"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-400">
                    {e.codigo}
                  </span>
                  <button
                    onClick={() => iniciarEdicionEstrato(e)}
                    title="Editar estrato"
                    className="text-slate-600 hover:text-brand-600"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => eliminarEstrato(e)}
                    disabled={e.suscriptores > 0}
                    title={e.suscriptores > 0 ? "No se puede eliminar: tiene suscriptores asignados" : "Eliminar estrato"}
                    className="text-slate-600 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              )
            )}
            {estratos.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-600">Aún no hay estratos registrados.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
