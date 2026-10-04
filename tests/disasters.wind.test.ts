import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../src/world/blocks/blocks';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { lightChunkLocal } from '../src/world/light';
import { S, BLOCKS } from '../src/world/blocks/registry';
import { TornadoPath, tornadoLife, funnelRadius, axisOffset, vortexWind, influence } from '../src/game/disasters/wind/vortex';
import { Mat, matOf, windResistance } from '../src/game/disasters/wind/materials';
import { Tornado } from '../src/game/disasters/tornado';
import { DISASTERS } from '../src/game/disasters/kit';

function flatChunk(cx: number, cz: number, h: number) {
  const c = new Chunk(cx, cz);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < h; y++) c.set(x, y, z, S(y === h - 1 ? 'grass_block' : y > h - 4 ? 'dirt' : 'stone'));
  c.heightmap.fill(h);
  lightChunkLocal(c);
  c.status = 'ready';
  return c;
}

function fakeGame(world: World) {
  return {
    world, dimension: 'overworld', renderExtras: {}, events: { emit() {} },
    entities: { list: [] as any[] },
    weather: { rain: 0, thunder: 0, raining: false, thundering: false, rainTime: 5000, thunderTime: 9000 },
  } as any;
}

describe('tornado path', () => {
  it('is deterministic and drifts along the facing direction', () => {
    const a = new TornadoPath(42, 0, 0, 0, 1, { duration: 60, speed: 2.2 });
    const b = new TornadoPath(42, 0, 0, 0, 1, { duration: 60, speed: 2.2 });
    expect(a.at(37.3)).toEqual(b.at(37.3));
    for (const seed of [1, 2, 3, 99, 12345]) {
      for (const [fx, fz] of [[1, 0], [0, -1], [0.6, 0.8]]) {
        const p = new TornadoPath(seed, 100, -50, fx, fz, { duration: 55, speed: 2.2 });
        const e = p.at(55);
        const dx = e.x - 100, dz = e.z + 50;
        const along = dx * fx + dz * fz;
        const dist = Math.hypot(dx, dz);
        expect(along).toBeGreaterThan(0.6 * dist); // roughly along the facing
        expect(dist).toBeGreaterThan(40);
        expect(dist).toBeLessThan(200);
        // never jumps: max step consistent with the speed
        for (let t = 0; t < 55; t += 0.5) {
          const p0 = p.at(t), p1 = p.at(t + 0.5);
          expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeLessThan(0.5 * 2.2 * 1.5);
        }
      }
    }
  });

  it('starts at the spawner', () => {
    const p = new TornadoPath(7, 10.5, 20.5, 1, 0, { duration: 50 });
    expect(p.at(0)).toEqual({ x: 10.5, z: 20.5 });
  });
});

describe('tornado life cycle and funnel', () => {
  it('lowers, touches down, matures, ropes out and fades', () => {
    const D = 50;
    const L = (t: number) => ({ ...tornadoLife(t, D) });
    expect(L(0).reach).toBe(0);
    expect(L(0).strength).toBe(0);
    expect(L(3).reach).toBeGreaterThan(0);
    expect(L(3).reach).toBeLessThan(1);
    const mid = L(25);
    expect(mid.reach).toBeCloseTo(1, 5);
    expect(mid.strength).toBeCloseTo(1, 5);
    expect(mid.rope).toBe(0);
    expect(L(D - 5).rope).toBeGreaterThan(0.5);
    expect(L(D - 5).strength).toBeLessThan(0.6);
    expect(L(D).fade).toBe(0);
    expect(L(D).strength).toBe(0);
  });

  it('funnel is thin at the ground and widens into the cloud; roping out thins it', () => {
    let prev = 0;
    for (let u = 0; u <= 1; u += 0.1) {
      const r = funnelRadius(u, 2.5, 16, 0);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
    expect(funnelRadius(0, 2.5, 16, 0)).toBeCloseTo(2.5);
    expect(funnelRadius(1, 2.5, 16, 0)).toBeCloseTo(16);
    expect(funnelRadius(0.5, 2.5, 16, 1)).toBeLessThan(funnelRadius(0.5, 2.5, 16, 0) * 0.5);
    // axis: the base sits exactly on the path, the top leans
    const s = { H: 60, rBase: 2.5, rTop: 16, tiltX: -8, tiltZ: 0, wob: 2, s1: 1, s2: 2 };
    expect(axisOffset(0, 12, s).x).toBeCloseTo(0);
    expect(axisOffset(0, 12, s).z).toBeCloseTo(0);
    expect(axisOffset(1, 12, s).x).toBeCloseTo(-8);
  });

  it('wind peaks at the core radius and decays outside', () => {
    const rc = 3;
    const at = (r: number) => vortexWind(r, 2, rc, 1).vt;
    expect(at(rc)).toBeGreaterThan(at(rc / 2));
    expect(at(rc)).toBeGreaterThan(at(rc * 3));
    expect(at(rc * 3)).toBeGreaterThan(0);
    expect(vortexWind(rc * 2, 1, rc, 1).vr).toBeLessThan(0); // inflow
    expect(vortexWind(0.5, 5, rc, 1).vy).toBeGreaterThan(5); // updraft in the core
    expect(influence(1, rc)).toBe(1);
    expect(influence(100, rc)).toBe(0);
  });
});

describe('wind materials', () => {
  it('soft blocks tear out easily, rock and fluids do not', () => {
    const soft = ['oak_leaves', 'short_grass', 'glass', 'oak_planks', 'oak_log', 'grass_block', 'dirt', 'sand'];
    for (const n of soft) expect(windResistance(S(n)), n).toBeLessThan(0.65);
    expect(windResistance(S('stone'))).toBeGreaterThan(1);
    expect(windResistance(S('bedrock'))).toBe(Infinity);
    expect(windResistance(S('water'))).toBe(Infinity);
    expect(windResistance(0)).toBe(Infinity);
    expect(matOf(S('oak_leaves'))).toBe(Mat.Leaves);
    expect(matOf(S('glass'))).toBe(Mat.Glass);
    expect(matOf(S('oak_log'))).toBe(Mat.Wood);
    expect(matOf(S('sand'))).toBe(Mat.Ground);
    expect(matOf(S('cobblestone'))).toBe(Mat.Built);
    // every block classifies without throwing
    for (const b of BLOCKS) if (b) windResistance(b.id << 4);
  });
});

describe('tornado simulation (headless)', () => {
  it('rips a damage path of soft blocks within the tick budget and cleans up', () => {
    const world = new World('overworld', 1);
    for (let cx = -4; cx <= 10; cx++) for (let cz = -4; cz <= 4; cz++) world.addChunk(flatChunk(cx, cz, 64));
    // a small wooden hut and some trees along the path
    for (let x = 20; x < 25; x++) for (let z = -2; z < 3; z++) for (let y = 64; y < 68; y++) {
      const wall = x === 20 || x === 24 || z === -2 || z === 2 || y === 67;
      if (wall) world.setBlock(x, y, z, S(y === 67 ? 'oak_planks' : 'cobblestone'));
    }
    for (const tx of [40, 60, 80]) {
      for (let y = 64; y < 69; y++) world.setBlock(tx, y, 0, S('oak_log'));
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let y = 67; y < 70; y++) if (dx || dz) world.setBlock(tx + dx, y, dz, S('oak_leaves'));
    }
    const game = fakeGame(world);
    expect(DISASTERS.has('tornado')).toBe(true);
    const t = new Tornado(game, 2, 64, 0, 1, 0, { seed: 5, duration: 48 });
    let ticks = 0, worst = 0;
    while (ticks < 2000) {
      const a = performance.now();
      const alive = t.tick(game);
      worst = Math.max(worst, performance.now() - a);
      ticks++;
      if (!alive) break;
    }
    t.dispose(game);
    expect(ticks).toBe(Math.ceil(48 / 0.05));
    expect(t.stats.ripped).toBeGreaterThan(150);
    expect(worst).toBeLessThan(40); // generous for CI; the budget is a few ms
    // rock is never touched; the trench stays shallow
    for (let x = -10; x < 170; x++) for (let z = -60; z < 60; z++) {
      if (!world.getChunk(x >> 4, z >> 4)) continue;
      expect(world.getBlock(x, 60, z)).toBe(S('stone'));
    }
    // the weather returns to what it was
    expect(game.weather.raining).toBe(false);
    expect(game.weather.thundering).toBe(false);
  });

  it('lifts and flings mobs near the funnel', () => {
    const world = new World('overworld', 1);
    for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) world.addChunk(flatChunk(cx, cz, 64));
    const game = fakeGame(world);
    const mob: any = { id: 77, type: 'cow', removed: false, pos: new THREE.Vector3(3.5, 64, 0.5), vel: new THREE.Vector3(), height: 1.4, mass: 600, onGround: true };
    game.entities.list.push(mob);
    const t = new Tornado(game, 0, 64, 0, 1, 0, { seed: 9, duration: 50 });
    let maxUp = 0;
    for (let i = 0; i < 400; i++) {
      t.tick(game);
      // integrate the mob crudely (gravity + velocity) to see it rise
      mob.pos.addScaledVector(mob.vel, 0.05);
      mob.vel.y -= 32 * 0.05;
      mob.vel.x *= Math.exp(-0.05 * 2); mob.vel.z *= Math.exp(-0.05 * 2);
      if (mob.pos.y < 64) { mob.pos.y = 64; if (mob.vel.y < 0) mob.vel.y = 0; }
      maxUp = Math.max(maxUp, mob.pos.y - 64);
    }
    t.dispose(game);
    expect(maxUp).toBeGreaterThan(8);
    expect(t.stats.lifted).toBeGreaterThan(0);
  });
});
