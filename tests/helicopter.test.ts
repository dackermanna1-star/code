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
});
