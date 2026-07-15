import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Home, Users, Gauge, Droplet, Warehouse, Package, DollarSign, ArrowRight, AlertTriangle } from "lucide-react";
import { api, InventarioKpis } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import KpiCard from "../components/KpiCard";

interface MedicionKpis {
  suscriptoresActivos: number;
  medidoresActivos: number;
  facturadosPorMedicion: number;
  promedioPorUsuario: number;
  lecturasPendientes: number;
}

// Las lecturas del mes no empiezan a capturarse hasta el día 20, así que antes de esa fecha
// se muestra el mes anterior (que sí tiene datos) en vez del mes actual vacío. Mismo criterio
// que frontend/src/pages/ReportesPage.tsx.
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

function fmt(n: number, decimales = 0): string {
  return n.toLocaleString("es-CO", { maximumFractionDigits: decimales });
}

function fmtMoneda(n: number): string {
  return n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

// Banner de alertas para no obligar a entrar al dashboard/atípicos a diario solo para ver si
// hay algo pendiente de revisar: lecturas sin tomar y consumos atípicos del periodo vigente.
function AlertasProactivas() {
  const [kpis, setKpis] = useState<MedicionKpis | null>(null);
  const [atipicos, setAtipicos] = useState<number | null>(null);

  useEffect(() => {
    api.dashboard.kpis(periodoActual()).then(setKpis);
    api.dashboard.atipicos(periodoActual()).then((r) => setAtipicos(r.length));
  }, []);

  const lecturasPendientes = kpis?.lecturasPendientes ?? 0;
  if (lecturasPendientes === 0 && (atipicos ?? 0) === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700/50 dark:bg-amber-900/20 sm:flex-row sm:items-center sm:gap-4">
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-amber-800 dark:text-amber-300">
        {lecturasPendientes > 0 && (
          <Link to="/lecturas" className="hover:underline">
            <strong>{lecturasPendientes}</strong> predio{lecturasPendientes === 1 ? "" : "s"} sin lectura este mes
          </Link>
        )}
        {(atipicos ?? 0) > 0 && (
          <Link to="/atipicos" className="hover:underline">
            <strong>{atipicos}</strong> consumo{atipicos === 1 ? "" : "s"} atípico{atipicos === 1 ? "" : "s"} sin revisar
          </Link>
        )}
      </div>
    </div>
  );
}

function SeccionMedicion() {
  const [kpis, setKpis] = useState<MedicionKpis | null>(null);

  useEffect(() => {
    api.dashboard.kpis(periodoActual()).then(setKpis);
  }, []);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
          <Droplet className="h-5 w-5 text-brand-500" />
          Medición
        </h2>
        <Link
          to="/medicion"
          className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Ver dashboard completo
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {!kpis ? (
        <p className="text-sm text-slate-700 dark:text-slate-400">Cargando...</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Suscriptores activos" value={fmt(kpis.suscriptoresActivos)} icon={Users} />
          <KpiCard label="Medidores activos" value={fmt(kpis.medidoresActivos)} icon={Gauge} />
          <KpiCard label="Facturados por medición" value={fmt(kpis.facturadosPorMedicion)} icon={Gauge} />
          <KpiCard label="Promedio del mes" value={`${fmt(kpis.promedioPorUsuario)} m³`} icon={Droplet} />
          <KpiCard
            label="Lecturas pendientes"
            value={fmt(kpis.lecturasPendientes)}
            variant={kpis.lecturasPendientes > 0 ? "alert" : "default"}
          />
        </div>
      )}
    </section>
  );
}

function SeccionInventario() {
  const [kpis, setKpis] = useState<InventarioKpis | null>(null);

  useEffect(() => {
    api.inventario.kpis().then(setKpis);
  }, []);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
          <Warehouse className="h-5 w-5 text-brand-500" />
          Inventario general
        </h2>
        <Link
          to="/inventario"
          className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Ver inventario
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {!kpis ? (
        <p className="text-sm text-slate-700 dark:text-slate-400">Cargando...</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard label="Total de ítems" value={fmt(kpis.totalItems)} icon={Package} />
          <KpiCard label="Valor total" value={fmtMoneda(kpis.valorTotalInventario)} icon={DollarSign} />
          <KpiCard label="Préstamos activos" value={fmt(kpis.prestamosActivos)} />
        </div>
      )}
    </section>
  );
}

export default function InicioPage() {
  const { usuario } = useAuth();
  const puedeMedicion = usuario?.permisos?.includes("dashboard");
  const puedeInventario =
    usuario?.permisos?.includes("inventario_ver") || usuario?.permisos?.includes("inventario_avanzado");

  return (
    <div>
      <h1 className="mb-5 flex items-center gap-2 text-xl font-bold sm:text-2xl">
        <Home className="h-6 w-6 text-brand-500" />
        Inicio
      </h1>

      {!puedeMedicion && !puedeInventario ? (
        <p className="rounded-xl border border-brand-200 bg-white px-4 py-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900">
          Bienvenido, {usuario?.nombre}. Usa el menú de la izquierda para acceder a tus secciones.
        </p>
      ) : (
        <div className="space-y-6">
          {puedeMedicion && <AlertasProactivas />}
          {puedeMedicion && <SeccionMedicion />}
          {puedeInventario && <SeccionInventario />}
        </div>
      )}
    </div>
  );
}
