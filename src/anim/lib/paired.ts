import { Clip, ClipSpec, defineClip } from '../clip';

export interface PairedClip {
  name: string;
  a: Clip; // attacker (player)
  b: Clip; // victim
  dist: number; // authored distance between roots at start
  camera?: { side: number; height: number; dist: number; fov: number; orbit: number };
}
export const PAIRS = new Map<string, PairedClip>();

/** Define a paired animation; victim clip space is the same as attacker's (victim starts at (0, dist) facing -Z). */
export function definePaired(name: string, a: ClipSpec, b: ClipSpec, dist: number, camera?: PairedClip['camera']): PairedClip {
  const ca = defineClip(name + '_a', a);
  const cb = defineClip(name + '_b', b);
  const p: PairedClip = { name, a: ca, b: cb, dist, camera };
  PAIRS.set(name, p);
  return p;
}
