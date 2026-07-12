import { Client } from "minio";
import path from "node:path";

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT ?? "minio",
  port: Number(process.env.MINIO_PORT ?? 9000),
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER!,
  secretKey: process.env.MINIO_ROOT_PASSWORD!,
});

const BUCKET = process.env.MINIO_BUCKET ?? "medidores-uploads";

let bucketListo: Promise<void> | null = null;
async function asegurarBucket(): Promise<void> {
  if (!bucketListo) {
    bucketListo = (async () => {
      const existe = await minioClient.bucketExists(BUCKET).catch(() => false);
      if (!existe) await minioClient.makeBucket(BUCKET);
    })();
  }
  return bucketListo;
}

function nombreUnico(nombreOriginal: string): string {
  const ext = path.extname(nombreOriginal);
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
}

function objectName(rutaRelativa: string): string {
  return rutaRelativa.replace(/^\/uploads\//, "");
}

// Sube un archivo a MinIO dentro de "carpeta" (ej. "actas", "lecturas", "usuarios") y devuelve
// la misma forma de ruta que antes se guardaba para archivos en disco (/uploads/carpeta/nombre),
// para no tener que tocar cómo el resto de la app arma las URLs de las fotos.
export async function guardarArchivo(
  carpeta: string,
  buffer: Buffer,
  nombreOriginal: string,
  mimetype: string
): Promise<string> {
  await asegurarBucket();
  const nombre = nombreUnico(nombreOriginal);
  const nombreObjeto = `${carpeta}/${nombre}`;
  await minioClient.putObject(BUCKET, nombreObjeto, buffer, buffer.length, { "Content-Type": mimetype });
  return `/uploads/${nombreObjeto}`;
}

export async function borrarArchivo(rutaRelativa: string): Promise<void> {
  await minioClient.removeObject(BUCKET, objectName(rutaRelativa)).catch(() => {});
}

// Para el proxy GET /uploads/*: devuelve el stream de lectura + metadatos (tamaño, content-type).
export async function leerArchivo(rutaRelativa: string) {
  const nombreObjeto = objectName(rutaRelativa);
  const [stream, stat] = await Promise.all([
    minioClient.getObject(BUCKET, nombreObjeto),
    minioClient.statObject(BUCKET, nombreObjeto),
  ]);
  return { stream, size: stat.size, contentType: stat.metaData?.["content-type"] as string | undefined };
}

// Para casos como incrustar una foto en el PDF de un acta (pdfkit necesita el buffer completo).
export async function leerBuffer(rutaRelativa: string): Promise<Buffer> {
  const stream = await minioClient.getObject(BUCKET, objectName(rutaRelativa));
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export { minioClient, BUCKET, asegurarBucket };
