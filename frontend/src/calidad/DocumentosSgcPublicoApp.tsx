import { useEffect, useState } from "react";
import { Sun, Moon, FileText, Download, Search } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { documentosSgcPublicoApi, DocumentoSgcPublico, TIPO_DOCUMENTO_SGC_LABELS, API_URL } from "../api/client";
import { SkeletonLista } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { inputClass } from "../lib/ui";
import { useEmpresa, urlLogoEmpresa } from "../lib/empresaRuntime";

const PROCESOS = ["comercial", "inventario", "facturacion", "calidad", "administracion", "operativo"];

// Sitio público de documentos SGC: solo consulta de los documentos vigentes, sin sesión — mismo
// mecanismo de enrutado por hostname que el sitio de PQRS (ver App.tsx).
export default function DocumentosSgcPublicoApp() {
  const { dark, toggle } = useTheme();
  const empresa = useEmpresa();
  const [documentos, setDocumentos] = useState<DocumentoSgcPublico[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [proceso, setProceso] = useState("");
  const [tipo, setTipo] = useState("");

  useEffect(() => {
    document.title = `Documentos SGC · ${empresa.nombre}`;
  }, [empresa.nombre]);

  useEffect(() => {
    setCargando(true);
    const t = setTimeout(() => {
      documentosSgcPublicoApi
        .listar({ q: q || undefined, proceso: proceso || undefined, tipo: tipo || undefined })
        .then(setDocumentos)
        .finally(() => setCargando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, proceso, tipo]);

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950">
      <header className="flex items-center justify-between gap-3 bg-gradient-to-r from-brand-700 to-brand-900 px-4 py-3 text-white sm:px-6">
        <div className="flex items-center gap-2.5">
          {urlLogoEmpresa() && (
            <img src={urlLogoEmpresa()} alt={`Logo ${empresa.nombreCorto}`} className="h-9 w-9 shrink-0 object-contain" />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold leading-tight">{empresa.nombre}</div>
            <div className="text-[11px] text-brand-100">Documentos del Sistema de Gestión de Calidad</div>
          </div>
        </div>
        <button onClick={toggle} title={dark ? "Modo claro" : "Modo oscuro"} className="shrink-0 rounded-lg p-2 text-white hover:bg-white/10">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código o título..." className={`${inputClass} w-full pl-9`} />
          </div>
          <select value={proceso} onChange={(e) => setProceso(e.target.value)} className={inputClass}>
            <option value="">Todos los procesos</option>
            {PROCESOS.map((p) => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputClass}>
            <option value="">Todos los tipos</option>
            {Object.entries(TIPO_DOCUMENTO_SGC_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {cargando && !documentos ? (
          <SkeletonLista />
        ) : !documentos || documentos.length === 0 ? (
          <EmptyState mensaje="No hay documentos que coincidan con el filtro." icon={FileText} />
        ) : (
          <div className="space-y-2">
            {documentos.map((doc) => {
              const v = doc.versiones[0];
              return (
                <a
                  key={doc.id}
                  href={`${API_URL}/api/publico/documentos-sgc/${doc.id}/descargar`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-brand-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-xs font-mono font-semibold text-brand-700 dark:bg-slate-800 dark:text-brand-400">
                        {doc.codigo}
                      </span>
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{doc.titulo}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {TIPO_DOCUMENTO_SGC_LABELS[doc.tipo] ?? doc.tipo} · {doc.proceso.charAt(0).toUpperCase() + doc.proceso.slice(1)}
                      {v && ` · v${v.numeroVersion} · vigente desde ${new Date(v.fechaVigencia).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Download className="h-4.5 w-4.5 shrink-0 text-brand-600 dark:text-brand-400" />
                </a>
              );
            })}
          </div>
        )}
      </main>

      <footer className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-500">
        © {new Date().getFullYear()} {empresa.nombre}
      </footer>
    </div>
  );
}
