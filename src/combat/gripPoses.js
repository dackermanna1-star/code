// Grip-pose library + solver for the first-person hands (fpHands.js).
// A grip is a hand placement (wrist frame relative to an anchor: the weapon
// model or one of its moving parts) plus an 18-bone finger pose. Placements
// are authored per weapon; the solver then makes the contact physical:
//   * the palm is pushed along its normal until it rests on the weapon,
//   * fingers close with a natural synergy (MCP, PIP, DIP together) and each
//     joint freezes as soon as its phalanx touches the weapon (or, for the
//     support hand of a two-handed pistol grip, the shooting hand),
//   * the index finger is solved onto the trigger face (or laid along the
//     frame for trigger discipline).
// Collision uses the actual weapon triangles (spatial hash), so the fingers
// neither float nor sink into the gun. Results are cached per model + survivor.
import * as THREE from 'three';
import { chainPoseQuat, cupQuat, mirrorQ, CHAIN_BONE, POSE_LEN, P_T, P_CUP } from './fpHands.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------ collider --
function ptTri2(px, py, pz, T, o) {
  const ax = T[o], ay = T[o + 1], az = T[o + 2], bx = T[o + 3], by = T[o + 4], bz = T[o + 5], cx = T[o + 6], cy = T[o + 7], cz = T[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); const qx = apx - v * abx, qy = apy - v * aby, qz = apz - v * abz; return qx * qx + qy * qy + qz * qz; }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); const qx = apx - w * acx, qy = apy - w * acy, qz = apz - w * acz; return qx * qx + qy * qy + qz * qz; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const qx = bpx - w * (cx - bx), qy = bpy - w * (cy - by), qz = bpz - w * (cz - bz); return qx * qx + qy * qy + qz * qz;
  }
  const dn = 1 / (va + vb + vc), v = vb * dn, w = vc * dn;
  const qx = apx - abx * v - acx * w, qy = apy - aby * v - acy * w, qz = apz - abz * v - acz * w;
  return qx * qx + qy * qy + qz * qz;
}
const CELL = 0.006;
export class Collider {
  constructor() { this.T = []; this.caps = []; this.map = null; this.stamp = null; this.gen = 0; }
  // add every visible mesh under `obj`; triangles are expressed in `frame`
  // (default: obj's parent space, i.e. obj's own transform applied)
  addObject(obj, filter, frame) {
    const m = new THREE.Matrix4(), inv = new THREE.Matrix4();
    obj.updateMatrixWorld(true);
    if (frame) inv.copy(frame); else inv.copy(obj.matrixWorld).invert().premultiply(obj.matrix);
    const v = new THREE.Vector3();
    obj.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      for (let p = o; p && p !== obj.parent; p = p.parent) if (!p.visible) return;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (mat && (mat.blending === THREE.AdditiveBlending || mat.isMeshBasicMaterial)) return;
      if (filter && !filter(o)) return;
      m.multiplyMatrices(inv, o.matrixWorld);
      const g = o.geometry, P = g.attributes.position, I = g.index;
      const n = I ? I.count : P.count;
      for (let t = 0; t < n; t++) {
        const idx = I ? I.getX(t) : t;
        v.fromBufferAttribute(P, idx).applyMatrix4(m);
        this.T.push(v.x, v.y, v.z);
      }
    });
    this.map = null;
    return this;
  }
  addCapsule(a, b, r) { this.caps.push([a.x, a.y, a.z, b.x, b.y, b.z, r]); }
  clearCapsules() { this.caps.length = 0; }
  build() {
    // dense grid (CSR) over the triangles' bounds; per-triangle AABBs for quick rejects
    const T = this.T, nt = T.length / 9;
    const Tf = this.Tf = Float32Array.from(T);
    const B = this.B = new Float32Array(nt * 6);
    let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
    for (let t = 0; t < nt; t++) {
      const o = t * 9;
      const x0 = Math.min(Tf[o], Tf[o + 3], Tf[o + 6]), x1 = Math.max(Tf[o], Tf[o + 3], Tf[o + 6]);
      const y0 = Math.min(Tf[o + 1], Tf[o + 4], Tf[o + 7]), y1 = Math.max(Tf[o + 1], Tf[o + 4], Tf[o + 7]);
      const z0 = Math.min(Tf[o + 2], Tf[o + 5], Tf[o + 8]), z1 = Math.max(Tf[o + 2], Tf[o + 5], Tf[o + 8]);
      B.set([x0, y0, z0, x1, y1, z1], t * 6);
      if (x0 < mnx) mnx = x0; if (y0 < mny) mny = y0; if (z0 < mnz) mnz = z0;
      if (x1 > mxx) mxx = x1; if (y1 > mxy) mxy = y1; if (z1 > mxz) mxz = z1;
    }
    if (!nt) { mnx = mny = mnz = 0; mxx = mxy = mxz = 0.01; }
    const C = CELL;
    this.o = [mnx - C, mny - C, mnz - C];
    const n = this.n = [Math.ceil((mxx - mnx) / C) + 3, Math.ceil((mxy - mny) / C) + 3, Math.ceil((mxz - mnz) / C) + 3];
    const cellOf = (v, a) => Math.min(n[a] - 1, Math.max(0, Math.floor((v - this.o[a]) / C)));
    const count = new Int32Array(n[0] * n[1] * n[2] + 1);
    const each = (t, fn) => {
      const i0 = cellOf(B[t * 6], 0), i1 = cellOf(B[t * 6 + 3], 0), j0 = cellOf(B[t * 6 + 1], 1), j1 = cellOf(B[t * 6 + 4], 1), k0 = cellOf(B[t * 6 + 2], 2), k1 = cellOf(B[t * 6 + 5], 2);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) fn(i + n[0] * (j + n[1] * k));
    };
    for (let t = 0; t < nt; t++) each(t, (c) => count[c + 1]++);
    for (let c = 1; c < count.length; c++) count[c] += count[c - 1];
    const fill = count.slice(0, -1), list = new Int32Array(count[count.length - 1]);
    for (let t = 0; t < nt; t++) each(t, (c) => { list[fill[c]++] = t; });
    this.start = count; this.list = list;
    this.stamp = new Uint32Array(nt);
    this.map = true;
    return this;
  }
  // distance from a point to the nearest surface (searches `reach` around it);
  // with `stopBelow`, returns as soon as something closer than that is found
  dist(x, y, z, reach = 0.012, stopBelow = -1) {
    if (!this.map) this.build();
    let best = reach * reach;
    const stop = stopBelow > 0 ? stopBelow * stopBelow : -1;
    const T = this.Tf, Bx = this.B, st = this.stamp, g = ++this.gen, n = this.n, o = this.o, C = CELL;
    const i0 = Math.max(0, Math.floor((x - reach - o[0]) / C)), i1 = Math.min(n[0] - 1, Math.floor((x + reach - o[0]) / C));
    const j0 = Math.max(0, Math.floor((y - reach - o[1]) / C)), j1 = Math.min(n[1] - 1, Math.floor((y + reach - o[1]) / C));
    const k0 = Math.max(0, Math.floor((z - reach - o[2]) / C)), k1 = Math.min(n[2] - 1, Math.floor((z + reach - o[2]) / C));
    outer: for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = i + n[0] * (j + n[1] * k);
      for (let m = this.start[c], e = this.start[c + 1]; m < e; m++) {
        const t = this.list[m];
        if (st[t] === g) continue;
        st[t] = g;
        // AABB reject
        const b = t * 6;
        const dx = x < Bx[b] ? Bx[b] - x : x > Bx[b + 3] ? x - Bx[b + 3] : 0;
        const dy = y < Bx[b + 1] ? Bx[b + 1] - y : y > Bx[b + 4] ? y - Bx[b + 4] : 0;
        const dz = z < Bx[b + 2] ? Bx[b + 2] - z : z > Bx[b + 5] ? z - Bx[b + 5] : 0;
        if (dx * dx + dy * dy + dz * dz >= best) continue;
        const d = ptTri2(x, y, z, T, t * 9);
        if (d < best) { best = d; if (d < stop) break outer; }
      }
    }
    let d = Math.sqrt(best);
    for (const c of this.caps) {
      const ux = c[3] - c[0], uy = c[4] - c[1], uz = c[5] - c[2], px = x - c[0], py = y - c[1], pz = z - c[2];
      const t = clamp((px * ux + py * uy + pz * uz) / (ux * ux + uy * uy + uz * uz), 0, 1);
      const ex = px - ux * t, ey = py - uy * t, ez = pz - uz * t;
      const dc = Math.sqrt(ex * ex + ey * ey + ez * ez) - c[6];
      if (dc < d) d = dc;
    }
    return d;
  }
  hit(x, y, z, r) { return this.dist(x, y, z, r + 0.0005, r) < r; }
}

// ------------------------------------------------------ forward kinematics --
// Mirrors FPArm.setPose/place without a scene graph (collider frame).
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();
export class HandFK {
  constructor(A, S, side) {
    this.A = A; this.S = S; this.side = side;
    const mz = side < 0 ? -1 : 1;
    this.bindQ = A.chains.map((C) => { const q = C.q.clone(); if (side < 0) mirrorQ(q); return q; });
    this.off = A.chains.map((C, c) => { const p = c >= 3 ? C.J[0].clone().sub(A.cup) : C.J[0].clone(); return new THREE.Vector3(p.x * S, p.y * S, p.z * S * mz); });
    this.cupOff = new THREE.Vector3(A.cup.x * S, A.cup.y * S, A.cup.z * S * mz);
    this.hp = new THREE.Vector3(); this.hq = new THREE.Quaternion();
    this.cp = new THREE.Vector3(); this.cq = new THREE.Quaternion();
    this.jp = A.chains.map(() => [0, 1, 2, 3].map(() => new THREE.Vector3()));
    this.jq = A.chains.map(() => [0, 1, 2].map(() => new THREE.Quaternion()));
    this.pose = new Float32Array(POSE_LEN);
  }
  set(pos, quat, pose) {
    this.hp.copy(pos); this.hq.copy(quat);
    if (pose) this.pose.set(pose);
    cupQuat(this.pose, _q); if (this.side < 0) mirrorQ(_q);
    this.cp.copy(this.cupOff).applyQuaternion(this.hq).add(this.hp);
    this.cq.copy(this.hq).multiply(_q);
    for (let c = 0; c < 5; c++) this.chain(c);
    return this;
  }
  chain(c) {
    const A = this.A, S = this.S, pose = this.pose;
    const pq = c >= 3 ? this.cq : this.hq, pp = c >= 3 ? this.cp : this.hp;
    const J = this.jp[c], Q = this.jq[c], C = A.chains[c];
    J[0].copy(this.off[c]).applyQuaternion(pq).add(pp);
    chainPoseQuat(A, pose, c, 0, _q); if (this.side < 0) mirrorQ(_q);
    Q[0].copy(pq).multiply(this.bindQ[c]).multiply(_q);
    for (let i = 1; i < 4; i++) {
      J[i].set(0, C.len[i - 1] * S, 0).applyQuaternion(Q[i - 1]).add(J[i - 1]);
      if (i < 3) { chainPoseQuat(A, pose, c, i, _q); if (this.side < 0) mirrorQ(_q); Q[i].copy(Q[i - 1]).multiply(_q); }
    }
  }
  // point in bone i of chain c's local frame (x dorsal, y along, z side), metres
  local(c, i, x, y, z, out) { return out.set(x, y, z * (this.side < 0 ? -1 : 1)).applyQuaternion(this.jq[c][i]).add(this.jp[c][i]); }
  handPoint(x, y, z, out) { return out.set(x * this.S, y * this.S, z * this.S * (this.side < 0 ? -1 : 1)).applyQuaternion(this.hq).add(this.hp); }
  // a point of the ulnar palm (moves with the cup bone)
  cupPoint(x, y, z, out) {
    const A = this.A, mz = this.side < 0 ? -1 : 1;
    return out.set((x - A.cup.x) * this.S, (y - A.cup.y) * this.S, (z - A.cup.z) * this.S * mz).applyQuaternion(this.cq).add(this.cp);
  }
}

// ------------------------------------------------------------- queries --
const SQ = 0.95; // collision radius factor: skin compresses a little against the gun
const _p = new THREE.Vector3();
// first bone of chain c (from `from`) whose phalanx touches the collider (-1: free)
function chainHit(fk, col, c, from = 0, sq = SQ) {
  const C = fk.A.chains[c], S = fk.S, J = fk.jp[c];
  // the thumb metacarpal lives inside the thenar: only its phalanges collide
  for (let i = Math.max(from, C.thumb ? 1 : 0); i < 3; i++) {
    const n = i === 2 ? 4 : 3;
    for (let s = 1; s <= n; s++) {
      const f = s / n;
      _p.copy(J[i]).lerp(J[i + 1], f);
      const r = (C.r[i] + (C.r[i + 1] - C.r[i]) * f) * S * sq * (C.thumb ? 0.95 : 0.93);
      if (col.hit(_p.x, _p.y, _p.z, r)) return i;
    }
  }
  return -1;
}
// deepest penetration of chain c (negative = inside by that much)
function chainDepth(fk, col, c, from = 0, sq = SQ, skipDistal = false) {
  const C = fk.A.chains[c], S = fk.S, J = fk.jp[c];
  let d = 1;
  for (let i = Math.max(from, C.thumb ? 1 : 0); i < (skipDistal ? 2 : 3); i++) {
    const n = i === 2 ? 4 : 3;
    for (let s = 1; s <= n; s++) {
      const f = s / n;
      _p.copy(J[i]).lerp(J[i + 1], f);
      const r = (C.r[i] + (C.r[i + 1] - C.r[i]) * f) * S * sq * (C.thumb ? 0.95 : 0.93);
      d = Math.min(d, col.dist(_p.x, _p.y, _p.z, r + 0.004) - r);
    }
  }
  return d;
}
// anatomical ranges per pose entry
const LIM_LO = new Float32Array(POSE_LEN), LIM_HI = new Float32Array(POSE_LEN);
for (let f = 0; f < 4; f++) { LIM_LO.set([-0.35, -0.25, 0, -0.1], f * 4); LIM_HI.set([0.35, 1.6, 1.9, 1.3], f * 4); }
LIM_LO.set([-0.6, -0.5, -0.4, -0.15, -0.25], P_T); LIM_HI.set([1.25, 1.25, 1.1, 0.95, 1.35], P_T);
LIM_LO[P_CUP] = 0; LIM_HI[P_CUP] = 0.5;
const lim = (i, v) => (v < LIM_LO[i] ? LIM_LO[i] : v > LIM_HI[i] ? LIM_HI[i] : v);
// coordinate descent on the listed pose entries until chain c is out of the collider
function pushOut(fk, col, c, idx, o = {}) {
  const pose = fk.pose, base = idx.map((i) => pose[i]);
  let d = chainDepth(fk, col, c, 0, SQ, o.skipDistal);
  for (let it = 0; it < 36 && d < 0; it++) {
    let best = null;
    for (let k = 0; k < idx.length; k++) for (const sg of [-1, 1]) {
      const v0 = pose[idx[k]];
      pose[idx[k]] = lim(idx[k], v0 + sg * 0.03);
      if (pose[idx[k]] === v0) continue;
      fk.chain(c);
      // prefer staying near the authored pose
      const nd = chainDepth(fk, col, c, 0, SQ, o.skipDistal) - Math.abs(pose[idx[k]] - base[k]) * 0.0004;
      if (!best || nd > best.d) best = { k, v: pose[idx[k]], d: nd };
      pose[idx[k]] = v0;
    }
    pose[idx[best.k]] = best.v;
    fk.chain(c);
    d = chainDepth(fk, col, c, 0, SQ, o.skipDistal);
  }
  fk.chain(c);
  return d;
}
// palm contact samples (unscaled hand space, just inside the palmar skin)
const PALM_PTS = [[-0.005, 0.03, 0.0], [-0.005, 0.03, -0.018], [-0.006, 0.05, 0.012], [-0.006, 0.05, -0.012], [-0.005, 0.07, 0.018], [-0.005, 0.07, -0.004],
  [-0.005, 0.068, -0.022], [-0.009, 0.042, 0.024], [-0.007, 0.045, -0.025], [-0.004, 0.012, 0.0], [0.0, 0.08, 0.026], [-0.002, 0.075, -0.03]];
export function __palmHit(fk, col) { return palmHit(fk, col); }
function palmHit(fk, col) {
  for (const p of PALM_PTS) {
    if (p[2] < -0.012) fk.cupPoint(p[0], p[1], p[2], _p); else fk.handPoint(p[0], p[1], p[2], _p);
    const r = 0.0085 * fk.S;
    if (col.hit(_p.x, _p.y, _p.z, r)) return true;
  }
  return false;
}
// which parts touch/penetrate (for diagnostics): 'palm', 'c1b2', ...
function hits(fk, col, sq = SQ * 0.85) {
  const out = [];
  if (palmHit(fk, col)) out.push('palm');
  for (let c = 0; c < 5; c++) { const h = chainHit(fk, col, c, 0, sq); if (h >= 0) out.push('c' + c + 'b' + h); }
  return out.join(',');
}

// -------------------------------------------------------------- solvers --
// Push the hand along `dir` (collider frame) until the palm touches (max travel m).
function settle(fk, col, dir, travel) {
  const p0 = fk.hp.clone(), q = fk.hq.clone();
  const at = (t) => { fk.set(_v.copy(p0).addScaledVector(dir, t), q); return palmHit(fk, col); };
  // back off until free, then advance to contact
  let t = -travel;
  if (at(t)) return false;
  const step = 0.001;
  let hit = false;
  for (; t < travel; t += step) if (at(t + step)) { hit = true; break; }
  let lo = t, hi = t + step;
  for (let i = 0; i < 5 && hit; i++) { const m = (lo + hi) / 2; if (at(m)) hi = m; else lo = m; }
  at(hit ? lo : 0);
  return hit;
}
// Close joints of chain c together (synergy ratios); each joint freezes when
// its phalanx (or any distal one) touches.
function closeChain(fk, col, c, idx, ratio, limit, sq = SQ, o_open = true) {
  const pose = fk.pose, active = [1, 1, 1];
  if (o_open) { // start from a free pose: open the joints until nothing touches
    for (let it = 0; it < 25 && chainHit(fk, col, c, 0, sq) >= 0; it++) {
      for (let j = 0; j < 3; j++) if (idx[j] >= 0) pose[idx[j]] -= 0.05 * (j === 0 ? 1 : 0.6);
      fk.chain(c);
    }
  }
  const step = 0.035;
  const save = new Float32Array(3);
  for (let it = 0; it < 120; it++) {
    let moved = false;
    for (let j = 0; j < 3; j++) save[j] = pose[idx[j]];
    for (let j = 0; j < 3; j++) if (active[j] && idx[j] >= 0) { const v = Math.min(limit[j], pose[idx[j]] + step * ratio[j]); if (v > pose[idx[j]] + 1e-6) { pose[idx[j]] = v; moved = true; } else active[j] = 0; }
    if (!moved) break;
    fk.chain(c);
    const first = active.indexOf(1);
    const h = chainHit(fk, col, c, Math.max(0, first), sq);
    if (h < 0) continue;
    // refine the step, then freeze every joint proximal to the touching phalanx
    const tgt = [pose[idx[0]], pose[idx[1]], pose[idx[2]]];
    let lo = 0, hi = 1;
    for (let b = 0; b < 5; b++) {
      const m = (lo + hi) / 2;
      for (let j = 0; j < 3; j++) if (idx[j] >= 0) pose[idx[j]] = save[j] + (tgt[j] - save[j]) * m;
      fk.chain(c);
      if (chainHit(fk, col, c, Math.max(0, first), sq) >= 0) hi = m; else lo = m;
    }
    for (let j = 0; j < 3; j++) if (idx[j] >= 0) pose[idx[j]] = save[j] + (tgt[j] - save[j]) * lo;
    fk.chain(c);
    for (let j = 0; j <= h; j++) active[j] = 0;
    if (!active.some((a) => a)) break;
  }
  fk.chain(c);
}
const FINGER_RATIO = [0.55, 1.0, 0.55], FINGER_LIMIT = [1.55, 1.9, 1.25];
// How well chain c holds on: phalanges resting on the collider, then total wrap.
function gripScore(fk, col, c) {
  const C = fk.A.chains[c], S = fk.S, J = fk.jp[c];
  let touch = 0;
  for (let i = 0; i < 3; i++) {
    let d = 1;
    const n = i === 2 ? 4 : 3;
    for (let s = 1; s <= n; s++) {
      _p.copy(J[i]).lerp(J[i + 1], s / n);
      const r = (C.r[i] + (C.r[i + 1] - C.r[i]) * s / n) * S * SQ * 0.93;
      d = Math.min(d, col.dist(_p.x, _p.y, _p.z, r + 0.004) - r);
    }
    if (d < -0.0015) return -10; // still inside
    if (d < 0.0025) touch += i === 0 ? 0.8 : 1;
  }
  return touch;
}
// Close a finger around the collider. Two strategies (all joints together, or
// hook first: curl PIP/DIP, then close the MCP so the hook swings round the
// grip), each from the first collision-free start; the one resting on more
// phalanges wins. Extending a blocked finger would only make it longer, so
// curled starts are tried before opening.
function closeFinger(fk, col, f, o = {}) {
  const c = f + 1, idx = [f * 4 + 1, f * 4 + 2, f * 4 + 3];
  const ratio = o.ratio || FINGER_RATIO, limit = o.limit || FINGER_LIMIT;
  const start = Float32Array.from(fk.pose);
  const tryStart = (m, pp, d) => { fk.pose.set(start); fk.pose[idx[0]] = m; fk.pose[idx[1]] = pp; fk.pose[idx[2]] = d; fk.chain(c); return chainHit(fk, col, c, 0, o.sq) < 0; };
  const results = [];
  const run = (strategy) => {
    if (strategy === 'hook') {
      closeChain(fk, col, c, [-1, idx[1], idx[2]], [0, 1, 0.6], [0, 1.45, 0.85], o.sq, false);
    }
    closeChain(fk, col, c, idx, ratio, limit, o.sq, false);
    const sc = gripScore(fk, col, c) + 0.05 * (fk.pose[idx[0]] + fk.pose[idx[1]] + fk.pose[idx[2]]);
    results.push({ sc, pose: Float32Array.from(fk.pose) });
  };
  const m0 = start[idx[0]], p0 = start[idx[1]], d0 = start[idx[2]];
  if (tryStart(m0, p0, d0)) run('syn');
  for (const [pp, d] of [[p0, d0], [0.8, 0.45], [1.2, 0.7]]) if (tryStart(Math.min(m0, 0.1), pp, d)) { run('hook'); break; }
  if (!results.length) { // everything touches: open until free, then close
    fk.pose.set(start); fk.chain(c);
    closeChain(fk, col, c, idx, ratio, limit, o.sq, true);
    results.push({ sc: 0, pose: Float32Array.from(fk.pose) });
  }
  results.sort((a, b) => b.sc - a.sc);
  fk.pose.set(results[0].pose);
  fk.chain(c);
}
function closeThumb(fk, col, o = {}) {
  closeChain(fk, col, 0, o.idx || [P_T, P_T + 3, P_T + 4], o.ratio || [1.0, 0.7, 0.9], o.limit || [1.1, 1.0, 1.35], o.sq);
}
// Index finger pad onto the trigger face: search MCP/PIP (DIP coupled) and splay.
function triggerIK(fk, col, target, o = {}) {
  const pose = fk.pose, C = fk.A.chains[1], S = fk.S;
  const pad = new THREE.Vector3();
  let best = null;
  const sp0 = pose[0];
  const evalAt = (sp, m, p, d) => {
    pose[0] = lim(0, sp); pose[1] = lim(1, m); pose[2] = lim(2, p); pose[3] = lim(3, d);
    fk.chain(1);
    fk.local(1, 2, -C.r[2] * 0.72 * S, C.len[2] * 0.52 * S, 0, pad);
    let e = pad.distanceTo(target);
    if (best && e >= best.e) return e; // cannot win: skip the collision tests
    if (e < 0.03) {
      if (chainHit(fk, col, 1, 0, 0.8) === 0) e += 0.02;
      const h = chainHit(fk, col, 1, 1, 0.8); if (h === 1) e += 0.01;
    } else e += 0.05;
    return e;
  };
  for (let sp = sp0 - 0.1; sp <= sp0 + 0.101; sp += 0.1)
    for (let m = 0; m <= 1.2; m += 0.08)
      for (let p = 0.2; p <= 1.7; p += 0.08) {
        const d = p * 0.45 + 0.05;
        const e = evalAt(sp, m, p, d);
        if (!best || e < best.e) best = { e, v: [sp, m, p, d] };
      }
  // local refinement
  let step = 0.03;
  for (let it = 0; it < 30; it++) {
    let improved = false;
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
      const v = best.v.slice(); v[k] += s * step;
      if (k === 3) v[3] = clamp(v[3], 0, 1.2);
      const e = evalAt(v[0], v[1], v[2], v[3]);
      if (e < best.e) { best = { e, v }; improved = true; }
    }
    if (!improved) step *= 0.5;
    if (step < 0.004) break;
  }
  [pose[0], pose[1], pose[2], pose[3]] = best.v;
  fk.chain(1);
  return best.e;
}

// Thumb tip onto a target (e.g. thumbs-forward along the frame), staying out of
// the collider and close to a natural, lightly bent thumb.
function thumbIK(fk, col, target, o = {}) {
  const pose = fk.pose, T = P_T;
  const base = [pose[T], pose[T + 1], pose[T + 2], pose[T + 3], pose[T + 4]];
  const v = base.slice();
  let best = null;
  const evalAt = (w) => {
    for (let i = 0; i < 5; i++) pose[T + i] = w[i] = lim(T + i, w[i]);
    fk.chain(0);
    let e = fk.jp[0][3].distanceTo(target) + (o.bend ?? 0.009) * (w[3] * w[3] + w[4] * w[4]) + 0.004 * Math.abs(w[2] - base[2]) + 0.002 * Math.max(0, -w[0]);
    if (best && e >= best.e) return e; // cannot win: skip the collision test
    const d = chainDepth(fk, col, 0, 1, SQ);
    if (d < 0) e += -d * 4 + 0.004;
    return e;
  };
  best = { e: evalAt(v), w: v.slice() };
  for (let f = -0.5; f <= 1.21; f += 0.12)
    for (let a = -0.5; a <= 1.21; a += 0.12)
      for (const m of [0.05, 0.35])
        for (const ip of [0.05, 0.4]) {
          const w = [f, a, base[2], m, ip];
          const e = evalAt(w);
          if (e < best.e) best = { e, w };
        }
  let step = 0.05;
  for (let it = 0; it < 60 && step > 0.004; it++) {
    let imp = false;
    for (let k = 0; k < 5; k++) for (const sg of [-1, 1]) {
      const w = best.w.slice(); w[k] += sg * step;
      const e = evalAt(w);
      if (e < best.e) { best = { e, w }; imp = true; }
    }
    if (!imp) step *= 0.5;
  }
  for (let i = 0; i < 5; i++) pose[T + i] = best.w[i];
  fk.chain(0);
  return fk.jp[0][3].distanceTo(target);
}

// ---------------------------------------------------------- pose helpers --
export function mkPose(o = {}) {
  const p = new Float32Array(POSE_LEN);
  const sp = o.spread || [0.05, 0.0, -0.05, -0.1];
  for (let f = 0; f < 4; f++) {
    p[f * 4] = sp[f];
    p[f * 4 + 1] = (o.mcp ?? [0.15, 0.15, 0.15, 0.15])[f] ?? 0.15;
    p[f * 4 + 2] = (o.pip ?? [0.15, 0.15, 0.15, 0.15])[f] ?? 0.15;
    p[f * 4 + 3] = (o.dip ?? [0.1, 0.1, 0.1, 0.1])[f] ?? 0.1;
  }
  const t = o.thumb || [0.2, 0.3, 0.3, 0.1, 0.1];
  for (let i = 0; i < 5; i++) p[P_T + i] = t[i];
  p[P_CUP] = o.cup ?? 0.1;
  return p;
}
export function lerpPose(a, b, t, out) { for (let i = 0; i < POSE_LEN; i++) out[i] = a[i] + (b[i] - a[i]) * t; return out; }
// Frame from a back-of-hand hint (X) and a knuckle direction (Y), both in the anchor frame.
export function handQuat(X, Y, out = new THREE.Quaternion()) {
  const y = _v.set(Y[0], Y[1], Y[2]).normalize().clone();
  const x = new THREE.Vector3(X[0], X[1], X[2]);
  x.addScaledVector(y, -x.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// Solve one hand. spec (all in the collider/anchor frame):
//   pos: wrist, X/Y: back-of-hand / knuckle direction hints, rot: extra euler on that frame
//   settle: travel (m) along the palm normal, pose: base mkPose() options
//   fingers: 'wrap' (index..pinky or listed), index: 'trigger' | 'wrap' | 'straight' | 'fixed',
//   thumb: 'wrap' | 'fixed' | {idx, ratio, limit}, trigger: [x,y,z]
export function solveHand(spec, col, A, S, side, probe = false) {
  const fk = new HandFK(A, S, side);
  const q = handQuat(spec.X, spec.Y);
  if (spec.rot) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(spec.rot[0], spec.rot[1], spec.rot[2])));
  const pose = spec.poseArr ? Float32Array.from(spec.poseArr) : mkPose(spec.pose);
  fk.set(new THREE.Vector3().fromArray(spec.pos), q, pose);
  const info = {};
  if (spec.settle) {
    const n = new THREE.Vector3(-1, 0, 0).applyQuaternion(q); // palm normal
    info.settled = settle(fk, col, n, spec.settle);
  }
  const fingers = spec.fingers === 'none' ? [] : spec.fingers || [0, 1, 2, 3];
  const idxMode = spec.index || 'wrap';
  if (probe) { // quick look: can the middle finger wrap below the trigger guard?
    closeFinger(fk, col, 1, spec.close);
    return { mcp: fk.pose[5], depth: chainDepth(fk, col, 2) };
  }
  for (const f of (Array.isArray(fingers) ? fingers : [0, 1, 2, 3])) {
    if (f === 0 && idxMode !== 'wrap') continue;
    closeFinger(fk, col, f, spec.close);
  }
  if (idxMode === 'trigger' && spec.trigger) info.trigErr = triggerIK(fk, col, new THREE.Vector3().fromArray(spec.trigger));
  if (idxMode === 'straight') { // along the frame: close with a straight finger until it rests on the side
    closeChain(fk, col, 1, [1, -1, -1], [1, 0, 0], [1.2, 0, 0]);
  }
  if (spec.thumb === 'oppose' && spec.axis) {
    // power grasp: the thumb wraps the other side of the handle, opposite the
    // middle finger, a little higher (towards the index); on thin handles it
    // lands on the curled fingers (they are colliders here)
    const a0 = new THREE.Vector3().fromArray(spec.axis.c), ad = new THREE.Vector3().fromArray(spec.axis.d).normalize();
    const c = 2, C = A.chains[c];
    const Mm = fk.jp[c][1].clone().lerp(fk.jp[c][2], 0.5);
    const Pa = a0.clone().addScaledVector(ad, Mm.clone().sub(a0).dot(ad));
    const u = Mm.clone().sub(Pa); const rr = u.length(); u.normalize();
    const R = Math.max(0.008, rr - C.r[1] * S);
    const up = fk.jp[1][0].clone().sub(fk.jp[3][0]).dot(ad) > 0 ? 1 : -1; // index side along the axis
    const tgt = Pa.addScaledVector(u, -(R + A.chains[0].r[3] * S * 0.9)).addScaledVector(ad, up * 0.012 * S);
    const nCaps = col.caps.length;
    for (let cc = 1; cc < 5; cc++) for (let i = 0; i < 3; i++) col.addCapsule(fk.jp[cc][i], fk.jp[cc][i + 1], A.chains[cc].r[i] * S * 0.95);
    info.thumbErr = thumbIK(fk, col, tgt, { bend: 0.004 });
    col.caps.length = nCaps;
  } else if (spec.thumb === 'over') {
    // fist grip: the thumb pad rests on the back of the index (or middle, when
    // the index is on the trigger) middle phalanx; the fingers are colliders
    const c = idxMode === 'trigger' ? 2 : 1, C = A.chains[c];
    const M = fk.jp[c][1].clone().lerp(fk.jp[c][2], 0.5);
    const Xb = new THREE.Vector3(1, 0, 0).applyQuaternion(fk.jq[c][1]);
    const tgt = M.addScaledVector(Xb, (C.r[1] + A.chains[0].r[3] * 0.8) * S);
    const nCaps = col.caps.length;
    for (let cc = 1; cc < 5; cc++) for (let i = 0; i < 3; i++) col.addCapsule(fk.jp[cc][i], fk.jp[cc][i + 1], A.chains[cc].r[i] * S * 0.95);
    info.thumbErr = thumbIK(fk, col, tgt, { bend: 0.004 });
    col.caps.length = nCaps;
  } else if (spec.thumbAt) info.thumbErr = thumbIK(fk, col, new THREE.Vector3().fromArray(spec.thumbAt));
  else if (spec.thumb === 'wrap' || typeof spec.thumb === 'object') closeThumb(fk, col, typeof spec.thumb === 'object' ? spec.thumb : {});
  else if (spec.thumb === 'rest') closeThumb(fk, col, { idx: [P_T, -1, P_T + 4], ratio: [1, 0, 0.4], limit: [1.1, 0, 0.5] }); // swing in until it lies on the gun
  // resolve any remaining penetration (fixed thumbs, trigger finger, cramped fingers)
  pushOut(fk, col, 0, [P_T, P_T + 1, P_T + 2, P_T + 3, P_T + 4]);
  for (let f = 0; f < 4; f++) pushOut(fk, col, f + 1, [f * 4, f * 4 + 1, f * 4 + 2, f * 4 + 3], { skipDistal: f === 0 && idxMode === 'trigger' });
  info.pen = hits(fk, col);
  const solved = Float32Array.from(fk.pose);
  // trigger discipline variant: index straight, resting along the frame
  let poseIdle = null;
  if (idxMode === 'trigger') {
    const save = Float32Array.from(fk.pose);
    fk.pose[0] = save[0] + 0.04; fk.pose[1] = -0.25; fk.pose[2] = 0.1; fk.pose[3] = 0.06;
    fk.chain(1);
    closeChain(fk, col, 1, [1, -1, -1], [1, 0, 0], [1.2, 0, 0]);
    pushOut(fk, col, 1, [0, 1, 2, 3]);
    poseIdle = Float32Array.from(fk.pose);
    fk.pose.set(save); fk.chain(1);
  }
  return { pos: fk.hp.clone(), quat: fk.hq.clone(), pose: solved, poseIdle, fk, info };
}
// Capsules of a solved hand (so the other hand can wrap around it)
export function handCapsules(fk, col) {
  const A = fk.A, S = fk.S;
  for (let c = 1; c < 5; c++) for (let i = 0; i < 3; i++) col.addCapsule(fk.jp[c][i], fk.jp[c][i + 1], A.chains[c].r[i] * S * 0.97);
  col.addCapsule(fk.jp[0][1], fk.jp[0][2], A.chains[0].r[1] * S);
  col.addCapsule(fk.jp[0][2], fk.jp[0][3], A.chains[0].r[2] * S);
  // back of the hand / palm slab
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (const z of [0.02, 0.0, -0.02]) { fk.handPoint(0.0, 0.02, z, a); fk.handPoint(0.0, 0.075, z, b); col.addCapsule(a, b, 0.012 * S); }
}

// =============================================================== library ==
// Placements are authored in the weapon's model frame (as weaponModels.js
// builds it: barrel along -Z, grip near the origin). 'handR' specs are given
// in the pistol-grip frame from userData.handR (grip axis +Y, front -Z, right
// side +X). X = back of the hand, Y = knuckle direction, pos = wrist centre.
const FWD_THUMB = [0.12, 0.42, 0.25, 0.08, 0.06];
const R_GRIP = (o = {}) => Object.assign({
  frame: 'handR', pos: [0.03, 0.004, 0.075], X: [1, 0, 0], Y: [0, 0.05, -1], settle: 0.04, index: 'trigger', thumb: 'oppose', axis: { c: [0, 0, 0], d: [0, 1, 0] }, autoY: true,
  pose: { spread: [0.07, 0.0, -0.04, -0.09], mcp: [0.3, 0.25, 0.25, 0.25], pip: [0.2, 0.2, 0.2, 0.2], dip: [0.1, 0.1, 0.1, 0.1], thumb: [0.25, 0.65, 0.45, 0.15, 0.2], cup: 0.18 },
  fa: [-0.1, 0.35, -1],
}, o);
// support hand wrapped around the shooting hand (two-handed pistol, thumbs forward)
const L_PISTOL = (o = {}) => Object.assign({
  frame: 'handR', pos: [-0.048, 0.008, 0.06], X: [-1, 0.0, -0.25], Y: [0.15, 0.0, -1], rot: [0.3, 0, 0], settle: 0.05, wrapOther: true, thumb: 'rest',
  pose: { spread: [0.02, 0.0, -0.03, -0.06], mcp: [0.3, 0.3, 0.3, 0.3], pip: [0.3, 0.3, 0.3, 0.3], dip: [0.15, 0.15, 0.15, 0.15], thumb: [0.0, 0.3, 0.2, 0.05, 0.05], cup: 0.1 },
  fa: [0.3, 0.35, -1],
}, o);
// support hand under a handguard / forend: palm up, thumb along the left side, fingers around the right.
// The section of the gun at z is measured from the collider (bottom, sides, top).
const L_GUARD = (z, yb, o = {}) => Object.assign({
  guard: { z, yb }, reach: 1, pos: [-0.035, yb - 0.03, z + 0.03], X: [-0.4, -0.92, 0.1], Y: [0.7, 0.3, -0.62], settle: 0.04, thumb: 'rest',
  pose: { spread: [0.02, 0.0, -0.03, -0.06], mcp: [0.25, 0.25, 0.25, 0.25], pip: [0.2, 0.2, 0.2, 0.2], dip: [0.1, 0.1, 0.1, 0.1], thumb: [-0.1, 0.35, 0.25, 0.1, 0.1], cup: 0.1 },
  fa: [0.45, 0.25, -1],
}, o);
// cross-section of the collider at depth z around a bottom point (x=0, y=yb)
function sectionAt(col, z, yb) {
  let x0 = 0, x1 = 0, y0 = yb, y1 = yb;
  for (let y = yb - 0.03; y < yb + 0.12; y += 0.002) for (let x = -0.07; x <= 0.07; x += 0.002) {
    if (col.dist(x, y, z, 0.003) < 0.0015) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  return { x0, x1, y0, y1 };
}
// vertical handle (melee / throwables / canisters) along +Y through `c`
const R_HANDLE = (c, o = {}) => Object.assign({ pos: [c[0] + 0.03, c[1] - 0.012, c[2] + 0.075], X: [1, 0, 0], Y: [0, 0.05, -1], settle: 0.05, thumb: 'oppose', axis: { c, d: [0, 1, 0] }, index: 'wrap',
  pose: { spread: [0.05, 0.0, -0.04, -0.08], mcp: [0.3, 0.3, 0.3, 0.3], pip: [0.2, 0.2, 0.2, 0.2], dip: [0.1, 0.1, 0.1, 0.1], thumb: [0.25, 0.7, 0.55, 0.15, 0.2], cup: 0.2 }, fa: [-0.1, 0.35, -1] }, o);
const L_HANDLE = (c, o = {}) => Object.assign({ pos: [c[0] - 0.03, c[1] + 0.012, c[2] + 0.075], X: [-1, 0, 0], Y: [0, -0.05, -1], settle: 0.05, thumb: 'oppose', axis: { c, d: [0, 1, 0] }, index: 'wrap',
  pose: { spread: [0.05, 0.0, -0.04, -0.08], mcp: [0.3, 0.3, 0.3, 0.3], pip: [0.2, 0.2, 0.2, 0.2], dip: [0.1, 0.1, 0.1, 0.1], thumb: [0.25, 0.7, 0.55, 0.15, 0.2], cup: 0.2 }, fa: [0.1, 0.35, -1] }, o);

export const GRIP_SPECS = {
  pistol: { R: R_GRIP({ thumb: 'fixed', thumbRel: [-0.047, 0.052, -0.1], trigger: [0, 0.001, -0.0575], pose: { spread: [0.07, 0.0, -0.04, -0.09], mcp: [0.3, 0.25, 0.25, 0.25], pip: [0.2, 0.2, 0.2, 0.2], dip: [0.1, 0.1, 0.1, 0.1], thumb: FWD_THUMB, cup: 0.18 } }), L: L_PISTOL({ thumbAt: [-0.03, 0.006, -0.068] }) },
  magnum: { R: R_GRIP({ thumb: 'fixed', thumbRel: [-0.047, 0.052, -0.1], trigger: [0, 0.001, -0.0575], pose: { spread: [0.07, 0.0, -0.04, -0.09], mcp: [0.3, 0.25, 0.25, 0.25], pip: [0.2, 0.2, 0.2, 0.2], dip: [0.1, 0.1, 0.1, 0.1], thumb: FWD_THUMB, cup: 0.18 } }), L: L_PISTOL({ thumbAt: [-0.03, 0.006, -0.068] }) },
  dualPistols: {
    R: R_GRIP({ anchor: 'right', thumbRel: [-0.047, 0.052, -0.1], trigger: [0, 0.001, -0.0575] }),
    L: R_GRIP({ anchor: 'left', thumbRel: [0.047, 0.052, -0.1], trigger: [0, 0.001, -0.0575], pos: [-0.03, 0.004, 0.075], X: [-1, 0, 0], fa: [0.1, 0.35, -1] }),
  },
  smg: { R: R_GRIP({ trigger: [0, -0.006, -0.0535] }), L: L_GUARD(-0.14, -0.005) },
  silencedSmg: { R: R_GRIP({ trigger: [0, -0.006, -0.0885] }), L: L_GUARD(-0.175, -0.01, { pos: [-0.035, -0.045, -0.15] }) },
  pumpShotgun: { R: R_GRIP({ trigger: [0, -0.009, -0.019] }), L: L_GUARD(-0.3, -0.006, { anchor: 'pump' }) },
  chromeShotgun: { R: R_GRIP({ trigger: [0, -0.009, -0.019] }), L: L_GUARD(-0.3, -0.006, { anchor: 'pump' }) },
  autoShotgun: { R: R_GRIP({ trigger: [0, -0.01, -0.0205] }), L: L_GUARD(-0.3, -0.006) },
  rifle: { R: R_GRIP({ trigger: [0, -0.005, 0.0015] }), L: L_GUARD(-0.29, 0.018) },
  scar: { R: R_GRIP({ trigger: [0, -0.007, 0.0015] }), L: L_GUARD(-0.3, 0.018) },
  huntingRifle: { R: R_GRIP({ trigger: [0, -0.015, 0.0245] }), L: L_GUARD(-0.26, 0.004) },
  m60: { R: R_GRIP({ trigger: [0, -0.006, -0.008] }), L: L_GUARD(-0.3, -0.01) },
  grenadeLauncher: { R: R_GRIP({ trigger: [0, -0.006, -0.008] }), L: L_GUARD(-0.28, 0.0) },
  fireaxe: { R: R_HANDLE([0, -0.035, 0]), L: L_HANDLE([0, 0.075, 0]) },
  crowbar: { R: R_HANDLE([0, 0.02, 0]) },
  machete: { R: R_HANDLE([0, -0.012, 0]) },
  pipebomb: { R: R_HANDLE([0, -0.01, 0], { settle: 0.06 }) },
  molotov: { R: R_HANDLE([0, -0.02, 0], { settle: 0.06 }) },
  bile: { R: R_HANDLE([0, -0.01, 0], { settle: 0.06 }) },
  pills: { R: R_HANDLE([0, 0.0, 0], { settle: 0.05 }) },
  adrenaline: { R: R_HANDLE([0, -0.02, 0], { thumb: 'fixed', pose: { spread: [0.05, 0.0, -0.04, -0.08], mcp: [0.3, 0.3, 0.3, 0.3], pip: [0.2, 0.2, 0.2, 0.2], dip: [0.1, 0.1, 0.1, 0.1], thumb: [0.25, 0.45, 0.4, 0.3, 0.35], cup: 0.2 } }) },
  medkit: {
    R: { pos: [0.16, -0.05, 0.07], X: [0.9, -0.3, 0.3], Y: [-0.3, 0.1, -1], settle: 0.06, thumb: 'wrap', index: 'wrap', pose: { thumb: [0.1, 0.3, 0.2, 0.1, 0.1] }, fa: [-0.2, 0.3, -1] },
    L: { pos: [-0.16, -0.05, 0.07], X: [-0.9, -0.3, 0.3], Y: [0.3, 0.1, -1], settle: 0.06, thumb: 'wrap', index: 'wrap', pose: { thumb: [0.1, 0.3, 0.2, 0.1, 0.1] }, fa: [0.2, 0.3, -1] },
  },
  minigun: {
    R: R_HANDLE([0.14, -0.045, 0.32], { settle: 0.05 }),
    L: L_HANDLE([-0.14, -0.045, 0.32], { settle: 0.05 }),
  },
};

// Build a solved grip set for a weapon model. Returns {R, L} with
// {anchor (Object3D), pos, quat (in the anchor's frame), pose, fa (forearm dir, model frame), info}.
const _m4 = new THREE.Matrix4(), _m5 = new THREE.Matrix4();
function restMatrix(model, obj, out) { // obj -> model-parent frame, parts at rest
  model.updateMatrixWorld(true);
  out.copy(model.matrixWorld).invert().multiply(obj.matrixWorld).premultiply(model.matrix);
  return out;
}
export function solveGrips(model, type, A, S, specs = GRIP_SPECS[type]) {
  if (!specs) return null;
  const ud = model.userData;
  const out = {};
  const cols = new Map();
  const colFor = (anchorName) => {
    const target = anchorName === 'left' || anchorName === 'right' ? ud[anchorName] : model;
    if (!cols.has(target)) cols.set(target, new Collider().addObject(target, null, restMatrix(model, target, _m4).multiply(_m5.copy(target.matrixWorld).invert()).clone()).build());
    return cols.get(target);
  };
  let rightFK = null;
  for (const side of ['R', 'L']) {
    let sp = specs[side];
    if (!sp) continue;
    const s = Object.assign({}, sp);
    // resolve the authoring frame into the model-parent frame
    const anchor = sp.anchor ? ud[sp.anchor] : model;
    let F = new THREE.Matrix4();
    if (sp.frame === 'handR') {
      const hr = ud.handR || [0, 0, 0, 0, 0, 0];
      F.compose(new THREE.Vector3(hr[0], hr[1], hr[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(hr[3], hr[4], hr[5])), new THREE.Vector3(1, 1, 1));
    }
    const host = sp.anchor === 'left' || sp.anchor === 'right' ? ud[sp.anchor] : model;
    // rigid authoring frame: origin through the (possibly scaled) model, axes
    // rotation only, so offsets stay in metres (the magnum model is scaled)
    {
      const H = restMatrix(model, host, _m4);
      const o = new THREE.Vector3().setFromMatrixPosition(F).applyMatrix4(H);
      const hq0 = new THREE.Quaternion(), hs = new THREE.Vector3(), hp = new THREE.Vector3();
      H.decompose(hp, hq0, hs);
      const fq = new THREE.Quaternion().setFromRotationMatrix(F);
      F = new THREE.Matrix4().compose(o, hq0.multiply(fq), new THREE.Vector3(1, 1, 1));
    }
    const rq = new THREE.Quaternion(), sc = new THREE.Vector3(), tp = new THREE.Vector3();
    F.decompose(tp, rq, sc);
    s.pos = new THREE.Vector3().fromArray(sp.pos).applyMatrix4(F).toArray();
    s.X = new THREE.Vector3().fromArray(sp.X).applyQuaternion(rq).toArray();
    s.Y = new THREE.Vector3().fromArray(sp.Y).applyQuaternion(rq).toArray();
    if (sp.trigger) s.trigger = new THREE.Vector3().fromArray(sp.trigger).applyMatrix4(restMatrix(model, host, _m4)).toArray();
    if (sp.axis) s.axis = { c: new THREE.Vector3().fromArray(sp.axis.c).applyMatrix4(F).toArray(), d: new THREE.Vector3().fromArray(sp.axis.d).applyQuaternion(rq).toArray() };
    if (sp.thumbAt) s.thumbAt = new THREE.Vector3().fromArray(sp.thumbAt).applyMatrix4(restMatrix(model, host, _m4)).toArray();
    const thumbRel = sp.thumbRel;
    const col = colFor(sp.anchor);
    if (sp.guard) {
      // Cradle: treat the lower forend as a cylinder (radius = half its width,
      // tangent to its bottom). The palm meets it below-left (angle th from the
      // bottom), knuckles run round it towards the right side, angled forward
      // by phi; the thumb tip lies along the left side near the top.
      const g = sp.guard, sec = sectionAt(col, g.z, g.yb);
      const R = (sec.x1 - sec.x0) / 2, xc = (sec.x0 + sec.x1) / 2, yc = sec.y0 + R;
      const th = sp.cradle ?? 0.6, phi = sp.phi ?? 0.55;
      const n = new THREE.Vector3(Math.sin(th), Math.cos(th), 0);
      const t = new THREE.Vector3(Math.cos(th), -Math.sin(th), 0);
      const Y = t.clone().multiplyScalar(Math.cos(phi)).add(new THREE.Vector3(0, 0, -Math.sin(phi)));
      const q = handQuat(n.clone().negate().toArray(), Y.toArray());
      const contact = new THREE.Vector3(xc, yc, g.z).addScaledVector(n, -(R + 0.001));
      const palmC = new THREE.Vector3(-0.0135 * S, 0.05 * S, 0.004 * S).applyQuaternion(q);
      s.pos = contact.sub(palmC).toArray();
      s.X = n.clone().negate().toArray(); s.Y = Y.toArray(); s.rot = null;
      const top = Math.min(sec.y1, sec.y0 + 0.055);
      s.thumbAt = [sec.x0 - 0.0085 * S, Math.min(top - 0.01, yc + 0.012), g.z - 0.06 * S];
    }
    // pistol grips: the highest wrist position (index closest to the trigger)
    // that still lets the middle finger wrap under the trigger guard
    if (sp.frame === 'handR' && sp.trigger && sp.autoY) {
      const Fi = F.clone().invert(), axis = new THREE.Vector3(0, 1, 0).applyQuaternion(rq);
      const tg = new THREE.Vector3().fromArray(s.trigger).applyMatrix4(Fi);
      const base = new THREE.Vector3().fromArray(s.pos).applyMatrix4(Fi);
      let chosen = null;
      for (let y = tg.y - 0.03 * S; y > tg.y - 0.08 * S; y -= 0.004) {
        const pr = solveHand(Object.assign({}, s, { pos: new THREE.Vector3(base.x, y, base.z).applyMatrix4(F).toArray() }), col, A, S, side === 'R' ? 1 : -1, true);
        if (pr.mcp > 0.42 && pr.depth > -0.001) { chosen = y; break; }
      }
      if (chosen == null) chosen = tg.y - 0.045 * S;
      s.pos = new THREE.Vector3(base.x, chosen, base.z).applyMatrix4(F).toArray();
    }
    if (thumbRel) s.thumbAt = new THREE.Vector3().fromArray(s.pos).applyMatrix4(F.clone().invert()).add(new THREE.Vector3().fromArray(thumbRel).multiplyScalar(S)).applyMatrix4(F).toArray();
    if (sp.wrapOther && rightFK) handCapsules(rightFK, col);
    const r = solveHand(s, col, A, S, side === 'R' ? 1 : -1);
    col.clearCapsules();
    if (side === 'R') rightFK = r.fk;
    // express in the anchor's frame
    const AM = restMatrix(model, anchor, _m4), aq = new THREE.Quaternion(), ap = new THREE.Vector3(), as = new THREE.Vector3();
    AM.decompose(ap, aq, as);
    const inv = AM.clone().invert();
    out[side] = {
      anchor, pos: r.pos.clone().applyMatrix4(inv), quat: aq.clone().invert().multiply(r.quat), pose: r.pose,
      poseIdle: r.poseIdle, reach: sp.reach || 0, elbow: sp.elbow || null, info: r.info,
      world: { pos: r.pos, quat: r.quat }, fk: r.fk,
    };
  }
  return out;
}
