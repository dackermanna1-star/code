import { describe, expect, it } from 'vitest';
import { WorldGenerator } from '../src/world/generator';
import { AIR, SOLID_COLLIDE } from '../src/world/materials';
import { SURFACE_Y } from '../src/config';

describe('WorldGenerator', () => {
  it('is deterministic per seed', () => {
    const a = new WorldGenerator(1234).generateChunk(8, 118, 8);
    const b = new WorldGenerator(1234).generateChunk(8, 118, 8);
    const c = new WorldGenerator(999).generateChunk(8, 118, 8);
    expect(Buffer.from(a.mat).equals(Buffer.from(b.mat))).toBe(true);
    expect(Buffer.from(a.mat).equals(Buffer.from(c.mat))).toBe(false);
    expect(a.spawns).toEqual(b.spawns);
  });

  it('places the player on open ground above a solid floor', () => {
    const g = new WorldGenerator(42);
    const p = g.spawnPoint();
    expect(g.isOpen(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))).toBe(true);
    expect(g.isOpen(Math.floor(p.x), Math.floor(p.y) + 8, Math.floor(p.z))).toBe(true);
    expect(g.isOpen(Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z))).toBe(false);
  });

  it('chunk voxels agree with point queries', () => {
    const g = new WorldGenerator(7);
    const cx = 7, cy = (SURFACE_Y - 100) >> 4, cz = 9;
    const r = g.generateChunk(cx, cy, cz);
    let agree = 0, total = 0;
    for (let i = 0; i < 4096; i += 7) {
      const lx = i & 15, lz = (i >> 4) & 15, ly = i >> 8;
      const open = g.isOpen(cx * 16 + lx, cy * 16 + ly, cz * 16 + lz);
      const m = r.mat[i];
      // structures/pools may fill open cells; but a solid point query must be solid in the chunk
      if (!open) { total++; if (m !== AIR) agree++; }
    }
    expect(agree).toBe(total);
  });

  it('generates chunks fast enough', () => {
    const g = new WorldGenerator(5);
    const t0 = performance.now();
    let solid = 0;
    let n = 0;
    for (let cy = 110; cy < 120; cy++)
      for (let cz = 6; cz < 10; cz++)
        for (let cx = 6; cx < 10; cx++) {
          const r = g.generateChunk(cx, cy, cz);
          for (let i = 0; i < 4096; i++) if (SOLID_COLLIDE[r.mat[i]]) solid++;
          n++;
        }
    const ms = (performance.now() - t0) / n;
    console.log(`gen: ${ms.toFixed(2)} ms/chunk, solid fraction ${(solid / (n * 4096)).toFixed(2)}`);
    expect(ms).toBeLessThan(20);
  });
});
