// The Bosun: a stocky ferry bosun in a bright yellow oilskin coat and
// sou'wester, black rubber boots, a big grey beard and a pipe. Procedural
// animation and per-weapon hold poses, recoil and reload gestures.
//
// This rig faces -X (he always fires left). Root origin at the feet centre.
// The camera sees his left side (+Z), so the trigger hand is the near-side
// (left, 'L') hand and guns ride on the camera side of the body.
//
// Guns are placed by an explicit gun transform (muzzle exactly on the gun line
// y = HUNTER.muzzleHeight, pointing -X) and the arms reach for the grips with
// two-bone IK, so every weapon/state combination keeps the hands on the gun.
import * as THREE from 'three';
import { HUNTER } from '../../config/world';
import { WEAPON_ORDER, type WeaponId } from '../../config/ids';
import { PartBuilder, bone, box, capsule, cyl, ellipsoid, hash3, lathe, mix, roundBox, sphere, torus } from './kit';
import { blob } from './common';
import type { AnimInput, BoneSpec, HunterRig, WeaponModel } from './types';
import { createWeaponModel, kickCurve, muzzleRest, type LFWeaponModel } from './weapons';
import { solveArm } from './zombie/anim';

// ------------------------------------------------------------------ proportions
const GUN_Y = HUNTER.muzzleHeight;
const HIP_Y = 0.82;
const CHEST_Y = 0.11;
const NECK_Y = 0.42;
const SH_Y = 0.34;
const SH_Z = 0.25;
const UPPER = 0.3;
const FORE = 0.29;
const HIP_Z = 0.12;
const THIGH = 0.39;
const SOLE = HIP_Y - THIGH; // shin bone → sole distance
const KICK_TIME = 0.32;
const STRIDE = 1.05;
const HEAD_YAW = 0.85;
const HEAD_UP = -0.12;

const COL = {
  coat: 0xffc21a,
  coatDeep: 0xe08a00,
  coatSeam: 0x9a5a00,
  toggle: 0x3a2414,
  navy: 0x22283a,
  skin: 0xeaa07c,
  skinDark: 0xd2805c,
  nose: 0xe0645a,
  cheek: 0xe88870,
  eye: 0x18120e,
  beard: 0xcfcdc6,
  beardDark: 0x9a9890,
  boot: 0x1a1a1c,
  bootHi: 0x34343a,
  sole: 0x0c0c0c,
  pipe: 0x6a3a1a,
  pipeDark: 0x3a1e0c,
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Oilskin yellow, deeper in the folds/toward the hem, waxy noise. `y0` = bone height in root space. */
const coatShade = (y0: number) => (p: THREE.Vector3, n: THREE.Vector3) => {
  const y = p.y + y0;
  const c = mix(COL.coatDeep, COL.coat, 0.5 + 0.5 * smooth(0.2, 1.1, y));
  c.multiplyScalar(0.86 + 0.2 * Math.max(0, n.y) + 0.06 * Math.max(0, -n.x));
  c.offsetHSL(0, 0, (hash3(p.x * 40, p.y * 40, p.z * 40) - 0.5) * 0.04);
  return c;
};
const beardShade = (p: THREE.Vector3) => mix(COL.beard, COL.beardDark, hash3(p.x * 80, p.y * 80, p.z * 80) * 0.6);
function weld<T extends THREE.BufferGeometry>(g: T): T {
  const a = g.attributes.position.array as Float32Array;
  for (let i = 0; i < a.length; i++) a[i] = Math.round(a[i] * 1e5) / 1e5;
  g.attributes.position.needsUpdate = true;
  return g;
}

// ------------------------------------------------------------------ hold tables
interface HoldDef {
  /** Grip position (root space x, z); y follows from the gun line. */
  x: number;
  z: number;
  /** Chest yaw toward the camera. */
  yaw: number;
}
const HOLD: Record<WeaponId, HoldDef> = {
  revolver: { x: -0.33, z: 0.09, yaw: 0.18 },
  nailgun: { x: -0.3, z: 0.12, yaw: 0.3 },
  shotgun: { x: -0.11, z: 0.29, yaw: 0.85 },
  flare: { x: -0.33, z: 0.09, yaw: 0.18 },
  harpoon: { x: -0.1, z: 0.29, yaw: 0.85 },
  outboard: { x: -0.02, z: 0.3, yaw: 0.6 },
};

interface RecoilDef {
  x: number;
  rz: number;
  up: number;
  down: number;
  body: number;
}
const RECOIL: Record<WeaponId, RecoilDef> = {
  revolver: { x: 0.05, rz: 0.55, up: 0.02, down: 0.18, body: 0.04 },
  nailgun: { x: 0.022, rz: 0.08, up: 0.01, down: 0.05, body: 0.012 },
  shotgun: { x: 0.085, rz: 0.24, up: 0.02, down: 0.25, body: 0.11 },
  flare: { x: 0.045, rz: 0.42, up: 0.02, down: 0.22, body: 0.04 },
  harpoon: { x: 0.1, rz: 0.2, up: 0.02, down: 0.35, body: 0.13 },
  outboard: { x: 0.014, rz: 0.02, up: 0.01, down: 0.03, body: 0.012 },
};

/** Gun offset at the height of a reload: root-space translation + gun-local rotation (XYZ). */
const RELOAD_POSE: Record<WeaponId, { d: [number, number, number]; r: [number, number, number] }> = {
  revolver: { d: [0.1, 0.07, 0.0], r: [-0.35, 0.4, -0.95] },
  nailgun: { d: [0.07, 0.02, 0.02], r: [-0.45, 0.3, -0.15] },
  shotgun: { d: [0.05, -0.02, 0.03], r: [-0.75, 0.15, -0.06] },
  flare: { d: [0.1, 0.06, 0.0], r: [-0.25, 0.4, -0.25] },
  harpoon: { d: [0.0, 0.05, -0.12], r: [-0.3, 0.2, 0.08] },
  outboard: { d: [0.0, -0.04, 0.0], r: [0, 0.05, 0.08] },
};

/** Support-hand keyframes during a reload. 'S' = support grip, 'P' = outboard pull handle; w = weapon-local; r = root-local. */
type KeyPos = 'S' | 'P' | ['w' | 'r', number, number, number];
type Key = [number, KeyPos];
const POUCH: KeyPos = ['r', -0.14, 0.78, 0.33];
const QUIVER: KeyPos = ['r', 0.16, 1.42, -0.12];
const RELOAD_KEYS: Partial<Record<WeaponId, Key[]>> = {
  revolver: [[0, 'S'], [0.1, ['w', -0.04, 0.03, 0.07]], [0.24, ['w', -0.04, 0.03, 0.07]], [0.38, POUCH], [0.5, ['w', 0.0, 0.07, 0.09]], [0.6, ['w', 0.01, 0.06, 0.09]], [0.7, ['w', 0.0, 0.07, 0.09]], [0.82, ['w', -0.06, 0.05, 0.08]], [0.93, 'S'], [1, 'S']],
  nailgun: [[0, 'S'], [0.08, ['w', -0.08, -0.04, 0.05]], [0.24, ['w', 0.1, -0.09, 0.06]], [0.4, POUCH], [0.55, ['w', 0.1, -0.09, 0.06]], [0.82, ['w', -0.08, -0.05, 0.05]], [0.9, ['w', -0.12, 0.13, -0.01]], [1, 'S']],
  flare: [[0, 'S'], [0.08, ['w', -0.15, 0.12, 0.0]], [0.2, ['w', -0.15, 0.03, 0.0]], [0.3, ['w', -0.04, 0.07, 0.05]], [0.42, POUCH], [0.56, ['w', -0.03, 0.07, 0.05]], [0.68, ['w', -0.03, 0.07, 0.05]], [0.76, ['w', -0.17, -0.02, 0.0]], [0.84, ['w', -0.17, 0.07, 0.0]], [0.94, 'S'], [1, 'S']],
  harpoon: [[0, 'S'], [0.15, QUIVER], [0.34, QUIVER], [0.5, ['w', 0.27, 0.165, 0.02]], [0.7, ['w', 0.27, 0.08, 0.02]], [0.85, ['w', 0.03, 0.08, 0.02]], [0.94, 'S'], [1, 'S']],
  outboard: [[0, 'S'], [0.06, ['w', -0.2, -0.2, 0.15]], [0.18, ['w', -0.2, -0.44, 0.15]], [0.3, POUCH], [0.45, ['w', -0.2, -0.38, 0.15]], [0.6, ['w', -0.2, -0.22, 0.15]], [0.68, 'S'], [0.74, 'P'], [0.95, 'P'], [1, 'S']],
};
/** Shotgun: shells loaded one at a time — pouch ↔ loading port, `n` times over one reload. */
function shotgunKeys(n: number): Key[] {
  const k: Key[] = [[0, 'S']];
  const port: KeyPos = ['w', -0.13, -0.03, 0.024];
  const span = 1 / n;
  for (let i = 0; i < n; i++) {
    const t0 = i * span;
    k.push([t0 + span * 0.1, 'S'], [t0 + span * 0.35, POUCH], [t0 + span * 0.65, port], [t0 + span * 0.8, port]);
  }
  k.push([1, 'S']);
  return k;
}

// ------------------------------------------------------------------ body pose
interface Pose {
  px: number;
  py: number;
  /** pelvis roll and pitch (+ = lean forward toward -X) */
  prx: number;
  prz: number;
  cy: number;
  crz: number;
  /** thigh / shin swing (L = near, R = far); thigh − = forward, shin + = knee bend */
  tl: number;
  tr: number;
  sl: number;
  sr: number;
  spread: number;
}
const newPose = (): Pose => ({ px: 0, py: HIP_Y, prx: 0, prz: 0, cy: 0, crz: 0, tl: 0, tr: 0, sl: 0.04, sr: 0.04, spread: 0.06 });
function lerpPose(a: Pose, b: Pose, t: number, out: Pose): Pose {
  for (const k of Object.keys(out) as Array<keyof Pose>) out[k] = lerp(a[k], b[k], t);
  return out;
}
const NEUTRAL: Readonly<Pose> = newPose();
const KNEEL: Pose = { px: 0.02, py: 0.5, prx: 0, prz: 0.32, cy: 0, crz: 0.1, tl: -1.3, tr: -0.2, sl: 1.7, sr: 1.5, spread: 0.1 };
const FALLEN: Pose = { px: 0.42, py: 0.17, prx: 0.1, prz: -1.48, cy: 0.1, crz: -0.15, tl: -1.1, tr: -0.6, sl: 0.6, sr: 0.25, spread: 0.22 };

// ------------------------------------------------------------------ model
function buildBody(bones: Record<string, THREE.Object3D>) {
  const { pelvis, chest, head, upperArmL, upperArmR, lowerArmL, lowerArmR, thighL, thighR, shinL, shinR } = bones;

  // long oilskin skirt — pelvis space (rotated so the front opening faces -X)
  const P = new PartBuilder();
  const skirt = lathe([[0.0, -0.47], [0.33, -0.47], [0.335, -0.44], [0.31, -0.25], [0.295, -0.08], [0.285, 0.06], [0.27, 0.16], [0.22, 0.22], [0.0, 0.23]], 28);
  skirt.rotateY(-Math.PI / 2);
  skirt.scale(0.9, 1, 1);
  weld(skirt);
  P.addShaded(skirt, coatShade(HIP_Y), 'cloth');
  // hem band + front opening seam + toggles
  const hem = torus(0.326, 0.018, 6, 32);
  hem.rotateX(Math.PI / 2);
  hem.scale(0.9, 1, 1);
  P.add(hem, COL.coatSeam, 'cloth', { p: [0, -0.455, 0] });
  P.add(box(0.012, 0.66, 0.02), COL.coatSeam, 'cloth', { p: [-0.29, -0.14, 0] });
  for (const y of [-0.05, -0.25]) P.add(capsule(0.012, 0.06, 2, 6), COL.toggle, 'wood', { p: [-0.292, y, 0.0], r: [Math.PI / 2, 0, 0] });
  // pocket flaps on both sides
  for (const s of [1, -1]) P.add(roundBox(0.16, 0.05, 0.03, 0.01), COL.coatDeep, 'cloth', { p: [-0.1, -0.02, s * 0.27], r: [0, s * -0.35, 0] });
  P.buildInto(pelvis);

  // upper coat — chest space: a barrel chest with a big belly
  const Ch = new PartBuilder();
  const torso = lathe([[0.0, -0.14], [0.3, -0.14], [0.31, -0.02], [0.305, 0.1], [0.29, 0.2], [0.26, 0.28], [0.2, 0.345], [0.12, 0.385], [0.0, 0.395]], 28);
  torso.rotateY(-Math.PI / 2);
  torso.scale(0.88, 1, 1);
  weld(torso);
  Ch.addShaded(torso, coatShade(HIP_Y + CHEST_Y), 'cloth');
  // turned-up collar + navy roll-neck jumper
  const collar = lathe([[0.15, 0.3], [0.165, 0.36], [0.175, 0.45], [0.16, 0.452], [0.135, 0.36], [0.125, 0.3]], 22, );
  weld(collar);
  Ch.addShaded(collar, coatShade(HIP_Y + CHEST_Y + 0.1), 'cloth');
  Ch.add(cyl(0.11, 0.12, 0.1, 16), COL.navy, 'cloth', { p: [-0.01, 0.4, 0] });
  // front seam + big toggles + chest pocket
  Ch.add(box(0.012, 0.42, 0.02), COL.coatSeam, 'cloth', { p: [-0.272, 0.08, 0], r: [0, 0, -0.08] });
  for (const y of [0.0, 0.12, 0.24]) Ch.add(capsule(0.013, 0.065, 2, 6), COL.toggle, 'wood', { p: [-0.275 + y * 0.12, y, 0], r: [Math.PI / 2, 0, 0] });
  Ch.add(roundBox(0.1, 0.035, 0.03, 0.008), COL.coatDeep, 'cloth', { p: [-0.18, 0.2, 0.2], r: [0, -0.7, 0] });
  Ch.buildInto(chest);

  // head: big ruddy face, bulbous nose, grey beard, sou'wester, pipe
  const H = new PartBuilder();
  const FY = 0.18;
  H.add(ellipsoid(0.15, 0.165, 0.148, 22, 16), COL.skin, 'skin', { p: [0.0, FY, 0] });
  // cheeks + nose
  for (const s of [1, -1]) H.add(ellipsoid(0.03, 0.024, 0.034, 10, 8), COL.cheek, 'skin', { p: [-0.125, FY - 0.03, s * 0.08] });
  H.add(sphere(0.042, 14, 10), COL.nose, 'skin', { p: [-0.165, FY + 0.0, 0] });
  // eyes + brows
  for (const s of [1, -1]) {
    H.add(ellipsoid(0.012, 0.019, 0.019, 10, 8), 0xf4f0e6, 'eye', { p: [-0.138, FY + 0.04, s * 0.052] });
    H.add(sphere(0.0105, 8, 6), COL.eye, 'eye', { p: [-0.148, FY + 0.039, s * 0.054] });
    H.add(sphere(0.004, 6, 4), 0xffffff, 'eye', { p: [-0.158, FY + 0.045, s * 0.05] });
    H.addShaded(ellipsoid(0.022, 0.016, 0.042, 8, 6), beardShade, 'fur', { p: [-0.135, FY + 0.07, s * 0.055], r: [s * 0.25, 0, 0.2] });
  }
  // ears
  for (const s of [1, -1]) H.add(ellipsoid(0.025, 0.04, 0.02, 8, 6), COL.skinDark, 'skin', { p: [0.0, FY + 0.0, s * 0.148] });
  // full beard + sideburns + moustache
  H.addShaded(blob(0.12, 0.13, 0.155, 16, 12, 0.08, 30), beardShade, 'fur', { p: [-0.07, FY - 0.115, 0] });
  for (const s of [1, -1]) H.addShaded(blob(0.06, 0.09, 0.04, 10, 8, 0.08, 30), beardShade, 'fur', { p: [-0.03, FY - 0.03, s * 0.125] });
  for (const s of [1, -1]) H.addShaded(blob(0.035, 0.024, 0.06, 8, 6, 0.06, 30), beardShade, 'fur', { p: [-0.155, FY - 0.05, s * 0.04], r: [s * 0.3, 0, 0.2] });
  H.add(ellipsoid(0.01, 0.012, 0.03, 6, 5), 0x6a2a22, 'skin', { p: [-0.16, FY - 0.085, 0] });
  // pipe: stem from the near mouth corner, bowl up, glowing ember
  H.add(cyl(0.008, 0.008, 0.12, 8), COL.pipeDark, 'wood', { p: [-0.21, FY - 0.09, 0.055], r: [0, 0.35, Math.PI / 2 + 0.25] });
  H.add(cyl(0.026, 0.02, 0.055, 12), COL.pipe, 'wood', { p: [-0.265, FY - 0.08, 0.075] });
  H.add(cyl(0.02, 0.02, 0.006, 12), 0xff7a1a, 'glow', { p: [-0.265, FY - 0.05, 0.075] });
  // sou'wester: rounded crown, drooping brim longer at the back, chin strap
  const crown = (p: THREE.Vector3, n: THREE.Vector3) => mix(COL.coatDeep, COL.coat, 0.55 + 0.45 * Math.max(0, n.y)).multiplyScalar(0.95 + 0.1 * hash3(p.x * 50, p.y * 50, p.z * 50));
  H.addShaded(ellipsoid(0.164, 0.135, 0.16, 20, 12), crown, 'cloth', { p: [0.015, FY + 0.115, 0] });
  const brim = lathe([[0.0, 0.0], [0.17, 0.0], [0.26, -0.035], [0.3, -0.06], [0.295, -0.07], [0.255, -0.045], [0.165, -0.012], [0.0, -0.012]], 28);
  weld(brim);
  const bp = brim.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < bp.count; i++) {
    v.fromBufferAttribute(bp, i);
    // longer + lower at the back (+X), short at the front
    const back = Math.max(0, v.x) / 0.3;
    const front = Math.max(0, -v.x) / 0.3;
    bp.setXYZ(i, v.x * (1 + 0.45 * back - 0.25 * front), v.y - 0.06 * back * back, v.z);
  }
  brim.computeVertexNormals();
  H.addShaded(brim, crown, 'cloth', { p: [0.015, FY + 0.105, 0] });
  H.add(torus(0.12, 0.006, 4, 18, Math.PI), 0x3a2414, 'cloth', { p: [-0.02, FY - 0.02, 0], r: [0, Math.PI / 2, Math.PI] });
  H.buildInto(head);

  // arms: thick oilskin sleeves, cuffs, big bare hands
  for (const [up, lo] of [[upperArmL, lowerArmL], [upperArmR, lowerArmR]]) {
    const U = new PartBuilder();
    U.addShaded(capsule(0.088, UPPER + 0.1, 6, 14), coatShade(1.0), 'cloth', { p: [0, -UPPER / 2 + 0.01, 0] });
    U.buildInto(up);
    const L = new PartBuilder();
    L.addShaded(capsule(0.08, 0.22, 6, 14), coatShade(0.85), 'cloth', { p: [0, -0.09, 0] });
    const cuff = torus(0.074, 0.022, 8, 18);
    cuff.rotateX(Math.PI / 2);
    weld(cuff);
    L.add(cuff, mix(COL.coat, COL.coatDeep, 0.45), 'cloth', { p: [0, -0.19, 0] });
    L.add(ellipsoid(0.056, 0.07, 0.052, 14, 10), COL.skin, 'skin', { p: [0, -FORE + 0.005, 0] });
    L.add(ellipsoid(0.022, 0.036, 0.024, 8, 6), COL.skinDark, 'skin', { p: [-0.045, -FORE + 0.025, 0.0] });
    L.buildInto(lo);
  }

  // legs: navy trousers, tall black rubber boots with a folded top
  for (const [th, sh] of [[thighL, shinL], [thighR, shinR]] as const) {
    const T = new PartBuilder();
    T.add(capsule(0.095, THIGH + 0.12, 6, 12), COL.navy, 'cloth', { p: [0, -THIGH / 2 + 0.01, 0] });
    T.buildInto(th);
    const S = new PartBuilder();
    S.add(cyl(0.085, 0.09, 0.32, 14), COL.boot, 'rubber', { p: [0, -0.2, 0] });
    S.add(cyl(0.1, 0.095, 0.07, 14), COL.bootHi, 'rubber', { p: [0, -0.04, 0] });
    S.add(roundBox(0.27, 0.12, 0.17, 0.05, 3), COL.boot, 'rubber', { p: [-0.05, -SOLE + 0.065, 0] });
    S.add(roundBox(0.285, 0.03, 0.18, 0.01), COL.sole, 'rubber', { p: [-0.05, -SOLE + 0.015, 0] });
    S.buildInto(sh);
  }
}

const SPEC: Record<string, BoneSpec> = (() => {
  const arm = (): [BoneSpec, BoneSpec] => [
    { shape: 'capsule', size: [0.085, 0.07], axis: 'y', offset: [0, -0.13, 0], mass: 3.5, joint: { kind: 'cone', axis: [0, -1, 0], cone: 1.5, twist: 0.8 } },
    { shape: 'capsule', size: [0.075, 0.08], axis: 'y', offset: [0, -0.14, 0], mass: 2.8, joint: { kind: 'hinge', axis: [0, 0, 1] } },
  ];
  const leg = (): [BoneSpec, BoneSpec] => [
    { shape: 'capsule', size: [0.095, 0.11], axis: 'y', offset: [0, -0.18, 0], mass: 9, joint: { kind: 'cone', axis: [0, -1, 0], cone: 1.0, twist: 0.3 } },
    { shape: 'capsule', size: [0.088, 0.13], axis: 'y', offset: [-0.02, -0.24, 0], mass: 6, joint: { kind: 'hinge', axis: [0, 0, 1] } },
  ];
  const [ual, lal] = arm();
  const [uar, lar] = arm();
  const [tl, sl] = leg();
  const [tr, sr] = leg();
  return {
    pelvis: { shape: 'box', size: [0.26, 0.2, 0.29], offset: [0, -0.12, 0], mass: 20 },
    chest: { shape: 'box', size: [0.25, 0.2, 0.28], offset: [0, 0.15, 0], mass: 28, joint: { kind: 'cone', axis: [0, 1, 0], cone: 0.5, twist: 0.4 } },
    head: { shape: 'sphere', size: [0.17], offset: [-0.02, 0.16, 0], mass: 6, joint: { kind: 'cone', axis: [0, 1, 0], cone: 0.6, twist: 0.7 }, gib: true },
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
const _F = new THREE.Matrix4();
const _chestNow = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _eul = new THREE.Euler();
const _tgt = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _poleL = new THREE.Vector3();
const _poleR = new THREE.Vector3();
const POLE_L = new THREE.Vector3(0.4, -1, 0.7);
const POLE_R = new THREE.Vector3(0.4, -1, -0.7);

export interface BosunRig extends HunterRig {
  /** IK reach error of the last frame (m, debug). */
  debugReach(): number;
}

export function createHunterRig(): BosunRig {
  const root = new THREE.Group();
  root.name = 'bosun';
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
  bones.set('hand', hand);
  buildBody({ pelvis, chest, head, upperArmL, upperArmR, lowerArmL, lowerArmR, thighL, thighR, shinL, shinR });

  // chest transform (root space) in the neutral pose, for chest-follow holds
  const chestRestInv = new THREE.Matrix4();
  pelvis.updateMatrix();
  chest.updateMatrix();
  chestRestInv.multiplyMatrices(pelvis.matrix, chest.matrix).invert();

  let weapon: LFWeaponModel | null = null;
  let mRest = new THREE.Vector3();
  const cache = new Map<WeaponId, LFWeaponModel>();
  let follow = 0;
  let first = true;
  let reach = 0;
  const pose = newPose();

  function setWeapon(model: WeaponModel | null): void {
    if (weapon) hand.remove(weapon.group);
    weapon = (model as LFWeaponModel | null) ?? null;
    if (weapon) {
      if (!('extras' in weapon)) (weapon as LFWeaponModel).extras = {};
      cache.set(weapon.id, weapon);
      weapon.group.position.set(0, 0, 0);
      weapon.group.quaternion.identity();
      mRest = muzzleRest(weapon);
      hand.add(weapon.group);
    }
  }

  // ---------------------------------------------------------------- body
  function bodyPose(a: AnimInput, hurt: number, out: Pose): Pose {
    const st = a.stateTime;
    const t = a.time;
    Object.assign(out, NEUTRAL);
    out.py += 0.005 * Math.sin(t * 2.1);
    out.crz += 0.014 * Math.sin(t * 2.1 + 0.6);
    switch (a.state) {
      case 'walk': {
        const w = clamp01(a.speed / 1.2) * smooth(0, 0.12, st + 0.12);
        const ph = (a.distance / STRIDE) * Math.PI * 2;
        const s = Math.sin(ph);
        const c = Math.cos(ph);
        out.tl = -0.5 * s * w;
        out.tr = 0.5 * s * w;
        out.sl = 0.06 + 0.95 * Math.max(0, c) * w;
        out.sr = 0.06 + 0.95 * Math.max(0, -c) * w;
        out.py = HIP_Y + 0.035 * w * (Math.abs(c) - 0.6);
        out.prx = 0.08 * s * w;
        out.crz += 0.04 * w;
        out.cy = -0.05 * s * w;
        break;
      }
      case 'air': {
        // jump: knees tucked, the near boot cocked high for the stomp
        const u = smooth(0, 0.14, st);
        out.tl = -1.05 * u;
        out.sl = 0.04 + 1.5 * u;
        out.tr = -0.35 * u;
        out.sr = 0.04 + 0.9 * u;
        out.prz = -0.1 * u;
        out.crz = -0.06 * u;
        out.spread = 0.1;
        break;
      }
      case 'stomp': {
        // the boot slams down, everything squashes, then recovers
        const slam = smooth(0, 0.07, st);
        const rec = smooth(0.12, 0.38, st);
        out.tl = lerp(-1.05, -0.35, slam) * (1 - rec) + 0 * rec;
        out.sl = lerp(1.54, 0.5, slam) * (1 - rec) + 0.04 * rec;
        out.tr = lerp(-0.35, 0.35, slam) * (1 - rec);
        out.sr = lerp(0.94, 0.8, slam) * (1 - rec) + 0.04 * rec;
        out.py = HIP_Y - 0.13 * slam * (1 - rec);
        out.prz = 0.25 * slam * (1 - rec);
        out.crz = 0.12 * slam * (1 - rec);
        out.spread = 0.14 * (1 - rec) + 0.06 * rec;
        break;
      }
      case 'kick': {
        const u = clamp01(st / KICK_TIME);
        const sw = Math.sin(Math.PI * Math.min(1, u * 1.15));
        out.tl = -1.1 * sw;
        out.sl = u < 0.35 ? lerp(0.05, 1.3, smooth(0, 0.35, u)) : lerp(1.3, 0.05, smooth(0.35, 0.6, u));
        out.tr = 0.12 * sw;
        out.sr = 0.15 * sw;
        out.prz = -0.24 * sw;
        out.crz = 0.08 * sw;
        out.py = HIP_Y - 0.02 * sw;
        break;
      }
      case 'grabbed': {
        // struggling: leaning back, braced, jerking side to side
        const j = Math.sin(t * 13) * 0.5 + Math.sin(t * 7.3) * 0.5;
        out.prz = -0.14 + 0.06 * j;
        out.crz = -0.12 + 0.1 * Math.sin(t * 9.1);
        out.cy = 0.3 * Math.sin(t * 6.7);
        out.tl = -0.35 + 0.1 * j;
        out.sl = 0.5;
        out.tr = 0.3;
        out.sr = 0.35;
        out.py = HIP_Y - 0.06;
        out.px = 0.03 * j;
        out.spread = 0.12;
        break;
      }
      case 'dead': {
        const u = smooth(0, 0.35, st);
        const f = smooth(0.3, 0.85, st);
        if (st < 0.3) lerpPose(NEUTRAL, KNEEL, u, out);
        else lerpPose(KNEEL, FALLEN, f, out);
        break;
      }
      default:
        break;
    }
    if (hurt > 0) {
      out.crz -= 0.22 * hurt;
      out.prz -= 0.05 * hurt;
      out.cy += 0.1 * hurt;
    }
    return out;
  }

  function applyPose(p: Pose, yaw: number, hurt: number, t: number) {
    pelvis.position.set(p.px, p.py, 0);
    pelvis.rotation.set(p.prx, 0, p.prz);
    chest.rotation.set(-p.prx * 0.6, yaw + p.cy, p.crz);
    head.rotation.set(0.25 * hurt * Math.sin(t * 30), HEAD_YAW - yaw - p.cy, HEAD_UP - (p.prz + p.crz) * 0.75);
    thighL.rotation.set(-p.spread, 0, p.tl);
    thighR.rotation.set(p.spread, 0, p.tr);
    shinL.rotation.set(0, 0, p.sl);
    shinR.rotation.set(0, 0, p.sr);
  }

  // ---------------------------------------------------------------- gun
  function resolveKey(k: KeyPos, out: THREE.Vector3): THREE.Vector3 {
    if (k === 'S') {
      if (weapon?.support) weapon.support.getWorldPosition(out);
      else out.set(-0.1, 0.8, -0.2).applyMatrix4(root.matrixWorld);
      return out;
    }
    if (k === 'P') {
      const ph = weapon?.extras.pullHandle;
      if (ph) return ph.getWorldPosition(out);
      return resolveKey('S', out);
    }
    out.set(k[1], k[2], k[3]);
    if (k[0] === 'w' && weapon) out.applyMatrix4(weapon.group.matrixWorld);
    else out.applyMatrix4(root.matrixWorld);
    return out;
  }

  function supportTarget(id: WeaponId, reloadT: number, shells: number, out: THREE.Vector3): THREE.Vector3 {
    const keys = reloadT >= 0 ? (id === 'shotgun' ? shotgunKeys(shells) : RELOAD_KEYS[id]) : undefined;
    if (!keys) {
      resolveKey('S', out);
      const pk = weapon?.extras.pullK ?? 0;
      if (pk > 0) out.lerp(resolveKey('P', _b), pk);
      return out;
    }
    let i = 0;
    while (i < keys.length - 2 && reloadT >= keys[i + 1][0]) i++;
    const [t0, k0] = keys[i];
    const [t1, k1] = keys[i + 1];
    const u = smooth(t0, t1, reloadT);
    resolveKey(k0, _a);
    resolveKey(k1, _b);
    return out.lerpVectors(_a, _b, u);
  }

  function animate(a: AnimInput): void {
    const prm = a.params ?? {};
    const num = (k: string, d: number) => (typeof prm[k] === 'number' && Number.isFinite(prm[k] as number) ? (prm[k] as number) : d);
    const wi = num('weapon', -1);
    const wantId = WEAPON_ORDER[wi];
    if (wantId && (!weapon || weapon.id !== wantId)) setWeapon(cache.get(wantId) ?? createWeaponModel(wantId));
    const fireT = num('fireT', 99);
    const reloadT = num('reloadT', -1);
    const heat = num('heat', 0);
    const spin = num('spin', 0);
    const cock = num('cock', 0);
    const hurt = clamp01(num('hurt', 0));
    const shells = Math.max(1, Math.round(num('shells', 1)));
    const loaded = typeof prm.loaded === 'boolean' ? (prm.loaded as boolean) : reloadT < 0;
    const dt = Math.max(0, Math.min(0.1, a.dt || 0));
    const id = weapon?.id;
    const def = id ? HOLD[id] : null;
    const rc = id ? RECOIL[id] : null;

    // ---- body
    bodyPose(a, hurt, pose);
    const k = rc ? kickCurve(fireT, rc.up, rc.down) : 0;
    const yaw = def ? def.yaw : 0.2;
    if (rc) pose.crz -= rc.body * k;
    applyPose(pose, yaw, hurt, a.time);

    // chest-follow weight: the gun goes with the body when airborne / struggling / dying
    let fw = 0;
    if (a.state === 'air' || a.state === 'stomp') fw = 0.45;
    else if (a.state === 'grabbed') fw = 0.6;
    else if (a.state === 'dead') fw = 1;
    follow = first ? fw : follow + (fw - follow) * Math.min(1, dt * 10);

    root.updateWorldMatrix(true, true);
    _poleL.copy(POLE_L).transformDirection(root.matrixWorld);
    _poleR.copy(POLE_R).transformDirection(root.matrixWorld);

    if (!weapon || !def || !rc || !id) {
      // empty hands: arms swing at the sides
      const sw = a.state === 'walk' ? 0.12 * Math.sin((a.distance / STRIDE) * Math.PI * 2) : 0;
      _tgt.set(-0.04 + sw, 0.66, 0.36).applyMatrix4(root.matrixWorld);
      solveArm(upperArmL, lowerArmL, _tgt, _poleL, UPPER, FORE);
      _tgt.set(-0.04 - sw, 0.66, -0.36).applyMatrix4(root.matrixWorld);
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
    let rz = RP.r[2] * env;
    // outboard: the whole engine tips up as the cord is yanked
    const pull = weapon.extras.pullK ?? 0;
    if (id === 'outboard') rz += 0.08 * pull;
    _pos.set(def.x + rc.x * k + RP.d[0] * env, GUN_Y - mRest.y + RP.d[1] * env, def.z + RP.d[2] * env);
    _q.setFromEuler(_eul.set(RP.r[0] * env, RP.r[1] * env, rz - rc.rz * k, 'XYZ'));
    if (id === 'outboard' && fireT < 0.15) {
      _pos.x += (Math.random() - 0.5) * 0.01;
      _pos.y += (Math.random() - 0.5) * 0.01;
    }
    if (a.state === 'walk') _pos.y += (pose.py - HIP_Y) * 0.35;
    if (a.state === 'grabbed') {
      _pos.y += 0.03 * Math.sin(a.time * 17);
      _pos.x += 0.02 * Math.sin(a.time * 11);
    }
    _G.compose(_pos, _q, _s.set(1, 1, 1));
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
    weapon.animate({ fireT, reloadT, heat, spin, cock, loaded, dt });
    weapon.group.updateMatrixWorld(true);

    // ---- support arm
    if (a.state === 'air' && follow > 0.2 && reloadT < 0) {
      // free hand flung out for balance
      _tgt.set(0.12 + 0.1 * Math.sin(a.stateTime * 9), 1.32, -0.38).applyMatrix4(root.matrixWorld);
    } else if (a.state === 'dead' && a.stateTime > 0.35) {
      _tgt.set(0.4, 0.25, -0.5).applyMatrix4(root.matrixWorld);
    } else {
      supportTarget(id, reloadT, shells, _tgt);
    }
    reach = Math.max(reach, solveArm(upperArmR, lowerArmR, _tgt, _poleR, UPPER, FORE));
    first = false;
  }

  const rig: BosunRig = {
    root,
    bones,
    spec: SPEC,
    head: 'head',
    hand,
    setWeapon,
    getWeapon: () => weapon,
    animate,
    debugReach: () => reach,
  };
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
  const mr = muzzleRest(m);
  return new THREE.Vector3(def.x + mr.x, GUN_Y, def.z + mr.z);
}

export const BOSUN_COLORS = COL;
