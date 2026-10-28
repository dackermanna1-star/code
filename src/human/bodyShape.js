import { Vec3, Quat } from '../physics/math.js';
import { landmark, frameFromYZ, DIRS } from './anatomy.js';

/**
 * Sculpted body surface as a signed distance field: ~120 anatomical primitives (ellipsoids, round
 * cones, rounded boxes) blended with smooth unions. Each primitive belongs to one ragdoll segment.
 * The same field is used to
 *   - polygonise the skinned render mesh (see bodyMesh.js),
 *   - compute skin weights (soft ownership between adjacent segments),
 *   - ray-trace bullets against the visible skin of each posed segment.
 *
 * Primitives are authored in the physics bind pose (anatomy.js coordinates: +Y up, +Z forward,
 * +X = character's left) for the left side and midline; the right side is mirrored. The mesh is
 * sculpted in a "model pose" with the arms and legs slightly more abducted (clean armpits and
 * crotch); MODEL_POSE gives the rigid transform from each segment's bind placement to the sculpt.
 */

const D2R = Math.PI / 180;
export const MODEL_ARM_ABD = 33 * D2R;
export const MODEL_LEG_ABD = 4 * D2R;

const T_ELL = 0, T_CONE = 1, T_BOX = 2;

const v = (x, y, z) => new Vec3(x, y, z);
const ZF = new Vec3(0, 0, 1);

function axisFrame(dir, zHint = ZF) {
  return frameFromYZ(dir, zHint);
}

class Prim {
  constructor(type, seg, k) {
    this.type = type;
    this.seg = seg;
    this.k = k; // smooth-union radius used when blending this primitive into the body
    this.sub = false; // smooth subtraction (eye sockets, navel)
    this.c = new Vec3();
    this.q = new Quat();
    this.qi = new Quat();
    this.r = new Vec3(); // ellipsoid radii / box half extents
    this.rad = 0; // box rounding
    this.a = new Vec3();
    this.b = new Vec3();
    this.ra = 0;
    this.rb = 0;
    this.min = new Vec3();
    this.max = new Vec3();
    this.segIndex = -1;
  }

  clone() {
    const p = new Prim(this.type, this.seg, this.k);
    p.sub = this.sub;
    p.c.copy(this.c);
    p.q.copy(this.q);
    p.r.copy(this.r);
    p.rad = this.rad;
    p.a.copy(this.a);
    p.b.copy(this.b);
    p.ra = this.ra;
    p.rb = this.rb;
    return p;
  }

  // Apply a rigid transform x -> q * (x - pivot) + pivot.
  transform(q, pivot) {
    const f = (p) => p.sub(pivot).applyQuat(q).add(pivot);
    f(this.c);
    f(this.a);
    f(this.b);
    this.q.premultiply(q);
    return this;
  }

  mirror() {
    const m = (p) => {
      p.x = -p.x;
    };
    m(this.c);
    m(this.a);
    m(this.b);
    // reflect the frame; negating X keeps it right-handed and leaves the symmetric shape unchanged
    const X = new Vec3(1, 0, 0).applyQuat(this.q);
    const Y = new Vec3(0, 1, 0).applyQuat(this.q);
    const Z = new Vec3(0, 0, 1).applyQuat(this.q);
    X.x = -X.x;
    Y.x = -Y.x;
    Z.x = -Z.x;
    X.negate();
    this.q.setFromBasis(X, Y, Z);
    if (this.seg.endsWith('L')) this.seg = this.seg.slice(0, -1) + 'R';
    return this;
  }

  finalize() {
    this.qi.copy(this.q).conjugate();
    if (this.type === T_CONE) {
      const ba = new Vec3().subVectors(this.b, this.a);
      this.l2 = ba.lengthSq();
      this.rr = this.ra - this.rb;
      this.a2 = this.l2 - this.rr * this.rr;
      this.il2 = 1 / this.l2;
      this.ba = ba;
      const r = Math.max(this.ra, this.rb);
      this.min.set(Math.min(this.a.x, this.b.x) - r, Math.min(this.a.y, this.b.y) - r, Math.min(this.a.z, this.b.z) - r);
      this.max.set(Math.max(this.a.x, this.b.x) + r, Math.max(this.a.y, this.b.y) + r, Math.max(this.a.z, this.b.z) + r);
    } else {
      const e = this.type === T_BOX ? new Vec3(this.r.x + this.rad, this.r.y + this.rad, this.r.z + this.rad) : this.r;
      const ax = new Vec3(1, 0, 0).applyQuat(this.q), ay = new Vec3(0, 1, 0).applyQuat(this.q), az = new Vec3(0, 0, 1).applyQuat(this.q);
      const ex = Math.abs(ax.x) * e.x + Math.abs(ay.x) * e.y + Math.abs(az.x) * e.z;
      const ey = Math.abs(ax.y) * e.x + Math.abs(ay.y) * e.y + Math.abs(az.y) * e.z;
      const ez = Math.abs(ax.z) * e.x + Math.abs(ay.z) * e.y + Math.abs(az.z) * e.z;
      this.min.set(this.c.x - ex, this.c.y - ey, this.c.z - ez);
      this.max.set(this.c.x + ex, this.c.y + ey, this.c.z + ez);
    }
    return this;
  }

  dist(x, y, z) {
    if (this.type === T_CONE) {
      // exact round cone (I. Quilez)
      const pax = x - this.a.x, pay = y - this.a.y, paz = z - this.a.z;
      const ba = this.ba, l2 = this.l2;
      const yy = pax * ba.x + pay * ba.y + paz * ba.z;
      const zz = yy - l2;
      const qx = pax * l2 - ba.x * yy, qy = pay * l2 - ba.y * yy, qz = paz * l2 - ba.z * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const rr = this.rr, a2 = this.a2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * this.il2 - this.rb;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * this.il2 - this.ra;
      return (Math.sqrt(x2 * a2 * this.il2) + yy * rr) * this.il2 - this.ra;
    }
    // local coordinates: rotate (p - c) by the inverse frame, v' = v + w t + q x t, t = 2 q x v
    const qi = this.qi;
    const px = x - this.c.x, py = y - this.c.y, pz = z - this.c.z;
    const tx = 2 * (qi.y * pz - qi.z * py), ty = 2 * (qi.z * px - qi.x * pz), tz = 2 * (qi.x * py - qi.y * px);
    const lx = px + qi.w * tx + (qi.y * tz - qi.z * ty);
    const ly = py + qi.w * ty + (qi.z * tx - qi.x * tz);
    const lz = pz + qi.w * tz + (qi.x * ty - qi.y * tx);
    if (this.type === T_ELL) {
      const r = this.r;
      const ax = lx / r.x, ay = ly / r.y, az = lz / r.z;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      const bx = ax / r.x, by = ay / r.y, bz = az / r.z;
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      if (k1 < 1e-12) return -Math.min(r.x, r.y, r.z);
      return (k0 * (k0 - 1)) / k1;
    }
    const qx = Math.abs(lx) - this.r.x, qy = Math.abs(ly) - this.r.y, qz = Math.abs(lz) - this.r.z;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - this.rad;
  }
}

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function smaxSub(a, b, k) {
  // smooth subtraction of b from a
  const h = Math.max(k - Math.abs(-b - a), 0) / k;
  return Math.max(a, -b) + h * h * k * 0.25;
}

// ------------------------------------------------------------------------------------------------
// Authoring helpers (bind pose)

function ell(seg, c, r, k, q = null) {
  const p = new Prim(T_ELL, seg, k);
  p.c.copy(c);
  p.r.copy(r);
  if (q) p.q.copy(q);
  return p;
}

// ellipsoid with its Y axis along `dir`
function ellAlong(seg, c, r, k, dir, zHint = ZF) {
  return ell(seg, c, r, k, axisFrame(dir, zHint));
}

function cone(seg, a, b, ra, rb, k) {
  const p = new Prim(T_CONE, seg, k);
  p.a.copy(a);
  p.b.copy(b);
  p.ra = ra;
  p.rb = rb;
  return p;
}

function box(seg, c, half, rad, k, q = null) {
  const p = new Prim(T_BOX, seg, k);
  p.c.copy(c);
  p.r.copy(half);
  p.rad = rad;
  if (q) p.q.copy(q);
  return p;
}

const add = (a, ...terms) => {
  const r = a.clone();
  for (let i = 0; i < terms.length; i += 2) r.addScaled(terms[i], terms[i + 1]);
  return r;
};

/**
 * Primitive list in bind pose. Sided primitives are authored for the left side and flagged
 * `mirror: true`; they are duplicated for the right side right after their definition so the
 * evaluation order (which matters for subtractions) stays local.
 */
function authorPrimitives() {
  const P = [];
  const push = (p, mirror = false) => {
    P.push(p);
    if (mirror) P.push(p.clone().mirror());
  };

  // ---------------- pelvis ----------------
  push(ell('pelvis', v(0, 0.948, -0.012), v(0.152, 0.1, 0.102), 0.05));
  push(ell('pelvis', v(0.062, 0.89, -0.064), v(0.072, 0.09, 0.068), 0.05), true); // gluteus
  push(ell('pelvis', v(0, 0.98, 0.03), v(0.118, 0.07, 0.06), 0.07)); // lower abdomen
  push(ell('pelvis', v(0, 0.873, 0.028), v(0.044, 0.046, 0.044), 0.03)); // groin
  push(ell('pelvis', v(0.122, 1.0, 0.0), v(0.04, 0.032, 0.062), 0.04), true); // iliac crest

  // ---------------- abdomen ----------------
  push(ell('abdomen', v(0, 1.112, -0.018), v(0.13, 0.13, 0.095), 0.075));
  push(ell('abdomen', v(0, 1.13, 0.036), v(0.08, 0.105, 0.044), 0.05)); // rectus abdominis
  push(ell('abdomen', v(0.093, 1.075, -0.01), v(0.052, 0.08, 0.07), 0.06), true); // obliques
  push(ell('abdomen', v(0.032, 1.12, -0.088), v(0.032, 0.13, 0.03), 0.05), true); // erector spinae

  // ---------------- chest ----------------
  push(ell('chest', v(0, 1.305, -0.03), v(0.146, 0.168, 0.094), 0.06)); // rib cage
  push(ell('chest', v(0, 1.4, 0.016), v(0.1, 0.07, 0.05), 0.05)); // upper sternum
  push(ell('chest', v(0.074, 1.362, 0.026), v(0.088, 0.05, 0.034), 0.05, new Quat().setFromEuler(0.2, 0, 0.32, 'XYZ')), true); // pectoralis
  push(ell('chest', v(0.09, 1.29, -0.068), v(0.078, 0.13, 0.05), 0.07), true); // latissimus
  push(ell('chest', v(0.082, 1.37, -0.104), v(0.058, 0.068, 0.02), 0.04), true); // scapula
  push(cone('chest', v(0.02, 1.5, -0.07), v(0.158, 1.456, -0.056), 0.042, 0.026, 0.04), true); // trapezius
  push(cone('chest', v(0.02, 1.452, 0.016), v(0.17, 1.466, -0.02), 0.016, 0.019, 0.03), true); // clavicle
  push(ell('chest', v(0.178, 1.452, -0.03), v(0.034, 0.024, 0.04), 0.035), true); // acromion

  // ---------------- neck ----------------
  push(cone('neck', v(0, 1.44, -0.048), v(0, 1.625, -0.018), 0.06, 0.052, 0.04));
  push(cone('neck', v(0.014, 1.47, 0.014), v(0.052, 1.615, -0.018), 0.016, 0.018, 0.035), true); // sternocleidomastoid
  push(ell('neck', v(0, 1.54, 0.02), v(0.011, 0.015, 0.009), 0.014)); // larynx

  // ---------------- head ----------------
  push(ell('head', v(0, 1.697, -0.01), v(0.074, 0.088, 0.096), 0.03)); // cranium
  push(ell('head', v(0, 1.636, 0.031), v(0.058, 0.074, 0.06), 0.03)); // face
  push(ell('head', v(0, 1.603, 0.028), v(0.052, 0.036, 0.052), 0.025)); // jaw
  push(cone('head', v(0.058, 1.622, -0.008), v(0.017, 1.575, 0.07), 0.011, 0.012, 0.022), true); // mandible
  push(ell('head', v(0, 1.573, 0.071), v(0.021, 0.017, 0.019), 0.015)); // chin
  push(ell('head', v(0.046, 1.652, 0.058), v(0.016, 0.01, 0.015), 0.024), true); // cheekbone
  push(cone('head', v(-0.036, 1.693, 0.086), v(0.036, 1.693, 0.086), 0.011, 0.011, 0.012)); // brow ridge
  push(cone('head', v(0, 1.674, 0.091), v(0, 1.638, 0.106), 0.0075, 0.011, 0.009)); // nose
  push(ell('head', v(0, 1.634, 0.097), v(0.016, 0.009, 0.011), 0.007)); // alae
  push(ell('head', v(0, 1.607, 0.086), v(0.019, 0.0055, 0.008), 0.01)); // upper lip
  push(ell('head', v(0, 1.597, 0.084), v(0.017, 0.0055, 0.008), 0.01)); // lower lip
  push(ell('head', v(0.074, 1.66, -0.012), v(0.0065, 0.029, 0.016), 0.008, new Quat().setFromEuler(-0.18, -0.35, 0, 'XYZ')), true); // ear
  {
    const s = ell('head', v(0.032, 1.672, 0.094), v(0.0165, 0.0135, 0.014), 0.009);
    s.sub = true;
    push(s, true); // eye socket
  }
  push(ell('head', v(0.032, 1.671, 0.071), v(0.012, 0.012, 0.012), 0.003), true); // eyeball
  push(ell('head', v(0.032, 1.6775, 0.077), v(0.0145, 0.0065, 0.0095), 0.004), true); // upper eyelid

  // ---------------- arms (left) ----------------
  const S = landmark('shoulderL'), E = landmark('elbowL'), W = landmark('wristL');
  const u = new Vec3().subVectors(E, S).normalize();
  const f = new Vec3().subVectors(W, E).normalize();
  const uf = new Vec3(0, 0, 1).addScaled(u, -u.z).normalize(); // forward, perpendicular to the humerus
  const ff = new Vec3(0, 0, 1).addScaled(f, -f.z).normalize();
  const ul = new Vec3().crossVectors(u, uf).normalize(); // lateral/medial axis of the upper arm
  push(ellAlong('upperArmL', add(S, u, 0.04, ul, -0.018), v(0.048, 0.08, 0.054), 0.045, u), true); // deltoid
  push(cone('upperArmL', add(S, u, 0.03), add(E, u, -0.015), 0.046, 0.035, 0.03), true);
  push(ellAlong('upperArmL', add(S, u, 0.155, uf, 0.016), v(0.034, 0.08, 0.036), 0.03, u), true); // biceps
  push(ellAlong('upperArmL', add(S, u, 0.13, uf, -0.02), v(0.037, 0.095, 0.034), 0.03, u), true); // triceps
  push(ell('forearmL', add(E, uf, -0.021, u, -0.004), v(0.021, 0.021, 0.018), 0.02), true); // olecranon
  push(ellAlong('forearmL', add(E, f, 0.075), v(0.042, 0.085, 0.039), 0.03, f), true); // forearm muscles
  push(cone('forearmL', add(E, f, 0.02, ff, 0.008), add(W, f, -0.012, ff, 0.011), 0.029, 0.019, 0.02), true); // radius side
  push(cone('forearmL', add(E, ff, -0.012), add(W, f, -0.012, ff, -0.011), 0.026, 0.018, 0.02), true); // ulna side

  // ---------------- hand (left) ----------------
  // hand frame: length along the forearm, width toward the thumb (+Z), palm facing the thigh
  const eW = ff.clone();
  const eP = new Vec3().crossVectors(f, eW).normalize(); // palm normal (medial)
  const hq = new Quat().setFromBasis(eP, f, eW);
  push(box('handL', add(W, f, 0.05, eP, -0.002), v(0.003, 0.033, 0.028), 0.0095, 0.012, hq), true); // palm
  push(cone('handL', add(W, f, 0.086, eW, 0.026, eP, -0.001), add(W, f, 0.081, eW, -0.024, eP, -0.001), 0.0105, 0.0095, 0.008), true); // knuckles
  push(ell('handL', add(W, f, 0.034, eW, 0.02, eP, 0.008), v(0.012, 0.027, 0.016), 0.012, hq), true); // thenar
  push(ell('handL', add(W, f, 0.044, eW, -0.022, eP, 0.006), v(0.01, 0.03, 0.011), 0.012, hq), true); // hypothenar
  const fingers = [
    { w: 0.025, base: 0.095, l1: 0.043, l2: 0.048, r0: 0.0094, r1: 0.0074, spread: 0.06 },
    { w: 0.0085, base: 0.097, l1: 0.047, l2: 0.052, r0: 0.0097, r1: 0.0077, spread: 0.0 },
    { w: -0.0085, base: 0.095, l1: 0.044, l2: 0.05, r0: 0.0091, r1: 0.0073, spread: -0.05 },
    { w: -0.0245, base: 0.088, l1: 0.034, l2: 0.04, r0: 0.0081, r1: 0.0066, spread: -0.12 },
  ];
  for (const fg of fingers) {
    const k0 = add(W, f, fg.base, eW, fg.w);
    const d1 = add(f, eP, Math.sin(0.18), eW, fg.spread).normalize();
    const j1 = add(k0, d1, fg.l1);
    const d2 = add(f, eP, Math.sin(0.62), eW, fg.spread * 0.6).normalize();
    const tip = add(j1, d2, fg.l2);
    push(cone('handL', k0, j1, fg.r0, (fg.r0 + fg.r1) * 0.5, 0.0035), true);
    push(cone('handL', j1, tip, (fg.r0 + fg.r1) * 0.5, fg.r1, 0.003), true);
  }
  {
    const tb = add(W, f, 0.024, eW, 0.022, eP, 0.006);
    const d1 = add(f.clone().scale(0.8), eW, 0.45, eP, 0.35).normalize();
    const t1 = add(tb, d1, 0.04);
    const d2 = add(f.clone().scale(0.9), eW, 0.12, eP, 0.42).normalize();
    const t2 = add(t1, d2, 0.048);
    push(cone('handL', tb, t1, 0.012, 0.0105, 0.006), true);
    push(cone('handL', t1, t2, 0.0105, 0.0084, 0.004), true);
  }

  // ---------------- legs (left) ----------------
  const td = DIRS.thighDirL, sd = DIRS.shinDirL;
  push(cone('thighL', v(0.083, 0.9, 0.0), v(0.098, 0.535, 0.006), 0.083, 0.056, 0.05), true);
  push(ellAlong('thighL', v(0.1, 0.71, 0.03), v(0.058, 0.17, 0.05), 0.04, td), true); // quadriceps
  push(ellAlong('thighL', v(0.076, 0.572, 0.026), v(0.032, 0.05, 0.034), 0.03, td), true); // vastus medialis
  push(ellAlong('thighL', v(0.09, 0.69, -0.035), v(0.055, 0.17, 0.048), 0.04, td), true); // hamstrings
  push(ellAlong('thighL', v(0.128, 0.73, 0.0), v(0.036, 0.14, 0.048), 0.045, td), true); // vastus lateralis
  push(ellAlong('thighL', v(0.047, 0.79, 0.0), v(0.04, 0.1, 0.054), 0.04, td), true); // adductors
  push(ell('thighL', v(0.097, 0.515, 0.002), v(0.05, 0.045, 0.048), 0.03), true); // femoral condyles
  push(ell('thighL', v(0.098, 0.515, 0.047), v(0.026, 0.03, 0.016), 0.015), true); // patella
  push(cone('shinL', v(0.097, 0.49, 0.0), v(0.105, 0.11, -0.022), 0.047, 0.029, 0.03), true);
  push(ellAlong('shinL', v(0.083, 0.37, -0.04), v(0.035, 0.1, 0.04), 0.035, sd), true); // gastrocnemius (medial)
  push(ellAlong('shinL', v(0.112, 0.385, -0.035), v(0.032, 0.09, 0.036), 0.035, sd), true); // gastrocnemius (lateral)
  push(ellAlong('shinL', v(0.112, 0.33, 0.022), v(0.022, 0.12, 0.022), 0.025, sd), true); // tibialis anterior
  push(cone('shinL', v(0.105, 0.2, -0.048), v(0.105, 0.06, -0.062), 0.016, 0.014, 0.02), true); // achilles
  push(ell('shinL', v(0.083, 0.085, -0.015), v(0.016, 0.016, 0.016), 0.012), true); // medial malleolus
  push(ell('shinL', v(0.128, 0.075, -0.026), v(0.015, 0.015, 0.015), 0.012), true); // lateral malleolus
  push(ell('footL', v(0.105, 0.037, -0.045), v(0.03, 0.035, 0.036), 0.02), true); // heel
  push(box('footL', v(0.107, 0.027, 0.06), v(0.027, 0.008, 0.074), 0.016, 0.02), true); // sole
  push(cone('footL', v(0.105, 0.072, 0.005), v(0.11, 0.035, 0.12), 0.03, 0.02, 0.025), true); // instep
  push(ell('footL', v(0.114, 0.021, 0.162), v(0.038, 0.018, 0.028), 0.015), true); // toes
  push(ell('footL', v(0.088, 0.023, 0.174), v(0.014, 0.016, 0.022), 0.008), true); // big toe
  return P;
}

// ------------------------------------------------------------------------------------------------

/** Rigid transform (rotation about a pivot) from a segment's bind placement to the sculpt pose. */
export function modelPoseOf(segName) {
  const side = segName.endsWith('L') ? 1 : segName.endsWith('R') ? -1 : 0;
  const q = new Quat();
  const pivot = new Vec3();
  if (side && /^(upperArm|forearm|hand)/.test(segName)) {
    q.setFromAxisAngle(new Vec3(0, 0, 1), MODEL_ARM_ABD * side);
    pivot.copy(landmark(side > 0 ? 'shoulderL' : 'shoulderR'));
  } else if (side && /^(thigh|shin|foot)/.test(segName)) {
    q.setFromAxisAngle(new Vec3(0, 0, 1), MODEL_LEG_ABD * side);
    pivot.copy(landmark(side > 0 ? 'hipL' : 'hipR'));
  }
  return { q, pivot };
}

const ADJ = {
  pelvis: ['abdomen', 'thighL', 'thighR'],
  abdomen: ['pelvis', 'chest'],
  chest: ['abdomen', 'neck', 'upperArmL', 'upperArmR'],
  neck: ['chest', 'head'],
  head: ['neck'],
};
for (const s of ['L', 'R']) {
  ADJ['upperArm' + s] = ['chest', 'forearm' + s];
  ADJ['forearm' + s] = ['upperArm' + s, 'hand' + s];
  ADJ['hand' + s] = ['forearm' + s];
  ADJ['thigh' + s] = ['pelvis', 'shin' + s];
  ADJ['shin' + s] = ['thigh' + s, 'foot' + s];
  ADJ['foot' + s] = ['shin' + s];
}

export class BodyShape {
  /** @param {string[]} segNames segment order (ragdoll.segList order) used for skin indices */
  constructor(segNames) {
    this.segNames = segNames;
    this.segIndex = {};
    segNames.forEach((n, i) => (this.segIndex[n] = i));
    this.modelPose = {};
    for (const n of segNames) this.modelPose[n] = modelPoseOf(n);
    const bindPrims = authorPrimitives();
    // the sculpt: every primitive moved with its segment into the model pose
    this.prims = bindPrims.map((p) => {
      const mp = this.modelPose[p.seg];
      p.transform(mp.q, mp.pivot).finalize();
      p.segIndex = this.segIndex[p.seg];
      return p;
    });
    this.adjacency = segNames.map((n) => (ADJ[n] || []).map((m) => this.segIndex[m]).filter((i) => i !== undefined));
    this.segPrims = segNames.map(() => []);
    for (const p of this.prims) this.segPrims[p.segIndex].push(p);
    this.band = 0.04;
    this.buildBuckets();
  }

  buildBuckets() {
    const min = new Vec3(Infinity, Infinity, Infinity), max = new Vec3(-Infinity, -Infinity, -Infinity);
    for (const p of this.prims) {
      min.x = Math.min(min.x, p.min.x);
      min.y = Math.min(min.y, p.min.y);
      min.z = Math.min(min.z, p.min.z);
      max.x = Math.max(max.x, p.max.x);
      max.y = Math.max(max.y, p.max.y);
      max.z = Math.max(max.z, p.max.z);
    }
    const pad = this.band + 0.02;
    min.x -= pad; min.y -= pad; min.z -= pad;
    max.x += pad; max.y += pad; max.z += pad;
    this.bmin = min;
    this.bmax = max;
    const cs = 0.025;
    this.cs = cs;
    this.nx = Math.ceil((max.x - min.x) / cs);
    this.ny = Math.ceil((max.y - min.y) / cs);
    this.nz = Math.ceil((max.z - min.z) / cs);
    const n = this.nx * this.ny * this.nz;
    const lists = new Array(n);
    for (let i = 0; i < n; i++) lists[i] = null;
    this.prims.forEach((p, idx) => {
      const g = this.band + p.k + 0.005;
      const x0 = Math.max(0, Math.floor((p.min.x - g - min.x) / cs)), x1 = Math.min(this.nx - 1, Math.floor((p.max.x + g - min.x) / cs));
      const y0 = Math.max(0, Math.floor((p.min.y - g - min.y) / cs)), y1 = Math.min(this.ny - 1, Math.floor((p.max.y + g - min.y) / cs));
      const z0 = Math.max(0, Math.floor((p.min.z - g - min.z) / cs)), z1 = Math.min(this.nz - 1, Math.floor((p.max.z + g - min.z) / cs));
      for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = x + this.nx * (y + this.ny * z);
        (lists[i] || (lists[i] = [])).push(idx);
      }
    });
    this.buckets = lists.map((l) => (l ? Int32Array.from(l) : null));
  }

  bucketAt(x, y, z) {
    const ix = Math.floor((x - this.bmin.x) / this.cs);
    const iy = Math.floor((y - this.bmin.y) / this.cs);
    const iz = Math.floor((z - this.bmin.z) / this.cs);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= this.nx || iy >= this.ny || iz >= this.nz) return null;
    return this.buckets[ix + this.nx * (iy + this.ny * iz)];
  }

  /** Signed distance of the whole sculpt (model pose), clamped to the band outside. */
  sdf(x, y, z) {
    const list = this.bucketAt(x, y, z);
    if (!list) return this.band;
    let d = Infinity;
    const prims = this.prims;
    for (let i = 0; i < list.length; i++) {
      const p = prims[list[i]];
      const di = p.dist(x, y, z);
      if (d === Infinity) d = p.sub ? Infinity : di;
      else d = p.sub ? smaxSub(d, di, p.k) : smin(d, di, p.k);
    }
    return Math.min(d, this.band);
  }

  /** Distance to the surface of one segment's own tissue (model pose). */
  segmentSdf(segIndex, x, y, z) {
    const prims = this.segPrims[segIndex];
    let d = Infinity;
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i];
      const di = p.dist(x, y, z);
      if (d === Infinity) d = p.sub ? Infinity : di;
      else d = p.sub ? smaxSub(d, di, p.k) : smin(d, di, p.k);
    }
    return d;
  }

  gradient(x, y, z, out, eps = 0.0007) {
    // tetrahedral central differences (4 samples)
    const a = this.sdf(x + eps, y - eps, z - eps);
    const b = this.sdf(x - eps, y - eps, z + eps);
    const c = this.sdf(x - eps, y + eps, z - eps);
    const d = this.sdf(x + eps, y + eps, z + eps);
    out.set(a - b - c + d, -a - b + c + d, -a + b - c + d);
    const l = out.length();
    if (l > 1e-12) out.scale(1 / l);
    return out;
  }

  /**
   * Skin weights for a model-space point: soft ownership by segment (softmax over primitive
   * distances), restricted to the dominant segment and its anatomical neighbours.
   * Writes up to 4 (index, weight) pairs.
   */
  skinWeights(x, y, z, outIdx, outW, tau = 0.012) {
    const list = this.bucketAt(x, y, z);
    const nseg = this.segNames.length;
    const best = this._best || (this._best = new Float64Array(nseg));
    best.fill(Infinity);
    const prims = this.prims;
    const all = list || prims.map((_, i) => i);
    for (let i = 0; i < all.length; i++) {
      const p = prims[all[i]];
      if (p.sub) continue;
      const di = p.dist(x, y, z);
      if (di < best[p.segIndex]) best[p.segIndex] = di;
    }
    let dom = 0;
    for (let s = 1; s < nseg; s++) if (best[s] < best[dom]) dom = s;
    const cand = [dom, ...this.adjacency[dom]];
    const ws = [];
    let sum = 0;
    for (const s of cand) {
      const d = best[s];
      if (!isFinite(d)) continue;
      const w = Math.exp(-(d - best[dom]) / tau);
      if (w < 0.01) continue;
      ws.push([s, w]);
      sum += w;
    }
    ws.sort((a, b) => b[1] - a[1]);
    for (let i = 0; i < 4; i++) {
      if (i < ws.length) {
        outIdx[i] = ws[i][0];
        outW[i] = ws[i][1] / sum;
      } else {
        outIdx[i] = 0;
        outW[i] = 0;
      }
    }
    // renormalise after truncation
    const t = outW[0] + outW[1] + outW[2] + outW[3];
    for (let i = 0; i < 4; i++) outW[i] /= t;
    return dom;
  }

  /** Convert a point given in a segment's body-local frame (physics) to model (sculpt) space. */
  localToModel(segName, bindPos, local, out) {
    const mp = this.modelPose[segName];
    out.copy(local).add(bindPos).sub(mp.pivot).applyQuat(mp.q).add(mp.pivot);
    return out;
  }

  modelToLocal(segName, bindPos, model, out) {
    const mp = this.modelPose[segName];
    out.copy(model).sub(mp.pivot);
    out.applyQuatInv(mp.q);
    out.add(mp.pivot).sub(bindPos);
    return out;
  }

  /**
   * Ray against one segment's skin. Origin/direction are in model space. Returns entry/exit
   * distances {tIn, tOut} along the ray or null. Sphere tracing on the segment field.
   */
  raySegment(segIndex, o, d, maxT, out = { tIn: 0, tOut: 0 }) {
    const prims = this.segPrims[segIndex];
    // bounding box of the segment's primitives
    let tmin = 0, tmax = maxT;
    const bb = this._segBounds || (this._segBounds = this.segPrims.map((ps) => {
      const mn = new Vec3(Infinity, Infinity, Infinity), mx = new Vec3(-Infinity, -Infinity, -Infinity);
      for (const p of ps) {
        mn.x = Math.min(mn.x, p.min.x); mn.y = Math.min(mn.y, p.min.y); mn.z = Math.min(mn.z, p.min.z);
        mx.x = Math.max(mx.x, p.max.x); mx.y = Math.max(mx.y, p.max.y); mx.z = Math.max(mx.z, p.max.z);
      }
      return [mn, mx];
    }));
    const [mn, mx] = bb[segIndex];
    for (const ax of ['x', 'y', 'z']) {
      const inv = 1 / (Math.abs(d[ax]) < 1e-12 ? 1e-12 : d[ax]);
      let t0 = (mn[ax] - 0.005 - o[ax]) * inv, t1 = (mx[ax] + 0.005 - o[ax]) * inv;
      if (t0 > t1) [t0, t1] = [t1, t0];
      tmin = Math.max(tmin, t0);
      tmax = Math.min(tmax, t1);
      if (tmin > tmax) return null;
    }
    if (!prims.length) return null;
    const f = (t) => this.segmentSdf(segIndex, o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
    // march in
    let t = tmin, hit = -1;
    for (let i = 0; i < 96 && t <= tmax; i++) {
      const dist = f(t);
      if (dist < 0.0004) {
        hit = t;
        break;
      }
      t += Math.max(dist * 0.9, 0.0005);
    }
    if (hit < 0) return null;
    // march out from the far side
    t = tmax;
    let hitOut = hit;
    for (let i = 0; i < 96 && t >= hit; i++) {
      const dist = f(t);
      if (dist < 0.0004) {
        hitOut = t;
        break;
      }
      t -= Math.max(dist * 0.9, 0.0005);
    }
    out.tIn = hit;
    out.tOut = Math.max(hitOut, hit);
    return out;
  }
}
