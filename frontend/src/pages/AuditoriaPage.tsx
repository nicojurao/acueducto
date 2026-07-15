import { Fragment, useEffect, useState } from "react";
import { ShieldCheck, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, MapPin, Monitor } from "lucide-react";
import { api, InicioSesion, HistorialCambio, Usuario } from "../api/client";
import { useEsMovil } from "../lib/useEsMovil";
import { inputClass } from "../lib/ui";
import EmptyState from "../components/EmptyState";
import { SkeletonTabla } from "../components/Skeleton";

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
              {c.entidad === "medidor" ? "Medidor" : "Suscriptor"}
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

export default function AuditoriaPage() {
  const esMovil = useEsMovil();
  const porPagina = esMovil ? 5 : 10;
  const [sesiones, setSesiones] = useState<InicioSesion[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuarioFiltro, setUsuarioFiltro] = useState("");
  const [expandida, setExpandida] = useState<number | null>(null);

  useEffect(() => {
    api.usuarios.list().then(setUsuarios);
  }, []);

  useEffect(() => {
    setCargando(true);
    api.auditoria
      .listPaginado(pagina, porPagina, usuarioFiltro ? Number(usuarioFiltro) : undefined)
      .then((r) => {
        setSesiones(r.data);
        setTotal(r.total);
      })
      .finally(() => setCargando(false));
  }, [pagina, porPagina, usuarioFiltro]);

  useEffect(() => setPagina(1), [usuarioFiltro]);

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <div>
      <h1 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
        <ShieldCheck className="h-5 w-5 text-brand-500" />
        Auditoría de sesiones
      </h1>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        Cada inicio de sesión, con la IP y ubicación aproximada desde donde se conectó. Haz clic en una fila para ver
        los cambios hechos en esa sesión (desde ese login hasta el siguiente del mismo usuario).
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
      </div>

      {cargando ? (
        <SkeletonTabla columnas={5} />
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
                <th className="w-8 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sesiones.map((s) => (
                <Fragment key={s.id}>
                  <tr
                    onClick={() => setExpandida(expandida === s.id ? null : s.id)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-700 dark:text-slate-400">
                      {fmtFechaHora(s.fecha)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                      {s.usuario?.nombre ?? "Usuario eliminado"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-400">{s.ip ?? "-"}</td>
                    <td className="hidden px-4 py-2.5 text-slate-700 dark:text-slate-400 md:table-cell">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        {ubicacion(s)}
                      </span>
                    </td>
                    <td className="hidden px-4 py-2.5 text-slate-700 dark:text-slate-400 md:table-cell">
                      <span className="flex items-center gap-1">
                        <Monitor className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        {s.dispositivo ?? "-"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">
                      {expandida === s.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </td>
                  </tr>
                  {expandida === s.id && (
                    <tr key={`${s.id}-cambios`}>
                      <td colSpan={6} className="bg-slate-50 p-0 dark:bg-slate-800/30">
                        <CambiosDeSesion sesionId={s.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && total > 0 && (
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
      )}
    </div>
  );
}
