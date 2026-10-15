import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  approachVelocity2,
  boostFactor,
  canSprintDirection,
  computeTargetSpeed,
  directionFactor,
  fallDamage,
  impactSpeedFromHeight,
  vehicleExitDamage,
  type SpeedInput,
} from '../src/characters/movement/speed';
import { solveTwoBone } from '../src/characters/anim/IK';
import { traversalPoint, traversalDuration } from '../src/characters/movement/Traversal';
import { classifyKind, classifyStance, classifyStyle, dirFromName, makeClipInfo } from '../src/characters/anim/Clips';
import { bracket, speedBlend, uniqueAngles } from '../src/characters/anim/Locomotion';
import { buildHitboxes, HITBOX_DEFS } from '../src/characters/hitbox/Hitboxes';
import { TEMPLATE_STAND, TEMPLATE_PRONE } from '../src/characters/hitbox/templates';
import { skydiveTargets } from '../src/characters/movement/SkydiveMotor';
import { JUMP_VELOCITY, SKYDIVE, SPEED } from '../src/characters/constants';
import type { Hitbox } from '../src/core/types';

const base = (o: Partial<SpeedInput> = {}): SpeedInput => ({
  stance: 'stand',
  moveX: 0,
  moveY: 1,
  sprint: false,
  walk: false,
  aiming: false,
  firing: false,
  weaponClass: null,
  boost: 0,
  speedCap: Infinity,
  sprintBlocked: false,
  ...o,
});

describe('speed model (DESIGN §3)', () => {
  it('base gaits', () => {
    expect(computeTargetSpeed(base()).speed).toBeCloseTo(4.7);
    expect(computeTargetSpeed(base({ sprint: true })).speed).toBeCloseTo(6.3);
    expect(computeTargetSpeed(base({ walk: true })).speed).toBeCloseTo(1.9);
    expect(computeTargetSpeed(base({ stance: 'crouch' })).speed).toBeCloseTo(3.0);
    expect(computeTargetSpeed(base({ stance: 'crouch', walk: true })).speed).toBeCloseTo(1.6);
    expect(computeTargetSpeed(base({ stance: 'crouch', sprint: true })).speed).toBeCloseTo(4.5);
    expect(computeTargetSpeed(base({ stance: 'prone' })).speed).toBeCloseTo(1.2);
    expect(computeTargetSpeed(base({ swimming: true })).speed).toBeCloseTo(2.8);
    expect(computeTargetSpeed(base({ swimming: true, sprint: true })).speed).toBeCloseTo(4.2);
    expect(computeTargetSpeed(base({ knocked: true })).speed).toBeCloseTo(0.9);
    expect(computeTargetSpeed(base({ moveY: 0 })).speed).toBe(0);
  });
  it('direction multipliers', () => {
    expect(computeTargetSpeed(base({ moveY: -1 })).speed).toBeCloseTo(4.7 * 0.65);
    expect(computeTargetSpeed(base({ moveY: 0, moveX: 1 })).speed).toBeCloseTo(4.7 * 0.85);
    expect(directionFactor(0, 1)).toBe(1);
    const diag = directionFactor(Math.SQRT1_2, Math.SQRT1_2);
    expect(diag).toBeGreaterThan(0.85);
    expect(diag).toBeLessThan(1);
  });
  it('sprint only forward, blocked by aim/ADS and flags', () => {
    expect(canSprintDirection(0, 1)).toBe(true);
    expect(canSprintDirection(1, 0)).toBe(false);
    expect(canSprintDirection(0, -1)).toBe(false);
    expect(computeTargetSpeed(base({ sprint: true, moveX: 1, moveY: 0 })).sprinting).toBe(false);
    expect(computeTargetSpeed(base({ sprint: true, aiming: true })).sprinting).toBe(false);
    expect(computeTargetSpeed(base({ sprint: true, sprintBlocked: true })).sprinting).toBe(false);
  });
  it('aim / firing / weapon / boost / caps', () => {
    expect(computeTargetSpeed(base({ aiming: true })).speed).toBeCloseTo(4.7 * 0.65);
    expect(computeTargetSpeed(base({ firing: true })).speed).toBeCloseTo(4.7 * 0.85);
    expect(computeTargetSpeed(base({ weaponClass: 'ar' })).speed).toBeCloseTo(4.7 * 0.97);
    expect(computeTargetSpeed(base({ weaponClass: 'lmg' })).speed).toBeCloseTo(4.7 * 0.92);
    expect(boostFactor(59)).toBe(1);
    expect(boostFactor(60)).toBeCloseTo(1.025);
    expect(boostFactor(95)).toBeCloseTo(1.062);
    expect(computeTargetSpeed(base({ speedCap: SPEED.healSlow })).speed).toBeCloseTo(1.0);
    expect(computeTargetSpeed(base({ sprint: true, speedCap: 1.9 })).sprinting).toBe(false);
  });
});

describe('damage helpers', () => {
  it('fall damage (v-9)*10, 10 m ≈ 50, 20 m lethal', () => {
    expect(fallDamage(8)).toBe(0);
    expect(fallDamage(impactSpeedFromHeight(10))).toBeGreaterThan(45);
    expect(fallDamage(impactSpeedFromHeight(10))).toBeLessThan(55);
    expect(fallDamage(impactSpeedFromHeight(20))).toBeGreaterThan(100);
    expect(fallDamage(impactSpeedFromHeight(0.55))).toBe(0); // landing a jump
  });
  it('vehicle bail-out damage', () => {
    expect(vehicleExitDamage(5)).toBe(0);
    expect(vehicleExitDamage(27.8)).toBeGreaterThan(80);
  });
  it('jump apex 0.55 m', () => {
    expect((JUMP_VELOCITY * JUMP_VELOCITY) / (2 * 9.81)).toBeCloseTo(0.55);
  });
});

describe('approachVelocity2', () => {
  it('accelerates at accel and decelerates at decel', () => {
    const out: [number, number] = [0, 0];
    approachVelocity2(0, 0, 4.7, 0, 12, 14, 0.1, out);
    expect(out[0]).toBeCloseTo(1.2);
    approachVelocity2(4.7, 0, 0, 0, 12, 14, 0.1, out);
    expect(out[0]).toBeCloseTo(3.3);
    approachVelocity2(4.6, 0, 4.7, 0, 12, 14, 0.1, out);
    expect(out[0]).toBeCloseTo(4.7);
  });
  it('reaches run speed in ~0.4 s', () => {
    const v: [number, number] = [0, 0];
    let t = 0;
    while (v[0] < 4.69 && t < 2) {
      approachVelocity2(v[0], v[1], 4.7, 0, 12, 14, 1 / 60, v);
      t += 1 / 60;
    }
    expect(t).toBeLessThan(0.45);
  });
});

describe('two-bone IK', () => {
  it('preserves bone lengths, reaches target, bends toward the pole', () => {
    const a = new THREE.Vector3(0, 0, 0), b = new THREE.Vector3(0, -0.3, 0), c = new THREE.Vector3(0, -0.55, 0);
    const target = new THREE.Vector3(0.2, -0.3, 0.1);
    const pole = new THREE.Vector3(0, -0.2, -1);
    const mid = new THREE.Vector3(), end = new THREE.Vector3();
    const reach = solveTwoBone(a, b, c, target, pole, mid, end);
    expect(reach).toBeLessThan(1);
    expect(mid.distanceTo(a)).toBeCloseTo(0.3, 4);
    expect(end.distanceTo(mid)).toBeCloseTo(0.25, 4);
    expect(end.distanceTo(target)).toBeLessThan(1e-3);
    expect(mid.z).toBeLessThan(0); // toward the pole (-Z)
  });
  it('clamps unreachable targets along the reach direction', () => {
    const a = new THREE.Vector3(), b = new THREE.Vector3(0.3, 0, 0), c = new THREE.Vector3(0.55, 0, 0);
    const mid = new THREE.Vector3(), end = new THREE.Vector3();
    const reach = solveTwoBone(a, b, c, new THREE.Vector3(2, 0, 0), new THREE.Vector3(0, -1, 0), mid, end);
    expect(reach).toBeGreaterThan(1);
    expect(end.length()).toBeCloseTo(0.55, 3);
  });
});

describe('vault / climb path', () => {
  const start = new THREE.Vector3(0, 0, 0);
  const dir = new THREE.Vector3(0, 0, -1);
  it('vault clears the obstacle top and lands at the end', () => {
    const end = new THREE.Vector3(0, 0, -2.2);
    const p = new THREE.Vector3();
    traversalPoint('vault', start, end, dir, 0.9, 0.6, 1.0, 0, p);
    expect(p.distanceTo(start)).toBeLessThan(1e-6);
    traversalPoint('vault', start, end, dir, 0.9, 0.6, 1.0, 1, p);
    expect(p.distanceTo(end)).toBeLessThan(1e-6);
    // over the obstacle (z between face and back face) the feet are above the top
    for (let t = 0; t <= 1; t += 0.01) {
      traversalPoint('vault', start, end, dir, 0.9, 0.6, 1.0, t, p);
      if (-p.z > 0.9 - 0.35 + 0.05 && -p.z < 1.5 + 0.3) expect(p.y).toBeGreaterThan(1.0);
    }
  });
  it('climb ends on top', () => {
    const end = new THREE.Vector3(0, 2.0, -1.4);
    const p = new THREE.Vector3();
    traversalPoint('climb', start, end, dir, 0.9, 0, 2.0, 1, p);
    expect(p.y).toBeGreaterThanOrEqual(2.0);
    expect(p.z).toBeCloseTo(-1.4, 3);
  });
  it('durations: vault ~0.6 s, climb up to 1.2 s', () => {
    const info = { kind: 'vault' as const, height: 1.1, topY: 1.1, faceDist: 0.9, thickness: 0.6, end: new THREE.Vector3(), endStance: 'stand' as const };
    expect(traversalDuration(info, false)).toBeCloseTo(0.62, 2);
    expect(traversalDuration({ ...info, kind: 'climb', height: 2.1 }, false)).toBeCloseTo(1.2, 2);
  });
});

describe('clip classification', () => {
  it('kinds, stances, styles, directions', () => {
    expect(classifyKind('walk_f')).toBe('loco');
    expect(classifyKind('swim_idle')).toBe('swimIdle');
    expect(classifyKind('freefall')).toBe('freefall');
    expect(classifyKind('parachute_idle')).toBe('parachute');
    expect(classifyKind('drive_sit')).toBe('seated');
    expect(classifyKind('knocked_crawl')).toBe('knocked');
    expect(classifyKind('death_f')).toBe('death');
    expect(classifyKind('rifle_reload')).toBe('reload');
    expect(classifyKind('Idle')).toBe('idle');
    expect(classifyStance('rifle_crouch_walk_f')).toBe('crouch');
    expect(classifyStance('prone_crawl_f')).toBe('prone');
    expect(classifyStyle('rifle_jog_fl')).toBe('rifle');
    expect(classifyStyle('pistol_walk_f')).toBe('pistol');
    expect(classifyStyle('jog_f')).toBe('unarmed');
    expect(dirFromName('rifle_walk_fl')!.x).toBeCloseTo(-Math.SQRT1_2);
    expect(dirFromName('jog_b')!.y).toBe(-1);
    expect(dirFromName('walk_r')!.x).toBe(1);
  });
  it('uses manifest speed/direction metadata', () => {
    const clip = new THREE.AnimationClip('walk_l', 1, []);
    const info = makeClipInfo(clip, { speed_mps: 1.35, move_dir: [-1, 0], loop: true, mode: 'loco' }, null);
    expect(info.speed).toBeCloseTo(1.35);
    expect(info.angle).toBeCloseTo(-Math.PI / 2);
  });
});

describe('locomotion blending helpers', () => {
  const mk = (name: string, speed: number, x: number, y: number) =>
    makeClipInfo(new THREE.AnimationClip(name, 1, []), { speed_mps: speed, move_dir: [x, y], mode: 'loco', loop: true }, null);
  const walk = mk('walk_f', 1.5, 0, 1), jog = mk('jog_f', 3.2, 0, 1), run = mk('run_f', 5.0, 0, 1);
  it('speedBlend brackets the target speed', () => {
    const w = speedBlend([run, walk, jog], 4.1);
    expect(w.map((x) => x.c.name)).toEqual(['jog_f', 'run_f']);
    expect(w[0].w + w[1].w).toBeCloseTo(1);
    expect(speedBlend([walk, jog], 0.5)[0]).toEqual({ c: walk, w: 1 });
    expect(speedBlend([walk, jog], 9)[0].c).toBe(jog);
  });
  it('bracket picks the two neighbouring directions', () => {
    const dirs = uniqueAngles([mk('walk_f', 1, 0, 1), mk('walk_r', 1, 1, 0), mk('walk_b', 1, 0, -1), mk('walk_l', 1, -1, 0)]);
    const [a0, a1, t] = bracket(dirs, Math.PI / 4);
    expect([a0, a1].sort()).toEqual([0, Math.PI / 2].sort());
    expect(t).toBeCloseTo(0.5);
  });
});

describe('hitboxes', () => {
  it('builds every zone from a template pose and applies the root transform', () => {
    const boxes: Hitbox[] = HITBOX_DEFS.map((d) => ({ zone: d.zone, a: new THREE.Vector3(), b: new THREE.Vector3(), radius: d.radius }));
    const m = new THREE.Matrix4().makeTranslation(10, 0, 5);
    buildHitboxes(TEMPLATE_STAND, m, boxes);
    const head = boxes.find((h) => h.zone === 'head')!;
    expect(head.a.y).toBeGreaterThan(1.5);
    expect(head.a.x).toBeCloseTo(10, 1);
    const zones = new Set(boxes.map((b) => b.zone));
    for (const z of ['head', 'neck', 'chest', 'stomach', 'pelvis', 'arm', 'hand', 'leg', 'foot']) expect(zones.has(z as Hitbox['zone'])).toBe(true);
    buildHitboxes(TEMPLATE_PRONE, new THREE.Matrix4(), boxes);
    for (const h of boxes) expect(Math.max(h.a.y, h.b.y)).toBeLessThan(0.6);
  });
});

describe('skydive flight model (DESIGN §1)', () => {
  it('freefall glide / dive / chute targets', () => {
    expect(skydiveTargets('freefall', 0, 0, 0).descent).toBe(SKYDIVE.freefallVertical);
    expect(skydiveTargets('freefall', 0, 1, 0).forward).toBe(SKYDIVE.freefallGlideForward);
    expect(skydiveTargets('freefall', 0, 1, -1.2).descent).toBeCloseTo(SKYDIVE.diveVertical);
    const chute = skydiveTargets('parachute', 0, 0, 0);
    expect(chute.descent).toBeGreaterThanOrEqual(5);
    expect(chute.descent).toBeLessThanOrEqual(7);
    expect(skydiveTargets('parachute', 0, 1, 0).forward).toBe(14);
  });
});
