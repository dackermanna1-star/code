// One ragdoll body: Verlet particles for the joints plus four points on the
// torso's surface (chest, pack, belly, seat), held by distance constraints.
// The torso is a rigid block. Hips, shoulders and the neck swing inside cones
// measured in the torso's frame. Knees and elbows are hinges that bend one way.
// Limbs collide with each other and with the torso, and bodies rest on one
// another. Heavy parts (pelvis, chest) take less of every correction than
// hands and feet, and each joint loses part of its swing every step, so a body
// folds and settles instead of flailing.

import * as THREE from 'three';
import { hash01 } from '../core/rng.js';
import { segSegClosest, segClosestT } from '../core/math.js';

const rand = Math.random;
const rr = (a, b) => a + (b - a) * rand();
const DEG = Math.PI / 180;

// Particles.
export const HIP_L = 0;
export const HIP_R = 1;
export const SH_L = 2;
export const SH_R = 3;
export const NECK = 4;
export const HEAD = 5;
export const EL_L = 6;
export const HA_L = 7;
export const EL_R = 8;
export const HA_R = 9;
export const KN_L = 10;
export const FT_L = 11;
export const KN_R = 12;
export const FT_R = 13;
export const GUN_A = 14;
export const GUN_B = 15;
export const CHEST = 16;
export const PACK = 17;
export const BELLY = 18;
export const SEAT = 19;
const NJ = 20;
const NP = NJ + 6; // spare roots for torn-off limbs
const RADIUS = [0.09, 0.09, 0.09, 0.09, 0.08, 0.12, 0.06, 0.05, 0.06, 0.05, 0.07, 0.06, 0.07, 0.06, 0.035, 0.035, 0.13, 0.13, 0.12, 0.11];
const MASS = [10, 10, 7, 7, 4, 5, 2, 1, 2, 1, 5, 2.5, 5, 2.5, 1.5, 1.5, 7, 5, 7, 7];
const TORSO = [HIP_L, HIP_R, SH_L, SH_R, NECK, CHEST, PACK, BELLY, SEAT];
// Particles that other bodies collide with.
const SOLID = [HIP_L, HIP_R, SH_L, SH_R, NECK, HEAD, EL_L, HA_L, EL_R, HA_R, KN_L, FT_L, KN_R, FT_R, CHEST, PACK, BELLY, SEAT];

// Segment lengths (m).
export const L_UA = 0.29;
export const L_FA = 0.29;
export const L_TH = 0.43;
export const L_SH = 0.42;
export const L_NECK = 0.19;

// Part types, each drawn by its own instanced mesh.
export const P_TORSO = 0;
export const P_HEAD = 1;
export const P_UARM = 2;
export const P_FARM = 3;
export const P_THIGH = 4;
export const P_SHIN = 5;
export const P_WEAPON = 6;
export const NTYPES = 6;
// Collision radius and length per part type.
const CAP_R = [0, 0.1, 0.055, 0.05, 0.08, 0.06];
const CAP_L = [0, L_NECK, L_UA, L_FA, L_TH, L_SH];

// Parts by index: 0 torso, 1 head, 2/3 left upper arm/forearm, 4/5 right,
// 6/7 left thigh/shin, 8/9 right, 10 weapon.
// Pairs of parts that collide (neighbours along a limb, and the head with
// the upper arms, are left to the joint limits).
const PAIRS = [
  [1, 3], [1, 5], [1, 6], [1, 7], [1, 8], [1, 9],
  [2, 4], [2, 5], [2, 6], [2, 7], [2, 8], [2, 9],
  [3, 4], [3, 5], [3, 6], [3, 7], [3, 8], [3, 9],
  [4, 6], [4, 7], [4, 8], [4, 9],
  [5, 6], [5, 7], [5, 8], [5, 9],
  [6, 8], [6, 9], [7, 8], [7, 9],
];
// Forearms and shins also collide with the torso's surface points.
const VS_TORSO = [3, 5, 7, 9];
const TORSO_BALLS = [HIP_L, HIP_R, SH_L, SH_R, CHEST, PACK, BELLY, SEAT];

// Swing limits: an elliptical cone around a centre direction in the torso
// frame (x left, y up, z forward), with half-angles in the sagittal and
// lateral directions. Right-side joints mirror x.
function cone(c, sag, lat) {
  const n = Math.hypot(c[0], c[1], c[2]);
  const cx = c[0] / n;
  const cy = c[1] / n;
  const cz = c[2] / n;
  let ex = 1 - cx * cx;
  let ey = -cx * cy;
  let ez = -cx * cz;
  const m = Math.hypot(ex, ey, ez);
  ex /= m;
  ey /= m;
  ez /= m;
  return { c: [cx, cy, cz], e1: [cy * ez - cz * ey, cz * ex - cx * ez, cx * ey - cy * ex], e2: [ex, ey, ez], a1: sag * DEG, a2: lat * DEG };
}
// Hips: 145 degrees of flexion (the rigid torso stands in for the spine
// bending too), 25 of extension.
const HIP_CONE = cone([0.15, -0.5, 0.87], 85, 55);
const SHOULDER_CONE = cone([0.62, -0.28, 0.5], 110, 110);
const NECK_CONE = cone([0, 1, 0.22], 50, 38);
// [joint, child, part, cone, x sign]
const CONES = [
  [HIP_L, KN_L, 6, HIP_CONE, 1],
  [HIP_R, KN_R, 8, HIP_CONE, -1],
  [SH_L, EL_L, 2, SHOULDER_CONE, 1],
  [SH_R, EL_R, 4, SHOULDER_CONE, -1],
  [NECK, HEAD, 1, NECK_CONE, 1],
];
// Hinges: [parent joint, joint, child, parent part, part, bend side, min and
// max bend (rad), sideways slack (fraction of the bone), twist slot]. Knees
// bend backwards, elbows forwards (the upper arm's roll is free, so elbows
// only refuse to bend back).
const HINGES = [
  [HIP_L, KN_L, FT_L, 6, 7, -1, -0.03, 2.6, 0.12, 0],
  [HIP_R, KN_R, FT_R, 8, 9, -1, -0.03, 2.6, 0.12, 1],
  [SH_L, EL_L, HA_L, 2, 3, 1, -0.3, 2.6, 1, -1],
  [SH_R, EL_R, HA_R, 4, 5, 1, -0.3, 2.6, 1, -1],
];
// Bones whose swing is damped relative to their parent: [parent, child, part].
const BONES = [
  [SH_L, EL_L, 2], [EL_L, HA_L, 3], [SH_R, EL_R, 4], [EL_R, HA_R, 5],
  [HIP_L, KN_L, 6], [KN_L, FT_L, 7], [HIP_R, KN_R, 8], [KN_R, FT_R, 9],
  [NECK, HEAD, 1],
];

const GRAVITY = 9.81;
export const STEP = 1 / 60;
const ITER = 6;
const SLEEP_V = 0.0025; // m per step
const JOINT_DAMP = 0.045;

// ----------------------------------------------------------------- scratch

const _o = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _t = new THREE.Vector3();
const _c = new Float64Array(3);
const _e1 = new Float64Array(3);
const _e2 = new Float64Array(3);
const _ax = new Float64Array(6); // hinge frame: forward, then lateral

// Torso-frame vector v (x mirrored by mx) in world space.
function toWorld(F, v, mx, out) {
  const x = v[0] * mx;
  out[0] = F[0] * x + F[3] * v[1] + F[6] * v[2];
  out[1] = F[1] * x + F[4] * v[1] + F[7] * v[2];
  out[2] = F[2] * x + F[5] * v[1] + F[8] * v[2];
}

export class Ragdoll {
  constructor(u, variant, weapon) {
    this.u = u;
    this.faction = u.faction;
    this.seed = hash01(u.id, 7);
    this.variant = variant;
    this.weapon = weapon;
    this.p = new Float32Array(NP * 3);
    this.o = new Float32Array(NP * 3);
    this.r = new Float32Array(NP);
    this.w = new Float32Array(NP);
    this.floor = new Float32Array(NP);
    this.np = NJ;
    for (let i = 0; i < NJ; i++) {
      this.r[i] = RADIUS[i];
      this.w[i] = 1 / MASS[i];
    }
    // Torso frame (x, y, z axes) and how far each leg is turned out.
    this.F = new Float64Array(9);
    this.twist = [rr(0.05, 0.5), -rr(0.05, 0.5)];
    // Sticks: a, b, rest length, min-only flag, parts whose loss removes it.
    this.sticks = [];
    this.parts = [];
    this.stumps = [];
    this.structs = [];
    this.nbrs = [];
    this.nbrT = 0;
    this.mats = new Float32Array(11 * 16);
    this.sleeping = false;
    this.still = 0;
    this.age = 0;
    this.writheT = rr(0.5, 1.5);
    this.pooled = false;
    this.dirty = true;
    this.cx = u.pos.x;
    this.cy = u.pos.y;
    this.cz = u.pos.z;
    this.radius = 2;
  }

  set(i, x, y, z) {
    const k = i * 3;
    this.p[k] = this.o[k] = x;
    this.p[k + 1] = this.o[k + 1] = y;
    this.p[k + 2] = this.o[k + 2] = z;
  }

  stick(a, b, brk = null, len = null) {
    const k = a * 3;
    const j = b * 3;
    const l = len ?? Math.hypot(this.p[k] - this.p[j], this.p[k + 1] - this.p[j + 1], this.p[k + 2] - this.p[j + 2]);
    this.sticks.push({ a, b, len: l, min: false, brk });
  }

  limit(a, b, len, brk) {
    this.sticks.push({ a, b, len, min: true, brk });
  }

  // Pose from the soldier's stance at the moment he fell (model space ->
  // world), then the joints are linked.
  build(u) {
    const st = u.stance;
    const pose = st === 2 ? PRONE : st === 1 ? CROUCH : STAND;
    const c = Math.cos(u.yaw);
    const s = Math.sin(u.yaw);
    for (let i = 0; i < NJ; i++) {
      const q = pose[i];
      if (!q) continue;
      this.set(i, u.pos.x + q[0] * c + q[2] * s, u.pos.y + q[1], u.pos.z - q[0] * s + q[2] * c);
    }
    // Weapon along the soldier's aim (or along the body when prone).
    const w = this.weapon;
    if (w) {
      const wc = st === 2 ? [w.center.x, 0.18, w.center.y - 0.85 + 0.2] : st === 1 ? [w.center.x, w.center.y - 0.42, w.center.z] : [w.center.x, w.center.y, w.center.z];
      const half = w.len / 2;
      for (const [i, dz] of [[GUN_A, -half], [GUN_B, half]]) {
        const lx = wc[0];
        const lz = wc[2] + dz;
        this.set(i, u.pos.x + lx * c + lz * s, u.pos.y + wc[1], u.pos.z - lx * s + lz * c);
      }
      this.stick(GUN_A, GUN_B);
    } else {
      this.set(GUN_A, u.pos.x, u.pos.y + 0.3, u.pos.z);
      this.set(GUN_B, u.pos.x, u.pos.y + 0.3, u.pos.z + 0.1);
    }
    // Rigid torso: hips, shoulders and neck pairwise, and each surface point
    // tied to the hips and shoulders (the surface points stand out of their
    // plane, which keeps the block from folding).
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) this.stick(TORSO[i], TORSO[j]);
    for (let i = 5; i < TORSO.length; i++) for (let j = 0; j < 4; j++) this.stick(TORSO[i], TORSO[j]);
    // Head, arms, legs at their true lengths.
    this.stick(NECK, HEAD, [1], L_NECK);
    this.stick(SH_L, EL_L, null, L_UA);
    this.stick(EL_L, HA_L, null, L_FA);
    this.stick(SH_R, EL_R, null, L_UA);
    this.stick(EL_R, HA_R, null, L_FA);
    this.stick(HIP_L, KN_L, null, L_TH);
    this.stick(KN_L, FT_L, null, L_SH);
    this.stick(HIP_R, KN_R, null, L_TH);
    this.stick(KN_R, FT_R, null, L_SH);
    // The head never folds into the chest; hands stop short of the shoulder.
    this.limit(HEAD, HIP_L, 0.66, null);
    this.limit(HEAD, HIP_R, 0.66, null);
    this.limit(HA_L, SH_L, 0.14, [2, 3]);
    this.limit(HA_R, SH_R, 0.14, [4, 5]);
    // Parts: [type, a, b] (the torso uses its own frame).
    const P = (type, a, b) => this.parts.push({ type, a, b, gib: false, blood: 0, zx: Math.sin(u.yaw), zy: 0, zz: Math.cos(u.yaw) });
    P(P_TORSO, HIP_L, NECK);
    P(P_HEAD, NECK, HEAD);
    P(P_UARM, SH_L, EL_L);
    P(P_FARM, EL_L, HA_L);
    P(P_UARM, SH_R, EL_R);
    P(P_FARM, EL_R, HA_R);
    P(P_THIGH, HIP_L, KN_L);
    P(P_SHIN, KN_L, FT_L);
    P(P_THIGH, HIP_R, KN_R);
    P(P_SHIN, KN_R, FT_R);
    if (w) this.parts.push({ type: P_WEAPON, a: GUN_A, b: GUN_B, gib: true, blood: 0, zx: 0, zy: 1, zz: 0 });
  }

  // Lift any particle that starts below the ground (slopes, rubble) without
  // giving it speed.
  rest(terrain) {
    for (let i = 0; i < this.np; i++) {
      this.collide(i, terrain);
      const k = i * 3 + 1;
      const fl = this.floor[i] + this.r[i];
      if (this.p[k] < fl) {
        this.o[k] += fl - this.p[k];
        this.p[k] = fl;
      }
    }
  }

  // Tear a limb off at a joint: the limb gets its own root particle.
  cut(partIndex, joint, gibs) {
    if (this.np >= NP) return -1;
    const ni = this.np++;
    const k = joint * 3;
    this.set(ni, this.p[k], this.p[k + 1], this.p[k + 2]);
    this.o[ni * 3] = this.o[k];
    this.o[ni * 3 + 1] = this.o[k + 1];
    this.o[ni * 3 + 2] = this.o[k + 2];
    this.r[ni] = 0.06;
    this.w[ni] = 0.5;
    const part = this.parts[partIndex];
    for (const st of this.sticks) {
      if (st.a === joint && st.b === part.b) st.a = ni;
      else if (st.b === joint && st.a === part.b) st.b = ni;
    }
    part.a = ni;
    this.sticks = this.sticks.filter((st) => !st.brk || !st.brk.some((p) => gibs.includes(p)));
    for (const p of gibs) {
      this.parts[p].gib = true;
      this.parts[p].blood = 0.75;
    }
    this.stumps.push({ i: joint, out: ni, body: true }, { i: ni, out: joint, body: false });
    return ni;
  }

  // Add a velocity (m/s) to particle i.
  push(i, vx, vy, vz) {
    const k = i * 3;
    this.o[k] -= vx * STEP;
    this.o[k + 1] -= vy * STEP;
    this.o[k + 2] -= vz * STEP;
    this.sleeping = false;
    this.still = 0;
  }

  blast(bx, by, bz, r, power, gibs = false) {
    const reach = r * 1.6;
    const speed = Math.min(10, 1.5 + power / 45);
    for (let i = 0; i < this.np; i++) {
      const k = i * 3;
      const dx = this.p[k] - bx;
      const dy = this.p[k + 1] - by + 0.4;
      const dz = this.p[k + 2] - bz;
      const d = Math.hypot(dx, dy, dz) || 1;
      const f = Math.max(0, 1 - d / reach);
      if (f <= 0) continue;
      let v = speed * f;
      const gib = gibs && this.isGibParticle(i);
      if (gib) v *= 1.5;
      this.push(i, (dx / d) * v + (gib ? rr(-3, 3) : rr(-0.4, 0.4)), (dy / d) * v + v * 0.35 + (gib ? rr(1, 3) : 0), (dz / d) * v + (gib ? rr(-3, 3) : rr(-0.4, 0.4)));
    }
  }

  isGibParticle(i) {
    for (const p of this.parts) if (p.gib && p.type !== P_WEAPON && (p.a === i || p.b === i)) return true;
    return false;
  }

  // Remember nearby solid structures for collisions.
  gatherStructs(world) {
    this.structs = world.structures.queryRadius(this.p[0], this.p[2], 7, []).filter((s) => s.kind !== 'prop' || s.solidH > 0.5);
  }

  // Ground height under particle i, pushing it out of walls it ends up inside.
  collide(i, terrain) {
    const k = i * 3;
    const x = this.p[k];
    const y = this.p[k + 1];
    const z = this.p[k + 2];
    let g = terrain.heightAt(x, z);
    for (const s of this.structs) {
      const c = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      const rx = x - s.x;
      const rz = z - s.z;
      const lx = rx * c - rz * sn;
      const lz = rx * sn + rz * c;
      const m = this.r[i];
      if (Math.abs(lx) > s.hx + m || Math.abs(lz) > s.hz + m) continue;
      const top = s.top;
      if (y > top - 0.55) {
        if (top > g) g = top;
        continue;
      }
      // Inside the solid part: out through the nearest side.
      const px = s.hx + m - Math.abs(lx);
      const pz = s.hz + m - Math.abs(lz);
      let nlx = lx;
      let nlz = lz;
      if (px < pz) nlx = Math.sign(lx || 1) * (s.hx + m);
      else nlz = Math.sign(lz || 1) * (s.hz + m);
      const wx = s.x + nlx * c + nlz * sn;
      const wz = s.z - nlx * sn + nlz * c;
      // Out of the wall, keeping a little of the velocity.
      const vx = this.p[k] - this.o[k];
      const vz = this.p[k + 2] - this.o[k + 2];
      this.p[k] = wx;
      this.p[k + 2] = wz;
      this.o[k] = wx - vx * 0.2;
      this.o[k + 2] = wz - vz * 0.2;
    }
    this.floor[i] = g;
  }

  // Torso frame from the hips, shoulders and neck: x left, y up the spine,
  // z out of the chest.
  frame() {
    const p = this.p;
    const F = this.F;
    const ox = (p[0] + p[3]) / 2;
    const oy = (p[1] + p[4]) / 2;
    const oz = (p[2] + p[5]) / 2;
    let yx = p[NECK * 3] - ox;
    let yy = p[NECK * 3 + 1] - oy;
    let yz = p[NECK * 3 + 2] - oz;
    let l = Math.hypot(yx, yy, yz) || 1;
    yx /= l;
    yy /= l;
    yz /= l;
    let xx = p[0] - p[3] + p[SH_L * 3] - p[SH_R * 3];
    let xy = p[1] - p[4] + p[SH_L * 3 + 1] - p[SH_R * 3 + 1];
    let xz = p[2] - p[5] + p[SH_L * 3 + 2] - p[SH_R * 3 + 2];
    const d = xx * yx + xy * yy + xz * yz;
    xx -= yx * d;
    xy -= yy * d;
    xz -= yz * d;
    l = Math.hypot(xx, xy, xz) || 1;
    xx /= l;
    xy /= l;
    xz /= l;
    F[0] = xx;
    F[1] = xy;
    F[2] = xz;
    F[3] = yx;
    F[4] = yy;
    F[5] = yz;
    F[6] = xy * yz - xz * yy;
    F[7] = xz * yx - xx * yz;
    F[8] = xx * yy - xy * yx;
  }

  // Move child c by part of d and joint j the other way, by inverse mass.
  shift(c, j, dx, dy, dz, k) {
    const p = this.p;
    const wc = this.w[c];
    const wj = this.w[j];
    const W = wc + wj;
    if (W <= 0) return;
    const fc = (wc / W) * k;
    const fj = (wj / W) * k;
    const C = c * 3;
    const J = j * 3;
    p[C] += dx * fc;
    p[C + 1] += dy * fc;
    p[C + 2] += dz * fc;
    p[J] -= dx * fj;
    p[J + 1] -= dy * fj;
    p[J + 2] -= dz * fj;
  }

  // Keep the bone j -> c inside its swing cone.
  coneLimit(j, c, cn, mx) {
    const p = this.p;
    const J = j * 3;
    const C = c * 3;
    let dx = p[C] - p[J];
    let dy = p[C + 1] - p[J + 1];
    let dz = p[C + 2] - p[J + 2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return;
    dx /= len;
    dy /= len;
    dz /= len;
    toWorld(this.F, cn.c, mx, _c);
    const dc = dx * _c[0] + dy * _c[1] + dz * _c[2];
    const phi = Math.acos(Math.max(-1, Math.min(1, dc)));
    if (phi <= Math.min(cn.a1, cn.a2)) return;
    toWorld(this.F, cn.e1, mx, _e1);
    toWorld(this.F, cn.e2, mx, _e2);
    const d1 = dx * _e1[0] + dy * _e1[1] + dz * _e1[2];
    const d2 = dx * _e2[0] + dy * _e2[1] + dz * _e2[2];
    const rho = Math.hypot(d1, d2);
    const ca = rho > 1e-6 ? d1 / rho : 1;
    const sa = rho > 1e-6 ? d2 / rho : 0;
    const lim = (cn.a1 * cn.a2) / Math.hypot(cn.a2 * ca, cn.a1 * sa);
    if (phi <= lim) return;
    const cl = Math.cos(lim) * len;
    const sl = Math.sin(lim) * len;
    const tx = p[J] + _c[0] * cl + (_e1[0] * ca + _e2[0] * sa) * sl;
    const ty = p[J + 1] + _c[1] * cl + (_e1[1] * ca + _e2[1] * sa) * sl;
    const tz = p[J + 2] + _c[2] * cl + (_e1[2] * ca + _e2[2] * sa) * sl;
    this.shift(c, j, tx - p[C], ty - p[C + 1], tz - p[C + 2], 0.8);
  }

  // Hinge frame for the bone a -> j: forward (the side a knee points to) and
  // the hinge axis, turned out by the leg's twist. False if the torso's
  // lateral axis runs along the bone.
  hingeAxes(a, j, twist) {
    const p = this.p;
    const F = this.F;
    const A = a * 3;
    const J = j * 3;
    let tx = p[J] - p[A];
    let ty = p[J + 1] - p[A + 1];
    let tz = p[J + 2] - p[A + 2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    const d = F[0] * tx + F[1] * ty + F[2] * tz;
    let ax = F[0] - tx * d;
    let ay = F[1] - ty * d;
    let az = F[2] - tz * d;
    const al = Math.hypot(ax, ay, az);
    if (al < 0.3) return false;
    ax /= al;
    ay /= al;
    az /= al;
    let fx = ty * az - tz * ay;
    let fy = tz * ax - tx * az;
    let fz = tx * ay - ty * ax;
    if (twist) {
      const c = Math.cos(twist);
      const s = Math.sin(twist);
      const nfx = fx * c + ax * s;
      const nfy = fy * c + ay * s;
      const nfz = fz * c + az * s;
      ax = ax * c - fx * s;
      ay = ay * c - fy * s;
      az = az * c - fz * s;
      fx = nfx;
      fy = nfy;
      fz = nfz;
    }
    _ax[0] = fx;
    _ax[1] = fy;
    _ax[2] = fz;
    _ax[3] = ax;
    _ax[4] = ay;
    _ax[5] = az;
    _t.set(tx, ty, tz);
    return true;
  }

  // Keep the bone j -> c bending only around its hinge, within its range.
  hinge(a, j, c, side, lo, hi, slack, twist) {
    if (!this.hingeAxes(a, j, twist)) return;
    const p = this.p;
    const J = j * 3;
    const C = c * 3;
    const sx = p[C] - p[J];
    const sy = p[C + 1] - p[J + 1];
    const sz = p[C + 2] - p[J + 2];
    const len = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (len < 1e-6) return;
    const st = sx * _t.x + sy * _t.y + sz * _t.z;
    const sf = sx * _ax[0] + sy * _ax[1] + sz * _ax[2];
    const sa = sx * _ax[3] + sy * _ax[4] + sz * _ax[5];
    const th = Math.atan2(side * sf, st);
    const lat = slack * len;
    if (th >= lo && th <= hi && Math.abs(sa) <= lat) return;
    const th2 = Math.max(lo, Math.min(hi, th));
    const sa2 = Math.max(-lat, Math.min(lat, sa));
    const m = Math.sqrt(Math.max(0, len * len - sa2 * sa2));
    const st2 = m * Math.cos(th2);
    const sf2 = side * m * Math.sin(th2);
    const tx = p[J] + _t.x * st2 + _ax[0] * sf2 + _ax[3] * sa2;
    const ty = p[J + 1] + _t.y * st2 + _ax[1] * sf2 + _ax[4] * sa2;
    const tz = p[J + 2] + _t.z * st2 + _ax[2] * sf2 + _ax[5] * sa2;
    this.shift(c, j, tx - p[C], ty - p[C + 1], tz - p[C + 2], 0.8);
  }

  limits() {
    this.frame();
    const parts = this.parts;
    for (const [j, c, part, cn, mx] of CONES) if (!parts[part].gib) this.coneLimit(j, c, cn, mx);
    for (const [a, j, c, pp, part, side, lo, hi, slack, tw] of HINGES) {
      if (parts[pp].gib || parts[part].gib) continue;
      this.hinge(a, j, c, side, lo, hi, slack, tw >= 0 ? this.twist[tw] : 0);
    }
  }

  // Push two capsules (a0-a1, b0-b1) apart.
  capsules(a0, a1, ra, la, b0, b1, rb, lb) {
    const p = this.p;
    const w = this.w;
    const A0 = a0 * 3;
    const A1 = a1 * 3;
    const B0 = b0 * 3;
    const B1 = b1 * 3;
    const R = ra + rb;
    const reach = R + (la + lb) / 2;
    const mx = p[A0] + p[A1] - p[B0] - p[B1];
    const my = p[A0 + 1] + p[A1 + 1] - p[B0 + 1] - p[B1 + 1];
    const mz = p[A0 + 2] + p[A1 + 2] - p[B0 + 2] - p[B1 + 2];
    if (mx * mx + my * my + mz * mz > 4 * reach * reach) return;
    const q = segSegClosest(p[A0], p[A0 + 1], p[A0 + 2], p[A1], p[A1 + 1], p[A1 + 2], p[B0], p[B0 + 1], p[B0 + 2], p[B1], p[B1 + 1], p[B1 + 2]);
    if (q.d2 >= R * R) return;
    const s = q.s;
    const t = q.t;
    let nx = p[B0] + (p[B1] - p[B0]) * t - p[A0] - (p[A1] - p[A0]) * s;
    let ny = p[B0 + 1] + (p[B1 + 1] - p[B0 + 1]) * t - p[A0 + 1] - (p[A1 + 1] - p[A0 + 1]) * s;
    let nz = p[B0 + 2] + (p[B1 + 2] - p[B0 + 2]) * t - p[A0 + 2] - (p[A1 + 2] - p[A0 + 2]) * s;
    let d = Math.sqrt(q.d2);
    if (d < 1e-5) {
      nx = -mx;
      ny = -my;
      nz = -mz;
      d = Math.hypot(nx, ny, nz);
      if (d < 1e-5) {
        nx = 0;
        ny = 1;
        nz = 0;
        d = 1;
      }
      nx /= d;
      ny /= d;
      nz /= d;
      d = 0;
    } else {
      nx /= d;
      ny /= d;
      nz /= d;
    }
    const wa0 = w[a0] * (1 - s);
    const wa1 = w[a1] * s;
    const wb0 = w[b0] * (1 - t);
    const wb1 = w[b1] * t;
    const W = wa0 * (1 - s) + wa1 * s + wb0 * (1 - t) + wb1 * t;
    if (W <= 0) return;
    const l = ((R - d) / W) * 0.9;
    p[A0] -= nx * l * wa0;
    p[A0 + 1] -= ny * l * wa0;
    p[A0 + 2] -= nz * l * wa0;
    p[A1] -= nx * l * wa1;
    p[A1 + 1] -= ny * l * wa1;
    p[A1 + 2] -= nz * l * wa1;
    p[B0] += nx * l * wb0;
    p[B0 + 1] += ny * l * wb0;
    p[B0 + 2] += nz * l * wb0;
    p[B1] += nx * l * wb1;
    p[B1 + 1] += ny * l * wb1;
    p[B1 + 2] += nz * l * wb1;
  }

  // Push a capsule (a0-a1) out of the ball around particle k.
  capsuleBall(a0, a1, ra, la, k) {
    const p = this.p;
    const w = this.w;
    const A0 = a0 * 3;
    const A1 = a1 * 3;
    const K = k * 3;
    const R = ra + this.r[k];
    const reach = R + la / 2;
    const mx = (p[A0] + p[A1]) / 2 - p[K];
    const my = (p[A0 + 1] + p[A1 + 1]) / 2 - p[K + 1];
    const mz = (p[A0 + 2] + p[A1 + 2]) / 2 - p[K + 2];
    if (mx * mx + my * my + mz * mz > reach * reach) return;
    const t = segClosestT(p[A0], p[A0 + 1], p[A0 + 2], p[A1], p[A1 + 1], p[A1 + 2], p[K], p[K + 1], p[K + 2]);
    let nx = p[A0] + (p[A1] - p[A0]) * t - p[K];
    let ny = p[A0 + 1] + (p[A1 + 1] - p[A0 + 1]) * t - p[K + 1];
    let nz = p[A0 + 2] + (p[A1 + 2] - p[A0 + 2]) * t - p[K + 2];
    const d2 = nx * nx + ny * ny + nz * nz;
    if (d2 >= R * R || d2 < 1e-10) return;
    const d = Math.sqrt(d2);
    nx /= d;
    ny /= d;
    nz /= d;
    const wa0 = w[a0] * (1 - t);
    const wa1 = w[a1] * t;
    const wk = w[k];
    const W = wa0 * (1 - t) + wa1 * t + wk;
    if (W <= 0) return;
    const l = ((R - d) / W) * 0.9;
    p[A0] += nx * l * wa0;
    p[A0 + 1] += ny * l * wa0;
    p[A0 + 2] += nz * l * wa0;
    p[A1] += nx * l * wa1;
    p[A1 + 1] += ny * l * wa1;
    p[A1 + 2] += nz * l * wa1;
    p[K] -= nx * l * wk;
    p[K + 1] -= ny * l * wk;
    p[K + 2] -= nz * l * wk;
  }

  // Limbs against each other and against the torso.
  selfCollide() {
    const parts = this.parts;
    for (const [i, j] of PAIRS) {
      const A = parts[i];
      const B = parts[j];
      if (A.gib || B.gib) continue;
      this.capsules(A.a, A.b, CAP_R[A.type], CAP_L[A.type], B.a, B.b, CAP_R[B.type], CAP_L[B.type]);
    }
    for (const i of VS_TORSO) {
      const A = parts[i];
      if (A.gib) continue;
      for (const k of TORSO_BALLS) this.capsuleBall(A.a, A.b, CAP_R[A.type], CAP_L[A.type], k);
    }
  }

  // Rest on (and push) the bodies nearby.
  touch() {
    const p = this.p;
    for (const q of this.nbrs) {
      const dx0 = q.cx - this.cx;
      const dz0 = q.cz - this.cz;
      const reach = q.radius + this.radius;
      if (dx0 * dx0 + dz0 * dz0 > reach * reach) continue;
      const qp = q.p;
      const share = q.sleeping ? 1 : 0.5;
      for (const i of SOLID) {
        const I = i * 3;
        const ri = this.r[i];
        const ex = p[I] - q.cx;
        const ey = p[I + 1] - q.cy;
        const ez = p[I + 2] - q.cz;
        const qr = q.radius + ri;
        if (ex * ex + ey * ey + ez * ez > qr * qr) continue;
        for (const j of SOLID) {
          const J = j * 3;
          const R = ri + q.r[j];
          const dx = p[I] - qp[J];
          const dy = p[I + 1] - qp[J + 1];
          const dz = p[I + 2] - qp[J + 2];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= R * R || d2 < 1e-10) continue;
          const d = Math.sqrt(d2);
          const f = ((R - d) / d) * share;
          p[I] += dx * f;
          p[I + 1] += dy * f;
          p[I + 2] += dz * f;
          if (share < 1) {
            qp[J] -= dx * f;
            qp[J + 1] -= dy * f;
            qp[J + 2] -= dz * f;
          }
        }
      }
    }
  }

  // Nothing holds a dead body up: a torso left sitting upright tips over in
  // the way it leans, and a pelvis propped on the knees sinks.
  slump() {
    const o = this.o;
    const F = this.F;
    const a = 5 * STEP * STEP;
    if (F[4] > 0.6) {
      let lx = F[3];
      let lz = F[5];
      const l = Math.hypot(lx, lz);
      if (l < 0.05) {
        lx = -F[6];
        lz = -F[8];
      } else {
        lx /= l;
        lz /= l;
      }
      for (const i of [NECK, SH_L, SH_R, CHEST, PACK]) {
        o[i * 3] -= lx * a;
        o[i * 3 + 2] -= lz * a;
      }
    }
    const h = (this.p[1] + this.p[4]) / 2 - this.floor[HIP_L];
    if (h > 0.3) for (const i of [HIP_L, HIP_R, SEAT, BELLY]) o[i * 3 + 1] += a;
  }

  step(terrain) {
    const p = this.p;
    const o = this.o;
    const w = this.w;
    const n = this.np;
    // Joint friction: each limb loses part of its swing relative to the bone
    // it hangs from (velocities are p - o).
    for (const [a, c, part] of BONES) {
      if (this.parts[part].gib) continue;
      const A = a * 3;
      const C = c * 3;
      const W = w[a] + w[c];
      const ka = (w[a] / W) * JOINT_DAMP;
      const kc = (w[c] / W) * JOINT_DAMP;
      for (let e = 0; e < 3; e++) {
        const rel = p[C + e] - o[C + e] - (p[A + e] - o[A + e]);
        o[C + e] += rel * kc;
        o[A + e] -= rel * ka;
      }
    }
    if (this.dead && this.age > 0.5 && this.age < 6) this.slump();
    const gy = -GRAVITY * STEP * STEP;
    let maxV = 0;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      const vx = (p[k] - o[k]) * 0.997;
      const vy = (p[k + 1] - o[k + 1]) * 0.997;
      const vz = (p[k + 2] - o[k + 2]) * 0.997;
      const v = Math.abs(vx) + Math.abs(vy) + Math.abs(vz);
      if (v > maxV) maxV = v;
      o[k] = p[k];
      o[k + 1] = p[k + 1];
      o[k + 2] = p[k + 2];
      p[k] += vx;
      p[k + 1] += vy + gy;
      p[k + 2] += vz;
    }
    for (let i = 0; i < n; i++) this.collide(i, terrain);
    const sticks = this.sticks;
    for (let it = 0; it < ITER; it++) {
      for (let s = 0; s < sticks.length; s++) {
        const st = sticks[s];
        const a = st.a * 3;
        const b = st.b * 3;
        const dx = p[b] - p[a];
        const dy = p[b + 1] - p[a + 1];
        const dz = p[b + 2] - p[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (st.min && d >= st.len) continue;
        const wa = w[st.a];
        const wb = w[st.b];
        const f = (d - st.len) / (d * (wa + wb));
        p[a] += dx * f * wa;
        p[a + 1] += dy * f * wa;
        p[a + 2] += dz * f * wa;
        p[b] -= dx * f * wb;
        p[b + 1] -= dy * f * wb;
        p[b + 2] -= dz * f * wb;
      }
      if (it & 1) this.selfCollide();
      else this.limits();
      if (it === ITER - 3 && this.nbrs.length) this.touch();
      for (let i = 0; i < n; i++) {
        const k = i * 3 + 1;
        const fl = this.floor[i] + this.r[i];
        if (p[k] < fl) p[k] = fl;
      }
    }
    // Ground contact: no bounce, heavy friction.
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      if (p[k + 1] <= this.floor[i] + this.r[i] + 0.002) {
        if (o[k + 1] > p[k + 1]) o[k + 1] = p[k + 1];
        o[k] = p[k] - (p[k] - o[k]) * 0.45;
        o[k + 2] = p[k + 2] - (p[k + 2] - o[k + 2]) * 0.45;
      }
    }
    this.still = maxV < SLEEP_V ? this.still + 1 : 0;
    const propped = this.dead && this.age < 6 && this.F[4] > 0.6;
    if ((this.still > 40 && !propped) || this.age > 14) this.sleeping = true;
    this.dirty = true;
  }

  // Part transforms (column-major 4x4) from the particles.
  computeMatrices() {
    const p = this.p;
    const m = this.mats;
    this.frame();
    const F = this.F;
    // Torso: origin between the hips.
    _o.set((p[0] + p[3]) / 2, (p[1] + p[4]) / 2, (p[2] + p[5]) / 2);
    _x.set(F[0], F[1], F[2]);
    _y.set(F[3], F[4], F[5]);
    _z.set(F[6], F[7], F[8]);
    write(m, 0, _x, _y, _z, _o);
    const fx = F[6];
    const fy = F[7];
    const fz = F[8];
    this.cx = _o.x;
    this.cy = _o.y;
    this.cz = _o.z;
    let r2 = 1;
    for (let i = 1; i < this.parts.length; i++) {
      const part = this.parts[i];
      const a = part.a * 3;
      const b = part.b * 3;
      if (part.type === P_WEAPON) {
        _o.set((p[a] + p[b]) / 2, (p[a + 1] + p[b + 1]) / 2, (p[a + 2] + p[b + 2]) / 2);
        _z.set(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]).normalize();
        _y.set(part.zx, part.zy, part.zz);
        _y.addScaledVector(_z, -_y.dot(_z));
        if (_y.lengthSq() < 1e-4) _y.set(0, 1, 0).addScaledVector(_z, -_z.y);
        _y.normalize();
        _x.crossVectors(_y, _z);
        part.zx = _y.x;
        part.zy = _y.y;
        part.zz = _y.z;
      } else {
        // Y runs from the far joint back to this part's joint.
        _o.set(p[a], p[a + 1], p[a + 2]);
        _y.set(p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]).normalize();
        if (part.type === P_HEAD) _y.negate();
        const leg = !part.gib && (part.type === P_THIGH || part.type === P_SHIN) && !this.parts[i - (part.type === P_SHIN ? 1 : 0)].gib;
        if (leg && this.hingeAxes(part.type === P_THIGH ? part.a : this.parts[i - 1].a, part.type === P_THIGH ? part.b : part.a, this.twist[i < 8 ? 0 : 1])) {
          // Legs face where the knee points: z = hinge axis x y.
          _z.set(_ax[4] * _y.z - _ax[5] * _y.y, _ax[5] * _y.x - _ax[3] * _y.z, _ax[3] * _y.y - _ax[4] * _y.x);
        } else if (part.gib) _z.set(part.zx, part.zy, part.zz);
        // Keep each part's facing continuous; attached ones follow the torso.
        else _z.set(part.zx * 0.7 + fx * 0.3, part.zy * 0.7 + fy * 0.3, part.zz * 0.7 + fz * 0.3);
        _z.addScaledVector(_y, -_z.dot(_y));
        if (_z.lengthSq() < 1e-4) _z.set(fx, fy, fz).addScaledVector(_y, -_y.dot(_t.set(fx, fy, fz)));
        if (_z.lengthSq() < 1e-4) _z.set(1, 0, 0).addScaledVector(_y, -_y.x);
        _z.normalize();
        _x.crossVectors(_y, _z);
        part.zx = _z.x;
        part.zy = _z.y;
        part.zz = _z.z;
      }
      write(m, i * 16, _x, _y, _z, _o);
      const dx = _o.x - this.cx;
      const dy = _o.y - this.cy;
      const dz = _o.z - this.cz;
      r2 = Math.max(r2, dx * dx + dy * dy + dz * dz);
    }
    this.radius = Math.sqrt(r2) + 0.6;
    this.dirty = false;
  }
}

function write(m, off, x, y, z, o) {
  m[off] = x.x;
  m[off + 1] = x.y;
  m[off + 2] = x.z;
  m[off + 3] = 0;
  m[off + 4] = y.x;
  m[off + 5] = y.y;
  m[off + 6] = y.z;
  m[off + 7] = 0;
  m[off + 8] = z.x;
  m[off + 9] = z.y;
  m[off + 10] = z.z;
  m[off + 11] = 0;
  m[off + 12] = o.x;
  m[off + 13] = o.y;
  m[off + 14] = o.z;
  m[off + 15] = 1;
}

// Joint positions (model space, facing +Z) for the three stances. Arms start
// in the weapon-holding pose.
function poseFrom(hipY, lean, knees, arms) {
  const cy = Math.cos(lean);
  const sz = Math.sin(lean);
  // h up the leaning spine, f out of the chest.
  const at = (x, h, f = 0) => [x, hipY + cy * h - sz * f, sz * h + cy * f];
  const P = [];
  P[HIP_L] = at(0.1, 0);
  P[HIP_R] = at(-0.1, 0);
  P[SH_L] = at(0.2, 0.49);
  P[SH_R] = at(-0.2, 0.49);
  P[NECK] = at(0, 0.54);
  P[HEAD] = at(0, 0.54 + L_NECK, 0.01);
  P[CHEST] = at(0, 0.32, 0.07);
  P[PACK] = at(0, 0.36, -0.18);
  P[BELLY] = at(0, 0.06, 0.02);
  P[SEAT] = at(0, 0, -0.03);
  const add = (a, d, l) => {
    const n = Math.hypot(d[0], d[1], d[2]);
    return [a[0] + (d[0] / n) * l, a[1] + (d[1] / n) * l, a[2] + (d[2] / n) * l];
  };
  P[EL_L] = add(P[SH_L], arms[0], L_UA);
  P[HA_L] = add(P[EL_L], arms[1], L_FA);
  P[EL_R] = add(P[SH_R], arms[2], L_UA);
  P[HA_R] = add(P[EL_R], arms[3], L_FA);
  P[KN_L] = add(P[HIP_L], knees[0], L_TH);
  P[FT_L] = add(P[KN_L], knees[1], L_SH);
  P[KN_R] = add(P[HIP_R], knees[0], L_TH);
  P[FT_R] = add(P[KN_R], knees[1], L_SH);
  return P;
}

const HOLD = [[-0.025, -0.23, 0.17], [-0.14, 0.11, 0.27], [-0.035, -0.25, 0.07], [0.15, 0.11, 0.13]];
const STAND = poseFrom(0.93, 0.05, [[0, -1, 0.04], [0, -1, -0.04]], HOLD);
const CROUCH = poseFrom(0.53, 0.3, [[0, -0.41, 0.91], [0, -0.62, -0.78]], HOLD);
// Prone: the standing pose turned face down along +Z (y -> z, z -> -y),
// elbows on the ground and hands forward on the rifle.
const PRONE = poseFrom(0.93, 0, [[0, -1, 0], [0, -1, 0]], [[0.15, 0.9, 0.25], [-0.25, 0.95, 0], [-0.15, 0.9, 0.25], [0.25, 0.95, 0]]).map((q) => (q ? [q[0], 0.2 - q[2], q[1] - 0.85] : q));
