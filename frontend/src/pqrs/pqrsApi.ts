import { request, requestMultipart, API_URL } from "../api/core.js";

// Cliente aparte del "api" interno (api/client.ts): esto es lo único del frontend que habla con
// endpoints SIN sesión (/api/publico/pqrs/*) — se mantiene separado para que quede claro, con solo
// mirar el import, qué pantallas son públicas y cuáles requieren login.

export interface PqrsSuscriptor {
  id: number;
  codigo: string;
  nombre: string;
  direccion: string | null;
  ruta: string | null;
  barrioCat: { nombre: string } | null;
}

export interface PqrsTercero {
  id: number;
  tipoDocumento: string;
  numeroDocumento: string | null;
  nombre: string;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  observaciones: string | null;
  suscriptores: PqrsSuscriptor[];
}

export interface RadicarPqrData {
  nombre: string;
  documento?: string;
  email: string;
  telefono: string;
  descripcion: string;
  suscriptorId?: number;
  fotos: File[];
  // Clasificación opcional que el ciudadano puede sugerir (ver /causales) — el staff la confirma
  // o corrige al atenderla, así que basta con mandar una de las dos (causal sola, o el detalle
  // exacto si quiso afinar más — el backend deriva la causal del detalle en ese caso).
  causal?: "F" | "P";
  detalleCausal?: number;
}

export type GrupoCausalPublico = "F" | "P";

export interface DetalleCausalPublico {
  codigo: number;
  grupo: GrupoCausalPublico;
  detalle: string;
}

export interface CatalogoCausales {
  grupos: Record<GrupoCausalPublico, string>;
  detalles: DetalleCausalPublico[];
}

export type EstadoPqrPublico = "radicada" | "en_proceso" | "resuelta" | "cerrada";

export interface PqrMensajePublico {
  autor: "staff" | "ciudadano";
  autorNombre: string | null;
  texto: string;
  archivos: string[];
  esRespuestaFinal: boolean;
  createdAt: string;
}

export interface PqrConsulta {
  numeroRadicado: string | null;
  nombre: string;
  estado: EstadoPqrPublico;
  descripcion: string;
  respuesta: string | null;
  // No es el documento en sí (nunca se expone acá) — solo si hay uno guardado, para decidir si
  // se le muestra al ciudadano la opción de responder (necesita confirmarlo para poder escribir).
  tieneDocumento: boolean;
  mensajes: PqrMensajePublico[];
  createdAt: string;
  updatedAt: string;
}

export const pqrsPublicoApi = {
  buscarTercero: (documento: string) =>
    request<PqrsTercero>(`/api/publico/pqrs/buscar-tercero?documento=${encodeURIComponent(documento)}`),
  consultar: (q: string) => request<PqrConsulta[]>(`/api/publico/pqrs/consultar?q=${encodeURIComponent(q)}`),
  causales: () => request<CatalogoCausales>("/api/publico/pqrs/causales"),
  responderMensaje: (radicado: string, data: { documento: string; texto: string; archivos: File[] }) => {
    const fd = new FormData();
    fd.append("documento", data.documento);
    fd.append("texto", data.texto);
    for (const archivo of data.archivos) fd.append("archivos", archivo);
    return requestMultipart<PqrConsulta>(`/api/publico/pqrs/${encodeURIComponent(radicado)}/mensajes`, fd, "POST");
  },
  radicar: (data: RadicarPqrData) => {
    const fd = new FormData();
    fd.append("nombre", data.nombre);
    if (data.documento) fd.append("documento", data.documento);
    fd.append("email", data.email);
    fd.append("telefono", data.telefono);
    fd.append("descripcion", data.descripcion);
    if (data.suscriptorId) fd.append("suscriptorId", String(data.suscriptorId));
    if (data.detalleCausal) fd.append("detalleCausal", String(data.detalleCausal));
    else if (data.causal) fd.append("causal", data.causal);
    for (const foto of data.fotos) fd.append("fotos", foto);
    return requestMultipart<{ numeroRadicado: string }>("/api/publico/pqrs", fd, "POST");
  },
};

// Constancia imprimible (PDF) de la radicación — sin sesión, igual que el resto de esta API
// pública: alcanza con conocer el radicado. Es un link directo (no pasa por `request`) porque el
// navegador la abre/imprime en su propio visor de PDF, no hay nada que parsear como JSON.
//
// La URL termina en "<radicado>.pdf" (no "constancia.pdf") para que, al guardarla, el navegador
// sugiera ese nombre de archivo — ver el comentario en la ruta del backend (publico/pqrs.ts).
//
// "marcaTiempo" (idealmente pqr.updatedAt) se manda como query param: el backend ya manda
// Cache-Control: no-store (ver pqrConstancia.ts), pero como el radicado del día es un
// consecutivo que se puede repetir (dos días distintos, o si algún día se vuelve a limpiar la
// tabla), una respuesta vieja cacheada por Cloudflare en el borde ANTES de ese fix podía quedar
// pegada a esa URL exacta indefinidamente — el query param cambia la URL (y con eso la clave de
// caché) apenas cambia algo en la PQR, así nunca se sirve una constancia de otro radicado.
export function urlConstanciaPqr(radicado: string, marcaTiempo?: string): string {
  const v = marcaTiempo ? new Date(marcaTiempo).getTime() : Date.now();
  return `${API_URL}/api/publico/pqrs/constancia/${encodeURIComponent(radicado)}.pdf?v=${v}`;
}
