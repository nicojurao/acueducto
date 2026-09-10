import { useEffect, useMemo, useRef, useState } from "react";
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
  urlFoto,
  Medidor,
  MarcaMedidor,
  ModeloMedidor,
  DiametroMedidor,
  VarianteMedidor,
  ActaInstalacion,
  Lote,
} from "../api/client";
import MedidorDetalleModal from "../components/MedidorDetalleModal";
import SuscriptorDetailModal from "../components/SuscriptorDetailModal";
import ImportExcelModal from "../components/ImportExcelModal";
import ListCard from "../components/ListCard";
import { useConfirm, useErrorHandler } from "../components/ConfirmModal";
import { useToast } from "../contexts/ToastContext";
import { useEsMovil } from "../lib/useEsMovil";
import { SkeletonTabla, SkeletonLista } from "../components/Skeleton";
import { useCierreAnimado } from "../lib/useCierreAnimado";
import BusquedaInput from "../components/BusquedaInput";
import { useFilasAutoajustadas } from "../lib/useFilasAutoajustadas";
import ThOrdenable, { Orden, alternarOrden } from "../components/ThOrdenable";
import { inputClass } from "../lib/ui";
import { fmtFecha } from "../lib/fecha";
import EmptyState from "../components/EmptyState";
import { leerSnapshot, listarMedidoresOffline } from "../lib/offlineSnapshot";

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
                : "border-transparent text-slate-700 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
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
  // Paso 1 pide solo el serial y lo valida contra el backend antes de dejar completar el resto —
  // así no se rellenan los otros 7 campos para enterarse al final de que el serial ya existía.
  const [pasoAgregar, setPasoAgregar] = useState<"serial" | "resto">("serial");
  const [verificandoSerial, setVerificandoSerial] = useState(false);
  const [serialError, setSerialError] = useState<string | null>(null);
  const [creandoMedidor, setCreandoMedidor] = useState(false);
  const { mostrarError } = useToast();
  const [importAbierto, setImportAbierto] = useState(false);
  const [medidores, setMedidores] = useState<Medidor[]>([]);
  const [total, setTotal] = useState(0);
  const [marcas, setMarcas] = useState<MarcaMedidor[]>([]);
  const [modelos, setModelos] = useState<ModeloMedidor[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [detalleMedidor, setDetalleMedidor] = useState<Medidor | null>(null);
  const [detalleSuscriptorId, setDetalleSuscriptorId] = useState<number | null>(null);
  const [filtro, setFiltro] = useState("");
  const [filtroDebounced, setFiltroDebounced] = useState(filtro);
  // El query param (?estado=..., al llegar desde el Dashboard) le gana al filtro recordado.
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroMarca, setFiltroMarca] = useState("");
  const [filtroCondicion, setFiltroCondicion] = useState("");
  const [filtroModelo, setFiltroModelo] = useState("");
  const [filtroDiametro, setFiltroDiametro] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  useEffect(() => {
    const e = searchParams.get("estado");
    if (e) setFiltroEstado(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [diametros, setDiametros] = useState<DiametroMedidor[]>([]);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const { contenedorRef, filas: filasAuto } = useFilasAutoajustadas(esMovil ? 132 : 44, { minimo: esMovil ? 3 : 6 });
  // Derivado en vez de sincronizado con un efecto aparte: ver el comentario en SuscriptoresPage
  // (mismo patrón) — evita que el fetch inicial se dispare dos veces (una con un default fijo,
  // otra cuando el efecto de sincronización alcanza a corregirlo al valor real).
  const [porPaginaManual, setPorPaginaManual] = useState<number | null>(null);
  const porPagina = porPaginaManual ?? filasAuto;
  const [orden, setOrden] = useState<Orden>({ campo: "serial", dir: "asc" });
  const [cargando, setCargando] = useState(true);
  // Cuándo se generó el snapshot que se está mostrando — solo tiene valor si el fetch falló y se
  // usó el "Modo de salida" (IndexedDB) como respaldo, ver cargar().
  const [datosDesdeSnapshot, setDatosDesdeSnapshot] = useState<string | null>(null);
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
    fechaFabricacion: "",
    fechaCertificacion: "",
    certificado: "",
    lecturaInicial: "",
  });
  const [nuevaActaCalibracion, setNuevaActaCalibracion] = useState<File | null>(null);


  useEffect(() => {
    const t = setTimeout(() => setFiltroDebounced(filtro), 300);
    return () => clearTimeout(t);
  }, [filtro]);

  // Ver el mismo comentario en SuscriptoresPage.tsx: si cambian varios filtros seguido (ej.
  // llegar desde el Dashboard con ?estado=X), pueden dispararse dos fetches casi juntos y
  // resolver desordenados — este guard descarta la respuesta si ya no es la petición más
  // reciente en vez de dejar que pise la vista con datos viejos.
  const peticionIdRef = useRef(0);
  async function cargar() {
    const idPeticion = ++peticionIdRef.current;
    setCargando(true);
    const filtros = {
      q: filtroDebounced,
      estado: filtroEstado,
      marca: filtroMarca,
      condicion: filtroCondicion,
      modeloId: filtroModelo ? Number(filtroModelo) : undefined,
      diametroId: filtroDiametro ? Number(filtroDiametro) : undefined,
      tipo: filtroTipo,
      sort: orden.campo,
      dir: orden.dir,
    };
    try {
      const [resultado, ma, mo, lo, di] = await Promise.all([
        api.medidores.listPaginado(pagina, porPagina, filtros),
        api.marcas.list(),
        api.modelos.list(),
        api.lotes.list(),
        api.diametros.list(),
      ]);
      if (idPeticion !== peticionIdRef.current) return;
      setMedidores(resultado.data);
      setTotal(resultado.total);
      setMarcas(ma);
      setModelos(mo);
      setLotes(lo);
      setDiametros(di);
      setSeleccionados(new Set());
      setDatosDesdeSnapshot(null);
      setCargando(false);
    } catch {
      // Sin conexión: si se activó "Modo de salida" antes de salir, se reconstruye TODO (listado
      // + catálogos) desde el snapshot completo en IndexedDB en vez de dejar la tabla cargando
      // para siempre.
      const snapshot = await leerSnapshot();
      if (idPeticion !== peticionIdRef.current) return;
      if (snapshot) {
        const resultado = listarMedidoresOffline(snapshot, { pagina, porPagina, ...filtros });
        setMedidores(resultado.data);
        setTotal(resultado.total);
        setMarcas(snapshot.marcas);
        setModelos(snapshot.modelos);
        setLotes(snapshot.lotes);
        setDiametros(snapshot.diametros);
        setDatosDesdeSnapshot(snapshot.generadoEn);
      } else {
        setMedidores([]);
        setTotal(0);
      }
      setSeleccionados(new Set());
      setCargando(false);
    }
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

  async function verificarSerial(e: React.FormEvent) {
    e.preventDefault();
    const serial = nuevo.serial.trim();
    if (!serial) return;
    setVerificandoSerial(true);
    setSerialError(null);
    try {
      const { disponible } = await api.medidores.serialDisponible(serial);
      if (disponible) setPasoAgregar("resto");
      else setSerialError(`Ya existe un medidor con el serial "${serial}".`);
    } catch (err) {
      mostrarError(err, "no se pudo verificar el serial");
    } finally {
      setVerificandoSerial(false);
    }
  }

  async function crearMedidor(e: React.FormEvent) {
    e.preventDefault();
    if (
      !nuevo.serial ||
      !nuevo.marcaId ||
      !nuevo.modeloId ||
      !nuevo.diametroId ||
      !nuevo.fechaFabricacion ||
      !nuevo.fechaCertificacion ||
      !nuevo.certificado ||
      nuevo.lecturaInicial === ""
    )
      return;
    setCreandoMedidor(true);
    try {
      const creado = await api.medidores.create({
        serial: nuevo.serial,
        marcaId: Number(nuevo.marcaId),
        modeloId: Number(nuevo.modeloId),
        diametroId: Number(nuevo.diametroId),
        loteId: nuevo.loteId ? Number(nuevo.loteId) : undefined,
        fechaFabricacion: nuevo.fechaFabricacion,
        fechaCertificacion: nuevo.fechaCertificacion,
        certificado: nuevo.certificado,
        lecturaInicial: Number(nuevo.lecturaInicial),
      });
      if (nuevaActaCalibracion) {
        await api.medidores.subirActaCalibracion(creado.id, nuevaActaCalibracion);
      }
      setNuevo({
        serial: "",
        marcaId: "",
        modeloId: "",
        diametroId: "",
        loteId: "",
        fechaFabricacion: "",
        fechaCertificacion: "",
        certificado: "",
        lecturaInicial: "",
      });
      setNuevaActaCalibracion(null);
      cerrarAgregar();
      cargar();
    } catch (err) {
      // Si el serial pasó la verificación previa pero igual chocó al crear (dos personas
      // agregando casi al mismo tiempo), se avisa y se manda de vuelta al paso del serial.
      mostrarError(err, "no se pudo agregar el medidor");
      setPasoAgregar("serial");
    } finally {
      setCreandoMedidor(false);
    }
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
      {datosDesdeSnapshot && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          Sin conexión — mostrando datos del "Modo de salida" del{" "}
          {new Date(datosDesdeSnapshot).toLocaleString("es-CO", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          .
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-4">
        <button
          onClick={() => {
            setPasoAgregar("serial");
            setSerialError(null);
            setModalAgregarAbierto(true);
          }}
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
          descripcion="La clave es el NUID del suscriptor. Completa serial, marca, modelo, tipo, diámetro, fecha de instalación, instalador, fecha de fabricación, fecha de calibración y N° de certificado; las marcas/modelos/diámetros/lotes que no existan en el catálogo se crean automáticamente. Si dejas el NUID vacío pero pones el SERIAL, el medidor queda 'en bodega' (disponible, sin asignar a nadie). Para viviendas multiusuario (varios NUID, un solo medidor), en NUID COTITULARES lista los NUID adicionales separados por coma en la fila del titular. La columna INSTALADO POR debe coincidir con el nombre de un usuario activo del sistema (no cualquier texto). Antes de importar, el archivo se valida (NUID existente, tipo válido, serial repetido o ya asignado, fechas válidas, cotitulares válidos, instalador reconocido)."
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
                className="rounded-lg p-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-700 dark:text-slate-400">
              El medidor queda "en bodega". La asignación a un suscriptor se hace desde la ficha del suscriptor.
            </p>

            {pasoAgregar === "serial" && (
              <form className="flex flex-col gap-3" onSubmit={verificarSerial}>
                <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                  Serial *
                  <input
                    autoFocus
                    placeholder="Serial del medidor"
                    value={nuevo.serial}
                    onChange={(e) => {
                      setNuevo({ ...nuevo, serial: e.target.value });
                      setSerialError(null);
                    }}
                    className={inputClass}
                    required
                  />
                </label>
                {serialError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                    {serialError}
                  </p>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-500">
                  Primero se verifica que el serial no esté ya en uso, antes de pedir el resto de los datos.
                </p>
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
                    disabled={verificandoSerial || !nuevo.serial.trim()}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
                  >
                    {verificandoSerial ? "Verificando..." : "Continuar"}
                  </button>
                </div>
              </form>
            )}

            {pasoAgregar === "resto" && (
            <form className="flex flex-col gap-3" onSubmit={crearMedidor}>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                <span className="text-slate-700 dark:text-slate-300">
                  Serial: <strong className="text-slate-900 dark:text-slate-100">{nuevo.serial}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setPasoAgregar("serial")}
                  className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  Cambiar
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={nuevo.marcaId}
                  onChange={(e) => setNuevo({ ...nuevo, marcaId: e.target.value, modeloId: "", diametroId: "" })}
                  className={inputClass}
                  required
                >
                  <option value="" disabled hidden>Marca... *</option>
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
                  required
                >
                  <option value="" disabled hidden>Modelo... *</option>
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
                  required
                >
                  <option value="" disabled hidden>Diámetro... *</option>
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
                  Tipo: <span className="font-medium">{tipoLabel(modeloSeleccionado.tipo)}</span>
                  {modeloSeleccionado.clasePrecision && (
                    <>
                      {" "}
                      · Clase: <span className="font-medium">{modeloSeleccionado.clasePrecision}</span>
                    </>
                  )}{" "}
                  (definido por el modelo)
                  {diametrosDelModelo.length === 0 && " · este modelo no tiene diámetros configurados en el Catálogo"}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                  Fecha de fabricación *
                  <input
                    type="date"
                    value={nuevo.fechaFabricacion}
                    onChange={(e) => setNuevo({ ...nuevo, fechaFabricacion: e.target.value })}
                    className={inputClass}
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                  Fecha de calibración *
                  <input
                    type="date"
                    value={nuevo.fechaCertificacion}
                    onChange={(e) => setNuevo({ ...nuevo, fechaCertificacion: e.target.value })}
                    className={inputClass}
                    required
                  />
                </label>
              </div>
              <input
                placeholder="N° certificado *"
                value={nuevo.certificado}
                onChange={(e) => setNuevo({ ...nuevo, certificado: e.target.value })}
                className={inputClass}
                required
              />
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                Lectura inicial (m³) *
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={nuevo.lecturaInicial}
                  onChange={(e) => setNuevo({ ...nuevo, lecturaInicial: e.target.value })}
                  className={inputClass}
                  required
                />
                <span className="text-[11px] font-normal text-slate-500 dark:text-slate-500">
                  Valor de fábrica con el que arranca el medidor (0 si empieza en 0). Queda fijo desde que entra al
                  inventario, no cuando se instala.
                </span>
              </label>
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
                  onClick={() => setPasoAgregar("serial")}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Atrás
                </button>
                <button
                  type="submit"
                  disabled={creandoMedidor}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  {creandoMedidor ? "Agregando..." : "Agregar al inventario"}
                </button>
              </div>
            </form>
            )}
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
            <select
              value={porPagina}
              onChange={(e) => setPorPaginaManual(Number(e.target.value))}
              className={inputClass}
            >
              {[...new Set([porPagina, 5, 10, 25, 50, 100])]
                .sort((a, b) => a - b)
                .map((n) => (
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

      <div ref={contenedorRef} />
      {cargando && medidores.length === 0 ? (
        <>
          <div className="hidden md:block">
            <SkeletonTabla columnas={8} filas={porPagina} />
          </div>
          <div className="md:hidden">
            <SkeletonLista filas={Math.min(porPagina, 5)} />
          </div>
        </>
      ) : (
        <div
          className={`transition-opacity duration-150 ${cargando ? "pointer-events-none opacity-40" : "opacity-100"}`}
        >
        <div className="hidden md:block overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:border-slate-800 dark:bg-slate-900">
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
                  onClick={() => setDetalleMedidor(m)}
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
                      className="text-slate-600 dark:text-slate-400 hover:text-red-600"
                      title="Eliminar medidor"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {medidores.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6">
                    <EmptyState mensaje="Sin resultados." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-2 md:hidden">
          {medidores.map((m) => (
            <ListCard key={m.id}>
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setDetalleMedidor(m)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="font-semibold text-slate-800 dark:text-slate-100">{m.serial ?? "Sin serial"}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    {m.marcaCat?.nombre ?? "-"} · {m.modeloCat?.nombre ?? "-"} · {m.diametroCat?.valor ?? "-"}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    Lote: {m.lote ? `${m.lote.serialInicial}-${m.lote.serialFinal}` : "-"}
                  </div>
                </button>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className="flex items-center gap-1.5">
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
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
                        Dañado
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => eliminarMedidor(m)}
                    className="text-slate-600 dark:text-slate-400 hover:text-red-600"
                    title="Eliminar medidor"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </ListCard>
          ))}
          {medidores.length === 0 && <EmptyState mensaje="Sin resultados." />}
        </div>
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
          onVerSuscriptor={
            detalleMedidor.suscriptorId
              ? () => {
                  setDetalleSuscriptorId(detalleMedidor.suscriptorId!);
                  setDetalleMedidor(null);
                }
              : undefined
          }
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
  const [variantes, setVariantes] = useState<VarianteMedidor[]>([]);
  const [modalMarcaAbierto, setModalMarcaAbierto] = useState(false);
  const [marcaEnModal, setMarcaEnModal] = useState<MarcaMedidor | null>(null);

  const [nuevoDiametro, setNuevoDiametro] = useState("");
  const [editandoDiametro, setEditandoDiametro] = useState<{ id: number; valor: string } | null>(null);

  const [nuevoLote, setNuevoLote] = useState({ serialInicial: "", serialFinal: "" });
  const [editandoLote, setEditandoLote] = useState<{ id: number; serialInicial: string; serialFinal: string } | null>(null);

  const [nuevaVariante, setNuevaVariante] = useState({ codigo: "", etiqueta: "", tipo: "velocidad" });
  const [editandoVariante, setEditandoVariante] = useState<{
    id: number;
    codigo: string;
    etiqueta: string;
    tipo: string;
  } | null>(null);

  const { error, run } = useErrorHandler();
  const { pedirConfirmacion, modal } = useConfirm();

  async function cargar() {
    try {
      const [ma, d, lo, va] = await Promise.all([
        api.marcas.list(),
        api.diametros.list(),
        api.lotes.list(),
        api.variantes.list(),
      ]);
      setMarcas(ma);
      setDiametros(d);
      setLotes(lo);
      setVariantes(va);
    } catch {
      // Sin conexión: catálogo de solo lectura desde el snapshot (editarlo sin conexión no tiene
      // sentido de todas formas, no hay dónde guardarlo).
      const snapshot = await leerSnapshot();
      if (!snapshot) return;
      setMarcas(snapshot.marcas);
      setDiametros(snapshot.diametros);
      setLotes(snapshot.lotes);
      setVariantes(snapshot.variantes);
    }
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

  async function crearVariante(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevaVariante.codigo.trim() || !nuevaVariante.etiqueta.trim()) return;
    await run(async () => {
      await api.variantes.create({
        codigo: nuevaVariante.codigo.trim(),
        etiqueta: nuevaVariante.etiqueta.trim(),
        tipo: nuevaVariante.tipo,
      });
      setNuevaVariante({ codigo: "", etiqueta: "", tipo: "velocidad" });
      await cargar();
    });
  }

  async function guardarEdicionVariante() {
    if (!editandoVariante || !editandoVariante.codigo.trim() || !editandoVariante.etiqueta.trim()) return;
    await run(async () => {
      await api.variantes.update(editandoVariante.id, {
        codigo: editandoVariante.codigo.trim(),
        etiqueta: editandoVariante.etiqueta.trim(),
        tipo: editandoVariante.tipo,
      });
      setEditandoVariante(null);
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
            <EmptyState mensaje='Aún no hay marcas. Crea la primera con el botón "Nueva marca".' className="py-2" />
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
                      <div className="flex justify-end gap-3 text-slate-600 dark:text-slate-400">
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
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500"
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
                        <button onClick={() => setEditandoDiametro(null)} className="text-slate-600 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={d.id}>
                    <td className="py-1.5">{d.valor}</td>
                    <td className="py-1.5 text-right">
                      <span className="flex justify-end gap-2 text-slate-600 dark:text-slate-400">
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
                  <td colSpan={2} className="py-2">
                    <EmptyState mensaje="Aún no hay diámetros. Agrega el primero arriba." className="py-2" />
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
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500"
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
                      <button onClick={() => setEditandoLote(null)} className="text-slate-600 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
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
                    <span className="flex justify-end gap-2 text-slate-600 dark:text-slate-400">
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
                <td colSpan={3} className="py-2">
                  <EmptyState mensaje="Aún no hay lotes. Agrega el primero arriba." className="py-2" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Tag className="h-4 w-4 text-brand-500" />
          Variantes
        </h3>
        <p className="mb-3 text-xs text-slate-700 dark:text-slate-400">
          Sub-variante del tipo de medición (ej. CU/CM para velocidad, PR/DN para volumétrico). Se
          elige una por modelo dentro del cuadro de cada marca.
        </p>
        <form className="mb-3 flex flex-wrap gap-2" onSubmit={crearVariante}>
          <input
            placeholder="Código (ej. CU)"
            value={nuevaVariante.codigo}
            onChange={(e) => setNuevaVariante({ ...nuevaVariante, codigo: e.target.value })}
            className={`${inputClass} w-28`}
          />
          <input
            placeholder="Etiqueta (ej. Chorro Único)"
            value={nuevaVariante.etiqueta}
            onChange={(e) => setNuevaVariante({ ...nuevaVariante, etiqueta: e.target.value })}
            className={`${inputClass} flex-1`}
          />
          <select
            value={nuevaVariante.tipo}
            onChange={(e) => setNuevaVariante({ ...nuevaVariante, tipo: e.target.value })}
            className={inputClass}
          >
            <option value="velocidad">Velocidad</option>
            <option value="volumetrico">Volumétrico</option>
          </select>
          <button
            type="submit"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500"
          >
            <Plus className="h-4 w-4" />
            Agregar
          </button>
        </form>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-700 dark:border-slate-800 dark:text-slate-400">
              <th className="py-2 font-medium">Código</th>
              <th className="py-2 font-medium">Etiqueta</th>
              <th className="py-2 font-medium">Tipo</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {variantes.map((v) =>
              editandoVariante?.id === v.id ? (
                <tr key={v.id}>
                  <td colSpan={4} className="py-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={editandoVariante.codigo}
                        onChange={(e) => setEditandoVariante({ ...editandoVariante, codigo: e.target.value })}
                        className={`${inputClass} w-24 py-1`}
                        autoFocus
                      />
                      <input
                        value={editandoVariante.etiqueta}
                        onChange={(e) => setEditandoVariante({ ...editandoVariante, etiqueta: e.target.value })}
                        className={`${inputClass} flex-1 py-1`}
                      />
                      <select
                        value={editandoVariante.tipo}
                        onChange={(e) => setEditandoVariante({ ...editandoVariante, tipo: e.target.value })}
                        className={`${inputClass} py-1`}
                      >
                        <option value="velocidad">Velocidad</option>
                        <option value="volumetrico">Volumétrico</option>
                      </select>
                      <button onClick={guardarEdicionVariante} className="text-emerald-600 hover:text-emerald-500">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditandoVariante(null)} className="text-slate-600 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={v.id}>
                  <td className="py-1.5 font-medium text-slate-700 dark:text-slate-200">{v.codigo}</td>
                  <td className="py-1.5 text-slate-700 dark:text-slate-400">{v.etiqueta}</td>
                  <td className="py-1.5 text-slate-700 dark:text-slate-400">{tipoLabel(v.tipo)}</td>
                  <td className="py-1.5 text-right">
                    <span className="flex justify-end gap-2 text-slate-600 dark:text-slate-400">
                      <button
                        onClick={() =>
                          setEditandoVariante({ id: v.id, codigo: v.codigo, etiqueta: v.etiqueta, tipo: v.tipo })
                        }
                        className="hover:text-brand-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          pedirConfirmacion(`¿Eliminar la variante "${v.etiqueta}"?`, () =>
                            run(async () => {
                              await api.variantes.remove(v.id);
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
            {variantes.length === 0 && (
              <tr>
                <td colSpan={4} className="py-2">
                  <EmptyState mensaje="Aún no hay variantes. Agrega la primera arriba." className="py-2" />
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
          variantesCatalogo={variantes}
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
  variantesCatalogo,
  onCreada,
  onCerrar,
}: {
  marca: MarcaMedidor | null;
  diametrosCatalogo: DiametroMedidor[];
  variantesCatalogo: VarianteMedidor[];
  onCreada: (marca: MarcaMedidor) => void;
  onCerrar: () => void;
}) {
  const [nombreMarca, setNombreMarca] = useState(marca?.nombre ?? "");
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const { error, run } = useErrorHandler();
  const { pedirConfirmacion, modal: modalConfirmacion } = useConfirm();
  const { saliendo, cerrar } = useCierreAnimado(onCerrar);
  // Una marca recién creada en este modal (no una ya existente que se está editando) no se
  // puede cerrar sin haberle agregado al menos un modelo — si no, quedaría una marca "vacía"
  // en el catálogo, inútil hasta que alguien vuelva a completarla.
  const [marcaNuevaSinModelo, setMarcaNuevaSinModelo] = useState(false);
  const [avisoCierre, setAvisoCierre] = useState<string | null>(null);
  function intentarCerrar() {
    if (marcaNuevaSinModelo && modelos.length === 0) {
      setAvisoCierre('Agrega al menos un modelo antes de cerrar — si no, "' + nombreMarca + '" queda en el catálogo sin ningún modelo.');
      return;
    }
    cerrar();
  }

  const [modelos, setModelos] = useState<ModeloMedidor[]>([]);
  const [cargandoModelos, setCargandoModelos] = useState(false);
  const [formModelo, setFormModelo] = useState<{
    id: number | null;
    nombre: string;
    tipo: string;
    clasePrecision: string;
    varianteId: string;
    diametroIds: number[];
  }>({
    id: null,
    nombre: "",
    tipo: "",
    clasePrecision: "",
    varianteId: "",
    diametroIds: [],
  });

  const variantesDelTipo = variantesCatalogo.filter((v) => v.tipo === formModelo.tipo);

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
        setMarcaNuevaSinModelo(true);
        onCreada(creada);
      }
    });
    setGuardandoNombre(false);
  }

  function limpiarFormModelo() {
    setFormModelo({ id: null, nombre: "", tipo: "", clasePrecision: "", varianteId: "", diametroIds: [] });
  }

  function editarModelo(mo: ModeloMedidor) {
    setFormModelo({
      id: mo.id,
      nombre: mo.nombre,
      tipo: mo.tipo,
      clasePrecision: mo.clasePrecision ?? "",
      varianteId: mo.varianteId ? String(mo.varianteId) : "",
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
    if (!marca || !formModelo.nombre.trim() || !formModelo.tipo || formModelo.diametroIds.length === 0) return;
    await run(async () => {
      if (formModelo.id) {
        await api.modelos.update(formModelo.id, {
          nombre: formModelo.nombre.trim(),
          tipo: formModelo.tipo,
          marcaId: marca.id,
          clasePrecision: formModelo.clasePrecision.trim() || undefined,
          varianteId: formModelo.varianteId ? Number(formModelo.varianteId) : undefined,
        });
        await api.modelos.setDiametros(formModelo.id, formModelo.diametroIds);
      } else {
        const creado = await api.modelos.create({
          nombre: formModelo.nombre.trim(),
          tipo: formModelo.tipo,
          marcaId: marca.id,
          clasePrecision: formModelo.clasePrecision.trim() || undefined,
          varianteId: formModelo.varianteId ? Number(formModelo.varianteId) : undefined,
        });
        if (formModelo.diametroIds.length > 0) {
          await api.modelos.setDiametros(creado.id, formModelo.diametroIds);
        }
      }
      limpiarFormModelo();
      setAvisoCierre(null);
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
          <button onClick={intentarCerrar} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </div>
          )}
          {avisoCierre && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              {avisoCierre}
            </div>
          )}

          <form onSubmit={guardarNombre} className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
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
                <div className="flex flex-wrap gap-2">
                  <input
                    placeholder="Nombre de modelo"
                    value={formModelo.nombre}
                    onChange={(e) => setFormModelo({ ...formModelo, nombre: e.target.value })}
                    className={`${inputClass} min-w-0 flex-1 basis-40`}
                    required
                  />
                  <select
                    value={formModelo.tipo}
                    onChange={(e) => setFormModelo({ ...formModelo, tipo: e.target.value, varianteId: "" })}
                    className={`${inputClass} min-w-0 flex-1 basis-32`}
                    required
                  >
                    <option value="" disabled>
                      Seleccione tipo…
                    </option>
                    <option value="volumetrico">Volumétrico</option>
                    <option value="velocidad">Velocidad</option>
                  </select>
                  <select
                    value={formModelo.varianteId}
                    onChange={(e) => setFormModelo({ ...formModelo, varianteId: e.target.value })}
                    className={`${inputClass} min-w-0 flex-1 basis-32`}
                    disabled={!formModelo.tipo}
                  >
                    <option value="">Variante...</option>
                    {variantesDelTipo.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.codigo} — {v.etiqueta}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Clase de precisión (ej. B, R100)"
                    value={formModelo.clasePrecision}
                    onChange={(e) => setFormModelo({ ...formModelo, clasePrecision: e.target.value })}
                    className={`${inputClass} min-w-0 flex-1 basis-40`}
                  />
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-700 dark:text-slate-400">
                    Diámetros disponibles para este modelo (marca al menos uno) *
                  </p>
                  {diametrosCatalogo.length === 0 ? (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
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
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  "{marca.nombre}" aún no tiene modelos. Usa el formulario de arriba para crear el
                  primero.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-700 dark:border-slate-800 dark:text-slate-400">
                      <th className="py-2 font-medium">Modelo</th>
                      <th className="py-2 font-medium">Tipo</th>
                      <th className="py-2 font-medium">Variante</th>
                      <th className="py-2 font-medium">Clase</th>
                      <th className="py-2 font-medium">Diámetros</th>
                      <th className="py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {modelos.map((mo) => (
                      <tr key={mo.id}>
                        <td className="py-2 font-medium text-slate-700 dark:text-slate-200">{mo.nombre}</td>
                        <td className="py-2 text-slate-700 dark:text-slate-400">{tipoLabel(mo.tipo)}</td>
                        <td className="py-2 text-slate-700 dark:text-slate-400">{mo.varianteCat?.codigo ?? "-"}</td>
                        <td className="py-2 text-slate-700 dark:text-slate-400">{mo.clasePrecision || "-"}</td>
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
                          <div className="flex justify-end gap-2 text-slate-600 dark:text-slate-400">
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
  const [filtro, setFiltro] = useState("");
  const [firmadaFiltro, setFirmadaFiltro] = useState("");
  // Más viejas primero por defecto — es el orden que se necesita para revisar el histórico de
  // instalaciones desde el principio, no lo último capturado.
  const [orden, setOrden] = useState<Orden>({ campo: "fechaInstalacion", dir: "asc" });

  useEffect(() => {
    api.actas
      .list()
      .then((a) => {
        setActas(a);
        setCargando(false);
      })
      .catch(async () => {
        // Sin conexión: se reconstruye desde el snapshot del "Modo de salida" (mismo include que
        // GET /api/actas, ver backend/.../offline.ts).
        const snapshot = await leerSnapshot();
        setActas(snapshot?.actas ?? []);
        setCargando(false);
      });
  }, []);

  const filtradas = actas
    .filter((a) => {
      if (firmadaFiltro === "firmada" && !a.actaFirmadaUrl) return false;
      if (firmadaFiltro === "sin_firmar" && a.actaFirmadaUrl) return false;
      if (!filtro.trim()) return true;
      const texto = filtro.trim().toLowerCase();
      return (
        a.serial?.toLowerCase().includes(texto) ||
        a.suscriptor?.codigo?.toLowerCase().includes(texto) ||
        a.suscriptor?.nombre?.toLowerCase().includes(texto) ||
        (a.usuario?.nombre ?? a.instaladoPor)?.toLowerCase().includes(texto)
      );
    })
    .sort((a, b) => {
      const dir = orden.dir === "asc" ? 1 : -1;
      switch (orden.campo) {
        case "suscriptor":
          return dir * (a.suscriptor?.nombre ?? "").localeCompare(b.suscriptor?.nombre ?? "");
        case "serial":
          return dir * (a.serial ?? "").localeCompare(b.serial ?? "");
        case "instaladoPor":
          return dir * (a.usuario?.nombre ?? a.instaladoPor ?? "").localeCompare(b.usuario?.nombre ?? b.instaladoPor ?? "");
        case "actaFirmada":
          return dir * (Number(!!a.actaFirmadaUrl) - Number(!!b.actaFirmadaUrl));
        case "fechaInstalacion":
        default:
          return dir * (new Date(a.fechaInstalacion).getTime() - new Date(b.fechaInstalacion).getTime());
      }
    });

  return (
    <div>
      <p className="mb-4 text-sm text-slate-700 dark:text-slate-400">
        Historial de instalaciones registradas. Para asignar un medidor a un suscriptor, ve a la ficha del suscriptor
        en la pestaña Suscriptores.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <BusquedaInput
          placeholder="Buscar por serial, NUID, suscriptor o instalador..."
          value={filtro}
          onChange={setFiltro}
          className="w-full max-w-xs"
        />
        <select value={firmadaFiltro} onChange={(e) => setFirmadaFiltro(e.target.value)} className={inputClass}>
          <option value="">Firmada o no</option>
          <option value="firmada">Con acta firmada</option>
          <option value="sin_firmar">Sin acta firmada</option>
        </select>
        {!cargando && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {filtradas.length} de {actas.length}
          </span>
        )}
      </div>
      {cargando ? (
        <SkeletonLista />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-800 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <ThOrdenable campo="fechaInstalacion" orden={orden} onOrdenar={(c) => setOrden(alternarOrden(orden, c))} className="px-4 py-3 font-medium">
                  Fecha
                </ThOrdenable>
                <ThOrdenable campo="suscriptor" orden={orden} onOrdenar={(c) => setOrden(alternarOrden(orden, c))} className="px-4 py-3 font-medium">
                  Suscriptor
                </ThOrdenable>
                <ThOrdenable campo="serial" orden={orden} onOrdenar={(c) => setOrden(alternarOrden(orden, c))} className="px-4 py-3 font-medium">
                  Serial
                </ThOrdenable>
                <ThOrdenable campo="instaladoPor" orden={orden} onOrdenar={(c) => setOrden(alternarOrden(orden, c))} className="px-4 py-3 font-medium">
                  Instalado por
                </ThOrdenable>
                <ThOrdenable campo="actaFirmada" orden={orden} onOrdenar={(c) => setOrden(alternarOrden(orden, c))} className="px-4 py-3 font-medium">
                  Acta firmada
                </ThOrdenable>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtradas.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5">{fmtFecha(a.fechaInstalacion, {})}</td>
                  <td className="px-4 py-2.5">
                    {a.suscriptor ? `${a.suscriptor.codigo} — ${a.suscriptor.nombre}` : "-"}
                  </td>
                  <td className="px-4 py-2.5">{a.serial}</td>
                  <td className="px-4 py-2.5">{a.usuario?.nombre ?? a.instaladoPor}</td>
                  <td className="px-4 py-2.5">
                    {a.actaFirmadaUrl ? (
                      <a
                        href={urlFoto(a.actaFirmadaUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Ver PDF firmado
                      </a>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400">Sin subir</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6">
                    <EmptyState
                      mensaje={actas.length === 0 ? "Aún no hay actas de instalación." : "Ningún acta coincide con el filtro."}
                      icon={FileText}
                    />
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
