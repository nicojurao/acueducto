import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Sun, Moon, Gauge, MapPin, ClipboardList, BarChart3 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { inputClass } from "../lib/ui";

const caracteristicas = [
  { icon: Gauge, texto: "Inventario y control de medidores" },
  { icon: ClipboardList, texto: "Captura de lecturas en campo" },
  { icon: MapPin, texto: "Ubicación de predios en mapa" },
  { icon: BarChart3, texto: "Reportes y consumos atípicos" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const [identificador, setIdentificador] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await login(identificador, password);
      navigate("/");
    } catch {
      setError("Cédula/usuario o contraseña incorrectos.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <button
        onClick={toggle}
        title={dark ? "Modo claro" : "Modo oscuro"}
        className="absolute right-4 top-4 rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="grid w-full max-w-3xl overflow-hidden rounded-xl border border-brand-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-2">
        <div className="hidden flex-col justify-between bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white md:flex">
          <div className="flex items-center gap-3">
            <img src="/logo-acbum.png" alt="Logo ACBUM" className="h-14 w-14 shrink-0 object-contain" />
            <div>
              <div className="text-base font-bold leading-tight">Acueducto Comunitario Barrios Unidos de Mocoa</div>
              <div className="mt-0.5 text-xs text-brand-100">Sistema de gestión operativa y ambiental</div>
            </div>
          </div>
          <div className="space-y-4">
            <p className="text-sm text-brand-50">
              Plataforma para el control de suscriptores, medidores y lecturas de consumo de agua.
            </p>
            <ul className="space-y-2.5">
              {caracteristicas.map(({ icon: Icon, texto }) => (
                <li key={texto} className="flex items-center gap-2.5 text-sm text-brand-50">
                  <Icon className="h-4 w-4 shrink-0 text-brand-200" />
                  {texto}
                </li>
              ))}
            </ul>
          </div>
          <div className="text-xs text-brand-200">© {new Date().getFullYear()} Acueducto</div>
        </div>

        <div className="flex flex-col justify-center p-6 sm:p-8">
          <div className="mb-6 flex flex-col items-center gap-2 text-center md:hidden">
            <img src="/logo-acbum.png" alt="Logo ACBUM" className="h-12 w-12 object-contain" />
            <div>
              <div className="text-base font-bold">Acueducto Comunitario Barrios Unidos de Mocoa</div>
              <div className="text-xs text-slate-700 dark:text-slate-400">Sistema de gestión operativa y ambiental</div>
            </div>
          </div>

          <h1 className="mb-1 text-xl font-bold text-slate-900 dark:text-slate-100">Iniciar sesión</h1>
          <p className="mb-6 text-sm text-slate-700 dark:text-slate-400">
            Ingresa tus credenciales para acceder al sistema.
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              Cédula o usuario
              <input
                type="text"
                placeholder="Tu cédula (o tu usuario si eres admin)"
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                required
                autoFocus
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              Contraseña
              <div className="relative">
                <input
                  type={verPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={`${inputClass} w-full pr-9`}
                />
                <button
                  type="button"
                  onClick={() => setVerPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-600 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {verPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={cargando}
              className="mt-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {cargando ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-600 dark:text-slate-500">
            ¿Problemas para ingresar? Contacta al administrador del sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
