// Millbrook High School (classrooms, lockers, cafeteria, gym shelter, offices, sports field) and
// St. Mark's Church with its cemetery.
import { B } from '../blocks.js';
import { SURFACE, ZONES } from '../World.js';
import { Frame } from './frame.js';
import { shell, connect, exteriorDoor, roomWindows, paintRoomWalls, flatRoof, gableRoof, carvePlan } from './building.js';
import { Room, furnish } from './furnish.js';
import { tree } from './vegetation.js';
import { CAR_COLORS } from './util.js';

const Y0 = SURFACE;

export function buildSchool(ctx, site) {
  const rng = ctx.rng.fork(0x5c01);
  const W = 70, D = 36, H = 5;
  const bx0 = site.x0 + 2, bz0 = site.z1 - 12 - D + 1;
  const fr = Frame.fromRect(ctx, bx0, bz0, bx0 + W - 1, bz0 + D - 1, 0);
  shell(fr, { W, D, floors: 1, storeyH: H, outer: 'brick_red', inner: 'wall_white', ceiling: 'concrete' });
  flatRoof(fr, W, D, Y0 + H, 'brick_red');
  const y = Y0, Y = y + 1;
  const corr = { id: 'corr', x0: 2, z0: 16, x1: W - 3, z1: 19, floor: 'floor_linoleum', wall: 'wall_beige', t: 'corr' };
  const rooms = [corr];
  // north row: cafeteria (west), kitchen, classrooms
  rooms.push({ id: 'cafe', x0: 2, z0: 2, x1: 17, z1: 14, floor: 'floor_checker', wall: 'wall_white', t: 'cafeteria' });
  rooms.push({ id: 'kitchen', x0: 19, z0: 2, x1: 25, z1: 14, floor: 'floor_tile', wall: 'wall_tile', t: 'kitchen' });
  let x = 27;
  let ci = 0;
  while (x + 7 <= W - 3) { rooms.push({ id: 'cn' + ci, x0: x, z0: 2, x1: x + 7, z1: 14, floor: 'floor_linoleum', wall: rng.pick(['wall_green', 'wall_beige', 'wall_blue']), t: 'class' }); x += 9; ci++; }
  // south row: classrooms, office suite, restrooms
  const southSpecs = [['cs0', 8, 'class'], ['cs1', 8, 'class'], ['wc_b', 4, 'wc'], ['wc_g', 4, 'wc'], ['lobby', 6, 'lobby'], ['office', 7, 'office'], ['principal', 5, 'principal'], ['cs2', 8, 'class'], ['cs3', 8, 'class']];
  x = 2;
  for (const [id, w, t] of southSpecs) {
    if (x + w - 1 > W - 3) break;
    rooms.push({ id, x0: x, z0: 21, x1: Math.min(W - 3, x + w - 1), z1: D - 3, floor: t === 'wc' ? 'floor_tile' : t === 'principal' ? 'carpet_red' : 'floor_linoleum', wall: t === 'wc' ? 'wall_tile' : rng.pick(['wall_green', 'wall_beige', 'wall_blue']), t });
    x += w + 1;
  }
  if (x <= W - 6) rooms.push({ id: 'cs4', x0: x, z0: 21, x1: W - 3, z1: D - 3, floor: 'floor_linoleum', wall: 'wall_beige', t: 'class' });
  const ib = { x0: 2, z0: 2, x1: W - 3, z1: D - 3 };
  carvePlan(fr, y, rooms, 'wall_white', H - 1, ib);
  const byId = Object.fromEntries(rooms.map((r) => [r.id, r]));
  for (const r of rooms) {
    if (r === corr) continue;
    r.y = y;
    if (r.t === 'principal') connect(fr, y, r, byId.office, 'door', rng, { door: 'door_wood' });
    else connect(fr, y, r, corr, r.t === 'cafeteria' || r.t === 'lobby' ? 'wide' : 'door', rng, { door: r.t === 'class' ? 'door_wood' : 'door_white', open: rng.chance(0.5) });
    if (r.t === 'kitchen') connect(fr, y, r, byId.cafe, 'open', rng);
    roomWindows(fr, y, r, ib, W, D, 'glass', rng, null, { spacing: 3 });
    paintRoomWalls(fr, y, r, r.wall, H - 1, new Set([B.wall_white]));
  }
  corr.y = y;
  paintRoomWalls(fr, y, corr, 'wall_beige', H - 1, new Set([B.wall_white]));
  const lobby = byId.lobby;
  exteriorDoor(fr, y, lobby, 'front', W, D, 'door_glass', rng, { open: true }, lobby.x0 + 2);
  fr.opening(lobby.x0 + 3, Y, D - 2, 2); fr.door(lobby.x0 + 3, Y, D - 1, 0, 'door_glass', {});
  exteriorDoor(fr, y, corr, 'left', W, D, 'door_metal', rng, { locked: true }, 17);
  for (const z of [17, 18]) fr.opening(W - 2, Y, z, 2);
  exteriorDoor(fr, y, byId.kitchen, 'back', W, D, 'door_metal', rng, { locked: false });
  // lockers along the corridor walls
  for (let xx = corr.x0; xx <= corr.x1; xx++) for (const [z, f] of [[corr.z0, 0], [corr.z1, 2]]) {
    if (xx < 4 || xx > W - 5) continue;
    if (fr.canPlace(xx, Y, z) && fr.get(xx, Y, z + (f === 0 ? -1 : 1)) !== 0) fr.container(xx, Y, z, 'locker', f, 'school_locker');
  }
  // rooms
  for (const r of rooms) {
    const o = { height: H - 1 };
    if (r.t === 'class') classroom(ctx, fr, r, rng);
    else if (r.t === 'cafeteria') {
      for (let z = r.z0 + 2; z <= r.z1 - 2; z += 3) for (let xx = r.x0 + 2; xx <= r.x1 - 3; xx += 5) {
        for (let k = 0; k < 3; k++) { if (fr.canPlace(xx + k, Y, z)) fr.place(xx + k, Y, z, 'table'); }
        for (let k = 0; k < 3; k++) { if (fr.canPlace(xx + k, Y, z - 1)) fr.place(xx + k, Y, z - 1, 'chair', 0); if (fr.canPlace(xx + k, Y, z + 1)) fr.place(xx + k, Y, z + 1, 'chair', 2); }
      }
      for (let k = 0; k < 4; k++) fr.loot(rng.int(r.x0, r.x1), Y, rng.int(r.z0, r.z1), 'floor_store', 0.4);
      fr.zombies(10, Y, 8, rng.int(3, 5), 4, { indoor: true, outfit: rng.pick(['civilian', 'civilian_f']) });
    } else if (r.t === 'kitchen') {
      const k = new Room(fr, r, rng, { ...o, loot: { kitchen_cabinet: 'diner_kitchen', stove: 'diner_kitchen', fridge: 'diner_kitchen', freezer: 'diner_kitchen' } });
      k.run(['stove', 'stove', 'kitchen_cabinet', 'kitchen_sink', 'kitchen_cabinet']); k.run(['fridge', 'freezer', 'fridge']);
      k.wall('metal_shelf', { loot: 'diner_kitchen' }); k.wall('metal_shelf', { loot: 'store_food' }); k.center('table');
    } else if (r.t === 'wc') furnish(fr, r, 'halfbath', rng, o);
    else if (r.t === 'office') {
      const k = new Room(fr, r, rng, o);
      for (let xx = r.x0; xx <= r.x1 - 1; xx++) if (fr.canPlace(xx, Y, r.z0 + 4)) fr.place(xx, Y, r.z0 + 4, 'bar_counter', 2);
      k.deskSet('desk', { loot: 'school_office' }); k.wall('filing_cabinet', { loot: 'school_office' }); k.wall('filing_cabinet', { loot: 'school_office' });
    } else if (r.t === 'principal') {
      const k = furnish(fr, r, 'office', rng, { ...o, deskLoot: 'school_office' });
      void k;
      fr.note(r.x0 + 1, Y, r.z0 + 1, 'school_principal');
      ctx.usedNotes.add('school_principal');
    } else if (r.t === 'lobby') {
      const k = new Room(fr, r, rng, o);
      k.wall('bench'); k.wall('trash_can', { access: false }); k.wall('vending_machine');
    }
  }
  fr.zombies(30, Y, 17, rng.int(3, 4), 6, { indoor: true, outfit: 'civilian' });
  fr.zombies(55, Y, 18, rng.int(2, 3), 5, { indoor: true, outfit: 'civilian_f' });
  fr.signCentered(lobby.x0 - 8, lobby.x1 + 8, Y + 3, D, 'MILLBROOK HIGH', 0);
  // ---------------- gym wing (east, tall) used as a Red Cross shelter
  const GW = site.x1 - (bx0 + W) - 1, GD = 34;
  const gf = Frame.fromRect(ctx, bx0 + W + 1, bz0, bx0 + W + GW, bz0 + GD - 1, 0);
  const GH = 8;
  shell(gf, { W: GW, D: GD, floors: 1, storeyH: GH, outer: 'brick_red', inner: 'concrete', ceiling: 'concrete' });
  flatRoof(gf, GW, GD, Y0 + GH, 'brick_red');
  const court = { x0: 2, z0: 2, x1: GW - 3, z1: GD - 3, y, floor: 'floor_wood' };
  carvePlan(gf, y, [court], 'concrete', GH - 1, { x0: 2, z0: 2, x1: GW - 3, z1: GD - 3 });
  // connect gym to the school corridor (through the shared walls: school right wall at x=W-1 and gym left wall)
  for (const z of [17, 18]) { fr.clear(W - 1, Y, z, 0); fr.clear(W - 1, Y + 1, z, 0); }
  for (let gx = 0; gx <= 1; gx++) for (const z of [17, 18]) { gf.clear(gx, Y, z, 0); gf.clear(gx, Y + 1, z, 0); }
  ctx.world.set(bx0 + W, Y0, bz0 + 17, B.concrete); ctx.world.set(bx0 + W, Y0, bz0 + 18, B.concrete);
  for (const z of [17, 18]) { ctx.world.set(bx0 + W, Y, bz0 + z, 0); ctx.world.set(bx0 + W, Y + 1, bz0 + z, 0); ctx.world.set(bx0 + W, Y + 2, bz0 + z, B.brick_red); }
  gf.door(0, Y, 17, 1, 'door_white', { open: true });
  gf.markOpening(1, Y, 17); gf.markOpening(1, Y, 18);
  roomWindows(gf, y, court, { x0: 2, z0: 2, x1: GW - 3, z1: GD - 3 }, GW, GD, 'glass', rng, null, { spacing: 4, pairs: false, tall: 2 });
  // bleachers along the north wall
  for (let xx = 3; xx <= GW - 4; xx++) for (let s = 0; s < 3; s++) {
    gf.place(xx, Y + s, 2 + s, 'stairs_wood', 0);
    for (let yy = Y; yy < Y + s; yy++) gf.set(xx, yy, 2 + s, B.planks_oak);
  }
  // shelter cots + supplies
  for (let xx = 3; xx <= GW - 4; xx += 2) for (let z = 8; z <= GD - 5; z += 3) {
    if (rng.chance(0.15)) continue;
    gf.place(xx, Y, z, 'bed_head', 0); gf.place(xx, Y, z + 1, 'bed_foot', 0);
  }
  for (let k = 0; k < 6; k++) gf.container(GW - 4 - (k % 2), Y, GD - 4 - Math.floor(k / 2), rng.chance(0.5) ? 'crate_military' : 'cardboard_box', 0, 'fema_supply');
  for (let k = 0; k < 7; k++) gf.corpse(rng.int(3, GW - 4), Y, rng.int(7, GD - 4), rng.range(0, 6.28), rng.pick(['civilian', 'civilian_f']), 'corpse_civilian');
  gf.zombies(Math.floor(GW / 2), Y, Math.floor(GD / 2), 6, 7, { indoor: true, types: ['walker', 'walker', 'walker', 'runner', 'crawler', 'bloater'] });
  gf.zombies(Math.floor(GW / 2) + 4, Y, GD - 6, 4, 5, { indoor: true, outfit: 'civilian_f' });
  gf.note(5, Y, GD - 4, 'shelter_log');
  ctx.usedNotes.add('shelter_log');
  gf.signCentered(1, GW - 2, Y + 4, GD, 'SHELTER', 0);
  exteriorDoor(gf, y, court, 'front', GW, GD, 'door_metal', rng, { locked: false, barricade: 2 }, Math.floor(GW / 2));
  // ---------------- front: bus loop + parking
  for (let xx = 0; xx < W; xx++) for (let z = D + 1; z <= D + 9; z++) fr.set(xx, Y0, z, B.asphalt);
  for (let xx = 4; xx < W - 4; xx += 3) fr.set(xx, Y0, D + 9, B.parking_line_z);
  fr.vehicle(16, D + 4, Math.PI / 2, 'bus', { color: 0xe8b020, loot: 'car_trunk' });
  fr.vehicle(36, D + 4.5, Math.PI / 2 + 0.05, 'bus', { color: 0xe8b020, loot: 'car_trunk', wrecked: rng.chance(0.5) });
  for (let k = 0; k < 4; k++) fr.vehicle(48 + k * 4.5, D + 7.5, 0, rng.pick(['sedan', 'suv', 'hatchback', 'pickup']), { color: rng.pick(CAR_COLORS), loot: 'car_trunk', gloveLoot: 'car_glovebox' });
  // ---------------- sports field north
  const ff = Frame.fromRect(ctx, site.x0 + 4, site.z0 + 2, site.x0 + 66, bz0 - 3, 0);
  const FW = ff.w, FD = ff.d;
  for (let xx = 0; xx < FW; xx++) for (let z = 0; z < FD; z++) {
    const edge = xx === 0 || z === 0 || xx === FW - 1 || z === FD - 1;
    const track = xx <= 2 || z <= 2 || xx >= FW - 3 || z >= FD - 3;
    let id0 = track ? B.dirt_path : B.grass;
    if (!track && (xx === Math.floor(FW / 2) || xx === 3 || xx === FW - 4 || z === 3 || z === FD - 4)) id0 = B.concrete_white;
    ff.set(xx, Y0, z, id0);
    void edge;
  }
  for (const gx of [4, FW - 5]) { const cz = Math.floor(FD / 2); for (const dz of [-2, 2]) for (let yy = Y; yy <= Y + 3; yy++) ff.set(gx, yy, cz + dz, B.street_pole); for (let dz = -2; dz <= 2; dz++) ff.set(gx, Y + 3, cz + dz, B.street_pole); }
  for (let xx = 6; xx < FW - 6; xx++) for (let s = 0; s < 2; s++) {
    const z = -1 - s; // bleachers north of the field, rising north
    ff.place(xx, Y + s, z, 'stairs_concrete', 0);
    if (s === 1) ff.set(xx, Y, z, B.concrete);
  }
  ff.zombies(Math.floor(FW / 2), Y, Math.floor(FD / 2), 3, 8, { outfit: 'civilian' });
  fr.zone(-2, -2, W + GW + 2, D + 10, ZONES.SCHOOL);
  ctx.world.setZone(site.x0, site.z0, site.x1, site.z1, ZONES.SCHOOL);
  ctx.addPOI({ name: 'Millbrook High School', type: 'school', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.building('school');
  ctx.planViews.push({ name: 'school', x0: site.x0 - 2, z0: bz0 - 4, x1: site.x1 + 2, z1: site.z1 + 2, y: Y, s: 7 });
  void tree;
}

function classroom(ctx, fr, r, rng) {
  const Y = r.y + 1;
  const kind = rng.weighted([['normal', 6], ['science', 1], ['computer', 1]]);
  // chalkboard on the x0 wall (if solid behind)
  const cz = Math.floor((r.z0 + r.z1) / 2);
  for (let z = cz - 2; z <= cz + 2; z++) for (const yy of [Y + 1, Y + 2]) if (fr.get(r.x0 - 1, yy, z) !== 0 && fr.get(r.x0, yy, z) === 0) fr.place(r.x0, yy, z, 'chalkboard', 3);
  fr.container(r.x0 + 1, Y, r.z0 + 1, 'desk', 3, 'school_office');
  fr.place(r.x0 + 1, Y, r.z0 + 2, 'chair', 1);
  for (let x = r.x0 + 3; x <= r.x1 - 2; x += 2) {
    for (let z = r.z0 + 2; z <= r.z1 - 1; z += 2) {
      if (!fr.canPlace(x, Y, z) || !fr.canPlace(x + 1, Y, z)) continue;
      if (kind === 'science' && (x - r.x0) % 4 === 1) { fr.place(x, Y, z, 'table'); fr.place(x + 1, Y, z, 'chair', 1); continue; }
      fr.place(x, Y, z, 'desk', 3);
      fr.place(x + 1, Y, z, 'chair', 1);
      if (kind === 'computer') fr.place(x, Y + 1, z, 'tv', 3);
    }
  }
  const rm = new Room(fr, r, rng, { height: 4 });
  rm.wall('bookshelf', { loot: 'library' });
  if (kind === 'science') { rm.wall('medical_cabinet', { loot: 'hospital_storage' }); rm.wall('kitchen_sink'); }
  rm.wall('locker', { loot: 'school_locker' });
  rm.floorLoot('floor_office', 1, 0.4);
  if (rng.chance(0.35)) fr.zombies(Math.floor((r.x0 + r.x1) / 2), Y, cz, rng.int(1, 3), 2, { indoor: true, outfit: rng.pick(['civilian', 'civilian_f', 'office']) });
  if (rng.chance(0.15)) fr.note(r.x1 - 1, Y, r.z1 - 1, 'student_diary');
  ctx.usedNotes.add('student_diary');
}

// ============================================================================ CHURCH + CEMETERY
export function buildChurch(ctx, site) {
  const rng = ctx.rng.fork(0xc4c4);
  const W = 17, D = 32, H = 8;
  const bx0 = site.x1 - 4 - W + 1, bz0 = site.z1 - 4 - D + 1;
  const fr = Frame.fromRect(ctx, bx0, bz0, bx0 + W - 1, bz0 + D - 1, 0);
  shell(fr, { W, D, floors: 1, storeyH: H, outer: 'stone_brick', inner: 'wall_beige', ceiling: 'wall_wood_panel' });
  gableRoof(fr, W, D, Y0 + H, 'dark', 'stone_brick', false);
  const y = Y0, Y = y + 1;
  const nave = { x0: 2, z0: 6, x1: W - 3, z1: D - 3, floor: 'floor_wood' };
  const vestry = { x0: 2, z0: 2, x1: W - 3, z1: 4, floor: 'carpet_red' };
  carvePlan(fr, y, [nave, vestry], 'wall_beige', H - 1, { x0: 2, z0: 2, x1: W - 3, z1: D - 3 });
  connect(fr, y, nave, vestry, 'door', rng, { door: 'door_wood' });
  // tall windows
  for (let z = 8; z <= D - 5; z += 4) for (const [ix, ox] of [[1, 0], [W - 2, W - 1]]) for (let yy = Y + 1; yy <= Y + 4; yy++) { fr.clear(ix, yy, z, B.glass); fr.clear(ox, yy, z, 0); }
  // pews facing the altar (north = -z), centre aisle
  const cx = Math.floor(W / 2);
  for (let z = 10; z <= D - 6; z += 2) for (let x = nave.x0 + 1; x <= nave.x1 - 1; x++) if (Math.abs(x - cx) > 1) fr.place(x, Y, z, 'pew', 2);
  // altar
  for (let x = cx - 2; x <= cx + 2; x++) fr.set(x, Y, 7, B.planks_dark);
  fr.place(cx - 1, Y + 1, 7, 'lantern'); fr.place(cx + 1, Y + 1, 7, 'lantern');
  fr.container(cx, Y, 8, 'desk', 0, 'church');
  fr.note(cx, Y, 9, 'church_pastor');
  ctx.usedNotes.add('church_pastor');
  const v = new Room(fr, { ...vestry, y }, rng, { height: H - 1 });
  v.wall('bookshelf', { loot: 'church' }); v.wall('wardrobe', { loot: 'church' }); v.deskSet('desk', { loot: 'church' }); v.wall('crate_wood', { loot: 'church' });
  // the congregation's last stand: barricaded front door, pews against it, the dead
  exteriorDoor(fr, y, nave, 'front', W, D, 'door_wood', rng, { locked: true, barricade: 3 }, cx);
  fr.opening(cx + 1, Y, D - 2, 2); fr.door(cx + 1, Y, D - 1, 0, 'door_wood', { locked: true, barricade: 3 });
  exteriorDoor(fr, y, vestry, 'right', W, D, 'door_wood', rng, { locked: false }, 3);
  for (let k = 0; k < 9; k++) fr.corpse(rng.int(3, W - 4), Y, rng.int(9, D - 5), rng.range(0, 6.28), rng.pick(['civilian', 'civilian_f', 'survivor']), rng.chance(0.3) ? 'corpse_survivor' : 'corpse_civilian');
  fr.zombies(cx, Y, 16, rng.int(5, 7), 5, { indoor: true, outfit: rng.pick(['civilian', 'civilian_f']) });
  for (let k = 0; k < 4; k++) fr.loot(rng.int(3, W - 4), Y, rng.int(10, D - 5), 'floor_camp', 0.5);
  // steeple over the front entrance
  const sx0 = cx - 2, sz0 = D - 5;
  fr.walls(sx0, Y0 + H, sz0, sx0 + 4, Y0 + H + 10, sz0 + 4, B.stone_brick);
  for (let k = 0; k < 4; k++) fr.set(sx0 + 2, Y0 + H + 11 + k, sz0 + 2, k < 3 ? B.stone_brick : B.fence_post);
  fr.set(sx0 + 1, Y0 + H + 14, sz0 + 2, B.fence_post); fr.set(sx0 + 3, Y0 + H + 14, sz0 + 2, B.fence_post);
  for (const [dx, dz] of [[2, 0], [2, 4], [0, 2], [4, 2]]) for (let yy = Y0 + H + 7; yy <= Y0 + H + 8; yy++) fr.set(sx0 + dx, yy, sz0 + dz, 0);
  fr.sign(cx - 4, Y0 + 5, D, "ST MARK'S", 0);
  // ------------- cemetery (west part of the site)
  const cw = bx0 - site.x0 - 6;
  const cf = Frame.fromRect(ctx, site.x0 + 2, site.z0 + 2, site.x0 + 2 + cw, site.z1 - 2, 0);
  const CW = cf.w, CD = cf.d;
  for (let x = 0; x < CW; x++) for (let z = 0; z < CD; z++) {
    const edge = x === 0 || z === 0 || x === CW - 1 || z === CD - 1;
    if (edge && !(z === CD - 1 && Math.abs(x - Math.floor(CW / 2)) <= 1)) cf.set(x, Y, z, B.iron_bars);
    if (x === Math.floor(CW / 2) && !edge) cf.set(x, Y0, z, B.gravel);
  }
  // fresh mass grave + mausoleum
  for (let x = 3; x < Math.min(CW - 3, 14); x++) for (let z = CD - 9; z < CD - 6; z++) cf.set(x, Y0, z, B.mud);
  cf.place(3, Y, CD - 10, 'gravestone', 0);
  cf.note(5, Y, CD - 5, 'grave_digger');
  ctx.usedNotes.add('grave_digger');
  const mf = cf.sub(CW - 9, 3, 6, 6);
  mf.walls(0, Y, 0, 5, Y + 3, 5, B.stone_brick); mf.fill(0, Y + 4, 0, 5, Y + 4, 5, B.stone_brick); mf.fill(1, Y0, 1, 4, Y0, 4, B.stone_brick);
  mf.door(2, Y, 5, 0, 'door_metal', { locked: true });
  mf.container(2, Y, 1, 'crate_wood', 0, 'survivor_stash', { fixed: [{ id: 'note', count: 1, data: { noteId: 'mausoleum' } }] });
  ctx.usedNotes.add('mausoleum');
  mf.place(1, Y, 1, 'gravestone', 0); mf.place(4, Y, 1, 'gravestone', 0);
  for (let z = 3; z < CD - 3; z += 3) for (let x = 2; x < CW - 2; x += 2) {
    if (Math.abs(x - Math.floor(CW / 2)) <= 1) continue;
    const r = rng.next();
    if (!cf.canPlace(x, Y, z) || !cf.canPlace(x, Y, z + 1)) continue;
    if (r < 0.75) cf.place(x, Y, z, 'gravestone', 0);
    else if (r < 0.85) { cf.set(x, Y0, z, B.dirt); cf.set(x, Y0, z + 1, B.dirt); cf.set(x, Y, z, B.fence_post); }
  }
  for (let k = 0; k < 6; k++) { const tx = rng.int(1, CW - 2), tz = rng.int(1, CD - 2); if (cf.get(tx, Y, tz) === 0 && cf.get(tx, Y0, tz) === B.grass) tree(ctx.world, cf.wx(tx, tz), Y, cf.wz(tx, tz), rng.pick(['oak', 'dead', 'oak']), rng.next(), ctx.seed); }
  cf.zombies(Math.floor(CW / 2), Y, Math.floor(CD / 2), 3, 6, {});
  cf.zone(0, 0, CW - 1, CD - 1, ZONES.CEMETERY);
  ctx.addPOI({ name: 'Millbrook Cemetery', type: 'cemetery', ...cf.worldRect(0, 0, CW - 1, CD - 1) });
  fr.zone(-1, -1, W, D + 3, ZONES.DOWNTOWN);
  ctx.addPOI({ name: "St. Mark's Church", type: 'church', ...fr.worldRect(0, 0, W - 1, D - 1) });
  ctx.building('church');
}
