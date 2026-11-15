"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ProductGrid } from "@/components/Catalog";

function SearchInner() {
  const q = useSearchParams().get("q") ?? "";
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold text-navy">{q ? `Results for “${q}”` : "All products"}</h1>
      <ProductGrid query={q ? `q=${encodeURIComponent(q)}` : ""} />
    </div>
  );
}

export default function SearchPage() {
  return <Suspense><SearchInner /></Suspense>;
}
