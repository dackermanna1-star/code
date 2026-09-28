// Dead Air 1 — the block: Building B's top two floors (witch apartment with
// the emergency broadcast on TV, the burning corridor, the burned-through
// apartment floor), the fire escape down onto Building C's rooftop bar (with
// the crashed Sky 9 news helicopter) and the Sterling Mutual office in D,
// whose smashed window drops onto a semi-trailer in Harbor Street.
import * as THREE from 'three';
import { ceilingLight, sign, graffiti, fireSource, physProp, P, floorWithHoles, railSegment, burningBarrel } from './kit.js';
import { Door, WindowPane } from '../world/dynamic.js';
import { F_SOLID, F_SHOOT, F_SIGHT } from '../world/collision.js';
import { DF } from '../render/decals.js';
import { parapet, ebsScreen, neonSign } from './da_parts.js';
import { YA, F4, F3, YC, ZS, ZN, rng, rot, windowGrid, fireEscapeDeco, deadPlant, pot, roofVent, lawnChair, stringLights, bloodTrail, scatterBlood } from './da1_common.js';

const NC = { collide: false };
const BX0 = 39, BX1 = 66; // building B
const CZ0 = 27.2, CZ1 = 29.2; // corridor (both floors)
export const HOLE = [52, 36.5, 55.5, 40];

// exterior wall with real window openings (static glass unless listed as breakable)
function extWall(L, axis, a0, a1, fixed, t, y0, y1, mat, wins, o = {}) {
  const ops = wins.map((w) => ({ a: w.at - (w.w ?? 1.2) / 2, b: w.at + (w.w ?? 1.2) / 2, y0: w.y + (w.sill ?? 0.95), y1: w.y + (w.sill ?? 0.95) + (w.h ?? 1.5), w }));
  if (axis === 'x') L.wallX(a0, a1, fixed, y0, y1, mat, t, ops, { tint: o.tint });
  else L.wallZ(a0, a1, fixed, y0, y1, mat, t, ops, { tint: o.tint });
  for (const q of ops) {
    const w = q.w;
    if (w.open) continue;
    const g0 = fixed - 0.015, g1 = fixed + 0.015;
    if (w.pane) {
      if (axis === 'x') new WindowPane(L, q.a, q.y0, g0, q.b, q.y1, g1, { dirty: true });
      else new WindowPane(L, g0, q.y0, q.a, g1, q.y1, q.b, { dirty: true });
    } else if (axis === 'x') L.box(q.a, q.y0, g0, q.b, q.y1, g1, 'glassDirty', { flags: F_SOLID, tint: 0x5a6a68 });
    else L.box(g0, q.y0, q.a, g1, q.y1, q.b, 'glassDirty', { flags: F_SOLID, tint: 0x5a6a68 });
    // inner sill
    if (axis === 'x') L.box(q.a - 0.05, q.y0 - 0.04, fixed - t / 2 - 0.06, q.b + 0.05, q.y0, fixed + t / 2 + 0.06, 'woodDark', NC);
    else L.box(fixed - t / 2 - 0.06, q.y0 - 0.04, q.a - 0.05, fixed + t / 2 + 0.06, q.y0, q.b + 0.05, 'woodDark', NC);
  }
}
const W = (at, y, o = {}) => ({ at, y, ...o });

// ============================================================ BUILDING B
function buildB(L, game, S) {
  // lower body (solid, facade dressing) up to the 4th-floor level
  L.box(BX0, -0.5, ZN, BX1, F3, ZS, 'brick', { ao: 0.9, tint: 0xb89a88 });
  windowGrid(L, 's', BX0 + 0.4, BX1 - 0.4, ZS, 3.6, F3 - 0.1, { lit: 0.1, ac: 0.3 });
  windowGrid(L, 'n', BX0 + 0.4, BX1 - 0.4, ZN, 0, F3 - 0.1, { lit: 0.05 });
  windowGrid(L, 'w', ZN + 0.4, ZS - 0.4, BX0, 0, F3 - 0.1, { lit: 0.05, broken: 0.15 });
  windowGrid(L, 'e', ZN + 0.4, ZS - 0.4, BX1, YC, F3 - 0.1, { lit: 0.04, y0: YC });
  // ground floor: pawn shop + boarded laundromat on the street
  L.box(40.5, 0.5, ZS + 0.005, 50, 2.9, ZS + 0.03, 'glassDirty', { collide: false, tint: 0x10161a });
  for (let x = 40.7; x < 50; x += 0.22) L.box(x, 0.5, ZS + 0.03, x + 0.04, 2.9, ZS + 0.06, 'metalDark', NC);
  sign(L, 'LUCKY STAR PAWN', 45.3, 3.4, ZS + 0.04, 0, 5, 0.6, { bg: '#1a1a1a', fg: '#ffcc30', glow: 1.5, lightColor: 0xffc040, lightIntensity: 3 });
  for (let k = 0; k < 6; k++) L.box(53 + k * 1.6, 0.4, ZS + 0.02, 54.4 + k * 1.6, 2.8, ZS + 0.06, 'woodPale', { collide: false, tint: 0x8a7a60 });
  sign(L, 'SUDS & DUDS', 58, 3.4, ZS + 0.04, 0, 4, 0.55, { bg: '#2a4a7a', fg: '#e8f0ff' });
  // exterior walls of the two used floors (F3 floor .. roof)
  const t = 0.3;
  extWall(L, 'x', BX0, BX1, ZS - t / 2, t, F3, YA, 'brick', [
    W(41.5, F4, { pane: true }), W(45.5, F4, { pane: true }), W(50.5, F4, { open: true }), W(54.5, F4, { open: true }), W(60, F4), W(63.5, F4),
    W(41.5, F3), W(45.5, F3), W(50.5, F3, { pane: true }), W(54.5, F3, { pane: true }), W(60, F3, { pane: true }), W(63.5, F3, { pane: true }),
  ], { tint: 0xb89a88 });
  extWall(L, 'x', BX0, BX1, ZN + t / 2, t, F3, YA, 'brick', [
    W(46.5, F4, { pane: true }), W(50.5, F4, { pane: true }), W(56, F4), W(60, F4), W(63.5, F4),
    W(46.5, F3), W(50.5, F3), W(56, F3, { pane: true }), W(60, F3, { pane: true }), W(63.5, F3, { pane: true }),
  ], { tint: 0xb89a88 });
  extWall(L, 'z', ZN + t, ZS - t, BX0 + t / 2, t, F3, YA, 'brick', [W(33, F4, { pane: true }), W(38.5, F4, { pane: true }), W(33, F3), W(38.5, F3)], { tint: 0xb89a88 });
  // east wall: fire-escape door on the 4th floor, windows over C's roof
  L.wallZ(ZN + t, ZS - t, BX1 - t / 2, F3, YA, 'brick', t, [
    { a: 19, b: 20.2, y0: F4 + 0.95, y1: F4 + 2.45 }, { a: 23, b: 24.2, y0: F4 + 0.95, y1: F4 + 2.45 }, { a: 33, b: 34.2, y0: F4 + 0.95, y1: F4 + 2.45 },
    { a: 19, b: 20.2, y0: F3 + 0.95, y1: F3 + 2.45 }, { a: 23, b: 24.2, y0: F3 + 0.95, y1: F3 + 2.45 }, { a: 33, b: 34.2, y0: F3 + 0.95, y1: F3 + 2.45 }, { a: 38, b: 39.2, y0: F3 + 0.95, y1: F3 + 2.45 },
    { a: 27.65, b: 28.75, y0: F3, y1: F3 + 2.2 },
  ], { tint: 0xb89a88 });
  for (const [a, y, pane] of [[19.6, F4, false], [23.6, F4, false], [33.6, F4, false], [19.6, F3, true], [23.6, F3, true], [33.6, F3, true], [38.6, F3, true]]) {
    if (pane) new WindowPane(L, BX1 - 0.165, y + 0.95, a - 0.6, BX1 - 0.135, y + 2.45, a + 0.6, { dirty: true });
    else L.box(BX1 - 0.165, y + 0.95, a - 0.6, BX1 - 0.135, y + 2.45, a + 0.6, 'glassDirty', { flags: F_SOLID, tint: 0x5a6a68 });
  }
  // floor slabs: F3 = body top; F4 slab with the burned hole and the stair-shaft cut
  floorWithHoles(L, BX0 + t, ZN + t, BX1 - t, ZS - t, F4, 0.3, 'ceiling', [[39.3, 16.3, 43.9, 23.8], HOLE]);
  L.box(39.3, F3, 16.3, 43.9, F4, 27.2, 'concrete', { visible: false }); // below the stair shaft
  L.box(39.3, F4, 18.8, 43.7, 15.9, 20.8, 'concrete', { visible: false }); // under the mid landing
  buildF4(L, game, S);
  buildF3(L, game, S);
  L.ambience(BX0, F3, ZN, BX1, YA - 0.3, ZS, 'apartments');
  L.reverb(BX0, F3, CZ0, BX1, YA - 0.3, CZ1, 'room');
}

function corridorWalls(L, y, h, north, south) {
  // north side from the shaft (43.9) east; south side full length
  L.wallX(43.9, 65.7, 27.1, y, y + h, 'plasterDirty', 0.2, north.map((d) => ({ a: d - 0.5, b: d + 0.5, y0: y, y1: y + 2.2 })), { tint: 0xc8bca8 });
  L.wallX(39.3, 65.7, 29.3, y, y + h, 'plasterDirty', 0.2, south.map((d) => ({ a: d - 0.5, b: d + 0.5, y0: y, y1: y + 2.2 })), { tint: 0xc8bca8 });
  // partitions
  L.wallZ(16.3, 27.0, 53, y, y + h, 'wallpaper', 0.16);
  L.wallZ(29.4, 43.7, 48, y, y + h, 'wallpaper', 0.16);
  L.wallZ(29.4, 43.7, 57, y, y + h, 'wallpaper', 0.16);
  // skirting + carpet runner
  L.box(39.3, y - 0.01, CZ0 + 0.1, 65.7, y + 0.006, CZ1 - 0.1, 'carpetGray', { collide: false, tint: 0x6a4a3a });
  for (const zz of [CZ0 + 0.1, CZ1 - 0.1]) L.box(39.3, y, zz - 0.01, 65.7, y + 0.1, zz + 0.01, 'woodDark', NC);
}
function apDoor(L, x, y, z, o = {}) {
  const d = new Door(L, x, y, z, 'x', { width: 1.0, hinge: o.hinge ?? 1, open: o.open, locked: o.locked, material: o.mat ?? 'woodDark' });
  if (o.swing) { d.dirSign = o.swing; d.updateCollider(); }
  sign(L, o.num ?? '', x + 0.75, y + 1.6, z + (o.side ?? 1) * 0.12, 0, 0.18, 0.12, { bg: '#b8a060', fg: '#1a1a1a' });
  return d;
}

// ---------------------------------------------------------------- 5th floor
function buildF4(L, game, S) {
  const y = F4, h = YA - 0.3 - F4;
  corridorWalls(L, y, h, [47, 55], [44.5, 50.5]);
  // finishes
  L.box(43.9, y - 0.01, 16.3, 53, y + 0.006, 27, 'woodFloor', NC);
  L.box(39.3, y - 0.01, 29.4, 48, y + 0.006, 43.7, 'carpet', NC);
  floorWithHoles(L, 48, 29.4, 57, 43.7, y + 0.006, 0.016, 'woodFloorDark', [HOLE], { collide: false, tint: 0x5a4a3a });
  // doors
  const nd = apDoor(L, 47, y, 27.1, { open: true, swing: 1, hinge: -1, num: '5A', side: 1 });
  void nd;
  apDoor(L, 55, y, 27.1, { locked: true, num: '5B' });
  apDoor(L, 44.5, y, 29.3, { open: true, hinge: 1, num: '5C', side: -1 });
  // 5D (burned): charred frame, no door
  L.box(50, y, 29.2, 51, y + 2.2, 29.4, 'blackMatte', { collide: false, tint: 0x0a0806 });
  L.decal(50.5, y + 2.4, 29.18, 0, 0, -1, 1.6, DF.SCORCH);
  // closed apartments (no interior)
  L.box(53.1, y, 16.3, 65.7, YA - 0.3, 27, 'concrete', { visible: false });
  L.box(57.1, y, 29.4, 65.7, YA - 0.3, 43.7, 'concrete', { visible: false });
  // corridor lighting + dressing
  ceilingLight(L, 45.5, YA - 0.3, 28.2, { type: 'fluoro', intensity: 8, flicker: 0.35 });
  ceilingLight(L, 52, YA - 0.3, 28.2, { type: 'fluoro', intensity: 7, flicker: 0.85 });
  ceilingLight(L, 57.5, YA - 0.3, 28.2, { type: 'fluoro', on: false });
  graffiti(L, 'WITCH IN 5A\nLIGHTS OFF\nKEEP QUIET', 50, y + 1.5, 29.18, Math.PI, 1.8, 0.9, '#d8d8c8');
  sign(L, 'FIRE ESCAPE ↓\nFLOOR 4', 47.6, y + 1.7, 27.22, 0, 0.9, 0.35, { bg: '#1a4a1a', fg: '#e8f0e8' });
  P.corpse(L, 44, y + 0.01, 28.5, 1.2, 0x5a2a2a);
  L.decal(44, y + 0.012, 28.5, 0, 1, 0, 1.6, DF.POOL);
  bloodTrail(L, 44.5, 28.4, 49.5, 28.0, y, 6);
  P.prop(L, 53.8, y, 28.6, 0.4).box(0, 0.45, 0, 0.9, 0.6, 0.55, 'plastic', 0x3a5a8a).box(0, 0.1, 0, 0.8, 0.05, 0.5, 'metalDark').col(0, 0.4, 0, 0.9, 0.8, 0.55, 'plastic');
  P.papers(L, 51, y + 0.01, 28.2, 1.2, 8);
  physProp(L, 'trashcan', 42.5, y, 28.6);
  // burning corridor end (blocked): rubble, fire, collapsed ceiling
  P.debris(L, 60.5, y, 28.2, 1.3, 'plaster', 14);
  L.box(59.2, y, 27.2, 65.7, y + 1.2, 29.2, 'plasterDirty', { tint: 0x3a3028 });
  L.box(60, y + 1.2, 27.2, 65.7, y + 2.2, 29.2, 'woodDark', { collide: false, tint: 0x2a2018 });
  L.box(58.7, y, 27.2, 59.2, YA - 0.3, 29.2, 'concrete', { visible: false });
  fireSource(L, 60.2, y + 1.2, 28.3, 1.1);
  fireSource(L, 62.5, y + 2.2, 28.0, 1.0);
  L.decal(58.9, y + 2.9, 28.2, 0, -1, 0, 3.2, DF.SCORCH);
  L.decal(59, y + 1.8, 27.22, 0, 0, 1, 2.4, DF.SCORCH);
  L.decal(59, y + 1.8, 29.18, 0, 0, -1, 2.4, DF.SCORCH);
  S.corridorFire = [59, y, 28.2];

  // -------------------------------------------- 5A: the Witch and the TV
  const ay = y;
  const tvx = 48.5, tvz = 16.62;
  const tvStand = P.prop(L, tvx, ay, 16.62, 0);
  tvStand.box(0, 0.25, 0.1, 1.6, 0.5, 0.45, 'woodDark').col(0, 0.25, 0.1, 1.6, 0.5, 0.45, 'wood');
  tvStand.box(0, 0.83, 0.12, 1.1, 0.66, 0.12, 'blackMatte').box(0, 0.51, 0.12, 0.3, 0.04, 0.2, 'blackMatte');
  S.tv5A = ebsScreen(L, game, tvx, ay + 0.84, tvz + 0.19, 0, 1.0, 0.58, { intensity: 6, range: 8 });
  P.sofa(L, 48.5, ay, 21.2, Math.PI, 0x5a3a3a);
  P.rug(L, 48.5, ay + 0.008, 19.4, 3.2, 2.6, 0x3a2a4a);
  P.table(L, 48.5, ay, 19.9, 0, 1.0, 0.55, 'woodDark');
  P.bookshelf(L, 44.3, ay, 20.5, Math.PI / 2);
  P.lamp(L, 50.8, ay, 17);
  P.counter(L, 44.35, ay, 24.5, Math.PI / 2, 2.4);
  P.fridge(L, 44.4, ay, 22.4, Math.PI / 2);
  P.bed(L, 51.3, ay, 24.5, Math.PI / 2, 0x6a2a2a);
  P.dresser(L, 52.4, ay, 19.2, -Math.PI / 2);
  P.picture(L, 46, ay + 1.6, 16.32, 0);
  P.papers(L, 48, ay + 0.01, 22.5, 1.4, 9);
  P.chair(L, 46.6, ay, 18.2, 2.4, 'woodDark', true);
  L.decal(48.5, ay + 0.012, 18.3, 0, 1, 0, 2.2, DF.POOL);
  L.decal(47.3, ay + 1.3, 16.32, 0, 0, 1, 0.8, DF.HAND, { noRoll: true });
  L.decal(49.7, ay + 1.1, 16.32, 0, 0, 1, 0.9, DF.BLOOD3);
  S.witchSpot = [48.5, ay, 17.9];
  L.reverb(43.9, ay, 16.3, 53, YA - 0.3, 27, 'room');

  // -------------------------------------------- 5C: side apartment with supplies
  P.sofa(L, 43.5, ay, 42.8, 0, 0x3a4a5a);
  P.table(L, 43.5, ay, 41, 0, 1.0, 0.6, 'woodDark');
  P.bed(L, 45.7, ay, 34, -Math.PI / 2, 0x3a4a6a);
  P.dresser(L, 39.7, ay, 36.2, Math.PI / 2);
  P.tv(L, 39.6, ay, 40.5, Math.PI / 2);
  P.counter(L, 42.2, ay, 29.75, Math.PI, 2.2);
  L.item('pills', 42.2, ay + 0.95, 29.75, { chance: 0.7 });
  L.item('ammo', 43.4, ay + 0.78, 41, { chance: 0.6 });
  L.item('secondary', 39.8, ay + 1.02, 36.2, { chance: 0.6 });
  ceilingLight(L, 43.6, YA - 0.3, 36, { intensity: 6, flicker: 0.5 });
  scatterBlood(L, 40, 31, 47, 42, ay, 2);

  // -------------------------------------------- 5D: burning apartment, floor gone
  const [hx0, hz0, hx1, hz1] = HOLE;
  P.counter(L, 48.45, ay, 33.5, -Math.PI / 2, 2.6);
  P.cabinetWall(L, 48.45, ay, 33.5, -Math.PI / 2, 2.6);
  P.sofa(L, 55.8, ay, 31.6, -Math.PI / 2, 0x2a1a14);
  P.bed(L, 55.4, ay, 42.3, 0, 0x2a2018);
  P.table(L, 50.3, ay, 40.8, 0.3, 1.2, 0.8, 'woodDark');
  P.chair(L, 49.4, ay, 39.5, 1.1, 'woodDark', true);
  P.bookshelf(L, 56.7, ay, 37, -Math.PI / 2);
  fireSource(L, 55.9, ay, 31.6, 0.95);
  fireSource(L, 55.4, ay + 0.5, 42.4, 1.0);
  fireSource(L, 48.6, ay + 0.95, 34.2, 0.55, { hazard: false, intensity: 10 });
  fireSource(L, 49.2, ay, 42.6, 0.7);
  // charred hole edges, dangling joists and boards
  for (let x = hx0 + 0.4; x < hx1; x += 0.8) L.box(x, ay - 0.3, hz0 - 0.2, x + 0.14, ay - 0.08, hz0 + 0.5 + rng() * 0.9, 'woodDark', { collide: false, tint: 0x1a1410 });
  for (let x = hx0 + 0.3; x < hx1; x += 1.1) P.prop(L, x, ay - 0.1, hz1 - 0.2, 0).box(0, -0.4, 0.3, 0.15, 0.06, 1.2, 'woodDark', 0x2a2018, [1.0, 0.1, 0]);
  L.box(hx0 - 0.25, ay + 0.006, hz0 - 0.25, hx1 + 0.25, ay + 0.012, hz0, 'blackMatte', { collide: false, tint: 0x0a0806 });
  L.box(hx0 - 0.25, ay + 0.006, hz1, hx1 + 0.25, ay + 0.012, hz1 + 0.25, 'blackMatte', { collide: false, tint: 0x0a0806 });
  L.decal((hx0 + hx1) / 2, YA - 0.31, (hz0 + hz1) / 2, 0, -1, 0, 6, DF.SCORCH);
  for (const [x, z, nx, nz] of [[48.1, 36, 1, 0], [56.9, 34, -1, 0], [52, 43.6, 0, -1], [53, 29.5, 0, 1]]) L.decal(x, ay + 1.8, z, nx, 0, nz, 3.5, DF.SCORCH);
  P.debris(L, 51, ay, 35.5, 0.8, 'woodDark', 6);
  P.corpse(L, 50.2, ay + 0.01, 37.6, 2.2, 0x1a1410);
  L.light(52.5, ay + 2.4, 34, 0xff7a30, 7, 9, { flicker: 0.5 });
  L.ambience(48, ay, 29.4, 57, YA - 0.3, 43.7, 'apartments');
  S.holeTrigger = [48.2, ay - 0.2, 33.5, 56.8, ay + 3, 43.5];
  // smoke pouring out of the broken street windows of 5D
  L.dynamics.push({ t: 0, update(dt) { this.t -= dt; if (this.t > 0) return; this.t = 0.2; const cp = game.camPos; if (Math.abs(cp.x - 52) > 80 || Math.abs(cp.z - 44) > 80) return; for (const x of [50.5, 54.5]) game.fx.smokeColumn(x + (Math.random() - 0.5) * 0.8, ay + 2.2, ZS + 0.4, 0.5, [0.1, 0.09, 0.08]); } });
}

// ---------------------------------------------------------------- 4th floor
function buildF3(L, game, S) {
  const y = F3, h = F4 - 0.3 - F3;
  corridorWalls(L, y, h, [47, 60.5], [55.5, 61.5]);
  // corridor west end collapsed (the stair is gone)
  L.box(39.3, y, CZ0, 45.8, y + h, CZ1, 'concrete', { visible: false });
  P.debris(L, 46.6, y, 28.2, 1.1, 'concrete', 14);
  L.box(45.8, y, CZ0, 46.3, y + 1.4, CZ1, 'concreteDark', { tint: 0x6a6660 });
  L.box(45.3, y + 1.4, CZ0, 46.3, y + 2.6, CZ1, 'plasterDirty', { collide: false, tint: 0x5a5048 });
  sign(L, 'STAIRS', 46.4, y + 2.4, 27.3, 0, 0.8, 0.25, { bg: '#1a4a1a', fg: '#e8f0e8' });
  // finishes
  L.box(48, y - 0.01, 29.4, 57, y + 0.006, 43.7, 'woodFloor', { collide: false, tint: 0x8a7a68 });
  L.box(53, y - 0.01, 16.3, 65.7, y + 0.006, 27, 'carpetBlue', NC);
  L.box(57, y - 0.01, 29.4, 65.7, y + 0.006, 43.7, 'woodFloorDark', NC);
  L.box(59.2, y - 0.01, CZ0, 65.7, y + 0.006, CZ1, 'carpetGray', { collide: false, tint: 0x6a4a3a });
  // closed apartments
  L.box(43.9, y, 16.3, 52.92, y + h, 27, 'concrete', { visible: false });
  L.box(39.3, y, 29.4, 47.92, y + h, 43.7, 'concrete', { visible: false });
  apDoor(L, 47, y, 27.1, { locked: true, num: '4A' });
  // doors: 4D (landing) open, 4E open, 4B = the door that bursts
  apDoor(L, 55.5, y, 29.3, { open: true, hinge: 1, num: '4D', side: -1 });
  apDoor(L, 61.5, y, 29.3, { open: true, hinge: 1, num: '4E', side: -1 });
  const burst = apDoor(L, 60.5, y, 27.1, { num: '4B', hp: 400 });
  S.burstDoor = burst;
  graffiti(L, 'DONT OPEN\nDEAD INSIDE', 60.5, y + 1.3, 27.21, 0, 1.3, 0.7, '#b8201a');
  for (const dy of [0.5, 1.1, 1.7]) L.box(59.9, y + dy, 27.22, 61.1, y + dy + 0.14, 27.28, 'woodPale', { collide: false, tint: 0x8a7a60 });
  S.burstTrigger = [53.5, y - 0.2, CZ0, 59.5, y + 3, CZ1];
  // corridor
  ceilingLight(L, 51, F4 - 0.3, 28.2, { type: 'fluoro', intensity: 8, flicker: 0.4 });
  ceilingLight(L, 57, F4 - 0.3, 28.2, { type: 'fluoro', intensity: 8, flicker: 0.15 });
  ceilingLight(L, 63.2, F4 - 0.3, 28.2, { type: 'fluoro', intensity: 7, flicker: 0.6 });
  P.corpse(L, 52, y + 0.01, 28.6, 0.2, 0x2a3a2a);
  L.decal(52, y + 0.012, 28.6, 0, 1, 0, 1.4, DF.POOL);
  bloodTrail(L, 58, 28, 64, 28.4, y, 6);
  P.papers(L, 57, y + 0.01, 28.1, 1.4, 10);
  const cart = P.prop(L, 63.8, y, 28.9, 0.2);
  cart.box(0, 0.55, 0, 0.9, 0.5, 0.55, 'fabric', 0x6a6a6a).box(0, 0.25, 0, 0.9, 0.04, 0.55, 'metalDark').col(0, 0.4, 0, 0.9, 0.8, 0.55, 'metal');
  sign(L, 'FIRE ESCAPE', 65.53, y + 2.5, 28.2, -Math.PI / 2, 0.9, 0.25, { bg: '#0a2a0a', fg: '#3aff5a', glow: 1.4, lightColor: 0x30ff50, lightIntensity: 2 });
  S.fireEscDoor = new Door(L, BX1 - 0.15, y, 28.2, 'z', { width: 1.1, hinge: 1, material: 'paintedRed' });
  // 4D: the landing under the hole
  const [hx0, hz0, hx1, hz1] = HOLE;
  P.debris(L, (hx0 + hx1) / 2, y, (hz0 + hz1) / 2, 1.6, 'woodDark', 14);
  P.debris(L, (hx0 + hx1) / 2 + 0.5, y, (hz0 + hz1) / 2 - 0.4, 1.0, 'plaster', 10);
  L.decal((hx0 + hx1) / 2, y + 0.012, (hz0 + hz1) / 2, 0, 1, 0, 4.5, DF.SCORCH);
  fireSource(L, 49.4, y, 42.6, 0.55);
  P.sofa(L, 50, y, 30.3, 0, 0x4a5a3a);
  P.tv(L, 50, y, 33.4, Math.PI);
  P.bed(L, 55.6, y, 41.5, 0, 0x8a7a6a);
  P.dresser(L, 56.6, y, 34.5, -Math.PI / 2);
  P.counter(L, 48.45, y, 38.5, -Math.PI / 2, 2.4);
  L.light((hx0 + hx1) / 2, F4 + 1, (hz0 + hz1) / 2, 0xff7a30, 6, 8, { flicker: 0.45 });
  ceilingLight(L, 50.5, F4 - 0.3, 34, { intensity: 5, flicker: 0.7 });
  L.item('pipebomb', 56.2, y + 1.02, 34.5, { chance: 0.5 });
  // 4E: supplies (the east windows look down on C's roof)
  P.bed(L, 64.3, y, 41.3, Math.PI / 2, 0x3a5a6a);
  P.sofa(L, 60.5, y, 42.9, 0, 0x6a4a2a);
  P.table(L, 61.5, y, 36, 0.2, 1.4, 0.8, 'wood');
  P.chair(L, 60.5, y, 35.4, 0.5);
  P.bookshelf(L, 57.4, y, 38, -Math.PI / 2);
  L.item('health', 61.2, y + 0.78, 36, { chance: 0.8 });
  L.item('ammo', 62, y + 0.78, 36.1, { chance: 0.8 });
  L.item('tier1', 64.9, y + 0.02, 31.2, { chance: 0.5 });
  ceilingLight(L, 61.3, F4 - 0.3, 36.5, { intensity: 7, flicker: 0.2 });
  graffiti(L, 'THE HOTEL\nACROSS THE\nSTREET', 57.13, y + 1.6, 33, Math.PI / 2, 1.6, 0.9, '#1a2a8a');
  // 4B: dark apartment the horde bursts out of
  P.sofa(L, 58, y, 17.2, 0, 0x3a3a3a);
  P.table(L, 59.8, y, 20, 0.7, 1.2, 0.7, 'woodDark');
  P.bed(L, 63.7, y, 20.5, -Math.PI / 2, 0x5a4a4a);
  P.debris(L, 57, y, 23, 0.8, 'woodDark', 8);
  scatterBlood(L, 54, 17, 65, 26, y, 5);
  S.burstRoom = [53.5, y, 16.8, 65.2, y, 26.5];
  L.ambience(BX0, y, ZN, BX1, F4, ZS, 'apartments');
}

// ============================================================ FIRE ESCAPE
function buildFireEscape(L, game, S) {
  const x0 = BX1, x1 = BX1 + 1.6;
  // platform at the 4th floor + stairs down (south) onto C's roof
  L.box(x0, F3 - 0.1, 26.4, x1, F3, 30.2, 'diamond', { surf: 'metal' });
  L.box(x1 - 0.05, F3, 26.4, x1, F3 + 1.0, 30.2, 'metalDark', { flags: F_SOLID | F_SHOOT });
  L.box(x0, F3, 26.4, x1, F3 + 1.0, 26.45, 'metalDark', { flags: F_SOLID | F_SHOOT });
  for (let z = 26.6; z < 30.2; z += 0.25) L.box(x1 - 0.04, F3, z, x1 - 0.01, F3 + 1.0, z + 0.02, 'metalDark', NC);
  L.stairs(x0 + 0.1, 30.2, x1 - 0.1, 35.2, YC, F3, '-z', 'diamond', { thin: true, surf: 'metal' });
  L.box(x1 - 0.1, YC, 30.2, x1, F3 + 1.0, 35.2, 'metalDark', { visible: false, flags: F_SOLID | F_SHOOT });
  railSegment(L, x1 - 0.05, F3 + 0.95, 30.2, x1 - 0.05, YC + 0.95, 35.2);
  // brackets + upper flights (decorative, up to the roof)
  for (const z of [26.6, 30]) L.box(x0, F3 - 0.8, z - 0.05, x0 + 1.5, F3 - 0.1, z + 0.05, 'metalDark', NC);
  fireEscapeDeco(L, 'e', 26.4, 30.2, BX1, F4, YA, 3.6);
  P.prop(L, x0 + 0.8, F4 - 1.8, 30.3, Math.PI / 2).box(0, 0, 0, Math.hypot(3.6, 3.2), 0.08, 0.9, 'diamond', null, [0, 0, 0.84]);
  ceilingLight(L, x0 + 0.3, F3 + 2.7, 28.2, { type: 'cage', intensity: 6, range: 8, flicker: 0.2 });
  S.fireEscTrigger = [x0, F3 - 0.2, 26.4, x1, F3 + 3, 30.2];
}

// ============================================================ BUILDING C (rooftop bar + crashed chopper)
function buildC(L, game, S) {
  const cx0 = 66, cx1 = 80;
  L.box(cx0, -0.5, ZN, cx1, YC - 0.12, ZS, 'brickDark', { ao: 0.9, tint: 0x8a7a70 });
  L.box(cx0, YC - 0.12, ZN, cx1, YC, ZS, 'roof');
  windowGrid(L, 'n', cx0 + 0.4, cx1 - 0.4, ZN, 0, YC, { lit: 0.08 });
  windowGrid(L, 's', cx0 + 0.4, cx1 - 0.4, ZS, 3.6, YC, { lit: 0.3, curtains: 0.8, fh: 3.6 });
  parapet(L, cx0, ZN, cx1, ZS, YC, { mat: 'brickDark', tint: 0x8a7a70, w: false, e: false });
  // ground floor: The Anchor (bar) with neon
  L.box(67, 0.4, ZS + 0.005, 79, 2.8, ZS + 0.03, 'glassDirty', { collide: false, tint: 0x201418 });
  L.box(67, 2.9, ZS, 79, 3.1, ZS + 0.9, 'fabric', { collide: false, tint: 0x1a2a4a });
  S.anchorNeon = neonSign(L, 'The Anchor', 73, 4.3, ZS + 0.06, 0, 5.4, 1.3, '#ff4aa0', { italic: true, lightIntensity: 6, lightRange: 10, flicker: 0.25 });
  neonSign(L, 'COCKTAILS', 69.2, 2.2, ZS + 0.04, 0, 1.8, 0.45, '#40d8ff', { font: 'Arial Black, Impact, sans-serif', light: false });
  // deck: wooden decking over the patio half, tar elsewhere
  L.box(68, YC, 16.5, 79.8, YC + 0.04, 31, 'woodPale', { tint: 0x8a7658 });
  // bar counter (north), back shelf with bottles, neon sign on a frame
  const bar = P.prop(L, 73.5, YC + 0.04, 18.9, 0);
  bar.box(0, 0.55, 0, 7, 1.1, 0.6, 'woodDark', 0x4a3020).box(0, 1.12, 0, 7.2, 0.06, 0.8, 'woodPale', 0x6a5238).col(0, 0.57, 0, 7, 1.14, 0.7, 'wood');
  const shelf = P.prop(L, 73.5, YC + 0.04, 16.85, 0);
  shelf.box(0, 0.5, 0, 7, 1.0, 0.5, 'woodDark', 0x3a2418).col(0, 0.5, 0, 7, 1.0, 0.5, 'wood');
  for (let i = 0; i < 26; i++) shelf.cyl(-3.3 + i * 0.26, 1.13, (i % 2) * 0.12 - 0.06, 0.035, 0.26, 'glassDirty', rng.pick([0x5a7a3a, 0x8a5a2a, 0x3a4a6a, 0xa8a8a0]), null, 8);
  for (const x of [70.2, 76.8]) L.box(x - 0.06, YC + 1.04, 16.8, x + 0.06, YC + 3.6, 16.92, 'metalDark', NC);
  L.box(70.2, YC + 3.0, 16.8, 76.8, YC + 3.08, 16.92, 'metalDark', NC);
  neonSign(L, 'ROOF DECK', 73.5, YC + 2.35, 16.9, 0, 3.6, 0.8, '#40d8ff', { font: 'Arial Black, Impact, sans-serif', lightIntensity: 5, flicker: 0.4 });
  for (let i = 0; i < 6; i++) { const st = P.prop(L, 70.8 + i * 1.1, YC + 0.04, 19.85, 0); st.cyl(0, 0.38, 0, 0.03, 0.76, 'chrome').cyl(0, 0.78, 0, 0.2, 0.06, 'fabric', 0x8a1a1a, null, 12); }
  for (let i = 0; i < 6; i++) physProp(L, 'bottle', 71 + i * 0.9, YC + 1.2, 18.9);
  // patio: tables, umbrellas (one blown over), heaters, planters, string lights
  for (const [x, z, up] of [[70, 23, true], [74, 23.5, true], [77.6, 26, false], [70.5, 27.8, true]]) {
    const tb = P.prop(L, x, YC + 0.04, z, rng() * 3);
    tb.cyl(0, 0.73, 0, 0.5, 0.04, 'metalClean', 0x9a9a94, null, 14).cyl(0, 0.36, 0, 0.04, 0.72, 'metalDark').col(0, 0.4, 0, 0.9, 0.8, 0.9, 'metal', F_SOLID | F_SHOOT);
    if (up) { tb.cyl(0, 1.6, 0, 0.025, 1.8, 'metalDark').geo(new THREE.ConeGeometry(1.3, 0.5, 8, 1, true), 'fabric', 0, 2.45, 0, [0, 0, 0], [1, 1, 1], rng.pick([0xb02a2a, 0xe8e0c8, 0x2a4a7a])); }
    else P.prop(L, x + 1.0, YC + 0.3, z + 0.6, 1.2).geo(new THREE.ConeGeometry(1.3, 0.5, 8, 1, true), 'fabric', 0, 0, 0, [1.3, 0, 0], [1, 1, 1], 0xe8e0c8);
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + rng(); P.chair(L, x + Math.cos(a) * 0.9, YC + 0.04, z + Math.sin(a) * 0.9, a + Math.PI / 2, 'metalDark', rng() < 0.3); }
  }
  for (const [x, z] of [[68.5, 25.5], [78.8, 20.8]]) { const ht = P.prop(L, x, YC + 0.04, z, 0); ht.cyl(0, 0.4, 0, 0.22, 0.8, 'metalClean').cyl(0, 1.3, 0, 0.05, 1.0, 'metalClean').cyl(0, 2.0, 0, 0.45, 0.12, 'metalClean').col(0, 0.4, 0, 0.44, 0.8, 0.44, 'metal'); }
  physProp(L, 'propane', 68.6, YC + 0.04, 29.8);
  physProp(L, 'propane', 79.2, YC + 0.04, 23.2);
  for (const [x, z] of [[67.4, 17.5], [67.4, 22], [79.3, 30.2]]) { L.box(x - 0.5, YC, z - 0.5, x + 0.5, YC + 0.7, z + 0.5, 'woodDark'); deadPlant(L, x, YC + 0.7, z, 2.4); }
  for (const x of [67.2, 72.5, 78.8]) L.box(x - 0.05, YC, 31.4, x + 0.05, YC + 3.0, 31.5, 'metalDark', NC);
  stringLights(L, [[67.2, 17.2], [67.2, 31.45], [72.5, 17.2], [72.5, 31.45], [78.8, 17.2], [78.8, 31.45]], YC + 2.95, { sag: 0.4 });
  L.light(70, YC + 2.4, 24, 0xffc890, 6, 9, { flicker: 0.1 });
  L.light(76.5, YC + 2.4, 24, 0xffc890, 5, 9, { flicker: 0.3 });

  // ---------------------------------------------------- the crashed news chopper
  const hx = 74, hz = 38.8;
  const hel = P.prop(L, hx, YC, hz, 0.35);
  // fuselage rolled onto its left side, nose crumpled against D's wall side
  hel.box(0, 1.25, 0, 4.4, 2.1, 2.2, 'carPaint', 0x2a3a5a, [0, 0, 1.2]);
  hel.box(1.9, 1.0, 0, 1.4, 1.5, 1.9, 'glassDirty', 0x1a2024, [0, 0.1, 1.2]);
  hel.box(-0.4, 1.35, 0, 3.6, 0.35, 2.25, 'paintedWhite', 0xd8d8d0, [0, 0, 1.2]);
  hel.box(-4.3, 0.95, 0.3, 5.2, 0.5, 0.5, 'carPaint', 0x2a3a5a, [0, -0.25, 0.25]);
  hel.box(-6.8, 1.3, 0.95, 0.12, 1.4, 0.9, 'carPaint', 0x2a3a5a, [0.4, -0.25, 0.25]);
  hel.box(0.6, 2.3, -0.9, 0.35, 0.6, 0.35, 'metalDark', null, [0.9, 0, 0.6]);
  for (const [a, l] of [[0.3, 4.5], [1.9, 3.2]]) hel.box(0.6 + Math.cos(a) * l / 2, 2.2, -1.2 + Math.sin(a) * l / 2, l, 0.05, 0.28, 'blackMatte', null, [0.15, -a, 0.2]);
  for (const sx of [-1, 1]) hel.box(0.2, 0.25 + (sx > 0 ? 1.1 : 0), sx * 1.1, 3.4, 0.08, 0.08, 'metalDark', null, [0, 0, 1.2]);
  hel.col(0, 1.2, 0, 4.6, 2.4, 2.6, 'metal');
  hel.col(-4.2, 0.9, 0.3, 4.8, 1.0, 0.8, 'metal');
  sign(L, 'SKY 9 NEWS', hx + 0.2, YC + 1.9, hz - 1.05, 0.35 + Math.PI, 2.2, 0.5, { fg: '#e8e8e0', bg: '#1a3a7a' });
  // a blade buried in D's wall, another hanging over the street parapet
  P.prop(L, 79.7, YC + 2.2, 35.2, 0).box(0, 0, 0, 0.3, 0.05, 4.2, 'blackMatte', null, [0.5, 0.2, 0.4]);
  L.decal(79.98, YC + 2.4, 35.4, -1, 0, 0, 1.4, DF.CRACK);
  P.prop(L, 70, YC + 1.2, 43.3, 0.1).box(0, 0, 0, 5.2, 0.05, 0.3, 'blackMatte', null, [0, 0, -0.25]);
  P.debris(L, 72, YC, 36, 1.8, 'metalDark', 12);
  P.debris(L, 76.8, YC, 41.5, 1.2, 'metal', 8);
  L.decal(73.5, YC + 0.02, 38.5, 0, 1, 0, 7, DF.SCORCH);
  fireSource(L, hx + 0.4, YC + 1.4, hz + 0.2, 1.3);
  fireSource(L, 71.3, YC, 37.2, 0.9);
  S.chopperFire = fireSource(L, 76.2, YC, 40.6, 0.8);
  L.dynamics.push({ t: 0, update(dt) { this.t -= dt; if (this.t > 0) return; this.t = 0.12; const cp = game.camPos; if (Math.hypot(cp.x - hx, cp.z - hz) > 110) return; game.fx.smokeColumn(hx + (Math.random() - 0.5), YC + 3, hz + (Math.random() - 0.5), 1.1, [0.07, 0.065, 0.06]); } });
  // pilot, reporter's camera
  P.corpse(L, 69.5, YC + 0.02, 35.8, 0.9, 0x2a2a3a);
  L.decal(69.5, YC + 0.03, 35.8, 0, 1, 0, 1.6, DF.POOL);
  const cam = P.prop(L, 68.4, YC + 0.02, 34.2, 1.2);
  cam.box(0, 0.16, 0, 0.25, 0.28, 0.6, 'blackMatte').cyl(0, 0.2, -0.4, 0.09, 0.2, 'blackMatte', null, [Math.PI / 2, 0, 0]).box(0, 0.33, 0.05, 0.1, 0.06, 0.4, 'metalDark');
  sign(L, 'SKY 9', 68.4, YC + 0.18, 34.2 + 0.13, 1.2, 0.2, 0.08, { bg: '#1a3a7a', fg: '#fff' });
  L.item('health', 68.8, YC + 0.02, 33.7, { chance: 0.6 });
  S.chopper = [hx, YC, hz];
  S.cRoofTrigger = [66, YC - 0.5, 30.5, 80, YC + 2.5, 44];
  // D's side of the roof: service door into the office
  L.box(79.3, YC + 2.4, 19.6, 80, YC + 2.48, 21.4, 'metalDark', NC);
  sign(L, 'STERLING MUTUAL\nSTAFF ENTRANCE · 2F', 79.95, YC + 2.75, 20.5, -Math.PI / 2, 1.5, 0.45, { bg: '#e8e4d8', fg: '#1a2a4a' });
  ceilingLight(L, 79.6, YC + 2.6, 20.5, { type: 'cage', intensity: 6, range: 7, flicker: 0.4 });
  graffiti(L, 'THRU HERE\nTO STREET', 79.95, YC + 1.35, 24.2, -Math.PI / 2, 1.6, 0.8, '#f0e0a0');
  L.reverb(cx0, YC, ZN, cx1, YC + 10, ZS, 'outdoor');
  L.ambience(cx0, YC, ZN, cx1, YC + 10, ZS, 'rooftop');
  L.killZone(-60, -30, ZN - 30, 150, 5.5, ZN - 0.02); // back alley behind the block
}

// ============================================================ BUILDING D (office, 2nd floor)
const DX0 = 80, DX1 = 104;
export const DWIN = [83, 85.5]; // the smashed window over the trailer (x range)
function buildD(L, game, S) {
  const y = YC, top = 10.5;
  const t = 0.3;
  // solid body below the office floor + above its ceiling; facade dressing
  L.box(DX0, -0.5, ZN, DX1, y, ZS, 'concrete', { ao: 0.9, tint: 0x9a968e });
  L.box(DX0, top, ZN, DX1, 14.4, ZS, 'concrete', { tint: 0x9a968e });
  windowGrid(L, 's', DX0 + 0.4, DX1 - 0.4, ZS, top, 14.4, { fh: 3.6, dx: 2.4, w: 2.0, h: 2.2, sill: 0.6, lit: 0.12, bands: true, glassTint: 0x1a2630 });
  windowGrid(L, 'n', DX0 + 0.4, DX1 - 0.4, ZN, 0, 14.4, { fh: 3.6, dx: 2.4, w: 2.0, h: 2.0, sill: 0.8, lit: 0.06, skip: (a, fy) => fy > 6 && fy < 9 });
  windowGrid(L, 'e', ZN + 0.4, ZS - 0.4, DX1, 0, 14.4, { fh: 3.6, dx: 2.4, w: 2.0, h: 2.0, sill: 0.8, lit: 0.05, skip: (a, fy) => fy > 6 && fy < 9 });
  windowGrid(L, 'w', ZN + 0.4, ZS - 0.4, DX0, 10.8, 14.4, { fh: 3.6, dx: 2.4, w: 2.0, h: 2.0, sill: 0.8, lit: 0.05 });
  parapet(L, DX0, ZN, DX1, ZS, 14.4, { mat: 'concrete', tint: 0x8a867e, clip: false, h: 0.9 });
  // ground floor lobby frontage + canopy
  L.box(81, 0.2, ZS + 0.005, 103, 3.2, ZS + 0.03, 'glassDirty', { collide: false, tint: 0x141c22 });
  for (let x = 81; x <= 103; x += 2.2) L.box(x - 0.05, 0.2, ZS, x + 0.05, 3.2, ZS + 0.06, 'metalDark', NC);
  sign(L, 'STERLING MUTUAL INSURANCE', 99.8, 3.45, ZS + 0.05, 0, 6.4, 0.45, { bg: '#1a2a3a', fg: '#d8e0e8', glow: 0.8, lightColor: 0xa0c0ff, lightIntensity: 3 });
  windowGrid(L, 's', DX0 + 0.4, DX1 - 0.4, ZS, 3.6, y, { fh: 3.6, dx: 2.4, w: 2.0, h: 2.0, sill: 0.8, lit: 0.08, glassTint: 0x1a2630 });
  // --- 2F exterior walls
  // south: curtain wall (floor to ceiling glass, one bay smashed out)
  const bays = [];
  for (let x = DX0 + t; x < DX1 - t - 0.1; x += 2.35) bays.push([x, Math.min(DX1 - t, x + 2.35)]);
  L.box(DX0, y, ZS - t, DX0 + t, top, ZS, 'concrete', { tint: 0x9a968e });
  L.box(DX1 - t, y, ZS - t, DX1, top, ZS, 'concrete', { tint: 0x9a968e });
  L.box(DX0 + t, y + 3.0, ZS - t, DX1 - t, top, ZS, 'concrete', { tint: 0x9a968e });
  L.box(DX0 + t, y, ZS - 0.08, DWIN[0], y + 0.15, ZS, 'metalDark');
  L.box(DWIN[1], y, ZS - 0.08, DX1 - t, y + 0.15, ZS, 'metalDark');
  for (const [a, b] of bays) {
    L.box(a - 0.05, y, ZS - 0.12, a + 0.05, y + 3.0, ZS, 'metalDark');
    if (b <= DWIN[0] + 0.01 || a >= DWIN[1] - 0.01) L.box(a + 0.05, y + 0.15, ZS - 0.06, b - 0.05, y + 3.0, ZS - 0.03, 'glassDirty', { flags: F_SOLID, tint: 0x6a7a80 });
  }
  // the smashed bay: open, jagged shards, blood on the frame
  L.box(DWIN[0] - 0.1, y, ZS - 0.12, DWIN[0], y + 3.0, ZS, 'metalDark');
  L.box(DWIN[1], y, ZS - 0.12, DWIN[1] + 0.1, y + 3.0, ZS, 'metalDark');
  const sh = P.prop(L, (DWIN[0] + DWIN[1]) / 2, y, ZS - 0.05, 0);
  for (let k = 0; k < 5; k++) sh.box(-1.1 + k * 0.55, 2.75 - rng() * 0.2, 0, 0.3 + rng() * 0.2, 0.5 + rng() * 0.3, 0.012, 'glassDirty', 0x8a9aa0, [0, 0, (rng() - 0.5) * 1.4]);
  sh.box(-1.15, 0.35, 0, 0.2, 0.45, 0.012, 'glassDirty', 0x8a9aa0, [0, 0, 0.5]);
  L.decal(DWIN[0] + 0.05, y + 1.2, ZS - 0.13, 0, 0, -1, 0.7, DF.HAND, { noRoll: true });
  for (let k = 0; k < 8; k++) L.box(DWIN[0] - 1 + rng() * 4, y + 0.005, ZS - 1.6 + rng() * 1.4, DWIN[0] - 0.9 + rng() * 4, y + 0.012, ZS - 1.5 + rng() * 1.4, 'glassDirty', { collide: false, tint: 0xb8c8c8 });
  S.windowTrigger = [DWIN[0] - 2, y - 0.2, 39.5, DWIN[1] + 2, y + 3, ZS];
  // west wall with the staff door from C's roof
  L.wallZ(ZN, ZS - t, DX0 + t / 2, y, top, 'concrete', t, [{ a: 19.95, b: 21.05, y0: y, y1: y + 2.2 }, { a: 25, b: 27, y0: y + 0.9, y1: y + 2.4 }, { a: 30, b: 32, y0: y + 0.9, y1: y + 2.4 }], { tint: 0x9a968e });
  for (const z of [26, 31]) L.box(DX0 + 0.135, y + 0.9, z - 1, DX0 + 0.165, y + 2.4, z + 1, 'glassDirty', { flags: F_SOLID, tint: 0x6a7a80 });
  S.officeDoor = new Door(L, DX0 + t / 2, y, 20.5, 'z', { width: 1.1, hinge: 1, material: 'metal' });
  // north + east walls with windows
  L.wallX(DX0 + t, DX1 - t, ZN + t / 2, y, top, 'concrete', t, [86, 90.8, 95.6, 100.4].map((x) => ({ a: x - 1, b: x + 1, y0: y + 0.8, y1: y + 2.6 })), { tint: 0x9a968e });
  for (const x of [86, 90.8, 95.6, 100.4]) L.box(x - 1, y + 0.8, ZN + 0.135, x + 1, y + 2.6, ZN + 0.165, 'glassDirty', { flags: F_SOLID, tint: 0x6a7a80 });
  L.wallZ(ZN, ZS - t, DX1 - t / 2, y, top, 'concrete', t, [20, 26, 32, 38].map((z) => ({ a: z - 1, b: z + 1, y0: y + 0.8, y1: y + 2.6 })), { tint: 0x9a968e });
  for (const z of [20, 26, 32, 38]) L.box(DX1 - 0.165, y + 0.8, z - 1, DX1 - 0.135, y + 2.6, z + 1, 'glassDirty', { flags: F_SOLID, tint: 0x6a7a80 });
  // ceiling (drop tiles) + carpet
  const ceil = y + 3.0;
  L.box(DX0 + t, ceil, ZN + t, DX1 - t, ceil + 0.05, ZS - t, 'ceiling', { tint: 0xc8c8c0 });
  L.box(DX0 + t, y - 0.01, ZN + t, DX1 - t, y + 0.006, ZS - t, 'carpetGray', { collide: false, tint: 0x5a6068 });
  // ---------------- stair lobby (x 80.3..85, z 16.3..24.5)
  L.wallX(DX0 + t, 85, 24.5, y, ceil, 'plaster', 0.15, [], { tint: 0xc8c4b8 });
  L.wallZ(ZN + t, 24.5, 85, y, ceil, 'plaster', 0.15, [{ a: 20.9, b: 23.1, y0: y, y1: y + 2.3 }], { tint: 0xc8c4b8 });
  L.box(DX0 + t, y - 0.005, ZN + t, 85, y + 0.012, 24.5, 'tileFloor', { collide: false, tint: 0x9a9890 });
  // collapsed stair down, elevator doors
  L.box(80.4, y, 16.4, 83.2, ceil, 18.6, 'concreteDark', { tint: 0x6a6660 });
  P.debris(L, 82.4, y, 19.3, 1.0, 'concrete', 12);
  sign(L, 'STAIR B', 81.8, y + 2.4, 18.62, 0, 0.8, 0.25, { bg: '#1a4a1a', fg: '#e8f0e8' });
  L.box(84.9, y, 17.2, 84.92, y + 2.2, 19.0, 'metalClean', { collide: false, tint: 0xa8a8a0 });
  L.box(84.88, y, 18.08, 84.92, y + 2.2, 18.12, 'blackMatte', NC);
  sign(L, '2', 84.88, y + 2.5, 18.1, -Math.PI / 2, 0.3, 0.3, { bg: '#1a1a1a', fg: '#fff' });
  sign(L, 'STERLING MUTUAL\nCLAIMS DEPT.  ·  FLOOR 2', 83, y + 1.9, 24.42, Math.PI, 2.2, 0.5, { bg: '#1a2a3a', fg: '#d8e0e8' });
  ceilingLight(L, 82.6, ceil, 21.5, { type: 'fluoro', intensity: 7, flicker: 0.6 });
  L.decal(81.8, y + 0.012, 21.8, 0, 1, 0, 1.3, DF.SMEAR);
  // ---------------- open-plan office (x 85..103.7, z 16.3..34.5)
  const pz = 34.5; // partition to the lounge
  L.wallX(DX0 + t, DX1 - t, pz, y, ceil, 'plaster', 0.15, [{ a: 101.2, b: 103.4, y0: y, y1: y + 2.3 }], { tint: 0xc8c4b8 });
  L.wallX(DX0 + t, 85, 29.6, y, ceil, 'plaster', 0.15, [], { tint: 0xc8c4b8 });
  L.wallZ(24.5, 29.6, 85, y, ceil, 'plaster', 0.15, [], { tint: 0xc8c4b8 });
  L.box(DX0 + t, y, 24.6, 84.9, ceil, 29.5, 'concrete', { visible: false }); // closed records room
  // conference room (glass) x 96.6..103.7 z 16.3..23.2
  L.box(96.55, y, ZN + t, 96.65, ceil, 23.2, 'glassDirty', { flags: F_SOLID, tint: 0x7a8a90 });
  L.box(96.6, y, 23.15, 101.8, ceil, 23.25, 'glassDirty', { flags: F_SOLID, tint: 0x7a8a90 });
  for (let z = ZN + 0.9; z < 23.2; z += 1.4) L.box(96.52, y, z, 96.68, ceil, z + 0.05, 'metalDark', NC);
  P.table(L, 100.2, y, 19.6, Math.PI / 2, 3.6, 1.3, 'woodDark');
  for (let k = 0; k < 4; k++) for (const sx of [-1, 1]) P.officeChair(L, 100.2 + sx * 1.05, y, 18.2 + k * 0.95, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
  S.tvOffice = ebsScreen(L, game, 103.6, y + 1.55, 19.6, -Math.PI / 2, 1.5, 0.86, { intensity: 6, range: 9, color: 0x7a8cff, vol: 0.55 });
  L.box(103.66, y + 1.05, 18.78, 103.7, y + 2.05, 20.42, 'blackMatte', NC);
  const wb = sign(L, 'EVAC PLAN??\n1. ROOF - NO\n2. PIER - FLOODED\n3. AIRPORT - FLIGHTS!\nGATE C  ·  ROUTE 9', 96.72, y + 1.6, 20, Math.PI / 2, 2.2, 1.2, { bg: '#f4f4f0', fg: '#1a2a8a', font: 'Comic Sans MS, Arial, sans-serif', weight: 'normal' });
  void wb;
  ceilingLight(L, 100.2, ceil, 19.6, { type: 'fluoro', intensity: 7, flicker: 0.2 });
  // cubicle pods
  const pods = [[88.2, 19.5], [93.8, 19.5], [88.2, 25.3], [93.8, 25.3], [98.4, 26.8], [88.2, 31.2]];
  for (const [x, z] of pods) cubiclePod(L, x, y, z);
  for (const [x, z] of [[91, 22.4], [96.3, 22.4], [91, 28.3], [96.3, 29.4]]) { L.box(x - 0.3, y, z - 0.3, x + 0.3, ceil, z + 0.3, 'concrete', { tint: 0xb8b4ac }); }
  // barricade of desks across the direct way
  for (let k = 0; k < 3; k++) P.desk(L, 92 + k * 1.5, y, 33.6, 0.1 * k + Math.PI, false);
  P.filingCabinet(L, 97.2, y, 33.8, 0.3);
  P.prop(L, 94.3, y + 0.76, 33.6, 0.5).box(0, 0.3, 0, 1.3, 0.6, 0.6, 'woodDark').col(0, 0.3, 0, 1.3, 0.6, 0.6, 'wood');
  // printers, water cooler, plants, lights
  const pr = P.prop(L, 102.8, y, 29, -Math.PI / 2);
  pr.box(0, 0.5, 0, 1.2, 1.0, 0.7, 'plastic', 0xc8c8c0).box(0, 1.05, 0.1, 1.0, 0.1, 0.4, 'plastic', 0x3a3a3a).col(0, 0.5, 0, 1.2, 1.0, 0.7, 'plastic');
  const wc = P.prop(L, 85.6, y, 17.2, 0);
  wc.box(0, 0.5, 0, 0.35, 1.0, 0.35, 'plastic', 0xd8d8d0).cyl(0, 1.2, 0, 0.14, 0.42, 'glass', 0x6aa0d0, null, 10).col(0, 0.6, 0, 0.36, 1.2, 0.36, 'plastic');
  for (const [x, z] of [[85.6, 33.8], [103.2, 23.8]]) { P.planter(L, x, y, z, 0.35); deadPlant(L, x, y + 0.45, z, 2.4); }
  for (const [x, z, f] of [[88, 21.5, 0.3], [93, 21.5, 0.7], [88, 27.5, 0.2], [93, 28, 0], [98.5, 30, 0.5]]) ceilingLight(L, x, ceil, z, { type: 'fluoro', intensity: 8, flicker: f, on: !(x === 93 && z === 28) });
  P.papers(L, 91, y + 0.01, 24, 4, 26);
  P.papers(L, 97, y + 0.01, 31, 3, 18);
  bloodTrail(L, 86, 22, 96, 32.8, y, 9);
  P.corpse(L, 96.3, y + 0.01, 24.2, 0.7, 0x2a2a3a);
  L.decal(96.3, y + 0.012, 24.2, 0, 1, 0, 1.8, DF.POOL);
  L.item('ammo', 102.6, y + 1.08, 29, { chance: 0.7 });
  L.item('health', 88.5, y + 0.78, 20.2, { chance: 0.5 });
  L.item('throwable', 93.3, y + 0.78, 25.9, { chance: 0.5 });
  graffiti(L, 'WINDOW\nWEST END →', 99.6, y + 1.7, pz - 0.09, Math.PI, 1.5, 0.8, '#b8201a');
  // ---------------- lounge / reception (z 34.5..43.7) along the curtain wall
  L.box(DX0 + t, y - 0.005, pz, DX1 - t, y + 0.012, ZS - t, 'woodFloor', { collide: false, tint: 0x8a7a6a });
  P.receptionDesk(L, 91, y, 35.5, Math.PI, 3.6);
  for (const [x, z, r] of [[99.5, 41.6, Math.PI], [101.8, 39.6, -Math.PI / 2]]) P.sofa(L, x, y, z, r, 0x2a3a4a);
  P.table(L, 99.8, y, 39.7, 0, 1.0, 0.6, 'woodDark');
  P.rug(L, 99.8, y + 0.013, 39.8, 3, 2.4, 0x2a3a5a);
  for (const [x, z] of [[81, 36], [103.2, 42.8], [89, 43.1]]) { P.planter(L, x, y, z, 0.4); deadPlant(L, x, y + 0.5, z, 2.6); }
  sign(L, 'STERLING MUTUAL', 91, y + 2.3, 34.6, 0, 2.6, 0.45, { bg: '#1a2a3a', fg: '#d8c890', font: 'Georgia, serif' });
  ceilingLight(L, 88, ceil, 39.5, { type: 'fluoro', intensity: 7, flicker: 0.5 });
  ceilingLight(L, 99, ceil, 39, { type: 'fluoro', intensity: 6, flicker: 0.1 });
  P.corpse(L, 88.3, y + 0.01, 42.2, 2.8, 0x6a6a70);
  L.decal(88.3, y + 0.012, 42.2, 0, 1, 0, 1.6, DF.POOL);
  bloodTrail(L, 88.5, 41.8, DWIN[0] + 0.5, 43.3, y, 4);
  P.chair(L, 87.5, y, 36.4, 0.4, 'metalDark', true);
  for (const [x, z, r] of [[93.5, 42.6, 0], [96, 42.6, 0]]) { P.sofa(L, x, y, z, r + Math.PI, 0x5a2a2a); }
  P.table(L, 94.8, y, 41.3, 0, 1.2, 0.6, 'woodDark');
  L.reverb(DX0, y, ZN, DX1, ceil, ZS, 'room');
  L.ambience(DX0, y, ZN, DX1, ceil, ZS, 'apartments');
  S.officeTrigger = [85.2, y - 0.2, 16.3, 103.7, y + 3, 34.4];
  S.loungeTrigger = [85, y - 0.2, 34.6, 103.7, y + 3, 43.7];
  S.officeHordeNodes = [[88.5, y, 22.4], [93, y, 28.2], [86.4, y, 31], [99, y, 17.5], [102, y, 25]];
}

function cubiclePod(L, x, y, z) {
  // four desks around a cross of fabric partitions
  const p = P.prop(L, x, y, z, 0);
  p.box(0, 0.65, 0, 3.4, 1.3, 0.06, 'fabric', 0x5a6470).box(0, 0.65, 0, 0.06, 1.3, 2.6, 'fabric', 0x5a6470);
  p.col(0, 0.65, 0, 3.4, 1.3, 0.1, 'fabric').col(0, 0.65, 0, 0.1, 1.3, 2.6, 'fabric');
  for (const [sx, sz] of [[-0.85, -0.65], [0.85, -0.65], [-0.85, 0.65], [0.85, 0.65]]) {
    const ry = sz < 0 ? 0 : Math.PI;
    const d = P.prop(L, x + sx, y, z + sz * 0.95, ry);
    d.box(0, 0.74, -0.05, 1.5, 0.04, 0.7, 'woodPale', 0xa89878).box(-0.7, 0.37, -0.05, 0.04, 0.72, 0.66, 'woodPale', 0x8a7a64);
    d.box(0.2, 0.96, 0.15, 0.48, 0.34, 0.04, 'plastic', 0x2a2a2a).box(0.2, 0.96, 0.128, 0.42, 0.28, 0.01, rng() < 0.12 ? 'emissiveCool' : 'glassDirty', 0x151a20);
    d.box(0.15, 0.765, -0.2, 0.45, 0.02, 0.16, 'plastic', 0x3a3a3a);
    d.col(0, 0.38, -0.05, 1.5, 0.76, 0.7, 'wood', F_SOLID | F_SHOOT);
    if (rng() < 0.5) { const [ox, oz] = rot(x + sx, z + sz * 0.95, ry, 0.1, -0.7); P.officeChair(L, ox, y, oz, ry + (rng() - 0.5) * 1.5); }
    if (rng() < 0.4) P.papers(L, x + sx, y + 0.78, z + sz * 0.95, 0.4, 4);
  }
}

export function buildBlock(L, game, S) {
  buildB(L, game, S);
  buildFireEscape(L, game, S);
  buildC(L, game, S);
  buildD(L, game, S);
}
