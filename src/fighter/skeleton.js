// Stick-figure skeleton: joint layout, pose channels, forward kinematics,
// two-bone IK and the inverse mapping (joint positions -> pose angles).
//
// Angle convention ("facing frame"): an angle is measured from straight UP and
// grows towards the facing direction, so 0 = up, 90° = forward, 180° = down,
// 270° = back. vec(a) = (f·sin a, −cos a) in screen space (y down).

import { wrapAngle } from '../core/math.js';

export const HEAD = 0;
export const NECK = 1;
export const PELVIS = 2;
export const ELB_A = 3;
export const HAND_A = 4;
export const ELB_B = 5;
export const HAND_B = 6;
export const KNEE_A = 7;
export const FOOT_A = 8;
export const KNEE_B = 9;
export const FOOT_B = 10;
export const NJ = 11;

// Pose channels. Arms and legs are relative to the body frame (ROT), the head
// is relative to the torso. Shoulder/hip flexion raises the limb forward,
// elbow flexion folds the forearm forward/up, knee flexion folds the shin back.
export const ROT = 0;
export const TORSO = 1;
export const HEADA = 2;
export const SA = 3;
export const EA = 4;
export const SB = 5;
export const EB = 6;
export const HA = 7;
export const KA = 8;
export const HB = 9;
export const KB = 10;
export const PX = 11; // pelvis forward offset (unscaled units)
export const PY = 12; // pelvis height above ground (unscaled units)
export const NP = 13;

export const ANGLE_CHANNELS = 11;

export function makeDims(s) {
  return {
    s,
    headR: 11.5 * s,
    neck: 13.5 * s,
    torso: 30 * s,
    upper: 17 * s,
    fore: 16.5 * s,
    thigh: 22.5 * s,
    shin: 22.5 * s,
    leg: 45 * s,
    lw: 7.2 * s,
    footR: 3.2 * s,
  };
}

const PI = Math.PI;

// Forward kinematics. (px, py) is the pelvis in world space. out: 22 floats.
export function fk(pose, f, px, py, d, out) {
  const rot = pose[ROT];
  const ta = rot + pose[TORSO];
  const nx = px + f * Math.sin(ta) * d.torso;
  const ny = py - Math.cos(ta) * d.torso;
  out[PELVIS * 2] = px;
  out[PELVIS * 2 + 1] = py;
  out[NECK * 2] = nx;
  out[NECK * 2 + 1] = ny;
  const ha = ta + pose[HEADA];
  out[HEAD * 2] = nx + f * Math.sin(ha) * d.neck;
  out[HEAD * 2 + 1] = ny - Math.cos(ha) * d.neck;

  let ua = rot + PI - pose[SA];
  let ex = nx + f * Math.sin(ua) * d.upper;
  let ey = ny - Math.cos(ua) * d.upper;
  out[ELB_A * 2] = ex;
  out[ELB_A * 2 + 1] = ey;
  let fa = ua - pose[EA];
  out[HAND_A * 2] = ex + f * Math.sin(fa) * d.fore;
  out[HAND_A * 2 + 1] = ey - Math.cos(fa) * d.fore;

  ua = rot + PI - pose[SB];
  ex = nx + f * Math.sin(ua) * d.upper;
  ey = ny - Math.cos(ua) * d.upper;
  out[ELB_B * 2] = ex;
  out[ELB_B * 2 + 1] = ey;
  fa = ua - pose[EB];
  out[HAND_B * 2] = ex + f * Math.sin(fa) * d.fore;
  out[HAND_B * 2 + 1] = ey - Math.cos(fa) * d.fore;

  let tha = rot + PI - pose[HA];
  let kx = px + f * Math.sin(tha) * d.thigh;
  let ky = py - Math.cos(tha) * d.thigh;
  out[KNEE_A * 2] = kx;
  out[KNEE_A * 2 + 1] = ky;
  let sa = tha + pose[KA];
  out[FOOT_A * 2] = kx + f * Math.sin(sa) * d.shin;
  out[FOOT_A * 2 + 1] = ky - Math.cos(sa) * d.shin;

  tha = rot + PI - pose[HB];
  kx = px + f * Math.sin(tha) * d.thigh;
  ky = py - Math.cos(tha) * d.thigh;
  out[KNEE_B * 2] = kx;
  out[KNEE_B * 2 + 1] = ky;
  sa = tha + pose[KB];
  out[FOOT_B * 2] = kx + f * Math.sin(sa) * d.shin;
  out[FOOT_B * 2 + 1] = ky - Math.cos(sa) * d.shin;
  return out;
}

// Lowest point of a leg chain for a given pose, relative to the pelvis
// (positive = below pelvis). Used to keep grounded poses on the floor.
export function footDrop(pose, d) {
  const rot = pose[ROT];
  let best = -1e9;
  for (let leg = 0; leg < 2; leg++) {
    const h = leg === 0 ? pose[HA] : pose[HB];
    const k = leg === 0 ? pose[KA] : pose[KB];
    const tha = rot + PI - h;
    const ky = -Math.cos(tha) * d.thigh;
    const fy = ky - Math.cos(tha + k) * d.shin;
    if (fy > best) best = fy;
  }
  return best;
}

export function angOf(dx, dy, f) {
  return Math.atan2(f * dx, -dy);
}

// Inverse of fk: derives pose angles from joint positions (x,y pairs).
export function poseFromJoints(j, f, rootX, groundY, d, out) {
  const px = j[PELVIS * 2];
  const py = j[PELVIS * 2 + 1];
  const nx = j[NECK * 2];
  const ny = j[NECK * 2 + 1];
  const ta = angOf(nx - px, ny - py, f);
  out[ROT] = ta;
  out[TORSO] = 0;
  out[HEADA] = wrapAngle(angOf(j[HEAD * 2] - nx, j[HEAD * 2 + 1] - ny, f) - ta);
  let ua = angOf(j[ELB_A * 2] - nx, j[ELB_A * 2 + 1] - ny, f);
  out[SA] = wrapAngle(ta + PI - ua);
  out[EA] = wrapAngle(ua - angOf(j[HAND_A * 2] - j[ELB_A * 2], j[HAND_A * 2 + 1] - j[ELB_A * 2 + 1], f));
  ua = angOf(j[ELB_B * 2] - nx, j[ELB_B * 2 + 1] - ny, f);
  out[SB] = wrapAngle(ta + PI - ua);
  out[EB] = wrapAngle(ua - angOf(j[HAND_B * 2] - j[ELB_B * 2], j[HAND_B * 2 + 1] - j[ELB_B * 2 + 1], f));
  let tha = angOf(j[KNEE_A * 2] - px, j[KNEE_A * 2 + 1] - py, f);
  out[HA] = wrapAngle(ta + PI - tha);
  out[KA] = wrapAngle(angOf(j[FOOT_A * 2] - j[KNEE_A * 2], j[FOOT_A * 2 + 1] - j[KNEE_A * 2 + 1], f) - tha);
  tha = angOf(j[KNEE_B * 2] - px, j[KNEE_B * 2 + 1] - py, f);
  out[HB] = wrapAngle(ta + PI - tha);
  out[KB] = wrapAngle(angOf(j[FOOT_B * 2] - j[KNEE_B * 2], j[FOOT_B * 2 + 1] - j[KNEE_B * 2 + 1], f) - tha);
  out[PX] = ((px - rootX) * f) / d.s;
  out[PY] = (groundY - py) / d.s;
  return out;
}

const _ik = { jx: 0, jy: 0, ex: 0, ey: 0 };

// Two-bone IK from (hx,hy) towards (tx,ty). bend = +1 for knees (shin folds
// back), −1 for elbows (forearm folds forward). Returns a shared object.
export function ik2(hx, hy, tx, ty, l1, l2, f, bend) {
  let dx = tx - hx;
  let dy = ty - hy;
  let dd = Math.sqrt(dx * dx + dy * dy);
  if (dd < 1e-6) {
    dx = 0;
    dy = 1;
    dd = 1e-6;
  }
  const ux = dx / dd;
  const uy = dy / dd;
  const maxR = (l1 + l2) * 0.999;
  const minR = Math.abs(l1 - l2) + 0.01;
  const dc = dd > maxR ? maxR : dd < minR ? minR : dd;
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const bx = hx + ux * a;
  const by = hy + uy * a;
  const ex = hx + ux * dc;
  const ey = hy + uy * dc;
  // candidate joint on the +perp side
  let jx = bx - uy * h;
  let jy = by + ux * h;
  // cross((J-H),(E-J)) sign must match f*bend for the desired fold direction
  const cr = (jx - hx) * (ey - jy) - (jy - hy) * (ex - jx);
  if ((cr >= 0 ? 1 : -1) !== (f * bend >= 0 ? 1 : -1)) {
    jx = bx + uy * h;
    jy = by - ux * h;
  }
  _ik.jx = jx;
  _ik.jy = jy;
  _ik.ex = ex;
  _ik.ey = ey;
  return _ik;
}

// Pose helpers -------------------------------------------------------------
const KEYS = { rot: ROT, torso: TORSO, head: HEADA, sA: SA, eA: EA, sB: SB, eB: EB, hA: HA, kA: KA, hB: HB, kB: KB, px: PX, py: PY };
const DEG = PI / 180;

// Builds a pose from degrees (angles) and units (px, py), optionally on a base.
export function P(o, base) {
  const p = base ? Float64Array.from(base) : new Float64Array(NP);
  for (const k in o) {
    const i = KEYS[k];
    if (i === undefined) throw new Error('bad pose key ' + k);
    p[i] = i < ANGLE_CHANNELS ? o[k] * DEG : o[k];
  }
  return p;
}

export function copyPose(dst, src) {
  for (let i = 0; i < NP; i++) dst[i] = src[i];
  return dst;
}

export function lerpPose(dst, a, b, t) {
  for (let i = 0; i < NP; i++) dst[i] = a[i] + (b[i] - a[i]) * t;
  return dst;
}
