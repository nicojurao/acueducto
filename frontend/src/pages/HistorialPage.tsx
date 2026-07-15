import { useEffect, useState } from "react";
import { History, ChevronLeft, ChevronRight } from "lucide-react";
import { api, HistorialCambio, Usuario } from "../api/client";
import { useEsMovil } from "../lib/useEsMovil";
import { inputClass } from "../lib/ui";
import EmptyState from "../components/EmptyState";

function fmtFechaHora(fecha: string): string {
  return new Date(fecha).toLocaleString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistorialPage() {
  const esMovil = useEsMovil();
  const porPagina = esMovil ? 5 : 10;
  const [cambios, setCambios] = useState<HistorialCambio[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);

  const [entidadFiltro, setEntidadFiltro] = useState("");
  const [usuarioFiltro, setUsuarioFiltro] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [campoFiltro, setCampoFiltro] = useState("");
  const [campoDebounced, setCampoDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setCampoDebounced(campoFiltro.trim()), 300);
    return () => clearTimeout(t);
  }, [campoFiltro]);

  useEffect(() => {
    api.usuarios.list().then(setUsuarios);
  }, []);

  useEffect(() => {
    setCargando(true);
    api.historial
      .listPaginado(pagina, porPagina, {
        entidad: entidadFiltro || undefined,
        usuarioId: usuarioFiltro ? Number(usuarioFiltro) : undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
        campo: campoDebounced || undefined,
      })
      .then((r) => {
        setCambios(r.data);
        setTotal(r.total);
      })
      .finally(() => setCargando(false));
  }, [pagina, porPagina, entidadFiltro, usuarioFiltro, desde, hasta, campoDebounced]);

  useEffect(() => setPagina(1), [entidadFiltro, usuarioFiltro, desde, hasta, campoDebounced]);

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <div>
      <h1 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
        <History className="h-5 w-5 text-brand-500" />
        Historial de cambios
      </h1>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={entidadFiltro} onChange={(e) => setEntidadFiltro(e.target.value)} className={inputClass}>
          <option value="">Todos los registros</option>
          <option value="medidor">Medidores</option>
          <option value="suscriptor">Suscriptores</option>
        </select>
        <select value={usuarioFiltro} onChange={(e) => setUsuarioFiltro(e.target.value)} className={inputClass}>
          <option value="">Todos los usuarios</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputClass} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputClass} />
        </label>
        <input
          placeholder="Filtrar por campo (ej. Serial, Estrato...)"
          value={campoFiltro}
          onChange={(e) => setCampoFiltro(e.target.value)}
          className={`${inputClass} w-full max-w-xs`}
        />
      </div>

      {cargando ? (
        <p className="text-slate-700 dark:text-slate-400">Cargando...</p>
      ) : cambios.length === 0 ? (
        <EmptyState mensaje="No hay cambios registrados con estos filtros." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-brand-100 bg-brand-50 text-xs uppercase text-brand-800 dark:border-slate-800 dark:bg-transparent dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Fecha</th>
                <th className="px-4 py-2.5">Registro</th>
                <th className="px-4 py-2.5">Campo</th>
                <th className="px-4 py-2.5">Cambio</th>
                <th className="px-4 py-2.5">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {cambios.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-700 dark:text-slate-400">{fmtFechaHora(c.fecha)}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {c.entidad === "medidor" ? "Medidor" : "Suscriptor"}
                    </span>{" "}
                    <span className="font-medium text-slate-800 dark:text-slate-100">{c.entidadNombre}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-400">{c.campo}</td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-400">
                    {c.valorAnterior ?? <em className="text-slate-500">(vacío)</em>}
                    {" → "}
                    {c.valorNuevo ?? <em className="text-slate-500">(vacío)</em>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-400">{c.usuario?.nombre ?? "Usuario eliminado"}</td>
                </tr>
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
