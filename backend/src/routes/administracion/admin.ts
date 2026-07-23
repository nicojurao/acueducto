import { Router } from "express";
import { spawn } from "node:child_process";
import { createWriteStream, createReadStream } from "node:fs";
import archiver from "archiver";
import { prisma } from "../../lib/prisma.js";
import { tamanoBdBytes, tamanoMinioBytes } from "../../lib/snapshotAlmacenamiento.js";
import { minioClient, BUCKET, asegurarBucket } from "../../lib/storage.js";
import { crearJob, actualizarProgreso, marcarListo, marcarError, obtenerJob, eliminarJob } from "../../lib/backupJobs.js";
import { fechaHoraArchivoColombia } from "../../lib/fechaColombia.js";

export const adminRouter = Router();

// Tamaño actual de BD/MinIO + el histórico diario (ver lib/snapshotAlmacenamiento.ts) para
// graficar la tendencia de crecimiento en el Panel de administración.
adminRouter.get("/almacenamiento", async (_req, res) => {
  const [bd, minio, historial] = await Promise.all([
    tamanoBdBytes(),
    tamanoMinioBytes(),
    prisma.snapshotAlmacenamiento.findMany({ orderBy: { fecha: "asc" } }),
  ]);
  res.json({
    actual: { tamanoBdBytes: bd.toString(), tamanoMinioBytes: minio.toString() },
    historial: historial.map((h) => ({
      fecha: h.fecha.toISOString().slice(0, 10),
      tamanoBdBytes: h.tamanoBdBytes.toString(),
      tamanoMinioBytes: h.tamanoMinioBytes.toString(),
    })),
  });
});

// Los backups van en 2 pasos, en vez de un único GET que streamea al vuelo: así el archivo
// termina de comprimirse COMPLETO en un temporal en disco antes de servirse, y se conoce su
// tamaño EXACTO para mandar un Content-Length real (barra de progreso 0-100% de verdad en la
// descarga, no un estimado). El costo es que la descarga como tal no arranca hasta que termina
// de comprimir — se cubre mostrando el progreso de la fase de compresión aparte (aproximado,
// contra el tamaño sin comprimir, que sí se conoce de antemano).
//
// 1) POST .../iniciar  → arranca la compresión en segundo plano, responde con un jobId al toque.
// 2) GET  .../:id/estado    → para hacer polling del progreso (fase, bytes procesados, etc).
// 3) GET  .../:id/descargar → cuando fase="listo", sirve el archivo final con Content-Length real.

adminRouter.post("/backup/postgres/iniciar", async (req, res) => {
  const tamanoAprox = Number(await tamanoBdBytes());
  const fecha = fechaHoraArchivoColombia();
  const { id, rutaArchivo } = crearJob(tamanoAprox, `medidores_${fecha}.sql.gz`, "application/gzip");
  res.status(202).json({ id });

  const url = new URL(process.env.DATABASE_URL!);
  const { createGzip } = await import("node:zlib");
  const pgDump = spawn(
    "pg_dump",
    ["--host", url.hostname, "--port", url.port || "5432", "--username", url.username, url.pathname.slice(1)],
    { env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) } }
  );

  let stderr = "";
  let bytesLeidos = 0;
  let codigoSalida: number | null = null;
  pgDump.stdout.on("data", (chunk: Buffer) => {
    bytesLeidos += chunk.length;
    actualizarProgreso(id, bytesLeidos);
  });
  pgDump.stderr.on("data", (chunk) => (stderr += chunk));
  pgDump.on("exit", (code) => {
    codigoSalida = code;
    if (code !== 0) {
      marcarError(id, "pg_dump terminó con error");
      req.log?.error({ code, stderr }, "pg_dump terminó con error");
    }
  });

  const gzip = createGzip();
  const destino = createWriteStream(rutaArchivo);

  pgDump.on("error", () => marcarError(id, "No se pudo iniciar pg_dump"));
  destino.on("error", (err) => marcarError(id, err.message));
  destino.on("finish", async () => {
    if (codigoSalida !== null && codigoSalida !== 0) return; // ya se marcó error arriba
    await marcarListo(id).catch((err) => marcarError(id, err.message));
  });

  pgDump.stdout.pipe(gzip).pipe(destino);
});

adminRouter.post("/backup/minio/iniciar", async (_req, res) => {
  await asegurarBucket();
  const fecha = fechaHoraArchivoColombia();

  // El listado ya trae el tamaño SIN comprimir de cada objeto: sirve como estimado del total
  // para la fase de compresión (la mayoría ya son binarios como jpg/PDF, casi no comprimen más).
  const objetos: { nombre: string; size: number }[] = await new Promise((resolve, reject) => {
    const items: { nombre: string; size: number }[] = [];
    const stream = minioClient.listObjectsV2(BUCKET, "", true);
    stream.on("data", (obj) => obj.name && items.push({ nombre: obj.name, size: obj.size ?? 0 }));
    stream.on("end", () => resolve(items));
    stream.on("error", reject);
  });
  const tamanoAprox = objetos.reduce((acc, o) => acc + o.size, 0);

  const { id, rutaArchivo } = crearJob(tamanoAprox, `minio_${fecha}.zip`, "application/zip");
  res.status(202).json({ id });

  const archive = archiver("zip", { zlib: { level: 6 } });
  const destino = createWriteStream(rutaArchivo);
  let bytesLeidos = 0;

  archive.on("error", (err) => marcarError(id, err.message));
  destino.on("error", (err) => marcarError(id, err.message));
  destino.on("finish", async () => {
    await marcarListo(id).catch((err) => marcarError(id, err.message));
  });
  archive.pipe(destino);

  for (const { nombre } of objetos) {
    const stream = await minioClient.getObject(BUCKET, nombre);
    stream.on("data", (chunk: Buffer) => {
      bytesLeidos += chunk.length;
      actualizarProgreso(id, bytesLeidos);
    });
    archive.append(stream, { name: nombre });
  }

  await archive.finalize();
});

adminRouter.get("/backup/:id/estado", (req, res) => {
  const job = obtenerJob(req.params.id);
  if (!job) return res.status(404).json({ error: "No encontrado (puede que ya haya expirado)" });
  res.json({
    fase: job.fase,
    bytesProcesados: job.bytesProcesados,
    bytesTotalAprox: job.bytesTotalAprox,
    tamanoFinal: job.tamanoFinal ?? null,
    error: job.error ?? null,
  });
});

adminRouter.get("/backup/:id/descargar", async (req, res) => {
  const job = obtenerJob(req.params.id);
  if (!job) return res.status(404).json({ error: "No encontrado (puede que ya haya expirado)" });
  if (job.fase !== "listo") return res.status(409).json({ error: "El backup todavía se está generando" });

  res.setHeader("Content-Type", job.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${job.nombreDescarga}"`);
  res.setHeader("Content-Length", String(job.tamanoFinal));

  const lector = createReadStream(job.rutaArchivo);
  lector.on("error", () => {
    if (!res.headersSent) res.status(500).json({ error: "No se pudo leer el backup generado" });
  });
  lector.pipe(res);
  res.on("finish", () => {
    eliminarJob(req.params.id).catch(() => {});
  });
});
