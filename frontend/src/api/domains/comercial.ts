import { request, requestMultipart, descargarArchivo } from "../core.js";

// Código interno de estrato (el que se usa para agrupar en gráficas/filtros) → etiqueta legible.
// Catálogo editable desde la pestaña "Barrios y estratos" (ver estratosApi); este objeto arranca
// vacío y se llena en cuanto arranca la sesión (ver cargarEstratos() en AuthContext), mutando sus
// propiedades en el lugar para que todos los módulos que ya lo importaron vean el valor actualizado
// sin tener que convertir cada uno en un fetch propio.
export const ESTRATO_LABELS: Record<string, string> = {};

export interface Estrato {
  id: number;
  codigo: string;
  etiqueta: string;
  suscriptores: number;
}

export async function cargarEstratos(): Promise<Estrato[]> {
  const estratos = await request<Estrato[]>("/api/estratos");
  for (const clave of Object.keys(ESTRATO_LABELS)) delete ESTRATO_LABELS[clave];
  for (const e of estratos) ESTRATO_LABELS[e.codigo] = e.etiqueta;
  return estratos;
}

export const ESTADO_FACTURACION_LABELS: Record<string, string> = {
  sin_medidor: "Sin medidor",
  instalado_prueba: "Instalado",
  facturando: "Facturando por medición",
  inactivo: "Medidor inactivo / dañado",
};

export const ESTADO_FACTURACION_COLORS: Record<string, string> = {
  sin_medidor: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  instalado_prueba: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  facturando: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  inactivo: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

// Colores sólidos (hex) para el <select> de estado de facturación: los navegadores dibujan el
// menú desplegable de <option> con su propio render nativo (casi siempre en modo claro,
// independiente del tema oscuro de la app), así que las clases translúcidas de arriba se veían
// con poco contraste ahí. Estos se usan como `style` inline en el select y cada <option>.
export const ESTADO_FACTURACION_HEX: Record<string, { bg: string; text: string }> = {
  sin_medidor: { bg: "#e2e8f0", text: "#334155" },
  instalado_prueba: { bg: "#fde68a", text: "#78350f" },
  facturando: { bg: "#a7f3d0", text: "#065f46" },
  inactivo: { bg: "#fecaca", text: "#7f1d1d" },
};

// Estado del predio en sí (no del medidor ni de la facturación): un predio inactivo
// (lote baldío, demolido, etc.) no puede tener medidor asignado.
export const ESTADO_PREDIO_LABELS: Record<string, string> = {
  activo: "Predio activo",
  inactivo: "Predio inactivo",
};

export const ESTADO_PREDIO_COLORS: Record<string, string> = {
  activo: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  inactivo: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

export const ESTADO_PREDIO_HEX: Record<string, { bg: string; text: string }> = {
  activo: { bg: "#a7f3d0", text: "#065f46" },
  inactivo: { bg: "#e2e8f0", text: "#334155" },
};

export interface Suscriptor {
  id: number;
  nombre: string;
  codigo: string;
  ruta: string | null;
  identificacion?: string | null;
  barrioId?: number | null;
  barrioCat?: Barrio | null;
  direccion?: string | null;
  direccionComercial?: string | null;
  estratoId?: number | null;
  estratoCat?: Estrato | null;
  latitud?: number | null;
  longitud?: number | null;
  estadoFacturacion: "sin_medidor" | "instalado_prueba" | "facturando" | "inactivo";
  estadoPredio: "activo" | "inactivo";
  medidores?: Medidor[];
  cotitularDe?: {
    medidor: { id: number; suscriptor: Suscriptor; cotitulares: { suscriptorId: number }[] };
  } | null;
}

export interface Medidor {
  id: number;
  suscriptorId: number | null;
  serial: string | null;
  estado: "en_bodega" | "instalado";
  condicion: "bueno" | "danado";
  tipo: string | null;
  clase: string | null;
  certificado: string | null;
  loteId: number | null;
  actaCalibracionUrl: string | null;
  fechaInstalacion: string | null;
  fechaFabricacion: string | null;
  fechaCertificacion: string | null;
  lecturaInicial: string | null;
  activo: boolean;
  suscriptor?: Suscriptor | null;
  cotitulares?: { suscriptor: Suscriptor }[];
  marcaCat?: MarcaMedidor | null;
  modeloCat?: ModeloMedidor | null;
  diametroCat?: DiametroMedidor | null;
  lote?: Lote | null;
}

export interface Lote {
  id: number;
  serialInicial: string;
  serialFinal: string;
  fechaCompra: string | null;
  observaciones: string | null;
  medidores?: number;
}

export interface MarcaMedidor {
  id: number;
  nombre: string;
  modelos?: number;
}

export interface ModeloMedidor {
  id: number;
  nombre: string;
  tipo: string;
  clasePrecision: string | null;
  varianteId: number | null;
  varianteCat?: VarianteMedidor | null;
  marcaId: number;
  marca?: MarcaMedidor;
  diametros?: DiametroMedidor[];
}

export interface VarianteMedidor {
  id: number;
  codigo: string;
  etiqueta: string;
  tipo: string;
}

export interface DiametroMedidor {
  id: number;
  valor: string;
}

export interface ActaInstalacion {
  id: number;
  medidorId: number;
  suscriptorId: number;
  serial: string;
  fechaInstalacion: string;
  fechaRetiro: string | null;
  instaladoPor: string;
  usuarioId: number | null;
  observaciones: string | null;
  fotos: string[];
  actaFirmadaUrl: string | null;
  createdAt: string;
  suscriptor?: Suscriptor;
  medidor?: Medidor;
}

export interface LecturaPendiente {
  medidorId: number;
  suscriptor: Suscriptor;
  lecturaAnteriorValor: string | null;
  lectura: {
    id: number;
    valorLectura: string;
    consumo: string;
    observaciones: string | null;
    fotoUrl: string | null;
    capturadoPor: { nombre: string } | null;
  } | null;
  novedad: { id: number; motivo: string; fotos: string[] } | null;
}

export interface PuntoAforo {
  id: number;
  nombre: string;
  descripcion: string | null;
  latitud: number | null;
  longitud: number | null;
  activo: boolean;
  createdAt: string;
  registros?: number;
}

export interface Aforo {
  id: number;
  puntoAforoId: number;
  puntoAforo?: PuntoAforo;
  fecha: string;
  metodo: "volumetrico" | "flotador";
  volumenLitros: string | null;
  tiempoSegundos: string | null;
  tiempos: number[];
  distanciaMetros: string | null;
  anchoAltaM: string | null;
  profundidadesAltaM: number[];
  anchoBajaM: string | null;
  profundidadesBajaM: number[];
  areaAltaM2: string | null;
  areaBajaM2: string | null;
  areaM2: string | null;
  caudalLps: string;
  observaciones: string | null;
  fotoUrl: string | null;
  latitud: number | null;
  longitud: number | null;
  capturadoPor: { nombre: string } | null;
  createdAt: string;
}

export interface AforoKpis {
  meses: number;
  totalPuntos: number;
  puntosActivos: number;
  totalRegistros: number;
  caudalPromedio: number;
  ultimoCaudal: number | null;
  ultimoPunto: string | null;
  ultimaFecha: string | null;
  nombresPuntos: string[];
  resumenPorPunto: {
    puntoAforoId: number;
    nombre: string;
    ultimoCaudal: number | null;
    ultimaFecha: string | null;
    promedio: number;
    registros: number;
  }[];
  alertasCaudalBajo: {
    puntoAforoId: number;
    nombre: string;
    ultimoCaudal: number;
    promedio: number;
    ultimaFecha: string | null;
  }[];
  tendencia: Record<string, number | string>[];
}

export interface Barrio {
  id: number;
  nombre: string;
  suscriptores: number;
}

export const suscriptoresApi = {
  list: () => request<Suscriptor[]>("/api/suscriptores"),
  listPaginado: (
    page: number,
    limit: number,
    filtros?: {
      q?: string;
      estadoFacturacion?: string;
      barrioId?: number;
      estratoId?: number;
      estadoPredio?: string;
      conCotitular?: boolean;
      sort?: string;
      dir?: "asc" | "desc";
    }
  ) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filtros?.q) qs.set("q", filtros.q);
    if (filtros?.estadoFacturacion) qs.set("estadoFacturacion", filtros.estadoFacturacion);
    if (filtros?.barrioId) qs.set("barrioId", String(filtros.barrioId));
    if (filtros?.estratoId) qs.set("estratoId", String(filtros.estratoId));
    if (filtros?.estadoPredio) qs.set("estadoPredio", filtros.estadoPredio);
    if (filtros?.conCotitular) qs.set("conCotitular", "1");
    if (filtros?.sort) qs.set("sort", filtros.sort);
    if (filtros?.dir) qs.set("dir", filtros.dir);
    return request<{ data: Suscriptor[]; total: number; page: number; limit: number }>(`/api/suscriptores?${qs}`);
  },
  barrios: () => request<{ id: number; nombre: string }[]>("/api/suscriptores/barrios"),
  get: (id: number) => request<Suscriptor>(`/api/suscriptores/${id}`),
  update: (id: number, data: Partial<Suscriptor>) =>
    request<Suscriptor>(`/api/suscriptores/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  actualizarEstadoFacturacion: (id: number, estadoFacturacion: Suscriptor["estadoFacturacion"]) =>
    request<Suscriptor>(`/api/suscriptores/${id}/estado-facturacion`, {
      method: "PUT",
      body: JSON.stringify({ estadoFacturacion }),
    }),
  remove: (id: number) => request<void>(`/api/suscriptores/${id}`, { method: "DELETE" }),
  import: (file: File) => {
    const formData = new FormData();
    formData.append("archivo", file);
    return requestMultipart<{ creados: number; actualizados: number; omitidos: number; reporteBase64: string }>(
      "/api/suscriptores/import",
      formData
    );
  },
  validarImport: (file: File) => {
    const formData = new FormData();
    formData.append("archivo", file);
    return requestMultipart<
      | { ok: true; totalFilas: number; filasConProblemas: 0 }
      | { ok: false; totalFilas: number; filasConProblemas: number; reporteBase64: string }
    >("/api/suscriptores/import/validar", formData);
  },
  export: (ids?: number[]) => {
    const qs = ids && ids.length > 0 ? `?ids=${ids.join(",")}` : "";
    return descargarArchivo(`/api/suscriptores/export${qs}`, "plantilla_suscriptores.xlsx");
  },
};

export const barriosApi = {
  list: () => request<Barrio[]>("/api/barrios"),
  create: (nombre: string) => request<Barrio>("/api/barrios", { method: "POST", body: JSON.stringify({ nombre }) }),
  update: (id: number, nombre: string) => request<Barrio>(`/api/barrios/${id}`, { method: "PUT", body: JSON.stringify({ nombre }) }),
  remove: (id: number) => request<void>(`/api/barrios/${id}`, { method: "DELETE" }),
};

export const estratosApi = {
  list: () => request<Estrato[]>("/api/estratos"),
  create: (codigo: string, etiqueta: string) =>
    request<Estrato>("/api/estratos", { method: "POST", body: JSON.stringify({ codigo, etiqueta }) }),
  update: (id: number, codigo: string, etiqueta: string) =>
    request<Estrato>(`/api/estratos/${id}`, { method: "PUT", body: JSON.stringify({ codigo, etiqueta }) }),
  remove: (id: number) => request<void>(`/api/estratos/${id}`, { method: "DELETE" }),
};

export const medidoresApi = {
  list: (params?: { ruta?: string; activo?: boolean; estado?: "en_bodega" | "instalado" }) => {
    const qs = new URLSearchParams();
    if (params?.ruta) qs.set("ruta", params.ruta);
    if (params?.activo !== undefined) qs.set("activo", String(params.activo));
    if (params?.estado) qs.set("estado", params.estado);
    return request<Medidor[]>(`/api/medidores?${qs}`);
  },
  listPaginado: (
    page: number,
    limit: number,
    filtros?: {
      q?: string;
      estado?: string;
      marca?: string;
      condicion?: string;
      modeloId?: number;
      diametroId?: number;
      tipo?: string;
      sort?: string;
      dir?: "asc" | "desc";
    }
  ) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filtros?.q) qs.set("q", filtros.q);
    if (filtros?.estado) qs.set("estado", filtros.estado);
    if (filtros?.marca) qs.set("marca", filtros.marca);
    if (filtros?.condicion) qs.set("condicion", filtros.condicion);
    if (filtros?.modeloId) qs.set("modeloId", String(filtros.modeloId));
    if (filtros?.diametroId) qs.set("diametroId", String(filtros.diametroId));
    if (filtros?.tipo) qs.set("tipo", filtros.tipo);
    if (filtros?.sort) qs.set("sort", filtros.sort);
    if (filtros?.dir) qs.set("dir", filtros.dir);
    return request<{ data: Medidor[]; total: number; page: number; limit: number }>(`/api/medidores?${qs}`);
  },
  create: (data: Partial<Medidor> & { marcaId?: number; modeloId?: number; diametroId?: number }) =>
    request<Medidor>("/api/medidores", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Medidor> & { marcaId?: number | null; modeloId?: number | null; diametroId?: number | null }) =>
    request<Medidor>(`/api/medidores/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id: number) => request<void>(`/api/medidores/${id}`, { method: "DELETE" }),
  export: (ids?: number[]) => {
    const qs = ids && ids.length > 0 ? `?ids=${ids.join(",")}` : "";
    return descargarArchivo(`/api/medidores/export${qs}`, "plantilla_medidores.xlsx");
  },
  import: (file: File) => {
    const formData = new FormData();
    formData.append("archivo", file);
    return requestMultipart<{ creados: number; actualizados: number; omitidos: number; reporteBase64: string }>(
      "/api/medidores/import",
      formData
    );
  },
  validarImport: (file: File) => {
    const formData = new FormData();
    formData.append("archivo", file);
    return requestMultipart<
      | { ok: true; totalFilas: number; filasConProblemas: 0 }
      | { ok: false; totalFilas: number; filasConProblemas: number; reporteBase64: string }
    >("/api/medidores/import/validar", formData);
  },
  subirActaCalibracion: (id: number, archivo: File) => {
    const formData = new FormData();
    formData.append("archivo", archivo);
    return requestMultipart<Medidor>(`/api/medidores/${id}/acta-calibracion`, formData);
  },
  quitarActaCalibracion: (id: number) => request<Medidor>(`/api/medidores/${id}/acta-calibracion`, { method: "DELETE" }),
  agregarCotitular: (medidorId: number, nuid: string) =>
    request<{ suscriptor: Suscriptor }>(`/api/medidores/${medidorId}/cotitulares`, {
      method: "POST",
      body: JSON.stringify({ nuid }),
    }),
  quitarCotitular: (medidorId: number, suscriptorId: number) =>
    request<void>(`/api/medidores/${medidorId}/cotitulares/${suscriptorId}`, { method: "DELETE" }),
};

export const lotesApi = {
  list: () => request<Lote[]>("/api/lotes"),
  create: (data: { serialInicial: string; serialFinal: string; fechaCompra?: string; observaciones?: string }) =>
    request<Lote>("/api/lotes", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: { serialInicial: string; serialFinal: string; fechaCompra?: string; observaciones?: string }) =>
    request<Lote>(`/api/lotes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id: number) => request<void>(`/api/lotes/${id}`, { method: "DELETE" }),
};

export const marcasApi = {
  list: () => request<MarcaMedidor[]>("/api/marcas"),
  create: (nombre: string) => request<MarcaMedidor>("/api/marcas", { method: "POST", body: JSON.stringify({ nombre }) }),
  update: (id: number, nombre: string) => request<MarcaMedidor>(`/api/marcas/${id}`, { method: "PUT", body: JSON.stringify({ nombre }) }),
  remove: (id: number) => request<void>(`/api/marcas/${id}`, { method: "DELETE" }),
};

export const modelosApi = {
  list: (marcaId?: number) => {
    const qs = new URLSearchParams();
    if (marcaId) qs.set("marcaId", String(marcaId));
    return request<ModeloMedidor[]>(`/api/modelos?${qs}`);
  },
  create: (data: { nombre: string; tipo: string; marcaId: number; clasePrecision?: string; varianteId?: number }) =>
    request<ModeloMedidor>("/api/modelos", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: { nombre: string; tipo: string; marcaId: number; clasePrecision?: string; varianteId?: number }) =>
    request<ModeloMedidor>(`/api/modelos/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id: number) => request<void>(`/api/modelos/${id}`, { method: "DELETE" }),
  setDiametros: (id: number, diametroIds: number[]) =>
    request<ModeloMedidor>(`/api/modelos/${id}/diametros`, { method: "PUT", body: JSON.stringify({ diametroIds }) }),
};

export const variantesApi = {
  list: (tipo?: string) => {
    const qs = new URLSearchParams();
    if (tipo) qs.set("tipo", tipo);
    return request<VarianteMedidor[]>(`/api/variantes?${qs}`);
  },
  create: (data: { codigo: string; etiqueta: string; tipo: string }) =>
    request<VarianteMedidor>("/api/variantes", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: { codigo: string; etiqueta: string; tipo: string }) =>
    request<VarianteMedidor>(`/api/variantes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id: number) => request<void>(`/api/variantes/${id}`, { method: "DELETE" }),
};

export const diametrosApi = {
  list: () => request<DiametroMedidor[]>("/api/diametros"),
  create: (valor: string) => request<DiametroMedidor>("/api/diametros", { method: "POST", body: JSON.stringify({ valor }) }),
  update: (id: number, valor: string) => request<DiametroMedidor>(`/api/diametros/${id}`, { method: "PUT", body: JSON.stringify({ valor }) }),
  remove: (id: number) => request<void>(`/api/diametros/${id}`, { method: "DELETE" }),
};

export const actasApi = {
  instaladores: () => request<{ id: number; nombre: string }[]>("/api/actas/instaladores"),
  list: () => request<ActaInstalacion[]>("/api/actas"),
  listBySuscriptor: (suscriptorId: number) => request<ActaInstalacion[]>(`/api/actas?suscriptorId=${suscriptorId}`),
  get: (id: number) => request<ActaInstalacion>(`/api/actas/${id}`),
  create: (data: {
    medidorId: number;
    suscriptorId: number;
    fechaInstalacion: string;
    instaladoPor: string;
    usuarioId?: number;
    observaciones?: string;
    fotos: File[];
  }) => {
    const formData = new FormData();
    formData.append("medidorId", String(data.medidorId));
    formData.append("suscriptorId", String(data.suscriptorId));
    formData.append("fechaInstalacion", data.fechaInstalacion);
    formData.append("instaladoPor", data.instaladoPor);
    if (data.usuarioId) formData.append("usuarioId", String(data.usuarioId));
    if (data.observaciones) formData.append("observaciones", data.observaciones);
    for (const foto of data.fotos) formData.append("fotos", foto);
    return requestMultipart<ActaInstalacion>("/api/actas", formData);
  },
  update: (
    id: number,
    data: {
      fechaInstalacion: string;
      instaladoPor: string;
      usuarioId?: number;
      observaciones?: string;
      fotosNuevas?: File[];
      fotosARemover?: string[];
      fechaRetiro?: string;
    }
  ) => {
    const formData = new FormData();
    formData.append("fechaInstalacion", data.fechaInstalacion);
    formData.append("instaladoPor", data.instaladoPor);
    if (data.usuarioId) formData.append("usuarioId", String(data.usuarioId));
    if (data.fechaRetiro) formData.append("fechaRetiro", data.fechaRetiro);
    if (data.observaciones) formData.append("observaciones", data.observaciones);
    for (const foto of data.fotosNuevas ?? []) formData.append("fotos", foto);
    for (const foto of data.fotosARemover ?? []) formData.append("fotosARemover", foto);
    return requestMultipart<ActaInstalacion>(`/api/actas/${id}`, formData, "PUT");
  },
  remove: (id: number) => request<void>(`/api/actas/${id}`, { method: "DELETE" }),
  borrarDefinitivo: (id: number) => request<void>(`/api/actas/${id}/definitivo`, { method: "DELETE" }),
  subirFirmada: (id: number, archivo: File) => {
    const formData = new FormData();
    formData.append("archivo", archivo);
    return requestMultipart<ActaInstalacion>(`/api/actas/${id}/firmada`, formData);
  },
  quitarFirmada: (id: number) => request<ActaInstalacion>(`/api/actas/${id}/firmada`, { method: "DELETE" }),
};

export const puntosAforoApi = {
  list: () => request<PuntoAforo[]>("/api/puntos-aforo"),
  create: (data: { nombre: string; descripcion?: string; latitud?: number; longitud?: number }) =>
    request<PuntoAforo>("/api/puntos-aforo", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: { nombre?: string; descripcion?: string | null; latitud?: number | null; longitud?: number | null; activo?: boolean }) =>
    request<PuntoAforo>(`/api/puntos-aforo/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id: number) => request<void>(`/api/puntos-aforo/${id}`, { method: "DELETE" }),
};

export const aforosApi = {
  list: (puntoAforoId?: number) => {
    const qs = new URLSearchParams();
    if (puntoAforoId) qs.set("puntoAforoId", String(puntoAforoId));
    return request<Aforo[]>(`/api/aforos?${qs}`);
  },
  listPaginado: (page: number, limit: number, puntoAforoId?: number) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (puntoAforoId) qs.set("puntoAforoId", String(puntoAforoId));
    return request<{ data: Aforo[]; total: number; page: number; limit: number }>(`/api/aforos?${qs}`);
  },
  create: (data: {
    puntoAforoId: number;
    fecha: string;
    metodo: "volumetrico" | "flotador";
    volumenLitros?: number;
    tiempoSegundos?: number;
    tiempos?: number[];
    distanciaMetros?: number;
    anchoAltaM?: number;
    profundidadesAltaM?: number[];
    anchoBajaM?: number;
    profundidadesBajaM?: number[];
    observaciones?: string;
    latitud?: number;
    longitud?: number;
    foto?: File | null;
  }) => {
    const fd = new FormData();
    fd.set("puntoAforoId", String(data.puntoAforoId));
    fd.set("fecha", data.fecha);
    fd.set("metodo", data.metodo);
    if (data.volumenLitros !== undefined) fd.set("volumenLitros", String(data.volumenLitros));
    if (data.tiempoSegundos !== undefined) fd.set("tiempoSegundos", String(data.tiempoSegundos));
    for (const t of data.tiempos ?? []) fd.append("tiempos", String(t));
    if (data.distanciaMetros !== undefined) fd.set("distanciaMetros", String(data.distanciaMetros));
    if (data.anchoAltaM !== undefined) fd.set("anchoAltaM", String(data.anchoAltaM));
    for (const p of data.profundidadesAltaM ?? []) fd.append("profundidadesAltaM", String(p));
    if (data.anchoBajaM !== undefined) fd.set("anchoBajaM", String(data.anchoBajaM));
    for (const p of data.profundidadesBajaM ?? []) fd.append("profundidadesBajaM", String(p));
    if (data.observaciones) fd.set("observaciones", data.observaciones);
    if (data.latitud !== undefined) fd.set("latitud", String(data.latitud));
    if (data.longitud !== undefined) fd.set("longitud", String(data.longitud));
    if (data.foto) fd.set("foto", data.foto);
    return requestMultipart<Aforo>("/api/aforos", fd, "POST");
  },
  remove: (id: number) => request<void>(`/api/aforos/${id}`, { method: "DELETE" }),
  verPdf: (id: number) => descargarArchivo(`/api/aforos/${id}/pdf`, `aforo-${id}.pdf`, true),
  kpis: (meses?: number) => request<AforoKpis>(`/api/aforos/kpis${meses ? `?meses=${meses}` : ""}`),
};

export const lecturasApi = {
  resumen: (periodo: string) => request<{ total: number; tomadas: number }>(`/api/lecturas/resumen?periodo=${periodo}`),
  listByPeriodo: (periodo: string, ruta?: string) => {
    const qs = new URLSearchParams({ periodo });
    if (ruta) qs.set("ruta", ruta);
    return request<LecturaPendiente[]>(`/api/lecturas?${qs}`);
  },
  listPaginado: (periodo: string, page: number, limit: number, filtros?: { estado?: "pendientes" | "tomadas"; q?: string }) => {
    const qs = new URLSearchParams({ periodo, page: String(page), limit: String(limit) });
    if (filtros?.estado) qs.set("estado", filtros.estado);
    if (filtros?.q) qs.set("q", filtros.q);
    return request<{ data: LecturaPendiente[]; total: number; page: number; limit: number }>(`/api/lecturas?${qs}`);
  },
  create: (data: {
    medidorId: number;
    periodo: string;
    valorLectura: number;
    observaciones?: string;
    foto: File;
    latitud?: number;
    longitud?: number;
  }) => {
    const formData = new FormData();
    formData.append("medidorId", String(data.medidorId));
    formData.append("periodo", data.periodo);
    formData.append("valorLectura", String(data.valorLectura));
    if (data.observaciones) formData.append("observaciones", data.observaciones);
    if (data.latitud !== undefined) formData.append("latitud", String(data.latitud));
    if (data.longitud !== undefined) formData.append("longitud", String(data.longitud));
    formData.append("foto", data.foto);
    // Timeout corto: en conexiones lentas/inestables (campo), es mejor caer rápido al modo
    // offline (ver frontend/src/lib/offlineQueue.ts) que dejar al usuario esperando indefinido.
    return requestMultipart<{ id: number; fotoUrl: string | null }>("/api/lecturas", formData, "POST", 15000);
  },
  update: (id: number, data: { valorLectura: number; observaciones?: string; foto?: File; quitarFoto?: boolean }) => {
    const formData = new FormData();
    formData.append("valorLectura", String(data.valorLectura));
    if (data.observaciones) formData.append("observaciones", data.observaciones);
    if (data.foto) formData.append("foto", data.foto);
    if (data.quitarFoto) formData.append("quitarFoto", "true");
    return requestMultipart<{ id: number; fotoUrl: string | null }>(`/api/lecturas/${id}`, formData, "PUT");
  },
  remove: (id: number) => request<void>(`/api/lecturas/${id}`, { method: "DELETE" }),
  marcarNovedad: (data: { medidorId: number; periodo: string; motivo: string; fotos?: File[] }) => {
    const formData = new FormData();
    formData.append("medidorId", String(data.medidorId));
    formData.append("periodo", data.periodo);
    formData.append("motivo", data.motivo);
    for (const foto of data.fotos ?? []) formData.append("fotos", foto);
    return requestMultipart<{ id: number; motivo: string; fotos: string[] }>("/api/lecturas/novedad", formData);
  },
  quitarNovedad: (id: number) => request<void>(`/api/lecturas/novedad/${id}`, { method: "DELETE" }),
  obtenerNovedad: (id: number) =>
    request<{ id: number; periodo: string; motivo: string; fotos: string[]; medidorId: number }>(`/api/lecturas/novedad/${id}`),
  actualizarNovedad: (id: number, data: { motivo: string; fotosNuevas?: File[]; fotosARemover?: string[] }) => {
    const formData = new FormData();
    formData.append("motivo", data.motivo);
    for (const foto of data.fotosNuevas ?? []) formData.append("fotos", foto);
    for (const foto of data.fotosARemover ?? []) formData.append("fotosARemover", foto);
    return requestMultipart<{ id: number; motivo: string; fotos: string[] }>(`/api/lecturas/novedad/${id}`, formData, "PUT");
  },
};

export const reportesApi = {
  resumenMensual: (desde?: string, hasta?: string) => {
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    return request<{ mes: string; usuarios: number; consumo: number }[]>(`/api/reportes/resumen-mensual?${qs}`);
  },
  consumoSuscriptor: (id: number) =>
    request<
      {
        periodo: string;
        valorLectura: number | null;
        consumo: number;
        sinLectura: boolean;
        motivo?: string;
        novedadId?: number;
        fotos?: string[];
        medidorId?: number;
        lecturaId?: number;
        fotoUrl?: string | null;
        latitud?: number | null;
        longitud?: number | null;
        fechaRegistro?: string;
        capturadoPor?: string | null;
      }[]
    >(`/api/reportes/consumo-suscriptor/${id}`),
  consumoSuscriptorPdf: (id: number, meses?: number) => {
    const qs = meses ? `?meses=${meses}` : "";
    return descargarArchivo(`/api/reportes/consumo-suscriptor/${id}/pdf${qs}`, `informe-suscriptor-${id}.pdf`, true);
  },
  mapaConsumo: (periodo: string) =>
    request<{ id: number; latitud: number; longitud: number; consumo: number }[]>(`/api/reportes/mapa-consumo?periodo=${periodo}`),
  porRuta: (periodo: string) => request<{ ruta: string; usuarios: number; consumo: number }[]>(`/api/reportes/por-ruta?periodo=${periodo}`),
  porBarrio: (periodo: string, estratos?: string[]) => {
    const qs = new URLSearchParams({ periodo });
    if (estratos && estratos.length > 0) qs.set("estratos", estratos.join(","));
    return request<{ barrio: string; barrioId: number | null; usuarios: number; consumo: number }[]>(`/api/reportes/por-barrio?${qs}`);
  },
  porEstrato: (periodo: string) =>
    request<{ estrato: string; estratoId: number | null; usuarios: number; consumo: number }[]>(`/api/reportes/por-estrato?periodo=${periodo}`),
  exportLecturas: (periodo: string) => descargarArchivo(`/api/reportes/lecturas-excel?periodo=${periodo}`, `informe_lecturas_${periodo}.xlsx`),
  exportLecturasRango: (
    desde: string,
    hasta: string,
    filtros?: { estadoLectura?: "todas" | "tomadas" | "no_tomadas"; alcance?: "con_medidor" | "facturando" }
  ) => {
    const qs = new URLSearchParams({ desde, hasta });
    if (filtros?.estadoLectura) qs.set("estadoLectura", filtros.estadoLectura);
    if (filtros?.alcance) qs.set("alcance", filtros.alcance);
    return descargarArchivo(
      `/api/reportes/lecturas-excel?${qs}`,
      desde === hasta ? `informe_lecturas_${desde}.xlsx` : `informe_lecturas_${desde}_a_${hasta}.xlsx`
    );
  },
};

export const dashboardApi = {
  kpis: (periodo: string) =>
    request<{
      periodo: string;
      suscriptoresActivos: number;
      medidoresActivos: number;
      facturadosPorMedicion: number;
      consumoMesActual: number;
      promedioPorUsuario: number;
      promedioMesAnterior: number;
      lecturasPendientes: number;
      variacionMesAnterior: number | null;
      variacionAnioAnterior: number | null;
    }>(`/api/dashboard/kpis?periodo=${periodo}`),
  atipicos: (periodo: string) =>
    request<
      {
        medidorId: number;
        suscriptorId: number;
        codigo: string;
        nombre: string;
        consumoActual: number;
        promedioHistorico: number;
        desviacionPct: number;
      }[]
    >(`/api/dashboard/atipicos?periodo=${periodo}`),
  topConsumidores: (periodo: string, limit = 10, filtros?: { barrio?: number; estrato?: number }) => {
    const qs = new URLSearchParams({ periodo, limit: String(limit) });
    if (filtros?.barrio) qs.set("barrio", String(filtros.barrio));
    if (filtros?.estrato) qs.set("estrato", String(filtros.estrato));
    return request<{ codigo: string; nombre: string; consumo: number }[]>(`/api/dashboard/top-consumidores?${qs}`);
  },
  distribucionMedidores: () =>
    request<{
      porTipo: { tipo: string; cantidad: number }[];
      porDiametro: { diametro: string; cantidad: number }[];
    }>("/api/dashboard/distribucion-medidores"),
  tendenciaMultianio: () => request<{ anios: number[]; serie: Record<string, number>[] }>("/api/dashboard/tendencia-multianio"),
  estadosFacturacion: () => request<{ estado: string; cantidad: number }[]>("/api/dashboard/estados-facturacion"),
};
