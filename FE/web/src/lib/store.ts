"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface SessionUser {
  id: string; name: string; phone: string; role: string; hospitalId: string | null;
  doctor: { id: string; status: "PENDING" | "APPROVED" | "REJECTED"; fullName: string; rejectReason?: string | null } | null;
}

interface SessionState {
  accessToken: string | null;
  refreshToken: string | null;
  registrationToken: string | null;
  user: SessionUser | null;
  setSession: (a: string, r: string, u: SessionUser) => void;
  setTokens: (a: string, r: string) => void;
  setUser: (u: SessionUser) => void;
  setRegistration: (t: string | null) => void;
  logout: () => void;
}

const safeStorage = createJSONStorage(() => {
  try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); return localStorage; }
  catch { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; }
});

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      accessToken: null, refreshToken: null, registrationToken: null, user: null,
      setSession: (accessToken, refreshToken, user) => set({ accessToken, refreshToken, user, registrationToken: null }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setUser: (user) => set({ user }),
      setRegistration: (registrationToken) => set({ registrationToken }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null, registrationToken: null }),
    }),
    { name: "od_web_session", storage: safeStorage },
  ),
);

export const isApproved = (u: SessionUser | null) => !!u && (u.role === "HOSPITAL_PURCHASE" ? !!u.hospitalId : u.doctor?.status === "APPROVED");

/** Checkout draft survives page reloads. */
export interface CheckoutDraft {
  priority: "EMERGENCY" | "SCHEDULED";
  hospitalId: string;
  patient: { name: string; age: string; gender: string; uhid: string; procedure: string; side: string; notes: string };
  surgeryAt: string;
  deliveryAddress: string; deliveryLat: number | null; deliveryLng: number | null; deliveryContactName: string; deliveryContactPhone: string;
  treatingDoctorName: string; treatingDoctorPhone: string;
  paymentMode: "HOSPITAL_CREDIT" | "PAY_ON_DELIVERY" | "UPI_TEST";
  idempotencyKey: string;
}
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const blank = (): CheckoutDraft => ({
  priority: "SCHEDULED", hospitalId: "", patient: { name: "", age: "", gender: "", uhid: "", procedure: "", side: "", notes: "" },
  surgeryAt: "", deliveryAddress: "", deliveryLat: null, deliveryLng: null, deliveryContactName: "", deliveryContactPhone: "",
  treatingDoctorName: "", treatingDoctorPhone: "", paymentMode: "HOSPITAL_CREDIT", idempotencyKey: newKey(),
});

export const useCheckout = create<{ draft: CheckoutDraft; update: (p: Partial<CheckoutDraft>) => void; reset: () => void }>()(
  persist(
    (set) => ({
      draft: blank(),
      update: (p) => set((s) => ({ draft: { ...s.draft, ...p } })),
      reset: () => set({ draft: blank() }),
    }),
    { name: "od_checkout", storage: safeStorage },
  ),
);
