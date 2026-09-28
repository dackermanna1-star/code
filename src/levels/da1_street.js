// Dead Air 1 — Harbor Street and the Harborview Hotel: the semi-trailer under
// the office window, wrecks and a quarantine roadblock, the hotel's loading
// dock (service entrance), service corridor, and the kitchen safe room (end;
// chapter 2 starts in this kitchen). Also the backdrop blocks around the route.
import * as THREE from 'three';
import { ceilingLight, sign, graffiti, safeRoom, supplies, fireSource, burningBarrel, physProp, alarmCar, hittable, P, street, railSegment } from './kit.js';
import { Door } from '../world/dynamic.js';
import { F_SOLID, F_SHOOT } from '../world/collision.js';
import { DF } from '../render/decals.js';
import { VisualBatch, neonSign, billboard, adTexture, ADS, parapet } from './da_parts.js';
import { grill as cookLine, hood, prepTable } from './ch3_props.js';
import { YA, YC, ZS, ZN, HY, rng, windowGrid, deadPlant, bloodTrail, scatterBlood } from './da1_common.js';

const NC = { collide: false };
const ZH = 64; // hotel facade (south side of the street)
export const KITCHEN = { x0: 96, z0: 78, x1: 106, z1: 90 };

// ============================================================ HARBOR STREET
function buildStreet(L, game, S) {
  street(L, 62, ZS, 132, ZH, 'x', { sidewalk: 3 });
  // west + east continuation (visual only; the ends are blocked)
  const vis = (x0, x1) => {
    L.box(x0, -0.5, ZS, x1, 0, ZH, 'asphalt', NC);
    L.box(x0, 0, ZS, x1, 0.15, ZS + 3, 'sidewalk', NC);
    L.box(x0, 0, ZH - 3, x1, 0.15, ZH, 'sidewalk', NC);
    for (let x = x0 + 1; x < x1 - 2; x += 4.5) L.box(x, 0.003, 53.93, x + 2.5, 0.012, 54.07, 'paintedYellow', { collide: false, tint: 0xd0b030 });
  };
  vis(-60, 62);
  vis(132, 200);
  // ---------------------------------------------------- the semi against D
  const tx = 92.7, tz = ZS + 1.275;
  if (P.semi) P.semi(L, tx, 0.15, tz, -Math.PI / 2, { color: 0x7a1a14, trailerColor: 0xd8d8d0, trailerLen: 12 });
  else {
    L.box(tx - 14.2, 1.2, ZS, tx - 2.2, 3.9, ZS + 2.55, 'paintedWhite', { tint: 0xd8d8d0 });
    L.box(tx - 14.2, 0.15, ZS + 0.1, tx - 2.2, 1.2, ZS + 2.45, 'metalDark', { flags: F_SOLID | F_SHOOT });
    L.box(tx - 2, 0.15, ZS, tx + 2.5, 3.2, ZS + 2.5, 'carPaint', { tint: 0x7a1a14 });
  }
  // trailer livery (street side) + a smashed street lamp under the cab
  sign(L, 'NEWBURG FREIGHT', tx - 8.2, 2.9, ZS + 2.58, 0, 7, 1.0, { bg: '#d8d8d0', fg: '#1a3a7a', font: 'Arial Black, Impact, sans-serif' });
  sign(L, 'Across the city · Across the country', tx - 8.2, 2.1, ZS + 2.58, 0, 6, 0.35, { bg: '#d8d8d0', fg: '#b01e28', font: 'Georgia, serif', weight: 'italic bold' });
  P.prop(L, 97.9, 0.15, 45.6, 0).box(0, 0.2, 0, 0.3, 0.4, 0.3, 'concrete').box(0.8, 1.6, 0.4, 0.14, 3.2, 0.14, 'metalDark', null, [0.6, 0, 0.9]);
  fireSource(L, tx + 2.4, 1.2, tz, 0.6, { hazard: false, intensity: 10 });
  S.truckTrigger = [78, 3, ZS - 0.1, 91, 6, ZS + 2.7];
  // helper car beside the trailer (a step down)
  P.van(L, 83.6, 0, 48.6, Math.PI / 2 + 0.06, 0xc8c4b8);
  // ---------------------------------------------------- wrecks and life's debris
  P.car(L, 73.5, 0, 50.8, 0.35, { burnt: true });
  fireSource(L, 73.5, 0.9, 50.8, 0.8, { hazard: false });
  alarmCar(L, 80.5, 0, 57.6, Math.PI / 2 - 0.15, 0x2a4a7a);
  P.car(L, 114, 0, 51.2, -Math.PI / 2 + 0.3, { taxi: true, color: 0xd8b020 });
  P.car(L, 119, 0, 58.6, Math.PI / 2, { police: true });
  hittable(L, 'car', 102, 0, 57.2, Math.PI / 2 + 0.2, { color: 0x6a6a68 });
  P.car(L, 125.5, 0, 48.3, 0.2, { color: 0x3a1a2a });
  if (P.ambulance) P.ambulance(L, 70.5, 0.15, 60.2, Math.PI / 2 - 0.1, { doorsOpen: true });
  // police lights
  const pl = [L.light(119, 1.9, 57.5, 0xff2020, 6, 9, { priority: 0.5 }), L.light(119, 1.9, 59.7, 0x2040ff, 6, 9, { priority: 0.5 })];
  L.dynamics.push({ t: 0, update(dt) { this.t += dt; const k = Math.floor(this.t * 3) % 2; pl[0].on = k === 0; pl[1].on = k === 1; } });
  // luggage: everyone was heading for the airport
  for (let i = 0; i < 9; i++) {
    const x = 78 + rng() * 44, z = 47.5 + rng() * 13;
    const lp = P.prop(L, x, 0.15 * (z < 47 || z > 61 ? 1 : 0), z, rng() * 6);
    const w = 0.4 + rng() * 0.25;
    lp.box(0, 0.12, 0, w, 0.24, 0.6 + rng() * 0.2, 'fabric', rng.pick([0x1a1a2a, 0x7a1a14, 0x2a4a3a, 0x5a4a3a, 0x3a3a48]), [rng() < 0.4 ? 1.57 : 0, 0, 0]);
  }
  P.papers(L, 96, 0.01, 53, 12, 40);
  P.papers(L, 118, 0.01, 55, 8, 24);
  for (let i = 0; i < 10; i++) L.decal(66 + rng() * 64, 0.013, 46 + rng() * 16, 0, 1, 0, 0.8 + rng() * 1.4, DF.BLOOD1 + (i % 4));
  for (const [x, z, r] of [[88, 53.5, 0.3], [108.5, 60.8, 2.1], [128, 53, 1.2]]) { P.corpse(L, x, 0.01 + (z > 61 ? 0.15 : 0), z, r); L.decal(x, 0.015 + (z > 61 ? 0.15 : 0), z, 0, 1, 0, 1.5, DF.POOL); }
  physProp(L, 'cone', 97, 0, 50.5);
  physProp(L, 'cone', 99.5, 0, 51.4);
  physProp(L, 'trashcan', 112, 0.15, 62.4);
  physProp(L, 'gascan', 108, 0, 55.4);
  P.trashBags(L, 106.8, 0.15, 62.6, 5);
  // street furniture
  for (const [x, z, r, on, fl] of [[72, 45.6, Math.PI, true, 0], [115, 45.6, Math.PI, true, 0.5], [76, 62.4, 0, false, 0], [96, 62.4, 0, true, 0.2], [126, 62.4, 0, true, 0]]) P.streetLight(L, x, 0.15, z, r, { on, flicker: fl });
  P.hydrant(L, 110.5, 0.15, 46.4);
  P.newsBox(L, 86.4, 0.15, 62.6, 0);
  P.newsBox(L, 87.3, 0.15, 62.6, 0, 0x1a4a8a);
  P.mailbox(L, 104.5, 0.15, 62.6, 0);
  P.bench(L, 74, 0.15, 62.8, 0);
  sign(L, 'HARBOR ST', 111.6, 3.1, 62.35, 0, 1.4, 0.32, { bg: '#1a5a2a', fg: '#fff', border: '#fff' });
  L.box(111.55, 0.15, 62.3, 111.65, 3.0, 62.4, 'metalDark');
  // ---------------------------------------------------- west blockade (burned bus + barricade)
  if (P.bus) P.bus(L, 64.6, 0, 53.5, 0.12, { burnt: true });
  else L.box(63.2, 0, 48, 66, 3, 59, 'rust', { tint: 0x3a3430 });
  fireSource(L, 64.8, 2.4, 51, 1.0, { hazard: false });
  P.barricade(L, 64.8, 0.15, 46.2, 0);
  P.barricade(L, 64.8, 0.15, 61.8, 0);
  P.car(L, 67.6, 0, 58.5, 1.9, { burnt: true });
  L.box(62, 0, ZS, 63.2, 7, ZH, 'concrete', { visible: false });
  // ---------------------------------------------------- east roadblock (military)
  const rx = 130.5;
  P.sandbags(L, rx, 0, 49, Math.PI / 2, 8, 4);
  P.sandbags(L, rx, 0, 59, Math.PI / 2, 8, 4);
  P.fenceChain(L, rx + 1, ZS, rx + 1, ZH, 0.15, 3.4);
  L.box(rx - 0.4, 0, ZS, rx + 1.2, 7, ZH, 'concrete', { visible: false });
  P.truck(L, rx + 5, 0, 54, Math.PI / 2 + 0.2, 0x3a4a2a);
  sign(L, 'QUARANTINE ZONE\nEVACUATION ROUTE CLOSED', rx - 0.1, 2.0, 54, -Math.PI / 2, 2.6, 1.0, { bg: '#d8c030', fg: '#101010', border: '#101010' });
  for (let i = 0; i < 6; i++) P.bodyBag(L, 127 - (i % 3) * 1.1, 0.01, 47 + Math.floor(i / 3) * 1.4 + (i % 2) * 0.2, 1.57 + (rng() - 0.5) * 0.3);
  // floodlight tower behind the sandbags
  L.box(rx + 3 - 0.08, 0, 45.4, rx + 3 + 0.08, 6.5, 45.6, 'metalDark', NC);
  L.box(rx + 2.2, 6.5, 45.3, rx + 3.8, 7.3, 45.7, 'emissiveWarm', NC);
  L.light(rx + 2, 6.2, 47, 0xfff4e0, 22, 22, { flicker: 0.05 });
  supplies(L, 127.5, 0.15, 62.7, Math.PI, ['ammo'], { w: 1.2 });
  L.item('tier1', 126.6, 0.93, 62.8, { chance: 0.7 });
  burningBarrel(L, 124.5, 0.15, 45.8);
  L.reverb(62, 0, ZS, 132, 30, ZH, 'outdoor');
  L.ambience(62, 0, ZS, 132, 30, ZH + 6, 'city');
  S.streetTrigger = [62, -1, ZS + 2.7, 132, 2, ZH];
}

// ============================================================ HARBORVIEW HOTEL
const HX0 = 70, HX1 = 132, HZ1 = 112, HTOP = 36;
function buildHotel(L, game, S) {
  const B = new VisualBatch(L);
  // body pieces around the ground-level interior (x 96..124, z 64..92, up to 4.6)
  const IY = 4.6;
  L.box(HX0, -0.5, ZH, 96, IY, HZ1, 'concrete', { tint: 0xb8b0a0 });
  L.box(124, -0.5, ZH, HX1, IY, HZ1, 'concrete', { tint: 0xb8b0a0 });
  L.box(96, -0.5, 92, 124, IY, HZ1, 'concrete', { tint: 0xb8b0a0 });
  L.box(HX0, IY, ZH, HX1, HTOP, HZ1, 'concrete', { tint: 0xb8b0a0 });
  // facade: rusticated base, window grid with balconies, cornice
  B.box(HX0 - 0.1, 0, ZH - 0.12, 108, 0.8, ZH, 'marble', { tint: 0x8a8278 });
  B.box(122, 0, ZH - 0.12, HX1 + 0.1, 0.8, ZH, 'marble', { tint: 0x8a8278 });
  windowGrid(L, 'n', HX0 + 0.5, HX1 - 0.5, ZH, IY + 0.4, HTOP - 1, { batch: B, fh: 3.2, dx: 3.1, w: 1.4, h: 1.9, sill: 0.7, lit: 0.13, broken: 0.1, ac: 0.12, bandTint: 0x9a9288, sillTint: 0xc8c0b0 });
  for (let yy = IY + 3.6; yy < HTOP - 3; yy += 6.4) for (let x = HX0 + 3; x < HX1 - 2; x += 9.3) {
    B.box(x - 1.6, yy - 0.12, ZH - 1.0, x + 1.6, yy, ZH, 'concrete', { tint: 0xa8a098 });
    B.box(x - 1.6, yy, ZH - 1.0, x + 1.6, yy + 0.9, ZH - 0.96, 'metalDark', { tint: 0x2a2a2a });
  }
  B.box(HX0 - 0.4, HTOP - 0.4, ZH - 0.6, HX1 + 0.4, HTOP + 0.3, ZH + 0.2, 'concrete', { tint: 0xc8c0b0 });
  B.box(HX0 - 0.2, IY - 0.3, ZH - 0.3, HX1 + 0.2, IY, ZH, 'concrete', { tint: 0xc8c0b0 });
  windowGrid(L, 'w', ZH + 0.5, HZ1 - 0.5, HX0, IY, HTOP - 1, { batch: B, fh: 3.2, dx: 3.1, lit: 0.1 });
  windowGrid(L, 'e', ZH + 0.5, HZ1 - 0.5, HX1, IY, HTOP - 1, { batch: B, fh: 3.2, dx: 3.1, lit: 0.1 });
  // rooftop sign (faces the rooftops across the street) + water tanks
  for (const x of [84, 116]) B.box(x - 0.15, HTOP + 0.3, ZH + 0.8, x + 0.15, HTOP + 6.5, ZH + 1.1, 'metalDark');
  B.box(80, HTOP + 1.2, ZH + 0.9, 120, HTOP + 1.4, ZH + 1.0, 'metalDark');
  B.box(80, HTOP + 5.4, ZH + 0.9, 120, HTOP + 5.6, ZH + 1.0, 'metalDark');
  S.hotelNeon = neonSign(L, 'HARBORVIEW', 100, HTOP + 3.5, ZH + 0.8, 0, 34, 5.4, '#ff3a26', { font: 'Georgia, "Times New Roman", serif', lightIntensity: 14, lightRange: 30, fog: false, bright: 2.8 });
  neonSign(L, 'H O T E L', 100, HTOP + 0.8, ZH + 0.8, 0, 9, 1.2, '#ffc860', { font: 'Arial Black, Impact, sans-serif', light: false, fog: false });
  P.waterTower(L, 76, HTOP, 100);
  P.waterTower(L, 126, HTOP, 96);
  // main entrance (x 80..92): marquee canopy, boarded revolving door, sandbags, quarantine notice
  B.box(79.5, 3.4, ZH - 3.2, 92.5, 3.7, ZH, 'metalDark', { tint: 0x2a2620 });
  B.box(79.5, 3.7, ZH - 3.2, 92.5, 3.75, ZH - 3.1, 'emissiveWarm');
  for (const x of [80, 92]) L.box(x - 0.1, 0.15, ZH - 3.1, x + 0.1, 3.4, ZH - 2.9, 'chrome', { tint: 0xb89a60 });
  sign(L, 'THE HARBORVIEW', 86, 4.15, ZH - 3.22, 0, 6, 0.6, { bg: '#1a1410', fg: '#e8c870', font: 'Georgia, serif', glow: 1.2, lightColor: 0xffc870, lightIntensity: 4 });
  L.box(82, 0.15, ZH - 0.1, 90, 3.2, ZH, 'glassDirty', { collide: false, tint: 0x1a1410 });
  for (let k = 0; k < 7; k++) L.box(82.2 + k * 1.1, 0.4, ZH - 0.16, 83.2 + k * 1.1, 2.9, ZH - 0.1, 'woodPale', { collide: false, tint: 0x8a7a60 });
  P.sandbags(L, 86, 0.15, ZH - 1.6, 0, 7, 3);
  sign(L, 'NO ENTRY\nBY ORDER OF THE\nNEWBURG QUARANTINE AUTHORITY', 86, 1.9, ZH - 0.2, 0, 2.2, 0.9, { bg: '#e8e0c8', fg: '#8a1010', border: '#8a1010' });
  P.truck(L, 76.5, 0, 57.5, -Math.PI / 2 + 0.15, 0x3a4a2a);
  const cart = P.prop(L, 91.5, 0.15, 61.8, 0.6);
  cart.box(0, 0.25, 0, 0.8, 0.06, 1.4, 'chrome', 0xc8a860).box(0, 1.1, 0.68, 0.8, 0.06, 0.06, 'chrome', 0xc8a860).box(-0.38, 0.7, 0.68, 0.04, 0.9, 0.04, 'chrome', 0xc8a860).box(0.38, 0.7, 0.68, 0.04, 0.9, 0.04, 'chrome', 0xc8a860);
  cart.box(0, 0.5, -0.2, 0.55, 0.45, 0.7, 'fabric', 0x3a2a1a).col(0, 0.5, 0, 0.8, 1.1, 1.4, 'metal');
  for (const x of [80.8, 91.2]) { P.planter(L, x, 0.15, ZH - 3.6, 0.45); deadPlant(L, x, 0.65, ZH - 3.6, 2.4); }
  // flags on poles above the entrance
  for (const [x, c] of [[82.5, 0x1a3a7a], [86, 0xb01e28], [89.5, 0x1a3a7a]]) { B.box(x - 0.03, 4.6, ZH - 0.1, x + 0.03, 4.8, ZH - 2.6, 'metalDark'); B.box(x - 0.02, 3.4, ZH - 2.5, x + 0.02, 4.7, ZH - 1.3, 'fabric', { tint: c }); }
  // ---------------------------------------------------- loading dock (service entrance) x 108..122 z 64..70
  const dx0 = 108, dx1 = 122, dz0 = ZH, dz1 = 70;
  L.box(96, -0.5, ZH, dx0, IY, 70.2, 'concrete', { tint: 0xb8b0a0 });
  L.box(dx1, -0.5, ZH, 124, IY, 70.2, 'concrete', { tint: 0xb8b0a0 });
  L.box(dx0, -0.3, dz0, dx1, 0.15, 66.5, 'concreteFloor', { tint: 0x7a7872 });
  L.box(dx0, 0.15, 66.5, dx1, HY, dz1, 'concrete', { tint: 0x9a968e });
  L.box(dx0 + 1.9, HY - 0.02, 66.45, dx1, HY + 0.005, 66.7, 'paintedYellow', { collide: false, tint: 0xd0a020 });
  for (const x of [112, 116.2, 120]) L.box(x - 0.25, 0.4, 66.3, x + 0.25, 1.05, 66.5, 'rubber', { tint: 0x151515 });
  L.stairs(dx0 + 0.15, 64.2, dx0 + 1.85, 66.5, 0.15, HY, '+z', 'concrete');
  L.box(dx0 + 1.85, 0.15, 64.2, dx0 + 1.9, HY + 1.0, 66.5, 'metalDark', { flags: F_SOLID | F_SHOOT });
  railSegment(L, dx0 + 1.87, 1.1, 64.2, dx0 + 1.87, HY + 0.95, 66.5);
  L.box(dx0, IY - 0.6, dz0, dx1, IY, dz0 + 0.5, 'concrete', { tint: 0x9a968e });
  L.box(dx0, IY - 0.05, dz0, dx1, IY, dz1, 'ceiling', { tint: 0x8a8680 });
  // back wall: two roll-up doors + the steel service door
  L.wallX(dx0, dx1, dz1 + 0.1, HY, IY, 'concrete', 0.2, [{ a: 115.6, b: 116.8, y0: HY, y1: HY + 2.2 }], { tint: 0xa8a098 });
  L.box(dx0, 0.15, dz1, dx1, HY, dz1 + 0.2, 'concrete', { tint: 0x9a968e });
  for (const [a, b] of [[109, 114.8], [117.6, 121.4]]) {
    L.box(a, HY, dz1 - 0.04, b, HY + 2.9, dz1, 'metal', { collide: false, tint: 0x8a8a84 });
    for (let yy = HY + 0.15; yy < HY + 2.9; yy += 0.18) L.box(a, yy, dz1 - 0.06, b, yy + 0.03, dz1 - 0.04, 'metalDark', NC);
    L.box(a - 0.15, HY, dz1 - 0.15, a, HY + 3.1, dz1, 'metalDark', NC);
    L.box(b, HY, dz1 - 0.15, b + 0.15, HY + 3.1, dz1, 'metalDark', NC);
  }
  S.serviceDoor = new Door(L, 116.2, HY, dz1 + 0.1, 'x', { width: 1.2, hinge: -1, material: 'metal' });
  sign(L, 'SERVICE ENTRANCE\nSTAFF & DELIVERIES', 116.2, HY + 2.65, dz1 - 0.02, Math.PI, 1.6, 0.45, { bg: '#e8e4d8', fg: '#1a2a4a' });
  sign(L, 'HARBORVIEW HOTEL  ·  RECEIVING', 115, IY - 0.3, dz0 - 0.03, Math.PI, 5.4, 0.45, { bg: '#1a2a3a', fg: '#e8d8a8', font: 'Georgia, serif' });
  graffiti(L, 'KITCHEN\nSAFE ROOM →', 113.8, HY + 1.4, dz1 - 0.08, Math.PI, 1.6, 0.8, '#f0e0a0');
  for (const x of [112, 120]) ceilingLight(L, x, IY - 0.05, 68.5, { type: 'cage', intensity: 7, range: 8, flicker: x === 112 ? 0.3 : 0 });
  ceilingLight(L, 116.2, HY + 3.05, dz1 - 0.3, { type: 'cage', intensity: 6, range: 6 });
  L.box(dx1 - 0.3, IY - 0.9, 64.5, dx1 - 0.1, IY - 0.7, 64.8, 'blackMatte', NC);
  P.dumpster(L, 120.2, 0.15, 65.2, 0, 0x2a4a3a);
  P.pallet(L, 110.8, HY, 68.6, 0.3, true);
  P.pallet(L, 119, HY, 68.8, -0.2, false);
  P.crate(L, 121, HY, 67.3, 0.4, 0.8);
  P.trashBags(L, 118.5, 0.15, 64.6, 4);
  const trolley = P.prop(L, 113.3, HY, 67.4, 0.9);
  trolley.box(0, 0.6, 0, 0.9, 0.9, 0.55, 'fabric', 0xe8e8e0).box(0, 0.12, 0, 0.9, 0.05, 0.55, 'metalDark').col(0, 0.5, 0, 0.9, 1.0, 0.55, 'metal');
  L.decal(115, HY + 0.01, 68.8, 0, 1, 0, 1.6, DF.SMEAR);
  bloodTrail(L, 112, 65.6, 116, 69.6, 0.15, 5);
  L.box(dx0 + 2, 0.003, 61.1, dx1, 0.16, 61.4, 'paintedYellow', { collide: false, tint: 0xd0a020 });
  sign(L, 'LOADING ZONE', 115, 0.155, 62.5, 0, 3, 0.5, { fg: '#e0c030' });
  S.dockTrigger = [dx0, -0.5, 60.5, dx1, 3, dz1];
  L.reverb(dx0, 0, dz0, dx1, IY, dz1, 'room');
  B.build(L);
  buildService(L, game, S);
}

// ------------------------------------------------ service corridor + kitchen
function buildService(L, game, S) {
  const y = HY, h = 3.0, c = y + h;
  const cx0 = 115, cx1 = 117.4;
  // fill everything first, then carve rooms with walls (solid invisible filler around them)
  const fills = [
    [96, 70.2, 106, 78], [106, 70.2, 109, 82], [109, 70.2, 115, 72], [109, 78, 115, 82], [117.4, 70.2, 124, 72], [117.4, 78, 124, 92],
    [106, 84.4, 117.4, 92], [96, 90, 106, 92],
  ];
  for (const [a, b, d, e] of fills) L.box(a, y, b, d, 4.6, e, 'concrete', { visible: false });
  L.box(96, 0, 70.0, 124, y, 92, 'concrete', { visible: false });
  // corridor floor/ceiling + walls
  L.box(cx0, y - 0.01, 70.2, cx1, y + 0.006, 84.4, 'linoleum', { collide: false, tint: 0x9a9488 });
  L.box(106, y - 0.01, 82, cx0, y + 0.006, 84.4, 'linoleum', { collide: false, tint: 0x9a9488 });
  L.box(106, c, 70.2, 124, c + 0.2, 92, 'ceiling', { tint: 0xb8b4a8 });
  L.wallZ(70.2, 82, cx0 - 0.1, y, c, 'plasterDirty', 0.2, [{ a: 74, b: 76, y0: y, y1: y + 2.2 }], { tint: 0xc8c0a8 });
  L.wallZ(70.2, 84.4, cx1 + 0.1, y, c, 'plasterDirty', 0.2, [{ a: 73, b: 74.6, y0: y, y1: y + 2.2 }], { tint: 0xc8c0a8 });
  L.wallX(106, cx0, 81.9, y, c, 'plasterDirty', 0.2, [], { tint: 0xc8c0a8 });
  L.wallX(106, cx1 + 0.2, 84.5, y, c, 'plasterDirty', 0.2, [], { tint: 0xc8c0a8 });
  for (const [z0, z1] of [[70.2, 84.4]]) for (const x of [cx0, cx1]) L.box(x - 0.01, y, z0, x + 0.01, y + 0.1, z1, 'woodDark', NC);
  // linen room (west) and staff lockers (east)
  L.box(109, y - 0.01, 72, cx0 - 0.2, y + 0.006, 78, 'linoleum', { collide: false, tint: 0x8a8478 });
  L.wallX(109, cx0 - 0.2, 72, y, c, 'plasterDirty', 0.2, [], { tint: 0xc8c0a8 });
  L.wallX(109, cx0 - 0.2, 78, y, c, 'plasterDirty', 0.2, [], { tint: 0xc8c0a8 });
  L.wallZ(72, 78, 109.1, y, c, 'plasterDirty', 0.2, [], { tint: 0xc8c0a8 });
  for (let k = 0; k < 3; k++) {
    const sh = P.prop(L, 109.6, y, 73 + k * 1.9, Math.PI / 2);
    sh.box(0, 1.0, 0, 1.6, 2.0, 0.5, 'metal', 0x8a8a84).col(0, 1.0, 0, 1.6, 2.0, 0.5, 'metal');
    for (let s = 0; s < 4; s++) sh.box(0, 0.35 + s * 0.45, -0.02, 1.5, 0.25, 0.45, 'fabric', rng.pick([0xe8e8e0, 0xd8d8d0, 0xe0dcd0]));
  }
  for (const z of [73.5, 76.2]) { const lc = P.prop(L, 112.6, y, z, rng()); lc.box(0, 0.55, 0, 0.9, 0.7, 0.6, 'fabric', 0x6a6a6a).box(0, 0.62, 0, 0.8, 0.5, 0.5, 'fabric', 0xe8e8e0).box(0, 0.12, 0, 0.9, 0.05, 0.6, 'metalDark').col(0, 0.5, 0, 0.9, 0.9, 0.6, 'fabric'); }
  ceilingLight(L, 112, c, 75, { type: 'fluoro', intensity: 6, flicker: 0.7 });
  L.item('pills', 109.7, y + 1.3, 76.8, { chance: 0.6 });
  L.box(cx1 + 0.2, y - 0.01, 72, 122.2, y + 0.006, 78, 'tileFloor', { collide: false, tint: 0x8a8a84 });
  L.wallX(cx1 + 0.2, 122.2, 72, y, c, 'plasterDirty', 0.2, [], { tint: 0xc8c0a8 });
  L.wallX(cx1 + 0.2, 122.2, 78, y, c, 'plasterDirty', 0.2, [], { tint: 0xc8c0a8 });
  L.wallZ(72, 78, 122.2, y, c, 'plasterDirty', 0.2, [], { tint: 0xc8c0a8 });
  L.box(122.3, y, 72, 124, c, 78, 'concrete', { visible: false });
  for (let k = 0; k < 7; k++) {
    const lk = P.prop(L, 121.8, y, 72.6 + k * 0.72, -Math.PI / 2);
    lk.box(0, 0.95, 0, 0.68, 1.9, 0.5, 'metal', rng.pick([0x5a6a7a, 0x6a7a8a, 0x4a5a6a])).box(0.2, 1.6, -0.255, 0.3, 0.05, 0.01, 'blackMatte').col(0, 0.95, 0, 0.68, 1.9, 0.5, 'metal');
  }
  P.bench(L, 119.8, y, 75, Math.PI / 2);
  L.item('ammo', 119.9, y + 0.5, 75.8, { chance: 0.5 });
  L.item('tier1', 121.4, y + 0.02, 77.2, { chance: 0.4 });
  ceilingLight(L, 120, c, 75, { intensity: 6, flicker: 0.3 });
  // corridor dressing
  for (const [z, f] of [[72.5, 0.1], [77.5, 0.6], [83.2, 0.2]]) ceilingLight(L, 116.2, c, z, { type: 'fluoro', intensity: 7, flicker: f });
  ceilingLight(L, 110, c, 83.2, { type: 'fluoro', intensity: 7, flicker: 0.3 });
  sign(L, 'KITCHEN ←', 115.3, y + 2.5, 84.38, Math.PI, 0.9, 0.25, { bg: '#1a1a1a', fg: '#fff' });
  sign(L, 'EMPLOYEE OF THE MONTH\nMARISOL R. — BANQUETS', cx1 - 0.02, y + 1.6, 80, -Math.PI / 2, 1.2, 0.45, { bg: '#e8d8a8', fg: '#3a2a1a', font: 'Georgia, serif' });
  sign(L, 'ALL STAFF: EVAC BUSES\nFROM THE FRONT DOOR 6PM\n— MANAGEMENT', cx0 + 0.02, y + 1.6, 80, Math.PI / 2, 1.2, 0.5, { bg: '#f4f0e0', fg: '#1a1a1a', font: 'Courier New, monospace', weight: 'normal' });
  const tc = P.prop(L, 115.35, y + 1.3, 71.2, Math.PI / 2);
  tc.box(0, 0, 0, 0.35, 0.45, 0.14, 'plastic', 0x9a9a90).box(0, 0.05, -0.075, 0.2, 0.1, 0.01, 'emissiveGreen');
  const rs = P.prop(L, 116.9, y, 79, 0);
  rs.box(0, 0.75, 0, 0.6, 0.04, 1.0, 'chrome').box(0, 0.35, 0, 0.55, 0.03, 0.95, 'chrome').box(0, 0.8, -0.2, 0.3, 0.1, 0.3, 'metalClean').col(0, 0.4, 0, 0.6, 0.8, 1.0, 'metal', F_SOLID | F_SHOOT);
  P.corpse(L, 110.5, y + 0.01, 83.4, 1.5, 0xe8e8e0);
  L.decal(110.5, y + 0.012, 83.4, 0, 1, 0, 1.6, DF.POOL);
  bloodTrail(L, 116.2, 71, 116.2, 81, y, 7);
  L.reverb(106, y, 70.2, 124, c, 92, 'room');
  L.ambience(106, y, 70.2, 124, c, 92, 'hospital');
  S.corridorTrigger = [cx0, y - 0.3, 70.2, cx1, y + 3, 76];

  // ------------------------------------------------ kitchen safe room (end)
  const K = KITCHEN;
  const kr = safeRoom(L, {
    x0: K.x0, z0: K.z0, x1: K.x1, z1: K.z1, y, h, doorWall: 'e', doorAt: 83.2, end: true, hinge: 1, wall: 'tileWhite', floor: false, ceil: 'ceiling',
    graffiti: ['HOTEL ROOF\n→ CRANE', 'AIRPORT\n6 MI EAST', 'CHEF SAYS\nDONT EAT\nTHE SOUP', 'LEFT FOR\nTHE CRANE\nDAY 9', 'RED DOOR\n= SAFE'],
  });
  S.endDoor = kr.door;
  L.box(K.x0, y - 0.01, K.z0, K.x1, y + 0.006, K.z1, 'tileFloor', { collide: false, tint: 0x9a4a3a });
  L.box(K.x0 + 0.1, y + 1.4, K.z0 + 0.1, K.x1 - 0.1, y + 1.45, K.z0 + 0.12, 'metalClean', NC);
  sign(L, 'SAFE ROOM', K.x1 + 0.12, y + 2.55, 83.2, Math.PI / 2, 1.3, 0.32, { bg: '#8a1a14', fg: '#fff' });
  sign(L, 'KITCHEN\nSTAFF ONLY', K.x1 + 0.12, y + 1.6, 81.8, Math.PI / 2, 0.8, 0.4, { bg: '#e8e4d8', fg: '#1a1a1a' });
  // cooking line on the south wall + hood
  cookLine(L, 98, y, K.z1 - 0.5, Math.PI, 1.2, 'grill');
  cookLine(L, 99.25, y, K.z1 - 0.5, Math.PI, 1.2, 'fryer');
  cookLine(L, 100.5, y, K.z1 - 0.5, Math.PI, 1.2, 'flat');
  P.stove(L, 101.9, y, K.z1 - 0.45, Math.PI);
  cookLine(L, 103.3, y, K.z1 - 0.5, Math.PI, 1.2, 'grill');
  hood(L, 100.6, y + 2.4, K.z1 - 0.55, Math.PI, 6.8);
  for (let x = 97.8; x < 103.8; x += 0.7) P.pipe(L, x, y + 2.15, K.z1 - 0.9, x, y + 2.15, K.z1 - 0.95, 0.01, 'chrome');
  // prep islands with pots and pans, hanging rack
  prepTable(L, 100.2, y, 83.3, 0, 2.6);
  prepTable(L, 100.2, y, 86.2, 0, 2.6);
  for (const [x, z] of [[99.4, 86.2], [101, 86.1]]) P.prop(L, x, y + 0.93, z, 0).cyl(0, 0.12, 0, 0.18, 0.24, 'metalClean', 0xb8b8b0, null, 12).cyl(0.2, 0.2, 0, 0.012, 0.25, 'metalDark', null, [0, 0, Math.PI / 2]);
  L.box(98.6, y + 2.3, 84.5, 101.8, y + 2.34, 85, 'metalClean', NC);
  for (let k = 0; k < 7; k++) P.prop(L, 98.9 + k * 0.45, y + 2.0, 84.75, 0).cyl(0, 0, 0, 0.12 + (k % 3) * 0.03, 0.03, 'metalDark', 0x3a3a3a, [Math.PI / 2, 0, 0]);
  // dish pit + sinks on the north wall
  for (let k = 0; k < 3; k++) { const sk = P.prop(L, 98 + k * 1.4, y, K.z0 + 0.45, 0); sk.box(0, 0.45, 0, 1.3, 0.9, 0.7, 'metalClean', 0xb8bcb8).box(0, 0.91, 0, 1.1, 0.02, 0.5, 'blackMatte').cyl(0, 1.2, 0.28, 0.02, 0.5, 'chrome').col(0, 0.45, 0, 1.3, 0.9, 0.7, 'metal'); }
  const rack = P.prop(L, 103, y, K.z0 + 0.35, 0);
  rack.box(0, 1.0, 0, 1.8, 2.0, 0.5, 'metalClean', 0x9a9e9a).col(0, 1.0, 0, 1.8, 2.0, 0.5, 'metal');
  for (let s = 0; s < 4; s++) for (let k = 0; k < 5; k++) rack.cyl(-0.7 + k * 0.35, 0.3 + s * 0.5, 0, 0.12, 0.08, 'plastic', rng.pick([0xe8e8e0, 0xd8d4c8]), [0, 0, 0], 10);
  // walk-in fridge door (west wall)
  const wf = P.prop(L, K.x0 + 0.13, y, 85, Math.PI / 2);
  wf.box(0, 1.15, 0, 1.4, 2.3, 0.08, 'metalClean', 0xc8ccc8).box(0, 1.15, 0.06, 1.5, 2.4, 0.04, 'metalDark').box(0.55, 1.1, -0.08, 0.1, 0.35, 0.1, 'chrome').box(0, 2.45, -0.02, 0.8, 0.18, 0.06, 'plastic', 0x2a2a2a);
  sign(L, 'WALK-IN COOLER  2°C', K.x0 + 0.2, y + 2.47, 85, Math.PI / 2, 0.75, 0.15, { bg: '#1a1a1a', fg: '#40ff70' });
  // supplies
  supplies(L, 104.9, y, 88.9, Math.PI, ['medkit', 'medkit', 'medkit', 'medkit'], { w: 1.8, mat: 'metalClean' });
  supplies(L, 96.7, y, 80.6, Math.PI / 2, ['tier1', 'tier1', 'ammo'], { w: 1.8, mat: 'metalClean' });
  L.item('pills', 102.4, y + 0.95, 83.3, { chance: 0.6 });
  ceilingLight(L, 100.2, c, 84.8, { type: 'fluoro', intensity: 9, flicker: 0.05 });
  // heat lamps over the (boarded) pass
  for (let k = 0; k < 3; k++) L.box(97.8 + k * 0.9, y + 1.9, K.z0 + 0.15, 98.4 + k * 0.9, y + 1.95, K.z0 + 0.35, 'emissiveWarm', NC);
  L.light(99, y + 1.7, K.z0 + 0.8, 0xff9050, 3, 4);
  L.flowEnd = [101.5, y, 81.2];
  S.kitchenTrigger = [106, y - 0.3, 82, 115, y + 3, 84.4];
}

// ============================================================ BACKDROP BLOCKS
// Visual-only neighbours: they frame the playable roofs and street.
function buildBackdrop(L, game, S) {
  const B = new VisualBatch(L);
  const block = (x0, z0, x1, z1, h, o = {}) => {
    const mat = o.mat ?? rng.pick(['brickDark', 'concreteDark', 'brick', 'concrete']);
    const tint = o.tint ?? rng.pick([0x8a7a70, 0x7a7068, 0x9a8a7a, 0x6a6660, 0x8a8480]);
    B.box(x0, -1, z0, x1, h, z1, mat, { tint, ao: 0.55 });
    for (const f of o.faces ?? ['n', 's', 'e', 'w']) {
      const along = f === 'n' || f === 's';
      const fixed = f === 'n' ? z0 : f === 's' ? z1 : f === 'w' ? x0 : x1;
      windowGrid(L, f, along ? x0 + 0.5 : z0 + 0.5, along ? x1 - 0.5 : z1 - 0.5, fixed, o.base ?? 3.6, h, { batch: B, lit: o.lit ?? 0.1, broken: 0.1, ac: 0.08, fh: 3.4, dx: 2.9, bands: false });
    }
    // roof: parapet + clutter
    B.box(x0, h, z0, x1, h + 0.9, z0 + 0.3, mat, { tint });
    B.box(x0, h, z1 - 0.3, x1, h + 0.9, z1, mat, { tint });
    B.box(x0, h, z0, x0 + 0.3, h + 0.9, z1, mat, { tint });
    B.box(x1 - 0.3, h, z0, x1, h + 0.9, z1, mat, { tint });
    if (o.tank !== false && x1 - x0 > 10) {
      const tx = x0 + (x1 - x0) * (0.25 + rng() * 0.5), tz = z0 + (z1 - z0) * (0.25 + rng() * 0.5);
      for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) B.box(tx + dx - 0.1, h, tz + dz - 0.1, tx + dx + 0.1, h + 4, tz + dz + 0.1, 'metalDark');
      B.box(tx - 2, h + 4, tz - 2, tx + 2, h + 7, tz + 2, 'woodDark', { tint: 0x5a4a3a });
      B.box(tx - 1.6, h + 7, tz - 1.6, tx + 1.6, h + 7.9, tz + 1.6, 'metalDark');
    }
    if (rng() < 0.6) B.box(x0 + 2, h, z0 + 2, x0 + 5, h + 2.5, z0 + 4.5, 'metal', { tint: 0x8a8a84 });
    if (h > 30) B.box((x0 + x1) / 2 - 0.25, h + 0.9, (z0 + z1) / 2 - 0.25, (x0 + x1) / 2 + 0.25, h + 1.4, (z0 + z1) / 2 + 0.25, 'emissiveRed');
  };
  // behind the block (north of the back alley), mostly low toward the airport view
  block(-40, -30, -4, 8, 27, { faces: ['s', 'e'] });
  block(-2, -24, 22, 8, 13, { faces: ['s'] });
  block(24, -26, 46, 8, 24, { faces: ['s'] });
  block(48, -22, 70, 8, 11, { faces: ['s'], lit: 0.14 });
  block(72, -30, 96, 8, 16, { faces: ['s'] });
  block(98, -20, 124, 8, 12, { faces: ['s', 'e'] });
  block(126, -24, 150, 8, 19, { faces: ['s', 'w'] });
  // west of A (tall), east of D (tower E)
  block(-44, 10, -2, 44, 34, { faces: ['e', 's'] });
  L.box(104, -0.5, 10, 140, 6, ZS, 'concrete', { tint: 0x8a867e }); // E base (street wall)
  block(104, 10, 140, ZS, 46, { faces: ['s', 'w', 'n'], mat: 'concrete', tint: 0x7a7a78, lit: 0.12 });
  sign(L, 'HARBOR TRUST', 104.03, 40, 30, -Math.PI / 2, 14, 2.4, { fg: '#8ab0ff', glow: 1.8, lightColor: 0x6a90ff, lightIntensity: 6 });
  // storefronts west of the hotel (south side), their faces toward the street
  L.box(62, -0.5, ZH, 70, 14, 96, 'brick', { tint: 0x8a6a5a });
  block(40, ZH, 62, 96, 18, { faces: ['n', 'e'], lit: 0.14 });
  block(10, ZH, 38, 96, 12, { faces: ['n'] });
  block(-30, ZH, 8, 96, 22, { faces: ['n'] });
  block(132, ZH, 170, 100, 26, { faces: ['n', 'w'] });
  // shop signs + the cinema marquee across from A/B
  const shops = [[42, 60, 'NIGHT OWL DINER', '#ff6a3a'], [12, 36, 'THE PALACE', '#ffd060'], [-28, 6, 'HARBOR PHARMACY', '#40ff80'], [63, 69.8, 'BAIT & TACKLE', '#40d8ff']];
  for (const [a, b, name, col] of shops) {
    B.box(a + 0.5, 0.5, ZH - 0.05, b - 0.5, 2.9, ZH, 'glassDirty', { tint: 0x14100e });
    neonSign(L, name, (a + b) / 2, 3.6, ZH - 0.08, Math.PI, Math.min(8, b - a - 1), 0.9, col, { font: 'Arial Black, Impact, sans-serif', lightIntensity: 4, lightRange: 9, flicker: rng() < 0.4 ? 0.3 : 0 });
  }
  const mq = P.prop(L, 24, 3.2, ZH - 1.4, 0);
  mq.box(0, 0.6, 0, 12, 1.2, 2.8, 'metalDark', 0x2a2420);
  sign(L, 'MIDNIGHT DOUBLE FEATURE\nTHEY CAME FROM THE HARBOR\n+ LAST FLIGHT OUT', 24, 3.8, ZH - 2.82, Math.PI, 11, 1.1, { bg: '#f0e8d0', fg: '#1a1a1a', glow: 0.9, lightColor: 0xffe8b0, lightIntensity: 5 });
  B.box(18, 3.2, ZH - 2.9, 30, 3.25, ZH - 2.8, 'emissiveWarm');
  B.box(18, 4.4, ZH - 2.9, 30, 4.45, ZH - 2.8, 'emissiveWarm');
  B.build(L);
}

export function buildStreetAndHotel(L, game, S) {
  buildStreet(L, game, S);
  buildHotel(L, game, S);
  buildBackdrop(L, game, S);
}
