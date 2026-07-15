import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Menu, Loader2, CloudOff } from "lucide-react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import RutaProtegida from "./components/RutaProtegida";
import Sidebar from "./components/Sidebar";
import LoginPage from "./pages/LoginPage";
import InicioPage from "./pages/InicioPage";
import NotFoundPage from "./pages/NotFoundPage";
import { useOnline } from "./lib/useOnline";

// Cada página pesada va en su propio chunk (React.lazy): el bundle inicial deja de traer
// recharts/leaflet/etc. de todas las pantallas de una vez y solo baja lo que se navega. En el
// celular del fontanero con señal pobre esto acelera bastante la primera carga. Offline no se
// pierde nada: el service worker de la PWA precachea TODOS los chunks al instalarse (el
// globPatterns de vite.config.ts incluye **/*.js), así que las páginas lazy también quedan
// disponibles sin conexión aunque nunca se hayan visitado.
const SuscriptoresPage = lazy(() => import("./pages/SuscriptoresPage"));
const MedidoresPage = lazy(() => import("./pages/MedidoresPage"));
const LecturasPage = lazy(() => import("./pages/LecturasPage"));
const ReportesPage = lazy(() => import("./pages/ReportesPage"));
const AtipicosPage = lazy(() => import("./pages/AtipicosPage"));
const MapaPage = lazy(() => import("./pages/MapaPage"));
const UsuariosPage = lazy(() => import("./pages/UsuariosPage"));
const RolesPage = lazy(() => import("./pages/RolesPage"));
const AforosPage = lazy(() => import("./pages/AforosPage"));
const InventarioPage = lazy(() => import("./pages/InventarioPage"));
const HistorialPage = lazy(() => import("./pages/HistorialPage"));

function CargandoPagina() {
  return (
    <div className="flex h-40 items-center justify-center text-slate-500 dark:text-slate-400">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

function AppShell() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const online = useOnline();

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar abierto={menuAbierto} onCerrar={() => setMenuAbierto(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-2 bg-brand-700 px-3 py-2 text-white dark:border-b dark:border-slate-800 dark:bg-slate-900 md:hidden">
          <button
            onClick={() => setMenuAbierto(true)}
            className="rounded-lg p-1.5 hover:bg-white/10 dark:hover:bg-slate-800"
          >
            <Menu className="h-5 w-5" />
          </button>
          <img src="/logo-acbum.png" alt="Logo ACBUM" className="h-8 w-8 shrink-0 object-contain" />
          <span className="truncate text-xs font-bold">Acueducto Comunitario Barrios Unidos de Mocoa</span>
        </header>
        {!online && (
          <div className="flex shrink-0 items-center justify-center gap-1.5 bg-amber-500 px-3 py-1.5 text-xs font-medium text-amber-950">
            <CloudOff className="h-3.5 w-3.5" />
            Sin conexión — los cambios se guardan en el dispositivo y se sincronizan al volver la señal.
          </div>
        )}
        {/* pb con safe-area-inset: en celular, la barra de gestos/pestañas del navegador se
            superpone al final del contenido si no se le deja ese espacio de respeto. */}
        <main className="flex-1 overflow-y-auto bg-slate-50 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] dark:bg-slate-950 sm:p-4 md:p-6">
          <Suspense fallback={<CargandoPagina />}>
          <Routes>
            <Route path="/" element={<RutaProtegida><InicioPage /></RutaProtegida>} />
            <Route
              path="/medicion"
              element={
                <RutaProtegida permiso="dashboard">
                  <ReportesPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/suscriptores"
              element={
                <RutaProtegida permiso="suscriptores_ver">
                  <SuscriptoresPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/medidores"
              element={
                <RutaProtegida permiso={["medidores_ver", "medidores_avanzado"]}>
                  <MedidoresPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/mapa"
              element={
                <RutaProtegida permiso="mapa">
                  <MapaPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/lecturas"
              element={
                <RutaProtegida permiso="lecturas">
                  <LecturasPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/aforos"
              element={
                <RutaProtegida permiso={["aforos_ver", "aforos_avanzado"]}>
                  <AforosPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/inventario"
              element={
                <RutaProtegida permiso={["inventario_ver", "inventario_avanzado"]}>
                  <InventarioPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/atipicos"
              element={
                <RutaProtegida permiso="dashboard">
                  <AtipicosPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/usuarios"
              element={
                <RutaProtegida permiso="usuarios">
                  <UsuariosPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/roles"
              element={
                <RutaProtegida permiso="roles">
                  <RolesPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/historial"
              element={
                <RutaProtegida permiso="historial">
                  <HistorialPage />
                </RutaProtegida>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function Enrutador() {
  const { usuario, cargando } = useAuth();

  if (cargando) return null;
  if (!usuario) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<AppShell />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Enrutador />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
