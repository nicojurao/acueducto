import { useState } from "react";
import { X, Upload, FileText, Download, Trash2 } from "lucide-react";
import { api, DocumentoSgc, TIPO_DOCUMENTO_SGC_LABELS, ESTADO_DOCUMENTO_SGC_LABELS } from "../api/client";
import { useConfirm, useErrorHandler } from "./ConfirmModal";
import { useCierreAnimado } from "../lib/useCierreAnimado";
import { inputClass } from "../lib/ui";

const PROCESOS = ["comercial", "inventario", "facturacion", "calidad", "administracion", "operativo"];

function labelProceso(p: string) {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export default function DocumentoSgcModal({
  documento,
  puedeEditar,
  onClose,
  onGuardado,
}: {
  documento: DocumentoSgc | null; // null = crear uno nuevo
  puedeEditar: boolean;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const { saliendo, cerrar } = useCierreAnimado(onClose);
  const { error, run } = useErrorHandler();
  const { pedirConfirmacion, modal: modalConfirmacion } = useConfirm();
  const [guardando, setGuardando] = useState(false);
  const [tab, setTab] = useState<"ficha" | "version">("ficha");

  const [codigo, setCodigo] = useState(documento?.codigo ?? "");
  const [titulo, setTitulo] = useState(documento?.titulo ?? "");
  const [tipo, setTipo] = useState(documento?.tipo ?? "procedimiento");
  const [proceso, setProceso] = useState(documento?.proceso ?? "calidad");
  const [estado, setEstado] = useState(documento?.estado ?? "vigente");

  const [archivo, setArchivo] = useState<File | null>(null);
  const [fechaVigencia, setFechaVigencia] = useState(new Date().toISOString().slice(0, 10));
  const [descripcionCambio, setDescripcionCambio] = useState("");
  const [elaboroPor, setElaboroPor] = useState("");
  const [revisoPor, setRevisoPor] = useState("");
  const [aproboPor, setAproboPor] = useState("");

  async function guardarFicha() {
    await run(async () => {
      setGuardando(true);
      try {
        if (documento) {
          await api.documentosSgc.actualizar(documento.id, { titulo, tipo, proceso, estado });
        }
        onGuardado();
      } finally {
        setGuardando(false);
      }
    });
  }

  async function crearDocumento() {
    if (!archivo) return;
    await run(async () => {
      setGuardando(true);
      try {
        await api.documentosSgc.crear({
          codigo,
          titulo,
          tipo,
          proceso,
          archivo,
          fechaVigencia,
          descripcionCambio,
          elaboroPor,
          revisoPor,
          aproboPor,
        });
        onGuardado();
      } finally {
        setGuardando(false);
      }
    });
  }

  async function subirVersion() {
    if (!documento || !archivo) return;
    await run(async () => {
      setGuardando(true);
      try {
        await api.documentosSgc.subirVersion(documento.id, {
          archivo,
          fechaVigencia,
          descripcionCambio,
          elaboroPor,
          revisoPor,
          aproboPor,
        });
        onGuardado();
      } finally {
        setGuardando(false);
      }
    });
  }

  async function eliminarDocumento() {
    if (!documento) return;
    pedirConfirmacion(
      `¿Eliminar el documento ${documento.codigo}? Deja de verse en el listado y en el sitio público, pero el historial de versiones se conserva.`,
      async () => {
        await run(async () => {
          await api.documentosSgc.eliminar(documento.id);
          onGuardado();
        });
      },
      { textoConfirmar: "Eliminar", textoExito: "Documento eliminado", variante: "peligro" }
    );
  }

  const esNuevo = !documento;
  const versionVigente = documento?.versiones.find((v) => v.vigente);
  const historico = documento?.versiones.filter((v) => !v.vigente) ?? [];

  return (
    <div className={`fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 ${saliendo ? "animate-fade-out" : "animate-fade-in"}`}>
      <div className={`flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl dark:bg-slate-900 ${saliendo ? "animate-scale-out" : "animate-scale-in"}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {esNuevo ? "Nuevo documento SGC" : `${documento!.codigo} · v${versionVigente?.numeroVersion ?? "—"}`}
          </h2>
          <button onClick={cerrar} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {!esNuevo && (
          <div className="flex shrink-0 gap-1 border-b border-slate-200 px-5 pt-2 dark:border-slate-800">
            {(["ficha", "version"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-t-lg px-3 py-2 text-xs font-medium ${
                  tab === t
                    ? "border-b-2 border-brand-600 text-brand-700 dark:text-brand-400"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                }`}
              >
                {t === "ficha" ? "Ficha e historial" : "Subir nueva versión"}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">{error}</p>}

          {(esNuevo || tab === "ficha") && (
            <div className="space-y-3">
              {esNuevo && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Código</span>
                  <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="P-OP-008" className={`${inputClass} w-full`} disabled={!puedeEditar} />
                </label>
              )}
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Título</span>
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={`${inputClass} w-full`} disabled={!puedeEditar} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Tipo</span>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={`${inputClass} w-full`} disabled={!puedeEditar}>
                    {Object.entries(TIPO_DOCUMENTO_SGC_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Proceso</span>
                  <select value={proceso} onChange={(e) => setProceso(e.target.value)} className={`${inputClass} w-full`} disabled={!puedeEditar}>
                    {PROCESOS.map((p) => (
                      <option key={p} value={p}>{labelProceso(p)}</option>
                    ))}
                  </select>
                </label>
              </div>
              {!esNuevo && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Estado</span>
                  <select value={estado} onChange={(e) => setEstado(e.target.value)} className={`${inputClass} w-full`} disabled={!puedeEditar}>
                    {Object.entries(ESTADO_DOCUMENTO_SGC_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </label>
              )}

              {esNuevo && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Archivo</span>
                  <input type="file" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className={`${inputClass} w-full`} />
                </label>
              )}

              {!esNuevo && versionVigente && (
                <button
                  onClick={() => api.documentosSgc.descargarVersion(versionVigente.id, `${documento!.codigo}-v${versionVigente.numeroVersion}`)}
                  className="flex w-full items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100 dark:border-slate-700 dark:bg-slate-800 dark:text-brand-400"
                >
                  <FileText className="h-4 w-4" /> Descargar archivo vigente (v{versionVigente.numeroVersion})
                </button>
              )}

              {!esNuevo && historico.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Historial de versiones</p>
                  <ul className="space-y-1.5">
                    {historico.map((v) => (
                      <li key={v.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-800">
                        <div>
                          <span className="font-medium text-slate-700 dark:text-slate-300">v{v.numeroVersion}</span>
                          <span className="ml-2 text-slate-500 dark:text-slate-400">{new Date(v.fechaVigencia).toLocaleDateString()}</span>
                          {v.descripcionCambio && <p className="mt-0.5 text-slate-500 dark:text-slate-400">{v.descripcionCambio}</p>}
                        </div>
                        <button
                          onClick={() => api.documentosSgc.descargarVersion(v.id, `${documento!.codigo}-v${v.numeroVersion}`)}
                          className="shrink-0 text-brand-600 hover:text-brand-700 dark:text-brand-400"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {esNuevo || tab === "version" ? (
            (!esNuevo ? tab === "version" : true) && (
              <div className={esNuevo ? "space-y-3" : "space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800"}>
                {!esNuevo && (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Archivo nuevo</span>
                    <input type="file" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className={`${inputClass} w-full`} />
                  </label>
                )}
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Fecha de vigencia</span>
                  <input type="date" value={fechaVigencia} onChange={(e) => setFechaVigencia(e.target.value)} className={`${inputClass} w-full`} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Descripción del cambio</span>
                  <textarea value={descripcionCambio} onChange={(e) => setDescripcionCambio(e.target.value)} rows={2} className={`${inputClass} w-full`} />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Elaboró</span>
                    <input value={elaboroPor} onChange={(e) => setElaboroPor(e.target.value)} className={`${inputClass} w-full`} />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Revisó</span>
                    <input value={revisoPor} onChange={(e) => setRevisoPor(e.target.value)} className={`${inputClass} w-full`} />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Aprobó</span>
                    <input value={aproboPor} onChange={(e) => setAproboPor(e.target.value)} className={`${inputClass} w-full`} />
                  </label>
                </div>
              </div>
            )
          ) : null}
        </div>

        {puedeEditar && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
            {!esNuevo ? (
              <button
                onClick={eliminarDocumento}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" /> Eliminar
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
            <button onClick={cerrar} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              Cancelar
            </button>
            {esNuevo ? (
              <button
                onClick={crearDocumento}
                disabled={guardando || !codigo.trim() || !titulo.trim() || !archivo}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
              >
                <Upload className="h-4 w-4" /> {guardando ? "Guardando..." : "Crear documento"}
              </button>
            ) : tab === "ficha" ? (
              <button onClick={guardarFicha} disabled={guardando} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60">
                {guardando ? "Guardando..." : "Guardar cambios"}
              </button>
            ) : (
              <button
                onClick={subirVersion}
                disabled={guardando || !archivo}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
              >
                <Upload className="h-4 w-4" /> {guardando ? "Subiendo..." : "Subir versión"}
              </button>
            )}
            </div>
          </div>
        )}
      </div>
      {modalConfirmacion}
    </div>
  );
}
