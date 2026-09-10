import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Check, X as XIcon, Settings } from "lucide-react";
import { api, DetalleCausalSui, GrupoCausal } from "../api/client";
import { inputClass } from "../lib/ui";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "./ConfirmModal";

const GRUPO_LABELS: Record<GrupoCausal, string> = { F: "Facturación", P: "Prestación" };

// Panel de Parametrización del módulo de PQRS: el catálogo de causales del reporte SUI (antes
// fijo en código, ver lib/suiCausales.ts) y los tres encabezados que se anteponen a los correos
// que le llegan al ciudadano — radicación, respuesta/aclaración y cierre (ver lib/correo.ts) —
// todo editable sin necesitar un despliegue.
export default function ParametrizacionPqrPanel() {
  const { mostrar, mostrarError } = useToast();
  const { pedirConfirmacion, modal: modalConfirmar } = useConfirm();

  const [causales, setCausales] = useState<DetalleCausalSui[]>([]);
  const [cargando, setCargando] = useState(true);

  const [nuevoCodigo, setNuevoCodigo] = useState("");
  const [nuevoGrupo, setNuevoGrupo] = useState<GrupoCausal>("F");
  const [nuevoDetalle, setNuevoDetalle] = useState("");
  const [creando, setCreando] = useState(false);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editGrupo, setEditGrupo] = useState<GrupoCausal>("F");
  const [editDetalle, setEditDetalle] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // Un encabezado por cada momento en que el ciudadano recibe un correo — ver lib/correo.ts.
  const [encabezadoRadicacion, setEncabezadoRadicacion] = useState("");
  const [encabezadoRespuesta, setEncabezadoRespuesta] = useState("");
  const [encabezadoCierre, setEncabezadoCierre] = useState("");
  const [cargandoConfig, setCargandoConfig] = useState(true);
  const [guardandoEncabezados, setGuardandoEncabezados] = useState(false);

  function cargarCausales() {
    setCargando(true);
    api.pqrs
      .causalesSui()
      .then((c) => setCausales(c.detalles))
      .finally(() => setCargando(false));
  }
  useEffect(cargarCausales, []);

  useEffect(() => {
    setCargandoConfig(true);
    api.pqrs
      .configuracion()
      .then((c) => {
        setEncabezadoRadicacion(c.encabezadoRadicacion);
        setEncabezadoRespuesta(c.encabezadoRespuesta);
        setEncabezadoCierre(c.encabezadoCierre);
      })
      .finally(() => setCargandoConfig(false));
  }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const codigoNum = Number(nuevoCodigo);
    if (!codigoNum || !nuevoDetalle.trim()) return;
    setCreando(true);
    try {
      await api.pqrs.crearCausal({ codigo: codigoNum, grupo: nuevoGrupo, detalle: nuevoDetalle.trim() });
      setNuevoCodigo("");
      setNuevoDetalle("");
      cargarCausales();
      mostrar("Causal creada.", "exito");
    } catch (err) {
      mostrarError(err, "no se pudo crear la causal");
    } finally {
      setCreando(false);
    }
  }

  function empezarEdicion(c: DetalleCausalSui) {
    setEditandoId(c.id);
    setEditGrupo(c.grupo);
    setEditDetalle(c.detalle);
  }

  async function guardarEdicion(id: number) {
    if (!editDetalle.trim()) return;
    setGuardandoEdicion(true);
    try {
      await api.pqrs.editarCausal(id, { grupo: editGrupo, detalle: editDetalle.trim() });
      setEditandoId(null);
      cargarCausales();
      mostrar("Causal actualizada.", "exito");
    } catch (err) {
      mostrarError(err, "no se pudo actualizar la causal");
    } finally {
      setGuardandoEdicion(false);
    }
  }

  async function alternarActivo(c: DetalleCausalSui) {
    try {
      await api.pqrs.editarCausal(c.id, { activo: !c.activo });
      cargarCausales();
    } catch (err) {
      mostrarError(err, "no se pudo cambiar el estado de la causal");
    }
  }

  function eliminar(c: DetalleCausalSui) {
    pedirConfirmacion(
      `¿Eliminar la causal ${c.codigo} — "${c.detalle}"? Solo se puede si ninguna PQR la tiene asignada; si está en uso, desactívala en vez de borrarla.`,
      async () => {
        try {
          await api.pqrs.eliminarCausal(c.id);
          cargarCausales();
        } catch (err) {
          mostrarError(err, "no se pudo eliminar la causal");
          throw err;
        }
      },
      { textoConfirmar: "Eliminar", textoExito: "Causal eliminada", variante: "peligro" }
    );
  }

  async function guardarEncabezados() {
    setGuardandoEncabezados(true);
    try {
      await api.pqrs.actualizarConfiguracion({ encabezadoRadicacion, encabezadoRespuesta, encabezadoCierre });
      mostrar("Encabezados guardados.", "exito");
    } catch (err) {
      mostrarError(err, "no se pudieron guardar los encabezados");
    } finally {
      setGuardandoEncabezados(false);
    }
  }

  return (
    <>
      {modalConfirmar}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Causales del reporte SUI</h3>
          <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
            Código y grupo tal como los exige el Anexo A del SUI. Desactivar una causal la retira de los selectores
            (radicar público, clasificar interno) sin perder el histórico de las PQR que ya la tienen asignada.
          </p>

          <form onSubmit={crear} className="mb-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
              Código
              <input
                type="number"
                min={1}
                value={nuevoCodigo}
                onChange={(e) => setNuevoCodigo(e.target.value)}
                className={`${inputClass} w-20 text-xs`}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
              Grupo
              <select
                value={nuevoGrupo}
                onChange={(e) => setNuevoGrupo(e.target.value as GrupoCausal)}
                className={`${inputClass} text-xs`}
              >
                <option value="F">Facturación</option>
                <option value="P">Prestación</option>
              </select>
            </label>
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
              Detalle
              <input value={nuevoDetalle} onChange={(e) => setNuevoDetalle(e.target.value)} className={`${inputClass} text-xs`} />
            </label>
            <button
              type="submit"
              disabled={creando || !nuevoCodigo || !nuevoDetalle.trim()}
              className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar
            </button>
          </form>

          {cargando ? (
            <p className="text-sm text-slate-500 dark:text-slate-500">Cargando...</p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="px-2 py-1.5">Código</th>
                    <th className="px-2 py-1.5">Grupo</th>
                    <th className="px-2 py-1.5">Detalle</th>
                    <th className="px-2 py-1.5">Activa</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {causales.map((c) =>
                    editandoId === c.id ? (
                      <tr key={c.id}>
                        <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{c.codigo}</td>
                        <td className="px-2 py-1.5">
                          <select
                            value={editGrupo}
                            onChange={(e) => setEditGrupo(e.target.value as GrupoCausal)}
                            className={`${inputClass} py-0.5 text-xs`}
                          >
                            <option value="F">Facturación</option>
                            <option value="P">Prestación</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={editDetalle}
                            onChange={(e) => setEditDetalle(e.target.value)}
                            className={`${inputClass} py-0.5 text-xs`}
                          />
                        </td>
                        <td className="px-2 py-1.5" />
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <button
                            onClick={() => guardarEdicion(c.id)}
                            disabled={guardandoEdicion}
                            className="mr-1.5 text-emerald-600 hover:text-emerald-700 disabled:opacity-60 dark:text-emerald-400"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setEditandoId(null)} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                            <XIcon className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={c.id} className={c.activo ? "" : "opacity-50"}>
                        <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{c.codigo}</td>
                        <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{GRUPO_LABELS[c.grupo]}</td>
                        <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{c.detalle}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={c.activo}
                            onChange={() => alternarActivo(c)}
                            className="rounded border-slate-300 dark:border-slate-600"
                          />
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <button
                            onClick={() => empezarEdicion(c)}
                            className="mr-1.5 text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => eliminar(c)} className="text-slate-500 hover:text-red-600 dark:hover:text-red-400">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <Settings className="h-4 w-4 text-brand-500" />
            Encabezados de los correos al ciudadano
          </h3>
          <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
            Cada uno se antepone al correo del momento correspondiente. Déjalos vacíos para no mostrar ningún
            encabezado.
          </p>
          {cargandoConfig ? (
            <p className="text-sm text-slate-500 dark:text-slate-500">Cargando...</p>
          ) : (
            <>
              <label className="mb-3 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Radicación — cuando el ciudadano registra la PQR
                <textarea
                  rows={3}
                  value={encabezadoRadicacion}
                  onChange={(e) => setEncabezadoRadicacion(e.target.value)}
                  className={`${inputClass} mt-1 w-full resize-none text-sm`}
                />
              </label>
              <label className="mb-3 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Respuesta — cuando el funcionario deja una aclaración o actualización (sin cerrar el caso)
                <textarea
                  rows={3}
                  value={encabezadoRespuesta}
                  onChange={(e) => setEncabezadoRespuesta(e.target.value)}
                  className={`${inputClass} mt-1 w-full resize-none text-sm`}
                />
              </label>
              <label className="mb-3 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Cierre — cuando el funcionario marca la respuesta final (cierra el caso)
                <textarea
                  rows={3}
                  value={encabezadoCierre}
                  onChange={(e) => setEncabezadoCierre(e.target.value)}
                  className={`${inputClass} mt-1 w-full resize-none text-sm`}
                />
              </label>
              <button
                onClick={guardarEncabezados}
                disabled={guardandoEncabezados}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-60"
              >
                {guardandoEncabezados ? "Guardando..." : "Guardar encabezados"}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
