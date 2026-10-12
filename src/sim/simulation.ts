// MaterialSimulation: the cellular automaton that makes the world "the game".
//
// Update pipeline per tick (60 Hz):
//   1. external edits (spells, explosions, potions) already touched their regions via VoxelWorld.set
//   2. active chunk regions are promoted (cells changed last tick ±1)
//   3. per cell, bottom-up: burning -> thermal -> kind-specific motion (powder / liquid / gas / fire) -> reactions
//   4. every change re-touches its neighbourhood (keeps the region awake) and marks meshes dirty
// Regions with nothing left to do fall asleep automatically, so resting pools and piles cost nothing.
import { CHUNK } from '../config';
import { FastRng } from '../core/rng';
import { Chunk } from '../world/chunk';
import { VoxelWorld } from '../world/world';
import {
  AIR, KIND, Kind, DENSITY, FLOW, MOVE_CHANCE, SLIDE, LIFE_DECAY, LIFETIME, CONDENSE_INTO, CONDENSE_CHANCE,
  FLAMMABILITY, BURN_HP, BURN_DECAY, BURN_PRODUCT, BURN_PRODUCT_CHANCE, BURN_GAS, EXPLODE_ON_BURNOUT, EXTINGUISHES,
  BASE_TEMP, HEAT_SOURCE, CONDUCTIVITY, MELT_TEMP, MELT_PRODUCT, BOIL_TEMP, BOIL_PRODUCT, FREEZE_TEMP, FREEZE_PRODUCT,
  IGNITION_TEMP, FIRE, SMOKE, STEAM, WATER, UNLOADED, SOLID_COLLIDE, ELECTRIC, LAVA, FLAMGAS,
} from '../world/materials';
import { REACT, REACTIVE, RA, RB, RPROB, REACTIONS, CORRODES, CORRODE_CONSUME, canCorrode } from './reactions';

const BURNING = 0x80;
const HP_MASK = 0x7f;

const DIR4X = [1, -1, 0, 0];
const DIR4Z = [0, 0, 1, -1];
const DIR8X = [1, -1, 0, 0, 1, 1, -1, -1];
const DIR8Z = [0, 0, 1, -1, 1, -1, 1, -1];
const N6X = [1, -1, 0, 0, 0, 0];
const N6Y = [0, 0, 1, -1, 0, 0];
const N6Z = [0, 0, 0, 0, 1, -1];

export interface SimEvents {
  explosion: (x: number, y: number, z: number, radius: number, kind: 'gunpowder') => void;
  reaction: (x: number, y: number, z: number, type: string) => void;
  ignite: (x: number, y: number, z: number) => void;
}

export interface SimStats {
  tickMs: number;
  activeChunks: number;
  cellsVisited: number;
  cellsMoved: number;
  reactions: number;
  ignitions: number;
  deferredChunks: number;
}

export class MaterialSimulation {
  readonly world: VoxelWorld;
  rng = new FastRng(0xc0ffee);
  events: Partial<SimEvents> = {};
  stats: SimStats = { tickMs: 0, activeChunks: 0, cellsVisited: 0, cellsMoved: 0, reactions: 0, ignitions: 0, deferredChunks: 0 };
  /** Wall-clock budget per tick; chunks beyond the budget are deferred to the next tick. */
  budgetMs = 9;
  /** Focus point for prioritising chunks when over budget. */
  focusX = 0;
  focusY = 0;
  focusZ = 0;
  private stampVal = 1;
  private list: Chunk[] = [];
  /** Ambient temperature offset (°C) for the region being simulated (cold biomes). */
  ambient = 20;

  constructor(world: VoxelWorld) {
    this.world = world;
  }

  // ------------------------------------------------------------------ public helpers used by gameplay systems
  ignite(x: number, y: number, z: number, force = false): boolean {
    const w = this.world;
    const m = w.get(x, y, z);
    if (m === AIR || m === UNLOADED) return false;
    const f = FLAMMABILITY[m];
    if (f <= 0) return false;
    const c = w.chunkAt(x, y, z)!;
    const i = ((y & 15) << 8) | ((z & 15) << 4) | (x & 15);
    const aux = c.ensureAux();
    if (aux[i] & BURNING) return false;
    if (!force && this.rng.f() > f) return false;
    aux[i] = BURNING | Math.max(1, BURN_HP[m]);
    c.version++;
    w.markMesh(c, x & 15, y & 15, z & 15);
    w.touchChunkLocal(c, x & 15, y & 15, z & 15);
    this.stats.ignitions++;
    this.events.ignite?.(x, y, z);
    return true;
  }

  isBurning(x: number, y: number, z: number): boolean {
    return (this.world.getAux(x, y, z) & BURNING) !== 0;
  }

  extinguish(x: number, y: number, z: number): void {
    const c = this.world.chunkAt(x, y, z);
    if (!c || !c.aux) return;
    const i = ((y & 15) << 8) | ((z & 15) << 4) | (x & 15);
    if (c.aux[i] & BURNING) {
      c.aux[i] = 0;
      this.world.markMesh(c, x & 15, y & 15, z & 15);
      this.world.touchChunkLocal(c, x & 15, y & 15, z & 15);
    }
  }

  /** Add heat (°C) to a voxel and wake it. Negative = cooling (freeze charge). */
  heat(x: number, y: number, z: number, dT: number): void {
    const m = this.world.get(x, y, z);
    if (m === AIR || m === UNLOADED) return;
    const k = KIND[m];
    if (k === Kind.GAS || k === Kind.FIRE) return;
    this.world.addTemp(x, y, z, dT);
  }

  temperatureAt(x: number, y: number, z: number): number {
    const m = this.world.get(x, y, z);
    return BASE_TEMP[m] + this.world.getTemp(x, y, z);
  }

  // ------------------------------------------------------------------ main loop
  step(): void {
    const t0 = performance.now();
    const w = this.world;
    w.tick++;
    this.stampVal = (w.tick % 255) + 1;
    const st = this.stats;
    st.cellsVisited = st.cellsMoved = st.reactions = st.ignitions = st.deferredChunks = 0;

    const list = this.list;
    list.length = 0;
    for (const c of w.activeSet) {
      if (c.hasNext()) {
        c.promote();
        list.push(c);
      } else {
        w.activeSet.delete(c);
        c.inActiveList = false;
      }
    }
    st.activeChunks = list.length;
    // nearest chunks first so that the player's surroundings always update when over budget
    const fx = this.focusX / CHUNK, fy = this.focusY / CHUNK, fz = this.focusZ / CHUNK;
    if (list.length > 1) {
      list.sort((a, b) => {
        const da = (a.cx + 0.5 - fx) ** 2 + (a.cy + 0.5 - fy) ** 2 + (a.cz + 0.5 - fz) ** 2;
        const db = (b.cx + 0.5 - fx) ** 2 + (b.cy + 0.5 - fy) ** 2 + (b.cz + 0.5 - fz) ** 2;
        return da - db;
      });
    }
    for (let n = 0; n < list.length; n++) {
      const c = list[n];
      if (n > 4 && performance.now() - t0 > this.budgetMs) {
        // defer: carry this chunk's region over to the next tick
        for (let k = n; k < list.length; k++) {
          const d = list[k];
          d.nextMinX = Math.min(d.nextMinX, d.curMinX);
          d.nextMinY = Math.min(d.nextMinY, d.curMinY);
          d.nextMinZ = Math.min(d.nextMinZ, d.curMinZ);
          d.nextMaxX = Math.max(d.nextMaxX, d.curMaxX);
          d.nextMaxY = Math.max(d.nextMaxY, d.curMaxY);
          d.nextMaxZ = Math.max(d.nextMaxZ, d.curMaxZ);
          if (!d.inActiveList) {
            d.inActiveList = true;
            w.activeSet.add(d);
          }
          st.deferredChunks++;
        }
        break;
      }
      if (c.mat) this.processChunk(c);
    }
    st.tickMs = performance.now() - t0;
  }

  private processChunk(c: Chunk): void {
    if (this.world.chunks[c.key] !== c) return; // unloaded meanwhile
    if (!c.stamp) c.stamp = new Uint8Array(4096);
    const stamp = c.stamp;
    const sv = this.stampVal;
    const mat = c.mat;
    const flipX = (this.world.tick & 1) === 1;
    const flipZ = (this.world.tick & 2) === 2;
    const x0 = c.curMinX, x1 = c.curMaxX, z0 = c.curMinZ, z1 = c.curMaxZ;
    for (let ly = c.curMinY; ly <= c.curMaxY; ly++) {
      for (let zi = z0; zi <= z1; zi++) {
        const lz = flipZ ? z1 - (zi - z0) : zi;
        for (let xi = x0; xi <= x1; xi++) {
          const lx = flipX ? x1 - (xi - x0) : xi;
          const i = (ly << 8) | (lz << 4) | lx;
          const m = mat[i];
          if (stamp[i] === sv) continue;
          const aux = c.aux ? c.aux[i] : 0;
          const hasTemp = c.temp !== null && c.temp[i] !== 0;
          if (m === AIR) {
            if (hasTemp) c.temp![i] = 0;
            continue;
          }
          this.stats.cellsVisited++;
          const x = c.ox + lx, y = c.oy + ly, z = c.oz + lz;
          if (aux & BURNING) {
            if (this.updateBurning(c, i, x, y, z, m, aux)) continue; // cell changed/consumed
          }
          if (hasTemp || HEAT_SOURCE[m]) {
            if (this.updateThermal(c, i, x, y, z, m)) continue;
          }
          const k = KIND[m];
          switch (k) {
            case Kind.POWDER:
              this.updatePowder(c, i, x, y, z, m);
              break;
            case Kind.LIQUID:
              this.updateLiquid(c, i, x, y, z, m);
              break;
            case Kind.GAS:
              this.updateGas(c, i, x, y, z, m);
              break;
            case Kind.FIRE:
              this.updateFire(c, i, x, y, z, m);
              break;
            default:
              break;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ cell primitives
  /** Swap the cell at (c,i) with world cell (nx,ny,nz). Moves material, aux and temperature. */
  private swapTo(c: Chunk, i: number, x: number, y: number, z: number, nx: number, ny: number, nz: number): void {
    const w = this.world;
    const c2 = w.chunkAt(nx, ny, nz);
    if (!c2) return;
    const i2 = ((ny & 15) << 8) | ((nz & 15) << 4) | (nx & 15);
    const m1 = c.mat[i];
    c.mat[i] = c2.mat[i2];
    c2.mat[i2] = m1;
    const a1 = c.aux ? c.aux[i] : 0;
    const a2 = c2.aux ? c2.aux[i2] : 0;
    if (a1 | a2) {
      c.ensureAux()[i] = a2;
      c2.ensureAux()[i2] = a1;
    }
    const t1 = c.temp ? c.temp[i] : 0;
    const t2 = c2.temp ? c2.temp[i2] : 0;
    if (t1 | t2) {
      c.ensureTemp()[i] = t2;
      c2.ensureTemp()[i2] = t1;
    }
    if (!c2.stamp) c2.stamp = new Uint8Array(4096);
    c2.stamp[i2] = this.stampVal;
    c.stamp![i] = this.stampVal;
    c.modified = c2.modified = true;
    c.version++;
    if (c2 !== c) c2.version++;
    const lx = x & 15, ly = y & 15, lz = z & 15;
    w.markMesh(c, lx, ly, lz);
    w.touchChunkLocal(c, lx, ly, lz);
    w.markMesh(c2, nx & 15, ny & 15, nz & 15);
    w.touchChunkLocal(c2, nx & 15, ny & 15, nz & 15);
    this.stats.cellsMoved++;
  }

  /** Replace a cell's material (resetting aux/temperature unless keepTemp). */
  private setCell(c: Chunk, i: number, x: number, y: number, z: number, m: number, keepTemp = false): void {
    const old = c.mat[i];
    c.mat[i] = m;
    if (c.aux) c.aux[i] = LIFETIME[m];
    else if (LIFETIME[m]) c.ensureAux()[i] = LIFETIME[m];
    if (c.temp) {
      if (keepTemp) {
        // conserve absolute temperature across the transition
        const T = BASE_TEMP[old] + c.temp[i];
        const d = T - BASE_TEMP[m];
        c.temp[i] = d > 3000 ? 3000 : d < -400 ? -400 : d;
      } else c.temp[i] = 0;
    }
    if (c.stamp) c.stamp[i] = this.stampVal;
    c.modified = true;
    c.version++;
    const lx = x & 15, ly = y & 15, lz = z & 15;
    this.world.markMesh(c, lx, ly, lz);
    this.world.touchChunkLocal(c, lx, ly, lz);
  }

  /** Set a world cell (neighbour) */
  private setWorld(x: number, y: number, z: number, m: number, keepTemp = false): void {
    const c = this.world.chunkAt(x, y, z);
    if (!c) return;
    this.setCell(c, ((y & 15) << 8) | ((z & 15) << 4) | (x & 15), x, y, z, m, keepTemp);
  }

  private keepAwake(c: Chunk, x: number, y: number, z: number): void {
    this.world.touchChunkLocal(c, x & 15, y & 15, z & 15);
  }

  /** Can material m (moving) enter a cell containing t? */
  private canEnter(m: number, t: number, downward: boolean): boolean {
    if (t === AIR) return true;
    if (t === UNLOADED) return false;
    const kt = KIND[t];
    if (kt === Kind.GAS || kt === Kind.FIRE) return KIND[m] !== Kind.GAS && KIND[m] !== Kind.FIRE;
    if (downward && kt === Kind.LIQUID && KIND[m] !== Kind.GAS) return DENSITY[t] < DENSITY[m];
    return false;
  }

  // ------------------------------------------------------------------ powders
  private updatePowder(c: Chunk, i: number, x: number, y: number, z: number, m: number): void {
    const w = this.world;
    const below = w.get(x, y - 1, z);
    if (below === AIR || KIND[below] === Kind.GAS || KIND[below] === Kind.FIRE) {
      // fall up to two cells per tick
      const b2 = w.get(x, y - 2, z);
      if (b2 === AIR) this.swapTo(c, i, x, y, z, x, y - 2, z);
      else this.swapTo(c, i, x, y, z, x, y - 1, z);
      return;
    }
    if (KIND[below] === Kind.LIQUID && DENSITY[below] < DENSITY[m]) {
      if (this.rng.f() < 0.35) this.swapTo(c, i, x, y, z, x, y - 1, z);
      else this.keepAwake(c, x, y, z);
      return;
    }
    // slide diagonally (angle of repose)
    const start = this.rng.int(4);
    let possible = false;
    for (let k = 0; k < 4; k++) {
      const d = (start + k) & 3;
      const nx = x + DIR4X[d], nz = z + DIR4Z[d];
      const side = w.get(nx, y, nz);
      if (SOLID_COLLIDE[side] || side === UNLOADED) continue;
      const diag = w.get(nx, y - 1, nz);
      if (!this.canEnter(m, diag, true)) continue;
      possible = true;
      if (this.rng.f() < SLIDE[m]) {
        this.swapTo(c, i, x, y, z, nx, y - 1, nz);
        return;
      }
    }
    if (possible) this.keepAwake(c, x, y, z);
  }

  // ------------------------------------------------------------------ liquids
  private updateLiquid(c: Chunk, i: number, x: number, y: number, z: number, m: number): void {
    const w = this.world;
    const rng = this.rng;
    if (REACTIVE[m] && this.react(c, i, x, y, z, m)) return;
    const below = w.get(x, y - 1, z);
    const mc = MOVE_CHANCE[m];
    if (mc < 1 && rng.f() > mc) {
      // viscous: stay awake only if a move would be possible
      if (this.canEnter(m, below, true) || this.couldSpread(m, x, y, z)) this.keepAwake(c, x, y, z);
      return;
    }
    // 1. fall
    if (below === AIR || KIND[below] === Kind.GAS || KIND[below] === Kind.FIRE) {
      const b2 = w.get(x, y - 2, z);
      if (b2 === AIR && m !== LAVA) this.swapTo(c, i, x, y, z, x, y - 2, z);
      else this.swapTo(c, i, x, y, z, x, y - 1, z);
      return;
    }
    if (KIND[below] === Kind.LIQUID && below !== m && DENSITY[below] < DENSITY[m]) {
      // sink through lighter liquid
      if (rng.f() < 0.5) this.swapTo(c, i, x, y, z, x, y - 1, z);
      else this.keepAwake(c, x, y, z);
      return;
    }
    // 2. diagonal down
    const start = rng.int(4);
    for (let k = 0; k < 4; k++) {
      const d = (start + k) & 3;
      const nx = x + DIR4X[d], nz = z + DIR4Z[d];
      const side = w.get(nx, y, nz);
      if (SOLID_COLLIDE[side] || side === UNLOADED) continue;
      const diag = w.get(nx, y - 1, nz);
      if (diag === AIR || KIND[diag] === Kind.GAS) {
        this.swapTo(c, i, x, y, z, nx, y - 1, nz);
        return;
      }
    }
    // 3. horizontal flow: towards a spot where it can descend, or outward when pressured from above
    const above = w.get(x, y + 1, z);
    const pressured = KIND[above] === Kind.LIQUID;
    const F = FLOW[m];
    const d0 = rng.int(8);
    for (let k = 0; k < 8; k++) {
      const d = (d0 + k) & 7;
      const dx = DIR8X[d], dz = DIR8Z[d];
      let lastFree = 0;
      for (let s = 1; s <= F; s++) {
        const tx = x + dx * s, tz = z + dz * s;
        const t = w.get(tx, y, tz);
        if (!(t === AIR || KIND[t] === Kind.GAS)) break;
        lastFree = s;
        const tb = w.get(tx, y - 1, tz);
        if (tb === AIR || KIND[tb] === Kind.GAS) {
          this.swapTo(c, i, x, y, z, tx, y, tz);
          return;
        }
      }
      if (pressured && lastFree > 0) {
        const s = Math.max(1, Math.min(lastFree, 2 + rng.int(F)));
        this.swapTo(c, i, x, y, z, x + dx * s, y, z + dz * s);
        return;
      }
      if (k >= 3 && !pressured) break; // limit search cost when resting
    }
  }

  private couldSpread(m: number, x: number, y: number, z: number): boolean {
    const w = this.world;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIR4X[d], nz = z + DIR4Z[d];
      const t = w.get(nx, y, nz);
      if (t === AIR || KIND[t] === Kind.GAS) {
        const tb = w.get(nx, y - 1, nz);
        if (tb === AIR || KIND[tb] === Kind.GAS || KIND[w.get(x, y + 1, z)] === Kind.LIQUID) return true;
      }
    }
    void m;
    return false;
  }

  // ------------------------------------------------------------------ gases
  private updateGas(c: Chunk, i: number, x: number, y: number, z: number, m: number): void {
    const w = this.world;
    const rng = this.rng;
    const aux = c.aux ? c.aux[i] : 0;
    const persistent = (aux & HP_MASK) === 0; // generated pockets: dormant until disturbed
    if (!persistent && LIFE_DECAY[m] > 0 && rng.f() < LIFE_DECAY[m]) {
      const life = (aux & HP_MASK) - 1;
      if (life <= 0) {
        const cond = CONDENSE_INTO[m];
        this.setCell(c, i, x, y, z, cond && rng.f() < CONDENSE_CHANCE[m] ? cond : AIR);
        return;
      }
      c.aux![i] = (aux & BURNING) | life;
    }
    if (REACTIVE[m] && this.react(c, i, x, y, z, m)) return;
    if (m === STEAM && rng.f() < 0.004) {
      // condensation on cold solid surfaces
      const d = rng.int(6);
      const n = w.get(x + N6X[d], y + N6Y[d], z + N6Z[d]);
      if (KIND[n] === Kind.SOLID && n !== UNLOADED && w.getTemp(x + N6X[d], y + N6Y[d], z + N6Z[d]) < 60) {
        this.setCell(c, i, x, y, z, WATER);
        return;
      }
    }
    // rise
    const up = w.get(x, y + 1, z);
    const drift = rng.f() < 0.25;
    if (!drift || persistent) {
      if (up === AIR && rng.f() < 0.8) {
        this.swapTo(c, i, x, y, z, x, y + 1, z);
        return;
      }
      if ((KIND[up] === Kind.GAS && DENSITY[up] > DENSITY[m] && up !== m) || (KIND[up] === Kind.LIQUID && rng.f() < 0.3)) {
        this.swapTo(c, i, x, y, z, x, y + 1, z);
        return;
      }
      // diagonal up
      const s = rng.int(4);
      for (let k = 0; k < 4; k++) {
        const d = (s + k) & 3;
        const nx = x + DIR4X[d], nz = z + DIR4Z[d];
        if (w.get(nx, y + 1, nz) === AIR && w.get(nx, y, nz) === AIR) {
          this.swapTo(c, i, x, y, z, nx, y + 1, nz);
          return;
        }
      }
    }
    if (!persistent) {
      const d = rng.int(4);
      const nx = x + DIR4X[d], nz = z + DIR4Z[d];
      if (w.get(nx, y, nz) === AIR) {
        this.swapTo(c, i, x, y, z, nx, y, nz);
        return;
      }
      this.keepAwake(c, x, y, z); // lifetime still ticking
    }
  }

  // ------------------------------------------------------------------ fire cells
  private updateFire(c: Chunk, i: number, x: number, y: number, z: number, m: number): void {
    const w = this.world;
    const rng = this.rng;
    let life = c.aux ? c.aux[i] : 0;
    life -= 1 + (rng.f() < 0.3 ? 1 : 0);
    if (life <= 0) {
      this.setCell(c, i, x, y, z, rng.f() < 0.25 ? SMOKE : AIR);
      return;
    }
    c.ensureAux()[i] = life;
    // interact with a random neighbour
    const d = rng.int(6);
    const nx = x + N6X[d], ny = y + N6Y[d], nz = z + N6Z[d];
    const n = w.get(nx, ny, nz);
    if (n !== AIR && n !== UNLOADED) {
      const r = REACT[m * 256 + n];
      if (r >= 0 && rng.f() < RPROB[r]) {
        this.applyReaction(c, i, x, y, z, nx, ny, nz, r);
        return;
      }
      if (EXTINGUISHES[n]) {
        this.setCell(c, i, x, y, z, rng.f() < 0.5 ? STEAM : AIR);
        return;
      }
      if (FLAMMABILITY[n] > 0 && rng.f() < FLAMMABILITY[n]) this.ignite(nx, ny, nz, true);
      else if (rng.f() < 0.25) this.heat(nx, ny, nz, 25);
    }
    // flicker upward
    if (rng.f() < 0.45) {
      const up = w.get(x, y + 1, z);
      if (up === AIR) {
        this.swapTo(c, i, x, y, z, x, y + 1, z);
        return;
      }
      const s = rng.int(4);
      const sx = x + DIR4X[s], sz = z + DIR4Z[s];
      if (w.get(sx, y + 1, sz) === AIR) {
        this.swapTo(c, i, x, y, z, sx, y + 1, sz);
        return;
      }
    }
    this.keepAwake(c, x, y, z);
  }

  // ------------------------------------------------------------------ burning materials
  /** Returns true if the cell was consumed/changed. */
  private updateBurning(c: Chunk, i: number, x: number, y: number, z: number, m: number, aux: number): boolean {
    const w = this.world;
    const rng = this.rng;
    if (FLAMMABILITY[m] <= 0) {
      c.aux![i] = 0;
      return false;
    }
    // scan neighbours: water-like liquids put it out; with no air around it is smothered
    if (KIND[m] !== Kind.GAS) {
      let open = false;
      for (let k = 0; k < 6; k++) {
        const ox = x + N6X[k], oy = y + N6Y[k], oz = z + N6Z[k];
        const o = w.get(ox, oy, oz);
        if (EXTINGUISHES[o]) {
          c.aux![i] = 0;
          if (rng.f() < 0.15) this.setWorld(ox, oy, oz, STEAM);
          this.keepAwake(c, x, y, z);
          w.markMesh(c, x & 15, y & 15, z & 15);
          this.events.reaction?.(x, y, z, 'hiss');
          return false;
        }
        if (o === AIR || o === FIRE || o === FLAMGAS) open = true;
      }
      if (!open && rng.f() < 0.1) {
        c.aux![i] = 0;
        w.markMesh(c, x & 15, y & 15, z & 15);
        return false;
      }
    }
    const d = rng.int(6);
    const nx = x + N6X[d], ny = y + N6Y[d], nz = z + N6Z[d];
    const n = w.get(nx, ny, nz);
    // spread to neighbour
    if (n !== AIR && n !== UNLOADED && FLAMMABILITY[n] > 0 && rng.f() < FLAMMABILITY[n] * 0.6) this.ignite(nx, ny, nz, true);
    else if (n !== AIR && rng.f() < 0.3) this.heat(nx, ny, nz, 30);
    // emit flames / smoke into open air (prefer upward)
    if (KIND[m] !== Kind.GAS) {
      const r = rng.f();
      const ex = r < 0.5 ? x : x + DIR4X[rng.int(4)];
      const ez = r < 0.5 ? z : z + DIR4Z[rng.int(4)];
      const ey = r < 0.5 ? y + 1 : y;
      if (w.get(ex, ey, ez) === AIR && rng.f() < 0.35) this.setWorld(ex, ey, ez, rng.f() < 0.06 ? BURN_GAS[m] : FIRE);
    }
    // consume
    let hp = aux & HP_MASK;
    if (rng.f() < BURN_DECAY[m]) {
      hp--;
      if (hp <= 0) {
        const er = EXPLODE_ON_BURNOUT[m];
        const prod = rng.f() < BURN_PRODUCT_CHANCE[m] ? BURN_PRODUCT[m] : AIR;
        this.setCell(c, i, x, y, z, prod);
        if (er > 0) this.events.explosion?.(x + 0.5, y + 0.5, z + 0.5, er, 'gunpowder');
        else if (prod === AIR && w.get(x, y + 1, z) === AIR && rng.f() < 0.3) this.setWorld(x, y + 1, z, SMOKE);
        return true;
      }
    }
    c.aux![i] = BURNING | hp;
    this.keepAwake(c, x, y, z);
    return false;
  }

  // ------------------------------------------------------------------ thermal
  /** Returns true if the cell changed material. */
  private updateThermal(c: Chunk, i: number, x: number, y: number, z: number, m: number): boolean {
    const w = this.world;
    const rng = this.rng;
    if (HEAT_SOURCE[m]) {
      // push heat into one random neighbour; occasionally keep resting sources awake
      const d = rng.int(6);
      const nx = x + N6X[d], ny = y + N6Y[d], nz = z + N6Z[d];
      const n = w.get(nx, ny, nz);
      if (n !== AIR && n !== UNLOADED && KIND[n] !== Kind.GAS && KIND[n] !== Kind.FIRE && !HEAT_SOURCE[n]) {
        const Tn = BASE_TEMP[n] + w.getTemp(nx, ny, nz);
        const dT = (BASE_TEMP[m] - Tn) * 0.06 * CONDUCTIVITY[n];
        if (dT > 1 || dT < -1) w.addTemp(nx, ny, nz, dT);
        if (FLAMMABILITY[n] > 0 && rng.f() < FLAMMABILITY[n] * 0.5) this.ignite(nx, ny, nz, true);
      }
      if (rng.f() < 0.03) this.keepAwake(c, x, y, z);
      return false;
    }
    const temp = c.temp!;
    let t = temp[i];
    // conduct with a random neighbour
    const d = rng.int(6);
    const nx = x + N6X[d], ny = y + N6Y[d], nz = z + N6Z[d];
    const n = w.get(nx, ny, nz);
    if (n !== AIR && n !== UNLOADED && KIND[n] !== Kind.GAS && KIND[n] !== Kind.FIRE && !HEAT_SOURCE[n]) {
      const Tself = BASE_TEMP[m] + t;
      const Tn = BASE_TEMP[n] + w.getTemp(nx, ny, nz);
      const k = 0.2 * Math.min(CONDUCTIVITY[m], CONDUCTIVITY[n]);
      const flow = (Tself - Tn) * k;
      if (flow > 1 || flow < -1) {
        t -= flow;
        w.addTemp(nx, ny, nz, flow);
      }
    }
    // relax towards natural temperature
    t -= t * 0.006 + (t > 0 ? 0.2 : -0.2);
    const T = BASE_TEMP[m] + t;
    // state transitions (temperature conserved)
    let prod = -1;
    if (T >= MELT_TEMP[m]) prod = MELT_PRODUCT[m];
    else if (T >= BOIL_TEMP[m]) prod = BOIL_PRODUCT[m];
    else if (T <= FREEZE_TEMP[m]) prod = FREEZE_PRODUCT[m];
    if (prod >= 0) {
      temp[i] = t;
      this.setCell(c, i, x, y, z, prod, true);
      this.events.reaction?.(x, y, z, T > 50 ? 'hiss' : 'freeze');
      return true;
    }
    if (T >= IGNITION_TEMP[m] && FLAMMABILITY[m] > 0 && !((c.aux ? c.aux[i] : 0) & BURNING)) this.ignite(x, y, z, true);
    if (t > -2 && t < 2) t = 0;
    temp[i] = t;
    if (t !== 0) this.keepAwake(c, x, y, z);
    return false;
  }

  // ------------------------------------------------------------------ reactions
  /** Inspect neighbours for a reaction partner. Returns true if this cell changed. */
  private react(c: Chunk, i: number, x: number, y: number, z: number, m: number): boolean {
    const w = this.world;
    const rng = this.rng;
    let found = false;
    const s = rng.int(6);
    for (let k = 0; k < 6; k++) {
      const d = (s + k) % 6;
      const nx = x + N6X[d], ny = y + N6Y[d], nz = z + N6Z[d];
      const n = w.get(nx, ny, nz);
      if (n === UNLOADED) continue;
      const r = REACT[m * 256 + n];
      if (r >= 0) {
        found = true;
        if (rng.f() < RPROB[r]) {
          this.applyReaction(c, i, x, y, z, nx, ny, nz, r);
          return c.mat[i] !== m;
        }
      } else if (CORRODES[m] && canCorrode(n)) {
        found = true;
        if (rng.f() < 0.12) {
          this.setWorld(nx, ny, nz, rng.f() < 0.35 ? FLAMGAS : AIR); // [acid] + [corrodible] -> flammable gas
          this.stats.reactions++;
          this.events.reaction?.(nx, ny, nz, 'corrode');
          if (rng.f() < CORRODE_CONSUME) {
            this.setCell(c, i, x, y, z, AIR);
            return true;
          }
          return false;
        }
      }
    }
    if (found) this.keepAwake(c, x, y, z);
    return false;
  }

  private applyReaction(c: Chunk, i: number, x: number, y: number, z: number, nx: number, ny: number, nz: number, r: number): void {
    const a = RA[r], b = RB[r];
    if (c.mat[i] !== a) this.setCell(c, i, x, y, z, a, false);
    const n = this.world.get(nx, ny, nz);
    if (n !== b) this.setWorld(nx, ny, nz, b, false);
    this.stats.reactions++;
    const ev = REACTIONS[r].event;
    if (ev) this.events.reaction?.(x, y, z, ev);
  }

  // ------------------------------------------------------------------ electricity
  /**
   * Flood-fill electric charge through connected conductive voxels from a seed point.
   * Returns the set of electrified cells (packed keys) for entity damage and visuals.
   */
  electrify(x: number, y: number, z: number, maxCells = 2500): number[] {
    const w = this.world;
    const out: number[] = [];
    const seen = new Set<number>();
    const pack = (a: number, b: number, d: number) => (b * 256 + d) * 256 + a;
    const q: number[] = [];
    // seed: the voxel itself or any conductive neighbour
    for (let d = -1; d < 6; d++) {
      const sx = d < 0 ? x : x + N6X[d], sy = d < 0 ? y : y + N6Y[d], sz = d < 0 ? z : z + N6Z[d];
      if (ELECTRIC[w.get(sx, sy, sz)]) {
        const key = pack(sx, sy, sz);
        if (!seen.has(key)) {
          seen.add(key);
          q.push(sx, sy, sz);
        }
      }
    }
    let h = 0;
    while (h < q.length && out.length < maxCells) {
      const cx = q[h++], cy = q[h++], cz = q[h++];
      out.push(pack(cx, cy, cz));
      for (let d = 0; d < 6; d++) {
        const nx = cx + N6X[d], ny = cy + N6Y[d], nz = cz + N6Z[d];
        if (nx < 0 || ny < 0 || nz < 0 || nx > 255 || nz > 255) continue;
        const key = pack(nx, ny, nz);
        if (seen.has(key)) continue;
        seen.add(key);
        if (ELECTRIC[w.get(nx, ny, nz)]) q.push(nx, ny, nz);
      }
    }
    return out;
  }
}

export function unpackCell(key: number): [number, number, number] {
  const x = key % 256;
  const r = Math.floor(key / 256);
  const z = r % 256;
  const y = Math.floor(r / 256);
  return [x, y, z];
}
