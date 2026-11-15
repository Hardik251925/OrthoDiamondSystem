"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LiveTracking, Stepper, type TrackingData } from "@/components/Tracking";
import { Badge, Card, Loadable } from "@/components/ui";
import { API_BASE } from "@/lib/config";

/** Public read-only tracking link (no login). Expires 24 h after delivery. */
function PublicTrackInner() {
  const token = useSearchParams().get("t") ?? "";
  const q = useQuery({
    queryKey: ["public-track", token],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/track/${token}`, { headers: { "ngrok-skip-browser-warning": "true" } });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message ?? "Tracking link invalid");
      return b.data as TrackingData;
    },
    refetchInterval: 60_000,
  });
  return (
    <Loadable q={q} rows={2} h="h-60">
      {(d) => (
        <div className="space-y-4">
          <div className="flex items-center gap-2"><h1 className="text-xl font-extrabold text-navy">Order {d.orderNo}</h1><Badge value={d.status} />{d.priority === "EMERGENCY" && <Badge value="EMERGENCY" />}</div>
          <p className="text-sm text-muted">Delivering to {d.destination.hospital}</p>
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <LiveTracking data={d} orderId={d.orderId} trackToken={token} onStatus={() => q.refetch()} />
            <Card><Stepper status={d.status} timeline={d.timeline} /></Card>
          </div>
        </div>
      )}
    </Loadable>
  );
}

export default function PublicTrack() {
  return (
    <Suspense>
      <PublicTrackInner />
    </Suspense>
  );
}
