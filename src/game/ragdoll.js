// Ragdoll physics for dead players: a Verlet particle body (14 particles: head, shoulders,
// elbows, hands, hips, knees, feet and a chest point) with rigid distance constraints, range
// constraints, simple anatomical limits (knee/elbow hinges, hip cones, neck cone), gravity,
// swept-box collision against the world brushes, Coulomb-style ground friction and sleeping.
//
// GoldSrc space throughout (x east, y north, z up, units ~ inches). The body is initialised
// from the PlayerModel's current animated pose (so it starts exactly where the alive model
// was, crouch included) plus the killing impulse, and drives the model's existing bones every
// frame (each limb bone = its pose at death swung onto the particle direction, the torso is
// rigid), so the same low-poly skinned mesh is used.
//
//   const ragdolls = new RagdollSystem(collisionWorld);
//   ragdolls.spawn(playerModel, { origin, velocity, hit, headshot, weaponId }) -> Ragdoll | null
//   per frame: ragdolls.update(dt)  (before the models are updated; PlayerModel.update() calls
//   model.ragdoll.pose()). PlayerModel.reset()/dispose() detach the ragdoll.
//
// hit = { dir:[x,y,z] (travel direction of the shot / blast -> victim), point:[x,y,z] (GS),
//         damage, hitgroup (1 head .. 7 right leg), weaponId, blast:bool, from:[x,y,z] (attacker) }
import * as THREE from 'three';
import { TraceResult, CONTENTS_SOLID } from '../engine/collision.js';

const GRAVITY = 800; // sv_gravity, u/s^2
const STEP = 1 / 120; // fixed sub-step
const MAX_STEPS = 12; // per frame (0.1 s; slower frames just run the body in slow motion)
const ITERATIONS = 4; // constraint relaxation passes per sub-step
const MAX_ACTIVE = 12; // simulated bodies at once; spawning another freezes the oldest
const MASK = CONTENTS_SOLID; // world brushes only (no player clips, no live players)
const FRICTION = 0.9; // Coulomb coefficient for ground/wall contacts (cloth on stone/sand)
const CONTACT_DAMP = 6.0; // extra tangential damping (1/s) while touching something
const AIR_DAMP = 0.15; // linear velocity damping (1/s)
const SLEEP_SPEED = 3; // u/s: every particle slower than this...
const SLEEP_TIME = 0.5; // ...for this long puts the body to sleep
const NUDGE_TIME = 0.15; // when first nearly still, nudge free particles once (breaks balanced limbs)
const MAX_AWAKE = 7; // seconds, then sleep regardless
const MAX_SPEED = 2000; // u/s clamp (safety)

// ------------------------------------------------------------------ body definition
export const HEAD = 0, SH_R = 1, SH_L = 2, EL_R = 3, EL_L = 4, HA_R = 5, HA_L = 6;
export const HIP_R = 7, HIP_L = 8, KN_R = 9, KN_L = 10, FT_R = 11, FT_L = 12, CHEST = 13;
const N = 14;

// bone the particle is attached to, offset in that bone's frame, collision radius, mass
const PDEF = [
  ['head', [0.7, 0, 4.5], 4.4, 1.2],
  ['upperarm_r', [0, 0, 0], 4.4, 2.0],
  ['upperarm_l', [0, 0, 0], 4.4, 2.0],
  ['forearm_r', [0, 0, 0], 2.6, 0.7],
  ['forearm_l', [0, 0, 0], 2.6, 0.7],
  ['hand_r', [0.3, 0.3, -3.2], 2.4, 0.5],
  ['hand_l', [0.3, -0.3, -3.2], 2.4, 0.5],
  ['thigh_r', [0, 0, 0], 5.0, 2.5],
  ['thigh_l', [0, 0, 0], 5.0, 2.5],
  ['shin_r', [0, 0, 0], 3.4, 1.4],
  ['shin_l', [0, 0, 0], 3.4, 1.4],
  ['foot_r', [0.8, 0, -0.4], 2.8, 0.8],
  ['foot_l', [0.8, 0, -0.4], 2.8, 0.8],
  ['chest', [2.5, 0, 4], 4.0, 2.0],
];
const RADIUS = PDEF.map((d) => d[2]);
const INV_MASS = Float64Array.from(PDEF.map((d) => 1 / d[3]));
const BOX_MIN = RADIUS.map((r) => [-r, -r, -r]);
const BOX_MAX = RADIUS.map((r) => [r, r, r]);

// constraints: rigid (rest = length at death), and lower bounds (no folding / interpenetration)
const TORSO = [SH_R, SH_L, HIP_R, HIP_L, CHEST];
const RIGID = [
  [HEAD, SH_R], [HEAD, SH_L],
  [SH_R, EL_R], [EL_R, HA_R], [SH_L, EL_L], [EL_L, HA_L],
  [HIP_R, KN_R], [KN_R, FT_R], [HIP_L, KN_L], [KN_L, FT_L],
];
for (let i = 0; i < TORSO.length; i++) for (let j = i + 1; j < TORSO.length; j++) RIGID.push([TORSO[i], TORSO[j]]);
// [a, b, kind, value]: 'fold' = fraction of the two-segment chain length, 'sep' = sum of radii
const MINS = [
  [SH_R, HA_R, 'fold', 0.4], [SH_L, HA_L, 'fold', 0.4], // elbows bend ~140 deg max
  [HIP_R, FT_R, 'fold', 0.5], [HIP_L, FT_L, 'fold', 0.5], // knees ~120 deg
  [KN_R, KN_L, 'sep'], [FT_R, FT_L, 'sep'],
  [EL_R, CHEST, 'sep'], [EL_L, CHEST, 'sep'], [HA_R, CHEST, 'sep'], [HA_L, CHEST, 'sep'],
  [HA_R, HIP_R, 'sep'], [HA_L, HIP_L, 'sep'], [KN_R, HA_R, 'sep'], [KN_L, HA_L, 'sep'],
];

// anatomical limits (unit-vector components in the torso frame)
const NECK_COS = Math.cos((38 * Math.PI) / 180), NECK_SIN = Math.sin((38 * Math.PI) / 180); // cone around the pose at death
const HIP_FLEX_MIN = (-35 * Math.PI) / 180, HIP_FLEX_MAX = (120 * Math.PI) / 180; // thigh swing in the sagittal plane (0 = down)
const HIP_FLEX_SPLIT = (HIP_FLEX_MIN + HIP_FLEX_MAX) / 2 - Math.PI; // middle of the forbidden arc
const HIP_ABD_MIN = (-15 * Math.PI) / 180, HIP_ABD_MAX = (45 * Math.PI) / 180; // out of the sagittal plane (+ = outward)
const KNEE_TOL = 0.06; // shin may not swing in front of the thigh line (no hyperextension)
const KNEE_SIDE = 0.3; // sideways play of the knee hinge
const ELBOW_TOL = 0.12; // forearm may not swing behind the upper arm line
const LIMIT_K = 0.5; // joint-limit stiffness per relaxation pass

// which particle takes the hit, per hitgroup, and its skeletal neighbours
const GROUP_PARTICLES = {
  1: [HEAD], 2: [CHEST, SH_R, SH_L], 3: [HIP_R, HIP_L, CHEST],
  4: [SH_L, EL_L, HA_L], 5: [SH_R, EL_R, HA_R], 6: [HIP_L, KN_L, FT_L], 7: [HIP_R, KN_R, FT_R],
};
const NEIGHBOURS = [
  [SH_R, SH_L, CHEST], // head
  [CHEST, HEAD, EL_R, SH_L], [CHEST, HEAD, EL_L, SH_R], // shoulders
  [SH_R, HA_R], [SH_L, HA_L], [EL_R], [EL_L], // elbows, hands
  [HIP_L, CHEST, KN_R], [HIP_R, CHEST, KN_L], // hips
  [HIP_R, FT_R], [HIP_L, FT_L], [KN_R], [KN_L], // knees, feet
  [SH_R, SH_L, HEAD, HIP_R, HIP_L], // chest
];
// how hard each weapon throws the body (x the damage-based push)
const PUSH = { awp: 1.35, scout: 1.15, g3sg1: 1.15, sg550: 1.15, m3: 2.4, xm1014: 2.1, deagle: 1.2, knife: 0.8 };

// bones driven by a particle pair: bone <- direction from particle a (-1 = shoulder midpoint) to b
const DRIVES = [
  ['neck', -1, HEAD],
  ['upperarm_r', SH_R, EL_R], ['forearm_r', EL_R, HA_R],
  ['upperarm_l', SH_L, EL_L], ['forearm_l', EL_L, HA_L],
  ['thigh_r', HIP_R, KN_R], ['shin_r', KN_R, FT_R],
  ['thigh_l', HIP_L, KN_L], ['shin_l', KN_L, FT_L],
];

// ------------------------------------------------------------------ scratch
const FR = new Float64Array(15); // torso frame: X(fwd) Y(left) Z(up), hip midpoint, shoulder midpoint
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1);

/** Torso frame from the particles (writes FR). X = forward, Y = left, Z = up the spine. */
function torsoFrame(x, F) {
  const a = SH_R * 3, b = SH_L * 3, c = HIP_R * 3, e = HIP_L * 3;
  const smx = (x[a] + x[b]) * 0.5, smy = (x[a + 1] + x[b + 1]) * 0.5, smz = (x[a + 2] + x[b + 2]) * 0.5;
  const hmx = (x[c] + x[e]) * 0.5, hmy = (x[c + 1] + x[e + 1]) * 0.5, hmz = (x[c + 2] + x[e + 2]) * 0.5;
  let zx = smx - hmx, zy = smy - hmy, zz = smz - hmz;
  let l = Math.hypot(zx, zy, zz) || 1;
  zx /= l; zy /= l; zz /= l;
  let yx = x[b] - x[a] + x[e] - x[c], yy = x[b + 1] - x[a + 1] + x[e + 1] - x[c + 1], yz = x[b + 2] - x[a + 2] + x[e + 2] - x[c + 2];
  const d = yx * zx + yy * zy + yz * zz;
  yx -= d * zx; yy -= d * zy; yz -= d * zz;
  l = Math.hypot(yx, yy, yz) || 1;
  yx /= l; yy /= l; yz /= l;
  F[0] = yy * zz - yz * zy; F[1] = yz * zx - yx * zz; F[2] = yx * zy - yy * zx;
  F[3] = yx; F[4] = yy; F[5] = yz;
  F[6] = zx; F[7] = zy; F[8] = zz;
  F[9] = hmx; F[10] = hmy; F[11] = hmz;
  F[12] = smx; F[13] = smy; F[14] = smz;
  return F;
}

function frameQuat(F, out) {
  _m.set(F[0], F[3], F[6], 0, F[1], F[4], F[7], 0, F[2], F[5], F[8], 0, 0, 0, 0, 1);
  return out.setFromRotationMatrix(_m);
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ one body
export class Ragdoll {
  constructor(model, sys, opts = {}) {
    this.model = model;
    this.sys = sys;
    this.awake = true;
    this.dirty = true;
    this.age = 0;
    this.still = 0;
    this.nudged = false;
    this.acc = 0;
    this.contact = new Uint8Array(N); // touched the world during the last step
    this.x = new Float64Array(N * 3);
    this.xp = new Float64Array(N * 3);
    this.xs = new Float64Array(N * 3);
    const rig = model.rig, B = rig.b, obj = model.object3D;

    // 1. bake the model's yaw into the pelvis so model space == world axes (object only translates)
    const yaw = obj.rotation.z;
    if (yaw) {
      _q.setFromAxisAngle(_zAxis, yaw);
      B.pelvis.q.premultiply(_q);
      B.pelvis.p.applyQuaternion(_q);
      obj.rotation.set(0, 0, 0);
    }
    rig.fkAll();
    const base = obj.position;

    // 2. particles from the current pose
    const x = this.x;
    for (let i = 0; i < N; i++) {
      const [bone, off] = PDEF[i];
      rig.point(B[bone], _v.set(off[0], off[1], off[2]), _v2);
      x[i * 3] = _v2.x + base.x; x[i * 3 + 1] = _v2.y + base.y; x[i * 3 + 2] = _v2.z + base.z;
    }

    // 3. constraints (rest lengths from this pose)
    const cons = [];
    const dist = (a, b) => Math.hypot(x[a * 3] - x[b * 3], x[a * 3 + 1] - x[b * 3 + 1], x[a * 3 + 2] - x[b * 3 + 2]);
    for (const [a, b] of RIGID) { const d = dist(a, b); cons.push([a, b, d, d]); }
    const restOf = (a, b) => cons.find((c) => (c[0] === a && c[1] === b) || (c[0] === b && c[1] === a))?.[2] || 0;
    for (const [a, b, kind, val] of MINS) {
      let lo;
      if (kind === 'fold') {
        const mid = a === SH_R ? EL_R : a === SH_L ? EL_L : a === HIP_R ? KN_R : KN_L;
        lo = val * (restOf(a, mid) + restOf(mid, b));
      } else lo = RADIUS[a] + RADIUS[b];
      lo = Math.min(lo, dist(a, b) * 0.95); // never violated by the starting pose
      cons.push([a, b, lo, Infinity]);
    }
    this.nc = cons.length;
    this.cA = Uint8Array.from(cons.map((c) => c[0]));
    this.cB = Uint8Array.from(cons.map((c) => c[1]));
    this.cLo = Float64Array.from(cons.map((c) => c[2]));
    this.cHi = Float64Array.from(cons.map((c) => c[3]));

    // 4. pose drivers (relative to the torso frame / parent bones at death)
    const F = torsoFrame(x, FR);
    const qT = frameQuat(F, new THREE.Quaternion());
    const qTi = qT.clone().invert();
    this.relPelvisQ = qTi.clone().multiply(B.pelvis.wq);
    this.relPelvisP = new THREE.Vector3(B.pelvis.wp.x + base.x - F[9], B.pelvis.wp.y + base.y - F[10], B.pelvis.wp.z + base.z - F[11]).applyQuaternion(qTi);
    this.drives = new Array(rig.bones.length).fill(null);
    for (const [name, a, b] of DRIVES) {
      const bone = B[name];
      const parent = rig.bones[bone.parent];
      this._dir(a, b, _v);
      _v.applyQuaternion(_q2.copy(parent.wq).invert());
      this.drives[bone.i] = { a, b, d0: _v.clone().normalize(), q0: bone.q.clone() };
    }
    // chest point's height above the shoulder/hip plane (keeps the torso from inverting)
    this.chestOut = (x[CHEST * 3] - F[9]) * F[0] + (x[CHEST * 3 + 1] - F[10]) * F[1] + (x[CHEST * 3 + 2] - F[11]) * F[2];
    // neck cone axis in torso coordinates
    {
      const h = HEAD * 3;
      let nx = x[h] - F[12], ny = x[h + 1] - F[13], nz = x[h + 2] - F[14];
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      this.n0 = [nx * F[0] + ny * F[1] + nz * F[2], nx * F[3] + ny * F[4] + nz * F[5], nx * F[6] + ny * F[7] + nz * F[8]];
    }

    // 5. pull any particle that starts inside a wall (rifle barrels, hands, knees) back out:
    //    sweep it from the hull centre, which is known to be clear
    const org = opts.origin || [base.x, base.y, base.z + 36];
    const col = sys.collision, tr = sys.tr, s = sys._s, e = sys._e;
    for (let i = 0; i < N; i++) {
      s[0] = org[0]; s[1] = org[1]; s[2] = org[2];
      e[0] = x[i * 3]; e[1] = x[i * 3 + 1]; e[2] = x[i * 3 + 2];
      col.trace(s, e, BOX_MIN[i], BOX_MAX[i], MASK, tr);
      if (!tr.startsolid && tr.fraction < 1) { x[i * 3] = tr.endpos[0]; x[i * 3 + 1] = tr.endpos[1]; x[i * 3 + 2] = tr.endpos[2]; }
    }

    // 6. initial velocities: movement at death + collapse + the killing blow
    const v = new Float64Array(N * 3);
    this._impulse(v, opts, F);
    for (let i = 0; i < N * 3; i++) this.xp[i] = x[i] - v[i] * STEP;
  }

  /** Unit direction from particle a (-1 = shoulder midpoint) to b, into out. */
  _dir(a, b, out) {
    const x = this.x;
    let ax, ay, az;
    if (a < 0) {
      ax = (x[SH_R * 3] + x[SH_L * 3]) * 0.5; ay = (x[SH_R * 3 + 1] + x[SH_L * 3 + 1]) * 0.5; az = (x[SH_R * 3 + 2] + x[SH_L * 3 + 2]) * 0.5;
    } else { ax = x[a * 3]; ay = x[a * 3 + 1]; az = x[a * 3 + 2]; }
    out.set(x[b * 3] - ax, x[b * 3 + 1] - ay, x[b * 3 + 2] - az);
    const l = out.length();
    if (l > 1e-6) out.multiplyScalar(1 / l); else out.set(0, 0, -1);
    return out;
  }

  _impulse(v, opts, F) {
    const x = this.x;
    const rnd = (a) => (Math.random() * 2 - 1) * a;
    const add = (i, vx, vy, vz) => { v[i * 3] += vx; v[i * 3 + 1] += vy; v[i * 3 + 2] += vz; };
    // centre of the body
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < N; i++) { cx += x[i * 3]; cy += x[i * 3 + 1]; cz += x[i * 3 + 2]; }
    cx /= N; cy /= N; cz /= N;
    // running / falling momentum carries over
    const pv = opts.velocity;
    if (pv) for (let i = 0; i < N; i++) add(i, pv[0] * 0.9, pv[1] * 0.9, Math.max(-600, Math.min(300, pv[2])) * 0.9);
    // collapse: the knees give way (forward, which the knee hinge allows), a slight random twist
    const fx = F[0], fy = F[1], fz = F[2], lx = F[3], ly = F[4];
    const kick = 45 + Math.random() * 25, side = rnd(18);
    add(KN_R, fx * kick + lx * side, fy * kick + ly * side, fz * kick);
    add(KN_L, fx * kick + lx * side, fy * kick + ly * side, fz * kick);
    const twist = rnd(25);
    add(SH_R, fx * twist, fy * twist, 0); add(SH_L, -fx * twist, -fy * twist, 0);

    const hit = opts.hit;
    if (!hit) {
      // no shot (fall damage, team switch...): a nudge in a random horizontal direction
      const a = Math.random() * Math.PI * 2;
      for (let i = 0; i < N; i++) add(i, Math.cos(a) * 25, Math.sin(a) * 25, 0);
      return;
    }
    const weaponId = hit.weaponId || opts.weaponId;
    const dmg = Math.max(1, hit.damage || 30);
    // direction of the blow
    let dx = 0, dy = 0, dz = 0;
    if (hit.dir) { dx = hit.dir[0]; dy = hit.dir[1]; dz = hit.dir[2] || 0; }
    else if (hit.from) { dx = cx - hit.from[0]; dy = cy - hit.from[1]; dz = 0; }
    let l = Math.hypot(dx, dy, dz);
    if (l < 1e-6) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); dz = hit.blast ? 0.3 : 0; l = Math.hypot(dx, dy, dz); }
    dx /= l; dy /= l; dz /= l;

    if (hit.blast) {
      // HE / C4: everything is thrown outward and up; the side facing the blast gets more,
      // which makes the body tumble away from it
      const S = clamp(100 + Math.min(dmg, 150) * 2.2, 140, 440);
      let bx = dx, by = dy, bz = dz + 0.65;
      const bl = Math.hypot(bx, by, bz);
      bx /= bl; by /= bl; bz /= bl;
      for (let i = 0; i < N; i++) {
        const toward = -((x[i * 3] - cx) * dx + (x[i * 3 + 1] - cy) * dy + (x[i * 3 + 2] - cz) * dz) / 24;
        const w = S * (1 + clamp(toward, -0.45, 0.45)) * (0.9 + Math.random() * 0.2);
        add(i, bx * w, by * w, bz * w);
      }
      return;
    }
    // bullets / knife: the struck part takes most of it, its neighbours some, the rest a little
    const S = clamp((30 + Math.min(dmg, 120) * 1.2) * (PUSH[weaponId] || 1) * (opts.headshot ? 1.25 : 1), 30, 320);
    let target = CHEST;
    const cand = GROUP_PARTICLES[hit.hitgroup] || null;
    if (hit.point) {
      const list = cand || [HEAD, SH_R, SH_L, EL_R, EL_L, HA_R, HA_L, HIP_R, HIP_L, KN_R, KN_L, FT_R, FT_L, CHEST];
      let best = Infinity;
      for (const i of list) {
        const d2 = (x[i * 3] - hit.point[0]) ** 2 + (x[i * 3 + 1] - hit.point[1]) ** 2 + (x[i * 3 + 2] - hit.point[2]) ** 2;
        if (d2 < best) { best = d2; target = i; }
      }
    } else if (cand) target = cand[0];
    const nb = NEIGHBOURS[target];
    for (let i = 0; i < N; i++) {
      const f = i === target ? 1.6 : nb.includes(i) ? 0.6 : 0.25;
      add(i, dx * S * f, dy * S * f, dz * S * f);
    }
  }

  /** Stop simulating (keeps the current pose). */
  sleep() {
    this.awake = false;
    this.dirty = true;
  }

  /** Called by PlayerModel.reset()/dispose(): the body is gone. */
  detach() {
    if (this.model && this.model.ragdoll === this) this.model.ragdoll = null;
    this.awake = false;
    this.removed = true;
  }

  simulate(dt) {
    this.age += dt;
    this.acc += dt;
    let n = Math.floor(this.acc / STEP);
    if (n > MAX_STEPS) { n = MAX_STEPS; this.acc = 0; } else this.acc -= n * STEP;
    for (let i = 0; i < n && this.awake; i++) this._step(STEP);
    if (n > 0) this.dirty = true;
    if (this.awake && this.age > MAX_AWAKE) this.sleep();
  }

  _step(h) {
    const x = this.x, xp = this.xp, xs = this.xs;
    const damp = 1 - AIR_DAMP * h;
    const g = GRAVITY * h * h;
    const vmax = MAX_SPEED * h;
    // integrate
    for (let o = 0; o < N * 3; o += 3) {
      let vx = (x[o] - xp[o]) * damp, vy = (x[o + 1] - xp[o + 1]) * damp, vz = (x[o + 2] - xp[o + 2]) * damp;
      const sp = vx * vx + vy * vy + vz * vz;
      if (sp > vmax * vmax) { const k = vmax / Math.sqrt(sp); vx *= k; vy *= k; vz *= k; }
      xs[o] = xp[o] = x[o]; xs[o + 1] = xp[o + 1] = x[o + 1]; xs[o + 2] = xp[o + 2] = x[o + 2];
      x[o] += vx; x[o + 1] += vy; x[o + 2] += vz - g;
    }
    // constraints
    for (let it = 0; it < ITERATIONS; it++) {
      this._distances();
      this._limits();
    }
    // collide each particle along its whole move this step (start position is always clear)
    const col = this.sys.collision, tr = this.sys.tr, s = this.sys._s, e = this.sys._e;
    let maxMove = 0;
    const contact = this.contact;
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      contact[i] = 0;
      s[0] = xs[o]; s[1] = xs[o + 1]; s[2] = xs[o + 2];
      e[0] = x[o]; e[1] = x[o + 1]; e[2] = x[o + 2];
      col.trace(s, e, BOX_MIN[i], BOX_MAX[i], MASK, tr);
      if (!tr.allsolid && tr.fraction < 1) {
        const vx = x[o] - xs[o], vy = x[o + 1] - xs[o + 1], vz = x[o + 2] - xs[o + 2];
        const nx = tr.normal[0], ny = tr.normal[1], nz = tr.normal[2];
        const vn = vx * nx + vy * ny + vz * nz;
        x[o] = tr.endpos[0]; x[o + 1] = tr.endpos[1]; x[o + 2] = tr.endpos[2];
        contact[i] = 1;
        if (vn < 0) {
          // inelastic contact: drop the normal velocity, friction on the tangential part
          let tx = vx - vn * nx, ty = vy - vn * ny, tz = vz - vn * nz;
          const tl = Math.hypot(tx, ty, tz);
          const drop = -vn * FRICTION + tl * CONTACT_DAMP * h;
          const k = tl > drop ? (tl - drop) / tl : 0;
          tx *= k; ty *= k; tz *= k;
          xp[o] = x[o] - tx; xp[o + 1] = x[o + 1] - ty; xp[o + 2] = x[o + 2] - tz;
        } else {
          xp[o] = x[o] - vx; xp[o + 1] = x[o + 1] - vy; xp[o + 2] = x[o + 2] - vz;
        }
      }
      const mx = x[o] - xs[o], my = x[o + 1] - xs[o + 1], mz = x[o + 2] - xs[o + 2];
      const m2 = mx * mx + my * my + mz * mz;
      if (m2 > maxMove) maxMove = m2;
    }
    if (!(maxMove < 1e9)) { // NaN / blow-up guard: restore and freeze
      x.set(xs); xp.set(xs);
      this.sleep();
      return;
    }
    // sleep once everything has been (nearly) still for a while
    const lim = SLEEP_SPEED * h;
    if (maxMove < lim * lim) {
      this.still += h;
      if (!this.nudged && this.still > NUDGE_TIME) {
        // a limb resting in an unstable balance (e.g. a shin standing up) moves too slowly to
        // notice at first: a tiny random push makes it fall instead of freezing upright
        this.nudged = true;
        this.still = 0;
        for (let i = 0; i < N; i++) {
          if (contact[i]) continue;
          const o = i * 3, k = 2 * h;
          xp[o] -= (Math.random() - 0.5) * k; xp[o + 1] -= (Math.random() - 0.5) * k; xp[o + 2] -= (Math.random() - 0.5) * k;
        }
      } else if (this.still > SLEEP_TIME) this.sleep();
    } else this.still = 0;
  }

  _distances() {
    const x = this.x, A = this.cA, Bc = this.cB, LO = this.cLo, HI = this.cHi, W = INV_MASS;
    for (let k = 0; k < this.nc; k++) {
      const ia = A[k], ib = Bc[k], a = ia * 3, b = ib * 3;
      const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      const lo = LO[k], hi = HI[k];
      let target;
      if (d2 < lo * lo) target = lo;
      else if (d2 > hi * hi) target = hi;
      else continue;
      const d = Math.sqrt(d2) || 1e-6;
      const wa = W[ia], wb = W[ib];
      const s = (d - target) / (d * (wa + wb));
      x[a] += dx * s * wa; x[a + 1] += dy * s * wa; x[a + 2] += dz * s * wa;
      x[b] -= dx * s * wb; x[b + 1] -= dy * s * wb; x[b + 2] -= dz * s * wb;
    }
  }

  /**
   * Joint-limit correction: move particles i and j so that (x_j - x_i) approaches the vector v.
   * Split by inverse mass (momentum conserving, like a distance constraint) and softened, so a
   * limit fighting a ground contact can't push the body across the floor.
   */
  _rel(i, j, vx, vy, vz) {
    const x = this.x, a = i * 3, b = j * 3;
    const dx = (vx - (x[b] - x[a])) * LIMIT_K, dy = (vy - (x[b + 1] - x[a + 1])) * LIMIT_K, dz = (vz - (x[b + 2] - x[a + 2])) * LIMIT_K;
    const wi = INV_MASS[i], wj = INV_MASS[j], s = 1 / (wi + wj);
    const kj = wj * s, ki = wi * s;
    x[b] += dx * kj; x[b + 1] += dy * kj; x[b + 2] += dz * kj;
    x[a] -= dx * ki; x[a + 1] -= dy * ki; x[a + 2] -= dz * ki;
  }

  _limits() {
    const x = this.x, F = torsoFrame(this.x, FR);
    // torso orientation: distance constraints alone allow the mirror image, so keep the chest
    // point in front of the shoulder/hip plane (signed-volume constraint)
    {
      const c = CHEST * 3;
      const d = (x[c] - F[9]) * F[0] + (x[c + 1] - F[10]) * F[1] + (x[c + 2] - F[11]) * F[2];
      const want = this.chestOut * 0.8;
      if (d < want) {
        const corr = (want - d) * LIMIT_K, wc = INV_MASS[CHEST], w4 = 1 / (1 / INV_MASS[SH_R] + 1 / INV_MASS[SH_L] + 1 / INV_MASS[HIP_R] + 1 / INV_MASS[HIP_L]);
        const kc = (corr * wc) / (wc + w4), k4 = (corr * w4) / (wc + w4);
        x[c] += F[0] * kc; x[c + 1] += F[1] * kc; x[c + 2] += F[2] * kc;
        for (const i of [SH_R * 3, SH_L * 3, HIP_R * 3, HIP_L * 3]) { x[i] -= F[0] * k4; x[i + 1] -= F[1] * k4; x[i + 2] -= F[2] * k4; }
      }
    }
    // neck: the head stays within a cone around its direction (in torso space) at death
    {
      const h = HEAD * 3;
      let nx = x[h] - F[12], ny = x[h + 1] - F[13], nz = x[h + 2] - F[14];
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-6) {
        nx /= len; ny /= len; nz /= len;
        const n0 = this.n0;
        const ax = F[0] * n0[0] + F[3] * n0[1] + F[6] * n0[2];
        const ay = F[1] * n0[0] + F[4] * n0[1] + F[7] * n0[2];
        const az = F[2] * n0[0] + F[5] * n0[1] + F[8] * n0[2];
        const c = nx * ax + ny * ay + nz * az;
        if (c < NECK_COS) {
          let px = nx - c * ax, py = ny - c * ay, pz = nz - c * az;
          const pl = Math.hypot(px, py, pz);
          if (pl > 1e-6) {
            px /= pl; py /= pl; pz /= pl;
            // head vs the shoulder midpoint (both shoulders share the reaction)
            const tx = (ax * NECK_COS + px * NECK_SIN) * len, ty = (ay * NECK_COS + py * NECK_SIN) * len, tz = (az * NECK_COS + pz * NECK_SIN) * len;
            const dx = (tx - nx * len) * LIMIT_K, dy = (ty - ny * len) * LIMIT_K, dz = (tz - nz * len) * LIMIT_K;
            const wh = INV_MASS[HEAD], ws = 1 / (1 / INV_MASS[SH_R] + 1 / INV_MASS[SH_L]), k = 1 / (wh + ws);
            x[h] += dx * wh * k; x[h + 1] += dy * wh * k; x[h + 2] += dz * wh * k;
            for (const sh of [SH_R * 3, SH_L * 3]) { x[sh] -= dx * ws * k; x[sh + 1] -= dy * ws * k; x[sh + 2] -= dz * ws * k; }
          }
        }
      }
    }
    this._leg(HIP_R, KN_R, FT_R, -1, F);
    this._leg(HIP_L, KN_L, FT_L, 1, F);
    this._arm(SH_R, EL_R, HA_R, F);
    this._arm(SH_L, EL_L, HA_L, F);
  }

  _leg(hi, ki, fi, side, F) {
    const x = this.x, h = hi * 3, k = ki * 3, f = fi * 3;
    let tx = x[k] - x[h], ty = x[k + 1] - x[h + 1], tz = x[k + 2] - x[h + 2];
    let lt = Math.hypot(tx, ty, tz);
    if (lt < 1e-6) return;
    tx /= lt; ty /= lt; tz /= lt;
    // hip: flexion/extension (sagittal plane) and abduction/adduction limits, in the torso frame
    let cx = tx * F[0] + ty * F[1] + tz * F[2];
    let cy = (tx * F[3] + ty * F[4] + tz * F[5]) * side; // outward for this leg
    let cz = tx * F[6] + ty * F[7] + tz * F[8];
    let abd = Math.asin(clamp(cy, -1, 1));
    let flex = cx * cx + cz * cz > 0.0025 ? Math.atan2(cx, -cz) : 0;
    let fix = false;
    if (abd > HIP_ABD_MAX) { abd = HIP_ABD_MAX; fix = true; } else if (abd < HIP_ABD_MIN) { abd = HIP_ABD_MIN; fix = true; }
    // the forbidden flexion arc is split at its middle so the clamp never flips sides
    if (flex > HIP_FLEX_MAX || flex < HIP_FLEX_SPLIT) { flex = HIP_FLEX_MAX; fix = true; } else if (flex < HIP_FLEX_MIN) { flex = HIP_FLEX_MIN; fix = true; }
    if (fix) {
      const r = Math.cos(abd);
      cx = r * Math.sin(flex); cy = Math.sin(abd); cz = -r * Math.cos(flex);
      const yy = cy * side;
      this._rel(hi, ki, (F[0] * cx + F[3] * yy + F[6] * cz) * lt, (F[1] * cx + F[4] * yy + F[7] * cz) * lt, (F[2] * cx + F[5] * yy + F[8] * cz) * lt);
      tx = x[k] - x[h]; ty = x[k + 1] - x[h + 1]; tz = x[k + 2] - x[h + 2];
      lt = Math.hypot(tx, ty, tz) || 1;
      tx /= lt; ty /= lt; tz /= lt;
    }
    // knee hinge: kf = thigh x lateral is the knee's front; the shin must stay behind it
    let kx = ty * F[5] - tz * F[4], ky = tz * F[3] - tx * F[5], kz = tx * F[4] - ty * F[3];
    const kl = Math.hypot(kx, ky, kz);
    if (kl < 0.25) return;
    kx /= kl; ky /= kl; kz /= kl;
    const ax = ty * kz - tz * ky, ay = tz * kx - tx * kz, az = tx * ky - ty * kx; // hinge axis
    let sx = x[f] - x[k], sy = x[f + 1] - x[k + 1], sz = x[f + 2] - x[k + 2];
    const ls = Math.hypot(sx, sy, sz);
    if (ls < 1e-6) return;
    sx /= ls; sy /= ls; sz /= ls;
    const a = sx * kx + sy * ky + sz * kz, b = sx * ax + sy * ay + sz * az;
    const a2 = a > KNEE_TOL ? KNEE_TOL : a, b2 = clamp(b, -KNEE_SIDE, KNEE_SIDE);
    if (a2 !== a || b2 !== b) {
      sx += kx * (a2 - a) + ax * (b2 - b); sy += ky * (a2 - a) + ay * (b2 - b); sz += kz * (a2 - a) + az * (b2 - b);
      const l = ls / (Math.hypot(sx, sy, sz) || 1);
      this._rel(ki, fi, sx * l, sy * l, sz * l);
    }
  }

  _arm(si, ei, hi, F) {
    const x = this.x, s = si * 3, e = ei * 3, h = hi * 3;
    let ux = x[e] - x[s], uy = x[e + 1] - x[s + 1], uz = x[e + 2] - x[s + 2];
    const lu = Math.hypot(ux, uy, uz);
    if (lu < 1e-6) return;
    ux /= lu; uy /= lu; uz /= lu;
    // elbow front = upper arm x lateral (forward for a hanging arm); the forearm may not go behind
    let fx = uy * F[5] - uz * F[4], fy = uz * F[3] - ux * F[5], fz = ux * F[4] - uy * F[3];
    const fl = Math.hypot(fx, fy, fz);
    if (fl < 0.3) return; // arm along the shoulder axis: hinge direction undefined
    fx /= fl; fy /= fl; fz /= fl;
    let ax = x[h] - x[e], ay = x[h + 1] - x[e + 1], az = x[h + 2] - x[e + 2];
    const la = Math.hypot(ax, ay, az);
    if (la < 1e-6) return;
    ax /= la; ay /= la; az /= la;
    const c = ax * fx + ay * fy + az * fz;
    if (c < -ELBOW_TOL) {
      const k = -ELBOW_TOL - c;
      ax += fx * k; ay += fy * k; az += fz * k;
      const l = la / (Math.hypot(ax, ay, az) || 1);
      this._rel(ei, hi, ax * l, ay * l, az * l);
    }
  }

  /** Write the particle pose into the model's rig (PlayerModel.update calls this). */
  pose() {
    if (!this.dirty) return;
    this.dirty = false;
    const model = this.model, rig = model.rig, B = rig.b, x = this.x;
    const F = torsoFrame(x, FR);
    const qT = frameQuat(F, _q);
    // keep the object (and its fixed culling sphere, centred 30 above the origin) on the body
    const obj = model.object3D;
    obj.position.set(F[9], F[10], F[11] - 30);
    obj.rotation.set(0, 0, 0);
    const root = B.root;
    root.q.identity(); root.p.set(0, 0, 0);
    rig.fk(root);
    const pel = B.pelvis;
    pel.q.multiplyQuaternions(qT, this.relPelvisQ);
    pel.p.copy(this.relPelvisP).applyQuaternion(qT);
    pel.p.x += F[9] - obj.position.x; pel.p.y += F[10] - obj.position.y; pel.p.z += F[11] - obj.position.z;
    rig.fk(pel);
    const bones = rig.bones;
    for (let i = pel.i + 1; i < bones.length; i++) {
      const b = bones[i], d = this.drives[i];
      if (d) {
        // swing the bone's death pose (relative to its parent) onto the particle direction
        this._dir(d.a, d.b, _v);
        _v.applyQuaternion(_q2.copy(bones[b.parent].wq).invert());
        _q2.setFromUnitVectors(d.d0, _v);
        b.q.multiplyQuaternions(_q2, d.q0);
      }
      rig.fk(b);
    }
  }

  /** World-space particle position (debug / tests). */
  particle(i, out = [0, 0, 0]) {
    out[0] = this.x[i * 3]; out[1] = this.x[i * 3 + 1]; out[2] = this.x[i * 3 + 2];
    return out;
  }
}

// ------------------------------------------------------------------ all bodies
export class RagdollSystem {
  constructor(collision) {
    this.collision = collision;
    this.list = [];
    this.tr = new TraceResult();
    this._s = [0, 0, 0];
    this._e = [0, 0, 0];
  }

  /**
   * Turn a PlayerModel into a ragdoll. opts: { origin (hull centre, a known-clear point),
   * velocity (player velocity at death), hit (see top of file), headshot, weaponId }.
   * Returns the Ragdoll, or null if the model can't be ragdolled (caller falls back to playDeath).
   */
  spawn(model, opts = {}) {
    if (!model || !model.rig || !model.rig.b || !this.collision) return null;
    if (model.ragdoll) model.ragdoll.detach();
    // cap the simulated bodies: freeze the oldest still moving
    let awake = 0;
    for (const r of this.list) if (r.awake && !r.removed) awake++;
    for (let i = 0; i < this.list.length && awake >= MAX_ACTIVE; i++) {
      const r = this.list[i];
      if (r.awake && !r.removed) { r.sleep(); awake--; }
    }
    let r;
    try {
      r = new Ragdoll(model, this, opts);
    } catch (err) {
      console.warn('ragdoll failed', err);
      return null;
    }
    model.ragdoll = r;
    model.dead = { kind: 'ragdoll', t: 0 };
    for (const h of [model.weaponHolder, model.weaponHolderL]) if (h) h.visible = false;
    this.list.push(r);
    return r;
  }

  update(dt) {
    if (!(dt > 0)) return;
    let stale = false;
    for (const r of this.list) {
      if (r.removed || r.model.ragdoll !== r) { stale = true; continue; }
      if (r.awake) r.simulate(dt);
    }
    if (stale) this.list = this.list.filter((r) => !r.removed && r.model.ragdoll === r);
  }

  /** Number of bodies currently simulated. */
  get active() {
    let n = 0;
    for (const r of this.list) if (r.awake && !r.removed) n++;
    return n;
  }

  clear() {
    for (const r of this.list) r.detach();
    this.list = [];
  }
}
