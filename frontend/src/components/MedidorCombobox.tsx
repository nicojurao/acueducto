import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Medidor } from "../api/client";
import { inputClass } from "../lib/ui";

export default function MedidorCombobox({
  medidores,
  value,
  onChange,
}: {
  medidores: Medidor[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const seleccionado = useMemo(
    () => medidores.find((m) => String(m.id) === value) ?? null,
    [medidores, value]
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
    if (!q) return medidores.slice(0, 50);
    return medidores
      .filter((m) => `${m.serial ?? ""} ${m.marcaCat?.nombre ?? ""} ${m.modeloCat?.nombre ?? ""}`.toUpperCase().includes(q))
      .slice(0, 50);
  }, [medidores, query]);

  return (
    <div className="relative" ref={contenedorRef}>
      <div className="relative">
        <input
          placeholder="Busca por serial, marca o modelo..."
          value={
            abierto
              ? query
              : seleccionado
              ? `${seleccionado.serial} — ${seleccionado.marcaCat?.nombre ?? ""} ${seleccionado.modeloCat?.nombre ?? ""}`
              : ""
          }
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
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
      </div>
      {abierto && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {resultados.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-600">Sin medidores en bodega</div>
          ) : (
            resultados.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => {
                  onChange(String(m.id));
                  setQuery("");
                  setAbierto(false);
                }}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-brand-50 dark:hover:bg-slate-800"
              >
                <span className="font-medium text-slate-700 dark:text-slate-200">Serial: {m.serial}</span>
                <span className="text-xs text-slate-600">
                  {m.marcaCat?.nombre ?? "-"} {m.modeloCat?.nombre ?? ""}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
