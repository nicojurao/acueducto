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
import { api, LecturaPendiente, Barrio } from "../api/client";
import LecturaModal from "../components/LecturaModal";
import { PendienteLectura, PendienteNovedad, useColaPendientes, useColaPendientesNovedad } from "../lib/offlineQueue";
import { guardarEnCache, leerDeCache } from "../lib/cacheOffline";
import { leerSnapshot, construirLecturasDePeriodo, calcularResumenPeriodo } from "../lib/offlineSnapshot";
import { useEsMovil } from "../lib/useEsMovil";
import { SkeletonLista } from "../components/Skeleton";
import BusquedaInput from "../components/BusquedaInput";
import EmptyState from "../components/EmptyState";
import { inputClass } from "../lib/ui";

// Las lecturas del mes no empiezan a capturarse hasta el día 20, así que antes de esa fecha se
// muestra el mes anterior (que sí tiene datos) en vez del mes actual vacío. Mismo criterio que
// frontend/src/pages/InicioPage.tsx y ReportesPage.tsx.
function periodoActual(): string {
  const now = new Date();
  let anio = now.getFullYear();
  let mes = now.getMonth() + 1;
  if (now.getDate() < 20) {
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      anio -= 1;
    }
  }
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

function sumarMeses(periodo: string, delta: number): string {
  const [anioStr, mesStr] = periodo.split("-");
  let anio = Number(anioStr);
  let mes = Number(mesStr) + delta;
  while (mes < 1) {
    mes += 12;
    anio -= 1;
  }
  while (mes > 12) {
    mes -= 12;
    anio += 1;
  }
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

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
  // Se trae el periodo COMPLETO de una sola vez (no hay tantos medidores como para que pese:
  // ver comentario en cargar()) y la paginación/búsqueda/filtro de estado y barrio se resuelven
  // acá mismo en el navegador, sin volver a pedirle nada al servidor. Esto de paso es lo que
  // permite que, si el fontanero se queda sin internet, siga viendo y filtrando el periodo que
  // ya se alcanzó a cargar en vez de depender de que cada combinación puntual haya sido cacheada.
  const [todasFilas, setTodasFilas] = useState<LecturaPendiente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaDebounced, setBusquedaDebounced] = useState("");
  const [verColaOffline, setVerColaOffline] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [barrios, setBarrios] = useState<Barrio[]>([]);
  const [filtroBarrio, setFiltroBarrio] = useState<number | "">("");
  useEffect(() => {
    api.barrios
      .list()
      .then((data) => {
        guardarEnCache("barrios", data);
        setBarrios(data);
      })
      .catch(() => {
        const cache = leerDeCache<Barrio[]>("barrios");
        if (cache) setBarrios(cache);
      });
  }, []);
  // "Lecturas pendientes" en el Dashboard manda ?pendientes=1 para llegar con el filtro ya
  // aplicado — sin esto, se ignoraba el query param y quedaba lo que el usuario tuviera
  // guardado de antes (normalmente "todos"), mostrando de todo en vez de solo lo pendiente.
  useEffect(() => {
    if (searchParams.get("pendientes") === "1") setFiltroEstado("pendientes");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Precarga en segundo plano (sin tocar lo que se ve en pantalla) del periodo anterior, el
  // actual y el siguiente a periodoActual() — ej. si hoy es 6 de septiembre, periodoActual() da
  // agosto (todavía no arranca la captura de septiembre, ver comentario de periodoActual()), así
  // que se guardan julio, agosto y septiembre. La idea es que un fontanero que se va a quedar
  // sin señal en el día ya tenga en el dispositivo tanto el mes que está cerrando como el que
  // está por abrir, sin depender de que los haya visitado a mano mientras tenía internet. Solo
  // escribe en la cache (guardarEnCache) — si alguno de estos coincide con el periodo que el
  // usuario tiene abierto ahora mismo, "cargar()" ya se encarga de mostrarlo en pantalla aparte.
  useEffect(() => {
    const base = periodoActual();
    [sumarMeses(base, -1), base, sumarMeses(base, 1)].forEach((p) => {
      api.lecturas
        .listByPeriodo(p)
        .then((data) => guardarEnCache(`lecturas_${p}`, data))
        .catch(() => {});
    });
  }, []);
  const [pagina, setPagina] = useState(1);
  const [seleccionada, setSeleccionada] = useState<LecturaPendiente | null>(null);
  // Normalmente el periodo del modal es el que está seleccionado en pantalla — pero desde la
  // vista "pendientes por sincronizar" (que ahora mezcla todos los periodos, ver comentario más
  // abajo) se puede abrir un medidor de OTRO mes, y hay que abrir el modal con SU periodo real,
  // no con el que estaba viendo antes de entrar a esa vista.
  const [seleccionadaPeriodo, setSeleccionadaPeriodo] = useState<string | null>(null);
  const [importAbierto, setImportAbierto] = useState(false);
  const [resumen, setResumen] = useState<{ total: number; tomadas: number } | null>(null);
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
  // Versión SIN filtrar por periodo, para la vista "pendientes por sincronizar": el contador del
  // botón ya suma pendientes de todos los meses, así que al abrir esa vista debe mostrarlos a
  // todos también — antes se filtraba por el periodo que se tuviera seleccionado en pantalla, y
  // si las pendientes eran de otro mes (ej. viendo agosto con algo pendiente de septiembre) la
  // vista salía vacía a pesar de que el botón decía que sí había pendientes.
  const pendienteGlobalPorMedidor = useMemo(() => new Map(pendientes.map((p) => [p.medidorId, p])), [pendientes]);
  const pendienteNovedadGlobalPorMedidor = useMemo(
    () => new Map(pendientesNovedad.map((p) => [p.medidorId, p])),
    [pendientesNovedad]
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

  // peticionIdRef: si el periodo cambia varias veces seguido, las respuestas pueden llegar
  // desordenadas — se descarta el resultado si ya no es la petición más reciente, para no pisar
  // la vista con datos viejos.
  const peticionIdRef = useRef(0);
  // Una sola entrada de cache por periodo (antes había una por cada combinación de
  // página/filtro/búsqueda — con el periodo completo en memoria ya no hace falta).
  function claveCache() {
    return `lecturas_${periodo}`;
  }
  // Periodo de la data que hay ACTUALMENTE en "todasFilas", para saber si sigue sirviendo como
  // respaldo cuando un fetch falla (ver comentario en el catch de abajo).
  const periodoMostradoRef = useRef<string | null>(null);
  async function cargar() {
    const idPeticion = ++peticionIdRef.current;
    const clave = claveCache();
    setCargando(true);
    try {
      // Sin "page"/"estado"/"q"/"barrio" en la petición, el backend devuelve TODO el periodo sin
      // filtrar (ver GET /api/lecturas) — con ~200 medidores en total esto es una sola petición
      // liviana, y deja resolver paginación/búsqueda/filtro en el cliente sin ir y volver al
      // servidor por cada tecla o clic.
      const data = await api.lecturas.listByPeriodo(periodo);
      if (idPeticion !== peticionIdRef.current) return data;
      guardarEnCache(clave, data);
      periodoMostradoRef.current = periodo;
      setTodasFilas(data);
      return data;
    } catch {
      // Sin conexión (u otro error de red). Si lo que hay en pantalla es de OTRO periodo (el
      // fontanero cambió de mes mientras estaba offline), mostrarlo haría parecer que el periodo
      // nuevo ya tiene las mismas lecturas que el anterior (bug reportado) — se busca la cache de
      // ESTE periodo puntual, y si nunca se cargó con internet, se limpia en vez de mostrar datos
      // de otro mes.
      if (periodoMostradoRef.current === periodo) return todasFilas;
      const cache = leerDeCache<LecturaPendiente[]>(clave);
      if (cache) {
        periodoMostradoRef.current = periodo;
        setTodasFilas(cache);
        return cache;
      }
      // La cache puntual (los 3 meses que se precargan solos) no tiene este periodo — último
      // recurso: si el fontanero activó "Modo de salida" antes de salir, el snapshot completo en
      // IndexedDB trae el histórico ENTERO, no solo esos 3 meses.
      const snapshot = await leerSnapshot();
      const desdeSnapshot = snapshot ? construirLecturasDePeriodo(snapshot, periodo) : [];
      periodoMostradoRef.current = periodo;
      setTodasFilas(desdeSnapshot);
      return desdeSnapshot;
    } finally {
      if (idPeticion === peticionIdRef.current) setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  // Filtro de estado/búsqueda/barrio sobre el periodo completo ya en memoria.
  const filtradas = useMemo(() => {
    const texto = busquedaDebounced.trim().toLowerCase();
    return todasFilas.filter((f) => {
      if (filtroEstado === "pendientes" && f.lectura) return false;
      if (filtroEstado === "tomadas" && !f.lectura) return false;
      if (filtroBarrio && f.suscriptor.barrioId !== filtroBarrio) return false;
      if (texto) {
        const coincide =
          f.suscriptor.nombre.toLowerCase().includes(texto) ||
          f.suscriptor.codigo.toLowerCase().includes(texto) ||
          (f.suscriptor.ruta ?? "").toLowerCase().includes(texto) ||
          f.serial.toLowerCase().includes(texto);
        if (!coincide) return false;
      }
      return true;
    });
  }, [todasFilas, filtroEstado, filtroBarrio, busquedaDebounced]);
  const total = filtradas.length;
  const filas = medidorResaltado ? todasFilas : filtradas.slice((pagina - 1) * porPagina, pagina * porPagina);

  function cargarResumen() {
    api.lecturas
      .resumen(periodo)
      .then((data) => {
        guardarEnCache(`resumen_${periodo}`, data);
        setResumen(data);
      })
      .catch(async () => {
        // Mismo cuidado que en cargar(): si no hay cache para ESTE periodo puntual, no dejar el
        // resumen del periodo anterior en pantalla (parecería que este periodo ya tiene lo mismo).
        const cache = leerDeCache<{ total: number; tomadas: number }>(`resumen_${periodo}`);
        if (cache) {
          setResumen(cache);
          return;
        }
        const snapshot = await leerSnapshot();
        setResumen(snapshot ? calcularResumenPeriodo(snapshot, periodo) : null);
      });
  }
  useEffect(cargarResumen, [periodo]);

  // Cualquier cambio en los filtros vuelve a la primera página.
  useEffect(() => {
    setPagina(1);
  }, [busquedaDebounced, filtroEstado, filtroBarrio, periodo]);

  // La sincronización de pendientes (offlineQueue.ts) puede pasar en segundo plano — por el
  // evento "online" o el reintento automático — sin que esta página haga nada. Si la cola
  // encoge (algo se subió), se vuelve a pedir la lista al servidor para que la fila deje de
  // verse "pendiente" y pase a verde de una vez, sin esperar a recargar la página a mano.
  const pendientesPrevRef = useRef(totalPendientes);
  useEffect(() => {
    if (totalPendientes < pendientesPrevRef.current) {
      cargar();
      cargarResumen();
    }
    pendientesPrevRef.current = totalPendientes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPendientes]);

  // Si se llega desde el Dashboard con un medidor puntual (ej. "lecturas pendientes"), se abre
  // el modal directo en vez de obligar a buscarlo a mano.
  useEffect(() => {
    if (medidorResaltado && todasFilas.length > 0) {
      const f = todasFilas.find((x) => x.medidorId === medidorResaltado);
      if (f) {
        setSeleccionada(f);
        setSeleccionadaPeriodo(periodo);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medidorResaltado, todasFilas]);

  // Al guardar/quitar algo dentro del modal, se refresca la lista en segundo plano y se
  // sincroniza la fila abierta para que el modal muestre el estado más reciente.
  async function onCambioModal() {
    const data = await cargar();
    cargarResumen();
    if (seleccionada) {
      const actualizada = data.find((f) => f.medidorId === seleccionada.medidorId);
      if (actualizada) setSeleccionada(actualizada);
    }
  }

  // Fallback por si el pendiente quedó guardado antes de que "todasFilas" incluyera ese medidor
  // (no debería pasar en la práctica, pero evita que desaparezca de la vista de pendientes).
  function filaDesdePendiente(p: PendienteLectura | PendienteNovedad): LecturaPendiente {
    return (
      todasFilas.find((f) => f.medidorId === p.medidorId) ?? {
        medidorId: p.medidorId,
        serial: "",
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
  const resultados = verColaOffline ? [...pendientes, ...pendientesNovedad].map(filaDesdePendiente) : filas;

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

      {resumen && resumen.total > 0 && (
        <div className="mb-3 sm:mb-4">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>
              Avance del periodo: <strong className="text-slate-800 dark:text-slate-200">{resumen.tomadas}</strong> de{" "}
              {resumen.total} tomadas
            </span>
            <span>{Math.round((resumen.tomadas / resumen.total) * 100)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${Math.min(100, Math.round((resumen.tomadas / resumen.total) * 100))}%` }}
            />
          </div>
        </div>
      )}

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
          <BusquedaInput
            placeholder="Buscar por NUID, nombre o ruta..."
            value={busqueda}
            onChange={(valor) => {
              setBusqueda(valor);
              if (verColaOffline) setVerColaOffline(false);
            }}
            className="w-full max-w-sm"
            autoFocus
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          Barrio
          <select
            value={filtroBarrio}
            onChange={(e) => setFiltroBarrio(e.target.value ? Number(e.target.value) : "")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">Todos</option>
            {barrios.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
        </label>
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
        <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
          Mostrando solo lo pendiente por sincronizar (de todos los periodos).{" "}
          <button onClick={() => setVerColaOffline(false)} className="text-brand-600 hover:underline dark:text-brand-400">
            Volver al listado
          </button>
        </p>
      )}

      {cargando ? (
        <SkeletonLista filas={porPagina} />
      ) : verColaOffline && resultados.length === 0 ? (
        <EmptyState mensaje="No hay pendientes por sincronizar." />
      ) : !verColaOffline && resultados.length === 0 ? (
        <EmptyState
          mensaje={busqueda.trim() ? `Sin resultados para "${busqueda}".` : "No hay medidores en este filtro."}
        />
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {resultados.map((f) => {
            const pendiente = verColaOffline ? pendienteGlobalPorMedidor.get(f.medidorId) : pendientePorMedidor.get(f.medidorId);
            const pendienteNovedad = verColaOffline
              ? pendienteNovedadGlobalPorMedidor.get(f.medidorId)
              : pendienteNovedadPorMedidor.get(f.medidorId);
            return (
              <button
                key={f.medidorId}
                onClick={() => {
                  setSeleccionada(f);
                  setSeleccionadaPeriodo((pendiente ?? pendienteNovedad)?.periodo ?? periodo);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 sm:px-4 sm:py-3"
              >
                <EstadoIcono f={f} pendiente={pendiente} pendienteNovedad={pendienteNovedad} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {f.suscriptor.nombre}
                  </div>
                  <div className="text-xs text-slate-700 dark:text-slate-400">
                    NUID {f.suscriptor.codigo} · Ruta {f.suscriptor.ruta ?? "-"} · {f.suscriptor.barrioCat?.nombre ?? "Sin barrio"}
                    {verColaOffline && (pendiente || pendienteNovedad) && (
                      <> · Periodo {(pendiente ?? pendienteNovedad)!.periodo}</>
                    )}
                  </div>
                  {f.lectura && (
                    <div className="text-xs text-slate-500 dark:text-slate-500">
                      Tomada el {new Date(f.lectura.fechaRegistro).toLocaleString("es-CO", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  )}
                </div>
                {(pendiente || f.lectura) && (
                  <span className="shrink-0 text-xs text-slate-600 dark:text-slate-400">
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
          periodo={seleccionadaPeriodo ?? periodo}
          pendienteOffline={pendientes.find(
            (p) => p.medidorId === seleccionada.medidorId && p.periodo === (seleccionadaPeriodo ?? periodo)
          )}
          onClose={() => {
            setSeleccionada(null);
            setSeleccionadaPeriodo(null);
          }}
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
  const [formato, setFormato] = useState<"lista" | "horizontal">("lista");

  function generar() {
    if (!desde || !hasta) return;
    const [d, h] = desde <= hasta ? [desde, hasta] : [hasta, desde];
    api.reportes.exportLecturasRango(d, h, { estadoLectura, alcance, formato });
  }

  return (
    <div className="mb-4 rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Informe de lecturas por periodo</h3>
        <button onClick={onCerrar} className="rounded-lg p-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
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
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
          Formato
          <select
            value={formato}
            onChange={(e) => setFormato(e.target.value as typeof formato)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="lista">Lista (una fila por periodo)</option>
            <option value="horizontal">Horizontal (una columna por periodo)</option>
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
