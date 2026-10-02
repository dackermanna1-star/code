/**
 * Determinism: chunks are pure functions of (seed, cx, cz) — identical when regenerated, across
 * generator instances, and independent of the order in which neighbouring chunks are generated
 * (all generators keep internal caches, so this also checks that caching never changes results).
 */
import { describe, expect, it } from 'vitest';
import { createGenerator } from '../src/world/gen/index';
import type { DimensionId } from '../src/world/gen/generator';
import { chunkDiff } from './worldgen.helpers';

const CASES: [DimensionId, number, number, number][] = [
  // dimension, seed, centre chunk x, z
  ['overworld', 123, 30, -25], // jungle near the coast (trees crossing borders)
  ['overworld', 123, -9, -6], // old growth taiga / mountains (mega spruces, caves)
  ['overworld', 7, 0, 0],
  ['overworld', -42, 1874990, -1874990], // near the 30M-block world border (cache keys must not collide)
  ['nether', 123, -6, -9], // crimson forest (huge fungi, glowstone)
  ['end', 123, 2, -1], // obsidian spikes + crystals
  ['end', 123, 70, 70], // outer islands
];

describe('worldgen determinism', () => {
  for (const [dim, seed, ccx, ccz] of CASES) {
    it(`${dim} seed ${seed} @${ccx},${ccz}: same chunk twice is identical`, () => {
      const g = createGenerator(dim, seed);
      const a = g.generate(ccx, ccz);
      g.generate(ccx + 5, ccz - 3); // disturb caches
      const b = g.generate(ccx, ccz);
      expect(chunkDiff(a, b)).toBeNull();
      const c = createGenerator(dim, seed).generate(ccx, ccz);
      expect(chunkDiff(a, c)).toBeNull();
    });

    it(`${dim} seed ${seed} @${ccx},${ccz}: 3x3 area is independent of generation order`, () => {
      const coords: [number, number][] = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) coords.push([ccx + dx, ccz + dz]);
      const forward = createGenerator(dim, seed);
      const A = coords.map(([x, z]) => forward.generate(x, z));
      const backward = createGenerator(dim, seed);
      const B = [...coords].reverse().map(([x, z]) => backward.generate(x, z)).reverse();
      // every chunk from a fresh generator (empty caches)
      const C = coords.map(([x, z]) => createGenerator(dim, seed).generate(x, z));
      // a scrambled order on one generator, after visiting far-away chunks
      const scrambled = createGenerator(dim, seed);
      scrambled.generate(ccx + 40, ccz + 40);
      const order = [4, 0, 8, 2, 6, 1, 7, 3, 5];
      const D: any[] = new Array(9);
      for (const i of order) D[i] = scrambled.generate(coords[i][0], coords[i][1]);
      for (let i = 0; i < 9; i++) {
        expect(chunkDiff(A[i], B[i]), `chunk ${coords[i]} forward vs backward`).toBeNull();
        expect(chunkDiff(A[i], C[i]), `chunk ${coords[i]} forward vs fresh`).toBeNull();
        expect(chunkDiff(A[i], D[i]), `chunk ${coords[i]} forward vs scrambled`).toBeNull();
      }
    });
  }

  it('different seeds give different terrain', () => {
    const a = createGenerator('overworld', 1).generate(0, 0);
    const b = createGenerator('overworld', 2).generate(0, 0);
    expect(chunkDiff(a, b)).not.toBeNull();
  });

  it('output arrays have the contract shapes', () => {
    for (const dim of ['overworld', 'nether', 'end'] as DimensionId[]) {
      const ch = createGenerator(dim, 5).generate(1, 2);
      expect(ch.cx).toBe(1);
      expect(ch.cz).toBe(2);
      expect(ch.blocks.length).toBe(16);
      for (const s of ch.blocks) if (s) expect(s.length).toBe(4096);
      expect(ch.biomes.length).toBe(256);
      expect(ch.heightmap.length).toBe(256);
      expect(ch.grassColor.length).toBe(256);
      expect(ch.foliageColor.length).toBe(256);
      expect(ch.waterColor.length).toBe(256);
      // every section owns its own buffer (transferable)
      const bufs = new Set(ch.blocks.filter(Boolean).map((s) => s!.buffer));
      expect(bufs.size).toBe(ch.blocks.filter(Boolean).length);
    }
  });
});
