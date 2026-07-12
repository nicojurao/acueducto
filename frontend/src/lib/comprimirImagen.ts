// Redimensiona/recomprime una foto en el navegador antes de subirla, para que las fotos de
// cámara (a veces varios MB en 4K sin comprimir) no infl en el almacenamiento ni tarden en
// subir en conexiones lentas de campo. 2000px de lado más largo es de sobra para leer un
// medidor o revisar una acta — no se nota pérdida de calidad a simple vista, pero el archivo
// baja drásticamente de tamaño.
const MAX_LADO_DEFECTO = 2000;
const CALIDAD_DEFECTO = 0.85;
// Si ya es chica, no vale la pena la vuelta (recomprimir un JPEG pequeño puede hasta agrandarlo).
const NO_COMPRIMIR_SI_MENOR_A = 700 * 1024;

export async function comprimirImagen(
  entrada: Blob,
  { maxLado = MAX_LADO_DEFECTO, calidad = CALIDAD_DEFECTO }: { maxLado?: number; calidad?: number } = {}
): Promise<Blob> {
  if (!entrada.type.startsWith("image/") || entrada.type === "image/gif") return entrada;

  try {
    const bitmap = await createImageBitmap(entrada);
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
    if (escala === 1 && entrada.size < NO_COMPRIMIR_SI_MENOR_A) {
      bitmap.close();
      return entrada;
    }

    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return entrada;
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    const comprimido = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", calidad));
    // Por si acaso la "compresión" salió más pesada que el original (pasa con imágenes ya
    // muy comprimidas), se usa lo que sea más chico.
    return comprimido && comprimido.size < entrada.size ? comprimido : entrada;
  } catch {
    return entrada;
  }
}

export async function comprimirFoto(
  archivo: File,
  opciones?: { maxLado?: number; calidad?: number }
): Promise<File> {
  const blob = await comprimirImagen(archivo, opciones);
  if (blob === archivo) return archivo;
  const nombre = archivo.name.replace(/\.\w+$/, "") + ".jpg";
  return new File([blob], nombre, { type: "image/jpeg", lastModified: archivo.lastModified });
}

export async function comprimirFotos(
  archivos: File[],
  opciones?: { maxLado?: number; calidad?: number }
): Promise<File[]> {
  return Promise.all(archivos.map((f) => comprimirFoto(f, opciones)));
}
