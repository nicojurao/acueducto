import { Home } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import ModoSalidaPanel from "../components/ModoSalidaPanel";

export default function InicioPage() {
  const { usuario } = useAuth();
  const puedeSalida = usuario?.permisos?.includes("lecturas");

  return (
    <div>
      <h1 className="mb-5 flex items-center gap-2 text-xl font-bold sm:text-2xl">
        <Home className="h-6 w-6 text-brand-500" />
        Inicio
      </h1>

      <p className="mb-5 rounded-xl border border-brand-200 bg-white px-4 py-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        Bienvenido, {usuario?.nombre}. Usa el menú de la izquierda para acceder a tus secciones.
      </p>

      {puedeSalida && <ModoSalidaPanel />}
    </div>
  );
}
