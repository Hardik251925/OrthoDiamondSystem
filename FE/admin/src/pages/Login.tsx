import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api, session } from '../lib/api';
import { useT } from '../lib/app-context';
import { Logo } from '../components/Layout';
import { Button, Field, inputCls } from '../components/ui';

export function LoginPage() {
  const t = useT();
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ devOtp?: string }>('/auth/otp/request', { method: 'POST', json: { phone } });
      setDevOtp(r.data.devOtp ?? null);
      setStep('otp');
    } catch (e) { setErr(e instanceof ApiError ? (e.details as { message: string }[] | undefined)?.[0]?.message ?? e.message : 'Network error'); } finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ isNewUser: boolean; accessToken: string; refreshToken: string; user: { id: string; name: string; role: string; phone: string } }>('/auth/otp/verify', { method: 'POST', json: { phone, code } });
      if (r.data.isNewUser || !['SUPER_ADMIN', 'STAFF'].includes(r.data.user.role)) { setErr('This number is not an Ortho Diamond admin/staff account'); return; }
      session.set({ accessToken: r.data.accessToken, refreshToken: r.data.refreshToken, user: r.data.user });
      nav('/');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-full place-items-center p-4" style={{ background: 'radial-gradient(ellipse at top, #13202c 0%, #0e1116 60%)' }}>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={40} />
          <div>
            <div className="text-lg font-extrabold tracking-wide">ORTHO DIAMOND</div>
            <div className="text-[12px] text-accent">{t('brand')}</div>
          </div>
        </div>
        {step === 'phone' ? (
          <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="space-y-4">
            <Field label={t('phone')} error={err ?? undefined}>
              <input autoFocus inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98xxxxxxxx" className={inputCls} />
            </Field>
            <Button variant="primary" className="w-full py-2" disabled={busy || phone.length < 10}>{t('sendOtp')}</Button>
            <p className="text-[12px] text-muted">Demo: owner <span className="mono">9000000001</span> · staff <span className="mono">9000000002</span></p>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void verify(); }} className="space-y-4">
            <Field label={`${t('otp')} → ${phone}`} error={err ?? undefined}>
              <input autoFocus inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={`${inputCls} mono text-center text-lg tracking-[.5em]`} />
            </Field>
            {devOtp && <div className="rounded-lg border border-accent/30 bg-accent/10 p-2 text-[12px]">Dev OTP: <button type="button" className="mono font-bold text-accent" onClick={() => setCode(devOtp)}>{devOtp}</button> (tap to fill)</div>}
            <Button variant="primary" className="w-full py-2" disabled={busy || code.length !== 6}>{t('verify')}</Button>
            <button type="button" className="w-full text-[12px] text-muted" onClick={() => { setStep('phone'); setCode(''); }}>← change number</button>
          </form>
        )}
      </div>
    </div>
  );
}
