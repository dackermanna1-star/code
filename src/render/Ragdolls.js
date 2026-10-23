// Ragdolls for fallen soldiers. Each body is a set of Verlet particles held
// together by distance constraints: a rigid torso (hips, shoulders, neck),
// the head, two-segment arms and legs, and the dropped weapon as a separate
// stick. Bodies collide with the terrain, rooftops, walls and wrecks, take the
// impulse of the killing shot or blast, are tossed again by later blasts and
// fall asleep once still. Limbs torn off by a blast become separate pieces.
// Soldiers who are down but alive writhe until they die or are treated.
// Parts are drawn as instanced meshes built from the soldier's primitives.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash01 } from '../core/rng.js';
import { SEVER } from '../sim/damage.js';
import { box, taper, limb, ball, dome, V, weaponShapes, ROLE_WEAPON, makeRagdollMaterial, M_UNIFORM, M_GEAR, M_SKIN, M_HELMET, M_BOOT } from './InfantryRenderer.js';

const rand = Math.random;
const rr = (a, b) => a + (b - a) * rand();

// Particles.
const HIP_L = 0;
const HIP_R = 1;
const SH_L = 2;
const SH_R = 3;
const NECK = 4;
const HEAD = 5;
const EL_L = 6;
const HA_L = 7;
const EL_R = 8;
const HA_R = 9;
const KN_L = 10;
const FT_L = 11;
const KN_R = 12;
const FT_R = 13;
const GUN_A = 14;
const GUN_B = 15;
const NP = 22; // 16 joints plus spare roots for torn-off limbs
const RADIUS = [0.09, 0.09, 0.09, 0.09, 0.08, 0.12, 0.06, 0.05, 0.06, 0.05, 0.07, 0.06, 0.07, 0.06, 0.035, 0.035];

// Segment lengths (m).
const L_UA = 0.29;
const L_FA = 0.29;
const L_TH = 0.43;
const L_SH = 0.42;
const L_NECK = 0.19;

// Part types, each drawn by its own instanced mesh.
const P_TORSO = 0;
const P_HEAD = 1;
const P_UARM = 2;
const P_FARM = 3;
const P_THIGH = 4;
const P_SHIN = 5;
const P_WEAPON = 6;
const NTYPES = 6;

// Limbs: [mask, part index, joint it is torn from, parts that go with it].
const CUTS = [
  [SEVER.ARM_L, 2, SH_L, [2, 3]],
  [SEVER.FORE_L, 3, EL_L, [3]],
  [SEVER.ARM_R, 4, SH_R, [4, 5]],
  [SEVER.FORE_R, 5, EL_R, [5]],
  [SEVER.LEG_L, 6, HIP_L, [6, 7]],
  [SEVER.SHIN_L, 7, KN_L, [7]],
  [SEVER.LEG_R, 8, HIP_R, [8, 9]],
  [SEVER.SHIN_R, 9, KN_R, [9]],
];

const GRAVITY = 9.81;
const STEP = 1 / 60;
const ITER = 7;
const SLEEP_V = 0.0025; // m per step
const MAX_BODIES = 6000;
const MAX_AWAKE = 140;
const CREATE_RANGE = 450;
const DRAW_RANGE = 650;
const NEAR_RANGE = 110;

// ----------------------------------------------------------------- geometry

function partGeometry(type, lod) {
  const s = lod === 0 ? 7 : 4;
  const parts = [];
  if (type === P_TORSO) {
    // Local origin at the pelvis centre (model y 0.93).
    parts.push(box(0.34, 0.2, 0.22, 0, 0.02, 0, 0, M_UNIFORM));
    parts.push(box(0.37, 0.06, 0.25, 0, 0.1, 0, 0, M_GEAR));
    parts.push(taper(0.33, 0.21, 0.41, 0.24, 0.07, 0.54, 0, 0, 1, M_UNIFORM));
    parts.push(box(0.39, 0.34, 0.3, 0, 0.34, 0, 1, M_GEAR));
    if (lod === 0) {
      parts.push(box(0.09, 0.11, 0.06, -0.12, 0.22, 0.17, 1, M_GEAR));
      parts.push(box(0.09, 0.11, 0.06, 0, 0.22, 0.17, 1, M_GEAR));
      parts.push(box(0.09, 0.11, 0.06, 0.12, 0.22, 0.17, 1, M_GEAR));
    }
    parts.push(box(0.3, 0.4, 0.17, 0, 0.35, -0.22, 1, M_GEAR));
    parts.push(ball(0.062, 0.2, 0.49, 0, 0, 1, M_UNIFORM));
    parts.push(ball(0.062, -0.2, 0.49, 0, 0, 1, M_UNIFORM));
  } else if (type === P_HEAD) {
    // Origin at the base of the neck.
    parts.push(limb(V(0, 0, 0), V(0, 0.1, 0.01), 0.052, 0.048, 6, 1, M_SKIN));
    parts.push(ball(0.105, 0, 0.185, 0.012, lod === 0 ? 1 : 0, 1, M_SKIN, 1.08));
    parts.push(dome(0.132, 0, 0.205, 0, 1, M_HELMET, lod === 0 ? 10 : 6));
    if (lod === 0) parts.push(box(0.09, 0.03, 0.03, 0, 0.305, 0.11, 1, M_BOOT));
  } else if (type === P_UARM) {
    // Limbs hang down -Y from the joint at the origin.
    parts.push(limb(V(0, 0, 0), V(0, -L_UA, 0), 0.058, 0.05, s, 2, M_UNIFORM));
  } else if (type === P_FARM) {
    parts.push(limb(V(0, 0, 0), V(0, -L_FA + 0.04, 0), 0.05, 0.043, s, 2, M_UNIFORM));
    parts.push(ball(0.048, 0, -L_FA + 0.01, 0, 0, 2, M_BOOT));
  } else if (type === P_THIGH) {
    parts.push(limb(V(0, 0, 0), V(0, -L_TH, 0), 0.088, 0.068, s, 3, M_UNIFORM));
  } else if (type === P_SHIN) {
    parts.push(limb(V(0, 0, 0), V(0, -L_SH + 0.03, 0), 0.062, 0.05, s, 4, M_UNIFORM));
    if (lod === 0) parts.push(box(0.11, 0.1, 0.06, 0, 0, 0.055, 4, M_GEAR));
    parts.push(box(0.11, 0.12, 0.27, 0, -L_SH + 0.02, 0.045, 4, M_BOOT));
  }
  const g = mergeGeometries(parts, false);
  g.computeBoundingSphere();
  return g;
}

// Weapon geometry centred on its middle with the barrel along +Z; returns
// the model-space centre and length too.
function weaponGeometry(v) {
  const g = mergeGeometries(weaponShapes(v, 0), false);
  g.computeBoundingBox();
  const b = g.boundingBox;
  const c = new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingSphere();
  return { geo: g, center: c, len: Math.max(0.15, b.max.z - b.min.z) };
}

// Instanced part meshes with a per-instance seed/blood attribute.
class PartBatch {
  constructor(scene, geo, material, shadows) {
    this.scene = scene;
    this.geo = geo;
    this.material = material;
    this.shadows = shadows;
    this.mesh = null;
    this.capacity = 0;
    this.count = 0;
    this.alloc(64);
  }

  alloc(n) {
    const old = this.mesh;
    const geo = this.geo.clone();
    this.rag = new Float32Array(n * 2);
    this.aRag = new THREE.InstancedBufferAttribute(this.rag, 2);
    this.aRag.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aRag', this.aRag);
    const m = new THREE.InstancedMesh(geo, this.material, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = this.shadows;
    m.receiveShadow = this.shadows;
    m.count = 0;
    if (old) {
      m.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, this.count * 16));
      this.rag.set(old.geometry.getAttribute('aRag').array.subarray(0, this.count * 2));
      this.scene.remove(old);
      old.geometry.dispose();
      old.dispose();
    }
    this.mesh = m;
    this.capacity = n;
    this.scene.add(m);
  }

  push(mats, off, seed, blood) {
    if (this.count >= this.capacity) this.alloc(this.capacity * 2);
    const i = this.count++;
    this.mesh.instanceMatrix.array.set(mats.subarray(off, off + 16), i * 16);
    this.rag[i * 2] = seed;
    this.rag[i * 2 + 1] = blood;
  }

  end() {
    const n = this.count;
    this.mesh.count = n;
    if (n) {
      for (const a of [this.mesh.instanceMatrix, this.aRag]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * a.itemSize);
        a.needsUpdate = true;
      }
    }
    this.count = 0;
  }
}

// ----------------------------------------------------------------- bodies

const _o = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _t = new THREE.Vector3();
const _sphere = new THREE.Sphere();

class Ragdoll {
  constructor(u, variant, weapon) {
    this.u = u;
    this.faction = u.faction;
    this.seed = hash01(u.id, 7);
    this.variant = variant;
    this.weapon = weapon;
    this.p = new Float32Array(NP * 3);
    this.o = new Float32Array(NP * 3);
    this.r = new Float32Array(NP);
    this.floor = new Float32Array(NP);
    this.np = 16;
    for (let i = 0; i < 16; i++) this.r[i] = RADIUS[i];
    // Sticks: a, b, rest length, min-only flag, parts whose loss removes it.
    this.sticks = [];
    this.parts = [];
    this.stumps = [];
    this.structs = [];
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

  stick(a, b, min = false, brk = null, len = null) {
    const k = a * 3;
    const j = b * 3;
    const l = len ?? Math.hypot(this.p[k] - this.p[j], this.p[k + 1] - this.p[j + 1], this.p[k + 2] - this.p[j + 2]);
    this.sticks.push({ a, b, len: min ? l * 0.82 : l, min, brk });
  }

  // Pose from the soldier's stance at the moment he fell (model space ->
  // world), then the joints are linked.
  build(u) {
    const st = u.stance;
    const pose = st === 2 ? PRONE : st === 1 ? CROUCH : STAND;
    const c = Math.cos(u.yaw);
    const s = Math.sin(u.yaw);
    for (let i = 0; i < 16; i++) {
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
    }
    // Rigid torso.
    const torso = [HIP_L, HIP_R, SH_L, SH_R, NECK];
    for (let i = 0; i < torso.length; i++) for (let j = i + 1; j < torso.length; j++) this.stick(torso[i], torso[j]);
    // Head, arms, legs at their true lengths.
    this.stick(NECK, HEAD, false, [1], L_NECK);
    this.stick(SH_L, EL_L, false, null, L_UA);
    this.stick(EL_L, HA_L, false, null, L_FA);
    this.stick(SH_R, EL_R, false, null, L_UA);
    this.stick(EL_R, HA_R, false, null, L_FA);
    this.stick(HIP_L, KN_L, false, null, L_TH);
    this.stick(KN_L, FT_L, false, null, L_SH);
    this.stick(HIP_R, KN_R, false, null, L_TH);
    this.stick(KN_R, FT_R, false, null, L_SH);
    // Joint limits as minimum distances: the head does not fold into the
    // chest, knees bend only so far, legs do not swing up through the torso.
    this.limit(HEAD, HIP_L, 0.66, null);
    this.limit(HEAD, HIP_R, 0.66, null);
    this.limit(HIP_L, FT_L, 0.36, [6, 7]);
    this.limit(HIP_R, FT_R, 0.36, [8, 9]);
    this.limit(KN_L, SH_L, 0.5, [6]);
    this.limit(KN_R, SH_R, 0.5, [8]);
    this.limit(KN_L, KN_R, 0.12, [6, 8]);
    this.limit(FT_L, FT_R, 0.1, [6, 7, 8, 9]);
    this.limit(HA_L, SH_L, 0.14, [2, 3]);
    this.limit(HA_R, SH_R, 0.14, [4, 5]);
    // Parts: [type, a, b] (torso uses its own frame).
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

  limit(a, b, len, brk) {
    this.sticks.push({ a, b, len, min: true, brk });
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

  step(terrain) {
    const p = this.p;
    const o = this.o;
    const n = this.np;
    const gy = -GRAVITY * STEP * STEP;
    let maxV = 0;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      const vx = (p[k] - o[k]) * 0.996;
      const vy = (p[k + 1] - o[k + 1]) * 0.996;
      const vz = (p[k + 2] - o[k + 2]) * 0.996;
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
        const f = ((d - st.len) / d) * 0.5;
        p[a] += dx * f;
        p[a + 1] += dy * f;
        p[a + 2] += dz * f;
        p[b] -= dx * f;
        p[b + 1] -= dy * f;
        p[b + 2] -= dz * f;
      }
      for (let i = 0; i < n; i++) {
        const k = i * 3 + 1;
        const fl = this.floor[i] + (this.r[i] || 0.05);
        if (p[k] < fl) p[k] = fl;
      }
    }
    // Ground contact: no bounce, heavy friction.
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      if (p[k + 1] <= this.floor[i] + (this.r[i] || 0.05) + 0.002) {
        if (o[k + 1] > p[k + 1]) o[k + 1] = p[k + 1];
        o[k] = p[k] - (p[k] - o[k]) * 0.45;
        o[k + 2] = p[k + 2] - (p[k + 2] - o[k + 2]) * 0.45;
      }
    }
    this.still = maxV < SLEEP_V ? this.still + 1 : 0;
    if (this.still > 40 || this.age > 14) this.sleeping = true;
    this.dirty = true;
  }

  // Part transforms (column-major 4x4) from the particles.
  computeMatrices() {
    const p = this.p;
    const m = this.mats;
    // Torso frame: origin between the hips, Y to the neck, X to the left.
    _o.set((p[0] + p[3]) / 2, (p[1] + p[4]) / 2, (p[2] + p[5]) / 2);
    _y.set(p[NECK * 3] - _o.x, p[NECK * 3 + 1] - _o.y, p[NECK * 3 + 2] - _o.z).normalize();
    _x.set(p[0] - p[3] + p[SH_L * 3] - p[SH_R * 3], p[1] - p[4] + p[SH_L * 3 + 1] - p[SH_R * 3 + 1], p[2] - p[5] + p[SH_L * 3 + 2] - p[SH_R * 3 + 2]);
    _x.addScaledVector(_y, -_x.dot(_y)).normalize();
    _z.crossVectors(_x, _y);
    const fx = _z.x;
    const fy = _z.y;
    const fz = _z.z;
    write(m, 0, _x, _y, _z, _o);
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
        // Keep each part's facing continuous; attached ones follow the torso.
        if (part.gib) _z.set(part.zx, part.zy, part.zz);
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
  const up = [0, Math.cos(lean), Math.sin(lean)];
  const P = [];
  const at = (x, h, zoff = 0) => [x, hipY + up[1] * h, up[2] * h + zoff];
  P[HIP_L] = [0.1, hipY, 0];
  P[HIP_R] = [-0.1, hipY, 0];
  P[SH_L] = at(0.2, 0.49);
  P[SH_R] = at(-0.2, 0.49);
  P[NECK] = at(0, 0.54);
  P[HEAD] = at(0, 0.54 + L_NECK, 0.01);
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
// Prone: lying face down along +Z, arms forward on the rifle.
const PRONE = (() => {
  const P = poseFrom(0.93, 0, [[0, -1, 0], [0, -1, 0]], [[0.05, 0.6, 0.8], [-0.2, 0.3, 0.93], [-0.05, 0.6, 0.8], [0.2, 0.3, 0.93]]);
  return P.map((q) => (q ? [q[0], 0.14 - q[2] * 0.6, q[1] - 0.85] : q));
})();

// ----------------------------------------------------------------- system

export class RagdollSystem {
  constructor(scene, world, quality, gore = null) {
    this.scene = scene;
    this.world = world;
    this.terrain = world.terrain;
    this.gore = gore;
    this.goreOn = true;
    this.bodies = [];
    this.acc = 0;
    this.cam = new THREE.Vector3();
    const shadows = !!quality.shadows;
    // Batches: [faction][lod][part type].
    const geos = [0, 1].map((lod) => Array.from({ length: NTYPES }, (_, t) => partGeometry(t, lod)));
    this.batches = [0, 1].map((f) => {
      const mat = makeRagdollMaterial(f);
      return [0, 1].map((lod) => geos[lod].map((g) => new PartBatch(scene, g, mat, shadows && lod === 0)));
    });
    // Dropped weapons.
    this.weapons = [];
    this.weaponBatches = [];
    const wmat = makeRagdollMaterial(0);
    for (let v = 0; v < 6; v++) {
      const w = weaponGeometry(v);
      this.weapons.push(w);
      this.weaponBatches.push(new PartBatch(scene, w.geo, wmat, shadows));
    }
    // Wound stumps.
    this.stumpMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 1), new THREE.MeshLambertMaterial({ color: 0x3a0605 }), 256);
    this.stumpMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.stumpMesh.frustumCulled = false;
    this.stumpMesh.count = 0;
    scene.add(this.stumpMesh);
    this.stumpM = new THREE.Matrix4();
  }

  setGore(on) {
    this.goreOn = on;
  }

  handle(events) {
    for (const e of events) {
      if (e.t === 'death' || e.t === 'downed') {
        const u = e.unit;
        if (u.cat !== 'inf') continue;
        if (u._rd) {
          u._rd.dead = e.t === 'death';
          continue;
        }
        // A soldier who went down out of range keeps the simple fallen pose.
        if (e.t === 'death' && u.downed) continue;
        this.create(u, e.hit, e.t === 'death');
      } else if (e.t === 'explosion' && !e.air) {
        const r = (e.radius || 4) * 1.6;
        for (const b of this.bodies) {
          if (Math.abs(b.cx - e.x) > r || Math.abs(b.cz - e.z) > r) continue;
          b.gatherStructs(this.world);
          b.blast(e.x, e.y, e.z, e.radius || 4, e.ex ? e.ex.damage : 150);
        }
      } else if (e.t === 'stabilized' && e.unit._rd) {
        e.unit._rd.stable = true;
      }
    }
  }

  create(u, hit, dead) {
    if (u.mounted || u.removed || u.hidden || u.para || u.climb) return;
    const dx = u.pos.x - this.cam.x;
    const dz = u.pos.z - this.cam.z;
    if (dx * dx + dz * dz > CREATE_RANGE * CREATE_RANGE) return;
    const v = ROLE_WEAPON[u.def.role] ?? 0;
    const b = new Ragdoll(u, v, this.weapons[v]);
    b.dead = dead;
    b.build(u);
    b.gatherStructs(this.world);
    // Moving bodies keep their momentum.
    for (let i = 0; i < b.np; i++) b.push(i, u.vel.x, 0, u.vel.z);
    const gore = this.goreOn && this.gore;
    let severed = 0;
    if (this.goreOn && u.severed) {
      for (const [mask, part, joint, gibs] of CUTS) {
        if (u.severed & mask && !gibs.some((g) => b.parts[g].gib)) {
          b.cut(part, joint, gibs);
          severed++;
        }
      }
    }
    if (hit && hit.blast) {
      const B = hit.blast;
      b.blast(B.x, B.y, B.z, B.r, B.power, severed > 0);
      b.parts[0].blood = severed ? 0.7 : 0.35;
      if (gore && severed) this.gore.burst(b.p[NECK * 3], b.p[NECK * 3 + 1] - 0.3, b.p[NECK * 3 + 2], severed);
    } else if (hit) {
      // A bullet: the struck part takes the push, the legs give way.
      const tgt = hit.part === 'head' ? [[HEAD, 1], [NECK, 0.5]] : hit.part === 'legs' ? [[KN_L, 1], [KN_R, 1], [HIP_L, 0.4], [HIP_R, 0.4]] : [[SH_L, 0.8], [SH_R, 0.8], [NECK, 0.7], [HIP_L, 0.3], [HIP_R, 0.3]];
      for (const [i, k] of tgt) b.push(i, hit.dx * hit.v * k, hit.dy * hit.v * k * 0.5, hit.dz * hit.v * k);
      this.buckle(b, u, 0.9);
      if (hit.part === 'head') b.parts[1].blood = 0.3;
      else if (hit.part === 'torso') b.parts[0].blood = 0.3;
      else b.parts[6].blood = b.parts[8].blood = 0.35;
    } else {
      this.buckle(b, u, 1.1);
    }
    if (severed && !hit?.blast) b.blast(u.pos.x, u.pos.y + 0.6, u.pos.z, 3, 120, true);
    if (!dead) b.parts[0].blood = Math.max(b.parts[0].blood, 0.3);
    u._rd = b;
    this.bodies.push(b);
    if (this.bodies.length > MAX_BODIES) {
      const old = this.bodies.shift();
      old.u._rd = null;
    }
  }

  // Knees fold and the body drops: a small forward push on the knees, a
  // random sideways sway on the shoulders.
  buckle(b, u, k) {
    const fx = Math.sin(u.yaw);
    const fz = Math.cos(u.yaw);
    b.push(KN_L, fx * k, -0.3, fz * k);
    b.push(KN_R, fx * k * rr(0.6, 1.1), -0.3, fz * k * rr(0.6, 1.1));
    const sx = rr(-0.8, 0.8);
    const sz = rr(-0.8, 0.8);
    b.push(SH_L, sx, 0, sz);
    b.push(SH_R, sx, 0, sz);
  }

  update(dt, camera, frustum) {
    this.cam.copy(camera.position);
    const terrain = this.terrain;
    // Fixed-step physics for awake bodies (bounded per frame).
    this.acc = Math.min(this.acc + dt, STEP * 3);
    let awake = 0;
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      if (b.u.removed) {
        b.u._rd = null;
        this.bodies.splice(i, 1);
        continue;
      }
      b.age += dt;
      // Wounded who are still alive writhe now and then.
      if (!b.dead && b.u.alive) {
        b.writheT -= dt;
        if (b.writheT <= 0) {
          b.writheT = b.stable ? rr(3, 7) : rr(0.7, 2.2);
          const k = b.stable ? 0.5 : 1;
          const j = [HA_L, HA_R, FT_L, FT_R, HEAD, KN_L, KN_R][(rand() * 7) | 0];
          b.push(j, rr(-0.8, 0.8) * k, rr(0.8, 1.8) * k, rr(-0.8, 0.8) * k);
        }
      } else if (!b.u.alive) b.dead = true;
      if (!b.sleeping) awake++;
    }
    let steps = 0;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      steps++;
    }
    if (steps) {
      let n = 0;
      for (const b of this.bodies) {
        if (b.sleeping) continue;
        // Too many bodies moving at once: the oldest settle immediately.
        if (awake - n > MAX_AWAKE && b.age > 1.5) {
          b.sleeping = true;
          n++;
          continue;
        }
        for (let s = 0; s < steps; s++) b.step(terrain);
      }
    }
    // Blood: pools under bodies, spurting stumps.
    if (this.goreOn && this.gore) this.bleed(dt);
    this.draw(frustum);
  }

  bleed(dt) {
    const gore = this.gore;
    for (const b of this.bodies) {
      const d2 = (b.cx - this.cam.x) ** 2 + (b.cz - this.cam.z) ** 2;
      if (d2 > 300 * 300) continue;
      if (!b.pooled && (b.sleeping || b.age > 2.5)) {
        b.pooled = true;
        const big = b.stumps.length > 0 ? 0.6 : 0;
        gore.pool(b.cx, b.floor[HIP_L], b.cz, rr(0.8, 1.4) + big + (b.dead ? 0 : 0.5), rr(10, 22));
        for (const s of b.stumps) if (!s.body) gore.pool(b.p[s.i * 3], b.floor[s.i], b.p[s.i * 3 + 2], rr(0.3, 0.6), rr(4, 8));
      }
      if (b.age < 6 && d2 < 150 * 150) {
        for (const s of b.stumps) {
          if (!s.body || rand() > dt * 14) continue;
          const k = s.i * 3;
          const j = s.out * 3;
          const ox = b.p[k] - b.cx;
          const oz = b.p[k + 2] - b.cz;
          const ol = Math.hypot(ox, oz) || 1;
          const pulse = (0.55 + 0.45 * Math.sin(b.age * 9)) * (1 - b.age / 6);
          gore.spurt(b.p[k], b.p[k + 1], b.p[k + 2], (ox / ol) * 1.5 * pulse, 1.2 * pulse + 0.4, (oz / ol) * 1.5 * pulse, pulse);
          void j;
        }
      }
    }
  }

  draw(frustum) {
    const cam = this.cam;
    let stumps = 0;
    const sm = this.stumpMesh;
    for (const b of this.bodies) {
      if (b.dirty) b.computeMatrices();
      const dx = b.cx - cam.x;
      const dy = b.cy - cam.y;
      const dz = b.cz - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > DRAW_RANGE * DRAW_RANGE) continue;
      _sphere.center.set(b.cx, b.cy, b.cz);
      _sphere.radius = b.radius;
      if (!frustum.intersectsSphere(_sphere)) continue;
      const lod = d2 < NEAR_RANGE * NEAR_RANGE ? 0 : 1;
      const batch = this.batches[b.faction][lod];
      for (let i = 0; i < b.parts.length; i++) {
        const part = b.parts[i];
        if (part.type === P_WEAPON) {
          if (lod === 0) this.weaponBatches[b.variant].push(b.mats, i * 16, 0, 0);
        } else batch[part.type].push(b.mats, i * 16, b.seed, this.goreOn ? part.blood : 0);
      }
      if (this.goreOn && lod === 0 && stumps < 256) {
        for (const s of b.stumps) {
          if (stumps >= 256) break;
          const k = s.i * 3;
          this.stumpM.makeTranslation(b.p[k], b.p[k + 1], b.p[k + 2]);
          sm.setMatrixAt(stumps++, this.stumpM);
        }
      }
    }
    for (const f of this.batches) for (const l of f) for (const pb of l) pb.end();
    for (const wb of this.weaponBatches) wb.end();
    sm.count = stumps;
    if (stumps) sm.instanceMatrix.needsUpdate = true;
  }
}
