import { useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Menu } from "lucide-react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import RutaProtegida from "./components/RutaProtegida";
import Sidebar from "./components/Sidebar";
import LoginPage from "./pages/LoginPage";
import InicioPage from "./pages/InicioPage";
import SuscriptoresPage from "./pages/SuscriptoresPage";
import MedidoresPage from "./pages/MedidoresPage";
import LecturasPage from "./pages/LecturasPage";
import ReportesPage from "./pages/ReportesPage";
import AtipicosPage from "./pages/AtipicosPage";
import MapaPage from "./pages/MapaPage";
import UsuariosPage from "./pages/UsuariosPage";
import RolesPage from "./pages/RolesPage";
import AforosPage from "./pages/AforosPage";
import InventarioPage from "./pages/InventarioPage";
import HistorialPage from "./pages/HistorialPage";

function AppShell() {
  const [menuAbierto, setMenuAbierto] = useState(false);

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
        {/* pb con safe-area-inset: en celular, la barra de gestos/pestañas del navegador se
            superpone al final del contenido si no se le deja ese espacio de respeto. */}
        <main className="flex-1 overflow-y-auto bg-slate-50 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] dark:bg-slate-950 sm:p-4 md:p-6">
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
          </Routes>
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
