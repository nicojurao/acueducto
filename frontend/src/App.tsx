import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Menu, Loader2, CloudOff } from "lucide-react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider } from "./contexts/ToastContext";
import RutaProtegida from "./components/RutaProtegida";
import Sidebar from "./components/Sidebar";
import ErrorBoundary from "./components/ErrorBoundary";
import LoginPage from "./pages/LoginPage";
import InicioPage from "./pages/InicioPage";
import NotFoundPage from "./pages/NotFoundPage";
import { useOnline } from "./lib/useOnline";
import { useEmpresa, obtenerEmpresaCache, urlLogoEmpresa } from "./lib/empresaRuntime";
import PqrsApp from "./pqrs/PqrsApp";
import DocumentosSgcPublicoApp from "./calidad/DocumentosSgcPublicoApp";

// pqrs.<dominio> y calidad.<dominio> muestran sitios públicos en vez de la app operativa — nginx
// sirve el MISMO build sin importar el hostname (no hay "server_name" explícito, ver
// frontend/nginx.conf), así que la app decide acá, por dominio, cuál rama mostrar. Compara contra
// los dominios reales que la entidad configuró (wizard/panel de administración, ver
// lib/empresaRuntime.ts) — si todavía no hay nada configurado (recién levantado, antes del
// wizard), cae al viejo criterio por prefijo como red de seguridad, para que el propio wizard sea
// alcanzable en cualquier hostname mientras tanto.
function esPqrsPublico(): boolean {
  const dominio = obtenerEmpresaCache().dominioPqrs;
  if (dominio) return window.location.hostname === dominio;
  return window.location.hostname.startsWith("pqrs.");
}

function esDocumentosSgcPublico(): boolean {
  const dominio = obtenerEmpresaCache().dominioCalidad;
  if (dominio) return window.location.hostname === dominio;
  return window.location.hostname.startsWith("calidad.");
}

// Cada página pesada va en su propio chunk (React.lazy): el bundle inicial deja de traer
// recharts/leaflet/etc. de todas las pantallas de una vez y solo baja lo que se navega. En el
// celular del fontanero con señal pobre esto acelera bastante la primera carga. Offline no se
// pierde nada: el service worker de la PWA precachea TODOS los chunks al instalarse (el
// globPatterns de vite.config.ts incluye **/*.js), así que las páginas lazy también quedan
// disponibles sin conexión aunque nunca se hayan visitado.
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const SuscriptoresPage = lazy(() => import("./pages/SuscriptoresPage"));
const MedidoresPage = lazy(() => import("./pages/MedidoresPage"));
const LecturasPage = lazy(() => import("./pages/LecturasPage"));
const AtipicosPage = lazy(() => import("./pages/AtipicosPage"));
const MapaPage = lazy(() => import("./pages/MapaPage"));
const AforosPage = lazy(() => import("./pages/AforosPage"));
const InventarioPage = lazy(() => import("./pages/InventarioPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const FacturacionPage = lazy(() => import("./pages/FacturacionPage"));
const PqrsPage = lazy(() => import("./pages/PqrsPage"));
const ContabilidadPage = lazy(() => import("./pages/ContabilidadPage"));
const SuspensionesPage = lazy(() => import("./pages/SuspensionesPage"));
const DocumentosSgcPage = lazy(() => import("./pages/DocumentosSgcPage"));
const SetupWizardPage = lazy(() => import("./pages/SetupWizardPage"));

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
  const empresa = useEmpresa();
  // key={pathname}: si una pantalla se cae con un error, cambiar de ruta y volver a entrar la
  // reintenta de cero en vez de quedar pegada mostrando el mensaje de error para siempre.
  const location = useLocation();

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
          {urlLogoEmpresa() && (
            <img src={urlLogoEmpresa()} alt={`Logo ${empresa.nombreCorto}`} className="h-8 w-8 shrink-0 object-contain" />
          )}
          <span className="truncate text-xs font-bold">{empresa.nombre}</span>
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
          <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<CargandoPagina />}>
          <Routes>
            <Route path="/" element={<RutaProtegida><InicioPage /></RutaProtegida>} />
            <Route
              path="/dashboard"
              element={
                <RutaProtegida permiso="dashboard">
                  <DashboardPage />
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
              path="/facturacion"
              element={
                <RutaProtegida permiso={["facturacion_ver", "facturacion_avanzado", "pagos_registrar"]}>
                  <FacturacionPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/pqrs"
              element={
                <RutaProtegida permiso={["pqrs_ver", "pqrs_avanzado"]}>
                  <PqrsPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/contabilidad"
              element={
                <RutaProtegida permiso={["contabilidad_ver", "contabilidad_avanzado"]}>
                  <ContabilidadPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/suspensiones"
              element={
                <RutaProtegida permiso={["suspensiones_ver", "suspensiones_avanzado"]}>
                  <SuspensionesPage />
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
              path="/documentos-sgc"
              element={
                <RutaProtegida permiso={["documentos_sgc_ver", "documentos_sgc_avanzado"]}>
                  <DocumentosSgcPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/admin"
              element={
                <RutaProtegida permiso="admin_panel">
                  <AdminPage />
                </RutaProtegida>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function Enrutador() {
  const { usuario, cargando } = useAuth();
  const empresa = useEmpresa();

  if (cargando) return null;
  if (!usuario) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  // Primer uso: todavía no se completó el wizard de configuración (Empresa.configuradoEn sigue
  // vacío). Solo quien tiene admin_panel puede verlo y completarlo — cualquier otro rol en un
  // despliegue recién levantado se queda con un mensaje simple en vez de pantallas rotas por
  // falta de datos básicos (dominios, SMTP, etc.).
  if (!empresa.configurado) {
    if (!usuario.permisos?.includes("admin_panel")) {
      return (
        <div className="flex h-dvh items-center justify-center p-6 text-center text-sm text-slate-600 dark:text-slate-400">
          El sistema todavía no está configurado. Contacta a un administrador.
        </div>
      );
    }
    return (
      <Suspense fallback={<CargandoPagina />}>
        <SetupWizardPage />
      </Suspense>
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
        <ToastProvider>
          {esPqrsPublico() ? (
            <PqrsApp />
          ) : esDocumentosSgcPublico() ? (
            <DocumentosSgcPublicoApp />
          ) : (
            <AuthProvider>
              <Enrutador />
            </AuthProvider>
          )}
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
