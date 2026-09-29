// Dead Air 3 — past the barricade: Grid Road, NEWBURG POWER & LIGHT
// SUBSTATION 12 (fenced service alleys between humming, arcing transformer
// yards: gantries, breakers, busbars, a crashed line truck, the control house),
// the VOLTEX ELECTRIC workshop (a building to pass through) and Terminal Road
// (the first airport signs, a wrecked airport shuttle).
import * as THREE from 'three';
import { P, sign, graffiti, stencil, poster, posterWall, wallMessages, street, room, ceilingLight, physProp, fireSource, burningBarrel, supplies } from './kit.js';
import { Door } from '../world/dynamic.js';
import { DF } from '../render/decals.js';
import { jersey, container } from './ch3_props.js';
import { workLight, toolCart } from './ch4_parts.js';
import { cardboard } from './da2_parts.js';
import {
  rng, NC, CLIP, blood, safetySign, hardHat, cableDrum, jerryCans, breaker, gantry, transformerHum, arcFlasher, F_SOLID, F_SHOOT,
} from './da3_parts.js';
import { GRID, SUB, P1, P2, P3, WS, TRD, PS } from './da3_layout.js';

const GRAVEL = 0x6c6a64;
// chain-link fence with a tall movement clip above it (nobody hops the wire)
function fence(L, x0, z0, x1, z1, h = 3.0) {
  P.fenceChain(L, x0, z0, x1, z1, 0, h);
  if (Math.abs(x1 - x0) > Math.abs(z1 - z0)) L.box(Math.min(x0, x1), h, z0 - 0.05, Math.max(x0, x1), 4.4, z0 + 0.05, 'concrete', { visible: false, flags: CLIP });
  else L.box(x0 - 0.05, h, Math.min(z0, z1), x0 + 0.05, 4.4, Math.max(z0, z1), 'concrete', { visible: false, flags: CLIP });
}
const hv = (L, x, y, z, ry, w = 0.7, h = 0.5) => safetySign(L, 'DANGER\nHIGH VOLTAGE\nKEEP OUT', x, y, z, ry, w, h, 'danger');

// ============================================================== GRID ROAD
function gridRoad(L, game) {
  const { x0, x1 } = GRID;
  street(L, x0, -34, x1, 34, 'z', { sidewalk: 2.4 });
  // road ends: wreck piles + clips
  for (const [zz, s] of [[-34, 1], [34, -1]]) L.clip(x0, 0, zz - (s > 0 ? 0.6 : -0.1), x1, 7, zz + (s > 0 ? 0.1 : 0.6), F_SOLID | F_SHOOT);
  P.bus(L, 155.2, 0, -30.6, Math.PI / 2 + 0.1, { burnt: true });
  P.car(L, 151.4, 0, -26.8, 0.6, { burnt: true });
  P.policeCar(L, 159.6, 0, -25.6, -0.4, { damaged: true });
  fireSource(L, 155.2, 1.4, -30.6, 1.0, { hazard: false, intensity: 12 });
  P.semi(L, 155.0, 0, 29.4, Math.PI / 2 - 0.08, { color: 0x8a1a14, trailerLen: 11, trailerColor: 0xc8c4b8 });
  P.car(L, 151.2, 0, 23.8, 2.6, {});
  jersey(L, 158.6, 0, 22.6, 0.3, 2.0);
  // the hoarding's street face (site side)
  const hx = 148.14;
  posterWall(L, hx, 1.3, -18, -Math.PI / 2, 3.0, 1.5, { kinds: ['concert', 'movie', 'flyer', 'airline'] });
  posterWall(L, hx, 1.3, 14, -Math.PI / 2, 2.6, 1.5, { kinds: ['flyer', 'missing', 'evac'] });
  safetySign(L, 'DANGER\nCONSTRUCTION SITE\nKEEP OUT', hx, 1.7, -24.5, -Math.PI / 2, 1.3, 0.9, 'danger');
  graffiti(L, 'SUB 12 → AIRPORT\nSTAY OFF THE WIRE', hx, 1.5, 21.5, -Math.PI / 2, 2.4, 0.9, '#e8e0c8', { style: 'scrawl' });
  graffiti(L, 'GRIDLOCK', hx, 1.0, 7.2, -Math.PI / 2, 2.0, 0.8, '#3aa0d8', { style: 'throwup', color2: '#101010' });
  // street furniture
  P.streetLight(L, 150.3, 0.15, -14, Math.PI / 2, { on: true, intensity: 22, range: 18, flicker: 0.2 });
  P.streetLight(L, 161.2, 0.15, 12, -Math.PI / 2, { on: true, intensity: 20, range: 16 });
  P.streetLight(L, 150.3, 0.15, 18, Math.PI / 2, { on: false });
  P.hydrant(L, 150.2, 0.15, 8.6, 0);
  P.newsBox(L, 150.0, 0.15, -20.6, Math.PI / 2);
  for (const [x, z] of [[158.4, -10.2], [153.8, 6.2], [156.8, 14.6]]) P.trafficCone(L, x, 0, z, rng() * 3);
  P.car(L, 156.4, 0, -17.4, 0.12, { color: 0x6a6a68 });
  P.taxi(L, 152.6, 0, 11.4, Math.PI + 0.3, { damaged: true });
  // utility poles along the east sidewalk carrying the lines into the substation
  for (const z of [-26, -12, 8, 22]) {
    const p = P.prop(L, 160.9, 0.15, z, 0);
    p.cyl(0, 5.5, 0, 0.14, 11, 'woodDark', 0x4a3a2a, null, 8).box(0, 10.2, 0, 0.12, 0.14, 2.4, 'woodDark', 0x4a3a2a);
    for (const dz of [-1.0, 0, 1.0]) p.cyl(0, 10.4, dz, 0.05, 0.22, 'plasticGloss', 0x7a4a2a, null, 8);
    p.cyl(0.3, 8.6, 0, 0.3, 0.9, 'metal', 0x8a9088, null, 10); // pole transformer
    p.col(0, 3, 0, 0.3, 6, 0.3, 'wood');
  }
  for (const [za, zb] of [[-26, -12], [-12, 8], [8, 22]]) for (const dz of [-1.0, 0, 1.0]) P.pipe(L, 160.9, 10.5, za + dz, 160.9, 10.5, zb + dz, 0.012, 'metalDark', 0x2a2a2a);
  for (let i = 0; i < 10; i++) blood(L, 150 + rng() * 11, 0, -16 + rng() * 32, 0.6 + rng(), i);
  P.corpse(L, 157.6, 0.01, -6.4, 1.1, 0x2a2a2a);
  P.corpse(L, 153.2, 0.16, 16.8, 2.9, 0x6a2a2a);
  L.item('ammo', 150.4, 0.17, -24.2, { chance: 0.5 });
  L.reverb(x0, 0, -34, x1, 14, 34, 'outdoor');
  L.ambience(x0, -1, -34, x1, 14, 34, 'city');
}

// ================================================================ SUBSTATION
function yardBank(L, x, z, ry, o = {}) {
  P.transformer(L, x, 0, z, ry, { w: o.w ?? 3.0, d: o.d ?? 2.2, h: o.h ?? 2.8, color: o.color ?? 0x6a7a6a });
  // oil containment kerb + gravel pit
  L.box(x - 2.4, 0, z - 2.0, x + 2.4, 0.12, z + 2.0, 'concrete', { collide: false, tint: 0x8a8680 });
  return P;
}
function fireWall(L, x0, z0, x1, z1, h = 4.4) { L.box(x0, 0, z0, x1, h, z1, 'concreteDark', { tint: 0x8a867e }); }

function substation(L, game) {
  const { x0, x1 } = SUB;
  // ground: gravel yards + concrete service alleys
  L.box(x0, -0.3, -34, x1, 0, 34, 'dirt', { tint: GRAVEL });
  for (const [a, b, c, d] of [[P1.x0, P1.z0, P1.x1, P1.z1], [P2.x0, P2.z0, P2.x1, P2.z1], [P2.x1, P3.z0, P3.x1, P3.z1]]) L.box(a, 0.001, b, c, 0.02, d, 'concrete', { collide: false, tint: 0x7a7872 });
  // perimeter: fence on Grid Road (gate at P1), walls north/south
  fence(L, x0, -34, x0, P1.z0);
  fence(L, x0, P1.z1, x0, 34);
  L.box(x0, 0, -34.4, x1, 3.2, -34, 'concreteDark', { tint: 0x8a867e });
  L.box(x0, 0, 34, x1, 3.2, 34.4, 'concreteDark', { tint: 0x8a867e });
  // alley fences
  fence(L, x0, P1.z0, P2.x1, P1.z0);             // P1 north
  fence(L, x0, P1.z1, P2.x0, P1.z1);             // P1 south
  fence(L, P2.x1, P1.z0, P2.x1, P3.z0);          // P2 east
  fence(L, P2.x0, P1.z1, P2.x0, P3.z1);          // P2 west
  fence(L, P2.x1, P3.z0, P3.x1, P3.z0);          // P3 north
  fence(L, P2.x0, P3.z1, P3.x1, P3.z1);          // P3 south
  // gate: posts + two torn leaves, a crashed line truck
  for (const z of [P1.z0, P1.z1]) L.box(x0 - 0.12, 0, z - 0.12, x0 + 0.12, 3.3, z + 0.12, 'metalDark', { tint: 0x5a5a58 });
  const lf = P.prop(L, 163.6, 0, -5.9, 0.35);
  lf.box(0, 1.4, 0, 2.2, 2.6, 0.03, 'chainLink').box(0, 2.7, 0, 2.2, 0.05, 0.05, 'metalDark').box(0, 0.1, 0, 2.2, 0.05, 0.05, 'metalDark').box(-1.1, 1.4, 0, 0.05, 2.7, 0.05, 'metalDark').box(1.1, 1.4, 0, 0.05, 2.7, 0.05, 'metalDark');
  const lf2 = P.prop(L, 159.4, 0, 0.8, 1.9);
  lf2.box(0, 0.06, 0, 2.2, 0.03, 2.6, 'chainLink').box(0, 0.06, -1.3, 2.2, 0.06, 0.06, 'metalDark').box(0, 0.06, 1.3, 2.2, 0.06, 0.06, 'metalDark');
  // line truck (bucket truck) nosed into the fence south of the gate
  const lt = P.prop(L, 157.4, 0, 4.6, Math.PI / 2 + 0.35);
  lt.rbox(0, 1.35, -2.7, 2.3, 1.7, 1.9, 0.12, 'carPaint', 0xe8e4d8).box(0, 1.65, -3.66, 2.0, 0.7, 0.03, 'glassDirty', 0x1a2024);
  lt.box(0, 0.75, 0.6, 2.3, 0.3, 6.4, 'metalDark', 0x2a2a2a).rbox(0, 1.35, 1.2, 2.4, 1.0, 4.4, 0.05, 'paintedWhite', 0xd8d4c8);
  for (const sz of [-2.7, 1.2, 2.6]) for (const sx of [-1.05, 1.05]) lt.cylX(sx, 0.48, sz, 0.48, 0.3, 'rubber', 0x151515, 14);
  lt.tube(0, 2.0, 2.6, 0.4, 6.2, -1.4, 0.14, 'paintedYellow', 0xd8a820, 8).tube(0.4, 6.2, -1.4, 0.2, 5.4, -4.4, 0.11, 'paintedYellow', 0xd8a820, 8);
  lt.rbox(0.2, 5.0, -4.8, 0.9, 1.0, 0.9, 0.06, 'plastic', 0xe8e0d0);
  lt.glow(-0.8, 2.3, -3.4, 0.2, 0.08, 0.08, 0xffa020).glow(0.8, 2.3, -3.4, 0.2, 0.08, 0.08, 0xffa020);
  lt.col(0, 1.3, -0.2, 2.5, 2.6, 7.6, 'metal');
  sign(L, 'NEWBURG POWER & LIGHT', 157.4 - 1.25 * Math.cos(0.35) - 0.03, 1.45, 4.6 + 1.25 * Math.sin(0.35), Math.PI / 2 + 0.35, 2.6, 0.4, { bg: '#e8e4d8', fg: '#1a3a7a', paper: false });
  const amber = L.light(157.2, 2.6, 3.6, 0xffa020, 0, 8, { on: true, priority: 0.5 });
  L.dynamics.push({ t: 0, update(dt) { this.t += dt; amber.intensity = Math.max(0, Math.sin(this.t * 6)) * 6; } });
  P.corpse(L, 159.2, 0.01, 2.2, 0.6, 0xe86a10); blood(L, 159.2, 0, 2.2, 1.6, 4);
  hardHat(L, 160.4, 0, 1.4, 0.4, 0xf0f0e8);
  // gate signage
  sign(L, 'NEWBURG POWER & LIGHT\nSUBSTATION 12', x0 - 0.06, 3.9, -8.6, -Math.PI / 2, 3.2, 0.9, { bg: '#1a3a6a', fg: '#ffffff', border: '#e8c020' });
  L.box(x0 - 0.1, 0, -10.3, x0 - 0.02, 4.4, -10.1, 'metalDark', NC); L.box(x0 - 0.1, 0, -7.1, x0 - 0.02, 4.4, -6.9, 'metalDark', NC);
  hv(L, x0 - 0.07, 1.8, -12.2, Math.PI / 2, 0.8, 0.55);
  hv(L, x0 - 0.07, 1.8, 3.4, Math.PI / 2, 0.8, 0.55);
  safetySign(L, '138 kV\nAUTHORISED\nPERSONNEL ONLY', x0 - 0.07, 1.9, 6.4, Math.PI / 2, 0.8, 0.6, 'warning');
  graffiti(L, 'FOLLOW THE\nPOWER LINES', 163.0, 1.4, -5.03, 0, 1.6, 0.7, '#e8c020', { style: 'scrawl' });
  // alley dressing: signs on the wire, cable drums, cones, a tool trailer, blood
  for (const [x, z, ry] of [[168, -5.03, 0], [174, -0.97, Math.PI], [179.97, 2, -Math.PI / 2], [176.03, 6, Math.PI / 2], [186, 10.03, 0], [194, 13.97, Math.PI]]) hv(L, x, 1.7, z, ry);
  stencil(L, 'SUB 12 · BAY A', 170.5, 2.6, -5.03, 0, 1.8, 0.3, '#e8e8d8');
  stencil(L, 'BAY C', 179.97, 2.6, -2.6, -Math.PI / 2, 0.9, 0.3, '#e8e8d8');
  stencil(L, 'BAY D', 190, 2.6, 13.97, Math.PI, 0.9, 0.3, '#e8e8d8');
  cableDrum(L, 172.4, 0, -4.0, 0.2, 0.6, 0x1a1a1a);
  cableDrum(L, 178.9, 0, 4.2, 1.3, 0.55, 0x8a1a14);
  for (const [x, z] of [[165.4, -1.7], [177.2, 9.2], [188.2, 11.0]]) P.trafficCone(L, x, 0, z, rng() * 3);
  P.corpse(L, 177.6, 0.01, 1.4, 1.8, 0xe8c020); blood(L, 177.6, 0, 1.4, 1.4, 5);
  P.corpse(L, 191.6, 0.01, 12.6, 0.3, 0x3a4a2a);
  for (let i = 0; i < 7; i++) L.decal(166 + i * 1.6, 0.013, -3 + Math.sin(i) * 0.6, 0, 1, 0, 0.8, DF.SMEAR);
  L.item('pills', 179.5, 0.02, -4.4, { chance: 0.5 });
  L.item('throwable', 177.0, 0.02, 13.4, { chance: 0.6 });
  // ---- Yard A (north): the big transformers, gantries, breakers, control house
  for (const x of [168, 180, 192]) { yardBank(L, x, -12.5, 0); fireWall(L, x + 3.4, -16, x + 3.8, -9.5); }
  for (const x of [166, 172, 178, 184, 190, 196]) breaker(L, x, 0, -20.5, 0);
  gantry(L, 171, -24, -7.5, 9.5, { span: 12 });
  gantry(L, 187, -24, -7.5, 9.5, { span: 12 });
  // busbars between the gantries
  for (const z of [-19.9, -15.8, -11.6]) P.pipe(L, 165, 8.2, z, 193, 8.2, z, 0.05, 'metalClean', 0xb8b8a8);
  // control house
  const ch0 = [184, -33.6, 198.6, -26];
  L.box(ch0[0], 0, ch0[1], ch0[2], 4.6, ch0[3], 'brick', { tint: 0x8a5a44 });
  L.box(ch0[0] - 0.2, 4.6, ch0[1] - 0.2, ch0[2] + 0.2, 4.9, ch0[3] + 0.2, 'concrete', { tint: 0x8a867e });
  for (const x of [186.5, 190, 193.5, 196.5]) L.box(x - 0.7, 1.6, ch0[3], x + 0.7, 2.8, ch0[3] + 0.03, 'glassDirty', { collide: false, tint: 0x3a4a44 });
  L.box(190.9, 0, ch0[3], 192.1, 2.2, ch0[3] + 0.04, 'metalDark', { collide: false, tint: 0x3a5a6a });
  sign(L, 'CONTROL HOUSE\nSUB 12', 191.5, 3.6, ch0[3] + 0.04, 0, 1.8, 0.6, { bg: '#1a3a6a', fg: '#fff' });
  L.light(191.5, 3.0, ch0[3] + 0.8, 0xfff0d0, 6, 8, { flicker: 0.3 });
  L.box(191.2, 2.85, ch0[3] + 0.04, 191.8, 2.95, ch0[3] + 0.2, 'emissiveWarm', NC);
  P.acUnit(L, 186, 4.9, -30, 0);
  // yard A floodlight
  P.floodLight(L, 164.2, 0, -8.2, -2.4, { h: 6, intensity: 30, range: 26, flicker: 0.25 });
  // ---- Yard B (south-west): transformer + capacitor banks
  for (const z of [4.5, 16, 27]) { yardBank(L, 169, z, Math.PI / 2, { color: 0x5a6a5e }); fireWall(L, 164, z + 3.2, 174, z + 3.6, 3.8); }
  gantry(L, 172.5, 1.5, 32, 9, { span: 7 });
  for (let i = 0; i < 4; i++) {
    const p = P.prop(L, 164.2, 0, 9 + i * 1.6, 0);
    p.box(0, 0.4, 0, 1.0, 0.8, 1.0, 'metalClean', 0x8a8e88);
    for (let k = 0; k < 3; k++) p.box(-0.3 + k * 0.3, 1.3, 0, 0.2, 1.0, 0.5, 'paintedWhite', 0xb8bcb0);
    p.col(0, 0.9, 0, 1.0, 1.8, 1.0, 'metal');
  }
  // ---- Yard C (east centre)
  for (const z of [-1, 6]) { yardBank(L, 188, z, 0, { w: 3.4, h: 3.2 }); breaker(L, 195, 0, z, Math.PI / 2); }
  fireWall(L, 183, 2.3, 193, 2.7, 4.0);
  gantry(L, 197.5, -4, 9, 8.5, { span: 16, phases: 3 });
  // ---- Yard D (south-east): mobile substation trailer, spares
  const tr = P.prop(L, 188, 0, 24, Math.PI / 2);
  tr.box(0, 1.0, 0, 2.5, 0.3, 12, 'metalDark', 0x2a2a2a).rbox(0, 2.4, 1.5, 2.4, 2.4, 6, 0.04, 'paintedGreen', 0x5a6a5e);
  for (const sz of [3.5, 4.8]) for (const sx of [-1.05, 1.05]) tr.cylX(sx, 0.5, sz, 0.5, 0.3, 'rubber', 0x151515, 14);
  for (let k = 0; k < 3; k++) tr.cyl(-0.6 + k * 0.6, 4.0, -1.0, 0.1, 0.9, 'plasticGloss', 0x7a4a2a, null, 10);
  tr.col(0, 2.0, 0.5, 2.6, 4.0, 11, 'metal');
  sign(L, 'NP&L MOBILE SUB 3', 186.73, 2.6, 22.5, -Math.PI / 2, 2.6, 0.4, { bg: '#e8e4d8', fg: '#1a3a7a', paper: false });
  for (let i = 0; i < 3; i++) cableDrum(L, 180 + i * 1.8, 0, 30.5, 0.1 * i, 0.75, 0x2a2a2a);
  P.transformer(L, 197, 0, 30, 0, { w: 2.0, d: 1.4, h: 2.0, color: 0x6a6a60 });
  L.box(196.6, 0, 16, 197.0, 3.8, 22, 'concreteDark', { tint: 0x8a867e });
  // breaches (infected shortcuts into the alleys)
  P.corpse(L, 182, 0.01, 17, 1.0, 0x3a3a3a);
  // conductors from the Grid Road poles over the fence into the gantries
  for (const dz of [-1.0, 0, 1.0]) P.pipe(L, 160.9, 10.5, -12 + dz, 171, 9.2, -12.5 + dz * 3, 0.012, 'metalDark', 0x2a2a2a);
  // yard lights on poles over the alleys (sodium, one dying)
  for (const [x, z, fl] of [[171, -1.4, 0.05], [179.6, 3.5, 0.5], [190, 13.6, 0.1]]) {
    const p = P.prop(L, x, 0, z, 0);
    p.cyl(0, 3.5, 0, 0.08, 7, 'metalDark', 0x4a4a48, null, 8).box(0, 7, 0, 0.3, 0.14, 0.7, 'metalDark', 0x3a3a3a).glow(0, 6.92, 0, 0.22, 0.02, 0.55, 0xffb060);
    p.col(0, 3.5, 0, 0.2, 7, 0.2, 'metal');
    const l = L.light(x, 6.6, z, 0xffa850, 22, 18, { flicker: fl });
    P.lightCone(L, x, 6.9, z, [0, -1, 0], 6.5, 2.2, 0xffa850, l, 0.5);
  }
  // hum + arcs
  const hum = transformerHum(L, game, [[168, 2, -12.5], [180, 2, -12.5], [192, 2, -12.5], [169, 2, 4.5], [169, 2, 16], [188, 2, -1], [188, 2, 6]], { vol: 0.9 });
  const arcs = [
    arcFlasher(L, game, [170.1, 3.4, -11.9], [170.4, 8.3, -11.6], { first: 2, min: 4, max: 7, hazard: [168.5, 0, -14.5, 171.5, 4, -10.5], dps: 25 }),
    arcFlasher(L, game, [186.4, 3.6, 5.2], [196.8, 7.6, 5.0], { first: 4, min: 5, max: 9, intensity: 40 }),
    arcFlasher(L, game, [168.6, 3.3, 15.2], [172.5, 8.0, 15.0], { first: 6, min: 6, max: 10 }),
  ];
  L.reverb(x0, 0, -34, x1, 20, 34, 'outdoor');
  L.ambience(x0, -1, -34, x1, 20, 34, 'city');
  return { hum, arcs };
}

// ================================================================ WORKSHOP
function workshop(L, game) {
  const { x0, x1, z0, z1, y, H } = WS;
  // backdrop buildings north + south of the workshop (the substation's east edge)
  L.box(x0, 0, -34.4, x1 + 0.2, 11, z0 - 0.3, 'brickDark', { tint: 0x5a4034 });
  L.box(x0, 0, z1 + 0.3, x1 + 0.2, 8, 34.4, 'concrete', { tint: 0x8a867e });
  for (let z = -30; z < -2; z += 3.2) L.box(x1 + 0.2, 3, z, x1 + 0.22, 4.6, z + 1.8, 'glassDirty', { collide: false, tint: 0x1a2024 });
  for (let z = 25; z < 33; z += 3.2) L.box(x1 + 0.2, 3, z, x1 + 0.22, 4.6, z + 1.8, 'glassDirty', { collide: false, tint: 0x1a2024 });
  L.box(x0 - 0.02, 0, -30, x0, 2.6, -24, 'metalDark', { collide: false, tint: 0x4a4a48 });
  const r = room(L, {
    x0, z0, x1, z1, y, h: H, floor: 'concreteFloor', ceil: 'metalDark', wall: 'brickTan',
    walls: {
      w: { mat: 'brickTan', open: [{ at: 12, w: 1.8, h: 2.3 }] },
      e: { mat: 'brickTan', open: [{ at: 16.2, w: 3.6, h: 2.5 }, { at: 6.4, w: 1.1, door: true, hinge: 1, opened: false }] },
      n: { mat: 'brickTan' },
      s: { mat: 'brickTan' },
    },
    light: { type: 'none' },
    reverb: 'room',
  });
  // porch step at the west door
  L.box(x0 - 0.8, 0, 11, x0, y, 13, 'concrete', { tint: 0x8a867e });
  // the west door, kicked off its hinges
  const dd = P.prop(L, 201.6, y, 13.6, 0.3); dd.box(0, 0.03, 0, 1.0, 0.05, 2.1, 'metalDark', 0x3a5a6a);
  // signage outside
  sign(L, 'VOLTEX ELECTRIC', x0 - 0.06, 4.3, 12, -Math.PI / 2, 4.0, 0.8, { bg: '#1a1a1a', fg: '#f0c020', border: '#f0c020' });
  sign(L, 'INDUSTRIAL · COMMERCIAL · 24 HR CALL-OUT', x0 - 0.06, 3.55, 12, -Math.PI / 2, 4.0, 0.3, { bg: '#f0c020', fg: '#1a1a1a' });
  sign(L, 'VOLTEX ELECTRIC\nCONTRACTORS', x1 + 0.06, 4.2, 12, Math.PI / 2, 4.2, 1.0, { bg: '#1a1a1a', fg: '#f0c020', border: '#f0c020' });
  // the roll-up (east) half-raised: slats bunched overhead
  const ru = P.prop(L, x1 - 0.1, y, 16.2, Math.PI / 2);
  for (let i = 0; i < 6; i++) ru.box(0, 2.55 + i * 0.1, 0, 3.7, 0.09, 0.05, 'metal', 0x9a9e9e);
  ru.cylX(0, 3.35, -0.2, 0.28, 3.9, 'metalDark', 0x4a4a48, 12);
  // interior: benches, racks, cable drums, the service van, a forklift, the office
  P.van(L, 211.5, y, 17.4, Math.PI / 2 + 0.05, 0xe8e4d8);
  sign(L, 'VOLTEX', 211.5, y + 1.4, 16.36, 0, 1.6, 0.35, { bg: '#1a1a1a', fg: '#f0c020', paper: false });
  for (const [x, z, ry] of [[202.6, 4.2, 0], [206.4, 4.2, 0], [202.6, 20.6, Math.PI]]) {
    const b = P.prop(L, x, y, z, ry);
    b.box(0, 0.88, 0, 3.0, 0.08, 0.9, 'woodDark', 0x6a4a2a).box(0, 0.45, 0, 2.9, 0.06, 0.8, 'metalDark', 0x3a3a3a);
    for (const sx of [-1.4, 1.4]) for (const sz of [-0.38, 0.38]) b.box(sx, 0.44, sz, 0.06, 0.88, 0.06, 'metalDark', 0x3a3a3a);
    b.box(-0.9, 1.0, -0.2, 0.26, 0.16, 0.16, 'paintedBlue', 0x2a4a8a).box(0.5, 0.95, 0.1, 0.5, 0.1, 0.36, 'metalClean', 0x9a9a9a);
    b.box(0, 1.5, 0.44, 3.0, 1.1, 0.04, 'woodPale', 0xb8a888); // pegboard
    for (let k = 0; k < 7; k++) b.box(-1.2 + k * 0.4, 1.4 + (k % 3) * 0.2, 0.4, 0.05, 0.3, 0.04, 'metalDark', 0x2a2a2a);
    b.col(0, 0.45, 0, 3.0, 0.9, 0.9, 'wood');
  }
  P.metalShelf(L, 200.6, y, 17.4, Math.PI / 2, 3.2, 3.2, 0.8);
  P.metalShelf(L, 200.6, y, 7.4, Math.PI / 2, 3.2, 3.2, 0.9);
  for (let i = 0; i < 4; i++) cableDrum(L, 206 + i * 1.6, y, 21.2, 0.05 * i, 0.55 + (i % 2) * 0.15, [0x1a1a1a, 0x8a1a14, 0x1a3a8a, 0x1a1a1a][i]);
  const fk = P.prop(L, 206.8, y, 9.6, 0.7);
  fk.rbox(0, 0.8, 0, 1.1, 1.0, 1.9, 0.08, 'paintedYellow', 0xe0a818).box(0, 1.6, 0.3, 1.0, 0.1, 1.0, 'metalDark', 0x2a2a2a);
  for (const sx of [-0.45, 0.45]) fk.box(sx, 1.2, 0.8, 0.06, 1.8, 0.06, 'metalDark', 0x2a2a2a).box(sx, 1.2, -0.9, 0.08, 2.4, 0.08, 'metalDark', 0x2a2a2a);
  fk.box(-0.2, 0.08, -1.4, 0.12, 0.06, 1.0, 'metalDark', 0x2a2a2a).box(0.2, 0.08, -1.4, 0.12, 0.06, 1.0, 'metalDark', 0x2a2a2a);
  for (const [sx, sz] of [[-0.5, 0.6], [0.5, 0.6], [-0.5, -0.6], [0.5, -0.6]]) fk.cylX(sx, 0.25, sz, 0.25, 0.2, 'rubber', 0x151515, 12);
  fk.col(0, 0.8, 0, 1.2, 1.6, 2.2, 'metal');
  toolCart(L, 209.4, y, 5.4, 0.3);
  P.generator(L, 203.2, y, 17.2, 1.4);
  jerryCans(L, 201.2, y, 20.8, 0.3);
  physProp(L, 'gascan', 203.4, y + 0.05, 9.4);
  physProp(L, 'propane', 216.8, y + 0.05, 20.8);
  // office (NE corner) behind glass: the foreman held out here
  L.wallX(210.2, x1, 8.6, y, y + 2.8, 'plaster', 0.12, [{ a: 211.6, b: 212.6, y0: y, y1: y + 2.1 }, { a: 213.4, b: 217.2, y0: y + 1.0, y1: y + 2.2 }], { tint: 0xd8d4c8 });
  L.wallZ(z0, 8.6, 210.2, y, y + 2.8, 'plaster', 0.12, [], { tint: 0xd8d4c8 });
  L.box(213.4, y + 1.0, 8.58, 217.2, y + 2.2, 8.62, 'glassDirty', { collide: false, tint: 0x3a4a4a });
  L.box(210.2, y + 2.8, z0, x1, y + 2.9, 8.66, 'ceiling', { tint: 0xc8c4b8 });
  P.desk(L, 214.8, y, 4.0, Math.PI, true);
  P.officeChair(L, 214.6, y, 4.9, 2.9);
  P.filingCabinet(L, 217.4, y, 3.0, -Math.PI / 2);
  P.papers(L, 214.8, y + 0.77, 4.0, 0.6, 8);
  cardboard(L, 211.4, y, 3.2, 0.4, 2);
  wallMessages(L, 213.6, y + 1.6, z0 + 0.14, 0, 2.2, 1.0, { lines: ['VOLTEX CREW → AIRPORT\nARMY WANTS ELECTRICIANS', 'GENNY AT THE TERMINAL\nNEEDS FUEL', 'RAY WENT BACK FOR HIS KIDS'], density: 0.6 });
  L.item('health', 214.2, y + 0.78, 3.8, { chance: 0.8 });
  L.item('ammo', 216.9, y + 0.02, 7.4);
  L.item('tier2', 212.0, y + 0.02, 7.8, { chance: 0.5 });
  ceilingLight(L, 214, y + 2.75, 5.4, { type: 'fluoro', intensity: 7, range: 7, flicker: 0.5 });
  // workshop lighting: two hanging high-bays working, one dead, a work light
  ceilingLight(L, 205, y + H - 0.4, 8, { type: 'cage', intensity: 9, range: 13, flicker: 0.15 });
  ceilingLight(L, 205, y + H - 0.4, 17, { type: 'cage', on: false });
  ceilingLight(L, 213, y + H - 0.4, 14, { type: 'cage', intensity: 8, range: 12, flicker: 0.45 });
  workLight(L, 209.0, y, 12.4, -2.2, { intensity: 10, range: 10, flicker: 0.1 });
  // roof trusses + pipe
  for (let x = x0 + 3; x < x1; x += 3.5) L.box(x - 0.08, y + H - 0.6, z0, x + 0.08, y + H - 0.35, z1, 'metalDark', { collide: false, tint: 0x3a3a3a });
  // blood + story
  P.corpse(L, 208.4, y + 0.01, 13.4, 2.2, 0x3a3a3a); blood(L, 208.4, y, 13.4, 1.6, 4);
  P.corpse(L, 216.2, y + 0.01, 13.8, 0.6, 0xe8c020);
  for (let i = 0; i < 6; i++) L.decal(203 + i * 2.2, y + 0.013, 12.2 + i * 0.6, 0, 1, 0, 0.8, DF.SMEAR);
  graffiti(L, 'NO POWER NO PLANES\nKEEP SUB 12 LIVE', 205.2, y + 2.8, z1 - 0.16, Math.PI, 2.6, 0.9, '#b8201a');
  poster(L, 'evac', 200.18, y + 1.6, 5.2, Math.PI / 2, 0.5, 0.72, {});
  safetySign(L, 'LOCK OUT\nTAG OUT', 200.18, y + 1.8, 9.2, Math.PI / 2, 0.6, 0.6, 'warning');
  safetySign(L, 'FIRE EXIT →', x1 - 0.16, y + 2.5, 6.4, -Math.PI / 2, 0.9, 0.3, 'safe');
  L.witchSpots.push({ x: 205.4, y, z: 20.4 }); // back corner: the route (z 6-13) passes > 7 m away
  L.reverb(x0, y, z0, x1, y + H, z1, 'room');
  L.ambience(x0, y, z0, x1, y + H, z1, 'apartments');
  return { room: r };
}

// ============================================================ TERMINAL ROAD
function terminalRoad(L, game) {
  const { x0, x1 } = TRD;
  street(L, x0, -34, x1, 34, 'z', { sidewalk: 2.6 });
  for (const [zz, s] of [[-34, 1], [34, -1]]) L.clip(x0, 0, zz - (s > 0 ? 0.6 : -0.1), x1, 7, zz + (s > 0 ? 0.1 : 0.6), F_SOLID | F_SHOOT);
  // north: the airport shuttle crashed into a lamp post; south: an army roadblock
  P.bus(L, 225.2, 0, -28.6, Math.PI / 2 - 0.25, { color: 0x1a4a8a, lit: false });
  sign(L, 'METRO INTL ✈ SHUTTLE', 226.4, 2.6, -24.4, -0.25, 3.4, 0.45, { bg: '#1a4a8a', fg: '#fff', paper: false });
  P.car(L, 221.0, 0, -22.2, 0.9, { burnt: true });
  fireSource(L, 221.0, 0.8, -22.2, 0.7, { hazard: true });
  for (const [x, z, ry] of [[220.6, 27.4, 0], [224.2, 28.2, 0.1], [227.8, 27.6, -0.1], [231.2, 28.4, 0]]) jersey(L, x, 0, z, ry, 3.0);
  P.truck(L, 225.8, 0, 31.2, Math.PI / 2, 0x3a4a2a);
  P.sandbags(L, 229.6, 0.15, 24.8, 0, 2.4, 3);
  // overhead airport sign gantry
  const g = P.prop(L, 225, 0, -6, 0);
  for (const sx of [-6.6, 6.6]) g.box(sx, 3.5, 0, 0.3, 7, 0.3, 'metalDark', 0x5a5a58).box(sx, 0.15, 0, 0.8, 0.3, 0.8, 'concrete');
  g.box(0, 6.8, 0, 13.6, 0.25, 0.25, 'metalDark', 0x5a5a58).box(0, 6.1, 0, 13.6, 0.12, 0.12, 'metalDark', 0x5a5a58);
  g.col(-6.6, 3.5, 0, 0.4, 7, 0.4, 'metal').col(6.6, 3.5, 0, 0.4, 7, 0.4, 'metal');
  sign(L, 'METRO INTERNATIONAL AIRPORT ✈\nTERMINALS · PARKING P1-P3 →', 222, 6.1, -5.84, 0, 5.6, 1.4, { bg: '#1a5a2a', fg: '#fff', border: '#fff' });
  sign(L, 'ROUTE 9\nNORTH ↑', 229, 6.1, -5.84, 0, 2.4, 1.4, { bg: '#1a5a2a', fg: '#fff', border: '#fff' });
  sign(L, 'METRO INTERNATIONAL AIRPORT ✈\nTERMINALS · PARKING P1-P3 →', 222, 6.1, -6.16, 0, 5.6, 1.4, { bg: '#1a5a2a', fg: '#fff', border: '#fff' });
  // cars + lights
  P.car(L, 224.4, 0, 3.6, 0.2, { color: 0x8a8a88 });
  P.taxi(L, 228.2, 0, 12.4, Math.PI - 0.1, {});
  P.car(L, 222.0, 0, 20.4, -0.3, { color: 0x3a2a1a, damaged: true });
  P.streetLight(L, 220.3, 0.15, -12, Math.PI / 2, { on: true, intensity: 24, range: 18 });
  P.streetLight(L, 231.0, 0.15, 6, -Math.PI / 2, { on: true, intensity: 22, range: 18, flicker: 0.3 });
  P.streetLight(L, 220.3, 0.15, 24, Math.PI / 2, { on: true, intensity: 18, range: 16 });
  P.trafficLight(L, 231.0, 0.15, 20.4, -Math.PI / 2, { state: 'amber' });
  P.busStop(L, 220.6, 0.15, -1.0, Math.PI / 2, 3.2);
  poster(L, 'airline', 220.2, 1.6, -1.0, Math.PI / 2, 1.2, 0.8, { title: 'SKYLINE AIR', torn: 0.2 });
  for (let i = 0; i < 9; i++) blood(L, 219 + rng() * 12, 0, -14 + rng() * 34, 0.6 + rng(), i + 2);
  P.corpse(L, 225.8, 0.01, 9.0, 0.3, 0x2a3a5a);
  P.corpse(L, 229.4, 0.16, 18.6, 2.3, 0x5a3a2a);
  for (const [x, z] of [[223.4, 14.8], [226.6, -10.2]]) P.trafficCone(L, x, 0, z, rng() * 3);
  L.reverb(x0, 0, -34, x1, 14, 34, 'outdoor');
  L.ambience(x0, -1, -34, x1, 14, 34, 'city');
}

export function buildSubstation(L, game) {
  gridRoad(L, game);
  const S = substation(L, game);
  const W = workshop(L, game);
  terminalRoad(L, game);
  return { ...S, ...W };
}
