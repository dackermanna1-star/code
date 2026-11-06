// Civic / special downtown buildings: police station, fire station, town hall, Foodland supermarket,
// Veterans Park, gas stations.
import { B, BLOCKS } from '../blocks.js';
import { SURFACE, ZONES } from '../World.js';
import { Frame } from './frame.js';
import { shell, carvePlan, connect, exteriorDoor, roomWindows, paintRoomWalls, flatRoof, stairwell, id } from './building.js';
import { Room, furnish } from './furnish.js';
import { aisles, checkouts } from './commercial.js';
import { tree } from './vegetation.js';
import { CAR_COLORS } from './util.js';

const Y0 = SURFACE;

/**
 * Generic custom building floor: carve rooms, connect, windows, paint.
 * rooms: [{id, x0,z0,x1,z1, floor, wall}], conns: [[a, b, kind, opts]], ext: [[room, side, kind, opts, pos]]
 */
export function layoutFloor(fr, y, H, rooms, conns, rng, o = {}) {
  const W = fr.w, D = fr.d;
  const ib = { x0: 2, z0: 2, x1: W - 3, z1: D - 3 };
  carvePlan(fr, y, rooms, o.partition || 'wall_white', H - 1, ib);
  const byId = Object.fromEntries(rooms.map((r) => [r.id, r]));
  for (const [a, b, kind, opts] of conns) {
    if (!byId[a] || !byId[b]) continue;
    const c = connect(fr, y, byId[a], byId[b], kind, rng, opts || {});
    if (!c && kind !== 'door') connect(fr, y, byId[a], byId[b], 'door', rng, opts || {});
  }
  const skip = new Set();
  for (const [rid, side, kind, opts, pos] of o.ext || []) {
    const d = exteriorDoor(fr, y, byId[rid], side, W, D, kind, rng, opts || {}, pos ?? null);
    skip.add(d.x + ',' + d.z);
    if (opts && opts.double) {
      const [dx, dz] = side === 'front' || side === 'back' ? [1, 0] : [0, 1];
      fr.opening(d.ix + dx, y + 1, d.iz + dz, 2);
      fr.door(d.x + dx, y + 1, d.z + dz, d.f, kind, opts);
      skip.add((d.x + dx) + ',' + (d.z + dz));
    }
  }
  const over = new Set([B[o.partition || 'wall_white'], B.wall_white]);
  for (const r of rooms) {
    if (r.windows !== false) roomWindows(fr, y, r, ib, W, D, r.glass || 'glass', rng, skip, { spacing: r.wspacing || 3, pairs: r.pairs ?? true });
    if (r.wall) paintRoomWalls(fr, y, r, r.wall, H - 1, over);
  }
  return byId;
}

const R = (id, x0, z0, x1, z1, floor, wall, extra = {}) => ({ id, x0, z0, x1, z1, floor, wall, ...extra });

// ============================================================================ POLICE
export function policeStation(ctx, site, rng) {
  // building in the south part of the block (front on Main Street), parking lot north
  const bz0 = site.z1 - 27;
  const fr = Frame.fromRect(ctx, site.x0, bz0, site.x1, site.z1, 0);
  const W = fr.w, D = fr.d, H = 5, y = Y0;
  shell(fr, { W, D, floors: 1, storeyH: H, outer: 'brick_brown', inner: 'wall_white', ceiling: 'concrete' });
  flatRoof(fr, W, D, Y0 + H, 'brick_brown');
  const rooms = [
    R('armory', 2, 2, 7, 6, 'concrete', 'concrete', { windows: false }),
    R('evidence', 9, 2, 14, 6, 'concrete', 'wall_white', { windows: false }),
    R('break', 16, 2, 23, 6, 'floor_linoleum', 'wall_beige'),
    R('c1', 2, 8, 23, 8, 'floor_linoleum', 'wall_white', { windows: false }),
    R('bullpen', 2, 10, 14, 15, 'carpet_grey', 'wall_blue'),
    R('locker', 16, 10, 23, 15, 'floor_tile', 'wall_tile', { windows: false }),
    R('c2', 2, 17, 34, 17, 'floor_linoleum', 'wall_white'),
    R('chief', 2, 19, 10, 25, 'carpet_blue', 'wall_wood_panel'),
    R('lobby', 12, 19, 22, 25, 'floor_tile', 'wall_blue'),
    R('interview', 24, 19, 28, 25, 'concrete', 'wall_white', { windows: false }),
    R('records', 30, 19, 34, 25, 'carpet_grey', 'wall_white'),
    R('cells', 25, 2, 34, 15, 'concrete', 'concrete', { glass: 'iron_bars', pairs: false, wspacing: 4 }),
  ];
  const conns = [
    ['armory', 'c1', 'door', { door: 'door_metal', locked: 'key_police_armory', open: false }],
    ['evidence', 'c1', 'door', { door: 'door_metal', locked: true, open: false }],
    ['break', 'c1', 'door', {}], ['bullpen', 'c1', 'door', {}], ['locker', 'c1', 'door', {}],
    ['bullpen', 'c2', 'wide', {}], ['locker', 'c2', 'door', {}],
    ['cells', 'c2', 'door', { door: 'door_metal', open: false }],
    ['chief', 'c2', 'door', { door: 'door_wood', open: false }],
    ['lobby', 'c2', 'door', { door: 'door_metal', open: rng.chance(0.5) }],
    ['interview', 'c2', 'door', {}], ['records', 'c2', 'door', {}],
  ];
  const byId = layoutFloor(fr, y, H, rooms, conns, rng, {
    ext: [['lobby', 'front', 'door_glass', { double: true, open: true }, 16], ['break', 'back', 'door_metal', { locked: false }], ['c2', 'right', 'door_metal', { locked: true }]],
  });
  const Y = y + 1;
  // cells: concrete dividers, bars + cell doors at z=7
  for (const x of [28, 32]) fr.fill(x, Y, 2, x, Y + 3, 6, B.concrete);
  for (let x = 25; x <= 34; x++) {
    if (x === 28 || x === 32) { fr.fill(x, Y, 7, x, Y + 3, 7, B.concrete); continue; }
    for (let yy = Y; yy <= Y + 3; yy++) fr.set(x, yy, 7, B.iron_bars);
  }
  const cellDoors = [26, 30, 33];
  const prisonerCells = rng.shuffle([0, 1, 2]).slice(0, 2);
  cellDoors.forEach((x, i) => {
    const locked = prisonerCells.includes(i);
    fr.door(x, Y, 7, 0, 'door_cell', { locked, open: !locked && rng.chance(0.5) });
    const cx0 = [25, 29, 33][i];
    fr.place(cx0, Y, 2, 'bench', 0);
    fr.place(cx0 + (i === 2 ? 1 : 2), Y, 2, 'toilet', 0);
    if (locked) fr.zombies(cx0 + 1 - (i === 2 ? 1 : 0), Y, 4, 1, 0, { indoor: true, outfit: 'prisoner', types: ['walker'] });
  });
  fr.place(26, Y, 13, 'desk', 0); fr.place(26, Y, 14, 'chair', 2);
  fr.corpse(30, Y, 11, rng.range(0, 6), 'police', 'corpse_police');
  // armory
  const arm = new Room(fr, { ...byId.armory, y }, rng, { height: H - 1 });
  for (let k = 0; k < 3; k++) arm.wall('gun_cabinet', { loot: 'police_armory' });
  arm.wall('locker', { loot: 'police_armory' }); arm.wall('locker', { loot: 'police_armory' });
  arm.wall('crate_wood', { loot: 'police_armory' });
  arm.center('table');
  // evidence
  const ev = new Room(fr, { ...byId.evidence, y }, rng, { height: H - 1 });
  for (let k = 0; k < 5; k++) ev.wall('metal_shelf', { loot: 'police_evidence' });
  ev.center('cardboard_box', 0, { loot: 'police_evidence' });
  // break room
  const br = furnish(fr, { ...byId.break, y }, 'kitchen', rng, { height: H - 1 });
  br.wall('vending_machine');
  // bullpen
  const bp = new Room(fr, { ...byId.bullpen, y }, rng, { height: H - 1 });
  for (let x = 3; x <= 12; x += 3) for (let z = 11; z <= 13; z += 2) bp.tryPlace([{ x, z, block: 'desk', f: 0, loot: 'police_desk' }, { x, z: z + 1, block: 'chair', f: 2 }]);
  for (let k = 0; k < 3; k++) bp.wall('filing_cabinet', { loot: 'office' });
  bp.wall('table', { top: 'radio', access: false });
  bp.floorLoot('floor_office', 3, 0.6);
  fr.zombies(8, Y, 14, rng.int(2, 3), 2, { indoor: true, outfit: 'police' });
  // locker room
  const lk = new Room(fr, { ...byId.locker, y }, rng, { height: H - 1 });
  for (let k = 0; k < 9; k++) lk.wall('locker', { loot: 'police_locker' });
  lk.center('bench', 0); lk.center('bench', 0);
  fr.zombies(20, Y, 12, rng.int(1, 2), 1, { indoor: true, outfit: 'police' });
  // chief's office: desk with the armory key
  const ch = new Room(fr, { ...byId.chief, y }, rng, { height: H - 1 });
  ch.deskSet('desk', { loot: 'police_desk', opts: { name: "Chief Dawson's desk", fixed: [{ id: 'key_police_armory', count: 1 }, { id: 'note', count: 1, data: { noteId: 'pd_chief' } }] } });
  ctx.usedNotes.add('pd_chief');
  ch.wall('filing_cabinet', { loot: 'office' }); ch.wall('bookshelf');
  ch.wall('safe', { loot: 'safe', opts: { locked: true } });
  ch.wall('gun_cabinet', { loot: 'police_armory', opts: { locked: true } });
  ch.wall('couch', {});
  // lobby: front desk counter
  const L = byId.lobby;
  for (let x = L.x0; x <= L.x1; x++) {
    if (x === L.x0 + 1) continue;
    fr.container(x, Y, 21, 'bar_counter', 0, x === L.x0 + 4 ? 'police_desk' : null);
  }
  fr.door(L.x0 + 1, Y, 21, 0, 'door_wood', { locked: false, open: true });
  fr.place(L.x0 + 6, Y + 1, 21, 'radio', 0);
  fr.place(L.x0 + 3, Y, 19, 'desk', 0); fr.place(L.x0 + 3, Y, 20, 'chair', 2);
  const lb = new Room(fr, { ...L, z0: 22, y }, rng, { height: H - 1 });
  lb.wall('bench'); lb.wall('bench'); lb.wall('vending_machine'); lb.wall('trash_can', { access: false });
  fr.corpse(18, Y, 23, rng.range(0, 6), 'police', 'corpse_police');
  fr.note(14, Y, 23, 'pd_bulletin');
  ctx.usedNotes.add('pd_bulletin');
  fr.zombies(17, Y, 24, rng.int(1, 2), 2, { indoor: true, outfit: rng.pick(['civilian', 'civilian_f']) });
  // interview + records
  const iv = new Room(fr, { ...byId.interview, y }, rng, { height: H - 1 });
  iv.tableSet(1, 1, 2);
  const rc = new Room(fr, { ...byId.records, y }, rng, { height: H - 1 });
  for (let k = 0; k < 6; k++) rc.wall('filing_cabinet', { loot: 'office' });
  rc.deskSet('desk', { loot: 'police_desk' });
  fr.note(32, Y, 21, 'pd_incident');
  ctx.usedNotes.add('pd_incident');
  // sign + awning
  fr.signCentered(10, 26, Y + 3, D, 'MILLBROOK POLICE', 0);
  for (let x = 13; x <= 21; x++) fr.place(x, Y + 2, D, 'awning_blue');
  // parking lot behind (north)
  const lot = Frame.fromRect(ctx, site.x0, site.z0, site.x1, bz0 - 2, 0);
  lot.fill(0, Y0, 0, lot.w - 1, Y0, lot.d - 1, B.asphalt);
  for (let x = 2; x < lot.w - 2; x += 4) for (const z of [1, 2, 3, lot.d - 4, lot.d - 3, lot.d - 2]) lot.set(x, Y0, z, B.parking_line_z);
  for (let x = 0; x < lot.w; x++) if (x < 14 || x > 18) lot.place(x, Y0 + 1, 0, 'fence_chainlink', 0);
  for (let z = 0; z < lot.d; z++) lot.place(0, Y0 + 1, z, 'fence_chainlink', 1);
  let nc = 0;
  for (let x = 4; x < lot.w - 3 && nc < 6; x += 4) {
    if (rng.chance(0.25)) continue;
    const ok = lot.vehicle(x, 3.2, 0, 'police', { color: 0x1a1a2a, loot: 'police_car_trunk', gloveLoot: 'car_glovebox', alarm: rng.chance(0.3), wrecked: rng.chance(0.15) });
    if (ok) nc++;
  }
  lot.vehicle(lot.w - 6, lot.d - 3.5, Math.PI, 'van', { color: 0xf0f0f0, loot: 'police_car_trunk' });
  lot.vehicle(10, lot.d - 3.5, Math.PI + 0.1, 'police', { color: 0x1a1a2a, loot: 'police_car_trunk', burned: true, wrecked: true });
  if (ctx.debugLabels) ctx.reachChecks.push({ name: 'police', start: [fr.wx(16, D), Y, fr.wz(16, D)], targets: [[fr.wx(4, 4), Y, fr.wz(4, 4), 'armory'], [fr.wx(30, 10), Y, fr.wz(30, 10), 'cell block'], [fr.wx(5, 22), Y, fr.wz(5, 22), 'chief'], [fr.wx(12, 4), Y, fr.wz(12, 4), 'evidence'], [fr.wx(20, 12), Y, fr.wz(20, 12), 'lockers']], fuzzy: true });
  fr.zone(-1, -18, W, D, ZONES.POLICE);
  ctx.addPOI({ name: 'Millbrook Police Department', type: 'police', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.building('police_station');
  ctx.planViews.push({ name: 'police', x0: site.x0 - 2, z0: site.z0 - 2, x1: site.x1 + 2, z1: site.z1 + 4, y: Y0 + 1, s: 12 });
  ctx.sectionViews.push({ name: 'police-z', axis: 'z', c: site.x0 + 18, a0: site.z0 - 5, a1: site.z1 + 10, y0: 14, y1: 32, s: 8 });
}

// ============================================================================ FIRE STATION
export function fireStation(ctx, site, rng) {
  const bz0 = site.z1 - 29;
  const fr = Frame.fromRect(ctx, site.x0, bz0, site.x1, site.z1, 0);
  const W = fr.w, D = fr.d, H = 6, y = Y0;
  shell(fr, { W, D, floors: 1, storeyH: H, outer: 'brick_red', inner: 'wall_white', ceiling: 'concrete' });
  flatRoof(fr, W, D, Y0 + H, 'brick_red');
  const rooms = [
    R('bay', 2, 2, 17, D - 3, 'concrete', 'concrete', { windows: false }),
    R('office', 19, D - 8, W - 3, D - 3, 'carpet_grey', 'wall_beige'),
    R('hall', 19, D - 10, W - 3, D - 10, 'floor_linoleum', 'wall_white'),
    R('day', 19, D - 18, W - 3, D - 12, 'floor_wood', 'wall_beige'),
    R('dorm', 19, 2, W - 3, D - 20, 'carpet_blue', 'wall_white'),
  ];
  const conns = [['office', 'hall', 'door'], ['day', 'hall', 'open'], ['bay', 'hall', 'door'], ['dorm', 'day', 'door'], ['bay', 'day', 'door']];
  const byId = layoutFloor(fr, y, H, rooms, conns, rng, { ext: [['office', 'front', 'door_glass', {}, null], ['bay', 'back', 'door_metal', {}]] });
  const Y = y + 1;
  // two apparatus doors
  for (const x0 of [4, 11]) {
    for (let x = x0; x < x0 + 4; x++) for (let yy = Y; yy <= Y + 3; yy++) { fr.clear(x, yy, D - 1, B.garage_door); fr.clear(x, yy, D - 2, 0); }
    for (let x = x0; x < x0 + 4; x++) fr.markOpening(x, Y, D - 2);
  }
  fr.vehicle(6, D / 2, 0, 'firetruck', { color: 0xb01010, loot: 'fire_station' });
  fr.vehicle(13, D / 2 + 2, 0, 'ambulance', { color: 0xf0f0f0, loot: 'ambulance' });
  const bay = new Room(fr, { ...byId.bay, y }, rng, { height: H - 1 });
  for (let k = 0; k < 7; k++) bay.wall('locker', { loot: 'fire_station' });
  bay.wall('metal_shelf', { loot: 'fire_station' }); bay.wall('metal_shelf', { loot: 'fire_station' });
  const s = bay.wall('workbench'); bay.mountAbove(s, 'toolbox');
  fr.zombies(9, Y, 6, rng.int(1, 2), 2, { indoor: true, outfit: 'firefighter' });
  furnish(fr, { ...byId.office, y }, 'office', rng, { height: H - 1 });
  const day = new Room(fr, { ...byId.day, y }, rng, { height: H - 1 });
  day.run(['fridge', 'kitchen_cabinet', 'stove', 'kitchen_sink', 'kitchen_cabinet']);
  day.tableSet(2, 1, 4); day.livingSet(2, 'couch');
  const dm = new Room(fr, { ...byId.dorm, y }, rng, { height: H - 1 });
  for (let k = 0; k < 6; k++) dm.bed(false);
  for (let k = 0; k < 3; k++) dm.wall('locker', { loot: 'fire_station' });
  fr.zombies(24, Y, 6, rng.int(1, 2), 1, { indoor: true, outfit: 'firefighter' });
  fr.note(22, Y, D - 15, 'fire_log');
  ctx.usedNotes.add('fire_log');
  fr.signCentered(2, 17, Y + 4, D, 'FIRE DEPT', 0);
  fr.signCentered(19, W - 3, Y + 3, D, 'STATION 1', 0);
  // apron + yard behind
  for (let x = 3; x <= 15; x++) for (let z = D; z <= D + 3; z++) if (fr.get(x, Y0, z) === B.grass || fr.get(x, Y0, z) === B.sidewalk) fr.set(x, Y0, z, B.concrete);
  const yard = Frame.fromRect(ctx, site.x0, site.z0, site.x1, bz0 - 2, 0);
  yard.fill(0, Y0, 0, yard.w - 1, Y0, yard.d - 1, B.concrete);
  for (let k = 0; k < 4; k++) yard.place(3 + k * 2, Y0 + 1, 3, 'barrel_rust');
  yard.vehicle(yard.w - 8, yard.d / 2, Math.PI / 2, 'pickup', { color: 0xb01010, loot: 'pickup_bed' });
  fr.zone(-1, -16, W, D, ZONES.DOWNTOWN);
  ctx.addPOI({ name: 'Millbrook Fire Department', type: 'fire', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.building('fire_station');
}

// ============================================================================ TOWN HALL
export function townHall(ctx, site, rng) {
  const W = 31, D = 24;
  const x0 = site.x0 + 2, z0 = site.z1 - 6 - D + 1;
  const fr = Frame.fromRect(ctx, x0, z0, x0 + W - 1, z0 + D - 1, 0);
  const H = 5, y = Y0;
  shell(fr, { W, D, floors: 2, storeyH: H, outer: 'stone_brick', inner: 'wall_white', ceiling: 'concrete', slab: 'concrete' });
  flatRoof(fr, W, D, Y0 + 2 * H, 'stone_brick', { parapetH: 1 });
  const cx = Math.floor(W / 2);
  // ground: central hall + stairwell at the back centre
  const g = [
    R('hall', cx - 2, 2, cx + 2, D - 3, 'floor_checker', 'wall_beige'),
    R('clerk', 2, 12, cx - 4, D - 3, 'carpet_red', 'wall_beige'),
    R('records', 2, 2, cx - 4, 10, 'carpet_grey', 'wall_white'),
    R('council', cx + 4, 2, W - 3, D - 3, 'floor_wood', 'wall_wood_panel'),
  ];
  const byG = layoutFloor(fr, y, H, g, [['clerk', 'hall', 'wide'], ['records', 'hall', 'door'], ['council', 'hall', 'door', { door: 'door_wood' }], ['records', 'clerk', 'door']], rng, {
    ext: [['hall', 'front', 'door_wood', { double: true }, cx - 1], ['hall', 'back', 'door_metal', { locked: true }, cx + 1]],
  });
  const u = [
    R('hall', cx - 2, 2, cx + 2, D - 3, 'carpet_red', 'wall_beige'),
    R('mayor', 2, 12, cx - 4, D - 3, 'carpet_blue', 'wall_wood_panel'),
    R('office2', 2, 2, cx - 4, 10, 'carpet_grey', 'wall_white'),
    R('office3', cx + 4, 12, W - 3, D - 3, 'carpet_grey', 'wall_white'),
    R('storage', cx + 4, 2, W - 3, 10, 'concrete', 'wall_white'),
  ];
  const byU = layoutFloor(fr, y + H, H, u, [['mayor', 'hall', 'door', { door: 'door_wood' }], ['office2', 'hall', 'door'], ['office3', 'hall', 'door'], ['storage', 'hall', 'door', { locked: true }]], rng);
  // straight staircase along the hall's left column (wide hall): from z=D-4 going back
  const sx = cx - 2;
  for (let s = 1; s <= H; s++) {
    const z = D - 4 - s;
    fr.clear(sx, y + s, z, 0); fr.place(sx, y + s, z, 'stairs_wood', 0);
    for (let yy = y + 1; yy < y + s; yy++) fr.set(sx, yy, z, B.wall_beige);
    if (s >= H - 3 && s < H) fr.clear(sx, y + H, z, 0);
  }
  // second flight to the roof hatch: ladder at the back of the upper hall
  for (let yy = y + H + 1; yy <= y + 2 * H; yy++) fr.clear(cx + 2, yy, 2, 0);
  for (let yy = y + H + 1; yy <= y + 2 * H; yy++) fr.place(cx + 2, yy, 2, 'ladder', 0);
  fr.clear(cx + 2, y + 2 * H, 2, 0); fr.place(cx + 2, y + 2 * H, 2, 'ladder', 0);
  const Y = y + 1;
  // clerk counter
  const ck = byG.clerk;
  for (let x = ck.x0; x <= ck.x1 - 1; x++) fr.place(x, Y, ck.z0 + 3, 'bar_counter', 0);
  const ckr = new Room(fr, { ...ck, z0: ck.z0, z1: ck.z0 + 2, y }, rng, { height: H - 1 });
  ckr.wall('desk', { loot: 'office' }); ckr.wall('filing_cabinet', { loot: 'office' });
  const rec = new Room(fr, { ...byG.records, y }, rng, { height: H - 1 });
  for (let k = 0; k < 8; k++) rec.wall('filing_cabinet', { loot: 'office' });
  rec.center('table');
  // council chamber: pews facing the dais at the back
  const co = byG.council;
  for (let z = co.z0 + 4; z <= co.z1 - 1; z += 2) for (let x = co.x0 + 1; x <= co.x1 - 1; x++) if (x !== Math.floor((co.x0 + co.x1) / 2)) fr.place(x, Y, z, 'pew', 2);
  for (let x = co.x0 + 1; x <= co.x1 - 1; x++) fr.place(x, Y, co.z0 + 1, 'desk', 0);
  fr.place(co.x0 + 3, Y, co.z0, 'chair', 0);
  fr.note(co.x0 + 4, Y + 1, co.z0 + 1, 'townhall_minutes', -0.15);
  ctx.usedNotes.add('townhall_minutes');
  fr.zombies(co.x0 + 4, Y, co.z1 - 2, rng.int(2, 4), 2, { indoor: true, outfit: rng.pick(['office', 'civilian']) });
  const my = furnish(fr, { ...byU.mayor, y: y + H }, 'office', rng, { height: H - 1 });
  my.wall('gun_cabinet', { loot: 'gun_cabinet' });
  furnish(fr, { ...byU.office2, y: y + H }, 'office', rng, { height: H - 1 });
  furnish(fr, { ...byU.office3, y: y + H }, 'office', rng, { height: H - 1 });
  const stg = new Room(fr, { ...byU.storage, y: y + H }, rng, { height: H - 1 });
  for (let k = 0; k < 6; k++) stg.wall(rng.pick(['cardboard_box', 'metal_shelf', 'crate_wood']), { loot: rng.chance(0.5) ? 'fema_supply' : 'office' });
  fr.note(cx + 6, y + H + 1, 4, 'mayor_order');
  ctx.usedNotes.add('mayor_order');
  // portico: columns + slab roof over the steps
  for (const x of [cx - 4, cx - 2, cx + 2, cx + 4]) for (let yy = Y; yy <= Y + 4; yy++) fr.set(x, yy, D + 2, B.stone_brick);
  for (let x = cx - 5; x <= cx + 5; x++) for (let z = D; z <= D + 3; z++) { fr.set(x, Y0, z, B.stone_brick); fr.set(x, Y + 5, z, B.slab_concrete); }
  fr.signCentered(cx - 7, cx + 7, Y + 6, D + 3, 'TOWN HALL', 0);
  // flagpole + lawn
  for (let yy = Y; yy <= Y + 9; yy++) fr.set(cx + 8, yy, D + 4, B.street_pole);
  if (ctx.debugLabels) ctx.reachChecks.push({ name: 'town hall', start: [fr.wx(cx, D + 1), Y, fr.wz(cx, D + 1)], targets: [[fr.wx(cx, 8), y + H + 1, fr.wz(cx, 8), 'upper hall'], [fr.wx(cx + 1, 3), y + 2 * H + 1, fr.wz(cx + 1, 3), 'roof']], fuzzy: true });
  fr.zone(-2, -2, W + 1, D + 5, ZONES.DOWNTOWN);
  const sx0 = site.x0, sz0 = site.z0;
  for (let x = sx0; x <= site.x1; x++) for (let z = sz0; z < z0 - 1; z++) if (ctx.world.get(x, Y0, z) === B.grass && ((x + z) % 9 === 0)) ctx.world.set(x, Y0 + 1, z, B.tall_grass);
  // parking behind
  for (let x = sx0 + 2; x <= site.x1 - 2; x++) for (let z = sz0 + 1; z <= z0 - 3; z++) ctx.world.set(x, Y0, z, (x - sx0) % 4 === 0 && z < sz0 + 5 ? B.parking_line_z : B.asphalt);
  ctx.addVehicle({ type: 'sedan', x: sx0 + 6, y: Y0 + 1, z: sz0 + 4, yaw: Math.PI, color: 0x222222, loot: 'car_trunk', gloveLoot: 'car_glovebox' });
  ctx.addPOI({ name: 'Millbrook Town Hall', type: 'civic', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.building('town_hall');
}

// ============================================================================ FOODLAND
export function foodland(ctx, site, rng) {
  // building at the south of the block, front facing north (Main Street) over the parking lot
  const D = 28, W = site.x1 - site.x0 + 1;
  const bz0 = site.z1 - D + 1;
  const fr = Frame.fromRect(ctx, site.x0, bz0, site.x1, site.z1, 2);
  const H = 6, y = Y0;
  shell(fr, { W, D, floors: 1, storeyH: H, outer: 'brick_white', inner: 'wall_white', ceiling: 'concrete' });
  flatRoof(fr, W, D, Y0 + H, 'brick_white');
  for (let x = 0; x < W; x++) for (let yy = Y0 + H + 1; yy <= Y0 + H + 2; yy++) fr.set(x, yy, D - 1, B.brick_white);
  const rooms = [
    R('store', 2, 8, W - 3, D - 3, 'floor_tile', 'wall_white', { windows: false }),
    R('storage', 2, 2, W - 12, 6, 'concrete', 'concrete', { windows: false }),
    R('office', W - 10, 2, W - 3, 6, 'carpet_grey', 'wall_beige', { windows: false }),
  ];
  const byId = layoutFloor(fr, y, H, rooms, [['storage', 'store', 'door', { door: 'door_white' }], ['office', 'store', 'door', { door: 'door_wood', locked: true }], ['office', 'storage', 'door']], rng, {
    ext: [['storage', 'back', 'door_metal', { locked: true }, 6]],
  });
  const Y = y + 1;
  const S = byId.store;
  // glass front + two entrances
  for (let x = 1; x <= W - 2; x++) {
    for (let yy = Y; yy <= Y + 2; yy++) { fr.clear(x, yy, D - 2, x === 1 || x === W - 2 ? B.wall_white : 0); fr.clear(x, yy, D - 1, x % 7 === 0 ? B.brick_white : B.glass_shop); }
  }
  fr.fill(2, y, D - 2, W - 3, y, D - 2, B.floor_tile);
  for (const dx of [8, 9, W - 10, W - 9]) { fr.door(dx, Y, D - 1, 0, 'door_glass', { open: rng.chance(0.5) }); fr.markOpening(dx, Y, D - 2); }
  // loading dock door
  for (let x = 12; x <= 15; x++) for (let yy = Y; yy <= Y + 2; yy++) { fr.clear(x, yy, 0, B.garage_door); fr.clear(x, yy, 1, 0); }
  // checkout lanes
  for (let x = 12; x <= W - 13; x += 3) checkouts(fr, [x], D - 6, Y, rng, null);
  // aisles
  aisles(fr, 4, 11, W - 6, D - 9, Y, ['store_shelf', 'store_shelf', 'store_shelf_misc', 'store_shelf_empty', 'store_shelf'], null, { gap: true, step: 4 });
  // coolers / freezers along the back wall of the store and the sides
  for (let x = S.x0; x <= S.x1; x++) if (fr.canPlace(x, Y, S.z0)) fr.place(x, Y, S.z0, x % 3 === 0 ? 'freezer' : 'cooler', 0);
  for (let z = S.z0 + 2; z <= D - 9; z++) {
    if (fr.canPlace(S.x0, Y, z)) fr.container(S.x0, Y, z, 'crate_wood', 3, 'store_food');
    if (fr.canPlace(S.x1, Y, z)) fr.place(S.x1, Y, z, z % 2 ? 'cooler' : 'store_shelf', 1);
  }
  // deli counter
  for (let x = S.x1 - 7; x <= S.x1 - 2; x++) fr.container(x, Y, S.z0 + 2, 'bar_counter', 0, 'diner_kitchen');
  // storage + office
  const st = new Room(fr, { ...byId.storage, y }, rng, { height: H - 1 });
  for (let k = 0; k < 10; k++) st.wall(rng.pick(['metal_shelf', 'crate_wood', 'cardboard_box', 'metal_shelf']), { loot: rng.pick(['store_food', 'warehouse', 'store_general', 'store_drinks']) });
  for (let k = 0; k < 4; k++) st.center(rng.pick(['pallet', 'cardboard_box', 'crate_wood']), 0, { loot: 'store_food' });
  const of = new Room(fr, { ...byId.office, y }, rng, { height: H - 1 });
  of.deskSet('desk', { loot: 'office' }); of.wall('safe', { loot: 'safe', opts: { locked: true } }); of.wall('filing_cabinet');
  fr.note(W - 7, Y, 4, 'foodland_memo');
  ctx.usedNotes.add('foodland_memo');
  // shoppers and staff
  fr.zombies(Math.floor(W / 2), Y, 15, rng.int(3, 4), 5, { indoor: true });
  fr.zombies(8, Y, D - 7, rng.int(2, 3), 3, { indoor: true, outfit: 'worker' });
  fr.zombies(10, Y, 4, rng.int(1, 2), 2, { indoor: true, outfit: 'worker' });
  for (let k = 0; k < 6; k++) fr.loot(rng.int(5, W - 6), Y, rng.int(10, D - 8), 'floor_store', 0.6);
  fr.corpse(W - 14, Y, D - 5, rng.range(0, 6), 'civilian_f', 'corpse_civilian');
  fr.signCentered(4, W - 5, Y + 4, D, 'FOODLAND', 0);
  for (let x = 4; x <= W - 5; x++) fr.place(x, Y + 3, D, 'awning_green');
  // parking lot (in front = local z >= D)
  const lot = Frame.fromRect(ctx, site.x0, site.z0, site.x1, bz0 - 1, 2);
  lot.fill(0, Y0, 0, lot.w - 1, Y0, lot.d - 1, B.asphalt);
  for (let x = 1; x < lot.w - 1; x++) {
    for (let z = 0; z < lot.d; z++) {
      const r = ctx.world.get(lot.wx(x, z), Y0, lot.wz(x, z));
      if (r !== B.asphalt) continue;
      if ((z === 3 || z === 4 || z === 10 || z === 11) && x % 3 === 0) lot.set(x, Y0, z, B.parking_line_z);
      if (((x * 31 + z * 17) % 23) === 0) lot.set(x, Y0, z, B.asphalt_cracked);
    }
  }
  for (let x = 2; x < lot.w - 2; x += 3) {
    for (const z of [2.2, 12.8]) {
      if (rng.chance(0.25)) lot.vehicle(x + 1.5, z, z < 5 ? 0 : Math.PI, rng.weighted([['sedan', 4], ['suv', 3], ['pickup', 2], ['hatchback', 2], ['van', 1]]), { color: rng.pick(CAR_COLORS), loot: 'car_trunk', gloveLoot: 'car_glovebox', alarm: rng.chance(0.15), wrecked: rng.chance(0.1) });
    }
  }
  lot.place(2, Y0 + 1, lot.d - 1, 'trash_can');
  ctx.world.placeContainer(site.x0 + 3, Y0 + 1, site.z1 + 2, 'dumpster', 0);
  fr.zone(-1, -1, W, D + 20, ZONES.COMMERCIAL);
  ctx.addPOI({ name: 'Foodland Supermarket', type: 'store', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.building('supermarket');
  ctx.planViews.push({ name: 'supermarket', x0: site.x0 - 2, z0: site.z0 - 2, x1: site.x1 + 2, z1: site.z1 + 3, y: Y0 + 1, s: 10 });
}

// ============================================================================ VETERANS PARK
export function veteransPark(ctx, site, rng) {
  const { world } = ctx;
  const fr = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1, 0);
  const W = fr.w, D = fr.d;
  const cx = Math.floor(W / 2), cz = Math.floor(D / 2);
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    const onPath = Math.abs(x - cx) <= 1 || Math.abs(z - cz) <= 1 || Math.abs((x - cx) - (z - cz)) <= 0 && Math.abs(x - cx) < 10;
    fr.set(x, Y0, z, onPath ? B.gravel : B.grass);
  }
  // gazebo
  for (let x = cx - 3; x <= cx + 3; x++) for (let z = cz - 3; z <= cz + 3; z++) fr.set(x, Y0, z, B.planks_oak);
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, -3], [0, 3], [-3, 0], [3, 0]]) for (let yy = Y0 + 1; yy <= Y0 + 3; yy++) fr.set(cx + dx, yy, cz + dz, B.fence_post);
  for (let x = cx - 4; x <= cx + 4; x++) for (let z = cz - 4; z <= cz + 4; z++) fr.set(x, Y0 + 4, z, B.roof_red_slab);
  for (let x = cx - 2; x <= cx + 2; x++) for (let z = cz - 2; z <= cz + 2; z++) fr.set(x, Y0 + 5, z, B.roof_red_slab);
  // the National Guard evacuation point that failed: tents, sandbags, crates, corpses
  for (let k = 0; k < 3; k++) {
    const tx = 3 + k * 5, tz = 3;
    for (let x = tx; x < tx + 3; x++) for (let z = tz; z < tz + 3; z++) { fr.set(x, Y0 + 1, z, B.tent_white); if (x === tx + 1) fr.set(x, Y0 + 2, z, B.tent_white); }
    fr.clear(tx + 1, Y0 + 1, tz + 2, 0);
    fr.container(tx + 1, Y0 + 1, tz + 1, 'crate_military', 0, 'fema_supply');
  }
  for (let x = W - 10; x < W - 2; x++) fr.set(x, Y0 + 1, D - 8, B.sandbags);
  fr.container(W - 6, Y0 + 1, D - 6, 'crate_military', 0, 'fema_supply');
  fr.container(W - 5, Y0 + 1, D - 6, 'cardboard_box', 0, 'fema_supply');
  fr.vehicle(W - 5, D - 14, Math.PI / 2, 'bus', { color: 0xe0b020, wrecked: true, loot: 'car_trunk' });
  for (let k = 0; k < 4; k++) fr.corpse(rng.int(3, W - 4), Y0 + 1, rng.int(6, D - 4), rng.range(0, 6.28), rng.pick(['civilian', 'civilian_f', 'military']), rng.chance(0.3) ? 'corpse_military' : 'corpse_civilian');
  fr.note(cx + 1, Y0 + 1, cz + 1, 'evac_flyer');
  ctx.usedNotes.add('evac_flyer');
  fr.zombies(cx, Y0 + 1, cz + 6, rng.int(4, 6), 5, {});
  // memorial
  fr.set(cx, Y0 + 1, D - 3, B.stone_brick); fr.set(cx, Y0 + 2, D - 3, B.stone_brick); fr.place(cx, Y0 + 3, D - 3, 'gravestone', 0);
  // benches + trees + lamps
  for (const [x, z, f] of [[cx - 2, 6, 3], [cx + 2, 8, 1], [cx - 2, D - 7, 3], [cx + 2, D - 9, 1], [6, cz - 2, 0], [W - 7, cz + 2, 2]]) if (fr.get(x, Y0 + 1, z) === 0) fr.place(x, Y0 + 1, z, 'bench', f);
  for (const [x, z] of [[2, D - 3], [W - 3, 2], [W - 3, D - 3], [2, cz + 6], [W - 4, cz - 6], [8, D - 4], [W - 9, 2]]) if (fr.get(x, Y0 + 1, z) === 0) tree(world, fr.wx(x, z), Y0 + 1, fr.wz(x, z), 'oak', 0.8, ctx.seed);
  fr.place(cx + 3, Y0 + 1, cz + 5, 'trash_can');
  fr.zone(0, 0, W - 1, D - 1, ZONES.PARK);
  ctx.addPOI({ name: 'Veterans Park', type: 'park', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.building('park');
}

// ============================================================================ GAS STATION
export function gasStation(ctx, site, front, name, rng, o = {}) {
  const fr = Frame.fromRect(ctx, site.x0, site.z0, site.x1, site.z1, front);
  const W = fr.w, D = fr.d, Y = Y0 + 1;
  fr.fill(0, Y0, 0, W - 1, Y0, D - 1, B.concrete);
  // store at the back
  const sw = Math.min(W - 4, 18), sd = 12;
  const sx0 = Math.floor((W - sw) / 2);
  const sf = fr.sub(sx0, 1, sw, sd);
  shell(sf, { W: sw, D: sd, floors: 1, storeyH: 5, outer: o.outer || 'brick_white', inner: 'wall_white', ceiling: 'concrete' });
  flatRoof(sf, sw, sd, Y0 + 5, o.outer || 'brick_white');
  const rooms = [R('shop', 2, 4, sw - 3, sd - 3, 'floor_linoleum', 'wall_white', { windows: false }), R('back', 2, 2, sw - 7, 2, 'concrete', 'wall_white', { windows: false }), R('wc', sw - 5, 2, sw - 3, 2, 'floor_tile', 'wall_tile', { windows: false })];
  const byId = layoutFloor(sf, Y0, 5, rooms, [['back', 'shop', 'door'], ['wc', 'shop', 'door']], rng, { ext: [['back', 'back', 'door_metal', { locked: true }]] });
  for (let x = 1; x <= sw - 2; x++) for (let yy = Y; yy <= Y + 2; yy++) { sf.clear(x, yy, sd - 1, x % 5 === 0 ? id(o.outer || 'brick_white') : B.glass_shop); sf.clear(x, yy, sd - 2, x === 1 || x === sw - 2 ? B.wall_white : 0); }
  sf.fill(2, Y0, sd - 2, sw - 3, Y0, sd - 2, B.floor_linoleum);
  const dx = Math.floor(sw / 2);
  sf.door(dx, Y, sd - 1, 0, 'door_glass', { open: rng.chance(0.4) }); sf.markOpening(dx, Y, sd - 2);
  const S = byId.shop;
  aisles(sf, 4, S.z0 + 1, sw - 6, S.z1 - 2, Y, ['store_shelf', 'store_shelf_misc', 'store_shelf_empty'], (x) => (x % 2 ? 'gas_station' : null), { step: 4 });
  for (let x = S.x0; x <= S.x1; x++) if (sf.canPlace(x, Y, S.z0)) sf.place(x, Y, S.z0, 'cooler', 0);
  checkouts(sf, [S.x1 - 1], S.z1 - 1, Y, rng, 'gas_station');
  sf.place(S.x0, Y, S.z1 - 1, 'vending_machine', 3);
  const back = new Room(sf, { ...byId.back, y: Y0 }, rng, { height: 4 });
  back.wall('metal_shelf', { loot: 'gas_station' }); back.wall('cardboard_box', { loot: 'gas_station' });
  furnish(sf, { ...byId.wc, y: Y0 }, 'halfbath', rng, { height: 4 });
  sf.signCentered(1, sw - 2, Y + 3, sd, name.slice(0, sw - 2), 0);
  sf.zombies(dx, Y, S.z0 + 2, rng.int(1, 2), 2, { indoor: true, outfit: 'worker' });
  // canopy + pumps in front
  const cz0 = sd + 3, cz1 = D - 4;
  const cx0 = 2, cx1 = W - 3;
  if (cz1 > cz0 + 3) {
    for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) fr.set(x, Y + 4, z, B.slab_concrete);
    for (let x = cx0; x <= cx1; x++) for (const z of [cz0, cz1]) fr.set(x, Y + 4, z, B.metal_wall);
    const pz = Math.floor((cz0 + cz1) / 2);
    for (let x = cx0 + 3; x <= cx1 - 3; x += 6) {
      for (let yy = Y; yy <= Y + 3; yy++) fr.set(x, yy, pz, B.concrete);
      fr.place(x, Y, pz - 1, 'gas_pump', 2); fr.place(x, Y, pz + 1, 'gas_pump', 0);
    }
    fr.signCentered(cx0, cx1, Y + 4, cz1 + 1, name.slice(0, cx1 - cx0 + 1), 0);
    // cars at the pumps
    for (let x = cx0 + 6; x <= cx1 - 2; x += 6) {
      if (rng.chance(0.55)) fr.vehicle(x, pz - 3, Math.PI / 2, rng.weighted([['sedan', 3], ['pickup', 3], ['suv', 2], ['van', 1]]), { color: rng.pick(CAR_COLORS), loot: 'car_trunk', gloveLoot: 'car_glovebox', burned: rng.chance(0.15), wrecked: rng.chance(0.2) });
      if (rng.chance(0.4)) fr.vehicle(x, pz + 3, -Math.PI / 2, rng.weighted([['sedan', 3], ['hatchback', 2], ['suv', 2]]), { color: rng.pick(CAR_COLORS), loot: 'car_trunk', gloveLoot: 'car_glovebox' });
    }
  }
  // dumpster + propane cage
  fr.place(1, Y, 2, 'dumpster'); fr.place(W - 2, Y, 2, 'barrel_rust'); fr.place(W - 2, Y, 3, 'barrel_rust');
  fr.zone(0, 0, W - 1, D - 1, ZONES.GAS);
  if (o.poi !== false) ctx.addPOI({ name: o.poiName || name, type: 'gas', x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1 });
  ctx.building('gas_station');
  return fr;
}
