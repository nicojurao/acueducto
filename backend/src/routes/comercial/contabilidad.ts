import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requirePermiso } from "../../middleware/auth.js";
import { generarComprobanteGasto } from "../../lib/contabilidad/comprobantes.js";
import { libroDiario, libroMayor, estadoResultados, balanceGeneral } from "../../lib/contabilidad/libros.js";
import { crearInformeExcel, enviarExcel, type ColumnaExcel } from "../../lib/excelBranding.js";

function fechaOpcional(valor: unknown): Date | null {
  if (!valor) return null;
  const fecha = new Date(String(valor));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export const contabilidadRouter = Router();
const soloAvanzado = requirePermiso("contabilidad_avanzado");

const NATURALEZAS_VALIDAS = ["debito", "credito"];

// Nivel PUC por longitud de código: 1 clase, 2 grupo, 4 cuenta, 6 subcuenta, 8+ auxiliar — mismo
// criterio que documenta el modelo en schema.prisma (nivel = length(codigo), salvo el auxiliar
// que puede ser más largo según lo defina cada empresa).
function nivelPorCodigo(codigo: string): number {
  const longitud = codigo.length;
  if (longitud <= 1) return 1;
  if (longitud === 2) return 2;
  if (longitud <= 4) return 3;
  if (longitud <= 6) return 4;
  return 5;
}

// Encuentra el padre más específico posible: la cuenta activa existente cuyo código es el prefijo
// más largo del código nuevo (ej. para "110505" prueba "11050", "1105", "110", "11", "1" en ese
// orden). Evita que quien crea una cuenta tenga que buscar manualmente el padre correcto.
async function padrePorPrefijo(codigo: string): Promise<number | null> {
  for (let largo = codigo.length - 1; largo >= 1; largo--) {
    const prefijo = codigo.slice(0, largo);
    const candidato = await prisma.cuentaPuc.findUnique({ where: { codigo: prefijo } });
    if (candidato) return candidato.id;
  }
  return null;
}

contabilidadRouter.get("/puc", async (req, res) => {
  const soloActivas = req.query.activas === "true";
  const cuentas = await prisma.cuentaPuc.findMany({
    where: soloActivas ? { activa: true } : undefined,
    orderBy: { codigo: "asc" },
  });
  res.json(cuentas);
});

contabilidadRouter.post("/puc", soloAvanzado, async (req, res) => {
  const { codigo, nombre, naturaleza } = req.body;
  if (!codigo || !String(codigo).trim()) return res.status(400).json({ error: "El código es requerido" });
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: "El nombre es requerido" });
  if (!NATURALEZAS_VALIDAS.includes(naturaleza)) {
    return res.status(400).json({ error: "Naturaleza inválida (debito | credito)" });
  }
  const codigoLimpio = String(codigo).trim();

  try {
    const padreId = await padrePorPrefijo(codigoLimpio);
    const cuenta = await prisma.cuentaPuc.create({
      data: {
        codigo: codigoLimpio,
        nombre: String(nombre).trim(),
        naturaleza,
        nivel: nivelPorCodigo(codigoLimpio),
        padreId,
      },
    });
    res.status(201).json(cuenta);
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(400).json({ error: "Ya existe una cuenta con ese código" });
    throw err;
  }
});

// El código NO se puede editar una vez creada la cuenta: es su identidad contable y puede ya
// tener movimientos referenciándola por cuentaPucId — cambiar solo nombre/naturaleza/activa evita
// tener que recalcular jerarquía (padreId de otras cuentas) cada vez que alguien corrige un código.
contabilidadRouter.put("/puc/:id", soloAvanzado, async (req, res) => {
  const { nombre, naturaleza, activa } = req.body;
  const datos: Record<string, unknown> = {};
  if (nombre !== undefined) {
    if (!String(nombre).trim()) return res.status(400).json({ error: "El nombre es requerido" });
    datos.nombre = String(nombre).trim();
  }
  if (naturaleza !== undefined) {
    if (!NATURALEZAS_VALIDAS.includes(naturaleza)) {
      return res.status(400).json({ error: "Naturaleza inválida (debito | credito)" });
    }
    datos.naturaleza = naturaleza;
  }
  if (activa !== undefined) datos.activa = Boolean(activa);

  const cuenta = await prisma.cuentaPuc.findUnique({ where: { id: Number(req.params.id) } });
  if (!cuenta) return res.status(404).json({ error: "No encontrada" });

  const actualizada = await prisma.cuentaPuc.update({ where: { id: cuenta.id }, data: datos });
  res.json(actualizada);
});

contabilidadRouter.delete("/puc/:id", soloAvanzado, async (req, res) => {
  const cuenta = await prisma.cuentaPuc.findUnique({ where: { id: Number(req.params.id) } });
  if (!cuenta) return res.status(404).json({ error: "No encontrada" });

  const [hijos, movimientos] = await Promise.all([
    prisma.cuentaPuc.count({ where: { padreId: cuenta.id } }),
    prisma.movimientoContable.count({ where: { cuentaPucId: cuenta.id } }),
  ]);
  if (hijos > 0) return res.status(400).json({ error: "No se puede eliminar: tiene subcuentas" });
  if (movimientos > 0) {
    return res.status(400).json({ error: "No se puede eliminar: tiene movimientos contabilizados" });
  }

  await prisma.cuentaPuc.delete({ where: { id: cuenta.id } });
  res.status(204).end();
});

contabilidadRouter.get("/gastos", async (req, res) => {
  const { desde, hasta, page, limit } = req.query;
  const where: Record<string, unknown> = {};
  if (desde || hasta) {
    where.fecha = {
      ...(desde ? { gte: new Date(String(desde)) } : {}),
      ...(hasta ? { lte: new Date(String(hasta)) } : {}),
    };
  }
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 20);
  const [gastos, total] = await Promise.all([
    prisma.gasto.findMany({
      where,
      include: { tercero: { select: { nombre: true } }, cuentaGasto: { select: { codigo: true, nombre: true } } },
      orderBy: { fecha: "desc" },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.gasto.count({ where }),
  ]);
  res.json({ data: gastos, total, page: pageNum, limit: limitNum });
});

contabilidadRouter.post("/gastos", soloAvanzado, async (req, res) => {
  const { terceroId, cuentaGastoId, fecha, concepto, valor, ivaValor, numeroFactura, pagado } = req.body;
  if (!terceroId) return res.status(400).json({ error: "El tercero (proveedor) es requerido" });
  if (!cuentaGastoId) return res.status(400).json({ error: "La cuenta de gasto es requerida" });
  if (!concepto || !String(concepto).trim()) return res.status(400).json({ error: "El concepto es requerido" });
  const valorNum = Number(valor);
  if (!valorNum || valorNum <= 0) return res.status(400).json({ error: "El valor debe ser mayor a cero" });
  const ivaNum = Number(ivaValor) || 0;

  const cuenta = await prisma.cuentaPuc.findUnique({ where: { id: Number(cuentaGastoId) } });
  if (!cuenta) return res.status(400).json({ error: "La cuenta de gasto no existe" });

  const gasto = await prisma.$transaction(async (tx) => {
    const gasto = await tx.gasto.create({
      data: {
        terceroId: Number(terceroId),
        cuentaGastoId: Number(cuentaGastoId),
        fecha: fecha ? new Date(fecha) : new Date(),
        concepto: String(concepto).trim(),
        valor: valorNum,
        ivaValor: ivaNum,
        numeroFactura: numeroFactura ? String(numeroFactura).trim() : null,
        pagado: pagado !== undefined ? Boolean(pagado) : true,
        registradoPorId: req.usuario?.id ?? null,
      },
      include: { tercero: { select: { nombre: true } }, cuentaGasto: { select: { codigo: true, nombre: true } } },
    });
    await generarComprobanteGasto(tx, gasto.id, gasto.cuentaGastoId, valorNum + ivaNum, gasto.pagado, gasto.terceroId);
    return gasto;
  });
  res.status(201).json(gasto);
});

contabilidadRouter.get("/libro-diario", async (req, res) => {
  const desde = fechaOpcional(req.query.desde);
  const hasta = fechaOpcional(req.query.hasta);
  const comprobantes = await libroDiario(desde, hasta);

  if (req.query.formato !== "excel") return res.json(comprobantes);

  const columnas: ColumnaExcel[] = [
    { titulo: "FECHA", clave: "fecha", ancho: 12 },
    { titulo: "COMPROBANTE", clave: "numero", ancho: 14 },
    { titulo: "CUENTA", clave: "cuenta", ancho: 40 },
    { titulo: "TERCERO", clave: "tercero", ancho: 24 },
    { titulo: "DÉBITO", clave: "debito", ancho: 14 },
    { titulo: "CRÉDITO", clave: "credito", ancho: 14 },
  ];
  const filas = comprobantes.flatMap((c) =>
    c.movimientos.map((m) => ({
      fecha: c.fecha.toLocaleDateString("es-CO"),
      numero: `${c.tipo} #${c.numero}`,
      cuenta: `${m.cuentaPuc.codigo} — ${m.cuentaPuc.nombre}`,
      tercero: m.tercero?.nombre ?? "",
      debito: Number(m.debito) || "",
      credito: Number(m.credito) || "",
    }))
  );
  const subtitulo = desde || hasta ? `Del ${desde?.toLocaleDateString("es-CO") ?? "inicio"} al ${hasta?.toLocaleDateString("es-CO") ?? "hoy"}` : "Histórico completo";
  const buffer = await crearInformeExcel("Libro diario", "Libro diario", subtitulo, columnas, filas);
  enviarExcel(res, buffer, "libro-diario.xlsx");
});

contabilidadRouter.get("/libro-mayor", async (req, res) => {
  const desde = fechaOpcional(req.query.desde);
  const hasta = fechaOpcional(req.query.hasta);
  const cuentaId = req.query.cuentaId ? Number(req.query.cuentaId) : undefined;
  const resultado = await libroMayor(desde, hasta, cuentaId);

  if (req.query.formato !== "excel") return res.json(resultado);

  const columnas: ColumnaExcel[] = [
    { titulo: "FECHA", clave: "fecha", ancho: 12 },
    { titulo: "CUENTA", clave: "cuenta", ancho: 40 },
    { titulo: "COMPROBANTE", clave: "numero", ancho: 14 },
    { titulo: "TERCERO", clave: "tercero", ancho: 24 },
    { titulo: "DÉBITO", clave: "debito", ancho: 14 },
    { titulo: "CRÉDITO", clave: "credito", ancho: 14 },
  ];
  const filas = resultado.movimientos.map((m) => ({
    fecha: m.comprobante.fecha.toLocaleDateString("es-CO"),
    cuenta: `${m.cuentaPuc.codigo} — ${m.cuentaPuc.nombre}`,
    numero: `${m.comprobante.tipo} #${m.comprobante.numero}`,
    tercero: m.tercero?.nombre ?? "",
    debito: Number(m.debito) || "",
    credito: Number(m.credito) || "",
  }));
  const buffer = await crearInformeExcel("Libro mayor", "Libro mayor", "Movimientos por cuenta", columnas, filas);
  enviarExcel(res, buffer, "libro-mayor.xlsx");
});

contabilidadRouter.get("/estado-resultados", async (req, res) => {
  const desde = fechaOpcional(req.query.desde) ?? new Date(new Date().getFullYear(), 0, 1);
  const hasta = fechaOpcional(req.query.hasta) ?? new Date();
  const resultado = await estadoResultados(desde, hasta);

  if (req.query.formato !== "excel") return res.json(resultado);

  const columnas: ColumnaExcel[] = [
    { titulo: "CUENTA", clave: "cuenta", ancho: 40 },
    { titulo: "VALOR", clave: "valor", ancho: 16 },
  ];
  const filas = [
    ...resultado.ingresos.map((s) => ({ cuenta: `${s.codigo} — ${s.nombre}`, valor: s.saldo })),
    { cuenta: "TOTAL INGRESOS", valor: resultado.totalIngresos },
    ...resultado.gastos.map((s) => ({ cuenta: `${s.codigo} — ${s.nombre}`, valor: -s.saldo })),
    ...resultado.costos.map((s) => ({ cuenta: `${s.codigo} — ${s.nombre}`, valor: -s.saldo })),
    { cuenta: "TOTAL GASTOS Y COSTOS", valor: -(resultado.totalGastos + resultado.totalCostos) },
    { cuenta: "UTILIDAD / PÉRDIDA DEL EJERCICIO", valor: resultado.utilidad },
  ];
  const subtitulo = `Del ${desde.toLocaleDateString("es-CO")} al ${hasta.toLocaleDateString("es-CO")}`;
  const buffer = await crearInformeExcel("Estado de resultados", "Estado de resultados", subtitulo, columnas, filas);
  enviarExcel(res, buffer, "estado-resultados.xlsx");
});

contabilidadRouter.get("/balance-general", async (req, res) => {
  const corte = fechaOpcional(req.query.corte) ?? new Date();
  const resultado = await balanceGeneral(corte);

  if (req.query.formato !== "excel") return res.json(resultado);

  const columnas: ColumnaExcel[] = [
    { titulo: "CUENTA", clave: "cuenta", ancho: 40 },
    { titulo: "VALOR", clave: "valor", ancho: 16 },
  ];
  const filas = [
    ...resultado.activo.map((s) => ({ cuenta: `${s.codigo} — ${s.nombre}`, valor: s.saldo })),
    { cuenta: "TOTAL ACTIVO", valor: resultado.totalActivo },
    ...resultado.pasivo.map((s) => ({ cuenta: `${s.codigo} — ${s.nombre}`, valor: s.saldo })),
    { cuenta: "TOTAL PASIVO", valor: resultado.totalPasivo },
    ...resultado.patrimonio.map((s) => ({ cuenta: `${s.codigo} — ${s.nombre}`, valor: s.saldo })),
    { cuenta: "Resultado del ejercicio (no cerrado)", valor: resultado.resultadoEjercicio },
    { cuenta: "TOTAL PATRIMONIO", valor: resultado.totalPatrimonio },
  ];
  const subtitulo = `Corte al ${corte.toLocaleDateString("es-CO")}${resultado.cuadra ? "" : " · ⚠ NO CUADRA"}`;
  const buffer = await crearInformeExcel("Balance general", "Balance general", subtitulo, columnas, filas);
  enviarExcel(res, buffer, "balance-general.xlsx");
});
