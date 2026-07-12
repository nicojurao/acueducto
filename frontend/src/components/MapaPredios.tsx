import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
import { Suscriptor } from "../api/client";

// Vite no resuelve automáticamente las rutas de los iconos default de Leaflet
const defaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

// Mocoa, Putumayo
export const CENTRO_DEFAULT: [number, number] = [1.1466, -76.6464];

function ClicEditable({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface MapaPrediosProps {
  suscriptores?: Suscriptor[];
  onMarkerClick?: (id: number) => void;
  editable?: boolean;
  onPick?: (lat: number, lng: number) => void;
  puntoSeleccionado?: [number, number] | null;
  centro?: [number, number];
  zoom?: number;
  className?: string;
}

export default function MapaPredios({
  suscriptores = [],
  onMarkerClick,
  editable = false,
  onPick,
  puntoSeleccionado,
  centro,
  zoom = 13,
  className = "h-[70vh]",
}: MapaPrediosProps) {
  const conCoordenadas = suscriptores.filter(
    (s) => s.latitud != null && s.longitud != null
  ) as (Suscriptor & { latitud: number; longitud: number })[];

  const centroInicial =
    centro ?? (conCoordenadas[0] ? [conCoordenadas[0].latitud, conCoordenadas[0].longitud] : CENTRO_DEFAULT);

  const marcadores = conCoordenadas.map((s) => (
    <Marker key={s.id} position={[s.latitud, s.longitud]}>
      <Popup>
        <div className="text-sm">
          <strong>{s.codigo}</strong> — {s.nombre}
          {onMarkerClick && (
            <button
              onClick={() => onMarkerClick(s.id)}
              className="mt-2 block w-full rounded bg-brand-600 px-2 py-1 text-center text-xs font-medium text-white hover:bg-brand-500"
            >
              Ver detalle
            </button>
          )}
        </div>
      </Popup>
    </Marker>
  ));

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 ${className}`}>
      <MapContainer
        center={centroInicial as [number, number]}
        zoom={zoom}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {editable && onPick && <ClicEditable onPick={onPick} />}
        {editable ? marcadores : <MarkerClusterGroup chunkedLoading>{marcadores}</MarkerClusterGroup>}
        {editable && puntoSeleccionado && <Marker position={puntoSeleccionado} />}
      </MapContainer>
    </div>
  );
}
