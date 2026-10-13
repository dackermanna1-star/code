import type { EntSnap } from '../../shared/net/protocol';
import { Container, makeStack, addToAny, type ItemStack } from '../../shared/sim/inventory';
import { SOLID } from '../../shared/world/blocks';
import { itemDef, tryItemDef } from '../../shared/data/items';
import type { Game } from '../game';
import type { Player } from '../player';
import { r2 } from '../player';

/** Anything replicated to clients as an entity. */
export interface WorldEntity {
  id: number;
  kind: EntSnap['k'];
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Bumped whenever replicated state changes (static entities). */
  ver: number;
  /** Sent every snapshot when true. */
  dynamic: boolean;
  removed?: boolean;
  snap(): EntSnap;
}

const CELL = 32;
const cellKey = (x: number, z: number) => (Math.floor(x / CELL) + 32768) * 65536 + (Math.floor(z / CELL) + 32768);

export class ItemDrop implements WorldEntity {
  kind = 'i' as const;
  ver = 1;
  dynamic = false;
  removed = false;
  vy = 0;
  resting = false;
  constructor(public id: number, public stack: ItemStack, public x: number, public y: number, public z: number, public despawnAt: number) {}
  snap(): EntSnap {
    return { id: this.id, k: 'i', x: r2(this.x), y: r2(this.y), z: r2(this.z), n: this.stack.id, hp: this.stack.n };
  }
}

/**
 * Player corpse or animal carcass. Player corpses hold the dead player's
 * items; carcasses yield resources when hit with tools.
 */
export class Corpse implements WorldEntity {
  kind = 'c' as const;
  ver = 1;
  dynamic = false;
  removed = false;
  container = new Container(36);
  /** Remaining harvest yields (carcasses). */
  harvest: Array<[string, number]> = [];
  harvestHp = 0;
  constructor(public id: number, public name: string, public x: number, public y: number, public z: number, public despawnAt: number, public species = '') {}
  snap(): EntSnap {
    return { id: this.id, k: 'c', x: r2(this.x), y: r2(this.y), z: r2(this.z), n: this.species ? `${this.species}` : this.name, f: this.species ? 1 : 0 };
  }
}

export class Entities {
  private all = new Map<number, WorldEntity>();
  private grid = new Map<number, Set<WorldEntity>>();
  private cellOf = new Map<number, number>();
  drops = new Set<ItemDrop>();
  corpses = new Set<Corpse>();

  constructor(private game: Game) {}

  add(e: WorldEntity) {
    e.removed = false;
    this.all.set(e.id, e);
    this.updateCell(e);
    if (e instanceof ItemDrop) this.drops.add(e);
    if (e instanceof Corpse) this.corpses.add(e);
  }

  remove(e: WorldEntity) {
    e.removed = true;
    this.all.delete(e.id);
    const c = this.cellOf.get(e.id);
    if (c !== undefined) this.grid.get(c)?.delete(e);
    this.cellOf.delete(e.id);
    if (e instanceof ItemDrop) this.drops.delete(e);
    if (e instanceof Corpse) this.corpses.delete(e);
  }

  get(id: number) {
    return this.all.get(id);
  }

  count() {
    return this.all.size;
  }

  /** Re-bucket an entity after it moved. Cheap when it stays in its cell. */
  updateCell(e: WorldEntity) {
    const k = cellKey(e.x, e.z);
    const prev = this.cellOf.get(e.id);
    if (prev === k) return;
    if (prev !== undefined) this.grid.get(prev)?.delete(e);
    let s = this.grid.get(k);
    if (!s) this.grid.set(k, (s = new Set()));
    s.add(e);
    this.cellOf.set(e.id, k);
  }

  /** Entities within `r` blocks (horizontal) of (x, z). Uses the spatial grid. */
  *near(x: number, z: number, r: number): Generator<WorldEntity> {
    const c0x = Math.floor((x - r) / CELL), c1x = Math.floor((x + r) / CELL);
    const c0z = Math.floor((z - r) / CELL), c1z = Math.floor((z + r) / CELL);
    const r2_ = r * r;
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const s = this.grid.get((cx + 32768) * 65536 + (cz + 32768));
      if (!s) continue;
      for (const e of s) {
        const dx = e.x - x, dz = e.z - z;
        if (dx * dx + dz * dz <= r2_) yield e;
      }
    }
  }

  dropItem(stack: ItemStack, x: number, y: number, z: number, lifetime = 300): ItemDrop {
    // merge with an identical nearby drop to limit entity spam
    for (const e of this.near(x, z, 1.5)) {
      if (e instanceof ItemDrop && e.stack.id === stack.id && e.stack.dur === undefined && stack.dur === undefined && Math.abs(e.y - y) < 1.5) {
        const max = itemDef(stack.id).stack;
        if (e.stack.n + stack.n <= max) {
          e.stack.n += stack.n;
          e.ver++;
          e.despawnAt = Math.max(e.despawnAt, this.game.now + lifetime);
          return e;
        }
      }
    }
    const d = new ItemDrop(this.game.allocId(), { ...stack }, x, y, z, this.game.now + lifetime);
    this.add(d);
    return d;
  }

  /** Give items to a player; anything that doesn't fit is dropped at their feet. */
  give(p: Player, id: string, n: number) {
    if (n <= 0 || !tryItemDef(id)) return;
    const left = addToAny(p.inv.pickupOrder(), makeStack(id, n));
    if (left > 0) {
      this.dropItem(makeStack(id, left), p.x, p.y + 0.5, p.z);
      this.game.msg(p, 'Inventory full — item dropped', 'error');
    }
  }

  createPlayerCorpse(p: Player): Corpse {
    const c = new Corpse(this.game.allocId(), p.name, p.x, p.y, p.z, this.game.now + this.game.config.corpseLifetimeSec);
    let i = 0;
    for (const cont of [p.inv.belt, p.inv.main, p.inv.wear]) {
      for (const s of cont.slots) if (s && i < c.container.size) c.container.slots[i++] = { ...s };
    }
    c.container.touch();
    this.add(c);
    return c;
  }

  tick(dt: number) {
    const w = this.game.world;
    for (const d of this.drops) {
      if (this.game.now > d.despawnAt) {
        this.remove(d);
        continue;
      }
      if (d.resting) {
        if (!SOLID[w.getBlock(Math.floor(d.x), Math.floor(d.y - 0.05), Math.floor(d.z))]) d.resting = false;
        else continue;
      }
      d.vy = Math.max(-20, d.vy - 20 * dt);
      const ny = d.y + d.vy * dt;
      if (SOLID[w.getBlock(Math.floor(d.x), Math.floor(ny), Math.floor(d.z))]) {
        d.y = Math.floor(ny) + 1;
        d.vy = 0;
        d.resting = true;
      } else d.y = ny;
      d.ver++;
    }
    for (const c of this.corpses) {
      if (this.game.now > c.despawnAt) {
        // Rust-style: leftovers fall out as a loot bag would; we drop them as items.
        for (const s of c.container.slots) if (s) this.dropItem(s, c.x, c.y + 0.5, c.z, 600);
        this.remove(c);
      } else if (!c.species && c.container.isEmpty()) {
        this.remove(c);
      }
    }
  }

  saveObjects() {
    const out: Array<{ id: number; kind: string; data: string }> = [];
    for (const c of this.corpses) {
      out.push({ id: c.id, kind: 'corpse', data: JSON.stringify({ name: c.name, x: c.x, y: c.y, z: c.z, ttl: c.despawnAt - this.game.now, slots: c.container.toJSON(), species: c.species, harvest: c.harvest, harvestHp: c.harvestHp }) });
    }
    return out;
  }

  loadCorpse(id: number, d: { name: string; x: number; y: number; z: number; ttl: number; slots: (ItemStack | null)[]; species?: string; harvest?: Array<[string, number]>; harvestHp?: number }) {
    const c = new Corpse(id, d.name, d.x, d.y, d.z, this.game.now + Math.max(30, d.ttl), d.species ?? '');
    c.container.load(d.slots);
    c.harvest = d.harvest ?? [];
    c.harvestHp = d.harvestHp ?? 0;
    this.add(c);
  }
}
