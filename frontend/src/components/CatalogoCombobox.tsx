import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { inputClass } from "../lib/ui";

// Select con búsqueda genérico para catálogos simples con id/nombre (categoría, ubicación,
// proveedor de Inventario). Calcado de MedidorCombobox.tsx, sin acoplarlo a un tipo concreto.
export default function CatalogoCombobox({
  opciones,
  value,
  onChange,
  placeholder,
  vacio,
}: {
  opciones: { id: number; nombre: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  vacio?: string;
}) {
  const [query, setQuery] = useState("");
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const seleccionado = useMemo(
    () => opciones.find((o) => String(o.id) === value) ?? null,
    [opciones, value]
  );

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  const resultados = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return opciones.slice(0, 50);
    return opciones.filter((o) => o.nombre.toUpperCase().includes(q)).slice(0, 50);
  }, [opciones, query]);

  return (
    <div className="relative" ref={contenedorRef}>
      <div className="relative">
        <input
          placeholder={placeholder ?? "Busca..."}
          value={abierto ? query : seleccionado ? seleccionado.nombre : ""}
          onChange={(e) => {
            setQuery(e.target.value);
            if (value) onChange("");
          }}
          onFocus={() => {
            setQuery("");
            setAbierto(true);
          }}
          className={`${inputClass} w-full pr-8`}
        />
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600 dark:text-slate-400" />
      </div>
      {abierto && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {resultados.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-600 dark:text-slate-400">{vacio ?? "Sin resultados"}</div>
          ) : (
            resultados.map((o) => (
              <button
                type="button"
                key={o.id}
                onClick={() => {
                  onChange(String(o.id));
                  setQuery("");
                  setAbierto(false);
                }}
                className="flex w-full items-start px-3 py-2 text-left text-sm hover:bg-brand-50 dark:hover:bg-slate-800"
              >
                <span className="font-medium text-slate-700 dark:text-slate-200">{o.nombre}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
