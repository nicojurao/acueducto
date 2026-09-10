import { useEffect, useRef, useState } from "react";
import { urlFoto } from "../api/client";
import { guardarEnCache, leerDeCache } from "../lib/cacheOffline";

// Muestra la foto de perfil del usuario (sidebar, modal de perfil) con respaldo offline: la
// primera vez que carga bien desde el servidor, se guarda una copia en localStorage (como
// data URL, vía canvas) y si más adelante falla por falta de conexión, se usa esa copia en vez
// de dejar el círculo del avatar roto/vacío.
export default function FotoPerfil({
  foto,
  className,
  onFallar,
}: {
  foto: string;
  className?: string;
  onFallar?: () => void;
}) {
  const claveCache = `foto_perfil_${foto}`;
  const [src, setSrc] = useState(() => urlFoto(foto));
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setSrc(urlFoto(foto));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foto]);

  function alCargar() {
    const img = imgRef.current;
    if (!img) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      guardarEnCache(claveCache, canvas.toDataURL("image/jpeg", 0.85));
    } catch {
      // el navegador puede bloquear toDataURL en algunos casos raros — no es grave, simplemente
      // no queda respaldo offline para esta foto puntual
    }
  }

  function alFallar() {
    const cache = leerDeCache<string>(claveCache);
    if (cache && src !== cache) {
      setSrc(cache);
      return;
    }
    onFallar?.();
  }

  return <img ref={imgRef} src={src} onLoad={alCargar} onError={alFallar} className={className} alt="" />;
}
