// Prison economy: ramen is currency. Jobs pay per unit of work, vending machines and the
// payphone take ramen, traders buy and sell, and favours (small quests) pay out.
import { JOBS } from './activities.js';
import { ITEMS } from '../world/items.js';
import { RNG } from '../core/random.js';

export const VENDING = {
  snacks: [{ type: 'snack', price: 3 }, { type: 'apple', price: 2 }],
  drinks: [{ type: 'soda', price: 2 }, { type: 'coffee', price: 2 }],
};
export const TRADER_STOCK = ['cards', 'soap', 'hooch', 'phone', 'screwdriver', 'snack', 'newspaper', 'book'];

export class Economy {
  constructor(sim) {
    this.sim = sim;
    this.units = new Map();
    this.earned = new Map();
    this.favors = [];           // {id, from, kind, item?, target?, reward, status}
    this.rng = new RNG(31337);
    sim.events.on('ko', (e) => this._checkFavorKO(e));
  }
  credit(c, job, units = 1) {
    const J = JOBS[job];
    if (!J) return;
    const u = (this.units.get(c.id) || 0) + units;
    if (u >= J.perUnits) {
      const pay = J.pay + (c.stats.smt > 60 ? 1 : 0);
      c.ramen += pay;
      this.earned.set(c.id, (this.earned.get(c.id) || 0) + pay);
      this.units.set(c.id, u - J.perUnits);
      this.sim.events.emit('paid', { c, amount: pay, job });
    } else this.units.set(c.id, u);
  }
  buy(c, type, price) {
    if (c.ramen < price) { this.sim.events.emit('broke', { c, price }); return null; }
    c.ramen -= price;
    const it = this.sim.items.spawn(type, c.x, c.y + 1, c.z);
    this.sim.giveItem(c, it);
    this.sim.events.emit('bought', { c, item: it, price });
    return it;
  }
  sellPrice(item) { return Math.max(1, Math.floor((item.def.value || 1) * 0.6)); }
  sell(c, item, to) {
    const price = this.sellPrice(item);
    if (to.ramen < price) return false;
    if (c.held === item) c.held = null; else { const i = c.pockets.indexOf(item); if (i >= 0) c.pockets.splice(i, 1); }
    item.holder = null; item.pocketOf = to; to.pockets.push(item);
    to.ramen -= price; c.ramen += price;
    this.sim.events.emit('sold', { c, item, price, to });
    return price;
  }
  traderOffer(trader) {
    const r = new RNG(Math.floor(this.sim.clock.total / 240) + trader.id.length);
    const picks = r.shuffle([...TRADER_STOCK]).slice(0, 3);
    return picks.map((t) => ({ type: t, price: Math.ceil((ITEMS[t].value || 2) * 1.25) }));
  }

  // ------------------------------------------------------------------ favours
  offerFavor(npc, player) {
    if (this.favors.some((f) => f.from === npc.id && f.status === 'open')) return null;
    const kinds = ['fetch', 'fetch', 'payback'];
    const kind = this.rng.pick(kinds);
    let f = null;
    if (kind === 'fetch') {
      const type = this.rng.pick(['book', 'apple', 'cards', 'soap', 'snack', 'soda', 'toiletRoll', 'newspaper']);
      f = { id: `f${this.favors.length + 1}`, from: npc.id, kind, item: type, reward: (ITEMS[type].value || 2) + 3, status: 'open', text: `Bring ${npc.short} a ${ITEMS[type].name.toLowerCase()}.` };
    } else {
      const op = this.sim.social;
      const enemies = this.sim.characters.filter((o) => o.kind === 'inmate' && o !== npc && o !== player && op.opinionOf(npc, o) < -10);
      const target = enemies.length ? this.rng.pick(enemies) : null;
      if (!target) return null;
      f = { id: `f${this.favors.length + 1}`, from: npc.id, kind, target: target.id, reward: 10 + Math.round(target.stats.str / 10), status: 'open', text: `Teach ${target.short} a lesson for ${npc.short} (knock them out).` };
    }
    this.favors.push(f);
    this.sim.events.emit('favorOffered', { f, npc });
    return f;
  }
  openFavorsFrom(npc) { return this.favors.filter((f) => f.from === npc.id && f.status === 'open'); }
  /** Try to complete a fetch favour with the player's held item. */
  deliver(player, npc) {
    const f = this.favors.find((x) => x.from === npc.id && x.status === 'open' && x.kind === 'fetch' && player.held && player.held.type === x.item);
    if (!f) return null;
    const it = player.held; player.held = null; this.sim.items.remove(it);
    return this.complete(f, player, npc);
  }
  complete(f, player, npc) {
    f.status = 'done';
    player.ramen += f.reward;
    this.sim.social.adjust(npc, player, 18, 'did me a favour');
    player.respect = Math.min(100, (player.respect || 0) + 2);
    this.sim.events.emit('favorDone', { f, npc, player });
    return f;
  }
  _checkFavorKO(e) {
    for (const f of this.favors) {
      if (f.status !== 'open' || f.kind !== 'payback' || f.target !== e.c.id || !e.by || !e.by.isPlayer) continue;
      f.status = 'ready';
      this.sim.events.emit('favorReady', { f });
    }
  }
  claim(player, npc) {
    const f = this.favors.find((x) => x.from === npc.id && x.status === 'ready');
    return f ? this.complete(f, player, npc) : null;
  }
}
