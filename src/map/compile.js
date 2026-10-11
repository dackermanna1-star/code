// "Map compiler": turns authored brushes into visible faces (with qcsg-style
// hidden-surface removal between brushes) and collision brushes.
// DOM-free so it can run in a worker or node.

import { makeCollisionBrush, CollisionWorld, CONTENTS_SOLID } from '../engine/collision.js';
import { splitPolygon, polyArea } from './brush.js';

const COPLANAR_EPS = 0.02;

export function compileMap(brushes) {
  brushes.forEach((b, i) => { b.id = i; b.computePolys(); });

  // Brushes that hide faces: visible & solid & not detail.
  const occluders = brushes.filter((b) => b.visible && (b.contents & CONTENTS_SOLID) && !b.detail && b.mins && isFinite(b.mins[0]));
  // simple uniform grid for occluder lookup
  const grid = new SpatialHash(256);
  for (const b of occluders) grid.insert(b, b.mins, b.maxs);

  const faces = [];
  for (const b of brushes) {
    if (!b.visible) continue;
    for (let i = 0; i < b.planes.length; i++) {
      const poly = b.polys[i];
      const pl = b.planes[i];
      if (!poly || !pl.tex) continue; // null tex = nodraw
      const texName = typeof pl.tex === 'string' ? pl.tex : pl.tex.name;
      if (!texName || texName === 'null' || texName === 'skip') continue;
      let pieces = [poly];
      const fmin = [Infinity, Infinity, Infinity], fmax = [-Infinity, -Infinity, -Infinity];
      for (const v of poly) for (let a = 0; a < 3; a++) { if (v[a] < fmin[a]) fmin[a] = v[a]; if (v[a] > fmax[a]) fmax[a] = v[a]; }
      const cands = grid.query(fmin, fmax);
      for (const o of cands) {
        if (o === b) continue;
        if (!overlaps(o.mins, o.maxs, fmin, fmax, 0.05)) continue;
        const next = [];
        for (const p of pieces) {
          for (const q of clipOutside(p, pl.n, o, b.id)) next.push(q);
        }
        pieces = next;
        if (!pieces.length) break;
      }
      for (const p of pieces) {
        if (polyArea(p) < 0.5) continue;
        faces.push({ poly: p, n: pl.n, d: pl.d, tex: pl.tex, texName, brush: b, origPoly: poly });
      }
    }
  }

  const collision = [];
  for (const b of brushes) {
    if (!b.contents || !b.mins || !isFinite(b.mins[0])) continue;
    const planes = b.planes.map((p) => [p.n[0], p.n[1], p.n[2], p.d]);
    collision.push(makeCollisionBrush(planes, b.mins, b.maxs, b.contents, b));
  }
  const world = new CollisionWorld(collision);
  return { faces, world, brushes };
}

function overlaps(amin, amax, bmin, bmax, eps) {
  return amin[0] <= bmax[0] + eps && amax[0] >= bmin[0] - eps &&
    amin[1] <= bmax[1] + eps && amax[1] >= bmin[1] - eps &&
    amin[2] <= bmax[2] + eps && amax[2] >= bmin[2] - eps;
}

// Returns the parts of polygon `poly` (with face normal fn, from brush id `ownId`)
// that are NOT hidden by brush `o`.
function clipOutside(poly, fn, o, ownId) {
  const out = [];
  let cur = poly;
  for (const p of o.planes) {
    const r = splitPolygon(cur, p.n, p.d, COPLANAR_EPS);
    if (r.on) {
      const same = p.n[0] * fn[0] + p.n[1] * fn[1] + p.n[2] * fn[2] > 0;
      if (same) {
        // Coplanar and facing the same way: one of the two must win (qcsg: later brush wins).
        if (o.id < ownId) return [poly]; // we win: whole face kept
        continue; // other brush wins: treat as inside this plane
      }
      // facing into the other brush: hidden along this plane
      continue;
    }
    if (r.front) out.push(r.front);
    if (!r.back) return [poly]; // fully outside this plane => untouched
    cur = r.back;
  }
  // `cur` lies inside the occluder: discard it
  return out;
}

class SpatialHash {
  constructor(cell) { this.cell = cell; this.map = new Map(); this.stamp = 0; }
  key(x, y) { return x * 73856093 ^ y * 19349663; }
  insert(obj, mins, maxs) {
    const c = this.cell;
    for (let x = Math.floor(mins[0] / c); x <= Math.floor(maxs[0] / c); x++) {
      for (let y = Math.floor(mins[1] / c); y <= Math.floor(maxs[1] / c); y++) {
        const k = this.key(x, y);
        let l = this.map.get(k);
        if (!l) this.map.set(k, l = []);
        l.push(obj);
      }
    }
  }
  query(mins, maxs) {
    const c = this.cell;
    const s = ++this.stamp;
    const res = [];
    for (let x = Math.floor(mins[0] / c); x <= Math.floor(maxs[0] / c); x++) {
      for (let y = Math.floor(mins[1] / c); y <= Math.floor(maxs[1] / c); y++) {
        const l = this.map.get(this.key(x, y));
        if (!l) continue;
        for (const o of l) {
          if (o._hs === s) continue;
          o._hs = s;
          res.push(o);
        }
      }
    }
    return res;
  }
}
