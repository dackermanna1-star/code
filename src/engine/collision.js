// Convex-brush collision world: swept-AABB traces (Quake/GoldSrc style hull tracing
// done directly against brushes, Quake 3 CM_TraceThroughBrush algorithm) and ray casts,
// accelerated with a BVH over brush bounds.

export const DIST_EPSILON = 0.03125;

export const CONTENTS_SOLID = 1; // blocks players and bullets
export const CONTENTS_PLAYERCLIP = 2; // blocks players only
export const CONTENTS_BULLETCLIP = 4; // blocks bullets/light only (rare)
export const CONTENTS_PLAYER = 8; // other players' hulls (dynamic boxes)
export const CONTENTS_ZOMBIE = 16; // zombie hulls (zombie survival): they pass through each other
export const MASK_PLAYER = CONTENTS_SOLID | CONTENTS_PLAYERCLIP | CONTENTS_PLAYER;
export const MASK_WORLD_PLAYER = CONTENTS_SOLID | CONTENTS_PLAYERCLIP;
export const MASK_SHOT = CONTENTS_SOLID | CONTENTS_BULLETCLIP;

// A collision brush: planes (outward normals, inside when n·p <= d), AABB, contents.
// planes: Float64Array [nx,ny,nz,d, ...]. Axial bevel planes are added automatically
// so that box traces against sloped brushes behave.
export function makeCollisionBrush(planes, mins, maxs, contents, userData) {
  const list = [];
  for (const p of planes) list.push(p);
  // add axial bevels if missing
  const axes = [
    [1, 0, 0, maxs[0]], [-1, 0, 0, -mins[0]],
    [0, 1, 0, maxs[1]], [0, -1, 0, -mins[1]],
    [0, 0, 1, maxs[2]], [0, 0, -1, -mins[2]],
  ];
  for (const a of axes) {
    let found = false;
    for (const p of planes) {
      if (Math.abs(p[0] - a[0]) < 1e-6 && Math.abs(p[1] - a[1]) < 1e-6 && Math.abs(p[2] - a[2]) < 1e-6) { found = true; break; }
    }
    if (!found) list.push(a);
  }
  const arr = new Float64Array(list.length * 4);
  list.forEach((p, i) => { arr[i * 4] = p[0]; arr[i * 4 + 1] = p[1]; arr[i * 4 + 2] = p[2]; arr[i * 4 + 3] = p[3]; });
  return { planes: arr, count: list.length, mins: mins.slice(), maxs: maxs.slice(), contents, userData, check: 0 };
}

export class TraceResult {
  constructor() { this.reset(); }
  reset() {
    this.fraction = 1;
    this.startsolid = false;
    this.allsolid = false;
    this.endpos = [0, 0, 0];
    this.normal = [0, 0, 0];
    this.dist = 0;
    this.brush = null;
    return this;
  }
}

export class CollisionWorld {
  constructor(brushes) {
    this.brushes = brushes;
    this.checkCount = 0;
    this.dynamic = []; // dynamic boxes (players), tested linearly
    this._build();
    this._stack = new Int32Array(256);
  }

  _build() {
    const brushes = this.brushes;
    const n = brushes.length;
    const idx = new Int32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    const centers = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const b = brushes[i];
      centers[i * 3] = (b.mins[0] + b.maxs[0]) * 0.5;
      centers[i * 3 + 1] = (b.mins[1] + b.maxs[1]) * 0.5;
      centers[i * 3 + 2] = (b.mins[2] + b.maxs[2]) * 0.5;
    }
    // node arrays
    const nodeMin = [], nodeMax = [], nodeLeft = [], nodeRight = [], nodeStart = [], nodeCount = [];
    const build = (start, end) => {
      const id = nodeMin.length / 3;
      let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
      for (let i = start; i < end; i++) {
        const b = brushes[idx[i]];
        if (b.mins[0] < mnx) mnx = b.mins[0]; if (b.mins[1] < mny) mny = b.mins[1]; if (b.mins[2] < mnz) mnz = b.mins[2];
        if (b.maxs[0] > mxx) mxx = b.maxs[0]; if (b.maxs[1] > mxy) mxy = b.maxs[1]; if (b.maxs[2] > mxz) mxz = b.maxs[2];
      }
      nodeMin.push(mnx, mny, mnz); nodeMax.push(mxx, mxy, mxz);
      nodeLeft.push(-1); nodeRight.push(-1); nodeStart.push(start); nodeCount.push(end - start);
      if (end - start <= 4) return id;
      // split on longest axis of centroid bounds at median
      let cmn = [Infinity, Infinity, Infinity], cmx = [-Infinity, -Infinity, -Infinity];
      for (let i = start; i < end; i++) {
        for (let a = 0; a < 3; a++) {
          const c = centers[idx[i] * 3 + a];
          if (c < cmn[a]) cmn[a] = c; if (c > cmx[a]) cmx[a] = c;
        }
      }
      let axis = 0;
      if (cmx[1] - cmn[1] > cmx[axis] - cmn[axis]) axis = 1;
      if (cmx[2] - cmn[2] > cmx[axis] - cmn[axis]) axis = 2;
      const sub = Array.from(idx.subarray(start, end));
      sub.sort((a, b) => centers[a * 3 + axis] - centers[b * 3 + axis]);
      for (let i = 0; i < sub.length; i++) idx[start + i] = sub[i];
      const mid = (start + end) >> 1;
      const l = build(start, mid);
      const r = build(mid, end);
      nodeLeft[id] = l; nodeRight[id] = r; nodeCount[id] = 0;
      return id;
    };
    if (n > 0) build(0, n);
    this.idx = idx;
    this.nodeMin = Float64Array.from(nodeMin);
    this.nodeMax = Float64Array.from(nodeMax);
    this.nodeLeft = Int32Array.from(nodeLeft);
    this.nodeRight = Int32Array.from(nodeRight);
    this.nodeStart = Int32Array.from(nodeStart);
    this.nodeCount = Int32Array.from(nodeCount);
  }

  // Swept box trace. mins/maxs relative to the origin. mask = contents bits that block.
  trace(start, end, mins, maxs, mask = MASK_PLAYER, out = new TraceResult(), ignore = null) {
    out.reset();
    const tw = this._tw || (this._tw = { start: [0, 0, 0], end: [0, 0, 0], mins: [0, 0, 0], maxs: [0, 0, 0], ext: [0, 0, 0] });
    for (let i = 0; i < 3; i++) {
      tw.start[i] = start[i]; tw.end[i] = end[i]; tw.mins[i] = mins[i]; tw.maxs[i] = maxs[i];
    }
    const isPoint = mins[0] === 0 && mins[1] === 0 && mins[2] === 0 && maxs[0] === 0 && maxs[1] === 0 && maxs[2] === 0;
    this.checkCount++;
    if (this.nodeMin.length === 0) { out.endpos = end.slice(); return out; }

    const stack = this._stack;
    let sp = 0;
    stack[sp++] = 0;
    const dx = end[0] - start[0], dy = end[1] - start[1], dz = end[2] - start[2];
    const inv0 = 1 / dx, inv1 = 1 / dy, inv2 = 1 / dz;
    while (sp > 0) {
      const node = stack[--sp];
      // segment vs (node bbox expanded by box), clipped to current fraction
      const n3 = node * 3;
      let tmin = 0, tmax = out.fraction;
      {
        const lo = this.nodeMin[n3] - maxs[0] - 1, hi = this.nodeMax[n3] - mins[0] + 1;
        if (dx === 0) { if (start[0] < lo || start[0] > hi) continue; }
        else {
          let t1 = (lo - start[0]) * inv0, t2 = (hi - start[0]) * inv0;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
          if (tmin > tmax) continue;
        }
      }
      {
        const lo = this.nodeMin[n3 + 1] - maxs[1] - 1, hi = this.nodeMax[n3 + 1] - mins[1] + 1;
        if (dy === 0) { if (start[1] < lo || start[1] > hi) continue; }
        else {
          let t1 = (lo - start[1]) * inv1, t2 = (hi - start[1]) * inv1;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
          if (tmin > tmax) continue;
        }
      }
      {
        const lo = this.nodeMin[n3 + 2] - maxs[2] - 1, hi = this.nodeMax[n3 + 2] - mins[2] + 1;
        if (dz === 0) { if (start[2] < lo || start[2] > hi) continue; }
        else {
          let t1 = (lo - start[2]) * inv2, t2 = (hi - start[2]) * inv2;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
          if (tmin > tmax) continue;
        }
      }
      const cnt = this.nodeCount[node];
      if (cnt > 0) {
        const s = this.nodeStart[node];
        for (let i = 0; i < cnt; i++) {
          const b = this.brushes[this.idx[s + i]];
          if (!(b.contents & mask)) continue;
          if (b === ignore) continue;
          this._traceBrush(tw, b, out, isPoint);
          if (out.allsolid) { out.endpos = start.slice(); return out; }
        }
      } else {
        stack[sp++] = this.nodeLeft[node];
        stack[sp++] = this.nodeRight[node];
      }
    }
    for (let i = 0; i < this.dynamic.length; i++) {
      const b = this.dynamic[i];
      if (!b.active || !(b.contents & mask) || b === ignore) continue;
      this._traceBrush(tw, b, out, isPoint);
      if (out.allsolid) { out.endpos = start.slice(); return out; }
    }
    const f = out.fraction;
    out.endpos[0] = start[0] + dx * f;
    out.endpos[1] = start[1] + dy * f;
    out.endpos[2] = start[2] + dz * f;
    return out;
  }

  _traceBrush(tw, b, out, isPoint) {
    // quick AABB reject of the swept box
    const start = tw.start, end = tw.end, mins = tw.mins, maxs = tw.maxs;
    for (let a = 0; a < 3; a++) {
      const smin = Math.min(start[a], end[a]) + mins[a];
      const smax = Math.max(start[a], end[a]) + maxs[a];
      if (smin > b.maxs[a] + 1 || smax < b.mins[a] - 1) return;
    }
    let enterFrac = -1, leaveFrac = 1;
    let clipIdx = -1;
    let getout = false, startout = false;
    const P = b.planes;
    for (let i = 0; i < b.count; i++) {
      const o = i * 4;
      const nx = P[o], ny = P[o + 1], nz = P[o + 2];
      let dist = P[o + 3];
      if (!isPoint) {
        // push plane out by the box corner most "behind" the plane
        dist -= (nx < 0 ? maxs[0] : mins[0]) * nx + (ny < 0 ? maxs[1] : mins[1]) * ny + (nz < 0 ? maxs[2] : mins[2]) * nz;
      }
      const d1 = start[0] * nx + start[1] * ny + start[2] * nz - dist;
      const d2 = end[0] * nx + end[1] * ny + end[2] * nz - dist;
      if (d2 > 0) getout = true;
      if (d1 > 0) startout = true;
      if (d1 > 0 && (d2 >= DIST_EPSILON || d2 >= d1)) return; // completely in front
      if (d1 <= 0 && d2 <= 0) continue;
      if (d1 > d2) {
        let f = (d1 - DIST_EPSILON) / (d1 - d2);
        if (f < 0) f = 0;
        if (f > enterFrac) { enterFrac = f; clipIdx = i; }
      } else {
        let f = (d1 + DIST_EPSILON) / (d1 - d2);
        if (f > 1) f = 1;
        if (f < leaveFrac) leaveFrac = f;
      }
    }
    if (!startout) {
      out.startsolid = true;
      if (!getout) { out.allsolid = true; out.fraction = 0; out.brush = b; }
      return;
    }
    if (enterFrac < leaveFrac && enterFrac > -1 && enterFrac < out.fraction) {
      if (enterFrac < 0) enterFrac = 0;
      out.fraction = enterFrac;
      const o = clipIdx * 4;
      out.normal[0] = P[o]; out.normal[1] = P[o + 1]; out.normal[2] = P[o + 2];
      out.dist = P[o + 3];
      out.brush = b;
    }
  }

  // Is a box at pos stuck in solid?
  testBox(pos, mins, maxs, mask = MASK_PLAYER) {
    const r = this._tr || (this._tr = new TraceResult());
    this.trace(pos, pos, mins, maxs, mask, r);
    return r.startsolid;
  }

  // Fast occlusion test for light baking: does the segment hit anything?
  occluded(start, end, mask = MASK_SHOT) {
    const r = this._tr2 || (this._tr2 = new TraceResult());
    this.trace(start, end, ZERO, ZERO, mask, r);
    return r.fraction < 1 || r.startsolid;
  }
}

const ZERO = [0, 0, 0];

// Axis-aligned dynamic box (a player's hull) whose position can be updated cheaply.
export function makeDynamicBox(userData) {
  const b = makeCollisionBrush([], [0, 0, 0], [1, 1, 1], CONTENTS_PLAYER, userData);
  b.active = false;
  return b;
}

export function setDynamicBox(b, origin, mins, maxs) {
  const P = b.planes;
  const x0 = origin[0] + mins[0], y0 = origin[1] + mins[1], z0 = origin[2] + mins[2];
  const x1 = origin[0] + maxs[0], y1 = origin[1] + maxs[1], z1 = origin[2] + maxs[2];
  // planes order from makeCollisionBrush axial bevels: +x -x +y -y +z -z
  P[3] = x1; P[7] = -x0; P[11] = y1; P[15] = -y0; P[19] = z1; P[23] = -z0;
  b.mins[0] = x0; b.mins[1] = y0; b.mins[2] = z0;
  b.maxs[0] = x1; b.maxs[1] = y1; b.maxs[2] = z1;
}
