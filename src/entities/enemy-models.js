// Detailed procedural enemy bodies and their weapons. Everything is assembled from lathed, rounded and
// swept primitives (muscled limbs, ribcages, skulls, armour plates, robes) with tileable detail textures.
// Characters face +Z, their left is +X, limbs hang along -Y from each bone (see rig.js).
import * as THREE from 'three';
import { mergeStatic } from '../render/batching.js';
import { Rig, G, std, eyes } from './rig.js';
import { sharedAssets } from '../render/materials.js';
import { makeDetailTexture, makeClothTexture, makeMetalTexture } from '../render/textures.js';

const TAU = Math.PI * 2;
const K = (...a) => a.map((v) => (typeof v === 'number' ? +v.toFixed(4) : Array.isArray(v) ? K(...v) : v)).join(',');
const VOID = new THREE.MeshBasicMaterial({ color: 0x050303 });

// ------------------------------------------------------------------ textures & materials

let TEX = null;
function T() {
  if (!TEX) {
    TEX = {
      skin: makeDetailTexture('skin', 31),
      bone: makeDetailTexture('bone', 37),
      leather: makeDetailTexture('leather', 41),
      cloth: makeClothTexture('#d6d2cc', 47),
      metal: makeMetalTexture('#c4c4c8', 53),
    };
  }
  return TEX;
}
const tx = (k) => ({ map: T()[k].map, normalMap: T()[k].normalMap });

const mat = {
  skin: (c, rim = 0x99aa88, rs = 0.3) => std(c, { ...tx('skin'), normalScale: 0.55, rough: 0.66, rim, rimStrength: rs }),
  bone: (c, rim = 0x8899ff, rs = 0.45) => std(c, { ...tx('bone'), normalScale: 0.9, rough: 0.58, rim, rimStrength: rs }),
  leather: (c, rs = 0.22) => std(c, { ...tx('leather'), normalScale: 0.9, rough: 0.8, rim: 0x887766, rimStrength: rs }),
  cloth: (c, rim = 0x887799, rs = 0.25, side = THREE.FrontSide) => std(c, { ...tx('cloth'), normalScale: 0.9, rough: 0.95, rim, rimStrength: rs, side }),
  metal: (c, rough = 0.36, rim = 0xaaccff, rs = 0.35) => std(c, { ...tx('metal'), normalScale: 0.5, metal: 0.85, rough, rim, rimStrength: rs }),
  plain: (c, rough = 0.7, rim = 0x6677aa, rs = 0.25) => std(c, { rough, rim, rimStrength: rs }),
};

// ------------------------------------------------------------------ geometry helpers (cached)

// profile points [r, y] in any order (sorted bottom to top so faces point outward)
function lathe(pts, segs = 12, phiStart = 0, phiLen = TAU) {
  return G('lt' + K(pts, segs, phiStart, phiLen), () => new THREE.LatheGeometry(pts.slice().sort((a, b) => a[1] - b[1]).map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), segs, phiStart, phiLen));
}

// Limb hanging from the bone origin down to -len with rounded ends. prof: [[t, r]], t 0 (top) .. 1 (bottom).
function limb(len, prof, segs = 10, sx = 1, sz = 1) {
  return G('lb' + K(len, prof, segs, sx, sz), () => {
    const pts = [];
    const rB = prof[prof.length - 1][1], rT = prof[0][1];
    for (let k = 0; k < 4; k++) { const a = -Math.PI / 2 + (k / 4) * (Math.PI / 2); pts.push([rB * Math.cos(a), -len + rB * 0.8 * Math.sin(a)]); }
    for (let i = prof.length - 1; i >= 0; i--) pts.push([prof[i][1], -prof[i][0] * len]);
    for (let k = 1; k <= 4; k++) { const a = (k / 4) * (Math.PI / 2); pts.push([rT * Math.cos(a), rT * 0.8 * Math.sin(a)]); }
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), segs);
    if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
    return g;
  });
}

const ell = (rx, ry, rz, ws = 12, hs = 9) => G('el' + K(rx, ry, rz, ws, hs), () => new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz));
const dome = (r, theta = Math.PI / 2, ws = 12, hs = 6, sy = 1) => G('dm' + K(r, theta, ws, hs, sy), () => new THREE.SphereGeometry(r, ws, hs, 0, TAU, 0, theta).scale(1, sy, 1));
// Rounded box as a superellipsoid: indexed, smooth-shaded and cheap (about a hundred vertices).
function roundedBox(w, h, d, r, ws = 12, hs = 8) {
  const e = Math.max(0.12, Math.min(1, (r / Math.min(w, h, d)) * 2.2));
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), e);
    p.setXYZ(i, f(p.getX(i)) * w / 2, f(p.getY(i)) * h / 2, f(p.getZ(i)) * d / 2);
  }
  g.computeVertexNormals();
  return g;
}
const rbox = (w, h, d, r = 0.015, seg = 2) => G('rb' + K(w, h, d, r, seg), () => roundedBox(w, h, d, r, seg > 1 ? 12 : 8, seg > 1 ? 8 : 6));
const cyl = (rt, rb, h, segs = 8, open = false) => G('cy' + K(rt, rb, h, segs, open), () => new THREE.CylinderGeometry(rt, rb, h, segs, 1, open));
const cone = (r, h, segs = 6) => G('co' + K(r, h, segs), () => new THREE.ConeGeometry(r, h, segs));
const torus = (R, t, rs = 5, ts = 16, arc = TAU) => G('to' + K(R, t, rs, ts, arc), () => new THREE.TorusGeometry(R, t, rs, ts, arc));
const unitCyl = (r, segs = 6) => G('uc' + K(r, segs), () => new THREE.CylinderGeometry(r, r, 1, segs));
const unitTaper = (r0, r1, segs = 6) => G('ut' + K(r0, r1, segs), () => new THREE.CylinderGeometry(r1, r0, 1, segs));

function tube(key, pts, r, segs = 10, radial = 5) {
  return G('tb' + key, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), segs, r, radial, false));
}

// flat cut-out shape in the XY plane (cloth flaps, ears, blades)
function flat(key, pts) {
  return G('sh' + key, () => {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    return new THREE.ShapeGeometry(s);
  });
}

function warp(g, fn) {
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// ragged hanging cloth flap (top edge at y=0), slightly curved around the body
function flap(w, h, teeth, curve = 0.06, seed = 1) {
  return G('fl' + K(w, h, teeth, curve, seed), () => {
    const pts = [[-w / 2, 0], [w / 2, 0]];
    let r = seed * 9301;
    const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    for (let i = 0; i <= teeth * 2; i++) {
      const x = w / 2 - (i / (teeth * 2)) * w;
      const y = -h * (i % 2 === 0 ? 1 - rnd() * 0.25 : 0.72 - rnd() * 0.12);
      pts.push([x * (1 + (1 - Math.abs(y / h)) * 0.0), y]);
    }
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    const g = new THREE.ShapeGeometry(s, 2);
    return warp(g, (v) => { v.z = -((v.x / (w / 2)) ** 2) * curve + Math.sin(v.x * 30 + v.y * 6) * 0.006; });
  });
}

// both sides: s = +1 (left, +X) and -1 (right, -X)
const SIDES = [[1, 'L'], [-1, 'R']];

// ------------------------------------------------------------------ hands & feet

// Hand hanging from the wrist: palm faces the body midline, thumb forward (+Z).
function hand(rig, bone, m, s, o = {}) {
  const pw = o.w ?? 0.07, pl = o.l ?? 0.075, pt = o.t ?? 0.032;
  const n = o.fingers ?? 4, fl = o.fl ?? 0.055, fr = o.fr ?? 0.011, curl = o.curl ?? 0.5;
  rig.add(bone, rbox(pt, pl, pw, Math.min(pt, pw) * 0.45), m, 0, -pl * 0.5, 0);
  if (o.fist) {
    // curled fingers wrapped into a fist
    rig.add(bone, rbox(pt * 1.25, pl * 0.55, pw * 0.98, pt * 0.5), m, -s * pt * 0.55, -pl * 0.95, 0.002);
    for (let i = 0; i < n; i++) rig.add(bone, ell(fr * 1.25, fr * 1.25, fr * 1.25, 6, 5), m, -s * pt * 0.15, -pl * 1.1, (i / (n - 1) - 0.5) * pw * 0.8);
    rig.seg(bone, unitTaper(fr * 1.2, fr, 5), m, [-s * pt * 0.2, -pl * 0.35, pw * 0.5], [-s * pt * 1.0, -pl * 0.85, pw * 0.42]);
    return;
  }
  for (let i = 0; i < n; i++) {
    const z = n === 1 ? 0 : (i / (n - 1) - 0.5) * pw * 0.82;
    const len = fl * (1 - Math.abs(i / Math.max(1, n - 1) - 0.4) * 0.25);
    const a = [0, -pl * 0.95, z];
    const mid = [-s * Math.sin(curl * 0.6) * len * 0.55, a[1] - Math.cos(curl * 0.6) * len * 0.55, z];
    const tip = [mid[0] - s * Math.sin(curl * 1.4) * len * 0.5, mid[1] - Math.cos(curl * 1.4) * len * 0.5, z];
    rig.seg(bone, unitTaper(fr, fr * 0.9, 5), m, a, mid);
    rig.seg(bone, unitTaper(fr * 0.9, fr * 0.75, 5), m, mid, tip);
    if (o.claw) {
      const d = [tip[0] - mid[0], tip[1] - mid[1], tip[2] - mid[2]];
      const dl = Math.hypot(...d);
      rig.seg(bone, unitTaper(fr * 0.8, 0.001, 4), o.claw, tip, [tip[0] + (d[0] / dl) * (o.clawLen ?? 0.04), tip[1] + (d[1] / dl) * (o.clawLen ?? 0.04), tip[2]]);
    }
  }
  // thumb
  rig.seg(bone, unitTaper(fr * 1.15, fr * 0.85, 5), m, [-s * pt * 0.1, -pl * 0.25, pw * 0.45], [-s * pt * 0.9, -pl * 0.7, pw * 0.62]);
  if (o.claw) rig.seg(bone, unitTaper(fr * 0.7, 0.001, 4), o.claw, [-s * pt * 0.9, -pl * 0.7, pw * 0.62], [-s * pt * 1.3, -pl * 0.95, pw * 0.66]);
}

// Bare foot / boot from the ankle; gy = ground height in bone space.
function foot(rig, bone, m, gy, o = {}) {
  const w = o.w ?? 0.085, l = o.l ?? 0.21, h = o.h ?? 0.06;
  rig.add(bone, ell(w * 0.55, h * 0.75, w * 0.7, 10, 7), m, 0, gy + h * 0.65, -0.015);
  rig.add(bone, rbox(w, h, l * 0.75, Math.min(w, h) * 0.45), m, 0, gy + h * 0.5, l * 0.28);
  if (o.toes) {
    const n = o.toes;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1) - 0.5) * w * 0.8;
      rig.add(bone, ell(w / (n * 1.6), h * 0.32, 0.03, 6, 5), m, x, gy + h * 0.3, l * 0.66);
      if (o.claw) rig.seg(bone, unitTaper(w / (n * 2.2), 0.001, 4), o.claw, [x, gy + h * 0.3, l * 0.68], [x, gy + 0.008, l * 0.66 + 0.05]);
    }
  } else rig.add(bone, ell(w * 0.5, h * 0.48, l * 0.18, 10, 6), m, 0, gy + h * 0.45, l * 0.62);
}

// ------------------------------------------------------------------ skeleton

function boneShaft(len, r0, r1, rEnd) {
  return limb(len, [[0, r0], [0.1, r0 * 0.7], [0.3, r1], [0.7, r1], [0.9, rEnd * 0.75], [1, rEnd]], 8);
}

// rib arc around the torso: starts at the spine (back) and ends near the sternum
function rib(rx, rz, droop, s) {
  return tube('rib' + K(rx, rz, droop, s), Array.from({ length: 7 }, (_, i) => {
    const a = -Math.PI / 2 + 0.28 + (i / 6) * (Math.PI - 0.72);
    const t = i / 6;
    return [s * rx * Math.cos(a), -droop * t * t, rz * Math.sin(a)];
  }), 0.011, 12, 4);
}

function buildSkeleton(opts) {
  const rig = new Rig({ scale: opts.scale || 1, shoulderW: 0.2 });
  const P = rig.P;
  const bone = mat.bone(opts.tint || 0xdccfb2);
  const gy = -(P.hipH - P.thigh - P.shin);
  // pelvis: sacrum, flared iliac wings, pubic arch
  rig.add('pelvis', rbox(0.08, 0.12, 0.045, 0.018), bone, 0, 0.03, -0.055, 0.35, 0, 0);
  for (const [s] of SIDES) {
    rig.add('pelvis', ell(0.085, 0.07, 0.022, 10, 7), bone, s * 0.085, 0.05, -0.01, 0, s * 0.75, s * 0.25);
    rig.add('pelvis', ell(0.034, 0.034, 0.034, 8, 6), bone, s * 0.1, -0.015, 0.01);
  }
  rig.add('pelvis', torus(0.06, 0.016, 5, 10, Math.PI), bone, 0, 0.0, 0.045, 0.25, 0, Math.PI);
  // lumbar vertebrae
  for (let i = 0; i < 5; i++) {
    const y = 0.03 + i * 0.052;
    rig.add('spine', cyl(0.028, 0.03, 0.034, 8), bone, 0, y, -0.035);
    rig.add('spine', rbox(0.075, 0.014, 0.018, 0.006), bone, 0, y, -0.04);
    rig.add('spine', rbox(0.014, 0.028, 0.04, 0.006), bone, 0, y - 0.005, -0.07, -0.4, 0, 0);
  }
  // thorax: spine, ribs, sternum, clavicles, scapulae
  for (let i = 0; i < 5; i++) rig.add('chest', cyl(0.026, 0.028, 0.036, 8), bone, 0, -0.02 + i * 0.055, -0.075);
  for (let i = 0; i < 6; i++) {
    const y = 0.215 - i * 0.042;
    const w = 0.115 + Math.sin((i / 5) * Math.PI) * 0.025 + (i < 2 ? -0.02 + i * 0.01 : 0);
    for (const [s] of SIDES) rig.add('chest', rib(w, 0.1 + i * 0.002, 0.045, s), bone, 0, y, -0.012);
  }
  rig.add('chest', rbox(0.038, 0.17, 0.02, 0.008), bone, 0, 0.13, 0.085, -0.15, 0, 0);
  for (const [s] of SIDES) {
    rig.seg('chest', unitCyl(0.011, 6), bone, [s * 0.02, 0.225, 0.085], [s * 0.19, 0.24, 0.0]);
    rig.add('chest', ell(0.058, 0.075, 0.012, 8, 6), bone, s * 0.1, 0.17, -0.1, 0, s * 0.35, 0);
  }
  // neck
  for (let i = 0; i < 3; i++) rig.add('neck', cyl(0.02, 0.022, 0.026, 7), bone, 0, -0.02 + i * 0.032, -0.012);
  // skull
  const hd = 'head';
  rig.add(hd, ell(0.102, 0.108, 0.122, 14, 10), bone, 0, 0.165, -0.015);
  rig.add(hd, rbox(0.165, 0.03, 0.05, 0.012), bone, 0, 0.16, 0.08);
  rig.add(hd, rbox(0.115, 0.075, 0.08, 0.025), bone, 0, 0.09, 0.055);
  for (const [s] of SIDES) {
    rig.add(hd, ell(0.03, 0.02, 0.04, 8, 6), bone, s * 0.062, 0.1, 0.06);
    rig.add(hd, ell(0.03, 0.029, 0.018, 8, 6), VOID, s * 0.042, 0.128, 0.104);
    rig.add(hd, rbox(0.012, 0.03, 0.05, 0.005), bone, s * 0.085, 0.07, 0.02);
  }
  rig.add(hd, cone(0.016, 0.034, 3), VOID, 0, 0.086, 0.107, Math.PI, 0, 0);
  // teeth & jaw
  for (let i = 0; i < 6; i++) {
    const a = (i / 5 - 0.5) * 1.6;
    rig.add(hd, rbox(0.013, 0.018, 0.008, 0.003), bone, Math.sin(a) * 0.045, 0.05, 0.085 + Math.cos(a) * 0.012);
    rig.add(hd, rbox(0.012, 0.016, 0.008, 0.003), bone, Math.sin(a) * 0.04, 0.025, 0.08 + Math.cos(a) * 0.012);
  }
  rig.add(hd, tube('skJaw', [[0.055, 0.075, -0.0], [0.05, 0.02, 0.03], [0.03, 0.005, 0.075], [0, 0.0, 0.088], [-0.03, 0.005, 0.075], [-0.05, 0.02, 0.03], [-0.055, 0.075, 0]], 0.014, 14, 5), bone, 0, 0, 0);
  rig.add(hd, rbox(0.04, 0.025, 0.02, 0.008), bone, 0, 0.004, 0.088);
  eyes(rig, opts.eyeColor || 0x66ccff, 0.014, 0.042, 0.128, 0.098);
  // limbs
  for (const [s, S] of SIDES) {
    rig.add('shoulder' + S, ell(0.035, 0.035, 0.035, 8, 6), bone, 0, 0, 0);
    rig.add('shoulder' + S, boneShaft(P.upper, 0.03, 0.017, 0.028), bone, 0, -0.01, 0);
    rig.add('elbow' + S, boneShaft(P.fore, 0.02, 0.011, 0.016), bone, s * 0.012, 0, 0.008);
    rig.add('elbow' + S, boneShaft(P.fore * 0.97, 0.016, 0.009, 0.013), bone, -s * 0.01, -0.005, -0.006);
    hand(rig, 'hand' + S, bone, s, { w: 0.06, l: 0.05, t: 0.022, fl: 0.06, fr: 0.0075, curl: S === 'R' ? 1.1 : 0.6 });
    rig.add('hip' + S, ell(0.038, 0.038, 0.038, 8, 6), bone, 0, 0, 0);
    rig.add('hip' + S, boneShaft(P.thigh, 0.032, 0.02, 0.034), bone, 0, -0.01, 0);
    rig.add('knee' + S, ell(0.022, 0.026, 0.012, 8, 6), bone, 0, 0.0, 0.035);
    rig.add('knee' + S, boneShaft(P.shin, 0.028, 0.016, 0.02), bone, 0, 0, 0);
    rig.add('knee' + S, boneShaft(P.shin * 0.95, 0.012, 0.008, 0.012), bone, s * 0.022, -0.01, -0.012);
    foot(rig, 'foot' + S, bone, gy, { w: 0.07, l: 0.19, h: 0.04, toes: 4 });
  }
  if (opts.armor) {
    const rust = mat.metal(0x7a6250, 0.55, 0xffaa88, 0.25);
    rig.add('chest', lathe([[0.13, -0.02], [0.155, 0.08], [0.16, 0.18], [0.12, 0.27], [0.06, 0.3]], 12, -Math.PI / 2, Math.PI), rust, 0, 0, 0.0);
    rig.add('chest', rbox(0.02, 0.26, 0.02, 0.008), rust, 0, 0.14, 0.155);
    rig.add('head', dome(0.13, Math.PI / 2, 12, 6, 0.95), rust, 0, 0.17, -0.012);
    rig.add('head', rbox(0.02, 0.09, 0.02, 0.008), rust, 0, 0.14, 0.12);
    rig.add('shoulderL', dome(0.08, Math.PI / 2, 10, 5), rust, 0.01, 0.01, 0, 0, 0, -0.5);
    rig.add('pelvis', torus(0.13, 0.016, 5, 16), mat.leather(0x4a3424), 0, 0.06, 0, Math.PI / 2, 0, 0);
    rig.add('pelvis', flap(0.14, 0.32, 3, 0.03, 2), mat.cloth(0x4a2224, 0x886688, 0.2, THREE.DoubleSide), 0, 0.06, 0.12);
  }
  if (opts.crown) {
    rig.add('head', cyl(0.115, 0.12, 0.07, 12, true), sharedAssets().gold, 0, 0.255, -0.01);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      rig.add('head', cone(0.022, 0.08, 4), sharedAssets().gold, Math.sin(a) * 0.115, 0.32, Math.cos(a) * 0.115 - 0.01);
    }
  }
  if (opts.cape) {
    const cape = rig.add('chest', flap(0.5, 1.15, 5, 0.12, 5), mat.cloth(0x3a0a12, 0xff6666, 0.2, THREE.DoubleSide), 0, 0.26, -0.13, 0.12, Math.PI, 0);
    void cape;
  }
  rig.basePose = { shoulderL: [0.05, 0, 0.12], shoulderR: [0.05, 0, -0.12], elbowL: [-0.25, 0, 0], elbowR: [0.1, 0, 0], neck: [0.12, 0, 0] };
  return rig;
}

// ------------------------------------------------------------------ goblin

function buildGoblin(opts) {
  const rig = new Rig({ scale: opts.scale || 0.72, headR: 0.17, torso: 0.48, shoulderW: 0.19, upper: 0.32, fore: 0.3, thigh: 0.37, shin: 0.38, hipH: 0.81 });
  const P = rig.P;
  const gy = -(P.hipH - P.thigh - P.shin);
  const skin = mat.skin(opts.tint || 0x46602c, 0xbbff88, 0.3);
  const leather = mat.leather(0x5e3e26);
  const dark = mat.leather(0x2e2018);
  const teeth = mat.plain(0xe8dcb0, 0.5);
  const iron = mat.metal(0x6a5e52, 0.55, 0xffcc99, 0.2);
  // hips: leather breeches, belt, ragged loincloth
  rig.add('pelvis', ell(0.15, 0.11, 0.12, 12, 8), leather, 0, -0.01, 0);
  rig.add('pelvis', torus(0.145, 0.022, 5, 18), dark, 0, 0.05, 0.005, Math.PI / 2, 0, 0);
  rig.add('pelvis', rbox(0.06, 0.05, 0.02, 0.01), iron, 0, 0.05, 0.15);
  rig.add('pelvis', flap(0.15, 0.24, 2, 0.04, 3), mat.cloth(0x6a5a3a, 0x998866, 0.2, THREE.DoubleSide), 0, 0.03, 0.135);
  rig.add('pelvis', flap(0.18, 0.2, 3, 0.05, 4), mat.cloth(0x5a4a2e, 0x998866, 0.2, THREE.DoubleSide), 0, 0.03, -0.13, 0, Math.PI, 0);
  // pot belly and wiry chest
  rig.add('spine', lathe([[0.001, -0.02], [0.11, 0.0], [0.155, 0.1], [0.15, 0.2], [0.12, 0.27]], 14), skin, 0, 0, 0.025).scale.set(1.05, 1, 0.95);
  rig.add('chest', lathe([[0.12, -0.08], [0.15, 0.04], [0.16, 0.15], [0.12, 0.22], [0.06, 0.25], [0.001, 0.26]], 14), skin, 0, 0, 0).scale.set(1.1, 1, 0.82);
  for (const [s] of SIDES) {
    rig.add('chest', ell(0.07, 0.065, 0.07, 10, 8), skin, s * 0.16, 0.19, 0);
    rig.add('chest', ell(0.06, 0.04, 0.03, 8, 6), skin, s * 0.06, 0.13, 0.11, 0, 0, s * 0.2);
  }
  // crossing leather strap and a fang necklace
  rig.seg('chest', unitCyl(0.018, 5), dark, [0.15, 0.22, 0.06], [-0.13, -0.05, 0.13]);
  rig.seg('chest', unitCyl(0.018, 5), dark, [0.15, 0.22, -0.06], [-0.13, -0.05, -0.12]);
  rig.add('chest', torus(0.08, 0.008, 4, 14), dark, 0, 0.225, 0.015, Math.PI / 2 - 0.35, 0, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 1.4;
    rig.add('chest', cone(0.01, 0.045, 4), teeth, Math.sin(a) * 0.08, 0.185 - Math.abs(Math.sin(a)) * 0.02, 0.06 + Math.cos(a) * 0.035, Math.PI, 0, 0);
  }
  rig.add('neck', cyl(0.06, 0.07, 0.1, 8), skin, 0, 0.02, 0.0);
  // head: broad skull, heavy brow, hooked nose, underbite fangs, big ears
  const hd = 'head';
  rig.add(hd, ell(0.155, 0.14, 0.15, 14, 10), skin, 0, 0.15, -0.01);
  rig.add(hd, ell(0.125, 0.075, 0.115, 12, 8), skin, 0, 0.07, 0.055);
  rig.add(hd, rbox(0.25, 0.045, 0.07, 0.02), skin, 0, 0.185, 0.115, 0.35, 0, 0);
  rig.add(hd, G('gobNose', () => warp(new THREE.ConeGeometry(0.04, 0.17, 7, 4), (v) => { const t = (0.085 - v.y) / 0.17; v.z += t * t * 0.05; })), skin, 0, 0.12, 0.19, Math.PI / 2 + 0.35, 0, 0);
  rig.add(hd, rbox(0.13, 0.02, 0.03, 0.008), VOID, 0, 0.055, 0.162);
  for (const [s] of SIDES) {
    rig.add(hd, cone(0.012, 0.045, 4), teeth, s * 0.04, 0.07, 0.165, -0.15, 0, 0);
    rig.add(hd, G('gobEar', () => warp(new THREE.ConeGeometry(0.065, 0.32, 6, 3), (v) => { v.z *= 0.35; })), skin, s * 0.2, 0.17, -0.03, 0, 0, s * (-Math.PI / 2 + 0.35));
    rig.add(hd, ell(0.02, 0.016, 0.016, 6, 5), skin, s * 0.05, 0.215, 0.12);
  }
  rig.add(hd, ell(0.012, 0.012, 0.012, 6, 5), skin, 0.07, 0.24, 0.07);
  rig.add(hd, ell(0.015, 0.015, 0.015, 6, 5), skin, -0.1, 0.09, 0.1);
  eyes(rig, 0xffdd33, 0.026, 0.068, 0.155, 0.145);
  for (const [s, S] of SIDES) {
    rig.add('shoulder' + S, limb(P.upper, [[0, 0.05], [0.25, 0.052], [0.65, 0.038], [1, 0.033]], 9), skin);
    rig.add('elbow' + S, ell(0.034, 0.034, 0.034, 8, 6), skin, 0, 0, -0.008);
    rig.add('elbow' + S, limb(P.fore, [[0, 0.034], [0.3, 0.042], [0.8, 0.03], [1, 0.028]], 9), skin);
    rig.add('elbow' + S, lathe([[0.044, -0.02], [0.047, 0.05], [0.042, 0.11]], 9), dark, 0, -P.fore * 0.75, 0);
    hand(rig, 'hand' + S, skin, s, { w: 0.075, l: 0.06, t: 0.032, fingers: 3, fl: 0.07, fr: 0.012, curl: S === 'R' ? 1.2 : 0.7, claw: teeth, clawLen: 0.025 });
    rig.add('hip' + S, limb(P.thigh, [[0, 0.075], [0.35, 0.068], [1, 0.048]], 9), leather);
    rig.add('knee' + S, ell(0.042, 0.045, 0.045, 8, 6), skin, 0, 0, 0.012);
    rig.add('knee' + S, limb(P.shin, [[0, 0.044], [0.3, 0.05], [1, 0.032]], 9), skin);
    rig.add('knee' + S, torus(0.036, 0.012, 4, 10), mat.cloth(0x6a5a3a), 0, -P.shin * 0.85, 0, Math.PI / 2, 0, 0);
    foot(rig, 'foot' + S, skin, gy, { w: 0.1, l: 0.24, h: 0.05, toes: 3, claw: teeth });
  }
  rig.basePose = { spine: [0.18, 0, 0], neck: [-0.25, 0, 0], shoulderL: [-0.15, 0, 0.18], shoulderR: [-0.15, 0, -0.18], elbowL: [-0.5, 0, 0], elbowR: [-0.5, 0, 0], hipL: [-0.2, 0, 0.06], hipR: [-0.2, 0, -0.06], kneeL: [0.32, 0, 0], kneeR: [0.32, 0, 0], footL: [-0.1, 0, 0], footR: [-0.1, 0, 0] };
  return rig;
}

// ------------------------------------------------------------------ ghoul

function buildGhoul(opts) {
  const rig = new Rig({ scale: opts.scale || 1.0, upper: 0.36, fore: 0.37, torso: 0.5, shoulderW: 0.18 });
  const P = rig.P;
  const gy = -(P.hipH - P.thigh - P.shin);
  const skin = mat.skin(opts.tint || 0x58654f, 0x99ffcc, 0.32);
  const rag = mat.cloth(0x3a3430, 0x887766, 0.15, THREE.DoubleSide);
  const nail = mat.plain(0x1e1c16, 0.4);
  const teeth = mat.plain(0xd8d0a8, 0.5);
  rig.add('pelvis', ell(0.12, 0.085, 0.09, 12, 8), skin, 0, 0, 0);
  rig.add('pelvis', torus(0.12, 0.012, 4, 14), mat.leather(0x2a2018), 0, 0.04, 0, Math.PI / 2, 0, 0);
  rig.add('pelvis', flap(0.16, 0.3, 3, 0.04, 6), rag, 0, 0.04, 0.09);
  rig.add('pelvis', flap(0.18, 0.26, 3, 0.05, 7), rag, 0, 0.04, -0.09, 0, Math.PI, 0);
  // gaunt waist with vertebrae ridge
  rig.add('spine', lathe([[0.001, -0.02], [0.085, 0.0], [0.078, 0.12], [0.1, 0.26]], 12), skin, 0, 0, 0).scale.set(1, 1, 0.75);
  for (let i = 0; i < 4; i++) rig.add('spine', ell(0.016, 0.014, 0.014, 6, 5), skin, 0, 0.04 + i * 0.06, -0.06);
  // ribcage pushing through the skin
  rig.add('chest', lathe([[0.1, -0.06], [0.14, 0.05], [0.155, 0.16], [0.12, 0.23], [0.06, 0.26], [0.001, 0.265]], 14), skin, 0, 0, 0).scale.set(1, 1, 0.72);
  for (let i = 0; i < 4; i++) for (const [s] of SIDES) rig.add('chest', rib(0.13 + Math.sin(i * 0.9) * 0.012, 0.098, 0.03, s), skin, 0, 0.16 - i * 0.045, 0.004);
  for (const [s] of SIDES) {
    rig.seg('chest', unitCyl(0.012, 5), skin, [s * 0.02, 0.23, 0.07], [s * 0.17, 0.24, 0.0]);
    rig.add('chest', ell(0.05, 0.05, 0.05, 8, 6), skin, s * 0.17, 0.215, 0);
  }
  for (let i = 0; i < 4; i++) rig.add('chest', ell(0.016, 0.014, 0.014, 6, 5), skin, 0, -0.02 + i * 0.065, -0.085);
  rig.add('neck', limb(0.1, [[0, 0.034], [1, 0.04]], 7), skin, 0, 0.09, 0);
  for (const [s] of SIDES) rig.seg('neck', unitCyl(0.009, 4), skin, [s * 0.025, 0.08, 0.02], [s * 0.04, -0.02, 0.05]);
  // head: long skull face, sunken eyes, gaping toothy jaw
  const hd = 'head';
  rig.add(hd, ell(0.1, 0.12, 0.115, 14, 10), skin, 0, 0.16, -0.01);
  rig.add(hd, rbox(0.15, 0.025, 0.05, 0.01), skin, 0, 0.165, 0.075);
  for (const [s] of SIDES) {
    rig.add(hd, ell(0.03, 0.028, 0.02, 8, 6), VOID, s * 0.04, 0.135, 0.095);
    rig.add(hd, ell(0.028, 0.035, 0.03, 8, 6), skin, s * 0.06, 0.09, 0.06);
    rig.add(hd, ell(0.006, 0.014, 0.006, 4, 4), VOID, s * 0.01, 0.1, 0.11);
  }
  rig.add(hd, ell(0.065, 0.035, 0.065, 10, 7), skin, 0, 0.075, 0.055);
  // open lower jaw
  rig.add(hd, ell(0.06, 0.03, 0.07, 10, 7), skin, 0, 0.005, 0.055, 0.35, 0, 0);
  rig.add(hd, ell(0.045, 0.035, 0.03, 8, 6), VOID, 0, 0.04, 0.085);
  for (let i = 0; i < 6; i++) {
    const x = (i / 5 - 0.5) * 0.075;
    rig.add(hd, cone(0.006, 0.026, 3), teeth, x, 0.06, 0.098, Math.PI, 0, 0);
    rig.add(hd, cone(0.006, 0.024, 3), teeth, x * 0.9, 0.022, 0.092);
  }
  for (let i = 0; i < 4; i++) rig.seg(hd, unitTaper(0.006, 0.002, 3), mat.plain(0x2a2a24, 0.9), [(i - 1.5) * 0.04, 0.25, -0.04], [(i - 1.5) * 0.06, 0.05, -0.12 - (i % 2) * 0.02]);
  eyes(rig, 0xaaff66, 0.018, 0.04, 0.135, 0.09);
  for (const [s, S] of SIDES) {
    rig.add('shoulder' + S, limb(P.upper, [[0, 0.042], [0.2, 0.044], [0.6, 0.03], [1, 0.028]], 9), skin);
    rig.add('elbow' + S, ell(0.03, 0.032, 0.03, 8, 6), skin, 0, 0, -0.01);
    rig.add('elbow' + S, limb(P.fore, [[0, 0.03], [0.25, 0.034], [0.8, 0.022], [1, 0.02]], 9), skin);
    hand(rig, 'hand' + S, skin, s, { w: 0.07, l: 0.07, t: 0.022, fingers: 4, fl: 0.1, fr: 0.0085, curl: 0.9, claw: nail, clawLen: 0.06 });
    rig.add('hip' + S, limb(P.thigh, [[0, 0.055], [0.3, 0.05], [1, 0.034]], 9), skin);
    rig.add('knee' + S, ell(0.036, 0.04, 0.038, 8, 6), skin, 0, 0, 0.012);
    rig.add('knee' + S, limb(P.shin, [[0, 0.035], [0.25, 0.04], [1, 0.026]], 9), skin);
    foot(rig, 'foot' + S, skin, gy, { w: 0.08, l: 0.22, h: 0.04, toes: 4, claw: nail });
  }
  rig.add('chest', flap(0.12, 0.4, 2, 0.03, 9), rag, -0.12, 0.22, -0.06, 0, Math.PI * 0.8, 0.2);
  rig.basePose = { spine: [0.05, 0, 0], chest: [0.1, 0, 0], neck: [-0.1, 0, 0], shoulderL: [-0.35, 0, 0.12], shoulderR: [-0.35, 0, -0.12], elbowL: [-0.45, 0, 0], elbowR: [-0.45, 0, 0], hipL: [-0.15, 0, -0], hipR: [-0.15, 0, -0], kneeL: [0.25, 0, 0], kneeR: [0.25, 0, 0] };
  return rig;
}

// ------------------------------------------------------------------ brute

function buildBrute(opts) {
  const rig = new Rig({ scale: opts.scale || 1.35, torso: 0.62, shoulderW: 0.33, hipW: 0.14, upper: 0.32, fore: 0.32, headR: 0.12, hipH: 0.9 });
  const P = rig.P;
  const gy = -(P.hipH - P.thigh - P.shin);
  const skin = mat.skin(opts.tint || 0x5b6b3a, 0xffaa66, 0.2);
  const leather = mat.leather(0x4a3020);
  const dark = mat.leather(0x2a1c14);
  const iron = mat.metal(0x8a8078, 0.5, 0xffccaa, 0.25);
  const tusk = mat.bone(0xeee6cc, 0xffeecc, 0.2);
  // hips: heavy belt with a skull buckle, leather kilt
  rig.add('pelvis', lathe([[0.22, 0.09], [0.235, -0.05], [0.26, -0.2], [0.27, -0.24]], 14), leather, 0, 0, 0).scale.set(1, 1, 0.85);
  rig.add('pelvis', torus(0.225, 0.04, 6, 20), dark, 0, 0.07, 0, Math.PI / 2, 0, 0).scale.set(1, 0.85, 1);
  rig.add('pelvis', ell(0.06, 0.065, 0.04, 10, 8), tusk, 0, 0.07, 0.2);
  for (const [s] of SIDES) rig.add('pelvis', ell(0.016, 0.016, 0.01, 6, 5), VOID, s * 0.022, 0.08, 0.235);
  // gut, barrel chest, pecs, trapezius hump, deltoids
  rig.add('spine', ell(0.25, 0.23, 0.23, 14, 10), skin, 0, 0.16, 0.05);
  rig.add('chest', lathe([[0.2, -0.08], [0.29, 0.08], [0.31, 0.24], [0.24, 0.38], [0.12, 0.44], [0.001, 0.45]], 16), skin, 0, 0, 0).scale.set(1.15, 1, 0.78);
  for (const [s] of SIDES) {
    rig.add('chest', ell(0.13, 0.09, 0.06, 12, 8), skin, s * 0.12, 0.22, 0.2, 0.2, s * 0.25, 0);
    rig.add('chest', ell(0.14, 0.14, 0.14, 12, 9), skin, s * 0.31, 0.31, 0);
  }
  rig.add('chest', ell(0.2, 0.11, 0.14, 12, 8), skin, 0, 0.4, -0.06);
  // spiked iron pauldron on the left shoulder, chain across the chest
  rig.add('chest', dome(0.17, Math.PI / 2, 12, 6, 0.8), iron, 0.33, 0.36, 0, 0, 0, -0.55);
  for (let i = 0; i < 3; i++) rig.add('chest', cone(0.03, 0.14, 5), iron, 0.3 + i * 0.05, 0.47 - i * 0.04, -0.04 + i * 0.04, 0, 0, -0.6 - i * 0.15);
  rig.seg('chest', unitCyl(0.02, 5), dark, [0.32, 0.36, 0.08], [-0.25, 0.0, 0.2]);
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    rig.add('chest', torus(0.025, 0.007, 4, 8), iron, 0.3 - t * 0.53, 0.34 - t * 0.33, 0.13 + t * 0.07, 0, i % 2 ? 0 : Math.PI / 2, 0.55);
  }
  // scars
  for (const [x, y, a] of [[-0.12, 0.3, 0.6], [0.08, 0.1, -0.4]]) rig.add('chest', rbox(0.12, 0.008, 0.01, 0.003), mat.plain(0x8a6a5a, 0.6), x, y, 0.235, 0, 0, a);
  rig.add('neck', cyl(0.1, 0.12, 0.14, 10), skin, 0, 0.02, 0.02);
  // head: low-slung skull, slab brow, under-jaw with tusks, flat nose, top-knot
  const hd = 'head';
  rig.add(hd, rbox(0.2, 0.19, 0.2, 0.07), skin, 0, 0.1, 0.02);
  rig.add(hd, rbox(0.23, 0.1, 0.17, 0.045), skin, 0, 0.01, 0.075);
  rig.add(hd, rbox(0.235, 0.05, 0.07, 0.02), skin, 0, 0.145, 0.105, 0.25, 0, 0);
  rig.add(hd, ell(0.045, 0.03, 0.035, 8, 6), skin, 0, 0.085, 0.13);
  for (const [s] of SIDES) {
    rig.add(hd, G('bTusk', () => warp(new THREE.ConeGeometry(0.022, 0.11, 6, 3), (v) => { const t = v.y / 0.11 + 0.5; v.z -= t * t * 0.03; })), tusk, s * 0.07, 0.07, 0.15, -0.25, 0, s * 0.15);
    rig.add(hd, ell(0.025, 0.04, 0.02, 6, 5), skin, s * 0.11, 0.1, 0.0);
  }
  rig.add(hd, rbox(0.12, 0.012, 0.02, 0.004), VOID, 0, 0.035, 0.16);
  rig.add(hd, cone(0.04, 0.16, 6), mat.plain(0x1a1410, 0.9), 0, 0.23, -0.05, -0.5, 0, 0);
  rig.add(hd, torus(0.03, 0.01, 4, 8), dark, 0, 0.2, -0.03, Math.PI / 2 - 0.5, 0, 0);
  eyes(rig, 0xff5522, 0.02, 0.055, 0.11, 0.135);
  for (const [s, S] of SIDES) {
    rig.add('shoulder' + S, limb(P.upper, [[0, 0.1], [0.25, 0.118], [0.55, 0.105], [0.85, 0.082], [1, 0.078]], 11), skin);
    rig.add('elbow' + S, ell(0.075, 0.075, 0.075, 10, 7), skin);
    rig.add('elbow' + S, limb(P.fore, [[0, 0.078], [0.25, 0.094], [0.7, 0.074], [1, 0.06]], 11), skin);
    rig.add('elbow' + S, lathe([[0.085, 0.0], [0.09, 0.07], [0.082, 0.15]], 10), leather, 0, -P.fore * 0.85, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      rig.add('elbow' + S, ell(0.012, 0.012, 0.012, 5, 4), iron, Math.sin(a) * 0.09, -P.fore * 0.6, Math.cos(a) * 0.09);
    }
    hand(rig, 'hand' + S, skin, s, { w: 0.12, l: 0.1, t: 0.06, fist: true, fr: 0.022 });
    rig.add('hip' + S, limb(P.thigh, [[0, 0.12], [0.3, 0.13], [1, 0.092]], 11), leather);
    rig.add('knee' + S, ell(0.08, 0.08, 0.08, 9, 7), skin, 0, 0, 0.01);
    rig.add('knee' + S, limb(P.shin, [[0, 0.09], [0.3, 0.098], [1, 0.07]], 11), skin);
    for (let i = 0; i < 3; i++) rig.add('knee' + S, torus(0.083 - i * 0.004, 0.014, 4, 12), mat.cloth(0x6a5a44), 0, -P.shin * (0.55 + i * 0.13), 0, Math.PI / 2, 0, 0);
    foot(rig, 'foot' + S, dark, gy, { w: 0.15, l: 0.27, h: 0.085 });
  }
  if (opts.apron) {
    const apron = std(0x6a5040, { ...tx('leather'), normalScale: 0.9, rough: 0.7, side: THREE.DoubleSide, rimStrength: 0.2 });
    rig.add('spine', flap(0.46, 0.85, 4, 0.08, 11), apron, 0, 0.32, 0.27, 0.08, 0, 0);
    rig.seg('chest', unitCyl(0.014, 4), dark, [0.2, 0.1, 0.24], [0.08, 0.42, 0.06]);
    rig.seg('chest', unitCyl(0.014, 4), dark, [-0.2, 0.1, 0.24], [-0.08, 0.42, 0.06]);
  }
  rig.basePose = { spine: [0.12, 0, 0], neck: [-0.15, 0, 0], shoulderL: [-0.05, 0, 0.28], shoulderR: [-0.05, 0, -0.28], elbowL: [-0.35, 0, 0], elbowR: [-0.35, 0, 0], hipL: [0, 0, 0.08], hipR: [0, 0, -0.08] };
  return rig;
}

// ------------------------------------------------------------------ cultist

function robeSkirt(r0, r1, len, folds) {
  return G('rs' + K(r0, r1, len, folds), () => {
    const pts = [];
    for (let i = 8; i >= 0; i--) {
      const t = i / 8;
      pts.push(new THREE.Vector2(r0 + (r1 - r0) * Math.pow(t, 1.3), -len * t));
    }
    const g = new THREE.LatheGeometry(pts, 28);
    return warp(g, (v) => {
      const a = Math.atan2(v.x, v.z);
      const depth = Math.max(0, -v.y / len);
      const k = 1 + Math.sin(a * folds) * 0.07 * depth;
      v.x *= k; v.z *= k;
      if (depth > 0.97) v.y += Math.sin(a * folds * 0.5 + 1) * 0.02;
    });
  });
}

function buildCultist(opts) {
  const rig = new Rig({ scale: opts.scale || 1.0, shoulderW: 0.19 });
  const P = rig.P;
  const gy = -(P.hipH - P.thigh - P.shin);
  const robe = mat.cloth(opts.tint || 0x3c1a40, 0xff66aa, 0.35, THREE.DoubleSide);
  const robeDark = mat.cloth(0x1e0e20, 0xff66aa, 0.2, THREE.DoubleSide);
  const gold = std(0xc8902c, { metal: 0.9, rough: 0.3, rim: 0xffcc66, rimStrength: 0.3, env: 1 });
  const flesh = mat.skin(0xb8a090, 0xffaa88, 0.25);
  const maskMat = mat.bone(0xe0d4b8, 0xff8866, 0.35);
  const gem = new THREE.MeshStandardMaterial({ color: 0xff4422, emissive: 0xff3311, emissiveIntensity: 2.4, roughness: 0.2 });
  // flowing robe with hem trim
  rig.add('pelvis', robeSkirt(0.17, 0.38, 0.92, 7), robe, 0, 0.06, 0);
  rig.add('pelvis', torus(0.37, 0.016, 4, 28), gold, 0, -0.85, 0, Math.PI / 2, 0, 0);
  rig.add('spine', lathe([[0.16, -0.04], [0.165, 0.12], [0.17, 0.27]], 14), robe, 0, 0, 0).scale.set(1, 1, 0.9);
  // rope sash with hanging tails and a bound talisman
  rig.add('spine', torus(0.172, 0.018, 5, 18), gold, 0, 0.03, 0, Math.PI / 2, 0, 0);
  rig.seg('spine', unitCyl(0.012, 4), gold, [0.06, 0.02, 0.16], [0.09, -0.3, 0.2]);
  rig.seg('spine', unitCyl(0.012, 4), gold, [0.03, 0.02, 0.17], [0.03, -0.25, 0.21]);
  rig.add('spine', rbox(0.06, 0.08, 0.025, 0.006), mat.leather(0x3a2214), 0.1, -0.33, 0.2, 0, 0, 0.1);
  rig.add('chest', lathe([[0.17, -0.06], [0.205, 0.12], [0.21, 0.24], [0.12, 0.3], [0.001, 0.31]], 14), robe, 0, 0, 0).scale.set(1.05, 1, 0.85);
  // short shoulder mantle with dagged edge
  rig.add('chest', G('mantle', () => warp(new THREE.LatheGeometry([[0.29, -0.04], [0.25, 0.1], [0.15, 0.27], [0.1, 0.31]].map(([r, y]) => new THREE.Vector2(r, y)), 24), (v) => {
    const a = Math.atan2(v.x, v.z);
    if (v.y < 0) v.y += Math.abs(Math.sin(a * 6)) * 0.05;
  })), robeDark, 0, 0.05, 0).scale.set(1.08, 1, 0.9);
  rig.add('chest', torus(0.05, 0.008, 4, 12), gold, 0, 0.17, 0.185, -0.25, 0, 0);
  rig.add('chest', ell(0.028, 0.034, 0.016, 8, 6), gem, 0, 0.17, 0.19);
  // hood with a pointed back, shadowed face and a bone mask
  const hd = 'head';
  rig.add(hd, G('hood', () => warp(new THREE.LatheGeometry([[0.2, -0.04], [0.19, 0.06], [0.175, 0.2], [0.12, 0.3], [0.03, 0.37], [0.001, 0.38]].map(([r, y]) => new THREE.Vector2(r, y)), 20, 0.75, TAU - 1.5), (v) => {
    v.z -= Math.max(0, v.y - 0.15) * 0.55;
  })), robe, 0, 0.02, 0.0);
  rig.add(hd, ell(0.11, 0.13, 0.08, 10, 8), VOID, 0, 0.14, 0.03);
  rig.add(hd, G('cuMask', () => warp(new THREE.SphereGeometry(1, 12, 10, Math.PI / 2 - 0.9, 1.8, 0.35, 1.9), (v) => { v.x *= 0.085; v.y *= 0.11; v.z *= 0.06; })), maskMat, 0, 0.13, 0.055);
  for (const [s] of SIDES) rig.add(hd, ell(0.018, 0.012, 0.01, 6, 5), VOID, s * 0.033, 0.145, 0.112);
  rig.add(hd, rbox(0.01, 0.06, 0.006, 0.003), mat.plain(0x8a1a1a, 0.8), 0, 0.1, 0.118);
  eyes(rig, opts.eyeColor || 0xff3322, 0.012, 0.033, 0.145, 0.12);
  for (const [s, S] of SIDES) {
    rig.add('shoulder' + S, limb(P.upper, [[0, 0.07], [0.5, 0.068], [1, 0.07]], 10), robe);
    rig.add('elbow' + S, lathe([[0.095, -P.fore - 0.03], [0.085, -P.fore * 0.6], [0.072, -P.fore * 0.2], [0.07, 0.02]], 12), robe, 0, 0, -0.01).scale.set(1, 1, 1.15);
    rig.add('elbow' + S, torus(0.094, 0.009, 4, 14), gold, 0, -P.fore - 0.025, -0.01, Math.PI / 2, 0, 0).scale.set(1, 1.15, 1);
    rig.add('elbow' + S, limb(P.fore * 0.9, [[0, 0.03], [1, 0.024]], 8), flesh);
    hand(rig, 'hand' + S, flesh, s, { w: 0.055, l: 0.055, t: 0.02, fingers: 4, fl: 0.07, fr: 0.0075, curl: S === 'R' ? 1.15 : 0.5 });
    rig.add('hip' + S, limb(P.thigh, [[0, 0.06], [1, 0.045]], 8), robeDark);
    rig.add('knee' + S, limb(P.shin, [[0, 0.045], [1, 0.035]], 8), robeDark);
    rig.add('foot' + S, G('slipper', () => warp(new THREE.SphereGeometry(1, 10, 7), (v) => { v.x *= 0.045; v.y *= 0.03; v.z *= 0.12; if (v.z > 0.05) v.y += (v.z - 0.05) * 0.5; })), mat.leather(0x1a1010), 0, gy + 0.03, 0.05);
  }
  rig.basePose = { neck: [0.1, 0, 0], shoulderL: [-0.1, 0, 0.1], shoulderR: [-0.15, 0, -0.08], elbowL: [-0.35, 0, 0], elbowR: [-0.4, 0, 0] };
  return rig;
}

// ------------------------------------------------------------------ knight

function buildKnight(opts) {
  const rig = new Rig({ scale: opts.scale || 1.08, shoulderW: 0.24, torso: 0.58 });
  const P = rig.P;
  const gy = -(P.hipH - P.thigh - P.shin);
  const steel = mat.metal(opts.tint || 0x8e939c, 0.32, 0xaaccff, 0.4);
  const darkSteel = mat.metal(0x3a3a42, 0.5, 0x8899bb, 0.25);
  const chain = std(0x5a5a62, { map: T().cloth.map, normalMap: T().cloth.normalMap, normalScale: 1.5, metal: 0.7, rough: 0.55, rim: 0x8899bb, rimStrength: 0.2 });
  const cloth = mat.cloth(opts.tabard || 0x6a1a1a, 0xff8888, 0.2, THREE.DoubleSide);
  const leather = mat.leather(0x2e2018);
  const gold = std(0xb8902c, { metal: 0.9, rough: 0.32, rim: 0xffcc66, rimStrength: 0.25 });
  // hips: mail skirt, layered faulds, belt
  rig.add('pelvis', lathe([[0.19, 0.06], [0.205, -0.1], [0.235, -0.3]], 16), chain, 0, 0, 0).scale.set(1, 1, 0.82);
  for (let i = 0; i < 3; i++) rig.add('pelvis', lathe([[0.205 + i * 0.012, 0.0], [0.22 + i * 0.012, -0.07]], 16, -Math.PI * 0.62, Math.PI * 1.24), steel, 0, 0.06 - i * 0.065, 0).scale.set(1, 1, 0.85);
  rig.add('pelvis', torus(0.2, 0.018, 4, 18), leather, 0, 0.07, 0, Math.PI / 2, 0, 0).scale.set(1, 0.85, 1);
  rig.add('pelvis', rbox(0.06, 0.05, 0.02, 0.008), gold, 0, 0.07, 0.17);
  // torso: gambeson, plackart, breastplate with a keel ridge, gorget
  rig.add('spine', lathe([[0.16, -0.02], [0.165, 0.14], [0.18, 0.28]], 14), leather, 0, 0, 0).scale.set(1, 1, 0.8);
  for (let i = 0; i < 2; i++) rig.add('spine', lathe([[0.175 + i * 0.008, 0.0], [0.185 + i * 0.008, 0.08]], 16, -Math.PI * 0.6, Math.PI * 1.2), steel, 0, 0.06 + i * 0.08, 0).scale.set(1, 1, 0.82);
  rig.add('chest', lathe([[0.18, -0.06], [0.235, 0.1], [0.23, 0.22], [0.15, 0.3], [0.1, 0.31]], 18), steel, 0, 0, 0).scale.set(1, 1, 0.8);
  rig.add('chest', rbox(0.025, 0.3, 0.03, 0.01), steel, 0, 0.1, 0.18, -0.12, 0, 0);
  rig.add('chest', lathe([[0.13, 0.27], [0.115, 0.33], [0.1, 0.37]], 14), darkSteel, 0, 0, 0);
  // tabard front and back
  rig.add('chest', flap(0.24, 0.72, 2, 0.04, 13), cloth, 0, 0.22, 0.195, -0.06, 0, 0);
  rig.add('chest', flap(0.26, 0.7, 2, 0.04, 14), cloth, 0, 0.22, -0.19, 0.05, Math.PI, 0);
  rig.add('chest', G('emblem', () => new THREE.OctahedronGeometry(0.035, 0).scale(1, 1.4, 0.3)), gold, 0, 0.1, 0.215);
  // layered pauldrons
  for (const [s] of SIDES) {
    rig.add('chest', dome(0.14, Math.PI / 2, 12, 6, 0.85), steel, s * 0.26, 0.26, 0, 0, 0, -0.55 * s);
    rig.add('chest', lathe([[0.145, 0], [0.155, -0.05]], 12, s > 0 ? 0 : Math.PI, Math.PI), steel, s * 0.27, 0.2, 0, 0, 0, -0.55 * s);
  }
  // helm: great helm, eye slit, breaths, crest
  const hd = 'head';
  rig.add(hd, lathe([[0.125, -0.04], [0.135, 0.08], [0.132, 0.2], [0.11, 0.27], [0.06, 0.305], [0.001, 0.31]], 16), steel, 0, 0, 0);
  rig.add(hd, rbox(0.19, 0.02, 0.05, 0.006), VOID, 0, 0.165, 0.112);
  rig.add(hd, rbox(0.02, 0.2, 0.03, 0.008), steel, 0, 0.11, 0.128);
  rig.add(hd, rbox(0.012, 0.18, 0.28, 0.006), steel, 0, 0.27, -0.01);
  for (let i = 0; i < 3; i++) for (const [s] of SIDES) rig.add(hd, ell(0.007, 0.007, 0.006, 4, 4), VOID, s * (0.04 + i * 0.022), 0.09, 0.122 - i * 0.012);
  eyes(rig, opts.eyeColor || 0xff4422, 0.014, 0.04, 0.165, 0.1);
  if (opts.plume) rig.add(hd, tube('plume', [[0, 0.3, 0.03], [0, 0.38, -0.05], [0, 0.36, -0.18], [0, 0.22, -0.3]], 0.035, 12, 6), cloth, 0, 0, 0);
  for (const [s, S] of SIDES) {
    rig.add('shoulder' + S, limb(P.upper, [[0, 0.068], [0.5, 0.064], [1, 0.058]], 10), steel);
    rig.add('elbow' + S, dome(0.062, Math.PI * 0.6, 10, 6), steel, 0, 0.0, -0.01, -Math.PI / 2 - 0.2, 0, 0);
    rig.add('elbow' + S, G('couterFan', () => new THREE.CylinderGeometry(0.06, 0.06, 0.01, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2)), steel, s * 0.055, -0.01, -0.01);
    rig.add('elbow' + S, limb(P.fore, [[0, 0.056], [0.6, 0.06], [1, 0.05]], 10), steel);
    rig.add('elbow' + S, lathe([[0.065, -P.fore + 0.06], [0.075, -P.fore - 0.01]], 12), steel);
    hand(rig, 'hand' + S, darkSteel, s, { w: 0.085, l: 0.075, t: 0.04, fist: true, fr: 0.016 });
    rig.add('hip' + S, limb(P.thigh, [[0, 0.085], [0.4, 0.083], [1, 0.068]], 10), steel);
    rig.add('knee' + S, dome(0.07, Math.PI * 0.55, 10, 6), steel, 0, 0, 0.012, Math.PI / 2 - 0.1, 0, 0);
    rig.add('knee' + S, limb(P.shin, [[0, 0.065], [0.35, 0.071], [1, 0.054]], 10), steel);
    rig.add('foot' + S, rbox(0.11, 0.075, 0.13, 0.03), steel, 0, gy + 0.045, 0.0);
    rig.add('foot' + S, G('sabaton', () => warp(roundedBox(0.1, 0.055, 0.16, 0.025), (v) => { if (v.z > 0) { const t = v.z / 0.08; v.x *= 1 - t * 0.35; v.y -= t * 0.008; } })), steel, 0, gy + 0.03, 0.1);
  }
  rig.basePose = { shoulderL: [-0.05, 0, 0.1], shoulderR: [-0.05, 0, -0.1], elbowL: [-0.2, 0, 0], elbowR: [0.1, 0, 0] };
  return rig;
}

// ------------------------------------------------------------------ bloated thrall

function buildBomber(opts) {
  const rig = new Rig({ scale: opts.scale || 0.85, torso: 0.5, shoulderW: 0.2, headR: 0.11 });
  const P = rig.P;
  const gy = -(P.hipH - P.thigh - P.shin);
  const skin = mat.skin(opts.tint || 0xa45238, 0xffaa55, 0.35);
  const stitch = mat.plain(0x1a0e0a, 0.9);
  const strap = mat.leather(0x2e2016);
  const glowMat = new THREE.MeshStandardMaterial({ color: 0xff7a20, emissive: 0xff5a10, emissiveIntensity: 2.4, roughness: 0.4 });
  const crackMat = new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff6a10, emissiveIntensity: 3, roughness: 0.5 });
  rig.add('pelvis', ell(0.13, 0.09, 0.1, 10, 8), strap, 0, 0, 0);
  // the swollen, stitched, glowing gut
  const belly = rig.add('spine', G('boBelly', () => warp(new THREE.SphereGeometry(0.3, 18, 14), (v) => {
    v.z *= 1.05;
    v.multiplyScalar(1 + Math.sin(v.x * 18) * Math.sin(v.y * 15) * 0.035 + Math.max(0, v.z) * 0.12);
  })), skin, 0, 0.22, 0.07);
  void belly;
  // a point on the belly's surface (bone space), pushed out a little
  const onBelly = (x, y, out = 0.004) => {
    const dy = y - 0.22, r2 = 0.09 - x * x - dy * dy;
    const z = r2 > 0 ? Math.sqrt(r2) * 1.05 * (1 + Math.sqrt(r2) * 0.12) : 0;
    return [x, y, 0.07 + z + out];
  };
  const core = rig.add('spine', ell(0.17, 0.17, 0.09, 12, 9), glowMat, ...onBelly(0, 0.22, -0.05));
  rig.glowCore = core;
  for (const [x, y, a, l] of [[-0.12, 0.33, 0.5, 0.16], [0.13, 0.11, -0.7, 0.14], [0.02, 0.4, 0.0, 0.1], [-0.17, 0.12, 1.1, 0.12], [0.18, 0.3, 2.2, 0.1]]) {
    const p = onBelly(x, y);
    rig.add('spine', rbox(l, 0.014, 0.014, 0.006), crackMat, p[0], p[1], p[2], -(y - 0.22) * 2.8, x * 3.2, a);
  }
  // stitched seam down one side
  for (let i = 0; i < 8; i++) {
    const y = 0.05 + i * 0.045;
    const p = onBelly(0.19, y, 0.006);
    rig.add('spine', rbox(0.055, 0.008, 0.012, 0.003), stitch, p[0], p[1], p[2], -(y - 0.22) * 2.5, 0.65, 0.2);
  }
  for (let i = 0; i < 5; i++) {
    const p = onBelly(-0.22 + i * 0.1, 0.05 + (i % 2) * 0.33, 0.0);
    rig.add('spine', ell(0.024, 0.024, 0.018, 6, 5), crackMat, ...p);
  }
  // harness straps over the belly
  for (const [s] of SIDES) rig.seg('spine', unitCyl(0.016, 5), strap, [s * 0.2, 0.5, 0.05], [-s * 0.18, -0.02, 0.2]);
  rig.add('chest', ell(0.15, 0.13, 0.12, 12, 9), skin, 0, 0.18, -0.03);
  for (const [s] of SIDES) rig.add('chest', ell(0.06, 0.055, 0.06, 8, 6), skin, s * 0.17, 0.21, -0.02);
  rig.add('neck', cyl(0.045, 0.05, 0.08, 7), skin, 0, 0.02, 0);
  const hd = 'head';
  rig.add(hd, ell(0.1, 0.105, 0.1, 12, 9), skin, 0, 0.09, 0.03);
  rig.add(hd, ell(0.065, 0.045, 0.06, 8, 6), skin, 0, 0.035, 0.07);
  rig.add(hd, rbox(0.06, 0.014, 0.02, 0.005), VOID, 0, 0.04, 0.125);
  for (const [s] of SIDES) {
    rig.add(hd, G('boHorn', () => warp(new THREE.ConeGeometry(0.024, 0.13, 6, 3), (v) => { const t = v.y / 0.13 + 0.5; v.z -= t * t * 0.04; })), mat.bone(0x3a2a1a, 0xffaa66, 0.2), s * 0.065, 0.17, 0.0, 0, 0, -s * 0.45);
    rig.add(hd, ell(0.02, 0.012, 0.01, 6, 4), stitch, s * 0.04, 0.12, 0.115);
  }
  eyes(rig, 0xffee55, 0.018, 0.04, 0.1, 0.11);
  for (const [s, S] of SIDES) {
    rig.add('shoulder' + S, limb(P.upper, [[0, 0.042], [0.3, 0.04], [1, 0.032]], 8), skin);
    rig.add('elbow' + S, ell(0.03, 0.03, 0.03, 7, 5), skin);
    rig.add('elbow' + S, limb(P.fore, [[0, 0.032], [0.3, 0.036], [1, 0.028]], 8), skin);
    hand(rig, 'hand' + S, skin, s, { w: 0.06, l: 0.055, t: 0.025, fingers: 3, fl: 0.055, fr: 0.01, curl: 0.8 });
    rig.add('hip' + S, limb(P.thigh, [[0, 0.055], [0.3, 0.052], [1, 0.04]], 8), skin);
    rig.add('knee' + S, ell(0.038, 0.04, 0.04, 7, 5), skin);
    rig.add('knee' + S, limb(P.shin, [[0, 0.04], [0.3, 0.044], [1, 0.032]], 8), skin);
    foot(rig, 'foot' + S, skin, gy, { w: 0.085, l: 0.19, h: 0.045, toes: 3 });
  }
  rig.basePose = { spine: [-0.12, 0, 0], neck: [0.15, 0, 0], shoulderL: [0.05, 0, 0.35], shoulderR: [0.05, 0, -0.35], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0], hipL: [0, 0, 0.12], hipR: [0, 0, -0.12] };
  return rig;
}

const BUILDERS = { skeleton: buildSkeleton, goblin: buildGoblin, ghoul: buildGhoul, brute: buildBrute, cultist: buildCultist, knight: buildKnight, bomber: buildBomber };

export function buildBody(kind, opts = {}) {
  const rig = (BUILDERS[kind] || buildSkeleton)(opts);
  // same kind + same optional gear = identical geometry, so merged meshes can be shared
  rig.cacheKey = [kind, !!opts.crown, !!opts.cape, !!opts.armor, !!opts.apron, !!opts.plume].join('|');
  return rig;
}

// ------------------------------------------------------------------ enemy weapons

function bladeGeo(key, len, w, tip, taper = 0.8, depth = 0.012, notches = 0) {
  return G('ebl' + K(key, len, w, tip, taper, depth, notches), () => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    // chipped edge on one side for worn blades
    const n = Math.max(1, notches);
    for (let i = 1; i <= n; i++) {
      const y = ((len - tip) * i) / (n + 1);
      const wx = -w / 2 + (w / 2 - (w / 2) * taper) * (y / (len - tip));
      if (notches) { s.lineTo(wx, y - 0.02); s.lineTo(wx + 0.012, y - 0.008); s.lineTo(wx, y); }
    }
    s.lineTo((-w / 2) * taper, len - tip);
    s.lineTo(0, len);
    s.lineTo((w / 2) * taper, len - tip);
    s.lineTo(w / 2, 0);
    s.lineTo(-w / 2, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.5, bevelSize: depth * 0.6, bevelSegments: 1, curveSegments: 4 });
    g.translate(0, 0, -depth / 2);
    g.computeVertexNormals();
    return g;
  });
}

const WEAPONS = new Map();

// Weapons carry no per-enemy state, so each kind is built and merged once and then cloned.
export function buildEnemyWeapon(kind, scale = 1) {
  if (!WEAPONS.has(kind)) WEAPONS.set(kind, makeWeapon(kind));
  const w = WEAPONS.get(kind);
  const group = w.group.clone();
  group.scale.setScalar(scale);
  return { group, length: w.length * scale };
}

function makeWeapon(kind) {
  const A = sharedAssets();
  const g = new THREE.Group();
  const steel = mat.metal(0xa0a0a6, 0.32, 0xffe0c0, 0.3);
  const rust = mat.metal(0x7e6050, 0.6, 0xffbb99, 0.22);
  const wood = std(0x5a3a22, { map: A.darkWood.map, normalMap: A.darkWood.normalMap, rough: 0.85, rim: 0x886655, rimStrength: 0.2 });
  const wrap = mat.leather(0x3a2416);
  const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  const grip = (len, r, y = 0) => {
    add(cyl(r, r * 1.05, len, 8), wrap, 0, y, 0);
    for (let i = 0; i < 4; i++) add(torus(r * 1.08, r * 0.25, 3, 8), wrap, 0, y - len / 2 + ((i + 0.5) / 4) * len, 0, Math.PI / 2 + 0.3, 0, 0);
  };
  let length = 0.9;
  switch (kind) {
    case 'sword':
      add(bladeGeo('esw', 0.82, 0.065, 0.15, 0.8, 0.012, 2), rust, 0, 0.1, 0);
      add(rbox(0.012, 0.6, 0.02, 0.005), A.darkMetal, 0, 0.42, 0);
      add(rbox(0.22, 0.03, 0.045, 0.01), A.darkMetal, 0, 0.09, 0);
      grip(0.16, 0.017);
      add(ell(0.026, 0.03, 0.026, 8, 6), A.darkMetal, 0, -0.1, 0);
      length = 0.92;
      break;
    case 'dagger':
      add(G('eDag', () => {
        const s = new THREE.Shape();
        s.moveTo(-0.022, 0); s.quadraticCurveTo(-0.03, 0.15, 0.012, 0.3); s.quadraticCurveTo(0.02, 0.14, 0.02, 0); s.lineTo(-0.022, 0);
        const ge = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.005, bevelSegments: 1, curveSegments: 6 });
        ge.translate(0, 0, -0.004);
        return ge;
      }), steel, 0, 0.05, 0);
      add(rbox(0.09, 0.02, 0.03, 0.008), A.darkMetal, 0, 0.045, 0);
      grip(0.1, 0.014, -0.01);
      add(ell(0.018, 0.02, 0.018, 6, 5), A.darkMetal, 0, -0.07, 0);
      length = 0.38;
      break;
    case 'club':
      add(G('eClub', () => warp(new THREE.CylinderGeometry(0.1, 0.035, 0.9, 9, 6), (v) => { const k = 1 + Math.sin(v.y * 23) * 0.08 + Math.sin(Math.atan2(v.x, v.z) * 3 + v.y * 9) * 0.06; v.x *= k; v.z *= k; })), wood, 0, 0.42, 0);
      for (let i = 0; i < 7; i++) {
        const a = i * 2.1, y = 0.55 + (i % 4) * 0.08;
        const r = 0.035 + (y - 0.0) * 0.07;
        add(cone(0.012, 0.09, 4), A.darkMetal, Math.cos(a) * r, y, Math.sin(a) * r, 0, -a, Math.PI / 2);
      }
      add(torus(0.05, 0.012, 4, 10), A.darkMetal, 0, 0.3, 0, Math.PI / 2, 0, 0);
      grip(0.18, 0.035, 0.0);
      length = 0.95;
      break;
    case 'cleaver':
      grip(0.36, 0.03, 0.05);
      add(G('eCleaver', () => {
        const s = new THREE.Shape();
        s.moveTo(-0.05, 0); s.lineTo(-0.05, 0.62); s.quadraticCurveTo(0.08, 0.86, 0.3, 0.8); s.lineTo(0.26, 0.05); s.lineTo(-0.05, 0);
        const ge = new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.01, bevelSegments: 1, curveSegments: 8 });
        ge.translate(0, 0, -0.011);
        return ge;
      }), rust, 0, 0.2, 0);
      add(cyl(0.035, 0.035, 0.03, 8), A.darkMetal, 0.17, 0.85, 0, Math.PI / 2, 0, 0);
      length = 1.0;
      break;
    case 'staff':
      add(G('eStaff', () => warp(new THREE.CylinderGeometry(0.02, 0.028, 1.6, 7, 10), (v) => { v.x += Math.sin(v.y * 4) * 0.012; v.z += Math.cos(v.y * 3) * 0.01; })), wood, 0, 0.3, 0);
      for (const y of [0.95, 1.05]) add(torus(0.026, 0.008, 4, 8), A.gold, 0, y, 0, Math.PI / 2, 0, 0);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        add(tube('stProng' + i, [[0, 1.05, 0], [Math.cos(a) * 0.05, 1.12, Math.sin(a) * 0.05], [Math.cos(a) * 0.08, 1.2, Math.sin(a) * 0.08], [Math.cos(a) * 0.04, 1.29, Math.sin(a) * 0.04]], 0.008, 8, 4), A.gold, 0, 0, 0);
      }
      add(ell(0.065, 0.065, 0.065, 12, 10), new THREE.MeshStandardMaterial({ color: 0xff5522, emissive: 0xff3311, emissiveIntensity: 3 }), 0, 1.17, 0);
      length = 1.2;
      break;
    case 'bow': {
      const curve = [[0, -0.56, -0.01], [0, -0.42, 0.06], [0, -0.2, 0.11], [0, 0, 0.12], [0, 0.2, 0.11], [0, 0.42, 0.06], [0, 0.56, -0.01]];
      add(tube('eBow', curve, 0.016, 16, 5), wood, 0, 0, 0);
      add(cyl(0.022, 0.022, 0.14, 7), wrap, 0, 0, 0.12);
      for (const y of [-0.56, 0.56]) add(cone(0.012, 0.05, 4), A.darkMetal, 0, y + Math.sign(y) * 0.02, -0.012);
      add(cyl(0.003, 0.003, 1.12, 3), std(0xdddddd, { rough: 0.6 }), 0, 0, -0.012);
      length = 0.6;
      break;
    }
    case 'shield': {
      const face = std(0x6a1a1a, { map: A.wood.map, normalMap: A.wood.normalMap, rough: 0.75, rim: 0xffaaaa, rimStrength: 0.2 });
      add(G('eShield', () => warp(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 20, 1), (v) => { const r = Math.hypot(v.x, v.z); v.y += (1 - (r / 0.34) ** 2) * 0.04 * Math.sign(v.y + 0.0001); })), face, 0, 0, 0, Math.PI / 2, 0, 0);
      add(torus(0.34, 0.022, 5, 24), A.darkMetal, 0, 0, 0);
      add(ell(0.075, 0.075, 0.05, 10, 8), A.darkMetal, 0, 0, 0.05);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        add(ell(0.014, 0.014, 0.01, 5, 4), A.darkMetal, Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0.03);
      }
      add(rbox(0.5, 0.05, 0.012, 0.005), A.darkMetal, 0, 0.0, 0.032, 0, 0, 0.7);
      length = 0.4;
      break;
    }
    case 'greatsword':
      add(bladeGeo('egs', 1.45, 0.1, 0.2, 0.82, 0.016, 0), steel, 0, 0.16, 0);
      add(rbox(0.016, 1.0, 0.03, 0.006), A.darkMetal, 0, 0.68, 0);
      add(rbox(0.44, 0.045, 0.06, 0.015), A.darkMetal, 0, 0.15, 0);
      for (const s of [-1, 1]) add(cone(0.025, 0.06, 5), A.darkMetal, s * 0.24, 0.15, 0, 0, 0, -s * Math.PI / 2);
      add(rbox(0.12, 0.08, 0.045, 0.012), A.darkMetal, 0, 0.21, 0);
      grip(0.3, 0.023, 0.0);
      add(ell(0.04, 0.05, 0.04, 8, 6), A.darkMetal, 0, -0.19, 0);
      length = 1.62;
      break;
    case 'mace':
      grip(0.2, 0.024, 0.0);
      add(cyl(0.022, 0.026, 0.5, 8), A.darkMetal, 0, 0.35, 0);
      add(G('eMaceHead', () => new THREE.IcosahedronGeometry(0.1, 1)), A.darkMetal, 0, 0.7, 0);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        add(rbox(0.018, 0.16, 0.07, 0.006), A.darkMetal, Math.cos(a) * 0.09, 0.7, Math.sin(a) * 0.09, 0, -a, 0);
      }
      add(cone(0.035, 0.1, 6), A.darkMetal, 0, 0.82, 0);
      length = 0.8;
      break;
    default:
      length = 0.3;
  }
  // one draw call per material
  return { group: mergeStatic(g), length };
}

// ------------------------------------------------------------------ slime, bat, mimic

const _place = (parent, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  parent.add(o);
  return o;
};

// Translucent ooze with the remains of earlier meals suspended inside.
export function buildSlime(scale) {
  const g = new THREE.Group();
  const s = scale * 1.1;
  const goo = std(0x52c43a, { rough: 0.12, emissive: 0x0a3a06, rim: 0xccffaa, rimStrength: 0.6 });
  goo.transparent = true;
  goo.opacity = 0.74;
  goo.depthWrite = false;
  const body = _place(g, G('slimeBody', () => warp(new THREE.SphereGeometry(0.55, 24, 16), (v) => {
    if (v.y < -0.38) v.y = -0.38 - (v.y + 0.38) * 0.3; // flattened, spreading base
    const k = 1 + Math.sin(v.x * 9 + v.z * 4) * 0.025 + Math.sin(v.y * 11) * 0.02;
    v.x *= k * (v.y < 0 ? 1.08 : 1); v.z *= k * (v.y < 0 ? 1.08 : 1);
  })), goo, 0, 0.45, 0);
  body.renderOrder = 2;
  // drips around the base
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    _place(g, ell(0.11, 0.05, 0.11, 8, 6), goo, Math.sin(a) * 0.5, 0.035, Math.cos(a) * 0.5).renderOrder = 2;
  }
  // a swallowed skull, a bone and a few bubbles
  const boneM = mat.bone(0xd0c4a4, 0xccffaa, 0.2);
  const inner = new THREE.Group();
  _place(inner, ell(0.1, 0.1, 0.11, 10, 8), boneM, 0.12, 0.38, -0.05, 0.4, 0.6, 0.2);
  for (const sx of [-1, 1]) _place(inner, ell(0.025, 0.022, 0.015, 6, 5), VOID, 0.12 + sx * 0.035, 0.39, 0.05, 0.4, 0.6, 0.2);
  _place(inner, boneShaftGeo(), boneM, -0.15, 0.3, 0.05, 0.3, 0, 1.2);
  const bub = new THREE.MeshBasicMaterial({ color: 0xc8ffb0, transparent: true, opacity: 0.45, depthWrite: false });
  for (let i = 0; i < 7; i++) _place(inner, ell(0.025 + (i % 3) * 0.012, 0.025 + (i % 3) * 0.012, 0.025 + (i % 3) * 0.012, 6, 5), bub, Math.sin(i * 2.3) * 0.28, 0.25 + (i % 4) * 0.12, Math.cos(i * 1.7) * 0.25);
  g.add(inner);
  // eyes with highlights
  const eyeW = new THREE.MeshBasicMaterial({ color: 0xf4f4ea });
  for (const x of [-0.16, 0.16]) {
    _place(g, ell(0.085, 0.09, 0.06, 10, 8), eyeW, x, 0.62, 0.43);
    _place(g, ell(0.042, 0.048, 0.03, 8, 6), VOID, x * 1.05, 0.61, 0.48);
    _place(g, ell(0.012, 0.012, 0.01, 4, 4), eyeW, x * 1.05 + 0.015, 0.635, 0.505);
  }
  g.scale.setScalar(s);
  return { group: g, body, base: s, height: 0.9 * s, flashMats: [goo] };
}

function boneShaftGeo() {
  return G('slimeBone', () => {
    const geo = limb(0.3, [[0, 0.03], [0.12, 0.016], [0.88, 0.016], [1, 0.03]], 6);
    return geo.clone().translate(0, 0.15, 0);
  });
}

// Leathery cave bat: furred body, big ears, finger-boned membrane wings.
export function buildBat(scale) {
  const g = new THREE.Group();
  const fur = mat.skin(0x3c2a30, 0xff8899, 0.42);
  const membrane = std(0x3a1e26, { rough: 0.7, side: THREE.DoubleSide, rim: 0xff6677, rimStrength: 0.35, emissive: 0x1a0406 });
  const boneM = mat.plain(0x2a1a1e, 0.6, 0xff8899, 0.3);
  const pink = mat.plain(0x8a4a52, 0.5);
  const fang = mat.plain(0xeeeedd, 0.4);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3322 });
  eyeMat.color.multiplyScalar(2);
  _place(g, ell(0.15, 0.13, 0.2, 12, 9), fur, 0, 0, 0);
  _place(g, ell(0.1, 0.09, 0.1, 10, 8), fur, 0, 0.06, 0.17);
  _place(g, ell(0.05, 0.04, 0.05, 8, 6), fur, 0, 0.04, 0.25);
  _place(g, ell(0.025, 0.03, 0.01, 6, 5), pink, 0, 0.07, 0.29);
  for (const s of [-1, 1]) {
    const ear = _place(g, G('batEar', () => warp(new THREE.ConeGeometry(0.05, 0.16, 6, 2), (v) => { v.z *= 0.4; })), fur, s * 0.055, 0.17, 0.14, -0.2, 0, -s * 0.25);
    void ear;
    _place(g, G('batEarIn', () => warp(new THREE.ConeGeometry(0.032, 0.12, 5, 1), (v) => { v.z *= 0.2; })), pink, s * 0.055, 0.165, 0.155, -0.2, 0, -s * 0.25);
    _place(g, ell(0.02, 0.02, 0.012, 6, 5), eyeMat, s * 0.04, 0.09, 0.255);
    _place(g, cone(0.008, 0.035, 4), fang, s * 0.018, 0.005, 0.27, Math.PI, 0, 0);
    // dangling feet
    const leg = [s * 0.06, -0.08, -0.12];
    const ft = [s * 0.07, -0.2, -0.16];
    const seg = new THREE.Mesh(unitCyl(0.01, 4), boneM);
    seg.position.set((leg[0] + ft[0]) / 2, (leg[1] + ft[1]) / 2, (leg[2] + ft[2]) / 2);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ft[0] - leg[0], ft[1] - leg[1], ft[2] - leg[2]).normalize());
    seg.scale.set(1, Math.hypot(ft[0] - leg[0], ft[1] - leg[1], ft[2] - leg[2]), 1);
    g.add(seg);
    for (let c = -1; c <= 1; c++) _place(g, cone(0.006, 0.03, 3), fang, ft[0] + c * 0.012, ft[1] - 0.01, ft[2] + 0.01, 0.6, 0, 0);
  }
  // wings: membrane spanning finger bones, scalloped trailing edge; built for +X, mirrored for the left
  const tips = [[0.58, 0.04], [0.5, -0.16], [0.34, -0.24], [0.17, -0.22]];
  const wrist = [0.24, 0.07];
  const wingGeo = G('batWing', () => {
    // drawn in (x, z) and laid flat; trailing finger tips have negative z (behind the body)
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.05);
    sh.lineTo(wrist[0], wrist[1]);
    sh.lineTo(tips[0][0], tips[0][1]);
    for (let i = 1; i < tips.length; i++) {
      const a = tips[i - 1], b = tips[i];
      sh.quadraticCurveTo((a[0] + b[0]) / 2 - (a[0] - wrist[0]) * 0.18, ((a[1] + b[1]) / 2) * 0.72, b[0], b[1]);
    }
    sh.quadraticCurveTo(0.08, -0.12, 0.0, -0.1);
    sh.lineTo(0, 0.05);
    const geo = new THREE.ShapeGeometry(sh, 6);
    geo.rotateX(Math.PI / 2);
    return warp(geo, (v) => { v.y -= v.x * v.x * 0.25 + Math.max(0, -v.z) * 0.06; });
  });
  const mkWing = (s) => {
    const w = new THREE.Group();
    const m = new THREE.Mesh(wingGeo, membrane);
    if (s < 0) m.scale.x = -1;
    w.add(m);
    const bone = (a, b, r) => {
      const o = new THREE.Mesh(unitCyl(r, 4), boneM);
      const d = new THREE.Vector3(s * (b[0] - a[0]), b[1] - a[1], b[2] - a[2]);
      o.position.set(s * (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      o.scale.set(1, d.length(), 1);
      w.add(o);
    };
    const W = [wrist[0], -wrist[0] * wrist[0] * 0.25, wrist[1]];
    bone([0, 0, 0.05], W, 0.012);
    for (const t of tips) bone(W, [t[0], -t[0] * t[0] * 0.25 - Math.max(0, -t[1]) * 0.06, t[1]], 0.006);
    _place(w, cone(0.01, 0.04, 3), fang, s * W[0], W[1] + 0.01, W[2] + 0.02, -0.8, 0, 0);
    w.position.x = s * 0.1;
    return w;
  };
  const wr = mkWing(1), wl = mkWing(-1);
  g.add(wl, wr);
  g.scale.setScalar(scale * 1.2);
  g.position.y = 1.8;
  return { group: g, wl, wr, height: 0.3, flashMats: [fur] };
}

// The treasure chest that bites back.
export function buildMimic(scale) {
  const A = sharedAssets();
  const g = new THREE.Group();
  const wood = std(0x9a7050, { map: A.wood.map, normalMap: A.wood.normalMap, rough: 0.8, rim: 0xff6644, rimStrength: 0.4 });
  const iron = std(0x4a4a50, { ...tx('metal'), metal: 0.8, rough: 0.45, rim: 0xff8866, rimStrength: 0.3 });
  const goldM = A.gold;
  const flesh = std(0x6a1020, { ...tx('skin'), normalScale: 0.8, rough: 0.35, emissive: 0x200004 });
  const tooth = mat.bone(0xeee6cc, 0xffccaa, 0.25);
  const tongueM = std(0xc03050, { ...tx('skin'), rough: 0.25, rim: 0xff88aa, rimStrength: 0.3 });
  const legM = mat.skin(0x4a2a2a, 0xff6644, 0.3);
  const claw = mat.plain(0x1a1210, 0.4);
  const W = 1.1, D = 0.7;
  // base: planks, iron bands and corner brackets, wet maw inside
  _place(g, rbox(W, 0.5, D, 0.03, 1), wood, 0, 0.25, 0);
  _place(g, rbox(W - 0.08, 0.06, D - 0.08, 0.02, 1), flesh, 0, 0.49, 0);
  for (const x of [-0.42, 0.42]) _place(g, rbox(0.07, 0.52, D + 0.02, 0.012, 1), iron, x, 0.25, 0);
  _place(g, rbox(W + 0.02, 0.06, D + 0.02, 0.012, 1), iron, 0, 0.05, 0);
  for (let i = 0; i < 9; i++) _place(g, cone(0.035, 0.13 - (i % 2) * 0.03, 4), tooth, -0.47 + i * 0.1175, 0.56, 0.3, 0, 0, 0);
  for (let i = 0; i < 7; i++) _place(g, cone(0.03, 0.1, 4), tooth, -0.49, 0.55, -0.25 + i * 0.08);
  for (let i = 0; i < 7; i++) _place(g, cone(0.03, 0.1, 4), tooth, 0.49, 0.55, -0.25 + i * 0.08);
  // lid with lock, eyes and its own teeth
  const lid = new THREE.Group();
  lid.position.set(0, 0.5, -0.35);
  _place(lid, rbox(W, 0.2, D, 0.05, 1), wood, 0, 0.1, D / 2);
  _place(lid, rbox(W - 0.06, 0.03, D - 0.06, 0.012, 1), flesh, 0, -0.005, D / 2);
  for (const x of [-0.42, 0.42]) _place(lid, rbox(0.07, 0.215, D + 0.02, 0.02, 1), iron, x, 0.1, D / 2);
  _place(lid, rbox(0.16, 0.14, 0.04, 0.012, 1), goldM, 0, 0.06, D + 0.01);
  _place(lid, rbox(0.03, 0.06, 0.05, 0.008, 1), VOID, 0, 0.04, D + 0.02);
  for (let i = 0; i < 9; i++) _place(lid, cone(0.035, 0.14 - (i % 2) * 0.04, 4), tooth, -0.47 + i * 0.1175, -0.07, D - 0.04, Math.PI, 0, 0);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffdd33 });
  eyeMat.color.multiplyScalar(2);
  for (const [x, y, z, r] of [[-0.3, 0.12, D, 0.05], [0.3, 0.12, D, 0.05], [-0.16, 0.2, D * 0.75, 0.032], [0.18, 0.2, D * 0.6, 0.028]]) {
    const top = y > 0.15;
    _place(lid, ell(r * 1.3, top ? r * 0.6 : r * 1.3, top ? r * 1.3 : r * 0.6, 8, 6), flesh, x, top ? 0.2 : y, top ? z : z + 0.005);
    _place(lid, ell(r, top ? r * 0.7 : r, top ? r : r * 0.7, 8, 6), eyeMat, x, top ? 0.215 : y, top ? z : z + 0.02);
  }
  g.add(lid);
  // lolling tongue
  const tongue = _place(g, tube('mimicTongue', [[0, 0.5, -0.1], [0, 0.56, 0.15], [0, 0.5, 0.38], [0.02, 0.36, 0.5], [0.04, 0.18, 0.52]], 0.055, 14, 7), tongueM, 0, 0, 0);
  tongue.scale.set(1.5, 1, 1);
  // four jointed spider legs
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const hip = [x * 0.45, 0.12, z * 0.25];
    const knee = [x * 0.68, 0.32, z * 0.42];
    const ft = [x * 0.78, -0.02, z * 0.5];
    for (const [a, b, r] of [[hip, knee, 0.045], [knee, ft, 0.035]]) {
      const o = new THREE.Mesh(unitTaper(r, r * 0.75, 6), legM);
      o.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize());
      o.scale.set(1, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), 1);
      g.add(o);
    }
    _place(g, ell(0.05, 0.05, 0.05, 7, 5), legM, ...knee);
    _place(g, cone(0.03, 0.08, 4), claw, ft[0], ft[1] + 0.02, ft[2], Math.PI, 0, 0);
  }
  g.scale.setScalar(scale);
  return { group: g, lid, tongue, height: 0.9, flashMats: [wood, legM, flesh] };
}
