/**
 * Generated structures: determinism, piece boxes, search radius, stronghold portal room and the
 * block-entity contract.
 */
import { describe, expect, it } from 'vitest';
import { createGenerator } from '../src/world/gen/index';
import { locateStronghold } from '../src/world/gen/locate';
import { ChunkWriter } from '../src/world/gen/common/writer';
import { BLOCKS } from '../src/world/blocks/registry';
import { regionCandidate } from '../src/world/gen/structures/placement';
import type { StructureStart } from '../src/world/gen/structures/types';
import { chunkDiff, GenWorld } from './worldgen.helpers';

/** Writer that accepts every position and records the bounds of all writes. */
class BoundsWriter extends ChunkWriter {
  writes: [number, number, number][] = [];
  override inside(): boolean { return true; }
  override intersects(): boolean { return true; }
  override get(): number { return 0; }
  override set(x: number, y: number, z: number): void { this.writes.push([x, y, z]); }
  override blockEntity(x: number, y: number, z: number): void { this.writes.push([x, y, z]); }
  override entity(): void {}
}

function gen(seed: number): any {
  return createGenerator('overworld', seed);
}
const typeOf = (g: any, id: string) => g.structures.types.find((t: any) => t.id === id);

function starts(g: any, id: string, n: number): StructureStart[] {
  const t = typeOf(g, id);
  const out: StructureStart[] = [];
  for (let r = 0; r < 12 && out.length < n; r++)
    for (let rz = -r; rz <= r && out.length < n; rz++)
      for (let rx = -r; rx <= r && out.length < n; rx++) {
        if (Math.max(Math.abs(rx), Math.abs(rz)) !== r) continue;
        const c = regionCandidate(g.seed, t.placement, rx, rz);
        const s = c && g.structures.startAt(t, c[0], c[1]);
        if (s) out.push(s);
      }
  return out;
}

function checkBoxes(g: any, s: StructureStart, reach: number) {
  for (const p of s.pieces) {
    const w = new BoundsWriter();
    p.place(w, g.structures.ctx);
    const b = p.box;
    for (const [x, y, z] of w.writes) {
      if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY || z < b.minZ || z > b.maxZ)
        throw new Error(`${s.type} piece ${(p as any).kind ?? p.constructor.name} wrote ${x},${y},${z} outside ${JSON.stringify(b)}`);
    }
    expect(Math.floor(b.minX / 16)).toBeGreaterThanOrEqual(s.chunkX - reach);
    expect(Math.floor(b.maxX / 16)).toBeLessThanOrEqual(s.chunkX + reach);
    expect(Math.floor(b.minZ / 16)).toBeGreaterThanOrEqual(s.chunkZ - reach);
    expect(Math.floor(b.maxZ / 16)).toBeLessThanOrEqual(s.chunkZ + reach);
  }
}

describe('structures', { timeout: 300_000 }, () => {
  it('villages: pieces stay inside their boxes and within maxReach', () => {
    for (const seed of [1, 123]) {
      const g = gen(seed);
      const vs = starts(g, 'village', 4);
      expect(vs.length).toBeGreaterThan(0);
      for (const s of vs) checkBoxes(g, s, typeOf(g, 'village').maxReach);
    }
  });

  it('stronghold: pieces stay inside their boxes; exactly one portal room', () => {
    const g = gen(123);
    const t = typeOf(g, 'stronghold');
    const ring = g.structures.ringStarts(t);
    expect(ring.length).toBe(128);
    for (const c of ring.slice(0, 3)) {
      const s: StructureStart = g.structures.startAt(t, c[0], c[1]);
      expect(s).not.toBeNull();
      checkBoxes(g, s, t.maxReach);
      expect(s.pieces.filter((p: any) => p.kind === 'portal').length).toBe(1);
    }
  });

  it('strongholds lie on vanilla-like rings', () => {
    const g = gen(7);
    const ring = g.structures.ringStarts(typeOf(g, 'stronghold')) as [number, number][];
    const d = ring.map(([x, z]) => Math.hypot(x * 16 + 8, z * 16 + 8));
    for (const v of d.slice(0, 3)) {
      expect(v).toBeGreaterThan(1280 - 120);
      expect(v).toBeLessThan(2816 + 120);
    }
    for (const v of d.slice(3, 9)) {
      expect(v).toBeGreaterThan(4352 - 120);
      expect(v).toBeLessThan(5888 + 120);
    }
    for (const v of d.slice(9, 19)) {
      expect(v).toBeGreaterThan(7424 - 120);
      expect(v).toBeLessThan(8960 + 120);
    }
  });

  it('locate finds villages and strongholds within the expected radius', () => {
    for (const seed of [1, 2, 3]) {
      const g = gen(seed);
      const v = g.locateStructure('village', 0, 0);
      expect(v, `village seed ${seed}`).not.toBeNull();
      expect(Math.hypot(v.x, v.z)).toBeLessThan(3000);
      const s = g.locateStructure('stronghold', 0, 0);
      expect(s, `stronghold seed ${seed}`).not.toBeNull();
      expect(Math.hypot(s.x, s.z)).toBeLessThan(2816 + 200);
      expect(locateStronghold(seed, 0, 0)).toEqual(s);
    }
  });

  it('stronghold portal room has 12 frames, lava and a silverfish spawner', () => {
    const seed = 3;
    const g = gen(seed);
    const p = g.locateStructure('stronghold', 0, 0);
    const w = new GenWorld(g);
    const cx = Math.floor(p.x / 16), cz = Math.floor(p.z / 16);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) w.generate(cx + dx, cz + dz);
    let frames = 0, lava = 0;
    for (let x = p.x - 3; x <= p.x + 3; x++)
      for (let z = p.z - 3; z <= p.z + 3; z++) {
        const name = BLOCKS[w.get(x, p.y, z) >>> 4].name;
        if (name === 'end_portal_frame') frames++;
        if (BLOCKS[w.get(x, p.y - 1, z) >>> 4].name === 'lava') lava++;
      }
    expect(frames).toBe(12);
    expect(lava).toBe(9);
    const bes = [...w.chunks.values()].flatMap((c) => c.blockEntities ?? []);
    expect(bes.some((b) => b.data.id === 'mob_spawner' && b.data.entity === 'silverfish')).toBe(true);
  });

  it('village chunks are independent of generation order and carry chest/villager data', () => {
    const g = gen(1);
    const v = g.locateStructure('village', 0, 0);
    const cx = Math.floor(v.x / 16), cz = Math.floor(v.z / 16);
    const coords: [number, number][] = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) coords.push([cx + dx, cz + dz]);
    const A = coords.map(([x, z]) => gen(1).generate(x, z));
    const g2 = gen(1);
    const B = [...coords].reverse().map(([x, z]) => g2.generate(x, z)).reverse();
    for (let i = 0; i < coords.length; i++) expect(chunkDiff(A[i], B[i]), `chunk ${coords[i]}`).toBeNull();
    const bes = A.flatMap((c) => c.blockEntities ?? []);
    for (const b of bes) {
      if (b.data.id === 'chest') {
        expect(b.data.lootTable).toMatch(/^minecraft:chests\//);
        expect(b.data.loot).toBeTypeOf('string');
      }
    }
    expect(A.some((c) => (c.entities ?? []).some((e: { type: string }) => e.type === 'villager'))).toBe(true);
  });

  it('stronghold chunks are independent of generation order', () => {
    const g = gen(3);
    const p = g.locateStructure('stronghold', 0, 0);
    const cx = Math.floor(p.x / 16), cz = Math.floor(p.z / 16);
    const coords: [number, number][] = [[cx, cz], [cx + 1, cz], [cx, cz + 1], [cx - 1, cz - 1]];
    const A = coords.map(([x, z]) => gen(3).generate(x, z));
    const g2 = gen(3);
    g2.generate(cx + 3, cz + 3);
    const B = [...coords].reverse().map(([x, z]) => g2.generate(x, z)).reverse();
    for (let i = 0; i < coords.length; i++) expect(chunkDiff(A[i], B[i])).toBeNull();
  });
});
