import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, get } from '../lib/api';
import { ago, dt, rupees } from '../lib/format';
import { Badge, Button, Card, Field, Loadable, Modal, cx, inputCls } from '../components/ui';

/* ───────── Hospitals ───────── */
interface Hospital { id: string; name: string; address: string; lat: number; lng: number; otContactName: string; otContactPhone: string; gstin: string | null; creditLimitPaise: number; paymentTermsDays: number; isActive: boolean; _count: { orders: number; doctors: number } }
const blankH = { name: '', address: '', lat: 22.72, lng: 75.86, otContactName: '', otContactPhone: '', gstin: '', creditLimitPaise: 0, paymentTermsDays: 30, isActive: true };

export function HospitalsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['hospitals'], queryFn: () => get<Hospital[]>('/admin/hospitals') });
  const [form, setForm] = useState<(typeof blankH & { id?: string }) | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!form) return;
    setErr(null);
    const { id, ...body } = form;
    try { await api(id ? `/admin/hospitals/${id}` : '/admin/hospitals', { method: id ? 'PUT' : 'POST', json: { ...body, gstin: body.gstin || null } }); setForm(null); qc.invalidateQueries({ queryKey: ['hospitals'] }); }
    catch (e) { setErr(e instanceof ApiError ? `${e.message}: ${((e.details as { field: string; message: string }[]) ?? []).map((d) => `${d.field} ${d.message}`).join(', ')}` : 'Failed'); }
  };
  return (
    <Card title="Hospitals" actions={<Button variant="primary" onClick={() => setForm({ ...blankH })}>+ Hospital</Button>}>
      <Loadable q={q} empty={(d) => !d.length}>
        {(hs) => (
          <table className="w-full text-left text-[13px]">
            <thead className="text-[12px] text-muted"><tr><th className="py-1">Hospital</th><th>Address</th><th>OT contact</th><th>GSTIN</th><th className="text-right">Credit limit</th><th className="text-right">Terms</th><th className="text-right">Doctors</th><th className="text-right">Orders</th><th></th></tr></thead>
            <tbody>{hs.map((h) => <tr key={h.id} className="border-t border-line/60"><td className="py-1.5 font-medium">{h.name} {!h.isActive && <Badge value="CANCELLED" />}</td><td className="max-w-xs text-muted">{h.address}</td><td>{h.otContactName} · {h.otContactPhone}</td><td className="mono text-[12px]">{h.gstin ?? '—'}</td><td className="text-right">{rupees(h.creditLimitPaise)}</td><td className="text-right">{h.paymentTermsDays}d</td><td className="text-right">{h._count.doctors}</td><td className="text-right">{h._count.orders}</td><td className="text-right"><button className="text-accent" onClick={() => setForm({ ...h, gstin: h.gstin ?? '' })}>edit</button></td></tr>)}</tbody>
          </table>
        )}
      </Loadable>
      {form && (
        <Modal open onClose={() => setForm(null)} title={form.id ? 'Edit hospital' : 'New hospital'}>
          <div className="grid gap-3">
            {(['name', 'address', 'otContactName', 'otContactPhone', 'gstin'] as const).map((k) => <Field key={k} label={k}><input value={String(form[k] ?? '')} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inputCls} /></Field>)}
            <div className="grid grid-cols-2 gap-2">
              <Field label="lat"><input type="number" step="0.0001" value={form.lat} onChange={(e) => setForm({ ...form, lat: Number(e.target.value) })} className={inputCls} /></Field>
              <Field label="lng"><input type="number" step="0.0001" value={form.lng} onChange={(e) => setForm({ ...form, lng: Number(e.target.value) })} className={inputCls} /></Field>
              <Field label="Credit limit ₹"><input type="number" value={form.creditLimitPaise / 100} onChange={(e) => setForm({ ...form, creditLimitPaise: Number(e.target.value) * 100 })} className={inputCls} /></Field>
              <Field label="Payment terms (days)"><input type="number" value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: Number(e.target.value) })} className={inputCls} /></Field>
            </div>
            {err && <div className="text-bad">{err}</div>}
            <div className="flex justify-end gap-2"><Button onClick={() => setForm(null)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></div>
          </div>
        </Modal>
      )}
    </Card>
  );
}

/* ───────── Agents ───────── */
export function AgentsPage() {
  const q = useQuery({ queryKey: ['agents'], queryFn: () => get<{ id: string; vehicleNo: string; isOnDuty: boolean; lastSeenAt: string | null; user: { name: string; phone: string }; orders: { id: string; orderNo: string; status: string }[]; live: { at: string; source: string } | null }[]>('/admin/agents'), refetchInterval: 15_000 });
  return (
    <Card title="Delivery agents">
      <Loadable q={q} empty={(d) => !d.length}>
        {(as) => (
          <div className="grid gap-3 md:grid-cols-2">
            {as.map((a) => (
              <div key={a.id} className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="flex items-center justify-between"><b>{a.user.name}</b><span className={cx('rounded-md px-2 py-0.5 text-[11px] font-semibold', a.isOnDuty ? 'bg-ok/15 text-ok' : 'bg-surface text-muted')}>{a.isOnDuty ? 'ON DUTY' : 'OFF DUTY'}</span></div>
                <div className="text-[12px] text-muted">{a.user.phone} · {a.vehicleNo}</div>
                <div className="mt-1 text-[12px]">Last location: {a.live ? `${ago(a.live.at)} (${a.live.source})` : a.lastSeenAt ? ago(a.lastSeenAt) : '—'}</div>
                <div className="mt-2 flex flex-wrap gap-1">{a.orders.map((o) => <span key={o.id} className="mono rounded bg-surface px-1.5 py-0.5 text-[11px]">{o.orderNo} <Badge value={o.status} /></span>)}</div>
              </div>
            ))}
          </div>
        )}
      </Loadable>
    </Card>
  );
}

/* ───────── Notifications ───────── */
interface NLog { id: string; channel: string; recipient: string | null; title: string; body: string; status: string; error: string | null; attempts: number; createdAt: string; user: { name: string } | null }
export function NotificationsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const contacts = useQuery({ queryKey: ['owner-contacts'], queryFn: () => get<{ id: string; name: string; whatsappNumber: string; enabled: boolean }[]>('/admin/owner-contacts') });
  const log = useQuery({ queryKey: ['nlog', status], queryFn: () => get<NLog[]>(`/admin/notifications${status ? `?status=${status}` : ''}`) });
  const [name, setName] = useState('');
  const [num, setNum] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<NLog | null>(null);
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card title="Owner WhatsApp numbers (new-order alerts)">
        <Loadable q={contacts}>
          {(cs) => (
            <ul className="space-y-2">
              {cs.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-lg border border-line p-2">
                  <span>{c.name} <span className="mono text-muted">{c.whatsappNumber}</span></span>
                  <button onClick={async () => { await api(`/admin/owner-contacts/${c.id}`, { method: 'PATCH', json: { enabled: !c.enabled } }); contacts.refetch(); }} className={cx('rounded-md px-2 py-0.5 text-[11px] font-semibold', c.enabled ? 'bg-ok/15 text-ok' : 'bg-surface-2 text-muted')}>{c.enabled ? 'ENABLED' : 'DISABLED'}</button>
                </li>
              ))}
            </ul>
          )}
        </Loadable>
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={inputCls} />
          <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="WhatsApp number" className={inputCls} />
          {err && <div className="text-[12px] text-bad">{err}</div>}
          <Button variant="primary" className="w-full" onClick={async () => { setErr(null); try { await api('/admin/owner-contacts', { method: 'POST', json: { name, whatsappNumber: num } }); setName(''); setNum(''); contacts.refetch(); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } }}>Add number</Button>
          <p className="text-[11px] text-muted">WhatsApp Cloud API is not configured on this server yet, so messages fall back to SMS/console and show as FAILED → SENT below.</p>
        </div>
      </Card>
      <Card title="Delivery log" actions={['', 'FAILED', 'SENT'].map((s) => <button key={s} onClick={() => setStatus(s)} className={cx('rounded-md px-2 py-1 text-[12px]', status === s ? 'bg-accent/15 text-accent' : 'text-muted')}>{s || 'All'}</button>)}>
        <Loadable q={log} empty={(d) => !d.length}>
          {(rows) => (
            <table className="w-full text-left text-[13px]">
              <thead className="text-[12px] text-muted"><tr><th className="py-1">When</th><th>Channel</th><th>To</th><th>Title</th><th>Status</th><th>Tries</th><th></th></tr></thead>
              <tbody>{rows.map((n) => <tr key={n.id} className="border-t border-line/60"><td className="py-1 text-muted">{ago(n.createdAt)}</td><td>{n.channel}</td><td className="mono text-[12px]">{n.recipient ?? n.user?.name ?? 'admins'}</td><td><button className="hover:text-accent" onClick={() => setOpen(n)}>{n.title}</button></td><td><Badge value={n.status} /></td><td>{n.attempts}</td><td className="text-right">{n.status === 'FAILED' && <button className="text-accent" onClick={async () => { await api(`/admin/notifications/${n.id}/retry`, { method: 'POST' }); qc.invalidateQueries({ queryKey: ['nlog'] }); }}>retry</button>}</td></tr>)}</tbody>
            </table>
          )}
        </Loadable>
      </Card>
      {open && <Modal open onClose={() => setOpen(null)} title={open.title}><pre className="whitespace-pre-wrap text-[13px]">{open.body}</pre>{open.error && <div className="mt-3 text-[12px] text-bad">{open.error}</div>}</Modal>}
    </div>
  );
}

/* ───────── Reports ───────── */
type R = { name: string; orders?: number; qty?: number; bookings?: number; revenue?: number };
export function ReportsPage() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ['report', days], queryFn: () => get<{ byDoctor: R[]; byHospital: R[]; byCategory: R[]; kitUtilisation: R[] }>(`/admin/reports/sales?from=${new Date(Date.now() - days * 86400_000).toISOString()}`) });
  const csv = (name: string, rows: R[]) => {
    const keys = Object.keys(rows[0] ?? { name: '' });
    const body = [keys.join(','), ...rows.map((r) => keys.map((k) => (k === 'revenue' ? ((r[k as keyof R] as number) / 100).toFixed(2) : `"${r[k as keyof R] ?? ''}"`)).join(','))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv' }));
    a.download = `${name}-${days}d.csv`;
    a.click();
  };
  const Table = ({ title, rows, k }: { title: string; rows: R[]; k: 'orders' | 'qty' | 'bookings' }) => {
    const max = Math.max(1, ...rows.map((r) => r.revenue ?? r.bookings ?? 0));
    return (
      <Card title={title} actions={<Button onClick={() => csv(title.toLowerCase().replace(/\s/g, '-'), rows)}>Excel / CSV</Button>}>
        <table className="w-full text-[13px]">
          <tbody>{rows.map((r) => <tr key={r.name} className="border-t border-line/60"><td className="py-1.5">{r.name}</td><td className="w-1/3"><div className="h-2 rounded bg-accent/70" style={{ width: `${((r.revenue ?? r.bookings ?? 0) / max) * 100}%` }} /></td><td className="text-right text-muted">{r[k]} {k}</td><td className="text-right">{r.revenue != null ? rupees(r.revenue) : ''}</td></tr>)}</tbody>
        </table>
      </Card>
    );
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><h1 className="mr-2 text-lg font-bold">Reports</h1>{[7, 30, 90].map((d) => <Button key={d} variant={days === d ? 'primary' : 'default'} onClick={() => setDays(d)}>Last {d} days</Button>)}</div>
      <Loadable q={q}>
        {(r) => (
          <div className="grid gap-4 xl:grid-cols-2">
            <Table title="By doctor" rows={r.byDoctor} k="orders" />
            <Table title="By hospital" rows={r.byHospital} k="orders" />
            <Table title="By category" rows={r.byCategory} k="qty" />
            <Table title="Kit utilisation" rows={r.kitUtilisation} k="bookings" />
          </div>
        )}
      </Loadable>
    </div>
  );
}

/* ───────── Staff & roles ───────── */
export function StaffPage() {
  const q = useQuery({ queryKey: ['users'], queryFn: () => get<{ id: string; name: string; phone: string; role: string; isActive: boolean; lastLoginAt: string | null; hospital: { name: string } | null }[]>('/admin/users') });
  const hospitals = useQuery({ queryKey: ['hospitals'], queryFn: () => get<{ id: string; name: string }[]>('/admin/hospitals') });
  const [f, setF] = useState({ name: '', phone: '', role: 'STAFF', vehicleNo: '', hospitalId: '' });
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <Card title="Users">
        <Loadable q={q}>
          {(us) => (
            <table className="w-full text-left text-[13px]">
              <thead className="text-[12px] text-muted"><tr><th className="py-1">Name</th><th>Phone</th><th>Role</th><th>Hospital</th><th>Last login</th><th></th></tr></thead>
              <tbody>{us.map((u) => <tr key={u.id} className={cx('border-t border-line/60', !u.isActive && 'opacity-50')}><td className="py-1.5">{u.name}</td><td className="mono">{u.phone}</td><td>{u.role.replace('_', ' ')}</td><td className="text-muted">{u.hospital?.name ?? '—'}</td><td className="text-muted">{u.lastLoginAt ? ago(u.lastLoginAt) : 'never'}</td><td className="text-right">{u.role !== 'SUPER_ADMIN' && <button className={u.isActive ? 'text-bad' : 'text-ok'} onClick={async () => { await api(`/admin/users/${u.id}`, { method: 'PATCH', json: { isActive: !u.isActive } }); q.refetch(); }}>{u.isActive ? 'disable' : 'enable'}</button>}</td></tr>)}</tbody>
            </table>
          )}
        </Loadable>
      </Card>
      <Card title="Add staff / agent / hospital buyer">
        <div className="space-y-2">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name" className={inputCls} />
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Mobile" className={inputCls} />
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={inputCls}><option value="STAFF">Staff</option><option value="DELIVERY_AGENT">Delivery agent</option><option value="HOSPITAL_PURCHASE">Hospital purchase</option></select>
          {f.role === 'DELIVERY_AGENT' && <input value={f.vehicleNo} onChange={(e) => setF({ ...f, vehicleNo: e.target.value })} placeholder="Vehicle no." className={inputCls} />}
          {f.role === 'HOSPITAL_PURCHASE' && <select value={f.hospitalId} onChange={(e) => setF({ ...f, hospitalId: e.target.value })} className={inputCls}><option value="">Hospital…</option>{(hospitals.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>}
          {err && <div className="text-[12px] text-bad">{err}</div>}
          <Button variant="primary" className="w-full" onClick={async () => { setErr(null); try { await api('/admin/users', { method: 'POST', json: { ...f, hospitalId: f.hospitalId || undefined, vehicleNo: f.vehicleNo || undefined } }); setF({ name: '', phone: '', role: 'STAFF', vehicleNo: '', hospitalId: '' }); q.refetch(); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } }}>Create user</Button>
          <p className="text-[11px] text-muted">Only the owner (SUPER_ADMIN) can create or disable users.</p>
        </div>
      </Card>
    </div>
  );
}

/* ───────── Settings ───────── */
export function SettingsPage() {
  const q = useQuery({ queryKey: ['settings'], queryFn: () => get<{ key: string; value: Record<string, unknown> }[]>('/admin/settings') });
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Loadable q={q}>
      {(ss) => (
        <div className="grid gap-4 xl:grid-cols-3">
          {ss.map((s) => <SettingCard key={s.key} s={s} onSaved={(m) => { setMsg(m); q.refetch(); }} />)}
          {msg && <div className="text-ok xl:col-span-3">{msg}</div>}
        </div>
      )}
    </Loadable>
  );
}
function SettingCard({ s, onSaved }: { s: { key: string; value: Record<string, unknown> }; onSaved: (m: string) => void }) {
  const [v, setV] = useState<Record<string, unknown>>(s.value);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card title={s.key}>
      <div className="space-y-2">
        {Object.entries(v).map(([k, val]) => (
          <Field key={k} label={k}>
            {typeof val === 'boolean' ? <input type="checkbox" checked={val} onChange={(e) => setV({ ...v, [k]: e.target.checked })} /> : <input value={String(val)} onChange={(e) => setV({ ...v, [k]: typeof val === 'number' ? Number(e.target.value) : e.target.value })} className={inputCls} />}
          </Field>
        ))}
        {err && <div className="text-[12px] text-bad">{err}</div>}
        <Button variant="primary" onClick={async () => { try { await api(`/admin/settings/${s.key}`, { method: 'PUT', json: v }); onSaved(`Saved ${s.key}`); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } }}>Save</Button>
      </div>
    </Card>
  );
}

/* ───────── Audit ───────── */
export function AuditPage() {
  const q = useQuery({ queryKey: ['audit'], queryFn: () => get<{ id: string; action: string; entity: string; entityId: string | null; createdAt: string; ip: string | null; actor: { name: string; role: string } | null; after: unknown }[]>('/admin/audit') });
  return (
    <Card title="Audit log (last 300)">
      <Loadable q={q} empty={(d) => !d.length}>
        {(rows) => (
          <table className="w-full text-left text-[13px]">
            <thead className="text-[12px] text-muted"><tr><th className="py-1">When</th><th>Who</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>{rows.map((a) => <tr key={a.id} className="border-t border-line/60 align-top"><td className="py-1 whitespace-nowrap text-muted">{dt(a.createdAt)}</td><td>{a.actor?.name ?? 'System'}</td><td className="mono text-[12px] text-accent">{a.action}</td><td className="text-muted">{a.entity}</td><td className="mono max-w-md truncate text-[11px] text-muted">{JSON.stringify(a.after)}</td></tr>)}</tbody>
          </table>
        )}
      </Loadable>
    </Card>
  );
}
