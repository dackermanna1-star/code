// Your inventory, DayZ-style: what you wear has pockets (a grid of cells),
// and everything you carry fits into those grids by its size - turned on its
// side if that helps. Long guns go on your shoulder, an axe or a second gun in
// the melee slot, and whatever you're holding is in your hands. Nine hotbar
// keys point at items wherever they are.
import { ITEMS, CALIBRES } from './items.js';

let UID = 1;
/** A new item: id, and o: { n (count / rounds / uses), cond (0..1) }. */
export function makeItem(id, o = {}) {
  const d = ITEMS[id];
  if (!d) throw new Error('no item ' + id);
  const it = { uid: UID++, id, cond: o.cond ?? 1, x: 0, y: 0, rot: false };
  if (d.stack > 1) it.n = Math.max(1, Math.min(d.stack, o.n ?? (d.ammo ? Math.round(CALIBRES[d.ammo].box * (0.4 + Math.random() * 0.6)) : 1)));
  if (d.magOf) it.n = o.n ?? Math.floor(Math.random() * (d.cap + 1) * 0.6);
  if (d.uses) it.n = o.n ?? d.uses;
  if (d.gun) {
    it.attach = o.attach || {};
    it.mag = o.mag ?? null; // an attached magazine item
    it.chamber = !!o.chamber;
    it.rounds = o.rounds ?? 0; // internal magazine (shotgun, bolt rifle)
  }
  if (d.wear?.cargo) it.grid = new Grid(d.wear.cargo[0], d.wear.cargo[1]);
  if (d.tints) it.tint = o.tint ?? d.tints[Math.floor(Math.random() * d.tints.length)];
  if (d.light) { it.on = false; it.charge = o.charge ?? (Math.random() < 0.7 ? 0.3 + Math.random() * 0.7 : 0); }
  if (d.refill) it.dirty = false;
  return it;
}
export const def = (it) => ITEMS[it.id];
/** The item's footprint in cells (turned if rot). */
export function size(it) { const d = def(it); return it.rot ? [d.h, d.w] : [d.w, d.h]; }

export const COND = [[0.7, 'Pristine', '#9ac878'], [0.5, 'Worn', '#c8c878'], [0.3, 'Damaged', '#d8a050'], [0.08, 'Badly damaged', '#d86a40'], [-1, 'Ruined', '#c83a2a']];
export function condOf(it) { return COND.find(([t]) => it.cond > t); }

export class Grid {
  constructor(w, h) { this.w = w; this.h = h; this.items = []; }
  /** Does `it` fit with its top-left at (x, y) (turned or not)? `ignore`: an item to pretend isn't there. */
  fits(it, x, y, rot = it.rot, ignore = null) {
    const d = def(it), w = rot ? d.h : d.w, h = rot ? d.w : d.h;
    if (x < 0 || y < 0 || x + w > this.w || y + h > this.h) return false;
    for (const o of this.items) {
      if (o === it || o === ignore) continue;
      const [ow, oh] = size(o);
      if (x < o.x + ow && x + w > o.x && y < o.y + oh && y + h > o.y) return false;
    }
    return true;
  }
  /** The first place `it` fits: [x, y, rot] or null. */
  space(it) {
    for (const rot of [it.rot, !it.rot]) for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.fits(it, x, y, rot)) return [x, y, rot];
    return null;
  }
  put(it, x, y, rot) { it.x = x; it.y = y; it.rot = rot; if (!this.items.includes(it)) this.items.push(it); it.where = this; }
  take(it) { const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1); if (it.where === this) it.where = null; }
  at(x, y) { return this.items.find((o) => { const [w, h] = size(o); return x >= o.x && x < o.x + w && y >= o.y && y < o.y + h; }); }
}

export const SLOTS = ['head', 'torso', 'vest', 'legs', 'back', 'shoulder', 'melee', 'hands'];

export class Inventory {
  constructor() {
    this.slots = Object.fromEntries(SLOTS.map((s) => [s, null]));
    this.hotbar = new Array(9).fill(null); // item uids
    this.onChange = null;
  }
  changed() { this.onChange?.(); }
  /** The grids you carry, in the order things go into them. */
  grids() { const out = []; for (const s of ['torso', 'legs', 'vest', 'back']) { const it = this.slots[s]; if (it?.grid) out.push({ slot: s, item: it, grid: it.grid }); } return out; }
  /** Every item you have (in slots, in grids, and attached magazines). */
  all() {
    const out = [];
    for (const s of SLOTS) { const it = this.slots[s]; if (it) out.push(it); }
    for (const g of this.grids()) out.push(...g.grid.items);
    return out;
  }
  find(fn) { return this.all().find(fn); }
  byUid(uid) { return this.all().find((i) => i.uid === uid) || null; }
  /** Where an item is: { slot } or { grid } (or null). */
  locate(it) {
    for (const s of SLOTS) if (this.slots[s] === it) return { slot: s };
    for (const g of this.grids()) if (g.grid.items.includes(it)) return { grid: g.grid, owner: g.item };
    return null;
  }
  /** Take an item out of wherever it is. */
  detach(it) {
    const at = this.locate(it);
    if (!at) return false;
    if (at.slot) this.slots[at.slot] = null; else at.grid.take(it);
    // things in a removed piece of clothing go with it
    this.changed();
    return true;
  }
  /** Which slot an item would be worn/carried in (or null). */
  slotFor(it) {
    const d = def(it);
    if (d.wear) return d.wear.slot;
    if (d.gun && !d.pistol) return this.slots.shoulder ? (this.slots.melee ? null : 'melee') : 'shoulder';
    if (d.melee && d.long) return 'melee';
    return null;
  }
  /**
   * Put an item somewhere sensible: stack it, wear it if that slot's free, or find room in a grid.
   * Returns true if it went in. o.noWear: only into pockets.
   */
  add(it, o = {}) {
    const d = def(it);
    // stack onto the same thing
    if (d.stack > 1) {
      for (const g of this.grids()) for (const s of g.grid.items) {
        if (s.id !== it.id || s.n >= d.stack) continue;
        const k = Math.min(it.n, d.stack - s.n); s.n += k; it.n -= k;
        if (it.n <= 0) { this.changed(); return true; }
      }
    }
    if (!o.noWear) {
      const sl = this.slotFor(it);
      if (sl && !this.slots[sl]) { this.slots[sl] = it; it.where = null; this.changed(); return true; }
    }
    for (const g of this.grids()) {
      const sp = g.grid.space(it);
      if (sp) { g.grid.put(it, sp[0], sp[1], sp[2]); this.changed(); return true; }
    }
    return false;
  }
  /** Could it be added? (without adding it) */
  canAdd(it) {
    const d = def(it);
    if (d.stack > 1) for (const g of this.grids()) for (const s of g.grid.items) if (s.id === it.id && s.n < d.stack) return true;
    const sl = this.slotFor(it);
    if (sl && !this.slots[sl]) return true;
    return this.grids().some((g) => g.grid.space(it));
  }
  /** Wear a piece of clothing (moving what was in the old one's pockets into the new one where it fits). Returns what came off. */
  wear(it) {
    const d = def(it), s = d.wear.slot, old = this.slots[s];
    this.detach(it);
    this.slots[s] = it;
    if (old && old.grid && it.grid) for (const o of old.grid.items.slice()) { const sp = it.grid.space(o); if (sp) { old.grid.take(o); it.grid.put(o, sp[0], sp[1], sp[2]); } }
    this.changed();
    return old;
  }
  /** Rounds of a calibre loose in your pockets. */
  rounds(cal) { let n = 0; for (const it of this.all()) if (def(it).ammo === cal) n += it.n; return n; }
  /** Take up to n rounds of a calibre from your pockets (removing empty boxes). Returns how many. */
  takeRounds(cal, n) {
    let got = 0;
    for (const g of this.grids()) for (const it of g.grid.items.slice()) {
      if (def(it).ammo !== cal || got >= n) continue;
      const k = Math.min(it.n, n - got); it.n -= k; got += k;
      if (it.n <= 0) g.grid.take(it);
    }
    if (got) this.changed();
    return got;
  }
  /** Magazines that fit a gun, fullest first. */
  magsFor(gunDef) { return this.all().filter((it) => it.id === gunDef.mag).sort((a, b) => b.n - a.n); }
  /** Total weight carried (kg). */
  weight() {
    let w = 0;
    const add = (it) => { const d = def(it); w += d.weight * (d.stack > 1 ? it.n : 1); if (it.mag) add(it.mag); };
    for (const it of this.all()) add(it);
    return w;
  }
  /** Armour against a hit to `part` (0..1), and warmth (0..1+) from what you wear. */
  armor(part) {
    if (part !== 'head' && part !== 'torso') return 0;
    const s = part === 'head' ? this.slots.head : this.slots.vest;
    const d = s ? def(s) : null;
    return d?.wear?.armor ? d.wear.armor * Math.max(0.2, s.cond) : (part === 'torso' && this.slots.torso ? (def(this.slots.torso).wear.armor || 0) : 0);
  }
  warmth() { let w = 0; for (const s of ['head', 'torso', 'vest', 'legs']) { const it = this.slots[s]; if (it) w += def(it).wear.warmth || 0; } return w; }
  waterproof() { const t = this.slots.torso; return t ? def(t).wear.waterproof || 0 : 0; }
  /** The item a hotbar key points at (if you still have it). */
  hot(i) { const uid = this.hotbar[i]; return uid ? this.byUid(uid) : null; }
  setHot(i, it) { for (let k = 0; k < 9; k++) if (this.hotbar[k] === it.uid) this.hotbar[k] = null; this.hotbar[i] = it.uid; this.changed(); }
  /** Plain data for saving. */
  save() {
    const ser = (it) => it && ({ id: it.id, n: it.n, cond: +it.cond.toFixed(3), x: it.x, y: it.y, rot: it.rot, tint: it.tint, attach: it.attach, chamber: it.chamber, rounds: it.rounds, mag: it.mag ? ser(it.mag) : null, on: it.on, charge: it.charge, dirty: it.dirty, jammed: it.jammed || undefined, uid: it.uid, grid: it.grid ? it.grid.items.map(ser) : undefined });
    return { slots: Object.fromEntries(SLOTS.map((s) => [s, ser(this.slots[s])])), hotbar: this.hotbar };
  }
  static load(data) {
    const inv = new Inventory();
    const uidMap = new Map();
    const de = (o) => {
      if (!o || !ITEMS[o.id]) return null;
      const it = makeItem(o.id, { n: o.n, cond: o.cond, tint: o.tint, attach: o.attach, chamber: o.chamber, rounds: o.rounds, charge: o.charge });
      if (o.mag) it.mag = de(o.mag);
      it.on = !!o.on; it.dirty = !!o.dirty; it.jammed = !!o.jammed; it.rot = !!o.rot; it.x = o.x | 0; it.y = o.y | 0;
      uidMap.set(o.uid, it.uid);
      if (o.grid && it.grid) for (const c of o.grid) { const ci = de(c); if (ci && it.grid.fits(ci, ci.x, ci.y, ci.rot)) it.grid.put(ci, ci.x, ci.y, ci.rot); }
      return it;
    };
    for (const s of SLOTS) inv.slots[s] = de(data.slots?.[s]);
    inv.hotbar = (data.hotbar || []).map((u) => (u ? uidMap.get(u) ?? null : null));
    while (inv.hotbar.length < 9) inv.hotbar.push(null);
    return inv;
  }
}
