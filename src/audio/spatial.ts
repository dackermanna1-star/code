// Pure positional-audio math (no Web Audio types) so it can be unit tested in Node.
// World units are voxels (1 unit = 0.2 m). Listener yaw: radians around +Y, 0 = looking toward -Z.

/** Hard audibility limit in world units; nothing is heard beyond this. */
export const MAX_AUDIBLE_DISTANCE = 140;

export interface ListenerPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface SpatialResult {
  /** Euclidean distance to the listener. */
  dist: number;
  /** Linear distance gain in [0, 1]. */
  gain: number;
  /** Stereo pan in [-1, 1] (+1 = right). */
  pan: number;
  /** Lowpass cutoff (Hz) for air absorption / behind-the-head muffling. */
  cutoff: number;
  /** Extra reverb send multiplier (distant sounds are wetter). */
  wet: number;
}

const tmp: SpatialResult = { dist: 0, gain: 0, pan: 0, cutoff: 20000, wet: 1 };

/**
 * Distance gain curve: (1 - d/range)^2 with a small near-field plateau. `range` is clamped to
 * MAX_AUDIBLE_DISTANCE. Returns 0 at and beyond `range`.
 */
export function distanceGain(dist: number, range: number): number {
  const r = Math.min(Math.max(range, 1), MAX_AUDIBLE_DISTANCE);
  if (!(dist < r)) return 0; // also catches NaN
  const near = 2;
  const d = Math.max(0, dist - near);
  const t = 1 - d / (r - near);
  return t <= 0 ? 0 : t * t;
}

/**
 * Compute gain / pan / filtering for a source at (x, y, z) heard by `l`. The returned object is
 * reused between calls (copy fields if you need to keep them). Gain is 0 when out of range.
 */
export function spatialize(l: ListenerPose, x: number, y: number, z: number, range: number): SpatialResult {
  const dx = x - l.x;
  const dy = y - l.y;
  const dz = z - l.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const out = tmp;
  out.dist = dist;
  out.gain = distanceGain(dist, range);
  if (out.gain <= 0 || !Number.isFinite(dist)) {
    out.gain = 0;
    out.pan = 0;
    out.cutoff = 20000;
    out.wet = 1;
    return out;
  }
  // Right vector for yaw (pitch does not change "right" in a YXZ camera), forward on the XZ plane.
  const s = Math.sin(l.yaw);
  const c = Math.cos(l.yaw);
  const rightDot = dx * c - dz * s; // right = (cos, 0, -sin)
  const fwdDot = -dx * s - dz * c; // forward = (-sin, 0, -cos)
  const horiz = Math.sqrt(dx * dx + dz * dz);
  let pan = horiz > 1e-6 ? rightDot / horiz : 0;
  // Shrink the pan for very close sources and for sources mostly above/below.
  const closeness = Math.min(1, dist / 4);
  const flat = dist > 1e-6 ? horiz / dist : 0;
  pan *= closeness * (0.35 + 0.65 * flat) * 0.85;
  out.pan = pan < -1 ? -1 : pan > 1 ? 1 : pan;
  const frac = Math.min(1, dist / Math.min(Math.max(range, 1), MAX_AUDIBLE_DISTANCE));
  // Air absorption: bright when close, dull far away.
  let cutoff = 18000 * Math.pow(1 - frac, 2.2) + 700;
  // Behind the head: gentle extra muffling (front/back cue).
  if (horiz > 1e-6) {
    const behind = Math.max(0, -fwdDot / horiz); // 0 in front, 1 directly behind
    cutoff *= 1 - 0.45 * behind * closeness;
  }
  out.cutoff = Math.max(300, Math.min(20000, cutoff));
  out.wet = 0.6 + 1.2 * frac;
  return out;
}
