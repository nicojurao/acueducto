import { request } from "../core.js";

export interface CandidatoSuspension {
  id: number;
  codigo: string;
  nombre: string;
  facturasPendientes: number;
  saldoTotal: number;
}

export interface SuspensionItem {
  id: number;
  tipo: "mora" | "mutuo_acuerdo";
  motivo: string;
  mesesMoraAlCrear: number | null;
  textoAviso: string | null;
  estado: "pendiente" | "aprobada" | "ejecutada" | "reactivada" | "cancelada";
  fechaAprobacion: string | null;
  fechaEjecucion: string | null;
  fechaReactivacion: string | null;
  createdAt: string;
  suscriptor: { codigo: string; nombre: string };
  pqr: { numeroRadicado: string } | null;
  aprobadaPor: { nombre: string } | null;
  creadoPor: { nombre: string } | null;
}

export const suspensionesApi = {
  candidatos: () => request<CandidatoSuspension[]>("/api/suspensiones/candidatos"),
  listPaginado: (page: number, limit: number, filtros?: { suscriptorId?: number; estado?: string }) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filtros?.suscriptorId) qs.set("suscriptorId", String(filtros.suscriptorId));
    if (filtros?.estado) qs.set("estado", filtros.estado);
    return request<{ data: SuspensionItem[]; total: number; page: number; limit: number }>(`/api/suspensiones?${qs}`);
  },
  crear: (data: { suscriptorId: number; tipo: "mora" | "mutuo_acuerdo"; motivo: string; numeroRadicadoPqr?: string }) =>
    request<SuspensionItem>("/api/suspensiones", { method: "POST", body: JSON.stringify(data) }),
  aprobar: (id: number) => request<SuspensionItem>(`/api/suspensiones/${id}/aprobar`, { method: "POST" }),
  ejecutar: (id: number, valorCargoSuspension?: number) =>
    request<SuspensionItem>(`/api/suspensiones/${id}/ejecutar`, { method: "POST", body: JSON.stringify({ valorCargoSuspension }) }),
  reactivar: (id: number, valorCargoReconexion?: number) =>
    request<SuspensionItem>(`/api/suspensiones/${id}/reactivar`, { method: "POST", body: JSON.stringify({ valorCargoReconexion }) }),
  cancelar: (id: number) => request<void>(`/api/suspensiones/${id}/cancelar`, { method: "POST" }),
};
