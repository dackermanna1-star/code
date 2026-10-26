// Pricing: daily deals, flash sales, limited drops and the live resale market.
import { G } from '../game.js';
import { ITEMS } from '../items/registry.js';
import { STORES } from './stores.js';
import { seeded, hashStr } from '../core/utils.js';

const RARITY_PREMIUM = { common: 0.9, uncommon: 1.05, rare: 1.4, epic: 2.2, legendary: 4.0 };

export class Market {
  constructor() {
    this._dealCache = {};
    G.events.on('newDay', () => { this._dealCache = {}; this.scheduleDrop(); });
    G.events.on('hour', (h) => this.onHour(h));
  }

  itemsFor(storeId) {
    const season = G.clock.season;
    return Object.values(ITEMS).filter((d) => d.stores.includes(storeId) && !d.hidden && (!d.season || d.season === season) && (!d.limited || this.dropActive(d)));
  }

  // ---------------------------------------------------------------- deals
  deals(storeId) {
    const key = storeId + ':' + G.clock.day;
    if (this._dealCache[key]) return this._dealCache[key];
    const rnd = seeded(hashStr(key) ^ G.state.market.seed);
    const items = this.itemsFor(storeId).filter((d) => !d.limited);
    const out = {};
    const n = Math.min(items.length, 4);
    for (let i = 0; i < n; i++) {
      const d = items[Math.floor(rnd() * items.length)];
      out[d.id] = 0.15 + Math.floor(rnd() * 7) * 0.05; // 15%..45% off
    }
    this._dealCache[key] = out;
    return out;
  }
  flashSale() {
    const f = G.state.market.flash;
    if (f && f.until > G.clock.total) return f;
    return null;
  }
  discount(def, storeId) {
    let d = this.deals(storeId)[def.id] || 0;
    const f = this.flashSale();
    if (f && f.store === storeId) d = Math.max(d, f.pct);
    return d;
  }
  price(def, storeId = def.stores[0]) {
    if (storeId === 'stockpile') return this.askPrice(def);
    const base = def.price;
    const d = this.discount(def, storeId);
    return Math.round(base * (1 - d) * 100) / 100;
  }

  // a rotating handful of "new arrivals" per store (changes every two days)
  isNew(def) {
    const k = Math.floor((G.clock.day - 1) / 2);
    return (hashStr(def.id + ':' + k) % 9) === 0;
  }

  // ---------------------------------------------------------------- resale market
  resellable(def) { return def.tags.includes('resell') || def.stores.includes('stockpile') || ['shoes', 'collectibles'].includes(def.category) || !!def.limited; }
  marketValue(def, day = G.clock.day) {
    // things anyone can buy at retail resell below sticker unless they set a resale value
    const retail = def.stores.some((s) => s !== 'stockpile') && !def.limited;
    const base = def.resale ?? (retail ? def.price * 0.7 / (RARITY_PREMIUM[def.rarity] || 1) : def.price);
    const rnd = seeded(hashStr(def.id) ^ 0x5bd1e995);
    const vol = 0.06 + rnd() * 0.12;
    const drift = (rnd() - 0.4) * 0.03; // most things slowly appreciate
    let v = 0;
    for (let d = 1; d <= day; d++) { const r = seeded(hashStr(def.id + ':' + d) ^ G.state.market.seed)(); v += drift + (r - 0.5) * vol; }
    const limitedBoost = def.limited ? 1.6 + Math.min(1.5, day * 0.04) : 1;
    const mult = Math.max(0.45, (RARITY_PREMIUM[def.rarity] || 1) * limitedBoost * Math.exp(v));
    return Math.round(base * mult * 100) / 100;
  }
  history(def, days = 14) {
    const out = [];
    const today = G.clock.day;
    for (let d = Math.max(1, today - days + 1); d <= today; d++) out.push({ day: d, v: this.marketValue(def, d) });
    return out;
  }
  askPrice(def) { return Math.round(this.marketValue(def) * 1.04 * 100) / 100; }
  sellPrice(def) { return Math.round(this.marketValue(def) * 0.9 * 100) / 100; }

  // ---------------------------------------------------------------- limited drops
  scheduleDrop() {
    const m = G.state.market;
    const limited = Object.values(ITEMS).filter((d) => d.limited);
    if (!limited.length) return;
    const rnd = seeded(G.clock.day * 7919 ^ m.seed);
    const d = limited[Math.floor(rnd() * limited.length)];
    const start = (G.clock.day - 1) * 1440 + 18 * 60; // 6 PM
    m.drop = { id: d.id, start, end: start + 180, stock: 4 + Math.floor(rnd() * 8), announced: false };
  }
  dropActive(def) {
    const dr = G.state.market.drop;
    return !!dr && dr.id === def.id && G.clock.total >= dr.start && G.clock.total < dr.end && dr.stock > 0;
  }
  currentDrop() { return G.state.market.drop; }
  onHour(h) {
    const m = G.state.market;
    if (!m.drop || m.drop.start < (G.clock.day - 1) * 1440) this.scheduleDrop();
    const dr = m.drop;
    if (!dr) return;
    const def = ITEMS[dr.id];
    if (h === 17 && !dr.announced) { dr.announced = true; G.phone?.notify({ app: def.stores[0], title: '🔥 Limited drop at 6 PM', body: `${def.name} — only ${dr.stock} available. Set your alarm!` }); }
    if (h === 18) G.phone?.notify({ app: def.stores[0], title: '🚨 The drop is LIVE', body: `${def.name} is available now in ${STORES[def.stores[0]]?.name}. Hurry!` });
    // other buyers snap up stock over time
    if (G.clock.total >= dr.start && G.clock.total < dr.end && Math.random() < 0.6) dr.stock = Math.max(0, dr.stock - 1);
    // random flash sale
    if (Math.random() < 0.08 && h >= 9 && h <= 22) {
      const ids = Object.keys(STORES).filter((s) => s !== 'stockpile' && (STORES[s].unlock || 1) <= G.state.level);
      const store = ids[Math.floor(Math.random() * ids.length)];
      m.flash = { store, pct: 0.3, until: G.clock.total + 60 };
      G.phone?.notify({ app: store, title: `⚡ Flash sale: 30% off everything`, body: `${STORES[store].name} — for the next hour only.` });
    }
  }
}
