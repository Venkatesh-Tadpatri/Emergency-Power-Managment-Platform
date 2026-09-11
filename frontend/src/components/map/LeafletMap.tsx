import { useEffect, useRef } from "react";
import L from "leaflet";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  status: string;
  label: string;
  sublabel?: string;
}

const STATUS_COLOR: Record<string, string> = {
  normal: "#22c55e",
  emergency: "#ef4444",
  alarm: "#f59e0b",
  test: "#a855f7",
  offline: "#64748b",
};

export function LeafletMap({
  markers,
  onMarkerClick,
  singleMarkerZoom = 14,
}: {
  markers: MapMarker[];
  onMarkerClick?: (id: string) => void;
  singleMarkerZoom?: number;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!elRef.current) return;
    const map = L.map(elRef.current, {
      center: [37.5, -77.5],
      zoom: 6,
      zoomControl: false,
      attributionControl: false,
    });
    L.control.zoom({ position: "topright" }).addTo(map);
    // Esri's free, key-less light-grey canvas basemap + its matching label/road reference overlay —
    // keeps the minimal light background the markers were designed for, with legible place names.
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 16,
    }).addTo(map);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 16,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const layer = L.layerGroup().addTo(map);
    const bounds: L.LatLngExpression[] = [];

    markers.forEach((m) => {
      const col = STATUS_COLOR[m.status] || STATUS_COLOR.normal;
      const pulse = ["emergency", "alarm", "test"].includes(m.status);
      bounds.push([m.lat, m.lng]);
      if (pulse) {
        L.circleMarker([m.lat, m.lng], {
          radius: 18,
          color: col,
          fillColor: col,
          fillOpacity: 0.12,
          weight: 1,
          opacity: 0.3,
          className: "map-pulse-ring",
        }).addTo(layer);
      }
      const mk = L.circleMarker([m.lat, m.lng], {
        radius: pulse ? 8 : 7,
        color: "#1a1a2e",
        weight: 2,
        fillColor: col,
        fillOpacity: 1,
      }).addTo(layer);
      mk.bindTooltip(
        `<div style="font-family:Inter,sans-serif;font-size:12px"><div style="font-weight:700;margin-bottom:4px">${m.label}</div>${
          m.sublabel ? `<div style="color:#94a3b8;font-size:10px">${m.sublabel}</div>` : ""
        }</div>`,
        { direction: "top", offset: [0, -10], className: "cpc-map-tooltip" }
      );
      L.marker([m.lat, m.lng], {
        icon: L.divIcon({
          className: "cpc-map-label",
          html: `<span style="font-family:Inter;font-size:10px;font-weight:700;color:#0f172a;text-shadow:0 0 3px #fff,0 0 5px #fff,0 0 7px #fff;white-space:nowrap">${m.label}</span>`,
          iconSize: [0, 0],
          iconAnchor: [-12, 4],
        }),
        interactive: false,
      }).addTo(layer);
      if (onMarkerClick) mk.on("click", () => onMarkerClick(m.id));
    });

    if (bounds.length > 1) {
      map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [50, 50] });
    } else if (bounds.length === 1) {
      map.setView(bounds[0] as L.LatLngExpression, singleMarkerZoom);
    }

    return () => {
      layer.remove();
    };
  }, [markers, onMarkerClick, singleMarkerZoom]);

  return <div ref={elRef} style={{ height: "100%", width: "100%", background: "#080c16" }} />;
}
