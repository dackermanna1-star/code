// Small helpers shared by the corridors / school / lobby generators.
import { W, M, facing, ceilingLight, findWallSpots, propOnWall } from './common.js';

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export function lightState(r, fail, flicker) {
  const u = r.next();
  if (u < fail) return 'off';
  if (u < fail + flicker) return r.chance(0.35) ? 'dying' : 'flicker';
  return 'on';
}

// Gate lookup: key of the edge a gate opens through (cell + outward direction).
export function gateSet(zb) {
  const s = new Set();
  for (const g of zb.gates) s.add(g.x + ',' + g.z + ',' + -g.dx + ',' + -g.dz);
  return s;
}
export function gateCellSet(zb) {
  const s = new Set();
  for (const g of zb.gates) { s.add(g.x + ',' + g.z); s.add((g.x + g.dx) + ',' + (g.z + g.dz)); }
  return s;
}

// Wall face bounding cell (x,z) on side (dx,dz), usable during gen() (borders are not written
// yet: every border edge except a gate counts as a thin wall). Returns {x, z, face, dx, dz, off}.
export function faceAt(zb, x, z, dx, dz, gates) {
  const nx = x + dx, nz = z + dz;
  let off;
  if (zb.in(nx, nz)) {
    const t = dx === -1 ? zb.getWall(x, z, 'W') : dx === 1 ? zb.getWall(nx, z, 'W') : dz === -1 ? zb.getWall(x, z, 'N') : zb.getWall(x, nz, 'N');
    if (t === W.WALL || t === W.FULL) off = 0.1;
    else if (!t && zb.solid[zb.i(nx, nz)]) off = 0;
    else return null;
  } else {
    if (gates && gates.has(x + ',' + z + ',' + dx + ',' + dz)) return null;
    off = 0.1;
  }
  const face = dx === -1 ? 'px' : dx === 1 ? 'nx' : dz === -1 ? 'pz' : 'nz';
  const px = dx === 0 ? x + 0.5 : dx < 0 ? x + off : x + 1 - off;
  const pz = dz === 0 ? z + 0.5 : dz < 0 ? z + off : z + 1 - off;
  return { x: px, z: pz, face, dx, dz, off, cx: x, cz: z };
}

export const faceKey = (x, z, dx, dz) => x + ',' + z + ',' + dx + ',' + dz;

// Decorative strips along wall runs (baseboards, wainscot, chair rails).
// cells: (x,z) => bool for cells whose walls get trims; blocked: Set of faceKeys to skip.
// specs: [{y0, y1, t, mat}] (t = thickness off the wall).
export function trimRuns(zb, cells, blocked, specs, gates) {
  if (!specs.length) return;
  const runs = new Map();
  const { x0, z0, x1, z1 } = zb;
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    if (!cells(x, z)) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (blocked && blocked.has(faceKey(x, z, dx, dz))) continue;
      const f = faceAt(zb, x, z, dx, dz, gates);
      if (!f) continue;
      const plane = dx !== 0 ? f.x : f.z;
      const k = dx + ',' + dz + ',' + plane.toFixed(2);
      let arr = runs.get(k);
      if (!arr) { arr = []; runs.set(k, arr); }
      arr.push(dx !== 0 ? z : x);
    }
  }
  for (const [k, arr] of runs) {
    const [sdx, sdz, sp] = k.split(',');
    const dx = Number(sdx), dz = Number(sdz), plane = Number(sp);
    arr.sort((a, b) => a - b);
    let s = 0;
    while (s < arr.length) {
      let e = s;
      while (e + 1 < arr.length && arr[e + 1] === arr[e] + 1) e++;
      const a = arr[s], b = arr[e] + 1;
      for (const sp2 of specs) {
        const t = sp2.t;
        // skip the face against the wall and the bottom
        if (dx !== 0) {
          const xa = dx < 0 ? plane : plane - t, xb = dx < 0 ? plane + t : plane;
          zb.box(xa, sp2.y0, a, xb, sp2.y1, b, sp2.mat, { collide: false, skip: 8 | (dx < 0 ? 2 : 1) });
        } else {
          const za = dz < 0 ? plane : plane - t, zbb = dz < 0 ? plane + t : plane;
          zb.box(a, sp2.y0, za, b, sp2.y1, zbb, sp2.mat, { collide: false, skip: 8 | (dz < 0 ? 32 : 16) });
        }
      }
      s = e + 1;
    }
  }
}

// Locked flush door on a wall face. along: offset along the wall from the face centre.
export function doorOnFace(zb, f, opts, along = 0) {
  const ax = f.dz !== 0 ? along : 0, az = f.dx !== 0 ? along : 0;
  return zb.prop('b_doorset', f.x + ax, 0, f.z + az, facing(-f.dx, -f.dz), opts);
}

// Small restroom with stalls, sinks and mirrors in rect (walls must exist).
export function restroom(zb, rm, r, opts = {}) {
  const { x0, z0, x1, z1 } = rm;
  const w = x1 - x0, d = z1 - z0;
  zb.rectFloor(x0, z0, x1, z1, 0, opts.floor || M.tile_white);
  zb.rectWallMat(x0, z0, x1, z1, M.tile_white);
  const alongX = w >= d;
  const n = Math.max(1, Math.floor(((alongX ? w : d) - 1.4) / 1.2));
  const stall = opts.stall || M.stall;
  for (let k = 0; k < n; k++) {
    const t = (alongX ? x0 : z0) + 0.5 + k * 1.2;
    if (alongX) {
      zb.box(t, 0.12, z0, t + 0.04, 1.9, z0 + 1.45, stall);
      zb.prop('toilet', t + 0.62, 0, z0 + 0.35, Math.PI);
      if (k === n - 1) zb.box(t + 1.2, 0.12, z0, t + 1.24, 1.9, z0 + 1.45, stall);
    } else {
      zb.box(x0, 0.12, t, x0 + 1.45, 1.9, t + 0.04, stall);
      zb.prop('toilet', x0 + 0.35, 0, t + 0.62, Math.PI / 2);
      if (k === n - 1) zb.box(x0, 0.12, t + 1.2, x0 + 1.45, 1.9, t + 1.24, stall);
    }
  }
  // sinks on the wall opposite the stalls
  const sinks = [];
  if (alongX) for (let x = x0 + 1; x < x1 - 1 && sinks.length < 3; x += 2) sinks.push({ x: x + 0.5, z: z1 - 0.1 - 0.0, dx: 0, dz: 1 });
  else for (let z = z0 + 1; z < z1 - 1 && sinks.length < 3; z += 2) sinks.push({ x: x1 - 0.1, z: z + 0.5, dx: 1, dz: 0 });
  for (const s of sinks) {
    const f = { x: s.x, z: s.z, dx: s.dx, dz: s.dz, face: s.dx ? 'nx' : 'nz' };
    propOnWall(zb, f, 'sink', 0, { drip: r.chance(0.3) }, 0.24);
    zb.decal(f.x - f.dx * 0.01, 1.55, f.z - f.dz * 0.01, f.face, 0.55, 0.7, 'mirror');
  }
  void findWallSpots;
  const st = opts.light || 'on';
  ceilingLight(zb, (x0 + x1) / 2, (z0 + z1) / 2, 'panel', st, { mul: 0.9, color: [0.9, 0.95, 1.0] });
}

// A free-standing row of seats/props centred on (cx, cz) along x or z.
export function rowOf(zb, n, cx, cz, step, alongX, fn) {
  for (let k = 0; k < n; k++) {
    const t = (k - (n - 1) / 2) * step;
    fn(alongX ? cx + t : cx, alongX ? cz : cz + t, k);
  }
}
