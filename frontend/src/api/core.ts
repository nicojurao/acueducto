// En vacío usa el mismo origen (Vite hace de proxy hacia el backend, ver vite.config.ts),
// así funciona tanto en localhost como a través del túnel de Cloudflare sin exponer otro puerto.
export const API_URL = import.meta.env.VITE_API_URL ?? "";

const TOKEN_KEY = "medidores_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Token aparte (corta duración, 20 min) solo para /uploads/*, para NO poner el token de
// sesión de 30 días en una URL (queda en el historial del navegador, en logs de Cloudflare,
// etc.). Se guarda solo en memoria (no localStorage) y se renueva desde AuthContext mientras
// haya sesión — ver refrescarMediaToken().
let mediaToken: string | null = null;

export async function refrescarMediaToken(): Promise<void> {
  if (!getToken()) {
    mediaToken = null;
    return;
  }
  try {
    const { token } = await request<{ token: string; expiraEnSegundos: number }>("/api/auth/media-token");
    mediaToken = token;
  } catch {
    // si falla (ej. sin conexión), se sigue usando el que había; se reintenta en el próximo ciclo
  }
}

export function limpiarMediaToken(): void {
  mediaToken = null;
}

// Para mostrar fotos protegidas en <img src> o <a href>: esas etiquetas no pueden mandar el
// header Authorization, así que el token va como query string (?token=...) — pero es el token
// de fotos de corta duración, no el de sesión (ver requireAuthQuery en el backend). Usar
// SIEMPRE esta función para armar la URL de una foto, nunca `${API_URL}${ruta}` a mano.
export function urlFoto(ruta: string | null | undefined): string {
  if (!ruta) return "";
  const token = mediaToken ?? getToken();
  return `${API_URL}${ruta}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

function handleUnauthorized() {
  setToken(null);
  if (window.location.pathname !== "/login") window.location.href = "/login";
}

// El backend manda errores como JSON ({ "error": "mensaje" }); si se logra parsear se usa ese
// texto tal cual (sin prefijos técnicos), y si no, se cae al texto crudo de la respuesta.
async function mensajeError(res: Response): Promise<string> {
  const texto = await res.text();
  try {
    const cuerpo = JSON.parse(texto);
    if (cuerpo && typeof cuerpo.error === "string") return cuerpo.error;
  } catch {
    // no era JSON, se usa el texto crudo
  }
  return texto || `Error ${res.status}`;
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
    ...options,
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("No autenticado");
  }
  if (!res.ok) throw new Error(await mensajeError(res));
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Para los endpoints que suben archivos (multipart/form-data): no lleva Content-Type
// manual (el navegador lo arma con el boundary), pero sí necesita el token.
export async function requestMultipart<T>(
  path: string,
  formData: FormData,
  method: "POST" | "PUT" = "POST",
  timeoutMs?: number
): Promise<T> {
  const controller = timeoutMs ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: authHeaders(),
      body: formData,
      signal: controller?.signal,
    });
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("No autenticado");
    }
    if (!res.ok) throw new Error(await mensajeError(res));
    if (res.status === 204) return undefined as T;
    return res.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Para archivos protegidos (xlsx/pdf generados por el backend): un <a href> normal no manda
// el token de sesión, así que el navegador navega directo al endpoint y este responde 401.
// Se pide con fetch (que sí lleva el header), y el archivo resultante se "descarga" armando
// un link temporal a partir del blob de la respuesta.
//
// onProgress: los backups (zip de MinIO, dump de Postgres) se generan al vuelo y se mandan sin
// Content-Length (el tamaño final no se conoce de antemano), así que no hay % real posible —
// pero SÍ hay bytes reales ya recibidos. Leer con response.body.getReader() en vez de
// response.blob() deja reportar esos bytes en cuanto llegan, en lugar de esperar a que el
// archivo completo esté en memoria (que es lo que hacía ver la descarga "congelada" y luego
// aparecer de golpe ya completa).
export async function descargarArchivo(
  path: string,
  nombrePorDefecto: string,
  abrirEnPestana = false,
  onProgress?: (bytesRecibidos: number, bytesTotal: number | null) => void
) {
  const res = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("No autenticado");
  }
  if (!res.ok) throw new Error(await mensajeError(res));

  const disposicion = res.headers.get("Content-Disposition");
  const nombre = disposicion?.match(/filename="?([^"]+)"?/)?.[1] ?? nombrePorDefecto;

  let blob: Blob;
  if (onProgress && res.body) {
    // Content-Length real si el backend lo manda (no es el caso de los backups, que se generan
    // al vuelo); si no, X-Total-Bytes-Aprox es un estimado (ver routes/admin.ts) — sirve para
    // una barra de progreso aproximada, aunque no llegue a exactamente 100% al terminar.
    const totalHeader = res.headers.get("Content-Length") ?? res.headers.get("X-Total-Bytes-Aprox");
    const total = totalHeader ? Number(totalHeader) : null;
    const reader = res.body.getReader();
    const partes: Uint8Array[] = [];
    let recibidos = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      partes.push(value);
      recibidos += value.length;
      onProgress(recibidos, total);
    }
    blob = new Blob(partes as BlobPart[]);
  } else {
    blob = await res.blob();
  }

  const url = URL.createObjectURL(blob);

  if (abrirEnPestana) {
    window.open(url, "_blank");
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
