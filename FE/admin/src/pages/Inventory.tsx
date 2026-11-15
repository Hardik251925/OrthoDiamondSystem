import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, get } from '../lib/api';
import { dt } from '../lib/format';
import { Badge, Button, Card, Field, Loadable, Modal, cx, inputCls } from '../components/ui';

interface Row { variantId: string; sku: string; label: string; category: string; onHand: number; reserved: number; available: number; threshold: number; status: string }
interface Batch { id: string; lotNo: string; qty: number; expiryDate: string | null; receivedAt: string; supplier: string | null }

export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const filter = params.get('filter') ?? 'all';
  const [tab, setTab] = useState<'stock' | 'expiry' | 'log'>('stock');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Row | null>(null);
  const stock = useQuery({ queryKey: ['stock', filter, q], queryFn: () => api<Row[]>(`/stock/overview?filter=${filter}&pageSize=200${q ? `&q=${encodeURIComponent(q)}` : ''}`), enabled: tab === 'stock' });
  const exp = useQuery({ queryKey: ['expiring'], queryFn: () => get<{ id: string; lotNo: string; qty: number; expiryDate: string; sku: string; label: string; expired: boolean; supplier: string }[]>('/stock/expiring?days=90'), enabled: tab === 'expiry' });
  const log = useQuery({ queryKey: ['adjustments'], queryFn: () => get<{ id: string; delta: number; reason: string; createdAt: string; variant: { sku: string }; actor: { name: string } | null }[]>('/stock/adjustments'), enabled: tab === 'log' });
  const m = stock.data?.meta as { total: number; low: number; out: number } | undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-lg font-bold">Inventory</h1>
        {(['stock', 'expiry', 'log'] as const).map((t) => <Button key={t} variant={tab === t ? 'primary' : 'default'} onClick={() => setTab(t)}>{t === 'stock' ? 'Stock levels' : t === 'expiry' ? 'Expiring batches' : 'Adjustment log'}</Button>)}
      </div>
      {tab === 'stock' && (
        <Card title={m ? `${m.total} sizes · ${m.low} low · ${m.out} out of stock` : 'Stock'} actions={<>
          {['all', 'low', 'out'].map((f) => <button key={f} onClick={() => setParams({ filter: f })} className={cx('rounded-md px-2 py-1 text-[12px]', filter === f ? 'bg-accent/15 text-accent' : 'text-muted')}>{f === 'all' ? 'All' : f === 'low' ? 'Low stock' : 'Out of stock'}</button>)}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU / product" className={`${inputCls} w-52`} />
        </>}>
          <Loadable q={{ ...stock, data: stock.data?.data }} empty={(d) => !d.length}>
            {(rows) => (
              <table className="w-full text-left text-[13px]">
                <thead className="text-[12px] text-muted"><tr><th className="py-1">SKU</th><th>Item</th><th>Category</th><th className="text-right">On hand</th><th className="text-right">Reserved</th><th className="text-right">Available</th><th className="text-right">Min</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.variantId} className={cx('border-t border-line/60', r.status === 'OUT_OF_STOCK' && 'bg-bad/5')}>
                      <td className="mono py-1 text-[12px]">{r.sku}</td><td>{r.label}</td><td className="text-muted">{r.category}</td>
                      <td className="text-right">{r.onHand}</td><td className="text-right text-muted">{r.reserved}</td><td className="text-right font-semibold">{r.available}</td><td className="text-right text-muted">{r.threshold}</td>
                      <td><Badge value={r.status} /></td>
                      <td className="text-right"><button className="text-accent" onClick={() => setSel(r)}>batches</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Loadable>
        </Card>
      )}
      {tab === 'expiry' && (
        <Card title="Batches expiring within 90 days">
          <Loadable q={exp} empty={(d) => !d.length}>
            {(rows) => (
              <table className="w-full text-left text-[13px]">
                <thead className="text-[12px] text-muted"><tr><th className="py-1">Expiry</th><th>Lot</th><th>SKU</th><th>Item</th><th className="text-right">Qty</th><th>Supplier</th></tr></thead>
                <tbody>{rows.map((b) => <tr key={b.id} className="border-t border-line/60"><td className={cx('py-1 font-semibold', b.expired ? 'text-bad' : 'text-amber')}>{new Date(b.expiryDate).toLocaleDateString('en-IN')}</td><td className="mono">{b.lotNo}</td><td className="mono text-[12px]">{b.sku}</td><td>{b.label}</td><td className="text-right">{b.qty}</td><td className="text-muted">{b.supplier}</td></tr>)}</tbody>
              </table>
            )}
          </Loadable>
        </Card>
      )}
      {tab === 'log' && (
        <Card title="Last 100 stock movements">
          <Loadable q={log} empty={(d) => !d.length}>
            {(rows) => (
              <table className="w-full text-left text-[13px]">
                <tbody>{rows.map((a) => <tr key={a.id} className="border-t border-line/60"><td className="py-1 text-muted">{dt(a.createdAt)}</td><td className="mono text-[12px]">{a.variant.sku}</td><td className={cx('text-right font-semibold', a.delta < 0 ? 'text-bad' : 'text-ok')}>{a.delta > 0 ? `+${a.delta}` : a.delta}</td><td className="pl-4">{a.reason}</td><td className="text-muted">{a.actor?.name ?? 'System'}</td></tr>)}</tbody>
              </table>
            )}
          </Loadable>
        </Card>
      )}
      {sel && <BatchModal row={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function BatchModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const b = useQuery({ queryKey: ['batches', row.variantId], queryFn: () => get<Batch[]>(`/stock/batches?variantId=${row.variantId}`) });
  const [lot, setLot] = useState('');
  const [qty, setQty] = useState(10);
  const [exp, setExp] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => { b.refetch(); qc.invalidateQueries({ queryKey: ['stock'] }); };
  const receive = async () => {
    setErr(null);
    try { await api('/stock/batches', { method: 'POST', json: { variantId: row.variantId, lotNo: lot, qty, expiryDate: exp || null, supplier: 'Manual receipt' } }); setLot(''); refresh(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); }
  };
  const adjust = async (batch: Batch) => {
    const d = Number(window.prompt(`Adjust ${batch.lotNo} by (e.g. -2 damaged, +5 found)`));
    if (!d) return;
    const reason = window.prompt('Reason') ?? '';
    try { await api('/stock/adjust', { method: 'POST', json: { batchId: batch.id, delta: d, reason } }); refresh(); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
  };
  return (
    <Modal open onClose={onClose} title={`${row.sku} — ${row.label}`} wide>
      <Loadable q={b} rows={3}>
        {(bs) => (
          <table className="w-full text-left text-[13px]">
            <thead className="text-[12px] text-muted"><tr><th>Lot</th><th className="text-right">Qty</th><th>Expiry (FEFO order)</th><th>Received</th><th>Supplier</th><th></th></tr></thead>
            <tbody>{bs.map((x) => <tr key={x.id} className="border-t border-line/60"><td className="mono py-1">{x.lotNo}</td><td className="text-right">{x.qty}</td><td>{x.expiryDate ? new Date(x.expiryDate).toLocaleDateString('en-IN') : '—'}</td><td className="text-muted">{new Date(x.receivedAt).toLocaleDateString('en-IN')}</td><td className="text-muted">{x.supplier}</td><td className="text-right"><button className="text-accent" onClick={() => adjust(x)}>adjust</button></td></tr>)}</tbody>
          </table>
        )}
      </Loadable>
      <div className="mt-4 grid grid-cols-4 items-end gap-2 border-t border-line pt-4">
        <Field label="New lot no."><input value={lot} onChange={(e) => setLot(e.target.value)} className={inputCls} /></Field>
        <Field label="Qty"><input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} className={inputCls} /></Field>
        <Field label="Expiry (sterile)"><input type="date" value={exp} onChange={(e) => setExp(e.target.value)} className={inputCls} /></Field>
        <Button variant="primary" onClick={receive} disabled={!lot}>Receive stock</Button>
      </div>
      {err && <div className="mt-2 text-bad">{err}</div>}
    </Modal>
  );
}
