import { Router } from "express";
import multer from "multer";
import PDFDocument from "pdfkit";
import { prisma } from "../../lib/prisma.js";
import { guardarArchivo, borrarArchivo } from "../../lib/storage.js";
import { requirePermiso } from "../../middleware/auth.js";
import { encabezadoPdf, tablaPdf as tablaInventarioPdf } from "../../lib/pdfBranding.js";
import { crearInformeExcel, enviarExcel } from "../../lib/excelBranding.js";
import { registrarCambios, camposItemInventario } from "../../lib/historial.js";
import { fechaLegibleColombia } from "../../lib/fechaColombia.js";

function enviarPdf(res: import("express").Response, nombreArchivo: string) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${nombreArchivo}"`);
}

const soloAvanzado = requirePermiso("inventario_avanzado");

export const itemsInventarioRouter = Router();
export const prestamosInventarioRouter = Router();
export const movimientosInventarioRouter = Router();
export const inventarioKpisRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
});

const ESTADO_LABELS_EXCEL: Record<string, string> = { bueno: "Bueno", regular: "Regular", dañado: "Dañado", de_baja: "De baja" };
const UNIDAD_LABELS: Record<string, string> = {
  unidad: "Unidad",
  metro: "Metro",
  kilogramo: "Kilogramo",
  litro: "Litro",
  galon: "Galón",
  rollo: "Rollo",
  caja: "Caja",
  par: "Par",
};
const UNIDAD_ABREVIADAS: Record<string, string> = {
  unidad: "und",
  metro: "m",
  kilogramo: "kg",
  litro: "L",
  galon: "gal",
  rollo: "rollo",
  caja: "caja",
  par: "par",
};

const includeCatalogos = {
  categoriaCat: true,
  ubicacionCat: true,
  proveedor: true,
  ingresadoPor: { select: { id: true, nombre: true } },
};

// Disponible = cantidad total del ítem - lo que está prestado sin devolver todavía.
async function disponibilidad(itemId: number, cantidadTotal: number): Promise<number> {
  const prestados = await prisma.prestamoInventario.aggregate({
    where: { itemId, fechaDevolucion: null },
    _sum: { cantidad: true },
  });
  return cantidadTotal - (prestados._sum.cantidad ?? 0);
}

// Listado de ítems, con la cantidad disponible calculada (cantidad - préstamos activos). Sin
// "page" devuelve todo (compat, lo usa el combobox de "asignar préstamo"); con "page" pagina y
// filtra en el servidor.
itemsInventarioRouter.get("/", async (req, res) => {
  const { page, limit, q, categoria, ubicacion, proveedor, estado, stockBajo } = req.query;
  const filtros: any[] = [{ activo: true }];
  if (categoria) filtros.push({ categoriaId: Number(categoria) });
  if (ubicacion) filtros.push({ ubicacionId: Number(ubicacion) });
  if (proveedor) filtros.push({ proveedorId: Number(proveedor) });
  if (estado) filtros.push({ estado: String(estado) });
  if (stockBajo === "true") filtros.push({ stockMinimo: { not: null } });
  if (q) {
    const texto = String(q).trim();
    filtros.push({
      OR: [
        { nombre: { contains: texto, mode: "insensitive" as const } },
        { codigo: { contains: texto, mode: "insensitive" as const } },
        { categoriaCat: { nombre: { contains: texto, mode: "insensitive" as const } } },
      ],
    });
  }
  const where = { AND: filtros };

  async function conDisponible<T extends { id: number; cantidad: number; stockMinimo: number | null }>(
    items: T[]
  ): Promise<(T & { disponible: number; stockBajo: boolean })[]> {
    if (items.length === 0) return [];
    const prestados = await prisma.prestamoInventario.groupBy({
      by: ["itemId"],
      where: { itemId: { in: items.map((i) => i.id) }, fechaDevolucion: null },
      _sum: { cantidad: true },
    });
    const prestadosPorItem = new Map(prestados.map((p) => [p.itemId, p._sum.cantidad ?? 0]));
    return items.map((item) => {
      const disponible = item.cantidad - (prestadosPorItem.get(item.id) ?? 0);
      return { ...item, disponible, stockBajo: item.stockMinimo != null && disponible <= item.stockMinimo };
    });
  }

  if (page) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 10);
    // Orden por clic en el encabezado de la tabla (whitelist de claves). "Disponible" no se
    // puede ordenar acá: es un valor calculado con los préstamos activos, no una columna.
    const dir: "asc" | "desc" = String(req.query.dir) === "desc" ? "desc" : "asc";
    const ORDENES: Record<string, object> = {
      nombre: { nombre: dir },
      categoria: { categoriaCat: { nombre: dir } },
      cantidad: { cantidad: dir },
      estado: { estado: dir },
      ubicacion: { ubicacionCat: { nombre: dir } },
    };
    const orderBy = ORDENES[String(req.query.sort ?? "")] ?? { nombre: "asc" };

    // "stockBajo" depende de un valor calculado (disponible = cantidad - prestado), no se puede
    // filtrar/paginar directo en SQL — se trae todo lo que tenga stockMinimo, se calcula y se
    // pagina en memoria. El volumen de este módulo (cientos de ítems) lo hace viable.
    if (stockBajo === "true") {
      const todos = await prisma.itemInventario.findMany({ where, include: includeCatalogos, orderBy });
      const conDatos = (await conDisponible(todos)).filter((i) => i.stockBajo);
      const total = conDatos.length;
      const data = conDatos.slice((pageNum - 1) * limitNum, pageNum * limitNum);
      return res.json({ data, total, page: pageNum, limit: limitNum });
    }

    const [items, total] = await Promise.all([
      prisma.itemInventario.findMany({
        where, include: includeCatalogos, orderBy, skip: (pageNum - 1) * limitNum, take: limitNum,
      }),
      prisma.itemInventario.count({ where }),
    ]);
    return res.json({ data: await conDisponible(items), total, page: pageNum, limit: limitNum });
  }

  const items = await prisma.itemInventario.findMany({ where, include: includeCatalogos, orderBy: { nombre: "asc" } });
  res.json(await conDisponible(items));
});

// Excel de ítems con los mismos filtros que el listado (q, categoria, estado), con columnas
// adicionales (proveedor, fechas, valor) que no caben en la tabla de la UI.
itemsInventarioRouter.get("/excel", async (req, res) => {
  const { q, categoria, ubicacion, proveedor, estado, ids } = req.query;
  const filtros: any[] = [{ activo: true }];
  if (categoria) filtros.push({ categoriaId: Number(categoria) });
  if (ubicacion) filtros.push({ ubicacionId: Number(ubicacion) });
  if (proveedor) filtros.push({ proveedorId: Number(proveedor) });
  if (estado) filtros.push({ estado: String(estado) });
  if (ids) {
    const idsFiltro = String(ids)
      .split(",")
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    filtros.push({ id: { in: idsFiltro } });
  }
  if (q) {
    const texto = String(q).trim();
    filtros.push({
      OR: [
        { nombre: { contains: texto, mode: "insensitive" as const } },
        { codigo: { contains: texto, mode: "insensitive" as const } },
        { categoriaCat: { nombre: { contains: texto, mode: "insensitive" as const } } },
      ],
    });
  }

  const items = await prisma.itemInventario.findMany({
    where: { AND: filtros },
    include: includeCatalogos,
    orderBy: { nombre: "asc" },
  });
  const prestados = await prisma.prestamoInventario.groupBy({
    by: ["itemId"],
    where: { itemId: { in: items.map((i) => i.id) }, fechaDevolucion: null },
    _sum: { cantidad: true },
  });
  const prestadosPorItem = new Map(prestados.map((p) => [p.itemId, p._sum.cantidad ?? 0]));

  const filas = items.map((item) => ({
    nombre: item.nombre,
    codigo: item.codigo ?? "",
    categoria: item.categoriaCat?.nombre ?? "",
    cantidad: item.cantidad,
    unidad: UNIDAD_LABELS[item.unidadMedida] ?? item.unidadMedida,
    disponible: item.cantidad - (prestadosPorItem.get(item.id) ?? 0),
    estado: ESTADO_LABELS_EXCEL[item.estado] ?? item.estado,
    ubicacion: item.ubicacionCat?.nombre ?? "",
    proveedor: item.proveedor?.nombre ?? "",
    fechaCompra: item.fechaCompra ? item.fechaCompra.toISOString().slice(0, 10) : "",
    fechaIngreso: item.fechaIngreso ? item.fechaIngreso.toISOString().slice(0, 10) : "",
    valor: item.valor ? Number(item.valor) : "",
    ingresadoPor: item.ingresadoPor?.nombre ?? "",
  }));

  const buffer = await crearInformeExcel(
    "Inventario",
    "Inventario general",
    `Ítems · ${filas.length} registro${filas.length === 1 ? "" : "s"} · ${fechaLegibleColombia()}`,
    [
      { titulo: "NOMBRE", clave: "nombre", ancho: 28 },
      { titulo: "CÓDIGO", clave: "codigo", ancho: 14 },
      { titulo: "CATEGORÍA", clave: "categoria", ancho: 18 },
      { titulo: "CANTIDAD", clave: "cantidad", ancho: 11 },
      { titulo: "UNIDAD", clave: "unidad", ancho: 12 },
      { titulo: "DISPONIBLE", clave: "disponible", ancho: 12 },
      { titulo: "ESTADO", clave: "estado", ancho: 12 },
      { titulo: "UBICACIÓN", clave: "ubicacion", ancho: 18 },
      { titulo: "PROVEEDOR", clave: "proveedor", ancho: 18 },
      { titulo: "FECHA DE COMPRA", clave: "fechaCompra", ancho: 16 },
      { titulo: "FECHA DE INGRESO", clave: "fechaIngreso", ancho: 16 },
      { titulo: "VALOR", clave: "valor", ancho: 14 },
      { titulo: "INGRESADO POR", clave: "ingresadoPor", ancho: 18 },
    ],
    filas
  );
  enviarExcel(res, buffer, "inventario_items.xlsx");
});

// PDF con la plantilla institucional (logo + azul de marca, igual que Aforos/Actas), en horizontal
// porque el ítem trae bastantes columnas. Mismos filtros que el listado y el Excel.
itemsInventarioRouter.get("/pdf", async (req, res) => {
  const { q, categoria, ubicacion, proveedor, estado } = req.query;
  const filtros: any[] = [{ activo: true }];
  if (categoria) filtros.push({ categoriaId: Number(categoria) });
  if (ubicacion) filtros.push({ ubicacionId: Number(ubicacion) });
  if (proveedor) filtros.push({ proveedorId: Number(proveedor) });
  if (estado) filtros.push({ estado: String(estado) });
  if (q) {
    const texto = String(q).trim();
    filtros.push({
      OR: [
        { nombre: { contains: texto, mode: "insensitive" as const } },
        { codigo: { contains: texto, mode: "insensitive" as const } },
        { categoriaCat: { nombre: { contains: texto, mode: "insensitive" as const } } },
      ],
    });
  }

  const items = await prisma.itemInventario.findMany({
    where: { AND: filtros },
    include: includeCatalogos,
    orderBy: { nombre: "asc" },
  });
  const prestados = await prisma.prestamoInventario.groupBy({
    by: ["itemId"],
    where: { itemId: { in: items.map((i) => i.id) }, fechaDevolucion: null },
    _sum: { cantidad: true },
  });
  const prestadosPorItem = new Map(prestados.map((p) => [p.itemId, p._sum.cantidad ?? 0]));

  enviarPdf(res, "inventario_items.pdf");
  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
  doc.pipe(res);
  encabezadoPdf(doc, "Inventario general", `Ítems · ${items.length} registro${items.length === 1 ? "" : "s"} · ${fechaLegibleColombia()}`);

  tablaInventarioPdf(
    doc,
    [
      { titulo: "NOMBRE", clave: "nombre", ancho: 140 },
      { titulo: "F. COMPRA", clave: "fechaCompra", ancho: 65 },
      { titulo: "CATEGORÍA", clave: "categoria", ancho: 85 },
      { titulo: "CANT.", clave: "cantidad", ancho: 55, align: "right" },
      { titulo: "DISP.", clave: "disponible", ancho: 55, align: "right" },
      { titulo: "ESTADO", clave: "estado", ancho: 60 },
      { titulo: "UBICACIÓN", clave: "ubicacion", ancho: 90 },
      { titulo: "PROVEEDOR", clave: "proveedor", ancho: 90 },
      { titulo: "VALOR", clave: "valor", ancho: 90, align: "right" },
    ],
    items.map((item) => ({
      nombre: item.nombre,
      fechaCompra: item.fechaCompra ? item.fechaCompra.toLocaleDateString("es-CO") : "-",
      categoria: item.categoriaCat?.nombre ?? "-",
      cantidad: `${item.cantidad} ${UNIDAD_ABREVIADAS[item.unidadMedida] ?? item.unidadMedida}`,
      disponible: `${item.cantidad - (prestadosPorItem.get(item.id) ?? 0)} ${UNIDAD_ABREVIADAS[item.unidadMedida] ?? item.unidadMedida}`,
      estado: ESTADO_LABELS_EXCEL[item.estado] ?? item.estado,
      ubicacion: item.ubicacionCat?.nombre ?? "-",
      proveedor: item.proveedor?.nombre ?? "-",
      valor: item.valor ? Number(item.valor).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }) : "-",
    }))
  );

  doc.end();
});

itemsInventarioRouter.post("/", soloAvanzado, upload.single("foto"), async (req, res) => {
  const {
    nombre, categoriaId, codigo, descripcion, cantidad, stockMinimo, unidadMedida, estado, ubicacionId, proveedorId, fechaCompra, fechaIngreso, valor,
  } = req.body;
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: "El nombre es requerido" });

  const fotoUrl = req.file
    ? await guardarArchivo("inventario", req.file.buffer, req.file.originalname, req.file.mimetype)
    : null;

  try {
    const item = await prisma.itemInventario.create({
      data: {
        nombre: String(nombre).trim(),
        categoriaId: categoriaId ? Number(categoriaId) : null,
        codigo: codigo || null,
        descripcion: descripcion || null,
        cantidad: cantidad ? Number(cantidad) : 1,
        stockMinimo: stockMinimo ? Number(stockMinimo) : null,
        unidadMedida: unidadMedida || "unidad",
        estado: estado || "bueno",
        ubicacionId: ubicacionId ? Number(ubicacionId) : null,
        proveedorId: proveedorId ? Number(proveedorId) : null,
        fechaCompra: fechaCompra ? new Date(fechaCompra) : null,
        fechaIngreso: fechaIngreso ? new Date(fechaIngreso) : null,
        valor: valor ? Number(valor) : null,
        ingresadoPorId: req.usuario!.id,
        fotoUrl,
      },
      include: includeCatalogos,
    });
    res.status(201).json({ ...item, disponible: item.cantidad, stockBajo: item.stockMinimo != null && item.cantidad <= item.stockMinimo });
  } catch (err: any) {
    // Si la foto ya se subió a MinIO pero el registro no se pudo crear (ej. código duplicado),
    // no dejar el archivo huérfano — sin este cleanup, cualquier intento fallido de crear un
    // ítem con foto deja basura acumulándose en el bucket para siempre.
    if (fotoUrl) await borrarArchivo(fotoUrl);
    if (err?.code === "P2002") return res.status(400).json({ error: "Ya existe un ítem con ese código" });
    throw err;
  }
});

itemsInventarioRouter.put("/:id", soloAvanzado, upload.single("foto"), async (req, res) => {
  const id = Number(req.params.id);
  const existente = await prisma.itemInventario.findUnique({ where: { id }, include: includeCatalogos });
  if (!existente) return res.status(404).json({ error: "No encontrado" });

  const {
    nombre, categoriaId, codigo, descripcion, cantidad, stockMinimo, unidadMedida, estado, ubicacionId, proveedorId, fechaCompra, fechaIngreso, valor, quitarFoto,
  } = req.body;

  let fotoUrl: string | null | undefined;
  if (req.file) {
    fotoUrl = await guardarArchivo("inventario", req.file.buffer, req.file.originalname, req.file.mimetype);
  } else if (quitarFoto === "true") {
    fotoUrl = null;
  }

  try {
    const item = await prisma.itemInventario.update({
      where: { id },
      data: {
        nombre: nombre !== undefined ? String(nombre).trim() : undefined,
        categoriaId: categoriaId !== undefined ? (categoriaId ? Number(categoriaId) : null) : undefined,
        codigo: codigo !== undefined ? codigo || null : undefined,
        descripcion: descripcion !== undefined ? descripcion || null : undefined,
        cantidad: cantidad !== undefined ? Number(cantidad) : undefined,
        stockMinimo: stockMinimo !== undefined ? (stockMinimo ? Number(stockMinimo) : null) : undefined,
        unidadMedida: unidadMedida !== undefined ? unidadMedida : undefined,
        estado: estado !== undefined ? estado : undefined,
        ubicacionId: ubicacionId !== undefined ? (ubicacionId ? Number(ubicacionId) : null) : undefined,
        proveedorId: proveedorId !== undefined ? (proveedorId ? Number(proveedorId) : null) : undefined,
        fechaCompra: fechaCompra !== undefined ? (fechaCompra ? new Date(fechaCompra) : null) : undefined,
        fechaIngreso: fechaIngreso !== undefined ? (fechaIngreso ? new Date(fechaIngreso) : null) : undefined,
        valor: valor !== undefined ? (valor ? Number(valor) : null) : undefined,
        fotoUrl,
      },
      include: includeCatalogos,
    });
    if (fotoUrl !== undefined && existente.fotoUrl) await borrarArchivo(existente.fotoUrl);
    await registrarCambios("item_inventario", item.id, camposItemInventario(existente), camposItemInventario(item), req.usuario?.id);
    const disponible = await disponibilidad(item.id, item.cantidad);
    res.json({ ...item, disponible, stockBajo: item.stockMinimo != null && disponible <= item.stockMinimo });
  } catch (err: any) {
    // Mismo cleanup que en el POST: si se subió una foto nueva pero el UPDATE falló, no dejarla
    // huérfana (la foto vieja del ítem sigue intacta, no se toca).
    if (req.file && fotoUrl) await borrarArchivo(fotoUrl);
    if (err?.code === "P2002") return res.status(400).json({ error: "Ya existe un ítem con ese código" });
    throw err;
  }
});

// El borrado es definitivo solo si el ítem nunca tuvo préstamos (activos o ya devueltos) — la
// tabla PrestamoInventario tiene una FK RESTRICT hacia acá, así que CUALQUIER préstamo histórico
// bloquea el DELETE a nivel de base de datos, no solo los que siguen sin devolver. Si tiene
// historial, se marca como inactivo (no aparece en el listado) en vez de borrarlo, para no perder
// el rastro de quién tuvo qué prestado.
itemsInventarioRouter.delete("/:id", soloAvanzado, async (req, res) => {
  const id = Number(req.params.id);
  const item = await prisma.itemInventario.findUnique({ where: { id }, include: includeCatalogos });
  if (!item) return res.status(404).json({ error: "No encontrado" });

  const prestamosActivos = await prisma.prestamoInventario.count({ where: { itemId: id, fechaDevolucion: null } });
  if (prestamosActivos > 0) {
    return res.status(400).json({ error: "No se puede eliminar: hay préstamos activos de este ítem" });
  }

  const tieneHistorial = await prisma.prestamoInventario.count({ where: { itemId: id } });
  const tieneMovimientos = await prisma.movimientoInventario.count({ where: { itemId: id } });
  if (tieneHistorial > 0 || tieneMovimientos > 0) {
    const inactivo = await prisma.itemInventario.update({ where: { id }, data: { activo: false }, include: includeCatalogos });
    await registrarCambios("item_inventario", id, camposItemInventario(item), camposItemInventario(inactivo), req.usuario?.id);
    return res.status(204).end();
  }

  await prisma.itemInventario.delete({ where: { id } });
  if (item.fotoUrl) await borrarArchivo(item.fotoUrl);

  res.status(204).end();
});

// Préstamos: historial y activos. Filtros opcionales por itemId, usuarioId, "activos=true"
// (solo los que no tienen fechaDevolucion) y "vencidos=true" (sin devolver y con
// fechaEsperadaDevolucion ya pasada).
prestamosInventarioRouter.get("/", async (req, res) => {
  const { itemId, usuarioId, activos, vencidos } = req.query;
  const filtros: any[] = [];
  if (itemId) filtros.push({ itemId: Number(itemId) });
  if (usuarioId) filtros.push({ usuarioId: Number(usuarioId) });
  if (activos === "true") filtros.push({ fechaDevolucion: null });
  if (vencidos === "true") {
    filtros.push({ fechaDevolucion: null }, { fechaEsperadaDevolucion: { lt: new Date() } });
  }
  const where = filtros.length ? { AND: filtros } : {};

  const prestamos = await prisma.prestamoInventario.findMany({
    where,
    include: { item: true, usuario: { select: { id: true, nombre: true } } },
    orderBy: { fechaEntrega: "desc" },
  });
  res.json(prestamos);
});

// "Vencido" = sigue sin devolver y ya pasó la fecha esperada de devolución (si se registró una).
function estadoPrestamo(p: { fechaDevolucion: Date | null; fechaEsperadaDevolucion: Date | null }): string {
  if (p.fechaDevolucion) return "Devuelto";
  if (p.fechaEsperadaDevolucion && p.fechaEsperadaDevolucion < new Date()) return "Vencido";
  return "Sin devolver";
}

prestamosInventarioRouter.get("/excel", async (req, res) => {
  const { itemId, usuarioId, activos } = req.query;
  const filtros: any[] = [];
  if (itemId) filtros.push({ itemId: Number(itemId) });
  if (usuarioId) filtros.push({ usuarioId: Number(usuarioId) });
  if (activos === "true") filtros.push({ fechaDevolucion: null });
  const where = filtros.length ? { AND: filtros } : {};

  const prestamos = await prisma.prestamoInventario.findMany({
    where,
    include: { item: true, usuario: { select: { id: true, nombre: true } } },
    orderBy: { fechaEntrega: "desc" },
  });

  const filas = prestamos.map((p) => ({
    item: p.item.nombre,
    cantidad: p.cantidad,
    responsable: p.usuario.nombre,
    entrega: p.fechaEntrega.toISOString().slice(0, 10),
    esperada: p.fechaEsperadaDevolucion ? p.fechaEsperadaDevolucion.toISOString().slice(0, 10) : "",
    devolucion: p.fechaDevolucion ? p.fechaDevolucion.toISOString().slice(0, 10) : "",
    estado: estadoPrestamo(p),
    observaciones: p.observaciones ?? "",
  }));

  const buffer = await crearInformeExcel(
    "Préstamos",
    "Inventario general",
    `Préstamos · ${filas.length} registro${filas.length === 1 ? "" : "s"} · ${fechaLegibleColombia()}`,
    [
      { titulo: "ÍTEM", clave: "item", ancho: 26 },
      { titulo: "CANTIDAD", clave: "cantidad", ancho: 11 },
      { titulo: "RESPONSABLE", clave: "responsable", ancho: 22 },
      { titulo: "FECHA DE ENTREGA", clave: "entrega", ancho: 16 },
      { titulo: "DEVOLUCIÓN ESPERADA", clave: "esperada", ancho: 18 },
      { titulo: "FECHA DE DEVOLUCIÓN", clave: "devolucion", ancho: 18 },
      { titulo: "ESTADO", clave: "estado", ancho: 14 },
      { titulo: "OBSERVACIONES", clave: "observaciones", ancho: 30 },
    ],
    filas
  );
  enviarExcel(res, buffer, "inventario_prestamos.xlsx");
});

prestamosInventarioRouter.get("/pdf", async (req, res) => {
  const { itemId, usuarioId, activos } = req.query;
  const filtros: any[] = [];
  if (itemId) filtros.push({ itemId: Number(itemId) });
  if (usuarioId) filtros.push({ usuarioId: Number(usuarioId) });
  if (activos === "true") filtros.push({ fechaDevolucion: null });
  const where = filtros.length ? { AND: filtros } : {};

  const prestamos = await prisma.prestamoInventario.findMany({
    where,
    include: { item: true, usuario: { select: { id: true, nombre: true } } },
    orderBy: { fechaEntrega: "desc" },
  });

  enviarPdf(res, "inventario_prestamos.pdf");
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);
  encabezadoPdf(doc, "Inventario general", `Préstamos · ${prestamos.length} registro${prestamos.length === 1 ? "" : "s"} · ${fechaLegibleColombia()}`);

  tablaInventarioPdf(
    doc,
    [
      { titulo: "ÍTEM", clave: "item", ancho: 130 },
      { titulo: "CANT.", clave: "cantidad", ancho: 40, align: "right" },
      { titulo: "RESPONSABLE", clave: "responsable", ancho: 110 },
      { titulo: "ENTREGA", clave: "entrega", ancho: 60 },
      { titulo: "DEV. ESPERADA", clave: "esperada", ancho: 65 },
      { titulo: "DEVOLUCIÓN", clave: "devolucion", ancho: 65 },
      { titulo: "ESTADO", clave: "estado", ancho: 50 },
    ],
    prestamos.map((p) => ({
      item: p.item.nombre,
      cantidad: String(p.cantidad),
      responsable: p.usuario.nombre,
      entrega: p.fechaEntrega.toISOString().slice(0, 10),
      esperada: p.fechaEsperadaDevolucion ? p.fechaEsperadaDevolucion.toISOString().slice(0, 10) : "-",
      devolucion: p.fechaDevolucion ? p.fechaDevolucion.toISOString().slice(0, 10) : "-",
      estado: estadoPrestamo(p),
    }))
  );

  doc.end();
});

prestamosInventarioRouter.post("/", soloAvanzado, async (req, res) => {
  const { itemId, usuarioId, cantidad, observaciones, fechaEsperadaDevolucion } = req.body;
  if (!itemId || !usuarioId) return res.status(400).json({ error: "itemId y usuarioId son requeridos" });

  const item = await prisma.itemInventario.findUnique({ where: { id: Number(itemId) } });
  if (!item) return res.status(404).json({ error: "Ítem no encontrado" });

  const cantidadPrestada = cantidad ? Number(cantidad) : 1;
  const disponible = await disponibilidad(item.id, item.cantidad);
  if (cantidadPrestada > disponible) {
    return res.status(400).json({ error: `Solo hay ${disponible} disponible(s) de este ítem` });
  }

  const prestamo = await prisma.prestamoInventario.create({
    data: {
      itemId: Number(itemId),
      usuarioId: Number(usuarioId),
      cantidad: cantidadPrestada,
      observaciones: observaciones || null,
      fechaEsperadaDevolucion: fechaEsperadaDevolucion ? new Date(fechaEsperadaDevolucion) : null,
    },
    include: { item: true, usuario: { select: { id: true, nombre: true } } },
  });
  res.status(201).json(prestamo);
});

// Edita cantidad/responsable/observaciones de un préstamo ya creado (para corregir errores de
// captura). El ítem prestado no se puede reasignar acá — si se equivocaron de ítem, es más
// simple borrar y volver a asignar. Si el préstamo sigue activo y se sube la cantidad, se valida
// contra lo disponible SIN contar la reserva actual de este mismo préstamo (si no, siempre daría
// "no disponible" porque el propio préstamo ya está restando esa cantidad).
prestamosInventarioRouter.put("/:id", soloAvanzado, async (req, res) => {
  const id = Number(req.params.id);
  const prestamo = await prisma.prestamoInventario.findUnique({ where: { id } });
  if (!prestamo) return res.status(404).json({ error: "No encontrado" });

  const { usuarioId, cantidad, observaciones, fechaEsperadaDevolucion } = req.body;

  let nuevaCantidad = prestamo.cantidad;
  if (cantidad !== undefined) {
    nuevaCantidad = Number(cantidad);
    if (!Number.isFinite(nuevaCantidad) || nuevaCantidad <= 0) {
      return res.status(400).json({ error: "La cantidad debe ser mayor a 0" });
    }
    if (!prestamo.fechaDevolucion) {
      const item = await prisma.itemInventario.findUnique({ where: { id: prestamo.itemId } });
      if (!item) return res.status(404).json({ error: "Ítem no encontrado" });
      const otrosPrestados = await prisma.prestamoInventario.aggregate({
        where: { itemId: prestamo.itemId, fechaDevolucion: null, id: { not: id } },
        _sum: { cantidad: true },
      });
      const disponibleSinEste = item.cantidad - (otrosPrestados._sum.cantidad ?? 0);
      if (nuevaCantidad > disponibleSinEste) {
        return res.status(400).json({ error: `Solo hay ${disponibleSinEste} disponible(s) de este ítem` });
      }
    }
  }

  const actualizado = await prisma.prestamoInventario.update({
    where: { id },
    data: {
      cantidad: nuevaCantidad,
      usuarioId: usuarioId !== undefined ? Number(usuarioId) : undefined,
      observaciones: observaciones !== undefined ? observaciones || null : undefined,
      fechaEsperadaDevolucion:
        fechaEsperadaDevolucion !== undefined ? (fechaEsperadaDevolucion ? new Date(fechaEsperadaDevolucion) : null) : undefined,
    },
    include: { item: true, usuario: { select: { id: true, nombre: true } } },
  });
  res.json(actualizado);
});

prestamosInventarioRouter.put("/:id/devolver", soloAvanzado, async (req, res) => {
  const id = Number(req.params.id);
  const prestamo = await prisma.prestamoInventario.findUnique({ where: { id } });
  if (!prestamo) return res.status(404).json({ error: "No encontrado" });
  if (prestamo.fechaDevolucion) return res.status(400).json({ error: "Este préstamo ya fue devuelto" });

  const actualizado = await prisma.prestamoInventario.update({
    where: { id },
    data: { fechaDevolucion: new Date() },
    include: { item: true, usuario: { select: { id: true, nombre: true } } },
  });
  res.json(actualizado);
});

prestamosInventarioRouter.delete("/:id", soloAvanzado, async (req, res) => {
  const id = Number(req.params.id);
  const prestamo = await prisma.prestamoInventario.findUnique({ where: { id } });
  if (!prestamo) return res.status(404).json({ error: "No encontrado" });

  await prisma.prestamoInventario.delete({ where: { id } });
  res.status(204).end();
});

// Entradas (compra, reposición) y salidas (consumo, ej. tubos usados en una instalación) de
// stock. A diferencia de un préstamo, una salida no se devuelve: ajusta directamente la
// cantidad total del ítem. Filtros opcionales por itemId y tipo.
movimientosInventarioRouter.get("/", async (req, res) => {
  const { itemId, tipo } = req.query;
  const filtros: any[] = [];
  if (itemId) filtros.push({ itemId: Number(itemId) });
  if (tipo) filtros.push({ tipo: String(tipo) });
  const where = filtros.length ? { AND: filtros } : {};

  const movimientos = await prisma.movimientoInventario.findMany({
    where,
    include: { item: true, usuario: { select: { id: true, nombre: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(movimientos);
});

movimientosInventarioRouter.get("/excel", async (req, res) => {
  const { itemId, tipo } = req.query;
  const filtros: any[] = [];
  if (itemId) filtros.push({ itemId: Number(itemId) });
  if (tipo) filtros.push({ tipo: String(tipo) });
  const where = filtros.length ? { AND: filtros } : {};

  const movimientos = await prisma.movimientoInventario.findMany({
    where,
    include: { item: true, usuario: { select: { id: true, nombre: true } } },
    orderBy: { createdAt: "desc" },
  });

  const filas = movimientos.map((m) => ({
    fecha: m.createdAt.toISOString().slice(0, 10),
    tipo: m.tipo === "entrada" ? "Entrada" : m.tipo === "salida" ? "Salida" : "Transferencia",
    item: m.item.nombre,
    cantidad: m.cantidad,
    motivo: m.motivo ?? "",
    observaciones: m.observaciones ?? "",
    registradoPor: m.usuario?.nombre ?? "",
  }));

  const buffer = await crearInformeExcel(
    "Movimientos",
    "Inventario general",
    `Entradas y salidas · ${filas.length} registro${filas.length === 1 ? "" : "s"} · ${fechaLegibleColombia()}`,
    [
      { titulo: "FECHA", clave: "fecha", ancho: 14 },
      { titulo: "TIPO", clave: "tipo", ancho: 12 },
      { titulo: "ÍTEM", clave: "item", ancho: 26 },
      { titulo: "CANTIDAD", clave: "cantidad", ancho: 11 },
      { titulo: "MOTIVO", clave: "motivo", ancho: 24 },
      { titulo: "OBSERVACIONES", clave: "observaciones", ancho: 28 },
      { titulo: "REGISTRADO POR", clave: "registradoPor", ancho: 20 },
    ],
    filas
  );
  enviarExcel(res, buffer, "inventario_movimientos.xlsx");
});

movimientosInventarioRouter.get("/pdf", async (req, res) => {
  const { itemId, tipo } = req.query;
  const filtros: any[] = [];
  if (itemId) filtros.push({ itemId: Number(itemId) });
  if (tipo) filtros.push({ tipo: String(tipo) });
  const where = filtros.length ? { AND: filtros } : {};

  const movimientos = await prisma.movimientoInventario.findMany({
    where,
    include: { item: true, usuario: { select: { id: true, nombre: true } } },
    orderBy: { createdAt: "desc" },
  });

  enviarPdf(res, "inventario_movimientos.pdf");
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);
  encabezadoPdf(doc, "Inventario general", `Entradas y salidas · ${movimientos.length} registro${movimientos.length === 1 ? "" : "s"} · ${fechaLegibleColombia()}`);

  tablaInventarioPdf(
    doc,
    [
      { titulo: "FECHA", clave: "fecha", ancho: 60 },
      { titulo: "TIPO", clave: "tipo", ancho: 55 },
      { titulo: "ÍTEM", clave: "item", ancho: 140 },
      { titulo: "CANT.", clave: "cantidad", ancho: 45, align: "right" },
      { titulo: "MOTIVO", clave: "motivo", ancho: 110 },
      { titulo: "REGISTRÓ", clave: "registro", ancho: 105 },
    ],
    movimientos.map((m) => ({
      fecha: m.createdAt.toISOString().slice(0, 10),
      tipo: m.tipo === "entrada" ? "Entrada" : m.tipo === "salida" ? "Salida" : "Transferencia",
      item: m.item.nombre,
      cantidad: String(m.cantidad),
      motivo: m.motivo ?? "-",
      registro: m.usuario?.nombre ?? "-",
    }))
  );

  doc.end();
});

movimientosInventarioRouter.post("/", soloAvanzado, async (req, res) => {
  const { itemId, tipo, cantidad, motivo, observaciones } = req.body;
  if (!itemId || !tipo || !cantidad) {
    return res.status(400).json({ error: "itemId, tipo y cantidad son requeridos" });
  }
  if (tipo !== "entrada" && tipo !== "salida") {
    return res.status(400).json({ error: "tipo debe ser 'entrada' o 'salida'" });
  }

  const item = await prisma.itemInventario.findUnique({ where: { id: Number(itemId) } });
  if (!item) return res.status(404).json({ error: "Ítem no encontrado" });

  const cantidadMovida = Number(cantidad);
  if (cantidadMovida <= 0) return res.status(400).json({ error: "La cantidad debe ser mayor a 0" });

  if (tipo === "salida") {
    const disponible = await disponibilidad(item.id, item.cantidad);
    if (cantidadMovida > disponible) {
      return res.status(400).json({ error: `Solo hay ${disponible} disponible(s) de este ítem` });
    }
  }

  const [movimiento] = await prisma.$transaction([
    prisma.movimientoInventario.create({
      data: {
        itemId: item.id,
        tipo,
        cantidad: cantidadMovida,
        motivo: motivo || null,
        observaciones: observaciones || null,
        usuarioId: req.usuario!.id,
      },
      include: { item: true, usuario: { select: { id: true, nombre: true } } },
    }),
    prisma.itemInventario.update({
      where: { id: item.id },
      data: { cantidad: { [tipo === "entrada" ? "increment" : "decrement"]: cantidadMovida } },
    }),
  ]);

  res.status(201).json(movimiento);
});

// Transferencia entre ubicaciones: no toca "cantidad" (a diferencia de entrada/salida), solo
// cambia ubicacionId del ítem. Se registra como MovimientoInventario (tipo "transferencia") para
// que quede en el mismo historial de Entradas/Salidas, y también genera su entrada en el
// historial de cambios del ítem (vía registrarCambios, mismo mecanismo que el resto de ediciones).
movimientosInventarioRouter.post("/transferencia", soloAvanzado, async (req, res) => {
  const { itemId, ubicacionId, observaciones } = req.body;
  if (!itemId) return res.status(400).json({ error: "itemId es requerido" });

  const item = await prisma.itemInventario.findUnique({ where: { id: Number(itemId) }, include: includeCatalogos });
  if (!item) return res.status(404).json({ error: "Ítem no encontrado" });

  const nuevaUbicacionId = ubicacionId ? Number(ubicacionId) : null;
  if (nuevaUbicacionId === item.ubicacionId) {
    return res.status(400).json({ error: "El ítem ya está en esa ubicación" });
  }

  const nuevaUbicacion = nuevaUbicacionId
    ? await prisma.ubicacionInventario.findUnique({ where: { id: nuevaUbicacionId } })
    : null;
  if (nuevaUbicacionId && !nuevaUbicacion) return res.status(404).json({ error: "Ubicación no encontrada" });

  const origenNombre = item.ubicacionCat?.nombre ?? "sin ubicación";
  const destinoNombre = nuevaUbicacion?.nombre ?? "sin ubicación";

  const [, movimiento] = await prisma.$transaction([
    prisma.itemInventario.update({ where: { id: item.id }, data: { ubicacionId: nuevaUbicacionId } }),
    prisma.movimientoInventario.create({
      data: {
        itemId: item.id,
        tipo: "transferencia",
        cantidad: item.cantidad,
        motivo: `De "${origenNombre}" a "${destinoNombre}"`,
        observaciones: observaciones || null,
        usuarioId: req.usuario!.id,
      },
      include: { item: true, usuario: { select: { id: true, nombre: true } } },
    }),
  ]);

  const itemActualizado = await prisma.itemInventario.findUnique({ where: { id: item.id }, include: includeCatalogos });
  await registrarCambios(
    "item_inventario",
    item.id,
    camposItemInventario(item),
    camposItemInventario(itemActualizado!),
    req.usuario?.id
  );

  res.status(201).json(movimiento);
});

movimientosInventarioRouter.delete("/:id", soloAvanzado, async (req, res) => {
  const id = Number(req.params.id);
  const movimiento = await prisma.movimientoInventario.findUnique({ where: { id } });
  if (!movimiento) return res.status(404).json({ error: "No encontrado" });

  // Una transferencia no tocó "cantidad" al crearse (solo cambió ubicacionId), así que borrarla
  // tampoco debe tocarla — a diferencia de entrada/salida, que sí hay que revertir.
  await prisma.$transaction([
    ...(movimiento.tipo === "entrada" || movimiento.tipo === "salida"
      ? [
          prisma.itemInventario.update({
            where: { id: movimiento.itemId },
            data: { cantidad: { [movimiento.tipo === "entrada" ? "decrement" : "increment"]: movimiento.cantidad } },
          }),
        ]
      : []),
    prisma.movimientoInventario.delete({ where: { id } }),
  ]);

  res.status(204).end();
});

// Resumen para la pestaña "Dashboard" de Inventario general: conteos, valor total y
// distribución por categoría/estado/movimientos de los últimos 6 meses.
inventarioKpisRouter.get("/", async (_req, res) => {
  const [items, itemsConMinimo, prestamosActivos, prestamosVencidos, categorias, estados, movimientos] = await Promise.all([
    prisma.itemInventario.findMany({ where: { activo: true }, select: { cantidad: true, valor: true } }),
    prisma.itemInventario.findMany({
      where: { activo: true, stockMinimo: { not: null } },
      select: { id: true, cantidad: true, stockMinimo: true },
    }),
    prisma.prestamoInventario.count({ where: { fechaDevolucion: null } }),
    prisma.prestamoInventario.count({ where: { fechaDevolucion: null, fechaEsperadaDevolucion: { lt: new Date() } } }),
    prisma.itemInventario.groupBy({
      by: ["categoriaId"],
      where: { activo: true },
      _count: { _all: true },
    }),
    prisma.itemInventario.groupBy({
      by: ["estado"],
      where: { activo: true },
      _count: { _all: true },
    }),
    prisma.movimientoInventario.findMany({
      where: { createdAt: { gte: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 5, 1)) } },
      select: { tipo: true, cantidad: true, createdAt: true },
    }),
  ]);

  const totalItems = items.length;
  const valorTotalInventario = items.reduce((acc, i) => acc + i.cantidad * Number(i.valor ?? 0), 0);

  // "disponible" real (descontando préstamos activos) para cada ítem con umbral configurado.
  const prestadosPorItem = itemsConMinimo.length
    ? new Map(
        (
          await prisma.prestamoInventario.groupBy({
            by: ["itemId"],
            where: { itemId: { in: itemsConMinimo.map((i) => i.id) }, fechaDevolucion: null },
            _sum: { cantidad: true },
          })
        ).map((p) => [p.itemId, p._sum.cantidad ?? 0])
      )
    : new Map<number, number>();
  const itemsStockBajo = itemsConMinimo.filter(
    (i) => i.cantidad - (prestadosPorItem.get(i.id) ?? 0) <= (i.stockMinimo ?? 0)
  ).length;

  const categoriaIds = categorias.map((c) => c.categoriaId).filter((id): id is number => id !== null);
  const nombresCategoria = await prisma.categoriaInventario.findMany({ where: { id: { in: categoriaIds } } });
  const nombrePorCategoriaId = new Map(nombresCategoria.map((c) => [c.id, c.nombre]));
  const itemsPorCategoria = categorias.map((c) => ({
    categoria: c.categoriaId ? nombrePorCategoriaId.get(c.categoriaId) ?? "Sin categoría" : "Sin categoría",
    cantidad: c._count._all,
  }));

  const itemsPorEstado = estados.map((e) => ({ estado: e.estado, cantidad: e._count._all }));

  const porMes = new Map<string, { entradas: number; salidas: number }>();
  for (const m of movimientos) {
    const clave = `${m.createdAt.getUTCFullYear()}-${String(m.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const acumulado = porMes.get(clave) ?? { entradas: 0, salidas: 0 };
    if (m.tipo === "entrada") acumulado.entradas += m.cantidad;
    else if (m.tipo === "salida") acumulado.salidas += m.cantidad;
    porMes.set(clave, acumulado);
  }
  const movimientosPorMes = Array.from({ length: 6 }, (_, i) => {
    const fecha = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - (5 - i), 1));
    const clave = `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
    const acumulado = porMes.get(clave) ?? { entradas: 0, salidas: 0 };
    return { mes: clave, ...acumulado };
  });

  res.json({
    totalItems,
    valorTotalInventario,
    prestamosActivos,
    prestamosVencidos,
    itemsStockBajo,
    itemsPorCategoria,
    itemsPorEstado,
    movimientosPorMes,
  });
});
