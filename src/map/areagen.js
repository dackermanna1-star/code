// Area-based level builder. Walkable "areas" (flat rects, ramps, polygons) are
// laid down as terrain columns; everything not covered by an area becomes solid
// building mass whose height follows the walls of the neighbouring areas.
// Hand-placed detail (parapets, crates, doors, arches, ceilings) is added on top
// through the MapDSL.

import { MapDSL } from './mapdsl.js';
import { prismBrush, boxBrush, slopedPrismBrush } from './brush.js';
import { CONTENTS_PLAYERCLIP } from '../engine/collision.js';

const GRID = 8;
const BASE = -640; // bottom of the world

// Default textures of the generated geometry (de_dust2's). A new map sets its own before
// adding areas: m.style = { ...m.style, ground: 'asphalt', wall: 'brick_red', cap: null, ... }.
//   ground: area floors (opts.tex)   side: floor slab sides   step: stair risers
//   wall: auto-wall sides            cap: 16-unit band on top of auto walls (null: none)
//   roof: tops of auto walls         ceil: underside of area ceilings   slabBottom: under slabs
export const AREA_STYLE = { ground: 'ground_sand', side: 'wall_stone', step: 'wall_stone', wall: 'wall_stone', cap: 'trim_cap', roof: 'wall_plaster', ceil: 'wood_planks', slabBottom: 'wood_planks' };

export class AreaMap extends MapDSL {
  constructor(bounds) {
    super();
    this.bounds = bounds; // [x0, y0, x1, y1]
    this.areas = [];
    this.wallZones = []; // { rect, tex, capTex, extra, rock }
    this.solidMask = []; // extra rects forced solid (pillars)
    this.massing = null; // measured wall-top heights (see setMassing)
    this.style = { ...AREA_STYLE };
  }

  // Measured wall/roof top heights on a grid ({x0,y0,cell,w,h,rle}, see
  // tools/measure-massing.mjs). Auto walls take these heights where they rise
  // clearly above the neighbouring floors.
  setMassing(m) {
    const bin = atob(m.rle);
    const data = new Int16Array(m.w * m.h).fill(-32768);
    let k = 0;
    for (let i = 0; i < bin.length; i += 2) {
      const v = bin.charCodeAt(i), n = bin.charCodeAt(i + 1);
      for (let r = 0; r < n; r++, k++) if (v) data[k] = (v - 81) * 8;
    }
    this.massing = { ...m, data };
  }

  massingAt(x, y) {
    const M = this.massing;
    if (!M) return null;
    const i = Math.floor((x - M.x0) / M.cell), j = Math.floor((y - M.y0) / M.cell);
    if (i < 0 || j < 0 || i >= M.w || j >= M.h) return null;
    const v = M.data[j * M.w + i];
    return v === -32768 ? null : v;
  }

  // Flat rectangular area. opts: { tex, wall, ceil, slab, side }
  A(name, x0, y0, x1, y1, z, opts = {}) {
    const a = { name, kind: 'rect', x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z0: z, z1: z, dir: null, ...defaults(opts, this.style) };
    this.areas.push(a);
    return a;
  }

  // Ramp rising toward dir ('n','s','e','w') from zLow to zHigh.
  R(name, x0, y0, x1, y1, zLow, zHigh, dir, opts = {}) {
    const a = { name, kind: 'ramp', x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z0: zLow, z1: zHigh, dir, ...defaults(opts, this.style) };
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
  opening(x0, y0, x1, y1, zLo, zHi, top, tex = this.style.wall) {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    this.areas.push({ name: 'opening', kind: 'rect', x0: xa, y0: ya, x1: xb, y1: yb, z0: zLo, z1: zLo, noFloor: true, wall: 0, tex: null });
    if (zLo > BASE) this.add(boxBrush([xa, ya, BASE], [xb, yb, zLo], { all: tex }, { name: 'sill' }));
    if (top > zHi) this.add(boxBrush([xa, ya, zHi], [xb, yb, top], { all: tex, bottom: tex }, { name: 'lintel' }));
  }

  // Convex polygon area. pts: [[x,y],...]. z is a height, or a plane
  // [z0, gx, gy] meaning z = z0 + gx*x + gy*y (sloped floor).
  P(name, pts, z, opts = {}) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const plane = Array.isArray(z) ? z : null;
    const zs = plane ? pts.map(([x, y]) => plane[0] + plane[1] * x + plane[2] * y) : [z];
    const a = { name, kind: 'poly', pts, plane, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), z0: Math.min(...zs), z1: Math.max(...zs), dir: null, ...defaults(opts, this.style) };
    this.areas.push(a);
    return a;
  }

  // Axis-aligned rectangle with a sloped plane floor (see P).
  Q(name, x0, y0, x1, y1, plane, opts = {}) {
    return this.P(name, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], plane, opts);
  }

  // Force a rectangle to stay solid building mass (pillars, towers) even if an area covers it.
  solid(x0, y0, x1, y1, props = null) {
    this.solidMask.push([Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]);
    if (props) this.zone(x0, y0, x1, y1, props);
  }

  zone(x0, y0, x1, y1, props) {
    this.wallZones.push({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), ...props });
  }

  // Height of an area's floor at (x, y)
  static floorAt(a, x, y) {
    if (a.plane) return a.plane[0] + a.plane[1] * x + a.plane[2] * y;
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
    const S = this.style;
    for (const a of this.areas) {
      const bottom = a.slab ? Math.min(a.z0, a.z1) - (a.slabDepth || 16) : BASE;
      const topTex = a.tex;
      const side = a.side || S.side;
      const tex = { top: topTex, all: side, bottom: a.slab ? (a.slabBottom || S.slabBottom) : null };
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
          this.add(boxBrush([bx0, by0, i === 0 ? bottom : z0 + (z1 - z0) * i / steps - 8], [bx1, by1, zt], { top: a.tex, all: a.stepTex || S.step }, { name: a.name }));
        }
        // landing at the bottom
        this.add(boxBrush([x0, y0, bottom], [x1, y1, z0], tex, { name: a.name }));
      } else if (a.kind === 'rect') {
        this.add(boxBrush([a.x0, a.y0, bottom], [a.x1, a.y1, a.z0], tex, { name: a.name, surface: a.surface }));
      } else if (a.kind === 'poly') {
        if (a.plane) this.add(slopedPrismBrush(a.pts, bottom, a.plane, tex, { name: a.name, surface: a.surface }));
        else this.add(prismBrush('z', a.pts, bottom, a.z0, tex, { name: a.name, surface: a.surface }));
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
        const ctex = { bottom: a.ceilTex || S.ceil, all: a.wallTex || S.wall };
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
    const nearFloor = new Float32Array(nx * ny).fill(-1e9);
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
        if (fz > nearFloor[k]) nearFloor[k] = fz;
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
    // measured skyline: walls take the original's heights where they rise
    // clearly above the floors next to them (and inside solid masses)
    if (this.massing) {
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (covered[k]) continue;
        const mh = this.massingAt(bx0 + (i + 0.5) * GRID, by0 + (j + 0.5) * GRID);
        if (mh == null) continue;
        if (zoneOf[k]?.keepHeight) continue;
        if (nearFloor[k] > -1e8 ? mh >= nearFloor[k] + 24 : mh > -600) height[k] = Math.round(mh / 8) * 8;
      }
    }
    // greedy rectangle merge of solid cells with equal height+texture
    const used = new Uint8Array(nx * ny);
    // player clip above walls players shouldn't stand on (GoldSrc maps clip
    // their rooftops): anything more than 64 above the floor next to it
    const clip = new Uint8Array(nx * ny);
    for (let k = 0; k < nx * ny; k++) if (!covered[k] && !(nearFloor[k] > -1e8 && height[k] - nearFloor[k] <= 64)) clip[k] = 1;
    const keyOf = (k) => height[k] + '|' + (wallTex[k] || '') + '|' + (zoneOf[k] ? this.wallZones.indexOf(zoneOf[k]) : -1) + '|' + clip[k];
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
      if (clip[k]) this.add(boxBrush([x0, y0, top], [x1, y1, 1600], { all: null }, { name: 'clip', contents: CONTENTS_PLAYERCLIP, visible: false, castShadow: false }));
      const zn = zoneOf[k];
      const sideTex = zn?.tex || wallTex[k] || this.style.wall;
      const roofTex = zn?.roof || this.style.roof;
      const capTex = zn ? (zn.capTex ?? null) : this.style.cap;
      if (capTex) {
        this.add(boxBrush([x0, y0, BASE], [x1, y1, top - 16], this._wallTex(x0, y0, x1, y1, sideTex, roofTex), { name: 'wall' }));
        this.add(boxBrush([x0, y0, top - 16], [x1, y1, top], { ...this._wallTex(x0, y0, x1, y1, capTex, roofTex), bottom: null }, { name: 'wallcap' }));
      } else {
        this.add(boxBrush([x0, y0, BASE], [x1, y1, top], this._wallTex(x0, y0, x1, y1, sideTex, roofTex), { name: 'wall' }));
      }
    }
    this._grid = { nx, ny, covered, height };
  }

  // Arched, shuttered windows on tall facades facing open areas (dust2's
  // signature look). Placed deterministically along area edges where the auto
  // wall is high enough.
  decorateWindows(seed = 7) {
    let r = seed >>> 0;
    const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
    const { nx, ny, covered, height } = this._grid;
    const [bx0, by0] = this.bounds;
    const solidH = (x, y) => {
      const i = Math.floor((x - bx0) / GRID), j = Math.floor((y - by0) / GRID);
      if (i < 0 || j < 0 || i >= nx || j >= ny) return -1e9;
      const k = j * nx + i;
      return covered[k] ? -1e9 : height[k];
    };
    const placed = [];
    for (const a of this.areas) {
      if (a.kind !== 'rect' || a.ceil != null || a.slab || a.noFloor || a.noWindows) continue;
      const fz = Math.max(a.z0, a.z1);
      if (a.wall < 170) continue;
      const edges = [
        // [axis along, fixed coord, outward dir, lo, hi]
        ['x', a.y1, [0, 1], a.x0, a.x1],
        ['x', a.y0, [0, -1], a.x0, a.x1],
        ['y', a.x1, [1, 0], a.y0, a.y1],
        ['y', a.x0, [-1, 0], a.y0, a.y1],
      ];
      for (const [axis, c, out, lo, hi] of edges) {
        // find runs of tall wall directly outside this edge
        let run = null;
        const runs = [];
        for (let t = lo + 4; t < hi; t += GRID) {
          const x = axis === 'x' ? t : c + out[0] * 4, y = axis === 'x' ? c + out[1] * 4 : t;
          const h = solidH(x, y);
          const ok = h >= fz + 190;
          if (ok) { if (!run) run = { a: t - 4, b: t + 4, h }; else { run.b = t + 4; run.h = Math.min(run.h, h); } }
          else if (run) { runs.push(run); run = null; }
        }
        if (run) runs.push(run);
        for (const rn of runs) {
          const len = rn.b - rn.a;
          if (len < 150) continue;
          const n = Math.max(1, Math.floor((len - 96) / 260));
          for (let k = 0; k < n; k++) {
            if (rnd() < 0.35) continue;
            const center = rn.a + (len / (n + 1)) * (k + 1) + (rnd() - 0.5) * 40;
            const pair = rnd() < 0.3;
            const zb = fz + (rn.h - fz > 270 ? 136 : 100);
            if (zb + 98 > rn.h - 18) continue;
            const offs = pair ? [-42, 42] : [0];
            for (const o of offs) {
              const cc = center + o;
              if (placed.some((p) => Math.abs(p[0] - cc) < 76 && p[1] === c && p[2] === axis)) continue;
              placed.push([cc, c, axis]);
              this.window(axis, c, out, cc, zb);
            }
          }
        }
      }
    }
    return placed.length;
  }

  // One arched window on the wall plane (axis along, at coord c, outward normal out)
  window(axis, c, out, center, zb, w = 52, h = 92) {
    const r = w / 2;
    const dirSign = axis === 'x' ? out[1] : out[0];
    const box = (u0, u1, z0, z1, d0, d1, tex) => {
      // u along the wall, d outward from the plane (positive into the area)
      const a0 = c + dirSign * d0, a1 = c + dirSign * d1;
      if (axis === 'x') this.add(boxBrush([u0, Math.min(a0, a1), z0], [u1, Math.max(a0, a1), z1], tex, { name: 'window', detail: true, surface: 'wood' }));
      else this.add(boxBrush([Math.min(a0, a1), u0, z0], [Math.max(a0, a1), u1, z1], tex, { name: 'window', detail: true, surface: 'wood' }));
    };
    const stone = { all: 'wall_stone' };
    // shutter panel (recessed look: frame sticks out further)
    box(center - r, center + r, zb, zb + h, -1, 1.5, { all: { name: 'shutter', fit: true } });
    // jambs, sill
    box(center - r - 5, center - r, zb - 4, zb + h - r, -1, 5, stone);
    box(center + r, center + r + 5, zb - 4, zb + h - r, -1, 5, stone);
    box(center - r - 7, center + r + 7, zb - 7, zb, -1, 7, { all: 'wall_stone', top: 'trim_cap' });
    // arch: spandrels covering the shutter corners, plus a thin ring
    const zs = zb + h - r;
    const segs = 6;
    const top = zb + h + 6;
    for (let i = 0; i < segs; i++) {
      const t0 = Math.PI * i / segs, t1 = Math.PI * (i + 1) / segs;
      const pa = [center - Math.cos(t0) * r, zs + Math.sin(t0) * r];
      const pb = [center - Math.cos(t1) * r, zs + Math.sin(t1) * r];
      const pts = [pa, pb, [pb[0], top], [pa[0], top]];
      const d0 = c, d1 = c + dirSign * 5;
      const lo = Math.min(d0, d1), hi = Math.max(d0, d1);
      if (axis === 'x') this.add(prismBrush('y', pts, lo, hi, stone, { name: 'window', detail: true }));
      else {
        this.add(prismBrush('x', pts, lo, hi, stone, { name: 'window', detail: true }));
      }
    }
  }

  // Wooden ceiling beams across tunnel areas.
  decorateBeams(spacing = 96) {
    for (const a of this.areas) {
      if (a.ceil == null || a.kind !== 'rect') continue;
      const alongX = (a.x1 - a.x0) >= (a.y1 - a.y0);
      if (alongX) {
        for (let x = a.x0 + 40; x < a.x1 - 20; x += spacing) this.add(boxBrush([x, a.y0, a.ceil - 10], [x + 12, a.y1, a.ceil], { all: 'wood_beam' }, { name: 'beam', detail: true, surface: 'wood' }));
      } else {
        for (let y = a.y0 + 40; y < a.y1 - 20; y += spacing) this.add(boxBrush([a.x0, y, a.ceil - 10], [a.x1, y + 12, a.ceil], { all: 'wood_beam' }, { name: 'beam', detail: true, surface: 'wood' }));
      }
    }
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

function defaults(o, style) {
  return { tex: style.ground, wall: 224, ceil: null, slab: false, ...o };
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
