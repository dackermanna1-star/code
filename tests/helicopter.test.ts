import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../src/world/blocks/blocks';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { lightChunkLocal } from '../src/world/light';
import { S } from '../src/world/blocks/registry';
import {
  HeliBody, HELI, HELI_WEIGHT, hoverCollective, groundEffect, translationalLift, impactDamage,
} from '../src/entity/vehicles/heliPhysics';
import { HelicopterEntity } from '../src/entity/vehicles/helicopter';
import { HeliVisual } from '../src/entity/vehicles/heliModel';
import { Player } from '../src/entity/player';

const DT = 1 / 60;
const GROUND = 64;

/** Flat world: stone with a grass top at y = 63 (surface y = 64); `water` chunks hold a lake down to y = 52. */
function flatWorld(water: (cx: number, cz: number) => boolean = () => false) {
  const world = new World('overworld', 7);
  for (let cx = -4; cx <= 4; cx++)
    for (let cz = -4; cz <= 4; cz++) {
      const c = new Chunk(cx, cz);
      const lake = water(cx, cz);
      for (let x = 0; x < 16; x++)
        for (let z = 0; z < 16; z++)
          for (let y = 0; y < GROUND; y++) {
            if (lake && y >= 52) c.set(x, y, z, S('water'));
            else c.set(x, y, z, S(y === GROUND - 1 ? 'grass_block' : 'stone'));
          }
      lightChunkLocal(c);
      c.status = 'ready';
      world.addChunk(c);
    }
  return world;
}

function fakeGame(world: World) {
  const events: { type: string; payload: any }[] = [];
  return { world, events: { emit: (type: string, payload: any) => events.push({ type, payload }) }, log: events, gamerules: {} } as any;
}

function body(world: World, y: number) {
  const b = new HeliBody();
  b.setPosition(0.5, y, 0.5);
  b.setHeading(0);
  return { b, step: (n: number) => { for (let i = 0; i < n; i++) b.step(world, DT); } };
}

describe('helicopter flight model', () => {
  it('pure helpers: ground effect, translational lift, hover collective, impact damage', () => {
    expect(groundEffect(Infinity)).toBe(1);
    expect(groundEffect(2.8)).toBeGreaterThan(1.1);
    expect(groundEffect(2.8)).toBeLessThanOrEqual(1.2);
    expect(groundEffect(20)).toBeLessThan(1.01);
    expect(translationalLift(0)).toBe(1);
    expect(translationalLift(15)).toBeCloseTo(1.12, 3);
    // hover needs about half the collective out of ground effect, more with a slow rotor
    expect(hoverCollective(1)).toBeCloseTo(1 / HELI.thrustRatio, 5);
    expect(hoverCollective(0.6)).toBeGreaterThan(1);
    expect(impactDamage(3, true)).toBe(0);
    expect(impactDamage(8, true)).toBeGreaterThan(10);
    expect(impactDamage(8, false)).toBeGreaterThan(impactDamage(8, true));
  });

  it('holds a hover at the equilibrium collective (out of ground effect)', () => {
    const world = flatWorld();
    const { b, step } = body(world, 120);
    b.engineOn = true;
    b.n1 = b.rpm = 1;
    step(1);
    b.collectiveOverride = hoverCollective(1, groundEffect(b.agl));
    const y0 = b.pos.y;
    step(180);
    expect(Math.abs(b.vel.y)).toBeLessThan(0.1);
    expect(Math.abs(b.pos.y - y0)).toBeLessThan(0.25);
    expect(Math.hypot(b.vel.x, b.vel.z)).toBeLessThan(0.05);
    // 20 % more collective climbs (heave damping limits the rate), 20 % less sinks
    b.collectiveOverride = hoverCollective(1) * 1.2;
    step(180);
    expect(b.vel.y).toBeGreaterThan(1.5);
    expect(b.vel.y).toBeLessThan(3);
    b.collectiveOverride = hoverCollective(1) * 0.8;
    step(300);
    expect(b.vel.y).toBeLessThan(-1.5);
  });

  it('accelerates forward when pitched nose-down (thrust tilts with the body)', () => {
    const world = flatWorld();
    const { b, step } = body(world, 120);
    b.engineOn = true;
    b.n1 = b.rpm = 1;
    const pitch = -0.26; // 15° nose down, no pilot: the attitude stays where it is
    b.quat.setFromEuler(new THREE.Euler(pitch, 0, 0, 'YXZ'));
    b.collectiveOverride = hoverCollective(1) / Math.cos(pitch);
    step(60);
    expect(b.vel.z).toBeLessThan(-2.5); // forward = -Z
    expect(Math.abs(b.vel.y)).toBeLessThan(1);
    expect(b.pitchAngle()).toBeLessThan(-0.2);
  });

  it('pilot assists: W pitches down and flies forward at constant altitude, release levels and slows', () => {
    const world = flatWorld();
    const { b, step } = body(world, 110);
    b.engineOn = true;
    b.n1 = b.rpm = 1;
    b.piloted = true;
    b.input.fwd = 1;
    const y0 = b.pos.y;
    step(300);
    expect(b.pitchAngle()).toBeLessThan(-HELI.maxPitch * 0.7);
    expect(b.pitchAngle()).toBeGreaterThan(-HELI.maxPitch - 0.05);
    const v5 = -b.vel.z;
    expect(v5).toBeGreaterThan(15);
    expect(Math.abs(b.pos.y - y0)).toBeLessThan(4);
    b.input.fwd = 0;
    step(240);
    expect(Math.abs(b.pitchAngle())).toBeLessThan(0.08);
    expect(Math.abs(b.rollAngle())).toBeLessThan(0.05);
    expect(-b.vel.z).toBeLessThan(v5);
    // bank right with D: rolls right (negative roll) and drifts right (+X)
    b.input.right = 1;
    step(120);
    expect(b.rollAngle()).toBeLessThan(-HELI.maxBank * 0.6);
    expect(b.rollAngle()).toBeGreaterThan(-HELI.maxBank - 0.05);
    expect(b.vel.x).toBeGreaterThan(1);
  });

  it('pedals yaw the helicopter and Space climbs', () => {
    const world = flatWorld();
    const { b, step } = body(world, 100);
    b.engineOn = true;
    b.n1 = b.rpm = 1;
    b.piloted = true;
    b.input.pedal = 1; // Q: yaw left
    step(60);
    expect(b.heading()).toBeGreaterThan(0.5);
    b.input.pedal = 0;
    b.input.up = true;
    step(180);
    expect(b.vel.y).toBeGreaterThan(4);
  });

  it('settles on its skids on flat ground (spring suspension, no damage)', () => {
    const world = flatWorld();
    const game = fakeGame(world);
    const h = new HelicopterEntity();
    h.init(game, world);
    h.setPos(0.5, GROUND + 0.5, 0.5);
    for (let i = 0; i < 240; i++) h.physicsStep(DT);
    const b = h.body;
    expect(b.contacts).toBe(4);
    expect(h.onGround).toBe(true);
    expect(h.vel.length()).toBeLessThan(0.05);
    const staticComp = HELI_WEIGHT / 4 / HELI.skidK;
    expect(h.pos.y).toBeGreaterThan(GROUND - staticComp - 0.03);
    expect(h.pos.y).toBeLessThan(GROUND);
    for (const c of b.compression) expect(c).toBeCloseTo(staticComp, 2);
    expect(Math.abs(b.pitchAngle())).toBeLessThan(0.02);
    expect(h.health).toBe(h.maxHealth);
  });

  it('a slow rotor cannot lift off; spooled up it takes off', () => {
    const world = flatWorld();
    const { b, step } = body(world, GROUND);
    step(60);
    b.engineOn = true;
    b.piloted = true;
    b.input.up = true;
    step(90); // 1.5 s: still spooling
    expect(b.rpm).toBeLessThan(0.6);
    expect(b.contacts).toBeGreaterThanOrEqual(2);
    expect(b.pos.y).toBeLessThan(GROUND + 0.05);
    step(540); // engine + rotor at speed
    expect(b.rpm).toBeGreaterThan(0.95);
    expect(b.contacts).toBe(0);
    expect(b.pos.y).toBeGreaterThan(GROUND + 5);
  });

  it('a hard landing damages the hull; a high-speed crash destroys it', () => {
    const world = flatWorld();
    const game = fakeGame(world);
    const h = new HelicopterEntity();
    h.init(game, world);
    h.setPos(0.5, GROUND + 0.3, 0.5);
    h.vel.set(0, -8, 0);
    (h as any).lastVel.copy(h.vel);
    for (let i = 0; i < 120 && !h.removed; i++) h.physicsStep(DT);
    expect(h.destroyed).toBe(false);
    expect(h.health).toBeLessThan(h.maxHealth - 8);
    expect(h.health).toBeGreaterThan(0);
    expect(game.log.some((e: any) => e.type === 'helicopterImpact')).toBe(true);

    const c = new HelicopterEntity();
    c.init(game, world);
    c.setPos(20.5, GROUND + 0.4, 0.5);
    c.vel.set(0, -22, 0);
    (c as any).lastVel.copy(c.vel);
    for (let i = 0; i < 60 && !c.removed; i++) c.physicsStep(DT);
    expect(c.destroyed).toBe(true);
    expect(c.health).toBe(0);
    expect(game.log.some((e: any) => e.type === 'helicopterDestroyed')).toBe(true);
  });

  it('flying into a wall at speed is a crash', () => {
    const world = flatWorld();
    for (let x = -6; x <= 6; x++) for (let y = GROUND; y < GROUND + 12; y++) world.setBlock(x, y, -12, S('stone'));
    const game = fakeGame(world);
    const h = new HelicopterEntity();
    h.init(game, world);
    h.setPos(0.5, GROUND + 3, 0.5);
    h.body.engineOn = true;
    h.body.n1 = h.body.rpm = 1;
    h.body.collectiveOverride = hoverCollective(1);
    h.vel.set(0, 0, -20);
    (h as any).lastVel.copy(h.vel);
    for (let i = 0; i < 90 && !h.removed; i++) h.physicsStep(DT);
    expect(h.destroyed).toBe(true);
  });

  it('lands on water and sinks', () => {
    const world = flatWorld((cx, cz) => Math.abs(cx) <= 1 && Math.abs(cz) <= 1);
    const game = fakeGame(world);
    const h = new HelicopterEntity();
    h.init(game, world);
    h.setPos(0.5, GROUND + 1, 0.5);
    for (let i = 0; i < 60 * 8; i++) h.physicsStep(DT);
    expect(h.body.waterDepth).toBeGreaterThan(0.9);
    expect(h.pos.y).toBeLessThan(GROUND - 3);
    expect(h.vel.y).toBeLessThan(0);
    expect(h.vel.y).toBeGreaterThan(-3); // slowly
    expect(game.log.some((e: any) => e.type === 'helicopterSplash')).toBe(true);
  });

  it('saves position, attitude and health', () => {
    const world = flatWorld();
    const game = fakeGame(world);
    const h = new HelicopterEntity();
    h.init(game, world);
    h.setPos(3.5, GROUND + 10, -2.5);
    h.setHeading(1.2);
    h.health = 23;
    const o = JSON.parse(JSON.stringify(h.serialize()));
    expect(o.type).toBe('helicopter');
    const r = new HelicopterEntity();
    r.deserialize(o);
    r.init(game, world);
    expect(r.pos.distanceTo(h.pos)).toBeLessThan(1e-6);
    expect(r.health).toBe(23);
    expect(r.body.heading()).toBeCloseTo(1.2, 5);
    expect(r.body.c.y).toBeCloseTo(GROUND + 10 + HELI.com.y, 5);
  });

  it('builds the procedural model (merged PBR parts, glass, rotors) with sane proportions', () => {
    const v = new HeliVisual(null);
    const meshes: THREE.Mesh[] = [];
    v.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    expect(meshes.length).toBeGreaterThan(15);
    expect(meshes.length).toBeLessThan(40);
    let tris = 0;
    for (const m of meshes) {
      const g = m.geometry;
      for (const a of ['position', 'normal', 'uv']) expect(g.getAttribute(a), `${m.name}.${a}`).toBeTruthy();
      expect(Number.isFinite(g.boundingSphere?.radius ?? g.computeBoundingSphere() ?? 0)).toBe(true);
      tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    }
    expect(tris).toBeGreaterThan(20000);
    expect(tris).toBeLessThan(200000);
    v.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const m of meshes) if (m.name === 'paint') box.setFromObject(m);
    // body frame: nose ~-2.05, tail ~+6.3, cabin ±0.8 wide, belly 0.58, cowling top ~2.4 (relative to the CoM)
    expect(box.min.z).toBeCloseTo(-2.05, 1);
    expect(box.max.z).toBeGreaterThan(6.1);
    expect(box.max.x).toBeGreaterThan(1.0); // stabiliser endplates
    expect(box.max.y + HELI.com.y).toBeGreaterThan(2.6); // fin
    const blade = meshes.find((m) => m.name === 'blade0')!;
    blade.geometry.computeBoundingBox();
    expect(blade.geometry.boundingBox!.max.x).toBeCloseTo(HELI.rotorRadius, 2);
    // forward pass: glass + 2 rotor discs + light halos
    expect(v.forward.children.length).toBe(3 + 6);
    // one animation frame
    v.update({
      com: new THREE.Vector3(0, 70, 0), quat: new THREE.Quaternion(), dt: 1 / 60, time: 1, rpm: 1, n1: 1, collective: 0.5,
      stickX: 0.2, stickY: 0.5, discX: -0.1, discZ: 0, pedal: 0, load: 1, compression: [0.05, 0.05, 0.05, 0.05], vel: new THREE.Vector3(0, 0, -20),
      powered: true, piloted: true, showPilot: true, light: 0xf000, hurt: 0, altitude: 70, airspeed: 20, vspeed: 0, heading: 0, roll: 0, camDist: 10,
    });
    const glass = v.forward.children[0];
    expect(glass.matrix.elements[13]).toBeCloseTo(70 - HELI.com.y, 3);
    v.dispose();
  });

  it('a player boards, takes off with Space, cannot exit in the air, lands with Shift and climbs out', () => {
    const world = flatWorld();
    const game = fakeGame(world);
    const input = {
      down: new Set<string>(), pressed: new Set<string>(),
      isDown(a: string) { return this.down.has(a); },
      wasPressedTick(a: string) { return this.pressed.has(a); },
    };
    game.input = input;
    const p = new Player();
    p.init(game, world);
    p.setPos(5.5, GROUND, 0.5);
    game.player = p;
    const h = new HelicopterEntity();
    h.init(game, world);
    h.setPos(0.5, GROUND, 0.5);
    let step = 0;
    const run = (sec: number) => {
      for (let i = 0; i < Math.round(sec * 60); i++) {
        if (p.vehicle) h.pilotInput(input, true);
        p.physicsStep(DT);
        h.physicsStep(DT);
        if (++step % 3 === 0) { h.tick(); input.pressed.clear(); }
      }
    };
    expect(h.interact(p)).toBe(true);
    expect(p.vehicle).toBe(h);
    expect(game.log.some((e: any) => e.type === 'vehicleMount')).toBe(true);
    run(5);
    expect(h.body.rpm).toBeGreaterThan(0.9);
    expect(h.onGround).toBe(true);
    input.down.add('jump');
    run(3);
    input.down.delete('jump');
    expect(h.pos.y).toBeGreaterThan(GROUND + 8);
    // carried at the pilot seat (eye inside the cabin)
    const eye = p.pos.y + p.eyeHeight;
    expect(eye - h.pos.y).toBeGreaterThan(1.4);
    expect(eye - h.pos.y).toBeLessThan(2.0);
    // Shift in the air descends instead of exiting (near the ground it hints "land to exit")
    input.down.add('sneak');
    input.pressed.add('sneak');
    run(0.1);
    expect(p.vehicle).toBe(h);
    while (h.body.agl - HELI.hub.y > 2.5 && step < 3000) run(0.05);
    input.pressed.add('sneak');
    run(0.05);
    expect(p.vehicle).toBe(h);
    expect(h.exitHint).toBeGreaterThan(0);
    run(15);
    expect(h.onGround).toBe(true);
    expect(h.health).toBe(h.maxHealth); // gentle touchdown
    input.down.delete('sneak');
    run(1);
    // cameras: cockpit and chase
    const ctl: any = { camera: new THREE.PerspectiveCamera(70, 1, 0.05, 1000), eyeWorld: new THREE.Vector3(), perspective: 'first', vehicleFov: 1 };
    expect(h.updateCamera(ctl, 1, DT)).toBe(true);
    expect(h.box.contains(ctl.camera.position.x, ctl.camera.position.y, ctl.camera.position.z)).toBe(true);
    ctl.perspective = 'third_back';
    for (let i = 0; i < 30; i++) h.updateCamera(ctl, 1, DT);
    const off = ctl.camera.position.clone().sub(h.body.c);
    expect(off.length()).toBeGreaterThan(8);
    expect(off.y).toBeGreaterThan(1);
    expect(off.dot(new THREE.Vector3(0, 0, -1).applyQuaternion(h.quat))).toBeLessThan(0); // behind
    // Shift on the ground: climb out next to it, engine spools down
    input.pressed.add('sneak');
    run(0.05);
    expect(p.vehicle).toBe(null);
    expect(h.body.engineOn).toBe(false);
    expect(Math.hypot(p.pos.x - h.pos.x, p.pos.z - h.pos.z)).toBeGreaterThan(1.3);
    expect(Math.abs(p.pos.y - GROUND)).toBeLessThan(0.2);
    run(20);
    expect(h.body.rpm).toBeLessThan(0.05);
  });

  it('punching it breaks it back into the item', () => {
    const world = flatWorld();
    const game = fakeGame(world);
    const h = new HelicopterEntity();
    h.init(game, world);
    h.setPos(0.5, GROUND, 0.5);
    const attacker: any = { creative: false };
    let n = 0;
    while (!h.removed && n < 30) { h.hurt({ type: 'player', attacker, direct: attacker }, 1); n++; }
    expect(h.removed).toBe(true);
    expect(n).toBeGreaterThan(3);
    expect(n).toBeLessThan(12);
    expect(game.log.some((e: any) => e.type === 'helicopterBroken')).toBe(true);
    expect(game.log.some((e: any) => e.type === 'helicopterDestroyed')).toBe(false);
  });
});
