import { Component, ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

// Red de seguridad: sin esto, un error de render en CUALQUIER pantalla (ej. un dato con forma
// inesperada, una API de Leaflet que falla por una carrera de layout) tumba TODO el árbol de
// React y deja la página en blanco — nada que hacer salvo recargar a ciegas, sin ni siquiera
// saber qué pasó. Con esto, el error queda contenido a la pantalla que falló: el resto de la app
// (sidebar, navegación) sigue funcionando, y se ve un mensaje con botón de recargar en vez de
// blanco. Se envuelve una sola vez alrededor de las rutas en App.tsx.
interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Error atrapado por ErrorBoundary:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Algo salió mal en esta pantalla</h2>
          <p className="max-w-sm text-sm text-slate-600 dark:text-slate-400">
            Ocurrió un error inesperado. Podés intentar recargar — si vuelve a pasar, avisa qué estabas haciendo
            justo antes.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
          >
            <RotateCw className="h-4 w-4" />
            Recargar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
