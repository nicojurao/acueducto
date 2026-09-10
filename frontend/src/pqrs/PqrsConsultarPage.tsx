import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, Loader2, FileSearch, Send, Paperclip, CheckCircle2, FileDown } from "lucide-react";
import { pqrsPublicoApi, urlConstanciaPqr, PqrConsulta, EstadoPqrPublico } from "./pqrsApi";
import { inputClass } from "../lib/ui";
import { comprimirFotos } from "../lib/comprimirImagen";

const ESTADO_LABELS: Record<EstadoPqrPublico, string> = {
  radicada: "Radicada",
  en_proceso: "En proceso",
  resuelta: "Resuelta",
  cerrada: "Cerrada",
};
const ESTADO_COLORS: Record<EstadoPqrPublico, string> = {
  radicada: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  en_proceso: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  resuelta: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  cerrada: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
};

function fmtFechaHora(fecha: string): string {
  return new Date(fecha).toLocaleString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ResultadoPqr({ pqr, onActualizar }: { pqr: PqrConsulta; onActualizar: (actualizado: PqrConsulta) => void }) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [documento, setDocumento] = useState("");
  const [texto, setTexto] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agregarArchivos(e: React.ChangeEvent<HTMLInputElement>) {
    const nuevos = await comprimirFotos(Array.from(e.target.files ?? []));
    setArchivos((prev) => [...prev, ...nuevos].slice(0, 5));
    e.target.value = "";
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!documento.trim() || !texto.trim() || !pqr.numeroRadicado) return;
    setEnviando(true);
    setError(null);
    try {
      const actualizado = await pqrsPublicoApi.responderMensaje(pqr.numeroRadicado, {
        documento: documento.trim(),
        texto: texto.trim(),
        archivos,
      });
      onActualizar(actualizado);
      setTexto("");
      setArchivos([]);
      setMostrarForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar tu mensaje. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-base font-bold text-slate-900 dark:text-slate-100">{pqr.numeroRadicado}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_COLORS[pqr.estado]}`}>
          {ESTADO_LABELS[pqr.estado]}
        </span>
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="text-xs text-slate-500 dark:text-slate-500">Radicada el {fmtFechaHora(pqr.createdAt)}</p>
        {pqr.numeroRadicado && (
          <a
            href={urlConstanciaPqr(pqr.numeroRadicado, pqr.updatedAt)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            <FileDown className="h-3 w-3" />
            Descargar constancia
          </a>
        )}
      </div>
      <p className="mb-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{pqr.descripcion}</p>

      {pqr.mensajes.length > 0 ? (
        <div className="mb-3 space-y-2">
          {pqr.mensajes.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg p-3 ${m.autor === "staff" ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-slate-50 dark:bg-slate-800"}`}
            >
              <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                  {m.autor === "staff" ? "Acueducto" : "Tú"}
                  {m.esRespuestaFinal && (
                    <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
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
                      href={a}
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
      ) : (
        <p className="mb-3 text-xs italic text-slate-500 dark:text-slate-500">Todavía no ha sido respondida.</p>
      )}

      {pqr.tieneDocumento && (
        <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
          {!mostrarForm ? (
            <button
              onClick={() => setMostrarForm(true)}
              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Responder / agregar información
            </button>
          ) : (
            <form onSubmit={enviar} className="space-y-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                Tu número de documento (para confirmar que eres tú)
                <input
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  placeholder="Cédula/NIT"
                  className={`${inputClass} text-sm`}
                />
              </label>
              <textarea
                rows={3}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escribe tu mensaje..."
                className={`${inputClass} w-full resize-none text-sm`}
              />
              <div>
                {archivos.length < 5 && (
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={agregarArchivos}
                    className="block text-xs text-slate-600 dark:text-slate-400"
                  />
                )}
                {archivos.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {archivos.map((f, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                        <span className="truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setArchivos((prev) => prev.filter((_, idx) => idx !== i))}
                          className="shrink-0 text-red-500 hover:underline"
                        >
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMostrarForm(false)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando || !documento.trim() || !texto.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-60"
                >
                  {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Enviar
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default function PqrsConsultarPage() {
  const [params] = useSearchParams();
  const qInicial = params.get("q") ?? "";
  const [q, setQ] = useState(qInicial);
  const [buscando, setBuscando] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultados, setResultados] = useState<PqrConsulta[]>([]);

  async function buscar(valor: string) {
    if (!valor.trim()) return;
    setBuscando(true);
    setError(null);
    try {
      const r = await pqrsPublicoApi.consultar(valor.trim());
      setResultados(r);
    } catch (err) {
      setResultados([]);
      setError(err instanceof Error ? err.message : "No se pudo consultar. Intenta de nuevo.");
    } finally {
      setBuscado(true);
      setBuscando(false);
    }
  }

  useEffect(() => {
    if (qInicial.trim()) buscar(qInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function alEnviar(e: React.FormEvent) {
    e.preventDefault();
    buscar(q);
  }

  function actualizarResultado(actualizado: PqrConsulta) {
    setResultados((prev) => prev.map((r) => (r.numeroRadicado === actualizado.numeroRadicado ? actualizado : r)));
  }

  return (
    <div>
      <div className="mx-auto max-w-2xl">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <h1 className="mb-1 text-xl font-bold text-slate-900 dark:text-slate-100">Consultar el estado de tu PQR</h1>
        <p className="mb-4 text-sm text-slate-700 dark:text-slate-400">
          Escribe tu número de radicado (ej. PQR-202609071) o tu número de documento para ver todas las PQR que has
          radicado.
        </p>

        <form onSubmit={alEnviar} className="mb-6 flex gap-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="PQR-202609071 o tu número de documento"
            className={`${inputClass} flex-1`}
          />
          <button
            type="submit"
            disabled={buscando || !q.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
          >
            {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Consultar
          </button>
        </form>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>
        )}

        {buscado && !error && resultados.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
            <FileSearch className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            <p className="text-sm text-slate-600 dark:text-slate-400">
              No encontramos ninguna PQR con ese dato. Revisa que el número de radicado o documento esté bien escrito.
            </p>
          </div>
        )}
      </div>

      <div className={`mx-auto grid gap-3 ${resultados.length > 1 ? "max-w-4xl lg:grid-cols-2" : "max-w-2xl"}`}>
        {resultados.map((p) => (
          <ResultadoPqr key={p.numeroRadicado} pqr={p} onActualizar={actualizarResultado} />
        ))}
      </div>
    </div>
  );
}
