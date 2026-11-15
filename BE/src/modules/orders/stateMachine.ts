import type { OrderStatus, Role } from '@prisma/client';

/** SPEC §4 state machine. */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PACKED', 'CANCELLED'],
  PACKED: ['DISPATCHED'],
  DISPATCHED: ['REACHED_HOSPITAL'],
  REACHED_HOSPITAL: ['DELIVERED_TO_OT'],
  DELIVERED_TO_OT: ['CLOSED', 'KIT_RETURN_PENDING'],
  KIT_RETURN_PENDING: ['KIT_RETURNED'],
  KIT_RETURNED: ['CLOSED'],
  REJECTED: [],
  CANCELLED: [],
  CLOSED: [],
};

export type Actor = { userId: string; role: Role; isOwner: boolean; isAssignedAgent: boolean } | 'SYSTEM';

const isAdmin = (a: Actor) => a !== 'SYSTEM' && (a.role === 'SUPER_ADMIN' || a.role === 'STAFF');

/** Who may perform which move. */
export function actorMay(actor: Actor, to: OrderStatus): boolean {
  if (actor === 'SYSTEM') return true;
  switch (to) {
    case 'ACCEPTED':
    case 'REJECTED':
    case 'PACKED':
    case 'CLOSED':
    case 'KIT_RETURN_PENDING':
      return isAdmin(actor);
    case 'DISPATCHED':
    case 'REACHED_HOSPITAL':
    case 'DELIVERED_TO_OT':
    case 'KIT_RETURNED':
      return isAdmin(actor) || actor.isAssignedAgent;
    case 'CANCELLED':
      return isAdmin(actor) || actor.isOwner;
    default:
      return false;
  }
}

export function canTransition(from: OrderStatus, to: OrderStatus) {
  return TRANSITIONS[from].includes(to);
}

export const ACTIVE_DELIVERY: OrderStatus[] = ['DISPATCHED', 'REACHED_HOSPITAL'];
export const OPEN_STATUSES: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PACKED', 'DISPATCHED', 'REACHED_HOSPITAL', 'DELIVERED_TO_OT', 'KIT_RETURN_PENDING', 'KIT_RETURNED'];
