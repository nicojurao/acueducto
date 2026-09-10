import { useEffect, useState } from "react";
import { FileText, Plus, Search } from "lucide-react";
import { api, DocumentoSgc, TIPO_DOCUMENTO_SGC_LABELS, ESTADO_DOCUMENTO_SGC_LABELS, ESTADO_DOCUMENTO_SGC_COLORS } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import ListCard from "../components/ListCard";
import EmptyState from "../components/EmptyState";
import { SkeletonLista } from "../components/Skeleton";
import DocumentoSgcModal from "../components/DocumentoSgcModal";
import { inputClass } from "../lib/ui";

const PROCESOS = ["comercial", "inventario", "facturacion", "calidad", "administracion", "operativo"];

export default function DocumentosSgcPage() {
  const { usuario } = useAuth();
  const puedeEditar = Boolean(usuario?.permisos?.includes("documentos_sgc_avanzado"));

  const [documentos, setDocumentos] = useState<DocumentoSgc[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [proceso, setProceso] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("");
  const [seleccionado, setSeleccionado] = useState<DocumentoSgc | null | "nuevo">(null);

  function cargar() {
    setCargando(true);
    api.documentosSgc
      .listar({ q: q || undefined, proceso: proceso || undefined, tipo: tipo || undefined, estado: estado || undefined })
      .then(setDocumentos)
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, proceso, tipo, estado]);

  async function abrirDetalle(doc: DocumentoSgc) {
    const completo = await api.documentosSgc.obtener(doc.id);
    setSeleccionado(completo);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          <FileText className="h-5 w-5 text-brand-600 dark:text-brand-400" /> Documentos SGC
        </h1>
        {puedeEditar && (
          <button
            onClick={() => setSeleccionado("nuevo")}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-500"
          >
            <Plus className="h-4 w-4" /> Nuevo documento
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
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
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className={inputClass}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_DOCUMENTO_SGC_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {cargando && !documentos ? (
        <SkeletonLista />
      ) : !documentos || documentos.length === 0 ? (
        <EmptyState mensaje="No hay documentos SGC que coincidan con el filtro." icon={FileText} />
      ) : (
        <div className="space-y-2">
          {documentos.map((doc) => {
            const vigente = doc.versiones[0];
            return (
              <ListCard key={doc.id} onClick={() => abrirDetalle(doc)}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-xs font-mono font-semibold text-brand-700 dark:bg-slate-800 dark:text-brand-400">
                        {doc.codigo}
                      </span>
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{doc.titulo}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {TIPO_DOCUMENTO_SGC_LABELS[doc.tipo] ?? doc.tipo} · {doc.proceso.charAt(0).toUpperCase() + doc.proceso.slice(1)}
                      {vigente && ` · v${vigente.numeroVersion}`}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_DOCUMENTO_SGC_COLORS[doc.estado] ?? ""}`}>
                    {ESTADO_DOCUMENTO_SGC_LABELS[doc.estado] ?? doc.estado}
                  </span>
                </div>
              </ListCard>
            );
          })}
        </div>
      )}

      {seleccionado && (
        <DocumentoSgcModal
          documento={seleccionado === "nuevo" ? null : seleccionado}
          puedeEditar={puedeEditar}
          onClose={() => setSeleccionado(null)}
          onGuardado={() => {
            setSeleccionado(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}
