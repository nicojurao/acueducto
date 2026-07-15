// Parser minimalista de User-Agent: no se necesita una librería completa para esto, solo un
// resumen legible tipo "Android · Chrome" para mostrar en la auditoría de sesiones. No pretende
// ser exhaustivo (no distingue versiones ni todos los navegadores raros), solo lo común.
export function resumenDispositivo(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent;

  let so: string;
  if (/iPhone|iPad|iPod/i.test(ua)) so = "iOS";
  else if (/Android/i.test(ua)) so = "Android";
  else if (/Windows/i.test(ua)) so = "Windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) so = "macOS";
  else if (/Linux/i.test(ua)) so = "Linux";
  else so = "Desconocido";

  let navegador: string;
  if (/Edg\//i.test(ua)) navegador = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) navegador = "Opera";
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) navegador = "Chrome";
  else if (/CriOS/i.test(ua)) navegador = "Chrome";
  else if (/Firefox\//i.test(ua)) navegador = "Firefox";
  else if (/Safari\//i.test(ua) && /Version\//i.test(ua)) navegador = "Safari";
  else navegador = "Desconocido";

  return `${so} · ${navegador}`;
}
