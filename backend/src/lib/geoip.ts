// Geolocalización aproximada por IP, best-effort: nunca debe romper el login ni la auditoría si
// falla o está lento (falta de internet, servicio caído, IP privada sin ubicación posible). Usa
// ip-api.com (gratis, sin API key, ~45 req/min) — de sobra para el volumen de logins de esta app.

function esIpPrivada(ip: string): boolean {
  const limpia = ip.replace(/^::ffff:/, "");
  return (
    limpia === "127.0.0.1" ||
    limpia === "::1" ||
    limpia.startsWith("10.") ||
    limpia.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(limpia) ||
    limpia.startsWith("fc") ||
    limpia.startsWith("fd")
  );
}

export async function geolocalizarIp(
  ip: string | undefined
): Promise<{ ciudad: string | null; region: string | null; pais: string | null }> {
  const vacio = { ciudad: null, region: null, pais: null };
  if (!ip || esIpPrivada(ip)) return vacio;

  try {
    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), 3000);
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`,
      { signal: controlador.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return vacio;
    const data = (await res.json()) as { status: string; country?: string; regionName?: string; city?: string };
    if (data.status !== "success") return vacio;
    return { ciudad: data.city ?? null, region: data.regionName ?? null, pais: data.country ?? null };
  } catch {
    return vacio;
  }
}
