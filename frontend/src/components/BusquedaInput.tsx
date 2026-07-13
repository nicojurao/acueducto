import { Search, X } from "lucide-react";

// Campo de búsqueda estándar de las tablas: lupa a la izquierda y una X para limpiar de un
// toque (antes había que borrar el texto a mano, molesto en el celular).
export default function BusquedaInput({
  value,
  onChange,
  placeholder,
  className = "",
  autoFocus,
}: {
  value: string;
  onChange: (valor: string) => void;
  placeholder: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
      <input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="Limpiar búsqueda"
          className="absolute right-2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
