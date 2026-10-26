// Carts, checkout, delivery tracking and doorstep drop-offs.
import * as THREE from 'three';
import { G } from '../game.js';
import { ITEMS } from '../items/registry.js';
import { STORES } from './stores.js';
import { rand, fmtMoney } from '../core/utils.js';
import { queueSave } from '../core/state.js';
import { addXP } from '../progression/progress.js';

export const TAX = 0.0875;

export class Orders {
  constructor() {
    this._acc = 0;
    G.events.on('timeSkip', () => this.update(0, true));
  }

  cart(storeId) { return (G.state.carts[storeId] ||= []); }
  cartCount(storeId) { return this.cart(storeId).reduce((a, l) => a + l.qty, 0); }
  totalCartCount() { return Object.keys(G.state.carts).reduce((a, s) => a + this.cartCount(s), 0); }
  addToCart(storeId, id, qty = 1) {
    const c = this.cart(storeId);
    const line = c.find((l) => l.id === id);
    if (line) line.qty = Math.min(20, line.qty + qty); else c.push({ id, qty });
    G.audio.play('pop', { pitch: 1.2 });
    G.events.emit('cart', storeId);
    queueSave();
  }
  setQty(storeId, id, qty) {
    const c = this.cart(storeId);
    const line = c.find((l) => l.id === id);
    if (!line) return;
    line.qty = qty;
    if (qty <= 0) G.state.carts[storeId] = c.filter((l) => l !== line);
    G.events.emit('cart', storeId);
    queueSave();
  }
  clearCart(storeId) { G.state.carts[storeId] = []; G.events.emit('cart', storeId); }

  quote(storeId, { tip = 0, express = false } = {}) {
    const s = STORES[storeId];
    const lines = this.cart(storeId).filter((l) => ITEMS[l.id]);
    const subtotal = lines.reduce((a, l) => a + G.market.price(ITEMS[l.id], storeId) * l.qty, 0);
    const fee = s.freeOver && subtotal >= s.freeOver ? 0 : s.fee;
    const service = subtotal * (s.serviceFee || 0);
    const expressFee = express ? 4.99 : 0;
    const tax = subtotal * TAX;
    const total = subtotal + fee + service + tax + tip + expressFee;
    const [mn, mx] = s.delivery;
    return { lines, subtotal, fee, service, tax, tip, expressFee, total: Math.round(total * 100) / 100, eta: express ? [Math.round(mn * 0.5), Math.round(mx * 0.5)] : [mn, mx] };
  }

  checkout(storeId, opts = {}) {
    const q = this.quote(storeId, opts);
    if (!q.lines.length) return { ok: false, reason: 'Cart is empty' };
    if (!G.wallet.canAfford(q.total)) return { ok: false, reason: `Not enough money (${fmtMoney(q.total)})` };
    G.wallet.spend(q.total, `${STORES[storeId].name} order`);
    const items = [];
    for (const l of q.lines) for (let i = 0; i < l.qty; i++) items.push(l.id);
    // limited drop stock
    const drop = G.state.market.drop;
    if (drop && items.includes(drop.id)) drop.stock = Math.max(0, drop.stock - items.filter((x) => x === drop.id).length);
    const eta = G.clock.total + rand(q.eta[0], q.eta[1]);
    const order = { id: ++G.state.orderSeq, store: storeId, items, total: q.total, placed: G.clock.total, eta, status: 'confirmed', tip: opts.tip || 0, notified: {} };
    G.state.orders.unshift(order);
    if (G.state.orders.length > 60) G.state.orders.length = 60;
    this.clearCart(storeId);
    G.state.stats.ordersPlaced++;
    G.audio.play('cash');
    G.events.emit('act', 'order', { store: storeId, count: items.length, total: q.total });
    G.events.emit('orders');
    addXP(Math.min(40, 5 + items.length * 2), 'Order placed');
    G.needs.addBuff('treatYoself', 90);
    queueSave();
    return { ok: true, order };
  }

  active() { return G.state.orders.filter((o) => o.status !== 'delivered'); }

  stageOf(o) {
    const k = (G.clock.total - o.placed) / Math.max(1, o.eta - o.placed);
    const food = STORES[o.store].kind === 'food';
    if (k < 0.15) return { key: 'confirmed', label: 'Order confirmed', k };
    if (k < 0.5) return { key: 'preparing', label: food ? 'Preparing your food' : 'Packing your order', k };
    if (k < 0.85) return { key: 'onway', label: food ? 'Courier is on the way' : 'Out for delivery', k };
    if (k < 1) return { key: 'arriving', label: 'Arriving now', k };
    return { key: 'delivered', label: 'Delivered', k: 1 };
  }

  update(dt, force = false) {
    this._acc += dt;
    if (this._acc < 0.5 && !force) return;
    this._acc = 0;
    for (const o of this.active()) {
      const st = this.stageOf(o);
      if (st.key === 'delivered' && G.couriers?.enRoute(o.id)) continue;
      if (st.key !== o.status) {
        o.status = st.key;
        const s = STORES[o.store];
        if (st.key === 'onway') G.phone?.notify({ app: o.store, title: `${s.name}`, body: `${st.label} 🛵 · ETA ${G.clock.fmtDuration(o.eta - G.clock.total)}`, quiet: true });
        if (st.key === 'arriving') G.events.emit('courierArriving', o);
        if (st.key === 'delivered') this.deliver(o);
        G.events.emit('orders');
      }
    }
  }

  deliver(o) {
    const s = STORES[o.store];
    o.status = 'delivered';
    o.deliveredAt = G.clock.total;
    const groups = groupPackages(o.items, o.store);
    const apt = G.apartment;
    const used = G.items.all().filter((i) => i.def.category === 'package' && i.data.loc === 'world').map((i) => new THREE.Vector3(...i.data.pos));
    for (const g of groups) {
      if (G.state.settings.autoStoreDeliveries && g.kind !== 'flatpack') {
        for (const id of g.items) G.items.spawn(id, { loc: 'storage' });
        continue;
      }
      let spot = apt.packageSpots.find((p) => !used.some((u) => u.distanceTo(p) < 0.3));
      if (!spot) spot = apt.packageSpots[0].clone().add(new THREE.Vector3(rand(-0.5, 0.5), 0, rand(0, 0.6)));
      used.push(spot);
      G.items.spawn(g.pkg, { loc: 'world', pos: spot.clone().setY(0.0), yaw: rand(-0.3, 0.3) + Math.PI, st: { contents: g.items, store: o.store, order: o.id } });
    }
    // knock / doorbell, elevator ding in the hallway
    const door = new THREE.Vector3(-0.6, 1.4, 5.5);
    G.audio.play('doorbell', { pos: door, volume: 0.9 });
    G.audio.play('knock', { pos: door, delay: 2.2, volume: 0.7 });
    G.phone?.notify({ app: o.store, title: `${s.name} · Delivered 📦`, body: `Your order #${o.id} is at your door${G.state.settings.autoStoreDeliveries ? ' (moved to storage)' : ''}.` });
    G.events.emit('delivered', o);
  }
}

// Decide packaging: food comes in bags, shoes in shoeboxes, posters in tubes,
// furniture in flat-packs, everything else in cardboard boxes.
export function groupPackages(items, storeId) {
  const out = [];
  const store = STORES[storeId];
  const box = [];
  for (const id of items) {
    const d = ITEMS[id];
    if (!d) continue;
    const pk = d.packaging || (store.kind === 'food' ? 'bag' : d.furniture || d.place === 'floor' ? 'flatpack' : d.category === 'shoes' ? 'shoebox' : d.category === 'art' && d.place === 'wall' && !d.tags.includes('framed') ? 'tube' : 'box');
    if (pk === 'flatpack' || pk === 'shoebox' || pk === 'tube') out.push({ kind: pk, pkg: 'pkg_' + pk, items: [id] });
    else if (pk === 'bag') { let b = out.find((x) => x.kind === 'bag' && x.items.length < 4); if (!b) { b = { kind: 'bag', pkg: 'pkg_bag', items: [] }; out.push(b); } b.items.push(id); }
    else box.push(id);
  }
  for (let i = 0; i < box.length; i += 6) {
    const chunk = box.slice(i, i + 6);
    const big = chunk.some((id) => (ITEMS[id]._bounds?.max || 0.3) > 0.45) || chunk.length > 3;
    out.push({ kind: 'box', pkg: big ? 'pkg_box_l' : chunk.length > 1 ? 'pkg_box_m' : 'pkg_box_s', items: chunk });
  }
  return out;
}
