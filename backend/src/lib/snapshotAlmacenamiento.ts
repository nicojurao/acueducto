import { prisma } from "./prisma.js";
import { minioClient, BUCKET, asegurarBucket } from "./storage.js";

export async function tamanoBdBytes(): Promise<bigint> {
  const [{ size }] = await prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
  return size;
}

// Suma el tamaño de TODOS los objetos del bucket (fotos de lecturas, actas, novedades, usuarios,
// etc). MinIO no expone un "tamaño total" directo por API sencilla, así que se recorre el
// listado completo (rápido: solo trae metadatos, no el contenido de cada archivo).
export async function tamanoMinioBytes(): Promise<bigint> {
  await asegurarBucket();
  return new Promise((resolve, reject) => {
    let total = 0n;
    const stream = minioClient.listObjectsV2(BUCKET, "", true);
    stream.on("data", (obj) => {
      if (obj.size) total += BigInt(obj.size);
    });
    stream.on("end", () => resolve(total));
    stream.on("error", reject);
  });
}

function inicioDeHoyUTC(): Date {
  const ahora = new Date();
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
}

// Guarda (o reemplaza) la foto de tamaño de HOY. Idempotente: se puede llamar varias veces el
// mismo día sin generar filas duplicadas (fecha es única), así el cron no tiene que preocuparse
// por ya haber corrido antes en el día.
export async function registrarSnapshotDeHoy(): Promise<void> {
  const [bd, minio] = await Promise.all([tamanoBdBytes(), tamanoMinioBytes()]);
  const fecha = inicioDeHoyUTC();
  await prisma.snapshotAlmacenamiento.upsert({
    where: { fecha },
    create: { fecha, tamanoBdBytes: bd, tamanoMinioBytes: minio },
    update: { tamanoBdBytes: bd, tamanoMinioBytes: minio },
  });
}

const UN_DIA_MS = 24 * 60 * 60 * 1000;

// Cron casero: no depende de configurar nada fuera de la app (a diferencia de los backups, que
// sí usan el Task Scheduler de Windows). Corre una vez al arrancar el backend y luego cada 24h.
export function iniciarCronSnapshotAlmacenamiento(logger: { error: (obj: unknown, msg: string) => void }) {
  registrarSnapshotDeHoy().catch((err) => logger.error({ err }, "Fallo al registrar snapshot de almacenamiento"));
  setInterval(() => {
    registrarSnapshotDeHoy().catch((err) => logger.error({ err }, "Fallo al registrar snapshot de almacenamiento"));
  }, UN_DIA_MS);
}
