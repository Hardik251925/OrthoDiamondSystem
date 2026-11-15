// Where the API lives and where the site is mounted.
// Local (gateway :8100): both empty -> same origin.
// GitHub Pages: NEXT_PUBLIC_BASE_PATH=/OrthoDiamondSystem, NEXT_PUBLIC_API_BASE=https://<public backend>.
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Backend-served files (/uploads/...) need the API host; absolute URLs pass through. */
export const asset = (url?: string | null) => (!url ? "" : /^https?:\/\//.test(url) ? url : `${API_BASE}${url}`);

/** Files in FE/web/public need the basePath when the site is served from a sub-folder. */
export const publicFile = (path: string) => `${BASE_PATH}${path}`;
