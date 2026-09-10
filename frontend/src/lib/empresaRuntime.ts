import { useEffect, useState } from "react";
import { API_URL } from "../api/core";

// Identidad de la entidad, leída en tiempo de ejecución desde GET /api/publico/empresa — antes
// vivía como constante fija (frontend/src/lib/empresa.ts, ya no existe) editada a mano por
// despliegue; ahora un mismo build sirve a cualquier cliente porque esto se resuelve al cargar la
// página, no al construirla. Vive en una variable de módulo (no en un Context de React) a
// propósito: App.tsx necesita leerla de forma SÍNCRONA para decidir qué sitio mostrar por
// hostname, antes de que React llegue a montar nada.
export interface EmpresaPublica {
  nombre: string;
  nombreCorto: string;
  direccion: string;
  sitioWeb: string;
  email: string;
  telefonos: string;
  colorMarca: string;
  tieneLogo: boolean;
  dominioOperativo: string;
  dominioPqrs: string;
  dominioCalidad: string;
  configurado: boolean;
  actualizadoEn: string;
}

const EMPRESA_DEFECTO: EmpresaPublica = {
  nombre: "",
  nombreCorto: "",
  direccion: "",
  sitioWeb: "",
  email: "",
  telefonos: "",
  colorMarca: "#00487f",
  tieneLogo: false,
  dominioOperativo: "",
  dominioPqrs: "",
  dominioCalidad: "",
  configurado: false,
  actualizadoEn: "",
};

let estado: EmpresaPublica = EMPRESA_DEFECTO;
let promesaCarga: Promise<EmpresaPublica> | null = null;
const oyentes = new Set<() => void>();

// Se llama UNA vez, antes del primer render (ver main.tsx). Si el backend no responde (aún
// arrancando, o problema de red) se sigue con los valores por defecto en vez de dejar la pantalla
// en blanco — la app igual funciona, solo sin marca personalizada hasta el próximo intento.
export async function cargarEmpresaPublica(): Promise<EmpresaPublica> {
  if (!promesaCarga) {
    promesaCarga = fetch(`${API_URL}/api/publico/empresa`)
      .then((r) => (r.ok ? r.json() : EMPRESA_DEFECTO))
      .then((datos) => {
        estado = { ...EMPRESA_DEFECTO, ...datos };
        return estado;
      })
      .catch(() => EMPRESA_DEFECTO);
  }
  return promesaCarga;
}

export function obtenerEmpresaCache(): EmpresaPublica {
  return estado;
}

// Vuelve a pedir el registro y avisa a todo componente que use useEmpresa() para que se
// re-renderice — se llama desde el wizard y desde la pestaña de administración después de
// guardar, así el cambio (nombre, logo, color, "ya quedó configurado") se ve de inmediato sin
// recargar la página.
export async function recargarEmpresaPublica(): Promise<void> {
  promesaCarga = null;
  await cargarEmpresaPublica();
  oyentes.forEach((fn) => fn());
}

export function useEmpresa(): EmpresaPublica {
  const [, forzarRender] = useState(0);
  useEffect(() => {
    const fn = () => forzarRender((n) => n + 1);
    oyentes.add(fn);
    return () => {
      oyentes.delete(fn);
    };
  }, []);
  return estado;
}

export function urlLogoEmpresa(): string {
  if (!estado.tieneLogo) return "";
  return `${API_URL}/api/publico/empresa/logo?v=${encodeURIComponent(estado.actualizadoEn)}`;
}
