import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Mismo patrón de "job" que ya usan los backups (ver lib/backupJobs.ts): el PDF de un periodo
// completo se genera contra un archivo temporal en disco, no en memoria ni directo a la
// respuesta HTTP — con miles de facturas (~3874 en un periodo típico) esto tarda varios minutos
// (medido 2026-09-13: ~12 min, ~250MB), y mantener eso en una sola conexión abierta es frágil
// (se corta si se cierra la pestaña o algún proxy intermedio la tumba por inactividad) y no deja
// mostrar progreso real mientras se genera.

type Fase = "generando" | "listo" | "error";

interface Job {
  fase: Fase;
  bytesProcesados: number;
  bytesTotalAprox: number;
  rutaArchivo: string;
  nombreDescarga: string;
  tamanoFinal?: number;
  error?: string;
  creadoEn: number;
}

const jobs = new Map<string, Job>();

// Igual que los backups: de sobra para notar que ya está listo y descargarlo antes de que se
// limpie solo el temporal.
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

export function crearJobPdfLote(bytesTotalAprox: number, nombreDescarga: string): { id: string; rutaArchivo: string } {
  const id = randomUUID();
  const rutaArchivo = path.join(os.tmpdir(), `fluvi-pdf-lote-${id}.pdf`);
  jobs.set(id, { fase: "generando", bytesProcesados: 0, bytesTotalAprox, rutaArchivo, nombreDescarga, creadoEn: Date.now() });
  return { id, rutaArchivo };
}

export function actualizarProgresoPdfLote(id: string, bytesProcesados: number) {
  const job = jobs.get(id);
  if (job) job.bytesProcesados = bytesProcesados;
}

export function marcarListoPdfLote(id: string, tamanoFinal: number) {
  const job = jobs.get(id);
  if (!job) return;
  job.tamanoFinal = tamanoFinal;
  job.fase = "listo";
}

export function marcarErrorPdfLote(id: string, error: string) {
  const job = jobs.get(id);
  if (job) {
    job.fase = "error";
    job.error = error;
  }
}

export function obtenerJobPdfLote(id: string): Job | undefined {
  return jobs.get(id);
}
