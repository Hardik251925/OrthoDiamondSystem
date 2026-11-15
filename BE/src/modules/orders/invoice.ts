import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { prisma } from '../../lib/prisma';

const rs = (paise: number) => `Rs. ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ist = (d: Date) => d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

/** Tax invoice (GST breakup by HSN) or delivery challan (no prices). Streamed to the response. */
export async function streamInvoice(orderId: string, kind: 'invoice' | 'challan', res: Response) {
  const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { hospital: true, items: true, kitBookings: { include: { kit: true } } } });
  const biz = ((await prisma.appSetting.findUnique({ where: { key: 'business' } }))?.value ?? {}) as Record<string, string>;
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${o.orderNo}-${kind}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).font('Helvetica-Bold').text(biz.name ?? 'Ortho Diamond', { continued: true }).fontSize(10).font('Helvetica').text(`   ${kind === 'invoice' ? 'TAX INVOICE' : 'DELIVERY CHALLAN'}`, { align: 'right' });
  doc.fontSize(9).text(biz.address ?? 'Indore, Madhya Pradesh').text(`GSTIN: ${biz.gstin || 'to be configured'}   Phone: ${biz.supportPhone ?? ''}`);
  doc.moveDown(0.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.5);

  const top = doc.y;
  doc.font('Helvetica-Bold').text('Bill / Ship to', 40, top).font('Helvetica')
    .text(o.hospital.name).text(o.deliveryAddress, { width: 250 }).text(`GSTIN: ${o.hospital.gstin ?? '-'}`).text(`OT contact: ${o.deliveryContactName} ${o.deliveryContactPhone}`);
  const p = o.patient as Record<string, string>;
  doc.font('Helvetica-Bold').text(`${kind === 'invoice' ? 'Invoice' : 'Challan'} for ${o.orderNo}`, 320, top).font('Helvetica')
    .text(`Date: ${ist(new Date())}`, 320).text(`Doctor: ${o.treatingDoctorName} (${o.treatingDoctorPhone})`, 320)
    .text(`Patient: ${p.name ?? '-'}  UHID: ${p.uhid ?? '-'}`, 320).text(`Surgery: ${ist(o.surgeryAt)}  ${o.priority}`, 320).text(`Payment: ${o.paymentMode.replace(/_/g, ' ')}`, 320);
  doc.moveDown(1.5);

  const cols = kind === 'invoice' ? [40, 70, 280, 330, 365, 420, 470] : [40, 70, 400, 470];
  const header = kind === 'invoice' ? ['#', 'Item', 'HSN', 'Qty', 'Rate', 'GST%', 'Amount'] : ['#', 'Item', 'SKU', 'Qty'];
  let y = Math.max(doc.y, 230);
  doc.font('Helvetica-Bold').fontSize(8.5);
  header.forEach((h, i) => doc.text(h, cols[i]!, y, { width: (cols[i + 1] ?? 555) - cols[i]! - 4 }));
  y += 14;
  doc.moveTo(40, y - 3).lineTo(555, y - 3).stroke();
  doc.font('Helvetica');
  o.items.forEach((it, n) => {
    if (y > 740) { doc.addPage(); y = 50; }
    const row = kind === 'invoice'
      ? [String(n + 1), it.description, it.hsnCode, String(it.qty), rs(it.unitPricePaise), `${it.gstPercent}%`, rs(it.lineTotalPaise)]
      : [String(n + 1), it.description, it.sku ?? '-', String(it.qty)];
    const h = doc.heightOfString(it.description, { width: cols[2]! - cols[1]! - 4 });
    row.forEach((t, i) => doc.text(t, cols[i]!, y, { width: (cols[i + 1] ?? 555) - cols[i]! - 4 }));
    y += Math.max(h, 11) + 3;
  });
  doc.moveTo(40, y).lineTo(555, y).stroke();
  y += 8;

  if (kind === 'invoice') {
    // GST breakup by HSN + rate (intra-state: CGST + SGST)
    const groups = new Map<string, { taxable: number; rate: number }>();
    for (const it of o.items) {
      const key = `${it.hsnCode}@${it.gstPercent}`;
      const g = groups.get(key) ?? { taxable: 0, rate: it.gstPercent };
      g.taxable += it.lineTotalPaise;
      groups.set(key, g);
    }
    doc.font('Helvetica-Bold').text('GST summary', 40, y);
    y += 13;
    doc.font('Helvetica');
    for (const [key, g] of groups) {
      const tax = Math.round((g.taxable * g.rate) / 100);
      doc.text(`HSN ${key.split('@')[0]}  taxable ${rs(g.taxable)}  CGST ${g.rate / 2}% ${rs(Math.round(tax / 2))}  SGST ${g.rate / 2}% ${rs(tax - Math.round(tax / 2))}`, 40, y);
      y += 12;
    }
    y += 6;
    doc.font('Helvetica-Bold').fontSize(10)
      .text(`Subtotal: ${rs(o.subtotalPaise)}`, 340, y, { align: 'right', width: 215 })
      .text(`GST: ${rs(o.gstPaise)}`, 340, y + 14, { align: 'right', width: 215 })
      .fontSize(12).text(`Total: ${rs(o.totalPaise)}`, 340, y + 30, { align: 'right', width: 215 });
  } else {
    if (o.kitBookings.length) {
      doc.font('Helvetica-Bold').text('Loan kits (to be returned):', 40, y);
      o.kitBookings.forEach((b) => { y += 12; doc.font('Helvetica').text(`${b.kit.name} — expected back ${b.expectedReturnAt ? ist(b.expectedReturnAt) : '-'}`, 40, y); });
    }
    doc.text('Received by (name, sign, date): ______________________________', 40, 720);
  }
  doc.fontSize(7.5).font('Helvetica').text('Computer-generated document. Sample business details — configure in Admin > Settings.', 40, 780, { align: 'center', width: 515 });
  doc.end();
}
