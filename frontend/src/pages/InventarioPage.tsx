import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import {
  Warehouse,
  Plus,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Search,
  Undo2,
  Image as ImageIcon,
  ArrowDownCircle,
  ArrowUpCircle,
  Gauge,
  ArrowRight,
  Package,
  DollarSign,
  Download,
} from "lucide-react";
import {
  api,
  CategoriaInventario,
  InventarioKpis,
  ItemInventario,
  MovimientoInventario,
  PrestamoInventario,
  ProveedorInventario,
  UbicacionInventario,
  Usuario,
  urlFoto,
} from "../api/client";
import ItemInventarioModal, { UNIDAD_ABREVIADA } from "../components/ItemInventarioModal";
import ItemInventarioDetalleModal from "../components/ItemInventarioDetalleModal";
import KpiCard from "../components/KpiCard";
import ChartCard from "../components/ChartCard";
import { useConfirm, useErrorHandler } from "../components/ConfirmModal";
import { useEsMovil } from "../lib/useEsMovil";
import { useAuth } from "../contexts/AuthContext";
import { SkeletonTabla, SkeletonLista } from "../components/Skeleton";
import { useCierreAnimado } from "../lib/useCierreAnimado";
import BusquedaInput from "../components/BusquedaInput";
import { useFiltroPersistente } from "../lib/useFiltroPersistente";
import ThOrdenable, { Orden, alternarOrden } from "../components/ThOrdenable";

const GRID_STROKE = "#475569";

function fmtMoneda(n: number): string {
  return n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

function DashboardTab() {
  const [kpis, setKpis] = useState<InventarioKpis | null>(null);

  useEffect(() => {
    api.inventario.kpis().then(setKpis);
  }, []);

  if (!kpis) return <p className="text-slate-700 dark:text-slate-400">Cargando...</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard label="Total de ítems" value={String(kpis.totalItems)} icon={Package} />
        <KpiCard label="Valor total del inventario" value={fmtMoneda(kpis.valorTotalInventario)} icon={DollarSign} />
        <KpiCard label="Préstamos activos" value={String(kpis.prestamosActivos)} icon={Undo2} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Ítems por categoría">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={kpis.itemsPorCategoria}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} opacity={0.2} />
              <XAxis dataKey="categoria" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="cantidad" fill="#22d3ee" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Ítems por estado">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={kpis.itemsPorEstado.map((e) => ({ ...e, estado: ESTADO_LABELS[e.estado] ?? e.estado }))}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} opacity={0.2} />
              <XAxis dataKey="estado" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="cantidad" fill="#34d399" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Entradas y salidas (últimos 6 meses)" span>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={kpis.movimientosPorMes}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} opacity={0.2} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="entradas" name="Entradas" fill="#34d399" radius={[4, 4, 0, 0]} />
              <Bar dataKey="salidas" name="Salidas" fill="#fb923c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500";

const ESTADO_LABELS: Record<string, string> = { bueno: "Bueno", regular: "Regular", dañado: "Dañado", de_baja: "De baja" };
const ESTADO_COLORS: Record<string, string> = {
  bueno: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  regular: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  dañado: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  de_baja: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

function ItemsTab({
  categorias,
  ubicaciones,
  proveedores,
  recargarCatalogos,
}: {
  categorias: CategoriaInventario[];
  ubicaciones: UbicacionInventario[];
  proveedores: ProveedorInventario[];
  recargarCatalogos: () => void;
}) {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.permisos?.includes("inventario_avanzado") ?? false;
  const esMovil = useEsMovil();
  const [porPagina, setPorPagina] = useState(() => (esMovil ? 5 : 10));
  const [filas, setFilas] = useState<ItemInventario[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useFiltroPersistente("inventario.q", "");
  const [busquedaDebounced, setBusquedaDebounced] = useState(busqueda);
  const [categoriaFiltro, setCategoriaFiltro] = useFiltroPersistente("inventario.categoria", "");
  const [orden, setOrden] = useState<Orden>({ campo: "nombre", dir: "asc" });
  const [modalAbierto, setModalAbierto] = useState<"nuevo" | ItemInventario | null>(null);
  const [detalle, setDetalle] = useState<ItemInventario | null>(null);
  const { pedirConfirmacion, modal } = useConfirm();
  const { error, run } = useErrorHandler();
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
    setSeleccionados((prev) => (prev.size === filas.length ? new Set() : new Set(filas.map((f) => f.id))));
  }

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  async function cargar() {
    setCargando(true);
    try {
      const resultado = await api.inventario.listPaginado(pagina, porPagina, {
        q: busquedaDebounced || undefined,
        categoria: categoriaFiltro ? Number(categoriaFiltro) : undefined,
        sort: orden.campo,
        dir: orden.dir,
      });
      setFilas(resultado.data);
      setTotal(resultado.total);
      setSeleccionados(new Set());
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, porPagina, busquedaDebounced, categoriaFiltro, orden]);

  useEffect(() => setPagina(1), [busquedaDebounced, categoriaFiltro, porPagina]);

  function eliminar(item: ItemInventario) {
    pedirConfirmacion(`¿Eliminar "${item.nombre}" del inventario?`, async () => {
      await run(() => api.inventario.remove(item.id));
      cargar();
    });
  }

  function alGuardar() {
    cargar();
    recargarCatalogos();
  }

  function filtrosActuales() {
    return { q: busquedaDebounced || undefined, categoria: categoriaFiltro ? Number(categoriaFiltro) : undefined };
  }
  function exportarExcel() {
    run(() => api.inventario.exportarExcel(filtrosActuales()));
  }
  function exportarPdf() {
    run(() => api.inventario.exportarPdf(filtrosActuales()));
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
        <div className="flex items-center gap-2">
          <BusquedaInput
            placeholder="Buscar por nombre, código o categoría..."
            value={busqueda}
            onChange={setBusqueda}
            className="w-full max-w-xs"
          />
        </div>
        <select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)} className={inputClass}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          Mostrar
          <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className={inputClass}>
            {[5, 10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={exportarExcel}
          className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Download className="h-4 w-4" />
          Excel
        </button>
        <button
          onClick={exportarPdf}
          className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Download className="h-4 w-4" />
          PDF
        </button>
        {seleccionados.size > 0 && (
          <button
            onClick={() => api.inventario.exportarExcel({ ...filtrosActuales(), ids: [...seleccionados] })}
            className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download className="h-4 w-4" />
            Exportar seleccionados ({seleccionados.size})
          </button>
        )}
        {puedeEditar && (
          <button
            onClick={() => setModalAbierto("nuevo")}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
          >
            <Plus className="h-4 w-4" />
            Nuevo ítem
          </button>
        )}
      </div>

      {cargando ? (
        <SkeletonTabla columnas={5} filas={porPagina} />
      ) : filas.length === 0 ? (
        <p className="rounded-xl border border-brand-200 bg-white px-4 py-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900">
          {busqueda.trim() ? `Sin resultados para "${busqueda}".` : "No hay ítems registrados en el inventario."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-brand-100 bg-brand-50 text-xs uppercase text-brand-800 dark:border-slate-800 dark:bg-transparent dark:text-slate-400">
              <tr>
                <th className="w-8 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={filas.length > 0 && seleccionados.size === filas.length}
                    onChange={alternarSeleccionTodos}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </th>
                <ThOrdenable campo="nombre" orden={orden} onOrdenar={(c) => setOrden(alternarOrden(orden, c))} className="px-4 py-2.5">Ítem</ThOrdenable>
                <ThOrdenable campo="categoria" orden={orden} onOrdenar={(c) => setOrden(alternarOrden(orden, c))} className="px-4 py-2.5">Categoría</ThOrdenable>
                <ThOrdenable campo="cantidad" orden={orden} onOrdenar={(c) => setOrden(alternarOrden(orden, c))} className="px-4 py-2.5">Disponible</ThOrdenable>
                <ThOrdenable campo="estado" orden={orden} onOrdenar={(c) => setOrden(alternarOrden(orden, c))} className="px-4 py-2.5">Estado</ThOrdenable>
                <ThOrdenable campo="ubicacion" orden={orden} onOrdenar={(c) => setOrden(alternarOrden(orden, c))} className="px-4 py-2.5">Ubicación</ThOrdenable>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filas.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={seleccionados.has(item.id)}
                      onChange={() => alternarSeleccion(item.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => setDetalle(item)}
                      className="flex items-center gap-2 text-left hover:underline"
                    >
                      {item.fotoUrl ? (
                        <img src={urlFoto(item.fotoUrl)} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800">
                          <ImageIcon className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-800 dark:text-slate-100">{item.nombre}</div>
                        {item.codigo && <div className="text-xs text-slate-600 dark:text-slate-400">{item.codigo}</div>}
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-400">{item.categoriaCat?.nombre ?? "-"}</td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-400">
                    {item.disponible} / {item.cantidad} {UNIDAD_ABREVIADA[item.unidadMedida] ?? item.unidadMedida}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_COLORS[item.estado]}`}>
                      {ESTADO_LABELS[item.estado] ?? item.estado}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-400">{item.ubicacionCat?.nombre ?? "-"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {puedeEditar && (
                      <>
                        <button
                          onClick={() => setModalAbierto(item)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => eliminar(item)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <ItemInventarioModal
          item={modalAbierto === "nuevo" ? null : modalAbierto}
          categorias={categorias}
          ubicaciones={ubicaciones}
          proveedores={proveedores}
          onClose={() => setModalAbierto(null)}
          onCambio={alGuardar}
        />
      )}
      {detalle && (
        <ItemInventarioDetalleModal
          item={detalle}
          puedeEditar={puedeEditar}
          onClose={() => setDetalle(null)}
          onEditar={() => {
            setModalAbierto(detalle);
            setDetalle(null);
          }}
        />
      )}
      {modal}
    </div>
  );
}

function PrestamosTab() {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.permisos?.includes("inventario_avanzado") ?? false;
  const [prestamos, setPrestamos] = useState<PrestamoInventario[]>([]);
  const [soloActivos, setSoloActivos] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [items, setItems] = useState<ItemInventario[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [asignando, setAsignando] = useState(false);
  const { saliendo: saliendoAsignar, cerrar: cerrarAsignar } = useCierreAnimado(() => setAsignando(false));
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [itemId, setItemId] = useState("");
  const [usuarioId, setUsuarioId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [observaciones, setObservaciones] = useState("");
  const { pedirConfirmacion, modal } = useConfirm();
  const { error, run } = useErrorHandler();
  const { error: errorModal, run: runModal, limpiar: limpiarModal } = useErrorHandler();

  async function cargar() {
    setCargando(true);
    try {
      setPrestamos(await api.inventario.prestamos.list({ activos: soloActivos || undefined }));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloActivos]);

  function abrirAsignar() {
    api.inventario.list().then(setItems);
    api.usuarios.list().then(setUsuarios);
    setEditandoId(null);
    setItemId("");
    setUsuarioId("");
    setCantidad("1");
    setObservaciones("");
    limpiarModal();
    setAsignando(true);
  }

  function abrirEditar(p: PrestamoInventario) {
    api.inventario.list().then(setItems);
    api.usuarios.list().then(setUsuarios);
    setEditandoId(p.id);
    setItemId(String(p.itemId));
    setUsuarioId(String(p.usuarioId));
    setCantidad(String(p.cantidad));
    setObservaciones(p.observaciones ?? "");
    limpiarModal();
    setAsignando(true);
  }

  async function asignar() {
    if (!itemId || !usuarioId) return;
    await runModal(async () => {
      if (editandoId) {
        await api.inventario.prestamos.actualizar(editandoId, {
          usuarioId: Number(usuarioId),
          cantidad: Number(cantidad) || 1,
          observaciones: observaciones.trim() || undefined,
        });
      } else {
        await api.inventario.prestamos.crear({
          itemId: Number(itemId),
          usuarioId: Number(usuarioId),
          cantidad: Number(cantidad) || 1,
          observaciones: observaciones.trim() || undefined,
        });
      }
      cerrarAsignar();
      cargar();
    });
  }

  function devolver(p: PrestamoInventario) {
    pedirConfirmacion(`¿Marcar como devuelto "${p.item?.nombre}" (${p.usuario?.nombre})?`, async () => {
      await run(async () => {
        await api.inventario.prestamos.devolver(p.id);
      });
      cargar();
    });
  }

  function eliminar(p: PrestamoInventario) {
    pedirConfirmacion(`¿Eliminar el préstamo de "${p.item?.nombre}" a "${p.usuario?.nombre}"? Esto borra el registro por completo, no se puede recuperar.`, async () => {
      await run(async () => {
        await api.inventario.prestamos.remove(p.id);
      });
      cargar();
    });
  }

  function exportarExcel() {
    run(() => api.inventario.prestamos.exportarExcel({ activos: soloActivos || undefined }));
  }
  function exportarPdf() {
    run(() => api.inventario.prestamos.exportarPdf({ activos: soloActivos || undefined }));
  }

  return (
    <div>
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-slate-200 p-1 dark:border-slate-800">
          {(
            [
              [true, "Solo activos"],
              [false, "Todos"],
            ] as [boolean, string][]
          ).map(([valor, etiqueta]) => (
            <button
              key={etiqueta}
              onClick={() => setSoloActivos(valor)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                soloActivos === valor
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        <button
          onClick={exportarExcel}
          className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Download className="h-4 w-4" />
          Excel
        </button>
        <button
          onClick={exportarPdf}
          className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Download className="h-4 w-4" />
          PDF
        </button>
        {puedeEditar && (
          <button
            onClick={abrirAsignar}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
          >
            <Plus className="h-4 w-4" />
            Asignar préstamo
          </button>
        )}
      </div>

      {cargando ? (
        <SkeletonLista />
      ) : prestamos.length === 0 ? (
        <p className="rounded-xl border border-brand-200 bg-white px-4 py-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900">
          No hay préstamos {soloActivos ? "activos" : "registrados"}.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {prestamos.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {p.item?.nombre} {p.cantidad > 1 ? `(x${p.cantidad})` : ""} · {p.usuario?.nombre}
                </div>
                <div className="text-xs text-slate-700 dark:text-slate-400">
                  Entregado {new Date(p.fechaEntrega).toLocaleDateString()}
                  {p.fechaDevolucion
                    ? ` · Devuelto ${new Date(p.fechaDevolucion).toLocaleDateString()}`
                    : " · Sin devolver"}
                  {p.observaciones ? ` · ${p.observaciones}` : ""}
                </div>
              </div>
              {puedeEditar && (
                <div className="flex shrink-0 items-center gap-1.5">
                  {!p.fechaDevolucion && (
                    <button
                      onClick={() => devolver(p)}
                      className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      Devolver
                    </button>
                  )}
                  <button
                    onClick={() => abrirEditar(p)}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => eliminar(p)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {asignando && (
        <div className={`fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 ${saliendoAsignar ? "animate-fade-out" : "animate-fade-in"}`}>
          <div className={`w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900 ${saliendoAsignar ? "animate-scale-out" : "animate-scale-in"}`}>
            <h2 className="mb-4 text-lg font-bold">{editandoId ? "Editar préstamo" : "Asignar préstamo"}</h2>
            {errorModal && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
                {errorModal}
              </p>
            )}
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Ítem</span>
                <select
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  disabled={!!editandoId}
                  className={`${inputClass} w-full disabled:opacity-60`}
                >
                  <option value="">Selecciona un ítem</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id} disabled={!editandoId && i.disponible <= 0}>
                      {i.nombre} ({i.disponible} disponible{i.disponible === 1 ? "" : "s"})
                    </option>
                  ))}
                </select>
                {!!editandoId && (
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                    El ítem no se puede cambiar. Si asignaste el equipo equivocado, borra este préstamo y crea uno nuevo.
                  </span>
                )}
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Responsable</span>
                <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} className={`${inputClass} w-full`}>
                  <option value="">Selecciona un usuario</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Cantidad</span>
                <input
                  type="number"
                  min={1}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className={`${inputClass} w-full`}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Observaciones</span>
                <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={`${inputClass} w-full`} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={cerrarAsignar}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={asignar}
                disabled={!itemId || !usuarioId}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
              >
                {editandoId ? "Guardar" : "Asignar"}
              </button>
            </div>
          </div>
        </div>
      )}
      {modal}
    </div>
  );
}

function MovimientosTab() {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.permisos?.includes("inventario_avanzado") ?? false;
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([]);
  const [tipoFiltro, setTipoFiltro] = useState<"" | "entrada" | "salida">("");
  const [cargando, setCargando] = useState(true);
  const [items, setItems] = useState<ItemInventario[]>([]);
  const [registrando, setRegistrando] = useState<"entrada" | "salida" | null>(null);
  const { saliendo: saliendoRegistrar, cerrar: cerrarRegistrar } = useCierreAnimado(() => setRegistrando(null));
  const [itemId, setItemId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const { pedirConfirmacion, modal } = useConfirm();
  const { error, run } = useErrorHandler();
  const { error: errorModal, run: runModal, limpiar: limpiarModal } = useErrorHandler();

  async function cargar() {
    setCargando(true);
    try {
      setMovimientos(await api.inventario.movimientos.list({ tipo: tipoFiltro || undefined }));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoFiltro]);

  function abrirRegistrar(tipo: "entrada" | "salida") {
    api.inventario.list().then(setItems);
    setItemId("");
    setCantidad("1");
    setMotivo("");
    setObservaciones("");
    limpiarModal();
    setRegistrando(tipo);
  }

  async function registrar() {
    if (!itemId || !registrando) return;
    await runModal(async () => {
      await api.inventario.movimientos.crear({
        itemId: Number(itemId),
        tipo: registrando,
        cantidad: Number(cantidad) || 1,
        motivo: motivo.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
      });
      cerrarRegistrar();
      cargar();
    });
  }

  function eliminar(m: MovimientoInventario) {
    pedirConfirmacion(`¿Eliminar este movimiento de "${m.item?.nombre}"? Se revertirá el ajuste de cantidad.`, async () => {
      await run(() => api.inventario.movimientos.remove(m.id));
      cargar();
    });
  }

  function exportarExcel() {
    run(() => api.inventario.movimientos.exportarExcel({ tipo: tipoFiltro || undefined }));
  }
  function exportarPdf() {
    run(() => api.inventario.movimientos.exportarPdf({ tipo: tipoFiltro || undefined }));
  }

  return (
    <div>
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-slate-200 p-1 dark:border-slate-800">
          {(
            [
              ["", "Todos"],
              ["entrada", "Entradas"],
              ["salida", "Salidas"],
            ] as ["" | "entrada" | "salida", string][]
          ).map(([valor, etiqueta]) => (
            <button
              key={etiqueta}
              onClick={() => setTipoFiltro(valor)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                tipoFiltro === valor
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        <button
          onClick={exportarExcel}
          className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Download className="h-4 w-4" />
          Excel
        </button>
        <button
          onClick={exportarPdf}
          className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Download className="h-4 w-4" />
          PDF
        </button>
        {puedeEditar && (
          <>
            <button
              onClick={() => abrirRegistrar("entrada")}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              <ArrowDownCircle className="h-4 w-4" />
              Registrar entrada
            </button>
            <button
              onClick={() => abrirRegistrar("salida")}
              className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
            >
              <ArrowUpCircle className="h-4 w-4" />
              Registrar salida
            </button>
          </>
        )}
      </div>

      {cargando ? (
        <SkeletonLista />
      ) : movimientos.length === 0 ? (
        <p className="rounded-xl border border-brand-200 bg-white px-4 py-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900">
          No hay movimientos registrados.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {movimientos.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
              {m.tipo === "entrada" ? (
                <ArrowDownCircle className="h-5 w-5 shrink-0 text-emerald-500" />
              ) : (
                <ArrowUpCircle className="h-5 w-5 shrink-0 text-amber-500" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {m.item?.nombre} · {m.tipo === "entrada" ? "+" : "-"}
                  {m.cantidad}
                </div>
                <div className="text-xs text-slate-700 dark:text-slate-400">
                  {new Date(m.createdAt).toLocaleString()}
                  {m.usuario ? ` · ${m.usuario.nombre}` : ""}
                  {m.motivo ? ` · ${m.motivo}` : ""}
                  {m.observaciones ? ` · ${m.observaciones}` : ""}
                </div>
              </div>
              {puedeEditar && (
                <button onClick={() => eliminar(m)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {registrando && (
        <div className={`fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 ${saliendoRegistrar ? "animate-fade-out" : "animate-fade-in"}`}>
          <div className={`w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900 ${saliendoRegistrar ? "animate-scale-out" : "animate-scale-in"}`}>
            <h2 className="mb-4 text-lg font-bold">
              {registrando === "entrada" ? "Registrar entrada" : "Registrar salida"}
            </h2>
            {errorModal && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
                {errorModal}
              </p>
            )}
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Ítem</span>
                <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={`${inputClass} w-full`}>
                  <option value="">Selecciona un ítem</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre} ({i.disponible} disponible{i.disponible === 1 ? "" : "s"})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Cantidad</span>
                <input
                  type="number"
                  min={1}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className={`${inputClass} w-full`}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Motivo</span>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder={registrando === "entrada" ? "Ej. Compra" : "Ej. Usado en instalación NUID 123"}
                  className={`${inputClass} w-full`}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Observaciones</span>
                <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={`${inputClass} w-full`} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={cerrarRegistrar}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={registrar}
                disabled={!itemId}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
              >
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}
      {modal}
    </div>
  );
}

// Pestaña genérica para los catálogos simples (nombre único): Categorías y Ubicaciones.
function CatalogoSimpleTab({
  titulo,
  placeholder,
  cargar,
  crear,
  actualizar,
  eliminar: eliminarCatalogo,
  puedeEditar,
  recargarCatalogos,
}: {
  titulo: string;
  placeholder: string;
  cargar: () => Promise<{ id: number; nombre: string; items: number }[]>;
  crear: (nombre: string) => Promise<unknown>;
  actualizar: (id: number, nombre: string) => Promise<unknown>;
  eliminar: (id: number) => Promise<unknown>;
  puedeEditar: boolean;
  recargarCatalogos: () => void;
}) {
  const [filas, setFilas] = useState<{ id: number; nombre: string; items: number }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [editando, setEditando] = useState<number | null>(null);
  const [editValor, setEditValor] = useState("");
  const { pedirConfirmacion, modal } = useConfirm();
  const { error, run } = useErrorHandler();

  async function recargar() {
    setCargando(true);
    try {
      setFilas(await cargar());
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function agregar() {
    if (!nuevoNombre.trim()) return;
    await run(async () => {
      await crear(nuevoNombre.trim());
      setNuevoNombre("");
      recargar();
      recargarCatalogos();
    });
  }

  async function guardarEdicion(id: number) {
    if (!editValor.trim()) return;
    await run(async () => {
      await actualizar(id, editValor.trim());
      setEditando(null);
      recargar();
      recargarCatalogos();
    });
  }

  function eliminarFila(f: { id: number; nombre: string }) {
    pedirConfirmacion(`¿Eliminar "${f.nombre}"?`, async () => {
      await run(async () => {
        await eliminarCatalogo(f.id);
      });
      recargar();
      recargarCatalogos();
    });
  }

  return (
    <div>
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}
      {puedeEditar && (
        <div className="mb-4 flex items-center gap-2">
          <input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregar()}
            placeholder={placeholder}
            className={`${inputClass} w-full max-w-xs`}
          />
          <button
            onClick={agregar}
            disabled={!nuevoNombre.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Agregar
          </button>
        </div>
      )}

      {cargando ? (
        <SkeletonLista />
      ) : filas.length === 0 ? (
        <p className="rounded-xl border border-brand-200 bg-white px-4 py-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900">
          No hay {titulo.toLowerCase()} registradas todavía.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {filas.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
              {editando === f.id ? (
                <input
                  value={editValor}
                  onChange={(e) => setEditValor(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && guardarEdicion(f.id)}
                  autoFocus
                  className={`${inputClass} flex-1`}
                />
              ) : (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{f.nombre}</div>
                  <div className="text-xs text-slate-700 dark:text-slate-400">
                    {f.items} ítem{f.items === 1 ? "" : "s"}
                  </div>
                </div>
              )}
              {puedeEditar && (
                <>
                  {editando === f.id ? (
                    <button
                      onClick={() => guardarEdicion(f.id)}
                      className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500"
                    >
                      Guardar
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setEditando(f.id);
                        setEditValor(f.nombre);
                      }}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => eliminarFila(f)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {modal}
    </div>
  );
}

function ProveedoresTab({ recargarCatalogos }: { recargarCatalogos: () => void }) {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.permisos?.includes("inventario_avanzado") ?? false;
  const [filas, setFilas] = useState<ProveedorInventario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState<"nuevo" | ProveedorInventario | null>(null);
  const { saliendo: saliendoProveedor, cerrar: cerrarProveedor } = useCierreAnimado(() => setModalAbierto(null));
  const [nombre, setNombre] = useState("");
  const [contacto, setContacto] = useState("");
  const [telefono, setTelefono] = useState("");
  const { pedirConfirmacion, modal } = useConfirm();
  const { error, run } = useErrorHandler();

  async function recargar() {
    setCargando(true);
    try {
      setFilas(await api.inventario.proveedores.list());
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    recargar();
  }, []);

  function abrirModal(p: "nuevo" | ProveedorInventario) {
    setNombre(p === "nuevo" ? "" : p.nombre);
    setContacto(p === "nuevo" ? "" : p.contacto ?? "");
    setTelefono(p === "nuevo" ? "" : p.telefono ?? "");
    setModalAbierto(p);
  }

  async function guardar() {
    if (!nombre.trim()) return;
    await run(async () => {
      const data = { nombre: nombre.trim(), contacto: contacto.trim() || undefined, telefono: telefono.trim() || undefined };
      if (modalAbierto !== "nuevo" && modalAbierto) {
        await api.inventario.proveedores.actualizar(modalAbierto.id, data);
      } else {
        await api.inventario.proveedores.crear(data);
      }
      cerrarProveedor();
      recargar();
      recargarCatalogos();
    });
  }

  function eliminar(p: ProveedorInventario) {
    pedirConfirmacion(`¿Eliminar "${p.nombre}"?`, async () => {
      await run(() => api.inventario.proveedores.remove(p.id));
      recargar();
      recargarCatalogos();
    });
  }

  return (
    <div>
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}
      {puedeEditar && (
        <div className="mb-4">
          <button
            onClick={() => abrirModal("nuevo")}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
          >
            <Plus className="h-4 w-4" />
            Nuevo proveedor
          </button>
        </div>
      )}

      {cargando ? (
        <SkeletonLista />
      ) : filas.length === 0 ? (
        <p className="rounded-xl border border-brand-200 bg-white px-4 py-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900">
          No hay proveedores registrados todavía.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {filas.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{p.nombre}</div>
                <div className="text-xs text-slate-700 dark:text-slate-400">
                  {[p.contacto, p.telefono].filter(Boolean).join(" · ") || `${p.items} ítem${p.items === 1 ? "" : "s"}`}
                </div>
              </div>
              {puedeEditar && (
                <>
                  <button
                    onClick={() => abrirModal(p)}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => eliminar(p)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {modalAbierto && (
        <div className={`fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 ${saliendoProveedor ? "animate-fade-out" : "animate-fade-in"}`}>
          <div className={`w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900 ${saliendoProveedor ? "animate-scale-out" : "animate-scale-in"}`}>
            <h2 className="mb-4 text-lg font-bold">{modalAbierto === "nuevo" ? "Nuevo proveedor" : "Editar proveedor"}</h2>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Nombre</span>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus className={`${inputClass} w-full`} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Contacto</span>
                <input value={contacto} onChange={(e) => setContacto(e.target.value)} className={`${inputClass} w-full`} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Teléfono</span>
                <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={`${inputClass} w-full`} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={cerrarProveedor}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={!nombre.trim()}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
      {modal}
    </div>
  );
}

// Los medidores en bodega son inventario en el sentido amplio, pero viven en su propio módulo
// (atados a suscriptor/lectura/acta de instalación, un ciclo de vida muy distinto al de
// herramientas e insumos). En vez de fusionar los dos modelos, esta tarjeta solo da visibilidad
// del conteo con un link directo al módulo de Medidores.
function MedidoresEnBodegaCard() {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    api.medidores.listPaginado(1, 1, { estado: "en_bodega" }).then((r) => setTotal(r.total));
  }, []);

  if (total === null) return null;

  return (
    <Link
      to="/medidores?estado=en_bodega"
      className="mb-4 flex items-center gap-3 rounded-xl border border-brand-200 bg-white px-4 py-3 shadow-sm transition-colors hover:bg-brand-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      <Gauge className="h-5 w-5 shrink-0 text-brand-500" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
          {total} medidor{total === 1 ? "" : "es"} en bodega
        </div>
        <div className="text-xs text-slate-600 dark:text-slate-400">Ver en el módulo de Medidores</div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
    </Link>
  );
}

type Tab = "dashboard" | "items" | "prestamos" | "movimientos" | "categorias" | "ubicaciones" | "proveedores";

export default function InventarioPage() {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.permisos?.includes("inventario_avanzado") ?? false;
  const [tab, setTab] = useState<Tab>("dashboard");
  const [categorias, setCategorias] = useState<CategoriaInventario[]>([]);
  const [ubicaciones, setUbicaciones] = useState<UbicacionInventario[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorInventario[]>([]);

  function recargarCatalogos() {
    api.inventario.categorias.list().then(setCategorias);
    api.inventario.ubicaciones.list().then(setUbicaciones);
    api.inventario.proveedores.list().then(setProveedores);
  }

  useEffect(() => {
    recargarCatalogos();
  }, []);

  const tabs = useMemo(
    (): [Tab, string][] => [
      ["dashboard", "Dashboard"],
      ["items", "Ítems"],
      ["prestamos", "Préstamos"],
      ["movimientos", "Entradas/Salidas"],
      ["categorias", "Categorías"],
      ["ubicaciones", "Ubicaciones"],
      ["proveedores", "Proveedores"],
    ],
    []
  );

  return (
    <div>
      <h1 className="mb-3 flex items-center gap-2 text-xl font-bold sm:mb-5 sm:text-2xl">
        <Warehouse className="h-6 w-6 text-brand-500" />
        Inventario general
      </h1>

      {(usuario?.permisos?.includes("medidores_ver") || usuario?.permisos?.includes("medidores_avanzado")) && (
        <MedidoresEnBodegaCard />
      )}

      <div className="mb-4 flex w-fit flex-wrap items-center gap-1 rounded-full border border-slate-200 p-1 dark:border-slate-800">
        {tabs.map(([valor, etiqueta]) => (
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
      {tab === "items" && (
        <ItemsTab
          categorias={categorias}
          ubicaciones={ubicaciones}
          proveedores={proveedores}
          recargarCatalogos={recargarCatalogos}
        />
      )}
      {tab === "prestamos" && <PrestamosTab />}
      {tab === "movimientos" && <MovimientosTab />}
      {tab === "categorias" && (
        <CatalogoSimpleTab
          titulo="Categorías"
          placeholder="Ej. Herramienta"
          cargar={api.inventario.categorias.list}
          crear={api.inventario.categorias.crear}
          actualizar={api.inventario.categorias.actualizar}
          eliminar={api.inventario.categorias.remove}
          puedeEditar={puedeEditar}
          recargarCatalogos={recargarCatalogos}
        />
      )}
      {tab === "ubicaciones" && (
        <CatalogoSimpleTab
          titulo="Ubicaciones"
          placeholder="Ej. Bodega principal"
          cargar={api.inventario.ubicaciones.list}
          crear={api.inventario.ubicaciones.crear}
          actualizar={api.inventario.ubicaciones.actualizar}
          eliminar={api.inventario.ubicaciones.remove}
          puedeEditar={puedeEditar}
          recargarCatalogos={recargarCatalogos}
        />
      )}
      {tab === "proveedores" && <ProveedoresTab recargarCatalogos={recargarCatalogos} />}
    </div>
  );
}
