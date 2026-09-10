import {
  API_URL,
  getToken,
  Suscriptor,
  Medidor,
  Barrio,
  Estrato,
  MarcaMedidor,
  ModeloMedidor,
  DiametroMedidor,
  VarianteMedidor,
  Lote,
  Tercero,
  ActaInstalacion,
  PuntoAforo,
  Aforo,
  CategoriaInventario,
  UbicacionInventario,
  ProveedorInventario,
  ItemInventario,
  PrestamoInventario,
  MovimientoInventario,
  Tarifa,
  LecturaPendiente,
} from "../api/client";

const DB_NAME = "medidores-offline-snapshot";
const DB_VERSION = 1;
const STORE = "snapshot";
const CLAVE = "actual";

export interface LecturaSnapshot {
  id: number;
  medidorId: number;
  periodo: string;
  valorLectura: string;
  consumo: string;
  observaciones: string | null;
  fotoUrl: string | null;
  fechaRegistro: string;
  capturadoPorId: number | null;
  latitud: number | null;
  longitud: number | null;
}

export interface NovedadLecturaSnapshot {
  id: number;
  medidorId: number;
  periodo: string;
  motivo: string;
  fotos: string[];
}

export interface SnapshotOffline {
  generadoEn: string;
  suscriptores: Suscriptor[];
  medidores: Medidor[];
  lecturas: LecturaSnapshot[];
  novedadesLectura: NovedadLecturaSnapshot[];
  barrios: Barrio[];
  estratos: Estrato[];
  marcas: MarcaMedidor[];
  modelos: ModeloMedidor[];
  diametros: DiametroMedidor[];
  variantes: VarianteMedidor[];
  lotes: Lote[];
  actas: ActaInstalacion[];
  terceros: Tercero[];
  puntosAforo: PuntoAforo[];
  aforos: Aforo[];
  categoriasInventario: CategoriaInventario[];
  ubicacionesInventario: UbicacionInventario[];
  proveedoresInventario: ProveedorInventario[];
  itemsInventario: ItemInventario[];
  prestamosInventario: PrestamoInventario[];
  movimientosInventario: MovimientoInventario[];
  tarifas: Tarifa[];
  usuarios: { id: number; nombre: string }[];
}

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function guardarSnapshot(data: SnapshotOffline): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(data, CLAVE);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function leerSnapshot(): Promise<SnapshotOffline | null> {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(CLAVE);
    req.onsuccess = () => resolve((req.result as SnapshotOffline) ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// Descarga TODO lo necesario para trabajar en campo sin conexión (ver backend/.../offline.ts —
// deliberadamente sin fotos/PDFs, esos viven en MinIO y pesan demasiado para esto) y lo guarda en
// IndexedDB. Se usa fetch + ReadableStream en vez del helper genérico request() de api/core.ts
// porque acá interesa el progreso real, byte a byte, para la barra de "Activar modo de salida" —
// un simple await response.json() no deja saber cuánto falta hasta que termina todo de golpe.
export async function descargarSnapshot(
  onProgreso: (recibidos: number, total: number | null) => void
): Promise<SnapshotOffline> {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/offline/snapshot`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Error ${res.status} al descargar los datos`);

  const totalHeader = res.headers.get("Content-Length");
  const total = totalHeader ? Number(totalHeader) : null;

  let data: SnapshotOffline;
  if (!res.body) {
    data = await res.json();
    onProgreso(total ?? 0, total);
  } else {
    const reader = res.body.getReader();
    const partes: Uint8Array[] = [];
    let recibidos = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      partes.push(value);
      recibidos += value.length;
      onProgreso(recibidos, total);
    }
    const buffer = new Uint8Array(recibidos);
    let offset = 0;
    for (const parte of partes) {
      buffer.set(parte, offset);
      offset += parte.length;
    }
    data = JSON.parse(new TextDecoder("utf-8").decode(buffer));
  }

  await guardarSnapshot(data);
  return data;
}

// "YYYY-MM" -> primer día de ese mes en UTC, igual que primerDiaMes() del backend
// (backend/src/lib/periodo.ts) — hay que reproducir esa misma convención acá para que comparar
// contra snapshot.lecturas[].periodo (que llega en ese mismo formato) dé el resultado correcto.
function primerDiaPeriodo(periodo: string): Date {
  const [anio, mes] = periodo.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, 1));
}

// Reconstruye la lista de "Captura de Lecturas" de un periodo a partir del snapshot completo
// offline, con la MISMA lógica de filtrado que el backend (ver GET /api/lecturas): medidor
// activo, con suscriptor, instalado antes del día 21 del periodo, y suscriptor no inactivo. Es el
// respaldo de último recurso cuando ni la cache puntual del periodo (cacheOffline.ts, los 3 meses
// que Lecturas precarga) tiene nada — cubre CUALQUIER periodo, no solo los 3 recientes, porque el
// snapshot trae el histórico completo.
export function construirLecturasDePeriodo(snapshot: SnapshotOffline, periodo: string): LecturaPendiente[] {
  const fecha = primerDiaPeriodo(periodo);
  const corteInstalacion = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 21));
  const suscriptorPorId = new Map(snapshot.suscriptores.map((s) => [s.id, s]));
  const usuarioPorId = new Map(snapshot.usuarios.map((u) => [u.id, u]));

  return snapshot.medidores
    .filter((m) => {
      if (!m.activo || !m.suscriptorId) return false;
      const suscriptor = suscriptorPorId.get(m.suscriptorId);
      if (!suscriptor || suscriptor.estadoFacturacion === "inactivo") return false;
      if (m.fechaInstalacion && new Date(m.fechaInstalacion) >= corteInstalacion) return false;
      return true;
    })
    .map((m): LecturaPendiente => {
      const suscriptor = suscriptorPorId.get(m.suscriptorId!)!;
      const lecturasDelMedidor = snapshot.lecturas.filter((l) => l.medidorId === m.id);
      const lecturaEsteMes = lecturasDelMedidor.find((l) => new Date(l.periodo).getTime() === fecha.getTime());
      const anteriores = lecturasDelMedidor
        .filter((l) => new Date(l.periodo).getTime() < fecha.getTime())
        .sort((a, b) => new Date(b.periodo).getTime() - new Date(a.periodo).getTime());
      const novedadEsteMes = snapshot.novedadesLectura.find(
        (n) => n.medidorId === m.id && new Date(n.periodo).getTime() === fecha.getTime()
      );
      return {
        medidorId: m.id,
        serial: m.serial ?? "",
        suscriptor,
        lecturaAnteriorValor: anteriores[0]?.valorLectura ?? m.lecturaInicial ?? null,
        lectura: lecturaEsteMes
          ? {
              id: lecturaEsteMes.id,
              valorLectura: lecturaEsteMes.valorLectura,
              consumo: lecturaEsteMes.consumo,
              observaciones: lecturaEsteMes.observaciones,
              fotoUrl: lecturaEsteMes.fotoUrl,
              capturadoPor: lecturaEsteMes.capturadoPorId
                ? usuarioPorId.get(lecturaEsteMes.capturadoPorId) ?? null
                : null,
            }
          : null,
        novedad: novedadEsteMes
          ? { id: novedadEsteMes.id, motivo: novedadEsteMes.motivo, fotos: novedadEsteMes.fotos }
          : null,
      };
    });
}

// Mismo criterio que GET /api/lecturas/resumen, para la barra de avance del periodo.
export function calcularResumenPeriodo(snapshot: SnapshotOffline, periodo: string): { total: number; tomadas: number } {
  const filas = construirLecturasDePeriodo(snapshot, periodo);
  return { total: filas.length, tomadas: filas.filter((f) => f.lectura).length };
}

// Mismo reparto entero que usa el backend para acometidas compartidas (cotitulares): en partes
// iguales, y si no da exacto, el titular se queda con el resto — ver cotitularSplit.ts.
function repartirEntero(total: number, nIntegrantes: number, esCotitular: boolean): number {
  if (nIntegrantes <= 1) return total;
  const share = Math.floor(total / nIntegrantes);
  return esCotitular ? share : total - share * (nIntegrantes - 1);
}

// Mismo criterio que periodoFacturableActual() del backend (lib/periodo.ts): antes del día 20
// el periodo "vigente" todavía es el mes anterior.
function periodoFacturableActual(): string {
  const now = new Date();
  let anio = now.getUTCFullYear();
  let mes = now.getUTCDate() < 20 ? now.getUTCMonth() : now.getUTCMonth() + 1;
  if (mes === 0) {
    mes = 12;
    anio -= 1;
  }
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

export interface HistoricoConsumoFila {
  periodo: string;
  consumo: number;
  sinLectura: boolean;
  motivo?: string;
  novedadId?: number;
  fotos?: string[];
  medidorId?: number;
  lecturaId?: number;
  fotoUrl?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  fechaRegistro?: string;
  capturadoPor?: string | null;
  consumoTotalMedidor?: number | null;
  nIntegrantes?: number | null;
}

// Reconstruye GET /api/reportes/consumo-suscriptor/:id (la gráfica de barras de consumo de la
// ficha de un suscriptor) desde el snapshot completo offline — mismo algoritmo que
// backend/src/lib/historicoSuscriptor.ts: rastrea todos los medidores que este suscriptor tuvo
// alguna vez (por acta, aunque ya se hayan reemplazado), acota cada lectura a la ventana de
// tiempo en que ese medidor fue realmente suyo, reparte el consumo entre cotitulares si aplica, y
// rellena los meses sin lectura (con el motivo de la novedad, si hay una registrada).
export function construirHistoricoSuscriptor(snapshot: SnapshotOffline, suscriptorId: number): HistoricoConsumoFila[] {
  const mesDe = (iso: string) => iso.slice(0, 7);
  const usuarioPorId = new Map(snapshot.usuarios.map((u) => [u.id, u]));

  const actasSuscriptor = snapshot.actas.filter((a) => a.suscriptorId === suscriptorId);
  const medidorVinculadoHoy = snapshot.medidores.filter((m) => m.suscriptorId === suscriptorId);
  const medidorIdsPropios = [...new Set([...actasSuscriptor.map((a) => a.medidorId), ...medidorVinculadoHoy.map((m) => m.id)])];

  const todasLasActas = snapshot.actas
    .filter((a) => medidorIdsPropios.includes(a.medidorId))
    .sort((a, b) => a.fechaInstalacion.localeCompare(b.fechaInstalacion));
  const ventanasGlobalesPorMedidor = new Map<number, { suscriptorId: number; desde: string; hasta: string | null }[]>();
  for (const a of todasLasActas) {
    if (!ventanasGlobalesPorMedidor.has(a.medidorId)) ventanasGlobalesPorMedidor.set(a.medidorId, []);
    ventanasGlobalesPorMedidor.get(a.medidorId)!.push({
      suscriptorId: a.suscriptorId,
      desde: mesDe(a.fechaInstalacion),
      hasta: a.fechaRetiro ? mesDe(a.fechaRetiro) : null,
    });
  }
  for (const m of medidorVinculadoHoy) {
    if (!ventanasGlobalesPorMedidor.has(m.id)) {
      ventanasGlobalesPorMedidor.set(m.id, [
        { suscriptorId, desde: m.fechaInstalacion ? mesDe(m.fechaInstalacion) : "0000-00", hasta: null },
      ]);
    }
  }
  const duenoDePeriodo = (medidorId: number, periodo: string): number | null => {
    const ventanas = ventanasGlobalesPorMedidor.get(medidorId);
    if (!ventanas || ventanas.length === 0) return null;
    const exacta = ventanas.find((v) => periodo >= v.desde && (v.hasta === null || periodo <= v.hasta));
    if (exacta) return exacta.suscriptorId;
    const primera = ventanas[0];
    return periodo < primera.desde ? primera.suscriptorId : null;
  };
  const dentroDeVentana = (medidorId: number, periodo: string) => duenoDePeriodo(medidorId, periodo) === suscriptorId;

  const medidoresPropios = snapshot.medidores.filter((m) => medidorIdsPropios.includes(m.id));

  const historico: HistoricoConsumoFila[] = [];
  for (const m of medidoresPropios) {
    const nIntegrantes = 1 + (m.cotitulares?.length ?? 0);
    const lecturas = snapshot.lecturas.filter((l) => l.medidorId === m.id).sort((a, b) => a.periodo.localeCompare(b.periodo));
    for (const l of lecturas) {
      const periodo = mesDe(l.periodo);
      if (!dentroDeVentana(m.id, periodo)) continue;
      const consumoTotal = Number(l.consumo);
      historico.push({
        periodo,
        consumo: repartirEntero(consumoTotal, nIntegrantes, false),
        sinLectura: false,
        medidorId: m.id,
        lecturaId: l.id,
        fotoUrl: l.fotoUrl,
        latitud: l.latitud,
        longitud: l.longitud,
        fechaRegistro: l.fechaRegistro,
        capturadoPor: l.capturadoPorId ? usuarioPorId.get(l.capturadoPorId)?.nombre ?? null : null,
        consumoTotalMedidor: nIntegrantes > 1 ? consumoTotal : null,
        nIntegrantes: nIntegrantes > 1 ? nIntegrantes : null,
      });
    }
  }

  const medidorIds = [...medidorIdsPropios];
  let medidorActivoId = medidoresPropios.find((m) => m.activo)?.id ?? medidoresPropios[0]?.id;

  const suscriptor = snapshot.suscriptores.find((s) => s.id === suscriptorId);
  const medidorCotitularDe = suscriptor?.cotitularDe?.medidor;
  if (medidorCotitularDe) {
    medidorIds.push(medidorCotitularDe.id);
    medidorActivoId = medidorActivoId ?? medidorCotitularDe.id;
    const nIntegrantes = 1 + (medidorCotitularDe.cotitulares?.length ?? 0);
    const lecturas = snapshot.lecturas.filter((l) => l.medidorId === medidorCotitularDe.id);
    for (const l of lecturas) {
      const consumoTotal = Number(l.consumo);
      historico.push({
        periodo: mesDe(l.periodo),
        consumo: repartirEntero(consumoTotal, nIntegrantes, true),
        sinLectura: false,
        medidorId: medidorCotitularDe.id,
        lecturaId: l.id,
        fotoUrl: l.fotoUrl,
        latitud: l.latitud,
        longitud: l.longitud,
        fechaRegistro: l.fechaRegistro,
        capturadoPor: l.capturadoPorId ? usuarioPorId.get(l.capturadoPorId)?.nombre ?? null : null,
        consumoTotalMedidor: consumoTotal,
        nIntegrantes,
      });
    }
  }

  if (historico.length === 0) return [];
  historico.sort((a, b) => a.periodo.localeCompare(b.periodo));

  const novedades = snapshot.novedadesLectura.filter((n) => medidorIds.includes(n.medidorId));
  const novedadPorPeriodo = new Map(novedades.map((n) => [mesDe(n.periodo), n]));
  const existentePorPeriodo = new Map(historico.map((h) => [h.periodo, h]));

  const ultimaNovedad = novedades.reduce<string | null>((max, n) => {
    const p = mesDe(n.periodo);
    return !max || p > max ? p : max;
  }, null);
  const rangoOrdenado = [periodoFacturableActual(), ultimaNovedad ?? ""].sort();
  const finRango = rangoOrdenado[rangoOrdenado.length - 1];

  const completo: HistoricoConsumoFila[] = [];
  let [y, m] = historico[0].periodo.split("-").map(Number);
  const [yFin, mFin] = finRango.split("-").map(Number);
  while (y < yFin || (y === yFin && m <= mFin)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const existente = existentePorPeriodo.get(key);
    if (existente) {
      completo.push(existente);
    } else {
      const novedad = novedadPorPeriodo.get(key);
      completo.push({
        periodo: key,
        consumo: 0,
        sinLectura: true,
        motivo: novedad?.motivo,
        novedadId: novedad?.id,
        fotos: novedad?.fotos,
        medidorId: medidorActivoId,
      });
    }
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  return completo;
}

// Compara igual que el backend: "codigo"/"estrato" son texto pero se comparan numérico (NUID
// "10" > "2"), el resto alfabético — ver comentario equivalente en suscriptores.ts.
function compararNumericoOTexto(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
}

// Reconstruye GET /api/suscriptores (paginado + filtros + orden) desde el snapshot completo
// offline. Último recurso cuando la lista de Suscriptores no puede pedirle nada al servidor —
// filtra/ordena/pagina todo en el cliente sobre los ~4300 registros ya en IndexedDB.
export function listarSuscriptoresOffline(
  snapshot: SnapshotOffline,
  opts: {
    pagina: number;
    porPagina: number;
    q?: string;
    estadoFacturacion?: string;
    barrioId?: number;
    estratoId?: number;
    estadoPredio?: string;
    conCotitular?: boolean;
    sort: string;
    dir: "asc" | "desc";
  }
): { data: Suscriptor[]; total: number } {
  const texto = opts.q?.trim().toUpperCase() ?? "";
  let filtrados = snapshot.suscriptores.filter((s) => {
    if (texto) {
      const coincide =
        (s.nombre ?? "").toUpperCase().includes(texto) ||
        s.codigo.toUpperCase().includes(texto) ||
        (s.ruta ?? "").toUpperCase().includes(texto);
      if (!coincide) return false;
    }
    if (opts.estadoFacturacion && s.estadoFacturacion !== opts.estadoFacturacion) return false;
    if (opts.barrioId && s.barrioCat?.id !== opts.barrioId) return false;
    if (opts.estratoId && s.estratoCat?.id !== opts.estratoId) return false;
    if (opts.estadoPredio && s.estadoPredio !== opts.estadoPredio) return false;
    if (opts.conCotitular) {
      const tieneCotitular = (s.medidores ?? []).some((m) => (m.cotitulares ?? []).length > 0) || !!s.cotitularDe;
      if (!tieneCotitular) return false;
    }
    return true;
  });

  const dirNum = opts.dir === "desc" ? -1 : 1;
  const CLAVE: Record<string, (s: Suscriptor) => string> = {
    codigo: (s) => s.codigo,
    nombre: (s) => s.nombre ?? "",
    ruta: (s) => s.ruta ?? "",
    barrio: (s) => s.barrioCat?.nombre ?? "",
    estrato: (s) => s.estratoCat?.codigo ?? "",
    estadoPredio: (s) => s.estadoPredio ?? "",
    estadoFacturacion: (s) => s.estadoFacturacion ?? "",
  };
  const clave = CLAVE[opts.sort] ?? CLAVE.codigo;
  const numerico = opts.sort === "codigo" || opts.sort === "estrato";
  filtrados = [...filtrados].sort((a, b) => {
    const va = clave(a);
    const vb = clave(b);
    return dirNum * (numerico ? compararNumericoOTexto(va, vb) : va.localeCompare(vb));
  });

  const total = filtrados.length;
  const inicio = (opts.pagina - 1) * opts.porPagina;
  return { data: filtrados.slice(inicio, inicio + opts.porPagina), total };
}

// Reconstruye GET /api/medidores (paginado + filtros + orden) desde el snapshot completo offline.
export function listarMedidoresOffline(
  snapshot: SnapshotOffline,
  opts: {
    pagina: number;
    porPagina: number;
    q?: string;
    estado?: string;
    marca?: string;
    condicion?: string;
    modeloId?: number;
    diametroId?: number;
    tipo?: string;
    sort: string;
    dir: "asc" | "desc";
  }
): { data: Medidor[]; total: number } {
  const texto = opts.q?.trim().toLowerCase() ?? "";
  let filtrados = snapshot.medidores.filter((m) => {
    if (texto) {
      const coincide =
        (m.serial ?? "").toLowerCase().includes(texto) ||
        (m.tipo ?? "").toLowerCase().includes(texto) ||
        (m.marcaCat?.nombre ?? "").toLowerCase().includes(texto) ||
        (m.modeloCat?.nombre ?? "").toLowerCase().includes(texto);
      if (!coincide) return false;
    }
    if (opts.estado && m.estado !== opts.estado) return false;
    if (opts.condicion && m.condicion !== opts.condicion) return false;
    if (opts.marca && m.marcaCat?.nombre !== opts.marca) return false;
    if (opts.modeloId && m.modeloCat?.id !== opts.modeloId) return false;
    if (opts.diametroId && m.diametroCat?.id !== opts.diametroId) return false;
    if (opts.tipo && m.tipo !== opts.tipo) return false;
    return true;
  });

  const dirNum = opts.dir === "desc" ? -1 : 1;
  const CLAVE: Record<string, (m: Medidor) => string> = {
    serial: (m) => m.serial ?? "",
    tipo: (m) => m.tipo ?? "",
    marca: (m) => m.marcaCat?.nombre ?? "",
    modelo: (m) => m.modeloCat?.nombre ?? "",
    diametro: (m) => m.diametroCat?.valor ?? "",
    lote: (m) => m.lote?.serialInicial ?? "",
    estado: (m) => m.estado ?? "",
  };
  const clave = CLAVE[opts.sort];
  filtrados = clave
    ? [...filtrados].sort((a, b) => dirNum * clave(a).localeCompare(clave(b)))
    : [...filtrados].sort((a, b) => dirNum * (a.id - b.id));

  const total = filtrados.length;
  const inicio = (opts.pagina - 1) * opts.porPagina;
  return { data: filtrados.slice(inicio, inicio + opts.porPagina), total };
}

// Reconstruye GET /api/terceros (paginado + búsqueda) desde el snapshot completo offline.
export function listarTercerosOffline(
  snapshot: SnapshotOffline,
  opts: { pagina: number; porPagina: number; q?: string }
): { data: Tercero[]; total: number } {
  const texto = opts.q?.trim().toLowerCase() ?? "";
  const filtrados = texto
    ? snapshot.terceros.filter(
        (t) =>
          t.nombre.toLowerCase().includes(texto) ||
          (t.numeroDocumento ?? "").toLowerCase().includes(texto) ||
          (t.email ?? "").toLowerCase().includes(texto)
      )
    : snapshot.terceros;

  const total = filtrados.length;
  const inicio = (opts.pagina - 1) * opts.porPagina;
  return { data: filtrados.slice(inicio, inicio + opts.porPagina), total };
}

// Reconstruye GET /api/aforos (paginado + filtro por punto) desde el snapshot completo offline.
export function listarAforosOffline(
  snapshot: SnapshotOffline,
  opts: { pagina: number; porPagina: number; puntoAforoId?: number }
): { data: Aforo[]; total: number } {
  const filtrados = opts.puntoAforoId
    ? snapshot.aforos.filter((a) => a.puntoAforoId === opts.puntoAforoId)
    : snapshot.aforos;
  const total = filtrados.length;
  const inicio = (opts.pagina - 1) * opts.porPagina;
  return { data: filtrados.slice(inicio, inicio + opts.porPagina), total };
}

// El listado real de ítems trae "disponible" ya calculado (cantidad menos lo prestado sin
// devolver) — acá se reproduce lo mismo sobre el snapshot, ya que esas cuentas no vienen
// precalculadas en los datos crudos que se guardan.
export function calcularItemsInventarioOffline(snapshot: SnapshotOffline): (ItemInventario & { disponible: number })[] {
  const prestadoPorItem = new Map<number, number>();
  for (const p of snapshot.prestamosInventario) {
    if (p.fechaDevolucion) continue;
    prestadoPorItem.set(p.itemId, (prestadoPorItem.get(p.itemId) ?? 0) + p.cantidad);
  }
  return snapshot.itemsInventario.map((item) => ({
    ...item,
    disponible: item.cantidad - (prestadoPorItem.get(item.id) ?? 0),
  }));
}

export function listarItemsInventarioOffline(
  snapshot: SnapshotOffline,
  opts: { pagina: number; porPagina: number; q?: string; categoria?: number; ubicacion?: number; proveedor?: number; estado?: string }
): { data: (ItemInventario & { disponible: number })[]; total: number } {
  const texto = opts.q?.trim().toLowerCase() ?? "";
  const filtrados = calcularItemsInventarioOffline(snapshot).filter((i) => {
    if (texto) {
      const coincide =
        i.nombre.toLowerCase().includes(texto) ||
        (i.codigo ?? "").toLowerCase().includes(texto) ||
        (i.categoriaCat?.nombre ?? "").toLowerCase().includes(texto);
      if (!coincide) return false;
    }
    if (opts.categoria && i.categoriaId !== opts.categoria) return false;
    if (opts.ubicacion && i.ubicacionId !== opts.ubicacion) return false;
    if (opts.proveedor && i.proveedorId !== opts.proveedor) return false;
    if (opts.estado && i.estado !== opts.estado) return false;
    return true;
  });
  const total = filtrados.length;
  const inicio = (opts.pagina - 1) * opts.porPagina;
  return { data: filtrados.slice(inicio, inicio + opts.porPagina), total };
}

export function listarPrestamosInventarioOffline(
  snapshot: SnapshotOffline,
  opts: { pagina: number; porPagina: number; itemId?: number; activos?: boolean }
): { data: PrestamoInventario[]; total: number } {
  const filtrados = snapshot.prestamosInventario.filter((p) => {
    if (opts.itemId && p.itemId !== opts.itemId) return false;
    if (opts.activos && p.fechaDevolucion) return false;
    return true;
  });
  const total = filtrados.length;
  const inicio = (opts.pagina - 1) * opts.porPagina;
  return { data: filtrados.slice(inicio, inicio + opts.porPagina), total };
}

export function listarMovimientosInventarioOffline(
  snapshot: SnapshotOffline,
  opts: { pagina: number; porPagina: number; itemId?: number; tipo?: string }
): { data: MovimientoInventario[]; total: number } {
  const filtrados = snapshot.movimientosInventario.filter((m) => {
    if (opts.itemId && m.itemId !== opts.itemId) return false;
    if (opts.tipo && m.tipo !== opts.tipo) return false;
    return true;
  });
  const total = filtrados.length;
  const inicio = (opts.pagina - 1) * opts.porPagina;
  return { data: filtrados.slice(inicio, inicio + opts.porPagina), total };
}
