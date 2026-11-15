import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';
import { adminSocket } from '../lib/socket';
import { useT } from '../lib/app-context';
import { ago, rupees } from '../lib/format';
import { MapView, type MapMarker } from '../components/MapView';
import { Badge, Card, Kpi, Loadable } from '../components/ui';

interface Dash {
  todayOrders: number; todayRevenuePaise: number; emergenciesOpen: { id: string }[]; lowStock: number; outOfStock: number; expiringBatches: number;
  kitsOnLoan: number; pendingDoctors: number; statusCounts: Record<string, number>;
  activeDeliveries: { id: string; orderNo: string; priority: string; deliveryLat: number; deliveryLng: number; status: string; hospital: { name: string }; assignedAgent: { id: string; user: { name: string } } | null; position: { lat: number; lng: number } | null }[];
  recent: { id: string; orderNo: string; status: string; priority: string; treatingDoctorName: string; totalPaise: number; createdAt: string; hospital: { name: string } }[];
  last7: { day: string; orders: number; revenuePaise: number }[];
}

export function DashboardPage() {
  const t = useT();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => get<Dash>('/admin/dashboard'), refetchInterval: 30_000 });
  const [live, setLive] = useState<Record<string, { lat: number; lng: number }>>({});
  useEffect(() => {
    const s = adminSocket();
    const f = (p: { agentId: string; lat: number; lng: number }) => setLive((m) => ({ ...m, [p.agentId]: { lat: p.lat, lng: p.lng } }));
    s.on('tracking:location', f);
    return () => { s.off('tracking:location', f); };
  }, []);

  const markers = useMemo<MapMarker[]>(() => {
    const d = q.data?.activeDeliveries ?? [];
    return d.flatMap((a) => {
      const pos = (a.assignedAgent && live[a.assignedAgent.id]) || a.position;
      const out: MapMarker[] = [{ id: `d-${a.id}`, lat: a.deliveryLat, lng: a.deliveryLng, kind: 'dest', popup: a.hospital.name }];
      if (pos && a.assignedAgent) out.push({ id: `a-${a.assignedAgent.id}`, lat: pos.lat, lng: pos.lng, kind: 'agent', label: a.assignedAgent.user.name[0], emergency: a.priority === 'EMERGENCY', popup: `${a.assignedAgent.user.name} → ${a.orderNo}` });
      return out;
    });
  }, [q.data, live]);

  return (
    <Loadable q={q} rows={8}>
      {(d) => {
        const max = Math.max(1, ...d.last7.map((x) => x.revenuePaise));
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
              <Kpi label={t('todayOrders')} value={d.todayOrders} onClick={() => nav('/orders')} />
              <Kpi label={t('revenue')} value={rupees(d.todayRevenuePaise)} tone="ok" />
              <Kpi label={t('emergencies')} value={d.emergenciesOpen.length} tone={d.emergenciesOpen.length ? 'amber' : 'ok'} onClick={() => nav('/orders?priority=EMERGENCY')} />
              <Kpi label={t('onRoad')} value={d.activeDeliveries.length} onClick={() => nav('/tracking')} />
              <Kpi label={t('lowStock')} value={d.lowStock} tone="amber" onClick={() => nav('/inventory?filter=low')} />
              <Kpi label={t('outOfStock')} value={d.outOfStock} tone="bad" onClick={() => nav('/inventory?filter=out')} />
              <Kpi label={t('kitsOnLoan')} value={d.kitsOnLoan} onClick={() => nav('/kits')} sub={`${d.expiringBatches} batches expiring ≤60d`} />
              <Kpi label={t('pendingDoctors')} value={d.pendingDoctors} tone={d.pendingDoctors ? 'amber' : 'ok'} onClick={() => nav('/doctors')} />
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              <Card title={`${t('tracking')} — ${d.activeDeliveries.length} active`} className="xl:col-span-2" actions={<Link to="/tracking" className="text-[12px] text-accent">Full map →</Link>}>
                <MapView markers={markers} height={330} fitKey={d.activeDeliveries.map((a) => a.id).join()} />
              </Card>
              <Card title="Last 7 days (revenue)">
                <div className="flex h-[300px] items-end gap-2">
                  {d.last7.map((x) => (
                    <div key={x.day} className="flex flex-1 flex-col items-center gap-1">
                      <div className="text-[10px] text-muted">{x.orders}</div>
                      <div className="w-full rounded-t-md bg-accent/70" style={{ height: `${(x.revenuePaise / max) * 230}px` }} title={rupees(x.revenuePaise)} />
                      <div className="text-[10px] text-muted">{new Date(x.day).toLocaleDateString('en-IN', { weekday: 'short' })}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(d.statusCounts).map(([s, n]) => <span key={s} className="text-[11px]"><Badge value={s} /> {n}</span>)}
                </div>
              </Card>
            </div>
            <Card title="Recent orders" actions={<Link to="/orders" className="text-[12px] text-accent">All orders →</Link>}>
              <table className="w-full text-left">
                <tbody>
                  {d.recent.map((o) => (
                    <tr key={o.id} onClick={() => nav(`/orders/${o.id}`)} className="cursor-pointer border-b border-line/50 hover:bg-surface-2">
                      <td className="mono py-2 text-accent">{o.orderNo}</td>
                      <td><Badge value={o.priority} /></td>
                      <td>{o.treatingDoctorName}</td>
                      <td className="text-muted">{o.hospital.name}</td>
                      <td><Badge value={o.status} /></td>
                      <td className="text-right">{rupees(o.totalPaise)}</td>
                      <td className="text-right text-muted">{ago(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        );
      }}
    </Loadable>
  );
}
