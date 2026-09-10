import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { api, urlFoto } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";
import { recargarEmpresaPublica } from "../../lib/empresaRuntime";
import { aplicarColorMarca } from "../../lib/colorMarca";
import {
  FormularioEmpresa,
  SeccionDatosEmpresa,
  SeccionMarca,
  SeccionCatastral,
  SeccionSubdominios,
  SeccionCorreo,
} from "./SeccionesEmpresa";

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

// Mismos 5 grupos de campos que el wizard de primer uso (SeccionesEmpresa.tsx), pero todos en una
// sola pantalla con un botón de guardar — para editar después de la configuración inicial, sin
// tener que repetir el flujo paso a paso.
export default function EmpresaTab() {
  const { mostrar, mostrarError } = useToast();
  const [valores, setValores] = useState<FormularioEmpresa>(VACIO);
  const [logoRuta, setLogoRuta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);

  function cargar() {
    setCargando(true);
    api.empresa
      .obtener()
      .then((datos) => {
        const { id: _id, logoRuta: ruta, configuradoEn: _c, updatedAt: _u, ...resto } = datos;
        setValores({ ...VACIO, ...resto });
        setLogoRuta(ruta);
      })
      .finally(() => setCargando(false));
  }
  useEffect(cargar, []);

  function onChange<K extends keyof FormularioEmpresa>(campo: K, valor: FormularioEmpresa[K]) {
    setValores((prev) => ({ ...prev, [campo]: valor }));
  }

  async function subirLogo(archivo: File) {
    setSubiendoLogo(true);
    try {
      const actualizada = await api.empresa.subirLogo(archivo);
      setLogoRuta(actualizada.logoRuta);
      await recargarEmpresaPublica();
      mostrar("Logo actualizado.", "exito");
    } catch (err) {
      mostrarError(err, "no se pudo subir el logo");
    } finally {
      setSubiendoLogo(false);
    }
  }

  async function guardar() {
    setGuardando(true);
    try {
      await api.empresa.guardar(valores);
      aplicarColorMarca(valores.colorMarca);
      await recargarEmpresaPublica();
      mostrar("Cambios guardados.", "exito");
    } catch (err) {
      mostrarError(err, "no se pudieron guardar los cambios");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return <div className="flex h-40 items-center justify-center text-slate-500 dark:text-slate-400">Cargando...</div>;
  }

  const secciones = [
    { titulo: "Datos de la empresa", contenido: <SeccionDatosEmpresa valores={valores} onChange={onChange} /> },
    {
      titulo: "Marca",
      contenido: (
        <SeccionMarca
          valores={valores}
          onChange={onChange}
          logoActualUrl={urlFoto(logoRuta)}
          onSubirLogo={subirLogo}
          subiendoLogo={subiendoLogo}
        />
      ),
    },
    { titulo: "Información catastral", contenido: <SeccionCatastral valores={valores} onChange={onChange} /> },
    { titulo: "Subdominios", contenido: <SeccionSubdominios valores={valores} onChange={onChange} /> },
    { titulo: "Correo", contenido: <SeccionCorreo valores={valores} onChange={onChange} /> },
  ];

  return (
    <div className="space-y-4">
      {secciones.map((s) => (
        <div key={s.titulo} className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{s.titulo}</h3>
          {s.contenido}
        </div>
      ))}
      <button
        onClick={guardar}
        disabled={guardando}
        className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
      >
        <Save className="h-4 w-4" />
        {guardando ? "Guardando..." : "Guardar cambios"}
      </button>
    </div>
  );
}
