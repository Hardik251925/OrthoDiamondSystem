// API client: envelope unwrapping, bearer tokens, silent refresh-token rotation.
const KEY = 'od_admin_session';
const H = { 'ngrok-skip-browser-warning': 'true' };

export interface Session { accessToken: string; refreshToken: string; user: { id: string; name: string; role: string; phone: string } }

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

export const session = {
  get(): Session | null {
    try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
  },
  set(s: Session | null) {
    try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* private mode */ }
    window.dispatchEvent(new Event('od-session'));
  },
};

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  const s = session.get();
  if (!s) return false;
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }) })
    .then(async (r) => {
      if (!r.ok) { session.set(null); return false; }
      const body = await r.json();
      session.set({ ...s, accessToken: body.data.accessToken, refreshToken: body.data.refreshToken });
      return true;
    })
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export async function raw(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const s = session.get();
  const headers: Record<string, string> = { ...H, ...(init.headers as Record<string, string>) };
  if (s) headers.Authorization = `Bearer ${s.accessToken}`;
  if (init.body && !(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401 && retry && s && (await refresh())) return raw(path, init, false);
  return res;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const { json, ...rest } = init;
  const res = await raw(`/api${path}`, { ...rest, body: json !== undefined ? JSON.stringify(json) : rest.body });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) throw new ApiError(res.status, body.error?.code ?? 'ERROR', body.error?.message ?? `HTTP ${res.status}`, body.error?.details);
  return { data: body.data as T, meta: body.meta };
}

export const get = async <T,>(path: string) => (await api<T>(path)).data;
export const post = async <T,>(path: string, json?: unknown) => (await api<T>(path, { method: 'POST', json: json ?? {} })).data;

/** Open an authenticated PDF in a new tab. */
export async function openPdf(path: string) {
  const w = window.open('', '_blank');
  const res = await raw(`/api${path}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (w) w.location.href = url; else window.location.href = url;
}

export async function downloadFile(path: string, filename: string) {
  const res = await raw(`/api${path}`);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob());
  a.download = filename;
  a.click();
}
