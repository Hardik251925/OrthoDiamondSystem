"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { isApproved, useSession } from "@/lib/store";

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M32 5 L57 25 L32 59 L7 25 Z" fill="#13C4E3" />
      <path d="M7 25 H57 M32 5 L21 25 L32 59 L43 25 Z" fill="none" stroke="#0B2545" strokeWidth="2.6" strokeLinejoin="round" />
    </svg>
  );
}

const noopSubscribe = () => () => undefined;
/** false during SSR / first hydration pass, true in the browser — avoids hydration mismatches with persisted state. */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function Header() {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const hydrated = useHydrated();
  const { user, refreshToken, logout } = useSession();
  const approved = isApproved(user);
  const [q, setQ] = useState("");
  const cart = useQuery({ queryKey: ["cart"], queryFn: () => get<{ count: number }>("/cart"), enabled: hydrated && approved });
  const notes = useQuery({ queryKey: ["notes"], queryFn: () => get<{ readAt: string | null }[]>("/notifications"), enabled: hydrated && !!user, refetchInterval: 60_000 });
  const unread = notes.data?.filter((n) => !n.readAt).length ?? 0;
  const doLogout = async () => { if (refreshToken) await post("/auth/logout", { refreshToken }).catch(() => undefined); logout(); router.push("/"); };

  return (
    <header className="sticky top-0 z-[500] border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <Link href={user ? "/home" : "/"} className="flex items-center gap-2">
          <Logo />
          <div className="leading-tight">
            <div className="text-[15px] font-extrabold tracking-wide text-navy">ORTHO DIAMOND</div>
            <div className="hidden text-[10px] font-semibold tracking-[.2em] text-cyan sm:block">SURGICAL PRECISION</div>
          </div>
        </Link>
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }} className="hidden flex-1 md:block">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="w-full rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-cyan" />
        </form>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <button onClick={() => setLang(lang === "en" ? "hi" : "en")} className="rounded-full border border-line px-2.5 py-1 text-xs">{lang === "en" ? "हिंदी" : "EN"}</button>
          {hydrated && user ? (
            <>
              <Link href="/notifications" className="relative rounded-full border border-line px-2.5 py-1">🔔{unread > 0 && <span className="absolute -top-1 -right-1 rounded-full bg-cyan px-1.5 text-[10px] font-bold text-navy">{unread}</span>}</Link>
              {approved && <Link href="/cart" className="relative rounded-full bg-navy px-3 py-1.5 font-semibold text-white">{t("cart")}{(cart.data?.count ?? 0) > 0 && <span className="ml-1.5 rounded-full bg-cyan px-1.5 text-xs text-navy">{cart.data?.count}</span>}</Link>}
              <Link href="/orders" className="hidden rounded-full px-2 py-1 hover:bg-cyan-soft sm:block">{t("orders")}</Link>
              <Link href="/profile" className="hidden rounded-full px-2 py-1 hover:bg-cyan-soft sm:block">{user.name.split(" ").slice(0, 2).join(" ")}</Link>
              <button onClick={doLogout} className="text-xs text-muted hover:text-bad">{t("logout")}</button>
            </>
          ) : (
            <>
              <Link href="/about" className="hidden rounded-full px-2 py-1 hover:bg-cyan-soft sm:block">About</Link>
              <Link href="/login" className="rounded-full bg-navy px-4 py-1.5 font-semibold text-white">{t("login")}</Link>
            </>
          )}
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }} className="px-4 pb-2 md:hidden">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="w-full rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-cyan" />
      </form>
    </header>
  );
}
