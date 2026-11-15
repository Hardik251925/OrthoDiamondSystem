"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Header";
import { Btn, Field, input } from "@/components/ui";
import { ApiError, api, fieldErrors, type LoginResult } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { isApproved, useSession } from "@/lib/store";

export default function Login() {
  const { t } = useI18n();
  const router = useRouter();
  const { setSession, setRegistration } = useSession();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true); setErr(null);
    try { const r = await api<{ devOtp?: string }>("/auth/otp/request", { method: "POST", json: { phone } }); setDevOtp(r.data.devOtp ?? null); setStep("otp"); }
    catch (e) { setErr(fieldErrors(e).phone ?? (e instanceof Error ? e.message : "Error")); } finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setErr(null);
    try {
      const r = (await api<LoginResult>("/auth/otp/verify", { method: "POST", json: { phone, code } })).data;
      if (r.isNewUser) { setRegistration(r.registrationToken!); router.push(`/register?phone=${encodeURIComponent(phone)}`); return; }
      const u = r.user!;
      if (!["DOCTOR", "HOSPITAL_PURCHASE"].includes(u.role)) { setErr("Use the Admin Panel (/admin) or the agent app for this account."); return; }
      setSession(r.accessToken!, r.refreshToken!, u);
      router.push(isApproved(u) ? "/home" : "/pending");
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Error"); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto mt-6 max-w-md rounded-3xl border border-line bg-white p-7 shadow-xl shadow-navy/5">
      <div className="mb-6 flex items-center gap-3"><Logo size={42} /><div><div className="text-lg font-extrabold text-navy">{t("login")}</div><div className="text-xs text-muted">OTP on your registered mobile</div></div></div>
      {step === "phone" ? (
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="space-y-4">
          <Field label="Mobile number" error={err ?? undefined}><input autoFocus inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98xxxxxxxx" className={input} /></Field>
          <Btn className="w-full" disabled={busy || phone.replace(/\D/g, "").length < 10}>Send OTP</Btn>
          <div className="rounded-xl bg-cyan-soft p-3 text-xs text-navy">Demo logins: Dr Verma <b>9000000011</b> · Dr Joshi <b>9000000012</b> (approved) · Dr Choudhary <b>9000000013</b> (pending) · City Hospital purchase <b>9000000031</b>. Any new number → registration.</div>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void verify(); }} className="space-y-4">
          <Field label={`OTP sent to ${phone}`} error={err ?? undefined}><input autoFocus inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={`${input} text-center text-xl tracking-[.6em]`} /></Field>
          {devOtp && <button type="button" onClick={() => setCode(devOtp)} className="w-full rounded-xl border border-dashed border-cyan p-2 text-xs text-navy">Dev mode OTP: <b className="text-base">{devOtp}</b> (tap to fill)</button>}
          <Btn className="w-full" disabled={busy || code.length !== 6}>Verify</Btn>
          <button type="button" onClick={() => { setStep("phone"); setCode(""); }} className="w-full text-xs text-muted">← Change number</button>
        </form>
      )}
      <p className="mt-6 text-center text-xs text-muted">New doctor? <Link href="/register" className="font-semibold text-cyan">{t("register")}</Link></p>
    </div>
  );
}
