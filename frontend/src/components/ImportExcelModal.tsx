import { useRef, useState } from "react";
import { Download, AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { useCierreAnimado } from "../lib/useCierreAnimado";

type ResultadoValidar =
  | { ok: true; totalFilas: number; filasConProblemas: 0 }
  | { ok: false; totalFilas: number; filasConProblemas: number; reporteBase64: string };

type ResultadoImport = { creados: number; actualizados: number; omitidos: number; reporteBase64: string };

type Paso =
  | { tipo: "seleccion" }
  | { tipo: "validando" }
  | { tipo: "problemas"; totalFilas: number; filasConProblemas: number; reporteBase64: string }
  | { tipo: "confirmar"; totalFilas: number }
  | { tipo: "importando" }
  | ({ tipo: "resultado" } & ResultadoImport)
  | { tipo: "error"; mensaje: string };

// Modal genérico de importación Excel (validar → confirmar → importar → resultado), bloqueante:
// mientras se valida o se importa no se puede cerrar (ni con click afuera), para que quede claro
// en todo momento si el archivo ya se subió o no. Parametrizado por módulo (suscriptores,
// medidores, ...) vía las funciones que se le pasan.
export default function ImportExcelModal({
  titulo,
  descripcion,
  nombreReporte,
  onExportarPlantilla,
  onValidar,
  onImportar,
  onCerrar,
  onImportado,
}: {
  titulo: string;
  descripcion: string;
  nombreReporte: string;
  onExportarPlantilla?: () => void;
  onValidar: (file: File) => Promise<ResultadoValidar>;
  onImportar: (file: File) => Promise<ResultadoImport>;
  onCerrar: () => void;
  onImportado: () => void;
}) {
  const [paso, setPaso] = useState<Paso>({ tipo: "seleccion" });
  const [archivo, setArchivo] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bloqueado = paso.tipo === "validando" || paso.tipo === "importando";
  const { saliendo, cerrar } = useCierreAnimado(onCerrar);

  function seleccionarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivo(file);
    validar(file);
  }

  async function validar(file: File) {
    setPaso({ tipo: "validando" });
    try {
      const resultado = await onValidar(file);
      if (resultado.ok) {
        setPaso({ tipo: "confirmar", totalFilas: resultado.totalFilas });
      } else {
        setPaso({
          tipo: "problemas",
          totalFilas: resultado.totalFilas,
          filasConProblemas: resultado.filasConProblemas,
          reporteBase64: resultado.reporteBase64,
        });
      }
    } catch (err) {
      setPaso({ tipo: "error", mensaje: err instanceof Error ? err.message.replace(/^Error \d+: /, "") : "Error inesperado" });
    }
  }

  async function confirmarImportacion() {
    if (!archivo) return;
    setPaso({ tipo: "importando" });
    try {
      const resultado = await onImportar(archivo);
      setPaso({ tipo: "resultado", ...resultado });
      onImportado();
    } catch (err) {
      setPaso({ tipo: "error", mensaje: err instanceof Error ? err.message.replace(/^Error \d+: /, "") : "Error inesperado" });
    }
  }

  function descargarReporte(reporteBase64: string) {
    const bytes = Uint8Array.from(atob(reporteBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreReporte;
    a.click();
    URL.revokeObjectURL(url);
  }

  function reintentar() {
    setArchivo(null);
    setPaso({ tipo: "seleccion" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div
      className={`fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 ${saliendo ? "animate-fade-out" : "animate-fade-in"}`}
      onClick={() => !bloqueado && cerrar()}
    >
      <div
        className={`w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900 ${saliendo ? "animate-scale-out" : "animate-scale-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{titulo}</h2>
          {!bloqueado && (
            <button onClick={cerrar} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {paso.tipo === "seleccion" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-400">{descripcion}</p>
            {onExportarPlantilla && (
              <button
                type="button"
                onClick={onExportarPlantilla}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Download className="h-4 w-4" />
                Descargar plantilla con datos actuales
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={seleccionarArchivo}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-500 dark:text-slate-300"
            />
          </div>
        )}

        {paso.tipo === "validando" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            <p className="text-sm text-slate-700 dark:text-slate-400">Validando archivo, un momento...</p>
          </div>
        )}

        {paso.tipo === "problemas" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {paso.filasConProblemas} de {paso.totalFilas} filas tienen problemas. No se importó nada todavía.
              </span>
            </div>
            <button
              onClick={() => descargarReporte(paso.reporteBase64)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Download className="h-4 w-4" />
              Descargar Excel con observaciones
            </button>
            <p className="text-xs text-slate-700 dark:text-slate-400">
              Corrige las filas marcadas en la columna OBSERVACIONES y vuelve a subir el archivo.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={reintentar}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
              >
                Subir otro archivo
              </button>
            </div>
          </div>
        )}

        {paso.tipo === "confirmar" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-400">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>El archivo pasó la validación: {paso.totalFilas} filas listas para importar.</span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-400">¿Confirmas que quieres importar este archivo?</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={reintentar}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Elegir otro archivo
              </button>
              <button
                onClick={confirmarImportacion}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
              >
                Confirmar e importar
              </button>
            </div>
          </div>
        )}

        {paso.tipo === "importando" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            <p className="text-sm text-slate-700 dark:text-slate-400">Importando, no cierres esta ventana...</p>
          </div>
        )}

        {paso.tipo === "resultado" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-400">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Importación terminada: {paso.creados} creados, {paso.actualizados} actualizados, {paso.omitidos}{" "}
                omitidos.
              </span>
            </div>
            <button
              onClick={() => descargarReporte(paso.reporteBase64)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Download className="h-4 w-4" />
              Descargar reporte (con observación fila por fila)
            </button>
            <div className="flex justify-end">
              <button
                onClick={cerrar}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {paso.tipo === "error" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{paso.mensaje}</span>
            </div>
            <div className="flex justify-end">
              <button
                onClick={reintentar}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
              >
                Intentar de nuevo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
