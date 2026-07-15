import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
  LabelList,
} from "recharts";
import { Link, useNavigate } from "react-router-dom";
import { Users, Gauge, AlertTriangle, ChevronRight, Percent, ChevronDown, ChevronUp, Download } from "lucide-react";
import { api, ESTRATO_LABELS, ESTADO_FACTURACION_LABELS } from "../api/client";
import KpiCard from "../components/KpiCard";
import ChartCard from "../components/ChartCard";
import { SkeletonLista } from "../components/Skeleton";
import { useEsMovil } from "../lib/useEsMovil";

const COLORES_ESTADO: Record<string, string> = {
  sin_medidor: "#94a3b8",
  instalado_prueba: "#fbbf24",
  facturando: "#34d399",
  inactivo: "#f87171",
};

// Las lecturas del mes no empiezan a capturarse hasta el día 20, así que antes de esa fecha
// el dashboard muestra el mes anterior (que sí tiene datos) en vez del mes actual vacío.
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

const COLORES = ["#22d3ee", "#fb923c", "#34d399", "#f87171", "#a78bfa", "#fbbf24", "#94a3b8"];
const GRID_STROKE = "#475569";

function fmt(n: number | null | undefined, decimales = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return n.toLocaleString("es-CO", { maximumFractionDigits: decimales });
}

function FiltroChip({
  label,
  activo,
  onToggle,
}: {
  label: string;
  activo: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
        activo
          ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
          : "border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

type FilaComparable = { usuarios: number; consumo: number };

export default function ReportesPage() {
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState(periodoActual());
  const [periodoComparar, setPeriodoComparar] = useState("");
  const [mostrarPromedioEstratos, setMostrarPromedioEstratos] = useState(false);

  const [resumen, setResumen] = useState<{ mes: string; usuarios: number; consumo: number }[]>([]);
  const [kpis, setKpis] = useState<Awaited<ReturnType<typeof api.dashboard.kpis>> | null>(null);
  const [atipicos, setAtipicos] = useState<Awaited<ReturnType<typeof api.dashboard.atipicos>>>([]);
  const [topConsumidores, setTopConsumidores] = useState<Awaited<ReturnType<typeof api.dashboard.topConsumidores>>>(
    []
  );
  const [porBarrio, setPorBarrio] = useState<({ barrio: string } & FilaComparable)[]>([]);
  const [porBarrioComparar, setPorBarrioComparar] = useState<({ barrio: string } & FilaComparable)[]>([]);
  const [porEstrato, setPorEstrato] = useState<({ estrato: string } & FilaComparable)[]>([]);
  const [porEstratoComparar, setPorEstratoComparar] = useState<({ estrato: string } & FilaComparable)[]>([]);
  const [estadosFacturacion, setEstadosFacturacion] = useState<{ estado: string; cantidad: number }[]>([]);
  const [cargando, setCargando] = useState(true);

  const [rangoResumen, setRangoResumen] = useState<"6" | "12" | "todos" | "personalizado">("6");
  const [resumenDesde, setResumenDesde] = useState("");
  const [resumenHasta, setResumenHasta] = useState("");

  const [barriosOcultos, setBarriosOcultos] = useState<Set<string>>(new Set());
  const [estratosOcultos, setEstratosOcultos] = useState<Set<string>>(new Set());

  function toggleBarrio(barrio: string) {
    setBarriosOcultos((prev) => {
      const next = new Set(prev);
      if (next.has(barrio)) next.delete(barrio);
      else next.add(barrio);
      return next;
    });
  }

  function toggleEstrato(estrato: string) {
    setEstratosOcultos((prev) => {
      const next = new Set(prev);
      if (next.has(estrato)) next.delete(estrato);
      else next.add(estrato);
      return next;
    });
  }

  function seleccionarTodosBarrios() {
    setBarriosOcultos(new Set());
  }

  function deseleccionarTodosBarrios() {
    setBarriosOcultos(new Set(porBarrio.map((b) => b.barrio)));
  }

  function seleccionarTodosEstratos() {
    setEstratosOcultos(new Set());
  }

  function deseleccionarTodosEstratos() {
    setEstratosOcultos(new Set(Object.keys(ESTRATO_LABELS)));
  }

  useEffect(() => {
    setCargando(true);
    Promise.all([
      api.reportes.resumenMensual(),
      api.dashboard.kpis(periodo),
      api.dashboard.atipicos(periodo),
      api.dashboard.topConsumidores(periodo),
      api.reportes.porEstrato(periodo),
      api.dashboard.estadosFacturacion(),
    ]).then(([r, k, a, t, estrato, estados]) => {
      setResumen(r);
      setKpis(k);
      setAtipicos(a);
      setTopConsumidores(t);
      setPorEstrato(estrato);
      setEstadosFacturacion(estados);
      setCargando(false);
    });
  }, [periodo]);

  useEffect(() => {
    if (!periodoComparar) {
      setPorEstratoComparar([]);
      return;
    }
    api.reportes.porEstrato(periodoComparar).then(setPorEstratoComparar);
  }, [periodoComparar]);

  // El consumo por barrio se filtra en el servidor por los mismos estratos activos en los
  // chips de "Consumo por estrato", así se puede excluir Comercial/Oficial del promedio residencial.
  const estratosVisibles = Object.keys(ESTRATO_LABELS).filter((e) => !estratosOcultos.has(e));

  useEffect(() => {
    if (estratosVisibles.length === 0) {
      setPorBarrio([]);
      return;
    }
    api.reportes.porBarrio(periodo, estratosVisibles).then(setPorBarrio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, estratosOcultos]);

  useEffect(() => {
    if (!periodoComparar || estratosVisibles.length === 0) {
      setPorBarrioComparar([]);
      return;
    }
    api.reportes.porBarrio(periodoComparar, estratosVisibles).then(setPorBarrioComparar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoComparar, estratosOcultos]);

  const resumenMostrado =
    rangoResumen === "todos"
      ? resumen
      : rangoResumen === "personalizado"
      ? resumen.filter((r) => (!resumenDesde || r.mes >= resumenDesde) && (!resumenHasta || r.mes <= resumenHasta))
      : resumen.slice(-Number(rangoResumen));

  const totalSuscriptoresEstados = estadosFacturacion.reduce((acc, e) => acc + e.cantidad, 0);
  const sinMedidor = estadosFacturacion.find((e) => e.estado === "sin_medidor")?.cantidad ?? 0;
  const cobertura = totalSuscriptoresEstados > 0 ? ((totalSuscriptoresEstados - sinMedidor) / totalSuscriptoresEstados) * 100 : null;

  // Cada barra es el promedio por suscriptor (consumo/usuarios) de ese barrio, no el total,
  // para que barrios con muchos o pocos usuarios se puedan comparar entre sí.
  const promedioPorBarrio = (b: { consumo: number; usuarios: number }) => (b.usuarios > 0 ? b.consumo / b.usuarios : 0);
  const barrioMapComparar = new Map(porBarrioComparar.map((b) => [b.barrio, promedioPorBarrio(b)]));
  const barriosIncluidos = porBarrio.filter((b) => !barriosOcultos.has(b.barrio));
  const dataBarrio = barriosIncluidos.map((b) => ({
    barrio: b.barrio,
    consumo: promedioPorBarrio(b),
    consumoComparado: barrioMapComparar.get(b.barrio) ?? 0,
  }));
  // Promedio general ponderado por suscriptor entre los barrios/estratos que queden visibles.
  const totalUsuariosBarrio = barriosIncluidos.reduce((acc, b) => acc + b.usuarios, 0);
  const totalConsumoBarrio = barriosIncluidos.reduce((acc, b) => acc + b.consumo, 0);
  const promedioBarrio = totalUsuariosBarrio > 0 ? totalConsumoBarrio / totalUsuariosBarrio : 0;

  // Igual que en el gráfico de barrios: promedio por suscriptor, no el total del estrato.
  const promedioPorEstrato = (e: { consumo: number; usuarios: number }) => (e.usuarios > 0 ? e.consumo / e.usuarios : 0);
  // Para el desplegable de la tarjeta "Consumo promedio del mes": todos los estratos,
  // sin depender de los chips de la gráfica de abajo.
  const promediosPorEstratoTodos = [...porEstrato].sort(
    (a, b) => Object.keys(ESTRATO_LABELS).indexOf(a.estrato) - Object.keys(ESTRATO_LABELS).indexOf(b.estrato)
  );
  const estratoMapComparar = new Map(porEstratoComparar.map((e) => [e.estrato, promedioPorEstrato(e)]));
  const dataEstrato = [...porEstrato]
    .filter((e) => !estratosOcultos.has(e.estrato))
    .sort((a, b) => Object.keys(ESTRATO_LABELS).indexOf(a.estrato) - Object.keys(ESTRATO_LABELS).indexOf(b.estrato))
    .map((e) => ({
      estrato: e.estrato,
      consumo: promedioPorEstrato(e),
      consumoComparado: estratoMapComparar.get(e.estrato) ?? 0,
    }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 sm:mb-5">
        <h1 className="text-xl font-bold sm:text-2xl">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            Periodo
            <input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <button
            onClick={() => api.reportes.exportLecturas(periodo)}
            className="flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download className="h-4 w-4" />
            Informe de lecturas ({periodo})
          </button>
        </div>
      </div>

      {cargando || !kpis ? (
        <SkeletonLista />
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:mb-6 sm:gap-4 md:grid-cols-4">
            {estadosFacturacion.map((e) => (
              <KpiCard
                key={e.estado}
                label={ESTADO_FACTURACION_LABELS[e.estado] ?? e.estado}
                value={fmt(e.cantidad, 0)}
                icon={Users}
                color={COLORES_ESTADO[e.estado]}
                onClick={() => navigate(`/suscriptores?estado=${e.estado}`)}
              />
            ))}
            <KpiCard
              label="Medidores activos"
              value={fmt(kpis.medidoresActivos, 0)}
              icon={Gauge}
              onClick={() => navigate("/medidores")}
            />
            <KpiCard
              label="Cobertura con medidor"
              value={cobertura !== null ? `${fmt(cobertura)}%` : "-"}
              hint={`${fmt(totalSuscriptoresEstados - sinMedidor, 0)} de ${fmt(totalSuscriptoresEstados, 0)} suscriptores`}
              icon={Percent}
            />
            <KpiCard
              label="Consumo promedio del mes (m³)"
              value={fmt(kpis.promedioPorUsuario)}
              hint={mostrarPromedioEstratos ? "Clic para ocultar por estrato" : "Clic para ver por estrato"}
              icon={mostrarPromedioEstratos ? ChevronUp : ChevronDown}
              onClick={() => setMostrarPromedioEstratos((v) => !v)}
            />
            <KpiCard
              label="Lecturas pendientes"
              value={fmt(kpis.lecturasPendientes, 0)}
              variant={kpis.lecturasPendientes > 0 ? "alert" : "default"}
              hint={kpis.lecturasPendientes > 0 ? "medidores sin lectura este mes" : "todo capturado"}
              icon={AlertTriangle}
              onClick={() => navigate(`/lecturas?periodo=${periodo}&pendientes=1`)}
            />
          </div>

          {mostrarPromedioEstratos && (
            <div className="mb-3 hidden rounded-xl border border-brand-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:mb-6 sm:block sm:p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200 sm:mb-3">
                Consumo promedio por suscriptor, por estrato ({periodo})
              </h3>
              <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-6">
                {promediosPorEstratoTodos.map((e) => (
                  <div key={e.estrato} className="rounded-lg border border-slate-200 p-2 text-center dark:border-slate-800 sm:p-3">
                    <div className="text-[10px] text-slate-700 dark:text-slate-400 sm:text-xs">
                      {e.estrato} — {ESTRATO_LABELS[e.estrato] ?? "desconocido"}
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100 sm:text-lg">
                      {fmt(promedioPorEstrato(e))} m³
                    </div>
                    <div className="mt-0.5 hidden text-xs text-slate-600 sm:block">{fmt(e.usuarios, 0)} usuarios</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Link
            to={`/atipicos?periodo=${periodo}`}
            className="mb-3 flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm shadow-sm transition-colors hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-900/20 dark:hover:bg-amber-900/30 sm:mb-6 sm:p-4"
          >
            <span className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              Ver consumos atípicos del periodo ({atipicos.length})
            </span>
            <ChevronRight className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </Link>

          <div className="grid gap-3 sm:gap-6 lg:grid-cols-2">
            {/* En móvil el dashboard se reduce a tarjetas + atípicos + esta gráfica de barrio
                (desplegable); el resto de gráficas solo se muestra desde md hacia arriba. */}
            <div className="hidden md:contents">
            <ChartCard title="Consumo total por mes (m³)">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <select
                  value={rangoResumen}
                  onChange={(e) => setRangoResumen(e.target.value as typeof rangoResumen)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="6">Últimos 6 meses</option>
                  <option value="12">Últimos 12 meses</option>
                  <option value="todos">Todos</option>
                  <option value="personalizado">Personalizado...</option>
                </select>
                {rangoResumen === "personalizado" && (
                  <>
                    <input
                      type="month"
                      value={resumenDesde}
                      onChange={(e) => setResumenDesde(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                    />
                    <span className="text-xs text-slate-600">a</span>
                    <input
                      type="month"
                      value={resumenHasta}
                      onChange={(e) => setResumenHasta(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                    />
                  </>
                )}
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={resumenMostrado}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} opacity={0.3} />
                  <XAxis dataKey="mes" stroke={GRID_STROKE} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <YAxis stroke={GRID_STROKE} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <Tooltip
                    cursor={false}
                    contentStyle={{ background: "#1e293b", border: "none", color: "#e2e8f0" }}
                    labelStyle={{ color: "#94a3b8" }}
                    itemStyle={{ color: "#e2e8f0" }}
                    formatter={(v: number) => fmt(v, 2)}
                  />
                  <Bar
                    dataKey="consumo"
                    fill={COLORES[0]}
                    radius={[4, 4, 0, 0]}
                    activeBar={{ stroke: "#fff", strokeWidth: 2 }}
                  >
                    <LabelList dataKey="consumo" position="insideTop" formatter={(v: number) => fmt(v, 2)} fill="#0f172a" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={`Top 10 consumidores (${periodo})`}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topConsumidores} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} opacity={0.3} />
                  <XAxis type="number" stroke={GRID_STROKE} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="codigo"
                    width={80}
                    stroke={GRID_STROKE}
                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                    label={{ value: "NUID", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }}
                  />
                  <Tooltip
                    cursor={false}
                    contentStyle={{ background: "#1e293b", border: "none", color: "#e2e8f0" }}
                    labelStyle={{ color: "#94a3b8" }}
                    itemStyle={{ color: "#e2e8f0" }}
                    formatter={(v: number) => fmt(v, 2)}
                    labelFormatter={(_l, p) => p?.[0]?.payload?.nombre}
                  />
                  <Bar
                    dataKey="consumo"
                    fill={COLORES[1]}
                    radius={[0, 4, 4, 0]}
                    activeBar={{ stroke: "#fff", strokeWidth: 2 }}
                  >
                    <LabelList dataKey="consumo" position="insideRight" formatter={(v: number) => fmt(v, 2)} fill="#0f172a" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            </div>

            <ChartCard title={`Consumo promedio por suscriptor, por barrio (${periodo}${periodoComparar ? ` vs ${periodoComparar}` : ""})`}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 dark:border-orange-700/50 dark:bg-orange-900/20 dark:text-orange-400">
                  Promedio general: {fmt(promedioBarrio)} m³/suscriptor
                </span>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-400">
                  Comparar con
                  <input
                    type="month"
                    value={periodoComparar}
                    onChange={(e) => setPeriodoComparar(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                </label>
                {periodoComparar && (
                  <button
                    onClick={() => setPeriodoComparar("")}
                    className="text-xs text-slate-600 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    quitar
                  </button>
                )}
              </div>
              <p className="mb-1 text-xs font-medium text-slate-700 dark:text-slate-400">Estratos incluidos</p>
              <div className="mb-2 flex gap-3 text-xs">
                <button onClick={seleccionarTodosEstratos} className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                  Todos
                </button>
                <button onClick={deseleccionarTodosEstratos} className="font-medium text-slate-600 hover:underline">
                  Ninguno
                </button>
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {Object.keys(ESTRATO_LABELS).map((e) => (
                  <FiltroChip key={e} label={e} activo={!estratosOcultos.has(e)} onToggle={() => toggleEstrato(e)} />
                ))}
              </div>
              <p className="mb-1 text-xs font-medium text-slate-700 dark:text-slate-400">Barrios incluidos</p>
              <div className="mb-2 flex gap-3 text-xs">
                <button onClick={seleccionarTodosBarrios} className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                  Todos
                </button>
                <button onClick={deseleccionarTodosBarrios} className="font-medium text-slate-600 hover:underline">
                  Ninguno
                </button>
              </div>
              <div className="mb-3 flex max-h-16 flex-wrap gap-1.5 overflow-y-auto">
                {porBarrio.map((b) => (
                  <FiltroChip
                    key={b.barrio}
                    label={b.barrio}
                    activo={!barriosOcultos.has(b.barrio)}
                    onToggle={() => toggleBarrio(b.barrio)}
                  />
                ))}
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dataBarrio}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} opacity={0.3} />
                  <XAxis
                    dataKey="barrio"
                    stroke={GRID_STROKE}
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    tickFormatter={(v: string) => (v.length > 8 ? `${v.slice(0, 7)}…` : v)}
                    angle={-60}
                    textAnchor="end"
                    height={80}
                    interval={0}
                  />
                  <YAxis stroke={GRID_STROKE} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <Tooltip
                    cursor={false}
                    contentStyle={{ background: "#1e293b", border: "none", color: "#e2e8f0" }}
                    labelStyle={{ color: "#94a3b8" }}
                    itemStyle={{ color: "#e2e8f0" }}
                    labelFormatter={(v: string) => v}
                    formatter={(v: number) => fmt(v, 2)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
                  <ReferenceLine y={promedioBarrio} stroke="#fb923c" strokeDasharray="4 4" />
                  <Bar
                    dataKey="consumo"
                    name={periodo}
                    fill={COLORES[2]}
                    radius={[4, 4, 0, 0]}
                    activeBar={{ stroke: "#fff", strokeWidth: 2 }}
                  >
                    <LabelList dataKey="consumo" position="insideTop" formatter={(v: number) => fmt(v, 2)} fill="#fff" fontSize={10} />
                  </Bar>
                  {periodoComparar && (
                    <Bar
                      dataKey="consumoComparado"
                      name={periodoComparar}
                      fill={COLORES[4]}
                      radius={[4, 4, 0, 0]}
                      activeBar={{ stroke: "#fff", strokeWidth: 2 }}
                    >
                      <LabelList dataKey="consumoComparado" position="insideTop" formatter={(v: number) => fmt(v, 2)} fill="#fff" fontSize={10} />
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
              {estratosVisibles.length === 0 && (
                <p className="mt-2 text-center text-xs text-slate-600">
                  Selecciona al menos un estrato arriba para ver el consumo por barrio.
                </p>
              )}
            </ChartCard>

            <div className="hidden md:contents">
            <ChartCard title={`Consumo promedio por suscriptor, por estrato (${periodo}${periodoComparar ? ` vs ${periodoComparar}` : ""})`}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-400">
                  Comparar con
                  <input
                    type="month"
                    value={periodoComparar}
                    onChange={(e) => setPeriodoComparar(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                </label>
                {periodoComparar && (
                  <button
                    onClick={() => setPeriodoComparar("")}
                    className="text-xs text-slate-600 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    quitar
                  </button>
                )}
              </div>
              <div className="mb-2 flex gap-3 text-xs">
                <button onClick={seleccionarTodosEstratos} className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                  Todos
                </button>
                <button onClick={deseleccionarTodosEstratos} className="font-medium text-slate-600 hover:underline">
                  Ninguno
                </button>
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {Object.keys(ESTRATO_LABELS).map((e) => (
                  <FiltroChip
                    key={e}
                    label={e}
                    activo={!estratosOcultos.has(e)}
                    onToggle={() => toggleEstrato(e)}
                  />
                ))}
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dataEstrato}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} opacity={0.3} />
                  <XAxis dataKey="estrato" stroke={GRID_STROKE} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <YAxis stroke={GRID_STROKE} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <Tooltip
                    cursor={false}
                    contentStyle={{ background: "#1e293b", border: "none", color: "#e2e8f0" }}
                    labelStyle={{ color: "#94a3b8" }}
                    itemStyle={{ color: "#e2e8f0" }}
                    formatter={(v: number) => fmt(v, 2)}
                    labelFormatter={(estrato: string) => `Estrato ${estrato} (${ESTRATO_LABELS[estrato] ?? "desconocido"})`}
                  />
                  {periodoComparar && <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />}
                  <Bar
                    dataKey="consumo"
                    name={periodo}
                    fill={COLORES[3]}
                    radius={[4, 4, 0, 0]}
                    activeBar={{ stroke: "#fff", strokeWidth: 2 }}
                  >
                    <LabelList dataKey="consumo" position="insideTop" formatter={(v: number) => fmt(v, 2)} fill="#fff" fontSize={11} />
                  </Bar>
                  {periodoComparar && (
                    <Bar
                      dataKey="consumoComparado"
                      name={periodoComparar}
                      fill={COLORES[5]}
                      radius={[4, 4, 0, 0]}
                      activeBar={{ stroke: "#fff", strokeWidth: 2 }}
                    >
                      <LabelList dataKey="consumoComparado" position="insideTop" formatter={(v: number) => fmt(v, 2)} fill="#fff" fontSize={11} />
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Cobertura de medición (suscriptores)">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={estadosFacturacion}
                    dataKey="cantidad"
                    nameKey="estado"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    label={({ cantidad }) => cantidad}
                  >
                    {estadosFacturacion.map((e) => (
                      <Cell key={e.estado} fill={COLORES_ESTADO[e.estado] ?? "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "none", color: "#e2e8f0" }}
                    labelStyle={{ color: "#94a3b8" }}
                    itemStyle={{ color: "#e2e8f0" }}
                    formatter={(v: number, _n, p) => [v, ESTADO_FACTURACION_LABELS[p.payload.estado] ?? p.payload.estado]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, color: "#94a3b8" }}
                    formatter={(value: string) => ESTADO_FACTURACION_LABELS[value] ?? value}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
