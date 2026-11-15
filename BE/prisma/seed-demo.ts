/**
 * Realistic demo activity (seed only): 30 days of order history, today's orders in every
 * status, 2 deliveries on the road (moved by DEMO_SIMULATOR), a loan kit awaiting return,
 * notifications log, a doctor cart, banners and category illustrations.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { OrderStatus, PrismaClient, Prisma } from '@prisma/client';

let s = 777;
const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
const int = (a: number, b: number) => Math.floor(rnd() * (b - a + 1)) + a;
const MIN = 60_000;

const PATIENTS = ['Ramesh Patel', 'Sunita Sharma', 'Mohd. Irfan', 'Kavya Jain', 'Suresh Yadav', 'Anita Verma', 'Deepak Malviya', 'Pooja Rathore', 'Harish Choudhary', 'Meena Solanki', 'Arjun Thakur', 'Rekha Dubey', 'Vikas Agrawal', 'Shabana Khan', 'Manoj Patidar', 'Lalita Bai', 'Gopal Sen', 'Nisha Tiwari', 'Rahul Goyal', 'Kamla Devi'];
const PROCEDURES = [
  ['Distal Radius ORIF', 'R'], ['Bimalleolar Ankle ORIF', 'L'], ['Tibial Shaft IM Nailing', 'R'], ['Intertrochanteric Fracture PFN', 'L'],
  ['Patella Tension Band Wiring', 'R'], ['Clavicle ORIF', 'L'], ['Proximal Humerus ORIF', 'R'], ['Femur Shaft IM Nailing', 'L'], ['Distal Femur ORIF', 'R'],
] as const;

const SVG_ICONS: Record<string, string> = {
  screw: '<rect x="150" y="70" width="100" height="40" rx="8"/><path d="M175 110 L175 300 L200 340 L225 300 L225 110"/><path d="M175 140 L225 160 M175 170 L225 190 M175 200 L225 220 M175 230 L225 250 M175 260 L225 280"/>',
  plate: '<rect x="110" y="60" width="180" height="300" rx="40"/><circle cx="200" cy="105" r="16"/><circle cx="200" cy="165" r="16"/><circle cx="200" cy="225" r="16"/><circle cx="200" cy="285" r="16"/><circle cx="200" cy="330" r="10"/>',
  nail: '<path d="M185 50 L215 50 L222 330 Q200 370 178 330 Z"/><circle cx="200" cy="90" r="7"/><circle cx="200" cy="300" r="7"/><circle cx="200" cy="270" r="7"/>',
  wire: '<path d="M120 330 L280 70"/><path d="M140 340 L300 80"/><path d="M100 320 L260 60"/>',
  fixator: '<rect x="70" y="120" width="260" height="22" rx="10"/><rect x="70" y="260" width="260" height="22" rx="10"/><path d="M120 100 L120 300 M200 100 L200 300 M280 100 L280 300"/>',
  instrument: '<rect x="170" y="40" width="60" height="150" rx="20"/><path d="M200 190 L200 360"/><path d="M190 340 L200 365 L210 340"/>',
  joint: '<circle cx="200" cy="110" r="60"/><path d="M200 170 L215 360 L185 360 Z"/>',
  spine: '<rect x="160" y="50" width="80" height="50" rx="12"/><rect x="160" y="120" width="80" height="50" rx="12"/><rect x="160" y="190" width="80" height="50" rx="12"/><rect x="160" y="260" width="80" height="50" rx="12"/><path d="M200 40 L200 330"/>',
  consumable: '<rect x="130" y="90" width="140" height="240" rx="18"/><rect x="160" y="60" width="80" height="35" rx="8"/><path d="M160 200 L240 200 M200 160 L200 240"/>',
  kit: '<rect x="70" y="110" width="260" height="200" rx="18"/><path d="M110 160 L290 160 M110 210 L290 210 M110 260 L290 260"/><rect x="160" y="80" width="80" height="35" rx="8"/>',
};

function writeAssets(uploadRoot: string) {
  const dir = path.join(uploadRoot, 'public', 'catalog');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(SVG_ICONS)) {
    fs.writeFileSync(
      path.join(dir, `${name}.svg`),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EAF6FA"/><stop offset="1" stop-color="#D3EEF6"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><g fill="none" stroke="#0B2545" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`,
    );
  }
  const bdir = path.join(uploadRoot, 'public', 'banners');
  fs.mkdirSync(bdir, { recursive: true });
  const banner = (title: string, sub: string, c1: string, c2: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 360"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="1200" height="360" fill="url(#b)"/><g fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="2"><path d="M900 0 L1200 180 L900 360 L600 180 Z"/><path d="M980 60 L1140 180 L980 300 L820 180 Z"/></g><text x="70" y="160" font-family="Arial" font-size="56" font-weight="700" fill="#fff">${title}</text><text x="70" y="220" font-family="Arial" font-size="28" fill="#DDF7FC">${sub}</text></svg>`;
  fs.writeFileSync(path.join(bdir, 'emergency.svg'), banner('24x7 Emergency OT Supply', 'Implants & loan kits delivered to your OT across Indore', '#0B2545', '#13C4E3'));
  const pdir = path.join(uploadRoot, 'private', 'proofs');
  fs.mkdirSync(pdir, { recursive: true });
  fs.writeFileSync(
    path.join(pdir, 'demo-signature.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 140"><rect width="400" height="140" fill="#fff"/><path d="M30 100 C70 20 90 130 130 70 S190 40 210 90 S280 30 300 80 S350 100 370 60" fill="none" stroke="#0B2545" stroke-width="4"/></svg>',
  );
  fs.writeFileSync(path.join(bdir, 'titanium.svg'), banner('Titanium Locking Range', 'Distal radius, proximal tibia and humerus plates in stock', '#123A63', '#0E7C99'));
}

const CAT_ICON: Record<string, string> = {
  screws: 'screw', plates: 'plate', 'intramedullary-nails': 'nail', 'k-wires-pins': 'wire', 'external-fixators': 'fixator',
  'drivers-instruments': 'instrument', arthroplasty: 'joint', spine: 'spine', consumables: 'consumable', 'operation-kits': 'kit',
};

export async function seedDemo(prisma: PrismaClient, uploadRoot: string) {
  writeAssets(uploadRoot);
  for (const [slug, icon] of Object.entries(CAT_ICON)) {
    const cat = await prisma.category.findUnique({ where: { slug } });
    if (!cat) continue;
    await prisma.category.update({ where: { id: cat.id }, data: { image: `/uploads/public/catalog/${icon}.svg` } });
    await prisma.product.updateMany({ where: { categoryId: cat.id }, data: { images: [`/uploads/public/catalog/${icon}.svg`] } });
  }
  await prisma.operationKit.updateMany({ data: { trayPhotos: ['/uploads/public/catalog/kit.svg'] } });
  await prisma.banner.createMany({
    data: [
      { title: '24x7 Emergency OT Supply', imageUrl: '/uploads/public/banners/emergency.svg', sortOrder: 1 },
      { title: 'Titanium Locking Range', imageUrl: '/uploads/public/banners/titanium.svg', linkUrl: '/category?slug=plates', sortOrder: 2 },
    ],
  });

  const doctors = await prisma.doctor.findMany({ where: { status: 'APPROVED' }, include: { user: true, hospitals: { include: { hospital: true } } } });
  const agents = await prisma.deliveryAgent.findMany({ include: { user: true } });
  const owner = await prisma.user.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
  const staff = await prisma.user.findFirstOrThrow({ where: { role: 'STAFF' } });
  const buyer = await prisma.user.findFirstOrThrow({ where: { role: 'HOSPITAL_PURCHASE' }, include: { hospital: true } });
  const variants = await prisma.productVariant.findMany({
    where: { product: { category: { slug: { in: ['screws', 'plates', 'intramedullary-nails', 'k-wires-pins'] } } }, batches: { some: { qty: { gt: 5 } } } },
    include: { product: true, material: true },
  });
  const loanKit = await prisma.operationKit.findFirstOrThrow({ where: { slug: 'small-fragment-set' } });

  const label = (v: (typeof variants)[number]) => {
    const a = v.attributes as Record<string, unknown>;
    return [v.product.name, a.lengthMm ? `${a.lengthMm}mm` : '', a.holes ? `${a.holes} hole` : '', a.side ? (a.side === 'L' ? 'Left' : 'Right') : '', v.material?.code === 'TI' ? 'Ti' : 'SS'].filter(Boolean).join(' ');
  };

  const seq = new Map<string, number>();
  const orderNo = (d: Date) => {
    const ist = new Date(d.getTime() + 5.5 * 3600_000);
    const p = `OD-${String(ist.getUTCFullYear()).slice(2)}${String(ist.getUTCMonth() + 1).padStart(2, '0')}${String(ist.getUTCDate()).padStart(2, '0')}-`;
    const n = (seq.get(p) ?? 0) + 1;
    seq.set(p, n);
    return `${p}${String(n).padStart(4, '0')}`;
  };

  const flow: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PACKED', 'DISPATCHED', 'REACHED_HOSPITAL', 'DELIVERED_TO_OT', 'CLOSED'];

  async function makeOrder(o: { createdAt: Date; status: OrderStatus; priority?: 'EMERGENCY' | 'SCHEDULED'; agent?: (typeof agents)[number]; loanKit?: boolean; reserve?: boolean; byBuyer?: boolean; stepMinutes?: number[] }) {
    const doc = pick(doctors);
    const hosp = o.byBuyer ? buyer.hospital! : pick(doc.hospitals).hospital;
    const [procedure, side] = pick([...PROCEDURES]);
    const lines = Array.from({ length: int(2, 5) }, () => pick(variants));
    const uniq = [...new Map(lines.map((l) => [l.id, l])).values()];
    const items = uniq.map((v) => {
      const qty = v.product.name.includes('Screw') || v.product.name.includes('K-Wire') ? int(2, 8) : 1;
      return { variantId: v.id, description: label(v), sku: v.sku, hsnCode: v.product.hsnCode, qty, unitPricePaise: v.pricePaise, gstPercent: v.product.gstPercent, lineTotalPaise: v.pricePaise * qty };
    });
    if (o.loanKit) items.push({ variantId: null as never, description: `${loanKit.name} (LOAN)`, sku: null as never, hsnCode: '9973', qty: 1, unitPricePaise: loanKit.rentalChargePaise, gstPercent: 18, lineTotalPaise: loanKit.rentalChargePaise });
    const subtotal = items.reduce((a, i) => a + i.lineTotalPaise, 0);
    const gst = items.reduce((a, i) => a + Math.round((i.lineTotalPaise * i.gstPercent) / 100), 0);
    const priority = o.priority ?? (rnd() < 0.3 ? 'EMERGENCY' : 'SCHEDULED');
    const surgeryAt = new Date(o.createdAt.getTime() + (priority === 'EMERGENCY' ? int(2, 4) : int(12, 40)) * 3600_000);

    // status history timestamps
    const end = o.status === 'CANCELLED' || o.status === 'REJECTED' ? 1 : flow.indexOf(o.status) + (o.status === 'KIT_RETURN_PENDING' ? 6 : 0);
    const path: OrderStatus[] = o.status === 'CANCELLED' || o.status === 'REJECTED' ? ['PLACED', o.status] : o.status === 'KIT_RETURN_PENDING' ? [...flow.slice(0, 6), 'KIT_RETURN_PENDING'] : flow.slice(0, end + 1);
    const steps = o.stepMinutes ?? [0, 6, 25, 40, 70, 80, 600];
    const history: Prisma.OrderStatusHistoryCreateWithoutOrderInput[] = path.map((to, i) => ({
      from: i === 0 ? null : path[i - 1]!,
      to,
      at: new Date(o.createdAt.getTime() + (steps[i] ?? steps[steps.length - 1]! + i) * MIN),
      reason: to === 'REJECTED' ? 'Requested size not available in titanium' : to === 'CANCELLED' ? 'Surgery postponed by hospital' : to === 'DELIVERED_TO_OT' ? 'Received by OT sister' : to === 'KIT_RETURN_PENDING' ? 'Loan kit to be collected' : null,
      actor: { connect: { id: to === 'PLACED' ? (o.byBuyer ? buyer.id : doc.userId) : ['DISPATCHED', 'REACHED_HOSPITAL', 'DELIVERED_TO_OT'].includes(to) && o.agent ? o.agent.userId : pick([owner.id, staff.id]) } },
    }));

    const created = await prisma.order.create({
      data: {
        orderNo: orderNo(o.createdAt),
        placedById: o.byBuyer ? buyer.id : doc.userId,
        doctorId: doc.id,
        treatingDoctorName: doc.fullName,
        treatingDoctorPhone: doc.user.phone,
        hospitalId: hosp.id,
        patient: { name: pick(PATIENTS), age: int(18, 82), gender: pick(['M', 'F']), uhid: `UH${int(100000, 999999)}`, procedure, side },
        surgeryAt,
        priority,
        deliveryAddress: hosp.address,
        deliveryLat: hosp.lat,
        deliveryLng: hosp.lng,
        deliveryContactName: hosp.otContactName,
        deliveryContactPhone: hosp.otContactPhone,
        subtotalPaise: subtotal,
        gstPaise: gst,
        totalPaise: subtotal + gst,
        paymentMode: pick(['HOSPITAL_CREDIT', 'HOSPITAL_CREDIT', 'PAY_ON_DELIVERY']),
        assignedAgentId: o.agent?.id ?? (flow.indexOf(o.status) >= 3 || o.status === 'KIT_RETURN_PENDING' ? pick(agents).id : null),
        status: o.status,
        rejectReason: o.status === 'REJECTED' ? 'Requested size not available in titanium' : null,
        idempotencyKey: `seed-${o.createdAt.getTime()}-${int(1000, 9999)}`,
        createdAt: o.createdAt,
        items: { create: items.map((i) => ({ ...i, variantId: i.variantId ?? undefined, kitId: i.variantId ? undefined : loanKit.id })) },
        statusHistory: { create: history },
        ...(o.loanKit ? { kitBookings: { create: { kitId: loanKit.id, surgeryAt, dispatchedAt: new Date(o.createdAt.getTime() + 40 * MIN), expectedReturnAt: new Date(surgeryAt.getTime() + 3 * 86400_000) } } } : {}),
        ...(['DELIVERED_TO_OT', 'CLOSED', 'KIT_RETURN_PENDING'].includes(o.status) ? { proof: { create: { receiverName: hosp.otContactName, signatureUrl: 'proofs/demo-signature.svg', at: new Date(o.createdAt.getTime() + 80 * MIN) } } } : {}),
      },
    });
    if (o.reserve) for (const i of items) if (i.variantId) await prisma.productVariant.update({ where: { id: i.variantId }, data: { reservedQty: { increment: i.qty } } });
    return created;
  }

  // ── 30 days of history ──
  for (let d = 30; d >= 1; d--) {
    const n = int(1, 3);
    for (let k = 0; k < n; k++) {
      const at = new Date(Date.now() - d * 86400_000 + int(8, 20) * 3600_000 - 12 * 3600_000);
      const r = rnd();
      await makeOrder({ createdAt: at, status: r < 0.07 ? 'CANCELLED' : r < 0.11 ? 'REJECTED' : 'CLOSED', byBuyer: rnd() < 0.15 });
    }
  }

  // ── today (live board) ──
  const ago = (m: number) => new Date(Date.now() - m * MIN);
  const [a1, a2] = agents as [(typeof agents)[0], (typeof agents)[0]];
  const live = [
    await makeOrder({ createdAt: ago(4), status: 'PLACED', priority: 'EMERGENCY', reserve: true }),
    await makeOrder({ createdAt: ago(18), status: 'PLACED', priority: 'SCHEDULED', reserve: true, byBuyer: true }),
    await makeOrder({ createdAt: ago(55), status: 'ACCEPTED', priority: 'SCHEDULED', reserve: true, stepMinutes: [0, 8] }),
    await makeOrder({ createdAt: ago(80), status: 'PACKED', priority: 'SCHEDULED', reserve: true, agent: a2, stepMinutes: [0, 7, 30] }),
    await makeOrder({ createdAt: ago(38), status: 'DISPATCHED', priority: 'EMERGENCY', agent: a1, stepMinutes: [0, 4, 20, 34] }),
    await makeOrder({ createdAt: ago(150), status: 'KIT_RETURN_PENDING', priority: 'SCHEDULED', loanKit: true, stepMinutes: [0, 10, 30, 45, 75, 90, 91] }),
    await makeOrder({ createdAt: ago(240), status: 'CLOSED', priority: 'SCHEDULED' }),
  ];
  // second delivery on the road, started 7 minutes ago (PACKED order above belongs to agent 2; give agent 2 a trip too)
  live.push(await makeOrder({ createdAt: ago(60), status: 'DISPATCHED', priority: 'SCHEDULED', agent: a2, stepMinutes: [0, 9, 35, 53] }));
  await prisma.deliveryAgent.updateMany({ data: { isOnDuty: true } });

  // ── notification log for today's orders ──
  const contact = await prisma.ownerContact.findFirst();
  for (const o of live) {
    await prisma.notification.createMany({
      data: [
        { channel: 'WHATSAPP', recipient: contact?.whatsappNumber, template: 'od_new_order', title: 'New order (WhatsApp)', body: `Ortho Diamond new order ${o.orderNo}, priority [${o.priority}]`, status: 'FAILED', error: 'WhatsApp Cloud API not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)', attempts: 1, createdAt: o.createdAt },
        { channel: 'CONSOLE', recipient: contact?.whatsappNumber, title: 'New order (SMS fallback)', body: `Ortho Diamond new order ${o.orderNo}`, status: 'SENT', attempts: 1, sentAt: o.createdAt, createdAt: o.createdAt },
        { channel: 'IN_APP', title: o.priority === 'EMERGENCY' ? `EMERGENCY order ${o.orderNo}` : `New order ${o.orderNo}`, body: `${o.treatingDoctorName}`, payload: { orderId: o.id, priority: o.priority }, status: 'SENT', sentAt: o.createdAt, createdAt: o.createdAt, readAt: o.status === 'PLACED' ? null : new Date() },
      ],
    });
  }

  // ── Dr Verma has something in the cart ──
  const verma = doctors.find((d) => d.fullName.includes('Verma'))!;
  const cartVariants = variants.filter((v) => v.sku.startsWith('LS35-35-L2') && v.sku.endsWith('-TI')).slice(0, 2);
  await prisma.cart.create({ data: { userId: verma.userId, items: { create: cartVariants.map((v) => ({ variantId: v.id, qty: 4 })) } } });

  return { historyAndToday: await prisma.order.count(), today: live.length };
}
