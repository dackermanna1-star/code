// Ragdoll physics for voxel monsters: each body part is a rigid body
// (position, orientation, linear and angular velocity, full inertia tensor
// from its voxels) simulated with extended position-based dynamics (Müller
// et al. 2020): small substeps, each integrating velocities and then
// projecting joints and contacts directly on positions and orientations.
//
// Joints are ball-and-socket with swing/twist limits (hips, shoulders,
// neck, waist) or hinges (knees, elbows). Bodies collide as clusters of
// spheres with the 2.5D DOOM world (floors, ceilings, walls and step edges),
// with each other and with other ragdolls, and get pushed by live monsters
// and the player. Settled ragdolls sleep until something disturbs them.
//
// Units are map units and seconds. Everything here is cosmetic: nothing
// feeds back into the game simulation.

import { signedAngle } from './voxelize.js';

export const RAG_GRAVITY = 600;
const SUBSTEPS = 8;
const MAX_SPEED = 900;
const FRICTION = 0.75;
const SLEEP_SPEED = 6;
const SLEEP_SPIN = 0.5;
const SLEEP_TICS = 24;
const SELF_SKIN = 0.6;
const SELF_STIFF = 0.3;
// Per-substep pull toward the rest pose at full tone, by joint.
const TONE = { waist: 0.24, hip: 0.21, knee: 0.24, neck: 0.09, shoulder: 0.05, elbow: 0.05, grip: 0.05, spine: 0.24, legroot: 0.24, legmid: 0.24 };

// --- Small vector/quaternion helpers -----------------------------------------
// (Math.hypot is much slower than a plain square root in V8.)

function len3(x, y, z) { return Math.sqrt(x * x + y * y + z * z); }

function qRotate(q, x, y, z, out, o = 0) {
  // out = q * v * q^-1
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[o] = x + qw * tx + (qy * tz - qz * ty);
  out[o + 1] = y + qw * ty + (qz * tx - qx * tz);
  out[o + 2] = z + qw * tz + (qx * ty - qy * tx);
  return out;
}

function qMul(a, b, out) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  const bx = b[0], by = b[1], bz = b[2], bw = b[3];
  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

export function qFromAxisAngle(x, y, z, a) {
  const s = Math.sin(a / 2);
  return [x * s, y * s, z * s, Math.cos(a / 2)];
}

// Rotation matrix (row-major) of a unit quaternion.
export function qMatrix(q, m) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y - z * w); m[2] = 2 * (x * z + y * w);
  m[3] = 2 * (x * y + z * w); m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z - x * w);
  m[6] = 2 * (x * z - y * w); m[7] = 2 * (y * z + x * w); m[8] = 1 - 2 * (x * x + y * y);
  return m;
}

function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const k = 1 / det;
  return [
    A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k,
  ];
}

const tmpA = new Float64Array(3), tmpB = new Float64Array(3), tmpC = new Float64Array(3);
const tmpQ = new Float64Array(4), tmpE = new Float64Array(4), tmpDq = new Float64Array(4);
const loc = new Float64Array(3);
const otherSph = new Float64Array(4);

// --- Bodies ---------------------------------------------------------------------

export class RagBody {
  constructor(part, index) {
    this.part = part;
    this.index = index;
    this.x = new Float64Array(3);
    this.q = new Float64Array([0, 0, 0, 1]);
    this.v = new Float64Array(3);
    this.w = new Float64Array(3);
    this.px = new Float64Array(3);
    this.pq = new Float64Array(4);
    // Pose at the start of the tic, for render interpolation.
    this.rx = new Float64Array(3);
    this.rq = new Float64Array([0, 0, 0, 1]);
    this.R = new Float64Array(9);
    this.invMass = 1 / Math.max(1, part.mass);
    this.invI = invert3(part.inertia);
    const n = part.spheres.length;
    this.sph = part.spheres;
    this.sw = new Float64Array(n * 3); // world centres
    this.sSector = new Array(n).fill(null);
    this.sLines = new Array(n).fill(null);
    this.sSides = new Array(n).fill(null);
    this.removed = false;
    this.obstacles = [];
    this.touching = false;
    this.damage = 0;
    this.crushed = false;
    // Largest distance from the centre of mass to a sphere's far side.
    let reach = 0;
    for (const s of part.spheres) reach = Math.max(reach, len3(s[0], s[1], s[2]) + s[3]);
    this.reach = reach;
  }

  // Inverse world inertia times v (R I^-1 R^T v).
  invIw(vx, vy, vz, out) {
    const R = this.R, I = this.invI;
    const lx = R[0] * vx + R[3] * vy + R[6] * vz;
    const ly = R[1] * vx + R[4] * vy + R[7] * vz;
    const lz = R[2] * vx + R[5] * vy + R[8] * vz;
    const ix = I[0] * lx + I[1] * ly + I[2] * lz;
    const iy = I[3] * lx + I[4] * ly + I[5] * lz;
    const iz = I[6] * lx + I[7] * ly + I[8] * lz;
    out[0] = R[0] * ix + R[1] * iy + R[2] * iz;
    out[1] = R[3] * ix + R[4] * iy + R[5] * iz;
    out[2] = R[6] * ix + R[7] * iy + R[8] * iz;
    return out;
  }

  // Generalized inverse mass for a correction along n at offset r.
  wPos(rx, ry, rz, nx, ny, nz) {
    const cx = ry * nz - rz * ny, cy = rz * nx - rx * nz, cz = rx * ny - ry * nx;
    this.invIw(cx, cy, cz, tmpA);
    return this.invMass + cx * tmpA[0] + cy * tmpA[1] + cz * tmpA[2];
  }

  wRot(nx, ny, nz) {
    this.invIw(nx, ny, nz, tmpA);
    return nx * tmpA[0] + ny * tmpA[1] + nz * tmpA[2];
  }

  // Apply a positional impulse p (already scaled) at offset r, with sign.
  applyPos(rx, ry, rz, px, py, pz, sign) {
    const m = this.invMass * sign;
    this.x[0] += px * m; this.x[1] += py * m; this.x[2] += pz * m;
    this.invIw(ry * pz - rz * py, rz * px - rx * pz, rx * py - ry * px, tmpB);
    this.rotate(tmpB[0] * sign, tmpB[1] * sign, tmpB[2] * sign);
  }

  // q += 0.5 * [w, 0] * q for a small rotation vector w.
  rotate(wx, wy, wz) {
    const q = this.q;
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    q[0] += 0.5 * (wx * qw + wy * qz - wz * qy);
    q[1] += 0.5 * (wy * qw + wz * qx - wx * qz);
    q[2] += 0.5 * (wz * qw + wx * qy - wy * qx);
    q[3] += 0.5 * (-wx * qx - wy * qy - wz * qz);
    const l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]) || 1;
    q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
  }

  // World position of a point given in the model frame relative to the COM.
  point(lx, ly, lz, out, o = 0) {
    qRotate(this.q, lx, ly, lz, out, o);
    out[o] += this.x[0]; out[o + 1] += this.x[1]; out[o + 2] += this.x[2];
    return out;
  }

  updateSpheres() {
    const s = this.sph;
    for (let k = 0; k < s.length; k++) this.point(s[k][0], s[k][1], s[k][2], this.sw, k * 3);
  }

  impulse(px, py, pz, jx, jy, jz) {
    const m = this.invMass;
    this.v[0] += jx * m; this.v[1] += jy * m; this.v[2] += jz * m;
    const rx = px - this.x[0], ry = py - this.x[1], rz = pz - this.x[2];
    qMatrix(this.q, this.R);
    this.invIw(ry * jz - rz * jy, rz * jx - rx * jz, rx * jy - ry * jx, tmpC);
    this.w[0] += tmpC[0]; this.w[1] += tmpC[1]; this.w[2] += tmpC[2];
  }
}

// --- Constraint projection ---------------------------------------------------------

// Moves point pA (on A, offset rA) along +n and pB (on B) along -n so their
// separation along n shrinks by C. A or B may be null (the static world).
function positional(A, rA, B, rB, nx, ny, nz, C, alpha, h) {
  let w = 0;
  if (A) w += A.wPos(rA[0], rA[1], rA[2], nx, ny, nz);
  if (B) w += B.wPos(rB[0], rB[1], rB[2], nx, ny, nz);
  if (w <= 0) return 0;
  const lambda = C / (w + alpha / (h * h));
  const px = nx * lambda, py = ny * lambda, pz = nz * lambda;
  if (A) A.applyPos(rA[0], rA[1], rA[2], px, py, pz, 1);
  if (B) B.applyPos(rB[0], rB[1], rB[2], px, py, pz, -1);
  return lambda;
}

// Rotates B by +angle about axis and A the other way, split by inertia.
function angular(A, B, ax, ay, az, angle, alpha, h) {
  const wA = A ? A.wRot(ax, ay, az) : 0, wB = B.wRot(ax, ay, az);
  const w = wA + wB;
  if (w <= 0) return;
  const lambda = angle / (w + alpha / (h * h));
  const px = ax * lambda, py = ay * lambda, pz = az * lambda;
  B.invIw(px, py, pz, tmpB);
  B.rotate(tmpB[0], tmpB[1], tmpB[2]);
  if (A) {
    A.invIw(px, py, pz, tmpB);
    A.rotate(-tmpB[0], -tmpB[1], -tmpB[2]);
  }
}

const pA = new Float64Array(3), pB = new Float64Array(3), rA = new Float64Array(3), rB = new Float64Array(3);
const vA = new Float64Array(3), vB = new Float64Array(3), vC = new Float64Array(3), vD = new Float64Array(3);

class Joint {
  constructor(def, A, B) {
    this.def = def;
    this.A = A;
    this.B = B;
    this.kind = def.kind;
    this.broken = false;
    this.ra = def.ra;
    this.rb = def.rb;
  }

  solve(h, tone) {
    const A = this.A, B = this.B, d = this.def;
    // Ball socket: anchors coincide.
    A.point(this.ra[0], this.ra[1], this.ra[2], pA);
    B.point(this.rb[0], this.rb[1], this.rb[2], pB);
    const dx = pB[0] - pA[0], dy = pB[1] - pA[1], dz = pB[2] - pA[2];
    const C = len3(dx, dy, dz);
    if (C > 1e-6) {
      rA[0] = pA[0] - A.x[0]; rA[1] = pA[1] - A.x[1]; rA[2] = pA[2] - A.x[2];
      rB[0] = pB[0] - B.x[0]; rB[1] = pB[1] - B.x[1]; rB[2] = pB[2] - B.x[2];
      positional(A, rA, B, rB, dx / C, dy / C, dz / C, C, 0, h);
    }
    if (d.hinge) {
      // Keep the hinge axes aligned.
      qRotate(A.q, d.axis[0], d.axis[1], d.axis[2], vA);
      qRotate(B.q, d.axis[0], d.axis[1], d.axis[2], vB);
      const cx = vB[1] * vA[2] - vB[2] * vA[1], cy = vB[2] * vA[0] - vB[0] * vA[2], cz = vB[0] * vA[1] - vB[1] * vA[0];
      const s = len3(cx, cy, cz);
      if (s > 1e-5) angular(A, B, cx / s, cy / s, cz / s, Math.asin(Math.min(1, s)), 0, h);
      // Flexion range about the parent's axis.
      qRotate(A.q, d.axis[0], d.axis[1], d.axis[2], vA);
      qRotate(A.q, d.dirA[0], d.dirA[1], d.dirA[2], vC);
      qRotate(B.q, d.dirB[0], d.dirB[1], d.dirB[2], vD);
      const ang = signedAngle(vC, vD, vA);
      const lo = d.hinge[0], hi = d.hinge[1];
      if (ang < lo) angular(A, B, vA[0], vA[1], vA[2], lo - ang, 0, h);
      else if (ang > hi) angular(A, B, vA[0], vA[1], vA[2], hi - ang, 0, h);
    } else {
      // Swing: the child's bone stays within a cone fixed in the parent.
      qRotate(A.q, d.cone[0], d.cone[1], d.cone[2], vA);
      qRotate(B.q, d.dirB[0], d.dirB[1], d.dirB[2], vB);
      const dot = Math.max(-1, Math.min(1, vA[0] * vB[0] + vA[1] * vB[1] + vA[2] * vB[2]));
      const phi = Math.acos(dot);
      if (phi > d.swing) {
        let kx = vB[1] * vA[2] - vB[2] * vA[1], ky = vB[2] * vA[0] - vB[0] * vA[2], kz = vB[0] * vA[1] - vB[1] * vA[0];
        const kl = len3(kx, ky, kz);
        if (kl > 1e-6) { kx /= kl; ky /= kl; kz /= kl; angular(A, B, kx, ky, kz, phi - d.swing, 0, h); }
      }
      // Twist about the bone.
      qRotate(A.q, d.dirB[0], d.dirB[1], d.dirB[2], vA);
      qRotate(B.q, d.dirB[0], d.dirB[1], d.dirB[2], vB);
      let nx = vA[0] + vB[0], ny = vA[1] + vB[1], nz = vA[2] + vB[2];
      const nl = len3(nx, ny, nz);
      if (nl > 1e-6) {
        nx /= nl; ny /= nl; nz /= nl;
        qRotate(A.q, d.ref[0], d.ref[1], d.ref[2], vC);
        qRotate(B.q, d.ref[0], d.ref[1], d.ref[2], vD);
        vA[0] = nx; vA[1] = ny; vA[2] = nz;
        const tw = signedAngle(vC, vD, vA);
        if (tw > d.twist) angular(A, B, nx, ny, nz, d.twist - tw, 0, h);
        else if (tw < -d.twist) angular(A, B, nx, ny, nz, -d.twist - tw, 0, h);
      }
    }
    // Fading muscle tone: each substep pulls a fraction of the way back to
    // the rest pose, so a body topples fairly stiffly before going limp.
    if (tone > 0.01) {
      const k = tone * (TONE[this.kind] ?? 0.05);
      // Relative rotation taking B's orientation to A's (rest is identical).
      tmpQ[0] = -B.q[0]; tmpQ[1] = -B.q[1]; tmpQ[2] = -B.q[2]; tmpQ[3] = B.q[3];
      const e = qMul(A.q, tmpQ, tmpE);
      if (e[3] < 0) { e[0] = -e[0]; e[1] = -e[1]; e[2] = -e[2]; e[3] = -e[3]; }
      const sn = len3(e[0], e[1], e[2]);
      if (sn > 1e-5) {
        const angle = 2 * Math.atan2(sn, e[3]);
        angular(A, B, e[0] / sn, e[1] / sn, e[2] / sn, angle * k, 0, h);
      }
    }
  }
}

// --- Ragdoll -------------------------------------------------------------------------

let nextId = 1;

export class Ragdoll {
  // model: voxel model with parts/joints. pose: { x, y, z, q (quaternion
  // for the model frame), vx, vy, vz (units/s) }.
  constructor(model, pose, opts = {}) {
    this.id = nextId++;
    this.model = model;
    this.opts = opts;
    this.bodies = model.parts.map((p, i) => new RagBody(p, i));
    const q = pose.q;
    for (const b of this.bodies) {
      const c = b.part.com;
      qRotate(q, c[0], c[1], c[2], b.x);
      b.x[0] += pose.x; b.x[1] += pose.y; b.x[2] += pose.z;
      b.q.set(q);
      b.v[0] = pose.vx || 0; b.v[1] = pose.vy || 0; b.v[2] = pose.vz || 0;
      b.rx.set(b.x); b.rq.set(b.q);
      qMatrix(b.q, b.R);
      b.updateSpheres();
    }
    this.joints = model.joints.map((j) => new Joint(j, this.bodies[j.a], this.bodies[j.b]));
    // Directly jointed bodies never collide with each other; nor do pairs
    // whose spheres already overlap in the rest pose.
    this.adjacent = new Set();
    for (const j of model.joints) { this.adjacent.add(j.a * 64 + j.b); this.adjacent.add(j.b * 64 + j.a); }
    this.restOverlap = new Set();
    const B = this.bodies;
    for (let i = 0; i < B.length; i++) for (let k = i + 1; k < B.length; k++) {
      if (this.adjacent.has(i * 64 + k)) continue;
      for (let a = 0; a < B[i].sph.length; a++) for (let c = 0; c < B[k].sph.length; c++) {
        const d = len3(B[i].sw[a * 3] - B[k].sw[c * 3], B[i].sw[a * 3 + 1] - B[k].sw[c * 3 + 1], B[i].sw[a * 3 + 2] - B[k].sw[c * 3 + 2]);
        if (d < B[i].sph[a][3] + B[k].sph[c][3] + 1) this.restOverlap.add(((i * 64 + k) * 16 + a) * 16 + c);
      }
    }
    this.pairs = [];
    this.asleep = false;
    this.still = 0;
    this.age = 0;
    this.tone = opts.tone ?? 1;
    this.aabb = [0, 0, 0, 0, 0, 0];
    // Hard hits against walls this tic: { line, side, x, y, z, speed }.
    this.impacts = [];
    this.updateAabb();
  }

  get alive() { return this.bodies.some((b) => !b.removed); }

  updateAabb() {
    const a = this.aabb;
    a[0] = a[1] = a[2] = Infinity; a[3] = a[4] = a[5] = -Infinity;
    for (const b of this.bodies) {
      if (b.removed) continue;
      for (let k = 0; k < 3; k++) {
        a[k] = Math.min(a[k], b.x[k] - b.reach);
        a[k + 3] = Math.max(a[k + 3], b.x[k] + b.reach);
      }
    }
  }

  wake() { this.asleep = false; this.still = 0; }

  // Linear impulse (mass * units/s) at a world point, given to the body
  // whose collision spheres pass nearest to it. Returns that body.
  impulseAt(x, y, z, jx, jy, jz) {
    const b = this.nearestBody(x, y, z);
    if (!b) return null;
    b.impulse(x, y, z, jx, jy, jz);
    this.wake();
    return b;
  }

  nearestBody(x, y, z) {
    let best = null, bd = Infinity;
    for (const b of this.bodies) {
      if (b.removed) continue;
      for (let k = 0; k < b.sph.length; k++) {
        const d = len3(b.sw[k * 3] - x, b.sw[k * 3 + 1] - y, b.sw[k * 3 + 2] - z) - b.sph[k][3];
        if (d < bd) { bd = d; best = b; }
      }
    }
    return best;
  }

  // Radial shove from an explosion centre with linear falloff.
  blast(x, y, z, radius, speed) {
    let hit = false;
    for (const b of this.bodies) {
      if (b.removed) continue;
      const dx = b.x[0] - x, dy = b.x[1] - y, dz = b.x[2] - z;
      const d = len3(dx, dy, dz);
      if (d >= radius) continue;
      const f = (1 - d / radius) * speed / (d || 1);
      const m = 1 / b.invMass;
      b.impulse(b.x[0] - dx * 0.3, b.x[1] - dy * 0.3, b.x[2] - dz * 0.3, dx * f * m, dy * f * m, (dz + d * 0.6) * f * m);
      b.damage += (1 - d / radius) * speed * 0.15;
      hit = true;
    }
    if (hit) this.wake();
    return hit;
  }

  // Detaches body i from whatever holds it (its parent joint and children).
  sever(i, includeChildren = false) {
    let any = false;
    for (const j of this.joints) {
      if (j.broken) continue;
      if (j.B.index === i || (includeChildren && j.A.index === i)) { j.broken = true; any = true; }
    }
    this.wake();
    return any;
  }

  parentJoint(i) { return this.joints.find((j) => j.B.index === i && !j.broken) || null; }

  // Bodies attached to body i through unbroken joints, i included.
  attached(i) {
    const out = new Set([i]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const j of this.joints) {
        if (j.broken) continue;
        const a = j.A.index, b = j.B.index;
        if (out.has(a) !== out.has(b)) { out.add(a); out.add(b); grew = true; }
      }
    }
    return out;
  }
}

// --- World ------------------------------------------------------------------------------

export class RagdollWorld {
  constructor(w) {
    this.w = w;
    this.stamp = 1;
    this.ragdolls = [];
    this.movers = [];
  }

  sectorAt(x, y) { return this.w.pointInSubsector(x, y).sector; }

  linesIn(x0, y0, x1, y1, out) {
    const bm = this.w.level.blockmap;
    const st = ++this.stamp;
    const bx0 = Math.max(0, Math.floor((x0 - bm.originx) / 128)), bx1 = Math.min(bm.width - 1, Math.floor((x1 - bm.originx) / 128));
    const by0 = Math.max(0, Math.floor((y0 - bm.originy) / 128)), by1 = Math.min(bm.height - 1, Math.floor((y1 - bm.originy) / 128));
    out.length = 0;
    for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
      const list = bm.lists[by * bm.width + bx];
      for (let k = 0; k < list.length; k++) {
        const l = list[k];
        if (l._ragStamp === st) continue;
        l._ragStamp = st;
        out.push(l);
      }
    }
    return out;
  }

  add(r) { this.ragdolls.push(r); }

  remove(r) {
    const i = this.ragdolls.indexOf(r);
    if (i >= 0) this.ragdolls.splice(i, 1);
  }

  // One game tic (1/35 s). maxActive caps how many ragdolls simulate.
  tic(movers, maxActive = 24) {
    this.movers = movers;
    let active = 0;
    // Newest first, so the latest deaths always get simulated.
    for (let k = this.ragdolls.length - 1; k >= 0; k--) {
      const r = this.ragdolls[k];
      for (const b of r.bodies) { b.rx.set(b.x); b.rq.set(b.q); }
      if (!r.alive) continue;
      if (r.asleep) {
        if (!this.shouldWake(r)) continue;
        r.wake();
      }
      if (active >= maxActive) {
        // Over budget: freeze it where it is.
        r.asleep = true;
        for (const b of r.bodies) { b.v.fill(0); b.w.fill(0); }
        continue;
      }
      active++;
      this.simulate(r, 1 / 35);
    }
  }

  shouldWake(r) {
    // A floor moved under it (lifts, crushers) or something walks into it.
    for (const b of r.bodies) {
      if (b.removed || !b.sleepSector) continue;
      if (b.sleepSector.floorheight !== b.sleepFloor || b.sleepSector.ceilingheight < b.sleepCeil) return true;
    }
    const a = r.aabb;
    for (const m of this.movers) {
      if (m.x + m.radius < a[0] || m.x - m.radius > a[3] || m.y + m.radius < a[1] || m.y - m.radius > a[4]) continue;
      if (m.z > a[5] || m.z + m.height < a[2]) continue;
      if (Math.abs(m.vx) + Math.abs(m.vy) > 20) return true;
    }
    return false;
  }

  simulate(r, dt) {
    const h = dt / SUBSTEPS;
    this.current = r;
    this.ticCount = (this.ticCount || 0) + 1;
    r.age += dt;
    r.tone = Math.max(0, r.tone - dt * (r.opts.toneDecay ?? 4));
    // Broad phase once per tic.
    let maxV = 0;
    for (const b of r.bodies) if (!b.removed) maxV = Math.max(maxV, len3(b.v[0], b.v[1], b.v[2]));
    const margin = Math.min(MAX_SPEED, maxV) * dt + 6;
    r.updateAabb();
    const a = r.aabb;
    const lines = this.linesIn(a[0] - margin, a[1] - margin, a[3] + margin, a[4] + margin, []);
    for (const b of r.bodies) {
      if (b.removed) continue;
      b.updateSpheres();
      for (let k = 0; k < b.sph.length; k++) {
        const cx = b.sw[k * 3], cy = b.sw[k * 3 + 1];
        const rad = b.sph[k][3] + margin;
        b.sSector[k] = this.sectorAt(cx, cy);
        const near = [], sides = [];
        for (const l of lines) {
          const dx = l.dx, dy = l.dy;
          const len2 = dx * dx + dy * dy || 1;
          let t = ((cx - l.v1.x) * dx + (cy - l.v1.y) * dy) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = l.v1.x + dx * t - cx, qy = l.v1.y + dy * t - cy;
          if (qx * qx + qy * qy > rad * rad) continue;
          near.push(l);
          sides.push(dy * (cx - l.v1.x) - dx * (cy - l.v1.y) > 0 ? 0 : 1);
        }
        b.sLines[k] = near;
        b.sSides[k] = sides;
      }
    }
    this.collectPairs(r, margin);
    const movers = [];
    for (const m of this.movers) {
      if (m.x + m.radius + margin < a[0] || m.x - m.radius - margin > a[3] || m.y + m.radius + margin < a[1] || m.y - m.radius - margin > a[4]) continue;
      if (m.z > a[5] + margin || m.z + m.height < a[2] - margin) continue;
      movers.push(m);
    }
    // Other ragdolls' spheres near each body, frozen for this tic.
    let anyObstacles = false;
    for (const b of r.bodies) b.obstacles.length = 0;
    for (const o of this.ragdolls) {
      if (o === r || !o.alive) continue;
      const b2 = o.aabb;
      if (b2[0] > a[3] + margin || b2[3] < a[0] - margin || b2[1] > a[4] + margin || b2[4] < a[1] - margin || b2[2] > a[5] + margin || b2[5] < a[2] - margin) continue;
      for (const b of r.bodies) {
        if (b.removed) continue;
        for (const c of o.bodies) {
          if (c.removed) continue;
          const reach = b.reach + margin;
          for (let m = 0; m < c.sph.length; m++) {
            const x = c.sw[m * 3], y = c.sw[m * 3 + 1], z = c.sw[m * 3 + 2];
            if (len3(x - b.x[0], y - b.x[1], z - b.x[2]) > reach + c.sph[m][3]) continue;
            b.obstacles.push(x, y, z, c.sph[m][3]);
            anyObstacles = true;
          }
        }
      }
    }

    for (let step = 0; step < SUBSTEPS; step++) {
      for (const b of r.bodies) {
        if (b.removed) continue;
        b.px.set(b.x); b.pq.set(b.q);
        b.v[2] -= RAG_GRAVITY * h;
        const sp = len3(b.v[0], b.v[1], b.v[2]);
        if (sp > MAX_SPEED) { const k = MAX_SPEED / sp; b.v[0] *= k; b.v[1] *= k; b.v[2] *= k; }
        const ws = len3(b.w[0], b.w[1], b.w[2]);
        if (ws > 40) { const k = 40 / ws; b.w[0] *= k; b.w[1] *= k; b.w[2] *= k; }
        b.x[0] += b.v[0] * h; b.x[1] += b.v[1] * h; b.x[2] += b.v[2] * h;
        b.rotate(b.w[0] * h, b.w[1] * h, b.w[2] * h);
        qMatrix(b.q, b.R);
        b.touching = false;
      }
      for (const j of r.joints) if (!j.broken && !j.A.removed && !j.B.removed) j.solve(h, r.tone);
      for (const b of r.bodies) if (!b.removed) this.worldContacts(b, h);
      this.selfContacts(r, h);
      if (anyObstacles) this.obstacleContacts(r, h);
      if (movers.length) this.moverContacts(r, movers, h);
      const inv = 1 / h;
      for (const b of r.bodies) {
        if (b.removed) continue;
        b.v[0] = (b.x[0] - b.px[0]) * inv; b.v[1] = (b.x[1] - b.px[1]) * inv; b.v[2] = (b.x[2] - b.px[2]) * inv;
        // w = 2 * vec(q * pq^-1) / h
        tmpQ[0] = -b.pq[0]; tmpQ[1] = -b.pq[1]; tmpQ[2] = -b.pq[2]; tmpQ[3] = b.pq[3];
        const dq = qMul(b.q, tmpQ, tmpDq);
        const sgn = dq[3] < 0 ? -2 : 2;
        b.w[0] = dq[0] * sgn * inv; b.w[1] = dq[1] * sgn * inv; b.w[2] = dq[2] * sgn * inv;
        // Air drag, and rolling resistance while resting on something.
        const lin = b.touching ? 1 - Math.min(1, 1.5 * h) : 1 - Math.min(1, 0.1 * h);
        const ang = b.touching ? 1 - Math.min(1, 14 * h) : 1 - Math.min(1, 0.6 * h);
        b.v[0] *= lin; b.v[1] *= lin; b.v[2] *= lin;
        b.w[0] *= ang; b.w[1] *= ang; b.w[2] *= ang;
      }
      // Joint friction: connected parts slowly match their spin.
      const jd = Math.min(0.5, 6 * h);
      for (const j of r.joints) {
        if (j.broken || j.A.removed || j.B.removed) continue;
        const A = j.A.w, B = j.B.w;
        for (let k = 0; k < 3; k++) { const d = (B[k] - A[k]) * jd * 0.5; A[k] += d; B[k] -= d; }
      }
    }
    for (const b of r.bodies) if (!b.removed) b.updateSpheres();
    r.updateAabb();
    // Sleep once everything has been nearly still for a while.
    let moving = false;
    for (const b of r.bodies) {
      if (b.removed) continue;
      if (len3(b.v[0], b.v[1], b.v[2]) > SLEEP_SPEED || len3(b.w[0], b.w[1], b.w[2]) > SLEEP_SPIN) { moving = true; break; }
    }
    r.still = moving ? 0 : r.still + 1;
    if (r.still > SLEEP_TICS && r.age > 0.8) {
      r.asleep = true;
      for (const b of r.bodies) {
        b.v.fill(0); b.w.fill(0);
        const sec = b.sSector[0];
        b.sleepSector = sec;
        b.sleepFloor = sec ? sec.floorheight : 0;
        b.sleepCeil = sec ? sec.ceilingheight : 0;
      }
    }
  }

  // Contacts of one body's spheres with floors, ceilings, walls and steps.
  worldContacts(b, h) {
    const sph = b.sph;
    for (let k = 0; k < sph.length; k++) {
      const s = sph[k];
      b.point(s[0], s[1], s[2], vA);
      const cx = vA[0], cy = vA[1], cz = vA[2], r = s[3];
      let sec = b.sSector[k];
      const lines = b.sLines[k], sides = b.sSides[k];
      // Walls and step faces first; crossing a passable line changes sector.
      if (lines) {
        for (let li = 0; li < lines.length; li++) {
          const l = lines[li];
          const len = l.length || Math.hypot(l.dx, l.dy) || 1;
          const nx0 = l.dy / len, ny0 = -l.dx / len;
          const side = sides[li];
          const sg = side === 0 ? 1 : -1;
          const sd = ((cx - l.v1.x) * nx0 + (cy - l.v1.y) * ny0) * sg;
          const own = side === 0 ? l.frontsector : l.backsector;
          const other = side === 0 ? l.backsector : l.frontsector;
          if (!own) continue;
          // Blocking spans of the wall face on our side.
          let z0a = -Infinity, z1a = Infinity, z0b = 0, z1b = -1;
          if (other) {
            if (other.ceilingheight <= other.floorheight + 1) {
              // closed door: full wall
            } else {
              z0a = own.floorheight; z1a = other.floorheight;
              z0b = other.ceilingheight; z1b = own.ceilingheight;
            }
          }
          let t = ((cx - l.v1.x) * l.dx + (cy - l.v1.y) * l.dy) / (len * len);
          const inSeg = t > 0 && t < 1;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = l.v1.x + l.dx * t, qy = l.v1.y + l.dy * t;
          if (sd < 0 && inSeg) {
            // The centre is past the line.
            const blocked = (z1a > z0a && cz - r < z1a && cz + r > z0a) || (z1b > z0b && cz + r > z0b && cz - r < z1b);
            if (!blocked) {
              // Passed through an opening: now in the other sector.
              if (other) { sides[li] = 1 - side; sec = b.sSector[k] = other; }
              continue;
            }
            const pen = r - sd;
            vB[0] = cx - nx0 * sg * r - b.x[0]; vB[1] = cy - ny0 * sg * r - b.x[1]; vB[2] = cz - b.x[2];
            this.wallImpact(b, l, side, qx, qy, cz, nx0 * sg, ny0 * sg);
            this.contact(b, vB, nx0 * sg, ny0 * sg, 0, pen, h);
            continue;
          }
          for (let span = 0; span < 2; span++) {
            const z0 = span ? z0b : z0a, z1 = span ? z1b : z1a;
            if (!(z1 > z0)) continue;
            const qz = cz < z0 ? z0 : cz > z1 ? z1 : cz;
            const dx = cx - qx, dy = cy - qy, dz = cz - qz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= r * r) continue;
            const d = Math.sqrt(d2);
            let nx, ny, nz;
            if (d > 1e-4) { nx = dx / d; ny = dy / d; nz = dz / d; } else { nx = nx0 * sg; ny = ny0 * sg; nz = 0; }
            vB[0] = qx - b.x[0]; vB[1] = qy - b.x[1]; vB[2] = qz - b.x[2];
            if (Math.abs(nz) < 0.7) this.wallImpact(b, l, side, qx, qy, qz, nx, ny);
            this.contact(b, vB, nx, ny, nz, r - d, h);
          }
        }
      }
      if (!sec) continue;
      b.point(s[0], s[1], s[2], vA);
      const floor = sec.floorheight, ceil = sec.ceilingheight;
      if (ceil - floor < 2 * r - 1) b.crushed = true;
      const pf = floor - (vA[2] - r);
      if (pf > 0) {
        vB[0] = vA[0] - b.x[0]; vB[1] = vA[1] - b.x[1]; vB[2] = vA[2] - r - b.x[2];
        this.contact(b, vB, 0, 0, 1, pf, h);
      }
      const pc = (vA[2] + r) - ceil;
      if (pc > 0 && ceil - floor >= 2 * r - 1) {
        vB[0] = vA[0] - b.x[0]; vB[1] = vA[1] - b.x[1]; vB[2] = vA[2] + r - b.x[2];
        this.contact(b, vB, 0, 0, -1, pc, h);
      }
    }
  }

  // Remembers a body hitting a wall hard (once per body per tic).
  wallImpact(b, line, side, x, y, z, nx, ny) {
    const speed = -(b.v[0] * nx + b.v[1] * ny);
    if (speed < 140 || b.impactTic === this.ticCount) return;
    b.impactTic = this.ticCount;
    const r = this.current;
    if (r && r.impacts.length < 4) r.impacts.push({ line, side, x, y, z, speed });
  }

  // Static contact at offset r from the body's centre, normal n, depth C,
  // with Coulomb friction from the motion of the contact point this substep.
  contact(b, r, nx, ny, nz, C, h) {
    // Body-local offset of the contact point, to track it through the correction.
    tmpQ[0] = -b.q[0]; tmpQ[1] = -b.q[1]; tmpQ[2] = -b.q[2]; tmpQ[3] = b.q[3];
    qRotate(tmpQ, r[0], r[1], r[2], loc);
    const lambda = positional(b, r, null, null, nx, ny, nz, C, 0, h);
    b.touching = true;
    // Tangential slip of the contact point over this substep.
    qRotate(b.q, loc[0], loc[1], loc[2], vC);
    qRotate(b.pq, loc[0], loc[1], loc[2], vD);
    let dx = (b.x[0] + vC[0]) - (b.px[0] + vD[0]);
    let dy = (b.x[1] + vC[1]) - (b.px[1] + vD[1]);
    let dz = (b.x[2] + vC[2]) - (b.px[2] + vD[2]);
    const dn = dx * nx + dy * ny + dz * nz;
    dx -= nx * dn; dy -= ny * dn; dz -= nz * dn;
    const dl = len3(dx, dy, dz);
    if (dl < 1e-6) return;
    const tx = -dx / dl, ty = -dy / dl, tz = -dz / dl;
    const wt = b.wPos(vC[0], vC[1], vC[2], tx, ty, tz);
    // Coulomb: the friction impulse may not exceed mu times the normal one.
    const allowed = FRICTION * lambda * wt;
    positional(b, vC, null, null, tx, ty, tz, Math.min(dl, allowed), 0, h);
  }

  collectPairs(r, margin) {
    const pairs = r.pairs;
    pairs.length = 0;
    const B = r.bodies;
    for (let i = 0; i < B.length; i++) {
      if (B[i].removed) continue;
      for (let k = i + 1; k < B.length; k++) {
        if (B[k].removed) continue;
        // Jointed neighbours only collide once their joint has torn.
        if (r.adjacent.has(i * 64 + k) && r.joints.some((j) => !j.broken && ((j.A === B[i] && j.B === B[k]) || (j.A === B[k] && j.B === B[i])))) continue;
        const rough = len3(B[i].x[0] - B[k].x[0], B[i].x[1] - B[k].x[1], B[i].x[2] - B[k].x[2]);
        if (rough > B[i].reach + B[k].reach + margin) continue;
        for (let a = 0; a < B[i].sph.length; a++) for (let c = 0; c < B[k].sph.length; c++) {
          if (r.restOverlap.has(((i * 64 + k) * 16 + a) * 16 + c)) continue;
          const sa = B[i].sph[a], sc = B[k].sph[c];
          const d = len3(B[i].sw[a * 3] - B[k].sw[c * 3], B[i].sw[a * 3 + 1] - B[k].sw[c * 3 + 1], B[i].sw[a * 3 + 2] - B[k].sw[c * 3 + 2]);
          if (d < sa[3] + sc[3] + margin) pairs.push(i, a, k, c);
        }
      }
    }
  }

  // Body parts of one ragdoll keep out of each other softly: a little
  // overlap is tolerated and each substep removes only part of the rest, so
  // limbs resting against each other don't fight floor friction and jitter.
  selfContacts(r, h) {
    const p = r.pairs, B = r.bodies;
    for (let n = 0; n < p.length; n += 4) {
      const A = B[p[n]], C = B[p[n + 2]];
      if (A.removed || C.removed) continue;
      this.sphereSphere(A, A.sph[p[n + 1]], C, C.sph[p[n + 3]], h, SELF_SKIN, SELF_STIFF);
    }
  }

  sphereSphere(A, sa, C, sc, h, skin = 0, stiff = 1) {
    A.point(sa[0], sa[1], sa[2], vA);
    if (C) C.point(sc[0], sc[1], sc[2], vB);
    else { vB[0] = sc[0]; vB[1] = sc[1]; vB[2] = sc[2]; }
    const dx = vA[0] - vB[0], dy = vA[1] - vB[1], dz = vA[2] - vB[2];
    const d = len3(dx, dy, dz);
    const pen = sa[3] + sc[3] - d - skin;
    if (pen <= 0) return;
    let nx = 0, ny = 0, nz = 1;
    if (d > 1e-5) { nx = dx / d; ny = dy / d; nz = dz / d; }
    // Points on each sphere's surface facing the other.
    rA[0] = vA[0] - nx * sa[3] - A.x[0]; rA[1] = vA[1] - ny * sa[3] - A.x[1]; rA[2] = vA[2] - nz * sa[3] - A.x[2];
    if (C) { rB[0] = vB[0] + nx * sc[3] - C.x[0]; rB[1] = vB[1] + ny * sc[3] - C.x[1]; rB[2] = vB[2] + nz * sc[3] - C.x[2]; }
    positional(A, rA, C, rB, nx, ny, nz, pen * stiff, 0, h);
    A.touching = true;
    if (C) C.touching = true;
  }

  // Against other ragdolls: theirs stay put this tic (piles of bodies).
  obstacleContacts(r, h) {
    for (const b of r.bodies) {
      const ob = b.obstacles;
      if (b.removed || !ob.length) continue;
      for (let k = 0; k < b.sph.length; k++) {
        for (let m = 0; m < ob.length; m += 4) {
          otherSph[0] = ob[m]; otherSph[1] = ob[m + 1]; otherSph[2] = ob[m + 2]; otherSph[3] = ob[m + 3];
          this.sphereSphere(b, b.sph[k], null, otherSph, h, 0.3, 0.5);
        }
      }
    }
  }

  // Live things push ragdolls aside (corpses get kicked around).
  moverContacts(r, movers, h) {
    for (const b of r.bodies) {
      if (b.removed) continue;
      for (let k = 0; k < b.sph.length; k++) {
        const s = b.sph[k];
        for (const m of movers) {
          b.point(s[0], s[1], s[2], vA);
          if (vA[2] - s[3] > m.z + m.height || vA[2] + s[3] < m.z) continue;
          const dx = vA[0] - m.x, dy = vA[1] - m.y;
          const d = Math.hypot(dx, dy);
          const pen = m.radius + s[3] * 0.8 - d;
          if (pen <= 0) continue;
          const nx = d > 1e-4 ? dx / d : 1, ny = d > 1e-4 ? dy / d : 0;
          rA[0] = vA[0] - nx * s[3] - b.x[0]; rA[1] = vA[1] - ny * s[3] - b.x[1]; rA[2] = vA[2] - b.x[2];
          positional(b, rA, null, null, nx, ny, 0, pen * 0.5, 0, h);
          b.touching = true;
        }
      }
    }
  }
}
