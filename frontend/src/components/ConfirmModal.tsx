import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

type Estado = "confirmando" | "procesando" | "exito";

function ConfirmModal({
  mensaje,
  textoConfirmar,
  textoExito,
  variante,
  estado,
  saliendo,
  onConfirmar,
  onCancelar,
}: {
  mensaje: string;
  textoConfirmar: string;
  textoExito: string;
  variante: "peligro" | "normal";
  estado: Estado;
  saliendo: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div className={`fixed inset-0 z-[2200] flex items-center justify-center bg-black/50 p-4 ${saliendo ? "animate-fade-out" : "animate-fade-in"}`}>
      <div className={`w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900 ${saliendo ? "animate-scale-out" : "animate-scale-in"}`}>
        {estado === "exito" ? (
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            {textoExito}
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-700 dark:text-slate-200">{mensaje}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={onCancelar}
                disabled={estado === "procesando"}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirmar}
                disabled={estado === "procesando"}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                  variante === "peligro" ? "bg-red-600 hover:bg-red-500" : "bg-brand-600 hover:bg-brand-500"
                }`}
              >
                {estado === "procesando" ? "Un momento..." : textoConfirmar}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function useConfirm() {
  const [pendiente, setPendiente] = useState<{
    mensaje: string;
    accion: () => void | Promise<void>;
    textoConfirmar: string;
    textoExito: string;
    variante: "peligro" | "normal";
  } | null>(null);
  const [estado, setEstado] = useState<Estado>("confirmando");
  const [saliendo, setSaliendo] = useState(false);

  function pedirConfirmacion(
    mensaje: string,
    accion: () => void | Promise<void>,
    opciones?: { textoConfirmar?: string; textoExito?: string; variante?: "peligro" | "normal" }
  ) {
    const variante = opciones?.variante ?? "peligro";
    setEstado("confirmando");
    setSaliendo(false);
    setPendiente({
      mensaje,
      accion,
      textoConfirmar: opciones?.textoConfirmar ?? "Eliminar",
      textoExito: opciones?.textoExito ?? (variante === "peligro" ? "Eliminado correctamente" : "Guardado correctamente"),
      variante,
    });
  }

  // Cierra con la misma animación de salida que el resto de los modales (ver
  // frontend/src/lib/useCierreAnimado.ts) — inline acá en vez de reusar el hook porque el cierre
  // acá pasa primero por "procesando" y "exito" antes del fade-out.
  function desmontar() {
    setSaliendo(true);
    setTimeout(() => {
      setPendiente(null);
      setSaliendo(false);
    }, 150);
  }

  function cancelar() {
    desmontar();
  }

  async function confirmar() {
    if (!pendiente) return;
    setEstado("procesando");
    try {
      await pendiente.accion();
      // El mensaje de éxito se ve en este mismo diálogo (no en el modal de atrás, que puede
      // cerrarse de inmediato debajo sin que se note — este diálogo lo tapa por completo).
      setEstado("exito");
      setTimeout(desmontar, 900);
    } catch {
      // La acción ya dejó su propio error visible (useErrorHandler.run lo muestra en el modal
      // de atrás antes de relanzar) — acá solo se cierra sin mostrar "éxito" falso.
      desmontar();
    }
  }

  const modal = pendiente ? (
    <ConfirmModal
      mensaje={pendiente.mensaje}
      textoConfirmar={pendiente.textoConfirmar}
      textoExito={pendiente.textoExito}
      variante={pendiente.variante}
      estado={estado}
      saliendo={saliendo}
      onCancelar={cancelar}
      onConfirmar={confirmar}
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
      // Un TypeError de fetch significa que la petición ni llegó al servidor ("Failed to
      // fetch", en inglés y críptico) — se traduce a algo accionable. OJO: el error original
      // se relanza intacto, porque la cola offline detecta "err instanceof TypeError" para
      // decidir si guarda en el dispositivo (ver offlineQueue.ts / LecturaModal.tsx).
      if (err instanceof TypeError) {
        setError("Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.");
      } else {
        setError(err instanceof Error ? err.message.replace(/^Error \d+: /, "") : "Error inesperado");
      }
      throw err;
    }
  }
  function limpiar() {
    setError(null);
  }
  return { error, run, limpiar };
}
