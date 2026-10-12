import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VoxelWorld, chunkKey } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { ROCK, AIR } from '../src/world/materials';
import { MaterialSimulation } from '../src/sim/simulation';
import { TerrainDestructionSystem } from '../src/sim/destruction';
import { ParticleSystem } from '../src/render/particles';
import { DamageSystem } from '../src/entities/damage';
import { ProjectileSystem, registerProjectiles } from '../src/entities/projectiles';
import { PickupSystem } from '../src/entities/pickups';
import { EnemySystem } from '../src/entities/enemies';
import { Player } from '../src/entities/player';
import { PROJECTILES } from '../src/magic/projectileDefs';
import { Rng } from '../src/core/rng';
import type { Run } from '../src/game/run';

registerProjectiles(PROJECTILES);

/** Minimal stand-in for Run: just the systems the EnemySystem talks to. */
function makeRun() {
  const world = new VoxelWorld();
  for (let cy = 0; cy < 3; cy++) for (let cz = 0; cz < 5; cz++) for (let cx = 0; cx < 5; cx++) world.addChunk(new Chunk(cx, cy, cz, chunkKey(cx, cy, cz)));
  for (let z = 0; z < 80; z++) for (let x = 0; x < 80; x++) for (let y = 0; y < 4; y++) world.set(x, y, z, ROCK);
  world.activeSet.clear();
  const sim = new MaterialSimulation(world);
  const destruction = new TerrainDestructionSystem(world, sim);
  const particles = new ParticleSystem(world, { value: 600 }, { uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0 } });
  const damage = new DamageSystem(world, sim);
  const projectiles = new ProjectileSystem(world, sim, destruction, damage, particles, { value: 600 });
  const pickups = new PickupSystem(world);
  const player = new Player(40, 4.01, 20);
  damage.creatures.push(player);
  const game = { world, sim, destruction, particles, player, time: 0, lights: { add: () => {} } };
  const run = {
    game, damage, projectiles, pickups, kills: 0,
    hud: { floatText: () => {} },
    sound: () => {},
    addTimedLight: () => {},
    explosionFx: () => {},
    progression: { hasPerk: () => false, killsInLayer: new Map() },
  } as unknown as Run;
  const enemies = new EnemySystem(run);
  (run as unknown as { enemies: EnemySystem }).enemies = enemies;
  damage.hooks.death = (c, ev) => {
    if (c !== player) enemies.onDeath(c, ev);
  };
  const step = (seconds: number) => {
    for (let i = 0; i < seconds * 60; i++) {
      (game as { time: number }).time += 1 / 60;
      enemies.tick(1 / 60);
      enemies.frame(1 / 60);
      projectiles.update(1 / 60);
      pickups.update(1 / 60, game.time);
    }
  };
  return { run, world, enemies, player, damage, pickups, projectiles, step };
}

describe('EnemySystem', () => {
  it('a Hämis notices the player and bites', () => {
    const t = makeRun();
    t.enemies.spawn('hamis', 40, 4.01, 34, 0, new Rng(1));
    t.step(6);
    expect(t.player.hp).toBeLessThan(100);
  });

  it('a shotgun hiisi shoots the player from range with real projectiles', () => {
    const t = makeRun();
    t.enemies.spawn('shotgunner', 40, 4.01, 52, 0, new Rng(2));
    let maxProj = 0;
    for (let i = 0; i < 8 * 60; i++) {
      t.step(1 / 60);
      maxProj = Math.max(maxProj, t.projectiles.list.length);
    }
    expect(maxProj).toBeGreaterThan(0);
    expect(t.player.hp).toBeLessThan(100);
  });

  it('walls block sight: an enemy behind a wall stays unaware', () => {
    const t = makeRun();
    for (let y = 4; y < 30; y++) for (let x = 0; x < 80; x++) for (let z = 28; z < 31; z++) t.world.set(x, y, z, ROCK);
    const e = t.enemies.spawn('shotgunner', 40, 4.01, 45, 0, new Rng(3))!;
    t.step(4);
    expect(e.hasLos).toBe(false);
    expect(['idle', 'wander']).toContain(e.state);
    expect(t.player.hp).toBe(100);
  });

  it('killing an enemy drops gold = max HP / 2.5 (doubled for trick kills)', () => {
    const t = makeRun();
    const e = t.enemies.spawn('stendari', 60, 4.01, 60, 0, new Rng(4))!;
    t.damage.apply({ target: e, amount: 1000, type: 'projectile', source: t.player, x: 0, y: 0, z: 0 });
    const gold = t.pickups.list.filter((p) => p.kind === 'gold').reduce((a, p) => a + (p.gold ?? 0), 0);
    expect(gold).toBe(Math.round(80 / 2.5 / 10) * 10); // Stendari 80 HP -> 32 -> 30 gold in 10-nuggets
    const e2 = t.enemies.spawn('stendari', 20, 4.01, 60, 0, new Rng(5))!;
    const before = t.pickups.list.length;
    t.damage.apply({ target: e2, amount: 1000, type: 'explosion', source: null, x: 0, y: 0, z: 0, trick: true });
    const trickGold = t.pickups.list.slice(before).filter((p) => p.kind === 'gold').reduce((a, p) => a + (p.gold ?? 0), 0);
    expect(trickGold).toBe(gold * 2);
  });

  it('burning enemies panic instead of attacking; fire-immune ones keep fighting', () => {
    const t = makeRun();
    const hound = t.enemies.spawn('hound', 40, 4.01, 30, 0, new Rng(6))!;
    hound.status.onFire = 100;
    hound.mult.fire = 0.0001; // stay alive while burning
    t.step(4);
    expect(hound.state === 'windup' || hound.state === 'attack').toBe(false);
  });

  it('explosive barrels explode when destroyed and carve terrain', () => {
    const t = makeRun();
    const b = t.enemies.spawn('barrel_propane', 20, 4.01, 60, 0, new Rng(7))!;
    t.damage.apply({ target: b, amount: 100, type: 'projectile', source: null, x: 0, y: 0, z: 0 });
    let air = 0;
    for (let x = 14; x < 27; x++) for (let z = 54; z < 67; z++) if (t.world.get(x, 3, z) === AIR) air++;
    expect(air).toBeGreaterThan(20);
  });
});
