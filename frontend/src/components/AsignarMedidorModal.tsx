import { X, FileText } from "lucide-react";
import {
  api,
  urlFoto,
  Medidor,
  ActaInstalacion,
  MarcaMedidor,
  ModeloMedidor,
  Lote,
} from "../api/client";
import MedidorCombobox from "./MedidorCombobox";
import { comprimirFotos } from "../lib/comprimirImagen";
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
  instaladoPor: string;
  observaciones: string;
  fechaRetiro: string;
};

export default function AsignarMedidorModal({
  editandoMedidorId,
  editandoEsRetirado,
  editandoActaId,
  editandoActaCalibracionUrl,
  editandoDiametroActual,
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
  actaFirmadaArchivo,
  setActaFirmadaArchivo,
  actaPorMedidor,
  guardandoActa,
  onSubmit,
  onClose,
  onActaCalibracionQuitada,
  onActaFirmadaQuitada,
}: {
  editandoMedidorId: number | null;
  editandoEsRetirado: boolean;
  editandoActaId: number | null;
  editandoActaCalibracionUrl: string | null;
  editandoDiametroActual: { id: number; valor: string } | null;
  formMedidor: FormMedidor;
  setFormMedidor: (f: FormMedidor) => void;
  formActa: FormActa;
  setFormActa: (f: FormActa) => void;
  marcas: MarcaMedidor[];
  modelos: ModeloMedidor[];
  lotes: Lote[];
  medidoresBodega: Medidor[];
  instaladores: { id: number; nombre: string }[];
  fotos: File[];
  setFotos: (f: File[]) => void;
  fotosExistentes: string[];
  quitarFotoExistente: (foto: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  actaCalibracionArchivo: File | null;
  setActaCalibracionArchivo: (f: File | null) => void;
  actaFirmadaArchivo: File | null;
  setActaFirmadaArchivo: (f: File | null) => void;
  actaPorMedidor: Record<number, ActaInstalacion>;
  guardandoActa: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  onActaCalibracionQuitada: () => void;
  onActaFirmadaQuitada: () => void;
}) {
  const { saliendo, cerrar } = useCierreAnimado(onClose);

  return (
    <div
      className={`fixed inset-0 z-[2100] flex items-center justify-center bg-black/50 p-4 ${saliendo ? "animate-fade-out" : "animate-fade-in"}`}
      onClick={cerrar}
    >
      <div
        className={`flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl dark:bg-slate-900 ${saliendo ? "animate-scale-out" : "animate-scale-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-lg font-bold">
            {editandoMedidorId
              ? editandoEsRetirado
                ? "Editar medidor retirado (historial)"
                : "Editar medidor instalado"
              : "Asignar medidor"}
          </h2>
          <button onClick={cerrar} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5" onSubmit={onSubmit}>
          {editandoMedidorId ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <input
                  placeholder="Serial"
                  value={formMedidor.serial}
                  onChange={(e) => setFormMedidor({ ...formMedidor, serial: e.target.value })}
                  className={inputClass}
                />
                <select
                  value={formMedidor.marcaId}
                  onChange={(e) =>
                    setFormMedidor({ ...formMedidor, marcaId: e.target.value, modeloId: "", diametroId: "" })
                  }
                  className={inputClass}
                >
                  <option value="">Marca...</option>
                  {marcas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
                <select
                  value={formMedidor.modeloId}
                  onChange={(e) => setFormMedidor({ ...formMedidor, modeloId: e.target.value, diametroId: "" })}
                  className={inputClass}
                  disabled={!formMedidor.marcaId}
                >
                  <option value="">Modelo...</option>
                  {modelos
                    .filter((mo) => String(mo.marcaId) === formMedidor.marcaId)
                    .map((mo) => (
                      <option key={mo.id} value={mo.id}>
                        {mo.nombre}
                      </option>
                    ))}
                </select>
                <select
                  value={formMedidor.diametroId}
                  onChange={(e) => setFormMedidor({ ...formMedidor, diametroId: e.target.value })}
                  className={inputClass}
                  disabled={!formMedidor.modeloId}
                >
                  <option value="">Diámetro...</option>
                  {(modelos.find((mo) => String(mo.id) === formMedidor.modeloId)?.diametros ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.valor}
                    </option>
                  ))}
                  {editandoDiametroActual &&
                    String(editandoDiametroActual.id) === formMedidor.diametroId &&
                    !(modelos.find((mo) => String(mo.id) === formMedidor.modeloId)?.diametros ?? []).some(
                      (d) => d.id === editandoDiametroActual.id
                    ) && (
                      <option value={editandoDiametroActual.id}>
                        {editandoDiametroActual.valor} (no vinculado a este modelo en el catálogo)
                      </option>
                    )}
                </select>
                <select
                  value={formMedidor.loteId}
                  onChange={(e) => setFormMedidor({ ...formMedidor, loteId: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Lote...</option>
                  {lotes.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.serialInicial}-{l.serialFinal}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                  Fecha fabricación
                  <input
                    type="date"
                    value={formMedidor.fechaFabricacion}
                    onChange={(e) => setFormMedidor({ ...formMedidor, fechaFabricacion: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                  Fecha certificación
                  <input
                    type="date"
                    value={formMedidor.fechaCertificacion}
                    onChange={(e) => setFormMedidor({ ...formMedidor, fechaCertificacion: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                  N° certificado
                  <input
                    value={formMedidor.certificado}
                    onChange={(e) => setFormMedidor({ ...formMedidor, certificado: e.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>
            </>
          ) : (
            <>
              <label className="text-xs font-medium text-slate-700">Medidor en bodega</label>
              <MedidorCombobox
                medidores={medidoresBodega}
                value={formActa.medidorId}
                onChange={(id) => setFormActa({ ...formActa, medidorId: id })}
              />
            </>
          )}
          {editandoMedidorId && !editandoActaId && (
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Este medidor no tiene acta de instalación. Completa fecha e instalador si quieres generarla ahora
              (opcional, pero obligatorio si vas a adjuntar fotos o el escaneo firmado más abajo).
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="date"
              value={formActa.fechaInstalacion}
              onChange={(e) => setFormActa({ ...formActa, fechaInstalacion: e.target.value })}
              className={inputClass}
              required={!editandoMedidorId || !!editandoActaId || !!actaFirmadaArchivo || fotos.length > 0}
            />
            <select
              value={formActa.instaladoPor}
              onChange={(e) => setFormActa({ ...formActa, instaladoPor: e.target.value })}
              className={inputClass}
              required={!editandoMedidorId || !!editandoActaId || !!actaFirmadaArchivo || fotos.length > 0}
            >
              <option value="">Instalado por...</option>
              {instaladores.map((u) => (
                <option key={u.id} value={u.nombre}>
                  {u.nombre}
                </option>
              ))}
              {formActa.instaladoPor && !instaladores.some((u) => u.nombre === formActa.instaladoPor) && (
                <option value={formActa.instaladoPor}>{formActa.instaladoPor} (usuario inactivo/eliminado)</option>
              )}
            </select>
          </div>
          {editandoEsRetirado && (
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
              Fecha de retiro
              <input
                type="date"
                value={formActa.fechaRetiro}
                onChange={(e) => setFormActa({ ...formActa, fechaRetiro: e.target.value })}
                className={inputClass}
                required
              />
            </label>
          )}
          <textarea
            placeholder="Observaciones (opcional)"
            value={formActa.observaciones}
            onChange={(e) => setFormActa({ ...formActa, observaciones: e.target.value })}
            className={`${inputClass} min-h-[60px]`}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {editandoMedidorId && (
              <div className="min-w-0">
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Acta de calibración (escaneada)
                </label>
                {editandoActaCalibracionUrl && !actaCalibracionArchivo && (
                  <div className="mb-1 flex items-center gap-2">
                    <a
                      href={urlFoto(editandoActaCalibracionUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                    >
                      Ver acta actual
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!editandoMedidorId) return;
                        await api.medidores.quitarActaCalibracion(editandoMedidorId);
                        onActaCalibracionQuitada();
                      }}
                      className="text-xs font-medium text-red-500 hover:underline"
                    >
                      Quitar
                    </button>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setActaCalibracionArchivo(e.target.files?.[0] ?? null)}
                  className={`${inputClass} w-full`}
                />
              </div>
            )}
            <div className="min-w-0">
              {fotosExistentes.length > 0 && (
                <>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Fotos actuales</label>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {fotosExistentes.map((foto) => (
                      <div key={foto} className="group relative">
                        <img
                          src={urlFoto(foto)}
                          alt="Foto de instalación"
                          className="h-14 w-14 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                        />
                        <button
                          type="button"
                          onClick={() => quitarFotoExistente(foto)}
                          title="Quitar foto"
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow hover:bg-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <label className="mb-1 block text-xs font-medium text-slate-700">
                {editandoActaId ? "Agregar más fotos" : "Fotos"}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={async (e) => setFotos(await comprimirFotos(Array.from(e.target.files ?? [])))}
                className={`${inputClass} w-full`}
              />
              {fotos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {fotos.map((f, i) => (
                    <img
                      key={i}
                      src={URL.createObjectURL(f)}
                      alt={f.name}
                      className="h-14 w-14 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
          {editandoMedidorId && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Acta de instalación firmada (escaneada en PDF)
              </label>
              <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
                El PDF de "Ver/imprimir acta" es solo la plantilla para imprimir y firmar a mano; sube aquí el
                escaneo ya firmado.
                {!editandoActaId &&
                  " Como este medidor no tiene acta, hay que completar fecha e instalador arriba para poder guardar el escaneo."}
              </p>
              {editandoMedidorId && actaPorMedidor[editandoMedidorId]?.actaFirmadaUrl && !actaFirmadaArchivo && (
                <div className="mb-1 flex items-center gap-2">
                  <a
                    href={urlFoto(actaPorMedidor[editandoMedidorId].actaFirmadaUrl!)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Ver acta firmada
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!editandoActaId) return;
                      await api.actas.quitarFirmada(editandoActaId);
                      onActaFirmadaQuitada();
                    }}
                    className="text-xs font-medium text-red-500 hover:underline"
                  >
                    Quitar
                  </button>
                </div>
              )}
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setActaFirmadaArchivo(e.target.files?.[0] ?? null)}
                className={`${inputClass} w-full`}
              />
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={guardandoActa}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              <FileText className="h-3.5 w-3.5" />
              {guardandoActa ? "Guardando..." : editandoMedidorId ? "Guardar cambios" : "Registrar instalación"}
            </button>
            <button
              type="button"
              onClick={cerrar}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
