// School wing: wide hallways lined with lockers, classrooms with desks in neat rows facing a
// chalkboard, restrooms, and where the zone is deep enough a gymnasium, a cafeteria or a library.
// Every room is ready for a lesson that is not going to happen.
import { defineZone } from '../zonetypes.js';
import { W, M, ceilingLight, facing, env, floorDecal, wallFace, propOnWall } from './common.js';
import { tryRoomPiece } from '../roompieces.js';
import './b_assets.js';
import { clamp, lightState, gateCellSet } from './b_util.js';

const HALL = 1, ROOM = 2;

function schoolParams(zone, rng, ctx) {
  const far = clamp((ctx.dist - 150) / 1500, 0, 1);
  const variant = rng.weighted([['modern', 3], ['old', 2]]);
  const abandoned = rng.chance(0.25 + far * 0.45);
  const p = { variant, abandoned };
  if (variant === 'modern') {
    p.wallMat = rng.weighted([[M.cmu_green, 3], [M.cmu, 2.5], [M.paint_green, 1.5], [M.paint_cream, 1.5]]);
    p.roomWall = rng.weighted([[M.paint_cream, 3], [M.cmu, 2], [M.paint_wall, 1.5], [M.paint_blue, 0.8]]);
    p.floorMat = rng.weighted([[M.tile_check, 2], [M.b_terrazzo, 2.5], [M.lino_vct, 2]]);
    p.roomFloor = rng.weighted([[M.lino_vct, 3], [M.tile_check, 1], [M.lino_green, 1.2]]);
    p.ceilMat = M.ceil_tile_white;
    p.hallLight = rng.chance(0.6) ? 'troffer' : 'panel';
  } else {
    p.wallMat = rng.weighted([[M.paint_green, 3], [M.paint_cream, 2], [M.plaster, 1.5]]);
    p.roomWall = rng.weighted([[M.paint_cream, 2], [M.plaster, 2], [M.paint_green, 1.2]]);
    p.floorMat = rng.weighted([[M.b_terrazzo, 2], [M.tile_check, 2], [M.lino_green, 1]]);
    p.roomFloor = rng.weighted([[M.wood_floor, 3], [M.lino_green, 1]]);
    p.ceilMat = rng.pick([M.plaster, M.ceil_tile, M.ceil_tile_old]);
    p.hallLight = 'bulb';
  }
  p.ceilH = rng.pick([2.9, 3.0, 3.1]);
  p.hallW = rng.pick([3, 4, 4]);
  p.lockerTint = rng.pick([[1, 1, 1], [1.35, 0.62, 0.55], [0.75, 1.15, 0.8], [1.45, 1.15, 0.5], [0.85, 0.9, 1.25]]);
  p.fail = abandoned ? rng.range(0.15, 0.4) : rng.range(0.02, 0.08);
  p.flicker = abandoned ? rng.range(0.05, 0.12) : 0.03;
  p.ambient = abandoned ? [0.15, 0.16, 0.15] : [0.23, 0.235, 0.22];
  p.env = env({ fog: abandoned ? [0.18, 0.2, 0.19] : [0.32, 0.34, 0.32], fogNear: 4, fogFar: abandoned ? 26 : 34, hum: 0.7, hvac: 0.45, reverb: 'corridor', tone: 'school' });
  return p;
}

// split a length into room widths between lo and hi (as even as possible)
function splitLen(len, lo, hi, r) {
  if (len <= hi) return [len];
  let n = Math.max(1, Math.round(len / ((lo + hi) / 2)));
  while (len / n > hi) n++;
  while (n > 1 && len / n < lo) n--;
  const out = [];
  let left = len;
  for (let k = n; k > 0; k--) {
    const w = k === 1 ? left : clamp(Math.round(left / k + r.range(-0.6, 0.6)), lo, hi);
    out.push(w); left -= w;
  }
  return out;
}

function edgeWall(zb, x, z, dx, dz, type, matIn, matOut) {
  if (dx === -1) zb.setWall(x, z, 'W', type, matOut, matIn);
  else if (dx === 1) zb.setWall(x + 1, z, 'W', type, matIn, matOut);
  else if (dz === -1) zb.setWall(x, z, 'N', type, matOut, matIn);
  else zb.setWall(x, z + 1, 'N', type, matIn, matOut);
}

function genSchool(zb) {
  const p = zb.params, r = zb.rng;
  const alongX = zb.w >= zb.d;
  const A0 = alongX ? zb.x0 : zb.z0, A1 = alongX ? zb.x1 : zb.z1;
  const C0 = alongX ? zb.z0 : zb.x0, C1 = alongX ? zb.z1 : zb.x1;
  const LA = A1 - A0, LC = C1 - C0;
  const XZ = (a, c) => (alongX ? [a, c] : [c, a]);
  const type = new Uint8Array(zb.w * zb.d);
  const tAt = (x, z) => (zb.in(x, z) ? type[zb.i(x, z)] : 0);
  const gateCells = gateCellSet(zb);
  const hw = p.hallW;

  // ---- wing hallways along A, room rows on both sides
  const nh = clamp(Math.round(LC / 22), 1, 4);
  const cellC = LC / nh;
  const halls = [], rows = [];
  for (let h = 0; h < nh; h++) {
    const b0 = Math.round(C0 + h * cellC), b1 = h === nh - 1 ? C1 : Math.round(C0 + (h + 1) * cellC);
    const size = b1 - b0;
    let dN;
    if (size - hw <= 22) dN = Math.floor((size - hw) / 2) + r.int(-1, 1);
    else dN = r.chance(0.5) ? r.int(8, 9) : size - hw - r.int(8, 9);
    dN = clamp(dN, 5, size - hw - 5);
    const hall = { c0: b0 + dN, c1: b0 + dN + hw, kind: 'wing' };
    halls.push(hall);
    rows.push({ c0: b0, c1: hall.c0, hall, side: -1 });
    rows.push({ c0: hall.c1, c1: b1, hall, side: 1 });
  }
  // ---- spine hallway(s) across, joining the wings
  const nS = LA >= 88 ? 2 : 1;
  const sw = 3;
  const spines = [];
  for (let k = 0; k < nS; k++) {
    const centre = A0 + Math.round((LA * (k + 1)) / (nS + 1)) + r.int(-4, 4);
    spines.push({ a0: clamp(centre - 1, A0 + 6, A1 - 6 - sw), a1: 0 });
    spines[k].a1 = spines[k].a0 + sw;
  }
  // full-length spines reach both borders; otherwise they stop at the outer halls
  const spineFull = r.chance(0.6);
  for (const s of spines) {
    s.c0 = spineFull ? C0 : halls[0].c0;
    s.c1 = spineFull ? C1 : halls[halls.length - 1].c1;
  }
  const hallCh = p.ceilH, roomCh = p.ceilH - 0.1;
  for (const h of halls) for (let a = A0; a < A1; a++) for (let c = h.c0; c < h.c1; c++) { const [x, z] = XZ(a, c); type[zb.i(x, z)] = HALL; zb.setCeil(x, z, hallCh); }
  for (const s of spines) for (let a = s.a0; a < s.a1; a++) for (let c = s.c0; c < s.c1; c++) { const [x, z] = XZ(a, c); type[zb.i(x, z)] = HALL; zb.setCeil(x, z, hallCh); }

  // ---- rooms: rows split by the spines into segments, segments into rooms
  const rooms = [];
  // between two wing halls the two back-to-back rows may be merged into one big room
  // (gym, cafeteria ...) that opens onto both hallways
  if (nh >= 2 && r.chance(0.7)) {
    const h = r.int(0, nh - 2);
    const ca = halls[h].c1, cb = halls[h + 1].c0;
    const free = [];
    let a = A0;
    for (const sp of [...spines].sort((m, n) => m.a0 - n.a0)) { if (sp.a0 - a >= 14) free.push([a, sp.a0]); a = sp.a1; }
    if (A1 - a >= 14) free.push([a, A1]);
    if (free.length && cb - ca >= 12) {
      const [fa, fb] = r.pick(free);
      const L = Math.min(fb - fa, r.int(16, 24));
      const ma0 = fa + (r.chance(0.5) ? 0 : fb - fa - L);
      const rowA = rows.find((q) => q.hall === halls[h] && q.side === 1), rowB = rows.find((q) => q.hall === halls[h + 1] && q.side === -1);
      rowA.skip = rowB.skip = [ma0, ma0 + L];
      rooms.push({ a0: ma0, a1: ma0 + L, c0: ca, c1: cb, row: rowA, big: true, merged: true });
    }
  }
  for (const row of rows) {
    const depth = row.c1 - row.c0;
    if (depth < 3) continue;
    const big = depth >= 13;
    // segments between spines (spine cells that cross this row are hallway)
    const cuts = spines.filter((s) => s.c0 <= row.c0 && s.c1 >= row.c1).map((s) => [s.a0, s.a1]).sort((m, n) => m[0] - n[0]);
    if (row.skip) cuts.push(row.skip);
    cuts.sort((m, n) => m[0] - n[0]);
    let a = A0;
    const segs = [];
    for (const [s0, s1] of cuts) { if (s0 > a) segs.push([a, s0]); a = Math.max(a, s1); }
    if (a < A1) segs.push([a, A1]);
    for (const [sa0, sa1] of segs) {
      const len = sa1 - sa0;
      if (len < 3) { for (let t = sa0; t < sa1; t++) for (let c = row.c0; c < row.c1; c++) { const [x, z] = XZ(t, c); type[zb.i(x, z)] = HALL; } continue; }
      const widths = big ? splitLen(len, 12, 24, r) : splitLen(len, 7, 10, r);
      let t = sa0;
      widths.forEach((wd, k) => {
        const rm = { a0: t, a1: t + wd, c0: row.c0, c1: row.c1, row, big, first: k === 0, last: k === widths.length - 1, segA0: sa0, segA1: sa1 };
        rooms.push(rm);
        t += wd;
      });
    }
  }
  for (const rm of rooms) {
    const [x0, z0] = XZ(rm.a0, rm.c0), [x1, z1] = XZ(rm.a1 - 1, rm.c1 - 1);
    rm.x0 = Math.min(x0, x1); rm.z0 = Math.min(z0, z1); rm.x1 = Math.max(x0, x1) + 1; rm.z1 = Math.max(z0, z1) + 1;
    zb.fill(rm.x0, rm.z0, rm.x1, rm.z1, (x, z, i) => { type[i] = ROOM; });
  }
  // ---- room programme
  const bigRooms = rooms.filter((m) => m.big).sort((m, n) => (n.a1 - n.a0) * (n.c1 - n.c0) - (m.a1 - m.a0) * (m.c1 - m.c0));
  const bigTypes = r.chance(0.5) ? ['cafeteria', 'library', 'multi'] : ['library', 'cafeteria', 'multi'];
  let bi = 0;
  bigRooms.forEach((m, k) => {
    const wa = m.a1 - m.a0, dc = m.c1 - m.c0;
    if (k === 0 && Math.min(wa, dc) >= 13 && r.chance(0.85)) m.type = 'gym';
    else if (Math.min(wa, dc) < 8) m.type = 'classroom';
    else m.type = bigTypes[bi++ % bigTypes.length];
  });
  const normal = rooms.filter((m) => !m.big);
  for (const m of normal) m.type = (m.a1 - m.a0) <= 5 ? r.weighted([['storage', 2], ['office', 1.5], ['restroom', 2]]) : 'classroom';
  // make sure there is a pair of restrooms next to a spine
  if (!rooms.some((m) => m.type === 'restroom')) {
    const cand = normal.filter((m) => (m.first || m.last) && m.a1 - m.a0 >= 6);
    const m = cand.length ? r.pick(cand) : normal.find((q) => q.a1 - q.a0 >= 6);
    if (m) splitRestrooms(m, rooms, r);
  } else if (r.chance(0.5)) {
    const cand = normal.filter((m) => m.type === 'classroom' && (m.first || m.last) && m.a1 - m.a0 >= 7);
    if (cand.length) splitRestrooms(r.pick(cand), rooms, r);
  }
  for (const m of rooms) {
    if (m.type === 'classroom' && r.chance(0.1)) m.type = r.pick(['lounge', 'office', 'science', 'storage']);
  }
  // recompute rects after splits
  for (const rm of rooms) {
    const [x0, z0] = XZ(rm.a0, rm.c0), [x1, z1] = XZ(rm.a1 - 1, rm.c1 - 1);
    rm.x0 = Math.min(x0, x1); rm.z0 = Math.min(z0, z1); rm.x1 = Math.max(x0, x1) + 1; rm.z1 = Math.max(z0, z1) + 1;
  }

  // ---- walls
  const hallSide = (rm) => -rm.row.side; // direction (along C) from the room to its hall
  rooms.forEach((rm, idx) => {
    zb.rectRoom(rm.x0, rm.z0, rm.x1, rm.z1, idx);
    rm.wall = rm.type === 'restroom' ? M.tile_white : rm.type === 'gym' ? (p.variant === 'old' ? M.paint_cream : M.cmu) : p.roomWall;
  });
  rooms.forEach((rm) => {
    const inner = rm.wall;
    zb.rectWallMat(rm.x0, rm.z0, rm.x1, rm.z1, inner);
    for (let x = rm.x0; x < rm.x1; x++) for (let z = rm.z0; z < rm.z1; z++) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx >= rm.x0 && nx < rm.x1 && nz >= rm.z0 && nz < rm.z1) continue;
        if (!zb.in(nx, nz)) continue;
        const nt = tAt(nx, nz);
        const other = nt === HALL ? p.wallMat : nt === ROOM && zb.room[zb.i(nx, nz)] >= 0 ? rooms[zb.room[zb.i(nx, nz)]].wall : inner;
        edgeWall(zb, x, z, dx, dz, W.WALL, inner, other);
      }
    }
  });
  // floors / ceilings
  for (const rm of rooms) {
    const f = rm.type === 'restroom' ? M.tile_white : rm.type === 'gym' ? M.wood_floor : rm.type === 'library' || rm.type === 'lounge' || rm.type === 'office' ? r.pick([M.carpet_blue, M.carpet_gray, M.carpet_green]) : rm.type === 'cafeteria' ? M.tile_check : p.roomFloor;
    const ch = rm.type === 'gym' ? 4.2 : rm.type === 'cafeteria' ? Math.min(3.4, roomCh + 0.3) : rm.type === 'restroom' || rm.type === 'storage' ? 2.6 : roomCh;
    zb.rectFloor(rm.x0, rm.z0, rm.x1, rm.z1, 0, f);
    zb.rectCeil(rm.x0, rm.z0, rm.x1, rm.z1, ch, rm.type === 'gym' ? M.metal_plate : undefined);
  }

  // ---- doors and hallway windows
  const doorCells = new Set();
  const addDoor = (rm, a, dirC, kind = W.DOOR) => {
    const c = dirC > 0 ? rm.c1 - 1 : rm.c0;
    const [x, z] = XZ(a, c);
    const [dx, dz] = alongX ? [0, dirC] : [dirC, 0];
    const [hx, hz] = [x + dx, z + dz];
    if (tAt(hx, hz) !== HALL) return false;
    edgeWall(zb, x, z, dx, dz, kind, rm.wall, p.wallMat);
    if (kind === W.DOOR) { doorCells.add(x + ',' + z); doorCells.add(hx + ',' + hz); (rm.doors = rm.doors || []).push({ x, z, dx, dz, hx, hz }); }
    return true;
  };
  for (const rm of rooms) {
    const dirC = hallSide(rm);
    const wa = rm.a1 - rm.a0;
    if (rm.type === 'gym' || rm.type === 'cafeteria' || rm.type === 'multi' || rm.type === 'library') {
      const nDouble = rm.type === 'gym' && wa >= 16 ? 2 : 1;
      for (const dc2 of rm.merged ? [-1, 1] : [dirC]) {
        for (let k = 0; k < nDouble; k++) {
          const at = nDouble === 1 ? rm.a0 + Math.floor(wa / 2) - 1 : rm.a0 + (k === 0 ? 2 : wa - 4);
          addDoor(rm, at, dc2); addDoor(rm, at + 1, dc2);
        }
      }
    } else if (rm.type === 'classroom' || rm.type === 'science' || rm.type === 'lounge') {
      const front = r.chance(0.5) ? -1 : 1; // students face -A or +A
      rm.front = front;
      // door at the back end of the room, a second at the front sometimes
      const back = front < 0 ? rm.a1 - 2 : rm.a0 + 1;
      addDoor(rm, back, dirC);
      if (wa >= 8 && r.chance(0.45)) addDoor(rm, front < 0 ? rm.a0 + 1 : rm.a1 - 2, dirC);
      // windows into the hallway
      if (r.chance(0.75)) {
        for (let a = rm.a0 + 2; a < rm.a1 - 2; a++) {
          if (Math.abs(a - back) < 2) continue;
          if (r.chance(0.25)) continue;
          const c = dirC > 0 ? rm.c1 - 1 : rm.c0;
          const [x, z] = XZ(a, c);
          const [dx, dz] = alongX ? [0, dirC] : [dirC, 0];
          if (tAt(x + dx, z + dz) === HALL && !doorCells.has(x + ',' + z)) edgeWall(zb, x, z, dx, dz, W.WINDOW, rm.wall, p.wallMat);
        }
      }
    } else {
      // small rooms: one door to the hall, or to the spine if they touch it
      const spineSide = spines.find((s) => s.a1 === rm.a0 || s.a0 === rm.a1);
      if (spineSide && r.chance(0.5)) {
        const dA = spineSide.a1 === rm.a0 ? -1 : 1;
        const a = dA < 0 ? rm.a0 : rm.a1 - 1;
        const c = rm.c0 + Math.floor((rm.c1 - rm.c0) / 2);
        const [x, z] = XZ(a, c);
        const [dx, dz] = alongX ? [dA, 0] : [0, dA];
        if (tAt(x + dx, z + dz) === HALL) {
          edgeWall(zb, x, z, dx, dz, W.DOOR, rm.wall, p.wallMat);
          doorCells.add(x + ',' + z); doorCells.add((x + dx) + ',' + (z + dz));
          (rm.doors = rm.doors || []).push({ x, z, dx, dz, hx: x + dx, hz: z + dz });
          continue;
        }
      }
      addDoor(rm, rm.a0 + Math.floor((rm.a1 - rm.a0) / 2), dirC);
    }
    if (!rm.doors || !rm.doors.length) {
      // fall back: any edge of the room that touches a hallway
      outer: for (let x = rm.x0; x < rm.x1; x++) for (let z = rm.z0; z < rm.z1; z++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (tAt(x + dx, z + dz) !== HALL || (x + dx >= rm.x0 && x + dx < rm.x1 && z + dz >= rm.z0 && z + dz < rm.z1)) continue;
        edgeWall(zb, x, z, dx, dz, W.DOOR, rm.wall, p.wallMat);
        doorCells.add(x + ',' + z); doorCells.add((x + dx) + ',' + (z + dz));
        rm.doors = [{ x, z, dx, dz, hx: x + dx, hz: z + dz }];
        break outer;
      }
    }
  }

  // ---- furnish
  const ctx = { zb, r, p, alongX, XZ, gateCells, doorCells };
  for (const rm of rooms) {
    if ((rm.type === 'classroom' || rm.type === 'science') && tryRoomPiece(zb, rm, r, 0.12)) { rm.type = 'piece'; continue; }
    furnish(ctx, rm);
  }
  dressHalls(ctx, halls, spines, A0, A1, C0, C1, tAt);
  // ---- lights
  for (const h of halls) {
    const cm = (h.c0 + h.c1) / 2;
    const ph = r.int(0, 2);
    for (let a = A0 + 1 + ph; a < A1 - 1; a += 4) {
      const [x, z] = XZ(a + 0.5, cm);
      if (tAt(Math.floor(x), Math.floor(z)) !== HALL) continue;
      ceilingLight(zb, x, z, p.hallLight, lightState(r, p.fail, p.flicker), { rot: alongX ? 1 : 0, hang: 0.3, mul: p.hallLight === 'bulb' ? 1.25 : 1 });
    }
  }
  for (const s of spines) {
    const am = (s.a0 + s.a1) / 2;
    for (let c = s.c0 + 1; c < s.c1 - 1; c += 4) {
      if (halls.some((h) => c >= h.c0 - 1 && c < h.c1 + 1)) continue;
      const [x, z] = XZ(am, c + 0.5);
      ceilingLight(zb, x, z, p.hallLight, lightState(r, p.fail, p.flicker), { rot: alongX ? 0 : 1, hang: 0.3, mul: p.hallLight === 'bulb' ? 1.25 : 1 });
    }
  }
  for (const rm of rooms) if (rm.type !== 'piece') roomLights(ctx, rm);
  zb.bInfo = { rooms: rooms.map((m) => [m.type, m.x0, m.z0, m.x1, m.z1]), halls: halls.map((h) => [h.c0, h.c1]), spines: spines.map((s) => [s.a0, s.a1, s.c0, s.c1]), alongX };
}

function splitRestrooms(m, rooms, r) {
  const wa = m.a1 - m.a0;
  const cut = m.a0 + Math.floor(wa / 2);
  const twin = { ...m, a0: cut, type: 'restroom', first: false };
  m.a1 = cut; m.type = 'restroom';
  rooms.push(twin);
  void r;
}

// ------------------------------------------------------------------ rooms
function furnish(ctx, rm) {
  const { zb, r } = ctx;
  switch (rm.type) {
    case 'classroom': case 'science': classroom(ctx, rm); break;
    case 'gym': gym(ctx, rm); break;
    case 'cafeteria': cafeteria(ctx, rm); break;
    case 'library': library(ctx, rm); break;
    case 'multi': multi(ctx, rm); break;
    case 'restroom': restroomS(ctx, rm); break;
    case 'lounge': lounge(ctx, rm); break;
    case 'office': office(ctx, rm); break;
    default: storage(ctx, rm); break;
  }
  // a few wall details
  for (const f of spots(ctx, rm, 2)) {
    const u = r.next();
    if (u < 0.4) zb.decal(f.x, 0.3, f.z, f.face, 0.14, 0.2, 'dec_outlet');
    else if (u < 0.6) zb.decal(f.x, 1.3, f.z, f.face, 0.14, 0.22, 'dec_switch');
  }
  if (ctx.p.abandoned && rm.type !== 'restroom') {
    for (let k = 0; k < ((rm.x1 - rm.x0) * (rm.z1 - rm.z0)) / 25; k++) {
      const x = r.int(rm.x0, rm.x1 - 1), z = r.int(rm.z0, rm.z1 - 1);
      floorDecal(zb, x + r.next(), z + r.next(), r.pick(['dec_paper', 'dec_paper', 'dec_stain', 'dec_scuff']), r.range(0.4, 1.0), r);
    }
  }
}

// wall faces inside a room that are clear of doors and gates
function spots(ctx, rm, n, opts = {}) {
  const { zb, r, doorCells, gateCells } = ctx;
  const out = [];
  for (let k = 0; k < n * 10 && out.length < n; k++) {
    const x = r.int(rm.x0, rm.x1 - 1), z = r.int(rm.z0, rm.z1 - 1);
    const [dx, dz] = r.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    if (doorCells.has(x + ',' + z) || gateCells.has(x + ',' + z)) continue;
    if (opts.notAlong !== undefined && (ctx.alongX ? dz !== 0 : dx !== 0) && opts.notAlong) continue;
    const f = wallFace(zb, x, z, dx, dz);
    if (!f) continue;
    if (out.some((o) => Math.abs(o.x - f.x) + Math.abs(o.z - f.z) < 1.2)) continue;
    out.push(f);
  }
  return out;
}

const clearOf = (ctx, x, z) => !ctx.gateCells.has(Math.floor(x) + ',' + Math.floor(z)) && !ctx.doorCells.has(Math.floor(x) + ',' + Math.floor(z));

function classroom(ctx, rm) {
  const { zb, r, p, XZ } = ctx;
  const front = rm.front || 1;
  const wa = rm.a1 - rm.a0, dc = rm.c1 - rm.c0;
  // A coordinate of the front wall face and the direction students look
  const aFront = front > 0 ? rm.a1 - 0.1 : rm.a0 + 0.1;
  const look = front; // +1: students face +A
  const cMid = (rm.c0 + rm.c1) / 2;
  const faceName = (dA) => (ctx.alongX ? (dA > 0 ? 'nx' : 'px') : (dA > 0 ? 'nz' : 'pz'));
  const [bx, bz] = XZ(aFront, cMid);
  const boardW = Math.min(dc - 2.4, 4.2);
  zb.decal(bx, 1.45, bz, faceName(front), boardW, 1.15, rm.type === 'science' ? 'whiteboard' : 'chalkboard');
  // chalk ledge
  const [l0x, l0z] = XZ(aFront - front * 0.06, cMid - boardW / 2), [l1x, l1z] = XZ(aFront, cMid + boardW / 2);
  zb.box(Math.min(l0x, l1x), 0.86, Math.min(l0z, l1z), Math.max(l0x, l1x), 0.9, Math.max(l0z, l1z), M.wood_dark, { collide: false });
  const [cx, cz] = XZ(aFront, cMid + r.range(-0.5, 0.5));
  zb.prop('b_clock', cx, 2.42, cz, facing(...(ctx.alongX ? [-front, 0] : [0, -front])), { face: r.pick(['clock_a', 'clock_b', 'clock_c']) });
  // teacher's desk and chair
  const [tx, tz] = XZ(aFront - front * 1.6, cMid + r.pick([-1, 1]) * Math.min(1.6, dc / 2 - 1.4));
  const toClass = ctx.alongX ? [-front, 0] : [0, -front];
  if (clearOf(ctx, tx, tz)) {
    zb.prop('teacher_desk', tx, 0, tz, facing(...toClass));
    const [chx, chz] = XZ(aFront - front * 0.85, (ctx.alongX ? tz : tx) + r.range(-0.2, 0.2));
    zb.prop('chair_school', chx, 0, chz, facing(...toClass) + r.range(-0.3, 0.3));
    if (r.chance(0.5)) zb.prop('papers', tx, 0.77, tz, 0, { n: r.int(2, 4) });
    if (r.chance(0.3)) zb.prop('book', tx + 0.3, 0.77, tz, r.range(0, 3));
  }
  // student desks in rows
  const mode = p.abandoned ? r.weighted([['rows', 4], ['up', 2], ['scatter', 2], ['empty', 1.2]]) : r.weighted([['rows', 6], ['up', 2.5], ['empty', 1]]);
  const lab = rm.type === 'science';
  // keep classrooms light on triangles: at most 3 rows of 4
  const rowsA = clamp(Math.floor((wa - 3.4) / (lab ? 1.8 : 1.25)), 1, 3) - (r.chance(0.3) ? 1 : 0);
  const colsC = clamp(Math.floor((dc - 1.6) / (lab ? 2.4 : 1.25)), 1, lab ? 3 : wa * dc < 70 ? 3 : 4);
  const sA = lab ? 1.8 : 1.25, sC = lab ? 2.4 : 1.25;
  const firstA = aFront - front * 2.9;
  if (mode !== 'empty') {
    for (let i = 0; i < rowsA; i++) for (let j = 0; j < colsC; j++) {
      const a = firstA - front * i * sA;
      const c = cMid + (j - (colsC - 1) / 2) * sC;
      let [dx, dz] = XZ(a, c);
      if (mode === 'scatter') { dx += r.range(-0.4, 0.4); dz += r.range(-0.4, 0.4); }
      if (!clearOf(ctx, dx, dz)) continue;
      if (mode === 'scatter' && r.chance(0.25)) continue;
      const rot = facing(...(ctx.alongX ? [front, 0] : [0, front]));
      if (lab) {
        zb.prop('table', dx, 0, dz, rot + Math.PI / 2, { len: 1.8, depth: 0.7, top: 'plastic_black' });
        for (const o of [-0.45, 0.45]) {
          const [sx, sz] = XZ(a - front * 0.6, c + o);
          zb.prop('chair_school', sx, 0, sz, rot + r.range(-0.2, 0.2));
        }
        continue;
      }
      const jit = mode === 'scatter' ? r.range(-0.5, 0.5) : r.range(-0.03, 0.03);
      zb.prop('school_desk', dx, 0, dz, rot + jit);
      const [sx, sz] = XZ(a - front * 0.52, c);
      if (mode === 'up') zb.prop('chair_school', dx, 1.16, dz, rot + Math.PI, { flip: true });
      else if (mode === 'scatter' && r.chance(0.2)) zb.prop('chair_school', sx + r.range(-0.3, 0.3), 0, sz + r.range(-0.3, 0.3), r.range(0, 6.28), { roll: Math.PI / 2, collide: true });
      else if (!(mode === 'scatter' && r.chance(0.2))) zb.prop('chair_school', sx, 0, sz, rot + jit + r.range(-0.08, 0.08));
    }
  }
  // back of the room: cork board, shelf, posters
  const aBack = front > 0 ? rm.a0 + 0.1 : rm.a1 - 0.1;
  const [kx, kz] = XZ(aBack, cMid);
  zb.decal(kx, 1.55, kz, faceName(-front), Math.min(2.2, dc - 2), 1.0, 'cork');
  for (const f of spots(ctx, rm, 3)) {
    const u = r.next();
    if (u < 0.15) propOnWall(zb, f, 'bookshelf', 0, { w: 0.9, h: 1.6 }, 0.17);
    else if (u < 0.7) zb.decal(f.x, 1.6, f.z, f.face, 0.5, 0.65, r.pick(['poster_wash', 'poster_safety', 'poster_notice', 'calendar']));
    else if (u < 0.8 && p.variant === 'old') propOnWall(zb, f, 'radiator', 0, {}, 0.1);
  }
  if (r.chance(0.5)) {
    const [wx, wz] = XZ(aFront - front * 0.4, rm.c0 + 0.5 + (r.chance(0.5) ? 0 : dc - 1));
    if (clearOf(ctx, wx, wz)) zb.prop('trash_can', wx, 0, wz, 0);
  }
}

function gym(ctx, rm) {
  const { zb, r, p } = ctx;
  const { x0, z0, x1, z1 } = rm;
  const w = x1 - x0, d = z1 - z0;
  const longX = w >= d;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // court lines: thin white strips just above the floor
  const lw = 0.07, y0 = 0.004, y1 = 0.012;
  const m = 1.6;
  const ln = (ax, az, bx, bz) => zb.box(ax, y0, az, bx, y1, bz, M.white, { collide: false, skip: 1 | 2 | 8 | 16 | 32 });
  const bx0 = x0 + m, bx1 = x1 - m, bz0 = z0 + m, bz1 = z1 - m;
  ln(bx0, bz0, bx1, bz0 + lw); ln(bx0, bz1 - lw, bx1, bz1); ln(bx0, bz0, bx0 + lw, bz1); ln(bx1 - lw, bz0, bx1, bz1);
  if (longX) ln(cx - lw / 2, bz0, cx + lw / 2, bz1); else ln(bx0, cz - lw / 2, bx1, cz + lw / 2);
  zb.decal(cx, 0, cz, 'up', 3.6, 3.6, 'b_court', { rot: 0 });
  // keys
  for (const s of [-1, 1]) {
    const kx = longX ? (s < 0 ? bx0 : bx1) : cx, kz = longX ? cz : (s < 0 ? bz0 : bz1);
    const kl = Math.min(4.5, (longX ? w : d) / 2 - 3);
    if (longX) { const ax = s < 0 ? kx : kx - kl; ln(ax, kz - 2.4, ax + kl, kz - 2.4 + lw); ln(ax, kz + 2.4 - lw, ax + kl, kz + 2.4); ln(s < 0 ? kx + kl - lw : kx - kl, kz - 2.4, s < 0 ? kx + kl : kx - kl + lw, kz + 2.4); }
    else { const az = s < 0 ? kz : kz - kl; ln(kx - 2.4, az, kx - 2.4 + lw, az + kl); ln(kx + 2.4 - lw, az, kx + 2.4, az + kl); ln(kx - 2.4, s < 0 ? kz + kl - lw : kz - kl, kx + 2.4, s < 0 ? kz + kl : kz - kl + lw); }
    const fx = longX ? (s < 0 ? kx + kl : kx - kl) : kx, fz = longX ? kz : (s < 0 ? kz + kl : kz - kl);
    zb.decal(fx, 0, fz, 'up', 3.6, 3.6, 'b_court', { rot: 0.3 });
    // hoop on the end wall
    const hx = longX ? (s < 0 ? x0 + 0.1 : x1 - 0.1) : cx, hz = longX ? cz : (s < 0 ? z0 + 0.1 : z1 - 0.1);
    zb.prop('b_hoop', hx, 0, hz, facing(longX ? -s : 0, longX ? 0 : -s));
  }
  // bleachers along one long wall, avoiding its doors
  const blockedSide = (sd) => {
    if ((rm.doors || []).some((dd) => (longX ? dd.dz === sd : dd.dx === sd))) return true;
    // gates along that wall
    for (const g of ctx.zb.gates) {
      const inX = g.x >= x0 && g.x < x1, inZ = g.z >= z0 && g.z < z1;
      if (!inX || !inZ) continue;
      if (longX ? (sd < 0 ? g.z < z0 + 4 : g.z >= z1 - 4) : (sd < 0 ? g.x < x0 + 4 : g.x >= x1 - 4)) return true;
    }
    return false;
  };
  let side = r.sign();
  if (blockedSide(side)) side = -side;
  const noBleachers = blockedSide(side);
  const rowsN = noBleachers ? 0 : r.int(3, 5);
  for (let k = 0; k < rowsN; k++) {
    const depth0 = 0.1 + k * 0.75, h = 0.42 * (k + 1);
    const a0 = (longX ? x0 : z0) + 3, a1 = (longX ? x1 : z1) - 3;
    if (longX) {
      const zA = side < 0 ? z0 + depth0 : z1 - depth0 - 0.75;
      zb.box(a0, 0, zA, a1, h, zA + 0.75, M.wood, { sub: 0 });
    } else {
      const xA = side < 0 ? x0 + depth0 : x1 - depth0 - 0.75;
      zb.box(xA, 0, a0, xA + 0.75, h, a1, M.wood, { sub: 0 });
    }
  }
  // a few balls and stacked chairs
  for (let k = 0; k < r.int(1, 4); k++) {
    const bx = cx + r.range(-w / 3, w / 3), bz = cz + r.range(-d / 4, d / 4);
    if (clearOf(ctx, bx, bz)) zb.prop('ball', bx, 0, bz, 0, { tint: [1.3, 0.7, 0.35] });
  }
  if (r.chance(0.5)) {
    const sx = x0 + 0.6 + r.next() * 2, sz = (side < 0 ? z1 - 0.6 : z0 + 0.6);
    if (clearOf(ctx, sx, sz)) zb.prop('stack_chairs', sx, 0, sz, r.range(-0.2, 0.2), { n: r.int(8, 16) });
  }
  zb.decal(longX ? x0 + w * 0.25 : x0 + 0.1, 2.9, longX ? (side < 0 ? z1 - 0.1 : z0 + 0.1) : z0 + d * 0.25, longX ? (side < 0 ? 'nz' : 'pz') : 'px', 1.0, 0.6, 'sign_occupancy');
  rm.lights = 'gym';
  void p;
}

function cafeteria(ctx, rm) {
  const { zb, r } = ctx;
  const { x0, z0, x1, z1 } = rm;
  const w = x1 - x0, d = z1 - z0;
  const longX = w >= d;
  // serving counter along the far end wall
  const len = Math.min((longX ? d : w) - 3, 6);
  const endA = r.chance(0.5) ? -1 : 1;
  const cc = longX ? (z0 + z1) / 2 : (x0 + x1) / 2;
  for (let k = 0; k < Math.floor(len); k++) {
    const t = cc - len / 2 + 0.5 + k;
    const px = longX ? (endA < 0 ? x0 + 1.5 : x1 - 1.5) : t, pz = longX ? t : (endA < 0 ? z0 + 1.5 : z1 - 1.5);
    if (!clearOf(ctx, px, pz)) continue;
    zb.prop('counter', px, 0, pz, facing(longX ? -endA : 0, longX ? 0 : -endA), { len: 1.0 });
    if (r.chance(0.3)) zb.prop('b_tray', px, 0.92, pz, r.range(-0.2, 0.2), { cloche: false });
  }
  // long tables with benches
  const nT = Math.max(1, Math.floor(((longX ? w : d) - 5) / 3.2));
  const nR = Math.max(1, Math.floor(((longX ? d : w) - 2) / 4.6));
  for (let i = 0; i < nT; i++) for (let j = 0; j < nR; j++) {
    const a = (longX ? x0 : z0) + 2.6 + i * 3.2 + (endA < 0 ? 2 : 0);
    const c = (longX ? z0 : x0) + ((longX ? d : w) - (nR - 1) * 4.6) / 2 + j * 4.6;
    const px = longX ? a : c, pz = longX ? c : a;
    if (!clearOf(ctx, px, pz)) continue;
    const tl = 3.4;
    zb.prop('table', px, 0, pz, longX ? Math.PI / 2 : 0, { len: tl, depth: 0.8, top: 'plastic_white' });
    for (const s of [-0.7, 0.7]) zb.prop('bench', longX ? px + s : px, 0, longX ? pz : pz + s, longX ? Math.PI / 2 : 0, { len: tl - 0.2 });
    if (r.chance(0.2)) zb.prop('b_tray', px + r.range(-0.2, 0.2), 0.75, pz + r.range(-0.6, 0.6), r.range(0, 6), { cloche: false });
  }
  for (const f of spots(ctx, rm, 3)) {
    const u = r.next();
    if (u < 0.4) propOnWall(zb, f, 'vending', 0, {}, 0.45);
    else if (u < 0.7) propOnWall(zb, f, 'trash_can', 0, {}, 0.25);
    else zb.decal(f.x, 1.7, f.z, f.face, 0.6, 0.6, 'poster_wash');
  }
}

function library(ctx, rm) {
  const { zb, r } = ctx;
  const { x0, z0, x1, z1 } = rm;
  const w = x1 - x0, d = z1 - z0;
  const longX = w >= d;
  // free-standing shelf rows on one half, reading tables on the other
  const half = r.chance(0.5) ? -1 : 1;
  const L = longX ? w : d, Dd = longX ? d : w;
  const a0 = longX ? x0 : z0, c0 = longX ? z0 : x0;
  for (let a = a0 + 2; a < a0 + L / 2 - 1; a += 2.2) {
    const aa = half < 0 ? a : a0 + L - (a - a0);
    for (let c = c0 + 1.6; c < c0 + Dd - 1.6; c += 1.0) {
      const px = longX ? aa : c, pz = longX ? c : aa;
      if (!clearOf(ctx, px, pz)) continue;
      zb.prop('bookshelf', px, 0, pz, longX ? Math.PI / 2 : 0, { w: 0.95, h: 1.7 });
    }
  }
  for (let k = 0; k < 3; k++) {
    const a = half < 0 ? a0 + L * 0.62 + k * 2.4 : a0 + L * 0.38 - k * 2.4;
    const c = c0 + Dd / 2 + r.range(-0.4, 0.4);
    const px = longX ? a : c, pz = longX ? c : a;
    if (a < a0 + 1.5 || a > a0 + L - 1.5 || !clearOf(ctx, px, pz)) continue;
    zb.prop('table', px, 0, pz, longX ? Math.PI / 2 : 0, { len: 2.0, depth: 1.0 });
    for (const s of [-0.75, 0.75]) for (const t of [-0.5, 0.5]) {
      if (r.chance(0.25)) continue;
      zb.prop('chair_school', longX ? px + s : px + t, 0, longX ? pz + t : pz + s, facing(longX ? -Math.sign(s) : 0, longX ? 0 : -Math.sign(s)) + r.range(-0.3, 0.3));
    }
    if (r.chance(0.5)) zb.prop('book', px, 0.76, pz, r.range(0, 6), { open: true });
  }
  for (const f of spots(ctx, rm, 2)) zb.decal(f.x, 1.7, f.z, f.face, 0.6, 0.6, r.pick(['poster_notice', 'calendar']));
}

function multi(ctx, rm) {
  const { zb, r } = ctx;
  const { x0, z0, x1, z1 } = rm;
  // folded tables and towers of stacked chairs along the walls, a podium nobody uses
  for (const f of spots(ctx, rm, 6)) {
    if (r.chance(0.6)) propOnWall(zb, f, 'stack_chairs', 0, { n: r.int(6, 14) }, 0.3);
    else zb.prop('table', f.x - f.dx * 0.5, 0, f.z - f.dz * 0.5, facing(-f.dx, -f.dz), { len: 1.8, depth: 0.75 });
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (r.chance(0.6)) zb.prop('podium', cx, 0, cz, r.range(0, 6.28));
}

function restroomS(ctx, rm) {
  const { zb, r } = ctx;
  const { x0, z0, x1, z1 } = rm;
  const w = x1 - x0, d = z1 - z0;
  const door = (rm.doors || [])[0];
  // stalls along the wall opposite the door, sinks on a side wall
  const stallAlongX = door ? door.dz !== 0 : w >= d;
  const far = door ? (stallAlongX ? (door.dz > 0 ? -1 : 1) : (door.dx > 0 ? -1 : 1)) : -1;
  const n = Math.max(1, Math.floor(((stallAlongX ? w : d) - 0.6) / 1.15));
  for (let k = 0; k < n; k++) {
    const t = (stallAlongX ? x0 : z0) + 0.3 + k * 1.15;
    if (stallAlongX) {
      const zA = far < 0 ? z0 : z1 - 1.45;
      zb.box(t, 0.12, zA, t + 0.04, 1.9, zA + 1.45, M.stall);
      if (k === n - 1) zb.box(t + 1.15, 0.12, zA, t + 1.19, 1.9, zA + 1.45, M.stall);
      zb.prop('toilet', t + 0.58, 0, far < 0 ? z0 + 0.45 : z1 - 0.45, far < 0 ? Math.PI : 0);
    } else {
      const xA = far < 0 ? x0 : x1 - 1.45;
      zb.box(xA, 0.12, t, xA + 1.45, 1.9, t + 0.04, M.stall);
      if (k === n - 1) zb.box(xA, 0.12, t + 1.15, xA + 1.45, 1.9, t + 1.19, M.stall);
      zb.prop('toilet', far < 0 ? x0 + 0.45 : x1 - 0.45, 0, t + 0.58, far < 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  }
  // sinks + mirrors on a side wall
  const sinkSide = r.sign();
  for (let k = 0; k < 3; k++) {
    let f = null;
    if (stallAlongX) { const x = sinkSide < 0 ? x0 : x1 - 1; const z = far < 0 ? z0 + 2 + k : z1 - 3 - k; if (z >= z0 && z < z1) f = wallFace(zb, x, z, sinkSide, 0); }
    else { const z = sinkSide < 0 ? z0 : z1 - 1; const x = far < 0 ? x0 + 2 + k : x1 - 3 - k; if (x >= x0 && x < x1) f = wallFace(zb, x, z, 0, sinkSide); }
    if (!f || ctx.doorCells.has(Math.floor(f.x - f.dx * 0.5) + ',' + Math.floor(f.z - f.dz * 0.5))) continue;
    propOnWall(zb, f, 'sink', 0, { drip: r.chance(0.3) }, 0.24);
    zb.decal(f.x, 1.55, f.z, f.face, 0.55, 0.7, 'mirror');
  }
}

function lounge(ctx, rm) {
  const { zb, r } = ctx;
  const cx = (rm.x0 + rm.x1) / 2, cz = (rm.z0 + rm.z1) / 2;
  zb.prop('sofa', cx, 0, cz - 1.2, 0, { fabric: r.pick(['fabric_brown', 'fabric_floral']) });
  zb.prop('coffee_table', cx, 0, cz + 0.1, 0);
  if (r.chance(0.6)) zb.prop('papers', cx, 0.42, cz + 0.1, 0, { n: r.int(2, 4) });
  const sp = spots(ctx, rm, 3);
  if (sp[0]) propOnWall(zb, sp[0], 'vending', 0, {}, 0.45);
  if (sp[1]) propOnWall(zb, sp[1], 'counter', 0, { len: 1.0 }, 0.31);
  if (sp[1]) zb.prop('coffee_maker', sp[1].x - sp[1].dx * 0.3, 0.92, sp[1].z - sp[1].dz * 0.3, facing(-sp[1].dx, -sp[1].dz));
  if (sp[2]) zb.decal(sp[2].x, 1.5, sp[2].z, sp[2].face, 1.0, 0.8, 'cork');
}

function office(ctx, rm) {
  const { zb, r } = ctx;
  const cx = (rm.x0 + rm.x1) / 2, cz = (rm.z0 + rm.z1) / 2;
  const rot = r.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
  if (clearOf(ctx, cx, cz)) {
    zb.prop('desk_metal', cx, 0, cz, rot);
    zb.prop('chair_folding', cx + Math.sin(rot) * 0.8, 0, cz - Math.cos(rot) * 0.8, rot + Math.PI + r.range(-0.4, 0.4));
    if (r.chance(0.6)) zb.prop('phone', cx + 0.4, 0.76, cz, rot + Math.PI, { useY: 0.1 });
    if (r.chance(0.5)) zb.prop('papers', cx - 0.3, 0.76, cz, 0, { n: r.int(2, 5) });
  }
  for (const f of spots(ctx, rm, 2)) propOnWall(zb, f, 'filing_cabinet', 0, {}, 0.36);
}

function storage(ctx, rm) {
  const { zb, r } = ctx;
  for (const f of spots(ctx, rm, 4)) {
    const u = r.next();
    if (u < 0.4) propOnWall(zb, f, 'shelf_metal', 0, { w: 1.0, h: 2.0 }, 0.26);
    else if (u < 0.7) propOnWall(zb, f, 'box_stack', 0, {}, 0.35);
    else if (u < 0.85) propOnWall(zb, f, 'bucket', 0, {}, 0.3);
    else propOnWall(zb, f, 'stack_chairs', 0, { n: r.int(5, 12) }, 0.3);
  }
  if (r.chance(0.4)) zb.prop('cart_cleaning', (rm.x0 + rm.x1) / 2, 0, (rm.z0 + rm.z1) / 2, r.range(0, 6));
}

function roomLights(ctx, rm) {
  const { zb, r, p } = ctx;
  const { x0, z0, x1, z1 } = rm;
  const w = x1 - x0, d = z1 - z0;
  const dead = p.abandoned && r.chance(0.3);
  const st = () => (dead ? (r.chance(0.15) ? 'flicker' : 'off') : lightState(r, p.fail, p.flicker));
  if (rm.lights === 'gym') {
    for (let z = z0 + 2.5; z < z1 - 1; z += 5) for (let x = x0 + 2.5; x < x1 - 1; x += 5) ceilingLight(zb, x, z, 'highbay', st(), { hang: 0.5, rad: 8, mul: 0.95 });
    return;
  }
  if (rm.type === 'restroom' || rm.type === 'storage' || w * d < 16) { ceilingLight(zb, (x0 + x1) / 2, (z0 + z1) / 2, p.variant === 'old' ? 'bulb' : 'panel', st(), { hang: 0.3 }); return; }
  const nx = w >= 11 ? (w >= 18 ? 3 : 2) : w >= 6 && w >= d ? 2 : 1, nz = d >= 11 ? (d >= 18 ? 3 : 2) : d >= 6 && d > w ? 2 : 1;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = x0 + (w / nx) * (i + 0.5), z = z0 + (d / nz) * (j + 0.5);
    ceilingLight(zb, x, z, p.variant === 'old' && rm.type !== 'cafeteria' ? 'bulb' : 'troffer', st(), { rot: ctx.alongX ? 1 : 0, hang: 0.4, mul: p.variant === 'old' ? 1.2 : 1 });
  }
}

// ------------------------------------------------------------------ hallways
function dressHalls(ctx, halls, spines, A0, A1, C0, C1, tAt) {
  const { zb, r, p, XZ, alongX, doorCells, gateCells } = ctx;
  // walk both walls of each hallway, collecting free stretches
  const runs = [];
  const collect = (fixedA, a0, a1, c, dirC) => {
    // runs along A at cross coordinate c, wall in direction dirC (along C)
    let cur = null;
    for (let a = a0; a <= a1; a++) {
      let ok = a < a1;
      let f = null;
      if (ok) {
        const [x, z] = XZ(a, c);
        const [dx, dz] = alongX ? [0, dirC] : [dirC, 0];
        ok = tAt(x, z) === HALL && !doorCells.has(x + ',' + z) && !gateCells.has(x + ',' + z);
        if (ok) { f = wallFace(zb, x, z, dx, dz); ok = !!f; }
      }
      if (ok) { if (!cur) cur = { faces: [] }; cur.faces.push(f); }
      else if (cur) { runs.push(cur); cur = null; }
    }
    void fixedA;
  };
  for (const h of halls) { collect(0, A0, A1, h.c0, -1); collect(0, A0, A1, h.c1 - 1, 1); }
  // spine walls run along C
  const collectC = (s) => {
    for (const [aa, dirA] of [[s.a0, -1], [s.a1 - 1, 1]]) {
      let cur = null;
      for (let c = s.c0; c <= s.c1; c++) {
        let ok = c < s.c1, f = null;
        if (ok) {
          const [x, z] = XZ(aa, c);
          const [dx, dz] = alongX ? [dirA, 0] : [0, dirA];
          ok = !doorCells.has(x + ',' + z) && !gateCells.has(x + ',' + z) && !halls.some((h) => c >= h.c0 && c < h.c1);
          if (ok) { f = wallFace(zb, x, z, dx, dz); ok = !!f; }
        }
        if (ok) { if (!cur) cur = { faces: [] }; cur.faces.push(f); }
        else if (cur) { runs.push(cur); cur = null; }
      }
    }
  };
  for (const s of spines) collectC(s);
  let fountains = 0, trophies = 0;
  for (const run of runs) {
    const n = run.faces.length;
    if (n < 2) {
      if (n === 1 && r.chance(0.3)) { const f = run.faces[0]; zb.decal(f.x, 1.6, f.z, f.face, 0.5, 0.65, r.pick(['poster_safety', 'poster_notice', 'poster_wash'])); }
      continue;
    }
    const f0 = run.faces[0], fN = run.faces[n - 1];
    const u = r.next();
    if (u < 0.72) {
      // locker bank over the run (keep a little gap at both ends)
      const s0 = n >= 4 ? 1 : 0, s1 = n >= 4 ? n - 1 : n;
      const fa = run.faces[s0], fb = run.faces[s1 - 1];
      const len = s1 - s0;
      const mx = (fa.x + fb.x) / 2, mz = (fa.z + fb.z) / 2;
      const nDoors = Math.floor(len * 2.45);
      if (nDoors >= 2) {
        propOnWall(zb, { ...fa, x: mx, z: mz }, 'b_locker', 0, { n: nDoors, tint: p.lockerTint, h: r.chance(0.2) ? 0.92 : 1.85 }, 0.26);
        // posters above the lockers
        if (r.chance(0.4)) zb.decal(mx, 2.3, mz, fa.face, 0.55, 0.5, r.pick(['poster_safety', 'poster_notice', 'calendar']));
      }
      if (n >= 4) {
        const fx = r.chance(0.5) ? f0 : fN;
        if (fountains < 3 && r.chance(0.35)) { zb.prop('b_fountain', fx.x, 0, fx.z, facing(-fx.dx, -fx.dz), { mat: r.chance(0.6) ? 'chrome' : 'porcelain' }); fountains++; }
        else if (r.chance(0.3)) zb.prop('extinguisher', fx.x, 0, fx.z, facing(-fx.dx, -fx.dz));
      }
    } else if (u < 0.82 && trophies < 2 && n >= 3) {
      const mid = run.faces[Math.floor(n / 2)];
      zb.prop('b_trophy_case', mid.x - mid.dx * 0.3, 0, mid.z - mid.dz * 0.3, facing(-mid.dx, -mid.dz), { len: Math.min(2.6, n - 0.6) });
      trophies++;
    } else if (u < 0.92) {
      const mid = run.faces[Math.floor(n / 2)];
      zb.decal(mid.x, 1.5, mid.z, mid.face, Math.min(2.4, n - 0.6), 1.0, 'cork');
      if (r.chance(0.5)) zb.prop('bench', mid.x - mid.dx * 0.25, 0, mid.z - mid.dz * 0.25, facing(-mid.dx, -mid.dz), { len: Math.min(2.0, n - 0.6) });
    } else {
      for (const f of run.faces) if (r.chance(0.3)) zb.decal(f.x, 1.6, f.z, f.face, 0.5, 0.65, r.pick(['poster_safety', 'poster_notice', 'poster_wash', 'poster_map']));
    }
    // clocks over some stretches
    if (n >= 3 && r.chance(0.18)) { const f = run.faces[Math.floor(n / 2)]; zb.prop('b_clock', f.x, 2.45, f.z, facing(-f.dx, -f.dz), { face: r.pick(['clock_a', 'clock_b', 'clock_c']) }); }
  }
  // exit signs where hallways meet, a few papers in the halls
  for (const s of spines) for (const h of halls) {
    const [x, z] = XZ((s.a0 + s.a1) / 2, h.c0 + 0.3);
    if (r.chance(0.6)) zb.prop('exit_sign', x, zb.getCeil(Math.floor(x), Math.floor(z)), z, alongX ? 0 : Math.PI / 2, { green: r.chance(0.4) });
  }
  if (p.abandoned) {
    for (let k = 0; k < (A1 - A0) / 4; k++) {
      const h = r.pick(halls);
      const [x, z] = XZ(r.int(A0, A1 - 1) + r.next(), h.c0 + r.next() * (h.c1 - h.c0));
      floorDecal(zb, x, z, r.pick(['dec_paper', 'dec_paper', 'dec_stain', 'dec_scuff']), r.range(0.4, 1.1), r);
    }
  }
  void C0; void C1;
}

defineZone('school', {
  border: 'wall',
  gate: 'door',
  minW: 32, minD: 32,
  weight: (c) => {
    if (c.dim !== 0 || c.dist <= 150) return 0;
    return 0.85 + c.office * 0.5;
  },
  params: schoolParams,
  gen: genSchool,
});
