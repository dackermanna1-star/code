/**
 * Gravity in a body-centred, non-rotating frame (restricted n-body):
 *   a = Σᵢ gᵢ(ship) − Σ_{j≠ref} gⱼ(ref)
 * i.e. the field of every body at the ship minus the acceleration of the
 * reference body itself (the frame is accelerating). Bodies follow Kepler
 * rails, so this is exact for test particles and cheap.
 */
import { Vector3 } from 'three';
import type { Body, StarSystem } from '../astro/body';

const _d = new Vector3();
const _p = new Vector3();

/**
 * Acceleration of a test particle at `rel` (system-frame metres relative to
 * `ref`) in ref's non-rotating frame. Returns system-frame axes.
 */
export function gravityAccel(sys: StarSystem, ref: Body, rel: Vector3, out = new Vector3()): Vector3 {
  out.set(0, 0, 0);
  _p.copy(ref.posSys).add(rel); // particle in system frame
  for (const b of sys.bodies) {
    if (b.mass <= 0 || b.kind === 'barycenter' || b.kind === 'station') continue;
    _d.copy(b.posSys).sub(_p);
    const r2 = _d.lengthSq();
    const minR = Math.max(b.radius * 0.5, 1);
    if (r2 < minR * minR) continue;
    const r = Math.sqrt(r2);
    out.addScaledVector(_d, b.mu / (r2 * r));
    if (b !== ref) {
      // subtract the reference body's own acceleration due to b
      _d.copy(b.posSys).sub(ref.posSys);
      const q2 = _d.lengthSq();
      if (q2 > 1) {
        const q = Math.sqrt(q2);
        out.addScaledVector(_d, -b.mu / (q2 * q));
      }
    }
  }
  return out;
}

/** The body whose sphere of influence contains a system-frame point (innermost). */
export function dominantBody(sys: StarSystem, posSys: Vector3): Body {
  let best: Body = sys.root;
  let bestSoi = Infinity;
  for (const b of sys.bodies) {
    if ((b.kind === 'barycenter' && b !== sys.root) || b.kind === 'station') continue;
    const d = _d.copy(posSys).sub(b.posSys).length();
    const soi = b.parent ? b.soi : Infinity;
    if (d < soi && soi < bestSoi) {
      best = b;
      bestSoi = soi;
    }
  }
  // stars inside a barycentric system: prefer the nearest star within its Roche-ish region
  return best;
}

/** Surface gravity magnitude at distance r from a body's centre. */
export function surfaceG(b: Body, r: number): number {
  return b.mu / (r * r);
}
