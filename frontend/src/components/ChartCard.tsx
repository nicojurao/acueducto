import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEsMovil } from "../lib/useEsMovil";

// Tarjeta contenedora de una gráfica: colapsable en móvil (para no llenar la pantalla de
// gráficas abiertas), siempre expandida en escritorio.
export default function ChartCard({ title, children, span }: { title: string; children: React.ReactNode; span?: boolean }) {
  const esMovil = useEsMovil();
  const [abierto, setAbierto] = useState(!esMovil);

  return (
    <div
      className={`rounded-xl border border-brand-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${
        span ? "lg:col-span-2" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-4 text-left sm:cursor-default sm:pb-0"
      >
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
        {abierto ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-slate-600 sm:hidden" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-600 sm:hidden" />
        )}
      </button>
      <div className={`${abierto ? "block" : "hidden"} px-4 pb-4 sm:block sm:pt-3`}>{children}</div>
    </div>
  );
}
