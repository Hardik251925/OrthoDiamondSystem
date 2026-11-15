"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Btn, Card, Loadable, cx } from "@/components/ui";
import { api, get, openPdf, post } from "@/lib/api";
import { dt, rupees } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

interface Row { id: string; orderNo: string; status: string; priority: string; totalPaise: number; createdAt: string; surgeryAt: string; hospital: { name: string }; _count: { items: number } }
const FILTERS: [string, string][] = [["", "All"], ["PLACED,ACCEPTED,PACKED", "Processing"], ["DISPATCHED,REACHED_HOSPITAL", "On the way"], ["DELIVERED_TO_OT,KIT_RETURN_PENDING,KIT_RETURNED,CLOSED", "Delivered"], ["CANCELLED,REJECTED", "Cancelled"]];

export default function Orders() {
  const { t } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const q = useQuery({ queryKey: ["orders", status], queryFn: () => get<Row[]>(`/orders?pageSize=50${status ? `&status=${status}` : ""}`) });

  const reorder = async (id: string) => {
    const o = await get<{ items: { variantId: string | null; kitId: string | null; qty: number; description: string }[] }>(`/orders/${id}`);
    for (const i of o.items) {
      if (i.description.startsWith("Used from") || i.description.startsWith("Missing from")) continue;
      await post("/cart/items", i.variantId ? { variantId: i.variantId, qty: i.qty } : { kitId: i.kitId, qty: i.qty }).catch(() => undefined);
    }
    qc.invalidateQueries({ queryKey: ["cart"] });
    router.push("/cart");
  };
  const cancel = async (id: string) => {
    const reason = window.prompt("Reason for cancelling?");
    if (!reason) return;
    await api(`/orders/${id}/cancel`, { method: "POST", json: { reason } }).catch((e) => alert(e.message));
    q.refetch();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-navy">{t("orders")}</h1>
      <div className="flex gap-2 overflow-x-auto">{FILTERS.map(([v, l]) => <button key={l} onClick={() => setStatus(v)} className={cx("rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap", status === v ? "bg-navy text-white" : "border border-line bg-white")}>{l}</button>)}</div>
      <Loadable q={q} rows={4} empty={(d) => !d.length}>
        {(rows) => (
          <div className="space-y-3">
            {rows.map((o) => (
              <Card key={o.id} className={cx(o.priority === "EMERGENCY" && "border-coral/60")}>
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/order?id=${o.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><b className="text-navy">{o.orderNo}</b><Badge value={o.status} />{o.priority === "EMERGENCY" && <Badge value="EMERGENCY" />}</div>
                    <div className="text-xs text-muted">{o.hospital.name} · {o._count.items} items · placed {dt(o.createdAt)} · surgery {dt(o.surgeryAt)}</div>
                  </Link>
                  <div className="text-lg font-extrabold text-navy">{rupees(o.totalPaise)}</div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/order?id=${o.id}`} className="rounded-xl bg-navy px-3 py-2 text-xs font-bold text-white">{t("track")}</Link>
                    <Btn variant="outline" className="px-3 py-2 text-xs" onClick={() => openPdf(`/orders/${o.id}/invoice`)}>{t("invoice")}</Btn>
                    <Btn variant="outline" className="px-3 py-2 text-xs" onClick={() => reorder(o.id)}>{t("reorder")}</Btn>
                    {["PLACED", "ACCEPTED"].includes(o.status) && <Btn variant="danger" className="px-3 py-2 text-xs" onClick={() => cancel(o.id)}>{t("cancel")}</Btn>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Loadable>
    </div>
  );
}
