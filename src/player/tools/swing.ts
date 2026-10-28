// Procedural swing rigs + the swing state machine. PURE (no Babylon imports): camera-space math
// only, unit-tested in Node (tests/unit/tools-swing.test.ts).
//
// Camera space: eye at the origin, +X right, +Y up, +Z forward (= Babylon camera-local axes, so
// a mesh parented to the camera at camera-space position p appears exactly at eye + R·p).
//
// The swing MOTION is animation, but its timing is physically motivated and the tool system turns
// it into physical hits by sweeping the head sphere along it every fixed step.
//
// Path. Tool swings follow a smooth head path (two cubic Hermite segments) from the wound-back
// pose through the NOMINAL CONTACT POINT on the crosshair line — where the head travels along a
// designed direction with a strong forward component, so whatever the crosshair is on gets hit
// squarely (a rigid lever about the shoulder would only graze a wall straight ahead) — and on into
// the follow-through. The tool's orientation is interpolated between key poses (wound, contact,
// end); at contact the handle is exactly perpendicular to the travel so the striking face leads,
// and most of the rotation happens late in the swing (the wrist snap). The hands sit one tool
// length down the handle. Fists punch along straight lines.
//
// Timing. From rest at the wound pose the head speed rises as a quarter sine (muscle torque is
// highest early in a swing) to the tool's peak speed v exactly at the contact point, then
// decelerates uniformly through the follow-through. With path length Lc to contact and Lf after:
//     contact time tc = π·Lc / (2v),  follow-through time tf = 2·Lf / v,  speed(tc) = v,
// so a target at the nominal reach is hit at the tool's rated speed, a target that is too close
// is hit early in the swing (slower, weaker — like real swings), and a charged swing (wound back
// further, higher v) is both longer and faster.
//
// Poses are two hand frames (position + orientation). Strike/wound poses come from the rigs;
// idle poses are explicit frames. Wind-up, recovery and recoil blend in pose space (position lerp
// with a bulge that keeps the tool away from the eye, orientation slerp).

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

/** Blend one frame (position lerp + orientation slerp) into `out` (may alias a or b). */
export function blendFrame(a: Frame, b: Frame, u: number, out: Frame): Frame {
  const ax = a.p.x,
    ay = a.p.y,
    az = a.p.z;
  set(out.p, ax + (b.p.x - ax) * u, ay + (b.p.y - ay) * u, az + (b.p.z - az) * u);
  slerpQ(out.q, a.q, b.q, u);
  return out;
}

// ------------------------------------------------------------------------------------ rigs

/** Head position + tool axis (grip → head) of a key pose; the face follows the motion. */
export interface KeyPose {
  head: V3;
  axis: V3;
}

/** A tool swing: head path through the crosshair contact point + key-pose orientations. */
export interface CurveRig {
  kind: "curve";
  /** Grip → head distance (m): where the physics head sphere sits on the tool axis. */
  toolLen: number;
  /** Head centre at the nominal contact (on/near the crosshair line, at the tool's reach). */
  contact: V3;
  /** Direction of travel at contact (normalised internally). */
  travel: V3;
  /** Handle direction hint at contact (grip → head); made perpendicular to `travel`. */
  handle: V3;
  /** Wound pose for a normal / fully charged swing, and the initial direction of motion. */
  wound: KeyPose;
  woundCharged: KeyPose;
  launch: V3;
  /** End of the follow-through and the direction the head arrives from. */
  end: KeyPose;
  endDir: V3;
  /**
   * Second hand position along the handle relative to the main grip (m): > 0 further down the
   * handle (away from the head), < 0 towards/beyond the head, 0 = one-handed.
   */
  offhand: number;
  /** Rest pose of the main hand / tool (the off hand follows `offhand` along the handle). */
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

export type Rig = CurveRig | JabRig;

/** Derived, immutable data of a curve rig. */
export interface PreparedCurve {
  rig: CurveRig;
  /** Unit travel at contact, unit handle at contact (⊥ travel), unit launch/end directions. */
  travel: V3;
  handle: V3;
  launch: V3;
  endDir: V3;
  /** Key orientations (local +Y = axis, +Z = face). */
  qContact: Q4;
  qWound: Q4;
  qWoundCharged: Q4;
  qEnd: Q4;
  /** Main grip at contact. */
  grip: V3;
  toolLen: number;
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

export type Prepared = PreparedCurve | PreparedJab;

export function prepareRig(rig: Rig): Prepared {
  if (rig.kind === "curve") {
    const travel = normalizeInPlace(copy(v3(), rig.travel));
    const h = copy(v3(), rig.handle);
    const d = dot(h, travel);
    const handle = normalizeInPlace(set(h, h.x - travel.x * d, h.y - travel.y * d, h.z - travel.z * d), { x: 0, y: 1, z: 0 });
    const grip = set(v3(), rig.contact.x - handle.x * rig.toolLen, rig.contact.y - handle.y * rig.toolLen, rig.contact.z - handle.z * rig.toolLen);
    const launch = normalizeInPlace(copy(v3(), rig.launch));
    const endDir = normalizeInPlace(copy(v3(), rig.endDir));
    const prep: PreparedCurve = {
      rig,
      travel,
      handle,
      launch,
      endDir,
      qContact: quatFromAxisFace(q4(), handle, travel),
      qWound: quatFromAxisFace(q4(), rig.wound.axis, launch),
      qWoundCharged: quatFromAxisFace(q4(), rig.woundCharged.axis, launch),
      qEnd: quatFromAxisFace(q4(), rig.end.axis, endDir),
      grip,
      toolLen: rig.toolLen,
      idle: makePose(),
    };
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
function toolCompletePose(prep: PreparedCurve, pose: Pose): Pose {
  const ax = frameAxis(_t3, pose.right);
  const off = prep.rig.offhand;
  set(pose.left.p, pose.right.p.x - ax.x * off, pose.right.p.y - ax.y * off, pose.right.p.z - ax.z * off);
  Object.assign(pose.left.q, pose.right.q);
  set(pose.head, pose.right.p.x + ax.x * prep.toolLen, pose.right.p.y + ax.y * prep.toolLen, pose.right.p.z + ax.z * prep.toolLen);
  pose.hand = 0;
  return pose;
}

/** Tool pose from a head position and an orientation (grip one tool length down the handle). */
export function toolPose(prep: PreparedCurve, head: V3, q: Q4, out: Pose): Pose {
  Object.assign(out.right.q, q);
  const axis = frameAxis(_t0, out.right);
  set(out.right.p, head.x - axis.x * prep.toolLen, head.y - axis.y * prep.toolLen, head.z - axis.z * prep.toolLen);
  copy(out.head, head);
  const off = prep.rig.offhand;
  set(out.left.p, out.right.p.x - axis.x * off, out.right.p.y - axis.y * off, out.right.p.z - axis.z * off);
  Object.assign(out.left.q, q);
  out.hand = 0;
  return out;
}

/** Wound orientation for charge c. */
export function woundQuat(prep: PreparedCurve, c: number, out: Q4): Q4 {
  return slerpQ(out, prep.qWound, prep.qWoundCharged, smoothstep01(c));
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
    if (offhand !== 0) {
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

// ------------------------------------------------------------------------------------ strike paths

/** Samples before / after the contact point (curve paths: contact is sample TAB_A exactly). */
const TAB_A = 32;
const TAB_N = 48;

function hermite(o: V3, p0: V3, t0: V3, p1: V3, t1: V3, u: number): V3 {
  const u2 = u * u,
    u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1,
    h10 = u3 - 2 * u2 + u,
    h01 = -2 * u3 + 3 * u2,
    h11 = u3 - u2;
  return set(o, h00 * p0.x + h10 * t0.x + h01 * p1.x + h11 * t1.x, h00 * p0.y + h10 * t0.y + h01 * p1.y + h11 * t1.y, h00 * p0.z + h10 * t0.z + h01 * p1.z + h11 * t1.z);
}

function hermiteDeriv(o: V3, p0: V3, t0: V3, p1: V3, t1: V3, u: number): V3 {
  const u2 = u * u;
  const d00 = 6 * u2 - 6 * u,
    d10 = 3 * u2 - 4 * u + 1,
    d01 = -6 * u2 + 6 * u,
    d11 = 3 * u2 - 2 * u;
  return set(o, d00 * p0.x + d10 * t0.x + d01 * p1.x + d11 * t1.x, d00 * p0.y + d10 * t0.y + d01 * p1.y + d11 * t1.y, d00 * p0.z + d10 * t0.z + d01 * p1.z + d11 * t1.z);
}

/**
 * The strike path of one swing: head positions + directions of motion sampled along the path,
 * with the quarter-sine/uniform-deceleration timing described at the top of this file.
 */
export class StrikePath {
  /** Fraction along the path (0..1) per sample (jab: extension fraction along the punch line). */
  readonly param = new Float64Array(TAB_N + 1);
  /** Cumulative head path length (m) per sample. */
  readonly s = new Float64Array(TAB_N + 1);
  /** Head position and unit direction of motion per sample (camera space). */
  readonly head = new Float64Array(3 * (TAB_N + 1));
  readonly dir = new Float64Array(3 * (TAB_N + 1));
  /** Orientation at the start of the path (curve rigs; the wound orientation for this charge). */
  readonly q0: Q4 = q4();
  /** Total length, length to the nominal contact point, peak speed, duration, contact time, follow-through time. */
  L = 0;
  Lc = 0;
  v = 0;
  T = 0;
  tc = 0;
  tf = 0;
  /** Jab pull-back weight at the start. */
  start = 0;
  hand = 0;
  /** Contact point, unit travel at contact and the contact / end orientations of THIS path (curve rigs). */
  readonly contact: V3 = v3();
  readonly travel: V3 = v3(0, 0, 1);
  readonly qContact: Q4 = q4();
  readonly qEnd: Q4 = q4();
  private hint = 0;

  /**
   * Build for a curve rig starting at head position S with orientation q0 (the wound pose for this
   * charge). `aim` (optional) re-targets the swing: contact point, travel and handle at contact and
   * the end of the follow-through replace the rig's nominal ones (see SwingMachine.aimStrike).
   */
  buildCurve(prep: PreparedCurve, S: V3, q0: Q4, v: number, aim?: CurveAim): void {
    Object.assign(this.q0, q0);
    const rig = prep.rig;
    const C = copy(this.contact, aim ? aim.contact : rig.contact);
    const T = copy(this.travel, aim ? aim.travel : prep.travel);
    const E = aim ? aim.end : rig.end.head;
    if (aim) quatFromAxisFace(this.qContact, aim.handle, T);
    else Object.assign(this.qContact, prep.qContact);
    Object.assign(this.qEnd, prep.qEnd);
    const dA = Math.max(1e-3, Math.hypot(C.x - S.x, C.y - S.y, C.z - S.z));
    const dB = Math.max(1e-3, Math.hypot(E.x - C.x, E.y - C.y, E.z - C.z));
    // tangents scaled by the chords (well-behaved Hermite shapes)
    const tA0 = set(_tA0, prep.launch.x * dA * 1.1, prep.launch.y * dA * 1.1, prep.launch.z * dA * 1.1);
    const tA1 = set(_tA1, T.x * dA * 1.2, T.y * dA * 1.2, T.z * dA * 1.2);
    let acc = 0,
      px = 0,
      py = 0,
      pz = 0;
    for (let i = 0; i <= TAB_N; i++) {
      const p = _t0,
        d = _t3;
      if (i <= TAB_A) {
        const u = i / TAB_A;
        hermite(p, S, tA0, C, tA1, u);
        hermiteDeriv(d, S, tA0, C, tA1, u);
      } else {
        const u = (i - TAB_A) / (TAB_N - TAB_A);
        const tB0 = _tB0,
          tB1 = _tB1;
        set(tB0, T.x * dB, T.y * dB, T.z * dB);
        set(tB1, prep.endDir.x * dB * 0.7, prep.endDir.y * dB * 0.7, prep.endDir.z * dB * 0.7);
        hermite(p, C, tB0, E, tB1, u);
        hermiteDeriv(d, C, tB0, E, tB1, u);
      }
      // exact directions at the junctions (the derivative at a rest point may vanish)
      if (i === 0) copy(d, prep.launch);
      else if (i === TAB_A) copy(d, T);
      normalizeInPlace(d, T);
      if (i > 0) acc += Math.hypot(p.x - px, p.y - py, p.z - pz);
      this.s[i] = acc;
      this.head[3 * i] = px = p.x;
      this.head[3 * i + 1] = py = p.y;
      this.head[3 * i + 2] = pz = p.z;
      this.dir[3 * i] = d.x;
      this.dir[3 * i + 1] = d.y;
      this.dir[3 * i + 2] = d.z;
    }
    const Lc = this.s[TAB_A];
    for (let i = 0; i <= TAB_N; i++) this.param[i] = acc > 0 ? this.s[i] / acc : i / TAB_N;
    this.start = 0;
    this.hand = 0;
    this.finish(acc, Lc, v);
  }

  /**
   * Build for a jab rig: straight line from guard (+ pull-back w0) to full extension. `contact`
   * (optional) re-aims the punch line through that fist-centre contact point (over-extending by
   * the rig's `extend` beyond it).
   */
  buildJab(prep: PreparedJab, hand: number, w0: number, v: number, contact?: V3): void {
    const rig = prep.rig;
    const g = rig.guard[hand],
      b = prep.back[hand];
    const p0 = set(_t0, g.x + b.x * w0, g.y + b.y * w0, g.z + b.z * w0);
    let en: V3 = prep.end[hand],
      c: V3 = rig.contact[hand];
    if (contact) {
      c = contact;
      const dir = normalizeInPlace(sub(_tA0, contact, p0), prep.dir[hand]);
      en = set(_tA1, contact.x + dir.x * rig.extend, contact.y + dir.y * rig.extend, contact.z + dir.z * rig.extend);
    }
    const L = this.line(p0, en);
    // contact = projection of the contact point onto the punch line
    const Lc = L > 1e-9 ? ((c.x - p0.x) * (en.x - p0.x) + (c.y - p0.y) * (en.y - p0.y) + (c.z - p0.z) * (en.z - p0.z)) / L : 0;
    copy(this.contact, c);
    this.start = w0;
    this.hand = hand;
    this.finish(L, Lc, v);
  }

  /** Build a straight path p0 → p1 (any coordinate frame) with the nominal contact at `contactS` metres. */
  buildLine(p0: V3, p1: V3, contactS: number, v: number): void {
    const L = this.line(p0, p1);
    this.start = 0;
    this.hand = 0;
    this.finish(L, contactS, v);
  }

  private line(p0: V3, p1: V3): number {
    const p0x = p0.x,
      p0y = p0.y,
      p0z = p0.z;
    const dx = p1.x - p0x,
      dy = p1.y - p0y,
      dz = p1.z - p0z;
    const L = Math.hypot(dx, dy, dz);
    const inv = L > 1e-12 ? 1 / L : 0;
    for (let i = 0; i <= TAB_N; i++) {
      const f = i / TAB_N;
      this.param[i] = f;
      this.s[i] = L * f;
      this.head[3 * i] = p0x + dx * f;
      this.head[3 * i + 1] = p0y + dy * f;
      this.head[3 * i + 2] = p0z + dz * f;
      this.dir[3 * i] = dx * inv;
      this.dir[3 * i + 1] = dy * inv;
      this.dir[3 * i + 2] = inv > 0 ? dz * inv : 1;
    }
    return L;
  }

  /** Change the peak speed of the built path (re-derives the timing). */
  retime(v: number): void {
    this.finish(this.L, this.Lc, v);
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

  /** Unit direction of travel at path length s (interpolated sample directions). */
  tangentAtS(s: number, out: V3): V3 {
    this.locate(s);
    const D = this.dir,
      a = 3 * _loc.i,
      b = a + 3,
      f = _loc.f;
    set(out, D[a] + (D[b] - D[a]) * f, D[a + 1] + (D[b + 1] - D[a + 1]) * f, D[a + 2] + (D[b + 2] - D[a + 2]) * f);
    return normalizeInPlace(out);
  }

  /** Path fraction at path length s (jab: extension fraction along the punch line). */
  paramAtS(s: number): number {
    this.locate(s);
    const i = _loc.i,
      f = _loc.f;
    return this.param[i] + (this.param[i + 1] - this.param[i]) * f;
  }

  /**
   * Tool orientation at path length s (curve rigs): wound → contact eased so most of the rotation
   * happens late (wrist snap; reaches the contact orientation exactly at contact), then contact → end.
   */
  quatAtS(_prep: PreparedCurve, s: number, out: Q4): Q4 {
    if (s <= this.Lc) {
      const u = this.Lc > 0 ? clamp01(s / this.Lc) : 1;
      return slerpQ(out, this.q0, this.qContact, u * Math.sqrt(u));
    }
    const u = this.L > this.Lc ? clamp01((s - this.Lc) / (this.L - this.Lc)) : 1;
    return slerpQ(out, this.qContact, this.qEnd, u);
  }
}
/** Re-targeted contact of a curve swing (camera space): head centre, unit travel and handle at contact, end of the follow-through. */
export interface CurveAim {
  contact: V3;
  travel: V3;
  handle: V3;
  end: V3;
}
const _tA0 = v3();
const _tA1 = v3();
const _loc = { i: 0, f: 0 };
const _tB0 = v3();
const _tB1 = v3();

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

// ------------------------------------------------------------------------------------ aiming

/** What the crosshair is on at strike start (camera space): surface point on the view line + unit surface normal. */
export interface StrikeAim {
  point: V3;
  normal: V3;
}
/** A retargeted contact never comes closer to the eye than this (m); nearer targets are met earlier in the swing. */
export const MIN_AIM_REACH = 0.3;
/** Targets up to this far (m) beyond reach + head radius still square the swing up (met in the follow-through). */
export const AIM_SLACK = 0.25;
/** The swing squares up to surfaces whose inward normal is within ~73° of the view (cos); others are hit along the view. */
const SQUARE_COS = 0.3;
/** An approach shorter than this fraction of the nominal one has less run-up: v ∝ √(approach / this). */
const FULL_SPEED_APPROACH = 0.75;
/** Lowest speed factor of a cramped swing. */
const MIN_CRAMPED_SPEED = 0.5;

const _aimInto = v3();
const _aimAxis = v3();
const _aimC = v3();
const _aimDir = v3();
const _aim: CurveAim = { contact: v3(), travel: v3(), handle: v3(), end: v3() };

/** Pull-back weight of a jab for charge c (normal punches pull back a little). */
const jabWind = (c: number) => 0.25 + 0.75 * smoothstep01(c);

/** Wound head position of a curve rig for charge c (eased so the charge continues smoothly from the windup's rest). */
function woundHead(rig: CurveRig, c: number, out: V3): V3 {
  const k = smoothstep01(c);
  const a = rig.wound.head,
    b = rig.woundCharged.head;
  return set(out, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
}

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
  /** Approach length (m) of the current strike's NOMINAL path (before aimStrike). */
  private nominalLc = 0;
  private readonly tp = v3();
  private readonly tq2 = q4();
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
  private readonly tv = v3();
  private readonly tq = q4();

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
    return this.prep.rig.kind === "curve" ? this.prep.rig.toolLen : 0;
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
   * reduced rate (`factor` multiplies the strike time-rate, i.e. the head speed). `count` = false
   * for contacts that were not strikes (grazes): they do not use up the per-swing hit budget.
   */
  hit(kind: "recoil" | "stop" | "continue", tHit: number, factor = 1, recoilStrength = 1, count = true): void {
    if (count) this.hits++;
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
    // recoil: the head bounces back along its path, then recovers from there
    const k = clamp01(recoilStrength);
    const s = this.path.sAt(th);
    const back = (0.06 + 0.16 * k) * Math.max(0.3, this.path.Lc);
    this.poseAtS(Math.max(0, s - back), this.to);
    this.phase = "recoil";
    this.t = 0;
    this.phaseDur = RECOIL_TIME;
  }

  /**
   * Re-aim the current strike at what the crosshair is on, the way a real swinger squares up: the
   * contact point moves along the view line to where the head sphere just touches the surface
   * (clamped to [MIN_AIM_REACH, reach]); curve swings also rotate their contact travel, handle and
   * the rest of the path from "straight ahead" to "into the surface" (when it faces the player),
   * so a square blow delivers ≈ cos²(travel, view) of ½·m·v². A much shortened approach loses
   * speed (less run-up). Keeps the current strike time. Returns false (path unchanged) when there
   * is no strike, no aim or the target is out of reach.
   */
  aimStrike(aim: StrikeAim | null): boolean {
    if (this.phase !== "strike" || !aim) return false;
    const def = this.def;
    const r = def.headRadius;
    const d = len(aim.point);
    if (!(d > 1e-4) || !Number.isFinite(d) || d > def.reach + r + AIM_SLACK) return false;
    const v = chargedSpeed(def, this.charge);
    if (this.prep.rig.kind === "curve") {
      const p = this.prep as PreparedCurve;
      const rig = p.rig;
      // into-surface direction (camera space): −normal when the surface faces us, else along the view
      const into = set(_aimInto, -aim.normal.x, -aim.normal.y, -aim.normal.z);
      normalizeInPlace(into, _ez);
      if (into.z < SQUARE_COS) set(into, aim.point.x / d, aim.point.y / d, aim.point.z / d);
      // rotation taking +Z (the rig's design "forward") onto `into`
      const ax = set(_aimAxis, -into.y, into.x, 0);
      const sa = len(ax);
      const ang = Math.atan2(sa, into.z);
      const rot = sa > 1e-6;
      if (rot) set(ax, ax.x / sa, ax.y / sa, 0);
      const a = _aim;
      if (rot) {
        rotateAxis(a.travel, ax, ang, p.travel);
        rotateAxis(a.handle, ax, ang, p.handle);
      } else {
        copy(a.travel, p.travel);
        copy(a.handle, p.handle);
      }
      // head centre where the sphere touches the aimed point when arriving along `into`
      const c = set(a.contact, aim.point.x - into.x * r, aim.point.y - into.y * r, aim.point.z - into.z * r);
      clampReach(c, def.reach);
      // follow-through keeps its shape relative to the contact
      set(a.end, rig.end.head.x + c.x - rig.contact.x, rig.end.head.y + c.y - rig.contact.y, rig.end.head.z + c.z - rig.contact.z);
      this.path.buildCurve(p, woundHead(rig, this.charge, this.tv), woundQuat(p, this.charge, this.tq), v, a);
    } else {
      const p = this.prep as PreparedJab;
      const g = p.rig.guard[this.hand],
        b = p.back[this.hand],
        w0 = jabWind(this.charge);
      // fist centre short of the point along the punch line from the (pulled-back) guard
      const dir = normalizeInPlace(set(_aimDir, aim.point.x - g.x - b.x * w0, aim.point.y - g.y - b.y * w0, aim.point.z - g.z - b.z * w0), p.dir[this.hand]);
      const c = set(_aimC, aim.point.x - dir.x * r, aim.point.y - dir.y * r, aim.point.z - dir.z * r);
      clampReach(c, def.reach);
      this.path.buildJab(p, this.hand, w0, v, c);
    }
    const ratio = this.nominalLc > 1e-6 ? this.path.Lc / this.nominalLc : 1;
    if (ratio < FULL_SPEED_APPROACH) this.path.retime(v * Math.max(MIN_CRAMPED_SPEED, Math.sqrt(ratio / FULL_SPEED_APPROACH)));
    this.t = Math.min(this.t, this.path.T);
    this.sweepTo = this.t;
    return true;
  }

  /** Camera-space point on the tool axis `off` metres from the head towards the grip, at strike time t (curve rigs; fists: the fist). */
  toolPointAt(t: number, off: number, out: V3): V3 {
    const s = this.path.sAt(t);
    this.path.headAtS(s, out);
    if (this.prep.rig.kind !== "curve" || off === 0) return out;
    this.path.quatAtS(this.prep as PreparedCurve, s, this.tq2);
    const ax = rotateQ(this.tp, this.tq2, _ey);
    return set(out, out.x - ax.x * off, out.y - ax.y * off, out.z - ax.z * off);
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
    const off = this.prep.rig.kind === "curve" ? this.prep.rig.offhand : 0;
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
    if (this.prep.rig.kind === "curve") {
      const p = this.prep as PreparedCurve;
      this.path.buildCurve(p, woundHead(p.rig, this.charge, this.tv), woundQuat(p, this.charge, this.tq), v);
    }
    else this.path.buildJab(this.prep as PreparedJab, this.hand, jabWind(this.charge), v);
    this.nominalLc = this.path.Lc;
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

  /** Wound pose for charge c. */
  private woundPose(c: number, out: Pose): Pose {
    if (this.prep.rig.kind === "curve") {
      const p = this.prep as PreparedCurve;
      return toolPose(p, woundHead(p.rig, c, this.tv), woundQuat(p, c, this.tq), out);
    }
    const w = jabWind(c);
    return this.hand === 1 ? evalJab(this.prep as PreparedJab, 0, 0, 0, w, 1, out) : evalJab(this.prep as PreparedJab, 0, w, 0, 0, 0, out);
  }

  /** Pose at path length s of the current strike path. */
  private poseAtS(s: number, out: Pose): Pose {
    if (this.prep.rig.kind === "curve") {
      const p = this.prep as PreparedCurve;
      this.path.headAtS(s, this.tv);
      return toolPose(p, this.tv, this.path.quatAtS(p, s, this.tq), out);
    }
    const param = this.path.paramAtS(s);
    const w = this.path.start * (1 - param);
    if (this.hand === 1) evalJab(this.prep as PreparedJab, 0, 0, param, w, 1, out);
    else evalJab(this.prep as PreparedJab, param, w, 0, 0, 0, out);
    // the striking fist follows the (possibly re-aimed) punch line exactly
    const f = this.hand === 1 ? out.left : out.right;
    this.path.headAtS(s, f.p);
    copy(out.head, f.p);
    return out;
  }

  /** Pose on the strike path at strike time t. */
  private strikePose(t: number, out: Pose): Pose {
    return this.poseAtS(this.path.sAt(t), out);
  }
}

/** Scale a camera-space point onto the shell [MIN_AIM_REACH, reach] around the eye. */
function clampReach(c: V3, reach: number): V3 {
  const l = len(c);
  if (!(l > 1e-6)) return set(c, 0, 0, MIN_AIM_REACH);
  const k = Math.min(Math.max(l, MIN_AIM_REACH), Math.max(reach, MIN_AIM_REACH)) / l;
  return set(c, c.x * k, c.y * k, c.z * k);
}

/** Strike duration (s) of a normal (uncharged) swing of a rig — used to fill ToolDef.strike. */
export function normalStrikeDuration(def: ToolDef, rig: Rig): number {
  const prep = prepareRig(rig);
  const path = new StrikePath();
  if (prep.rig.kind === "curve") path.buildCurve(prep as PreparedCurve, prep.rig.wound.head, (prep as PreparedCurve).qWound, def.speed);
  else path.buildJab(prep as PreparedJab, 0, jabWind(0), def.speed);
  return path.T;
}
