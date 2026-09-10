import { useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Droplets } from "lucide-react";
import { api, urlFoto } from "../api/client";
import { recargarEmpresaPublica } from "../lib/empresaRuntime";
import { aplicarColorMarca } from "../lib/colorMarca";
import {
  FormularioEmpresa,
  SeccionDatosEmpresa,
  SeccionMarca,
  SeccionCatastral,
  SeccionSubdominios,
  SeccionCorreo,
} from "../components/empresa/SeccionesEmpresa";
import { useAuth } from "../contexts/AuthContext";

const VACIO: FormularioEmpresa = {
  nit: "",
  nitDv: "",
  nombre: "",
  nombreCorto: "",
  direccion: "",
  sitioWeb: "",
  email: "",
  telefonos: "",
  colorMarca: "#00487f",
  daneDepartamento: "",
  daneMunicipio: "",
  daneCentroPoblado: "",
  glnGs1: "",
  dominioOperativo: "",
  dominioPqrs: "",
  dominioCalidad: "",
  smtpHost: "",
  smtpPort: null,
  smtpUser: "",
  smtpPass: "",
  smtpFrom: "",
};

const TITULOS = ["Datos de la empresa", "Marca", "Información catastral", "Subdominios", "Correo"] as const;

// Primer uso: se muestra en vez del panel normal mientras Empresa.configuradoEn siga vacío (ver
// el gate en App.tsx). Cada paso guarda apenas se avanza (PUT parcial) para no perder lo ya
// escrito si se cierra la pestaña a la mitad — solo "Finalizar configuración" en el último paso
// marca el wizard como completo y deja pasar al resto de la app.
export default function SetupWizardPage() {
  const { logout } = useAuth();
  const [paso, setPaso] = useState(0);
  const [valores, setValores] = useState<FormularioEmpresa>(VACIO);
  const [logoRuta, setLogoRuta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.empresa
      .obtener()
      .then((datos) => {
        const { id: _id, logoRuta: ruta, configuradoEn: _c, updatedAt: _u, ...resto } = datos;
        setValores({ ...VACIO, ...resto });
        setLogoRuta(ruta);
      })
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onChange<K extends keyof FormularioEmpresa>(campo: K, valor: FormularioEmpresa[K]) {
    setValores((prev) => ({ ...prev, [campo]: valor }));
  }

  async function subirLogo(archivo: File) {
    setSubiendoLogo(true);
    setError(null);
    try {
      const actualizada = await api.empresa.subirLogo(archivo);
      setLogoRuta(actualizada.logoRuta);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el logo");
    } finally {
      setSubiendoLogo(false);
    }
  }

  async function guardarPaso() {
    setGuardando(true);
    setError(null);
    try {
      await api.empresa.guardar(valores);
      if (paso === TITULOS.length - 1) {
        await api.empresa.finalizar();
        await recargarEmpresaPublica();
        // El gate en App.tsx (Enrutador) se re-renderiza solo al cambiar el estado de
        // useEmpresa() — no hace falta navegar a mano, la app normal aparece de una vez.
      } else {
        // El color se aplica en caliente desde el paso de Marca en adelante, para que el resto
        // del wizard ya se vea con el color elegido, no con el de ACBUM por defecto.
        aplicarColorMarca(valores.colorMarca);
        setPaso((p) => p + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }

  const esUltimoPaso = paso === TITULOS.length - 1;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="w-full max-w-2xl rounded-xl border border-brand-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
            <Droplets className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Configuración inicial</h1>
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Paso {paso + 1} de {TITULOS.length} · {TITULOS[paso]}
            </p>
          </div>
        </div>

        <div className="mb-6 flex gap-1.5">
          {TITULOS.map((t, i) => (
            <div key={t} className={`h-1.5 flex-1 rounded-full ${i <= paso ? "bg-brand-600" : "bg-slate-200 dark:bg-slate-800"}`} />
          ))}
        </div>

        {paso === 0 && <SeccionDatosEmpresa valores={valores} onChange={onChange} />}
        {paso === 1 && (
          <SeccionMarca
            valores={valores}
            onChange={onChange}
            logoActualUrl={urlFoto(logoRuta)}
            onSubirLogo={subirLogo}
            subiendoLogo={subiendoLogo}
          />
        )}
        {paso === 2 && <SeccionCatastral valores={valores} onChange={onChange} />}
        {paso === 3 && <SeccionSubdominios valores={valores} onChange={onChange} />}
        {paso === 4 && <SeccionCorreo valores={valores} onChange={onChange} />}

        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex gap-2">
            <button
              onClick={() => setPaso((p) => Math.max(0, p - 1))}
              disabled={paso === 0 || guardando}
              className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>
            <button
              onClick={logout}
              disabled={guardando}
              className="text-xs font-medium text-slate-500 hover:underline dark:text-slate-500"
            >
              Cerrar sesión
            </button>
          </div>
          <button
            onClick={guardarPaso}
            disabled={guardando}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
          >
            {guardando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : esUltimoPaso ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {guardando ? "Guardando..." : esUltimoPaso ? "Finalizar configuración" : "Siguiente"}
          </button>
        </div>
      </div>
    </div>
  );
}
