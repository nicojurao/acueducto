import multer from "multer";

// Documentos escaneados (actas de calibración, actas de instalación firmadas): PDF o imagen, con
// el mismo tope que valida el navegador antes de empezar a subir (ver frontend/src/lib/
// validarDocumento.ts — si se cambia uno, cambiar el otro).
export const LIMITE_DOCUMENTO_BYTES = 10 * 1024 * 1024;

// Error "esperable" del usuario (archivo del tipo equivocado, etc.): se responde tal cual con su
// status y mensaje en vez de caer en el 500 genérico de "Error interno del servidor".
export class ErrorSubida extends Error {
  status = 400;
}

const TIPOS_DOCUMENTO = /^(application\/pdf|image\/.+)$/i;

// A diferencia del filtro "solo imágenes" de las fotos (que descarta en silencio lo que no sea
// imagen y deja al usuario sin saber por qué no se guardó nada), éste rechaza con un mensaje.
export const filtroDocumento: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (TIPOS_DOCUMENTO.test(file.mimetype)) return cb(null, true);
  cb(new ErrorSubida("Solo se aceptan archivos PDF o imágenes (JPG, PNG)."));
};

// Traduce los errores de subida (multer y los propios) a una respuesta clara. Devuelve null si el
// error no es de subida — el llamador sigue con su manejo normal (500 genérico).
export function respuestaErrorSubida(err: unknown): { status: number; mensaje: string } | null {
  if (err instanceof ErrorSubida) return { status: err.status, mensaje: err.message };
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return {
          status: 413,
          mensaje: "El archivo es demasiado grande. Reduce su tamaño (por ejemplo, escanéalo a menor resolución) e inténtalo de nuevo.",
        };
      case "LIMIT_FILE_COUNT":
      case "LIMIT_UNEXPECTED_FILE":
        return { status: 400, mensaje: "Se enviaron más archivos de los permitidos." };
      default:
        return { status: 400, mensaje: "No se pudo procesar el archivo enviado." };
    }
  }
  return null;
}
