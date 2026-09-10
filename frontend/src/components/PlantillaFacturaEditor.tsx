import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Save, Upload, Trash2, Loader2, ZoomIn, ZoomOut, Maximize2, Minimize2 } from "lucide-react";
import { api, urlFoto, PlantillaFactura, CampoDisponible, MarcadorPlantillaInput } from "../api/client";
import { useToast } from "../contexts/ToastContext";
import { useErrorHandler } from "./ConfirmModal";
import { SkeletonLista } from "./Skeleton";
import { inputClass } from "../lib/ui";

// Puntos PDF por pixel en pantalla ANTES de aplicar el zoom del usuario: a esta escala base, una
// hoja carta (612x792 pt) se ve como un lienzo de ~490x633 px — cómodo para empezar sin que la
// hoja completa no quepa en la ventana. El zoom (ver estado "zoom" en el componente) multiplica
// esta base.
const ESCALA_BASE = 0.8;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.5;
const ZOOM_PASO = 0.1;

// Cada tamaño de hoja va en su orientación "natural" (más alta que ancha); "horizontal" en la UI
// simplemente intercambia ancho/alto al aplicarlo. Oficio/medio oficio usan la medida colombiana
// (216x330mm), no la "Legal" de EE.UU.
const TAMANOS_PAPEL: Record<string, { ancho: number; alto: number; etiqueta: string }> = {
  carta: { ancho: 612, alto: 792, etiqueta: "Carta" },
  oficio: { ancho: 612, alto: 936, etiqueta: "Oficio" },
  mediaCarta: { ancho: 396, alto: 612, etiqueta: "Media carta" },
  medioOficio: { ancho: 468, alto: 612, etiqueta: "Medio oficio" },
  a4: { ancho: 595, alto: 842, etiqueta: "A4" },
};

// A qué tamaño de la lista corresponde el ancho/alto guardado (ignorando orientación) — para que
// el selector abra mostrando lo que la plantilla ya tiene, en vez de arrancar siempre en "Carta".
function detectarTamano(anchoPt: number, altoPt: number): string {
  const menor = Math.min(anchoPt, altoPt);
  const mayor = Math.max(anchoPt, altoPt);
  for (const [clave, t] of Object.entries(TAMANOS_PAPEL)) {
    if (Math.abs(t.ancho - menor) < 2 && Math.abs(t.alto - mayor) < 2) return clave;
  }
  return "personalizado";
}

const PASO_CUADRICULA = 10; // pt

// Marcadores que el backend dibuja como IMAGEN (código de barras / DataMatrix), no como texto —
// reutilizan fontSize/anchoCaja con otro sentido (alto/ancho en pt, ver pdfFacturaPlantilla en el
// backend), así que en el editor necesitan su propia vista previa y su propio panel de
// propiedades (sin tamaño de letra, alineación ni negrita, que no aplican).
const CAMPOS_IMAGEN = new Set(["numeroBarras", "gs1Lineal", "gs1DataMatrix"]);
// El DataMatrix es cuadrado; el resto (códigos lineales) son barras anchas y bajas — solo cambia
// el tamaño por defecto al soltarlo por primera vez.
const ES_DATAMATRIX = (campo: string) => campo === "gs1DataMatrix";

type MarcadorEnEdicion = MarcadorPlantillaInput & { tempId: string };

// PDFKit (a diferencia del estándar PDF crudo) mide "y" desde ARRIBA de la página, igual que
// cualquier <div> en pantalla — por eso acá no hace falta invertir el eje Y entre el lienzo y las
// coordenadas que se mandan al backend, solo escalar por "escala" (ESCALA_BASE × zoom).
export default function PlantillaFacturaEditor({
  id,
  soloLectura = false,
  onVolver,
}: {
  id: number;
  soloLectura?: boolean;
  onVolver: () => void;
}) {
  const [plantilla, setPlantilla] = useState<PlantillaFactura | null>(null);
  const [campos, setCampos] = useState<CampoDisponible[]>([]);
  const [marcadores, setMarcadores] = useState<MarcadorEnEdicion[]>([]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [opacidadGuia, setOpacidadGuia] = useState(0.5);
  const [mostrarCuadricula, setMostrarCuadricula] = useState(false);
  const [alinearCuadricula, setAlinearCuadricula] = useState(false);
  const [cambiandoTamano, setCambiandoTamano] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { error, run } = useErrorHandler();
  const { mostrar } = useToast();

  function cargar() {
    api.facturacion.plantillas.get(id).then((p) => {
      setPlantilla(p);
      setMarcadores(p.marcadores.map((m) => ({ ...m, tempId: `m${m.id}` })));
    });
  }
  useEffect(cargar, [id]);
  useEffect(() => {
    api.facturacion.plantillas.camposDisponibles().then(setCampos);
  }, []);

  // Flechas del teclado mueven el marcador seleccionado (Shift = paso más grande) — pero no si el
  // foco está en un campo de texto/número (ahí las flechas deben seguir haciendo lo suyo, ej.
  // subir/bajar el tamaño de letra) ni en modo solo lectura.
  useEffect(() => {
    if (soloLectura || !seleccionado) return;
    function onKeyDown(e: KeyboardEvent) {
      const activo = document.activeElement;
      if (activo && ["INPUT", "SELECT", "TEXTAREA"].includes(activo.tagName)) return;
      const paso = e.shiftKey ? 10 : alinearCuadricula ? PASO_CUADRICULA : 1;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowUp") dy = -paso;
      else if (e.key === "ArrowDown") dy = paso;
      else if (e.key === "ArrowLeft") dx = -paso;
      else if (e.key === "ArrowRight") dx = paso;
      else return;
      e.preventDefault();
      setMarcadores((prev) =>
        prev.map((m) => (m.tempId === seleccionado ? { ...m, x: Math.max(0, m.x + dx), y: Math.max(0, m.y + dy) } : m))
      );
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [seleccionado, soloLectura, alinearCuadricula]);

  if (!plantilla) return <SkeletonLista />;

  const escala = ESCALA_BASE * zoom;
  const anchoPx = plantilla.anchoPt * escala;
  const altoPx = plantilla.altoPt * escala;
  const tamanoActual = detectarTamano(plantilla.anchoPt, plantilla.altoPt);
  const horizontalActual = plantilla.anchoPt > plantilla.altoPt;
  const marcadorSeleccionado = marcadores.find((m) => m.tempId === seleccionado) ?? null;
  const camposPorCategoria = campos.reduce<Record<string, CampoDisponible[]>>((acc, c) => {
    (acc[c.categoria] ??= []).push(c);
    return acc;
  }, {});
  const etiquetaDe = (clave: string) => campos.find((c) => c.clave === clave)?.etiqueta ?? clave;

  function ajustarAPaso(v: number): number {
    return alinearCuadricula ? Math.round(v / PASO_CUADRICULA) * PASO_CUADRICULA : v;
  }

  function coordenadasEnLienzo(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    if (xPx < 0 || yPx < 0 || xPx > anchoPx || yPx > altoPx) return null;
    return { x: ajustarAPaso(xPx / escala), y: ajustarAPaso(yPx / escala) };
  }

  // Cambiar tamaño/orientación aplica de inmediato (no espera al botón "Guardar diseño", que solo
  // guarda los marcadores) — es una propiedad de la plantilla misma, igual que el nombre.
  async function cambiarTamano(clave: string, horizontal: boolean) {
    const t = TAMANOS_PAPEL[clave];
    if (!t || !plantilla) return;
    setCambiandoTamano(true);
    await run(async () => {
      const anchoPt = horizontal ? t.alto : t.ancho;
      const altoPt = horizontal ? t.ancho : t.alto;
      const actualizada = await api.facturacion.plantillas.update(plantilla.id, {
        nombre: plantilla.nombre,
        anchoPt,
        altoPt,
      });
      setPlantilla(actualizada);
    });
    setCambiandoTamano(false);
  }

  function onDropCanvas(e: React.DragEvent) {
    e.preventDefault();
    if (soloLectura) return;
    const campo = e.dataTransfer.getData("text/campo");
    if (!campo) return;
    const punto = coordenadasEnLienzo(e);
    if (!punto) return;
    const tempId = `n${Date.now()}`;
    // Los marcadores de imagen reutilizan fontSize/anchoCaja con otro sentido (alto/ancho en pt,
    // ver pdfFacturaPlantilla en el backend) — con los defaults de texto (fontSize 9) saldría un
    // código casi invisible, así que arrancan con un tamaño legible. El DataMatrix es cuadrado.
    const esImagen = CAMPOS_IMAGEN.has(campo);
    const esCuadrado = ES_DATAMATRIX(campo);
    setMarcadores((prev) => [
      ...prev,
      {
        tempId,
        campo,
        x: punto.x,
        y: punto.y,
        fontSize: esImagen ? 30 : 9,
        align: "left",
        bold: false,
        anchoCaja: esImagen ? (esCuadrado ? 30 : 120) : null,
      },
    ]);
    setSeleccionado(tempId);
  }

  function onDragMarcadorEnd(tempId: string, e: React.DragEvent) {
    const punto = coordenadasEnLienzo(e);
    if (!punto) return; // se soltó fuera del lienzo — se ignora, queda donde estaba
    setMarcadores((prev) => prev.map((m) => (m.tempId === tempId ? { ...m, x: punto.x, y: punto.y } : m)));
  }

  function actualizarSeleccionado(cambios: Partial<MarcadorEnEdicion>) {
    setMarcadores((prev) => prev.map((m) => (m.tempId === seleccionado ? { ...m, ...cambios } : m)));
  }

  function eliminarSeleccionado() {
    setMarcadores((prev) => prev.filter((m) => m.tempId !== seleccionado));
    setSeleccionado(null);
  }

  async function guardar() {
    setGuardando(true);
    await run(async () => {
      await api.facturacion.plantillas.guardarMarcadores(
        id,
        marcadores.map(({ tempId, ...m }) => m)
      );
      mostrar("Diseño guardado", "exito");
    });
    setGuardando(false);
  }

  async function onSubirImagen(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setSubiendoImagen(true);
    await run(async () => {
      const actualizada = await api.facturacion.plantillas.subirImagenGuia(id, archivo);
      setPlantilla(actualizada);
    });
    setSubiendoImagen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function quitarImagen() {
    await run(async () => {
      const actualizada = await api.facturacion.plantillas.quitarImagenGuia(id);
      setPlantilla(actualizada);
    });
  }

  return (
    <div
      className={
        pantallaCompleta
          ? "fixed inset-0 z-[3000] overflow-auto bg-slate-50 p-3 dark:bg-slate-950 sm:p-4"
          : undefined
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={onVolver}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a plantillas
        </button>
        <h2 className="flex-1 text-center text-sm font-semibold text-slate-800 dark:text-slate-100 sm:text-left">
          {plantilla.nombre}
        </h2>
        <button
          onClick={() => setPantallaCompleta((v) => !v)}
          title={pantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {pantallaCompleta ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          {pantallaCompleta ? "Salir" : "Pantalla completa"}
        </button>
        {!soloLectura && (
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar diseño
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>
      )}

      {soloLectura ? (
        <p className="mb-3 text-xs text-slate-700 dark:text-slate-400">Solo puedes consultar este diseño, no editarlo.</p>
      ) : (
        <p className="mb-3 text-xs text-slate-700 dark:text-slate-400">
          Arrastra un marcador de la lista al lienzo para ubicarlo; ya puesto, se puede volver a arrastrar para
          ajustarlo. Haz clic en un marcador para cambiar su tamaño de letra o alineación.
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-2.5 dark:border-slate-800">
        {!soloLectura && (
          <>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              Tamaño de hoja
              <select
                value={tamanoActual}
                disabled={cambiandoTamano}
                onChange={(e) => cambiarTamano(e.target.value, horizontalActual)}
                className={`${inputClass} w-32`}
              >
                {tamanoActual === "personalizado" && <option value="personalizado">Personalizado</option>}
                {Object.entries(TAMANOS_PAPEL).map(([clave, t]) => (
                  <option key={clave} value={clave}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1 rounded-lg border border-slate-300 p-0.5 dark:border-slate-700">
              <button
                type="button"
                disabled={cambiandoTamano || tamanoActual === "personalizado"}
                onClick={() => cambiarTamano(tamanoActual, false)}
                className={`rounded-md px-2 py-1 text-xs font-medium disabled:opacity-40 ${
                  !horizontalActual ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                Vertical
              </button>
              <button
                type="button"
                disabled={cambiandoTamano || tamanoActual === "personalizado"}
                onClick={() => cambiarTamano(tamanoActual, true)}
                className={`rounded-md px-2 py-1 text-xs font-medium disabled:opacity-40 ${
                  horizontalActual ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                Horizontal
              </button>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-500">
              {plantilla.anchoPt}×{plantilla.altoPt} pt
            </span>
            <span className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
          </>
        )}
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          <input type="checkbox" checked={mostrarCuadricula} onChange={(e) => setMostrarCuadricula(e.target.checked)} />
          Cuadrícula
        </label>
        {!soloLectura && (
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={alinearCuadricula}
              onChange={(e) => setAlinearCuadricula(e.target.checked)}
            />
            Alinear a la cuadrícula
          </label>
        )}
        <span className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
        <div className="flex items-center gap-1 rounded-lg border border-slate-300 p-0.5 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_PASO).toFixed(2)))}
            title="Alejar"
            className="rounded-md p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            title="Restablecer zoom"
            className="w-11 text-center text-xs text-slate-600 hover:underline dark:text-slate-300"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_PASO).toFixed(2)))}
            title="Acercar"
            className="rounded-md p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Lista de marcadores disponibles */}
        <div className="shrink-0 lg:w-56">
          <div className="mb-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
              <Upload className="h-3.5 w-3.5" />
              Imagen guía (escaneo)
            </label>
            {plantilla.imagenGuiaUrl ? (
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-slate-600 dark:text-slate-400">Imagen cargada</span>
                {!soloLectura && (
                  <button onClick={quitarImagen} className="shrink-0 text-red-500 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : soloLectura ? (
              <span className="text-xs text-slate-500 dark:text-slate-500">Sin imagen guía</span>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={subiendoImagen}
                className="w-full rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                {subiendoImagen ? "Subiendo..." : "Subir imagen"}
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={onSubirImagen} className="hidden" />
            {plantilla.imagenGuiaUrl && (
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                Opacidad
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.1}
                  value={opacidadGuia}
                  onChange={(e) => setOpacidadGuia(Number(e.target.value))}
                  className="flex-1"
                />
              </label>
            )}
          </div>

          {!soloLectura && (
            <div className="max-h-[500px] space-y-3 overflow-y-auto rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              {Object.entries(camposPorCategoria).map(([categoria, items]) => (
                <div key={categoria}>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">
                    {categoria}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((c) => (
                      <div
                        key={c.clave}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/campo", c.clave)}
                        className="cursor-grab rounded-lg border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 active:cursor-grabbing dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        {c.etiqueta}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lienzo */}
        <div className="flex-1 overflow-auto">
          <div
            ref={canvasRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropCanvas}
            onClick={(e) => {
              if (e.target === canvasRef.current) setSeleccionado(null);
            }}
            className="relative border border-slate-300 bg-white shadow-sm dark:border-slate-700"
            style={{ width: anchoPx, height: altoPx }}
          >
            {plantilla.imagenGuiaUrl && (
              <img
                src={urlFoto(plantilla.imagenGuiaUrl)}
                alt=""
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
                style={{ opacity: opacidadGuia }}
              />
            )}
            {mostrarCuadricula && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgba(100,116,139,0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,0.35) 1px, transparent 1px)",
                  backgroundSize: `${PASO_CUADRICULA * escala}px ${PASO_CUADRICULA * escala}px`,
                }}
              />
            )}
            {marcadores.map((m) => {
              const esImagen = CAMPOS_IMAGEN.has(m.campo);
              const esCuadrado = ES_DATAMATRIX(m.campo);
              return (
                <div
                  key={m.tempId}
                  draggable={!soloLectura}
                  onDragEnd={(e) => onDragMarcadorEnd(m.tempId, e)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSeleccionado(m.tempId);
                  }}
                  className={`absolute select-none ${
                    esImagen ? "flex items-center justify-center border border-slate-500 bg-white/80" : "whitespace-nowrap bg-white/70 px-0.5 text-black"
                  } ${soloLectura ? "" : "cursor-grab active:cursor-grabbing"} ${
                    seleccionado === m.tempId
                      ? "outline outline-2 outline-brand-500"
                      : "outline outline-1 outline-dashed outline-slate-400"
                  }`}
                  style={
                    esImagen
                      ? {
                          left: m.x * escala,
                          top: m.y * escala,
                          width: (m.anchoCaja ?? (esCuadrado ? 30 : 120)) * escala,
                          height: ((m.fontSize ?? 0) > 9 ? m.fontSize! : 30) * escala,
                          backgroundImage: esCuadrado
                            ? "repeating-linear-gradient(to right, #000 0 3px, transparent 3px 6px), repeating-linear-gradient(to bottom, #000 0 3px, transparent 3px 6px)"
                            : "repeating-linear-gradient(to right, #000 0px, #000 2px, transparent 2px, transparent 5px)",
                          backgroundSize: esCuadrado ? "6px 6px" : "auto 100%",
                          backgroundRepeat: esCuadrado ? "repeat" : "repeat-x",
                          backgroundBlendMode: esCuadrado ? "multiply" : undefined,
                        }
                      : {
                          left: m.x * escala,
                          top: m.y * escala,
                          fontSize: (m.fontSize ?? 9) * escala,
                          fontWeight: m.bold ? 700 : 400,
                          textAlign: m.align,
                          width: m.anchoCaja ? m.anchoCaja * escala : undefined,
                        }
                  }
                >
                  {!esImagen && etiquetaDe(m.campo)}
                </div>
              );
            })}
          </div>
        </div>

        {/* Propiedades del marcador seleccionado */}
        {marcadorSeleccionado && (
          <div className="shrink-0 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800 lg:w-56">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {etiquetaDe(marcadorSeleccionado.campo)}
              </span>
              {!soloLectura && (
                <button onClick={eliminarSeleccionado} className="text-red-500 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {CAMPOS_IMAGEN.has(marcadorSeleccionado.campo) ? (
              <>
                <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                  Ancho (pt)
                  <input
                    type="number"
                    min={20}
                    disabled={soloLectura}
                    value={marcadorSeleccionado.anchoCaja ?? (ES_DATAMATRIX(marcadorSeleccionado.campo) ? 30 : 120)}
                    onChange={(e) => actualizarSeleccionado({ anchoCaja: Number(e.target.value) })}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                  Alto (pt)
                  <input
                    type="number"
                    min={10}
                    disabled={soloLectura}
                    value={marcadorSeleccionado.fontSize}
                    onChange={(e) => actualizarSeleccionado({ fontSize: Number(e.target.value) })}
                    className={inputClass}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                  Tamaño de letra
                  <input
                    type="number"
                    min={5}
                    max={40}
                    disabled={soloLectura}
                    value={marcadorSeleccionado.fontSize}
                    onChange={(e) => actualizarSeleccionado({ fontSize: Number(e.target.value) })}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                  Alineación
                  <select
                    value={marcadorSeleccionado.align}
                    disabled={soloLectura}
                    onChange={(e) => actualizarSeleccionado({ align: e.target.value as "left" | "center" | "right" })}
                    className={inputClass}
                  >
                    <option value="left">Izquierda</option>
                    <option value="center">Centro</option>
                    <option value="right">Derecha</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                  Ancho de caja (pt, opcional)
                  <input
                    type="number"
                    min={0}
                    disabled={soloLectura}
                    value={marcadorSeleccionado.anchoCaja ?? ""}
                    onChange={(e) => actualizarSeleccionado({ anchoCaja: e.target.value ? Number(e.target.value) : null })}
                    placeholder="automático"
                    className={inputClass}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    disabled={soloLectura}
                    checked={marcadorSeleccionado.bold}
                    onChange={(e) => actualizarSeleccionado({ bold: e.target.checked })}
                  />
                  Negrita
                </label>
              </>
            )}
            <p className="text-[10px] text-slate-500 dark:text-slate-500">
              Posición: {Math.round(marcadorSeleccionado.x)}, {Math.round(marcadorSeleccionado.y)} pt
              {!soloLectura && " · muévelo con las flechas del teclado (Shift = paso grande)"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
