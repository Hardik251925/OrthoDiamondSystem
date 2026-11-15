import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';
import { rupees } from '../lib/format';
import { Badge, Card, Loadable, cx } from '../components/ui';

interface Kit { id: string; name: string; slug: string; type: string; description: string; physicalSets: number; itemCount: number; pricePaise: number; availableOnDate: number; sterilisationStatus: string; trayPhotos: string[] }
interface KitDetail extends Kit { contents: { variantId: string; sku: string; qty: number; label: string; stockStatus: string }[]; calendar: { date: string; available: number }[] }

export function KitsPage() {
  const kits = useQuery({ queryKey: ['kits'], queryFn: () => get<Kit[]>('/kits') });
  const [sel, setSel] = useState<string | null>(null);
  const detail = useQuery({ queryKey: ['kit', sel], queryFn: () => get<KitDetail>(`/kits/${sel}`), enabled: !!sel });
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <Card title="Operation kits">
        <Loadable q={kits}>
          {(ks) => (
            <div className="grid gap-2 sm:grid-cols-2">
              {ks.map((k) => (
                <button key={k.id} onClick={() => setSel(k.id)} className={cx('rounded-lg border bg-surface-2 p-3 text-left hover:border-accent/60', sel === k.id ? 'border-accent' : 'border-line')}>
                  <div className="flex items-center justify-between"><b>{k.name}</b><Badge value={k.type} /></div>
                  <div className="mt-1 text-[12px] text-muted">{k.itemCount} items · {k.physicalSets} sets · {k.sterilisationStatus.replace('_', ' ').toLowerCase()}</div>
                  <div className="mt-1 flex justify-between text-[13px]"><span>{k.type === 'LOAN' ? `Rental ${rupees(k.pricePaise)}` : rupees(k.pricePaise)}</span><span className={k.availableOnDate ? 'text-ok' : 'text-bad'}>{k.availableOnDate} available today</span></div>
                </button>
              ))}
            </div>
          )}
        </Loadable>
      </Card>
      <Card title={detail.data ? `${detail.data.name} — contents & 14-day availability` : 'Select a kit'}>
        {sel ? (
          <Loadable q={detail}>
            {(k) => (
              <div className="space-y-4">
                <div className="grid grid-cols-7 gap-1">
                  {k.calendar.map((c) => (
                    <div key={c.date} className={cx('rounded-md p-1.5 text-center text-[11px]', c.available ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad')}>
                      <div>{new Date(c.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div><b>{c.available}</b>
                    </div>
                  ))}
                </div>
                <table className="w-full text-left text-[13px]">
                  <thead className="text-[12px] text-muted"><tr><th>Item</th><th>SKU</th><th className="text-right">Qty</th><th>Stock</th></tr></thead>
                  <tbody>{k.contents.map((c) => <tr key={c.variantId} className="border-t border-line/60"><td className="py-1">{c.label}</td><td className="mono text-[12px] text-muted">{c.sku}</td><td className="text-right">{c.qty}</td><td><Badge value={c.stockStatus} /></td></tr>)}</tbody>
                </table>
              </div>
            )}
          </Loadable>
        ) : <p className="text-muted">Pick a kit on the left to see its tray contents and booking calendar.</p>}
      </Card>
    </div>
  );
}

export function TemplatesPage() {
  const q = useQuery({ queryKey: ['templates'], queryFn: () => get<{ id: string; name: string; description: string; kit: { name: string; type: string } | null; items: { variantId: string; sku: string; qty: number; label: string; pricePaise: number; stockStatus: string }[] }[]>('/procedure-templates') });
  return (
    <Loadable q={q}>
      {(ts) => (
        <div className="grid gap-4 lg:grid-cols-2">
          {ts.map((t) => (
            <Card key={t.id} title={t.name} actions={t.kit && <span className="text-[12px] text-muted">Kit: {t.kit.name} <Badge value={t.kit.type} /></span>}>
              <p className="mb-2 text-[12px] text-muted">{t.description}</p>
              <table className="w-full text-[13px]">
                <tbody>{t.items.map((i) => <tr key={i.variantId} className="border-t border-line/60"><td className="py-1">{i.label}</td><td className="text-right">×{i.qty}</td><td className="text-right">{rupees(i.pricePaise * i.qty)}</td><td className="pl-2"><Badge value={i.stockStatus} /></td></tr>)}</tbody>
              </table>
              <div className="mt-2 text-right font-semibold">{rupees(t.items.reduce((a, i) => a + i.pricePaise * i.qty, 0))} + GST</div>
            </Card>
          ))}
        </div>
      )}
    </Loadable>
  );
}
