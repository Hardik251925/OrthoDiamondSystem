import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';
import { adminSocket } from '../lib/socket';
import { ago } from '../lib/format';
import { MapView, type MapMarker } from '../components/MapView';
import { Badge, Card, Empty, Loadable } from '../components/ui';

interface Active { id: string; orderNo: string; priority: string; status: string; deliveryLat: number; deliveryLng: number; hospital: { name: string }; assignedAgent: { id: string; user: { name: string } } | null; position: { lat: number; lng: number } | null }
interface Live { lat: number; lng: number; at: string; source: string; eta?: { seconds: number; meters: number } | null }

export function TrackingPage() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => get<{ activeDeliveries: Active[] }>('/admin/dashboard'), refetchInterval: 30_000 });
  const [live, setLive] = useState<Record<string, Live>>({});
  useEffect(() => {
    const s = adminSocket();
    const f = (p: Live & { orderId: string }) => p.orderId && setLive((m) => ({ ...m, [p.orderId]: p }));
    s.on('tracking:location', f);
    return () => { s.off('tracking:location', f); };
  }, []);
  const list = useMemo(() => q.data?.activeDeliveries ?? [], [q.data]);
  const markers = useMemo<MapMarker[]>(() => list.flatMap((a) => {
    const pos = live[a.id] ?? a.position;
    const m: MapMarker[] = [{ id: `d-${a.id}`, lat: a.deliveryLat, lng: a.deliveryLng, kind: 'dest', popup: `${a.hospital.name} (${a.orderNo})` }];
    if (pos && a.assignedAgent) m.push({ id: `a-${a.id}`, lat: pos.lat, lng: pos.lng, kind: 'agent', label: a.assignedAgent.user.name[0], emergency: a.priority === 'EMERGENCY', popup: `${a.assignedAgent.user.name} → ${a.orderNo}` });
    return m;
  }), [list, live]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Card title="All active deliveries (live)">
        <MapView markers={markers} height={620} fitKey={list.map((a) => a.id).join()} />
      </Card>
      <Card title={`On the road (${list.length})`}>
        <Loadable q={q} rows={4}>
          {() => list.length === 0 ? <Empty>No deliveries in transit</Empty> : (
            <div className="space-y-2">
              {list.map((a) => {
                const l = live[a.id];
                return (
                  <Link key={a.id} to={`/orders/${a.id}`} className="block rounded-lg border border-line bg-surface-2 p-3 hover:border-accent/60">
                    <div className="flex items-center justify-between"><span className="mono font-semibold">{a.orderNo}</span><Badge value={a.priority} /></div>
                    <div className="text-[13px]">{a.assignedAgent?.user.name} → {a.hospital.name}</div>
                    <div className="mt-1 flex items-center justify-between text-[12px] text-muted">
                      <Badge value={a.status} />
                      <span>{l?.eta ? `ETA ${Math.max(1, Math.round(l.eta.seconds / 60))} min · ${(l.eta.meters / 1000).toFixed(1)} km` : 'waiting for GPS…'}</span>
                    </div>
                    {l && <div className="text-[11px] text-muted">updated {ago(l.at)} · {l.source === 'demo' ? 'demo simulator' : 'GPS'}</div>}
                  </Link>
                );
              })}
            </div>
          )}
        </Loadable>
      </Card>
    </div>
  );
}
