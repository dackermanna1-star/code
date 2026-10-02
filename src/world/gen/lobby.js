// Zone type 'lobby': large public interiors where nobody is waiting.
//   lobby      - a big open lobby: marble or carpet, a reception desk with nobody behind it, a phone on
//                it, rows of waiting chairs, a wall of elevator doors that do not work, a dry fountain
//   waiting    - a waiting room: rows of chairs facing a blank wall, a television showing static or an
//                unattended service counter, a "take a number" machine
//   conference - an empty conference hall: rows of chairs facing a podium and a blank projection
//                screen, a foyer with registration tables, side doors
import { defineZone } from '../zonetypes.js';
import { W, CF, M, ceilingLight, facing, env } from './common.js';
import { tryRoomPiece } from '../roompieces.js';
import { trimRuns, lightState, faceKey } from './b_util.js';
import './b_assets.js';
import './z_assets.js';
import './z_rooms.js';
import { clamp, faceOfNormal } from './z_util.js';
import { gateLights, makeCtx, freeRect, reserve, findSpot, sideFrame, freeSpan, buildRoomBox, sideRooms, dressSideRoom, columns, lightGrid, seatRow, seatBlock } from './z_pub.js';

// ------------------------------------------------------------------ params
function lobbyParams(zone, rng, ctx) {
  const big = ctx.w >= 24 && ctx.d >= 24;
  const variant = rng.weighted([['lobby', big ? 5 : 0], ['waiting', 3.4], ['conference', big ? 2.6 : 0]]);
  const far = clamp((ctx.dist - 120) / 1400, 0, 1);
  const p = { variant, far, fail: rng.range(0.16, 0.42) + far * 0.12, flicker: rng.range(0.05, 0.12) };
  if (variant === 'lobby') {
    const carpet = rng.chance(0.4);
    p.carpet = carpet;
    p.floorMat = carpet ? M.z_carpet_lobby : rng.weighted([[M.z_marble_check, 4], [M.marble, 1.2], [M.b_terrazzo, 1.5]]);
    p.altFloor = carpet ? M.z_marble_check : M.z_carpet_lobby;
    p.wallMat = rng.weighted([[M.z_stone, 3], [M.plaster, 1.4], [M.paint_cream, 1.4], [M.wood_panel, 1.6], [M.b_wp_damask, 0.8]]);
    p.ceilMat = rng.weighted([[M.z_ceil_coffer, 4], [M.plaster, 1.2], [M.ceil_tile_white, 0.6]]);
    p.ceilH = rng.pick([3.6, 3.8, 4.0, 4.2]);
    p.soffit = rng.chance(0.7);
    p.ambient = [0.17, 0.16, 0.14];
    p.env = env({ fog: [0.2, 0.19, 0.17], fogNear: 5, fogFar: 46, hum: 0.3, hvac: 0.55, reverb: 'hall', tone: 'hotel' });
  } else if (variant === 'waiting') {
    p.floorMat = rng.weighted([[M.lino_vct, 3], [M.carpet_gray, 2.5], [M.tile_check, 1.5], [M.carpet_blue, 1.2], [M.carpet_teal, 1], [M.z_carpet_conf, 1.2]]);
    p.wallMat = rng.weighted([[M.paint_cream, 3], [M.paint_beige, 2.2], [M.paint_green, 1.4], [M.paint_blue, 1.2], [M.paint_wall, 1.5]]);
    p.ceilMat = rng.weighted([[M.ceil_tile_white, 4], [M.ceil_tile, 2], [M.ceil_tile_old, 1]]);
    p.ceilH = rng.pick([2.7, 2.8, 2.9, 3.0]);
    p.focus = rng.weighted([['tv', 3], ['blank', 2], ['counter', 3]]);
    p.chairColor = rng.pick(['plastic_blue', 'plastic_blue', 'plastic_orange', 'plastic_gray']);
    p.ambient = [0.22, 0.22, 0.205];
    p.env = env({ fog: [0.3, 0.29, 0.26], fogNear: 4, fogFar: 36, hum: 0.55, hvac: 0.6, reverb: 'room', tone: 'office' });
  } else {
    p.floorMat = M.z_carpet_conf;
    p.wallMat = rng.weighted([[M.paint_cream, 3], [M.paint_beige, 2], [M.wood_panel, 1.6], [M.paint_blue, 0.8]]);
    p.ceilMat = rng.weighted([[M.ceil_tile_white, 3], [M.z_ceil_coffer, 2]]);
    p.ceilH = rng.pick([3.0, 3.1, 3.2]);
    p.hallH = rng.pick([3.8, 4.0, 4.2, 4.4]);
    p.hallWall = rng.weighted([[M.wood_panel, 3], [M.paint_beige, 2], [M.paint_green, 1]]);
    p.seatTint = rng.pick([null, [1.2, 0.7, 0.7], [0.7, 1.0, 0.8], [0.9, 0.85, 0.8]]);
    p.ambient = [0.23, 0.22, 0.2];
    p.env = env({ fog: [0.22, 0.21, 0.19], fogNear: 5, fogFar: 42, hum: 0.4, hvac: 0.5, reverb: 'auditorium', tone: 'office' });
  }
  return p;
}

// debug aid: remember good camera spots (used by the screenshot tooling, costs nothing)
function view(c, name, x, z, dx, dz, pitch = 0) {
  (c.views || (c.views = [])).push({ name, x, z, yaw: Math.atan2(dx, -dz), pitch });
}

// ------------------------------------------------------------------ shared wall dressing
function perimeterCells(zb) {
  return (x, z) => x === zb.x0 || x === zb.x1 - 1 || z === zb.z0 || z === zb.z1 - 1;
}

// decorations along the perimeter walls: pilasters, art, plants, benches, vending ...
function wallItems(c, o) {
  const { zb, r, p } = c;
  const H = zb.ceil[zb.i(zb.x0 + 1, zb.z0 + 1)];
  for (const side of ['N', 'S', 'W', 'E']) {
    const F = sideFrame(c, side);
    const step = o.step ?? 4;
    for (let u = r.range(1.5, 3); u < F.U - 1.5; u += step + r.range(-0.8, 1.2)) {
      if (F.gateNear(u - 0.9, u + 0.9, 1.4)) continue;
      const cell = F.pt(Math.floor(u) + 0.5, 0.5);
      if (!freeRect(c, Math.floor(cell[0]), Math.floor(cell[1]), Math.floor(cell[0]) + 1, Math.floor(cell[1]) + 1, 0)) continue;
      const kind = r.weighted(o.items);
      const placeReserve = () => reserve(c, Math.floor(cell[0]), Math.floor(cell[1]), Math.floor(cell[0]) + 1, Math.floor(cell[1]) + 1, 6);
      switch (kind) {
        case 'bench': F.place('bench', u, 0.4, 0, 1, { len: 1.6 }); if (r.chance(0.6)) F.place('plant', u + 1.2, 0.4, 0, 1); placeReserve(); break;
        case 'plant': F.place('plant', u, 0.45, 0, 1); placeReserve(); break;
        case 'planter': F.place('z_planter', u, 0.45, 0, 1, { len: r.pick([1.2, 1.6, 2.0]) }); placeReserve(); break;
        case 'vending': F.place('vending', u, 0.45, 0, 1); placeReserve(); break;
        case 'cooler': F.place('water_cooler', u, 0.4, 0, 1); placeReserve(); break;
        case 'trash': F.place('trash_can', u, 0.35, 0, 1); placeReserve(); break;
        case 'phones':
          for (let k = 0; k < 3; k++) F.place('payphone', u + k * 0.7 - 0.7, 0.14, 0, 1);
          F.decal(u, 2.2, 0.5, 0.5, 'sign_noexit');
          placeReserve(); break;
        case 'art': {
          const tex = r.pick(['painting_land', 'frame_empty', 'poster_motiv', 'mirror', 'painting_land']);
          F.decal(u, 1.7 + (H > 3.3 ? 0.6 : 0), tex === 'mirror' ? 0.9 : 1.1, tex === 'mirror' ? 1.3 : 0.9, tex);
          break;
        }
        case 'sconce': F.place('b_sconce', u, 0.1, 0, 1, { on: r.chance(1 - p.fail) }, Math.min(2.4, H - 1.0)); break;
        case 'poster': F.decal(u, 1.55, 0.55, 0.7, r.pick(['poster_safety', 'poster_notice', 'poster_map', 'poster_employee', 'z_poster_quiet', 'z_poster_forms'])); break;
        case 'sign': F.decal(u, 2.1, 0.45, 0.45, r.pick(['sign_restroom', 'sign_stairs', 'sign_thisway', 'sign_level', 'sign_floor0', 'sign_occupancy'])); break;
        case 'clock': F.place('b_clock', u, 0.1, 0, 1, { r: o.clockR ?? 0.26, face: r.pick(['clock_a', 'clock_b', 'clock_c']) }, Math.min(H - 0.7, 2.5)); break;
        case 'extinguisher': F.place('extinguisher', u, 0.12, 0, 1); break;
        case 'waitsign': F.decal(u, Math.min(2.3, H - 0.8), 1.0, 1.0, 'sign_wait'); break;
        case 'piano': F.place('piano', u, 0.45, 0, 1); F.place('bench', u, 1.4, 0, -1, { len: 0.9 }); placeReserve(); break;
        case 'bed': {
          F.box(u - 1.2, 0, 0.1, u + 1.2, 0.5, 0.85, M.z_stone);
          F.box(u - 1.1, 0.5, 0.2, u + 1.1, 0.52, 0.75, M.dark, { skip: 8, collide: false });
          for (let k = -1; k <= 1; k++) F.place('z_shrub', u + k * 0.7 + r.range(-0.1, 0.1), 0.48, 0, 1, { h: r.range(0.7, 1.4) }, 0.52);
          placeReserve(); break;
        }
        default: break;
      }
    }
  }
}

// baseboard (and optionally a wainscot) along every perimeter wall except where blocked
function wallTrim(c, specs, blocked) {
  trimRuns(c.zb, perimeterCells(c.zb), blocked, specs, c.gset);
}

// ------------------------------------------------------------------ variant: the big lobby
function genLobbyHall(c) {
  const { zb, p, r } = c;
  const H = p.ceilH;
  const { x0, z0, x1, z1 } = zb;
  const area = zb.w * zb.d;
  const R = c.rng;
  // soffit ring and an inlaid rug
  if (p.soffit) {
    const sw = 2;
    zb.rectCeil(x0, z0, x1, z0 + sw, H - 0.5);
    zb.rectCeil(x0, z1 - sw, x1, z1, H - 0.5);
    zb.rectCeil(x0, z0 + sw, x0 + sw, z1 - sw, H - 0.5);
    zb.rectCeil(x1 - sw, z0 + sw, x1, z1 - sw, H - 0.5);
  }
  const rug = { x0: x0 + 5, z0: z0 + 5, x1: x1 - 5, z1: z1 - 5 };
  if (rug.x1 - rug.x0 >= 8 && rug.z1 - rug.z0 >= 8 && R.dec.chance(0.7)) zb.rectFloor(rug.x0, rug.z0, rug.x1, rug.z1, 0, p.altFloor);

  const blocked = new Set();
  const usedSides = [];
  // ---- elevator bank
  const sides = R.lay.shuffle(['N', 'S', 'W', 'E']);
  for (const side of sides) {
    const [a, b] = freeSpan(c, side, 2);
    const F = sideFrame(c, side);
    const maxN = Math.min(4, Math.floor((b - a - 1) / 2.8));
    if (maxN < 2 || F.V < 8) continue;
    const ne = R.lay.int(2, maxN);
    const bw = ne * 2.6;
    const ub = R.lay.range(a + 0.5, b - bw - 0.5);
    elevatorBank(c, F, ub, ne, H, blocked);
    { const [vx, vz] = F.pt(ub + (ne * 2.6) / 2, 7); view(c, 'elev', vx, vz, -F.into[0], -F.into[1]); const [wx, wz] = F.pt(ub + (ne * 2.6) / 2 - 3, 3); view(c, 'elev2', wx, wz, -F.into[0] + F.into[1] * 0.4, -F.into[1] + F.into[0] * 0.4); }
    reserve(c, ...F.rect(ub - 0.5, 0, ub + bw + 0.5, 4.2), 7);
    usedSides.push(side);
    break;
  }
  // ---- reception desk
  const rs = sides.find((s) => !usedSides.includes(s) && freeSpan(c, s, 2)[1] - freeSpan(c, s, 2)[0] >= 9) || sides.find((s) => freeSpan(c, s, 2)[1] - freeSpan(c, s, 2)[0] >= 9);
  if (rs) {
    const [a, b] = freeSpan(c, rs, 2);
    const ru = R.lay.range(a + 4.5, b - 4.5);
    reception(c, sideFrame(c, rs), ru, H, blocked);
    { const RF = sideFrame(c, rs); const [vx, vz] = RF.pt(ru, 9); view(c, 'recep', vx, vz, -RF.into[0], -RF.into[1]); const [wx, wz] = RF.pt(ru + 3, 6.5); view(c, 'recep2', wx, wz, -RF.into[0] - RF.into[1] * 0.5, -RF.into[1] - RF.into[0] * 0.5, -0.12); }
    usedSides.push(rs);
  }
  // ---- rooms along a wall
  const rooms = sideRooms(c, { n: Math.max(1, Math.round(area / 650)), width: [5, 8], depth: [4, 6], sides: sides.filter((s) => s !== usedSides[0]) }, p.wallMat, p.wallMat, () => R.dec.pick([M.carpet_gray, M.lino_vct, M.carpet_blue]), 2.9, M.ceil_tile_white);
  for (const rm of rooms) dressSideRoom(c, rm, [['office', 3], ['security', 1.4], ['coat', 1.4], ['store', 1.6], ['restroom', 1.6]]);
  // ---- the fountain / planter island in the middle
  if (area >= 600) {
    const sp = findSpot(c, 5, 5, { margin: 2, inset: 5 });
    if (sp) {
      const cx = (sp.x0 + sp.x1) / 2, cz = (sp.z0 + sp.z1) / 2;
      zb.prop('z_fountain', cx, 0, cz, R.dec.range(0, 3), { r: 1.5 });
      view(c, 'fount', cx, cz + 6, 0, -1, -0.1);
      for (const [dx, dz, rot] of [[0, 2.5, 0], [0, -2.5, Math.PI], [2.5, 0, -Math.PI / 2], [-2.5, 0, Math.PI / 2]]) if (R.dec.chance(0.7)) zb.prop('bench', cx + dx, 0, cz + dz, rot, { len: 1.6 });
      reserve(c, sp.x0 - 1, sp.z0 - 1, sp.x1 + 1, sp.z1 + 1, 8);
    }
  } else if (area >= 400) {
    const sp = findSpot(c, 4, 3, { margin: 2, inset: 4 });
    if (sp) {
      const cx = (sp.x0 + sp.x1) / 2, cz = (sp.z0 + sp.z1) / 2;
      zb.prop('z_planter', cx - 1, 0, cz, 0, { len: 1.8 });
      zb.prop('z_planter', cx + 1.2, 0, cz, 0, { len: 1.6 });
      reserve(c, sp.x0, sp.z0, sp.x1, sp.z1, 8);
    }
  }
  // ---- waiting chairs
  const nSeat = Math.max(1, Math.round(area / 170));
  for (let k = 0; k < nSeat; k++) {
    const units = R.dec.int(2, 4), alongX = R.dec.chance(0.5);
    const len = units * (3 * 0.56 + 0.1);
    const sp = findSpot(c, alongX ? len + 0.5 : 2.0, alongX ? 2.0 : len + 0.5, { margin: 1.2, inset: 2 });
    if (!sp) continue;
    const cx = (sp.x0 + sp.x1) / 2, cz = (sp.z0 + sp.z1) / 2;
    seatBlock(c, cx, cz, alongX, units, { n: 3 });
    // table / lamp / dead plant at the ends
    const e = len / 2 + 0.55;
    const [tx, tz] = alongX ? [cx + e, cz] : [cx, cz + e], [px, pz] = alongX ? [cx - e, cz] : [cx, cz - e];
    if (R.dec.chance(0.7)) { zb.prop('coffee_table', tx, 0, tz, alongX ? 0 : Math.PI / 2, {}); if (R.dec.chance(0.7)) zb.prop('papers', tx, 0.43, tz, R.dec.range(0, 3), { n: R.dec.int(1, 3) }); }
    zb.prop(R.dec.chance(0.6) ? 'plant' : 'lamp_floor', px, 0, pz, 0, { on: R.dec.chance(1 - p.fail) });
    reserve(c, sp.x0 - 0.5, sp.z0 - 0.5, sp.x1 + 0.5, sp.z1 + 0.5, 9);
  }
  // ---- columns on a grid
  if (zb.w >= 24 && zb.d >= 24) {
    const sp = R.lay.pick([6, 7, 8]);
    columns(c, x0 + 3, z0 + 3, x1 - 2, z1 - 2, sp, R.lay.pick([sp, sp, sp + 1]), H, M.z_stone, { ox: 0, oz: 0 });
  }
  // ---- perimeter: pilasters, trim and objects
  const pil = Math.max(5, R.lay.int(6, 8));
  for (const side of ['N', 'S', 'W', 'E']) {
    const F = sideFrame(c, side);
    for (let u = pil; u < F.U - 2; u += pil) {
      if (F.gateNear(u - 0.5, u + 0.5, 1.5)) continue;
      const q = F.rect(u - 0.3, 0.1, u + 0.3, 0.42);
      if (!freeRect(c, Math.floor(q[0]), Math.floor(q[1]), Math.ceil(q[2]), Math.ceil(q[3]), 0)) continue;
      F.box(u - 0.3, 0, 0.1, u + 0.3, H, 0.42, p.wallMat === M.z_stone ? M.plaster : M.z_stone, { sub: 1.6 });
    }
  }
  wallTrim(c, [{ y0: 0, y1: 0.18, t: 0.05, mat: M.wood_dark }, { y0: 0.18, y1: 0.92, t: 0.03, mat: M.wood_panel }, { y0: 0.92, y1: 0.99, t: 0.06, mat: M.wood_dark }], blocked);
  wallItems(c, { items: [['sconce', 3], ['art', 3], ['plant', 2.5], ['bench', 2.2], ['planter', 1.6], ['bed', 1.4], ['waitsign', 1.0], ['piano', R.dec.chance(0.35) ? 0.7 : 0], ['vending', 0.8], ['cooler', 0.7], ['phones', 0.7], ['trash', 0.8], ['clock', 0.8], ['sign', 0.8], ['poster', 0.5], ['extinguisher', 0.4]], step: 4.2, clockR: 0.5 });
  view(c, 'mid', (x0 + x1) / 2 + 3, (z0 + z1) / 2 + 3, -1, -1);
  view(c, 'mid2', x0 + 3, z0 + 3, 1, 1);
  // ---- lights
  lightGrid(c, x0, z0, x1, z1, 4, 'panel', { mul: 1.9, rad: 8.4, rot: 0 });
  // stairs/escalator? no: a few dead exit signs over the gates
}

// ------------------------------------------------------------------ elevators that do not work
function elevatorBank(c, F, ub, ne, H, blocked) {
  const { zb, r } = c;
  const bw = ne * 2.6;
  const frame = r.pick([M.chrome, M.metal, M.metal_dark]);
  for (let k = 0; k < ne; k++) {
    const uc = ub + (k + 0.5) * 2.6;
    F.decal(uc, 1.1, 1.5, 2.2, 'elevator');
    F.box(uc - 0.82, 0, 0.1, uc - 0.74, 2.32, 0.24, frame, { collide: false });
    F.box(uc + 0.74, 0, 0.1, uc + 0.82, 2.32, 0.24, frame, { collide: false });
    F.box(uc - 0.82, 2.24, 0.1, uc + 0.82, 2.34, 0.24, frame, { collide: false });
    F.decal(uc, 2.62, 0.42, 0.42, 'z_floor_ind', { lit: false, glow: 0.9 });
    if (k < ne - 1) F.decal(uc + 1.3, 1.1, 0.3, 0.3, 'b_elev_btn');
    if (r.chance(0.18)) F.decal(uc + r.range(-0.3, 0.3), 1.5, 0.38, 0.38, 'z_oos', {}, 0.12);
  }
  F.decal(ub + bw + 0.2, 1.1, 0.3, 0.3, 'b_elev_btn');
  // surround
  F.box(ub - 0.15, 0, 0.1, ub, H, 0.36, M.z_stone, { sub: 1.6 });
  F.box(ub + bw, 0, 0.1, ub + bw + 0.15, H, 0.36, M.z_stone, { sub: 1.6 });
  F.box(ub - 0.15, 2.6 + 0.4, 0.1, ub + bw + 0.15, 3.0 + 0.4, 0.3, M.z_stone, { collide: false, skip: 4 });
  F.decal(ub - 1.1, 1.55, 0.85, 1.1, 'z_dir_board');
  // keep trims off the bank
  const cells = F.rect(ub - 1.6, 0, ub + bw + 0.3, 1);
  for (let z = Math.floor(cells[1]); z < Math.ceil(cells[3]); z++) for (let x = Math.floor(cells[0]); x < Math.ceil(cells[2]); x++) {
    blocked.add(faceKey(x, z, -F.into[0], -F.into[1]));
  }
  // a dead plant and a bench or two in front
  F.place('bench', ub + bw / 2, 2.9, 0, -1, { len: 1.6 });
  F.place('plant', ub - 0.7, 0.5, 0, 1);
  F.place('plant', ub + bw + 0.7, 0.5, 0, 1);
  F.place('z_stanchion', ub - 0.4, 2.2, 0, 1, { len: 0 });
  if (r.chance(0.7)) F.place('b_clock', ub + bw / 2, 0.1, 0, 1, { r: 0.3, face: 'clock_b' }, 3.35 + 0);
}

// ------------------------------------------------------------------ reception
function reception(c, F, u, H, blocked) {
  const { zb, r, p } = c;
  const L = r.pick([3, 4, 5]);
  const dv = 3.3;
  F.place('reception_desk', u, dv, 0, 1, { len: L, mat: r.pick(['wood_dark', 'wood_dark', 'wood']) });
  // phone on the visitor side counter (save point)
  const [ph, pz] = F.pt(u + r.range(-L / 2 + 0.6, L / 2 - 0.6), dv + 0.2);
  zb.prop('phone', ph, 1.15, pz, F.rot(0, 1), { useY: 0.1 });
  // the other side of the desk: chairs, screens
  for (let k = 0; k < 2; k++) {
    if (k === 1 && r.chance(0.3)) continue;
    const uu = u + (k === 0 ? -L / 4 : L / 4);
    F.place('chair_exec', uu + r.range(-0.2, 0.2), dv - 0.9, 0, 1, { fabric: 'fabric_gray' });
    const [sx, sz] = F.pt(uu - 0.2, dv - 0.12);
    zb.prop('crt', sx, 0.76, sz, F.rot(0, -1), { screen: 'crt_off' });
  }
  const [qx, qz] = F.pt(u + L / 2 - 0.5, dv + 0.25);
  zb.prop('papers', qx, 1.16, qz, r.range(0, 3), { n: r.int(1, 3) });
  // sign and clock on the wall behind
  F.decal(u, Math.min(2.7, H - 0.9), 1.5, 1.5, 'sign_reception');
  F.place('b_clock', u + L / 2 + 1.6, 0.1, 0, 1, { r: 0.5, face: r.pick(['clock_a', 'clock_b']) }, Math.min(H - 0.8, 2.9));
  // plants at both ends of the desk
  F.place('plant', u - L / 2 - 0.7, dv - 0.5, 0, 1);
  F.place('plant', u + L / 2 + 0.7, dv - 0.5, 0, 1);
  // queue line
  const n = r.int(4, 6), len = 1.3;
  const x0u = u - (n - 1) * len / 2;
  for (let k = 0; k < n; k++) {
    const [px, pz] = F.pt(x0u + k * len, dv + 3.0);
    const dir = F.vec(1, 0);
    zb.prop('z_stanchion', px, 0, pz, Math.atan2(dir[1], dir[0]), { len: k < n - 1 ? len : 0 });
  }
  reserve(c, ...F.rect(u - L / 2 - 1.5, 0, u + L / 2 + 1.5, dv + 4.6), 7);
  // trims behind the desk would run into the sign: leave them
  void blocked; void p;
}

// ------------------------------------------------------------------ variant: waiting room
function genWaiting(c) {
  const { zb, p } = c;
  const R = c.rng;
  const { x0, z0, x1, z1 } = zb;
  const area = zb.w * zb.d;
  const blocked = new Set();
  const sides = R.lay.shuffle(['N', 'S', 'W', 'E']);
  // side rooms first (restroom / office / storage)
  const rooms = sideRooms(c, { n: area >= 500 ? R.lay.int(1, 2) : R.lay.int(0, 1), width: [4, 6], depth: [4, 6], sides: sides.slice(0, 3) }, p.wallMat, p.wallMat, () => R.dec.pick([M.lino_vct, M.tile_check]), 2.7, M.ceil_tile_white);
  for (const rm of rooms) dressSideRoom(c, rm, [['restroom', 3], ['office', 2], ['store', 1.5], ['security', 0.7]]);
  // an unattended service counter along one wall
  let counterSide = null;
  if (p.focus === 'counter') counterSide = serviceCounter(c, sides);
  // islands of seating
  const nPods = clamp(Math.round(area / 150), 1, 10);
  for (let k = 0; k < nPods; k++) seatPod(c, k, counterSide);
  // a few columns in the big halls
  if (area >= 700) {
    const sp = R.lay.pick([7, 8, 9]);
    columns(c, x0 + 3, z0 + 3, x1 - 2, z1 - 2, sp, sp, p.ceilH, M.plaster, { ox: 2, oz: 2, hw: 0.28 });
  }
  // perimeter objects
  wallTrim(c, [{ y0: 0, y1: 0.12, t: 0.04, mat: M.wood_dark }], blocked);
  wallItems(c, { items: [['poster', 3], ['plant', 2.2], ['vending', 1.1], ['cooler', 1], ['trash', 1.2], ['clock', 1.4], ['sign', 1], ['art', 0.8], ['extinguisher', 0.8], ['bench', 0.5]], step: 4.5, clockR: 0.24 });
  // take-a-number machine and its sign near an entrance
  for (const gate of c.gates.slice(0, 1)) {
    const F = sideFrame(c, gate.side);
    const gu = F.gateU.size ? [...F.gateU][0] : 3;
    for (const u of [gu + 4, gu - 4]) {
      if (u < 2 || u > F.U - 2 || F.gateNear(u - 1, u + 1, 1.5)) continue;
      const q = F.rect(u - 1, 0, u + 1.5, 1.6);
      if (!freeRect(c, Math.floor(q[0]), Math.floor(q[1]), Math.ceil(q[2]), Math.ceil(q[3]), 0)) continue;
      F.place('b_ticket', u, 0.5, 0, 1);
      F.decal(u + 0.8, 1.6, 0.7, 0.7, 'b_take_num');
      reserve(c, ...q, 7);
      break;
    }
  }
  view(c, 'wait1', (x0 + x1) / 2, (z0 + z1) / 2, 0, -1);
  view(c, 'wait2', (x0 + x1) / 2, (z0 + z1) / 2, 1, 0);
  view(c, 'wait3', x0 + 2, z0 + 2, 1, 1);
  lightGrid(c, x0, z0, x1, z1, 3, 'troffer', { mul: 1.15, rot: 1 });
}

// the counter wall: nobody behind it
function serviceCounter(c, sides) {
  const { zb, p } = c;
  const R = c.rng;
  for (const side of sides) {
    const [a, b] = freeSpan(c, side, 2);
    if (b - a < 8) continue;
    const F = sideFrame(c, side);
    const n = clamp(Math.floor((b - a - 2) / 1.5), 3, 6);
    const u = (a + b) / 2 + R.lay.range(-1, 1);
    const cv = 1.9;
    for (let k = 0; k < n; k++) {
      const uu = u + (k - (n - 1) / 2) * 1.25;
      F.place('counter', uu, cv, 0, 1, { len: 1.2 });
      if (R.dec.chance(0.85)) F.place('chair_office', uu + R.dec.range(-0.15, 0.15), cv - 0.9, 0, 1, { fabric: 'fabric_gray' }); // faces the counter
      const [cx, cz] = F.pt(uu, cv - 0.05);
      if (R.dec.chance(0.7)) zb.prop('crt', cx, 0.93, cz, F.rot(0, -1), { screen: 'crt_off' });
      if (R.dec.chance(0.3)) zb.prop('papers', cx + 0.2, 0.935, cz + 0.1, R.dec.range(0, 3), { n: R.dec.int(1, 3) });
    }
    // the wall behind: numbered display, signs
    const [dx, dz] = F.pt(u, cv - 0.2);
    zb.prop('z_display', dx, zb.ceil[zb.i(Math.floor(dx), Math.floor(dz))], dz, F.rot(0, 1), { drop: 0.5 });
    F.decal(u - (n * 1.25) / 2 - 0.9, 1.6, 0.7, 0.7, 'b_take_num');
    F.decal(u + (n * 1.25) / 2 + 0.9, 1.6, 0.7, 0.9, 'z_poster_forms');
    F.decal(u, 2.45, 1.2, 0.6, 'sign_wait');
    F.place('b_ticket', u - (n * 1.25) / 2 - 1.0, 2.4, 0, 1);
    // queue line
    const m = R.dec.int(3, 5);
    for (let k = 0; k < m; k++) {
      const [px, pz] = F.pt(u - (m - 1) * 0.6 + k * 1.2, cv + 2.2);
      const dir = F.vec(1, 0);
      zb.prop('z_stanchion', px, 0, pz, Math.atan2(dir[1], dir[0]), { len: k < m - 1 ? 1.2 : 0 });
    }
    reserve(c, ...F.rect(u - (n * 1.25) / 2 - 1.8, 0, u + (n * 1.25) / 2 + 1.8, cv + 3.2), 7);
    view(c, 'counter', ...F.pt(u, cv + 7), -F.into[0], -F.into[1]);
    void p;
    return side;
  }
  return null;
}

// an island of seating: rows of tandem seats facing a television on a stand, a blank wall or the counter
function seatPod(c, k, counterSide) {
  const { zb, p } = c;
  const R = c.rng;
  const small = Math.min(zb.w, zb.d);
  const units = R.dec.int(2, small >= 24 ? 3 : 2), rows = Math.min(R.dec.int(2, 4), Math.max(1, Math.floor((small - 6.5) / 1.45)));
  const pitch = 3 * 0.56 + 0.1;
  const podW = units * pitch + 1.0, podD = rows * 1.45 + 3.4;
  const focus = p.focus;
  if (focus === 'blank' || (focus === 'counter' && !counterSide)) {
    // anchored to a wall, facing it
    const side = R.lay.pick(['N', 'S', 'W', 'E']);
    const F = sideFrame(c, side);
    if (F.U < podW + 3) return;
    const u0 = R.lay.range(1.5, F.U - podW - 1.5);
    if (F.gateNear(u0 - 0.5, u0 + podW + 0.5, 2.5)) return;
    const q = F.rect(u0, 0, u0 + podW, podD);
    if (!freeRect(c, Math.floor(q[0]), Math.floor(q[1]), Math.ceil(q[2]), Math.ceil(q[3]), 0)) return;
    for (let j = 0; j < rows; j++) seatRow(c, ...F.pt(u0 + podW / 2, 2.6 + j * 1.45), -F.into[0], -F.into[1], units, { n: 3, color: p.chairColor, miss: 0.08 });
    F.decal(u0 + podW / 2, 1.7, 0.9, 0.6, R.dec.pick(['sign_wait', 'poster_notice', 'z_poster_quiet']));
    if (R.dec.chance(0.7)) F.place('b_clock', u0 + podW / 2 + 1.6, 0.1, 0, 1, { r: 0.24, face: R.dec.pick(['clock_a', 'clock_b']) }, 2.3);
    F.place('coffee_table', u0 - 0.7, 1.0, 1, 0, {});
    reserve(c, ...q, 7);
    view(c, 'pod' + k, ...F.pt(u0 + podW / 2, 2.6 + (rows - 1) * 1.45 + 3.2), -F.into[0], -F.into[1], 0.02);
    return;
  }
  // free-standing: the focus is a television on a stand (or, with a counter, the counter wall)
  let f = R.dec.pick([[0, -1], [0, 1], [1, 0], [-1, 0]]);
  if (focus === 'counter' && counterSide) { const F = sideFrame(c, counterSide); f = [-F.into[0], -F.into[1]]; }
  const alongX = f[1] !== 0;
  const sp = findSpot(c, alongX ? podW : podD, alongX ? podD : podW, { margin: 1.2, inset: 1 });
  if (!sp) return;
  const cx = (sp.x0 + sp.x1) / 2, cz = (sp.z0 + sp.z1) / 2;
  const half = podD / 2;
  const fx = cx + f[0] * (half - 0.7), fz = cz + f[1] * (half - 0.7);
  if (focus === 'tv') {
    const scr = R.dec.chance(0.82) ? 'static' : 'off';
    if (R.dec.chance(0.4)) {
      // a bare CRT on a small table
      zb.prop('table', fx, 0, fz, facing(-f[0], -f[1]), { len: 0.8, depth: 0.55, top: 'plastic_gray' });
      zb.prop('crt', fx, 0.76, fz, facing(-f[0], -f[1]), { screen: scr === 'static' ? 'static' : 'crt_off' });
      if (scr === 'static') { zb.emitter(fx, 1.0, fz, 'static', { vol: 0.5, rad: 7 }); zb.light(fx - f[0] * 0.6, 1.0, fz - f[1] * 0.6, { rad: 2.6, int: 0.25, color: [0.7, 0.75, 0.85] }); }
    } else zb.prop('tv', fx, 0, fz, facing(-f[0], -f[1]), { screen: scr, stand: true });
  }
  for (let j = 0; j < rows; j++) {
    const dist = 2.6 + j * 1.45;
    seatRow(c, fx - f[0] * dist, fz - f[1] * dist, f[0], f[1], units, { n: 3, color: p.chairColor, miss: 0.08 });
  }
  // a side table with magazines and a dead plant
  const sx = alongX ? cx + podW / 2 + 0.2 : cx + f[0] * 0, sz = alongX ? cz + f[1] * (half - 3.2) : cz + podW / 2 + 0.2;
  if (R.dec.chance(0.75)) {
    zb.prop('coffee_table', sx, 0, sz, alongX ? 0 : Math.PI / 2, {});
    zb.prop('papers', sx + R.dec.range(-0.2, 0.2), 0.43, sz + R.dec.range(-0.1, 0.1), R.dec.range(0, 3), { n: R.dec.int(2, 4) });
    if (R.dec.chance(0.5)) zb.prop('book', sx, 0.43, sz + 0.2, R.dec.range(0, 3), {});
  }
  if (R.dec.chance(0.5)) zb.prop('plant', alongX ? cx - podW / 2 - 0.2 : cx + f[0] * 0, 0, alongX ? cz + f[1] * (half - 0.5) : cz - podW / 2 - 0.2, 0);
  reserve(c, sp.x0 - 0.5, sp.z0 - 0.5, sp.x1 + 0.5, sp.z1 + 0.5, 7);
  view(c, 'pod' + k, fx - f[0] * (2.6 + (rows - 1) * 1.45 + 3.2), fz - f[1] * (2.6 + (rows - 1) * 1.45 + 3.2), f[0], f[1], 0.02);
  void k;
}

// ------------------------------------------------------------------ variant: conference hall
function genConference(c) {
  const { zb, p } = c;
  const R = c.rng;
  const { x0, z0, x1, z1 } = zb;
  // stage side opposite the foyer
  const stage = R.lay.pick(['N', 'S', 'W', 'E']);
  const F = sideFrame(c, stage);
  // hall dimensions in the stage frame: U along the stage wall, V from the stage wall toward the foyer
  const hallU = clamp(Math.min(F.U - 2 * R.lay.int(3, 4), F.U - 6), 12, 34);
  const hallV = clamp(Math.min(F.V - R.lay.int(3, 4) - R.lay.int(2, 3), F.V - 6), 10, 30);
  const slackU = F.U - hallU, slackV = F.V - hallV;
  const u0 = slackU >= 6 ? R.lay.int(3, slackU - 3) : Math.floor(slackU / 2);
  const v0 = slackV >= 6 ? R.lay.int(2, slackV - 4) : Math.max(2, Math.floor(slackV / 3));
  const hall = F.rect(u0, v0, u0 + hallU, v0 + hallV);
  const rect = { x0: hall[0], z0: hall[1], x1: hall[2], z1: hall[3] };
  // doors: double doors toward the foyer (far side), single doors on the side walls near the foyer end
  const farSide = { N: 'S', S: 'N', W: 'E', E: 'W' }[stage];
  const alongStageX = stage === 'N' || stage === 'S';
  const t = (u) => Math.floor(u);
  const lateralLen = hallU, depthLen = hallV;
  const doorsSpec = [];
  const dd1 = Math.floor(lateralLen * 0.28), dd2 = Math.floor(lateralLen * 0.7);
  // convert frame coordinates (u along stage wall) to indices along each wall of the rect
  const idxAlong = (uIdx) => (stage === 'N' || stage === 'S' ? uIdx : uIdx);
  doorsSpec.push({ side: farSide, t: idxAlong(dd1), n: 2 });
  doorsSpec.push({ side: farSide, t: idxAlong(dd2), n: 2 });
  const sideA = stage === 'N' || stage === 'S' ? 'W' : 'N', sideB = stage === 'N' || stage === 'S' ? 'E' : 'S';
  const sdT = Math.floor(depthLen * 0.7);
  // side wall door indices run along the depth axis; index from the rect's low edge
  const depthIdx = (v) => (stage === 'N' || stage === 'W' ? v : depthLen - 1 - v);
  doorsSpec.push({ side: sideA, t: depthIdx(sdT) });
  doorsSpec.push({ side: sideB, t: depthIdx(sdT) });
  void alongStageX; void t;
  // the room box
  zb.rectCeil(rect.x0, rect.z0, rect.x1, rect.z1, p.hallH, M.z_ceil_coffer);
  buildRoomBox(c, rect, { inner: p.hallWall, outer: p.wallMat, floor: p.floorMat, ceil: p.hallH, ceilMat: M.z_ceil_coffer, doors: doorsSpec, id: 50 });
  reserve(c, rect.x0, rect.z0, rect.x1, rect.z1, 10);
  // hall frame (stage at v = 0)
  const HF = frameOf(c, rect, stage);
  view(c, 'foyer', zb.x0 + 1.5, zb.z0 + 1.5, 1, 1);
  { const [vx, vz] = HF.pt(HF.U / 2, HF.V - 1.2); view(c, 'confback', vx, vz, HF.into[0] * -1, HF.into[1] * -1, 0.02); const [wx, wz] = HF.pt(HF.U / 2, 5); view(c, 'confmid', wx, wz, -HF.into[0], -HF.into[1], 0.02); const [sx, sz] = HF.pt(2, 2); view(c, 'confstage', sx, sz, HF.into[0], HF.into[1], 0.05); }
  stageSetup(c, HF, p);
  audienceRows(c, HF, p);
  hallLights(c, HF, p);
  // foyer & ring: the rest of the zone is a small lobby
  const blocked = new Set();
  const foyerRooms = sideRooms(c, { n: Math.max(1, Math.round((zb.w * zb.d) / 700)), width: [4, 6], depth: [4, 5] }, p.wallMat, p.wallMat, () => R.dec.pick([M.lino_vct, M.carpet_gray]), 2.8, M.ceil_tile_white);
  for (const rm of foyerRooms) dressSideRoom(c, rm, [['store', 3], ['restroom', 2.5], ['office', 1.4], ['coat', 1.2]]);
  foyerFurniture(c, HF, rect, farSide, p);
  hallExterior(c, rect, doorsSpec);
  wallTrim(c, [{ y0: 0, y1: 0.14, t: 0.05, mat: M.wood_dark }], blocked);
  wallItems(c, { items: [['poster', 2.5], ['sign', 1.4], ['plant', 2.4], ['art', 1.4], ['sconce', 1.5], ['cooler', 1.0], ['trash', 1.2], ['clock', 0.8], ['extinguisher', 0.8], ['bench', 0.8]], step: 4.5, clockR: 0.3 });
  ringLights(c, rect, p);
}

// lights along the ring of space around the hall (on the middle of each strip)
function ringLights(c, rect, p) {
  const { zb, r } = c;
  const put = (x, z) => ceilingLight(zb, Math.floor(x) + 0.5, Math.floor(z) + 0.5, 'panel', lightState(r, p.fail, p.flicker), { mul: 1.5, rad: 7.2 });
  const strips = [
    [zb.x0, zb.z0, rect.x0, zb.z1, 'z'], [rect.x1, zb.z0, zb.x1, zb.z1, 'z'],
    [rect.x0, zb.z0, rect.x1, rect.z0, 'x'], [rect.x0, rect.z1, rect.x1, zb.z1, 'x'],
  ];
  for (const [ax0, az0, ax1, az1, along] of strips) {
    const wd = along === 'z' ? ax1 - ax0 : az1 - az0;
    if (wd < 1) continue;
    const mid = along === 'z' ? ax0 + wd / 2 : az0 + wd / 2;
    const lo = along === 'z' ? az0 : ax0, hi = along === 'z' ? az1 : ax1;
    for (let t = lo + 2; t < hi - 1; t += 4) { if (along === 'z') put(mid, t); else put(t, mid); }
  }
}

// a frame for the hall rect with the stage at v = 0
function frameOf(c, rect, stage) {
  const into = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] }[stage];
  const zb = c.zb;
  const U = stage === 'N' || stage === 'S' ? rect.x1 - rect.x0 : rect.z1 - rect.z0, V = stage === 'N' || stage === 'S' ? rect.z1 - rect.z0 : rect.x1 - rect.x0;
  const pt = (u, v) => (stage === 'N' ? [rect.x0 + u, rect.z0 + v] : stage === 'S' ? [rect.x0 + u, rect.z1 - v] : stage === 'W' ? [rect.x0 + v, rect.z0 + u] : [rect.x1 - v, rect.z0 + u]);
  const eu = stage === 'N' || stage === 'S' ? [1, 0] : [0, 1];
  const vec = (du, dv) => [eu[0] * du + into[0] * dv, eu[1] * du + into[1] * dv];
  const rot = (du, dv) => { const w = vec(du, dv); return facing(w[0], w[1]); };
  const rectOf = (u0, v0, u1, v1) => { const a = pt(u0, v0), b = pt(u1, v1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; };
  const face = faceOfNormal(into[0], into[1]);
  return { U, V, pt, rot, vec, eu, into, rectOf, stage, face, zb };
}

function stageSetup(c, HF, p) {
  const { zb, r } = c;
  const R = c.rng;
  const { U, V } = HF;
  const sd = Math.min(3.2, V * 0.22);
  // raised stage: a 0.34 m platform across the width, one cell in from the side walls
  const q = HF.rectOf(1, 0, U - 1, sd);
  zb.rectFloor(Math.floor(q[0]), Math.floor(q[1]), Math.ceil(q[2]), Math.ceil(q[3]), 0.34, M.wood_dark);
  // screen: a blank projection screen centred on the back wall, with a case above and curtains at the sides
  const sw = Math.min(U - 4, 7), sh = sw * 0.56;
  const sy = Math.min(zb.ceil[zb.i(Math.floor(q[0]) + 1, Math.floor(q[1]) + 1)] - 0.5 - sh / 2, 2.2 + sh / 2);
  const [sx, sz] = HF.pt(U / 2, 0.12);
  zb.decal(sx, sy + 0.34, sz, HF.face, sw, sh, 'z_screen');
  const cs = HF.rectOf(U / 2 - sw / 2 - 0.1, 0.1, U / 2 + sw / 2 + 0.1, 0.3);
  zb.box(cs[0], sy + 0.34 + sh / 2, cs[1], cs[2], sy + 0.34 + sh / 2 + 0.2, cs[3], M.plastic_gray, { collide: false });
  for (const s of [-1, 1]) {
    const [cx, cz] = HF.pt(U / 2 + s * (sw / 2 + 1.1), 0.12);
    zb.decal(cx, 1.4 + 0.34, cz, HF.face, 1.6, 2.4, 'curtain');
  }
  // podium off to one side, a table with chairs on the other
  const side = R.dec.sign();
  const [px, pz] = HF.pt(U / 2 + side * 3.2, sd * 0.55);
  zb.prop('podium', px, 0.34, pz, HF.rot(0, 1) + R.dec.range(-0.12, 0.12), {});
  if (R.dec.chance(0.8)) {
    const [mx, mz] = HF.pt(U / 2 - side * 3.4, 1.1);
    zb.prop('table', mx, 0.34, mz, HF.rot(1, 0), { len: 2.4, depth: 0.8 });
    for (let k = -1; k <= 1; k += 2) { const [ccx, ccz] = HF.pt(U / 2 - side * 3.4 + k * 0.8, 0.35); zb.prop('chair_office', ccx, 0.34, ccz, HF.rot(0, 1) + R.dec.range(-0.3, 0.3)); }
  }
  // projector hanging at two thirds of the hall
  const [jx, jz] = HF.pt(U / 2, V * 0.62);
  const H = p.hallH;
  zb.prop('b_projector', jx, H - 0.85, jz, HF.rot(0, -1), { rod: 0.7 });
  // flag-less stage lights
  for (const s of [-1, 1]) {
    const [lx, lz] = HF.pt(U / 2 + s * 4, sd * 0.5);
    ceilingLight(zb, lx, lz, 'highbay', lightState(r, 0.25, 0.1), { hang: 0.8, mul: 1.5, rad: 8.2 });
  }
}

function audienceRows(c, HF, p) {
  const { zb } = c;
  const R = c.rng;
  const { U, V } = HF;
  const sd = Math.min(3.2, V * 0.22);
  const startV = sd + 2.6, endV = V - 1.6;
  const rowPitch = 1.0;
  const aisle = 1.5, sideAisle = 1.3;
  const seatW = 0.52;
  const usable = U - 2 * sideAisle - 0.6;
  const blocks = U >= 22 ? 3 : 2;
  const perBlock = Math.floor((usable - (blocks - 1) * aisle) / blocks / seatW);
  if (perBlock < 3) return;
  const blockW = perBlock * seatW;
  const totalW = blocks * blockW + (blocks - 1) * aisle;
  const startU = (U - totalW) / 2;
  let rows = 0;
  for (let v = startV; v < endV; v += rowPitch, rows++) {
    for (let b = 0; b < blocks; b++) {
      if (R.dec.chance(0.015)) continue;
      const cu = startU + b * (blockW + aisle) + blockW / 2;
      const [x, z] = HF.pt(cu, v);
      const jitter = R.dec.chance(0.05) ? R.dec.range(-0.08, 0.08) : 0;
      zb.prop('z_audrow', x, 0.0, z, HF.rot(0, -1) + jitter, { n: perBlock, tint: p.seatTint });
    }
  }
  // a few stray chairs in the aisles
  for (let k = 0; k < 2; k++) if (R.dec.chance(0.5)) {
    const [x, z] = HF.pt(R.dec.range(1, U - 1), R.dec.range(startV, endV));
    zb.prop('chair_folding', x, 0, z, R.dec.range(0, 6.28), {});
  }
  // rows of lamps on the side walls
  for (let v = startV; v < endV; v += 6) for (const u of [0.12, U - 0.12]) {
    const [x, z] = HF.pt(u, v);
    const nrm = HF.vec(u < 1 ? 1 : -1, 0);
    zb.prop('b_sconce', x, 2.3, z, facing(nrm[0], nrm[1]), { on: R.dec.chance(1 - p.fail) });
  }
}

function hallLights(c, HF, p) {
  const { zb, r } = c;
  const { U, V } = HF;
  for (let v = 2.2; v < V - 0.8; v += 3.6) for (let u = 2.4; u < U - 1; u += 4.0) {
    const [x, z] = HF.pt(u, v);
    ceilingLight(zb, x, z, 'panel', lightState(r, p.fail * 0.6, p.flicker), { mul: 2.0, rad: 8.6 });
  }
}

// objects on the outside of the hall walls (facing the ring of corridor around it)
function hallExterior(c, rect, doorsSpec) {
  const { zb, r } = c;
  const R = c.rng;
  const H = zb.ceil[zb.i(zb.x0 + 1, zb.z0 + 1)];
  const sides = [
    { s: 'N', n: [0, -1], len: rect.x1 - rect.x0, pt: (u, v) => [rect.x0 + u, rect.z0 - v], ring: rect.z0 - zb.z0 },
    { s: 'S', n: [0, 1], len: rect.x1 - rect.x0, pt: (u, v) => [rect.x0 + u, rect.z1 + v], ring: zb.z1 - rect.z1 },
    { s: 'W', n: [-1, 0], len: rect.z1 - rect.z0, pt: (u, v) => [rect.x0 - v, rect.z0 + u], ring: rect.x0 - zb.x0 },
    { s: 'E', n: [1, 0], len: rect.z1 - rect.z0, pt: (u, v) => [rect.x1 + v, rect.z0 + u], ring: zb.x1 - rect.x1 },
  ];
  const doorAt = (side, u) => doorsSpec.some((d) => d.side === side && u > d.t - 1.2 && u < d.t + (d.n || 1) + 1.2);
  for (const S of sides) {
    if (S.ring < 2) continue;
    for (let u = 2 + R.dec.range(0, 2); u < S.len - 1.5; u += 3.5 + R.dec.range(0, 2)) {
      if (doorAt(S.s, u)) continue;
      const [cx, cz] = S.pt(u, 0.6);
      if (!freeRect(c, Math.floor(cx), Math.floor(cz), Math.floor(cx) + 1, Math.floor(cz) + 1, 0)) continue;
      const [wx, wz] = S.pt(u, 0.11);
      const face = faceOfNormal(S.n[0], S.n[1]);
      const rot = facing(S.n[0], S.n[1]);
      const k = R.dec.weighted([['poster', 3], ['art', 1.5], ['sign', 1.4], ['bench', 1.4], ['plant', 1.4], ['cooler', 0.7], ['clock', 0.6], ['trash', 0.8], ['exit', 0.6]]);
      switch (k) {
        case 'poster': zb.decal(wx, 1.55, wz, face, 0.55, 0.7, R.dec.pick(['poster_notice', 'poster_map', 'z_poster_forms', 'z_poster_quiet', 'poster_safety'])); break;
        case 'art': zb.decal(wx, 1.7, wz, face, 1.1, 0.9, R.dec.pick(['painting_land', 'frame_empty', 'mirror'])); break;
        case 'sign': zb.decal(wx, 2.1, wz, face, 0.45, 0.45, R.dec.pick(['sign_restroom', 'sign_stairs', 'sign_thisway', 'sign_occupancy', 'sign_floor0'])); break;
        case 'bench': zb.prop('bench', ...S.pt(u, 0.5).slice(0, 1), 0, S.pt(u, 0.5)[1], rot, { len: 1.6 }); break;
        case 'plant': zb.prop('plant', cx, 0, cz, 0); break;
        case 'cooler': zb.prop('water_cooler', cx, 0, cz, rot, {}); break;
        case 'clock': zb.prop('b_clock', wx, Math.min(H - 0.6, 2.4), wz, rot, { r: 0.26, face: R.dec.pick(['clock_a', 'clock_b']) }); break;
        case 'trash': zb.prop('trash_can', cx, 0, cz, 0, {}); break;
        default: zb.prop('exit_sign', wx, Math.min(H - 0.1, 2.6), wz, rot, { green: R.dec.chance(0.5) }); break;
      }
      reserve(c, Math.floor(cx), Math.floor(cz), Math.floor(cx) + 1, Math.floor(cz) + 1, 11);
    }
  }
  void r;
}

// registration tables, stacked chairs, coat racks and a directory in the foyer
function foyerFurniture(c, HF, rect, farSide, p) {
  const { zb } = c;
  const R = c.rng;
  const nTables = R.dec.int(1, 3);
  for (let k = 0; k < nTables; k++) {
    const sp = findSpot(c, 3, 2, { margin: 1.0, inset: 2, rot: true });
    if (!sp) continue;
    const cx = (sp.x0 + sp.x1) / 2, cz = (sp.z0 + sp.z1) / 2;
    zb.prop('table', cx, 0, cz, sp.swapped ? Math.PI / 2 : 0, { len: 2.2, depth: 0.7, top: 'plastic_white' });
    zb.prop('papers', cx + R.dec.range(-0.5, 0.5), 0.76, cz, R.dec.range(0, 3), { n: R.dec.int(2, 5) });
    zb.prop('chair_folding', cx + (sp.swapped ? 0.7 : 0), 0, cz + (sp.swapped ? 0 : 0.7), R.dec.range(0, 6.28), {});
    reserve(c, sp.x0, sp.z0, sp.x1, sp.z1, 11);
  }
  for (let k = 0; k < 2; k++) {
    const sp = findSpot(c, 1, 1, { margin: 0.5, inset: 1 });
    if (sp) { zb.prop('stack_chairs', sp.x0 + 0.5, 0, sp.z0 + 0.5, R.dec.range(0, 0.4), { n: R.dec.int(8, 26) }); reserve(c, sp.x0, sp.z0, sp.x1, sp.z1, 11); }
  }
  void rect; void farSide; void p;
}

defineZone('lobby', {
  border: 'wall',
  gate: 'wide',
  minW: 16, minD: 16,
  weight: (c) => {
    if (c.dim !== 0 || c.dist <= 120) return 0;
    let w = 1.2 * (0.35 + 1.3 * c.office);
    if (c.level > 0) w *= 1.25;
    return w;
  },
  params: lobbyParams,
  gen: (zb, world) => {
    const R = zb.rng;
    const rng = { lay: R.fork('lay'), dec: R.fork('dec'), lit: R.fork('lit') };
    const c = makeCtx(zb, world, R.fork('misc'));
    c.rng = rng;
    const v = zb.params.variant;
    if (v === 'lobby') genLobbyHall(c);
    else if (v === 'waiting') genWaiting(c);
    else genConference(c);
    gateLights(c, v === 'waiting' ? 'troffer' : 'panel', { mul: v === 'lobby' ? 1.9 : 1.4, rad: v === 'lobby' ? 8.2 : 7.2, rot: 1 });
    zb.zInfo = c;
  },
});
