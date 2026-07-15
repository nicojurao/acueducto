import type { ReactNode, MouseEvent } from "react";

export default function ListCard({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  className?: string;
}) {
  const baseClass = `block w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900 ${
    onClick ? "hover:border-brand-300 active:scale-[0.99] dark:hover:border-brand-700" : ""
  } ${className}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={baseClass}>
        {children}
      </button>
    );
  }

  return <div className={baseClass}>{children}</div>;
}
