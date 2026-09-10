import { MapContainer, TileLayer, Marker, Popup, LayersControl, useMapEvents, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { useEffect } from "react";
import L from "leaflet";
import "leaflet.heat";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
import { Suscriptor } from "../api/client";

// Solo los campos que este mapa realmente pinta (marcador + popup) — un Suscriptor completo
// también cumple esta forma, así que sigue sirviendo donde ya se pasaba uno (ej. dentro de la
// ficha del suscriptor); lo que cambia es que MapaPage ahora puede pasarle el resultado del
// endpoint liviano /api/suscriptores/mapa en vez del listado completo.
type SuscriptorEnMapa = Pick<Suscriptor, "id" | "codigo" | "nombre" | "latitud" | "longitud">;

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

export type ModoCalor = "ninguno" | "densidad" | "consumo";

export interface PuntoConsumo {
  id: number;
  latitud: number;
  longitud: number;
  consumo: number;
}

function ClicEditable({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Encuadra la vista para que se vean todos los puntos apenas se monta el mapa, en vez de quedar
// centrado en el primer suscriptor de la lista con un zoom fijo (que a veces mostraba medio
// municipio vacío, o dejaba puntos reales fuera de vista). Solo corre una vez al montar — si el
// usuario después mueve/hace zoom a mano, no se le vuelve a mover la vista debajo.
function AjustarVistaAPuntos({ puntos }: { puntos: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (puntos.length === 0) return;
    // fitBounds/setView necesitan que el contenedor ya tenga un tamaño real — si este efecto
    // corre en el mismo instante en que el layout de la página (flex, sidebar) todavía no le dio
    // su alto final al mapa, Leaflet tira "Set map center and zoom first" y, al no haber un
    // Error Boundary más arriba en ese momento, React se comía toda la pantalla dejándola en
    // blanco hasta recargar. invalidateSize() antes de ajustar la vista le hace recalcular el
    // tamaño real justo antes, y el try/catch es una segunda red por si igual falla.
    try {
      map.invalidateSize();
      if (puntos.length === 1) {
        map.setView(puntos[0], 16);
      } else {
        map.fitBounds(L.latLngBounds(puntos), { padding: [30, 30], maxZoom: 17 });
      }
    } catch (err) {
      console.warn("No se pudo ajustar la vista del mapa a los puntos", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

// Capa de mapa de calor: recibe puntos [lat, lng, intensidad] y los dibuja con leaflet.heat.
// intensidad en 0..1 (ya normalizada por quien la use) para que el degradado se vea consistente
// sin importar si son conteos de densidad o valores de consumo.
function CapaCalor({ puntos }: { puntos: [number, number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (puntos.length === 0) return;
    const capa = (L as any).heatLayer(puntos, { radius: 28, blur: 22, maxZoom: 17 });
    capa.addTo(map);
    return () => {
      map.removeLayer(capa);
    };
  }, [map, puntos]);

  return null;
}

interface MapaPrediosProps {
  suscriptores?: SuscriptorEnMapa[];
  onMarkerClick?: (id: number) => void;
  editable?: boolean;
  onPick?: (lat: number, lng: number) => void;
  puntoSeleccionado?: [number, number] | null;
  centro?: [number, number];
  zoom?: number;
  className?: string;
  modoCalor?: ModoCalor;
  puntosConsumo?: PuntoConsumo[];
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
  modoCalor = "ninguno",
  puntosConsumo = [],
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

  const puntosCalor: [number, number, number][] =
    modoCalor === "densidad"
      ? conCoordenadas.map((s) => [s.latitud, s.longitud, 0.5])
      : modoCalor === "consumo"
      ? (() => {
          const maxConsumo = Math.max(1, ...puntosConsumo.map((p) => p.consumo));
          return puntosConsumo
            .filter((p) => p.consumo > 0)
            .map((p) => [p.latitud, p.longitud, Math.max(0.15, p.consumo / maxConsumo)]);
        })()
      : [];

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 ${className}`}>
      <MapContainer
        center={centroInicial as [number, number]}
        zoom={zoom}
        maxZoom={22}
        style={{ height: "100%", width: "100%" }}
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Calles">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={22}
              maxNativeZoom={18}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satelital (Esri)">
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={22}
              maxNativeZoom={18}
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        {!editable && !centro && (
          <AjustarVistaAPuntos puntos={conCoordenadas.map((s) => [s.latitud, s.longitud] as [number, number])} />
        )}
        {editable && onPick && <ClicEditable onPick={onPick} />}
        {modoCalor !== "ninguno" ? (
          <CapaCalor puntos={puntosCalor} />
        ) : editable ? (
          marcadores
        ) : (
          <MarkerClusterGroup chunkedLoading>{marcadores}</MarkerClusterGroup>
        )}
        {editable && puntoSeleccionado && <Marker position={puntoSeleccionado} />}
      </MapContainer>
    </div>
  );
}
