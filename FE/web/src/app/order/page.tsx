"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useState, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LiveTracking, Stepper, type TrackingData } from "@/components/Tracking";
import { Badge, Btn, Card, Loadable } from "@/components/ui";
import { api, get, openPdf, post } from "@/lib/api";
import { dt, rupees } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

interface Order {
  id: string; orderNo: string; status: string; priority: string; createdAt: string; surgeryAt: string; rejectReason: string | null; paymentMode: string;
  patient: { name: string; age?: number; procedure: string; side?: string; uhid?: string }; deliveryAddress: string; deliveryContactName: string; deliveryContactPhone: string;
  hospital: { name: string }; subtotalPaise: number; gstPaise: number; totalPaise: number;
  items: { id: string; description: string; qty: number; lineTotalPaise: number }[];
  assignedAgent: { vehicleNo: string; user: { name: string; phone: string } } | null;
  kitBookings: { id: string; kit: { name: string }; expectedReturnAt: string | null; returnedAt: string | null }[];
}

function OrderPageInner() {
  const id = useSearchParams().get("id") ?? "";
  const { t } = useI18n();
  const placed = useSearchParams().has("placed");
  const o = useQuery({ queryKey: ["order", id], queryFn: () => get<Order>(`/orders/${id}`) });
  const tr = useQuery({ queryKey: ["tracking", id], queryFn: () => get<TrackingData>(`/orders/${id}/tracking`), refetchInterval: 60_000 });
  const qc = useQueryClient();
  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["order", id] });
    qc.invalidateQueries({ queryKey: ["tracking", id] });
  }, [qc, id]);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const share = async () => {
    const { url } = await post<{ url: string }>(`/orders/${id}/track-link`);
    const text = `Track Ortho Diamond order ${o.data?.orderNo}: ${url}`;
    if (navigator.share) { await navigator.share({ title: "Ortho Diamond tracking", text, url }).catch(() => undefined); return; }
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setShareMsg(`Link copied: ${url}`);
  };

  return (
    <Loadable q={o} rows={3} h="h-40">
      {(ord) => (
        <div className="space-y-4">
          {placed && <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-ok">✓ Order placed. Ortho Diamond has been alerted on WhatsApp{ord.priority === "EMERGENCY" ? " as an EMERGENCY" : ""}. You will see every status change here live.</div>}
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/orders" className="text-sm text-muted">← {t("orders")}</Link>
            <h1 className="text-2xl font-extrabold text-navy">{ord.orderNo}</h1>
            <Badge value={ord.status} />{ord.priority === "EMERGENCY" && <Badge value="EMERGENCY" />}
            <div className="ml-auto flex flex-wrap gap-2">
              <Btn variant="outline" onClick={share}>🔗 {t("share")}</Btn>
              <Btn variant="outline" onClick={() => openPdf(`/orders/${id}/invoice`)}>{t("invoice")}</Btn>
              {["PLACED", "ACCEPTED"].includes(ord.status) && <Btn variant="danger" onClick={async () => { const reason = window.prompt("Reason for cancelling?"); if (reason) { await api(`/orders/${id}/cancel`, { method: "POST", json: { reason } }).catch((e) => alert(e.message)); refresh(); } }}>{t("cancel")}</Btn>}
            </div>
          </div>
          {shareMsg && <div className="break-all rounded-xl bg-cyan-soft p-2 text-xs">{shareMsg}</div>}
          {ord.rejectReason && <div className="rounded-xl bg-red-50 p-3 text-sm text-bad">Rejected: {ord.rejectReason}</div>}
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <div className="space-y-4">
              <Loadable q={tr} rows={1} h="h-80">{(td) => <LiveTracking data={td} orderId={id} onStatus={refresh} />}</Loadable>
              <Card>
                <h2 className="mb-2 font-extrabold text-navy">Items</h2>
                <table className="w-full text-sm"><tbody>{ord.items.map((i) => <tr key={i.id} className="border-t border-line"><td className="py-1.5">{i.description}</td><td className="text-right">×{i.qty}</td><td className="w-24 text-right">{rupees(i.lineTotalPaise)}</td></tr>)}</tbody></table>
                <div className="mt-2 flex justify-between border-t border-line pt-2 text-sm"><span className="text-muted">GST</span><span>{rupees(ord.gstPaise)}</span></div>
                <div className="flex justify-between text-lg font-extrabold text-navy"><span>Total</span><span>{rupees(ord.totalPaise)}</span></div>
                {ord.kitBookings.map((b) => <div key={b.id} className="mt-2 rounded-xl bg-violet-50 p-2 text-xs">🧰 {b.kit.name} (loan) — {b.returnedAt ? `returned ${dt(b.returnedAt)}` : `to be returned by ${dt(b.expectedReturnAt)}`}</div>)}
              </Card>
            </div>
            <div className="space-y-4">
              <Card><h2 className="mb-3 font-extrabold text-navy">Status</h2><Loadable q={tr} rows={3} h="h-8">{(td) => <Stepper status={ord.status} timeline={td.timeline} />}</Loadable></Card>
              <Card className="space-y-1 text-sm">
                <div className="text-xs text-muted">Patient</div><b>{ord.patient.name}</b> {ord.patient.age && `· ${ord.patient.age}y`}<div>{ord.patient.procedure} {ord.patient.side && `(${ord.patient.side})`}</div>
                <div className="pt-2 text-xs text-muted">Surgery</div><div>{dt(ord.surgeryAt)}</div>
                <div className="pt-2 text-xs text-muted">Deliver to</div><div>{ord.hospital.name}</div><div className="text-xs text-muted">{ord.deliveryAddress}</div>
                <div className="pt-2 text-xs text-muted">Payment</div><div>{ord.paymentMode.replace(/_/g, " ").toLowerCase()}</div>
              </Card>
            </div>
          </div>
        </div>
      )}
    </Loadable>
  );
}

export default function OrderPage() {
  return (
    <Suspense>
      <OrderPageInner />
    </Suspense>
  );
}
