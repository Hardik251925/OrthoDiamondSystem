import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, get, openPdf } from '../lib/api';
import { adminSocket } from '../lib/socket';
import { dt, rupees, statusLabel } from '../lib/format';
import { MapView, type MapMarker } from '../components/MapView';
import { Badge, Button, Card, Field, Loadable, Modal, inputCls } from '../components/ui';

interface Order {
  id: string; orderNo: string; status: string; priority: string; createdAt: string; surgeryAt: string; rejectReason: string | null;
  treatingDoctorName: string; treatingDoctorPhone: string; paymentMode: string;
  patient: { name: string; age?: number; gender?: string; uhid?: string; procedure: string; side?: string; notes?: string };
  deliveryAddress: string; deliveryLat: number; deliveryLng: number; deliveryContactName: string; deliveryContactPhone: string;
  subtotalPaise: number; gstPaise: number; totalPaise: number;
  hospital: { name: string; address: string };
  placedBy: { name: string; role: string; phone: string };
  items: { id: string; description: string; sku: string | null; hsnCode: string; qty: number; unitPricePaise: number; gstPercent: number; lineTotalPaise: number }[];
  statusHistory: { id: string; from: string | null; to: string; at: string; reason: string | null; actor: { name: string; role: string } | null }[];
  assignedAgent: { id: string; vehicleNo: string; user: { name: string; phone: string } } | null;
  kitBookings: { id: string; returnedAt: string | null; surgeryAt: string; expectedReturnAt: string | null; kit: { id: string; name: string; type: string; contents: { variantId: string; qty: number; variant: { sku: string; product: { name: string } } }[] } }[];
  attachments: { path: string; url: string }[];
  proof: { receiverName: string; signatureUrl: string; photoUrl: string | null; at: string } | null;
}
interface Tracking { position: { lat: number; lng: number } | null; eta: { seconds: number; meters: number } | null; route: { lat: number; lng: number }[] | null; origin: { lat: number; lng: number } }

const NEXT: Record<string, string[]> = {
  PLACED: ['ACCEPTED', 'REJECTED', 'CANCELLED'], ACCEPTED: ['PACKED', 'CANCELLED'], PACKED: ['DISPATCHED'], DISPATCHED: ['REACHED_HOSPITAL'],
  REACHED_HOSPITAL: ['DELIVERED_TO_OT'], DELIVERED_TO_OT: ['CLOSED'], KIT_RETURNED: ['CLOSED'],
};

export function OrderDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['order', id], queryFn: () => get<Order>(`/orders/${id}`) });
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => get<{ id: string; isOnDuty: boolean; vehicleNo: string; user: { name: string } }[]>('/admin/agents') });
  const inTransit = q.data?.status === 'DISPATCHED' || q.data?.status === 'REACHED_HOSPITAL';
  const tr = useQuery({ queryKey: ['tracking', id], queryFn: () => get<Tracking>(`/orders/${id}/tracking`), enabled: !!q.data?.assignedAgent, refetchInterval: inTransit ? 30_000 : false });
  const [live, setLive] = useState<{ lat: number; lng: number; eta?: { seconds: number } } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [kitModal, setKitModal] = useState<Order['kitBookings'][number] | null>(null);
  const [proofModal, setProofModal] = useState(false);

  useEffect(() => {
    const s = adminSocket();
    const f = (p: { orderId: string; lat: number; lng: number; eta?: { seconds: number } }) => { if (p.orderId === id) setLive(p); };
    s.on('tracking:location', f);
    return () => { s.off('tracking:location', f); };
  }, [id]);

  const act = async (path: string, json: unknown) => {
    setErr(null);
    try { await api(path, { method: 'POST', json }); await qc.invalidateQueries({ queryKey: ['order', id] }); qc.invalidateQueries({ queryKey: ['orders'] }); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); }
  };
  const transition = (to: string) => {
    let reason: string | undefined;
    if (to === 'REJECTED' || to === 'CANCELLED') { reason = window.prompt(`Reason (${statusLabel(to)})`) ?? undefined; if (!reason) return; }
    if (to === 'DELIVERED_TO_OT') { setProofModal(true); return; }
    void act(`/orders/${id}/transition`, { to, reason });
  };

  const markers = useMemo<MapMarker[]>(() => {
    if (!q.data) return [];
    const m: MapMarker[] = [{ id: 'dest', lat: q.data.deliveryLat, lng: q.data.deliveryLng, kind: 'dest', popup: q.data.hospital.name }];
    const pos = live ?? tr.data?.position;
    if (pos && q.data.assignedAgent) m.push({ id: 'agent', lat: pos.lat, lng: pos.lng, kind: 'agent', label: q.data.assignedAgent.user.name[0], emergency: q.data.priority === 'EMERGENCY' });
    if (tr.data?.origin) m.push({ id: 'wh', ...tr.data.origin, kind: 'warehouse', popup: 'Ortho Diamond warehouse' });
    return m;
  }, [q.data, tr.data, live]);
  const eta = live?.eta ?? tr.data?.eta;

  return (
    <Loadable q={q} rows={10}>
      {(o) => (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/orders" className="text-muted">← Orders</Link>
            <h1 className="mono text-xl font-bold">{o.orderNo}</h1>
            <Badge value={o.priority} /><Badge value={o.status} />
            <span className="text-[12px] text-muted">placed {dt(o.createdAt)} by {o.placedBy.name} ({o.placedBy.role.replace('_', ' ')})</span>
            <div className="ml-auto flex flex-wrap gap-2">
              {(NEXT[o.status] ?? []).map((to) => (
                <Button key={to} variant={to === 'REJECTED' || to === 'CANCELLED' ? 'danger' : o.priority === 'EMERGENCY' && to === 'ACCEPTED' ? 'amber' : 'primary'} onClick={() => transition(to)}>
                  {to === 'DELIVERED_TO_OT' ? 'Delivered (add proof)' : statusLabel(to)}
                </Button>
              ))}
              {o.status === 'KIT_RETURN_PENDING' && o.kitBookings.filter((b) => !b.returnedAt).map((b) => <Button key={b.id} variant="primary" onClick={() => setKitModal(b)}>Kit return: {b.kit.name}</Button>)}
              <Button onClick={() => openPdf(`/orders/${o.id}/invoice`)}>Invoice PDF</Button>
              <Button onClick={() => openPdf(`/orders/${o.id}/invoice?type=challan`)}>Challan PDF</Button>
            </div>
          </div>
          {err && <div className="rounded-lg border border-bad/40 bg-bad/10 p-2 text-bad">{err}</div>}
          {o.rejectReason && <div className="rounded-lg border border-bad/40 bg-bad/10 p-2 text-bad">Rejected: {o.rejectReason}</div>}

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="space-y-4 xl:col-span-2">
              <div className="grid gap-4 md:grid-cols-2">
                <Card title="Patient & surgery">
                  <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-[13px]">
                    <dt className="text-muted">Patient</dt><dd>{o.patient.name} {o.patient.age ? `· ${o.patient.age}y` : ''} {o.patient.gender ?? ''}</dd>
                    <dt className="text-muted">UHID</dt><dd className="mono">{o.patient.uhid ?? '—'}</dd>
                    <dt className="text-muted">Procedure</dt><dd>{o.patient.procedure} {o.patient.side ? `(${o.patient.side})` : ''}</dd>
                    <dt className="text-muted">Surgery</dt><dd className="font-semibold">{dt(o.surgeryAt)}</dd>
                    <dt className="text-muted">Notes</dt><dd>{o.patient.notes ?? '—'}</dd>
                    <dt className="text-muted">Payment</dt><dd>{statusLabel(o.paymentMode)}</dd>
                  </dl>
                  {o.attachments.length > 0 && <div className="mt-2 flex gap-2">{o.attachments.map((a) => <a key={a.path} href={a.url} target="_blank" rel="noreferrer" className="text-accent underline">X-ray</a>)}</div>}
                </Card>
                <Card title="Doctor & delivery">
                  <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-[13px]">
                    <dt className="text-muted">Doctor</dt><dd>{o.treatingDoctorName} · <a className="text-accent" href={`tel:${o.treatingDoctorPhone}`}>{o.treatingDoctorPhone}</a></dd>
                    <dt className="text-muted">Hospital</dt><dd>{o.hospital.name}</dd>
                    <dt className="text-muted">Deliver to</dt><dd>{o.deliveryAddress} · <a className="text-accent" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${o.deliveryLat},${o.deliveryLng}`}>map</a></dd>
                    <dt className="text-muted">OT contact</dt><dd>{o.deliveryContactName} · {o.deliveryContactPhone}</dd>
                    <dt className="text-muted">Agent</dt>
                    <dd>
                      {['PLACED', 'ACCEPTED', 'PACKED'].includes(o.status) ? (
                        <select value={o.assignedAgent?.id ?? ''} onChange={(e) => e.target.value && act(`/orders/${o.id}/assign`, { agentId: e.target.value })} className={`${inputCls} w-full`}>
                          <option value="">— assign agent —</option>
                          {(agents.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.user.name} · {a.vehicleNo} {a.isOnDuty ? '(on duty)' : '(off)'}</option>)}
                        </select>
                      ) : o.assignedAgent ? `${o.assignedAgent.user.name} · ${o.assignedAgent.vehicleNo} · ${o.assignedAgent.user.phone}` : '—'}
                    </dd>
                  </dl>
                </Card>
              </div>
              <Card title={`Items (${o.items.length})`}>
                <table className="w-full text-left text-[13px]">
                  <thead className="text-[12px] text-muted"><tr><th className="py-1">Item</th><th>SKU</th><th>HSN</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">GST</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {o.items.map((i) => (
                      <tr key={i.id} className="border-t border-line/60"><td className="py-1.5">{i.description}</td><td className="mono text-[12px] text-muted">{i.sku ?? '—'}</td><td className="text-muted">{i.hsnCode}</td><td className="text-right">{i.qty}</td><td className="text-right">{rupees(i.unitPricePaise)}</td><td className="text-right text-muted">{i.gstPercent}%</td><td className="text-right">{rupees(i.lineTotalPaise)}</td></tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-line"><td colSpan={6} className="pt-2 text-right text-muted">Subtotal</td><td className="pt-2 text-right">{rupees(o.subtotalPaise)}</td></tr>
                    <tr><td colSpan={6} className="text-right text-muted">GST</td><td className="text-right">{rupees(o.gstPaise)}</td></tr>
                    <tr><td colSpan={6} className="text-right font-bold">Total</td><td className="text-right text-lg font-bold text-accent">{rupees(o.totalPaise)}</td></tr>
                  </tfoot>
                </table>
                {o.kitBookings.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-line pt-3 text-[13px]">
                    {o.kitBookings.map((b) => <div key={b.id}>🧰 <b>{b.kit.name}</b> (LOAN) · expected back {dt(b.expectedReturnAt)} · {b.returnedAt ? <span className="text-ok">returned {dt(b.returnedAt)}</span> : <span className="text-amber">out</span>}</div>)}
                  </div>
                )}
              </Card>
            </div>
            <div className="space-y-4">
              {o.assignedAgent && (
                <Card title={inTransit ? `Live · ETA ${eta ? `${Math.max(1, Math.round(eta.seconds / 60))} min` : '—'}` : 'Delivery map'}>
                  <MapView markers={markers} routes={tr.data?.route && inTransit ? [{ id: 'r', points: tr.data.route }] : []} height={280} fitKey={`${o.id}-${!!tr.data}`} />
                </Card>
              )}
              <Card title="Timeline">
                <ol className="relative space-y-3 border-l border-line pl-4">
                  {o.statusHistory.map((h) => (
                    <li key={h.id}>
                      <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
                      <div className="flex items-center gap-2"><Badge value={h.to} /><span className="text-[12px] text-muted">{dt(h.at)}</span></div>
                      <div className="text-[12px] text-muted">{h.actor ? `${h.actor.name}` : 'System'}{h.reason ? ` — ${h.reason}` : ''}</div>
                    </li>
                  ))}
                </ol>
              </Card>
              {o.proof && (
                <Card title="Delivery proof">
                  <div className="text-[13px]">Received by <b>{o.proof.receiverName}</b> · {dt(o.proof.at)}</div>
                  <img src={o.proof.signatureUrl} alt="signature" className="mt-2 rounded-lg bg-white p-1" />
                  {o.proof.photoUrl && <img src={o.proof.photoUrl} alt="proof" className="mt-2 rounded-lg" />}
                </Card>
              )}
            </div>
          </div>
          {kitModal && <KitReturnModal order={o} booking={kitModal} onClose={() => setKitModal(null)} onDone={() => { setKitModal(null); qc.invalidateQueries({ queryKey: ['order', id] }); }} />}
          <ProofModal open={proofModal} orderId={o.id} onClose={() => setProofModal(false)} onDone={() => { setProofModal(false); qc.invalidateQueries({ queryKey: ['order', id] }); }} />
        </div>
      )}
    </Loadable>
  );
}

function KitReturnModal({ order, booking, onClose, onDone }: { order: Order; booking: Order['kitBookings'][number]; onClose: () => void; onDone: () => void }) {
  const [used, setUsed] = useState<Record<string, number>>({});
  const [missing, setMissing] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null);
  const toList = (m: Record<string, number>) => Object.entries(m).filter(([, q]) => q > 0).map(([variantId, qty]) => ({ variantId, qty }));
  const submit = async () => {
    try { await api(`/orders/${order.id}/kit-return`, { method: 'POST', json: { bookingId: booking.id, usedItems: toList(used), missingItems: toList(missing) } }); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
  };
  return (
    <Modal open onClose={onClose} title={`Return checklist — ${booking.kit.name}`} wide>
      <p className="mb-3 text-[12px] text-muted">Enter quantities used in surgery (billed automatically) and missing items (flagged to admin). Leave 0 for items returned intact.</p>
      <table className="w-full text-[13px]">
        <thead className="text-[12px] text-muted"><tr><th className="text-left">Item</th><th>In kit</th><th>Used</th><th>Missing</th></tr></thead>
        <tbody>
          {booking.kit.contents.map((c) => (
            <tr key={c.variantId} className="border-t border-line/60">
              <td className="py-1">{c.variant.product.name} <span className="mono text-[11px] text-muted">{c.variant.sku}</span></td>
              <td className="text-center">{c.qty}</td>
              <td><input type="number" min={0} max={c.qty} value={used[c.variantId] ?? 0} onChange={(e) => setUsed({ ...used, [c.variantId]: Number(e.target.value) })} className={`${inputCls} w-16 text-center`} /></td>
              <td><input type="number" min={0} max={c.qty} value={missing[c.variantId] ?? 0} onChange={(e) => setMissing({ ...missing, [c.variantId]: Number(e.target.value) })} className={`${inputCls} w-16 text-center`} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {err && <div className="mt-2 text-bad">{err}</div>}
      <div className="mt-4 flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Confirm return</Button></div>
    </Modal>
  );
}

function ProofModal({ open, orderId, onClose, onDone }: { open: boolean; orderId: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#0B2545'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    let down = false;
    const pos = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height] as const; };
    const d = (e: PointerEvent) => { down = true; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
    const m = (e: PointerEvent) => { if (!down) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); };
    const u = () => (down = false);
    canvas.addEventListener('pointerdown', d); canvas.addEventListener('pointermove', m); window.addEventListener('pointerup', u);
    return () => { canvas.removeEventListener('pointerdown', d); canvas.removeEventListener('pointermove', m); window.removeEventListener('pointerup', u); };
  }, [canvas]);
  const submit = async () => {
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    const fd = new FormData();
    fd.append('receiverName', name);
    if (blob) fd.append('signature', blob, 'signature.png');
    try { await api(`/orders/${orderId}/proof`, { method: 'POST', body: fd }); onDone(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Delivery proof">
      <div className="space-y-3">
        <Field label="Receiver name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
        <div className="text-[12px] text-muted">Signature</div>
        <canvas ref={setCanvas} width={460} height={160} className="w-full touch-none rounded-lg border border-line" />
        {err && <div className="text-bad">{err}</div>}
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={name.length < 2} onClick={submit}>Save & mark delivered</Button></div>
      </div>
    </Modal>
  );
}
