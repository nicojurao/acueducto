import { request, requestMultipart, descargarArchivo } from "../core.js";

export interface HistorialCambio {
  id: number;
  entidad: "medidor" | "suscriptor" | "usuario";
  entidadId: number;
  entidadNombre?: string;
  campo: string;
  valorAnterior: string | null;
  valorNuevo: string | null;
  usuarioId: number | null;
  usuario: { id: number; nombre: string } | null;
  fecha: string;
}

export interface InicioSesion {
  id: number;
  usuarioId: number;
  usuario: { id: number; nombre: string; nombreUsuario: string };
  ip: string | null;
  userAgent: string | null;
  dispositivo: string | null;
  ciudad: string | null;
  region: string | null;
  pais: string | null;
  fecha: string;
  ipNueva: boolean;
  dispositivoNuevo: boolean;
  activa: boolean;
  jti: string | null;
  revocada: boolean;
}

export interface IntentoLoginFallido {
  id: number;
  identificador: string;
  ip: string | null;
  userAgent: string | null;
  dispositivo: string | null;
  motivo: "usuario_no_existe" | "contrasena_incorrecta" | "cuenta_inactiva";
  fecha: string;
}

export interface Permiso {
  clave: string;
  nombre: string;
  descripcion: string;
}

export interface Rol {
  id: number;
  nombre: string;
  descripcion: string | null;
  esSistema: boolean;
  permisos: string[];
  usuarios: number;
  createdAt: string;
}

export interface Usuario {
  id: number;
  nombre: string;
  nombreUsuario: string;
  activo: boolean;
  cedula: string | null;
  celular: string | null;
  fechaNacimiento: string | null;
  foto: string | null;
  createdAt: string;
  rol: { id: number; nombre: string };
  permisos?: string[];
  sesionId?: string;
}

export const usuariosApi = {
  list: () => request<Usuario[]>("/api/usuarios"),
  create: (data: {
    nombre: string;
    nombreUsuario: string;
    password: string;
    rolId: number;
    cedula?: string;
    celular?: string;
    fechaNacimiento?: string;
    activo?: boolean;
    foto?: File | null;
  }) => {
    const fd = new FormData();
    fd.set("nombre", data.nombre);
    fd.set("nombreUsuario", data.nombreUsuario);
    fd.set("password", data.password);
    fd.set("rolId", String(data.rolId));
    if (data.cedula) fd.set("cedula", data.cedula);
    if (data.celular) fd.set("celular", data.celular);
    if (data.fechaNacimiento) fd.set("fechaNacimiento", data.fechaNacimiento);
    if (data.activo !== undefined) fd.set("activo", String(data.activo));
    if (data.foto) fd.set("foto", data.foto);
    return requestMultipart<Usuario>("/api/usuarios", fd, "POST");
  },
  update: (
    id: number,
    data: {
      nombre?: string;
      rolId?: number;
      activo?: boolean;
      password?: string;
      cedula?: string | null;
      celular?: string | null;
      fechaNacimiento?: string | null;
      foto?: File | null;
      quitarFoto?: boolean;
    }
  ) => {
    const fd = new FormData();
    if (data.nombre !== undefined) fd.set("nombre", data.nombre);
    if (data.rolId !== undefined) fd.set("rolId", String(data.rolId));
    if (data.activo !== undefined) fd.set("activo", String(data.activo));
    if (data.password) fd.set("password", data.password);
    if (data.cedula !== undefined) fd.set("cedula", data.cedula ?? "");
    if (data.celular !== undefined) fd.set("celular", data.celular ?? "");
    if (data.fechaNacimiento !== undefined) fd.set("fechaNacimiento", data.fechaNacimiento ?? "");
    if (data.foto) fd.set("foto", data.foto);
    if (data.quitarFoto) fd.set("quitarFoto", "true");
    return requestMultipart<Usuario>(`/api/usuarios/${id}`, fd, "PUT");
  },
  remove: (id: number) => request<void>(`/api/usuarios/${id}`, { method: "DELETE" }),
};

export const rolesApi = {
  list: () => request<Rol[]>("/api/roles"),
  permisos: () => request<Permiso[]>("/api/roles/permisos"),
  create: (data: { nombre: string; descripcion?: string; permisos: string[] }) =>
    request<Rol>("/api/roles", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: { nombre?: string; descripcion?: string; permisos?: string[] }) =>
    request<Rol>(`/api/roles/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id: number) => request<void>(`/api/roles/${id}`, { method: "DELETE" }),
};

export const historialApi = {
  porEntidad: (entidad: "medidor" | "suscriptor", entidadId: number) =>
    request<HistorialCambio[]>(`/api/historial/${entidad}/${entidadId}`),
  listPaginado: (
    page: number,
    limit: number,
    filtros?: { entidad?: string; usuarioId?: number; desde?: string; hasta?: string; campo?: string }
  ) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filtros?.entidad) qs.set("entidad", filtros.entidad);
    if (filtros?.usuarioId) qs.set("usuarioId", String(filtros.usuarioId));
    if (filtros?.desde) qs.set("desde", filtros.desde);
    if (filtros?.hasta) qs.set("hasta", filtros.hasta);
    if (filtros?.campo) qs.set("campo", filtros.campo);
    return request<{ data: HistorialCambio[]; total: number; page: number; limit: number }>(`/api/historial?${qs}`);
  },
};

export const auditoriaApi = {
  listPaginado: (page: number, limit: number, filtros?: { usuarioId?: number; estado?: "activa" | "expirada" | "cerrada" }) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filtros?.usuarioId) qs.set("usuarioId", String(filtros.usuarioId));
    if (filtros?.estado) qs.set("estado", filtros.estado);
    return request<{ data: InicioSesion[]; total: number; page: number; limit: number }>(`/api/auditoria?${qs}`);
  },
  cambios: (sesionId: number) => request<HistorialCambio[]>(`/api/auditoria/${sesionId}/cambios`),
  revocar: (sesionId: number) => request<InicioSesion>(`/api/auditoria/${sesionId}/revocar`, { method: "PUT" }),
  borrarCerradas: () => request<{ eliminadas: number }>(`/api/auditoria/cerradas`, { method: "DELETE" }),
  fallidosPaginado: (page: number, limit: number, identificador?: string) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (identificador) qs.set("identificador", identificador);
    return request<{ data: IntentoLoginFallido[]; total: number; page: number; limit: number }>(
      `/api/auditoria/fallidos?${qs}`
    );
  },
  export: () => descargarArchivo(`/api/auditoria/export`, `auditoria-${new Date().toISOString().slice(0, 10)}.xlsx`),
};

export const adminApi = {
  almacenamiento: () =>
    request<{
      actual: { tamanoBdBytes: string; tamanoMinioBytes: string };
      historial: { fecha: string; tamanoBdBytes: string; tamanoMinioBytes: string }[];
    }>("/api/admin/almacenamiento"),
  // Backup en 2 pasos: iniciar() arranca la compresión en el backend (a un temporal en disco)
  // y responde al toque con un id; estado() se usa para hacer polling del progreso mientras
  // comprime; descargar() solo funciona cuando fase="listo" y ya trae Content-Length real
  // (barra de progreso exacta en la descarga, ver descargarArchivo).
  iniciarBackupPostgres: () => request<{ id: string }>("/api/admin/backup/postgres/iniciar", { method: "POST" }),
  iniciarBackupMinio: () => request<{ id: string }>("/api/admin/backup/minio/iniciar", { method: "POST" }),
  estadoBackup: (id: string) =>
    request<{
      fase: "comprimiendo" | "listo" | "error";
      bytesProcesados: number;
      bytesTotalAprox: number;
      tamanoFinal: number | null;
      error: string | null;
    }>(`/api/admin/backup/${id}/estado`),
  descargarBackup: (id: string, nombrePorDefecto: string, onProgress?: (bytesRecibidos: number, bytesTotal: number | null) => void) =>
    descargarArchivo(`/api/admin/backup/${id}/descargar`, nombrePorDefecto, false, onProgress),
};
