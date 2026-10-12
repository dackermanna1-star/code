// TerrainDestructionSystem: explosions and digging that genuinely remove voxels.
//
// Explosions follow Noita's model: a blast has a radius, a durability gate (max_durability_to_destroy)
// and a ray energy budget that is spent on the hardness of every voxel along the straight line from the
// centre. We evaluate this in O(volume) with a precomputed "ray tree": offsets sorted by distance, each
// pointing to its parent one step closer to the centre, so cost(v) = cost(parent) + hardness(parent).
import { VoxelWorld } from '../world/world';
import {
  AIR, KIND, Kind, HARDNESS, DURABILITY, POWDER_FORM, FLAMMABILITY, GUNPOWDER, FIRE, SMOKE, UNLOADED, MATERIALS,
  BEDROCK, TEMPLEBRICK, DENSITY,
} from '../world/materials';
import { MaterialSimulation } from './simulation';
import { FastRng } from '../core/rng';

const MAX_R = 34;

interface RayTree {
  dx: Int8Array;
  dy: Int8Array;
  dz: Int8Array;
  dist: Float32Array;
  parent: Int32Array;
  count: number;
}

let tree: RayTree | null = null;

function buildTree(): RayTree {
  const offs: [number, number, number, number][] = [];
  for (let z = -MAX_R; z <= MAX_R; z++)
    for (let y = -MAX_R; y <= MAX_R; y++)
      for (let x = -MAX_R; x <= MAX_R; x++) {
        const d = Math.sqrt(x * x + y * y + z * z);
        if (d <= MAX_R + 0.5) offs.push([x, y, z, d]);
      }
  offs.sort((a, b) => a[3] - b[3]);
  const n = offs.length;
  const t: RayTree = {
    dx: new Int8Array(n), dy: new Int8Array(n), dz: new Int8Array(n), dist: new Float32Array(n), parent: new Int32Array(n), count: n,
  };
  const index = new Map<number, number>();
  const key = (x: number, y: number, z: number) => ((x + 64) * 128 + (y + 64)) * 128 + (z + 64);
  for (let i = 0; i < n; i++) {
    const [x, y, z, d] = offs[i];
    t.dx[i] = x;
    t.dy[i] = y;
    t.dz[i] = z;
    t.dist[i] = d;
    index.set(key(x, y, z), i);
    if (i === 0) {
      t.parent[i] = -1;
      continue;
    }
    // parent: one voxel step back towards the centre along the ray
    const s = Math.max(0, d - 1) / d;
    const px = Math.round(x * s), py = Math.round(y * s), pz = Math.round(z * s);
    let p = index.get(key(px, py, pz));
    if (p === undefined || p >= i) p = 0;
    t.parent[i] = p;
  }
  return t;
}

export interface ExplosionOpts {
  radius: number;
  durability: number;
  rayEnergy: number;
  fire?: boolean;
  powderEdge?: boolean;
  /** Fraction of destroyed solid voxels that become visible debris particles. */
  debris?: number;
  /** Throw liquids/powders as flying material particles instead of deleting them. */
  launch?: boolean;
}

export interface DestructionCallbacks {
  /** A voxel of material m was destroyed at (x,y,z) (for gold drops, holy brick anger, debris visuals). */
  destroyed?: (m: number, x: number, y: number, z: number) => void;
  /** Launch a voxel of material m as a flying particle that re-settles when it lands. */
  launch?: (m: number, aux: number, x: number, y: number, z: number, vx: number, vy: number, vz: number) => void;
  debris?: (m: number, x: number, y: number, z: number, vx: number, vy: number, vz: number) => void;
}

export interface ExplosionReport {
  destroyed: number;
  launched: number;
  ignited: number;
  holy: number;
  gold: number;
}

export class TerrainDestructionSystem {
  private cost = new Float32Array(1);
  private rng = new FastRng(0xb00b5);
  cb: DestructionCallbacks = {};

  constructor(private world: VoxelWorld, private sim: MaterialSimulation) {}

  explode(cx: number, cy: number, cz: number, o: ExplosionOpts): ExplosionReport {
    if (!tree) tree = buildTree();
    const t = tree;
    const r = Math.min(MAX_R, Math.max(0.5, o.radius));
    const w = this.world;
    const rng = this.rng;
    const rep: ExplosionReport = { destroyed: 0, launched: 0, ignited: 0, holy: 0, gold: 0 };
    if (this.cost.length < t.count) this.cost = new Float32Array(t.count);
    const cost = this.cost;
    const ox = Math.floor(cx), oy = Math.floor(cy), oz = Math.floor(cz);
    const E = o.rayEnergy;
    const debrisP = o.debris ?? 0.06;
    let n = 0;
    while (n < t.count && t.dist[n] <= r + 0.25) n++;
    // collect changes first so a ray's cost uses the original materials
    const removals: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = ox + t.dx[i], y = oy + t.dy[i], z = oz + t.dz[i];
      const m = w.get(x, y, z);
      let c: number;
      if (i === 0) c = 0;
      else {
        const p = t.parent[i];
        const pm = w.get(ox + t.dx[p], oy + t.dy[p], oz + t.dz[p]);
        const ph = DURABILITY[pm] > o.durability ? Infinity : KIND[pm] === Kind.LIQUID ? 0.6 : HARDNESS[pm];
        c = cost[p] + ph;
      }
      cost[i] = c;
      if (m === AIR || m === UNLOADED) continue;
      const remaining = E - c;
      if (remaining <= 0) continue;
      const k = KIND[m];
      const falloff = 1 - t.dist[i] / (r + 0.5);
      if (k === Kind.GAS || k === Kind.FIRE) continue;
      if (k === Kind.LIQUID) {
        if (o.launch !== false && rng.f() < 0.85) removals.push(i, 1);
        continue;
      }
      if (DURABILITY[m] > o.durability) continue;
      if (m === GUNPOWDER) {
        if (this.sim.ignite(x, y, z, true)) rep.ignited++;
        continue;
      }
      if (remaining >= HARDNESS[m]) {
        removals.push(i, k === Kind.POWDER && o.launch !== false && rng.f() < 0.5 * falloff + 0.2 ? 1 : 0);
      } else if (o.powderEdge && POWDER_FORM[m]) {
        removals.push(i, 2);
      } else if (o.fire && FLAMMABILITY[m] > 0 && rng.f() < 0.6) {
        if (this.sim.ignite(x, y, z, true)) rep.ignited++;
      }
    }
    // apply
    for (let j = 0; j < removals.length; j += 2) {
      const i = removals[j];
      const mode = removals[j + 1];
      const x = ox + t.dx[i], y = oy + t.dy[i], z = oz + t.dz[i];
      const m = w.get(x, y, z);
      if (m === AIR || m === BEDROCK || m === UNLOADED) continue;
      const d = t.dist[i];
      const falloff = 1 - d / (r + 0.5);
      const inv = d > 0.01 ? 1 / d : 0;
      const dirx = t.dx[i] * inv, diry = t.dy[i] * inv + 0.35, dirz = t.dz[i] * inv;
      const sp = 18 + 50 * falloff * Math.min(1.5, r / 8);
      if (mode === 2) {
        w.set(x, y, z, POWDER_FORM[m]);
        continue;
      }
      if (MATERIALS[m].holy) rep.holy++;
      if (MATERIALS[m].goldValue) rep.gold++;
      if (mode === 1) {
        const aux = w.getAux(x, y, z);
        w.set(x, y, z, AIR);
        this.cb.launch?.(m, aux, x + 0.5, y + 0.5, z + 0.5, dirx * sp * (0.6 + rng.f() * 0.6), diry * sp * (0.6 + rng.f() * 0.6), dirz * sp * (0.6 + rng.f() * 0.6));
        rep.launched++;
      } else {
        w.set(x, y, z, AIR);
        rep.destroyed++;
        if (rng.f() < debrisP) this.cb.debris?.(m, x + 0.5, y + 0.5, z + 0.5, dirx * sp, diry * sp, dirz * sp);
      }
      this.cb.destroyed?.(m, x, y, z);
    }
    // fire, smoke and heat in the blast volume
    const fireR = r * (o.fire ? 0.9 : 0.5);
    for (let i = 0; i < n; i++) {
      if (t.dist[i] > fireR) break;
      const x = ox + t.dx[i], y = oy + t.dy[i], z = oz + t.dz[i];
      const m = w.get(x, y, z);
      if (m === AIR) {
        const roll = rng.f();
        if (o.fire && roll < 0.22) w.set(x, y, z, FIRE);
        else if (roll < (o.fire ? 0.27 : 0.06) && E - cost[i] > 0) w.set(x, y, z, SMOKE);
      } else if (FLAMMABILITY[m] > 0 && rng.f() < (o.fire ? 0.5 : 0.12)) {
        if (this.sim.ignite(x, y, z, true)) rep.ignited++;
      } else if (o.fire && KIND[m] !== Kind.GAS && rng.f() < 0.2) {
        this.sim.heat(x, y, z, 120);
      }
    }
    const rr = Math.ceil(r) + 2;
    w.touchBox(ox - rr, oy - rr, oz - rr, ox + rr, oy + rr, oz + rr);
    return rep;
  }

  /**
   * Dig a sphere: removes solids/powders up to `durability` (Chainsaw, Digging Bolt, Luminous Drill).
   * Returns the number of voxels removed.
   */
  dig(cx: number, cy: number, cz: number, radius: number, durability: number, opts: { launchPowder?: boolean } = {}): number {
    const w = this.world;
    const r = radius;
    const r2 = r * r;
    let removed = 0;
    const x0 = Math.floor(cx - r), x1 = Math.floor(cx + r);
    const y0 = Math.floor(cy - r), y1 = Math.floor(cy + r);
    const z0 = Math.floor(cz - r), z1 = Math.floor(cz + r);
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dz = z + 0.5 - cz;
          if (dx * dx + dy * dy + dz * dz > r2) continue;
          const m = w.get(x, y, z);
          if (m === AIR || m === UNLOADED || m === BEDROCK) continue;
          const k = KIND[m];
          if (k !== Kind.SOLID && k !== Kind.POWDER) continue;
          if (DURABILITY[m] > durability) continue;
          w.set(x, y, z, AIR);
          removed++;
          this.cb.destroyed?.(m, x, y, z);
          if (opts.launchPowder !== false && this.rng.f() < 0.08) this.cb.debris?.(m, x + 0.5, y + 0.5, z + 0.5, dx * 6, 6 + dy * 6, dz * 6);
        }
    return removed;
  }

  /** Delete every solid in a sphere regardless of durability (Black Hole). Keeps liquids/gases. */
  eat(cx: number, cy: number, cz: number, radius: number): number {
    const w = this.world;
    let n = 0;
    const r2 = radius * radius;
    for (let y = Math.floor(cy - radius); y <= Math.floor(cy + radius); y++)
      for (let z = Math.floor(cz - radius); z <= Math.floor(cz + radius); z++)
        for (let x = Math.floor(cx - radius); x <= Math.floor(cx + radius); x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dz = z + 0.5 - cz;
          if (dx * dx + dy * dy + dz * dz > r2) continue;
          const m = w.get(x, y, z);
          if (m === AIR || m === UNLOADED || m === BEDROCK) continue;
          const k = KIND[m];
          if (k !== Kind.SOLID && k !== Kind.POWDER) continue;
          w.set(x, y, z, AIR);
          this.cb.destroyed?.(m, x, y, z);
          n++;
        }
    return n;
  }

  /** Place material into open cells of a sphere (spells, potions, debug brush). */
  fill(cx: number, cy: number, cz: number, radius: number, m: number, replaceAll = false): number {
    const w = this.world;
    let n = 0;
    const r2 = radius * radius;
    for (let y = Math.floor(cy - radius); y <= Math.floor(cy + radius); y++)
      for (let z = Math.floor(cz - radius); z <= Math.floor(cz + radius); z++)
        for (let x = Math.floor(cx - radius); x <= Math.floor(cx + radius); x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dz = z + 0.5 - cz;
          if (dx * dx + dy * dy + dz * dz > r2) continue;
          const cur = w.get(x, y, z);
          if (cur === UNLOADED || cur === BEDROCK || cur === TEMPLEBRICK) continue;
          if (!replaceAll && cur !== AIR && KIND[cur] !== Kind.GAS) continue;
          w.set(x, y, z, m);
          n++;
        }
    return n;
  }
}

export { DENSITY };
