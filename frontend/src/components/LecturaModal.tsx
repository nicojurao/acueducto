import { useState } from "react";
import { X, Camera, AlertCircle, CheckCircle2, Pencil, Trash2, MapPin, Loader2, CloudOff } from "lucide-react";
import { api, urlFoto, LecturaPendiente } from "../api/client";
import { useConfirm, useErrorHandler } from "./ConfirmModal";
import CamaraModal from "./CamaraModal";
import NovedadDetailModal from "./NovedadDetailModal";
import { useAuth } from "../contexts/AuthContext";
import { PendienteLectura, agregarPendiente, eliminarPendiente, agregarPendienteNovedad } from "../lib/offlineQueue";
import { comprimirFoto, comprimirFotos } from "../lib/comprimirImagen";

function esErrorDeRed(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof DOMException && err.name === "AbortError");
}

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500";

// Intenta obtener la ubicación GPS del dispositivo; si no hay permiso o no está disponible,
// la lectura se guarda igual, solo sin coordenadas.
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

type Lectura = NonNullable<LecturaPendiente["lectura"]>;
type Novedad = NonNullable<LecturaPendiente["novedad"]>;

export default function LecturaModal({
  fila,
  periodo,
  pendienteOffline,
  onClose,
  onCambio,
}: {
  fila: LecturaPendiente;
  periodo: string;
  pendienteOffline?: PendienteLectura;
  onClose: () => void;
  onCambio: () => void;
}) {
  const [lectura, setLectura] = useState<Lectura | null>(fila.lectura);
  const [novedad, setNovedad] = useState<Novedad | null>(fila.novedad);
  const [pendiente, setPendiente] = useState<PendienteLectura | null>(pendienteOffline ?? null);
  const [editando, setEditando] = useState(false);
  const [modoNovedad, setModoNovedad] = useState(false);
  const [editandoNovedad, setEditandoNovedad] = useState(false);

  const [valorTexto, setValorTexto] = useState(lectura?.valorLectura ?? "");
  const [foto, setFoto] = useState<File | null>(null);
  const [quitarFoto, setQuitarFoto] = useState(false);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [obteniendoUbicacion, setObteniendoUbicacion] = useState(false);
  const [avisoGuardado, setAvisoGuardado] = useState<string | null>(null);

  function mostrarAvisoGuardado(mensaje: string) {
    setAvisoGuardado(mensaje);
    setTimeout(() => setAvisoGuardado(null), 2000);
  }

  const [motivo, setMotivo] = useState("");
  const [fotosNovedad, setFotosNovedad] = useState<File[]>([]);

  const { error, run } = useErrorHandler();
  const { pedirConfirmacion, modal: modalConfirmacion } = useConfirm();
  const { usuario } = useAuth();

  const anterior = Number(fila.lecturaAnteriorValor ?? 0);
  const consumoPreview = valorTexto !== "" ? Number(valorTexto) - anterior : null;

  async function guardarLectura() {
    const valor = Number(valorTexto);
    if (!Number.isFinite(valor)) return;
    if (!lectura && !foto) return;

    setGuardando(true);
    try {
      if (lectura) {
        await run(async () => {
          const actualizada = await api.lecturas.update(lectura.id, {
            valorLectura: valor,
            foto: foto ?? undefined,
            quitarFoto: quitarFoto && !foto,
          });
          setLectura({ ...lectura, valorLectura: String(valor), fotoUrl: actualizada.fotoUrl });
          setFoto(null);
          setQuitarFoto(false);
          setEditando(false);
          mostrarAvisoGuardado("✓ Lectura actualizada");
          onCambio();
        });
      } else {
        setObteniendoUbicacion(true);
        const { latitud, longitud } = await obtenerUbicacion();
        setObteniendoUbicacion(false);
        try {
          const nueva = await api.lecturas.create({
            medidorId: fila.medidorId,
            periodo,
            valorLectura: valor,
            foto: foto!,
            latitud,
            longitud,
          });
          setLectura({
            id: nueva.id,
            valorLectura: String(valor),
            consumo: String(valor - anterior),
            observaciones: null,
            fotoUrl: nueva.fotoUrl,
            capturadoPor: usuario ? { nombre: usuario.nombre } : null,
          });
          setNovedad(null);
          setFoto(null);
          mostrarAvisoGuardado("✓ Lectura guardada");
          onCambio();
        } catch (err) {
          if (!esErrorDeRed(err)) throw err;
          // Sin conexión: se guarda en el dispositivo y se sincroniza sola más adelante
          // (ver frontend/src/lib/offlineQueue.ts).
          const id = await agregarPendiente({
            medidorId: fila.medidorId,
            periodo,
            valorLectura: valor,
            fotoBlob: foto!,
            fotoNombre: foto!.name,
            latitud,
            longitud,
            suscriptor: { nombre: fila.suscriptor.nombre, codigo: fila.suscriptor.codigo, ruta: fila.suscriptor.ruta },
          });
          setPendiente({
            id,
            medidorId: fila.medidorId,
            periodo,
            valorLectura: valor,
            fotoBlob: foto!,
            fotoNombre: foto!.name,
            latitud,
            longitud,
            suscriptor: { nombre: fila.suscriptor.nombre, codigo: fila.suscriptor.codigo, ruta: fila.suscriptor.ruta },
            creadoEn: new Date().toISOString(),
          });
          setFoto(null);
          mostrarAvisoGuardado("✓ Guardada en el dispositivo, se subirá al recuperar conexión");
          onCambio();
        }
      }
    } finally {
      setGuardando(false);
    }
  }

  function descartarPendiente() {
    if (!pendiente) return;
    pedirConfirmacion("¿Descartar esta lectura guardada en el dispositivo? No se subirá.", () =>
      run(async () => {
        await eliminarPendiente(pendiente.id);
        setPendiente(null);
        onCambio();
      })
    );
  }

  function eliminarLectura() {
    if (!lectura) return;
    pedirConfirmacion("¿Borrar esta lectura capturada? El medidor volverá a quedar pendiente este mes.", () =>
      run(async () => {
        await api.lecturas.remove(lectura.id);
        setLectura(null);
        setValorTexto("");
        onCambio();
      })
    );
  }

  async function guardarNovedad() {
    const m = motivo.trim();
    if (!m) return;
    setGuardando(true);
    try {
      const nueva = await api.lecturas.marcarNovedad({
        medidorId: fila.medidorId,
        periodo,
        motivo: m,
        fotos: fotosNovedad,
      });
      setNovedad(nueva);
      setModoNovedad(false);
      setMotivo("");
      setFotosNovedad([]);
      mostrarAvisoGuardado("✓ Novedad guardada");
      onCambio();
    } catch (err) {
      if (!esErrorDeRed(err)) {
        await run(async () => {
          throw err;
        });
        setGuardando(false);
        return;
      }
      // Sin conexión: se guarda en el dispositivo y se sincroniza sola más adelante
      // (ver frontend/src/lib/offlineQueue.ts).
      await agregarPendienteNovedad({
        medidorId: fila.medidorId,
        periodo,
        motivo: m,
        fotos: fotosNovedad.map((f) => ({ blob: f, nombre: f.name })),
        suscriptor: { nombre: fila.suscriptor.nombre, codigo: fila.suscriptor.codigo, ruta: fila.suscriptor.ruta },
      });
      setModoNovedad(false);
      setMotivo("");
      setFotosNovedad([]);
      mostrarAvisoGuardado("✓ Guardada en el dispositivo, se subirá al recuperar conexión");
      onCambio();
    }
    setGuardando(false);
  }

  function quitarNovedad() {
    if (!novedad) return;
    pedirConfirmacion("¿Quitar esta novedad? El medidor volverá a quedar pendiente este mes.", () =>
      run(async () => {
        await api.lecturas.quitarNovedad(novedad.id);
        setNovedad(null);
        onCambio();
      })
    );
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 animate-fade-in p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl bg-white animate-scale-in shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold">{fila.suscriptor.nombre}</h2>
            <p className="text-xs text-slate-700 dark:text-slate-400">
              NUID {fila.suscriptor.codigo} · Ruta {fila.suscriptor.ruta ?? "-"} · {periodo}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {modalConfirmacion}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </div>
          )}
          {avisoGuardado && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
              {avisoGuardado}
            </div>
          )}

          <p className="text-xs text-slate-700 dark:text-slate-400">
            Lectura anterior: <strong className="text-slate-700 dark:text-slate-200">{fila.lecturaAnteriorValor ?? "-"}</strong>
          </p>

          {pendiente ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-3 text-sm text-sky-700 dark:bg-sky-500/10 dark:text-sky-400">
                <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium">Guardada en este dispositivo: {pendiente.valorLectura}</div>
                  <div className="text-xs opacity-80">Se subirá sola cuando haya señal.</div>
                </div>
              </div>
              <button
                onClick={descartarPendiente}
                className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Descartar
              </button>
            </div>
          ) : novedad ? (
            <div className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
              <div className="flex items-start justify-between gap-2">
                <span className="flex items-start gap-1.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  Sin lectura este mes: {novedad.motivo}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs font-medium">
                  <button onClick={() => setEditandoNovedad(true)} className="hover:underline">
                    Editar
                  </button>
                  <button onClick={quitarNovedad} className="hover:underline">
                    Quitar
                  </button>
                </span>
              </div>
              {novedad.fotos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {novedad.fotos.map((f) => (
                    <a key={f} href={urlFoto(f)} target="_blank" rel="noreferrer">
                      <img
                        src={urlFoto(f)}
                        alt="Foto de la novedad"
                        style={{ width: 56, height: 56, objectFit: "cover" }}
                        className="rounded-lg border border-red-200 dark:border-red-500/30"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : lectura && !editando ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium">
                    Lectura registrada: {lectura.valorLectura} (consumo {lectura.consumo} m³)
                  </div>
                  {lectura.capturadoPor && <div className="text-xs opacity-80">Tomada por: {lectura.capturadoPor.nombre}</div>}
                </div>
              </div>

              {lectura.fotoUrl && (
                <a href={urlFoto(lectura.fotoUrl)} target="_blank" rel="noreferrer">
                  <img
                    src={urlFoto(lectura.fotoUrl)}
                    alt="Foto de la lectura"
                    style={{ width: 96, height: 96, objectFit: "cover" }}
                    className="rounded-lg border border-slate-200 dark:border-slate-700"
                  />
                </a>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setValorTexto(lectura.valorLectura);
                    setQuitarFoto(false);
                    setEditando(true);
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Corregir
                </button>
                <button
                  onClick={eliminarLectura}
                  className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Borrar
                </button>
              </div>
            </div>
          ) : modoNovedad ? (
            <div className="space-y-2">
              <textarea
                placeholder="Motivo (ej. predio cerrado, medidor dañado)"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className={`${inputClass} w-full`}
                rows={2}
              />
              <label className="flex w-fit cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                <Camera className="h-3.5 w-3.5" />
                {fotosNovedad.length > 0 ? `${fotosNovedad.length} foto(s) seleccionada(s)` : "Agregar foto (opcional)"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={async (e) => setFotosNovedad(await comprimirFotos(Array.from(e.target.files ?? [])))}
                />
              </label>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() =>
                    pedirConfirmacion("¿Deseas guardar esta novedad?", guardarNovedad, {
                      textoConfirmar: "Guardar",
                      variante: "normal",
                    })
                  }
                  disabled={guardando || !motivo.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {guardando ? "Guardando..." : "Registrar novedad"}
                </button>
                <button
                  onClick={() => setModoNovedad(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Lectura nueva"
                  value={valorTexto}
                  onChange={(e) => setValorTexto(e.target.value)}
                  className={`${inputClass} w-full`}
                />
                <button
                  onClick={() =>
                    pedirConfirmacion("¿Deseas guardar esta lectura?", guardarLectura, {
                      textoConfirmar: "Guardar",
                      variante: "normal",
                    })
                  }
                  disabled={guardando || valorTexto === "" || (!lectura && !foto)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
                >
                  {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {guardando ? "Guardando..." : "Guardar"}
                </button>
              </div>
              {guardando && (
                <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full w-1/3 animate-[barra_1.1s_ease-in-out_infinite] rounded-full bg-brand-500" />
                </div>
              )}
              {consumoPreview !== null && Number.isFinite(consumoPreview) && (
                <p className="text-xs text-slate-700 dark:text-slate-400">Consumo: {consumoPreview} m³</p>
              )}

              {lectura && editando && usuario?.rol.nombre === "admin" && lectura.fotoUrl && !foto && (
                <div className="flex items-center gap-2">
                  {!quitarFoto ? (
                    <>
                      <img
                        src={urlFoto(lectura.fotoUrl)}
                        alt="Foto actual de la lectura"
                        style={{ width: 40, height: 40, objectFit: "cover" }}
                        className="rounded-lg border border-slate-200 dark:border-slate-700"
                      />
                      <button
                        type="button"
                        onClick={() => setQuitarFoto(true)}
                        className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Quitar foto (solo admin)
                      </button>
                    </>
                  ) : (
                    <p className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                      Se quitará la foto al guardar.
                      <button
                        type="button"
                        onClick={() => setQuitarFoto(false)}
                        className="font-medium text-slate-700 hover:text-slate-700 dark:text-slate-400"
                      >
                        Deshacer
                      </button>
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCamaraAbierta(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:border-brand-500/30 dark:text-brand-400 dark:hover:bg-brand-500/10"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {foto ? foto.name : lectura ? "Reemplazar foto (se subió mal)" : "Foto del medidor (obligatoria)"}
                </button>
                <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  Subir un archivo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const archivo = e.target.files?.[0];
                      setFoto(archivo ? await comprimirFoto(archivo) : null);
                      setQuitarFoto(false);
                    }}
                  />
                </label>
              </div>

              {obteniendoUbicacion && (
                <span className="flex items-center gap-1 text-xs text-slate-600">
                  <MapPin className="h-3 w-3 animate-pulse" />
                  Obteniendo ubicación...
                </span>
              )}

              {editando && (
                <button
                  onClick={() => {
                    setEditando(false);
                    setQuitarFoto(false);
                  }}
                  className="text-xs font-medium text-slate-600 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  Cancelar corrección
                </button>
              )}

              {!lectura && (
                <button
                  onClick={() => setModoNovedad(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  No se tomó lectura este mes
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {camaraAbierta && (
        <CamaraModal
          onCapturar={(file) => {
            setFoto(file);
            setQuitarFoto(false);
            setCamaraAbierta(false);
          }}
          onCancelar={() => setCamaraAbierta(false)}
        />
      )}

      {editandoNovedad && novedad && (
        <NovedadDetailModal
          novedadId={novedad.id}
          periodo={periodo}
          onClose={() => setEditandoNovedad(false)}
          onCambio={async () => {
            const actualizada = await api.lecturas.obtenerNovedad(novedad.id);
            setNovedad(actualizada);
            onCambio();
          }}
        />
      )}
    </div>
  );
}
