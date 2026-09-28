// Dead Air 2 — Commerce Street and Stor-Safe Self Storage. The alarmed
// emergency exit of the Meridian lobby lets out onto a wrecked street (a burning
// city bus, a police roadblock, an army checkpoint that failed). Across it: the
// Stor-Safe lot (pylon sign, rental truck), the office, and the climate-
// controlled building — corridors of orange roll-up doors with motion-sensor
// lights — ending in unit C-17, whose roll-up door is the safe-room door.
// (Chapter 3 starts inside this same unit.)
import * as THREE from 'three';
import { ceilingLight, wallLamp, sign, graffiti, poster, posterWall, wallMessages, supplies, fireSource, burningBarrel, physProp, P, street, hittable } from './kit.js';
import { Door } from '../world/dynamic.js';
import { F_SOLID, F_SHOOT, F_DEFAULT } from '../world/collision.js';
import { DF } from '../render/decals.js';
import { bus, ambulance, jersey, razorWire, tent } from './ch3_props.js';
import { shelving } from './ch2_parts.js';
import { rng, RollupDoor, cardboard, rotXZ } from './da2_parts.js';
import { OT, STREET, SS } from './da2_layout.js';

const NC = { collide: false };
const SY = 0.3; // storage building floor
const blood = (L, x, y, z, s = 1.2, k = 0) => L.decal(x, y + 0.012, z, 0, 1, 0, s, [DF.BLOOD1, DF.BLOOD2, DF.BLOOD3, DF.BLOOD4, DF.POOL, DF.SMEAR, DF.SPLAT_BIG][k % 7]);

// ============================================================ COMMERCE ST
function commerceStreet(L, game) {
  const z0 = STREET.z0, z1 = STREET.z1, x0 = 28, x1 = 118;
  street(L, x0, z0, x1, z1, 'x', { sidewalk: 3 });
  // enclosing blocks (collide) on both sides
  const blk = (a, b, c, d, h, mat, tint) => L.box(a, -0.3, b, c, h, d, mat, { tint });
  blk(28, 86, 40, z0, 14, 'brick', 0x7a5040);      // pawn / walk-up
  blk(40, 86.4, 57.8, z0, 11, 'concrete', 0xa8a498); // Newburg Savings & Loan
  blk(92.2, 70, 118, z0, 16, 'concreteDark', 0x5a5a5e); // Park-Rite garage
  blk(28, z1, 52, 124, 9, 'brickTan', 0x9a7a5c);    // pharmacy + diner
  blk(100, z1, 118, 124, 10, 'brickDark', 0x5a4034); // laundromat
  // facade dressing
  for (let x = 30; x < 39; x += 3) { L.box(x - 1.1, 0.4, z0 - 0.03, x + 1.1, 3.2, z0, 'glassDirty', { collide: false, tint: 0x1a2024 }); }
  sign(L, 'GOLD & LOAN\nWE BUY GOLD', 34, 4.0, z0 + 0.02, 0, 5, 1.1, { bg: '#1a1a1a', fg: '#e8c020', glow: 0.8, lightColor: 0xffc040, lightIntensity: 3 });
  for (const x of [41.5, 46, 50.5, 55]) L.box(x - 0.35, 0, z0 - 0.02, x + 0.35, 8.5, z0 + 0.5, 'concrete', { tint: 0xc8c4b8 });
  L.box(40, 8.5, z0, 57.8, 9.6, z0 + 0.8, 'concrete', { collide: false, tint: 0xb8b4a8 });
  sign(L, 'NEWBURG SAVINGS & LOAN', 48.9, 9.05, z0 + 0.82, 0, 12, 0.8, { fg: '#2a2a2a', font: 'Georgia, serif' });
  for (const x of [43.7, 48.2, 52.8]) L.box(x - 1.4, 0.8, z0 - 0.02, x + 1.4, 6.8, z0, 'glassDirty', { collide: false, tint: 0x141a20 });
  for (const x of [41.5, 46, 50.5, 55]) posterWall(L, x, 1.7, z0 + 0.53, 0, 0.66, 1.5, { kinds: ['missing', 'quarantine', 'evac', 'flyer'] });
  posterWall(L, 104, 1.6, z1 - 0.03, 0, 4.2, 1.8, { kinds: ['concert', 'movie', 'airline', 'flyer', 'missing'] });
  posterWall(L, 36, 1.4, z1 - 0.03, 0, 2.4, 1.4, { kinds: ['health', 'quarantine', 'missing'] });
  for (let yy = 2.5; yy < 15; yy += 3) L.box(92.4, yy, z0 - 0.02, 117.8, yy + 1.8, z0, 'blackMatte', { collide: false, tint: 0x0c0c0e });
  sign(L, 'PARK-RITE · PUBLIC PARKING · $12 / DAY', 104, 1.9, z0 + 0.03, 0, 9, 0.6, { bg: '#1a3a6a', fg: '#fff' });
  sign(L, 'RX · 24 HR PHARMACY', 36, 4.5, z1 - 0.02, 0, 7, 0.9, { bg: '#1a6a2a', fg: '#fff', glow: 1.0, lightColor: 0x40ff60, lightIntensity: 4 });
  sign(L, 'LOU\'S DINER', 47, 4.3, z1 - 0.02, 0, 4.4, 0.9, { fg: '#ff4040', glow: 1.2, lightColor: 0xff3020, lightIntensity: 3 });
  for (let x = 30; x < 51; x += 2.6) L.box(x - 1.0, 0.5, z1 - 0.01, x + 1.0, 3.0, z1 + 0.02, 'glassDirty', { collide: false, tint: 0x1a2024 });
  sign(L, 'SUDS LAUNDROMAT', 109, 4.2, z1 - 0.02, 0, 6, 0.8, { bg: '#e8e0c8', fg: '#1a3a8a' });
  // street ends: roadblocks + tall clips
  L.clip(x0, 0, z0, x0 + 0.5, 8, z1, F_SOLID); L.clip(x1 - 0.5, 0, z0, x1, 8, z1, F_SOLID);
  bus(L, 33.5, 0, 103.6, Math.PI / 2 + 0.25, { burnt: true });
  fireSource(L, 33.5, 1.2, 103.6, 1.6, { hazard: false, intensity: 16 });
  L.decal(33.5, 0.02, 103.6, 0, 1, 0, 9, DF.SCORCH);
  P.car(L, 38.6, 0, 99.8, 0.5, { burnt: true }); P.car(L, 37.2, 0, 109.6, -0.4, {});
  for (const z of [98.5, 101, 106, 110.5]) jersey(L, 41.6, 0, z, Math.PI / 2 + (rng() - 0.5) * 0.2, 2.0);
  // east: the failed army checkpoint
  const tr = P.prop(L, 111.5, 0, 103.8, 1.35 + Math.PI / 2);
  tr.box(0, 1.6, 0.8, 2.5, 2.2, 5.8, 'fabricGreen', 0x3a4a2a).box(0, 1.3, -2.8, 2.4, 2.0, 1.8, 'paintedGreen', 0x3a4a2a).box(0, 2.0, -3.71, 2.2, 0.7, 0.05, 'glassDirty', 0x1a2024);
  for (const sx of [-1.15, 1.15]) for (const sz of [-2.6, 1.0, 2.8]) tr.cyl(sx, 0.55, sz, 0.55, 0.4, 'rubber', 0x151515, [0, 0, Math.PI / 2], 14);
  tr.col(0, 1.5, 0, 2.6, 3.0, 7.4, 'metal');
  for (const z of [98, 101.2, 106.8, 110]) { P.sandbags(L, 107.5, 0, z, Math.PI / 2, 3, 3); }
  razorWire(L, 106.2, 0, 104, Math.PI / 2, 12);
  tent(L, 114, 0, 99, 0, 4, 3, {});
  for (let i = 0; i < 6; i++) P.bodyBag(L, 112 + (i % 3) * 1.1, 0.16, 108.6 + Math.floor(i / 3) * 1.2, 0.1);
  sign(L, 'MILITARY CHECKPOINT\nEVACUEES → METRO INTL AIRPORT', 107.2, 2.8, 97.4, Math.PI / 2, 3.2, 0.8, { bg: '#2a3a1a', fg: '#e8e8d0' });
  // mid-street wreckage + police roadblock (with a live light bar)
  P.car(L, 58.5, 0, 102.2, 1.8, { police: true });
  P.car(L, 64.8, 0, 107.4, 0.25, { taxi: true });
  P.car(L, 76.4, 0, 101.8, Math.PI / 2 + 0.3, { burnt: true });
  fireSource(L, 76.4, 0.9, 101.8, 0.8, { hazard: true });
  P.car(L, 90.5, 0, 106.6, -0.6, {});
  P.van(L, 97.8, 0, 101.4, 1.2, 0xd8d4c8);
  sign(L, 'NEWS 9', 97.8, 1.6, 101.4, 1.2 + Math.PI / 2, 1.6, 0.5, { bg: '#b81a14', fg: '#fff' });
  ambulance(L, 84.2, 0, 108.6, 0.1 + Math.PI / 2, {});
  hittable(L, 'car', 70.5, 0, 103.2, 0.8, {});
  for (const [x, z, r] of [[61.6, 99.4, 0.1], [61.6, 104.8, -0.1]]) P.barricade(L, x, 0.15, z, r + Math.PI / 2);
  const bar = [];
  for (const [dx, col] of [[-0.35, 0xff2010], [0.35, 0x2040ff]]) {
    const [bx, bz] = rotXZ(58.5, 102.2, 1.8, dx, 0);
    bar.push(L.light(bx, 1.9, bz, col, 0, 9, { on: false, priority: 1 }));
  }
  L.dynamics.push({ update() { const t = game.time; bar[0].on = bar[1].on = true; bar[0].intensity = (Math.sin(t * 9) > 0) ? 9 : 0; bar[1].intensity = (Math.sin(t * 9) > 0) ? 0 : 9; } });
  // street furniture
  for (const [x, z, r, on] of [[46, 96.6, 0, true], [72, 96.6, 0, false], [96, 96.6, 0, true], [58, 111.4, Math.PI, true], [86, 111.4, Math.PI, false]]) P.streetLight(L, x, 0.15, z, r, { on, intensity: 24, range: 18 });
  P.trafficLight(L, 57.6, 0.15, 98.6, Math.PI / 2);
  P.hydrant(L, 80.2, 0.15, 98.4);
  P.newsBox(L, 74.2, 0.15, 97.3, Math.PI); P.newsBox(L, 74.9, 0.15, 97.3, Math.PI, 0x1a4a8a);
  P.mailbox(L, 88.4, 0.15, 97.4, Math.PI);
  for (const [x, z] of [[60.5, 97.4], [92.2, 110.6], [53.2, 110.5]]) P.trashCan(L, x, 0.15, z);
  // bus stop with an airline ad
  const bs = P.prop(L, 78, 0.15, 110.9, 0);
  bs.box(0, 2.4, 0, 3.6, 0.08, 1.4, 'metalDark').box(-1.75, 1.2, 0, 0.08, 2.4, 1.4, 'metalDark').box(1.75, 1.2, 0, 0.08, 2.4, 1.4, 'metalDark').box(0, 1.2, 0.66, 3.5, 2.3, 0.04, 'glass', 0x9ab8c0).col(0, 1.2, 0.66, 3.6, 2.4, 0.1, 'glass', F_SOLID | F_SHOOT);
  P.bench(L, 78, 0.15, 110.9, Math.PI);
  sign(L, 'SKYLINE AIR\nLEAVE IT ALL BEHIND.', 79.2, 1.4, 111.53, 0, 1.1, 1.6, { bg: '#e8e2d4', fg: '#b01e28', glow: 0.6, light: false });
  L.light(79.2, 1.6, 111.0, 0xfff0d8, 3, 4, {});
  // evacuation signage (green road signs on poles)
  for (const [x, z, t] of [[56.4, 97.2, 'EVACUATION ROUTE\n→ METRO INTL AIRPORT 6 MI'], [99.4, 110.8, 'AIRPORT ✈ →']]) {
    L.box(x - 0.05, 0.15, z - 0.05, x + 0.05, 3.6, z + 0.05, 'metalDark');
    sign(L, t, x, 3.4, z, 0, 2.4, 0.8, { bg: '#1a5a2a', fg: '#fff', border: '#fff' });
  }
  // story: blood, bodies, dropped luggage — people ran for the airport
  for (let i = 0; i < 12; i++) blood(L, 44 + rng() * 60, 0, 98 + rng() * 12, 0.8 + rng() * 1.2, i);
  for (const [x, z, r, c] of [[67.4, 100.6, 1.1, 0x3a3a52], [82.6, 104.4, 2.3, 0x5a2a2a], [95.4, 108.8, 0.3, 0x2a3a2a]]) P.corpse(L, x, 0.01, z, r, c);
  for (const [x, z] of [[69.4, 105.5], [70.1, 106.1], [88.8, 103.2]]) { const lg = P.prop(L, x, 0, z, rng() * 6); lg.box(0, 0.12, 0, 0.7, 0.24, 0.45, 'fabric', rng.pick([0x2a2a3a, 0x6a1a1a, 0x1a4a3a])); }
  P.papers(L, 72, 0.01, 104, 6, 26);
  // the Meridian exit stoop
  L.box(83.6, 0.15, OT.z1, 86.4, 0.3, OT.z1 + 1.2, 'concrete', { tint: 0x9a968e });
  L.reverb(x0, 0, z0, x1, 20, z1, 'outdoor');
  L.ambience(x0, -1, z0, x1, 20, z1 + 8, 'city');
}

// =========================================================== STOR-SAFE
function lot(L, game) {
  const y = 0.15;
  L.box(50, -0.3, STREET.z1, 100, y, SS.z0, 'asphalt');
  for (let x = 72; x < 98; x += 3) L.box(x, y + 0.002, 113.5, x + 0.1, y + 0.01, 118, 'paintedWhite', { collide: false, tint: 0xd8d8c8 });
  // fence with the knocked-down gate
  P.fenceChain(L, 50.2, STREET.z1 + 0.3, 63, STREET.z1 + 0.3, y, 2.4);
  P.fenceChain(L, 70, STREET.z1 + 0.3, 100, STREET.z1 + 0.3, y, 2.4);
  L.clip(50, y, STREET.z1, 63, 4.5, STREET.z1 + 0.5, F_SOLID); L.clip(70, y, STREET.z1, 100, 4.5, STREET.z1 + 0.5, F_SOLID);
  P.fenceChain(L, 50.2, STREET.z1 + 0.3, 50.2, SS.z0, y, 2.4); L.clip(49.8, y, STREET.z1, 50.4, 4.5, SS.z0, F_SOLID);
  P.fenceChain(L, 99.8, STREET.z1 + 0.3, 99.8, SS.z0, y, 2.4); L.clip(99.6, y, STREET.z1, 100.2, 4.5, SS.z0, F_SOLID);
  const gt = P.prop(L, 66.2, y, 115.6, 0.35); gt.box(0, 0.05, 0, 7, 0.1, 2.4, 'metal', 0x6a6a64).box(0, 0.1, 0, 7, 0.06, 2.3, 'metalDark');
  for (const x of [63, 70]) L.box(x - 0.08, y, STREET.z1 + 0.22, x + 0.08, y + 2.6, STREET.z1 + 0.38, 'metalDark');
  // pylon sign
  L.box(55.9, y, 114.2, 56.3, y + 7.4, 114.6, 'metalDark');
  L.box(54.2, y + 5.2, 114.1, 58.0, y + 8.4, 114.7, 'metal', { tint: 0x1a2a4a });
  sign(L, 'STOR-SAFE\nSELF STORAGE', 56.1, y + 7.2, 114.05, 0, 3.6, 1.8, { bg: '#e86a10', fg: '#fff', glow: 1.3, lightColor: 0xff8030, lightIntensity: 7 });
  sign(L, 'CLIMATE CONTROLLED\n24 HR ACCESS · 1ST MONTH FREE', 56.1, y + 5.75, 114.05, 0, 3.6, 0.9, { bg: '#1a2a4a', fg: '#e8e8e0', glow: 0.8, light: false });
  sign(L, 'STOR-SAFE\nSELF STORAGE', 56.1, y + 7.2, 114.75, 0, 3.6, 1.8, { bg: '#e86a10', fg: '#fff', glow: 1.3, light: false });
  // rental truck, sedan, dollies, cart
  const rt = P.prop(L, 88.5, y, 116.2, Math.PI / 2 - 0.08);
  rt.box(0, 2.0, 1.0, 2.4, 2.8, 5.2, 'paintedWhite', 0xe8e4d8).box(0, 1.4, -2.5, 2.3, 1.8, 1.8, 'carPaint', 0xe86a10).box(0, 1.9, -3.42, 2.1, 0.7, 0.05, 'glassDirty', 0x1a2024);
  for (const sx of [-1.12, 1.12]) for (const sz of [-2.4, 0.2, 2.6]) rt.cyl(sx, 0.45, sz, 0.45, 0.3, 'rubber', 0x151515, [0, 0, Math.PI / 2], 14);
  rt.col(0, 1.6, 0, 2.5, 3.2, 7.2, 'metal');
  sign(L, 'HAUL-IT\nRENTALS', 88.5, y + 2.2, 114.93, 0, 3.2, 1.2, { bg: '#e8e4d8', fg: '#e86a10' });
  P.car(L, 78.5, y, 116.4, 0.05, { color: 0x3a4a5a });
  for (const [x, z, r] of [[61.2, 118.6, 0.3], [62.0, 118.4, -0.4]]) { const d = P.prop(L, x, y, z, r); d.box(0, 0.6, 0.15, 0.5, 1.2, 0.05, 'paintedRed', 0xb02a1a).box(0, 0.05, -0.1, 0.5, 0.05, 0.35, 'metalDark').col(0, 0.6, 0, 0.5, 1.2, 0.4, 'metal', F_SOLID | F_SHOOT); }
  P.dumpster(L, 97.2, y, 118.8, 0, 0x2a4a3a);
  P.streetLight(L, 74, y, 119.4, Math.PI, { on: true, intensity: 20, range: 16 });
  P.corpse(L, 72.8, y + 0.01, 117.2, 0.8, 0x6a5a3a); blood(L, 72.8, y, 117.2, 1.6, 4);
  L.reverb(50, 0, STREET.z1, 100, 10, SS.z0, 'outdoor');
}

function storSafe(L, game) {
  const { x0, z0, x1, z1 } = SS;
  const H = 4.2, y = SY;
  const wm = 'paintedWhite', wt = 0xd8d4c8;
  L.box(x0, 0, z0, x1, y, z1, 'concreteFloor', { tint: 0x8a8680 });
  L.box(x0 - 0.2, H, z0 - 0.2, x1 + 0.2, H + 0.3, z1 + 0.2, 'metal', { tint: 0x8a8e8e });
  // exterior walls (front storefront at the office, x 56..67)
  L.wallX(x0, x1, z0, 0, H, wm, 0.3, [{ a: 56, b: 62.4, y0: 1.1, y1: 3.2 }, { a: 62.4, b: 63.6, y0: y, y1: y + 2.25 }, { a: 63.6, b: 67, y0: 1.1, y1: 3.2 }], { tint: wt });
  for (let x = 56.8; x < 67; x += 1.4) if (x < 62.2 || x > 63.8) L.box(x - 0.66, 1.1, z0 - 0.03, x + 0.66, 3.2, z0 + 0.03, 'glassDirty', { flags: F_SOLID | F_SHOOT, tint: 0x5a7078 });
  L.wallX(x0, x1, z1, 0, H, wm, 0.3, [], { tint: wt });
  L.wallZ(z0 + 0.15, z1 - 0.15, x0, 0, H, wm, 0.3, [], { tint: wt });
  L.wallZ(z0 + 0.15, z1 - 0.15, x1, 0, H, wm, 0.3, [], { tint: wt });
  L.box(x0 - 0.2, H - 0.8, z0 - 0.21, x1 + 0.2, H - 0.3, z0 - 0.15, 'paintedRed', { collide: false, tint: 0xe86a10 });
  sign(L, 'STOR-SAFE', 60.5, 3.7, z0 - 0.25, 0, 3.2, 0.55, { bg: '#e86a10', fg: '#fff' });
  sign(L, 'OFFICE', 63, 2.75, z0 - 0.19, 0, 1.0, 0.3, { bg: '#1a2a4a', fg: '#fff' });
  for (const x of [72, 80, 88, 94]) sign(L, 'DRIVE-UP UNITS\n← SIDE ENTRANCE', x, 2.2, z0 - 0.17, 0, 1.6, 0.5, { bg: '#e8e0c8', fg: '#1a2a4a' });
  L.box(62.2, y + 2.25, z0 - 0.4, 63.8, y + 2.35, z0 + 0.2, 'metalDark', NC);
  L.light(63, y + 2.6, z0 - 1.0, 0xffd8a0, 7, 8, { flicker: 0.25 });
  new Door(L, 63, y, z0, 'x', { width: 1.2, hinge: 1, material: 'metalClean' });

  // --- office (x 54.3..68, z 120.3..127)
  const ox1 = 68, oz1 = 127;
  L.wallZ(z0 + 0.15, oz1, ox1, y, H, wm, 0.2, [{ a: 123.4, b: 124.6, y0: y, y1: y + 2.2 }], { tint: wt });
  L.wallX(x0 + 0.15, ox1 + 0.1, oz1, y, H, wm, 0.2, [], { tint: wt });
  L.box(x0 + 0.2, y - 0.01, z0 + 0.2, ox1 - 0.1, y + 0.005, oz1 - 0.1, 'linoleum', { collide: false, tint: 0x8a9098 });
  P.counter(L, 60.2, y, 124.3, 0, 4.2, 'plasticGloss');
  L.box(58.1, y, 124.0, 62.3, y + 0.92, 124.6, 'wood', { visible: false });
  shelving(L, 55.0, y, 122.4, -Math.PI / 2, 2.4, 2.0, 0.95);
  shelving(L, 55.0, y, 125.4, -Math.PI / 2, 2.2, 2.0, 0.9);
  sign(L, 'BOXES · TAPE · LOCKS\nMOVING SUPPLIES', 54.5, y + 2.5, 124, Math.PI / 2, 1.6, 0.5, { bg: '#e86a10', fg: '#fff' });
  const cc = P.prop(L, 60.6, y + 0.93, 124.5, 0);
  for (let i = 0; i < 4; i++) cc.box(-0.6 + i * 0.4, 0.2, 0, 0.36, 0.28, 0.28, 'plastic', 0x2a2a2a).box(-0.6 + i * 0.4, 0.2, -0.141, 0.3, 0.22, 0.005, 'emissiveCool', 0x4a5a6a);
  sign(L, 'CAM 3 — CORRIDOR C', 60.6, y + 1.5, 124.35, 0, 0.9, 0.12, { bg: '#1a1a1a', fg: '#7aff7a' });
  L.light(60.6, y + 1.4, 123.6, 0x8aa0c8, 2.5, 4, { flicker: 0.4 });
  const kb = P.prop(L, 67.8, y + 1.5, 121.4, -Math.PI / 2); kb.box(0, 0, 0, 0.8, 0.6, 0.1, 'metal', 0x9a9a94); for (let i = 0; i < 12; i++) kb.box(-0.3 + (i % 4) * 0.2, -0.18 + Math.floor(i / 4) * 0.18, -0.06, 0.03, 0.08, 0.01, 'chrome');
  cardboard(L, 57.4, y, 126.2, 0.3, 3); cardboard(L, 66.4, y, 126.2, -0.2, 2);
  poster(L, 'ad', 64.8, y + 1.6, 126.88, 0, 0.6, 0.85, { brand: ['STOR-SAFE', 'Your stuff. Safe. 24/7.', '#e86a10', '#ffffff'] });
  poster(L, 'missing', 67.88, y + 1.5, 126.2, Math.PI / 2, 0.45, 0.62, {});
  sign(L, 'RENT YOUR UNIT TODAY\n1ST MONTH FREE!', 61, y + 2.6, oz1 - 0.12, 0, 2.4, 0.6, { bg: '#e8e0c8', fg: '#e86a10' });
  const kp = P.prop(L, 67.88, y + 1.3, 125.0, -Math.PI / 2); kp.box(0, 0, 0, 0.14, 0.2, 0.04, 'plastic', 0x1a1a1a).box(0, 0.05, -0.021, 0.08, 0.04, 0.005, 'emissiveGreen');
  sign(L, 'TENANTS ONLY\nENTER CODE', 67.88, y + 1.9, 124.0, Math.PI / 2, 0.7, 0.3, { bg: '#1a2a4a', fg: '#fff' });
  graffiti(L, 'C-17\nIS SAFE\n→', 67.85, y + 1.5, 122.4, -Math.PI / 2, 1.1, 0.8, '#b8201a');
  P.corpse(L, 64.4, y + 0.01, 121.8, 1.9, 0x1a3a6a); blood(L, 64.4, y, 121.8, 1.6, 4);
  ceilingLight(L, 61, H, 122, { type: 'fluoro', intensity: 9, flicker: 0.3 });
  L.item('pills', 58.8, y + 0.94, 124.3, { chance: 0.6 });
  L.item('throwable', 66.8, y + 0.02, 121.0, { chance: 0.5 });
  new Door(L, ox1, y, 124.0, 'z', { width: 1.2, hinge: 1, material: 'metal', open: true });
  L.reverb(x0, y, z0, ox1, H, oz1, 'room');

  // --- corridors: C1 (x 68..71, z 120.3..151.7) and C2 (z 138.4..141.2, x 71..97.7)
  const c1a = 68, c1b = 71, c2a = 138.4, c2b = 141.2;
  const doorTint = 0xe86a10;
  const unitsW = [127.2, 130.6, 134.0, 137.4, 140.8, 144.2, 147.6]; // west of C1 (start z), 3.4 wide
  const unitsE = [123.7, 127.1, 130.5, 133.9];                   // east of C1 (north of C2)
  const unitsN = [77, 80.4, 83.8, 87.2, 90.6, 94.0];              // north of C2 (start x)
  const unitsS = [71, 74.4, 77.8, 81.2, 84.6, 88.0];              // south of C2
  const open = { W3: true, E2: true, N3: true, S2: true, S5: true };
  // west wall of C1 (from the office south wall), with roll-up doors
  L.wallZ(oz1, z1 - 0.15, c1a, y, H, 'metal', 0.2, unitsW.map((z, i) => (open['W' + (i + 1)] ? { a: z + 0.5, b: z + 2.9, y0: y + (i === 2 ? 0.45 : 0), y1: y + 2.5 } : null)).filter(Boolean), { tint: 0xb8bcbc });
  L.wallZ(z0 + 0.15, c2a, c1b, y, H, 'metal', 0.2, unitsE.map((z, i) => (open['E' + (i + 1)] ? { a: z + 0.5, b: z + 2.9, y0: y, y1: y + 2.5 } : null)).filter(Boolean), { tint: 0xb8bcbc });
  L.wallZ(c2b, z1 - 0.15, c1b, y, H, 'metal', 0.2, [], { tint: 0xb8bcbc });
  L.wallX(c1b, x1 - 0.15, c2a, y, H, 'metal', 0.2, unitsN.map((x, i) => (open['N' + (i + 1)] ? { a: x + 0.5, b: x + 2.9, y0: y, y1: y + 2.5 } : null)).filter(Boolean), { tint: 0xb8bcbc });
  L.wallX(c1b, x1 - 0.15, c2b, y, H, 'metal', 0.2, unitsS.map((x, i) => (open['S' + (i + 1)] ? { a: x + 0.5, b: x + 2.9, y0: y, y1: y + 2.5 } : null)).filter(Boolean).concat([{ a: 93.25, b: 95.85, y0: y, y1: y + 2.6 }]), { tint: 0xb8bcbc });
  L.box(c1a + 0.1, y - 0.01, oz1, c1b - 0.1, y + 0.005, z1 - 0.2, 'concreteFloor', { collide: false, tint: 0x6a6660 });
  L.box(c1b, y - 0.01, c2a + 0.1, x1 - 0.2, y + 0.005, c2b - 0.1, 'concreteFloor', { collide: false, tint: 0x6a6660 });
  for (const [a, b] of [[c1a + 0.1, c1b - 0.1]]) L.box(a + 1.15, y + 0.004, z0 + 1, a + 1.25, y + 0.008, z1 - 1, 'paintedYellow', { collide: false, tint: 0xd8b020 });
  L.box(c1b, y + 0.004, 139.75, x1 - 1, y + 0.008, 139.85, 'paintedYellow', { collide: false, tint: 0xd8b020 });
  L.box(c1a, H - 0.6, oz1, c1b, H - 0.58, z1 - 0.15, 'ceiling', NC);
  L.box(c1b, H - 0.6, c2a, x1 - 0.15, H - 0.58, c2b, 'ceiling', NC);
  // roll-up door faces (closed units) + unit numbers
  const rollFace = (cx, cz, axis, s, label, raised = 0) => {
    const w = 2.4, h = 2.4 - raised;
    if (axis === 'z') {
      const f = cx + s * 0.11;
      L.box(f, y + raised, cz - w / 2, f + s * 0.03, y + 2.4, cz + w / 2, 'paintedRed', { collide: false, tint: doorTint });
      for (let yy = y + raised + 0.12; yy < y + 2.4; yy += 0.16) L.box(f + s * 0.03, yy, cz - w / 2, f + s * 0.045, yy + 0.03, cz + w / 2, 'paintedRed', { collide: false, tint: 0x9a4a10 });
      L.box(f, y + 2.4, cz - w / 2 - 0.1, f + s * 0.12, y + 2.6, cz + w / 2 + 0.1, 'metalDark', NC);
      sign(L, label, f + s * 0.05, y + 2.85, cz, Math.PI / 2, 0.5, 0.22, { bg: '#1a2a4a', fg: '#fff' });
      if (!raised) L.box(f + s * 0.03, y + 0.2, cz - 0.1, f + s * 0.07, y + 0.32, cz + 0.1, 'chrome', NC);
    } else {
      const f = cz + s * 0.11;
      L.box(cx - w / 2, y + raised, f, cx + w / 2, y + 2.4, f + s * 0.03, 'paintedRed', { collide: false, tint: doorTint });
      for (let yy = y + raised + 0.12; yy < y + 2.4; yy += 0.16) L.box(cx - w / 2, yy, f + s * 0.03, cx + w / 2, yy + 0.03, f + s * 0.045, 'paintedRed', { collide: false, tint: 0x9a4a10 });
      L.box(cx - w / 2 - 0.1, y + 2.4, f, cx + w / 2 + 0.1, y + 2.6, f + s * 0.12, 'metalDark', NC);
      sign(L, label, cx, y + 2.85, f + s * 0.05, 0, 0.5, 0.22, { bg: '#1a2a4a', fg: '#fff' });
      if (!raised) L.box(cx - 0.1, y + 0.2, f + s * 0.03, cx + 0.1, y + 0.32, f + s * 0.07, 'chrome', NC);
    }
  };
  unitsW.forEach((z, i) => { const lab = 'A-' + String(i + 1).padStart(2, '0'); if (!open['W' + (i + 1)]) rollFace(c1a, z + 1.7, 'z', 1, lab); else sign(L, lab, c1a + 0.12, y + 2.85, z + 1.7, Math.PI / 2, 0.5, 0.22, { bg: '#1a2a4a', fg: '#fff' }); });
  unitsE.forEach((z, i) => { const lab = 'B-' + String(i + 1).padStart(2, '0'); if (!open['E' + (i + 1)]) rollFace(c1b, z + 1.7, 'z', -1, lab); else sign(L, lab, c1b - 0.12, y + 2.85, z + 1.7, Math.PI / 2, 0.5, 0.22, { bg: '#1a2a4a', fg: '#fff' }); });
  unitsN.forEach((x, i) => { const lab = 'C-' + String(i + 1).padStart(2, '0'); if (!open['N' + (i + 1)]) rollFace(x + 1.7, c2a, 'x', 1, lab); else sign(L, lab, x + 1.7, y + 2.85, c2a + 0.12, 0, 0.5, 0.22, { bg: '#1a2a4a', fg: '#fff' }); });
  unitsS.forEach((x, i) => { const lab = 'C-' + String(i + 11); if (!open['S' + (i + 1)]) rollFace(x + 1.7, c2b, 'x', -1, lab); else sign(L, lab, x + 1.7, y + 2.85, c2b - 0.12, 0, 0.5, 0.22, { bg: '#1a2a4a', fg: '#fff' }); });
  // W3: door jammed 0.45 m up — legs sticking out
  rollFace(c1a, unitsW[2] + 1.7, 'z', 1, '', 0.45);
  L.box(c1a - 0.1, y, unitsW[2] + 0.5, c1a + 0.1, y + 0.45, unitsW[2] + 2.9, 'metal', { visible: false });
  const legs = P.prop(L, c1a + 0.35, y, unitsW[2] + 1.6, 0); legs.box(0, 0.08, -0.12, 0.8, 0.14, 0.14, 'fabric', 0x2a3a5a).box(0, 0.08, 0.12, 0.7, 0.14, 0.14, 'fabric', 0x2a3a5a).box(0.44, 0.08, -0.12, 0.12, 0.12, 0.2, 'rubber', 0x1a1a1a);
  blood(L, c1a + 0.6, y, unitsW[2] + 1.6, 1.4, 4);
  // --- open units
  const unitBox = (ax0, az0, ax1, az1, tint = 0x9a9e9e) => {
    L.box(ax0, y - 0.01, az0, ax1, y + 0.005, az1, 'concreteFloor', { collide: false, tint: 0x5a5854 });
    return { ax0, az0, ax1, az1 };
  };
  // side walls for open units (corrugated partitions)
  const part = (a, b, c, d) => L.box(a, y, b, c, H - 0.6, d, 'metal', { tint: 0x9a9e9e });
  // E2 (x 71..77, z 127.1..130.5): a classic car under a tarp
  unitBox(71.1, 127.1, 77, 130.5); part(71.1, 127.0, 77, 127.1); part(71.1, 130.5, 77, 130.6); part(76.9, 127.1, 77, 130.5);
  const car = P.car(L, 74.2, y, 128.8, Math.PI / 2, { color: 0x7a1a14 });
  const tarp = P.prop(L, 74.8, y, 128.8, Math.PI / 2); tarp.box(0.4, 1.0, 0, 1.95, 0.9, 3.0, 'fabricBlue', 0x2a4a8a, [0.05, 0, 0.1]);
  cardboard(L, 76.4, y, 127.6, 0.2, 2);
  ceilingLight(L, 74, H - 0.6, 128.8, { type: 'bulb', intensity: 3, flicker: 0.6 });
  // N3 (x 83.8..87.2, z 132.4..138.4): hoarder unit
  unitBox(83.8, 132.4, 87.2, 138.3); part(83.7, 132.4, 83.8, 138.3); part(87.2, 132.4, 87.3, 138.3); part(83.8, 132.3, 87.2, 132.4);
  P.sofa(L, 85.5, y, 133.4, 0, 0x6a4a2a); P.dresser(L, 84.3, y, 136.3, Math.PI / 2); P.tv(L, 84.3, y + 1.0, 136.3, Math.PI / 2);
  cardboard(L, 86.6, y, 135.4, 0.3, 4); cardboard(L, 86.5, y, 136.9, -0.3, 3); P.bookshelf(L, 85.5, y, 132.6, Math.PI);
  const mq = P.prop(L, 84.7, y, 134.7, 0.6); mq.cyl(0, 0.9, 0, 0.14, 1.1, 'plasticGloss', 0xd8c8b0).sph(0, 1.6, 0, 0.12, 'plasticGloss', 0xd8c8b0).col(0, 0.8, 0, 0.3, 1.6, 0.3, 'plastic', F_SOLID | F_SHOOT);
  L.item('tier1', 85.6, y + 0.45, 133.4, { chance: 0.4 });
  // S2 (x 74.4..77.8, z 141.2..147.4): somebody's bug-out cache
  unitBox(74.4, 141.3, 77.8, 147.3); part(74.3, 141.3, 74.4, 147.4); part(77.8, 141.3, 77.9, 147.4); part(74.4, 147.3, 77.8, 147.4);
  P.sandbags(L, 76.1, y, 142.1, 0, 2.2, 2);
  const cot = P.prop(L, 75.0, y, 145.2, 0); cot.box(0, 0.42, 0, 0.7, 0.06, 1.9, 'fabric', 0x4a5a3a).col(0, 0.25, 0, 0.7, 0.5, 1.9, 'fabric', F_SOLID | F_SHOOT);
  shelving(L, 77.4, y, 145.2, Math.PI / 2, 2.4, 2.0, 0.95);
  P.radioTable(L, 76.2, y, 147.0, Math.PI);
  P.corpse(L, 76.3, y + 0.01, 144.2, 2.0, 0x3a4a2a); blood(L, 76.3, y, 144.2, 1.6, 4);
  sign(L, 'CAMP ALPHA\nGONE TO THE AIRPORT\nFLIGHTS AT DAWN — J.', 75.0, y + 1.8, 147.28, 0, 1.3, 0.6, { bg: '#f0ecd8', fg: '#1a1a1a' });
  L.item('tier2', 75.6, y + 0.5, 145.2, { chance: 0.6 });
  L.item('ammo', 76.8, y + 0.02, 143.4, {});
  L.item('health', 77.3, y + 0.9, 145.4, { chance: 0.5 });
  L.light(76, y + 1.2, 146.4, 0x9aff9a, 1.5, 3, { flicker: 0.3 });
  // S5 (x 84.6..88.0): band gear
  unitBox(84.6, 141.3, 88.0, 147.3); part(84.5, 141.3, 84.6, 147.4); part(88.0, 141.3, 88.1, 147.4); part(84.6, 147.3, 88.0, 147.4);
  const dk = P.prop(L, 86.3, y, 145.6, 0); dk.cyl(0, 0.3, 0, 0.3, 0.45, 'plasticGloss', 0xb81a14, [Math.PI / 2, 0, 0], 16).cyl(-0.5, 0.55, -0.2, 0.18, 0.2, 'plasticGloss', 0xb81a14, null, 14).cyl(0.5, 0.55, -0.2, 0.2, 0.25, 'plasticGloss', 0xb81a14, null, 14).cyl(0.6, 1.0, 0.2, 0.25, 0.01, 'chrome', 0xc8a040, null, 16).col(0, 0.4, 0, 1.4, 0.8, 1.0, 'wood', F_SOLID | F_SHOOT);
  for (const [x, z] of [[85.1, 142.4], [87.4, 142.2]]) { const a = P.prop(L, x, y, z, 0.3); a.box(0, 0.5, 0, 0.7, 1.0, 0.4, 'fabric', 0x1a1a1a).box(0, 0.6, -0.21, 0.6, 0.7, 0.01, 'fabric', 0x3a3a3a).col(0, 0.5, 0, 0.7, 1.0, 0.4, 'wood', F_SOLID | F_SHOOT); }
  graffiti(L, 'THE LAST\nFOUR\n(LIVE)', 86.3, y + 2.0, 147.28, 0, 1.4, 0.8, '#d8d8c8');
  L.item('melee', 87.4, y + 0.02, 146.6, { chance: 0.6 });
  // corridor dressing
  for (const [x, z, r] of [[69.5, 131.2, 0.3], [83.2, 139.5, 1.3]]) { const cart = P.prop(L, x, y, z, r); cart.box(0, 0.4, 0, 0.7, 0.05, 1.1, 'metalDark').box(0, 0.8, 0.5, 0.7, 0.8, 0.04, 'metalDark').col(0, 0.5, 0, 0.7, 1.0, 1.1, 'metal', F_SOLID | F_SHOOT); cardboard(L, x, y + 0.45, z - 0.1, r, 1); }
  P.corpse(L, 69.8, y + 0.01, 136.2, 0.3, 0x5a3a2a); blood(L, 69.8, y, 136.2, 1.4, 4);
  for (let i = 0; i < 7; i++) L.decal(69.5 + (rng() - 0.5), y + 0.013, 127 + i * 3.3, 0, 1, 0, 0.8, DF.SMEAR);
  for (let i = 0; i < 6; i++) blood(L, 72 + rng() * 24, y, 138.8 + rng() * 2, 0.8 + rng() * 0.6, i);
  graffiti(L, 'MOTION\nLIGHTS.\nKEEP\nMOVING', c1a + 0.12, y + 1.6, 150.3, Math.PI / 2, 1.3, 1.0, '#b8201a');
  sign(L, 'UNITS C-01 – C-17 →', c1b - 0.12, y + 2.5, 142.4, Math.PI / 2, 1.6, 0.3, { bg: '#1a2a4a', fg: '#fff' });
  sign(L, 'EXIT', c1a + 1.5, y + 2.7, z1 - 0.17, 0, 0.5, 0.2, { bg: '#1a6a2a', fg: '#fff', glow: 1.0, lightColor: 0x40ff60, lightIntensity: 2 });
  L.box(c1a + 0.9, y, z1 - 0.2, c1a + 2.1, y + 2.2, z1 - 0.16, 'metal', { collide: false, tint: 0x6a6a64 });
  sign(L, 'ALARMED', c1a + 1.5, y + 1.4, z1 - 0.15, 0, 0.5, 0.18, { bg: '#b81a14', fg: '#fff' });
  L.reverb(c1a, y, oz1, c1b, H, z1, 'hall');
  L.reverb(c1b, y, c2a, x1, H, c2b, 'hall');
  L.ambience(x0, y, z0, x1, H, z1, 'safe');
  // motion-sensor corridor lights: off until somebody walks under them
  const groups = [];
  const mk = (pts, box) => {
    for (const [x, z] of pts) L.box(x - 0.6, H - 0.64, z - 0.08, x + 0.6, H - 0.6, z + 0.08, 'emissiveCool', NC);
    const lights = [L.light((pts[0][0] + pts[1][0]) / 2, H - 0.8, (pts[0][1] + pts[1][1]) / 2, 0xd8ecff, 0, 11, { on: false, buzz: 1 })];
    const g = { lights, k: 0, on: false };
    groups.push(g);
    L.trigger(...box, () => { if (!g.on) { g.on = true; game.audio.play('buttonPress', { pos: new THREE.Vector3(pts[0][0], H - 0.8, pts[0][1]), vol: 0.5 }); } }, {});
    return g;
  };
  mk([[69.5, 128], [69.5, 134]], [c1a, y - 0.5, oz1, c1b, y + 3, 130]);
  mk([[69.5, 140], [69.5, 146.5]], [c1a, y - 0.5, 134, c1b, y + 3, 142]);
  mk([[76, 139.8], [83, 139.8]], [c1b, y - 0.5, c2a, 76, y + 3, c2b]);
  mk([[89.5, 139.8], [95.5, 139.8]], [80, y - 0.5, c2a, 89, y + 3, c2b]);
  L.dynamics.push({ update(dt) { for (const g of groups) { if (!g.on || g.k >= 1) continue; g.k = Math.min(1, g.k + dt * 1.5); const fl = g.k < 0.6 ? (Math.random() < 0.5 ? 0 : 1) : 1; for (const l of g.lights) { l.on = true; l.intensity = 10 * fl * g.k; } } } });
}

// ======================================================== SAFE ROOM C-17
function safeUnit(L, game) {
  const x0 = 91.4, x1 = SS.x1 - 0.15, z0 = 141.2, z1 = 147.9, y = SY, H = 3.4;
  L.wallZ(z0 + 0.1, z1, x0, y, SS.x1 === x1 ? H : H, 'metal', 0.2, [], { tint: 0x9a9e9e });
  L.wallX(x0 - 0.1, x1, z1, y, H, 'metal', 0.2, [], { tint: 0x9a9e9e });
  L.box(x0, H + 0.15, z0, x1, H + 0.2, z1, 'metal', { collide: false, tint: 0x7a7e7e });
  L.box(x0 + 0.1, y - 0.01, z0 + 0.1, x1, y + 0.005, z1 - 0.1, 'concreteFloor', { collide: false, tint: 0x6a6660 });
  const door = new RollupDoor(L, 94.55, y, z0, 'x', { width: 2.6, height: 2.6, safe: true, label: 'SAFE ROOM', open: true });
  L.endSafe = [x0 + 0.1, y - 0.2, z0 + 0.15, x1 - 0.05, y + H, z1 - 0.1];
  L.endDoor = door;
  L.flowEnd = [94.6, y, 145.4];
  sign(L, 'C-17', 94.55, y + 2.95, z0 - 0.13, 0, 0.5, 0.22, { bg: '#1a2a4a', fg: '#fff' });
  L.box(93.1, y + 2.62, z0 - 0.3, 96.0, y + 2.75, z0 + 0.1, 'metalDark', NC);
  // inside: supplies, cots, a lantern, the previous tenants' notes
  supplies(L, 94.6, y, z1 - 0.6, Math.PI, ['medkit', 'medkit', 'medkit', 'medkit'], { w: 2.4, mat: 'metalClean' });
  supplies(L, x1 - 0.6, y, 143.6, -Math.PI / 2, ['tier2', { type: 'tier1' }, 'ammo'], { w: 2.0, mat: 'woodDark' });
  L.item('pills', 92.0, y + 0.02, 146.9, { chance: 0.6 });
  for (const [x, z] of [[92.2, 144.2]]) { const cot = P.prop(L, x, y, z, 0); cot.box(0, 0.42, 0, 0.7, 0.06, 1.9, 'fabric', 0x4a5a3a).box(0, 0.5, 0.6, 0.5, 0.1, 0.4, 'fabric', 0xd8d4c8).col(0, 0.25, 0, 0.7, 0.5, 1.9, 'fabric', F_SOLID | F_SHOOT); }
  cardboard(L, 96.8, y, 146.8, 0.2, 3);
  const lan = P.prop(L, 94.4, y + 0.78, z1 - 0.55, 0); lan.cyl(0, 0.12, 0, 0.08, 0.24, 'plastic', 0x2a5a2a).cyl(0, 0.14, 0, 0.06, 0.12, 'emissiveWarm');
  L.light(94.4, y + 1.4, z1 - 1.2, 0xffd8a0, 8, 8, { flicker: 0.08 });
  L.box(94.0, H - 0.1, 144.5, 95.0, H - 0.05, 144.7, 'emissiveWarm', NC);
  L.light(94.5, H - 0.4, 144.6, 0xffe2b0, 7, 8, {});
  for (const [t, x, yy, z, ry, c] of [['C-17\nSAFE\nDON\'T OPEN\nFOR SCREAMS', x0 + 0.12, 1.7, 143.6, Math.PI / 2, '#b8201a'], ['AIRPORT →\nFOLLOW THE\nPOWER LINES', x0 + 0.12, 1.8, 146.4, Math.PI / 2, '#1a2a8a'], ['MIKE + ANA\nWAITED 3 DAYS', 96.2, 1.9, z1 - 0.12, 0, '#202020'], ['CONSTRUCTION\nSITE NEXT —\nGAS CANS ON THE\nBARRICADE', 92.8, 2.2, z1 - 0.12, 0, '#3a6a2a']]) graffiti(L, t, x, y + yy, z, ry, 1.4, 0.9, c);
  wallMessages(L, x1 - 0.1, y + 1.7, 145.4, -Math.PI / 2, 2.4, 1.2, { lines: ['STOR-SAFE C-17', 'LOCK ROLLS DOWN FROM INSIDE', 'WATER — 2 JUGS', 'BILL Z L F  WAS HERE?', 'POWER STATION → AIRPORT'], density: 0.7 });
  L.ambience(x0, y, z0, x1, y + H, z1, 'safe');
  L.reverb(x0, y, z0, x1, y + H, z1, 'safe');
  // "SAFE ROOM" painted outside, beside the door
  graffiti(L, 'SAFE\nROOM', 91.9, y + 1.6, z0 - 0.12, 0, 0.9, 0.7, '#e8e8d8', { style: 'stencil' });
  L.trigger(86, y - 0.5, 138.4, x1, y + 3, 141.2, () => {
    game.session.objective('Get inside unit C-17 and pull the door down');
    game.voice.script([{ who: 'louis', text: 'C-17! That\'s the safe unit — everybody in!', d: 0.2 }]);
  });
  return { door };
}

export function buildStreetAndStorage(L, game) {
  commerceStreet(L, game);
  lot(L, game);
  storSafe(L, game);
  return safeUnit(L, game);
}
