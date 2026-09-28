// Dead Air 4 — the terminal lobby (check-in hall): a 70 x 44 m, 16 m tall hall
// with a glass curtain wall onto the burning departures curb, three check-in
// islands (SKYLINE AIR / FLY NEWBURG / TRANSMERIDIAN / PELICAN AIRWAYS), flight
// boards reading CANCELLED, a vintage airliner replica hanging from the roof
// trusses, ad banners, an under-balcony cafe and newsstand, the military's
// triage and evacuation-processing area, the sealed security entrance, and the
// landside outside the glass (curb canopy, burning cars, the parking garage and
// the skybridge crossing the road).
import * as THREE from 'three';
import { P, sign, graffiti, poster, posterWall, wallMessages, supplies, ceilingLight, physProp, fireSource, stencil } from './kit.js';
import { DF } from '../render/decals.js';
import { VisualBatch, ADS, billboard, adTexture, neonSign } from './da_parts.js';
import { tent, cot, medCrate, razorWire, stretcherPile, jersey } from './ch3_props.js';
import { cityBlock } from './da2_parts.js';
import { makeRng } from '../core/math.js';
import { YU, LOBBY, BAL, BARR } from './da4_layout.js';
import { rng, NC, glassWallX, wayfind, notice, curtainMat, airlineFascia, banner, ADS4, stanchions, column, body, strewLuggage, flightBoard, trail, F_SOLID, F_NONAV, F_SHOOT } from './da4_parts.js';

const { x0: X0, x1: X1, z0: Z0, z1: Z1, h: HH } = LOBBY;

export function buildLobby(L, game, S) {
  shell(L, game);
  islands(L, game);
  underBalcony(L, game);
  boardsAndArt(L, game);
  triage(L, game, S);
  hallDressing(L, game, S);
  landside(L, game);
}

// ================================================================ SHELL
function shell(L, game) {
  // terrazzo floor with inlaid bands
  L.floor(X0 + 0.2, Z0, X1 - 0.2, Z1, 0, 'marble', 0.3, { tint: 0xa8a49a });
  for (const z of [8, 32]) L.box(X0 + 0.2, 0, z - 0.2, X1 - 0.2, 0.004, z + 0.2, 'marble', { collide: false, tint: 0x3a4a5a });
  for (const x of [47, 61, 84]) L.box(x - 0.2, 0, Z0, x + 0.2, 0.004, Z1, 'marble', { collide: false, tint: 0x3a4a5a });
  // north wall (security behind it) + the corner filler above the wing roof
  L.box(X0 + 0.2, 0, Z0 - 0.3, X1 + 0.2, HH + 0.4, Z0, 'concrete', { tint: 0xc8c2b6 });
  L.box(X0 - 0.2, 10.7, Z0 - 0.3, X0 + 0.2, HH + 0.4, Z0, 'concrete', { tint: 0xc8c2b6 });
  // east wall with the barricaded passage to baggage claim (door frame of the
  // hidden blocker is buried in the jambs: opening 5 cm narrower each side)
  L.wallZ(Z0, Z1, X1, 0, HH + 0.4, 'concrete', 0.4, [{ a: BARR.z0 + 0.05, b: BARR.z1 - 0.05, y0: 0, y1: BARR.h - 0.05 }], { tint: 0xc8c2b6 });
  L.box(X1 - 0.22, BARR.h - 0.3, BARR.z0 - 0.4, X1 - 0.2, BARR.h + 0.5, BARR.z1 + 0.4, 'metalDark', { collide: false, tint: 0x2a2c30 });
  // south curtain wall onto the departures curb; the shuttle van came through bay x 73..79
  glassWallX(L, X0 + 0.2, X1 - 0.2, Z1, 0, HH, { step: 3.5, transoms: [3.4, 7.6, 11.8], openings: [[72.3, 79.3, 3.4]] });
  L.clip(72.3, 0, Z1 - 0.1, 79.3, 3.4, Z1 + 0.6, F_SOLID);
  L.box(X0 + 0.2, HH - 0.6, Z1 - 0.3, X1 - 0.2, HH, Z1, 'metalDark', { collide: false, tint: 0x2a2c30 });
  // roof with two skylight strips, deep trusses
  for (const [a, b] of [[Z0 - 0.3, 12], [14, 28], [30, Z1 + 0.3]]) L.box(X0 - 0.2, HH, a, X1 + 0.2, HH + 0.6, b, 'concreteDark', { tint: 0x8a8680 });
  for (const [a, b] of [[12, 14], [28, 30]]) {
    L.box(X0 - 0.2, HH + 0.2, a, X1 + 0.2, HH + 0.24, b, curtainMat(), NC);
    L.clip(X0 - 0.2, HH + 0.2, a, X1 + 0.2, HH + 0.6, b, F_SOLID | F_NONAV);
    for (let x = X0 + 3; x < X1; x += 3) L.box(x - 0.04, HH, a, x + 0.04, HH + 0.3, b, 'metalDark', NC);
  }
  for (let x = X0 + 6; x < X1 - 2; x += 8) {
    L.box(x - 0.15, HH - 0.3, Z0, x + 0.15, HH, Z1, 'paintedWhite', { collide: false, tint: 0xb8bcbe });
    L.box(x - 0.1, HH - 2.2, Z0, x + 0.1, HH - 2.0, Z1, 'paintedWhite', { collide: false, tint: 0xb8bcbe });
    for (let z = Z0 + 1; z < Z1 - 1; z += 2.75) L.part('box', x, HH - 1.15, z + 1.375, 0.08, 2.4, 0.08, 'paintedWhite', { rx: (Math.floor(z) % 2 ? 1 : -1) * 0.85, tint: 0xb8bcbe });
  }
  // columns
  for (const [x, z] of [[47, 31], [61, 31], [47, 9], [61, 9]]) column(L, x, z, 0, HH, 0.5, { tint: 0xd8d4cc });
  L.ambience(X0, -0.5, Z0, X1, HH, Z1, 'city');
  L.reverb(X0, 0, Z0, X1, HH, Z1, 'hall');
}

// ================================================================ CHECK-IN ISLANDS
const ISL = [
  { x: 40, west: 'SKYLINE AIR', east: 'SKYLINE AIR', z0: 11, z1: 29 },
  { x: 54, west: 'FLY NEWBURG', east: 'TRANSMERIDIAN', z0: 11, z1: 29 },
  { x: 68, west: 'PELICAN AIRWAYS', east: 'NORTHSTAR', z0: 11, z1: 25 },
];
function islands(L, game) {
  for (const I of ISL) {
    const { x, z0, z1 } = I;
    const len = z1 - z0, zc = (z0 + z1) / 2;
    // core: bag-drop belts run into a clad block
    L.box(x - 0.9, 0, z0, x + 0.9, 2.2, z1, 'paintedWhite', { tint: 0xd8d6d0 });
    L.box(x - 0.92, 0, z0, x + 0.92, 0.12, z1, 'metalDark', { collide: false, tint: 0x2a2c30 });
    for (let z = z0 + 1.6; z < z1 - 0.5; z += 3.2) for (const s of [-1, 1]) L.box(x + s * 0.92 - 0.01, 0.55, z - 0.45, x + s * 0.92 + 0.01, 1.05, z + 0.45, 'rubber', { collide: false, tint: 0x141414 });
    // desks both sides (passenger side faces away from the core)
    const n = Math.floor(len / 1.6);
    P.checkInDesk(L, x - 1.25, 0, zc, Math.PI / 2, n);
    P.checkInDesk(L, x + 1.25, 0, zc, -Math.PI / 2, n);
    // fascia box on posts with the carriers' names
    for (const z of [z0 + 0.6, zc, z1 - 0.6]) L.box(x - 0.12, 2.2, z - 0.12, x + 0.12, 3.3, z + 0.12, 'metalClean', { tint: 0xa8acae });
    L.box(x - 1.3, 3.3, z0 - 0.2, x + 1.3, 4.5, z1 + 0.2, 'paintedWhite', { tint: 0xe8e8e4 });
    L.box(x - 1.32, 3.3, z0 - 0.22, x + 1.32, 3.38, z1 + 0.22, 'metalDark', { collide: false, tint: 0x2a2c30 });
    for (let k = 0; k < 2; k++) {
      const zz = z0 + len * (k ? 0.72 : 0.28);
      airlineFascia(L, I.west, x - 1.32, 3.9, zz, -Math.PI / 2, Math.min(8, len * 0.42), 0.95);
      airlineFascia(L, I.east, x + 1.32, 3.9, zz, Math.PI / 2, Math.min(8, len * 0.42), 0.95);
    }
    airlineFascia(L, I.west === I.east ? I.west : 'CHECK-IN', x, 3.9, z1 + 0.22, 0, 2.5, 0.95);
    airlineFascia(L, I.west === I.east ? I.west : 'CHECK-IN', x, 3.9, z0 - 0.22, Math.PI, 2.5, 0.95);
    sign(L, `${String.fromCharCode(65 + ISL.indexOf(I))}`, x, 5.0, z1 - 0.2, 0, 0.9, 0.9, { bg: '#f2c230', fg: '#16191e', clean: true, font: 'Arial Black, sans-serif' });
    // clutter on the desks and around
    strewLuggage(L, x - 5, z0, x - 2.6, z1, 0, 5);
    strewLuggage(L, x + 2.6, z0, x + 5, z1, 0, 5);
    if (ISL.indexOf(I) !== 2) P.luggageCart(L, x - 3.6, 0, z1 + 1.8, rng() * 6, true);
    P.papers(L, x + 3, 0.01, zc, 3, 8);
  }
  // zig-zag queue lanes in front of island A's south end and B
  stanchions(L, [[35, 31], [45, 31], [45, 32.4], [35, 32.4], [35, 33.8], [45, 33.8]]);
  stanchions(L, [[50, 30.8], [58, 30.8], [58, 32.2], [50, 32.2]], 0, 0x6a1a14);
}

// ================================================================ UNDER THE BALCONY
function underBalcony(L, game) {
  const y1 = YU - 0.4;
  // ceiling downlights
  for (const x of [36, 47, 58]) { L.box(x - 0.2, y1 - 0.02, 2.8, x + 0.2, y1, 3.2, 'emissiveWarm', NC); }
  // newsstand (shutter down) + restrooms + cafe with an open counter
  L.box(X0 + 0.2, 0, 0.0, 41, 0.1, 0.3, 'metalDark', { collide: false });
  for (let y = 0.2; y < 3.2; y += 0.12) L.box(32, y, 0.01, 40, y + 0.08, 0.06, 'metal', { collide: false, tint: 0x9a9e9e });
  sign(L, 'NEWBURG NEWS & GIFTS', 36, 3.7, 0.12, 0, 5.2, 0.6, { bg: '#1a2a4a', fg: '#e8e0c8', glow: 0.5, light: false });
  posterWall(L, 36, 1.6, 0.1, 0, 5.6, 2.0, { kinds: ['missing', 'flyer', 'evac', 'missing', 'quarantine'], seed: 4410 });
  graffiti(L, 'CEDA LEFT US\nHERE TO DIE', 36, 2.4, 0.14, 0, 2.6, 1.0, '#b8201a');
  // cafe
  L.box(42.5, 0, 0, 53.5, 0.02, 5.2, 'woodFloor', { collide: false, tint: 0x7a5a3a });
  P.counter(L, 48, 0, 1.7, Math.PI, 8);
  L.box(42.4, 0, 0.0, 53.6, 3.0, 0.2, 'woodDark', { collide: false, tint: 0x4a3222 });
  for (let i = 0; i < 4; i++) sign(L, ['ESPRESSO  3.50', 'LATTE  4.25', 'MUFFINS  2.95', 'CLOSED — NO WATER'][i], 44 + i * 2.6, 3.0, 0.24, 0, 2.2, 0.55, { bg: '#1a1a18', fg: i === 3 ? '#ff5040' : '#e8e0c8', font: 'Georgia, serif', clean: true });
  neonSign(L, 'Skyline Café', 48, 4.3, 0.28, 0, 5, 1.1, '#ff9a40', { lightIntensity: 5, lightRange: 9, flicker: 0.4 });
  for (const [x, z] of [[44, 4.6], [50.2, 4.8]]) {
    P.table(L, x, 0, z, 0, 0.8, 0.8, 'woodDark');
    P.chair(L, x - 0.6, 0, z, Math.PI / 2, 'woodDark');
    P.chair(L, x + 0.7, 0, z + 0.2, -1.2, 'woodDark', true);
  }
  L.item('pills', 45.6, 1.1, 1.8, { chance: 0.4 });
  L.item('throwable', 51.4, 1.1, 1.6, { chance: 0.4 });
  // restroom corridor + a drinking fountain
  L.box(55, 0, 0.0, 62.8, 3.0, 0.3, 'tileWhite', { collide: false, tint: 0xc8d0d0 });
  sign(L, 'RESTROOMS  ·  FAMILY ROOM', 59, 2.6, 0.32, 0, 3.4, 0.32, { bg: '#16191e', fg: '#f2c230', clean: true });
  for (const x of [56.8, 61.0]) { L.box(x - 0.55, 0, 0.3, x + 0.55, 2.15, 0.34, 'paintedBlue', { collide: false, tint: 0x5a6a7a }); }
  body(L, 58.4, 0, 2.2, 0.9, 0x4a2a4a);
  L.light(48, y1 - 0.3, 3.4, 0xffc890, 7, 9, { flicker: 0.25 });
}

// ================================================================ BOARDS, ART, SCULPTURE, BANNERS
function boardsAndArt(L, game) {
  // the great departures wall above the balcony, arrivals to the east
  flightBoard(L, 47, 12.2, 0.02, 0, 12, 3.4, { kind: 'dep', seed: 11, rows: 11, special: [4, 'EVAC · MIL'], light: true, lightIntensity: 6, lightRange: 18 });
  flightBoard(L, 82, 12.2, 0.02, 0, 10, 3.4, { kind: 'arr', seed: 12, rows: 11, light: true, lightIntensity: 5, lightRange: 16 });
  sign(L, 'METRO INTERNATIONAL · TERMINAL C', 64.5, 14.6, 0.08, 0, 14, 0.9, { fg: '#d8d0b8', font: 'Georgia, serif' });
  // hanging island boards facing the entrance
  for (const [x, z, s] of [[40, 29.6, 21], [54, 29.6, 22], [68, 25.6, 23]]) flightBoard(L, x, 5.4, z + 0.6, 0, 3.2, 1.6, { kind: 'dep', seed: s, rows: 6, hang: HH - 6.2, light: false, back: false });
  // wall art on the west wall under the wing (visible from everywhere on the floor)
  const t = adTexture(ADS4.newburgTourism);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25, roughness: 0.8 }));
  m.position.set(X0 + 0.26, 3.6, 22); m.rotation.y = Math.PI / 2; L.addObject(m);
  L.box(X0 + 0.2, 0.5, 15.8, X0 + 0.24, 6.7, 28.2, 'metalDark', { collide: false, tint: 0x1a1c20 });
  L.light(X0 + 3, 5.5, 22, 0xffd0a0, 5, 12, { flicker: 0.1 });
  // CEDA evacuation banner on the west wall under the reception windows
  banner(L, ADS4.ceda, X0 + 0.25, 4.0, 36, Math.PI / 2, 7, 3.5, { glow: 0.2 });
  // hanging ad banners over the hall
  banner(L, ADS.flyNewburg, 44, 11.4, 38.5, 0, 9, 4.5, { glow: 0.18 });
  banner(L, ADS.skylineAir, 60, 11.4, 38.5, 0, 9, 4.5, { glow: 0.18 });
  banner(L, ADS4.transmeridian, 76, 11.4, 38.5, 0, 9, 4.5, { glow: 0.18 });
  banner(L, ADS4.pelican, 92, 11.4, 38.5, 0, 9, 4.5, { glow: 0.18 });
  for (const x of [44, 60, 76, 92]) for (const s of [-1, 1]) L.box(x + s * 4.2 - 0.01, 13.65, 38.49, x + s * 4.2 + 0.01, HH - 0.3, 38.51, 'metalDark', NC);
  // "SPIRIT OF NEWBURG" — a vintage airliner replica hanging over the hall
  sculpture(L, 62, 9.2, 22, 0.55);
  sign(L, 'THE SPIRIT OF NEWBURG · 1934\nFIRST SCHEDULED FLIGHT FROM METRO FIELD', 61, 1.2, 31.62, 0, 2.6, 0.5, { bg: '#2a2418', fg: '#d8c08a', font: 'Georgia, serif' });
}
function sculpture(L, x, y, z, ry) {
  const p = P.prop(L, x, y, z, ry);
  const silver = 0xc8ccd0, red = 0x9a1a14;
  p.cylZ(0, 0, 0, 1.0, 10, 'metalClean', silver, 16);
  p.frustum(0, 0, 6.6, 0.25, 1.0, 3.2, 'metalClean', silver, [Math.PI / 2, 0, 0], 16);
  p.sph(0, 0, -5.0, 1.0, 'metalClean', silver, [1, 1, 0.7], 14);
  p.cylZ(0, 0, -5.5, 0.55, 0.3, 'metalDark', 0x2a2a2a, 14);
  for (let i = 0; i < 3; i++) p.box(0, 0, -5.75, 0.18, 3.4, 0.04, 'woodDark', 0x4a2a14, [0, 0, i * 2.094 + 0.4]);
  p.box(0, -0.55, 0.2, 19, 0.22, 2.8, 'metalClean', silver, [0, 0, 0]);
  for (const s of [-1, 1]) { p.box(s * 9.3, -0.55, 0.2, 0.5, 0.24, 2.8, 'paintedRed', red); p.cyl(s * 4.2, -0.5, -0.6, 0.62, 2.4, 'metalClean', silver, [Math.PI / 2, 0, 0], 14); p.cylZ(s * 4.2, -0.5, -1.85, 0.4, 0.2, 'metalDark', 0x2a2a2a, 12); for (let i = 0; i < 2; i++) p.box(s * 4.2, -0.5, -1.98, 0.12, 2.2, 0.03, 'woodDark', 0x4a2a14, [0, 0, i * 1.57 + 0.3]); }
  p.box(0, 0.1, 7.6, 5.6, 0.12, 1.4, 'metalClean', silver);
  p.box(0, 1.2, 7.8, 0.12, 2.2, 1.6, 'paintedRed', red);
  for (const s of [-1, 1]) p.box(s * 1.01, 0.35, 0, 0.02, 0.28, 9, 'paintedRed', red);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) p.box(s * 1.0, 0.45, -3 + i * 1.1, 0.03, 0.3, 0.45, 'glassDirty', 0x1a2024);
  p.box(0, 0.95, -3.6, 1.0, 0.35, 1.2, 'glassDirty', 0x2a3036, [0.35, 0, 0]);
  for (const s of [-1, 1]) { p.cyl(s * 4.2, -1.6, -0.2, 0.06, 1.8, 'metalDark'); p.sph(s * 4.2, -2.55, -0.2, 0.42, 'metalClean', silver, [0.6, 1, 1.4], 10); }
  for (const [lx, lz] of [[-6, 0.2], [6, 0.2], [0, -4], [0, 7]]) p.cyl(lx, (HH - y) / 2, lz, 0.012, HH - y, 'metalDark', null, null, 4);
  sign(L, 'SPIRIT OF NEWBURG', ...[x + Math.cos(ry) * 1.02 * 1 + Math.sin(ry) * 0, y + 0.1, z - Math.sin(ry) * 1.02], ry + Math.PI / 2, 3.2, 0.34, { fg: '#9a1a14', font: 'Georgia, serif' });
  L.light(x, y - 3.2, z, 0xffe0b0, 7, 12, { flicker: 0.05 });
}

// ================================================================ MILITARY TRIAGE / EVAC PROCESSING
function triage(L, game, S) {
  // fenced compound in the south-west corner (x 31..57, z 33..43)
  const fz = 34.2;
  P.fenceChain(L, 31, fz, 42, fz, 0, 2.4);
  P.fenceChain(L, 46, fz, 57, fz, 0, 2.4);
  P.fenceChain(L, 57, fz, 57, 38.8, 0, 2.4);
  sign(L, 'CEDA · EVACUATION PROCESSING\nSTATION 2 — ALL PASSENGERS', 44, 2.9, fz - 0.05, 0, 3.6, 0.8, { bg: '#e8e4d8', fg: '#1a2a4a' });
  sign(L, 'TRIAGE', 44, 2.3, fz + 0.05, 0, 1.2, 0.34, { bg: '#b01e18', fg: '#ffffff' });
  tent(L, 36, 0, 39.6, 0, 6, 5.2);
  tent(L, 51.5, 0, 39.8, 0, 6, 5.0, { cross: true });
  for (let i = 0; i < 4; i++) cot(L, 33.8 + i * 1.3, 0, 39.8, 0, i % 2 === 0);
  for (let i = 0; i < 3; i++) cot(L, 49.6 + i * 1.4, 0, 40.2, 0.05, i !== 1);
  for (let i = 0; i < 5; i++) P.bodyBag(L, 42.0 + (i % 2) * 0.9, 0, 36.2 + i * 1.3, Math.PI / 2 + (rng() - 0.5) * 0.2);
  P.gurney(L, 45.8, 0, 38.4, 0.3);
  for (const [x, z] of [[35.6, 38.2], [50.8, 38.5]]) P.ivStand(L, x, 0, z);
  P.wheelchair(L, 47.2, 0, 42.4, 2.6);
  P.wheelchair(L, 32.2, 0, 35.2, 0.9);
  medCrate(L, 40.2, 0, 42.8, 0.2);
  medCrate(L, 40.2, 0.5, 42.8, 0.1, 0.8);
  medCrate(L, 55.8, 0, 42.6, -0.3);
  stretcherPile(L, 55.2, 0, 36.4, 0.4);
  // processing tables with a radio, clipboards, a biohazard bin
  P.table(L, 37.4, 0, 35.3, 0, 2.4, 0.8, 'metalDark');
  P.radioTable(L, 40.6, 0, 35.3, 0);
  P.papers(L, 37.4, 0.79, 35.3, 0.6, 5);
  P.barrel(L, 55.6, 0, 40.4, 0xc8a020, false);
  // generator + floodlights on tripods (the compound's own lighting)
  P.generator(L, 56, 0, 43.0, 0);
  P.floodLight(L, 32.4, 0, 42.6, 0.7, { tower: false, h: 3.2, intensity: 16, range: 17, beamLen: 9 });
  P.floodLight(L, 56.2, 0, 35.2, 2.5, { tower: false, h: 3.2, intensity: 14, range: 16, flicker: 0.08, beamLen: 9 });
  // sandbags + wire at the gap
  P.sandbags(L, 38, 0, 33.4, 0, 3, 2);
  razorWire(L, 51, 0, 33.6, 0, 4);
  // military cache before the crescendo
  supplies(L, 33.4, 0, 36.0, Math.PI / 2, [{ type: 'rifle', chance: 0.75 }, { type: 'autoShotgun', chance: 0.6 }, { type: 'ammo' }], { w: 2.2, mat: 'metalDark' });
  L.item('medkit', 38.0, 0.79, 35.3, { chance: 0.6 });
  L.item('pipebomb', 36.6, 0.79, 35.4, { chance: 0.6 });
  L.item('molotov', 52.6, 0.02, 43.2, { chance: 0.5 });
  physProp(L, 'oxygen', 48.2, 0, 42.8);
  physProp(L, 'oxygen', 48.5, 0, 43.1);
  // bodies of the medics, blood everywhere
  body(L, 38.8, 0, 37.2, 2.2, 0xd8d8d0);
  body(L, 53.6, 0, 37.2, 0.8, 0x4a5a3a);
  for (let i = 0; i < 10; i++) L.decal(33 + rng() * 23, 0.012, 35 + rng() * 8, 0, 1, 0, 0.8 + rng(), i % 3 ? DF.BLOOD1 + (i % 4) : DF.SPLAT_BIG);
  wallMessages(L, X0 + 0.24, 1.7, 40.6, Math.PI / 2, 1.8, 1.2, { lines: ['PAPA + LIN\nFLIGHT 9\nNO TICKETS', 'THEY TOOK\nMY GIRL TO\nTRIAGE\nWHERE IS SHE'], density: 1.2 });
  poster(L, 'quarantine', X0 + 0.23, 1.8, 42.8, Math.PI / 2, 0.6, 0.85);
  S.triageTrigger = [31, -0.5, 30, 58, 3, 44];
}

// ================================================================ HALL DRESSING (luggage sea, bodies, sealed checkpoint)
function hallDressing(L, game, S) {
  // abandoned luggage everywhere + carts
  for (const [x, z, n, r] of [[36, 7, 6, 1.6], [50.4, 7.2, 5, 1.4], [73, 8, 6, 1.8], [88, 30, 7, 2.0], [92, 38, 5, 1.6], [66, 33, 6, 1.8], [81, 40.5, 5, 1.6]]) P.luggagePile(L, x, 0, z, n, r);
  for (const [x, z, r] of [[57, 36.4, 0.6], [85.6, 34.5, 2.1], [94.4, 28.2, 1.3], [62.6, 7.2, 0.2]]) P.luggageCart(L, x, 0, z, r, true);
  strewLuggage(L, 76, 6, 98, 12, 0, 8);
  strewLuggage(L, 62, 32, 70, 42, 0, 6);
  for (const [x, z, r, c] of [[58.8, 33.4, 1.3, 0x2a3a5a], [83.2, 12.6, 0.5, 0x6a3a2a], [91.2, 33.6, 2.9, 0x3a3a3a], [70.5, 30.6, 1.9, 0x5a2a2a]]) body(L, x, 0, z, r, c);
  P.wheelchair(L, 86.4, 0, 6.8, 1.9);
  trail(L, 84, 20, 92, 26, 0, 8);
  // benches along the glass
  for (const x of [36, 52, 88]) P.bench(L, x, 0, 42.8, Math.PI);
  // bins, a vending pair, info kiosk
  for (const [x, z] of [[44.4, 32.8], [58.2, 12.2], [74.6, 30.4], [96, 6]]) P.trashCan(L, x, 0, z);
  P.vending(L, 99.3, 0, 30, Math.PI / 2, 0x1a3a7a);
  P.vending(L, 99.3, 0, 31.2, Math.PI / 2, 0xb02a1a);
  const k = P.prop(L, 78, 0, 20, 0.3);
  k.cyl(0, 0.6, 0, 0.45, 1.2, 'woodPale', 0xc8c0b0, null, 16).cyl(0, 1.22, 0, 0.6, 0.06, 'marble', null, null, 18).box(0, 1.6, 0, 0.9, 0.7, 0.08, 'metalDark', 0x1a1c20).col(0, 0.6, 0, 1.0, 1.2, 1.0, 'wood');
  sign(L, 'INFORMATION', 78, 2.25, 20, 0.3, 1.4, 0.28, { bg: '#16191e', fg: '#f2c230', clean: true });
  sign(L, 'i', 78, 1.62, 19.96, 0.3, 0.5, 0.5, { bg: '#f2c230', fg: '#16191e', clean: true });
  // the sealed security entrance (north wall, x 86..96): shutter + barriers
  for (let y = 0.1; y < 4.2; y += 0.14) L.box(86, y, 0.01, 96, y + 0.1, 0.07, 'metal', { collide: false, tint: 0x8a8e8e });
  L.box(85.6, 0, 0.0, 86, 4.4, 0.3, 'metalDark', { collide: false }); L.box(96, 0, 0.0, 96.4, 4.4, 0.3, 'metalDark', { collide: false });
  L.box(85.6, 4.2, 0.0, 96.4, 4.8, 0.4, 'metalDark', { collide: false });
  wayfind(L, 'SECURITY  ·  GATES C1–C12', 91, 5.3, 0.1, 0, 5.2, 0.6);
  sign(L, 'CHECKPOINT CLOSED\nBY ORDER OF THE CIVIL EMERGENCY AUTHORITY\nNO ADMITTANCE', 91, 2.3, 0.12, 0, 3.4, 1.1, { bg: '#e8e2d0', fg: '#8a1a14' });
  for (const [x, r] of [[87.5, 0.05], [91, -0.04], [94.5, 0.08]]) jersey(L, x, 0, 1.6, r, 3.0, 0xb8b4a8);
  P.sandbags(L, 91, 0, 3.0, 0, 6, 3);
  stencil(L, 'NO ENTRY', 91, 0.5, 1.15, 0, 1.8, 0.35, '#e8e0c8');
  graffiti(L, 'THEY SEALED\nIT AND RAN', 88.2, 3.4, 0.12, 0, 1.8, 0.8, '#b8201a');
  // wayfinding across the hall
  wayfind(L, 'BAGGAGE CLAIM  →', 99.76, 5.3, 18, -Math.PI / 2, 3.6, 0.6);
  wayfind(L, '←  CHECK-IN A · B · C', 99.76, 6.1, 18, -Math.PI / 2, 3.6, 0.5, { fg: '#e8e8e0' });
  sign(L, 'EXIT  ↓  DEPARTURES CURB', 64, 4.2, 43.7, 0, 3.4, 0.4, { bg: '#1a6a2a', fg: '#ffffff', clean: true, glow: 0.6, light: false });
  for (const x of [45.5, 88.5]) sign(L, 'EXIT', x, 2.7, 43.8, 0, 0.8, 0.28, { bg: '#1a6a2a', fg: '#ffffff', clean: true, glow: 0.8, light: false });
  // hall lighting: a few surviving high-bay pendants (hung from the trusses) and emergency lights
  for (const [x, z, it, fl] of [[46, 20, 22, 0.1], [62, 14, 18, 0.5], [78, 24, 20, 0.2], [62, 40, 0, 0], [86, 12, 16, 0.7], [38, 20, 12, 0.3]]) {
    const p = P.prop(L, x, 12.2, z, 0);
    p.cyl(0, (HH - 12.2) / 2, 0, 0.012, HH - 12.2, 'metalDark', null, null, 4).frustum(0, -0.2, 0, 0.18, 0.55, 0.45, 'metalDark', 0x2a2c30, null, 14);
    p.glow(0, -0.44, 0, 0.7, 0.02, 0.7, it > 0 ? 0xfff0d0 : 0x1a1a18);
    if (it > 0) {
      const lt = L.light(x, 11.4, z, 0xffe8c8, it, 24, { flicker: fl });
      P.lightCone(L, x, 11.7, z, [0, -1, 0], 10, 4.5, 0xffe0b0, lt, 0.5);
    }
  }
  for (const [x, z] of [[X0 + 0.4, 8], [X1 - 0.4, 34], [X0 + 0.4, 30]]) L.light(x, 4.2, z, 0xff4030, 3, 7, { flicker: 0.1 });
  S.hallTrigger = [60, -0.5, 0, 100, 3, 30];
}

// ================================================================ LANDSIDE (outside the glass)
function landside(L, game) {
  const B = new VisualBatch(L);
  const r = makeRng(4455);
  // curb + canopy
  B.box(0, -0.4, 44.3, 150, 0.15, 50, 'sidewalk', { tint: 0x9a968e });
  B.box(0, -0.4, 50, 150, 0.0, 74, 'asphalt', { tint: 0x3a3a3c });
  for (let x = 2; x < 148; x += 5) B.box(x, 0.003, 55.9, x + 2.6, 0.012, 56.1, 'paintedWhite', { tint: 0xc8c8c0 });
  for (let x = 2; x < 148; x += 5) B.box(x, 0.003, 61.9, x + 2.6, 0.012, 62.1, 'paintedWhite', { tint: 0xc8c8c0 });
  B.box(0, 0, 62.4, 150, 0.2, 63.6, 'concrete', { tint: 0x8a867e });
  B.box(28, 8.2, 44.3, 140, 8.7, 53, 'concreteDark', { tint: 0x5a5a5e });
  B.box(28, 8.0, 44.3, 140, 8.2, 53, 'paintedWhite', { tint: 0xb8bcbe });
  for (let x = 32; x < 140; x += 12) { B.box(x - 0.25, 0, 52, x + 0.25, 8.2, 52.5, 'metalDark', { tint: 0x3a3e44 }); }
  for (let x = 34; x < 138; x += 6) B.box(x, 7.95, 47.6, x + 2.2, 8.0, 48.2, (Math.floor(x / 6) % 3) ? 'emissiveCool' : 'blackMatte');
  // departures sign on the canopy fascia
  sign(L, 'DEPARTURES  ·  TERMINAL C', 66, 8.45, 53.03, 0, 10, 0.5, { bg: '#16191e', fg: '#f2c230', clean: true, glow: 0.5, light: false });
  sign(L, 'DEPARTURES  ·  TERMINAL C', 66, 8.45, 44.3 + 0.02, 0, 10, 0.5, { bg: '#16191e', fg: '#f2c230', clean: true, glow: 0.3, light: false });
  // parking garage across the road (4 decks, sodium lights), skybridge lands on P2
  const gx0 = -20, gx1 = 150, gz0 = 76, gz1 = 118;
  for (let k = 0; k <= 4; k++) {
    const y = k * 3.6;
    B.box(gx0, y - 0.35, gz0, gx1, y, gz1, 'concrete', { tint: 0x7a766e });
    if (k > 0) B.box(gx0, y, gz0, gx1, y + 1.0, gz0 + 0.3, 'concreteDark', { tint: 0x6a6660 });
    if (k < 4) for (let x = gx0 + 6; x < gx1; x += 9) B.box(x, y + 2.9, gz0 + 0.6, x + 0.8, y + 3.0, gz0 + 1.0, r() < 0.55 ? 'emissiveWarm' : 'blackMatte', { tint: 0xffa040 });
    if (k < 4) for (let x = gx0 + 4; x < gx1; x += 3.2) if (r() < 0.35) B.box(x, y + 0.2, gz0 + 2, x + 1.8, y + 1.5, gz0 + 6.5, 'carPaint', { tint: [0x7a1a14, 0x1a2a4a, 0x8a8a88, 0x2a2a2a, 0xc8c4b8][Math.floor(r() * 5)] });
  }
  for (let x = gx0; x <= gx1; x += 9) B.box(x - 0.3, 0, gz0, x + 0.3, 14.4, gz0 + 0.6, 'concrete', { tint: 0x8a867e });
  sign(L, 'P2 · SHORT TERM PARKING', 11, 5.2, gz0 - 0.05, 0, 5, 0.6, { bg: '#1a3a7a', fg: '#ffffff', clean: true, glow: 0.4, light: false });
  // city beyond the garage
  for (let x = -180; x < 330; x += 42) for (let z = 150; z < 400; z += 44) {
    if (r() < 0.2) continue;
    const h = 12 + r() * (r() < 0.2 ? 60 : 26);
    cityBlock(B, x + r() * 6, z + r() * 6, x + 30 + r() * 6, z + 32 + r() * 6, h, { rng: r, faces: ['n'], lit: 0.07, fire: r() < 0.15 ? 0.05 : 0, roofFire: r() < 0.08 });
  }
  B.build(L);
  // vehicles on the curb and road (props: real silhouettes; far from the playable space)
  P.car(L, 58, 0.15, 47.2, Math.PI / 2 + 0.2, { burnt: true });
  P.taxi(L, 90, 0, 53.2, -Math.PI / 2 - 0.1);
  P.policeCar(L, 104, 0, 57.4, Math.PI / 2 + 0.4, { lights: true });
  P.bus(L, 34, 0, 58.4, -Math.PI / 2, { color: 0x2a5a8a });
  P.car(L, 120, 0, 53.4, -Math.PI / 2 + 0.3, { burnt: true });
  P.ambulance(L, 46, 0, 53.6, Math.PI / 2 - 0.15, { lights: false });
  P.car(L, 70, 0, 66.6, Math.PI / 2, { damaged: true });
  P.truck(L, 130, 0, 66.8, Math.PI / 2, 0x3a4a2a);
  for (const x of [40, 54, 68, 82, 96, 110]) { const p = P.prop(L, x, 0.15, 49.2, 0); p.cyl(0, 0.5, 0, 0.12, 1.0, 'paintedYellow', 0xc8a020, null, 10); }
  for (const x of [30, 84]) P.streetLight(L, x, 0, 63, 0, { intensity: 18, range: 18, flicker: x === 84 ? 0.4 : 0 });
  fireSource(L, 58, 0.4, 47.2, 1.3, { hazard: false, intensity: 16 });
  fireSource(L, 120, 0.3, 53.4, 1.4, { hazard: false, intensity: 14 });
  // police lights flashing outside (seen through the glass)
  const pl = [L.light(104, 1.8, 55.4, 0xff2010, 0, 12, { priority: 0.5 }), L.light(104, 1.8, 57.8, 0x2050ff, 0, 12, { priority: 0.5 })];
  L.dynamics.push({ t: 0, update(dt) { this.t += dt; const k = Math.floor(this.t * 4) % 2; pl[0].intensity = k ? 14 : 0; pl[1].intensity = k ? 0 : 14; } });
  // wreckage in the smashed bay behind the van (keeps it blocked)
  for (const [x, rz] of [[73.5, 0.4], [78.6, -0.3]]) { const p = P.prop(L, x, 0, Z1 + 0.25, 0); p.box(0, 1.6, 0, 0.1, 3.3, 0.2, 'metalDark', 0x3a3e44, [0, 0, rz]); }
  const cb = P.prop(L, 75.8, 0, Z1 + 0.7, 0.1);
  cb.box(0, 0.35, 0, 5.4, 0.3, 0.6, 'metalDark', 0x3a3e44, [0.1, 0, 0.12]).box(-1.2, 0.2, 0.4, 0.14, 0.4, 0.14, 'paintedYellow', 0xc8a020, [1.2, 0, 0]);
  for (let i = 0; i < 20; i++) L.decal(71 + rng() * 10, 0.012, 38 + rng() * 6, 0, 1, 0, 0.3 + rng() * 0.4, DF.HOLE_GLASS);
  void B;
}
