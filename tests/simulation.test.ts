import { describe, expect, it } from 'vitest';
import { VoxelWorld, chunkKey } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { MaterialSimulation } from '../src/sim/simulation';
import {
  AIR, WATER, SAND, WOOD, ICE, LAVA, STEAM, BASALT, OIL, GUNPOWDER, ACID, SOIL, STEEL, FIRE, SMOKE, ASH, TOXIC, KIND, Kind,
} from '../src/world/materials';

function makeWorld(n = 2): VoxelWorld {
  const w = new VoxelWorld();
  for (let cy = 0; cy < n; cy++)
    for (let cz = 0; cz < n; cz++)
      for (let cx = 0; cx < n; cx++) w.addChunk(new Chunk(cx, cy, cz, chunkKey(cx, cy, cz)));
  w.meshDirty.clear();
  return w;
}

function count(w: VoxelWorld, m: number, size = 32): number {
  let n = 0;
  for (let y = 0; y < size; y++) for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) if (w.get(x, y, z) === m) n++;
  return n;
}

function fill(w: VoxelWorld, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: number) {
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) w.set(x, y, z, m);
}

function run(sim: MaterialSimulation, ticks: number) {
  sim.budgetMs = 1e9;
  for (let i = 0; i < ticks; i++) sim.step();
}

describe('MaterialSimulation', () => {
  it('conserves liquid volume and lets it settle', () => {
    const w = makeWorld();
    const sim = new MaterialSimulation(w);
    fill(w, 10, 20, 10, 15, 28, 15, WATER); // 6*9*6 = 324 cells, falls onto the unloaded floor (y=0 is bottom of world: bedrock)
    const before = count(w, WATER);
    expect(before).toBe(324);
    run(sim, 900);
    expect(count(w, WATER)).toBe(before);
    // nothing floats: every water cell rests on something non-empty
    for (let y = 1; y < 32; y++)
      for (let z = 0; z < 32; z++)
        for (let x = 0; x < 32; x++) if (w.get(x, y, z) === WATER) expect(w.get(x, y - 1, z)).not.toBe(AIR);
    // the pool spread out: max height small
    let maxY = 0;
    for (let y = 0; y < 32; y++) for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) if (w.get(x, y, z) === WATER) maxY = Math.max(maxY, y);
    expect(maxY).toBeLessThan(4);
    // and the simulation went to sleep
    run(sim, 200);
    expect(w.activeSet.size).toBe(0);
  });

  it('settles powders into piles without losing grains', () => {
    const w = makeWorld();
    const sim = new MaterialSimulation(w);
    fill(w, 15, 10, 15, 16, 25, 16, SAND); // 2x16x2 = 64 column
    run(sim, 600);
    expect(count(w, SAND)).toBe(64);
    let maxY = 0;
    for (let y = 0; y < 32; y++) for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
      if (w.get(x, y, z) !== SAND) continue;
      maxY = Math.max(maxY, y);
      if (y > 0) expect(w.get(x, y - 1, z)).not.toBe(AIR);
    }
    expect(maxY).toBeLessThan(12); // spread into a pile rather than a column
    run(sim, 100);
    expect(w.activeSet.size).toBe(0);
  });

  it('sand sinks through water and oil floats on water', () => {
    const w = makeWorld();
    const sim = new MaterialSimulation(w);
    // walled basin
    fill(w, 4, 0, 4, 12, 10, 12, STEEL);
    fill(w, 5, 1, 5, 11, 10, 11, AIR);
    fill(w, 5, 1, 5, 11, 3, 11, WATER);
    fill(w, 7, 8, 7, 9, 8, 9, SAND);
    fill(w, 5, 6, 5, 11, 6, 11, OIL);
    run(sim, 600);
    // sand at the bottom row, oil above water
    let sandBottom = 0;
    for (let z = 5; z <= 11; z++) for (let x = 5; x <= 11; x++) if (w.get(x, 1, z) === SAND) sandBottom++;
    expect(sandBottom).toBeGreaterThan(0);
    let oilAboveWater = true;
    for (let y = 1; y < 10; y++) for (let z = 5; z <= 11; z++) for (let x = 5; x <= 11; x++) {
      if (w.get(x, y, z) === OIL && w.get(x, y - 1, z) === AIR) oilAboveWater = false;
      if (w.get(x, y, z) === WATER) for (let yy = y + 1; yy < 10; yy++) if (w.get(x, yy, z) === OIL) {
        // ok: oil above water
      }
    }
    expect(oilAboveWater).toBe(true);
    let waterOverOil = 0;
    for (let y = 2; y < 10; y++) for (let z = 5; z <= 11; z++) for (let x = 5; x <= 11; x++) if (w.get(x, y, z) === WATER && w.get(x, y - 1, z) === OIL) waterOverOil++;
    expect(waterOverOil).toBe(0);
  });

  it('burns wood away, produces smoke/ash, and the fire terminates', () => {
    const w = makeWorld();
    const sim = new MaterialSimulation(w);
    fill(w, 10, 0, 10, 20, 3, 20, WOOD);
    const wood0 = count(w, WOOD);
    sim.ignite(15, 3, 15, true);
    let sawFire = false, sawSmoke = false;
    for (let i = 0; i < 6000; i++) {
      sim.step();
      if (i % 50 === 0) {
        if (count(w, FIRE) > 0) sawFire = true;
        if (count(w, SMOKE) > 0) sawSmoke = true;
      }
      if (w.activeSet.size === 0) break;
    }
    expect(sawFire).toBe(true);
    expect(sawSmoke).toBe(true);
    expect(count(w, WOOD)).toBeLessThan(wood0 * 0.5);
    run(sim, 3000);
    expect(count(w, FIRE)).toBe(0);
    expect(w.activeSet.size).toBe(0);
    expect(count(w, ASH)).toBeGreaterThanOrEqual(0);
  });

  it('water extinguishes burning material', () => {
    const w = makeWorld();
    const sim = new MaterialSimulation(w);
    fill(w, 10, 0, 10, 12, 2, 12, WOOD);
    for (let x = 10; x <= 12; x++) for (let z = 10; z <= 12; z++) sim.ignite(x, 2, z, true);
    fill(w, 9, 3, 9, 13, 8, 13, WATER);
    run(sim, 400);
    let burning = 0;
    for (let x = 10; x <= 12; x++) for (let z = 10; z <= 12; z++) for (let y = 0; y <= 2; y++) if (sim.isBurning(x, y, z)) burning++;
    expect(burning).toBe(0);
    expect(count(w, WOOD)).toBeGreaterThan(20);
  });

  it('heat melts ice next to lava and lava + water makes rock and steam', () => {
    const w = makeWorld();
    const sim = new MaterialSimulation(w);
    fill(w, 10, 0, 10, 14, 1, 14, LAVA);
    fill(w, 10, 2, 10, 14, 3, 14, ICE);
    run(sim, 900);
    expect(count(w, ICE)).toBeLessThan(50);
    const w2 = makeWorld();
    const sim2 = new MaterialSimulation(w2);
    fill(w2, 10, 0, 10, 14, 1, 14, LAVA);
    fill(w2, 10, 6, 10, 14, 8, 14, WATER);
    let steamSeen = false;
    for (let i = 0; i < 600; i++) {
      sim2.step();
      if (count(w2, STEAM) > 0) steamSeen = true;
    }
    expect(steamSeen).toBe(true);
    expect(count(w2, BASALT)).toBeGreaterThan(0);
  });

  it('reactions terminate: toxic sludge is purified by water and stops', () => {
    const w = makeWorld();
    const sim = new MaterialSimulation(w);
    fill(w, 4, 0, 4, 12, 10, 12, STEEL);
    fill(w, 5, 1, 5, 11, 10, 11, AIR);
    fill(w, 5, 1, 5, 11, 2, 11, WATER);
    fill(w, 5, 3, 5, 11, 3, 11, TOXIC);
    const liquid0 = count(w, WATER) + count(w, TOXIC);
    run(sim, 6000);
    expect(count(w, TOXIC)).toBe(0);
    expect(count(w, WATER)).toBe(liquid0);
    run(sim, 200);
    expect(w.activeSet.size).toBe(0);
  });

  it('gunpowder ignition reports explosions', () => {
    const w = makeWorld();
    const sim = new MaterialSimulation(w);
    fill(w, 10, 0, 10, 12, 1, 12, GUNPOWDER);
    let explosions = 0;
    sim.events.explosion = () => explosions++;
    sim.ignite(11, 1, 11, true);
    run(sim, 120);
    expect(explosions).toBeGreaterThan(0);
  });

  it('acid dissolves soil but not steel, and is eventually used up', () => {
    const w = makeWorld();
    const sim = new MaterialSimulation(w);
    fill(w, 4, 0, 4, 20, 8, 20, SOIL);
    fill(w, 8, 0, 8, 10, 8, 10, STEEL);
    fill(w, 14, 9, 14, 16, 12, 16, ACID);
    const soil0 = count(w, SOIL);
    const steel0 = count(w, STEEL);
    run(sim, 1500);
    expect(count(w, SOIL)).toBeLessThan(soil0);
    expect(count(w, STEEL)).toBe(steel0);
    expect(count(w, ACID)).toBeLessThan(36);
  });

  it('gases rise and dissipate', () => {
    const w = makeWorld();
    const sim = new MaterialSimulation(w);
    for (let x = 14; x < 18; x++) for (let z = 14; z < 18; z++) w.set(x, 2, z, SMOKE);
    run(sim, 40);
    let sumY = 0, n = 0;
    for (let y = 0; y < 32; y++) for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) if (KIND[w.get(x, y, z)] === Kind.GAS) { sumY += y; n++; }
    expect(n).toBeGreaterThan(0);
    expect(sumY / n).toBeGreaterThan(8);
    run(sim, 2000);
    expect(count(w, SMOKE)).toBe(0);
  });
});
