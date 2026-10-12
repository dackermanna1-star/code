// The hunter: a stocky Inuit seal hunter in a royal-blue parka with a white
// fur-trimmed hood, plus procedural animation and weapon hold poses.
//
// This rig is the exception to the +X convention: the hunter always faces and
// shoots toward -X (left on screen). Root origin at the feet centre. The camera
// sees his left side (+Z), so the trigger hand is the near-side (left) hand and
// guns ride on the camera side of the body, like the original sprite.
//
// Weapons are placed by an explicit gun transform (muzzle exactly on the gun
// line, y = PLAYER.muzzleHeight, pointing -X) and the arms reach for the grips
// with two-bone IK, so every weapon/state combination keeps the hands on the gun.
import * as THREE from 'three';
import { PartBuilder, bone, box, capsule, cyl, ellipsoid, hash3, lathe, mix, roundBox, sphere, torus } from './kit';
import type { AnimInput, BoneSpec, CreatureRig } from './types';
import { WEAPON_ORDER, type WeaponId } from '../../config/weapons';
import { PLAYER } from '../../config/constants';
import { createWeaponModel, kickCurve, type HoldStyle, type WeaponModel } from './weapons';

export interface HunterRig extends CreatureRig {
  /** Mount point in the hands; weapon models are added here. */
  hand: THREE.Object3D;
  /** Second hand mount (dual MAC-10 left gun). */
  hand2: THREE.Object3D;
  /** Mounts the model (and its optional second gun) and switches hold pose. */
  setWeapon(model: WeaponModel | null): void;
  /** The mounted weapon model (also auto-created from params.weapon when it changes). */
  getWeapon(): WeaponModel | null;
}

// ------------------------------------------------------------------ proportions
const GUN_Y = PLAYER.muzzleHeight;
const HIP_Y = 0.5;
const CHEST_Y = 0.1;
const NECK_Y = 0.37;
const SH_Y = 0.29;
const SH_Z = 0.23;
/** Front-back squash of the parka (x = depth of the body). */
const BODY_SX = 0.97;
const UPPER = 0.255;
const FORE = 0.25;
const HIP_Z = 0.11;
const THIGH = 0.2;
const GETUP_TIME = 0.5;
const KICK_TIME = 0.3;
const STRIDE = 1.05; // metres per full gait cycle
/** Total head yaw toward the camera so the face reads in 3/4 view. */
const HEAD_YAW = 1.0;
/** Face tilted up toward the elevated camera (negative z = look up when facing -X). */
const HEAD_UP = -0.16;

const COL = {
  parka: 0x1a8cff,
  parkaDeep: 0x0a62e2,
  fur: 0xfafaf6,
  furShade: 0xd3dae4,
  skin: 0xeaa47c,
  skinDark: 0xd98a62,
  cheek: 0xf26a6c,
  eye: 0x140e0c,
  hair: 0x1b1310,
  mouth: 0x7c2a22,
  mitten: 0x5b7092,
  mittenDark: 0x485c7c,
  pants: 0x3a3e50,
  boot: 0x3e2c21,
  bootDark: 0x2a1d15,
  sole: 0x1c140f,
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Parka colours used while a rig is being built (teammates wear other colours). */
let PARKA = { hi: COL.parka, deep: COL.parkaDeep };

/** Parka blue, a little deeper toward the hem, faint fabric noise. `y0` = bone height in root space. */
const parkaShade = (y0: number) => (p: THREE.Vector3) => {
  const y = p.y + y0;
  const c = mix(PARKA.deep, PARKA.hi, 0.45 + 0.55 * smooth(0.15, 0.95, y));
  c.offsetHSL(0, 0, (hash3(p.x * 50, p.y * 50, p.z * 50) - 0.5) * 0.035);
  return c;
};
/** Snap positions so closing seams (sin 2pi != 0) are bit-identical: no hairline cracks. */
function weld<T extends THREE.BufferGeometry>(g: T): T {
  const a = g.attributes.position.array as Float32Array;
  for (let i = 0; i < a.length; i++) a[i] = Math.round(a[i] * 1e5) / 1e5;
  g.attributes.position.needsUpdate = true;
  return g;
}

const furShade = (p: THREE.Vector3) => mix(COL.fur, COL.furShade, hash3(p.x * 70, p.y * 70, p.z * 70) * 0.55);

// ------------------------------------------------------------------ hold table
interface HoldDef {
  /** Grip position (root space x, z); y follows from the gun line. */
  x: number;
  z: number;
  /** Chest yaw toward the camera. */
  yaw: number;
  /** Second gun grip (dual). */
  x2?: number;
  z2?: number;
}
const HOLD: Record<WeaponId, HoldDef> = {
  pistol: { x: -0.355, z: 0.04, yaw: 0.32 },
  magnum: { x: -0.345, z: 0.04, yaw: 0.32 },
  mp5: { x: -0.2, z: 0.15, yaw: 0.72 },
  grenades: { x: -0.25, z: 0.2, yaw: 0.3 },
  shotgun: { x: -0.23, z: 0.15, yaw: 0.78 },
  mac10: { x: -0.37, z: 0.2, yaw: 0.12, x2: -0.31, z2: -0.17 },
  flunk: { x: -0.26, z: 0.15, yaw: 0.72 },
  m4: { x: -0.27, z: 0.15, yaw: 0.72 },
  awp: { x: -0.27, z: 0.15, yaw: 0.78 },
  vintage: { x: -0.2, z: 0.16, yaw: 0.75 },
  minigun: { x: -0.04, z: 0.24, yaw: 0.25 },
};

interface RecoilDef {
  x: number;
  rz: number;
  up: number;
  down: number;
  body: number;
}
const RECOIL: Record<WeaponId, RecoilDef> = {
  pistol: { x: 0.035, rz: 0.3, up: 0.02, down: 0.12, body: 0.02 },
  magnum: { x: 0.06, rz: 0.6, up: 0.02, down: 0.2, body: 0.06 },
  mp5: { x: 0.022, rz: 0.05, up: 0.015, down: 0.06, body: 0.015 },
  grenades: { x: 0, rz: 0, up: 0.02, down: 0.05, body: 0 },
  shotgun: { x: 0.075, rz: 0.22, up: 0.02, down: 0.22, body: 0.09 },
  mac10: { x: 0.028, rz: 0.12, up: 0.01, down: 0.045, body: 0.01 },
  flunk: { x: 0.06, rz: 0.2, up: 0.02, down: 0.18, body: 0.06 },
  m4: { x: 0.026, rz: 0.06, up: 0.015, down: 0.06, body: 0.02 },
  awp: { x: 0.09, rz: 0.2, up: 0.02, down: 0.32, body: 0.1 },
  vintage: { x: 0.16, rz: 0.28, up: 0.03, down: 0.45, body: 0.2 },
  minigun: { x: 0.012, rz: 0.015, up: 0.01, down: 0.03, body: 0.01 },
};

/** Gun offset at the height of a reload: root-space translation + gun-local rotation (XYZ). */
const RELOAD_POSE: Record<WeaponId, { d: [number, number, number]; r: [number, number, number] }> = {
  pistol: { d: [0.09, 0.03, 0.0], r: [-0.2, 0.45, -0.45] },
  magnum: { d: [0.1, 0.05, 0.02], r: [0, 0.4, -0.9] },
  mp5: { d: [0.05, -0.04, 0.03], r: [-0.35, 0.3, -0.12] },
  grenades: { d: [0, 0, 0], r: [0, 0, 0] },
  shotgun: { d: [0.05, -0.04, 0.03], r: [-0.75, 0.15, -0.06] },
  mac10: { d: [0.12, 0.06, 0.0], r: [0, 0.2, -0.75] },
  flunk: { d: [0.06, -0.02, 0.03], r: [-0.25, 0.35, -0.3] },
  m4: { d: [0.05, -0.04, 0.03], r: [-0.35, 0.3, -0.12] },
  awp: { d: [0.06, -0.04, 0.03], r: [-0.3, 0.2, -0.08] },
  vintage: { d: [0.14, 0.02, 0.0], r: [0, 0.12, -0.05] },
  minigun: { d: [0.0, -0.06, 0.0], r: [0, 0.05, 0.12] },
};

/** Support-hand keyframes during a reload. 'S' = support grip; w = weapon-local; r = root-local. */
export type KeyPos = 'S' | ['w' | 'r', number, number, number];
type Key = [number, KeyPos];
const POUCH: KeyPos = ['r', 0.02, 0.56, 0.3];
/** Also used by the first-person viewmodel ('r' keys there mean the belt pouch). */
export const RELOAD_KEYS: Partial<Record<WeaponId, Key[]>> = {
  pistol: [[0, 'S'], [0.12, 'S'], [0.28, POUCH], [0.42, ['w', 0.02, -0.15, 0.0]], [0.62, ['w', 0.02, -0.1, 0.0]], [0.74, ['w', 0.02, 0.07, 0.05]], [0.84, ['w', -0.02, 0.07, 0.05]], [1, 'S']],
  magnum: [[0, 'S'], [0.1, ['w', -0.04, 0.0, 0.07]], [0.32, ['w', -0.04, 0.0, 0.07]], [0.46, POUCH], [0.62, ['w', 0.02, 0.05, 0.09]], [0.78, ['w', -0.03, 0.02, 0.07]], [0.9, 'S'], [1, 'S']],
  mp5: [[0, 'S'], [0.1, ['w', -0.11, -0.08, 0.0]], [0.2, ['w', -0.12, -0.12, 0.0]], [0.36, POUCH], [0.52, ['w', -0.12, -0.15, 0.0]], [0.66, ['w', -0.11, -0.08, 0.0]], [0.78, ['w', -0.3, 0.09, 0.03]], [0.86, ['w', -0.26, 0.09, 0.03]], [1, 'S']],
  m4: [[0, 'S'], [0.1, ['w', -0.09, -0.08, 0.0]], [0.2, ['w', -0.1, -0.12, 0.0]], [0.36, POUCH], [0.52, ['w', -0.09, -0.16, 0.0]], [0.66, ['w', -0.09, -0.09, 0.0]], [0.78, ['w', 0.07, 0.1, 0.0]], [0.86, ['w', 0.1, 0.1, 0.0]], [1, 'S']],
  flunk: [[0, 'S'], [0.1, ['w', -0.24, 0.02, 0.07]], [0.22, POUCH], [0.36, ['w', -0.24, 0.02, 0.07]], [0.5, POUCH], [0.64, ['w', -0.24, 0.02, 0.07]], [0.78, POUCH], [0.9, ['w', -0.24, 0.02, 0.07]], [1, 'S']],
  awp: [[0, 'S'], [0.06, ['w', 0.0, 0.07, 0.07]], [0.14, ['w', 0.07, 0.08, 0.07]], [0.24, ['w', -0.11, -0.09, 0.0]], [0.38, POUCH], [0.52, ['w', -0.11, -0.12, 0.0]], [0.66, ['w', -0.11, -0.07, 0.0]], [0.8, ['w', 0.07, 0.08, 0.07]], [0.9, ['w', 0.0, 0.07, 0.07]], [1, 'S']],
  vintage: [[0, 'S'], [0.12, ['w', -0.14, 0.08, 0.06]], [0.28, POUCH], [0.44, ['w', -0.12, 0.08, 0.05]], [0.56, POUCH], [0.7, ['w', -0.12, 0.08, 0.05]], [0.84, ['w', -0.35, -0.05, 0.0]], [1, 'S']],
  minigun: [[0, 'S'], [0.15, ['w', -0.1, -0.06, 0.16]], [0.35, ['w', -0.06, -0.1, 0.17]], [0.55, ['w', -0.1, -0.06, 0.16]], [0.75, ['w', -0.06, -0.1, 0.17]], [0.88, 'S'], [1, 'S']],
};
(() => {
  // shotgun: shells loaded one at a time — pouch <-> loading port, four times
  const k: Key[] = [[0, 'S'], [0.08, 'S']];
  const port: KeyPos = ['w', -0.12, -0.03, 0.02];
  for (let i = 0; i < 4; i++) {
    const t0 = 0.12 + i * 0.19;
    k.push([t0, POUCH], [t0 + 0.1, port]);
  }
  k.push([0.92, 'S'], [1, 'S']);
  RELOAD_KEYS.shotgun = k;
})();

// ------------------------------------------------------------------ body pose
interface Pose {
  px: number;
  py: number;
  /** pelvis roll (waddle) and pitch (+ = lean forward toward -X) */
  prx: number;
  prz: number;
  /** chest extra yaw / pitch */
  cy: number;
  crz: number;
  /** thigh / shin swing (left = near, right = far); thigh - = forward, shin + = knee bend */
  tl: number;
  tr: number;
  sl: number;
  sr: number;
  spread: number;
}
const newPose = (): Pose => ({ px: 0, py: HIP_Y, prx: 0, prz: 0, cy: 0, crz: 0, tl: 0, tr: 0, sl: 0.04, sr: 0.04, spread: 0.05 });
function lerpPose(a: Pose, b: Pose, t: number, out: Pose): Pose {
  for (const k of Object.keys(out) as Array<keyof Pose>) out[k] = lerp(a[k], b[k], t);
  return out;
}
const NEUTRAL: Readonly<Pose> = newPose();
const SIT: Pose = { px: 0.06, py: 0.27, prx: 0, prz: -0.38, cy: 0, crz: -0.06, tl: -1.15, tr: -1.05, sl: 0.15, sr: 0.28, spread: 0.12 };
const KNEEL: Pose = { px: 0.02, py: 0.36, prx: 0, prz: 0.3, cy: 0, crz: 0.08, tl: -1.45, tr: -0.25, sl: 1.65, sr: 1.35, spread: 0.08 };

// ------------------------------------------------------------------ IK
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
 * the elbow bends about the forearm's local +Z (matching the ragdoll hinge).
 * target / pole are world space. Returns the reach error (m).
 */
function solveArm(upper: THREE.Object3D, lower: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3, l1: number, l2: number): number {
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

// ------------------------------------------------------------------ model
function buildBody(bones: Record<string, THREE.Object3D>) {
  const { pelvis, chest, head, upperArmL, upperArmR, lowerArmL, lowerArmR, thighL, thighR, shinL, shinR } = bones;

  // lower parka (skirt) — pelvis space
  const P = new PartBuilder();
  const skirt = lathe([[0.0, -0.29], [0.3, -0.29], [0.33, -0.255], [0.334, -0.15], [0.324, -0.04], [0.306, 0.07], [0.286, 0.14], [0.262, 0.2], [0.18, 0.24], [0.0, 0.25]], 28);
  skirt.rotateY(Math.PI);
  skirt.scale(BODY_SX, 1, 1);
  weld(skirt);
  P.addShaded(skirt, parkaShade(HIP_Y), 'cloth');
  const hem = torus(0.322, 0.07, 8, 32);
  hem.rotateX(Math.PI / 2);
  hem.rotateY(Math.PI / 2);
  hem.scale(BODY_SX, 1, 1);
  weld(hem);
  P.addShaded(hem, furShade, 'fur', { p: [0, -0.268, 0] });
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const j = hash3(i, 1, 2);
    P.addShaded(sphere(0.042 + j * 0.014, 8, 6), furShade, 'fur', {
      p: [Math.cos(a) * 0.335 * BODY_SX, -0.27 - j * 0.012, Math.sin(a) * 0.335],
    });
  }
  P.buildInto(pelvis);

  // upper parka — chest space
  const Ch = new PartBuilder();
  const torso = lathe([[0.0, -0.12], [0.292, -0.12], [0.288, 0.0], [0.274, 0.1], [0.252, 0.19], [0.218, 0.265], [0.16, 0.325], [0.085, 0.365], [0.0, 0.375]], 28);
  torso.rotateY(Math.PI);
  torso.scale(BODY_SX, 1, 1);
  weld(torso);
  Ch.addShaded(torso, parkaShade(HIP_Y + CHEST_Y), 'cloth');
  Ch.buildInto(chest);

  // hood + face — head space
  const H = new PartBuilder();
  H.addShaded(ellipsoid(0.27, 0.28, 0.27, 26, 18), parkaShade(HIP_Y + CHEST_Y + NECK_Y), 'cloth', { p: [0.04, 0.2, 0] });
  H.addShaded(ellipsoid(0.13, 0.18, 0.12, 14, 10), parkaShade(HIP_Y + CHEST_Y + NECK_Y), 'cloth', { p: [0.16, 0.36, 0], r: [0, 0, -0.75] });
  // face: centre FX, front surface at FX - FR
  const FX = -0.125;
  const FY = 0.2;
  const FR = 0.115;
  H.add(ellipsoid(FR, 0.158, 0.145, 18, 14), COL.skin, 'skin', { p: [FX, FY, 0] });
  const ring = torus(0.148, 0.062, 10, 32);
  ring.rotateY(Math.PI / 2);
  weld(ring);
  H.addShaded(ring, furShade, 'fur', { p: [FX - 0.078, FY, 0], s: [1, 1.08, 1] });
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const j = hash3(i, 7, 3);
    const rr = 0.18 + j * 0.014;
    H.addShaded(sphere(0.038 + j * 0.012, 8, 6), furShade, 'fur', {
      p: [FX - 0.07 + (j - 0.5) * 0.02, FY + Math.cos(a) * rr * 1.08, Math.sin(a) * rr],
    });
  }
  const fz = FX - FR;
  for (const s of [1, -1]) {
    H.add(ellipsoid(0.016, 0.03, 0.018, 10, 8), COL.eye, 'eye', { p: [fz + 0.014, FY + 0.024, 0.047 * s] });
    H.add(sphere(0.0055, 6, 4), 0xffffff, 'eye', { p: [fz + 0.0, FY + 0.036, 0.043 * s] });
    H.add(ellipsoid(0.008, 0.024, 0.03, 10, 8), COL.cheek, 'skin', { p: [fz + 0.014, FY - 0.032, 0.074 * s] });
  }
  H.add(sphere(0.023, 10, 8), COL.skinDark, 'skin', { p: [fz - 0.003, FY - 0.006, 0] });
  H.add(box(0.009, 0.009, 0.046), COL.mouth, 'skin', { p: [fz + 0.007, FY - 0.062, 0] });
  H.add(ellipsoid(0.045, 0.045, 0.118, 12, 8), COL.hair, 'fur', { p: [fz + 0.034, FY + 0.088, 0] });
  H.buildInto(head);

  // arms
  for (const [up, lo] of [[upperArmL, lowerArmL], [upperArmR, lowerArmR]]) {
    const U = new PartBuilder();
    U.addShaded(capsule(0.083, UPPER + 0.09, 6, 14), parkaShade(0.85), 'cloth', { p: [0, -UPPER / 2 + 0.01, 0] });
    U.buildInto(up);
    const L = new PartBuilder();
    L.addShaded(capsule(0.076, 0.2, 6, 14), parkaShade(0.75), 'cloth', { p: [0, -0.08, 0] });
    const cuff = torus(0.068, 0.038, 8, 18);
    cuff.rotateX(Math.PI / 2);
    weld(cuff);
    L.addShaded(cuff, furShade, 'fur', { p: [0, -0.165, 0] });
    L.add(ellipsoid(0.058, 0.072, 0.056, 14, 10), COL.mitten, 'cloth', { p: [0, -FORE + 0.004, 0] });
    L.add(ellipsoid(0.024, 0.036, 0.026, 8, 6), COL.mittenDark, 'cloth', { p: [-0.042, -FORE + 0.024, 0.0] });
    L.buildInto(lo);
  }

  // legs
  for (const [th, sh] of [[thighL, shinL], [thighR, shinR]] as const) {
    const T = new PartBuilder();
    T.add(capsule(0.09, THIGH + 0.12, 6, 12), COL.pants, 'cloth', { p: [0, -THIGH / 2 + 0.01, 0] });
    T.buildInto(th);
    const S = new PartBuilder();
    S.add(capsule(0.08, 0.16, 6, 12), COL.pants, 'cloth', { p: [0, -0.05, 0] });
    S.add(cyl(0.084, 0.09, 0.15, 14), COL.boot, 'rubber', { p: [0, -0.175, 0] });
    S.add(roundBox(0.25, 0.12, 0.155, 0.05, 3), COL.boot, 'rubber', { p: [-0.045, -0.238, 0] });
    S.add(roundBox(0.255, 0.022, 0.16, 0.008), COL.sole, 'rubber', { p: [-0.045, -0.289, 0] });
    S.add(box(0.06, 0.03, 0.158), COL.bootDark, 'rubber', { p: [-0.13, -0.23, 0] });
    const bc = torus(0.088, 0.038, 8, 18);
    bc.rotateX(Math.PI / 2);
    weld(bc);
    S.addShaded(bc, furShade, 'fur', { p: [0, -0.1, 0] });
    S.buildInto(sh);
  }
}

const SPEC: Record<string, BoneSpec> = (() => {
  const arm = (): [BoneSpec, BoneSpec] => [
    { shape: 'capsule', size: [0.078, 0.065], axis: 'y', offset: [0, -0.12, 0], mass: 3, joint: { kind: 'cone', axis: [0, -1, 0], cone: 1.5, twist: 0.8 } },
    { shape: 'capsule', size: [0.07, 0.08], axis: 'y', offset: [0, -0.13, 0], mass: 2.5, joint: { kind: 'hinge', axis: [0, 0, 1] } },
  ];
  const leg = (): [BoneSpec, BoneSpec] => [
    { shape: 'capsule', size: [0.088, 0.05], axis: 'y', offset: [0, -0.1, 0], mass: 6.5, joint: { kind: 'cone', axis: [0, -1, 0], cone: 1.0, twist: 0.3 } },
    { shape: 'capsule', size: [0.082, 0.07], axis: 'y', offset: [0, -0.16, 0], mass: 4.5, joint: { kind: 'hinge', axis: [0, 0, 1] } },
  ];
  const [ual, lal] = arm();
  const [uar, lar] = arm();
  const [tl, sl] = leg();
  const [tr, sr] = leg();
  return {
    pelvis: { shape: 'box', size: [0.25, 0.17, 0.27], offset: [0, -0.1, 0], mass: 15 },
    chest: { shape: 'box', size: [0.23, 0.19, 0.25], offset: [0, 0.15, 0], mass: 21, joint: { kind: 'cone', axis: [0, 1, 0], cone: 0.5, twist: 0.4 } },
    head: { shape: 'sphere', size: [0.23], offset: [0.02, 0.19, 0], mass: 6, joint: { kind: 'cone', axis: [0, 1, 0], cone: 0.6, twist: 0.7 }, gib: true },
    upperArmL: ual,
    lowerArmL: lal,
    upperArmR: uar,
    lowerArmR: lar,
    thighL: tl,
    shinL: sl,
    thighR: tr,
    shinR: sr,
  };
})();

// ------------------------------------------------------------------ rig
const _G = new THREE.Matrix4();
const _G2 = new THREE.Matrix4();
const _F = new THREE.Matrix4();
const _chestNow = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _pos2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _eul = new THREE.Euler();
const _tgt = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _poleL = new THREE.Vector3();
const _poleR = new THREE.Vector3();
const POLE_L = new THREE.Vector3(0.35, -1, 0.65);
const POLE_R = new THREE.Vector3(0.35, -1, -0.65);

export function createHunterRig(opts: { parka?: number; parkaDeep?: number } = {}): HunterRig {
  const root = new THREE.Group();
  root.name = 'hunter';
  const bones = new Map<string, THREE.Object3D>();
  const B = (name: string, parent: THREE.Object3D, p: [number, number, number]) => {
    const b = bone(name, parent, p);
    bones.set(name, b);
    return b;
  };
  const pelvis = B('pelvis', root, [0, HIP_Y, 0]);
  const chest = B('chest', pelvis, [0, CHEST_Y, 0]);
  const head = B('head', chest, [0, NECK_Y, 0]);
  const upperArmL = B('upperArmL', chest, [0, SH_Y, SH_Z]);
  const lowerArmL = B('lowerArmL', upperArmL, [0, -UPPER, 0]);
  const upperArmR = B('upperArmR', chest, [0, SH_Y, -SH_Z]);
  const lowerArmR = B('lowerArmR', upperArmR, [0, -UPPER, 0]);
  const thighL = B('thighL', pelvis, [0, 0, HIP_Z]);
  const shinL = B('shinL', thighL, [0, -THIGH, 0]);
  const thighR = B('thighR', pelvis, [0, 0, -HIP_Z]);
  const shinR = B('shinR', thighR, [0, -THIGH, 0]);
  chest.rotation.order = 'YXZ';
  head.rotation.order = 'YXZ';
  const hand = new THREE.Object3D();
  hand.name = 'hand';
  hand.position.set(0, -FORE, 0);
  lowerArmL.add(hand);
  const hand2 = new THREE.Object3D();
  hand2.name = 'hand2';
  hand2.position.set(0, -FORE, 0);
  lowerArmR.add(hand2);
  bones.set('hand', hand);
  bones.set('hand2', hand2);

  PARKA = { hi: opts.parka ?? COL.parka, deep: opts.parkaDeep ?? COL.parkaDeep };
  try {
    buildBody({ pelvis, chest, head, upperArmL, upperArmR, lowerArmL, lowerArmR, thighL, thighR, shinL, shinR });
  } finally {
    PARKA = { hi: COL.parka, deep: COL.parkaDeep };
  }

  // chest transform (root space) in the neutral pose, for chest-follow holds
  const chestRestInv = new THREE.Matrix4();
  {
    pelvis.updateMatrix();
    chest.rotation.set(0, 0, 0);
    chest.updateMatrix();
    chestRestInv.multiplyMatrices(pelvis.matrix, chest.matrix).invert();
  }

  let weapon: WeaponModel | null = null;
  let hold: HoldStyle | 'none' = 'none';
  const cache = new Map<WeaponId, WeaponModel>();
  let spin = 0;
  let follow = 0;
  let first = true;
  let reach = 0;
  const pose = newPose();

  function setWeapon(model: WeaponModel | null): void {
    if (weapon) {
      hand.remove(weapon.group);
      if (weapon.group2) hand2.remove(weapon.group2);
    }
    weapon = model;
    hold = model ? model.hold : 'none';
    if (model) {
      cache.set(model.id, model);
      model.group.position.set(0, 0, 0);
      model.group.quaternion.identity();
      hand.add(model.group);
      if (model.group2) {
        model.group2.position.set(0, 0, 0);
        model.group2.quaternion.identity();
        hand2.add(model.group2);
      }
    }
    hand2.position.set(0, -FORE, 0);
    hand2.quaternion.identity();
  }

  // ---------------------------------------------------------------- body
  function bodyPose(a: AnimInput, out: Pose): Pose {
    const st = a.stateTime;
    const t = a.time;
    Object.assign(out, NEUTRAL);
    // idle breathing
    out.py += 0.004 * Math.sin(t * 2.1);
    out.crz += 0.012 * Math.sin(t * 2.1 + 0.6);
    switch (a.state) {
      case 'walk': {
        const w = clamp01(a.speed / 1.2) * smooth(0, 0.12, st + 0.12);
        const ph = (a.distance / STRIDE) * Math.PI * 2;
        const s = Math.sin(ph);
        const c = Math.cos(ph);
        out.tl = -0.55 * s * w;
        out.tr = 0.55 * s * w;
        out.sl = 0.06 + 1.0 * Math.max(0, c) * w;
        out.sr = 0.06 + 1.0 * Math.max(0, -c) * w;
        out.py = HIP_Y + 0.03 * w * (Math.abs(c) - 0.6);
        out.prx = 0.07 * s * w;
        out.crz += 0.03 * w;
        break;
      }
      case 'jump': {
        const u = smooth(0, 0.12, st);
        out.tl = -0.75 * u;
        out.tr = -0.45 * u;
        out.sl = 0.04 + 1.25 * u;
        out.sr = 0.04 + 0.95 * u;
        out.prz = 0.08 * u;
        break;
      }
      case 'fall': {
        const u = smooth(0, 0.2, st);
        out.tl = lerp(-0.6, -0.3, u) + 0.06 * Math.sin(t * 9);
        out.tr = lerp(-0.4, 0.15, u) - 0.06 * Math.sin(t * 9);
        out.sl = lerp(1.1, 0.4, u);
        out.sr = lerp(0.9, 0.55, u);
        out.prz = -0.04;
        out.spread = 0.12;
        break;
      }
      case 'sit': {
        lerpPose(out, SIT, smooth(0, 0.18, st), out);
        break;
      }
      case 'getup': {
        const u = clamp01(st / GETUP_TIME);
        if (u < 0.5) lerpPose(SIT, KNEEL, smooth(0, 0.5, u), out);
        else lerpPose(KNEEL, NEUTRAL, smooth(0.5, 1, u), out);
        break;
      }
      case 'kick': {
        const u = clamp01(st / KICK_TIME);
        const sw = Math.sin(Math.PI * Math.min(1, u * 1.15));
        out.tl = -1.05 * sw;
        out.sl = u < 0.35 ? lerp(0.05, 1.3, smooth(0, 0.35, u)) : lerp(1.3, 0.05, smooth(0.35, 0.6, u));
        out.tr = 0.12 * sw;
        out.sr = 0.15 * sw;
        out.prz = -0.22 * sw;
        out.crz = 0.08 * sw;
        out.py = HIP_Y - 0.02 * sw;
        break;
      }
      case 'air': {
        const f = st * 14;
        out.prz = -0.55 - 0.15 * Math.sin(st * 7);
        out.crz = -0.15;
        out.tl = -0.55 + 0.6 * Math.sin(f);
        out.tr = -0.55 + 0.6 * Math.sin(f + Math.PI);
        out.sl = 0.9 + 0.5 * Math.sin(f + 1.2);
        out.sr = 0.9 + 0.5 * Math.sin(f + 1.2 + Math.PI);
        out.spread = 0.2;
        break;
      }
      default:
        break;
    }
    return out;
  }

  function applyPose(p: Pose, yaw: number) {
    pelvis.position.set(p.px, p.py, 0);
    pelvis.rotation.set(p.prx, 0, p.prz);
    chest.rotation.set(-p.prx * 0.6, yaw + p.cy, p.crz);
    head.rotation.set(0, HEAD_YAW - yaw - p.cy, HEAD_UP - (p.prz + p.crz) * 0.75);
    thighL.rotation.set(-p.spread, 0, p.tl);
    thighR.rotation.set(p.spread, 0, p.tr);
    shinL.rotation.set(0, 0, p.sl);
    shinR.rotation.set(0, 0, p.sr);
  }

  // ---------------------------------------------------------------- gun
  function resolveKey(k: KeyPos, out: THREE.Vector3): THREE.Vector3 {
    if (k === 'S') {
      if (weapon?.support) weapon.support.getWorldPosition(out);
      else out.set(-0.1, 0.6, -0.2).applyMatrix4(root.matrixWorld);
      return out;
    }
    out.set(k[1], k[2], k[3]);
    if (k[0] === 'w' && weapon) out.applyMatrix4(weapon.group.matrixWorld);
    else out.applyMatrix4(root.matrixWorld);
    return out;
  }

  function supportTarget(id: WeaponId, reloadT: number, out: THREE.Vector3): THREE.Vector3 {
    const keys = reloadT >= 0 ? RELOAD_KEYS[id] : undefined;
    if (!keys) return resolveKey('S', out);
    let i = 0;
    while (i < keys.length - 2 && reloadT >= keys[i + 1][0]) i++;
    const [t0, k0] = keys[i];
    const [t1, k1] = keys[i + 1];
    const u = smooth(t0, t1, reloadT);
    resolveKey(k0, _a);
    resolveKey(k1, _b);
    return out.lerpVectors(_a, _b, u);
  }

  /** Grenade hand path (root space) for throw / re-arm. */
  function grenadePath(throwT: number, reloadT: number, rest: THREE.Vector3, out: THREE.Vector3): { rz: number; lean: number; twist: number } {
    out.copy(rest);
    if (throwT >= 0) {
      const K: Array<[number, number, number, number]> = [
        [0, rest.x, rest.y, rest.z],
        [0.32, 0.14, 1.2, 0.27],
        [0.46, 0.02, 1.4, 0.22],
        [0.58, -0.36, 1.12, 0.12],
        [1.0, -0.28, 0.62, 0.08],
      ];
      let i = 0;
      while (i < K.length - 2 && throwT >= K[i + 1][0]) i++;
      const u = smooth(K[i][0], K[i + 1][0], throwT);
      out.set(lerp(K[i][1], K[i + 1][1], u), lerp(K[i][2], K[i + 1][2], u), lerp(K[i][3], K[i + 1][3], u));
      const wind = smooth(0, 0.32, throwT) * (1 - smooth(0.32, 0.55, throwT));
      const fwd = smooth(0.35, 0.6, throwT) * (1 - smooth(0.75, 1, throwT));
      return { rz: -2.5 * wind + 2 * fwd, lean: -0.18 * wind + 0.3 * fwd, twist: 0.45 * wind - 0.35 * fwd };
    }
    if (reloadT >= 0) {
      // reach to the belt pouch for the next grenade and bring it up
      _a.set(0.04, 0.56, 0.29);
      _b.set(-0.28, 0.62, 0.08);
      if (reloadT < 0.4) out.lerpVectors(_b, _a, smooth(0, 0.4, reloadT));
      else out.lerpVectors(_a, rest, smooth(0.45, 1, reloadT));
    }
    return { rz: 0, lean: 0, twist: 0 };
  }

  function animate(a: AnimInput): void {
    if (a.state === 'dead') return;
    const prm = a.params ?? {};
    const num = (k: string, d: number) => (typeof prm[k] === 'number' && Number.isFinite(prm[k] as number) ? (prm[k] as number) : d);
    const wi = num('weapon', -1);
    const wantId = WEAPON_ORDER[wi];
    if (wantId && (!weapon || weapon.id !== wantId)) setWeapon(cache.get(wantId) ?? createWeaponModel(wantId));
    const fireT = num('fireT', 99);
    const reloadT = num('reloadT', -1);
    const heat = num('heat', 0);
    const cock = num('cock', 0);
    const throwT = num('throwT', -1);
    const dt = Math.max(0, Math.min(0.1, a.dt || 0));
    const id = weapon?.id;
    const def = id ? HOLD[id] : null;
    const rc = id ? RECOIL[id] : null;

    // ---- body
    bodyPose(a, pose);
    const k = rc ? kickCurve(fireT, rc.up, rc.down) : 0;
    let yaw = def ? def.yaw : 0.2;
    let gp = { rz: 0, lean: 0, twist: 0 };
    const rest = _pos2;
    if (id === 'grenades') {
      rest.set(def!.x, GUN_Y, def!.z);
      gp = grenadePath(throwT, reloadT, rest, _pos);
      pose.crz += gp.lean;
      yaw += gp.twist;
    }
    if (rc) pose.crz -= rc.body * k;
    applyPose(pose, yaw);

    // chest-follow weight: the gun goes with the body when sitting / tumbling
    let fw = 0;
    if (a.state === 'sit' || a.state === 'air') fw = 1;
    else if (a.state === 'getup') fw = 1 - smooth(0.25, 0.9, a.stateTime / GETUP_TIME);
    follow = first ? fw : follow + (fw - follow) * Math.min(1, dt * 12);

    root.updateWorldMatrix(true, true);
    _poleL.copy(POLE_L).transformDirection(root.matrixWorld);
    _poleR.copy(POLE_R).transformDirection(root.matrixWorld);

    if (!weapon || !def || !rc || !id) {
      // empty hands: arms swing at the sides
      const sw = a.state === 'walk' ? 0.12 * Math.sin((a.distance / STRIDE) * Math.PI * 2) : 0;
      _tgt.set(-0.04 + sw, 0.5, 0.31).applyMatrix4(root.matrixWorld);
      solveArm(upperArmL, lowerArmL, _tgt, _poleL, UPPER, FORE);
      _tgt.set(-0.04 - sw, 0.5, -0.31).applyMatrix4(root.matrixWorld);
      solveArm(upperArmR, lowerArmR, _tgt, _poleR, UPPER, FORE);
      hand.position.set(0, -FORE, 0);
      hand.quaternion.identity();
      first = false;
      return;
    }

    // ---- gun transform (root space)
    const r = reloadT >= 0 ? reloadT : -1;
    const env = r >= 0 ? smooth(0, 0.15, r) * (1 - smooth(0.85, 1, r)) : 0;
    const RP = RELOAD_POSE[id];
    let rzR = RP.r[2] * env;
    if (id === 'magnum' && r >= 0) rzR = env * lerp(-0.95, 0.45, smooth(0.36, 0.5, r));
    if (id === 'grenades') {
      _q.setFromEuler(_eul.set(0, 0, gp.rz));
    } else {
      _pos.set(def.x + rc.x * k + RP.d[0] * env, GUN_Y - weapon.muzzleRest.y + RP.d[1] * env, def.z + RP.d[2] * env);
      _q.setFromEuler(_eul.set(RP.r[0] * env, RP.r[1] * env, rzR - rc.rz * k, 'XYZ'));
    }
    // minigun shake while spinning and firing
    if (id === 'minigun' && fireT < 0.2) {
      _pos.x += (Math.random() - 0.5) * 0.008;
      _pos.y += (Math.random() - 0.5) * 0.008;
    }
    // walking bob of the arms (tiny)
    if (a.state === 'walk') _pos.y += (pose.py - HIP_Y) * 0.35;
    _G.compose(_pos, _q, _s.set(1, 1, 1));
    if (a.state === 'air') {
      _F.makeRotationZ(0.35 * Math.sin(a.stateTime * 10));
      _G.multiply(_F);
    }
    // blend toward the chest-following transform
    if (follow > 1e-3) {
      _chestNow.multiplyMatrices(pelvis.matrix, chest.matrix);
      _F.multiplyMatrices(_chestNow, chestRestInv).multiply(_G);
      _F.decompose(_a, _q2, _s);
      _G.decompose(_b, _q, _s);
      _b.lerp(_a, follow);
      _q.slerp(_q2, follow);
      _G.compose(_b, _q, _s.set(1, 1, 1));
    }
    _G.premultiply(root.matrixWorld);

    // ---- trigger arm + hand mount
    _tgt.setFromMatrixPosition(_G);
    reach = solveArm(upperArmL, lowerArmL, _tgt, _poleL, UPPER, FORE);
    lowerArmL.updateMatrixWorld(true);
    _F.copy(lowerArmL.matrixWorld).invert().multiply(_G);
    _F.decompose(hand.position, hand.quaternion, _s);
    hand.updateMatrixWorld(true);

    // ---- weapon parts
    const spinTarget = typeof prm.spin === 'number' ? (prm.spin as number) : fireT < 0.3 ? 1 : heat > 0.05 && fireT < 0.8 ? 0.6 : 0;
    spin += (spinTarget - spin) * Math.min(1, dt * (spinTarget > spin ? 5 : 1.1));
    weapon.animate({ fireT, reloadT, heat, spin: id === 'minigun' ? spin : 0, cock, dt, throwT });
    weapon.group.updateMatrixWorld(true);

    // ---- support arm
    if (hold === 'dual' && weapon.group2) {
      const mr2 = weapon.muzzleRest2 ?? weapon.muzzleRest;
      _pos.set((def.x2 ?? def.x) + rc.x * kickCurve(fireT - 0.02, rc.up, rc.down) + 0.1 * env, GUN_Y - mr2.y + 0.05 * env, def.z2 ?? -def.z);
      _q.setFromEuler(_eul.set(0, 0.15 * env, -0.7 * env - rc.rz * kickCurve(fireT - 0.02, rc.up, rc.down), 'XYZ'));
      _G2.compose(_pos, _q, _s.set(1, 1, 1));
      if (follow > 1e-3) {
        _F.multiplyMatrices(_chestNow, chestRestInv).multiply(_G2);
        _F.decompose(_a, _q2, _s);
        _G2.decompose(_b, _q, _s);
        _b.lerp(_a, follow);
        _q.slerp(_q2, follow);
        _G2.compose(_b, _q, _s.set(1, 1, 1));
      }
      _G2.premultiply(root.matrixWorld);
      _tgt.setFromMatrixPosition(_G2);
      reach = Math.max(reach, solveArm(upperArmR, lowerArmR, _tgt, _poleR, UPPER, FORE));
      lowerArmR.updateMatrixWorld(true);
      _F.copy(lowerArmR.matrixWorld).invert().multiply(_G2);
      _F.decompose(hand2.position, hand2.quaternion, _s);
    } else {
      if (id === 'grenades') {
        // free hand points at the target while throwing, rests at the chest otherwise
        const th = throwT >= 0 ? smooth(0, 0.25, throwT) * (1 - smooth(0.7, 1, throwT)) : 0;
        _a.set(-0.16, 0.7, -0.08);
        _b.set(-0.46, 1.02, -0.14);
        _tgt.lerpVectors(_a, _b, th).applyMatrix4(root.matrixWorld);
      } else if (a.state === 'air') {
        _tgt.set(0.08 + 0.12 * Math.sin(a.stateTime * 11), 1.3 + 0.08 * Math.cos(a.stateTime * 13), -0.32).applyMatrix4(root.matrixWorld);
      } else {
        supportTarget(id, reloadT, _tgt);
      }
      reach = Math.max(reach, solveArm(upperArmR, lowerArmR, _tgt, _poleR, UPPER, FORE));
    }
    first = false;
  }

  const rig: HunterRig = {
    root,
    bones,
    spec: SPEC,
    head: 'head',
    hand,
    hand2,
    setWeapon,
    getWeapon: () => weapon,
    animate,
  };
  (rig as unknown as { debugReach: () => number }).debugReach = () => reach;
  // neutral pose so the rig looks right before the first animate()
  animate({ state: 'stand', stateTime: 0, time: 0, distance: 0, speed: 0, dt: 0, params: {} });
  return rig;
}

/**
 * Muzzle position relative to the hunter root (feet centre) in the standing
 * hold pose, for each weapon. y is always the gun line.
 */
export function holdMuzzleOffset(id: WeaponId, model?: WeaponModel): THREE.Vector3 {
  const m = model ?? createWeaponModel(id);
  const def = HOLD[id];
  return new THREE.Vector3(def.x + m.muzzleRest.x, GUN_Y, def.z + m.muzzleRest.z);
}

/** The hunter's palette and fabric shading, shared with the first-person viewmodel. */
export const HUNTER_COLORS = COL;
export { parkaShade, furShade };
