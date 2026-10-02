// Zone type 'maintenance': utility and service tunnels. Narrow concrete corridors dug out of a solid
// mass - junctions, dead ends, low ceilings crowded with pipes and ducts, cage bulbs (most of them
// dead), electrical panels, valve wheels, puddles - with small machine rooms (boilers, pumps,
// switchgear), sunken sumps reached by steel stairs, and a ladder that goes nowhere.
import { defineZone } from '../zonetypes.js';
import { W, CF, M, env, stairs, facing } from './common.js';
import { tryRoomPiece } from '../roompieces.js';
import { keepClearMask } from './a_common.js';
import './b_assets.js';
import './z_assets.js';
import { sinkRoom, furnishMachineRoom } from './z_rooms.js';
import { K, DIRS, clamp, dirStr } from './z_util.js';
import { dressMaintenance } from './z_dress.js';

// ------------------------------------------------------------------ params
function maintParams(zone, rng, ctx) {
  const far = clamp((ctx.dist - 120) / 1500, 0, 1);
  const style = rng.weighted([['dry', 4], ['damp', 3.2], ['flooded', 1.1 + far * 0.8]]);
  const dark = rng.chance(0.07 + far * 0.12);
  const p = {
    style, dark,
    wallMat: rng.weighted([[M.concrete, 3], [M.z_wall_band, 3.2], [M.concrete_dark, 1.6], [M.cmu, 1.2], [M.cmu_green, 0.5]]),
    floorMat: rng.weighted([[M.concrete_floor, 3.2], [M.concrete_dark, 1.4], [M.concrete, 1]]),
    ceilMat: rng.weighted([[M.z_ceil_conc, 4], [M.concrete_dark, 1.6]]),
    ceilH: rng.pick([2.3, 2.4, 2.4, 2.5, 2.6]),
    roomWall: rng.weighted([[M.cmu, 3], [M.paint_dirty, 2], [M.cmu_green, 1.4], [M.concrete_dark, 1]]),
    roomFloor: rng.weighted([[M.a_epoxy, 3], [M.concrete_floor, 3], [M.metal_plate, 1.2]]),
    density: rng.range(0.17, 0.27),
    pipes: rng.range(0.5, 1),
    fail: dark ? 0.68 : rng.range(0.22, 0.45),
    flicker: rng.range(0.06, 0.14),
    wet: style === 'flooded' ? 0.8 : style === 'damp' ? 0.35 : 0.08,
    ambient: dark ? [0.135, 0.125, 0.11] : [0.21, 0.195, 0.172],
  };
  p.env = env({ fog: dark ? [0.04, 0.036, 0.03] : [0.075, 0.065, 0.055], fogNear: 3, fogFar: dark ? 18 : 24, hum: 0.12, hvac: 0.5, reverb: 'tunnel', tone: 'industrial' });
  return p;
}

// ------------------------------------------------------------------ generation
function genMaintenance(zb, world) {
  const p = zb.params;
  const R = zb.rng;
  const rLay = R.fork('layout'), rRoom = R.fork('rooms'), rFeat = R.fork('feat'), rDress = R.fork('dress'), rLight = R.fork('light');
  const { x0, z0, x1, z1 } = zb;
  const Wd = zb.w, Dd = zb.d;
  const keep = keepClearMask(zb, world, 3, 1);
  const I = (x, z) => (z - z0) * Wd + (x - x0);
  const kind = new Uint8Array(Wd * Dd);
  const runOf = new Int16Array(Wd * Dd).fill(-1);
  const kAt = (x, z) => (zb.in(x, z) ? kind[I(x, z)] : K.SOLID);
  const S = { zb, p, kind, runOf, kAt, I, keep, runs: [], rooms: [], niches: [], pits: [], shafts: [], carved: 0 };

  zb.rectSolid(x0, z0, x1, z1, p.wallMat);
  digNetwork(S, rLay);
  connectAll(S);
  for (const q of S.runs) if (!q.dead) S.carved += q.cells.length * q.w;
  S.rooms = carveRooms(S, rRoom);
  shellRooms(S, rRoom);
  carvePits(S, rFeat);
  carveNiches(S, rFeat);
  carveShafts(S, rFeat);
  dressMaintenance(S, rDress, rLight);
  for (const rm of S.rooms) furnishRoom(S, rm, rRoom);
  zb.zInfo = S;
}

// ------------------------------------------------------------------ tunnel digging
function digNetwork(S, r) {
  const { zb, p, kind, runOf, I, runs } = S;
  const { x0, z0, x1, z1 } = zb;
  const inb = (x, z) => x >= x0 + 1 && x <= x1 - 2 && z >= z0 + 1 && z <= z1 - 2;
  const carved = (x, z) => zb.in(x, z) && kind[I(x, z)] !== K.SOLID;
  let count = 0;
  const target = Math.max(34, Math.round(zb.w * zb.d * p.density));

  const carve = (x, z, run) => {
    const i = I(x, z);
    if (kind[i] === K.SOLID) { kind[i] = K.TUN; runOf[i] = run.id; count++; }
    zb.solid[i] = 0; zb.floor[i] = 0; zb.ceil[i] = run.ceil;
    zb.fmat[i] = p.floorMat; zb.cmat[i] = p.ceilMat; zb.wmat[i] = p.wallMat;
  };
  const near = (x, z, run) => {
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const cx = x + dx, cz = z + dz;
      if (!zb.in(cx, cz)) continue;
      const i = I(cx, cz);
      if (kind[i] === K.SOLID) continue;
      const id = runOf[i];
      if (id === run.id || id === run.parent) continue;
      if (run.parent >= 0 && id === runs[run.parent].parent && run.k < 3) continue;
      return true;
    }
    return false;
  };
  const lanesOf = (run, x, z) => {
    if (run.w !== 2) return [[x, z]];
    const pv = DIRS[(run.di + 1) % 4];
    return [[x, z], [x + pv[0], z + pv[1]]];
  };

  // dig a straight run starting at cell (sx, sz) heading di
  function dig(sx, sz, di, w, ceil, parent, len, gate) {
    const [dx, dz] = DIRS[di];
    const run = { id: runs.length, di, w, ceil, parent, sx, sz, len: 0, end: 'len', gate: !!gate, k: 0, cells: [] };
    let x = sx, z = sz;
    const cs0 = lanesOf(run, x, z);
    if (!gate && (cs0.some(([a, b]) => !inb(a, b) || carved(a, b)) || near(x, z, run))) return null;
    runs.push(run);
    for (const [a, b] of cs0) carve(a, b, run);
    run.cells.push([x, z]);
    for (let k = 0; k < len; k++) {
      run.k = k;
      const nx = x + dx, nz = z + dz;
      const cs = lanesOf(run, nx, nz);
      if (cs.some(([a, b]) => !inb(a, b))) { run.end = 'edge'; break; }
      if (cs.some(([a, b]) => carved(a, b))) { run.end = 'join'; break; }
      if (!(gate && k < 2) && near(nx, nz, run)) { run.end = 'close'; break; }
      for (const [a, b] of cs) carve(a, b, run);
      run.cells.push([nx, nz]);
      x = nx; z = nz; run.len++;
    }
    run.hx = x; run.hz = z;
    return run;
  }
  function removeRun(ch) {
    for (const [cx, cz] of ch.cells) for (const [a, b] of lanesOf(ch, cx, cz)) {
      const i = I(a, b);
      if (kind[i] === K.TUN && runOf[i] === ch.id) { kind[i] = K.SOLID; runOf[i] = -1; zb.solid[i] = p.wallMat; count--; }
    }
    ch.cells.length = 0; ch.len = 0; ch.dead = true;
  }

  const queue = [];
  const spawn = (run) => { if (run) queue.push(run); return run; };
  const pickW = (parentW) => (parentW === 1 ? (r.chance(0.3) ? 2 : 1) : r.chance(0.72) ? 2 : 1);
  const pickCeil = (parent) => (r.chance(0.45) ? parent : clamp(p.ceilH + r.pick([-0.2, -0.1, 0, 0, 0.1, 0.2]), 2.2, 2.7));
  const lenFor = (w) => (w === 2 ? r.int(7, 22) : r.int(4, 14));

  // gate stubs: a short single-width passage behind every door
  for (const g of zb.gates) {
    const di = DIRS.findIndex(([a, b]) => a === g.dx && b === g.dz);
    if (di < 0 || kind[I(g.x, g.z)] !== K.SOLID) continue;
    spawn(dig(g.x, g.z, di, 1, pickCeil(p.ceilH), -1, r.int(3, 6), true));
  }
  if (queue.length < 2) {
    const di = r.int(0, 3);
    const cx = Math.floor((x0 + x1) / 2) + r.int(-4, 4), cz = Math.floor((z0 + z1) / 2) + r.int(-4, 4);
    const run = dig(cx, cz, di, 2, p.ceilH, -1, r.int(8, 18), false);
    spawn(run);
    if (run) spawn(dig(cx - DIRS[di][0], cz - DIRS[di][1], (di + 2) % 4, 2, p.ceilH, run.id, r.int(8, 18), false));
  }

  const childFrom = (run, k, s) => {
    const c = run.cells[Math.min(k, run.cells.length - 1)];
    if (!c) return null;
    const pv = DIRS[(run.di + 1) % 4];
    const di = s > 0 ? (run.di + 1) % 4 : (run.di + 3) % 4;
    const [cdx, cdz] = DIRS[di];
    let sx = c[0], sz = c[1];
    if (s > 0 && run.w === 2) { sx += pv[0]; sz += pv[1]; }
    return { sx: sx + cdx, sz: sz + cdz, di };
  };
  const tryChild = (run, k, s) => {
    const f = childFrom(run, k, s);
    if (!f || count >= target) return null;
    const w = pickW(run.w);
    const ch = dig(f.sx, f.sz, f.di, w, pickCeil(run.ceil), run.id, lenFor(w), false);
    if (ch && ch.len >= 2) return spawn(ch);
    if (ch) removeRun(ch);
    return null;
  };
  const tryStraight = (run) => {
    const [dx, dz] = DIRS[run.di];
    const w = pickW(run.w);
    const ch = dig(run.hx + dx, run.hz + dz, run.di, w, pickCeil(run.ceil), run.id, lenFor(w), false);
    if (ch && ch.len >= 2) return spawn(ch);
    if (ch) removeRun(ch);
    return null;
  };

  let safety = 0;
  while (queue.length && safety++ < 800) {
    const run = queue.shift();
    if (run.dead) continue;
    // side branches along the run
    if (run.len >= 6 && count < target) {
      const nb = r.chance(0.55) ? 1 : r.chance(0.35) ? 2 : 0;
      for (let b = 0; b < nb; b++) tryChild(run, r.int(2, run.len - 2), r.sign());
    }
    if (count >= target || run.end === 'join') continue;
    if (run.end === 'edge' || run.end === 'close') {
      if (r.chance(0.6)) { const s = r.sign(); if (!tryChild(run, run.len, s) && !tryChild(run, run.len, -s)) run.deadEnd = true; }
      else run.deadEnd = true;
      continue;
    }
    const u = r.next();
    if (run.gate) {
      if (u < 0.45) tryStraight(run);
      else if (u < 0.8) { const s = r.sign(); if (!tryChild(run, run.len, s) && !tryChild(run, run.len, -s)) tryStraight(run); }
      else { tryChild(run, run.len, 1); tryChild(run, run.len, -1); tryStraight(run); }
    } else if (u < 0.2) { if (!tryStraight(run)) run.deadEnd = true; }
    else if (u < 0.5) { const s = r.sign(); if (!tryChild(run, run.len, s) && !tryChild(run, run.len, -s)) run.deadEnd = true; }
    else if (u < 0.72) { const a = tryChild(run, run.len, 1), b = tryChild(run, run.len, -1); if (!a && !b) run.deadEnd = true; }
    else if (u < 0.8) { tryChild(run, run.len, 1); tryChild(run, run.len, -1); tryStraight(run); }
    else run.deadEnd = true;
  }
  // too sparse (small zones): add branches off random runs
  for (let tries = 0; tries < 40 && count < target * 0.7; tries++) {
    const live = runs.filter((q) => !q.dead && q.len >= 5);
    if (!live.length) break;
    const run = r.pick(live);
    tryChild(run, r.int(2, run.len - 2), r.sign());
  }
}

// ------------------------------------------------------------------ connectivity
function components(S) {
  const { zb, kind, I } = S;
  const n = zb.w * zb.d, comp = new Int32Array(n).fill(-1);
  const q = new Int32Array(n);
  let nc = 0;
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0 || kind[s] === K.SOLID) continue;
    let qh = 0, qt = 0;
    q[qt++] = s; comp[s] = nc;
    while (qh < qt) {
      const c = q[qh++];
      const x = zb.x0 + (c % zb.w), z = zb.z0 + Math.floor(c / zb.w);
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (!zb.in(nx, nz)) continue;
        const ni = I(nx, nz);
        if (comp[ni] >= 0 || kind[ni] === K.SOLID) continue;
        comp[ni] = nc; q[qt++] = ni;
      }
    }
    nc++;
  }
  return { comp, nc };
}

// every carved cell must belong to one component; join strays through the rock
function connectAll(S) {
  const { zb, p, kind, runOf, I } = S;
  for (let pass = 0; pass < 80; pass++) {
    const { comp, nc } = components(S);
    if (nc <= 1) return;
    const sizes = new Int32Array(nc);
    for (let i = 0; i < comp.length; i++) if (comp[i] >= 0) sizes[comp[i]]++;
    let from = 0;
    for (let c = 1; c < nc; c++) if (sizes[c] < sizes[from]) from = c;
    const n = zb.w * zb.d;
    const prev = new Int32Array(n).fill(-2), q = new Int32Array(n);
    let qh = 0, qt = 0;
    for (let i = 0; i < n; i++) if (comp[i] === from) { prev[i] = -1; q[qt++] = i; }
    let found = -1;
    while (qh < qt && found < 0) {
      const c = q[qh++];
      const x = zb.x0 + (c % zb.w), z = zb.z0 + Math.floor(c / zb.w);
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (!zb.in(nx, nz)) continue;
        const ni = I(nx, nz);
        if (prev[ni] !== -2) continue;
        if ((nx < zb.x0 + 1 || nx > zb.x1 - 2 || nz < zb.z0 + 1 || nz > zb.z1 - 2) && kind[ni] === K.SOLID) continue;
        prev[ni] = c;
        if (kind[ni] !== K.SOLID) { if (comp[ni] !== from) { found = ni; break; } continue; }
        q[qt++] = ni;
      }
    }
    if (found < 0) return;
    const ceilRef = zb.ceil[found];
    const run = { id: S.runs.length, di: 0, w: 1, ceil: Number.isNaN(ceilRef) ? p.ceilH : ceilRef, parent: -1, len: 0, cells: [], link: true };
    S.runs.push(run);
    for (let c = prev[found]; c >= 0 && prev[c] !== -1; c = prev[c]) {
      if (kind[c] !== K.SOLID) continue;
      kind[c] = K.TUN; runOf[c] = run.id; zb.solid[c] = 0; zb.floor[c] = 0; zb.ceil[c] = run.ceil;
      zb.fmat[c] = p.floorMat; zb.cmat[c] = p.ceilMat; zb.wmat[c] = p.wallMat;
      run.cells.push([zb.x0 + (c % zb.w), zb.z0 + Math.floor(c / zb.w)]);
    }
  }
}

// ------------------------------------------------------------------ machine rooms
const ROOM_SIZES = { boiler: [6, 9, 5, 8], pump: [5, 8, 5, 7], electrical: [4, 7, 5, 7], tank: [6, 9, 5, 7], control: [4, 5, 4, 6], storage: [4, 6, 4, 6], sump: [6, 8, 6, 8] };
function carveRooms(S, r) {
  const { zb, p, kind, I, runs, keep } = S;
  const area = zb.w * zb.d;
  const want = Math.round(area / 650 + r.next() * 0.9);
  const rooms = [];
  const solidRect = (ax0, az0, ax1, az1) => {
    for (let z = az0; z < az1; z++) for (let x = ax0; x < ax1; x++) {
      if (!zb.in(x, z) || kind[I(x, z)] !== K.SOLID) return false;
      if (x < zb.x0 + 1 || x > zb.x1 - 2 || z < zb.z0 + 1 || z > zb.z1 - 2) return false;
      if (keep[I(x, z)]) return false;
    }
    return true;
  };
  const types = [['boiler', 3], ['pump', 2.4], ['electrical', 2.4], ['tank', 1.4], ['control', 1.2], ['storage', 1.4], ['sump', 1.6]];
  for (let k = 0; k < want * 25 && rooms.length < want; k++) {
    const live = runs.filter((q) => !q.dead && q.cells.length >= 3);
    if (!live.length) break;
    const run = r.pick(live);
    const c = run.cells[r.int(1, run.cells.length - 2)];
    if (!c) continue;
    const s = r.sign();
    const di = s > 0 ? (run.di + 1) % 4 : (run.di + 3) % 4;
    const [dx, dz] = DIRS[di];
    const pv = DIRS[(run.di + 1) % 4];
    let bx = c[0], bz = c[1];
    if (s > 0 && run.w === 2) { bx += pv[0]; bz += pv[1]; }
    const doorX = bx + dx, doorZ = bz + dz;
    if (kind[I(bx, bz)] !== K.TUN || !zb.in(doorX, doorZ) || kind[I(doorX, doorZ)] !== K.SOLID) continue;
    const type = r.weighted(types);
    const [rwMin, rwMax, rdMin, rdMax] = ROOM_SIZES[type];
    const rw = r.int(rwMin, rwMax), rd = r.int(rdMin, rdMax);
    const off = r.int(0, rw - 1);
    let rx0, rz0, rx1, rz1;
    if (dx !== 0) {
      rx0 = dx > 0 ? bx + 2 : bx - 1 - rd; rx1 = rx0 + rd;
      rz0 = bz - off; rz1 = rz0 + rw;
    } else {
      rz0 = dz > 0 ? bz + 2 : bz - 1 - rd; rz1 = rz0 + rd;
      rx0 = bx - off; rx1 = rx0 + rw;
    }
    if (!solidRect(rx0 - 1, rz0 - 1, rx1 + 1, rz1 + 1)) continue;
    const ceil = clamp(p.ceilH + r.range(0.4, 0.9), 2.8, 3.3);
    const room = { type, x0: rx0, z0: rz0, x1: rx1, z1: rz1, dx, dz, door: { x: doorX, z: doorZ }, from: { x: bx, z: bz }, ceil, id: rooms.length, floorY: 0 };
    zb.fill(rx0, rz0, rx1, rz1, (x, z, i) => {
      kind[i] = K.ROOM; zb.solid[i] = 0; zb.floor[i] = 0; zb.ceil[i] = ceil;
      zb.fmat[i] = p.roomFloor; zb.cmat[i] = M.concrete_dark; zb.wmat[i] = p.roomWall;
    });
    const di2 = I(doorX, doorZ);
    kind[di2] = K.DOORWAY; zb.solid[di2] = 0; zb.floor[di2] = 0; zb.ceil[di2] = run.ceil;
    zb.fmat[di2] = p.roomFloor; zb.cmat[di2] = p.ceilMat; zb.wmat[di2] = p.wallMat;
    rooms.push(room);
  }
  return rooms;
}

// thin walls around each room, its door, and the sunken floor of sump rooms
function shellRooms(S, r) {
  const { zb, p } = S;
  for (const rm of S.rooms) {
    const { x0, z0, x1, z1, dx, dz, door, from } = rm;
    zb.roomWalls(x0, z0, x1, z1, W.WALL, p.roomWall, p.wallMat);
    // open boundary between doorway cell and room; door between corridor and doorway
    if (dx > 0) { zb.setWall(x0, door.z, 'W', W.NONE); zb.setWall(door.x, door.z, 'W', W.DOOR, p.wallMat, p.wallMat); }
    else if (dx < 0) { zb.setWall(x1, door.z, 'W', W.NONE); zb.setWall(from.x, from.z, 'W', W.DOOR, p.wallMat, p.wallMat); }
    else if (dz > 0) { zb.setWall(door.x, z0, 'N', W.NONE); zb.setWall(door.x, door.z, 'N', W.DOOR, p.wallMat, p.wallMat); }
    else { zb.setWall(door.x, z1, 'N', W.NONE); zb.setWall(from.x, from.z, 'N', W.DOOR, p.wallMat, p.wallMat); }
    const ex = dx > 0 ? door.x : dx < 0 ? door.x + 1 : door.x + 0.5;
    const ez = dz > 0 ? door.z : dz < 0 ? door.z + 1 : door.z + 0.5;
    rm.doorEdge = { x: ex, z: ez };
    zb.prop('door', ex, 0, ez, facing(dx, dz), { open: r.range(1.0, 1.9), tex: r.pick(['door_metal', 'door_metal', 'door_gray']) });
    if (rm.type === 'sump') {
      rm.depth = r.pick([1.3, 1.5, 1.7]);
      rm.floorY = -rm.depth;
      rm.stair = sinkRoom(zb, rm, rm.depth);
    }
  }
}

function furnishRoom(S, rm, r) {
  const { zb, p } = S;
  if (rm.type !== 'sump' && Math.min(rm.x1 - rm.x0, rm.z1 - rm.z0) >= 4) {
    const piece = tryRoomPiece(zb, { x0: rm.x0, z0: rm.z0, x1: rm.x1, z1: rm.z1 }, r, 0.1);
    if (piece) { rm.piece = piece; return; }
  }
  rm.doorU = (rm.dz !== 0 ? rm.door.x - rm.x0 : rm.door.z - rm.z0) + 0.5;
  furnishMachineRoom(zb, rm, { zb, r, lights: { fail: Math.min(p.fail * 0.7, 0.42), flicker: p.flicker } });
}

// ------------------------------------------------------------------ sunken stretches
function carvePits(S, r) {
  const { zb, kind, I, runs, keep, kAt } = S;
  const cands = runs.filter((q) => !q.dead && !q.link && q.cells.length >= 11);
  r.shuffle(cands);
  let want = zb.w * zb.d >= 1400 ? r.int(1, 2) : r.chance(0.45) ? 1 : 0;
  for (const run of cands) {
    if (want <= 0) break;
    const pv = DIRS[(run.di + 1) % 4];
    const lanes = (c) => (run.w === 2 ? [c, [c[0] + pv[0], c[1] + pv[1]]] : [c]);
    const valid = (k) => {
      const c = run.cells[k];
      if (!c) return false;
      const ls = lanes(c);
      for (const [x, z] of ls) if (kind[I(x, z)] !== K.TUN || keep[I(x, z)]) return false;
      const a = ls[0], b = ls[ls.length - 1];
      return kAt(a[0] - pv[0], a[1] - pv[1]) === K.SOLID && kAt(b[0] + pv[0], b[1] + pv[1]) === K.SOLID;
    };
    let best = null, st = -1;
    for (let k = 0; k <= run.cells.length; k++) {
      const ok = k < run.cells.length && valid(k);
      if (ok && st < 0) st = k;
      if (!ok && st >= 0) { if (!best || k - st > best[1] - best[0]) best = [st, k]; st = -1; }
    }
    if (!best || best[1] - best[0] < 11) continue;
    const a = best[0] + 1, b = best[1] - 1;
    const L = r.int(9, Math.min(15, b - a));
    const k0 = a + r.int(0, b - a - L), k1 = k0 + L;
    const depth = r.pick([1.2, 1.35, 1.5, 1.65, 1.8]);
    const rectOf = (ka, kb) => {
      let mnx = 1e9, mnz = 1e9, mxx = -1e9, mxz = -1e9;
      for (let k = ka; k < kb; k++) for (const [x, z] of lanes(run.cells[k])) { mnx = Math.min(mnx, x); mnz = Math.min(mnz, z); mxx = Math.max(mxx, x); mxz = Math.max(mxz, z); }
      return [mnx, mnz, mxx + 1, mxz + 1];
    };
    stairs(zb, ...rectOf(k0, k0 + 3), dirStr(run.di), 0, -depth, M.metal_plate);
    stairs(zb, ...rectOf(k1 - 3, k1), dirStr(run.di), -depth, 0, M.metal_plate);
    for (let k = k0; k < k1; k++) for (const [x, z] of lanes(run.cells[k])) {
      const i = I(x, z);
      kind[i] = K.PIT;
      if (k >= k0 + 3 && k < k1 - 3) {
        zb.floor[i] = -depth; zb.fmat[i] = M.concrete_wet; zb.flags[i] |= CF.WET; zb.ceil[i] = run.ceil - 0.8;
      }
    }
    S.pits.push({ run, k0, k1, depth, lanes });
    want--;
  }
}

// ------------------------------------------------------------------ wall niches
function carveNiches(S, r) {
  const { zb, p, kind, I, runs, keep } = S;
  const want = Math.round(S.carved / 30);
  const live = runs.filter((q) => !q.dead && !q.link && q.cells.length >= 4);
  for (let t = 0; t < want * 14 && S.niches.length < want && live.length; t++) {
    const run = r.pick(live);
    const k = r.int(1, run.cells.length - 2);
    const c = run.cells[k];
    const s = r.sign();
    const pv = DIRS[(run.di + 1) % 4];
    const di = s > 0 ? (run.di + 1) % 4 : (run.di + 3) % 4;
    const [dx, dz] = DIRS[di];
    let ex = c[0], ez = c[1];
    if (s > 0 && run.w === 2) { ex += pv[0]; ez += pv[1]; }
    if (kind[I(ex, ez)] !== K.TUN || keep[I(ex, ez)]) continue;
    const nx = ex + dx, nz = ez + dz;
    const lx = Math.abs(dz), lz = Math.abs(dx);
    const chk = [[nx, nz], [nx + dx, nz + dz], [nx + lx, nz + lz], [nx - lx, nz - lz], [nx + dx + lx, nz + dz + lz], [nx + dx - lx, nz + dz - lz]];
    if (!chk.every(([x, z]) => zb.in(x, z) && x > zb.x0 && x < zb.x1 - 1 && z > zb.z0 && z < zb.z1 - 1 && kind[I(x, z)] === K.SOLID && !keep[I(x, z)])) continue;
    const i = I(nx, nz);
    kind[i] = K.NICHE; zb.solid[i] = 0; zb.floor[i] = 0; zb.ceil[i] = zb.ceil[I(ex, ez)];
    zb.fmat[i] = p.floorMat; zb.cmat[i] = p.ceilMat; zb.wmat[i] = p.wallMat;
    S.niches.push({ x: nx, z: nz, dx, dz, ex, ez, type: r.weighted([['door', 3], ['valves', 2], ['cabinet', 2], ['ladder', 1.5], ['bucket', 1.5], ['vent', 1], ['extinguisher', 1.5]]) });
  }
}

// ------------------------------------------------------------------ the ladder that goes nowhere
function carveShafts(S, r) {
  const { zb, kind, I, runs, keep } = S;
  const dead = runs.filter((q) => !q.dead && q.deadEnd && q.cells.length >= 3 && !q.link && !q.gate);
  r.shuffle(dead);
  let want = zb.w * zb.d >= 1200 ? r.int(1, 2) : r.chance(0.7) ? 1 : 0;
  for (const run of dead) {
    if (want <= 0) break;
    const c = run.cells[run.cells.length - 1];
    const pv = DIRS[(run.di + 1) % 4];
    const ls = run.w === 2 ? [c, [c[0] + pv[0], c[1] + pv[1]]] : [c];
    if (ls.some(([x, z]) => kind[I(x, z)] !== K.TUN || keep[I(x, z)])) continue;
    const [dx, dz] = DIRS[run.di];
    if (kind[I(c[0] + dx, c[1] + dz)] !== K.SOLID) continue;
    for (const [x, z] of ls) zb.ceil[I(x, z)] = 5.7;
    S.shafts.push({ run, cells: ls, x: c[0], z: c[1], dx, dz });
    run.shaft = true;
    want--;
  }
}

defineZone('maintenance', {
  border: 'wall',
  gate: 'door',
  minW: 16, minD: 16,
  weight: (c) => {
    if (c.dim !== 0 || c.dist <= 120) return 0;
    let w = 1.5 * (0.3 + 1.5 * c.ind);
    if (c.level < 0) w *= 1 + Math.min(1.4, -c.level * 0.5);
    return w;
  },
  params: maintParams,
  gen: genMaintenance,
});
