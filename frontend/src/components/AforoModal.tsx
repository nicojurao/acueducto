import { useState } from "react";
import { X, MapPin, Loader2, Camera, Plus, Trash2 } from "lucide-react";
import { api, PuntoAforo } from "../api/client";
import { useConfirm, useErrorHandler } from "./ConfirmModal";
import CamaraModal from "./CamaraModal";
import { comprimirFoto } from "../lib/comprimirImagen";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500";

const PROFUNDIDADES_POR_SECCION = 5;

// Intenta obtener la ubicación GPS del dispositivo; si no hay permiso o no está disponible,
// el aforo se guarda igual, solo sin coordenadas.
function obtenerUbicacion(): Promise<{ latitud?: number; longitud?: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitud: pos.coords.latitude, longitud: pos.coords.longitude }),
      () => resolve({}),
      { timeout: 8000 }
    );
  });
}

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function horaActual(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function promedio(valores: string[]): number | null {
  const numeros = valores.map(Number).filter((n) => n > 0);
  if (numeros.length === 0) return null;
  return numeros.reduce((a, b) => a + b, 0) / numeros.length;
}

// El área de cada sección es ancho x SUMA de las profundidades (no el promedio) — replica el
// formato oficial F-SIG-GA-001, donde el área es la suma de trapecios entre verticales de
// profundidad consecutivas; con ancho constante esa suma se simplifica a ancho x Σ(profundidades).
function suma(valores: string[]): number | null {
  const numeros = valores.map(Number).filter((n) => n > 0);
  if (numeros.length === 0) return null;
  return numeros.reduce((a, b) => a + b, 0);
}

// Lista de campos numéricos con botón agregar/quitar (usada para los "x tiempos" del flotador).
function ListaNumeros({
  etiqueta,
  valores,
  onCambiar,
}: {
  etiqueta: string;
  valores: string[];
  onCambiar: (valores: string[]) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">{etiqueta}</span>
      <div className="space-y-1.5">
        {valores.map((v, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="number"
              step="0.01"
              value={v}
              onChange={(e) => onCambiar(valores.map((x, j) => (j === i ? e.target.value : x)))}
              className={`${inputClass} w-full`}
            />
            {valores.length > 1 && (
              <button
                onClick={() => onCambiar(valores.filter((_, j) => j !== i))}
                className="shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={() => onCambiar([...valores, ""])}
        className="mt-1.5 flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        <Plus className="h-3.5 w-3.5" />
        Agregar tiempo
      </button>
    </div>
  );
}

export default function AforoModal({
  puntos,
  puntoInicial,
  onClose,
  onCambio,
}: {
  puntos: PuntoAforo[];
  puntoInicial?: number;
  onClose: () => void;
  onCambio: () => void;
}) {
  const [puntoAforoId, setPuntoAforoId] = useState(puntoInicial ?? puntos[0]?.id ?? 0);
  const [fecha, setFecha] = useState(hoyISO());
  const [hora, setHora] = useState(horaActual());
  const [metodo, setMetodo] = useState<"flotador" | "volumetrico">("flotador");

  // volumétrico
  const [volumenLitros, setVolumenLitros] = useState("");
  const [tiempoUnico, setTiempoUnico] = useState("");

  // flotador
  const [distanciaMetros, setDistanciaMetros] = useState("");
  const [tiempos, setTiempos] = useState<string[]>([""]);
  const [anchoAltaM, setAnchoAltaM] = useState("");
  const [profundidadesAltaM, setProfundidadesAltaM] = useState<string[]>(Array(PROFUNDIDADES_POR_SECCION).fill(""));
  const [anchoBajaM, setAnchoBajaM] = useState("");
  const [profundidadesBajaM, setProfundidadesBajaM] = useState<string[]>(Array(PROFUNDIDADES_POR_SECCION).fill(""));

  const [observaciones, setObservaciones] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [ubicando, setUbicando] = useState(false);
  const [ubicacion, setUbicacion] = useState<{ latitud?: number; longitud?: number }>({});
  const { error, run } = useErrorHandler();
  const { pedirConfirmacion, modal: modalConfirmacion } = useConfirm();

  const tiempoProm = promedio(tiempos);
  const profAltaProm = promedio(profundidadesAltaM);
  const profBajaProm = promedio(profundidadesBajaM);
  const profAltaSuma = suma(profundidadesAltaM);
  const profBajaSuma = suma(profundidadesBajaM);
  const areaAltaM2 = profAltaSuma !== null && Number(anchoAltaM) > 0 ? Number(anchoAltaM) * profAltaSuma : null;
  const areaBajaM2 = profBajaSuma !== null && Number(anchoBajaM) > 0 ? Number(anchoBajaM) * profBajaSuma : null;
  const areaM2 = areaAltaM2 !== null && areaBajaM2 !== null ? (areaAltaM2 + areaBajaM2) / 2 : null;
  const velocidadMs = tiempoProm !== null && Number(distanciaMetros) > 0 ? Number(distanciaMetros) / tiempoProm : null;

  const caudalLps =
    metodo === "volumetrico"
      ? Number(volumenLitros) > 0 && Number(tiempoUnico) > 0
        ? Number(volumenLitros) / Number(tiempoUnico)
        : null
      : velocidadMs !== null && areaM2 !== null
        ? velocidadMs * areaM2 * 1000
        : null;

  async function marcarUbicacion() {
    setUbicando(true);
    setUbicacion(await obtenerUbicacion());
    setUbicando(false);
  }

  async function guardar() {
    if (!puntoAforoId || caudalLps === null) return;
    await run(async () => {
      setGuardando(true);
      try {
        await api.aforos.create({
          puntoAforoId,
          fecha: `${fecha}T${hora || "00:00"}`,
          metodo,
          volumenLitros: metodo === "volumetrico" ? Number(volumenLitros) : undefined,
          tiempoSegundos: metodo === "volumetrico" ? Number(tiempoUnico) : undefined,
          tiempos: metodo === "flotador" ? tiempos.map(Number).filter((n) => n > 0) : undefined,
          distanciaMetros: metodo === "flotador" ? Number(distanciaMetros) : undefined,
          anchoAltaM: metodo === "flotador" ? Number(anchoAltaM) : undefined,
          profundidadesAltaM: metodo === "flotador" ? profundidadesAltaM.map(Number).filter((n) => n > 0) : undefined,
          anchoBajaM: metodo === "flotador" ? Number(anchoBajaM) : undefined,
          profundidadesBajaM: metodo === "flotador" ? profundidadesBajaM.map(Number).filter((n) => n > 0) : undefined,
          observaciones: observaciones.trim() || undefined,
          latitud: ubicacion.latitud,
          longitud: ubicacion.longitud,
          foto,
        });
        onCambio();
        setGuardadoOk(true);
        setTimeout(onClose, 1100);
      } finally {
        setGuardando(false);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 animate-fade-in p-4">
      {modalConfirmacion}
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white animate-scale-in p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Nuevo registro de aforo</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </p>
        )}
        {guardadoOk && (
          <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
            ✓ Cambios guardados correctamente
          </p>
        )}

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Punto de aforo</span>
            <select
              value={puntoAforoId}
              onChange={(e) => setPuntoAforoId(Number(e.target.value))}
              className={`${inputClass} w-full`}
            >
              {puntos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Fecha</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${inputClass} w-full`} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Hora</span>
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={`${inputClass} w-full`} />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Método</span>
            <select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as "flotador" | "volumetrico")}
              className={`${inputClass} w-full`}
            >
              <option value="flotador">Flotador (velocidad x área)</option>
              <option value="volumetrico">Volumétrico (recipiente aforado)</option>
            </select>
          </label>

          {metodo === "volumetrico" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Volumen (litros)</span>
                <input
                  type="number"
                  step="0.01"
                  value={volumenLitros}
                  onChange={(e) => setVolumenLitros(e.target.value)}
                  className={`${inputClass} w-full`}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Tiempo (segundos)</span>
                <input
                  type="number"
                  step="0.01"
                  value={tiempoUnico}
                  onChange={(e) => setTiempoUnico(e.target.value)}
                  className={`${inputClass} w-full`}
                />
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Distancia recorrida (m)</span>
                <input
                  type="number"
                  step="0.01"
                  value={distanciaMetros}
                  onChange={(e) => setDistanciaMetros(e.target.value)}
                  className={`${inputClass} w-full`}
                />
              </label>

              <ListaNumeros etiqueta="Tiempos (segundos, una corrida por fila)" valores={tiempos} onCambiar={setTiempos} />
              {tiempoProm !== null && (
                <div className="text-xs text-slate-600">Tiempo promedio: {tiempoProm.toFixed(2)} s</div>
              )}

              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="mb-2 text-xs font-semibold uppercase text-slate-700 dark:text-slate-400">Sección alta</div>
                <label className="mb-2 block text-sm">
                  <span className="mb-1 block text-slate-600 dark:text-slate-300">Ancho (m)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={anchoAltaM}
                    onChange={(e) => setAnchoAltaM(e.target.value)}
                    className={`${inputClass} w-full`}
                  />
                </label>
                <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                  Profundidades (m) — {PROFUNDIDADES_POR_SECCION} medidas
                </span>
                <div className="grid grid-cols-5 gap-1.5">
                  {profundidadesAltaM.map((v, i) => (
                    <input
                      key={i}
                      type="number"
                      step="0.01"
                      value={v}
                      onChange={(e) =>
                        setProfundidadesAltaM(profundidadesAltaM.map((x, j) => (j === i ? e.target.value : x)))
                      }
                      className={`${inputClass} w-full px-1.5`}
                    />
                  ))}
                </div>
                {(profAltaProm !== null || areaAltaM2 !== null) && (
                  <div className="mt-1.5 text-xs text-slate-600">
                    {profAltaProm !== null && `Prof. promedio: ${profAltaProm.toFixed(3)} m`}
                    {areaAltaM2 !== null && ` · Área: ${areaAltaM2.toFixed(3)} m²`}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="mb-2 text-xs font-semibold uppercase text-slate-700 dark:text-slate-400">Sección baja</div>
                <label className="mb-2 block text-sm">
                  <span className="mb-1 block text-slate-600 dark:text-slate-300">Ancho (m)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={anchoBajaM}
                    onChange={(e) => setAnchoBajaM(e.target.value)}
                    className={`${inputClass} w-full`}
                  />
                </label>
                <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                  Profundidades (m) — {PROFUNDIDADES_POR_SECCION} medidas
                </span>
                <div className="grid grid-cols-5 gap-1.5">
                  {profundidadesBajaM.map((v, i) => (
                    <input
                      key={i}
                      type="number"
                      step="0.01"
                      value={v}
                      onChange={(e) =>
                        setProfundidadesBajaM(profundidadesBajaM.map((x, j) => (j === i ? e.target.value : x)))
                      }
                      className={`${inputClass} w-full px-1.5`}
                    />
                  ))}
                </div>
                {(profBajaProm !== null || areaBajaM2 !== null) && (
                  <div className="mt-1.5 text-xs text-slate-600">
                    {profBajaProm !== null && `Prof. promedio: ${profBajaProm.toFixed(3)} m`}
                    {areaBajaM2 !== null && ` · Área: ${areaBajaM2.toFixed(3)} m²`}
                  </div>
                )}
              </div>

              {areaM2 !== null && <div className="text-xs text-slate-600">Área promedio final: {areaM2.toFixed(3)} m²</div>}
            </div>
          )}

          <div className="space-y-1 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">
            {metodo === "flotador" && (
              <div>Velocidad superficial: {velocidadMs !== null ? `${velocidadMs.toFixed(3)} m/s` : "—"}</div>
            )}
            <div>Caudal calculado: {caudalLps !== null ? `${caudalLps.toFixed(2)} L/s` : "—"}</div>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Observaciones</span>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
              className={`${inputClass} w-full`}
            />
          </label>

          <div>
            <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">Foto (opcional)</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCamaraAbierta(true)}
                className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:border-brand-500/30 dark:text-brand-400 dark:hover:bg-brand-500/10"
              >
                <Camera className="h-3.5 w-3.5" />
                {foto ? foto.name : "Tomar foto"}
              </button>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                Elegir de la galería
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const archivo = e.target.files?.[0];
                    setFoto(archivo ? await comprimirFoto(archivo) : null);
                  }}
                />
              </label>
            </div>
          </div>

          <button
            onClick={marcarUbicacion}
            disabled={ubicando}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            {ubicando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
            {ubicacion.latitud ? "Ubicación capturada" : "Marcar ubicación GPS"}
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            onClick={() => pedirConfirmacion("¿Deseas guardar los cambios?", guardar, { textoConfirmar: "Guardar", variante: "normal" })}
            disabled={guardando || !puntoAforoId || caudalLps === null}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      {camaraAbierta && (
        <CamaraModal
          onCapturar={(file) => {
            setFoto(file);
            setCamaraAbierta(false);
          }}
          onCancelar={() => setCamaraAbierta(false)}
        />
      )}
    </div>
  );
}
