// Chapter 4 — lower hospital (floors 1-4 of the Mercy Hospital podium).
// Route: security-office safe room -> marble lobby atrium -> ER / triage
// (military quarantine checkpoint) -> radiology corridor -> stair A ->
// 2F patient ward (collapsed corridor, detour through patient rooms) -> hub ->
// atrium balcony -> ICU wing -> stair B -> 3F surgery (blocked hall, detour
// through the operating rooms) -> labs / pharmacy / isolation ward -> dark
// maintenance plant -> stair C -> 4F administration -> tower elevator lobby.
// Podium footprint x 0..96, z 0..60; floors at y 0 / 4 / 8 / 12.
import * as THREE from 'three';
import { ceilingLight, wallLamp, sign, graffiti, supplies, fireSource, physProp, P } from './kit.js';
import { Door } from '../world/dynamic.js';
import { DF } from '../render/decals.js';
import {
  FH, CH, rng, pickr, slab, ceil, finish, curtain, stairwell, extWallX, extWallZ, seatRow, bedside, monitorCart, shelfUnit, labBench, officeDesk, cubicle,
  wallTV, bloodTrail, scatterBlood, patientRoom, officeRoom, safeBox, workLight, rot, F_SOLID, F_SHOOT, F_SIGHT, F_DEFAULT,
} from './ch4_parts.js';

export const Y1 = 0, Y2 = 4, Y3 = 8, Y4 = 12;
const HW = 'plasterHosp';
const IT = 0.16; // interior wall thickness

// interior wall helpers (height = ceiling), door openings {at, w, door:{...}|false}
function wx(L, x0, x1, z, y, mat, doors = [], o = {}) {
  const h = o.h ?? CH;
  L.wallX(x0, x1, z, y, y + h, mat, o.t ?? IT, doors.map((d) => ({ a: d.at - (d.w ?? 1.1) / 2, b: d.at + (d.w ?? 1.1) / 2, y0: y + (d.y0 ?? 0), y1: y + (d.h ?? 2.2) })));
  const out = [];
  for (const d of doors) if (d.door !== false) out.push(new Door(L, d.at, y, z, 'x', { width: d.w ?? 1.1, hinge: d.hinge ?? 1, open: d.open, locked: d.locked, material: d.mat ?? 'paintedWhite' }));
  return out;
}
function wz(L, z0, z1, x, y, mat, doors = [], o = {}) {
  const h = o.h ?? CH;
  L.wallZ(z0, z1, x, y, y + h, mat, o.t ?? IT, doors.map((d) => ({ a: d.at - (d.w ?? 1.1) / 2, b: d.at + (d.w ?? 1.1) / 2, y0: y + (d.y0 ?? 0), y1: y + (d.h ?? 2.2) })));
  const out = [];
  for (const d of doors) if (d.door !== false) out.push(new Door(L, x, y, d.at, 'z', { width: d.w ?? 1.1, hinge: d.hinge ?? 1, open: d.open, locked: d.locked, material: d.mat ?? 'paintedWhite' }));
  return out;
}
// wainscot + chair rail along a corridor wall face (visual only), skipping
// door openings (gaps: centers, or [center, width]).
function spans(a0, a1, gaps) {
  const g = gaps.map((v) => (Array.isArray(v) ? [v[0] - v[1] / 2 - 0.1, v[0] + v[1] / 2 + 0.1] : [v - 0.66, v + 0.66])).sort((p, q) => p[0] - q[0]);
  const out = []; let c = a0;
  for (const [a, b] of g) { if (a > c) out.push([c, Math.min(a, a1)]); c = Math.max(c, b); }
  if (c < a1) out.push([c, a1]);
  return out;
}
function wainscotX(L, x0, x1, z, y, side, gaps = [], tint = 0x8aa09a) {
  const f = z + side * (IT / 2 + 0.006);
  for (const [a, b] of spans(x0, x1, gaps)) {
    L.box(a, y, Math.min(f, f + side * 0.01), b, y + 1.0, Math.max(f, f + side * 0.01), 'paintedWhite', { collide: false, tint });
    L.box(a, y + 1.0, Math.min(f, f + side * 0.03), b, y + 1.06, Math.max(f, f + side * 0.03), 'woodPale', { collide: false });
  }
}
function wainscotZ(L, z0, z1, x, y, side, gaps = [], tint = 0x8aa09a) {
  const f = x + side * (IT / 2 + 0.006);
  for (const [a, b] of spans(z0, z1, gaps)) {
    L.box(Math.min(f, f + side * 0.01), y, a, Math.max(f, f + side * 0.01), y + 1.0, b, 'paintedWhite', { collide: false, tint });
    L.box(Math.min(f, f + side * 0.03), y + 1.0, a, Math.max(f, f + side * 0.03), y + 1.06, b, 'woodPale', { collide: false });
  }
}
function fluoroRow(L, x0, x1, z, y, step, o = {}) {
  for (let x = x0; x <= x1 + 0.01; x += step) ceilingLight(L, x, y + CH, z, { type: 'fluoro', intensity: o.i ?? 10, range: o.r ?? 9, flicker: o.flick ? o.flick(x) : (rng() < 0.3 ? 0.7 : 0.15), on: o.on ? o.on(x) : rng() < 0.8 });
}
function fluoroCol(L, z0, z1, x, y, step, o = {}) {
  for (let z = z0; z <= z1 + 0.01; z += step) ceilingLight(L, x, y + CH, z, { type: 'fluoro', intensity: o.i ?? 10, range: o.r ?? 9, flicker: rng() < 0.3 ? 0.7 : 0.15, on: o.on ? o.on(z) : rng() < 0.8 });
}
const note = (L, text, x, y, z, ry, w = 1.2, h = 0.8, o = {}) => sign(L, text, x, y, z, ry, w, h, Object.assign({ bg: '#e8e4d0', fg: '#2a2a2a', font: 'Arial, sans-serif', weight: 'bold' }, o));
const warn = (L, text, x, y, z, ry, w = 1.6, h = 0.8) => sign(L, text, x, y, z, ry, w, h, { bg: '#d8b820', fg: '#111', border: '#111' });

export function buildLower(L, game, S) {
  // ======================================================== PODIUM SHELL
  // ground slab (whole footprint) + exterior walls per floor band
  L.box(0.2, -0.3, 0.2, 95.8, 0, 59.8, 'concreteFloor');
  const band = (y) => [y - 0.3, y + FH - 0.3];
  // north facade (z = 0)
  { const [a, b] = band(Y1); L.box(-0.2, a, -0.2, 96.2, b, 0.2, HW); }
  { const [a, b] = band(Y2); extWallX(L, -0.2, 96.2, 0, a, b, HW, [9.8, 16.6, 23.4, 30.2, 37, 44], { fy: Y2 }); }
  { const [a, b] = band(Y3); extWallX(L, -0.2, 96.2, 0, a, b, HW, [68, 80, 88], { fy: Y3 }); }
  { const [a, b] = band(Y4); extWallX(L, -0.2, 96.2, 0, a, b, HW, [4, 16, 24, 32], { fy: Y4 }); }
  // west facade (x = 0)
  { const [a, b] = band(Y1); extWallZ(L, 0.2, 59.8, 0, a, b, HW, [13, 19, 25, 36, 43, 50, 56], { fy: Y1 }); }
  for (const y of [Y2, Y3]) { const [a, b] = band(y); L.box(-0.2, a, 0.2, 0.2, b, 59.8, HW); }
  { const [a, b] = band(Y4); extWallZ(L, 0.2, 59.8, 0, a, b, HW, [5, 10], { fy: Y4 }); }
  // east facade (x = 96)
  { const [a, b] = band(Y1); L.box(95.8, a, 0.2, 96.2, b, 59.8, HW); }
  { const [a, b] = band(Y2); extWallZ(L, 0.2, 59.8, 96, a, b, HW, [35.5], { fy: Y2 }); }
  { const [a, b] = band(Y3); extWallZ(L, 0.2, 59.8, 96, a, b, HW, [20, 26, 32, 38], { fy: Y3 }); }
  { const [a, b] = band(Y4); L.box(95.8, a, 0.2, 96.2, b, 59.8, HW); }
  // south facade (z = 60): ER windows + ambulance bay, lobby curtain wall, safe room
  {
    const [a, b] = band(Y1);
    extWallX(L, -0.2, 11.5, 60, a, b, HW, [3.5, 8], { fy: Y1 });
    L.box(18.5, a, 59.8, 36, b, 60.2, HW);
    L.box(11.5, 3.0, 59.8, 18.5, b, 60.2, HW);
    L.box(72, a, 59.8, 96.2, b, 60.2, HW);
    // ambulance bay: sealed sliding glass doors
    L.box(11.5, 0, 59.9, 18.5, 3.0, 60.0, 'glassDirty', { tint: 0x7a8a88 });
    for (const x of [11.6, 15, 18.4]) L.box(x - 0.06, 0, 59.85, x + 0.06, 3.0, 60.05, 'metalDark', { collide: false });
    L.box(11.5, 2.9, 59.8, 18.5, 3.05, 60.2, 'metalDark', { collide: false });
    sign(L, 'AMBULANCE ENTRANCE', 15, 2.6, 59.78, Math.PI, 3.2, 0.32, { bg: '#b01a14', fg: '#fff' });
    for (const x of [22, 27, 32]) { L.box(x - 0.7, 1.25, 59.78, x + 0.7, 2.45, 59.8, 'glassDirty', { collide: false, tint: 0x28343a }); }
    const [a2, b2] = band(Y2); L.box(-0.2, a2, 59.8, 36, b2, 60.2, HW); extWallX(L, 72, 96.2, 60, a2, b2, HW, [76, 84], { fy: Y2 });
  }
  for (const y of [Y3, Y4]) { const [a, b] = band(y); L.box(-0.2, a, 59.8, 96.2, b, 60.2, HW); }
  // parapet + podium roof (hole where the elevator-lobby plenum rises into the tower base)
  L.box(-0.3, 15.7, -0.3, 96.3, 17.1, 0.25, 'concrete'); L.box(-0.3, 15.7, 59.75, 96.3, 17.1, 60.3, 'concrete');
  L.box(-0.3, 15.7, 0.25, 0.25, 17.1, 59.75, 'concrete'); L.box(95.75, 15.7, 0.25, 96.3, 17.1, 59.75, 'concrete');
  slab(L, 0.25, 0.25, 95.75, 59.75, 16.2, 'roof', [[42, 24, 66, 42]]);
  for (const [x, z] of [[12, 10], [22, 50], [86, 12], [88, 30], [8, 40]]) P.acUnit(L, x, 16.2, z, rng() * 3);
  for (const [x, z] of [[20, 20], [84, 50]]) { L.box(x - 1.5, 16.2, z - 1, x + 1.5, 16.7, z + 1, 'metalDark'); L.box(x - 1.4, 16.7, z - 0.9, x + 1.4, 16.75, z + 0.9, 'glassDirty', { tint: 0x405060 }); }

  // ================================================================= F1
  const y = Y1;
  // --- start safe room: hospital security office (x 72..82, z 52..59.8)
  const sr = safeBox(L, { x0: 72, z0: 52, x1: 82, z1: 59.8, y, h: CH, door: { wall: 'w', at: 55.4 }, wall: 'plasterBlue', floor: false, ceil: 'ceiling', hinge: -1,
    extra: { s: [{ a: 76.4, b: 77.6, y0: y, y1: y + 2.2 }] }, skip: [] });
  S.startDoor = sr.door;
  finish(L, 72, 52, 82, 59.8, y, 'tileFloor', 0x9a9890);
  // the door they came in through from the plaza (barred)
  new Door(L, 77, y, 59.8, 'x', { width: 1.1, locked: true, material: 'metalDark' });
  for (let i = 0; i < 4; i++) L.box(76.2, 0.5 + i * 0.45, 59.62 - (i % 2) * 0.02, 77.8, 0.62 + i * 0.45, 59.7 - (i % 2) * 0.02, 'wood', { collide: false, tint: 0x9a7a58 });
  P.filingCabinet(L, 78.6, y, 59.3, Math.PI);
  P.dresser(L, 75.2, y, 59.4, Math.PI, 'metalDark');
  graffiti(L, 'CAME IN\nTHIS WAY\nBARRED IT', 77, 2.75, 59.64, Math.PI, 1.3, 0.8, '#b8201a');
  // CCTV wall + desk
  const mon = [['CAM 01\nMAIN LOBBY', '#9ab8a8'], ['CAM 02\nEMERGENCY', '#c8a8a0'], ['CAM 07\nSTAIR A', '#9aa8b8'], ['CAM 12\nWARD 2', '#a8b0a0'], ['CAM 19\nSURGERY', '#b0a8a8'], ['NO SIGNAL', '#6a7a8a']];
  mon.forEach(([t, c], i) => {
    const mx = 81.84, mz = 53.2 + (i % 3) * 0.95, my = 1.35 + Math.floor(i / 3) * 0.66;
    L.box(81.7, my - 0.3, mz - 0.44, 81.9, my + 0.3, mz + 0.44, 'plastic', { collide: false, tint: 0x1a1a1a });
    sign(L, t, 81.69, my, mz, -Math.PI / 2, 0.8, 0.52, { bg: '#0e1612', fg: c, glow: 0.8, light: false, font: 'Courier New, monospace' });
  });
  L.light(80.6, 1.6, 54.2, 0x9ac8b0, 2.5, 4);
  const cd = P.prop(L, 80.9, y, 54.2, 0);
  cd.box(0, 0.74, 0, 1.2, 0.05, 2.8, 'woodPale').box(0, 0.37, 1.3, 1.1, 0.74, 0.1, 'woodPale').box(0, 0.37, -1.3, 1.1, 0.74, 0.1, 'woodPale');
  cd.box(-0.1, 0.8, 0.4, 0.4, 0.04, 0.16, 'plastic', 0x2a2a2a).box(0.2, 0.84, -0.6, 0.3, 0.1, 0.3, 'plastic', 0x3a3a3a);
  cd.col(0, 0.38, 0, 1.2, 0.78, 2.8, 'wood');
  P.officeChair(L, 79.8, y, 54.4, -Math.PI / 2);
  // lockers + gun cabinet
  for (let i = 0; i < 4; i++) { const lp = P.prop(L, 72.5 + 0.02, y, 52.6 + i * 0.55, -Math.PI / 2); lp.box(0, 0.95, 0, 0.52, 1.9, 0.5, 'paintedBlue', 0x4a5a6a).box(0, 1.6, -0.255, 0.3, 0.05, 0.01, 'metalDark').col(0, 0.95, 0, 0.52, 1.9, 0.5, 'metal'); }
  sign(L, 'SECURITY', 74.5, 2.7, 52.1, 0, 1.6, 0.35, { bg: '#1a2a4a', fg: '#e8e8e8' });
  note(L, 'ALL STAFF:\nTOWER ELEVATORS\nON FLOOR 4 STILL\nHAVE POWER', 72.1, 1.7, 57.9, Math.PI / 2, 1.0, 0.9);
  supplies(L, 75.5, y, 53.0, Math.PI, ['medkit', 'medkit', 'medkit', 'medkit'], { w: 2.0 });
  supplies(L, 78.6, y, 56.5, -Math.PI / 2, ['tier1', 'smg', 'pumpShotgun', 'tier1'], { w: 2.0, d: 0.9 });
  L.item('ammo', 80.9, 0.02, 57.8, {});
  L.item('pills', 81.0, 0.78, 55.2, { chance: 0.7 });
  L.item('pipebomb', 80.8, 0.78, 53.4, { chance: 0.5 });
  L.item('melee', 73.4, 0.02, 58.6, { chance: 0.6 });
  L.survivorStart.push({ x: 74.5, y, z: 55.0, yaw: Math.PI / 2 }, { x: 76.2, y, z: 55.8, yaw: Math.PI / 2 }, { x: 74.8, y, z: 57.0, yaw: 1.3 }, { x: 77.2, y, z: 54.4, yaw: 1.8 });
  L.flowStart = [75.5, y, 55.6];
  L.menuCam = { x: 64, y: 1.7, z: 56, yaw: 2.35, pitch: 0.05 };

  // --- LOBBY ATRIUM (x 36..72, z 30..59.8, double height)
  finish(L, 36, 30, 72, 59.8, y, 'marble');
  ceil(L, 36, 30, 72, 59.8, 7.6, 'ceiling');
  // walls
  L.wallZ(30, 59.8, 36, -0.3, 7.6, HW, 0.3, [{ a: 43, b: 48, y0: 0, y1: 3.0 }]);
  L.wallZ(30, 52, 72, -0.3, 7.6, HW, 0.3, [{ a: 41.85, b: 42.95, y0: 4, y1: 6.2 }]);
  L.wallZ(52, 59.8, 72, 3.4, 7.6, HW, 0.3);
  L.wallX(35.85, 72.15, 30, -0.3, 7.6, HW, 0.3, [{ a: 42.2, b: 44.8, y0: 4, y1: 6.4 }]);
  S.balconyDoor = new Door(L, 72, Y2, 42.4, 'z', { width: 1.1, material: 'paintedWhite', hinge: -1 });
  // curtain wall to the plaza
  L.box(36, 0, 59.9, 72, 7.6, 60.0, 'glassDirty', { tint: 0x8a9aa0 });
  for (let x = 36; x <= 72.01; x += 3) L.box(x - 0.08, 0, 59.82, x + 0.08, 7.6, 60.1, 'metalDark', { collide: false });
  for (const yy of [3.4, 7.3]) L.box(36, yy, 59.82, 72, yy + 0.3, 60.1, 'metalDark', { collide: false });
  L.box(36, 7.6, 59.8, 72, 7.7, 60.2, HW);
  L.box(47.6, 5.3, 30.15, 60.4, 6.9, 30.22, 'metalDark', { collide: false });
  sign(L, 'MERCY HOSPITAL', 54, 6.1, 30.24, 0, 12, 1.4, { bg: '#16202a', fg: '#eef2f0', font: 'Georgia, serif', glow: 1.1, lightColor: 0xc8dcff, lightIntensity: 7 });
  sign(L, '+', 46.2, 6.1, 30.2, 0, 1.3, 1.3, { fg: '#e02a20', glow: 1.8, light: false });
  sign(L, '+', 61.8, 6.1, 30.2, 0, 1.3, 1.3, { fg: '#e02a20', glow: 1.8, light: false });
  // columns
  for (const [cx, cz] of [[46, 41], [62, 41], [46, 51], [62, 51]]) L.box(cx - 0.45, 0, cz - 0.45, cx + 0.45, 7.6, cz + 0.45, 'marble', { tint: 0xd8d4cc });
  // balconies (y = 4): north, west, east; railings straddle the slab edge
  const balc = [[36, 30, 72, 34], [36, 34, 40, 48], [68, 34, 72, 48]];
  for (const [a, b, c, d] of balc) { L.box(a, 3.4, b, c, 3.7, d, 'ceiling'); L.box(a, 3.7, b, c, 4.0, d, 'marble', { tint: 0xc8c4bc }); }
  const rail = (x0, z0, x1, z1) => {
    L.box(x0, Y2, z0, x1, Y2 + 1.05, z1, 'glass', { flags: F_SOLID | F_SHOOT, tint: 0xb0c8c8 });
    L.box(x0 - 0.02, Y2 + 1.0, z0 - 0.02, x1 + 0.02, Y2 + 1.1, z1 + 0.02, 'metalClean', { collide: false });
  };
  rail(40, 33.9, 68, 34.1); rail(39.9, 34.1, 40.1, 48); rail(36, 47.9, 39.9, 48.1); rail(67.9, 34.1, 68.1, 48); rail(68.1, 47.9, 72, 48.1);
  L.box(39.95, 3.4, 34, 40.05, 4.0, 48.1, 'paintedWhite', { collide: false }); L.box(40, 3.4, 33.95, 68, 4.0, 34.05, 'paintedWhite', { collide: false });
  L.box(67.95, 3.4, 34, 68.05, 4.0, 48.1, 'paintedWhite', { collide: false });
  L.box(36, 3.4, 47.95, 40, 4.0, 48.05, 'paintedWhite', { collide: false }); L.box(68, 3.4, 47.95, 72, 4.0, 48.05, 'paintedWhite', { collide: false });
  // reception desk + information
  P.receptionDesk(L, 54, y, 42.5, Math.PI, 7);
  P.receptionDesk(L, 50.1, y, 40.8, Math.PI / 2, 2.6);
  P.receptionDesk(L, 57.9, y, 40.8, -Math.PI / 2, 2.6);
  for (const x of [52.2, 55.8]) { P.desk(L, x, y, 41.4, 0, true); P.officeChair(L, x, y, 40.6, 0.3); }
  sign(L, 'INFORMATION', 54, 3.0, 42.55, 0, 2.6, 0.45, { bg: '#1a3a5a', fg: '#fff', glow: 0.6, light: false });
  L.box(52.6, 2.75, 42.48, 55.4, 3.25, 42.53, 'metalDark', { collide: false });
  for (const x of [52.8, 55.2]) L.box(x - 0.01, 3.25, 42.5, x + 0.01, 7.6, 42.52, 'metalDark', { collide: false });
  L.item('pills', 53.2, 1.17, 42.6, { chance: 0.7 });
  L.item('pipebomb', 56.8, 1.17, 42.6, { chance: 0.5 });
  // waiting area
  for (const [x, z, r] of [[42, 51.5, 0], [42, 54.5, 0], [42, 57.4, Math.PI], [66, 51.5, 0], [66, 54.5, 0], [66, 57.4, Math.PI]]) seatRow(L, x, y, z, r, 6, pickr([0x3a5a7a, 0x3a6a5a, 0x5a3a3a]));
  for (const [x, z] of [[37, 58.6], [71, 58.6], [37, 31.2], [71, 31.2]]) P.planter(L, x, y, z, 0.45);
  // directory boards
  const dir = 'DIRECTORY\n1  Emergency · Radiology\n2  Wards · Intensive Care\n3  Surgery · Labs · Pharmacy\n4  Administration\n     TOWER ELEVATORS';
  sign(L, dir, 46, 1.9, 41.47, 0, 1.5, 1.4, { bg: '#20303a', fg: '#e8f0f0', font: 'Arial, sans-serif', weight: 'bold', w: 512, h: 512 });
  sign(L, dir, 45.47, 1.9, 51, -Math.PI / 2, 1.5, 1.4, { bg: '#20303a', fg: '#e8f0f0', font: 'Arial, sans-serif', weight: 'bold', w: 512, h: 512 });
  sign(L, 'EMERGENCY', 36.17, 3.35, 45.5, Math.PI / 2, 3.0, 0.5, { bg: '#b01a14', fg: '#fff', glow: 0.9, lightColor: 0xff3020, lightIntensity: 3 });
  // lobby elevators (dead) on the north wall, below the balcony
  for (const x of [52, 56]) {
    L.box(x - 0.8, 0, 30.16, x + 0.8, 2.3, 30.2, 'metalClean', { collide: false, tint: 0xb0b4b4 });
    L.box(x - 0.01, 0, 30.2, x + 0.01, 2.3, 30.22, 'blackMatte', { collide: false });
    L.box(x - 0.95, 2.3, 30.15, x + 0.95, 2.45, 30.22, 'metalClean', { collide: false });
  }
  sign(L, 'OUT OF SERVICE\nUSE TOWER ELEVATORS - FLOOR 4', 54, 1.45, 30.24, 0, 1.7, 0.5, { bg: '#e8e0c8', fg: '#8a1010', font: 'Arial, sans-serif' });
  new Door(L, 66, y, 30, 'x', { width: 1.1, locked: true, material: 'paintedWhite' });
  sign(L, 'STAFF ONLY', 66, 2.5, 30.17, 0, 1.0, 0.25, { bg: '#e8e8e0', fg: '#333' });
  // military presence: sandbagged entrance, cots, body bags
  P.sandbags(L, 54, y, 58.2, 0, 7.5, 4);
  P.sandbags(L, 49.5, y, 57.2, Math.PI / 2, 2.2, 3);
  P.sandbags(L, 58.5, y, 57.2, Math.PI / 2, 2.2, 3);
  P.barricade(L, 54, y, 56.4, 0);
  sign(L, 'QUARANTINE IN EFFECT\nNO ENTRY - NO EXIT\nBY ORDER OF THE STATE\nHEALTH AUTHORITY', 54, 2.2, 59.78, Math.PI, 3.2, 1.6, { bg: '#d8c030', fg: '#101010', border: '#101010', w: 512, h: 256 });
  for (let i = 0; i < 5; i++) P.bodyBag(L, 69.8, y + 0.01, 33 + i * 2.3, Math.PI / 2 + (rng() - 0.5) * 0.2);
  for (let i = 0; i < 3; i++) P.bodyBag(L, 38.4 + i * 1.0, y + 0.01, 33.5, (rng() - 0.5) * 0.2);
  P.gurney(L, 48, y, 47, 0.4);
  P.corpse(L, 48, 0.9, 47, 0.4, 0xd8dcd8);
  P.wheelchair(L, 59, y, 46, 2.3);
  P.wheelchair(L, 44, y, 36, 0.8);
  P.gurney(L, 63, y, 36, 1.2, false);
  P.papers(L, 54, 0.01, 46, 6, 24);
  P.corpse(L, 60.5, 0.01, 44.2, 2.4, 0x2a3a4a);
  L.decal(60.5, 0.012, 44.2, 0, 1, 0, 1.8, DF.POOL);
  bloodTrail(L, 60, 45, 47, 46, y, 9);
  bloodTrail(L, 46, 46, 37, 45.5, y, 6);
  scatterBlood(L, 38, 32, 70, 58, y, 6);
  graffiti(L, 'THEY BROUGHT\nTHE SICK HERE', 36.17, 1.8, 36, Math.PI / 2, 2.4, 0.9, '#b8201a');
  graffiti(L, 'CHOPPERS\nLAND ON\nTHE ROOF', 71.83, 1.8, 40, -Math.PI / 2, 2.0, 1.1, '#1a2a8a');
  // lighting: dim hanging lights, emergency glow, daylight-less glass
  for (const [lx, lz, on, f] of [[46, 46, true, 0.3], [62, 46, true, 0.1], [54, 54, true, 0.5], [54, 36.5, true, 0.2]]) ceilingLight(L, lx, 7.6, lz, { type: 'cage', intensity: 18, range: 17, on, flicker: f });
  // warm wash under the balconies
  for (const [x0, z0, x1, z1] of [[40.2, 33.7, 67.8, 33.8], [39.7, 34, 39.8, 47.8], [68.2, 34, 68.3, 47.8]]) L.box(x0, 3.36, z0, x1, 3.4, z1, 'emissiveWarm', { collide: false, tint: 0x9a8a70 });
  L.light(54, 3.0, 36, 0xffd8a0, 8, 12, { flicker: 0.05 }); L.light(38.5, 3.0, 41, 0xffd8a0, 6, 9); L.light(69.5, 3.0, 41, 0xffd8a0, 6, 9);
  L.light(54, 2.8, 57.5, 0xffa060, 6, 9, { flicker: 0.2 });
  wallLamp(L, 36.2, 2.6, 54, 1, 0, 0xff2010, 4, 6);
  wallLamp(L, 71.8, 2.6, 36, -1, 0, 0xff2010, 4, 6);
  L.reverb(36, 0, 30, 72, 7.6, 59.8, 'hall');
  L.ambience(36, 0, 30, 72, 7.6, 59.8, 'hospital');
  L.trigger(56, 0, 44, 71, 3, 58, () => { game.voice.script([{ who: 'zoey', text: 'God... they were treating people right here.', d: 0.5 }, { who: 'bill', text: 'Elevators are on four. Stairs are through the E.R.', d: 3 }]); });

  // --- ER / TRIAGE (x 0.2..36, z 30..59.8)
  finish(L, 0.2, 30, 36, 59.8, y, 'linoleumBlue');
  ceil(L, 0.2, 30, 36, 59.8, CH, 'ceiling');
  wx(L, 0.2, 36, 30, y, HW, [{ at: 1.9, mat: 'paintedWhite', open: true }]);
  for (const [cx, cz] of [[12, 38], [24, 38], [12, 52], [24, 52]]) L.box(cx - 0.3, 0, cz - 0.3, cx + 0.3, CH, cz + 0.3, HW);
  sign(L, 'EMERGENCY DEPARTMENT', 18, 3.05, 30.1, 0, 4, 0.45, { bg: '#b01a14', fg: '#fff' });
  // triage bays along the north wall (x 4..30) and south wall (x 20..34)
  for (let i = 0; i < 8; i++) {
    const bx = 5.5 + i * 3.1, bz = 32.6;
    if (i % 3 !== 1) P.gurney(L, bx, y, bz, (rng() - 0.5) * 0.3, rng() < 0.7); else P.bed(L, bx, y, bz, Math.PI, 0xd8dcd8, true);
    curtain(L, bx + 1.55, y, bz + 0.2, Math.PI / 2, 4.2, 0.4 + rng() * 0.5);
    if (i % 2 === 0) P.ivStand(L, bx + 0.8, y, bz - 1.2);
    if (i % 3 === 0) monitorCart(L, bx - 0.9, y, bz - 1.3, Math.PI, rng() < 0.5);
    if (rng() < 0.35) { P.corpse(L, bx, 0.92, bz, Math.PI + (rng() - 0.5) * 0.3, 0x8aa0b0); }
    L.box(bx - 1.5, 2.9, 34.8, bx + 1.5, 2.93, 34.83, 'metalClean', { collide: false });
  }
  for (let i = 0; i < 5; i++) {
    const bx = 21 + i * 3.1, bz = 57.2;
    P.gurney(L, bx, y, bz, (rng() - 0.5) * 0.3, true);
    curtain(L, bx - 1.55, y, bz - 0.2, Math.PI / 2, 4.2, 0.3 + rng() * 0.6);
    if (rng() < 0.4) P.corpse(L, bx, 0.92, bz, (rng() - 0.5) * 0.3, 0xd8d8d0);
  }
  // nurse station island
  const ns = P.prop(L, 17, y, 43.5, 0);
  ns.box(0, 0.55, -1.2, 5, 1.1, 0.5, 'woodPale', 0xc8c0b0).box(0, 1.12, -1.25, 5.1, 0.05, 0.7, 'marble');
  ns.box(-2.3, 0.55, 0, 0.5, 1.1, 2.9, 'woodPale', 0xc8c0b0).box(2.3, 0.55, 0, 0.5, 1.1, 2.9, 'woodPale', 0xc8c0b0);
  ns.col(0, 0.58, -1.2, 5, 1.16, 0.6, 'wood').col(-2.3, 0.58, 0, 0.6, 1.16, 2.9, 'wood').col(2.3, 0.58, 0, 0.6, 1.16, 2.9, 'wood');
  P.desk(L, 16, y, 43.9, Math.PI, true); P.desk(L, 18.2, y, 43.9, Math.PI, true);
  P.medCabinet(L, 17, y, 45.1, Math.PI);
  sign(L, 'TRIAGE', 17, 2.6, 42.28, 0, 1.4, 0.4, { bg: '#1a4a3a', fg: '#fff' });
  L.item('medkit', 15.2, 1.17, 42.35, { chance: 0.75 });
  L.item('health', 18.8, 1.17, 42.4, { chance: 0.6 });
  L.item('pills', 17, 0.02, 44.5, { chance: 0.5 });
  // military body processing: rows of bags + tagged gurneys
  for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) P.bodyBag(L, 23 + i * 1.05, y + 0.01, 45.5 + r * 2.4, (rng() - 0.5) * 0.15);
  warn(L, 'INFECTED\nREMAINS', 24, 1.5, 51.68, Math.PI, 0.58, 0.4);
  // decon tent (fabric canopy) near the west wall
  { const tp = P.prop(L, 6.5, y, 47, 0); tp.box(0, 2.5, 0, 5.0, 0.05, 4.4, 'fabric', 0x4a5a3a); for (const sx of [-2.45, 2.45]) for (const sz of [-2.15, 2.15]) tp.box(sx, 1.25, sz, 0.06, 2.5, 0.06, 'metalDark'); tp.box(-2.48, 1.5, 0, 0.02, 2.0, 4.4, 'fabric', 0x3a4a2e); tp.box(0, 1.5, 2.18, 5.0, 2.0, 0.02, 'fabric', 0x3a4a2e); tp.col(-2.48, 1.25, 0, 0.1, 2.5, 4.4, 'fabric').col(0, 1.25, 2.18, 5.0, 2.5, 0.1, 'fabric'); }
  sign(L, 'DECONTAMINATION', 6.5, 2.3, 44.78, Math.PI, 2.0, 0.35, { bg: '#d8c030', fg: '#111' });
  P.barrel(L, 4.6, y, 45.5, 0xa89a2a, false); P.barrel(L, 5.4, y, 45.2, 0xa89a2a, false);
  P.gurney(L, 7.5, y, 47.5, 0.1, true);
  // checkpoint at the lobby opening (x 30..36, z 43..48)
  P.sandbags(L, 33.5, y, 42.2, 0, 3.4, 4); P.sandbags(L, 33.5, y, 48.8, 0, 3.4, 4);
  P.fenceChain(L, 30.4, 38, 30.4, 42.0, y, 2.6); P.fenceChain(L, 30.4, 49.0, 30.4, 54, y, 2.6);
  const ck = P.prop(L, 31.6, y, 51.3, Math.PI / 2); ck.box(0, 0.74, 0, 1.8, 0.05, 0.8, 'metalDark').box(0, 0.37, 0, 1.7, 0.72, 0.7, 'metal', 0x4a5a3a).col(0, 0.38, 0, 1.8, 0.78, 0.8, 'metal');
  L.item('tier2', 31.3, 0.8, 51.0, { group: 'erT2a' }); L.item('tier2', 31.3, 0.8, 51.8, { group: 'erT2b' });
  L.item('ammo', 33.0, 0.02, 49.6, {});
  L.item('molotov', 31.8, 0.8, 50.5, { chance: 0.6 });
  workLight(L, 34.8, y, 50.2, Math.PI * 0.75, { intensity: 14, range: 12, color: 0xf0f4ff });
  sign(L, 'CHECKPOINT\nALL PERSONS WILL BE SCREENED', 30.47, 2.1, 40, Math.PI / 2, 2.0, 0.7, { bg: '#d8c030', fg: '#111', border: '#111' });
  P.crate(L, 34.8, y, 53.5, 0.2, 1, 'woodDark'); P.crate(L, 34.9, y, 54.4, 0.1, 0.8, 'woodDark');
  physProp(L, 'oxygen', 9.5, y, 31.2); physProp(L, 'oxygen', 10.0, y, 31.1);
  for (const [lx, lz, on] of [[6, 36, true], [18, 36, true], [30, 36, true], [6, 48, true], [18, 48, true], [30, 48, false], [12, 56, true], [26, 56, true]]) ceilingLight(L, lx, CH, lz, { type: 'fluoro', intensity: 13, range: 12, on, flicker: rng() < 0.5 ? 0.6 : 0.1 });
  wallLamp(L, 0.25, 2.6, 34, 1, 0, 0xff2010, 3, 5);
  scatterBlood(L, 2, 32, 34, 58, y, 8);
  bloodTrail(L, 26, 44, 5, 33, y, 10);
  graffiti(L, 'DONT LET THEM\nTAG YOU', 12.3, 1.7, 52, -Math.PI / 2, 1.4, 0.7, '#202020');
  L.reverb(0.2, 0, 30, 36, CH, 59.8, 'hall');
  L.ambience(0.2, 0, 30, 36, CH, 59.8, 'hospital');
  L.witchSpots.push({ x: 11, y, z: 55.5 });

  // --- F1 corridor (x 0.2..3.2, z 9.2..30) + radiology + supply
  finish(L, 0.2, 9.2, 14, 30, y, 'linoleum');
  ceil(L, 0.2, 9.2, 14, 30, CH, 'ceiling');
  wz(L, 9.2, 30, 3.2, y, HW, [{ at: 14.6, open: false }, { at: 25, hinge: -1 }]);
  wx(L, 6.55, 14, 9.2, y, HW); wz(L, 9.2, 20, 14, y, HW); wx(L, 3.2, 14, 20, y, HW); wz(L, 20, 30, 9, y, HW);
  wainscotZ(L, 9.4, 29.8, 3.2, y, -1, [14.6, 25]);
  fluoroCol(L, 12, 28, 1.7, y, 8, { i: 9 });
  sign(L, 'RADIOLOGY', 3.1, 2.55, 14.6, -Math.PI / 2, 1.4, 0.3, { bg: '#e8e8e0', fg: '#1a3a6a' });
  sign(L, 'STAIRS  ▲', 1.8, 2.7, 9.37, 0, 1.2, 0.3, { bg: '#1a6a3a', fg: '#fff', glow: 0.7, light: false });
  // radiology: x-ray table, lightboxes, booth
  { const xr = P.prop(L, 8.5, y, 14.6, 0); xr.box(0, 0.45, 0, 0.9, 0.9, 2.2, 'paintedWhite', 0xd8d8d0).box(0, 0.95, 0, 0.95, 0.08, 2.3, 'plastic', 0xe8e8e8).box(1.2, 1.2, -0.3, 0.3, 2.4, 0.3, 'paintedWhite').box(0.6, 2.2, -0.3, 1.2, 0.3, 0.4, 'paintedWhite').box(0.1, 1.9, -0.3, 0.5, 0.5, 0.5, 'plastic', 0x3a3a3a); xr.col(0, 0.5, 0, 0.95, 1.0, 2.3, 'metal').col(1.2, 1.2, -0.3, 0.35, 2.4, 0.35, 'metal'); }
  for (let i = 0; i < 3; i++) L.box(13.9 - 0.02, 1.4, 11 + i * 1.0, 13.92, 2.0, 11.8 + i * 1.0, 'emissiveCool', { collide: false, tint: 0x5a6a70 });
  L.box(4.5, y, 17.2, 7.2, 1.1, 17.4, 'paintedWhite'); L.box(4.5, 1.1, 17.25, 7.2, 2.3, 17.35, 'glassDirty', { tint: 0x5a7070 });
  ceilingLight(L, 8.5, CH, 14.6, { type: 'fluoro', intensity: 8, flicker: 0.8 });
  P.corpse(L, 6, 0.01, 12, 1.2, 0x8aa0b0); L.decal(6, 0.012, 12, 0, 1, 0, 1.3, DF.POOL);
  // supply closet
  shelfUnit(L, 8.6, y, 24, -Math.PI / 2, 2.6, 2.0, { small: true, colors: [0xeeeeea, 0xd8e2ea, 0xd0e0d0, 0xe8dcc0, 0xd89a60, 0x9ab8d8, 0xe0c8c8] });
  shelfUnit(L, 6, y, 29.6, 0, 2.8, 2.0, { small: true, colors: [0xeeeeea, 0xd8e2ea, 0xd0e0d0, 0xe8dcc0, 0xd89a60, 0x9ab8d8, 0xe0c8c8] });
  P.medCabinet(L, 3.8, y, 22, Math.PI / 2);
  L.item('pills', 8.5, 0.78, 23.4, { chance: 0.6 });
  L.item('medkit', 6.4, 1.37, 29.5, { chance: 0.5 });
  L.item('throwable', 8.5, 1.37, 24.8, { chance: 0.6 });
  ceilingLight(L, 6, CH, 25, { type: 'bulb', intensity: 7, flicker: 0.3 });
  L.reverb(0.2, 0, 9.2, 3.2, CH, 30, 'room');
  L.ambience(0.2, 0, 9.2, 14, CH, 30, 'hospital');

  // --- STAIR A (F1 -> F2)
  const sA = stairwell(L, { x0: 0.4, z0: 0.4, x1: 6.4, z1: 9.2, y: Y1, entry: 's', first: 'w', ground: false, labels: ['1', '2'], lowOpen: true });
  graffiti(L, 'UP ↑', 1.9, 1.6, 0.58, 0, 1.0, 0.5, '#d8d8c8');

  // ================================================================= F2
  const y2 = Y2;
  slab(L, 0.2, 0.2, 48, 21, y2, 'concreteFloor', [[0.25, 0.25, 6.55, 9.35]]);
  ceil(L, 0.2, 0.2, 48, 21, y2 + CH, 'ceiling', [[0.25, 0.25, 6.55, 9.35]]);
  // ER ceiling support above (keeps the F1 ceiling from being a paper-thin shell)
  slab(L, 0.2, 30, 36, 59.8, y2, 'concreteFloor');
  finish(L, 0.2, 9.2, 40, 12, y2, 'linoleumBlue');
  finish(L, 0.2, 12, 40, 21, y2, 'linoleum');
  finish(L, 6.4, 0.2, 40, 9.2, y2, 'linoleum');
  // corridor walls with patient-room doors
  const northRooms = [[6.55, 13.2], [13.2, 20], [20, 26.8], [26.8, 33.6], [33.6, 40]];
  const southRooms = [[0.2, 8], [8, 16], [16, 24], [24, 32], [32, 40]];
  wx(L, 6.55, 40, 9.2, y2, HW, [11.9, 18.7, 20.9, 32.3, 38.7].map((at, i) => ({ at, open: i === 1 || i === 3, locked: i === 2 || i === 4, hinge: -1 })));
  wx(L, 0.2, 40, 12, y2, HW, [{ at: 4.2, open: true }, { at: 12.4, locked: true }, { at: 18.4, open: true }, { at: 29.6, open: true }, { at: 36.2 }]);
  for (const [a] of northRooms.slice(1)) wz(L, 0.2, 9.2, a, y2, HW);
  for (const [a] of southRooms.slice(1)) if (a !== 24) wz(L, 12, 21, a, y2, HW);
  // blasted wall between rooms 2S-3 and 2S-4 (the detour)
  L.wallZ(12, 21, 24, y2, y2 + CH, HW, IT, [{ a: 15.2, b: 17.6, y0: y2, y1: y2 + 2.4 }]);
  P.debris(L, 24.6, y2, 16.4, 0.7, 'plasterHosp', 9); P.debris(L, 23.4, y2, 16.2, 0.5, 'plasterHosp', 6);
  L.decal(23.9, y2 + 1.3, 17.9, -1, 0, 0, 1.3, DF.SCORCH, { noRoll: true });
  wx(L, 0.2, 48, 21, y2, HW, [{ at: 43.5, w: 2.6, h: 2.6, door: false }]);
  wainscotX(L, 6.6, 40, 9.2, y2, 1, [11.9, 18.7, 20.9, 32.3, 38.7]); wainscotX(L, 0.2, 40, 12, y2, -1, [4.2, 12.4, 18.4, 29.6, 36.2]);
  // collapsed corridor (x 21.5..26.5): fallen ceiling slabs, burning debris
  L.box(21.4, y2, 9.3, 26.6, y2 + 1.1, 11.9, 'concrete', { tint: 0x6a6660 });
  L.box(22.4, y2 + 1.1, 9.3, 25.4, y2 + 2.1, 11.9, 'concrete', { tint: 0x5a5650 });
  L.box(21.2, y2 + 2.1, 9.3, 26.8, y2 + CH, 11.9, 'plasterDirty', { tint: 0x4a4440, flags: F_SOLID | F_SIGHT });
  P.debris(L, 20.5, y2, 10.6, 1.0, 'concrete', 10); P.debris(L, 27.5, y2, 10.6, 0.9, 'ceiling', 8);
  steelBeamPile(L, 21, 27, 10.6, y2);
  fireSource(L, 20.6, y2, 10.6, 0.8, { hazard: true });
  L.decal(24, y2 + CH - 0.01, 10.6, 0, -1, 0, 5, DF.SCORCH);
  L.decal(19.9, y2 + 1.5, 9.29, 0, 0, 1, 2.2, DF.SCORCH, { noRoll: true });
  graffiti(L, 'CEILING\nCAME DOWN\nGO THRU ROOMS', 19.2, 1.8 + y2, 11.9, Math.PI, 1.6, 0.9, '#d8d8c8');
  // patient rooms
  northRooms.forEach(([a, b], i) => patientRoom(L, a, 0.2, b, 9.2, y2, { far: 'n', beds: 2, lightOn: i !== 4, corpse: 0.3, items: i === 0 ? [{ type: 'pills', x: a + 1.2, z: 1.2, dy: 0.82 }] : i === 2 ? [{ type: 'melee', x: a + 3, z: 5 }] : i === 3 ? [{ type: 'health', x: b - 1, z: 1.2, dy: 0.82 }] : [] }));
  southRooms.forEach(([a, b], i) => patientRoom(L, a, 12, b, 21, y2, { far: 's', beds: i === 2 || i === 3 ? 1 : 2, lightOn: i !== 1, corpse: i === 2 ? 0.8 : 0.3, items: i === 0 ? [{ type: 'throwable', x: a + 1.5, z: 20.4 }] : i === 4 ? [{ type: 'pills', x: b - 1.2, z: 20.4, dy: 0.82 }] : [] }));
  fluoroRow(L, 4, 38, 10.6, y2, 6, { i: 9, on: (x) => x < 17 || x > 29 });
  sign(L, 'WARD 2 WEST', 8, y2 + 2.7, 11.9, Math.PI, 1.8, 0.35, { bg: '#1a3a6a', fg: '#fff' });
  sign(L, '2', 4.9, y2 + 2.62, 9.37, 0, 0.4, 0.4, { bg: '#1a3a6a', fg: '#fff' });
  graffiti(L, 'NURSES STATION\nHAD SUPPLIES  →', 33, y2 + 1.7, 9.3, 0, 2.0, 0.8, '#1a2a8a');
  L.reverb(6.4, y2, 9.2, 40, y2 + CH, 12, 'room');
  L.ambience(0.2, y2, 0.2, 48, y2 + CH, 21, 'hospital');
  // hub / nurse station (x 40..48, z 0.2..21)
  finish(L, 40, 0.2, 48, 21, y2, 'tileFloor', 0xb0b8b4);
  wz(L, 0.2, 9.2, 40, y2, HW); wz(L, 12, 21, 40, y2, HW); wz(L, 0.2, 21, 48, y2, HW);
  { const np = P.prop(L, 44, y2, 7, 0); np.box(0, 0.55, 1.4, 4.6, 1.1, 0.5, 'woodPale', 0xc8c0b0).box(0, 1.12, 1.35, 4.7, 0.05, 0.7, 'marble').box(2.05, 0.55, 0, 0.5, 1.1, 2.4, 'woodPale', 0xc8c0b0).col(0, 0.58, 1.4, 4.6, 1.16, 0.6, 'wood').col(2.05, 0.58, 0, 0.6, 1.16, 2.4, 'wood'); }
  P.desk(L, 43.2, y2, 6.4, Math.PI, true); P.desk(L, 45, y2, 5.2, Math.PI, true); P.officeChair(L, 44, y2, 5.9, 0.5);
  P.medCabinet(L, 41, y2, 0.6, Math.PI); P.medCabinet(L, 42.1, y2, 0.6, Math.PI);
  sign(L, 'NURSES STATION', 44, y2 + 2.7, 8.1, 0, 2.2, 0.4, { bg: '#1a4a3a', fg: '#fff' });
  note(L, 'PATIENT BOARD\nRm 201 - quiet\nRm 204 - FEVER\nRm 207 - RESTRAINED\nRm 209 - ???', 47.9, y2 + 1.7, 12, -Math.PI / 2, 1.4, 1.0, { font: 'Comic Sans MS, cursive', bg: '#f0f0f0' });
  for (const [cx, cz] of [[46, 14], [42.5, 17]]) P.gurney(L, cx, y2, cz, rng() * 3, rng() < 0.5);
  P.wheelchair(L, 46.8, y2, 19.8, 3.8);
  L.item('medkit', 42.6, y2 + 1.17, 8.4, { chance: 0.8 });
  L.item('pills', 45.6, y2 + 1.17, 8.4, { chance: 0.7 });
  L.item('ammo', 46.9, y2 + 0.02, 2.5, { chance: 0.6 });
  ceilingLight(L, 44, y2 + CH, 6, { type: 'fluoro', intensity: 11 }); ceilingLight(L, 44, y2 + CH, 15.5, { type: 'fluoro', intensity: 9, flicker: 0.7 });
  scatterBlood(L, 40.5, 1, 47.5, 20, y2, 3);
  // south corridor to the balcony (x 42..45, z 21..30)
  slab(L, 42, 21, 45, 30, y2, 'concreteFloor'); ceil(L, 42, 21, 45, 30, y2 + CH, 'ceiling');
  finish(L, 42, 21, 45, 30, y2, 'linoleumBlue');
  wz(L, 21, 30, 42, y2, HW); wz(L, 21, 30, 45, y2, HW);
  ceilingLight(L, 43.5, y2 + CH, 25.5, { type: 'fluoro', intensity: 8, flicker: 0.6 });
  sign(L, 'ATRIUM · ICU', 43.5, y2 + 2.95, 20.9, Math.PI, 1.8, 0.3, { bg: '#1a3a6a', fg: '#fff' });
  L.reverb(42, y2, 21, 45, y2 + CH, 30, 'room');
  // balcony dressing
  seatRow(L, 37.6, y2, 40, Math.PI / 2, 5, 0x3a5a7a);
  L.item('health', 37.2, y2 + 0.02, 46.5, { chance: 0.5 });
  P.planter(L, 70.8, y2, 33, 0.4); P.planter(L, 37.2, y2, 31.2, 0.4);
  P.corpse(L, 58, y2 + 0.01, 31.5, 1.4, 0x2a2a3a);
  L.decal(58, y2 + 0.012, 31.5, 0, 1, 0, 1.6, DF.POOL);
  sign(L, 'INTENSIVE CARE', 71.83, y2 + 2.6, 42.4, -Math.PI / 2, 2.2, 0.35, { bg: '#1a3a6a', fg: '#fff' });
  sign(L, 'INTENSIVE CARE  ►', 70.4, y2 + 2.9, 30.18, 0, 2.4, 0.35, { bg: '#1a3a6a', fg: '#fff' });

  // --- east wing: ICU (x 72..95.8, z 30..59.8)
  slab(L, 72, 30, 95.8, 59.8, y2, 'concreteFloor', [[89.45, 43.85, 95.75, 52.95]]);
  ceil(L, 72, 30, 95.8, 59.8, y2 + CH, 'ceiling', [[89.45, 43.85, 95.75, 52.95]]);
  finish(L, 72, 40.8, 95.8, 44, y2, 'linoleumBlue');
  finish(L, 72, 30, 95.8, 40.8, y2, 'tileFloor', 0xb8c0bc);
  finish(L, 72, 44, 89.45, 59.8, y2, 'linoleum');
  wx(L, 72, 95.8, 30, y2, HW);
  // ICU glass fronts
  const icu = [[72, 78], [78, 84], [84, 90], [90, 95.8]];
  L.wallX(72, 95.8, 40.8, y2, y2 + CH, HW, IT, icu.flatMap(([a, b]) => [{ a: a + 0.5, b: a + 1.6, y0: y2, y1: y2 + 2.2 }, { a: a + 2.1, b: b - 0.5, y0: y2 + 1.0, y1: y2 + 2.3 }]));
  icu.forEach(([a, b], i) => {
    new Door(L, a + 1.05, y2, 40.8, 'x', { width: 1.1, material: 'paintedWhite', open: i !== 2 });
    L.box(a + 2.1, y2 + 1.0, 40.77, b - 0.5, y2 + 2.3, 40.83, 'glass', { tint: 0xc0d8d8 });
    if (i > 0) wz(L, 30, 40.8, a, y2, HW);
    P.bed(L, (a + b) / 2 + 0.4, y2, 31.25, Math.PI, 0xd8dcd8, true);
    monitorCart(L, (a + b) / 2 - 1.1, y2, 31.2, Math.PI, i !== 1);
    P.ivStand(L, (a + b) / 2 + 1.5, y2, 31.3);
    if (i === 1 || i === 3) { P.corpse(L, (a + b) / 2, y2 + 0.01, 36, rng() * 6, 0x8aa0b0); L.decal((a + b) / 2, y2 + 0.012, 36, 0, 1, 0, 2, DF.POOL); }
    ceilingLight(L, (a + b) / 2, y2 + CH, 35.5, { type: 'fluoro', intensity: 8, on: i !== 2, flicker: 0.4 });
    sign(L, 'ICU ' + (i + 1), a + 1.05, y2 + 2.5, 40.9, 0, 0.7, 0.25, { bg: '#e8e8e0', fg: '#1a3a6a' });
  });
  L.item('medkit', 81, y2 + 0.02, 38.5, { chance: 0.5 });
  L.item('tier2', 93, y2 + 0.02, 33.2, { chance: 0.45 });
  // ICU 3 is on fire
  fireSource(L, 86.2, y2, 34.5, 0.9); fireSource(L, 88.4, y2, 37.8, 0.7);
  L.decal(87, y2 + CH - 0.01, 35.5, 0, -1, 0, 4.5, DF.SCORCH);
  // south side: staff lounge + storage
  wx(L, 72, 89.45, 44, y2, HW, [{ at: 76.5, open: true }, { at: 85, hinge: -1 }]);
  wz(L, 44, 59.8, 80, y2, HW);
  wz(L, 52.95, 59.8, 89.6, y2, HW);
  wainscotX(L, 72, 89.45, 44, y2, -1, [76.5, 85]); wainscotX(L, 72, 95.8, 40.8, y2, 1, [73.05, 79.05, 85.05, 91.05]);
  P.sofa(L, 74, y2, 58.6, Math.PI, 0x4a5a6a); P.table(L, 74, y2, 56.8, 0, 1.2, 0.6, 'woodPale');
  P.vending(L, 79.3, y2, 47, -Math.PI / 2); P.vending(L, 79.3, y2, 48.1, -Math.PI / 2, 0x2a4a8a);
  P.fridge(L, 72.6, y2, 46, Math.PI / 2); P.counter(L, 72.55, y2, 49.4, Math.PI / 2, 2.4);
  wallTV(L, 76, y2 + 2.0, 59.66, Math.PI, true);
  L.light(76, y2 + 2, 59, 0x6a8aff, 2.5, 5, { flicker: 0.6 });
  L.item('pills', 72.6, y2 + 0.92, 49.8, { chance: 0.6 });
  L.item('throwable', 74, y2 + 0.78, 56.8, { chance: 0.6 });
  ceilingLight(L, 76, y2 + CH, 51, { type: 'fluoro', intensity: 8, flicker: 0.3 });
  shelfUnit(L, 85, y2, 59.4, Math.PI, 3.5, 2.0); shelfUnit(L, 89.1, y2, 55, -Math.PI / 2, 3.0, 2.0);
  P.crate(L, 82, y2, 46, 0.3); P.crate(L, 82.2, y2, 46.9, 0.1, 0.8);
  L.item('ammo', 84.3, y2 + 0.02, 57, { chance: 0.7 });
  ceilingLight(L, 85, y2 + CH, 52, { type: 'bulb', intensity: 7, on: false });
  graffiti(L, 'STAIRS CLEAR\nTO 3', 93, y2 + 1.8, 40.9, 0, 1.6, 0.8, '#1a6a2a');
  fluoroRow(L, 75, 88, 42.4, y2, 6.5, { i: 9 });
  L.reverb(72, y2, 30, 95.8, y2 + CH, 59.8, 'room');
  L.ambience(72, y2, 30, 95.8, y2 + CH, 59.8, 'hospital');
  bloodTrail(L, 73, 42.4, 90, 42.6, y2, 10);

  // --- STAIR B (F2 -> F3)
  const sB = stairwell(L, { x0: 89.6, z0: 44, x1: 95.6, z1: 52.8, y: Y2, entry: 'n', first: 'w', labels: ['2', '3'] });
  // blocked continuation: stairs up past 3 are full of rubble (visual only)

  // ================================================================= F3
  const y3 = Y3;
  slab(L, 0.2, 0.2, 95.8, 30, y3, 'concreteFloor', [[5.85, 15.05, 12.15, 24.15]]);
  slab(L, 72, 30, 95.8, 44, y3, 'concreteFloor');
  ceil(L, 0.2, 0.2, 95.8, 30, y3 + CH, 'ceiling', [[5.85, 15.05, 12.15, 24.15]]);
  ceil(L, 72, 30, 95.8, 44, y3 + CH, 'ceiling');
  // east corridor (x 92.4..95.8, z 15.2..44)
  finish(L, 92.4, 12, 95.8, 44, y3, 'linoleumBlue');
  wz(L, 15.2, 44, 92.4, y3, HW, [{ at: 37.5, open: true }, { at: 20.5, hinge: -1 }]);
  wx(L, 72, 89.45, 44, y3, HW);
  wainscotZ(L, 15.4, 43.8, 92.4, y3, 1, [37.5, 20.5]);
  // blocked by a gurney barricade + fire
  P.gurney(L, 94.1, y3, 28.5, 0.3, false); P.gurney(L, 94.0, y3, 30.2, -0.4, true); P.bed(L, 94.1, y3, 27.0, 1.4, 0x8a8a9a, true);
  L.box(92.5, y3, 26.4, 95.7, y3 + 1.8, 31, 'metal', { visible: false });
  fireSource(L, 94, y3, 31.8, 0.7);
  L.decal(94, y3 + CH - 0.01, 30, 0, -1, 0, 3.5, DF.SCORCH);
  graffiti(L, 'BLOCKED\nUSE O.R.', 95.78, y3 + 1.8, 34.5, -Math.PI / 2, 1.4, 0.8, '#b8201a');
  fluoroCol(L, 18, 42, 94.1, y3, 6, { i: 9 });
  sign(L, 'SURGERY', 92.5, y3 + 2.6, 37.5, Math.PI / 2, 1.6, 0.35, { bg: '#1a4a3a', fg: '#fff' });
  // operating rooms (x 80..92.4): OR1 z 30..44, OR2 z 15.2..30
  finish(L, 80, 15.2, 92.4, 44, y3, 'tileFloor', 0xb8c8c0);
  wz(L, 15.2, 44, 80, y3, 'tileGreen');
  wx(L, 80, 92.4, 30, y3, 'tileGreen', [{ at: 86, w: 1.6, mat: 'metalClean', open: true }]);
  for (const [z0, z1, n] of [[30, 44, 1], [15.2, 30, 2]]) {
    const cz = (z0 + z1) / 2;
    const tbl = P.prop(L, 86, y3, cz, 0);
    tbl.box(0, 0.45, 0, 0.5, 0.9, 0.5, 'metalClean').box(0, 0.95, 0, 0.7, 0.12, 2.1, 'plastic', 0x2a4a4a).col(0, 0.5, 0, 0.7, 1.0, 2.1, 'metal');
    const sl = P.prop(L, 86, y3 + CH, cz, 0);
    sl.cyl(0, -0.45, 0, 0.03, 0.9, 'metalClean').cyl(0, -0.95, 0, 0.45, 0.14, 'paintedWhite', 0xd8d8d0, null, 16).cyl(0, -1.03, 0, 0.36, 0.02, 'emissiveCool', 0x999999, null, 16);
    L.light(86, y3 + CH - 1.3, cz, 0xeef4ff, n === 1 ? 16 : 0, 7, { on: n === 1, flicker: 0.1 });
    monitorCart(L, 84.2, y3, cz - 1.4, Math.PI / 2, true);
    { const an = P.prop(L, 87.8, y3, cz - 1.2, -Math.PI / 2); an.box(0, 0.7, 0, 0.7, 1.4, 0.6, 'paintedWhite', 0xc8d0d0).box(0, 1.55, 0, 0.5, 0.3, 0.1, 'plastic', 0x2a2a2a).col(0, 0.7, 0, 0.7, 1.4, 0.6, 'metal'); }
    P.table(L, 88.2, y3, cz + 1.5, Math.PI / 2, 1.2, 0.5, 'metalClean');
    for (let k = 0; k < 4; k++) L.box(88.1 - 0.1, y3 + 0.77, cz + 1.05 + k * 0.28, 88.3, y3 + 0.79, cz + 1.15 + k * 0.28, 'chrome', { collide: false });
    P.ivStand(L, 84.5, y3, cz + 1.4);
    for (let k = 0; k < 2; k++) P.sink(L, 80.35, y3, z0 + 2 + k * 1.2, Math.PI / 2);
    ceilingLight(L, 83, y3 + CH, cz, { type: 'fluoro', intensity: 8, flicker: 0.5, on: n === 2 });
    scatterBlood(L, 84, z0 + 1, 90, z1 - 1, y3, 4);
    sign(L, 'O.R. ' + n, 92.5, y3 + 2.6, n === 1 ? 39.3 : 22.3, Math.PI / 2, 0.8, 0.3, { bg: '#e8e8e0', fg: '#1a4a3a' });
    L.reverb(80, y3, z0, 92.4, y3 + CH, z1, 'room');
  }
  P.corpse(L, 86, y3 + 1.03, 37, 0, 0x8aa0b0);
  L.decal(86, y3 + 0.012, 38, 0, 1, 0, 1.8, DF.POOL);
  L.decal(92.49, y3 + 1.4, 25, 1, 0, 0, 0.8, DF.HAND, { noRoll: true });
  L.item('medkit', 88.2, y3 + 0.78, 21.6, { chance: 0.7 });
  L.item('health', 88.2, y3 + 0.78, 38.0, { chance: 0.5 });
  L.item('adrenaline', 81.2, y3 + 0.92, 18.2, { chance: 0.5 });
  // north corridor (z 12..15.2, x 0.2..95.8)
  finish(L, 0.2, 12, 95.8, 15.2, y3, 'linoleumBlue');
  wx(L, 12.15, 92.4, 15.2, y3, HW, [{ at: 53, locked: true }, { at: 71, open: true }]);
  wx(L, 0.2, 5.85, 15.2, y3, HW);
  wx(L, 0.2, 95.8, 12, y3, HW, [{ at: 8, hinge: -1 }, { at: 18, hinge: -1, mat: 'metalDark' }, { at: 41.5, mat: 'metalDark', open: true }, { at: 52, w: 1.6, door: false }, { at: 68, open: true }, { at: 85, hinge: -1 }]);
  wainscotX(L, 0.2, 95.8, 12, y3, 1, [8, 18, 41.5, [52, 1.6], 68, 85]); wainscotX(L, 12.2, 92.4, 15.2, y3, -1, [53, 71]);
  fluoroRow(L, 4, 92, 13.6, y3, 7, { i: 9, on: (x) => !(x > 20 && x < 38) && rng() < 0.85 });
  // collapsed ceiling blocks the corridor (x 26..34)
  L.box(26, y3, 12.1, 34, y3 + CH, 15.1, 'concrete', { visible: false });
  for (let i = 0; i < 5; i++) L.box(26 + i * 1.6, y3, 12.1 + (i % 2) * 0.3, 27.4 + i * 1.6, y3 + 0.8 + rng() * 1.6, 15.1 - ((i + 1) % 2) * 0.3, 'concrete', { collide: false, tint: 0x6a6660 });
  L.box(25.8, y3 + 2.4, 12.1, 34.2, y3 + CH, 15.1, 'ceiling', { collide: false, tint: 0x5a5854 });
  P.debris(L, 25, y3, 13.6, 0.9, 'concrete', 10); P.debris(L, 35, y3, 13.6, 0.9, 'ceiling', 8);
  P.pipe(L, 26, y3 + 2.6, 12.4, 33, y3 + 0.9, 14.8, 0.1, 'rust');
  graffiti(L, 'THRU THE\nBOILER ROOM', 39.4, y3 + 1.7, 15.1, Math.PI, 1.8, 0.8, '#d8d8c8');
  sign(L, '3', 94.1, y3 + 2.62, 43.83, Math.PI, 0.4, 0.4, { bg: '#1a3a6a', fg: '#fff' });
  sign(L, 'LABORATORY', 85, y3 + 2.6, 12.1, 0, 1.8, 0.3, { bg: '#e8e8e0', fg: '#3a1a6a' });
  sign(L, 'PHARMACY', 71, y3 + 2.6, 15.1, Math.PI, 1.6, 0.3, { bg: '#1a6a3a', fg: '#fff', glow: 0.8, lightColor: 0x40ff70, lightIntensity: 2 });
  sign(L, 'ISOLATION WARD\nAUTHORIZED PERSONNEL ONLY', 52, y3 + 2.65, 12.1, 0, 2.2, 0.5, { bg: '#d8c030', fg: '#111' });
  sign(L, 'MECHANICAL', 41.5, y3 + 2.6, 12.1, 0, 1.4, 0.3, { bg: '#e8e8e0', fg: '#333' });
  L.reverb(0.2, y3, 12, 95.8, y3 + CH, 15.2, 'room');
  L.ambience(0.2, y3, 0.2, 95.8, y3 + CH, 44, 'hospital');
  // north rooms: partitions
  for (const x of [16, 44, 60, 76]) wz(L, 0.2, 12, x, y3, HW);
  // Lab A (x 76..95.8)
  finish(L, 76, 0.2, 95.8, 12, y3, 'tileFloor', 0xc8ccc8);
  labBench(L, 82, y3, 5.5, 0, 6); labBench(L, 90, y3, 5.5, 0, 6); labBench(L, 86, y3, 9.2, Math.PI, 6);
  { const fh = P.prop(L, 94.8, y3, 3, Math.PI / 2); fh.box(0, 1.2, 0, 1.8, 2.4, 0.9, 'paintedWhite', 0xc8ccc4).box(0, 1.35, -0.46, 1.6, 0.7, 0.02, 'glassDirty', 0x2a3a3a).col(0, 1.2, 0, 1.8, 2.4, 0.9, 'metal'); }
  P.fridge(L, 77, y3, 1.0, 0); P.fridge(L, 77.8, y3, 1.0, 0);
  ceilingLight(L, 82, y3 + CH, 7, { type: 'fluoro', intensity: 9, flicker: 0.3 }); ceilingLight(L, 90, y3 + CH, 7, { type: 'fluoro', intensity: 9, on: false });
  L.item('bile', 88, y3 + 0.94, 5.4, { chance: 0.55 });
  L.item('pills', 80, y3 + 0.94, 5.4, { chance: 0.5 });
  scatterBlood(L, 77, 1, 95, 11, y3, 3);
  // Lab B (x 60..76): specimen storage
  finish(L, 60, 0.2, 76, 12, y3, 'tileFloor', 0xb8bcb8);
  shelfUnit(L, 63, y3, 0.6, Math.PI, 4.5, 2.2, { small: true, colors: [0xeeeeea, 0xd8e2ea, 0xd0e0d0, 0xe8dcc0, 0xd89a60, 0x9ab8d8, 0xe0c8c8] }); shelfUnit(L, 70, y3, 0.6, Math.PI, 4.5, 2.2, { small: true, colors: [0xeeeeea, 0xd8e2ea, 0xd0e0d0, 0xe8dcc0, 0xd89a60, 0x9ab8d8, 0xe0c8c8] });
  labBench(L, 68, y3, 6.4, 0, 8);
  monitorCart(L, 74.8, y3, 9, -Math.PI / 2, true);
  ceilingLight(L, 68, y3 + CH, 6, { type: 'fluoro', intensity: 8, flicker: 0.8 });
  L.item('health', 66, y3 + 0.94, 6.4, { chance: 0.5 });
  // Isolation ward (x 44..60) — dark, witch spot
  finish(L, 44, 0.2, 60, 12, y3, 'linoleum', 0x8a9088);
  for (let i = 0; i < 3; i++) {
    const bx = 47 + i * 5;
    P.bed(L, bx, y3, 1.25, Math.PI, 0x7a8a7a, true);
    curtain(L, bx + 2.4, y3, 3.0, Math.PI / 2, 5.6, 0.9);
    P.ivStand(L, bx + 0.9, y3, 1.2);
  }
  L.box(44.1, y3, 7.8, 59.9, y3 + 2.4, 7.84, 'glass', { collide: false, tint: 0xd8e0d8 });
  P.corpse(L, 50, y3 + 0.01, 9.5, 2, 0x8aa0b0); P.corpse(L, 56, y3 + 0.01, 5.5, 0.4, 0xd8d8d0);
  L.decal(52, y3 + 0.012, 6, 0, 1, 0, 2.5, DF.POOL); scatterBlood(L, 44.5, 1, 59.5, 11, y3, 5);
  L.decal(59.9, y3 + 1.5, 4, -1, 0, 0, 1.2, DF.SPLAT_BIG, { noRoll: true });
  wallLamp(L, 52, y3 + 3.0, 0.25, 0, 1, 0xff2010, 2.5, 7);
  L.item('medkit', 57.5, y3 + 0.02, 1.2, { chance: 0.7 });
  L.item('pills', 45.2, y3 + 0.02, 11.2, { chance: 0.5 });
  L.witchSpots.push({ x: 52, y: y3, z: 5.5 });
  L.reverb(44, y3, 0.2, 60, y3 + CH, 12, 'room');
  // Maintenance / boiler plant (x 16..44) — dark detour
  finish(L, 16, 0.2, 44, 12, y3, 'concreteFloor', 0x6a6a64);
  maintenance(L, game, y3);
  // west rooms (x 0.2..16): records archive (dead end, supplies)
  finish(L, 0.2, 0.2, 16, 12, y3, 'carpetGray');
  for (let i = 0; i < 4; i++) shelfUnit(L, 4 + i * 3, y3, 5, Math.PI / 2, 6, 2.2, { colors: [0xd8d4c8, 0xc8b89a, 0xe8e0c0] });
  ceilingLight(L, 8, y3 + CH, 6, { type: 'bulb', intensity: 6, flicker: 0.6 });
  L.item('ammo', 14.5, y3 + 0.02, 10.8, { chance: 0.6 });
  L.item('tier2', 2, y3 + 0.02, 1.5, { chance: 0.4 });
  // pharmacy (x 62..80, z 15.2..26) + records (x 44..62, locked)
  finish(L, 44, 15.2, 80, 26, y3, 'linoleum');
  wz(L, 15.2, 26, 44, y3, HW); wz(L, 15.2, 26, 62, y3, HW); wx(L, 44, 80, 26, y3, HW);
  for (let i = 0; i < 3; i++) shelfUnit(L, 71, y3, 18.2 + i * 2.4, 0, 8, 2.0, { small: true, colors: [0xeeeeea, 0xd8e2ea, 0xd0e0d0, 0xe8dcc0, 0xd89a60, 0x9ab8d8, 0xe0c8c8] });
  P.counter(L, 65, y3, 21, Math.PI / 2, 5);
  P.fenceChain(L, 66, 15.4, 66, 18.6, y3, 2.4); P.fenceChain(L, 66, 23.4, 66, 25.8, y3, 2.4);
  L.item('pills', 65, y3 + 0.93, 19.5, { chance: 0.9 });
  L.item('pills', 65, y3 + 0.93, 22.5, { chance: 0.7 });
  L.item('medkit', 73, y3 + 0.78, 18.2, { chance: 0.7 });
  L.item('medkit', 69, y3 + 1.37, 20.6, { chance: 0.5 });
  L.item('adrenaline', 75, y3 + 0.78, 23, { chance: 0.5 });
  ceilingLight(L, 71, y3 + CH, 20.5, { type: 'fluoro', intensity: 10, flicker: 0.2 });
  graffiti(L, 'TOOK WHAT\nWE NEEDED\n- L', 79.9, y3 + 1.6, 22, -Math.PI / 2, 1.6, 0.9, '#1a2a8a');
  P.corpse(L, 64, y3 + 0.01, 17, 0.8, 0xd8d8d0);
  L.reverb(62, y3, 15.2, 80, y3 + CH, 26, 'room');
  shelfUnit(L, 53, y3, 25.5, Math.PI, 8, 2.2, { colors: [0xd8d4c8, 0xc8b89a] });

  // --- STAIR C (F3 -> F4)
  const sC = stairwell(L, { x0: 6, z0: 15.2, x1: 12, z1: 24, y: Y3, entry: 'n', first: 'e', labels: ['3', '4'], lowOpen: true });
  graffiti(L, 'ELEVATORS\nON 4', 10.5, y3 + 1.9, 15.03, Math.PI, 1.6, 0.8, '#d8d8c8');

  // ================================================================= F4
  const y4 = Y4;
  slab(L, 0.2, 0.2, 42, 15.2, y4, 'concreteFloor');
  slab(L, 12, 15.2, 42, 34.4, y4, 'concreteFloor', [[5.85, 15.05, 12.15, 24.15]]);
  slab(L, 66, 24, 84, 34.4, y4, 'concreteFloor');
  ceil(L, 0.2, 0.2, 42, 15.2, y4 + CH, 'ceiling');
  ceil(L, 12, 15.2, 42, 34.4, y4 + CH, 'ceiling');
  ceil(L, 66, 24, 84, 34.4, y4 + CH, 'ceiling');
  // admin corridor (z 12..15.2)
  finish(L, 0.2, 12, 42, 15.2, y4, 'carpetBlue');
  wx(L, 0.2, 42, 12, y4, 'plaster', [{ at: 9, mat: 'woodPale', open: true }, { at: 16, mat: 'woodPale' }, { at: 24, mat: 'woodPale', open: true }, { at: 32, mat: 'woodPale', locked: true }, { at: 39, mat: 'woodPale', open: true }]);
  wx(L, 0.2, 5.85, 15.2, y4, 'plaster');
  wx(L, 12.15, 42, 15.2, y4, 'plaster', [{ at: 18, w: 1.8, door: false }, { at: 30, w: 1.8, door: false }]);
  wz(L, 0.2, 15.2, 42, y4, 'plaster');
  for (const x of [12, 20, 28, 36]) wz(L, 0.2, 12, x, y4, 'plaster');
  wainscotX(L, 0.2, 42, 12, y4, 1, [9, 16, 24, 32, 39], 0x7a8a9a);
  fluoroRow(L, 4, 38, 13.6, y4, 8.5, { i: 9 });
  sign(L, 'ADMINISTRATION', 3, y4 + 2.6, 15.1, Math.PI, 2.2, 0.35, { bg: '#2a2a3a', fg: '#e8e8e0' });
  sign(L, '4', 7.5, y4 + 2.62, 15.03, Math.PI, 0.4, 0.4, { bg: '#1a3a6a', fg: '#fff' });
  sign(L, 'TOWER ELEVATORS  ►', 26, y4 + 2.75, 12.1, 0, 2.6, 0.35, { bg: '#1a3a6a', fg: '#fff', glow: 0.5, light: false });
  [[0.2, 12, 'CHIEF OF STAFF'], [12, 20, 'RECORDS'], [20, 28, 'BILLING'], [28, 36, 'H.R.'], [36, 42, 'COPY ROOM']].forEach(([a, b, t], i) => {
    finish(L, a, 0.2, b, 12, y4, i % 2 ? 'carpetGray' : 'woodFloorDark');
    if (i === 4) { shelfUnit(L, 39, y4, 0.6, Math.PI, 5, 2.0); P.prop(L, 40.5, y4, 6, 0).box(0, 0.5, 0, 1.0, 1.0, 0.7, 'plastic', 0xc8c8c0).col(0, 0.5, 0, 1.0, 1.0, 0.7, 'metal'); ceilingLight(L, 39, y4 + CH, 6, { type: 'fluoro', intensity: 7, on: false }); }
    else officeRoom(L, a, 0.2, b, 12, y4, { far: 'n', items: i === 0 ? [{ type: 'tier2', x: a + 2, z: 10.5, chance: 0.5 }] : i === 2 ? [{ type: 'pills', x: a + 3, z: 2.2, dy: 0.78 }] : [] });
    sign(L, t, (a + b) / 2 + 0.5, y4 + 2.5, 12.1, 0, 1.3, 0.25, { bg: '#e8e4d8', fg: '#2a2a3a' });
  });
  // cubicle farm (x 12..36, z 15.2..34.4)
  finish(L, 12, 15.2, 36, 34.4, y4, 'carpetGray');
  wz(L, 24.15, 34.4, 12, y4, 'plaster');
  wz(L, 15.2, 30.4, 36, y4, 'plaster');
  wx(L, 12, 42, 34.4, y4, 'plaster');
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const cx = 16 + c * 4.6, cz = 19 + r * 5;
    if (r === 1 && c === 2) continue;
    cubicle(L, cx, y4, cz, (r + c) % 2 ? 0 : Math.PI, pickr([0x5a6470, 0x6a5a50, 0x4a5a4a]));
  }
  P.bookshelf(L, 35.6, y4, 22, -Math.PI / 2);
  P.vending(L, 13, y4, 33.5, 0);
  P.corpse(L, 26, y4 + 0.01, 27.5, 1.9, 0x3a3a4a); L.decal(26, y4 + 0.012, 27.5, 0, 1, 0, 1.5, DF.POOL);
  bloodTrail(L, 27, 28, 36, 32.5, y4, 7);
  P.papers(L, 24, y4 + 0.01, 25, 8, 30);
  for (const [lx, lz, on] of [[18, 20, true], [30, 20, false], [18, 30, true], [30, 30, true]]) ceilingLight(L, lx, y4 + CH, lz, { type: 'fluoro', intensity: 9, on, flicker: rng() < 0.5 ? 0.6 : 0.1 });
  graffiti(L, 'CALL THE LIFT\nAND RUN', 35.9, y4 + 1.8, 26, -Math.PI / 2, 1.8, 0.8, '#b8201a');
  L.item('pipebomb', 20.6, y4 + 0.78, 23.6, { chance: 0.5 });
  L.reverb(12, y4, 15.2, 36, y4 + CH, 34.4, 'room');
  L.ambience(0.2, y4, 0.2, 42, y4 + CH, 34.4, 'hospital');
  // west hall (x 36..42, z 30.4..34.4): the last prep before the elevators
  finish(L, 36, 30.4, 42, 34.4, y4, 'linoleumBlue');
  supplies(L, 39, y4, 33.7, Math.PI, ['ammo', { type: 'tier2' }, 'medkit'], { w: 2.2, d: 0.7 });
  L.item('health', 37, y4 + 0.02, 31, { chance: 0.6 });
  ceilingLight(L, 39, y4 + CH, 32.4, { type: 'fluoro', intensity: 10, flicker: 0.2 });
  sign(L, 'ELEVATORS', 41.83, y4 + 3.2, 32.4, -Math.PI / 2, 1.6, 0.3, { bg: '#1a3a6a', fg: '#fff' });
  S.pre = { x: 38, y: y4, z: 32.4 };
  // storage rooms behind the breach walls (closed off)
  finish(L, 36, 24, 42, 30.4, y4, 'concreteFloor', 0x7a7a74);
  wx(L, 36, 42, 24, y4, 'plaster'); wx(L, 36, 42, 30.4, y4, 'plaster');
  shelfUnit(L, 37, y4, 27, Math.PI / 2, 4, 2.0);
  finish(L, 66, 24, 72, 30.4, y4, 'concreteFloor', 0x7a7a74);
  wx(L, 66, 72, 24, y4, 'plaster'); wz(L, 24, 30.4, 72, y4, 'plaster');
  shelfUnit(L, 71, y4, 27, -Math.PI / 2, 4, 2.0);
  // east hall (x 66..84, z 30.4..34.4) -> sealed stairwell D
  finish(L, 66, 30.4, 84, 34.4, y4, 'linoleumBlue');
  wx(L, 66, 84, 30.4, y4, HW); wx(L, 66, 84, 34.4, y4, HW);
  wz(L, 30.4, 34.4, 84, y4, HW, [{ at: 32.4, locked: true, mat: 'paintedGreen' }]);
  sign(L, 'STAIR D', 83.9, y4 + 2.5, 32.4, -Math.PI / 2, 0.9, 0.3, { bg: '#1a6a3a', fg: '#fff' });
  P.gurney(L, 77, y4, 33.4, 1.4, true); P.wheelchair(L, 72, y4, 31.4, 0.4);
  ceilingLight(L, 72, y4 + CH, 32.4, { type: 'fluoro', intensity: 8, flicker: 0.8 }); ceilingLight(L, 80, y4 + CH, 32.4, { type: 'fluoro', intensity: 8, on: false });
  scatterBlood(L, 67, 31, 83, 34, y4, 4);
  L.reverb(66, y4, 30.4, 84, y4 + CH, 34.4, 'room');
  L.ambience(42, y4, 20, 84, y4 + CH, 42, 'hospital');

  return { sA, sB, sC };
}

// Burned steel beams lying across the collapsed corridor (visual).
function steelBeamPile(L, x0, x1, z, y) {
  const p = P.prop(L, (x0 + x1) / 2, y, z, 0.15);
  p.box(0, 1.35, 0, x1 - x0 + 1, 0.25, 0.2, 'rust', 0x4a3a30, [0, 0, 0.18]);
  p.box(0.4, 0.5, 0.6, 3.2, 0.2, 0.2, 'rust', 0x3a3028, [0, 0.4, -0.1]);
}

// Dark boiler / mechanical plant on 3F (x 16..44, z 0.2..12).
function maintenance(L, game, y) {
  // boilers
  for (const bx of [22, 30]) {
    const b = P.prop(L, bx, y, 4, 0);
    b.cyl(0, 1.3, 0, 1.2, 4.2, 'paintedGreen', 0x3a4a3a, [0, 0, Math.PI / 2], 18);
    b.box(-1.4, 0.35, 0, 0.3, 0.7, 1.8, 'metalDark').box(1.4, 0.35, 0, 0.3, 0.7, 1.8, 'metalDark');
    b.cyl(0, 2.9, 0, 0.18, 1.2, 'rust');
    b.box(2.2, 1.3, 0, 0.12, 0.8, 0.8, 'metalDark');
    b.col(0, 1.3, 0, 4.4, 2.6, 2.4, 'metal');
  }
  P.pumpMachine(L, 38, y, 3, 0); P.pumpMachine(L, 38, y, 7.4, 0);
  P.generator(L, 22, y, 8.3, 0);
  P.electricPanel(L, 17.0, y, 2, Math.PI / 2, true); P.electricPanel(L, 17.0, y, 3.4, Math.PI / 2, false);
  P.electricPanel(L, 43.6, y, 9.8, -Math.PI / 2, true);
  for (const [z, yy] of [[0.7, 2.9], [1.1, 2.6], [11.4, 3.0]]) P.pipe(L, 16.4, y + yy, z, 43.6, y + yy, z, 0.14, 'rust');
  P.pipe(L, 26, y + 3.1, 0.6, 26, y + 3.1, 11.6, 0.1, 'metalDark');
  P.pipe(L, 34, y + 3.1, 0.6, 34, y + 3.1, 11.6, 0.1, 'metalDark');
  for (const [x, z] of [[26, 7], [34, 7]]) P.pipe(L, x, y, z, x, y + 3.2, z, 0.12, 'rust');
  P.valveWheel(L, 26, y + 1.4, 6.85, 0); P.valveWheel(L, 34, y + 1.4, 6.85, 0);
  for (const [x, z] of [[24, 9.5], [32.5, 10]]) L.box(x - 1.4, y + 0.002, z - 0.9, x + 1.4, y + 0.012, z + 0.9, 'waterSurface', { collide: false });
  P.barrel(L, 42.8, y, 1.0, 0x3a4a6a); P.barrel(L, 43.0, y, 1.8, 0x6a2a1a);
  physProp(L, 'propane', 41.8, y, 1.1); physProp(L, 'gascan', 36, y, 11.2); physProp(L, 'gascan', 18.6, y, 7.2);
  P.crate(L, 17.0, y, 0.9, 0.3); P.crate(L, 17.2, y, 1.9, 0.2, 0.8);
  // lighting: almost none — a sparking panel, one red lamp, flickering cage lights
  ceilingLight(L, 40, y + CH, 6, { type: 'cage', intensity: 5, range: 7, flicker: 0.9 });
  ceilingLight(L, 28, y + CH, 9.5, { type: 'cage', intensity: 4, range: 6, flicker: 0.95 });
  ceilingLight(L, 20, y + CH, 6, { type: 'cage', on: false });
  wallLamp(L, 16.2, y + 2.8, 6, 1, 0, 0xff2010, 3, 7);
  const spark = { t: 0, update(dt) { this.t -= dt; if (this.t <= 0) { this.t = 0.8 + Math.random() * 2.5; const cp = game.camPos; if ((cp.x - 43.4) ** 2 + (cp.z - 9.8) ** 2 < 400) { game.fx.sparks(43.35, y + 1.9, 9.8, -1, 0.3, 0, 14); game.lights.flash(43.2, y + 1.9, 9.8, 0x9ac8ff, 6, 6, 0.12); } } } };
  L.dynamics.push(spark);
  graffiti(L, 'KEEP LIGHTS\nOFF - SHE\nCRIES IN HERE', 43.9, y + 1.7, 5, -Math.PI / 2, 1.6, 0.9, '#b8201a');
  sign(L, 'BOILER ROOM\nDANGER HIGH PRESSURE', 16.1, y + 2.2, 9, Math.PI / 2, 1.8, 0.6, { bg: '#d8c030', fg: '#111' });
  L.witchSpots.push({ x: 26, y, z: 8.4 });
  L.reverb(16, y, 0.2, 44, y + CH, 12, 'hall');
  L.ambience(16, y, 0.2, 44, y + CH, 12, 'hospital');
}
