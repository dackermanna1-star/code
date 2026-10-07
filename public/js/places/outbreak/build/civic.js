// The town's buildings: blocks of flats (concrete panel and brick, a stairwell
// up the middle, a flat either side on every floor), shops, a bar and a
// pharmacy, the supermarket, offices, the police station, the clinic and the
// hospital, the school, the church with its onion domes, and the fire station.
import { mat } from './kit.js';
import { S, STOREY, wall, plan, corridorPlan, slab, stairs, railing, windowIn, doorIn } from './parts.js';
import { body } from './body.js';
import * as Fu from './furniture.js';
import { furnishRoom, dress, Layout } from './interior.js';
import { PLASTER } from './houses.js';
import { vehicle } from './props.js';

const pick = (r, a) => a[Math.floor(r() * a.length)];
const WALLS = () => [mat('plaster', 0xf0e8d4), mat('plaster', 0xf0dcb8, { p: 1 }), mat('plaster', 0xd8e4d0, { p: 2 }), mat('plasterOld', 0xe0d8c8), mat('plaster', 0xc8d8e8, { p: 2 }), mat('plaster', 0xd8e4ec), mat('plaster', 0xf0d4c4, { p: 1 }), mat('wallpaper', 0xf0e0c0, { p: 1 })];
const OFFICE_WALL = mat('plaster', 0xd8dcd0), CORRIDOR_WALL = mat('plaster', 0xb8c8b8), TILE_WALL = mat('whiteTiles', 0xe8f0ec);

function doorsOf(P, R) {
  const out = [];
  for (const wl of P.walls) if (wl.door && (P.rooms[wl.ra] === R || P.rooms[wl.rb] === R)) out.push(wl.axis === 'x' ? { x: wl.door.a, z: wl.at } : { x: wl.at, z: wl.door.a });
  return out;
}

// --- blocks of flats ----------------------------------------------------------------------------------------------------------
/** A block of flats: s.floors 3-5. A stairwell in the middle (front door, two flights to each floor), a flat each side. */
export function apartment(K, s) {
  const r = K.r, w = s.w, d = s.d, F = s.floors ?? 4, t = 0.9, H = STOREY, base = 1.0;
  const ix0 = -w / 2 + t, ix1 = w / 2 - t, iz0 = -d / 2 + t, iz1 = d / 2 - t;
  const sw = 5.2; // half the stairwell's width
  const k = r();
  const outer = k < 0.45 ? mat('panel', pick(r, [0xd8d4cc, 0xe0d4b8, 0xc8ccc8, 0xd8c8b0])) : k < 0.7 ? mat('brick', pick(r, [0xffffff, 0xe0d0c8])) : k < 0.85 ? mat('stucco', pick(r, PLASTER)) : mat('plasterOld', pick(r, PLASTER));
  const walls = WALLS();
  const cutL = [iz1 - (iz1 - iz0) * (0.38 + r() * 0.1), iz1 - (iz1 - iz0) * (0.68 + r() * 0.08)];
  const cutR = [iz1 - (iz1 - iz0) * (0.38 + r() * 0.1), iz1 - (iz1 - iz0) * (0.68 + r() * 0.08)];
  const plans = [];
  for (let f = 0; f < F; f++) {
    const rooms = [{ x0: -sw, z0: iz0, x1: sw, z1: iz1, kind: 'stairs', noFloor: true, tag: 'stairs' }];
    for (const [side, cuts] of [[-1, cutL], [1, cutR]]) {
      const x0 = side < 0 ? ix0 : sw, x1 = side < 0 ? -sw : ix1;
      rooms.push({ x0, z0: cuts[0], x1, z1: iz1, kind: 'living', flat: side });
      rooms.push({ x0, z0: cuts[1], x1, z1: cuts[0], kind: r() < 0.5 ? 'kitchen' : 'bath', flat: side });
      rooms.push({ x0, z0: iz0, x1, z1: cuts[1], kind: 'bedroom', flat: side });
    }
    rooms.forEach((q, i) => { q.id = i; });
    const walls2 = [];
    // stairwell to each flat's front room (a front door at the landing), and between a flat's rooms
    for (const side of [-1, 1]) {
      const fr = rooms.filter((q) => q.flat === side);
      for (const R of fr) walls2.push({ axis: 'z', at: side < 0 ? -sw : sw, a0: R.z0, a1: R.z1, ra: 0, rb: R.id, door: R.kind === 'living' ? { a: iz1 - 2.2, w: 3.6 } : null });
      walls2.push({ axis: 'x', at: fr[0].z0, a0: fr[0].x0, a1: fr[0].x1, ra: fr[0].id, rb: fr[1].id, door: { a: (fr[0].x0 + fr[0].x1) / 2 + side * 2, w: 3.8 } });
      walls2.push({ axis: 'x', at: fr[1].z0, a0: fr[1].x0, a1: fr[1].x1, ra: fr[1].id, rb: fr[2].id, door: { a: (fr[1].x0 + fr[1].x1) / 2 - side * 2, w: 3.8 } });
    }
    plans.push({ rooms, walls: walls2, start: 0 });
  }
  const B = body(K, {
    w, d, floors: F, H, base, t,
    outer, plinth: S.plinth, band: r() < 0.5 ? mat('concrete', 0xa8a49c) : null,
    plans,
    roomMat: (R) => (R.kind === 'stairs' ? mat('plaster', 0x9ab0a0) : R.kind === 'bath' ? TILE_WALL : walls[(R.id * 3 + R.flat + 7) % walls.length]),
    floorMat: (R) => (R.kind === 'stairs' ? mat('tiles', 0xc8c0b0) : R.kind === 'kitchen' || R.kind === 'bath' ? mat('linoleum') : mat('woodFloor', 0xd8c8b0)),
    doors: [{ side: 'pz', a: 0, w: 4.4, kind: 'wood', canopy: mat('concrete', 0x9a968e), hinge: 1 }],
    win: { w: 4.2, h: 4.6, sill: 3, every: 10, style: { glass: 0.7, board: 0.05, curtains: true } },
    noWin: (side, f, a, R) => R.kind === 'stairs',
    innerDoor: (wl) => (wl.ra === 0 ? (r() < 0.75 ? 'wood' : null) : (r() < 0.5 ? 'wood' : null)),
    roof: { kind: 'flat', mat: mat('concrete', 0x6a6864), parapet: 1.4 },
    furnish: (K2, R, f, y) => {
      if (R.kind === 'stairs') { dress(K2, new Layout(K2, R, y), y, 'corridor', { cat: 'home', skirting: false }); return; }
      furnishRoom(K2, R, y, R.kind, { cat: 'home' });
    },
  });
  // the stairwell: a landing at each floor (front), a half landing at the back, two flights between
  K.indoors(0.56);
  const fl = iz1 - 3.6, mid = iz1 - 10.0, sm = S.step;
  for (let f = 0; f < F; f++) {
    const y0 = B.floorY(f);
    if (f > 0) slab(K, -sw, fl, sw, iz1, y0, 0.6, mat('tiles', 0xc8c0b0), S.ceiling, [], { ao: 0.45 });
    if (f < F - 1) {
      stairs(K, -sw / 2, fl, 'nz', sw - 0.5, y0, H / 2, fl - mid, sm, { ao: 0.45 });
      slab(K, -sw, iz0, sw, mid, y0 + H / 2, 0.6, mat('tiles', 0xc8c0b0), S.ceiling, [], { ao: 0.45 });
      stairs(K, sw / 2, mid, 'pz', sw - 0.5, y0 + H / 2, H / 2, fl - mid, sm, { ao: 0.45 });
      // the wall between the flights, and a rail
      K.span(-0.25, y0, mid, 0.25, y0 + H - 0.6, fl, mat('plaster', 0x9ab0a0), { ao: 0.45, skip: 'ny' });
      K.stairLink(B.rooms[f][0], B.rooms[f + 1][0], -sw / 2, y0, fl, sw / 2, y0 + H, fl).path = [[-sw / 2, y0, fl - 0.5], [-sw / 2, y0 + H / 2, mid - 1], [sw / 2, y0 + H / 2, mid - 1], [sw / 2, y0 + H, fl + 0.5]].map((q) => K.world(q[0], q[1], q[2], [0, 0, 0]));
    }
    if (f === F - 1) railing(K, -sw, fl, sw, fl, y0, 3.2);
  }
  K.outdoors();
  // balconies on some front rooms
  for (let f = 1; f < F; f++) for (const side of [-1, 1]) {
    if (r() < 0.45) continue;
    const y0 = B.floorY(f), cx = side * (sw + (ix1 - sw) / 2);
    K.span(cx - 5, y0 - 0.5, d / 2, cx + 5, y0, d / 2 + 4, mat('concrete', 0xa8a49c), {});
    K.span(cx - 5, y0, d / 2 + 3.8, cx + 5, y0 + 3.4, d / 2 + 4, r() < 0.5 ? mat('metal', 0x8a8e88, { p: 4 }) : outer, { col: true });
    for (const sx of [-1, 1]) K.span(cx + sx * 5 - 0.1, y0, d / 2, cx + sx * 5 + 0.1, y0 + 3.4, d / 2 + 4, outer, { col: true });
    if (r() < 0.4) Fu.crate(K, cx + 3, y0, d / 2 + 2, 0.3, { s: 0.8, loot: 'home' });
  }
  // the entrance: a sign with the house number
  K.sign(0, base + 10.2, d / 2 + 0.25, 2.4, 1.4, String(1 + Math.floor(r() * 48)), 'number');
  // a roof hatch hut over the stairwell
  K.span(-3, B.top + 0.8, -3, 3, B.top + 5.5, 3, mat('brick', 0xc8b0a0), { skip: 'ny' });
  return B;
}

// --- shops -------------------------------------------------------------------------------------------------------------------
/** One-storey shop: big front windows, a sign, a shop floor and a back room. s.shop: shop | bar | pharmacy. */
export function shop(K, s) {
  const r = K.r, w = s.w, d = s.d, t = 0.8, H = 11, base = 0.8;
  const kind = s.shop || 'shop';
  const ix0 = -w / 2 + t, ix1 = w / 2 - t, iz0 = -d / 2 + t, iz1 = d / 2 - t;
  const back = iz0 + 6.5 + r() * 2;
  const rooms = [{ x0: ix0, z0: back, x1: ix1, z1: iz1, kind: 'floor' }, { x0: ix0, z0: iz0, x1: ix1, z1: back, kind: 'store' }];
  rooms.forEach((q, i) => { q.id = i; });
  const P = { rooms, walls: [{ axis: 'x', at: back, a0: ix0, a1: ix1, ra: 0, rb: 1, door: { a: ix1 - 4, w: 4 } }], start: 0 };
  const col = pick(r, PLASTER);
  const outer = r() < 0.5 ? mat('plaster', col) : r() < 0.5 ? mat('brick') : mat('stucco', col);
  const doorA = (r() - 0.5) * (w - 12);
  const B = body(K, {
    w, d, floors: 1, H, base, t, outer, plinth: S.plinth,
    plans: [P],
    roomMat: (R) => (R.kind === 'store' ? mat('plasterOld', 0xc8c0b0) : kind === 'pharmacy' ? TILE_WALL : kind === 'bar' ? mat('wallpaper', 0x8a6a5a, { p: 1 }) : mat('plaster', 0xe0e4d8)),
    floorMat: (R) => (R.kind === 'store' ? mat('concFloor') : kind === 'bar' ? mat('woodFloor', 0xa88870) : mat('tiles', 0xd8d8d0)),
    doors: [{ side: 'pz', a: doorA, w: 4.6, kind: 'glass' }, { side: 'nz', a: (r() - 0.5) * (w - 10), kind: 'metal' }],
    win: (side) => (side === 'pz' ? { w: 7, h: 6.2, sill: 1.6, every: 9, style: { glass: 0.55, board: 0.15, frame: mat('metal', 0x5a5e62, { p: 4 }), transom: false, single: true } } : side === 'nz' ? null : { w: 3, h: 3, sill: 5, every: 14, max: 1, style: { glass: 0.6 } }),
    roof: { kind: 'flat', mat: mat('concrete', 0x6a6864), parapet: 2.4 },
    furnish: (K2, R, f, y) => {
      if (R.kind === 'store') { furnishRoom(K2, R, y, 'store', { cat: 'shop', storeCat: kind === 'pharmacy' ? 'medical' : kind === 'bar' ? 'food' : 'shop' }); return; }
      dress(K2, new Layout(K2, R, y), y, 'shop', { cat: 'shop' });
      if (kind === 'bar') {
        Fu.counter(K2, ix1 - 8, y, back + 4, 0, { L: 10, cat: 'food' });
        Fu.bookshelf(K2, ix1 - 8, y, back + 0.8, 0, { w: 10, h: 7, m: Fu.F.woodDark, cat: 'food' });
        for (let i = 0; i < 3; i++) Fu.table(K2, ix0 + 5 + i * 7, y, iz1 - 6 - (i % 2) * 5, r(), { w: 4, d: 4, chairs: true, cat: 'food' });
      } else if (kind === 'pharmacy') {
        Fu.counter(K2, 0, y, back + 5, Math.PI, { L: w - 10, cat: 'medical' });
        for (let i = 0; i < Math.floor((w - 4) / 8); i++) Fu.bookshelf(K2, ix0 + 4.5 + i * 8, y, back + 0.8, 0, { w: 7, h: 7.5, m: Fu.F.white, cat: 'medical' });
      } else {
        const n = Math.max(1, Math.floor((iz1 - back - 8) / 7));
        for (let i = 0; i < n; i++) Fu.gondola(K2, -2, y, back + 4.5 + i * 7, 0, { L: Math.min(14, w - 14), cat: 'shop' });
        Fu.counter(K2, ix1 - 4, y, iz1 - 6, -Math.PI / 2, { L: 6, cat: 'shop' });
        Fu.rack(K2, ix0 + 1.3, y, (back + iz1) / 2, Math.PI / 2, { w: 8, h: 7, m: Fu.F.white, shelfMat: Fu.F.white, cat: 'shop', full: 0.3 });
      }
    },
  });
  // the sign band over the windows
  const words = { shop: pick(r, ['ПРОДУКТЫ', 'МАГАЗИН', 'ГАСТРОНОМ', 'ХЛЕБ', 'ОВОЩИ']), bar: pick(r, ['БАР', 'КАФЕ', 'ПИВО']), pharmacy: 'АПТЕКА' }[kind];
  K.span(-w / 2 + 1, base + 8.2, d / 2, w / 2 - 1, base + 10.6, d / 2 + 0.3, mat('metal', kind === 'pharmacy' ? 0x2a7a4a : kind === 'bar' ? 0x5a2a2a : 0x2a4a7a, { p: 5 }), { col: false });
  K.sign(0, base + 9.4, d / 2 + 0.32, Math.min(w - 4, words.length * 2.4 + 2), 2.0, words, kind === 'pharmacy' ? 'pharmacy' : 'shop');
  if (kind === 'pharmacy') K.sign(w / 2 - 3, base + 9.4, d / 2 + 0.33, 2, 2, '+', 'cross');
  return B;
}

/** A supermarket: a big hall of shelves, tills by the door, a store at the back. */
export function supermarket(K, s) {
  const r = K.r, w = s.w, d = s.d, t = 0.9, H = 13, base = 0.8;
  const ix0 = -w / 2 + t, ix1 = w / 2 - t, iz0 = -d / 2 + t, iz1 = d / 2 - t;
  const back = iz0 + 9;
  const rooms = [{ x0: ix0, z0: back, x1: ix1, z1: iz1, kind: 'floor' }, { x0: ix0, z0: iz0, x1: ix1 - 12, z1: back, kind: 'store' }, { x0: ix1 - 12, z0: iz0, x1: ix1, z1: back, kind: 'office' }];
  rooms.forEach((q, i) => { q.id = i; });
  const P = { rooms, walls: [{ axis: 'x', at: back, a0: ix0, a1: ix1 - 12, ra: 0, rb: 1, door: { a: ix0 + 8, w: 6 } }, { axis: 'x', at: back, a0: ix1 - 12, a1: ix1, ra: 0, rb: 2, door: { a: ix1 - 6, w: 4 } }, { axis: 'z', at: ix1 - 12, a0: iz0, a1: back, ra: 1, rb: 2, door: null }], start: 0 };
  const B = body(K, {
    w, d, floors: 1, H, base, t, outer: mat('panel', 0xd8d4cc), plinth: S.plinth, plans: [P],
    roomMat: (R) => (R.kind === 'floor' ? mat('plaster', 0xe8ece4) : mat('plasterOld', 0xc8c0b0)),
    floorMat: (R) => (R.kind === 'floor' ? mat('tiles', 0xe0e0d8) : mat('concFloor')),
    doors: [{ side: 'pz', a: -w * 0.3, w: 6, kind: 'glass' }, { side: 'pz', a: w * 0.3, w: 6, kind: 'glass' }, { side: 'nz', a: 0, w: 8, h: 9, kind: 'metal' }],
    win: (side) => (side === 'pz' ? { w: 8, h: 7, sill: 1.5, every: 11, style: { glass: 0.5, board: 0.1, frame: mat('metal', 0x5a5e62, { p: 4 }), transom: false, single: true } } : null),
    roof: { kind: 'flat', mat: mat('concrete', 0x6a6864), parapet: 2.6 },
    furnish: (K2, R, f, y) => {
      if (R.kind === 'store') { for (let i = 0; i < 4; i++) Fu.rack(K2, ix0 + 5 + i * 8.5, y, iz0 + 1.3, 0, { w: 7.5, h: 9, shelves: 5, cat: 'shop' }); for (let i = 0; i < 3; i++) Fu.pallet(K2, ix0 + 6 + i * 7, y, back - 3.5, r(), { load: Fu.F.cardboard, loot: 'shop' }); dress(K2, new Layout(K2, R, y), y, 'store', {}); return; }
      if (R.kind === 'office') { furnishRoom(K2, R, y, 'office', { cat: 'office' }); return; }
      dress(K2, new Layout(K2, R, y), y, 'shop', { cat: 'shop' });
      const rows = Math.floor((ix1 - ix0 - 8) / 8);
      for (let i = 0; i < rows; i++) Fu.gondola(K2, ix0 + 6 + i * 8, y, (back + iz1) / 2 - 3, Math.PI / 2, { L: iz1 - back - 18, cat: 'shop' });
      for (let i = 0; i < 3; i++) Fu.counter(K2, -8 + i * 8, y, iz1 - 6, 0, { L: 4.5, cat: 'shop' });
    },
  });
  K.span(-w / 2 + 2, base + 9.6, d / 2, w / 2 - 2, base + 12.6, d / 2 + 0.3, mat('metal', 0xa83a2a, { p: 5 }), { col: false });
  K.sign(0, base + 11.1, d / 2 + 0.32, 26, 2.6, 'УНИВЕРСАМ', 'shop');
  return B;
}

// --- offices, police, medical, school --------------------------------------------------------------------------------------------
/**
 * A corridor building: floors of rooms off a central corridor, stairs at one end.
 * o: { outer, corridorMat, roomKind(R, f) -> kind, cat, sign, signStyle, roomW }
 */
function corridorBuilding(K, s, o) {
  const r = K.r, w = s.w, d = s.d, F = s.floors ?? o.floors ?? 2, t = 0.9, H = STOREY, base = 1.0;
  const ix0 = -w / 2 + t, ix1 = w / 2 - t, iz0 = -d / 2 + t, iz1 = d / 2 - t;
  const cw = 6.5, stairX = ix0 + 2.2;
  const plans = [];
  for (let f = 0; f < F; f++) {
    // the stair hall at the left end, then rooms either side of the corridor
    const P = corridorPlan({ x0: ix0 + 8, z0: iz0, x1: ix1, z1: iz1 }, cw, o.roomW ?? 11, r, { through: o.through });
    const hall = { x0: ix0, z0: iz0, x1: ix0 + 8, z1: iz1, kind: 'hall', hall: true };
    P.rooms.forEach((q) => { q.id += 1; });
    for (const wl of P.walls) { wl.ra += 1; wl.rb += 1; }
    P.rooms.unshift(hall); hall.id = 0;
    P.walls.push({ axis: 'z', at: ix0 + 8, a0: (iz0 + iz1) / 2 - cw / 2, a1: (iz0 + iz1) / 2 + cw / 2, ra: 0, rb: 1, door: null, open: true });
    // the stair hall and corridor are one space: no wall where they meet (an open doorway the corridor's width)
    const wl = P.walls[P.walls.length - 1]; wl.door = { a: (iz0 + iz1) / 2, w: cw - 0.6 };
    for (const R of P.rooms) R.kind = R.corridor ? 'corridor' : R.hall ? 'hall' : (o.roomKind ? o.roomKind(R, f, r) : 'office');
    plans.push(P);
  }
  const doors = [{ side: 'pz', a: ix0 + 5.5, w: 4.6, kind: o.frontDoor || 'wood', canopy: mat('concrete', 0x9a968e) }, { side: 'px', a: 0, w: 4.4, kind: 'metal' }];
  const B = body(K, {
    w, d, floors: F, H, base, t, outer: o.outer, plinth: S.plinth, band: o.band,
    plans,
    roomMat: (R) => (R.kind === 'corridor' || R.kind === 'hall' ? o.corridorMat || CORRIDOR_WALL : o.roomMat ? o.roomMat(R) : OFFICE_WALL),
    floorMat: (R) => (R.kind === 'corridor' || R.kind === 'hall' ? mat('linoleum', 0xc8d0c0) : o.floorMat ? o.floorMat(R) : mat('linoleum')),
    doors,
    win: { w: 4.2, h: 5, sill: 2.8, every: 9, style: { glass: 0.7, board: 0.08, curtains: o.curtains } },
    stairs: Array.from({ length: F - 1 }, (_, f) => ({ f, x: stairX, z: iz1 - 2.5, dir: 'nz', w: 3.8, run: 13 })),
    innerDoor: (wl) => (wl.open ? null : r() < 0.7 ? (o.innerDoor || 'wood') : null),
    roof: o.roof || { kind: 'flat', mat: mat('concrete', 0x6a6864), parapet: 1.6 },
    furnish: (K2, R, f, y) => {
      if (R.kind === 'corridor' || R.kind === 'hall') { furnishRoom(K2, R, y, 'corridor', { cat: o.cat || 'office' }); return; }
      if (o.furnish) o.furnish(K2, R, f, y, plans[f]);
      else furnishRoom(K2, R, y, R.kind, { cat: o.cat || 'office' });
    },
  });
  if (o.sign) K.sign(ix0 + 5.5, base + 8.9, d / 2 + 0.3, Math.max(8, o.sign.length * 1.7), 1.6, o.sign, o.signStyle || 'plaque');
  return B;
}

export function office(K, s) {
  const r = K.r;
  return corridorBuilding(K, s, { outer: r() < 0.5 ? mat('stucco', pick(r, PLASTER)) : mat('panel', 0xd0ccc4), band: mat('concrete', 0xa8a49c), cat: 'office', sign: pick(r, ['АДМИНИСТРАЦИЯ', 'ПОЧТА', 'КОНТОРА']), roomKind: () => 'office' });
}

export function police(K, s) {
  const r = K.r;
  let armory = false;
  const B = corridorBuilding(K, s, {
    outer: mat('plaster', 0xe0e4e8), band: mat('metal', 0x2a4a8a, { p: 5 }), cat: 'police', sign: 'МИЛИЦИЯ', signStyle: 'police', frontDoor: 'metal', innerDoor: 'metal',
    roomKind: (R, f) => (f === 0 && R.side > 0 && R.x1 > s.w / 2 - 14 ? 'cells' : 'office'),
    furnish: (K2, R, f, y) => {
      const cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2, back = R.side < 0 ? R.z0 : R.z1, face = R.side < 0 ? 0 : Math.PI;
      if (R.kind === 'cells') {
        // a row of cells behind bars
        Fu.bars(K2, R.x0 + 0.5, R.x1 - 0.5, R.side > 0 ? R.z0 + 4.5 : R.z1 - 4.5, y);
        Fu.bunk(K2, cx, y, back + (R.side < 0 ? 2 : -2), Math.PI / 2, { cat: 'police', blanket: Fu.F.fabric[1] });
        dress(K2, new Layout(K2, R, y), y, 'cells', { cat: 'police' });
        return;
      }
      if (!armory && f === 0) { armory = true; furnishRoom(K2, R, y, 'armory', { cat: 'police' }); return; }
      furnishRoom(K2, R, y, r() < 0.2 ? 'dorm' : 'office', { cat: 'police' });
      void cx; void cz; void back; void face;
    },
  });
  return B;
}

export function clinic(K, s, big = false) {
  const r = K.r;
  return corridorBuilding(K, s, {
    outer: mat('plaster', big ? 0xe8ecec : pick(r, [0xe0ece0, 0xf0ece4])), band: mat('concrete', 0xb8b4ac), cat: 'medical', sign: big ? 'БОЛЬНИЦА' : 'ПОЛИКЛИНИКА', signStyle: 'medical',
    roomMat: () => mat('whiteTiles', 0xe8f0ec), corridorMat: mat('plaster', 0xc8dcd0), floorMat: () => mat('linoleum', 0xd8e0d8), innerDoor: 'wood',
    furnish: (K2, R, f, y) => furnishRoom(K2, R, y, r() < 0.62 ? 'ward' : 'office', { cat: 'medical' }),
  });
}

export function hospital(K, s) { const B = clinic(K, { ...s, floors: 3 }, true); K.sign(s.w / 2 - 4, 1 + 31, s.d / 2 + 0.3, 3, 3, '+', 'cross'); return B; }

export function school(K, s) {
  const r = K.r;
  return corridorBuilding(K, s, {
    outer: mat('brick', pick(r, [0xffffff, 0xe8d8c8])), band: mat('concrete', 0xb8b4ac), cat: 'school', sign: 'ШКОЛА', roomW: 13,
    furnish: (K2, R, f, y) => furnishRoom(K2, R, y, r() < 0.8 ? 'classroom' : 'office', { cat: 'school' }),
  });
}

// --- church ---------------------------------------------------------------------------------------------------------------------
/** An Orthodox church: a nave, an apse, a bell tower over the door, onion domes. */
export function church(K, s) {
  const r = K.r, w = s.w, d = s.d, t = 1.2, H = 17, base = 1.4;
  const outer = mat('plaster', pick(r, [0xf0ece0, 0xe8dcc0, 0xd8e0e8])), roof = mat('metal', pick(r, [0x3a6a4a, 0x2a4a6a, 0x6a6a6a]), { p: 4 });
  const gold = mat('metal', 0xd8a840, { p: 5, r: 70 });
  const ix0 = -w / 2 + t, ix1 = w / 2 - t;
  // the nave (the tower stands in front, at +z)
  K.push(0, 0, -4, 0);
  const nd = d - 8;
  const P2 = { rooms: [{ x0: ix0, z0: -nd / 2 + t, x1: ix1, z1: nd / 2 - t, kind: 'nave', id: 0 }], walls: [], start: 0 };
  const B = body(K, {
    w, d: nd, floors: 1, H, base, t, outer, plinth: S.stoneBase, plans: [P2],
    roomMat: () => mat('plaster', 0xe8dcc0), floorMat: () => mat('stone', 0xc8c0b8, { scale: 14 }),
    doors: [{ side: 'pz', a: 0, w: 5.5, h: 10, kind: 'wood' }],
    win: (side) => (side === 'px' || side === 'nx' ? { w: 3, h: 7, sill: 6, every: 9, style: { glass: 0.6, board: 0.1, frame: mat('woodFine', 0x6a4a30) } } : null),
    roof: { kind: 'gable', mat: roof, rise: w * 0.42, axis: 'z', over: 1 },
    furnish: (K2, R, f, y) => {
      // the iconostasis at the far end, candle stands, a few benches by the walls
      K2.span(ix0 + 1, y, -nd / 2 + t + 3, ix1 - 1, y + 11, -nd / 2 + t + 3.6, { side: mat('woodFine', 0x8a5a30), pz: gold }, { col: true });
      for (let i = 0; i < 4; i++) K2.cyl(-5 + i * 3.3, y, -nd / 2 + t + 7, 0.3, 3.4, gold, { col: false });
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) Fu.table(K2, sx * (w / 2 - 3.5), y, -4 + i * 8, Math.PI / 2, { w: 6, d: 1.6, h: 1.6, m: Fu.F.woodDark, loot: i === 1, cat: 'church' });
      K2.lootAt(0, y + 0.05, 0, 'church', { spread: 4 });
    },
  });
  // the apse at the back: a half drum
  K.lathe(0, base, -nd / 2 - 0.5, [[w * 0.32, 0], [w * 0.32, H * 0.75]], outer, { seg: 12 });
  K.lathe(0, base + H * 0.75, -nd / 2 - 0.5, [[w * 0.34, 0], [w * 0.1, w * 0.18], [0.1, w * 0.2]], roof, { seg: 12 });
  // the main drum and onion dome over the middle
  const top = base + H + w * 0.42;
  K.lathe(0, top - 2, 0, [[3.2, 0], [3.2, 6]], outer, { seg: 12 });
  onion(K, 0, top + 4, 0, 4.2, roof, gold);
  K.pop();
  // the bell tower at the front
  const tz = d / 2 - 4.5, tw = 4.5;
  K.span(-tw, 0, tz - tw, tw, base + 26, tz + tw, outer, { skip: 'ny' });
  K.span(-tw - 0.3, base + 26, tz - tw - 0.3, tw + 0.3, base + 26.6, tz + tw + 0.3, S.sill, {});
  // the open belfry
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.span(sx * tw - 0.8 * (sx > 0 ? 1 : 0) - (sx < 0 ? 0 : 0), base + 26.6, sz * tw + tz - (sz > 0 ? 1 : 0), sx * tw + (sx < 0 ? 1 : 0), base + 33, sz * tw + tz + (sz < 0 ? 1 : 0), outer, {});
  K.span(-tw - 0.3, base + 33, tz - tw - 0.3, tw + 0.3, base + 34, tz + tw + 0.3, outer, {});
  K.lathe(0, base + 34, tz, [[tw * 1.25, 0], [0.6, 7]], roof, { seg: 4, ry: Math.PI / 4 });
  onion(K, 0, base + 40, tz, 2.2, roof, gold);
  K.sign(0, base + 13, tz + tw + 0.3, 3, 3, '☦', 'icon');
  return B;
}
/** An onion dome with a cross on top. */
function onion(K, x, y, z, R, m, gold) {
  K.lathe(x, y, z, [[R * 0.75, 0], [R, R * 0.5], [R * 0.95, R * 0.95], [R * 0.6, R * 1.45], [R * 0.2, R * 1.85], [0.12, R * 2.2]], gold, { seg: 14 });
  K.box(x, y + R * 2.2 + 1.6, z, 0.12, 1.6, 0.12, gold, { col: false });
  K.box(x, y + R * 2.2 + 2.3, z, 0.9, 0.1, 0.1, gold, { col: false });
}

// --- fire station ------------------------------------------------------------------------------------------------------------------
export function fireStation(K, s) {
  const r = K.r, w = s.w, d = s.d, t = 0.9, base = 0.6;
  const outer = mat('brick', pick(r, [0xffffff, 0xd8c8b8]));
  // the garage hall on the left, a two-storey block on the right
  const gw = w * 0.55;
  K.push(-w / 2 + gw / 2, 0, 0, 0);
  const G = { rooms: [{ x0: -gw / 2 + t, z0: -d / 2 + t, x1: gw / 2 - t, z1: d / 2 - t, kind: 'garage', id: 0 }], walls: [], start: 0 };
  body(K, {
    w: gw, d, floors: 1, H: 14, base, t, outer, plinth: S.plinth, plans: [G],
    roomMat: () => mat('plasterOld', 0xc8c0b0), floorMat: () => mat('concFloor'),
    doors: [{ side: 'pz', a: -gw / 4, w: 9, h: 11, kind: null }, { side: 'pz', a: gw / 4, w: 9, h: 11, kind: null }],
    win: (side) => (side === 'nz' ? { w: 4, h: 3, sill: 7, every: 9, style: { glass: 0.5 } } : null),
    roof: { kind: 'flat', mat: mat('concrete', 0x6a6864), parapet: 1.2 },
    furnish: (K2, R, f, y) => {
      if (r() < 0.6) vehicle(K2, -gw / 4, y, 1, 0, 'truck', { colour: 0xb82a20 });
      Fu.rack(K2, gw / 2 - 2.2, y, -d / 4, -Math.PI / 2, { w: 8, cat: 'industrial' });
      Fu.workbench(K2, 0, y, -d / 2 + 2.6, 0, { cat: 'industrial' });
      Fu.locker(K2, -gw / 2 + 1.8, y, -d / 4, Math.PI / 2, { n: 4, cat: 'fire' });
      dress(K2, new Layout(K2, R, y), y, 'garage', { cat: 'industrial' });
    },
  });
  K.pop();
  K.push(gw / 2, 0, 0, 0);
  const bw = w - gw;
  const P0 = plan({ x0: -bw / 2 + t, z0: -d / 2 + t, x1: bw / 2 - t, z1: d / 2 - t }, 3, r, { min: 8, start: (q) => q.z1 > d / 2 - t - 0.1 });
  P0.rooms.forEach((R) => { R.kind = 'office'; });
  body(K, {
    w: bw, d, floors: 2, base, t, outer, plinth: S.plinth, plans: [P0],
    roomMat: () => OFFICE_WALL, floorMat: () => mat('linoleum'),
    doors: [{ side: 'pz', a: 0, kind: 'wood' }, { side: 'nx', a: 0, kind: 'wood', f: 0 }],
    win: { w: 3.8, h: 4.6, sill: 3, every: 9, style: { glass: 0.7 } },
    stairs: [{ f: 0, x: bw / 2 - t - 2.1, z: d / 2 - t - 3, dir: 'nz', w: 3.6, run: 13 }],
    roof: { kind: 'flat', mat: mat('concrete', 0x6a6864), parapet: 1.2 },
    furnish: (K2, R, f, y) => furnishRoom(K2, R, y, f === 1 && r() < 0.5 ? 'dorm' : 'office', { cat: 'fire' }),
  });
  K.pop();
  // the drying tower for the hoses
  K.span(w / 2 - 6, 0, -d / 2 - 6, w / 2, 32, -d / 2, outer, { skip: 'ny' });
  K.span(w / 2 - 6.3, 32, -d / 2 - 6.3, w / 2 + 0.3, 33, -d / 2 + 0.3, mat('concrete', 0x8a8680), {});
  K.sign(-w / 2 + gw / 2, base + 15.2, d / 2 + 0.3, 20, 1.8, 'ПОЖАРНАЯ ЧАСТЬ', 'fire');
}

export const CIVIC = { apartment, shop, supermarket, office, police, clinic, hospital, school, church, fireStation };
void wall; void doorIn;
