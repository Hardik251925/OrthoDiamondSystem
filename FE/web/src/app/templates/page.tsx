"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Btn, Card, Loadable } from "@/components/ui";
import { ApiError, get, post } from "@/lib/api";
import { rupees } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useCheckout } from "@/lib/store";

interface Tpl { id: string; name: string; description: string; kit: { name: string; type: string } | null; items: { variantId: string; sku: string; qty: number; label: string; pricePaise: number | null; stockStatus: string }[] }

export default function Templates() {
  const { t } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const priority = useCheckout((s) => s.draft.priority);
  const update = useCheckout((s) => s.update);
  const q = useQuery({ queryKey: ["templates"], queryFn: () => get<Tpl[]>("/procedure-templates") });
  const [err, setErr] = useState<string | null>(null);
  const use = async (tpl: Tpl) => {
    setErr(null);
    try { await post(`/cart/from-template/${tpl.id}`); update({ patient: { ...useCheckout.getState().draft.patient, procedure: tpl.name } }); qc.invalidateQueries({ queryKey: ["cart"] }); router.push("/cart"); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Failed"); }
  };
  return (
    <div className="space-y-4">
      {priority === "EMERGENCY" && <div className="rounded-2xl bg-coral p-4 font-bold text-white">🚨 EMERGENCY order — pick the procedure, review the cart, confirm. <button className="ml-2 underline" onClick={() => update({ priority: "SCHEDULED" })}>switch to scheduled</button></div>}
      <h1 className="text-2xl font-extrabold text-navy">{t("templates")}</h1>
      <p className="text-sm text-muted">Admin-defined implant lists for common procedures. One tap fills your cart; adjust sizes before checkout.</p>
      {err && <div className="text-sm text-bad">{err}</div>}
      <Loadable q={q} rows={3} h="h-32">
        {(ts) => (
          <div className="grid gap-4 md:grid-cols-2">
            {ts.map((tpl) => (
              <Card key={tpl.id}>
                <div className="flex items-start justify-between gap-2"><h2 className="text-lg font-extrabold text-navy">{tpl.name}</h2>{tpl.kit && <Badge value={tpl.kit.type} />}</div>
                <p className="text-xs text-muted">{tpl.description}{tpl.kit && ` · Kit: ${tpl.kit.name}`}</p>
                <ul className="my-3 space-y-1 text-sm">{tpl.items.map((i) => <li key={i.variantId} className="flex justify-between gap-2"><span>{i.label} <span className="text-muted">×{i.qty}</span></span>{i.stockStatus === "OUT_OF_STOCK" ? <Badge value="OUT_OF_STOCK" /> : <span className="text-muted">{rupees(i.pricePaise != null ? i.pricePaise * i.qty : null)}</span>}</li>)}</ul>
                <Btn variant={priority === "EMERGENCY" ? "emergency" : "primary"} className="w-full" onClick={() => use(tpl)}>Use template →</Btn>
              </Card>
            ))}
          </div>
        )}
      </Loadable>
      <p className="text-center text-sm text-muted">Need something else? <Link href="/search?q=" className="font-semibold text-cyan">{t("browse")}</Link></p>
    </div>
  );
}
