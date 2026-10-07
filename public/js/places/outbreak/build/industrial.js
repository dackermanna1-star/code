// Garages, warehouses, the factory, the petrol station, the farm silo, and
// the port's cranes, container yards and quay.
import { mat } from './kit.js';
import { S, plan } from './parts.js';
import { body } from './body.js';
import * as Fu from './furniture.js';
import { furnishRoom } from './interior.js';
import { container, tyres, vehicle, fence, forklift } from './props.js';
import { PLASTER } from './houses.js';

const pick = (r, a) => a[Math.floor(r() * a.length)];
const CONTAINER_TINTS = [0xffffff, 0x8a3a2a, 0x2a4a7a, 0x3a6a3a, 0xc87a2a, 0x7a7a7a, 0x9a2a2a, 0x2a6a7a];

/** A row of lock-up garages, each with two swing doors. */
export function garages(K, s) {
  const r = K.r, w = s.w, d = s.d, H = 9, gw = 11;
  const n = Math.max(2, Math.floor(w / gw));
  const outer = s.military ? mat('plaster', 0x9a9a88) : pick(r, [mat('brick', 0xd0c0b0), mat('plasterOld', pick(r, PLASTER)), mat('concrete', 0xb8b4ac)]);
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + gw * (i + 0.5);
    K.push(cx, 0, 0, 0);
    const P = { rooms: [{ x0: -gw / 2 + 0.5, z0: -d / 2 + 0.5, x1: gw / 2 - 0.5, z1: d / 2 - 0.5, kind: 'garage', id: 0 }], walls: [], start: 0 };
    const open = r() < 0.55;
    body(K, {
      w: gw, d, floors: 1, H, base: 0.3, t: 0.5, outer, plinth: S.plinth, plans: [P],
      roomMat: () => mat('plasterOld', 0xb8b0a0), floorMat: () => mat('concFloor'),
      doors: [{ side: 'pz', a: -2.25, w: 4.5, h: 7.8, kind: 'metal', hinge: -1, open: open ? 1 : 0 }, { side: 'pz', a: 2.25, w: 4.5, h: 7.8, kind: 'metal', hinge: 1, open: open ? 1 : 0 }],
      win: () => null,
      roof: { kind: 'flat', mat: mat('metalRust'), parapet: 0.6 },
      furnish: (K2, R, f, y) => {
        if (r() < 0.4) vehicle(K2, 0, y, 0.5, Math.PI, s.military ? 'military' : r() < 0.6 ? 'sedan' : 'hatch');
        else { furnishRoom(K2, R, y, 'garage', { cat: s.military ? 'military' : 'industrial' }); if (r() < 0.6) tyres(K2, 3, y, 3); }
      },
    });
    K.pop();
  }
}

/** A warehouse: one big hall, roller doors half up, racks and pallets. */
export function warehouse(K, s) {
  const r = K.r, w = s.w, d = s.d, H = 15, t = 0.8;
  const metal = r() < 0.55;
  const outer = metal ? mat(r() < 0.5 ? 'metal' : 'metalRust', pick(r, [0x9aa0a0, 0x8a9aa8, 0xa89a8a]), { p: r() < 0.5 ? 4 : 0 }) : mat('brick', pick(r, [0xffffff, 0xd8c8b8]));
  const ix0 = -w / 2 + t, ix1 = w / 2 - t, iz0 = -d / 2 + t, iz1 = d / 2 - t;
  const office = r() < 0.6;
  const rooms = [{ x0: ix0, z0: iz0, x1: office ? ix1 - 10 : ix1, z1: iz1, kind: 'hall', id: 0 }];
  if (office) rooms.push({ x0: ix1 - 10, z0: iz1 - 12, x1: ix1, z1: iz1, kind: 'office', id: 1 }, { x0: ix1 - 10, z0: iz0, x1: ix1, z1: iz1 - 12, kind: 'store', id: 2 });
  const walls = office ? [
    { axis: 'z', at: ix1 - 10, a0: iz1 - 12, a1: iz1, ra: 0, rb: 1, door: { a: iz1 - 6, w: 4 } },
    { axis: 'z', at: ix1 - 10, a0: iz0, a1: iz1 - 12, ra: 0, rb: 2, door: { a: iz0 + 6, w: 4.4 } },
    { axis: 'x', at: iz1 - 12, a0: ix1 - 10, a1: ix1, ra: 1, rb: 2, door: null },
  ] : [];
  const B = body(K, {
    w, d, floors: 1, H, base: 0.5, t, outer, plinth: S.plinth, plans: [{ rooms, walls, start: 0 }],
    roomMat: (R) => (R.kind === 'office' ? mat('plaster', 0xd8dcd0) : metal ? outer : mat('brickOld', 0xd0c8c0)), floorMat: (R) => (R.kind === 'office' ? mat('linoleum') : mat('concFloor')),
    doors: [{ side: 'pz', a: -w / 4, w: 10, h: 11, kind: null }, { side: 'nz', a: w / 5, w: 10, h: 11, kind: null }, { side: 'pz', a: w / 2 - 6, w: 4.2, kind: 'metal' }],
    win: (side) => (side === 'px' || side === 'nx' ? { w: 6, h: 2.6, sill: 10.5, every: 9, style: { glass: 0.5, board: 0.1, transom: false } } : null),
    roof: { kind: 'gable', mat: mat(r() < 0.5 ? 'metal' : 'metalRust', 0x8a8e8a), rise: Math.min(w, d) * 0.14, axis: w >= d ? 'x' : 'z', over: 0.8 },
    furnish: (K2, R, f, y) => {
      if (R.kind === 'office') { furnishRoom(K2, R, y, 'office', { cat: 'office' }); return; }
      if (R.kind === 'store') { furnishRoom(K2, R, y, 'store', { cat: 'industrial' }); return; }
      // rows of racks down the hall, pallets and crates between
      const rows = Math.max(1, Math.floor((R.z1 - R.z0 - 14) / 10));
      for (let i = 0; i < rows; i++) for (let j = 0; j < Math.floor((R.x1 - R.x0 - 6) / 9); j++) if (r() < 0.8) Fu.rack(K2, R.x0 + 6 + j * 9, y, R.z0 + 6 + i * 10, 0, { w: 8, h: 10, shelves: 5, cat: 'industrial', full: 0.7 });
      for (let i = 0; i < 6; i++) { const x = R.x0 + 4 + r() * (R.x1 - R.x0 - 8), z = R.z1 - 6 - r() * 6; r() < 0.5 ? Fu.pallet(K2, x, y, z, r(), { load: Fu.F.cardboard, loot: r() < 0.3 ? 'industrial' : null }) : Fu.crate(K2, x, y, z, r(), { loot: r() < 0.3 ? 'industrial' : null }); }
      for (let i = 0; i < 4; i++) Fu.barrel(K2, R.x0 + 2 + r() * 6, y, R.z1 - 2 - r() * 4);
      if (r() < 0.5) forklift(K2, R.x0 + (R.x1 - R.x0) * 0.6, y, R.z1 - 10, r() * 3);
    },
  });
  if (r() < 0.5) K.sign(-w / 4, 13.5, d / 2 + 0.3, 14, 1.8, pick(r, ['СКЛАД', 'СКЛАД №' + (1 + Math.floor(r() * 9)), 'БАЗА']), 'plaque');
  return B;
}

/** A factory: a tall hall with machines, an office block on the end, a brick chimney. */
export function factory(K, s) {
  const r = K.r, w = s.w, d = s.d;
  K.push(-8, 0, 0, 0);
  warehouse(K, { ...s, w: w - 16 });
  K.pop();
  // the office block
  K.push(w / 2 - 8, 0, 0, 0);
  const P0 = plan({ x0: -7.2, z0: -d / 2 + 0.8, x1: 7.2, z1: d / 2 - 0.8 }, 3, r, { min: 8, start: (q) => q.z1 > d / 2 - 1 });
  P0.rooms.forEach((R) => { R.kind = 'office'; });
  body(K, {
    w: 16, d, floors: 2, base: 0.6, t: 0.8, outer: mat('brick', 0xd8c8b8), plinth: S.plinth, plans: [P0],
    roomMat: () => mat('plaster', 0xd8dcd0), floorMat: () => mat('linoleum'),
    doors: [{ side: 'pz', a: 0, kind: 'wood' }],
    win: { w: 3.8, h: 4.4, sill: 3, every: 8, style: { glass: 0.6 } },
    stairs: [{ f: 0, x: 4.8, z: d / 2 - 3.5, dir: 'nz', w: 3.6, run: 13 }],
    roof: { kind: 'flat', mat: mat('concrete', 0x6a6864), parapet: 1 },
    furnish: (K2, R, f, y) => furnishRoom(K2, R, y, 'office', { cat: 'office' }),
  });
  K.pop();
  // the chimney
  K.cyl(-w / 2 + 6, 0, -d / 2 - 6, 3.2, 62, mat('brick', 0xc8a898), { seg: 12, top: mat('plaster', 0x141414, { p: 5 }) });
  for (let i = 0; i < 3; i++) K.cyl(-w / 2 + 6, 20 + i * 16, -d / 2 - 6, 3.5, 0.6, mat('metal', 0x3a3a3a, { p: 4 }), { seg: 12, col: false, cap: false });
  // pipes along the side
  K.cylAxis(0, 9, -d / 2 - 2.5, 1.2, w * 0.8, mat('metalRust'), { axis: 'x', col: false });
  for (let i = 0; i < 4; i++) K.box(-w * 0.35 + i * w * 0.23, 4.5, -d / 2 - 2.5, 0.3, 4.5, 0.3, mat('metal', 0x5a5a5a, { p: 4 }), { col: false });
  K.sign(0, 14.5, d / 2 + 0.3, 22, 2, pick(r, ['ЗАВОД', 'КОМБИНАТ', 'МОРОВСКИЙ ЗАВОД']), 'plaque');
}

/** A petrol station: a canopy over the pumps, a kiosk, a sign on a pole. */
export function gas(K, s) {
  const r = K.r, w = s.w, d = s.d;
  // the forecourt
  K.span(-w / 2, -0.4, -d / 2, w / 2, 0.15, d / 2 - 4, mat('concrete', 0xa8a49c), { col: false, skip: 'ny' });
  // the canopy
  const cy = 11, cw = 26, cd = 14, cz = 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(sx * (cw / 2 - 2), cy / 2, cz + sz * (cd / 2 - 2), 0.6, cy / 2, 0.6, mat('metal', 0xe8e8e0, { p: 5 }), {});
  K.span(-cw / 2, cy, cz - cd / 2, cw / 2, cy + 1.8, cz + cd / 2, { side: mat('metal', 0xc8302a, { p: 5 }), top: mat('metal', 0x8a8a8a), bottom: mat('plaster', 0xe8e8e0, { p: 5 }) }, {});
  K.sign(0, cy + 0.9, cz + cd / 2 + 0.05, 8, 1.4, 'АЗС', 'gas');
  // the pumps on their islands
  for (const sx of [-1, 1]) {
    K.span(sx * 6 - 1.2, 0, cz - 4, sx * 6 + 1.2, 0.5, cz + 4, mat('concrete', 0xc8c4bc), { skip: 'ny' });
    for (const sz of [-1.8, 1.8]) {
      K.box(sx * 6, 2.5, cz + sz, 0.8, 2.0, 0.6, mat('metal', 0xe8e8e0, { p: 5 }), {});
      K.box(sx * 6, 3.6, cz + sz + 0.62, 0.55, 0.45, 0.02, mat('plaster', 0x202428, { p: 5 }), { col: false });
      K.box(sx * 6, 4.7, cz + sz, 0.85, 0.15, 0.65, mat('metal', 0xc8302a, { p: 5 }), { col: false });
    }
    K.lootAt(sx * 6 + 2, 0.55, cz, 'fuel');
  }
  // the kiosk at the back
  K.push(0, 0, -d / 2 + 6.5, 0);
  const P = { rooms: [{ x0: -6.4, z0: -4.4, x1: 6.4, z1: 4.4, kind: 'shop', id: 0 }], walls: [], start: 0 };
  body(K, {
    w: 14, d: 10, floors: 1, H: 9, base: 0.5, t: 0.6, outer: mat('plaster', 0xe8e8e0), plinth: S.plinth, plans: [P],
    roomMat: () => mat('plaster', 0xe8ece4), floorMat: () => mat('tiles', 0xe0e0d8),
    doors: [{ side: 'pz', a: -3.5, w: 4.2, kind: 'glass' }],
    win: (side) => (side === 'pz' ? { w: 6, h: 5, sill: 1.6, every: 10, max: 1, style: { glass: 0.5, frame: mat('metal', 0x5a5e62, { p: 4 }), single: true, transom: false } } : null),
    roof: { kind: 'flat', mat: mat('concrete', 0x6a6864), parapet: 1.2 },
    furnish: (K2, R, f, y) => {
      Fu.counter(K2, 3, y, -1, Math.PI, { L: 5, cat: 'shop' });
      Fu.gondola(K2, -2, y, 0.5, Math.PI / 2, { L: 5, cat: 'shop' });
      Fu.rack(K2, 0, y, -3.2, 0, { w: 10, h: 6, m: Fu.F.white, cat: 'shop' });
    },
  });
  K.pop();
  // the price sign
  K.box(w / 2 - 3, 9, d / 2 - 2, 0.4, 9, 0.4, mat('metal', 0x8a8a8a, { p: 4 }), {});
  K.box(w / 2 - 3, 17, d / 2 - 2, 2.6, 2.6, 0.3, mat('metal', 0xc8302a, { p: 5 }), { col: false });
  K.sign(w / 2 - 3, 17, d / 2 - 1.68, 4.4, 2, 'АЗС', 'gas');
  // an underground tank's filler caps and a fuel bowser
  for (let i = 0; i < 3; i++) K.cyl(-w / 2 + 3 + i * 2.5, 0, d / 2 - 6, 0.5, 0.4, mat('metal', 0x3a3a3a, { p: 4 }), { col: false });
  if (r() < 0.6) vehicle(K, -w / 2 + 6, 0, cz, Math.PI / 2 + (r() - 0.5) * 0.4, pick(r, ['sedan', 'hatch', 'van']));
}

/** A grain silo with a cone roof and a ladder. */
export function silo(K, s) {
  const m = mat('metal', 0xb8bcb8, { p: 4 });
  K.cyl(0, 0, 0, 6, 34, m, { seg: 16, cap: false });
  K.lathe(0, 34, 0, [[6.3, 0], [0.5, 5]], mat('metalRust'), { seg: 16 });
  for (let i = 0; i < 6; i++) K.cyl(0, 3 + i * 5.5, 0, 6.1, 0.25, mat('metal', 0x7a7e7a, { p: 4 }), { seg: 16, cap: false, col: false });
  K.push(0, 0, 6.2, 0);
  for (const sx of [-1, 1]) K.box(sx * 0.8, 17, 0.4, 0.1, 17, 0.1, mat('metal', 0x5a5a5a, { p: 4 }), { col: false });
  for (let i = 1; i < 37; i++) K.box(0, i * 0.92, 0.4, 0.8, 0.05, 0.05, mat('metal', 0x5a5a5a, { p: 4 }), { col: false });
  K.ladderAt(0, 0, 0.9, 34);
  K.pop();
  K.lootAt(0, 39.2, 0, 'hunting');
}

// --- the port ------------------------------------------------------------------------------------------------------------------
/** A gantry crane straddling the quay. */
export function crane(K, x, y, z, yaw) {
  K.push(x, y, z, yaw);
  const m = mat('metal', 0xd8a030, { p: 4 }), dark = mat('metal', 0x3a3a3a, { p: 4 });
  const span = 22, H = 34, L = 16;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(sx * L / 2, H / 2, sz * span / 2, 0.9, H / 2, 0.9, m, {});
  for (const sx of [-1, 1]) { K.box(sx * L / 2, H - 1, 0, 1, 1, span / 2 + 1, m, {}); K.box(sx * L / 2, 6, 0, 0.5, 0.5, span / 2, m, { col: false }); }
  // the boom reaching out over the water
  K.box(0, H + 1.5, 10, L / 2 + 1, 1.2, span / 2 + 14, m, {});
  K.box(0, H + 6, -2, 1.6, 4.5, 1.6, m, { col: false });
  for (const s of [-1, 1]) K.quad([s * 1.2, H + 10, -2], [s * 1.2, H + 2.7, 30], [s * 1.2, H + 2.9, 30], [s * 1.2, H + 10.2, -2], dark, { both: true });
  // the operator's cab, and the hook hanging on its cables
  K.span(-3, H - 6, 6, 3, H - 0.2, 12, { side: m, pz: mat('concrete', 0x3a4a52, { r: 30 }) }, {});
  K.box(0, H - 12, 22, 0.08, 13, 0.08, dark, { col: false });
  K.box(0, H - 25.5, 22, 1.2, 0.6, 0.8, m, { col: false });
  K.lootAt(0, H - 5.9, 9, 'industrial');
  K.ladderAt(L / 2 + 1.2, 0, span / 2, H - 2);
  K.pop();
}

/** A yard of containers stacked one to three high; some open, with things inside. */
export function containerYard(K, x, y, z, yaw, r, loot = 'industrial') {
  K.push(x, y, z, yaw);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
    if (r() < 0.2) continue;
    const h = 1 + Math.floor(r() * 3);
    for (let k = 0; k < h; k++) container(K, -24 + j * 22 + (r() - 0.5), k * 8.6, -12 + i * 10, (r() - 0.5) * 0.04, pick(r, CONTAINER_TINTS), { open: k === 0 && r() < 0.35, loot });
  }
  K.pop();
}

export const INDUSTRIAL = { garages, warehouse, factory, gas, silo };
export { fence };
