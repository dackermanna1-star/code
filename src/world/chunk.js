// Chunk building: copies cells from zone builders into a window (chunk + margin), meshes
// architecture / props / fixtures / decals, bakes vertex light and produces collision boxes.
import { CHUNK, MARGIN, UNIT, LEVEL_H, HALF_T, DOOR_H, HALFWALL_H, PARTITION_H, RAIL_H } from '../config.js';
import { MeshBuilder, matStyle, texStyle } from './mesh.js';
import { MATS, M, VF } from './materials.js';
import { W, CF } from './zonebuilder.js';
import { bakeMesh } from './lighting.js';
import { PROPS, buildProp } from './props.js';
import { xfMul, xfTranslate, xfRotY, xfRotX } from '../core/math.js';
import { hash3 } from '../core/rng.js';

const H = LEVEL_H;
export const SURF = { carpet: 0, concrete: 1, tile: 2, wood: 3, metal: 4, lino: 5, water: 6, gel: 7, grass: 8, drywall: 9, plastic: 10, wetcarpet: 11, wet: 12, asphalt: 13, none: 255 };
export const SURF_NAMES = Object.keys(SURF);

export class CellWindow {
  constructor(X0, Z0, N) {
    this.X0 = X0; this.Z0 = Z0; this.N = N;
    const n = N * N;
    this.floor = new Float32Array(n); this.ceil = new Float32Array(n);
    this.fmat = new Uint8Array(n); this.cmat = new Uint8Array(n); this.wmat = new Uint8Array(n);
    this.solid = new Uint8Array(n); this.wallW = new Uint8Array(n); this.wallN = new Uint8Array(n);
    this.wmW = new Uint16Array(n); this.wmN = new Uint16Array(n);
    this.flags = new Uint16Array(n); this.zi = new Uint8Array(n);
    this.zones = [];
  }
  inside(x, z) { return x >= this.X0 && x < this.X0 + this.N && z >= this.Z0 && z < this.Z0 + this.N; }
  idx(x, z) { return (z - this.Z0) * this.N + (x - this.X0); }
}

export function fillWindow(world, dim, level, X0, Z0, N) {
  const win = new CellWindow(X0, Z0, N);
  const zmap = new Map();
  for (let uz = Z0; uz < Z0 + N; uz += UNIT) {
    for (let ux = X0; ux < X0 + N; ux += UNIT) {
      const zone = world.zoneAt(dim, level, ux, uz);
      const zb = world.builder(zone);
      let zi = zmap.get(zb);
      if (zi === undefined) { zi = win.zones.length; win.zones.push(zb); zmap.set(zb, zi); }
      for (let z = uz; z < uz + UNIT; z++) {
        for (let x = ux; x < ux + UNIT; x++) {
          const s = zb.i(x, z), d = win.idx(x, z);
          win.floor[d] = zb.floor[s]; win.ceil[d] = zb.ceil[s];
          win.fmat[d] = zb.fmat[s]; win.cmat[d] = zb.cmat[s]; win.wmat[d] = zb.wmat[s];
          win.solid[d] = zb.solid[s]; win.wallW[d] = zb.wallW[s]; win.wallN[d] = zb.wallN[s];
          win.wmW[d] = zb.wmW[s]; win.wmN[d] = zb.wmN[s]; win.flags[d] = zb.flags[s];
          win.zi[d] = zi;
        }
      }
    }
  }
  return win;
}

const isNum = (v) => !Number.isNaN(v);

// ------------------------------------------------------------------ chunk build
export function buildChunkData(world, dim, level, cx, cz) {
  const X0 = cx * CHUNK - MARGIN, Z0 = cz * CHUNK - MARGIN, N = CHUNK + MARGIN * 2;
  const win = fillWindow(world, dim, level, X0, Z0, N);
  const y0 = level * H;
  const ax = cx * CHUNK, az = cz * CHUNK, bx = ax + CHUNK, bz = az + CHUNK;
  const tex = world.tex;

  const arch = new MeshBuilder(8192);
  const props = new MeshBuilder(4096);
  const trans = new MeshBuilder(256);
  const boxes = [];
  const addBox = (x0, yy0, z0, x1, yy1, z1, surf = 255) => { if (x1 > x0 && yy1 > yy0 && z1 > z0) boxes.push(x0, yy0, z0, x1, yy1, z1, surf); };

  const F = (x, z) => (win.inside(x, z) ? win.floor[win.idx(x, z)] : NaN);
  const C = (x, z) => (win.inside(x, z) ? win.ceil[win.idx(x, z)] : NaN);
  const S = (x, z) => (win.inside(x, z) ? win.solid[win.idx(x, z)] : 0);
  const FL = (x, z) => (win.inside(x, z) ? win.flags[win.idx(x, z)] : CF.VOID);
  const isVoid = (x, z) => (FL(x, z) & CF.VOID) !== 0;
  const open = (x, z) => win.inside(x, z) && !S(x, z) && !isVoid(x, z);
  const surfOf = (mat) => SURF[MATS[mat] ? MATS[mat].surf : 'concrete'] ?? 1;
  const wallEdge = (x, z, side) => (win.inside(x, z) ? (side === 'W' ? win.wallW[win.idx(x, z)] : win.wallN[win.idx(x, z)]) : 0);

  // wall vertical extent for an edge (relative heights)
  function wallRange(x, z, side, type) {
    const ox = side === 'W' ? x - 1 : x, oz = side === 'W' ? z : z - 1;
    const fa = F(ox, oz), fb = F(x, z), ca = C(ox, oz), cb = C(x, z);
    let bot = Math.min(isNum(fa) ? fa : Infinity, isNum(fb) ? fb : Infinity);
    if (!Number.isFinite(bot)) bot = 0;
    let top = Math.max(isNum(ca) ? ca : -Infinity, isNum(cb) ? cb : -Infinity);
    if (!Number.isFinite(top)) top = H;
    if ((isNum(ca) && ca <= H && !isVoid(ox, oz)) || (isNum(cb) && cb <= H && !isVoid(x, z))) top = Math.min(top, H);
    if (type === W.FULL) { bot = Math.min(bot, 0); top = Math.max(top, H); }
    if (type === W.UPPER) { bot = top; top = H; }
    return [bot, top];
  }

  // ---- floors / ceilings / risers / solids
  for (let z = az; z < bz; z++) {
    for (let x = ax; x < bx; x++) {
      const i = win.idx(x, z);
      if (win.flags[i] & CF.VOID) continue;
      const f = win.floor[i], c = win.ceil[i];
      if (win.solid[i]) {
        const st = matStyle(win.solid[i]);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (!open(nx, nz)) continue;
          const nf = F(nx, nz), nc = C(nx, nz);
          const bot = isNum(nf) ? Math.min(nf, isNum(f) ? f : nf) : (isNum(f) ? f : 0);
          let top = isNum(nc) ? nc : (isNum(c) ? c : H);
          if (isNum(c) && isNum(nc) && c > nc && c > H) top = c;
          faceOnEdge(arch, x, z, dx, dz, y0 + bot, y0 + top, st, true);
        }
        continue;
      }
      const flg = win.flags[i];
      // floor
      if (isNum(f) && !(flg & CF.STAIRS)) {
        const st = matStyle(win.fmat[i]);
        const base = arch.grid(x, y0 + f, z + 1, 1, 0, 0, 0, 0, -1, 1, 1, [0, 1, 0], st, 'world', st.su, st.sv);
        nudgeCellQuad(arch, base, x, z, true);
      }
      // ceiling (missing tiles become a dark recess into the plenum)
      if (isNum(c) && (flg & CF.HOLE_CEIL)) {
        const dk = { layer: tex.dark, flags: 0, lit: false, color: [0.18, 0.17, 0.16], flk: [0, 0, 0] };
        const yb = y0 + c, yt = y0 + c + 0.7;
        arch.grid(x + 1, yt, z + 1, -1, 0, 0, 0, 0, -1, 1, 1, [0, -1, 0], dk, [0, 0, 1, 1]);
        arch.grid(x, yb, z, 0, 0, 1, 0, 0.7, 0, 1, 1, [1, 0, 0], dk, [0, 0, 1, 1]);
        arch.grid(x + 1, yb, z + 1, 0, 0, -1, 0, 0.7, 0, 1, 1, [-1, 0, 0], dk, [0, 0, 1, 1]);
        arch.grid(x + 1, yb, z, -1, 0, 0, 0, 0.7, 0, 1, 1, [0, 0, 1], dk, [0, 0, 1, 1]);
        arch.grid(x, yb, z + 1, 1, 0, 0, 0, 0.7, 0, 1, 1, [0, 0, -1], dk, [0, 0, 1, 1]);
      } else if (isNum(c)) {
        const st = matStyle(win.cmat[i]);
        const base = arch.grid(x + 1, y0 + c, z + 1, -1, 0, 0, 0, 0, -1, 1, 1, [0, -1, 0], st, 'world', st.su, st.sv);
        nudgeCellQuad(arch, base, x, z, false);
      }
      // risers & soffits toward neighbours
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!win.inside(nx, nz) || S(nx, nz) || isVoid(nx, nz)) continue;
        const nf = F(nx, nz), nc = C(nx, nz);
        if (isNum(f)) {
          let low = null;
          if (isNum(nf) && nf < f - 0.001) low = nf;
          else if (!isNum(nf)) low = f - 0.3;
          if (low !== null) {
            const sm = f - low > 0.6 ? win.wmat[i] : win.fmat[i];
            faceOnEdge(arch, x, z, dx, dz, y0 + low, y0 + f, matStyle(sm), false);
          }
        }
        if (isNum(c)) {
          let high = null;
          if (isNum(nc) && nc > c + 0.001) high = c <= H ? Math.min(nc, H) : nc;
          else if (!isNum(nc)) high = c <= H ? H : c + 0.3;
          if (high !== null && high > c) faceOnEdge(arch, x, z, dx, dz, y0 + c, y0 + high, matStyle(win.wmat[i]), false);
        }
      }
    }
  }

  // emits a vertical quad on the edge of cell (x,z) toward (dx,dz), facing the neighbour
  function faceOnEdge(mb, x, z, dx, dz, ya, yb, st, isSolid) {
    if (yb - ya < 0.005) return;
    const h = yb - ya;
    const nv = Math.max(1, Math.round(h / 1.6));
    let base;
    if (dx === 1) base = mb.grid(x + 1, ya, z + 1, 0, 0, -1, 0, h, 0, 1, nv, [1, 0, 0], st, 'world', st.su, st.sv);
    else if (dx === -1) base = mb.grid(x, ya, z, 0, 0, 1, 0, h, 0, 1, nv, [-1, 0, 0], st, 'world', st.su, st.sv);
    else if (dz === 1) base = mb.grid(x, ya, z + 1, 1, 0, 0, 0, h, 0, 1, nv, [0, 0, 1], st, 'world', st.su, st.sv);
    else base = mb.grid(x + 1, ya, z, -1, 0, 0, 0, h, 0, 1, nv, [0, 0, -1], st, 'world', st.su, st.sv);
    // nudge samples slightly along the face to avoid sitting exactly on cell corners
    for (let v = base; v < mb.n; v++) {
      const px = mb.pos[v * 3], pz = mb.pos[v * 3 + 2];
      mb.setNudge(v, (x + 0.5 + dx * 0.5 - px) * 0.2 + dx * 0.05, 0, (z + 0.5 + dz * 0.5 - pz) * 0.2 + dz * 0.05);
    }
    void isSolid;
  }

  // floor/ceiling vertices at corners next to walls get nudged into their own cell (avoid light leaks)
  function nudgeCellQuad(mb, base, x, z, isFloor) {
    for (let v = base; v < base + 4; v++) {
      const px = mb.pos[v * 3], pz = mb.pos[v * 3 + 2];
      const vx = Math.round(px), vz = Math.round(pz);
      if (cornerBlocked(vx, vz)) mb.setNudge(v, (x + 0.5 - px) * 0.3, 0, (z + 0.5 - pz) * 0.3);
      // ambient-occlusion-ish darkening at wall bases / ceiling edges
      const occ = cornerOcclusion(vx, vz);
      if (occ) mb.ao[v] = isFloor ? 1 - occ * 0.16 : 1 - occ * 0.12;
    }
  }
  function cornerBlocked(vx, vz) {
    if (wallEdge(vx, vz - 1, 'W') || wallEdge(vx, vz, 'W') || wallEdge(vx - 1, vz, 'N') || wallEdge(vx, vz, 'N')) return true;
    if (S(vx - 1, vz - 1) || S(vx, vz - 1) || S(vx - 1, vz) || S(vx, vz)) return true;
    return false;
  }
  function cornerOcclusion(vx, vz) {
    let o = 0;
    const blockT = (t) => t === W.WALL || t === W.FULL || t === W.DOOR || t === W.WINDOW || t === W.HALF || t === W.PART;
    if (blockT(wallEdge(vx, vz - 1, 'W'))) o++;
    if (blockT(wallEdge(vx, vz, 'W'))) o++;
    if (blockT(wallEdge(vx - 1, vz, 'N'))) o++;
    if (blockT(wallEdge(vx, vz, 'N'))) o++;
    if (S(vx - 1, vz - 1)) o++;
    if (S(vx, vz - 1)) o++;
    if (S(vx - 1, vz)) o++;
    if (S(vx, vz)) o++;
    return Math.min(o, 3);
  }

  // ---- thin walls
  const postNeeded = (vx, vz) => {
    const n = wallEdge(vx, vz - 1, 'W'), s = wallEdge(vx, vz, 'W');
    const w = wallEdge(vx - 1, vz, 'N'), e = wallEdge(vx, vz, 'N');
    const cnt = (n ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0) + (e ? 1 : 0);
    if (!cnt) return 0;
    if (cnt === 2 && n && s && n === s) return 0;
    if (cnt === 2 && w && e && w === e) return 0;
    return cnt;
  };
  const metal = matStyle(M.metal);
  const trim = matStyle(M.wood_dark);

  for (let z = az; z < bz; z++) {
    for (let x = ax; x < bx; x++) {
      const i = win.idx(x, z);
      for (const side of ['W', 'N']) {
        const t = side === 'W' ? win.wallW[i] : win.wallN[i];
        if (!t) continue;
        const mm = side === 'W' ? win.wmW[i] : win.wmN[i];
        const matMinus = mm & 255, matPlus = mm >> 8;
        const [bot, top] = wallRange(x, z, side, t);
        const s0 = side === 'W' ? (postNeeded(x, z) ? HALF_T : 0) : (postNeeded(x, z) ? HALF_T : 0);
        const s1 = side === 'W' ? (postNeeded(x, z + 1) ? HALF_T : 0) : (postNeeded(x + 1, z) ? HALF_T : 0);
        emitWall(x, z, side, t, matMinus, matPlus, bot, top, s0, s1);
      }
      // post at the NW vertex of this cell
      const pc = postNeeded(x, z);
      if (pc) emitPost(x, z);
    }
  }

  function wallGeom(side, x, z, s0, s1, th) {
    // returns [ax0, az0, ax1, az1] footprint of the wall body
    if (side === 'W') return [x - th, z + s0, x + th, z + 1 - s1];
    return [x + s0, z - th, x + 1 - s1, z + th];
  }

  function wallSlab(side, x, z, s0, s1, th, ya, yb, matMinus, matPlus, faces) {
    // faces: bit0 minus face, bit1 plus face, bit2 top, bit3 bottom
    const [x0, z0, x1, z1] = wallGeom(side, x, z, s0, s1, th);
    const sm = matStyle(matMinus), sp = matStyle(matPlus);
    const h = yb - ya;
    if (h <= 0.001) return;
    const nv = Math.max(1, Math.round(h / 1.6));
    if (side === 'W') {
      const len = z1 - z0;
      if (faces & 1) arch.grid(x0, y0 + ya, z0, 0, 0, len, 0, h, 0, 1, nv, [-1, 0, 0], sm, 'world', sm.su, sm.sv);
      if (faces & 2) arch.grid(x1, y0 + ya, z1, 0, 0, -len, 0, h, 0, 1, nv, [1, 0, 0], sp, 'world', sp.su, sp.sv);
      if (faces & 4) arch.grid(x0, y0 + yb, z1, x1 - x0, 0, 0, 0, 0, -len, 1, 1, [0, 1, 0], sp, 'world', sp.su, sp.sv);
      if (faces & 8) arch.grid(x1, y0 + ya, z1, -(x1 - x0), 0, 0, 0, 0, -len, 1, 1, [0, -1, 0], sp, 'world', sp.su, sp.sv);
    } else {
      const len = x1 - x0;
      if (faces & 1) arch.grid(x1, y0 + ya, z0, -len, 0, 0, 0, h, 0, 1, nv, [0, 0, -1], sm, 'world', sm.su, sm.sv);
      if (faces & 2) arch.grid(x0, y0 + ya, z1, len, 0, 0, 0, h, 0, 1, nv, [0, 0, 1], sp, 'world', sp.su, sp.sv);
      if (faces & 4) arch.grid(x0, y0 + yb, z1, len, 0, 0, 0, 0, -(z1 - z0), 1, 1, [0, 1, 0], sp, 'world', sp.su, sp.sv);
      if (faces & 8) arch.grid(x1, y0 + ya, z1, -len, 0, 0, 0, 0, -(z1 - z0), 1, 1, [0, -1, 0], sp, 'world', sp.su, sp.sv);
    }
    addBox(x0, y0 + ya, z0, x1, y0 + yb, z1, 255);
  }

  function emitWall(x, z, side, t, matMinus, matPlus, bot, top, s0, s1) {
    const T = HALF_T;
    switch (t) {
      case W.WALL: case W.FULL: case W.UPPER:
        wallSlab(side, x, z, s0, s1, T, bot, top, matMinus, matPlus, 3);
        break;
      case W.DOOR: case W.ARCH: case W.LOW: case W.BIGDOOR: {
        const oh = t === W.DOOR ? DOOR_H : t === W.ARCH ? 2.6 : t === W.BIGDOOR ? 2.45 : 1.0;
        if (bot + oh < top) wallSlab(side, x, z, s0, s1, T, bot + oh, top, matMinus, matPlus, 3 | 8);
        if (t === W.DOOR) {
          // door frame trim on the head
          const [fx0, fz0, fx1, fz1] = wallGeom(side, x, z, s0, s1, T + 0.03);
          arch.box(fx0, y0 + bot + oh - 0.06, fz0, fx1, y0 + bot + oh, fz1, trim, { skip: 4 });
        }
        break;
      }
      case W.WINDOW:
        wallSlab(side, x, z, s0, s1, T, bot, bot + 1.0, matMinus, matPlus, 3 | 4);
        if (bot + DOOR_H < top) wallSlab(side, x, z, s0, s1, T, bot + DOOR_H, top, matMinus, matPlus, 3 | 8);
        windowGlass(side, x, z, s0, s1, bot + 1.0, bot + DOOR_H);
        break;
      case W.GLASS:
        windowGlass(side, x, z, s0, s1, bot, Math.min(top, bot + 2.6));
        if (bot + 2.6 < top) wallSlab(side, x, z, s0, s1, T, bot + 2.6, top, matMinus, matPlus, 3 | 8);
        { const [gx0, gz0, gx1, gz1] = wallGeom(side, x, z, s0, s1, 0.04); addBox(gx0, y0 + bot, gz0, gx1, y0 + top, gz1, 255); }
        break;
      case W.HALF: {
        wallSlab(side, x, z, s0, s1, T, bot, bot + HALFWALL_H, matMinus, matPlus, 3);
        const [rx0, rz0, rx1, rz1] = wallGeom(side, x, z, s0 > 0 ? s0 - 0.03 : 0, s1 > 0 ? s1 - 0.03 : 0, T + 0.04);
        arch.box(rx0, y0 + bot + HALFWALL_H, rz0, rx1, y0 + bot + HALFWALL_H + 0.06, rz1, trim, { skip: 8 });
        break;
      }
      case W.PART: {
        const pm = matMinus || M.fabric_partition, pp = matPlus || M.fabric_partition;
        wallSlab(side, x, z, s0 > 0 ? 0.04 : 0, s1 > 0 ? 0.04 : 0, 0.04, bot, bot + PARTITION_H, pm, pp, 3);
        const [rx0, rz0, rx1, rz1] = wallGeom(side, x, z, 0, 0, 0.05);
        arch.box(rx0, y0 + bot + PARTITION_H, rz0, rx1, y0 + bot + PARTITION_H + 0.04, rz1, matStyle(M.plastic_gray), { skip: 8 });
        break;
      }
      case W.RAIL: {
        const [rx0, rz0, rx1, rz1] = wallGeom(side, x, z, 0, 0, 0.03);
        arch.box(rx0, y0 + bot + RAIL_H - 0.05, rz0, rx1, y0 + bot + RAIL_H, rz1, metal);
        arch.box(rx0, y0 + bot + RAIL_H * 0.5 - 0.02, rz0, rx1, y0 + bot + RAIL_H * 0.5 + 0.02, rz1, metal);
        addBox(rx0, y0 + bot, rz0, rx1, y0 + bot + RAIL_H, rz1, 255);
        break;
      }
      default: break;
    }
  }

  function windowGlass(side, x, z, s0, s1, ya, yb) {
    const st = matStyle(M.glass, { alpha: 0.32 });
    if (side === 'W') {
      trans.grid(x, y0 + ya, z + s0, 0, 0, 1 - s0 - s1, 0, yb - ya, 0, 1, 1, [-1, 0, 0], st, [0, 0, 1, 1]);
      trans.grid(x, y0 + ya, z + 1 - s1, 0, 0, -(1 - s0 - s1), 0, yb - ya, 0, 1, 1, [1, 0, 0], st, [0, 0, 1, 1]);
    } else {
      trans.grid(x + 1 - s1, y0 + ya, z, -(1 - s0 - s1), 0, 0, 0, yb - ya, 0, 1, 1, [0, 0, -1], st, [0, 0, 1, 1]);
      trans.grid(x + s0, y0 + ya, z, 1 - s0 - s1, 0, 0, 0, yb - ya, 0, 1, 1, [0, 0, 1], st, [0, 0, 1, 1]);
    }
    const [gx0, gz0, gx1, gz1] = wallGeom(side, x, z, s0, s1, 0.04);
    addBox(gx0, y0 + ya, gz0, gx1, y0 + yb, gz1, 255);
  }

  function emitPost(vx, vz) {
    const edges = [[vx, vz - 1, 'W'], [vx, vz, 'W'], [vx - 1, vz, 'N'], [vx, vz, 'N']];
    let bot = Infinity, top = -Infinity, allRail = true, allHalf = true, allPart = true, mat = 0;
    for (const [ex, ez, sd] of edges) {
      const t = wallEdge(ex, ez, sd);
      if (!t) continue;
      const [b, tp] = wallRange(ex, ez, sd, t);
      if (b < bot) bot = b;
      let h = tp;
      if (t === W.HALF) h = b + HALFWALL_H; else allHalf = false;
      if (t === W.RAIL) h = b + RAIL_H; else allRail = false;
      if (t === W.PART) h = b + PARTITION_H; else allPart = false;
      if (h > top) top = h;
      if (!mat) {
        const i = win.idx(ex, ez);
        const mm = sd === 'W' ? win.wmW[i] : win.wmN[i];
        mat = mm >> 8 || (mm & 255);
      }
    }
    if (!Number.isFinite(bot)) return;
    if (allRail) {
      arch.box(vx - 0.035, y0 + bot, vz - 0.035, vx + 0.035, y0 + top, vz + 0.035, metal, { skip: 8 });
      addBox(vx - 0.05, y0 + bot, vz - 0.05, vx + 0.05, y0 + top, vz + 0.05, 255);
      return;
    }
    if (allPart) {
      arch.box(vx - 0.05, y0 + bot, vz - 0.05, vx + 0.05, y0 + top + 0.04, vz + 0.05, matStyle(M.plastic_gray), { skip: 8 });
      addBox(vx - 0.05, y0 + bot, vz - 0.05, vx + 0.05, y0 + top, vz + 0.05, 255);
      return;
    }
    const st = matStyle(mat || M.wp_stripe);
    arch.box(vx - HALF_T, y0 + bot, vz - HALF_T, vx + HALF_T, y0 + top, vz + HALF_T, st, { skip: allHalf ? 8 : 12, sub: 1.6 });
    if (allHalf) arch.box(vx - HALF_T - 0.04, y0 + top, vz - HALF_T - 0.04, vx + HALF_T + 0.04, y0 + top + 0.06, vz + HALF_T + 0.04, trim, { skip: 8 });
    addBox(vx - HALF_T, y0 + bot, vz - HALF_T, vx + HALF_T, y0 + top, vz + HALF_T, 255);
  }

  // ---- entities from zone builders
  const chunkLights = [];
  const allLights = [];
  const emitters = [];
  const interact = [];
  const dynamics = [];
  const specials = [];
  const inChunk = (x, z) => x >= ax && x < bx && z >= az && z < bz;
  for (const zb of win.zones) {
    for (const L of zb.lights) {
      if (L.x >= X0 && L.x < X0 + N && L.z >= Z0 && L.z < Z0 + N) allLights.push(L);
      if (inChunk(L.x, L.z)) chunkLights.push({ x: L.x, y: L.y + y0, z: L.z, ch: L.ch, int: L.int });
    }
    for (const b of zb.brushes) {
      const x0 = Math.max(b.x0, ax), z0 = Math.max(b.z0, az), x1 = Math.min(b.x1, bx), z1 = Math.min(b.z1, bz);
      if (x0 >= x1 || z0 >= z1) continue;
      let skip = b.skip || 0;
      if (b.x1 > bx) skip |= 1; if (b.x0 < ax) skip |= 2; if (b.z1 > bz) skip |= 16; if (b.z0 < az) skip |= 32;
      if (b.render) {
        const target = b.alpha !== undefined ? trans : arch;
        const big = Math.max(x1 - x0, z1 - z0, b.y1 - b.y0) > 2.2;
        const mats = Array.isArray(b.mat) ? b.mat.map((m) => (m ? matStyle(m, styleExtra(b)) : null)) : matStyle(b.mat, styleExtra(b));
        target.box(x0, y0 + b.y0, z0, x1, y0 + b.y1, z1, mats, { skip, uv: b.uv, sub: b.sub || (big ? 1.6 : 0) });
      }
      if (b.collide) {
        const m0 = Array.isArray(b.mat) ? b.mat[2] || b.mat[0] : b.mat;
        addBox(x0, y0 + b.y0, z0, x1, y0 + b.y1, z1, surfOf(m0));
      }
    }
    for (const p of zb.props) {
      if (!inChunk(p.x, p.z)) continue;
      const res = buildProp(props, trans, p, y0, tex);
      if (!res) continue;
      for (const bxs of res.boxes) addBox(bxs[0], bxs[1], bxs[2], bxs[3], bxs[4], bxs[5], bxs[6] ?? 255);
      if (res.interact) interact.push(res.interact);
      if (res.emitter) emitters.push(res.emitter);
      if (res.dynamic) dynamics.push(res.dynamic);
      if (res.light) chunkLights.push(res.light);
    }
    for (const dp of zb.dynamics) {
      if (!inChunk(dp.x, dp.z)) continue;
      // built at rot 0 around its pivot; the renderer applies the animated rotation
      const mbD = new MeshBuilder(256);
      const res = buildProp(mbD, trans, { ...dp, rot: 0 }, y0, tex);
      if (!res || !mbD.n) continue;
      for (const bxs of res.boxes) {
        // collision: a square that encloses any rotation of the footprint
        const hw = Math.max(Math.abs(bxs[0] - dp.x), Math.abs(bxs[3] - dp.x), Math.abs(bxs[2] - dp.z), Math.abs(bxs[5] - dp.z)) * 0.8;
        addBox(dp.x - hw, bxs[1], dp.z - hw, dp.x + hw, bxs[4], dp.z + hw, 255);
      }
      dynamics.push({ mb: mbD, x: dp.x, y: y0 + (dp.y || 0), z: dp.z, rot: dp.rot || 0, anim: dp.anim || {} });
    }
    for (const f of zb.fixtures) if (inChunk(f.x, f.z)) emitFixture(f);
    for (const d of zb.decals) if (inChunk(d.x, d.z)) emitDecal(d);
    for (const e of zb.emitters) if (inChunk(e.x, e.z)) emitters.push({ x: e.x, y: e.y + y0, z: e.z, snd: e.snd, vol: e.vol, rad: e.rad });
    for (const s of zb.specials) if (s.x !== undefined && inChunk(s.x, s.z)) specials.push(s);
  }
  function styleExtra(b) {
    const e = {};
    if (b.flags) e.flags = (MATS[Array.isArray(b.mat) ? b.mat[0] : b.mat]?.flags || 0) | b.flags;
    if (b.tint) e.tint = b.tint;
    if (b.alpha !== undefined) e.alpha = b.alpha;
    return e;
  }

  function emitFixture(f) {
    const i = win.idx(Math.floor(f.x), Math.floor(f.z));
    const c = f.y ?? win.ceil[i];
    if (!isNum(c)) return;
    const yc = y0 + c - 0.012;
    const on = f.on;
    const lightStyle = (layer) => ({ layer, flags: VF.FULLBRIGHT, lit: false, color: [0.12, 0.12, 0.11], flk: [1.08, 1.08, 1.04], chan: f.ch || 0 });
    let w = 0.6, l = 0.6, lay = on ? tex.light_panel : tex.light_panel_off;
    if (f.kind === 'troffer') { l = 1.2; lay = on ? tex.troffer : tex.troffer_off; }
    else if (f.kind === 'tube') { w = 0.16; l = f.l || 1.2; lay = on ? tex.tube : tex.tube_off; }
    else if (f.kind === 'bulb' || f.kind === 'cage' || f.kind === 'highbay') {
      const hang = f.hang || (f.kind === 'highbay' ? 1.2 : 0.35);
      const by = yc - hang;
      const bulbSt = on ? lightStyle(tex.bulb) : matStyle(M.plastic_white);
      arch.box(f.x - 0.008, by, f.z - 0.008, f.x + 0.008, yc, f.z + 0.008, matStyle(M.plastic_black), { skip: 12 });
      if (f.kind === 'highbay') {
        // conical shade
        const sh = matStyle(M.metal_dark);
        arch.cyl(f.x, by - 0.05, f.z, 0.32, 0.3, 6, sh, 1);
        arch.cyl(f.x, by - 0.12, f.z, 0.14, 0.08, 6, bulbSt, 2);
      } else {
        arch.box(f.x - 0.06, by - 0.12, f.z - 0.06, f.x + 0.06, by, f.z + 0.06, bulbSt);
        if (f.kind === 'cage') {
          const cg = matStyle(M.metal_dark);
          arch.box(f.x - 0.09, by - 0.15, f.z - 0.09, f.x + 0.09, by - 0.14, f.z + 0.09, cg);
        }
      }
      return;
    }
    if (f.w) w = f.w;
    if (f.l && f.kind !== 'tube') l = f.l;
    let hw = w / 2, hl = l / 2;
    if (f.rot) { const t = hw; hw = hl; hl = t; }
    const st = on ? lightStyle(lay) : texStyle(lay, { lit: true });
    if (f.kind === 'tube') {
      // slightly hanging strip with a housing
      const hy = yc - 0.1;
      arch.box(f.x - hw, hy, f.z - hl, f.x + hw, yc, f.z + hl, matStyle(M.metal), { skip: 8 });
      arch.grid(f.x + hw, hy, f.z + hl, -2 * hw, 0, 0, 0, 0, -2 * hl, 1, 1, [0, -1, 0], st, f.rot ? [0, 0, 1, 1] : [0, 0, 1, 1]);
      return;
    }
    // flush panel facing down, u along x
    arch.grid(f.x + hw, yc, f.z + hl, -2 * hw, 0, 0, 0, 0, -2 * hl, 1, 1, [0, -1, 0], st, [0, 0, 1, 1]);
  }

  function emitDecal(d) {
    const layer = typeof d.tex === 'number' ? d.tex : tex[d.tex];
    if (layer === undefined) return;
    const st = d.lit ? texStyle(layer, { flags: d.flags }) : { layer, flags: VF.FULLBRIGHT | d.flags, lit: false, color: [1, 1, 1], flk: [0, 0, 0], chan: d.ch };
    if (!d.lit && d.glow) { st.color = [0.02, 0.02, 0.02]; st.flk = [d.glow, d.glow, d.glow]; }
    const o = 0.014, hw = d.w / 2, hh = d.h / 2;
    const y = y0 + d.y;
    switch (d.face) {
      case 'px': arch.grid(d.x + o, y - hh, d.z + hw, 0, 0, -d.w, 0, d.h, 0, 1, 1, [1, 0, 0], st, [0, 0, 1, 1]); break;
      case 'nx': arch.grid(d.x - o, y - hh, d.z - hw, 0, 0, d.w, 0, d.h, 0, 1, 1, [-1, 0, 0], st, [0, 0, 1, 1]); break;
      case 'pz': arch.grid(d.x - hw, y - hh, d.z + o, d.w, 0, 0, 0, d.h, 0, 1, 1, [0, 0, 1], st, [0, 0, 1, 1]); break;
      case 'nz': arch.grid(d.x + hw, y - hh, d.z - o, -d.w, 0, 0, 0, d.h, 0, 1, 1, [0, 0, -1], st, [0, 0, 1, 1]); break;
      case 'up': {
        const c = Math.cos(d.rot), s = Math.sin(d.rot);
        const rx = c * d.w, rz = s * d.w, ux = s * d.h, uz = -c * d.h;
        arch.grid(d.x - rx / 2 - ux / 2, y + o, d.z - rz / 2 - uz / 2, rx, 0, rz, ux, 0, uz, 1, 1, [0, 1, 0], st, [0, 0, 1, 1]);
        break;
      }
      case 'down': {
        const c = Math.cos(d.rot), s = Math.sin(d.rot);
        const rx = -c * d.w, rz = -s * d.w, ux = s * d.h, uz = -c * d.h;
        arch.grid(d.x - rx / 2 - ux / 2, y - o, d.z - rz / 2 - uz / 2, rx, 0, rz, ux, 0, uz, 1, 1, [0, -1, 0], st, [0, 0, 1, 1]);
        break;
      }
      default: break;
    }
  }

  // ---- collision: floors, ceilings, solids (row runs)
  for (let z = az; z < bz; z++) {
    let x = ax;
    while (x < bx) {
      const i = win.idx(x, z);
      const f = win.floor[i];
      const ok = !win.solid[i] && !(win.flags[i] & (CF.VOID | CF.STAIRS)) && isNum(f);
      if (!ok) { x++; continue; }
      const sf = surfOf(win.fmat[i]);
      let e = x + 1;
      while (e < bx) {
        const j = win.idx(e, z);
        if (win.solid[j] || (win.flags[j] & (CF.VOID | CF.STAIRS)) || win.floor[j] !== f || surfOf(win.fmat[j]) !== sf) break;
        e++;
      }
      addBox(x, y0 + f - 0.5, z, e, y0 + f, z + 1, sf);
      x = e;
    }
    x = ax;
    while (x < bx) {
      const i = win.idx(x, z);
      const c = win.ceil[i];
      const ok = !win.solid[i] && !(win.flags[i] & CF.VOID) && isNum(c);
      if (!ok) { x++; continue; }
      let e = x + 1;
      while (e < bx) {
        const j = win.idx(e, z);
        if (win.solid[j] || (win.flags[j] & CF.VOID) || win.ceil[j] !== c) break;
        e++;
      }
      addBox(x, y0 + c, z, e, y0 + c + 0.4, z + 1, 255);
      x = e;
    }
    x = ax;
    while (x < bx) {
      const i = win.idx(x, z);
      if (!win.solid[i]) { x++; continue; }
      let e = x + 1;
      while (e < bx && win.solid[win.idx(e, z)]) e++;
      let top = 0;
      for (let k = x; k < e; k++) { const c = win.ceil[win.idx(k, z)]; top = Math.max(top, isNum(c) ? c : H); }
      addBox(x, y0 - 2.5, z, e, y0 + top, z + 1, 255);
      x = e;
    }
  }

  // ---- bake
  // ambient blends across zone borders so dark and lit sections fade into each other
  const ambCell = (xi, zi) => {
    if (!win.inside(xi, zi)) return null;
    const zb = win.zones[win.zi[win.idx(xi, zi)]];
    return (zb && zb.params.ambient) || AMB_DEFAULT;
  };
  const ambOut = [0, 0, 0];
  const ambient = (px, pz) => {
    const xi = Math.floor(px), zi = Math.floor(pz);
    const c0 = ambCell(xi, zi) || AMB_DEFAULT;
    let r = 0, g = 0, b = 0, n = 0;
    for (let dz = -2; dz <= 2; dz += 2) for (let dx = -2; dx <= 2; dx += 2) {
      const c = ambCell(xi + dx, zi + dz) || c0;
      r += c[0]; g += c[1]; b += c[2]; n++;
    }
    ambOut[0] = r / n; ambOut[1] = g / n; ambOut[2] = b / n;
    return ambOut;
  };
  const ctx = { win, lights: allLights, y0, ambient, stainSeed: (hash3(dim, level, 7) & 0xffff) };
  const bA = bakeMesh(arch, ctx);
  const bP = bakeMesh(props, { ...ctx, wrap: 0.75, ambBoost: 0.35 });
  const bT = bakeMesh(trans, ctx);
  for (const dy of dynamics) {
    const b = bakeMesh(dy.mb, { ...ctx, wrap: 0.75, ambBoost: 0.35 });
    // move to pivot-local coordinates for the model matrix
    for (let v = 0; v < dy.mb.n; v++) { dy.mb.pos[v * 3] -= dy.x; dy.mb.pos[v * 3 + 1] -= dy.y; dy.mb.pos[v * 3 + 2] -= dy.z; }
    dy.packed = dy.mb.pack(b.col, b.flk);
    dy.mb = null;
  }

  // per-cell info for the chunk (footsteps fallback, zone env)
  const zoneIdx = new Uint8Array(CHUNK * CHUNK);
  const zonesUsed = [];
  const zmap = new Map();
  for (let z = az; z < bz; z++) for (let x = ax; x < bx; x++) {
    const zb = win.zones[win.zi[win.idx(x, z)]];
    let k = zmap.get(zb);
    if (k === undefined) { k = zonesUsed.length; zonesUsed.push(zb.zone); zmap.set(zb, k); }
    zoneIdx[(z - az) * CHUNK + (x - ax)] = k;
  }

  return {
    dim, level, cx, cz, y0,
    arch: arch.n ? arch.pack(bA.col, bA.flk) : null, archBounds: arch.n ? arch.bounds() : null,
    props: props.n ? props.pack(bP.col, bP.flk) : null, propBounds: props.n ? props.bounds() : null,
    trans: trans.n ? trans.pack(bT.col, bT.flk) : null,
    boxes: new Float32Array(boxes),
    lights: chunkLights, emitters, interact, dynamics, specials,
    zones: zonesUsed, zoneIdx,
    tris: (arch.ni + props.ni + trans.ni) / 3,
  };
}

const AMB_DEFAULT = [0.2, 0.19, 0.16];
