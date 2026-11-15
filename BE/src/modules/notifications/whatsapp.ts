import { env } from '../../config/env';

/** Template param rules (AGENTS.md): single line, no tabs, max 4 consecutive spaces. */
export const sanitizeParam = (v: unknown) =>
  String(v ?? '-')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim() || '-';

export const OWNER_TEMPLATE_BODY =
  'Ortho Diamond new order {{1}}, priority {{2}}\nDoctor: {{3}} | Phone: {{4}}\nHospital: {{5}}\nPatient: {{6}}\nSurgery: {{7}}\nItems: {{8}}\nDeliver to: {{9}}\nMap: {{10}}\nOpen: {{11}}\nPlease accept the order in the admin panel.';

export const renderTemplate = (body: string, params: string[]) =>
  body.replace(/\{\{(\d+)\}\}/g, (_m, i) => params[Number(i) - 1] ?? '');

/** Join item labels with " ; " and cut so the rendered body stays under the limit. */
export function joinItems(items: string[], otherParams: string[], limit = 1024) {
  const fixedLen = renderTemplate(OWNER_TEMPLATE_BODY, [...otherParams.slice(0, 7), '', ...otherParams.slice(7)]).length;
  const budget = limit - fixedLen - 20;
  let out = '';
  for (let i = 0; i < items.length; i++) {
    const next = out ? `${out} ; ${items[i]}` : items[i]!;
    if (next.length > budget) return `${out} ... +${items.length - i} more`;
    out = next;
  }
  return out;
}

export interface WhatsAppResult {
  ok: boolean;
  error?: string;
  id?: string;
}

export const whatsappConfigured = () => !!(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);

/** Meta WhatsApp Cloud API template message. */
export async function sendWhatsAppTemplate(to: string, template: string, params: string[]): Promise<WhatsAppResult> {
  if (!whatsappConfigured()) return { ok: false, error: 'WhatsApp Cloud API not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)' };
  const res = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/^\+/, ''),
      type: 'template',
      template: { name: template, language: { code: 'en' }, components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok) return { ok: false, error: body.error?.message ?? `HTTP ${res.status}` };
  return { ok: true, id: body.messages?.[0]?.id };
}
