import { request, requestMultipart, descargarArchivo } from "../core.js";

export interface CategoriaInventario {
  id: number;
  nombre: string;
  items: number;
}

export interface UbicacionInventario {
  id: number;
  nombre: string;
  items: number;
}

export interface ProveedorInventario {
  id: number;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  items: number;
}

export interface ItemInventario {
  id: number;
  nombre: string;
  categoriaId: number | null;
  categoriaCat: { id: number; nombre: string } | null;
  codigo: string | null;
  descripcion: string | null;
  cantidad: number;
  unidadMedida: "unidad" | "metro" | "kilogramo" | "litro" | "galon" | "rollo" | "caja" | "par";
  disponible: number;
  estado: "bueno" | "regular" | "dañado" | "de_baja";
  ubicacionId: number | null;
  ubicacionCat: { id: number; nombre: string } | null;
  proveedorId: number | null;
  proveedor: { id: number; nombre: string } | null;
  fechaCompra: string | null;
  fechaIngreso: string | null;
  valor: string | null;
  ingresadoPor: { id: number; nombre: string } | null;
  fotoUrl: string | null;
  activo: boolean;
  createdAt: string;
}

export interface PrestamoInventario {
  id: number;
  itemId: number;
  item?: ItemInventario;
  usuarioId: number;
  usuario?: { id: number; nombre: string };
  cantidad: number;
  fechaEntrega: string;
  fechaDevolucion: string | null;
  observaciones: string | null;
  createdAt: string;
}

export interface InventarioKpis {
  totalItems: number;
  valorTotalInventario: number;
  prestamosActivos: number;
  itemsPorCategoria: { categoria: string; cantidad: number }[];
  itemsPorEstado: { estado: string; cantidad: number }[];
  movimientosPorMes: { mes: string; entradas: number; salidas: number }[];
}

export interface MovimientoInventario {
  id: number;
  itemId: number;
  item?: ItemInventario;
  tipo: "entrada" | "salida";
  cantidad: number;
  motivo: string | null;
  observaciones: string | null;
  usuarioId: number | null;
  usuario?: { id: number; nombre: string } | null;
  createdAt: string;
}

export const inventarioApi = {
  list: (filtros?: { categoria?: number; estado?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (filtros?.categoria) qs.set("categoria", String(filtros.categoria));
    if (filtros?.estado) qs.set("estado", filtros.estado);
    if (filtros?.q) qs.set("q", filtros.q);
    return request<ItemInventario[]>(`/api/inventario/items?${qs}`);
  },
  listPaginado: (
    page: number,
    limit: number,
    filtros?: { categoria?: number; estado?: string; q?: string; sort?: string; dir?: "asc" | "desc" }
  ) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filtros?.categoria) qs.set("categoria", String(filtros.categoria));
    if (filtros?.estado) qs.set("estado", filtros.estado);
    if (filtros?.q) qs.set("q", filtros.q);
    if (filtros?.sort) qs.set("sort", filtros.sort);
    if (filtros?.dir) qs.set("dir", filtros.dir);
    return request<{ data: ItemInventario[]; total: number; page: number; limit: number }>(
      `/api/inventario/items?${qs}`
    );
  },
  create: (data: {
    nombre: string;
    categoriaId?: number;
    codigo?: string;
    descripcion?: string;
    cantidad?: number;
    unidadMedida?: string;
    estado?: string;
    ubicacionId?: number;
    proveedorId?: number;
    fechaCompra?: string;
    fechaIngreso?: string;
    valor?: number;
    foto?: File | null;
  }) => {
    const fd = new FormData();
    fd.set("nombre", data.nombre);
    if (data.categoriaId) fd.set("categoriaId", String(data.categoriaId));
    if (data.codigo) fd.set("codigo", data.codigo);
    if (data.descripcion) fd.set("descripcion", data.descripcion);
    if (data.cantidad !== undefined) fd.set("cantidad", String(data.cantidad));
    if (data.unidadMedida) fd.set("unidadMedida", data.unidadMedida);
    if (data.estado) fd.set("estado", data.estado);
    if (data.ubicacionId) fd.set("ubicacionId", String(data.ubicacionId));
    if (data.proveedorId) fd.set("proveedorId", String(data.proveedorId));
    if (data.fechaCompra) fd.set("fechaCompra", data.fechaCompra);
    if (data.fechaIngreso) fd.set("fechaIngreso", data.fechaIngreso);
    if (data.valor !== undefined) fd.set("valor", String(data.valor));
    if (data.foto) fd.set("foto", data.foto);
    return requestMultipart<ItemInventario>("/api/inventario/items", fd, "POST");
  },
  update: (
    id: number,
    data: {
      nombre?: string;
      categoriaId?: number | null;
      codigo?: string | null;
      descripcion?: string | null;
      cantidad?: number;
      unidadMedida?: string;
      estado?: string;
      ubicacionId?: number | null;
      proveedorId?: number | null;
      fechaCompra?: string | null;
      fechaIngreso?: string | null;
      valor?: number | null;
      foto?: File | null;
      quitarFoto?: boolean;
    }
  ) => {
    const fd = new FormData();
    if (data.nombre !== undefined) fd.set("nombre", data.nombre);
    if (data.categoriaId !== undefined) fd.set("categoriaId", data.categoriaId === null ? "" : String(data.categoriaId));
    if (data.codigo !== undefined) fd.set("codigo", data.codigo ?? "");
    if (data.descripcion !== undefined) fd.set("descripcion", data.descripcion ?? "");
    if (data.cantidad !== undefined) fd.set("cantidad", String(data.cantidad));
    if (data.unidadMedida !== undefined) fd.set("unidadMedida", data.unidadMedida);
    if (data.estado !== undefined) fd.set("estado", data.estado);
    if (data.ubicacionId !== undefined) fd.set("ubicacionId", data.ubicacionId === null ? "" : String(data.ubicacionId));
    if (data.proveedorId !== undefined) fd.set("proveedorId", data.proveedorId === null ? "" : String(data.proveedorId));
    if (data.fechaCompra !== undefined) fd.set("fechaCompra", data.fechaCompra ?? "");
    if (data.fechaIngreso !== undefined) fd.set("fechaIngreso", data.fechaIngreso ?? "");
    if (data.valor !== undefined) fd.set("valor", data.valor === null ? "" : String(data.valor));
    if (data.foto) fd.set("foto", data.foto);
    if (data.quitarFoto) fd.set("quitarFoto", "true");
    return requestMultipart<ItemInventario>(`/api/inventario/items/${id}`, fd, "PUT");
  },
  remove: (id: number) => request<void>(`/api/inventario/items/${id}`, { method: "DELETE" }),
  exportarExcel: (filtros?: { categoria?: number; estado?: string; q?: string; ids?: number[] }) => {
    const qs = new URLSearchParams();
    if (filtros?.categoria) qs.set("categoria", String(filtros.categoria));
    if (filtros?.estado) qs.set("estado", filtros.estado);
    if (filtros?.q) qs.set("q", filtros.q);
    if (filtros?.ids && filtros.ids.length > 0) qs.set("ids", filtros.ids.join(","));
    return descargarArchivo(`/api/inventario/items/excel?${qs}`, "inventario_items.xlsx");
  },
  exportarPdf: (filtros?: { categoria?: number; estado?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (filtros?.categoria) qs.set("categoria", String(filtros.categoria));
    if (filtros?.estado) qs.set("estado", filtros.estado);
    if (filtros?.q) qs.set("q", filtros.q);
    return descargarArchivo(`/api/inventario/items/pdf?${qs}`, "inventario_items.pdf", true);
  },
  prestamos: {
    list: (filtros?: { itemId?: number; usuarioId?: number; activos?: boolean }) => {
      const qs = new URLSearchParams();
      if (filtros?.itemId) qs.set("itemId", String(filtros.itemId));
      if (filtros?.usuarioId) qs.set("usuarioId", String(filtros.usuarioId));
      if (filtros?.activos) qs.set("activos", "true");
      return request<PrestamoInventario[]>(`/api/inventario/prestamos?${qs}`);
    },
    crear: (data: { itemId: number; usuarioId: number; cantidad?: number; observaciones?: string }) =>
      request<PrestamoInventario>("/api/inventario/prestamos", { method: "POST", body: JSON.stringify(data) }),
    actualizar: (id: number, data: { usuarioId?: number; cantidad?: number; observaciones?: string }) =>
      request<PrestamoInventario>(`/api/inventario/prestamos/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    devolver: (id: number) => request<PrestamoInventario>(`/api/inventario/prestamos/${id}/devolver`, { method: "PUT" }),
    remove: (id: number) => request<void>(`/api/inventario/prestamos/${id}`, { method: "DELETE" }),
    exportarExcel: (filtros?: { activos?: boolean }) => {
      const qs = new URLSearchParams();
      if (filtros?.activos) qs.set("activos", "true");
      return descargarArchivo(`/api/inventario/prestamos/excel?${qs}`, "inventario_prestamos.xlsx");
    },
    exportarPdf: (filtros?: { activos?: boolean }) => {
      const qs = new URLSearchParams();
      if (filtros?.activos) qs.set("activos", "true");
      return descargarArchivo(`/api/inventario/prestamos/pdf?${qs}`, "inventario_prestamos.pdf", true);
    },
  },
  movimientos: {
    list: (filtros?: { itemId?: number; tipo?: "entrada" | "salida" }) => {
      const qs = new URLSearchParams();
      if (filtros?.itemId) qs.set("itemId", String(filtros.itemId));
      if (filtros?.tipo) qs.set("tipo", filtros.tipo);
      return request<MovimientoInventario[]>(`/api/inventario/movimientos?${qs}`);
    },
    crear: (data: { itemId: number; tipo: "entrada" | "salida"; cantidad: number; motivo?: string; observaciones?: string }) =>
      request<MovimientoInventario>("/api/inventario/movimientos", { method: "POST", body: JSON.stringify(data) }),
    remove: (id: number) => request<void>(`/api/inventario/movimientos/${id}`, { method: "DELETE" }),
    exportarExcel: (filtros?: { tipo?: "entrada" | "salida" }) => {
      const qs = new URLSearchParams();
      if (filtros?.tipo) qs.set("tipo", filtros.tipo);
      return descargarArchivo(`/api/inventario/movimientos/excel?${qs}`, "inventario_movimientos.xlsx");
    },
    exportarPdf: (filtros?: { tipo?: "entrada" | "salida" }) => {
      const qs = new URLSearchParams();
      if (filtros?.tipo) qs.set("tipo", filtros.tipo);
      return descargarArchivo(`/api/inventario/movimientos/pdf?${qs}`, "inventario_movimientos.pdf", true);
    },
  },
  categorias: {
    list: () => request<CategoriaInventario[]>("/api/inventario/categorias"),
    crear: (nombre: string) =>
      request<CategoriaInventario>("/api/inventario/categorias", { method: "POST", body: JSON.stringify({ nombre }) }),
    actualizar: (id: number, nombre: string) =>
      request<CategoriaInventario>(`/api/inventario/categorias/${id}`, { method: "PUT", body: JSON.stringify({ nombre }) }),
    remove: (id: number) => request<void>(`/api/inventario/categorias/${id}`, { method: "DELETE" }),
  },
  ubicaciones: {
    list: () => request<UbicacionInventario[]>("/api/inventario/ubicaciones"),
    crear: (nombre: string) =>
      request<UbicacionInventario>("/api/inventario/ubicaciones", { method: "POST", body: JSON.stringify({ nombre }) }),
    actualizar: (id: number, nombre: string) =>
      request<UbicacionInventario>(`/api/inventario/ubicaciones/${id}`, { method: "PUT", body: JSON.stringify({ nombre }) }),
    remove: (id: number) => request<void>(`/api/inventario/ubicaciones/${id}`, { method: "DELETE" }),
  },
  proveedores: {
    list: () => request<ProveedorInventario[]>("/api/inventario/proveedores"),
    crear: (data: { nombre: string; contacto?: string; telefono?: string }) =>
      request<ProveedorInventario>("/api/inventario/proveedores", { method: "POST", body: JSON.stringify(data) }),
    actualizar: (id: number, data: { nombre: string; contacto?: string; telefono?: string }) =>
      request<ProveedorInventario>(`/api/inventario/proveedores/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: number) => request<void>(`/api/inventario/proveedores/${id}`, { method: "DELETE" }),
  },
  kpis: () => request<InventarioKpis>("/api/inventario/kpis"),
};
