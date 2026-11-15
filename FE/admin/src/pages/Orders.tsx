import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, get } from '../lib/api';
import { ago, rupees, statusLabel } from '../lib/format';
import { Badge, Card, Loadable, cx, inputCls } from '../components/ui';

export interface OrderRow {
  id: string; orderNo: string; status: string; priority: string; treatingDoctorName: string; totalPaise: number; createdAt: string; surgeryAt: string;
  hospital: { name: string }; assignedAgent: { user: { name: string } } | null; _count: { items: number };
}

const BOARD = ['PLACED', 'ACCEPTED', 'PACKED', 'DISPATCHED', 'REACHED_HOSPITAL', 'DELIVERED_TO_OT', 'KIT_RETURN_PENDING'];
const ALL = [...BOARD, 'KIT_RETURNED', 'CLOSED', 'REJECTED', 'CANCELLED'];

export function OrdersPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'board' | 'table'>('board');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [drag, setDrag] = useState<OrderRow | null>(null);
  const priority = params.get('priority') ?? '';
  const status = params.get('status') ?? '';
  const qtext = params.get('q') ?? '';

  const boardQ = useQuery({ queryKey: ['orders', 'board', priority], queryFn: () => get<OrderRow[]>(`/orders?status=${BOARD.join(',')}&pageSize=200${priority ? `&priority=${priority}` : ''}`), enabled: view === 'board', refetchInterval: 20_000 });
  const tableQ = useQuery({ queryKey: ['orders', 'table', priority, status, qtext], queryFn: () => api<OrderRow[]>(`/orders?pageSize=100${priority ? `&priority=${priority}` : ''}${status ? `&status=${status}` : ''}${qtext ? `&q=${encodeURIComponent(qtext)}` : ''}`), enabled: view === 'table' });

  const move = async (o: OrderRow, to: string) => {
    if (o.status === to) return;
    let reason: string | undefined;
    if (to === 'REJECTED' || to === 'CANCELLED') reason = window.prompt(`Reason to ${to.toLowerCase()} ${o.orderNo}?`) ?? undefined;
    try {
      await api(`/orders/${o.id}/transition`, { method: 'POST', json: { to, reason } });
      setMsg({ ok: true, text: `${o.orderNo} → ${statusLabel(to)}` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Failed' });
    }
    qc.invalidateQueries({ queryKey: ['orders'] });
    setTimeout(() => setMsg(null), 5000);
  };
  const setParam = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-lg font-bold">Orders</h1>
        <div className="flex rounded-lg border border-line p-0.5">
          {(['board', 'table'] as const).map((v) => <button key={v} onClick={() => setView(v)} className={cx('rounded-md px-3 py-1 text-[12px]', view === v ? 'bg-accent text-accent-ink' : 'text-muted')}>{v === 'board' ? 'Kanban' : 'Table'}</button>)}
        </div>
        <select value={priority} onChange={(e) => setParam('priority', e.target.value)} className={`${inputCls} w-40`}>
          <option value="">All priorities</option><option value="EMERGENCY">Emergency</option><option value="SCHEDULED">Scheduled</option>
        </select>
        {view === 'table' && (
          <>
            <select value={status} onChange={(e) => setParam('status', e.target.value)} className={`${inputCls} w-48`}>
              <option value="">All statuses</option>{ALL.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
            <input defaultValue={qtext} onKeyDown={(e) => e.key === 'Enter' && setParam('q', (e.target as HTMLInputElement).value)} placeholder="Order no / doctor / hospital ↵" className={`${inputCls} w-64`} />
          </>
        )}
        {msg && <span className={cx('rounded-md px-2 py-1 text-[12px]', msg.ok ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad')}>{msg.text}</span>}
      </div>

      {view === 'board' ? (
        <Loadable q={boardQ} rows={6}>
          {(orders) => (
            <div className="flex gap-3 overflow-x-auto pb-3">
              {BOARD.map((col) => {
                const list = orders.filter((o) => o.status === col);
                return (
                  <div key={col} onDragOver={(e) => e.preventDefault()} onDrop={() => drag && move(drag, col)} className="flex w-64 shrink-0 flex-col rounded-xl border border-line bg-surface">
                    <div className="flex items-center justify-between border-b border-line px-3 py-2"><Badge value={col} /><span className="text-[12px] text-muted">{list.length}</span></div>
                    <div className="min-h-40 flex-1 space-y-2 p-2">
                      {list.map((o) => (
                        <div key={o.id} draggable onDragStart={() => setDrag(o)} onDragEnd={() => setDrag(null)} onClick={() => nav(`/orders/${o.id}`)}
                          className={cx('cursor-grab rounded-lg border bg-surface-2 p-2.5 hover:border-accent/60', o.priority === 'EMERGENCY' ? 'border-amber' : 'border-line', o.priority === 'EMERGENCY' && o.status === 'PLACED' && 'flash text-black')}>
                          <div className="flex items-center justify-between"><span className="mono text-[12px] font-semibold">{o.orderNo}</span>{o.priority === 'EMERGENCY' && <Badge value="EMERGENCY" />}</div>
                          <div className="mt-1 text-[13px]">{o.treatingDoctorName}</div>
                          <div className="text-[12px] opacity-70">{o.hospital.name}</div>
                          <div className="mt-1 flex justify-between text-[12px] opacity-80"><span>{o._count.items} items · {rupees(o.totalPaise)}</span><span>{ago(o.createdAt)}</span></div>
                          {o.assignedAgent && <div className="mt-1 text-[11px] text-accent">➤ {o.assignedAgent.user.name}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Loadable>
      ) : (
        <Card>
          <Loadable q={{ ...tableQ, data: tableQ.data?.data }} empty={(d) => d.length === 0}>
            {(rows) => (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-[12px] text-muted"><tr><th className="py-2">Order</th><th>Priority</th><th>Doctor</th><th>Hospital</th><th>Surgery</th><th>Status</th><th>Agent</th><th className="text-right">Total</th><th className="text-right">Placed</th></tr></thead>
                  <tbody>
                    {rows.map((o) => (
                      <tr key={o.id} onClick={() => nav(`/orders/${o.id}`)} className="cursor-pointer border-t border-line/60 hover:bg-surface-2">
                        <td className="mono py-2 text-accent">{o.orderNo}</td><td><Badge value={o.priority} /></td><td>{o.treatingDoctorName}</td><td className="text-muted">{o.hospital.name}</td>
                        <td className="text-muted">{new Date(o.surgeryAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                        <td><Badge value={o.status} /></td><td className="text-muted">{o.assignedAgent?.user.name ?? '—'}</td><td className="text-right">{rupees(o.totalPaise)}</td><td className="text-right text-muted">{ago(o.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 text-[12px] text-muted">{String(tableQ.data?.meta?.total ?? '')} orders</div>
              </div>
            )}
          </Loadable>
        </Card>
      )}
      <p className="text-[12px] text-muted">Drag a card to another column to move it. Invalid moves are refused by the server with a message.</p>
    </div>
  );
}
