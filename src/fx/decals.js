// Persistent wall/floor/ceiling decals (blood, bullet holes, scorches).
// Each decal is a small quad anchored to a sector plane, so it rides along
// with doors and lifts, clipped to the wall segment it was placed on. They
// are drawn with the world shader (same COLORMAP lighting) in a ring buffer.

import { WORLD_FLOATS } from '../render/shaders.js';
import { ML } from '../game/mapdata.js';
import { pointOnLineSide } from '../game/maputl.js';

const PLANE_FLOOR = 0;
const PLANE_CEIL = 1;
const F_DECAL = 16 | 64;
const F_FLATLIGHT = 128;

export class Decals {
  constructor(w, max) {
    this.w = w;
    this.max = max;
    this.list = [];
    this.cursor = 0;
  }

  setMax(n) {
    this.max = n;
    if (this.list.length > n) this.list.splice(0, this.list.length - n);
  }

  push(d) {
    if (this.max <= 0) return;
    if (this.list.length < this.max) this.list.push(d);
    else {
      this.list[this.cursor] = d;
      this.cursor = (this.cursor + 1) % this.max;
    }
  }

  // Wall decal centred at (x, y, z) on `line`, seen from `side` (0 front).
  addWall(line, side, x, y, z, image, part = 'mid', scale = 1) {
    const res = this.w.res;
    const info = res.images[image];
    if (!info || !line) return false;
    const front = side === 0 ? line.frontsector : line.backsector;
    const back = side === 0 ? line.backsector : line.frontsector;
    if (!front) return false;
    const len = line.length || 1;
    const ux = line.dx / len, uy = line.dy / len;
    let t = (x - line.v1.x) * ux + (y - line.v1.y) * uy;
    const hw = info.width * scale / 2;
    const hh = info.height * scale / 2;
    let t0 = t - hw, t1 = t + hw;
    let u0 = 0, u1 = info.width;
    if (t0 < 0) { u0 += (-t0) / scale; t0 = 0; }
    if (t1 > len) { u1 -= (t1 - len) / scale; t1 = len; }
    if (t1 - t0 < 1) return false;
    // Vertical extent of the wall part hit.
    let lo, hi, anchorSec, anchorPlane;
    if (!back || !(line.flags & ML.TWOSIDED)) {
      lo = front.floorheight; hi = front.ceilingheight; anchorSec = front; anchorPlane = PLANE_FLOOR;
    } else if (part === 'upper') {
      lo = back.ceilingheight; hi = front.ceilingheight; anchorSec = back; anchorPlane = PLANE_CEIL;
    } else if (part === 'lower') {
      lo = front.floorheight; hi = back.floorheight; anchorSec = back; anchorPlane = PLANE_FLOOR;
    } else return false;
    let z0 = z - hh, z1 = z + hh;
    let v0 = 0, v1 = info.height;
    if (z1 > hi) { v0 += (z1 - hi) / scale; z1 = hi; }
    if (z0 < lo) { v1 -= (lo - z0) / scale; z0 = lo; }
    if (z1 - z0 < 1) return false;
    const base = anchorPlane === PLANE_FLOOR ? anchorSec.floorheight : anchorSec.ceilingheight;
    // Nudge off the wall toward the viewer side.
    const nx = side === 0 ? uy : -uy;
    const ny = side === 0 ? -ux : ux;
    const off = 0.35;
    const ax = line.v1.x + ux * t0 + nx * off, ay = line.v1.y + uy * t0 + ny * off;
    const bx = line.v1.x + ux * t1 + nx * off, by = line.v1.y + uy * t1 + ny * off;
    // Corners in order so the quad faces the viewer side.
    const flip = side === 1;
    const A = flip ? [bx, by, u1] : [ax, ay, u0];
    const B = flip ? [ax, ay, u0] : [bx, by, u1];
    this.push({
      image, light: front.index, contrast: line.dy === 0 ? -1 : (line.dx === 0 ? 1 : 0), flat: false,
      verts: [
        [A[0], A[1], anchorSec.index, anchorPlane, z0 - base, A[2], v1],
        [B[0], B[1], anchorSec.index, anchorPlane, z0 - base, B[2], v1],
        [B[0], B[1], anchorSec.index, anchorPlane, z1 - base, B[2], v0],
        [A[0], A[1], anchorSec.index, anchorPlane, z1 - base, A[2], v0],
      ],
    });
    return true;
  }

  // Floor or ceiling decal centred at (x, y); rejected where it would hang
  // over a ledge.
  addFlat(x, y, image, ceiling = false, scale = 1, angle = Math.random() * Math.PI * 2) {
    const w = this.w;
    const info = w.res.images[image];
    if (!info) return false;
    const sec = w.pointInSubsector(x, y).sector;
    if (ceiling && w.isSkyFlat(sec.ceilingpic)) return false;
    if (!ceiling && w.isSkyFlat(sec.floorpic)) return false;
    const h0 = ceiling ? sec.ceilingheight : sec.floorheight;
    let s = scale;
    for (let attempt = 0; attempt < 3; attempt++, s *= 0.6) {
      const hw = info.width * s / 2, hh = info.height * s / 2;
      const c = Math.cos(angle), sn = Math.sin(angle);
      const corner = (dx, dy) => [x + dx * c - dy * sn, y + dx * sn + dy * c];
      const pts = [corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh)];
      const ok = pts.every(([px, py]) => {
        const s2 = w.pointInSubsector(px, py).sector;
        return (ceiling ? s2.ceilingheight : s2.floorheight) === h0 && (s2 === sec || Math.abs(s2.lightlevel - sec.lightlevel) < 64);
      });
      if (!ok) continue;
      const plane = ceiling ? PLANE_CEIL : PLANE_FLOOR;
      const dz = ceiling ? -0.25 : 0.25;
      const uv = [[0, info.height], [info.width, info.height], [info.width, 0], [0, 0]];
      const order = ceiling ? [3, 2, 1, 0] : [0, 1, 2, 3];
      this.push({
        image, light: sec.index, contrast: 0, flat: true,
        verts: order.map((k) => [pts[k][0], pts[k][1], sec.index, plane, dz, uv[k][0], uv[k][1]]),
      });
      return true;
    }
    return false;
  }

  // Writes all decals into the renderer's decal batch.
  render(r, geo) {
    const n = this.list.length;
    if (!n) return;
    const batch = r.decalBatch;
    const base = geo.decalBase;
    for (let i = 0; i < n; i++) {
      const d = this.list[i];
      const surf = base + (i % geo.maxDecals);
      geo.surfaceTable.set(surf, d.image, 0, 0, 0);
      const o = batch.reserve(6);
      const a = batch.data;
      let p = o;
      const flags = F_DECAL | (d.flat ? F_FLATLIGHT : 0);
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const v = d.verts[k];
        a[p++] = v[0]; a[p++] = v[1];
        a[p++] = v[2]; a[p++] = v[3]; a[p++] = v[4];
        a[p++] = v[5]; a[p++] = 0; a[p++] = 0; a[p++] = v[6];
        a[p++] = surf; a[p++] = d.light; a[p++] = d.contrast; a[p++] = flags;
      }
    }
  }
}

export { pointOnLineSide, WORLD_FLOATS };
