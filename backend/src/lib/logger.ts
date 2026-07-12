import pino from "pino";

// Nivel configurable por env var (por defecto "info"); en producción sale como JSON por línea
// (fácil de grepear/enviar a un colector), en dev con pino-pretty si está instalado no hace
// falta acá — se puede canalizar con `| npx pino-pretty` al leer los logs del contenedor.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  timestamp: pino.stdTimeFunctions.isoTime,
});
