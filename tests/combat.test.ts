import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VoxelWorld, chunkKey } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { ROCK, WATER, AIR } from '../src/world/materials';
import { MaterialSimulation } from '../src/sim/simulation';
import { TerrainDestructionSystem } from '../src/sim/destruction';
import { ParticleSystem } from '../src/render/particles';
import { DamageSystem } from '../src/entities/damage';
import { ProjectileSystem, registerProjectiles } from '../src/entities/projectiles';
import { Creature } from '../src/entities/creature';
import { PROJECTILES } from '../src/magic/projectileDefs';
import { ENEMY_PROJECTILES } from '../src/entities/enemyDefs';
import { defaultShotState } from '../src/magic/shotState';
import { Wand } from '../src/magic/casting';
import type { Shot, WandStats } from '../src/magic/types';

registerProjectiles(PROJECTILES);
registerProjectiles(ENEMY_PROJECTILES);

class Dummy extends Creature {
  readonly isPlayer: boolean;
  constructor(x: number, y: number, z: number, hp = 100, player = false) {
    super(x, y, z, 1.3, 7, hp, player ? 'player' : 'hiisi');
    this.isPlayer = player;
    if (player) this.mult.explosion = 0.35;
  }
}

function setup() {
  const w = new VoxelWorld();
  for (let cy = 0; cy < 3; cy++) for (let cz = 0; cz < 4; cz++) for (let cx = 0; cx < 4; cx++) w.addChunk(new Chunk(cx, cy, cz, chunkKey(cx, cy, cz)));
  for (let z = 0; z < 64; z++) for (let x = 0; x < 64; x++) for (let y = 0; y < 4; y++) w.set(x, y, z, ROCK);
  w.activeSet.clear();
  const sim = new MaterialSimulation(w);
  const destr = new TerrainDestructionSystem(w, sim);
  const parts = new ParticleSystem(w, { value: 600 }, { uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0 } });
  const dmg = new DamageSystem(w, sim);
  const proj = new ProjectileSystem(w, sim, destr, dmg, parts, { value: 600 });
  return { w, sim, destr, parts, dmg, proj };
}

function shotOf(id: string, n = 1): Shot {
  return { state: defaultShotState(), projectiles: Array.from({ length: n }, () => ({ projectile: id })) };
}

function step(s: ReturnType<typeof setup>, frames: number, creatures: Creature[] = []) {
  for (let i = 0; i < frames; i++) {
    s.proj.update(1 / 60);
    for (const c of creatures) s.dmg.updateCreature(c, 1 / 60);
  }
}

describe('projectiles & damage', () => {
  it('a spark bolt hits a creature for its listed damage', () => {
    const s = setup();
    const target = new Dummy(40, 4.01, 20);
    const caster = new Dummy(10, 4.01, 20, 100, true);
    s.dmg.creatures.push(target, caster);
    s.proj.fireShot(shotOf('spark_bolt'), 12, 8, 20, new THREE.Vector3(1, 0, 0), caster, 0, 1);
    step(s, 30);
    expect(target.hp).toBeCloseTo(97, 5); // Spark Bolt: 3 damage
    expect(caster.hp).toBe(100);
  });

  it('fast projectiles do not tunnel through a 1-voxel wall', () => {
    const s = setup();
    for (let y = 4; y < 20; y++) for (let z = 0; z < 64; z++) s.w.set(30, y, z, ROCK);
    const target = new Dummy(40, 4.01, 20);
    s.dmg.creatures.push(target);
    s.proj.fireShot(shotOf('enemy_sniper'), 12, 8, 20, new THREE.Vector3(1, 0, 0), null, 0, 1);
    step(s, 40);
    expect(target.hp).toBe(100);
    expect(s.proj.list.length).toBe(0);
  });

  it('explosions fall off with distance, are blocked by terrain and hurt the player at 0.35x', () => {
    const s = setup();
    const near = new Dummy(24, 4.01, 20);
    const far = new Dummy(34, 4.01, 20);
    const player = new Dummy(16, 4.01, 20, 100, true);
    s.dmg.creatures.push(near, far, player);
    s.dmg.explosion(20, 6, 20, 10, 100, null);
    expect(100 - near.hp).toBeGreaterThan(100 - far.hp);
    expect(100 - player.hp).toBeLessThan((100 - near.hp) * 0.5);
    // behind a thick wall
    const s2 = setup();
    for (let y = 4; y < 20; y++) for (let z = 0; z < 64; z++) for (let x = 25; x < 28; x++) s2.w.set(x, y, z, ROCK);
    const hidden = new Dummy(30, 4.01, 20);
    s2.dmg.creatures.push(hidden);
    s2.dmg.explosion(20, 6, 20, 10, 100, null);
    expect(100 - hidden.hp).toBeLessThan(15);
  });

  it('your own bomb hurts you (no immunity to your own magic)', () => {
    const s = setup();
    const player = new Dummy(20, 4.01, 20, 100, true);
    s.dmg.creatures.push(player);
    s.proj.fireShot(shotOf('bomb'), 21, 6, 20, new THREE.Vector3(0, -1, 0), player, 0, 1);
    step(s, 260, [player]);
    expect(player.hp).toBeLessThan(80);
    // and the terrain under it was blown away
    let removed = 0;
    for (let x = 10; x < 30; x++) for (let z = 10; z < 30; z++) if (s.w.get(x, 3, z) === AIR) removed++;
    expect(removed).toBeGreaterThan(50);
  });

  it('trigger payloads fire where the carrier hits', () => {
    const s = setup();
    for (let y = 4; y < 30; y++) for (let z = 0; z < 64; z++) for (let x = 40; x < 44; x++) s.w.set(x, y, z, ROCK);
    const caster = new Dummy(10, 4.01, 20, 100, true);
    s.dmg.creatures.push(caster);
    // Spark bolt with trigger -> Bomb payload, built through a real wand
    const stats: WandStats = { name: 't', shuffle: false, actionsPerRound: 1, castDelay: 10, rechargeTime: 20, manaMax: 500, manaChargeSpeed: 100, capacity: 4, spread: 0, speedMult: 1, spriteSeed: 1 };
    const wand = new Wand(stats, [{ id: 'LIGHT_BULLET_TRIGGER', uses: -1 }, { id: 'BOMB', uses: 3 }]);
    const r = wand.cast(() => 0.5);
    expect(r.root.projectiles[0].trigger?.payload.projectiles[0].projectile).toBe('bomb');
    s.proj.fireShot(r.root, 14, 10, 20, new THREE.Vector3(1, 0, 0), caster, 0, 1);
    step(s, 300, [caster]);
    // the bomb landed by the wall and blew a hole into it
    let holes = 0;
    for (let y = 4; y < 20; y++) for (let z = 10; z < 30; z++) if (s.w.get(40, y, z) === AIR) holes++;
    expect(holes).toBeGreaterThan(10);
  });

  it('immunities and healing multipliers apply (Stendari is fire immune, Ukko heals from electricity)', () => {
    const s = setup();
    const stendari = new Dummy(10, 4.01, 10, 80);
    stendari.mult.fire = 0;
    const ukko = new Dummy(20, 4.01, 10, 125);
    ukko.mult.electric = -1;
    ukko.hp = 100;
    s.dmg.apply({ target: stendari, amount: 50, type: 'fire', source: null, x: 0, y: 0, z: 0 });
    s.dmg.apply({ target: ukko, amount: 10, type: 'electric', source: null, x: 0, y: 0, z: 0 });
    expect(stendari.hp).toBe(80);
    expect(ukko.hp).toBe(110);
  });

  it('burning deals damage over time and water puts the fire out', () => {
    const s = setup();
    const c = new Dummy(20, 4.01, 20);
    s.dmg.creatures.push(c);
    s.dmg.setOnFire(c, 5);
    step(s, 60, [c]);
    expect(c.hp).toBeLessThan(99);
    expect(c.status.onFire).toBeGreaterThan(0);
    // dunk in water
    for (let y = 4; y < 12; y++) for (let z = 18; z < 23; z++) for (let x = 18; x < 23; x++) s.w.set(x, y, z, WATER);
    step(s, 5, [c]);
    expect(c.status.onFire).toBe(0);
    expect(c.status.wet).toBeGreaterThan(0);
    // wet creatures cannot be ignited
    s.dmg.setOnFire(c, 5);
    expect(c.status.onFire).toBe(0);
  });

  it('toxic stain drains HP but cannot kill on its own', () => {
    const s = setup();
    const c = new Dummy(20, 4.01, 20, 20);
    c.status.toxic = 1;
    for (let i = 0; i < 60 * 60; i++) {
      c.status.toxic = 1;
      s.dmg.updateCreature(c, 1 / 60);
    }
    expect(c.alive).toBe(true);
    expect(c.hp).toBeGreaterThan(0);
    expect(c.hp).toBeLessThan(2);
  });

  it('death is reported once and dead creatures take no more damage', () => {
    const s = setup();
    const c = new Dummy(20, 4.01, 20, 10);
    let deaths = 0;
    s.dmg.hooks.death = () => deaths++;
    s.dmg.apply({ target: c, amount: 25, type: 'projectile', source: null, x: 0, y: 0, z: 0 });
    s.dmg.apply({ target: c, amount: 25, type: 'projectile', source: null, x: 0, y: 0, z: 0 });
    expect(c.alive).toBe(false);
    expect(deaths).toBe(1);
  });
});
