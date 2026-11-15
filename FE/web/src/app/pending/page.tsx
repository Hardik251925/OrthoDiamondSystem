"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card } from "@/components/ui";
import { get } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { isApproved, useSession, type SessionUser } from "@/lib/store";

export default function Pending() {
  const { t } = useI18n();
  const router = useRouter();
  const setUser = useSession((s) => s.setUser);
  const me = useQuery({ queryKey: ["me"], queryFn: () => get<SessionUser>("/auth/me"), refetchInterval: 15_000 });
  useEffect(() => {
    if (!me.data) return;
    setUser(me.data);
    if (isApproved(me.data)) router.replace("/home");
  }, [me.data, setUser, router]);
  const st = me.data?.doctor?.status ?? "PENDING";
  return (
    <Card className="mx-auto mt-8 max-w-lg text-center">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-cyan-soft text-3xl">{st === "REJECTED" ? "✕" : "⏳"}</div>
      <h1 className="text-xl font-extrabold text-navy">{st === "REJECTED" ? "Registration not approved" : t("pendingTitle")}</h1>
      <div className="my-2"><Badge value={st} /></div>
      <p className="text-sm text-muted">{st === "REJECTED" ? `Reason: ${me.data?.doctor?.rejectReason ?? "—"}. Please contact Ortho Diamond.` : t("pendingBody")}</p>
      <p className="mt-2 text-xs text-muted">This page refreshes automatically when you are approved.</p>
      <Link href="/search?q=" className="mt-5 inline-block rounded-xl bg-navy px-5 py-2.5 font-semibold text-white">{t("browse")}</Link>
    </Card>
  );
}
