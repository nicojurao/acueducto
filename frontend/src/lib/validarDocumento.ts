// Revisa un documento escaneado (acta de calibración, acta de instalación firmada) ANTES de
// empezar a subirlo: tipo, tamaño y, si es PDF, que sea un PDF de verdad y no traiga decenas de
// páginas. Sin esto, un PDF equivocado de 48 MB se subía completo (minutos en conexión lenta) solo
// para que el servidor lo rechazara al final. El tope de tamaño es el mismo del backend
// (LIMITE_DOCUMENTO_BYTES en backend/src/lib/uploads.ts) — si se cambia uno, cambiar el otro.
export const MAX_MB_DOCUMENTO = 10;
export const MAX_PAGINAS_PDF = 10;
const MAX_BYTES = MAX_MB_DOCUMENTO * 1024 * 1024;

export type ResultadoValidacion = { ok: true; paginas: number | null } | { ok: false; mensaje: string };

export const formatoMB = (bytes: number) =>
  (bytes / 1024 / 1024).toLocaleString("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

// Cuenta las páginas leyendo los objetos "/Type /Page" del PDF (sin librería). Es un estimado: en
// PDFs con objetos comprimidos (PDF 1.5+, "object streams") esos marcadores no se ven en claro y
// devuelve null — en ese caso solo se aplican los otros chequeos (el tope de tamaño igual protege).
export function contarPaginasPdf(bytes: Uint8Array): number | null {
  const texto = new TextDecoder("latin1").decode(bytes);
  const coincidencias = texto.match(/\/Type\s*\/Page(?![A-Za-z])/g);
  return coincidencias && coincidencias.length > 0 ? coincidencias.length : null;
}

const fallo = (mensaje: string): ResultadoValidacion => ({ ok: false, mensaje });

export async function validarDocumento(archivo: File): Promise<ResultadoValidacion> {
  if (archivo.size === 0) return fallo(`"${archivo.name}" está vacío (0 bytes). Vuelve a escanearlo o elige otro archivo.`);

  const esPdf = archivo.type === "application/pdf" || /\.pdf$/i.test(archivo.name);
  const esImagen = archivo.type.startsWith("image/");
  if (!esPdf && !esImagen) {
    return fallo(`"${archivo.name}" no es un PDF ni una imagen. Sube el escaneo del documento en PDF, JPG o PNG.`);
  }

  if (archivo.size > MAX_BYTES) {
    return fallo(
      `"${archivo.name}" pesa ${formatoMB(archivo.size)} MB y el máximo es ${MAX_MB_DOCUMENTO} MB. ` +
        (esPdf
          ? "Escanéalo a menor resolución (150 dpi) o en blanco y negro, o sube solo las páginas del acta."
          : "Toma la foto con menos resolución.")
    );
  }

  if (!esPdf) return { ok: true, paginas: null };

  // Solo se lee el contenido si ya pasó el tope de tamaño (≤ 10 MB), nunca un archivo enorme.
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  // La especificación permite algo de basura antes de "%PDF-", pero siempre dentro del primer KB.
  if (!new TextDecoder("latin1").decode(bytes.subarray(0, 1024)).includes("%PDF-")) {
    return fallo(`"${archivo.name}" no es un PDF válido (está dañado o tiene la extensión cambiada).`);
  }

  const paginas = contarPaginasPdf(bytes);
  if (paginas !== null && paginas > MAX_PAGINAS_PDF) {
    return fallo(
      `El PDF "${archivo.name}" tiene ${paginas} páginas. Un acta normalmente tiene entre 1 y 3: revisa que sea el archivo ` +
        `correcto (el máximo permitido es ${MAX_PAGINAS_PDF} páginas).`
    );
  }
  return { ok: true, paginas };
}
