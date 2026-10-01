// Vertical features that connect levels: switchback stairwells (normally one floor, rarely
// spanning many floors with no exits in between) and holes / light wells through floors.
// Features are scheduled on a global lattice so every level (and every zone) agrees on them;
// each zone stamps the slice of a feature that falls inside its own rectangle.
import { RNG, hash4 } from '../core/rng.js';
import { W, CF } from './zonebuilder.js';
import { M } from './materials.js';
import { ZT } from './zonetypes.js';
import { LEVEL_H } from '../config.js';

const SLOT = 64;          // lattice spacing (m)
const BLOCK = 24;         // levels per scheduling block
const SW = 4, SD = 8;     // stairwell footprint (local cells) before rotation

// local -> world for a footprint at (ox, oz) with rotation r (0..3), local size w x d
function toWorld(f, lx, lz) {
  switch (f.rot) {
    case 0: return [f.ox + lx, f.oz + lz];
    case 1: return [f.ox + (f.d - 1 - lz), f.oz + lx];
    case 2: return [f.ox + (f.w - 1 - lx), f.oz + (f.d - 1 - lz)];
    default: return [f.ox + lz, f.oz + (f.w - 1 - lx)];
  }
}
// continuous local rect -> world AABB
function rectWorld(f, x0, z0, x1, z1) {
  const pts = [[x0, z0], [x1, z1]].map(([x, z]) => {
    switch (f.rot) {
      case 0: return [f.ox + x, f.oz + z];
      case 1: return [f.ox + (f.d - z), f.oz + x];
      case 2: return [f.ox + (f.w - x), f.oz + (f.d - z)];
      default: return [f.ox + z, f.oz + (f.w - x)];
    }
  });
  return [Math.min(pts[0][0], pts[1][0]), Math.min(pts[0][1], pts[1][1]), Math.max(pts[0][0], pts[1][0]), Math.max(pts[0][1], pts[1][1])];
}
// world size of the footprint
function worldSize(f) { return f.rot % 2 ? [f.d, f.w] : [f.w, f.d]; }

// set the wall on the edge between two adjacent local cells
function edgeBetween(zb, f, a, b, type, matA, matB) {
  const [ax, az] = toWorld(f, a[0], a[1]);
  const [bx, bz] = toWorld(f, b[0], b[1]);
  if (bx === ax + 1) zb.setWall(bx, bz, 'W', type, matA, matB);
  else if (bx === ax - 1) zb.setWall(ax, az, 'W', type, matB, matA);
  else if (bz === az + 1) zb.setWall(bx, bz, 'N', type, matA, matB);
  else if (bz === az - 1) zb.setWall(ax, az, 'N', type, matB, matA);
}

export class VerticalMap {
  constructor(world) {
    this.world = world;
    this.cache = new Map();
  }

  // all stairwells / holes for a slot within a block of levels
  slotSchedule(dim, i, j, block) {
    const key = dim + ':' + i + ':' + j + ':' + block;
    let s = this.cache.get(key);
    if (s) return s;
    s = [];
    const rng = new RNG(hash4(i, j, block, dim * 977 + 31, this.world.seed));
    let L = block * BLOCK;
    const end = L + BLOCK;
    while (L < end - 1) {
      const u = rng.next();
      if (u < 0.045 && end - L >= 5) {
        const n = Math.min(end - 1 - L, rng.int(4, 18));
        s.push(this.makeStair(dim, i, j, L, L + n, rng.fork('s' + L), true));
        L += n + 1;
      } else if (u < 0.5) {
        s.push(this.makeStair(dim, i, j, L, L + 1, rng.fork('s' + L), false));
        L += 2;
      } else if (u < 0.6) {
        s.push(this.makeHole(dim, i, j, L, L + 1, rng.fork('h' + L)));
        L += 1;
      } else if (u < 0.635 && end - L >= 4) {
        // a deep shaft through several floors
        const n = rng.int(2, Math.min(5, end - 1 - L));
        s.push(this.makeHole(dim, i, j, L, L + n, rng.fork('sh' + L), true));
        L += n;
      } else L += 1;
    }
    // validate against zone types (deterministic)
    s = s.filter((f) => this.valid(f));
    this.cache.set(key, s);
    if (this.cache.size > 4000) this.cache.clear();
    return s;
  }

  makeStair(dim, i, j, L, T, rng, long) {
    const rot = rng.int(0, 3);
    const f = { kind: 'stair', dim, L, T, long, rot, w: SW, d: SD, ox: 0, oz: 0 };
    const [ww, wd] = worldSize(f);
    f.ox = i * SLOT + rng.int(4, SLOT - ww - 4);
    f.oz = j * SLOT + rng.int(4, SLOT - wd - 4);
    f.doorTop = rng.int(0, 1);
    f.mat = rng.weighted([[M.concrete, 3], [M.cmu, 2], [M.paint_dirty, 1], [M.concrete_dark, 1]]);
    f.id = hash4(i, j, L, dim, 77);
    return f;
  }

  makeHole(dim, i, j, L, T, rng, shaft = false) {
    const w = shaft ? rng.int(3, 7) : rng.int(2, 5), d = shaft ? rng.int(3, 7) : rng.int(2, 5);
    const f = { kind: 'hole', dim, L, T, w, d, rot: 0, ox: 0, oz: 0, shaft };
    f.ox = i * SLOT + 32 + rng.int(-24, 24 - w);
    f.oz = j * SLOT + 32 + rng.int(-24, 24 - d);
    f.rails = shaft ? rng.chance(0.9) : rng.chance(0.75);
    f.id = hash4(i, j, L, dim, 99);
    return f;
  }

  valid(f) {
    const zm = this.world.zones;
    const [ww, wd] = worldSize(f);
    // keep clear of the start of the game
    if (f.dim === 0 && f.L <= 0 && f.T >= 0 && Math.hypot(f.ox + ww / 2 - 14, f.oz + wd / 2 - 30) < 26) return false;
    for (let M = f.L; M <= f.T; M++) {
      for (const [x, z] of [[f.ox - 1, f.oz - 1], [f.ox + ww, f.oz - 1], [f.ox - 1, f.oz + wd], [f.ox + ww, f.oz + wd], [f.ox + (ww >> 1), f.oz + (wd >> 1)]]) {
        const zone = zm.zoneAt(f.dim, M, x, z);
        if (zone.type === 'claimed') return false;
        const t = ZT[zone.type];
        if (!t) return false;
        if (f.kind === 'stair' && t.allowStairs === false) return false;
        if (f.kind === 'hole' && (t.allowHoles === false || t.allowStairs === false || zone.spanUp)) return false;
        if (zone.spanUp) return false;
      }
    }
    return true;
  }

  // features touching rect at level `level`
  featuresAt(dim, level, x0, z0, x1, z1) {
    const out = [];
    if (dim !== 0) return out;
    const block = Math.floor(level / BLOCK);
    for (let j = Math.floor((z0 - SLOT) / SLOT); j <= Math.floor(z1 / SLOT); j++) {
      for (let i = Math.floor((x0 - SLOT) / SLOT); i <= Math.floor(x1 / SLOT); i++) {
        for (const f of this.slotSchedule(dim, i, j, block)) {
          if (level < f.L || level > f.T) continue;
          const [ww, wd] = worldSize(f);
          if (f.ox + ww + 1 < x0 || f.ox - 1 > x1 || f.oz + wd + 1 < z0 || f.oz - 1 > z1) continue;
          out.push(f);
        }
      }
    }
    return out;
  }
}

export function applyVerticalFeatures(world, zb) {
  if (!world.vertical) world.vertical = new VerticalMap(world);
  const z = zb.zone;
  const feats = world.vertical.featuresAt(z.dim, z.level, zb.x0 - 2, zb.z0 - 2, zb.x1 + 2, zb.z1 + 2);
  for (const f of feats) {
    if (f.kind === 'stair') stampStair(zb, f, z.level);
    else stampHole(zb, f, z.level);
  }
}

// ------------------------------------------------------------------ stairwell
function stampStair(zb, f, lev) {
  const [ww, wd] = worldSize(f);
  const wallOut = zb.params.wallMat || M_WALL;
  const mat = f.mat;
  const floorMat = M.concrete_floor;
  const top = lev === f.T, bottom = lev === f.L;
  // clear a ring around the shaft so it is always reachable
  zb.fill(f.ox - 1, f.oz - 1, f.ox + ww + 1, f.oz + wd + 1, (x, z, i) => {
    zb.solid[i] = 0;
    if (Number.isNaN(zb.floor[i])) zb.floor[i] = 0;
    if (Number.isNaN(zb.ceil[i]) || zb.ceil[i] < 2.4) zb.ceil[i] = Math.max(2.6, zb.params.ceilH || 3);
    zb.flags[i] &= ~(CF.VOID | CF.HOLE_CEIL);
    zb.flags[i] |= CF.NOPROPS;
  });
  // ring cells: remove internal thin walls so the door is approachable
  for (let x = f.ox - 1; x <= f.ox + ww + 1; x++) for (let z = f.oz - 1; z <= f.oz + wd + 1; z++) {
    const inFoot = x >= f.ox && x < f.ox + ww && z >= f.oz && z < f.oz + wd;
    if (inFoot) continue;
    const onZoneBorderW = x === zb.x0, onZoneBorderN = z === zb.z0;
    if (!onZoneBorderW && !(x === f.ox + ww && z >= f.oz && z < f.oz + wd)) zb.setWall(x, z, 'W', W.NONE);
    if (!onZoneBorderN && !(z === f.oz + wd && x >= f.ox && x < f.ox + ww)) zb.setWall(x, z, 'N', W.NONE);
  }
  zb.clearEntities(f.ox - 1, f.oz - 1, f.ox + ww + 1, f.oz + wd + 1);
  const cell = (lx, lz, fn) => { const [x, z] = toWorld(f, lx, lz); if (zb.in(x, z)) fn(x, z, zb.i(x, z)); };
  // base state of every footprint cell
  for (let lz = 0; lz < SD; lz++) for (let lx = 0; lx < SW; lx++) {
    cell(lx, lz, (x, z, i) => {
      zb.solid[i] = 0; zb.fmat[i] = floorMat; zb.cmat[i] = M.concrete; zb.wmat[i] = mat;
      zb.flags[i] = (zb.flags[i] & ~(CF.VOID | CF.HOLE_CEIL | CF.STAIRS)) | CF.KEEP | CF.NOPROPS;
      zb.wallW[i] = 0; zb.wallN[i] = 0;
      zb.floor[i] = NaN; zb.ceil[i] = NaN;
    });
  }
  // perimeter walls (full level height) and the spine between the two flights
  for (let lx = 0; lx < SW; lx++) {
    edgeBetween(zb, f, [lx, -1], [lx, 0], W.FULL, wallOut, mat);
    edgeBetween(zb, f, [lx, SD - 1], [lx, SD], W.FULL, mat, wallOut);
  }
  for (let lz = 0; lz < SD; lz++) {
    edgeBetween(zb, f, [-1, lz], [0, lz], W.FULL, wallOut, mat);
    edgeBetween(zb, f, [SW - 1, lz], [SW, lz], W.FULL, mat, wallOut);
  }
  for (let lz = 2; lz < SD; lz++) edgeBetween(zb, f, [1, lz], [2, lz], W.FULL, mat, mat);
  const yTop = 3.0; // ceiling of the top landing
  const box = (x0, y0, z0, x1, y1, z1, m, opts) => { const r = rectWorld(f, x0, z0, x1, z1); zb.box(r[0], y0, r[1], r[2], y1, r[3], m, opts); };
  if (!top) {
    // flight A (west half), rising toward local -z from 0 to 3
    const steps = 17, run = 5;
    for (let k = 0; k < steps; k++) {
      const z1 = 7 - (k * run) / steps, z0 = 7 - ((k + 1) * run) / steps;
      box(0.1, 0, z0, 1.9, ((k + 1) * 3) / steps, z1, mat, { sub: 0 });
    }
    // mid landing (local z 0..2) at +3, a solid block so its underside reads from below
    box(0.1, 0, 0.1, 3.9, 3, 2, mat, { sub: 0 });
    // flight B (east half), rising toward local +z from 3 to 6
    for (let k = 0; k < steps; k++) {
      const z0 = 2 + (k * run) / steps, z1 = 2 + ((k + 1) * run) / steps;
      box(2.1, 0, z0, 3.9, 3 + ((k + 1) * 3) / steps, z1, mat, { sub: 0 });
    }
    for (let lz = 0; lz < 7; lz++) for (let lx = 0; lx < SW; lx++) cell(lx, lz, (x, z, i) => { zb.flags[i] |= CF.STAIRS; zb.floor[i] = 0; });
    // landing row (local z = 7)
    cell(0, 7, (x, z, i) => { zb.floor[i] = 0; zb.ceil[i] = 5.75; });
    cell(1, 7, (x, z, i) => { zb.floor[i] = 0; zb.ceil[i] = 5.75; });
    if (bottom) {
      cell(2, 7, (x, z, i) => { zb.floor[i] = 0; zb.ceil[i] = 5.75; zb.solid[i] = mat; });
      cell(3, 7, (x, z, i) => { zb.floor[i] = 0; zb.ceil[i] = 5.75; zb.solid[i] = mat; });
    } else {
      cell(2, 7, (x, z, i) => { zb.floor[i] = 0; zb.ceil[i] = 5.75; });
      cell(3, 7, (x, z, i) => { zb.floor[i] = 0; zb.ceil[i] = 5.75; });
      box(2.1, 5.75, 7, 3.9, 5.99, 8, mat, { sub: 0, skip: 4 });
    }
    // lights: one over the landing, one at the mid landing
    lampOnWall(zb, f, 1, 7.6, 2.35);
    lampOnWall(zb, f, 2, 0.4, 5.3);
  } else {
    // top slice: landing row at 0, open shaft elsewhere, ceiling over everything
    for (let lz = 0; lz < SD; lz++) for (let lx = 0; lx < SW; lx++) cell(lx, lz, (x, z, i) => { zb.ceil[i] = yTop; });
    for (let lx = 0; lx < SW; lx++) cell(lx, 7, (x, z, i) => { zb.floor[i] = 0; });
    edgeBetween(zb, f, [0, 6], [0, 7], W.RAIL, mat, mat);
    edgeBetween(zb, f, [1, 6], [1, 7], W.RAIL, mat, mat);
    lampOnWall(zb, f, 2, 7.6, 2.35);
  }
  // doors
  const doorLx = top ? (f.doorTop ? 3 : 0) : 0;
  if (bottom || top) {
    edgeBetween(zb, f, [doorLx, SD - 1], [doorLx, SD], W.DOOR, mat, wallOut);
    // outside: a sign; inside: the floor number painted on the wall
    const [sx, sz] = toWorld(f, doorLx, SD);
    const [ix, iz] = toWorld(f, doorLx, SD - 1);
    const dx = sx - ix, dz = sz - iz;
    const face = dx === 1 ? 'px' : dx === -1 ? 'nx' : dz === 1 ? 'pz' : 'nz';
    const along = dz !== 0 ? [1, 0] : [0, 1];
    const wx = ix + 0.5 + dx * 0.4 + along[0] * 0.8, wz = iz + 0.5 + dz * 0.4 + along[1] * 0.8;
    zb.decal(wx + dx * 0.1, 2.0, wz + dz * 0.1, face, 0.36, 0.36, 'sign_stairs');
    // floor number inside
    const label = levelLabel(lev, f);
    const inFace = dx === 1 ? 'nx' : dx === -1 ? 'px' : dz === 1 ? 'nz' : 'pz';
    const cx = ix + 0.5 + dx * 0.39 - along[0] * 0.75, cz = iz + 0.5 + dz * 0.39 - along[1] * 0.75;
    for (let k = 0; k < label.length; k++) {
      const off = (k - (label.length - 1) / 2) * 0.32;
      zb.decal(cx + along[0] * off * (inFace === 'pz' || inFace === 'nx' ? -1 : 1), 1.75, cz + along[1] * off * (inFace === 'pz' || inFace === 'nx' ? -1 : 1), inFace, 0.3, 0.42, 'digit_' + label[k], { lit: true });
    }
  }
  // the long stairwell's in-between floors carry their number too, but have no door
  if (!bottom && !top) {
    const label = levelLabel(lev, f);
    const [ix, iz] = toWorld(f, 0, 7);
    const [ox2, oz2] = toWorld(f, 0, 8);
    const dx = ox2 - ix, dz = oz2 - iz;
    const inFace = dx === 1 ? 'nx' : dx === -1 ? 'px' : dz === 1 ? 'nz' : 'pz';
    const along = dz !== 0 ? [1, 0] : [0, 1];
    for (let k = 0; k < label.length; k++) {
      const off = (k - (label.length - 1) / 2) * 0.32;
      zb.decal(ix + 0.5 + dx * 0.39 + along[0] * off, 1.75, iz + 0.5 + dz * 0.39 + along[1] * off, inFace, 0.3, 0.42, 'digit_' + label[k], { lit: true });
    }
  }
  zb.emitter(...centerOf(f), 'drone', { vol: 0.25, rad: 9 });
}

const M_WALL = 1;

function centerOf(f) {
  const [ww, wd] = worldSize(f);
  return [f.ox + ww / 2, 1.5, f.oz + wd / 2];
}

// Floor numbers; long stairwells start lying about them.
function levelLabel(lev, f) {
  let n = lev;
  if (f.long && lev !== f.L) n = f.L + ((lev - f.L) % 3 === 0 ? 0 : 1);
  const s = n < 0 ? 'B' + Math.min(9, -n) : String(Math.min(99, n));
  return s;
}

function lampOnWall(zb, f, lx, lz, y) {
  const r = rectWorld(f, lx, lz, lx + 0.01, lz + 0.01);
  const x = r[0], z = r[1];
  zb.fixture(x, z, 'cage', true, { y: y + 0.45, hang: 0.3 });
  zb.light(x, y, z, { rad: 6.5, int: 0.75, color: [1.0, 0.86, 0.62] });
}

// ------------------------------------------------------------------ holes / light wells
function stampHole(zb, f, Mlev) {
  const lower = Mlev === f.L;
  const upper = Mlev === f.T;
  zb.clearEntities(f.ox - (lower ? 0 : 1), f.oz - (lower ? 0 : 1), f.ox + f.w + (lower ? 0 : 1), f.oz + f.d + (lower ? 0 : 1));
  zb.fill(f.ox, f.oz, f.ox + f.w, f.oz + f.d, (x, z, i) => {
    zb.solid[i] = 0;
    zb.flags[i] = (zb.flags[i] & ~(CF.HOLE_CEIL | CF.STAIRS)) | CF.KEEP | CF.NOPROPS;
    if (lower) {
      zb.ceil[i] = NaN;
      if (Number.isNaN(zb.floor[i])) zb.floor[i] = 0;
    } else {
      zb.floor[i] = NaN;
      if (!upper) zb.ceil[i] = NaN;
      // clear internal walls inside the hole
      if (x > f.ox) zb.wallW[i] = 0;
      if (z > f.oz) zb.wallN[i] = 0;
    }
  });
  if (!lower) {
    const rail = f.rails ? W.RAIL : W.NONE;
    const m = zb.params.wallMat;
    for (let x = f.ox; x < f.ox + f.w; x++) { zb.setWall(x, f.oz, 'N', rail, m, m); zb.setWall(x, f.oz + f.d, 'N', rail, m, m); }
    for (let z = f.oz; z < f.oz + f.d; z++) { zb.setWall(f.ox, z, 'W', rail, m, m); zb.setWall(f.ox + f.w, z, 'W', rail, m, m); }
    // the hole must not trap you on the far side of a wall: clear the ring of cells around it
    zb.fill(f.ox - 1, f.oz - 1, f.ox + f.w + 1, f.oz + f.d + 1, (x, z, i) => {
      const inside = x >= f.ox && x < f.ox + f.w && z >= f.oz && z < f.oz + f.d;
      if (inside) return;
      zb.solid[i] = 0;
      if (Number.isNaN(zb.floor[i])) zb.floor[i] = 0;
    });
  }
  void LEVEL_H;
}
