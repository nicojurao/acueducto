import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  ShieldAlert,
  Database,
  HardDrive,
  Download,
  Loader2,
  UserCog,
  Fingerprint,
  LayoutGrid,
  ShieldCheck,
  History,
} from "lucide-react";
import { api } from "../api/client";
import UsuariosPage from "./UsuariosPage";
import AuditoriaPage from "./AuditoriaPage";
import RolesPage from "./RolesPage";
import HistorialPage from "./HistorialPage";

const GRID_STROKE = "#94a3b8";

function formatBytes(bytesStr: string): string {
  const bytes = Number(bytesStr);
  if (!Number.isFinite(bytes) || bytes === 0) return "0 MB";
  const unidades = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(unidades.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${unidades[i]}`;
}

type Tab = "resumen" | "usuarios" | "roles" | "historial" | "auditoria";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("resumen");

  const tabs: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
    { id: "resumen", label: "Resumen del sistema", icon: LayoutGrid },
    { id: "usuarios", label: "Usuarios", icon: UserCog },
    { id: "roles", label: "Roles y permisos", icon: ShieldCheck },
    { id: "historial", label: "Historial de cambios", icon: History },
    { id: "auditoria", label: "Auditoría de sesiones", icon: Fingerprint },
  ];

  return (
    <div>
      <h1 className="mb-3 flex items-center gap-2 text-xl font-bold sm:mb-5 sm:text-2xl">
        <ShieldAlert className="h-6 w-6 text-brand-500" />
        Panel de administración
      </h1>

      <div className="mb-4 flex items-center gap-1 rounded-full border border-slate-200 p-1 dark:border-slate-800 w-fit">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
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

      {tab === "resumen" && <ResumenSistema />}
      {tab === "usuarios" && <UsuariosPage />}
      {tab === "roles" && <RolesPage />}
      {tab === "historial" && <HistorialPage />}
      {tab === "auditoria" && <AuditoriaPage />}
    </div>
  );
}

function ResumenSistema() {
  const [datos, setDatos] = useState<{
    actual: { tamanoBdBytes: string; tamanoMinioBytes: string };
    historial: { fecha: string; tamanoBdBytes: string; tamanoMinioBytes: string }[];
  } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [descargando, setDescargando] = useState<"bd" | "minio" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin
      .almacenamiento()
      .then(setDatos)
      .finally(() => setCargando(false));
  }, []);

  async function descargar(tipo: "bd" | "minio") {
    setDescargando(tipo);
    setError(null);
    try {
      if (tipo === "bd") await api.admin.backupPostgres();
      else await api.admin.backupMinio();
    } catch {
      setError("No se pudo generar el backup. Intenta de nuevo.");
    } finally {
      setDescargando(null);
    }
  }

  if (cargando) {
    return <div className="flex h-40 items-center justify-center text-slate-500 dark:text-slate-400">Cargando...</div>;
  }
  if (!datos) return null;

  const historialGrafica = datos.historial.map((h) => ({
    fecha: new Date(h.fecha).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }),
    bd: Number(h.tamanoBdBytes) / 1024 / 1024,
    minio: Number(h.tamanoMinioBytes) / 1024 / 1024,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-500/15">
            <Database className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          </span>
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400">Base de datos (Postgres)</div>
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {formatBytes(datos.actual.tamanoBdBytes)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-500/15">
            <HardDrive className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          </span>
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400">Archivos (MinIO: fotos, actas, etc.)</div>
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {formatBytes(datos.actual.tamanoMinioBytes)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Tamaño de la base de datos en el tiempo
          </h3>
          {historialGrafica.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={historialGrafica}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} opacity={0.3} />
                <XAxis dataKey="fecha" stroke={GRID_STROKE} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis stroke={GRID_STROKE} tick={{ fill: "#94a3b8", fontSize: 11 }} unit=" MB" width={60} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "none", color: "#e2e8f0" }}
                  labelStyle={{ color: "#94a3b8" }}
                  formatter={(v: number) => [`${v.toFixed(1)} MB`, "BD"]}
                />
                <Line type="monotone" dataKey="bd" stroke="#00487f" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Todavía no hay suficiente historial (se guarda una foto por día).
            </p>
          )}
        </div>

        <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Tamaño de MinIO en el tiempo
          </h3>
          {historialGrafica.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={historialGrafica}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} opacity={0.3} />
                <XAxis dataKey="fecha" stroke={GRID_STROKE} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis stroke={GRID_STROKE} tick={{ fill: "#94a3b8", fontSize: 11 }} unit=" MB" width={60} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "none", color: "#e2e8f0" }}
                  labelStyle={{ color: "#94a3b8" }}
                  formatter={(v: number) => [`${v.toFixed(1)} MB`, "MinIO"]}
                />
                <Line type="monotone" dataKey="minio" stroke="#fb923c" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Todavía no hay suficiente historial (se guarda una foto por día).
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Backups</h3>
        <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
          Genera y descarga un respaldo al vuelo. El de la base de datos es un dump comprimido (.sql.gz); el de
          MinIO es un .zip con todos los archivos subidos (fotos, actas, etc.). Puede tardar un poco según el tamaño.
        </p>
        {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => descargar("bd")}
            disabled={descargando !== null}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
          >
            {descargando === "bd" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {descargando === "bd" ? "Generando..." : "Descargar backup de la BD"}
          </button>
          <button
            onClick={() => descargar("minio")}
            disabled={descargando !== null}
            className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60 dark:border-slate-700 dark:text-brand-400 dark:hover:bg-slate-800"
          >
            {descargando === "minio" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {descargando === "minio" ? "Generando..." : "Descargar backup de MinIO"}
          </button>
        </div>
      </div>
    </div>
  );
}
