// Houses: village houses of one storey, town houses of two, wooden cottages,
// and the farm's barn and sheds. Plastered (cream, ochre, pale green, pale
// blue), brick or painted boards; tiled, slated or painted tin roofs; shutters
// in the villages; a fenced yard with a shed and a vegetable patch.
import { mat } from './kit.js';
import { S, plan } from './parts.js';
import { body } from './body.js';
import { crate, barrel, workbench, rack, pallet, F } from './furniture.js';
import { furnishRoom } from './interior.js';
import { fence, woodpile, well, vehicle } from './props.js';

export const PLASTER = [0xe8dcc0, 0xd8c8a0, 0xc8d4c0, 0xc0ccd8, 0xe0c8b8, 0xf0ece0, 0xd0b890, 0xb8c8b0, 0xe8d0a8];
export const ROOFS = () => [
  mat('roofTile', 0xffffff), mat('roofTile', 0xc8a898), mat('roofSlate', 0xffffff), mat('roofSlate', 0xa8a0a0),
  mat('metal', 0x5a7a5a, { p: 4 }), mat('metal', 0x8a3a2a, { p: 4 }), mat('metal', 0x6a7078, { p: 4 }), mat('metalRust', 0xffffff),
];
const pick = (r, a) => a[Math.floor(r() * a.length)];

function houseWalls(r, rural) {
  const k = r();
  if (rural && k < 0.25) return mat('woodPaint', pick(r, [0xffffff, 0xa8c0b0, 0xc8b098, 0xa0b0c8]));
  if (k < 0.45) return mat('plaster', pick(r, PLASTER));
  if (k < 0.65) return mat('plasterOld', pick(r, PLASTER));
  if (k < 0.82) return mat('brick', pick(r, [0xffffff, 0xe8d8d0, 0xd0c0b8]));
  return mat('stucco', pick(r, PLASTER));
}

/** Rooms of a house floor: kinds for each room. */
function assignKinds(rooms, kinds) {
  const byArea = [...rooms].filter((q) => !q.hall).sort((a, b) => (a.x1 - a.x0) * (a.z1 - a.z0) - (b.x1 - b.x0) * (b.z1 - b.z0));
  const list = [...kinds];
  // the smallest is the bathroom if asked for, the biggest the living room
  if (list.includes('bath') && byArea.length > 2) { byArea[0].kind = 'bath'; list.splice(list.indexOf('bath'), 1); byArea.shift(); }
  if (list.includes('living') && byArea.length) { byArea[byArea.length - 1].kind = 'living'; list.splice(list.indexOf('living'), 1); byArea.pop(); }
  for (const R of byArea) R.kind = list.shift() || 'bedroom';
}

function doorsOf(P, R) {
  const out = [];
  for (const wl of P.walls) if (wl.door && (P.rooms[wl.ra] === R || P.rooms[wl.rb] === R)) out.push(wl.axis === 'x' ? { x: wl.door.a, z: wl.at } : { x: wl.at, z: wl.door.a });
  return out;
}

/**
 * A house: s.floors 1 or 2; s.w, s.d its size; s.rural for shutters and boards; s.yard to fence a yard.
 */
export function house(K, s) {
  const r = K.r, w = s.w, d = s.d, two = (s.floors ?? 1) > 1, t = 0.8, base = 1.2;
  const ix0 = -w / 2 + t, ix1 = w / 2 - t, iz0 = -d / 2 + t, iz1 = d / 2 - t;
  const wm = s.wallMat || houseWalls(r, s.rural);
  const roof = s.roofMat || pick(r, ROOFS());
  const rooms = WALLS_FOR(r);
  const flip = r() < 0.5; // hall on the left or right
  let plans, stairsList = [], doorA;
  if (two) {
    const hw = 7.6;
    const hall = flip ? { x0: ix1 - hw, z0: iz0, x1: ix1, z1: iz1, keep: true, hall: true } : { x0: ix0, z0: iz0, x1: ix0 + hw, z1: iz1, keep: true, hall: true };
    const rest = flip ? { x0: ix0, z0: iz0, x1: ix1 - hw, z1: iz1 } : { x0: ix0 + hw, z0: iz0, x1: ix1, z1: iz1 };
    const sx = flip ? ix1 - 2.05 : ix0 + 2.05;
    stairsList = [{ f: 0, x: sx, z: iz1 - 3.2, dir: 'nz', w: 3.6, run: 13 }];
    doorA = flip ? ix1 - 3.0 : ix0 + 3.0;
    const p0 = plan(rest, 2 + (r() < 0.6 ? 1 : 0), r, { rooms: [hall, rest], min: 8, start: (q) => q.hall });
    const p1 = plan(rest, 2 + (r() < 0.6 ? 1 : 0), r, { rooms: [hall, rest], min: 8, start: (q) => q.hall });
    assignKinds(p0.rooms, ['kitchen', 'living', 'bath']);
    assignKinds(p1.rooms, ['bedroom', 'bedroom', 'bath']);
    for (const P of [p0, p1]) for (const R of P.rooms) if (R.hall) R.kind = 'hall';
    plans = [p0, p1];
  } else {
    doorA = ix0 + 3 + r() * (ix1 - ix0 - 6);
    const n = w * d > 420 ? 4 : 3;
    const p0 = plan({ x0: ix0, z0: iz0, x1: ix1, z1: iz1 }, n, r, { min: 7.5, start: (q) => doorA > q.x0 && doorA < q.x1 && q.z1 > iz1 - 0.1 });
    assignKinds(p0.rooms, n === 4 ? ['living', 'kitchen', 'bedroom', 'bath'] : ['living', 'kitchen', 'bedroom']);
    plans = [p0];
  }
  const doors = [{ side: 'pz', a: doorA, kind: 'wood', canopy: r() < 0.5 ? S.fascia : null }];
  if (r() < 0.45) doors.push({ side: 'nz', a: (r() - 0.5) * (w - 8), kind: r() < 0.7 ? 'wood' : null });
  const winStyle = { shutters: s.rural && r() < 0.6, curtains: true, board: s.rural ? 0.12 : 0.06, glass: 0.75 };
  const roofKind = r() < 0.8 ? 'gable' : 'hip';
  const B = body(K, {
    w, d, floors: two ? 2 : 1, base, t,
    outer: wm, plinth: r() < 0.5 ? S.plinth : S.stoneBase,
    plans,
    roomMat: (R) => rooms[(R.id * 7 + 3) % rooms.length],
    floorMat: (R) => (R.kind === 'bath' || R.kind === 'kitchen' ? pick(r, [mat('tiles'), mat('linoleum')]) : R.kind === 'hall' ? mat('woodFloor', 0xc8b8a0) : mat('woodFloor')),
    doors,
    win: { w: 3.6, h: 4.4, sill: 3, every: 8.5, style: winStyle },
    stairs: stairsList,
    roof: { kind: roofKind, mat: roof, rise: (two ? 0.34 : 0.4) * Math.min(w, d), axis: w >= d ? 'x' : 'z', over: 1.4 },
    band: two && r() < 0.5 ? S.sill : null,
    furnish: (K2, R, f, y) => furnishRoom(K2, R, y, R.kind, { cat: s.cat || 'home' }),
  });
  // a chimney
  if (r() < 0.7) {
    const cx = (r() - 0.5) * w * 0.5, cz = (r() - 0.5) * d * 0.3;
    K.span(cx - 0.9, B.top, cz - 0.9, cx + 0.9, B.top + Math.min(w, d) * 0.42 + 3, cz + 0.9, mat('brick', 0xc8b0a0), { col: false, skip: 'ny' });
    K.span(cx - 1.1, B.top + Math.min(w, d) * 0.42 + 3, cz - 1.1, cx + 1.1, B.top + Math.min(w, d) * 0.42 + 3.4, cz + 1.1, S.plinth, { col: false });
  }
  if (s.yard) yard(K, s, B);
  return B;
}
function WALLS_FOR(r) {
  const all = [mat('plaster', 0xf0e8d4), mat('plaster', 0xe0e8d8), mat('plaster', 0xf0dcb8, { p: 1 }), mat('plaster', 0xd8e4d0, { p: 2 }), mat('plaster', 0xf0d4c4, { p: 1 }), mat('plasterOld', 0xe0d8c8), mat('plaster', 0xc8d8e8, { p: 2 }), mat('plaster', 0xd8e4ec), mat('plaster', 0xe8dcb8, { p: 2 }), mat('wallpaper', 0xf0e0c0, { p: 1 }), mat('plaster', 0xe8c8a0, { p: 1 })];
  const out = [];
  for (let i = 0; i < 5; i++) out.push(all[Math.floor(r() * all.length)]);
  return out;
}

/** The yard round a village house: a fence with a gate, maybe a shed, a woodpile, a well, a vegetable patch. */
function yard(K, s, B) {
  const r = K.r, y = s.yard;
  const x0 = -s.w / 2 - y.side, x1 = s.w / 2 + y.side, z0 = -s.d / 2 - y.back, z1 = s.d / 2 + y.front;
  const kind = s.fence || (r() < 0.6 ? 'picket' : r() < 0.6 ? 'boards' : 'wire');
  const gate = (r() - 0.5) * s.w * 0.4;
  fence(K, x0, z1, gate - 3, z1, kind);
  fence(K, gate + 3, z1, x1, z1, kind);
  fence(K, x1, z1, x1, z0, kind);
  fence(K, x1, z0, x0, z0, kind);
  fence(K, x0, z0, x0, z1, kind);
  K.lootAt(gate, 0.05, z1 - 2, 'home', { spread: 2 });
  // round the back: a shed, a woodpile, a well
  const backZ = (z0 - s.d / 2) / 2;
  if (y.back > 9) {
    if (r() < 0.55) { K.push((r() - 0.5) * (s.w - 8), 0, backZ, (r() < 0.5 ? 0 : Math.PI)); shed(K, { w: 9, d: 7, seed: s.seed + 7 }); K.pop(); }
    else if (r() < 0.6) woodpile(K, x0 + 3, 0, backZ, Math.PI / 2);
    if (r() < 0.25) well(K, x1 - 3.5, 0, backZ);
  }
  if (y.side > 8 && r() < 0.6) {
    // a vegetable patch
    const px = r() < 0.5 ? x0 + y.side / 2 : x1 - y.side / 2;
    for (let i = 0; i < 5; i++) K.box(px, 0.25, -s.d / 2 + 2 + i * 2.6, y.side / 2 - 1.2, 0.3, 0.7, mat('track', 0x8a7058), { col: false });
  }
}

/** A wooden cottage: one storey, two or three rooms, a porch. */
export function cottage(K, s) {
  const r = K.r, w = s.w, d = s.d, t = 0.7;
  const ix0 = -w / 2 + t, ix1 = w / 2 - t, iz0 = -d / 2 + t, iz1 = d / 2 - t;
  const doorA = ix0 + 2.8 + r() * (ix1 - ix0 - 5.6);
  const P = plan({ x0: ix0, z0: iz0, x1: ix1, z1: iz1 }, r() < 0.5 ? 2 : 3, r, { min: 7, start: (q) => doorA > q.x0 && doorA < q.x1 && q.z1 > iz1 - 0.1 });
  assignKinds(P.rooms, ['living', 'kitchen', 'bedroom']);
  const B = body(K, {
    w, d, floors: 1, base: 1.4, t, it: 0.4,
    outer: mat(r() < 0.5 ? 'planks' : 'woodPaint', pick(r, [0xffffff, 0xc8b8a0, 0xa8b8a8, 0xb8a890])), plinth: S.stoneBase,
    plans: [P],
    roomMat: () => mat('planks', 0xd8c8b0),
    floorMat: () => mat('woodFloor', 0xc0a888),
    doors: [{ side: 'pz', a: doorA, kind: 'plank', canopy: null }],
    win: { w: 3, h: 3.8, sill: 3.2, every: 8, style: { shutters: r() < 0.7, board: 0.15, glass: 0.7, curtains: true, frame: mat('woodFine', 0xe8e0d0, { p: 4 }) } },
    roof: { kind: 'gable', mat: pick(r, [mat('metalRust'), mat('roofSlate', 0x9a9090), mat('metal', 0x5a6a5a, { p: 4 }), mat('planks', 0x8a7a68)]), rise: 0.42 * Math.min(w, d), axis: w >= d ? 'x' : 'z', over: 1.2 },
    furnish: (K2, R, f, y) => furnishRoom(K2, R, y, R.kind, { cat: s.cat || 'home' }),
  });
  // the porch
  if (r() < 0.7) {
    const pd = 4.5;
    K.span(-w / 2 + 1, 0, d / 2, w / 2 - 1, 1.3, d / 2 + pd, mat('planks', 0xb0a088), { skip: 'ny' });
    for (const px of [-w / 2 + 1.4, w / 2 - 1.4]) K.box(px, 5.0, d / 2 + pd - 0.4, 0.3, 3.7, 0.3, S.fascia, { col: true });
    K.quad([-w / 2 + 0.6, 8.6, d / 2 + pd + 0.4], [w / 2 - 0.6, 8.6, d / 2 + pd + 0.4], [w / 2 - 0.6, 10, d / 2], [-w / 2 + 0.6, 10, d / 2], mat('metal', 0x6a6a5a, { p: 4 }), { back: S.fascia });
  }
  if (s.yard) yard(K, s, B);
  return B;
}

/** A shed: planks or tin, one room, a workbench or junk, a door. */
export function shed(K, s) {
  const r = K.r, w = s.w ?? 9, d = s.d ?? 7, h = 8;
  const m = r() < 0.5 ? mat('planks', pick(r, [0xffffff, 0xb8a890, 0x9a8a78])) : mat(r() < 0.5 ? 'metalRust' : 'metal', 0x8a9088, { p: r() < 0.5 ? 4 : 0 });
  const P = plan({ x0: -w / 2 + 0.4, z0: -d / 2 + 0.4, x1: w / 2 - 0.4, z1: d / 2 - 0.4 }, 1, r);
  const B = body(K, {
    w, d, floors: 1, H: h, base: 0.3, t: 0.4,
    outer: m, plinth: S.plinth, plans: [P],
    roomMat: () => m, floorMat: () => mat('planks', 0x8a7a68),
    doors: [{ side: 'pz', a: (r() - 0.5) * (w - 5), w: 4, h: 6.8, kind: 'plank' }],
    win: (side) => (side === 'px' && r() < 0.5 ? { w: 2.6, h: 2.4, sill: 3.4, every: 20, max: 1, style: { glass: 0.5, board: 0.2 } } : null),
    roof: { kind: 'shed', mat: pick(r, [mat('metalRust'), mat('metal', 0x6a6e6a, { p: 4 }), mat('roofSlate', 0x8a8a8a)]), rise: 2.2, over: 0.8 },
    furnish: (K2, R, f, y) => {
      if (r() < 0.5) workbench(K2, 0, y, -d / 2 + 2.2, 0, { L: Math.min(7, w - 2), cat: s.cat || 'industrial' });
      else { rack(K2, 0, y, -d / 2 + 1.6, 0, { w: Math.min(7, w - 2), h: 6, cat: s.cat || 'industrial' }); if (r() < 0.5) barrel(K2, w / 2 - 1.8, y, d / 2 - 2.2); }
    },
  });
  return B;
}

/** A barn: a big timber hall with a hay loft, wide doors at both ends. */
export function barn(K, s) {
  const r = K.r, w = s.w ?? 26, d = s.d ?? 40, H = 13;
  const m = mat(r() < 0.6 ? 'planks' : 'woodPaint', pick(r, [0xffffff, 0xa86050, 0x9a8a78, 0xc8b8a0]));
  const P = plan({ x0: -w / 2 + 0.6, z0: -d / 2 + 0.6, x1: w / 2 - 0.6, z1: d / 2 - 0.6 }, 1, r);
  P.rooms[0].tag = 'barn';
  const B = body(K, {
    w, d, floors: 1, H, base: 0.3, t: 0.6,
    outer: m, plinth: S.stoneBase, plans: [P],
    roomMat: () => m, floorMat: () => mat('track', 0x9a8a70),
    doors: [{ side: 'pz', a: 0, w: 9, h: 10, kind: null }, { side: 'nz', a: 0, w: 9, h: 10, kind: null }],
    win: (side) => (side === 'px' || side === 'nx' ? { w: 2.4, h: 2.4, sill: 7, every: 10, style: { glass: 0.2, board: 0.3 } } : null),
    roof: { kind: 'gable', mat: pick(r, [mat('metalRust'), mat('metal', 0x7a3a2a, { p: 4 }), mat('roofSlate', 0x8a8a8a)]), rise: w * 0.42, axis: 'z', over: 1 },
    furnish: (K2, R, f, y) => {
      // the loft along one side, a ladder up to it
      const lw = w * 0.38, lx = w / 2 - 0.6 - lw / 2;
      K2.span(lx - lw / 2, y + 7.2, -d / 2 + 0.6, lx + lw / 2, y + 7.7, d / 2 - 0.6, { top: mat('planks', 0xb0a080), bottom: mat('planks', 0x8a7a60), side: mat('planks', 0x8a7a60) }, { ao: 0.45 });
      for (let i = 0; i < 4; i++) K2.box(lx - lw / 2 + 0.3, y + 3.6, -d / 2 + 4 + i * (d - 8) / 3, 0.3, 3.6, 0.3, S.fascia, {});
      ladder(K2, lx - lw / 2 - 0.5, y, d / 2 - 6, 7.7, Math.PI / 2);
      // hay up there and down here
      for (let i = 0; i < 7; i++) hay(K2, lx + (r() - 0.5) * (lw - 4), y + 7.7, -d / 2 + 4 + r() * (d - 8));
      for (let i = 0; i < 5; i++) hay(K2, -w / 2 + 4 + r() * (w * 0.4), y, -d / 2 + 4 + r() * (d - 8));
      K2.lootAt(lx, y + 7.75, (r() - 0.5) * d * 0.6, 'farm');
      K2.lootAt(-w / 4, y + 0.05, (r() - 0.5) * d * 0.5, 'farm', { spread: 3 });
      if (r() < 0.6) workbench(K2, -w / 2 + 2.2, y, (r() - 0.5) * d * 0.4, Math.PI / 2, { cat: 'farm' });
      for (let i = 0; i < 3; i++) if (r() < 0.5) barrel(K2, -w / 2 + 2 + r() * 4, y, -d / 2 + 2.5 + r() * 4);
      if (r() < 0.6) vehicle(K2, -w / 6, y, d / 6, r() * 0.4 - 0.2, 'tractor');
    },
  });
  return B;
}

/** A round bale of hay, standing. */
export function hay(K, x, y, z) {
  K.cyl(x, y, z, 1.9, 3.4, mat('fabric', 0xd8b868), { seg: 10, top: mat('fabric', 0xc8a050), mat: 'cloth', foot: true });
}

/** A ladder: rungs between two rails, height h, climbed (by the player) from the -z side of its frame, facing +z. */
export function ladder(K, x, y, z, h, yaw = 0) {
  K.push(x, y, z, yaw);
  for (const s of [-1, 1]) K.box(s * 0.8, h / 2, 0, 0.12, h / 2, 0.12, S.fascia, { col: false });
  const n = Math.round(h / 0.9);
  for (let i = 1; i <= n; i++) K.box(0, i * h / n - 0.1, 0, 0.8, 0.06, 0.08, S.fascia, { col: false });
  K.ladderAt(0, 0, 0, h);
  K.pop();
}

export const HOUSES = { house, cottage, shed, barn };
export { crate, pallet, F };
