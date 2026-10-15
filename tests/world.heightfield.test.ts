// Verifies that getHeight's triangulation matches Rapier's heightfield collider exactly.
import { describe, expect, it, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { heightAt, toRapierHeights, triangleNormalAt } from '../src/world/terrain/sample';

beforeAll(async () => {
  await RAPIER.init();
});

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('terrain heightfield', () => {
  it('heightAt matches Rapier heightfield raycasts (same diagonal split)', () => {
    const n = 17, cell = 2;
    const size = (n - 1) * cell;
    const r = rand(7);
    const h = new Float32Array(n * n);
    for (let i = 0; i < h.length; i++) h[i] = r() * 12 - 3;
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const desc = RAPIER.ColliderDesc.heightfield(n - 1, n - 1, toRapierHeights(h, n), { x: size, y: 1, z: size }).setTranslation(size / 2, 0, size / 2);
    world.createCollider(desc);
    world.step();
    let maxErr = 0;
    for (let k = 0; k < 400; k++) {
      const x = 0.01 + r() * (size - 0.02), z = 0.01 + r() * (size - 0.02);
      const hit = world.castRay(new RAPIER.Ray({ x, y: 100, z }, { x: 0, y: -1, z: 0 }), 200, true);
      expect(hit).not.toBeNull();
      const yPhys = 100 - hit!.timeOfImpact;
      maxErr = Math.max(maxErr, Math.abs(yPhys - heightAt(h, n, cell, x, z)));
    }
    expect(maxErr).toBeLessThan(1e-3);
  });

  it('triangle normal matches Rapier hit normal', () => {
    const n = 9, cell = 2;
    const size = (n - 1) * cell;
    const r = rand(3);
    const h = new Float32Array(n * n);
    for (let i = 0; i < h.length; i++) h[i] = r() * 6;
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.createCollider(
      RAPIER.ColliderDesc.heightfield(n - 1, n - 1, toRapierHeights(h, n), { x: size, y: 1, z: size }).setTranslation(size / 2, 0, size / 2),
    );
    world.step();
    const out = { x: 0, y: 0, z: 0 };
    for (let k = 0; k < 100; k++) {
      const x = 0.05 + r() * (size - 0.1), z = 0.05 + r() * (size - 0.1);
      const hit = world.castRayAndGetNormal(new RAPIER.Ray({ x, y: 50, z }, { x: 0, y: -1, z: 0 }), 100, true);
      triangleNormalAt(h, n, cell, x, z, out);
      expect(Math.abs(hit!.normal.x - out.x)).toBeLessThan(1e-3);
      expect(Math.abs(hit!.normal.y - out.y)).toBeLessThan(1e-3);
      expect(Math.abs(hit!.normal.z - out.z)).toBeLessThan(1e-3);
    }
  });

  it('heightAt is exact at grid samples and clamps outside', () => {
    const n = 5, cell = 2;
    const h = new Float32Array(n * n).map((_, i) => i * 0.5);
    expect(heightAt(h, n, cell, 4, 6)).toBeCloseTo(h[3 * n + 2]);
    expect(heightAt(h, n, cell, -10, -10)).toBeCloseTo(h[0]);
    expect(heightAt(h, n, cell, 100, 100)).toBeCloseTo(h[n * n - 1]);
  });
});
