import { describe, expect, it } from 'vitest';
import { WorldGenerator } from '../src/world/generator';
import { SOLID_COLLIDE, AIR, TEMPLEBRICK } from '../src/world/materials';
import { HM, NUM_LAYERS, hmBandY, hmFloorY, layerTopY } from '../src/world/biomes';
import { CHUNK } from '../src/config';

/** Chunk-cached voxel lookup over generated chunks (includes structures, pools and features). */
function voxels(g: WorldGenerator) {
  const cache = new Map<string, Uint8Array>();
  return (x: number, y: number, z: number): number => {
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK), cz = Math.floor(z / CHUNK);
    const k = `${cx},${cy},${cz}`;
    let m = cache.get(k);
    if (!m) {
      m = g.generateChunk(cx, cy, cz).mat;
      cache.set(k, m);
    }
    return m[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)];
  };
}

describe('procedural route connectivity', () => {
  for (const seed of [1, 1234, 98765]) {
    it(`every biome route is open for the player (seed ${seed})`, () => {
      const g = new WorldGenerator(seed);
      const get = voxels(g);
      let blocked = 0, checked = 0;
      for (let layer = 0; layer < NUM_LAYERS; layer++) {
        for (const p of g.routePoints[layer]) {
          // points overshooting into a Holy Mountain band are governed by the shaft geometry (tested below)
          if (layer > 0 && p.y > layerTopY(layer) - 5) continue;
          // a player-sized column (3 wide, 8 tall) around the route centre must be free of solids
          checked++;
          let solid = 0;
          for (let dy = -3; dy <= 4; dy++)
            for (let dz = -1; dz <= 1; dz++)
              for (let dx = -1; dx <= 1; dx++) if (SOLID_COLLIDE[get(Math.floor(p.x) + dx, Math.floor(p.y) + dy, Math.floor(p.z) + dz)]) solid++;
          if (solid > 3) blocked++;
        }
      }
      expect(checked).toBeGreaterThan(200);
      expect(blocked).toBe(0);
    });
  }

  it('holy mountain shafts connect each biome to the next', () => {
    const g = new WorldGenerator(42);
    const get = voxels(g);
    for (let i = 0; i < NUM_LAYERS - 1; i++) {
      const band = hmBandY(i);
      const floor = hmFloorY(i);
      // entrance shaft: from the biome bottom down to the room
      for (let y = band.top + 2; y > floor + 1; y--) expect(SOLID_COLLIDE[get(HM.cx, y, HM.cz)], `entrance layer ${i} y ${y}`).toBe(0);
      // the room floor is holy brick
      expect(get(HM.cx + 4, floor - 1, HM.cz)).toBe(TEMPLEBRICK);
      // exit shaft: from the room floor down into the next biome
      for (let y = floor; y > band.bottom - 3; y--) expect(SOLID_COLLIDE[get(HM.exitX, y, HM.exitZ)], `exit layer ${i} y ${y}`).toBe(0);
      // the landing column below the exit shaft is open
      for (let y = band.bottom; y > band.bottom - 12; y--) expect(SOLID_COLLIDE[get(HM.exitX, y, HM.exitZ)], `landing layer ${i} y ${y}`).toBe(0);
      // and the next biome's route starts right there
      const next = g.routePoints[i + 1][0];
      expect(Math.hypot(next.x - HM.exitX, next.z - HM.exitZ)).toBeLessThan(2);
      expect(next.y).toBeGreaterThan(layerTopY(i + 1) - 2);
    }
    expect(get(HM.cx, hmFloorY(0) + 3, HM.cz)).toBe(AIR);
  });
});
