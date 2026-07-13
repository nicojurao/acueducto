import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { requirePermiso } from "../middleware/auth.js";
import { crearPlantillaImportExport, enviarExcel } from "../lib/excelBranding.js";
import { registrarCambios, camposSuscriptor } from "../lib/historial.js";
import { leerLibroDesdeBuffer, hojaAFilas } from "../lib/xlsxCompat.js";

export const suscriptoresRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });
// Ver/editar básico: lo tiene cualquiera de los dos permisos de suscriptores.
const puedeVer = requirePermiso("suscriptores_ver", "suscriptores_avanzado");
// Importar/exportar/eliminar: solo el permiso avanzado.
const soloAvanzado = requirePermiso("suscriptores_avanzado");

suscriptoresRouter.use(puedeVer);

function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

function colIndexContains(headers: string[], ...palabras: string[]): number {
  return headers.findIndex((h) => {
    const n = norm(h);
    return palabras.every((p) => n.includes(p));
  });
}

function valor(row: any[], idx: number): string | undefined {
  if (idx < 0) return undefined;
  const v = row[idx];
  if (v === undefined || v === null || v === "") return undefined;
  return String(v).trim();
}

// El catálogo de estratos vive en la tabla Estrato (editable desde la pestaña Barrios/Estratos).
// Suscriptor.estratoId es una FK real; este resolutor solo se usa para el import/export por Excel,
// donde el archivo sigue trayendo texto libre (código "1" o etiqueta "Bajo - Bajo"/"Bajo-Bajo",
// sin importar tildes/mayúsculas/espacios) que hay que emparejar contra el catálogo para sacar el id.
async function cargarResolutorEstrato() {
  const estratos = await prisma.estrato.findMany();
  const porTexto = new Map<string, (typeof estratos)[number]>();
  for (const e of estratos) {
    porTexto.set(norm(e.codigo).replace(/\s*-\s*/g, "-"), e);
    porTexto.set(norm(e.etiqueta).replace(/\s*-\s*/g, "-"), e);
  }
  function resolver(raw: string | undefined) {
    if (!raw) return undefined;
    return porTexto.get(norm(raw).replace(/\s*-\s*/g, "-"));
  }
  return { resolver };
}

// Sin parámetros, devuelve el listado completo (lo usan los comboboxes de b ú s q u e d a
// y el mapa, que necesitan buscar/filtrar en el cliente). Con `page`, pagina y ordena
// por NUID ascendente (numérico cuando es posible) para que la tabla de la UI no cargue
// miles de filas de una vez.
suscriptoresRouter.get("/", async (req, res) => {
  const { page, limit, q, estadoFacturacion, barrioId, estratoId, estadoPredio } = req.query;
  const search = q ? String(q).trim().toUpperCase() : "";

  const filtros: any[] = [];
  if (search) {
    filtros.push({
      OR: [
        { nombre: { contains: search, mode: "insensitive" as const } },
        { codigo: { contains: search, mode: "insensitive" as const } },
        { ruta: { contains: search, mode: "insensitive" as const } },
      ],
    });
  }
  if (estadoFacturacion) filtros.push({ estadoFacturacion: String(estadoFacturacion) });
  if (barrioId) filtros.push({ barrioId: Number(barrioId) });
  if (estratoId) filtros.push({ estratoId: Number(estratoId) });
  if (estadoPredio) filtros.push({ estadoPredio: String(estadoPredio) });

  const where = filtros.length > 0 ? { AND: filtros } : undefined;
  const include = { medidores: true, barrioCat: true, estratoCat: true };

  if (page) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 10);
    // Orden por clic en el encabezado de la tabla. "codigo" (NUID, el default) compara numérico
    // cuando ambos lados son números; el resto alfabético. Clave desconocida = cae al default.
    const dir = String(req.query.dir) === "desc" ? -1 : 1;
    const sortKey = String(req.query.sort ?? "codigo");

    const todos = await prisma.suscriptor.findMany({ where, include });

    type Fila = (typeof todos)[number];
    const numerico = (a: string, b: string) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b);
    };
    const CLAVES: Record<string, (s: Fila) => string> = {
      codigo: (s) => s.codigo,
      nombre: (s) => s.nombre,
      ruta: (s) => s.ruta ?? "",
      barrio: (s) => s.barrioCat?.nombre ?? "",
      estrato: (s) => s.estratoCat?.codigo ?? "",
      estadoPredio: (s) => s.estadoPredio,
      estadoFacturacion: (s) => s.estadoFacturacion,
    };
    const clave = CLAVES[sortKey] ?? CLAVES.codigo;
    todos.sort((a, b) => {
      const va = clave(a);
      const vb = clave(b);
      const cmp = sortKey === "codigo" || sortKey === "estrato" ? numerico(va, vb) : va.localeCompare(vb);
      return dir * cmp;
    });

    const total = todos.length;
    const data = todos.slice((pageNum - 1) * limitNum, pageNum * limitNum);
    return res.json({ data, total, page: pageNum, limit: limitNum });
  }

  const suscriptores = await prisma.suscriptor.findMany({
    where,
    include,
    orderBy: { nombre: "asc" },
  });
  res.json(suscriptores);
});

// Catálogo de barrios (ver también /api/barrios para el CRUD completo), para poblar el
// filtro de la UI sin traer los 4000+ suscriptores completos.
suscriptoresRouter.get("/barrios", async (_req, res) => {
  const barrios = await prisma.barrio.findMany({ orderBy: { nombre: "asc" } });
  res.json(barrios.map((b) => ({ id: b.id, nombre: b.nombre })));
});

// Descarga una plantilla .xlsx con los suscriptores ya cargados, en el mismo formato
// de columnas que espera POST /import. Sirve como punto de partida para editar datos
// existentes o agregar filas nuevas (el NUID sigue siendo la clave al volver a subirla).
suscriptoresRouter.get("/export", soloAvanzado, async (req, res) => {
  // Sin "ids" exporta todo el catálogo (uso normal: plantilla de import/export). Con "ids"
  // (coma-separado) exporta solo esos suscriptores — lo usa el botón "Exportar seleccionados"
  // del listado, para no obligar a exportar/filtrar todo cuando solo interesan unas pocas filas.
  const { ids } = req.query;
  const idsFiltro = ids
    ? String(ids)
        .split(",")
        .map(Number)
        .filter((n) => !Number.isNaN(n))
    : undefined;

  const suscriptores = await prisma.suscriptor.findMany({
    where: idsFiltro ? { id: { in: idsFiltro } } : undefined,
    orderBy: { codigo: "asc" },
    include: { barrioCat: true, estratoCat: true },
  });

  const filas = suscriptores.map((s) => ({
    nuid: s.codigo,
    nombre: s.nombre ?? "",
    identificacion: s.identificacion ?? "",
    barrio: s.barrioCat?.nombre ?? "",
    direccion: s.direccion ?? "",
    direccionComercial: s.direccionComercial ?? "",
    ruta: s.ruta ?? "",
    estrato: s.estratoCat?.etiqueta ?? "",
    estadoPredio: s.estadoPredio === "inactivo" ? "Inactivo" : "Activo",
  }));

  const buffer = await crearPlantillaImportExport(
    "Suscriptores",
    [
      { titulo: "NUID", clave: "nuid", ancho: 14 },
      { titulo: "NOMBRE", clave: "nombre", ancho: 28 },
      { titulo: "IDENTIFICACION", clave: "identificacion", ancho: 16 },
      { titulo: "BARRIO", clave: "barrio", ancho: 18 },
      { titulo: "DIRECCION", clave: "direccion", ancho: 26 },
      { titulo: "DIRECCION COMERCIAL", clave: "direccionComercial", ancho: 26 },
      { titulo: "RUTA", clave: "ruta", ancho: 14 },
      { titulo: "ESTRATO", clave: "estrato", ancho: 14 },
      { titulo: "ESTADO PREDIO", clave: "estadoPredio", ancho: 14 },
    ],
    filas
  );
  enviarExcel(res, buffer, "plantilla_suscriptores.xlsx");
});

suscriptoresRouter.get("/:id", async (req, res) => {
  const suscriptor = await prisma.suscriptor.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      medidores: { include: { cotitulares: { include: { suscriptor: true } }, marcaCat: true, modeloCat: true, diametroCat: true, lote: true } },
      cotitularDe: { include: { medidor: { include: { suscriptor: true, cotitulares: true } } } },
      barrioCat: true,
      estratoCat: true,
    },
  });
  if (!suscriptor) return res.status(404).json({ error: "No encontrado" });
  res.json(suscriptor);
});

suscriptoresRouter.put("/:id", soloAvanzado, async (req, res) => {
  const {
    nombre,
    codigo,
    ruta,
    identificacion,
    barrioId,
    direccion,
    direccionComercial,
    estratoId,
    latitud,
    longitud,
    estadoFacturacion,
    estadoPredio,
  } = req.body;

  if (estadoPredio !== undefined && !["activo", "inactivo"].includes(estadoPredio)) {
    return res.status(400).json({ error: "estadoPredio inválido" });
  }

  if (estadoPredio === "inactivo" || estadoFacturacion !== undefined) {
    const tieneMedidorActivo =
      (await prisma.medidor.count({ where: { suscriptorId: Number(req.params.id), activo: true } })) > 0;

    if (estadoPredio === "inactivo" && tieneMedidorActivo) {
      return res.status(400).json({
        error: "No se puede marcar el predio como inactivo: primero hay que quitarle el medidor asignado.",
      });
    }

    // El estado de facturación tiene que ser coherente con si el suscriptor de verdad
    // tiene un medidor asignado: "sin_medidor" implica que no lo tiene, y los estados que
    // requieren medición implican que sí.
    if (estadoFacturacion === "sin_medidor" && tieneMedidorActivo) {
      return res.status(400).json({
        error: "No se puede poner \"Sin medidor\": este suscriptor tiene un medidor asignado. Quítaselo primero.",
      });
    }
    if (["instalado_prueba", "facturando"].includes(estadoFacturacion) && !tieneMedidorActivo) {
      return res.status(400).json({
        error: "No se puede poner ese estado: este suscriptor todavía no tiene un medidor asignado.",
      });
    }
  }

  const antes = await prisma.suscriptor.findUnique({
    where: { id: Number(req.params.id) },
    include: { barrioCat: true, estratoCat: true },
  });
  if (!antes) return res.status(404).json({ error: "No encontrado" });

  // undefined = no tocar el campo; "" o null = limpiar la relación; número = enlazar ese id
  const [barrioCat, estratoCat] = await Promise.all([
    barrioId ? prisma.barrio.findUnique({ where: { id: Number(barrioId) } }) : null,
    estratoId ? prisma.estrato.findUnique({ where: { id: Number(estratoId) } }) : null,
  ]);
  if (barrioId && !barrioCat) return res.status(400).json({ error: "El barrio indicado no existe en el catálogo" });
  if (estratoId && !estratoCat) return res.status(400).json({ error: "El estrato indicado no existe en el catálogo" });

  const suscriptor = await prisma.suscriptor.update({
    where: { id: Number(req.params.id) },
    data: {
      nombre,
      codigo,
      ruta,
      identificacion,
      barrioId: barrioId !== undefined ? barrioCat?.id ?? null : undefined,
      direccion,
      direccionComercial,
      estratoId: estratoId !== undefined ? estratoCat?.id ?? null : undefined,
      latitud,
      longitud,
      estadoFacturacion,
      estadoPredio,
    },
    include: { barrioCat: true, estratoCat: true },
  });

  await registrarCambios("suscriptor", suscriptor.id, camposSuscriptor(antes), camposSuscriptor(suscriptor), req.usuario?.id);

  res.json(suscriptor);
});

// Importa/actualiza suscriptores desde un Excel. La clave siempre es el NUID:
// si el NUID ya existe se actualizan solo los campos que vengan llenos en la fila,
// si no existe se crea un suscriptor nuevo con lo que traiga la fila.
// Esta es la única forma de agregar suscriptores nuevos a la app (no hay alta manual).

// Valida el archivo ANTES de importarlo de verdad (no escribe nada en la base). Por ahora solo
// chequea que el NUID venga lleno y que el BARRIO (si viene) coincida con el catálogo existente
// (comparación sin tildes/mayúsculas). Si hay filas con problemas, arma un Excel igual al subido
// con una columna OBSERVACIONES al final para que el usuario corrija y vuelva a subir.
suscriptoresRouter.post("/import/validar", soloAvanzado, upload.single("archivo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Falta el archivo (campo 'archivo')" });

  const wb = await leerLibroDesdeBuffer(req.file.buffer);
  const sheet = wb.worksheets[0];
  const rows: any[][] = hojaAFilas(sheet);
  if (rows.length === 0) return res.status(400).json({ error: "El archivo está vacío" });

  const headers = rows[0].map((h) => String(h ?? ""));
  const iCodigo = (() => {
    const i = colIndexContains(headers, "NUID");
    return i >= 0 ? i : colIndexContains(headers, "CODIGO");
  })();
  const iBarrio = colIndexContains(headers, "BARRIO");
  const iEstrato = colIndexContains(headers, "ESTRATO");
  const iEstadoPredio = colIndexContains(headers, "ESTADO", "PREDIO");

  if (iCodigo < 0) return res.status(400).json({ error: "El archivo no tiene columna de NUID" });

  const [barriosCatalogo, { resolver: resolverEstrato }] = await Promise.all([
    prisma.barrio.findMany(),
    cargarResolutorEstrato(),
  ]);
  const barriosValidos = new Set(barriosCatalogo.map((b) => norm(b.nombre)));

  const filas = rows.slice(1);
  const nuidsVistos = new Set<string>();
  let filasConProblemas = 0;

  const observacionesPorFila = filas.map((row) => {
    const problemas: string[] = [];
    const codigo = valor(row, iCodigo);
    const barrio = valor(row, iBarrio);
    const estrato = valor(row, iEstrato);
    const estadoPredio = valor(row, iEstadoPredio);

    if (!codigo) {
      problemas.push("Falta el NUID");
    } else if (nuidsVistos.has(codigo)) {
      problemas.push("NUID repetido en el archivo");
    } else {
      nuidsVistos.add(codigo);
    }

    if (barrio && !barriosValidos.has(norm(barrio))) {
      problemas.push(`El barrio "${barrio}" no coincide con ningún barrio del catálogo`);
    }

    if (estrato && !resolverEstrato(estrato)) {
      problemas.push(`El estrato "${estrato}" no existe en el catálogo`);
    }

    if (estadoPredio && !["1", "0", "ACTIVO", "INACTIVO"].includes(norm(estadoPredio))) {
      problemas.push(`El estado predio "${estadoPredio}" no es válido (usa Activo/Inactivo o 1/0)`);
    }

    if (problemas.length > 0) filasConProblemas++;
    return problemas.join(" | ");
  });

  const totalFilas = filas.length;

  if (filasConProblemas === 0) {
    return res.json({ ok: true, totalFilas, filasConProblemas: 0 });
  }

  const columnas = headers.map((h, i) => ({ titulo: h || `Columna ${i + 1}`, clave: `c${i}`, ancho: 18 }));
  columnas.push({ titulo: "OBSERVACIONES", clave: "observaciones", ancho: 45 });

  const filasSalida = filas.map((row, idx) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((_, i) => {
      obj[`c${i}`] = row[i] ?? "";
    });
    obj.observaciones = observacionesPorFila[idx];
    return obj;
  });

  const buffer = await crearPlantillaImportExport("Suscriptores", columnas, filasSalida);

  res.json({
    ok: false,
    totalFilas,
    filasConProblemas,
    reporteBase64: buffer.toString("base64"),
  });
});

suscriptoresRouter.post("/import", soloAvanzado, upload.single("archivo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Falta el archivo (campo 'archivo')" });

  const wb = await leerLibroDesdeBuffer(req.file.buffer);
  const sheet = wb.worksheets[0];
  const rows: any[][] = hojaAFilas(sheet);
  if (rows.length === 0) return res.status(400).json({ error: "El archivo está vacío" });

  const headers = rows[0].map((h) => String(h ?? ""));
  // Acepta "NUID" (nombre actual de la columna) o "CODIGO" (plantillas antiguas)
  const iCodigo = (() => {
    const i = colIndexContains(headers, "NUID");
    return i >= 0 ? i : colIndexContains(headers, "CODIGO");
  })();
  const iNombre = colIndexContains(headers, "NOMBRE");
  const iIdentificacion = colIndexContains(headers, "IDENTIFICACION");
  const iBarrio = colIndexContains(headers, "BARRIO");
  const iDireccionComercial = colIndexContains(headers, "DIRECCION", "COMERCIAL");
  const iDireccion = headers.findIndex(
    (h, idx) => norm(h).includes("DIRECCION") && !norm(h).includes("COMERCIAL") && idx !== iDireccionComercial
  );
  const iRuta = colIndexContains(headers, "RUTA");
  const iEstadoPredio = colIndexContains(headers, "ESTADO", "PREDIO");
  const iEstrato = colIndexContains(headers, "ESTRATO");

  if (iCodigo < 0) return res.status(400).json({ error: "El archivo no tiene columna de NUID" });

  // Solo reconoce Activo/Inactivo (o 1/0): antes cualquier texto que no empezara con "INACTIV"
  // se tomaba como "activo" por defecto, así que un valor mal escrito (ej. "3") se colaba como
  // activo sin avisar. Ahora un valor no reconocido se ignora (undefined) y se marca en el reporte.
  function normalizarEstadoPredio(raw: string | undefined): "activo" | "inactivo" | undefined {
    if (!raw) return undefined;
    const n = norm(raw);
    if (n === "1" || n === "ACTIVO") return "activo";
    if (n === "0" || n === "INACTIVO") return "inactivo";
    return undefined;
  }

  let creados = 0;
  let actualizados = 0;
  let omitidos = 0;

  const filas = rows.slice(1);
  const codigos = [...new Set(filas.map((row) => valor(row, iCodigo)).filter((c): c is string => !!c))];

  const suscriptoresExistentes = await prisma.suscriptor.findMany({ where: { codigo: { in: codigos } } });
  const suscriptorPorCodigo = new Map(suscriptoresExistentes.map((s) => [s.codigo, s]));

  // Los catálogos de barrios y estratos NO se tocan desde este import: solo se usan si el valor
  // de la fila coincide (sin tildes/mayúsculas) con uno ya creado. Si no coincide, la fila se
  // importa igual pero sin tocar ese campo, y queda marcada en el reporte para corregirla a mano.
  const [barriosCatalogo, { resolver: resolverEstrato }] = await Promise.all([
    prisma.barrio.findMany(),
    cargarResolutorEstrato(),
  ]);
  const barrioPorNorm = new Map(barriosCatalogo.map((b) => [norm(b.nombre), b]));

  const medidoresActivos = await prisma.medidor.groupBy({
    by: ["suscriptorId"],
    where: { suscriptorId: { in: suscriptoresExistentes.map((s) => s.id) }, activo: true },
    _count: { _all: true },
  });
  const medidorActivoPorSuscriptor = new Map(medidoresActivos.map((m) => [m.suscriptorId, m._count._all]));

  const observacionesPorFila: string[] = [];

  for (const row of filas) {
    const codigo = valor(row, iCodigo);
    if (!codigo) {
      omitidos++;
      observacionesPorFila.push("Omitido: falta el NUID");
      continue;
    }

    const nombre = valor(row, iNombre);
    const identificacion = valor(row, iIdentificacion);
    const barrioArchivo = valor(row, iBarrio);
    const direccion = valor(row, iDireccion);
    const direccionComercial = valor(row, iDireccionComercial);
    const ruta = valor(row, iRuta);
    const estratoArchivo = valor(row, iEstrato);
    const estadoPredioArchivo = valor(row, iEstadoPredio);
    const estadoPredio = normalizarEstadoPredio(estadoPredioArchivo);

    const observaciones: string[] = [];
    if (estadoPredioArchivo && !estadoPredio) {
      observaciones.push(`Estado predio "${estadoPredioArchivo}" no es válido (usa Activo/Inactivo o 1/0): no se cambió`);
    }
    let barrioId: number | undefined;
    if (barrioArchivo) {
      const barrioCat = barrioPorNorm.get(norm(barrioArchivo));
      if (barrioCat) {
        barrioId = barrioCat.id;
      } else {
        observaciones.push(`Barrio "${barrioArchivo}" no existe en el catálogo: no se asignó`);
      }
    }

    let estratoId: number | undefined;
    if (estratoArchivo) {
      const resuelto = resolverEstrato(estratoArchivo);
      if (resuelto) {
        estratoId = resuelto.id;
      } else {
        observaciones.push(`Estrato "${estratoArchivo}" no existe en el catálogo: no se asignó`);
      }
    }

    const existente = suscriptorPorCodigo.get(codigo);

    if (existente) {
      // Un predio inactivo no puede tener medidor: si la fila lo marca inactivo pero el
      // suscriptor ya tiene uno asignado, se ignora ese cambio puntual (el resto de la fila
      // sí se aplica) en vez de tumbar toda la importación con un error.
      const medidorActivo =
        estadoPredio === "inactivo" ? medidorActivoPorSuscriptor.get(existente.id) ?? 0 : 0;
      if (estadoPredio === "inactivo" && medidorActivo > 0) {
        observaciones.push("No se marcó como inactivo: el suscriptor todavía tiene un medidor asignado");
      }

      await prisma.suscriptor.update({
        where: { codigo },
        data: {
          nombre: nombre ?? undefined,
          identificacion: identificacion ?? undefined,
          barrioId: barrioId ?? undefined,
          direccion: direccion ?? undefined,
          direccionComercial: direccionComercial ?? undefined,
          ruta: ruta ?? undefined,
          estratoId: estratoId ?? undefined,
          estadoPredio: medidorActivo > 0 ? undefined : estadoPredio,
        },
      });
      actualizados++;
      observacionesPorFila.push(observaciones.length > 0 ? `Actualizado. ${observaciones.join(" | ")}` : "Actualizado correctamente");
    } else {
      if (!nombre) {
        omitidos++;
        observacionesPorFila.push("Omitido: es un NUID nuevo pero no trae nombre");
        continue;
      }
      const creado = await prisma.suscriptor.create({
        data: {
          codigo,
          nombre,
          identificacion,
          barrioId: barrioId ?? null,
          direccion,
          direccionComercial,
          ruta,
          estratoId: estratoId ?? null,
          estadoPredio: estadoPredio ?? "activo",
        },
      });
      suscriptorPorCodigo.set(codigo, creado);
      creados++;
      observacionesPorFila.push(observaciones.length > 0 ? `Creado. ${observaciones.join(" | ")}` : "Creado correctamente");
    }
  }

  const columnas = headers.map((h, i) => ({ titulo: h || `Columna ${i + 1}`, clave: `c${i}`, ancho: 18 }));
  columnas.push({ titulo: "OBSERVACIONES", clave: "observaciones", ancho: 45 });
  const filasReporte = filas.map((row, idx) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((_, i) => {
      obj[`c${i}`] = row[i] ?? "";
    });
    obj.observaciones = observacionesPorFila[idx];
    return obj;
  });
  const reporteBuffer = await crearPlantillaImportExport("Suscriptores", columnas, filasReporte);

  res.json({ creados, actualizados, omitidos, reporteBase64: reporteBuffer.toString("base64") });
});

suscriptoresRouter.delete("/:id", soloAvanzado, async (req, res) => {
  await prisma.suscriptor.delete({ where: { id: Number(req.params.id) } });
  res.status(204).send();
});
