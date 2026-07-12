import { useEffect, useState } from "react";
import { api } from "../api/client";

const DB_NAME = "medidores-offline";
const DB_VERSION = 2;
const STORE_LECTURAS = "lecturas-pendientes";
const STORE_NOVEDADES = "novedades-pendientes";

export interface PendienteLectura {
  id: string;
  medidorId: number;
  periodo: string;
  valorLectura: number;
  observaciones?: string;
  fotoBlob: Blob;
  fotoNombre: string;
  latitud?: number;
  longitud?: number;
  suscriptor: { nombre: string; codigo: string; ruta: string | null };
  creadoEn: string;
  error?: string;
}

export interface PendienteNovedad {
  id: string;
  medidorId: number;
  periodo: string;
  motivo: string;
  fotos: { blob: Blob; nombre: string }[];
  suscriptor: { nombre: string; codigo: string; ruta: string | null };
  creadoEn: string;
  error?: string;
}

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_LECTURAS)) {
        req.result.createObjectStore(STORE_LECTURAS, { keyPath: "id" });
      }
      if (!req.result.objectStoreNames.contains(STORE_NOVEDADES)) {
        req.result.createObjectStore(STORE_NOVEDADES, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function conStore<T>(store: string, modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, modo);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// Error de red real (sin ruta al servidor) — distinto de una respuesta HTTP de error, que sí
// llegó al backend. navigator.onLine no es confiable, así que la detección real es esta.
function esErrorDeRed(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof DOMException && err.name === "AbortError");
}

// Fábrica genérica: cada tipo de pendiente (lectura, novedad) es una cola independiente con su
// propio object store de IndexedDB, pero comparten toda la lógica de guardar/listar/sincronizar
// y reintentar cuando vuelve la conexión — así no se duplica ese código por cada tipo nuevo.
function crearCola<T extends { id: string; creadoEn: string; error?: string }>(
  store: string,
  subirUno: (item: T) => Promise<void>
) {
  let sincronizando = false;
  const listeners = new Set<() => void>();
  function notificar() {
    listeners.forEach((l) => l());
  }

  async function agregarPendiente(data: Omit<T, "id" | "creadoEn">): Promise<string> {
    const pendiente = {
      ...data,
      id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      creadoEn: new Date().toISOString(),
    } as T;
    await conStore(store, "readwrite", (s) => s.add(pendiente));
    notificar();
    return pendiente.id;
  }

  async function listarPendientes(): Promise<T[]> {
    return conStore(store, "readonly", (s) => s.getAll());
  }

  async function eliminarPendiente(id: string): Promise<void> {
    await conStore(store, "readwrite", (s) => s.delete(id));
    notificar();
  }

  async function sincronizarTodo(): Promise<void> {
    if (sincronizando) return;
    sincronizando = true;
    notificar();
    try {
      const pendientes = await listarPendientes();
      for (const p of pendientes) {
        try {
          await subirUno(p);
          await eliminarPendiente(p.id);
        } catch (err) {
          if (!esErrorDeRed(err)) {
            // Error real del servidor (ej. medidor eliminado): se marca para que el usuario lo
            // vea, no se reintenta indefinidamente.
            const actualizado = { ...p, error: err instanceof Error ? err.message : "Error al sincronizar" };
            await conStore(store, "readwrite", (s) => s.put(actualizado));
          }
          // si es error de red, se deja tal cual para el próximo intento
        }
      }
    } finally {
      sincronizando = false;
      notificar();
    }
  }

  let timerRegistrado = false;
  function asegurarListeners() {
    if (timerRegistrado) return;
    timerRegistrado = true;
    window.addEventListener("online", () => sincronizarTodo());
    setInterval(async () => {
      const pendientes = await listarPendientes();
      if (pendientes.length > 0 && navigator.onLine) sincronizarTodo();
    }, 30000);
  }

  function useColaPendientes() {
    const [pendientes, setPendientes] = useState<T[]>([]);
    const [sync, setSync] = useState(sincronizando);
    const [online, setOnline] = useState(navigator.onLine);

    useEffect(() => {
      asegurarListeners();
      const refrescar = () => {
        setSync(sincronizando);
        listarPendientes().then(setPendientes);
      };
      refrescar();
      listeners.add(refrescar);
      const onOnline = () => setOnline(true);
      const onOffline = () => setOnline(false);
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      return () => {
        listeners.delete(refrescar);
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
      };
    }, []);

    return { pendientes, sincronizando: sync, online, sincronizarAhora: sincronizarTodo };
  }

  return { agregarPendiente, listarPendientes, eliminarPendiente, sincronizarTodo, useColaPendientes };
}

const colaLecturas = crearCola<PendienteLectura>(STORE_LECTURAS, async (p) => {
  const foto = new File([p.fotoBlob], p.fotoNombre, { type: p.fotoBlob.type });
  await api.lecturas.create({
    medidorId: p.medidorId,
    periodo: p.periodo,
    valorLectura: p.valorLectura,
    observaciones: p.observaciones,
    foto,
    latitud: p.latitud,
    longitud: p.longitud,
  });
});

const colaNovedades = crearCola<PendienteNovedad>(STORE_NOVEDADES, async (p) => {
  const fotos = p.fotos.map((f) => new File([f.blob], f.nombre, { type: f.blob.type }));
  await api.lecturas.marcarNovedad({ medidorId: p.medidorId, periodo: p.periodo, motivo: p.motivo, fotos });
});

export const agregarPendiente = colaLecturas.agregarPendiente;
export const listarPendientes = colaLecturas.listarPendientes;
export const eliminarPendiente = colaLecturas.eliminarPendiente;
export const sincronizarTodo = colaLecturas.sincronizarTodo;
export const useColaPendientes = colaLecturas.useColaPendientes;

export const agregarPendienteNovedad = colaNovedades.agregarPendiente;
export const listarPendientesNovedad = colaNovedades.listarPendientes;
export const eliminarPendienteNovedad = colaNovedades.eliminarPendiente;
export const sincronizarTodoNovedades = colaNovedades.sincronizarTodo;
export const useColaPendientesNovedad = colaNovedades.useColaPendientes;
