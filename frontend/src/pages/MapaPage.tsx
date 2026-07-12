import { useEffect, useState } from "react";
import { Map } from "lucide-react";
import { api, Suscriptor } from "../api/client";
import MapaPredios from "../components/MapaPredios";
import SuscriptorDetailModal from "../components/SuscriptorDetailModal";

export default function MapaPage() {
  const [suscriptores, setSuscriptores] = useState<Suscriptor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [detalleId, setDetalleId] = useState<number | null>(null);

  async function cargar() {
    setSuscriptores(await api.suscriptores.list());
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const ubicados = suscriptores.filter((s) => s.latitud != null && s.longitud != null).length;

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Map className="h-6 w-6 text-brand-500" />
          Mapa de predios
        </h1>
        <span className="text-sm text-slate-700 dark:text-slate-400">
          {ubicados} de {suscriptores.length} predios ubicados
        </span>
      </div>

      {cargando ? (
        <p className="text-slate-700 dark:text-slate-400">Cargando...</p>
      ) : (
        <MapaPredios suscriptores={suscriptores} onMarkerClick={(id) => setDetalleId(id)} className="flex-1" />
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
