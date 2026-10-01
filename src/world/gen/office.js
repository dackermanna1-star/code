// Abandoned office floors: corridors, private offices, cubicle farms, meeting rooms, kitchens.
import { defineZone } from '../zonetypes.js';
import { W, CF, M, pmod, ceilingLight, freeCell, openCell, wallFace, findWallSpots, floorDecal, facing, env, propOnWall, DIRS4 } from './common.js';

function officeParams(zone, rng, ctx) {
  const abandoned = rng.chance(0.35 + Math.min(0.4, ctx.dist / 3000));
  const p = {
    wallMat: rng.weighted([[M.paint_wall, 4], [M.paint_beige, 3], [M.paint_cream, 2], [M.wp_plain, 1], [M.paint_blue, 0.6]]),
    floorMat: rng.weighted([[M.carpet_office, 5], [M.carpet_gray, 3], [M.carpet_blue, 1.5], [M.carpet_green, 1], [M.lino_vct, 1]]),
    ceilMat: rng.weighted([[M.ceil_tile_white, 4], [M.ceil_tile, 2], [M.ceil_tile_old, abandoned ? 2 : 0.5]]),
    ceilH: rng.pick([2.6, 2.7, 2.7, 2.8]),
    layout: rng.weighted([['rooms', 5], ['cubicles', 3], ['mixed', 3]]),
    abandoned,
    fail: abandoned ? rng.range(0.15, 0.45) : rng.range(0.02, 0.1),
    flicker: abandoned ? rng.range(0.05, 0.15) : 0.03,
    ambient: abandoned ? [0.16, 0.16, 0.16] : [0.24, 0.24, 0.235],
  };
  p.env = env({ fog: abandoned ? [0.2, 0.2, 0.19] : [0.34, 0.33, 0.3], fogNear: 4, fogFar: abandoned ? 26 : 32, hum: 0.55, hvac: 0.65, reverb: 'office', tone: 'office' });
  return p;
}

// ------------------------------------------------------------------ layout
function genOffice(zb) {
  const p = zb.params, r = zb.rng;
  const wm = p.wallMat;
  const corridor = new Uint8Array(zb.w * zb.d);
  const rooms = [];
  const isCorr = (x, z) => zb.in(x, z) && corridor[zb.i(x, z)] === 1;

  const split = (x0, z0, x1, z1, depth) => {
    const w = x1 - x0, d = z1 - z0;
    const big = w * d;
    const minDim = 3;
    const canX = w >= minDim * 2 + 1, canZ = d >= minDim * 2 + 1;
    const stop = (!canX && !canZ) || (big < 70 && r.chance(big < 30 ? 0.9 : 0.5)) || (p.layout !== 'rooms' && big >= 80 && big <= 400 && depth >= 1 && r.chance(0.45));
    if (stop) { rooms.push({ x0, z0, x1, z1 }); return; }
    const alongX = canX && (!canZ || w > d || (w === d && r.chance(0.5)));
    const len = alongX ? w : d;
    const wantCorr = (alongX ? d : w) >= 6 && len >= 13 && depth < 3 && r.chance(depth === 0 ? 0.95 : 0.7);
    if (wantCorr) {
      const cw = r.chance(0.2) ? 3 : 2;
      const s = r.int(minDim + 1, len - minDim - cw - 1);
      if (alongX) {
        const cx = x0 + s;
        zb.fill(cx, z0, cx + cw, z1, (x, z, i) => { corridor[i] = 1; });
        zb.vLine(cx, z0, z1, W.WALL, wm, wm); zb.vLine(cx + cw, z0, z1, W.WALL, wm, wm);
        split(x0, z0, cx, z1, depth + 1); split(cx + cw, z0, x1, z1, depth + 1);
      } else {
        const cz = z0 + s;
        zb.fill(x0, cz, x1, cz + cw, (x, z, i) => { corridor[i] = 1; });
        zb.hLine(cz, x0, x1, W.WALL, wm, wm); zb.hLine(cz + cw, x0, x1, W.WALL, wm, wm);
        split(x0, z0, x1, cz, depth + 1); split(x0, cz + cw, x1, z1, depth + 1);
      }
    } else {
      const s = r.int(minDim, len - minDim);
      if (alongX) { zb.vLine(x0 + s, z0, z1, W.WALL, wm, wm); split(x0, z0, x0 + s, z1, depth + 1); split(x0 + s, z0, x1, z1, depth + 1); }
      else { zb.hLine(z0 + s, x0, x1, W.WALL, wm, wm); split(x0, z0, x1, z0 + s, depth + 1); split(x0, z0 + s, x1, z1, depth + 1); }
    }
  };
  split(zb.x0, zb.z0, zb.x1, zb.z1, 0);

  // corridors open into each other where they meet
  zb.fill(zb.x0, zb.z0, zb.x1, zb.z1, (x, z) => {
    if (!isCorr(x, z)) return;
    if (isCorr(x - 1, z)) zb.setWall(x, z, 'W', W.NONE);
    if (isCorr(x, z - 1)) zb.setWall(x, z, 'N', W.NONE);
  });

  // rooms: type, doors, furniture
  rooms.forEach((rm, idx) => {
    zb.rectRoom(rm.x0, rm.z0, rm.x1, rm.z1, idx);
    const area = (rm.x1 - rm.x0) * (rm.z1 - rm.z0);
    rm.type = pickRoomType(r, area, p.layout, rm);
    doors(zb, rm, isCorr, r);
  });
  rooms.forEach((rm) => furnish(zb, rm, r));
  corridorDressing(zb, isCorr, r);
  // lights
  rooms.forEach((rm) => roomLights(zb, rm, r));
  zb.fill(zb.x0, zb.z0, zb.x1, zb.z1, (x, z) => {
    if (!isCorr(x, z)) return;
    // one troffer every 3 cells along corridors, centred
    const n = (isCorr(x - 1, z) || isCorr(x + 1, z)) && !(isCorr(x, z - 1) || isCorr(x, z + 1)) ? 'h' : 'v';
    if ((n === 'h' ? pmod(x, 3) : pmod(z, 3)) !== 0) return;
    if (n === 'h' && isCorr(x, z - 1) && !isCorr(x, z + 1)) return;
    if (n === 'v' && isCorr(x - 1, z) && !isCorr(x + 1, z)) return;
    ceilingLight(zb, x + (n === 'v' ? (isCorr(x + 1, z) ? 1 : 0.5) : 0.5), z + (n === 'h' ? (isCorr(x, z + 1) ? 1 : 0.5) : 0.5), 'troffer', lightState(r, p), { rot: n === 'h' ? 1 : 0 });
  });
}

function lightState(r, p) {
  const u = r.next();
  if (u < p.fail) return 'off';
  if (u < p.fail + p.flicker) return r.chance(0.35) ? 'dying' : 'flicker';
  return 'on';
}

function pickRoomType(r, area, layout, rm) {
  const w = rm.x1 - rm.x0, d = rm.z1 - rm.z0;
  const slim = Math.min(w, d);
  if (area >= 70 && slim >= 6) return r.weighted([['cubicles', layout === 'rooms' ? 2 : 6], ['openoffice', 2], ['meeting', 1], ['empty', 1.2], ['bullpen', 0.6]]);
  if (area >= 24) return r.weighted([['meeting', 2.4], ['office', 2], ['kitchen', 1.4], ['openoffice', 1.5], ['empty', 1], ['server', 0.5], ['restroom', 0.6], ['storage', 0.6]]);
  if (area >= 12) return r.weighted([['office', 4], ['copy', 1.2], ['kitchen', 0.8], ['storage', 1.4], ['empty', 0.8], ['restroom', 0.6]]);
  return r.weighted([['storage', 2], ['closet', 2], ['office', 1], ['empty', 1]]);
}

function doors(zb, rm, isCorr, r) {
  // candidate edges on the room boundary
  const cands = [];
  const consider = (x, z, side, ox, oz) => {
    if (!zb.in(ox, oz)) return;
    cands.push({ x, z, side, corr: isCorr(ox, oz), ox, oz });
  };
  for (let x = rm.x0 + 1; x < rm.x1 - 1; x++) { consider(x, rm.z0, 'N', x, rm.z0 - 1); consider(x, rm.z1, 'N', x, rm.z1); }
  for (let z = rm.z0 + 1; z < rm.z1 - 1; z++) { consider(rm.x0, z, 'W', rm.x0 - 1, z); consider(rm.x1, z, 'W', rm.x1, z); }
  const corr = cands.filter((c) => c.corr);
  const pool = corr.length ? corr : cands;
  if (!pool.length) return;
  const n = pool === corr && (rm.x1 - rm.x0) * (rm.z1 - rm.z0) > 60 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const c = r.pick(pool);
    const wide = rm.type === 'cubicles' || rm.type === 'openoffice' || rm.type === 'bullpen';
    zb.setWall(c.x, c.z, c.side, W.DOOR);
    if (wide && c.side === 'N' && zb.in(c.x + 1, c.z)) zb.setWall(c.x + 1, c.z, 'N', W.DOOR);
    if (wide && c.side === 'W' && zb.in(c.x, c.z + 1)) zb.setWall(c.x, c.z + 1, 'W', W.DOOR);
    rm.doors = rm.doors || [];
    rm.doors.push(c);
    // interior window beside office doors facing corridors
    if (rm.type === 'office' && c.corr && r.chance(0.5)) {
      const wx = c.side === 'N' ? c.x + (c.x + 2 < rm.x1 ? 2 : -2) : c.x, wz = c.side === 'W' ? c.z + (c.z + 2 < rm.z1 ? 2 : -2) : c.z;
      if (zb.getWall(wx, wz, c.side) === W.WALL) zb.setWall(wx, wz, c.side, W.WINDOW);
    }
  }
}

// ------------------------------------------------------------------ furnishing
function inside(rm, x, z, m = 0) { return x >= rm.x0 + m && x < rm.x1 - m && z >= rm.z0 + m && z < rm.z1 - m; }
function nearDoor(rm, x, z) {
  return (rm.doors || []).some((d) => {
    const dx = d.side === 'W' ? (d.x === rm.x0 ? rm.x0 : rm.x1 - 1) : d.x;
    const dz = d.side === 'N' ? (d.z === rm.z0 ? rm.z0 : rm.z1 - 1) : d.z;
    return Math.abs(dx - x) <= 1 && Math.abs(dz - z) <= 1;
  });
}

function workstation(zb, x, z, rot, r, opts = {}) {
  // desk centre at (x,z); desk front (user side) faces rot
  const fx = Math.sin(rot), fz = -Math.cos(rot);
  zb.prop('desk', x, 0, z, rot, { side: opts.side });
  const abandoned = zb.params.abandoned;
  if (r.chance(0.9)) zb.prop('crt', x - fz * 0.25 * 0 + fx * 0.1, 0.75, z + fz * 0.1, rot + Math.PI + r.range(-0.15, 0.15), { screen: r.chance(abandoned ? 0.06 : 0.18) ? r.pick(['crt_blue', 'crt_green']) : 'crt_off' });
  if (r.chance(0.8)) zb.prop('keyboard', x + fx * 0.22, 0.75, z + fz * 0.22, rot + Math.PI + r.range(-0.2, 0.2));
  if (r.chance(0.14)) zb.prop('phone', x + Math.cos(rot) * 0.5 + fx * 0.15, 0.75, z + Math.sin(rot) * 0.5 + fz * 0.15, rot + Math.PI + r.range(-0.4, 0.4), { useY: 0.1 });
  if (r.chance(0.3)) zb.prop('papers', x - Math.cos(rot) * 0.4, 0.75, z - Math.sin(rot) * 0.4, 0, { n: r.int(1, 3) });
  if (r.chance(0.05)) zb.prop('note', x + Math.cos(rot) * 0.3 + fx * 0.25, 0.755, z + Math.sin(rot) * 0.3 + fz * 0.25, r.range(0, 6), { text: r.int(0, 999) });
  if (r.chance(0.12)) zb.prop('lamp_desk', x - Math.cos(rot) * 0.55 - fx * 0.1, 0.75, z - Math.sin(rot) * 0.55 - fz * 0.1, rot, { on: r.chance(0.5) });
  if (r.chance(abandoned ? 0.6 : 0.85)) {
    const cd = 0.75 + r.range(-0.1, 0.3);
    const tilt = abandoned && r.chance(0.12);
    zb.prop(r.chance(0.85) ? 'chair_office' : 'chair_folding', x + fx * cd + r.range(-0.2, 0.2), 0, z + fz * cd + r.range(-0.2, 0.2), rot + Math.PI + r.range(-0.7, 0.7), tilt ? { roll: Math.PI / 2, collide: true } : {});
  }
}

function furnish(zb, rm, r) {
  const { x0, z0, x1, z1 } = rm;
  const w = x1 - x0, d = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const p = zb.params;
  switch (rm.type) {
    case 'cubicles': {
      // grid of cubicles 3x3 with partitions, aisles every second row
      const cw = 3, cd = 3;
      for (let zz = z0 + 1; zz + cd <= z1 - 1; zz += cd * 2 + 1) {
        for (let xx = x0 + 1; xx + cw <= x1 - 1; xx += cw) {
          for (const row of [0, 1]) {
            const rz = zz + row * cd;
            if (rz + cd > z1 - 1) continue;
            // partitions: back wall (shared between the two rows) and sides
            if (row === 0) zb.hLine(rz + cd, xx, xx + cw, W.PART, M.fabric_partition, M.fabric_partition);
            zb.vLine(xx, rz, rz + cd, W.PART, M.fabric_partition, M.fabric_partition);
            if (xx + cw * 2 > x1 - 1) zb.vLine(xx + cw, rz, rz + cd, W.PART, M.fabric_partition, M.fabric_partition);
            // desk against the back partition, user faces it
            const dz = row === 0 ? rz + cd - 0.45 : rz + 0.45;
            const rot = row === 0 ? Math.PI : 0;
            if (r.chance(0.92)) workstation(zb, xx + cw / 2, dz, rot, r, { side: 'plastic_gray' });
          }
        }
      }
      break;
    }
    case 'openoffice': {
      for (let zz = z0 + 2; zz < z1 - 1; zz += 3) for (let xx = x0 + 2; xx < x1 - 1; xx += 3) {
        if (r.chance(0.75)) workstation(zb, xx, zz, r.pick([0, Math.PI]), r);
      }
      break;
    }
    case 'bullpen': {
      // desks gone, only chairs remain, pointing every which way
      for (let zz = z0 + 1; zz < z1 - 1; zz++) for (let xx = x0 + 1; xx < x1 - 1; xx++) {
        if (r.chance(0.35)) zb.prop('chair_office', xx + 0.5 + r.range(-0.2, 0.2), 0, zz + 0.5 + r.range(-0.2, 0.2), r.range(0, 6.28));
      }
      break;
    }
    case 'meeting': {
      const len = Math.max(1.6, Math.min(w, d) > 4 ? Math.max(w, d) - 3 : 2);
      const alongX = w >= d;
      zb.prop('table', cx, 0, cz, alongX ? 0 : Math.PI / 2, { len, depth: 1.1 });
      const n = Math.floor(len / 0.8);
      for (let k = 0; k < n; k++) {
        const t = -len / 2 + 0.4 + k * 0.8;
        for (const s of [-1, 1]) {
          if (r.chance(0.12)) continue;
          const px = alongX ? cx + t : cx + s * 0.85, pz = alongX ? cz + s * 0.85 : cz + t;
          zb.prop(r.chance(0.7) ? 'chair_office' : 'chair_plastic', px + r.range(-0.08, 0.08), 0, pz + r.range(-0.08, 0.08), facing(alongX ? 0 : -s, alongX ? -s : 0) + r.range(-0.3, 0.3));
        }
      }
      const f = findWallSpots(zb, x0, z0, x1, z1, 2, r);
      if (f[0]) zb.decal(f[0].x, 1.5, f[0].z, f[0].face, 1.6, 1.0, 'whiteboard');
      if (f[1]) propOnWall(zb, f[1], 'clock', 2.1, { face: r.pick(['clock_a', 'clock_b', 'clock_c']) });
      break;
    }
    case 'office': {
      // desk facing the door side, chair behind it, cabinet & shelf on walls
      const rot = r.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      workstation(zb, cx, cz, rot, r);
      const spots = findWallSpots(zb, x0, z0, x1, z1, 4, r);
      spots.forEach((f, k) => {
        if (nearDoor(rm, Math.floor(f.x - f.dx * 0.5), Math.floor(f.z - f.dz * 0.5))) return;
        if (k === 0) propOnWall(zb, f, 'filing_cabinet', 0, {}, 0.36);
        else if (k === 1) propOnWall(zb, f, r.chance(0.6) ? 'bookshelf' : 'filing_cabinet', 0, { w: 0.9 }, 0.17);
        else if (k === 2 && r.chance(0.6)) propOnWall(zb, f, 'plant', 0, {}, 0.3);
        else if (k === 3) zb.decal(f.x, 1.5, f.z, f.face, 0.55, 0.55, r.pick(['calendar', 'poster_motiv', 'frame_empty', 'painting_land', 'cork']));
      });
      if (r.chance(0.5)) zb.prop('trash_can', x0 + 0.4, 0, z0 + 0.4, 0);
      break;
    }
    case 'kitchen': {
      const spots = findWallSpots(zb, x0, z0, x1, z1, 6, r);
      if (spots[0]) {
        const f = spots[0];
        propOnWall(zb, f, 'counter', 0, { len: 1.0 }, 0.31);
        const along = [f.dz !== 0 ? 1 : 0, f.dx !== 0 ? 1 : 0];
        propOnWall(zb, { ...f, x: f.x + along[0], z: f.z + along[1] }, 'counter', 0, { len: 1.0 }, 0.31);
        zb.prop('microwave', f.x - f.dx * 0.3, 0.92, f.z - f.dz * 0.3, facing(-f.dx, -f.dz));
        zb.prop('coffee_maker', f.x + along[0] - f.dx * 0.3, 0.92, f.z + along[1] - f.dz * 0.3, facing(-f.dx, -f.dz));
      }
      if (spots[1]) propOnWall(zb, spots[1], 'fridge', 0, {}, 0.36);
      if (spots[2]) propOnWall(zb, spots[2], r.chance(0.6) ? 'vending' : 'water_cooler', 0, {}, 0.45);
      if (spots[3]) zb.decal(spots[3].x, 1.5, spots[3].z, spots[3].face, 0.6, 0.6, r.pick(['poster_notice', 'cork', 'poster_wash']));
      if (w >= 4 && d >= 4) {
        zb.prop('table_round', cx, 0, cz, 0);
        for (let k = 0; k < 3; k++) {
          const a = k * 2.1 + r.range(-0.3, 0.3);
          zb.prop('chair_plastic', cx + Math.sin(a) * 0.85, 0, cz - Math.cos(a) * 0.85, a + Math.PI + r.range(-0.4, 0.4));
        }
      }
      zb.prop('trash_can', x1 - 0.4, 0, z1 - 0.4, 0);
      break;
    }
    case 'copy': {
      const spots = findWallSpots(zb, x0, z0, x1, z1, 4, r);
      if (spots[0]) propOnWall(zb, spots[0], 'copier', 0, {}, 0.36);
      if (spots[1]) propOnWall(zb, spots[1], 'shelf_metal', 0, { w: 1.0 }, 0.26);
      if (spots[2]) propOnWall(zb, spots[2], 'table', 0, { len: 1.2, depth: 0.6 }, 0.32);
      if (spots[2]) zb.prop('printer', spots[2].x - spots[2].dx * 0.32, 0.75, spots[2].z - spots[2].dz * 0.32, facing(-spots[2].dx, -spots[2].dz));
      if (r.chance(0.6)) zb.prop('papers', cx, 0, cz, 0, { n: r.int(3, 8) });
      break;
    }
    case 'storage': case 'closet': {
      const spots = findWallSpots(zb, x0, z0, x1, z1, rm.type === 'closet' ? 3 : 6, r);
      for (const f of spots) {
        const u = r.next();
        if (u < 0.45) propOnWall(zb, f, 'shelf_metal', 0, { w: 1.0, h: 2.0 }, 0.26);
        else if (u < 0.7) propOnWall(zb, f, 'box_stack', 0, {}, 0.35);
        else if (u < 0.85) propOnWall(zb, f, 'filing_cabinet', 0, {}, 0.36);
        else propOnWall(zb, f, 'bucket', 0, {}, 0.3);
      }
      if (rm.type === 'closet' && r.chance(0.5)) zb.prop('cart_cleaning', cx, 0, cz, r.range(0, 6));
      break;
    }
    case 'server': {
      const alongX = w >= d;
      for (let k = (alongX ? x0 : z0) + 1; k < (alongX ? x1 : z1) - 1; k += 2) {
        for (let j = (alongX ? z0 : x0) + 1; j < (alongX ? z1 : x1) - 1; j++) {
          if (r.chance(0.1)) continue;
          const px = alongX ? k + 0.5 : j + 0.5, pz = alongX ? j + 0.5 : k + 0.5;
          zb.prop('server_rack', px, 0, pz, alongX ? Math.PI / 2 : 0, { alt: r.chance(0.5) });
        }
      }
      zb.rectCeil(x0, z0, x1, z1, p.ceilH, M.ceil_tile_white);
      rm.cold = true;
      break;
    }
    case 'restroom': {
      zb.rectFloor(x0, z0, x1, z1, 0, M.tile_white);
      zb.rectWallMat(x0, z0, x1, z1, M.tile_white);
      const alongX = w >= d;
      const n = Math.floor(((alongX ? w : d) - 1) / 1.2);
      for (let k = 0; k < n; k++) {
        const t = (alongX ? x0 : z0) + 0.6 + k * 1.2 + 0.6;
        if (alongX) {
          zb.box(t - 0.6, 0.1, z0, t - 0.57, 1.9, z0 + 1.4, M.stall);
          zb.prop('toilet', t, 0, z0 + 0.35, Math.PI);
        } else {
          zb.box(x0, 0.1, t - 0.6, x0 + 1.4, 1.9, t - 0.57, M.stall);
          zb.prop('toilet', x0 + 0.35, 0, t, Math.PI / 2);
        }
      }
      const f = findWallSpots(zb, x0, z0, x1, z1, 2, r);
      for (const s of f) { propOnWall(zb, s, 'sink', 0, { drip: r.chance(0.3) }, 0.24); zb.decal(s.x, 1.55, s.z, s.face, 0.6, 0.7, 'mirror'); }
      break;
    }
    case 'empty': default: {
      if (r.chance(0.4)) zb.prop(r.pick(['chair_office', 'chair_folding', 'box', 'trash_can']), cx + r.range(-1, 1), 0, cz + r.range(-1, 1), r.range(0, 6.28));
      if (r.chance(0.3)) zb.prop('papers', cx + r.range(-1, 1), 0, cz + r.range(-1, 1), 0, { n: r.int(3, 9) });
      break;
    }
  }
  // generic dressing
  if (rm.type !== 'restroom') {
    for (const f of findWallSpots(zb, x0, z0, x1, z1, Math.max(1, Math.floor((w * d) / 25)), r)) {
      const u = r.next();
      if (u < 0.4) zb.decal(f.x, 0.3, f.z, f.face, 0.14, 0.2, 'dec_outlet');
      else if (u < 0.55) zb.decal(f.x, 1.3, f.z, f.face, 0.14, 0.22, 'dec_switch');
      else if (u < 0.7 && p.abandoned) zb.decal(f.x, r.range(0.8, 2), f.z, f.face, 1.2, 1.2, r.pick(['dec_stain', 'dec_mold', 'dec_scuff']));
      else if (u < 0.78) zb.decal(f.x, 1.55, f.z, f.face, 0.5, 0.65, r.pick(['poster_safety', 'poster_employee', 'poster_notice', 'calendar', 'poster_map']));
    }
  }
  if (p.abandoned) {
    for (let k = 0; k < (w * d) / 30; k++) {
      const x = r.int(x0, x1 - 1), z = r.int(z0, z1 - 1);
      if (!freeCell(zb, x, z)) continue;
      const u = r.next();
      if (u < 0.3) zb.setFlag(x, z, CF.HOLE_CEIL);
      else if (u < 0.6) floorDecal(zb, x + 0.5, z + 0.5, r.pick(['dec_stain', 'dec_puddle', 'dec_paper']), r.range(0.6, 1.6), r);
      else if (u < 0.7) zb.prop('tile_fallen', x + 0.5, 0, z + 0.5, r.range(0, 3));
    }
  }
}

function roomLights(zb, rm, r) {
  const p = zb.params;
  const { x0, z0, x1, z1 } = rm;
  const w = x1 - x0, d = z1 - z0;
  const sx = w >= 8 ? 3 : 2, sz = d >= 8 ? 3 : 2;
  const off = rm.type === 'empty' && r.chance(0.5);
  for (let z = z0 + 1; z < z1 - 0.5; z += sz) for (let x = x0 + 1; x < x1 - 0.5; x += sx) {
    if (!freeCell(zb, x, z) && zb.isSolid(x, z)) continue;
    const st = off ? (r.chance(0.2) ? 'flicker' : 'off') : lightState(r, p);
    ceilingLight(zb, x + 0.5, z + 0.5, 'troffer', st, { rot: w >= d ? 1 : 0, color: rm.cold ? [0.8, 0.9, 1.0] : undefined });
  }
  if (rm.type === 'server') zb.emitter((x0 + x1) / 2, 1.2, (z0 + z1) / 2, 'server', { vol: 0.8, rad: 10 });
}

function corridorDressing(zb, isCorr, r) {
  const { x0, z0, x1, z1 } = zb;
  for (let k = 0; k < (zb.w * zb.d) / 120; k++) {
    const x = r.int(x0, x1 - 1), z = r.int(z0, z1 - 1);
    if (!isCorr(x, z)) continue;
    const [dx, dz] = r.pick(DIRS4);
    const f = wallFace(zb, x, z, dx, dz);
    if (!f) continue;
    const u = r.next();
    if (u < 0.2) propOnWall(zb, f, 'water_cooler', 0, {}, 0.2);
    else if (u < 0.35) propOnWall(zb, f, 'plant', 0, {}, 0.22);
    else if (u < 0.45) propOnWall(zb, f, 'extinguisher', 0, {}, 0);
    else if (u < 0.55) propOnWall(zb, f, 'trash_can', 0, {}, 0.2);
    else if (u < 0.7) zb.decal(f.x, 1.55, f.z, f.face, 0.55, 0.7, r.pick(['poster_safety', 'poster_map', 'poster_notice', 'poster_employee', 'cork', 'sign_thisway']));
    else if (u < 0.78) propOnWall(zb, f, 'payphone', 0, {}, 0);
    else if (u < 0.86) propOnWall(zb, f, 'bench', 0, { len: 1.4 }, 0.22);
    else if (u < 0.92) zb.decal(f.x, 2.0, f.z, f.face, 0.3, 0.3, r.pick(['sign_restroom', 'sign_staff', 'sign_noexit']));
  }
  // exit signs hanging at some corridor cells
  for (let k = 0; k < (zb.w * zb.d) / 300; k++) {
    const x = r.int(x0, x1 - 1), z = r.int(z0, z1 - 1);
    if (!isCorr(x, z)) continue;
    const c = zb.getCeil(x, z);
    if (Number.isNaN(c)) continue;
    zb.prop('exit_sign', x + 0.5, c, z + 0.5, r.pick([0, Math.PI / 2]), { green: r.chance(0.3) });
  }
}

defineZone('office', {
  border: 'wall',
  gate: 'door',
  minW: 16, minD: 16,
  weight: (c) => {
    if (c.dim !== 0) return 0;
    if (c.level === 0 && c.flatDist < 70) return 0;
    let w = 2.4 * (0.4 + c.office * 1.4);
    if (c.level > 0) w *= 1.5;
    if (c.level < -1) w *= 0.6;
    return w;
  },
  params: officeParams,
  gen: genOffice,
});
