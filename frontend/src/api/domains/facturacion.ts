import { request, descargarArchivo } from "../core.js";

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

export const facturacionApi = {
  periodos: {
    list: () => request<PeriodoFacturacion[]>("/api/facturacion/periodos"),
    estado: (periodo: string) =>
      request<{ existe: boolean; estado: "abierto" | "cerrado" | null; fechaCierre: string | null }>(
        `/api/facturacion/periodos/${periodo}/estado`
      ),
    cerrar: (periodo: string) => request<PeriodoFacturacion>(`/api/facturacion/periodos/${periodo}/cerrar`, { method: "POST" }),
    reabrir: (periodo: string) => request<PeriodoFacturacion>(`/api/facturacion/periodos/${periodo}/reabrir`, { method: "POST" }),
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
    anular: (id: number, motivo?: string) =>
      request<FacturaResumen>(`/api/facturacion/facturas/${id}/anular`, { method: "PUT", body: JSON.stringify({ motivo }) }),
    agregarConcepto: (id: number, descripcion: string, valor: number) =>
      request<FacturaResumen>(`/api/facturacion/facturas/${id}/conceptos`, {
        method: "POST",
        body: JSON.stringify({ descripcion, valor }),
      }),
    quitarConcepto: (id: number, conceptoId: number) =>
      request<void>(`/api/facturacion/facturas/${id}/conceptos/${conceptoId}`, { method: "DELETE" }),
    verPdf: (id: number, numero: number) => descargarArchivo(`/api/facturacion/facturas/${id}/pdf`, `factura-${numero}.pdf`, true),
  },
  pdfLote: (periodo: string, filtros?: { barrioId?: number; ruta?: string }) => {
    const qs = new URLSearchParams({ periodo });
    if (filtros?.barrioId) qs.set("barrioId", String(filtros.barrioId));
    if (filtros?.ruta) qs.set("ruta", filtros.ruta);
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
};
