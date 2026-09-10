import { request, requestMultipart, descargarArchivo } from "../core.js";

export type EstadoPqr = "radicada" | "en_proceso" | "resuelta" | "cerrada";
export type GrupoCausal = "F" | "P";

export interface PqrMensaje {
  autor: "staff" | "ciudadano";
  autorNombre: string | null;
  texto: string;
  archivos: string[];
  esRespuestaFinal: boolean;
  createdAt: string;
}

export interface PqrResumen {
  id: number;
  numeroRadicado: string | null;
  nombre: string;
  documento: string | null;
  email: string;
  telefono: string;
  descripcion: string;
  fotos: string[];
  estado: EstadoPqr;
  respuesta: string | null;
  respondidaEn: string | null;
  mensajes: PqrMensaje[];
  tipoTramite: number | null;
  causal: GrupoCausal | null;
  detalleCausal: number | null;
  tipoRespuesta: number | null;
  tipoNotificacion: number | null;
  fechaTrasladoSspd: string | null;
  createdAt: string;
  updatedAt: string;
  tercero: { id: number; tipoDocumento: string; numeroDocumento: string | null; nombre: string; email: string | null; telefono: string | null } | null;
  suscriptor: { id: number; codigo: string; nombre: string; direccion: string | null; barrioCat: { nombre: string } | null } | null;
}

export interface DetalleCausalSui {
  id: number;
  codigo: number;
  grupo: GrupoCausal;
  detalle: string;
  activo: boolean;
}

export interface CatalogoSui {
  detalles: DetalleCausalSui[];
  tiposTramite: Record<number, string>;
  tiposRespuesta: Record<number, string>;
  tiposNotificacion: Record<number, string>;
}

export interface ResumenSui {
  total: number;
  listas: number;
  incompletas: { id: number; numeroRadicado: string | null }[];
}

export interface PqrConfiguracionData {
  id: number;
  encabezadoRadicacion: string;
  encabezadoRespuesta: string;
  encabezadoCierre: string;
  updatedAt: string;
}

export interface PqrTrazabilidadItem {
  id: number;
  pqrId: number;
  autorNombre: string | null;
  texto: string;
  esRespuestaFinal: boolean;
  createdAt: string;
  pqr: { numeroRadicado: string | null; nombre: string };
}

export const pqrsApi = {
  listPaginado: (
    page: number,
    limit: number,
    filtros?: { estado?: EstadoPqr | ""; q?: string; fechaDesde?: string; fechaHasta?: string }
  ) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filtros?.estado) qs.set("estado", filtros.estado);
    if (filtros?.q) qs.set("q", filtros.q);
    if (filtros?.fechaDesde) qs.set("fechaDesde", filtros.fechaDesde);
    if (filtros?.fechaHasta) qs.set("fechaHasta", filtros.fechaHasta);
    return request<{ data: PqrResumen[]; total: number; page: number; limit: number }>(`/api/pqrs?${qs}`);
  },
  resumen: () => request<Record<EstadoPqr, number>>("/api/pqrs/resumen"),
  get: (id: number) => request<PqrResumen>(`/api/pqrs/${id}`),
  descargarConstancia: (id: number) => descargarArchivo(`/api/pqrs/${id}/constancia.pdf`, `constancia-pqr-${id}.pdf`, true),
  cambiarEstado: (id: number, estado: EstadoPqr) =>
    request<PqrResumen>(`/api/pqrs/${id}/estado`, { method: "PUT", body: JSON.stringify({ estado }) }),
  clasificar: (id: number, data: { tipoTramite?: number | null; causal?: GrupoCausal | null; detalleCausal?: number | null; fechaTrasladoSspd?: string | null }) =>
    request<PqrResumen>(`/api/pqrs/${id}/clasificacion`, { method: "PUT", body: JSON.stringify(data) }),
  enviarMensaje: (
    id: number,
    data: { texto: string; esRespuestaFinal: boolean; tipoRespuesta?: number; tipoNotificacion?: number; archivos: File[] }
  ) => {
    const fd = new FormData();
    fd.append("texto", data.texto);
    fd.append("esRespuestaFinal", String(data.esRespuestaFinal));
    if (data.tipoRespuesta) fd.append("tipoRespuesta", String(data.tipoRespuesta));
    if (data.tipoNotificacion) fd.append("tipoNotificacion", String(data.tipoNotificacion));
    for (const archivo of data.archivos) fd.append("archivos", archivo);
    return requestMultipart<PqrResumen>(`/api/pqrs/${id}/mensajes`, fd, "POST");
  },
  causalesSui: () => request<CatalogoSui>("/api/pqrs/sui/causales"),
  resumenSui: (anio: number, mes: number) => request<ResumenSui>(`/api/pqrs/sui/resumen?anio=${anio}&mes=${mes}`),
  descargarReporteSui: (anio: number, mes: number) =>
    descargarArchivo(`/api/pqrs/sui/reporte.csv?anio=${anio}&mes=${mes}`, `sui_pqr_${anio}${String(mes).padStart(2, "0")}.csv`),

  crearCausal: (data: { codigo: number; grupo: GrupoCausal; detalle: string }) =>
    request<DetalleCausalSui>("/api/pqrs/causales", { method: "POST", body: JSON.stringify(data) }),
  editarCausal: (id: number, data: { grupo?: GrupoCausal; detalle?: string; activo?: boolean }) =>
    request<DetalleCausalSui>(`/api/pqrs/causales/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  eliminarCausal: (id: number) => request<void>(`/api/pqrs/causales/${id}`, { method: "DELETE" }),

  configuracion: () => request<PqrConfiguracionData>("/api/pqrs/configuracion"),
  actualizarConfiguracion: (data: { encabezadoRadicacion: string; encabezadoRespuesta: string; encabezadoCierre: string }) =>
    request<PqrConfiguracionData>("/api/pqrs/configuracion", { method: "PUT", body: JSON.stringify(data) }),

  trazabilidad: (page: number, limit: number, filtros?: { fechaDesde?: string; fechaHasta?: string; funcionario?: string }) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filtros?.fechaDesde) qs.set("fechaDesde", filtros.fechaDesde);
    if (filtros?.fechaHasta) qs.set("fechaHasta", filtros.fechaHasta);
    if (filtros?.funcionario) qs.set("funcionario", filtros.funcionario);
    return request<{ data: PqrTrazabilidadItem[]; total: number; page: number; limit: number; funcionarios: string[] }>(
      `/api/pqrs/trazabilidad?${qs}`
    );
  },
  descargarTrazabilidadCsv: (filtros?: { fechaDesde?: string; fechaHasta?: string; funcionario?: string }) => {
    const qs = new URLSearchParams();
    if (filtros?.fechaDesde) qs.set("fechaDesde", filtros.fechaDesde);
    if (filtros?.fechaHasta) qs.set("fechaHasta", filtros.fechaHasta);
    if (filtros?.funcionario) qs.set("funcionario", filtros.funcionario);
    return descargarArchivo(`/api/pqrs/trazabilidad/reporte.csv?${qs}`, "trazabilidad_pqr.csv");
  },
};
