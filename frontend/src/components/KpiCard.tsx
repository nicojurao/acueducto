import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  variant?: "default" | "alert" | "up" | "down";
  hint?: string;
  icon?: LucideIcon;
  onClick?: () => void;
  color?: string;
}

const variantStyles: Record<string, string> = {
  default: "border-brand-500",
  alert: "border-red-500",
  up: "border-emerald-500",
  down: "border-red-500",
};

const variantText: Record<string, string> = {
  default: "text-slate-900 dark:text-slate-100",
  alert: "text-red-600 dark:text-red-400",
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-red-600 dark:text-red-400",
};

export default function KpiCard({ label, value, variant = "default", hint, icon: Icon, onClick, color }: KpiCardProps) {
  const Elemento = onClick ? "button" : "div";
  return (
    <Elemento
      onClick={onClick}
      style={color ? { borderLeftColor: color } : undefined}
      className={`w-full rounded-xl border-l-4 bg-white p-2.5 text-left shadow-sm dark:bg-slate-900 dark:shadow-none sm:p-4 ${
        color ? "" : variantStyles[variant]
      } ${onClick ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-400 sm:text-xs">
          {label}
        </span>
        {Icon && (
          <Icon
            className="h-3.5 w-3.5 shrink-0 text-slate-600 dark:text-slate-500 sm:h-4 sm:w-4"
            style={color ? { color } : undefined}
          />
        )}
      </div>
      <div
        className={`mt-1 text-base font-bold sm:text-2xl ${color ? "" : variantText[variant]}`}
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      {hint && <div className="mt-1 hidden text-xs text-slate-700 dark:text-slate-400 sm:block">{hint}</div>}
    </Elemento>
  );
}
