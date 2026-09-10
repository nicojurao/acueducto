import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

export const offlineRouter = Router();

// "Modo de salida": trae TODO lo que el usuario podría necesitar consultar sin conexión, en una
// sola respuesta, para guardarlo en IndexedDB. A propósito NO incluye nada de MinIO (fotos,
// PDFs firmados, actas de calibración) — eso pesa demasiado y no aporta para trabajar en campo
// (tomar una lectura necesita los DATOS del medidor, no ver fotos viejas).
//
// Cada bloque se filtra por los permisos reales del usuario que pide el snapshot — los mismos
// permisos que ya gatean cada endpoint por separado (ver index.ts) — para que alguien con el rol
// Fontanero no termine con una copia local de Facturación o Inventario solo porque el endpoint
// "trae todo": si no puede verlo online, tampoco debería quedar guardado en su dispositivo.
offlineRouter.get("/snapshot", async (req, res) => {
  const permisos = req.usuario?.permisos ?? [];
  const tiene = (...ps: string[]) => ps.some((p) => permisos.includes(p));

  // El "núcleo" ya se comporta así hoy: GET /api/lecturas embebe datos del suscriptor sin exigir
  // "suscriptores_ver" aparte, y Suscriptores/Medidores se enlazan entre sí en la UI. Cualquiera
  // de estos permisos da acceso al núcleo completo (suscriptores, medidores, lecturas, catálogos,
  // actas, barrios/estratos).
  const puedeNucleo = tiene("lecturas", "suscriptores_ver", "suscriptores_avanzado", "medidores_ver", "medidores_avanzado");
  const puedeTerceros = tiene("suscriptores_ver", "suscriptores_avanzado", "facturacion_ver", "facturacion_avanzado");
  const puedeAforos = tiene("aforos_ver", "aforos_avanzado");
  const puedeInventario = tiene("inventario_ver", "inventario_avanzado");
  const puedeFacturacion = tiene("facturacion_ver", "facturacion_avanzado", "pagos_registrar");

  const [
    suscriptores,
    medidores,
    lecturas,
    novedadesLectura,
    barrios,
    estratos,
    marcas,
    modelos,
    diametros,
    variantes,
    lotes,
    actas,
    terceros,
    puntosAforo,
    aforos,
    categoriasInventario,
    ubicacionesInventario,
    proveedoresInventario,
    itemsInventario,
    prestamosInventario,
    movimientosInventario,
    tarifas,
    usuarios,
  ] = await Promise.all([
    puedeNucleo
      ? prisma.suscriptor.findMany({
          include: {
            medidores: {
              include: {
                cotitulares: { include: { suscriptor: true } },
                marcaCat: true,
                modeloCat: true,
                diametroCat: true,
                lote: true,
              },
            },
            cotitularDe: {
              include: { medidor: { include: { suscriptor: true, cotitulares: { include: { suscriptor: true } } } } },
            },
            barrioCat: true,
            estratoCat: true,
          },
        })
      : [],
    // "cotitulares" acá también: hace falta para reconstruir el histórico de consumo de un
    // suscriptor offline con el mismo reparto entero que usa historicoSuscriptor.ts (ver
    // frontend/src/lib/offlineSnapshot.ts).
    puedeNucleo
      ? prisma.medidor.findMany({
          include: { marcaCat: true, modeloCat: true, diametroCat: true, lote: true, suscriptor: true, cotitulares: true },
        })
      : [],
    puedeNucleo ? prisma.lectura.findMany() : [],
    puedeNucleo ? prisma.novedadLectura.findMany() : [],
    puedeNucleo ? prisma.barrio.findMany() : [],
    puedeNucleo ? prisma.estrato.findMany() : [],
    // Mismas formas que sus endpoints reales (GET /api/marcas, /api/modelos, /api/diametros,
    // /api/variantes) — así el fallback offline puede usarlas tal cual, sin traducir formas.
    puedeNucleo
      ? prisma.marcaMedidor
          .findMany({ include: { _count: { select: { modelos: true } } }, orderBy: { nombre: "asc" } })
          .then((rows) => rows.map((m) => ({ id: m.id, nombre: m.nombre, modelos: m._count.modelos })))
      : [],
    puedeNucleo
      ? prisma.modeloMedidor.findMany({ include: { marca: true, diametros: true, varianteCat: true }, orderBy: { nombre: "asc" } })
      : [],
    puedeNucleo ? prisma.diametroMedidor.findMany({ orderBy: { valor: "asc" } }) : [],
    puedeNucleo ? prisma.varianteMedidor.findMany() : [],
    puedeNucleo ? prisma.lote.findMany() : [],
    // Mismo include que GET /api/actas (incluye "usuario", que instaladoPor puede no reflejar).
    puedeNucleo
      ? prisma.actaInstalacion.findMany({
          include: {
            suscriptor: true,
            medidor: { include: { marcaCat: true, modeloCat: true, diametroCat: true } },
            usuario: { select: { id: true, nombre: true, activo: true } },
          },
          orderBy: { id: "desc" },
        })
      : [],
    puedeTerceros
      ? prisma.tercero.findMany({
          include: { suscriptores: { select: { id: true, codigo: true, nombre: true, ruta: true } } },
          orderBy: { nombre: "asc" },
        })
      : [],
    puedeAforos ? prisma.puntoAforo.findMany({ include: { _count: { select: { aforos: true } } }, orderBy: { nombre: "asc" } }) : [],
    puedeAforos ? prisma.aforo.findMany({ include: { puntoAforo: true, capturadoPor: { select: { nombre: true } } }, orderBy: { fecha: "desc" } }) : [],
    puedeInventario ? prisma.categoriaInventario.findMany({ include: { _count: { select: { items: true } } } }) : [],
    puedeInventario ? prisma.ubicacionInventario.findMany({ include: { _count: { select: { items: true } } } }) : [],
    puedeInventario ? prisma.proveedorInventario.findMany({ include: { _count: { select: { items: true } } } }) : [],
    puedeInventario
      ? prisma.itemInventario.findMany({
          where: { activo: true },
          include: {
            categoriaCat: true,
            ubicacionCat: true,
            proveedor: true,
            ingresadoPor: { select: { id: true, nombre: true } },
          },
        })
      : [],
    puedeInventario
      ? prisma.prestamoInventario.findMany({ include: { item: true, usuario: { select: { id: true, nombre: true } } }, orderBy: { fechaEntrega: "desc" } })
      : [],
    puedeInventario
      ? prisma.movimientoInventario.findMany({ include: { item: true, usuario: { select: { id: true, nombre: true } } }, orderBy: { createdAt: "desc" } })
      : [],
    puedeFacturacion ? prisma.tarifa.findMany() : [],
    // Solo id+nombre — nada sensible (ni contraseña ni cédula) — para poder mostrar "tomada por
    // fulano" en el histórico de consumo reconstruido offline (Lectura.capturadoPorId no viene
    // con el nombre embebido en la lista cruda de lecturas).
    puedeNucleo ? prisma.usuario.findMany({ select: { id: true, nombre: true } }) : [],
  ]);

  res.json({
    generadoEn: new Date().toISOString(),
    suscriptores,
    medidores,
    lecturas,
    novedadesLectura,
    barrios,
    estratos,
    marcas,
    modelos,
    diametros,
    variantes,
    lotes,
    actas,
    terceros,
    puntosAforo: puntosAforo.map((p: any) => ({ ...p, registros: p._count.aforos, _count: undefined })),
    aforos,
    categoriasInventario: categoriasInventario.map((c: any) => ({ id: c.id, nombre: c.nombre, items: c._count.items })),
    ubicacionesInventario: ubicacionesInventario.map((u: any) => ({ id: u.id, nombre: u.nombre, items: u._count.items })),
    proveedoresInventario: proveedoresInventario.map((p: any) => ({
      id: p.id,
      nombre: p.nombre,
      contacto: p.contacto,
      telefono: p.telefono,
      items: p._count.items,
    })),
    itemsInventario,
    prestamosInventario,
    movimientosInventario,
    tarifas,
    usuarios,
  });
});
