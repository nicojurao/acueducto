import { useState } from "react";

function ConfirmModal({
  mensaje,
  textoConfirmar,
  variante,
  saliendo,
  onConfirmar,
  onCancelar,
}: {
  mensaje: string;
  textoConfirmar: string;
  variante: "peligro" | "normal";
  saliendo: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div className={`fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 ${saliendo ? "animate-fade-out" : "animate-fade-in"}`}>
      <div className={`w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900 ${saliendo ? "animate-scale-out" : "animate-scale-in"}`}>
        <p className="mb-4 text-sm text-slate-700 dark:text-slate-200">{mensaje}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancelar}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
              variante === "peligro" ? "bg-red-600 hover:bg-red-500" : "bg-brand-600 hover:bg-brand-500"
            }`}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [pendiente, setPendiente] = useState<{
    mensaje: string;
    accion: () => void;
    textoConfirmar: string;
    variante: "peligro" | "normal";
  } | null>(null);
  const [saliendo, setSaliendo] = useState(false);

  function pedirConfirmacion(
    mensaje: string,
    accion: () => void,
    opciones?: { textoConfirmar?: string; variante?: "peligro" | "normal" }
  ) {
    setSaliendo(false);
    setPendiente({
      mensaje,
      accion,
      textoConfirmar: opciones?.textoConfirmar ?? "Eliminar",
      variante: opciones?.variante ?? "peligro",
    });
  }

  // Cierra con la misma animación de salida que el resto de los modales (ver
  // frontend/src/lib/useCierreAnimado.ts) — inline acá en vez de reusar el hook porque este
  // "cerrar" además decide si dispara la acción confirmada antes de desmontar.
  function cerrarConAnimacion(disparar: boolean) {
    setSaliendo(true);
    setTimeout(() => {
      if (disparar) pendiente?.accion();
      setPendiente(null);
      setSaliendo(false);
    }, 150);
  }

  const modal = pendiente ? (
    <ConfirmModal
      mensaje={pendiente.mensaje}
      textoConfirmar={pendiente.textoConfirmar}
      variante={pendiente.variante}
      saliendo={saliendo}
      onCancelar={() => cerrarConAnimacion(false)}
      onConfirmar={() => cerrarConAnimacion(true)}
    />
  ) : null;
  return { pedirConfirmacion, modal };
}

export function useErrorHandler() {
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>) {
    try {
      setError(null);
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error \d+: /, "") : "Error inesperado");
    }
  }
  function limpiar() {
    setError(null);
  }
  return { error, run, limpiar };
}
