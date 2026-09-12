import { request, requestMultipart, descargarArchivo } from "../core.js";

export interface TarifaEstratoItem {
  id: number;
  estratoId: number;
  estrato: { id: number; codigo: string; etiqueta: string };
  porcentaje: string;
}

export interface Tarifa {
  id: number;
  vigenciaDesde: string;
  cma: string;
  cmo: string;
  cmi: string;
  cmt: string;
  rangoBasicoHastaM3: number;
  rangoComplementarioHastaM3: number;
  alcCma: string | null;
  alcCmo: string | null;
  alcCmi: string | null;
  alcCmt: string | null;
  aseoCargoFijo: string | null;
  tasaMoraMensual: string;
  observaciones: string | null;
  estratos: TarifaEstratoItem[];
  facturas?: number;
}

export interface FacturaResumen {
  id: number;
  numero: number;
  suscriptorId: number;
  periodo: string;
  consumoM3: string;
  estratoCodigo: string | null;
  sinMedidor: boolean;
  subtotal: string;
  ajusteEstrato: string;
  total: string;
  estado: "pendiente" | "pagada" | "anulada";
  fechaEmision: string;
  fechaVencimiento: string | null;
  suscriptor: { id: number; codigo: string; nombre: string; barrioCat: { nombre: string } | null };
  pagado: number;
  saldo: number;
}

export interface FacturaDetalle extends Omit<FacturaResumen, "pagado" | "saldo"> {
  observaciones: string | null;
  porcentajeAplicado: string;
  conceptos: {
    id: number;
    tipo: string;
    descripcion: string;
    cantidad: string | null;
    valorUnitario: string | null;
    valor: string;
  }[];
  pagos: {
    id: number;
    valor: string;
    medio: string;
    fecha: string;
    observaciones: string | null;
    registradoPor: { nombre: string } | null;
  }[];
  pagado: number;
  saldo: number;
  diasMora: number;
  interesMora: number;
  pqr: { id: number; numeroRadicado: string; estado: string } | null;
}

export interface PagoItem {
  id: number;
  valor: string;
  medio: string;
  fecha: string;
  observaciones: string | null;
  factura: { id: number; numero: number; periodo: string; suscriptor: { codigo: string; nombre: string } };
  registradoPor: { nombre: string } | null;
}

export interface CuotaAcuerdoPago {
  id: number;
  numero: number;
  valor: string;
  estado: "pendiente" | "aplicada";
  facturaAplicadaId: number | null;
}

export interface AcuerdoPagoItem {
  id: number;
  valorTotal: string;
  numeroCuotas: number;
  concepto: string;
  estado: "activo" | "completado" | "anulado";
  createdAt: string;
  suscriptor: { codigo: string; nombre: string };
  factura: { numero: number } | null;
  pqr: { numeroRadicado: string } | null;
  cuotas: CuotaAcuerdoPago[];
}

export interface NotaItem {
  id: number;
  tipo: "credito" | "debito";
  numero: number;
  valor: string;
  concepto: string;
  estado: "pendiente" | "aplicada" | "anulada";
  createdAt: string;
  suscriptor: { codigo: string; nombre: string };
  pqr: { numeroRadicado: string } | null;
  facturaAplicada: { numero: number } | null;
}

export interface CarteraResumen {
  total: number;
  facturas: number;
  edades: { d0_30: number; d31_60: number; d61_90: number; d90mas: number };
  porBarrio: { barrio: string; saldo: number }[];
}

export interface CarteraSuscriptor {
  suscriptorId: number;
  codigo: string;
  nombre: string;
  barrio: string | null;
  saldo: number;
  facturasPendientes: number;
  periodoMasAntiguo: string;
}

export interface TarifaPayload {
  vigenciaDesde: string;
  cma: number;
  cmo: number;
  cmi: number;
  cmt: number;
  rangoBasicoHastaM3: number;
  rangoComplementarioHastaM3: number;
  alcCma?: number | null;
  alcCmo?: number | null;
  alcCmi?: number | null;
  alcCmt?: number | null;
  aseoCargoFijo?: number | null;
  tasaMoraMensual?: number;
  observaciones?: string;
  estratos: { estratoId: number; porcentaje: number }[];
}

export interface PeriodoFacturacion {
  id: number;
  periodo: string;
  estado: "abierto" | "cerrado";
  fechaGeneracion: string | null;
  fechaCierre: string | null;
  cerradoPor: { nombre: string } | null;
  observaciones: string | null;
  facturas: number;
  totalFacturado: number;
}

export interface PasoVerificacionPeriodo {
  paso: string;
  etiqueta: string;
  ok: boolean;
  detalle: string;
}

// ===== Plantillas de factura (editor visual de sobreimpresión sobre papel pre-impreso) =====

export interface CampoDisponible {
  clave: string;
  etiqueta: string;
  categoria: string;
}

export interface MarcadorPlantilla {
  id: number;
  plantillaId: number;
  campo: string;
  x: number;
  y: number;
  fontSize: number;
  align: "left" | "center" | "right";
  bold: boolean;
  anchoCaja: number | null;
}

export interface MarcadorPlantillaInput {
  campo: string;
  x: number;
  y: number;
  fontSize?: number;
  align?: "left" | "center" | "right";
  bold?: boolean;
  anchoCaja?: number | null;
}

export interface PlantillaFacturaResumen {
  id: number;
  nombre: string;
  imagenGuiaUrl: string | null;
  anchoPt: number;
  altoPt: number;
  createdAt: string;
  updatedAt: string;
  marcadores: number;
}

export interface PlantillaFactura extends Omit<PlantillaFacturaResumen, "marcadores"> {
  marcadores: MarcadorPlantilla[];
}

export const facturacionApi = {
  periodos: {
    list: () => request<PeriodoFacturacion[]>("/api/facturacion/periodos"),
    estado: (periodo: string) =>
      request<{ existe: boolean; estado: "abierto" | "cerrado" | null; fechaCierre: string | null }>(
        `/api/facturacion/periodos/${periodo}/estado`
      ),
    cerrar: (periodo: string) => request<PeriodoFacturacion>(`/api/facturacion/periodos/${periodo}/cerrar`, { method: "POST" }),
    reabrir: (periodo: string) => request<PeriodoFacturacion>(`/api/facturacion/periodos/${periodo}/reabrir`, { method: "POST" }),
    verificacion: (periodo: string) =>
      request<PasoVerificacionPeriodo[]>(`/api/facturacion/periodos/${periodo}/verificacion`),
  },
  tarifas: {
    list: () => request<Tarifa[]>("/api/facturacion/tarifas"),
    create: (data: TarifaPayload) => request<Tarifa>("/api/facturacion/tarifas", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<TarifaPayload>) =>
      request<Tarifa>(`/api/facturacion/tarifas/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: number) => request<void>(`/api/facturacion/tarifas/${id}`, { method: "DELETE" }),
  },
  generarPreview: (periodo: string) =>
    request<{
      periodo: string;
      tarifaId: number;
      suscriptores: number;
      conLectura: number;
      sinMedidor: number;
      omitidos: number;
      yaFacturados: number;
      totalEstimado: number;
    }>(`/api/facturacion/generar/preview?periodo=${periodo}`),
  deshacerGeneracion: (periodo: string) =>
    request<{ eliminadas: number }>(`/api/facturacion/generar/${periodo}`, { method: "DELETE" }),
  generarIniciar: (periodo: string, diasVencimiento?: number) =>
    request<{ id: string }>("/api/facturacion/generar/iniciar", {
      method: "POST",
      body: JSON.stringify({ periodo, diasVencimiento }),
    }),
  generarEstado: (id: string) =>
    request<{
      fase: "generando" | "listo" | "error";
      periodo: string;
      procesados: number;
      total: number;
      creadas: number;
      omitidas: number;
      omitidos: number;
      totalFacturado: number;
      error: string | null;
    }>(`/api/facturacion/generar/${id}/estado`),
  facturas: {
    listPaginado: (page: number, limit: number, filtros?: { periodo?: string; estado?: string; q?: string }) => {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filtros?.periodo) qs.set("periodo", filtros.periodo);
      if (filtros?.estado) qs.set("estado", filtros.estado);
      if (filtros?.q) qs.set("q", filtros.q);
      return request<{ data: FacturaResumen[]; total: number; page: number; limit: number }>(`/api/facturacion/facturas?${qs}`);
    },
    get: (id: number) => request<FacturaDetalle>(`/api/facturacion/facturas/${id}`),
    anular: (id: number, motivo?: string, numeroRadicadoPqr?: string) =>
      request<FacturaResumen>(`/api/facturacion/facturas/${id}/anular`, {
        method: "PUT",
        body: JSON.stringify({ motivo, numeroRadicadoPqr }),
      }),
    verPdf: (id: number, numero: number, plantillaId?: number) => {
      const qs = plantillaId ? `?plantillaId=${plantillaId}` : "";
      return descargarArchivo(`/api/facturacion/facturas/${id}/pdf${qs}`, `factura-${numero}.pdf`, true);
    },
  },
  pdfLote: (periodo: string, filtros?: { barrioId?: number; ruta?: string; plantillaId?: number }) => {
    const qs = new URLSearchParams({ periodo });
    if (filtros?.barrioId) qs.set("barrioId", String(filtros.barrioId));
    if (filtros?.ruta) qs.set("ruta", filtros.ruta);
    if (filtros?.plantillaId) qs.set("plantillaId", String(filtros.plantillaId));
    return descargarArchivo(`/api/facturacion/pdf-lote?${qs}`, `facturas_${periodo}.pdf`);
  },
  pagos: {
    crear: (data: { facturaId: number; valor: number; medio?: string; observaciones?: string }) =>
      request<PagoItem & { saldoRestante: number }>("/api/facturacion/pagos", { method: "POST", body: JSON.stringify(data) }),
    listPaginado: (page: number, limit: number, filtros?: { desde?: string; hasta?: string }) => {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filtros?.desde) qs.set("desde", filtros.desde);
      if (filtros?.hasta) qs.set("hasta", filtros.hasta);
      return request<{ data: PagoItem[]; total: number; page: number; limit: number; sumaValor: number }>(
        `/api/facturacion/pagos?${qs}`
      );
    },
    remove: (id: number) => request<void>(`/api/facturacion/pagos/${id}`, { method: "DELETE" }),
  },
  notas: {
    listPaginado: (page: number, limit: number, filtros?: { suscriptorId?: number; estado?: string }) => {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filtros?.suscriptorId) qs.set("suscriptorId", String(filtros.suscriptorId));
      if (filtros?.estado) qs.set("estado", filtros.estado);
      return request<{ data: NotaItem[]; total: number; page: number; limit: number }>(`/api/facturacion/notas?${qs}`);
    },
    crear: (data: { suscriptorId: number; tipo: "credito" | "debito"; valor: number; concepto: string; numeroRadicadoPqr?: string }) =>
      request<NotaItem>("/api/facturacion/notas", { method: "POST", body: JSON.stringify(data) }),
    remove: (id: number) => request<void>(`/api/facturacion/notas/${id}`, { method: "DELETE" }),
  },
  acuerdosPago: {
    listPaginado: (page: number, limit: number, filtros?: { suscriptorId?: number; estado?: string }) => {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filtros?.suscriptorId) qs.set("suscriptorId", String(filtros.suscriptorId));
      if (filtros?.estado) qs.set("estado", filtros.estado);
      return request<{ data: AcuerdoPagoItem[]; total: number; page: number; limit: number }>(`/api/facturacion/acuerdos-pago?${qs}`);
    },
    crear: (
      data:
        | { facturaId: number; numeroCuotas: number; concepto: string; numeroRadicadoPqr?: string }
        | { suscriptorId: number; valorCargo: number; numeroCuotas: number; concepto: string; numeroRadicadoPqr?: string }
    ) => request<AcuerdoPagoItem>("/api/facturacion/acuerdos-pago", { method: "POST", body: JSON.stringify(data) }),
    remove: (id: number) => request<void>(`/api/facturacion/acuerdos-pago/${id}`, { method: "DELETE" }),
  },
  omitidos: (periodo: string) =>
    request<{ id: number; motivo: string; suscriptor: { id: number; codigo: string; nombre: string } }[]>(
      `/api/facturacion/omitidos?periodo=${periodo}`
    ),
  cartera: {
    resumen: () => request<CarteraResumen>("/api/facturacion/cartera/resumen"),
    listPaginado: (page: number, limit: number, q?: string) => {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (q) qs.set("q", q);
      return request<{ data: CarteraSuscriptor[]; total: number; page: number; limit: number }>(`/api/facturacion/cartera?${qs}`);
    },
  },
  plantillas: {
    camposDisponibles: () => request<CampoDisponible[]>("/api/facturacion/plantillas/campos"),
    list: () => request<PlantillaFacturaResumen[]>("/api/facturacion/plantillas"),
    get: (id: number) => request<PlantillaFactura>(`/api/facturacion/plantillas/${id}`),
    create: (nombre: string) =>
      request<PlantillaFactura>("/api/facturacion/plantillas", { method: "POST", body: JSON.stringify({ nombre }) }),
    update: (id: number, data: { nombre: string; anchoPt: number; altoPt: number }) =>
      request<PlantillaFactura>(`/api/facturacion/plantillas/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: number) => request<void>(`/api/facturacion/plantillas/${id}`, { method: "DELETE" }),
    guardarMarcadores: (id: number, marcadores: MarcadorPlantillaInput[]) =>
      request<PlantillaFactura>(`/api/facturacion/plantillas/${id}/marcadores`, {
        method: "PUT",
        body: JSON.stringify({ marcadores }),
      }),
    subirImagenGuia: (id: number, imagen: File) => {
      const fd = new FormData();
      fd.append("imagen", imagen);
      return requestMultipart<PlantillaFactura>(`/api/facturacion/plantillas/${id}/imagen-guia`, fd, "POST");
    },
    quitarImagenGuia: (id: number) =>
      request<PlantillaFactura>(`/api/facturacion/plantillas/${id}/imagen-guia`, { method: "DELETE" }),
  },
};
