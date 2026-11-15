"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useHydrated } from "@/components/Header";
import { Badge, Btn, Card, Loadable, cx } from "@/components/ui";
import { ApiError, get, post } from "@/lib/api";
import { asset } from "@/lib/config";
import { rupees } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { isApproved, useSession } from "@/lib/store";

interface Kit { id: string; name: string; type: string; description: string; physicalSets: number; trayPhotos: string[]; pricePaise: number | null; sterilisationStatus: string; contents: { variantId: string; sku: string; qty: number; label: string; productSlug: string; stockStatus: string }[]; calendar: { date: string; available: number }[] }

function KitPageInner() {
  const slug = useSearchParams().get("slug") ?? "";
  const { t } = useI18n();
  const qc = useQueryClient();
  const hydrated = useHydrated();
  const approved = hydrated && isApproved(useSession.getState().user);
  const q = useQuery({ queryKey: ["kit", slug, approved], queryFn: () => get<Kit>(`/kits/${slug}`) });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <Loadable q={q} rows={3} h="h-40">
      {(k) => (
        <div className="space-y-5">
          <Link href="/kits" className="text-sm text-muted">← {t("kits")}</Link>
          <div className="grid gap-5 md:grid-cols-[260px_1fr]">
            <img src={asset(k.trayPhotos[0])} alt="tray" className="aspect-square w-full rounded-3xl border border-line bg-cyan-soft" />
            <div>
              <div className="flex items-center gap-2"><h1 className="text-2xl font-extrabold text-navy">{k.name}</h1><Badge value={k.type} /></div>
              <p className="mt-2 text-sm">{k.description}</p>
              <div className="mt-2 text-sm text-muted">{k.physicalSets} physical sets · {k.sterilisationStatus.replace(/_/g, " ").toLowerCase()}</div>
              {k.pricePaise != null && <div className="mt-2 text-xl font-extrabold text-navy">{rupees(k.pricePaise)} <span className="text-xs font-medium text-muted">{k.type === "LOAN" ? "rental per surgery + used items" : "+ GST"}</span></div>}
              {approved ? <Btn className="mt-4" onClick={async () => { try { await post("/cart/items", { kitId: k.id, qty: 1 }); qc.invalidateQueries({ queryKey: ["cart"] }); setMsg({ ok: true, text: "Kit added to cart" }); } catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Failed" }); } }}>{t("addToCart")}</Btn> : <Link href="/login" className="mt-4 inline-block rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white">{t("login")}</Link>}
              {msg && <div className={cx("mt-2 text-sm font-semibold", msg.ok ? "text-ok" : "text-bad")}>{msg.text} {msg.ok && <Link href="/cart" className="underline">View cart →</Link>}</div>}
            </div>
          </div>
          <Card>
            <h2 className="mb-2 font-extrabold text-navy">Availability — next 14 days</h2>
            <div className="grid grid-cols-7 gap-1.5">
              {k.calendar.map((c) => <div key={c.date} className={cx("rounded-xl p-2 text-center text-xs", c.available ? "bg-emerald-50 text-ok" : "bg-red-50 text-bad")}><div className="text-muted">{new Date(c.date).toLocaleDateString("en-IN", { weekday: "short" })}</div><div className="font-bold">{new Date(c.date).getDate()}</div><div>{c.available} free</div></div>)}
            </div>
          </Card>
          <Card>
            <h2 className="mb-2 font-extrabold text-navy">Tray contents ({k.contents.length})</h2>
            <table className="w-full text-sm"><tbody>{k.contents.map((c) => <tr key={c.variantId} className="border-t border-line"><td className="py-1.5"><Link href={`/product?slug=${c.productSlug}`} className="hover:text-cyan">{c.label}</Link></td><td className="text-xs text-muted">{c.sku}</td><td className="text-right font-bold">×{c.qty}</td></tr>)}</tbody></table>
          </Card>
        </div>
      )}
    </Loadable>
  );
}

export default function KitPage() {
  return (
    <Suspense>
      <KitPageInner />
    </Suspense>
  );
}
