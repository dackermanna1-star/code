// Dead Air 3 — the last stretch: NEWBURG GENERATING STATION grounds (turbine
// hall, pipe bridge, fuel-oil tank farm, a fenced step-up transformer compound,
// the army post that tried to keep the airport lit), the airport plaza, the
// PARK-RITE P3 garage (entry lane -> ramp -> P1 deck with the car-alarm trap ->
// stair core -> P2 deck -> skybridge lobby), the glass SKYBRIDGE over Airport
// Drive and the end safe room: a Metro International conference-centre office
// (chapter 4 starts in the same room).
import * as THREE from 'three';
import { P, sign, graffiti, stencil, poster, posterWall, wallMessages, safeRoom, supplies, ceilingLight, physProp, fireSource, alarmCar, floorWithHoles, hittable } from './kit.js';
import { Door, WindowPane } from '../world/dynamic.js';
import { DF } from '../render/decals.js';
import { jersey, tent } from './ch3_props.js';
import { cardboard } from './da2_parts.js';
import { ceilingPipes } from './clutter.js';
import { VisualBatch } from './da_parts.js';
import {
  rng, NC, CLIP, blood, safetySign, hardHat, ammoCrate, jerryCans, cableDrum, breaker, transformerHum, pipeRack, bigPipe, smokeStack, coolingTower, ramp, F_SOLID, F_SHOOT,
} from './da3_parts.js';
import { PS, GAR, SKY, END } from './da3_layout.js';

const D1 = 0, D2 = GAR.D2, D3 = GAR.D3, ROOF = 10.2;

function fence(L, x0, z0, x1, z1, h = 3.0) {
  P.fenceChain(L, x0, z0, x1, z1, 0, h);
  if (Math.abs(x1 - x0) > Math.abs(z1 - z0)) L.box(Math.min(x0, x1), h, z0 - 0.05, Math.max(x0, x1), 4.4, z0 + 0.05, 'concrete', { visible: false, flags: CLIP });
  else L.box(x0 - 0.05, h, Math.min(z0, z1), x0 + 0.05, 4.4, Math.max(z0, z1), 'concrete', { visible: false, flags: CLIP });
}

// ======================================================== GENERATING STATION
function plant(L, game) {
  const { x0, x1, z0, z1 } = PS;
  L.box(x0, -0.3, z0, x1, 0, z1, 'asphalt', { tint: 0x55555a });
  // painted lanes
  for (let x = x0 + 2; x < x1 - 2; x += 4.5) L.box(x, 0.003, 11.9, x + 2.4, 0.012, 12.1, 'paintedWhite', { collide: false, tint: 0xd8d8c8 });
  L.box(x0 + 1, 0.003, -0.6, x1 - 1, 0.012, -0.45, 'paintedYellow', { collide: false, tint: 0xd0b030 });
  // perimeter: fence with the west gate (z 9..19) and the east gate (z -2..6)
  fence(L, x0, z0, x0, 9);
  fence(L, x0, 19, x0, z1);
  fence(L, x1, z0, x1, -2);
  fence(L, x1, 6, x1, z1);
  L.box(x0, 0, z1, x1, 3.2, z1 + 0.4, 'concreteDark', { tint: 0x8a867e });
  for (const z of [9, 19]) L.box(x0 - 0.25, 0, z - 0.25, x0 + 0.25, 3.4, z + 0.25, 'brick', { tint: 0x8a5a44 });
  for (const z of [-2, 6]) L.box(x1 - 0.25, 0, z - 0.25, x1 + 0.25, 3.4, z + 0.25, 'brick', { tint: 0x8a5a44 });
  // west gate: sliding gate rammed off its track, barrier arm snapped, gatehouse
  const sg = P.prop(L, 234.6, 0, 7.4, 0.5);
  sg.box(0, 1.2, 0, 4.2, 2.2, 0.03, 'chainLink').box(0, 2.3, 0, 4.2, 0.06, 0.06, 'metalDark').box(0, 0.12, 0, 4.2, 0.08, 0.08, 'metalDark').box(-2.1, 1.2, 0, 0.06, 2.3, 0.06, 'metalDark').box(2.1, 1.2, 0, 0.06, 2.3, 0.06, 'metalDark');
  sg.col(0, 1.2, 0, 4.2, 2.3, 0.12, 'metal', F_SOLID | F_SHOOT);
  const gh = P.prop(L, 235.4, 0, 22.2, 0);
  gh.rbox(0, 1.35, 0, 2.6, 2.7, 2.2, 0.04, 'paintedWhite', 0xd8d4c8).box(0, 2.8, 0, 3.0, 0.14, 2.6, 'metalDark', 0x3a3a3a);
  gh.box(0, 1.7, -1.11, 2.2, 0.9, 0.02, 'glassDirty', 0x2a3a3a).box(-1.31, 1.7, 0, 0.02, 0.9, 1.6, 'glassDirty', 0x2a3a3a);
  gh.glow(0, 2.5, -0.9, 0.5, 0.04, 0.3, 0xfff0d0);
  gh.col(0, 1.4, 0, 2.6, 2.8, 2.2, 'metal');
  const arm = P.prop(L, 234.2, 0, 19.6, 0);
  arm.box(0, 0.5, 0, 0.35, 1.0, 0.35, 'paintedYellow', 0xd8a820).box(0.9, 0.95, 0.1, 1.8, 0.08, 0.08, 'paintedWhite', 0xe8e0d8, [0, 0.5, -0.4]);
  arm.col(0, 0.5, 0, 0.4, 1.0, 0.4, 'metal');
  L.light(235.4, 2.4, 20.6, 0xfff0d0, 5, 7, { flicker: 0.2 });
  sign(L, 'NEWBURG GENERATING STATION', x0 - 0.1, 4.1, 14, -Math.PI / 2, 5.2, 0.7, { bg: '#1a3a6a', fg: '#ffffff', border: '#e8c020' });
  L.box(x0 - 0.2, 0, 11.3, x0 - 0.1, 4.5, 11.5, 'metalDark', NC); L.box(x0 - 0.2, 0, 16.5, x0 - 0.1, 4.5, 16.7, 'metalDark', NC);
  safetySign(L, 'ALL VISITORS\nREPORT TO SECURITY', x0 - 0.08, 1.8, 20.6, -Math.PI / 2, 1.0, 0.5, 'notice');
  safetySign(L, 'DANGER\nHIGH VOLTAGE', x0 - 0.08, 1.8, 5.0, -Math.PI / 2, 0.7, 0.5, 'danger');
  // ---- turbine hall (north)
  const T = [237, -34, 267, -12, 21];
  L.box(T[0], 0, T[1], T[2], 9, T[3], 'brick', { tint: 0x7a5040 });
  L.box(T[0] + 0.1, 9, T[1], T[2] - 0.1, T[4], T[3] - 0.1, 'metal', { tint: 0x7a8288 });
  L.box(T[0] - 0.2, T[4], T[1] - 0.2, T[2] + 0.2, T[4] + 0.6, T[3] + 0.1, 'metalDark', { tint: 0x4a4e52, collide: false });
  for (let x = T[0] + 1.5; x < T[2] - 1; x += 2.4) {
    L.box(x, 11, T[3] - 0.08, x + 1.6, 15.5, T[3] - 0.04, (x | 0) % 3 === 0 ? 'emissiveWindow' : 'glassDirty', { collide: false, tint: (x | 0) % 3 === 0 ? 0xffc890 : 0x1a2024 });
    L.box(x - 0.4, 9, T[3] - 0.14, x - 0.3, T[4], T[3] - 0.08, 'metalDark', { collide: false, tint: 0x4a4e52 });
  }
  for (let x = T[0] + 2; x < T[2] - 2; x += 4) L.box(x, 3.2, T[3], x + 2.2, 6.2, T[3] + 0.03, 'glassDirty', { collide: false, tint: 0x2a2a26 });
  // big roller door + personnel door
  L.box(247, 0, T[3], 254, 7.2, T[3] + 0.08, 'metal', { collide: false, tint: 0x8a8e8e });
  for (let y = 0.4; y < 7.2; y += 0.35) L.box(247, y, T[3] + 0.08, 254, y + 0.05, T[3] + 0.1, 'metalDark', { collide: false, tint: 0x5a5e5e });
  L.box(258.4, 0, T[3], 259.6, 2.2, T[3] + 0.06, 'metalDark', { collide: false, tint: 0x3a5a6a });
  L.light(259, 2.8, T[3] + 0.6, 0xffe0b0, 6, 9, { flicker: 0.1 });
  L.box(258.7, 2.6, T[3], 259.3, 2.7, T[3] + 0.2, 'emissiveWarm', NC);
  sign(L, 'NEWBURG GENERATING STATION', 252, 17.8, T[3] - 0.12, 0, 16, 1.6, { fg: '#e8e4d8', plain: false });
  sign(L, 'TURBINE HALL 1', 250.5, 7.8, T[3] + 0.1, 0, 3.2, 0.5, { bg: '#1a3a6a', fg: '#fff' });
  stencil(L, 'UNIT 1 · 2', 244, 7.6, T[3] + 0.04, 0, 2.2, 0.5, '#e8e8d8');
  // boiler house + stacks + cooling towers (backdrop)
  const B = new VisualBatch(L);
  B.box(236, 0, -58, 268, 34, -34.4, 'metal', { tint: 0x5a6068 });
  B.box(240, 34, -54, 264, 40, -40, 'metalDark', { tint: 0x3a3e44 });
  for (let x = 238; x < 266; x += 3) B.box(x, 18, -34.45, x + 1.4, 30, -34.4, 'emissiveWindow', { tint: (x % 2) ? 0x3a3a30 : 0xa88a50 });
  B.build(L);
  smokeStack(L, 244, -50, 3.2, 92);
  smokeStack(L, 259, -52, 3.0, 84, { tint: 0x7a766e });
  coolingTower(L, 200, -130, 28, 84);
  coolingTower(L, 268, -150, 30, 90);
  // ---- pipe bridge from the hall to the tank farm (the route passes under it)
  for (let z = -10; z <= 16; z += 6.5) {
    const f = P.prop(L, 241.5, 0, z, 0);
    for (const sx of [-1.6, 1.6]) f.box(sx, 3.1, 0, 0.3, 6.2, 0.3, 'metalDark', 0x4a4a4e).box(sx, 0.1, 0, 0.7, 0.2, 0.7, 'concrete');
    f.box(0, 6.2, 0, 3.8, 0.35, 0.35, 'metalDark', 0x4a4a4e).box(0, 4.5, 0, 3.5, 0.2, 0.2, 'metalDark', 0x4a4a4e);
    f.col(-1.6, 3.1, 0, 0.35, 6.2, 0.35, 'metal').col(1.6, 3.1, 0, 0.35, 6.2, 0.35, 'metal');
  }
  bigPipe(L, [240.5, 6.9, -12], [240.5, 6.9, 18], 0.5, 'metal', 0x8a8e88);
  bigPipe(L, [242.1, 6.75, -12], [242.1, 6.75, 18], 0.35, 'paintedYellow', 0xc8a020);
  bigPipe(L, [243.1, 6.65, -12], [243.1, 6.65, 18], 0.25, 'paintedRed', 0x8a2a1a);
  bigPipe(L, [240.3, 4.95, -12], [240.3, 4.95, 18], 0.25, 'metal', 0xa8aca8);
  // ---- pipe racks along the hall front (east half)
  for (const x of [248, 255, 262]) pipeRack(L, x, -10.4, -4.6, 6.4);
  bigPipe(L, [244, 6.9, -9.2], [267.6, 6.9, -9.2], 0.4, 'metal', 0x8a8e88);
  bigPipe(L, [244, 6.8, -7.8], [267.6, 6.8, -7.8], 0.3, 'paintedWhite', 0xc8c4b8);
  bigPipe(L, [244, 6.75, -6.4], [267.6, 6.75, -6.4], 0.25, 'paintedGreen', 0x3a6a3a);
  bigPipe(L, [244, 6.9, -9.2], [244, 6.9, -12], 0.4, 'metal', 0x8a8e88);
  // ---- step-up transformer compound (fenced island in the middle)
  const C = [249, 1.5, 259, 10];
  fence(L, C[0], C[1], C[2], C[1]); fence(L, C[0], C[3], C[2], C[3]); fence(L, C[0], C[1], C[0], C[3]); fence(L, C[2], C[1], C[2], C[3]);
  L.box(C[0], 0.001, C[1], C[2], 0.03, C[3], 'dirt', { collide: false, tint: 0x6c6a64 });
  P.transformer(L, 252, 0, 5.8, 0, { w: 3.2, d: 2.4, h: 3.2, color: 0x6a7a6a });
  P.transformer(L, 256.6, 0, 5.8, 0, { w: 2.2, d: 1.8, h: 2.4, color: 0x6a7a6a });
  breaker(L, 250.2, 0, 8.8, 0);
  for (const [x, z, ry] of [[254, 1.47, 0], [254, 10.03, Math.PI], [249.03, 6, Math.PI / 2 * -1], [258.97, 6, Math.PI / 2]]) safetySign(L, 'DANGER\nHIGH VOLTAGE\nKEEP OUT', x, 1.7, z, ry, 0.7, 0.5, 'danger');
  const hum = transformerHum(L, game, [[252, 2, 5.8], [256.6, 2, 5.8]], { vol: 0.8 });
  // ---- fuel-oil tank farm (south) behind a bund wall
  L.box(236, 0, 18.6, 266, 1.0, 18.9, 'concrete', { tint: 0x9a968e });
  L.box(236, 0, 18.9, 236.3, 1.0, 34, 'concrete', { tint: 0x9a968e });
  for (const [x, z, n] of [[244, 27, 1], [259, 27, 2]]) {
    const t = P.prop(L, x, 0, z, 0);
    t.cyl(0, 4.8, 0, 6, 9.6, 'metal', 0xc8c8c0, null, 32).frustum(0, 9.9, 0, 0.8, 6.05, 0.7, 'metal', 0xb8b8b0, null, 32);
    for (const sy of [2.4, 4.8, 7.2]) t.torus(0, sy, 0, 6.02, 0.04, 'metalDark', 0x6a6a68, [Math.PI / 2, 0, 0], 4, 32);
    for (let k = 0; k < 14; k++) t.box(-6.1, 0.5 + k * 0.66, -1.2 + k * 0.1, 0.1, 0.05, 0.6, 'metalDark', 0x4a4a48);
    t.col(0, 4.8, 0, 11.6, 9.6, 11.6, 'metal');
    sign(L, `FUEL OIL NO. 2\nTANK ${n}`, x, 5.2, z - 6.05, 0, 3.6, 1.2, { fg: '#1a2a4a', plain: false });
    safetySign(L, 'FLAMMABLE\nNO SMOKING', x + 3, 1.6, 18.55, 0, 0.8, 0.5, 'danger');
  }
  // ---- the army post: sandbags, a truck, a tent, floodlights, dead soldiers
  P.sandbags(L, 262.4, 0, 1.8, Math.PI / 2, 3.0, 3);
  P.sandbags(L, 262.4, 0, 8.4, Math.PI / 2, 2.4, 3);
  P.sandbags(L, 264.6, 0, -3.6, 0, 2.4, 3);
  P.truck(L, 262.8, 0, 14.6, Math.PI / 2 + 0.1, 0x3a4a2a);
  sign(L, 'U.S. ARMY', 262.9, 2.2, 13.34, 0.1, 1.4, 0.35, { bg: '#2a3a1a', fg: '#e8e8d0' });
  tent(L, 256.6, 0, -1.2, 0, 4.4, 3.6, {});
  P.floodLight(L, 265.6, 0, 12.4, -2.4, { h: 5.4, intensity: 34, range: 28, flicker: 0.2 });
  P.floodLight(L, 238.6, 0, -2.4, -0.9, { h: 5.4, intensity: 30, range: 26 });
  ammoCrate(L, 261.2, 0, 4.2, 0.3); ammoCrate(L, 261.0, 0, 5.2, -0.2); jerryCans(L, 260.6, 0, 11.2, 0.4);
  P.radioTable(L, 257.4, 0.02, -2.4, 0);
  P.corpse(L, 263.6, 0.01, 4.8, 1.4, 0x3a4a2a); blood(L, 263.6, 0, 4.8, 1.8, 4);
  P.corpse(L, 258.2, 0.01, 13.2, 2.8, 0x3a4a2a);
  P.corpse(L, 246.2, 0.01, -4.2, 0.4, 0x2a3a5a); blood(L, 246.2, 0, -4.2, 1.4, 0);
  hardHat(L, 261.8, 0, 6.6, 0.4, 0x3a4a2a);
  for (let i = 0; i < 12; i++) blood(L, 236 + rng() * 30, 0, -3 + rng() * 20, 0.6 + rng(), i + 3);
  // shell casings + a burning barrel
  P.barrel(L, 244.6, 0, 14.6, 0x3a2a20, true);
  fireSource(L, 244.6, 0.9, 14.6, 0.45, { hazard: false, intensity: 10 });
  // plant vehicles
  P.car(L, 239.6, 0, 3.4, 0.1, { color: 0xe8e4d8 });
  sign(L, 'NP&L', 238.7, 0.95, 3.4, -Math.PI / 2 + 0.1, 0.6, 0.25, { bg: '#1a3a7a', fg: '#fff', paper: false });
  P.van(L, 264.2, 0, -8.0, 0.1, 0xe8e4d8);
  cableDrum(L, 248.6, 0, 14.6, 0.3, 0.7);
  L.item('ammo', 261.2, 0.62, 4.6);
  L.item('tier2', 257.4, 0.9, -2.6, { chance: 0.7 });
  L.item('health', 260.0, 0.02, 10.6, { chance: 0.6 });
  L.item('throwable', 256.0, 0.02, 0.2, { chance: 0.6 });
  // wall art + story
  graffiti(L, 'ARMY HELD\nTHE LIGHTS ON\n3 DAYS', 244, 1.6, -11.94, 0, 2.2, 1.0, '#b8201a');
  graffiti(L, 'AIRPORT\n→', x1 - 0.06, 1.5, 9.2, -Math.PI / 2, 1.0, 0.7, '#e8e0c8', { style: 'stencil' });
  posterWall(L, 237.04, 1.4, -16, -Math.PI / 2, 2.4, 1.4, { kinds: ['evac', 'quarantine', 'health'] });
  L.witchSpots.push({ x: 246, y: 0, z: -9 });
  L.reverb(x0, 0, z0, x1, 24, z1, 'outdoor');
  L.ambience(x0, -1, z0, x1, 24, z1, 'city');
  return { hum };
}

// =================================================================== PLAZA
function plaza(L, game) {
  const x0 = PS.x1, x1 = GAR.x0;
  L.box(x0, -0.3, -34, x1, 0, 34, 'sidewalk', { tint: 0x8a867e });
  // ends + the garage's neighbours
  L.box(x0, 0, -34.4, x1, 4, -34, 'concrete', { tint: 0x8a867e });
  L.box(x0, 0, 34, x1, 4, 34.4, 'concrete', { tint: 0x8a867e });
  L.box(x1, 0, -34, x1 + 36, 12, -20.3, 'concreteDark', { tint: 0x6a6660 });
  L.box(x1, 0, 20.3, x1 + 36, 12, 34, 'concreteDark', { tint: 0x6a6660 });
  for (const z of [-30, -25]) sign(L, z < -27 ? 'METRO INTL ✈' : 'HERTZ-EE RENT-A-CAR', x1 - 0.03, 3.6, z, -Math.PI / 2, 3.4, 0.6, { bg: z < -27 ? '#1a3a6a' : '#e8c020', fg: z < -27 ? '#fff' : '#1a1a1a' });
  // planters, bollards, bus shelter, pay station, benches
  for (const z of [-16, -9, 9, 16]) P.planter(L, 270.6, 0, z, 0.7);
  for (const z of [-5.2, 7.2]) for (let k = 0; k < 3; k++) { const b = P.prop(L, 273.8 + k * 0.9, 0, z, 0); b.cyl(0, 0.45, 0, 0.1, 0.9, 'paintedYellow', 0xd8a820, null, 10).col(0, 0.45, 0, 0.2, 0.9, 0.2, 'metal'); }
  P.busStop(L, 269.4, 0, 24, Math.PI / 2, 3.2);
  poster(L, 'airline', 268.9, 1.6, 24, Math.PI / 2, 1.2, 0.8, { title: 'FLY NEWBURG', torn: 0.3 });
  P.bench(L, 270.0, 0, -24, Math.PI / 2);
  // travellers who never made it
  P.luggageCart(L, 272.2, 0, 11.6, 0.8, true);
  for (const [x, z, r] of [[271.4, 13.8, 0.3], [273.0, 12.6, 2.1], [270.2, -12.4, 1.2], [274.6, -18.0, 0.4]]) P.suitcase(L, x, 0, z, r);
  P.corpse(L, 272.6, 0.01, 14.8, 2.4, 0x6a4a3a); blood(L, 272.6, 0, 14.8, 1.4, 1);
  P.corpse(L, 270.8, 0.01, -14.2, 0.9, 0x2a3a5a);
  // way-finding totem
  const tt = P.prop(L, 271.8, 0, 3.2, 0);
  tt.box(0, 1.4, 0, 0.9, 2.8, 0.25, 'metalDark', 0x22262c).col(0, 1.4, 0, 0.9, 2.8, 0.3, 'metal');
  sign(L, 'P  PARK-RITE P3\n\nSKYBRIDGE TO\nTERMINAL ✈\nLEVEL P2', 271.8, 1.7, 3.06, 0, 0.8, 1.9, { bg: '#16191e', fg: '#f2c230', clean: true });
  sign(L, 'P  PARK-RITE P3\n\nSKYBRIDGE TO\nTERMINAL ✈\nLEVEL P2', 271.8, 1.7, 3.34, Math.PI, 0.8, 1.9, { bg: '#16191e', fg: '#f2c230', clean: true });
  P.streetLight(L, 269.0, 0, -8.0, Math.PI / 2, { on: true, intensity: 22, range: 18 });
  P.streetLight(L, 269.0, 0, 18.0, Math.PI / 2, { on: true, intensity: 18, range: 16, flicker: 0.35 });
  L.reverb(x0, 0, -34, x1, 14, 34, 'outdoor');
}

// ================================================================== GARAGE
const COLX = [284, 292, 300, 308], COLZ = [-12, -4, 4, 12];
// Garage lights are gated per deck (the light pool is small and slabs don't
// stop light): only the camera's deck (+ the neighbour on the ramp / stairs)
// competes for real lights, so each deck gets hard pools under its lamps.
const GL = { decks: [[], [], []] };
const deckOf = (y) => (y < D2 - 0.5 ? 0 : y < D3 - 0.5 ? 1 : 2);
function gated(L, l) { if (l) { l.want = l.on; GL.decks[deckOf(l.y)].push(l); } return l; }
function sodium(L, x, y, z, on = true, o = {}) {
  // square HID garage luminaire on a conduit drop: housing, reflector skirt, prismatic lens
  const p = P.prop(L, x, y, z, 0);
  p.box(0, -0.12, 0, 0.06, 0.24, 0.06, 'metalDark', 0x3a3a3a).box(0, -0.03, 0.25, 0.04, 0.04, 0.5, 'metalDark', 0x4a4a4a);
  p.rbox(0, -0.3, 0, 0.56, 0.14, 0.56, 0.03, 'metalDark', 0x3a3c3e).frustum(0, -0.42, 0, 0.3, 0.36, 0.1, 'metalClean', 0x9a9a98, null, 4);
  p.glow(0, -0.475, 0, 0.44, 0.02, 0.44, on ? 0xffb060 : 0x2a2622);
  if (!on) return null;
  const l = gated(L, L.light(x, y - 0.6, z, 0xffa048, (o.intensity ?? 9) * 3, (o.range ?? 13) + 6, { flicker: o.flicker ?? 0 }));
  P.lightCone(L, x, y - 0.5, z, [0, -1, 0], 2.6, 1.7, 0xffa048, l, 0.45);
  return l;
}
function tubeStrip(L, x, y, z, state = 'on') {
  // twin-tube fluorescent batten along X; state: on | light (real light) | flicker | dead
  const p = P.prop(L, x, y, z, 0);
  p.box(0, -0.04, 0, 1.3, 0.07, 0.2, 'metalClean', 0xc8c8c0);
  const lit = state !== 'dead';
  for (const dz of [-0.05, 0.05]) p.cylX(0, -0.1, dz, 0.022, 1.2, 'emissiveTint', lit ? 0xd8ecff : 0x3a3e40, 8);
  if (state === 'light' || state === 'flicker') gated(L, L.light(x, y - 0.3, z, 0xd8ecff, 12, 10, { flicker: state === 'flicker' ? 0.7 : 0, buzz: 1 }));
}
function bays(L, x0, x1, z, dir, y, w = 2.6) {
  // parking stripes perpendicular to an aisle (bays extend from z toward z + dir*5)
  for (let x = x0; x <= x1 + 0.01; x += w) L.box(x - 0.05, y + 0.003, Math.min(z, z + dir * 5), x + 0.05, y + 0.012, Math.max(z, z + dir * 5), 'paintedWhite', { collide: false, tint: 0xd8d8c8 });
}
function parapet(L, axis, a0, a1, fixed, y, o = {}) {
  const h = o.h ?? 1.05, t = 0.25;
  if (axis === 'x') { L.box(a0, y, fixed - t / 2, a1, y + h, fixed + t / 2, 'concrete', { tint: 0xa8a49c }); L.box(a0, y + h, fixed - t / 2, a1, y + 2.6, fixed + t / 2, 'concrete', { visible: false, flags: CLIP }); }
  else { L.box(fixed - t / 2, y, a0, fixed + t / 2, y + h, a1, 'concrete', { tint: 0xa8a49c }); L.box(fixed - t / 2, y + h, a0, fixed + t / 2, y + 2.6, a1, 'concrete', { visible: false, flags: CLIP }); }
  // yellow-black kerb stripe + cable rail
  if (axis === 'x') L.box(a0, y + h - 0.12, fixed - t / 2 - 0.005, a1, y + h - 0.04, fixed + t / 2 + 0.005, 'paintedYellow', { collide: false, tint: 0xd8b020 });
  else L.box(fixed - t / 2 - 0.005, y + h - 0.12, a0, fixed + t / 2 + 0.005, y + h - 0.04, a1, 'paintedYellow', { collide: false, tint: 0xd8b020 });
}
function levelSign(L, text, x, y, z, ry) { sign(L, text, x, y, z, ry, 1.4, 0.7, { bg: '#16191e', fg: '#f2c230', clean: true }); }

function garage(L, game) {
  const { x0, x1, z0, z1 } = GAR;
  // slabs
  L.box(x0, -0.3, z0, x1, D1, z1, 'concreteFloor', { tint: 0x7a7872 });
  floorWithHoles(L, x0, z0, x1, z1, D2, 0.3, 'concreteFloor', [[288, 13.1, 302, 19.9]], { tint: 0x8a8680 });
  floorWithHoles(L, x0, z0, x1, z1, D3, 0.3, 'concreteFloor', [[277, -19.8, 283, -12.95]], { tint: 0x8a8680 });
  L.box(x0, ROOF - 0.3, z0, x1, ROOF, z1, 'concrete', { tint: 0x8a8680 });
  // roof deck parapet + a few light poles on it (silhouettes)
  L.box(x0, ROOF, z0, x1, ROOF + 1.0, z0 + 0.25, 'concrete', { tint: 0xa8a49c, collide: false });
  L.box(x0, ROOF, z1 - 0.25, x1, ROOF + 1.0, z1, 'concrete', { tint: 0xa8a49c, collide: false });
  for (const [x, z] of [[288, -8], [300, 8]]) { const p = P.prop(L, x, ROOF, z, 0); p.cyl(0, 3, 0, 0.1, 6, 'metalDark', 0x3a3a3a, null, 8).box(0, 6, 0, 0.5, 0.2, 0.3, 'metalDark', 0x3a3a3a).glow(0, 5.88, 0, 0.36, 0.02, 0.2, 0xffa050); }
  // spandrel edges with painted level bands
  for (const y of [D2, D3, ROOF]) {
    L.box(x0 - 0.02, y - 0.75, z0 - 0.02, x1 + 0.02, y - 0.3, z0 + 0.2, 'concrete', { collide: false, tint: 0x9a968e });
    L.box(x0 - 0.02, y - 0.75, z1 - 0.2, x1 + 0.02, y - 0.3, z1 + 0.02, 'concrete', { collide: false, tint: 0x9a968e });
    L.box(x0 - 0.02, y - 0.75, z0, x0 + 0.2, y - 0.3, z1, 'concrete', { collide: false, tint: 0x9a968e });
  }
  // columns (every level), yellow/black bases, level numbers
  for (const x of COLX) for (const z of COLZ) {
    for (const [ya, yb] of [[D1, D2 - 0.3], [D2, D3 - 0.3], [D3, ROOF - 0.3]]) {
      L.box(x - 0.3, ya, z - 0.3, x + 0.3, yb, z + 0.3, 'concrete', { tint: 0xb0aca4 });
      L.box(x - 0.31, ya, z - 0.31, x + 0.31, ya + 0.9, z + 0.31, 'paintedYellow', { collide: false, tint: 0xd8b020 });
      for (let k = 0; k < 3; k++) L.box(x - 0.315, ya + 0.1 + k * 0.28, z - 0.315, x + 0.315, ya + 0.22 + k * 0.28, z + 0.315, 'blackMatte', { collide: false });
    }
  }
  for (const [y, t] of [[D1, 'G'], [D2, 'P1'], [D3, 'P2']]) for (const [x, z] of [[292, -4], [300, 4], [284, 4]]) {
    sign(L, t, x, y + 1.9, z - 0.32, 0, 0.5, 0.5, { bg: '#16191e', fg: '#f2c230', clean: true });
    sign(L, t, x, y + 1.9, z + 0.32, 0, 0.5, 0.5, { bg: '#16191e', fg: '#f2c230', clean: true });
  }
  // outer edges: G north/south walls, upper-level parapets
  for (const y of [D2, D3]) { parapet(L, 'x', x0, x1, z0 + 0.13, y); parapet(L, 'x', x0, x1, z1 - 0.13, y); parapet(L, 'z', z0, z1, x0 + 0.13, y); }
  L.box(x0, D1, z0, x1, D2 - 0.3, z0 + 0.25, 'concreteDark', { tint: 0x8a867e });
  L.box(x0, D1, z1 - 0.25, x1, D2 - 0.3, z1, 'concreteDark', { tint: 0x8a867e });
  // G west face: low walls with the entry lane (z -4..6)
  for (const [a, b] of [[z0, -4], [6, z1]]) { L.box(x0, D1, a, x0 + 0.25, 1.05, b, 'concrete', { tint: 0xa8a49c }); L.box(x0, 1.05, a, x0 + 0.25, D2 - 0.3, b, 'concrete', { visible: false, flags: CLIP }); }
  // east wall (closed, Airport Drive side) on all levels, with the skybridge opening on P2
  L.box(x1 - 0.25, D1, z0, x1, D2 - 0.3, z1, 'concreteDark', { tint: 0x8a867e });
  L.box(x1 - 0.25, D2, z0, x1, D3 - 0.3, z1, 'concreteDark', { tint: 0x8a867e });
  L.wallZ(z0, z1, x1 - 0.125, D3, ROOF - 0.3, 'concreteDark', 0.25, [{ a: SKY.z0, b: SKY.z1, y0: D3, y1: D3 + 2.9 }], { tint: 0x8a867e });
  // entry lane: barrier arms (one snapped), ticket machines, booth
  for (const [z, snapped] of [[-1.2, true], [3.4, false]]) {
    const a = P.prop(L, 278.2, 0, z, 0);
    a.rbox(0, 0.55, 0, 0.4, 1.1, 0.4, 0.04, 'paintedYellow', 0xd8a820).glow(0.21, 0.9, 0, 0.01, 0.08, 0.08, 0xff3020);
    if (snapped) a.box(0.2, 1.0, 1.0, 0.08, 0.08, 1.9, 'paintedWhite', 0xe8e0d8, [0.3, 0, 0]).box(0.8, 0.05, 2.4, 0.08, 0.08, 1.4, 'paintedWhite', 0xe8e0d8, [0, 0.8, 0]);
    else a.box(0.2, 1.0, 1.4, 0.08, 0.08, 2.8, 'paintedWhite', 0xe8e0d8);
    a.col(0, 0.55, 0, 0.45, 1.1, 0.45, 'metal');
  }
  for (let k = 0; k < 4; k++) L.box(278.25, 0.95, -0.2 + k * 0.7, 278.35, 1.0, -0.1 + k * 0.7, 'paintedRed', { collide: false, tint: 0xc02a1a });
  const tm = P.prop(L, 279.2, 0, 7.2, Math.PI / 2);
  tm.rbox(0, 0.8, 0, 0.7, 1.6, 0.5, 0.05, 'metalDark', 0x2a2e34).glow(0, 1.25, -0.26, 0.4, 0.25, 0.01, 0x60a0c0).box(0, 0.8, -0.26, 0.2, 0.05, 0.01, 'blackMatte').col(0, 0.8, 0, 0.7, 1.6, 0.5, 'metal');
  sign(L, 'PAY HERE', 279.2, 1.9, 7.2, Math.PI / 2, 0.6, 0.2, { bg: '#1a4a8a', fg: '#fff', clean: true });
  sign(L, 'PARK-RITE  P3', 276.1, 2.5, 1, -Math.PI / 2, 4.2, 0.8, { bg: '#16191e', fg: '#f2c230', glow: 0.8, lightColor: 0xffc040, lightIntensity: 3, clean: true });
  sign(L, 'ENTER ↓  MAX HEADROOM 2.1 m', 276.1, 2.95, 1, -Math.PI / 2, 4.2, 0.3, { bg: '#f2c230', fg: '#16191e', clean: true });
  L.box(276, 2.75, -4, 276.2, 3.1, 6, 'paintedYellow', { collide: false, tint: 0xd8b020 });
  // ---- G level: bays + cars; ramp to P1
  bays(L, 284, 310, -20, 1, D1); bays(L, 284, 310, -9, -1, D1);
  bays(L, 284, 310, 1, 1, D1);
  for (const [x, z, ry, o] of [[285.3, -17.4, 0.02, {}], [290.5, -17.6, -0.05, { color: 0x8a1a14 }], [298.3, -17.4, 0, {}], [306.1, -17.2, 0.08, { burnt: true }], [287.9, -11.4, Math.PI + 0.04, {}], [303.5, -11.6, Math.PI, { damaged: true }], [295.7, 3.6, 0.05, {}], [305.9, 3.4, -0.04, {}]]) P.car(L, x, 0, z, ry, o);
  hittable(L, 'car', 303.2, 0, 3.6, 0.02, { color: 0x2a4a6a });
  ramp(L, 'x', 284, 302, 13.3, 19.75, D1, D2, { mat: 'concreteFloor', tint: 0x7a7872 });
  // ramp side wall (north) rising through P1 as its upstand
  L.box(288, D1, 12.95, 302, D2 + 1.05, 13.25, 'concrete', { tint: 0xa8a49c });
  L.box(288, D2 + 1.05, 12.95, 302, D2 + 2.6, 13.25, 'concrete', { visible: false, flags: CLIP });
  // low guard wall along the open foot of the ramp (no side-stepping onto the rising slab)
  L.box(284.9, D1, 12.95, 288, D1 + 1.05, 13.25, 'concrete', { tint: 0xa8a49c });
  L.box(284.9, D1 + 0.93, 12.94, 288, D1 + 1.01, 13.26, 'paintedYellow', { collide: false, tint: 0xd8b020 });
  L.box(288, D2 - 0.6, 19.75, 302, D2 - 0.3, 20, 'concrete', { tint: 0x9a968e, collide: false });
  L.box(287.75, D2 - 0.3, 13.25, 288.05, D2 + 1.05, 19.75, 'concrete', { tint: 0xa8a49c });
  L.box(287.75, D2 + 1.05, 13.25, 288.05, D2 + 2.6, 19.75, 'concrete', { visible: false, flags: CLIP });
  // painted ramp arrows
  for (const x of [287, 293, 299]) stencil(L, '→', x, D1 + 0.02 + (x - 284) / 18 * D2 + 0.03, 16.5, 0, 1.2, 0.8, '#e8e8d8');
  sign(L, 'UP ↑ P1 · P2 · SKYBRIDGE', 284.2, 2.4, 12.9, 0, 3.0, 0.4, { bg: '#16191e', fg: '#f2c230', clean: true });
  for (const [x, z] of [[288, -14.5], [296, -14.5], [304, -14.5], [288, -3], [304, -3], [292, 8], [304, 8], [286, 16.4], [280.5, 1]]) sodium(L, x, D2 - 0.3, z, !(x === 296 && z === -14.5), { flicker: x === 304 && z === -3 ? 0.4 : 0.05 });
  graffiti(L, 'NO FLIGHTS\nNO REFUNDS', 311.7, 1.6, -6, -Math.PI / 2, 2.2, 0.9, '#b8201a');
  P.corpse(L, 294.6, 0.01, -2.0, 0.6, 0x3a3a5a); blood(L, 294.6, 0, -2.0, 1.4, 4);
  L.item('pills', 309.6, 0.02, -7.6, { chance: 0.5 });
  // ---- P1: the car-alarm trap
  bays(L, 280, 300, -20, 1, D2); bays(L, 280, 300, -8, -1, D2);
  bays(L, 280, 288, 13.2, -1, D2);
  for (const [x, z, ry, o] of [[281.3, -17.2, 0.03, {}], [286.5, -17.4, 0, { color: 0xd8d4c8 }], [297.1, -17.2, -0.06, {}], [281.3, -10.6, Math.PI + 0.1, {}], [294.3, -10.4, Math.PI, { color: 0x1a1a1a }], [285.6, 10.8, Math.PI, {}], [281.3, 10.6, Math.PI - 0.05, {}], [296.2, 5.8, Math.PI / 2 + 0.1, {}]]) P.car(L, x, D2, z, ry, o);
  // the trap: an alarmed saloon abandoned across the aisle, doors open, blinking LED
  const alarm1 = alarmCar(L, 305.6, D2, -1.2, 0.9, 0xd8d4c8);
  const alarm2 = alarmCar(L, 291.6, D2, -17.4, 0.02, 0x8a1a14);
  sign(L, 'PROTECTED BY\nVIPER ALARM', 305.6, D2 + 1.25, -1.2, 0.9, 0.5, 0.2, { bg: '#1a1a1a', fg: '#e02020', clean: true });
  graffiti(L, 'CAR ALARM!\nDONT TOUCH', 311.7, D2 + 1.6, -1.6, -Math.PI / 2, 1.8, 0.8, '#e8c020', { style: 'scrawl' });
  for (const [x, z] of [[296, -14.5], [304, -14.5], [288, -3], [304, -3], [296, 8], [306, 16.4], [284, -14.5], [285, -7], [299, 16.4]]) sodium(L, x, D3 - 0.3, z, !(x === 288 && z === -3), { flicker: x === 304 ? 0.3 : 0.05, intensity: 8 });
  levelSign(L, 'LEVEL P1', 302.2, D2 + 2.4, 13.12, 0);
  levelSign(L, 'STAIRS · P2 ↑\nSKYBRIDGE', 283.13, D2 + 2.2, -9.4, Math.PI / 2);
  P.corpse(L, 299.4, D2 + 0.01, 1.4, 2.2, 0x6a4a2a); blood(L, 299.4, D2, 1.4, 1.6, 5);
  for (let i = 0; i < 7; i++) L.decal(300 - i * 2.4, D2 + 0.013, -12.8 - Math.sin(i) * 0.6, 0, 1, 0, 0.8, DF.SMEAR);
  L.item('ammo', 308.6, D2 + 0.02, 18.8);
  L.item('health', 309.2, D2 + 0.02, -18.8, { chance: 0.6 });
  L.item('throwable', 282.2, D2 + 0.02, -6.6, { chance: 0.6 });
  // ---- stair core (P1 -> P2), NW corner
  const sx0 = 277, sx1 = 283, sz0 = -19.8, sz1 = -12.8, ym = (D2 + D3) / 2;
  L.stairs(277.3, -17.6, 279.8, -12.95, D2, ym, '-z', 'concrete', { thin: true });
  L.box(277.3, ym - 0.3, sz0, 282.8, ym, -17.6, 'concrete', { tint: 0x9a968e });
  L.stairs(280.3, -17.6, 282.8, -12.95, ym, D3, '+z', 'concrete', { thin: true });
  L.box(279.8, D2, -17.6, 280.3, D3 + 1.05, -12.95, 'concreteDark', { tint: 0x8a867e }); // divider
  L.box(279.8, D3 + 1.05, -17.6, 280.3, ROOF - 0.3, -12.95, 'concrete', { visible: false, flags: CLIP });
  // north wall of the core (between the parapets)
  L.box(277.3, D2 + 1.05, -20.0, 283.0, D3, -19.8, 'concreteDark', { tint: 0x8a867e });
  L.box(277.3, D3 + 1.05, -20.0, 283.0, ROOF - 0.3, -19.8, 'concreteDark', { tint: 0x8a867e });
  L.wallZ(sz0, sz1, sx1 + 0.12, D2, ROOF - 0.3, 'concreteDark', 0.25, [], { tint: 0x8a867e });
  L.box(x0, D2, sz0, 277.3, ROOF - 0.3, sz1, 'concreteDark', { tint: 0x8a867e });
  // south face of the core: P1 entry opening (west half), P2 exit opening (east half)
  L.box(279.8, D2, sz1 - 0.12, sx1, D3 - 0.3, sz1 + 0.12, 'concreteDark', { tint: 0x8a867e });
  L.box(277.3, D2 + 2.4, sz1 - 0.12, 279.8, D3 - 0.3, sz1 + 0.12, 'concreteDark', { tint: 0x8a867e });
  L.box(277.3, D3, sz1 - 0.12, 280.3, ROOF - 0.3, sz1 + 0.12, 'concreteDark', { tint: 0x8a867e });
  L.box(280.3, D3 + 2.4, sz1 - 0.12, sx1, ROOF - 0.3, sz1 + 0.12, 'concreteDark', { tint: 0x8a867e });
  sign(L, 'STAIR A', 278.55, D2 + 2.65, sz1 + 0.14, 0, 1.0, 0.3, { bg: '#16191e', fg: '#f2c230', clean: true });
  sign(L, 'P2 ↑', 279.4, ym + 1.8, sz0 + 0.02, 0, 0.6, 0.35, { bg: '#16191e', fg: '#f2c230', clean: true });
  sign(L, 'LEVEL P2\nSKYBRIDGE →', 281.55, D3 + 2.65, sz1 + 0.14, 0, 1.6, 0.5, { bg: '#16191e', fg: '#f2c230', clean: true });
  ceilingLight(L, 280, D3 - 0.35, -15.2, { type: 'cage', intensity: 6, range: 7, flicker: 0.4 });
  ceilingLight(L, 280, ROOF - 0.35, -15.2, { type: 'cage', intensity: 5, range: 7, flicker: 0.1 });
  graffiti(L, 'UP', 277.32, D2 + 1.6, -15.6, Math.PI / 2, 0.8, 0.5, '#e8e8d8', { style: 'stencil' });
  L.reverb(277, D2, sz0, 283, ROOF, sz1, 'stairwell');
  // ---- P2: cars, the lobby, the skybridge
  bays(L, 284, 304, -20, 1, D3); bays(L, 284, 304, -9, -1, D3);
  bays(L, 284, 304, 6, 1, D3); bays(L, 284, 310, 20, -1, D3);
  for (const [x, z, ry, o] of [[285.3, -17.3, 0.05, {}], [293.1, -17.4, -0.02, { color: 0x2a4a2a }], [298.3, -17.2, 0.06, {}], [290.5, -11.6, Math.PI, {}], [303.5, -11.4, Math.PI + 0.08, { burnt: true }], [287.9, 8.6, 0.02, {}], [298.3, 8.8, -0.1, { color: 0xd8b020, taxi: true }], [306.1, 17.4, Math.PI, {}], [293.1, 17.6, Math.PI + 0.03, {}]]) P.car(L, x, D3, z, ry, o);
  for (const [x, z] of [[288, -14.5], [296, -14.5], [288, -3], [296, -3], [290, 12], [300, 12], [285, -10], [301, -10]]) sodium(L, x, ROOF - 0.3, z, !(x === 296 && z === -3), { flicker: x === 288 ? 0.3 : 0.05, intensity: 8 });
  levelSign(L, 'LEVEL P2', 283.13, D3 + 2.2, -9.4, Math.PI / 2);
  // fluorescent battens between the HID lamps (some dead, one strobing)
  for (const [y, x, z, st] of [
    [D2, 292, -14.5, 'light'], [D2, 300, -14.5, 'on'], [D2, 296, -3, 'light'], [D2, 300, 9, 'flicker'], [D2, 308, -9.5, 'dead'], [D2, 284, 9, 'on'],
    [D3, 290, -14.5, 'light'], [D3, 296, -3, 'light'], [D3, 300, -3, 'on'], [D3, 290, 9, 'flicker'], [D3, 302, 9, 'dead'],
    [ROOF, 300, -14.5, 'light'], [ROOF, 292, -3, 'flicker'], [ROOF, 284, 12, 'light'], [ROOF, 306, 12, 'on'], [ROOF, 302, -9.5, 'dead'],
  ]) tubeStrip(L, x, y - 0.3, z, st);
  // skybridge lobby (glass box around the bridge head)
  const lx0 = 304.2, lz0 = -5.6, lz1 = 3.6;
  L.box(lx0, D3, lz0, x1 - 0.25, D3 + 0.02, lz1, 'tileFloor', { collide: false, tint: 0xb8b4ac });
  for (const [a, b] of [[lz0, -3.2], [1.2, lz1]]) {
    L.box(lx0 - 0.04, D3, a, lx0 + 0.04, D3 + 2.9, b, 'glass', { tint: 0x8aa0a8 });
  }
  L.box(lx0, D3, lz0 - 0.04, x1 - 0.25, D3 + 2.9, lz0 + 0.04, 'glass', { tint: 0x8aa0a8 });
  L.box(lx0, D3, lz1 - 0.04, x1 - 0.25, D3 + 2.9, lz1 + 0.04, 'glass', { tint: 0x8aa0a8 });
  for (const z of [lz0, -3.2, 1.2, lz1]) L.box(lx0 - 0.07, D3, z - 0.07, lx0 + 0.07, D3 + 2.95, z + 0.07, 'metalDark', { tint: 0x2a2e34 });
  L.box(lx0 - 0.1, D3 + 2.9, lz0 - 0.1, x1 - 0.25, D3 + 3.05, lz1 + 0.1, 'metalDark', { tint: 0x2a2e34 });
  // (the glass door leaves swung open)
  for (const [z, s] of [[-3.2, 1], [1.2, -1]]) { const d = P.prop(L, lx0 - 0.55, D3, z + s * 0.1, s * 1.2); d.box(0, 1.1, 0.55 * s, 0.04, 2.1, 1.1, 'glass', 0x8aa0a8).box(0, 1.05, 0.55 * s, 0.06, 0.05, 0.9, 'chrome', 0xc0c0c0); }
  sign(L, 'SKYBRIDGE TO TERMINAL ✈', lx0 - 0.06, D3 + 2.55, -1, -Math.PI / 2, 2.8, 0.34, { bg: '#16191e', fg: '#f2c230', clean: true });
  // lift doors + a pay station inside the lobby
  L.box(308.4, D3, lz0 + 0.05, 310.0, D3 + 2.2, lz0 + 0.12, 'chrome', { collide: false, tint: 0x9a9e9e });
  L.box(308.4, D3, lz1 - 0.12, 310.0, D3 + 2.2, lz1 - 0.05, 'chrome', { collide: false, tint: 0x9a9e9e });
  sign(L, 'OUT OF\nSERVICE', 309.2, D3 + 1.3, lz1 - 0.14, Math.PI, 0.5, 0.3, { bg: '#f0f0e8', fg: '#b8201a' });
  const ps = P.prop(L, 306.4, D3, lz0 + 0.45, 0);
  ps.rbox(0, 0.85, 0, 0.8, 1.7, 0.5, 0.05, 'metalDark', 0x1a3a6a).glow(0, 1.3, 0.26, 0.45, 0.28, 0.01, 0x70b0d0).col(0, 0.85, 0, 0.8, 1.7, 0.5, 'metal');
  ceilingLight(L, 307.6, D3 + 2.85, -1.0, { type: 'fluoro', intensity: 8, range: 9, flicker: 0.35, color: 0xd8ecff });
  P.corpse(L, 306.2, D3 + 0.03, 0.6, 1.8, 0x2a3a5a); blood(L, 306.2, D3 + 0.02, 0.6, 1.6, 4);
  P.suitcase(L, 305.6, D3 + 0.02, 2.4, 0.4);
  wallMessages(L, 304.12, D3 + 1.55, -4.4, -Math.PI / 2, 1.3, 0.9, { lines: ['TERMINAL IS\nOVERRUN', 'PLANES STILL\nLEAVING — GATE C'], density: 0.5 });
  L.reverb(lx0, D3, lz0, x1, D3 + 3, lz1, 'room');
  // ---- dressing on every deck: conduit + sprinkler runs, exit signs, wall art
  for (const [y, top] of [[D1, D2 - 0.3], [D2, D3 - 0.3], [D3, ROOF - 0.3]]) {
    for (const z of [-8.2, 8.2]) ceilingPipes(L, x0 + 1, z, x1 - 0.5, z, top - 0.25, { n: 2, r: 0.05, spacing: 0.3 });
    ceilingPipes(L, 296, z0 + 0.5, 296, z1 - 0.5, top - 0.18, { n: 1, r: 0.035, mat: 'paintedRed' });
    for (const x of [288, 304]) { L.box(x - 0.2, top - 0.25, -0.1, x + 0.2, top, 0.1, 'metalDark', { collide: false, tint: 0x2a2a2a }); }
  }
  for (const [x, y, z, ry, t] of [[283.13, D2 + 2.7, -15.5, Math.PI / 2, 'EXIT ↑'], [311.72, D1 + 2.5, 10, -Math.PI / 2, '← EXIT'], [311.72, D3 + 2.5, -8, -Math.PI / 2, 'SKYBRIDGE →']]) sign(L, t, x, y, z, ry, 1.1, 0.3, { bg: '#0e5a2a', fg: '#e8ffe8', glow: 0.6, light: false, clean: true });
  posterWall(L, 296, 1.3, z1 - 0.27, Math.PI, 3.2, 1.4, { kinds: ['airline', 'evac', 'missing', 'flyer'] });
  // travellers' leftovers + evac notices on the columns (every deck)
  P.luggageCart(L, 299.2, D1, -6.2, 0.5, true); P.luggagePile(L, 300.4, D1, -4.9, 3, 0.6);
  for (const [x, z] of [[284.8, 11.6], [285.6, 12.3], [287.1, 11.9]]) P.trafficCone(L, x, D1, z);
  P.luggageCart(L, 297.6, D2, 11.2, 2.2, false); P.luggagePile(L, 299.0, D2, 10.6, 4, 0.8);
  P.luggageCart(L, 295.8, D3, -6.4, 1.2, true); P.suitcase(L, 294.6, D3 + 0.01, -7.2, 0.8);
  for (const [y, x, z, k] of [[D1, 292, -4, 'evac'], [D1, 300, 4, 'missing'], [D2, 292, 4, 'evac'], [D2, 300, -12, 'airline'], [D3, 292, -4, 'evac'], [D3, 300, -4, 'missing']]) poster(L, k, x - 0.315, y + 1.55, z, -Math.PI / 2, 0.42, 0.6);
  graffiti(L, 'THEY COME UP\nTHE RAMPS', 300, D2 + 0.7, z0 + 0.27, 0, 2.2, 0.5, '#b8201a', { style: 'drip' });
  graffiti(L, 'SKYLINE AIR\nLEFT US', 311.72, D3 + 1.6, 12, -Math.PI / 2, 2.0, 0.8, '#e8e8d8', { style: 'marker' });
  graffiti(L, 'FLY', 311.72, D1 + 1.3, -14, -Math.PI / 2, 1.6, 0.8, '#3aa0d8', { style: 'throwup', color2: '#101010' });
  sign(L, 'ALL LEVELS\nFULL', 278.4, 1.9, 9.6, Math.PI / 2, 1.0, 0.6, { bg: '#16191e', fg: '#e02020', glow: 0.5, light: false, clean: true });
  sign(L, 'PARKING GUIDANCE\nP1  ░░ FULL\nP2  ░░ FULL', 283.8, D1 + 2.5, 13.1, 0, 1.6, 0.6, { bg: '#16191e', fg: '#40e060', clean: true });
  L.reverb(x0, D1, z0, x1, ROOF, z1, 'hall');
  let gateKey = -1;
  L.dynamics.push({ update() {
    const c = game.renderer?.camera?.position; if (!c) return;
    const feet = c.y - 1.5;
    const d = feet < D2 * 0.5 ? 0 : feet < (D2 + D3) / 2 ? 1 : 2;
    const ramp = c.x > 283 && c.x < 303 && c.z > 12.5 && c.z < 20.5 && feet < D2 + 0.8 ? 1 : 0;
    const core = c.x > 276.5 && c.x < 284 && c.z > -20 && c.z < -12 && feet > D2 - 0.5 ? 1 : 0;
    const key = d * 4 + ramp * 2 + core;
    if (key === gateKey) return;
    gateKey = key;
    GL.decks.forEach((ls, k) => { const en = k === d || (ramp && k <= 1) || (core && k >= 1); for (const l of ls) l.on = en && l.want; });
  } });
  return { alarm1, alarm2 };
}

// ================================================================ SKYBRIDGE
function skybridge(L, game) {
  const { x0, x1, z0, z1, y } = SKY;
  L.box(x0, y - 0.35, z0, x1 + 0.45, y, z1, 'carpetBlue', { tint: 0x6a7080 });
  L.box(x0, y - 1.1, z0 - 0.1, x1, y - 0.35, z1 + 0.1, 'concrete', { tint: 0x8a8680, collide: false });
  L.box(x0, y + 3.0, z0 - 0.2, x1, y + 3.3, z1 + 0.2, 'metalDark', { tint: 0x3a3e44 });
  L.box(x0, y + 2.95, z0, x1, y + 3.0, z1, 'ceiling', { collide: false, tint: 0xc8c4bc });
  // glazed sides: low kick panel + glass + mullions every 3 m (a few panes broken)
  for (const z of [z0, z1]) {
    L.box(x0, y, z - 0.06, x1, y + 0.9, z + 0.06, 'metalDark', { tint: 0x2a2e34 });
    for (let x = x0 + 1.5; x < x1; x += 3) L.box(x - 0.06, y, z - 0.08, x + 0.06, y + 3.0, z + 0.08, 'metalDark', { tint: 0x2a2e34 });
    L.box(x0, y + 0.9, z - 0.08, x1, y + 3.0, z + 0.08, 'glass', { visible: false });
  }
  for (const z of [z0, z1]) for (let x = x0 + 1.5; x + 3 <= x1 + 0.01; x += 3) {
    const broken = (z === z1 && Math.abs(x - 322.5) < 0.1) || (z === z0 && Math.abs(x - 316.5) < 0.1);
    if (broken) { L.box(x + 0.06, y + 0.9, z - 0.01, x + 2.94, y + 1.2, z + 0.01, 'glass', { collide: false, tint: 0x8aa0a8 }); continue; }
    L.box(x + 0.06, y + 0.9, z - 0.012, x + 2.94, y + 2.94, z + 0.012, 'glass', { collide: false, tint: 0x8aa0a8 });
  }
  L.box(x0, y + 0.9, z0 - 0.012, x0 + 1.44, y + 2.94, z0 + 0.012, 'glass', { collide: false, tint: 0x8aa0a8 });
  L.box(x0, y + 0.9, z1 - 0.012, x0 + 1.44, y + 2.94, z1 + 0.012, 'glass', { collide: false, tint: 0x8aa0a8 });
  // lights: two working panels, one dead, one sparking
  for (let x = x0 + 4; x < x1; x += 6) {
    // recessed 1200x600 troffer: frame + louvre + diffuser (the far one is dead, one hangs loose)
    const dead = x > 326, loose = Math.abs(x - 322) < 0.1;
    const f = P.prop(L, x, y + 2.95, -1.0, 0);
    f.box(0, -0.02, 0, 1.3, 0.04, 0.7, 'metalClean', 0xd0d0c8, loose ? [0.18, 0, 0.1] : null);
    f.glow(0, -0.045, 0, 1.18, 0.01, 0.58, dead ? 0x2a2c2e : 0x5c6674, loose ? [0.18, 0, 0.1] : null);
    for (const dx of [-0.3, 0, 0.3]) f.box(dx, -0.06, 0, 0.015, 0.03, 0.58, 'metalClean', 0xb8b8b0, loose ? [0.18, 0, 0.1] : null);
  }
  L.light(316, y + 2.6, -1, 0xd8ecff, 6, 9, { flicker: 0.3 });
  L.light(322, y + 2.6, -1, 0xd8ecff, 5, 8, { flicker: 0.6 });
  // the glass the team will see from the other side (chapter 4): bags, a body, a trail
  for (const [x, z, r] of [[330.9, -2.2, 0.4], [327.3, 0.1, 2.2], [322.7, -1.2, 1.2], [319.6, -2.5, 0.2]]) P.suitcase(L, x, y, z, r, undefined, false);
  P.corpse(L, 329.0, y + 0.01, -0.4, 2.4, 0x3a4a6a);
  L.decal(329.4, y + 0.012, -0.8, 0, 1, 0, 1.6, DF.POOL);
  for (let i = 0; i < 5; i++) L.decal(326 - i * 2, y + 0.012, -1 + Math.sin(i) * 0.4, 0, 1, 0, 0.8, DF.SMEAR);
  // abandoned luggage carts + bloody hand prints on the glass (someone tried to get out)
  P.luggageCart(L, 320.6, y, 0.3, 1.35, true); P.luggageCart(L, 325.2, y, -2.4, 2.8, false);
  P.luggagePile(L, 324.2, y, -1.9, 3, 0.5);
  for (const [x, yy, zz] of [[317.4, 1.6, 1], [317.9, 1.3, 1], [318.5, 1.7, 1], [328.2, 1.4, -1]]) L.decal(x, y + yy, zz > 0 ? z1 - 0.02 : z0 + 0.02, 0, 0, -zz, 0.35, DF.HAND);
  // a toppled advertising stand
  const ad = P.prop(L, 318.4, y, 0.4, 0.3);
  ad.box(0, 0.12, 0, 1.0, 0.22, 1.6, 'metalDark', 0x22262c).box(0, 0.28, 0, 0.9, 0.04, 1.5, 'emissiveTint', 0x283440);
  ad.col(0, 0.12, 0, 1.0, 0.24, 1.6, 'metal');
  poster(L, 'airline', 318.4, y + 0.31, 0.4, 0, 0.8, 1.3, { title: 'SKYLINE AIR' });
  graffiti(L, 'ALMOST\nTHERE', 333.0, y + 2.0, z1 - 0.1, Math.PI, 1.2, 0.6, '#e8e8d8', { style: 'marker' });
  // piers down to Airport Drive
  for (const x of [319, 327]) L.box(x - 0.6, -0.3, -1.6 - 1.2, x + 0.6, y - 1.1, -1.6 + 1.6, 'concrete', { tint: 0x7a766e });
  L.reverb(x0, y, z0, x1, y + 3, z1, 'hall');
}

// ============================================================ END SAFE ROOM
function endRoom(L, game) {
  const { x0, x1, z0, z1, y, H } = END;
  const sr = safeRoom(L, {
    x0, z0, x1, z1, y, h: H, doorWall: 'w', doorAt: -1, hinge: 1, end: true, floor: 'carpetBlue', wall: 'plasterGreen',
    extraOpen: { e: [{ at: -1, w: 1.1, door: true, locked: true, safe: true }] },
    graffiti: ['THE PLANES ARE\nSTILL FLYING', 'GATE C\nMILITARY\nEVAC', 'DONT TRUST\nTHE ARMY', 'ANNA + J\nMADE IT\nHERE'],
  });
  // skybridge glass either side of the door
  L.box(x0 - 0.02, y + 0.9, -4.7, x0 + 0.02, y + 2.6, -1.8, 'glass', { collide: false, tint: 0x8aa0a8 });
  L.box(x0 - 0.02, y + 0.9, -0.2, x0 + 0.02, y + 2.6, 2.7, 'glass', { collide: false, tint: 0x8aa0a8 });
  sign(L, 'METRO INTERNATIONAL\nCONFERENCE CENTRE', x0 - 0.12, y + 2.62, -1, -Math.PI / 2, 1.6, 0.34, { bg: '#16191e', fg: '#f2c230', clean: true });
  // the conference office: table + medkits, weapons on a side table, radio
  P.table(L, 338.6, y, -2.4, 0, 2.2, 0.9, 'woodDark');
  for (const [x, t] of [[337.8, 'medkit'], [338.4, 'medkit'], [339.0, 'medkit'], [339.6, 'medkit']]) L.item(t, x, y + 0.78, -2.4);
  supplies(L, x1 - 0.5, y, 0.6, -Math.PI / 2, [{ type: 'ammo' }, { type: 'tier2', chance: 0.6 }, { type: 'pills', chance: 0.6 }], { w: 2.0, mat: 'metalDark' });
  P.officeChair(L, 337.4, y, -1.4, 0.4);
  P.chair(L, 340.2, y, -1.5, 2.8, 'woodDark', true);
  P.radioTable(L, 337.2, y, 2.4, Math.PI);
  cardboard(L, 341.4, y, -4.2, 0.3, 3);
  P.papers(L, 338.4, y + 0.01, 0.8, 1.5, 8);
  P.rug(L, 338.6, y + 0.012, -1.0, 1.4, 2.2, 0x3a4a3a);
  const lamp = P.prop(L, 339.6, y + 0.78, -2.8, 0); lamp.cyl(0, 0.12, 0, 0.08, 0.24, 'plastic', 0x2a5a2a).cyl(0, 0.14, 0, 0.06, 0.12, 'emissiveWarm');
  L.light(339.6, y + 1.3, -2.6, 0xffd8a0, 6, 7, { flicker: 0.08 });
  return { sr };
}

// ======================================================== AIRPORT BACKDROP
function terminalBackdrop(L, game) {
  const B = new VisualBatch(L);
  // Airport Drive under the skybridge
  B.box(312, -0.3, -60, 334.3, 0.0, 60, 'asphalt', { tint: 0x3a3a3c });
  for (let z = -58; z < 58; z += 6) B.box(322.9, 0.003, z, 323.1, 0.012, z + 3, 'paintedWhite', { tint: 0xd8d8c8 });
  // terminal / conference-centre block around the end room
  const E = END, pad = 0.35;
  const um = 'concreteDark';
  B.box(E.x0, 0, -70, 430, 18, E.z0 - pad, um, { tint: 0x5a5c62 });
  B.box(E.x0, 0, E.z1 + pad, 430, 18, 60, um, { tint: 0x5a5c62 });
  B.box(E.x1 + pad, 0, E.z0 - pad, 430, 18, E.z1 + pad, um, { tint: 0x5a5c62 });
  B.box(E.x0, 0, E.z0 - pad, E.x1 + pad, E.y - 0.4, E.z1 + pad, um, { tint: 0x5a5c62 });
  B.box(E.x0, E.y + E.H + 0.4, E.z0 - pad, E.x1 + pad, 18, E.z1 + pad, um, { tint: 0x5a5c62 });
  // west curtain wall: glazing bands, some lit, mullions
  for (let z = -68; z < 58; z += 2.5) {
    if (z > E.z0 - 2 && z < E.z1 + 1) continue;
    for (const [ya, yb] of [[1.2, 5.6], [7.6, 10.6], [12.4, 16.4]]) {
      const lit = (Math.abs(z * 7 + ya) % 9) < 1;
      B.box(E.x0 - 0.06, ya, z, E.x0 - 0.02, yb, z + 2.3, lit ? 'emissiveWindow' : 'glassDirty', { tint: lit ? 0x7a6a4a : 0x1a2024 });
      // half-drawn blinds in the lit offices (slats + a crooked lower edge)
      if (lit) for (let k = 0, n = Math.floor((yb - ya) / 0.16 * 0.55); k < n; k++) B.box(E.x0 - 0.09, yb - 0.1 - k * 0.16, z + 0.02, E.x0 - 0.065, yb - 0.04 - k * 0.16, z + 2.28 - (k === n - 1 ? 0.9 : 0), 'blackMatte', { tint: 0x2a2620 });
    }
  }
  B.box(E.x0 - 0.3, 17.2, -70, E.x0, 18.4, 60, 'metalDark', { tint: 0x2a2e34 });
  B.build(L);
  sign(L, 'METRO INTERNATIONAL AIRPORT', E.x0 - 0.1, 14.3, 20, -Math.PI / 2, 22, 2.2, { fg: '#e8f0ff', glow: 1.2, lightColor: 0xa8c8ff, lightIntensity: 6 });
  sign(L, 'DEPARTURES ✈', E.x0 - 0.1, 14.3, -26, -Math.PI / 2, 10, 1.6, { fg: '#f2c230', glow: 1.0, lightColor: 0xffc040, lightIntensity: 4 });
  // crashed vehicles on Airport Drive below
  P.bus(L, 322.0, 0, -26, 0.15, { color: 0x1a4a8a, burnt: true });
  P.car(L, 318.6, 0, 14, 2.9, { burnt: true });
  P.taxi(L, 327.4, 0, 22, 0.2, {});
  P.ambulance(L, 326.2, 0, -8, 0.4, { lights: true });
  fireSource(L, 322.0, 1.2, -26, 1.2, { hazard: false, intensity: 14 });
}

export function buildAirport(L, game) {
  const Pl = plant(L, game);
  plaza(L, game);
  const G = garage(L, game);
  skybridge(L, game);
  const E = endRoom(L, game);
  terminalBackdrop(L, game);
  return { ...Pl, ...G, ...E };
}
