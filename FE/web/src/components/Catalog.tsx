"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, get } from "@/lib/api";
import { asset } from "@/lib/config";
import { rupees } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { Badge, Loadable, cx } from "./ui";

export interface Category { id: string; name: string; slug: string; image: string | null; productCount: number }
export interface ProductCard { id: string; name: string; slug: string; category: { name: string; slug: string }; brand: string | null; images: string[]; isSterile: boolean; variantCount: number; inStockCount: number; priceFromPaise: number | null }

export function CategoryGrid() {
  const q = useQuery({ queryKey: ["cats"], queryFn: () => get<Category[]>("/catalog/categories") });
  return (
    <Loadable q={q} rows={2} h="h-24">
      {(cs) => (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {cs.filter((c) => c.productCount > 0).map((c) => (
            <Link key={c.id} href={`/category?slug=${c.slug}`} className="group flex items-center gap-3 rounded-2xl border border-line bg-white p-3 transition hover:border-cyan hover:shadow-md">
              {c.image && <img src={asset(c.image)} alt="" className="h-12 w-12 rounded-xl" />}
              <div><div className="text-sm font-bold text-navy group-hover:text-cyan">{c.name}</div><div className="text-xs text-muted">{c.productCount} products</div></div>
            </Link>
          ))}
        </div>
      )}
    </Loadable>
  );
}

export function ProductGrid({ query }: { query: string }) {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ["products", query], queryFn: () => api<ProductCard[]>(`/catalog/products?pageSize=60&${query}`) });
  return (
    <Loadable q={{ ...q, data: q.data?.data }} rows={3} h="h-28" empty={(d) => !d.length}>
      {(ps) => (
        <>
          {!q.data?.meta?.pricesVisible && <div className="mb-3 rounded-xl bg-cyan-soft px-3 py-2 text-xs text-navy">🔒 {t("pricesHidden")}</div>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ps.map((p) => (
              <Link key={p.id} href={`/product?slug=${p.slug}`} className="group flex gap-3 rounded-2xl border border-line bg-white p-3 transition hover:border-cyan hover:shadow-md">
                <img src={asset(p.images[0])} alt="" className="h-20 w-20 shrink-0 rounded-xl bg-cyan-soft" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold tracking-wide text-cyan uppercase">{p.category.name}</div>
                  <div className="truncate font-bold text-navy group-hover:text-cyan">{p.name}</div>
                  <div className="text-xs text-muted">{p.brand} {p.isSterile && "· Sterile"}</div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className={cx(p.inStockCount < p.variantCount ? "text-warn" : "text-ok", "font-semibold")}>{p.inStockCount}/{p.variantCount} sizes in stock</span>
                    {p.priceFromPaise != null && <span className="font-bold text-navy">from {rupees(p.priceFromPaise)}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </Loadable>
  );
}

export function KitStrip() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ["kits"], queryFn: () => get<{ id: string; name: string; slug: string; type: string; itemCount: number; availableOnDate: number; pricePaise: number | null; trayPhotos: string[] }[]>("/kits") });
  return (
    <Loadable q={q} rows={1} h="h-28">
      {(ks) => (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ks.map((k) => (
            <Link key={k.id} href={`/kit?slug=${k.slug}`} className="rounded-2xl border border-line bg-white p-4 transition hover:border-cyan hover:shadow-md">
              <div className="flex items-center justify-between"><b className="text-navy">{k.name}</b><Badge value={k.type} /></div>
              <div className="mt-1 text-xs text-muted">{k.itemCount} items {k.pricePaise != null && `· ${k.type === "LOAN" ? "rental " : ""}${rupees(k.pricePaise)}`}</div>
              <div className={cx("mt-2 text-xs font-bold", k.availableOnDate ? "text-ok" : "text-bad")}>{k.availableOnDate ? `${k.availableOnDate} ${t("kitsToday").toLowerCase()}` : t("outOfStock")}</div>
            </Link>
          ))}
        </div>
      )}
    </Loadable>
  );
}
