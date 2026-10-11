// Small authoring DSL for brush-based maps (think Hammer, in code).
// Coordinates: GoldSrc units, x east, y north, z up.

import { boxBrush, prismBrush, Brush, plane } from './brush.js';
import { CONTENTS_SOLID, CONTENTS_PLAYERCLIP } from '../engine/collision.js';

export class MapDSL {
  constructor() {
    this.brushes = [];
    this.entities = [];
    this.lights = [];
    this.group = '';
  }

  add(b) { if (this.group && !b.name) b.name = this.group; this.brushes.push(b); return b; }

  // Axis-aligned box from any two corners.
  box(x0, y0, z0, x1, y1, z1, tex, opts = {}) {
    const min = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)];
    const max = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
    if (max[0] - min[0] < 0.01 || max[1] - min[1] < 0.01 || max[2] - min[2] < 0.01) return null;
    return this.add(boxBrush(min, max, tex, opts));
  }

  // Floor slab whose top surface is at z.
  floor(x0, y0, x1, y1, z, tex, opts = {}) {
    const depth = opts.depth ?? 32;
    const t = typeof tex === 'string' ? { top: tex, all: opts.side || 'ground_dirt' } : tex;
    return this.box(x0, y0, z - depth, x1, y1, z, t, opts);
  }

  // Solid block (walls, buildings) from z0 to z1.
  block(x0, y0, x1, y1, z0, z1, tex = 'wall_stone', opts = {}) {
    const t = typeof tex === 'string' ? { all: tex, top: opts.top || tex } : tex;
    return this.box(x0, y0, z0, x1, y1, z1, t, opts);
  }

  // Ramp rising toward `dir` ('n','s','e','w') from zLow to zHigh across the rectangle.
  ramp(x0, y0, x1, y1, zLow, zHigh, dir, tex = 'ground_stone', opts = {}) {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    const base = Math.min(zLow, zHigh) - (opts.depth ?? 32);
    const t = typeof tex === 'string' ? { top: tex, all: opts.side || 'wall_stone' } : tex;
    if (dir === 'n' || dir === 's') {
      // profile in (y, z), extrude along x
      const lowY = dir === 'n' ? ya : yb, highY = dir === 'n' ? yb : ya;
      const pts = [[lowY, base], [highY, base], [highY, zHigh], [lowY, zLow]];
      return this.add(prismBrush('x', pts, xa, xb, t, opts));
    }
    const lowX = dir === 'e' ? xa : xb, highX = dir === 'e' ? xb : xa;
    const pts = [[lowX, base], [highX, base], [highX, zHigh], [lowX, zLow]];
    return this.add(prismBrush('y', pts, ya, yb, t, opts));
  }

  // Straight staircase rising toward dir.
  stairs(x0, y0, x1, y1, zLow, zHigh, dir, steps, tex = 'ground_stone', opts = {}) {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    const base = zLow - (opts.depth ?? 16);
    const t = typeof tex === 'string' ? { top: tex, all: opts.side || tex } : tex;
    for (let i = 0; i < steps; i++) {
      const z = zLow + (zHigh - zLow) * (i + 1) / steps;
      const f0 = i / steps, f1 = 1;
      let bx0 = xa, bx1 = xb, by0 = ya, by1 = yb;
      if (dir === 'n') { by0 = ya + (yb - ya) * f0; by1 = ya + (yb - ya) * f1; }
      if (dir === 's') { by1 = yb - (yb - ya) * f0; by0 = yb - (yb - ya) * f1; }
      if (dir === 'e') { bx0 = xa + (xb - xa) * f0; bx1 = xa + (xb - xa) * f1; }
      if (dir === 'w') { bx1 = xb - (xb - xa) * f0; bx0 = xb - (xb - xa) * f1; }
      this.box(bx0, by0, i === 0 ? base : zLow + (zHigh - zLow) * i / steps - 1, bx1, by1, z, t, opts);
    }
  }

  // Wooden crate (fit-textured), bottom at z.
  crate(x, y, z, sx, sy = sx, sz = sx, tex = 'crate', opts = {}) {
    const t = { name: tex, fit: true };
    return this.box(x - sx / 2, y - sy / 2, z, x + sx / 2, y + sy / 2, z + sz, { all: t }, { surface: 'wood', ...opts });
  }

  // Invisible player clip.
  clip(x0, y0, z0, x1, y1, z1) {
    return this.box(x0, y0, z0, x1, y1, z1, { all: null }, { contents: CONTENTS_PLAYERCLIP, visible: false, castShadow: false });
  }

  // Wall slab along X or Y with an arched opening.
  // axis: 'x' = wall runs along x (normal ±y), thickness spans y0..y1.
  // opening: centre c (along the wall), width w, spring height zs (where the arc starts), arc radius = w/2.
  archWall(axis, a0, a1, t0, t1, z0, z1, opening, tex = 'wall_stone', opts = {}) {
    const { c, w, zs } = opening;
    const r = w / 2;
    const segs = opening.segs || 8;
    const oa = c - r, ob = c + r;
    const T = (lo, hi, za, zb) => axis === 'x'
      ? this.box(lo, t0, za, hi, t1, zb, tex, opts)
      : this.box(t0, lo, za, t1, hi, zb, tex, opts);
    // left and right of opening
    T(a0, oa, z0, z1);
    T(ob, a1, z0, z1);
    const top = Math.min(z1, zs + r);
    if (z1 > zs + r) T(oa, ob, zs + r, z1);
    // arch fill: one prism per segment between arc and the top (zs + r)
    for (let i = 0; i < segs; i++) {
      const th0 = Math.PI * i / segs, th1 = Math.PI * (i + 1) / segs;
      const pa = [c - Math.cos(th0) * r, zs + Math.sin(th0) * r];
      const pb = [c - Math.cos(th1) * r, zs + Math.sin(th1) * r];
      if (Math.abs(pb[0] - pa[0]) < 0.5) continue;
      const pts = [pa, pb, [pb[0], top], [pa[0], top]];
      // drop degenerate points at the apex
      const uniq = pts.filter((p, k) => pts.findIndex((q) => Math.abs(q[0] - p[0]) < 0.01 && Math.abs(q[1] - p[1]) < 0.01) === k);
      if (uniq.length < 3) continue;
      if (axis === 'x') this.add(prismBrush('y', uniq, t0, t1, tex, opts));
      else this.add(prismBrush('x', uniq, t0, t1, tex, opts));
    }
  }

  // Generic convex prism passthrough.
  prism(axis, pts, lo, hi, tex, opts = {}) { return this.add(prismBrush(axis, pts, lo, hi, tex, opts)); }

  light(x, y, z, color = [1, 0.9, 0.7], intensity = 1, radius = 300) {
    this.lights.push({ pos: [x, y, z], color, intensity, radius });
  }

  entity(classname, props) { this.entities.push({ classname, ...props }); }
}

export { Brush, plane, CONTENTS_SOLID, CONTENTS_PLAYERCLIP };
