"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useHydrated } from "@/components/Header";
import { Badge, Btn, Card, Loadable, cx } from "@/components/ui";
import { ApiError, get, post } from "@/lib/api";
import { asset } from "@/lib/config";
import { attrText, rupees } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { isApproved, useSession } from "@/lib/store";

interface Variant { id: string; sku: string; attributes: Record<string, number | string>; material: { code: string; name: string } | null; pricePaise: number | null; mrpPaise: number | null; stockStatus: string; availableQty: number | null }
interface Product { id: string; name: string; description: string; hsnCode: string; gstPercent: number; isSterile: boolean; images: string[]; category: { name: string; slug: string }; brand: { name: string } | null; pricesVisible: boolean; variants: Variant[] }

/** Size matrix: rows = length (or holes/angle), columns = diameter (or side). One grid per material. */
function axes(vs: Variant[]) {
  const vals = (k: string) => [...new Set(vs.map((v) => v.attributes[k]).filter((x) => x !== undefined))] as (number | string)[];
  const keys = ["lengthMm", "holes", "diameterMm", "side", "angle"].filter((k) => vals(k).length > 1);
  const rowKey = keys.find((k) => k === "lengthMm" || k === "holes") ?? keys[0] ?? "lengthMm";
  const colKey = keys.find((k) => k !== rowKey) ?? null;
  const sort = (a: (number | string)[]) => a.sort((x, y) => (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))));
  return { rowKey, colKey, rows: sort(vals(rowKey)), cols: colKey ? sort(vals(colKey)) : [null] };
}
const unit = (k: string | null, v: unknown) => (k === "lengthMm" || k === "diameterMm" ? `${v}mm` : k === "holes" ? `${v}H` : k === "angle" ? `${v}°` : k === "side" ? (v === "L" ? "Left" : "Right") : String(v ?? ""));

function ProductPageInner() {
  const slug = useSearchParams().get("slug") ?? "";
  const { t } = useI18n();
  const qc = useQueryClient();
  const hydrated = useHydrated();
  const user = useSession((s) => s.user);
  const approved = hydrated && isApproved(user);
  const q = useQuery({ queryKey: ["product", slug, approved], queryFn: () => get<Product>(`/catalog/products/${slug}`) });
  const [mat, setMat] = useState<string | null>(null);
  const [sel, setSel] = useState<Variant | null>(null);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const materials = useMemo(() => [...new Set((q.data?.variants ?? []).map((v) => v.material?.code ?? "—"))], [q.data]);
  const curMat = mat ?? materials[0] ?? "—";
  const vs = useMemo(() => (q.data?.variants ?? []).filter((v) => (v.material?.code ?? "—") === curMat), [q.data, curMat]);
  const grid = useMemo(() => axes(vs), [vs]);
  const find = (r: unknown, c: unknown) => vs.find((v) => v.attributes[grid.rowKey] === r && (grid.colKey ? v.attributes[grid.colKey] === c : true));
  const similar = useMemo(() => {
    if (!sel) return [];
    const n = (v: Variant) => ["diameterMm", "lengthMm", "holes"].reduce((d, k) => d + Math.abs(Number(v.attributes[k] ?? 0) - Number(sel.attributes[k] ?? 0)), 0);
    return (q.data?.variants ?? []).filter((v) => v.id !== sel.id && v.stockStatus !== "OUT_OF_STOCK").sort((a, b) => n(a) - n(b)).slice(0, 3);
  }, [sel, q.data]);

  const add = async () => {
    if (!sel) return;
    setMsg(null);
    try { await post("/cart/items", { variantId: sel.id, qty }); qc.invalidateQueries({ queryKey: ["cart"] }); setMsg({ ok: true, text: `Added ${qty} × ${sel.sku}` }); }
    catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Failed" }); }
  };
  const notify = async () => {
    if (!sel) return;
    try { await post("/stock-alerts", { variantId: sel.id }); setMsg({ ok: true, text: "We'll notify you when this size is back in stock." }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" }); }
  };

  return (
    <Loadable q={q} rows={4} h="h-40">
      {(p) => (
        <div className="space-y-5">
          <div className="text-sm text-muted"><Link href={`/category?slug=${p.category.slug}`} className="hover:text-cyan">{p.category.name}</Link> / {p.name}</div>
          <div className="grid gap-5 md:grid-cols-[280px_1fr]">
            <img src={asset(p.images[0])} alt="" className="aspect-square w-full rounded-3xl border border-line bg-cyan-soft" />
            <div>
              <h1 className="text-2xl font-extrabold text-navy sm:text-3xl">{p.name}</h1>
              <div className="mt-1 text-sm text-muted">{p.brand?.name} · HSN {p.hsnCode} · GST {p.gstPercent}% {p.isSterile && "· Sterile packed"}</div>
              <p className="mt-3 text-sm leading-relaxed">{p.description}</p>
              {!p.pricesVisible && <div className="mt-3 rounded-xl bg-cyan-soft px-3 py-2 text-sm text-navy">🔒 {t("pricesHidden")}. <Link href="/login" className="font-bold underline">Log in</Link></div>}
              {materials.length > 1 && (
                <div className="mt-4 flex gap-2">{materials.map((m) => <button key={m} onClick={() => { setMat(m); setSel(null); }} className={cx("rounded-full px-4 py-1.5 text-sm font-bold", curMat === m ? "bg-navy text-white" : "border border-line bg-white")}>{m === "TI" ? "Titanium" : m === "SS" ? "Stainless steel" : m}</button>)}</div>
              )}
            </div>
          </div>

          <Card>
            <div className="mb-2 flex items-center justify-between"><h2 className="font-extrabold text-navy">Choose size</h2><span className="text-xs text-muted">Greyed cells are out of stock</span></div>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-1.5 text-sm">
                {grid.colKey && <thead><tr><th />{grid.cols.map((c) => <th key={String(c)} className="px-2 text-xs text-muted">{unit(grid.colKey, c)}</th>)}</tr></thead>}
                <tbody>
                  {grid.rows.map((r) => (
                    <tr key={String(r)}>
                      <th className="pr-2 text-right text-xs whitespace-nowrap text-muted">{unit(grid.rowKey, r)}</th>
                      {grid.cols.map((c) => {
                        const v = find(r, c);
                        if (!v) return <td key={String(c)} />;
                        const oos = v.stockStatus === "OUT_OF_STOCK";
                        return (
                          <td key={String(c)}>
                            <button onClick={() => { setSel(v); setQty(1); setMsg(null); }} title={v.sku}
                              className={cx("min-w-[64px] rounded-xl border px-2 py-2 text-center transition", sel?.id === v.id ? "border-navy bg-navy text-white" : oos ? "border-dashed border-line bg-slate-100 text-slate-400 line-through" : v.stockStatus === "LOW_STOCK" ? "border-warn/50 bg-amber-50 hover:border-navy" : "border-line bg-white hover:border-cyan")}>
                              <div className="text-xs font-bold">{v.pricePaise != null ? rupees(v.pricePaise) : unit(grid.rowKey, r)}</div>
                              <div className="text-[10px]">{oos ? "Out" : v.stockStatus === "LOW_STOCK" ? "Low" : "✓"}</div>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {sel && (
            <Card className="sticky bottom-3 z-10 border-cyan shadow-xl">
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-navy">{p.name} · {attrText(sel.attributes)} · {sel.material?.code}</div>
                  <div className="text-xs text-muted">SKU {sel.sku} {sel.availableQty != null && `· ${sel.availableQty} available`}</div>
                  <div className="mt-1"><Badge value={sel.stockStatus} /> {sel.pricePaise != null && <b className="ml-2 text-lg text-navy">{rupees(sel.pricePaise)}</b>} {sel.mrpPaise != null && <s className="ml-1 text-xs text-muted">{rupees(sel.mrpPaise)}</s>} {sel.pricePaise != null && <span className="text-xs text-muted">+ GST</span>}</div>
                </div>
                {sel.stockStatus === "OUT_OF_STOCK" ? (
                  <div className="flex flex-col gap-2">
                    <div className="text-sm font-bold text-bad">{t("outOfStock")}</div>
                    {approved && <Btn variant="outline" onClick={notify}>🔔 {t("notifyMe")}</Btn>}
                  </div>
                ) : approved ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-xl border border-line">
                      <button className="px-3 py-2" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
                      <span className="w-8 text-center font-bold">{qty}</span>
                      <button className="px-3 py-2" onClick={() => setQty(Math.min(sel.availableQty ?? 99, qty + 1))}>+</button>
                    </div>
                    <Btn onClick={add}>{t("addToCart")}</Btn>
                  </div>
                ) : (
                  <Link href="/login" className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white">{t("login")}</Link>
                )}
              </div>
              {sel.stockStatus === "OUT_OF_STOCK" && similar.length > 0 && (
                <div className="mt-3 border-t border-line pt-3">
                  <div className="mb-2 text-xs font-bold text-navy">{t("similar")}</div>
                  <div className="flex flex-wrap gap-2">{similar.map((v) => <button key={v.id} onClick={() => setSel(v)} className="rounded-xl border border-cyan bg-cyan-soft px-3 py-1.5 text-xs font-semibold">{attrText(v.attributes)} {v.material?.code} {v.pricePaise != null && `· ${rupees(v.pricePaise)}`}</button>)}</div>
                </div>
              )}
              {msg && <div className={cx("mt-2 text-sm font-semibold", msg.ok ? "text-ok" : "text-bad")}>{msg.text} {msg.ok && msg.text.startsWith("Added") && <Link href="/cart" className="underline">View cart →</Link>}</div>}
            </Card>
          )}
        </div>
      )}
    </Loadable>
  );
}

export default function ProductPage() {
  return (
    <Suspense>
      <ProductPageInner />
    </Suspense>
  );
}
