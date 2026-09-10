import { useEffect } from "react";
import { Routes, Route, Link } from "react-router-dom";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { useEmpresa, urlLogoEmpresa } from "../lib/empresaRuntime";
import PqrsBienvenida from "./PqrsBienvenida";
import PqrsRadicarPage from "./PqrsRadicarPage";
import PqrsConsultarPage from "./PqrsConsultarPage";

// Layout mínimo del sitio público de PQRS — nada de Sidebar ni menú interno, esto lo ve gente sin
// cuenta en el sistema. Mismo membrete (logo + colores de marca) que el resto de la app para que
// se sienta parte de lo mismo.
export default function PqrsApp() {
  const { dark, toggle } = useTheme();
  const empresa = useEmpresa();

  // index.html trae <title>Fluvi</title> fijo (lo comparten ambos sitios, mismo build) — acá se
  // corrige para quien entra por el dominio de PQRS, que ve un sitio distinto y no tiene por qué
  // saber qué es "Fluvi".
  useEffect(() => {
    document.title = `PQRS · ${empresa.nombre}`;
  }, [empresa.nombre]);

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950">
      <header className="flex items-center justify-between gap-3 bg-gradient-to-r from-brand-700 to-brand-900 px-4 py-3 text-white sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          {urlLogoEmpresa() && (
            <img src={urlLogoEmpresa()} alt={`Logo ${empresa.nombreCorto}`} className="h-9 w-9 shrink-0 object-contain" />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold leading-tight">{empresa.nombre}</div>
            <div className="text-[11px] text-brand-100">Peticiones, quejas, reclamos y sugerencias</div>
          </div>
        </Link>
        <button
          onClick={toggle}
          title={dark ? "Modo claro" : "Modo oscuro"}
          className="shrink-0 rounded-lg p-2 text-white hover:bg-white/10"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10 lg:max-w-5xl lg:py-14">
        <Routes>
          <Route path="/" element={<PqrsBienvenida />} />
          <Route path="/radicar" element={<PqrsRadicarPage />} />
          <Route path="/consultar" element={<PqrsConsultarPage />} />
          <Route path="*" element={<PqrsBienvenida />} />
        </Routes>
      </main>

      <footer className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-500">
        <p>© {new Date().getFullYear()} {empresa.nombre}</p>
        {(empresa.direccion || empresa.telefonos || empresa.email) && (
          <p className="mt-1">
            {[empresa.direccion, empresa.telefonos, empresa.email].filter(Boolean).join(" · ")}
          </p>
        )}
      </footer>
    </div>
  );
}
