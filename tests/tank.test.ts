import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../src/world/blocks/blocks';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { S } from '../src/world/blocks/registry';
import { TankBody, TANK } from '../src/entity/vehicles/tankPhysics';

function flatWorld(h = 64, R = 4, block = 'grass_block') {
  const w = new World('overworld', 1);
  w.lightEnabled = false;
  for (let cx = -R; cx <= R; cx++)
    for (let cz = -R; cz <= R; cz++) {
      const c = new Chunk(cx, cz);
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < h; y++) c.set(x, y, z, S(y === h - 1 ? block : 'stone'));
      c.status = 'ready';
      w.addChunk(c);
    }
  return w;
}

/** A long paved strip (x -16..15, z -656..31) for top-speed runs. */
function strip(block = 'stone') {
  const w = new World('overworld', 1);
  w.lightEnabled = false;
  for (let cx = -1; cx <= 0; cx++)
    for (let cz = -41; cz <= 1; cz++) {
      const c = new Chunk(cx, cz);
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < 64; y++) c.set(x, y, z, S(y === 63 ? block : 'stone'));
      c.status = 'ready';
      w.addChunk(c);
    }
  return w;
}

function tank(world: World, x = 0.5, y = 64, z = 0.5, yaw = 0) {
  const b = new TankBody(new THREE.Vector3(x, y, z), new THREE.Vector3());
  b.setHeading(yaw);
  b.engineOn = true;
  b.driven = true;
  b.spool = 0.2;
  return b;
}
const run = (b: TankBody, w: World, secs: number, fn?: (t: number) => void) => {
  for (let t = 0; t < secs; t += 1 / 60) {
    fn?.(t);
    b.step(w, 1 / 60);
  }
};

describe('M1 Abrams driving model', () => {
  it('settles level on its suspension', () => {
    const w = flatWorld();
    const b = tank(w, 0.5, 64.6);
    run(b, w, 4);
    expect(Math.abs(b.pos.y - 64)).toBeLessThan(0.05);
    expect(Math.abs(b.pitch)).toBeLessThan(0.01);
    expect(Math.abs(b.roll)).toBeLessThan(0.01);
    expect(Math.abs(b.vel.length())).toBeLessThan(0.05);
    expect(b.contacts).toBeGreaterThanOrEqual(14);
  });

  it('accelerates like a 62 t turbine tank and is governed at 67 km/h on hard ground', () => {
    const w = strip('stone');
    const b = tank(w);
    run(b, w, 1);
    let t10 = -1;
    run(b, w, 34, (t) => {
      b.input.throttle = 1;
      if (t10 < 0 && b.speed > 10) t10 = t;
    });
    expect(b.speed).toBeGreaterThan(17.5);
    expect(b.speed).toBeLessThan(19.2);
    expect(t10).toBeGreaterThan(3);
    expect(t10).toBeLessThan(12);
  });

  it('is slower cross-country on sand', () => {
    const w = strip('sand');
    const b = tank(w);
    run(b, w, 1);
    run(b, w, 30, () => { b.input.throttle = 1; });
    expect(b.speed).toBeGreaterThan(7);
    expect(b.speed).toBeLessThan(16);
  });

  it('pivots in place and brakes to a stop', () => {
    const w = flatWorld();
    const b = tank(w);
    run(b, w, 1);
    run(b, w, 3, () => { b.input.steer = 1; });
    expect(b.yaw).toBeLessThan(-0.6); // turned right
    expect(Math.hypot(b.pos.x - 0.5, b.pos.z - 0.5)).toBeLessThan(0.6);
    b.input.steer = 0;
    run(b, w, 6, () => { b.input.throttle = 1; });
    b.input.throttle = 0;
    b.input.brake = true;
    run(b, w, 4);
    expect(Math.abs(b.speed)).toBeLessThan(0.05);
  });

  it('climbs a one-block step but stops at a wall', () => {
    const w = flatWorld();
    // step: from z = -12 forward the ground is one block higher; wall 3 high at z = -30
    for (let x = -6; x <= 6; x++) {
      for (let z = -40; z <= -12; z++) w.setBlock(x, 64, z, S('grass_block'));
      for (let z = -40; z <= -30; z++) for (let y = 65; y <= 67; y++) w.setBlock(x, y, z, S('stone'));
    }
    const b = tank(w);
    run(b, w, 1);
    let hits = 0;
    run(b, w, 20, () => {
      b.input.throttle = 0.6;
      hits += b.events.wallHits.length;
    });
    expect(b.pos.y).toBeGreaterThan(64.8); // up on the step
    expect(b.pos.z).toBeGreaterThan(-30 + TANK.halfLength - 0.5); // stopped before the wall
    expect(hits).toBeGreaterThan(0);
  });

  it('holds still on a slope with the throttle released', () => {
    const w = flatWorld();
    // 1-in-4 ramp along -z
    for (let x = -6; x <= 6; x++) for (let z = -30; z <= 10; z++) {
      const top = 64 + Math.max(0, Math.floor((-z - 2) / 4));
      for (let y = 64; y < top; y++) w.setBlock(x, y, z, S('stone'));
    }
    const b = tank(w, 0.5, 66, -12);
    run(b, w, 3);
    const z0 = b.pos.z;
    run(b, w, 3);
    expect(Math.abs(b.pos.z - z0)).toBeLessThan(0.3);
  });

  it('turret traverses at its rated speed and the gun respects its limits', () => {
    const w = flatWorld();
    const b = tank(w);
    run(b, w, 1);
    b.input.aimYaw = Math.PI / 2; // 90° left
    b.input.aimPitch = 0.8; // above max elevation
    run(b, w, 1);
    expect(b.turretYaw).toBeGreaterThan(0.4);
    expect(b.turretYaw).toBeLessThan(0.8);
    run(b, w, 2);
    expect(Math.abs(b.turretYaw - Math.PI / 2)).toBeLessThan(0.02);
    expect(b.gun).toBeCloseTo(TANK.gunMax, 2);
  });

  it('crushes soft blocks in its path', () => {
    const w = flatWorld();
    for (let x = -3; x <= 3; x++) for (let y = 64; y <= 66; y++) w.setBlock(x, y, -12, S('oak_leaves'));
    const b = tank(w);
    run(b, w, 1);
    let crushed = 0;
    run(b, w, 8, () => {
      b.input.throttle = 0.5;
      for (const c of b.events.crushed) { w.setBlock(c.x, c.y, c.z, 0); crushed++; }
    });
    expect(crushed).toBeGreaterThan(4);
    expect(b.pos.z).toBeLessThan(-14);
  });
});

import { TankVisual } from '../src/entity/vehicles/tankModel';
import { CONTACTS } from '../src/entity/vehicles/tankPhysics';

describe('M1 Abrams model', () => {
  it('has real proportions and wraps the tracks around the wheels', () => {
    const v = new TankVisual();
    v.update({
      pos: new THREE.Vector3(), quat: new THREE.Quaternion(), turretYaw: 0, gun: 0, recoil: 0, compression: new Float32Array(CONTACTS.length),
      trackL: 1.234, trackR: 2.5, light: 0xf000, hurt: 0, engine: 1, crewed: false, hideCrew: false, destroyed: false, camDist: 10, time: 0,
    });
    v.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(v.root);
    const size = box.getSize(new THREE.Vector3());
    // 7.93 m hull, 9.8 m gun forward; 3.66 m wide; 2.44 m to the turret roof (+ antennas)
    expect(size.z).toBeGreaterThan(9.3);
    expect(size.z).toBeLessThan(10.4);
    expect(size.x).toBeGreaterThan(3.6);
    expect(size.x).toBeLessThan(4.1);
    expect(box.min.y).toBeGreaterThan(-0.15);
    expect(box.min.y).toBeLessThan(0.05);
    // every track link stays within the running gear envelope
    let n = 0;
    v.root.traverse((o: any) => {
      if (!o.isMesh || o.geometry.attributes.position.usage !== THREE.DynamicDrawUsage) return;
      const a = o.geometry.attributes.position.array as Float32Array;
      for (let i = 1; i < a.length; i += 3) {
        expect(a[i]).toBeGreaterThan(-0.2);
        expect(a[i]).toBeLessThan(1.25);
        n++;
      }
    });
    expect(n).toBeGreaterThan(1000);
    v.dispose();
  });
});

import { TankEntity } from '../src/entity/vehicles/tank';

describe('M1 Abrams entity', () => {
  function setup() {
    const w = flatWorld(64, 5);
    const events: [string, any][] = [];
    const game: any = {
      world: w, ticks: 0, player: null, entities: { list: [] as any[] }, input: { isDown: () => false, wasPressedTick: () => false },
      cameraCtl: { perspective: 'third_back' }, events: { emit: (n: string, e: any) => events.push([n, e]) },
    };
    const t = new TankEntity();
    t.init(game, w);
    t.setPos(0.5, 64.3, 0.5);
    t.setHeading(0);
    game.entities.list.push(t);
    const player: any = { pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), vel: new THREE.Vector3(), updateBox() {}, setPos(x: number, y: number, z: number) { this.pos.set(x, y, z); }, creative: true, dead: false, vehicle: null };
    return { w, game, t, player, events };
  }

  it('boards, drives, fires with recoil and reload, and exits', () => {
    const { game, t, player, events } = setup();
    for (let i = 0; i < 60; i++) t.physicsStep(1 / 60);
    t.interact(player);
    expect(player.vehicle).toBe(t);
    const inp = { isDown: (a: string) => a === 'forward' };
    for (let i = 0; i < 300; i++) { t.pilotInput(inp, true); t.physicsStep(1 / 60); }
    expect(t.body.speed).toBeGreaterThan(2);
    const fire = { isDown: (a: string) => a === 'attack' };
    t.pilotInput(fire, true);
    t.physicsStep(1 / 60);
    expect(events.some(([n, e]) => n === 'tankFire' && e.kind === 'main')).toBe(true);
    expect(t.reload).toBeGreaterThan(5);
    expect(t.recoil).toBeGreaterThan(0.3);
    // a second shot right away is refused (reloading)
    t.pilotInput({ isDown: () => false }, true);
    t.pilotInput(fire, true);
    t.physicsStep(1 / 60);
    expect(events.filter(([n, e]) => n === 'tankFire' && e.kind === 'main').length).toBe(1);
    for (let i = 0; i < 300; i++) { t.pilotInput({ isDown: (a: string) => a === 'jump' }, true); t.physicsStep(1 / 60); }
    t.dismount();
    expect(player.vehicle).toBe(null);
    expect(player.pos.distanceTo(t.pos)).toBeGreaterThan(1.5);
    void game;
  });

  it('crushes a mob in its path and survives saving', () => {
    const { game, t, player } = setup();
    for (let i = 0; i < 60; i++) t.physicsStep(1 / 60);
    t.interact(player);
    let hurt = 0;
    const mob: any = { pos: new THREE.Vector3(0.5, 64, -8), width: 0.6, height: 1.9, removed: false, dead: false, hurt: (_s: any, a: number) => { hurt += a; return true; }, updateBox() {} };
    game.entities.list.push(mob);
    const inp = { isDown: (a: string) => a === 'forward' };
    for (let i = 0; i < 240; i++) { t.pilotInput(inp, true); t.physicsStep(1 / 60); }
    expect(hurt).toBeGreaterThanOrEqual(40);
    t.body.turretYaw = 1.1;
    t.health = 250;
    const o = t.serialize();
    const t2 = new TankEntity();
    t2.deserialize(JSON.parse(JSON.stringify(o)));
    expect(t2.body.turretYaw).toBeCloseTo(1.1, 5);
    expect(t2.health).toBe(250);
    expect(t2.body.yaw).toBeCloseTo(t.body.yaw, 5);
  });
});
