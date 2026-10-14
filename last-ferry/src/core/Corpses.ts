// Bodies on the deck (DESIGN §4.1, §4.2): reanimation timers, the corpse
// barricade grid (max 3 bodies per 0.75 m cell, extras spill over), burning
// and ash, nails, shoves.
import type { DeathKind, ZombieKind } from '../config/ids';
import { TICK, TICK_RATE } from '../config/world';
import { BARRICADE, FIRE, REANIMATION } from '../config/rules';
import type { CorpseView } from './api';
import type { CorpseEndReason, GameEvents } from './events';
import type { Player } from './Player';
import type { World } from './World';

export class Corpse implements CorpseView {
  readonly id: number;
  readonly zombieId: number;
  readonly kind: ZombieKind;
  readonly look: number;
  x: number;
  z: number;
  facing: number;
  readonly deathKind: DeathKind;
  risesAt: number | null = null;
  twitching = false;
  burning = 0;
  ash = false;
  nails = 0;
  removed = false;

  // ---- logic internals
  /** Grid cell index (-1 when not in the grid). */
  cell = -1;
  /** Nails that hit it while it was down (3 pin it). */
  pinNails = 0;
  burnBy: Player | null = null;
  /** The body of a risen crawler / boss (never rises). */
  readonly risen: boolean;
  readonly boss: boolean;

  constructor(id: number, src: { id: number; kind: ZombieKind; look: number; facing: number; risen: boolean; isBoss: boolean }, deathKind: DeathKind, x: number, z: number) {
    this.id = id;
    this.zombieId = src.id;
    this.kind = src.kind;
    this.look = src.look;
    this.facing = src.facing;
    this.risen = src.risen;
    this.boss = src.isBoss;
    this.deathKind = deathKind;
    this.x = x;
    this.z = z;
  }

  /** Still on the deck as an obstacle. */
  get solid(): boolean {
    return !this.removed && !this.ash;
  }

  /** A downed body that will get up unless something is done about it. */
  get downed(): boolean {
    return this.risesAt !== null && !this.removed;
  }
}

/** Grid extent (a little beyond the deck so spills and shoves stay inside). */
const MIN_X = -34;
const MAX_X = 25;
const MIN_Z = -6.75;
const MAX_Z = 6.75;
/** Bodies stay on the planks (the near/far railings stop them, mostly). */
const PIER_HALF = 5.95;

export class CorpseField {
  readonly list: Corpse[] = [];
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: Corpse[][];

  constructor(private world: World) {
    this.cols = Math.ceil((MAX_X - MIN_X) / BARRICADE.cell);
    this.rows = Math.ceil((MAX_Z - MIN_Z) / BARRICADE.cell);
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }

  private col(x: number): number {
    return Math.max(0, Math.min(this.cols - 1, Math.floor((x - MIN_X) / BARRICADE.cell)));
  }
  private row(z: number): number {
    return Math.max(0, Math.min(this.rows - 1, Math.floor((z - MIN_Z) / BARRICADE.cell)));
  }

  /** Bodies in a cell (debug / tests). */
  pileAt(x: number, z: number): number {
    return this.cells[this.row(z) * this.cols + this.col(x)].length;
  }

  /**
   * Put a body on the deck at (x, z). A full cell (3 bodies) spills it to the
   * nearest neighbour cell with room. Returns the final position.
   */
  place(c: Corpse, x: number, z: number): void {
    if (c.cell >= 0) this.unlink(c);
    x = Math.max(MIN_X + 0.1, Math.min(MAX_X - 0.1, x));
    z = Math.max(-PIER_HALF, Math.min(PIER_HALF, z));
    let cc = this.col(x);
    let rr = this.row(z);
    if (this.cells[rr * this.cols + cc].length >= BARRICADE.perCell) {
      const spot = this.findRoom(cc, rr, x, z);
      if (spot) {
        const dc = spot[0] - cc;
        const dr = spot[1] - rr;
        cc = spot[0];
        rr = spot[1];
        x += dc * BARRICADE.cell;
        z += dr * BARRICADE.cell;
        // Keep the body inside its new cell.
        const x0 = MIN_X + cc * BARRICADE.cell;
        const z0 = MIN_Z + rr * BARRICADE.cell;
        x = Math.max(x0 + 0.05, Math.min(x0 + BARRICADE.cell - 0.05, x));
        z = Math.max(z0 + 0.05, Math.min(z0 + BARRICADE.cell - 0.05, z));
      }
    }
    c.x = x;
    c.z = z;
    c.cell = rr * this.cols + cc;
    this.cells[c.cell].push(c);
  }

  private findRoom(cc: number, rr: number, x: number, z: number): [number, number] | null {
    for (let ring = 1; ring <= 3; ring++) {
      let best: [number, number] | null = null;
      let bd = Infinity;
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const c = cc + dc;
          const r = rr + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          const zc = MIN_Z + (r + 0.5) * BARRICADE.cell;
          if (Math.abs(zc) > PIER_HALF) continue;
          if (this.cells[r * this.cols + c].length >= BARRICADE.perCell) continue;
          const xc = MIN_X + (c + 0.5) * BARRICADE.cell;
          // Prefer spilling along the lane (x) over across lanes.
          const d = Math.hypot(xc - x, (zc - z) * 1.6);
          if (d < bd) {
            bd = d;
            best = [c, r];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  private unlink(c: Corpse): void {
    const cell = this.cells[c.cell];
    const i = cell.indexOf(c);
    if (i >= 0) cell.splice(i, 1);
    c.cell = -1;
  }

  add(c: Corpse, x: number, z: number): void {
    this.list.push(c);
    this.place(c, x, z);
  }

  /** Take a body off the deck for good. */
  remove(c: Corpse, reason: CorpseEndReason | null): void {
    if (c.removed) return;
    c.removed = true;
    c.risesAt = null;
    c.twitching = false;
    if (c.cell >= 0) this.unlink(c);
    if (reason) this.world.events.emit('corpseGone', { corpseId: c.id, reason });
  }

  /** Move a body (explosion shove, horn …). Past the pier's edge it falls into the sea. */
  shove(c: Corpse, dx: number, dz: number): void {
    if (c.removed) return;
    const nx = c.x + dx;
    const nz = c.z + dz;
    if (Math.abs(nz) > BARRICADE.seaZ) {
      c.x = nx;
      c.z = nz;
      this.remove(c, 'sea');
      return;
    }
    this.place(c, nx, nz);
    this.world.events.emit('corpseShoved', { corpseId: c.id, x: c.x, z: c.z });
  }

  /** Make a downed body permanent. */
  makePermanent(c: Corpse, reason: GameEvents['corpsePermanent']['reason']): void {
    if (c.risesAt === null || c.removed) return;
    c.risesAt = null;
    c.twitching = false;
    this.world.events.emit('corpsePermanent', { corpseId: c.id, reason });
  }

  ignite(c: Corpse, by: Player | null): void {
    if (!c.solid || c.burning > 0) return;
    c.burning = FIRE.corpseAshSeconds;
    c.burnBy = by;
    this.world.events.emit('ignite', { zombieId: null, corpseId: c.id, x: c.x, z: c.z });
    this.makePermanent(c, 'burned');
  }

  /** Solid bodies within the rectangle |dx| <= rx, |dz| <= rz. */
  forEachIn(x: number, z: number, rx: number, rz: number, fn: (c: Corpse) => void): void {
    const c0 = this.col(x - rx);
    const c1 = this.col(x + rx);
    const r0 = this.row(z - rz);
    const r1 = this.row(z + rz);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = this.cells[r * this.cols + c];
        for (let i = 0; i < cell.length; i++) {
          const k = cell[i];
          if (Math.abs(k.x - x) <= rx && Math.abs(k.z - z) <= rz) fn(k);
        }
      }
    }
  }

  /** Solid bodies within radius r (ground plane). */
  forEachNear(x: number, z: number, r: number, fn: (c: Corpse, d: number) => void): void {
    this.forEachIn(x, z, r, r, (c) => {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d <= r) fn(c, d);
    });
  }

  /** Bodies within `ahead` m in front of x (toward +x) in the lane at z. */
  countAhead(x: number, z: number, ahead = BARRICADE.ahead, laneHalf = BARRICADE.laneHalf): number {
    const c0 = this.col(x);
    const c1 = this.col(x + ahead);
    const r0 = this.row(z - laneHalf);
    const r1 = this.row(z + laneHalf);
    let n = 0;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = this.cells[r * this.cols + c];
        for (let i = 0; i < cell.length; i++) {
          const k = cell[i];
          const dx = k.x - x;
          if (dx >= -0.1 && dx <= ahead && Math.abs(k.z - z) <= laneHalf) n++;
        }
      }
    }
    return n;
  }

  /** Reanimation timers, burning, fire spread, ash. */
  tick(): void {
    const w = this.world;
    const now = w.tick;
    const twitch = Math.round(REANIMATION.twitchSeconds * TICK_RATE);
    const pSpread = 1 - Math.pow(1 - FIRE.corpsePerSecond, TICK);
    const pToZombie = 1 - Math.pow(1 - FIRE.corpseToZombiePerSecond, TICK);
    let dirty = false;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (c.removed) {
        dirty = true;
        continue;
      }
      if (c.burning > 0) {
        c.burning = Math.max(0, c.burning - TICK);
        // Fire runs through the pile and catches anything walking over it.
        this.forEachNear(c.x, c.z, FIRE.corpseRadius, (o) => {
          if (o !== c && o.burning <= 0 && !o.ash && w.rng.chance(pSpread)) this.ignite(o, c.burnBy);
        });
        w.forEachZombieNear(c.x, c.z, FIRE.corpseToZombieRadius, (zb) => {
          if (zb.alive && zb.burning <= 0 && w.rng.chance(pToZombie)) zb.ignite(c.burnBy);
        });
        if (c.burning <= 0) {
          c.ash = true;
          this.remove(c, 'ash');
          dirty = true;
        }
        continue;
      }
      if (c.risesAt !== null) {
        if (!c.twitching && now >= c.risesAt - twitch) {
          c.twitching = true;
          w.events.emit('corpseTwitch', { corpseId: c.id });
        }
        if (now >= c.risesAt) {
          w.riseCorpse(c);
          dirty = true;
        }
      }
    }
    if (dirty) this.compact();
  }

  /** Drop removed bodies from the list. */
  compact(): void {
    let j = 0;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (!c.removed) this.list[j++] = c;
    }
    this.list.length = j;
  }

  get solidCount(): number {
    let n = 0;
    for (const c of this.list) if (c.solid) n++;
    return n;
  }
}
