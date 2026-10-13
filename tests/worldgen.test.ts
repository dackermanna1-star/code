import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT } from '../src/shared/constants';
import { mulberry32, seedFromString } from '../src/shared/math';
import { isStuck, newMoveState } from '../src/shared/sim/movement';
import { B, blockDef, LIQUID, SOLID } from '../src/shared/world/blocks';
import { Biome } from '../src/shared/world/biomes';
import { Chunk, VoxelWorld, cidx } from '../src/shared/world/chunk';
import { WorldGenerator } from '../src/shared/world/worldgen';
import { firstDiff } from './helpers';

const SEED = seedFromString('qa-worldgen');

/** Generate a rectangle of chunks into a VoxelWorld (air outside). */
function region(gen: WorldGenerator, cx0: number, cz0: number, w: number, d: number): VoxelWorld {
  const world = new VoxelWorld(0);
  for (let cz = cz0; cz < cz0 + d; cz++) for (let cx = cx0; cx < cx0 + w; cx++) world.addChunk(new Chunk(cx, cz, gen.generateChunk(cx, cz)));
  return world;
}

/** First grid point (deterministic scan) satisfying `pred`. */
function find(gen: WorldGenerator, pred: (x: number, z: number) => boolean, step = 48, range = 2400): [number, number] {
  for (let r = 0; r <= range; r += step) {
    for (let z = -r; z <= r; z += step) for (let x = -r; x <= r; x += step) {
      if (Math.max(Math.abs(x), Math.abs(z)) !== r) continue;
      if (pred(x, z)) return [x, z];
    }
  }
  throw new Error('no matching location found');
}

const isLog = (id: number) => blockDef(id).tree === 'log';
const isLeaf = (id: number) => blockDef(id).tree === 'leaves';

describe('world generation: determinism', () => {
  it('the same seed produces byte-identical chunks (fresh generators, any order)', () => {
    const coords: Array<[number, number]> = [[0, 0], [1, 0], [-7, 3], [40, -22], [-100, -100]];
    const a = new WorldGenerator(SEED);
    const first = coords.map(([cx, cz]) => a.generateChunk(cx, cz));
    const b = new WorldGenerator(SEED);
    const second = [...coords].reverse().map(([cx, cz]) => b.generateChunk(cx, cz)).reverse();
    for (let i = 0; i < coords.length; i++) expect(firstDiff(first[i], second[i])).toBe(-1);
    // regenerating with the same (cached) generator is also stable
    expect(firstDiff(a.generateChunk(0, 0), first[0])).toBe(-1);
  });

  it('a different seed produces different terrain', () => {
    const a = new WorldGenerator(SEED).generateChunk(3, 3);
    const b = new WorldGenerator(SEED + 1).generateChunk(3, 3);
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
    expect(diff).toBeGreaterThan(1000);
  });

  it('string seeds hash deterministically', () => {
    expect(seedFromString('corrode')).toBe(seedFromString('corrode'));
    expect(seedFromString('corrode')).not.toBe(seedFromString('corrodf'));
  });
});

describe('world generation: invariants', () => {
  const gen = new WorldGenerator(SEED);

  it('y=0 is bedrock in every column and nothing generates above the build limit', () => {
    for (const [cx, cz] of [[0, 0], [12, -5], [-30, 30]]) {
      const c = new Chunk(cx, cz, gen.generateChunk(cx, cz));
      for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
        expect(c.get(x, 0, z)).toBe(B.bedrock);
        expect(c.topSolid(x, z)).toBeLessThan(WORLD_HEIGHT - 1);
      }
    }
  });

  it('oceans are filled with water up to sea level and never above it', () => {
    const [ox, oz] = find(gen, (x, z) => {
      for (const [dx, dz] of [[0, 0], [16, 0], [0, 16], [16, 16]]) {
        const c = gen.column(x + dx, z + dz);
        if (c.biome !== Biome.Ocean || c.height > SEA_LEVEL - 6) return false;
      }
      return true;
    });
    const cx = Math.floor(ox / CHUNK_SIZE), cz = Math.floor(oz / CHUNK_SIZE);
    let checked = 0;
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const data = gen.generateChunk(cx + dx, cz + dz);
      for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
        const h = gen.column((cx + dx) * CHUNK_SIZE + x, (cz + dz) * CHUNK_SIZE + z).height;
        if (h >= SEA_LEVEL) continue;
        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          const id = data[cidx(x, y, z)];
          // water (or ice on top in the cold); never an air pocket under the sea surface
          expect(id === B.water || (id === B.ice && y === SEA_LEVEL) || SOLID[id] === 1).toBe(true);
        }
        expect(LIQUID[data[cidx(x, SEA_LEVEL + 1, z)]]).toBe(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('beach spawns stand on dry land above sea level with room for the player', () => {
    for (let s = 0; s < 12; s++) {
      const g = new WorldGenerator(seedFromString(`spawn-${s}`));
      const sp = g.findBeachSpawn(mulberry32(s), 600);
      expect(sp.y).toBeGreaterThan(SEA_LEVEL);
      const cx = Math.floor(sp.x / CHUNK_SIZE), cz = Math.floor(sp.z / CHUNK_SIZE);
      const world = new VoxelWorld(0);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) world.addChunk(new Chunk(cx + dx, cz + dz, g.generateChunk(cx + dx, cz + dz)));
      const fx = Math.floor(sp.x), fz = Math.floor(sp.z);
      const below = world.getBlock(fx, sp.y - 1, fz);
      expect(SOLID[below], `seed ${s}: block under spawn is ${blockDef(below).key}`).toBe(1);
      expect(LIQUID[world.getBlock(fx, sp.y, fz)]).toBe(0);
      expect(isStuck(world, newMoveState(sp.x, sp.y, sp.z))).toBe(false);
      const col = g.column(fx, fz);
      expect(col.height).toBeGreaterThanOrEqual(SEA_LEVEL);
      expect(col.poi).toBe(false);
    }
  });

  it('ore blocks only appear embedded in terrain (never floating in air or water)', () => {
    const world = region(gen, -2, -2, 4, 4);
    let ores = 0;
    for (let cz = -2; cz < 2; cz++) for (let cx = -2; cx < 2; cx++) {
      const c = world.getChunk(cx, cz)!;
      for (let y = 1; y < WORLD_HEIGHT - 1; y++) for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = c.blocks[cidx(x, y, z)];
        if (id !== B.metal_ore && id !== B.sulfur_ore && id !== B.rich_ore) continue;
        ores++;
        const wx = cx * CHUNK_SIZE + x, wz = cz * CHUNK_SIZE + z;
        // at least one solid neighbour (veins replace stone; boulders sit on the ground)
        let solidNbr = 0;
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) solidNbr += SOLID[world.getBlock(wx + dx, y + dy, wz + dz)];
        expect(solidNbr).toBeGreaterThan(0);
      }
    }
    expect(ores).toBeGreaterThan(20);
  });
});

describe('world generation: trees across chunk borders', () => {
  const gen = new WorldGenerator(seedFromString('qa-trees'));
  // A forest area well away from any point of interest.
  const [fx, fz] = find(gen, (x, z) => {
    if (gen.pois.poisNear(x, z, 200).some((p) => Math.hypot(p.cx - x, p.cz - z) < 160)) return false;
    for (const [dx, dz] of [[0, 0], [-24, -24], [24, -24], [-24, 24], [24, 24]]) if (gen.column(x + dx, z + dz).biome !== Biome.Forest) return false;
    return true;
  }, 64);
  const cx0 = Math.floor(fx / CHUNK_SIZE) - 2, cz0 = Math.floor(fz / CHUNK_SIZE) - 2;
  const world = region(gen, cx0, cz0, 4, 4);
  const inner = (x: number, z: number) => x >= (cx0 + 1) * CHUNK_SIZE && x < (cx0 + 3) * CHUNK_SIZE && z >= (cz0 + 1) * CHUNK_SIZE && z < (cz0 + 3) * CHUNK_SIZE;
  const chunkOf = (x: number, z: number) => `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;

  // trunk tops in the inner 2x2 chunks (their canopies lie entirely inside the 4x4 region)
  const tops: Array<[number, number, number]> = [];
  for (let z = (cz0 + 1) * CHUNK_SIZE; z < (cz0 + 3) * CHUNK_SIZE; z++) for (let x = (cx0 + 1) * CHUNK_SIZE; x < (cx0 + 3) * CHUNK_SIZE; x++) {
    for (let y = SEA_LEVEL; y < WORLD_HEIGHT - 1; y++) {
      if (isLog(world.getBlock(x, y, z)) && !isLog(world.getBlock(x, y + 1, z))) tops.push([x, y, z]);
    }
  }

  it('the forest sample actually contains trees whose canopy crosses a chunk border', () => {
    expect(tops.length).toBeGreaterThan(10);
    const crossing = tops.filter(([x, , z]) => [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dz]) => chunkOf(x + dx, z + dz) !== chunkOf(x, z)));
    expect(crossing.length).toBeGreaterThan(2);
  });

  it('every trunk top has a complete leaf cap, including the cells in the neighbouring chunk', () => {
    let crossChecked = 0;
    for (const [x, y, z] of tops) {
      expect(isLeaf(world.getBlock(x, y + 1, z)), `leaf above trunk at ${x},${y},${z}`).toBe(true);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const id = world.getBlock(x + dx, y, z + dz);
        expect(isLeaf(id) || isLog(id), `canopy at ${x + dx},${y},${z + dz} (trunk ${x},${y},${z}) is ${blockDef(id).key}`).toBe(true);
        if (chunkOf(x + dx, z + dz) !== chunkOf(x, z)) crossChecked++;
      }
    }
    expect(crossChecked).toBeGreaterThan(0);
  });

  it('no orphan canopies: every leaf block has a trunk of its tree within reach', () => {
    let leaves = 0;
    for (let z = (cz0 + 1) * CHUNK_SIZE; z < (cz0 + 3) * CHUNK_SIZE; z++) for (let x = (cx0 + 1) * CHUNK_SIZE; x < (cx0 + 3) * CHUNK_SIZE; x++) {
      for (let y = SEA_LEVEL; y < WORLD_HEIGHT - 1; y++) {
        if (!isLeaf(world.getBlock(x, y, z))) continue;
        leaves++;
        let trunk = false;
        for (let dy = -2; dy <= 0 && !trunk; dy++) for (let dz = -2; dz <= 2 && !trunk; dz++) for (let dx = -2; dx <= 2 && !trunk; dx++) {
          if (isLog(world.getBlock(x + dx, y + dy, z + dz))) trunk = true;
        }
        expect(trunk, `orphan leaf at ${x},${y},${z}`).toBe(true);
      }
    }
    expect(leaves).toBeGreaterThan(200);
    expect(inner(fx, fz)).toBe(true);
  });

  it('trunks stand on soil (dirt under the base log)', () => {
    for (const [x, yTop, z] of tops) {
      let y = yTop;
      while (isLog(world.getBlock(x, y - 1, z))) y--;
      const ground = world.getBlock(x, y - 1, z);
      expect([B.dirt, B.grass], `ground under trunk ${x},${y},${z} is ${blockDef(ground).key}`).toContain(ground);
    }
  });
});

describe('world generation: performance', () => {
  it('generates 50 chunks well within budget', () => {
    const gen = new WorldGenerator(seedFromString('qa-perf'));
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) gen.generateChunk((i % 10) - 5, Math.floor(i / 10) - 2);
    const ms = performance.now() - t0;
    // ~10-20 ms per chunk on a dev machine; the generous bound only catches pathological regressions
    expect(ms).toBeLessThan(15000);
    expect(ms / 50).toBeLessThan(300);
  });
});
