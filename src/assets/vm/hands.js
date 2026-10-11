// Arms for the view models: khaki sleeve, olive-black fingerless gloves,
// skin finger tips. Fingers are baked into the arm node's geometry for a given
// grip (GoldSrc hands rarely change shape mid-sequence), so an arm costs three
// draw calls.
//
// Hand-local frame: wrist at the origin, fingers along -Z, palm facing -Y.
// Right hand: thumb on -X. Left hand (mirrored): thumb on +X.
// Arms are placed with intuitive vectors: where the fingers point (fwd),
// where the palm faces (palm) and where the forearm goes (fore), all in the
// parent node's frame. handPose() turns those into an Euler pose for keys.

import * as THREE from 'three';
import { box, cyl, hexa, DEG } from './builder.js';

const WHITE = [1, 1, 1];

// [x offset at the knuckle (right hand), width, thickness, segment lengths]
const FINGERS = [
  { x: -1.17, w: 0.8, t: 0.74, len: [1.75, 1.08, 0.86] }, // index
  { x: -0.39, w: 0.82, t: 0.76, len: [1.92, 1.2, 0.9] }, // middle
  { x: 0.39, w: 0.78, t: 0.72, len: [1.82, 1.12, 0.86] }, // ring
  { x: 1.1, w: 0.68, t: 0.64, len: [1.42, 0.88, 0.76] }, // pinky
];

// Finger curls [knuckle, middle, tip] in degrees (+ = toward the palm),
// spread (yaw at the knuckle, + = toward the thumb), thumb pose.
export const GRIPS = {
  grip: { f: [[78, 84, 40], [80, 86, 42], [80, 88, 44], [80, 86, 44]], spread: [2, 0, -2, -5], thumb: { yaw: 45, pitch: 30, roll: -70, c: [20, 18] } },
  trigger: { f: [[38, 58, 24], [88, 96, 56], [88, 98, 56], [88, 96, 56]], spread: [-6, 0, 2, 5], thumb: { yaw: 0, pitch: 68, roll: 180, c: [40, 15] } },
  cup: { f: [[58, 62, 34], [60, 64, 36], [62, 66, 36], [66, 66, 36]], spread: [6, 0, -3, -7], thumb: { yaw: 38, pitch: 8, roll: -40, c: [12, 10] } },
  hold: { f: [[62, 70, 36], [66, 74, 38], [70, 76, 40], [72, 76, 40]], spread: [4, 0, -3, -7], thumb: { yaw: 12, pitch: 55, roll: -80, c: [30, 25] } },
  open: { f: [[8, 10, 6], [6, 8, 6], [8, 10, 6], [10, 12, 8]], spread: [14, 4, -7, -18], thumb: { yaw: 32, pitch: -4, roll: -20, c: [8, 8] } },
  point: { f: [[4, 8, 6], [86, 92, 48], [88, 92, 48], [88, 90, 48]], spread: [0, 0, -2, -5], thumb: { yaw: 30, pitch: 30, roll: -70, c: [30, 20] } },
  pinch: { f: [[50, 60, 30], [62, 70, 36], [72, 80, 40], [80, 84, 42]], spread: [4, 0, -3, -7], thumb: { yaw: 30, pitch: 22, roll: -70, c: [16, 10] } },
  fist: { f: [[86, 94, 46], [88, 96, 46], [88, 96, 48], [88, 94, 48]], spread: [0, 0, -2, -5], thumb: { yaw: 28, pitch: 34, roll: -80, c: [22, 18] } },
  flat: { f: [[2, 2, 2], [2, 2, 2], [2, 2, 2], [2, 2, 2]], spread: [3, 0, -3, -6], thumb: { yaw: 25, pitch: 4, roll: -10, c: [4, 4] } },
};

const M = () => new THREE.Matrix4();
const rx = (d) => M().makeRotationX(d * DEG);
const ry = (d) => M().makeRotationY(d * DEG);
const rz = (d) => M().makeRotationZ(d * DEG);
const tr = (x, y, z) => M().makeTranslation(x, y, z);
const mul = (...ms) => { const o = M(); for (const m of ms) o.multiply(m); return o; };
const seg = (w, t, len, taper = 0.88) => box(w, t, len, { f: [taper, taper] });

// Rotation basis whose -Z = fwd and -Y ~ palm.
export function handBasis(fwd, palm) {
  const z = new THREE.Vector3(...fwd).normalize().negate();
  const y = new THREE.Vector3(...palm).negate();
  y.addScaledVector(z, -y.dot(z)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z);
}

// Euler (deg, YXZ) for an arm node that points its fingers along fwd with the
// palm facing `palm`.
export function handRot(fwd, palm) {
  const e = new THREE.Euler().setFromRotationMatrix(handBasis(fwd, palm), 'YXZ');
  return [e.x / DEG, e.y / DEG, e.z / DEG];
}
export function handPose(p, fwd, palm) { return { p, r: handRot(fwd, palm) }; }

// Mirroring flips triangle winding; swap two vertices per triangle.
function mirrorFix(g) {
  const out = { p: g.p.slice(), n: g.n.slice(), uv: g.uv.slice() };
  for (let t = 0; t < g.p.length / 9; t++) {
    for (const [arr, k] of [[out.p, 3], [out.n, 3], [out.uv, 2]]) {
      const b = t * 3 * k;
      for (let j = 0; j < k; j++) {
        const tmp = arr[b + k + j]; arr[b + k + j] = arr[b + 2 * k + j]; arr[b + 2 * k + j] = tmp;
      }
    }
  }
  return out;
}

/**
 * Create an arm node `name` under `parent`.
 *  side : 'R' | 'L'
 *  p    : wrist position (parent frame)
 *  fwd  : finger direction, palm: palm facing direction, fore: forearm direction (parent frame)
 *  grip : GRIPS key or object; len: forearm length; sleeve: false to skip it
 *  elbow: optional elbow point in the anchor node's frame (default 'rig'); otherwise
 *         the elbow is fore * elbowDist from the rest wrist
 */
export function arm(mb, name, parent, side, o) {
  const r = handRot(o.fwd, o.palm);
  const node = mb.node(name, parent, o.p, r);
  const B = handBasis(o.fwd, o.palm);
  const inv = B.clone().invert();
  const grip = typeof o.grip === 'object' ? o.grip : GRIPS[o.grip || 'grip'];
  const L = side === 'L';
  const S = o.scale || 1;
  const handM = M().makeScale(L ? -S : S, S, S);
  const put = (mat, tint, g, m, mirror = true) => {
    const gg = L && mirror ? mirrorFix(g) : g;
    mb.addGeo(name, mat, tint, gg, mirror ? mul(handM, m) : m);
  };

  // palm block, wider at the knuckles
  const PL = 3.35, Ww = 2.9, Wk = 3.35, T = 1.3;
  const Cn = [];
  for (let i = 0; i < 8; i++) {
    const xs = i & 1 ? 1 : -1, ys = i & 2 ? 1 : -1, zs = i & 4 ? 1 : -1;
    const atK = zs < 0;
    const w = (atK ? Wk : Ww) / 2, t = (atK ? T * 0.86 : T) / 2;
    Cn.push([xs * w + (atK ? 0.05 : 0.1), ys * t - (ys < 0 && !atK ? 0.08 : 0), atK ? -PL : 0]);
  }
  put('glove', WHITE, hexa(Cn), M());
  // padded panels on the back of the hand
  put('glove', [0.78, 0.8, 0.74], box(2.9, 0.32, 1.45, { t: [0.92, 0.85] }), tr(0.02, T * 0.43 + 0.1, -PL + 0.95));
  put('glove', [0.88, 0.9, 0.82], box(2.3, 0.26, 1.5, { t: [0.9, 0.9] }), tr(0.15, T * 0.42 + 0.08, -1.0));

  FINGERS.forEach((F, i) => {
    const [c1, c2, c3] = grip.f[i];
    let m = mul(tr(F.x, -0.05, -PL + 0.1), ry(grip.spread[i] || 0), rx(-c1));
    put('glove', WHITE, seg(F.w, F.t, F.len[0] + 0.1, 0.94), mul(m, tr(0, 0, -(F.len[0] + 0.1) / 2 + 0.1)));
    m = mul(m, tr(0, 0, -F.len[0]), rx(-c2));
    const gl = F.len[1] * 0.38;
    put('glove', [0.9, 0.92, 0.85], seg(F.w * 1.03, F.t * 1.05, gl, 0.98), mul(m, tr(0, 0, -gl / 2)));
    put('skin', WHITE, seg(F.w * 0.9, F.t * 0.9, F.len[1] - gl, 0.95), mul(m, tr(0, 0, -gl - (F.len[1] - gl) / 2)));
    m = mul(m, tr(0, 0, -F.len[1]), rx(-c3));
    put('skin', WHITE, seg(F.w * 0.85, F.t * 0.82, F.len[2], 0.78), mul(m, tr(0, 0, -F.len[2] / 2)));
  });

  // thumb from the palm's thumb side near the wrist
  const th = grip.thumb;
  let m = mul(tr(-1.25, -0.35, -0.8), ry(th.yaw), rx(-th.pitch), rz(th.roll));
  put('glove', WHITE, seg(1.0, 0.9, 1.9, 0.9), mul(m, tr(0, 0, -0.95)));
  m = mul(m, tr(0, 0, -1.9), rx(-th.c[0]));
  put('glove', [0.9, 0.92, 0.85], seg(0.86, 0.8, 0.45, 0.98), mul(m, tr(0, 0, -0.22)));
  put('skin', WHITE, seg(0.8, 0.74, 0.75, 0.94), mul(m, tr(0, 0, -0.45 - 0.37)));
  m = mul(m, tr(0, 0, -1.2), rx(-th.c[1]));
  put('skin', WHITE, seg(0.74, 0.68, 0.9, 0.8), mul(m, tr(0, 0, -0.45)));

  // forearm: glove cuff + khaki sleeve in a child node that the ViewModel
  // aims at the elbow every frame (so the sleeve always leads back to the body)
  if (o.sleeve !== false) {
    const fl = new THREE.Vector3(...(o.fore || [0, 0, 1])).transformDirection(inv);
    const fore = mb.node(name + '_fore', name, [0, 0, 0], [0, 0, 0]);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), fl.clone().normalize());
    fore.quaternion.copy(q);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    fore.userData.rest = { p: [0, 0, 0], r: [e.x / DEG, e.y / DEG, e.z / DEG] };
    const len = o.len || 16;
    const pf = mb.pen(name + '_fore');
    pf.geo('glove', [0.82, 0.85, 0.78], cyl(1.48, 1.4, 1.7, { n: 8, cap0: false, cap1: false, ry: 0.8 }), { p: [0, -0.05, 1.45] });
    pf.geo('sleeve', [0.92, 0.9, 0.86], cyl(1.74, 1.76, 0.6, { n: 8, cap0: false, ry: 0.86 }), { p: [0, 0, 1.35] });
    pf.geo('sleeve', WHITE, cyl(2.15, 1.66, len, { n: 8, cap1: false, ry: 0.86 }), { p: [0, 0, 1.0 + len] });
    // direction in the parent frame; the ViewModel converts it to an elbow point
    node.userData.arm = { fore: name + '_fore', dir: (o.fore || [0, 0, 1]).slice(), elbowDist: o.elbowDist || 18, elbow: o.elbow, anchor: o.anchor, follow: o.follow };
  }
  return node;
}
