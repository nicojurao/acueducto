import { Fragment, useEffect, useState } from "react";
import { ShieldCheck, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, MapPin, Monitor, AlertTriangle, XCircle, Download, LogOut } from "lucide-react";
import { api, InicioSesion, HistorialCambio, IntentoLoginFallido, Usuario } from "../api/client";
import { useEsMovil } from "../lib/useEsMovil";
import { inputClass } from "../lib/ui";
import EmptyState from "../components/EmptyState";
import { SkeletonTabla } from "../components/Skeleton";
import { useAuth } from "../contexts/AuthContext";
import { useConfirm } from "../components/ConfirmModal";

function fmtFechaHora(fecha: string): string {
  return new Date(fecha).toLocaleString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ubicacion(s: InicioSesion): string {
  const partes = [s.ciudad, s.region, s.pais].filter(Boolean);
  return partes.length > 0 ? partes.join(", ") : "-";
}

const MOTIVO_LABELS: Record<string, string> = {
  usuario_no_existe: "Usuario/cédula inexistente",
  contrasena_incorrecta: "Contraseña incorrecta",
  cuenta_inactiva: "Cuenta inactiva",
};

function CambiosDeSesion({ sesionId }: { sesionId: number }) {
  const [cambios, setCambios] = useState<HistorialCambio[] | null>(null);

  useEffect(() => {
    api.auditoria.cambios(sesionId).then(setCambios);
  }, [sesionId]);

  if (cambios === null) return <p className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">Cargando...</p>;
  if (cambios.length === 0)
    return (
      <p className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
        No se registraron cambios en esta sesión.
      </p>
    );

  return (
    <div className="divide-y divide-slate-100 px-4 py-2 dark:divide-slate-800">
      {cambios.map((c) => (
        <div key={c.id} className="py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {c.entidad === "medidor" ? "Medidor" : c.entidad === "usuario" ? "Usuario" : "Suscriptor"}
            </span>
            <span className="font-medium text-slate-800 dark:text-slate-100">{c.entidadNombre}</span>
            <span className="text-slate-500 dark:text-slate-500">{fmtFechaHora(c.fecha)}</span>
          </div>
          <div className="mt-0.5 text-slate-600 dark:text-slate-400">
            <strong>{c.campo}</strong>: {c.valorAnterior ?? <em>(vacío)</em>} {" → "} {c.valorNuevo ?? <em>(vacío)</em>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Paginacion({
  total,
  pagina,
  totalPaginas,
  setPagina,
}: {
  total: number;
  pagina: number;
  totalPaginas: number;
  setPagina: (fn: (p: number) => number) => void;
}) {
  if (total === 0) return null;
  return (
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
  );
}

function SesionesTab() {
  const esMovil = useEsMovil();
  const porPagina = esMovil ? 5 : 10;
  const { usuario } = useAuth();
  const { pedirConfirmacion, modal: modalConfirmacion } = useConfirm();
  const [sesiones, setSesiones] = useState<InicioSesion[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuarioFiltro, setUsuarioFiltro] = useState("");
  const [soloActivas, setSoloActivas] = useState(false);
  const [expandida, setExpandida] = useState<number | null>(null);

  useEffect(() => {
    api.usuarios.list().then(setUsuarios);
  }, []);

  function cargar() {
    setCargando(true);
    api.auditoria
      .listPaginado(pagina, porPagina, {
        usuarioId: usuarioFiltro ? Number(usuarioFiltro) : undefined,
        soloActivas,
      })
      .then((r) => {
        setSesiones(r.data);
        setTotal(r.total);
      })
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [pagina, porPagina, usuarioFiltro, soloActivas]);

  useEffect(() => setPagina(1), [usuarioFiltro, soloActivas]);

  function revocar(s: InicioSesion) {
    pedirConfirmacion(
      `¿Cerrar la sesión de ${s.usuario?.nombre ?? "este usuario"} iniciada el ${fmtFechaHora(s.fecha)}? La próxima vez que use la app desde ese dispositivo, le va a pedir volver a loguearse.`,
      async () => {
        await api.auditoria.revocar(s.id);
        cargar();
      }
    );
  }

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <div>
      {modalConfirmacion}
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        Cada inicio de sesión, con la IP y ubicación aproximada desde donde se conectó. Haz clic en una fila para ver
        los cambios hechos en esa sesión (desde ese login hasta el siguiente del mismo usuario).{" "}
        <AlertTriangle className="inline h-3.5 w-3.5 text-amber-500" /> marca un login desde una IP o dispositivo que
        ese usuario nunca había usado antes. La fila marcada "Tú" es la sesión con la que estás conectado ahora mismo.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={usuarioFiltro} onChange={(e) => setUsuarioFiltro(e.target.value)} className={inputClass}>
          <option value="">Todos los usuarios</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={soloActivas}
            onChange={(e) => setSoloActivas(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-700"
          />
          Solo sesiones activas (token aún vigente)
        </label>
      </div>

      {cargando ? (
        <SkeletonTabla columnas={9} />
      ) : sesiones.length === 0 ? (
        <EmptyState mensaje="No hay inicios de sesión registrados con estos filtros." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-brand-100 bg-brand-50 text-xs uppercase text-brand-800 dark:border-slate-800 dark:bg-transparent dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Fecha</th>
                <th className="px-4 py-2.5">Usuario</th>
                <th className="px-4 py-2.5">IP</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Ubicación</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Dispositivo</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Estado</th>
                <th className="px-4 py-2.5" />
                <th className="w-8 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sesiones.map((s) => {
                const esMiSesion = !!usuario?.sesionId && s.jti === usuario.sesionId;
                return (
                <Fragment key={s.id}>
                  <tr
                    onClick={() => setExpandida(expandida === s.id ? null : s.id)}
                    className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 ${esMiSesion ? "bg-brand-50/50 dark:bg-brand-500/5" : ""}`}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-700 dark:text-slate-400">
                      {fmtFechaHora(s.fecha)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                      {s.usuario?.nombre ?? "Usuario eliminado"}
                      {esMiSesion && (
                        <span className="ml-2 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-400">
                          Tú
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        {s.ipNueva && (
                          <span title="IP nueva para este usuario">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          </span>
                        )}
                        {s.ip ?? "-"}
                      </span>
                    </td>
                    <td className="hidden px-4 py-2.5 text-slate-700 dark:text-slate-400 md:table-cell">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        {ubicacion(s)}
                      </span>
                    </td>
                    <td className="hidden px-4 py-2.5 text-slate-700 dark:text-slate-400 md:table-cell">
                      <span className="flex items-center gap-1">
                        {s.dispositivoNuevo && (
                          <span title="Dispositivo nuevo para este usuario">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          </span>
                        )}
                        <Monitor className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        {s.dispositivo ?? "-"}
                      </span>
                    </td>
                    <td className="hidden px-4 py-2.5 md:table-cell">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.revocada
                            ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
                            : s.activa
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {s.revocada ? "Cerrada" : s.activa ? "Activa" : "Expirada"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {s.activa && !esMiSesion && (
                        <button
                          onClick={() => revocar(s)}
                          title="Cerrar esta sesión"
                          className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-red-600 dark:text-slate-400"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          Cerrar
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">
                      {expandida === s.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </td>
                  </tr>
                  {expandida === s.id && (
                    <tr key={`${s.id}-cambios`}>
                      <td colSpan={9} className="bg-slate-50 p-0 dark:bg-slate-800/30">
                        <CambiosDeSesion sesionId={s.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && <Paginacion total={total} pagina={pagina} totalPaginas={totalPaginas} setPagina={setPagina} />}
    </div>
  );
}

function FallidosTab() {
  const esMovil = useEsMovil();
  const porPagina = esMovil ? 5 : 10;
  const [intentos, setIntentos] = useState<IntentoLoginFallido[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [identificadorFiltro, setIdentificadorFiltro] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(identificadorFiltro.trim()), 300);
    return () => clearTimeout(t);
  }, [identificadorFiltro]);

  useEffect(() => {
    setCargando(true);
    api.auditoria
      .fallidosPaginado(pagina, porPagina, debounced || undefined)
      .then((r) => {
        setIntentos(r.data);
        setTotal(r.total);
      })
      .finally(() => setCargando(false));
  }, [pagina, porPagina, debounced]);

  useEffect(() => setPagina(1), [debounced]);

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        Intentos de inicio de sesión que fallaron: cédula/usuario inexistente, contraseña incorrecta o cuenta
        inactiva. Útil para detectar intentos de acceso no autorizado.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          placeholder="Filtrar por cédula/usuario intentado..."
          value={identificadorFiltro}
          onChange={(e) => setIdentificadorFiltro(e.target.value)}
          className={`${inputClass} w-full max-w-xs`}
        />
      </div>

      {cargando ? (
        <SkeletonTabla columnas={4} />
      ) : intentos.length === 0 ? (
        <EmptyState mensaje="No hay intentos fallidos registrados con estos filtros." icon={XCircle} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-brand-100 bg-brand-50 text-xs uppercase text-brand-800 dark:border-slate-800 dark:bg-transparent dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Fecha</th>
                <th className="px-4 py-2.5">Intentó entrar como</th>
                <th className="px-4 py-2.5">Motivo</th>
                <th className="px-4 py-2.5">IP</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Dispositivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {intentos.map((i) => (
                <tr key={i.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-700 dark:text-slate-400">{fmtFechaHora(i.fecha)}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{i.identificador}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
                      {MOTIVO_LABELS[i.motivo] ?? i.motivo}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-400">{i.ip ?? "-"}</td>
                  <td className="hidden px-4 py-2.5 text-slate-700 dark:text-slate-400 md:table-cell">
                    {i.dispositivo ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && <Paginacion total={total} pagina={pagina} totalPaginas={totalPaginas} setPagina={setPagina} />}
    </div>
  );
}

const TABS = [
  { id: "sesiones", label: "Inicios de sesión" },
  { id: "fallidos", label: "Intentos fallidos" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function AuditoriaPage() {
  const [tab, setTab] = useState<TabId>("sesiones");

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <ShieldCheck className="h-5 w-5 text-brand-500" />
          Auditoría de sesiones
        </h1>
        <button
          onClick={() => api.auditoria.export()}
          className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Download className="h-4 w-4" />
          Exportar a Excel
        </button>
      </div>

      <div className="mb-4 flex gap-2 border-b border-slate-200 dark:border-slate-800">
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

      {tab === "sesiones" && <SesionesTab />}
      {tab === "fallidos" && <FallidosTab />}
    </div>
  );
}
