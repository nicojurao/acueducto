import { request, requestMultipart } from "../core.js";
import type { Usuario } from "./administracion.js";

export const authApi = {
  // "identificador" es la cédula (usuarios normales) o el nombre de usuario (ej. "admin").
  login: (identificador: string, password: string) =>
    request<{ token: string; usuario: Usuario }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identificador, password }),
    }),
  me: () => request<Usuario>("/api/auth/me"),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  actualizarPerfil: (data: {
    nombre?: string;
    nombreUsuario?: string;
    cedula?: string | null;
    celular?: string | null;
    fechaNacimiento?: string | null;
    password?: string;
    foto?: File | null;
    quitarFoto?: boolean;
  }) => {
    const fd = new FormData();
    if (data.nombre !== undefined) fd.set("nombre", data.nombre);
    if (data.nombreUsuario !== undefined) fd.set("nombreUsuario", data.nombreUsuario);
    if (data.cedula !== undefined) fd.set("cedula", data.cedula ?? "");
    if (data.celular !== undefined) fd.set("celular", data.celular ?? "");
    if (data.fechaNacimiento !== undefined) fd.set("fechaNacimiento", data.fechaNacimiento ?? "");
    if (data.password) fd.set("password", data.password);
    if (data.foto) fd.set("foto", data.foto);
    if (data.quitarFoto) fd.set("quitarFoto", "true");
    return requestMultipart<Usuario>("/api/auth/perfil", fd, "PUT");
  },
};
