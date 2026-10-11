// Collision for original GoldSrc BSP maps, with the same interface as CollisionWorld
// (src/engine/collision.js): swept traces against the map's own clip hulls the way the
// engine does it (SV_RecursiveHullCheck / SV_HullForBsp), plus solid brush entities
// (func_wall, doors - rotating ones are traced in their local frame like
// SV_ClipMoveToEntity does -, breakables, buttons, pushables), ladder volumes, and the
// players' dynamic boxes.
//
// Hull choice follows SV_HullForBsp: box width <= 8 -> point hull 0 (nodes/leaves);
// <= 36 -> hull 1 (standing 32x32x72) or hull 3 (ducking 32x32x36) by height; else
// hull 2 (64x64x64). The box is traced from its centre.
//
// Surface types for impacts and footsteps come from the texture under the hit point
// (the hull 0 node walk R_RecursiveLightPoint uses), mapped like materials.txt.
import { TraceResult, CollisionWorld, CONTENTS_SOLID as MASK_SOLID_BIT, MASK_SHOT } from '../engine/collision.js';

export const BSP_CONTENTS = { EMPTY: -1, SOLID: -2, WATER: -3, SLIME: -4, LAVA: -5, SKY: -6 };
const SOLID = -2;
const DIST_EPSILON = 0.03125;
const HULL_CLIP = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]; // all GoldSrc hulls are centred on the origin

/** Texture name -> material type (CS materials.txt style, by name pattern). */
export function bspTextureMaterial(name) {
  const n = (name || '').toLowerCase().replace(/^[+-][0-9a-j]|^[!{~]/, '');
  if (/glass|window|wndw|^gl_/.test(n)) return 'glass';
  if (/grate|grid|fence/.test(n)) return 'grate';
  if (/vent|duct/.test(n)) return 'vent';
  if (/comp|monitor|tech|screen|panel/.test(n)) return 'computer';
  if (/water|slime|^waterblue/.test((name || '').toLowerCase())) return 'slosh';
  if (/metal|mtl|steel|pipe|silo|c1a1w|drkmtl|elev|babtech|tank|rail|lab1_stair/.test(n)) return 'metal';
  if (/wood|crate|cardbox|box|plank|fifties_dr|dsk|pfab|bks|trsh|shelf|chair|table|door|cch|ceil|fiftsfile|file/.test(n)) return 'wood';
  if (/grs|grass|dirt|mud|out_grnd|cac|soil|hedge/.test(n)) return 'dirt';
  if (/sand/.test(n)) return 'sand';
  if (/tile|flr|floor/.test(n)) return 'tile';
  return 'concrete';
}

export class BspCollision {
  constructor(bsp) {
    this.bsp = bsp;
    this.dynamic = [];     // players' boxes (CollisionWorld-style brushes)
    this.ents = [];        // solid brush entities { model, origin, yaw, active, ent }
    this.ladders = [];     // { mins, maxs, normalAxis }
    this.checkCount = 0;
    // flatten planes / trees into typed arrays
    const P = bsp.planes;
    this.pn = new Float64Array(P.length * 4);
    this.pt = new Int8Array(P.length);
    P.forEach((p, i) => { this.pn.set([p.n[0], p.n[1], p.n[2], p.d], i * 4); this.pt[i] = p.type; });
    this.nodePlane = Int32Array.from(bsp.nodes.map((n) => n.plane));
    this.nodeC = new Int32Array(bsp.nodes.length * 2);
    bsp.nodes.forEach((n, i) => { this.nodeC[i * 2] = n.children[0]; this.nodeC[i * 2 + 1] = n.children[1]; });
    this.clipPlane = Int32Array.from(bsp.clipnodes.map((n) => n.plane));
    this.clipC = new Int32Array(bsp.clipnodes.length * 2);
    bsp.clipnodes.forEach((n, i) => { this.clipC[i * 2] = n.children[0]; this.clipC[i * 2 + 1] = n.children[1]; });
    this.leafContents = Int32Array.from(bsp.leaves.map((l) => l.contents));
    this.world = { model: bsp.models[0], origin: [0, 0, 0], yaw: 0, active: true, ent: null };
    this._t = { fraction: 1, allsolid: true, startsolid: false, inopen: false, nx: 0, ny: 0, nz: 0, d: 0 };
    this._tw = { start: [0, 0, 0], end: [0, 0, 0], mins: [0, 0, 0], maxs: [0, 0, 0], ext: [0, 0, 0] };
  }

  /** A solid brush entity (returned handle: set .origin / .yaw / .active to move it). */
  addEntity(model, origin = [0, 0, 0], ent = null) {
    const e = { model, origin: origin.slice(), yaw: 0, active: true, ent };
    this.ents.push(e);
    return e;
  }

  addLadder(model, origin = [0, 0, 0]) {
    const mins = [model.mins[0] + origin[0], model.mins[1] + origin[1], model.mins[2] + origin[2]];
    const maxs = [model.maxs[0] + origin[0], model.maxs[1] + origin[1], model.maxs[2] + origin[2]];
    const ext = [maxs[0] - mins[0], maxs[1] - mins[1]];
    this.ladders.push({ mins, maxs, axis: ext[0] < ext[1] ? 0 : 1, center: [(mins[0] + maxs[0]) / 2, (mins[1] + maxs[1]) / 2, (mins[2] + maxs[2]) / 2] });
  }

  /** PM_Ladder: the ladder the player's hull touches, with the face normal toward him. */
  ladderAt(origin, mins, maxs) {
    for (const L of this.ladders) {
      if (origin[0] + maxs[0] < L.mins[0] || origin[0] + mins[0] > L.maxs[0]) continue;
      if (origin[1] + maxs[1] < L.mins[1] || origin[1] + mins[1] > L.maxs[1]) continue;
      if (origin[2] + maxs[2] < L.mins[2] || origin[2] + mins[2] > L.maxs[2]) continue;
      const n = [0, 0, 0];
      n[L.axis] = origin[L.axis] >= L.center[L.axis] ? 1 : -1;
      return { normal: n, ladder: L };
    }
    return null;
  }

  hullFor(mins, maxs) {
    const sx = maxs[0] - mins[0], sz = maxs[2] - mins[2];
    if (sx <= 8) return 0;
    if (sx <= 36) return sz <= 36 ? 3 : 1;
    return 2;
  }

  // ---------------------------------------------------------------- hull walk
  contents(hull, num, x, y, z) {
    const pn = this.pn, pt = this.pt;
    if (hull === 0) {
      while (num >= 0) {
        const p = this.nodePlane[num], o = p * 4, ty = pt[p];
        const d = ty < 3 ? (ty === 0 ? x : ty === 1 ? y : z) - pn[o + 3] : pn[o] * x + pn[o + 1] * y + pn[o + 2] * z - pn[o + 3];
        num = this.nodeC[num * 2 + (d < 0 ? 1 : 0)];
      }
      return this.leafContents[-1 - num];
    }
    while (num >= 0) {
      const p = this.clipPlane[num], o = p * 4, ty = pt[p];
      const d = ty < 3 ? (ty === 0 ? x : ty === 1 ? y : z) - pn[o + 3] : pn[o] * x + pn[o + 1] * y + pn[o + 2] * z - pn[o + 3];
      num = this.clipC[num * 2 + (d < 0 ? 1 : 0)];
    }
    return num;
  }

  /** World contents at a point (point hull): BSP_CONTENTS value. */
  pointContents(p) { return this.contents(0, this.bsp.models[0].headnode[0], p[0], p[1], p[2]); }

  // SV_RecursiveHullCheck
  _rec(hull, num, p1f, p2f, x1, y1, z1, x2, y2, z2) {
    const t = this._t;
    if (num < 0) {
      const c = hull === 0 ? this.leafContents[-1 - num] : num;
      if (c !== SOLID) { t.allsolid = false; if (c === -1) t.inopen = true; } else t.startsolid = true;
      return true;
    }
    const pl = hull === 0 ? this.nodePlane[num] : this.clipPlane[num];
    const C = hull === 0 ? this.nodeC : this.clipC;
    const o = pl * 4, ty = this.pt[pl], pn = this.pn;
    let t1, t2;
    if (ty < 3) { const d = pn[o + 3]; t1 = (ty === 0 ? x1 : ty === 1 ? y1 : z1) - d; t2 = (ty === 0 ? x2 : ty === 1 ? y2 : z2) - d; }
    else {
      t1 = pn[o] * x1 + pn[o + 1] * y1 + pn[o + 2] * z1 - pn[o + 3];
      t2 = pn[o] * x2 + pn[o + 1] * y2 + pn[o + 2] * z2 - pn[o + 3];
    }
    if (t1 >= 0 && t2 >= 0) return this._rec(hull, C[num * 2], p1f, p2f, x1, y1, z1, x2, y2, z2);
    if (t1 < 0 && t2 < 0) return this._rec(hull, C[num * 2 + 1], p1f, p2f, x1, y1, z1, x2, y2, z2);
    let frac = t1 < 0 ? (t1 + DIST_EPSILON) / (t1 - t2) : (t1 - DIST_EPSILON) / (t1 - t2);
    if (frac < 0) frac = 0; else if (frac > 1) frac = 1;
    let midf = p1f + (p2f - p1f) * frac;
    let mx = x1 + frac * (x2 - x1), my = y1 + frac * (y2 - y1), mz = z1 + frac * (z2 - z1);
    const side = t1 < 0 ? 1 : 0;
    if (!this._rec(hull, C[num * 2 + side], p1f, midf, x1, y1, z1, mx, my, mz)) return false;
    if (this.contents(hull, C[num * 2 + (side ^ 1)], mx, my, mz) !== SOLID) {
      return this._rec(hull, C[num * 2 + (side ^ 1)], midf, p2f, mx, my, mz, x2, y2, z2);
    }
    if (t.allsolid) return false;
    if (!side) { t.nx = pn[o]; t.ny = pn[o + 1]; t.nz = pn[o + 2]; t.d = pn[o + 3]; }
    else { t.nx = -pn[o]; t.ny = -pn[o + 1]; t.nz = -pn[o + 2]; t.d = -pn[o + 3]; }
    while (this.contents(hull, this._root, mx, my, mz) === SOLID) {
      frac -= 0.1;
      if (frac < 0) { t.fraction = midf; return false; }
      midf = p1f + (p2f - p1f) * frac;
      mx = x1 + frac * (x2 - x1); my = y1 + frac * (y2 - y1); mz = z1 + frac * (z2 - z1);
    }
    t.fraction = midf;
    return false;
  }

  /** Trace one model; returns the local trace state in this._t (normal in world frame). */
  _traceModel(m, hull, sx, sy, sz, ex, ey, ez) {
    const t = this._t;
    t.fraction = 1; t.allsolid = true; t.startsolid = false; t.inopen = false; t.nx = t.ny = t.nz = 0; t.d = 0;
    let ax = sx - m.origin[0], ay = sy - m.origin[1], az = sz - m.origin[2];
    let bx = ex - m.origin[0], by = ey - m.origin[1], bz = ez - m.origin[2];
    let c = 1, s = 0;
    if (m.yaw) {
      // into the entity's frame (rotate by -yaw about z)
      const a = -m.yaw * Math.PI / 180;
      c = Math.cos(a); s = Math.sin(a);
      const ax2 = ax * c - ay * s, ay2 = ax * s + ay * c; ax = ax2; ay = ay2;
      const bx2 = bx * c - by * s, by2 = bx * s + by * c; bx = bx2; by = by2;
    }
    this._root = m.model.headnode[hull];
    this._rec(hull, this._root, 0, 1, ax, ay, az, bx, by, bz);
    if (t.allsolid) t.startsolid = true;
    if (m.yaw && t.fraction < 1) {
      // normal back to the world frame (rotate by +yaw)
      const nx = t.nx * c + t.ny * s, ny = -t.nx * s + t.ny * c;
      t.nx = nx; t.ny = ny;
    }
    return t;
  }

  // ---------------------------------------------------------------- public
  trace(start, end, mins, maxs, mask = 0xff, out = new TraceResult(), ignore = null) {
    out.reset();
    this.checkCount++;
    out.ent = null;
    const hull = this.hullFor(mins, maxs);
    const cx = (mins[0] + maxs[0]) / 2 - HULL_CLIP[hull][0], cy = (mins[1] + maxs[1]) / 2 - HULL_CLIP[hull][1], cz = (mins[2] + maxs[2]) / 2 - HULL_CLIP[hull][2];
    const sx = start[0] + cx, sy = start[1] + cy, sz = start[2] + cz;
    const ex = end[0] + cx, ey = end[1] + cy, ez = end[2] + cz;
    let hitModel = null;
    if (mask & MASK_SOLID_BIT) {
      const models = this.ents;
      for (let i = -1; i < models.length; i++) {
        const m = i < 0 ? this.world : models[i];
        if (!m.active) continue;
        if (i >= 0 && !this._boxNear(m, sx, sy, sz, ex, ey, ez, mins, maxs)) continue;
        const t = this._traceModel(m, hull, sx, sy, sz, ex, ey, ez);
        if (t.startsolid) out.startsolid = true;
        if (t.allsolid) { out.allsolid = true; out.fraction = 0; out.endpos = start.slice(); out.ent = m.ent; this._setBrush(out, m, start, end); return out; }
        if (t.fraction < out.fraction) {
          out.fraction = t.fraction;
          out.normal = [t.nx, t.ny, t.nz];
          out.dist = t.d;
          hitModel = m;
        }
      }
    }
    // players' boxes
    if (this.dynamic.length) {
      const tw = this._tw;
      for (let i = 0; i < 3; i++) { tw.start[i] = start[i]; tw.end[i] = end[i]; tw.mins[i] = mins[i]; tw.maxs[i] = maxs[i]; }
      const isPoint = mins[0] === 0 && mins[1] === 0 && mins[2] === 0 && maxs[0] === 0 && maxs[1] === 0 && maxs[2] === 0;
      const f0 = out.fraction;
      out.brush = null;
      for (const b of this.dynamic) {
        if (!b.active || !(b.contents & mask) || b === ignore) continue;
        CollisionWorld.prototype._traceBrush.call(this, tw, b, out, isPoint);
        if (out.allsolid) { out.endpos = start.slice(); return out; }
      }
      if (out.fraction < f0) hitModel = null;
    }
    if (hitModel) { this._setBrush(out, hitModel, start, end); out.ent = hitModel.ent; }
    const f = out.fraction;
    out.endpos = [start[0] + (end[0] - start[0]) * f, start[1] + (end[1] - start[1]) * f, start[2] + (end[2] - start[2]) * f];
    return out;
  }

  /** Coarse rejection for a brush entity: segment box vs the model's bounds (rotation-safe radius). */
  _boxNear(m, sx, sy, sz, ex, ey, ez, mins, maxs) {
    const mm = m.model;
    const r = m.yaw ? Math.hypot(Math.max(Math.abs(mm.mins[0]), Math.abs(mm.maxs[0])), Math.max(Math.abs(mm.mins[1]), Math.abs(mm.maxs[1]))) : 0;
    const pad = Math.max(maxs[0] - mins[0], maxs[2] - mins[2]) + 2;
    const lo = (a, k) => (m.yaw && k < 2 ? -r : mm.mins[k]) + m.origin[k] - pad;
    const hi = (a, k) => (m.yaw && k < 2 ? r : mm.maxs[k]) + m.origin[k] + pad;
    if (Math.max(sx, ex) < lo(0, 0) || Math.min(sx, ex) > hi(0, 0)) return false;
    if (Math.max(sy, ey) < lo(0, 1) || Math.min(sy, ey) > hi(0, 1)) return false;
    if (Math.max(sz, ez) < lo(0, 2) || Math.min(sz, ez) > hi(0, 2)) return false;
    return true;
  }

  /** brush.userData.surface (lazy): material of the texture under the hit. */
  _setBrush(out, m, start, end) {
    const self = this;
    const s = start.slice(), e = end.slice(), f = out.fraction, n = out.normal.slice();
    let cached = null;
    out.brush = {
      bsp: true,
      ent: m.ent,
      userData: {
        get surface() {
          if (cached) return cached;
          const hit = [s[0] + (e[0] - s[0]) * f, s[1] + (e[1] - s[1]) * f, s[2] + (e[2] - s[2]) * f];
          cached = bspTextureMaterial(self.textureAt([hit[0] + n[0] * 2, hit[1] + n[1] * 2, hit[2] + n[2] * 2], [hit[0] - n[0] * 4, hit[1] - n[1] * 4, hit[2] - n[2] * 4], m));
          return cached;
        },
      },
    };
  }

  /** Texture name of the first surface the segment crosses (world, or a given model). */
  textureAt(a, b, m = this.world) {
    const bsp = this.bsp;
    let ax = a[0] - m.origin[0], ay = a[1] - m.origin[1], az = a[2] - m.origin[2];
    let bx = b[0] - m.origin[0], by = b[1] - m.origin[1], bz = b[2] - m.origin[2];
    if (m.yaw) {
      const r = -m.yaw * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
      [ax, ay] = [ax * c - ay * s, ax * s + ay * c];
      [bx, by] = [bx * c - by * s, bx * s + by * c];
    }
    const f = this._faceAlong(m.model.headnode[0], ax, ay, az, bx, by, bz);
    if (!f) return null;
    const mt = bsp.textures[bsp.texinfo[f.texinfo].miptex];
    return mt ? mt.name : null;
  }

  _faceAlong(node, x1, y1, z1, x2, y2, z2) {
    const bsp = this.bsp;
    if (node < 0) return null;
    const n = bsp.nodes[node], pl = bsp.planes[n.plane];
    const front = pl.n[0] * x1 + pl.n[1] * y1 + pl.n[2] * z1 - pl.d;
    const back = pl.n[0] * x2 + pl.n[1] * y2 + pl.n[2] * z2 - pl.d;
    const side = front < 0 ? 1 : 0;
    if ((back < 0 ? 1 : 0) === side) return this._faceAlong(n.children[side], x1, y1, z1, x2, y2, z2);
    const fr = front / (front - back);
    const mx = x1 + (x2 - x1) * fr, my = y1 + (y2 - y1) * fr, mz = z1 + (z2 - z1) * fr;
    const r = this._faceAlong(n.children[side], x1, y1, z1, mx, my, mz);
    if (r) return r;
    let best = null;
    for (let i = 0; i < n.numfaces; i++) {
      const f = bsp.faces[n.firstface + i];
      if (this._inFace(f, mx, my, mz)) return f;
      best = best || f;
    }
    if (best) return best;
    return this._faceAlong(n.children[side ^ 1], mx, my, mz, x2, y2, z2);
  }

  _inFace(f, x, y, z) {
    const b = this.bsp, ti = b.texinfo[f.texinfo];
    const s = x * ti.s[0] + y * ti.s[1] + z * ti.s[2] + ti.s[3];
    const t = x * ti.t[0] + y * ti.t[1] + z * ti.t[2] + ti.t[3];
    let smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity;
    for (let k = 0; k < f.numedges; k++) {
      const se = b.surfedges[f.firstedge + k];
      const vi = se >= 0 ? b.edges[se * 2] : b.edges[-se * 2 + 1];
      const vx = b.vertices[vi * 3], vy = b.vertices[vi * 3 + 1], vz = b.vertices[vi * 3 + 2];
      const ss = vx * ti.s[0] + vy * ti.s[1] + vz * ti.s[2] + ti.s[3];
      const tt = vx * ti.t[0] + vy * ti.t[1] + vz * ti.t[2] + ti.t[3];
      if (ss < smin) smin = ss; if (ss > smax) smax = ss;
      if (tt < tmin) tmin = tt; if (tt > tmax) tmax = tt;
    }
    return s >= smin && s <= smax && t >= tmin && t <= tmax;
  }

  testBox(pos, mins, maxs, mask) {
    const r = this._tr || (this._tr = new TraceResult());
    this.trace(pos, pos, mins, maxs, mask, r);
    return r.startsolid;
  }

  occluded(a, b, mask = MASK_SHOT) {
    const r = this._tr2 || (this._tr2 = new TraceResult());
    this.trace(a, b, [0, 0, 0], [0, 0, 0], mask, r);
    return r.fraction < 1 || r.startsolid;
  }
}
