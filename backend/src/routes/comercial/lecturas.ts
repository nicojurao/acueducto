import { Router } from "express";
import multer from "multer";
import { prisma } from "../../lib/prisma.js";
import { guardarArchivo, borrarArchivo } from "../../lib/storage.js";
import { registrarCambioLectura } from "../../lib/historial.js";
import { primerDiaMes } from "../../lib/periodo.js";

export const lecturasRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
});

const uploadLectura = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
});

// Recalcula el consumo de la PRÓXIMA lectura ya registrada de un medidor (si existe) después de
// crear, editar o borrar una lectura de un periodo anterior a esa. Necesario porque acá se suele
// capturar el histórico "al revés" (el mes más reciente primero, hacia atrás): cuando eso pasa,
// la lectura más nueva se guarda con consumo = su propio valor (no hay lectura previa todavía),
// y al llegar después la lectura de un mes anterior real, ese consumo viejo queda desactualizado
// hasta que se recalcula acá.
async function recalcularConsumoSiguiente(medidorId: number, periodo: Date) {
  const siguiente = await prisma.lectura.findFirst({
    where: { medidorId, periodo: { gt: periodo } },
    orderBy: { periodo: "asc" },
  });
  if (!siguiente) return;

  const anterior = await prisma.lectura.findFirst({
    where: { medidorId, periodo: { lt: siguiente.periodo } },
    orderBy: { periodo: "desc" },
  });
  const medidor = await prisma.medidor.findUnique({ where: { id: medidorId } });
  const base = anterior?.valorLectura ?? medidor?.lecturaInicial ?? 0;
  const consumoCorrecto = Number(siguiente.valorLectura) - Number(base);
  if (Number(siguiente.consumo) !== consumoCorrecto) {
    await prisma.lectura.update({ where: { id: siguiente.id }, data: { consumo: consumoCorrecto } });
  }
}

// Lecturas de un periodo (YYYY-MM), incluye medidores sin lectura ese mes y su novedad si tienen
// una. Sin "page" devuelve todo (compatibilidad con quien ya lo consuma así); con "page" pagina
// y filtra en el servidor (estado=pendientes|tomadas, q=texto) — para la pantalla de captura,
// que ya no necesita traer todos los medidores del municipio de una sola vez.
lecturasRouter.get("/", async (req, res) => {
  const { periodo, ruta, barrio, estado, q, page, limit } = req.query;
  if (!periodo) return res.status(400).json({ error: "periodo es requerido (YYYY-MM)" });
  const fecha = primerDiaMes(String(periodo));

  // Un medidor instalado DESPUÉS del día 20 del periodo que se está viendo no debe aparecer como
  // pendiente de lectura ese mes: la captura de lecturas arranca el día 20, así que un medidor
  // instalado el 21 o después ya no alcanza a tener su primera lectura real ese mes y pasa
  // derecho al periodo siguiente (ej. instalado el 21 de julio → aparece hasta agosto).
  const corteInstalacion = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 21));
  const filtros: any[] = [
    { activo: true },
    { suscriptorId: { not: null } },
    { OR: [{ fechaInstalacion: null }, { fechaInstalacion: { lt: corteInstalacion } }] },
    // Un suscriptor con estado "inactivo" (medidor dañado/inactivo) no debe seguir apareciendo
    // como pendiente de lectura mes a mes hasta que alguien lo vuelva a poner en servicio.
    { suscriptor: { estadoFacturacion: { not: "inactivo" } } },
  ];
  if (ruta) filtros.push({ suscriptor: { ruta: String(ruta) } });
  if (barrio) filtros.push({ suscriptor: { barrioId: Number(barrio) } });
  if (estado === "pendientes") filtros.push({ lecturas: { none: { periodo: fecha } } });
  if (estado === "tomadas") filtros.push({ lecturas: { some: { periodo: fecha } } });
  if (q) {
    const texto = String(q).trim();
    filtros.push({
      OR: [
        { serial: { contains: texto, mode: "insensitive" as const } },
        { suscriptor: { nombre: { contains: texto, mode: "insensitive" as const } } },
        { suscriptor: { codigo: { contains: texto, mode: "insensitive" as const } } },
        { suscriptor: { ruta: { contains: texto, mode: "insensitive" as const } } },
      ],
    });
  }
  const where = { AND: filtros };

  async function armarFila(medidor: {
    id: number;
    suscriptor: unknown;
    lecturaInicial: unknown;
    lecturas: unknown[];
    novedadesLectura: unknown[];
  }) {
    const lecturaAnterior = await prisma.lectura.findFirst({
      where: { medidorId: medidor.id, periodo: { lt: fecha } },
      orderBy: { periodo: "desc" },
    });
    return {
      medidorId: medidor.id,
      suscriptor: medidor.suscriptor,
      lecturaAnteriorValor: lecturaAnterior?.valorLectura ?? medidor.lecturaInicial,
      lectura: (medidor.lecturas as any[])[0] ?? null,
      novedad: (medidor.novedadesLectura as any[])[0] ?? null,
    };
  }

  const include = {
    suscriptor: { include: { barrioCat: true } },
    lecturas: { where: { periodo: fecha }, include: { capturadoPor: { select: { nombre: true } } } },
    novedadesLectura: { where: { periodo: fecha } },
  };

  // Por defecto se ordena por ruta del suscriptor (de menor a mayor). Para "ya tomadas" tiene más
  // sentido ver primero lo más reciente capturado: como cada medidor tiene a lo sumo UNA lectura
  // en este periodo (constraint medidorId_periodo), se puede consultar directo por Lectura y
  // ordenar por su fechaRegistro, en vez de por Medidor (que no permite ordenar por un campo de
  // una relación uno-a-muchos aunque solo haya una fila).
  if (estado === "tomadas") {
    const whereLectura = { periodo: fecha, medidor: where };
    if (page) {
      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 10);
      const [lecturasPag, total] = await Promise.all([
        prisma.lectura.findMany({
          where: whereLectura,
          include: { medidor: { include } },
          orderBy: { fechaRegistro: "desc" },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        prisma.lectura.count({ where: whereLectura }),
      ]);
      const data = await Promise.all(lecturasPag.map((l) => armarFila(l.medidor)));
      return res.json({ data, total, page: pageNum, limit: limitNum });
    }
    const lecturasTodas = await prisma.lectura.findMany({
      where: whereLectura,
      include: { medidor: { include } },
      orderBy: { fechaRegistro: "desc" },
    });
    const resultado = await Promise.all(lecturasTodas.map((l) => armarFila(l.medidor)));
    return res.json(resultado);
  }

  if (page) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 10);
    const [medidores, total] = await Promise.all([
      prisma.medidor.findMany({
        where,
        include,
        orderBy: { suscriptor: { ruta: "asc" } },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.medidor.count({ where }),
    ]);
    const data = await Promise.all(medidores.map(armarFila));
    return res.json({ data, total, page: pageNum, limit: limitNum });
  }

  const medidores = await prisma.medidor.findMany({ where, include, orderBy: { suscriptor: { ruta: "asc" } } });
  const resultado = await Promise.all(medidores.map(armarFila));
  res.json(resultado);
});

// Resumen rápido de avance de un periodo (para la barra de progreso de LecturasPage): cuántos
// medidores activos con suscriptor hay en total y cuántos ya tienen lectura tomada ese mes.
lecturasRouter.get("/resumen", async (req, res) => {
  const { periodo } = req.query;
  if (!periodo) return res.status(400).json({ error: "periodo es requerido (YYYY-MM)" });
  const fecha = primerDiaMes(String(periodo));
  const corteInstalacion = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 21));

  const where = {
    activo: true,
    suscriptorId: { not: null },
    OR: [{ fechaInstalacion: null }, { fechaInstalacion: { lt: corteInstalacion } }],
    // Mismo criterio que GET / (línea 71): un suscriptor "inactivo" (medidor dañado) no cuenta
    // en el avance del periodo, igual que ya no cuenta en la lista de pendientes.
    suscriptor: { estadoFacturacion: { not: "inactivo" } },
  };
  const [total, tomadas] = await Promise.all([
    prisma.medidor.count({ where }),
    prisma.medidor.count({ where: { ...where, lecturas: { some: { periodo: fecha } } } }),
  ]);
  res.json({ total, tomadas });
});

// Registrar una lectura nueva de un medidor para un periodo. La foto del medidor mostrando
// la medida es obligatoria (evidencia); las coordenadas son opcionales (si el navegador/celular
// no da permiso de ubicación, igual se guarda la lectura). Si había una novedad registrada para
// ese mismo medidor/periodo, se elimina (ya hay lectura real) y se borran sus fotos.
lecturasRouter.post("/", uploadLectura.single("foto"), async (req, res) => {
  const { medidorId: medidorIdRaw, periodo, valorLectura, observaciones, latitud, longitud } = req.body;
  const medidorId = Number(medidorIdRaw);
  if (!req.file) {
    if (!req.usuario?.permisos.includes("lecturas_sin_foto")) {
      return res.status(400).json({ error: "La foto del medidor es obligatoria" });
    }
    if (!observaciones || !String(observaciones).trim()) {
      return res.status(400).json({ error: "Si no adjuntas foto, debes escribir una observación" });
    }
  }

  const fecha = primerDiaMes(periodo);

  const lecturaAnterior = await prisma.lectura.findFirst({
    where: { medidorId, periodo: { lt: fecha } },
    orderBy: { periodo: "desc" },
  });

  const medidor = await prisma.medidor.findUnique({ where: { id: medidorId } });
  if (!medidor) return res.status(404).json({ error: "Medidor no encontrado" });

  const base = lecturaAnterior?.valorLectura ?? medidor.lecturaInicial ?? 0;
  const consumo = Number(valorLectura) - Number(base);
  const fotoUrl = req.file
    ? await guardarArchivo("lecturas", req.file.buffer, req.file.originalname, req.file.mimetype)
    : null;

  const novedadPrevia = await prisma.novedadLectura.findUnique({
    where: { medidorId_periodo: { medidorId, periodo: fecha } },
  });

  const [lectura] = await prisma.$transaction([
    prisma.lectura.upsert({
      where: { medidorId_periodo: { medidorId, periodo: fecha } },
      create: {
        medidorId,
        periodo: fecha,
        valorLectura,
        consumo,
        observaciones,
        fotoUrl,
        latitud: latitud ? Number(latitud) : null,
        longitud: longitud ? Number(longitud) : null,
        capturadoPorId: req.usuario?.id,
      },
      update: {
        valorLectura,
        consumo,
        observaciones,
        fotoUrl,
        latitud: latitud ? Number(latitud) : null,
        longitud: longitud ? Number(longitud) : null,
        capturadoPorId: req.usuario?.id,
      },
    }),
    prisma.novedadLectura.deleteMany({ where: { medidorId, periodo: fecha } }),
  ]);

  await Promise.all((novedadPrevia?.fotos ?? []).map((foto) => borrarArchivo(foto)));

  // El punto del suscriptor en el Mapa se actualiza con el GPS de CADA lectura nueva (no solo
  // la primera vez): el frontend solo manda latitud/longitud cuando la foto se tomó ahí mismo
  // con la cámara (no al "Subir un archivo"), así que esto siempre refleja la ubicación real de
  // la última visita al predio.
  if (latitud && longitud && medidor.suscriptorId) {
    await prisma.suscriptor.update({
      where: { id: medidor.suscriptorId },
      data: { latitud: Number(latitud), longitud: Number(longitud) },
    });
  }

  await registrarCambioLectura(medidorId, fecha, null, String(valorLectura), req.usuario?.id);
  await recalcularConsumoSiguiente(medidorId, fecha);

  res.status(201).json(lectura);
});

// Edita una lectura ya capturada (valor y, opcionalmente, reemplazar la foto si se subió mal).
// Quitar la foto sin reemplazarla (dejar la lectura sin evidencia) es una excepción a la regla
// de "foto obligatoria" y solo la puede hacer un admin.
lecturasRouter.put("/:id", uploadLectura.single("foto"), async (req, res) => {
  const { valorLectura, observaciones, quitarFoto } = req.body;
  const lecturaExistente = await prisma.lectura.findUnique({ where: { id: Number(req.params.id) } });
  if (!lecturaExistente) return res.status(404).json({ error: "No encontrada" });

  if (quitarFoto === "true" && req.usuario!.rol !== "admin") {
    return res.status(403).json({ error: "Solo un administrador puede quitar la foto de una lectura" });
  }

  const lecturaAnterior = await prisma.lectura.findFirst({
    where: { medidorId: lecturaExistente.medidorId, periodo: { lt: lecturaExistente.periodo } },
    orderBy: { periodo: "desc" },
  });
  const medidor = await prisma.medidor.findUnique({ where: { id: lecturaExistente.medidorId } });
  const base = lecturaAnterior?.valorLectura ?? medidor?.lecturaInicial ?? 0;
  const consumo = Number(valorLectura) - Number(base);

  let nuevaFotoUrl: string | null | undefined;
  if (req.file) {
    nuevaFotoUrl = await guardarArchivo("lecturas", req.file.buffer, req.file.originalname, req.file.mimetype);
  } else if (quitarFoto === "true") {
    nuevaFotoUrl = null;
  }

  const lectura = await prisma.lectura.update({
    where: { id: Number(req.params.id) },
    data: { valorLectura, consumo, observaciones, fotoUrl: nuevaFotoUrl },
  });

  if (nuevaFotoUrl !== undefined && lecturaExistente.fotoUrl) {
    await borrarArchivo(lecturaExistente.fotoUrl);
  }

  if (String(valorLectura) !== lecturaExistente.valorLectura.toString()) {
    await registrarCambioLectura(
      lecturaExistente.medidorId,
      lecturaExistente.periodo,
      lecturaExistente.valorLectura.toString(),
      String(valorLectura),
      req.usuario?.id
    );
  }
  await recalcularConsumoSiguiente(lecturaExistente.medidorId, lecturaExistente.periodo);

  res.json(lectura);
});

// Borra una lectura capturada por error (ej. se subió la foto equivocada). El medidor vuelve
// a quedar pendiente de lectura para ese periodo.
lecturasRouter.delete("/:id", async (req, res) => {
  const lectura = await prisma.lectura.findUnique({ where: { id: Number(req.params.id) } });
  if (!lectura) return res.status(404).json({ error: "No encontrada" });

  await prisma.lectura.delete({ where: { id: lectura.id } });

  if (lectura.fotoUrl) await borrarArchivo(lectura.fotoUrl);

  await registrarCambioLectura(
    lectura.medidorId,
    lectura.periodo,
    lectura.valorLectura.toString(),
    null,
    req.usuario?.id
  );
  await recalcularConsumoSiguiente(lectura.medidorId, lectura.periodo);

  res.status(204).end();
});

// Marca que a un medidor no se le pudo tomar lectura en un periodo, con el motivo y,
// opcionalmente, fotos (en el celular del fontanero, el input abre la cámara directo).
// Si ya había una lectura real registrada para ese periodo, se rechaza (hay que borrarla primero).
lecturasRouter.post("/novedad", upload.array("fotos", 5), async (req, res) => {
  const { medidorId, periodo, motivo } = req.body;
  if (!medidorId || !periodo || !motivo) {
    return res.status(400).json({ error: "medidorId, periodo y motivo son requeridos" });
  }
  const fecha = primerDiaMes(periodo);

  const lecturaExistente = await prisma.lectura.findUnique({
    where: { medidorId_periodo: { medidorId: Number(medidorId), periodo: fecha } },
  });
  if (lecturaExistente) {
    return res.status(400).json({ error: "Ya hay una lectura registrada para este periodo; bórrala primero" });
  }

  const archivos = (req.files as Express.Multer.File[] | undefined) ?? [];
  const fotos = await Promise.all(
    archivos.map((f) => guardarArchivo("novedades", f.buffer, f.originalname, f.mimetype))
  );

  const existente = await prisma.novedadLectura.findUnique({
    where: { medidorId_periodo: { medidorId: Number(medidorId), periodo: fecha } },
  });

  const novedad = await prisma.novedadLectura.upsert({
    where: { medidorId_periodo: { medidorId: Number(medidorId), periodo: fecha } },
    create: { medidorId: Number(medidorId), periodo: fecha, motivo, fotos },
    update: { motivo, fotos: fotos.length > 0 ? [...(existente?.fotos ?? []), ...fotos] : existente?.fotos },
  });
  res.status(201).json(novedad);
});

lecturasRouter.get("/novedad/:id", async (req, res) => {
  const novedad = await prisma.novedadLectura.findUnique({
    where: { id: Number(req.params.id) },
    include: { medidor: { include: { suscriptor: true } } },
  });
  if (!novedad) return res.status(404).json({ error: "No encontrada" });
  res.json(novedad);
});

// Edita el motivo y/o las fotos de una novedad ya creada (agregar nuevas, quitar existentes).
lecturasRouter.put("/novedad/:id", upload.array("fotos", 5), async (req, res) => {
  const novedad = await prisma.novedadLectura.findUnique({ where: { id: Number(req.params.id) } });
  if (!novedad) return res.status(404).json({ error: "No encontrada" });

  const { motivo, fotosARemover } = req.body;
  const aRemover: string[] = fotosARemover ? (Array.isArray(fotosARemover) ? fotosARemover : [fotosARemover]) : [];

  const archivos = (req.files as Express.Multer.File[] | undefined) ?? [];
  const fotosNuevas = await Promise.all(
    archivos.map((f) => guardarArchivo("novedades", f.buffer, f.originalname, f.mimetype))
  );
  const fotosFinales = [...novedad.fotos.filter((f) => !aRemover.includes(f)), ...fotosNuevas];

  const actualizada = await prisma.novedadLectura.update({
    where: { id: novedad.id },
    data: { motivo: motivo || novedad.motivo, fotos: fotosFinales },
  });

  await Promise.all(aRemover.map((foto) => borrarArchivo(foto)));

  res.json(actualizada);
});

lecturasRouter.delete("/novedad/:id", async (req, res) => {
  const novedad = await prisma.novedadLectura.findUnique({ where: { id: Number(req.params.id) } });
  if (!novedad) return res.status(404).json({ error: "No encontrada" });

  await prisma.novedadLectura.delete({ where: { id: novedad.id } });

  await Promise.all(novedad.fotos.map((foto) => borrarArchivo(foto)));

  res.status(204).end();
});
