"use client";
// API client for the doctor app: envelope unwrapping, bearer tokens, silent refresh-token rotation.
import { API_BASE } from "./config";
import { useSession, type SessionUser } from "./store";

const H = { "ngrok-skip-browser-warning": "true" };

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  const s = useSession.getState();
  if (!s.refreshToken) return false;
  refreshing ??= fetch(`${API_BASE}/api/auth/refresh`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: s.refreshToken }) })
    .then(async (r) => {
      if (!r.ok) { s.logout(); return false; }
      const b = await r.json();
      s.setTokens(b.data.accessToken, b.data.refreshToken);
      return true;
    })
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export async function raw(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const s = useSession.getState();
  const headers: Record<string, string> = { ...H, ...(init.headers as Record<string, string>) };
  if (s.accessToken) headers.Authorization = `Bearer ${s.accessToken}`;
  if (init.body && !(init.body instanceof FormData)) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "OFFLINE", "The Ortho Diamond ordering server is not reachable right now. Please try again in a little while.");
  }
  if (res.status === 401 && retry && s.refreshToken && (await refresh())) return raw(path, init, false);
  return res;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const { json, ...rest } = init;
  const res = await raw(`/api${path}`, { ...rest, body: json !== undefined ? JSON.stringify(json) : rest.body });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) throw new ApiError(res.status, body.error?.code ?? "ERROR", body.error?.message ?? `HTTP ${res.status}`, body.error?.details);
  return { data: body.data as T, meta: body.meta };
}
export const get = async <T,>(p: string) => (await api<T>(p)).data;
export const post = async <T,>(p: string, json?: unknown, headers?: Record<string, string>) => (await api<T>(p, { method: "POST", json: json ?? {}, headers })).data;

export async function openPdf(path: string) {
  const w = window.open("", "_blank");
  const res = await raw(`/api${path}`);
  const url = URL.createObjectURL(await res.blob());
  if (w) w.location.href = url; else window.location.href = url;
}

export interface LoginResult { isNewUser: boolean; registrationToken?: string; accessToken?: string; refreshToken?: string; user?: SessionUser }

/** Field errors from a VALIDATION_ERROR response. */
export const fieldErrors = (e: unknown): Record<string, string> =>
  e instanceof ApiError && Array.isArray(e.details) ? Object.fromEntries((e.details as { field: string; message: string }[]).map((d) => [d.field, d.message])) : {};
