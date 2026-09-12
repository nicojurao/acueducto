import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requirePermiso } from "../../middleware/auth.js";
import { obtenerEmpresa } from "../../lib/empresaCache.js";
import { generarAvisoMora, MESES_MORA_MINIMO } from "../../lib/suspensiones.js";

export const suspensionesRouter = Router();
const permisoVer = requirePermiso("suspensiones_ver", "suspensiones_avanzado");
const permisoAvanzado = requirePermiso("suspensiones_avanzado");

// Suscriptores que YA cumplen el mínimo legal de facturas pendientes para poder suspender, y que
// todavía no tienen una suspensión en trámite — no crea nada, solo informa. El staff decide desde
// acá a cuáles de estos candidatos les vale la pena iniciar el aviso.
suspensionesRouter.get("/candidatos", permisoVer, async (_req, res) => {
  const grupos = await prisma.factura.groupBy({
    by: ["suscriptorId"],
    where: { estado: "pendiente" },
    _count: { id: true },
    having: { id: { _count: { gte: MESES_MORA_MINIMO } } },
  });
  if (grupos.length === 0) return res.json([]);

  const suscriptorIds = grupos.map((g) => g.suscriptorId);
  const yaConSuspension = await prisma.suspension.findMany({
    where: { suscriptorId: { in: suscriptorIds }, estado: { in: ["pendiente", "aprobada", "ejecutada"] } },
    select: { suscriptorId: true },
  });
  const excluidos = new Set(yaConSuspension.map((s) => s.suscriptorId));
  const pendientesIds = suscriptorIds.filter((id) => !excluidos.has(id));
  if (pendientesIds.length === 0) return res.json([]);

  const suscriptores = await prisma.suscriptor.findMany({
    where: { id: { in: pendientesIds } },
    include: { facturas: { where: { estado: "pendiente" }, include: { pagos: true } } },
  });

  const candidatos = suscriptores.map((s) => {
    const saldoTotal = s.facturas.reduce((acc, f) => {
      const pagado = f.pagos.reduce((a, p) => a + Number(p.valor), 0);
      return acc + (Number(f.total) - pagado);
    }, 0);
    return { id: s.id, codigo: s.codigo, nombre: s.nombre, facturasPendientes: s.facturas.length, saldoTotal };
  });
  res.json(candidatos.sort((a, b) => b.facturasPendientes - a.facturasPendientes));
});

suspensionesRouter.get("/", permisoVer, async (req, res) => {
  const { suscriptorId, estado, page, limit } = req.query;
  const where: Record<string, unknown> = {};
  if (suscriptorId) where.suscriptorId = Number(suscriptorId);
  if (estado) where.estado = String(estado);
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 20);
  const [suspensiones, total] = await Promise.all([
    prisma.suspension.findMany({
      where,
      include: {
        suscriptor: { select: { codigo: true, nombre: true } },
        pqr: { select: { numeroRadicado: true } },
        aprobadaPor: { select: { nombre: true } },
        creadoPor: { select: { nombre: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.suspension.count({ where }),
  ]);
  res.json({ data: suspensiones, total, page: pageNum, limit: limitNum });
});

suspensionesRouter.post("/", permisoAvanzado, async (req, res) => {
  const { suscriptorId, tipo, motivo, numeroRadicadoPqr } = req.body;
  if (!suscriptorId) return res.status(400).json({ error: "El suscriptor es requerido" });
  if (tipo !== "mora" && tipo !== "mutuo_acuerdo") return res.status(400).json({ error: "Tipo inválido (mora | mutuo_acuerdo)" });
  if (!motivo || !String(motivo).trim()) return res.status(400).json({ error: "El motivo es requerido" });

  const suscriptor = await prisma.suscriptor.findUnique({ where: { id: Number(suscriptorId) } });
  if (!suscriptor) return res.status(404).json({ error: "Suscriptor no encontrado" });

  const activa = await prisma.suspension.findFirst({
    where: { suscriptorId: suscriptor.id, estado: { in: ["pendiente", "aprobada", "ejecutada"] } },
  });
  if (activa) return res.status(400).json({ error: "Este suscriptor ya tiene una suspensión activa o en trámite" });

  let pqrId: number | null = null;
  if (numeroRadicadoPqr) {
    const pqr = await prisma.pqr.findUnique({ where: { numeroRadicado: String(numeroRadicadoPqr).trim() } });
    if (!pqr) return res.status(400).json({ error: `No existe ninguna PQR con el radicado "${numeroRadicadoPqr}"` });
    pqrId = pqr.id;
  }

  let mesesMoraAlCrear: number | null = null;
  let textoAviso: string | null = null;
  if (tipo === "mora") {
    const facturasPendientes = await prisma.factura.findMany({
      where: { suscriptorId: suscriptor.id, estado: "pendiente" },
      include: { pagos: true },
    });
    mesesMoraAlCrear = facturasPendientes.length;
    if (mesesMoraAlCrear < MESES_MORA_MINIMO) {
      return res.status(400).json({
        error: `Este suscriptor solo tiene ${mesesMoraAlCrear} factura(s) pendiente(s) — el mínimo legal para suspender es ${MESES_MORA_MINIMO}`,
      });
    }
    const saldoTotal = facturasPendientes.reduce((acc, f) => {
      const pagado = f.pagos.reduce((a, p) => a + Number(p.valor), 0);
      return acc + (Number(f.total) - pagado);
    }, 0);
    const empresa = await obtenerEmpresa();
    textoAviso = generarAvisoMora({
      nombreEmpresa: empresa.nombre || "la empresa",
      suscriptorNombre: suscriptor.nombre,
      suscriptorCodigo: suscriptor.codigo,
      facturasPendientes: mesesMoraAlCrear,
      saldoTotal,
    });
  }

  const suspension = await prisma.suspension.create({
    data: {
      suscriptorId: suscriptor.id,
      tipo,
      motivo: String(motivo).trim(),
      mesesMoraAlCrear,
      textoAviso,
      pqrId,
      creadoPorId: req.usuario?.id ?? null,
    },
    include: { suscriptor: { select: { codigo: true, nombre: true } }, pqr: { select: { numeroRadicado: true } } },
  });
  res.status(201).json(suspension);
});

suspensionesRouter.post("/:id/aprobar", permisoAvanzado, async (req, res) => {
  const suspension = await prisma.suspension.findUnique({ where: { id: Number(req.params.id) } });
  if (!suspension) return res.status(404).json({ error: "No encontrada" });
  if (suspension.estado !== "pendiente") return res.status(400).json({ error: "Solo se puede aprobar una suspensión pendiente" });
  const actualizada = await prisma.suspension.update({
    where: { id: suspension.id },
    data: { estado: "aprobada", fechaAprobacion: new Date(), aprobadaPorId: req.usuario?.id ?? null },
  });
  res.json(actualizada);
});

// `valorCargoSuspension`/`valorCargoReconexion` son opcionales — si el staff los manda, se crea
// una Nota débito (ver POST /notas) por ese valor, que se aplica sola en la próxima factura del
// suscriptor (mismo mecanismo del ítem de Notas). No hay una tarifa fija configurada en ningún
// catálogo todavía — queda a criterio de quien ejecuta/reactiva cuánto cobrar cada vez.
suspensionesRouter.post("/:id/ejecutar", permisoAvanzado, async (req, res) => {
  const suspension = await prisma.suspension.findUnique({ where: { id: Number(req.params.id) } });
  if (!suspension) return res.status(404).json({ error: "No encontrada" });
  if (suspension.estado !== "aprobada") return res.status(400).json({ error: "Solo se puede ejecutar una suspensión ya aprobada" });
  const valorCargo = Number(req.body?.valorCargoSuspension);
  const actualizada = await prisma.$transaction(async (tx) => {
    await tx.suscriptor.update({ where: { id: suspension.suscriptorId }, data: { suspendido: true } });
    if (valorCargo > 0) {
      await tx.nota.create({
        data: {
          suscriptorId: suspension.suscriptorId,
          tipo: "debito",
          valor: Math.round(valorCargo),
          concepto: "Cargo por suspensión del servicio",
          pqrId: suspension.pqrId,
        },
      });
    }
    return tx.suspension.update({ where: { id: suspension.id }, data: { estado: "ejecutada", fechaEjecucion: new Date() } });
  });
  res.json(actualizada);
});

suspensionesRouter.post("/:id/reactivar", permisoAvanzado, async (req, res) => {
  const suspension = await prisma.suspension.findUnique({ where: { id: Number(req.params.id) } });
  if (!suspension) return res.status(404).json({ error: "No encontrada" });
  if (suspension.estado !== "ejecutada") return res.status(400).json({ error: "Solo se puede reactivar una suspensión ya ejecutada" });
  const valorCargo = Number(req.body?.valorCargoReconexion);
  const actualizada = await prisma.$transaction(async (tx) => {
    await tx.suscriptor.update({ where: { id: suspension.suscriptorId }, data: { suspendido: false } });
    if (valorCargo > 0) {
      await tx.nota.create({
        data: {
          suscriptorId: suspension.suscriptorId,
          tipo: "debito",
          valor: Math.round(valorCargo),
          concepto: "Cargo por reconexión del servicio",
          pqrId: suspension.pqrId,
        },
      });
    }
    return tx.suspension.update({ where: { id: suspension.id }, data: { estado: "reactivada", fechaReactivacion: new Date() } });
  });
  res.json(actualizada);
});

suspensionesRouter.post("/:id/cancelar", permisoAvanzado, async (req, res) => {
  const suspension = await prisma.suspension.findUnique({ where: { id: Number(req.params.id) } });
  if (!suspension) return res.status(404).json({ error: "No encontrada" });
  if (suspension.estado !== "pendiente" && suspension.estado !== "aprobada") {
    return res.status(400).json({ error: "Solo se puede cancelar antes de ejecutarla" });
  }
  await prisma.suspension.update({ where: { id: suspension.id }, data: { estado: "cancelada" } });
  res.status(204).end();
});
