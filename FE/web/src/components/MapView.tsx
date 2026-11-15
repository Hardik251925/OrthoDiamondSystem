"use client";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";

export interface Pt { lat: number; lng: number }
export interface Marker { id: string; lat: number; lng: number; kind: "agent" | "dest" | "pin"; label?: string; emergency?: boolean; tip?: string }

/** Leaflet loaded client-side only. Agent marker glides smoothly between GPS updates. */
export function MapView({ markers, route, height = 320, onPick, fitKey }: { markers: Marker[]; route?: Pt[] | null; height?: number; onPick?: (p: Pt) => void; fitKey?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layers = useRef(new Map<string, Leaflet.Marker>());
  const line = useRef<Leaflet.Polyline | null>(null);
  const fitted = useRef<string | undefined>(undefined);
  const pickRef = useRef(onPick);
  const [ready, setReady] = useState(false);
  useEffect(() => { pickRef.current = onPick; }, [onPick]);

  useEffect(() => {
    let cancelled = false;
    const store = layers.current;
    import("leaflet").then((mod) => {
      if (cancelled || !el.current || map.current) return;
      L.current = mod;
      map.current = mod.map(el.current).setView([22.7196, 75.8577], 12);
      mod.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 }).addTo(map.current);
      map.current.on("click", (e: Leaflet.LeafletMouseEvent) => pickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
      setReady(true);
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; store.clear(); line.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current, Lf = L.current;
    if (!ready || !m || !Lf) return;
    const icon = (x: Marker) => Lf.divIcon({ className: "", iconSize: x.kind === "agent" ? [30, 30] : [18, 18], iconAnchor: x.kind === "agent" ? [15, 15] : [9, 9], html: x.kind === "agent" ? `<div class="agent-pin ${x.emergency ? "em" : ""}">${x.label ?? "➤"}</div>` : `<div class="dest-pin" ${x.kind === "pin" ? 'style="background:#13c4e3"' : ""}></div>` });
    const seen = new Set<string>();
    for (const x of markers) {
      seen.add(x.id);
      const ex = layers.current.get(x.id);
      if (ex) glide(ex, Lf.latLng(x.lat, x.lng));
      else {
        const mk = Lf.marker([x.lat, x.lng], { icon: icon(x) }).addTo(m);
        if (x.tip) mk.bindTooltip(x.tip, { direction: "top", offset: [0, -14] });
        layers.current.set(x.id, mk);
      }
    }
    for (const [id, mk] of layers.current) if (!seen.has(id)) { mk.remove(); layers.current.delete(id); }
    if (route?.length) {
      const ll = route.map((p) => [p.lat, p.lng] as [number, number]);
      if (line.current) line.current.setLatLngs(ll);
      else line.current = Lf.polyline(ll, { color: "#13c4e3", weight: 5, opacity: 0.8 }).addTo(m);
    } else if (line.current) { line.current.remove(); line.current = null; }
    const key = fitKey ?? markers.map((x) => x.id).join("|");
    if (fitted.current !== key && markers.length) {
      fitted.current = key;
      const b = Lf.latLngBounds(markers.map((x) => [x.lat, x.lng] as [number, number]));
      route?.forEach((p) => b.extend([p.lat, p.lng]));
      if (markers.length === 1 && !route?.length) m.setView([markers[0]!.lat, markers[0]!.lng], 15, { animate: false });
      else m.fitBounds(b.pad(0.25), { maxZoom: 16, animate: false });
    }
  }, [ready, markers, route, fitKey]);

  return <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-2xl border border-line" />;
}

function glide(marker: Leaflet.Marker, to: Leaflet.LatLng) {
  const from = marker.getLatLng();
  if (from.distanceTo(to) < 1) return;
  const start = performance.now();
  const step = (now: number) => {
    // map was removed (page navigation) mid-animation -> stop, or Leaflet throws _leaflet_pos errors
    if (!(marker as unknown as { _map?: unknown })._map) return;
    const f = Math.min(1, (now - start) / 1500);
    const e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
    marker.setLatLng([from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e]);
    if (f < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
