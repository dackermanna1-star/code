// Chapter 2: substation maintenance rooms + SUBSTATION 7 generator hall and its
// crescendo (diesel generator -> alarm -> rolling gate rises ~70 s while hordes
// pour in from the upper catwalk rooms, a hole under the locker room and the
// maintenance corridor).
import * as THREE from 'three';
import { ceilingLight, supplies, fireSource, physProp, usable, floorWithHoles, textTexture, P, railSegment } from './kit.js';
import { Door, MovingPlatform } from '../world/dynamic.js';
import { F_SOLID, F_SHOOT } from '../world/collision.js';
import { materials } from '../render/materials.js';
import { DF } from '../render/decals.js';
import { poster, lockers, sparker, shelving, transformer, dieselGen, railing, crt, rng, sgn, graf } from './ch2_parts.js';

// hall extents
const HX0 = 146, HX1 = 182, HZ0 = 40, HZ1 = 72;
const GATE_Z0 = 52, GATE_Z1 = 58, GATE_H = 4.5, GATE_RISE = 4.3, GATE_TIME = 70;

export function buildPowerStation(L, game, Y) {
  const { TY, CW } = Y;
  buildMaintenance(L, game, TY);
  buildHall(L, game, TY, CW);
}

// =============================================================== MAINTENANCE
function buildMaintenance(L, game, TY) {
  const wm = 'plasterDirty', H = 3.0;
  L.box(151.6, TY - 0.4, 20.6, 175.4, TY, 39.6, 'concreteFloor');
  L.box(151.6, TY + H, 20.6, 175.4, TY + H + 0.3, 39.6, 'concrete');
  // corridor walls (x 163.4..167)
  L.wallZ(20.6, 39.6, 163.25, TY, TY + H, wm, 0.3, [{ a: 27.5, b: 28.7, y0: TY, y1: TY + 2.2 }]);
  L.wallZ(20.6, 39.6, 167.15, TY, TY + H, wm, 0.3, [{ a: 25.4, b: 26.6, y0: TY, y1: TY + 2.2 }, { a: 33.8, b: 35.6, y0: TY, y1: TY + 2.3 }]);
  // electrical room E (x 152..163.1, z 24..33)
  L.box(151.6, TY, 23.6, 163.1, TY + H, 24, 'concreteDark');
  L.box(151.6, TY, 33, 163.1, TY + H, 33.4, 'concreteDark');
  L.box(151.6, TY, 24, 152, TY + H, 33, 'concreteDark');
  new Door(L, 163.25, TY, 28.1, 'z', { width: 1.2, open: true, material: 'paintedGreen', hinge: 1 });
  // break room B (x 167.3..175, z 22..30) and storage S (z 30.3..39.6)
  L.box(167.3, TY, 21.6, 175.4, TY + H, 22, wm);
  L.box(175, TY, 22, 175.4, TY + H, 39.6, wm);
  L.box(167.3, TY, 30, 175, TY + H, 30.3, wm);
  new Door(L, 167.15, TY, 26, 'z', { width: 1.2, material: 'paintedWhite', hinge: -1 });
  // --- corridor dressing
  L.box(163.4, TY - 0.02, 20.6, 167, TY + 0.004, 39.6, 'linoleum', { collide: false, tint: 0x8a8a80 });
  P.pipe(L, 163.7, TY + 2.7, 20.8, 163.7, TY + 2.7, 39.4, 0.09, 'rust');
  P.pipe(L, 164.0, TY + 2.8, 20.8, 164.0, TY + 2.8, 39.4, 0.05, 'metalDark');
  ceilingLight(L, 165.2, TY + H, 23.5, { type: 'fluoro', intensity: 8, flicker: 0.5, range: 8 });
  ceilingLight(L, 165.2, TY + H, 31, { type: 'fluoro', on: false });
  ceilingLight(L, 165.2, TY + H, 37.5, { type: 'fluoro', intensity: 7, flicker: 0.8, range: 8 });
  sgn(L, 'SUBSTATION 7\nGENERATOR HALL ↓', 166.98, TY + 2.2, 31, Math.PI / 2, 1.4, 0.45, { bg: '#e8c020', fg: '#101010' });
  sgn(L, 'BREAK ROOM', 166.98, TY + 2.45, 26, Math.PI / 2, 0.8, 0.2, { bg: '#d8d8d0', fg: '#1a1a1a' });
  sgn(L, 'ELECTRICAL\nDANGER 13.8kV', 163.42, TY + 2.5, 28.1, -Math.PI / 2, 0.9, 0.3, { bg: '#e8c020', fg: '#101010' });
  P.corpse(L, 165.6, TY + 0.01, 33, 2.8, 0xb08a2a);
  L.decal(165.6, TY + 0.012, 33, 0, 1, 0, 1.8, DF.POOL);
  for (let z = 34; z < 39.5; z += 1.1) L.decal(165.2 + (rng() - 0.5) * 0.5, TY + 0.013, z, 0, 1, 0, 0.9, DF.SMEAR);
  L.decal(163.42, TY + 1.2, 36, 1, 0, 0, 0.8, DF.HAND, { noRoll: true });
  graf(L, 'GENERATOR\nIS LOUD\nDONT', 166.97, TY + 1.5, 37.2, Math.PI / 2, 1.5, 0.75, '#b8201a');
  L.reverb(163.4, TY, 20.6, 167, TY + H, 39.6, 'room');
  // --- electrical room: switchgear, transformers, a shorting panel
  for (let z = 24.7; z < 32.5; z += 1.25) P.electricPanel(L, 152.22, TY, z, -Math.PI / 2, rng() < 0.6);
  transformer(L, 157.2, TY, 26.4, 0, 2.2, 1.4, 2.0);
  transformer(L, 157.2, TY, 31.0, Math.PI, 2.2, 1.4, 2.0);
  P.electricPanel(L, 160.5, TY, 24.22, Math.PI, true);
  sparker(L, 160.5, TY + 1.7, 24.5, { nz: 1, hazard: [159.8, TY, 24.2, 161.2, TY + 1, 25.1], dps: 16 });
  P.table(L, 161.8, TY, 31.9, 0, 1.4, 0.7, 'metalDark');
  L.item('ammo', 161.6, TY + 0.78, 31.9, { chance: 0.85 });
  L.item('tier2', 162.2, TY + 0.78, 32.0, { chance: 0.45 });
  L.item('molotov', 153.8, TY + 0.02, 32.3, { chance: 0.4 });
  ceilingLight(L, 157.5, TY + H, 28.7, { type: 'fluoro', intensity: 9, flicker: 0.6, range: 9 });
  poster(L, 'DANGER\nHIGH VOLTAGE\nAUTHORIZED ONLY', 157.5, TY + 2.0, 32.98, 0, 1.2, 0.8, { bg: '#e8c020', fg: '#101010' });
  P.corpse(L, 155, TY + 0.01, 28.6, 0.6, 0x3a3a52);
  L.decal(155, TY + 0.012, 28.6, 0, 1, 0, 1.2, DF.SCORCH);
  L.reverb(152, TY, 24, 163.1, TY + H, 33, 'room');
  // --- break room (dark; lamp glow) — a Witch likes it here
  lockers(L, 174.72, TY, 25.5, Math.PI / 2, 5, 0x6a5a4a, 1);
  P.table(L, 170.5, TY, 26.5, 0.1, 1.6, 0.9, 'woodPale');
  P.chair(L, 169.6, TY, 25.8, 0.4);
  P.chair(L, 171.5, TY, 27.4, 2.8, 'woodDark', true);
  P.counter(L, 171.2, TY, 22.35, Math.PI, 2.4);
  P.fridge(L, 173.6, TY, 22.45, Math.PI);
  P.sofa(L, 170.8, TY, 29.45, 0, 0x4a3a2a);
  crt(L, 170.4, TY + 0.92, 22.4, Math.PI, 0.9, true);
  L.light(170.4, TY + 1.3, 23.2, 0x8aa0ff, 2.5, 4, { flicker: 0.6 });
  L.item('health', 170.2, TY + 0.8, 26.4, { chance: 0.7 });
  L.item('pills', 171.6, TY + 0.95, 22.3, { chance: 0.5 });
  L.item('pipebomb', 174.2, TY + 0.02, 29.2, { chance: 0.4 });
  poster(L, 'SAFETY FIRST\n212 DAYS WITHOUT\nAN ACCIDENT', 172.5, TY + 1.8, 29.98, 0, 1.3, 0.8, { bg: '#1a4a2a', fg: '#e8e8d8' });
  L.reverb(167.3, TY, 22, 175, TY + H, 30, 'room');
  L.witchSpots.push({ x: 171.6, y: TY, z: 24.2 });
  // --- storage / pump room
  P.pumpMachine(L, 171, TY, 37.6, 0);
  shelving(L, 174.7, TY, 33.5, Math.PI / 2, 2.2);
  shelving(L, 168.2, TY, 30.6, Math.PI, 1.6);
  P.pallet(L, 172.4, TY, 31.3, 0.2);
  physProp(L, 'propane', 168.2, TY, 38.8);
  physProp(L, 'propane', 168.8, TY, 39.0);
  physProp(L, 'gascan', 173.8, TY, 35.8);
  P.barrel(L, 174.3, TY, 38.9, 0x6a2a1a);
  L.item('throwable', 172.2, TY + 0.02, 34.2, { chance: 0.6 });
  L.item('health', 174.7, TY + 1.95, 33.2, { chance: 0.3 });
  ceilingLight(L, 171, TY + H, 34.5, { type: 'cage', intensity: 6, flicker: 0.4, range: 7 });
  L.reverb(167.3, TY, 30.3, 175, TY + H, 39.6, 'room');
  L.ambience(151.6, TY - 1, 20.6, 175.4, TY + H, 39.6, 'subway');
  L.trigger(163.4, TY - 0.5, 20.6, 167, TY + 3, 23, () => { game.infected.outfit = 'worker'; }, { once: false });
}

// ================================================================ HALL
function buildHall(L, game, TY, CW) {
  const cm = 'concrete';
  L.box(HX0, TY - 0.4, HZ0, HX1, TY, HZ1, 'concreteFloor');
  L.wallX(HX0 - 0.4, HX1 + 0.4, HZ0 - 0.2, TY - 0.4, 3.8, cm, 0.4, [
    { a: 163.8, b: 166.6, y0: TY, y1: TY + 2.6 }, { a: 151.6, b: 153.2, y0: CW, y1: CW + 2.2 }, { a: 154.2, b: 157.6, y0: CW + 1.0, y1: CW + 2.1 },
  ]);
  L.wallX(HX0 - 0.4, HX1 + 0.4, HZ1 + 0.2, TY - 0.4, 3.8, cm, 0.4, [
    { a: 164.2, b: 165.8, y0: TY, y1: TY + 2.3 }, { a: 150.2, b: 151.8, y0: CW, y1: CW + 2.2 },
  ]);
  L.wallZ(HZ0, HZ1, HX0 - 0.2, TY - 0.4, 3.8, cm, 0.4);
  L.wallZ(HZ0, HZ1, HX1 + 0.2, TY - 0.4, 3.8, cm, 0.4, [{ a: GATE_Z0, b: GATE_Z1, y0: TY, y1: TY + GATE_H }]);
  L.box(HX0 - 0.4, 3.8, HZ0 - 0.4, HX1 + 0.4, 4.2, HZ1 + 0.4, cm);
  for (let x = 150; x < HX1; x += 6) L.box(x - 0.15, 3.2, HZ0, x + 0.15, 3.8, HZ1, 'metalDark', { collide: false });
  // painted wall band + stencils
  L.box(HX0, TY + 1.2, HZ0 + 0.01, HX0 + 0.01, TY + 1.5, HZ1 - 0.01, 'paintedYellow', { collide: false, tint: 0xb89a2a });
  sgn(L, 'SUBSTATION 7', HX0 + 0.02, TY + 3.3, 56, -Math.PI / 2, 7, 1.2, { fg: '#d8d0b0', font: 'Impact, Arial Black, sans-serif' });
  sgn(L, 'FAIRVIEW TRANSIT AUTHORITY · TRACTION POWER', 164, CW + 2.9, HZ1 - 0.02, 0, 9, 0.5, { fg: '#c8c0a0' });
  // ---- catwalks (upper level)
  const cwf = 'diamond';
  L.box(HX0, CW - 0.12, HZ0, HX1, CW, 42.4, cwf);
  L.box(HX0, CW - 0.12, 42.4, 148.4, CW, 69.6, cwf);
  L.box(HX0, CW - 0.12, 69.6, HX1, CW, HZ1, cwf);
  L.box(148.4, CW - 0.4, 42.25, HX1, CW - 0.12, 42.4, 'metalDark');
  L.box(148.25, CW - 0.4, 42.4, 148.4, CW - 0.12, 69.6, 'metalDark');
  L.box(148.4, CW - 0.4, 69.6, HX1, CW - 0.12, 69.75, 'metalDark');
  for (const x of [152, 158, 164, 176]) L.box(x - 0.1, TY, 42.2, x + 0.1, CW - 0.12, 42.4, 'metalDark');
  for (const z of [48, 54, 60, 66]) L.box(148.2, TY, z - 0.1, 148.4, CW - 0.12, z + 0.1, 'metalDark');
  for (const x of [160, 166, 172, 178]) L.box(x - 0.1, TY, 69.6, x + 0.1, CW - 0.12, 69.8, 'metalDark');
  railing(L, 'x', 148.4, 179, 42.35, CW, [[150.2, 151.8], [160.6, 162.2]]);
  railing(L, 'z', 42.4, 67.8, 148.35, CW, [[57.2, 58.8]]);
  railing(L, 'x', 148.4, 149.4, 67.75, CW);
  railing(L, 'x', 149.4, HX1, 69.65, CW, [[168.2, 169.8]]);
  railing(L, 'x', 179, HX1, 44.25, CW);
  // stairs up to the catwalks
  L.stairs(170, 42.4, 179, 44.2, TY, CW, '+x', cwf, { thin: true });
  L.box(179, CW - 0.12, 42.4, HX1, CW, 44.2, cwf);
  L.box(181.6, TY, 43.9, 181.8, CW - 0.12, 44.1, 'metalDark');
  railSegment(L, 170, TY + 1.0, 44.25, 179, CW + 1.0, 44.25);
  L.stairs(149.4, 67.8, 158.4, 69.6, TY, CW, '-x', cwf, { thin: true });
  L.box(148.4, CW - 0.12, 67.8, 149.4, CW, 69.6, cwf);
  railSegment(L, 158.4, TY + 1.0, 67.75, 149.4, CW + 1.0, 67.75);

  // ---- upper control room (spawn source): x 148..158, z 33.4..39.6
  L.box(147.6, CW - 0.3, 33, 158.4, CW, 39.6, 'linoleum');
  L.box(147.6, CW, 33, 148, CW + 2.8, 39.6, 'plaster');
  L.box(158, CW, 33, 158.4, CW + 2.8, 39.6, 'plaster');
  L.box(148, CW, 33, 158, CW + 2.8, 33.4, 'plaster');
  L.box(147.6, CW + 2.8, 33, 158.4, CW + 3.1, 39.6, 'ceiling');
  for (const x of [154.9, 156.7]) P.desk(L, x, CW, 38.9, Math.PI, true);
  P.officeChair(L, 155.2, CW, 38.0, 2.6);
  P.filingCabinet(L, 148.5, CW, 34.0, -Math.PI / 2);
  P.filingCabinet(L, 148.5, CW, 34.6, -Math.PI / 2);
  poster(L, 'SUBSTATION 7\nTRACTION POWER SCHEMATIC\n━━┳━━┳━━╋━━┳━━', 153, CW + 1.5, 33.42, Math.PI, 3.2, 1.2, { bg: '#dcd8c8', fg: '#1a3a6a' });
  crt(L, 150.5, CW + 0.0, 38.9, Math.PI, 1, true);
  L.light(150.5, CW + 0.6, 38.2, 0x6a8aff, 2, 4, { flicker: 0.7 });
  P.corpse(L, 152.5, CW + 0.01, 36, 1.8, 0x2a2a3a);
  L.decal(152.5, CW + 0.012, 36, 0, 1, 0, 1.4, DF.POOL);
  P.papers(L, 153, CW + 0.01, 36, 3, 10);
  L.reverb(148, CW, 33.4, 158, CW + 2.8, 39.6, 'room');
  // ---- upper vent corridor behind the south wall (spawn source)
  L.box(148.6, CW - 0.3, 72.4, 153.4, CW, 82.4, 'concreteDark');
  L.box(148.6, CW, 72.4, 149, CW + 2.4, 82.4, 'concreteDark');
  L.box(153, CW, 72.4, 153.4, CW + 2.4, 82.4, 'concreteDark');
  L.box(149, CW, 82, 153, CW + 2.4, 82.4, 'concreteDark');
  L.box(148.6, CW + 2.4, 72.4, 153.4, CW + 2.7, 82.4, 'concreteDark');
  for (const x of [149.4, 152.6]) P.pipe(L, x, CW + 2.1, 72.6, x, CW + 2.1, 81.8, 0.14, 'metal', 0x7a7a74);
  L.box(149.4, CW + 1.0, 81.95, 152.6, CW + 2.1, 82.0, 'blackMatte', { collide: false });
  P.debris(L, 151, CW, 80.5, 0.8, 'metalDark', 6);
  graf(L, 'THEY COME\nOUT OF\nTHE WALLS', 152.97, CW + 1.2, 76, Math.PI / 2, 1.6, 0.9, '#b8201a');

  // ---- locker room with a hole in the floor (spawn source below)
  const LY = TY;
  L.box(159.2, LY - 0.3, 72.4, 159.6, LY + 3.0, 80.4, 'tileWhite');
  L.box(170, LY - 0.3, 72.4, 170.4, LY + 3.0, 80.4, 'tileWhite');
  L.box(159.6, LY - 0.3, 80, 170, LY + 3.0, 80.4, 'tileWhite');
  L.box(159.2, LY + 3.0, 72.4, 170.4, LY + 3.3, 80.4, 'ceiling');
  const hole = [165.5, 76, 168.5, 80];
  floorWithHoles(L, 159.6, 72.4, 170, 80, LY, 0.3, 'tileFloor', [hole]);
  L.stairs(hole[0], hole[1], hole[2], hole[3], LY - 2.6, LY, '-z', 'concreteDark', { stepH: 0.43 });
  // broken slab edges & rebar around the hole
  for (const [x, z, r] of [[165.3, 77.5, 0.3], [168.7, 78.6, -0.4], [167, 75.8, 0.1]]) P.prop(L, x, LY + 0.05, z, r).box(0, 0, 0, 0.9, 0.12, 0.6, 'tileFloor', 0x8a867e, [0.3, 0, 0.2]);
  for (let i = 0; i < 5; i++) P.pipe(L, 165.5 + i * 0.7, LY - 0.1, 76.1, 165.2 + i * 0.75, LY + 0.3, 76.6 + (i % 2) * 0.4, 0.012, 'rust');
  P.debris(L, 167, LY - 2.5, 81.5, 1.0, 'concreteDark', 8);
  // crawlspace under the room (dead end, dark)
  L.box(161.6, LY - 3.0, 75.6, 172.4, LY - 2.6, 92.4, 'dirt');
  L.box(161.6, LY - 3.0, 75.6, 162, LY - 0.3, 92.4, 'concreteDark');
  L.box(172, LY - 3.0, 75.6, 172.4, LY - 0.3, 92.4, 'concreteDark');
  L.box(162, LY - 3.0, 75.6, 172, LY - 0.3, 76, 'concreteDark');
  L.box(162, LY - 3.0, 92, 172, LY - 0.3, 92.4, 'concreteDark');
  L.box(161.6, LY - 0.6, 80.4, 172.4, LY - 0.3, 92.4, 'concreteDark');
  for (const z of [83, 87, 91]) P.pipe(L, 162.2, LY - 0.9, z, 171.8, LY - 0.9, z, 0.1, 'rust');
  L.reverb(162, LY - 2.6, 76, 172, LY - 0.3, 92, 'sewer');
  // lockers, benches
  lockers(L, 159.85, LY, 76.2, -Math.PI / 2, 7, 0x3a5a6a, 3);
  lockers(L, 169.75, LY, 74.4, Math.PI / 2, 3, 0x3a5a6a);
  for (const z of [74.2]) { L.box(161.5, LY, z - 0.2, 164.8, LY + 0.45, z + 0.2, 'wood', { tint: 0x8a6a4a }); }
  sgn(L, 'DANGER\nFLOOR UNSAFE', 169.98, LY + 1.6, 78, Math.PI / 2, 0.9, 0.45, { bg: '#e8c020', fg: '#101010' });
  P.corpse(L, 164.6, LY + 0.01, 77.6, 1.2, 0x5a4a2a);
  L.decal(164.8, LY + 0.012, 77.2, 0, 1, 0, 1.8, DF.SMEAR);
  L.item('health', 161.2, LY + 0.47, 74.2, { chance: 0.5 });
  L.item('pills', 163.5, LY + 0.47, 74.2, { chance: 0.4 });
  ceilingLight(L, 162.5, LY + 3.0, 77, { type: 'fluoro', intensity: 6, flicker: 0.85, range: 7 });
  L.reverb(159.6, LY, 72.4, 170, LY + 3, 80, 'room');

  // ---- generators, fuel tank, transformers, cover
  dieselGen(L, 160, TY, 55, 0);
  dieselGen(L, 160, TY, 64.2, Math.PI, { color: 0x5a4a30 });
  L.decal(160, TY + 0.02, 64.2, 0, 1, 0, 6, DF.SCORCH);
  for (const [x, z] of [[157.8, 55.4], [160.4, 55.4], [162.2, 63.8]]) P.pipe(L, x, TY + 3.35, z, x, 3.8, z, 0.13, 'metalDark');
  const ft = P.prop(L, 151.8, TY, 57.5, 0);
  ft.cyl(0, 1.3, 0, 1.05, 4.2, 'paintedGreen', 0x3a4a3a, [0, 0, Math.PI / 2], 18);
  for (const x of [-1.4, 1.4]) ft.box(x, 0.35, 0, 0.3, 0.7, 1.8, 'metalDark');
  ft.col(0, 1.2, 0, 4.2, 2.4, 2.1, 'metal');
  sgn(L, 'DIESEL\nNO SMOKING', 151.8, TY + 1.4, 56.4, 0, 1.4, 0.55, { bg: '#c82a1a', fg: '#fff' });
  transformer(L, 180.6, TY, 46.5, Math.PI / 2, 2.4, 1.6, 2.3);
  transformer(L, 180.6, TY, 65.5, Math.PI / 2, 2.4, 1.6, 2.3);
  for (const x of [171.2, 172.5, 173.8, 175.1]) P.electricPanel(L, x, TY, 71.78, 0, rng() < 0.7);
  for (const [x, z, r] of [[170, 49, 0.2], [174.5, 58.5, 1.2], [155, 47.5, 0.6], [168.5, 66, 2.2], [177, 61, 0.4]]) P.pallet(L, x, TY, z, r);
  for (const [x, z] of [[153.2, 64.5], [175.2, 50.5], [156.4, 44.6]]) P.crate(L, x, TY, z, rng() * 3, 1.2);
  for (const [x, z] of [[171.5, 53], [171.9, 53.8]]) P.barrel(L, x, TY, z, 0x2a3a5a);
  const spool = P.prop(L, 176.8, TY, 67.6, 0.3);
  spool.cyl(0, 0.75, 0, 0.75, 1.1, 'woodDark', 0x7a5a3a, [Math.PI / 2, 0, 0], 16).cyl(0, 0.75, 0, 0.45, 1.12, 'rubber', 0x1a1a1a, [Math.PI / 2, 0, 0], 12).col(0, 0.75, 0, 1.5, 1.5, 1.1, 'wood');
  // supplies before the crescendo
  supplies(L, 147.0, TY, 50.5, Math.PI / 2, [{ type: 'ammo' }, { type: 'health', chance: 0.7 }, { type: 'health', chance: 0.5 }], { w: 2.0, mat: 'metalDark' });
  supplies(L, 147.0, TY, 61.5, Math.PI / 2, [{ type: 'tier2', chance: 0.6 }, { type: 'throwable', chance: 0.6 }, { type: 'throwable', chance: 0.5 }], { w: 2.0, mat: 'metalDark' });
  L.item('melee', 177.5, TY + 0.02, 70.6, { chance: 0.4 });
  physProp(L, 'propane', 163.2, TY, 71.3);
  physProp(L, 'propane', 166.9, TY, 71.3);
  physProp(L, 'propane', 162.6, TY, 40.7);
  physProp(L, 'oxygen', 171.2, TY, 45.2);
  physProp(L, 'oxygen', 150.6, TY, 70.9);
  physProp(L, 'gascan', 153.8, TY, 43.2);
  physProp(L, 'gascan', 176.2, TY, 54.6);
  // story
  P.corpse(L, 168.2, TY + 0.01, 51.2, 0.9, 0xb08a2a);
  L.decal(168.2, TY + 0.012, 51.2, 0, 1, 0, 2, DF.POOL);
  P.corpse(L, 150.5, CW + 0.01, 41.2, 1.6, 0x2a3a4a);
  for (let i = 0; i < 10; i++) L.decal(148 + rng() * 32, TY + 0.012, 42 + rng() * 28, 0, 1, 0, 1 + rng() * 1.5, i % 3 ? DF.BLOOD1 + (i % 4) : DF.SPLAT_BIG);
  for (let i = 0; i < 5; i++) L.decal(152 + rng() * 24, TY + 0.011, 46 + rng() * 22, 0, 1, 0, 2 + rng() * 2, DF.BILE, { alpha: 0.35 });
  graf(L, 'WE TRIED\nTHE GATE', HX1 - 0.03, TY + 1.4, 49.5, Math.PI / 2, 1.8, 0.8, '#d8d8c8');
  L.reverb(HX0, TY, HZ0, HX1, 3.8, HZ1, 'hall');
  L.ambience(HX0 - 0.4, TY - 3.5, 33, HX1 + 0.4, 4.2, 92.4, 'subway');
  // emergency lighting before the power comes back (very dark hall)
  L.light(147.2, CW + 2.1, 56, 0xffa050, 5, 10, { flicker: 0.5 });
  L.box(146.0, CW + 2.0, 55.8, 146.1, CW + 2.2, 56.2, 'emissiveWarm', { collide: false });
  L.light(180.5, TY + 3.2, 55, 0xffa050, 4, 8, { flicker: 0.3 });
  L.box(181.95, TY + 5.8, 54.8, 182.0, TY + 6.0, 55.2, 'emissiveWarm', { collide: false });

  buildGateAndGenerator(L, game, TY, CW);
}

// ======================================================= GATE + GENERATOR EVENT
function gateMesh(L, game, w, h) {
  const tmp = new (L.constructor)(game, {});
  tmp.box(-0.07, 0, -w / 2, 0.07, h, w / 2, 'metal', { tint: 0x8a8e8e });
  for (let y = 0.5; y < h - 0.1; y += 0.24) tmp.box(-0.095, y, -w / 2, 0.095, y + 0.07, w / 2, 'metalClean', { tint: 0x8a9090 });
  tmp.box(-0.12, 0, -w / 2, 0.12, 0.12, w / 2, 'rubber', { tint: 0x1a1a1a });
  for (let i = 0; i < w / 0.5 - 0.01; i++) {
    const z = -w / 2 + i * 0.5;
    tmp.box(-0.11, 0.12, z, 0.11, 0.45, z + 0.25, 'paintedYellow', { tint: 0xd8b020 });
    tmp.box(-0.11, 0.12, z + 0.25, 0.11, 0.45, z + 0.5, 'blackMatte');
  }
  const grp = new THREE.Group();
  for (const b of tmp.buckets.values()) {
    const mesh = new THREE.Mesh(b.toGeometry(), materials.get(b.mat));
    mesh.castShadow = true; mesh.receiveShadow = true;
    grp.add(mesh);
  }
  for (const s of [-1, 1]) {
    const tex = textTexture('DANGER\nAUTOMATIC GATE', { bg: '#d8b020', fg: '#101010', border: '#101010' });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(s * 0.1, 1.9, 0);
    m.rotation.y = s * Math.PI / 2;
    grp.add(m);
  }
  return grp;
}

function buildGateAndGenerator(L, game, TY, CW) {
  const gx = HX1 + 0.2, gz = (GATE_Z0 + GATE_Z1) / 2;
  // frame: striped jambs, guide channels, drum housing, beacons
  for (const z of [GATE_Z0 - 0.4, GATE_Z1]) {
    L.box(HX1 - 0.12, TY, z, HX1, TY + GATE_H + 0.3, z + 0.4, 'paintedYellow', { tint: 0xc8a020 });
    for (let y = TY + 0.2; y < TY + GATE_H; y += 0.6) L.box(HX1 - 0.13, y, z, HX1 - 0.12, y + 0.3, z + 0.4, 'blackMatte', { collide: false });
  }
  for (const z of [GATE_Z0, GATE_Z1 - 0.06]) L.box(HX1 + 0.02, TY, z, HX1 + 0.38, TY + GATE_H, z + 0.06, 'metalDark', { collide: false });
  L.box(HX1 - 0.7, TY + GATE_H, GATE_Z0 - 0.5, HX1, TY + GATE_H + 0.9, GATE_Z1 + 0.5, 'metalDark');
  L.box(HX1 - 0.72, TY + GATE_H + 0.3, GATE_Z0 - 0.3, HX1 - 0.7, TY + GATE_H + 0.6, GATE_Z1 + 0.3, 'paintedYellow', { collide: false, tint: 0xc8a020 });
  const beacons = [];
  for (const [x, y, z, lit] of [[HX1 - 0.35, TY + GATE_H + 1.05, GATE_Z0 - 0.2, 1], [HX1 - 0.35, TY + GATE_H + 1.05, GATE_Z1 + 0.2, 1], [HX0 + 0.3, CW + 2.6, 50, 0], [HX0 + 0.3, CW + 2.6, 62, 1], [164, CW + 2.6, HZ0 + 0.3, 1]]) {
    L.box(x - 0.1, y - 0.15, z - 0.1, x + 0.1, y + 0.1, z + 0.1, 'plastic', { collide: false, tint: 0x6a1a14 });
    if (lit) beacons.push(L.light(x - (x > 170 ? 0.4 : -0.4), y, z, 0xff2010, 0, 14, { on: false }));
  }
  // the gate itself: a moving slab that rises into the wall
  const grp = gateMesh(L, game, GATE_Z1 - GATE_Z0 + 0.1, GATE_H);
  grp.position.set(gx, TY, gz);
  let gap = 0;
  const gatePos = new THREE.Vector3(HX1 - 0.5, TY + 2.5, gz);
  const gate = new MovingPlatform(L, grp, [gx - 0.13, TY, GATE_Z0 - 0.05], [gx + 0.13, TY + GATE_H, GATE_Z1 + 0.05], {
    to: [0, GATE_RISE, 0], duration: GATE_TIME,
    onUpdate: (k) => { gap = k * GATE_RISE; },
    onArrive: () => ev.opened(),
  });
  // Infected ignore dynamic colliders (they move on the nav grid), so a hidden,
  // locked "door" marks the gate nodes as blocked until the gate is high enough.
  const blocker = new Door(L, gx, TY, gz, 'z', { width: GATE_Z1 - GATE_Z0, height: GATE_H, safe: true, locked: true });
  blocker.mesh.visible = false;
  blocker.usable.enabled = false;
  blocker.collider.enabled = false;
  blocker.blocksInfected = () => gap < 1.9;
  blocker.use = () => {};
  // Survivors (and bots running on progress navigation) may not slip under the half-open
  // gate: a movement-only blocker holds until the gate is fully up.
  const hold = L.col.addDynamic([gx - 0.2, TY, GATE_Z0 - 0.05], [gx + 0.2, TY + GATE_H, GATE_Z1 + 0.05], { flags: F_SOLID });

  // work lights (off until the generator runs)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffb060, emissiveIntensity: 0 });
  const work = [];
  for (const x of [153, 165, 177]) for (const z of [47.5, 64.5]) {
    L.box(x - 0.02, -0.15, z - 0.02, x + 0.02, 3.2, z + 0.02, 'metalDark', { collide: false });
    L.box(x - 0.35, -0.3, z - 0.35, x + 0.35, -0.15, z + 0.35, 'metalDark', { collide: false });
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 0.56), lampMat);
    lens.position.set(x, -0.32, z);
    L.addObject(lens);
    work.push({ light: L.light(x, -0.6, z, 0xffb060, 26, 20, { on: false, flicker: 0.05 }), pos: new THREE.Vector3(x, -0.4, z) });
  }

  // generator control console (usable)
  const cx = 165.4, cz = 51.3;
  const con = P.prop(L, cx, TY, cz, 0);
  con.box(0, 1.05, 0, 1.8, 2.1, 0.7, 'paintedGreen', 0x4a5a4a).col(0, 1.05, 0, 1.8, 2.1, 0.7, 'metal');
  con.box(0, 1.35, -0.36, 1.5, 0.6, 0.03, 'metalDark');
  for (let i = 0; i < 5; i++) con.box(-0.55 + i * 0.27, 1.5, -0.38, 0.08, 0.08, 0.02, i === 0 ? 'emissiveRed' : 'blackMatte');
  con.box(0.45, 1.0, -0.42, 0.12, 0.35, 0.1, 'paintedRed', 0xb02010, [0.4, 0, 0]);
  con.box(-0.35, 1.05, -0.37, 0.5, 0.25, 0.02, 'glassDirty', 0x203020);
  sgn(L, 'GENERATOR 1\nSTART / GATE POWER', cx, TY + 1.86, cz - 0.37, 0, 1.3, 0.3, { bg: '#1a1a1a', fg: '#e8c020' });
  P.pipe(L, cx, TY + 0.05, cz + 0.35, 163.6, TY + 0.05, 54.2, 0.05, 'rubber', 0x1a1a1a);
  P.pipe(L, cx + 0.8, TY + 0.05, cz, HX1 - 0.3, TY + 0.05, GATE_Z0 - 0.5, 0.05, 'rubber', 0x1a1a1a);
  graf(L, 'LOUD!!', cx + 0.92, TY + 1.4, cz, -Math.PI / 2, 0.6, 0.3, '#e8e8d8');

  const genPos = new THREE.Vector3(160, TY + 1.5, 55);
  const ev = {
    started: false, open: false, alarmOn: false, t: 0, alarm: null, gen: null, gateSndT: 0,
    nodes: null,
    spawnNodes() {
      if (this.nodes) return this.nodes;
      const nav = game.level.nav;
      const pick = (pts) => pts.map(([x, y, z]) => nav.nearestNode(x, y, z, 2)).filter((n) => n >= 0);
      this.nodes = {
        upper: pick([[150.5, CW, 35.2], [155.5, CW, 35.6], [151, CW, 79.5], [151, CW, 81.3]]),
        hole: pick([[167, TY - 2.6, 88], [164, TY - 2.6, 90.5], [170.5, TY - 2.6, 86], [166, TY - 2.6, 83.5]]),
        door: pick([[165.2, TY, 23.2], [156, TY, 28.5], [165.2, TY, 30], [171, TY, 33.5]]),
      };
      return this.nodes;
    },
    waveNodes(i) {
      const n = this.spawnNodes();
      const sets = [[...n.door, ...n.upper], [...n.hole, ...n.upper], [...n.door, ...n.hole], [...n.door, ...n.hole, ...n.upper]];
      const s = sets[Math.min(i, sets.length - 1)];
      return s.length ? s : null;
    },
    start(s) {
      if (this.started) return;
      this.started = true;
      const who = s?.char?.id || 'louis';
      game.audio.play('metalImpact', { pos: genPos, vol: 1 });
      game.audio.play('explosion', { pos: genPos, vol: 0.25 });
      this.gen = game.audio.loop('generator', { pos: genPos, vol: 0.3 });
      game.fx.smokeColumn(157.8, 3.6, 55.4, 1.2, [0.1, 0.1, 0.1]);
      game.shake?.(0.25);
      work.forEach((w, i) => L.after(1.2 + i * 0.4, () => { w.light.on = true; game.audio.play('buttonPress', { pos: w.pos, vol: 0.7 }); lampMat.emissiveIntensity = 2.6; }));
      L.after(2.8, () => {
        this.alarm = game.audio.loop('alarm', { pos: gatePos, vol: 1 });
        this.alarmOn = true;
        game.audio.play('metalGate', { pos: gatePos, vol: 1.3 });
        gate.start();
      });
      game.session.objective('Hold out until the gate opens');
      game.voice.script([
        { who, text: 'Okay, it\'s running! Here comes the noise...', d: 0.3 },
        { who: who === 'bill' ? 'zoey' : 'bill', text: 'Find cover! Watch the catwalks!', d: 3.4 },
      ]);
      L.after(3.5, () => {
        game.director.blockWanderers = true;
        game.director.panic('generator', {
          waves: 4, size: [16, 22], interval: 17, nodes: this.waveNodes(0), minD: 12, maxD: 70,
          onWave: (i) => { const p = game.director.panicState; if (p && p.name === 'generator') p.nodes = this.waveNodes(i); },
        });
      });
      L.after(22, () => game.voice.script([{ who: 'francis', text: 'There\'s something coming up out of that hole!', d: 0 }]));
    },
    opened() {
      this.open = true;
      hold.enabled = false;
      this.alarm?.stop(2.5);
      this.alarm = null;
      this.alarmOn = false;
      game.audio.play('metalGate', { pos: gatePos, vol: 1.4 });
      game.session.objective('Get through the gate');
      game.voice.script([{ who: 'zoey', text: 'Gate\'s open! Move, move!', d: 0.2 }, { who: 'louis', text: 'Up the stairs, go!', d: 2.2 }]);
      const p = game.director.panicState;
      if (p && p.name === 'generator') game.director.stopPanic();
      L.after(20, () => { game.director.blockWanderers = false; });
      if (this.gen) this.gen.set({ vol: 0.8 });
    },
    update(dt) {
      if (!this.started) return;
      this.t += dt;
      if (this.gen && this.t < 4) this.gen.set({ vol: 0.3 + this.t * 0.15 });
      const on = this.alarmOn;
      beacons.forEach((b, i) => {
        if (!on) { b.on = false; return; }
        const k = Math.max(0, Math.sin(this.t * 7 + i * 1.3));
        b.intensity = 14 * k * k;
        b.on = b.intensity > 0.5;
      });
      if (gate.moving) {
        this.gateSndT -= dt;
        if (this.gateSndT <= 0) { this.gateSndT = 5 + Math.random() * 3; game.audio.play('metalGate', { pos: gatePos, vol: 0.9 }); }
      }
    },
  };
  L.dynamics.push(ev);
  const u = usable(L, cx, TY + 1.25, cz - 0.45, 'Start the generator', (s) => ev.start(s), { hold: 2.5, holdLabel: 'Starting generator...', radius: 2.0 });
  L.ch2Generator = { ev, usable: u, gate, blocker, hold };

  // triggers: discovering the closed gate & the console
  L.trigger(163.4, TY - 0.5, HZ0, 167, TY + 3, HZ0 + 3, () => {
    if (ev.started) return;
    game.session.objective('Find a way to open the gate');
    game.voice.script([{ who: 'bill', text: 'That\'s a big gate. Has to be a way to open it.', d: 0.4 }]);
  });
  L.trigger(160, TY - 0.5, 45, 172, TY + 3, 52, () => {
    if (ev.started) return;
    game.voice.script('ch2Generator');
    L.after(1.5, () => { if (!ev.started) game.session.objective('Start the generator to open the gate'); });
  });
}
