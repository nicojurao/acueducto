type Fase = "generando" | "listo" | "error";

interface Job {
  fase: Fase;
  periodo: string;
  procesados: number;
  total: number;
  creadas: number;
  omitidas: number;
  omitidos: number;
  totalFacturado: number;
  error?: string;
  creadoEn: number;
}

const jobs = new Map<string, Job>();

// Un job de generación es liviano (solo números en memoria, sin archivo en disco): 10 minutos
// alcanza de sobra para que el admin vea el resultado antes de que se limpie solo.
const TTL_MS = 10 * 60 * 1000;

function limpiarJobsViejos() {
  const ahora = Date.now();
  for (const [id, job] of jobs) {
    if (ahora - job.creadoEn > TTL_MS) jobs.delete(id);
  }
}
setInterval(limpiarJobsViejos, 5 * 60 * 1000).unref();

export function crearJobFacturacion(id: string, periodo: string, total: number) {
  jobs.set(id, {
    fase: "generando",
    periodo,
    procesados: 0,
    total,
    creadas: 0,
    omitidas: 0,
    omitidos: 0,
    totalFacturado: 0,
    creadoEn: Date.now(),
  });
}

export function actualizarProgresoFacturacion(id: string, procesados: number) {
  const job = jobs.get(id);
  if (job) job.procesados = procesados;
}

export function marcarListoFacturacion(
  id: string,
  resultado: { creadas: number; omitidas: number; omitidos: number; totalFacturado: number }
) {
  const job = jobs.get(id);
  if (!job) return;
  job.fase = "listo";
  job.creadas = resultado.creadas;
  job.omitidas = resultado.omitidas;
  job.omitidos = resultado.omitidos;
  job.totalFacturado = resultado.totalFacturado;
}

export function marcarErrorFacturacion(id: string, error: string) {
  const job = jobs.get(id);
  if (job) {
    job.fase = "error";
    job.error = error;
  }
}

export function obtenerJobFacturacion(id: string): Job | undefined {
  return jobs.get(id);
}
