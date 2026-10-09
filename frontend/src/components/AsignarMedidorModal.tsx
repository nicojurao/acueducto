import { useEffect, useState } from "react";
import { X, Info, AlertTriangle, AlertCircle } from "lucide-react";
import { api, Medidor, MarcaMedidor, ModeloMedidor, Lote } from "../api/client";
import MedidorCombobox from "./MedidorCombobox";
import { DocumentoAdjunto, FotosAdjuntas } from "./Adjuntos";
import { useCierreAnimado } from "../lib/useCierreAnimado";
import { inputClass } from "../lib/ui";

export type FormMedidor = {
  serial: string;
  marcaId: string;
  modeloId: string;
  diametroId: string;
  loteId: string;
  fechaFabricacion: string;
  fechaCertificacion: string;
  certificado: string;
};

export type FormActa = {
  medidorId: string;
  fechaInstalacion: string;
  // El texto es solo lo que se manda al backend como fallback/registro; la selección real del
  // formulario se hace por usuarioId (ver comentario en actas.ts sobre por qué ya no se
  // relaciona por nombre — renombrar a alguien no debe mostrar "usuario inactivo/eliminado").
  instaladoPor: string;
  usuarioId: string;
  observaciones: string;
  fechaRetiro: string;
  // Lectura de fábrica con la que arranca el medidor al instalarse (varios ya traen 1 o 2 m³ de
  // fábrica/pruebas). Se guarda en Medidor.lecturaInicial y sirve de base para calcular el
  // consumo de la primera lectura real que se le tome.
  lecturaInicial: string;
};

// Un mismo formulario, tres tareas distintas — cada una muestra SOLO lo suyo:
//  · "asignar": instalar un medidor de bodega en el suscriptor (crea un acta nueva).
//  · "medidor": corregir el aparato (serial, marca, calibración y su acta de calibración).
//  · "acta":    corregir el registro de la instalación (fecha, instalador, acta firmada, fotos).
// Separarlas evita el formulario gigante que mezclaba datos del medidor con los de la instalación.
export type ModoFormularioMedidor = "asignar" | "medidor" | "acta";

// ── Bloques de presentación ──────────────────────────────────────────────────────────────────
// Todo campo lleva su etiqueta visible, y los avisos van en un recuadro con ícono, no como texto
// suelto.

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-slate-200 pt-5 first:border-t-0 first:pt-0 dark:border-slate-800">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{titulo}</h3>
      {children}
    </section>
  );
}

function Campo({ etiqueta, className = "", children }: { etiqueta: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 ${className}`}>
      {etiqueta}
      {children}
    </label>
  );
}

const ESTILOS_AVISO = {
  info: { caja: "bg-brand-50 text-brand-900 dark:bg-brand-500/10 dark:text-brand-100", Icono: Info },
  advertencia: { caja: "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100", Icono: AlertTriangle },
  error: { caja: "bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-200", Icono: AlertCircle },
} as const;

function Aviso({ tipo, titulo, children }: { tipo: keyof typeof ESTILOS_AVISO; titulo?: string; children: React.ReactNode }) {
  const { caja, Icono } = ESTILOS_AVISO[tipo];
  return (
    <div role={tipo === "error" ? "alert" : undefined} className={`flex gap-2.5 rounded-xl px-3.5 py-3 text-xs leading-relaxed ${caja}`}>
      <Icono className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {titulo && <div className="mb-0.5 text-sm font-semibold">{titulo}</div>}
        {children}
      </div>
    </div>
  );
}

export default function AsignarMedidorModal({
  modo,
  editandoMedidorId,
  editandoEsRetirado,
  editandoActaId,
  editandoActaCalibracionUrl,
  editandoActaFirmadaUrl,
  editandoDiametroActual,
  serialOriginal,
  formMedidor,
  setFormMedidor,
  formActa,
  setFormActa,
  marcas,
  modelos,
  lotes,
  medidoresBodega,
  instaladores,
  fotos,
  setFotos,
  fotosExistentes,
  quitarFotoExistente,
  fileInputRef,
  actaCalibracionArchivo,
  setActaCalibracionArchivo,
  quitarActaCalibracion,
  setQuitarActaCalibracion,
  actaFirmadaArchivo,
  setActaFirmadaArchivo,
  quitarActaFirmada,
  setQuitarActaFirmada,
  guardandoActa,
  onSubmit,
  onClose,
}: {
  modo: ModoFormularioMedidor;
  editandoMedidorId: number | null;
  editandoEsRetirado: boolean;
  editandoActaId: number | null;
  editandoActaCalibracionUrl: string | null;
  editandoActaFirmadaUrl: string | null;
  editandoDiametroActual: { id: number; valor: string } | null;
  // Serial que tenía el medidor al abrir la edición ("" al asignar uno nuevo).
  serialOriginal: string;
  formMedidor: FormMedidor;
  setFormMedidor: (f: FormMedidor) => void;
  formActa: FormActa;
  setFormActa: (f: FormActa) => void;
  marcas: MarcaMedidor[];
  modelos: ModeloMedidor[];
  lotes: Lote[];
  medidoresBodega: Medidor[];
  instaladores: { id: number; nombre: string; activo?: boolean }[];
  fotos: File[];
  setFotos: (f: File[]) => void;
  fotosExistentes: string[];
  quitarFotoExistente: (foto: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  actaCalibracionArchivo: File | null;
  setActaCalibracionArchivo: (f: File | null) => void;
  quitarActaCalibracion: boolean;
  setQuitarActaCalibracion: (v: boolean) => void;
  actaFirmadaArchivo: File | null;
  setActaFirmadaArchivo: (f: File | null) => void;
  quitarActaFirmada: boolean;
  setQuitarActaFirmada: (v: boolean) => void;
  guardandoActa: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}) {
  const { saliendo, cerrar } = useCierreAnimado(onClose);

  // Cambiar el serial de un medidor existente: se avisa para qué sirve (corregir un error de
  // digitación, no registrar un medidor físico distinto) y se verifica EN VIVO que el nuevo no lo
  // tenga ya otro medidor — antes solo se enteraba al guardar, con un error genérico.
  const serialNuevo = formMedidor.serial.trim();
  const serialCambiado = modo === "medidor" && !!editandoMedidorId && serialNuevo !== "" && serialNuevo !== serialOriginal.trim();
  const [estadoSerial, setEstadoSerial] = useState<"ok" | "revisando" | "duplicado">("ok");
  useEffect(() => {
    if (!serialCambiado || !editandoMedidorId) {
      setEstadoSerial("ok");
      return;
    }
    setEstadoSerial("revisando");
    let vigente = true;
    const espera = setTimeout(async () => {
      try {
        const { disponible } = await api.medidores.serialDisponible(serialNuevo, editandoMedidorId);
        if (vigente) setEstadoSerial(disponible ? "ok" : "duplicado");
      } catch {
        // Sin conexión u otro fallo: no se bloquea el formulario; el servidor igual lo valida al guardar.
        if (vigente) setEstadoSerial("ok");
      }
    }, 400);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [serialCambiado, serialNuevo, editandoMedidorId]);

  const titulo = modo === "asignar" ? "Asignar medidor" : modo === "medidor" ? "Editar medidor" : "Acta de instalación";
  const textoGuardar =
    modo === "asignar" ? "Registrar instalación" : modo === "acta" && !editandoActaId ? "Crear acta" : "Guardar";
  const modelosDeLaMarca = modelos.filter((mo) => String(mo.marcaId) === formMedidor.marcaId);
  const diametrosDelModelo = modelos.find((mo) => String(mo.id) === formMedidor.modeloId)?.diametros ?? [];

  return (
    <div
      className={`fixed inset-0 z-[2100] flex items-center justify-center bg-black/50 p-4 ${saliendo ? "animate-fade-out" : "animate-fade-in"}`}
      onClick={cerrar}
    >
      <div
        className={`flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900 ${saliendo ? "animate-scale-out" : "animate-scale-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 px-6 pb-3 pt-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{titulo}</h2>
              {modo === "acta" && serialOriginal && (
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">Medidor {serialOriginal}</p>
              )}
            </div>
            {modo !== "asignar" && (
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  editandoEsRetirado
                    ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                }`}
              >
                {editandoEsRetirado ? "Retirado" : "Instalado"}
              </span>
            )}
          </div>
          <button onClick={cerrar} aria-label="Cerrar" className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </header>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto border-y border-slate-200 px-6 py-5 dark:border-slate-800">
            {modo === "medidor" && (
              <>
                <Seccion titulo="Medidor">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Campo etiqueta="Serial *">
                      <input
                        value={formMedidor.serial}
                        onChange={(e) => setFormMedidor({ ...formMedidor, serial: e.target.value })}
                        className={inputClass}
                        required
                      />
                    </Campo>
                    <Campo etiqueta="Marca *">
                      <select
                        value={formMedidor.marcaId}
                        onChange={(e) =>
                          setFormMedidor({ ...formMedidor, marcaId: e.target.value, modeloId: "", diametroId: "" })
                        }
                        className={inputClass}
                        required
                      >
                        <option value="" disabled hidden>
                          Seleccionar...
                        </option>
                        {marcas.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nombre}
                          </option>
                        ))}
                      </select>
                    </Campo>
                    <Campo etiqueta="Modelo *">
                      <select
                        value={formMedidor.modeloId}
                        onChange={(e) => setFormMedidor({ ...formMedidor, modeloId: e.target.value, diametroId: "" })}
                        className={inputClass}
                        disabled={!formMedidor.marcaId}
                        required
                      >
                        <option value="" disabled hidden>
                          Seleccionar...
                        </option>
                        {modelosDeLaMarca.map((mo) => (
                          <option key={mo.id} value={mo.id}>
                            {mo.nombre}
                          </option>
                        ))}
                      </select>
                    </Campo>
                    <Campo etiqueta="Diámetro *">
                      <select
                        value={formMedidor.diametroId}
                        onChange={(e) => setFormMedidor({ ...formMedidor, diametroId: e.target.value })}
                        className={inputClass}
                        disabled={!formMedidor.modeloId}
                        required
                      >
                        <option value="" disabled hidden>
                          Seleccionar...
                        </option>
                        {diametrosDelModelo.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.valor}
                          </option>
                        ))}
                        {editandoDiametroActual &&
                          String(editandoDiametroActual.id) === formMedidor.diametroId &&
                          !diametrosDelModelo.some((d) => d.id === editandoDiametroActual.id) && (
                            <option value={editandoDiametroActual.id}>
                              {editandoDiametroActual.valor} (no vinculado a este modelo en el catálogo)
                            </option>
                          )}
                      </select>
                    </Campo>
                    <Campo etiqueta="Lote">
                      <select
                        value={formMedidor.loteId}
                        onChange={(e) => setFormMedidor({ ...formMedidor, loteId: e.target.value })}
                        className={inputClass}
                      >
                        <option value="">Sin lote</option>
                        {lotes.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.serialInicial}-{l.serialFinal}
                          </option>
                        ))}
                      </select>
                    </Campo>
                    <Campo etiqueta="Lectura inicial (m³) *">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={formActa.lecturaInicial}
                        onChange={(e) => setFormActa({ ...formActa, lecturaInicial: e.target.value })}
                        className={inputClass}
                        required
                      />
                      <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        Valor de fábrica; 0 si empieza en 0.
                      </span>
                    </Campo>
                  </div>

                  {serialCambiado && estadoSerial === "duplicado" && (
                    <Aviso tipo="error" titulo="Ese serial ya está en uso">
                      Otro medidor ya tiene el serial «{serialNuevo}». Elige uno distinto para poder guardar.
                    </Aviso>
                  )}
                  {serialCambiado && estadoSerial !== "duplicado" && (
                    <Aviso tipo="advertencia" titulo="Estás cambiando el serial">
                      Hazlo solo para corregir un error de digitación: las actas de este medidor se actualizan con el serial
                      nuevo. Si en el predio instalaron <strong>otro medidor físico</strong>, no lo cambies aquí; usa «Reemplazar
                      medidor» para que cada uno conserve sus lecturas.
                    </Aviso>
                  )}
                </Seccion>

                <Seccion titulo="Calibración">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Campo etiqueta="Fecha de fabricación *">
                      <input
                        type="date"
                        value={formMedidor.fechaFabricacion}
                        onChange={(e) => setFormMedidor({ ...formMedidor, fechaFabricacion: e.target.value })}
                        className={inputClass}
                        required
                      />
                    </Campo>
                    <Campo etiqueta="Fecha de calibración *">
                      <input
                        type="date"
                        value={formMedidor.fechaCertificacion}
                        onChange={(e) => setFormMedidor({ ...formMedidor, fechaCertificacion: e.target.value })}
                        className={inputClass}
                        required
                      />
                    </Campo>
                    <Campo etiqueta="N° de certificado *">
                      <input
                        value={formMedidor.certificado}
                        onChange={(e) => setFormMedidor({ ...formMedidor, certificado: e.target.value })}
                        className={inputClass}
                        required
                      />
                    </Campo>
                  </div>
                  <DocumentoAdjunto
                    titulo="Acta de calibración"
                    urlActual={editandoActaCalibracionUrl}
                    archivoNuevo={actaCalibracionArchivo}
                    onArchivoNuevo={setActaCalibracionArchivo}
                    quitar={quitarActaCalibracion}
                    onQuitar={setQuitarActaCalibracion}
                  />
                </Seccion>
              </>
            )}

            {modo === "asignar" && (
              <Seccion titulo="Medidor">
                <div className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                  Medidor disponible en bodega
                  <MedidorCombobox
                    medidores={medidoresBodega}
                    value={formActa.medidorId}
                    onChange={(id) => setFormActa({ ...formActa, medidorId: id })}
                  />
                </div>
              </Seccion>
            )}

            {modo !== "medidor" && (
            <Seccion titulo="Instalación">
              {modo === "acta" && !editandoActaId && (
                <Aviso tipo="info" titulo="Este medidor aún no tiene acta de instalación">
                  Completa la fecha y quién lo instaló para crearla. Si ya tienes el acta firmada, adjúntala abajo.
                </Aviso>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Campo etiqueta="Fecha de instalación *">
                  <input
                    type="date"
                    value={formActa.fechaInstalacion}
                    onChange={(e) => setFormActa({ ...formActa, fechaInstalacion: e.target.value })}
                    className={inputClass}
                    required
                  />
                </Campo>
                <Campo etiqueta="Instalado por *">
                  <select
                    value={formActa.usuarioId}
                    onChange={(e) => setFormActa({ ...formActa, usuarioId: e.target.value })}
                    className={inputClass}
                    required
                  >
                    <option value="">Seleccionar...</option>
                    {instaladores.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                        {u.activo === false ? " (inactivo)" : ""}
                      </option>
                    ))}
                  </select>
                </Campo>
                {modo === "acta" && editandoEsRetirado && (
                  <Campo etiqueta="Fecha de retiro *">
                    <input
                      type="date"
                      value={formActa.fechaRetiro}
                      onChange={(e) => setFormActa({ ...formActa, fechaRetiro: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </Campo>
                )}
                <Campo etiqueta="Observaciones" className="sm:col-span-2">
                  <textarea
                    rows={2}
                    placeholder="Opcional"
                    value={formActa.observaciones}
                    onChange={(e) => setFormActa({ ...formActa, observaciones: e.target.value })}
                    className={`${inputClass} resize-y`}
                  />
                </Campo>
              </div>
            </Seccion>
            )}

            {modo !== "medidor" && (
            <Seccion titulo={modo === "acta" ? "Documentos y fotos" : "Evidencia (opcional)"}>
              <div className="space-y-3">
                {modo === "acta" && (
                  <DocumentoAdjunto
                    titulo="Acta de instalación firmada"
                    urlActual={editandoActaFirmadaUrl}
                    archivoNuevo={actaFirmadaArchivo}
                    onArchivoNuevo={setActaFirmadaArchivo}
                    quitar={quitarActaFirmada}
                    onQuitar={setQuitarActaFirmada}
                  />
                )}
                <FotosAdjuntas
                  existentes={fotosExistentes}
                  onQuitarExistente={quitarFotoExistente}
                  nuevas={fotos}
                  onNuevas={setFotos}
                  inputRef={fileInputRef}
                />
              </div>
            </Seccion>
            )}
          </div>

          <footer className="flex shrink-0 justify-end gap-2 px-6 py-4">
            <button
              type="button"
              onClick={cerrar}
              className="rounded-full px-5 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardandoActa || estadoSerial !== "ok"}
              className="rounded-full bg-brand-600 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-500 disabled:opacity-50"
            >
              {guardandoActa ? "Guardando..." : textoGuardar}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
