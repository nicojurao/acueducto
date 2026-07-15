import { Request } from "express";

// La IP real del cliente detrás de Cloudflare. `req.ip` depende de contar bien los saltos de
// X-Forwarded-For (trust proxy) — frágil si cambia la topología (nginx, cloudflared, etc.) y en
// la práctica seguía devolviendo la IP interna del contenedor en vez de la del usuario real.
// Cloudflare SIEMPRE agrega el header "CF-Connecting-IP" con la IP real del cliente, sin
// importar cuántos proxies haya en el medio — es la fuente confiable cuando existe. Si no viene
// (tráfico que no pasa por Cloudflare, ej. desarrollo local), se cae a req.ip como antes.
export function ipCliente(req: Request): string | undefined {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return cf.trim();
  return req.ip;
}
