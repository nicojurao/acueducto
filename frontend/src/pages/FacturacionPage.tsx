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
} from "lucide-react";
import {
  api,
  Tarifa,
  TarifaPayload,
  FacturaResumen,
  FacturaDetalle,
  PagoItem,
  CarteraResumen,
  CarteraSuscriptor,
  Estrato,
} from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../components/ConfirmModal";
import { SkeletonTabla } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import BusquedaInput from "../components/BusquedaInput";
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

type Tab = "facturas" | "cartera" | "pagos" | "tarifas";

export default function FacturacionPage() {
  const [tab, setTab] = useState<Tab>("facturas");
  const tabs: { id: Tab; label: string; icon: typeof Receipt }[] = [
    { id: "facturas", label: "Facturas", icon: FileText },
    { id: "cartera", label: "Cartera", icon: Wallet },
    { id: "pagos", label: "Pagos", icon: HandCoins },
    { id: "tarifas", label: "Tarifas", icon: SlidersHorizontal },
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
      {tab === "cartera" && <CarteraTab />}
      {tab === "pagos" && <PagosTab />}
      {tab === "tarifas" && <TarifasTab />}
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
  const [barrioPdf, setBarrioPdf] = useState("");
  const [rutaPdf, setRutaPdf] = useState("");
  const [barrios, setBarrios] = useState<{ id: number; nombre: string }[]>([]);
  const { pedirConfirmacion, modal } = useConfirm();
  const porPagina = 10;

  useEffect(() => {
    api.facturacion.periodos.estado(periodo).then((r) => setEstadoPeriodo(r.estado));
  }, [periodo]);

  useEffect(() => {
    api.suscriptores.barrios().then(setBarrios);
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
          <button
            onClick={descargarLote}
            disabled={descargandoLote}
            className="btn-accion flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60 dark:border-slate-700 dark:text-brand-400 dark:hover:bg-slate-800"
          >
            {descargandoLote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            PDF del periodo
          </button>
          {puedeGenerar && estadoPeriodo !== "cerrado" && (
            <button
              onClick={generar}
              disabled={generando}
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
  const [conceptoDesc, setConceptoDesc] = useState("");
  const [conceptoValor, setConceptoValor] = useState("");
  const [agregandoConcepto, setAgregandoConcepto] = useState(false);
  const { pedirConfirmacion, modal } = useConfirm();

  async function cargar() {
    setFactura(await api.facturacion.facturas.get(facturaId));
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facturaId]);

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

  async function agregarConcepto() {
    if (!factura || !conceptoDesc || !conceptoValor) return;
    setAgregandoConcepto(true);
    try {
      await api.facturacion.facturas.agregarConcepto(factura.id, conceptoDesc, Number(conceptoValor));
      mostrar("Concepto agregado.", "exito");
      setConceptoDesc("");
      setConceptoValor("");
      await cargar();
    } catch (err) {
      mostrarError(err, "no se pudo agregar el concepto");
    } finally {
      setAgregandoConcepto(false);
    }
  }

  function anular() {
    if (!factura) return;
    pedirConfirmacion(`¿Anular la factura No. ${factura.numero}? Esta acción no se puede deshacer.`, async () => {
      await api.facturacion.facturas.anular(factura.id);
      await cargar();
    }, { textoConfirmar: "Anular", textoExito: "Factura anulada" });
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
          <div className="flex h-40 items-center justify-center text-slate-500">
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
                <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

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
                    {columnaServicio("Alcantarillado", <Waves className="h-3.5 w-3.5 text-slate-500" />, alcantarillado)}
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
                              <td className="w-8 px-2 py-1.5 text-right">
                                {puedeAvanzado && c.tipo === "manual" && factura.estado !== "anulada" && (
                                  <button
                                    onClick={async () => {
                                      await api.facturacion.facturas.quitarConcepto(factura.id, c.id);
                                      await cargar();
                                    }}
                                    className="text-slate-400 hover:text-red-600"
                                    title="Quitar concepto manual"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
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

            {puedeAvanzado && factura.estado !== "anulada" && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  placeholder="Concepto manual (ej. Reconexión)"
                  value={conceptoDesc}
                  onChange={(e) => setConceptoDesc(e.target.value)}
                  className={`${inputClass} flex-1 min-w-40`}
                />
                <input
                  type="number"
                  placeholder="Valor ($, ± )"
                  value={conceptoValor}
                  onChange={(e) => setConceptoValor(e.target.value)}
                  className={`${inputClass} w-32`}
                />
                <button
                  onClick={agregarConcepto}
                  disabled={agregandoConcepto || !conceptoDesc || !conceptoValor}
                  className="btn-accion rounded-lg border border-brand-200 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50 dark:border-slate-700 dark:text-brand-400"
                >
                  {agregandoConcepto ? "Agregando…" : "Agregar"}
                </button>
              </div>
            )}

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

            <div className="flex flex-wrap justify-end gap-2">
              {puedeAvanzado && factura.estado === "pendiente" && factura.pagos.length === 0 && (
                <button
                  onClick={anular}
                  className="btn-accion flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400"
                >
                  <Ban className="h-4 w-4" />
                  Anular
                </button>
              )}
              <button
                onClick={() => api.facturacion.facturas.verPdf(factura.id, factura.numero)}
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
  const [pagos, setPagos] = useState<PagoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [sumaValor, setSumaValor] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [cargando, setCargando] = useState(true);
  const porPagina = 10;

  useEffect(() => {
    setPagina(1);
  }, [desde, hasta]);
  useEffect(() => {
    setCargando(true);
    api.facturacion.pagos
      .listPaginado(pagina, porPagina, { desde: desde || undefined, hasta: hasta || undefined })
      .then((r) => {
        setPagos(r.data);
        setTotal(r.total);
        setSumaValor(r.sumaValor);
      })
      .finally(() => setCargando(false));
  }, [pagina, desde, hasta]);

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
        <SkeletonTabla columnas={6} filas={porPagina} />
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
                  </tr>
                ))}
                {pagos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6">
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
                          <button onClick={() => eliminar(t)} className="text-slate-500 hover:text-red-600" title="Eliminar">
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
            <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
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
            <Waves className="h-4 w-4 text-slate-500" />,
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
