import { useEffect, useState } from "react";
import { X, Send, Loader2, Tag, Paperclip, CheckCircle2, FileDown } from "lucide-react";
import { api, urlFoto, PqrResumen, EstadoPqr, GrupoCausal, CatalogoSui } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useCierreAnimado } from "../lib/useCierreAnimado";
import { inputClass } from "../lib/ui";
import { comprimirFotos } from "../lib/comprimirImagen";

function fmtFechaHora(fecha: string): string {
  return new Date(fecha).toLocaleString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ESTADO_LABELS: Record<EstadoPqr, string> = {
  radicada: "Radicada",
  en_proceso: "En proceso",
  resuelta: "Resuelta",
  cerrada: "Cerrada",
};
const ESTADO_COLORS: Record<EstadoPqr, string> = {
  radicada: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  en_proceso: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  resuelta: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  cerrada: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
};

export default function PqrDetalleModal({
  pqr: pqrInicial,
  onClose,
  onCambio,
}: {
  pqr: PqrResumen;
  onClose: () => void;
  onCambio: () => void;
}) {
  const { usuario } = useAuth();
  const puedeAvanzado = usuario?.permisos?.includes("pqrs_avanzado") ?? false;
  const { mostrar, mostrarError } = useToast();
  const { saliendo, cerrar } = useCierreAnimado(onClose);
  const [pqr, setPqr] = useState(pqrInicial);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  // Hilo de conversación: cada mensaje del funcionario puede ser solo una aclaración, o marcarse
  // como la respuesta final (ahí sí pide tipo de respuesta/notificación para el reporte SUI).
  const [mensajeTexto, setMensajeTexto] = useState("");
  const [mensajeArchivos, setMensajeArchivos] = useState<File[]>([]);
  const [esRespuestaFinal, setEsRespuestaFinal] = useState(false);
  const [tipoRespuesta, setTipoRespuesta] = useState("");
  const [tipoNotificacion, setTipoNotificacion] = useState("");
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);

  const [catalogo, setCatalogo] = useState<CatalogoSui | null>(null);
  const [tipoTramite, setTipoTramite] = useState(pqr.tipoTramite ? String(pqr.tipoTramite) : "");
  const [causal, setCausal] = useState<GrupoCausal | "">(pqr.causal ?? "");
  const [detalleCausal, setDetalleCausal] = useState(pqr.detalleCausal ? String(pqr.detalleCausal) : "");
  const [guardandoClasificacion, setGuardandoClasificacion] = useState(false);
  const [descargandoConstancia, setDescargandoConstancia] = useState(false);

  useEffect(() => {
    api.pqrs.causalesSui().then(setCatalogo).catch(() => {});
  }, []);

  async function cambiarEstado(nuevo: EstadoPqr) {
    setCambiandoEstado(true);
    try {
      const actualizada = await api.pqrs.cambiarEstado(pqr.id, nuevo);
      setPqr(actualizada);
      onCambio();
    } catch (err) {
      mostrarError(err, "no se pudo cambiar el estado");
    } finally {
      setCambiandoEstado(false);
    }
  }

  async function descargarConstancia() {
    setDescargandoConstancia(true);
    try {
      await api.pqrs.descargarConstancia(pqr.id);
    } catch (err) {
      mostrarError(err, "no se pudo descargar la constancia");
    } finally {
      setDescargandoConstancia(false);
    }
  }

  async function guardarClasificacion() {
    setGuardandoClasificacion(true);
    try {
      const actualizada = await api.pqrs.clasificar(pqr.id, {
        tipoTramite: tipoTramite ? Number(tipoTramite) : null,
        causal: causal || null,
        detalleCausal: detalleCausal ? Number(detalleCausal) : null,
      });
      setPqr(actualizada);
      mostrar("Clasificación guardada.", "exito");
      onCambio();
    } catch (err) {
      mostrarError(err, "no se pudo guardar la clasificación");
    } finally {
      setGuardandoClasificacion(false);
    }
  }

  async function enviarMensaje(e: React.FormEvent) {
    e.preventDefault();
    if (!mensajeTexto.trim()) return;
    if (esRespuestaFinal && (!tipoRespuesta || !tipoNotificacion)) return;
    setEnviandoMensaje(true);
    try {
      const actualizada = await api.pqrs.enviarMensaje(pqr.id, {
        texto: mensajeTexto.trim(),
        esRespuestaFinal,
        tipoRespuesta: esRespuestaFinal ? Number(tipoRespuesta) : undefined,
        tipoNotificacion: esRespuestaFinal ? Number(tipoNotificacion) : undefined,
        archivos: mensajeArchivos,
      });
      setPqr(actualizada);
      setMensajeTexto("");
      setMensajeArchivos([]);
      setEsRespuestaFinal(false);
      setTipoRespuesta("");
      setTipoNotificacion("");
      mostrar(esRespuestaFinal ? "Respuesta final guardada." : "Mensaje enviado.", "exito");
      onCambio();
    } catch (err) {
      mostrarError(err, "no se pudo enviar el mensaje");
    } finally {
      setEnviandoMensaje(false);
    }
  }

  async function agregarArchivosMensaje(e: React.ChangeEvent<HTMLInputElement>) {
    // comprimirFotos ignora en silencio lo que no sea imagen (PDF, Word, Excel) — este adjunto
    // acepta ambos tipos, así que solo las fotos pasan por la compresión.
    const nuevos = await comprimirFotos(Array.from(e.target.files ?? []));
    setMensajeArchivos((prev) => [...prev, ...nuevos].slice(0, 5));
    e.target.value = "";
  }

  const detallesDelGrupo = catalogo?.detalles.filter((d) => d.grupo === causal) ?? [];

  return (
    <div
      className={`fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 ${saliendo ? "animate-fade-out" : "animate-fade-in"}`}
      onClick={cerrar}
    >
      <div
        className={`flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl dark:bg-slate-900 ${saliendo ? "animate-scale-out" : "animate-scale-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{pqr.numeroRadicado ?? `PQR #${pqr.id}`}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={descargarConstancia}
              disabled={descargandoConstancia}
              title="Descargar constancia en PDF"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {descargandoConstancia ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Constancia
            </button>
            <button onClick={cerrar} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_COLORS[pqr.estado]}`}>
              {ESTADO_LABELS[pqr.estado]}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-500">
              Radicada el {fmtFechaHora(pqr.createdAt)}
            </span>
            {puedeAvanzado && (
              <select
                value={pqr.estado}
                disabled={cambiandoEstado}
                onChange={(e) => cambiarEstado(e.target.value as EstadoPqr)}
                className={`${inputClass} ml-auto w-40 py-1 text-xs`}
              >
                {Object.entries(ESTADO_LABELS).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Datos de contacto</h3>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-700 dark:text-slate-300">
              <span>
                <strong className="font-semibold">Nombre:</strong> {pqr.nombre}
              </span>
              {pqr.documento && (
                <span>
                  <strong className="font-semibold">Documento:</strong> {pqr.documento}
                </span>
              )}
              <span>
                <strong className="font-semibold">Correo:</strong> {pqr.email}
              </span>
              <span>
                <strong className="font-semibold">Celular:</strong> {pqr.telefono}
              </span>
            </div>
            {pqr.suscriptor && (
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                <strong className="font-semibold">Sobre el predio:</strong> NUID {pqr.suscriptor.codigo} —{" "}
                {pqr.suscriptor.direccion ?? "sin dirección"}
                {pqr.suscriptor.barrioCat ? ` (${pqr.suscriptor.barrioCat.nombre})` : ""}
              </p>
            )}
            {pqr.tercero && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                Vinculada al tercero {pqr.tercero.tipoDocumento} {pqr.tercero.numeroDocumento} — {pqr.tercero.nombre}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Descripción</h3>
            <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{pqr.descripcion}</p>
          </div>

          {pqr.fotos.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Fotos adjuntas</h3>
              <div className="flex flex-wrap gap-2">
                {pqr.fotos.map((foto, i) => (
                  <a key={i} href={urlFoto(foto)} target="_blank" rel="noreferrer">
                    <img
                      src={urlFoto(foto)}
                      alt=""
                      className="h-20 w-20 rounded-lg border border-slate-300 object-cover dark:border-slate-700"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <Tag className="h-4 w-4 text-brand-500" />
              Clasificación (reporte SUI)
            </h3>
            {puedeAvanzado ? (
              <div className="space-y-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <select value={tipoTramite} onChange={(e) => setTipoTramite(e.target.value)} className={`${inputClass} text-xs`}>
                    <option value="">Tipo de trámite...</option>
                    {catalogo &&
                      Object.entries(catalogo.tiposTramite).map(([codigo, texto]) => (
                        <option key={codigo} value={codigo}>
                          {texto}
                        </option>
                      ))}
                  </select>
                  <select
                    value={causal}
                    onChange={(e) => {
                      setCausal(e.target.value as GrupoCausal | "");
                      setDetalleCausal("");
                    }}
                    className={`${inputClass} text-xs`}
                  >
                    <option value="">Causal...</option>
                    <option value="F">Facturación</option>
                    <option value="P">Prestación</option>
                  </select>
                  <select
                    value={detalleCausal}
                    onChange={(e) => setDetalleCausal(e.target.value)}
                    disabled={!causal}
                    className={`${inputClass} text-xs`}
                  >
                    <option value="">Detalle de causal...</option>
                    {detallesDelGrupo.map((d) => (
                      <option key={d.codigo} value={d.codigo}>
                        {d.codigo} — {d.detalle}
                        {d.activo ? "" : " (inactiva)"}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={guardarClasificacion}
                  disabled={guardandoClasificacion}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {guardandoClasificacion ? "Guardando..." : "Guardar clasificación"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {pqr.tipoTramite && catalogo ? catalogo.tiposTramite[pqr.tipoTramite] : "Sin clasificar"}
                {pqr.detalleCausal && catalogo?.detalles.find((d) => d.codigo === pqr.detalleCausal)
                  ? ` — ${catalogo.detalles.find((d) => d.codigo === pqr.detalleCausal)!.detalle}`
                  : ""}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Conversación</h3>

            {pqr.mensajes.length === 0 ? (
              <p className="mb-2 text-sm text-slate-500 dark:text-slate-500">Todavía no hay mensajes.</p>
            ) : (
              <div className="mb-3 space-y-2.5">
                {pqr.mensajes.map((m, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-3 ${
                      m.autor === "staff"
                        ? "bg-brand-50 dark:bg-brand-500/10"
                        : "bg-slate-50 dark:bg-slate-800"
                    }`}
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                        {m.autor === "staff" ? (m.autorNombre ?? "Funcionario") : pqr.nombre}
                        {m.esRespuestaFinal && (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Respuesta final
                          </span>
                        )}
                      </span>
                      <span className="text-slate-500 dark:text-slate-500">{fmtFechaHora(m.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{m.texto}</p>
                    {m.archivos.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {m.archivos.map((a, j) => (
                          <a
                            key={j}
                            href={urlFoto(a)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                          >
                            <Paperclip className="h-3 w-3" />
                            Adjunto {j + 1}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {puedeAvanzado && (
              <form onSubmit={enviarMensaje} className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                <textarea
                  rows={3}
                  value={mensajeTexto}
                  onChange={(e) => setMensajeTexto(e.target.value)}
                  placeholder="Escribe una aclaración, actualización o la respuesta final..."
                  className={`${inputClass} w-full resize-none`}
                />
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <Paperclip className="h-3.5 w-3.5" />
                    Adjuntar imágenes o documentos (opcional, máximo 5)
                  </label>
                  {mensajeArchivos.length < 5 && (
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                      onChange={agregarArchivosMensaje}
                      className="block text-xs text-slate-600 dark:text-slate-400"
                    />
                  )}
                  {mensajeArchivos.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {mensajeArchivos.map((f, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                          <span className="truncate">{f.name}</span>
                          <button
                            type="button"
                            onClick={() => setMensajeArchivos((prev) => prev.filter((_, idx) => idx !== i))}
                            className="shrink-0 text-red-500 hover:underline"
                          >
                            Quitar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={esRespuestaFinal}
                    onChange={(e) => setEsRespuestaFinal(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600"
                  />
                  Marcar como respuesta final (cierra el caso y cuenta para el reporte SUI)
                </label>

                {esRespuestaFinal && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <select
                      value={tipoRespuesta}
                      onChange={(e) => setTipoRespuesta(e.target.value)}
                      required
                      className={`${inputClass} text-xs`}
                    >
                      <option value="">Tipo de respuesta... *</option>
                      {catalogo &&
                        Object.entries(catalogo.tiposRespuesta).map(([codigo, texto]) => (
                          <option key={codigo} value={codigo}>
                            {texto}
                          </option>
                        ))}
                    </select>
                    <select
                      value={tipoNotificacion}
                      onChange={(e) => setTipoNotificacion(e.target.value)}
                      required
                      className={`${inputClass} text-xs`}
                    >
                      <option value="">Tipo de notificación... *</option>
                      {catalogo &&
                        Object.entries(catalogo.tiposNotificacion).map(([codigo, texto]) => (
                          <option key={codigo} value={codigo}>
                            {texto}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <p className="text-xs text-slate-500 dark:text-slate-500">
                  Al guardar, se le avisa al ciudadano por correo{esRespuestaFinal ? " que su PQR ya tiene respuesta." : " que hay una actualización, y puede seguir escribiendo desde ese mismo enlace."}
                </p>

                <button
                  type="submit"
                  disabled={enviandoMensaje || !mensajeTexto.trim() || (esRespuestaFinal && (!tipoRespuesta || !tipoNotificacion))}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
                >
                  {enviandoMensaje ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {esRespuestaFinal ? "Enviar respuesta final" : "Enviar mensaje"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
