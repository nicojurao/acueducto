import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export interface Orden {
  campo: string;
  dir: "asc" | "desc";
}

// Alterna el orden al hacer clic: otra columna → asc, misma columna → invierte dirección.
export function alternarOrden(actual: Orden, campo: string): Orden {
  if (actual.campo !== campo) return { campo, dir: "asc" };
  return { campo, dir: actual.dir === "asc" ? "desc" : "asc" };
}

// Encabezado de tabla clickeable para ordenar. Muestra la flecha de dirección solo en la
// columna activa; en el resto una doble flecha tenue que aparece al pasar el mouse.
export default function ThOrdenable({
  campo,
  orden,
  onOrdenar,
  children,
  className = "px-3 py-2 font-medium sm:px-4 sm:py-3",
}: {
  campo: string;
  orden: Orden;
  onOrdenar: (campo: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const activa = orden.campo === campo;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onOrdenar(campo)}
        className="group inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400"
        title="Ordenar por esta columna"
      >
        {children}
        {activa ? (
          orden.dir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-50" />
        )}
      </button>
    </th>
  );
}
