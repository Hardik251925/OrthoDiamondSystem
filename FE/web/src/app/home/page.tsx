"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { CategoryGrid, KitStrip } from "@/components/Catalog";
import { useHydrated } from "@/components/Header";
import { Badge, Card } from "@/components/ui";
import { get } from "@/lib/api";
import { asset } from "@/lib/config";
import { dt, rupees } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { isApproved, useCheckout, useSession } from "@/lib/store";

export default function Home() {
  const { t } = useI18n();
  const router = useRouter();
  const hydrated = useHydrated();
  const user = useSession((s) => s.user);
  const approved = isApproved(user);
  const update = useCheckout((s) => s.update);
  useEffect(() => { if (hydrated && !user) router.replace("/login"); else if (hydrated && user && !approved) router.replace("/pending"); }, [hydrated, user, approved, router]);
  const orders = useQuery({ queryKey: ["orders", "recent"], queryFn: () => get<{ id: string; orderNo: string; status: string; priority: string; totalPaise: number; createdAt: string; hospital: { name: string } }[]>("/orders?pageSize=4"), enabled: approved });
  const banners = useQuery({ queryKey: ["banners"], queryFn: () => get<{ id: string; title: string; imageUrl: string; linkUrl: string | null }[]>("/catalog/banners") });
  if (!hydrated || !user) return null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><div className="text-sm text-muted">Good to see you</div><h1 className="text-2xl font-extrabold text-navy">{user.name}</h1></div>
        <button onClick={() => { update({ priority: "EMERGENCY" }); router.push("/templates?emergency=1"); }} className="rounded-2xl bg-coral px-6 py-4 text-left font-extrabold text-white shadow-xl shadow-coral/30 transition hover:scale-[1.02]">
          🚨 {t("emergency")}<div className="text-xs font-medium opacity-90">Patient on the table? We dispatch first.</div>
        </button>
      </div>
      {banners.data && banners.data.length > 0 && (
        <div id="bannerCarousel" className="carousel slide rounded-4 overflow-hidden shadow-sm" data-bs-ride="carousel">
          <div className="carousel-inner">
            {banners.data.map((b, i) => (
              <div key={b.id} className={`carousel-item ${i === 0 ? "active" : ""}`}>
                <Link href={b.linkUrl ?? "/search?q="}><img src={asset(b.imageUrl)} alt={b.title} className="d-block w-100" /></Link>
              </div>
            ))}
          </div>
          {banners.data.length > 1 && (
            <>
              <button className="carousel-control-prev" type="button" data-bs-target="#bannerCarousel" data-bs-slide="prev"><span className="carousel-control-prev-icon" aria-hidden="true" /><span className="visually-hidden">Previous</span></button>
              <button className="carousel-control-next" type="button" data-bs-target="#bannerCarousel" data-bs-slide="next"><span className="carousel-control-next-icon" aria-hidden="true" /><span className="visually-hidden">Next</span></button>
            </>
          )}
        </div>
      )}
      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold text-navy">{t("recent")}</h2><Link href="/orders" className="text-sm font-semibold text-cyan">All →</Link></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(orders.data ?? []).map((o) => (
            <Link key={o.id} href={`/order?id=${o.id}`} className="rounded-2xl border border-line bg-white p-3 hover:border-cyan">
              <div className="flex justify-between text-xs"><b className="text-navy">{o.orderNo}</b>{o.priority === "EMERGENCY" && <Badge value="EMERGENCY" />}</div>
              <div className="mt-1"><Badge value={o.status} /></div>
              <div className="mt-1 text-xs text-muted">{o.hospital.name} · {dt(o.createdAt)}</div>
              <div className="text-sm font-bold text-navy">{rupees(o.totalPaise)}</div>
            </Link>
          ))}
          {orders.data?.length === 0 && <Card className="text-sm text-muted sm:col-span-4">No orders yet — start from a procedure template.</Card>}
        </div>
      </section>
      <section><h2 className="mb-3 text-lg font-extrabold text-navy">{t("categories")}</h2><CategoryGrid /></section>
      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold text-navy">{t("kitsToday")}</h2><Link href="/templates" className="text-sm font-semibold text-cyan">{t("templates")} →</Link></div>
        <KitStrip />
      </section>
    </div>
  );
}
