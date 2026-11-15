"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProductGrid, type Category } from "@/components/Catalog";
import { cx, input } from "@/components/ui";
import { get } from "@/lib/api";

function CategoryPageInner() {
  const slug = useSearchParams().get("slug") ?? "";
  const cats = useQuery({ queryKey: ["cats"], queryFn: () => get<Category[]>("/catalog/categories") });
  const brands = useQuery({ queryKey: ["brands"], queryFn: () => get<{ id: string; name: string }[]>("/catalog/brands") });
  const [q, setQ] = useState("");
  const [brandId, setBrand] = useState("");
  const [sterile, setSterile] = useState("");
  const cat = cats.data?.find((c) => c.slug === slug);
  const query = [`category=${slug}`, q && `q=${encodeURIComponent(q)}`, brandId && `brandId=${brandId}`, sterile && `sterile=${sterile}`].filter(Boolean).join("&");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 overflow-x-auto">
        {(cats.data ?? []).filter((c) => c.productCount).map((c) => <Link key={c.id} href={`/category?slug=${c.slug}`} className={cx("rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap", c.slug === slug ? "bg-navy text-white" : "border border-line bg-white text-navy")}>{c.name}</Link>)}
      </div>
      <h1 className="text-2xl font-extrabold text-navy">{cat?.name ?? ""}</h1>
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter: e.g. 3.5, locking, titanium" className={input} />
        <select value={brandId} onChange={(e) => setBrand(e.target.value)} className={input}><option value="">All brands</option>{(brands.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select value={sterile} onChange={(e) => setSterile(e.target.value)} className={input}><option value="">Sterile & non-sterile</option><option value="true">Sterile only</option><option value="false">Non-sterile</option></select>
      </div>
      <ProductGrid query={query} />
    </div>
  );
}

export default function CategoryPage() {
  return (
    <Suspense>
      <CategoryPageInner />
    </Suspense>
  );
}
