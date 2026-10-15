// Procedural zombie animation: one pose function per ZombieState, driven by
// the look's personality (limp, arm style, head tilt) and the kind.
//
// Conventions (bone space, the rig faces +X):
//   pelvis/chest rotation order ZYX: z = lean (negative = forward), y = yaw, x = roll
//   head order YZX: y = yaw (negative turns the face toward the camera, +Z), z = nod (+ = look up), x = roll
//   arms (XYZ): z = raise forward, y = swing horizontally (raised arm), x = abduct (hanging arm)
//     (for the near/L arm, outward is negative x / negative y; mirrored for R)
//   legs: driven by 2-bone IK from foot paths so feet don't slide (distance-driven gait)
import * as THREE from 'three';
import type { ZombieKind } from '../../../config/ids';
import { TAU, clamp, footPath, ik2, lerp, smooth, wobble } from '../common';
import type { AnimInput } from '../types';
import type { Bones, Dims } from './body';
import type { Look } from './looks';

export interface ZombieAnimOpts {
  B: Bones;
  d: Dims;
  look: Look;
  kind: ZombieKind;
  /** Body scale (Big Dave). */
  scale: number;
  root: THREE.Object3D;
  prop?: { obj: THREE.Object3D; kind: 'tray' | 'handbag' | 'fish' };
  apron?: THREE.Object3D;
  /** Current riot armour mask getter. */
  plates?: () => number;
  /** Riot shield object (the near hand holds its handle). */
  shield?: THREE.Object3D;
}

/** Stretcher geometry shared with props.ts (root-space hand targets for the medics). */
export const CARRY = {
  /** Hand (palm) height while carrying. */
  y: 0.84,
  /** Hand x offset from the medic root (front medic: −, back medic: +); medics stand ±1.15 from the stretcher centre, grips at ±0.82. */
  x: 0.33,
  /** Half spacing of the stretcher poles (z). */
  z: 0.27,
};

type R3 = [number, number, number];
/** Keyframe pose: pelvis position + rotations; limbs as euler triples / scalars. */
interface KP {
  px: number;
  py: number;
  pel: R3;
  ch: R3;
  hd: R3;
  jaw: number;
  uaL: R3;
  uaR: R3;
  faL: number;
  faR: number;
  hL: number;
  hR: number;
  thL: R3;
  thR: R3;
  shL: number;
  shR: number;
  ftL: number;
  ftR: number;
}

const lr3 = (a: R3, b: R3, t: number): R3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function lerpKP(a: KP, b: KP, t: number): KP {
  return {
    px: lerp(a.px, b.px, t),
    py: lerp(a.py, b.py, t),
    pel: lr3(a.pel, b.pel, t),
    ch: lr3(a.ch, b.ch, t),
    hd: lr3(a.hd, b.hd, t),
    jaw: lerp(a.jaw, b.jaw, t),
    uaL: lr3(a.uaL, b.uaL, t),
    uaR: lr3(a.uaR, b.uaR, t),
    faL: lerp(a.faL, b.faL, t),
    faR: lerp(a.faR, b.faR, t),
    hL: lerp(a.hL, b.hL, t),
    hR: lerp(a.hR, b.hR, t),
    thL: lr3(a.thL, b.thL, t),
    thR: lr3(a.thR, b.thR, t),
    shL: lerp(a.shL, b.shL, t),
    shR: lerp(a.shR, b.shR, t),
    ftL: lerp(a.ftL, b.ftL, t),
    ftR: lerp(a.ftR, b.ftR, t),
  };
}
/** Sample a keyframe track [time, pose][] at t with smoothstep easing between keys. */
function track(keys: Array<[number, KP]>, t: number): KP {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i];
    const [t1, b] = keys[i + 1];
    if (t <= t1) return lerpKP(a, b, smooth((t - t0) / Math.max(1e-6, t1 - t0)));
  }
  return keys[keys.length - 1][1];
}

// ---------------------------------------------------------------- 3D two-bone IK (from the hunter rig)
const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _t = new THREE.Vector3();
const _pl = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _u = new THREE.Vector3();
const _f = new THREE.Vector3();
const _e = new THREE.Vector3();
const _xa = new THREE.Vector3();
const _ya = new THREE.Vector3();
const _za = new THREE.Vector3();
/**
 * Two-bone IK. `upper` hangs along its local -Y with `lower` at (0,-l1,0);
 * the elbow bends about the forearm's local +Z. target / pole are world space.
 */
export function solveArm(upper: THREE.Object3D, lower: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3, l1: number, l2: number): number {
  const parent = upper.parent!;
  _inv.copy(parent.matrixWorld).invert();
  _t.copy(target).applyMatrix4(_inv);
  _pl.copy(pole).transformDirection(_inv);
  const S = upper.position;
  _d.subVectors(_t, S);
  const raw = _d.length();
  _d.divideScalar(raw || 1);
  const dist = Math.min(Math.max(raw, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-4);
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const A = Math.acos(Math.max(-1, Math.min(1, cosA)));
  _n.copy(_pl).addScaledVector(_d, -_pl.dot(_d));
  if (_n.lengthSq() < 1e-8) _n.set(0, -1, 0).addScaledVector(_d, -_d.y);
  _n.normalize();
  _u.copy(_d).multiplyScalar(Math.cos(A)).addScaledVector(_n, Math.sin(A));
  _e.copy(S).addScaledVector(_u, l1);
  _f.copy(S).addScaledVector(_d, dist).sub(_e).normalize();
  _za.crossVectors(_u, _f);
  if (_za.lengthSq() < 1e-10) _za.crossVectors(_u, _n);
  _za.normalize();
  _ya.copy(_u).negate();
  _xa.crossVectors(_ya, _za);
  _m.makeBasis(_xa, _ya, _za);
  upper.quaternion.setFromRotationMatrix(_m);
  lower.rotation.set(0, 0, Math.atan2(_f.dot(_xa), -_f.dot(_ya)));
  return Math.max(0, raw - dist);
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e3 = new THREE.Euler();

/** Spiky twitch noise in 0..1 (mostly 0, occasional sharp jerks). */
function twitch(t: number, seed: number): number {
  const a = Math.sin(t * 7.3 + seed) * Math.sin(t * 3.17 + seed * 1.7);
  return Math.pow(Math.max(0, a), 6);
}

export function createZombiePose(o: ZombieAnimOpts): (a: AnimInput) => void {
  const { B, d, look, kind, scale } = o;
  const seed = look.phase;
  const fat = kind === 'bloater' || kind === 'bigdave';
  const riot = kind === 'riot';
  const limpL = look.limpSide === 0 ? look.limp : 0;
  const limpR = look.limpSide === 1 ? look.limp : 0;
  const hipJ = d.hipJ;

  // ---------------------------------------------------------------- legs
  interface Gait {
    cycle: number;
    duty: number;
    lift: number;
    crouch: number;
    bob: number;
    spread: number;
    sway: number;
    speedK: number;
    /** Pelvis lean (forward negative). */
    lean: number;
    /** Distance override (stagger stumbles etc.). */
    dist?: number;
    /** Run legs backwards (stagger). */
    back?: boolean;
  }
  /** Distance-driven leg IK; returns the gait phase (0..1 per cycle). */
  function legs(a: AnimInput, g: Gait): number {
    const dist = (g.dist ?? a.distance) / scale;
    const ph = (dist / g.cycle) % 1;
    const m = g.speedK;
    const strideLen = g.cycle * g.duty * m;
    const P = B.pelvis;
    const step = Math.cos(ph * TAU * 2);
    P.position.y = d.hipY - g.crouch + g.bob * m * (0.5 + 0.5 * step);
    P.rotation.z = g.lean;
    P.rotation.x = g.sway * m * Math.sin(ph * TAU);
    P.rotation.y = 0.08 * m * Math.sin(ph * TAU);
    const pr = P.rotation.z;
    const hx = P.position.x - hipJ * Math.sin(pr);
    const hy = P.position.y + hipJ * Math.cos(pr);
    for (const [th, sh, ft, off, limp] of [
      [B.thighL, B.shinL, B.footL, 0, limpL],
      [B.thighR, B.shinR, B.footR, 0.5, limpR],
    ] as const) {
      let p = ph + off + g.duty / 2;
      if (g.back) p = -p;
      const lift = g.lift * m * (1 - 0.75 * limp) + 0.006;
      const [fx0, ly0] = footPath(p, g.duty, strideLen, lift);
      const fx = g.back ? -fx0 : fx0;
      const tx = fx + 0.01 - hx;
      const ty = d.ankle + ly0 - hy;
      const lx = tx * Math.cos(-pr) - ty * Math.sin(-pr);
      const ly = tx * Math.sin(-pr) + ty * Math.cos(-pr);
      const [a1, a2] = ik2(d.thigh, d.shin, lx, ly, -1);
      th.rotation.z = a1;
      th.rotation.x = (th === B.thighL ? -1 : 1) * g.spread;
      sh.rotation.z = a2;
      // level foot; dragging foot scuffs with the toe down
      const q = ((p % 1) + 1) % 1;
      const swing = q >= g.duty ? Math.sin(((q - g.duty) / (1 - g.duty)) * Math.PI) : 0;
      ft.rotation.z = -(pr + a1 + a2) - (0.25 + limp * 0.6) * swing * m;
      ft.rotation.x = -th.rotation.x;
    }
    return ph;
  }

  /** Standing legs (no gait), feet planted under the hips. */
  function stand(crouch = 0.02, spread = 0.04, lean = -0.05): void {
    legs({ state: '', stateTime: 0, time: 0, distance: 0, speed: 0, dt: 0, params: {} }, { cycle: 1, duty: 0.6, lift: 0, crouch, bob: 0, spread, sway: 0, speedK: 0, lean });
  }

  // ---------------------------------------------------------------- arms
  const arm = (side: 'L' | 'R', z: number, y: number, x: number, fore: number, hand: number) => {
    const s = side === 'L' ? 1 : -1;
    const ua = side === 'L' ? B.upperArmL : B.upperArmR;
    ua.rotation.set(-s * x, -s * y, z);
    (side === 'L' ? B.foreArmL : B.foreArmR).rotation.z = fore;
    (side === 'L' ? B.handL : B.handR).rotation.z = hand;
  };

  /** Classic zombie arms by personality. `ph` = gait phase, k = intensity. */
  function zombieArms(t: number, ph: number, k = 1): void {
    const sw = Math.sin(ph * TAU);
    const w1 = wobble(t * 1.3, seed);
    const w2 = wobble(t * 1.1, seed + 3);
    switch (look.armStyle) {
      case 0:
        arm('L', 1.32 + 0.08 * sw * k + 0.05 * w1, 0.12, 0, 0.18 + 0.06 * w2, -0.55 + 0.1 * w1);
        arm('R', 1.22 - 0.08 * sw * k + 0.05 * w2, 0.08, 0, 0.26, -0.5 + 0.1 * w2);
        break;
      case 1:
        arm('L', 1.38 + 0.06 * sw * k + 0.05 * w1, 0.1, 0, 0.15, -0.6);
        arm('R', 0.1 + 0.28 * sw * k, 0, 0.1, 0.3 + 0.15 * Math.max(0, sw), 0.2);
        break;
      case 2:
        arm('L', 0.45 + 0.3 * sw * k + 0.05 * w1, 0, 0.12, 0.45, -0.2);
        arm('R', 0.4 - 0.3 * sw * k + 0.05 * w2, 0, 0.12, 0.5, -0.2);
        break;
      default:
        arm('L', 2.35 + 0.12 * w1, 0.25, 0, 0.35, -0.3);
        arm('R', 1.25 - 0.08 * sw * k, 0.08, 0, 0.25, -0.5);
        break;
    }
  }

  function head(t: number, k = 1): void {
    B.head.rotation.y = -0.32 + 0.16 * wobble(t * 0.6 * look.loll, seed) * k;
    B.head.rotation.z = 0.24 + 0.1 * wobble(t * 0.8 * look.loll, seed + 1) * k;
    B.head.rotation.x = look.headTilt + 0.1 * wobble(t * 0.7 * look.loll, seed + 2) * k;
    B.jaw.rotation.z = -(0.12 + 0.32 * look.jaw) - 0.1 * Math.abs(Math.sin(t * 2.3 + seed)) * k;
  }

  // ---------------------------------------------------------------- state poses
  function walk(a: AnimInput): void {
    const t = a.time;
    const k = clamp(a.speed / 0.6, 0, 1);
    if (fat) {
      const enr = !!a.params.enraged;
      const ph = legs(a, { cycle: enr ? 1.05 : 0.9, duty: 0.66, lift: 0.07, crouch: 0.02, bob: 0.03, spread: 0.2, sway: 0.13, speedK: k, lean: enr ? -0.08 : 0.02 });
      const sw = Math.sin(ph * TAU);
      B.chest.rotation.z = (enr ? -0.18 : 0.06) + 0.03 * Math.cos(ph * TAU * 2);
      B.chest.rotation.x = -0.1 * sw * k;
      B.chest.rotation.y = -0.15;
      head(t, 0.7);
      B.head.rotation.z = enr ? 0.4 : 0.1;
      if (enr) {
        arm('L', 0.9 + 0.5 * sw, 0, 0.45, 0.9, 0.3);
        arm('R', 0.9 - 0.5 * sw, 0, 0.45, 0.9, 0.3);
      } else {
        arm('L', 0.35 + 0.15 * sw, 0, 0.6 + 0.08 * Math.cos(ph * TAU * 2), 0.5, -0.1);
        arm('R', 0.35 - 0.15 * sw, 0, 0.6 + 0.08 * Math.cos(ph * TAU * 2), 0.5, -0.1);
      }
      belly(t, ph, k);
      return;
    }
    if (riot) {
      const ph = legs(a, { cycle: 1.35, duty: 0.6, lift: 0.1, crouch: 0.04, bob: 0.03, spread: 0.06, sway: 0.05, speedK: k, lean: -0.06 });
      const sw = Math.sin(ph * TAU);
      B.chest.rotation.z = -0.12;
      B.chest.rotation.y = -0.18 + 0.05 * sw;
      head(t, 0.4);
      B.head.rotation.y = -0.15;
      const shield = o.shield && (!o.plates || (o.plates() & 2) !== 0);
      if (shield && o.shield) {
        o.root.updateWorldMatrix(true, false);
        B.body.updateMatrixWorld(true);
        reachWorld('L', o.shield.localToWorld(_v.set(-0.08, -0.02, 0)), 0.0, -1, 0.6);
        B.handL.rotation.z = 0.3;
      } else arm('L', 1.3 + 0.08 * sw, 0.1, 0, 0.2, -0.5);
      // baton raised, tapping
      arm('R', 2.3 + 0.25 * Math.max(0, Math.sin(t * 4 + seed)), -0.2, 0.15, 1.3, 0.3);
      return;
    }
    // shambler / medic / patient / jogger (walking)
    const ph = legs(a, {
      cycle: 1.25 * look.gait,
      duty: 0.64,
      lift: kind === 'jogger' ? 0.1 : 0.075,
      crouch: look.outfit === 'granny' ? 0.05 : 0.03,
      bob: 0.025,
      spread: 0.04,
      sway: 0.075 * look.sway,
      speedK: k,
      lean: -0.08,
    });
    const sw = Math.sin(ph * TAU);
    const hunch = look.outfit === 'granny' ? -0.42 : -0.22;
    B.chest.rotation.z = hunch - 0.04 * Math.abs(sw) * k;
    B.chest.rotation.y = -0.24 + 0.08 * sw * k;
    B.chest.rotation.x = -0.06 * sw * k * look.sway;
    head(t);
    if (look.outfit === 'granny') B.head.rotation.z = 0.5;
    zombieArms(t, ph, k);
    propArms(t, ph);
  }

  /** Arm overrides for hand-held props. */
  function propArms(t: number, ph: number): void {
    if (!o.prop) return;
    const sw = Math.sin(ph * TAU);
    if (o.prop.kind === 'tray') arm('L', 1.05, 1.28, 0, 1.6, -0.3 + 0.08 * wobble(t, seed));
    else if (o.prop.kind === 'handbag') arm('L', 0.25 + 0.1 * sw, 0.0, 0.18, 1.45, 0.3);
  }

  function belly(t: number, ph: number, k: number): void {
    const j = Math.sin(ph * TAU * 2 - 0.9) * k;
    B.belly.scale.set(1 + 0.025 * j, 1 - 0.035 * j, 1 + 0.025 * j);
    B.belly.position.y += 0.012 * j;
    void t;
  }

  function run(a: AnimInput): void {
    const t = a.time;
    const k = clamp(a.speed / 2, 0, 1);
    const ph = legs(a, { cycle: 2.25, duty: 0.37, lift: 0.26, crouch: 0.07, bob: 0.06, spread: 0.02, sway: 0.04, speedK: k, lean: -0.2 });
    const s = Math.sin(ph * TAU);
    B.chest.rotation.z = -0.3;
    B.chest.rotation.y = -0.2 - 0.22 * s * k;
    head(t, 1.4);
    B.head.rotation.z = 0.42;
    B.head.rotation.x = look.headTilt * 1.4 + 0.12 * Math.sin(ph * TAU * 2);
    B.jaw.rotation.z = -0.55;
    if (look.armStyle === 1 || look.armStyle === 3) {
      // one floppy dead arm
      arm('L', -0.15 + 0.9 * s, 0, 0.12, 1.5 + 0.25 * s, 0.25);
      arm('R', 0.25 - 0.5 * s, 0, 0.25, 0.25 + 0.3 * Math.abs(s), -0.3);
    } else {
      arm('L', -0.15 + 0.9 * s, 0, 0.12, 1.5 + 0.25 * s, 0.25);
      arm('R', -0.15 - 0.9 * s, 0, 0.12, 1.5 - 0.25 * s, 0.25);
    }
  }

  function burn(a: AnimInput): void {
    const t = a.stateTime + seed;
    const k = clamp(a.speed / 1.2, 0.3, 1);
    legs(a, { cycle: fat ? 1.1 : 1.7, duty: 0.42, lift: fat ? 0.1 : 0.17, crouch: 0.04, bob: 0.04, spread: fat ? 0.2 : 0.05, sway: 0.08, speedK: k, lean: -0.1 });
    const f = Math.sin(t * 15);
    const g = Math.sin(t * 11 + 1);
    B.chest.rotation.z = -0.1 + 0.12 * Math.sin(t * 7);
    B.chest.rotation.y = -0.2 + 0.35 * Math.sin(t * 5.3);
    B.chest.rotation.x = 0.12 * Math.sin(t * 6.1);
    B.head.rotation.y = -0.2 + 0.6 * Math.sin(t * 9);
    B.head.rotation.z = 0.45 + 0.15 * g;
    B.jaw.rotation.z = -0.7 - 0.15 * f;
    arm('L', 2.5 + 0.4 * f, 0.3 * g, 0.5, 0.6 + 0.4 * g, 0.4 * f);
    arm('R', 2.3 - 0.4 * g, -0.3 * f, 0.5, 0.6 + 0.4 * f, 0.4 * g);
    if (fat) belly(t, t * 0.8, 1);
  }

  function grab(a: AnimInput): void {
    const t = a.time;
    const st = a.stateTime;
    const lunge = smooth(st / 0.25);
    legs({ ...a, distance: st * 0.25 }, { cycle: 0.6, duty: 0.7, lift: 0.03, crouch: 0.06, bob: 0.01, spread: fat ? 0.2 : 0.06, sway: 0.05, speedK: 0.6, lean: -0.15 * lunge });
    const bite = Math.max(0, Math.sin(t * 7 + seed));
    B.chest.rotation.z = -0.35 * lunge - 0.08 * bite;
    B.chest.rotation.y = -0.1;
    B.head.rotation.y = -0.15;
    B.head.rotation.z = 0.35 - 0.3 * bite;
    B.head.rotation.x = look.headTilt * 0.5;
    B.jaw.rotation.z = -0.1 - 0.6 * Math.abs(Math.sin(t * 7 + seed + 0.6));
    const c1 = Math.sin(t * 5.5 + seed);
    const c2 = Math.sin(t * 6.3 + seed + 2);
    arm('L', 1.5 + 0.12 * c1, 0.25 + 0.1 * c2, 0, 0.12 + 0.2 * Math.max(0, c2), -0.2 + 0.6 * Math.max(0, c1));
    arm('R', 1.45 + 0.12 * c2, 0.2 + 0.1 * c1, 0, 0.15 + 0.2 * Math.max(0, c1), -0.2 + 0.6 * Math.max(0, c2));
    if (fat) belly(t, t * 1.3, 0.7);
  }

  function stagger(a: AnimInput): void {
    const t = a.time;
    const st = a.stateTime;
    const decay = Math.exp(-st * 1.4);
    const hit = smooth(st / 0.12);
    legs({ ...a, distance: st * 1.1 }, { cycle: 0.85, duty: 0.55, lift: 0.08, crouch: 0.05, bob: 0.02, spread: fat ? 0.22 : 0.08, sway: 0.1, speedK: 0.4 + 0.6 * decay, lean: 0.12 * hit, back: true });
    const w = Math.sin(st * 9) * decay;
    B.chest.rotation.z = (0.38 + 0.15 * w) * hit * (0.5 + 0.5 * decay);
    B.chest.rotation.y = -0.2 + 0.25 * Math.sin(st * 6);
    B.chest.rotation.x = 0.15 * Math.sin(st * 7.3) * decay;
    B.head.rotation.y = -0.2 + 0.3 * Math.sin(st * 8);
    B.head.rotation.z = (0.6 + 0.25 * w) * hit;
    B.head.rotation.x = 0.3 * Math.sin(st * 10) * decay + look.headTilt;
    B.jaw.rotation.z = -0.6;
    arm('L', 1.9 + 0.5 * Math.sin(st * 8 + 1), 0.3, 0.55 + 0.2 * w, 0.5 + 0.4 * Math.abs(w), 0.4 * w);
    arm('R', 1.7 + 0.5 * Math.sin(st * 7 + 2), 0.3, 0.55 - 0.2 * w, 0.6 + 0.4 * Math.abs(w), -0.4 * w);
    if (fat) belly(t, st * 1.5, 1);
  }

  // ---- lying / prone poses
  const NEUT: KP = {
    px: 0,
    py: d.hipY,
    pel: [0, 0, 0],
    ch: [0, 0, 0],
    hd: [0, 0, 0],
    jaw: -0.2,
    uaL: [0, 0, 0],
    uaR: [0, 0, 0],
    faL: 0.2,
    faR: 0.2,
    hL: 0,
    hR: 0,
    thL: [0, 0, 0],
    thR: [0, 0, 0],
    shL: 0,
    shR: 0,
    ftL: 0,
    ftR: 0,
  };
  const lieY = d.hipsD * 0.95 + 0.01;
  /** Lying on the back, head toward +X (ry = ±π). */
  const ON_BACK = (ry: number): KP => ({
    ...NEUT,
    px: 0.08,
    py: lieY,
    pel: [0.06, ry, -Math.PI / 2],
    ch: [0, 0, 0.05],
    hd: [0, 0.5, 0.25],
    jaw: -0.45,
    uaL: [-1.05, 0, 0.08],
    uaR: [1.25, 0, 0.35],
    faL: 0.35,
    faR: 0.6,
    hL: 0.3,
    hR: -0.2,
    thL: [-0.12, 0, 0.12],
    thR: [0.2, 0, 0.05],
    shL: -0.25,
    shR: -0.08,
    ftL: 0.8,
    ftR: 0.6,
  });
  const PRONE: KP = {
    ...NEUT,
    px: 0.0,
    py: lieY - 0.005,
    pel: [0, 0, -Math.PI / 2 + 0.12],
    ch: [0, 0.0, 0.24],
    hd: [0, -0.2, 0.9],
    jaw: -0.35,
    uaL: [-0.1, 0, 2.6],
    uaR: [0.1, 0, 2.4],
    faL: 0.5,
    faR: 0.7,
    hL: -0.4,
    hR: -0.4,
    thL: [-0.06, 0, 0.05],
    thR: [0.06, 0, -0.05],
    shL: -0.2,
    shR: -0.35,
    ftL: 1.2,
    ftR: 1.1,
  };
  function applyKP(p: KP): void {
    B.pelvis.position.set(p.px, p.py, 0);
    B.pelvis.rotation.set(...p.pel);
    B.chest.rotation.set(...p.ch);
    B.head.rotation.set(...p.hd);
    B.jaw.rotation.z = p.jaw;
    B.upperArmL.rotation.set(...p.uaL);
    B.upperArmR.rotation.set(...p.uaR);
    B.foreArmL.rotation.z = p.faL;
    B.foreArmR.rotation.z = p.faR;
    B.handL.rotation.z = p.hL;
    B.handR.rotation.z = p.hR;
    B.thighL.rotation.set(...p.thL);
    B.thighR.rotation.set(...p.thR);
    B.shinL.rotation.z = p.shL;
    B.shinR.rotation.z = p.shR;
    B.footL.rotation.z = p.ftL;
    B.footR.rotation.z = p.ftR;
  }

  const _tgt = new THREE.Vector3();
  const _pole = new THREE.Vector3();
  /** Hand IK toward a root-space point (palm), pole a root-space direction. */
  function reach(side: 'L' | 'R', x: number, y: number, z: number, px: number, py: number, pz: number): void {
    const ua = side === 'L' ? B.upperArmL : B.upperArmR;
    const fa = side === 'L' ? B.foreArmL : B.foreArmR;
    o.root.updateWorldMatrix(true, false);
    B.body.updateMatrixWorld(true);
    const palm = 0.05 * d.hand;
    _tgt.set(x / scale, y / scale, z / scale).applyMatrix4(B.body.matrixWorld);
    _pole.set(px, py, pz).transformDirection(o.root.matrixWorld);
    solveArm(ua, fa, _tgt, _pole, d.upper, d.fore + palm);
  }

  /** Hand IK toward a world-space point (palm). */
  function reachWorld(side: 'L' | 'R', target: THREE.Vector3, px: number, py: number, pz: number): void {
    const ua = side === 'L' ? B.upperArmL : B.upperArmR;
    const fa = side === 'L' ? B.foreArmL : B.foreArmR;
    _pole.set(px, py, pz).transformDirection(o.root.matrixWorld);
    _tgt.copy(target);
    solveArm(ua, fa, _tgt, _pole, d.upper, d.fore + 0.05 * d.hand);
  }

  function crawlPose(a: AnimInput, dist: number): void {
    applyKP(PRONE);
    const t = a.time;
    const cyc = 0.62;
    const ph = (dist / scale / cyc) % 1;
    // surge: the body lunges a little on each pull
    const surge = Math.sin(ph * TAU * 2);
    B.pelvis.position.x += 0.03 * surge;
    B.pelvis.rotation.x = 0.1 * Math.sin(ph * TAU);
    B.chest.rotation.z += 0.05 * surge;
    B.chest.rotation.x = -0.12 * Math.sin(ph * TAU);
    B.head.rotation.y = -0.35 + 0.12 * wobble(t * 0.7, seed);
    B.head.rotation.z = 0.95 + 0.08 * surge;
    B.jaw.rotation.z = -0.3 - 0.25 * Math.abs(Math.sin(t * 2.2 + seed));
    // legs drag limp, the feet twitch now and then
    B.thighL.rotation.z = 0.05 + 0.05 * Math.sin(ph * TAU + 1);
    B.thighR.rotation.z = -0.05 - 0.05 * Math.sin(ph * TAU);
    B.footL.rotation.z = 1.2 + 0.4 * twitch(t, seed);
    // hands claw at the planks: planted while pulling, lifted while reaching
    const sh = d.chestY + d.shY;
    for (const [side, off] of [['L', 0], ['R', 0.5]] as const) {
      const [fx, lift] = footPath(ph + off, 0.6, 0.5, 0.16);
      const zs = side === 'L' ? 1 : -1;
      reach(side, 0.7 + fx + (sh - 0.5) * 0.2, 0.05 + lift, zs * (d.shW + 0.03), 0.2, 0.6, zs * 0.9);
    }
  }

  function crawl(a: AnimInput): void {
    crawlPose(a, a.distance);
  }

  function lieOnBack(a: AnimInput, twitchOn: boolean, ry = Math.PI): void {
    applyKP(ON_BACK(ry));
    if (!twitchOn) return;
    const t = a.time;
    const k1 = twitch(t, seed);
    const k2 = twitch(t * 1.3, seed + 5);
    const k3 = twitch(t * 0.9, seed + 9);
    B.head.rotation.y += 0.5 * k1;
    B.head.rotation.z += 0.4 * k2;
    B.jaw.rotation.z -= 0.3 * k3;
    B.upperArmL.rotation.z += 0.9 * k2;
    B.foreArmL.rotation.z += 0.7 * k1;
    B.upperArmR.rotation.x -= 0.6 * k3;
    B.handR.rotation.z += 0.8 * k1;
    B.thighL.rotation.z += 0.35 * k3;
    B.shinL.rotation.z -= 0.6 * k3;
    B.footR.rotation.z += 0.6 * k2;
    B.chest.rotation.z += 0.15 * k1;
  }

  function rise(a: AnimInput): void {
    const st = a.stateTime;
    const back = ON_BACK(-Math.PI);
    const lift: KP = { ...back, hd: [0, 0.2, 0.6], ch: [0, 0, 0.25], uaL: [0.4, 0, 1.6], faL: 1.2, uaR: [-0.6, 0, 0.6], jaw: -0.6, thL: [-0.05, 0, 0.5], shL: -0.9 };
    const roll: KP = { ...lerpKP(back, PRONE, 0.5), pel: [0, -Math.PI / 2, -Math.PI / 2 + 0.03], py: lieY + 0.07, uaL: [0.3, 0, 2.2], uaR: [-0.3, 0, 0.8], faL: 0.6, faR: 0.6, thL: [-0.1, 0, 0.6], shL: -1.0, hd: [0, -0.2, 0.5] };
    const prone: KP = { ...PRONE, ch: [0, 0, 0.0], hd: [0, -0.2, 0.3], uaL: [0, 0, 2.9], uaR: [0, 0, 2.9] };
    const tr = track(
      [
        [0, back],
        [0.35, lift],
        [0.85, roll],
        [1.15, prone],
      ],
      st,
    );
    if (st < 1.15) {
      applyKP(tr);
      if (st < 0.35) {
        const k = twitch(a.time * 2, seed);
        B.head.rotation.y += 0.4 * k;
        B.upperArmR.rotation.z += 0.6 * k;
      }
      return;
    }
    // push up into the crawl
    const u = smooth((st - 1.15) / 0.45);
    crawlPose(a, a.distance);
    const p = lerpKP(prone, PRONE, 0);
    const blendBones = (b: THREE.Object3D, r: R3) => {
      _q.setFromEuler(_e3.set(r[0], r[1], r[2], b.rotation.order));
      _q2.copy(b.quaternion);
      b.quaternion.copy(_q).slerp(_q2, u);
    };
    blendBones(B.chest, p.ch);
    blendBones(B.head, p.hd);
  }

  function trip(a: AnimInput): void {
    const st = a.stateTime;
    const upright: KP = {
      ...NEUT,
      py: d.hipY - 0.05,
      pel: [0, 0, -0.2],
      ch: [0, -0.2, -0.3],
      hd: [0, -0.2, 0.4],
      uaL: [0, 0, 0.9],
      uaR: [0, 0, -0.4],
      faL: 1.2,
      faR: 1.3,
      thL: [-0.04, 0, 0.5],
      thR: [0.04, 0, -0.4],
      shL: -0.6,
      shR: -0.3,
      jaw: -0.5,
    };
    const falling: KP = {
      ...NEUT,
      px: 0.3,
      py: d.hipY * 0.62,
      pel: [0.1, 0, -1.0],
      ch: [0, -0.1, -0.2],
      hd: [0, -0.2, 0.9],
      uaL: [-0.2, 0, 2.3],
      uaR: [0.2, 0, 2.1],
      faL: 0.3,
      faR: 0.4,
      thL: [-0.05, 0, 0.6],
      thR: [0.05, 0, -0.5],
      shL: -0.4,
      shR: -1.2,
      jaw: -0.7,
    };
    const flat: KP = { ...PRONE, px: 0.45, uaL: [-0.3, 0, 2.7], uaR: [0.3, 0, 2.6], hd: [0, -0.5, 0.35], ch: [0, 0, 0.05], jaw: -0.6 };
    const push: KP = { ...PRONE, px: 0.45, py: lieY + 0.18, pel: [0, 0, -Math.PI / 2 + 0.45], ch: [0, 0, 0.6], hd: [0, -0.3, 0.6], uaL: [0, 0, 1.6], uaR: [0, 0, 1.6], faL: 0.15, faR: 0.15, hL: -1.2, hR: -1.2, thL: [-0.05, 0, 0.9], thR: [0.05, 0, 0.2], shL: -1.8, shR: -0.5 };
    const kneel: KP = { ...NEUT, px: 0.35, py: d.hipY * 0.55, pel: [0, 0, -0.35], ch: [0, -0.2, -0.3], hd: [0, -0.3, 0.5], uaL: [0, 0, 0.6], uaR: [0, 0, 0.3], faL: 0.6, faR: 0.6, thL: [-0.05, 0, 1.6], thR: [0.05, 0, -0.1], shL: -1.6, shR: -1.9, ftL: 0, ftR: 1.0, jaw: -0.4 };
    const up: KP = { ...NEUT, px: 0.15, py: d.hipY - 0.04, pel: [0, 0, -0.15], ch: [0, -0.2, -0.25], hd: [0, -0.3, 0.4], uaL: [0, 0, 0.5], uaR: [0, 0, -0.3], faL: 1.2, faR: 1.2, thL: [-0.04, 0, 0.3], thR: [0.04, 0, -0.2], shL: -0.5, shR: -0.4, ftL: 0.2, jaw: -0.4 };
    applyKP(
      track(
        [
          [0, upright],
          [0.16, falling],
          [0.3, flat],
          [0.5, flat],
          [0.64, push],
          [0.78, kneel],
          [0.92, up],
        ],
        st,
      ),
    );
  }

  function carry(a: AnimInput): void {
    const front = a.params.front !== false && a.params.front !== 0;
    const t = a.time;
    const k = clamp(a.speed / 0.6, 0, 1);
    const ph = legs(a, { cycle: 1.2, duty: 0.62, lift: 0.08, crouch: 0.04, bob: 0.02, spread: 0.04, sway: 0.05, speedK: k, lean: front ? -0.06 : -0.12 });
    B.chest.rotation.z = front ? -0.12 : -0.22;
    B.chest.rotation.x = -0.04 * Math.sin(ph * TAU);
    head(t, 0.8);
    B.head.rotation.y = -0.35;
    const sx = front ? -CARRY.x : CARRY.x;
    for (const side of ['L', 'R'] as const) {
      const zs = side === 'L' ? 1 : -1;
      reach(side, sx, CARRY.y + 0.012 * Math.cos(ph * TAU * 2), zs * CARRY.z, front ? -0.3 : 0.2, -1, zs * 0.7);
      (side === 'L' ? B.handL : B.handR).rotation.z = front ? 0.4 : -0.2;
    }
  }

  function carried(a: AnimInput): void {
    lieOnBack(a, true);
    // the near arm (R: lying on its back flips the sides) dangles off the stretcher
    B.upperArmR.rotation.set(0.35 + 0.1 * Math.sin(a.time * 2.1 + seed), 0, -1.45 + 0.12 * Math.sin(a.time * 1.7 + seed));
    B.foreArmR.rotation.z = 0.25 + 0.6 * twitch(a.time * 1.1, seed + 3);
    B.handR.rotation.z = 0.3;
    B.head.rotation.y = 0.75;
  }

  function belch(a: AnimInput): void {
    const st = a.stateTime;
    const inhale = smooth(st / 0.4) * (1 - smooth((st - 0.4) / 0.12));
    const blast = smooth((st - 0.38) / 0.12) * (1 - smooth((st - 0.8) / 0.2));
    stand(0.04, 0.2, 0.0);
    B.chest.rotation.z = 0.28 * inhale - 0.4 * blast;
    B.chest.rotation.y = -0.15;
    B.head.rotation.y = -0.2;
    B.head.rotation.z = 0.5 * inhale - 0.15 * blast + 0.2;
    B.jaw.rotation.z = -0.15 - 0.2 * inhale - 0.75 * blast;
    const bk = 1 + 0.08 * inhale - 0.06 * blast;
    B.belly.scale.set(bk, bk, bk);
    arm('L', 0.6 - 0.5 * blast, 0, 0.7 * inhale + 0.4, 0.6 + 0.6 * inhale, 0.3);
    arm('R', 0.6 - 0.5 * blast, 0, 0.7 * inhale + 0.4, 0.6 + 0.6 * inhale, 0.3);
    if (blast > 0) {
      const sh = Math.sin(st * 60) * 0.03 * blast;
      B.head.rotation.x += sh;
      B.chest.rotation.x += sh;
    }
  }

  const apronRest = o.apron ? { p: o.apron.position.clone(), q: o.apron.quaternion.clone() } : null;
  function enrage(a: AnimInput): void {
    const st = a.stateTime;
    const grabK = smooth(st / 0.28) * (1 - smooth((st - 0.3) / 0.1));
    const rip = smooth((st - 0.3) / 0.18);
    const roar = smooth((st - 0.5) / 0.2);
    stand(0.05, 0.22, 0.0);
    const shake = Math.sin(st * 40) * 0.04 * roar;
    B.chest.rotation.z = -0.15 * grabK + 0.2 * roar + shake;
    B.chest.rotation.y = -0.15;
    B.head.rotation.y = -0.2;
    B.head.rotation.z = 0.1 + 0.55 * roar;
    B.jaw.rotation.z = -0.15 - 0.75 * roar;
    if (st < 0.3) {
      arm('L', lerp(0.3, 0.9, grabK), 0.4 * grabK, 0.2, lerp(0.5, 2.1, grabK), 0.6);
      arm('R', lerp(0.3, 0.9, grabK), 0.4 * grabK, 0.2, lerp(0.5, 2.1, grabK), 0.6);
    } else if (st < 0.5) {
      arm('L', lerp(0.9, 0.2, rip), lerp(0.4, -0.3, rip), lerp(0.2, 1.1, rip), lerp(2.1, 0.4, rip), 0.6);
      arm('R', lerp(0.9, 0.2, rip), lerp(0.4, -0.3, rip), lerp(0.2, 1.1, rip), lerp(2.1, 0.4, rip), 0.6);
    } else {
      const fl = 0.15 * Math.sin(st * 22);
      arm('L', lerp(0.2, 2.5, roar) + fl, -0.3, lerp(1.1, 0.5, roar), lerp(0.4, 1.0, roar), 0.8);
      arm('R', lerp(0.2, 2.5, roar) - fl, -0.3, lerp(1.1, 0.5, roar), lerp(0.4, 1.0, roar), 0.8);
    }
    if (o.apron && apronRest) {
      if (st < 0.32) {
        o.apron.visible = true;
        o.apron.position.copy(apronRest.p);
        o.apron.quaternion.copy(apronRest.q);
        o.apron.position.y += 0.03 * grabK;
      } else {
        const ft = st - 0.32;
        o.apron.visible = ft < 0.55;
        o.apron.position.set(apronRest.p.x + 0.3 + ft * 1.6, apronRest.p.y + ft * 0.9 - 4.5 * ft * ft, apronRest.p.z + ft * 0.5);
        o.apron.quaternion.copy(apronRest.q).multiply(_q.setFromEuler(_e3.set(ft * 3, ft * 1.5, -ft * 6)));
      }
    }
  }

  // ---------------------------------------------------------------- props follow gravity
  const _pq = new THREE.Quaternion();
  const _rq = new THREE.Quaternion();
  let swingA = 0;
  let swingV = 0;
  let lastHandX = 0;
  function settleProp(a: AnimInput): void {
    const pr = o.prop;
    if (!pr || pr.obj.parent === null || !pr.obj.parent.parent) return;
    // detached props (dropped on death) are left alone
    if (!isDescendant(pr.obj, o.root)) return;
    o.root.updateWorldMatrix(true, false);
    B.body.updateMatrixWorld(true);
    const parent = pr.obj.parent;
    parent.getWorldQuaternion(_pq);
    o.root.getWorldQuaternion(_rq);
    // pendulum driven by the hand's sideways acceleration
    pr.obj.getWorldPosition(_v);
    // Frozen time (pause, hit-stop: dt 0): the pendulum holds still too.
    if (a.dt > 0) {
      const dt = Math.max(1e-3, Math.min(0.05, a.dt));
      const hx = _v.x;
      const acc = (hx - lastHandX) / dt;
      lastHandX = hx;
      swingV += (-swingA * 40 - swingV * 3 - clamp(acc, -6, 6) * 0.5) * dt;
      swingA = clamp(swingA + swingV * dt, -0.7, 0.7);
    }
    const lying = a.state === 'crawl' || a.state === 'rise' || a.state === 'trip' || a.state === 'carried';
    if (pr.kind === 'tray') {
      _q.setFromEuler(_e3.set(0.05 * Math.sin(a.time * 2 + seed), 0, swingA * 0.15));
    } else {
      _q.setFromEuler(_e3.set(0, 0, swingA + (lying ? 1.2 : 0)));
    }
    // desired world orientation = root yaw * local swing; local = parent^-1 * desired
    _rq.multiply(_q);
    pr.obj.quaternion.copy(_pq.invert().multiply(_rq));
    void _v2;
  }

  return (a: AnimInput) => {
    const st = a.state;
    if (o.apron && apronRest && st !== 'enrage') {
      o.apron.position.copy(apronRest.p);
      o.apron.quaternion.copy(apronRest.q);
      o.apron.visible = !a.params.enraged;
    }
    switch (st) {
      case 'run':
        if (kind === 'jogger') run(a);
        else walk(a);
        break;
      case 'crawl':
        crawl(a);
        break;
      case 'rise':
        rise(a);
        break;
      case 'stagger':
        stagger(a);
        break;
      case 'trip':
        trip(a);
        break;
      case 'burn':
        burn(a);
        break;
      case 'grab':
        grab(a);
        break;
      case 'carry':
        carry(a);
        break;
      case 'carried':
        carried(a);
        break;
      case 'belch':
        if (fat) belch(a);
        else stagger(a);
        break;
      case 'enrage':
        if (fat) enrage(a);
        else walk(a);
        break;
      case 'down':
      case 'dead':
        lieOnBack(a, !!a.params.twitch);
        break;
      case 'walk':
      case 'spawn':
      default:
        if (kind === 'jogger' && a.speed > 2.5) run(a);
        else walk(a);
        break;
    }
    if (o.prop && (a.state === 'walk' || a.state === 'spawn' || a.state === 'stagger' || a.state === 'grab') && o.prop.kind !== 'fish') {
      // the waiter keeps the tray up no matter what, granny never lets go of the bag
      if (a.state !== 'walk' && a.state !== 'spawn') propArms(a.time, 0);
    }
    // walking left (facing −1, root turned by π): keep the 3/4 turn toward the camera
    if (typeof a.params.facing === 'number' && a.params.facing < 0) {
      B.chest.rotation.y = -B.chest.rotation.y;
      B.head.rotation.y = -B.head.rotation.y;
    }
    settleProp(a);
  };
}

function isDescendant(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === root) return true;
  return false;
}
