"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapView, type Marker, type Pt } from "./MapView";
import { cx } from "./ui";
import { dt, statusLabel } from "@/lib/format";
import { ordersSocket } from "@/lib/socket";

export interface TrackingData {
  orderId: string; orderNo: string; status: string; priority: string;
  destination: Pt & { address: string; hospital: string }; origin: Pt;
  agent: { name: string; phone?: string; vehicleNo: string } | null;
  position: (Pt & { at?: string }) | null; eta: { seconds: number; meters: number } | null; route: Pt[] | null;
  timeline: { to: string; at: string; reason: string | null }[];
}

const FLOW = ["PLACED", "ACCEPTED", "PACKED", "DISPATCHED", "REACHED_HOSPITAL", "DELIVERED_TO_OT"];

/** Amazon-style stepper with timestamps. */
export function Stepper({ status, timeline }: { status: string; timeline: { to: string; at: string }[] }) {
  const at = (s: string) => timeline.find((x) => x.to === s)?.at;
  const failed = status === "REJECTED" || status === "CANCELLED";
  const idx = FLOW.indexOf(status) === -1 ? (["KIT_RETURN_PENDING", "KIT_RETURNED", "CLOSED"].includes(status) ? FLOW.length - 1 : 0) : FLOW.indexOf(status);
  return (
    <ol className="relative space-y-4 border-l-2 border-line pl-6">
      {FLOW.map((s, i) => {
        const done = !failed && i <= idx;
        return (
          <li key={s} className="relative">
            <span className={cx("absolute -left-[33px] grid h-4 w-4 place-items-center rounded-full border-2", done ? "border-cyan bg-cyan" : "border-line bg-white", i === idx && !failed && "ring-4 ring-cyan/25")} />
            <div className={cx("text-sm font-bold", done ? "text-navy" : "text-muted")}>{s === "REACHED_HOSPITAL" ? "Reached hospital" : s === "DELIVERED_TO_OT" ? "Delivered to OT" : statusLabel(s)}</div>
            {at(s) && <div className="text-xs text-muted">{dt(at(s))}</div>}
          </li>
        );
      })}
      {failed && <li className="relative"><span className="absolute -left-[33px] h-4 w-4 rounded-full bg-bad" /><div className="text-sm font-bold text-bad">{statusLabel(status)}</div><div className="text-xs text-muted">{dt(timeline.find((x) => x.to === status)?.at)}</div></li>}
      {["KIT_RETURN_PENDING", "KIT_RETURNED", "CLOSED"].map((s) => at(s) && <li key={s} className="relative"><span className="absolute -left-[33px] h-4 w-4 rounded-full bg-navy" /><div className="text-sm font-bold text-navy">{statusLabel(s)}</div><div className="text-xs text-muted">{dt(at(s))}</div></li>)}
    </ol>
  );
}

/** Live map + ETA. Subscribes to tracking:location and order:status over Socket.IO. */
export function LiveTracking({ data, orderId, trackToken, onStatus }: { data: TrackingData; orderId: string; trackToken?: string; onStatus?: () => void }) {
  // Live socket values win over the last REST snapshot.
  const [livePos, setPos] = useState<(Pt & { at?: string }) | null>(null);
  const [liveEta, setEta] = useState<TrackingData["eta"]>(null);
  const pos = livePos ?? data.position;
  const eta = liveEta ?? data.eta;
  const onStatusRef = useRef(onStatus);
  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);
  useEffect(() => {
    const s = ordersSocket(trackToken);
    const join = () => { if (!trackToken) s.emit("order:join", orderId); };
    join();
    s.on("connect", join);
    const loc = (p: { orderId: string; lat: number; lng: number; at: string; eta?: { seconds: number; meters: number } | null }) => {
      if (p.orderId !== orderId) return;
      setPos({ lat: p.lat, lng: p.lng, at: p.at });
      if (p.eta) setEta(p.eta);
    };
    const st = (p: { orderId: string }) => p.orderId === orderId && onStatusRef.current?.();
    s.on("tracking:location", loc);
    s.on("order:status", st);
    return () => {
      s.off("tracking:location", loc); s.off("order:status", st); s.off("connect", join);
      if (trackToken) s.disconnect(); else s.emit("order:leave", orderId);
    };
  }, [orderId, trackToken]);

  const inTransit = data.status === "DISPATCHED" || data.status === "REACHED_HOSPITAL";
  const markers = useMemo<Marker[]>(() => {
    const m: Marker[] = [{ id: "dest", lat: data.destination.lat, lng: data.destination.lng, kind: "dest", tip: data.destination.hospital }];
    if (pos && inTransit) m.push({ id: "agent", lat: pos.lat, lng: pos.lng, kind: "agent", label: data.agent?.name?.[0] ?? "➤", emergency: data.priority === "EMERGENCY", tip: data.agent?.name });
    return m;
  }, [pos, data, inTransit]);

  return (
    <div className="space-y-3">
      {inTransit && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-navy p-4 text-white">
          <div className="text-3xl font-extrabold text-cyan">{eta ? `${Math.max(1, Math.round(eta.seconds / 60))} min` : "…"}</div>
          <div className="text-sm"><div className="font-bold">{data.status === "REACHED_HOSPITAL" ? "Agent has reached the hospital" : "On the way to the OT"}</div><div className="text-white/70">{eta ? `${(eta.meters / 1000).toFixed(1)} km away` : "waiting for GPS"} · {data.agent?.name} · {data.agent?.vehicleNo}</div></div>
          {data.agent?.phone && <a href={`tel:${data.agent.phone}`} className="ml-auto rounded-xl bg-cyan px-4 py-2 font-bold text-navy">📞 Call agent</a>}
        </div>
      )}
      <MapView markers={markers} route={inTransit ? data.route : null} height={380} fitKey={`${orderId}-${inTransit}`} />
      {pos?.at && inTransit && <div className="text-xs text-muted">Last GPS update {new Date(pos.at).toLocaleTimeString("en-IN")}</div>}
    </div>
  );
}
