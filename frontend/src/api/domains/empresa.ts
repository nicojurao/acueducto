import { request, requestMultipart } from "../core.js";

export interface EmpresaCompleta {
  id: number;
  nit: string;
  nitDv: string;
  nombre: string;
  nombreCorto: string;
  direccion: string;
  sitioWeb: string;
  email: string;
  telefonos: string;
  colorMarca: string;
  logoRuta: string | null;
  daneDepartamento: string;
  daneMunicipio: string;
  daneCentroPoblado: string;
  glnGs1: string;
  dominioOperativo: string;
  dominioPqrs: string;
  dominioCalidad: string;
  smtpHost: string;
  smtpPort: number | null;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  configuradoEn: string | null;
  updatedAt: string;
}

export type EmpresaParcial = Partial<Omit<EmpresaCompleta, "id" | "logoRuta" | "configuradoEn" | "updatedAt">>;

export const empresaApi = {
  obtener: () => request<EmpresaCompleta>("/api/admin/empresa"),
  guardar: (datos: EmpresaParcial) =>
    request<EmpresaCompleta>("/api/admin/empresa", { method: "PUT", body: JSON.stringify(datos) }),
  finalizar: () => request<EmpresaCompleta>("/api/admin/empresa/finalizar", { method: "POST" }),
  subirLogo: (logo: File) => {
    const fd = new FormData();
    fd.set("logo", logo);
    return requestMultipart<EmpresaCompleta>("/api/admin/empresa/logo", fd, "POST");
  },
};
