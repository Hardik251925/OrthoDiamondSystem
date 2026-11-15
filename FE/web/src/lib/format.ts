export const rupees = (paise?: number | null) =>
  paise == null ? "" : `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: paise % 100 ? 2 : 0 })}`;

export const dt = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }) : "—";

export const statusLabel = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export const attrText = (a: Record<string, unknown> | null | undefined) =>
  a ? [a.diameterMm && `Ø${a.diameterMm}mm`, a.lengthMm && `${a.lengthMm}mm`, a.holes && `${a.holes} hole`, a.side && (a.side === "L" ? "Left" : "Right"), a.angle && `${a.angle}°`].filter(Boolean).join(" · ") : "";
