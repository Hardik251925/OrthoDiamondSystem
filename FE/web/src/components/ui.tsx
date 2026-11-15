"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { statusLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Btn({ variant = "primary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" | "emergency" | "danger" }) {
  const v = {
    primary: "bg-navy text-white hover:bg-navy-2",
    ghost: "hover:bg-cyan-soft text-navy",
    outline: "border border-line bg-white text-navy hover:border-cyan",
    emergency: "bg-coral text-white hover:brightness-105 shadow-lg shadow-coral/30",
    danger: "border border-bad/40 text-bad hover:bg-bad/5",
  }[variant];
  return <button {...p} className={cx("inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40", v, className)} />;
}

export function Skeleton({ rows = 4, h = "h-16" }: { rows?: number; h?: string }) {
  return <div className="space-y-3">{Array.from({ length: rows }, (_, i) => <div key={i} className={cx("skeleton", h)} />)}</div>;
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-bad/30 bg-bad/5 p-4 text-sm text-bad">
      <span>{error instanceof Error ? error.message : "Something went wrong"}</span>
      {onRetry && <Btn variant="outline" onClick={onRetry}>{t("retry")}</Btn>}
    </div>
  );
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return <div className="rounded-2xl border border-dashed border-line bg-white p-10 text-center text-muted">{children ?? t("empty")}</div>;
}

export function Loadable<T>({ q, children, empty, rows, h }: { q: { isLoading: boolean; error: unknown; data?: T; refetch: () => unknown }; children: (d: T) => ReactNode; empty?: (d: T) => boolean; rows?: number; h?: string }) {
  if (q.isLoading) return <Skeleton rows={rows} h={h} />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  if (q.data === undefined) return null;
  if (empty?.(q.data)) return <Empty />;
  return <>{children(q.data)}</>;
}

const COLORS: Record<string, string> = {
  PLACED: "bg-sky-100 text-sky-800", ACCEPTED: "bg-indigo-100 text-indigo-800", PACKED: "bg-violet-100 text-violet-800", DISPATCHED: "bg-cyan-soft text-navy",
  REACHED_HOSPITAL: "bg-teal-100 text-teal-800", DELIVERED_TO_OT: "bg-emerald-100 text-emerald-800", KIT_RETURN_PENDING: "bg-orange-100 text-orange-800",
  KIT_RETURNED: "bg-lime-100 text-lime-800", CLOSED: "bg-slate-100 text-slate-700", REJECTED: "bg-red-100 text-red-700", CANCELLED: "bg-red-50 text-red-600",
  EMERGENCY: "bg-coral text-white", SCHEDULED: "bg-slate-100 text-slate-600", LOAN: "bg-violet-100 text-violet-800", SALE: "bg-sky-100 text-sky-800",
  IN_STOCK: "bg-emerald-100 text-emerald-800", LOW_STOCK: "bg-amber-100 text-amber-800", OUT_OF_STOCK: "bg-red-100 text-red-700", PENDING: "bg-amber-100 text-amber-800", APPROVED: "bg-emerald-100 text-emerald-800",
};
export function Badge({ value, className }: { value: string; className?: string }) {
  return <span className={cx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap", COLORS[value] ?? "bg-slate-100 text-slate-600", className)}>{statusLabel(value)}</span>;
}

export function Field({ label, error, children, hint }: { label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-navy">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted">{hint}</span>}
      {error && <span className="block text-xs font-medium text-bad">{error}</span>}
    </label>
  );
}
export const input = "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-2xl border border-line bg-card p-4 shadow-[0_1px_2px_rgba(11,37,69,.04)]", className)}>{children}</section>;
}
