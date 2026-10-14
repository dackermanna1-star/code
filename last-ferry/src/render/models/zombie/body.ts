// Humanoid zombie body: proportions per body type, the skeleton, the base
// geometry (lofted torso and limbs, big head with dark sockets and a slack
// jaw, big hands) and the ragdoll spec. Outfits (dress.ts) colour the base
// geometry and add their own pieces.
//
// Bones (root origin at the feet centre, facing +X, +Z = near/camera side):
//   body (scale group, not a bone)
//   pelvis (ragdoll root) > belly
//   pelvis > chest > head > jaw
//                  chest > upperArmL/R > foreArmL/R > handL/R
//   pelvis > thighL/R > shinL/R > footL/R
// 'L' is the +Z (camera-facing) side.
import * as THREE from 'three';
import { PartBuilder, box, cyl, type MatClass } from '../kit';
import { blob, loft, type RigBuilder, type Sec } from '../common';
import type { BoneSpec } from '../types';
import type { ColorFn, SkinPal } from './looks';

export type BodyType = 'normal' | 'slim' | 'fat' | 'bulky' | 'granny';

/** Zombie eye colour (emitted by the 'glow' class while alive). */
export const EYE_GLOW = 0xc4d48c;

export interface Dims {
  hipY: number;
  hipW: number;
  /** Hip joints relative to the pelvis bone (y). */
  hipJ: number;
  thigh: number;
  shin: number;
  /** Ankle height above the sole. */
  ankle: number;
  chestY: number;
  shY: number;
  shW: number;
  neckY: number;
  neckX: number;
  upper: number;
  fore: number;
  torsoW: number;
  torsoD: number;
  waistW: number;
  waistD: number;
  hipsW: number;
  hipsD: number;
  /** Limb thickness multiplier. */
  limb: number;
  /** Head size multiplier. */
  head: number;
  /** Hand size multiplier. */
  hand: number;
  /** 0..1 swollen belly. */
  belly: number;
  /** Upper-back hump (m). */
  hump: number;
}

const BASE: Dims = {
  hipY: 0.87,
  hipW: 0.095,
  hipJ: -0.05,
  thigh: 0.39,
  shin: 0.37,
  ankle: 0.06,
  chestY: 0.1,
  shY: 0.36,
  shW: 0.205,
  neckY: 0.43,
  neckX: 0.025,
  upper: 0.29,
  fore: 0.26,
  torsoW: 0.185,
  torsoD: 0.118,
  waistW: 0.165,
  waistD: 0.108,
  hipsW: 0.17,
  hipsD: 0.112,
  limb: 1,
  head: 1,
  hand: 1.25,
  belly: 0,
  hump: 0.02,
};

export const DIMS: Record<BodyType, Dims> = {
  normal: BASE,
  slim: { ...BASE, hipY: 0.91, thigh: 0.41, shin: 0.39, torsoW: 0.168, torsoD: 0.104, waistW: 0.142, waistD: 0.095, hipsW: 0.15, hipsD: 0.1, shW: 0.19, limb: 0.86, hump: 0.0, upper: 0.3, fore: 0.27 },
  fat: {
    ...BASE,
    hipY: 0.76,
    hipW: 0.15,
    thigh: 0.33,
    shin: 0.32,
    chestY: 0.14,
    shY: 0.36,
    shW: 0.27,
    neckY: 0.43,
    neckX: 0.05,
    upper: 0.27,
    fore: 0.25,
    torsoW: 0.28,
    torsoD: 0.2,
    waistW: 0.31,
    waistD: 0.26,
    hipsW: 0.27,
    hipsD: 0.2,
    limb: 1.5,
    head: 0.74,
    hand: 1.35,
    belly: 1,
    hump: 0.02,
  },
  bulky: {
    ...BASE,
    hipY: 0.93,
    hipW: 0.115,
    thigh: 0.42,
    shin: 0.4,
    chestY: 0.11,
    shY: 0.4,
    shW: 0.26,
    neckY: 0.47,
    neckX: 0.02,
    upper: 0.31,
    fore: 0.28,
    torsoW: 0.25,
    torsoD: 0.16,
    waistW: 0.2,
    waistD: 0.14,
    hipsW: 0.2,
    hipsD: 0.14,
    limb: 1.38,
    head: 1.02,
    hand: 1.35,
    hump: 0.03,
  },
  granny: { ...BASE, hipY: 0.81, thigh: 0.36, shin: 0.34, shY: 0.33, shW: 0.185, neckY: 0.4, neckX: 0.05, upper: 0.27, fore: 0.24, torsoW: 0.175, torsoD: 0.12, waistW: 0.17, waistD: 0.12, hipsW: 0.185, hipsD: 0.125, limb: 0.92, hump: 0.06 },
};

export interface Bones {
  body: THREE.Group;
  pelvis: THREE.Object3D;
  belly: THREE.Object3D;
  chest: THREE.Object3D;
  head: THREE.Object3D;
  jaw: THREE.Object3D;
  upperArmL: THREE.Object3D;
  upperArmR: THREE.Object3D;
  foreArmL: THREE.Object3D;
  foreArmR: THREE.Object3D;
  handL: THREE.Object3D;
  handR: THREE.Object3D;
  thighL: THREE.Object3D;
  thighR: THREE.Object3D;
  shinL: THREE.Object3D;
  shinR: THREE.Object3D;
  footL: THREE.Object3D;
  footR: THREE.Object3D;
}

/** Head-local anchor points (before the head scale). */
export const HEAD = {
  skull: [0.0, 0.19, 0] as const,
  skullR: [0.152, 0.165, 0.138] as const,
  jaw: [0.07, 0.105, 0] as const,
  top: 0.355,
};

export function makeSkeleton(rb: RigBuilder, d: Dims, scale = 1): Bones {
  const body = new THREE.Group();
  body.name = 'body';
  body.scale.setScalar(scale);
  rb.root.add(body);
  const hs = d.head;
  const pelvis = rb.bone('pelvis', body, [0, d.hipY, 0]);
  pelvis.rotation.order = 'ZYX';
  const belly = rb.bone('belly', pelvis, [0.06 * d.belly, 0.06, 0]);
  const chest = rb.bone('chest', pelvis, [0, d.chestY, 0]);
  chest.rotation.order = 'ZYX';
  const head = rb.bone('head', chest, [d.neckX, d.neckY, 0]);
  head.rotation.order = 'YZX';
  const jaw = rb.bone('jaw', head, [HEAD.jaw[0] * hs, HEAD.jaw[1] * hs, 0]);
  const arm = (side: 'L' | 'R', s: number) => {
    const ua = rb.bone(`upperArm${side}`, chest, [0, d.shY, s * d.shW]);
    const fa = rb.bone(`foreArm${side}`, ua, [0, -d.upper, 0]);
    const ha = rb.bone(`hand${side}`, fa, [0, -d.fore, 0]);
    return [ua, fa, ha] as const;
  };
  const leg = (side: 'L' | 'R', s: number) => {
    const th = rb.bone(`thigh${side}`, pelvis, [0, d.hipJ, s * d.hipW]);
    const sh = rb.bone(`shin${side}`, th, [0, -d.thigh, 0]);
    const ft = rb.bone(`foot${side}`, sh, [0, -d.shin, 0]);
    return [th, sh, ft] as const;
  };
  const [upperArmL, foreArmL, handL] = arm('L', 1);
  const [upperArmR, foreArmR, handR] = arm('R', -1);
  const [thighL, shinL, footL] = leg('L', 1);
  const [thighR, shinR, footR] = leg('R', -1);
  return { body, pelvis, belly, chest, head, jaw, upperArmL, upperArmR, foreArmL, foreArmR, handL, handR, thighL, thighR, shinL, shinR, footL, footR };
}

// ---------------------------------------------------------------- dress contract
export type FootStyle = 'shoe' | 'boot' | 'sandal' | 'bare' | 'sneaker' | 'clog' | 'granny' | 'wader';
export type BoneName = keyof Omit<Bones, 'body'>;

/** How an outfit colours the base body and what it adds. */
export interface Dress {
  torso: ColorFn;
  torsoMat?: MatClass;
  hips: ColorFn;
  hipsMat?: MatClass;
  upperArm: ColorFn;
  foreArm: ColorFn;
  armMat?: MatClass;
  thigh: ColorFn;
  shin: ColorFn;
  legMat?: MatClass;
  hand: ColorFn;
  handMat?: MatClass;
  /** Belly colour (fat bodies). */
  belly?: ColorFn;
  foot: FootStyle;
  footCol?: THREE.ColorRepresentation;
  footCol2?: THREE.ColorRepresentation;
  /** Head skin override (e.g. stubble) */
  face?: ColorFn;
  /** Extra geometry per bone. */
  extra?: Partial<Record<BoneName, (pb: PartBuilder) => void>>;
  /** Hide the ears (hats/hoods). */
  noEars?: boolean;
  /** Hide the nose tip (bandaged / missing). */
  noseMissing?: boolean;
}

// ---------------------------------------------------------------- base geometry
const ss = (s: Sec[], k: number): Sec[] => s.map((x) => ({ ...x, w: x.w * k, h: x.h * k, hb: (x.hb ?? x.h) * k }));

export function torsoSections(d: Dims): Sec[] {
  const hump = d.hump;
  const b = d.belly;
  return [
    { x: 0, y: -0.125, w: d.waistW * 1.02, h: d.waistD, hb: d.waistD * (1 + 0.15 * b) },
    { x: 0, y: 0.02, w: (d.waistW + d.torsoW) * 0.5, h: (d.waistD + d.torsoD) * 0.5, hb: d.torsoD * (1 + 0.25 * b) },
    { x: 0.005, y: 0.17, w: d.torsoW, h: d.torsoD + hump * 0.4, hb: d.torsoD * (1.05 + 0.1 * b) },
    { x: 0.005, y: d.shY - 0.03, w: d.torsoW * 1.03, h: d.torsoD * 0.92 + hump, hb: d.torsoD * 0.86 },
    { x: 0.008, y: d.shY + 0.05, w: d.torsoW * 0.74, h: d.torsoD * 0.72 + hump * 0.7, hb: d.torsoD * 0.6 },
    { x: d.neckX * 0.7, y: d.neckY - 0.01, w: 0.06 * Math.max(1, d.limb * 0.8), h: 0.055, hb: 0.055 },
  ];
}

export function hipSections(d: Dims): Sec[] {
  return [
    { x: 0, y: -0.15, w: d.hipsW * 0.9, h: d.hipsD * 0.95, hb: d.hipsD * 0.82 },
    { x: 0, y: -0.07, w: d.hipsW, h: d.hipsD * 1.06, hb: d.hipsD * 0.95 },
    { x: 0, y: 0.03, w: d.hipsW * 0.98, h: d.hipsD, hb: d.hipsD },
    { x: 0, y: 0.11, w: d.waistW * 0.98, h: d.waistD * 0.98, hb: d.waistD * 0.98 },
  ];
}

export function upperArmSections(d: Dims): Sec[] {
  const k = d.limb;
  return ss(
    [
      { x: 0, y: 0.035, w: 0.062, h: 0.06 },
      { x: 0, y: -d.upper * 0.45, w: 0.056, h: 0.058 },
      { x: 0, y: -d.upper - 0.01, w: 0.048, h: 0.05 },
    ],
    k,
  );
}
export function foreArmSections(d: Dims): Sec[] {
  const k = d.limb;
  return ss(
    [
      { x: 0, y: 0.01, w: 0.05, h: 0.052 },
      { x: 0, y: -d.fore * 0.35, w: 0.05, h: 0.05 },
      { x: 0, y: -d.fore + 0.005, w: 0.037, h: 0.034 },
    ],
    k,
  );
}
export function thighSections(d: Dims): Sec[] {
  const k = d.limb;
  return ss(
    [
      { x: 0, y: 0.06, w: 0.088, h: 0.09, hb: 0.088 },
      { x: 0, y: -d.thigh * 0.45, w: 0.08, h: 0.08, hb: 0.08 },
      { x: 0, y: -d.thigh, w: 0.06, h: 0.064, hb: 0.058 },
    ],
    k,
  );
}
export function shinSections(d: Dims): Sec[] {
  const k = d.limb;
  return ss(
    [
      { x: 0, y: 0.0, w: 0.06, h: 0.062, hb: 0.06 },
      { x: 0, y: -d.shin * 0.35, w: 0.058, h: 0.052, hb: 0.07 },
      { x: 0, y: -d.shin + 0.01, w: 0.044, h: 0.042, hb: 0.044 },
    ],
    k,
  );
}

/** Build the base body into the bones. */
export function buildBody(rb: RigBuilder, B: Bones, d: Dims, sp: SkinPal, dress: Dress): void {
  const hs = d.head;
  const ex = (name: BoneName, pb: PartBuilder) => dress.extra?.[name]?.(pb);
  const skin = dress.face;

  // ---- pelvis
  rb.part(B.pelvis, (pb) => {
    pb.addShaded(loft(hipSections(d), { radial: 16, sub: 3, cap0: 0.04 }), dress.hips, dress.hipsMat ?? 'cloth', {}, 'quad');
    ex('pelvis', pb);
  });
  // ---- belly (fat bodies)
  rb.part(B.belly, (pb) => {
    if (d.belly > 0 && dress.belly) {
      const r = d.waistD;
      pb.addShaded(blob(r * 1.32, r * 1.18, d.waistW * 1.12, 24, 18), dress.belly, 'skin', { p: [0.05, -0.02, 0] });
      // belly button
      pb.add(blob(0.018, 0.024, 0.018, 6, 5), sp.socket, 'skin', { p: [0.05 + r * 1.3, -0.04, 0] });
    }
    ex('belly', pb);
  });
  // ---- chest
  rb.part(B.chest, (pb) => {
    pb.addShaded(loft(torsoSections(d), { radial: 16, sub: 3, cap1: 0.02 }), dress.torso, dress.torsoMat ?? 'cloth', {}, 'quad');
    // shoulder caps
    for (const s of [1, -1]) {
      pb.addShaded(blob(0.075 * d.limb, 0.07 * d.limb, 0.075 * d.limb, 10, 8), dress.torso, dress.torsoMat ?? 'cloth', { p: [0, d.shY + 0.005, s * (d.shW - 0.02)] }, true);
    }
    ex('chest', pb);
  });
  // ---- head
  rb.part(B.head, (pb) => {
    const sk = skin ?? ((p: THREE.Vector3, n: THREE.Vector3) => skinColor(sp, p, n));
    const S = (x: number, y: number, z: number): [number, number, number] => [x * hs, y * hs, z * hs];
    // neck
    pb.addShaded(cyl(0.056 * hs * Math.max(1, d.limb * 0.85), 0.062 * hs * Math.max(1, d.limb * 0.85), 0.14 * hs, 10), sk, 'skin', { p: S(0.005, 0.05, 0) });
    // cranium + face mass
    pb.addShaded(blob(HEAD.skullR[0] * hs, HEAD.skullR[1] * hs, HEAD.skullR[2] * hs, 16, 12), sk, 'skin', { p: S(...HEAD.skull) });
    pb.addShaded(blob(0.112 * hs, 0.11 * hs, 0.118 * hs, 12, 8), sk, 'skin', { p: S(0.06, 0.135, 0) });
    // cheekbones (gaunt)
    for (const s of [1, -1]) pb.addShaded(blob(0.05 * hs, 0.035 * hs, 0.04 * hs, 6, 5), sk, 'skin', { p: S(0.115, 0.15, s * 0.07) });
    // brow ridge
    pb.add(blob(0.045 * hs, 0.028 * hs, 0.118 * hs, 8, 5), sp.dark.clone().lerp(sp.base, 0.45), 'skin', { p: S(0.12, 0.222, 0) });
    // nose
    if (!dress.noseMissing) {
      pb.addShaded(blob(0.03 * hs, 0.04 * hs, 0.026 * hs, 8, 6), sk, 'skin', { p: S(0.165, 0.165, 0), r: [0, 0, -0.35] });
    } else {
      pb.add(blob(0.022 * hs, 0.022 * hs, 0.02 * hs, 6, 5), sp.socket, 'skin', { p: S(0.155, 0.16, 0) });
    }
    // dark eye sockets with milky eyes
    for (const s of [1, -1]) {
      pb.add(blob(0.036 * hs, 0.031 * hs, 0.037 * hs, 8, 6), sp.socket, 'skin', { p: S(0.122, 0.186, s * 0.054) });
      // milky eyes that glow faintly (they read in the dark; setEyeGlow(false) puts them out)
      pb.add(blob(0.018 * hs, 0.017 * hs, 0.018 * hs, 6, 5), EYE_GLOW, 'glow', { p: S(0.146, 0.188, s * 0.056) });
    }
    // ears
    if (!dress.noEars) for (const s of [1, -1]) pb.addShaded(blob(0.022 * hs, 0.042 * hs, 0.028 * hs, 6, 5), sk, 'skin', { p: S(0.0, 0.17, s * 0.134) });
    // mouth cavity + upper teeth
    pb.add(blob(0.05 * hs, 0.03 * hs, 0.06 * hs, 10, 6), 0x2a0808, 'skin', { p: S(0.105, 0.098, 0) });
    for (let i = 0; i < 6; i++) {
      const z = (i - 2.5) * 0.017;
      const miss = (i * 7 + Math.round(sp.base.r * 100)) % 5 === 0;
      if (miss) continue;
      pb.add(box(0.014 * hs, 0.022 * hs, 0.013 * hs), i % 2 ? 0xd8cfa0 : 0xc8bc88, 'skin', { p: S(0.148 - Math.abs(z) * 0.5, 0.093, z) });
    }
    ex('head', pb);
  });
  // ---- jaw
  rb.part(B.jaw, (pb) => {
    const sk = skin ?? ((p: THREE.Vector3, n: THREE.Vector3) => skinColor(sp, p, n));
    const S = (x: number, y: number, z: number): [number, number, number] => [x * hs, y * hs, z * hs];
    pb.addShaded(blob(0.078 * hs, 0.042 * hs, 0.09 * hs, 10, 7), sk, 'skin', { p: S(0.035, -0.035, 0) });
    pb.addShaded(blob(0.035 * hs, 0.03 * hs, 0.04 * hs, 8, 6), sk, 'skin', { p: S(0.095, -0.045, 0) });
    pb.add(blob(0.045 * hs, 0.02 * hs, 0.055 * hs, 8, 5), 0x3a0a0a, 'skin', { p: S(0.045, -0.006, 0) });
    for (let i = 0; i < 5; i++) {
      const z = (i - 2) * 0.017;
      pb.add(box(0.013 * hs, 0.018 * hs, 0.013 * hs), i % 2 ? 0xd4ca98 : 0xbdb17c, 'skin', { p: S(0.088 - Math.abs(z) * 0.5, 0.004, z) });
    }
    ex('jaw', pb);
  });
  // ---- arms
  for (const side of ['L', 'R'] as const) {
    rb.part(B[`upperArm${side}`], (pb) => {
      pb.addShaded(loft(upperArmSections(d), { radial: 10, sub: 4, cap0: 0.05 * d.limb, cap1: 0.03 }), dress.upperArm, dress.armMat ?? 'cloth', {}, 'quad');
      ex(`upperArm${side}`, pb);
    });
    rb.part(B[`foreArm${side}`], (pb) => {
      pb.addShaded(blob(0.05 * d.limb, 0.05 * d.limb, 0.05 * d.limb, 8, 6), dress.foreArm, dress.armMat ?? 'cloth', {}, true);
      pb.addShaded(loft(foreArmSections(d), { radial: 10, sub: 3 }), dress.foreArm, dress.armMat ?? 'cloth', {}, 'quad');
      ex(`foreArm${side}`, pb);
    });
    rb.part(B[`hand${side}`], (pb) => {
      hand(pb, d.hand * Math.max(1, d.limb * 0.8), dress.hand, dress.handMat ?? 'skin', side === 'L' ? 1 : -1);
      ex(`hand${side}`, pb);
    });
  }
  // ---- legs
  for (const side of ['L', 'R'] as const) {
    rb.part(B[`thigh${side}`], (pb) => {
      pb.addShaded(loft(thighSections(d), { radial: 10, sub: 4, cap0: 0.05 }), dress.thigh, dress.legMat ?? 'cloth', {}, 'quad');
      ex(`thigh${side}`, pb);
    });
    rb.part(B[`shin${side}`], (pb) => {
      pb.addShaded(blob(0.062 * d.limb, 0.062 * d.limb, 0.062 * d.limb, 8, 6), dress.shin, dress.legMat ?? 'cloth', {}, true);
      pb.addShaded(loft(shinSections(d), { radial: 10, sub: 3 }), dress.shin, dress.legMat ?? 'cloth', {}, 'quad');
      ex(`shin${side}`, pb);
    });
    rb.part(B[`foot${side}`], (pb) => {
      foot(pb, d, sp, dress);
      ex(`foot${side}`, pb);
    });
  }
}

function skinColor(sp: SkinPal, p: THREE.Vector3, n: THREE.Vector3): THREE.Color {
  const t = Math.max(0, -n.y) * 0.35;
  const c = sp.base.clone().lerp(sp.dark, t);
  const m = Math.sin(p.x * 31 + Math.sin(p.z * 23) * 2) * Math.sin(p.y * 27 + p.z * 11);
  if (m > 0.55) c.lerp(sp.bruise, (m - 0.55) * 0.9);
  return c;
}

/** A big clawed hand hanging along -Y, palm facing the body (±Z). */
export function hand(pb: PartBuilder, k: number, col: ColorFn, mat: MatClass, side: number): void {
  pb.addShaded(blob(0.05 * k, 0.058 * k, 0.026 * k, 8, 6), col, mat, { p: [0.0, -0.05 * k, 0] });
  // four fingers, curled forward like claws
  for (let i = 0; i < 4; i++) {
    const x = (-0.032 + i * 0.022) * k;
    const len = (0.07 - Math.abs(i - 1.3) * 0.008) * k;
    const g = new THREE.CapsuleGeometry(0.0125 * k, len, 2, 5);
    g.translate(0, -len / 2, 0);
    pb.addShaded(g, col, mat, { p: [x, -0.095 * k, 0], r: [0, 0, 0.25 + i * 0.05] });
  }
  // thumb on the front side, angled toward the palm
  const t = new THREE.CapsuleGeometry(0.014 * k, 0.045 * k, 2, 5);
  t.translate(0, -0.025 * k, 0);
  pb.addShaded(t, col, mat, { p: [0.045 * k, -0.035 * k, side * 0.012 * k], r: [side * 0.3, 0, 0.7] });
}

function foot(pb: PartBuilder, d: Dims, sp: SkinPal, dress: Dress): void {
  const k = Math.max(1, d.limb * 0.85);
  const a = d.ankle;
  const col = new THREE.Color(dress.footCol ?? 0x22201e);
  const col2 = new THREE.Color(dress.footCol2 ?? 0x111010);
  const skinC = sp.base;
  const sole = (w: number, len: number, h: number, c: THREE.ColorRepresentation, x = 0.045) =>
    pb.add(box(len * k, h, w * k), c, 'rubber', { p: [x * k, -a + h / 2, 0] });
  switch (dress.foot) {
    case 'bare':
    case 'sandal': {
      pb.add(blob(0.045 * k, a * 0.6, 0.045 * k, 8, 6), skinC, 'skin', { p: [0, -a * 0.45, 0] });
      pb.add(blob(0.1 * k, 0.032, 0.05 * k, 10, 6), skinC, 'skin', { p: [0.055 * k, -a + 0.03, 0] });
      for (let i = 0; i < 4; i++) pb.add(blob(0.014, 0.014, 0.012, 5, 4), skinC.clone().multiplyScalar(0.9), 'skin', { p: [0.15 * k, -a + 0.016, (i - 1.5) * 0.022 * k] });
      if (dress.foot === 'sandal') {
        sole(0.1, 0.25, 0.022, 0x5a3a20);
        pb.add(box(0.03 * k, 0.012, 0.105 * k), 0x6a4426, 'rubber', { p: [0.09 * k, -a + 0.045, 0] });
        pb.add(box(0.03 * k, 0.012, 0.105 * k), 0x6a4426, 'rubber', { p: [0.0, -a + 0.05, 0] });
        // white socks pulled up (tourist)
        if (dress.footCol2 !== undefined) pb.add(cyl(0.05 * k, 0.05 * k, a * 1.3, 10), dress.footCol2, 'cloth', { p: [0, -a * 0.35, 0] });
      } else sole(0.095, 0.22, 0.008, skinC.clone().multiplyScalar(0.75));
      break;
    }
    case 'sneaker': {
      pb.add(blob(0.05 * k, a * 0.62, 0.05 * k, 8, 6), col, 'cloth', { p: [0, -a * 0.4, 0] });
      pb.add(blob(0.115 * k, 0.042, 0.055 * k, 12, 8), col, 'cloth', { p: [0.05 * k, -a + 0.035, 0] });
      pb.add(box(0.07 * k, 0.012, 0.112 * k), col2, 'cloth', { p: [0.05 * k, -a + 0.05, 0], r: [0, 0, -0.1] });
      sole(0.112, 0.26, 0.028, 0xf2f2ee);
      break;
    }
    case 'boot':
    case 'wader': {
      pb.add(cyl(0.058 * k, 0.062 * k, a * 1.6, 10), col, 'rubber', { p: [0, -a * 0.25, 0] });
      pb.add(blob(0.12 * k, 0.05, 0.062 * k, 12, 8), col, 'rubber', { p: [0.045 * k, -a + 0.035, 0] });
      sole(0.122, 0.27, 0.026, col2);
      break;
    }
    case 'clog': {
      pb.add(blob(0.125 * k, 0.06, 0.068 * k, 12, 8), col, 'rubber', { p: [0.05 * k, -a + 0.045, 0] });
      sole(0.13, 0.28, 0.035, col2);
      break;
    }
    case 'granny': {
      pb.add(blob(0.046 * k, a * 0.55, 0.045 * k, 8, 6), 0xc8a088, 'cloth', { p: [0, -a * 0.4, 0] });
      pb.add(blob(0.1 * k, 0.04, 0.05 * k, 10, 7), col, 'rubber', { p: [0.045 * k, -a + 0.032, 0] });
      sole(0.1, 0.22, 0.022, col2);
      pb.add(box(0.035 * k, 0.03, 0.08 * k), col2, 'rubber', { p: [-0.045 * k, -a + 0.015, 0] });
      break;
    }
    case 'shoe':
    default: {
      pb.add(blob(0.05 * k, a * 0.58, 0.048 * k, 8, 6), col, 'rubber', { p: [0, -a * 0.4, 0] });
      pb.add(blob(0.11 * k, 0.04, 0.052 * k, 12, 8), col, 'rubber', { p: [0.05 * k, -a + 0.032, 0] });
      sole(0.104, 0.24, 0.018, col2);
      break;
    }
  }
}

// ---------------------------------------------------------------- ragdoll
export function humanSpec(d: Dims, massK = 1, opts: { headR?: number } = {}): Record<string, BoneSpec> {
  const k = d.limb;
  const fat = d.belly;
  const spec: Record<string, BoneSpec> = {
    pelvis: {
      shape: 'box',
      size: [Math.max(d.hipsD, d.waistD * (1 + 0.5 * fat)) * 0.95, 0.12 + 0.06 * fat, d.hipsW * 0.92],
      offset: [0.04 * fat, -0.02 + 0.03 * fat, 0],
      mass: 16 * massK * (1 + fat),
    },
    chest: {
      shape: 'box',
      size: [d.torsoD * 0.95, d.shY * 0.5, d.torsoW * 0.92],
      offset: [0.01, d.shY * 0.48, 0],
      mass: 24 * massK * (1 + 0.6 * fat),
      joint: { kind: 'cone', axis: [0, 1, 0], cone: 0.45, twist: 0.35 },
    },
    head: {
      shape: 'sphere',
      size: [opts.headR ?? 0.14 * d.head],
      offset: [0.035 * d.head, 0.17 * d.head, 0],
      mass: 5 * massK,
      joint: { kind: 'cone', axis: [0, 1, 0], cone: 0.65, twist: 0.6 },
      gib: true,
    },
  };
  for (const side of ['L', 'R']) {
    spec[`upperArm${side}`] = {
      shape: 'capsule',
      size: [0.055 * k, d.upper * 0.38],
      axis: 'y',
      offset: [0, -d.upper / 2, 0],
      mass: 2.5 * massK * k,
      joint: { kind: 'cone', axis: [0, -1, 0], cone: 1.25, twist: 0.6 },
      gib: true,
    };
    spec[`foreArm${side}`] = {
      shape: 'capsule',
      size: [0.048 * k, d.fore * 0.45],
      axis: 'y',
      offset: [0, -d.fore / 2 - 0.03, 0],
      mass: 1.6 * massK * k,
      joint: { kind: 'hinge', axis: [0, 0, 1] },
      gib: true,
    };
    spec[`thigh${side}`] = {
      shape: 'capsule',
      size: [0.072 * k, d.thigh * 0.4],
      axis: 'y',
      offset: [0, -d.thigh / 2, 0],
      mass: 8 * massK * k,
      joint: { kind: 'cone', axis: [0, -1, 0], cone: 0.8, twist: 0.3 },
      gib: true,
    };
    spec[`shin${side}`] = {
      shape: 'capsule',
      size: [0.058 * k, d.shin * 0.42],
      axis: 'y',
      offset: [0.015, -d.shin / 2 - 0.02, 0],
      mass: 4.5 * massK * k,
      joint: { kind: 'hinge', axis: [0, 0, 1] },
      gib: true,
    };
  }
  return spec;
}
