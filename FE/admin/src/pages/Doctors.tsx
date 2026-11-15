import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, get } from '../lib/api';
import { dt } from '../lib/format';
import { Badge, Button, Card, Loadable, Modal, cx } from '../components/ui';

interface Doc { id: string; fullName: string; phone: string; email: string; specialisation: string; councilRegNo: string; stateCouncil: string; status: string; rejectReason: string | null; createdAt: string; hospitals: { id: string; name: string }[]; reviewedBy: { name: string } | null; reviewedAt: string | null; certificate?: { url: string } | null }

export function DoctorsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['doctors', status], queryFn: () => get<Doc[]>(`/doctors?status=${status}&pageSize=100`) });
  const detail = useQuery({ queryKey: ['doctor', sel], queryFn: () => get<Doc>(`/doctors/${sel}`), enabled: !!sel });
  const review = async (decision: 'approve' | 'reject') => {
    setErr(null);
    const reason = decision === 'reject' ? window.prompt('Reason for rejection') : undefined;
    if (decision === 'reject' && !reason) return;
    try { await api(`/doctors/${sel}/${decision}`, { method: 'POST', json: decision === 'reject' ? { reason } : {} }); setSel(null); qc.invalidateQueries({ queryKey: ['doctors'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="mr-2 text-lg font-bold">Doctors</h1>
        {['PENDING', 'APPROVED', 'REJECTED'].map((s) => <button key={s} onClick={() => setStatus(s)} className={cx('rounded-md px-3 py-1 text-[12px]', status === s ? 'bg-accent text-accent-ink' : 'border border-line text-muted')}>{s === 'PENDING' ? 'Approval queue' : s.toLowerCase()}</button>)}
      </div>
      <Card>
        <Loadable q={list} empty={(d) => !d.length}>
          {(ds) => (
            <table className="w-full text-left text-[13px]">
              <thead className="text-[12px] text-muted"><tr><th className="py-1">Doctor</th><th>Phone</th><th>Specialisation</th><th>Reg. no.</th><th>Hospitals</th><th>Status</th><th>Registered</th></tr></thead>
              <tbody>{ds.map((d) => <tr key={d.id} onClick={() => setSel(d.id)} className="cursor-pointer border-t border-line/60 hover:bg-surface-2"><td className="py-1.5 font-medium">{d.fullName}</td><td className="mono">{d.phone}</td><td>{d.specialisation}</td><td className="mono">{d.councilRegNo}</td><td className="text-muted">{d.hospitals.map((h) => h.name).join(', ')}</td><td><Badge value={d.status} /></td><td className="text-muted">{dt(d.createdAt)}</td></tr>)}</tbody>
            </table>
          )}
        </Loadable>
      </Card>
      {sel && (
        <Modal open onClose={() => setSel(null)} title="Doctor verification" wide>
          <Loadable q={detail}>
            {(d) => (
              <div className="grid gap-4 md:grid-cols-2">
                <dl className="grid grid-cols-[130px_1fr] gap-y-1.5 text-[13px]">
                  <dt className="text-muted">Name</dt><dd className="font-semibold">{d.fullName}</dd>
                  <dt className="text-muted">Phone / email</dt><dd>{d.phone} · {d.email}</dd>
                  <dt className="text-muted">Specialisation</dt><dd>{d.specialisation}</dd>
                  <dt className="text-muted">Council</dt><dd>{d.stateCouncil}</dd>
                  <dt className="text-muted">Reg. no.</dt><dd className="mono">{d.councilRegNo}</dd>
                  <dt className="text-muted">Hospitals</dt><dd>{d.hospitals.map((h) => h.name).join(', ')}</dd>
                  <dt className="text-muted">Status</dt><dd><Badge value={d.status} /> {d.rejectReason}</dd>
                  {d.reviewedBy && <><dt className="text-muted">Reviewed</dt><dd>{d.reviewedBy.name} · {dt(d.reviewedAt)}</dd></>}
                </dl>
                <div>
                  <div className="mb-1 text-[12px] text-muted">Registration certificate (signed link, expires in 10 min)</div>
                  {d.certificate ? (d.certificate.url.includes('.pdf') ? <a href={d.certificate.url} target="_blank" rel="noreferrer" className="text-accent underline">Open PDF</a> : <img src={d.certificate.url} alt="certificate" className="max-h-80 rounded-lg border border-line" />) : <div className="rounded-lg border border-dashed border-line p-6 text-center text-muted">No certificate uploaded (seed doctor)</div>}
                </div>
                {err && <div className="text-bad md:col-span-2">{err}</div>}
                <div className="flex justify-end gap-2 md:col-span-2">
                  {d.status !== 'REJECTED' && <Button variant="danger" onClick={() => review('reject')}>Reject</Button>}
                  {d.status !== 'APPROVED' && <Button variant="primary" onClick={() => review('approve')}>Approve</Button>}
                </div>
              </div>
            )}
          </Loadable>
        </Modal>
      )}
    </div>
  );
}
