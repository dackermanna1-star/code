import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { lightChunkLocal } from '../src/world/light';
import { S } from '../src/world/blocks/registry';
import '../src/world/blocks/blocks';
import { PhysicsWorld, GROUP } from '../src/physics/rapierWorld';
import { buildSectionData } from '../src/physics/terrain';

function flatChunk(cx: number, cz: number, h = 10) {
  const c = new Chunk(cx, cz);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < h; y++) c.set(x, y, z, S('stone'));
  lightChunkLocal(c);
  c.status = 'ready';
  return c;
}
function makeWorld() {
  const w = new World('overworld', 1);
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) w.addChunk(flatChunk(cx, cz));
  return w;
}
const run = (p: PhysicsWorld, n: number) => { for (let i = 0; i < n; i++) p.step(1 / 60); };

beforeAll(async () => {
  await RAPIER.init();
});

describe('terrain collider data', () => {
  it('groups unit cubes into voxels and partial shapes into boxes', () => {
    const w = makeWorld();
    w.setBlock(3, 10, 3, S('stone_slab', 0));
    w.setBlock(5, 10, 5, S('ice'));
    const get = (x: number, y: number, z: number) => w.getBlock(x, y, z);
    const d = buildSectionData(get, 0, 0, 0, w.getChunk(0, 0)!.blocks[0]);
    const total = d.voxels.reduce((a, v) => a + v.length / 3, 0);
    expect(total).toBe(16 * 16 * 10 + 1);
    expect(d.voxels[2].length / 3).toBe(1); // ice class
    expect(d.partial.size).toBe(1);
    const box = d.partial.get((10 << 8) | (3 << 4) | 3)!;
    expect(box).toEqual([3, 10, 3, 4, 10.5, 4]);
  });
});

describe('PhysicsWorld voxel colliders', () => {
  it('builds sections on demand under a new body and the body comes to rest on the ground', () => {
    const p = new PhysicsWorld(RAPIER as any, makeWorld());
    const b = p.addBody({ kind: 'item', position: { x: 4.5, y: 14, z: 4.5 }, shape: { type: 'box', half: [0.125, 0.125, 0.125] }, mass: 1, group: GROUP.ITEM });
    expect(p.hasSection(4, 9, 4)).toBe(true);
    run(p, 180);
    expect(b.pos.y).toBeGreaterThan(10.1);
    expect(b.pos.y).toBeLessThan(10.14);
  });

  it('updates incrementally when blocks are removed and placed (setVoxel)', () => {
    const w = makeWorld();
    const p = new PhysicsWorld(RAPIER as any, w);
    const b = p.addBody({ kind: 'debris', position: { x: 4.5, y: 10.3, z: 4.5 }, shape: { type: 'box', half: [0.2, 0.2, 0.2] }, mass: 1 });
    run(p, 60);
    expect(b.pos.y).toBeCloseTo(10.2, 1);
    // dig a 3x3 pit, 2 deep, under the body
    for (let x = 3; x <= 5; x++) for (let z = 3; z <= 5; z++) for (let y = 8; y <= 9; y++) w.setBlock(x, y, z, 0);
    run(p, 120);
    expect(b.pos.y).toBeCloseTo(8.2, 1);
    // place a slab in an empty cell: partial cuboid collider
    w.setBlock(4, 8, 4, S('stone_slab', 0));
    p.teleport(b, { x: 4.5, y: 9.5, z: 4.5 });
    run(p, 120);
    expect(b.pos.y).toBeCloseTo(8.7, 1);
  });

  it('slides across section borders without snagging', () => {
    const p = new PhysicsWorld(RAPIER as any, makeWorld());
    const b = p.addBody({ kind: 'item', position: { x: 13, y: 10.126, z: 8 }, linvel: { x: 6, y: 0, z: 0 }, shape: { type: 'box', half: [0.125, 0.125, 0.125] }, mass: 1, friction: 0.05 });
    let maxUp = 0;
    for (let i = 0; i < 40; i++) {
      p.step(1 / 60);
      maxUp = Math.max(maxUp, b.linvel().y);
    }
    expect(b.pos.x).toBeGreaterThan(16.3);
    expect(maxUp).toBeLessThan(0.5);
  });

  it('floats items in water', () => {
    const w = makeWorld();
    for (let x = 2; x <= 7; x++) for (let z = 2; z <= 7; z++) for (let y = 6; y <= 9; y++) w.setBlock(x, y, z, S('water'));
    const p = new PhysicsWorld(RAPIER as any, w);
    const b = p.addBody({ kind: 'item', position: { x: 4.5, y: 7, z: 4.5 }, shape: { type: 'box', half: [0.125, 0.125, 0.125] }, mass: 1, buoyancy: 1.6 });
    run(p, 400);
    // surface of a full water column is at y = 10 (8/9 + ... top block source: 9 + 8/9)
    expect(b.pos.y).toBeGreaterThan(9.6);
    expect(b.pos.y).toBeLessThan(10.1);
    expect(b.submerged).toBeGreaterThan(0.2);
  });

  it('releases unused sections', () => {
    const p = new PhysicsWorld(RAPIER as any, makeWorld());
    const b = p.addBody({ kind: 'item', position: { x: 4.5, y: 12, z: 4.5 }, shape: { type: 'box', half: [0.125, 0.125, 0.125] }, mass: 1 });
    run(p, 10);
    expect(p.sectionCount).toBeGreaterThan(0);
    p.removeBody(b);
    run(p, 60 * 5);
    expect(p.sectionCount).toBe(0);
  });
});
