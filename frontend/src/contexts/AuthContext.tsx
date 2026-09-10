import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  api,
  getToken,
  setToken,
  refrescarMediaToken,
  limpiarMediaToken,
  cargarEstratos,
  getUsuarioGuardado,
  guardarUsuario,
  Usuario,
} from "../api/client";

interface AuthState {
  usuario: Usuario | null;
  cargando: boolean;
  login: (identificador: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refrescarUsuario: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// El token de fotos (media-token) dura 20 min; se renueva bastante antes de que expire para
// que nunca quede una foto rota a mitad de sesión por un token vencido.
const INTERVALO_MEDIA_TOKEN_MS = 10 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setCargando(false);
      return;
    }
    api.auth
      .me()
      .then(async (u) => {
        // Espera a tener el media-token ANTES de renderizar: si se muestra el usuario primero,
        // <img src={urlFoto(...)}> se pinta con mediaToken aún null, cae al token de sesión
        // completo (que el backend rechaza por no ser tipo "media") y la foto rompe hasta el
        // próximo re-render — el bug intermitente de "a veces no carga la foto".
        // cargarEstratos() puede dar 403 si el rol no tiene "suscriptores_ver"/"_avanzado" (ej. un
        // rol solo de Documentos SGC o Inventario) — no debe tumbar la carga de sesión completa
        // por eso, solo se queda sin las etiquetas de estrato (que ese rol no usa igual).
        await Promise.all([refrescarMediaToken(), cargarEstratos().catch(() => {})]);
        guardarUsuario(u);
        setUsuario(u);
      })
      .catch((err) => {
        // Si el fetch falla por falta de red (TypeError, sin llegar a preguntarle al servidor),
        // NO es lo mismo que un token inválido/expirado — este último llega como un 401 real y
        // ya se maneja aparte (ver handleUnauthorized en api/core.ts, que borra el token). Acá
        // solo cae el caso "no hay internet en este momento": un fontanero que estaba trabajando
        // en campo, se le fue la señal y se le cerró la app, no debe quedar bloqueado sin poder
        // ni abrir la pantalla — se usa la última copia del usuario guardada localmente para que
        // pueda seguir viendo/usando la app (las lecturas ya se guardan offline aparte, ver
        // offlineQueue.ts) hasta que vuelva la conexión.
        if (!navigator.onLine || err instanceof TypeError) {
          const guardado = getUsuarioGuardado<Usuario>();
          if (guardado) setUsuario(guardado);
          return;
        }
        setToken(null);
      })
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (!usuario) return;
    const id = setInterval(refrescarMediaToken, INTERVALO_MEDIA_TOKEN_MS);
    // Los navegadores frenan los setInterval de pestañas en segundo plano: si el usuario la
    // deja abierta y minimizada más de 20 min, el intervalo no alcanza a renovar el token a
    // tiempo. Al volver a la pestaña, se renueva de una vez en vez de esperar al próximo tick.
    function alVolverVisible() {
      if (document.visibilityState === "visible") refrescarMediaToken();
    }
    document.addEventListener("visibilitychange", alVolverVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolverVisible);
    };
  }, [usuario]);

  async function login(identificador: string, password: string) {
    const { token, usuario: u } = await api.auth.login(identificador, password);
    setToken(token);
    // Ver comentario arriba: cargarEstratos() puede dar 403 según el rol, y eso no debe hacer
    // fallar el login (que ya fue exitoso del lado del servidor).
    await Promise.all([refrescarMediaToken(), cargarEstratos().catch(() => {})]);
    guardarUsuario(u);
    setUsuario(u);
  }

  // Avisa al servidor que revoque esta sesión puntual ANTES de borrar el token local — si solo
  // se borrara acá, la sesión seguía "viva" del lado del servidor (ver Auditoría) hasta que
  // expirara sola. Best-effort: si falla (sin conexión, etc.) igual se cierra la sesión local,
  // no tiene sentido dejar a alguien atrapado sin poder salir de la app por un error de red.
  async function logout() {
    try {
      await api.auth.logout();
    } catch {
      // sin conexión o token ya inválido — no bloquea el cierre de sesión local
    }
    setToken(null);
    setUsuario(null);
    limpiarMediaToken();
  }

  async function refrescarUsuario() {
    const u = await api.auth.me();
    guardarUsuario(u);
    setUsuario(u);
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout, refrescarUsuario }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
