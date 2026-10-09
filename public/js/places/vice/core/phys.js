// Collision for Vice City: The Outbreak's Phys (yaw-rotated boxes in a grid,
// a height map for the ground, cylinder movement and rays) plus road decks -
// the causeways, bridges and the elevated expressway - which you can stand
// and drive on, and walk or drive underneath.
//
//   V.phys = new VPhys(ground, plan)
//   phys.add(x, y, z, hx, hy, hz, yaw, mat, extra) -> box      (see outbreak/physics.js)
//   phys.groundAt(x, y, z, r, step)    highest of: ground, box tops, decks (<= y + step)
//   phys.deckAt(x, z, yMax)            highest deck surface at (x, z) not above yMax, or -Infinity
//   phys.moveBody(p, v, dt, o)         cylinder movement (uses groundAt, so decks work)
//   phys.ray(ox, oy, oz, dx, dy, dz, max, o) -> hit | null  (boxes, ground and decks; hit.kind 'deck')
//
// Box yaw is three.js rotation.y. Decks are segments of road: centre line a->b
// at heights ya -> yb, half width hw, 1.6 studs thick.
import { Phys } from '../../outbreak/physics.js';

const DCELL = 64;

export class VPhys extends Phys {
  constructor(ground, plan) {
    super(ground);
    this.decks = [];
    this.dgrid = new Map();
    if (plan) for (const e of plan.edges) {
      // only what isn't plain street on dry land: bridges, decks, the expressway
      if (!e.bridge && !e.elevated) continue;
      const hw = e.width / 2 + (e.walk || 0);
      for (let i = 0; i < e.pts.length - 1; i++) this.addDeck(e.pts[i], e.pts[i + 1], hw, e);
    }
  }

  /** A drivable slab from a {x, y, z} to b {x, y, z}, half width hw. */
  addDeck(a, b, hw, edge = null) {
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    if (L < 0.01) return null;
    const d = { ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, ux: dx / L, uz: dz / L, L, hw, edge, stamp: 0 };
    this.decks.push(d);
    const x0 = Math.min(a.x, b.x) - hw, x1 = Math.max(a.x, b.x) + hw, z0 = Math.min(a.z, b.z) - hw, z1 = Math.max(a.z, b.z) + hw;
    for (let i = Math.floor(x0 / DCELL); i <= Math.floor(x1 / DCELL); i++) for (let j = Math.floor(z0 / DCELL); j <= Math.floor(z1 / DCELL); j++) {
      const k = i * 4096 + j;
      let c = this.dgrid.get(k);
      if (!c) this.dgrid.set(k, (c = []));
      c.push(d);
    }
    return d;
  }

  _deckY(d, x, z) {
    const rx = x - d.ax, rz = z - d.az;
    const t = rx * d.ux + rz * d.uz;
    if (t < -0.5 || t > d.L + 0.5) return null;
    const s = -rx * d.uz + rz * d.ux;
    if (Math.abs(s) > d.hw) return null;
    const f = Math.min(1, Math.max(0, t / d.L));
    return d.ay + (d.by - d.ay) * f;
  }

  /** The highest deck surface at (x, z) that is not above yMax. */
  deckAt(x, z, yMax = Infinity) {
    const c = this.dgrid.get(Math.floor(x / DCELL) * 4096 + Math.floor(z / DCELL));
    let best = -Infinity;
    if (!c) return best;
    for (const d of c) {
      const y = this._deckY(d, x, z);
      if (y != null && y <= yMax && y > best) best = y;
    }
    return best;
  }

  groundAt(x, y, z, r = 0.6, step = 1.6) {
    const g = super.groundAt(x, y, z, r, step);
    const d = this.deckAt(x, z, y + step);
    if (d > g) { this._groundBox = null; this._groundDeck = true; return d; }
    this._groundDeck = false;
    return g;
  }

  /** Rays also stop on decks (from above or below). */
  ray(ox, oy, oz, dx, dy, dz, max, o = {}) {
    const hit = super.ray(ox, oy, oz, dx, dy, dz, max, o);
    if (o.decks === false || !this.decks.length) return hit;
    let best = hit ? hit.d : max, bh = null;
    // walk the deck cells along the ray's footprint
    const ex = ox + dx * best, ez = oz + dz * best;
    const i0 = Math.floor(Math.min(ox, ex) / DCELL), i1 = Math.floor(Math.max(ox, ex) / DCELL);
    const j0 = Math.floor(Math.min(oz, ez) / DCELL), j1 = Math.floor(Math.max(oz, ez) / DCELL);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 400) return hit; // very long rays: decks are ignored
    const stamp = (this._dstamp = (this._dstamp || 0) + 1);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const c = this.dgrid.get(i * 4096 + j);
      if (!c) continue;
      for (const d of c) {
        if (d.stamp === stamp) continue;
        d.stamp = stamp;
        // the deck's top plane: normal from its slope
        const sl = (d.by - d.ay) / d.L;
        // plane through a: y - ay = sl * ((p - a) . u)  ->  n = (-sl*ux, 1, -sl*uz)
        for (const off of [0, -1.6]) {
          const nx = -sl * d.ux, nz = -sl * d.uz;
          const den = nx * dx + dy + nz * dz;
          if (Math.abs(den) < 1e-6) continue;
          const t = (nx * (d.ax - ox) + (d.ay + off - oy) + nz * (d.az - oz)) / den;
          if (t < 0 || t >= best) continue;
          const px = ox + dx * t, pz = oz + dz * t;
          if (this._deckY(d, px, pz) == null) continue;
          best = t;
          const l = Math.hypot(nx, 1, nz), sgn = den < 0 ? 1 : -1;
          bh = { d: t, x: px, y: oy + dy * t, z: pz, nx: (nx / l) * sgn, ny: (1 / l) * sgn, nz: (nz / l) * sgn, box: null, kind: 'deck', mat: 'concrete', deck: d };
        }
      }
    }
    return bh || hit;
  }
}
