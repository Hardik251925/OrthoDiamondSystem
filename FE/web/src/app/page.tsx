"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CategoryGrid, KitStrip } from "@/components/Catalog";
import { useHydrated } from "@/components/Header";
import { FaqAccordion, FounderSection, WhyCarousel } from "@/components/Marketing";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/store";

/** Public landing — catalogue without prices (SPEC §10). Logged-in users go to /home. */
export default function Landing() {
  const { t } = useI18n();
  const router = useRouter();
  const hydrated = useHydrated();
  const user = useSession((s) => s.user);
  useEffect(() => { if (hydrated && user) router.replace("/home"); }, [hydrated, user, router]);

  return (
    <div className="space-y-10">
      <section className="hero-bg relative -mx-4 -mt-5 overflow-hidden px-6 py-14 text-white sm:rounded-b-3xl">
        <div className="facets absolute inset-0 opacity-60" />
        <div className="relative max-w-2xl">
          <div className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-widest text-cyan">INDORE · 24×7 OT SUPPLY</div>
          <h1 className="text-3xl leading-tight font-extrabold sm:text-5xl">{t("tagline")}</h1>
          <p className="mt-4 max-w-xl text-white/80">Screws, plates, interlocking nails, K-wires and complete loan sets — ordered in minutes, tracked live on the map until they reach the OT.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/login" className="rounded-xl bg-coral px-5 py-3 font-bold text-white shadow-lg shadow-coral/30">🚨 {t("emergency")}</Link>
            <Link href="/register" className="rounded-xl bg-white px-5 py-3 font-bold text-navy">{t("register")}</Link>
            <Link href="/search?q=" className="rounded-xl border border-white/30 px-5 py-3 font-semibold text-white">{t("browse")}</Link>
          </div>
          <div className="mt-8 grid max-w-lg grid-cols-3 gap-4 text-center">
            {[["678", "implant sizes"], ["6", "operation kits"], ["~25 min", "avg. OT delivery"]].map(([n, l]) => (
              <div key={l} className="rounded-2xl bg-white/10 p-3"><div className="text-xl font-extrabold text-cyan">{n}</div><div className="text-xs text-white/70">{l}</div></div>
            ))}
          </div>
        </div>
      </section>
      <WhyCarousel />
      <FounderSection />
      <section><h2 className="mb-3 text-lg font-extrabold text-navy">{t("categories")}</h2><CategoryGrid /></section>
      <section><h2 className="mb-3 text-lg font-extrabold text-navy">{t("kits")}</h2><KitStrip /></section>
      <section className="grid gap-4 sm:grid-cols-3">
        {[["1. Verify once", "Register with your Medical Council number; Ortho Diamond approves you."], ["2. Order for the patient", "Pick sizes from the size matrix or a procedure template. Mark it EMERGENCY if the OT is waiting."], ["3. Track to the OT", "Watch the delivery live on the map, with ETA and a call button for the agent."]].map(([h, b]) => (
          <div key={h} className="rounded-2xl border border-line bg-white p-5"><div className="font-extrabold text-navy">{h}</div><p className="mt-1 text-sm text-muted">{b}</p></div>
        ))}
      </section>
      <section><h2 className="mb-3 text-lg font-extrabold text-navy">Frequently asked questions</h2><FaqAccordion /></section>
    </div>
  );
}
