// Area-based level builder. Walkable "areas" (flat rects, ramps, polygons) are
// laid down as terrain columns; everything not covered by an area becomes solid
// building mass whose height follows the walls of the neighbouring areas.
// Hand-placed detail (parapets, crates, doors, arches, ceilings) is added on top
// through the MapDSL.

import { MapDSL } from './mapdsl.js';
import { prismBrush, boxBrush } from './brush.js';

const GRID = 8;
const BASE = -640; // bottom of the world

export class AreaMap extends MapDSL {
  constructor(bounds) {
    super();
    this.bounds = bounds; // [x0, y0, x1, y1]
    this.areas = [];
    this.wallZones = []; // { rect, tex, capTex, extra, rock }
    this.solidMask = []; // extra rects forced solid (pillars)
  }

  // Flat rectangular area. opts: { tex, wall, ceil, slab, side }
  A(name, x0, y0, x1, y1, z, opts = {}) {
    const a = { name, kind: 'rect', x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z0: z, z1: z, dir: null, ...defaults(opts) };
    this.areas.push(a);
    return a;
  }

  // Ramp rising toward dir ('n','s','e','w') from zLow to zHigh.
  R(name, x0, y0, x1, y1, zLow, zHigh, dir, opts = {}) {
    const a = { name, kind: 'ramp', x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z0: zLow, z1: zHigh, dir, ...defaults(opts) };
    this.areas.push(a);
    return a;
  }

  // Staircase rising toward dir, `steps` steps.
  S(name, x0, y0, x1, y1, zLow, zHigh, dir, steps, opts = {}) {
    const a = this.R(name, x0, y0, x1, y1, zLow, zHigh, dir, opts);
    a.kind = 'stairs';
    a.steps = steps;
    return a;
  }

  // Opening through solid mass (window / door gap): cells are cleared from the
  // auto walls and replaced by a sill below zLo and a lintel above zHi.
  opening(x0, y0, x1, y1, zLo, zHi, top, tex = 'wall_stone') {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    this.areas.push({ name: 'opening', kind: 'rect', x0: xa, y0: ya, x1: xb, y1: yb, z0: zLo, z1: zLo, noFloor: true, wall: 0, tex: null });
    if (zLo > BASE) this.add(boxBrush([xa, ya, BASE], [xb, yb, zLo], { all: tex }, { name: 'sill' }));
    if (top > zHi) this.add(boxBrush([xa, ya, zHi], [xb, yb, top], { all: tex, bottom: tex }, { name: 'lintel' }));
  }

  // Convex polygon area (flat). pts: [[x,y],...]
  P(name, pts, z, opts = {}) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const a = { name, kind: 'poly', pts, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), z0: z, z1: z, dir: null, ...defaults(opts) };
    this.areas.push(a);
    return a;
  }

  zone(x0, y0, x1, y1, props) {
    this.wallZones.push({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), ...props });
  }

  // Height of an area's floor at (x, y)
  static floorAt(a, x, y) {
    if (a.kind !== 'ramp' && a.kind !== 'stairs') return a.z0;
    let t;
    switch (a.dir) {
      case 'n': t = (y - a.y0) / (a.y1 - a.y0); break;
      case 's': t = (a.y1 - y) / (a.y1 - a.y0); break;
      case 'e': t = (x - a.x0) / (a.x1 - a.x0); break;
      default: t = (a.x1 - x) / (a.x1 - a.x0);
    }
    t = Math.max(0, Math.min(1, t));
    return a.z0 + (a.z1 - a.z0) * t;
  }

  static contains(a, x, y) {
    if (x < a.x0 || x > a.x1 || y < a.y0 || y > a.y1) return false;
    if (a.kind !== 'poly') return true;
    return pointInConvex(a.pts, x, y);
  }

  // Build: floors + auto walls. Returns this (brushes in this.brushes).
  generate() {
    // --- floors
    for (const a of this.areas) {
      const bottom = a.slab ? Math.min(a.z0, a.z1) - (a.slabDepth || 16) : BASE;
      const topTex = a.tex;
      const side = a.side || 'wall_stone';
      const tex = { top: topTex, all: side, bottom: a.slab ? (a.slabBottom || 'wood_planks') : null };
      if (a.noFloor) continue;
      if (a.kind === 'stairs') {
        const { x0, y0, x1, y1, z0, z1, dir, steps } = a;
        for (let i = 0; i < steps; i++) {
          const zt = z0 + (z1 - z0) * (i + 1) / steps;
          const f0 = i / steps;
          let bx0 = x0, bx1 = x1, by0 = y0, by1 = y1;
          if (dir === 'n') by0 = y0 + (y1 - y0) * f0;
          if (dir === 's') by1 = y1 - (y1 - y0) * f0;
          if (dir === 'e') bx0 = x0 + (x1 - x0) * f0;
          if (dir === 'w') bx1 = x1 - (x1 - x0) * f0;
          this.add(boxBrush([bx0, by0, i === 0 ? bottom : z0 + (z1 - z0) * i / steps - 8], [bx1, by1, zt], { top: a.tex, all: a.stepTex || 'wall_stone' }, { name: a.name }));
        }
        // landing at the bottom
        this.add(boxBrush([x0, y0, bottom], [x1, y1, z0], tex, { name: a.name }));
      } else if (a.kind === 'rect') {
        this.add(boxBrush([a.x0, a.y0, bottom], [a.x1, a.y1, a.z0], tex, { name: a.name, surface: a.surface }));
      } else if (a.kind === 'poly') {
        this.add(prismBrush('z', a.pts, bottom, a.z0, tex, { name: a.name, surface: a.surface }));
      } else {
        const { x0, y0, x1, y1, z0, z1, dir } = a;
        if (dir === 'n' || dir === 's') {
          const lowY = dir === 'n' ? y0 : y1, highY = dir === 'n' ? y1 : y0;
          this.add(prismBrush('x', [[lowY, bottom], [highY, bottom], [highY, z1], [lowY, z0]], x0, x1, tex, { name: a.name, surface: a.surface }));
        } else {
          const lowX = dir === 'e' ? x0 : x1, highX = dir === 'e' ? x1 : x0;
          this.add(prismBrush('y', [[lowX, bottom], [highX, bottom], [highX, z1], [lowX, z0]], y0, y1, tex, { name: a.name, surface: a.surface }));
        }
      }
      // ceiling slab
      if (a.ceil != null) {
        const top = a.ceilTop ?? (Math.max(a.z0, a.z1) + a.wall);
        const ctex = { bottom: a.ceilTex || 'wood_planks', all: a.wallTex || 'wall_stone' };
        if (a.kind === 'poly') this.add(prismBrush('z', a.pts, a.ceil, top, ctex, { name: a.name + ':ceil' }));
        else this.add(boxBrush([a.x0, a.y0, a.ceil], [a.x1, a.y1, top], ctex, { name: a.name + ':ceil' }));
      }
    }
    this._autoWalls();
    return this;
  }

  _autoWalls() {
    const [bx0, by0, bx1, by1] = this.bounds;
    const nx = Math.ceil((bx1 - bx0) / GRID), ny = Math.ceil((by1 - by0) / GRID);
    const covered = new Uint8Array(nx * ny);
    const height = new Float32Array(nx * ny).fill(-1e9);
    const wallTex = new Array(nx * ny).fill(null);
    const areas = this.areas;
    // a cell is free (not solid) if any part of it is inside an area
    for (const a of areas) {
      if (a.noWalls) continue;
      const i0 = Math.max(0, Math.floor((a.x0 - bx0) / GRID)), i1 = Math.min(nx - 1, Math.ceil((a.x1 - bx0) / GRID) - 1);
      const j0 = Math.max(0, Math.floor((a.y0 - by0) / GRID)), j1 = Math.min(ny - 1, Math.ceil((a.y1 - by0) / GRID) - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const cx0 = bx0 + i * GRID, cy0 = by0 + j * GRID;
        let inside = false;
        if (a.kind !== 'poly') inside = true;
        else {
          // any of 4 corners or centre inside (partial cover counts as free)
          const pts = [[cx0 + 4, cy0 + 4], [cx0 + 0.5, cy0 + 0.5], [cx0 + GRID - 0.5, cy0 + 0.5], [cx0 + 0.5, cy0 + GRID - 0.5], [cx0 + GRID - 0.5, cy0 + GRID - 0.5]];
          for (const p of pts) if (pointInConvex(a.pts, p[0], p[1])) { inside = true; break; }
        }
        if (inside) covered[j * nx + i] = 1;
      }
    }
    for (const r of this.solidMask) {
      for (let j = Math.floor((r[1] - by0) / GRID); j < Math.ceil((r[3] - by0) / GRID); j++)
        for (let i = Math.floor((r[0] - bx0) / GRID); i < Math.ceil((r[2] - bx0) / GRID); i++)
          if (i >= 0 && j >= 0 && i < nx && j < ny) covered[j * nx + i] = 0;
    }
    // wall height near areas: within R cells of an area take max(area top + wall)
    const R = 4;
    for (const a of areas) {
      if (a.noWalls) continue;
      const i0 = Math.max(0, Math.floor((a.x0 - bx0) / GRID) - R), i1 = Math.min(nx - 1, Math.ceil((a.x1 - bx0) / GRID) + R);
      const j0 = Math.max(0, Math.floor((a.y0 - by0) / GRID) - R), j1 = Math.min(ny - 1, Math.ceil((a.y1 - by0) / GRID) + R);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        if (covered[k]) continue;
        const cx = bx0 + (i + 0.5) * GRID, cy = by0 + (j + 0.5) * GRID;
        const px = Math.max(a.x0, Math.min(a.x1, cx)), py = Math.max(a.y0, Math.min(a.y1, cy));
        const d = Math.max(Math.abs(cx - px), Math.abs(cy - py));
        if (d > R * GRID) continue;
        const fz = Math.max(a.z0, a.z1);
        const h = fz + a.wall;
        if (h > height[k]) { height[k] = h; wallTex[k] = a.wallTex || null; }
      }
    }
    // propagate heights into the interior of solid masses (flat roofs)
    let changed = true, iter = 0;
    while (changed && iter < 400) {
      changed = false; iter++;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (covered[k] || height[k] > -1e8) continue;
        let best = -1e9, bt = null;
        if (i > 0 && height[k - 1] > best && !covered[k - 1]) { best = height[k - 1]; bt = wallTex[k - 1]; }
        if (i < nx - 1 && height[k + 1] > best && !covered[k + 1]) { best = height[k + 1]; bt = wallTex[k + 1]; }
        if (j > 0 && height[k - nx] > best && !covered[k - nx]) { best = height[k - nx]; bt = wallTex[k - nx]; }
        if (j < ny - 1 && height[k + nx] > best && !covered[k + nx]) { best = height[k + nx]; bt = wallTex[k + nx]; }
        if (best > -1e8) { height[k] = best; wallTex[k] = bt; changed = true; }
      }
      // write is in-place which propagates fast; continue until stable
    }
    for (let k = 0; k < nx * ny; k++) if (!covered[k] && height[k] < -1e8) height[k] = 256;
    // quantise heights to 8
    for (let k = 0; k < nx * ny; k++) height[k] = Math.round(height[k] / 8) * 8;
    // zones: override texture / add height
    const zoneOf = new Array(nx * ny).fill(null);
    for (const zn of this.wallZones) {
      for (let j = Math.max(0, Math.floor((zn.y0 - by0) / GRID)); j < Math.min(ny, Math.ceil((zn.y1 - by0) / GRID)); j++)
        for (let i = Math.max(0, Math.floor((zn.x0 - bx0) / GRID)); i < Math.min(nx, Math.ceil((zn.x1 - bx0) / GRID)); i++) {
          const k = j * nx + i;
          if (covered[k]) continue;
          zoneOf[k] = zn;
          if (zn.height != null) height[k] = zn.height;
          if (zn.extra) height[k] += zn.extra;
        }
    }
    // greedy rectangle merge of solid cells with equal height+texture
    const used = new Uint8Array(nx * ny);
    const keyOf = (k) => height[k] + '|' + (wallTex[k] || '') + '|' + (zoneOf[k] ? this.wallZones.indexOf(zoneOf[k]) : -1);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (covered[k] || used[k]) continue;
      const key = keyOf(k);
      let w = 1;
      while (i + w < nx) { const kk = k + w; if (covered[kk] || used[kk] || keyOf(kk) !== key) break; w++; }
      let h = 1;
      outer: while (j + h < ny) {
        for (let t = 0; t < w; t++) { const kk = (j + h) * nx + i + t; if (covered[kk] || used[kk] || keyOf(kk) !== key) break outer; }
        h++;
      }
      for (let jj = j; jj < j + h; jj++) for (let ii = i; ii < i + w; ii++) used[jj * nx + ii] = 1;
      const x0 = bx0 + i * GRID, y0 = by0 + j * GRID, x1 = x0 + w * GRID, y1 = y0 + h * GRID;
      const top = height[k];
      const zn = zoneOf[k];
      const sideTex = zn?.tex || wallTex[k] || 'wall_stone';
      const roofTex = zn?.roof || 'wall_plaster';
      const capTex = zn ? (zn.capTex ?? null) : 'trim_cap';
      if (capTex) {
        this.add(boxBrush([x0, y0, BASE], [x1, y1, top - 16], this._wallTex(x0, y0, x1, y1, sideTex, roofTex), { name: 'wall' }));
        this.add(boxBrush([x0, y0, top - 16], [x1, y1, top], { ...this._wallTex(x0, y0, x1, y1, capTex, roofTex), bottom: null }, { name: 'wallcap' }));
      } else {
        this.add(boxBrush([x0, y0, BASE], [x1, y1, top], this._wallTex(x0, y0, x1, y1, sideTex, roofTex), { name: 'wall' }));
      }
    }
    this._grid = { nx, ny, covered, height };
  }

  // Wall textures; faces on the outer bounds and bottoms are never visible.
  _wallTex(x0, y0, x1, y1, side, roof) {
    const [bx0, by0, bx1, by1] = this.bounds;
    return {
      all: side, top: roof, bottom: null,
      w: x0 <= bx0 ? null : side, e: x1 >= bx1 ? null : side,
      s: y0 <= by0 ? null : side, n: y1 >= by1 ? null : side,
    };
  }

  // Ground height lookup (highest area floor containing the point), for props placement.
  groundAt(x, y) {
    let best = null;
    for (const a of this.areas) {
      if (a.slab && a.ignoreGround) continue;
      if (AreaMap.contains(a, x, y)) {
        const z = AreaMap.floorAt(a, x, y);
        if (best === null || z > best) best = z;
      }
    }
    return best ?? 0;
  }
}

function defaults(o) {
  return { tex: 'ground_sand', wall: 224, ceil: null, slab: false, ...o };
}

function pointInConvex(pts, x, y) {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (Math.abs(c) < 1e-9) continue;
    const s = c > 0 ? 1 : -1;
    if (!sign) sign = s; else if (s !== sign) return false;
  }
  return true;
}
