"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Btn, Card, Empty, Loadable, cx } from "@/components/ui";
import { api, get } from "@/lib/api";
import { rupees } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useCheckout } from "@/lib/store";

export interface CartLine { id: string; type: "VARIANT" | "KIT"; variantId?: string; kitId?: string; kitType?: string; sku?: string; label: string; productSlug?: string; qty: number; unitPricePaise: number; lineTotalPaise: number; gstPercent: number; available: number; stockStatus: string; ok: boolean }
export interface Cart { items: CartLine[]; subtotalPaise: number; gstPaise: number; totalPaise: number; count: number }

export default function CartPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const priority = useCheckout((s) => s.draft.priority);
  const q = useQuery({ queryKey: ["cart"], queryFn: () => get<Cart>("/cart") });
  const setQty = async (id: string, qty: number) => { await api(`/cart/items/${id}`, { method: "PATCH", json: { qty } }).catch(() => undefined); qc.invalidateQueries({ queryKey: ["cart"] }); };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-navy">{t("cart")}</h1>
      <Loadable q={q} rows={3}>
        {(c) => c.items.length === 0 ? (
          <Empty>Your cart is empty. <Link href="/templates" className="font-semibold text-cyan">Start from a procedure template</Link></Empty>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Card className="divide-y divide-line p-0">
              {c.items.map((l) => (
                <div key={l.id} className={cx("flex flex-wrap items-center gap-3 p-4", !l.ok && "bg-red-50")}>
                  <div className="min-w-0 flex-1">
                    {l.productSlug ? <Link href={`/product?slug=${l.productSlug}`} className="font-bold text-navy hover:text-cyan">{l.label}</Link> : <b className="text-navy">{l.label}</b>}
                    <div className="text-xs text-muted">{l.sku ?? l.kitType} · {rupees(l.unitPricePaise)} · GST {l.gstPercent}%</div>
                    {!l.ok && <div className="mt-1 text-xs font-bold text-bad">Only {l.available} available — reduce quantity or pick another size</div>}
                    {l.stockStatus !== "IN_STOCK" && l.ok && <div className="mt-1"><Badge value={l.stockStatus} /></div>}
                  </div>
                  <div className="flex items-center rounded-xl border border-line bg-white">
                    <button className="px-3 py-1.5" onClick={() => setQty(l.id, l.qty - 1)}>−</button>
                    <span className="w-8 text-center font-bold">{l.qty}</span>
                    <button className="px-3 py-1.5" onClick={() => setQty(l.id, l.qty + 1)}>+</button>
                  </div>
                  <div className="w-24 text-right font-bold text-navy">{rupees(l.lineTotalPaise)}</div>
                  <button onClick={() => setQty(l.id, 0)} className="text-xs text-muted hover:text-bad">remove</button>
                </div>
              ))}
            </Card>
            <Card className="h-fit space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted">Subtotal</span><span>{rupees(c.subtotalPaise)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted">GST</span><span>{rupees(c.gstPaise)}</span></div>
              <div className="flex justify-between border-t border-line pt-2 text-lg font-extrabold text-navy"><span>Total</span><span>{rupees(c.totalPaise)}</span></div>
              <Link href="/checkout" className={cx("block rounded-xl py-3 text-center font-bold text-white", priority === "EMERGENCY" ? "bg-coral" : "bg-navy", !c.items.every((i) => i.ok) && "pointer-events-none opacity-40")}>{priority === "EMERGENCY" ? "🚨 " : ""}{t("checkout")} →</Link>
              <Btn variant="ghost" className="w-full" onClick={async () => { await api("/cart", { method: "DELETE" }); qc.invalidateQueries({ queryKey: ["cart"] }); }}>Clear cart</Btn>
            </Card>
          </div>
        )}
      </Loadable>
    </div>
  );
}
