// Dead Air 3 — start: Stor-Safe unit C-17 (the safe room chapter 2 ends in),
// corridor C2 and its motion-sensor lights, the rear exit, the drive-up yard
// (a rental truck half unloaded, a camp in an open unit), the alley behind
// the laundromat and Kessler Ave with the remains of an army checkpoint.
import * as THREE from 'three';
import { ceilingLight, graffiti, poster, posterWall, wallMessages, supplies, fireSource, burningBarrel, physProp, street, hittable, P } from './kit.js';
import { Door } from '../world/dynamic.js';
import { RollupDoor } from './da_parts.js';
import { cardboard } from './da2_parts.js';
import { tent, razorWire, jersey } from './ch3_props.js';
import { fireEscapeDeco } from './da1_common.js';
import { shelving, soundEmitter } from './ch2_parts.js';
import { rng, NC, CLIP, blood, safetySign, hardHat, jerryCans, ammoCrate, F_SOLID, F_SHOOT, sign } from './da3_parts.js';
import { SY, SS, C2, C17, YARD, ALLEY, KES } from './da3_layout.js';

// ============================================================ STOR-SAFE
function storage(L, game) {
  const H = SS.H, y = SY;
  const wm = 'paintedWhite', wt = 0xd8d4c8, mt = 0xb8bcbc;
  L.box(SS.x0, 0, SS.z0, SS.x1, y, SS.z1, 'concreteFloor', { tint: 0x8a8680 });
  L.box(SS.x0 - 0.2, H, SS.z0 - 0.2, SS.x1 + 0.2, H + 0.3, SS.z1 + 0.2, 'metal', { tint: 0x8a8e8e });
  // exterior shell (+ the rest of the Stor-Safe building north / south of this wing)
  L.wallZ(SS.z0, SS.z1, 8.0, 0, H, wm, 0.3, [{ a: -0.8, b: 0.4, y0: y, y1: y + 2.2 }], { tint: wt });
  L.wallZ(SS.z0, SS.z1, -12.25, 0, H, wm, 0.3, [], { tint: wt });
  L.wallX(SS.x0, SS.x1, -7.75, 0, H, wm, 0.3, [], { tint: wt });
  L.wallX(SS.x0, SS.x1, 7.95, 0, H, wm, 0.3, [], { tint: wt });
  L.box(-30, 0, -12.2, SS.x1, H + 0.3, SS.z0 - 0.02, wm, { tint: 0xc8c4b8 });
  L.box(-30, 0, SS.z1 + 0.02, SS.x1, H + 0.3, YARD.z1 + 0.2, wm, { tint: 0xc8c4b8 });
  L.box(SS.x1 - 0.2, H - 0.8, -12.2, SS.x1 + 0.02, H - 0.3, YARD.z1 + 0.2, 'paintedRed', { collide: false, tint: 0xe86a10 });
  // corridor walls with unit openings
  const cw0 = -12.1, cw1 = 7.85;
  const nX = [-12.1, -8.7, -5.3, -1.9, 1.5, 4.9, 7.85];      // north unit bounds
  const sX = [-12.1, -8.7, -5.3, -1.9, 1.5];                   // south unit bounds (C-13..C-16), then C-17
  L.wallX(cw0, cw1, C2.z0, y, H, 'metal', 0.2, [{ a: -4.9, b: -2.3, y0: y, y1: y + 2.5 }], { tint: mt });
  L.wallX(cw0, cw1, C2.z1, y, H, 'metal', 0.2, [{ a: -1.5, b: 1.1, y0: y, y1: y + 2.5 }, { a: C17.door - 1.3, b: C17.door + 1.3, y0: y, y1: y + 2.6 }], { tint: mt });
  L.box(cw0, H - 0.6, C2.z0 + 0.1, cw1, H - 0.58, C2.z1 - 0.1, 'ceiling', NC);
  L.box(cw0 + 0.1, y - 0.01, C2.z0 + 0.1, cw1, y + 0.005, C2.z1 - 0.1, 'concreteFloor', { collide: false, tint: 0x6a6660 });
  L.box(cw0 + 0.4, y + 0.004, -0.25, cw1 - 0.4, y + 0.008, -0.15, 'paintedYellow', { collide: false, tint: 0xd8b020 });
  // roll-up faces of closed units
  const rollFace = (cx, fz, s, label) => {
    const w = 2.4;
    L.box(cx - w / 2, y, fz, cx + w / 2, y + 2.4, fz + s * 0.03, 'paintedRed', { collide: false, tint: 0xe86a10 });
    for (let yy = y + 0.12; yy < y + 2.4; yy += 0.16) L.box(cx - w / 2, yy, fz + s * 0.03, cx + w / 2, yy + 0.03, fz + s * 0.045, 'paintedRed', { collide: false, tint: 0x9a4a10 });
    L.box(cx - w / 2 - 0.1, y + 2.4, fz, cx + w / 2 + 0.1, y + 2.6, fz + s * 0.12, 'metalDark', NC);
    L.box(cx - 0.1, y + 0.2, fz + s * 0.03, cx + 0.1, y + 0.32, fz + s * 0.07, 'chrome', NC);
    sign(L, label, cx, y + 2.85, fz + s * 0.05, 0, 0.5, 0.22, { bg: '#1a2a4a', fg: '#fff' });
  };
  const nLab = ['C-06', 'C-07', 'C-08', 'C-09', 'C-10'];
  for (let i = 0; i < 5; i++) {
    const cx = (nX[i] + nX[i + 1]) / 2;
    if (i === 2) sign(L, nLab[i], cx, y + 2.85, C2.z0 + 0.12, 0, 0.5, 0.22, { bg: '#1a2a4a', fg: '#fff' });
    else rollFace(cx, C2.z0 + 0.1, 1, nLab[i]);
  }
  sign(L, 'ELECTRICAL\nNO ACCESS', 6.4, y + 1.6, C2.z0 + 0.11, 0, 0.8, 0.36, { bg: '#e8c020', fg: '#101010' });
  L.box(5.6, y, C2.z0 + 0.1, 7.2, y + 2.2, C2.z0 + 0.13, 'metal', { collide: false, tint: 0x6a6e6a });
  const sLab = ['C-13', 'C-14', 'C-15', 'C-16'];
  for (let i = 0; i < 4; i++) {
    const cx = (sX[i] + sX[i + 1]) / 2;
    if (i === 3) sign(L, sLab[i], cx, y + 2.85, C2.z1 - 0.12, 0, 0.5, 0.22, { bg: '#1a2a4a', fg: '#fff' });
    else rollFace(cx, C2.z1 - 0.1, -1, sLab[i]);
  }
  // C-14 jammed 40 cm up: somebody's arm reaching out underneath
  L.box(-8.4, y, C2.z1 - 0.14, -5.6, y + 0.4, C2.z1 - 0.1, 'blackMatte', { collide: false, tint: 0x050505 });
  const arm = P.prop(L, -7.0, y, C2.z1 - 0.35, 0.3); arm.box(0, 0.06, 0, 0.1, 0.1, 0.55, 'fabric', 0x3a4a2a).box(0, 0.05, -0.32, 0.09, 0.07, 0.12, 'fabric', 0x8a7060);
  blood(L, -7.0, y, C2.z1 - 0.5, 1.2, 5);
  // --- open unit C-08 (north): someone's hoard, picked over
  const part = (a, b, c, d) => L.box(a, y, b, c, H - 0.6, d, 'metal', { tint: 0x9a9e9e });
  part(-5.35, -7.6, -5.25, C2.z0 - 0.1); part(-1.95, -7.6, -1.85, C2.z0 - 0.1);
  L.box(-5.25, y - 0.01, -7.6, -1.95, y + 0.005, C2.z0 - 0.1, 'concreteFloor', { collide: false, tint: 0x5a5854 });
  L.box(-5.4, y + 2.5, C2.z0 - 0.25, -1.8, y + 2.85, C2.z0 + 0.15, 'metal', { collide: false, tint: 0xd06a1a }); // rolled-up door drum
  cardboard(L, -4.6, y, -6.8, 0.2, 4); cardboard(L, -2.6, y, -7.0, -0.3, 3); cardboard(L, -3.4, y, -6.9, 0.1, 2);
  P.dresser(L, -4.7, y, -4.4, Math.PI / 2);
  const bike = P.prop(L, -2.5, y, -4.0, 0.3); bike.torus(0, 0.33, -0.5, 0.32, 0.02, 'rubber', 0x151515, [0, Math.PI / 2, 0], 4, 16).torus(0, 0.33, 0.5, 0.32, 0.02, 'rubber', 0x151515, [0, Math.PI / 2, 0], 4, 16).tube(0, 0.33, -0.5, 0, 0.75, 0.1, 0.02, 'paintedRed', 0xa02018).tube(0, 0.75, 0.1, 0, 0.33, 0.5, 0.02, 'paintedRed', 0xa02018).tube(0, 0.75, 0.1, 0, 0.9, -0.45, 0.02, 'paintedRed', 0xa02018);
  L.item('pills', -4.7, y + 0.95, -4.4, { chance: 0.6 });
  L.item('throwable', -2.4, y + 0.02, -6.9, { chance: 0.55 });
  graffiti(L, 'TOOK THE\nFOOD. SORRY', -3.6, y + 1.9, -7.58, 0, 1.4, 0.7, '#1a2a8a');
  // --- open unit C-16 (south): a last-minute armoury
  part(-1.95, C2.z1 + 0.1, -1.85, 7.6);
  L.box(-1.85, y - 0.01, C2.z1 + 0.1, 1.3, y + 0.005, 7.6, 'concreteFloor', { collide: false, tint: 0x5a5854 });
  L.box(-1.6, y + 2.5, C2.z1 - 0.15, 1.2, y + 2.85, C2.z1 + 0.25, 'metal', { collide: false, tint: 0xd06a1a });
  shelving(L, 0.9, y, 5.6, -Math.PI / 2, 2.0, 2.0, 0.8);
  P.table(L, -0.6, y, 6.9, 0, 1.6, 0.7, 'woodDark');
  ammoCrate(L, -1.2, y, 3.2, 0.3); ammoCrate(L, -1.2, y + 0.34, 3.2, 0.2);
  L.item('tier2', -0.6, y + 0.78, 6.9, { chance: 0.45 });
  L.item('ammo', -0.1, y + 0.02, 5.4, { chance: 0.6 });
  sign(L, 'NEWBURG GUN CLUB\nMEMBERS ONLY', -0.3, y + 2.0, 7.58, Math.PI, 1.3, 0.5, { bg: '#2a2a1a', fg: '#e8d8a0' });
  // west end: the corridor we came in through, barricaded behind us
  const pile = P.prop(L, -11.2, y, -0.2, 0);
  pile.box(-0.4, 1.0, 0.2, 0.5, 2.0, 2.2, 'metalDark', 0x4a4e52, [0, 0.1, 0.05]); // toppled shelving
  pile.box(0.3, 0.45, -0.8, 1.6, 0.25, 1.0, 'fabric', 0xb8a890, [0.3, 0.4, 0.9]); // mattress
  for (let i = 0; i < 6; i++) pile.box(0.2 + (rng() - 0.5) * 0.8, 0.25 + i * 0.3, (rng() - 0.5) * 2.2, 0.5, 0.45, 0.5, 'paper', rng.pick([0x9a7a50, 0x8a6a40, 0xa88a60]), [0, rng() * 0.8, 0]);
  pile.box(0.5, 0.35, 0.9, 0.6, 0.7, 0.5, 'plastic', 0xd06a1a);
  L.box(-12.1, y, C2.z0 + 0.1, -10.5, y + 2.4, C2.z1 - 0.1, 'metal', { visible: false });
  graffiti(L, 'CAME IN\nTHIS WAY.\nNOT GOING\nBACK', -12.08, y + 2.9, -0.2, Math.PI / 2, 1.4, 0.9, '#b8201a');
  // east end: the rear exit
  const exit = new Door(L, 8.0, y, -0.2, 'z', { width: 1.2, hinge: -1, material: 'metalClean' });
  L.box(7.82, y, -0.9, 7.84, y + 2.35, 0.5, 'metalDark', NC);
  L.box(8.16, y, -0.9, 8.18, y + 2.35, 0.5, 'metalDark', NC);
  sign(L, 'EXIT', 7.8, y + 2.7, -0.2, Math.PI / 2, 0.5, 0.2, { bg: '#1a6a2a', fg: '#fff', glow: 1.0, lightColor: 0x40ff60, lightIntensity: 2 });
  sign(L, 'DRIVE-UP UNITS\nYARD EXIT', 7.8, y + 1.7, 0.95, Math.PI / 2, 0.8, 0.3, { bg: '#e8e0c8', fg: '#1a2a4a' });
  graffiti(L, 'AIRPORT\n→', 7.82, y + 1.5, -1.3, -Math.PI / 2, 0.6, 0.5, '#e8e8d8');
  // corridor dressing
  for (const [x, z, r] of [[-7.5, 0.3, 0.3], [-2.5, -0.9, 1.3]]) { const cart = P.prop(L, x, y, z, r); cart.box(0, 0.4, 0, 0.7, 0.05, 1.1, 'metalDark').box(0, 0.8, 0.5, 0.7, 0.8, 0.04, 'metalDark').col(0, 0.5, 0, 0.7, 1.0, 1.1, 'metal', F_SOLID | F_SHOOT); cardboard(L, x, y + 0.45, z - 0.1, r, 1); }
  P.corpse(L, -9.4, y + 0.01, -0.8, 1.9, 0x5a3a2a); blood(L, -9.4, y, -0.8, 1.5, 4);
  for (let i = 0; i < 6; i++) L.decal(-8 + i * 2.2 + (rng() - 0.5), y + 0.013, -0.2 + (rng() - 0.5) * 0.8, 0, 1, 0, 0.7, DFSMEAR());
  graffiti(L, 'MOTION\nLIGHTS.\nKEEP\nMOVING', -8.8, y + 1.6, C2.z0 + 0.12, 0, 1.3, 1.0, '#b8201a');
  poster(L, 'missing', 2.6, y + 1.5, C2.z0 + 0.12, 0, 0.35, 0.48, { title: 'RUTH OKAFOR' });
  poster(L, 'evac', -6.8, y + 1.55, C2.z1 - 0.12, Math.PI, 0.5, 0.72, { torn: 0.3 });
  L.reverb(cw0, y, C2.z0, cw1, H, C2.z1, 'hall');
  L.ambience(SS.x0, y, SS.z0, SS.x1, H, SS.z1, 'safe');
  // motion-sensor corridor lights (as in chapter 2): dark until someone walks under them
  const groups = [];
  const mk = (x0, x1, trig) => {
    const cx = (x0 + x1) / 2;
    for (const x of [x0, x1]) L.box(x - 0.6, H - 0.64, -0.28, x + 0.6, H - 0.6, -0.12, 'emissiveCool', NC);
    const g = { light: L.light(cx, H - 0.8, -0.2, 0xd8ecff, 0, 11, { on: false, buzz: 1 }), k: 0, on: false };
    groups.push(g);
    L.trigger(...trig, () => { if (!g.on) { g.on = true; game.audio.play('buttonPress', { pos: new THREE.Vector3(cx, H - 0.8, -0.2), vol: 0.5 }); } }, {});
  };
  mk(1.5, 6.5, [0, y - 0.5, C2.z0, cw1, y + 3, C2.z1]);
  mk(-8.5, -3.5, [-6, y - 0.5, C2.z0, 0, y + 3, C2.z1]);
  L.dynamics.push({ update(dt) { for (const g of groups) { if (!g.on || g.k >= 1) continue; g.k = Math.min(1, g.k + dt * 1.5); const fl = g.k < 0.6 ? (Math.random() < 0.5 ? 0 : 1) : 1; g.light.on = true; g.light.intensity = 10 * fl * g.k; } } });
  L.light(-10.5, H - 0.9, -0.2, 0xffb070, 2.5, 5, { flicker: 0.6 });
  return { exit };
}
const DFSMEAR = () => 13; // DF.SMEAR (kept numeric: decal frame index)

// ======================================================== SAFE ROOM C-17
function safeUnit(L, game) {
  const { x0, x1, z0, z1 } = C17, y = SY, H = 3.4;
  L.wallZ(z0 - 0.1, z1, 1.4, y, H, 'metal', 0.2, [], { tint: 0x9a9e9e });
  L.box(x0, H + 0.15, z0, x1, H + 0.2, z1, 'metal', { collide: false, tint: 0x7a7e7e });
  L.box(x0 + 0.05, y - 0.01, z0 + 0.05, x1, y + 0.005, z1 - 0.05, 'concreteFloor', { collide: false, tint: 0x6a6660 });
  const door = new RollupDoor(L, C17.door, y, C2.z1, 'x', { width: 2.6, height: 2.6, safe: true, label: 'SAFE ROOM', open: false });
  L.startSafe = [x0, y - 0.2, z0, x1, y + H, z1];
  sign(L, 'C-17', C17.door, y + 2.95, C2.z1 - 0.13, 0, 0.5, 0.22, { bg: '#1a2a4a', fg: '#fff' });
  L.box(C17.door - 1.45, y + 2.62, C2.z1 - 0.3, C17.door + 1.45, y + 2.75, C2.z1 + 0.1, 'metalDark', NC);
  // supplies: meds on the back wall, guns on the side wall
  supplies(L, 4.6, y, z1 - 0.55, Math.PI, ['medkit', 'medkit', 'medkit', 'medkit'], { w: 2.4, mat: 'metalClean' });
  supplies(L, x1 - 0.55, y, 3.9, -Math.PI / 2, ['smg', 'pumpShotgun', 'silencedSmg', 'chromeShotgun'], { w: 2.4, mat: 'woodDark' });
  L.item('ammo', x1 - 0.5, y + 0.02, 6.2);
  L.item('pills', 2.0, y + 0.02, 7.3, { chance: 0.6 });
  L.item('throwable', 2.1, y + 0.02, 1.9, { chance: 0.6 });
  L.item('melee', 1.9, y + 0.02, 5.2, { chance: 0.5 });
  const cot = P.prop(L, 2.2, y, 4.4, 0); cot.box(0, 0.42, 0, 0.7, 0.06, 1.9, 'fabric', 0x4a5a3a).box(0, 0.5, 0.6, 0.5, 0.1, 0.4, 'fabric', 0xd8d4c8).col(0, 0.25, 0, 0.7, 0.5, 1.9, 'fabric', F_SOLID | F_SHOOT);
  cardboard(L, 6.9, y, 7.2, 0.2, 3);
  const lan = P.prop(L, 4.4, y + 0.78, z1 - 0.55, 0); lan.cyl(0, 0.12, 0, 0.08, 0.24, 'plastic', 0x2a5a2a).cyl(0, 0.14, 0, 0.06, 0.12, 'emissiveWarm');
  L.light(4.4, y + 1.4, z1 - 1.2, 0xffd8a0, 8, 8, { flicker: 0.08 });
  L.box(4.0, H - 0.1, 4.4, 5.0, H - 0.05, 4.6, 'emissiveWarm', NC);
  L.light(4.5, H - 0.4, 4.5, 0xffe2b0, 7, 8, {});
  // the same notes the team read on the way in (chapter 2's end room)
  for (const [t, gx, gy, gz, ry, c] of [
    ['C-17\nSAFE\nDON\'T OPEN\nFOR SCREAMS', x0 + 0.02, 1.7, 3.6, Math.PI / 2, '#b8201a'],
    ['AIRPORT →\nFOLLOW THE\nPOWER LINES', x0 + 0.02, 1.8, 6.4, Math.PI / 2, '#1a2a8a'],
    ['MIKE + ANA\nWAITED 3 DAYS', 6.2, 1.9, z1 - 0.02, 0, '#202020'],
    ['CONSTRUCTION\nSITE NEXT —\nGAS CANS ON THE\nBARRICADE', 2.8, 2.2, z1 - 0.02, 0, '#3a6a2a'],
  ]) graffiti(L, t, gx, y + gy, gz, ry, 1.4, 0.9, c);
  wallMessages(L, x1 - 0.02, y + 1.7, 5.4, -Math.PI / 2, 2.4, 1.2, { lines: ['STOR-SAFE C-17', 'LOCK ROLLS DOWN FROM INSIDE', 'SHOOT THE RED TANKS', 'POWER STATION → AIRPORT'], density: 0.7 });
  L.ambience(x0, y, z0, x1, y + H, z1, 'safe');
  L.reverb(x0, y, z0, x1, y + H, z1, 'safe');
  L.survivorStart.push(
    { x: 3.0, y, z: 3.6, yaw: 0.25 }, { x: 5.6, y, z: 3.4, yaw: -0.1 },
    { x: 3.2, y, z: 5.6, yaw: 0.1 }, { x: 5.4, y, z: 5.7, yaw: 0 },
  );
  L.flowStart = [4.4, y, 4.8];
  return { door };
}

// ======================================================= DRIVE-UP YARD
function yard(L, game) {
  const { x0, x1, z0, z1 } = YARD;
  L.box(x0, -0.3, z0 - 0.2, x1, 0, z1 + 0.2, 'asphalt', { tint: 0x5a5a5c });
  for (let x = 12; x < 32; x += 3.8) for (const z of [-9.4, 7.2]) L.box(x, 0.002, z - 1.3, x + 0.1, 0.01, z + 1.3, 'paintedWhite', { collide: false, tint: 0xc8c8b8 });
  L.box(x0, 0, -1.2, 9.4, SY, 0.8, 'concrete', { tint: 0x9a968e });
  // drive-up unit rows (north + south), roll-up doors facing the lane
  const rowH = 3.3;
  L.box(x0, 0, -20, x1, rowH, z0 - 0.2, 'metal', { tint: 0xb8b8b0 });
  L.box(x0, 0, z1 + 0.2, x1, rowH, 17, 'metal', { tint: 0xb8b8b0 });
  L.box(x0, rowH, -20.2, x1, rowH + 0.25, z0 - 0.1, 'metal', { collide: false, tint: 0x8a8e8e });
  L.box(x0, rowH, z1 + 0.1, x1, rowH + 0.25, 17.2, 'metal', { collide: false, tint: 0x8a8e8e });
  L.box(x0, rowH - 0.55, z0 - 0.23, x1, rowH - 0.25, z0 - 0.2, 'paintedRed', { collide: false, tint: 0xe86a10 });
  L.box(x0, rowH - 0.55, z1 + 0.2, x1, rowH - 0.25, z1 + 0.23, 'paintedRed', { collide: false, tint: 0xe86a10 });
  const door = (cx, fz, s, n, raised = 0) => {
    const w = 2.9;
    if (raised < 2.5) {
      L.box(cx - w / 2, raised, fz, cx + w / 2, 2.6, fz + s * 0.03, 'paintedRed', { collide: false, tint: 0xd06a1a });
      for (let yy = raised + 0.14; yy < 2.6; yy += 0.18) L.box(cx - w / 2, yy, fz + s * 0.03, cx + w / 2, yy + 0.03, fz + s * 0.045, 'paintedRed', { collide: false, tint: 0x8a4010 });
    }
    L.box(cx - w / 2 - 0.12, 0, fz, cx - w / 2, 2.8, fz + s * 0.1, 'metalDark', NC);
    L.box(cx + w / 2, 0, fz, cx + w / 2 + 0.12, 2.8, fz + s * 0.1, 'metalDark', NC);
    L.box(cx - w / 2 - 0.12, 2.6, fz, cx + w / 2 + 0.12, 2.85, fz + s * 0.25, 'metalDark', NC);
    sign(L, n, cx, 3.0, fz + s * 0.03, 0, 0.6, 0.24, { bg: '#1a2a4a', fg: '#fff' });
    if (raised === 0) L.box(cx - 0.15, 0.2, fz + s * 0.03, cx + 0.15, 0.3, fz + s * 0.08, 'chrome', NC);
  };
  const xs = [11.2, 15.0, 18.8, 22.6, 26.4, 30.2];
  xs.forEach((cx, i) => { if (i !== 3) door(cx, z0 - 0.2, -1, 'D-' + (10 + i)); });
  xs.forEach((cx, i) => { if (i !== 1) door(cx, z1 + 0.2, 1, 'D-' + (20 + i), i === 4 ? 0.5 : 0); });
  // open north unit D-13: a classic car under a cover, junk
  L.box(21.0, 0, -18.4, 24.2, rowH, z0 - 0.2, 'metal', { visible: false }); // (carved below)
  // (visible unit interior: walls are the row box, so draw a dark recess instead)
  L.box(21.1, 0.01, z0 - 0.23, 24.1, 2.55, z0 - 0.21, 'blackMatte', { collide: false, tint: 0x0a0a0a });
  L.box(21.0, 2.6, z0 - 0.5, 24.2, 2.95, z0 - 0.1, 'metal', { collide: false, tint: 0xd06a1a });
  // open south unit D-21: somebody camped here
  L.box(13.6, 0, z1 + 0.2, 16.4, 0.02, z1 + 0.2, 'metal', NC);
  const camp = P.prop(L, 15.0, 0, z1 + 1.2, 0);
  camp.box(-0.7, 0.12, 0.4, 0.9, 0.22, 1.9, 'fabric', 0x6a5a8a).box(0.7, 0.12, 0.3, 0.9, 0.22, 1.9, 'fabric', 0x3a5a3a).box(0, 0.3, -0.5, 0.5, 0.6, 0.4, 'plastic', 0x2a2a2a);
  L.box(13.5, 0.01, z1 + 0.19, 16.5, 2.55, z1 + 0.21, 'blackMatte', { collide: false, tint: 0x0a0a0a });
  L.box(13.4, 2.6, z1 + 0.1, 16.6, 2.95, z1 + 0.5, 'metal', { collide: false, tint: 0xd06a1a });
  // (units are shallow alcoves: the recess reads as depth from the lane)
  // rental truck being loaded in a hurry, ramp down
  P.truck(L, 16.2, 0, -4.0, Math.PI / 2 + 0.06, 0xe8e4d8);
  sign(L, 'HAUL-IT\nRENTALS', 17.7, 2.1, -5.3, 0.06, 3.2, 1.2, { bg: '#e8e4d8', fg: '#e86a10' });
  const rampP = P.prop(L, 22.6, 0, -3.6, Math.PI / 2 + 0.06); rampP.box(0, 0.45, 0, 1.0, 0.05, 2.2, 'diamond', null, [-0.4, 0, 0]);
  cardboard(L, 23.6, 0, -2.0, 0.4, 3); cardboard(L, 24.4, 0, -4.8, -0.2, 2);
  P.sofa(L, 25.4, 0, -7.2, 0.5, 0x6a4a3a);
  const mat = P.prop(L, 21.0, 0, -8.7, 0.1); mat.box(0, 0.9, 0.15, 1.5, 1.9, 0.22, 'fabric', 0xd8d0c0, [-0.1, 0, 0]);
  for (const [x, z, c] of [[27.2, 4.4, 0x6a1a1a], [27.8, 3.6, 0x1a2a4a]]) { const s = P.prop(L, x, 0, z, rng() * 3); s.box(0, 0.36, 0, 0.45, 0.7, 0.25, 'fabric', c).col(0, 0.36, 0, 0.45, 0.72, 0.25, 'fabric', F_SOLID | F_SHOOT); }
  // escape car with the boot open and the driver still inside
  P.car(L, 25.5, 0, 5.2, 1.3, { color: 0x2a3a5a, damaged: true });
  const boot = P.prop(L, 25.5, 0, 5.2, 1.3); boot.box(0, 1.35, 2.25, 1.6, 0.05, 0.9, 'carPaint', 0x2a3a5a, [-1.1, 0, 0]);
  // burnt-out wreck near the gate
  P.car(L, 30.8, 0, -7.2, 0.35, { burnt: true });
  L.decal(30.8, 0.02, -7.2, 0, 1, 0, 5, 20);
  // security lights
  P.streetLight(L, 12.5, 0, 8.6, Math.PI, { on: true, intensity: 18, range: 15, flicker: 0.15 });
  P.streetLight(L, 28.5, 0, -10.6, 0, { on: true, intensity: 20, range: 16 });
  L.box(8.16, 2.9, -0.5, 8.3, 3.1, 0.1, 'emissiveWarm', NC);
  L.light(8.9, 2.8, -0.2, 0xffd8a0, 6, 7, { flicker: 0.2 });
  // dressing
  sign(L, 'STOR-SAFE\nDRIVE-UP UNITS D-10 — D-25', 9.6, 2.6, z0 - 0.22, 0, 2.6, 0.7, { bg: '#e86a10', fg: '#fff' });
  graffiti(L, 'FOLLOW THE\nPOWER LINES', 18.8, 1.6, z1 + 0.22, Math.PI, 2.4, 0.9, '#e8e8d8');
  graffiti(L, 'EVAC FLIGHTS\nAT DAWN??', 30.2, 1.5, z0 - 0.22, 0, 1.8, 0.8, '#b8201a');
  poster(L, 'evac', 8.17, 1.6, 3.6, Math.PI / 2, 0.5, 0.72, { torn: 0.3, wet: 0.5 });
  poster(L, 'quarantine', 8.17, 1.6, -4.4, Math.PI / 2, 0.6, 0.85, {});
  for (let i = 0; i < 10; i++) L.decal(9.6 + i * 2.4, 0.013, -0.3 + Math.sin(i) * 0.9, 0, 1, 0, 0.9, 13);
  P.corpse(L, 20.4, 0.01, 1.8, 0.6, 0x6a5a3a); blood(L, 20.4, 0, 1.8, 1.6, 4);
  P.corpse(L, 12.4, 0.01, -8.4, 2.4, 0x2a2a3a); blood(L, 12.4, 0, -8.4, 1.3, 1);
  P.trashCan(L, 9.2, 0, 7.4);
  L.item('pipebomb', 15.1, 0.02, z1 + 0.9, { chance: 0.45 });
  L.item('tier1', 23.5, 0.02, -2.4, { chance: 0.35 });
  // the vehicle gate, pushed off its track
  for (const z of [ALLEY.z0 - 0.2, ALLEY.z1 + 0.2]) L.box(x1 - 0.12, 0, z - 0.12, x1 + 0.12, 2.6, z + 0.12, 'metalDark');
  const gt = P.prop(L, x1 + 1.6, 0, -1.2, 0.6);
  gt.box(0, 0.05, 0, 0.1, 0.1, 5.8, 'metal', 0x6a6a64).box(0, 0.12, 0, 2.3, 0.02, 5.6, 'chainLink').box(0, 0.05, 2.8, 2.4, 0.1, 0.1, 'metal', 0x6a6a64).box(0, 0.05, -2.8, 2.4, 0.1, 0.1, 'metal', 0x6a6a64);
  safetySign(L, 'STOR-SAFE\nNO LOITERING · CCTV', x1 - 0.14, 2.0, ALLEY.z0 - 0.5, Math.PI / 2, 1.1, 0.45, 'notice');
  L.reverb(x0, 0, z0, x1, 8, z1, 'outdoor');
  L.ambience(x0, -1, z0 - 1, x1, 12, z1 + 1, 'city');
}

// ================================================================= ALLEY
function alley(L, game) {
  const { x0, x1, z0, z1 } = ALLEY;
  L.box(x0, -0.3, z0, x1, 0, z1, 'asphalt', { tint: 0x4a4a4c });
  L.box(x0, -0.02, -0.15, x1, 0.004, 0.15, 'concrete', { collide: false, tint: 0x3a3a3a }); // drain line
  L.box(x0, 0, -22, x1, 11, z0, 'brick', { tint: 0x7a5040 });
  L.box(x0, 0, z1, x1, 8.5, 20, 'brickTan', { tint: 0x9a7a5c });
  L.box(x0, 11, -22, x1, 11.8, z0 + 0.4, 'concrete', { collide: false, tint: 0x6a6660 });
  fireEscapeDeco(L, 's', 38, 45, z0, 3.6, 11, 3.6);
  fireEscapeDeco(L, 'n', 46, 52, z1, 3.6, 8.5, 3.6);
  // back doors, lamps, vents, AC units, pipes
  for (const [x, z, s] of [[41, z0, 1], [50, z1, -1], [37, z1, -1]]) {
    L.box(x - 0.55, 0, z + s * 0.0, x + 0.55, 2.2, z + s * 0.05, 'metal', { collide: false, tint: 0x5a6a5a });
    L.box(x - 0.15, 2.4, z, x + 0.15, 2.6, z + s * 0.2, 'metalDark', NC);
  }
  L.box(40.85, 2.42, z0 + 0.19, 41.15, 2.5, z0 + 0.21, 'emissiveWarm', NC);
  L.light(41, 2.3, z0 + 0.8, 0xffc080, 7, 8, { flicker: 0.35 });
  L.box(49.85, 2.42, z1 - 0.21, 50.15, 2.5, z1 - 0.19, 'emissiveWarm', NC);
  L.light(50, 2.3, z1 - 0.8, 0xffc080, 6, 8, { flicker: 0.1 });
  for (const [x, yy] of [[44, 4.2], [48.5, 6.4]]) P.acUnit(L, x, yy, z0 + 0.7, Math.PI);
  P.pipe(L, 35, 0, z1 - 0.12, 35, 8.4, z1 - 0.12, 0.07, 'metalDark');
  P.pipe(L, 52.6, 0, z0 + 0.12, 52.6, 11, z0 + 0.12, 0.09, 'rust');
  // obstacles (keep a 2 m lane): dumpsters, bags, pallets, a toppled fence
  P.dumpster(L, 37.6, 0, z0 + 0.7, 0, 0x2a4a3a);
  P.trashBags(L, 39.4, 0, z0 + 0.8, 5);
  P.dumpster(L, 45.8, 0, z1 - 0.9, Math.PI + 0.3, 0x5a3a2a);
  P.trashBags(L, 47.6, 0, z1 - 0.6, 4);
  P.pallet(L, 43.0, 0, z0 + 0.8, 0.2, false); P.pallet(L, 43.0, 0.14, z0 + 0.8, 0.5, false);
  P.fenceChain(L, 44.5, z0, 44.5, -0.9, 0, 2.4);
  const fg = P.prop(L, 45.4, 0, 1.6, 0.9); fg.box(0, 1.1, 0, 2.2, 2.2, 0.03, 'chainLink').box(0, 2.2, 0, 2.2, 0.04, 0.04, 'metal', 0x8a8a86).box(-1.1, 1.1, 0, 0.04, 2.2, 0.04, 'metal', 0x8a8a86);
  burningBarrel(L, 52.2, 0, z1 - 0.8);
  P.corpse(L, 49.4, 0.01, -1.2, 2.6, 0x3a4a2a); blood(L, 49.4, 0, -1.2, 1.8, 4);
  P.corpse(L, 38.6, 0.01, 1.8, 0.3, 0x5a2a2a);
  graffiti(L, 'THE AIRPORT\nIS A TRAP', 42.5, 2.2, z1 - 0.02, Math.PI, 2.6, 1.0, '#b8201a');
  graffiti(L, 'PLANES STILL\nFLYING —\nI SAW ONE', 48.2, 1.6, z0 + 0.02, 0, 2.0, 0.9, '#e8e8d8');
  graffiti(L, 'VEX', 36.2, 1.4, z0 + 0.02, 0, 1.3, 0.6, '#e05a1a', { style: 'throwup', color2: '#141414' });
  graffiti(L, 'KNOX', 52.0, 3.2, z1 - 0.02, Math.PI, 1.2, 0.5, '#20a0d0', { style: 'tag' });
  posterWall(L, 38.5, 1.4, z1 - 0.02, Math.PI, 2.2, 1.4, { kinds: ['concert', 'flyer', 'missing'] });
  // steam from a vent grate
  const vent = [47.0, 0.02, -2.3];
  L.box(vent[0] - 0.4, 0.0, vent[2] - 0.3, vent[0] + 0.4, 0.02, vent[2] + 0.3, 'metalDark', NC);
  let st = 0;
  L.dynamics.push({ update(dt) { st -= dt; if (st > 0) return; st = 0.35; const cp = game.camPos; if (Math.hypot(cp.x - vent[0], cp.z - vent[2]) < 45) game.fx.smokeColumn(vent[0], 0.2, vent[2], 0.5, [0.5, 0.5, 0.52]); } });
  cablesOver(L);
  L.reverb(x0, 0, z0, x1, 11, z1, 'outdoor');
  L.ambience(x0, -1, z0, x1, 12, z1, 'city');
}
function cablesOver(L) {
  for (let x = 37; x < 54; x += 5.5) P.pipe(L, x, 6.2, ALLEY.z0, x + 1.2, 5.6, ALLEY.z1, 0.012, 'rubber', 0x151515);
}

// ============================================================ KESSLER AVE
function kessler(L, game) {
  const { x0, x1, z0, z1 } = KES;
  street(L, x0, z0, x1, z1, 'z', { sidewalk: 2.4, noSidewalk: [[ALLEY.z0, ALLEY.z1]] });
  L.box(x0, 0, ALLEY.z0, x0 + 2.4, 0.004, ALLEY.z1, 'asphalt', NC);
  // west frontage (beyond the alley corner buildings)
  L.box(40, 0, -34, x0, 14, -22, 'brickDark', { tint: 0x5a4034 });
  L.box(40, 0, 20, x0, 10, 34, 'concrete', { tint: 0x9a968a });
  for (const [za, zb, t, bg, fg] of [[-21.6, -4, 'KESSLER HARDWARE', '#1a3a2a', '#e8e0c0'], [4, 19.6, 'LUCKY 7 LIQUOR', '#8a1a14', '#ffe060']]) {
    for (let z = za + 1.2; z < zb - 1; z += 2.8) L.box(x0 - 0.02, 0.5, z - 1.1, x0, 3.0, z + 1.1, 'glassDirty', { collide: false, tint: 0x1a2024 });
    sign(L, t, x0 + 0.03, 3.8, (za + zb) / 2, Math.PI / 2, Math.min(8, zb - za - 2), 0.8, { bg, fg });
  }
  sign(L, 'PAWN · GUNS · GOLD', x0 + 0.03, 3.6, -28, Math.PI / 2, 5, 0.8, { fg: '#ffd040', glow: 1.0, lightColor: 0xffb040, lightIntensity: 3 });
  L.box(68, 0, 30.1, 96, 9, 40, 'brick', { tint: 0x6a4a3a });
  // street ends: wreck piles + clips
  for (const [zz, s] of [[z0, 1], [z1, -1]]) {
    L.clip(x0, 0, zz - (s > 0 ? 0.6 : -0.1), x1, 7, zz + (s > 0 ? 0.1 : 0.6), F_SOLID | F_SHOOT);
    P.bus(L, 61, 0, zz + s * 2.6, Math.PI / 2 + s * 0.12, { burnt: s > 0 });
    P.car(L, 56.2, 0, zz + s * 5.6, 0.9, { burnt: true });
    P.car(L, 66.2, 0, zz + s * 5.2, -0.5, {});
  }
  fireSource(L, 61, 1.6, z0 + 2.6, 1.3, { hazard: false, intensity: 14 });
  // ---- the checkpoint that failed
  for (const [x, z, r, len] of [[57.6, -6.4, 0, 3.6], [64.8, 6.0, 0, 3.6], [59.6, 9.4, Math.PI / 2, 2.4], [63.2, -9.6, Math.PI / 2, 2.4]]) P.sandbags(L, x, 0, z, r, len, 3);
  for (const [x, z, r] of [[56.8, -11.2, Math.PI / 2 + 0.15], [66.4, -12.4, 0.3], [57.2, 12.4, 0.2], [66.0, 11.2, Math.PI / 2 - 0.2]]) jersey(L, x, 0, z, r, 2.0);
  razorWire(L, 56.4, 0, -4.2, 0.1, 3.2);
  razorWire(L, 65.8, 0, 4.0, -0.15, 3.0);
  P.truck(L, 61.0, 0, -19.0, 0.08, 0x3a4a2a);
  sign(L, 'U.S. ARMY', 61.3, 2.0, -21.4, Math.PI / 2 + 0.08, 1.6, 0.4, { bg: '#2a3a1a', fg: '#e8e8d0' });
  P.van(L, 63.6, 0, 18.6, 0.3, 0x3a4a2a);
  tent(L, 58.6, 0.15, 17.4, 0.05, 4.4, 3.6, {});
  for (let i = 0; i < 5; i++) P.bodyBag(L, 55.4 + (i % 3) * 0.9, 0.16, 14.8 + Math.floor(i / 3) * 1.9, 0.05);
  const board = P.prop(L, 55.2, 0.15, -1.2, Math.PI / 2);
  board.box(0, 1.2, 0, 2.6, 1.4, 0.06, 'wood', 0x6a6a50).box(-1.1, 0.6, 0.05, 0.08, 1.2, 0.08, 'wood', 0x5a5a40).box(1.1, 0.6, 0.05, 0.08, 1.2, 0.08, 'wood', 0x5a5a40);
  sign(L, 'MILITARY CHECKPOINT\nALL CIVILIANS PROCEED TO\nMETRO INTERNATIONAL AIRPORT\nVIA ROUTE 9', 55.24, 1.35, -1.2, Math.PI / 2, 2.4, 1.2, { bg: '#2a3a1a', fg: '#e8e8d0' });
  P.floodLight(L, 66.4, 0, -15.6, 0.6, { h: 4.8, intensity: 30, range: 22, flicker: 0.35 });
  const fl = P.prop(L, 64.0, 0, 13.2, 1.1); fl.rbox(0, 0.4, 0, 1.2, 0.7, 2.0, 0.05, 'paintedYellow', 0xd8a020, [0, 0, 0.2]).cyl(0.6, 0.5, 1.8, 0.06, 4, 'metalClean', 0x9a9e9e, [Math.PI / 2 - 0.1, 0, 0], 8);
  P.radioTable(L, 62.2, 0, 14.4, Math.PI);
  soundEmitter(L, 62.2, 1.0, 14.4, ['radioStatic', 'radioBeep'], { min: 5, max: 9, vol: 0.5, range: 30 });
  ammoCrate(L, 58.8, 0, -7.4, 0.2); ammoCrate(L, 59.6, 0, -7.6, -0.1); jerryCans(L, 64.6, 0, 7.2, 0.4);
  P.corpse(L, 59.0, 0.01, 4.2, 1.2, 0x3a4a2a); blood(L, 59, 0, 4.2, 1.8, 4);
  P.corpse(L, 63.6, 0.01, -4.6, 2.2, 0x3a4a2a);
  hardHat(L, 60.2, 0, 2.4, 0, 0x3a4a2a);
  for (let i = 0; i < 12; i++) blood(L, 55 + rng() * 12, 0, -14 + rng() * 28, 0.7 + rng(), i);
  L.item('ammo', 59.2, 0.34, -7.4);
  L.item('tier2', 62.4, 0.8, 14.4, { chance: 0.5 });
  L.item('molotov', 64.2, 0.02, 6.2, { chance: 0.5 });
  hittable(L, 'car', 57.4, 0, 22.4, 0.3, { color: 0x7a7a78 });
  // street lights (one dead) + a burning car
  P.streetLight(L, 56.0, 0.15, -8.0, -Math.PI / 2, { on: true, intensity: 24, range: 18 });
  P.streetLight(L, 66.0, 0.15, 24.0, Math.PI / 2, { on: false });
  P.streetLight(L, 56.0, 0.15, 26.0, -Math.PI / 2, { on: true, intensity: 18, range: 16, flicker: 0.4 });
  P.car(L, 65.4, 0, -25.4, 0.25, { burnt: true });
  fireSource(L, 65.4, 0.8, -25.4, 0.7, { hazard: true });
  // road signs toward the airport
  for (const [x, z, t] of [[56.4, 6.8, 'METRO INTL AIRPORT ✈\n→ 1.5 MI'], [66.8, -2.0, 'DETOUR\nTRUCK ROUTE →']]) {
    L.box(x - 0.05, 0.15, z - 0.05, x + 0.05, 3.3, z + 0.05, 'metalDark');
    sign(L, t, x, 3.1, z, Math.PI / 2, 1.8, 0.7, { bg: '#1a5a2a', fg: '#fff', border: '#fff' });
  }
  L.reverb(x0, 0, z0, x1, 14, z1, 'outdoor');
  L.ambience(x0, -1, z0, x1, 14, z1, 'city');
}

export function buildStart(L, game) {
  const S = storage(L, game);
  const safe = safeUnit(L, game);
  yard(L, game);
  alley(L, game);
  kessler(L, game);
  return { ...S, ...safe };
}
