import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  Plus,
  Gauge,
  FileText,
  Download,
  Upload,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Info,
  Tag,
  Ruler,
  Package,
} from "lucide-react";
import {
  api,
  Medidor,
  MarcaMedidor,
  ModeloMedidor,
  DiametroMedidor,
  ActaInstalacion,
  Lote,
} from "../api/client";
import MedidorDetalleModal from "../components/MedidorDetalleModal";
import SuscriptorDetailModal from "../components/SuscriptorDetailModal";
import ImportExcelModal from "../components/ImportExcelModal";
import { useConfirm, useErrorHandler } from "../components/ConfirmModal";
import { useEsMovil } from "../lib/useEsMovil";
import { SkeletonTabla, SkeletonLista } from "../components/Skeleton";
import { useCierreAnimado } from "../lib/useCierreAnimado";
import BusquedaInput from "../components/BusquedaInput";
import { useFiltroPersistente } from "../lib/useFiltroPersistente";
import ThOrdenable, { Orden, alternarOrden } from "../components/ThOrdenable";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500";

const TIPO_LABELS: Record<string, string> = { volumetrico: "Volumétrico", velocidad: "Velocidad" };
function tipoLabel(tipo: string | null): string {
  if (!tipo) return "-";
  return TIPO_LABELS[tipo] ?? tipo;
}

const TABS = [
  { id: "inventario", label: "Inventario" },
  { id: "catalogo", label: "Catálogo" },
  { id: "actas", label: "Actas de instalación" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function MedidoresPage() {
  const [tab, setTab] = useState<TabId>("inventario");

  return (
    <div>
      <h1 className="mb-3 flex items-center gap-2 text-xl font-bold sm:mb-5 sm:text-2xl">
        <Gauge className="h-6 w-6 text-brand-500" />
        Medidores
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

      {tab === "inventario" && <InventarioTab />}
      {tab === "catalogo" && <CatalogoTab />}
      {tab === "actas" && <ActasTab />}
    </div>
  );
}

function InventarioTab() {
  const esMovil = useEsMovil();
  const [searchParams] = useSearchParams();
  const [modalAgregarAbierto, setModalAgregarAbierto] = useState(false);
  const { saliendo: saliendoAgregar, cerrar: cerrarAgregar } = useCierreAnimado(() => setModalAgregarAbierto(false));
  const [importAbierto, setImportAbierto] = useState(false);
  const [medidores, setMedidores] = useState<Medidor[]>([]);
  const [total, setTotal] = useState(0);
  const [marcas, setMarcas] = useState<MarcaMedidor[]>([]);
  const [modelos, setModelos] = useState<ModeloMedidor[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [detalleMedidor, setDetalleMedidor] = useState<Medidor | null>(null);
  const [detalleSuscriptorId, setDetalleSuscriptorId] = useState<number | null>(null);
  const [filtro, setFiltro] = useFiltroPersistente("medidores.q", "");
  const [filtroDebounced, setFiltroDebounced] = useState(filtro);
  // El query param (?estado=..., al llegar desde el Dashboard) le gana al filtro recordado.
  const [filtroEstado, setFiltroEstado] = useFiltroPersistente("medidores.estado", "");
  const [filtroMarca, setFiltroMarca] = useFiltroPersistente("medidores.marca", "");
  const [filtroCondicion, setFiltroCondicion] = useFiltroPersistente("medidores.condicion", "");
  const [filtroModelo, setFiltroModelo] = useFiltroPersistente("medidores.modelo", "");
  const [filtroDiametro, setFiltroDiametro] = useFiltroPersistente("medidores.diametro", "");
  const [filtroTipo, setFiltroTipo] = useFiltroPersistente("medidores.tipo", "");
  useEffect(() => {
    const e = searchParams.get("estado");
    if (e) setFiltroEstado(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [diametros, setDiametros] = useState<DiametroMedidor[]>([]);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(() => (esMovil ? 5 : 10));
  const [orden, setOrden] = useState<Orden>({ campo: "serial", dir: "asc" });
  const [cargando, setCargando] = useState(true);
  const { error, run } = useErrorHandler();
  const { pedirConfirmacion, modal } = useConfirm();
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
      prev.size === medidores.length ? new Set() : new Set(medidores.map((m) => m.id))
    );
  }

  const [nuevo, setNuevo] = useState({
    serial: "",
    marcaId: "",
    modeloId: "",
    diametroId: "",
    loteId: "",
  });
  const [nuevaActaCalibracion, setNuevaActaCalibracion] = useState<File | null>(null);


  useEffect(() => {
    const t = setTimeout(() => setFiltroDebounced(filtro), 300);
    return () => clearTimeout(t);
  }, [filtro]);

  async function cargar() {
    setCargando(true);
    const [resultado, ma, mo, lo, di] = await Promise.all([
      api.medidores.listPaginado(pagina, porPagina, {
        q: filtroDebounced,
        estado: filtroEstado,
        marca: filtroMarca,
        condicion: filtroCondicion,
        modeloId: filtroModelo ? Number(filtroModelo) : undefined,
        diametroId: filtroDiametro ? Number(filtroDiametro) : undefined,
        tipo: filtroTipo,
        sort: orden.campo,
        dir: orden.dir,
      }),
      api.marcas.list(),
      api.modelos.list(),
      api.lotes.list(),
      api.diametros.list(),
    ]);
    setMedidores(resultado.data);
    setTotal(resultado.total);
    setMarcas(ma);
    setModelos(mo);
    setLotes(lo);
    setDiametros(di);
    setSeleccionados(new Set());
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, porPagina, filtroDebounced, filtroEstado, filtroMarca, filtroCondicion, filtroModelo, filtroDiametro, filtroTipo, orden]);

  const modelosDeMarca = useMemo(
    () => modelos.filter((mo) => String(mo.marcaId) === nuevo.marcaId),
    [modelos, nuevo.marcaId]
  );
  const modeloSeleccionado = useMemo(
    () => modelos.find((mo) => String(mo.id) === nuevo.modeloId),
    [modelos, nuevo.modeloId]
  );
  const diametrosDelModelo = modeloSeleccionado?.diametros ?? [];

  async function crearMedidor(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevo.serial) return;
    const creado = await api.medidores.create({
      serial: nuevo.serial,
      marcaId: nuevo.marcaId ? Number(nuevo.marcaId) : undefined,
      modeloId: nuevo.modeloId ? Number(nuevo.modeloId) : undefined,
      diametroId: nuevo.diametroId ? Number(nuevo.diametroId) : undefined,
      loteId: nuevo.loteId ? Number(nuevo.loteId) : undefined,
    });
    if (nuevaActaCalibracion) {
      await api.medidores.subirActaCalibracion(creado.id, nuevaActaCalibracion);
    }
    setNuevo({ serial: "", marcaId: "", modeloId: "", diametroId: "", loteId: "" });
    setNuevaActaCalibracion(null);
    cargar();
  }

  useEffect(() => {
    setPagina(1);
  }, [filtroDebounced, filtroEstado, filtroMarca, filtroCondicion, filtroModelo, filtroDiametro, filtroTipo, porPagina]);

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);

  const hayFiltrosActivos =
    filtro !== "" ||
    filtroEstado !== "" ||
    filtroMarca !== "" ||
    filtroCondicion !== "" ||
    filtroModelo !== "" ||
    filtroDiametro !== "" ||
    filtroTipo !== "";
  function limpiarFiltros() {
    setFiltro("");
    setFiltroEstado("");
    setFiltroCondicion("");
    setFiltroMarca("");
    setFiltroModelo("");
    setFiltroDiametro("");
    setFiltroTipo("");
  }

  function eliminarMedidor(m: Medidor) {
    pedirConfirmacion(`¿Eliminar el medidor "${m.serial ?? m.id}"? Esta acción no se puede deshacer.`, () =>
      run(async () => {
        await api.medidores.remove(m.id);
        await cargar();
      })
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-4">
        <button
          onClick={() => setModalAgregarAbierto(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
        >
          <Plus className="h-4 w-4" />
          Agregar medidor
        </button>
        <button
          onClick={() => setImportAbierto((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Upload className="h-4 w-4" />
          Importar / exportar Excel
        </button>
        {seleccionados.size > 0 && (
          <button
            onClick={() => api.medidores.export([...seleccionados])}
            className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download className="h-4 w-4" />
            Exportar seleccionados ({seleccionados.size})
          </button>
        )}
      </div>

      {importAbierto && (
        <ImportExcelModal
          titulo="Importar medidores desde Excel"
          descripcion="La clave es el NUID del suscriptor. Completa serial, marca, modelo, tipo, diámetro, fecha de instalación, instalador, fecha de fabricación, fecha de certificación y N° de certificado; las marcas/modelos/diámetros/lotes que no existan en el catálogo se crean automáticamente. Si dejas el NUID vacío pero pones el SERIAL, el medidor queda 'en bodega' (disponible, sin asignar a nadie). Para viviendas multiusuario (varios NUID, un solo medidor), en NUID COTITULARES lista los NUID adicionales separados por coma en la fila del titular. La columna INSTALADO POR debe coincidir con el nombre de un usuario activo del sistema (no cualquier texto). Antes de importar, el archivo se valida (NUID existente, tipo válido, serial repetido o ya asignado, fechas válidas, cotitulares válidos, instalador reconocido)."
          nombreReporte="medidores_con_observaciones.xlsx"
          onExportarPlantilla={() => api.medidores.export()}
          onValidar={(file) => api.medidores.validarImport(file)}
          onImportar={(file) => api.medidores.import(file)}
          onCerrar={() => setImportAbierto(false)}
          onImportado={() => cargar()}
        />
      )}

      {modalAgregarAbierto && (
        <div className={`fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto bg-black/50 p-4 ${saliendoAgregar ? "animate-fade-out" : "animate-fade-in"}`}>
          <div className={`w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900 ${saliendoAgregar ? "animate-scale-out" : "animate-scale-in"}`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Agregar medidor al inventario</h3>
              <button
                onClick={cerrarAgregar}
                className="rounded-lg p-1 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-700 dark:text-slate-400">
              El medidor queda "en bodega". La asignación a un suscriptor se hace desde la ficha del suscriptor.
            </p>
            <form
              className="flex flex-col gap-3"
              onSubmit={async (e) => {
                await crearMedidor(e);
                cerrarAgregar();
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Serial *"
                  value={nuevo.serial}
                  onChange={(e) => setNuevo({ ...nuevo, serial: e.target.value })}
                  className={inputClass}
                  required
                />
                <select
                  value={nuevo.marcaId}
                  onChange={(e) => setNuevo({ ...nuevo, marcaId: e.target.value, modeloId: "", diametroId: "" })}
                  className={inputClass}
                >
                  <option value="">Marca...</option>
                  {marcas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
                <select
                  value={nuevo.modeloId}
                  onChange={(e) => setNuevo({ ...nuevo, modeloId: e.target.value, diametroId: "" })}
                  className={inputClass}
                  disabled={!nuevo.marcaId}
                >
                  <option value="">Modelo...</option>
                  {modelosDeMarca.map((mo) => (
                    <option key={mo.id} value={mo.id}>
                      {mo.nombre}
                    </option>
                  ))}
                </select>
                <select
                  value={nuevo.diametroId}
                  onChange={(e) => setNuevo({ ...nuevo, diametroId: e.target.value })}
                  className={inputClass}
                  disabled={!nuevo.modeloId}
                >
                  <option value="">Diámetro...</option>
                  {diametrosDelModelo.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.valor}
                    </option>
                  ))}
                </select>
                <select
                  value={nuevo.loteId}
                  onChange={(e) => setNuevo({ ...nuevo, loteId: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Lote...</option>
                  {lotes.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.serialInicial}-{l.serialFinal}
                    </option>
                  ))}
                </select>
              </div>
              {modeloSeleccionado && (
                <p className="text-xs text-slate-700 dark:text-slate-400">
                  Tipo: <span className="font-medium">{tipoLabel(modeloSeleccionado.tipo)}</span> (definido por el modelo)
                  {diametrosDelModelo.length === 0 && " · este modelo no tiene diámetros configurados en el Catálogo"}
                </p>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Acta de calibración (escaneada, opcional)
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setNuevaActaCalibracion(e.target.files?.[0] ?? null)}
                  className={`${inputClass} w-full`}
                />
              </div>
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    cerrarAgregar();
                    setNuevaActaCalibracion(null);
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
                >
                  <Plus className="h-4 w-4" />
                  Agregar al inventario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal}
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-3 flex flex-col gap-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <BusquedaInput
            placeholder="Buscar por serial, tipo o marca..."
            value={filtro}
            onChange={setFiltro}
            className="w-full max-w-sm"
          />
          <button
            onClick={() => setFiltrosAbiertos((v) => !v)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:hidden"
          >
            Filtros
            {(filtroEstado || filtroMarca || filtroCondicion || filtroModelo || filtroDiametro || filtroTipo) && (
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            )}
          </button>
        </div>
        <div className={`${filtrosAbiertos ? "flex" : "hidden"} flex-wrap items-center gap-3 sm:flex`}>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className={inputClass}>
            <option value="">Todos los estados</option>
            <option value="instalado">Instalado</option>
            <option value="en_bodega">En bodega</option>
          </select>
          <select value={filtroCondicion} onChange={(e) => setFiltroCondicion(e.target.value)} className={inputClass}>
            <option value="">Toda condición</option>
            <option value="bueno">Bueno</option>
            <option value="danado">Dañado</option>
          </select>
          <select value={filtroMarca} onChange={(e) => setFiltroMarca(e.target.value)} className={inputClass}>
            <option value="">Todas las marcas</option>
            {marcas.map((m) => (
              <option key={m.id} value={m.nombre}>
                {m.nombre}
              </option>
            ))}
          </select>
          <select value={filtroModelo} onChange={(e) => setFiltroModelo(e.target.value)} className={inputClass}>
            <option value="">Todos los modelos</option>
            {modelos.map((mo) => (
              <option key={mo.id} value={mo.id}>
                {mo.nombre}
              </option>
            ))}
          </select>
          <select value={filtroDiametro} onChange={(e) => setFiltroDiametro(e.target.value)} className={inputClass}>
            <option value="">Todos los diámetros</option>
            {diametros.map((d) => (
              <option key={d.id} value={d.id}>
                {d.valor}
              </option>
            ))}
          </select>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className={inputClass}>
            <option value="">Todo tipo</option>
            <option value="volumetrico">Volumétrico</option>
            <option value="velocidad">Velocidad</option>
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
        <SkeletonTabla columnas={8} filas={porPagina} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-800 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="w-8 px-3 py-2 sm:px-4 sm:py-3">
                  <input
                    type="checkbox"
                    checked={medidores.length > 0 && seleccionados.size === medidores.length}
                    onChange={alternarSeleccionTodos}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </th>
                <ThOrdenable campo="serial" orden={orden} onOrdenar={(c) => setOrden(alternarOrden(orden, c))}>Serial</ThOrdenable>
                <ThOrdenable campo="tipo" orden={orden} onOrdenar={(c) => setOrden(alternarOrden(orden, c))}>Tipo</ThOrdenable>
                <ThOrdenable campo="marca" orden={orden} onOrdenar={(c) => setOrden(alternarOrden(orden, c))}>Marca</ThOrdenable>
                <ThOrdenable campo="modelo" orden={orden} onOrdenar={(c) => setOrden(alternarOrden(orden, c))}>Modelo</ThOrdenable>
                <ThOrdenable campo="diametro" orden={orden} onOrdenar={(c) => setOrden(alternarOrden(orden, c))}>Diámetro</ThOrdenable>
                <ThOrdenable campo="lote" orden={orden} onOrdenar={(c) => setOrden(alternarOrden(orden, c))}>Lote</ThOrdenable>
                <ThOrdenable campo="estado" orden={orden} onOrdenar={(c) => setOrden(alternarOrden(orden, c))}>Estado</ThOrdenable>
                <th className="px-3 py-2 font-medium sm:px-4 sm:py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {medidores.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => (m.suscriptorId ? setDetalleSuscriptorId(m.suscriptorId) : setDetalleMedidor(m))}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="px-3 py-1.5 sm:px-4 sm:py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={seleccionados.has(m.id)}
                      onChange={() => alternarSeleccion(m.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="px-3 py-1.5 sm:px-4 sm:py-2.5">{m.serial ?? "-"}</td>
                  <td className="px-3 py-1.5 sm:px-4 sm:py-2.5">{tipoLabel(m.tipo)}</td>
                  <td className="px-3 py-1.5 sm:px-4 sm:py-2.5">{m.marcaCat?.nombre ?? "-"}</td>
                  <td className="px-3 py-1.5 sm:px-4 sm:py-2.5">{m.modeloCat?.nombre ?? "-"}</td>
                  <td className="px-3 py-1.5 sm:px-4 sm:py-2.5">{m.diametroCat?.valor ?? "-"}</td>
                  <td className="px-3 py-1.5 sm:px-4 sm:py-2.5">
                    {m.lote ? `${m.lote.serialInicial}-${m.lote.serialFinal}` : "-"}
                  </td>
                  <td className="px-3 py-1.5 sm:px-4 sm:py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        m.estado === "instalado"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                      }`}
                    >
                      {m.estado === "instalado" ? "Instalado" : "En bodega"}
                    </span>
                    {m.condicion === "danado" && (
                      <span className="ml-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
                        Dañado
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right sm:px-4 sm:py-2.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        eliminarMedidor(m);
                      }}
                      className="text-slate-600 hover:text-red-600"
                      title="Eliminar medidor"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {medidores.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-600">
                    Sin resultados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && total > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 sm:mt-4">
          <span className="text-xs text-slate-700 dark:text-slate-400">
            {(paginaSegura - 1) * porPagina + 1}–{Math.min(paginaSegura * porPagina, total)} de{" "}
            {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={paginaSegura <= 1}
              className="flex items-center gap-1 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Anterior
            </button>
            <span className="text-xs text-slate-700 dark:text-slate-400">
              Página {paginaSegura} de {totalPaginas}
            </span>
            <button
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaSegura >= totalPaginas}
              className="flex items-center gap-1 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Siguiente
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {detalleMedidor && (
        <MedidorDetalleModal
          medidor={detalleMedidor}
          marcas={marcas}
          modelos={modelos}
          lotes={lotes}
          onClose={() => setDetalleMedidor(null)}
          onCambio={() => {
            setDetalleMedidor(null);
            cargar();
          }}
        />
      )}

      {detalleSuscriptorId !== null && (
        <SuscriptorDetailModal
          suscriptorId={detalleSuscriptorId}
          onClose={() => {
            setDetalleSuscriptorId(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function CatalogoTab() {
  const [marcas, setMarcas] = useState<MarcaMedidor[]>([]);
  const [diametros, setDiametros] = useState<DiametroMedidor[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [modalMarcaAbierto, setModalMarcaAbierto] = useState(false);
  const [marcaEnModal, setMarcaEnModal] = useState<MarcaMedidor | null>(null);

  const [nuevoDiametro, setNuevoDiametro] = useState("");
  const [editandoDiametro, setEditandoDiametro] = useState<{ id: number; valor: string } | null>(null);

  const [nuevoLote, setNuevoLote] = useState({ serialInicial: "", serialFinal: "" });
  const [editandoLote, setEditandoLote] = useState<{ id: number; serialInicial: string; serialFinal: string } | null>(null);

  const { error, run } = useErrorHandler();
  const { pedirConfirmacion, modal } = useConfirm();

  async function cargar() {
    const [ma, d, lo] = await Promise.all([api.marcas.list(), api.diametros.list(), api.lotes.list()]);
    setMarcas(ma);
    setDiametros(d);
    setLotes(lo);
  }

  useEffect(() => {
    cargar();
  }, []);

  function abrirNuevaMarca() {
    setMarcaEnModal(null);
    setModalMarcaAbierto(true);
  }

  function abrirMarca(m: MarcaMedidor) {
    setMarcaEnModal(m);
    setModalMarcaAbierto(true);
  }

  function cerrarModalMarca() {
    setModalMarcaAbierto(false);
    setMarcaEnModal(null);
    cargar();
  }

  async function crearDiametro(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoDiametro.trim()) return;
    await run(async () => {
      await api.diametros.create(nuevoDiametro.trim());
      setNuevoDiametro("");
      await cargar();
    });
  }

  async function crearLote(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoLote.serialInicial.trim() || !nuevoLote.serialFinal.trim()) return;
    await run(async () => {
      await api.lotes.create({ serialInicial: nuevoLote.serialInicial.trim(), serialFinal: nuevoLote.serialFinal.trim() });
      setNuevoLote({ serialInicial: "", serialFinal: "" });
      await cargar();
    });
  }

  async function guardarEdicionLote() {
    if (!editandoLote || !editandoLote.serialInicial.trim() || !editandoLote.serialFinal.trim()) return;
    await run(async () => {
      await api.lotes.update(editandoLote.id, {
        serialInicial: editandoLote.serialInicial.trim(),
        serialFinal: editandoLote.serialFinal.trim(),
      });
      setEditandoLote(null);
      await cargar();
    });
  }

  return (
    <div>
      {modal}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800 dark:border-brand-700/40 dark:bg-brand-900/20 dark:text-brand-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Este catálogo tiene 3 niveles: <strong>Marca</strong> (ej. Elster) →{" "}
          <strong>Modelo</strong> de esa marca (con su tipo: volumétrico o velocidad) →{" "}
          <strong>Diámetros</strong> que puede tener ese modelo. Cuando agregues un medidor nuevo
          en la pestaña <strong>Inventario</strong>, eliges estos tres datos en cadena — por eso
          hay que crearlos aquí primero. Toca "Nueva marca" y en el mismo cuadro vas a poder
          agregarle sus modelos y diámetros, sin salir de ahí.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <Tag className="h-4 w-4 text-brand-500" />
              Marcas
            </h3>
            <button
              onClick={abrirNuevaMarca}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500"
            >
              <Plus className="h-4 w-4" />
              Nueva marca
            </button>
          </div>

          {marcas.length === 0 ? (
            <p className="py-2 text-sm text-slate-600">
              Aún no hay marcas. Crea la primera con el botón "Nueva marca".
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-700 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 font-medium">Marca</th>
                  <th className="py-2 font-medium">Modelos</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {marcas.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 font-medium text-slate-700 dark:text-slate-200">{m.nombre}</td>
                    <td className="py-2 text-slate-700 dark:text-slate-400">{m.modelos ?? 0}</td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-3 text-slate-600">
                        <button
                          onClick={() => abrirMarca(m)}
                          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar / ver modelos
                        </button>
                        <button
                          onClick={() =>
                            pedirConfirmacion(`¿Eliminar la marca "${m.nombre}"?`, () =>
                              run(async () => {
                                await api.marcas.remove(m.id);
                                await cargar();
                              })
                            )
                          }
                          className="hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <Ruler className="h-4 w-4 text-brand-500" />
            Diámetros
          </h3>
          <p className="mb-3 text-xs text-slate-700 dark:text-slate-400">
            Catálogo global, ya viene con los tamaños más comunes del mercado. Se activan por
            modelo dentro del cuadro de cada marca.
          </p>
          <form className="mb-3 flex gap-2" onSubmit={crearDiametro}>
            <input
              placeholder='Ej. 1 1/2"'
              value={nuevoDiametro}
              onChange={(e) => setNuevoDiametro(e.target.value)}
              className={`${inputClass} flex-1`}
            />
            <button
              type="submit"
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500"
            >
              <Plus className="h-4 w-4" />
              Agregar
            </button>
          </form>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {diametros.map((d) =>
                editandoDiametro?.id === d.id ? (
                  <tr key={d.id}>
                    <td colSpan={2} className="py-1.5">
                      <div className="flex items-center gap-2">
                        <input
                          value={editandoDiametro.valor}
                          onChange={(e) => setEditandoDiametro({ ...editandoDiametro, valor: e.target.value })}
                          className={`${inputClass} flex-1 py-1`}
                          autoFocus
                        />
                        <button
                          onClick={() =>
                            run(async () => {
                              await api.diametros.update(d.id, editandoDiametro.valor.trim());
                              setEditandoDiametro(null);
                              await cargar();
                            })
                          }
                          className="text-emerald-600 hover:text-emerald-500"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => setEditandoDiametro(null)} className="text-slate-600 hover:text-slate-600">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={d.id}>
                    <td className="py-1.5">{d.valor}</td>
                    <td className="py-1.5 text-right">
                      <span className="flex justify-end gap-2 text-slate-600">
                        <button onClick={() => setEditandoDiametro({ id: d.id, valor: d.valor })} className="hover:text-brand-600">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() =>
                            pedirConfirmacion(`¿Eliminar el diámetro "${d.valor}"?`, () =>
                              run(async () => {
                                await api.diametros.remove(d.id);
                                await cargar();
                              })
                            )
                          }
                          className="hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </td>
                  </tr>
                )
              )}
              {diametros.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-2 text-sm text-slate-600">
                    Aún no hay diámetros. Agrega el primero arriba.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Package className="h-4 w-4 text-brand-500" />
          Lotes
        </h3>
        <p className="mb-3 text-xs text-slate-700 dark:text-slate-400">
          Una caja de fábrica suele traer varios medidores con seriales consecutivos (ej. 23001 a
          23020). El lote se identifica por ese rango, para trazabilidad y garantía.
        </p>
        <form className="mb-3 flex flex-wrap gap-2" onSubmit={crearLote}>
          <input
            placeholder="Serial inicial (ej. 23001)"
            value={nuevoLote.serialInicial}
            onChange={(e) => setNuevoLote({ ...nuevoLote, serialInicial: e.target.value })}
            className={`${inputClass} flex-1`}
          />
          <input
            placeholder="Serial final (ej. 23020)"
            value={nuevoLote.serialFinal}
            onChange={(e) => setNuevoLote({ ...nuevoLote, serialFinal: e.target.value })}
            className={`${inputClass} flex-1`}
          />
          <button
            type="submit"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500"
          >
            <Plus className="h-4 w-4" />
            Agregar
          </button>
        </form>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-700 dark:border-slate-800 dark:text-slate-400">
              <th className="py-2 font-medium">Rango de seriales</th>
              <th className="py-2 font-medium">Medidores</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {lotes.map((l) =>
              editandoLote?.id === l.id ? (
                <tr key={l.id}>
                  <td colSpan={3} className="py-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        value={editandoLote.serialInicial}
                        onChange={(e) => setEditandoLote({ ...editandoLote, serialInicial: e.target.value })}
                        className={`${inputClass} flex-1 py-1`}
                        autoFocus
                      />
                      <input
                        value={editandoLote.serialFinal}
                        onChange={(e) => setEditandoLote({ ...editandoLote, serialFinal: e.target.value })}
                        className={`${inputClass} flex-1 py-1`}
                      />
                      <button onClick={guardarEdicionLote} className="text-emerald-600 hover:text-emerald-500">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditandoLote(null)} className="text-slate-600 hover:text-slate-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={l.id}>
                  <td className="py-2 font-medium text-slate-700 dark:text-slate-200">
                    {l.serialInicial}-{l.serialFinal}
                  </td>
                  <td className="py-2 text-slate-700 dark:text-slate-400">{l.medidores ?? 0}</td>
                  <td className="py-2 text-right">
                    <span className="flex justify-end gap-2 text-slate-600">
                      <button
                        onClick={() => setEditandoLote({ id: l.id, serialInicial: l.serialInicial, serialFinal: l.serialFinal })}
                        className="hover:text-brand-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          pedirConfirmacion(`¿Eliminar el lote "${l.serialInicial}-${l.serialFinal}"?`, () =>
                            run(async () => {
                              await api.lotes.remove(l.id);
                              await cargar();
                            })
                          )
                        }
                        className="hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </td>
                </tr>
              )
            )}
            {lotes.length === 0 && (
              <tr>
                <td colSpan={3} className="py-2 text-sm text-slate-600">
                  Aún no hay lotes. Agrega el primero arriba.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalMarcaAbierto && (
        <MarcaModal
          marca={marcaEnModal}
          diametrosCatalogo={diametros}
          onCreada={(nueva) => setMarcaEnModal(nueva)}
          onCerrar={cerrarModalMarca}
        />
      )}
    </div>
  );
}

function MarcaModal({
  marca,
  diametrosCatalogo,
  onCreada,
  onCerrar,
}: {
  marca: MarcaMedidor | null;
  diametrosCatalogo: DiametroMedidor[];
  onCreada: (marca: MarcaMedidor) => void;
  onCerrar: () => void;
}) {
  const [nombreMarca, setNombreMarca] = useState(marca?.nombre ?? "");
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const { error, run } = useErrorHandler();
  const { pedirConfirmacion, modal: modalConfirmacion } = useConfirm();
  const { saliendo, cerrar } = useCierreAnimado(onCerrar);

  const [modelos, setModelos] = useState<ModeloMedidor[]>([]);
  const [cargandoModelos, setCargandoModelos] = useState(false);
  const [formModelo, setFormModelo] = useState<{ id: number | null; nombre: string; tipo: string; diametroIds: number[] }>({
    id: null,
    nombre: "",
    tipo: "",
    diametroIds: [],
  });

  async function cargarModelos(marcaId: number) {
    setCargandoModelos(true);
    setModelos(await api.modelos.list(marcaId));
    setCargandoModelos(false);
  }

  useEffect(() => {
    if (marca) cargarModelos(marca.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marca?.id]);

  async function guardarNombre(e: React.FormEvent) {
    e.preventDefault();
    if (!nombreMarca.trim()) return;
    setGuardandoNombre(true);
    await run(async () => {
      if (marca) {
        const actualizada = await api.marcas.update(marca.id, nombreMarca.trim());
        onCreada(actualizada);
      } else {
        const creada = await api.marcas.create(nombreMarca.trim());
        onCreada(creada);
      }
    });
    setGuardandoNombre(false);
  }

  function limpiarFormModelo() {
    setFormModelo({ id: null, nombre: "", tipo: "", diametroIds: [] });
  }

  function editarModelo(mo: ModeloMedidor) {
    setFormModelo({
      id: mo.id,
      nombre: mo.nombre,
      tipo: mo.tipo,
      diametroIds: (mo.diametros ?? []).map((d) => d.id),
    });
  }

  function toggleDiametroForm(diametroId: number) {
    setFormModelo((prev) => ({
      ...prev,
      diametroIds: prev.diametroIds.includes(diametroId)
        ? prev.diametroIds.filter((id) => id !== diametroId)
        : [...prev.diametroIds, diametroId],
    }));
  }

  async function guardarModelo(e: React.FormEvent) {
    e.preventDefault();
    if (!marca || !formModelo.nombre.trim() || !formModelo.tipo) return;
    await run(async () => {
      if (formModelo.id) {
        await api.modelos.update(formModelo.id, { nombre: formModelo.nombre.trim(), tipo: formModelo.tipo, marcaId: marca.id });
        await api.modelos.setDiametros(formModelo.id, formModelo.diametroIds);
      } else {
        const creado = await api.modelos.create({ nombre: formModelo.nombre.trim(), tipo: formModelo.tipo, marcaId: marca.id });
        if (formModelo.diametroIds.length > 0) {
          await api.modelos.setDiametros(creado.id, formModelo.diametroIds);
        }
      }
      limpiarFormModelo();
      await cargarModelos(marca.id);
    });
  }

  function eliminarModelo(mo: ModeloMedidor) {
    pedirConfirmacion(`¿Eliminar el modelo "${mo.nombre}"?`, () =>
      run(async () => {
        await api.modelos.remove(mo.id);
        if (formModelo.id === mo.id) limpiarFormModelo();
        if (marca) await cargarModelos(marca.id);
      })
    );
  }

  return (
    <div className={`fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 ${saliendo ? "animate-fade-out" : "animate-fade-in"}`}>
      {modalConfirmacion}
      <div className={`flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl dark:bg-slate-900 ${saliendo ? "animate-scale-out" : "animate-scale-in"}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-lg font-bold">{marca ? `Marca: ${marca.nombre}` : "Nueva marca"}</h2>
          <button onClick={cerrar} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={guardarNombre} className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-700">
              Nombre de la marca
              <input
                value={nombreMarca}
                onChange={(e) => setNombreMarca(e.target.value)}
                placeholder="Ej. Elster"
                className={inputClass}
                autoFocus
                required
              />
            </label>
            <button
              type="submit"
              disabled={guardandoNombre}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {marca ? "Guardar nombre" : "Crear marca"}
            </button>
          </form>

          {!marca ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
              Primero crea la marca con el botón de arriba. Apenas se cree, en este mismo cuadro
              vas a poder agregarle modelos y sus diámetros.
            </p>
          ) : (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Modelos de {marca.nombre}
              </h3>

              <form
                onSubmit={guardarModelo}
                className="mb-3 flex flex-col gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
              >
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    placeholder="Nombre de modelo"
                    value={formModelo.nombre}
                    onChange={(e) => setFormModelo({ ...formModelo, nombre: e.target.value })}
                    className={`${inputClass} flex-1`}
                    required
                  />
                  <select
                    value={formModelo.tipo}
                    onChange={(e) => setFormModelo({ ...formModelo, tipo: e.target.value })}
                    className={inputClass}
                    required
                  >
                    <option value="" disabled>
                      Seleccione tipo…
                    </option>
                    <option value="volumetrico">Volumétrico</option>
                    <option value="velocidad">Velocidad</option>
                  </select>
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-700 dark:text-slate-400">
                    Diámetros disponibles para este modelo (marca los que apliquen)
                  </p>
                  {diametrosCatalogo.length === 0 ? (
                    <p className="text-xs text-slate-600">
                      Todavía no hay diámetros en el catálogo (panel de la derecha en la pantalla anterior).
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {diametrosCatalogo.map((d) => {
                        const activo = formModelo.diametroIds.includes(d.id);
                        return (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => toggleDiametroForm(d.id)}
                            className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${
                              activo
                                ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                                : "border-slate-300 text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:text-slate-400"
                            }`}
                          >
                            {activo && <Check className="h-3 w-3" />}
                            {d.valor}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  {formModelo.id && (
                    <button
                      type="button"
                      onClick={limpiarFormModelo}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Cancelar edición
                    </button>
                  )}
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {formModelo.id ? "Guardar modelo" : "Agregar modelo"}
                  </button>
                </div>
              </form>

              {cargandoModelos ? (
                <p className="text-sm text-slate-700 dark:text-slate-400">Cargando modelos...</p>
              ) : modelos.length === 0 ? (
                <p className="text-sm text-slate-600">
                  "{marca.nombre}" aún no tiene modelos. Usa el formulario de arriba para crear el
                  primero.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-700 dark:border-slate-800 dark:text-slate-400">
                      <th className="py-2 font-medium">Modelo</th>
                      <th className="py-2 font-medium">Tipo</th>
                      <th className="py-2 font-medium">Diámetros</th>
                      <th className="py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {modelos.map((mo) => (
                      <tr key={mo.id}>
                        <td className="py-2 font-medium text-slate-700 dark:text-slate-200">{mo.nombre}</td>
                        <td className="py-2 text-slate-700 dark:text-slate-400">{tipoLabel(mo.tipo)}</td>
                        <td className="py-2">
                          {(mo.diametros ?? []).length === 0 ? (
                            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Sin diámetros</span>
                          ) : (
                            <span className="text-xs text-slate-700 dark:text-slate-400">
                              {(mo.diametros ?? []).map((d) => d.valor).join(", ")}
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex justify-end gap-2 text-slate-600">
                            <button onClick={() => editarModelo(mo)} className="hover:text-brand-600">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => eliminarModelo(mo)} className="hover:text-red-600">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActasTab() {
  const [actas, setActas] = useState<ActaInstalacion[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.actas.list().then((a) => {
      setActas(a);
      setCargando(false);
    });
  }, []);

  return (
    <div>
      <p className="mb-4 text-sm text-slate-700 dark:text-slate-400">
        Historial de instalaciones registradas. Para asignar un medidor a un suscriptor, ve a la ficha del suscriptor
        en la pestaña Suscriptores.
      </p>
      {cargando ? (
        <SkeletonLista />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-800 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Suscriptor</th>
                <th className="px-4 py-3 font-medium">Serial</th>
                <th className="px-4 py-3 font-medium">Instalado por</th>
                <th className="px-4 py-3 font-medium">Acta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {actas.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5">{new Date(a.fechaInstalacion).toLocaleDateString("es-CO")}</td>
                  <td className="px-4 py-2.5">
                    {a.suscriptor ? `${a.suscriptor.codigo} — ${a.suscriptor.nombre}` : "-"}
                  </td>
                  <td className="px-4 py-2.5">{a.serial}</td>
                  <td className="px-4 py-2.5">{a.instaladoPor}</td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => api.actas.verPdf(a.id)}
                      className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Descargar PDF
                    </button>
                  </td>
                </tr>
              ))}
              {actas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-600">
                    <FileText className="mx-auto mb-1 h-5 w-5" />
                    Aún no hay actas de instalación.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
