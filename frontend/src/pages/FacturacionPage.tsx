import { useEffect, useRef, useState } from "react";
import {
  Receipt,
  FileText,
  Wallet,
  HandCoins,
  SlidersHorizontal,
  Plus,
  Trash2,
  Loader2,
  Download,
  X,
  Ban,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  Droplets,
  Waves,
  LayoutTemplate,
  ScanLine,
  FileMinus2,
  CalendarClock,
} from "lucide-react";
import {
  api,
  Tarifa,
  TarifaPayload,
  FacturaResumen,
  FacturaDetalle,
  PagoItem,
  NotaItem,
  AcuerdoPagoItem,
  CarteraResumen,
  CarteraSuscriptor,
  Estrato,
  PasoVerificacionPeriodo,
  Suscriptor,
} from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../components/ConfirmModal";
import { SkeletonTabla } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import BusquedaInput from "../components/BusquedaInput";
import VerificacionPeriodoPanel from "../components/VerificacionPeriodoPanel";
import PlantillasFacturaTab from "../components/PlantillasFacturaTab";
import RecaudoRapidoTab from "../components/RecaudoRapidoTab";
import { inputClass } from "../lib/ui";

const fmtPesos = (v: number | string) => `$${Number(v).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;

// Mismo criterio del backend (lib/periodo.ts): antes del día 20, el periodo facturable es el mes anterior.
function periodoFacturableActual(): string {
  const now = new Date();
  let anio = now.getFullYear();
  let mes = now.getDate() < 20 ? now.getMonth() : now.getMonth() + 1;
  if (mes === 0) {
    mes = 12;
    anio -= 1;
  }
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

const ESTADO_FACTURA_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  anulada: "Anulada",
};
const ESTADO_FACTURA_COLORS: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  pagada: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  anulada: "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
};

type Tab = "facturas" | "recaudo" | "cartera" | "pagos" | "notas" | "acuerdos" | "tarifas" | "plantillas";

export default function FacturacionPage() {
  const [tab, setTab] = useState<Tab>("facturas");
  const tabs: { id: Tab; label: string; icon: typeof Receipt }[] = [
    { id: "facturas", label: "Facturas", icon: FileText },
    { id: "recaudo", label: "Recaudo", icon: ScanLine },
    { id: "cartera", label: "Cartera", icon: Wallet },
    { id: "pagos", label: "Pagos", icon: HandCoins },
    { id: "notas", label: "Notas", icon: FileMinus2 },
    { id: "acuerdos", label: "Acuerdos de pago", icon: CalendarClock },
    { id: "tarifas", label: "Tarifas", icon: SlidersHorizontal },
    { id: "plantillas", label: "Plantillas", icon: LayoutTemplate },
  ];

  return (
    <div>
      <h1 className="mb-3 flex items-center gap-2 text-xl font-bold sm:mb-5 sm:text-2xl">
        <Receipt className="h-6 w-6 text-brand-500" />
        Facturación
      </h1>
      <div className="mb-4 flex items-center gap-1 overflow-x-auto rounded-full border border-slate-200 p-1 dark:border-slate-800 w-fit max-w-full">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === id
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
      {tab === "facturas" && <FacturasTab />}
      {tab === "recaudo" && <RecaudoRapidoTab />}
      {tab === "cartera" && <CarteraTab />}
      {tab === "pagos" && <PagosTab />}
      {tab === "notas" && <NotasTab />}
      {tab === "acuerdos" && <AcuerdosPagoTab />}
      {tab === "tarifas" && <TarifasTab />}
      {tab === "plantillas" && <PlantillasFacturaTab />}
    </div>
  );
}

function Paginacion({ pagina, totalPaginas, onCambiar }: { pagina: number; totalPaginas: number; onCambiar: (p: number) => void }) {
  return (
    <div className="mt-3 flex items-center justify-end gap-2">
      <button
        onClick={() => onCambiar(Math.max(1, pagina - 1))}
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
        onClick={() => onCambiar(Math.min(totalPaginas, pagina + 1))}
        disabled={pagina >= totalPaginas}
        className="flex items-center gap-1 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        Siguiente
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ============================== FACTURAS ==============================

function FacturasTab() {
  const { usuario } = useAuth();
  const puedeGenerar = usuario?.permisos?.includes("facturacion_avanzado") ?? false;
  const { mostrar, mostrarError } = useToast();
  const [periodo, setPeriodo] = useState(periodoFacturableActual());
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [filtro, setFiltro] = useState("");
  const [filtroDebounced, setFiltroDebounced] = useState("");
  const [facturas, setFacturas] = useState<FacturaResumen[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [generando, setGenerando] = useState(false);
  const [jobGeneracion, setJobGeneracion] = useState<string | null>(null);
  const [progresoGeneracion, setProgresoGeneracion] = useState<{ procesados: number; total: number } | null>(null);
  const [descargandoLote, setDescargandoLote] = useState(false);
  const [estadoPeriodo, setEstadoPeriodo] = useState<"abierto" | "cerrado" | null>(null);
  const [verificacion, setVerificacion] = useState<PasoVerificacionPeriodo[] | null>(null);
  const verificacionCompleta = verificacion !== null && verificacion.every((p) => p.ok);
  const [barrioPdf, setBarrioPdf] = useState("");
  const [rutaPdf, setRutaPdf] = useState("");
  const [barrios, setBarrios] = useState<{ id: number; nombre: string }[]>([]);
  // Con qué diseño se descarga el PDF: "" = el completo de siempre (con membrete); si no,
  // el id de una plantilla de sobreimpresión (ver pestaña Plantillas).
  const [plantillaPdf, setPlantillaPdf] = useState("");
  const [plantillas, setPlantillas] = useState<{ id: number; nombre: string }[]>([]);
  const { pedirConfirmacion, modal } = useConfirm();
  const porPagina = 10;

  useEffect(() => {
    api.facturacion.periodos.estado(periodo).then((r) => setEstadoPeriodo(r.estado));
    setVerificacion(null);
  }, [periodo]);

  useEffect(() => {
    api.suscriptores.barrios().then(setBarrios);
    api.facturacion.plantillas.list().then(setPlantillas);
  }, []);

  // Polling del progreso de la generación en segundo plano (ver backend: lib/facturacionJobs.ts).
  // Corre fuera del modal de confirmación para que la barra de progreso quede visible en la
  // página en vez de tapada detrás del diálogo "Un momento...".
  useEffect(() => {
    if (!jobGeneracion) return;
    const intervalo = setInterval(async () => {
      try {
        const estado = await api.facturacion.generarEstado(jobGeneracion);
        setProgresoGeneracion({ procesados: estado.procesados, total: estado.total });
        if (estado.fase === "listo") {
          clearInterval(intervalo);
          setJobGeneracion(null);
          setProgresoGeneracion(null);
          mostrar(`Se generaron ${estado.creadas} facturas por ${fmtPesos(estado.totalFacturado)}.`, "exito");
          await cargar();
        } else if (estado.fase === "error") {
          clearInterval(intervalo);
          setJobGeneracion(null);
          setProgresoGeneracion(null);
          mostrarError(new Error(estado.error ?? "Error al generar la facturación"), "no se pudo generar la facturación");
        }
      } catch (err) {
        clearInterval(intervalo);
        setJobGeneracion(null);
        setProgresoGeneracion(null);
        mostrarError(err, "se perdió la conexión mientras se generaba la facturación");
      }
    }, 800);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobGeneracion]);

  useEffect(() => {
    const t = setTimeout(() => setFiltroDebounced(filtro), 300);
    return () => clearTimeout(t);
  }, [filtro]);
  useEffect(() => {
    setPagina(1);
  }, [periodo, estadoFiltro, filtroDebounced]);

  const peticionIdRef = useRef(0);
  async function cargar() {
    const idPeticion = ++peticionIdRef.current;
    setCargando(true);
    try {
      const r = await api.facturacion.facturas.listPaginado(pagina, porPagina, {
        periodo,
        estado: estadoFiltro || undefined,
        q: filtroDebounced || undefined,
      });
      if (idPeticion !== peticionIdRef.current) return;
      setFacturas(r.data);
      setTotal(r.total);
    } finally {
      if (idPeticion === peticionIdRef.current) setCargando(false);
    }
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, periodo, estadoFiltro, filtroDebounced]);

  async function generar() {
    setGenerando(true);
    try {
      const preview = await api.facturacion.generarPreview(periodo);
      pedirConfirmacion(
        `Se generarán facturas del periodo ${periodo} para ${preview.suscriptores - preview.yaFacturados} suscriptores ` +
          `(${preview.conLectura} con lectura, ${preview.sinMedidor} sin medidor` +
          (preview.omitidos > 0 ? `; ${preview.omitidos} quedan como omitidos por inactivos/sin servicios` : "") +
          (preview.yaFacturados > 0 ? `, ${preview.yaFacturados} ya facturados que se omiten` : "") +
          `). Total estimado: ${fmtPesos(preview.totalEstimado)}. ¿Continuar?`,
        async () => {
          const { id } = await api.facturacion.generarIniciar(periodo);
          setProgresoGeneracion({ procesados: 0, total: preview.suscriptores - preview.yaFacturados });
          setJobGeneracion(id);
        },
        { textoConfirmar: "Generar facturación", textoExito: "Facturación iniciada", variante: "normal" }
      );
    } catch (err) {
      mostrarError(err, "no se pudo preparar la facturación");
    } finally {
      setGenerando(false);
    }
  }

  async function descargarLote() {
    setDescargandoLote(true);
    try {
      await api.facturacion.pdfLote(periodo, {
        barrioId: barrioPdf ? Number(barrioPdf) : undefined,
        ruta: rutaPdf || undefined,
        plantillaId: plantillaPdf ? Number(plantillaPdf) : undefined,
      });
    } catch (err) {
      mostrarError(err, "no se pudo generar el PDF del lote");
    } finally {
      setDescargandoLote(false);
    }
  }

  function deshacerGeneracion() {
    pedirConfirmacion(
      `¿Eliminar TODAS las facturas del periodo ${periodo}? Esto deshace la facturación generada (solo es posible si ninguna tiene pagos). Útil si se generó de prueba o con la tarifa equivocada.`,
      async () => {
        try {
          const r = await api.facturacion.deshacerGeneracion(periodo);
          mostrar(`Se eliminaron ${r.eliminadas} facturas del periodo ${periodo}.`, "exito");
          setEstadoPeriodo(null);
          await cargar();
        } catch (err) {
          mostrarError(err, "no se pudo deshacer la facturación");
          throw err;
        }
      },
      { textoConfirmar: "Eliminar facturación", textoExito: "Facturación eliminada" }
    );
  }

  function cerrarPeriodo() {
    pedirConfirmacion(
      `¿Cerrar el periodo ${periodo}? Las facturas y lecturas de ese mes quedarán congeladas (los pagos se siguen recibiendo). Solo un usuario con facturación avanzada podrá reabrirlo.`,
      async () => {
        try {
          await api.facturacion.periodos.cerrar(periodo);
          setEstadoPeriodo("cerrado");
          mostrar(`Periodo ${periodo} cerrado.`, "exito");
        } catch (err) {
          mostrarError(err, "no se pudo cerrar el periodo");
          throw err;
        }
      },
      { textoConfirmar: "Cerrar periodo", textoExito: "Periodo cerrado", variante: "normal" }
    );
  }

  function reabrirPeriodo() {
    pedirConfirmacion(
      `¿Reabrir el periodo ${periodo}? Quedará registro de quién lo hizo. Úsalo solo si es indispensable corregir algo.`,
      async () => {
        try {
          await api.facturacion.periodos.reabrir(periodo);
          setEstadoPeriodo("abierto");
          mostrar(`Periodo ${periodo} reabierto.`, "info");
        } catch (err) {
          mostrarError(err, "no se pudo reabrir el periodo");
          throw err;
        }
      },
      { textoConfirmar: "Reabrir", textoExito: "Periodo reabierto", variante: "normal" }
    );
  }

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <div>
      {modal}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={inputClass} />
        {estadoPeriodo === "cerrado" ? (
          <span className="flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            <Lock className="h-3 w-3" />
            Periodo cerrado
          </span>
        ) : estadoPeriodo === "abierto" ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
            Periodo abierto
          </span>
        ) : null}
        <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} className={inputClass}>
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendientes</option>
          <option value="pagada">Pagadas</option>
          <option value="anulada">Anuladas</option>
        </select>
        <BusquedaInput placeholder="Buscar por nombre, NUID o No..." value={filtro} onChange={setFiltro} className="w-full max-w-xs" />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">Imprimir:</span>
          <select value={barrioPdf} onChange={(e) => setBarrioPdf(e.target.value)} className={`${inputClass} w-36`}>
            <option value="">Todos los barrios</option>
            {barrios.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
          <input
            placeholder="Ruta (ej. 01-)"
            value={rutaPdf}
            onChange={(e) => setRutaPdf(e.target.value)}
            className={`${inputClass} w-28`}
          />
          <select
            value={plantillaPdf}
            onChange={(e) => setPlantillaPdf(e.target.value)}
            title="Diseño con el que se imprime el PDF"
            className={`${inputClass} w-40`}
          >
            <option value="">Diseño completo</option>
            {plantillas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <button
            onClick={descargarLote}
            disabled={descargandoLote}
            className="btn-accion flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60 dark:border-slate-700 dark:text-brand-400 dark:hover:bg-slate-800"
          >
            {descargandoLote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            PDF del periodo
          </button>
          <VerificacionPeriodoPanel periodo={periodo} onEstadoCambia={setVerificacion} />
          {puedeGenerar && estadoPeriodo !== "cerrado" && (
            <button
              onClick={generar}
              disabled={generando || !verificacionCompleta}
              title={!verificacionCompleta ? "Marca todos los pasos de verificación del periodo antes de facturar" : undefined}
              className="btn-accion flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
            >
              {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Generar facturación
            </button>
          )}
          {puedeGenerar && estadoPeriodo !== "cerrado" && total > 0 && (
            <button
              onClick={deshacerGeneracion}
              className="btn-accion flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
              Deshacer facturación
            </button>
          )}
          {puedeGenerar && estadoPeriodo === "abierto" && total > 0 && (
            <button
              onClick={cerrarPeriodo}
              className="btn-accion flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Lock className="h-4 w-4" />
              Cerrar periodo
            </button>
          )}
          {puedeGenerar && estadoPeriodo === "cerrado" && (
            <button
              onClick={reabrirPeriodo}
              className="btn-accion flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-400"
            >
              <Unlock className="h-4 w-4" />
              Reabrir periodo
            </button>
          )}
        </div>
      </div>

      {progresoGeneracion && (
        <div className="mb-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-brand-800 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generando facturas…
            </span>
            <span>
              {progresoGeneracion.procesados} / {progresoGeneracion.total}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-brand-100 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-300"
              style={{
                width: `${progresoGeneracion.total > 0 ? Math.min(100, (progresoGeneracion.procesados / progresoGeneracion.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {cargando && facturas.length === 0 ? (
        <SkeletonTabla columnas={7} filas={porPagina} />
      ) : (
        <div className={`transition-opacity duration-150 ${cargando ? "pointer-events-none opacity-40" : "opacity-100"}`}>
          <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-800 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <th className="px-3 py-2 font-medium">No.</th>
                  <th className="px-3 py-2 font-medium">NUID</th>
                  <th className="px-3 py-2 font-medium">Suscriptor</th>
                  <th className="px-3 py-2 font-medium text-right">Consumo</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                  <th className="px-3 py-2 font-medium text-right">Saldo</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {facturas.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => setDetalleId(f.id)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2">{f.numero}</td>
                    <td className="px-3 py-2">{f.suscriptor.codigo}</td>
                    <td className="px-3 py-2">{f.suscriptor.nombre}</td>
                    <td className="px-3 py-2 text-right">
                      {Number(f.consumoM3)} m³{f.sinMedidor ? " *" : ""}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{fmtPesos(f.total)}</td>
                    <td className="px-3 py-2 text-right">{f.estado === "anulada" ? "—" : fmtPesos(f.saldo)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_FACTURA_COLORS[f.estado]}`}>
                        {ESTADO_FACTURA_LABELS[f.estado]}
                      </span>
                    </td>
                  </tr>
                ))}
                {facturas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6">
                      <EmptyState mensaje="No hay facturas para este periodo. Usa 'Generar facturación' para emitirlas." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">* consumo predeterminado (sin medidor)</div>
          <Paginacion pagina={pagina} totalPaginas={totalPaginas} onCambiar={setPagina} />
        </div>
      )}

      {detalleId !== null && (
        <FacturaDetalleModal
          facturaId={detalleId}
          onClose={() => {
            setDetalleId(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function FacturaDetalleModal({ facturaId, onClose }: { facturaId: number; onClose: () => void }) {
  const { usuario } = useAuth();
  const puedeAvanzado = usuario?.permisos?.includes("facturacion_avanzado") ?? false;
  const puedePagar = puedeAvanzado || (usuario?.permisos?.includes("pagos_registrar") ?? false);
  const { mostrar, mostrarError } = useToast();
  const [factura, setFactura] = useState<FacturaDetalle | null>(null);
  const [pagoValor, setPagoValor] = useState("");
  const [pagoMedio, setPagoMedio] = useState("efectivo");
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [plantillas, setPlantillas] = useState<{ id: number; nombre: string }[]>([]);
  const [plantillaPdf, setPlantillaPdf] = useState("");
  const [mostrarFormAnular, setMostrarFormAnular] = useState(false);
  const [motivoAnular, setMotivoAnular] = useState("");
  const [radicadoPqrAnular, setRadicadoPqrAnular] = useState("");
  const [anulando, setAnulando] = useState(false);
  const { pedirConfirmacion, modal } = useConfirm();

  async function cargar() {
    setFactura(await api.facturacion.facturas.get(facturaId));
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facturaId]);
  useEffect(() => {
    api.facturacion.plantillas.list().then(setPlantillas);
  }, []);

  async function registrarPago() {
    if (!factura || !pagoValor) return;
    setGuardandoPago(true);
    try {
      await api.facturacion.pagos.crear({ facturaId: factura.id, valor: Number(pagoValor), medio: pagoMedio });
      mostrar("Pago registrado.", "exito");
      setPagoValor("");
      await cargar();
    } catch (err) {
      mostrarError(err, "no se pudo registrar el pago");
    } finally {
      setGuardandoPago(false);
    }
  }

  async function confirmarAnular() {
    if (!factura) return;
    setAnulando(true);
    try {
      await api.facturacion.facturas.anular(factura.id, motivoAnular.trim() || undefined, radicadoPqrAnular.trim() || undefined);
      mostrar("Factura anulada", "exito");
      setMostrarFormAnular(false);
      setMotivoAnular("");
      setRadicadoPqrAnular("");
      await cargar();
    } catch (err) {
      mostrarError(err, "anular la factura");
    } finally {
      setAnulando(false);
    }
  }

  function eliminarPago(pagoId: number, valor: string) {
    pedirConfirmacion(
      `¿Deshacer el pago de ${fmtPesos(valor)}? El saldo de la factura se recalcula solo (vuelve a "pendiente" si queda debiendo).`,
      async () => {
        await api.facturacion.pagos.remove(pagoId);
        await cargar();
      },
      { textoConfirmar: "Deshacer pago", textoExito: "Pago eliminado" }
    );
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 animate-fade-in" onClick={onClose}>
      {modal}
      <div
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl animate-scale-in dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {!factura ? (
          <div className="flex h-40 items-center justify-center text-slate-500 dark:text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">Factura No. {factura.numero}</h2>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  {factura.suscriptor.codigo} · {factura.suscriptor.nombre} · Periodo {factura.periodo.slice(0, 7)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_FACTURA_COLORS[factura.estado]}`}>
                  {ESTADO_FACTURA_LABELS[factura.estado]}
                </span>
                <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-300">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {factura.estado === "anulada" && (factura.observaciones || factura.pqr) && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {factura.observaciones && <p>{factura.observaciones}</p>}
                {factura.pqr && (
                  <p className="mt-1">
                    Ligada a la PQR <span className="font-mono font-semibold">{factura.pqr.numeroRadicado}</span> ({factura.pqr.estado})
                  </p>
                )}
              </div>
            )}

            {(() => {
              // Cada servicio en su propia columna, con el subsidio/contribución de CADA
              // concepto (cargo fijo, consumo básico) justo debajo de ese concepto — en vez de
              // una sola línea de ajuste al final que no dice a qué le aplicó. El backend ya
              // itemiza el subsidio por concepto (ver lib/facturacionCalculo.ts); "otros" agrupa
              // lo que no es de un servicio puntual (aseo, contribución de estrato, manuales).
              const esAlcantarillado = (tipo: string) => tipo.includes("alcantarillado");
              const esOtro = (tipo: string) => tipo === "aseo" || tipo === "ajuste_estrato" || tipo === "manual";
              const acueducto = factura.conceptos.filter((c) => !esAlcantarillado(c.tipo) && !esOtro(c.tipo));
              const alcantarillado = factura.conceptos.filter((c) => esAlcantarillado(c.tipo));
              const otros = factura.conceptos.filter((c) => esOtro(c.tipo));

              const columnaServicio = (titulo: string, icono: React.ReactNode, items: typeof factura.conceptos) => {
                if (items.length === 0) return null;
                const subtotalServicio = items.reduce((acc, c) => acc + Number(c.valor), 0);
                return (
                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                      {icono}
                      {titulo}
                    </div>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {items.map((c) => {
                          const esSubsidio = c.tipo.startsWith("subsidio_");
                          return (
                            <tr key={c.id}>
                              <td className={`px-3 py-1.5 ${esSubsidio ? "pl-6 text-xs text-emerald-600 dark:text-emerald-400" : ""}`}>
                                {c.descripcion}
                              </td>
                              <td className="px-3 py-1.5 text-right text-xs text-slate-500 dark:text-slate-400">
                                {c.cantidad != null ? `${Number(c.cantidad)} m³` : ""}
                              </td>
                              <td
                                className={`px-3 py-1.5 text-right ${Number(c.valor) < 0 ? "text-emerald-600 dark:text-emerald-400" : ""} ${esSubsidio ? "text-xs" : ""}`}
                              >
                                {fmtPesos(c.valor)}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-slate-50 text-xs font-semibold dark:bg-slate-800/50">
                          <td className="px-3 py-1.5" colSpan={2}>
                            Subtotal {titulo.toLowerCase()}
                          </td>
                          <td className="px-3 py-1.5 text-right">{fmtPesos(subtotalServicio)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              };

              return (
                <div className="mb-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {columnaServicio("Acueducto", <Droplets className="h-3.5 w-3.5 text-brand-500" />, acueducto)}
                    {columnaServicio("Alcantarillado", <Waves className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />, alcantarillado)}
                  </div>

                  {otros.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {otros.map((c) => (
                            <tr key={c.id}>
                              <td className="px-3 py-1.5">{c.descripcion}</td>
                              <td className="px-3 py-1.5 text-right text-slate-500 dark:text-slate-400">
                                {c.cantidad != null ? `${Number(c.cantidad)} m³` : ""}
                              </td>
                              <td className={`px-3 py-1.5 text-right ${Number(c.valor) < 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                                {fmtPesos(c.valor)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        <tr className="bg-slate-50 font-bold dark:bg-slate-800/50">
                          <td className="px-3 py-2">TOTAL</td>
                          <td className="px-3 py-2 text-right">{fmtPesos(factura.total)}</td>
                        </tr>
                        {Number(factura.porcentajeAplicado) !== 0 && (
                          <tr className="text-xs">
                            <td className="px-3 py-1 text-slate-500 dark:text-slate-400" colSpan={2}>
                              % de {Number(factura.porcentajeAplicado) < 0 ? "subsidio" : "contribución"} aplicado:{" "}
                              {Number(factura.porcentajeAplicado)}% (estrato {factura.estratoCodigo ?? "—"})
                              {Number(factura.porcentajeAplicado) < 0 ? " · solo sobre cargo fijo y consumo básico" : ""}
                            </td>
                          </tr>
                        )}
                        {factura.diasMora > 0 && (
                          <tr className="text-xs">
                            <td className="px-3 py-1 text-red-600 dark:text-red-400" colSpan={2}>
                              {factura.diasMora} día{factura.diasMora === 1 ? "" : "s"} en mora
                              {factura.interesMora > 0 ? ` · interés estimado: ${fmtPesos(factura.interesMora)}` : ""}
                            </td>
                          </tr>
                        )}
                        {factura.pagado > 0 && (
                          <tr className="text-sm">
                            <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">Pagado / Saldo</td>
                            <td className="px-3 py-1.5 text-right text-slate-600 dark:text-slate-400">
                              {fmtPesos(factura.pagado)} / {fmtPesos(factura.saldo)}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {puedePagar && factura.estado === "pendiente" && factura.saldo > 0 && (
              <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <div className="mb-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">Registrar pago o abono</div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    placeholder={`Valor (saldo ${fmtPesos(factura.saldo)})`}
                    value={pagoValor}
                    onChange={(e) => setPagoValor(e.target.value)}
                    className={`${inputClass} w-44`}
                  />
                  <select value={pagoMedio} onChange={(e) => setPagoMedio(e.target.value)} className={inputClass}>
                    <option value="efectivo">Efectivo</option>
                    <option value="consignacion">Consignación</option>
                    <option value="otro">Otro</option>
                  </select>
                  <button
                    onClick={registrarPago}
                    disabled={guardandoPago || !pagoValor || Number(pagoValor) <= 0}
                    className="btn-accion flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {guardandoPago && <Loader2 className="h-4 w-4 animate-spin" />}
                    {guardandoPago ? "Guardando…" : "Registrar"}
                  </button>
                </div>
              </div>
            )}

            {factura.pagos.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {factura.pagos.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400"
                  >
                    <span>
                      {new Date(p.fecha).toLocaleDateString("es-CO")} · {fmtPesos(p.valor)} ({p.medio})
                      {p.registradoPor ? ` · ${p.registradoPor.nombre}` : ""}
                    </span>
                    {puedeAvanzado && (
                      <button
                        onClick={() => eliminarPago(p.id, p.valor)}
                        className="btn-accion flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Deshacer
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {puedeAvanzado && factura.estado === "pendiente" && factura.pagos.length === 0 && mostrarFormAnular && (
              <div className="mb-3 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  ¿Anular la factura No. {factura.numero}? Esta acción no se puede deshacer.
                </p>
                <input
                  value={motivoAnular}
                  onChange={(e) => setMotivoAnular(e.target.value)}
                  placeholder="Motivo (opcional)"
                  className={`${inputClass} w-full`}
                />
                <input
                  value={radicadoPqrAnular}
                  onChange={(e) => setRadicadoPqrAnular(e.target.value)}
                  placeholder="N.º de radicado de PQR relacionada (opcional)"
                  className={`${inputClass} w-full`}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setMostrarFormAnular(false)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmarAnular}
                    disabled={anulando}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                  >
                    {anulando ? "Anulando..." : "Confirmar anulación"}
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {puedeAvanzado && factura.estado === "pendiente" && factura.pagos.length === 0 && !mostrarFormAnular && (
                <button
                  onClick={() => setMostrarFormAnular(true)}
                  className="btn-accion flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400"
                >
                  <Ban className="h-4 w-4" />
                  Anular
                </button>
              )}
              {plantillas.length > 0 && (
                <select
                  value={plantillaPdf}
                  onChange={(e) => setPlantillaPdf(e.target.value)}
                  title="Diseño con el que se imprime el PDF"
                  className={`${inputClass} w-40`}
                >
                  <option value="">Diseño completo</option>
                  {plantillas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() =>
                  api.facturacion.facturas.verPdf(factura.id, factura.numero, plantillaPdf ? Number(plantillaPdf) : undefined)
                }
                className="btn-accion flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500"
              >
                <FileText className="h-4 w-4" />
                Ver PDF
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================== CARTERA ==============================

function CarteraTab() {
  const [resumen, setResumen] = useState<CarteraResumen | null>(null);
  const [lista, setLista] = useState<CarteraSuscriptor[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [filtro, setFiltro] = useState("");
  const [filtroDebounced, setFiltroDebounced] = useState("");
  const [cargando, setCargando] = useState(true);
  const porPagina = 10;

  useEffect(() => {
    const t = setTimeout(() => setFiltroDebounced(filtro), 300);
    return () => clearTimeout(t);
  }, [filtro]);
  useEffect(() => {
    setPagina(1);
  }, [filtroDebounced]);

  useEffect(() => {
    api.facturacion.cartera.resumen().then(setResumen);
  }, []);
  useEffect(() => {
    setCargando(true);
    api.facturacion.cartera
      .listPaginado(pagina, porPagina, filtroDebounced || undefined)
      .then((r) => {
        setLista(r.data);
        setTotal(r.total);
      })
      .finally(() => setCargando(false));
  }, [pagina, filtroDebounced]);

  const tarjetas = resumen
    ? [
        { label: "Cartera total", valor: fmtPesos(resumen.total) },
        { label: "0-30 días", valor: fmtPesos(resumen.edades.d0_30) },
        { label: "31-60 días", valor: fmtPesos(resumen.edades.d31_60) },
        { label: "61-90 días", valor: fmtPesos(resumen.edades.d61_90) },
        { label: "Más de 90 días", valor: fmtPesos(resumen.edades.d90mas) },
      ]
    : [];

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tarjetas.map((t) => (
          <div key={t.label} className="rounded-xl border border-brand-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-slate-600 dark:text-slate-400">{t.label}</div>
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{t.valor}</div>
          </div>
        ))}
      </div>

      <BusquedaInput placeholder="Buscar deudor por nombre o NUID..." value={filtro} onChange={setFiltro} className="mb-3 w-full max-w-sm" />

      {cargando && lista.length === 0 ? (
        <SkeletonTabla columnas={6} filas={porPagina} />
      ) : (
        <div className={`transition-opacity duration-150 ${cargando ? "pointer-events-none opacity-40" : "opacity-100"}`}>
          <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-800 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <th className="px-3 py-2 font-medium">NUID</th>
                  <th className="px-3 py-2 font-medium">Suscriptor</th>
                  <th className="px-3 py-2 font-medium">Barrio</th>
                  <th className="px-3 py-2 font-medium text-right">Facturas pendientes</th>
                  <th className="px-3 py-2 font-medium">Debe desde</th>
                  <th className="px-3 py-2 font-medium text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {lista.map((c) => (
                  <tr key={c.suscriptorId}>
                    <td className="px-3 py-2">{c.codigo}</td>
                    <td className="px-3 py-2">{c.nombre}</td>
                    <td className="px-3 py-2">{c.barrio ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{c.facturasPendientes}</td>
                    <td className="px-3 py-2">{c.periodoMasAntiguo}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmtPesos(c.saldo)}</td>
                  </tr>
                ))}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6">
                      <EmptyState mensaje="No hay cartera pendiente. ¡Todo al día!" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Paginacion pagina={pagina} totalPaginas={Math.max(1, Math.ceil(total / porPagina))} onCambiar={setPagina} />
        </div>
      )}
    </div>
  );
}

// ============================== PAGOS ==============================

function PagosTab() {
  const { usuario } = useAuth();
  const { pedirConfirmacion, modal } = useConfirm();
  const puedeDeshacer = Boolean(usuario?.permisos?.includes("pagos_registrar") || usuario?.permisos?.includes("facturacion_avanzado"));
  const [pagos, setPagos] = useState<PagoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [sumaValor, setSumaValor] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [cargando, setCargando] = useState(true);
  const porPagina = 10;

  function cargar() {
    setCargando(true);
    api.facturacion.pagos
      .listPaginado(pagina, porPagina, { desde: desde || undefined, hasta: hasta || undefined })
      .then((r) => {
        setPagos(r.data);
        setTotal(r.total);
        setSumaValor(r.sumaValor);
      })
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    setPagina(1);
  }, [desde, hasta]);
  useEffect(cargar, [pagina, desde, hasta]);

  function deshacerPago(pago: PagoItem) {
    pedirConfirmacion(
      `¿Deshacer el pago de ${fmtPesos(pago.valor)} de la factura No. ${pago.factura.numero}? El saldo de la factura se recalcula solo.`,
      async () => {
        await api.facturacion.pagos.remove(pago.id);
        cargar();
      },
      { textoConfirmar: "Deshacer pago", textoExito: "Pago eliminado" }
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputClass} />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputClass} />
        </label>
        <div className="ml-auto rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
          Recaudo: {fmtPesos(sumaValor)} ({total} pago{total === 1 ? "" : "s"})
        </div>
      </div>

      {cargando && pagos.length === 0 ? (
        <SkeletonTabla columnas={puedeDeshacer ? 7 : 6} filas={porPagina} />
      ) : (
        <div className={`transition-opacity duration-150 ${cargando ? "pointer-events-none opacity-40" : "opacity-100"}`}>
          <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-800 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Factura</th>
                  <th className="px-3 py-2 font-medium">Suscriptor</th>
                  <th className="px-3 py-2 font-medium">Medio</th>
                  <th className="px-3 py-2 font-medium">Registrado por</th>
                  <th className="px-3 py-2 font-medium text-right">Valor</th>
                  {puedeDeshacer && <th className="px-3 py-2 font-medium text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pagos.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2">{new Date(p.fecha).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="px-3 py-2">No. {p.factura.numero}</td>
                    <td className="px-3 py-2">
                      {p.factura.suscriptor.codigo} · {p.factura.suscriptor.nombre}
                    </td>
                    <td className="px-3 py-2 capitalize">{p.medio}</td>
                    <td className="px-3 py-2">{p.registradoPor?.nombre ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmtPesos(p.valor)}</td>
                    {puedeDeshacer && (
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => deshacerPago(p)}
                          title="Deshacer pago"
                          className="text-red-600 hover:text-red-500 dark:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {pagos.length === 0 && (
                  <tr>
                    <td colSpan={puedeDeshacer ? 7 : 6} className="px-4 py-6">
                      <EmptyState mensaje="No hay pagos registrados en este rango." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Paginacion pagina={pagina} totalPaginas={Math.max(1, Math.ceil(total / porPagina))} onCambiar={setPagina} />
        </div>
      )}
      {modal}
    </div>
  );
}

// ============================== NOTAS ==============================

const ESTADO_NOTA_LABELS: Record<string, string> = { pendiente: "Pendiente", aplicada: "Aplicada", anulada: "Anulada" };
const ESTADO_NOTA_COLORS: Record<string, string> = {
  pendiente: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  aplicada: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  anulada: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
};

function NotasTab() {
  const { usuario } = useAuth();
  const { mostrar, mostrarError } = useToast();
  const { pedirConfirmacion, modal } = useConfirm();
  const puedeEditar = usuario?.permisos?.includes("facturacion_avanzado") ?? false;

  const [notas, setNotas] = useState<NotaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const porPagina = 10;

  const [busquedaSuscriptor, setBusquedaSuscriptor] = useState("");
  const [resultadosSuscriptor, setResultadosSuscriptor] = useState<Suscriptor[]>([]);
  const [suscriptorElegido, setSuscriptorElegido] = useState<Suscriptor | null>(null);
  const [tipo, setTipo] = useState<"credito" | "debito">("credito");
  const [valor, setValor] = useState("");
  const [concepto, setConcepto] = useState("");
  const [radicadoPqr, setRadicadoPqr] = useState("");
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    setCargando(true);
    api.facturacion.notas
      .listPaginado(pagina, porPagina)
      .then((r) => {
        setNotas(r.data);
        setTotal(r.total);
      })
      .finally(() => setCargando(false));
  }
  useEffect(cargar, [pagina]);

  useEffect(() => {
    if (!busquedaSuscriptor.trim() || suscriptorElegido) {
      setResultadosSuscriptor([]);
      return;
    }
    const t = setTimeout(() => {
      api.suscriptores.listPaginado(1, 5, { q: busquedaSuscriptor }).then((r) => setResultadosSuscriptor(r.data));
    }, 250);
    return () => clearTimeout(t);
  }, [busquedaSuscriptor, suscriptorElegido]);

  function limpiarForm() {
    setBusquedaSuscriptor("");
    setSuscriptorElegido(null);
    setTipo("credito");
    setValor("");
    setConcepto("");
    setRadicadoPqr("");
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!suscriptorElegido || !valor || !concepto.trim()) return;
    setGuardando(true);
    try {
      await api.facturacion.notas.crear({
        suscriptorId: suscriptorElegido.id,
        tipo,
        valor: Number(valor),
        concepto: concepto.trim(),
        numeroRadicadoPqr: radicadoPqr.trim() || undefined,
      });
      mostrar("Nota creada");
      limpiarForm();
      setMostrarForm(false);
      cargar();
    } catch (err) {
      mostrarError(err, "crear la nota");
    } finally {
      setGuardando(false);
    }
  }

  function anularNota(nota: NotaItem) {
    pedirConfirmacion(
      `¿Anular la nota ${nota.tipo === "credito" ? "crédito" : "débito"} #${nota.numero}?`,
      async () => {
        await api.facturacion.notas.remove(nota.id);
        cargar();
      },
      { textoConfirmar: "Anular", textoExito: "Nota anulada" }
    );
  }

  return (
    <div>
      {puedeEditar && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500"
          >
            <Plus className="h-4 w-4" />
            Nueva nota
          </button>
        </div>
      )}

      {mostrarForm && (
        <form onSubmit={crear} className="mb-4 space-y-3 rounded-xl border border-brand-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-3 sm:grid-cols-2">
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
                  <BusquedaInput value={busquedaSuscriptor} onChange={setBusquedaSuscriptor} placeholder="Buscar por NUID o nombre..." />
                  {resultadosSuscriptor.length > 0 && (
                    <div className="absolute top-full z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      {resultadosSuscriptor.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSuscriptorElegido(s);
                            setResultadosSuscriptor([]);
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
              Tipo
              <select value={tipo} onChange={(e) => setTipo(e.target.value as "credito" | "debito")} className={inputClass}>
                <option value="credito">Crédito (saldo a favor / descuento)</option>
                <option value="debito">Débito (cargo adicional)</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Concepto
            <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Descuento por reclamo de fugas" required className={inputClass} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              Valor
              <input type="number" min="1" value={valor} onChange={(e) => setValor(e.target.value)} required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              N.º de radicado de PQR (opcional)
              <input value={radicadoPqr} onChange={(e) => setRadicadoPqr(e.target.value)} className={inputClass} />
            </label>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            La nota queda "pendiente" y se aplica sola en la próxima factura que se genere para este suscriptor. Si el
            crédito vale más que esa factura, el sobrante queda pendiente para la siguiente.
          </p>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={guardando || !suscriptorElegido}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
            >
              {guardando ? "Guardando..." : "Crear nota"}
            </button>
          </div>
        </form>
      )}

      {cargando && notas.length === 0 ? (
        <SkeletonTabla columnas={7} filas={porPagina} />
      ) : notas.length === 0 ? (
        <EmptyState mensaje="Todavía no hay notas registradas." />
      ) : (
        <div className={`transition-opacity duration-150 ${cargando ? "pointer-events-none opacity-40" : "opacity-100"}`}>
          <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-800 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <th className="px-3 py-2 font-medium">N.º</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Suscriptor</th>
                  <th className="px-3 py-2 font-medium">Concepto</th>
                  <th className="px-3 py-2 font-medium text-right">Valor</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  {puedeEditar && <th className="px-3 py-2 font-medium text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {notas.map((n) => (
                  <tr key={n.id}>
                    <td className="px-3 py-2 font-mono text-xs">{n.numero}</td>
                    <td className="px-3 py-2 capitalize">{n.tipo}</td>
                    <td className="px-3 py-2">
                      {n.suscriptor.codigo} · {n.suscriptor.nombre}
                    </td>
                    <td className="px-3 py-2">
                      {n.concepto}
                      {n.pqr && <span className="ml-1 text-xs text-slate-400">· PQR {n.pqr.numeroRadicado}</span>}
                      {n.facturaAplicada && <span className="ml-1 text-xs text-slate-400">· Factura No. {n.facturaAplicada.numero}</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{fmtPesos(n.valor)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_NOTA_COLORS[n.estado]}`}>
                        {ESTADO_NOTA_LABELS[n.estado]}
                      </span>
                    </td>
                    {puedeEditar && (
                      <td className="px-3 py-2 text-right">
                        {n.estado === "pendiente" && (
                          <button onClick={() => anularNota(n)} className="text-red-600 hover:text-red-500 dark:text-red-400">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacion pagina={pagina} totalPaginas={Math.max(1, Math.ceil(total / porPagina))} onCambiar={setPagina} />
        </div>
      )}
      {modal}
    </div>
  );
}

// ============================== ACUERDOS DE PAGO ==============================

const ESTADO_ACUERDO_LABELS: Record<string, string> = { activo: "Activo", completado: "Completado", anulado: "Anulado" };
const ESTADO_ACUERDO_COLORS: Record<string, string> = {
  activo: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  completado: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  anulado: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
};

function AcuerdosPagoTab() {
  const { usuario } = useAuth();
  const { mostrar, mostrarError } = useToast();
  const { pedirConfirmacion, modal } = useConfirm();
  const puedeEditar = usuario?.permisos?.includes("facturacion_avanzado") ?? false;

  const [acuerdos, setAcuerdos] = useState<AcuerdoPagoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const porPagina = 10;

  const [modo, setModo] = useState<"factura" | "cargo">("factura");
  const [busquedaFactura, setBusquedaFactura] = useState("");
  const [resultadosFactura, setResultadosFactura] = useState<FacturaResumen[]>([]);
  const [facturaElegida, setFacturaElegida] = useState<FacturaResumen | null>(null);
  const [busquedaSuscriptor, setBusquedaSuscriptor] = useState("");
  const [resultadosSuscriptor, setResultadosSuscriptor] = useState<Suscriptor[]>([]);
  const [suscriptorElegido, setSuscriptorElegido] = useState<Suscriptor | null>(null);
  const [valorCargo, setValorCargo] = useState("");
  const [numeroCuotas, setNumeroCuotas] = useState("2");
  const [concepto, setConcepto] = useState("");
  const [radicadoPqr, setRadicadoPqr] = useState("");
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    setCargando(true);
    api.facturacion.acuerdosPago
      .listPaginado(pagina, porPagina)
      .then((r) => {
        setAcuerdos(r.data);
        setTotal(r.total);
      })
      .finally(() => setCargando(false));
  }
  useEffect(cargar, [pagina]);

  useEffect(() => {
    if (!busquedaFactura.trim() || facturaElegida) {
      setResultadosFactura([]);
      return;
    }
    const t = setTimeout(() => {
      api.facturacion.facturas.listPaginado(1, 5, { q: busquedaFactura, estado: "pendiente" }).then((r) => setResultadosFactura(r.data));
    }, 250);
    return () => clearTimeout(t);
  }, [busquedaFactura, facturaElegida]);

  useEffect(() => {
    if (!busquedaSuscriptor.trim() || suscriptorElegido) {
      setResultadosSuscriptor([]);
      return;
    }
    const t = setTimeout(() => {
      api.suscriptores.listPaginado(1, 5, { q: busquedaSuscriptor }).then((r) => setResultadosSuscriptor(r.data));
    }, 250);
    return () => clearTimeout(t);
  }, [busquedaSuscriptor, suscriptorElegido]);

  function limpiarForm() {
    setBusquedaFactura("");
    setFacturaElegida(null);
    setBusquedaSuscriptor("");
    setSuscriptorElegido(null);
    setValorCargo("");
    setNumeroCuotas("2");
    setConcepto("");
    setRadicadoPqr("");
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!numeroCuotas || !concepto.trim()) return;
    if (modo === "factura" && !facturaElegida) return;
    if (modo === "cargo" && (!suscriptorElegido || !valorCargo)) return;
    setGuardando(true);
    try {
      if (modo === "factura") {
        await api.facturacion.acuerdosPago.crear({
          facturaId: facturaElegida!.id,
          numeroCuotas: Number(numeroCuotas),
          concepto: concepto.trim(),
          numeroRadicadoPqr: radicadoPqr.trim() || undefined,
        });
        mostrar("Acuerdo de pago creado — la factura original quedó anulada");
      } else {
        await api.facturacion.acuerdosPago.crear({
          suscriptorId: suscriptorElegido!.id,
          valorCargo: Number(valorCargo),
          numeroCuotas: Number(numeroCuotas),
          concepto: concepto.trim(),
          numeroRadicadoPqr: radicadoPqr.trim() || undefined,
        });
        mostrar("Acuerdo de pago creado para el cargo nuevo");
      }
      limpiarForm();
      setMostrarForm(false);
      cargar();
    } catch (err) {
      mostrarError(err, "crear el acuerdo de pago");
    } finally {
      setGuardando(false);
    }
  }

  function anularAcuerdo(acuerdo: AcuerdoPagoItem) {
    pedirConfirmacion(
      `¿Anular este acuerdo de pago? Las cuotas ya aplicadas en facturas anteriores no se deshacen, solo se detienen las que faltan.`,
      async () => {
        await api.facturacion.acuerdosPago.remove(acuerdo.id);
        cargar();
      },
      { textoConfirmar: "Anular", textoExito: "Acuerdo anulado" }
    );
  }

  return (
    <div>
      {puedeEditar && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500"
          >
            <Plus className="h-4 w-4" />
            Nuevo acuerdo
          </button>
        </div>
      )}

      {mostrarForm && (
        <form onSubmit={crear} className="mb-4 space-y-3 rounded-xl border border-brand-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex gap-1 rounded-lg border border-slate-200 p-1 dark:border-slate-700">
            {(
              [
                ["factura", "Financiar factura vencida"],
                ["cargo", "Cargo nuevo (matrícula, etc.)"],
              ] as [typeof modo, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setModo(v)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  modo === v ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {modo === "factura" ? (
            <div className="relative flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              Factura vencida a financiar (solo pendientes, sin pagos)
              {facturaElegida ? (
                <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                  <span className="text-slate-900 dark:text-slate-100">
                    No. {facturaElegida.numero} · {facturaElegida.suscriptor.codigo} · {facturaElegida.suscriptor.nombre} · {fmtPesos(facturaElegida.total)}
                  </span>
                  <button type="button" onClick={() => setFacturaElegida(null)} className="text-xs text-brand-600 hover:underline dark:text-brand-400">
                    Cambiar
                  </button>
                </div>
              ) : (
                <>
                  <BusquedaInput value={busquedaFactura} onChange={setBusquedaFactura} placeholder="Buscar por nombre, NUID o No. de factura..." />
                  {resultadosFactura.length > 0 && (
                    <div className="absolute top-full z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      {resultadosFactura.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setFacturaElegida(f);
                            setResultadosFactura([]);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          No. {f.numero} · {f.suscriptor.codigo} · {f.suscriptor.nombre} · {fmtPesos(f.total)}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
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
                    <BusquedaInput value={busquedaSuscriptor} onChange={setBusquedaSuscriptor} placeholder="Buscar por NUID o nombre..." />
                    {resultadosSuscriptor.length > 0 && (
                      <div className="absolute top-full z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                        {resultadosSuscriptor.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSuscriptorElegido(s);
                              setResultadosSuscriptor([]);
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
                Valor total del cargo
                <input type="number" min="1" value={valorCargo} onChange={(e) => setValorCargo(e.target.value)} required className={inputClass} />
              </label>
            </div>
          )}

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Concepto
            <input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder={modo === "factura" ? "Acuerdo por mora acumulada" : "Matrícula / conexión nueva"}
              required
              className={inputClass}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              N.º de cuotas
              <input type="number" min="2" value={numeroCuotas} onChange={(e) => setNumeroCuotas(e.target.value)} required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              N.º de radicado de PQR (opcional)
              <input value={radicadoPqr} onChange={(e) => setRadicadoPqr(e.target.value)} className={inputClass} />
            </label>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {modo === "factura"
              ? "La factura elegida se anula y su valor se reparte en cuotas — cada una se agrega sola como un concepto extra en las próximas facturas de este suscriptor, una por una."
              : "El valor del cargo se reparte en cuotas — cada una se agrega sola como un concepto extra en las próximas facturas de este suscriptor, una por una."}
          </p>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={guardando || (modo === "factura" ? !facturaElegida : !suscriptorElegido || !valorCargo)}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
            >
              {guardando ? "Guardando..." : "Crear acuerdo"}
            </button>
          </div>
        </form>
      )}

      {cargando && acuerdos.length === 0 ? (
        <SkeletonTabla columnas={6} filas={porPagina} />
      ) : acuerdos.length === 0 ? (
        <EmptyState mensaje="Todavía no hay acuerdos de pago registrados." />
      ) : (
        <div className={`transition-opacity duration-150 ${cargando ? "pointer-events-none opacity-40" : "opacity-100"}`}>
          <div className="space-y-3">
            {acuerdos.map((a) => (
              <div key={a.id} className="overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                  <div className="text-sm">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {a.suscriptor.codigo} · {a.suscriptor.nombre}
                    </span>
                    <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                      {a.concepto} · {a.factura ? `Factura original No. ${a.factura.numero}` : "Cargo nuevo"} · {fmtPesos(a.valorTotal)} en {a.numeroCuotas} cuotas
                      {a.pqr && ` · PQR ${a.pqr.numeroRadicado}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_ACUERDO_COLORS[a.estado]}`}>
                      {ESTADO_ACUERDO_LABELS[a.estado]}
                    </span>
                    {puedeEditar && a.estado === "activo" && (
                      <button onClick={() => anularAcuerdo(a)} className="text-red-600 hover:text-red-500 dark:text-red-400">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 p-3">
                  {a.cuotas.map((c) => (
                    <span
                      key={c.id}
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        c.estado === "aplicada"
                          ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      Cuota {c.numero}: {fmtPesos(c.valor)} {c.estado === "aplicada" ? "✓" : ""}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Paginacion pagina={pagina} totalPaginas={Math.max(1, Math.ceil(total / porPagina))} onCambiar={setPagina} />
        </div>
      )}
      {modal}
    </div>
  );
}

// ============================== TARIFAS ==============================

function TarifasTab() {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.permisos?.includes("facturacion_avanzado") ?? false;
  const { mostrar, mostrarError } = useToast();
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [estratos, setEstratos] = useState<Estrato[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Tarifa | null>(null);
  const { pedirConfirmacion, modal } = useConfirm();

  async function cargar() {
    setCargando(true);
    const [t, e] = await Promise.all([api.facturacion.tarifas.list(), api.estratos.list()]);
    setTarifas(t);
    setEstratos(e);
    setCargando(false);
  }
  useEffect(() => {
    cargar();
  }, []);

  function eliminar(t: Tarifa) {
    pedirConfirmacion(`¿Eliminar la tarifa con vigencia ${t.vigenciaDesde.slice(0, 7)}?`, async () => {
      try {
        await api.facturacion.tarifas.remove(t.id);
        await cargar();
      } catch (err) {
        mostrarError(err, "no se pudo eliminar la tarifa");
        throw err;
      }
    });
  }

  return (
    <div>
      {modal}
      <div className="mb-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
        Metodología CRA 825 de 2017: cargo fijo = CMA; valor del m³ = CMO + CMI + CMT. El subsidio por estrato (%
        negativo) aplica solo sobre el cargo fijo y el consumo básico; la contribución (% positivo) sobre todo el
        servicio. Al facturar un periodo se usa la tarifa con la vigencia más reciente anterior o igual a ese mes.
      </div>
      {puedeEditar && (
        <button
          onClick={() => {
            setEditando(null);
            setModalAbierto(true);
          }}
          className="btn-accion mb-3 flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500"
        >
          <Plus className="h-4 w-4" />
          Nueva vigencia de tarifa
        </button>
      )}

      {cargando ? (
        <SkeletonTabla columnas={8} filas={4} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              {/* Encabezado en dos niveles: las columnas de Acueducto y Alcantarillado quedan
                  agrupadas y separadas visualmente — cada servicio con sus propios CMA/CMO/CMI/CMT. */}
              <tr className="border-b border-brand-100 bg-brand-100/60 text-center text-xs font-semibold uppercase text-brand-800 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                <th className="px-3 py-1.5"></th>
                <th colSpan={5} className="border-l border-brand-200 px-3 py-1.5 dark:border-slate-700">
                  Acueducto
                </th>
                <th colSpan={5} className="border-l border-brand-200 px-3 py-1.5 dark:border-slate-700">
                  Alcantarillado
                </th>
                <th colSpan={3} className="border-l border-brand-200 px-3 py-1.5 dark:border-slate-700"></th>
              </tr>
              <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-800 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-3 py-2 font-medium">Vigente desde</th>
                <th className="border-l border-brand-100 px-3 py-2 text-right font-medium dark:border-slate-800">CMA (fijo)</th>
                <th className="px-3 py-2 text-right font-medium">CMO</th>
                <th className="px-3 py-2 text-right font-medium">CMI</th>
                <th className="px-3 py-2 text-right font-medium">CMT</th>
                <th className="px-3 py-2 text-right font-medium">Valor m³</th>
                <th className="border-l border-brand-100 px-3 py-2 text-right font-medium dark:border-slate-800">CMA (fijo)</th>
                <th className="px-3 py-2 text-right font-medium">CMO</th>
                <th className="px-3 py-2 text-right font-medium">CMI</th>
                <th className="px-3 py-2 text-right font-medium">CMT</th>
                <th className="px-3 py-2 text-right font-medium">Valor m³</th>
                <th className="border-l border-brand-100 px-3 py-2 font-medium dark:border-slate-800">Rangos (m³)</th>
                <th className="px-3 py-2 font-medium">Subsidios / contribuciones</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {tarifas.map((t) => {
                const valorM3 = Number(t.cmo) + Number(t.cmi) + Number(t.cmt);
                const cobraAlc = t.alcCma != null || t.alcCmo != null || t.alcCmi != null || t.alcCmt != null;
                const alcValorM3 = Number(t.alcCmo ?? 0) + Number(t.alcCmi ?? 0) + Number(t.alcCmt ?? 0);
                return (
                  <tr key={t.id}>
                    <td className="px-3 py-2 font-medium">
                      {t.vigenciaDesde.slice(0, 7)}
                      {t.facturas ? (
                        <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          {t.facturas} fact.
                        </span>
                      ) : null}
                    </td>
                    <td className="border-l border-brand-100 px-3 py-2 text-right dark:border-slate-800">{fmtPesos(t.cma)}</td>
                    <td className="px-3 py-2 text-right">{fmtPesos(t.cmo)}</td>
                    <td className="px-3 py-2 text-right">{fmtPesos(t.cmi)}</td>
                    <td className="px-3 py-2 text-right">{fmtPesos(t.cmt)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{fmtPesos(valorM3)}</td>
                    {cobraAlc ? (
                      <>
                        <td className="border-l border-brand-100 px-3 py-2 text-right dark:border-slate-800">
                          {fmtPesos(t.alcCma ?? 0)}
                        </td>
                        <td className="px-3 py-2 text-right">{fmtPesos(t.alcCmo ?? 0)}</td>
                        <td className="px-3 py-2 text-right">{fmtPesos(t.alcCmi ?? 0)}</td>
                        <td className="px-3 py-2 text-right">{fmtPesos(t.alcCmt ?? 0)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtPesos(alcValorM3)}</td>
                      </>
                    ) : (
                      <td
                        colSpan={5}
                        className="border-l border-brand-100 px-3 py-2 text-center text-xs text-slate-400 dark:border-slate-800"
                      >
                        No se cobra
                      </td>
                    )}
                    <td className="border-l border-brand-100 px-3 py-2 whitespace-nowrap dark:border-slate-800">
                      0-{t.rangoBasicoHastaM3} / {t.rangoBasicoHastaM3}-{t.rangoComplementarioHastaM3} / &gt;
                      {t.rangoComplementarioHastaM3}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {t.estratos
                          .filter((e) => Number(e.porcentaje) !== 0)
                          .map((e) => (
                            <span
                              key={e.id}
                              className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                                Number(e.porcentaje) < 0
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                                  : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                              }`}
                            >
                              {e.estrato.codigo}: {Number(e.porcentaje) > 0 ? "+" : ""}
                              {Number(e.porcentaje)}%
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {puedeEditar && !t.facturas && (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditando(t);
                              setModalAbierto(true);
                            }}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                          >
                            Editar
                          </button>
                          <button onClick={() => eliminar(t)} className="text-slate-500 dark:text-slate-400 hover:text-red-600" title="Eliminar">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {tarifas.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-6">
                    <EmptyState mensaje="Aún no hay tarifas. Crea la primera vigencia para poder facturar." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalAbierto && (
        <TarifaModal
          tarifa={editando}
          estratos={estratos}
          onClose={() => setModalAbierto(false)}
          onGuardado={async () => {
            setModalAbierto(false);
            mostrar("Tarifa guardada.", "exito");
            await cargar();
          }}
        />
      )}
    </div>
  );
}

function TarifaModal({
  tarifa,
  estratos,
  onClose,
  onGuardado,
}: {
  tarifa: Tarifa | null;
  estratos: Estrato[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const { mostrarError } = useToast();
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(() => ({
    vigenciaDesde: tarifa?.vigenciaDesde.slice(0, 7) ?? periodoFacturableActual(),
    cma: tarifa ? String(Number(tarifa.cma)) : "",
    cmo: tarifa ? String(Number(tarifa.cmo)) : "",
    cmi: tarifa ? String(Number(tarifa.cmi)) : "",
    cmt: tarifa ? String(Number(tarifa.cmt)) : "",
    rangoBasicoHastaM3: String(tarifa?.rangoBasicoHastaM3 ?? 16),
    rangoComplementarioHastaM3: String(tarifa?.rangoComplementarioHastaM3 ?? 32),
    alcCma: tarifa?.alcCma != null ? String(Number(tarifa.alcCma)) : "",
    alcCmo: tarifa?.alcCmo != null ? String(Number(tarifa.alcCmo)) : "",
    alcCmi: tarifa?.alcCmi != null ? String(Number(tarifa.alcCmi)) : "",
    alcCmt: tarifa?.alcCmt != null ? String(Number(tarifa.alcCmt)) : "",
    aseoCargoFijo: tarifa?.aseoCargoFijo != null ? String(Number(tarifa.aseoCargoFijo)) : "",
    tasaMoraMensual: tarifa ? String(Number(tarifa.tasaMoraMensual)) : "0",
    observaciones: tarifa?.observaciones ?? "",
  }));
  const [porcentajes, setPorcentajes] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const e of estratos) {
      const existente = tarifa?.estratos.find((te) => te.estratoId === e.id);
      init[e.id] = existente ? String(Number(existente.porcentaje)) : "0";
    }
    return init;
  });

  const valorM3 = (Number(form.cmo) || 0) + (Number(form.cmi) || 0) + (Number(form.cmt) || 0);

  async function guardar() {
    setGuardando(true);
    try {
      const payload: TarifaPayload = {
        vigenciaDesde: form.vigenciaDesde,
        cma: Number(form.cma),
        cmo: Number(form.cmo),
        cmi: Number(form.cmi),
        cmt: Number(form.cmt),
        rangoBasicoHastaM3: Number(form.rangoBasicoHastaM3),
        rangoComplementarioHastaM3: Number(form.rangoComplementarioHastaM3),
        alcCma: form.alcCma === "" ? null : Number(form.alcCma),
        alcCmo: form.alcCmo === "" ? null : Number(form.alcCmo),
        alcCmi: form.alcCmi === "" ? null : Number(form.alcCmi),
        alcCmt: form.alcCmt === "" ? null : Number(form.alcCmt),
        aseoCargoFijo: form.aseoCargoFijo === "" ? null : Number(form.aseoCargoFijo),
        tasaMoraMensual: Number(form.tasaMoraMensual) || 0,
        observaciones: form.observaciones || undefined,
        estratos: estratos.map((e) => ({ estratoId: e.id, porcentaje: Number(porcentajes[e.id]) || 0 })),
      };
      if (tarifa) await api.facturacion.tarifas.update(tarifa.id, payload);
      else await api.facturacion.tarifas.create(payload);
      onGuardado();
    } catch (err) {
      mostrarError(err, "no se pudo guardar la tarifa");
    } finally {
      setGuardando(false);
    }
  }

  // Input monetario con el "$" integrado (los de m³ llevan su unidad al final).
  const campoValor = (label: string, clave: keyof typeof form, unidad: "$" | "m³" | "$/m³" | "%" = "$") => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500 dark:border-slate-700 dark:bg-slate-800">
        {unidad === "$" || unidad === "$/m³" ? <span className="pl-3 text-sm text-slate-400">$</span> : null}
        <input
          type="number"
          placeholder="0"
          value={form[clave]}
          onChange={(e) => setForm((f) => ({ ...f, [clave]: e.target.value }))}
          className="w-full border-0 bg-transparent px-2 py-2 text-sm focus:outline-none focus:ring-0 dark:text-slate-100"
        />
        {unidad !== "$" && (
          <span className="pr-3 text-xs text-slate-400 whitespace-nowrap">
            {unidad === "m³" ? "m³" : unidad === "%" ? "%" : "/m³"}
          </span>
        )}
      </div>
    </label>
  );

  const alcValorM3 = (Number(form.alcCmo) || 0) + (Number(form.alcCmi) || 0) + (Number(form.alcCmt) || 0);

  // Tarjeta de un servicio: componentes a la izquierda, el valor m³ resultante como cifra
  // protagonista a la derecha — es el número que la gente realmente busca al mirar la tarifa.
  const seccionServicio = (
    titulo: string,
    icono: React.ReactNode,
    claves: { cma: keyof typeof form; cmo: keyof typeof form; cmi: keyof typeof form; cmt: keyof typeof form },
    valorM3Servicio: number,
    nota?: string
  ) => (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          {icono}
          {titulo}
        </div>
        {nota && <span className="text-xs text-slate-400">{nota}</span>}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          {campoValor("CMA · cargo fijo", claves.cma, "$")}
          {campoValor("CMO", claves.cmo, "$/m³")}
          {campoValor("CMI", claves.cmi, "$/m³")}
          {campoValor("CMT", claves.cmt, "$/m³")}
        </div>
        <div className="flex shrink-0 flex-col items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-white sm:w-36">
          <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">Valor m³</span>
          <span className="text-lg font-bold">{fmtPesos(valorM3Servicio)}</span>
          <span className="text-[10px] opacity-70">CMO + CMI + CMT</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 animate-fade-in" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl animate-scale-in dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado fijo con la vigencia integrada — es LA decisión principal de este formulario. */}
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-500/15">
              <SlidersHorizontal className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            </span>
            <div>
              <h2 className="text-base font-bold leading-tight">{tarifa ? "Editar tarifa" : "Nueva vigencia de tarifa"}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Resolución CRA 825 de 2017</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Vigente desde</span>
              <input
                type="month"
                value={form.vigenciaDesde}
                onChange={(e) => setForm((f) => ({ ...f, vigenciaDesde: e.target.value }))}
                className={inputClass}
              />
            </label>
            <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-300">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          {seccionServicio(
            "Acueducto",
            <Droplets className="h-4 w-4 text-brand-500" />,
            { cma: "cma", cmo: "cmo", cmi: "cmi", cmt: "cmt" },
            valorM3
          )}

          {seccionServicio(
            "Alcantarillado",
            <Waves className="h-4 w-4 text-slate-500 dark:text-slate-400" />,
            { cma: "alcCma", cmo: "alcCmo", cmi: "alcCmi", cmt: "alcCmt" },
            alcValorM3,
            "vacío = no se cobra"
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <div className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Rangos de consumo y otros</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {campoValor("Básico hasta", "rangoBasicoHastaM3", "m³")}
              {campoValor("Complementario hasta", "rangoComplementarioHastaM3", "m³")}
              {campoValor("Aseo mensual (vacío = no)", "aseoCargoFijo", "$")}
              {campoValor("Interés de mora mensual (0 = no se cobra)", "tasaMoraMensual", "%")}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Básico 0-{form.rangoBasicoHastaM3 || "?"} m³ · Complementario hasta {form.rangoComplementarioHastaM3 || "?"} m³ ·
              Suntuario en adelante. Para Mocoa (clima cálido) la norma define 16 / 32. El interés de mora hoy solo se
              usa para reportar/calcular, no se agrega automáticamente a las facturas.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <div className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Subsidios y contribuciones por estrato</div>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Negativo = subsidio (solo cargo fijo + consumo básico) · Positivo = contribución (todo el servicio) · 0 = tarifa plena
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {estratos.map((e) => {
                const v = Number(porcentajes[e.id]) || 0;
                return (
                  <label
                    key={e.id}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                      v < 0
                        ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                        : v > 0
                          ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
                          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                    }`}
                  >
                    <span className="min-w-0 truncate text-xs font-medium text-slate-700 dark:text-slate-300" title={e.etiqueta}>
                      {e.codigo} · {e.etiqueta}
                    </span>
                    <span className="flex shrink-0 items-center">
                      <input
                        type="number"
                        value={porcentajes[e.id]}
                        onChange={(ev) => setPorcentajes((p) => ({ ...p, [e.id]: ev.target.value }))}
                        className="w-14 border-0 bg-transparent p-0 text-right text-sm font-semibold focus:outline-none focus:ring-0 dark:text-slate-100"
                      />
                      <span className="ml-0.5 text-xs text-slate-400">%</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Observaciones</span>
            <input
              placeholder="Ej. Ajuste anual por IPC acumulado"
              value={form.observaciones}
              onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
              className={`${inputClass} w-full`}
            />
          </label>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando || !form.cma || !form.cmo || !form.cmi || !form.cmt}
            className="btn-accion flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            {guardando ? "Guardando…" : "Guardar tarifa"}
          </button>
        </div>
      </div>
    </div>
  );
}
