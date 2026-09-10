import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, CheckCircle2, X, Camera, ArrowLeft, Loader2, FileDown } from "lucide-react";
import { pqrsPublicoApi, urlConstanciaPqr, PqrsTercero, CatalogoCausales, GrupoCausalPublico } from "./pqrsApi";
import { inputClass } from "../lib/ui";
import { comprimirFotos } from "../lib/comprimirImagen";

const MAX_FOTOS = 5;

export default function PqrsRadicarPage() {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [radicado, setRadicado] = useState<string | null>(null);

  // Paso 1: identificación
  const [documento, setDocumento] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [busquedaHecha, setBusquedaHecha] = useState(false);
  const [tercero, setTercero] = useState<PqrsTercero | null>(null);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [suscriptorId, setSuscriptorId] = useState("");

  // Paso 2: el caso
  const [descripcion, setDescripcion] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clasificación opcional — el ciudadano puede quedarse solo en la categoría general, o si
  // quiere, bajar hasta el detalle exacto. El staff la confirma o corrige de todas formas al
  // atenderla, así que no es obligatorio acertarle.
  const [catalogo, setCatalogo] = useState<CatalogoCausales | null>(null);
  const [causalElegida, setCausalElegida] = useState<GrupoCausalPublico | null>(null);
  const [detalleElegido, setDetalleElegido] = useState<number | null>(null);
  const [mostrarDetalle, setMostrarDetalle] = useState(false);

  useEffect(() => {
    pqrsPublicoApi.causales().then(setCatalogo).catch(() => {});
  }, []);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (!documento.trim()) return;
    setBuscando(true);
    setError(null);
    try {
      const t = await pqrsPublicoApi.buscarTercero(documento.trim());
      setTercero(t);
      setNombre(t.nombre);
      setEmail(t.email ?? "");
      setTelefono(t.telefono ?? "");
    } catch {
      // No encontrado — se sigue igual, la persona completa sus datos a mano más abajo.
      setTercero(null);
      setNombre("");
    } finally {
      setBusquedaHecha(true);
      setBuscando(false);
    }
  }

  function continuarSinBuscar() {
    setTercero(null);
    setBusquedaHecha(true);
  }

  function siguiente(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !email.trim() || !telefono.trim()) return;
    setPaso(2);
  }

  async function agregarFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const nuevas = await comprimirFotos(Array.from(e.target.files ?? []));
    setFotos((prev) => [...prev, ...nuevas].slice(0, MAX_FOTOS));
    e.target.value = "";
  }

  function quitarFoto(i: number) {
    setFotos((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!descripcion.trim()) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await pqrsPublicoApi.radicar({
        nombre: nombre.trim(),
        documento: documento.trim() || undefined,
        email: email.trim(),
        telefono: telefono.trim(),
        descripcion: descripcion.trim(),
        suscriptorId: suscriptorId ? Number(suscriptorId) : undefined,
        fotos,
        causal: causalElegida ?? undefined,
        detalleCausal: detalleElegido ?? undefined,
      });
      setRadicado(r.numeroRadicado);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo radicar la PQR. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (radicado) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-emerald-200 bg-white p-6 text-center shadow-sm dark:border-emerald-500/30 dark:bg-slate-900">
        <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
        <h1 className="mb-1 text-lg font-bold text-slate-900 dark:text-slate-100">PQR radicada con éxito</h1>
        <p className="mb-4 text-sm text-slate-700 dark:text-slate-400">
          Guarda este número — con él vas a poder hacerle seguimiento a tu caso.
        </p>
        <div className="mb-5 rounded-lg bg-emerald-50 px-4 py-3 text-2xl font-bold tracking-wide text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
          {radicado}
        </div>
        <a
          href={urlConstanciaPqr(radicado)}
          target="_blank"
          rel="noreferrer"
          className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-500"
        >
          <FileDown className="h-4 w-4" />
          Descargar constancia en PDF
        </a>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-500">
          Si la persona radicó su caso de forma verbal, esta constancia se le puede imprimir y entregar para que
          pueda hacerle seguimiento.
        </p>
        <Link to="/" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          Volver al inicio
        </Link>
      </div>
    );
  }

  const consejos =
    paso === 1
      ? {
          titulo: "¿Por qué pedimos esto?",
          items: [
            "Tu número de documento nos permite completar tus datos automáticamente si ya eres suscriptor.",
            "El correo y el celular son para poder contactarte y avisarte apenas tengamos una respuesta.",
          ],
        }
      : {
          titulo: "Consejos para tu descripción",
          items: [
            "Sé lo más específico posible: qué pasó, cuándo y dónde.",
            "Las fotos ayudan mucho — por ejemplo, de una fuga o de una factura con un error.",
          ],
        };

  return (
    <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-start lg:gap-14">
      <div>
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <h1 className="mb-4 text-xl font-bold text-slate-900 dark:text-slate-100">
          {paso === 1 ? "Tus datos" : "Cuéntanos tu caso"}
        </h1>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>
        )}

        {paso === 1 && (
        <div className="space-y-4">
          {!busquedaHecha && (
            <form onSubmit={buscar} className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Número de documento (cédula/NIT)
              </label>
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  placeholder="Ej. 1234567890"
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="submit"
                  disabled={buscando || !documento.trim()}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
                >
                  <Search className="h-4 w-4" />
                  {buscando ? "Buscando..." : "Buscar"}
                </button>
              </div>
              <button
                type="button"
                onClick={continuarSinBuscar}
                className="mt-2 text-xs text-slate-600 hover:underline dark:text-slate-400"
              >
                No tengo mi documento a la mano, continuar sin buscar
              </button>
            </form>
          )}

          {busquedaHecha && (
            <form onSubmit={siguiente} className="space-y-4">
              {tercero ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <p className="mb-1 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    Encontramos tu información
                  </p>
                  <p className="text-sm text-emerald-800 dark:text-emerald-300">{tercero.nombre}</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    {tercero.tipoDocumento} {tercero.numeroDocumento}
                    {tercero.direccion ? ` · ${tercero.direccion}` : ""}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setBusquedaHecha(false);
                      setDocumento("");
                    }}
                    className="mt-2 text-xs text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    No soy yo, buscar otro documento
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
                  <p className="mb-3 text-sm text-amber-800 dark:text-amber-300">
                    No encontramos ese documento registrado — no hay problema, completa tus datos abajo.
                  </p>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Nombre completo
                  </label>
                  <input
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className={`${inputClass} w-full`}
                  />
                </div>
              )}

              {tercero && tercero.suscriptores.length > 0 && (
                <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                  ¿Tu caso es sobre un predio/servicio en particular?
                  <select value={suscriptorId} onChange={(e) => setSuscriptorId(e.target.value)} className={inputClass}>
                    <option value="">No aplica a un predio en particular</option>
                    {tercero.suscriptores.map((s) => (
                      <option key={s.id} value={s.id}>
                        NUID {s.codigo} — {s.direccion ?? "sin dirección"}
                        {s.barrioCat ? ` (${s.barrioCat.nombre})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                Correo electrónico
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tucorreo@ejemplo.com"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                Número de celular
                <input
                  required
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="3001234567"
                  className={inputClass}
                />
              </label>

              <button
                type="submit"
                disabled={!nombre.trim() || !email.trim() || !telefono.trim()}
                className="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
              >
                Siguiente
              </button>
            </form>
          )}
        </div>
      )}

      {paso === 2 && (
        <form onSubmit={enviar} className="space-y-4">
          {catalogo && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                ¿Cuál describe mejor tu caso? (opcional)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(catalogo.grupos) as GrupoCausalPublico[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setCausalElegida(g);
                      setDetalleElegido(null);
                    }}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                      causalElegida === g
                        ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-400"
                        : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {catalogo.grupos[g]}
                  </button>
                ))}
              </div>

              {causalElegida && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setMostrarDetalle((v) => !v)}
                    className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {mostrarDetalle ? "Ocultar" : "¿Quieres ser más específico? (opcional)"}
                  </button>
                  {mostrarDetalle && (
                    <select
                      value={detalleElegido ?? ""}
                      onChange={(e) => setDetalleElegido(e.target.value ? Number(e.target.value) : null)}
                      className={`${inputClass} mt-2 w-full`}
                    >
                      <option value="">Prefiero no especificar</option>
                      {catalogo.detalles
                        .filter((d) => d.grupo === causalElegida)
                        .map((d) => (
                          <option key={d.codigo} value={d.codigo}>
                            {d.detalle}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}

          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
            Describe tu petición, queja, reclamo o sugerencia
            <textarea
              required
              rows={6}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Cuéntanos con el mayor detalle posible qué pasó..."
              className={`${inputClass} resize-none`}
            />
          </label>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
              <Camera className="h-4 w-4" />
              Fotos (opcional, máximo {MAX_FOTOS})
            </label>
            {fotos.length < MAX_FOTOS && (
              <input type="file" accept="image/*" multiple onChange={agregarFotos} className="block text-sm text-slate-600 dark:text-slate-400" />
            )}
            {fotos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {fotos.map((f, i) => (
                  <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
                    <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => quitarFoto(i)}
                      className="absolute right-0 top-0 rounded-bl-lg bg-black/60 p-0.5 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPaso(1)}
              className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Atrás
            </button>
            <button
              type="submit"
              disabled={enviando || !descripcion.trim()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              {enviando ? "Enviando..." : "Enviar PQR"}
            </button>
          </div>
        </form>
      )}
      </div>

      <div className="hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:block">
        <h2 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">{consejos.titulo}</h2>
        <ul className="space-y-3">
          {consejos.items.map((item) => (
            <li key={item} className="flex gap-2.5 text-sm text-slate-600 dark:text-slate-400">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
