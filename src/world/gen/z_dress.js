// Dressing for the maintenance tunnels: pipes, ducts, beams, stencils, panels, niches, dead ends,
// puddles, grates, drips and lights.
import { CF, M, ceilingLight, facing, propOnWall } from './common.js';
import { pipeRun, rod } from './a_common.js';
import { lightState } from './b_util.js';
import { K, DIRS, clamp, faceToward, keyOf } from './z_util.js';

// ------------------------------------------------------------------ wall faces
// Maximal runs of straight wall seen from tunnel cells. (dx, dz) points from the cells to the wall;
// o is the fixed cell coordinate of the run, [a0, a1) the covered cells along it.
function wallRuns(S, gateCells) {
  const { zb, kind, I, kAt } = S;
  const out = [];
  for (const [dx, dz] of DIRS) {
    const alongX = dz !== 0;
    const outerN = alongX ? zb.d : zb.w, innerN = alongX ? zb.w : zb.d;
    for (let o = 0; o < outerN; o++) {
      let a0 = -1;
      for (let a = 0; a <= innerN; a++) {
        const x = alongX ? zb.x0 + a : zb.x0 + o, z = alongX ? zb.z0 + o : zb.z0 + a;
        const ok = a < innerN && kind[I(x, z)] === K.TUN && zb.floor[I(x, z)] === 0 && zb.in(x + dx, z + dz) && kAt(x + dx, z + dz) === K.SOLID && !gateCells.has(x + ',' + z);
        if (ok && a0 < 0) a0 = a;
        if (!ok && a0 >= 0) {
          const A0 = alongX ? zb.x0 + a0 : zb.z0 + a0, A1 = alongX ? zb.x0 + a : zb.z0 + a;
          const co = alongX ? zb.z0 + o : zb.x0 + o;
          let ceil = 9;
          for (let t = A0; t < A1; t++) ceil = Math.min(ceil, alongX ? zb.getCeil(t, co) : zb.getCeil(co, t));
          out.push({ dx, dz, o: co, a0: A0, a1: A1, len: A1 - A0, ceil, alongX });
          a0 = -1;
        }
      }
    }
  }
  return out;
}
// point on the wall plane of run `w` at along-coordinate t, plus the normal into the corridor
function planePt(w, t) {
  if (w.dx !== 0) return [w.dx > 0 ? w.o + 1 : w.o, t];
  return [t, w.dz > 0 ? w.o + 1 : w.o];
}
// a wall-face object for the cell at along-index `t` (cell coordinate) of run w
function faceOf(w, t) {
  const [x, z] = planePt(w, t + 0.5);
  const cx = w.dx !== 0 ? w.o : t, cz = w.dx !== 0 ? t : w.o;
  return { x, z, dx: w.dx, dz: w.dz, face: faceToward(w.dx, w.dz), cx, cz };
}

// ------------------------------------------------------------------ main entry
export function dressMaintenance(S, r, rLight) {
  const { zb, p } = S;
  const gateCells = new Set();
  for (const g of zb.gates) { gateCells.add(g.x + ',' + g.z); gateCells.add((g.x + g.dx) + ',' + (g.z + g.dz)); }
  const walls = wallRuns(S, gateCells);
  S.walls = walls;
  S.used = new Set();
  beams(S, r);
  casings(S, walls, r);
  pipesAndDucts(S, walls, r);
  nicheContents(S, r);
  shaftContents(S, r);
  deadEnds(S, r);
  wallStuff(S, walls, r);
  doorSigns(S, r);
  floors(S, r);
  pitDressing(S, r);
  lights(S, rLight);
}

// ------------------------------------------------------------------ ceiling beams
function beams(S, r) {
  const { zb, kind, I, runs, kAt } = S;
  for (const run of runs) {
    if (run.dead || run.link || run.cells.length < 5) continue;
    if (!r.chance(0.55)) continue;
    const sp = r.pick([5, 6, 7]);
    const pv = DIRS[(run.di + 1) % 4];
    for (let k = r.int(2, 4); k < run.cells.length - 1; k += sp) {
      const c = run.cells[k];
      const ls = run.w === 2 ? [c, [c[0] + pv[0], c[1] + pv[1]]] : [c];
      if (ls.some(([x, z]) => kind[I(x, z)] !== K.TUN || zb.floor[I(x, z)] !== 0)) continue;
      const a = ls[0], b = ls[ls.length - 1];
      if (kAt(a[0] - pv[0], a[1] - pv[1]) !== K.SOLID || kAt(b[0] + pv[0], b[1] + pv[1]) !== K.SOLID) continue;
      const ceil = zb.ceil[I(c[0], c[1])];
      const mnx = Math.min(a[0], b[0]), mnz = Math.min(a[1], b[1]), mxx = Math.max(a[0], b[0]) + 1, mxz = Math.max(a[1], b[1]) + 1;
      const t = 0.3;
      if (run.di % 2 === 0) zb.box(c[0] + (run.di === 0 ? 0 : 1 - t), ceil - 0.3, mnz, c[0] + (run.di === 0 ? t : 1), ceil, mxz, M.concrete_dark, { collide: false, skip: 4 });
      else zb.box(mnx, ceil - 0.3, c[1] + (run.di === 1 ? 0 : 1 - t), mxx, ceil, c[1] + (run.di === 1 ? t : 1), M.concrete_dark, { collide: false, skip: 4 });
    }
  }
}

// ------------------------------------------------------------------ service casings along one wall
// A waist-high trunking box hugging a wall of a 2 m tunnel: leaves a 1.5 m gap to walk through.
function casings(S, walls, r) {
  const { zb, kAt } = S;
  for (const w of walls) {
    if (w.len < 6 || !r.chance(0.2)) continue;
    // only where the tunnel is two cells wide
    const t0 = w.a0 + 2, t1 = w.a1 - 2;
    if (t1 - t0 < 2) continue;
    let ok = true;
    for (let t = t0; t < t1 && ok; t++) {
      const cx = w.dx !== 0 ? w.o : t, cz = w.dx !== 0 ? t : w.o;
      if (kAt(cx - w.dx, cz - w.dz) !== K.TUN) ok = false;
    }
    if (!ok) continue;
    const a = r.int(t0, Math.max(t0, t1 - 3)), b = Math.min(t1, a + r.int(3, 8));
    if (b - a < 2) continue;
    const dep = 0.42, h = r.pick([0.7, 0.85, 1.0]);
    const [x0, z0] = planePt(w, a), [x1, z1] = planePt(w, b);
    const n = [-w.dx, -w.dz];
    const xs = [x0, x1, x0 + n[0] * dep, x1 + n[0] * dep], zs = [z0, z1, z0 + n[1] * dep, z1 + n[1] * dep];
    const m = r.pick([M.duct, M.concrete_dark, M.metal_dark]);
    zb.box(Math.min(...xs), 0, Math.min(...zs), Math.max(...xs), h, Math.max(...zs), [m, m, M.metal_plate, null, m, m], { sub: 1.6 });
    for (let t = a; t < b; t++) S.used.add(keyOf(w.dx !== 0 ? w.o : t, w.dx !== 0 ? t : w.o, w.dx, w.dz));
  }
}

// ------------------------------------------------------------------ pipes, ducts, valves
function pipesAndDucts(S, walls, r) {
  const { zb, p, kAt } = S;
  const pipeMats = [['pipe', 6], ['pipe_red', 2.5], ['metal_dark', 1.2]];
  for (const w of walls) {
    if (w.len < 3) continue;
    const chance = clamp(0.35 + w.len * 0.04, 0, 0.92) * p.pipes;
    if (!r.chance(chance)) continue;
    const n = [-w.dx, -w.dz];
    const ceil = w.ceil;
    // ends: solid beyond => run into the wall, open => stop at the edge
    const before = w.alongX ? [w.a0 - 1, w.o] : [w.o, w.a0 - 1], after = w.alongX ? [w.a1, w.o] : [w.o, w.a1];
    const t0 = w.a0 - (kAt(before[0], before[1]) === K.SOLID ? 0.12 : 0.0), t1 = w.a1 + (kAt(after[0], after[1]) === K.SOLID ? 0.12 : 0.0);
    if (r.chance(0.18) && w.len >= 6) {
      // a rectangular duct hugging the wall at ceiling height
      const [px0, pz0] = planePt(w, t0), [px1, pz1] = planePt(w, t1);
      const wd = 0.42, h = 0.32;
      const xs = [px0, px1, px0 + n[0] * wd, px1 + n[0] * wd], zs = [pz0, pz1, pz0 + n[1] * wd, pz1 + n[1] * wd];
      zb.box(Math.min(...xs), ceil - h, Math.min(...zs), Math.max(...xs), ceil, Math.max(...zs), M.duct, { collide: false, skip: 4 });
      continue;
    }
    const count = r.weighted([[1, 4], [2, 3.2], [3, 1.4]]);
    let y = ceil - 0.16;
    let first = true;
    const placed = [];
    for (let k = 0; k < count; k++) {
      const rad = r.pick([0.04, 0.05, 0.06, 0.075, 0.09]);
      y -= rad + (first ? 0.02 : 0.05);
      if (y < 1.78) break;
      first = false;
      const mat = r.weighted(pipeMats);
      const off = 0.07 + rad + (k === 2 ? 0.06 : 0);
      const [ax, az] = planePt(w, t0), [bx, bz] = planePt(w, t1);
      pipeRun(zb, [[ax + n[0] * off, y, az + n[1] * off], [bx + n[0] * off, y, bz + n[1] * off]], rad, mat, { seg: 2.5 });
      placed.push({ y, off, rad, mat });
      y -= rad;
    }
    // valves and gauges along the lowest pipe
    if (placed.length && r.chance(0.55) && w.len >= 3) {
      const pp = placed[placed.length - 1];
      const nv = r.int(1, Math.min(3, Math.floor(w.len / 3)));
      for (let k = 0; k < nv; k++) {
        const t = w.a0 + 1 + r.range(0, w.len - 2);
        const [vx, vz] = planePt(w, t);
        const key = keyOf(Math.floor(t), w.o, w.dx, w.dz);
        if (S.used.has(key)) continue;
        S.used.add(key);
        const type = r.chance(0.7) ? 'a_valve' : 'a_gauge';
        zb.prop(type, vx + n[0] * pp.off, pp.y, vz + n[1] * pp.off, facing(n[0], n[1]), type === 'a_valve' ? { r: r.pick([0.11, 0.13, 0.15]) } : {});
      }
    }
  }
  // pipes that cross the tunnel from wall to wall
  for (const run of S.runs) {
    if (run.dead || run.link || run.cells.length < 6) continue;
    const pv = DIRS[(run.di + 1) % 4];
    for (let k = r.int(2, 5); k < run.cells.length - 1; k += r.int(6, 11)) {
      if (!r.chance(0.28 * p.pipes)) continue;
      const c = run.cells[k];
      const ls = run.w === 2 ? [c, [c[0] + pv[0], c[1] + pv[1]]] : [c];
      if (ls.some(([x, z]) => S.kind[S.I(x, z)] !== K.TUN || zb.floor[S.I(x, z)] !== 0)) continue;
      const a = ls[0], b = ls[ls.length - 1];
      if (kAt(a[0] - pv[0], a[1] - pv[1]) !== K.SOLID || kAt(b[0] + pv[0], b[1] + pv[1]) !== K.SOLID) continue;
      const ceil = zb.ceil[S.I(c[0], c[1])];
      const rad = r.pick([0.045, 0.06, 0.075]);
      const along = run.di % 2 === 0 ? [c[0] + 0.7, 0] : [0, c[1] + 0.7];
      const ya = ceil - 0.2 - rad;
      const mat = r.pick(['pipe', 'pipe', 'pipe_red']);
      if (run.di % 2 === 0) pipeRun(zb, [[along[0], ya, Math.min(a[1], b[1]) - 0.1], [along[0], ya, Math.max(a[1], b[1]) + 1.1]], rad, mat, { seg: 2.5 });
      else pipeRun(zb, [[Math.min(a[0], b[0]) - 0.1, ya, along[1]], [Math.max(a[0], b[0]) + 1.1, ya, along[1]]], rad, mat, { seg: 2.5 });
    }
  }
}

// ------------------------------------------------------------------ niches
function nicheContents(S, r) {
  const { zb } = S;
  for (const n of S.niches) {
    const { x, z, dx, dz, type } = n;
    // back wall plane of the niche, centred
    const px = dx > 0 ? x + 1 : dx < 0 ? x : x + 0.5, pz = dz > 0 ? z + 1 : dz < 0 ? z : z + 0.5;
    const nrm = [-dx, -dz];
    const rot = facing(nrm[0], nrm[1]);
    const face = faceToward(dx, dz);
    const cx = x + 0.5, cz = z + 0.5;
    const ceil = zb.ceil[S.I(x, z)];
    S.used.add(keyOf(n.ex, n.ez, dx, dz));
    switch (type) {
      case 'door':
        zb.prop('b_doorset', px, 0, pz, rot, { tex: r.pick(['door_metal', 'door_gray']), frame: 'metal_dark', plate: false, brass: false });
        break;
      case 'valves': {
        const lat = [Math.abs(dz), Math.abs(dx)];
        const a = [px - lat[0] * 0.45 + nrm[0] * 0.12, pz - lat[1] * 0.45 + nrm[1] * 0.12], b = [px + lat[0] * 0.45 + nrm[0] * 0.12, pz + lat[1] * 0.45 + nrm[1] * 0.12];
        rod(zb, a[0], 1.25, a[1], b[0], 1.25, b[1], 0.05, 'pipe_red');
        rod(zb, a[0], 0.4, a[1], b[0], 0.4, b[1], 0.04, 'pipe');
        rod(zb, px + nrm[0] * 0.12, 0.4, pz + nrm[1] * 0.12, px + nrm[0] * 0.12, 1.25, pz + nrm[1] * 0.12, 0.04, 'pipe');
        for (const s of [-1, 1]) zb.prop('a_valve', px + lat[0] * s * 0.3 + nrm[0] * 0.12, 1.25, pz + lat[1] * s * 0.3 + nrm[1] * 0.12, rot, { r: 0.11 });
        zb.prop('a_gauge', px + nrm[0] * 0.2, 1.6, pz + nrm[1] * 0.2, rot, {});
        break;
      }
      case 'cabinet':
        if (r.chance(0.5)) zb.prop('panel_elec', px, 0, pz, rot, {});
        else zb.decal(px + nrm[0] * 0.02, 1.35, pz + nrm[1] * 0.02, face, 0.8, 0.8, 'z_controls');
        break;
      case 'ladder': {
        zb.prop('ladder', px + nrm[0] * 0.05, 0, pz + nrm[1] * 0.05, rot, { h: ceil - 0.05 });
        zb.decal(px + nrm[0] * 0.45, ceil, pz + nrm[1] * 0.45, 'down', 0.8, 0.8, 'z_hatch', { rot: dx !== 0 ? 1.57 : 0 });
        break;
      }
      case 'bucket':
        zb.prop('bucket', cx + (dz !== 0 ? 0.15 : 0), 0, cz + (dx !== 0 ? 0.15 : 0), 0, {});
        zb.prop('wet_sign', cx - (dz !== 0 ? 0.15 : 0) + nrm[0] * 0.05, 0, cz - (dx !== 0 ? 0.15 : 0) + nrm[1] * 0.05, rot, {});
        break;
      case 'vent':
        zb.decal(px + nrm[0] * 0.02, 1.4, pz + nrm[1] * 0.02, face, 0.8, 0.8, 'dec_vent');
        break;
      default:
        zb.prop('extinguisher', px, 0, pz, rot, {});
        zb.decal(px + nrm[0] * 0.02, 1.9, pz + nrm[1] * 0.02, face, 0.3, 0.3, 'sign_keepclear');
    }
  }
}

// ------------------------------------------------------------------ shafts with a ladder to a hatch
function shaftContents(S, r) {
  const { zb } = S;
  for (const sh of S.shafts) {
    const { x, z, dx, dz } = sh;
    const nrm = [-dx, -dz];
    const pv = DIRS[(sh.run.di + 1) % 4];
    const wallX = dx > 0 ? x + 1 : dx < 0 ? x : x + 0.5, wallZ = dz > 0 ? z + 1 : dz < 0 ? z : z + 0.5;
    const rot = facing(nrm[0], nrm[1]);
    const half = sh.run.w === 2 ? 0.5 : 0;
    const lx = wallX + pv[0] * half, lz = wallZ + pv[1] * half;
    zb.prop('ladder', lx + nrm[0] * 0.05, 0, lz + nrm[1] * 0.05, rot, { h: 5.3 });
    zb.decal(lx + nrm[0] * 0.5, 5.7, lz + nrm[1] * 0.5, 'down', 0.9, 0.9, 'z_hatch', { rot: dx !== 0 ? 1.57 : 0 });
    // a vertical pipe up one side wall and a bulb on a long cord
    const cx = x + 0.5 + pv[0] * half, cz = z + 0.5 + pv[1] * half;
    const sgn = r.sign(), off = sh.run.w / 2 - 0.12;
    const sx = cx + pv[0] * sgn * off, sz = cz + pv[1] * sgn * off;
    rod(zb, sx, 0, sz, sx, 5.7, sz, 0.05, 'pipe');
    ceilingLight(zb, cx, cz, 'bulb', lightState(r, 0.25, 0.1), { hang: 1.8, y: 5.7 });
  }
}

// ------------------------------------------------------------------ dead ends
function deadEnds(S, r) {
  const { zb, p, kind, I } = S;
  for (const run of S.runs) {
    if (run.dead || !run.deadEnd || run.shaft || run.link || run.cells.length < 2) continue;
    const c = run.cells[run.cells.length - 1];
    const [dx, dz] = DIRS[run.di];
    const pv = DIRS[(run.di + 1) % 4];
    const ls = run.w === 2 ? [c, [c[0] + pv[0], c[1] + pv[1]]] : [c];
    if (ls.some(([x, z]) => kind[I(x, z)] !== K.TUN)) continue;
    const bx = ls.reduce((a, q) => a + q[0] + 0.5, 0) / ls.length, bz = ls.reduce((a, q) => a + q[1] + 0.5, 0) / ls.length;
    // wall plane at the end
    const wx = dx > 0 ? Math.max(...ls.map((q) => q[0])) + 1 : dx < 0 ? Math.min(...ls.map((q) => q[0])) : bx;
    const wz = dz > 0 ? Math.max(...ls.map((q) => q[1])) + 1 : dz < 0 ? Math.min(...ls.map((q) => q[1])) : bz;
    const rot = facing(-dx, -dz);
    const face = faceToward(dx, dz);
    const type = r.weighted([['door', 3], ['bricked', 2.2], ['valve', 2.2], ['pile', 2], ['danger', 1.4]]);
    switch (type) {
      case 'door': {
        zb.prop('b_doorset', wx, 0, wz, rot, { tex: r.pick(['door_metal', 'door_gray']), frame: 'metal_dark', plate: false, brass: false });
        break;
      }
      case 'bricked':
        for (const [x, z] of ls) { const i = I(x + dx, z + dz); if (kind[i] === K.SOLID && zb.in(x + dx, z + dz)) zb.solid[i] = r.chance(0.7) ? M.cmu : M.brick; }
        break;
      case 'valve': {
        const y = clamp(zb.ceil[I(c[0], c[1])] - 0.7, 1.2, 1.6);
        zb.prop('a_valve', wx - dx * 0.1, y, wz - dz * 0.1, rot, { r: 0.15, stem: 0.1 });
        zb.decal(wx + (dz !== 0 ? 0.6 : 0), 1.2, wz + (dx !== 0 ? 0.6 : 0), face, 0.7, 0.7, 'z_sten_v12');
        break;
      }
      case 'pile':
        zb.prop(r.pick(['box_stack', 'pallet']), bx - dx * 0.5, 0, bz - dz * 0.5, r.range(0, 3), {});
        if (run.w === 2 || r.chance(0.4)) zb.prop('a_drum', bx - dx * 0.4 + pv[0] * 0.3, 0, bz - dz * 0.4 + pv[1] * 0.3, 0, {});
        break;
      default:
        zb.decal(wx + (dz !== 0 ? 0 : 0), 1.5, wz, face, 0.6, 0.7, 'a_sign_danger');
        zb.decal(wx, 0.9, wz, face, 0.8, 0.8, 'z_sten_noentry');
        break;
    }
  }
}

// ------------------------------------------------------------------ stencils, signs, stains, panels, clutter
function wallStuff(S, walls, r) {
  const { zb, p, kAt } = S;
  const total = walls.reduce((a, w) => a + w.len, 0);
  const picks = [];
  for (const w of walls) for (let k = 0; k < w.len; k++) picks.push([w, w.a0 + k]);
  r.shuffle(picks);
  const nDec = Math.min(picks.length, Math.round(total / 5));
  const decTex = [['z_sten_arrow_r', 2], ['z_sten_arrow_l', 2], ['z_sten_steam', 1.2], ['z_sten_cond', 1.2], ['z_sten_h2o', 1.2], ['z_sten_elec', 1], ['z_sten_b14', 1], ['z_sten_p3', 0.8],
    ['sign_maint', 1.2], ['a_sign_hardhat', 0.7], ['sign_watchstep', 0.6], ['sign_keepclear', 0.5], ['a_sign_danger', 0.6], ['poster_safety', 0.6], ['z_streak', 2.2], ['z_rust', 1.8], ['dec_stain', 1.2], ['dec_mold', p.wet * 2.2 + 0.2], ['dec_crack', 1.2], ['z_schematic', 0.4]];
  let used = 0, panels = 0;
  for (const [w, t] of picks) {
    if (used >= nDec) break;
    const f = faceOf(w, t);
    const key = keyOf(f.cx, f.cz, f.dx, f.dz);
    if (S.used.has(key)) continue;
    const u = r.next();
    if (u < 0.12 && panels < Math.max(2, total / 40)) {
      // electrical gear
      S.used.add(key);
      const k2 = r.next();
      if (k2 < 0.5) propOnWall(zb, f, 'panel_elec', 0, {}, 0);
      else if (k2 < 0.8) propOnWall(zb, f, 'a_breaker', 0, {}, 0);
      else zb.decal(f.x, 1.35, f.z, f.face, 0.8, 0.8, 'z_controls');
      panels++; used++;
      continue;
    }
    if (u < 0.2) {
      // floor clutter only where the tunnel is wide enough
      const wide = kAt(f.cx - f.dx, f.cz - f.dz) === K.TUN;
      if (!wide) continue;
      S.used.add(key);
      const type = r.weighted([['bucket', 2], ['a_drum', 1.5], ['traffic_cone', 1], ['wet_sign', 1], ['box', 1], ['trash_can', 1], ['cart_cleaning', 0.5], ['pallet', 0.6], ['extinguisher', 1.5]]);
      const depth = type === 'extinguisher' ? 0 : type === 'pallet' ? 0.55 : type === 'cart_cleaning' ? 0.3 : 0.3;
      propOnWall(zb, f, type, 0, {}, depth);
      used++;
      continue;
    }
    S.used.add(key);
    const tex = r.weighted(decTex);
    const big = tex === 'z_streak' || tex === 'z_rust' || tex === 'dec_stain' || tex === 'dec_mold' || tex === 'dec_crack';
    const sz = big ? r.range(1.0, 1.6) : tex.startsWith('z_sten') ? r.range(0.6, 0.9) : tex === 'z_schematic' ? 0.6 : 0.45;
    const y = big ? r.range(1.1, 1.5) : tex.startsWith('z_sten_arrow') ? r.range(0.5, 0.9) : r.range(1.2, 1.7);
    zb.decal(f.x, Math.min(y, w.ceil - sz / 2 - 0.05), f.z, f.face, sz, sz, tex);
    used++;
  }
}

// a sign beside every machine room door
function doorSigns(S, r) {
  const { zb, kind, I, kAt } = S;
  const sign = { boiler: 'a_sign_boiler', pump: 'a_sign_pump', electrical: 'a_sign_danger', tank: 'a_sign_hardhat', control: 'sign_staff', storage: 'a_sign_supply', sump: 'sign_watchstep' };
  for (const rm of S.rooms) {
    const { from, dx, dz } = rm;
    for (const s of r.shuffle([-1, 1])) {
      const cx = from.x + (dz !== 0 ? s : 0), cz = from.z + (dx !== 0 ? s : 0);
      if (!zb.in(cx, cz) || kind[I(cx, cz)] !== K.TUN || kAt(cx + dx, cz + dz) !== K.SOLID) continue;
      const px = dx > 0 ? cx + 1 : dx < 0 ? cx : cx + 0.5, pz = dz > 0 ? cz + 1 : dz < 0 ? cz : cz + 0.5;
      zb.decal(px, 1.6, pz, faceToward(dx, dz), 0.5, 0.5, sign[rm.type] || 'sign_staff');
      S.used.add(keyOf(cx, cz, dx, dz));
      break;
    }
  }
}

// ------------------------------------------------------------------ floors: puddles, grates, drains, drips
function floors(S, r) {
  const { zb, p, kind, I, runs } = S;
  const cells = [];
  for (const run of runs) {
    if (run.dead) continue;
    for (const c of run.cells) {
      const pv = DIRS[(run.di + 1) % 4];
      for (const [x, z] of run.w === 2 && !run.link ? [c, [c[0] + pv[0], c[1] + pv[1]]] : [c]) {
        if (kind[I(x, z)] === K.TUN && zb.floor[I(x, z)] === 0 && !S.keep[I(x, z)]) cells.push([x, z, run]);
      }
    }
  }
  if (!cells.length) return;
  const nP = Math.round(cells.length * (0.03 + p.wet * 0.12));
  const drips = Math.min(8, 1 + Math.round(cells.length / 140) + Math.round(p.wet * 3));
  let nd = 0;
  for (let k = 0; k < nP; k++) {
    const [x, z, run] = r.pick(cells);
    const sz = r.range(0.9, 1.9);
    zb.decal(x + r.range(0.3, 0.7), 0, z + r.range(0.3, 0.7), 'up', sz, sz, 'dec_puddle', { rot: r.range(0, 6.28) });
    zb.setFlag(x, z, CF.WET);
    if (p.wet > 0.3 && r.chance(0.5)) zb.fmat[I(x, z)] = M.concrete_wet;
    if (nd < drips && r.chance(0.45)) {
      nd++;
      zb.emitter(x + 0.5, zb.ceil[I(x, z)] - 0.25, z + 0.5, 'drip', { vol: 0.5, rad: 8 });
    }
  }
  // the pipes tick and knock somewhere in the dark
  for (let k = 0; k < Math.min(4, 1 + Math.round(cells.length / 200)); k++) {
    const [x, z] = r.pick(cells);
    zb.emitter(x + 0.5, zb.ceil[I(x, z)] - 0.2, z + 0.5, r.pick(['pipes', 'pipes', 'vent']), { vol: 0.4, rad: 9 });
  }
  // grate sections over a drain channel
  for (let g = 0; g < r.int(0, 2); g++) {
    const run = r.pick(runs.filter((q) => !q.dead && !q.link && q.cells.length >= 6));
    if (!run) break;
    const k0 = r.int(1, run.cells.length - 4), len = r.int(2, 4);
    const pv = DIRS[(run.di + 1) % 4];
    for (let k = k0; k < k0 + len && k < run.cells.length; k++) {
      const c = run.cells[k];
      for (const [x, z] of run.w === 2 ? [c, [c[0] + pv[0], c[1] + pv[1]]] : [c]) if (kind[I(x, z)] === K.TUN && zb.floor[I(x, z)] === 0) zb.fmat[I(x, z)] = M.grate;
    }
  }
  // drains and manhole covers
  const nDr = Math.round(cells.length / 60);
  for (let k = 0; k < nDr; k++) {
    const [x, z] = r.pick(cells);
    if (r.chance(0.6)) zb.decal(x + 0.5, 0, z + 0.5, 'up', 0.7, 0.7, 'z_drain', { rot: r.pick([0, 1.57]) });
    else zb.decal(x + 0.5, 0, z + 0.5, 'up', 1.1, 1.1, 'z_manhole', { rot: r.range(0, 6.28) });
  }
}

// ------------------------------------------------------------------ sunken stretches
function pitDressing(S, r) {
  const { zb, p, I } = S;
  for (const pit of S.pits) {
    const { run, k0, k1, depth, lanes } = pit;
    const flooded = p.style === 'flooded' || r.chance(0.35);
    for (let k = k0 + 3; k < k1 - 3; k++) for (const [x, z] of lanes(run.cells[k])) {
      if (flooded) { zb.fmat[I(x, z)] = M.water_black; }
      else if (r.chance(0.35)) zb.decal(x + 0.5, -depth, z + 0.5, 'up', r.range(0.9, 1.5), r.range(0.9, 1.5), 'dec_puddle', { rot: r.range(0, 6) });
    }
    const mid = run.cells[Math.floor((k0 + k1) / 2)];
    zb.emitter(mid[0] + 0.5, -depth + 0.5, mid[1] + 0.5, flooded ? 'water' : 'drip', { vol: 0.5, rad: 9 });
    // lamps hung low over the sunken part so the water and the stairs can be seen
    const nl = Math.max(1, Math.round((k1 - k0 - 6) / 5));
    const pvl = DIRS[(run.di + 1) % 4];
    for (let q = 0; q < nl; q++) {
      const kk = k0 + 3 + Math.floor(((q + 0.5) * (k1 - k0 - 6)) / nl);
      const cl = run.cells[Math.min(kk, run.cells.length - 1)];
      ceilingLight(zb, cl[0] + 0.5 + (run.w === 2 ? pvl[0] * 0.5 : 0), cl[1] + 0.5 + (run.w === 2 ? pvl[1] * 0.5 : 0), 'cage', lightState(r, p.fail * 0.5, p.flicker), { hang: 0.3, rad: 6.6, mul: 1.6 });
    }
    // a red pipe along the ceiling over the sunken part
    const pv = DIRS[(run.di + 1) % 4];
    const ctr = (c) => [c[0] + 0.5 + (run.w === 2 ? pv[0] * 0.5 : 0), c[1] + 0.5 + (run.w === 2 ? pv[1] * 0.5 : 0)];
    const ca = ctr(run.cells[k0 + 3]), cb = ctr(run.cells[k1 - 4]);
    const ya = run.ceil - 0.8 - 0.2;
    pipeRun(zb, [[ca[0], ya, ca[1]], [cb[0], ya, cb[1]]], 0.06, 'pipe_red', { seg: 2.5 });
  }
}

// ------------------------------------------------------------------ lights
function lights(S, r) {
  const { zb, p, kind, I, runs } = S;
  const placed = [];
  const free = (x, z) => !placed.some((q) => Math.abs(q[0] - x) + Math.abs(q[1] - z) < 3.4);
  for (const run of runs) {
    if (run.dead || !run.cells.length) continue;
    const pv = DIRS[(run.di + 1) % 4];
    const sp = run.w === 2 ? r.pick([5, 6]) : r.pick([4, 5]);
    const style = r.chance(0.2) ? 'tube' : r.chance(0.65) ? 'cage' : 'bulb';
    for (let k = r.int(1, 3); k < run.cells.length; k += sp) {
      const c = run.cells[k];
      const i = I(c[0], c[1]);
      if (kind[i] !== K.TUN) continue;
      const x = c[0] + 0.5 + (run.w === 2 ? pv[0] * 0.5 : 0), z = c[1] + 0.5 + (run.w === 2 ? pv[1] * 0.5 : 0);
      if (!free(x, z)) continue;
      let st = lightState(r, p.fail, p.flicker);
      if (run.gate && k < 4 && r.chance(0.6)) st = 'on';
      placed.push([x, z]);
      ceilingLight(zb, x, z, style, st, { rot: run.di % 2 === 0 ? 1 : 0, hang: 0.3, rad: 5.6, mul: 1.45 });
    }
    if (run.link && run.cells.length > 2) {
      const c = run.cells[Math.floor(run.cells.length / 2)];
      const x = c[0] + 0.5, z = c[1] + 0.5;
      if (free(x, z) && kind[I(c[0], c[1])] === K.TUN) { placed.push([x, z]); ceilingLight(zb, x, z, 'bulb', lightState(r, p.fail, p.flicker), { hang: 0.3, rad: 5.4, mul: 1.4 }); }
    }
  }
  // short dead ends and niches sometimes keep a lone bulb
  for (const run of runs) {
    if (run.dead || !run.deadEnd || run.cells.length < 2) continue;
    const c = run.cells[run.cells.length - 1];
    const x = c[0] + 0.5, z = c[1] + 0.5;
    if (!free(x, z) || kind[I(c[0], c[1])] !== K.TUN) continue;
    placed.push([x, z]);
    ceilingLight(zb, x, z, 'cage', lightState(r, p.fail, p.flicker), { hang: 0.3, rad: 5.4, mul: 1.4 });
  }
}
