import { type ReactNode, useEffect } from 'react';
import { statusLabel } from '../lib/format';
import { useT } from '../lib/app-context';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h2 className="text-[13px] font-semibold tracking-wide text-ink">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Button({ children, variant = 'default', className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'ghost' | 'amber' }) {
  const v = {
    default: 'border border-line bg-surface-2 hover:border-accent/60',
    primary: 'bg-accent text-accent-ink font-semibold hover:brightness-110',
    danger: 'border border-bad/50 bg-bad/10 text-bad hover:bg-bad/20',
    ghost: 'hover:bg-surface-2',
    amber: 'bg-amber text-black font-semibold hover:brightness-110',
  }[variant];
  return (
    <button {...p} className={cx('inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition disabled:opacity-40', v, className)}>
      {children}
    </button>
  );
}

const STATUS_COLOR: Record<string, string> = {
  PLACED: 'bg-sky-500/15 text-sky-300', ACCEPTED: 'bg-indigo-500/15 text-indigo-300', PACKED: 'bg-violet-500/15 text-violet-300',
  DISPATCHED: 'bg-accent/15 text-accent', REACHED_HOSPITAL: 'bg-teal-500/15 text-teal-300', DELIVERED_TO_OT: 'bg-ok/15 text-ok',
  KIT_RETURN_PENDING: 'bg-orange-500/15 text-orange-300', KIT_RETURNED: 'bg-lime-500/15 text-lime-300', CLOSED: 'bg-slate-500/20 text-slate-300',
  REJECTED: 'bg-bad/15 text-bad', CANCELLED: 'bg-bad/10 text-bad/80',
  IN_STOCK: 'bg-ok/15 text-ok', LOW_STOCK: 'bg-amber/15 text-amber', OUT_OF_STOCK: 'bg-bad/15 text-bad',
  PENDING: 'bg-amber/15 text-amber', APPROVED: 'bg-ok/15 text-ok', SENT: 'bg-ok/15 text-ok', FAILED: 'bg-bad/15 text-bad', QUEUED: 'bg-sky-500/15 text-sky-300',
  EMERGENCY: 'bg-amber text-black', SCHEDULED: 'bg-surface-2 text-muted', LOAN: 'bg-violet-500/15 text-violet-300', SALE: 'bg-sky-500/15 text-sky-300',
};
export function Badge({ value, className }: { value: string; className?: string }) {
  return <span className={cx('inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap', STATUS_COLOR[value] ?? 'bg-surface-2 text-muted', className)}>{statusLabel(value)}</span>;
}

export function Skeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx('space-y-2', className)}>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton h-8" />)}
    </div>
  );
}

export function Empty({ children }: { children?: ReactNode }) {
  const t = useT();
  return <div className="rounded-lg border border-dashed border-line p-8 text-center text-muted">{children ?? t('empty')}</div>;
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-bad/40 bg-bad/10 p-3 text-bad">
      <span>{error instanceof Error ? error.message : 'Something went wrong'}</span>
      {onRetry && <Button onClick={onRetry}>{t('retry')}</Button>}
    </div>
  );
}

/** Loading / error / empty wrapper for every list (AGENTS.md UI rules). */
export function Loadable<T>({ q, children, empty, rows }: { q: { isLoading: boolean; error: unknown; data?: T; refetch: () => unknown }; children: (d: T) => ReactNode; empty?: (d: T) => boolean; rows?: number }) {
  if (q.isLoading) return <Skeleton rows={rows} />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  if (q.data === undefined) return null;
  if (empty?.(q.data)) return <Empty />;
  return <>{children(q.data)}</>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className={cx('max-h-[90vh] w-full overflow-auto rounded-xl border border-line bg-surface shadow-2xl', wide ? 'max-w-4xl' : 'max-w-lg')} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] text-muted">{label}</span>
      {children}
      {error && <span className="block text-[12px] text-bad">{error}</span>}
    </label>
  );
}

export const inputCls = 'w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-accent';

export function Kpi({ label, value, tone, sub, onClick }: { label: string; value: ReactNode; tone?: 'amber' | 'bad' | 'ok' | 'accent'; sub?: ReactNode; onClick?: () => void }) {
  const c = { amber: 'text-amber', bad: 'text-bad', ok: 'text-ok', accent: 'text-accent' }[tone ?? 'accent'];
  return (
    <button onClick={onClick} className="rounded-xl border border-line bg-surface p-4 text-left transition hover:border-accent/50">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={cx('mt-1 text-2xl font-bold', c)}>{value}</div>
      {sub && <div className="mt-1 text-[12px] text-muted">{sub}</div>}
    </button>
  );
}

export function Toasts({ items, onClose }: { items: { id: number; title: string; body?: string; emergency?: boolean; onClick?: () => void }[]; onClose: (id: number) => void }) {
  return (
    <div className="fixed right-4 bottom-4 z-[1100] w-80 space-y-2">
      {items.map((t) => (
        <div key={t.id} onClick={() => { t.onClick?.(); onClose(t.id); }} className={cx('cursor-pointer rounded-xl border p-3 shadow-xl', t.emergency ? 'border-amber bg-amber text-black' : 'border-accent/40 bg-surface-2')}>
          <div className="font-semibold">{t.title}</div>
          {t.body && <div className="text-[12px] opacity-80">{t.body}</div>}
        </div>
      ))}
    </div>
  );
}
