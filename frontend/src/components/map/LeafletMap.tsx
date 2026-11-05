import { useEffect, useRef } from "react";
import L from "leaflet";

import { fetchWeather, type WeatherInfo } from "../../utils/weather";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  status: string;
  label: string;
  sublabel?: string;
  customerName?: string;
  activeStates?: string[];
  unacknowledged?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  normal: "#22c55e",
  emergency: "#ef4444",
  alarm: "#f59e0b",
  offline: "#64748b",
  test: "#a855f7",
};
const STATUS_PRIORITY: Record<string, number> = { normal: 0, test: 1, offline: 2, alarm: 3, emergency: 4 };
const STATUS_ORDER = ["emergency", "alarm", "offline", "test", "normal"];

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] || char);
}

function tooltipHtml(marker: MapMarker, weather?: WeatherInfo | null) {
  const title = [marker.customerName, marker.label].filter(Boolean).map((part) => escapeHtml(part || "")).join(" — ");
  const states = (marker.activeStates || []).map(escapeHtml).join(" · ");
  const address = marker.sublabel ? `<div class="map-tooltip-address">${escapeHtml(marker.sublabel)}</div>` : "";
  const stateRow = states ? `<div class="map-tooltip-states">${states}</div>` : "";
  const weatherRow = weather ? `<div class="map-tooltip-weather"><span>Temperature: ${weather.tempC}°C</span><span>Rain: ${weather.rainChancePct}%</span><span>Wind: ${weather.windKmh} km/h</span></div>` : "";
  return `<div class="map-site-tooltip"><strong>${title}</strong>${address}${stateRow}${weatherRow}</div>`;
}

function worstStatus(markers: MapMarker[]) {
  return markers.reduce((worst, marker) =>
    (STATUS_PRIORITY[marker.status] ?? 0) > (STATUS_PRIORITY[worst] ?? 0) ? marker.status : worst, "normal");
}

function mixGradient(markers: MapMarker[]) {
  let offset = 0;
  const stops: string[] = [];
  for (const status of STATUS_ORDER) {
    const count = markers.filter((marker) => marker.status === status).length;
    if (!count) continue;
    const end = offset + (count / markers.length) * 100;
    stops.push(`${STATUS_COLOR[status]} ${offset}% ${end}%`);
    offset = end;
  }
  return `conic-gradient(${stops.join(",")})`;
}

export function LeafletMap({ markers, onMarkerClick, singleMarkerZoom = 14 }: {
  markers: MapMarker[];
  onMarkerClick?: (id: string) => void;
  singleMarkerZoom?: number;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!elRef.current) return;
    const map = L.map(elRef.current, { center: [37.5, -77.5], zoom: 6, zoomControl: false, attributionControl: false });
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16 }).addTo(map);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16 }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let layer = L.layerGroup().addTo(map);
    const clusterSize = 72;

    const render = () => {
      layer.remove();
      layer = L.layerGroup().addTo(map);
      const groups = new Map<string, MapMarker[]>();
      for (const marker of markers) {
        const point = map.project([marker.lat, marker.lng], map.getZoom());
        const key = `${Math.floor(point.x / clusterSize)}:${Math.floor(point.y / clusterSize)}`;
        groups.set(key, [...(groups.get(key) || []), marker]);
      }

      for (const group of groups.values()) {
        if (group.length > 1) {
          const lat = group.reduce((sum, marker) => sum + marker.lat, 0) / group.length;
          const lng = group.reduce((sum, marker) => sum + marker.lng, 0) / group.length;
          const status = worstStatus(group);
          const pulseClass = group.some((marker) => marker.unacknowledged) ? " unacknowledged" : "";
          const icon = L.divIcon({
            className: "cpc-map-cluster",
            html: `<div class="map-cluster-ring${pulseClass}" style="background:${mixGradient(group)}"><div style="background:${STATUS_COLOR[status]}">${group.length}</div></div>`,
            iconSize: [42, 42], iconAnchor: [21, 21],
          });
          const cluster = L.marker([lat, lng], { icon }).addTo(layer);
          const mix = STATUS_ORDER.map((item) => ({ item, count: group.filter((marker) => marker.status === item).length })).filter(({ count }) => count);
          cluster.bindTooltip(`<div class="map-site-tooltip"><strong>${group.length} sites</strong><div class="map-tooltip-states">${mix.map(({ item, count }) => `${count} ${item}`).join(" · ")}</div><div class="map-tooltip-address">Click to zoom and split</div></div>`, { direction: "top" });
          cluster.on("click", () => map.fitBounds(group.map((marker) => [marker.lat, marker.lng] as L.LatLngTuple), { padding: [70, 70], maxZoom: Math.min(map.getZoom() + 3, 16) }));
          continue;
        }

        const marker = group[0];
        const color = STATUS_COLOR[marker.status] || STATUS_COLOR.normal;
        if (marker.unacknowledged) {
          L.circleMarker([marker.lat, marker.lng], { radius: 18, color, fillColor: color, fillOpacity: 0.14, weight: 2, opacity: 0.55, className: "map-pulse-ring" }).addTo(layer);
        }
        const pin = L.circleMarker([marker.lat, marker.lng], { radius: 8, color: "#1a1a2e", weight: 2, fillColor: color, fillOpacity: 1 }).addTo(layer);
        pin.bindTooltip(tooltipHtml(marker), { direction: "top", offset: [0, -10], className: "cpc-map-tooltip" });
        fetchWeather(marker.lat, marker.lng).then((weather) => { if (weather) pin.setTooltipContent(tooltipHtml(marker, weather)); });
        L.marker([marker.lat, marker.lng], {
          icon: L.divIcon({ className: "cpc-map-label", html: `<span>${escapeHtml(marker.label)}</span>`, iconSize: [0, 0], iconAnchor: [-12, 4] }),
          interactive: false,
        }).addTo(layer);
        if (onMarkerClick) pin.on("click", () => onMarkerClick(marker.id));
      }
    };

    render();
    map.on("zoomend moveend", render);
    const bounds = markers.map((marker) => [marker.lat, marker.lng] as L.LatLngTuple);
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [50, 50] });
    else if (bounds.length === 1) map.setView(bounds[0], singleMarkerZoom);
    return () => { map.off("zoomend moveend", render); layer.remove(); };
  }, [markers, onMarkerClick, singleMarkerZoom]);

  return <div ref={elRef} style={{ height: "100%", width: "100%", background: "#080c16" }} />;
}
