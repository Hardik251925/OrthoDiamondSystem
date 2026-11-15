"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Btn, Card, Field, input } from "@/components/ui";
import { ApiError, fieldErrors, get, type LoginResult } from "@/lib/api";
import { API_BASE } from "@/lib/config";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/store";

const COUNCILS = ["Madhya Pradesh Medical Council", "Maharashtra Medical Council", "Rajasthan Medical Council", "Gujarat Medical Council", "Chhattisgarh Medical Council", "Uttar Pradesh Medical Council", "Delhi Medical Council", "National Medical Commission (IMR)"];

export default function Register() {
  const { t } = useI18n();
  const router = useRouter();
  const { registrationToken, setSession } = useSession();
  const hospitals = useQuery({ queryKey: ["hosp-dir"], queryFn: () => get<{ id: string; name: string; address: string }[]>("/hospitals/directory") });
  const [f, setF] = useState({ fullName: "", email: "", specialisation: "Orthopaedic Surgery (MS Ortho)", councilRegNo: "", stateCouncil: COUNCILS[0]!, hospitalIds: [] as string[] });
  const [file, setFile] = useState<File | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!registrationToken) {
    return (
      <Card className="mx-auto mt-6 max-w-md text-center">
        <h1 className="text-lg font-extrabold text-navy">{t("register")}</h1>
        <p className="mt-2 text-sm text-muted">First verify your mobile number with OTP. We will bring you back here.</p>
        <Link href="/login" className="mt-4 inline-block rounded-xl bg-navy px-5 py-2.5 font-semibold text-white">Verify mobile</Link>
      </Card>
    );
  }

  const submit = async () => {
    setBusy(true); setErr(null); setErrs({});
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.append(k, Array.isArray(v) ? JSON.stringify(v) : v));
    if (file) fd.append("certificate", file);
    try {
      const res = await fetch(`${API_BASE}/api/doctors/register`, { method: "POST", body: fd, headers: { Authorization: `Bearer ${registrationToken}`, "ngrok-skip-browser-warning": "true" } });
      const body = await res.json();
      if (!res.ok) throw new ApiError(res.status, body.error?.code, body.error?.message, body.error?.details);
      const d = body.data as Required<LoginResult>;
      setSession(d.accessToken, d.refreshToken, d.user);
      router.push("/pending");
    } catch (e) { setErrs(fieldErrors(e)); setErr(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  };
  const set = (k: keyof typeof f, v: string | string[]) => setF({ ...f, [k]: v });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-extrabold text-navy">{t("register")}</h1>
      <p className="mb-4 text-sm text-muted">Prices and ordering unlock once Ortho Diamond verifies your registration (usually within a few hours).</p>
      <Card>
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name (as on certificate)" error={errs.fullName}><input value={f.fullName} onChange={(e) => set("fullName", e.target.value)} className={input} placeholder="Dr. …" /></Field>
          <Field label="Email" error={errs.email}><input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} className={input} /></Field>
          <Field label="Specialisation" error={errs.specialisation}><input value={f.specialisation} onChange={(e) => set("specialisation", e.target.value)} className={input} /></Field>
          <Field label="State Medical Council" error={errs.stateCouncil}><select value={f.stateCouncil} onChange={(e) => set("stateCouncil", e.target.value)} className={input}>{COUNCILS.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Registration number" error={errs.councilRegNo}><input value={f.councilRegNo} onChange={(e) => set("councilRegNo", e.target.value)} className={input} placeholder="MP-12345" /></Field>
          <Field label="Certificate photo / PDF" error={errs.certificate} hint="JPG, PNG, WEBP or PDF up to 8 MB"><input type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={input} /></Field>
          <div className="sm:col-span-2">
            <Field label="Hospitals where you operate" error={errs.hospitalIds}>
              <div className="grid gap-2 sm:grid-cols-2">
                {(hospitals.data ?? []).map((h) => (
                  <label key={h.id} className={`flex cursor-pointer gap-2 rounded-xl border p-3 text-sm ${f.hospitalIds.includes(h.id) ? "border-cyan bg-cyan-soft" : "border-line"}`}>
                    <input type="checkbox" checked={f.hospitalIds.includes(h.id)} onChange={(e) => set("hospitalIds", e.target.checked ? [...f.hospitalIds, h.id] : f.hospitalIds.filter((x) => x !== h.id))} />
                    <span><b>{h.name}</b><br /><span className="text-xs text-muted">{h.address}</span></span>
                  </label>
                ))}
              </div>
            </Field>
          </div>
          {err && <div className="rounded-xl bg-bad/5 p-3 text-sm text-bad sm:col-span-2">{err}</div>}
          <Btn className="sm:col-span-2" disabled={busy}>Submit for verification</Btn>
        </form>
      </Card>
    </div>
  );
}
