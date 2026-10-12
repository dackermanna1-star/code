import { describe, expect, it } from 'vitest';
import { VoxelWorld, chunkKey, RAY_SOLID } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { makeBody, moveBody, depenetrate, placeBody } from '../src/entities/physics';
import { AIR, ROCK, SAND } from '../src/world/materials';
import { TerrainDestructionSystem } from '../src/sim/destruction';
import { MaterialSimulation } from '../src/sim/simulation';

function world(n = 3): VoxelWorld {
  const w = new VoxelWorld();
  for (let cy = 0; cy < n; cy++) for (let cz = 0; cz < n; cz++) for (let cx = 0; cx < n; cx++) w.addChunk(new Chunk(cx, cy, cz, chunkKey(cx, cy, cz)));
  // floor at y = 0..3
  for (let z = 0; z < n * 16; z++) for (let x = 0; x < n * 16; x++) for (let y = 0; y < 4; y++) w.set(x, y, z, ROCK);
  w.meshDirty.clear();
  w.activeSet.clear();
  return w;
}

function simulate(w: VoxelWorld, b: ReturnType<typeof makeBody>, seconds: number, vx = 0, vz = 0) {
  for (let i = 0; i < seconds * 60; i++) {
    b.vx = vx;
    b.vz = vz;
    b.vy -= 52 / 60;
    moveBody(w, b, 1 / 60);
  }
}

describe('voxel physics', () => {
  it('lands on the floor and never falls through, including across chunk seams', () => {
    const w = world();
    for (const [x, z] of [[8, 8], [16, 16], [15.99, 16.01], [32, 31.9]]) {
      const b = makeBody(x, 30, z, 1.35, 8.4, 2);
      simulate(w, b, 2);
      expect(b.onGround).toBe(true);
      expect(b.y).toBeGreaterThanOrEqual(4);
      expect(b.y).toBeLessThan(4.01);
    }
  });

  it('does not tunnel through a thin wall at high speed', () => {
    const w = world();
    for (let y = 4; y < 20; y++) for (let z = 0; z < 48; z++) w.set(24, y, z, ROCK);
    const b = makeBody(10, 4.01, 20, 1.35, 8.4, 2);
    simulate(w, b, 1, 200, 0); // 200 voxels/s
    expect(b.x + b.hw).toBeLessThanOrEqual(24);
  });

  it('steps up small ledges but not walls', () => {
    const w = world();
    for (let z = 0; z < 48; z++) for (let x = 20; x < 48; x++) w.set(x, 4, z, ROCK); // 1-voxel ledge
    for (let z = 0; z < 48; z++) for (let x = 36; x < 48; x++) for (let y = 5; y < 12; y++) w.set(x, y, z, ROCK); // tall wall
    const b = makeBody(10, 4.01, 20, 1.35, 8.4, 2);
    simulate(w, b, 3, 15, 0);
    expect(b.y).toBeGreaterThanOrEqual(5);
    expect(b.x + b.hw).toBeLessThanOrEqual(36);
  });

  it('depenetrates a body buried by new terrain', () => {
    const w = world();
    const b = makeBody(20, 4.01, 20, 1.35, 8.4, 2);
    for (let y = 4; y < 7; y++) for (let z = 18; z < 23; z++) for (let x = 18; x < 23; x++) w.set(x, y, z, SAND);
    expect(depenetrate(w, b)).toBe(true);
    expect(b.y).toBeGreaterThanOrEqual(7);
  });

  it('a body buried deeper than the per-tick push-out is moved to the nearest open space', () => {
    const w = world();
    // an 8-voxel thick slab around the body
    for (let y = 4; y < 12; y++) for (let z = 10; z < 34; z++) for (let x = 10; x < 34; x++) w.set(x, y, z, ROCK);
    const b = makeBody(24, 4.01, 24, 1.35, 8.4);
    moveBody(w, b, 1 / 60);
    expect(b.stuck).toBe(false);
    expect(b.y).toBeGreaterThanOrEqual(12);
    // fully enclosed far from any air: stays put and reports stuck
    const solid = world();
    for (let y = 4; y < 48; y++) for (let z = 0; z < 48; z++) for (let x = 0; x < 48; x++) solid.set(x, y, z, ROCK);
    const c = makeBody(24, 20, 24, 1.35, 8.4);
    expect(placeBody(solid, c, 6)).toBe(false);
    moveBody(solid, c, 1 / 60);
    expect(c.stuck).toBe(true);
  });

  it('digging terrain removes voxels across chunk boundaries and the body then falls', () => {
    const w = world();
    const sim = new MaterialSimulation(w);
    const d = new TerrainDestructionSystem(w, sim);
    const b = makeBody(16, 4.01, 16, 1.35, 8.4, 2);
    simulate(w, b, 0.2);
    const removed = d.dig(16, 2, 16, 3.5, 10);
    expect(removed).toBeGreaterThan(50);
    expect(w.get(16, 3, 16)).toBe(AIR);
    expect(w.get(15, 3, 15)).toBe(AIR); // other side of the chunk seam
    simulate(w, b, 1);
    expect(b.y).toBeLessThan(4);
  });

  it('ray casts hit the first solid voxel with the right face normal', () => {
    const w = world();
    const h = w.raycast(10.5, 20.5, 10.5, 0, -1, 0, 100, RAY_SOLID);
    expect(h.hit).toBe(true);
    expect(h.y).toBe(3);
    expect(h.ny).toBe(1);
    expect(h.dist).toBeCloseTo(16.5, 1);
  });

  it('explosions respect durability and hardness (ray energy)', () => {
    const w = world();
    const sim = new MaterialSimulation(w);
    const d = new TerrainDestructionSystem(w, sim);
    // a block of rock: low ray energy cannot clear rock far
    const r1 = d.explode(24, 3.5, 24, { radius: 6, durability: 10, rayEnergy: 150 });
    // rock hardness 100 -> about one voxel of rock depth per 100 energy
    expect(r1.destroyed).toBeGreaterThan(0);
    expect(w.get(24, 0, 24)).toBe(ROCK);
    const w2 = world();
    const d2 = new TerrainDestructionSystem(w2, new MaterialSimulation(w2));
    const r2 = d2.explode(24, 3.5, 24, { radius: 6, durability: 10, rayEnergy: 5000 });
    expect(r2.destroyed).toBeGreaterThan(r1.destroyed * 3);
    // durability gate: nothing destroyed with too-low durability
    const w3 = world();
    const d3 = new TerrainDestructionSystem(w3, new MaterialSimulation(w3));
    expect(d3.explode(24, 3.5, 24, { radius: 6, durability: 5, rayEnergy: 5000 }).destroyed).toBe(0);
  });
});
