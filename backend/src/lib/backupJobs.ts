import { randomUUID } from "node:crypto";
import { stat, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

type Fase = "comprimiendo" | "listo" | "error";

interface Job {
  fase: Fase;
  bytesProcesados: number;
  bytesTotalAprox: number;
  rutaArchivo: string;
  nombreDescarga: string;
  contentType: string;
  tamanoFinal?: number;
  error?: string;
  creadoEn: number;
}

const jobs = new Map<string, Job>();

// Un admin que arranca un backup y nunca vuelve a descargarlo (cerró la pestaña, se fue) no debe
// dejar el .zip/.sql.gz tirado en disco para siempre — 20 minutos es de sobra para notar que ya
// está listo y descargarlo.
const TTL_MS = 20 * 60 * 1000;

function limpiarJobsViejos() {
  const ahora = Date.now();
  for (const [id, job] of jobs) {
    if (ahora - job.creadoEn > TTL_MS) {
      unlink(job.rutaArchivo).catch(() => {});
      jobs.delete(id);
    }
  }
}
setInterval(limpiarJobsViejos, 5 * 60 * 1000).unref();

export function crearJob(
  bytesTotalAprox: number,
  nombreDescarga: string,
  contentType: string
): { id: string; rutaArchivo: string } {
  const id = randomUUID();
  const rutaArchivo = path.join(os.tmpdir(), `fluvi-backup-${id}`);
  jobs.set(id, {
    fase: "comprimiendo",
    bytesProcesados: 0,
    bytesTotalAprox,
    rutaArchivo,
    nombreDescarga,
    contentType,
    creadoEn: Date.now(),
  });
  return { id, rutaArchivo };
}

export function actualizarProgreso(id: string, bytesProcesados: number) {
  const job = jobs.get(id);
  if (job) job.bytesProcesados = bytesProcesados;
}

export async function marcarListo(id: string) {
  const job = jobs.get(id);
  if (!job) return;
  const info = await stat(job.rutaArchivo);
  job.tamanoFinal = info.size;
  job.fase = "listo";
}

export function marcarError(id: string, error: string) {
  const job = jobs.get(id);
  if (job) {
    job.fase = "error";
    job.error = error;
  }
}

export function obtenerJob(id: string): Job | undefined {
  return jobs.get(id);
}

export async function eliminarJob(id: string) {
  const job = jobs.get(id);
  if (job) {
    await unlink(job.rutaArchivo).catch(() => {});
    jobs.delete(id);
  }
}
