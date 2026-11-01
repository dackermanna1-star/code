// Simulation: the engine-free heart of the game (world, clock, characters, items, brains and
// the prison systems). The presentation layer (game.js) renders it and feeds player input.
import { EventBus } from './core/events.js';
import { RNG } from './core/random.js';
import { WorldData } from './world/worldData.js';
import { ItemManager, ITEMS } from './world/items.js';
import { ITEM_SPAWNS } from './world/layout.js';
import { Character } from './characters/character.js';
import { Brain } from './ai/brain.js';
import { Clock } from './gameplay/schedule.js';
import { CONFIG } from './config.js';

export class Simulation {
  constructor(opts = {}) {
    this.opts = opts;
    this.events = new EventBus();
    this.rng = new RNG(opts.seed || 1234);
    this.time = 0;
    this.world = new WorldData();
    this.items = new ItemManager(this.world, new RNG((opts.seed || 1234) + 1));
    this.clock = new Clock(opts.startMinutes ?? CONFIG.time.startMinutes);
    this.characters = [];
    this.byId = new Map();
    this.brains = new Map();
    this.player = null;
    this.systems = [];          // objects with update(dt) / onClock(ev)
    this.attackers = new Set(); // brains holding a token to attack the player
    this.paused = false;
    this.items.onImpact = (it, speed, surface) => this.events.emit('itemImpact', { item: it, speed, surface });
    this.items.onHitChar = (it, c) => this._itemHit(it, c);
    this._sepList = [];
  }

  spawnItems() {
    for (const [type, x, z] of ITEM_SPAWNS) {
      const y = this._surfaceAt(x, z);
      this.items.spawn(type, x, y + 0.08, z, { home: { x, z } });
    }
  }
  _surfaceAt(x, z) {
    let y = 0;
    for (const b of this.world.colliders.query(x - 0.05, z - 0.05, x + 0.05, z + 0.05, [])) if (b.kind === 'furniture' && b.maxY < 1.3) y = Math.max(y, b.maxY);
    return y;
  }

  addCharacter(def, app, opts = {}) {
    const c = new Character(this, def, app, opts);
    this.characters.push(c);
    this.byId.set(c.id, c);
    if (opts.isPlayer) this.player = c;
    else this.brains.set(c.id, new Brain(this, c, (def.seed || this.characters.length * 977) >>> 0));
    this.events.emit('spawn', { c });
    return c;
  }
  brainOf(c) { return this.brains.get(c.id); }

  // ------------------------------------------------------------------ loop
  step(dt) {
    if (this.paused) return;
    this.time += dt;
    this.pathBudget = 6; // max A* searches per step; others wait a tick
    for (const ev of this.clock.advance(dt)) { this.events.emit('clock', ev); for (const s of this.systems) s.onClock?.(ev); }
    this._doors(dt);
    this._curfewSweep();
    for (const s of this.systems) s.update?.(dt);
    for (const b of this.brains.values()) b.update(dt);
    for (const c of this.characters) c.update(dt);
    this._separate();
    this.items.update(dt, this.characters);
    for (const s of this.systems) s.lateUpdate?.(dt);
  }

  _doors(dt) {
    const clk = this.clock;
    for (const d of this.world.doors) {
      if (d.style === 'cell') d.scheduledOpen = !d.cell.startsWith('H') && clk.cellsOpen && !this.lockdown;
      else if (d.id === 'd_yardgate') d.scheduledOpen = (clk.yardOpen || (clk.minutes >= 17 * 60 + 30 && clk.minutes < 17 * 60 + 50)) && !this.lockdown;
      let near = false;
      if (!d.scheduledOpen && !d.locked) {
        const [cx, cz] = d.center();
        for (const c of this.characters) {
          if (c.isDown || Math.abs(c.x - cx) > 2.6 || Math.abs(c.z - cz) > 2.6) continue;
          if (d.authorize(c)) { near = true; break; }
        }
      }
      const ev = d.update(dt, near);
      if (ev) this.events.emit('door', { door: d, ev });
    }
  }

  /** At lock time, stragglers the player can't see are quietly walked back to their cells. */
  _curfewSweep() {
    const m = this.clock.minutes;
    const lockTime = m >= 21 * 60 + 28 && m < 21 * 60 + 40;
    const yardClose = m >= 17 * 60 + 48 && m < 17 * 60 + 55;
    if (!lockTime && !yardClose) return;
    for (const c of this.characters) {
      if (c.isPlayer || c.kind !== 'inmate' || c.state === 'ko' || c.flags.solitaryCell) continue;
      const room = this.world.roomAt(c.x, c.z);
      const misplaced = lockTime ? !(room && room.id === c.cell) : room && room.id === 'yard';
      if (!misplaced || (this.isVisibleToPlayer && this.isVisibleToPlayer(c))) continue;
      if (c.spot) c.leaveSpot(true);
      if (lockTime && c.bed) c.place(c.bed.ax, c.bed.az);
      else { const pt = this.world.randomPointIn('hall', this.rng, c); if (pt) c.place(pt[0], pt[1]); }
      const b = this.brains.get(c.id); if (b) { b.path = null; if (this.planner) this.planner.endGoal(b); }
    }
  }
  /** Soft circle separation between characters (player is heavy; downed bodies don't block). */
  _separate() {
    const list = this.characters;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.state === 'spot' || a.state === 'grappled' || a.state === 'thrown' || a.isDown) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.state === 'spot' || b.state === 'grappled' || b.state === 'thrown' || b.isDown) continue;
        if (a.grapple && a.grapple.partner === b) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const r = a.radius + b.radius;
        if (Math.abs(dx) > r || Math.abs(dz) > r) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r || d2 < 1e-8) continue;
        const d = Math.sqrt(d2), push = (r - d);
        const wa = a.isPlayer ? CONFIG.move.playerPushWeight : b.isPlayer ? 1 - CONFIG.move.playerPushWeight : 0.5;
        const nx = dx / d, nz = dz / d;
        a.x -= nx * push * wa; a.z -= nz * push * wa;
        b.x += nx * push * (1 - wa); b.z += nz * push * (1 - wa);
      }
    }
  }

  // ------------------------------------------------------------------ helpers used by characters
  requestAttackToken(brain) {
    for (const b of this.attackers) if (!b.fight || b.fight.target !== this.player || b.c.state === 'ko') this.attackers.delete(b);
    if (this.attackers.size < 2) { this.attackers.add(brain); return true; }
    return false;
  }
  releaseAttackToken(brain) { this.attackers.delete(brain); }

  giveItem(c, item) {
    if (item.def.pocket && c.pockets.length < 3 && (c.held || c.isPlayer && item.def.pocket && !item.def.dmg)) {
      item.pocketOf = c; c.pockets.push(item);
    } else {
      if (c.held) c.dropHeld(1);
      item.holder = c; c.held = item;
    }
    item.resting = false; item.thrownBy = null;
    this.events.emit('pickup', { c, item });
  }
  /** Move a pocketed item into the hand (swapping the held one into the pocket if it fits). */
  takeFromPocket(c, idx) {
    const it = c.pockets[idx];
    if (!it) return false;
    c.pockets.splice(idx, 1);
    if (c.held) { if (c.held.def.pocket && c.pockets.length < 3) { c.held.holder = null; c.held.pocketOf = c; c.pockets.push(c.held); } else c.dropHeld(1); }
    it.pocketOf = null; it.holder = c; c.held = it;
    this.events.emit('equip', { c, item: it });
    return true;
  }
  consumeItem(c, it) {
    if (c.held !== it) return;
    const d = it.def;
    if (d.use === 'eat') {
      c.hunger = Math.min(100, c.hunger + (d.food || 10));
      c.hp = Math.min(c.maxHp, c.hp + 4);
      if (d.mealItem) { it.filled = false; }
      else { c.held = null; this.items.remove(it); }
    } else if (d.use === 'drink') {
      c.energy = Math.min(100, c.energy + (d.energy || 6));
      if (d.hooch) { c.drunk = 1.5; c.hp = Math.min(c.maxHp, c.hp + 10); this.events.emit('drunk', { c }); }
      c.held = null; this.items.remove(it);
    } else if (d.use === 'read') {
      c.stats.smt = Math.min(100, c.stats.smt + 0.4 * (1 - c.stats.smt / 130));
      this.events.emit('statGain', { c, stat: 'smt' });
    }
    this.events.emit('consume', { c, item: it });
  }
  breakItem(it, by) {
    const into = it.def.breaksInto;
    const holder = it.holder;
    if (holder) holder.held = null;
    const x = holder ? holder.x : it.x, z = holder ? holder.z : it.z;
    this.items.remove(it);
    this.events.emit('itemBreak', { item: it, by, x, z });
    if (into) {
      const piece = this.items.spawn(into, x, 1.0, z);
      if (holder) { piece.holder = holder; holder.held = piece; } else this.items.release(piece, x, 1, z, 0, 1, 0);
    }
  }
  _itemHit(it, c) {
    const d = it.def;
    const speed = Math.hypot(it.vx, it.vz);
    const dmg = (d.throwDmg || 1) * Math.min(1.4, speed / 10);
    const thrower = it.thrownBy;
    const res = c.takeHit(thrower || c, { dmg, poise: d.heavy ? 80 : 25, dirX: it.vx / (speed || 1), dirZ: it.vz / (speed || 1), heavy: !!d.heavy, region: 'head', knock: !!d.heavy });
    this.events.emit('hit', { att: thrower, vic: c, atk: { sound: d.clang ? 'metal_hit' : 'body_hit', thrown: true }, dmg, result: res, item: it });
    if (d.breaks || d.durability <= 2) this.breakItem(it, thrower);
  }
  tryUseSpot(c, spot) {
    if (this.canUseSpot && !this.canUseSpot(c, spot)) return false;
    return c.useSpot(spot);
  }
  startConversation(a, b) { this.events.emit('talkRequest', { a, b }); }
  endConversation(c, reason) { this.events.emit('talkEnd', { c, reason }); }
}
export { ITEMS };
