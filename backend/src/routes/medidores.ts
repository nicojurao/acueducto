import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { requirePermiso } from "../middleware/auth.js";
import { crearPlantillaImportExport, enviarExcel } from "../lib/excelBranding.js";
import { guardarArchivo, borrarArchivo } from "../lib/storage.js";
import { registrarCambios, camposMedidor } from "../lib/historial.js";
import { leerLibroDesdeBuffer, hojaAFilas } from "../lib/xlsxCompat.js";

export const medidoresRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });
const soloAvanzado = requirePermiso("medidores_avanzado");

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

// Descarga una plantilla .xlsx con el inventario/estado actual de medidores por suscriptor,
// pensada para completar a mano (serial, marca, modelo, tipo, diámetro, instalador) y volver
// a subirla con POST /import. La clave para emparejar filas es el NUID del suscriptor.
// Solo trae los suscriptores que YA tienen un medidor activo asignado (no los 4000+ completos):
// la mayoría de suscriptores todavía no tienen medidor cargado, así que traerlos todos solo
// generaba filas vacías que había que borrar a mano antes de poder trabajar la plantilla.
medidoresRouter.get("/export", soloAvanzado, async (req, res) => {
  // Sin "ids" exporta todos los suscriptores con medidor activo (uso normal: plantilla de
  // import/export). Con "ids" (coma-separado, IDs de Medidor) exporta solo esos — lo usa el
  // botón "Exportar seleccionados" del listado. Un medidor "en bodega" (sin suscriptor) no
  // puede salir en este export porque el formato es por-suscriptor; igual que exportar todo
  // cuando nadie tiene medidor activo, da un archivo vacío en vez de fallar.
  const { ids } = req.query;
  const idsFiltro = ids
    ? String(ids)
        .split(",")
        .map(Number)
        .filter((n) => !Number.isNaN(n))
    : undefined;

  const suscriptores = await prisma.suscriptor.findMany({
    where: { medidores: { some: { activo: true, ...(idsFiltro ? { id: { in: idsFiltro } } : {}) } } },
    include: {
      medidores: {
        where: { activo: true },
        take: 1,
        include: { lote: true, cotitulares: { include: { suscriptor: true } }, marcaCat: true, modeloCat: true, diametroCat: true },
      },
    },
    orderBy: { codigo: "asc" },
  });

  const filas = suscriptores.map((s) => {
    const m = s.medidores[0];
    return {
      nuid: s.codigo,
      serial: m?.serial ?? "",
      marca: m?.marcaCat?.nombre ?? "",
      modelo: m?.modeloCat?.nombre ?? "",
      tipo: m?.tipo ?? "",
      diametro: m?.diametroCat?.valor ?? "",
      lote: m?.lote ? `${m.lote.serialInicial}-${m.lote.serialFinal}` : "",
      fechaInstalacion: m?.fechaInstalacion ? m.fechaInstalacion.toISOString().slice(0, 10) : "",
      instaladoPor: "",
      fechaFabricacion: m?.fechaFabricacion ? m.fechaFabricacion.toISOString().slice(0, 10) : "",
      fechaCertificacion: m?.fechaCertificacion ? m.fechaCertificacion.toISOString().slice(0, 10) : "",
      certificado: m?.certificado ?? "",
      // Solo se llena en la fila del titular (dueño del medidor). Vivienda multiusuario:
      // varios NUID comparten un solo medidor, cada uno cobra por separado y el consumo
      // se reparte en partes iguales (ver reportes.ts).
      nuidCotitulares: m?.cotitulares?.map((c) => c.suscriptor.codigo).join(", ") ?? "",
    };
  });

  const buffer = await crearPlantillaImportExport(
    "Medidores",
    [
      { titulo: "NUID", clave: "nuid", ancho: 14 },
      { titulo: "SERIAL", clave: "serial", ancho: 16 },
      { titulo: "MARCA", clave: "marca", ancho: 16 },
      { titulo: "MODELO", clave: "modelo", ancho: 16 },
      { titulo: "TIPO", clave: "tipo", ancho: 14 },
      { titulo: "DIAMETRO", clave: "diametro", ancho: 12 },
      { titulo: "LOTE", clave: "lote", ancho: 14 },
      { titulo: "FECHA INSTALACION", clave: "fechaInstalacion", ancho: 16 },
      { titulo: "INSTALADO POR", clave: "instaladoPor", ancho: 20 },
      { titulo: "FECHA FABRICACION", clave: "fechaFabricacion", ancho: 16 },
      { titulo: "FECHA CERTIFICACION", clave: "fechaCertificacion", ancho: 18 },
      { titulo: "CERTIFICADO MEDIDOR", clave: "certificado", ancho: 20 },
      { titulo: "NUID COTITULARES", clave: "nuidCotitulares", ancho: 26 },
    ],
    filas
  );
  enviarExcel(res, buffer, "plantilla_medidores.xlsx");
});

function leerColumnas(headers: string[]) {
  return {
    iNuid: colIndexContains(headers, "NUID"),
    iSerial: colIndexContains(headers, "SERIAL"),
    iMarca: colIndexContains(headers, "MARCA"),
    iModelo: colIndexContains(headers, "MODELO"),
    iTipo: colIndexContains(headers, "TIPO"),
    iDiametro: colIndexContains(headers, "DIAMETRO"),
    iLote: colIndexContains(headers, "LOTE"),
    iFecha: colIndexContains(headers, "FECHA", "INSTALACION"),
    iInstalador: colIndexContains(headers, "INSTALADO"),
    iCotitulares: colIndexContains(headers, "COTITULARES"),
    iFechaFabricacion: colIndexContains(headers, "FECHA", "FABRICACION"),
    iFechaCertificacion: colIndexContains(headers, "FECHA", "CERTIFICACION"),
    iCertificado: colIndexContains(headers, "CERTIFICADO"),
  };
}

function parsearFecha(raw: unknown): Date | null {
  if (raw instanceof Date) return raw;
  if (typeof raw === "string" && raw) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// Convierte un diámetro escrito en decimal (ej. "1.50", "0.75") al formato con fracción y
// comillas de pulgada que usa el catálogo (ej. 1 1/2", 3/4"). Si el texto ya viene en ese
// formato (trae "/" o """) o no es un número, se deja tal cual.
const FRACCIONES_DIAMETRO: [number, string][] = [
  [0, ""],
  [0.125, "1/8"],
  [0.25, "1/4"],
  [0.375, "3/8"],
  [0.5, "1/2"],
  [0.625, "5/8"],
  [0.75, "3/4"],
  [0.875, "7/8"],
];
function normalizarDiametro(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const texto = raw.trim();
  if (/[/"]/.test(texto)) return texto; // ya viene como fracción, no tocar
  const numero = Number(texto.replace(",", "."));
  if (!Number.isFinite(numero)) return texto; // no es un número reconocible, se deja tal cual

  const entero = Math.floor(numero);
  const parteFraccion = numero - entero;
  const masCercana = FRACCIONES_DIAMETRO.reduce((mejor, actual) =>
    Math.abs(actual[0] - parteFraccion) < Math.abs(mejor[0] - parteFraccion) ? actual : mejor
  );
  const [, fraccionTexto] = masCercana;

  if (entero === 0 && fraccionTexto) return `${fraccionTexto}"`;
  if (!fraccionTexto) return `${entero}"`;
  return `${entero} ${fraccionTexto}"`;
}

// "1500, 1501" / "1500;1501" / con saltos de línea → lista de NUID sin vacíos.
function parsearNuidsCotitulares(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Busca/crea marca, modelo, diámetro y lote en el catálogo a partir del texto libre de la fila.
// Compartido entre la fila con NUID (medidor instalado) y la fila sin NUID (medidor en bodega).
async function resolverCatalogos(
  marcaNombre: string | undefined,
  modeloNombre: string | undefined,
  tipo: "volumetrico" | "velocidad" | undefined,
  diametroValor: string | undefined,
  lote: string | undefined
) {
  const marcaCat = marcaNombre
    ? await prisma.marcaMedidor.upsert({ where: { nombre: marcaNombre }, create: { nombre: marcaNombre }, update: {} })
    : null;
  // Si el modelo ya existe en el catálogo se reutiliza tal cual (con su tipo ya definido).
  // Si es un modelo nuevo y la plantilla no trae TIPO válido, no se inventa un valor: se deja
  // sin vincular al catálogo (queda pendiente de completarse a mano en el modal de Marca/Modelo).
  let modeloCat: Awaited<ReturnType<typeof prisma.modeloMedidor.findFirst>> = null;
  if (modeloNombre && marcaCat) {
    modeloCat = await prisma.modeloMedidor.findUnique({
      where: { marcaId_nombre: { marcaId: marcaCat.id, nombre: modeloNombre } },
    });
    if (!modeloCat && tipo) {
      modeloCat = await prisma.modeloMedidor.create({ data: { nombre: modeloNombre, tipo, marcaId: marcaCat.id } });
    }
  }
  const diametroCat = diametroValor
    ? await prisma.diametroMedidor.upsert({ where: { valor: diametroValor }, create: { valor: diametroValor }, update: {} })
    : null;
  // El texto del lote viene como "23001-23020" (serial inicial - serial final); si no trae
  // guion, se asume que inicial y final son el mismo valor.
  const loteCat = lote
    ? await (async () => {
        const [serialInicial, serialFinal] = lote.includes("-") ? lote.split("-", 2) : [lote, lote];
        const existente = await prisma.lote.findUnique({ where: { serialInicial_serialFinal: { serialInicial, serialFinal } } });
        return existente ?? (await prisma.lote.create({ data: { serialInicial, serialFinal } }));
      })()
    : null;
  return { marcaCat, modeloCat, diametroCat, loteCat };
}

// Solo reconoce el nombre de un usuario activo del sistema (sin tildes/mayúsculas): antes
// "INSTALADO POR" era texto libre sin validar contra quién trabaja de verdad en la empresa.
async function cargarResolutorInstalador() {
  const usuarios = await prisma.usuario.findMany({ where: { activo: true } });
  const porNombre = new Map(usuarios.map((u) => [norm(u.nombre), u.nombre]));
  return function resolver(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    return porNombre.get(norm(raw));
  };
}

function normalizarTipoMedidor(raw: string | undefined): "volumetrico" | "velocidad" | undefined {
  if (!raw) return undefined;
  const n = norm(raw);
  if (n === "VOLUMETRICO") return "volumetrico";
  if (n === "VELOCIDAD") return "velocidad";
  return undefined;
}

// Valida el archivo ANTES de importarlo de verdad (no escribe nada en la base): que el NUID
// venga lleno, exista como suscriptor y no esté repetido en el archivo; que el TIPO (si viene)
// sea "Volumétrico" o "Velocidad"; que el SERIAL (si viene) no esté repetido en el archivo ni
// ya usado por el medidor de OTRO suscriptor; y que la FECHA INSTALACION (si viene) sea una
// fecha válida. Si hay filas con problemas, arma un Excel igual al subido con una columna
// OBSERVACIONES al final para que el usuario corrija y vuelva a subir.
medidoresRouter.post("/import/validar", soloAvanzado, upload.single("archivo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Falta el archivo (campo 'archivo')" });

  const wb = await leerLibroDesdeBuffer(req.file.buffer);
  const sheet = wb.worksheets[0];
  const rows: any[][] = hojaAFilas(sheet);
  if (rows.length === 0) return res.status(400).json({ error: "El archivo está vacío" });
  const headers = rows[0].map((h) => String(h ?? ""));
  const { iNuid, iSerial, iMarca, iModelo, iTipo, iFecha, iCotitulares, iFechaFabricacion, iFechaCertificacion, iInstalador } =
    leerColumnas(headers);

  if (iNuid < 0) return res.status(400).json({ error: "El archivo no tiene columna de NUID" });

  const resolverInstalador = await cargarResolutorInstalador();
  const filas = rows.slice(1);
  const nuidsPrincipales = filas.map((row) => valor(row, iNuid)).filter((n): n is string => !!n);
  const nuidsCotitularesArchivo = filas.flatMap((row) => parsearNuidsCotitulares(valor(row, iCotitulares)));
  const nuids = [...new Set([...nuidsPrincipales, ...nuidsCotitularesArchivo])];
  const suscriptores = await prisma.suscriptor.findMany({ where: { codigo: { in: nuids } } });
  const nuidsConocidos = new Set(suscriptores.map((s) => s.codigo));
  const suscriptorPorCodigoVal = new Map(suscriptores.map((s) => [s.codigo, s]));

  const titularesActivos = await prisma.medidor.findMany({
    where: { suscriptorId: { in: suscriptores.map((s) => s.id) }, activo: true },
    select: { suscriptorId: true },
  });
  const yaEsTitularActivo = new Set(titularesActivos.map((m) => m.suscriptorId));
  const cotitularesExistentes = await prisma.cotitular.findMany({
    where: { suscriptorId: { in: suscriptores.map((s) => s.id) } },
    include: { medidor: { include: { suscriptor: true } } },
  });
  const medidorCotitularActualPorSuscriptor = new Map(
    cotitularesExistentes.map((c) => [c.suscriptorId, c.medidor.suscriptor?.codigo])
  );

  const seriales = [...new Set(filas.map((row) => valor(row, iSerial)).filter((s): s is string => !!s))];
  const medidoresConEseSerial = await prisma.medidor.findMany({
    where: { serial: { in: seriales } },
    include: { suscriptor: true },
  });
  const suscriptorCodigoPorSerial = new Map(medidoresConEseSerial.map((m) => [m.serial as string, m.suscriptor?.codigo]));

  const nuidsVistos = new Set<string>();
  const serialesVistos = new Set<string>();
  let filasConProblemas = 0;

  const observacionesPorFila = filas.map((row) => {
    const problemas: string[] = [];
    const nuid = valor(row, iNuid);
    const serial = valor(row, iSerial);
    const marca = valor(row, iMarca);
    const modelo = valor(row, iModelo);
    const tipo = valor(row, iTipo);
    const fechaRaw = row[iFecha];

    if (modelo && !marca) {
      problemas.push(`El modelo "${modelo}" no se vinculará al catálogo porque falta la MARCA en la fila`);
    }

    if (!nuid) {
      // Sin NUID es válido: queda "en bodega" (sin asignar), pero entonces necesita el SERIAL
      // para poder identificarlo si se vuelve a importar el archivo más adelante.
      if (!serial) problemas.push("Sin NUID hace falta al menos el SERIAL para identificar el medidor en bodega");
    } else if (!nuidsConocidos.has(nuid)) {
      problemas.push(`El NUID "${nuid}" no corresponde a ningún suscriptor cargado`);
    } else if (nuidsVistos.has(nuid)) {
      problemas.push("NUID repetido en el archivo");
    } else {
      nuidsVistos.add(nuid);
    }

    if (serial) {
      if (serialesVistos.has(serial)) {
        problemas.push("Serial repetido en el archivo");
      } else {
        serialesVistos.add(serial);
      }
      const duenoActual = suscriptorCodigoPorSerial.get(serial);
      if (duenoActual && duenoActual !== nuid) {
        problemas.push(`El serial "${serial}" ya está asignado al NUID ${duenoActual}`);
      }
    }

    if (tipo && !normalizarTipoMedidor(tipo)) {
      problemas.push(`El tipo "${tipo}" no es válido (usa Volumétrico o Velocidad)`);
    }

    const instaladoPor = valor(row, iInstalador);
    if (instaladoPor && !resolverInstalador(instaladoPor)) {
      problemas.push(`"${instaladoPor}" no coincide con ningún usuario activo del sistema`);
    }

    if (fechaRaw && !(fechaRaw instanceof Date) && Number.isNaN(new Date(String(fechaRaw)).getTime())) {
      problemas.push(`La fecha de instalación "${fechaRaw}" no es una fecha válida`);
    }

    const fechaFabricacionRaw = row[iFechaFabricacion];
    if (fechaFabricacionRaw && !parsearFecha(fechaFabricacionRaw)) {
      problemas.push(`La fecha de fabricación "${fechaFabricacionRaw}" no es una fecha válida`);
    }
    const fechaCertificacionRaw = row[iFechaCertificacion];
    if (fechaCertificacionRaw && !parsearFecha(fechaCertificacionRaw)) {
      problemas.push(`La fecha de certificación "${fechaCertificacionRaw}" no es una fecha válida`);
    }

    for (const nuidCot of parsearNuidsCotitulares(valor(row, iCotitulares))) {
      if (nuidCot === nuid) {
        problemas.push(`El NUID cotitular "${nuidCot}" es el mismo que el titular de la fila`);
        continue;
      }
      if (!nuidsConocidos.has(nuidCot)) {
        problemas.push(`El NUID cotitular "${nuidCot}" no corresponde a ningún suscriptor cargado`);
        continue;
      }
      const suscriptorCot = suscriptorPorCodigoVal.get(nuidCot)!;
      if (yaEsTitularActivo.has(suscriptorCot.id)) {
        problemas.push(`El NUID cotitular "${nuidCot}" ya es titular de su propio medidor activo`);
      }
      const medidorCotitularActual = medidorCotitularActualPorSuscriptor.get(suscriptorCot.id);
      if (medidorCotitularActual && medidorCotitularActual !== nuid) {
        problemas.push(`El NUID cotitular "${nuidCot}" ya es cotitular del medidor de otro NUID (${medidorCotitularActual})`);
      }
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
  const buffer = await crearPlantillaImportExport("Medidores", columnas, filasSalida);

  res.json({ ok: false, totalFilas, filasConProblemas, reporteBase64: buffer.toString("base64") });
});

// Importa/actualiza medidores desde un Excel con columnas NUID, SERIAL, MARCA, MODELO, TIPO,
// DIAMETRO, FECHA INSTALACION, INSTALADO POR. La clave siempre es el NUID del suscriptor:
// actualiza el medidor activo de ese suscriptor (o crea uno si no tiene), crea entradas de
// Catálogo (marca/modelo/diámetro) si no existen, y genera el acta de instalación histórica.
medidoresRouter.post("/import", soloAvanzado, upload.single("archivo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Falta el archivo (campo 'archivo')" });

  const wb = await leerLibroDesdeBuffer(req.file.buffer);
  const sheet = wb.worksheets[0];
  const rows: any[][] = hojaAFilas(sheet);
  if (rows.length === 0) return res.status(400).json({ error: "El archivo está vacío" });
  const headers = rows[0].map((h) => String(h ?? ""));
  const {
    iNuid,
    iSerial,
    iMarca,
    iModelo,
    iTipo,
    iDiametro,
    iLote,
    iFecha,
    iInstalador,
    iCotitulares,
    iFechaFabricacion,
    iFechaCertificacion,
    iCertificado,
  } = leerColumnas(headers);

  const resolverInstalador = await cargarResolutorInstalador();

  let creados = 0;
  let actualizados = 0;
  let omitidos = 0;

  const filas = rows.slice(1);
  const nuidsPrincipales = filas.map((row) => valor(row, iNuid)).filter((n): n is string => !!n);
  const nuidsCotitularesArchivo = filas.flatMap((row) => parsearNuidsCotitulares(valor(row, iCotitulares)));
  const nuids = [...new Set([...nuidsPrincipales, ...nuidsCotitularesArchivo])];
  const suscriptores = await prisma.suscriptor.findMany({ where: { codigo: { in: nuids } } });
  const suscriptorPorCodigo = new Map(suscriptores.map((s) => [s.codigo, s]));

  const medidoresExistentes = await prisma.medidor.findMany({
    where: { suscriptorId: { in: suscriptores.map((s) => s.id) } },
  });
  const medidoresPorSuscriptor = new Map<number, typeof medidoresExistentes>();
  for (const m of medidoresExistentes) {
    if (m.suscriptorId === null) continue;
    const lista = medidoresPorSuscriptor.get(m.suscriptorId) ?? [];
    lista.push(m);
    medidoresPorSuscriptor.set(m.suscriptorId, lista);
  }

  const actasExistentes = await prisma.actaInstalacion.findMany({
    where: { medidorId: { in: medidoresExistentes.map((m) => m.id) } },
  });
  const actaPorMedidor = new Map(actasExistentes.map((a) => [a.medidorId, a]));

  const observacionesPorFila: string[] = [];

  for (const row of filas) {
    const nuid = valor(row, iNuid);
    const serial = valor(row, iSerial);
    const marcaNombre = valor(row, iMarca);
    const modeloNombre = valor(row, iModelo);
    const tipoArchivo = valor(row, iTipo);
    const tipo = normalizarTipoMedidor(tipoArchivo);
    const diametroValor = normalizarDiametro(valor(row, iDiametro));
    const lote = valor(row, iLote);
    const certificado = valor(row, iCertificado);
    const fechaFabricacion = parsearFecha(row[iFechaFabricacion]);
    const fechaCertificacion = parsearFecha(row[iFechaCertificacion]);

    // Sin NUID: medidor "en bodega" (todavía sin asignar a ningún suscriptor), identificado por
    // SERIAL. Si ya existe un medidor con ese serial se actualiza; si no, se crea nuevo.
    if (!nuid) {
      if (!serial) {
        omitidos++;
        observacionesPorFila.push("Omitido: sin NUID hace falta al menos el SERIAL para identificar el medidor en bodega");
        continue;
      }
      const { marcaCat, modeloCat, diametroCat, loteCat } = await resolverCatalogos(
        marcaNombre,
        modeloNombre,
        tipo,
        diametroValor,
        lote
      );
      const observacionesBodega: string[] = [];
      if (tipoArchivo && !tipo) {
        observacionesBodega.push(`Tipo "${tipoArchivo}" no es válido (usa Volumétrico o Velocidad): no se asignó`);
      }
      if (modeloNombre && !marcaNombre) {
        observacionesBodega.push(`Modelo "${modeloNombre}" no se vinculó al catálogo: falta la MARCA`);
      }
      try {
        const existente = await prisma.medidor.findUnique({ where: { serial } });
        if (existente) {
          await prisma.medidor.update({
            where: { id: existente.id },
            data: {
              marcaId: marcaCat?.id ?? existente.marcaId,
              modeloId: modeloCat?.id ?? existente.modeloId,
              diametroId: diametroCat?.id ?? existente.diametroId,
              tipo: modeloCat?.tipo ?? tipo ?? existente.tipo,
              loteId: loteCat?.id ?? existente.loteId,
              fechaFabricacion: fechaFabricacion ?? existente.fechaFabricacion,
              fechaCertificacion: fechaCertificacion ?? existente.fechaCertificacion,
              certificado: certificado ?? existente.certificado,
            },
          });
          actualizados++;
        } else {
          await prisma.medidor.create({
            data: {
              serial,
              estado: "en_bodega",
              activo: true,
              marcaId: marcaCat?.id ?? null,
              modeloId: modeloCat?.id ?? null,
              diametroId: diametroCat?.id ?? null,
              tipo: modeloCat?.tipo ?? tipo ?? null,
              loteId: loteCat?.id ?? null,
              fechaFabricacion,
              fechaCertificacion,
              certificado: certificado ?? null,
            },
          });
          creados++;
        }
        observacionesPorFila.push(
          observacionesBodega.length > 0
            ? `En bodega. ${observacionesBodega.join(" | ")}`
            : "En bodega, sin asignar a suscriptor"
        );
      } catch (err: any) {
        omitidos++;
        observacionesPorFila.push(
          err?.code === "P2002" ? `Omitido: el serial "${serial}" ya está en uso por otro medidor` : "Omitido: error al guardar la fila"
        );
      }
      continue;
    }

    const suscriptor = suscriptorPorCodigo.get(nuid);
    if (!suscriptor) {
      omitidos++;
      observacionesPorFila.push(`Omitido: el NUID "${nuid}" no corresponde a ningún suscriptor cargado`);
      continue;
    }

    const observaciones: string[] = [];
    if (tipoArchivo && !tipo) {
      observaciones.push(`Tipo "${tipoArchivo}" no es válido (usa Volumétrico o Velocidad): no se asignó`);
    }
    if (modeloNombre && !marcaNombre) {
      observaciones.push(`Modelo "${modeloNombre}" no se vinculó al catálogo: falta la MARCA`);
    }
    const fechaRaw = row[iFecha];
    const fechaInstalacion =
      fechaRaw instanceof Date ? fechaRaw : typeof fechaRaw === "string" && fechaRaw ? new Date(fechaRaw) : null;
    if (fechaRaw && !fechaInstalacion) {
      observaciones.push(`Fecha de instalación "${fechaRaw}" no es válida: no se asignó`);
    }
    if (row[iFechaFabricacion] && !fechaFabricacion) {
      observaciones.push(`Fecha de fabricación "${row[iFechaFabricacion]}" no es válida: no se asignó`);
    }
    if (row[iFechaCertificacion] && !fechaCertificacion) {
      observaciones.push(`Fecha de certificación "${row[iFechaCertificacion]}" no es válida: no se asignó`);
    }
    const instaladoPor = valor(row, iInstalador);

    const { marcaCat, modeloCat, diametroCat, loteCat } = await resolverCatalogos(
      marcaNombre,
      modeloNombre,
      tipo,
      diametroValor,
      lote
    );

    const medidoresDelSuscriptor = medidoresPorSuscriptor.get(suscriptor.id) ?? [];
    let medidor =
      (serial ? medidoresDelSuscriptor.find((m) => m.serial === serial) : null) ??
      medidoresDelSuscriptor.find((m) => m.activo) ??
      null;

    const esNuevo = !medidor;
    if (!medidor) {
      medidor = await prisma.medidor.create({ data: { suscriptorId: suscriptor.id } });
      medidoresDelSuscriptor.push(medidor);
      medidoresPorSuscriptor.set(suscriptor.id, medidoresDelSuscriptor);
    }

    try {
      medidor = await prisma.medidor.update({
        where: { id: medidor.id },
        data: {
          suscriptorId: suscriptor.id,
          serial: serial ?? medidor.serial,
          marcaId: marcaCat?.id ?? medidor.marcaId,
          modeloId: modeloCat?.id ?? medidor.modeloId,
          diametroId: diametroCat?.id ?? medidor.diametroId,
          tipo: modeloCat?.tipo ?? tipo ?? medidor.tipo,
          loteId: loteCat?.id ?? medidor.loteId,
          estado: "instalado",
          activo: true,
          fechaInstalacion: fechaInstalacion ?? medidor.fechaInstalacion,
          fechaFabricacion: fechaFabricacion ?? medidor.fechaFabricacion,
          fechaCertificacion: fechaCertificacion ?? medidor.fechaCertificacion,
          certificado: certificado ?? medidor.certificado,
        },
      });
    } catch (err: any) {
      omitidos++;
      observacionesPorFila.push(
        err?.code === "P2002" ? `Omitido: el serial "${serial}" ya está en uso por otro medidor` : "Omitido: error al guardar la fila"
      );
      continue;
    }

    // Igual que al registrar una acta de instalación individual (ver actas.ts): asignarle un
    // medidor a un suscriptor que estaba "sin_medidor" lo mueve a "instalado" (pendiente de
    // validar antes de facturar), salvo que ya estuviera en un estado más avanzado (facturando,
    // o inactivo/dañado a propósito).
    if (!["facturando", "inactivo"].includes(suscriptor.estadoFacturacion)) {
      await prisma.suscriptor.update({
        where: { id: suscriptor.id },
        data: { estadoFacturacion: "instalado_prueba" },
      });
      suscriptor.estadoFacturacion = "instalado_prueba";
    }

    if (instaladoPor && fechaInstalacion && medidor.serial) {
      const instaladorResuelto = resolverInstalador(instaladoPor);
      if (!instaladorResuelto) {
        observaciones.push(`"${instaladoPor}" no coincide con ningún usuario activo: no se generó el acta`);
      } else {
        const actaExistente = actaPorMedidor.get(medidor.id);
        if (!actaExistente) {
          const acta = await prisma.actaInstalacion.create({
            data: {
              medidorId: medidor.id,
              suscriptorId: suscriptor.id,
              serial: medidor.serial,
              fechaInstalacion,
              instaladoPor: instaladorResuelto,
              fotos: [],
            },
          });
          actaPorMedidor.set(medidor.id, acta);
        }
      }
    }

    for (const nuidCot of parsearNuidsCotitulares(valor(row, iCotitulares))) {
      if (nuidCot === nuid) continue;
      const suscriptorCot = suscriptorPorCodigo.get(nuidCot);
      if (!suscriptorCot) {
        observaciones.push(`Cotitular "${nuidCot}" no existe: no se vinculó`);
        continue;
      }
      const yaEsCotitularDeEste = await prisma.cotitular.findUnique({ where: { suscriptorId: suscriptorCot.id } });
      if (yaEsCotitularDeEste?.medidorId === medidor.id) continue; // ya estaba vinculado, nada que hacer
      try {
        await prisma.cotitular.create({ data: { medidorId: medidor.id, suscriptorId: suscriptorCot.id } });
      } catch {
        observaciones.push(`Cotitular "${nuidCot}" no se pudo vincular (ya es titular o cotitular de otro medidor)`);
      }
    }

    if (esNuevo) creados++;
    else actualizados++;
    observacionesPorFila.push(observaciones.length > 0 ? `${esNuevo ? "Creado" : "Actualizado"}. ${observaciones.join(" | ")}` : `${esNuevo ? "Creado" : "Actualizado"} correctamente`);
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
  const reporteBuffer = await crearPlantillaImportExport("Medidores", columnas, filasReporte);

  res.json({ creados, actualizados, omitidos, reporteBase64: reporteBuffer.toString("base64") });
});

// Sin "page", devuelve el listado completo (lo usan los combobox que necesitan buscar/filtrar
// en el cliente, ej. "medidores en bodega" al asignar uno a un suscriptor). Con "page", pagina
// y filtra en el servidor — para la tabla de Inventario, que ya no necesita traer todo de una.
medidoresRouter.get("/", async (req, res) => {
  const { ruta, activo, estado, condicion, marca, modeloId, diametroId, tipo, q, page, limit } = req.query;

  const filtros: any[] = [];
  if (activo !== undefined) filtros.push({ activo: activo === "true" });
  if (estado) filtros.push({ estado: String(estado) });
  if (condicion) filtros.push({ condicion: String(condicion) });
  if (marca) filtros.push({ marcaCat: { nombre: String(marca) } });
  if (modeloId) filtros.push({ modeloId: Number(modeloId) });
  if (diametroId) filtros.push({ diametroId: Number(diametroId) });
  if (tipo) filtros.push({ tipo: String(tipo) });
  if (ruta) filtros.push({ suscriptor: { ruta: String(ruta) } });
  if (q) {
    const texto = String(q).trim();
    filtros.push({
      OR: [
        { serial: { contains: texto, mode: "insensitive" as const } },
        { tipo: { contains: texto, mode: "insensitive" as const } },
        { marcaCat: { nombre: { contains: texto, mode: "insensitive" as const } } },
        { modeloCat: { nombre: { contains: texto, mode: "insensitive" as const } } },
      ],
    });
  }
  const where = filtros.length > 0 ? { AND: filtros } : undefined;

  if (page) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 10);
    // Orden por clic en el encabezado de la tabla. Whitelist de claves (nada de pasar el campo
    // crudo a Prisma); relaciones se ordenan por su nombre visible, y "sort: 'nulls last'" no
    // hace falta: Prisma pone los null al final en asc por defecto en Postgres.
    const dir: "asc" | "desc" = String(req.query.dir) === "desc" ? "desc" : "asc";
    const ORDENES: Record<string, object> = {
      serial: { serial: dir },
      tipo: { tipo: dir },
      marca: { marcaCat: { nombre: dir } },
      modelo: { modeloCat: { nombre: dir } },
      diametro: { diametroCat: { valor: dir } },
      lote: { lote: { serialInicial: dir } },
      estado: { estado: dir },
    };
    const orderBy = ORDENES[String(req.query.sort ?? "")] ?? { id: "asc" };

    const [data, total] = await Promise.all([
      prisma.medidor.findMany({
        where,
        include: { suscriptor: true, marcaCat: true, modeloCat: true, diametroCat: true, lote: true },
        orderBy,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.medidor.count({ where }),
    ]);
    return res.json({ data, total, page: pageNum, limit: limitNum });
  }

  const medidores = await prisma.medidor.findMany({
    where,
    include: { suscriptor: true, marcaCat: true, modeloCat: true, diametroCat: true, lote: true },
    orderBy: { id: "asc" },
  });
  res.json(medidores);
});

medidoresRouter.get("/:id", async (req, res) => {
  const medidor = await prisma.medidor.findUnique({
    where: { id: Number(req.params.id) },
    include: { suscriptor: true, lote: true, marcaCat: true, modeloCat: true, diametroCat: true },
  });
  if (!medidor) return res.status(404).json({ error: "No encontrado" });
  res.json(medidor);
});

medidoresRouter.post("/", soloAvanzado, async (req, res) => {
  const {
    suscriptorId,
    serial,
    marcaId,
    modeloId,
    diametroId,
    fechaInstalacion,
    tipo,
    fechaFabricacion,
    fechaCertificacion,
    clase,
    certificado,
    loteId,
    lecturaInicial,
  } = req.body;

  const [marcaCat, modeloCat, diametroCat] = await Promise.all([
    marcaId ? prisma.marcaMedidor.findUnique({ where: { id: Number(marcaId) } }) : null,
    modeloId ? prisma.modeloMedidor.findUnique({ where: { id: Number(modeloId) } }) : null,
    diametroId ? prisma.diametroMedidor.findUnique({ where: { id: Number(diametroId) } }) : null,
  ]);

  const medidor = await prisma.medidor.create({
    data: {
      suscriptorId: suscriptorId ? Number(suscriptorId) : null,
      estado: suscriptorId ? "instalado" : "en_bodega",
      serial: serial || null,
      marcaId: marcaCat?.id ?? null,
      modeloId: modeloCat?.id ?? null,
      diametroId: diametroCat?.id ?? null,
      fechaInstalacion: fechaInstalacion ? new Date(fechaInstalacion) : null,
      tipo: modeloCat?.tipo ?? tipo,
      fechaFabricacion: fechaFabricacion ? new Date(fechaFabricacion) : null,
      fechaCertificacion: fechaCertificacion ? new Date(fechaCertificacion) : null,
      clase,
      certificado,
      loteId: loteId ? Number(loteId) : null,
      lecturaInicial,
    },
  });
  res.status(201).json(medidor);
});

// Solo se puede borrar un medidor "limpio" (sin lecturas, actas, novedades ni cotitulares):
// si ya tiene historial, el flujo correcto es reemplazarlo desde una acta de instalación
// nueva (el anterior queda inactivo pero conserva sus datos), no borrarlo.
medidoresRouter.delete("/:id", soloAvanzado, async (req, res) => {
  const id = Number(req.params.id);
  const medidor = await prisma.medidor.findUnique({ where: { id } });
  if (!medidor) return res.status(404).json({ error: "No encontrado" });

  const [lecturas, actas, cotitulares, novedades] = await Promise.all([
    prisma.lectura.count({ where: { medidorId: id } }),
    prisma.actaInstalacion.count({ where: { medidorId: id } }),
    prisma.cotitular.count({ where: { medidorId: id } }),
    prisma.novedadLectura.count({ where: { medidorId: id } }),
  ]);
  if (lecturas + actas + cotitulares + novedades > 0) {
    return res.status(400).json({
      error: "No se puede eliminar: el medidor tiene lecturas, actas u otra información asociada.",
    });
  }

  await prisma.medidor.delete({ where: { id } });
  res.status(204).end();
});

// Vivienda multiusuario (ej. un edificio de apartamentos con un solo medidor en la entrada):
// el titular es el suscriptor dueño del Medidor.suscriptorId, y cada apartamento adicional se
// agrega aquí como "cotitular" con su propio NUID. Solo se toma una lectura para el medidor
// compartido; el consumo se reparte automáticamente en partes iguales entre titular y
// cotitulares al calcular reportes (ver reportes.ts).
medidoresRouter.post("/:id/cotitulares", soloAvanzado, async (req, res) => {
  const medidorId = Number(req.params.id);
  const { nuid } = req.body;
  if (!nuid || !String(nuid).trim()) return res.status(400).json({ error: "El NUID es requerido" });
  const codigo = String(nuid).trim();

  const medidor = await prisma.medidor.findUnique({ where: { id: medidorId } });
  if (!medidor) return res.status(404).json({ error: "Medidor no encontrado" });

  const suscriptor = await prisma.suscriptor.findUnique({ where: { codigo } });
  if (!suscriptor) return res.status(400).json({ error: `No existe ningún suscriptor con NUID "${codigo}"` });

  if (suscriptor.id === medidor.suscriptorId) {
    return res.status(400).json({ error: "Ese NUID ya es el titular de este medidor" });
  }

  const yaEsTitular = await prisma.medidor.count({ where: { suscriptorId: suscriptor.id, activo: true } });
  if (yaEsTitular > 0) {
    return res.status(400).json({ error: "Ese suscriptor ya es titular de otro medidor activo" });
  }

  try {
    const cotitular = await prisma.cotitular.create({
      data: { medidorId, suscriptorId: suscriptor.id },
      include: { suscriptor: true },
    });
    res.status(201).json(cotitular);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(400).json({ error: "Ese suscriptor ya es cotitular de otro medidor" });
    }
    throw err;
  }
});

medidoresRouter.delete("/:id/cotitulares/:suscriptorId", soloAvanzado, async (req, res) => {
  const medidorId = Number(req.params.id);
  const suscriptorId = Number(req.params.suscriptorId);
  const cotitular = await prisma.cotitular.findUnique({ where: { suscriptorId } });
  if (!cotitular || cotitular.medidorId !== medidorId) return res.status(404).json({ error: "No encontrado" });
  await prisma.cotitular.delete({ where: { suscriptorId } });
  res.status(204).end();
});

medidoresRouter.put("/:id", soloAvanzado, async (req, res) => {
  const {
    serial,
    marcaId,
    modeloId,
    diametroId,
    fechaInstalacion,
    tipo,
    fechaFabricacion,
    fechaCertificacion,
    clase,
    certificado,
    loteId,
    lecturaInicial,
    activo,
    condicion,
  } = req.body;

  if (condicion !== undefined && !["bueno", "danado"].includes(condicion)) {
    return res.status(400).json({ error: "condicion inválida (usa 'bueno' o 'danado')" });
  }

  const antes = await prisma.medidor.findUnique({
    where: { id: Number(req.params.id) },
    include: { marcaCat: true, modeloCat: true, diametroCat: true, lote: true },
  });
  if (!antes) return res.status(404).json({ error: "No encontrado" });

  // undefined = no tocar el campo; null = borrar la relación; número = buscar y enlazar
  const [marcaCat, modeloCat, diametroCat] = await Promise.all([
    marcaId ? prisma.marcaMedidor.findUnique({ where: { id: Number(marcaId) } }) : null,
    modeloId ? prisma.modeloMedidor.findUnique({ where: { id: Number(modeloId) } }) : null,
    diametroId ? prisma.diametroMedidor.findUnique({ where: { id: Number(diametroId) } }) : null,
  ]);

  const medidor = await prisma.medidor.update({
    where: { id: Number(req.params.id) },
    data: {
      serial: serial !== undefined ? serial : undefined,
      marcaId: marcaId !== undefined ? marcaCat?.id ?? null : undefined,
      modeloId: modeloId !== undefined ? modeloCat?.id ?? null : undefined,
      diametroId: diametroId !== undefined ? diametroCat?.id ?? null : undefined,
      // undefined = no vino en el body, no tocar; "" o null = limpiar la fecha; valor = parsear.
      fechaInstalacion: fechaInstalacion === undefined ? undefined : fechaInstalacion ? new Date(fechaInstalacion) : null,
      tipo: marcaId !== undefined || modeloId !== undefined ? modeloCat?.tipo ?? null : tipo,
      fechaFabricacion: fechaFabricacion === undefined ? undefined : fechaFabricacion ? new Date(fechaFabricacion) : null,
      fechaCertificacion: fechaCertificacion === undefined ? undefined : fechaCertificacion ? new Date(fechaCertificacion) : null,
      clase,
      certificado,
      loteId: loteId !== undefined ? (loteId ? Number(loteId) : null) : undefined,
      lecturaInicial,
      activo,
      condicion,
    },
    include: { marcaCat: true, modeloCat: true, diametroCat: true, lote: true },
  });

  await registrarCambios("medidor", medidor.id, camposMedidor(antes), camposMedidor(medidor), req.usuario?.id);

  res.json(medidor);
});

// Sube (o reemplaza) el acta de calibración escaneada (PDF o imagen) de un medidor. Es un
// documento individual por medidor, no por lote — el fabricante certifica cada unidad, aunque
// varias vengan de la misma caja/lote.
medidoresRouter.post("/:id/acta-calibracion", soloAvanzado, upload.single("archivo"), async (req, res) => {
  const id = Number(req.params.id);
  const medidor = await prisma.medidor.findUnique({ where: { id } });
  if (!medidor) return res.status(404).json({ error: "No encontrado" });
  if (!req.file) return res.status(400).json({ error: "Falta el archivo (campo 'archivo')" });

  const actaCalibracionUrl = await guardarArchivo("actas-calibracion", req.file.buffer, req.file.originalname, req.file.mimetype);
  if (medidor.actaCalibracionUrl) await borrarArchivo(medidor.actaCalibracionUrl);

  const actualizado = await prisma.medidor.update({ where: { id }, data: { actaCalibracionUrl } });
  res.json(actualizado);
});

medidoresRouter.delete("/:id/acta-calibracion", soloAvanzado, async (req, res) => {
  const id = Number(req.params.id);
  const medidor = await prisma.medidor.findUnique({ where: { id } });
  if (!medidor) return res.status(404).json({ error: "No encontrado" });
  if (medidor.actaCalibracionUrl) await borrarArchivo(medidor.actaCalibracionUrl);

  const actualizado = await prisma.medidor.update({ where: { id }, data: { actaCalibracionUrl: null } });
  res.json(actualizado);
});
