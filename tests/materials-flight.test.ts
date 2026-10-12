import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VoxelWorld, chunkKey } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { ROCK, WATER, OIL, SAND, AIR } from '../src/world/materials';
import { ParticleSystem } from '../src/render/particles';
import { MaterialSimulation } from '../src/sim/simulation';
import { TerrainDestructionSystem } from '../src/sim/destruction';
import { makePotion, potionTakeOne, potionTotal, potionAdd } from '../src/game/inventory';

function setup() {
  const w = new VoxelWorld();
  for (let cy = 0; cy < 3; cy++) for (let cz = 0; cz < 4; cz++) for (let cx = 0; cx < 4; cx++) w.addChunk(new Chunk(cx, cy, cz, chunkKey(cx, cy, cz)));
  for (let z = 0; z < 64; z++) for (let x = 0; x < 64; x++) for (let y = 0; y < 4; y++) w.set(x, y, z, ROCK);
  w.activeSet.clear();
  const parts = new ParticleSystem(w, { value: 600 }, { uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0 } });
  return { w, parts, sim: new MaterialSimulation(w) };
}

function count(w: VoxelWorld, m: number): number {
  let n = 0;
  for (let y = 0; y < 48; y++) for (let z = 0; z < 64; z++) for (let x = 0; x < 64; x++) if (w.get(x, y, z) === m) n++;
  return n;
}

describe('material in flight is conserved', () => {
  it('a shattered flask lands every unit of its contents as voxels', () => {
    const { w, parts } = setup();
    const flask = makePotion(WATER, 300);
    potionAdd(flask, OIL, 100);
    expect(potionTotal(flask)).toBe(400);
    let m: number | null;
    let rng = 1;
    const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
    while ((m = potionTakeOne(flask, rand)) !== null) {
      const a = rand() * Math.PI * 2;
      parts.launch(m, 0, 32, 20, 32, Math.cos(a) * 12, 6 + rand() * 6, Math.sin(a) * 12);
    }
    expect(potionTotal(flask)).toBe(0);
    for (let i = 0; i < 600 && parts.count > 0; i++) parts.update(1 / 60);
    expect(parts.materialCount).toBe(0);
    expect(count(w, WATER)).toBe(300);
    expect(count(w, OIL)).toBe(100);
  });

  it('explosions throw liquids and loose powders without losing any', () => {
    const { w, parts, sim } = setup();
    for (let y = 4; y < 8; y++) for (let z = 26; z < 38; z++) for (let x = 26; x < 38; x++) w.set(x, y, z, y < 6 ? SAND : WATER);
    const water0 = count(w, WATER), sand0 = count(w, SAND);
    const d = new TerrainDestructionSystem(w, sim);
    d.cb.launch = (m, aux, x, y, z, vx, vy, vz) => parts.launch(m, aux, x, y, z, vx, vy, vz);
    const rep = d.explode(32, 6, 32, { radius: 6, durability: 11, rayEnergy: 2000, launch: true });
    expect(rep.launched).toBeGreaterThan(50);
    for (let i = 0; i < 900 && parts.count > 0; i++) parts.update(1 / 60);
    expect(parts.materialCount).toBe(0);
    expect(count(w, WATER)).toBe(water0);
    // sand voxels destroyed outright (not launched) are allowed; launched ones must all land
    expect(count(w, SAND)).toBeLessThanOrEqual(sand0);
    expect(count(w, SAND) + rep.destroyed).toBeGreaterThanOrEqual(sand0 - 1);
    expect(w.get(32, 6, 32)).not.toBe(ROCK);
    void AIR;
  });
});
