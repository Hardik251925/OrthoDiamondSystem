export const rupees = (paise?: number | null) =>
  paise == null ? '—' : `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: paise % 100 ? 2 : 0 })}`;

export const dt = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '—';

export const ago = (d: string | Date) => {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

export const statusLabel = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export const attrText = (a: Record<string, unknown> | null | undefined) => {
  if (!a) return '';
  return [a.diameterMm && `Ø${a.diameterMm}`, a.lengthMm && `${a.lengthMm}mm`, a.holes && `${a.holes}H`, a.side, a.angle && `${a.angle}°`].filter(Boolean).join(' · ');
};

/** Short beep for new orders (no audio file needed). */
export function beep(emergency = false) {
  try {
    const ctx = new AudioContext();
    const tones = emergency ? [880, 660, 880, 660] : [660, 880];
    tones.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.16);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.17);
    });
  } catch { /* autoplay blocked */ }
}
