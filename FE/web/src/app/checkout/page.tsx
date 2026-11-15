"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useHydrated } from "@/components/Header";
import { MapView } from "@/components/MapView";
import { Btn, Card, Field, Loadable, cx, input } from "@/components/ui";
import { ApiError, api, fieldErrors, get, post } from "@/lib/api";
import { rupees } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useCheckout, useSession } from "@/lib/store";
import type { Cart } from "../cart/page";

interface Hospital { id: string; name: string; address: string; lat: number; lng: number; otContactName: string; otContactPhone: string }
interface Short { lineId: string; label: string; requested: number; available: number; alternatives: { variantId: string; sku: string; label: string; available: number; pricePaise: number }[] }
const STEPS = ["Patient", "Surgery & priority", "Delivery", "Payment", "Review"];

export default function Checkout() {
  const { t } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const hydrated = useHydrated();
  const user = useSession((s) => s.user);
  const { draft: d, update, reset } = useCheckout();
  const [step, setStep] = useState(0);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [short, setShort] = useState<Short[] | null>(null);
  const [busy, setBusy] = useState(false);
  const cart = useQuery({ queryKey: ["cart"], queryFn: () => get<Cart>("/cart") });
  const hospitals = useQuery({ queryKey: ["hospitals"], queryFn: () => get<Hospital[]>("/hospitals") });
  const isBuyer = user?.role === "HOSPITAL_PURCHASE";

  const pickHospital = useCallback(
    (h: Hospital) => update({ hospitalId: h.id, deliveryAddress: h.address, deliveryLat: h.lat, deliveryLng: h.lng, deliveryContactName: h.otContactName, deliveryContactPhone: h.otContactPhone }),
    [update],
  );
  // Defaults written to the persisted checkout store (an external store, not React state)
  useEffect(() => {
    const hs = hospitals.data;
    if (hs?.length && !d.hospitalId) pickHospital(hs[0]!);
  }, [hospitals.data, d.hospitalId, pickHospital]);
  useEffect(() => {
    if (!d.surgeryAt) {
      const s = new Date(Date.now() + (d.priority === "EMERGENCY" ? 2 : 20) * 3600_000);
      s.setMinutes(0, 0, 0);
      update({ surgeryAt: toLocal(s) });
    }
  }, [d.surgeryAt, d.priority, update]);
  const p = d.patient;
  const setP = (k: keyof typeof p, v: string) => update({ patient: { ...p, [k]: v } });

  const validate = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 0) { if (p.name.trim().length < 2) e["patient.name"] = "Patient name is required"; if (p.procedure.trim().length < 2) e["patient.procedure"] = "Procedure is required"; if (p.age && (Number(p.age) < 0 || Number(p.age) > 120)) e["patient.age"] = "Invalid age"; }
    if (s === 1) { if (!d.hospitalId) e.hospitalId = "Select hospital"; if (!d.surgeryAt) e.surgeryAt = "Required"; if (isBuyer && !d.treatingDoctorName) e.treatingDoctorName = "Treating doctor is required"; if (isBuyer && !/^[6-9]\d{9}$/.test(d.treatingDoctorPhone.replace(/\D/g, "").slice(-10))) e.treatingDoctorPhone = "Valid mobile required"; }
    if (s === 2) { if (!d.deliveryLat) e.deliveryAddress = "Drop a pin on the map"; }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const place = async () => {
    setBusy(true); setErr(null); setShort(null);
    try {
      const body = {
        hospitalId: d.hospitalId,
        patient: { name: p.name, procedure: p.procedure, ...(p.age ? { age: Number(p.age) } : {}), ...(p.gender ? { gender: p.gender } : {}), ...(p.uhid ? { uhid: p.uhid } : {}), ...(p.side ? { side: p.side } : {}), ...(p.notes ? { notes: p.notes } : {}) },
        surgeryAt: new Date(d.surgeryAt).toISOString(), priority: d.priority, paymentMode: d.paymentMode,
        deliveryAddress: d.deliveryAddress, deliveryLat: d.deliveryLat ?? undefined, deliveryLng: d.deliveryLng ?? undefined,
        deliveryContactName: d.deliveryContactName || undefined, deliveryContactPhone: d.deliveryContactPhone || undefined,
        ...(isBuyer ? { treatingDoctorName: d.treatingDoctorName, treatingDoctorPhone: d.treatingDoctorPhone } : {}),
      };
      const order = await post<{ id: string }>("/orders", body, { "Idempotency-Key": d.idempotencyKey });
      reset();
      qc.invalidateQueries({ queryKey: ["cart"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      router.push(`/order?id=${order.id}&placed=1`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "OUT_OF_STOCK") setShort((e.details as { lines: Short[] }).lines);
      else { setErrs(fieldErrors(e)); setErr(e instanceof Error ? e.message : "Failed"); }
    } finally { setBusy(false); }
  };
  const replace = async (line: Short, variantId: string) => {
    await api(`/cart/items/${line.lineId}`, { method: "DELETE" });
    await post("/cart/items", { variantId, qty: Math.min(line.requested, 99) }).catch(() => undefined);
    setShort((s) => s?.filter((x) => x.lineId !== line.lineId) ?? null);
    qc.invalidateQueries({ queryKey: ["cart"] });
  };

  if (!hydrated) return null;
  if (cart.data && cart.data.items.length === 0 && !busy) return <Card className="text-center">Cart is empty. <Link href="/templates" className="font-semibold text-cyan">Pick a procedure template</Link></Card>;
  const em = d.priority === "EMERGENCY";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-extrabold text-navy">{t("checkout")}</h1>{em && <span className="rounded-full bg-coral px-3 py-1 text-xs font-bold text-white">🚨 EMERGENCY</span>}</div>
      <ol className="flex gap-1">{STEPS.map((s, i) => <li key={s} className="flex-1"><button onClick={() => i < step && setStep(i)} className={cx("w-full rounded-full py-1 text-[11px] font-bold", i === step ? (em ? "bg-coral text-white" : "bg-navy text-white") : i < step ? "bg-cyan-soft text-navy" : "bg-white text-muted")}>{i + 1}. {s}</button></li>)}</ol>

      <Card>
        {step === 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Patient name *" error={errs["patient.name"]}><input value={p.name} onChange={(e) => setP("name", e.target.value)} className={input} /></Field>
            <Field label="Procedure *" error={errs["patient.procedure"]}><input value={p.procedure} onChange={(e) => setP("procedure", e.target.value)} className={input} placeholder="Distal Radius ORIF" /></Field>
            <Field label="Age" error={errs["patient.age"]}><input inputMode="numeric" value={p.age} onChange={(e) => setP("age", e.target.value.replace(/\D/g, ""))} className={input} /></Field>
            <Field label="Gender"><select value={p.gender} onChange={(e) => setP("gender", e.target.value)} className={input}><option value="">—</option><option value="M">Male</option><option value="F">Female</option><option value="O">Other</option></select></Field>
            <Field label="UHID / IP no."><input value={p.uhid} onChange={(e) => setP("uhid", e.target.value)} className={input} /></Field>
            <Field label="Side"><select value={p.side} onChange={(e) => setP("side", e.target.value)} className={input}><option value="">—</option><option value="L">Left</option><option value="R">Right</option><option value="B">Bilateral</option><option value="NA">N/A</option></select></Field>
            <div className="sm:col-span-2"><Field label="Notes for Ortho Diamond"><textarea value={p.notes} onChange={(e) => setP("notes", e.target.value)} rows={2} className={input} placeholder="e.g. need drill bits sterile, OT 3, 2nd floor" /></Field></div>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {(["EMERGENCY", "SCHEDULED"] as const).map((pr) => <button key={pr} onClick={() => update({ priority: pr })} className={cx("rounded-2xl border-2 p-4 text-left", d.priority === pr ? (pr === "EMERGENCY" ? "border-coral bg-coral/5" : "border-navy bg-cyan-soft") : "border-line")}><div className={cx("font-extrabold", pr === "EMERGENCY" ? "text-coral" : "text-navy")}>{pr === "EMERGENCY" ? "🚨 Emergency" : "🗓 Scheduled"}</div><div className="text-xs text-muted">{pr === "EMERGENCY" ? "Patient in OT / within hours. Owner alerted instantly." : "Planned surgery."}</div></button>)}
            </div>
            <Field label="Hospital *" error={errs.hospitalId}>
              <Loadable q={hospitals} rows={1} h="h-10">{(hs) => <select value={d.hospitalId} onChange={(e) => { const h = hs.find((x) => x.id === e.target.value); if (h) pickHospital(h); }} className={input}>{hs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>}</Loadable>
            </Field>
            <Field label="Surgery date & time *" error={errs.surgeryAt}><input type="datetime-local" value={d.surgeryAt} onChange={(e) => update({ surgeryAt: e.target.value })} className={input} /></Field>
            {isBuyer && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Treating doctor *" error={errs.treatingDoctorName}><input value={d.treatingDoctorName} onChange={(e) => update({ treatingDoctorName: e.target.value })} className={input} placeholder="Dr. …" /></Field>
                <Field label="Doctor's mobile *" error={errs.treatingDoctorPhone}><input value={d.treatingDoctorPhone} onChange={(e) => update({ treatingDoctorPhone: e.target.value })} className={input} /></Field>
              </div>
            )}
          </div>
        )}
        {step === 2 && <DeliveryStep errs={errs} />}
        {step === 3 && (
          <div className="space-y-2">
            {([["HOSPITAL_CREDIT", "Hospital credit", "Billed to the hospital account (credit terms)"], ["PAY_ON_DELIVERY", "Pay on delivery", "Cash / cheque / UPI to the delivery agent"], ["UPI_TEST", "UPI (test mode)", "Razorpay test keys are not configured on this server — payment is simulated"]] as const).map(([v, l, s]) => (
              <label key={v} className={cx("flex cursor-pointer gap-3 rounded-2xl border-2 p-4", d.paymentMode === v ? "border-navy bg-cyan-soft" : "border-line")}><input type="radio" checked={d.paymentMode === v} onChange={() => update({ paymentMode: v })} /><span><b className="text-navy">{l}</b><br /><span className="text-xs text-muted">{s}</span></span></label>
            ))}
          </div>
        )}
        {step === 4 && (
          <Loadable q={cart} rows={3}>
            {(c) => (
              <div className="space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl bg-paper p-3"><div className="text-xs text-muted">Patient</div><b>{p.name}</b> {p.age && `· ${p.age}y`} {p.gender} <div>{p.procedure} {p.side && `(${p.side})`}</div></div>
                  <div className="rounded-xl bg-paper p-3"><div className="text-xs text-muted">Surgery</div><b>{new Date(d.surgeryAt).toLocaleString("en-IN")}</b><div className={em ? "font-bold text-coral" : ""}>{d.priority}</div></div>
                  <div className="rounded-xl bg-paper p-3 sm:col-span-2"><div className="text-xs text-muted">Deliver to</div>{d.deliveryAddress}<div className="text-xs text-muted">OT contact: {d.deliveryContactName} {d.deliveryContactPhone}</div></div>
                </div>
                <table className="w-full"><tbody>{c.items.map((i) => <tr key={i.id} className="border-t border-line"><td className="py-1.5">{i.label}</td><td className="text-right">×{i.qty}</td><td className="w-24 text-right">{rupees(i.lineTotalPaise)}</td></tr>)}</tbody></table>
                <div className="flex justify-between border-t border-line pt-2"><span className="text-muted">GST</span><span>{rupees(c.gstPaise)}</span></div>
                <div className="flex justify-between text-lg font-extrabold text-navy"><span>Total · {d.paymentMode.replace(/_/g, " ").toLowerCase()}</span><span>{rupees(c.totalPaise)}</span></div>
              </div>
            )}
          </Loadable>
        )}
      </Card>

      {short && (
        <Card className="border-bad">
          <h2 className="font-extrabold text-bad">Some items just went out of stock</h2>
          {short.map((s) => (
            <div key={s.lineId} className="mt-3 border-t border-line pt-3 text-sm">
              <b>{s.label}</b> — wanted {s.requested}, available {s.available}
              <div className="mt-2 flex flex-wrap gap-2">
                {s.alternatives.map((a) => <button key={a.variantId} onClick={() => replace(s, a.variantId)} className="rounded-xl border border-cyan bg-cyan-soft px-3 py-1.5 text-xs font-semibold">Use {a.label} ({a.available} in stock, {rupees(a.pricePaise)})</button>)}
                <button onClick={async () => { await api(`/cart/items/${s.lineId}`, { method: "DELETE" }); setShort((x) => x?.filter((y) => y.lineId !== s.lineId) ?? null); qc.invalidateQueries({ queryKey: ["cart"] }); }} className="rounded-xl border border-line px-3 py-1.5 text-xs">Remove</button>
              </div>
            </div>
          ))}
        </Card>
      )}
      {err && <div className="rounded-xl bg-bad/5 p-3 text-sm text-bad">{err}</div>}

      <div className="flex justify-between">
        <Btn variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>{t("back")}</Btn>
        {step < 4 ? <Btn variant={em ? "emergency" : "primary"} onClick={() => validate(step) && setStep(step + 1)}>{t("next")} →</Btn> : <Btn variant={em ? "emergency" : "primary"} disabled={busy || !!short?.length} onClick={place}>{busy ? "Placing…" : `${t("placeOrder")} · ${rupees(cart.data?.totalPaise)}`}</Btn>}
      </div>
    </div>
  );
}

function toLocal(d: Date) {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

/** Leaflet pin picker + Nominatim search (debounced, max 1 request / second per Nominatim policy). */
function DeliveryStep({ errs }: { errs: Record<string, string> }) {
  const { draft: d, update } = useCheckout();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ display_name: string; lat: string; lon: string }[]>([]);
  const last = useRef(0);
  const searching = q.trim().length >= 3;
  useEffect(() => {
    if (!searching) return;
    const wait = Math.max(800, 1000 - (Date.now() - last.current));
    const id = setTimeout(async () => {
      last.current = Date.now();
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=in&viewbox=75.7,22.85,76.0,22.6&q=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" } });
        setResults(await r.json());
      } catch { setResults([]); }
    }, wait);
    return () => clearTimeout(id);
  }, [q, searching]);
  const shown = searching ? results : [];
  const markers = useMemo(() => (d.deliveryLat && d.deliveryLng ? [{ id: "pin", lat: d.deliveryLat, lng: d.deliveryLng, kind: "pin" as const }] : []), [d.deliveryLat, d.deliveryLng]);
  return (
    <div className="space-y-3">
      <div className="relative">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a different address (OpenStreetMap)…" className={input} />
        {shown.length > 0 && (
          <div className="absolute z-[600] mt-1 w-full rounded-xl border border-line bg-white shadow-xl">
            {shown.map((r) => <button key={r.lat + r.lon} onClick={() => { update({ deliveryLat: Number(r.lat), deliveryLng: Number(r.lon), deliveryAddress: r.display_name }); setResults([]); setQ(""); }} className="block w-full px-3 py-2 text-left text-xs hover:bg-cyan-soft">{r.display_name}</button>)}
          </div>
        )}
      </div>
      <MapView markers={markers} height={300} onPick={(pt) => update({ deliveryLat: pt.lat, deliveryLng: pt.lng })} fitKey={`${d.deliveryLat?.toFixed(4)},${d.deliveryLng?.toFixed(4)}`} />
      <p className="text-xs text-muted">Tap the map to move the pin to the exact OT entrance.</p>
      <Field label="Delivery address" error={errs.deliveryAddress}><textarea rows={2} value={d.deliveryAddress} onChange={(e) => update({ deliveryAddress: e.target.value })} className={input} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="OT contact name"><input value={d.deliveryContactName} onChange={(e) => update({ deliveryContactName: e.target.value })} className={input} /></Field>
        <Field label="OT contact phone" error={errs.deliveryContactPhone}><input value={d.deliveryContactPhone} onChange={(e) => update({ deliveryContactPhone: e.target.value })} className={input} /></Field>
      </div>
    </div>
  );
}
