"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, Card, Loadable, cx } from "@/components/ui";
import { get, post } from "@/lib/api";
import { dt } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { ordersSocket } from "@/lib/socket";

interface Note { id: string; title: string; body: string; createdAt: string; readAt: string | null; payload?: { orderId?: string; productSlug?: string } }

export default function Notifications() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notes"], queryFn: () => get<Note[]>("/notifications") });
  useEffect(() => {
    const s = ordersSocket();
    const f = () => qc.invalidateQueries({ queryKey: ["notes"] });
    s.on("notification", f);
    return () => { s.off("notification", f); };
  }, [qc]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-extrabold text-navy">{t("notifications")}</h1><Btn variant="outline" onClick={async () => { await post("/notifications/read-all"); q.refetch(); }}>Mark all read</Btn></div>
      <Loadable q={q} rows={4} empty={(d) => !d.length}>
        {(ns) => (
          <Card className="divide-y divide-line p-0">
            {ns.map((n) => {
              const href = n.payload?.orderId ? `/order?id=${n.payload.orderId}` : n.payload?.productSlug ? `/product?slug=${n.payload.productSlug}` : null;
              const body = <><div className="font-bold text-navy">{n.title}</div><div className="text-sm">{n.body}</div><div className="text-xs text-muted">{dt(n.createdAt)}</div></>;
              return <div key={n.id} className={cx("p-4", !n.readAt && "bg-cyan-soft/50")}>{href ? <Link href={href}>{body}</Link> : body}</div>;
            })}
          </Card>
        )}
      </Loadable>
    </div>
  );
}
