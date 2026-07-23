import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

type Variante = "exito" | "error" | "info";

interface ToastItem {
  id: number;
  mensaje: string;
  variante: Variante;
  saliendo: boolean;
}

interface ToastContextValor {
  mostrar: (mensaje: string, variante?: Variante) => void;
  // Traduce el error que ya se relanza en toda la app (fetch/api/client.ts) a un mensaje
  // empático y muestra el toast; devuelve el mismo texto por si el llamador también quiere
  // mostrarlo inline (ej. dentro de un modal, como ya hace useErrorHandler).
  mostrarError: (err: unknown, contexto?: string) => string;
}

const ToastContext = createContext<ToastContextValor | null>(null);

const ICONOS: Record<Variante, typeof CheckCircle2> = {
  exito: CheckCircle2,
  error: XCircle,
  info: Info,
};

const ESTILOS: Record<Variante, string> = {
  exito:
    "border-emerald-200 bg-white text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-400",
  error: "border-red-200 bg-white text-red-700 dark:border-red-500/30 dark:bg-slate-900 dark:text-red-400",
  info: "border-brand-200 bg-white text-brand-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
};

// Igual que en useErrorHandler (ConfirmModal.tsx): el backend ya manda mensajes en español,
// listos para mostrar tal cual. Solo se traduce lo que llega crudo del navegador (fetch fallido,
// sin status), que es justo lo que un usuario en campo con mala señal se topa más seguido.
export function mensajeAmigable(err: unknown, contexto?: string): string {
  if (err instanceof TypeError) {
    return "Parece que no hay conexión. Si estabas guardando algo, no se perdió: quedó en tu dispositivo y se enviará solo cuando vuelva la señal.";
  }
  if (err instanceof Error) {
    const limpio = err.message.replace(/^Error \d+: /, "");
    return limpio || (contexto ? `No se pudo completar: ${contexto}.` : "Algo no salió bien. Intenta de nuevo.");
  }
  return contexto ? `No se pudo completar: ${contexto}.` : "Algo no salió bien. Intenta de nuevo.";
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const cerrar = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, saliendo: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 150);
  }, []);

  const mostrar = useCallback(
    (mensaje: string, variante: Variante = "info") => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, mensaje, variante, saliendo: false }]);
      setTimeout(() => cerrar(id), variante === "error" ? 6000 : 3500);
    },
    [cerrar]
  );

  const mostrarError = useCallback(
    (err: unknown, contexto?: string) => {
      const texto = mensajeAmigable(err, contexto);
      mostrar(texto, "error");
      return texto;
    },
    [mostrar]
  );

  return (
    <ToastContext.Provider value={{ mostrar, mostrarError }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[3000] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {toasts.map((t) => {
          const Icono = ICONOS[t.variante];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg ${ESTILOS[t.variante]} ${
                t.saliendo ? "animate-toast-out" : "animate-toast-in"
              }`}
            >
              <Icono className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{t.mensaje}</span>
              <button
                onClick={() => cerrar(t.id)}
                className="shrink-0 text-current opacity-60 hover:opacity-100"
                aria-label="Cerrar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValor {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}
