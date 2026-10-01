// Where the spray lands: the view ray against the facade planes, the ground
// heightfield and the oriented boxes of solid props (dumpsters, carts, meters,
// fences, pole bases...). Analytic and cheap enough to run every frame.
import * as THREE from 'three';
import { FACADES } from '../world/layout.js';

const AXIS = { '+x': [0, 1], '-x': [0, -1], '+z': [2, 1], '-z': [2, -1] };

export class SprayRaycaster {
  constructor(world) {
    this.world = world;
    this.facades = FACADES.map((f) => {
      const [ai, sign] = AXIS[f.face];
      const along = ai === 0 ? 2 : 0; // the other horizontal axis
      // u runs from `start`: +x faces count down z, -x up z, +z up x, -z down x
      const dirU = f.face === '+x' || f.face === '-z' ? -1 : 1;
      const a0 = f.start, a1 = f.start + dirU * f.width;
      const base = f.base ?? 0;
      return { f, ai, sign, along, lo: Math.min(a0, a1), hi: Math.max(a0, a1), y0: base, y1: base + f.height };
    });
    this.targets = world.props?.sprayTargets ?? [];
    this._o = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._n = new THREE.Vector3();
  }

  /**
   * Nearest hit along the ray within maxDist, or null.
   * Returns { point, normal, dist, kind } (reused objects: copy what you keep).
   */
  cast(origin, dir, maxDist, out = { point: new THREE.Vector3(), normal: new THREE.Vector3(), dist: 0, kind: '' }) {
    let best = maxDist;
    let kind = null;
    const o = [origin.x, origin.y, origin.z], d = [dir.x, dir.y, dir.z];
    // facades: axis-aligned rectangles, hit from the front only
    for (const F of this.facades) {
      const dn = d[F.ai] * F.sign;
      if (dn >= -1e-4) continue;
      const t = (F.f.plane - o[F.ai]) / d[F.ai];
      if (t <= 0 || t >= best) continue;
      const a = o[F.along] + d[F.along] * t, y = o[1] + d[1] * t;
      if (a < F.lo || a > F.hi || y < F.y0 || y > F.y1) continue;
      best = t;
      kind = 'facade';
      out.normal.set(0, 0, 0).setComponent(F.ai, F.sign);
    }
    // ground: y = 0 plane refined against the heightfield
    if (dir.y < -1e-3) {
      let t = -origin.y / dir.y;
      for (let i = 0; i < 2; i++) {
        const x = origin.x + dir.x * t, z = origin.z + dir.z * t;
        const h = this.world.groundHeight ? this.world.groundHeight(x, z) : 0;
        t = (h - origin.y) / dir.y;
      }
      if (t > 0 && t < best) {
        best = t;
        kind = 'ground';
        out.normal.set(0, 1, 0);
      }
    }
    // props: ray in box space
    const lo = this._o, ld = this._d;
    for (const T of this.targets) {
      lo.copy(origin).applyMatrix4(T.inv);
      ld.copy(dir).transformDirection(T.inv);
      const b = T.box;
      let t0 = 0, t1 = best, axis = -1, sgn = 0;
      let miss = false;
      for (let k = 0; k < 3; k++) {
        const oo = lo.getComponent(k), dd = ld.getComponent(k);
        const mn = b.min.getComponent(k), mx = b.max.getComponent(k);
        if (Math.abs(dd) < 1e-8) {
          if (oo < mn || oo > mx) {
            miss = true;
            break;
          }
          continue;
        }
        let ta = (mn - oo) / dd, tb = (mx - oo) / dd;
        let s = -1;
        if (ta > tb) {
          [ta, tb] = [tb, ta];
          s = 1;
        }
        if (ta > t0) {
          t0 = ta;
          axis = k;
          sgn = s;
        }
        if (tb < t1) t1 = tb;
        if (t0 > t1) {
          miss = true;
          break;
        }
      }
      if (miss || axis < 0 || t0 <= 0 || t0 >= best) continue;
      best = t0;
      kind = 'prop';
      this._n.set(0, 0, 0).setComponent(axis, sgn).transformDirection(T.m);
      out.normal.copy(this._n);
    }
    if (!kind) return null;
    out.point.copy(origin).addScaledVector(dir, best);
    out.dist = best;
    out.kind = kind;
    return out;
  }
}
