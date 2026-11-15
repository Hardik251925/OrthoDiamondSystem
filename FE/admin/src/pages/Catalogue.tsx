import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, downloadFile, get } from '../lib/api';
import { attrText, rupees } from '../lib/format';
import { Badge, Button, Card, Field, Loadable, Modal, cx, inputCls } from '../components/ui';

interface Cat { id: string; name: string; slug: string; productCount: number; image: string | null }
interface Prod { id: string; name: string; slug: string; category: { name: string }; brand: string | null; images: string[]; isSterile: boolean; variantCount: number; inStockCount: number; priceFromPaise: number | null }
interface ProdDetail { id: string; name: string; description: string; hsnCode: string; gstPercent: number; isSterile: boolean; images: string[]; category: { name: string }; brand: { name: string } | null; variants: { id: string; sku: string; attributes: Record<string, unknown>; material: { code: string; name: string } | null; pricePaise: number; mrpPaise: number; stockStatus: string; availableQty: number }[] }

export function CataloguePage() {
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [create, setCreate] = useState(false);
  const cats = useQuery({ queryKey: ['cats'], queryFn: () => get<Cat[]>('/catalog/categories') });
  const prods = useQuery({ queryKey: ['prods', cat, q], queryFn: () => api<Prod[]>(`/catalog/products?pageSize=100${cat ? `&category=${cat}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`) });
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <Card title="Categories">
        <Loadable q={cats} rows={8}>
          {(cs) => (
            <ul className="space-y-0.5">
              <li><button onClick={() => setCat('')} className={cx('w-full rounded-md px-2 py-1 text-left', !cat && 'bg-accent/15 text-accent')}>All</button></li>
              {cs.map((c) => <li key={c.id}><button onClick={() => setCat(c.slug)} className={cx('flex w-full justify-between rounded-md px-2 py-1 text-left', cat === c.slug && 'bg-accent/15 text-accent')}><span>{c.name}</span><span className="text-muted">{c.productCount}</span></button></li>)}
            </ul>
          )}
        </Loadable>
      </Card>
      <Card title="Products" actions={<>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / SKU / tag" className={`${inputCls} w-56`} />
        <Button onClick={() => downloadFile('/admin/catalog/export.csv', 'ortho-diamond-catalogue.csv')}>Export CSV</Button>
        <Button variant="primary" onClick={() => setCreate(true)}>+ Product (matrix)</Button>
      </>}>
        <Loadable q={{ ...prods, data: prods.data?.data }} empty={(d) => !d.length}>
          {(ps) => (
            <table className="w-full text-left">
              <thead className="text-[12px] text-muted"><tr><th className="py-1"></th><th>Product</th><th>Category</th><th>Brand</th><th className="text-right">Sizes</th><th className="text-right">In stock</th><th className="text-right">From</th></tr></thead>
              <tbody>
                {ps.map((p) => (
                  <tr key={p.id} className="border-t border-line/60 hover:bg-surface-2">
                    <td className="w-10 py-1.5">{p.images[0] && <img src={p.images[0]} className="h-8 w-8 rounded" alt="" />}</td>
                    <td><Link to={`/catalogue/${p.slug}`} className="font-medium hover:text-accent">{p.name}</Link> {p.isSterile && <span className="ml-1 text-[11px] text-accent">STERILE</span>}</td>
                    <td className="text-muted">{p.category.name}</td><td className="text-muted">{p.brand}</td>
                    <td className="text-right">{p.variantCount}</td>
                    <td className={cx('text-right', p.inStockCount < p.variantCount && 'text-amber')}>{p.inStockCount}</td>
                    <td className="text-right">{rupees(p.priceFromPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Loadable>
      </Card>
      {create && <MatrixModal cats={cats.data ?? []} onClose={() => setCreate(false)} />}
    </div>
  );
}

const nums = (s: string) => s.split(/[,\s]+/).map(Number).filter((n) => n > 0);

function MatrixModal({ cats, onClose }: { cats: Cat[]; onClose: () => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const mats = useQuery({ queryKey: ['materials'], queryFn: () => get<{ id: string; name: string; code: string }[]>('/catalog/materials') });
  const [f, setF] = useState({ name: '', categoryId: '', skuPrefix: '', hsnCode: '9021', gstPercent: 5, isSterile: false, description: '', diam: '3.5', len: '10 12 14 16 18 20', holes: '', sides: [] as string[], materialIds: [] as string[], base: 400, step: 6, initialQty: 10 });
  const [err, setErr] = useState<{ msg: string; fields?: Record<string, string> } | null>(null);
  const count = useMemo(() => Math.max(1, nums(f.diam).length) * Math.max(1, nums(f.len).length) * Math.max(1, nums(f.holes).length) * Math.max(1, f.sides.length) * f.materialIds.length, [f]);
  const set = (k: keyof typeof f, v: unknown) => setF({ ...f, [k]: v });
  const submit = async () => {
    setErr(null);
    try {
      const r = await api<{ slug: string; variants: number }>('/admin/catalog/products', { method: 'POST', json: {
        name: f.name, categoryId: f.categoryId, skuPrefix: f.skuPrefix, hsnCode: f.hsnCode, gstPercent: f.gstPercent, isSterile: f.isSterile, description: f.description,
        matrix: { materialIds: f.materialIds, diameterMm: nums(f.diam), lengthMm: nums(f.len), holes: nums(f.holes), sides: f.sides },
        basePricePaise: Math.round(f.base * 100), pricePerStepPaise: Math.round(f.step * 100), initialQty: f.initialQty,
      } });
      qc.invalidateQueries({ queryKey: ['prods'] });
      nav(`/catalogue/${r.data.slug}`);
    } catch (e) {
      if (e instanceof ApiError) setErr({ msg: e.message, fields: Object.fromEntries(((e.details as { field: string; message: string }[]) ?? []).map((d) => [d.field, d.message])) });
    }
  };
  const fe = (k: string) => err?.fields?.[k];
  return (
    <Modal open onClose={onClose} title="New product — variant matrix generator" wide>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Product name" error={fe('name')}><input value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} placeholder="3.5mm Cortical Screw Self-Tapping" /></Field>
        <Field label="Category" error={fe('categoryId')}><select value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)} className={inputCls}><option value="">Select…</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="SKU prefix" error={fe('skuPrefix')}><input value={f.skuPrefix} onChange={(e) => set('skuPrefix', e.target.value.toUpperCase())} className={`${inputCls} mono`} placeholder="CST35" /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="HSN"><input value={f.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} className={inputCls} /></Field>
          <Field label="GST %"><input type="number" value={f.gstPercent} onChange={(e) => set('gstPercent', Number(e.target.value))} className={inputCls} /></Field>
          <Field label="Sterile"><input type="checkbox" checked={f.isSterile} onChange={(e) => set('isSterile', e.target.checked)} className="mt-2 h-4 w-4" /></Field>
        </div>
        <Field label="Diameters mm (space separated)"><input value={f.diam} onChange={(e) => set('diam', e.target.value)} className={inputCls} /></Field>
        <Field label="Lengths mm"><input value={f.len} onChange={(e) => set('len', e.target.value)} className={inputCls} /></Field>
        <Field label="Holes (plates)"><input value={f.holes} onChange={(e) => set('holes', e.target.value)} className={inputCls} placeholder="e.g. 4 6 8" /></Field>
        <Field label="Sides">
          <div className="flex gap-3 pt-1">{['L', 'R'].map((s) => <label key={s} className="flex items-center gap-1"><input type="checkbox" checked={f.sides.includes(s)} onChange={(e) => set('sides', e.target.checked ? [...f.sides, s] : f.sides.filter((x) => x !== s))} />{s}</label>)}</div>
        </Field>
        <Field label="Materials" error={fe('matrix.materialIds')}>
          <div className="flex flex-wrap gap-3 pt-1">{(mats.data ?? []).map((m) => <label key={m.id} className="flex items-center gap-1"><input type="checkbox" checked={f.materialIds.includes(m.id)} onChange={(e) => set('materialIds', e.target.checked ? [...f.materialIds, m.id] : f.materialIds.filter((x) => x !== m.id))} />{m.code}</label>)}</div>
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Base price ₹"><input type="number" value={f.base} onChange={(e) => set('base', Number(e.target.value))} className={inputCls} /></Field>
          <Field label="+₹ per size step"><input type="number" value={f.step} onChange={(e) => set('step', Number(e.target.value))} className={inputCls} /></Field>
          <Field label="Opening qty each"><input type="number" value={f.initialQty} onChange={(e) => set('initialQty', Number(e.target.value))} className={inputCls} /></Field>
        </div>
      </div>
      {err && <div className="mt-3 text-bad">{err.msg}</div>}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-muted">Will create <b className="text-accent">{f.materialIds.length ? count : 0}</b> variants</span>
        <div className="flex gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} disabled={!f.materialIds.length}>Create product</Button></div>
      </div>
    </Modal>
  );
}

export function ProductPage() {
  const { slug } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['prod', slug], queryFn: () => get<ProdDetail>(`/catalog/products/${slug}`) });
  const [edit, setEdit] = useState<ProdDetail['variants'][number] | null>(null);
  const [price, setPrice] = useState(0);
  const [threshold, setThreshold] = useState(0);
  return (
    <Loadable q={q} rows={10}>
      {(p) => (
        <div className="space-y-4">
          <div className="flex items-center gap-3"><Link to="/catalogue" className="text-muted">← Catalogue</Link><h1 className="text-xl font-bold">{p.name}</h1>{p.isSterile && <Badge value="STERILE" />}</div>
          <Card>
            <div className="flex gap-4">
              {p.images[0] && <img src={p.images[0]} alt="" className="h-28 w-28 rounded-lg" />}
              <div className="text-[13px]">
                <div className="text-muted">{p.category.name} · {p.brand?.name} · HSN {p.hsnCode} · GST {p.gstPercent}%</div>
                <p className="mt-1 max-w-2xl">{p.description}</p>
                <div className="mt-2 flex gap-3 text-[12px]">
                  <span><Badge value="IN_STOCK" /> {p.variants.filter((v) => v.stockStatus === 'IN_STOCK').length}</span>
                  <span><Badge value="LOW_STOCK" /> {p.variants.filter((v) => v.stockStatus === 'LOW_STOCK').length}</span>
                  <span><Badge value="OUT_OF_STOCK" /> {p.variants.filter((v) => v.stockStatus === 'OUT_OF_STOCK').length}</span>
                </div>
              </div>
            </div>
          </Card>
          <Card title={`Variants (${p.variants.length})`}>
            <table className="w-full text-left text-[13px]">
              <thead className="text-[12px] text-muted"><tr><th className="py-1">SKU</th><th>Size</th><th>Material</th><th className="text-right">Price</th><th className="text-right">MRP</th><th className="text-right">Available</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {p.variants.map((v) => (
                  <tr key={v.id} className={cx('border-t border-line/60', v.stockStatus === 'OUT_OF_STOCK' && 'bg-bad/5')}>
                    <td className="mono py-1 text-[12px]">{v.sku}</td><td>{attrText(v.attributes)}</td><td className="text-muted">{v.material?.code}</td>
                    <td className="text-right">{rupees(v.pricePaise)}</td><td className="text-right text-muted">{rupees(v.mrpPaise)}</td>
                    <td className="text-right">{v.availableQty}</td><td><Badge value={v.stockStatus} /></td>
                    <td className="text-right"><button className="text-accent" onClick={() => { setEdit(v); setPrice(v.pricePaise / 100); setThreshold(5); }}>edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {edit && (
            <Modal open onClose={() => setEdit(null)} title={`Edit ${edit.sku}`}>
              <div className="space-y-3">
                <Field label="Price ₹ (excl. GST)"><input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} className={inputCls} /></Field>
                <Field label="Low-stock threshold"><input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className={inputCls} /></Field>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => setEdit(null)}>Cancel</Button>
                  <Button variant="primary" onClick={async () => { await api(`/admin/catalog/variants/${edit.id}`, { method: 'PATCH', json: { pricePaise: Math.round(price * 100), mrpPaise: Math.round(price * 125), lowStockThreshold: threshold } }); setEdit(null); qc.invalidateQueries({ queryKey: ['prod', slug] }); }}>Save</Button>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}
    </Loadable>
  );
}
