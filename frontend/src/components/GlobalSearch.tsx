import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { api, Suscriptor } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

// Buscador rápido por NUID o nombre, accesible desde el sidebar en cualquier pantalla. Reutiliza
// el mismo patrón que ya usa MedidoresPage al llegar desde el Dashboard: navega a
// /suscriptores?suscriptorId=X, que ya sabe abrir el modal de detalle solo con ese query param.
export default function GlobalSearch({ onNavegar }: { onNavegar?: () => void }) {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [resultados, setResultados] = useState<Suscriptor[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!qDebounced) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    api.suscriptores
      .listPaginado(1, 6, { q: qDebounced })
      .then((r) => setResultados(r.data))
      .finally(() => setBuscando(false));
  }, [qDebounced]);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  if (!usuario?.permisos?.includes("suscriptores_ver")) return null;

  function ir(id: number) {
    setQ("");
    setAbierto(false);
    onNavegar?.();
    navigate(`/suscriptores?suscriptorId=${id}`);
  }

  return (
    <div ref={contenedorRef} className="relative px-3 py-2">
      <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white focus-within:ring-2 focus-within:ring-white/40 dark:bg-slate-800 dark:text-slate-200">
        <Search className="h-4 w-4 shrink-0 text-brand-200 dark:text-slate-400" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          placeholder="Buscar suscriptor por NUID o nombre..."
          className="w-full min-w-0 bg-transparent placeholder:text-brand-200 focus:outline-none dark:placeholder:text-slate-500"
        />
        {q && (
          <button onClick={() => setQ("")} className="shrink-0 text-brand-200 hover:text-white dark:text-slate-400">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {abierto && qDebounced && (
        <div className="absolute left-3 right-3 top-full z-[1700] mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {buscando ? (
            <p className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">Buscando...</p>
          ) : resultados.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">Sin resultados para "{qDebounced}".</p>
          ) : (
            resultados.map((s) => (
              <button
                key={s.id}
                onClick={() => ir(s.id)}
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{s.nombre}</span>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  NUID {s.codigo}
                  {s.ruta ? ` · Ruta ${s.ruta}` : ""}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
