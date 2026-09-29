import * as THREE from 'three';
import type { Order, OrderLayer } from './Order';
import type { BunId } from '../food/Ingredients';
import type { BurgerStack } from '../food/BurgerStack';
import type { Customer } from './Customer';

export interface ReadyBurger {
  order: Order;
  stack: BurgerStack;
  tray: THREE.Group;
  slot: number;
}

/** All tickets for the current day and the finished burgers waiting at pickup. */
export class OrderBook {
  readonly orders: Order[] = [];
  readonly customers = new Map<number, Customer>();
  readonly ready: ReadyBurger[] = [];
  activeBuildId: number | null = null;
  private nextId = 1;
  private nextTicket = 1;
  onChange?: () => void;

  create(c: Customer, bun: BunId, layers: OrderLayer[], now: number): Order {
    const o: Order = {
      id: this.nextId++,
      ticket: this.nextTicket++,
      customerId: c.def.id,
      customerName: c.def.name,
      bun,
      layers,
      arrivedAt: c.arrivedAt,
      orderedAt: now,
      status: 'waiting',
    };
    this.orders.push(o);
    this.customers.set(o.id, c);
    c.order = o;
    if (this.activeBuildId === null) this.activeBuildId = o.id;
    this.onChange?.();
    return o;
  }

  get(id: number | null): Order | null {
    if (id === null) return null;
    return this.orders.find((o) => o.id === id) ?? null;
  }

  customerOf(o: Order): Customer | undefined {
    return this.customers.get(o.id);
  }

  get activeBuild(): Order | null {
    return this.get(this.activeBuildId);
  }

  /** Orders still needing a burger, oldest first. */
  get open(): Order[] {
    return this.orders.filter((o) => o.status === 'waiting' || o.status === 'building');
  }

  get visible(): Order[] {
    return this.orders.filter((o) => o.status !== 'served');
  }

  selectForBuild(id: number) {
    const o = this.get(id);
    if (!o || (o.status !== 'waiting' && o.status !== 'building')) return;
    this.activeBuildId = id;
    this.onChange?.();
  }

  /** Pick the next open ticket after one is finished. */
  advanceBuild() {
    const next = this.open.find((o) => o.status === 'waiting' || o.status === 'building');
    this.activeBuildId = next ? next.id : null;
    this.onChange?.();
  }

  markReady(o: Order, r: ReadyBurger) {
    o.status = 'ready';
    this.ready.push(r);
    if (this.activeBuildId === o.id) this.advanceBuild();
    this.onChange?.();
  }

  takeReady(orderId: number): ReadyBurger | null {
    const i = this.ready.findIndex((r) => r.order.id === orderId);
    if (i < 0) return null;
    const r = this.ready.splice(i, 1)[0];
    this.onChange?.();
    return r;
  }

  markServed(o: Order) {
    o.status = 'served';
    this.onChange?.();
  }

  /** Summary of patties still to be cooked for open tickets (for grill hints). */
  pattyNeeds(): { kind: string; doneness: string; ticket: number }[] {
    const out: { kind: string; doneness: string; ticket: number }[] = [];
    for (const o of this.open) for (const l of o.layers) if (l.doneness) out.push({ kind: l.id, doneness: l.doneness, ticket: o.ticket });
    return out;
  }

  freePickupSlot(max = 4): number {
    for (let i = 0; i < max; i++) if (!this.ready.some((r) => r.slot === i)) return i;
    return -1;
  }

  clear() {
    for (const r of this.ready) {
      r.stack.dispose();
      r.tray.removeFromParent();
    }
    this.ready.length = 0;
    this.orders.length = 0;
    this.customers.clear();
    this.activeBuildId = null;
    this.nextTicket = 1;
  }
}
