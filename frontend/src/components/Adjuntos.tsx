import { useEffect, useRef, useState } from "react";
import { FileText, ImageIcon, Upload, ExternalLink, Trash2, X, Undo2, Loader2, CheckCircle2, Plus } from "lucide-react";
import { urlFoto } from "../api/client";
import { comprimirFotos } from "../lib/comprimirImagen";
import { validarDocumento, formatoMB, MAX_MB_DOCUMENTO } from "../lib/validarDocumento";

const MAX_FOTOS_POR_VEZ = 10; // mismo tope que el servidor (upload.array("fotos", 10) en actas.ts)

const botonTexto =
  "rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50 dark:text-brand-300 dark:hover:bg-slate-800";
const botonIcono =
  "rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800";

// Un documento escaneado (acta de calibración, acta firmada) como una tarjeta con UN estado claro,
// en vez del selector de archivo nativo más links sueltos ("Ver acta actual", "Quitar"):
//   vacío → [Adjuntar]   ·   guardado → [Ver] [Reemplazar] [Quitar]
//   archivo nuevo elegido → "se guardará al confirmar" [✕]   ·   marcado para quitar → [Deshacer]
// Nada se sube ni se borra hasta que se confirma el formulario completo (así Cancelar cancela).
export function DocumentoAdjunto({
  titulo,
  urlActual = null,
  archivoNuevo,
  onArchivoNuevo,
  quitar = false,
  onQuitar,
}: {
  titulo: string;
  // Sin documento guardado (ej. al crear un medidor): urlActual/quitar/onQuitar se omiten.
  urlActual?: string | null;
  archivoNuevo: File | null;
  onArchivoNuevo: (archivo: File | null) => void;
  quitar?: boolean;
  onQuitar?: (quitar: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  // Páginas del archivo nuevo, ligadas AL archivo: si el formulario se cierra y se reabre con el archivo
  // todavía elegido, el peso se sigue mostrando (sale del propio archivo) y las páginas solo si se conocen.
  const [paginasNuevo, setPaginasNuevo] = useState<{ archivo: File; paginas: number | null } | null>(null);
  // Si se elige otro archivo mientras todavía se revisa el anterior, solo vale el último.
  const revisionRef = useRef(0);

  async function procesar(archivo: File) {
    const id = ++revisionRef.current;
    setError(null);
    setRevisando(true);
    const resultado = await validarDocumento(archivo);
    if (id !== revisionRef.current) return;
    setRevisando(false);
    if (!resultado.ok) {
      setError(resultado.mensaje); // un intento fallido no toca lo que ya había
      return;
    }
    setPaginasNuevo({ archivo, paginas: resultado.paginas });
    onQuitar?.(false);
    onArchivoNuevo(archivo);
  }

  function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (archivo) procesar(archivo);
  }

  const descartarNuevo = () => {
    revisionRef.current++;
    setError(null);
    onArchivoNuevo(null);
  };

  const esPdf = (urlActual ?? "").toLowerCase().endsWith(".pdf");
  const Icono = archivoNuevo ? (archivoNuevo.type.startsWith("image/") ? ImageIcon : FileText) : urlActual && !esPdf ? ImageIcon : FileText;

  let estado: "nuevo" | "quitando" | "guardado" | "vacio" = "vacio";
  if (archivoNuevo) estado = "nuevo";
  else if (urlActual && quitar) estado = "quitando";
  else if (urlActual) estado = "guardado";

  const tono =
    estado === "nuevo"
      ? "border-brand-300 bg-brand-50/60 dark:border-brand-500/40 dark:bg-brand-500/10"
      : estado === "quitando"
      ? "border-amber-300 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/10"
      : arrastrando
      ? "border-brand-400 bg-brand-50/60 dark:bg-brand-500/10"
      : estado === "vacio"
      ? "border-dashed border-slate-300 dark:border-slate-700"
      : "border-slate-200 dark:border-slate-700";

  return (
    <div>
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-3 transition-colors ${tono}`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          const archivo = e.dataTransfer.files?.[0];
          if (archivo) procesar(archivo);
        }}
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            estado === "quitando"
              ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          } ${estado === "nuevo" ? "!bg-brand-100 !text-brand-700 dark:!bg-brand-500/20 dark:!text-brand-300" : ""}`}
        >
          {revisando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icono className="h-5 w-5" />}
        </span>

        <div className="min-w-0 flex-1 basis-40">
          <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{titulo}</div>
          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
            {revisando ? (
              "Revisando archivo…"
            ) : estado === "nuevo" ? (
              <>
                <span className="font-medium text-brand-700 dark:text-brand-300">{archivoNuevo!.name}</span> · {formatoMB(archivoNuevo!.size)} MB
                {paginasNuevo?.archivo === archivoNuevo && paginasNuevo.paginas ? ` · ${paginasNuevo.paginas} pág.` : ""}
                <span className="block sm:inline"> · se guardará al confirmar</span>
              </>
            ) : estado === "quitando" ? (
              <span className="text-amber-700 dark:text-amber-400">Se quitará al guardar</span>
            ) : estado === "guardado" ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Adjunto · {esPdf ? "PDF" : "imagen"}
              </span>
            ) : (
              `Sin adjuntar · PDF o imagen, máx. ${MAX_MB_DOCUMENTO} MB`
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {estado === "vacio" && (
            <button type="button" onClick={() => inputRef.current?.click()} className={`${botonTexto} flex items-center gap-1.5`}>
              <Upload className="h-3.5 w-3.5" /> Adjuntar
            </button>
          )}
          {estado === "guardado" && (
            <>
              <a href={urlFoto(urlActual)} target="_blank" rel="noreferrer" className={`${botonTexto} flex items-center gap-1.5`}>
                <ExternalLink className="h-3.5 w-3.5" /> Ver
              </a>
              <button type="button" onClick={() => inputRef.current?.click()} className={botonTexto}>
                Reemplazar
              </button>
              <button type="button" onClick={() => onQuitar?.(true)} title="Quitar" aria-label={`Quitar ${titulo}`} className={`${botonIcono} hover:!bg-red-50 hover:!text-red-600 dark:hover:!bg-red-500/10`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
          {estado === "nuevo" && (
            <>
              <button type="button" onClick={() => inputRef.current?.click()} className={botonTexto}>
                Cambiar
              </button>
              <button type="button" onClick={descartarNuevo} title="Descartar" aria-label="Descartar archivo elegido" className={botonIcono}>
                <X className="h-4 w-4" />
              </button>
            </>
          )}
          {estado === "quitando" && (
            <button type="button" onClick={() => onQuitar?.(false)} className={`${botonTexto} flex items-center gap-1.5`}>
              <Undo2 className="h-3.5 w-3.5" /> Deshacer
            </button>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/*,application/pdf" onChange={alElegir} className="hidden" />
      </div>
      {error && (
        <p role="alert" className="mt-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

// Miniatura de un archivo local; libera la URL temporal al desmontar (antes se creaba una nueva
// en CADA render y nunca se liberaba).
function MiniaturaLocal({ archivo }: { archivo: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(archivo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [archivo]);
  return url ? <img src={url} alt={archivo.name} className="h-full w-full object-cover" /> : null;
}

const botonQuitarFoto =
  "absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white shadow ring-2 ring-white hover:bg-red-600 dark:ring-slate-900";

// Fotos de la instalación: las ya guardadas y las nuevas en una sola tira de miniaturas, con una
// casilla "+" para agregar (se acumulan; antes cada selección reemplazaba a la anterior y no se
// podía quitar una sola). Las nuevas llevan un anillo de color hasta que se guarden.
export function FotosAdjuntas({
  existentes,
  onQuitarExistente,
  nuevas,
  onNuevas,
  inputRef,
}: {
  existentes: string[];
  onQuitarExistente: (foto: string) => void;
  nuevas: File[];
  onNuevas: (fotos: File[]) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const elegidas = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (elegidas.length === 0) return;
    const imagenes = elegidas.filter((f) => f.type.startsWith("image/"));
    const aceptadas = imagenes.slice(0, Math.max(0, MAX_FOTOS_POR_VEZ - nuevas.length));
    const avisos: string[] = [];
    if (imagenes.length < elegidas.length) avisos.push("Solo se pueden subir imágenes (JPG, PNG).");
    if (aceptadas.length < imagenes.length) avisos.push(`Máximo ${MAX_FOTOS_POR_VEZ} fotos nuevas por vez.`);
    setAviso(avisos.join(" ") || null);
    if (aceptadas.length === 0) return;
    setProcesando(true);
    const comprimidas = await comprimirFotos(aceptadas);
    setProcesando(false);
    onNuevas([...nuevas, ...comprimidas]);
  }

  const total = existentes.length + nuevas.length;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Fotos de la instalación</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {total === 0 ? "Sin fotos" : `${total} foto${total === 1 ? "" : "s"}`}
          {nuevas.length > 0 && ` (${nuevas.length} por guardar)`}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        {existentes.map((foto) => (
          <div key={foto} className="relative h-16 w-16">
            <a
              href={urlFoto(foto)}
              target="_blank"
              rel="noreferrer"
              title="Ver foto"
              className="block h-full w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <img src={urlFoto(foto)} alt="Foto de instalación" className="h-full w-full object-cover" />
            </a>
            <button type="button" onClick={() => onQuitarExistente(foto)} title="Quitar foto" aria-label="Quitar foto" className={botonQuitarFoto}>
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {nuevas.map((foto, i) => (
          <div key={`${foto.name}-${foto.lastModified}-${i}`} className="relative h-16 w-16">
            <div className="h-full w-full overflow-hidden rounded-lg ring-2 ring-brand-400">
              <MiniaturaLocal archivo={foto} />
            </div>
            <button
              type="button"
              onClick={() => onNuevas(nuevas.filter((_, j) => j !== i))}
              title="Descartar foto"
              aria-label="Descartar foto"
              className={botonQuitarFoto}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={procesando || nuevas.length >= MAX_FOTOS_POR_VEZ}
          title="Agregar fotos"
          className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {procesando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
          <span className="text-[10px] font-medium">{procesando ? "" : "Agregar"}</span>
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple onChange={alElegir} className="hidden" />
      </div>
      {aviso && <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">{aviso}</p>}
    </div>
  );
}
