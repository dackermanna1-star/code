import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../src/shared/constants';
import { B, LIQUID, SOLID } from '../src/shared/world/blocks';
import { cidx } from '../src/shared/world/chunk';
import { WorldGenerator } from '../src/shared/world/worldgen';
import { buildPoi, POI_DEFS, type PoiInstance, type PoiKind } from '../src/shared/world/poi';

/**
 * Monument generation checks, for every POI kind (one real instance each,
 * found in a fixed-seed world):
 *  - determinism (re-generating a chunk gives identical bytes),
 *  - chunk-boundary consistency (stamped chunks == one unclipped builder run),
 *  - loot exists and every crate / barrel is reachable on foot from outside,
 *  - no floating structure.
 */

const SEED = 424242;
const gen = new WorldGenerator(SEED);
const KINDS = Object.keys(POI_DEFS) as PoiKind[];
const LOOT_IDS = new Set<number>([B.loot_crate, B.military_crate, B.barrel]);

function findPoi(g: WorldGenerator, kind: PoiKind): PoiInstance {
  let best: PoiInstance | null = null;
  let bestD = Infinity;
  for (let rz = -20; rz <= 20; rz++) for (let rx = -20; rx <= 20; rx++) {
    const p = g.pois.regionPoi(rx, rz);
    if (!p || p.def.kind !== kind) continue;
    const d = Math.hypot(p.cx, p.cz);
    if (d < bestD) { best = p; bestD = d; }
  }
  if (!best) throw new Error(`no ${kind} found near the origin`);
  return best;
}

/** Generated chunks around a POI, readable as one world. */
class Patch {
  readonly chunks = new Map<number, Uint8Array>();
  constructor(readonly p: PoiInstance, g: WorldGenerator, margin = 8) {
    const cx0 = Math.floor((p.x0 - margin) / CHUNK_SIZE), cx1 = Math.floor((p.x0 + p.def.w + margin) / CHUNK_SIZE);
    const cz0 = Math.floor((p.z0 - margin) / CHUNK_SIZE), cz1 = Math.floor((p.z0 + p.def.d + margin) / CHUNK_SIZE);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) this.chunks.set(this.key(cx, cz), g.generateChunk(cx, cz));
  }
  key(cx: number, cz: number) {
    return (cx + 32768) * 65536 + (cz + 32768);
  }
  get(x: number, y: number, z: number): number {
    if (y < 0) return B.bedrock;
    if (y >= WORLD_HEIGHT) return B.air;
    const c = this.chunks.get(this.key(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));
    if (!c) return B.stone;
    return c[cidx(((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE, y, ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE)];
  }
}

/** One unclipped builder run, recorded as world position -> block id (last write wins). */
function record(p: PoiInstance) {
  const writes = new Map<number, number>();
  const pos = new Map<number, [number, number, number]>();
  let outside = 0;
  buildPoi(p, (x, y, z, id) => {
    if (x < p.x0 || x >= p.x0 + p.def.w || z < p.z0 || z >= p.z0 + p.def.d || y < 1 || y >= WORLD_HEIGHT) { outside++; return; }
    const k = ((x - p.x0) * 64 + (z - p.z0)) * WORLD_HEIGHT + y;
    writes.set(k, id);
    pos.set(k, [x, y, z]);
  });
  return { writes, pos, outside };
}

const solidAt = (w: Patch, x: number, y: number, z: number) => SOLID[w.get(x, y, z)] === 1;

/**
 * Walkability BFS over feet positions: a cell is walkable if it and the cell
 * above are not solid and the cell below is solid. Moves go to the 4
 * neighbours at the same level, one level down (needs 3 free cells in the
 * destination column to step off) or one level up (a jump: needs the cell
 * 2 above the feet free in the origin column too). Starts on the skirt just
 * outside the footprint.
 */
function walkable(w: Patch, p: PoiInstance) {
  const M = 5;
  const bx0 = p.x0 - M, bz0 = p.z0 - M, bw = p.def.w + 2 * M, bd = p.def.d + 2 * M;
  const by0 = Math.max(2, p.y - 24), bh = Math.min(WORLD_HEIGHT - 4, p.y + p.def.h + 6) - by0;
  const idx = (x: number, y: number, z: number) => ((y - by0) * bd + (z - bz0)) * bw + (x - bx0);
  const inBox = (x: number, y: number, z: number) => x >= bx0 && x < bx0 + bw && z >= bz0 && z < bz0 + bd && y >= by0 && y < by0 + bh;
  const stand = (x: number, y: number, z: number) => inBox(x, y, z) && !solidAt(w, x, y, z) && !solidAt(w, x, y + 1, z) && solidAt(w, x, y - 1, z) && !LIQUID[w.get(x, y - 1, z)];
  const seen = new Uint8Array(bw * bd * bh);
  const queue: number[] = [];
  const push = (x: number, y: number, z: number) => {
    const i = idx(x, y, z);
    if (seen[i]) return;
    seen[i] = 1;
    queue.push(x, y, z);
  };
  // start ring: 3 blocks outside the footprint
  for (let z = p.z0 - 3; z < p.z0 + p.def.d + 3; z++) for (let x = p.x0 - 3; x < p.x0 + p.def.w + 3; x++) {
    if (x > p.x0 - 3 && x < p.x0 + p.def.w + 2 && z > p.z0 - 3 && z < p.z0 + p.def.d + 2) continue;
    for (let y = p.y - 4; y <= p.y + 5; y++) if (stand(x, y, z)) push(x, y, z);
  }
  for (let q = 0; q < queue.length; q += 3) {
    const x = queue[q], y = queue[q + 1], z = queue[q + 2];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (stand(nx, y, nz)) push(nx, y, nz);
      if (stand(nx, y + 1, nz) && !solidAt(w, x, y + 2, z)) push(nx, y + 1, nz);
      if (stand(nx, y - 1, nz) && !solidAt(w, nx, y + 1, nz)) push(nx, y - 1, nz);
    }
  }
  return { reached: (x: number, y: number, z: number) => inBox(x, y, z) && seen[idx(x, y, z)] === 1, count: queue.length / 3 };
}

/** 26-connected flood over non-air blocks from the box floor and sides; returns a membership test. */
function grounded(w: Patch, p: PoiInstance) {
  const bx0 = p.x0 - 1, bz0 = p.z0 - 1, bw = p.def.w + 2, bd = p.def.d + 2;
  const by0 = Math.max(1, p.y - 24), bh = Math.min(WORLD_HEIGHT, p.y + p.def.h + 4) - by0;
  const idx = (x: number, y: number, z: number) => ((y - by0) * bd + (z - bz0)) * bw + (x - bx0);
  const filled = (x: number, y: number, z: number) => {
    const id = w.get(x, y, z);
    return id !== B.air && !LIQUID[id];
  };
  const seen = new Uint8Array(bw * bd * bh);
  const queue: number[] = [];
  const push = (x: number, y: number, z: number) => {
    if (x < bx0 || x >= bx0 + bw || z < bz0 || z >= bz0 + bd || y < by0 || y >= by0 + bh) return;
    const i = idx(x, y, z);
    if (seen[i] || !filled(x, y, z)) return;
    seen[i] = 1;
    queue.push(x, y, z);
  };
  for (let z = bz0; z < bz0 + bd; z++) for (let x = bx0; x < bx0 + bw; x++) {
    push(x, by0, z);
    if (x === bx0 || x === bx0 + bw - 1 || z === bz0 || z === bz0 + bd - 1) for (let y = by0; y < by0 + bh; y++) push(x, y, z);
  }
  for (let q = 0; q < queue.length; q += 3) {
    const x = queue[q], y = queue[q + 1], z = queue[q + 2];
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dy || dz) push(x + dx, y + dy, z + dz);
  }
  return (x: number, y: number, z: number) => seen[idx(x, y, z)] === 1;
}

describe('POI definitions', () => {
  it('respect size, height and tier rules', () => {
    for (const def of Object.values(POI_DEFS)) {
      expect(def.w, def.kind).toBeLessThanOrEqual(48);
      expect(def.d, def.kind).toBeLessThanOrEqual(48);
      expect(def.h, def.kind).toBeLessThan(45);
      expect(def.weight, def.kind).toBeGreaterThan(0);
      if (def.tier === 'low') expect(def.radiation, def.kind).toBe(0);
    }
    expect(new Set(Object.values(POI_DEFS).map((d) => d.name)).size).toBe(KINDS.length);
  });
});

describe.each(KINDS)('POI %s', (kind) => {
  const p = findPoi(gen, kind);
  const patch = new Patch(p, gen);
  const rec = record(p);
  const lp = (x: number, y: number, z: number) => `(${x - p.x0}, ${y - p.y}, ${z - p.z0})`;

  it('builds quickly and only inside its footprint', () => {
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) buildPoi(p, () => undefined);
    const ms = (performance.now() - t0) / 5;
    expect(rec.outside).toBe(0);
    expect(ms).toBeLessThan(40);
  });

  it('is deterministic per chunk', () => {
    const cx = Math.floor(p.cx / CHUNK_SIZE), cz = Math.floor(p.cz / CHUNK_SIZE);
    const fresh = new WorldGenerator(SEED);
    const a = fresh.generateChunk(cx, cz);
    fresh.generateChunk(cx + 1, cz);
    const b = fresh.generateChunk(cx, cz);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(Buffer.from(a).equals(Buffer.from(patch.chunks.get(patch.key(cx, cz))!))).toBe(true);
  });

  it('stamps consistently across chunk boundaries', () => {
    let mismatches = 0;
    const examples: string[] = [];
    for (const [k, id] of rec.writes) {
      const [x, y, z] = rec.pos.get(k)!;
      const got = patch.get(x, y, z);
      if (got !== id) {
        mismatches++;
        if (examples.length < 5) examples.push(`${lp(x, y, z)} expected ${id} got ${got}`);
      }
    }
    expect(mismatches, examples.join('; ')).toBe(0);
  });

  it('has loot, all of it reachable on foot', () => {
    const loot: Array<[number, number, number, number]> = [];
    for (const [k, id] of rec.writes) if (LOOT_IDS.has(id)) loot.push([...rec.pos.get(k)!, id]);
    const crates = loot.filter((l) => l[3] !== B.barrel).length;
    const military = loot.filter((l) => l[3] === B.military_crate).length;
    expect(crates).toBeGreaterThanOrEqual(3);
    expect(loot.length - crates).toBeGreaterThanOrEqual(2);
    if (p.def.tier === 'high') expect(military).toBeGreaterThanOrEqual(2);
    const bfs = walkable(patch, p);
    const unreachable: string[] = [];
    for (const [x, y, z] of loot) {
      let ok = bfs.reached(x, y + 1, z);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let dy = -1; dy <= 1; dy++) ok ||= bfs.reached(x + dx, y + dy, z + dz);
      if (!ok) unreachable.push(lp(x, y, z));
    }
    expect(unreachable, `unreachable loot at ${unreachable.join(' ')}`).toEqual([]);
  });

  it('has no floating structure', () => {
    const isGrounded = grounded(patch, p);
    const floating: string[] = [];
    for (const [k, id] of rec.writes) {
      if (id === B.air || LIQUID[id]) continue;
      const [x, y, z] = rec.pos.get(k)!;
      if (!isGrounded(x, y, z)) floating.push(lp(x, y, z));
    }
    expect(floating.length, `floating blocks: ${floating.slice(0, 12).join(' ')}`).toBe(0);
  });
});
