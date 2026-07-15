import { Inbox, LucideIcon } from "lucide-react";

export default function EmptyState({
  mensaje,
  icon: Icon = Inbox,
  className = "",
}: {
  mensaje: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 ${className}`}
    >
      <Icon className="h-8 w-8 text-slate-300 dark:text-slate-600" />
      {mensaje}
    </div>
  );
}
