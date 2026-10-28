// Procedural swing rigs + the swing state machine. PURE (no Babylon imports): camera-space math
// only, unit-tested in Node (tests/unit/tools-swing.test.ts).
//
// Camera space: eye at the origin, +X right, +Y up, +Z forward (= Babylon camera-local axes, so
// a mesh parented to the camera at camera-space position p appears exactly at eye + R·p).
//
// The swing MOTION is animation (a procedural arc), but its timing is physically motivated and
// the tool system turns it into physical hits by sweeping the head sphere along it every fixed
// step. From rest at the wound-back pose the head speed rises as a quarter sine (muscle torque is
// highest early in a swing) to the tool's peak speed v exactly at the nominal contact point, then
// decelerates uniformly through the follow-through. With path length Lc to the contact point and
// Lf after it:
//     contact time tc = π·Lc / (2v),  follow-through time tf = 2·Lf / v,  speed(tc) = v,
// so a target at the nominal reach is hit at the tool's rated speed, a target that is too close
// is hit early in the arc (slower, weaker — like real swings), and a charged swing (larger wind
// angle, higher v) is both longer and faster.
//
// Poses are two hand frames (position + orientation). Strike/wound poses come from the rig
// parameters (lever angle θ + wrist cock α for arcs, extension/pull-back for fists); idle poses
// are explicit frames. Wind-up, recovery and recoil blend in pose space (position lerp with a
// bulge that keeps the tool away from the eye, orientation slerp).

import type { ToolDef } from "../contracts.ts";

export interface V3 {
  x: number;
  y: number;
  z: number;
}
export interface Q4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

// ------------------------------------------------------------------------------------ math helpers (out-param style)

const set = (o: V3, x: number, y: number, z: number): V3 => {
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
};
const copy = (o: V3, a: V3): V3 => set(o, a.x, a.y, a.z);
const len = (a: V3) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (o: V3, a: V3, b: V3): V3 => set(o, a.x - b.x, a.y - b.y, a.z - b.z);
const cross = (o: V3, a: V3, b: V3): V3 => set(o, a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const normalizeInPlace = (a: V3, fallback?: V3): V3 => {
  const l = len(a);
  if (l > 1e-12) return set(a, a.x / l, a.y / l, a.z / l);
  return fallback ? copy(a, fallback) : set(a, 0, 0, 1);
};
export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const q4 = (): Q4 => ({ x: 0, y: 0, z: 0, w: 1 });

/** Rodrigues rotation of v about unit axis k by angle a (pure linear map; handedness-agnostic). */
export function rotateAxis(o: V3, k: V3, a: number, v: V3): V3 {
  const c = Math.cos(a),
    s = Math.sin(a);
  const kd = (k.x * v.x + k.y * v.y + k.z * v.z) * (1 - c);
  const cx = k.y * v.z - k.z * v.y,
    cy = k.z * v.x - k.x * v.z,
    cz = k.x * v.y - k.y * v.x;
  return set(o, v.x * c + cx * s + k.x * kd, v.y * c + cy * s + k.y * kd, v.z * c + cz * s + k.z * kd);
}

/** Rotate v by unit quaternion q (v' = q v q*). */
export function rotateQ(o: V3, q: Q4, v: V3): V3 {
  const tx = 2 * (q.y * v.z - q.z * v.y),
    ty = 2 * (q.z * v.x - q.x * v.z),
    tz = 2 * (q.x * v.y - q.y * v.x);
  return set(o, v.x + q.w * tx + (q.y * tz - q.z * ty), v.y + q.w * ty + (q.z * tx - q.x * tz), v.z + q.w * tz + (q.x * ty - q.y * tx));
}

const _bx = v3(),
  _by = v3(),
  _bz = v3();
/**
 * Quaternion of the frame whose local +Y maps to `axis` and local +Z to `face` (face is
 * orthogonalised against axis; X = Y × Z). Robust to degenerate input.
 */
export function quatFromAxisFace(o: Q4, axis: V3, face: V3): Q4 {
  normalizeInPlace(copy(_by, axis), { x: 0, y: 1, z: 0 });
  copy(_bz, face);
  const d = dot(_bz, _by);
  set(_bz, _bz.x - _by.x * d, _bz.y - _by.y * d, _bz.z - _by.z * d);
  if (len(_bz) < 1e-6) {
    // face ∥ axis: pick any perpendicular
    set(_bz, Math.abs(_by.x) < 0.9 ? 1 : 0, Math.abs(_by.x) < 0.9 ? 0 : 1, 0);
    const d2 = dot(_bz, _by);
    set(_bz, _bz.x - _by.x * d2, _bz.y - _by.y * d2, _bz.z - _by.z * d2);
  }
  normalizeInPlace(_bz);
  cross(_bx, _by, _bz);
  // rotation matrix with columns X, Y, Z → quaternion (Shepperd's method)
  const m00 = _bx.x,
    m10 = _bx.y,
    m20 = _bx.z,
    m01 = _by.x,
    m11 = _by.y,
    m21 = _by.z,
    m02 = _bz.x,
    m12 = _bz.y,
    m22 = _bz.z;
  const tr = m00 + m11 + m22;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    o.w = 0.25 / s;
    o.x = (m21 - m12) * s;
    o.y = (m02 - m20) * s;
    o.z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    o.w = (m21 - m12) / s;
    o.x = 0.25 * s;
    o.y = (m01 + m10) / s;
    o.z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    o.w = (m02 - m20) / s;
    o.x = (m01 + m10) / s;
    o.y = 0.25 * s;
    o.z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    o.w = (m10 - m01) / s;
    o.x = (m02 + m20) / s;
    o.y = (m12 + m21) / s;
    o.z = 0.25 * s;
  }
  const l = Math.hypot(o.x, o.y, o.z, o.w) || 1;
  o.x /= l;
  o.y /= l;
  o.z /= l;
  o.w /= l;
  return o;
}

/** Shortest-path spherical interpolation (o may alias a or b). */
export function slerpQ(o: Q4, a: Q4, b: Q4, t: number): Q4 {
  let bx = b.x,
    by = b.y,
    bz = b.z,
    bw = b.w;
  let c = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (c < 0) {
    c = -c;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let k0: number, k1: number;
  if (c > 0.9995) {
    k0 = 1 - t;
    k1 = t;
  } else {
    const th = Math.acos(Math.min(1, c)),
      s = Math.sin(th);
    k0 = Math.sin((1 - t) * th) / s;
    k1 = Math.sin(t * th) / s;
  }
  const x = a.x * k0 + bx * k1,
    y = a.y * k0 + by * k1,
    z = a.z * k0 + bz * k1,
    w = a.w * k0 + bw * k1;
  const l = Math.hypot(x, y, z, w) || 1;
  o.x = x / l;
  o.y = y / l;
  o.z = z / l;
  o.w = w / l;
  return o;
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep01 = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
export const smootherstep01 = (x: number) => {
  const t = clamp01(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const easeOutCubic = (x: number) => {
  const t = 1 - clamp01(x);
  return 1 - t * t * t;
};

// ------------------------------------------------------------------------------------ poses

/** A hand frame: position and orientation (local +Y = handle/through axis, local +Z = knuckles/face). */
export interface Frame {
  p: V3;
  q: Q4;
}

/** Camera-space pose of both hands and the striking point. */
export interface Pose {
  right: Frame;
  left: Frame;
  /** Striking point: tool head centre, or the striking fist. */
  head: V3;
  /** Striking fist (jab rigs): 0 right, 1 left. Tools: 0. */
  hand: number;
}

export function makePose(): Pose {
  return { right: { p: v3(), q: q4() }, left: { p: v3(), q: q4() }, head: v3(), hand: 0 };
}

export function copyPose(o: Pose, a: Pose): Pose {
  copy(o.right.p, a.right.p);
  copy(o.left.p, a.left.p);
  Object.assign(o.right.q, a.right.q);
  Object.assign(o.left.q, a.left.q);
  copy(o.head, a.head);
  o.hand = a.hand;
  return o;
}

const _ey: V3 = { x: 0, y: 1, z: 0 };
const _ez: V3 = { x: 0, y: 0, z: 1 };
/** Local +Y (tool axis) of a frame in camera space. */
export const frameAxis = (o: V3, f: Frame): V3 => rotateQ(o, f.q, _ey);
/** Local +Z (striking face) of a frame in camera space. */
export const frameFace = (o: V3, f: Frame): V3 => rotateQ(o, f.q, _ez);

/** Explicit frame description used in definitions (directions need not be unit/orthogonal). */
export interface FrameDef {
  p: V3;
  axis: V3;
  face: V3;
}

export function frameFromDef(d: FrameDef, out: Frame = { p: v3(), q: q4() }): Frame {
  copy(out.p, d.p);
  quatFromAxisFace(out.q, d.axis, d.face);
  return out;
}

// ------------------------------------------------------------------------------------ rigs

/** A rigid lever (arms + tool) rotating about a shoulder/torso pivot, plus a wrist cock. */
export interface ArcRig {
  kind: "arc";
  /** Rotation pivot (shoulder / torso), camera space. */
  pivot: V3;
  /** Head centre and main (right) hand grip at the nominal contact pose. */
  head: V3;
  grip: V3;
  /** Approximate head travel direction at contact (made exactly perpendicular to the lever). */
  travel: V3;
  /** Lever angles (rad) relative to the contact pose: wound back (normal / fully charged), follow-through end. */
  wind: number;
  windCharged: number;
  follow: number;
  /** Wrist cock (rad, same sign as `wind`) at the wound pose; released smoothly by contact. */
  cock: number;
  /** Distance (m) from the main grip down the handle to the second hand; 0 = one-handed. */
  offhand: number;
  /** Rest pose of the main hand / tool (the off hand follows `offhand` down the handle). */
  idle: FrameDef;
}

/** Two fists throwing straight punches (alternating hands). */
export interface JabRig {
  kind: "jab";
  /** Fist centres: guard pose and nominal contact, [right, left]. */
  guard: readonly [V3, V3];
  contact: readonly [V3, V3];
  /** Over-extension (m) beyond the contact point along the punch line. */
  extend: number;
  /** Pull-back offset of the punching fist at full charge (right hand; mirrored in x for the left). */
  windBack: V3;
}

export type Rig = ArcRig | JabRig;

/** Derived, immutable data of an arc rig. */
export interface PreparedArc {
  rig: ArcRig;
  /** Unit rotation axis: positive θ moves the head along `travel`. */
  k: V3;
  /** Grip relative to the pivot, head relative to the grip, at contact. */
  g0: V3;
  hg: V3;
  /** Grip → head distance. */
  toolLen: number;
  /** Unit tool axis and face at contact. */
  axis0: V3;
  face0: V3;
  idle: Pose;
}

export interface PreparedJab {
  rig: JabRig;
  /** Per hand [right, left]: unit punch direction, full-extension end point, pull-back offset. */
  dir: [V3, V3];
  end: [V3, V3];
  back: [V3, V3];
  idle: Pose;
}

export type Prepared = PreparedArc | PreparedJab;

export function prepareRig(rig: Rig): Prepared {
  if (rig.kind === "arc") {
    const r = sub(v3(), rig.head, rig.pivot);
    const k = normalizeInPlace(cross(v3(), r, rig.travel), { x: 1, y: 0, z: 0 });
    // exact travel = k × r̂ (the component of the requested travel perpendicular to the lever)
    const face0 = normalizeInPlace(cross(v3(), k, r));
    const g0 = sub(v3(), rig.grip, rig.pivot);
    const hg = sub(v3(), rig.head, rig.grip);
    const axis0 = normalizeInPlace(copy(v3(), hg), { x: 0, y: 1, z: 0 });
    const d = dot(face0, axis0);
    set(face0, face0.x - axis0.x * d, face0.y - axis0.y * d, face0.z - axis0.z * d);
    normalizeInPlace(face0, { x: 0, y: 0, z: 1 });
    const prep: PreparedArc = { rig, k, g0, hg, toolLen: len(hg), axis0, face0, idle: makePose() };
    frameFromDef(rig.idle, prep.idle.right);
    toolCompletePose(prep, prep.idle);
    return prep;
  }
  const dir: [V3, V3] = [v3(0, 0, 1), v3(0, 0, 1)];
  const end: [V3, V3] = [v3(), v3()];
  const back: [V3, V3] = [v3(rig.windBack.x, rig.windBack.y, rig.windBack.z), v3(-rig.windBack.x, rig.windBack.y, rig.windBack.z)];
  for (let h = 0; h < 2; h++) {
    normalizeInPlace(sub(dir[h], rig.contact[h], rig.guard[h]));
    set(end[h], rig.contact[h].x + dir[h].x * rig.extend, rig.contact[h].y + dir[h].y * rig.extend, rig.contact[h].z + dir[h].z * rig.extend);
  }
  const prep: PreparedJab = { rig, dir, end, back, idle: makePose() };
  evalJab(prep, 0, 0, 0, 0, 0, prep.idle);
  return prep;
}

const _t0 = v3();
const _t1 = v3();
const _t2 = v3();
const _t3 = v3();

/** Derive the off hand and head of a tool pose from its right-hand frame. */
function toolCompletePose(prep: PreparedArc, pose: Pose): Pose {
  const ax = frameAxis(_t3, pose.right);
  const off = prep.rig.offhand > 0 ? prep.rig.offhand : 0;
  set(pose.left.p, pose.right.p.x - ax.x * off, pose.right.p.y - ax.y * off, pose.right.p.z - ax.z * off);
  Object.assign(pose.left.q, pose.right.q);
  set(pose.head, pose.right.p.x + ax.x * prep.toolLen, pose.right.p.y + ax.y * prep.toolLen, pose.right.p.z + ax.z * prep.toolLen);
  pose.hand = 0;
  return pose;
}

/** Wrist cock at lever angle θ for a strike starting at θ0 (<0): full cock at θ0, released by θ = 0. */
export function cockAt(prep: PreparedArc, theta: number, theta0: number): number {
  const c = prep.rig.cock;
  if (c === 0 || theta >= 0 || theta0 >= 0) return 0;
  const f = clamp01(theta / theta0);
  return c * f * Math.sqrt(f);
}

/** Arc pose at lever angle θ and wrist cock α. */
export function evalArc(prep: PreparedArc, theta: number, alpha: number, out: Pose): Pose {
  const pv = prep.rig.pivot;
  rotateAxis(_t0, prep.k, theta, prep.g0);
  set(out.right.p, pv.x + _t0.x, pv.y + _t0.y, pv.z + _t0.z);
  rotateAxis(_t1, prep.k, theta + alpha, prep.axis0);
  rotateAxis(_t2, prep.k, theta + alpha, prep.face0);
  quatFromAxisFace(out.right.q, _t1, _t2);
  return toolCompletePose(prep, out);
}

/** Head centre of an arc rig at (θ, α). */
export function arcHead(prep: PreparedArc, theta: number, alpha: number, out: V3): V3 {
  const pv = prep.rig.pivot;
  rotateAxis(_t0, prep.k, theta, prep.g0);
  rotateAxis(_t1, prep.k, theta + alpha, prep.hg);
  return set(out, pv.x + _t0.x + _t1.x, pv.y + _t0.y + _t1.y, pv.z + _t0.z + _t1.z);
}

/** Fists pose: extension e (0 guard .. 1 full) and pull-back w (0..1) per hand. */
export function evalJab(prep: PreparedJab, eR: number, wR: number, eL: number, wL: number, hand: number, out: Pose): Pose {
  const rig = prep.rig;
  for (let h = 0; h < 2; h++) {
    const e = h === 0 ? eR : eL,
      w = h === 0 ? wR : wL;
    const g = rig.guard[h],
      en = prep.end[h],
      b = prep.back[h];
    const f = h === 0 ? out.right : out.left;
    set(f.p, g.x + b.x * w + (en.x - g.x) * e, g.y + b.y * w + (en.y - g.y) * e, g.z + b.z * w + (en.z - g.z) * e);
    // knuckles along the punch line; the through-axis rolls from vertical in guard (palms in)
    // to nearly horizontal at full extension (palm down), mirrored per hand
    const face = copy(_t1, prep.dir[h]);
    set(_t2, 0, 1, 0);
    const d = dot(_t2, face);
    set(_t2, _t2.x - face.x * d, _t2.y - face.y * d, _t2.z - face.z * d);
    normalizeInPlace(_t2, { x: 0, y: 1, z: 0 });
    rotateAxis(_t2, face, (h === 0 ? -1 : 1) * 1.35 * clamp01(e), _t2);
    quatFromAxisFace(f.q, _t2, face);
  }
  out.hand = hand;
  copy(out.head, hand === 1 ? out.left.p : out.right.p);
  return out;
}

const _qa = q4();
/**
 * Blend two poses: positions lerp with a bulge that keeps paths at least `minDist` from the eye,
 * orientations slerp. `toolLen` > 0 re-derives the head (and the off hand when `offhand` > 0)
 * from the right frame (tools); 0 = fists (head = striking hand). `out` may alias `a`.
 */
export function blendPose(a: Pose, b: Pose, u: number, toolLen: number, offhand: number, out: Pose, minDist = 0.24): Pose {
  for (let h = 0; h < 2; h++) {
    const fa = h === 0 ? a.right : a.left,
      fb = h === 0 ? b.right : b.left,
      fo = h === 0 ? out.right : out.left;
    // bulge: if the straight path passes near the eye, push its middle outward
    const mx = (fa.p.x + fb.p.x) * 0.5,
      my = (fa.p.y + fb.p.y) * 0.5,
      mz = (fa.p.z + fb.p.z) * 0.5;
    const ml = Math.hypot(mx, my, mz);
    let bx = 0,
      by = 0,
      bz = 0;
    if (ml < minDist) {
      if (ml > 1e-3) {
        const k = (minDist - ml) / ml;
        bx = mx * k;
        by = my * k;
        bz = mz * k;
      } else {
        // degenerate (path through the eye): push to the lower right, in front
        bx = minDist * 0.848;
        by = -minDist * 0.424;
        bz = minDist * 0.318;
      }
    }
    const w = 4 * u * (1 - u);
    const ax = fa.p.x,
      ay = fa.p.y,
      az = fa.p.z;
    set(fo.p, ax + (fb.p.x - ax) * u + bx * w, ay + (fb.p.y - ay) * u + by * w, az + (fb.p.z - az) * u + bz * w);
    slerpQ(_qa, fa.q, fb.q, u);
    Object.assign(fo.q, _qa);
  }
  if (toolLen > 0) {
    const ax = frameAxis(_t3, out.right);
    if (offhand > 0) {
      // keep the off hand on the handle
      set(out.left.p, out.right.p.x - ax.x * offhand, out.right.p.y - ax.y * offhand, out.right.p.z - ax.z * offhand);
      Object.assign(out.left.q, out.right.q);
    }
    set(out.head, out.right.p.x + ax.x * toolLen, out.right.p.y + ax.y * toolLen, out.right.p.z + ax.z * toolLen);
    out.hand = 0;
  } else {
    out.hand = u < 0.5 ? a.hand : b.hand;
    copy(out.head, out.hand === 1 ? out.left.p : out.right.p);
  }
  return out;
}

/** Blend one frame (position lerp + orientation slerp) into `out` (may alias a or b). */
export function blendFrame(a: Frame, b: Frame, u: number, out: Frame): Frame {
  const ax = a.p.x,
    ay = a.p.y,
    az = a.p.z;
  set(out.p, ax + (b.p.x - ax) * u, ay + (b.p.y - ay) * u, az + (b.p.z - az) * u);
  slerpQ(out.q, a.q, b.q, u);
  return out;
}

// ------------------------------------------------------------------------------------ strike paths

const TAB_N = 48;

/**
 * The strike path of one swing: head positions along the arc/line sampled by arc length, with
 * the quarter-sine/uniform-deceleration timing described at the top of this file.
 */
export class StrikePath {
  /** Lever angle (arc) or extension fraction along the punch line (jab) per sample. */
  readonly param = new Float64Array(TAB_N + 1);
  /** Cumulative head path length (m) per sample. */
  readonly s = new Float64Array(TAB_N + 1);
  /** Head position per sample (camera space). */
  readonly head = new Float64Array(3 * (TAB_N + 1));
  /** Wrist cock per sample (arc). */
  readonly alpha = new Float64Array(TAB_N + 1);
  /** Total length, length to the nominal contact point, peak speed, duration, contact time, follow-through time. */
  L = 0;
  Lc = 0;
  v = 0;
  T = 0;
  tc = 0;
  tf = 0;
  /** Strike start angle (arc) / pull-back weight (jab). */
  start = 0;
  hand = 0;
  private hint = 0;

  /** Build for an arc rig from θ0 (wound) to θ1 (follow-through) with peak speed v. */
  buildArc(prep: PreparedArc, theta0: number, theta1: number, v: number): void {
    const out = _t0;
    let acc = 0,
      px = 0,
      py = 0,
      pz = 0,
      contactS = -1;
    for (let i = 0; i <= TAB_N; i++) {
      const th = theta0 + ((theta1 - theta0) * i) / TAB_N;
      const al = cockAt(prep, th, theta0);
      arcHead(prep, th, al, out);
      if (i > 0) {
        acc += Math.hypot(out.x - px, out.y - py, out.z - pz);
        const thPrev = this.param[i - 1];
        if (contactS < 0 && thPrev <= 0 && th >= 0) {
          const f = th === thPrev ? 0 : (0 - thPrev) / (th - thPrev);
          contactS = this.s[i - 1] + (acc - this.s[i - 1]) * f;
        }
      }
      this.param[i] = th;
      this.alpha[i] = al;
      this.s[i] = acc;
      this.head[3 * i] = px = out.x;
      this.head[3 * i + 1] = py = out.y;
      this.head[3 * i + 2] = pz = out.z;
    }
    if (contactS < 0) contactS = theta0 >= 0 ? 0 : acc; // contact outside the arc (degenerate rigs)
    this.start = theta0;
    this.hand = 0;
    this.finish(acc, contactS, v);
  }

  /** Build for a jab rig: straight line from guard (+ pull-back w0) to full extension. */
  buildJab(prep: PreparedJab, hand: number, w0: number, v: number): void {
    const rig = prep.rig;
    const g = rig.guard[hand],
      b = prep.back[hand],
      en = prep.end[hand],
      c = rig.contact[hand];
    const p0x = g.x + b.x * w0,
      p0y = g.y + b.y * w0,
      p0z = g.z + b.z * w0;
    const dx = en.x - p0x,
      dy = en.y - p0y,
      dz = en.z - p0z;
    const L = Math.hypot(dx, dy, dz);
    for (let i = 0; i <= TAB_N; i++) {
      const f = i / TAB_N;
      this.param[i] = f;
      this.alpha[i] = 0;
      this.s[i] = L * f;
      this.head[3 * i] = p0x + dx * f;
      this.head[3 * i + 1] = p0y + dy * f;
      this.head[3 * i + 2] = p0z + dz * f;
    }
    // contact = projection of the nominal contact point onto the punch line
    const Lc = L > 1e-9 ? ((c.x - p0x) * dx + (c.y - p0y) * dy + (c.z - p0z) * dz) / L : 0;
    this.start = w0;
    this.hand = hand;
    this.finish(L, Lc, v);
  }

  /** Build a straight path p0 → p1 (any coordinate frame) with the nominal contact at `contactS` metres. */
  buildLine(p0: V3, p1: V3, contactS: number, v: number): void {
    const dx = p1.x - p0.x,
      dy = p1.y - p0.y,
      dz = p1.z - p0.z;
    const L = Math.hypot(dx, dy, dz);
    for (let i = 0; i <= TAB_N; i++) {
      const f = i / TAB_N;
      this.param[i] = f;
      this.alpha[i] = 0;
      this.s[i] = L * f;
      this.head[3 * i] = p0.x + dx * f;
      this.head[3 * i + 1] = p0.y + dy * f;
      this.head[3 * i + 2] = p0.z + dz * f;
    }
    this.start = 0;
    this.hand = 0;
    this.finish(L, contactS, v);
  }

  private finish(L: number, Lc: number, v: number): void {
    this.L = Math.max(L, 1e-4);
    // keep contact strictly inside the path so both phases exist
    this.Lc = Math.min(Math.max(Lc, 0.05 * this.L), 0.97 * this.L);
    this.v = Math.max(v, 1e-3);
    this.tc = (Math.PI * this.Lc) / (2 * this.v);
    this.tf = (2 * (this.L - this.Lc)) / this.v;
    this.T = this.tc + this.tf;
    this.hint = 0;
  }

  /** Path length travelled at time t (s). */
  sAt(t: number): number {
    if (t <= 0) return 0;
    if (t >= this.T) return this.L;
    if (t <= this.tc) return this.Lc * (1 - Math.cos((Math.PI / 2) * (t / this.tc)));
    const tau = t - this.tc;
    return Math.min(this.L, this.Lc + this.v * tau - (0.5 * this.v * tau * tau) / this.tf);
  }

  /** Head speed (m/s) along the path at time t. */
  speedAt(t: number): number {
    if (t <= 0 || t >= this.T) return 0;
    if (t <= this.tc) return this.v * Math.sin((Math.PI / 2) * (t / this.tc));
    return Math.max(0, this.v * (1 - (t - this.tc) / this.tf));
  }

  /** Sample interval containing arc length s → (_loc.i, _loc.f). */
  private locate(s: number): void {
    const S = this.s;
    let i = this.hint;
    if (i >= TAB_N || S[i] > s) i = 0;
    while (i < TAB_N - 1 && S[i + 1] < s) i++;
    this.hint = i;
    const ds = S[i + 1] - S[i];
    _loc.i = i;
    _loc.f = ds > 1e-12 ? clamp01((s - S[i]) / ds) : 0;
  }

  /** Head position (camera space) at path length s. */
  headAtS(s: number, out: V3): V3 {
    this.locate(s);
    const H = this.head,
      a = 3 * _loc.i,
      b = a + 3,
      f = _loc.f;
    return set(out, H[a] + (H[b] - H[a]) * f, H[a + 1] + (H[b + 1] - H[a + 1]) * f, H[a + 2] + (H[b + 2] - H[a + 2]) * f);
  }

  /** Unit tangent (direction of travel) at path length s. */
  tangentAtS(s: number, out: V3): V3 {
    this.locate(s);
    const H = this.head,
      a = 3 * _loc.i,
      b = a + 3;
    set(out, H[b] - H[a], H[b + 1] - H[a + 1], H[b + 2] - H[a + 2]);
    return normalizeInPlace(out);
  }

  /** Path parameter (θ or line fraction) and wrist cock at path length s (shared result object). */
  paramAtS(s: number): { param: number; alpha: number } {
    this.locate(s);
    const i = _loc.i,
      f = _loc.f;
    _par.param = this.param[i] + (this.param[i + 1] - this.param[i]) * f;
    _par.alpha = this.alpha[i] + (this.alpha[i + 1] - this.alpha[i]) * f;
    return _par;
  }
}
const _loc = { i: 0, f: 0 };
const _par = { param: 0, alpha: 0 };

// ------------------------------------------------------------------------------------ state machine

export type SwingPhase = "idle" | "windup" | "charge" | "strike" | "recoil" | "recover";

/** update() result flags. */
export const EV_STRIKE_START = 1;
export const EV_STRIKE_END = 2;
export const EV_WINDUP_START = 4;
/** The head moved along the strike path this update: sweep from sweepFrom to sweepTo. */
export const EV_STRIKE_STEP = 8;

/** Seconds a fully charged swing may be held (trembling) before it is released automatically. */
export const MAX_CHARGE_HOLD = 0.5;
/** Fraction of the recovery after which a new swing may start (earlier presses are queued). */
export const RECOVER_INTERRUPT = 0.35;
const RECOIL_TIME = 0.13;

/** Peak head speed (m/s) for a swing with charge c (0..1). */
export function chargedSpeed(def: ToolDef, c: number): number {
  return def.speed * (1 + (def.chargeSpeedMul - 1) * clamp01(c));
}

/** Pull-back weight of a jab for charge c (normal punches pull back a little). */
const jabWind = (c: number) => 0.25 + 0.75 * smoothstep01(c);

/**
 * Swing state machine: idle → windup (to the wound pose) → charge (while fire is held) →
 * strike (path with physical timing) → [recoil] → recover → idle. Pure; driven by the tool
 * system once per fixed step and sampled per render frame for the viewmodel.
 */
export class SwingMachine {
  readonly def: ToolDef;
  readonly prep: Prepared;
  phase: SwingPhase = "idle";
  /** Time in the current phase (s); during the strike: path time (advances at `rate`). */
  t = 0;
  /** Strike path times covered by the last update (valid when it returned EV_STRIKE_STEP). */
  sweepFrom = 0;
  sweepTo = 0;
  /** Charge level 0..1 (charge phase / current strike). */
  charge = 0;
  /** Time spent at full charge. */
  holdAtMax = 0;
  /** Time-rate multiplier of the strike (reduced by follow-through hits). */
  rate = 1;
  /** Hits registered during the current strike. */
  hits = 0;
  /** Striking fist (jab rigs). */
  hand = 0;
  /** Incremented every time a strike starts (lets the tool system detect new strikes robustly). */
  strikeId = 0;
  readonly path = new StrikePath();
  private nextHand = 0;
  private releaseQueued = false;
  private queued = false;
  private phaseDur = 0;
  private hold = 0;
  private justEnded = false;
  private readonly from = makePose();
  private readonly to = makePose();
  private readonly scratch = makePose();

  constructor(def: ToolDef, rig: Rig) {
    this.def = def;
    this.prep = prepareRig(rig);
    copyPose(this.from, this.prep.idle);
  }

  get rig(): Rig {
    return this.prep.rig;
  }

  /** The rest pose (camera space). */
  get idle(): Pose {
    return this.prep.idle;
  }

  /** Grip → head distance (0 for fists). */
  get toolLen(): number {
    return this.prep.rig.kind === "arc" ? (this.prep as PreparedArc).toolLen : 0;
  }

  /** True while a swing occupies the tool (windup → recoil; recovery is interruptible). */
  get busy(): boolean {
    return this.phase === "windup" || this.phase === "charge" || this.phase === "strike" || this.phase === "recoil";
  }

  /** Fire pressed. Returns true if a wind-up started now. */
  press(): boolean {
    if (this.phase === "idle") {
      this.startWindup();
      return true;
    }
    if (this.phase === "recover") {
      if (this.t >= this.hold + RECOVER_INTERRUPT * this.phaseDur) {
        this.startWindup();
        return true;
      }
      this.queued = true;
      this.releaseQueued = false;
    }
    return false;
  }

  /** Fire released (edge). Lost edges are covered by update(dt, fireDown). Returns true if a strike started. */
  release(): boolean {
    if (this.phase === "windup") this.releaseQueued = true;
    else if (this.phase === "charge") {
      this.startStrike(this.charge, 0);
      return true;
    } else if (this.queued) this.releaseQueued = true;
    return false;
  }

  /** Start a strike immediately with the given charge (debug/tests), skipping the wind-up. */
  forceStrike(power: number): void {
    this.queued = false;
    this.releaseQueued = false;
    if (this.rig.kind === "jab") {
      this.hand = power > 0.5 ? 0 : this.nextHand;
      this.nextHand = 1 - this.hand;
    }
    this.startStrike(clamp01(power), 0);
  }

  /** Abort any swing and return to idle smoothly (tool switch, grabbing an object). */
  cancel(): void {
    if (this.phase === "idle") return;
    this.poseAt(0, this.scratch);
    copyPose(this.from, this.scratch);
    this.queued = false;
    this.releaseQueued = false;
    this.beginRecover(0);
  }

  /** Advance by dt seconds of simulation. `fireDown` is the current fire button state. Returns EV_* flags. */
  update(dt: number, fireDown: boolean): number {
    let ev = 0;
    this.justEnded = false;
    switch (this.phase) {
      case "idle":
        break;
      case "windup":
        this.t += dt;
        if (!fireDown) this.releaseQueued = true;
        if (this.t >= this.phaseDur) {
          const carry = this.t - this.phaseDur;
          if (this.releaseQueued) {
            this.startStrike(0, carry);
            ev |= EV_STRIKE_START | (this.t > 0 ? EV_STRIKE_STEP : 0);
          } else {
            this.phase = "charge";
            this.t = carry;
            this.charge = Math.min(1, carry / Math.max(this.def.chargeTime, 1e-3));
            this.holdAtMax = 0;
          }
        }
        break;
      case "charge":
        this.t += dt;
        this.charge = Math.min(1, this.charge + dt / Math.max(this.def.chargeTime, 1e-3));
        if (!fireDown) {
          this.startStrike(this.charge, 0);
          ev |= EV_STRIKE_START;
        } else if (this.charge >= 1) {
          this.holdAtMax += dt;
          if (this.holdAtMax >= MAX_CHARGE_HOLD) {
            this.startStrike(1, 0);
            ev |= EV_STRIKE_START;
          }
        }
        break;
      case "strike":
        this.sweepFrom = this.t;
        this.t = Math.min(this.path.T, this.t + dt * this.rate);
        this.sweepTo = this.t;
        ev |= EV_STRIKE_STEP;
        if (this.t >= this.path.T) {
          // The tool system still sweeps up to T this step and may resolve a hit in it (hit()
          // accepts hits while `justEnded`).
          this.strikePose(this.path.T, this.from);
          this.beginRecover(0);
          this.justEnded = true;
          ev |= EV_STRIKE_END;
        }
        break;
      case "recoil":
        this.t += dt;
        if (this.t >= this.phaseDur) {
          copyPose(this.from, this.to);
          this.beginRecover(0);
        }
        break;
      case "recover":
        this.t += dt;
        if (this.queued && this.t >= this.hold + RECOVER_INTERRUPT * this.phaseDur) {
          const rel = this.releaseQueued;
          this.startWindup();
          this.releaseQueued = rel || !fireDown;
          ev |= EV_WINDUP_START;
        } else if (this.t >= this.phaseDur + this.hold) {
          this.phase = "idle";
          this.t = 0;
        }
        break;
    }
    return ev;
  }

  /**
   * Resolve a hit at strike time tHit: "recoil" bounces the tool back and ends the swing,
   * "stop" leaves it stuck briefly then recovers, "continue" keeps following through at a
   * reduced rate (`factor` multiplies the strike time-rate, i.e. the head speed).
   */
  hit(kind: "recoil" | "stop" | "continue", tHit: number, factor = 1, recoilStrength = 1): void {
    this.hits++;
    if (this.phase !== "strike" && !this.justEnded) return;
    if (kind === "continue") {
      if (this.phase === "strike") this.rate = Math.max(0.15, this.rate * clamp01(factor));
      return;
    }
    this.justEnded = false;
    const th = Math.min(Math.max(tHit, 0), this.path.T);
    this.strikePose(th, this.from);
    if (kind === "stop") {
      this.beginRecover(0.07);
      return;
    }
    // recoil: bounce back along the path (in rig parameters), then recover from there
    const k = clamp01(recoilStrength);
    const { param, alpha } = this.path.paramAtS(this.path.sAt(th));
    if (this.prep.rig.kind === "arc") {
      const dir = Math.sign(this.prep.rig.wind) || -1;
      evalArc(this.prep as PreparedArc, param + dir * (0.1 + 0.28 * k), alpha + dir * 0.18 * k, this.to);
    } else {
      const e = Math.max(0, param - (0.15 + 0.25 * k));
      const w = this.path.start * (1 - e);
      if (this.hand === 1) evalJab(this.prep as PreparedJab, 0, 0, e, w, 1, this.to);
      else evalJab(this.prep as PreparedJab, e, w, 0, 0, 0, this.to);
    }
    this.phase = "recoil";
    this.t = 0;
    this.phaseDur = RECOIL_TIME;
  }

  /** Camera-space head position at strike time t. */
  headAt(t: number, out: V3): V3 {
    return this.path.headAtS(this.path.sAt(t), out);
  }

  /** Camera-space head velocity (m/s) at strike time t, including the current rate. */
  velocityAt(t: number, out: V3): V3 {
    const s = this.path.sAt(t);
    this.path.tangentAtS(s, out);
    const sp = this.path.speedAt(t) * this.rate;
    return set(out, out.x * sp, out.y * sp, out.z * sp);
  }

  /** Camera-space pose `extra` seconds after the current fixed-step time (render interpolation; clamped to the phase). */
  poseAt(extra: number, out: Pose): Pose {
    const ex = Math.max(0, extra);
    const t = this.t + ex * (this.phase === "strike" ? this.rate : 1);
    const tl = this.toolLen;
    const off = this.prep.rig.kind === "arc" ? this.prep.rig.offhand : 0;
    switch (this.phase) {
      case "idle":
        return copyPose(out, this.prep.idle);
      case "windup":
        this.woundPose(0, this.scratch);
        return blendPose(this.from, this.scratch, smoothstep01(t / Math.max(this.phaseDur, 1e-4)), tl, off, out);
      case "charge":
        return this.woundPose(Math.min(1, this.charge + ex / Math.max(this.def.chargeTime, 1e-3)), out);
      case "strike":
        return this.strikePose(Math.min(t, this.path.T), out);
      case "recoil":
        return blendPose(this.from, this.to, easeOutCubic(t / this.phaseDur), tl, off, out);
      case "recover":
        return blendPose(this.from, this.prep.idle, smootherstep01((t - this.hold) / Math.max(this.phaseDur, 1e-4)), tl, off, out);
    }
  }

  // ---------------------------------------------------------------- internals

  private startWindup(): void {
    this.poseAt(0, this.scratch);
    copyPose(this.from, this.scratch);
    this.phase = "windup";
    this.t = 0;
    this.phaseDur = Math.max(this.def.windup, 1e-3);
    this.releaseQueued = false;
    this.queued = false;
    this.charge = 0;
    this.holdAtMax = 0;
    if (this.rig.kind === "jab") {
      this.hand = this.nextHand;
      this.nextHand = 1 - this.hand;
    }
  }

  private startStrike(c: number, carry: number): void {
    this.strikeId++;
    this.charge = clamp01(c);
    const v = chargedSpeed(this.def, this.charge);
    if (this.prep.rig.kind === "arc") {
      const a = this.prep as PreparedArc;
      this.path.buildArc(a, this.windAngle(this.charge), a.rig.follow, v);
    } else {
      this.path.buildJab(this.prep as PreparedJab, this.hand, jabWind(this.charge), v);
    }
    this.phase = "strike";
    this.rate = 1;
    this.hits = 0;
    this.t = Math.min(Math.max(carry, 0), this.path.T);
    this.sweepFrom = 0;
    this.sweepTo = this.t;
    this.releaseQueued = false;
    this.queued = false;
  }

  private beginRecover(hold: number): void {
    this.phase = "recover";
    this.t = 0;
    this.hold = hold;
    this.phaseDur = Math.max(this.def.recover, 1e-3);
  }

  /** Wind angle for charge c; eased in-out so the charge motion continues smoothly from the windup's rest. */
  private windAngle(c: number): number {
    const r = this.rig as ArcRig;
    return r.wind + (r.windCharged - r.wind) * smoothstep01(c);
  }

  /** Wound pose for charge c. */
  private woundPose(c: number, out: Pose): Pose {
    if (this.prep.rig.kind === "arc") return evalArc(this.prep as PreparedArc, this.windAngle(c), this.prep.rig.cock, out);
    const w = jabWind(c);
    return this.hand === 1 ? evalJab(this.prep as PreparedJab, 0, 0, 0, w, 1, out) : evalJab(this.prep as PreparedJab, 0, w, 0, 0, 0, out);
  }

  /** Pose on the strike path at strike time t. */
  private strikePose(t: number, out: Pose): Pose {
    const { param, alpha } = this.path.paramAtS(this.path.sAt(t));
    if (this.prep.rig.kind === "arc") return evalArc(this.prep as PreparedArc, param, alpha, out);
    const w = this.path.start * (1 - param);
    return this.hand === 1 ? evalJab(this.prep as PreparedJab, 0, 0, param, w, 1, out) : evalJab(this.prep as PreparedJab, param, w, 0, 0, 0, out);
  }
}

/** Strike duration (s) of a normal (uncharged) swing of a rig — used to fill ToolDef.strike. */
export function normalStrikeDuration(def: ToolDef, rig: Rig): number {
  const prep = prepareRig(rig);
  const path = new StrikePath();
  if (prep.rig.kind === "arc") path.buildArc(prep as PreparedArc, prep.rig.wind, prep.rig.follow, def.speed);
  else path.buildJab(prep as PreparedJab, 0, jabWind(0), def.speed);
  return path.T;
}
