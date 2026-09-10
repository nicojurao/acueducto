import { request, requestMultipart, descargarArchivo } from "../core.js";

export const TIPO_DOCUMENTO_SGC_LABELS: Record<string, string> = {
  procedimiento: "Procedimiento",
  formato: "Formato",
  instructivo: "Instructivo",
  manual: "Manual",
};

export const ESTADO_DOCUMENTO_SGC_LABELS: Record<string, string> = {
  vigente: "Vigente",
  obsoleto: "Obsoleto",
  en_revision: "En revisión",
};

export const ESTADO_DOCUMENTO_SGC_COLORS: Record<string, string> = {
  vigente: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  obsoleto: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  en_revision: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
};

export interface VersionDocumentoSgc {
  id: number;
  numeroVersion: number;
  archivoUrl: string;
  vigente: boolean;
  fechaVigencia: string;
  descripcionCambio: string | null;
  elaboroPor: string | null;
  revisoPor: string | null;
  aproboPor: string | null;
  createdAt: string;
}

export interface DocumentoSgc {
  id: number;
  codigo: string;
  titulo: string;
  tipo: string;
  proceso: string;
  estado: string;
  createdAt: string;
  updatedAt: string;
  versiones: VersionDocumentoSgc[];
}

export interface FiltrosDocumentosSgc {
  proceso?: string;
  tipo?: string;
  estado?: string;
  q?: string;
}

function qs(filtros: FiltrosDocumentosSgc): string {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) if (valor) params.set(clave, valor);
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

export interface NuevaVersionSgc {
  archivo: File;
  fechaVigencia: string;
  descripcionCambio?: string;
  elaboroPor?: string;
  revisoPor?: string;
  aproboPor?: string;
}

function formDataVersion(datos: NuevaVersionSgc): FormData {
  const fd = new FormData();
  fd.append("archivo", datos.archivo);
  fd.append("fechaVigencia", datos.fechaVigencia);
  if (datos.descripcionCambio) fd.append("descripcionCambio", datos.descripcionCambio);
  if (datos.elaboroPor) fd.append("elaboroPor", datos.elaboroPor);
  if (datos.revisoPor) fd.append("revisoPor", datos.revisoPor);
  if (datos.aproboPor) fd.append("aproboPor", datos.aproboPor);
  return fd;
}

export const documentosSgcApi = {
  listar: (filtros: FiltrosDocumentosSgc = {}) => request<DocumentoSgc[]>(`/api/documentos-sgc${qs(filtros)}`),
  obtener: (id: number) => request<DocumentoSgc>(`/api/documentos-sgc/${id}`),
  crear: (datos: { codigo: string; titulo: string; tipo: string; proceso: string } & NuevaVersionSgc) => {
    const fd = formDataVersion(datos);
    fd.append("codigo", datos.codigo);
    fd.append("titulo", datos.titulo);
    fd.append("tipo", datos.tipo);
    fd.append("proceso", datos.proceso);
    return requestMultipart<DocumentoSgc>("/api/documentos-sgc", fd, "POST");
  },
  actualizar: (id: number, datos: { titulo: string; tipo: string; proceso: string; estado?: string }) =>
    request<DocumentoSgc>(`/api/documentos-sgc/${id}`, { method: "PUT", body: JSON.stringify(datos) }),
  subirVersion: (id: number, datos: NuevaVersionSgc) =>
    requestMultipart<DocumentoSgc>(`/api/documentos-sgc/${id}/versiones`, formDataVersion(datos), "POST"),
  eliminar: (id: number) => request<void>(`/api/documentos-sgc/${id}`, { method: "DELETE" }),
  // Nombre real (código-vN.ext) en vez del nombre interno de MinIO — a diferencia de urlFoto(),
  // que sirve el archivo tal cual sin Content-Disposition legible.
  descargarVersion: (versionId: number, nombrePorDefecto: string) =>
    descargarArchivo(`/api/documentos-sgc/versiones/${versionId}/descargar`, nombrePorDefecto),
};

// Sitio público (calidad.acbum.com.co) — sin sesión, contra /api/publico/documentos-sgc.
export interface DocumentoSgcPublico {
  id: number;
  codigo: string;
  titulo: string;
  tipo: string;
  proceso: string;
  versiones: { numeroVersion: number; fechaVigencia: string }[];
}

export const documentosSgcPublicoApi = {
  listar: (filtros: Omit<FiltrosDocumentosSgc, "estado"> = {}) =>
    request<DocumentoSgcPublico[]>(`/api/publico/documentos-sgc${qs(filtros)}`),
};
