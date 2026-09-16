"use client";
import L from "leaflet";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  kind: "agency" | "customer" | "staff" | "staff-idle" | "pending";
  label?: string;
  sub?: string;
  active?: boolean;
}
export interface LeafletMapProps {
  pins: MapPin[];
  routes?: { id: string; points: { lat: number; lng: number }[]; progress?: number }[];
  center?: { lat: number; lng: number };
  zoom?: number;
  className?: string;
  fit?: boolean;
  circles?: { lat: number; lng: number; radiusKm: number }[];
}

const ICONS: Record<MapPin["kind"], (active?: boolean) => L.DivIcon> = {
  agency: () => L.divIcon({ className: "leaflet-div-icon", iconSize: [30, 30], iconAnchor: [15, 15], html: `<div style="width:30px;height:30px;border-radius:50%;background:#12263A;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px">🏪</div>` }),
  customer: () => L.divIcon({ className: "leaflet-div-icon", iconSize: [26, 26], iconAnchor: [13, 13], html: `<div style="width:26px;height:26px;border-radius:50%;background:#1E9E5A;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px">🏠</div>` }),
  pending: () => L.divIcon({ className: "leaflet-div-icon", iconSize: [22, 22], iconAnchor: [11, 11], html: `<div style="width:22px;height:22px;border-radius:50%;background:#2F6FED;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>` }),
  staff: () => L.divIcon({ className: "leaflet-div-icon", iconSize: [34, 34], iconAnchor: [17, 17], html: `<div class="pulse-ring" style="position:relative;width:34px;height:34px;border-radius:50%;background:#F26B1D;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px">🛵</div>` }),
  "staff-idle": () => L.divIcon({ className: "leaflet-div-icon", iconSize: [26, 26], iconAnchor: [13, 13], html: `<div style="width:26px;height:26px;border-radius:50%;background:#5B6B7B;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px">🛵</div>` }),
};

function Fit({ pins, routes }: { pins: MapPin[]; routes?: LeafletMapProps["routes"] }) {
  const map = useMap();
  const key = pins.length + ":" + (routes?.length ?? 0);
  useEffect(() => {
    const pts: [number, number][] = [...pins.map((p) => [p.lat, p.lng] as [number, number]), ...(routes ?? []).flatMap((r) => r.points.map((p) => [p.lat, p.lng] as [number, number]))];
    if (pts.length >= 2) map.fitBounds(L.latLngBounds(pts).pad(0.2), { animate: false });
    else if (pts.length === 1) map.setView(pts[0], 14);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

export default function LeafletMap({ pins, routes = [], center = { lat: 17.41, lng: 78.47 }, zoom = 12, className, fit = true, circles = [] }: LeafletMapProps) {
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} className={className ?? "h-full w-full"} scrollWheelZoom={false} attributionControl={false}>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
      {circles.map((c, i) => (
        <CircleMarker key={i} center={[c.lat, c.lng]} radius={Math.max(20, c.radiusKm * 12)} pathOptions={{ color: "#F26B1D", fillColor: "#F26B1D", fillOpacity: 0.08, weight: 1.5, dashArray: "4 4" }} />
      ))}
      {routes.map((r) => (
        <Polyline key={r.id} positions={r.points.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#F26B1D", weight: 4, opacity: 0.85, dashArray: "1 8", lineCap: "round" }} />
      ))}
      {pins.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={ICONS[p.kind](p.active)} zIndexOffset={p.kind === "staff" ? 1000 : 0}>
          {p.label ? (
            <Popup>
              <div className="text-xs">
                <p className="font-semibold">{p.label}</p>
                {p.sub ? <p className="text-muted-foreground">{p.sub}</p> : null}
              </div>
            </Popup>
          ) : null}
        </Marker>
      ))}
      {fit ? <Fit pins={pins} routes={routes} /> : null}
    </MapContainer>
  );
}
