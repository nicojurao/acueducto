import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Gauge,
  ClipboardList,
  LayoutDashboard,
  Users,
  Map,
  Waves,
  Warehouse,
  Sun,
  Moon,
  X,
  LogOut,
  UserCog,
  ShieldCheck,
  ChevronDown,
  Droplets,
  Shield,
  Home,
  History,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { urlFoto } from "../api/client";
import PerfilModal from "./PerfilModal";
import GlobalSearch from "./GlobalSearch";
import { listarPendientes, listarPendientesNovedad } from "../lib/offlineQueue";
import { useCierreAnimado } from "../lib/useCierreAnimado";

type Link = { to: string; label: string; icon: typeof LayoutDashboard; permiso?: string | string[] };
type Entrada = Link | { label: string; icon: typeof LayoutDashboard; children: Link[] };

const medicion: Link[] = [
  { to: "/medicion", label: "Dashboard", icon: LayoutDashboard, permiso: "dashboard" },
  { to: "/suscriptores", label: "Suscriptores", icon: Users, permiso: "suscriptores_ver" },
  { to: "/medidores", label: "Medidores", icon: Gauge, permiso: ["medidores_ver", "medidores_avanzado"] },
  { to: "/mapa", label: "Mapa", icon: Map, permiso: "mapa" },
  { to: "/lecturas", label: "Captura de Lecturas", icon: ClipboardList, permiso: "lecturas" },
];

const usuariosYRoles: Link[] = [
  { to: "/usuarios", label: "Usuarios", icon: UserCog, permiso: "usuarios" },
  { to: "/roles", label: "Roles y permisos", icon: ShieldCheck, permiso: "roles" },
  { to: "/historial", label: "Historial de cambios", icon: History, permiso: "historial" },
];

const entradas: Entrada[] = [
  { to: "/", label: "Inicio", icon: Home },
  { label: "Medición", icon: Droplets, children: medicion },
  { to: "/aforos", label: "Aforos", icon: Waves, permiso: ["aforos_ver", "aforos_avanzado"] },
  { to: "/inventario", label: "Inventario general", icon: Warehouse, permiso: ["inventario_ver", "inventario_avanzado"] },
  { label: "Usuarios", icon: Shield, children: usuariosYRoles },
];

function esGrupo(e: Entrada): e is { label: string; icon: typeof LayoutDashboard; children: Link[] } {
  return "children" in e;
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive
      ? "bg-white text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
      : "text-brand-100 hover:bg-white/10 dark:text-slate-300 dark:hover:bg-slate-800"
  }`;

export default function Sidebar({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { dark, toggle } = useTheme();
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  const [avisoCierreSesion, setAvisoCierreSesion] = useState<number | null>(null);
  const { saliendo: saliendoAviso, cerrar: cerrarAviso } = useCierreAnimado(() => setAvisoCierreSesion(null));

  async function intentarCerrarSesion() {
    const [pendientes, pendientesNovedad] = await Promise.all([listarPendientes(), listarPendientesNovedad()]);
    const total = pendientes.length + pendientesNovedad.length;
    if (total > 0) {
      setAvisoCierreSesion(total);
      return;
    }
    logout();
    navigate("/login");
  }

  const tienePermiso = (l: Link) => {
    if (!l.permiso || !usuario) return true;
    const claves = Array.isArray(l.permiso) ? l.permiso : [l.permiso];
    return claves.some((c) => usuario.permisos?.includes(c));
  };

  const entradasVisibles = entradas
    .map((e) => (esGrupo(e) ? { ...e, children: e.children.filter(tienePermiso) } : e))
    .filter((e) => (esGrupo(e) ? e.children.length > 0 : tienePermiso(e)));

  const grupoConRutaActiva = (children: Link[]) =>
    children.some((c) => (c.to === "/" ? pathname === "/" : pathname.startsWith(c.to)));

  const [grupoAbierto, setGrupoAbierto] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      entradasVisibles.filter(esGrupo).map((g) => [g.label, grupoConRutaActiva(g.children)])
    )
  );

  return (
    <>
      {abierto && (
        <div
          onClick={onCerrar}
          className="fixed inset-0 z-[1500] bg-black/50 animate-fade-in md:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-[1600] flex h-dvh w-64 shrink-0 flex-col bg-gradient-to-b from-brand-700 to-brand-900 transition-transform dark:from-slate-900 dark:to-slate-900 md:static md:translate-x-0 ${
          abierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/logo-acbum.png" alt="Logo ACBUM" className="h-11 w-11 shrink-0 object-contain" />
            <div className="min-w-0">
              <div className="text-xs font-bold leading-tight text-white">
                Acueducto Comunitario Barrios Unidos de Mocoa
              </div>
              <div className="mt-0.5 text-[10px] leading-tight text-brand-200 dark:text-slate-400">
                Sistema de gestión operativa y ambiental
              </div>
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="shrink-0 rounded-lg p-1.5 text-white hover:bg-white/10 md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {usuario && (
          <button
            onClick={() => setPerfilAbierto(true)}
            className="flex items-center gap-2.5 border-b border-white/10 px-5 py-3 text-left hover:bg-white/5 dark:border-slate-800 dark:hover:bg-slate-800/60"
          >
            {usuario.foto ? (
              <img
                src={urlFoto(usuario.foto)}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white dark:bg-brand-500/15 dark:text-brand-400">
                {usuario.nombre
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((p) => p[0])
                  .join("")
                  .toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white dark:text-slate-200">{usuario.nombre}</div>
              <div className="truncate text-xs capitalize text-brand-200 dark:text-slate-400">{usuario.rol.nombre}</div>
            </div>
          </button>
        )}
        {perfilAbierto && <PerfilModal onCerrar={() => setPerfilAbierto(false)} />}

        <GlobalSearch onNavegar={onCerrar} />

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {entradasVisibles.map((e) =>
            esGrupo(e) ? (
              <div key={e.label}>
                <button
                  onClick={() => setGrupoAbierto((g) => ({ ...g, [e.label]: !g[e.label] }))}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-100 transition-colors hover:bg-white/10 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <e.icon className="h-4.5 w-4.5" size={18} />
                  <span className="flex-1 text-left">{e.label}</span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 transition-transform ${grupoAbierto[e.label] ? "rotate-180" : ""}`}
                  />
                </button>
                {grupoAbierto[e.label] && (
                  <div className="mt-1 space-y-1 pl-4">
                    {e.children.map(({ to, label, icon: Icon }) => (
                      <NavLink key={to} to={to} end={to === "/"} onClick={onCerrar} className={linkClass}>
                        <Icon className="h-4.5 w-4.5" size={18} />
                        {label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <NavLink key={e.to} to={e.to} end={e.to === "/"} onClick={onCerrar} className={linkClass}>
                <e.icon className="h-4.5 w-4.5" size={18} />
                {e.label}
              </NavLink>
            )
          )}
        </nav>

        <button
          onClick={toggle}
          className="mx-3 mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-100 hover:bg-white/10 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
          {dark ? "Modo claro" : "Modo oscuro"}
        </button>
        {usuario && (
          <button
            onClick={intentarCerrarSesion}
            className="mx-3 mb-[max(1rem,env(safe-area-inset-bottom))] flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-100 hover:bg-white/10 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        )}
      </aside>

      {avisoCierreSesion !== null && (
        <div className={`fixed inset-0 z-[2500] flex items-center justify-center bg-black/50 p-4 ${saliendoAviso ? "animate-fade-out" : "animate-fade-in"}`}>
          <div className={`w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900 ${saliendoAviso ? "animate-scale-out" : "animate-scale-in"}`}>
            <p className="mb-1 text-sm font-semibold text-amber-700 dark:text-amber-400">
              Tienes {avisoCierreSesion} lectura{avisoCierreSesion === 1 ? "" : "s"} sin sincronizar
            </p>
            <p className="mb-4 text-sm text-slate-700 dark:text-slate-300">
              Se guardaron en este dispositivo y se subirán solos apenas haya internet, pero
              solo si vuelves a entrar aquí. Si cierras sesión ahora y luego entras desde otro
              celular o navegador, esas lecturas no van a estar ahí.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={cerrarAviso}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Seguir aquí
              </button>
              <button
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
              >
                Cerrar sesión igual
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
