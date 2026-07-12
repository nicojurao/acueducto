import { useEffect, useRef, useState } from "react";
import { X, Camera, Trash2 } from "lucide-react";
import { api, urlFoto } from "../api/client";
import { useConfirm } from "./ConfirmModal";
import { comprimirFotos } from "../lib/comprimirImagen";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500";

export default function NovedadDetailModal({
  novedadId,
  periodo,
  onClose,
  onCambio,
}: {
  novedadId: number;
  periodo: string;
  onClose: () => void;
  onCambio: () => void;
}) {
  const [motivo, setMotivo] = useState<string | null>(null);
  const [fotosExistentes, setFotosExistentes] = useState<string[]>([]);
  const [fotosARemover, setFotosARemover] = useState<string[]>([]);
  const [fotosNuevas, setFotosNuevas] = useState<File[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { pedirConfirmacion, modal: modalConfirmacion } = useConfirm();

  useEffect(() => {
    api.lecturas.obtenerNovedad(novedadId).then((n) => {
      setMotivo(n.motivo);
      setFotosExistentes(n.fotos);
      setCargando(false);
    });
  }, [novedadId]);

  function quitarFotoExistente(foto: string) {
    setFotosExistentes((prev) => prev.filter((f) => f !== foto));
    setFotosARemover((prev) => [...prev, foto]);
  }

  async function guardar() {
    if (!motivo || !motivo.trim()) return;
    setGuardando(true);
    try {
      await api.lecturas.actualizarNovedad(novedadId, { motivo: motivo.trim(), fotosNuevas, fotosARemover });
      onCambio();
      onClose();
    } finally {
      setGuardando(false);
    }
  }

  function eliminar() {
    pedirConfirmacion("¿Eliminar esta novedad? El mes volverá a quedar pendiente de lectura.", async () => {
      await api.lecturas.quitarNovedad(novedadId);
      onCambio();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {modalConfirmacion}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-lg font-bold">Novedad — {periodo}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        {cargando ? (
          <p className="p-5 text-sm text-slate-700 dark:text-slate-400">Cargando...</p>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Motivo</label>
              <textarea
                value={motivo ?? ""}
                onChange={(e) => setMotivo(e.target.value)}
                className={`${inputClass} min-h-[70px] w-full`}
              />
            </div>

            <div>
              {fotosExistentes.length > 0 && (
                <>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Fotos actuales</label>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {fotosExistentes.map((foto) => (
                      <div key={foto} className="group relative shrink-0" style={{ width: 80, height: 80 }}>
                        <a href={urlFoto(foto)} target="_blank" rel="noreferrer">
                          <img
                            src={urlFoto(foto)}
                            alt="Foto de la novedad"
                            style={{ width: 80, height: 80, objectFit: "cover", display: "block" }}
                            className="rounded-lg border border-slate-200 dark:border-slate-700"
                          />
                        </a>
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
              <label className="flex w-fit cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                <Camera className="h-3.5 w-3.5" />
                {fotosNuevas.length > 0 ? `${fotosNuevas.length} foto(s) nueva(s)` : "Agregar foto"}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={async (e) => setFotosNuevas(await comprimirFotos(Array.from(e.target.files ?? [])))}
                />
              </label>
              {fotosNuevas.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {fotosNuevas.map((f, i) => (
                    <img
                      key={i}
                      src={URL.createObjectURL(f)}
                      alt={f.name}
                      className="h-16 w-16 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
              <button
                onClick={eliminar}
                className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:underline dark:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar novedad
              </button>
              <button
                onClick={guardar}
                disabled={guardando}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
              >
                {guardando ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
