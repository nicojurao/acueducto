import { request, descargarArchivo } from "../core.js";

export interface CuentaPuc {
  id: number;
  codigo: string;
  nombre: string;
  naturaleza: "debito" | "credito";
  nivel: number;
  padreId: number | null;
  activa: boolean;
}

export interface Gasto {
  id: number;
  terceroId: number;
  tercero: { nombre: string };
  cuentaGastoId: number;
  cuentaGasto: { codigo: string; nombre: string };
  fecha: string;
  concepto: string;
  valor: string;
  ivaValor: string;
  numeroFactura: string | null;
  pagado: boolean;
}

export interface NuevoGasto {
  terceroId: number;
  cuentaGastoId: number;
  concepto: string;
  valor: number;
  ivaValor?: number;
  numeroFactura?: string;
  pagado?: boolean;
  fecha?: string;
}

export interface SaldoCuenta {
  cuentaId: number;
  codigo: string;
  nombre: string;
  naturaleza: "debito" | "credito";
  nivel: number;
  debito: number;
  credito: number;
  saldo: number;
}

export interface MovimientoLibro {
  id: number;
  debito: string;
  credito: string;
  descripcion: string | null;
  cuentaPuc: { codigo: string; nombre: string };
  tercero: { nombre: string } | null;
  comprobante: { tipo: string; numero: number; fecha: string; concepto: string };
}

export interface ComprobanteLibroDiario {
  id: number;
  tipo: string;
  numero: number;
  fecha: string;
  concepto: string;
  movimientos: { id: number; debito: string; credito: string; cuentaPuc: { codigo: string; nombre: string }; tercero: { nombre: string } | null }[];
}

export interface EstadoResultados {
  ingresos: SaldoCuenta[];
  gastos: SaldoCuenta[];
  costos: SaldoCuenta[];
  totalIngresos: number;
  totalGastos: number;
  totalCostos: number;
  utilidad: number;
}

export interface BalanceGeneral {
  activo: SaldoCuenta[];
  pasivo: SaldoCuenta[];
  patrimonio: SaldoCuenta[];
  resultadoEjercicio: number;
  totalActivo: number;
  totalPasivo: number;
  totalPatrimonio: number;
  cuadra: boolean;
}

function qsFechas(desde?: string, hasta?: string): string {
  const qs = new URLSearchParams();
  if (desde) qs.set("desde", desde);
  if (hasta) qs.set("hasta", hasta);
  const texto = qs.toString();
  return texto ? `?${texto}` : "";
}

export const contabilidadApi = {
  listarPuc: (soloActivas?: boolean) =>
    request<CuentaPuc[]>(`/api/contabilidad/puc${soloActivas ? "?activas=true" : ""}`),
  crearCuentaPuc: (codigo: string, nombre: string, naturaleza: "debito" | "credito") =>
    request<CuentaPuc>("/api/contabilidad/puc", {
      method: "POST",
      body: JSON.stringify({ codigo, nombre, naturaleza }),
    }),
  actualizarCuentaPuc: (id: number, datos: Partial<Pick<CuentaPuc, "nombre" | "naturaleza" | "activa">>) =>
    request<CuentaPuc>(`/api/contabilidad/puc/${id}`, { method: "PUT", body: JSON.stringify(datos) }),
  eliminarCuentaPuc: (id: number) => request<void>(`/api/contabilidad/puc/${id}`, { method: "DELETE" }),

  listarGastos: (page = 1, limit = 20) =>
    request<{ data: Gasto[]; total: number; page: number; limit: number }>(
      `/api/contabilidad/gastos?page=${page}&limit=${limit}`
    ),
  crearGasto: (datos: NuevoGasto) =>
    request<Gasto>("/api/contabilidad/gastos", { method: "POST", body: JSON.stringify(datos) }),

  libroDiario: (desde?: string, hasta?: string) =>
    request<ComprobanteLibroDiario[]>(`/api/contabilidad/libro-diario${qsFechas(desde, hasta)}`),
  descargarLibroDiario: (desde?: string, hasta?: string) => {
    const qs = qsFechas(desde, hasta);
    const separador = qs ? "&" : "?";
    return descargarArchivo(`/api/contabilidad/libro-diario${qs}${separador}formato=excel`, "libro-diario.xlsx");
  },

  libroMayor: (desde?: string, hasta?: string, cuentaId?: number) => {
    const qs = qsFechas(desde, hasta);
    const conCuenta = cuentaId ? `${qs}${qs ? "&" : "?"}cuentaId=${cuentaId}` : qs;
    return request<{ saldosIniciales: SaldoCuenta[]; movimientos: MovimientoLibro[] }>(`/api/contabilidad/libro-mayor${conCuenta}`);
  },
  descargarLibroMayor: (desde?: string, hasta?: string, cuentaId?: number) => {
    const qs = qsFechas(desde, hasta);
    const conCuenta = cuentaId ? `${qs}${qs ? "&" : "?"}cuentaId=${cuentaId}` : qs;
    const separador = conCuenta ? "&" : "?";
    return descargarArchivo(`/api/contabilidad/libro-mayor${conCuenta}${separador}formato=excel`, "libro-mayor.xlsx");
  },

  estadoResultados: (desde?: string, hasta?: string) =>
    request<EstadoResultados>(`/api/contabilidad/estado-resultados${qsFechas(desde, hasta)}`),
  descargarEstadoResultados: (desde?: string, hasta?: string) => {
    const qs = qsFechas(desde, hasta);
    const separador = qs ? "&" : "?";
    return descargarArchivo(`/api/contabilidad/estado-resultados${qs}${separador}formato=excel`, "estado-resultados.xlsx");
  },

  balanceGeneral: (corte?: string) =>
    request<BalanceGeneral>(`/api/contabilidad/balance-general${corte ? `?corte=${corte}` : ""}`),
  descargarBalanceGeneral: (corte?: string) => {
    const qs = corte ? `?corte=${corte}&formato=excel` : "?formato=excel";
    return descargarArchivo(`/api/contabilidad/balance-general${qs}`, "balance-general.xlsx");
  },
};
