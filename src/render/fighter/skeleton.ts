/**
 * Stick-figure skeleton: pose representation and forward kinematics.
 *
 * Angles are in DEGREES in authored poses. Local frame: +x = the direction the fighter faces,
 * y down. "Arm 1" holds the main weapon (lead arm), "arm 2" is the rear arm.
 *
 * Angle conventions (dirFromAngle(a) = (sin a, cos a)):
 *   0° = pointing straight down, 90° = pointing forward, 180° = straight up, -90° = backward.
 *   torso: lean from vertical (positive = lean forward).
 *   head: extra tilt of the head relative to the spine (positive = forward/down).
 *   ua*: upper arm relative to torso-down (so the arms follow the torso lean).
 *   la*: forearm bend relative to the upper arm (positive = curls forward/up).
 *   th*: thigh relative to straight down (positive = forward).
 *   sh*: shin bend relative to the thigh (negative = natural knee bend).
 *   wpn / wpn2: weapon angle relative to the forearm (0 = continuing the forearm, 90 = perpendicular "up").
 *   dx, dy: root (hip) offset — positive dy crouches.
 *   spin: whole-body rotation around the hips (positive = forward flip).
 */
export interface Pose {
  torso: number;
  head: number;
  ua1: number;
  la1: number;
  ua2: number;
  la2: number;
  th1: number;
  sh1: number;
  th2: number;
  sh2: number;
  wpn: number;
  wpn2: number;
  dx: number;
  dy: number;
  spin: number;
}

export const POSE_KEYS: readonly (keyof Pose)[] = ['torso', 'head', 'ua1', 'la1', 'ua2', 'la2', 'th1', 'sh1', 'th2', 'sh2', 'wpn', 'wpn2', 'dx', 'dy', 'spin'];

export const NEUTRAL: Pose = {
  torso: 0, head: 0, ua1: 20, la1: 25, ua2: -15, la2: 20, th1: 8, sh1: -6, th2: -8, sh2: -4, wpn: 90, wpn2: 90, dx: 0, dy: 0, spin: 0,
};

export function makePose(p: Partial<Pose>, base: Pose = NEUTRAL): Pose {
  return { ...base, ...p };
}

export function copyPose(src: Pose, dst: Pose): Pose {
  for (const k of POSE_KEYS) dst[k] = src[k];
  return dst;
}

/** Interpolate poses (angles interpolate linearly; authored angles avoid wrap issues). */
export function lerpPose(a: Pose, b: Pose, t: number, out: Pose): Pose {
  for (const k of POSE_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

/** Bone lengths in world units. Standing height ≈ 120. */
export const BONES = {
  thigh: 28,
  shin: 29,
  spine: 36,
  neck: 7,
  headR: 10,
  upperArm: 23,
  foreArm: 23,
  shoulderDrop: 5,
};

export interface Joints {
  hip: [number, number];
  neck: [number, number];
  head: [number, number];
  shoulder: [number, number];
  elbow1: [number, number];
  hand1: [number, number];
  elbow2: [number, number];
  hand2: [number, number];
  knee1: [number, number];
  foot1: [number, number];
  knee2: [number, number];
  foot2: [number, number];
  /** Absolute weapon angles in radians, world space. */
  wpnAngle: number;
  wpn2Angle: number;
  /** Absolute forearm angles (for fist drawing). */
  fore1Angle: number;
  fore2Angle: number;
  /** Spine direction (unit, world) for head orientation. */
  spineDirX: number;
  spineDirY: number;
}

export function emptyJoints(): Joints {
  const z = (): [number, number] => [0, 0];
  return {
    hip: z(), neck: z(), head: z(), shoulder: z(), elbow1: z(), hand1: z(), elbow2: z(), hand2: z(),
    knee1: z(), foot1: z(), knee2: z(), foot2: z(), wpnAngle: 0, wpn2Angle: 0, fore1Angle: 0, fore2Angle: 0, spineDirX: 0, spineDirY: -1,
  };
}

const D2R = Math.PI / 180;

/**
 * Forward kinematics. (x, y) = feet/root position in world. facing = ±1.
 * Writes world joint positions into `out`.
 */
export function solve(p: Pose, x: number, y: number, facing: number, out: Joints, scale = 1): Joints {
  const f = facing;
  const B = BONES;
  const s = scale;
  // Hip height above the feet when legs are straight, minus crouch.
  const hipH = (B.thigh + B.shin) * s;
  const hx = 0 + p.dx * s;
  const hy = -hipH + p.dy * s;
  const spin = p.spin * D2R;
  const cs = Math.cos(spin), sn = Math.sin(spin);
  // Local point -> world (rotate around hip by spin, mirror by facing).
  const W = (lx: number, ly: number, o: [number, number]) => {
    const rx = lx - hx, ry = ly - hy;
    // positive spin = forward flip: rotate so "up" tilts toward +x.
    const qx = rx * cs - ry * sn;
    const qy = rx * sn + ry * cs;
    o[0] = x + f * (hx + qx);
    o[1] = y + hy + qy;
  };
  const dir = (deg: number): [number, number] => [Math.sin(deg * D2R), Math.cos(deg * D2R)];

  // Spine: from hip toward the neck.
  const torsoA = 180 - p.torso;
  const sd = dir(torsoA);
  const nx = hx + sd[0] * B.spine * s, ny = hy + sd[1] * B.spine * s;
  // Head.
  const hd = dir(torsoA - p.head);
  const headX = nx + hd[0] * (B.neck + B.headR) * s, headY = ny + hd[1] * (B.neck + B.headR) * s;
  // Shoulders sit slightly below the neck along the spine.
  const shX = nx - sd[0] * B.shoulderDrop * s, shY = ny - sd[1] * B.shoulderDrop * s;
  // Arms (relative to torso lean).
  const ua1 = p.ua1 + p.torso, ua2 = p.ua2 + p.torso;
  const u1 = dir(ua1), u2 = dir(ua2);
  const e1x = shX + u1[0] * B.upperArm * s, e1y = shY + u1[1] * B.upperArm * s;
  const e2x = shX + u2[0] * B.upperArm * s, e2y = shY + u2[1] * B.upperArm * s;
  const fa1 = ua1 + p.la1, fa2 = ua2 + p.la2;
  const f1 = dir(fa1), f2 = dir(fa2);
  const h1x = e1x + f1[0] * B.foreArm * s, h1y = e1y + f1[1] * B.foreArm * s;
  const h2x = e2x + f2[0] * B.foreArm * s, h2y = e2y + f2[1] * B.foreArm * s;
  // Legs.
  const t1 = dir(p.th1), t2 = dir(p.th2);
  const k1x = hx + t1[0] * B.thigh * s, k1y = hy + t1[1] * B.thigh * s;
  const k2x = hx + t2[0] * B.thigh * s, k2y = hy + t2[1] * B.thigh * s;
  const s1 = dir(p.th1 + p.sh1), s2 = dir(p.th2 + p.sh2);
  const ft1x = k1x + s1[0] * B.shin * s, ft1y = k1y + s1[1] * B.shin * s;
  const ft2x = k2x + s2[0] * B.shin * s, ft2y = k2y + s2[1] * B.shin * s;

  W(hx, hy, out.hip);
  W(nx, ny, out.neck);
  W(headX, headY, out.head);
  W(shX, shY, out.shoulder);
  W(e1x, e1y, out.elbow1);
  W(h1x, h1y, out.hand1);
  W(e2x, e2y, out.elbow2);
  W(h2x, h2y, out.hand2);
  W(k1x, k1y, out.knee1);
  W(ft1x, ft1y, out.foot1);
  W(k2x, k2y, out.knee2);
  W(ft2x, ft2y, out.foot2);

  // Absolute angles in world radians (direction vectors -> atan2 in world, after spin & mirroring).
  const worldAngle = (deg: number) => {
    const d = dir(deg);
    const qx = d[0] * cs - d[1] * sn;
    const qy = d[0] * sn + d[1] * cs;
    return Math.atan2(qy, f * qx);
  };
  out.wpnAngle = worldAngle(fa1 + p.wpn);
  out.wpn2Angle = worldAngle(fa2 + p.wpn2);
  out.fore1Angle = worldAngle(fa1);
  out.fore2Angle = worldAngle(fa2);
  const sdx = sd[0] * cs - sd[1] * sn, sdy = sd[0] * sn + sd[1] * cs;
  out.spineDirX = f * sdx;
  out.spineDirY = sdy;
  return out;
}

/** 2-bone IK for the rear arm to grip a point (world). Returns false if unreachable. */
export function ikArm(shoulder: [number, number], target: [number, number], bend: number, outElbow: [number, number], outHand: [number, number], scale = 1): boolean {
  const a = BONES.upperArm * scale, b = BONES.foreArm * scale;
  const dx = target[0] - shoulder[0], dy = target[1] - shoulder[1];
  let d = Math.hypot(dx, dy);
  if (d > a + b - 0.5) return false;
  d = Math.max(d, Math.abs(a - b) + 0.5);
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const ang = Math.atan2(dy, dx) + bend * Math.acos(Math.max(-1, Math.min(1, cosA)));
  outElbow[0] = shoulder[0] + Math.cos(ang) * a;
  outElbow[1] = shoulder[1] + Math.sin(ang) * a;
  outHand[0] = target[0];
  outHand[1] = target[1];
  return true;
}
