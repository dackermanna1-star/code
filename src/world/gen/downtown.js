// Downtown Millbrook: block layouts (which shop goes where).
import { SURFACE, ZONES } from '../World.js';
import { B } from '../blocks.js';
import { Frame } from './frame.js';
import { buildShop } from './shops.js';
import { apartmentBuilding } from './apartments.js';
import { policeStation, fireStation, townHall, foodland, veteransPark, gasStation } from './civic.js';
import { CAR_COLORS } from './util.js';

const Y0 = SURFACE;

// [x0, z0, x1, z1, front, spec]
const BLOCKS_DT = {
  dt_a1: [
    [422, 482, 434, 503, 0, { kind: 'diner', sign: 'DINER', awning: 'red', floorMat: 'floor_checker', poi: 'Millbrook Diner' }],
    [435, 480, 448, 503, 0, { kind: 'bar', sign: 'RUSTY NAIL', awning: 'green', floors: 2, upper: 'apartment', floorMat: 'floor_wood', outer: 'brick_brown', poi: 'Rusty Nail Bar' }],
    [449, 482, 458, 503, 0, { kind: 'clothing', sign: 'THREADS', awning: 'blue', outer: 'brick_white', poi: 'Threads Clothing' }],
    [447, 458, 458, 476, 2, { kind: 'laundromat', sign: 'WASH', awning: 'blue', outer: 'brick_red' }],
    ['apts', 422, 458, 445, 479, 2, { floors: 4, outer: 'brick_red', name: 'OAK APTS', poi: 'Oak Street Apartments' }],
  ],
  dt_a2: [
    [470, 480, 489, 503, 0, { kind: 'pharmacy', sign: 'PHARMACY', awning: 'green', floors: 2, upper: 'office', backDoor: 'door_metal', backLocked: 'key_pharmacy', floorMat: 'floor_tile', outer: 'brick_white', poi: 'Rite Care Pharmacy' }],
    [490, 480, 504, 503, 0, { kind: 'bank', sign: 'FIRST BANK', floors: 2, upper: 'office', outer: 'stone_brick', floorMat: 'floor_checker', backDoor: 'door_metal', backLocked: true, noRear: true, poi: 'First Bank of Millbrook' }],
    [470, 458, 489, 477, 2, { kind: 'post_office', sign: 'POST OFFICE', outer: 'brick_brown', poi: 'Millbrook Post Office' }],
    [490, 458, 504, 477, 2, { kind: 'office', sign: 'LAW OFFICE', floors: 2, upper: 'office', outer: 'brick_red' }],
  ],
  dt_b2: [
    [470, 521, 487, 543, 2, { kind: 'hardware', sign: 'HARDWARE', awning: 'red', floors: 2, upper: 'storage', storageLoot: 'hardware_store', poi: 'Miller Hardware' }],
    [488, 521, 504, 543, 2, { kind: 'gunstore', sign: 'BIG BUCK GUNS', awning: 'green', backDoor: 'door_metal', backLocked: 'key_gunstore', outer: 'brick_brown', floorMat: 'floor_wood', poi: 'Big Buck Guns' }],
    [470, 546, 489, 566, 0, { kind: 'library', sign: 'LIBRARY', outer: 'stone_brick', floorMat: 'carpet_red', poi: 'Millbrook Public Library' }],
    [490, 546, 504, 566, 0, { kind: 'liquor', sign: 'LIQUOR', awning: 'red', outer: 'brick_red' }],
  ],
  dt_b4: [
    [566, 521, 583, 544, 2, { kind: 'office', sign: 'SAVINGS & LOAN', floors: 4, upper: 'office', outer: 'brick_white', floorMat: 'carpet_grey', poi: 'Millbrook Savings Building' }],
    [584, 521, 602, 543, 2, { kind: 'sporting', sign: 'OUTDOORSMAN', awning: 'green', floors: 2, upper: 'storage', storageLoot: 'sporting_goods', outer: 'brick_brown', poi: 'Outdoorsman Sporting Goods' }],
    [566, 547, 578, 566, 0, { kind: 'electronics', sign: 'TV & RADIO', awning: 'blue', outer: 'brick_white' }],
    ['apts', 579, 545, 602, 566, 0, { floors: 3, outer: 'brick_brown', name: 'MARKET APTS', poi: 'Market Street Apartments' }],
  ],
};

export function buildDowntown(ctx, site) {
  const rng = ctx.rng.fork(0x700 + site.x0);
  const list = BLOCKS_DT[site.key];
  if (!list) return;
  // block ground: concrete alleys / grass
  for (let x = site.x0; x <= site.x1; x++) for (let z = site.z0; z <= site.z1; z++) ctx.world.set(x, Y0, z, B.asphalt);
  for (const e of list) {
    if (e[0] === 'apts') {
      const [, x0, z0, x1, z1, front, spec] = e;
      const fr = Frame.fromRect(ctx, x0, z0, x1, z1, front);
      apartmentBuilding(ctx, fr, spec, rng);
      if (spec.poi) fr.poi(spec.poi, 'residential');
      continue;
    }
    const [x0, z0, x1, z1, front, spec] = e;
    const fr = Frame.fromRect(ctx, x0, z0, x1, z1, front);
    buildShop(ctx, fr, spec, rng);
  }
  // alley clutter: dumpsters, a car or two, trash
  for (let k = 0; k < 3; k++) {
    const x = rng.int(site.x0 + 2, site.x1 - 2), z = rng.int(site.z0 + 2, site.z1 - 2);
    if (ctx.world.get(x, Y0 + 1, z) === 0 && ctx.world.get(x, Y0, z) === B.asphalt) ctx.world.set(x, Y0 + 1, z, rng.pick([B.trash_bags, B.trash_bags, B.barrel_rust, B.cardboard_box]));
  }
  ctx.world.setZone(site.x0, site.z0, site.x1, site.z1, ZONES.DOWNTOWN);
  void CAR_COLORS;
}

export function buildDowntownSpecial(ctx, site) {
  const rng = ctx.rng.fork(0x900 + site.x0 + site.z0);
  switch (site.key) {
    case 'dt_a3': townHall(ctx, site, rng); break;
    case 'dt_a4': policeStation(ctx, site, rng); break;
    case 'dt_b1': foodland(ctx, site, rng); break;
    case 'dt_b3': veteransPark(ctx, site, rng); break;
    case 'dt_w1': fireStation(ctx, site, rng); break;
    case 'dt_w2': gasStation(ctx, site, 2, 'MILLBROOK FUEL', rng); break;
    default: return false;
  }
  return true;
}
