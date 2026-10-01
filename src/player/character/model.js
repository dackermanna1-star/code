// The walker, modelled as signed distance fields in her bind pose: skin,
// face (eyes, lids, lashes, brows, nose, lips), sleek dark hair pulled into a
// high ponytail with face-framing strands, a cropped black leather biker
// jacket over a wine satin top, a black mini skirt, sheer black tights and
// knee-high stiletto boots. Each part is meshed smooth from its field at 2-5 mm
// (surface nets), simplified to a few thousand triangles where its shape and
// materials allow, and gets per-vertex bone weights from anatomical rules.
import * as THREE from 'three';
import { Palette } from '../../voxel/VoxelGrid.js';
import { MCLS } from '../../render/voxelMaterial.js';
import {
  surfaceNets, simplify, sdfAO, smin, smax, sstep, cone, ell, sph, ell2, sdRoundBox, n3, clamp, mix,
  abs, min, max, sin, cos, sqrt, atan2, PI, hypot, exp,
} from './sdf.js';
import { J, ARM, armToWorld, worldToArm, FINGERS, fingerJoints, thumbJoints, WRIST_Y, KNUCKLE_Y, PONY, ARM_A } from './rig.js';

// ───────────────────────── materials ─────────────────────────

export function characterPalette() {
  const P = new Palette();
  const a = (n, color, cls, rough, o = {}) => P.add(n, { color, cls, rough, metal: o.metal ?? 0, vari: o.vari ?? 0.04 });
  a('skin', [204, 156, 134], MCLS.SKIN, 0.5, { vari: 0.02 });
  a('skinShade', [182, 132, 114], MCLS.SKIN, 0.55, { vari: 0.02 });
  a('blush', [210, 150, 136], MCLS.SKIN, 0.5, { vari: 0.02 });
  a('shadow', [140, 94, 80], MCLS.SKIN, 0.38, { vari: 0.03 });
  a('lips', [152, 44, 60], MCLS.GENERIC, 0.24, { vari: 0.03 });
  a('lipsHi', [176, 76, 88], MCLS.GENERIC, 0.18, { vari: 0.03 });
  a('lipsLine', [84, 22, 32], MCLS.GENERIC, 0.4, { vari: 0.02 });
  a('liner', [16, 13, 13], MCLS.GENERIC, 0.35, { vari: 0.02 });
  a('brow', [50, 34, 27], MCLS.FABRIC, 0.8, { vari: 0.08 });
  a('sclera', [226, 220, 212], MCLS.GENERIC, 0.06, { vari: 0.01 });
  a('iris', [78, 50, 30], MCLS.GENERIC, 0.14, { vari: 0.08 });
  a('irisHi', [112, 84, 44], MCLS.GENERIC, 0.14, { vari: 0.08 });
  a('irisRing', [44, 28, 20], MCLS.GENERIC, 0.08, { vari: 0.02 });
  a('pupil', [6, 5, 5], MCLS.GENERIC, 0.04, { vari: 0 });
  a('hair', [40, 27, 21], MCLS.FABRIC, 0.38, { vari: 0.06 });
  a('hairHi', [84, 56, 38], MCLS.FABRIC, 0.36, { vari: 0.06 });
  a('hairDark', [22, 15, 12], MCLS.FABRIC, 0.45, { vari: 0.05 });
  a('hairTie', [14, 12, 12], MCLS.RUBBER, 0.6);
  a('gold', [204, 164, 92], MCLS.GENERIC, 0.2, { metal: 1, vari: 0.02 });
  a('leather', [24, 22, 23], MCLS.LEATHER, 0.3, { vari: 0.07 });
  a('leatherSeam', [11, 10, 11], MCLS.LEATHER, 0.45, { vari: 0.04 });
  a('leatherEdge', [40, 37, 37], MCLS.LEATHER, 0.34, { vari: 0.06 });
  a('zip', [104, 102, 98], MCLS.GENERIC, 0.3, { metal: 0.9, vari: 0.04 });
  a('top', [104, 22, 36], MCLS.FABRIC, 0.38, { vari: 0.04 });
  a('skirt', [15, 14, 16], MCLS.FABRIC, 0.8, { vari: 0.05 });
  a('skirtBand', [22, 21, 24], MCLS.FABRIC, 0.7, { vari: 0.04 });
  a('nylon', [20, 16, 15], MCLS.NYLON, 0.5, { vari: 0 });
  a('boot', [12, 11, 12], MCLS.LEATHER, 0.2, { vari: 0.05 });
  a('bootCrease', [6, 6, 7], MCLS.LEATHER, 0.35, { vari: 0.03 });
  a('sole', [10, 9, 9], MCLS.RUBBER, 0.7, { vari: 0.03 });
  a('nail', [92, 24, 30], MCLS.GENERIC, 0.22, { vari: 0.02 });
  return P;
}

// ───────────────────────── skin ─────────────────────────

/** Right leg skin (x mirrored by the caller): thigh, knee, calf, slim ankle. */
function legSkin(x, y, z) {
  const K = J.knee, A = J.ankle;
  let d = cone(x, y, z, [0.088, 0.96, 0.008], K, 0.083, 0.047);
  // the inner thigh is a touch flatter where the legs meet
  d += 0.006 * sstep(0.04, 0.0, x - 0.07) * sstep(0.62, 0.86, y);
  d = smin(d, sph(x, y, z, [K[0], K[1] + 0.006, K[2] - 0.029], 0.025), 0.02);
  d = smin(d, cone(x, y, z, K, A, 0.046, 0.029), 0.03);
  d = smin(d, ell(x, y, z, [K[0] + 0.003, 0.385, K[2] + 0.025], [0.041, 0.096, 0.037]), 0.035);
  return d;
}

/** Torso skin: hips, waist, ribs, bust, back, shoulders, neck base. */
function torsoSkin(x, y, z) {
  const ax = abs(x);
  let d = ell(x, y, z, [0, 0.952, 0.004], [0.148, 0.098, 0.1]);
  d = smin(d, ell(ax, y, z, [0.066, 0.915, 0.048], [0.074, 0.082, 0.066]), 0.03);
  d = smin(d, ell(x, y, z, [0, 1.085, 0.004], [0.11, 0.11, 0.079]), 0.06);
  d = smin(d, ell(x, y, z, [0, 1.228, 0.002], [0.128, 0.122, 0.092]), 0.05);
  d = smin(d, ell(ax, y, z, [0.05, 1.246, -0.066], [0.058, 0.053, 0.047]), 0.025);
  d = smin(d, ell(x, y, z, [0, 1.3, 0.038], [0.122, 0.085, 0.058]), 0.05);
  d = smin(d, cone(x, y, z, [-0.132, 1.35, 0.012], [0.132, 1.35, 0.012], 0.038), 0.06);
  d = smin(d, cone(x, y, z, [0, 1.31, 0.012], [0, 1.452, 0.008], 0.056, 0.047), 0.05);
  // tops of the thighs into the hips (under the skirt)
  d = smin(d, cone(ax, y, z, [0.085, 0.93, 0.006], [0.082, 0.79, 0.008], 0.082, 0.072), 0.03);
  return d;
}

// ───────────────────────── legs mesh ─────────────────────────

function bootTop(x, z) {
  // straight cut just under the knee, dipping a little at the back
  return 0.468 - 0.01 * sstep(0.0, 0.04, z - J.knee[2]);
}

function legsField(P) {
  const M = (n) => P.get(n);
  const boot = (x, y, z) => {
    const A = J.ankle;
    let shaft = legSkin(x, y, z) - 0.0075;
    shaft = smax(shaft, y - bootTop(x, z), 0.005);
    // the foot in an almond-toe stiletto: heel raised, ball and toe on the ground
    const fx = x - A[0], fy = y - A[1], fz = z - A[2];
    let foot = smin(cone(fx, fy, fz, [0, -0.036, 0.03], [0, -0.088, -0.088], 0.034, 0.029), ell(fx, fy, fz, [0, -0.097, -0.127], [0.031, 0.02, 0.062]), 0.02);
    foot = smin(foot, cone(fx, fy, fz, [0, 0.02, 0.0], [0, -0.04, 0.025], 0.036, 0.035), 0.02);
    const soleY = fz < -0.09 ? -0.1165 : -0.1165 + ((fz + 0.09) / 0.135) * 0.046;
    foot = smax(foot, soleY - fy, 0.003);
    let d = smin(shaft, foot, 0.025);
    // stiletto heel and its top-lift
    d = min(d, cone(fx, fy, fz, [0, -0.072, 0.045], [0, -0.1155, 0.053], 0.0105, 0.0042));
    // a rolled edge at the boot top
    d = min(d, smax(abs(y - bootTop(x, z) + 0.002) - 0.0042, legSkin(x, y, z) - 0.0105, 0.002));
    return d;
  };
  const sdf = (x, y, z) => {
    const lx = abs(x);
    // under the skirt the thighs slim away so they never push through it
    return min(legSkin(lx, y, z) + 0.016 * sstep(0.76, 0.93, y), boot(lx, y, z));
  };
  const mat = (x, y, z) => {
    const lx = abs(x);
    const b = boot(lx, y, z);
    if (b < 0.0012) {
      const fy = y - J.ankle[1];
      if (fy < -0.108 || (lx - J.ankle[0]) ** 2 + (z - J.ankle[2] - 0.05) ** 2 < 0.004 ** 2) return M('sole');
      // inner zip from the ankle to the top
      if (y > J.ankle[1] && y < bootTop(lx, z) && abs(z - J.knee[2] - 0.004) < 0.004 && lx < J.knee[0] - 0.02) return M('zip');
      if (y > 0.13 && y < 0.2 && n3(lx * 90, y * 40, z * 90, 3) > 0.62) return M('bootCrease');
      return M('boot');
    }
    return M('nylon');
  };
  return { sdf, mat, fill: M('nylon'), min: [-0.18, -0.002, -0.235], max: [0.18, 0.99, 0.12] };
}

function legWeights(x, y, z, out) {
  const S = x < 0 ? 'L' : 'R';
  const wFoot = sstep(J.ankle[1] + 0.035, J.ankle[1] - 0.012, y);
  const wShin = sstep(J.knee[1] + 0.045, J.knee[1] - 0.045, y);
  const wThigh = sstep(0.985, 0.84, y);
  out.push([`foot${S}`, wFoot], [`shin${S}`, (1 - wFoot) * wShin], [`thigh${S}`, (1 - wFoot) * (1 - wShin) * wThigh], ['hips', (1 - wFoot) * (1 - wShin) * (1 - wThigh)]);
}

// ───────────────────────── torso mesh ─────────────────────────

/** The open V of the jacket front: >0 inside the opening. */
function jacketOpen(x, y, z) {
  const vy = 1.122;
  const halfW = max(0, y - vy) * 0.34 + 0.004;
  return min(halfW - abs(x - 0.008), -z - 0.025);
}
function jacketField(x, y, z) {
  let d = torsoSkin(x, y, z) - 0.017;
  d = smax(d, 1.032 - y, 0.008);
  // lapels fold back along the opening's edge
  const o = jacketOpen(x, y, z);
  d -= 0.0055 * exp(-((o + 0.016) ** 2) / 0.00012) * sstep(1.14, 1.2, y);
  d = smax(d, o, 0.004);
  // collar standing round the neck at the back, falling into the lapels
  const nr = hypot(x, z - 0.012);
  const collar = smax(abs(nr - 0.07) - 0.0075, max(1.35 - y, y - (1.418 - 0.03 * sstep(0.0, -0.06, z))), 0.006);
  d = smin(d, smax(collar, -z - 0.035, 0.006), 0.004);
  return d;
}
function skirtField(x, y, z) {
  const t = clamp((1.042 - y) / 0.405, 0, 1);
  const rx = mix(0.129, 0.17, sstep(0, 0.35, t)) + 0.012 * t;
  const rz = mix(0.097, 0.122, sstep(0, 0.35, t)) + 0.008 * t;
  const zc = 0.006 + 0.014 * sstep(0.1, 0.4, t);
  const a = atan2(z - zc, x);
  const fold = 0.0035 * t * t * sin(a * 9 + 1.3 + 2 * n3(a * 2, 0, 0, 9));
  let d = min(ell2(x, z - zc, rx + fold, rz + fold), torsoSkin(x, y, z) - 0.006);
  d = abs(d + 0.006) - 0.006;
  return smax(d, max(0.637 - y, y - 1.047), 0.004);
}
function topField(x, y, z) {
  const neck = z < 0 ? 1.338 - 0.055 * exp(-((x / 0.075) ** 2)) : 1.37;
  return smax(smax(torsoSkin(x, y, z) - 0.0035, y - neck, 0.004), 1.0 - y, 0.004);
}

function torsoField(P) {
  const M = (n) => P.get(n);
  const sdf = (x, y, z) => smin(min(torsoSkin(x, y, z), topField(x, y, z)), smin(jacketField(x, y, z), skirtField(x, y, z), 0.003), 0.003);
  const mat = (x, y, z) => {
    const ax = abs(x);
    if (jacketField(x, y, z) < 0.0008) {
      const o = jacketOpen(x, y, z);
      if (o > -0.003 && o < 0 && y > 1.13 && x < 0.008) return M('zip');
      // a diagonal chest-pocket zip, princess seams, a hem band
      if (x < -0.03 && x > -0.105 && z < -0.04 && abs(y - (1.205 + 0.6 * (x + 0.03))) < 0.0028) return M('zip');
      if (abs(ax - 0.074) < 0.0022 && z < -0.02 && y < 1.19) return M('leatherSeam');
      if (z > 0.04 && abs(y - 1.3) < 0.0022) return M('leatherSeam');
      if (y < 1.05) return M('leatherEdge');
      return n3(x * 40, y * 40, z * 40, 7) > 0.7 ? M('leatherEdge') : M('leather');
    }
    if (skirtField(x, y, z) < 0.0008) {
      if (y > 1.02) return M('skirtBand');
      return M('skirt');
    }
    if (topField(x, y, z) < 0.0008) return M('top');
    return M('skin');
  };
  return { sdf, mat, fill: M('skin'), min: [-0.255, 0.62, -0.165], max: [0.255, 1.47, 0.17] };
}

function torsoWeights(x, y, z, out) {
  const skirt = skirtField(x, y, z) < 0.003 && jacketField(x, y, z) > 0.002;
  if (skirt) {
    // the skirt rides on the hips and is pushed by the thighs toward the hem
    const w = 0.6 * sstep(1.0, 0.66, y);
    const sl = sstep(0.07, -0.07, x);
    out.push(['hips', 1 - w], ['thighL', w * sl], ['thighR', w * (1 - sl)]);
    return;
  }
  const w1 = sstep(0.985, 1.085, y), w2 = sstep(1.13, 1.25, y), wn = sstep(1.375, 1.445, y);
  // shoulder caps go with the arms
  const ax = abs(x), S = x < 0 ? 'L' : 'R';
  const wa = sstep(0.125, 0.19, ax) * sstep(1.27, 1.34, y);
  const k = 1 - wa;
  out.push(['hips', k * (1 - w1)], ['spine1', k * w1 * (1 - w2)], ['spine2', k * w1 * w2 * (1 - wn)], ['neck', k * w1 * w2 * wn]);
  if (wa > 0) out.push([`clav${S}`, wa * 0.45], [`arm${S}`, wa * 0.55]);
  // under the skirt the hip skin follows the thighs a little
  const wt = sstep(0.9, 0.8, y) * 0.5;
  if (wt > 0) {
    for (const e of out) e[1] *= 1 - wt;
    out.push([`thigh${S}`, wt]);
  }
}

// ───────────────────────── arm meshes (right-arm frame) ─────────────────────────

function armSkin(x, y, z) {
  let d = cone(x, y, z, [0, 0.01, 0], [0, -ARM.upper, 0], 0.04, 0.031);
  d = smin(d, ell(x, y, z, [0.004, -0.045, 0.0], [0.043, 0.06, 0.043]), 0.03);
  d = smin(d, cone(x, y, z, [0, -ARM.upper, 0], [0, WRIST_Y, 0], 0.032, 0.0238), 0.02);
  d = smin(d, ell(x, y, z, [0, -ARM.upper - 0.05, 0.004], [0.035, 0.055, 0.033]), 0.03);
  return d;
}
const FJ = FINGERS.map((f) => fingerJoints(f));
const TJ = thumbJoints();
function handSkin(x, y, z) {
  let d = sdRoundBox(x + 0.001, y - (WRIST_Y - 0.045), z + 0.001, 0.0124, 0.044, 0.032, 0.0115);
  // thenar pad under the thumb
  d = smin(d, ell(x, y, z, [-0.006, WRIST_Y - 0.035, -0.022], [0.013, 0.026, 0.016]), 0.01);
  FINGERS.forEach((f, i) => {
    const [mcp, pip, tip] = FJ[i];
    d = smin(d, cone(x, y, z, mcp, pip, f.r, f.r * 0.9), 0.007);
    d = smin(d, cone(x, y, z, pip, tip, f.r * 0.9, f.r * 0.7), 0.004);
  });
  d = smin(d, cone(x, y, z, TJ[0], TJ[1], THUMB_R, THUMB_R * 0.92), 0.01);
  d = smin(d, cone(x, y, z, TJ[1], TJ[2], THUMB_R * 0.92, THUMB_R * 0.72), 0.004);
  return d;
}
const THUMB_R = 0.0108;
const CUFF_Y = WRIST_Y + 0.028;
function sleeveField(x, y, z) {
  let d = armSkin(x, y, z) - 0.0105;
  d = smax(d, CUFF_Y - y, 0.004);
  d = smax(d, y - 0.035, 0.01);
  return d;
}

function armField(P, side) {
  const M = (n) => P.get(n);
  // only the wrist shows between the cuff and the hand
  const wrist = (x, y, z) => smax(armSkin(x, y, z), y - (CUFF_Y + 0.012), 0.004);
  const sdf = (x, y, z) => min(sleeveField(x, y, z), min(wrist(x, y, z), handSkin(x, y, z)));
  const mat = (x, y, z) => {
    if (sleeveField(x, y, z) < 0.0008) {
      // cuff zip on the outside of the wrist, a seam down the back of the arm
      if (y < CUFF_Y + 0.05 && abs(z - 0.0) < 0.0028 && x > 0.01) return M('zip');
      if (y < CUFF_Y + 0.008) return M('leatherEdge');
      if (abs(z - 0.03) < 0.002 && x > 0) return M('leatherSeam');
      return M('leather');
    }
    // nails on the backs of the finger tips
    for (let i = 0; i < 4; i++) {
      const tip = FJ[i][2];
      if (hypot(x - tip[0], y - tip[1], z - tip[2]) < 0.013 && x > tip[0] - 0.002) return M('nail');
    }
    if (hypot(x - TJ[2][0], y - TJ[2][1], z - TJ[2][2]) < 0.012 && x - TJ[2][0] > 0.0015) return M('nail');
    // a thin gold ring on her left hand
    if (side < 0) {
      const [mcp, pip] = FJ[2];
      const t = ((x - mcp[0]) * (pip[0] - mcp[0]) + (y - mcp[1]) * (pip[1] - mcp[1])) / ((pip[0] - mcp[0]) ** 2 + (pip[1] - mcp[1]) ** 2);
      if (t > 0.35 && t < 0.52 && abs(z - mcp[2]) < 0.012) return M('gold');
    }
    return M('skin');
  };
  return { sdf, mat, fill: M('skin'), min: [-0.075, -0.69, -0.075], max: [0.075, 0.07, 0.075] };
}

function armWeights(x, y, z, S, out) {
  // fingers and thumb
  if (y < KNUCKLE_Y + 0.012) {
    let bi = 0, bd = 1e9;
    FINGERS.forEach((f, i) => {
      const dz = abs(z - f.z);
      if (dz < bd) {
        bd = dz;
        bi = i;
      }
    });
    const [mcp, pip] = FJ[bi];
    const n = FINGERS[bi].name;
    const along = (mcp[1] - y) / (mcp[1] - pip[1]); // 0 at the knuckle, 1 at the middle joint
    const wd = sstep(0.85, 1.15, along), wp = sstep(-0.25, 0.25, along);
    out.push([`${n}1${S}`, wd], [`${n}0${S}`, (1 - wd) * wp], [`hand${S}`, (1 - wd) * (1 - wp)]);
    return;
  }
  const tb = hypot(x - TJ[1][0], y - TJ[1][1], z - TJ[1][2]), ta = hypot(x - TJ[0][0], y - TJ[0][1], z - TJ[0][2]);
  if (z < -0.024 && y < WRIST_Y - 0.02 && x < 0.006 && min(ta, tb) < 0.03) {
    const w1 = sstep(0.0, 0.012, (TJ[0][1] - y) - 0.035);
    const w0 = sstep(0.004, 0.02, ta);
    out.push([`t1${S}`, w1], [`t0${S}`, (1 - w1) * w0], [`hand${S}`, (1 - w1) * (1 - w0)]);
    return;
  }
  const wHand = sstep(WRIST_Y + 0.012, WRIST_Y - 0.02, y);
  const wFore = sstep(-ARM.upper + 0.035, -ARM.upper - 0.035, y);
  const wArm = sstep(0.045, -0.05, y);
  const r = 1 - wHand;
  out.push([`hand${S}`, wHand], [`fore${S}`, r * wFore], [`arm${S}`, r * (1 - wFore) * wArm], [`clav${S}`, r * (1 - wFore) * (1 - wArm) * 0.6], ['spine2', r * (1 - wFore) * (1 - wArm) * 0.4]);
}

// ───────────────────────── head mesh (head-local) ─────────────────────────

const EYE = [0.031, 0.0862, -0.0682], EYE_R = 0.0128;
const EAR = [0.07, 0.066, 0.012];
// landmarks (head-local): crown 0.195, hairline 0.152, brow 0.104, eyes 0.086, nose tip 0.046,
// nose base 0.037, mouth 0.0165, chin -0.032
const UPPER_LIP = [0, 0.0211, -0.0862], UPPER_LIP_R = [0.0172, 0.0041, 0.006];
const LOWER_LIP = [0, 0.0118, -0.0846], LOWER_LIP_R = [0.0156, 0.005, 0.0061];
function headSkin(x, y, z) {
  const ax = abs(x);
  let d = ell(x, y, z, [0, 0.096, 0.016], [0.072, 0.098, 0.092]);
  // midface: cheeks and maxilla
  d = smin(d, ell(x, y, z, [0, 0.058, -0.03], [0.057, 0.06, 0.061]), 0.02);
  // jaw tapering to a slim, defined chin
  d = smin(d, cone(ax, y, z, [0.049, 0.024, -0.004], [0.011, -0.017, -0.064], 0.0175, 0.0132), 0.02);
  d = smin(d, ell(x, y, z, [0, -0.016, -0.066], [0.0165, 0.016, 0.016]), 0.015);
  // the mouth sits on a rounded muzzle, so the lips only just stand proud of it
  d = smin(d, ell(x, y, z, [0, 0.018, -0.064], [0.029, 0.03, 0.0255]), 0.014);
  // high, subtle cheekbones
  d = smin(d, ell(ax, y, z, [0.046, 0.069, -0.05], [0.018, 0.011, 0.016]), 0.01);
  d = smin(d, cone(x, y, z, [-0.036, 0.104, -0.068], [0.036, 0.104, -0.068], 0.0105), 0.022);
  d = smax(d, -ell(ax, y, z, [EYE[0], EYE[1] + 0.0015, -0.081], [0.0188, 0.0128, 0.0138]), 0.007);
  // nose: narrow straight bridge, small slightly upturned tip
  d = smin(d, cone(x, y, z, [0, 0.083, -0.08], [0, 0.0525, -0.0942], 0.0064, 0.0086), 0.008);
  d = smin(d, sph(x, y, z, [0, 0.0487, -0.0948], 0.009), 0.007);
  d = smin(d, ell(ax, y, z, [0.0105, 0.0432, -0.0872], [0.0068, 0.0056, 0.0066]), 0.005);
  // lips: full, not pouting; cupid's bow on the upper lip
  const bow = 0.0009 * exp(-((ax - 0.0045) ** 2) / 0.000016);
  d = smin(d, ell(x, y - bow, z, UPPER_LIP, UPPER_LIP_R), 0.005);
  d = smin(d, ell(x, y, z, LOWER_LIP, LOWER_LIP_R), 0.005);
  d = smax(d, -ell(x, y, z, [0, 0.0165, -0.093], [0.0188, 0.0008, 0.011]), 0.0012);
  d += 0.0007 * exp(-(x * x) / 0.00001) * sstep(0.034, 0.029, y) * sstep(0.024, 0.028, y);
  // ears, neck
  d = smin(d, ell(ax, y, z, EAR, [0.008, 0.028, 0.017]), 0.008);
  d = smin(d, cone(x, y, z, [0, 0.04, 0.02], [0, -0.13, 0.012], 0.0435, 0.049), 0.03);
  return d;
}
function eyeField(x, y, z) {
  return sph(abs(x), y, z, EYE, EYE_R);
}
const lidEdge = (u) => EYE[1] + 0.0056 - 0.0021 * u * u + 0.0014 * u;
/** Upper lid: a shell over the top of the eyeball, its edge just above the iris. */
function lidField(x, y, z) {
  const ax = abs(x);
  const r = hypot(ax - EYE[0], y - EYE[1], z - EYE[2]);
  const shell = abs(r - EYE_R - 0.0009) - 0.0009;
  const front = z - (EYE[2] + 0.004);
  return max(shell, max(lidEdge((ax - EYE[0]) / 0.0128) - y, front));
}
/** Lower lid: a softer rim along the bottom of the eye. */
function lowerLidField(x, y, z) {
  const ax = abs(x);
  const u = (ax - EYE[0]) / 0.0128;
  const r = hypot(ax - EYE[0], y - EYE[1], z - EYE[2]);
  const shell = abs(r - EYE_R - 0.0008) - 0.0008;
  const edge = EYE[1] - 0.0062 + 0.0016 * u * u + 0.0008 * u;
  return max(shell, max(y - edge, z - (EYE[2] + 0.004)));
}
/** Lashes and the winged liner: a thin rim along the lid edge sweeping out. */
function lashField(x, y, z) {
  const ax = abs(x);
  const u = (ax - EYE[0]) / 0.0128; // -1 inner corner .. +1 outer corner
  if (u < -1.05 || u > 1.6) return 1;
  const uc = min(u, 1);
  const edge = lidEdge(uc);
  const zr = EYE[2] - sqrt(max(0, (EYE_R + 0.0016) ** 2 - (ax - EYE[0]) ** 2 - (edge - EYE[1]) ** 2));
  // the wing: past the outer corner it lifts and tapers to a point
  const wing = u > 1 ? (u - 1) * 0.0055 : 0;
  const th = 0.0012 * (u > 1 ? max(0, 1 - (u - 1) / 0.6) : 0.6 + 0.4 * (u + 1) / 2);
  return max(abs(y - edge - 0.0007 - wing) - th, abs(z - zr + 0.0006) - 0.0026);
}
function earringField(x, y, z) {
  // small gold hoops hanging from the lobes
  const ax = abs(x);
  const c = [EAR[0] + 0.003, EAR[1] - 0.04, EAR[2] - 0.002];
  const q = hypot(y - c[1], z - c[2]) - 0.0105;
  return hypot(q, ax - c[0]) - 0.0017;
}
function headField(P) {
  const M = (n) => P.get(n);
  // the lashes and nostrils are painted on (too fine for the mesh); the hoops are a touch thicker
  const sdf = (x, y, z) => min(min(min(headSkin(x, y, z), eyeField(x, y, z)), lowerLidField(x, y, z)), min(lidField(x, y, z), earringField(x, y, z) - 0.0006));
  const mat = (x, y, z, d) => {
    const ax = abs(x);
    if (earringField(x, y, z) < 0.0008) return M('gold');
    if (lashField(x, y, z) < 0.0008) return M('liner');
    if (lidField(x, y, z) < 0.0008) return y < lidEdge((ax - EYE[0]) / 0.0128) + 0.0016 ? M('liner') : M('shadow');
    if (lowerLidField(x, y, z) < 0.0008) return y > EYE[1] - 0.0072 ? M('shadow') : M('skin');
    if (eyeField(x, y, z) < 0.0008) {
      // looking straight ahead, a touch outward
      const vx = ax - EYE[0], vy = y - EYE[1], vz = z - EYE[2];
      const l = hypot(vx, vy, vz) || 1;
      const c = (vx * 0.06 - vz) / (l * 1.0018);
      if (c > cos(0.2)) return M('pupil');
      if (c > cos(0.3)) return M('irisHi');
      if (c > cos(0.46)) return M('iris');
      if (c > cos(0.51)) return M('irisRing');
      return M('sclera');
    }
    // lips and the line between them
    if (z < -0.077 && y < 0.03 && y > 0.002 && ax < 0.021) {
      if (abs(y - 0.0165) < 0.0010) return M('lipsLine');
      const bow = 0.0009 * exp(-((ax - 0.0045) ** 2) / 0.000016);
      const lipD = min(ell(x, y - bow, z, UPPER_LIP, UPPER_LIP_R), ell(x, y, z, LOWER_LIP, LOWER_LIP_R));
      if (lipD < 0.0012) return y > 0.0228 && lipD > -0.0002 && ax < 0.006 ? M('lipsHi') : M('lips');
    }
    // brows: an arch from the inner end up to the peak and out to a fine tail
    const bu = (ax - 0.012) / 0.042;
    if (bu > 0 && bu < 1 && z < -0.055) {
      const by = 0.105 + 0.0065 * sin(PI * min(1, bu / 0.68) * 0.5) * (bu < 0.68 ? 1 : 1 - (bu - 0.68) / 0.32 * 0.9) + 0.002;
      const th = 0.0036 * (1 - 0.55 * bu);
      if (abs(y - by) < th) return M('brow');
    }
    // eye shadow on the lids and up to the crease, blush on the cheekbones
    if (z < -0.062 && ax > 0.018 && ax < 0.049 && y > EYE[1] + 0.0045 && y < EYE[1] + 0.0125) return M('shadow');
    if (z < -0.05 && hypot((ax - 0.045) * 0.8, y - 0.057) < 0.011) return M('blush');
    if (ell(ax, y, z, [0.0056, 0.0392, -0.0912], [0.0053, 0.0034, 0.006]) < 0) return M('shadow');
    if (y < -0.075 || d < -0.004) return M('skin');
    return M('skin');
  };
  return { sdf, mat, fill: M('skin'), min: [-0.09, -0.135, -0.118], max: [0.09, 0.2, 0.115] };
}

function headWeights(x, y, z, out) {
  const S = x < 0 ? 'L' : 'R';
  if (eyeField(x, y, z) < 0.0006) return out.push([`eye${S}`, 1]);
  if (lidField(x, y, z) < 0.0008 || lashField(x, y, z) < 0.0008) return out.push([`lid${S}`, 1]);
  if (lowerLidField(x, y, z) < 0.0008) return out.push(['head', 1]);
  const wHead = max(sstep(-0.022, 0.018, y), sstep(-0.035, -0.06, z) * sstep(-0.06, -0.035, y));
  const wSp = sstep(-0.075, -0.12, y);
  out.push(['head', wHead], ['neck', (1 - wHead) * (1 - wSp)], ['spine2', (1 - wHead) * wSp]);
}

// ───────────────────────── hair (head-local) ─────────────────────────

const TIE = [PONY[0][0] - J.head[0], PONY[0][1] - J.head[1], PONY[0][2] - J.head[2]];
const PONY_L = PONY.map((p) => [p[0] - J.head[0], p[1] - J.head[1], p[2] - J.head[2]]);
const PONY_R = [0.023, 0.031, 0.029, 0.025, 0.02, 0.014, 0.006];

/** Lowest point the hair reaches around the head: the hairline at the front, above the ears, the nape. */
function hairMinY(x, z) {
  const ax = abs(x);
  const front = sstep(-0.035, -0.07, z);
  const side = sstep(0.045, 0.068, ax) * sstep(0.03, -0.02, z);
  const back = sstep(0.0, 0.05, z);
  let y = 0.155 - 0.028 * (ax / 0.06) ** 2; // hairline, higher in the middle
  y = mix(y, 0.104, side * (1 - front));
  y = mix(y, 0.028, back);
  return y;
}
function ponyDist(x, y, z) {
  let d = 1e9, best = 0;
  for (let i = 0; i < PONY_L.length - 1; i++) {
    const di = cone(x, y, z, PONY_L[i], PONY_L[i + 1], PONY_R[i], PONY_R[i + 1]);
    if (di < d) {
      d = di;
      best = i;
    }
  }
  return [d, best];
}
function hairField(P) {
  const M = (n) => P.get(n);
  // face-framing strands from the temples to the jaw, in front of the ears
  const strand = (x, y, z) => {
    const ax = abs(x);
    const t = clamp((0.135 - y) / 0.14, 0, 1);
    // a ribbon of hair curving from the temple past the cheekbone, in gentle waves
    const cx = 0.058 + 0.007 * sin(t * 3.2) + 0.006 * t, cz = -0.044 + 0.016 * t + 0.005 * sin(t * 5.5);
    const w = 0.009 * (1 - 0.55 * t), th = 0.0042 * (1 - 0.4 * t);
    // ribbon cross-section: wide along the face, thin across it
    const du = (z - cz), dv = (ax - cx);
    return smax(max(abs(du) - w, abs(dv) - th) - 0.0015, max(y - 0.14, -0.006 - y), 0.005);
  };
  const sdf = (x, y, z) => {
    // sleek over the sides, a soft lift over the crown, pulled back to the tie
    let d = ell(x, y, z, [0, 0.096, 0.016], [0.0805, 0.1055, 0.1005]);
    d = smin(d, ell(x, y, z, [0, 0.15, 0.02], [0.05, 0.058, 0.07]), 0.03);
    d = smax(d, hairMinY(x, z) - y, 0.006);
    // strands converging on the tie
    const th = atan2(x, -(z - TIE[2]) + (TIE[1] - y) * 0.4);
    d += 0.001 * sin(th * 34 + 3 * n3(x * 30, y * 30, z * 30, 5));
    // tie and ponytail
    d = min(d, max(abs(hypot(x, z - TIE[2] + 0.004) - 0.017) - 0.0045, abs(y - TIE[1] + 0.002) - 0.005));
    const [pd] = ponyDist(x, y, z);
    const s = clamp((TIE[1] - y) / 0.43, 0, 1);
    const ph = atan2(x, z - 0.15);
    d = min(d, pd + 0.0012 * sin(ph * 14 + s * 6) + 0.003 * s * (n3(x * 60, y * 25, z * 60, 6) - 0.5));
    d = min(d, strand(x, y, z));
    return d;
  };
  const mat = (x, y, z) => {
    if (abs(y - TIE[1] + 0.002) < 0.0055 && hypot(x, z - TIE[2] + 0.004) < 0.024) return M('hairTie');
    const th = atan2(x, -(z - TIE[2]) + (TIE[1] - y) * 0.4);
    const streak = sin(th * 34 * 1.7 + 6 * n3(x * 20, y * 20, z * 20, 8));
    if (streak > 0.86) return M('hairHi');
    if (streak < -0.9 || y < hairMinY(x, z) + 0.008) return M('hairDark');
    return M('hair');
  };
  return { sdf, mat, fill: M('hair'), min: [-0.095, -0.29, -0.1], max: [0.095, 0.215, 0.19] };
}

function hairWeights(x, y, z, out) {
  const [pd, i] = ponyDist(x, y, z);
  if (pd < 0.004 && y < TIE[1] - 0.012) {
    // along the chain: blend the two nearest links
    const a = PONY_L[i], b = PONY_L[i + 1];
    const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
    const t = clamp(((x - a[0]) * ex + (y - a[1]) * ey + (z - a[2]) * ez) / (ex * ex + ey * ey + ez * ez), 0, 1);
    const last = PONY_L.length - 2;
    const wPrev = i > 0 ? 0.5 * sstep(0.35, 0.0, t) : 0;
    const wNext = i < last ? 0.5 * sstep(0.65, 1.0, t) : 0;
    out.push([`pony${i}`, 1 - wPrev - wNext]);
    if (wPrev > 0) out.push([`pony${i - 1}`, wPrev]);
    if (wNext > 0) out.push([`pony${i + 1}`, wNext]);
    return;
  }
  out.push(['head', 1]);
}

// ───────────────────────── building ─────────────────────────

/** Writes skinIndex/skinWeight from a weight rule evaluated at each vertex (pushed half a voxel inside). */
function skin(geo, boneIndex, rule, vs, frame = null) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array;
  const n = P.length / 3;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const out = [];
  for (let v = 0; v < n; v++) {
    let x = P[v * 3] - (N[v * 3] / 127) * vs * 0.5;
    let y = P[v * 3 + 1] - (N[v * 3 + 1] / 127) * vs * 0.5;
    let z = P[v * 3 + 2] - (N[v * 3 + 2] / 127) * vs * 0.5;
    if (frame) [x, y, z] = frame(x, y, z);
    out.length = 0;
    rule(x, y, z, out);
    // keep the four heaviest, normalized
    out.sort((a, b) => b[1] - a[1]);
    let tot = 0;
    for (let k = 0; k < 4 && k < out.length; k++) tot += max(0, out[k][1]);
    for (let k = 0; k < 4; k++) {
      const e = out[k];
      if (!e || e[1] <= 0 || tot <= 0) continue;
      const bi = boneIndex.get(e[0]);
      if (bi === undefined) throw new Error('no bone ' + e[0]);
      si[v * 4 + k] = bi;
      sw[v * 4 + k] = e[1] / tot;
    }
    if (tot <= 0) sw[v * 4] = 1;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
}

/** Mirror the left half of a geometry built for the right (x -> -x, winding flipped). */
function mirrorX(geo) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array;
  for (let i = 0; i < P.length; i += 3) {
    P[i] = -P[i];
    N[i] = -N[i];
  }
  const I = geo.index.array;
  for (let i = 0; i < I.length; i += 3) {
    const t = I[i + 1];
    I[i + 1] = I[i + 2];
    I[i + 2] = t;
  }
}

/**
 * Build every mesh in bind-pose world space with skin weights.
 * boneIndex: Map name -> index. Returns [{ name, geo }].
 */
export function buildCharacterMeshes(boneIndex) {
  const P = characterPalette();
  const parts = [];
  const t0 = performance.now();
  const timings = {};
  const time = (k, f) => {
    const t = performance.now();
    const r = f();
    timings[k] = Math.round(performance.now() - t);
    return r;
  };

  // legs and boots
  time('legs', () => {
    const f = legsField(P);
    const vs = 0.0045;
    const geo = simplify(surfaceNets(P, { ...f, vs }), 12000, { colTol: 30 });
    sdfAO(geo, f.sdf, 0.007);
    skin(geo, boneIndex, legWeights, vs);
    parts.push({ name: 'legs', geo });
  });
  // torso: skin, top, jacket, skirt
  time('torso', () => {
    const f = torsoField(P);
    const vs = 0.005;
    const geo = simplify(surfaceNets(P, { ...f, vs }), 17000, { colTol: 30 });
    sdfAO(geo, f.sdf, 0.008);
    skin(geo, boneIndex, torsoWeights, vs);
    parts.push({ name: 'torso', geo });
  });
  // arms (built once in the right-arm frame, placed and mirrored)
  time('arms', () => {
    for (const [S, s] of [['L', -1], ['R', 1]]) {
      const f = armField(P, s);
      const vs = 0.004;
      const geo = simplify(surfaceNets(P, { ...f, vs }), 6000, { colTol: 30 });
      sdfAO(geo, f.sdf, 0.005);
      skin(geo, boneIndex, (x, y, z, out) => armWeights(x, y, z, S, out), vs);
      // arm frame -> bind-pose world
      const p = geo.attributes.position.array, nn = geo.attributes.normal.array;
      for (let i = 0; i < p.length; i += 3) {
        const w = armToWorld([p[i], p[i + 1], p[i + 2]], 1);
        p[i] = w[0];
        p[i + 1] = w[1];
        p[i + 2] = w[2];
        const c = cos(ARM_A), sn = sin(ARM_A);
        const nx = nn[i] / 127, ny = nn[i + 1] / 127;
        nn[i] = Math.round((c * nx - sn * ny) * 127);
        nn[i + 1] = Math.round((sn * nx + c * ny) * 127);
      }
      if (s < 0) mirrorX(geo);
      geo.computeBoundingSphere();
      parts.push({ name: 'arm' + S, geo });
    }
  });
  // head: skin, eyes, lids, lashes, earrings (head-local, moved to the head joint)
  time('head', () => {
    const f = headField(P);
    const vs = 0.0022;
    const geo = simplify(surfaceNets(P, { ...f, vs }), 11000, { colTol: 10 });
    sdfAO(geo, f.sdf, 0.004, 0.5);
    skin(geo, boneIndex, headWeights, vs);
    geo.translate(J.head[0], J.head[1], J.head[2]);
    parts.push({ name: 'head', geo });
  });
  time('hair', () => {
    const f = hairField(P);
    const vs = 0.003;
    const geo = simplify(surfaceNets(P, { ...f, vs }), 10000, { colTol: 80 });
    sdfAO(geo, f.sdf, 0.005);
    skin(geo, boneIndex, hairWeights, vs);
    geo.translate(J.head[0], J.head[1], J.head[2]);
    parts.push({ name: 'hair', geo });
  });
  for (const p of parts) {
    p.geo.computeBoundingBox();
    p.geo.computeBoundingSphere();
  }
  timings.total = Math.round(performance.now() - t0);
  return { parts, timings, palette: P };
}

// exported for the runtime (where the can and held things sit in the hand, etc.)
export const HAND_GRIP = { palm: [-0.016, WRIST_Y - 0.065, -0.004] };
void worldToArm;
