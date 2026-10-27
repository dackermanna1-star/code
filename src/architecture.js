// Turns the floor-plan grids into geometry: floors, ceilings (with holes),
// walls with two-tone paint and decay variants, window reveals, stairwells and
// the elevator shaft. Also registers the stair/shaft walkable surfaces.
import { CELL, GX0, GZ0, GW, GD, FLOORS, T, F, STYLES, VARIANTS, hash3, ci, cj } from './plan.js';

const TEX_SCALE = { floor_terrazzo: 0.5, floor_parquet: 1, boards: 1 };

function styleOf(level, g, n) {
  const t = g.type[n];
  if (t === T.STAIR) return STYLES.stair;
  if (t === T.SHAFT) return STYLES.shaft;
  const r = g.room[n];
  return r >= 0 ? level.rooms[r].style : STYLES.ward;
}

function decayOf(level, g, n) {
  const r = g.room[n];
  return r >= 0 ? level.rooms[r].decay : 0.4;
}

function variant(tex, h, chance) {
  const v = VARIANTS[tex];
  if (!v || h >= chance) return tex;
  return v[Math.floor((h / chance) * v.length) % v.length];
}

export function buildArchitecture(level, b) {
  for (const k of FLOORS) emitGrid(level, b, k);
  for (const d of level.doors) if (d.kind !== 'opening') emitCasing(b, d);
  for (const w of level.windows) emitWindow(level, b, w);
  for (const s of level.stairs) emitStair(level, b, s);
  for (const s of level.shafts) emitShaft(level, b, s);
}

function emitGrid(level, b, k) {
  const g = level.grid(k);
  const base = g.base;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let j = 0; j < GD; j++)
    for (let i = 0; i < GW; i++) {
      const n = j * GW + i;
      const t = g.type[n];
      if (t === T.OUT || t === T.SOLID) continue;
      const st = styleOf(level, g, n);
      const decay = decayOf(level, g, n);
      const x0 = GX0 + i * CELL, x1 = x0 + CELL;
      const z0 = GZ0 + j * CELL, z1 = z0 + CELL;
      const lo = g.lo[n], hi = g.hi[n];

      // ---- floor
      let hasFloor = t === T.FLOOR || t === T.DOOR || t === T.WINDOW;
      if ((t === T.STAIR || t === T.SHAFT) && g.flag[n] & F.HASFLOOR) hasFloor = true;
      if (hasFloor) {
        const y = base + lo;
        let tex = st.floor;
        if (t === T.WINDOW) tex = 'metal_painted';
        const s = TEX_SCALE[tex] ?? 1;
        b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [x0 * s, -z1 * s, x1 * s, -z1 * s, x1 * s, -z0 * s, x0 * s, -z0 * s], tex);
      }

      // ---- ceiling
      let hasCeil = t === T.FLOOR || t === T.DOOR || t === T.WINDOW;
      if ((t === T.STAIR || t === T.SHAFT) && g.flag[n] & F.HASCEIL) hasCeil = true;
      if (hasCeil) {
        const y = base + hi;
        let tex = st.ceil;
        if (t === T.DOOR) tex = st.all || st.upper;
        else if (t === T.WINDOW) tex = 'wall_paint';
        else if (g.flag[n] & F.STAIN) tex = VARIANTS[tex] ? VARIANTS[tex][0] : tex;
        else if (tex === 'ceiling_tile' && hash3(i, j, k + 50) < decay * 0.25) tex = 'ceiling_tile_stain';
        if (g.flag[n] & F.HOLE) {
          const yt = y + 0.7;
          b.quad([x0, yt, z0], [x1, yt, z0], [x1, yt, z1], [x0, yt, z1], [x0, z0, x1, z0, x1, z1, x0, z1], 'ceiling_hole');
          for (const [di, dj] of dirs) {
            const nn = (j + dj) * GW + (i + di);
            if (g.flag[nn] & F.HOLE && g.type[nn] === t) continue;
            wallFace(b, x0, z0, x1, z1, di, dj, y, yt, 'ceiling_hole', 0);
          }
        } else {
          b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [x0, z0, x1, z0, x1, z1, x0, z1], tex);
        }
      }

      // ---- walls
      for (let d = 0; d < 4; d++) {
        const [di, dj] = dirs[d];
        const ni = i + di, nj = j + dj;
        const nt = g.at(ni, nj);
        const nn = nj * GW + ni;
        if (t === T.WINDOW && nt === T.OUT) continue; // sky handled per window
        let pieces;
        if (nt === T.OUT || nt === T.SOLID || nt === T.WINDOW) {
          if (nt === T.WINDOW && t !== T.WINDOW) {
            pieces = subtract(lo, hi, g.lo[nn], g.hi[nn]);
          } else pieces = [[lo, hi]];
        } else {
          pieces = subtract(lo, hi, g.lo[nn], g.hi[nn]);
          if ((t === T.STAIR || t === T.SHAFT) && (nt === T.STAIR || nt === T.SHAFT)) pieces = [];
        }
        for (const [ya, yb] of pieces) {
          // split into 1 m rows for vertex-lighting resolution
          let y = ya;
          while (y < yb - 1e-4) {
            const ny = Math.min(yb, Math.floor(y + 1e-4) + 1);
            const row = Math.floor(y + 1e-4);
            let tex;
            if (t === T.DOOR && (nt === T.SOLID || nt === T.OUT)) tex = st.all || st.upper;
            else if (t === T.WINDOW) tex = 'wall_paint';
            else {
              tex = st.all || (y < 0.999 ? st.lower : st.upper);
              const along = dj !== 0 ? x0 : z0;
              const plane = dj !== 0 ? (dj > 0 ? z1 : z0) : di > 0 ? x1 : x0;
              const h = hash3(k * 8 + d, Math.floor(along + 1e-3), Math.round(plane * 2) * 8 + row);
              if (tex === 'wall_lower' && row === 0) tex = variant(tex, h, decay * 0.4);
              else if (tex === 'wall_paint' && row >= 2) tex = h < decay * 0.45 ? 'wall_paint_stain' : tex;
              else if (tex === 'wall_paint' && row === 1) tex = h < decay * 0.3 ? 'wall_paint_peel' : tex;
              else if (tex === 'wall_tile') tex = variant(tex, h, decay * 0.4);
            }
            wallFace(b, x0, z0, x1, z1, di, dj, base + y, base + ny, tex, base);
            y = ny;
          }
        }
      }
    }
}

// Painted steel door frame on both faces of the wall.
function emitCasing(b, d) {
  const y = d.k * 4;
  const w = 0.075, p = 0.025, h = d.h ?? 2.1;
  const tex = d.kind === 'elevator' ? 'metal_steel' : 'metal_painted';
  b.group((d.x0 + d.x1) / 2, y + 1, (d.z0 + d.z1) / 2);
  if (d.axis === 'x') {
    for (const [zf, s] of [[d.z0, -1], [d.z1, 1]]) {
      const za = Math.min(zf, zf + s * p), zb = Math.max(zf, zf + s * p);
      b.box(d.x0 - w, y, za, d.x0, y + h + w, zb, tex);
      b.box(d.x1, y, za, d.x1 + w, y + h + w, zb, tex);
      b.box(d.x0, y + h, za, d.x1, y + h + w, zb, tex);
    }
  } else {
    for (const [xf, s] of [[d.x0, -1], [d.x1, 1]]) {
      const xa = Math.min(xf, xf + s * p), xb = Math.max(xf, xf + s * p);
      b.box(xa, y, d.z0 - w, xb, y + h + w, d.z0, tex);
      b.box(xa, y, d.z1, xb, y + h + w, d.z1 + w, tex);
      b.box(xa, y + h, d.z0, xb, y + h + w, d.z1, tex);
    }
  }
  b.ungroup();
}

function subtract(alo, ahi, blo, bhi) {
  const out = [];
  if (bhi <= blo) return [[alo, ahi]];
  if (blo > alo) out.push([alo, Math.min(ahi, blo)]);
  if (bhi < ahi) out.push([Math.max(alo, bhi), ahi]);
  return out.filter(([a, c]) => c - a > 1e-3);
}

// Wall quad on the edge of cell (x0..x1, z0..z1) toward direction (di,dj), facing back into the cell.
function wallFace(b, x0, z0, x1, z1, di, dj, ya, yb, tex, base) {
  const va = ya - base, vb = yb - base;
  if (di === 1)
    b.quad([x1, ya, z0], [x1, ya, z1], [x1, yb, z1], [x1, yb, z0], [z0, va, z1, va, z1, vb, z0, vb], tex);
  else if (di === -1)
    b.quad([x0, ya, z1], [x0, ya, z0], [x0, yb, z0], [x0, yb, z1], [-z1, va, -z0, va, -z0, vb, -z1, vb], tex);
  else if (dj === 1)
    b.quad([x1, ya, z1], [x0, ya, z1], [x0, yb, z1], [x1, yb, z1], [-x1, va, -x0, va, -x0, vb, -x1, vb], tex);
  else b.quad([x0, ya, z0], [x1, ya, z0], [x1, yb, z0], [x0, yb, z0], [x0, va, x1, va, x1, vb, x0, vb], tex);
}

function emitWindow(level, b, w) {
  const base = w.k * 4;
  const y0 = base + w.lo, y1 = base + w.hi;
  const along0 = w.axis === 'x' ? w.x0 : w.z0;
  const along1 = w.axis === 'x' ? w.x1 : w.z1;
  const len = along1 - along0;
  const reps = Math.max(1, Math.round(len / 1.4));
  const glass = w.boarded ? 'window_dirty' : w.broken ? 'window_broken' : 'window_dirty';
  // Sky backdrop on the outer face of the opening
  b.emissive(0.42, 0.45, 0.5);
  if (w.axis === 'x') {
    const zo = w.nz > 0 ? w.z0 : w.z1;
    const zm = (w.z0 + w.z1) / 2;
    const sv = (y) => 0.12 + ((y - y0) / (y1 - y0)) * 0.78;
    if (w.nz > 0)
      b.quad([w.x0, y0, zo], [w.x1, y0, zo], [w.x1, y1, zo], [w.x0, y1, zo], [w.x0 / 5, sv(y0), w.x1 / 5, sv(y0), w.x1 / 5, sv(y1), w.x0 / 5, sv(y1)], 'sky_night', 1);
    else
      b.quad([w.x1, y0, zo], [w.x0, y0, zo], [w.x0, y1, zo], [w.x1, y1, zo], [-w.x1 / 5, sv(y0), -w.x0 / 5, sv(y0), -w.x0 / 5, sv(y1), -w.x1 / 5, sv(y1)], 'sky_night', 1);
    b.normalMode();
    b.quad([w.x0, y0, zm], [w.x1, y0, zm], [w.x1, y1, zm], [w.x0, y1, zm], [0, 0.01, reps, 0.01, reps, 0.99, 0, 0.99], glass, 2);
  } else {
    const xo = w.nx > 0 ? w.x0 : w.x1;
    const xm = (w.x0 + w.x1) / 2;
    const sv = (y) => 0.12 + ((y - y0) / (y1 - y0)) * 0.78;
    if (w.nx > 0)
      b.quad([xo, y0, w.z1], [xo, y0, w.z0], [xo, y1, w.z0], [xo, y1, w.z1], [-w.z1 / 5, sv(y0), -w.z0 / 5, sv(y0), -w.z0 / 5, sv(y1), -w.z1 / 5, sv(y1)], 'sky_night', 1);
    else
      b.quad([xo, y0, w.z0], [xo, y0, w.z1], [xo, y1, w.z1], [xo, y1, w.z0], [w.z0 / 5, sv(y0), w.z1 / 5, sv(y0), w.z1 / 5, sv(y1), w.z0 / 5, sv(y1)], 'sky_night', 1);
    b.normalMode();
    b.quad([xm, y0, w.z1], [xm, y0, w.z0], [xm, y1, w.z0], [xm, y1, w.z1], [0, 0.01, reps, 0.01, reps, 0.99, 0, 0.99], glass, 2);
  }
  if (w.boarded) {
    // planks nailed over the inner face
    const inner = w.axis === 'x' ? (w.nz > 0 ? w.z1 : w.z0) : w.nx > 0 ? w.x1 : w.x0;
    const n = Math.max(3, Math.round((y1 - y0) / 0.32));
    for (let i = 0; i < n; i++) {
      const yy = y0 + 0.1 + (i * (y1 - y0 - 0.2)) / (n - 1);
      const tilt = (hash3(i, w.x0 * 2, w.z0 * 2) - 0.5) * 0.12;
      const off = 0.03 + i * 0.002;
      if (w.axis === 'x') {
        b.push((w.x0 + w.x1) / 2, yy, inner + (w.nz > 0 ? off : -off), 0, 0, tilt);
        b.box(-len / 2 - 0.15, -0.09, -0.015, len / 2 + 0.15, 0.09, 0.015, 'boards');
      } else {
        b.push(inner + (w.nx > 0 ? off : -off), yy, (w.z0 + w.z1) / 2, Math.PI / 2, 0, tilt);
        b.box(-len / 2 - 0.15, -0.09, -0.015, len / 2 + 0.15, 0.09, 0.015, 'boards');
      }
      b.pop();
    }
  }
}

// ------------------------------------------------------------- stairwells
// Switchback stair inside rect x0..x1 (3.5 m), z0..z1 (6 m). Door on the south
// wall; floor landing at the south end, mid landing at the north end. Lane A
// (west) climbs north, lane B (east) climbs south.
export function defineStair(level, s) {
  const { x0, z0, x1, z1, kb, kt } = s;
  s.lA = [x0, x0 + 1.5];
  s.lB = [x1 - 1.5, x1];
  s.zMid = [z0, z0 + 1.5];
  s.zLane = [z0 + 1.5, z1 - 1.5];
  s.zLand = [z1 - 1.5, z1];
  const room = level.rooms.length;
  level.rooms.push({ id: room, k: kb, name: s.name, style: STYLES.stair, decay: 0.6, ambient: [0.03, 0.03, 0.035], ceilH: 4, surface: 'concrete', stair: true });
  s.room = room;
  for (let k = kb; k <= kt; k++) {
    const g = level.grid(k);
    g.set(x0, z0, x1, z1, T.STAIR, room);
    g.set(s.lA[1], s.zLane[0], s.lB[0], s.zLane[1], T.SOLID);
    if (k === kt) {
      g.set(x0, z0, x1, s.zMid[1], T.SOLID);
      g.set(s.lA[0], s.zLane[0], s.lA[1], s.zLane[1], T.SOLID);
    }
  }
  for (let k = kb; k <= kt; k++) {
    const y = k * 4;
    if (k > kb) level.platforms.push({ x0, z0: s.zLand[0], x1, z1, y });
    if (k < kt) {
      level.platforms.push({ x0, z0, x1, z1: s.zMid[1], y: y + 2 });
      level.ramps.push({ ramp: true, x0: s.lA[0], x1: s.lA[1], z0: s.zLane[0], z1: s.zLane[1], ya: y + 2, yb: y });
      level.ramps.push({ ramp: true, x0: s.lB[0], x1: s.lB[1], z0: s.zLane[0], z1: s.zLane[1], ya: y + 2, yb: y + 4 });
    }
  }
  // closed space under the first lane-B flight at the bottom level
  level.addCollider(s.lB[0], kb * 4, s.zLane[0], s.lB[1], kb * 4 + 1.9, s.zLane[1]);
  level.verticalZones.push({ x0: x0 - 1, z0, x1: x1 + 1, z1: z1 + 2.5, kmin: kb, kmax: kt });
  level.stairs.push(s);
  return s;
}

function emitStair(level, b, s) {
  const { x0, x1, kb, kt } = s;
  const N = 10, run = 0.3, rise = 0.2, e = 0.005;
  for (let k = kb; k <= kt; k++) {
    const y = k * 4;
    b.group((x0 + x1) / 2, y + 1, (s.zLand[0] + s.zLand[1]) / 2);
    // floor landing (bottom level uses the grid floor)
    if (k > kb) slab(b, x0, s.zLand[0], x1, s.zLand[1], y, 'n');
    if (k < kt) slab(b, x0, s.zMid[0], x1, s.zMid[1], y + 2, k > kb ? 's' : 's-top');
    b.ungroup();
    if (k >= kt) continue;
    // flight A: climbs north from zLane[1] (y) to zLane[0] (y+2)
    b.group((s.lA[0] + s.lA[1]) / 2, y + 1, (s.zLane[0] + s.zLane[1]) / 2);
    for (let i = 1; i <= N; i++) {
      const zf = s.zLane[1] - run * (i - 1);
      const zb = zf - run;
      const ty = y + rise * i;
      const ax = s.lA[0] + e, bx = s.lA[1] - e;
      b.quad([ax, ty, zf], [bx, ty, zf], [bx, ty, zb], [ax, ty, zb], [ax, 1, bx, 1, bx, 0.7, ax, 0.7], 'stair_tread');
      b.quad([ax, ty - rise, zf], [bx, ty - rise, zf], [bx, ty, zf], [ax, ty, zf], [ax, 0, bx, 0, bx, rise, ax, rise], 'floor_concrete');
    }
    if (k > kb) {
      const ax = s.lA[0] + e, bx = s.lA[1] - e;
      b.quad([bx, y - 0.25, s.zLane[1]], [ax, y - 0.25, s.zLane[1]], [ax, y + 1.75, s.zLane[0]], [bx, y + 1.75, s.zLane[0]], [0, 0, 1.5, 0, 1.5, 3.6, 0, 3.6], 'ceiling_concrete');
    }
    rail(b, s.lA[1] - 0.06, y, s.zLane[1], y + 2, s.zLane[0]);
    rail(b, s.lA[0] + 0.06, y, s.zLane[1], y + 2, s.zLane[0]);
    b.ungroup();
    // flight B: climbs south from zLane[0] (y+2) to zLane[1] (y+4)
    b.group((s.lB[0] + s.lB[1]) / 2, y + 3, (s.zLane[0] + s.zLane[1]) / 2);
    for (let i = 1; i <= N; i++) {
      const zf = s.zLane[0] + run * (i - 1);
      const zb = zf + run;
      const ty = y + 2 + rise * i;
      const ax = s.lB[0] + e, bx = s.lB[1] - e;
      b.quad([bx, ty, zf], [ax, ty, zf], [ax, ty, zb], [bx, ty, zb], [bx, 1, ax, 1, ax, 0.7, bx, 0.7], 'stair_tread');
      b.quad([bx, ty - rise, zf], [ax, ty - rise, zf], [ax, ty, zf], [bx, ty, zf], [0, 0, 1.5, 0, 1.5, rise, 0, rise], 'floor_concrete');
    }
    if (k > kb) {
      const ax = s.lB[0] + e, bx = s.lB[1] - e;
      b.quad([ax, y + 1.75, s.zLane[0]], [bx, y + 1.75, s.zLane[0]], [bx, y + 3.75, s.zLane[1]], [ax, y + 3.75, s.zLane[1]], [0, 0, 1.5, 0, 1.5, 3.6, 0, 3.6], 'ceiling_concrete');
    } else {
      // close off the space under the first lane-B flight
      b.quad([s.lB[1], y, s.zLane[1]], [s.lB[0], y, s.zLane[1]], [s.lB[0], y + 3.8, s.zLane[1]], [s.lB[1], y + 3.8, s.zLane[1]], [0, 0, 1.5, 0, 1.5, 3.8, 0, 3.8], 'wall_concrete');
    }
    rail(b, s.lB[0] + 0.06, y + 2, s.zLane[0], y + 4, s.zLane[1]);
    rail(b, s.lB[1] - 0.06, y + 2, s.zLane[0], y + 4, s.zLane[1]);
    b.ungroup();
  }
}

function slab(b, x0, z0, x1, z1, y, edge) {
  b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [x0, -z1, x1, -z1, x1, -z0, x0, -z0], 'floor_concrete');
  if (edge !== 's-top') b.quad([x0, y - 0.25, z0], [x1, y - 0.25, z0], [x1, y - 0.25, z1], [x0, y - 0.25, z1], [x0, z0, x1, z0, x1, z1, x0, z1], 'ceiling_concrete');
  if (edge === 'n') b.quad([x1, y - 0.25, z0], [x0, y - 0.25, z0], [x0, y, z0], [x1, y, z0], [0, 0, 3.5, 0, 3.5, 0.25, 0, 0.25], 'wall_concrete');
  else b.quad([x0, y - 0.25, z1], [x1, y - 0.25, z1], [x1, y, z1], [x0, y, z1], [0, 0, 3.5, 0, 3.5, 0.25, 0, 0.25], 'wall_concrete');
}

function rail(b, x, ya, za, yb, zb) {
  const h = 0.9;
  b.tube(x, ya + h, za, x, yb + h, zb, 0.025, 4, 'metal_painted');
  for (let t = 0.15; t < 1; t += 0.35) {
    const yy = ya + (yb - ya) * t;
    const zz = za + (zb - za) * t;
    b.tube(x, yy + h, zz, x, yy + h - 0.12, zz, 0.012, 3, 'metal_painted');
  }
}

// ------------------------------------------------------------- elevator shaft
export function defineShaft(level, s) {
  const { x0, z0, x1, z1, kb, kt, dx0, dx1 } = s;
  const room = level.rooms.length;
  level.rooms.push({ id: room, k: kb, name: 'ELEVATOR SHAFT', style: STYLES.shaft, decay: 0.8, ambient: [0.02, 0.02, 0.025], ceilH: 4, surface: 'concrete', shaft: true });
  s.room = room;
  for (let k = kb; k <= kt; k++) {
    const g = level.grid(k);
    g.set(x0, z0, x1, z1, T.SHAFT, room);
  }
  for (let k = kb + 1; k <= kt; k++) {
    level.platforms.push({ x0, z0: z1 - 0.5, x1, z1, y: k * 4, zone: 'concrete' });
    level.addCollider(x0, k * 4 - 0.35, z1 - 0.5, x1, k * 4 - 0.02, z1);
  }
  // ladder on the east wall, just north of the ledges
  s.ladder = { x0: x1 - 0.7, x1: x1, z0: z1 - 1.5, z1: z1 - 0.5, y0: kb * 4, y1: kt * 4 + 1.6, nx: -1, nz: 0, zc: z1 - 1.0, xw: x1 };
  level.ladders.push(s.ladder);
  // crushed car at the bottom (walkable roof)
  const car = level.addCollider(x0 + 0.1, kb * 4, z0 + 0.05, x1 - 0.1, kb * 4 + 1.35, z0 + 0.85);
  car.walkable = true;
  car.zone = 'metal';
  level.verticalZones.push({ x0: x0 - 1.5, z0: z0 - 0.5, x1: x1 + 1.5, z1: z1 + 3, kmin: kb, kmax: kt });
  level.shafts.push(s);
  return s;
}

function emitShaft(level, b, s) {
  const { x0, z0, x1, z1, kb, kt, dx0, dx1 } = s;
  for (let k = kb + 1; k <= kt; k++) {
    const y = k * 4;
    b.group((x0 + x1) / 2, y + 0.5, z1 - 0.25);
    slab(b, x0, z1 - 0.5, x1, z1, y, 'n');
    b.ungroup();
  }
  // ladder
  const L = s.ladder;
  const lx = L.xw - 0.09;
  b.group(lx, kb * 4 + 2, L.zc);
  const za = L.zc - 0.25, zb = L.zc + 0.25;
  b.box(lx - 0.025, L.y0, za - 0.025, lx + 0.025, L.y1, za + 0.025, 'metal_rust');
  b.box(lx - 0.025, L.y0, zb - 0.025, lx + 0.025, L.y1, zb + 0.025, 'metal_rust');
  b.ungroup();
  for (let y = L.y0 + 0.3; y < L.y1 - 0.05; y += 0.3) {
    b.group(lx, y, L.zc);
    b.box(lx - 0.015, y - 0.015, za, lx + 0.015, y + 0.015, zb, 'metal_rust');
    b.ungroup();
  }
  for (let y = L.y0 + 1; y < L.y1; y += 2.2) {
    b.group(lx, y, L.zc);
    b.box(lx, y - 0.03, za - 0.03, L.xw, y + 0.03, za + 0.03, 'metal_rust');
    b.box(lx, y - 0.03, zb - 0.03, L.xw, y + 0.03, zb + 0.03, 'metal_rust');
    b.ungroup();
  }
  // snapped hoist cables hanging down the shaft
  b.group((x0 + x1) / 2, kb * 4 + 4, z0 + 0.6);
  for (const [ox, oz] of [[-0.25, 0.1], [0.0, 0.15], [0.25, 0.05]]) {
    const cxp = (x0 + x1) / 2 + ox;
    b.tube(cxp, kt * 4 + 3, z0 + 0.5 + oz, cxp + 0.1, kb * 4 + 1.4, z0 + 0.6 + oz, 0.018, 3, 'rubber');
  }
  b.ungroup();
  // wrecked car at the bottom
  const yb = kb * 4;
  b.group((x0 + x1) / 2, yb + 0.7, z0 + 0.5);
  b.box(x0 + 0.1, yb, z0 + 0.05, x1 - 0.1, yb + 1.35, z0 + 0.85, { side: 'elevator_wall', top: 'metal_rust', pz: 'elevator_door' });
  b.push((x0 + x1) / 2, yb + 1.35, z0 + 0.5, 0.2, 0.15, -0.12);
  b.box(-0.9, 0, -0.4, 0.9, 0.06, 0.4, 'metal_rust');
  b.pop();
  b.push((x0 + x1) / 2 - 0.4, yb + 1.42, z0 + 0.4, 0.5);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.tube(Math.cos(a) * 0.3, 0.02 * i, Math.sin(a) * 0.3, Math.cos(a + 1) * 0.3, 0.02 * i + 0.02, Math.sin(a + 1) * 0.3, 0.02, 3, 'rubber');
  }
  b.pop();
  b.ungroup();
}
