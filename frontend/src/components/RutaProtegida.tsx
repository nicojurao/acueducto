import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function RutaProtegida({
  children,
  permiso,
}: {
  children: React.ReactNode;
  permiso?: string | string[];
}) {
  const { usuario, cargando } = useAuth();

  if (cargando) return null;
  if (!usuario) return <Navigate to="/login" replace />;
  const claves = permiso ? (Array.isArray(permiso) ? permiso : [permiso]) : [];
  if (claves.length > 0 && !claves.some((c) => usuario.permisos?.includes(c))) {
    return (
      <div className="p-6 text-sm text-slate-700 dark:text-slate-400">
        No tienes permiso para ver esta sección.
      </div>
    );
  }
  return <>{children}</>;
}
