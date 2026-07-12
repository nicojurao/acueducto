import { useState } from "react";
import { X } from "lucide-react";
import { api, DiametroMedidor, Lote, MarcaMedidor, Medidor, ModeloMedidor, urlFoto } from "../api/client";
import { useConfirm, useErrorHandler } from "./ConfirmModal";
import { HistorialSeccion } from "./HistorialTimeline";
import { useAuth } from "../contexts/AuthContext";
import { useCierreAnimado } from "../lib/useCierreAnimado";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500";

export default function MedidorDetalleModal({
  medidor,
  marcas,
  modelos,
  lotes,
  onClose,
  onCambio,
}: {
  medidor: Medidor;
  marcas: MarcaMedidor[];
  modelos: ModeloMedidor[];
  lotes: Lote[];
  onClose: () => void;
  onCambio: () => void;
}) {
  const [serial, setSerial] = useState(medidor.serial ?? "");
  const [marcaId, setMarcaId] = useState(medidor.marcaCat ? String(medidor.marcaCat.id) : "");
  const [modeloId, setModeloId] = useState(medidor.modeloCat ? String(medidor.modeloCat.id) : "");
  const [diametroId, setDiametroId] = useState(medidor.diametroCat ? String(medidor.diametroCat.id) : "");
  const [loteId, setLoteId] = useState(medidor.loteId ? String(medidor.loteId) : "");
  const [fechaFabricacion, setFechaFabricacion] = useState(medidor.fechaFabricacion?.slice(0, 10) ?? "");
  const [fechaCertificacion, setFechaCertificacion] = useState(medidor.fechaCertificacion?.slice(0, 10) ?? "");
  const [certificado, setCertificado] = useState(medidor.certificado ?? "");
  const [condicion, setCondicion] = useState(medidor.condicion);
  const [actaCalibracionUrl, setActaCalibracionUrl] = useState(medidor.actaCalibracionUrl);
  const [actaCalibracionArchivo, setActaCalibracionArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const { error, run } = useErrorHandler();
  const { usuario } = useAuth();
  const { pedirConfirmacion, modal: modalConfirmacion } = useConfirm();
  const { saliendo, cerrar } = useCierreAnimado(onClose);

  const modelosDeMarca = modelos.filter((mo) => String(mo.marcaId) === marcaId);
  const modeloSeleccionado = modelos.find((mo) => String(mo.id) === modeloId);
  const diametrosDelModelo: DiametroMedidor[] = modeloSeleccionado?.diametros ?? [];

  async function guardar() {
    await run(async () => {
      setGuardando(true);
      try {
        await api.medidores.update(medidor.id, {
          serial: serial || null,
          marcaId: marcaId ? Number(marcaId) : null,
          modeloId: modeloId ? Number(modeloId) : null,
          diametroId: diametroId ? Number(diametroId) : null,
          loteId: loteId ? Number(loteId) : null,
          fechaFabricacion: fechaFabricacion || null,
          fechaCertificacion: fechaCertificacion || null,
          certificado: certificado || null,
          condicion,
        });
        if (actaCalibracionArchivo) {
          await api.medidores.subirActaCalibracion(medidor.id, actaCalibracionArchivo);
        }
        onCambio();
        cerrar();
      } finally {
        setGuardando(false);
      }
    });
  }

  async function quitarActaCalibracion() {
    setSubiendo(true);
    try {
      await api.medidores.quitarActaCalibracion(medidor.id);
      setActaCalibracionUrl(null);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className={`fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 ${saliendo ? "animate-fade-out" : "animate-fade-in"}`}>
      {modalConfirmacion}
      <div className={`max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900 ${saliendo ? "animate-scale-out" : "animate-scale-in"}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Medidor {medidor.serial ?? `#${medidor.id}`}</h2>
          <button onClick={cerrar} className="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Serial</span>
            <input value={serial} onChange={(e) => setSerial(e.target.value)} className={`${inputClass} w-full`} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Marca</span>
              <select
                value={marcaId}
                onChange={(e) => {
                  setMarcaId(e.target.value);
                  setModeloId("");
                  setDiametroId("");
                }}
                className={`${inputClass} w-full`}
              >
                <option value="">Marca...</option>
                {marcas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Modelo</span>
              <select
                value={modeloId}
                onChange={(e) => {
                  setModeloId(e.target.value);
                  setDiametroId("");
                }}
                disabled={!marcaId}
                className={`${inputClass} w-full`}
              >
                <option value="">Modelo...</option>
                {modelosDeMarca.map((mo) => (
                  <option key={mo.id} value={mo.id}>
                    {mo.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Diámetro</span>
              <select
                value={diametroId}
                onChange={(e) => setDiametroId(e.target.value)}
                disabled={!modeloId}
                className={`${inputClass} w-full`}
              >
                <option value="">Diámetro...</option>
                {diametrosDelModelo.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.valor}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Lote</span>
              <select value={loteId} onChange={(e) => setLoteId(e.target.value)} className={`${inputClass} w-full`}>
                <option value="">Lote...</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.serialInicial}-{l.serialFinal}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Fecha fabricación</span>
              <input
                type="date"
                value={fechaFabricacion}
                onChange={(e) => setFechaFabricacion(e.target.value)}
                className={`${inputClass} w-full`}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Fecha certificación</span>
              <input
                type="date"
                value={fechaCertificacion}
                onChange={(e) => setFechaCertificacion(e.target.value)}
                className={`${inputClass} w-full`}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">N° certificado</span>
              <input
                value={certificado}
                onChange={(e) => setCertificado(e.target.value)}
                className={`${inputClass} w-full`}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Condición</span>
              <select
                value={condicion}
                onChange={(e) => setCondicion(e.target.value as "bueno" | "danado")}
                className={`${inputClass} w-full`}
              >
                <option value="bueno">Bueno</option>
                <option value="danado">Dañado</option>
              </select>
            </label>
          </div>

          <div>
            <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">Acta de calibración (escaneada)</span>
            {actaCalibracionUrl && !actaCalibracionArchivo && (
              <div className="mb-1 flex items-center gap-2">
                <a
                  href={urlFoto(actaCalibracionUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  Ver acta actual
                </a>
                <button
                  type="button"
                  disabled={subiendo}
                  onClick={quitarActaCalibracion}
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
        </div>

        {usuario?.permisos?.includes("historial") && (
          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
            <HistorialSeccion entidad="medidor" entidadId={medidor.id} />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={cerrar}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            onClick={() => pedirConfirmacion("¿Deseas guardar los cambios?", guardar, { textoConfirmar: "Guardar", variante: "normal" })}
            disabled={guardando}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
