import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ClipboardList,
  Search,
  CheckCircle2,
  AlertCircle,
  Circle,
  Clock,
  RefreshCw,
  WifiOff,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Download,
  X,
} from "lucide-react";
import { api, LecturaPendiente } from "../api/client";
import LecturaModal from "../components/LecturaModal";
import { PendienteLectura, PendienteNovedad, useColaPendientes, useColaPendientesNovedad } from "../lib/offlineQueue";
import { useEsMovil } from "../lib/useEsMovil";

function periodoActual(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500";

type FiltroEstado = "todos" | "pendientes" | "tomadas";

function EstadoIcono({
  f,
  pendiente,
  pendienteNovedad,
}: {
  f: LecturaPendiente;
  pendiente?: PendienteLectura;
  pendienteNovedad?: PendienteNovedad;
}) {
  if (pendiente || pendienteNovedad) return <Clock className="h-4 w-4 shrink-0 text-sky-500" />;
  if (f.novedad) return <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />;
  if (f.lectura)
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      </span>
    );
  return <Circle className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />;
}

export default function LecturasPage() {
  const [searchParams] = useSearchParams();
  const esMovil = useEsMovil();
  const porPagina = esMovil ? 5 : 10;
  const [periodo, setPeriodo] = useState(searchParams.get("periodo") || periodoActual());
  const medidorResaltado = searchParams.get("medidorId") ? Number(searchParams.get("medidorId")) : null;
  const [filas, setFilas] = useState<LecturaPendiente[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaDebounced, setBusquedaDebounced] = useState("");
  const [verColaOffline, setVerColaOffline] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [pagina, setPagina] = useState(1);
  const [seleccionada, setSeleccionada] = useState<LecturaPendiente | null>(null);
  const [importAbierto, setImportAbierto] = useState(false);
  const { pendientes, sincronizando, online, sincronizarAhora } = useColaPendientes();
  const {
    pendientes: pendientesNovedad,
    sincronizando: sincronizandoNovedad,
    sincronizarAhora: sincronizarNovedadAhora,
  } = useColaPendientesNovedad();
  const pendientesDelPeriodo = pendientes.filter((p) => p.periodo === periodo);
  const pendientesNovedadDelPeriodo = pendientesNovedad.filter((p) => p.periodo === periodo);
  const pendientePorMedidor = useMemo(
    () => new Map(pendientesDelPeriodo.map((p) => [p.medidorId, p])),
    [pendientesDelPeriodo]
  );
  const pendienteNovedadPorMedidor = useMemo(
    () => new Map(pendientesNovedadDelPeriodo.map((p) => [p.medidorId, p])),
    [pendientesNovedadDelPeriodo]
  );
  const totalPendientes = pendientes.length + pendientesNovedad.length;

  function sincronizarTodoAhora() {
    sincronizarAhora();
    sincronizarNovedadAhora();
  }

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  // La paginación/filtro se resuelven en el servidor, salvo el caso de "llegué desde el
  // Dashboard con un medidor puntual" (medidorResaltado): ahí se trae todo el periodo sin
  // paginar, porque ese medidor puede estar en cualquier página y hay que ubicarlo igual.
  async function cargar() {
    setCargando(true);
    try {
      if (medidorResaltado) {
        const data = await api.lecturas.listByPeriodo(periodo);
        setFilas(data);
        setTotal(data.length);
        return data;
      }
      const resultado = await api.lecturas.listPaginado(periodo, pagina, porPagina, {
        estado: filtroEstado === "todos" ? undefined : filtroEstado,
        q: busquedaDebounced || undefined,
      });
      setFilas(resultado.data);
      setTotal(resultado.total);
      return resultado.data;
    } catch {
      // Sin conexión (u otro error de red): se mantiene lo que ya estaba cargado en pantalla
      // en vez de quedar pegado en "Cargando...".
      return filas;
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, pagina, porPagina, filtroEstado, busquedaDebounced, medidorResaltado]);

  // Cualquier cambio en los filtros vuelve a la primera página.
  useEffect(() => {
    setPagina(1);
  }, [busquedaDebounced, filtroEstado, periodo]);

  // La sincronización de pendientes (offlineQueue.ts) puede pasar en segundo plano — por el
  // evento "online" o el reintento automático — sin que esta página haga nada. Si la cola
  // encoge (algo se subió), se vuelve a pedir la lista al servidor para que la fila deje de
  // verse "pendiente" y pase a verde de una vez, sin esperar a recargar la página a mano.
  const pendientesPrevRef = useRef(totalPendientes);
  useEffect(() => {
    if (totalPendientes < pendientesPrevRef.current) cargar();
    pendientesPrevRef.current = totalPendientes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPendientes]);

  // Si se llega desde el Dashboard con un medidor puntual (ej. "lecturas pendientes"), se abre
  // el modal directo en vez de obligar a buscarlo a mano.
  useEffect(() => {
    if (medidorResaltado && filas.length > 0) {
      const f = filas.find((x) => x.medidorId === medidorResaltado);
      if (f) setSeleccionada(f);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medidorResaltado, filas]);

  // Al guardar/quitar algo dentro del modal, se refresca la lista en segundo plano y se
  // sincroniza la fila abierta para que el modal muestre el estado más reciente.
  async function onCambioModal() {
    const data = await cargar();
    if (seleccionada) {
      const actualizada = data.find((f) => f.medidorId === seleccionada.medidorId);
      if (actualizada) setSeleccionada(actualizada);
    }
  }

  // Fallback por si el pendiente quedó guardado antes de que "filas" incluyera ese medidor
  // (no debería pasar en la práctica, pero evita que desaparezca de la vista de pendientes).
  function filaDesdePendiente(p: PendienteLectura | PendienteNovedad): LecturaPendiente {
    return (
      filas.find((f) => f.medidorId === p.medidorId) ?? {
        medidorId: p.medidorId,
        suscriptor: {
          id: 0,
          nombre: p.suscriptor.nombre,
          codigo: p.suscriptor.codigo,
          ruta: p.suscriptor.ruta,
          estadoFacturacion: "sin_medidor",
          estadoPredio: "activo",
        },
        lecturaAnteriorValor: null,
        lectura: null,
        novedad: null,
      }
    );
  }

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const resultados = verColaOffline
    ? [...pendientesDelPeriodo, ...pendientesNovedadDelPeriodo].map(filaDesdePendiente)
    : filas;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <ClipboardList className="h-6 w-6 text-brand-500" />
          Captura de Lecturas
        </h1>
        <button
          onClick={() => setImportAbierto((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Informe de lecturas
        </button>
      </div>

      {importAbierto && <InformeLecturasPanel onCerrar={() => setImportAbierto(false)} />}

      <div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-4 sm:gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          Periodo
          <input
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-slate-600" />
          <input
            placeholder="Buscar por NUID, nombre o ruta..."
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              if (verColaOffline) setVerColaOffline(false);
            }}
            className={`${inputClass} w-full max-w-sm`}
            autoFocus
          />
        </div>
        <div className="flex items-center gap-1 rounded-full border border-slate-200 p-1 dark:border-slate-800">
          {(
            [
              ["todos", "Todos"],
              ["pendientes", "Ver pendientes"],
              ["tomadas", "Ver ya tomadas"],
            ] as [FiltroEstado, string][]
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              onClick={() => {
                setFiltroEstado(valor);
                if (verColaOffline) setVerColaOffline(false);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filtroEstado === valor
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        {!online && (
          <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-400">
            <WifiOff className="h-3.5 w-3.5" />
            Sin conexión
          </span>
        )}
        {totalPendientes > 0 && (
          <button
            onClick={() => setVerColaOffline((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-200 dark:bg-sky-500/15 dark:text-sky-400 dark:hover:bg-sky-500/25 ${
              verColaOffline ? "ring-2 ring-sky-400" : ""
            }`}
          >
            {totalPendientes} pendiente{totalPendientes === 1 ? "" : "s"} por sincronizar
          </button>
        )}
        {totalPendientes > 0 && (
          <button
            onClick={sincronizarTodoAhora}
            disabled={sincronizando || sincronizandoNovedad || !online}
            className="flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${sincronizando || sincronizandoNovedad ? "animate-spin" : ""}`} />
            Sincronizar ahora
          </button>
        )}
      </div>

      {verColaOffline && (
        <p className="mb-3 text-xs text-slate-600">
          Mostrando solo lo pendiente por sincronizar este periodo.{" "}
          <button onClick={() => setVerColaOffline(false)} className="text-brand-600 hover:underline dark:text-brand-400">
            Volver al listado
          </button>
        </p>
      )}

      {cargando ? (
        <p className="text-slate-700 dark:text-slate-400">Cargando...</p>
      ) : verColaOffline && resultados.length === 0 ? (
        <p className="rounded-xl border border-brand-200 bg-white px-4 py-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900">
          No hay pendientes por sincronizar en este periodo.
        </p>
      ) : !verColaOffline && resultados.length === 0 ? (
        <p className="rounded-xl border border-brand-200 bg-white px-4 py-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900">
          {busqueda.trim() ? `Sin resultados para "${busqueda}".` : "No hay medidores en este filtro."}
        </p>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-brand-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {resultados.map((f) => {
            const pendiente = pendientePorMedidor.get(f.medidorId);
            const pendienteNovedad = pendienteNovedadPorMedidor.get(f.medidorId);
            return (
              <button
                key={f.medidorId}
                onClick={() => setSeleccionada(f)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 sm:px-4 sm:py-3"
              >
                <EstadoIcono f={f} pendiente={pendiente} pendienteNovedad={pendienteNovedad} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {f.suscriptor.nombre}
                  </div>
                  <div className="text-xs text-slate-700 dark:text-slate-400">
                    NUID {f.suscriptor.codigo} · Ruta {f.suscriptor.ruta ?? "-"}
                  </div>
                </div>
                {(pendiente || f.lectura) && (
                  <span className="shrink-0 text-xs text-slate-600">
                    {pendiente ? pendiente.valorLectura : f.lectura!.valorLectura}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!verColaOffline && !cargando && total > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-700 dark:text-slate-400 sm:mt-4">
          <span>
            {total} resultado{total === 1 ? "" : "s"} · página {paginaSegura} de {totalPaginas}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={paginaSegura <= 1}
              className="flex items-center gap-1 rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Anterior
            </button>
            <button
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaSegura >= totalPaginas}
              className="flex items-center gap-1 rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Siguiente
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {seleccionada && (
        <LecturaModal
          fila={seleccionada}
          periodo={periodo}
          pendienteOffline={pendientePorMedidor.get(seleccionada.medidorId)}
          onClose={() => setSeleccionada(null)}
          onCambio={onCambioModal}
        />
      )}
    </div>
  );
}

// Genera el Excel institucional de lecturas para un periodo o un rango de periodos (ej. enero a
// diciembre de 2025). Ya no hay carga masiva desde aquí: todo el histórico ya quedó en la base;
// esto es solo para sacar el informe (con las lecturas faltantes resaltadas, sin contar los meses
// anteriores a la fecha de instalación de cada medidor).
function InformeLecturasPanel({ onCerrar }: { onCerrar: () => void }) {
  const [desde, setDesde] = useState(periodoActual());
  const [hasta, setHasta] = useState(periodoActual());
  const [estadoLectura, setEstadoLectura] = useState<"todas" | "tomadas" | "no_tomadas">("todas");
  const [alcance, setAlcance] = useState<"con_medidor" | "facturando">("con_medidor");

  function generar() {
    if (!desde || !hasta) return;
    const [d, h] = desde <= hasta ? [desde, hasta] : [hasta, desde];
    api.reportes.exportLecturasRango(d, h, { estadoLectura, alcance });
  }

  return (
    <div className="mb-4 rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Informe de lecturas por periodo</h3>
        <button onClick={onCerrar} className="rounded-lg p-1 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-700 dark:text-slate-400">
        Elige un solo mes (deja "hasta" igual a "desde") o un rango (ej. enero a diciembre de 2025). Las filas donde
        el medidor ya estaba instalado pero no se le tomó lectura ese mes quedan resaltadas.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
          Desde
          <input
            type="month"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
          Hasta
          <input
            type="month"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
          Lecturas
          <select
            value={estadoLectura}
            onChange={(e) => setEstadoLectura(e.target.value as typeof estadoLectura)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="todas">Todas</option>
            <option value="tomadas">Solo tomadas</option>
            <option value="no_tomadas">Solo no tomadas</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
          Suscriptores
          <select
            value={alcance}
            onChange={(e) => setAlcance(e.target.value as typeof alcance)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="con_medidor">Todos con medidor</option>
            <option value="facturando">Solo facturando</option>
          </select>
        </label>
        <button
          onClick={generar}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
        >
          <Download className="h-4 w-4" />
          Descargar informe
        </button>
      </div>
    </div>
  );
}
