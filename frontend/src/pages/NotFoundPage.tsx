import { Link } from "react-router-dom";
import { Compass, Home } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
      <Compass className="h-12 w-12 text-slate-300 dark:text-slate-700" />
      <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Página no encontrada</h1>
      <p className="max-w-sm text-sm text-slate-600 dark:text-slate-400">
        La dirección a la que intentaste entrar no existe o ya no está disponible.
      </p>
      <Link
        to="/"
        className="mt-2 flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
      >
        <Home className="h-4 w-4" />
        Volver a Inicio
      </Link>
    </div>
  );
}
