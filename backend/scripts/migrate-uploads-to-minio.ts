// Migración única: copia todo lo que había en el volumen viejo de uploads (disco local,
// montado de solo lectura en /app/uploads_legacy) hacia MinIO, conservando la misma
// estructura de carpetas (actas/, lecturas/, novedades/, usuarios/) para que las rutas ya
// guardadas en la base de datos (ej. "/uploads/actas/xxx.jpg") sigan apuntando al lugar correcto.
//
// Uso: docker exec appmedidores-backend-1 npm run migrate-uploads-to-minio
import fs from "node:fs";
import path from "node:path";
import { minioClient, BUCKET, asegurarBucket } from "../src/lib/storage.js";

const raiz = path.join(process.cwd(), "uploads_legacy");

function tipoContenido(archivo: string): string {
  const ext = path.extname(archivo).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function main() {
  if (!fs.existsSync(raiz)) {
    console.log("No hay carpeta uploads_legacy montada (nada que migrar). Listo.");
    return;
  }

  await asegurarBucket();

  let copiados = 0;
  let saltados = 0;

  const carpetas = fs.readdirSync(raiz, { withFileTypes: true }).filter((e) => e.isDirectory());
  for (const carpeta of carpetas) {
    const dirCompleto = path.join(raiz, carpeta.name);
    const archivos = fs.readdirSync(dirCompleto, { withFileTypes: true }).filter((e) => e.isFile());

    for (const archivo of archivos) {
      const nombreObjeto = `${carpeta.name}/${archivo.name}`;
      const yaExiste = await minioClient
        .statObject(BUCKET, nombreObjeto)
        .then(() => true)
        .catch(() => false);
      if (yaExiste) {
        saltados++;
        continue;
      }

      const rutaCompleta = path.join(dirCompleto, archivo.name);
      const buffer = fs.readFileSync(rutaCompleta);
      await minioClient.putObject(BUCKET, nombreObjeto, buffer, buffer.length, {
        "Content-Type": tipoContenido(archivo.name),
      });
      copiados++;
      if (copiados % 100 === 0) console.log(`  ...${copiados} archivos copiados`);
    }
  }

  console.log(`Listo: ${copiados} archivos copiados a MinIO, ${saltados} ya existían y se saltaron.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
