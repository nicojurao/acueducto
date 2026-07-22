// Reparación puntual: las fotos de inventario cargadas por script desde el Excel institucional
// (ver memoria "Inventario PPE migración 2026-07") se subieron tal cual, sin la compresión que
// sí aplica el navegador para fotos tomadas desde la app (ver frontend/src/lib/comprimirImagen.ts:
// máximo 2000px de lado, calidad ~85%). Este script recomprime esas fotos ya existentes en MinIO
// con el mismo criterio, sobrescribiendo el mismo objeto (mismo nombre/ruta, no cambia fotoUrl
// en la BD) para no dejar fotos de varios MB pesando el bucket sin necesidad.
import sharp from "sharp";
import { minioClient, BUCKET, asegurarBucket } from "../src/lib/storage.js";

const MAX_LADO = 2000;
const CALIDAD = 85;
const NO_COMPRIMIR_SI_MENOR_A = 700 * 1024;

async function main() {
  await asegurarBucket();

  const nombres: string[] = await new Promise((resolve, reject) => {
    const lista: string[] = [];
    const stream = minioClient.listObjectsV2(BUCKET, "inventario/", true);
    stream.on("data", (obj) => obj.name && lista.push(obj.name));
    stream.on("end", () => resolve(lista));
    stream.on("error", reject);
  });

  console.log(`${nombres.length} fotos de inventario encontradas en MinIO.`);

  let comprimidas = 0;
  let saltadas = 0;
  let bytesAntes = 0;
  let bytesDespues = 0;

  for (const nombre of nombres) {
    const stat = await minioClient.statObject(BUCKET, nombre);
    const original = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      minioClient
        .getObject(BUCKET, nombre)
        .then((stream) => {
          stream.on("data", (c) => chunks.push(c));
          stream.on("end", () => resolve(Buffer.concat(chunks)));
          stream.on("error", reject);
        })
        .catch(reject);
    });

    let imagen: sharp.Sharp;
    let metadata: sharp.Metadata;
    try {
      imagen = sharp(original);
      metadata = await imagen.metadata();
    } catch {
      console.log(`  Omitida (no es una imagen procesable): ${nombre}`);
      saltadas++;
      continue;
    }

    const ladoMayor = Math.max(metadata.width ?? 0, metadata.height ?? 0);
    if (ladoMayor <= MAX_LADO && original.length < NO_COMPRIMIR_SI_MENOR_A) {
      saltadas++;
      continue;
    }

    const comprimido = await imagen
      .resize({ width: MAX_LADO, height: MAX_LADO, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: CALIDAD })
      .toBuffer();

    if (comprimido.length >= original.length) {
      saltadas++;
      continue;
    }

    await minioClient.putObject(BUCKET, nombre, comprimido, comprimido.length, {
      "Content-Type": "image/jpeg",
    });
    bytesAntes += original.length;
    bytesDespues += comprimido.length;
    comprimidas++;
    console.log(
      `  ${nombre}: ${(original.length / 1024).toFixed(0)} KB -> ${(comprimido.length / 1024).toFixed(0)} KB (era ${stat.size} B declarados)`
    );
  }

  console.log(
    `\nListo: ${comprimidas} comprimidas, ${saltadas} sin cambios. Ahorro: ${((bytesAntes - bytesDespues) / 1024 / 1024).toFixed(1)} MB.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
