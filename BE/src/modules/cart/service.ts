import { badRequest, notFound } from '../../lib/errors';
import { kitAvailable } from '../../lib/kits';
import { prisma } from '../../lib/prisma';
import { availability, variantLabel } from '../../lib/stock';

const LOAN_KIT = { hsn: '9973', gst: 18 }; // rental of instrument sets = service
const SALE_KIT = { hsn: '9021', gst: 5 };

async function cartFor(userId: string) {
  return prisma.cart.upsert({ where: { userId }, update: {}, create: { userId } });
}

export const cartService = {
  async get(userId: string) {
    const cart = await cartFor(userId);
    const items = await prisma.cartItem.findMany({
      where: { cartId: cart.id },
      orderBy: { createdAt: 'asc' },
      include: {
        variant: { include: { product: { select: { name: true, slug: true, hsnCode: true, gstPercent: true, images: true } }, material: { select: { code: true } } } },
        kit: true,
      },
    });
    const stock = await availability(items.filter((i) => i.variantId).map((i) => i.variantId!));
    let subtotal = 0;
    let gst = 0;
    const lines = [];
    for (const i of items) {
      if (i.variant) {
        const s = stock.get(i.variant.id)!;
        const line = i.variant.pricePaise * i.qty;
        subtotal += line;
        gst += Math.round((line * i.variant.product.gstPercent) / 100);
        lines.push({
          id: i.id, type: 'VARIANT' as const, variantId: i.variant.id, sku: i.variant.sku, qty: i.qty,
          label: variantLabel(i.variant.product.name, i.variant.attributes, i.variant.material?.code),
          productSlug: i.variant.product.slug, unitPricePaise: i.variant.pricePaise, lineTotalPaise: line,
          gstPercent: i.variant.product.gstPercent, available: s.available, stockStatus: s.status, ok: s.available >= i.qty,
        });
      } else if (i.kit) {
        const price = i.kit.type === 'LOAN' ? i.kit.rentalChargePaise : i.kit.salePricePaise;
        const g = i.kit.type === 'LOAN' ? LOAN_KIT.gst : SALE_KIT.gst;
        const line = price * i.qty;
        subtotal += line;
        gst += Math.round((line * g) / 100);
        const avail = await kitAvailable(i.kit, new Date());
        lines.push({
          id: i.id, type: 'KIT' as const, kitId: i.kit.id, kitType: i.kit.type, qty: i.qty,
          label: `${i.kit.name} (${i.kit.type})`, unitPricePaise: price, lineTotalPaise: line, gstPercent: g,
          available: avail, stockStatus: avail > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK', ok: avail >= i.qty,
        });
      }
    }
    return { id: cart.id, items: lines, subtotalPaise: subtotal, gstPaise: gst, totalPaise: subtotal + gst, count: lines.reduce((a, l) => a + l.qty, 0) };
  },

  async add(userId: string, input: { variantId?: string; kitId?: string; qty: number }) {
    if (!!input.variantId === !!input.kitId) throw badRequest('VALIDATION_ERROR', 'Give either variantId or kitId');
    const cart = await cartFor(userId);
    if (input.variantId) {
      const v = await prisma.productVariant.findFirst({ where: { id: input.variantId, isActive: true } });
      if (!v) throw notFound('Product size');
      const avail = (await availability([v.id])).get(v.id)!;
      const existing = await prisma.cartItem.findFirst({ where: { cartId: cart.id, variantId: v.id } });
      const qty = (existing?.qty ?? 0) + input.qty;
      if (avail.available <= 0) throw badRequest('OUT_OF_STOCK', `${v.sku} is out of stock`);
      if (qty > avail.available) throw badRequest('INSUFFICIENT_STOCK', `Only ${avail.available} available for ${v.sku}`);
      if (existing) await prisma.cartItem.update({ where: { id: existing.id }, data: { qty } });
      else await prisma.cartItem.create({ data: { cartId: cart.id, variantId: v.id, qty } });
    } else {
      const k = await prisma.operationKit.findFirst({ where: { id: input.kitId, isActive: true } });
      if (!k) throw notFound('Kit');
      const existing = await prisma.cartItem.findFirst({ where: { cartId: cart.id, kitId: k.id } });
      if (existing) await prisma.cartItem.update({ where: { id: existing.id }, data: { qty: existing.qty + input.qty } });
      else await prisma.cartItem.create({ data: { cartId: cart.id, kitId: k.id, qty: input.qty } });
    }
    return this.get(userId);
  },

  async setQty(userId: string, itemId: string, qty: number) {
    const cart = await cartFor(userId);
    const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) throw notFound('Cart item');
    if (qty <= 0) await prisma.cartItem.delete({ where: { id: itemId } });
    else await prisma.cartItem.update({ where: { id: itemId }, data: { qty } });
    return this.get(userId);
  },

  async clear(userId: string) {
    const cart = await cartFor(userId);
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.get(userId);
  },

  /** Procedure template -> prefilled cart (template items; loan instrument kit if the template names one). */
  async fromTemplate(userId: string, templateId: string) {
    const t = await prisma.procedureTemplate.findFirst({ where: { id: templateId, isActive: true }, include: { items: true, kit: true } });
    if (!t) throw notFound('Procedure template');
    const cart = await cartFor(userId);
    for (const i of t.items) {
      const existing = await prisma.cartItem.findFirst({ where: { cartId: cart.id, variantId: i.variantId } });
      if (existing) await prisma.cartItem.update({ where: { id: existing.id }, data: { qty: existing.qty + i.qty } });
      else await prisma.cartItem.create({ data: { cartId: cart.id, variantId: i.variantId, qty: i.qty } });
    }
    if (t.kit?.type === 'LOAN' && !(await prisma.cartItem.findFirst({ where: { cartId: cart.id, kitId: t.kit.id } }))) {
      await prisma.cartItem.create({ data: { cartId: cart.id, kitId: t.kit.id, qty: 1 } });
    }
    return this.get(userId);
  },
};

export const KIT_TAX = { LOAN: LOAN_KIT, SALE: SALE_KIT };
