// Shadow geometry for the lightmap (TECH §8): which cells stop light, the occluder segments built
// from them, and per-light visibility polygons (angle-sweep raycast).
//
// The 3/4 view rule. Every cell is one of
//   OPEN  — light passes (floors, open doors, railings, pits);
//   FACE  — a south-facing vertical surface: wall face rows, closed doors set in wall rows, and the
//           footprint of free-standing opaque props (library stacks, curtains). Light ENTERS a face
//           from the south and lights it, but cannot leave it northward or sideways;
//   BLOCK — wall tops and void: light stops at their edges (plus a couple of px of radial bleed).
// So pointing the flashlight at a wall lights its face, while nothing passes north through it.
// A light whose origin sits inside a FACE (an exit sign on the wall, Tess hugging a wall) is nudged
// to the face's front edge so it shines out of the wall instead of being trapped in it.
//
// Free-standing opaque props draw art taller than their footprint, so for lights SOUTH of them
// their top edge is raised by EXT px (lights the upper half of the art); lights north of them still
// stop at the true footprint edge. Segments carry a condition on the light origin to express this.
//
// Segments are stored flat in a Float32Array, stride SEG: x1, y1, x2, y2, cond, meta.

export const OPEN = 0;
export const FACE = 1;
export const BLOCK = 2;

export const SEG = 6;
const C_ALWAYS = 0;
const C_SOUTH_OF = 2; // include iff origin y >  meta (the raised top of a free-standing prop)
const C_NORTH_OF = 3; // include iff origin y <= meta (its true top edge)

const TILE = 16;
const EXT = 13; // px a free-standing opaque prop's lit face extends above its footprint

/**
 * Classify every cell of a MapRuntime (only its documented interface is used).
 * @returns {{ w, h, cls: Uint8Array, free: Uint8Array }}
 */
export function classifyCells(map) {
  const { w, h } = map;
  const cls = new Uint8Array(w * h);
  const free = new Uint8Array(w * h);
  const isWall = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !!map.wallKind(x, y);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!map.isOpaque(x, y)) continue; // OPEN
      const i = y * w + x;
      const wk = map.wallKind(x, y);
      if (wk === 'face_high' || wk === 'face_low') cls[i] = FACE;
      else if (wk) cls[i] = BLOCK;
      else if (map.tileAt(x, y) === 'void') cls[i] = BLOCK;
      else {
        // Opaque prop or closed door. Set in a wall row (wall on either side) it is part of that
        // wall's face; otherwise it stands free in a room.
        cls[i] = FACE;
        if (!isWall(x - 1, y) && !isWall(x + 1, y)) free[i] = 1;
      }
    }
  }
  return { w, h, cls, free };
}

/** Build merged occluder segments from a classification. */
export function buildSegments(grid) {
  const { w, h, cls, free } = grid;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? BLOCK : cls[y * w + x]);
  const freeTop = (x, y) => x >= 0 && y >= 0 && x < w && y < h && free[y * w + x] === 1 && at(x, y - 1) === OPEN;
  // Raw unit edges: [orient(0=h,1=v), line, a, b, cond, meta]
  const raw = [];
  const edge = (o, line, a, b, cond = C_ALWAYS, meta = 0) => raw.push([o, line, a, b, cond, meta]);

  // Horizontal boundaries (between row y-1 and row y).
  for (let y = 0; y <= h; y++) {
    const ly = y * TILE;
    for (let x = 0; x < w; x++) {
      const n = at(x, y - 1);
      const s = at(x, y);
      const a = x * TILE;
      if ((n === BLOCK) !== (s === BLOCK)) edge(0, ly, a, a + TILE);
      else if (n === OPEN && s === FACE) {
        if (freeTop(x, y)) {
          edge(0, ly, a, a + TILE, C_NORTH_OF, ly);
          edge(0, ly - EXT, a, a + TILE, C_SOUTH_OF, ly);
        } else {
          edge(0, ly, a, a + TILE); // e.g. the open threshold cell above a closed door
        }
      }
      // FACE above OPEN is a face front: light enters there, no segment.
    }
  }
  // Vertical boundaries (between column x-1 and column x).
  for (let x = 0; x <= w; x++) {
    const lx = x * TILE;
    for (let y = 0; y < h; y++) {
      const wc = at(x - 1, y);
      const ec = at(x, y);
      const a = y * TILE;
      if ((wc === BLOCK) !== (ec === BLOCK)) edge(1, lx, a, a + TILE);
      else if (wc !== BLOCK && (wc === FACE) !== (ec === FACE)) edge(1, lx, a, a + TILE);
      // Sides of a free prop's raised strip.
      const lt = freeTop(x - 1, y);
      const rt = freeTop(x, y);
      if (lt !== rt) edge(1, lx, a - EXT, a, C_SOUTH_OF, a);
    }
  }

  // Merge collinear, touching edges with the same condition.
  raw.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[4] - q[4] || p[5] - q[5] || p[2] - q[2]);
  const merged = [];
  let cur = null;
  for (const e of raw) {
    if (cur && cur[0] === e[0] && cur[1] === e[1] && cur[4] === e[4] && cur[5] === e[5] && e[2] <= cur[3]) {
      if (e[3] > cur[3]) cur[3] = e[3];
    } else {
      cur = e.slice();
      merged.push(cur);
    }
  }
  const segs = new Float32Array(merged.length * SEG);
  merged.forEach((e, i) => {
    const o = i * SEG;
    if (e[0] === 0) { segs[o] = e[2]; segs[o + 1] = e[1]; segs[o + 2] = e[3]; segs[o + 3] = e[1]; }
    else { segs[o] = e[1]; segs[o + 1] = e[2]; segs[o + 2] = e[1]; segs[o + 3] = e[3]; }
    segs[o + 4] = e[4];
    segs[o + 5] = e[5];
  });
  return segs;
}

/**
 * Move a light origin out of walls: inside a FACE → just past the face's front (south) edge;
 * inside a BLOCK → into the nearest non-block neighbour. Writes into `out` ({x, y}).
 */
export function nudgeOrigin(grid, x, y, out) {
  out.x = x;
  out.y = y;
  if (!grid) return out;
  const { w, h, cls } = grid;
  const at = (cx, cy) => (cx < 0 || cy < 0 || cx >= w || cy >= h ? BLOCK : cls[cy * w + cx]);
  let cx = Math.floor(x / TILE);
  let cy = Math.floor(y / TILE);
  let c = at(cx, cy);
  if (c === BLOCK) {
    // Step into the nearest non-block neighbour cell (ties favour the cell below: lights hang on
    // walls that face the camera).
    let best = Infinity;
    let bx = cx;
    let by = cy;
    for (let dy = 1; dy >= -1; dy--) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || at(cx + dx, cy + dy) === BLOCK) continue;
        const nx = Math.min(Math.max(x, (cx + dx) * TILE + 0.5), (cx + dx) * TILE + TILE - 0.5);
        const ny = Math.min(Math.max(y, (cy + dy) * TILE + 0.5), (cy + dy) * TILE + TILE - 0.5);
        const d = (nx - x) * (nx - x) + (ny - y) * (ny - y);
        if (d < best - 1e-6) { best = d; bx = cx + dx; by = cy + dy; out.x = nx; out.y = ny; }
      }
    }
    cx = bx;
    cy = by;
    c = at(cx, cy);
  }
  if (c === FACE) {
    let fy = cy;
    for (let k = 0; k < 4 && at(cx, fy) === FACE; k++) fy++;
    if (at(cx, fy) === OPEN) out.y = fy * TILE + 0.5;
  }
  return out;
}

const EPS = 0.00025; // rad — rays just either side of each corner
const TWO_PI = Math.PI * 2;

/**
 * Visibility polygon solver. Reuses its scratch buffers; not re-entrant.
 * compute() writes vertices (x0, y0, x1, y1, …) into `out` and returns the vertex count.
 */
export class VisibilitySolver {
  constructor() {
    this.cand = new Float64Array(4 * 1024);
    this.angles = new Float64Array(3 * 2048 + 8);
  }

  _grow(n) {
    if (n * 4 > this.cand.length) {
      const c = new Float64Array(n * 8);
      c.set(this.cand);
      this.cand = c;
    }
    if (n * 6 + 8 > this.angles.length) this.angles = new Float64Array(n * 12 + 16);
  }

  /**
   * @param segs    Float32Array of segments (stride SEG)
   * @param ox,oy   light origin (world px)
   * @param R       radius (px): result is bounded by the square [o-R, o+R]
   * @param out     Float32Array, ≥ 2 × max vertices
   * @param bleed   px each vertex is pushed outward (light bleeds into occluder edges)
   * @param a0,a1   optional angular window (rad, a0 < a1, span < 2π): a wedge with the origin
   *                as first vertex (cones)
   */
  compute(segs, ox, oy, R, out, bleed = 0, a0 = null, a1 = null) {
    const x0 = ox - R;
    const y0 = oy - R;
    const x1 = ox + R;
    const y1 = oy + R;
    const nSeg = segs.length / SEG;
    this._grow(nSeg + 4);
    const cand = this.cand;
    let nc = 0;
    // Gather segments touching the box (respecting origin conditions), clipped to the box.
    for (let i = 0; i < nSeg; i++) {
      const o = i * SEG;
      let ax = segs[o];
      let ay = segs[o + 1];
      let bx = segs[o + 2];
      let by = segs[o + 3];
      if ((ax < x0 && bx < x0) || (ax > x1 && bx > x1) || (ay < y0 && by < y0) || (ay > y1 && by > y1)) continue;
      const cond = segs[o + 4];
      if (cond === C_SOUTH_OF && !(oy > segs[o + 5])) continue;
      if (cond === C_NORTH_OF && !(oy <= segs[o + 5])) continue;
      // Segments are axis-aligned: clipping is a clamp.
      if (ay === by) { ax = Math.max(x0, Math.min(x1, ax)); bx = Math.max(x0, Math.min(x1, bx)); }
      else if (ax === bx) { ay = Math.max(y0, Math.min(y1, ay)); by = Math.max(y0, Math.min(y1, by)); }
      cand[nc++] = ax; cand[nc++] = ay; cand[nc++] = bx; cand[nc++] = by;
    }
    // The bounding box closes the polygon.
    cand[nc++] = x0; cand[nc++] = y0; cand[nc++] = x1; cand[nc++] = y0;
    cand[nc++] = x1; cand[nc++] = y0; cand[nc++] = x1; cand[nc++] = y1;
    cand[nc++] = x1; cand[nc++] = y1; cand[nc++] = x0; cand[nc++] = y1;
    cand[nc++] = x0; cand[nc++] = y1; cand[nc++] = x0; cand[nc++] = y0;

    const wedge = a0 !== null;
    const angles = this.angles;
    let na = 0;
    for (let i = 0; i < nc; i += 2) {
      let a = Math.atan2(cand[i + 1] - oy, cand[i] - ox);
      if (wedge) {
        // Bring into [a0, a0 + 2π) and keep only angles inside the window.
        while (a < a0) a += TWO_PI;
        while (a >= a0 + TWO_PI) a -= TWO_PI;
        if (a > a1) continue;
      }
      angles[na++] = a - EPS;
      angles[na++] = a;
      angles[na++] = a + EPS;
    }
    if (wedge) {
      angles[na++] = a0;
      angles[na++] = a1;
    }
    const sorted = angles.subarray(0, na).sort();

    let nv = 0;
    if (wedge) { out[nv++] = ox; out[nv++] = oy; }
    let prev = -Infinity;
    for (let k = 0; k < na; k++) {
      const a = sorted[k];
      if (a - prev < 1e-7) continue;
      if (wedge && (a < a0 || a > a1)) continue;
      prev = a;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let tMin = Infinity;
      for (let i = 0; i < nc; i += 4) {
        const sx = cand[i];
        const sy = cand[i + 1];
        const ex = cand[i + 2] - sx;
        const ey = cand[i + 3] - sy;
        const den = dx * ey - dy * ex;
        if (den > -1e-12 && den < 1e-12) continue;
        const qx = sx - ox;
        const qy = sy - oy;
        const t = (qx * ey - qy * ex) / den;
        if (t <= 1e-6 || t >= tMin) continue;
        const u = (qx * dy - qy * dx) / den;
        if (u < -1e-9 || u > 1 + 1e-9) continue;
        tMin = t;
      }
      if (tMin === Infinity) continue;
      const t = tMin + bleed;
      out[nv++] = ox + dx * t;
      out[nv++] = oy + dy * t;
    }
    return nv >> 1;
  }
}

/** Even-odd point-in-polygon test on a flat vertex array. */
export function pointInPoly(poly, n, x, y) {
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2];
    const yi = poly[i * 2 + 1];
    const xj = poly[j * 2];
    const yj = poly[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Trace a polygon into the current path of ctx (world → ctx transform must be set). */
export function tracePoly(ctx, poly, n) {
  ctx.beginPath();
  if (n < 3) return;
  ctx.moveTo(poly[0], poly[1]);
  for (let i = 1; i < n; i++) ctx.lineTo(poly[i * 2], poly[i * 2 + 1]);
  ctx.closePath();
}
