import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileEdit, MessageSquareWarning, ThumbsUp, Search, Droplets, ArrowRight, FileSearch, Ticket, Mail } from "lucide-react";

const OPCIONES = [
  {
    icon: FileEdit,
    color: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
    titulo: "Petición",
    texto: "Solicita información o un trámite relacionado con tu servicio.",
  },
  {
    icon: MessageSquareWarning,
    color: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
    titulo: "Queja o reclamo",
    texto: "Reporta un problema con el servicio, la facturación o la atención.",
  },
  {
    icon: ThumbsUp,
    color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
    titulo: "Sugerencia",
    texto: "Propón una mejora para el acueducto.",
  },
];

const PASOS = [
  {
    icon: FileEdit,
    titulo: "Radica tu caso",
    texto: "Cuéntanos qué pasó, con fotos si quieres agregarlas.",
  },
  {
    icon: Ticket,
    titulo: "Recibe tu número de radicado",
    texto: "Te lo damos al instante — guárdalo para hacerle seguimiento.",
  },
  {
    icon: Mail,
    titulo: "Te avisamos por correo",
    texto: "En cuanto tengamos una respuesta, o consúltala tú mismo cuando quieras.",
  },
];

export default function PqrsBienvenida() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  function consultar(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    navigate(`/consultar?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <div className="animate-content-in">
      <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-16">
        <div>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400 lg:mx-0">
            <Droplets className="h-8 w-8" />
          </div>
          <h1 className="mb-2 text-center text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl lg:text-left">
            ¿En qué podemos ayudarte?
          </h1>
          <p className="mx-auto mb-8 max-w-md text-center text-sm text-slate-600 dark:text-slate-400 lg:mx-0 lg:text-left">
            Este es el canal de Peticiones, Quejas, Reclamos y Sugerencias del Acueducto Comunitario Barrios Unidos
            de Mocoa.
          </p>

          <form onSubmit={consultar} className="mx-auto mb-2 max-w-lg lg:mx-0">
            <div className="group flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3.5 shadow-sm transition-shadow hover:shadow-md focus-within:border-brand-400 focus-within:shadow-md dark:border-slate-800 dark:bg-slate-900">
              <Search className="h-4 w-4 shrink-0 text-slate-400 group-focus-within:text-brand-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Consulta el estado de tu PQR por radicado o documento"
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
              />
            </div>
          </form>
          <p className="mb-8 text-center text-xs text-slate-500 dark:text-slate-500 lg:text-left">
            ¿Ya radicaste una PQR? Escribe tu número de radicado o tu documento arriba.
          </p>

          <Link
            to="/radicar"
            className="group flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 p-6 text-white shadow-md transition-all hover:scale-[1.01] hover:shadow-lg"
          >
            <div>
              <p className="text-lg font-bold">Radicar una PQR nueva</p>
              <p className="text-sm text-brand-100">Cuéntanos tu caso y te damos un número de radicado al instante.</p>
            </div>
            <ArrowRight className="h-6 w-6 shrink-0 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <FileSearch className="h-4 w-4 text-brand-500" />
            Cómo funciona
          </h2>
          <ol className="space-y-5">
            {PASOS.map(({ icon: Icon, titulo, texto }, i) => (
              <li key={titulo} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                  {i + 1}
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    <Icon className="h-3.5 w-3.5 text-slate-400" />
                    {titulo}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{texto}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="mb-8 mt-10 grid gap-3 sm:grid-cols-3 lg:mt-14">
        {OPCIONES.map(({ icon: Icon, color, titulo, texto }) => (
          <div
            key={titulo}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full ${color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{titulo}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">{texto}</p>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-slate-500 dark:text-slate-500">
        Al radicar te vamos a pedir tu número de documento (para completar tus datos si ya eres suscriptor) y un
        correo y celular de contacto.
      </p>
    </div>
  );
}
