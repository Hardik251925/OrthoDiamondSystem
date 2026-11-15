import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapMarker { id: string; lat: number; lng: number; kind: 'agent' | 'dest' | 'warehouse'; label?: string; emergency?: boolean; popup?: string }

const icon = (m: MapMarker) =>
  L.divIcon({
    className: '',
    iconSize: m.kind === 'agent' ? [26, 26] : [16, 16],
    iconAnchor: m.kind === 'agent' ? [13, 13] : [8, 8],
    html: m.kind === 'agent' ? `<div class="agent-pin ${m.emergency ? 'em' : ''} pulse">${m.label ?? ''}</div>` : m.kind === 'warehouse' ? '<div class="dest-pin" style="border-color:#f5a524"></div>' : '<div class="dest-pin"></div>',
  });

/** Leaflet + OSM tiles. Markers animate smoothly between GPS updates. */
export function MapView({ markers, routes = [], height = 360, fitKey }: { markers: MapMarker[]; routes?: { id: string; points: { lat: number; lng: number }[] }[]; height?: number; fitKey?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef(new Map<string, L.Marker>());
  const lines = useRef(new Map<string, L.Polyline>());
  const fitted = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([22.7196, 75.8577], 12);
    // Standard OSM tiles (SPEC: OpenStreetMap + Leaflet), darkened with CSS (.od-dark-tiles) to fit the theme.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
      className: 'od-dark-tiles',
    }).addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
      layers.current.clear();
      lines.current.clear();
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    for (const mk of markers) {
      seen.add(mk.id);
      const existing = layers.current.get(mk.id);
      if (existing) {
        animate(existing, L.latLng(mk.lat, mk.lng));
        existing.setIcon(icon(mk));
      } else {
        const marker = L.marker([mk.lat, mk.lng], { icon: icon(mk) }).addTo(m);
        if (mk.popup) marker.bindTooltip(mk.popup, { direction: 'top', offset: [0, -12] });
        layers.current.set(mk.id, marker);
      }
    }
    for (const [id, marker] of layers.current) if (!seen.has(id)) { marker.remove(); layers.current.delete(id); }

    const seenR = new Set<string>();
    for (const r of routes) {
      seenR.add(r.id);
      const ll = r.points.map((p) => [p.lat, p.lng] as [number, number]);
      const l = lines.current.get(r.id);
      if (l) l.setLatLngs(ll);
      else lines.current.set(r.id, L.polyline(ll, { color: '#3dd6f5', weight: 4, opacity: 0.7 }).addTo(m));
    }
    for (const [id, l] of lines.current) if (!seenR.has(id)) { l.remove(); lines.current.delete(id); }

    const key = fitKey ?? markers.map((x) => x.id).join('|');
    if (fitted.current !== key && markers.length) {
      fitted.current = key;
      const b = L.latLngBounds(markers.map((x) => [x.lat, x.lng] as [number, number]));
      routes.forEach((r) => r.points.forEach((p) => b.extend([p.lat, p.lng])));
      m.fitBounds(b.pad(0.25), { maxZoom: 15, animate: false });
    }
  }, [markers, routes, fitKey]);

  return <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-lg border border-line" />;
}

function animate(marker: L.Marker, to: L.LatLng) {
  const from = marker.getLatLng();
  if (from.distanceTo(to) < 1) return;
  const start = performance.now();
  const dur = 1200;
  const step = (now: number) => {
    // map was removed (page navigation) mid-animation -> stop, or Leaflet throws _leaflet_pos errors
    if (!(marker as unknown as { _map?: unknown })._map) return;
    const f = Math.min(1, (now - start) / dur);
    marker.setLatLng([from.lat + (to.lat - from.lat) * f, from.lng + (to.lng - from.lng) * f]);
    if (f < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
