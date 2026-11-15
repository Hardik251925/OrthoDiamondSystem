import { useContext, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, session } from '../lib/api';
import { adminSocket, closeSockets } from '../lib/socket';
import { ago, beep } from '../lib/format';
import { LangContext, useT } from '../lib/app-context';
import type { StringKey } from '../i18n';
import { Toasts, cx } from './ui';

const NAV: { to: string; key: StringKey; icon: string }[] = [
  { to: '/', key: 'dashboard', icon: '◆' },
  { to: '/orders', key: 'orders', icon: '▤' },
  { to: '/tracking', key: 'tracking', icon: '◎' },
  { to: '/catalogue', key: 'catalogue', icon: '▦' },
  { to: '/inventory', key: 'inventory', icon: '▥' },
  { to: '/kits', key: 'kits', icon: '▣' },
  { to: '/templates', key: 'templates', icon: '≡' },
  { to: '/doctors', key: 'doctors', icon: '✚' },
  { to: '/hospitals', key: 'hospitals', icon: '⌂' },
  { to: '/agents', key: 'agents', icon: '➤' },
  { to: '/notifications', key: 'notifications', icon: '✉' },
  { to: '/reports', key: 'reports', icon: '▲' },
  { to: '/staff', key: 'staff', icon: '☺' },
  { to: '/settings', key: 'settings', icon: '⚙' },
  { to: '/audit', key: 'audit', icon: '⌕' },
];

interface Toast { id: number; title: string; body?: string; emergency?: boolean; onClick?: () => void }
interface Note { id: string; title: string; body: string; createdAt: string; readAt: string | null; payload?: { orderId?: string } }

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M32 6 L56 26 L32 58 L8 26 Z" fill="#3DD6F5" />
      <path d="M8 26 H56 M32 6 L21 26 L32 58 L43 26 Z" fill="none" stroke="#062028" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

export function Layout() {
  const t = useT();
  const { lang, setLang } = useContext(LangContext);
  const nav = useNavigate();
  const qc = useQueryClient();
  const user = session.get()?.user;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [palette, setPalette] = useState(false);
  const [bell, setBell] = useState(false);
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => get<{ emergenciesOpen: { id: string; orderNo: string; hospital: { name: string } }[] }>('/admin/dashboard'), refetchInterval: 30_000 });
  const notes = useQuery({ queryKey: ['my-notes'], queryFn: () => get<Note[]>('/notifications'), refetchInterval: 60_000 });
  const unread = notes.data?.filter((n) => !n.readAt).length ?? 0;

  useEffect(() => {
    const s = adminSocket();
    const toast = (x: Omit<Toast, 'id'>) => {
      const id = Date.now() + Math.random();
      setToasts((a) => [...a, { ...x, id }]);
      setTimeout(() => setToasts((a) => a.filter((y) => y.id !== id)), 9000);
    };
    s.on('admin:new_order', (o: { id: string; orderNo: string; priority: string; hospital: string; doctor: string }) => {
      beep(o.priority === 'EMERGENCY');
      toast({ title: `${o.priority === 'EMERGENCY' ? '🚨 EMERGENCY' : 'New order'} ${o.orderNo}`, body: `${o.doctor} · ${o.hospital}`, emergency: o.priority === 'EMERGENCY', onClick: () => nav(`/orders/${o.id}`) });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['my-notes'] });
    });
    s.on('order:status', (p: { orderId: string }) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order', p.orderId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    });
    s.on('order:updated', (p: { orderId: string }) => qc.invalidateQueries({ queryKey: ['order', p.orderId] }));
    s.on('notification', () => qc.invalidateQueries({ queryKey: ['my-notes'] }));
    return () => { s.off('admin:new_order'); s.off('order:status'); s.off('order:updated'); s.off('notification'); };
  }, [nav, qc]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const logout = async () => {
    const s = session.get();
    if (s) await post('/auth/logout', { refreshToken: s.refreshToken }).catch(() => undefined);
    closeSockets();
    session.set(null);
    nav('/login');
  };
  const em = dash.data?.emergenciesOpen ?? [];

  return (
    <div className="flex h-full">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <Logo />
          <div>
            <div className="text-[15px] font-extrabold tracking-wide">ORTHO DIAMOND</div>
            <div className="text-[11px] text-accent">{t('brand')}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx('flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px]', isActive ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink')}>
              <span className="w-4 text-center">{n.icon}</span>
              {t(n.key)}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line px-4 py-3 text-[11px] text-muted">Ctrl+K — quick jump</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {em.length > 0 && (
          <button onClick={() => nav(`/orders/${em[0]!.id}`)} className="flash w-full px-4 py-1.5 text-center text-[13px] font-bold text-black">
            🚨 {t('emergencyBanner')}: {em.map((e) => `${e.orderNo} (${e.hospital.name})`).join(' · ')}
          </button>
        )}
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2">
          <button onClick={() => setPalette(true)} className="w-72 max-w-[50vw] rounded-lg border border-line bg-bg px-3 py-1.5 text-left text-muted">{t('search')} <span className="float-right text-[11px]">Ctrl K</span></button>
          <div className="flex items-center gap-3">
            <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="rounded-md border border-line px-2 py-1 text-[12px]">{lang === 'en' ? 'हिंदी' : 'English'}</button>
            <div className="relative">
              <button onClick={() => setBell((b) => !b)} className="relative rounded-md border border-line px-2 py-1">
                🔔{unread > 0 && <span className="absolute -top-1.5 -right-1.5 rounded-full bg-amber px-1.5 text-[10px] font-bold text-black">{unread}</span>}
              </button>
              {bell && (
                <div className="absolute right-0 z-[900] mt-2 w-80 rounded-xl border border-line bg-surface shadow-2xl">
                  <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[12px]">
                    <b>{t('notifications')}</b>
                    <button className="text-accent" onClick={async () => { await post('/notifications/read-all'); notes.refetch(); }}>Mark all read</button>
                  </div>
                  <div className="max-h-96 overflow-auto">
                    {(notes.data ?? []).slice(0, 15).map((n) => (
                      <button key={n.id} onClick={() => { setBell(false); if (n.payload?.orderId) nav(`/orders/${n.payload.orderId}`); }} className={cx('block w-full border-b border-line/50 px-3 py-2 text-left hover:bg-surface-2', !n.readAt && 'bg-accent/5')}>
                        <div className="text-[13px] font-medium">{n.title}</div>
                        <div className="text-[12px] text-muted">{n.body} · {ago(n.createdAt)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="text-right text-[12px] leading-tight">
              <div className="font-semibold">{user?.name}</div>
              <div className="text-muted">{user?.role.replace('_', ' ')}</div>
            </div>
            <button onClick={logout} className="rounded-md border border-line px-2 py-1 text-[12px] hover:border-bad hover:text-bad">{t('logout')}</button>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-2 py-1 md:hidden">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx('whitespace-nowrap rounded-md px-2 py-1 text-[12px]', isActive ? 'bg-accent/15 text-accent' : 'text-muted')}>{t(n.key)}</NavLink>)}
        </nav>
        <main className="min-h-0 flex-1 overflow-auto p-4 md:p-5">
          <Outlet />
        </main>
      </div>
      {palette && <Palette onClose={() => setPalette(false)} />}
      <Toasts items={toasts} onClose={(id) => setToasts((a) => a.filter((x) => x.id !== id))} />
    </div>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const t = useT();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const orders = useQuery({ queryKey: ['palette', q], queryFn: () => get<{ id: string; orderNo: string; treatingDoctorName: string }[]>(`/orders?q=${encodeURIComponent(q)}&pageSize=6`), enabled: q.length >= 2 });
  const pages = NAV.filter((n) => t(n.key).toLowerCase().includes(q.toLowerCase()));
  const go = (to: string) => { nav(to); onClose(); };
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-start justify-center bg-black/60 pt-24" onClick={onClose}>
      <div className="w-[520px] max-w-[92vw] rounded-xl border border-line bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter') { const o = orders.data?.[0]; if (o) go(`/orders/${o.id}`); else if (pages[0]) go(pages[0].to); } }} placeholder="Jump to page or order no. (OD-…)" className="w-full rounded-t-xl border-b border-line bg-transparent px-4 py-3 outline-none" />
        <div className="max-h-80 overflow-auto p-2">
          {(orders.data ?? []).map((o) => <button key={o.id} onClick={() => go(`/orders/${o.id}`)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-surface-2"><span className="mono text-accent">{o.orderNo}</span> · {o.treatingDoctorName}</button>)}
          {pages.map((p) => <button key={p.to} onClick={() => go(p.to)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-surface-2">{p.icon} {t(p.key)}</button>)}
        </div>
      </div>
    </div>
  );
}
