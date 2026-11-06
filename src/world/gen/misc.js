// Outskirts of town: Starlite Motel, Burger Barn, Kentucky Motors car lot, Dollar Barn strip mall,
// Exit 81 Gas & Go, Riverside Apartments, the construction site, Pine Grove trailer park, the industrial park
// with warehouses / lumber yard / auto shop, the stopped freight train and the water tower.
import { B, BLOCKS } from '../blocks.js';
import { SURFACE, ZONES } from '../World.js';
import { Frame } from './frame.js';
import { shell, carvePlan, connect, exteriorDoor, roomWindows, paintRoomWalls, flatRoof, id } from './building.js';
import { Room, furnish } from './furnish.js';
import { aisles, checkouts, storefront } from './commercial.js';
import { SHOPS } from './shops.js';
import { apartmentBuilding } from './apartments.js';
import { gasStation } from './civic.js';
import { CAR_COLORS } from './util.js';
import { RAIL_Z } from './plan.js';

const Y0 = SURFACE, Y = Y0 + 1;
const car = (rng) => rng.weighted([['sedan', 5], ['suv', 4], ['pickup', 3], ['hatchback', 3], ['van', 1]]);

function parkingLot(ctx, fr, x0, z0, x1, z1, rng, o = {}) {
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const c = ((x * 31 + z * 17) % 19) === 0;
    fr.set(x, Y0, z, c ? B.asphalt_cracked : B.asphalt);
    if (fr.get(x, Y, z) !== 0 && !BLOCKS[fr.get(x, Y, z)].solid) fr.set(x, Y, z, 0);
  }
  const rows = o.rows || [z0 + 2, z1 - 2];
  for (const rz of rows) for (let x = x0 + 1; x <= x1 - 1; x += 3) { fr.set(x, Y0, rz - 1, B.parking_line_z); fr.set(x, Y0, rz, B.parking_line_z); }
  let n = 0;
  for (const rz of rows) for (let x = x0 + 2; x + 1 <= x1 - 1; x += 3) {
    if (!rng.chance((o.density ?? 0.4) * 0.5)) continue;
    if (fr.vehicle(x + 0.5, rz - 0.5 + (rz === rows[0] ? 0.4 : -0.4), rz === rows[0] ? 0 : Math.PI, car(rng), { color: rng.pick(CAR_COLORS), loot: 'car_trunk', gloveLoot: 'car_glovebox', alarm: rng.chance(0.1), wrecked: rng.chance(0.08), burned: rng.chance(0.04) })) n++;
  }
  return n;
}

// ============================================================================ STARLITE MOTEL
export function buildMotel(ctx, site) {
  const rng = ctx.rng.fork(0x5747);
  const W = 59, D = 13, H = 4;
  const bx0 = site.x0 + 6, bz0 = site.z0 + 6;
  const fr = Frame.fromRect(ctx, bx0, bz0, bx0 + W - 1, bz0 + D - 1, 0);
  shell(fr, { W, D, floors: 2, storeyH: H, outer: 'siding_yellow', inner: 'wall_beige', ceiling: 'wall_white', slab: 'concrete' });
  flatRoof(fr, W, D, Y0 + 2 * H, 'siding_yellow');
  const unitW = 6;
  let roomNo = 1;
  const units = [];
  for (let f = 0; f < 2; f++) {
    const y = Y0 + f * H;
    const rooms = [];
    for (let u = 0; u < 8; u++) {
      const x0 = 2 + u * (unitW + 1), x1 = x0 + unitW - 1;
      if (x1 > W - 3) break;
      if (f === 0 && u === 0) { rooms.push({ id: 'office', x0, z0: 2, x1, z1: D - 3, floor: 'carpet_red', wall: 'wall_wood_panel', t: 'office' }); continue; }
      rooms.push({ id: 'b' + u, x0, z0: 2, x1, z1: 3, floor: 'floor_tile', wall: 'wall_tile', t: 'bath', no: roomNo });
      rooms.push({ id: 'r' + u, x0, z0: 5, x1, z1: D - 3, floor: rng.pick(['carpet_red', 'carpet_beige', 'carpet_grey']), wall: rng.pick(['wallpaper_stripe', 'wallpaper_floral', 'wall_beige']), t: 'room', no: roomNo });
      roomNo++;
    }
    carvePlan(fr, y, rooms, 'wall_beige', H - 1, { x0: 2, z0: 2, x1: W - 3, z1: D - 3 });
    const byId = Object.fromEntries(rooms.map((r) => [r.id, r]));
    for (const r of rooms) {
      r.y = y;
      if (r.t === 'bath') connect(fr, y, r, byId['r' + r.id.slice(1)], 'door', rng, { door: 'door_white' });
      if (r.t === 'room' || r.t === 'office') {
        const d = exteriorDoor(fr, y, r, 'front', W, D, r.t === 'office' ? 'door_glass' : 'door_wood', rng, { locked: rng.chance(0.4), open: rng.chance(0.2) }, r.x0 + 1);
        void d;
        roomWindows(fr, y, { ...r, x0: r.x0 + 3 }, { x0: 2, z0: 2, x1: W - 3, z1: D - 3 }, W, D, 'glass', rng, null, { pairs: true });
        units.push(r);
      }
      paintRoomWalls(fr, y, r, r.wall, H - 1, new Set([B.wall_beige]));
    }
  }
  // furnish rooms
  for (const r of units) {
    if (r.t === 'office') {
      for (let x = r.x0; x <= r.x1 - 1; x++) fr.place(x, Y, r.z0 + 4, 'bar_counter', 2);
      fr.container(r.x0 + 2, Y, r.z0 + 2, 'desk', 2, 'office');
      fr.place(r.x0 + 1, Y + 1, r.z0 + 4, 'cash_register', 2);
      const o = new Room(fr, { ...r, z0: r.z0 + 5 }, rng, { height: 3 });
      o.wall('bench'); o.wall('vending_machine');
      const b = new Room(fr, { ...r, z1: r.z0 + 3 }, rng, { height: 3 });
      b.wall('filing_cabinet', { loot: 'office' }); b.wall('metal_shelf', { loot: 'motel_room' });
      continue;
    }
    const rm = new Room(fr, r, rng, { height: 3, loot: { dresser: 'motel_room', wardrobe: 'motel_room' } });
    rm.bed(true);
    if (r.no === 12) rm.wall('dresser', { loot: 'motel_room', opts: { fixed: [{ id: 'note', count: 1, data: { noteId: 'motel_guest' } }, { id: 'canned_soup', count: 2 }, { id: 'water_bottle', count: 1 }, { id: 'first_aid_kit', count: 1 }] } });
    else rm.wall('dresser');
    rm.wall('table', { top: 'tv', access: false });
    if (rng.chance(0.5)) rm.wall('chair');
    rm.floorLoot('floor_house', 1, 0.4);
    if (rng.chance(0.3)) { const c = rm.randomFree(); if (c) fr.zombies(c[0], r.y + 1, c[1], 1, 0, { indoor: true }); }
    else if (rng.chance(0.15)) { const c = rm.randomFree(); if (c) fr.corpse(c[0], r.y + 1, c[1], rng.range(0, 6), 'civilian', 'corpse_civilian'); }
    // bathroom
    const bath = { x0: r.x0, z0: 2, x1: r.x1, z1: 3, y: r.y };
    const br = new Room(fr, bath, rng, { height: 3, loot: { medicine_cabinet: 'motel_room' } });
    br.wall('toilet'); br.run(['bathtub', 'bathtub']); const s = br.wall('kitchen_sink'); br.mountAbove(s, 'medicine_cabinet');
  }
  ctx.usedNotes.add('motel_guest');
  // balcony walkway for the upper floor + exterior stairs at the east end
  for (let x = 0; x < W; x++) for (let z = D; z <= D + 1; z++) fr.set(x, Y0 + H, z, B.concrete);
  for (let x = 0; x < W; x++) fr.place(x, Y0 + H + 1, D + 2, x % 8 === 0 ? 'fence_post' : 'fence_wood', 0);
  for (let x = 0; x < W; x += 8) for (let yy = Y; yy < Y0 + H; yy++) fr.set(x, yy, D + 2, B.fence_post);
  for (let s = 0; s < 4; s++) {
    const x = W + 3 - s;
    for (const z of [D, D + 1]) {
      fr.clear(x, Y + s, z, 0); fr.place(x, Y + s, z, 'stairs_concrete', 3);
      for (let yy = Y; yy < Y + s; yy++) fr.set(x, yy, z, B.concrete);
    }
  }
  fr.set(W - 1, Y0 + H, D + 2, B.concrete); fr.clear(W - 1, Y0 + H + 1, D + 2, 0);
  for (const z of [D, D + 1]) for (let yy = Y0 + H + 1; yy <= Y0 + H + 2; yy++) fr.clear(W, yy, z, 0);
  fr.clear(W, Y0 + H + 1, D + 2, 0);
  // sign on a pole
  const sx = 4, sz = D + 16;
  for (let yy = Y; yy <= Y + 6; yy++) fr.set(sx, yy, sz, B.street_pole);
  fr.sign(sx - 6, Y + 7, sz + 1, 'STARLITE MOTEL', 0);
  fr.sign(sx - 2, Y + 6, sz + 1, 'VACANCY', 0);
  // parking + empty pool
  const lot = Frame.fromRect(ctx, site.x0, bz0 + D + 3, site.x1, site.z1, 0);
  parkingLot(ctx, lot, 0, 0, lot.w - 1, lot.d - 1, rng, { rows: [3, lot.d - 4], density: 0.45 });
  const px0 = 30, pz0 = 7;
  for (let x = px0; x < px0 + 12; x++) for (let z = pz0; z < pz0 + 7; z++) {
    const edge = x === px0 || z === pz0 || x === px0 + 11 || z === pz0 + 6;
    lot.set(x, Y0, z, edge ? B.concrete_white : 0);
    if (!edge) { lot.set(x, Y0 - 1, z, 0); lot.set(x, Y0 - 2, z, B.wall_tile); lot.set(x, Y0 - 3, z, B.wall_tile); lot.set(x, Y0 - 2, z, (z - pz0) < 3 ? B.water : B.wall_tile); }
  }
  for (let x = px0 + 1; x < px0 + 11; x++) for (let z = pz0 + 1; z < pz0 + 6; z++) { lot.set(x, Y0 - 3, z, B.wall_tile); lot.set(x, Y0 - 2, z, (x + z) % 3 === 0 ? B.water : 0); lot.set(x, Y0 - 1, z, 0); }
  for (let x = px0; x < px0 + 12; x++) for (const z of [pz0, pz0 + 6]) for (let yy = Y0 - 2; yy <= Y0 - 1; yy++) lot.set(x, yy, z, B.wall_tile);
  for (let z = pz0; z < pz0 + 7; z++) for (const x of [px0, px0 + 11]) for (let yy = Y0 - 2; yy <= Y0 - 1; yy++) lot.set(x, yy, z, B.wall_tile);
  lot.place(px0 + 1, Y0 - 1, pz0 + 1, 'ladder', 0);
  lot.zombies(px0 + 6, Y0 - 1, pz0 + 4, 1, 0, { types: ['crawler'] });
  if (ctx.debugLabels) ctx.reachChecks.push({ name: 'motel', start: [fr.wx(20, D + 6), Y, fr.wz(20, D + 6)], targets: [[fr.wx(30, D), Y0 + H + 1, fr.wz(30, D), 'balcony'], [fr.wx(10, 8), Y0 + H + 1, fr.wz(10, 8), 'upper room']], fuzzy: true });
  fr.zone(-6, -6, W + 6, D + 50, ZONES.COMMERCIAL);
  ctx.world.setZone(site.x0, site.z0, site.x1, site.z1, ZONES.COMMERCIAL);
  ctx.addPOI({ name: 'Starlite Motel', type: 'motel', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.building('motel');
  ctx.planViews.push({ name: 'motel-f2', ...fr.worldRect(-2, -2, W + 5, D + 4), y: Y0 + H + 1, s: 8 });
}

// ============================================================================ BURGER BARN
export function buildBurger(ctx, site) {
  const rng = ctx.rng.fork(0xb6b6);
  const bw = 24, bd = 16;
  const fr = Frame.fromRect(ctx, site.x0 + 4, site.z1 - 4 - bd + 1, site.x0 + 4 + bw - 1, site.z1 - 4, 0);
  const info = storefront(ctx, fr, { kind: 'diner', sign: 'BURGER BARN', awning: 'red', outer: 'barn_red', inner: 'wall_white', floorMat: 'floor_checker', backDepth: 5 }, rng);
  SHOPS.diner(ctx, fr, info, rng);
  // walk-in freezer: the manager
  const fz = new Room(fr, info.back, rng, { height: 4 });
  const c = fz.randomFree();
  if (c) { fr.zombies(c[0], Y, c[1], 1, 0, { indoor: true, outfit: 'worker', types: ['brute'] }); fr.note(c[0], Y, c[1], 'burger_note'); ctx.usedNotes.add('burger_note'); }
  const lot = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1 - bd - 6, 0);
  parkingLot(ctx, lot, 0, 0, lot.w - 1, lot.d - 1, rng, { rows: [2, lot.d - 3] });
  ctx.world.setZone(site.x0, site.z0, site.x1, site.z1, ZONES.COMMERCIAL);
  ctx.addPOI({ name: 'Burger Barn', type: 'store', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.building('fast_food');
}

// ============================================================================ KENTUCKY MOTORS (car lot)
export function buildCarLot(ctx, site) {
  const rng = ctx.rng.fork(0xca70);
  const fr = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1, 2); // front faces Main Street (north)
  const W = fr.w, D = fr.d;
  parkingLot(ctx, fr, 0, 0, W - 1, D - 1, rng, { rows: [], density: 0 });
  // rows of cars for sale facing the street
  let n = 0;
  for (const rz of [D - 5, D - 13, D - 21]) for (let x = 3; x < W - 22; x += 4) {
    if (rng.chance(0.45)) continue;
    if (fr.vehicle(x + 0.5, rz, 0, rng.weighted([['sedan', 4], ['suv', 4], ['pickup', 4], ['hatchback', 2], ['van', 1]]), { color: rng.pick(CAR_COLORS), loot: 'car_trunk', gloveLoot: 'car_glovebox', alarm: rng.chance(0.25) })) n++;
  }
  // flags / pennant poles along the street
  for (let x = 2; x < W - 2; x += 6) for (let yy = Y; yy <= Y + 3; yy++) fr.set(x, yy, D - 1, B.street_pole);
  // sales office + service bay at the back right
  const of = fr.sub(W - 20, 2, 18, 14);
  const info = storefront(ctx, of, { kind: 'office', sign: 'KENTUCKY MOTORS', outer: 'brick_white', backDepth: 5, floorMat: 'floor_tile' }, rng);
  SHOPS.office(ctx, of, info, rng);
  const bk = new Room(of, info.back, rng, { height: 4 });
  bk.wall('metal_shelf', { loot: 'mechanic' }); bk.wall('toolbox', { loot: 'mechanic', access: false }); bk.wall('workbench');
  const c = new Room(of, info.S, rng, { height: 4 }).randomFree();
  if (c) { of.note(c[0], Y, c[1], 'carlot_note'); ctx.usedNotes.add('carlot_note'); }
  ctx.world.setZone(site.x0, site.z0, site.x1, site.z1, ZONES.COMMERCIAL);
  ctx.addPOI({ name: 'Kentucky Motors', type: 'store', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.building('car_dealer');
  ctx.stats.carLot = n;
}

// ============================================================================ DOLLAR BARN strip mall
export function buildStripMall(ctx, site) {
  const rng = ctx.rng.fork(0xd011);
  const D = 20;
  const units = [
    { w: 22, spec: { kind: 'general', sign: 'DOLLAR BARN', awning: 'red', outer: 'brick_brown' } },
    { w: 16, spec: { kind: 'hardware', sign: 'AUTO PARTS', awning: 'blue', outer: 'brick_brown' } },
    { w: 14, spec: { kind: 'pawn', sign: 'PAWN', awning: 'green', outer: 'brick_brown' } },
    { w: 13, spec: { kind: 'laundromat', sign: 'COIN WASH', awning: 'blue', outer: 'brick_brown' } },
  ];
  let x = site.x0;
  for (const u of units) {
    if (x + u.w - 1 > site.x1) break;
    const fr = Frame.fromRect(ctx, x, site.z1 - D + 1, x + u.w - 1, site.z1, 2);
    const info = storefront(ctx, fr, u.spec, rng);
    if (u.spec.sign === 'AUTO PARTS') {
      const r = new Room(fr, info.S, rng, { height: 4 });
      aisles(fr, info.S.x0 + 2, info.S.z0 + 1, info.S.x1 - 2, info.S.z1 - 4, Y, ['metal_shelf', 'store_shelf_misc'], 'mechanic', { gap: true });
      for (let k = 0; k < 4; k++) r.wall('metal_shelf', { loot: 'mechanic' });
      checkouts(fr, [info.S.x1 - 2], info.S.z1 - 3, Y, rng, 'mechanic');
    } else SHOPS[u.spec.kind](ctx, fr, info, rng);
    ctx.building('shop_' + u.spec.kind);
    x += u.w;
  }
  const lot = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1 - D - 1, 0);
  parkingLot(ctx, lot, 0, 0, lot.w - 1, lot.d - 1, rng, { rows: [lot.d - 3, 3], density: 0.4 });
  ctx.world.setZone(site.x0, site.z0, site.x1, site.z1, ZONES.COMMERCIAL);
  ctx.addPOI({ name: 'Dollar Barn Plaza', type: 'store', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
}

// ============================================================================ EXIT 81 GAS & GO (truck stop)
export function buildExitGas(ctx, site) {
  const rng = ctx.rng.fork(0x6a5);
  const g = { ...site, x1: site.x0 + 44 };
  const fr = gasStation(ctx, g, 2, 'GAS N GO', rng, { outer: 'brick_red', poi: false });
  // clerk note in the store back room
  fr.note(Math.floor(fr.w / 2), Y, 3, 'gas_clerk');
  ctx.usedNotes.add('gas_clerk');
  // truck parking east
  const tf = Frame.fromRect(ctx, site.x0 + 46, site.z0, site.x1, site.z1, 0);
  for (let x = 0; x < tf.w; x++) for (let z = 0; z < tf.d; z++) tf.set(x, Y0, z, (x % 9 === 0) ? B.parking_line_z : B.asphalt);
  for (let k = 0; k < 4; k++) if (rng.chance(0.8)) tf.vehicle(4.5 + k * 9, tf.d / 2 + rng.range(-2, 2), rng.chance(0.5) ? 0 : Math.PI, 'semi', { color: rng.pick(CAR_COLORS), loot: 'truck_cargo', gloveLoot: 'car_glovebox', wrecked: rng.chance(0.2) });
  tf.zombies(Math.floor(tf.w / 2), Y, Math.floor(tf.d / 2), 3, 8, { outfit: 'worker' });
  ctx.world.setZone(site.x0, site.z0, site.x1, site.z1, ZONES.GAS);
  ctx.addPOI({ name: 'Exit 81 Gas & Go', type: 'gas', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
}

// ============================================================================ RIVERSIDE APARTMENTS
export function buildRiversideApts(ctx, site) {
  const rng = ctx.rng.fork(0x4a9a);
  for (const [x0, x1] of [[site.x0, site.x0 + 35], [site.x0 + 42, site.x0 + 77]]) {
    const fr = Frame.fromRect(ctx, x0, site.z0 + 2, x1, site.z0 + 25, 2);
    apartmentBuilding(ctx, fr, { floors: rng.int(3, 4), outer: rng.pick(['brick_brown', 'brick_red', 'siding_grey']), name: 'RIVERSIDE' }, rng);
  }
  const lot = Frame.fromRect(ctx, site.x0, site.z0 + 28, site.x1, site.z1, 0);
  parkingLot(ctx, lot, 0, 0, lot.w - 1, lot.d - 1, rng, { rows: [3, lot.d - 4], density: 0.5 });
  ctx.world.setZone(site.x0, site.z0, site.x1, site.z1, ZONES.SUBURB);
  ctx.addPOI({ name: 'Riverside Apartments', type: 'residential', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
}

// ============================================================================ CONSTRUCTION SITE
export function buildConstruction(ctx, site) {
  const rng = ctx.rng.fork(0xc057);
  const fr = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1, 2); // faces Market Street
  const W = fr.w, D = fr.d;
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) fr.set(x, Y0, z, rng.chance(0.3) ? B.gravel : B.dirt);
  // perimeter fence with a gate
  for (let x = 0; x < W; x++) for (const z of [0, D - 1]) if (!(z === D - 1 && x >= 8 && x <= 14)) fr.place(x, Y, z, 'fence_chainlink', 0);
  for (let z = 0; z < D; z++) for (const x of [0, W - 1]) fr.place(x, Y, z, 'fence_chainlink', 1);
  // concrete frame: 3 storeys, 30 x 22, columns every 5, slabs with holes, stairs
  const fx0 = 26, fz0 = 6, FW = 30, FD = 22, H = 5;
  for (let f = 0; f <= 3; f++) {
    const y = Y0 + f * H;
    if (f > 0) for (let x = fx0; x < fx0 + FW; x++) for (let z = fz0; z < fz0 + FD; z++) {
      const hole = f === 3 ? rng.chance(0.35) || x > fx0 + 20 : (f === 2 && x > fx0 + 24 && z > fz0 + 12);
      if (!hole) fr.set(x, y, z, B.concrete);
    }
    else for (let x = fx0; x < fx0 + FW; x++) for (let z = fz0; z < fz0 + FD; z++) fr.set(x, y, z, B.concrete);
    if (f < 3) for (let x = fx0; x < fx0 + FW; x += 5) for (let z = fz0; z < fz0 + FD; z += 7) for (let yy = y + 1; yy < y + H; yy++) fr.set(x, yy, z, B.concrete);
    if (f === 3) for (let x = fx0; x < fx0 + FW; x += 5) for (let z = fz0; z < fz0 + FD; z += 7) for (let yy = y + 1; yy <= y + 2; yy++) fr.set(x, yy, z, B.iron_bars);
  }
  // stair flights in one bay (x fx0+1..., z fz0+1..)
  for (let f = 0; f < 3; f++) {
    const y = Y0 + f * H;
    const col = fx0 + 2 + (f % 2);
    for (let s = 1; s <= H; s++) {
      const z = f % 2 === 0 ? fz0 + 1 + H - s + 1 : fz0 + 1 + s;
      fr.clear(col, y + s, z, 0); fr.place(col, y + s, z, 'stairs_concrete', f % 2 === 0 ? 0 : 2);
      for (let yy = y + 1; yy < y + s; yy++) fr.set(col, yy, z, B.concrete);
      if (s >= H - 3) fr.clear(col, y + H, z, 0);
    }
  }
  // brick walls started on the ground floor
  for (let x = fx0; x < fx0 + FW; x++) if (x % 5) for (let yy = Y; yy <= Y + rng.int(0, 3); yy++) fr.set(x, yy, fz0 + FD - 1, B.brick_red);
  // scaffolding on the front face
  for (let x = fx0; x < fx0 + FW; x += 3) for (let yy = Y; yy <= Y + 9; yy++) fr.set(x, yy, fz0 + FD + 1, B.fence_post);
  for (const yy of [Y + 4, Y + 9]) for (let x = fx0; x < fx0 + FW; x++) fr.set(x, yy, fz0 + FD + 1, B.planks_oak);
  for (let yy = Y; yy <= Y + 9; yy++) { fr.clear(fx0 + 1, yy, fz0 + FD + 2, 0); fr.place(fx0 + 1, yy, fz0 + FD + 2, 'ladder', 0); }
  // tower crane
  const cx = fx0 - 6, cz = fz0 + 6;
  for (let yy = Y; yy <= Y + 28; yy++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) fr.set(cx + dx, yy, cz + dz, (yy % 3 === 0) ? B.metal_wall : B.iron_bars);
  for (let yy = Y; yy <= Y + 28; yy++) { fr.clear(cx + 2, yy, cz, 0); fr.place(cx + 2, yy, cz, 'ladder', 3); }
  for (let k = -6; k <= 26; k++) { fr.set(cx + k, Y + 29, cz, B.metal_wall); fr.set(cx + k, Y + 29, cz + 1, B.iron_bars); }
  fr.fill(cx - 6, Y + 28, cz - 1, cx - 3, Y + 28, cz + 2, B.concrete);
  fr.container(cx, Y + 30, cz, 'crate_wood', 0, 'construction');
  for (let yy = Y + 20; yy <= Y + 28; yy++) fr.set(cx + 20, yy, cz, B.street_pole);
  fr.set(cx + 20, Y + 19, cz, B.pallet);
  // material piles + site trailer
  for (let k = 0; k < 8; k++) {
    const x = rng.int(2, 22), z = rng.int(3, D - 4);
    if (fr.get(x, Y, z) !== 0) continue;
    const m = rng.pick(['pallet', 'planks_oak', 'brick_red', 'crate_wood', 'barrel_rust', 'cobblestone']);
    if (m === 'crate_wood' || m === 'barrel_rust') fr.container(x, Y, z, m, 0, 'construction'); else { fr.set(x, Y, z, B[m]); if (rng.chance(0.5)) fr.set(x, Y + 1, z, B[m]); }
  }
  const tf = fr.sub(3, D - 10, 10, 5);
  tf.fill(0, Y0, 0, 9, Y0, 4, B.planks_oak); tf.walls(0, Y, 0, 9, Y + 2, 4, B.siding_white); tf.fill(1, Y, 1, 8, Y + 2, 3, 0); tf.fill(0, Y + 3, 0, 9, Y + 3, 4, B.roof_metal);
  tf.door(4, Y, 4, 0, 'door_wood', { locked: true }); tf.set(2, Y + 1, 4, B.glass); tf.set(7, Y + 1, 4, B.glass);
  tf.container(1, Y, 1, 'desk', 0, 'construction'); tf.place(1, Y, 2, 'chair', 2); tf.container(8, Y, 1, 'metal_shelf', 0, 'construction'); tf.container(7, Y, 1, 'locker', 0, 'construction'); tf.container(8, Y, 3, 'toolbox', 0, 'construction');
  tf.note(5, Y, 2, 'construction_note');
  ctx.usedNotes.add('construction_note');
  fr.sign(9, Y + 1, D, 'MEDICAL PLAZA', 0);
  fr.vehicle(18, D - 6, 0.3, 'pickup', { color: 0xe0e0e0, loot: 'pickup_bed', gloveLoot: 'car_glovebox' });
  fr.zombies(fx0 + 12, Y, fz0 + 8, 3, 6, { outfit: 'worker' });
  fr.zombies(fx0 + 10, Y0 + 2 * H + 1, fz0 + 10, 2, 4, { outfit: 'worker' });
  ctx.world.setZone(site.x0, site.z0, site.x1, site.z1, ZONES.INDUSTRIAL);
  ctx.addPOI({ name: 'Construction Site', type: 'industrial', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.building('construction_site');
}

// ============================================================================ PINE GROVE TRAILER PARK
function trailer(ctx, fr, x0, z0, rng, i) {
  const W = 6, D = 14;
  const tf = fr.sub(x0, z0, W, D);
  const mat = rng.pick(['siding_white', 'siding_grey', 'corrugated_metal', 'siding_yellow', 'siding_blue']);
  const burned = rng.chance(0.08);
  tf.fill(0, Y0, 0, W - 1, Y0, D - 1, B.planks_light);
  tf.walls(0, Y, 0, W - 1, Y + 2, D - 1, B[mat]);
  tf.fill(1, Y, 1, W - 2, Y + 2, D - 2, 0);
  tf.fill(0, Y + 3, 0, W - 1, Y + 3, D - 1, B.roof_metal);
  // partitions: living/kitchen (front 7), bath (2), bedroom (back)
  tf.fill(1, Y, 6, W - 2, Y + 2, 6, B.wall_wood_panel);
  tf.fill(1, Y, 3, W - 2, Y + 2, 3, B.wall_wood_panel);
  tf.door(W - 1, Y, 9, 3, 'door_white', { locked: rng.chance(0.4), open: rng.chance(0.2) });
  tf.clear(2, Y, 6, 0); tf.clear(2, Y + 1, 6, 0); tf.markOpening(2, Y, 6);
  tf.clear(2, Y, 3, 0); tf.clear(2, Y + 1, 3, 0); tf.markOpening(2, Y, 3);
  for (const z of [8, 11, 1]) { tf.set(0, Y + 1, z, B.glass); }
  tf.set(W - 1, Y + 1, 12, B.glass);
  const loot = { kitchen_cabinet: 'trailer_home', dresser: 'trailer_home', wardrobe: 'trailer_home', couch: 'trailer_home', fridge: 'trailer_home' };
  const liv = new Room(tf, { x0: 1, z0: 7, x1: W - 2, z1: D - 2, y: Y0 }, rng, { height: 3, loot });
  liv.run(['fridge', 'stove', 'kitchen_sink', 'kitchen_cabinet']);
  liv.wall('couch'); liv.wall('table', { top: 'tv', access: false });
  liv.floorLoot('floor_house', 1, 0.5);
  const bth = new Room(tf, { x0: 1, z0: 4, x1: W - 2, z1: 5, y: Y0 }, rng, { height: 3 });
  bth.wall('toilet'); const s = bth.wall('kitchen_sink'); bth.mountAbove(s, 'medicine_cabinet');
  const bed = new Room(tf, { x0: 1, z0: 1, x1: W - 2, z1: 2, y: Y0 }, rng, { height: 3, loot });
  bed.bed(false); bed.wall('dresser');
  if (burned) {
    for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) for (let yy = Y; yy <= Y + 3; yy++) {
      const b = tf.get(x, yy, z);
      if (b && BLOCKS[b].door) continue;
      if (b && rng.chance(0.4)) tf.clear(x, yy, z, rng.chance(0.3) && yy === Y ? B.rubble : 0);
      else if (b === B[mat]) tf.set(x, yy, z, B.planks_dark);
    }
  }
  // yard: lawn chairs, grill, car
  tf.place(W + 1, Y, 6, 'chair', 3); tf.place(W + 1, Y, 7, 'chair', 3);
  if (rng.chance(0.5)) tf.set(W + 2, Y, 12, B.barrel_rust);
  if (rng.chance(0.5)) tf.vehicle(W + 3.5, 2.5, 0, rng.pick(['pickup', 'sedan', 'hatchback']), { color: rng.pick(CAR_COLORS), loot: 'car_trunk', gloveLoot: 'car_glovebox', wrecked: rng.chance(0.3) });
  if (i === 9) { tf.note(W + 1, Y, 9, 'trailer_note'); ctx.usedNotes.add('trailer_note'); tf.set(2, Y, 12, B.lantern); }
  if (!burned && rng.chance(0.3)) tf.zombies(2, Y, 9, 1, 1, { indoor: true });
  ctx.building('trailer');
}

export function buildTrailerPark(ctx, site) {
  const rng = ctx.rng.fork(0x7a11);
  const fr = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1, 0); // entrance from River Road (south)
  const W = fr.w, D = fr.d;
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) fr.set(x, Y0, z, rng.chance(0.15) ? B.dirt : B.dry_grass);
  const lane = Math.floor(D / 2);
  for (let x = 2; x < W - 2; x++) for (let k = -1; k <= 1; k++) fr.set(x, Y0, lane + k, B.gravel);
  for (let z = lane; z < D + 3; z++) for (let x = 4; x <= 6; x++) fr.set(x, Y0, z, B.gravel);
  fr.sign(9, Y + 1, D - 1, 'PINE GROVE', 0);
  let i = 0;
  for (let x = 8; x + 6 < W - 2; x += 11) {
    trailer(ctx, fr, x, lane - 2 - 14, rng, i++);
    trailer(ctx, fr, x, lane + 3, rng, i++);
  }
  fr.zombies(Math.floor(W / 2), Y, lane, rng.int(3, 5), 10, {});
  fr.zone(0, 0, W - 1, D - 1, ZONES.TRAILER);
  ctx.addPOI({ name: 'Pine Grove Mobile Home Park', type: 'residential', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
}

// ============================================================================ INDUSTRIAL PARK
function warehouse(ctx, fr, rng, name, note) {
  const W = fr.w, D = fr.d, H = 7;
  shell(fr, { W, D, floors: 1, storeyH: H, outer: 'corrugated_metal', inner: 'metal_wall', ceiling: 'roof_metal' });
  fr.fill(1, Y0 + H, 1, W - 2, Y0 + H, D - 2, B.roof_metal);
  const main = { x0: 2, z0: 2, x1: W - 3, z1: D - 9, floor: 'concrete' };
  const office = { x0: 2, z0: D - 7, x1: 9, z1: D - 3, floor: 'carpet_grey' };
  const front = { x0: 11, z0: D - 7, x1: W - 3, z1: D - 3, floor: 'concrete' };
  carvePlan(fr, Y0, [main, office, front], 'metal_wall', H - 1, { x0: 2, z0: 2, x1: W - 3, z1: D - 3 });
  connect(fr, Y0, office, main, 'door', rng, { door: 'door_white' });
  connect(fr, Y0, office, front, 'door', rng, { door: 'door_white' });
  connect(fr, Y0, front, main, 'wide', rng, { h: 3 });
  exteriorDoor(fr, Y0, office, 'front', W, D, 'door_glass', rng, { locked: rng.chance(0.4) });
  // loading docks on the front of the 'front' bay
  for (let k = 0; k < 2; k++) {
    const x0 = 14 + k * 7;
    if (x0 + 3 > W - 3) break;
    for (let x = x0; x < x0 + 4; x++) for (let yy = Y; yy <= Y + 3; yy++) { fr.clear(x, yy, D - 1, k === 0 && rng.chance(0.5) ? 0 : B.garage_door); fr.clear(x, yy, D - 2, 0); }
    for (let x = x0; x < x0 + 4; x++) fr.markOpening(x, Y, D - 2);
    fr.vehicle(x0 + 2, D + 8, Math.PI, 'semi', { color: rng.pick(CAR_COLORS), loot: 'truck_cargo', gloveLoot: 'car_glovebox' });
  }
  // racks: rows of metal shelves 3 high
  for (let x = main.x0 + 2; x <= main.x1 - 2; x += 5) for (let z = main.z0 + 1; z <= main.z1 - 2; z++) {
    if ((z - main.z0) % 9 === 4) continue;
    for (const [xx, f] of [[x, 1], [x + 1, 3]]) {
      if (!fr.canPlace(xx, Y, z)) continue;
      for (let yy = Y; yy <= Y + 2; yy++) fr.container(xx, yy, z, rng.chance(0.75) ? 'metal_shelf' : 'crate_wood', f, 'warehouse');
    }
  }
  for (let k = 0; k < 10; k++) {
    const x = rng.int(front.x0, front.x1), z = rng.int(front.z0, front.z1);
    if (!fr.canPlace(x, Y, z)) continue;
    fr.set(x, Y, z, B.pallet);
    if (rng.chance(0.7)) fr.container(x, Y + 1, z, rng.pick(['cardboard_box', 'crate_wood']), 0, 'warehouse');
  }
  const ofr = new Room(fr, { ...office, y: Y0 }, rng, { height: H - 1 });
  ofr.deskSet('desk', { loot: 'office' }); ofr.wall('filing_cabinet', { loot: 'office' }); ofr.wall('vending_machine');
  if (note) { const c = ofr.randomFree(); if (c) { fr.note(c[0], Y, c[1], note); ctx.usedNotes.add(note); } }
  roomWindows(fr, Y0, office, { x0: 2, z0: 2, x1: W - 3, z1: D - 3 }, W, D, 'glass', rng, null, {});
  fr.signCentered(1, W - 2, Y + 4, D, name, 0);
  fr.zombies(Math.floor(W / 2), Y, Math.floor(D / 2), rng.int(2, 4), 6, { indoor: true, outfit: 'worker' });
  ctx.building('warehouse');
}

export function buildIndustrial(ctx, site) {
  const rng = ctx.rng.fork(0x1d57);
  const { world } = ctx;
  for (let x = site.x0; x <= site.x1; x++) for (let z = site.z0; z <= site.z1; z++) {
    const g = world.get(x, Y0, z);
    if (g === B.grass) world.set(x, Y0, z, ((x * 13 + z * 7) % 11) < 3 ? B.gravel : B.concrete_dark);
  }
  // north of Factory Road (z 594..674): two warehouses facing the road
  const w1 = Frame.fromRect(ctx, site.x0 + 4, site.z0 + 2, site.x0 + 47, site.z0 + 27, 0);
  warehouse(ctx, w1, rng, 'MILLBROOK FREIGHT', 'warehouse_note');
  const w2 = Frame.fromRect(ctx, site.x0 + 56, site.z0 + 2, site.x0 + 99, site.z0 + 27, 0);
  warehouse(ctx, w2, rng, 'COUNTY SUPPLY', null);
  // auto shop
  const af = Frame.fromRect(ctx, site.x0 + 110, site.z0 + 50, site.x0 + 135, site.z0 + 79, 0);
  const info = storefront(ctx, af, { kind: 'office', sign: "JOE'S AUTO", outer: 'brick_white', backDepth: 8, floorMat: 'concrete' }, rng);
  const S = info.S;
  for (let x = 3; x <= 7; x++) for (let yy = Y; yy <= Y + 2; yy++) { af.clear(x, yy, af.d - 1, B.garage_door); }
  const sr = new Room(af, S, rng, { height: 4 });
  for (let k = 0; k < 5; k++) sr.wall(rng.pick(['metal_shelf', 'toolbox', 'workbench', 'barrel_rust']), { loot: 'mechanic' });
  const bk = new Room(af, info.back, rng, { height: 4 });
  for (let k = 0; k < 4; k++) bk.wall('metal_shelf', { loot: 'mechanic' });
  af.vehicle(8, S.z0 + 4, 0, rng.pick(['sedan', 'pickup', 'suv']), { color: rng.pick(CAR_COLORS), loot: 'car_trunk', wrecked: true });
  ctx.building('auto_shop');
  // lumber yard (east, north of the road)
  const ly = Frame.fromRect(ctx, site.x0 + 110, site.z0 + 2, site.x0 + 170, site.z0 + 40, 0);
  for (let x = 0; x < ly.w; x++) for (let z = 0; z < ly.d; z++) ly.set(x, Y0, z, B.dirt);
  for (let r = 0; r < 4; r++) for (let x = 3; x < ly.w - 14; x += 3) {
    const z0 = 3 + r * 8;
    const h = rng.int(1, 3);
    for (let yy = Y; yy < Y + h; yy++) for (let dz = 0; dz < 4; dz++) ly.set(x, yy, z0 + dz, r % 2 ? B.log_oak : B.planks_oak);
  }
  const shedf = ly.sub(ly.w - 12, 3, 10, 12);
  shedf.fill(0, Y0, 0, 9, Y0, 11, B.concrete);
  shedf.fill(0, Y, 0, 0, Y + 3, 11, B.corrugated_metal); shedf.fill(9, Y, 0, 9, Y + 3, 11, B.corrugated_metal); shedf.fill(0, Y, 0, 9, Y + 3, 0, B.corrugated_metal);
  shedf.fill(0, Y + 4, 0, 9, Y + 4, 11, B.roof_metal);
  shedf.container(2, Y, 1, 'workbench', 0, 'construction'); shedf.container(4, Y, 1, 'metal_shelf', 0, 'hardware_store'); shedf.container(6, Y, 1, 'metal_shelf', 0, 'construction');
  shedf.vehicle(5, 7, 0, 'pickup', { color: 0x9a8a5a, loot: 'pickup_bed' });
  ly.sign(2, Y + 1, ly.d, 'LUMBER', 0);
  ctx.building('lumber_yard');
  // south of Factory Road (z 684..754): factory hall + yard with containers
  const fh = Frame.fromRect(ctx, site.x0 + 4, site.z0 + 92, site.x0 + 59, site.z0 + 125, 2);
  warehouse(ctx, fh, rng, 'MILLBROOK MILLWORKS', null);
  for (let k = 0; k < 6; k++) {
    const cx = site.x0 + 70 + (k % 3) * 9, cz = site.z0 + 96 + Math.floor(k / 3) * 8;
    const col = rng.pick([B.corrugated_metal, B.metal_wall, B.siding_red, B.siding_blue]);
    world.fill(cx, Y, cz, cx + 6, Y + 2, cz + 2, col);
    world.fill(cx + 1, Y, cz + 1, cx + 5, Y + 1, cz + 1, 0);
    world.set(cx, Y, cz + 1, 0); world.set(cx, Y + 1, cz + 1, 0);
    world.placeContainer(cx + 4, Y, cz + 1, 'crate_wood', 0, rng.chance(0.3) ? 'truck_cargo' : 'warehouse');
  }
  for (let k = 0; k < 5; k++) ctx.addZombies({ x: site.x0 + 20 + k * 45, y: Y, z: site.z0 + 80 + rng.int(-6, 6), count: rng.int(2, 3), radius: 8, outfit: 'worker' });
  world.setZone(site.x0, site.z0, site.x1, site.z1, ZONES.INDUSTRIAL);
  ctx.addPOI({ name: 'Millbrook Industrial Park', type: 'industrial', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.addPOI({ name: 'Millbrook Lumber Yard', type: 'industrial', ...ly.worldRect(0, 0, ly.w - 1, ly.d - 1) });
  buildTrain(ctx, rng);
}

/** Stopped freight train on the rail line south of River Road. */
function buildTrain(ctx, rng) {
  const { world } = ctx;
  const z0 = RAIL_Z - 1;
  let x = 640;
  // locomotive
  world.fill(x, Y, z0, x + 13, Y + 3, z0 + 2, B.metal_wall);
  world.fill(x + 1, Y + 1, z0 + 1, x + 4, Y + 2, z0 + 1, 0);
  world.set(x + 2, Y + 2, z0, B.glass); world.set(x + 2, Y + 2, z0 + 2, B.glass);
  world.set(x, Y + 2, z0 + 1, B.glass);
  world.set(x + 3, Y + 1, z0, 0); world.set(x + 3, Y + 2, z0, 0);
  world.placeContainer(x + 1, Y + 1, z0 + 1, 'locker', 3, 'crate', { fixed: [{ id: 'note', count: 1, data: { noteId: 'rail_note' } }] });
  ctx.usedNotes.add('rail_note');
  x += 15;
  for (let c = 1; c <= 7; c++) {
    const col = rng.pick([B.siding_red, B.corrugated_metal, B.siding_grey, B.barn_red, B.siding_blue]);
    world.fill(x, Y, z0, x + 11, Y + 3, z0 + 2, col);
    world.fill(x + 1, Y, z0 + 1, x + 10, Y + 2, z0 + 1, 0);
    const open = rng.chance(0.6) || c === 3 || c === 5;
    if (open) for (let dx = 5; dx <= 6; dx++) for (let yy = Y; yy <= Y + 2; yy++) world.set(x + dx, yy, z0 + 2, 0);
    const loot = c === 3 || c === 5 ? 'fema_supply' : rng.pick(['warehouse', 'truck_cargo', 'crate']);
    for (let k = 0; k < 4; k++) world.placeContainer(x + 1 + k * 3, Y, z0 + 1, rng.pick(['crate_wood', 'cardboard_box', 'crate_wood']), 0, loot);
    if (rng.chance(0.3)) ctx.addZombies({ x: x + 6, y: Y, z: z0 + 1.5, count: 1, radius: 2, indoor: true });
    x += 13;
  }
  ctx.addPOI({ name: 'Stopped Freight Train', type: 'landmark', x0: 640, z0: RAIL_Z - 3, x1: x, z1: RAIL_Z + 3 });
  ctx.building('train');
}

// ============================================================================ WATER TOWER
export function buildWaterTower(ctx, site) {
  const { world } = ctx;
  const cx = Math.floor((site.x0 + site.x1) / 2), cz = Math.floor((site.z0 + site.z1) / 2);
  for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) for (let yy = Y; yy < Y + 16; yy++) world.set(cx + dx, yy, cz + dz, B.metal_wall);
  for (let yy = Y + 4; yy < Y + 16; yy += 6) for (let k = -4; k <= 4; k++) { world.set(cx + k, yy, cz - 4, B.iron_bars); world.set(cx + k, yy, cz + 4, B.iron_bars); world.set(cx - 4, yy, cz + k, B.iron_bars); world.set(cx + 4, yy, cz + k, B.iron_bars); }
  const R = 5;
  for (let dx = -R - 1; dx <= R + 1; dx++) for (let dz = -R - 1; dz <= R + 1; dz++) {
    const d = Math.max(Math.abs(dx), Math.abs(dz)) + (Math.abs(dx) + Math.abs(dz) > 7 ? 1.5 : 0);
    if (d <= R + 1.4) world.set(cx + dx, Y + 16, cz + dz, B.planks_dark); // catwalk
    if (d > R + 0.4) continue;
    for (let yy = Y + 17; yy <= Y + 24; yy++) world.set(cx + dx, yy, cz + dz, d > R - 0.7 ? B.siding_white : (yy === Y + 17 ? B.siding_white : B.water));
    world.set(cx + dx, Y + 25, cz + dz, B.roof_metal);
    if (d < 2.5) world.set(cx + dx, Y + 26, cz + dz, B.roof_metal);
  }
  for (let dx = -R - 1; dx <= R + 1; dx++) for (const dz of [-R - 2, R + 2]) if (world.get(cx + dx, Y + 17, cz + dz) === 0) world.place(cx + dx, Y + 17, cz + dz, 'fence_wood', 0);
  // ladder up one leg
  for (let yy = Y; yy <= Y + 16; yy++) world.place(cx + 4, yy, cz + 5, 'ladder', 0);
  world.set(cx + 4, Y + 16, cz + 5, 0); world.place(cx + 4, Y + 16, cz + 5, 'ladder', 0);
  world.placeSign(cx - 4, Y + 21, cz + R + 1, 'MILLBROOK', 0, 1, 0);
  world.placeContainer(cx - 3, Y + 17, cz + R + 1, 'crate_wood', 0, 'survivor_stash');
  ctx.addPOI({ name: 'Water Tower', type: 'landmark', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.building('water_tower');
}
