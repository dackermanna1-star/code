import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VoxelWorld, chunkKey } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { WorldGenerator } from '../src/world/generator';
import { HM, hmBandY, hmFloorY } from '../src/world/biomes';
import { DENSEROCK, ROCK, AIR } from '../src/world/materials';
import { Player } from '../src/entities/player';
import { MaterialSimulation } from '../src/sim/simulation';
import { TerrainDestructionSystem } from '../src/sim/destruction';
import { ParticleSystem } from '../src/render/particles';
import { DamageSystem } from '../src/entities/damage';
import { ProjectileSystem, registerProjectiles } from '../src/entities/projectiles';
import { PROJECTILES } from '../src/magic/projectileDefs';
import { defaultShotState } from '../src/magic/shotState';

registerProjectiles(PROJECTILES);

describe('review: HM collapse', () => {
  it('player falling down the exit shaft gets sealed inside dense rock', () => {
    const seed = 1234;
    const gen = new WorldGenerator(seed);
    const w = new VoxelWorld();
    const layer = 0;
    const floor = hmFloorY(layer);
    const band = hmBandY(layer);
    for (let cy = Math.floor((band.bottom - 40) / 16); cy <= Math.floor((floor + 30) / 16); cy++)
      for (let cz = Math.floor(HM.exitZ / 16) - 1; cz <= Math.floor(HM.exitZ / 16) + 1; cz++)
        for (let cx = Math.floor(HM.exitX / 16) - 1; cx <= Math.floor(HM.exitX / 16) + 1; cx++) {
          const r = gen.generateChunk(cx, cy, cz);
          w.addChunk(new Chunk(cx, cy, cz, chunkKey(cx, cy, cz), r.mat));
        }
    const p = new Player(HM.exitX + 0.5, floor + 0.05, HM.exitZ + 0.5);
    const input = { held: () => false, hit: () => false } as never;
    const ev = { footstep() {}, jump() {}, land() {} };
    let collapsed = false;
    let collapseY = 0;
    for (let t = 0; t < 240; t++) {
      p.update(w, input, 1 / 60, ev);
      const b = p.body;
      if (!collapsed && b.y < floor - 8 && b.y > band.bottom - 30 && Math.hypot(b.x - HM.exitX, b.z - HM.exitZ) < 8) {
        collapsed = true;
        collapseY = b.y;
        for (let y = floor - 6; y < floor - 2; y++)
          for (let dz = -6; dz <= 6; dz++)
            for (let dx = -6; dx <= 6; dx++) {
              if (Math.hypot(dx, dz) > 6.5) continue;
              w.set(HM.exitX + dx, y, HM.exitZ + dz, DENSEROCK);
            }
      }
    }
    console.log('collapsed', collapsed, 'at y', collapseY - floor, 'final y', p.body.y - floor, 'stuck', p.body.stuck);
    expect(collapsed).toBe(true);
  });
});

describe('review: bomb fuse', () => {
  it('bomb explodes before its 180-frame fuse', () => {
    const w = new VoxelWorld();
    for (let cy = 0; cy < 3; cy++) for (let cz = 0; cz < 4; cz++) for (let cx = 0; cx < 4; cx++) w.addChunk(new Chunk(cx, cy, cz, chunkKey(cx, cy, cz)));
    for (let z = 0; z < 64; z++) for (let x = 0; x < 64; x++) for (let y = 0; y < 4; y++) w.set(x, y, z, ROCK);
    w.activeSet.clear();
    const sim = new MaterialSimulation(w);
    const destr = new TerrainDestructionSystem(w, sim);
    const parts = new ParticleSystem(w, { value: 600 }, { uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0 } } as never);
    const dmg = new DamageSystem(w, sim);
    const proj = new ProjectileSystem(w, sim, destr, dmg, parts, { value: 600 });
    proj.fireShot({ state: defaultShotState(), projectiles: [{ projectile: 'bomb' }] }, 20, 12, 20, new THREE.Vector3(1, 0, 0), null, 0, 1);
    let frame = -1;
    for (let i = 0; i < 300; i++) {
      proj.update(1 / 60);
      if (proj.list.length === 0) { frame = i; break; }
    }
    console.log('bomb died at frame', frame, 'air at y=3:', w.get(30, 3, 20) === AIR);
    expect(frame).toBeGreaterThan(0);
  });
});
