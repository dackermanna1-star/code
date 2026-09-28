// Chapter 2: loading dock + stairs up from the substation, Fairview Transit
// Authority district offices, back alley, Kent Street at night and the
// Lucky Star pawn shop (end safe room, where Chapter 3 begins).
import { room, ceilingLight, wallLamp, street, facade, safeRoom, supplies, fireSource, burningBarrel, physProp, alarmCar, hittable, P, railSegment } from './kit.js';
import { Door, WindowPane } from '../world/dynamic.js';
import { F_SOLID, F_SHOOT } from '../world/collision.js';
import { DF } from '../render/decals.js';
import { poster, displayCase, guitar, crt, shelving, rng, sgn, graf } from './ch2_parts.js';

const OY = 0; // office floor
const SWY = 0.15; // sidewalk / alley / shop floor

export function buildSurface(L, game, Y) {
  buildDock(L, game, Y.TY);
  buildOffice(L, game);
  buildStreet(L, game);
  buildPawnShop(L, game);
}

// ============================================================ LOADING DOCK & STAIRS
function buildDock(L, game, TY) {
  const wm = 'concrete';
  L.box(182.4, TY - 0.4, 52, 190, TY, 58, 'concreteFloor');
  L.box(182.4, TY - 0.4, 51.6, 199.6, 3.6, 52, wm);
  L.box(182.4, TY - 0.4, 58, 199.6, 3.6, 58.4, wm);
  L.stairs(190, 52, 199.6, 58, TY, OY, '+x', 'concrete', { stepH: 0.2 });
  L.box(182.4, TY + 5.0, 52, 193, 3.6, 58, wm);
  L.box(193, 1.4, 52, 197, 3.6, 58, wm);
  L.box(197, 3.4, 52, 199.6, 3.6, 58, wm);
  railSegment(L, 190, TY + 0.95, 52.1, 199.6, OY + 0.95, 52.1);
  railSegment(L, 190, TY + 0.95, 57.9, 199.6, OY + 0.95, 57.9);
  L.box(182.4, TY + 1.0, 52.0, 190, TY + 1.3, 52.02, 'paintedYellow', { collide: false, tint: 0xb89a2a });
  ceilingLight(L, 186, TY + 5.0, 55, { type: 'cage', intensity: 6, flicker: 0.5, range: 9 });
  ceilingLight(L, 195, 1.4, 55, { type: 'cage', intensity: 6, flicker: 0.2, range: 8 });
  ceilingLight(L, 198.4, 3.4, 55, { type: 'cage', intensity: 5, range: 7 });
  // electric utility cart & crates
  const cart = P.prop(L, 186.2, TY, 53.3, 0.1);
  cart.box(0, 0.55, 0, 2.6, 0.6, 1.2, 'paintedYellow', 0xa88a22).box(-0.8, 1.2, 0, 0.9, 0.8, 1.15, 'metalDark').box(0.5, 0.95, 0, 1.4, 0.2, 1.1, 'metal')
    .cyl(-0.85, 0.25, 0.6, 0.25, 0.15, 'rubber', 0x151515, [Math.PI / 2, 0, 0]).cyl(0.9, 0.25, 0.6, 0.25, 0.15, 'rubber', 0x151515, [Math.PI / 2, 0, 0])
    .cyl(-0.85, 0.25, -0.6, 0.25, 0.15, 'rubber', 0x151515, [Math.PI / 2, 0, 0]).cyl(0.9, 0.25, -0.6, 0.25, 0.15, 'rubber', 0x151515, [Math.PI / 2, 0, 0])
    .col(0, 0.8, 0, 2.6, 1.6, 1.2, 'metal');
  P.crate(L, 188.7, TY, 57.3, 0.3);
  P.crate(L, 188.9, TY + 0.8, 57.4, 0.9, 0.8);
  sgn(L, 'EXIT ↑ STREET', 189.9, TY + 2.4, 55, -Math.PI / 2, 1.4, 0.35, { bg: '#0a2a0a', fg: '#3aff5a', glow: 1.4, lightColor: 0x30ff50, lightIntensity: 2 });
  sgn(L, 'LOADING DOCK 7', 186, TY + 2.6, 57.98, 0, 1.6, 0.3, { bg: '#d8d0b0', fg: '#1a1a1a' });
  graf(L, 'SURFACE\nTHIS WAY', 194, -1.0, 52.03, Math.PI, 1.8, 0.8, '#d8d8c8');
  P.corpse(L, 188.2, TY + 0.01, 54.4, 1.4, 0x3a3a52);
  L.decal(188.6, TY + 0.012, 55.2, 0, 1, 0, 1.6, DF.SMEAR);
  L.reverb(182.4, TY, 52, 199.6, 3.6, 58, 'stairwell');
  L.ambience(182.4, TY - 1, 51.6, 199.6, 3.6, 58.4, 'subway');
  L.trigger(182.4, TY - 0.5, 52, 188, TY + 3, 58, () => {
    game.session.objective('Get to the surface');
    game.infected.outfit = 'civilian';
  });
}

// ============================================================ TRANSIT AUTHORITY OFFICES
function cubicleRow(L, x0, n, zSpine, side, broken = []) {
  // n cubicles of 2.4 m along +x starting at x0; open towards `side` (-1 north / +1 south) of the spine
  const pm = 'fabric', pt = 0x8a8e98;
  const cap = (x0, z0, x1, z1) => L.box(x0 - 0.01, OY + 1.4, z0 - 0.01, x1 + 0.01, OY + 1.43, z1 + 0.01, 'metalClean', { collide: false, tint: 0xb0b4b8 });
  for (let i = 0; i < n; i++) {
    const cx = x0 + i * 2.4 + 1.2;
    const zo = zSpine + side * 2.4;
    const isBroken = broken.includes(i);
    // desk against the spine, chair
    if (!isBroken) {
      P.desk(L, cx, OY, zSpine + side * 0.42, side > 0 ? Math.PI : 0, rng() < 0.75);
      P.officeChair(L, cx + (rng() - 0.5) * 0.6, OY, zSpine + side * 1.35, rng() * 6);
    } else {
      const d = P.prop(L, cx, OY, zSpine + side * 1.1, rng() * 3);
      d.box(0, 0.38, 0, 1.5, 0.04, 0.75, 'woodPale', null, [Math.PI / 2 - 0.1, 0, 0]).col(0, 0.38, 0, 1.5, 0.75, 0.4, 'wood', F_SOLID | F_SHOOT);
    }
    // side partitions (between cubicles)
    if (i === 0 || !broken.includes(i - 1) || !isBroken) {
      const x = x0 + i * 2.4;
      L.box(x - 0.03, OY, Math.min(zSpine, zo), x + 0.03, OY + 1.4, Math.max(zSpine, zo), pm, { tint: pt });
      cap(x - 0.03, Math.min(zSpine, zo), x + 0.03, Math.max(zSpine, zo));
    }
  }
  const xe = x0 + n * 2.4;
  L.box(xe - 0.03, OY, Math.min(zSpine, zSpine + side * 2.4), xe + 0.03, OY + 1.4, Math.max(zSpine, zSpine + side * 2.4), pm, { tint: pt });
  cap(xe - 0.03, Math.min(zSpine, zSpine + side * 2.4), xe + 0.03, Math.max(zSpine, zSpine + side * 2.4));
}

function buildOffice(L, game) {
  const X0 = 200, X1 = 232, Z0 = 44, Z1 = 68;
  const ext = 'brickTan', pl = 'plaster', H = 3.5;
  L.box(X0 - 0.4, OY - 0.4, Z0 - 0.4, X1 + 0.4, OY, Z1 + 0.4, 'concreteFloor');
  L.box(X0 - 0.4, OY + H, Z0 - 0.4, X1 + 0.4, OY + H + 0.3, Z1 + 0.4, 'ceiling');
  L.wallZ(Z0 - 0.4, Z1 + 0.4, X0 - 0.2, OY, OY + H, ext, 0.4, [{ a: 53.5, b: 56.5, y0: OY, y1: OY + 2.6 }]);
  L.wallX(X0, X1, Z0 - 0.2, OY, OY + H, ext, 0.4, [{ a: 204, b: 205.4, y0: OY + 1.0, y1: OY + 2.4 }, { a: 214, b: 215.4, y0: OY + 1.0, y1: OY + 2.4 }]);
  L.wallZ(Z0 - 0.4, Z1 + 0.4, X1 + 0.2, OY, OY + H, ext, 0.4, [{ a: 47, b: 49, y0: OY + 1.0, y1: OY + 2.4 }, { a: 55, b: 57, y0: OY + 1.0, y1: OY + 2.4 }, { a: 64, b: 65.2, y0: OY, y1: OY + 2.2 }]);
  L.wallX(X0, X1, Z1 + 0.2, OY, OY + H, ext, 0.4, [{ a: 217, b: 221, y0: OY + 0.9, y1: OY + 2.5 }, { a: 222.4, b: 225.6, y0: OY, y1: OY + 2.6 }, { a: 227, b: 231, y0: OY + 0.9, y1: OY + 2.5 }]);
  for (const [a, b] of [[204, 205.4], [214, 215.4]]) new WindowPane(L, a, OY + 1.0, Z0 - 0.22, b, OY + 2.4, Z0 - 0.18, { dirty: true });
  for (const [a, b] of [[47, 49], [55, 57]]) new WindowPane(L, X1 + 0.18, OY + 1.0, a, X1 + 0.22, OY + 2.4, b, { dirty: true });
  // front of the lobby: windows boarded, glass doors chained and barricaded
  for (const [a, b] of [[217, 221], [227, 231]]) {
    L.box(a, OY + 0.9, Z1 + 0.15, b, OY + 2.5, Z1 + 0.19, 'glassDirty', { collide: false, tint: 0x1a2226 });
    for (let k = 0; k < 3; k++) L.box(a - 0.1, OY + 1.05 + k * 0.5, Z1 - 0.05, b + 0.1, OY + 1.3 + k * 0.5, Z1 - 0.01, 'wood', { tint: 0x9a8a6a, collide: false });
    L.clip(a, OY + 0.9, Z1, b, OY + 2.5, Z1 + 0.4, F_SOLID | F_SHOOT);
  }
  L.box(222.4, OY, Z1 + 0.16, 225.6, OY + 2.6, Z1 + 0.22, 'glassDirty', { collide: false, tint: 0x1a2226 });
  L.box(223.95, OY, Z1 + 0.14, 224.05, OY + 2.6, Z1 + 0.24, 'metalDark', { collide: false });
  L.clip(222.4, OY, Z1, 225.6, OY + 2.6, Z1 + 0.4, F_SOLID | F_SHOOT);
  P.pipe(L, 223.3, OY + 1.05, Z1 + 0.25, 224.7, OY + 1.1, Z1 + 0.25, 0.02, 'chrome');
  for (const [x, r] of [[223, 0.2], [225.2, -0.3]]) P.filingCabinet(L, x, OY, Z1 - 0.5, r);
  P.sofa(L, 224, OY, Z1 - 1.6, Math.PI + 0.1, 0x3a3a4a);
  // interior partitions
  L.wallZ(Z0, 59.925, 206, OY, OY + H, pl, 0.15, [{ a: 54.2, b: 55.8, y0: OY, y1: OY + 2.3 }]);
  L.wallX(X0, 206 - 0.075, 49, OY, OY + H, pl, 0.15, [{ a: 202.5, b: 203.6, y0: OY, y1: OY + 2.15 }]);
  new Door(L, 203.05, OY, 49, 'x', { width: 1.1, material: 'woodPale', hinge: -1 });
  L.wallX(X0, 224 - 0.075, 60, OY, OY + H, pl, 0.15, [{ a: 213.2, b: 214.8, y0: OY, y1: OY + 2.3 }]);
  L.wallZ(Z0, 60 + 0.075, 224, OY, OY + H, pl, 0.15, [{ a: 47.45, b: 48.55, y0: OY, y1: OY + 2.15 }, { a: 55.45, b: 56.55, y0: OY, y1: OY + 2.15 }]);
  new Door(L, 224, OY, 48, 'z', { width: 1.1, material: 'woodPale', open: true });
  new Door(L, 224, OY, 56, 'z', { width: 1.1, material: 'woodPale', hinge: -1 });
  L.wallX(224 + 0.075, X1, 52, OY, OY + H, pl, 0.15);
  L.wallX(224 + 0.075, X1, 60, OY, OY + H, pl, 0.15, [{ a: 225, b: 231, y0: OY + 0.95, y1: OY + 2.0 }]);
  L.box(225, OY + 0.95, 59.985, 231, OY + 2.0, 60.015, 'glass', { collide: false, tint: 0xc8dcdc });
  L.clip(225, OY + 0.95, 59.95, 231, OY + 2.0, 60.05, F_SOLID | F_SHOOT);
  L.wallX(X0, 216 + 0.075, 63, OY, OY + H, pl, 0.15, [{ a: 204.45, b: 205.55, y0: OY, y1: OY + 2.15 }, { a: 212.45, b: 213.55, y0: OY, y1: OY + 2.15 }]);
  new Door(L, 205, OY, 63, 'x', { width: 1.1, material: 'woodPale', open: true });
  new Door(L, 213, OY, 63, 'x', { width: 1.1, material: 'paintedWhite' });
  L.wallZ(63 + 0.075, Z1, 210, OY, OY + H, pl, 0.15);
  L.wallZ(63 + 0.075, Z1, 216, OY, OY + H, pl, 0.15);
  new Door(L, X1 + 0.2, OY, 64.6, 'z', { width: 1.2, material: 'paintedGreen', hinge: -1 });
  // floor finishes
  const fin = (x0, z0, x1, z1, m, t) => L.box(x0, OY - 0.02, z0, x1, OY + 0.004, z1, m, { collide: false, tint: t });
  fin(X0, Z0, 206, 60, 'linoleum');
  fin(206, Z0, 224, 60, 'carpetGray');
  fin(224, Z0, X1, 60, 'carpetBlue');
  fin(X0, 60, X1, Z1, 'tileFloor');
  // ---- R1 back hall + copy room
  sgn(L, 'FAIRVIEW TRANSIT AUTHORITY\nDISTRICT 4 OPERATIONS', 205.9, OY + 2.2, 57.6, Math.PI / 2, 2.4, 0.6, { bg: '#1a3a6a', fg: '#e8e8e8' });
  poster(L, 'EVACUATION NOTICE\nALL STAFF REPORT TO\nMERCY HOSPITAL', 202.8, OY + 1.7, 59.9, 0, 1.4, 1.0, { bg: '#e8e4d0', fg: '#a01a14' });
  ceilingLight(L, 203, OY + H, 55, { type: 'cage', intensity: 6, flicker: 0.5, range: 8 });
  P.corpse(L, 203.6, OY + 0.01, 57.6, 0.6, 0x2a2a3a);
  L.decal(203.6, OY + 0.012, 57.6, 0, 1, 0, 1.6, DF.POOL);
  L.decal(205.2, OY + 0.012, 55, 0, 1, 0, 1.2, DF.SMEAR);
  const copier = P.prop(L, 201.2, OY, 46.5, -Math.PI / 2);
  copier.box(0, 0.55, 0, 1.2, 1.1, 0.8, 'plastic', 0xc8c8c0).box(0, 1.12, 0, 1.0, 0.05, 0.7, 'glassDirty', 0x303838).col(0, 0.55, 0, 1.2, 1.1, 0.8, 'metal');
  shelving(L, 203.5, OY, 44.3, Math.PI, 2.4);
  L.item('ammo', 204.8, OY + 0.02, 47.8, { chance: 0.6 });
  // ---- R2 cubicle farm
  cubicleRow(L, 209, 5, 48.9, -1, [3]);
  cubicleRow(L, 209, 5, 48.9, 1, []);
  cubicleRow(L, 209, 5, 55.9, -1, [1]);
  cubicleRow(L, 209, 5, 55.9, 1, [2, 3]);
  for (const z of [48.9, 55.9]) { L.box(209, OY, z - 0.03, 221, OY + 1.4, z + 0.03, 'fabric', { tint: 0x8a8e98 }); L.box(208.99, OY + 1.4, z - 0.04, 221.01, OY + 1.43, z + 0.04, 'metalClean', { collide: false, tint: 0xb0b4b8 }); }
  // barricade of overturned desks and cabinets blocking the south-west aisle
  for (const [x, z, r] of [[207.2, 59.2, 0.3], [208.6, 58.9, -0.4], [210.1, 59.3, 0.1]]) P.prop(L, x, OY, z, r).box(0, 0.45, 0, 1.4, 0.9, 0.7, 'woodPale', 0xb8a078, [0, 0, 0.1]);
  P.filingCabinet(L, 211.2, OY, 59.4, 1.2);
  P.dresser(L, 206.8, OY, 57.8, 1.5, 'woodPale');
  L.box(206.1, OY, 58.35, 211.6, OY + 1.3, 59.9, 'woodPale', { visible: false });
  // lights, dressing
  ceilingLight(L, 212, OY + H, 52.4, { type: 'fluoro', intensity: 9, flicker: 0.7, range: 10 });
  ceilingLight(L, 218, OY + H, 52.4, { type: 'fluoro', intensity: 7, flicker: 0.95, range: 9 });
  ceilingLight(L, 215, OY + H, 45.2, { type: 'fluoro', intensity: 7, flicker: 0.9, range: 8 });
  ceilingLight(L, 219, OY + H, 59, { type: 'fluoro', intensity: 8, flicker: 0.3, range: 9 });
  P.papers(L, 214, OY + 0.01, 52.4, 7, 30);
  P.papers(L, 222.5, OY + 0.01, 57, 2, 8);
  for (let i = 0; i < 7; i++) L.decal(207 + rng() * 16, OY + 0.012, 45 + rng() * 14, 0, 1, 0, 0.8 + rng(), DF.BLOOD1 + (i % 4));
  P.corpse(L, 216.8, OY + 0.01, 52.6, 1.6, 0x5a3a3a);
  L.decal(216.8, OY + 0.012, 52.6, 0, 1, 0, 2.0, DF.POOL);
  P.corpse(L, 222.4, OY + 0.01, 45.4, -0.4, 0x2a3a4a);
  L.item('throwable', 222.8, OY + 0.02, 58.8, { chance: 0.45 });
  L.item('melee', 210.2, OY + 0.78, 48.3, { chance: 0.5 });
  poster(L, 'RIDERSHIP IS UP!\nTHANK YOU TEAM', 219, OY + 2.2, 44.02, Math.PI, 1.6, 0.8, { bg: '#e8e0c8', fg: '#1a3a6a' });
  graf(L, 'THEY WERE\nMY FRIENDS', 223.9, OY + 1.8, 50, Math.PI / 2, 1.6, 0.8, '#8a1a14');
  // ---- R4 manager office
  P.desk(L, 228, OY, 46.4, Math.PI, true);
  P.officeChair(L, 228, OY, 45.4, 0.3);
  P.bookshelf(L, 231.6, OY, 50.5, Math.PI / 2);
  P.filingCabinet(L, 224.6, OY, 44.5, 0);
  P.lamp(L, 230.9, OY, 44.6);
  L.light(230.9, OY + 1.5, 45, 0xffc080, 3.5, 6, { flicker: 0.15 });
  const gc = P.prop(L, 225.4, OY, 51.6, 0);
  gc.box(0, 0.9, 0, 1.0, 1.8, 0.4, 'metalDark').box(0, 1.0, -0.21, 0.8, 1.4, 0.01, 'glassDirty', 0x203030).col(0, 0.9, 0, 1.0, 1.8, 0.4, 'metal');
  L.item('pills', 228.4, OY + 0.78, 46.6, { chance: 0.6 });
  L.item('tier2', 225.4, OY + 0.95, 51.4, { chance: 0.35 });
  // ---- R5 conference room
  P.table(L, 228, OY, 56, 0, 4.2, 1.4, 'woodDark');
  for (let i = 0; i < 4; i++) { P.officeChair(L, 226.5 + i * 1, OY, 54.7, Math.PI + (rng() - 0.5)); if (i !== 2) P.officeChair(L, 226.5 + i * 1, OY, 57.3, (rng() - 0.5)); }
  poster(L, 'WE WENT TO MERCY.\nDON\'T WAIT FOR US.\n- K.', 228, OY + 1.8, 52.1, Math.PI, 2.2, 1.0, { bg: '#f0f0ea', fg: '#1a1a6a', font: 'Georgia, serif' });
  L.witchSpots.push({ x: 230.8, y: OY, z: 58.8 });
  // ---- R6 break room, R7 restroom
  P.counter(L, 202.6, OY, 67.65, 0, 4.2);
  P.fridge(L, 208.7, OY, 67.6, 0);
  P.table(L, 205, OY, 65.3, 0.2, 1.2, 0.8, 'woodPale');
  P.chair(L, 204.2, OY, 64.8, 1.2);
  L.item('health', 205.2, OY + 0.78, 65.3, { chance: 0.6 });
  for (const z of [64.6, 66.6]) P.toilet(L, 215.4, OY, z, Math.PI / 2);
  P.sink(L, 211.2, OY, 67.7, 0);
  L.decal(213, OY + 0.012, 65.5, 0, 1, 0, 1.4, DF.BLOOD3);
  // ---- corridor & lobby
  P.receptionDesk(L, 227, OY, 62.4, Math.PI, 3.5);
  P.planter(L, 217.6, OY, 67.2);
  P.bench(L, 219.5, OY, 67.4, 0);
  ceilingLight(L, 208, OY + H, 61.5, { type: 'fluoro', intensity: 6, flicker: 0.8, range: 8 });
  L.box(X1 - 0.02, OY + 2.35, 64.3, X1, OY + 2.55, 64.9, 'emissiveRed', { collide: false });
  sgn(L, 'EXIT', X1 - 0.03, OY + 2.45, 64.6, Math.PI / 2, 0.5, 0.18, { bg: '#2a0a0a', fg: '#ff4030', glow: 1.5, lightColor: 0xff3020, lightIntensity: 3 });
  sgn(L, 'FAIRVIEW TRANSIT AUTHORITY', 228, OY + 2.55, 60.1, Math.PI, 3, 0.4, { fg: '#c8c8c0' });
  P.corpse(L, 229.5, OY + 0.01, 65.8, 2.4, 0x1a3a5a);
  L.decal(229.5, OY + 0.012, 65.8, 0, 1, 0, 1.8, DF.POOL);
  L.reverb(X0, OY, Z0, X1, OY + H, Z1, 'room');
  L.ambience(X0, OY - 0.5, Z0, X1, OY + H, Z1, 'apartments');
  // facade above the ground floor
  facade(L, X0 - 0.4, Z0 - 0.4, X1 + 0.4, Z1 + 0.4, OY + H + 0.3, 14, { mat: ext, faces: ['s', 'e'], lit: 0.06, skipBelow: 4.6 });
  L.box(X0 - 0.5, OY + H + 0.15, Z1 + 0.4, X1 + 0.5, OY + H + 0.35, Z1 + 0.6, 'concrete', { collide: false });
  sgn(L, 'FAIRVIEW TRANSIT AUTHORITY', 224, OY + 3.05, Z1 + 0.43, Math.PI, 5, 0.45, { fg: '#d8d0b0', bg: '#1a2a3a' });
  // scripted: sleepers among the cubicles
  L.trigger(206, OY - 0.5, 50, 210, OY + 3, 60, () => {
    game.session.objective('Get out to the street');
    for (const [x, z, idle] of [[213, 52.2, 'lie'], [219.5, 50.6, 'sit'], [220.5, 58.9, 'stand'], [217.3, 45.2, 'eat'], [216.2, 46.1, 'eat'], [229, 64.8, 'lie']]) game.infected.spawnCommon(x, OY, z, { idle, yaw: Math.random() * 6 });
  });
}

// ============================================================ ALLEY + KENT STREET
function buildStreet(L, game) {
  // alley (x 232.4..238, z 43.6..68.4)
  L.floor(232.4, 43.6, 238, 68.4, SWY, 'concreteDark', 0.5);
  L.box(232.4, 0, 43.0, 238, 12, 43.6, 'brickDark');
  facade(L, 238, 36, 280, 68.4, 0, 16, { mat: 'brickDark', faces: ['w', 's'], lit: 0.05, skipBelow: 3.6 });
  for (const y of [3.6, 6.8, 10]) {
    L.box(236.9, y, 49, 238, y + 0.06, 56, 'metalDark', { collide: false });
    L.box(236.9, y + 0.95, 49, 236.95, y + 1.0, 56, 'metalDark', { collide: false });
  }
  for (const z of [49.1, 55.9]) L.box(236.9, 3.6, z - 0.03, 236.95, 11, z + 0.03, 'metalDark', { collide: false });
  P.dumpster(L, 237, SWY, 60.5, -Math.PI / 2);
  P.dumpster(L, 233.6, SWY, 45.2, 0, 0x3a4a6a);
  P.trashBags(L, 236.8, SWY, 58, 5);
  P.trashBags(L, 233.4, SWY, 52, 3);
  P.pallet(L, 237.2, SWY, 47.5, 0.3, false);
  burningBarrel(L, 233.2, SWY, 57.4);
  P.fenceChain(L, 232.4, 44.2, 238, 44.2, SWY, 3);
  L.box(233.6, 0.9, 45.6, 233.7, 1.1, 45.7, 'metalDark', { collide: false });
  wallLamp(L, 232.52, 2.8, 63.2, 1, 0, 0xffb060, 5, 8);
  graf(L, 'PAWN SHOP\nHAS GUNS', 237.95, 1.8, 63, Math.PI / 2, 1.8, 0.8, '#d8d8c8');
  for (let i = 0; i < 4; i++) L.decal(233 + rng() * 4.5, SWY + 0.012, 46 + rng() * 20, 0, 1, 0, 1.2 + rng(), DF.BLOOD1 + i);
  L.item('pills', 237.3, SWY + 1.4, 60.5, { chance: 0.3 });
  L.reverb(232.4, SWY, 43.6, 238, 12, 68.4, 'room');
  L.ambience(232.4, 0, 43.6, 238, 14, 68.4, 'city');
  L.witchSpots.push({ x: 235.4, y: SWY, z: 47.5 });

  // Kent Street
  street(L, 196, 68.4, 280, 88, 'x', { sidewalk: 3 });
  facade(L, 188, 58.6, 199.6, 68.4, 0, 12, { mat: 'brick', faces: ['s', 'e'], lit: 0.05, skipBelow: 3.5 });
  L.box(195.2, 0, 68.4, 196, 10, 88, 'brickDark');
  L.box(280, 0, 68.4, 280.8, 10, 88, 'brickDark');
  facade(L, 196, 88, 249.9, 104, 0, 14, { mat: 'brick', faces: ['n'], lit: 0.06, skipBelow: 3.6 });
  facade(L, 264.1, 88, 280.8, 104, 0, 12, { mat: 'brickTan', faces: ['n'], lit: 0.05, skipBelow: 3.6 });
  // closed storefronts
  for (const [x0, x1, name, col, z, ry] of [[200, 212, 'KENT ST DELI', '#ffb040', 88, 0], [214, 226, 'SPIN CYCLE\nLAUNDROMAT', '#6ab0ff', 88, 0], [228, 247, 'ACE HARDWARE & KEYS', '#ff6a3a', 88, 0], [266, 278, 'CHEN\'S NOODLES', '#ff3a5a', 88, 0], [240, 252, 'MIDTOWN CLEANERS', '#8aff8a', 68.4, Math.PI], [256, 276, 'SUPER SAVE LIQUOR', '#ff3a8a', 68.4, Math.PI]]) {
    const s = ry ? 1 : -1;
    L.box(x0 + 0.4, 0.15, z + s * 0.02, x1 - 0.4, 2.9, z + s * 0.08, 'metal', { collide: false, tint: 0x6a6e70 });
    for (let y = 0.4; y < 2.9; y += 0.3) L.box(x0 + 0.4, y, z + s * 0.08, x1 - 0.4, y + 0.04, z + s * 0.1, 'metalDark', { collide: false });
    L.box(x0, 2.95, z + s * 0.02, x1, 3.1, z + s * 0.8, 'fabric', { collide: false, tint: [0x7a1a14, 0x1a3a6a, 0x2a4a2a, 0x6a5a2a][Math.floor(rng() * 4)] });
    sgn(L, name, (x0 + x1) / 2, 3.55, z + s * 0.03, ry, Math.min(7, x1 - x0 - 1), 0.6, { fg: col, glow: rng() < 0.5 ? 1.4 : 0, lightColor: parseInt(col.slice(1), 16), lightIntensity: 2.5 });
  }
  // street furniture & lights
  for (const [x, on, fl] of [[204, true, 0], [228, true, 0.6], [252, true, 0], [274, false, 0]]) P.streetLight(L, x, SWY, 70.9, Math.PI, { on, flicker: fl });
  for (const [x, on, fl] of [[216, true, 0.3], [240, false, 0], [262, true, 0]]) P.streetLight(L, x, SWY, 85.5, 0, { on, flicker: fl });
  P.trafficLight(L, 237.6, SWY, 70.6, Math.PI);
  P.hydrant(L, 246, SWY, 70.4);
  P.mailbox(L, 220, SWY, 70.2, Math.PI);
  P.newsBox(L, 233.5, SWY, 85.6, 0);
  P.newsBox(L, 234.3, SWY, 85.6, 0, 0x1a4a8a);
  P.bench(L, 256.5, SWY, 86.9, 0);
  P.trashCan(L, 258.5, SWY, 86.8);
  const shelter = P.prop(L, 256.5, SWY, 86.6, 0);
  shelter.box(0, 2.4, 0, 3.2, 0.08, 1.6, 'metalDark').box(-1.55, 1.2, 0, 0.06, 2.4, 0.06, 'metalDark').box(1.55, 1.2, 0, 0.06, 2.4, 0.06, 'metalDark').box(0, 1.4, 0.75, 3.1, 1.8, 0.03, 'glassDirty', 0x2a3234);
  sgn(L, 'M6 CROSSTOWN\nNO SERVICE', 257.9, 1.9, 86.5, 0, 0.7, 0.45, { bg: '#1a3a8a', fg: '#fff' });
  // wrecks: truck across the west end, burning car, taxi, police cars at the east barricade
  P.truck(L, 199.4, 0, 78.5, 0.35, 0xb8b4a8);
  fireSource(L, 198.4, 2.4, 75.4, 1.3, { hazard: false });
  L.clip(196, 0, 68.4, 202.5, 4, 88, F_SOLID);
  P.car(L, 211, 0, 75.8, 0.5, { burnt: true });
  fireSource(L, 211, 0.9, 75.8, 0.85);
  alarmCar(L, 205.5, 0, 83.2, -Math.PI / 2 + 0.12, 0x8a8a88);
  P.car(L, 228.5, 0, 82.8, Math.PI / 2 - 0.08, { taxi: true, color: 0xd8b020 });
  hittable(L, 'car', 246.5, 0, 77.6, 1.25, { color: 0x2a3a5a });
  P.van(L, 262, 0, 73.4, Math.PI / 2 + 0.2);
  P.car(L, 270.5, 0, 80.5, 2.3, { police: true });
  P.car(L, 274.5, 0, 75.2, 0.7, { police: true });
  L.light(272, 1.8, 78, 0x3050ff, 4, 8, { flicker: 0.9 });
  P.sandbags(L, 277, SWY, 78, Math.PI / 2, 8, 4);
  P.fenceChain(L, 278, 68.4, 278, 88, 0, 3.4);
  L.clip(277.4, 0, 68.4, 280, 4, 88, F_SOLID);
  P.barricade(L, 275.6, 0, 84.8, Math.PI / 2);
  P.barricade(L, 275.8, 0, 71.8, Math.PI / 2);
  sgn(L, 'CEDA QUARANTINE\nNO ENTRY', 277.7, 2.2, 78, -Math.PI / 2, 2.4, 1.0, { bg: '#d8c030', fg: '#101010', border: '#101010' });
  for (const [x, z, r] of [[268.4, 84.6, 0.2], [266.6, 84.6, -0.1]]) P.bodyBag(L, x, SWY + 0.01, z, r + Math.PI / 2);
  L.item('molotov', 272.3, 0.02, 83.4, { chance: 0.45 });
  L.item('ammo', 276.2, 0.02, 81.8, { chance: 0.5 });
  physProp(L, 'cone', 240.5, 0, 74);
  physProp(L, 'cone', 242.3, 0, 75.2);
  physProp(L, 'trashcan', 250.5, SWY, 70.2);
  physProp(L, 'propane', 231, SWY, 70.1);
  P.trashBags(L, 222.5, SWY, 69.4, 4);
  P.papers(L, 238, 0.01, 78, 9, 26);
  for (let i = 0; i < 9; i++) L.decal(200 + rng() * 75, 0.012, 70 + rng() * 15, 0, 1, 0, 0.8 + rng() * 1.4, DF.BLOOD1 + (i % 4));
  for (const [x, z, r] of [[236, 76.5, 0.4], [252, 80.4, 2.1], [219, 73.2, -1.2]]) { P.corpse(L, x, 0.01, z, r, [0x3a3a3a, 0x5a2a2a, 0x2a3a5a][Math.floor(rng() * 3)]); L.decal(x, 0.012, z, 0, 1, 0, 1.6, DF.POOL); }
  L.reverb(196, 0, 68.4, 280, 14, 88, 'outdoor');
  L.ambience(196, -0.5, 68.4, 280.8, 16, 88, 'city');
  // backdrop skyline blocks beyond the street
  facade(L, 170, 104, 300, 130, 0, 26, { mat: 'concreteDark', faces: ['n'], lit: 0.05 });
  facade(L, 280.8, 30, 310, 104, 0, 22, { mat: 'brickDark', faces: ['w'], lit: 0.05 });
  facade(L, 196, 20, 238, 43.0, 0, 20, { mat: 'concrete', faces: ['e', 's'], lit: 0.04, parapet: false });
  L.trigger(232.4, SWY - 0.5, 64, 238, SWY + 3, 68.4, () => {
    game.session.objective('Get to the pawn shop safe room');
    game.voice.script([{ who: 'louis', text: 'There! Pawn shop across the street — safe room sign on the door!', d: 0.3 }]);
    L.after(3, () => game.director.spawnMob(12, { where: 'behind', minD: 20, maxD: 55 }));
  });
}

// ============================================================ PAWN SHOP (end safe room)
function buildPawnShop(L, game) {
  const x0 = 250, x1 = 264, z0 = 88, z1 = 98, y = SWY, h = 3.4;
  safeRoom(L, {
    x0, z0, x1, z1, y, h, doorWall: 'n', doorAt: 253.5, end: true, noWalls: ['n'], wall: 'plasterDirty', floor: 'woodFloorDark', ceil: 'ceiling',
    graffiti: [],
  });
  // street wall with barred windows and the red safe door
  const wins = [[250.5, 252.4], [255, 262.8]];
  const zf = z0 - 0.05;
  L.wallX(x0 - 0.1, x1 + 0.1, zf, y, y + h, 'brickDark', 0.2, [{ a: 252.95, b: 254.05, y0: y, y1: y + 2.15 }, ...wins.map(([a, b]) => ({ a, b, y0: y + 0.95, y1: y + 2.7 }))]);
  const door = new Door(L, 253.5, y, zf, 'x', { width: 1.1, safe: true, hinge: 1 });
  L.endDoor = door;
  for (const [a, b] of wins) {
    new WindowPane(L, a, y + 0.95, zf - 0.02, b, y + 2.7, zf + 0.02, { dirty: true });
    for (let x = a + 0.08; x < b - 0.04; x += 0.14) L.box(x - 0.012, y + 0.95, z0 - 0.2, x + 0.012, y + 2.7, z0 - 0.17, 'metalDark', { collide: false });
    for (const yy of [y + 1.1, y + 2.55]) L.box(a, yy - 0.02, z0 - 0.21, b, yy + 0.02, z0 - 0.16, 'metalDark', { collide: false });
    L.clip(a, y + 0.95, z0 - 0.21, b, y + 2.7, z0 - 0.1, F_SOLID);
    L.box(a - 0.1, y + 2.75, z0 - 0.35, b + 0.1, y + 3.1, z0 - 0.1, 'metal', { collide: false, tint: 0x6a6e70 });
  }
  L.box(x0 - 0.1, y + h, z0 - 0.3, x1 + 0.1, y + h + 0.3, z0 - 0.1, 'brickDark', { collide: false });
  sgn(L, 'PAWN', 258.9, y + 3.35, z0 - 0.36, 0, 2.2, 0.55, { fg: '#ffcc30', glow: 2.2, lightColor: 0xffb030, lightIntensity: 5, font: 'Georgia, serif' });
  sgn(L, 'LUCKY STAR PAWN & LOAN', 256.5, y + 4.4, z0 - 0.02, 0, 6, 0.6, { bg: '#1a1a1a', fg: '#e8c040', border: '#e8c040' });
  sgn(L, 'GOLD · GUITARS · TOOLS · LOANS', 258.9, y + 2.35, zf - 0.06, 0, 3.6, 0.3, { fg: '#e8e0c8' });
  sgn(L, 'SAFE ROOM', 253.5, y + 2.6, zf - 0.12, 0, 1.0, 0.26, { bg: '#8a1a14', fg: '#fff' });
  L.light(253.5, y + 2.9, z0 - 0.8, 0xffd9a0, 5, 6);
  L.box(253.3, y + 2.75, z0 - 0.2, 253.7, y + 2.85, z0 - 0.1, 'emissiveWarm', { collide: false });
  // back wall block behind the shop
  L.box(x0 - 0.1, 0, z1 + 0.1, x1 + 0.1, y + h + 0.3, 104, 'brickDark');
  facade(L, x0 - 0.1, z0, x1 + 0.1, 104, y + h + 0.3, 12, { mat: 'brickDark', faces: ['n'], lit: 0.08, skipBelow: 5 });
  // interior: display cases, guitars, TVs, safe, register
  displayCase(L, 255.6, y, 91.2, 0, 2.4);
  displayCase(L, 258.4, y, 91.2, 0, 2.4);
  displayCase(L, 260.95, y, 92.6, Math.PI / 2, 2.2);
  displayCase(L, 257.2, y, 95.2, Math.PI, 3.0);
  const reg = P.prop(L, 257.2, y + 1.22, 95.2, Math.PI);
  reg.box(0.9, 0.12, 0, 0.4, 0.24, 0.35, 'plastic', 0x2a2a2a).box(0.9, 0.3, 0.08, 0.32, 0.14, 0.04, 'glassDirty', 0x203020);
  for (let i = 0; i < 6; i++) guitar(L, 255 + i * 1.3, y + 1.55 + (i % 2) * 0.12, z1 - 0.14, 0, [0x9a5a2a, 0xc88a3a, 0x1a1a1a, 0xa82a1a, 0x6a3a1a, 0x2a4a8a][i], i % 3 === 2);
  for (let i = 0; i < 3; i++) guitar(L, x1 - 0.14, y + 1.6, 89.8 + i * 1.3, Math.PI / 2, [0xc8a060, 0x3a1a1a, 0x8a4a2a][i], i === 1);
  shelving(L, x0 + 0.35, y, 91.0, -Math.PI / 2, 2.0, 2.2, 0);
  shelving(L, x0 + 0.35, y, 93.3, -Math.PI / 2, 2.0, 2.2, 0);
  for (let i = 0; i < 4; i++) crt(L, x0 + 0.38, y + 0.802 + Math.floor(i / 2) * 0.667, 90.45 + (i % 2) * 1.1, -Math.PI / 2, 0.8, i === 1);
  for (let i = 0; i < 3; i++) crt(L, x0 + 0.38, y + 0.802, 92.75 + i * 0.62, -Math.PI / 2, 0.7);
  const safe = P.prop(L, 262.9, y, 96.9, Math.PI);
  safe.box(0, 0.75, 0, 1.2, 1.5, 1.0, 'metalDark', 0x3a3a38).cyl(0.2, 0.8, -0.52, 0.12, 0.05, 'chrome', null, [Math.PI / 2, 0, 0]).box(-0.3, 0.8, -0.52, 0.05, 0.3, 0.04, 'chrome').col(0, 0.75, 0, 1.2, 1.5, 1.0, 'metal');
  const fan = P.prop(L, 257, y + h - 0.35, 93, 0.4);
  fan.cyl(0, 0.15, 0, 0.02, 0.3, 'metalDark').cyl(0, 0, 0, 0.12, 0.12, 'woodDark');
  for (let i = 0; i < 4; i++) fan.box(Math.cos(i * 1.57) * 0.45, 0, Math.sin(i * 1.57) * 0.45, i % 2 ? 0.14 : 0.7, 0.02, i % 2 ? 0.7 : 0.14, 'woodDark');
  poster(L, 'WE BUY GOLD\n$$$ CASH TODAY $$$', 251.7, y + 2.3, z1 - 0.12, 0, 1.8, 0.7, { bg: '#1a1a1a', fg: '#ffcc30' });
  sgn(L, 'NO REFUNDS\nNO LAYAWAY', x1 - 0.12, y + 2.6, 94.8, Math.PI / 2, 1.0, 0.4, { bg: '#e8e0c8', fg: '#8a1a14' });
  graf(L, 'SHOTGUN\nUNDER\nCOUNTER →', x1 - 0.12, y + 1.45, 94.3, Math.PI / 2, 1.0, 0.6, '#1a2a8a');
  graf(L, 'SEWERS RUN\nUNDER MERCY', x0 + 0.12, y + 1.7, 96.2, -Math.PI / 2, 1.8, 0.8, '#b8201a');
  // supplies
  L.item('medkit', 255.0, y + 1.24, 91.2);
  L.item('medkit', 255.8, y + 1.24, 91.2);
  L.item('medkit', 257.8, y + 1.24, 91.2);
  L.item('medkit', 258.8, y + 1.24, 91.2);
  L.item('ammo', 261.4, y + 0.02, 96.8);
  L.item('tier1', 256.4, y + 1.24, 95.1);
  L.item('tier1', 258.0, y + 1.24, 95.1, { chance: 0.7 });
  L.item('tier2', 260.95, y + 1.24, 92.6, { chance: 0.5 });
  L.item('pills', 252.2, y + 0.02, 96.8, { chance: 0.6 });
  L.flowEnd = [256, y, 93.3];
  L.trigger(x0 + 0.2, y - 0.3, z0 + 0.4, x1 - 0.2, y + 2.5, z1 - 0.2, () => {
    game.voice.say(game.survivors[2], 'closeDoor', 2);
    L.after(1.5, () => game.voice.script('ch2Safe'));
  });
}
