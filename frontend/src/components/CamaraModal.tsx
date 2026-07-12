import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Camera, RotateCcw, Check, Zap, ZapOff } from "lucide-react";
import { comprimirImagen } from "../lib/comprimirImagen";

// Cámara integrada en la página (getUserMedia) en vez de abrir la app nativa de Cámara.
// Evita que el navegador quede en segundo plano al capturar: en varios celulares (Xiaomi/MIUI
// en particular) el sistema mata la pestaña por ahorro de batería mientras la app de Cámara
// está al frente, y al volver se pierde la lectura que se estaba capturando.
export default function CamaraModal({ onCapturar, onCancelar }: { onCapturar: (file: File) => void; onCancelar: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [foto, setFoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // El flash (linterna trasera) solo está disponible en algunos navegadores/dispositivos
  // (Chrome/Android sí, Safari/iOS no lo expone a la web) — el botón solo aparece si el
  // track de video anuncia esa capacidad.
  const [torchDisponible, setTorchDisponible] = useState(false);
  const [torchActivo, setTorchActivo] = useState(false);

  useEffect(() => {
    let activo = true;
    navigator.mediaDevices
      // Antes se pedía 4K "ideal" pensando en fotos nítidas, pero eso hace que el navegador
      // negocie un modo de sensor pesado para el STREAM DE PREVIEW (video en vivo), volviéndolo
      // lento/con lag — y es esfuerzo desperdiciado: ImageCapture.takePhoto() (más abajo) toma
      // la foto fija a la resolución completa del sensor de todos modos, INDEPENDIENTE de la
      // resolución del preview. Y como además comprimimos a máx. 2000px después de capturar,
      // pedir un preview liviano (1080p) no le quita nada de calidad a la foto final.
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then((stream) => {
        if (!activo) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        const track = stream.getVideoTracks()[0];
        const capacidades = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
        if (capacidades?.torch) setTorchDisponible(true);
      })
      .catch(() => setError("No se pudo acceder a la cámara. Revisa los permisos del navegador."));

    return () => {
      activo = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const nuevo = !torchActivo;
    try {
      await track.applyConstraints({ advanced: [{ torch: nuevo } as MediaTrackConstraintSet] });
      setTorchActivo(nuevo);
    } catch {
      // el dispositivo anunció la capacidad pero falló al aplicarla; se ignora en silencio
    }
  }

  async function capturar() {
    const track = streamRef.current?.getVideoTracks()[0];

    // ImageCapture.takePhoto() usa el pipeline de foto fija de la cámara (resolución completa
    // del sensor), no el stream de video de preview — da mucha mejor calidad cuando el
    // navegador la soporta (Chrome/Android sí; Firefox/Safari no, ahí se usa el respaldo).
    if (track && "ImageCapture" in window) {
      try {
        const imageCapture = new (window as any).ImageCapture(track);
        const blob: Blob = await imageCapture.takePhoto();
        // La foto fija del sensor puede venir en varios MB (resolución completa, sin comprimir
        // de más); se recomprime en el navegador antes de mostrarla/subirla.
        const comprimida = await comprimirImagen(blob);
        setFoto({ blob: comprimida, url: URL.createObjectURL(comprimida) });
        return;
      } catch {
        // sigue con el respaldo de canvas
      }
    }

    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const comprimida = await comprimirImagen(blob);
        setFoto({ blob: comprimida, url: URL.createObjectURL(comprimida) });
      },
      "image/jpeg",
      0.92
    );
  }

  function reintentar() {
    if (foto) URL.revokeObjectURL(foto.url);
    setFoto(null);
  }

  function usarFoto() {
    if (!foto) return;
    onCapturar(new File([foto.blob], `lectura-${Date.now()}.jpg`, { type: "image/jpeg" }));
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      // React burbujea los eventos según el árbol de componentes, no el DOM real: aunque este
      // modal se monta en document.body vía portal, sin esto los clics igual llegarían al
      // backdrop del LecturaModal que lo abrió y lo cerrarían de inmediato.
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <span className="text-sm font-medium text-white">Foto del medidor</span>
        <div className="flex items-center gap-1">
          {torchDisponible && !foto && (
            <button
              onClick={toggleTorch}
              title={torchActivo ? "Apagar flash" : "Encender flash"}
              className={`rounded-lg p-1.5 text-white hover:bg-white/10 ${torchActivo ? "text-amber-400" : ""}`}
            >
              {torchActivo ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
            </button>
          )}
          <button onClick={onCancelar} className="rounded-lg p-1.5 text-white hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <p className="px-6 text-center text-sm text-red-300">{error}</p>
        ) : foto ? (
          <img src={foto.url} alt="Foto capturada" className="max-h-full max-w-full object-contain" />
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="max-h-full max-w-full object-contain" />
        )}
      </div>

      <div className="flex shrink-0 items-center justify-center gap-6 px-4 py-6">
        {foto ? (
          <>
            <button
              onClick={reintentar}
              className="flex flex-col items-center gap-1 text-xs font-medium text-white"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/40">
                <RotateCcw className="h-5 w-5" />
              </span>
              Repetir
            </button>
            <button
              onClick={usarFoto}
              className="flex flex-col items-center gap-1 text-xs font-medium text-white"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500">
                <Check className="h-6 w-6" />
              </span>
              Usar foto
            </button>
          </>
        ) : (
          <button
            onClick={capturar}
            disabled={!!error}
            className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white disabled:opacity-40"
          >
            <Camera className="h-6 w-6 text-white" />
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
