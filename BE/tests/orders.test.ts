import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { OrderStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { availability } from '../src/lib/stock';
import { loanKitAvailable } from '../src/lib/kits';
import { TRANSITIONS, actorMay, canTransition } from '../src/modules/orders/stateMachine';
import { api, bearer, createHospital, createUser, login, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function catalogue() {
  const cat = await prisma.category.create({ data: { name: 'Screws', slug: 'screws' } });
  const product = await prisma.product.create({ data: { name: '3.5mm Locking Screw', slug: 'ls35', categoryId: cat.id, hsnCode: '9021', gstPercent: 5, isSterile: true } });
  const mk = (sku: string, len: number) => prisma.productVariant.create({ data: { sku, productId: product.id, attributes: { diameterMm: 3.5, lengthMm: len }, pricePaise: 50000, mrpPaise: 60000 } });
  return { product, v20: await mk('LS-20', 20), v22: await mk('LS-22', 22), v24: await mk('LS-24', 24) };
}

async function setup() {
  const hospital = await createHospital();
  const doctor = await createUser('DOCTOR');
  await prisma.doctorHospital.create({ data: { doctorId: doctor.doctor!.id, hospitalId: hospital.id } });
  const owner = await createUser('SUPER_ADMIN');
  const agentUser = await createUser('DELIVERY_AGENT');
  const agent = await prisma.deliveryAgent.findUniqueOrThrow({ where: { userId: agentUser.id } });
  const c = await catalogue();
  return { hospital, doctor, owner, agentUser, agent, ...c, td: await login(doctor.phone), to: await login(owner.phone), ta: await login(agentUser.phone) };
}

const orderBody = (hospitalId: string) => ({
  hospitalId,
  patient: { name: 'Test Patient', procedure: 'ORIF' },
  surgeryAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
  priority: 'SCHEDULED',
  paymentMode: 'HOSPITAL_CREDIT',
});

describe('state machine (pure)', () => {
  const all = Object.keys(TRANSITIONS) as OrderStatus[];
  it('allows exactly the SPEC §4 moves', () => {
    const allowed = all.flatMap((f) => all.filter((t) => canTransition(f, t)).map((t) => `${f}>${t}`));
    expect(allowed.sort()).toEqual(
      ['PLACED>ACCEPTED', 'PLACED>REJECTED', 'PLACED>CANCELLED', 'ACCEPTED>PACKED', 'ACCEPTED>CANCELLED', 'PACKED>DISPATCHED', 'DISPATCHED>REACHED_HOSPITAL', 'REACHED_HOSPITAL>DELIVERED_TO_OT', 'DELIVERED_TO_OT>CLOSED', 'DELIVERED_TO_OT>KIT_RETURN_PENDING', 'KIT_RETURN_PENDING>KIT_RETURNED', 'KIT_RETURNED>CLOSED'].sort(),
    );
  });
  it('forbids every other move (e.g. cancel after PACKED, reopen terminal states)', () => {
    for (const f of all) for (const t of all) if (!TRANSITIONS[f].includes(t)) expect(canTransition(f, t), `${f}>${t}`).toBe(false);
    expect(canTransition('PACKED', 'CANCELLED')).toBe(false);
    expect(canTransition('CLOSED', 'PLACED')).toBe(false);
  });
  it('role rules', () => {
    const doc = { userId: 'u', role: 'DOCTOR' as const, isOwner: true, isAssignedAgent: false };
    const agent = { userId: 'a', role: 'DELIVERY_AGENT' as const, isOwner: false, isAssignedAgent: true };
    const otherAgent = { ...agent, isAssignedAgent: false };
    const staff = { userId: 's', role: 'STAFF' as const, isOwner: false, isAssignedAgent: false };
    expect(actorMay(doc, 'ACCEPTED')).toBe(false);
    expect(actorMay(doc, 'CANCELLED')).toBe(true);
    expect(actorMay({ ...doc, isOwner: false }, 'CANCELLED')).toBe(false);
    expect(actorMay(agent, 'DISPATCHED')).toBe(true);
    expect(actorMay(otherAgent, 'DISPATCHED')).toBe(false);
    expect(actorMay(agent, 'ACCEPTED')).toBe(false);
    expect(actorMay(staff, 'ACCEPTED')).toBe(true);
  });
});

describe('checkout & lifecycle (API)', () => {
  it('full lifecycle with reserve -> deduct FEFO, history and stock', async () => {
    const s = await setup();
    await prisma.stockBatch.createMany({ data: [
      { variantId: s.v20.id, lotNo: 'LATE', qty: 10, expiryDate: new Date(Date.now() + 400 * 86400_000) },
      { variantId: s.v20.id, lotNo: 'EARLY', qty: 3, expiryDate: new Date(Date.now() + 30 * 86400_000) },
      { variantId: s.v20.id, lotNo: 'EXPIRED', qty: 50, expiryDate: new Date(Date.now() - 86400_000) },
    ] });
    expect((await availability([s.v20.id])).get(s.v20.id)!.available).toBe(13); // expired batch excluded

    await api().post('/api/cart/items').set(bearer(s.td.accessToken!)).send({ variantId: s.v20.id, qty: 5 });
    const r = await api().post('/api/orders').set(bearer(s.td.accessToken!)).set('Idempotency-Key', 'k-life-1').send(orderBody(s.hospital.id));
    expect(r.status).toBe(201);
    const id = r.body.data.id;
    expect(r.body.data.orderNo).toMatch(/^OD-\d{6}-\d{4}$/);
    expect((await availability([s.v20.id])).get(s.v20.id)!.reserved).toBe(5);

    const move = (to: string, tok = s.to.accessToken!, reason?: string) => api().post(`/api/orders/${id}/transition`).set(bearer(tok)).send({ to, reason });
    expect((await move('ACCEPTED', s.td.accessToken!)).status).toBe(403); // doctor can't accept
    expect((await move('DISPATCHED')).status).toBe(409); // skip states
    expect((await move('ACCEPTED')).status).toBe(200);
    expect((await move('PACKED')).status).toBe(200);
    expect((await move('DISPATCHED')).body.error.code).toBe('NO_AGENT');
    await api().post(`/api/orders/${id}/assign`).set(bearer(s.to.accessToken!)).send({ agentId: s.agent.id });
    expect((await move('DISPATCHED', s.ta.accessToken!)).status).toBe(200); // assigned agent dispatches

    // FEFO: EARLY (3) consumed first, then 2 from LATE; reservation released
    const batches = await prisma.stockBatch.findMany({ where: { variantId: s.v20.id } });
    expect(batches.find((b) => b.lotNo === 'EARLY')!.qty).toBe(0);
    expect(batches.find((b) => b.lotNo === 'LATE')!.qty).toBe(8);
    expect(batches.find((b) => b.lotNo === 'EXPIRED')!.qty).toBe(50);
    expect((await availability([s.v20.id])).get(s.v20.id)!.reserved).toBe(0);

    expect((await move('REACHED_HOSPITAL', s.ta.accessToken!)).status).toBe(200);
    expect((await move('CANCELLED', s.td.accessToken!, 'too late')).status).toBe(409);
    const pdf = await api().get(`/api/orders/${id}/invoice`).set(bearer(s.td.accessToken!)).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    const hist = await prisma.orderStatusHistory.findMany({ where: { orderId: id }, orderBy: { at: 'asc' } });
    expect(hist.map((h) => h.to)).toEqual(['PLACED', 'ACCEPTED', 'PACKED', 'DISPATCHED', 'REACHED_HOSPITAL']);
  });

  it('cancel by doctor before PACKED releases the reservation', async () => {
    const s = await setup();
    await prisma.stockBatch.create({ data: { variantId: s.v22.id, lotNo: 'A', qty: 4 } });
    await api().post('/api/cart/items').set(bearer(s.td.accessToken!)).send({ variantId: s.v22.id, qty: 4 });
    const r = await api().post('/api/orders').set(bearer(s.td.accessToken!)).set('Idempotency-Key', 'k-cancel').send(orderBody(s.hospital.id));
    expect((await availability([s.v22.id])).get(s.v22.id)!.available).toBe(0);
    const c = await api().post(`/api/orders/${r.body.data.id}/cancel`).set(bearer(s.td.accessToken!)).send({ reason: 'postponed' });
    expect(c.body.data.status).toBe('CANCELLED');
    expect((await availability([s.v22.id])).get(s.v22.id)!.available).toBe(4);
  });

  it('double submit with the same idempotency key creates one order', async () => {
    const s = await setup();
    await prisma.stockBatch.create({ data: { variantId: s.v20.id, lotNo: 'A', qty: 10 } });
    await api().post('/api/cart/items').set(bearer(s.td.accessToken!)).send({ variantId: s.v20.id, qty: 1 });
    const [a, b] = await Promise.all([0, 1].map(() => api().post('/api/orders').set(bearer(s.td.accessToken!)).set('Idempotency-Key', 'same-key-123').send(orderBody(s.hospital.id))));
    expect(a!.body.data.id).toBe(b!.body.data.id);
    expect(await prisma.order.count()).toBe(1);
  });

  it('concurrent checkout for the last unit: only one succeeds, with alternatives offered', async () => {
    const s = await setup();
    const doc2 = await createUser('DOCTOR');
    await prisma.doctorHospital.create({ data: { doctorId: doc2.doctor!.id, hospitalId: s.hospital.id } });
    const t2 = await login(doc2.phone);
    await prisma.stockBatch.createMany({ data: [{ variantId: s.v20.id, lotNo: 'LAST', qty: 1 }, { variantId: s.v22.id, lotNo: 'ALT', qty: 5 }] });
    for (const t of [s.td, t2]) await api().post('/api/cart/items').set(bearer(t.accessToken!)).send({ variantId: s.v20.id, qty: 1 });
    const res = await Promise.all([s.td, t2].map((t, i) => api().post('/api/orders').set(bearer(t.accessToken!)).set('Idempotency-Key', `race-${i}`).send(orderBody(s.hospital.id))));
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
    const loser = res.find((r) => r.status === 409)!;
    expect(loser.body.error.code).toBe('OUT_OF_STOCK');
    expect(loser.body.error.details.lines[0].alternatives[0].sku).toBe('LS-22');
    expect((await availability([s.v20.id])).get(s.v20.id)!.available).toBe(0);
  });

  it('pending doctor cannot order; out-of-stock size cannot be added', async () => {
    const s = await setup();
    const pending = await login((await createUser('DOCTOR', { doctorStatus: 'PENDING' })).phone);
    expect((await api().get('/api/cart').set(bearer(pending.accessToken!))).status).toBe(403);
    const add = await api().post('/api/cart/items').set(bearer(s.td.accessToken!)).send({ variantId: s.v24.id, qty: 1 });
    expect(add.body.error.code).toBe('OUT_OF_STOCK');
  });

  it('public catalogue hides prices; approved doctor sees them', async () => {
    const s = await setup();
    const pub = await api().get(`/api/catalog/products/${s.product.slug}`);
    expect(pub.body.data.variants[0].pricePaise).toBeNull();
    expect(pub.body.data.variants[0].stockStatus).toBe('OUT_OF_STOCK');
    const priv = await api().get(`/api/catalog/products/${s.product.slug}`).set(bearer(s.td.accessToken!));
    expect(priv.body.data.variants[0].pricePaise).toBe(50000);
  });
});

describe('loan kit availability', () => {
  it('physicalSets minus overlapping open bookings', async () => {
    const s = await setup();
    const kit = await prisma.operationKit.create({ data: { name: 'Small Fragment Set', slug: 'sfs', type: 'LOAN', physicalSets: 2, rentalChargePaise: 350000 } });
    const day = new Date(Date.now() + 2 * 86400_000);
    const mkOrder = async (surgeryAt: Date, n: number) => prisma.order.create({ data: { orderNo: `OD-T-${n}`, placedById: s.doctor.id, treatingDoctorName: 'x', treatingDoctorPhone: 'x', hospitalId: s.hospital.id, patient: {}, surgeryAt, priority: 'SCHEDULED', deliveryAddress: 'x', deliveryLat: 0, deliveryLng: 0, deliveryContactName: 'x', deliveryContactPhone: 'x', subtotalPaise: 0, gstPaise: 0, totalPaise: 0, paymentMode: 'HOSPITAL_CREDIT', idempotencyKey: `kit-${n}`, kitBookings: { create: { kitId: kit.id, surgeryAt, expectedReturnAt: new Date(surgeryAt.getTime() + 3 * 86400_000) } } } });
    expect(await loanKitAvailable(kit.id, day)).toBe(2);
    await mkOrder(day, 1);
    expect(await loanKitAvailable(kit.id, day)).toBe(1);
    const o2 = await mkOrder(new Date(day.getTime() + 86400_000), 2); // overlaps (3-day loan)
    expect(await loanKitAvailable(kit.id, day)).toBe(0);
    expect(await loanKitAvailable(kit.id, new Date(day.getTime() + 10 * 86400_000))).toBe(2); // free later
    await prisma.order.update({ where: { id: o2.id }, data: { status: 'CANCELLED' } });
    expect(await loanKitAvailable(kit.id, day)).toBe(1); // cancelled booking no longer counts
  });
});
