// Shop interiors for storefront buildings (ground floor shop room S + back room).
import { B } from '../blocks.js';
import { Room, furnish } from './furnish.js';
import { aisles, checkouts, storefront, SH } from './commercial.js';

const H = SH;

function backStorage(fr, info, rng, loot, o = {}) {
  const r = new Room(fr, info.back, rng, { height: H - 1 });
  const n = o.n || 6;
  for (let k = 0; k < n; k++) r.wall(rng.pick(o.blocks || ['metal_shelf', 'cardboard_box', 'crate_wood', 'metal_shelf']), { loot });
  for (let k = 0; k < (o.center ?? 2); k++) r.center(rng.pick(['pallet', 'cardboard_box', 'cardboard_box']), 0, { loot: loot && rng.chance(0.5) ? loot : null });
  r.floorLoot('floor_store', 1, 0.5);
  return r;
}

/** checkout counter near the door: returns the x positions used */
function frontCounter(fr, info, rng, loot, n = 1) {
  const { S, W } = info;
  const doorX = Math.floor(W / 2);
  const side = rng.chance(0.5) ? 1 : -1;
  const xs = [];
  for (let k = 0; k < n; k++) xs.push(doorX + side * (3 + k * 2));
  const z = S.z1 - 3;
  checkouts(fr, xs.filter((x) => x > S.x0 && x < S.x1), z, S.y + 1, rng, loot);
  return { xs, z };
}

export const SHOPS = {
  diner(ctx, fr, info, rng) {
    const { S, y } = info;
    const Y = y + 1;
    // booths along the front window
    for (let x = S.x0; x + 2 <= S.x1; x += 4) {
      if (fr.get(x + 1, Y, S.z1 - 1) !== 0 || Math.abs(x + 1 - Math.floor(info.W / 2)) <= 1) continue;
      fr.place(x, Y, S.z1, 'chair', 3); fr.place(x + 1, Y, S.z1, 'table'); fr.place(x + 2, Y, S.z1, 'chair', 1);
      fr.loot(x + 1, Y + 1, S.z1, 'floor_store', 0.25, -0.18);
    }
    // counter with stools
    const cz = S.z0 + 2;
    for (let x = S.x0 + 1; x <= S.x1 - 2; x++) {
      fr.container(x, Y, cz, 'bar_counter', 0, 'diner_kitchen');
      if (x % 2 === 0) fr.place(x, Y, cz + 1, 'chair', 2);
    }
    const back = ['kitchen_cabinet', 'cooler', 'kitchen_cabinet', 'fridge', 'kitchen_cabinet'];
    for (let x = S.x0 + 1, k = 0; x <= S.x1 - 1 && k < back.length; x += 2, k++) {
      if (!fr.canPlace(x, Y, S.z0)) continue;
      fr.container(x, Y, S.z0, back[k], 0, back[k] === 'cooler' ? 'store_drinks' : 'diner_kitchen');
    }
    // tables in the middle
    const room = new Room(fr, { ...S, z0: cz + 2, z1: S.z1 - 2 }, rng, { height: H - 1 });
    room.tableSet(1, 1, 3); room.tableSet(1, 1, 2);
    // kitchen in the back
    const k = new Room(fr, info.back, rng, { height: H - 1, loot: { kitchen_cabinet: 'diner_kitchen', stove: 'diner_kitchen', fridge: 'diner_kitchen', freezer: 'diner_kitchen' } });
    k.run([{ block: 'stove' }, { block: 'stove' }, { block: 'kitchen_cabinet' }, { block: 'kitchen_sink' }, { block: 'kitchen_cabinet' }]);
    k.run([{ block: 'fridge' }, { block: 'freezer' }, { block: 'kitchen_cabinet' }]);
    k.wall('metal_shelf', { loot: 'diner_kitchen' });
    k.center('table');
    k.floorLoot('floor_store', 2, 0.5);
    fr.zombies(Math.floor(info.W / 2), Y, S.z0 + 4, rng.int(1, 3), 2, { indoor: true, outfit: rng.pick(['civilian', 'civilian_f', 'worker']) });
  },
  clothing(ctx, fr, info, rng) {
    const { S, y } = info;
    aisles(fr, S.x0 + 1, S.z0 + 1, S.x1 - 1, S.z1 - 4, y + 1, 'clothing_rack', null, { gap: true });
    frontCounter(fr, info, rng, null);
    const r = new Room(fr, S, rng, { height: H - 1 });
    for (let k = 0; k < 4; k++) r.wall('clothing_rack');
    r.wall('wardrobe', { loot: 'clothing_store' });
    backStorage(fr, info, rng, 'clothing_store', { blocks: ['clothing_rack', 'cardboard_box', 'metal_shelf'] });
  },
  bar(ctx, fr, info, rng) {
    const { S, y } = info;
    const Y = y + 1;
    const bx = S.x1 - 1;
    for (let z = S.z0 + 1; z <= S.z1 - 4; z++) {
      fr.container(bx, Y, z, 'bar_counter', 1, 'bar');
      if (z % 2 === 0) fr.place(bx - 1, Y, z, 'chair', 3);
      fr.container(S.x1, Y, z, 'store_shelf_misc', 1, 'liquor_store');
    }
    const room = new Room(fr, { ...S, x1: S.x1 - 3 }, rng, { height: H - 1 });
    room.tableSet(2, 1, 0, { block: 'table' }); // pool table
    for (let k = 0; k < 3; k++) room.tableSet(1, 1, rng.int(2, 3));
    room.wall('vending_machine');
    room.tableLoot('floor_store', 0.4);
    backStorage(fr, info, rng, 'bar', { blocks: ['barrel_rust', 'crate_wood', 'metal_shelf', 'cardboard_box'] });
    fr.zombies(Math.floor((S.x0 + S.x1) / 2), Y, Math.floor((S.z0 + S.z1) / 2), rng.int(2, 4), 3, { indoor: true, outfit: rng.pick(['civilian', 'worker']) });
  },
  pharmacy(ctx, fr, info, rng) {
    const { S, y } = info;
    const Y = y + 1;
    aisles(fr, S.x0 + 1, S.z0 + 3, S.x1 - 1, S.z1 - 4, Y, ['store_shelf_meds', 'store_shelf_misc', 'store_shelf_meds'], null, { gap: true });
    frontCounter(fr, info, rng, null, 2);
    // pharmacy counter across the back of the shop (behind it the locked storage)
    for (let x = S.x0 + 1; x <= S.x1 - 1; x++) if (fr.get(x, Y, S.z0 + 1) === 0 && x % 4 !== 0) fr.place(x, Y, S.z0 + 1, 'checkout', 0);
    const r = new Room(fr, info.back, rng, { height: H - 1 });
    for (let k = 0; k < 6; k++) r.wall('store_shelf_meds', { loot: 'pharmacy_storage' });
    r.wall('safe', { loot: 'pharmacy_storage', opts: { locked: true } });
    r.deskSet('desk', { loot: 'office' });
    r.center('cardboard_box', 0, { loot: 'pharmacy_storage' });
    r.floorLoot('floor_hospital', 1, 0.6);
    fr.zombies(Math.floor(info.W / 2), Y, S.z0 + 4, rng.int(2, 3), 2, { indoor: true, outfit: rng.pick(['civilian_f', 'medic', 'civilian']) });
    fr.note(S.x0 + 2, Y, S.z0 + 2, 'pharmacy_counter');
  },
  bank(ctx, fr, info, rng) {
    const { S, y } = info;
    const Y = y + 1;
    const cz = S.z0 + 2;
    for (let x = S.x0; x <= S.x1; x++) {
      const gap = x === S.x0 + 1;
      if (gap) continue;
      fr.place(x, Y, cz, 'bar_counter', 0);
      fr.set(x, Y + 1, cz, x % 3 === 0 ? B.wall_wood_panel : B.iron_bars);
      fr.set(x, Y + 2, cz, B.wall_wood_panel);
    }
    fr.door(S.x0 + 1, Y, cz, 0, 'door_wood', { locked: true });
    for (let x = S.x0 + 2; x <= S.x1 - 1; x += 3) fr.container(x, Y, cz - 1, 'desk', 0, 'office');
    const lobby = new Room(fr, { ...S, z0: cz + 1 }, rng, { height: H - 1 });
    lobby.wall('bench'); lobby.wall('bench');
    lobby.deskSet('desk', { loot: 'office' });
    lobby.center('table');
    lobby.floorLoot('floor_office', 2, 0.5);
    // the vault (back room): safes
    const v = new Room(fr, info.back, rng, { height: H - 1 });
    for (let k = 0; k < 6; k++) v.wall('safe', { loot: 'safe', opts: { locked: k % 2 === 0 } });
    v.center('cardboard_box', 0, { loot: 'office' });
  },
  post_office(ctx, fr, info, rng) {
    const { S, y } = info;
    const Y = y + 1;
    const cz = S.z0 + 2;
    for (let x = S.x0; x <= S.x1; x++) {
      if (x === S.x1 - 1) continue;
      if (x % 3 === 1) { fr.place(x, Y, cz, 'checkout', 0); fr.place(x, Y + 1, cz, 'cash_register', 0); } else fr.place(x, Y, cz, 'bar_counter', 0);
    }
    // PO boxes along a side wall
    for (let z = cz + 2; z <= S.z1 - 2; z++) if (fr.canPlace(S.x0, Y, z)) { fr.container(S.x0, Y, z, 'metal_shelf', 3, 'mailbox'); fr.container(S.x0, Y + 1, z, 'metal_shelf', 3, 'mailbox'); }
    const lobby = new Room(fr, { ...S, z0: cz + 1, x0: S.x0 + 1 }, rng, { height: H - 1 });
    lobby.center('table'); lobby.wall('bench');
    backStorage(fr, info, rng, 'mailbox', { blocks: ['cardboard_box', 'cardboard_box', 'metal_shelf', 'table'], n: 8, center: 4 });
  },
  hardware(ctx, fr, info, rng) {
    const { S, y } = info;
    aisles(fr, S.x0 + 2, S.z0 + 1, S.x1 - 2, S.z1 - 4, y + 1, ['store_shelf_misc', 'metal_shelf'], 'hardware_store', { gap: true, tall: false });
    const r = new Room(fr, S, rng, { height: H - 1 });
    for (let k = 0; k < 6; k++) r.wall('metal_shelf', { loot: 'hardware_store' });
    r.wall('workbench'); r.wall('toolbox', { loot: 'hardware_store', access: false });
    frontCounter(fr, info, rng, 'hardware_store');
    backStorage(fr, info, rng, 'hardware_store', { blocks: ['crate_wood', 'metal_shelf', 'pallet', 'cardboard_box'] });
    // lumber stack
    const lb = new Room(fr, info.back, rng, { height: H - 1 });
    lb.center('planks_oak'); lb.center('planks_oak');
  },
  gunstore(ctx, fr, info, rng) {
    const { S, y, W, D } = info;
    const Y = y + 1;
    // security bars behind the glass
    for (let x = 2; x <= W - 3; x++) if (fr.get(x, Y, D - 2) === 0 && Math.abs(x - Math.floor(W / 2)) > 0) for (let yy = Y; yy <= Y + 2; yy++) fr.set(x, yy, D - 2, B.iron_bars);
    fr.markOpening(Math.floor(W / 2), Y, D - 2);
    for (let z = S.z0; z <= S.z1 - 2; z++) {
      if (fr.canPlace(S.x0, Y, z)) fr.container(S.x0, Y, z, 'gun_cabinet', 3, 'gun_store');
      if (fr.canPlace(S.x1, Y, z) && z % 2 === 0) fr.container(S.x1, Y, z, 'gun_cabinet', 1, 'gun_store');
    }
    // U shaped display counter
    const cz = S.z0 + 3;
    for (let x = S.x0 + 3; x <= S.x1 - 3; x++) fr.container(x, Y, cz, 'checkout', 0, 'gun_store');
    fr.place(S.x0 + 4, Y + 1, cz, 'cash_register', 0);
    fr.note(S.x0 + 5, Y + 1, cz, 'gunstore_counter', 0.01);
    const r = new Room(fr, { ...S, z0: cz + 2 }, rng, { height: H - 1 });
    r.center('store_shelf_misc', 1, { loot: 'gun_store' });
    r.center('store_shelf_misc', 3, { loot: 'sporting_goods' });
    // back room: locked with key_gunstore
    const v = new Room(fr, info.back, rng, { height: H - 1 });
    for (let k = 0; k < 4; k++) v.wall('gun_cabinet', { loot: 'gun_store_backroom' });
    v.wall('safe', { loot: 'gun_store_backroom', opts: { locked: true } });
    for (let k = 0; k < 3; k++) v.wall('crate_wood', { loot: 'gun_store_backroom' });
    v.deskSet('desk', { loot: 'office' });
    v.floorLoot('floor_store', 1, 0.6);
    fr.zombies(Math.floor(W / 2), Y, cz + 2, rng.int(1, 2), 1, { indoor: true, outfit: 'civilian', types: ['walker', 'brute'] });
  },
  library(ctx, fr, info, rng) {
    const { S, y } = info;
    const Y = y + 1;
    aisles(fr, S.x0 + 1, S.z0 + 1, S.x1 - 1, Math.floor((S.z0 + S.z1) / 2), Y, 'bookshelf', 'library', { tall: true, gap: true });
    const r = new Room(fr, { ...S, z0: Math.floor((S.z0 + S.z1) / 2) + 2 }, rng, { height: H - 1 });
    r.tableSet(2, 1, 4); r.tableSet(1, 1, 2);
    r.deskSet('desk', { loot: 'office' });
    const r2 = new Room(fr, S, rng, { height: H - 1 });
    for (let k = 0; k < 6; k++) r2.wall('bookshelf', { loot: 'library' });
    r.tableLoot('library', 0.5);
    backStorage(fr, info, rng, 'library', { blocks: ['bookshelf', 'cardboard_box', 'desk'] });
  },
  liquor(ctx, fr, info, rng) {
    const { S, y } = info;
    aisles(fr, S.x0 + 2, S.z0 + 2, S.x1 - 2, S.z1 - 4, y + 1, 'store_shelf_misc', 'liquor_store', { gap: true });
    for (let x = S.x0; x <= S.x1; x++) if (fr.canPlace(x, y + 1, S.z0)) fr.container(x, y + 1, S.z0, 'cooler', 0, 'store_drinks');
    frontCounter(fr, info, rng, 'liquor_store');
    backStorage(fr, info, rng, 'liquor_store', { blocks: ['crate_wood', 'cardboard_box', 'barrel_rust'] });
  },
  sporting(ctx, fr, info, rng) {
    const { S, y } = info;
    aisles(fr, S.x0 + 2, S.z0 + 1, S.x1 - 3, S.z1 - 4, y + 1, ['store_shelf_misc', 'clothing_rack'], 'sporting_goods', { gap: true });
    for (let z = S.z0; z <= S.z1 - 3; z += 2) if (fr.canPlace(S.x1, y + 1, z)) fr.container(S.x1, y + 1, z, 'gun_cabinet', 1, 'sporting_goods');
    frontCounter(fr, info, rng, 'sporting_goods');
    // display tent
    const r = new Room(fr, S, rng, { height: H - 1 });
    const c = r.center('tent_green');
    if (c) fr.place(c[0], y + 2, c[1], 'tent_green');
    backStorage(fr, info, rng, 'sporting_goods');
  },
  electronics(ctx, fr, info, rng) {
    const { S, y } = info;
    aisles(fr, S.x0 + 2, S.z0 + 1, S.x1 - 2, S.z1 - 5, y + 1, 'store_shelf_misc', 'electronics', { gap: true });
    const r = new Room(fr, S, rng, { height: H - 1 });
    for (let k = 0; k < 5; k++) r.wall('table', { top: 'tv', access: false });
    frontCounter(fr, info, rng, 'electronics');
    backStorage(fr, info, rng, 'electronics');
  },
  laundromat(ctx, fr, info, rng) {
    const { S, y } = info;
    for (let x = S.x0; x <= S.x1; x++) {
      if (fr.canPlace(x, y + 1, S.z0)) fr.place(x, y + 1, S.z0, 'washing_machine', 0);
    }
    for (let z = S.z0 + 2; z <= S.z1 - 3; z++) {
      if (fr.canPlace(S.x0, y + 1, z)) fr.place(S.x0, y + 1, z, 'washing_machine', 3);
      if (fr.canPlace(S.x1, y + 1, z)) fr.place(S.x1, y + 1, z, 'washing_machine', 1);
    }
    const r = new Room(fr, { ...S, x0: S.x0 + 2, x1: S.x1 - 2, z0: S.z0 + 2 }, rng, { height: H - 1 });
    r.tableSet(2, 1, 0); r.wall('bench'); r.wall('vending_machine');
    backStorage(fr, info, rng, 'laundry', { blocks: ['metal_shelf', 'cardboard_box', 'washing_machine'] });
  },
  pawn(ctx, fr, info, rng) {
    const { S, y } = info;
    const r = new Room(fr, S, rng, { height: H - 1 });
    for (let k = 0; k < 3; k++) r.wall('gun_cabinet', { loot: 'gun_cabinet' });
    for (let k = 0; k < 4; k++) r.wall('store_shelf_misc', { loot: rng.pick(['electronics', 'store_general', 'sporting_goods']) });
    r.center('table', 0); r.center('table', 0);
    frontCounter(fr, info, rng, 'store_general');
    const v = backStorage(fr, info, rng, 'store_general');
    v.wall('safe', { loot: 'safe', opts: { locked: true } });
    void y;
  },
  general(ctx, fr, info, rng) {
    const { S, y } = info;
    aisles(fr, S.x0 + 2, S.z0 + 1, S.x1 - 2, S.z1 - 4, y + 1, ['store_shelf', 'store_shelf_misc', 'store_shelf_empty'], null, { gap: true });
    for (let x = S.x0; x <= S.x1; x++) if (fr.canPlace(x, y + 1, S.z0) && x % 2 === 0) fr.place(x, y + 1, S.z0, 'cooler', 0);
    frontCounter(fr, info, rng, null);
    backStorage(fr, info, rng, 'store_general');
  },
  office(ctx, fr, info, rng) {
    const { S, y } = info;
    const r = new Room(fr, S, rng, { height: H - 1 });
    r.deskSet('desk', { loot: 'office' });
    r.wall('bench'); r.wall('bench'); r.center('table');
    for (let k = 0; k < 3; k++) r.wall('filing_cabinet');
    r.deskSet('desk', { loot: 'office' });
    r.floorLoot('floor_office', 2, 0.5);
    const b = new Room(fr, info.back, rng, { height: H - 1 });
    b.deskSet('desk', { loot: 'office' }); b.wall('filing_cabinet'); b.wall('filing_cabinet'); b.wall('safe');
    void y;
  },
};

/** Build a complete shop: storefront shell + interior */
export function buildShop(ctx, fr, spec, rng) {
  const info = storefront(ctx, fr, spec, rng);
  const fn = SHOPS[spec.kind] || SHOPS.general;
  fn(ctx, fr, info, rng);
  ctx.building('shop_' + spec.kind);
  if (spec.poi) fr.poi(spec.poi, spec.poiType || 'store');
  return info;
}

export { furnish };
