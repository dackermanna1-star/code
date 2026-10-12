// Regression tests for bugs found in code review.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VoxelWorld, chunkKey } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { WorldGenerator } from '../src/world/generator';
import { HM, hmFloorY } from '../src/world/biomes';
import { ROCK } from '../src/world/materials';
import { Player } from '../src/entities/player';
import { Progression } from '../src/game/progression';
import { MaterialSimulation } from '../src/sim/simulation';
import { TerrainDestructionSystem } from '../src/sim/destruction';
import { ParticleSystem } from '../src/render/particles';
import { DamageSystem } from '../src/entities/damage';
import { ProjectileSystem, registerProjectiles } from '../src/entities/projectiles';
import { PROJECTILES } from '../src/magic/projectileDefs';
import { defaultShotState } from '../src/magic/shotState';
import type { Run } from '../src/game/run';

registerProjectiles(PROJECTILES);

const fog = { uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0 } };
const noInput = { held: () => false, hit: () => false } as never;
const noEvents = { footstep() {}, jump() {}, land() {} };

function combatWorld(loaded = 4) {
  const w = new VoxelWorld();
  for (let cy = 0; cy < 3; cy++) for (let cz = 0; cz < loaded; cz++) for (let cx = 0; cx < loaded; cx++) w.addChunk(new Chunk(cx, cy, cz, chunkKey(cx, cy, cz)));
  for (let z = 0; z < loaded * 16; z++) for (let x = 0; x < loaded * 16; x++) for (let y = 0; y < 4; y++) w.set(x, y, z, ROCK);
  w.activeSet.clear();
  const sim = new MaterialSimulation(w);
  const destr = new TerrainDestructionSystem(w, sim);
  const parts = new ParticleSystem(w, { value: 600 }, fog);
  const dmg = new DamageSystem(w, sim);
  const proj = new ProjectileSystem(w, sim, destr, dmg, parts, { value: 600 });
  return { w, sim, proj };
}

describe('Holy Mountain collapse', () => {
  it('seals the exit shaft above the player, never around them', () => {
    const seed = 1234;
    const gen = new WorldGenerator(seed);
    const world = new VoxelWorld();
    const floor = hmFloorY(0);
    for (let cy = Math.floor((floor - 60) / 16); cy <= Math.floor((floor + 30) / 16); cy++)
      for (let cz = Math.floor(HM.exitZ / 16) - 1; cz <= Math.floor(HM.exitZ / 16) + 1; cz++)
        for (let cx = Math.floor(HM.exitX / 16) - 1; cx <= Math.floor(HM.exitX / 16) + 1; cx++)
          world.addChunk(new Chunk(cx, cy, cz, chunkKey(cx, cy, cz), gen.generateChunk(cx, cy, cz).mat));
    const player = new Player(HM.exitX + 0.5, floor + 0.05, HM.exitZ + 0.5);
    const run = {
      game: { world, player, particles: { launch() {} }, opts: { seed }, shake: 0 },
      damage: { creatures: [player], hooks: {} },
      sound() {},
      hud: { log() {} },
      enemies: { spawn() {} },
      pickups: { add() {} },
    } as unknown as Run;
    const prog = new Progression(run);
    prog.visited.add(0);
    for (let t = 0; t < 300; t++) {
      player.update(world, noInput, 1 / 60, noEvents);
      prog.tick(1 / 60);
    }
    expect(prog.collapsed.has(0)).toBe(true);
    expect(player.body.stuck).toBe(false);
    expect(player.body.y).toBeLessThan(floor - 20); // kept falling past the seal
  });
});

describe('projectiles', () => {
  it('an arrow reaching an unloaded chunk dies cleanly instead of throwing every tick', () => {
    const { proj } = combatWorld(2);
    proj.fireShot({ state: defaultShotState(), projectiles: [{ projectile: 'arrow' }] }, 20, 16, 20, new THREE.Vector3(1, 0, 1).normalize(), null, 0, 1);
    for (let i = 0; i < 120; i++) expect(() => proj.update(1 / 60)).not.toThrow();
    expect(proj.list.length).toBe(0);
  });

  it('a bomb resting on the ground waits for its full fuse', () => {
    const { proj } = combatWorld();
    proj.fireShot({ state: defaultShotState(), projectiles: [{ projectile: 'bomb' }] }, 20, 12, 20, new THREE.Vector3(1, 0, 0), null, 0, 1);
    let frame = -1;
    for (let i = 0; i < 400; i++) {
      proj.update(1 / 60);
      if (proj.list.length === 0) {
        frame = i;
        break;
      }
    }
    const fuse = PROJECTILES.bomb.lifetime[0];
    expect(frame).toBeGreaterThanOrEqual(fuse - 3);
  });
});
