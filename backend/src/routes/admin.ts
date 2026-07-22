import { Router } from "express";
import { spawn } from "node:child_process";
import archiver from "archiver";
import { prisma } from "../lib/prisma.js";
import { tamanoBdBytes, tamanoMinioBytes } from "../lib/snapshotAlmacenamiento.js";
import { minioClient, BUCKET, asegurarBucket } from "../lib/storage.js";

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

// Genera el dump de Postgres al vuelo (pg_dump) y lo manda comprimido (gzip) como descarga
// directa — sin escribir nada a disco del servidor, el stream va derecho a la respuesta HTTP.
adminRouter.get("/backup/postgres", async (req, res) => {
  const url = new URL(process.env.DATABASE_URL!);
  const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Content-Disposition", `attachment; filename="medidores_${fecha}.sql.gz"`);

  const { createGzip } = await import("node:zlib");
  const pgDump = spawn(
    "pg_dump",
    ["--host", url.hostname, "--port", url.port || "5432", "--username", url.username, url.pathname.slice(1)],
    { env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) } }
  );

  let stderr = "";
  pgDump.stderr.on("data", (chunk) => (stderr += chunk));
  pgDump.on("error", () => {
    if (!res.headersSent) res.status(500).json({ error: "No se pudo iniciar pg_dump" });
  });
  pgDump.on("exit", (code) => {
    if (code !== 0) {
      req.log?.error({ code, stderr }, "pg_dump terminó con error");
    }
  });

  const gzip = createGzip();
  pgDump.stdout.pipe(gzip).pipe(res);
});

// Zippea TODOS los objetos del bucket de MinIO y lo manda como descarga directa. Cada archivo
// se trae uno a la vez desde MinIO y se agrega al zip en streaming, sin acumular todo en memoria.
adminRouter.get("/backup/minio", async (req, res) => {
  await asegurarBucket();
  const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="minio_${fecha}.zip"`);

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("error", (err) => {
    req.log?.error({ err }, "Error generando el zip de MinIO");
    if (!res.headersSent) res.status(500).end();
  });
  archive.pipe(res);

  const objetos: string[] = await new Promise((resolve, reject) => {
    const nombres: string[] = [];
    const stream = minioClient.listObjectsV2(BUCKET, "", true);
    stream.on("data", (obj) => obj.name && nombres.push(obj.name));
    stream.on("end", () => resolve(nombres));
    stream.on("error", reject);
  });

  for (const nombre of objetos) {
    const stream = await minioClient.getObject(BUCKET, nombre);
    archive.append(stream, { name: nombre });
  }

  await archive.finalize();
});
