// Downtown commercial buildings: brick storefronts (1-4 storeys) with shop interiors, back rooms, alleys,
// stairwells to apartments / offices upstairs, flat roofs with roof access.
import { B, BLOCKS } from '../blocks.js';
import { SURFACE } from '../World.js';
import { shell, carvePlan, connect, connectAny, exteriorDoor, roomWindows, paintRoomWalls, flatRoof, stairwell, id } from './building.js';
import { Room, furnish } from './furnish.js';

const Y0 = SURFACE;
export const SH = 5; // commercial storey height

/** Rows of shelves (double sided) in a rect. Shelves run along local z, facing +x / -x alternately. */
export function aisles(fr, x0, z0, x1, z1, y, blocks, loot, o = {}) {
  const pick = (k) => (Array.isArray(blocks) ? blocks[k % blocks.length] : blocks);
  let n = 0;
  const step = o.step || 4; // shelf pair + 2 aisle
  for (let x = x0; x + 1 <= x1; x += step) {
    for (let z = z0; z <= z1; z++) {
      if (o.gap && (z === Math.floor((z0 + z1) / 2))) continue;
      const b = pick(n++);
      for (const [xx, f] of [[x, 1], [x + 1, 3]]) {
        if (fr.get(xx, y, z) !== 0) continue;
        const tbl = typeof loot === 'function' ? loot(xx, z) : loot;
        if (tbl) fr.container(xx, y, z, b, f, tbl); else fr.place(xx, y, z, b, f);
        if (o.tall && fr.get(xx, y + 1, z) === 0) { if (tbl) fr.container(xx, y + 1, z, b, f, tbl); else fr.place(xx, y + 1, z, b, f); }
      }
    }
  }
}

/** checkout counters with registers, facing local +z (customers come from the front) */
export function checkouts(fr, xs, z, y, rng, loot = null) {
  for (const x of xs) {
    if (loot) fr.container(x, y, z, 'checkout', 0, loot); else fr.place(x, y, z, 'checkout', 0);
    fr.place(x, y + 1, z, 'cash_register', 0);
  }
}

/**
 * Generic storefront building in frame fr (front = +z). spec:
 *  {kind, sign, floors, outer, inner, awning, upper, floorMat, door, rearDoor, locked, loot:{}}
 * Returns {S (shop room rect), back (back room rect), y, topY, H}.
 */
export function storefront(ctx, fr, spec, rng) {
  const W = fr.w, D = fr.d, H = SH;
  const floors = spec.floors || 1;
  const outer = spec.outer || 'brick_red';
  const inner = spec.inner || 'wall_white';
  const sh = shell(fr, { W, D, floors, storeyH: H, outer, inner, ceiling: 'concrete', slab: 'concrete', foundation: 'concrete' });
  const topY = sh.topY;
  const y = Y0;
  // flat roof + parapet (false front on 1-storey shops)
  flatRoof(fr, W, D, topY, outer, { parapetH: 1 });
  if (floors === 1) fr.fill(0, topY + 1, D - 1, W - 1, topY + 2, D - 1, id(outer));
  const multi = floors > 1;
  const zb = spec.backDepth ? 2 + spec.backDepth : Math.max(multi ? 9 : 6, Math.floor(D * 0.3));
  const S = { x0: 2, z0: zb + 1, x1: W - 3, z1: D - 2, y };
  const back = { x0: 2, z0: 2, x1: W - 3, z1: zb - 1, y };
  S.floor = spec.floorMat || rng.pick(['floor_linoleum', 'floor_tile', 'floor_checker', 'floor_wood']);
  back.floor = 'concrete';
  carvePlan(fr, y, [S, back], inner, H - 1, { x0: 2, z0: 2, x1: W - 3, z1: D - 3 });
  // storefront glass: outer ring front, inner ring opened
  const doorX = spec.doorX ?? Math.floor(W / 2);
  for (let x = 1; x <= W - 2; x++) {
    for (let yy = y + 1; yy <= y + 3; yy++) fr.clear(x, yy, D - 2, x === 1 || x === W - 2 ? id(inner) : 0);
    const pillar = (x % 6 === 0 && Math.abs(x - doorX) > 1);
    for (let yy = y + 1; yy <= y + 3; yy++) fr.clear(x, yy, D - 1, pillar ? id(outer) : id(spec.glass || 'glass_shop'));
  }
  fr.fill(2, y, D - 2, W - 3, y, D - 2, id(S.floor));
  fr.door(doorX, y + 1, D - 1, 0, spec.door || 'door_glass', { locked: spec.locked, open: !spec.locked && rng.chance(0.3) });
  fr.markOpening(doorX, y + 1, D - 2);
  if (spec.door2) { fr.door(doorX + 1, y + 1, D - 1, 0, spec.door || 'door_glass', { locked: spec.locked }); }
  // partition door between shop and back
  connect(fr, y, S, back, 'door', rng, { door: spec.backDoor || 'door_white', locked: spec.backLocked, open: false });
  // rear exit
  const rx = multi ? rng.int(10, Math.max(10, W - 4)) : rng.int(W - 6, W - 4);
  if (!spec.noRear) exteriorDoor(fr, y, back, 'back', W, D, 'door_metal', rng, { locked: rng.chance(0.6) }, rx);
  // awning + sign
  if (spec.awning) for (let x = 1; x <= W - 2; x++) fr.place(x, y + 4, D, 'awning_' + spec.awning);
  if (spec.sign) fr.signCentered(1, W - 2, y + 5, D, spec.sign.toUpperCase(), 0);
  // upper floors: carve first, then the stairwell (it overwrites its own box), then furnish
  let well = null;
  if (multi) {
    const tasks = [];
    for (let f = 1; f < floors; f++) tasks.push(upperFloor(ctx, fr, spec, rng, f));
    const swf = fr.child(2, 2, [0, 1], [1, 0], 4, H + 3);
    well = stairwell(swf, 0, 0, y, H, floors + 1, { wall: 'concrete', floor: 'concrete', stair: 'stairs_concrete' });
    const d0 = well.doors[0];
    swf.door(d0.x, d0.y + 1, d0.z, 3, 'door_white', { open: rng.chance(0.5) });
    for (let f = 1; f < floors; f++) {
      const dl = well.doors[f];
      swf.door(dl.x, dl.y + 1, dl.z, 3, 'door_wood', { locked: (spec.upper || 'apartment') === 'apartment' && rng.chance(0.3), open: rng.chance(0.3) });
    }
    const dr = well.doors[floors];
    swf.door(dr.x, dr.y + 1, dr.z, 3, 'door_metal', { locked: false });
    for (const t of tasks) for (const fn of t) fn();
    for (let f = 1; f < floors; f++) {
      const yy = y + f * H;
      const front = { x0: 2, z0: 2, x1: W - 3, z1: D - 3 };
      roomWindows(fr, yy, { x0: 2, z0: D - 3, x1: W - 3, z1: D - 3 }, front, W, D, spec.upperGlass || 'glass', rng, null, { spacing: 3 });
      roomWindows(fr, yy, { x0: 10, z0: 2, x1: W - 3, z1: 2 }, front, W, D, 'glass', rng, null, { spacing: 4, pairs: false });
    }
  }
  // signage + back alley props
  if (fr.get(rx + 2, y + 1, -1) === 0 && fr.get(rx + 2, y, -1) !== 0 && rng.chance(0.75)) fr.place(rx + 2, y + 1, -1, 'dumpster');
  if (rng.chance(0.5) && fr.get(rx - 2, y + 1, -1) === 0) fr.place(rx - 2, y + 1, -1, 'trash_can');
  if (rng.chance(0.4) && fr.get(rx - 3, y + 1, -1) === 0) fr.place(rx - 3, y + 1, -1, 'trash_bags');
  return { S, back, y, topY, H, W, D, well };
}

/** Upper floor f (>=1) of a storefront building: apartment, office or storage. Returns deferred furnish tasks. */
function upperFloor(ctx, fr, spec, rng, f) {
  const W = fr.w, D = fr.d, H = SH;
  const y = Y0 + f * H;
  const kind = spec.upper || 'apartment';
  const inner = spec.upperInner || rng.pick(['wall_beige', 'wall_white', 'wallpaper_stripe', 'wall_green']);
  const corridor = { id: 'hall', x0: 2, z0: 6, x1: W - 3, z1: 6, floor: 'floor_wood' };
  const rooms = [corridor];
  const bx0 = 2 + H + 4;
  let bathR = null;
  if (W - 3 >= bx0 + 2) { bathR = { id: 'bath', x0: bx0, z0: 2, x1: W - 3, z1: 5, floor: 'floor_tile' }; rooms.push(bathR); }
  const fz0 = 8, fz1 = D - 3;
  const tasks = [];
  const opt = { height: H - 1 };
  if (kind === 'apartment') {
    const zl = fz0 + Math.max(4, Math.floor((fz1 - fz0) / 2));
    const living = { id: 'living', x0: 2, z0: zl, x1: W - 3, z1: fz1, floor: rng.pick(['floor_wood', 'carpet_beige', 'carpet_grey']) };
    const mx = 2 + Math.floor((W - 4) / 2);
    const kitchen = { id: 'kitchen', x0: 2, z0: fz0, x1: mx - 1, z1: zl - 2, floor: 'floor_linoleum' };
    const bed = { id: 'bed', x0: mx + 1, z0: fz0, x1: W - 3, z1: zl - 2, floor: rng.pick(['carpet_beige', 'carpet_blue', 'floor_wood']) };
    rooms.push(living, kitchen, bed);
    carvePlan(fr, y, rooms, inner, H - 1, { x0: 2, z0: 2, x1: W - 3, z1: D - 3 });
    connect(fr, y, kitchen, corridor, 'door', rng);
    connect(fr, y, bed, corridor, 'door', rng);
    connect(fr, y, kitchen, living, 'open', rng);
    if (bathR) connect(fr, y, bathR, corridor, 'door', rng);
    tasks.push(() => furnish(fr, { ...living, y }, 'living', rng, opt));
    tasks.push(() => furnish(fr, { ...kitchen, y }, 'kitchen', rng, opt));
    tasks.push(() => furnish(fr, { ...bed, y }, rng.chance(0.5) ? 'master' : 'bedroom', rng, opt));
    if (bathR) tasks.push(() => furnish(fr, { ...bathR, y }, 'bathroom', rng, opt));
    if (rng.chance(0.3)) tasks.push(() => { const c = [rng.int(living.x0, living.x1), rng.int(living.z0, living.z1)]; if (fr.get(c[0], y + 1, c[1]) === 0) fr.zombies(c[0], y + 1, c[1], rng.int(1, 2), 1, { indoor: true, outfit: rng.pick(['civilian', 'civilian_f']) }); });
  } else if (kind === 'office') {
    const office = { id: 'office', x0: 2, z0: fz0, x1: W - 3, z1: fz1, floor: 'carpet_grey' };
    rooms.push(office);
    carvePlan(fr, y, rooms, 'wall_white', H - 1, { x0: 2, z0: 2, x1: W - 3, z1: D - 3 });
    connect(fr, y, office, corridor, 'wide', rng);
    if (bathR) connect(fr, y, bathR, corridor, 'door', rng);
    tasks.push(() => officeFloor(fr, { ...office, y }, rng, spec.officeLoot));
    if (bathR) tasks.push(() => furnish(fr, { ...bathR, y }, 'halfbath', rng, opt));
    if (rng.chance(0.4)) tasks.push(() => fr.zombies(Math.floor(W / 2), y + 1, Math.floor((fz0 + fz1) / 2), rng.int(1, 3), 2, { indoor: true, outfit: 'office' }));
  } else {
    const st = { id: 'storage', x0: 2, z0: fz0, x1: W - 3, z1: fz1, floor: 'concrete' };
    rooms.push(st);
    carvePlan(fr, y, rooms, 'concrete', H - 1, { x0: 2, z0: 2, x1: W - 3, z1: D - 3 });
    connect(fr, y, st, corridor, 'wide', rng);
    if (bathR) connect(fr, y, bathR, corridor, 'door', rng);
    tasks.push(() => {
      const r = new Room(fr, { ...st, y }, rng, opt);
      for (let k = 0; k < 6; k++) r.wall(rng.pick(['metal_shelf', 'cardboard_box', 'crate_wood', 'cardboard_box']), { loot: spec.storageLoot });
      for (let k = 0; k < 3; k++) r.center(rng.pick(['cardboard_box', 'pallet']));
    });
    if (bathR) tasks.push(() => furnish(fr, { ...bathR, y }, 'storage', rng, opt));
  }
  return tasks;
}

/** open-plan office: desk + chair clusters, filing cabinets, a water cooler-ish vending machine */
export function officeFloor(fr, r, rng, loot) {
  const room = new Room(fr, r, rng, { height: SH - 1 });
  for (let x = r.x0 + 1; x + 1 <= r.x1 - 1; x += 3) {
    for (let z = r.z0 + 1; z <= r.z1 - 2; z += 3) {
      if (!room.isFree(x, z) || !room.isFree(x, z + 1)) continue;
      room.tryPlace([
        { x, z, block: 'desk', f: 0, loot: loot || null },
        { x, z: z + 1, block: 'chair', f: 2 },
      ]);
    }
  }
  for (let k = 0; k < 3; k++) room.wall('filing_cabinet', { loot: loot || null });
  room.wall('bookshelf');
  if (rng.chance(0.6)) room.wall('vending_machine');
  room.floorLoot('floor_office', 3, 0.5);
  return room;
}
