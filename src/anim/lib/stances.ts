import { Key, KeyFoot, KeyHand, V3 } from '../clip';

/** Orthodox fighting stance (left foot forward), facing +Z. */
export const FIGHT: Omit<Key, 't'> = {
  root: [0, 0, 0],
  hips: [0, -0.07, 0.0],
  hipsR: [4, -24, 0],
  spine: [3, 4, 0],
  chest: [4, 2, 0],
  neck: [-2, 6, 0],
  head: [-4, 12, 0],
  lh: { p: [0.17, 0.17, 0.33], sp: 'chest', pole: [0.3, -1, -0.15], roll: 25, aim: null, dir: null },
  rh: { p: [-0.03, 0.19, 0.25], sp: 'chest', pole: [-0.4, -1, -0.25], roll: 15, aim: null, dir: null },
  lf: { p: [0.1, 0, 0.17], yaw: -4 },
  rf: { p: [-0.13, 0, -0.17], yaw: -38 },
};

/** Relaxed standing (non-combat). */
export const RELAXED: Omit<Key, 't'> = {
  root: [0, 0, 0],
  hips: [0, -0.015, 0],
  hipsR: [0, -4, 0],
  spine: [2, 2, 0],
  chest: [1, 1, 0],
  neck: [0, 0, 0],
  head: [0, 2, 0],
  lh: { p: [0.27, -0.45, 0.02], sp: 'chest', pole: [0.3, 0, -1], roll: -10, aim: null, dir: null },
  rh: { p: [-0.27, -0.45, 0.02], sp: 'chest', pole: [-0.3, 0, -1], roll: -10, aim: null, dir: null },
  lf: { p: [0.11, 0, 0.02], yaw: 8 },
  rf: { p: [-0.11, 0, -0.02], yaw: -8 },
};

/** Thug brawler stance: wider, hands lower, more square. */
export const BRAWL: Omit<Key, 't'> = {
  root: [0, 0, 0],
  hips: [0, -0.06, 0],
  hipsR: [6, -14, 0],
  spine: [6, 2, 0],
  chest: [6, 2, 0],
  neck: [-4, 4, 0],
  head: [-6, 8, 0],
  lh: { p: [0.2, 0.16, 0.3], sp: 'chest', pole: [0.4, -1, -0.1], roll: 30, aim: null, dir: null },
  rh: { p: [-0.12, 0.18, 0.26], sp: 'chest', pole: [-0.45, -1, -0.15], roll: 25, aim: null, dir: null },
  lf: { p: [0.14, 0, 0.12], yaw: 0 },
  rf: { p: [-0.15, 0, -0.15], yaw: -28 },
};

export const k = (t: number, base: Omit<Key, 't'>, over: Partial<Key> = {}): Key => {
  const out: Key = { ...base, ...over, t } as Key;
  if (over.lh) out.lh = { ...(base.lh ?? {}), ...over.lh } as KeyHand;
  if (over.rh) out.rh = { ...(base.rh ?? {}), ...over.rh } as KeyHand;
  if (over.lf) out.lf = { ...(base.lf ?? {}), ...over.lf } as KeyFoot;
  if (over.rf) out.rf = { ...(base.rf ?? {}), ...over.rf } as KeyFoot;
  return out;
};
export const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
