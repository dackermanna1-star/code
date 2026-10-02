// Zone type 'storage': archive stacks, supply rooms, an empty storage hall, a maze of stacked
// boxes and a hall of old furniture. Normal height, walled, doors.
import { defineZone } from '../zonetypes.js';
import { W, CF, M, ceilingLight, freeCell, openCell, findWallSpots, propOnWall, floorDecal, facing, env, wallFace, DIRS4 } from './common.js';
import { tryRoomPiece } from '../roompieces.js';
import { tbox, bar, floorLine, keepClearMask, lightState, rectClear } from './a_common.js';

const VARIANTS = {
  archive: { ceil: [2.8, 3.0, 3.0, 3.2], floors: [[M.lino_vct, 3], [M.concrete_floor, 2], [M.carpet_gray, 0.6]], walls: [[M.paint_beige, 2], [M.cmu, 2], [M.paint_dirty, 1]], ceils: [[M.ceil_tile_old, 2], [M.ceil_tile, 1], [M.concrete, 1.5]] },
  supply: { ceil: [2.6, 2.7, 2.8], floors: [[M.lino_vct, 3], [M.lino_green, 1], [M.concrete_floor, 1.5]], walls: [[M.paint_wall, 2], [M.paint_beige, 2], [M.cmu, 1.5], [M.paint_green, 0.6]], ceils: [[M.ceil_tile_old, 2], [M.ceil_tile, 2]] },
  empty: { ceil: [3.6, 3.8, 4.0, 4.2], floors: [[M.a_epoxy, 3], [M.concrete_floor, 2]], walls: [[M.cmu, 3], [M.concrete, 2], [M.cmu_green, 0.6]], ceils: [[M.concrete, 3], [M.a_deck, 2]] },
  dense: { ceil: [3.0, 3.2, 3.4], floors: [[M.concrete_floor, 3], [M.concrete, 1]], walls: [[M.cmu, 3], [M.concrete, 2]], ceils: [[M.concrete, 2], [M.a_deck, 1.5], [M.ceil_tile_old, 1]] },
  furniture: { ceil: [3.0, 3.2, 3.4], floors: [[M.wood_floor, 2], [M.concrete_floor, 2], [M.lino_vct, 1]], walls: [[M.paint_dirty, 2], [M.plaster, 1.5], [M.cmu, 1.5]], ceils: [[M.ceil_tile_old, 2], [M.ceil_tile_stain, 1], [M.concrete, 1]] },
};

function storageParams(zone, rng, ctx) {
  const variant = rng.weighted([['archive', 3], ['supply', 3], ['empty', 1.4], ['dense', 2.2], ['furniture', 2]]);
  const V = VARIANTS[variant];
  const dark = rng.chance(variant === 'empty' ? 0 : 0.12);
  const p = {
    variant,
    wallMat: rng.weighted(V.walls),
    floorMat: rng.weighted(V.floors),
    ceilMat: rng.weighted(V.ceils),
    ceilH: rng.pick(V.ceil),
    dark,
    fail: dark ? 0.8 : rng.range(0.12, 0.35),
    flicker: rng.range(0.04, 0.12),
    ambient: variant === 'empty' ? [0.05, 0.05, 0.05] : dark ? [0.06, 0.06, 0.06] : [0.12, 0.12, 0.115],
  };
  const tone = variant === 'empty' || variant === 'dense' ? 'industrial' : 'office';
  const reverb = variant === 'empty' ? 'hall' : variant === 'archive' || variant === 'dense' ? 'room' : 'office';
  const fog = variant === 'empty' ? [0.05, 0.05, 0.05] : dark ? [0.08, 0.075, 0.07] : [0.2, 0.19, 0.17];
  p.env = env({ fog, fogNear: 3, fogFar: variant === 'empty' ? 30 : dark ? 20 : 26, hum: variant === 'empty' ? 0.15 : 0.45, hvac: 0.4, reverb, tone });
  return p;
}

function genStorage(zb, world) {
  const keep = keepClearMask(zb, world, 3, 1);
  switch (zb.params.variant) {
    case 'archive': archive(zb, keep); break;
    case 'supply': supply(zb, keep); break;
    case 'empty': emptyHall(zb, keep); break;
    case 'dense': dense(zb, keep); break;
    default: furniture(zb, keep); break;
  }
}

// row axis helpers: rows run along `a` (x if alongX); `c` is the across coordinate
function rowFrame(zb, alongX) {
  return {
    alongX,
    A0: alongX ? zb.x0 : zb.z0, A1: alongX ? zb.x1 : zb.z1,
    C0: alongX ? zb.z0 : zb.x0, C1: alongX ? zb.z1 : zb.x1,
    rect: (a0, c0, a1, c1) => (alongX ? [a0, c0, a1, c1] : [c0, a0, c1, a1]),
    pt: (a, c) => (alongX ? [a, c] : [c, a]),
  };
}

// ================================================================== archive
function archive(zb, keep) {
  const p = zb.params, r = zb.rng;
  const alongX = zb.w > zb.d || (zb.w === zb.d && r.chance(0.5));
  const R = rowFrame(zb, alongX);
  const H = p.ceilH;
  const shelfH = Math.min(H - 0.45, r.pick([2.1, 2.3, 2.4]));
  const walkEnd = r.range(1.8, 2.4), walkSide = r.range(1.2, 1.7);
  const aisleW = () => r.range(1.0, 1.5);
  // cross aisles split long rows
  const len = R.A1 - R.A0 - 2 * walkEnd;
  const nSeg = Math.max(1, Math.round(len / r.pick([14, 18, 24])));
  const cross = 1.8;
  const segLen = (len - cross * (nSeg - 1)) / nSeg;
  const segs = [];
  for (let k = 0; k < nSeg; k++) { const a = R.A0 + walkEnd + k * (segLen + cross); segs.push([a, a + segLen]); }
  // rows across the zone
  const rows = [];
  let c = R.C0 + walkSide;
  while (true) {
    const kind = r.weighted([['shelf', 3], ['cab', 1.1]]);
    const depth = kind === 'cab' ? 1.34 : 0.9;
    if (c + depth > R.C1 - walkSide) break;
    rows.push({ c0: c, c1: c + depth, kind });
    c += depth + aisleW();
  }
  // dark sections: a contiguous block of rows has no working lamps at all
  const darkFrom = r.chance(0.6) ? r.int(0, Math.max(0, rows.length - 1)) : -1;
  const darkTo = darkFrom + r.int(1, 3);
  let label = r.int(1, 40);
  rows.forEach((row, i) => {
    for (const [a0, a1] of segs) {
      // stop rows where they would cut a gate approach or a stair footprint
      let a = a0;
      while (a < a1) {
        let b = a;
        while (b < a1 && rectFree(zb, keep, R, b, row.c0 - 0.2, Math.min(a1, b + 1), row.c1 + 0.2)) b = Math.min(a1, b + 1);
        if (b - a >= 1.5) {
          if (row.kind === 'cab') cabinetRow(zb, R, a, b, row, r);
          else shelfRow(zb, R, a, b, row, shelfH, r, label);
          label++;
        }
        a = b + 1;
      }
    }
  });
  // tube lamps over the aisles (and the walkways)
  const aisles = [];
  aisles.push((R.C0 + (rows[0] ? rows[0].c0 : R.C1)) / 2);
  for (let i = 0; i + 1 < rows.length; i++) aisles.push((rows[i].c1 + rows[i + 1].c0) / 2);
  if (rows.length) aisles.push((rows[rows.length - 1].c1 + R.C1) / 2);
  const sp = r.pick([2.4, 3.0]);
  aisles.forEach((ac, i) => {
    const darkAisle = i >= darkFrom && i <= darkTo && darkFrom >= 0;
    for (let a = R.A0 + 1.5; a < R.A1 - 1; a += sp) {
      const [x, z] = R.pt(a, ac);
      const st = darkAisle ? (r.chance(0.06) ? 'flicker' : 'off') : lightState(r, p.fail, p.flicker);
      ceilingLight(zb, x, z, 'tube', st, { rot: alongX ? 1 : 0, l: 1.2, int: 0.5, rad: 5.2 });
    }
  });
  // end walkways: a clerk's desk, a book truck, boxes waiting to be shelved
  for (let k = 0; k < r.int(1, 3); k++) {
    const a = r.chance(0.5) ? R.A0 + walkEnd / 2 : R.A1 - walkEnd / 2;
    const cc = r.range(R.C0 + 2, R.C1 - 2);
    const [x, z] = R.pt(a, cc);
    if (!openCell(zb, Math.floor(x), Math.floor(z)) || keep[zb.i(Math.floor(x), Math.floor(z))]) continue;
    const u = r.next();
    if (u < 0.35) {
      zb.prop('desk', x, 0, z, facing(...(alongX ? [1, 0] : [0, 1])), { side: 'metal_green' });
      zb.prop('lamp_desk', x + 0.5 * (alongX ? 0 : 1), 0.75, z + 0.5 * (alongX ? 1 : 0), 0, { on: r.chance(0.4) });
      zb.prop('papers', x, 0.75, z, 0, { n: r.int(2, 6) });
      zb.prop('chair_office', x + (alongX ? 0.8 : 0.2), 0, z + (alongX ? 0.2 : 0.8), r.range(0, 6.28));
    } else if (u < 0.7) {
      for (let n = 0; n < r.int(2, 6); n++) zb.prop('a_archbox', x + r.range(-0.6, 0.6), 0, z + r.range(-0.6, 0.6), r.range(-0.3, 0.3) + (r.chance(0.5) ? 0 : Math.PI / 2), { open: r.chance(0.3) });
    } else {
      zb.prop('papers', x, 0, z, 0, { n: r.int(4, 10) });
    }
  }
  wallSigns(zb, r, ['a_sign_records', 'poster_notice', 'a_sign_nosmoke', 'calendar'], 4);
  scatterFloor(zb, r, 0.6);
}

function rectFree(zb, keep, R, a0, c0, a1, c1) {
  const q = R.rect(a0, c0, a1, c1);
  return rectClear(zb, keep, q[0], q[1], q[2], q[3]);
}

// double-sided metal shelving full of archive boxes, between a0..a1 along the row
function shelfRow(zb, R, a0, a1, row, Hs, r, label) {
  const { c0, c1 } = row;
  const n = Hs > 2.2 ? 6 : 5;
  const step = (Hs - 0.1) / (n - 1);
  const box = (aa0, y0, cc0, aa1, y1, cc1, mat, o) => { const q = R.rect(aa0, cc0, aa1, cc1); bar(zb, q[0], y0, q[1], q[2], y1, q[3], mat, o); };
  const tb = (aa0, y0, cc0, aa1, y1, cc1, side, top, tu, o) => { const q = R.rect(aa0, cc0, aa1, cc1); tbox(zb, q[0], y0, q[1], q[2], y1, q[3], side, top, tu, 0, o); };
  const metal = r.chance(0.7) ? M.metal : M.metal_green;
  // uprights on both faces
  const nu = Math.max(1, Math.round((a1 - a0) / 1.0));
  for (let k = 0; k <= nu; k++) {
    const a = a0 + ((a1 - a0) * k) / nu;
    for (const cc of [c0, c1 - 0.035]) box(Math.min(a, a1 - 0.035), 0, cc, Math.min(a + 0.035, a1), Hs, cc + 0.035, metal, { skip: 12 });
  }
  // end panels with a row number
  for (const [ea, dir] of [[a0, -1], [a1, 1]]) {
    box(dir < 0 ? ea - 0.02 : ea, 0, c0, dir < 0 ? ea : ea + 0.02, Hs, c1, metal, { skip: 8 });
    const [x, z] = R.pt(ea + dir * 0.025, (c0 + c1) / 2);
    const face = R.alongX ? (dir < 0 ? 'nx' : 'px') : (dir < 0 ? 'nz' : 'pz');
    zb.decal(x, 1.55, z, face, 0.3, 0.2, 'paper');
    const lab = String(label % 100).padStart(2, '0');
    const flip = (R.alongX ? (dir < 0 ? 1 : -1) : (dir < 0 ? -1 : 1));
    for (let d = 0; d < 2; d++) {
      const [dx, dz] = R.pt(ea + dir * 0.03, (c0 + c1) / 2 + (d - 0.5) * 0.11 * flip);
      zb.decal(dx, 1.32, dz, face, 0.1, 0.15, 'digit_' + lab[d], { lit: true });
    }
  }
  // shelves and the boxes on them
  for (let k = 0; k < n; k++) {
    const y = 0.08 + k * step;
    const sk = y < 1.4 ? 8 : 4;
    box(a0, y, c0, a1, y + 0.025, c1, metal, { sub: 4, skip: sk });
    if (k === n - 1 && r.chance(0.5)) continue;
    const bh = Math.min(0.28, step - 0.06);
    let a = a0 + 0.04;
    while (a < a1 - 0.3) {
      const runLen = r.chance(0.12) ? r.range(0.3, 0.9) : r.range(1.2, 4.5);
      const b = Math.min(a1 - 0.04, a + runLen);
      if (b - a >= 0.3) {
        if (r.chance(0.08)) {
          // a single box pulled half out of the row
          const out = r.sign() * 0.18;
          tb(a, y + 0.025, c0 + 0.02 + out, a + 0.3, y + 0.025 + bh, c1 - 0.02 + out, M.a_archive, M.cardboard, 1.2, { local: false });
          a += 0.3 + 0.05;
          continue;
        }
        tb(a, y + 0.025, c0 + 0.02, b, y + 0.025 + bh, c1 - 0.02, M.a_archive, M.cardboard, 1.2, { sub: 2.5 });
      }
      a = b + (r.chance(0.7) ? r.range(0.3, 0.32) * r.int(1, 3) : 0.02);
    }
  }
}

// back-to-back rows of four drawer filing cabinets
function cabinetRow(zb, R, a0, a1, row, r) {
  const { c0, c1 } = row;
  const h = r.chance(0.75) ? 1.32 : 1.02;
  const sides = R.alongX ? [M.metal, M.metal, M.a_filecab, M.a_filecab] : [M.a_filecab, M.a_filecab, M.metal, M.metal];
  let a = a0;
  while (a < a1 - 0.48) {
    const n = r.int(2, 9);
    const b = Math.min(a1, a + n * 0.48);
    const q = R.rect(a, c0, b, c1);
    tbox(zb, q[0], 0, q[1], q[2], h, q[3], M.a_filecab, M.metal, 0.48, 0, { sides, sub: 2.5 });
    // a drawer left open
    if (r.chance(0.25)) {
      const da = a + 0.48 * r.int(0, n - 1) + 0.04, side = r.sign();
      const dy = [0.05, 0.38, 0.71, 1.0][r.int(0, h > 1.2 ? 3 : 2)];
      const cc = side < 0 ? c0 : c1;
      const q2 = R.rect(da, side < 0 ? cc - 0.42 : cc, da + 0.4, side < 0 ? cc : cc + 0.42);
      zb.box(q2[0], dy, q2[1], q2[2], dy + 0.28, q2[3], M.metal, {});
      if (r.chance(0.6)) { const [px, pz] = R.pt(da + 0.2, side < 0 ? cc - 0.6 : cc + 0.6); zb.prop('papers', px, 0, pz, 0, { n: r.int(2, 7) }); }
    }
    if (r.chance(0.35)) {
      const [px, pz] = R.pt(r.range(a, b), (c0 + c1) / 2);
      zb.prop(r.chance(0.5) ? 'a_archbox' : 'papers', px, h, pz, r.range(0, 6.28), { n: r.int(1, 4) });
    }
    a = b + (r.chance(0.3) ? 0.48 * r.int(1, 2) : 0);
  }
}

// ================================================================== supply rooms
function supply(zb, keep) {
  const p = zb.params, r = zb.rng, wm = p.wallMat;
  const { x0, z0, x1, z1 } = zb;
  const alongX = zb.w >= zb.d;
  const Lu = alongX ? zb.w : zb.d, Lv = alongX ? zb.d : zb.w;
  const cell = (u, v) => (alongX ? [x0 + u, z0 + v] : [x0 + v, z0 + u]);
  const edgeU = (u, v, type) => { const [x, z] = cell(u, v); zb.setWall(x, z, alongX ? 'W' : 'N', type, wm, wm); };
  const edgeV = (u, v, type) => { const [x, z] = cell(u, v); zb.setWall(x, z, alongX ? 'N' : 'W', type, wm, wm); };
  const nS = Math.max(1, Math.round(Lv / 15));
  const band = Lv / nS;
  const corr = [];
  const rooms = [];
  for (let s = 0; s < nS; s++) {
    const b0 = Math.round(s * band), b1 = Math.round((s + 1) * band);
    const cw = 2;
    const cv = Math.round((b0 + b1) / 2 - cw / 2);
    corr.push([cv, cv + cw]);
    for (let u = 0; u < Lu; u++) { edgeV(u, cv, W.WALL); edgeV(u, cv + cw, W.WALL); }
    for (const [v0, v1, doorV] of [[b0, cv, cv], [cv + cw, b1, cv + cw]]) {
      if (v1 - v0 < 3) continue;
      let u = 0;
      while (u < Lu) {
        const w = Math.min(Lu - u, r.int(3, 7));
        const u1 = Lu - (u + w) < 3 ? Lu : u + w;
        if (u1 < Lu) for (let v = v0; v < v1; v++) edgeU(u1, v, W.WALL);
        // door into the corridor
        const du = r.int(u + 1, Math.max(u + 1, u1 - 2));
        edgeV(du, doorV, W.DOOR);
        rooms.push({ u0: u, u1, v0, v1, door: [du, doorV === v0 ? v0 : v1 - 1] });
        u = u1;
      }
    }
    // shared walls between bands
    if (s > 0) for (let u = 0; u < Lu; u++) edgeV(u, b0, W.WALL);
  }
  // corridor lights
  for (const [cv0, cv1] of corr) {
    for (let u = 1; u < Lu; u += 3) {
      const [x, z] = cell(u, cv0);
      ceilingLight(zb, x + (alongX ? 0.5 : 1), z + (alongX ? 1 : 0.5), 'troffer', lightState(r, p.fail * 0.7, p.flicker), { rot: alongX ? 1 : 0 });
    }
    for (let k = 0; k < Math.floor(Lu / 10); k++) {
      const u = r.int(1, Lu - 2), side = r.chance(0.5) ? cv0 : cv1 - 1;
      const [x, z] = cell(u, side);
      const dir = side === cv0 ? (alongX ? [0, -1] : [-1, 0]) : (alongX ? [0, 1] : [1, 0]);
      const f = wallFace(zb, x, z, dir[0], dir[1]);
      if (!f) continue;
      const t = r.next();
      if (t < 0.3) zb.decal(f.x, 1.55, f.z, f.face, 0.5, 0.65, r.pick(['poster_notice', 'poster_safety', 'a_sign_nosmoke', 'calendar']));
      else if (t < 0.5) propOnWall(zb, f, 'extinguisher', 0, {}, 0);
      else if (t < 0.7) propOnWall(zb, f, 'cart_cleaning', 0, {}, 0.35);
      else if (t < 0.8) propOnWall(zb, f, 'a_foldchairs', 0, { n: r.int(3, 7) }, 0.0);
    }
  }
  // furnish rooms
  for (const rm of rooms) {
    const [ax, az] = cell(rm.u0, rm.v0), [bx, bz] = cell(rm.u1 - 1, rm.v1 - 1);
    const rect = { x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx) + 1, z1: Math.max(az, bz) + 1 };
    const [dx, dz] = cell(rm.door[0], rm.door[1]);
    rect.doors = [{ x: dx, z: dz }];
    if (tryRoomPiece(zb, rect, r, 0.05)) continue;
    supplyRoom(zb, rect, r, keep);
  }
}

function supplyRoom(zb, rm, r, keep) {
  const p = zb.params;
  const { x0, z0, x1, z1 } = rm;
  const w = x1 - x0, d = z1 - z0;
  const type = r.weighted([['general', 3], ['janitor', 1.6], ['chairs', 1.2], ['paper', 1.3], ['linen', 0.8], ['empty', 0.5]]);
  const nearDoor = (x, z) => rm.doors.some((dd) => Math.abs(dd.x - x) <= 1 && Math.abs(dd.z - z) <= 1);
  const spots = findWallSpots(zb, x0, z0, x1, z1, Math.max(3, Math.floor((w + d) * 0.9)), r).filter((f) => !nearDoor(Math.floor(f.x - f.dx * 0.5), Math.floor(f.z - f.dz * 0.5)) && !keep[zb.i(Math.floor(f.x - f.dx * 0.5), Math.floor(f.z - f.dz * 0.5))]);
  const used = new Set();
  const take = () => {
    for (const f of spots) {
      const k = Math.floor(f.x - f.dx * 0.5) + ',' + Math.floor(f.z - f.dz * 0.5);
      if (used.has(k)) continue;
      used.add(k);
      return f;
    }
    return null;
  };
  const fills = { general: ['boxes', 'boxes', 'paper', 'cans', 'supplies'], janitor: ['cans', 'supplies', 'linen'], chairs: ['boxes', 'empty'], paper: ['paper', 'paper', 'boxes'], linen: ['linen', 'linen', 'boxes'], empty: ['empty'] }[type];
  const nShelves = type === 'empty' ? r.int(0, 1) : r.int(2, Math.max(2, Math.floor((w + d) / 2.5)));
  for (let k = 0; k < nShelves; k++) {
    const f = take();
    if (!f) break;
    propOnWall(zb, f, 'a_shelf', 0, { w: 1.0, h: r.pick([1.8, 2.0, 2.0]), fill: r.pick(fills) }, 0.24);
  }
  const center = () => {
    for (let k = 0; k < 10; k++) {
      const x = r.int(x0 + 1, Math.max(x0 + 1, x1 - 2)), z = r.int(z0 + 1, Math.max(z0 + 1, z1 - 2));
      if (openCell(zb, x, z) && !nearDoor(x, z) && !keep[zb.i(x, z)]) return [x + 0.5 + r.range(-0.2, 0.2), z + 0.5 + r.range(-0.2, 0.2)];
    }
    return null;
  };
  if (type === 'janitor') {
    let c = center(); if (c) zb.prop('cart_cleaning', c[0], 0, c[1], r.range(0, 6.28));
    for (let k = 0; k < r.int(1, 3); k++) { c = center(); if (c) zb.prop('bucket', c[0], 0, c[1], r.range(0, 6.28)); }
    c = center(); if (c && r.chance(0.6)) zb.prop('wet_sign', c[0], 0, c[1], r.range(0, 6.28));
    const f = take(); if (f) propOnWall(zb, f, 'sink', 0, { drip: r.chance(0.5) }, 0.24);
    if (f && r.chance(0.5)) floorDecal(zb, f.x - f.dx * 0.8, f.z - f.dz * 0.8, 'dec_puddle', 1.2, r);
    zb.decal(x0 + 0.5, 0.01, z0 + 0.5, 'up', 0.01, 0.01, 'dec_stain');
  } else if (type === 'chairs') {
    for (let k = 0; k < r.int(2, 5); k++) { const c = center(); if (c) zb.prop('a_chairstack', c[0], 0, c[1], r.range(0, 6.28), { n: r.int(5, 12), color: r.pick(['orange', 'blue', 'white', 'gray']) }); }
    for (let k = 0; k < 2; k++) { const f = take(); if (f) propOnWall(zb, f, 'a_foldchairs', 0, { n: r.int(4, 9) }, 0.0); }
  } else if (type === 'paper') {
    for (let k = 0; k < r.int(2, 6); k++) { const c = center(); if (c) zb.prop('a_paperboxes', c[0], 0, c[1], r.range(-0.3, 0.3), { n: r.int(1, 5) }); }
  } else if (type === 'general') {
    for (let k = 0; k < r.int(1, 4); k++) { const c = center(); if (c) zb.prop(r.chance(0.6) ? 'box_stack' : 'box', c[0], 0, c[1], r.range(0, 6.28), { n: r.int(2, 4) }); }
  } else if (type === 'linen') {
    const c = center(); if (c) zb.prop('cart_cleaning', c[0], 0, c[1], r.range(0, 6.28));
  }
  // lamp(s)
  const dark = r.chance(p.dark ? 0.8 : 0.22);
  const kind = r.pick(['troffer', 'tube', 'bulb', 'bulb']);
  for (let z = z0 + 1; z < z1 - 0.5; z += 3) for (let x = x0 + 1; x < x1 - 0.5; x += 3) {
    const cx = Math.min(x, x1 - 1), cz = Math.min(z, z1 - 1);
    const st = dark ? (r.chance(0.1) ? 'dying' : 'off') : lightState(r, p.fail * 0.6, p.flicker);
    ceilingLight(zb, cx + 0.5, cz + 0.5, kind, st, { rot: w > d ? 1 : 0 });
  }
  const f = take();
  if (f) zb.decal(f.x, 1.5, f.z, f.face, 0.5, 0.5, r.pick(['a_sign_supply', 'a_sign_janitor', 'poster_notice', 'calendar', 'cork']));
}

// ================================================================== empty hall
function emptyHall(zb, keep) {
  const p = zb.params, r = zb.rng;
  const { x0, z0, x1, z1 } = zb;
  // a sparse grid of columns
  const cs = r.pick([6, 7, 8]);
  const ox = r.int(2, cs - 1), oz = r.int(2, cs - 1);
  for (let z = z0 + oz; z < z1 - 2; z += cs) for (let x = x0 + ox; x < x1 - 2; x += cs) {
    if (keep[zb.i(x, z)]) continue;
    zb.box(x + 0.25, 0, z + 0.25, x + 0.75, p.ceilH, z + 0.75, p.wallMat === M.cmu ? M.concrete : p.wallMat, { skip: 12 });
    if (r.chance(0.5)) zb.box(x + 0.18, 0, z + 0.18, x + 0.82, 0.9, z + 0.82, M.hazard, { skip: 8 });
  }
  // painted bays, numbered, all empty
  const alongX = zb.w >= zb.d;
  const R = rowFrame(zb, alongX);
  const bw = r.pick([2.5, 3, 3.5]), bd = r.pick([4, 5, 6]);
  let n = r.int(1, 40);
  const tex = r.chance(0.7) ? 'a_dec_line' : 'a_dec_line_w';
  for (const [c0, flip] of [[R.C0 + 1.2, 1], [R.C1 - 1.2 - bd, -1]]) {
    if (c0 < R.C0 + 1 || c0 + bd > R.C1 - 1) continue;
    for (let a = R.A0 + 1.5; a + bw < R.A1 - 1.5; a += bw) {
      if (!rectFree(zb, keep, R, a, c0, a + bw, c0 + bd)) continue;
      const P = (aa, cc) => R.pt(aa, cc);
      const back = flip > 0 ? c0 : c0 + bd, front = flip > 0 ? c0 + bd : c0;
      floorLine(zb, ...P(a, back), ...P(a, front), 0.09, tex, 0.001);
      floorLine(zb, ...P(a + bw, back), ...P(a + bw, front), 0.09, tex, 0.001);
      floorLine(zb, ...P(a, back), ...P(a + bw, back), 0.09, tex, 0.002);
      const label = String(n++ % 100).padStart(2, '0');
      for (let d = 0; d < 2; d++) {
        const [x, z] = P(a + bw / 2 + (d - 0.5) * 0.45 * (alongX ? 1 : -1) * flip, front - flip * 0.9);
        const rot = alongX ? (flip > 0 ? Math.PI : 0) : (flip > 0 ? Math.PI / 2 : -Math.PI / 2);
        zb.decal(x, 0.003, z, 'up', 0.4, 0.6, 'digit_' + label[d], { rot });
      }
      // almost always empty
      if (r.chance(0.12)) {
        const [x, z] = P(a + bw / 2 + r.range(-0.4, 0.4), c0 + bd / 2 + r.range(-0.8, 0.8));
        zb.prop(r.pick(['pallet', 'pallet', 'box', 'a_drum']), x, 0, z, r.range(0, 6.28), { s: 0.5 });
      }
    }
  }
  // one lone box in the middle of the floor
  const [lx, lz] = R.pt((R.A0 + R.A1) / 2 + r.range(-3, 3), (R.C0 + R.C1) / 2 + r.range(-2, 2));
  if (freeCell(zb, Math.floor(lx), Math.floor(lz))) zb.prop('box', lx, 0, lz, r.range(0, 6.28), { s: 0.5, h: 0.42 });
  // all the lamps are dead except one, far away
  const kind = p.ceilMat === M.a_deck ? 'cage' : 'tube';
  const sp = 4;
  const lamps = [];
  for (let z = z0 + 2; z < z1 - 1; z += sp) for (let x = x0 + 2; x < x1 - 1; x += sp) lamps.push([x, z]);
  const far = lamps.length ? lamps[r.int(0, lamps.length - 1)] : null;
  for (const [x, z] of lamps) {
    const on = far && x === far[0] && z === far[1];
    ceilingLight(zb, x + 0.5, z + 0.5, kind, on ? 'on' : r.chance(0.04) ? 'dying' : 'off', { rot: alongX ? 1 : 0, l: 1.2, int: on ? 0.8 : undefined, rad: on ? 7.5 : undefined });
  }
  for (let k = 0; k < Math.floor((zb.w * zb.d) / 160); k++) {
    const x = r.int(x0, x1 - 1), z = r.int(z0, z1 - 1);
    if (freeCell(zb, x, z)) floorDecal(zb, x + 0.5, z + 0.5, r.pick(['dec_stain', 'dec_crack', 'dec_puddle']), r.range(0.8, 2.2), r);
  }
}

// ================================================================== maze of stacked boxes
function dense(zb, keep) {
  const p = zb.params, r = zb.rng;
  const { x0, z0, x1, z1, w, d } = zb;
  const H = p.ceilH;
  // maze over the interior with a 1 m walkway around it; nodes on odd offsets
  const mx0 = x0 + 1, mz0 = z0 + 1, mw = w - 2, md = d - 2;
  const nx = Math.floor((mw - 1) / 2), nz = Math.floor((md - 1) / 2);
  const stack = new Uint8Array(w * d);
  const I = (x, z) => (z - z0) * w + (x - x0);
  for (let z = mz0; z < mz0 + md; z++) for (let x = mx0; x < mx0 + mw; x++) stack[I(x, z)] = 1;
  const node = (i, j) => [mx0 + 1 + 2 * i, mz0 + 1 + 2 * j];
  const seen = new Uint8Array(nx * nz);
  const carve = (x, z) => { if (zb.in(x, z)) stack[I(x, z)] = 0; };
  // iterative backtracker
  const st = [[r.int(0, nx - 1), r.int(0, nz - 1)]];
  seen[st[0][1] * nx + st[0][0]] = 1;
  carve(...node(st[0][0], st[0][1]));
  while (st.length) {
    const [i, j] = st[st.length - 1];
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([di, dj]) => i + di >= 0 && i + di < nx && j + dj >= 0 && j + dj < nz && !seen[(j + dj) * nx + i + di]);
    if (!opts.length) { st.pop(); continue; }
    const [di, dj] = r.pick(opts);
    const [ax, az] = node(i, j);
    carve(ax + di, az + dj);
    carve(...node(i + di, j + dj));
    seen[(j + dj) * nx + i + di] = 1;
    st.push([i + di, j + dj]);
  }
  // loops, wider spots and openings to the walkway
  for (let k = 0; k < (nx * nz) * 0.12; k++) {
    const i = r.int(0, nx - 2), j = r.int(0, nz - 2);
    const [ax, az] = node(i, j);
    if (r.chance(0.5)) carve(ax + 1, az); else carve(ax, az + 1);
  }
  for (let k = 0; k < (nx * nz) * 0.05; k++) {
    const [ax, az] = node(r.int(0, nx - 1), r.int(0, nz - 1));
    carve(ax + 1, az); carve(ax, az + 1); carve(ax + 1, az + 1);
  }
  for (let i = 0; i < nx; i += r.int(2, 4)) { const [ax] = node(i, 0); carve(ax, mz0); const [bx, bz] = node(i, nz - 1); for (let z = bz + 1; z < mz0 + md; z++) carve(bx, z); }
  for (let j = 0; j < nz; j += r.int(2, 4)) { const [, az] = node(0, j); carve(mx0, az); const [bx, bz] = node(nx - 1, j); for (let x = bx + 1; x < mx0 + mw; x++) carve(x, bz); }
  // gate approaches / stair footprints stay open, and connect inward to the maze
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (keep[zb.i(x, z)]) stack[I(x, z)] = 0;
  for (const g of zb.gates) for (let k = 0; k < 4; k++) carve(g.x + g.dx * k, g.z + g.dz * k);
  // heights: clustered, mostly above eye level; crates where the noise says so
  const hs = [];
  const hAt = (x, z) => {
    const u = Math.sin(x * 0.37 + z * 0.21 + p.ceilH) * 0.5 + Math.sin(x * 0.13 - z * 0.29) * 0.5;
    return u;
  };
  const maxH = H - 0.6;
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    if (!stack[I(x, z)]) continue;
    const i = zb.i(x, z);
    const u = hAt(x, z) + r.range(-0.35, 0.35);
    const crate = u > 0.55;
    let h = crate ? (u > 0.8 && maxH >= 2 ? 2.0 : r.chance(0.5) ? 2.0 : 1.0) : 0.6 * Math.max(3, Math.min(Math.floor(maxH / 0.6), Math.round(3 + (u + 1) * 1.4 + r.range(-0.5, 0.5))));
    if (crate && h < 1.6) h = 2.0;
    h = Math.min(h, maxH);
    zb.floor[i] = h;
    zb.fmat[i] = crate ? M.a_crate : M.cardboard;
    zb.wmat[i] = crate ? M.a_crate : M.a_boxstack;
    zb.flags[i] |= CF.NOPROPS;
    hs.push(h);
  }
  // invisible collision for the stacks (cell floors only collide in their top half metre)
  for (let z = z0; z < z1; z++) {
    let x = x0;
    while (x < x1) {
      if (!stack[I(x, z)]) { x++; continue; }
      let e = x + 1;
      let top = zb.floor[zb.i(x, z)];
      while (e < x1 && stack[I(e, z)]) { top = Math.min(top, zb.floor[zb.i(e, z)]); e++; }
      zb.box(x, 0, z, e, top - 0.3, z + 1, M.cardboard, { render: false });
      x = e;
    }
  }
  // loose boxes on top of stacks and in dead ends
  for (let k = 0; k < (w * d) / 25; k++) {
    const x = r.int(x0, x1 - 1), z = r.int(z0, z1 - 1);
    const i = zb.i(x, z);
    if (stack[I(x, z)]) {
      if (zb.floor[i] < maxH - 0.5 && r.chance(0.5)) zb.prop(r.chance(0.7) ? 'box' : 'a_crate', x + 0.5 + r.range(-0.2, 0.2), zb.floor[i], z + 0.5 + r.range(-0.2, 0.2), r.range(-0.4, 0.4), { s: r.range(0.4, 0.6) });
      continue;
    }
    if (keep[i]) continue;
    let open = 0;
    for (const [dx, dz] of DIRS4) if (zb.in(x + dx, z + dz) && !stack[I(x + dx, z + dz)]) open++;
    if (open === 1 && x > x0 && z > z0 && x < x1 - 1 && z < z1 - 1) {
      const t = r.next();
      if (t < 0.4) zb.prop('box_stack', x + 0.5, 0, z + 0.5, r.range(0, 6.28), { n: r.int(2, 4) });
      else if (t < 0.6) zb.prop('a_crate', x + 0.5, 0, z + 0.5, r.range(-0.2, 0.2), { s: 0.8 });
      else if (t < 0.75) zb.prop('pallet', x + 0.5, 0, z + 0.5, r.range(0, 6.28));
      else if (t < 0.85) zb.prop('a_pjack', x + 0.5, 0, z + 0.5, r.range(0, 6.28));
    }
  }
  // lamps above the passages; the stacks throw real shadows
  const kind = r.pick(['cage', 'bulb', 'tube']);
  for (let z = z0 + 1; z < z1 - 1; z += 3) for (let x = x0 + 1; x < x1 - 1; x += 3) {
    let lx = x, lz = z;
    if (stack[I(lx, lz)]) { const alt = DIRS4.map(([dx, dz]) => [x + dx, z + dz]).find(([ax, az]) => zb.in(ax, az) && !stack[I(ax, az)]); if (!alt) continue; [lx, lz] = alt; }
    ceilingLight(zb, lx + 0.5, lz + 0.5, kind, lightState(r, p.fail + 0.1, p.flicker), { rot: r.chance(0.5) ? 1 : 0, hang: 0.4 });
  }
  wallSigns(zb, r, ['a_sign_forklift', 'poster_safety', 'a_sign_nosmoke'], 3);
  void hs;
}

// ================================================================== old furniture
function furniture(zb, keep) {
  const p = zb.params, r = zb.rng;
  const { x0, z0, x1, z1 } = zb;
  const alongX = zb.w >= zb.d;
  const R = rowFrame(zb, alongX);
  // lots of furniture between 2 m aisles
  const lotA = r.pick([3, 4]), lotC = r.pick([3, 4]), aisle = 2;
  for (let c = R.C0 + 1.5; c + lotC <= R.C1 - 1.5; c += lotC + aisle) {
    for (let a = R.A0 + 1.5; a + lotA <= R.A1 - 1.5; a += lotA + (r.chance(0.3) ? aisle : 0.6)) {
      if (!rectFree(zb, keep, R, a - 0.3, c - 0.3, a + lotA + 0.3, c + lotC + 0.3)) continue;
      const q = R.rect(a, c, a + lotA, c + lotC);
      furnitureLot(zb, r, { x0: q[0], z0: q[1], x1: q[2], z1: q[3] }, alongX);
    }
  }
  // mattresses and tables leaning on the walls
  for (const f of findWallSpots(zb, x0, z0, x1, z1, Math.floor((zb.w + zb.d) / 3), r)) {
    const cx = Math.floor(f.x - f.dx * 0.5), cz = Math.floor(f.z - f.dz * 0.5);
    if (keep[zb.i(cx, cz)] || !openCell(zb, cx, cz)) continue;
    const t = r.next();
    if (t < 0.4) leanMattress(zb, f, r);
    else if (t < 0.55) propOnWall(zb, f, 'bookshelf', 0, { w: 0.9, books: r.chance(0.4) }, 0.17);
    else if (t < 0.7) propOnWall(zb, f, 'filing_cabinet', 0, {}, 0.36);
    else if (t < 0.8) propOnWall(zb, f, 'a_foldchairs', 0, { n: r.int(3, 6) }, 0);
    else if (t < 0.85) zb.decal(f.x, 1.4, f.z, f.face, 0.7, 0.9, r.pick(['frame_empty', 'painting_land', 'mirror']));
  }
  // a few bulbs, most of them dead
  for (let z = z0 + 2; z < z1 - 1; z += 4) for (let x = x0 + 2; x < x1 - 1; x += 4) {
    ceilingLight(zb, x + 0.5, z + 0.5, 'bulb', lightState(r, p.fail + 0.15, p.flicker), { hang: 0.5 });
  }
  for (let k = 0; k < (zb.w * zb.d) / 90; k++) {
    const x = r.int(x0, x1 - 1), z = r.int(z0, z1 - 1);
    if (!freeCell(zb, x, z)) continue;
    const u = r.next();
    if (u < 0.5) floorDecal(zb, x + 0.5, z + 0.5, r.pick(['dec_stain', 'dec_paper', 'dec_scuff']), r.range(0.6, 1.6), r);
    else if (u < 0.7) zb.setFlag(x, z, CF.HOLE_CEIL);
  }
  wallSigns(zb, r, ['poster_notice', 'calendar', 'frame_empty'], 3);
}

// mattress standing on its long edge, leaning back against the wall behind it
function leanMattress(zb, f, r) {
  const lean = 0.2;
  const a = -(Math.PI / 2 - lean);
  const rot = facing(-f.dx, -f.dz);
  const back = 0.98 * Math.sin(lean) + 0.22 * Math.cos(lean) + 0.02;
  zb.prop('mattress', f.x - f.dx * back, 0.98 * Math.cos(lean) + 0.01, f.z - f.dz * back, rot, { tilt: a, collide: false });
  const along = [f.dz !== 0 ? 1 : 0, f.dx !== 0 ? 1 : 0];
  const ex = f.x - f.dx * 0.25, ez = f.z - f.dz * 0.25;
  zb.box(Math.min(ex, f.x) - along[0] * 0.5, 0, Math.min(ez, f.z) - along[1] * 0.5, Math.max(ex, f.x) + along[0] * 0.5, 1.9, Math.max(ez, f.z) + along[1] * 0.5, M.mattress, { render: false });
  void r;
}

function furnitureLot(zb, r, q, alongX) {
  const cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2;
  const w = q.x1 - q.x0, d = q.z1 - q.z0;
  const rr = () => [q.x0 + 0.6 + r.next() * (w - 1.2), q.z0 + 0.6 + r.next() * (d - 1.2)];
  const rotA = alongX ? 0 : Math.PI / 2;
  const theme = r.weighted([['chairs', 2], ['desks', 2], ['sofas', 2], ['sheets', 2.2], ['mattresses', 1], ['cabinets', 1.2], ['misc', 1.2]]);
  if (theme === 'chairs') {
    for (let k = 0; k < r.int(3, 6); k++) { const [x, z] = rr(); zb.prop('a_chairstack', x, 0, z, r.range(0, 6.28), { n: r.int(4, 11), color: r.pick(['orange', 'blue', 'gray', 'white']) }); }
    for (let k = 0; k < r.int(1, 4); k++) { const [x, z] = rr(); zb.prop(r.pick(['chair_office', 'chair_folding', 'chair_school']), x, 0, z, r.range(0, 6.28)); }
  } else if (theme === 'desks') {
    // desks lying on their side and some upright with chairs piled on top
    for (let k = 0; k < 2; k++) {
      const x = cx + (k - 0.5) * w * 0.45, z = cz + r.range(-0.4, 0.4);
      if (r.chance(0.55)) {
        const s = r.sign();
        zb.prop('desk', x, 0.76, z, rotA + (r.chance(0.5) ? 0 : Math.PI), { roll: s * Math.PI / 2, collide: false, side: 'wood_dark' });
        const hx = alongX ? 0.38 : 0.76, hz = alongX ? 0.76 : 0.38;
        zb.box(x - hx, 0, z - hz, x + hx, 1.52, z + hz, M.wood, { render: false });
      } else {
        zb.prop('desk', x, 0, z, rotA + r.range(-0.1, 0.1), {});
        if (r.chance(0.7)) zb.prop('chair_school', x + r.range(-0.3, 0.3), 0.75, z + r.range(-0.15, 0.15), r.range(0, 6.28));
      }
    }
  } else if (theme === 'sofas') {
    const [x, z] = [cx, cz + r.range(-0.3, 0.3)];
    if (r.chance(0.35)) {
      // a sofa stood on end
      zb.prop('sofa', x, 0.95, z, rotA, { tilt: -Math.PI / 2, collide: false, len: 1.9, fabric: r.pick(['fabric_floral', 'fabric_brown', 'velvet_red']) });
      zb.box(x - 0.5, 0, z - 0.5, x + 0.5, 1.9, z + 0.5, M.fabric_floral, { render: false });
    } else zb.prop('sofa', x, 0, z, rotA + r.pick([0, Math.PI]) + r.range(-0.15, 0.15), { len: r.pick([1.6, 1.9, 2.2]), fabric: r.pick(['fabric_floral', 'fabric_brown', 'fabric_gray', 'velvet_red']) });
    for (let k = 0; k < r.int(1, 2); k++) { const [ax, az] = rr(); if (Math.hypot(ax - x, az - z) > 1.3) zb.prop('armchair', ax, 0, az, r.range(0, 6.28), { fabric: r.pick(['fabric_floral', 'fabric_brown']) }); }
    if (r.chance(0.4)) { const [ax, az] = rr(); if (Math.hypot(ax - x, az - z) > 1.2) zb.prop('coffee_table', ax, 0, az, r.range(0, 6.28)); }
  } else if (theme === 'sheets') {
    for (let k = 0; k < r.int(2, 4); k++) {
      const [x, z] = rr();
      const sh = r.pick(['box', 'chair', 'sofa', 'box']);
      const dims = sh === 'sofa' ? [r.range(1.6, 2.1), 0.9, 0.85] : sh === 'chair' ? [0.85, 0.85, 0.95] : [r.range(0.6, 1.4), r.range(0.5, 0.9), r.range(0.7, 1.8)];
      zb.prop('a_sheet', x, 0, z, rotA + r.range(-0.25, 0.25) + r.pick([0, Math.PI]), { shape: sh, w: dims[0], d: dims[1], h: dims[2] });
    }
  } else if (theme === 'mattresses') {
    let y = 0;
    const rot = rotA + r.range(-0.1, 0.1);
    for (let k = 0; k < r.int(2, 6); k++) { zb.prop('mattress', cx + r.range(-0.08, 0.08), y, cz + r.range(-0.08, 0.08), rot + r.range(-0.08, 0.08), {}); y += 0.22; }
  } else if (theme === 'cabinets') {
    for (let k = 0; k < r.int(2, 5); k++) zb.prop('filing_cabinet', q.x0 + 0.4 + k * 0.5 * (alongX ? 1 : 0), 0, q.z0 + 0.5 + k * 0.5 * (alongX ? 0 : 1), facing(...(alongX ? [0, 1] : [1, 0])), {});
    const [x, z] = rr(); zb.prop('desk_metal', x, 0, z, rotA + r.range(-0.2, 0.2));
  } else {
    const items = ['lamp_floor', 'tv', 'bookshelf', 'table_round', 'chair_exec', 'radiator', 'trash_can', 'box_stack'];
    for (let k = 0; k < r.int(2, 4); k++) {
      const [x, z] = rr();
      const it = r.pick(items);
      zb.prop(it, x, 0, z, r.range(0, 6.28), it === 'lamp_floor' ? { on: false } : it === 'tv' ? { screen: 'off' } : it === 'bookshelf' ? { books: false } : {});
    }
  }
}

// ================================================================== shared dressing
function wallSigns(zb, r, texs, n) {
  for (const f of findWallSpots(zb, zb.x0, zb.z0, zb.x1, zb.z1, n, r)) zb.decal(f.x, 1.6, f.z, f.face, 0.55, 0.55, r.pick(texs));
}

function scatterFloor(zb, r, density) {
  const { x0, z0, x1, z1 } = zb;
  for (let k = 0; k < (zb.w * zb.d) / 100 * density; k++) {
    const x = r.int(x0, x1 - 1), z = r.int(z0, z1 - 1);
    if (!freeCell(zb, x, z)) continue;
    floorDecal(zb, x + 0.5, z + 0.5, r.pick(['dec_stain', 'dec_paper', 'dec_scuff']), r.range(0.5, 1.4), r);
  }
}

defineZone('storage', {
  border: 'wall',
  gate: 'door',
  minW: 16, minD: 16,
  weight: (c) => {
    if (c.dim !== 0 || c.dist <= 80) return 0;
    return 1.1 * (0.3 + 1.6 * c.ind);
  },
  params: storageParams,
  gen: genStorage,
});
