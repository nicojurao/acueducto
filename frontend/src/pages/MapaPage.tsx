import { useEffect, useState } from "react";
import { Map } from "lucide-react";
import { api } from "../api/client";
import MapaPredios, { ModoCalor, PuntoConsumo } from "../components/MapaPredios";
import SuscriptorDetailModal from "../components/SuscriptorDetailModal";
import { leerSnapshot } from "../lib/offlineSnapshot";

function periodoActualDefault(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

type SuscriptorMapa = { id: number; codigo: string; nombre: string; latitud: number | null; longitud: number | null };

export default function MapaPage() {
  const [suscriptores, setSuscriptores] = useState<SuscriptorMapa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [modoCalor, setModoCalor] = useState<ModoCalor>("ninguno");
  const [periodo, setPeriodo] = useState(periodoActualDefault());
  const [puntosConsumo, setPuntosConsumo] = useState<PuntoConsumo[]>([]);

  async function cargar() {
    try {
      setSuscriptores(await api.suscriptores.mapa());
    } catch {
      // Sin conexión: se reconstruye desde el snapshot del "Modo de salida" (ya trae latitud/
      // longitud de cada suscriptor).
      const snapshot = await leerSnapshot();
      setSuscriptores(
        snapshot?.suscriptores.map((s) => ({
          id: s.id,
          codigo: s.codigo,
          nombre: s.nombre,
          latitud: s.latitud ?? null,
          longitud: s.longitud ?? null,
        })) ?? []
      );
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    if (modoCalor !== "consumo") return;
    api.reportes.mapaConsumo(periodo).then(setPuntosConsumo);
  }, [modoCalor, periodo]);

  const ubicados = suscriptores.filter((s) => s.latitud != null && s.longitud != null).length;

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Map className="h-6 w-6 text-brand-500" />
          Mapa de predios
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-700 dark:text-slate-400">
            {ubicados} de {suscriptores.length} predios ubicados
          </span>
          <select
            value={modoCalor}
            onChange={(e) => setModoCalor(e.target.value as ModoCalor)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="ninguno">Marcadores</option>
            <option value="densidad">Mapa de calor: densidad de suscriptores</option>
            <option value="consumo">Mapa de calor: consumo del periodo</option>
          </select>
          {modoCalor === "consumo" && (
            <input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          )}
        </div>
      </div>

      {cargando ? (
        <div className="flex-1 animate-pulse rounded-xl border border-brand-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800" />
      ) : (
        <MapaPredios
          suscriptores={suscriptores}
          onMarkerClick={(id) => setDetalleId(id)}
          className="flex-1"
          modoCalor={modoCalor}
          puntosConsumo={puntosConsumo}
        />
      )}

      {detalleId !== null && (
        <SuscriptorDetailModal
          suscriptorId={detalleId}
          onClose={() => {
            setDetalleId(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}
