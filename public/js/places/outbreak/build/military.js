// The military's buildings: barracks, the headquarters, guard towers, tents,
// hangars, the airfield's control tower, and bunkers dug into the ground
// with the best loot on the map at the bottom of their stairs.
import { mat } from './kit.js';
import { S, STOREY, corridorPlan, slab, stairs, railing, wall, doorIn } from './parts.js';
import { body } from './body.js';
import * as Fu from './furniture.js';
import { furnishRoom } from './interior.js';
import { sandbags, smallPlane } from './props.js';
import { ladder } from './houses.js';

const pick = (r, a) => a[Math.floor(r() * a.length)];
const OLIVE = () => mat('plaster', 0x9a9a7a);
const MIL_WALL = mat('plaster', 0xb8c0a8), MIL_FLOOR = mat('concFloor', 0xc8c8c0);

function doorsOf(P, R) {
  const out = [];
  for (const wl of P.walls) if (wl.door && (P.rooms[wl.ra] === R || P.rooms[wl.rb] === R)) out.push(wl.axis === 'x' ? { x: wl.door.a, z: wl.at } : { x: wl.at, z: wl.door.a });
  return out;
}

/** Barracks: a long single storey of dormitories off a corridor. */
export function barracks(K, s) {
  const r = K.r, w = s.w, d = s.d, t = 0.8;
  const P = corridorPlan({ x0: -w / 2 + t, z0: -d / 2 + t, x1: w / 2 - t, z1: d / 2 - t }, 5.5, 12, r);
  P.rooms.forEach((R) => { R.kind = R.corridor ? 'corridor' : 'dorm'; });
  return body(K, {
    w, d, floors: 1, base: 0.8, t, outer: pick(r, [OLIVE(), mat('plasterOld', 0xb8b8a0), mat('brick', 0xd8c8b8)]), plinth: S.plinth, plans: [P],
    roomMat: () => MIL_WALL, floorMat: () => MIL_FLOOR,
    doors: [{ side: 'px', a: 0, kind: 'metal' }, { side: 'nx', a: 0, kind: 'metal' }],
    win: { w: 4, h: 4.4, sill: 3, every: 9, style: { glass: 0.6, board: 0.12 } },
    innerDoor: () => (r() < 0.6 ? 'wood' : null),
    roof: { kind: 'gable', mat: mat('metal', 0x5a6a5a, { p: 4 }), rise: d * 0.28, axis: 'x', over: 1 },
    furnish: (K2, R, f, y) => furnishRoom(K2, R, y, R.kind === 'corridor' ? 'corridor' : 'dorm', { cat: 'military' }),
  });
}

/** The headquarters: two storeys of offices, an armoury on the ground floor. */
export function hq(K, s) {
  const r = K.r, w = s.w, d = s.d, t = 0.9;
  const plans = [];
  for (let f = 0; f < 2; f++) {
    const P = corridorPlan({ x0: -w / 2 + t + 8, z0: -d / 2 + t, x1: w / 2 - t, z1: d / 2 - t }, 5.5, 10, r);
    P.rooms.forEach((q) => { q.id += 1; });
    for (const wl of P.walls) { wl.ra += 1; wl.rb += 1; }
    const hall = { x0: -w / 2 + t, z0: -d / 2 + t, x1: -w / 2 + t + 8, z1: d / 2 - t, kind: 'hall', id: 0 };
    P.rooms.unshift(hall);
    P.walls.push({ axis: 'z', at: hall.x1, a0: -2.5, a1: 2.5, ra: 0, rb: 1, door: { a: 0, w: 4.6 }, open: true });
    P.rooms.forEach((R, i) => { if (!R.kind) R.kind = R.corridor ? 'corridor' : f === 0 && i === 2 ? 'armory' : 'office'; });
    plans.push(P);
  }
  return body(K, {
    w, d, floors: 2, base: 1, t, outer: mat('stucco', 0xc8c8b0), plinth: S.plinth, band: mat('concrete', 0x9a9a8a), plans,
    roomMat: (R) => (R.kind === 'corridor' || R.kind === 'hall' ? mat('plaster', 0xa8b098) : MIL_WALL), floorMat: () => mat('linoleum', 0xb8c0a8),
    doors: [{ side: 'pz', a: -w / 2 + t + 4, w: 4.6, kind: 'metal', canopy: mat('concrete', 0x8a8a80) }],
    win: { w: 4, h: 4.6, sill: 3, every: 9, style: { glass: 0.6, board: 0.1 } },
    stairs: [{ f: 0, x: -w / 2 + t + 2.2, z: d / 2 - t - 2.6, dir: 'nz', w: 3.8, run: 13 }],
    innerDoor: (wl) => (wl.open ? null : 'metal'),
    roof: { kind: 'flat', mat: mat('concrete', 0x6a6864), parapet: 1.4 },
    furnish: (K2, R, f, y) => furnishRoom(K2, R, y, R.kind === 'corridor' || R.kind === 'hall' ? 'corridor' : R.kind === 'armory' ? 'armory' : 'office', { cat: 'military' }),
  });
}

/** A guard tower: legs, a platform with a parapet and a roof, a ladder. s.camp: a rough timber one. */
export function tower(K, s) {
  const r = K.r, camp = !!s.camp, H = camp ? 11 : 14, hw = 4.6;
  const leg = camp ? mat('bark2', 0x9a8a78) : mat('concrete', 0xa8a49c), plank = mat('planks', camp ? 0x9a8a70 : 0xb0a088);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    if (camp) K.cyl(sx * (hw - 0.6), 0, sz * (hw - 0.6), 0.45, H + 6.6, leg, { seg: 6 });
    else K.box(sx * (hw - 0.6), H / 2, sz * (hw - 0.6), 0.5, H / 2, 0.5, leg, {});
    if (!camp) K.box(sx * (hw - 0.6), H + 3.4, sz * (hw - 0.6), 0.2, 3.4, 0.2, mat('metal', 0x5a5a5a, { p: 4 }), { col: false });
  }
  // braces
  for (const sz of [-1, 1]) K.quad([-hw + 0.6, 1, sz * (hw - 0.6)], [hw - 0.6, H - 1, sz * (hw - 0.6)], [hw - 0.6, H - 0.4, sz * (hw - 0.6)], [-hw + 0.6, 1.6, sz * (hw - 0.6)], plank, { both: true });
  // the platform, its parapet, the roof
  K.span(-hw, H, -hw, hw, H + 0.6, hw, { top: plank, side: plank, bottom: plank }, {});
  for (const [x0, z0, x1, z1] of [[-hw, hw - 0.3, hw, hw], [-hw, -hw, hw, -hw + 0.3], [hw - 0.3, -hw + 0.3, hw, hw - 0.3]]) K.span(x0, H + 0.6, z0, x1, H + 3.6, z1, camp ? plank : mat('planks', 0x8a9a7a), {});
  K.span(-hw, H + 0.6, -hw + 0.3, -hw + 0.3, H + 3.6, hw - 2.4, plank, {}); // leave a gap for the ladder
  K.quad([-hw - 1, H + 6.6, hw + 1], [hw + 1, H + 6.6, hw + 1], [hw + 1, H + 7.6, -hw - 1], [-hw - 1, H + 7.6, -hw - 1], camp ? mat('planks', 0x8a7a60) : mat('metalRust'), { back: S.fascia });
  if (!camp) sandbags(K, -hw + 3.4, hw - 1.2, hw - 0.8, hw - 1.2, 2, { y: H + 0.6 }); // (clear of the top of the ladder)
  ladder(K, -hw - 0.3, 0, hw - 1.3, H + 0.6, Math.PI / 2);
  K.room(-hw, -hw, hw, hw, H + 0.6, 6, 'tower');
  K.lootAt(0, H + 0.65, 0, camp ? 'hunting' : 'military', { spread: 2 });
}

/** A canvas tent with cots and crates. */
export function tent(K, s) {
  const r = K.r, w = s.w ?? 14, d = s.d ?? 20, h = 6.5, ridge = 10.5;
  const cv = s.camp ? mat('fabric', pick(r, [0x5a6a7a, 0x7a6a50, 0x6a7050])) : mat('fabric', 0x6a6a4a);
  const inner = mat('fabric', s.camp ? 0x5a5040 : 0x4a4a38);
  // a floor of boards, the walls and the roof of canvas
  K.span(-w / 2, -0.2, -d / 2, w / 2, 0.25, d / 2, mat('planks', 0x8a7a60), { skip: 'ny', ao: 0.45 });
  const q = (a, b, c, e) => K.quad(a, b, c, e, cv, { back: inner, backAo: 0.4 });
  q([w / 2, 0, d / 2], [w / 2, 0, -d / 2], [w / 2, h, -d / 2], [w / 2, h, d / 2]);
  q([-w / 2, 0, -d / 2], [-w / 2, 0, d / 2], [-w / 2, h, d / 2], [-w / 2, h, -d / 2]);
  q([-w / 2, h, d / 2], [w / 2, h, d / 2], [w / 2 * 0, ridge, d / 2].map((v, i) => (i === 0 ? w / 2 * 0.0 : v)), [0, ridge, d / 2]);
  K.quad([w / 2, h, d / 2], [w / 2, h, -d / 2], [0, ridge, -d / 2], [0, ridge, d / 2], cv, { back: inner, backAo: 0.4 });
  K.quad([-w / 2, h, -d / 2], [-w / 2, h, d / 2], [0, ridge, d / 2], [0, ridge, -d / 2], cv, { back: inner, backAo: 0.4 });
  // the back wall and its gable; the front has a doorway
  K.quad([w / 2, 0, -d / 2], [-w / 2, 0, -d / 2], [-w / 2, h, -d / 2], [w / 2, h, -d / 2], cv, { back: inner, backAo: 0.4 });
  K.tri([w / 2, h, -d / 2], [-w / 2, h, -d / 2], [0, ridge, -d / 2], cv, { back: inner });
  K.tri([-w / 2, h, d / 2], [w / 2, h, d / 2], [0, ridge, d / 2], cv, { back: inner });
  for (const [x0, x1] of [[-w / 2, -2.4], [2.4, w / 2]]) K.quad([x0, 0, d / 2], [x1, 0, d / 2], [x1, h, d / 2], [x0, h, d / 2], cv, { back: inner, backAo: 0.4 });
  K.quad([-2.4, 7.2, d / 2], [2.4, 7.2, d / 2], [2.4, h, d / 2].map((v, i) => (i === 1 ? 7.2 : v)), [-2.4, 7.2, d / 2], cv, {});
  // collision: the sides and back
  K.solid(w / 2, h / 2, 0, 0.2, h / 2, d / 2, 'cloth'); K.solid(-w / 2, h / 2, 0, 0.2, h / 2, d / 2, 'cloth'); K.solid(0, h / 2, -d / 2, w / 2, h / 2, 0.2, 'cloth');
  K.solid(-w / 4 - 1.2, h / 2, d / 2, w / 4 - 1.2, h / 2, 0.2, 'cloth'); K.solid(w / 4 + 1.2, h / 2, d / 2, w / 4 - 1.2, h / 2, 0.2, 'cloth');
  K.solid(0, ridge - 1.5, 0, w / 2, 1.5, d / 2, 'cloth', { noStand: true });
  K.indoors(0.56);
  K.defer(() => {
    const n = Math.floor((d - 4) / 4.5);
    for (let i = 0; i < n; i++) for (const sx of [-1, 1]) if (r() < 0.75) cot(K, sx * (w / 2 - 2), 0.25, -d / 2 + 3 + i * 4.5);
    if (r() < 0.7) Fu.ammoBox(K, 0, 0.25, -d / 2 + 2, 0, { cat: s.camp ? 'hunting' : 'military' });
    if (r() < 0.6) Fu.crate(K, 0, 0.25, 0, r(), { s: 1.1, loot: s.camp ? 'camp' : 'military' });
    K.lootAt(0, 0.3, d / 4, s.camp ? 'camp' : 'military', { spread: 2 });
    if (s.camp) { Fu.table(K, 0, 0.25, d / 2 - 4, 0.2, { w: 3.5, d: 2.5, h: 2.4, m: Fu.F.woodDark, cat: 'camp' }); Fu.barrel(K, w / 2 - 2, 0.25, d / 2 - 2.5); }
  });
  K.outdoors();
  K.room(-w / 2, -d / 2, w / 2, d / 2, 0.25, 6, 'tent');
}
function cot(K, x, y, z) {
  K.box(x, y + 1.3, z, 1.3, 0.15, 3.2, mat('fabric', 0x5a5a40), { col: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(x + sx * 1.1, y + 0.65, z + sz * 2.9, 0.08, 0.65, 0.08, mat('metal', 0x3a3a3a, { p: 4 }), { col: false });
  K.solid(x, y + 0.7, z, 1.3, 0.7, 3.2, 'cloth');
}

/** An arched hangar, open at the front. */
export function hangar(K, s) {
  const r = K.r, w = s.w, d = s.d, H = 22, n = 12;
  const roof = mat(r() < 0.5 ? 'metal' : 'metalRust', 0x8a9088, { p: 0 }), inner = mat('metal', 0x5a5e5a);
  K.span(-w / 2, -0.4, -d / 2, w / 2, 0.3, d / 2, mat('concFloor', 0xb8b8b0), { skip: 'ny', ao: 0.5 });
  // the arch: n strips each side of the top, along the hangar
  const pt = (i) => { const a = Math.PI * i / n; return [-Math.cos(a) * w / 2, Math.sin(a) * H]; };
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pt(i), [x1, y1] = pt(i + 1);
    K.quad([x1, y1, d / 2], [x0, y0, d / 2], [x0, y0, -d / 2], [x1, y1, -d / 2], roof, { back: inner, backAo: 0.45 });
  }
  // the back wall: a fan of triangles
  for (let i = 0; i < n; i++) { const [x0, y0] = pt(i), [x1, y1] = pt(i + 1); K.tri([x0, y0, -d / 2], [x1, y1, -d / 2], [0, 0, -d / 2], roof, { back: inner, backAo: 0.45 }); }
  // the front: the top half closed, big doors slid open below
  for (let i = 0; i < n; i++) { const [x0, y0] = pt(i), [x1, y1] = pt(i + 1); if (Math.max(y0, y1) > 15) K.tri([x1, Math.max(15, y1), d / 2], [x0, Math.max(15, y0), d / 2], [0, 15, d / 2], roof, { back: inner, backAo: 0.45 }); }
  for (const sx of [-1, 1]) K.span(sx * (w / 2 - 9) - 6, 0, d / 2 - 1.2, sx * (w / 2 - 9) + 6, 14.5, d / 2 - 0.4, mat('metal', 0x7a8078), {});
  // collision: walls of the arch (stepped boxes) and the back
  for (let i = 0; i < 4; i++) { const f = i / 4, xx = Math.cos(Math.asin(f)) * w / 2; for (const sx of [-1, 1]) K.solid(sx * xx, H * f + H / 8, 0, 0.6, H / 8, d / 2, 'metal'); }
  K.solid(0, H / 2, -d / 2, w / 2, H / 2, 0.4, 'metal');
  K.solid(0, H - 1, 0, w / 4, 1, d / 2, 'metal', { noStand: true });
  K.indoors(0.5);
  if (r() < 0.6) smallPlane(K, 0, 0.3, 2, Math.PI + (r() - 0.5) * 0.3);
  K.defer(() => {
    for (let i = 0; i < 3; i++) Fu.rack(K, -w / 2 + 10 + i * 9, 0.3, -d / 2 + 2, 0, { w: 8, cat: 'military' });
    for (let i = 0; i < 5; i++) Fu.barrel(K, w / 2 - 8 - r() * 6, 0.3, -d / 2 + 3 + r() * 10);
    Fu.workbench(K, w / 2 - 12, 0.3, -d / 2 + 2.2, 0, { cat: 'industrial' });
    for (let i = 0; i < 4; i++) Fu.crate(K, (r() - 0.5) * w * 0.6, 0.3, (r() - 0.5) * d * 0.6, r(), { loot: r() < 0.5 ? 'military' : null });
    for (let i = 0; i < 3; i++) Fu.pallet(K, -w / 2 + 6 + i * 6, 0.3, d / 2 - 8, r() * 0.3, { load: r() < 0.5 ? Fu.F.olive : Fu.F.cardboard, loot: r() < 0.4 ? 'military' : null });
  });
  K.outdoors();
  K.room(-w / 2 + 4, -d / 2, w / 2 - 4, d / 2, 0.3, H, 'hangar');
  K.link(K.cur.rooms[K.cur.rooms.length - 1], null, 0, 0.3, d / 2 + 2, 20).outside = true;
}

/** The airfield's control tower: three floors of stairs and offices, a glass room on top. */
export function controlTower(K, s) {
  const r = K.r, w = 16, H = STOREY, F = 3, t = 0.9, base = 1;
  const plans = [];
  for (let f = 0; f < F; f++) plans.push({ rooms: [{ x0: -w / 2 + t, z0: -w / 2 + t, x1: w / 2 - t, z1: w / 2 - t, kind: 'office', id: 0 }], walls: [], start: 0 });
  const B = body(K, {
    w, d: w, floors: F, H, base, t, outer: mat('stucco', 0xe0dcd0), plinth: S.plinth, band: mat('concrete', 0xa8a49c), plans,
    roomMat: () => mat('plaster', 0xd0d4c8), floorMat: () => mat('linoleum', 0xc8ccc0),
    doors: [{ side: 'pz', a: 3, kind: 'metal' }],
    win: { w: 3.6, h: 4.4, sill: 3, every: 7, style: { glass: 0.6 } },
    stairs: Array.from({ length: F }, (_, f) => ({ f, x: f % 2 ? w / 2 - t - 2.1 : -w / 2 + t + 2.1, z: f % 2 ? -w / 2 + t + 1 : w / 2 - t - 1, dir: f % 2 ? 'pz' : 'nz', w: 3.6, run: 12.5 })),
    roof: { kind: 'none' },
    furnish: (K2, R, f, y) => furnishRoom(K2, R, y, 'office', { cat: 'military' }),
  });
  // the glass room on top: a wider floor, glass all round, a roof
  const y0 = B.floorY(F), cw = 11;
  slab(K, -cw, -cw, cw, cw, y0, 0.6, mat('linoleum', 0xb8bcb0), S.ceiling, [{ x0: -w / 2 + t, z0: -w / 2 + t + 0.6, x1: -w / 2 + t + 4.2, z1: w / 2 - t }], { ao: 1 });
  for (const [sx, sz, along] of [[0, 1, 'x'], [0, -1, 'x'], [1, 0, 'z'], [-1, 0, 'z']]) {
    const c = along === 'x' ? sz * (cw - 0.2) : sx * (cw - 0.2);
    for (let i = 0; i < 4; i++) {
      const a = -cw + cw * 0.5 * (i + 0.5) * 1, aa = -cw + (2 * cw) * (i + 0.5) / 4;
      void a;
      if (along === 'x') { K.box(aa, y0 + 0.9, c, cw / 4, 0.9, 0.2, mat('stucco', 0xe0dcd0), {}); K.box(aa, y0 + 4.5, c, cw / 4 - 0.15, 2.7, 0.04, S.glass, { glass: true }); }
      else { K.box(c, y0 + 0.9, aa, 0.2, 0.9, cw / 4, mat('stucco', 0xe0dcd0), {}); K.box(c, y0 + 4.5, aa, 0.04, 2.7, cw / 4 - 0.15, S.glass, { glass: true }); }
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(sx * (cw - 0.2), y0 + 3.6, sz * (cw - 0.2), 0.25, 3.6, 0.25, mat('metal', 0x4a4a4a, { p: 4 }), {});
  K.span(-cw - 1, y0 + 7.2, -cw - 1, cw + 1, y0 + 8, cw + 1, { top: mat('concrete', 0x6a6864), side: mat('metal', 0x8a3a2a, { p: 5 }), bottom: S.ceiling }, {});
  K.indoors(0.8);
  K.span(-cw + 1, y0, cw - 3, cw - 1, y0 + 3, cw - 1, mat('metal', 0x7a8078, { p: 4 }), { skip: 'ny' });
  K.lootAt(0, y0 + 3.05, cw - 2, 'military');
  K.lootAt(-4, y0 + 0.05, 0, 'military', { spread: 3 });
  K.outdoors();
  K.room(-cw, -cw, cw, cw, y0, 7, 'cab');
  // an aerial
  K.cyl(4, y0 + 8, 4, 0.2, 10, mat('metal', 0xc8c8c8, { p: 4 }), { col: false });
  K.sign(0, base + 8.6, w / 2 + 0.3, 9, 1.4, 'ДОЛИНА', 'plaque');
  void railing; void stairs;
}

/**
 * A bunker: a concrete blockhouse on the surface with a long flight of stairs
 * going down inside it, and a room under the ground behind it. The land is
 * cut away inside the blockhouse (B.hole) and ignored by anyone already
 * under it (B.under), so you can walk down.
 */
export function bunker(K, s) {
  const r = K.r, bw = 10, bd = 22, depth = 13;
  const con = mat('concrete', 0xa8a49c), dark = mat('concrete', 0x7a7872), floor = mat('concFloor', 0x9a9890), lit = mat('concrete', 0xa8a8a0);
  const B = K.cur;
  const fy = 0.6 - depth, ch = 8.5, hz = bd / 2;
  // the blockhouse: walls from the bottom of the shaft up, a thick roof
  wall(K, 'z', -hz, hz, bw / 2 - 0.5, fy, 8, 1, con, dark, [], { out: 1, aoIn: 0.45, top: true });
  wall(K, 'z', -hz, hz, -bw / 2 + 0.5, fy, 8, 1, con, dark, [], { out: -1, aoIn: 0.45, top: true });
  const doorH = { a: 0, w: 4.4, y: 0.6, h: 7 };
  wall(K, 'x', -bw / 2, bw / 2, hz - 0.5, 0, 8, 1, con, dark, [doorH], { out: 1, aoIn: 0.45, top: true });
  wall(K, 'x', -bw / 2, bw / 2, -hz + 0.5, fy, 8, 1, con, dark, [{ a: 0, w: 4.4, y: fy, h: 7.2 }], { out: -1, aoIn: 0.45, top: true });
  K.span(-bw / 2 - 0.6, 8, -hz - 0.6, bw / 2 + 0.6, 9.8, hz + 0.6, { top: mat('concrete', 0x8a8680), side: con, bottom: dark }, { aoF: { ny: 0.32 } });
  K.span(-bw / 2 - 0.6, -2, hz - 0.1, bw / 2 + 0.6, 0, hz + 1.6, con, { skip: 'ny' });
  const D = doorIn(K, 'x', hz - 0.5, 1, doorH, 'metal', { ao: 0.8 });
  K.indoors(0.45);
  // the landing inside the door, the stairs down, the passage at the bottom
  K.span(-bw / 2 + 1, 0, hz - 4.5, bw / 2 - 1, 0.6, hz - 1, floor, {});
  const run = 15;
  stairs(K, 0, hz - 4.5 - run, 'pz', bw - 2, fy, 0.6 - fy, run, mat('concrete', 0x9a968e), { ao: 0.45 });
  K.span(-bw / 2 + 1, fy - 0.6, -hz + 1, bw / 2 - 1, fy, hz - 4.5 - run, floor, {});
  // the room under the ground behind
  const rx = 11, rz1 = -hz - 1, rz0 = rz1 - 20;
  K.span(-rx, fy - 0.6, rz0, rx, fy, rz1, floor, {});
  K.span(-rx - 1, fy + ch, rz0 - 1, rx + 1, fy + ch + 1.2, rz1 + 1, { bottom: mat('concrete', 0x8a8884), side: dark, top: dark }, {});
  wall(K, 'x', -rx - 1, rx + 1, rz0 - 0.5, fy, fy + ch, 1, dark, lit, [], { out: -1, aoIn: 0.45 });
  wall(K, 'z', rz0, rz1, rx + 0.5, fy, fy + ch, 1, dark, lit, [], { out: 1, aoIn: 0.45 });
  wall(K, 'z', rz0, rz1, -rx - 0.5, fy, fy + ch, 1, dark, lit, [], { out: -1, aoIn: 0.45 });
  wall(K, 'x', -rx - 1, rx + 1, rz1 + 0.5, fy, fy + ch, 1, dark, lit, [{ a: 0, w: 4.4, y: fy, h: 7.2 }], { out: 1, aoIn: 0.45 });
  const D2 = doorIn(K, 'x', rz1 + 0.5, 1, { a: 0, w: 4.4, y: fy, h: 7.2 }, 'metal', { ao: 0.45 });
  // inside: the good stuff
  K.defer(() => {
    Fu.locker(K, -rx + 1.4, fy, rz0 + 6, Math.PI / 2, { n: 4, cat: 'bunker' });
    Fu.rack(K, rx - 1.4, fy, rz0 + 6, -Math.PI / 2, { w: 8, m: Fu.F.olive, cat: 'bunker' });
    Fu.ammoBox(K, -4, fy, rz0 + 2, 0, { cat: 'bunker' });
    Fu.ammoBox(K, 0, fy, rz0 + 2, 0.1, { cat: 'bunker' });
    Fu.desk(K, 5, fy, rz0 + 2.2, 0, { cat: 'military' });
    Fu.bunk(K, -rx + 2.2, fy, rz1 - 5, 0, { cat: 'military' });
    Fu.bunk(K, -rx + 6, fy, rz1 - 5, 0, { cat: 'military' });
    for (let i = 0; i < 3; i++) Fu.crate(K, 3 + i * 2.6, fy, rz1 - 3, r(), { s: 1, loot: i === 0 ? 'bunker' : null });
  });
  K.outdoors();
  // the rooms and the way down
  const top = K.room(-bw / 2 + 1, hz - 4.5, bw / 2 - 1, hz - 1, 0.6, 7, 'bunkerTop');
  const shaft = K.room(-bw / 2 + 1, -hz + 1, bw / 2 - 1, hz - 4.5 - run, fy, ch, 'bunkerShaft');
  const room = K.room(-rx, rz0, rx, rz1, fy, ch, 'bunker');
  const L = K.link(top, null, 0, 0.6, hz + 2, 4.4); L.outside = true; if (D) { D.link = L; L.door = D; }
  K.stairLink(shaft, top, 0, fy, hz - 4.5 - run, 0, 0.6, hz - 4.5);
  const L2 = K.link(shaft, room, 0, fy, rz1 + 0.5, 4.4); if (D2) { D2.link = L2; L2.door = D2; }
  // the land is cut away inside the blockhouse; under the rest you're "underground"
  B.hole = { lx: 0, lz: 0, hx: bw / 2 - 0.9, hz: hz - 0.9 };
  B.under = { lx: 0, lz: (rz0 - 1 + hz) / 2, hx: rx + 1.5, hz: (hz - rz0 + 1) / 2 + 0.5 };
  sandbags(K, -bw / 2 - 3, hz + 3, -2.8, hz + 3, 2, { green: true });
}

export const MILITARY = { barracks, hq, tower, tent, hangar, controlTower, bunker };
void STOREY;
