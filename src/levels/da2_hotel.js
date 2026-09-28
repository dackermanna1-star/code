// Dead Air 2 — Harborview Hotel: kitchen safe room (start), kitchen, walk-in
// cooler, chef's office, service hall, linen room, loading dock, the alley
// behind the hotel, the north fire escape, the 3rd floor (rooms, ice machine,
// elevator lobby, a collapsed corridor section with a detour through rooms 310
// and 312) and the roof (stair bulkhead, neon HARBORVIEW letters, water tower,
// elevator machine room). The crane loading bay lives in da2_craneEvent.js.
import * as THREE from 'three';
import { room, ceilingLight, wallLamp, sign, graffiti, poster, posterWall, wallMessages, safeRoom, supplies, fireSource, burningBarrel, physProp, alarmCar, hittable, P, floorWithHoles, railSegment } from './kit.js';
import { Door } from '../world/dynamic.js';
import { F_SOLID, F_SHOOT, F_SIGHT, F_DEFAULT } from '../world/collision.js';
import { DF } from '../render/decals.js';
import { grill, hood, prepTable, meatHook, forklift, wrappedPallet, rollDoor } from './ch3_props.js';
import { lockers, sparker, shelving, soundEmitter, crt } from './ch2_parts.js';
import { rng, hotelBed, nightstand, luggage, housekeepingCart, iceMachine, roomServiceCart, range, potRack, canShelf, dishMachine, kitchenSink, cardboard, exhaustFan, neonLetters, rotXZ } from './da2_parts.js';
import { GY, HG, HC, H3, HR, HOTEL } from './da2_layout.js';

const NC = { collide: false };
const X1 = HOTEL.x1, Z1 = HOTEL.z1;
const PAR = HR + 1.1; // parapet top

// ------------------------------------------------------------ helpers --
// Decorative closed door on a wall face (no Door object: the room behind is not built).
function fakeDoor(L, x, y, z, axis, nSign, label, o = {}) {
  const w = o.w ?? 1.0, h = 2.12, t = 0.05;
  const col = o.color ?? 0x5a3a26;
  if (axis === 'x') {
    const f = z + nSign * 0.1;
    L.box(x - w / 2 - 0.08, y, f - 0.02, x + w / 2 + 0.08, y + h + 0.08, f + nSign * 0.03, 'woodDark', { collide: false, tint: 0x3a2618 });
    L.box(x - w / 2, y, f + nSign * 0.03, x + w / 2, y + h, f + nSign * (0.03 + t), 'woodDark', { collide: false, tint: col });
    L.box(x + w / 2 - 0.16, y + 0.98, f + nSign * (0.08), x + w / 2 - 0.08, y + 1.02, f + nSign * 0.12, 'chrome', NC);
    L.box(x + w / 2 - 0.2, y + 1.08, f + nSign * 0.08, x + w / 2 - 0.1, y + 1.18, f + nSign * 0.1, 'emissiveRed', NC);
    if (label) sign(L, label, x, y + 1.62, f + nSign * 0.095, 0, 0.24, 0.12, { bg: '#c8a860', fg: '#2a1a0a' });
    if (o.dnd) sign(L, 'DO NOT\nDISTURB', x + w / 2 - 0.14, y + 0.82, f + nSign * 0.1, 0, 0.12, 0.26, { bg: '#b81a1a', fg: '#fff' });
  } else {
    const f = x + nSign * 0.1;
    L.box(f - 0.02, y, z - w / 2 - 0.08, f + nSign * 0.03, y + h + 0.08, z + w / 2 + 0.08, 'woodDark', { collide: false, tint: 0x3a2618 });
    L.box(f + nSign * 0.03, y, z - w / 2, f + nSign * (0.03 + t), y + h, z + w / 2, 'woodDark', { collide: false, tint: col });
    L.box(f + nSign * 0.08, y + 0.98, z + w / 2 - 0.16, f + nSign * 0.12, y + 1.02, z + w / 2 - 0.08, 'chrome', NC);
    if (label) sign(L, label, f + nSign * 0.095, y + 1.62, z, Math.PI / 2, 0.24, 0.12, { bg: '#c8a860', fg: '#2a1a0a' });
  }
}
// Exterior glazing: glass pane in an opening of an exterior wall along X/Z (static, bullets pass).
function glazeX(L, a, b, z, y0, y1, o = {}) {
  L.box(a, y0, z - 0.03, b, y1, z + 0.03, 'glassDirty', { flags: F_SOLID | F_SHOOT, tint: o.tint ?? 0x7a8a90 });
  L.box((a + b) / 2 - 0.03, y0, z - 0.05, (a + b) / 2 + 0.03, y1, z + 0.05, 'metalDark', NC);
}
// Visual window on a facade face (no opening): glass + sill + lintel.
function facadeWinX(L, x, y, z, s, lit = false, w = 1.3, h = 1.5) {
  const f = z + s * 0.2;
  L.box(x - w / 2, y, f, x + w / 2, y + h, f + s * 0.03, lit ? 'emissiveWindow' : 'glassDirty', { collide: false, tint: lit ? 0xffc890 : 0x1c2226 });
  L.box(x - w / 2 - 0.1, y - 0.12, f, x + w / 2 + 0.1, y, f + s * 0.14, 'concrete', { collide: false, tint: 0x9a948a });
  L.box(x - w / 2 - 0.06, y + h, f, x + w / 2 + 0.06, y + h + 0.18, f + s * 0.05, 'concrete', { collide: false, tint: 0x8a847a });
  L.box(x - 0.025, y, f, x + 0.025, y + h, f + s * 0.05, 'metalDark', NC);
}
function facadeWinZ(L, x, y, z, s, lit = false, w = 1.3, h = 1.5) {
  const f = x + s * 0.2;
  L.box(f, y, z - w / 2, f + s * 0.03, y + h, z + w / 2, lit ? 'emissiveWindow' : 'glassDirty', { collide: false, tint: lit ? 0xffc890 : 0x1c2226 });
  L.box(f, y - 0.12, z - w / 2 - 0.1, f + s * 0.14, y, z + w / 2 + 0.1, 'concrete', { collide: false, tint: 0x9a948a });
  L.box(f, y + h, z - w / 2 - 0.06, f + s * 0.05, y + h + 0.18, z + w / 2 + 0.06, 'concrete', { collide: false, tint: 0x8a847a });
}
function sconce(L, x, y, z, nx, nz, on = true, flicker = 0) {
  L.box(x - 0.09 + nx * 0.06, y - 0.12, z - 0.09 + nz * 0.06, x + 0.09 + nx * 0.06, y + 0.1, z + 0.09 + nz * 0.06, on ? 'emissiveWarm' : 'fabric', { collide: false, tint: on ? 0xffc880 : 0x6a5a48 });
  L.box(x - 0.04, y - 0.2, z - 0.04, x + 0.04, y - 0.12, z + 0.04, 'chrome', NC);
  if (on) return L.light(x + nx * 0.5, y, z + nz * 0.5, 0xffc27a, 5, 6.5, { flicker });
  return null;
}
const blood = (L, x, y, z, s = 1.2, k = 0) => L.decal(x, y + 0.012, z, 0, 1, 0, s, [DF.BLOOD1, DF.BLOOD2, DF.BLOOD3, DF.BLOOD4, DF.POOL, DF.SMEAR, DF.SPLAT_BIG][k % 7]);
function trail(L, x0, z0, x1, z1, y, n = 6) {
  for (let i = 0; i <= n; i++) { const t = i / n; L.decal(x0 + (x1 - x0) * t + (rng() - 0.5) * 0.3, y + 0.013, z0 + (z1 - z0) * t + (rng() - 0.5) * 0.3, 0, 1, 0, 0.7 + rng() * 0.4, DF.SMEAR); }
}

// ====================================================================== SHELL
function shell(L) {
  const bm = 'brickTan', bt = 0x9a7a5c;
  // north facade (alley): dock doors, fire-escape window (3F room 301), roof ladder gap
  const n3 = [[4.2, false], [8.8, false], [14.8, false], [20.8, false], [29, false], [36, false], [41.1, true], [47.2, 'fe']];
  const nOps = [{ a: 8, b: 11.5, y0: HG, y1: HG + 3.2 }, { a: 46.4, b: 48.0, y0: H3 + 0.35, y1: H3 + 2.3 }, { a: 41.1 - 0.7, b: 41.1 + 0.7, y0: H3 + 0.9, y1: H3 + 2.3 }, { a: 48.2, b: 49.4, y0: HR, y1: PAR + 0.01 }];
  L.wallX(-0.2, X1 + 0.2, 0, GY, PAR, bm, 0.4, nOps, { tint: bt });
  // south facade (light well): 3F room windows, the loading-bay gap
  const sRooms = [11.4, 17.4, 23.4, 29.4, 41.4];
  const sOps = sRooms.map((x) => ({ a: x - 0.7, b: x + 0.7, y0: H3 + 0.9, y1: H3 + 2.3 })).concat([{ a: 34.4, b: 37.6, y0: HR, y1: PAR + 0.01 }]);
  L.wallX(-0.2, X1 + 0.2, Z1, GY, PAR, bm, 0.4, sOps, { tint: bt });
  // west (Harbor St) + east facades
  L.wallZ(0.2, Z1 - 0.2, 0, GY, PAR, bm, 0.4, [{ a: 9.4 - 0.7, b: 9.4 + 0.7, y0: H3 + 0.9, y1: H3 + 2.3 }], { tint: bt });
  L.wallZ(0.2, Z1 - 0.2, X1, GY, PAR, bm, 0.4, [], { tint: bt });
  // glazing in the real openings
  glazeX(L, 41.1 - 0.7, 41.1 + 0.7, 0, H3 + 0.9, H3 + 2.3);
  for (const x of sRooms) glazeX(L, x - 0.7, x + 0.7, Z1, H3 + 0.9, H3 + 2.3);
  L.box(-0.03, H3 + 0.9, 8.7, 0.03, H3 + 2.3, 10.1, 'glassDirty', { flags: F_SOLID | F_SHOOT, tint: 0x7a8a90 });
  // coping + string courses + cornice
  for (const [x0, z0, x1, z1] of [[-0.3, -0.3, X1 + 0.3, 0.3], [-0.3, Z1 - 0.3, X1 + 0.3, Z1 + 0.3], [-0.3, 0.3, 0.3, Z1 - 0.3], [X1 - 0.3, 0.3, X1 + 0.3, Z1 - 0.3]]) {
    L.box(x0, PAR, z0, x1, PAR + 0.08, z1, 'concrete', { collide: false, tint: 0x8a867e });
  }
  for (const y of [HC + 0.05, H3 - 0.2]) {
    L.box(-0.3, y, -0.3, X1 + 0.3, y + 0.22, -0.2, 'concrete', { collide: false, tint: 0x9a948a });
    L.box(-0.3, y, Z1 + 0.2, X1 + 0.3, y + 0.22, Z1 + 0.3, 'concrete', { collide: false, tint: 0x9a948a });
    L.box(-0.3, y, -0.2, -0.2, y + 0.22, Z1 + 0.2, 'concrete', { collide: false, tint: 0x9a948a });
    L.box(X1 + 0.2, y, -0.2, X1 + 0.3, y + 0.22, Z1 + 0.2, 'concrete', { collide: false, tint: 0x9a948a });
  }
  L.box(-0.45, HR - 0.5, -0.45, X1 + 0.45, HR - 0.2, -0.2, 'concrete', { collide: false, tint: 0x8a847a });
  L.box(-0.45, HR - 0.5, Z1 + 0.2, X1 + 0.45, HR - 0.2, Z1 + 0.45, 'concrete', { collide: false, tint: 0x8a847a });
  L.box(-0.45, HR - 0.5, -0.2, -0.2, HR - 0.2, Z1 + 0.2, 'concrete', { collide: false, tint: 0x8a847a });
  L.box(X1 + 0.2, HR - 0.5, -0.2, X1 + 0.45, HR - 0.2, Z1 + 0.2, 'concrete', { collide: false, tint: 0x8a847a });
  // facade windows (2F everywhere, 3F where rooms are closed)
  for (let x = 3; x < X1 - 1; x += 3.6) {
    facadeWinX(L, x, HC + 1.0, 0, -1, rng() < 0.08);
    facadeWinX(L, x, HC + 1.0, Z1, 1, rng() < 0.06);
  }
  for (const [x, v] of n3) if (!v) facadeWinX(L, x, H3 + 0.9, 0, -1, rng() < 0.1, 1.4, 1.4);
  for (const x of [5.2, 35.4, 47.8]) facadeWinX(L, x, H3 + 0.9, Z1, 1, false, 1.4, 1.4);
  for (let z = 2.6; z < Z1 - 1; z += 3.4) {
    facadeWinZ(L, 0, HC + 1.0, z, -1, rng() < 0.1);
    facadeWinZ(L, X1, HC + 1.0, z, 1, rng() < 0.1);
    facadeWinZ(L, X1, H3 + 0.9, z, 1, rng() < 0.08);
    if (Math.abs(z - 9.4) > 1.4) facadeWinZ(L, 0, H3 + 0.9, z, -1, rng() < 0.08);
    facadeWinZ(L, 0, GY + 1.6, z, -1, z > 10 && z < 16, 2.2, 2.2);
  }
  // ground-floor plinth + floors (solid mass between the ground-floor ceiling and 3F)
  L.box(0.2, GY, 0.2, X1 - 0.2, HG, Z1 - 0.2, 'concreteFloor');
  L.box(0.2, HC, 0.2, X1 - 0.2, H3, Z1 - 0.2, 'ceiling');
  // Harbor St entrance canopy (west) + blade sign, seen from the roofs
  L.box(-3.2, HC - 0.4, 10.2, -0.2, HC - 0.1, 15.8, 'metalDark', { collide: false });
  for (const z of [10.4, 15.6]) L.box(-3.1, GY, z - 0.06, -2.98, HC - 0.4, z + 0.06, 'chrome', NC);
  sign(L, 'HARBORVIEW HOTEL', -3.22, HC - 0.25, 13, Math.PI / 2, 5.2, 0.35, { bg: '#1a1410', fg: '#e8c070', glow: 1.2, lightColor: 0xffb060, lightIntensity: 5 });
}

// ============================================================ GROUND FLOOR
function kitchenSafeRoom(L, game) {
  const y = HG;
  safeRoom(L, {
    x0: 43, z0: 11.8, x1: X1 - 0.2, z1: Z1 - 0.2, y, h: HC - HG, doorWall: 'w', doorAt: 15.8, hinge: -1, wall: 'tileWhite', floor: false, ceil: false,
    graffiti: ['CHECKOUT\nTIME:\nNEVER', 'CRANE ON\nTHE SITE\nNEXT DOOR\nSTILL RUNS', 'AIRPORT\nEVAC IS\nREAL', 'THE CHEF\nWAS FIRST', 'ROOF →\nCRANE →\nAIRPORT'],
  });
  L.box(43, y - 0.01, 11.8, X1 - 0.2, y + 0.005, Z1 - 0.2, 'tileFloor', { collide: false, tint: 0x9a7a62 });
  // stores: canned goods along the east wall, flour sacks, chest freezer
  canShelf(L, X1 - 0.55, y, 13.4, Math.PI / 2, 2.0, 0.85);
  canShelf(L, X1 - 0.55, y, 16.6, Math.PI / 2, 2.0, 0.6);
  const fz = P.prop(L, 50.4, y, 19.1, Math.PI);
  fz.box(0, 0.45, 0, 1.6, 0.9, 0.75, 'paintedWhite', 0xd8d8d0).box(0, 0.92, 0, 1.62, 0.05, 0.77, 'plasticGloss', 0xe8e8e0).col(0, 0.45, 0, 1.6, 0.9, 0.75, 'metal');
  for (let i = 0; i < 5; i++) { const p = P.prop(L, 44.2 + (i % 3) * 0.55, y + (i > 2 ? 0.28 : 0), 12.5, rng() * 0.4); p.box(0, 0.14, 0, 0.5, 0.28, 0.8, 'fabric', 0xe0d8c0); }
  L.box(43.9, y, 12.1, 45.7, y + 0.56, 12.9, 'fabric', { visible: false, flags: F_SOLID | F_SHOOT });
  // supply tables (the survivors made it here last night)
  supplies(L, 47.2, y, Z1 - 0.75, Math.PI, ['smg', 'pumpShotgun', 'silencedSmg', 'chromeShotgun'], { w: 2.6, mat: 'metalClean' });
  supplies(L, 47.8, y, 12.35, 0, ['medkit', 'medkit', 'medkit', 'medkit'], { w: 2.2, mat: 'metalClean' });
  L.item('ammo', 50.8, y + 0.02, 12.6);
  L.item('pills', 44.1, y + 0.02, 19.1, { chance: 0.6 });
  L.item('throwable', 50.9, y + 0.93, 18.95, { chance: 0.5 });
  P.bed(L, 45.4, y, 17.5, Math.PI / 2, 0x5a6a4a);
  physProp(L, 'bucket', 44.1, y, 14.2);
  crt(L, 44.1, y + 0.02, 18.0, Math.PI / 2 + 0.3, 0.9, true);
  L.light(44.8, y + 0.5, 18.0, 0x7aa0ff, 1.8, 3.5, { flicker: 0.5 });
  sign(L, 'DRY STORES\nTEMP 18°C', 43.12, y + 2.4, 13.2, Math.PI / 2, 0.8, 0.4, { bg: '#e8e8e0', fg: '#1a2a4a' });
  L.decal(46, y + 0.012, 15.2, 0, 1, 0, 1.0, DF.BLOOD2);
  wallMessages(L, 49.6, y + 1.7, 11.92, 0, 2.6, 1.3, { lines: ['WE MADE IT', 'HOTEL KITCHEN = SAFE', 'DAY 6 — NO RESCUE', 'GAS ON THE RANGE: OFF!!', 'ROOF → CRANE?'], density: 0.8 });
  for (const [x, z, yaw] of [[46.2, 14.4, 1.57], [48.4, 14.8, 1.57], [46.4, 16.9, 1.57], [48.6, 17.2, 1.57]]) L.survivorStart.push({ x, y, z, yaw });
  L.flowStart = [47, y, 15.8];
}

function kitchen(L, game) {
  const y = HG, H = HC - HG;
  // linings / partition walls
  L.box(18.1, y, 0.2, 42.9, HC, 0.35, 'tileWhite');
  L.box(18.1, y, Z1 - 0.35, 42.9, HC, Z1 - 0.2, 'tileWhite');
  L.wallZ(0.2, 11.7, 43, y, HC, 'tileWhite', 0.2, [{ a: 4.7, b: 5.8, y0: y, y1: y + 2.2 }, { a: 8.1, b: 9.3, y0: y, y1: y + 2.2 }]);
  L.box(18.1, y - 0.01, 0.35, 42.9, y + 0.005, Z1 - 0.35, 'tileFloor', { collide: false, tint: 0x8a5a44 });
  for (const x of [18.4, 42.6]) L.box(x - 0.3, y, 0.35, x + 0.3, y + 0.1, Z1 - 0.35, 'metalDark', { collide: false });
  L.box(18.1, y + 1.3, 0.36, 42.9, y + 1.36, 0.37, 'tileGreen', NC);
  L.box(18.1, y + 1.3, Z1 - 0.37, 42.9, y + 1.36, Z1 - 0.36, 'tileGreen', NC);
  // high frosted windows (north)
  for (const x of [26, 32, 38]) L.box(x - 0.9, y + 2.6, 0.36, x + 0.9, y + 3.3, 0.38, 'glassDirty', { collide: false, tint: 0x5a6a70 });
  // --- cooking island: ranges back to back under a big hood
  const rx = [25.0, 26.8, 28.6, 30.4, 32.2, 34.0];
  rx.forEach((x, i) => {
    if (i === 2) { P.fryer(L, x - 0.6, y, 9.4, 0); P.fryer(L, x, y, 9.4, 0); P.fryer(L, x + 0.6, y, 9.4, 0); }
    else if (i === 4) grill(L, x, y, 9.4, 0, 1.8, 'grill');
    else P.kitchenRange(L, x, y, 9.4, 0, 1.8);
    if (i === 1) grill(L, x, y, 11.1, Math.PI, 1.8, 'flat');
    else P.kitchenRange(L, x, y, 11.1, Math.PI, 1.8);
  });
  L.box(24.1, y, 9.83, 34.9, y + 1.4, 10.67, 'metalClean', { tint: 0xa8acac });
  L.box(24.1, y + 1.4, 10.2, 34.9, y + 2.0, 10.3, 'metalClean', { tint: 0xb8bcbc, collide: false });
  L.box(23.8, HC - 1.5, 8.5, 35.2, HC - 0.9, 12.0, 'metalClean', { collide: false, tint: 0xa0a4a4 });
  L.box(23.9, HC - 1.52, 8.6, 35.1, HC - 1.5, 11.9, 'metalDark', NC);
  L.box(28.8, HC - 0.9, 9.6, 30.2, HC, 10.9, 'metalClean', { collide: false, tint: 0x9a9e9e });
  for (const x of [25.5, 29.5, 33.5]) { L.box(x - 0.35, HC - 1.53, 10.0, x + 0.35, HC - 1.51, 10.8, 'emissiveWarm', { collide: false, tint: 0xffd8a0 }); }
  L.light(29.5, HC - 1.7, 10.2, 0xffd8a8, 7, 8, { flicker: 0.1 });
  // a burner left on (it has been burning for days)
  fireSource(L, 30.8, y + 0.95, 11.2, 0.32, { hazard: false, intensity: 7 });
  // pans on the ranges / floor
  for (const [x, z, r] of [[25.3, 9.3, 0.18], [27.1, 11.2, 0.22], [33.8, 9.2, 0.16], [22.4, 12.3, 0.2], [36.8, 13.2, 0.18]]) {
    const p = P.prop(L, x, y + (z === 12.3 || z === 13.2 ? 0 : 0.92), z, rng() * 6);
    p.cyl(0, 0.05, 0, r, 0.1, 'metalDark', 0x3a3a3a, null, 12).box(r + 0.15, 0.08, 0, 0.3, 0.03, 0.04, 'metalDark');
  }
  // --- prep line (south aisle) + pass shelf with heat lamps (north aisle)
  for (const x of [21.5, 25.0, 31.0, 34.5]) P.steelTable(L, x, y, 14.6, 0, 2.2, 0.8);
  potRack(L, 23.2, HC - 0.8, 14.6, 3.2);
  potRack(L, 32.8, HC - 0.8, 14.6, 3.2);
  P.steelTable(L, 38.6, y, 6.4, 0, 2.2, 0.8);
  const pass = P.prop(L, 30, y, 5.9, 0);
  pass.box(0, 0.9, 0, 6.0, 0.06, 0.7, 'metalClean', 0xc0c4c0).box(0, 1.55, 0, 6.0, 0.04, 0.5, 'metalClean', 0xb0b4b0).box(0, 1.95, 0, 6.0, 0.1, 0.3, 'metalClean', 0xa0a4a4);
  for (const sx of [-2.9, 0, 2.9]) pass.box(sx, 0.45, 0, 0.06, 0.9, 0.06, 'metalClean').box(sx, 1.45, 0, 0.05, 1.0, 0.05, 'metalClean');
  for (let i = 0; i < 5; i++) pass.box(-2.4 + i * 1.2, 1.88, 0, 0.5, 0.05, 0.2, 'emissiveWarm', 0xff6a3a);
  pass.col(0, 0.9, 0, 6.0, 0.08, 0.7, 'metal').col(0, 0.45, 0, 6.0, 0.9, 0.12, 'metal', F_SOLID | F_SHOOT);
  sign(L, 'ORDER UP', 30, y + 2.25, 5.9, 0, 1.2, 0.25, { bg: '#b8201a', fg: '#fff' });
  // ticket rail with old room-service orders
  sign(L, 'RM 304 · CLUB SAND.   RM 216 · 2x STEAK MR   RM 301 · COFFEE, PILLS??', 30, y + 1.72, 5.64, 0, 5.2, 0.14, { bg: '#f0ecd8', fg: '#1a1a1a' });
  // --- dish pit (NW)
  L.box(23.4, y, 0.35, 23.6, y + 1.8, 4.6, 'tileWhite');
  dishMachine(L, 19.2, y, 0.9, Math.PI);
  kitchenSink(L, 21.6, y, 0.8, Math.PI, 2.2);
  for (let i = 0; i < 4; i++) { const p = P.prop(L, 19.4 + (i % 2) * 0.6, y, 3.0 + Math.floor(i / 2) * 0.7, 0); p.box(0, 0.08 + i * 0.1, 0, 0.5, 0.1, 0.5, 'plastic', 0x3a5a8a); for (let k = 0; k < 6; k++) p.cyl(-0.18 + k * 0.07, 0.24 + i * 0.1, 0, 0.12, 0.01, 'plasticGloss', 0xf0f0ea, [0, 0, Math.PI / 2], 10); }
  L.box(18.8, y, 2.7, 20.6, y + 0.5, 4.2, 'plastic', { visible: false, flags: F_SOLID | F_SHOOT });
  // --- north wall: steam kettles + shelving with pans
  for (const x of [25.0, 27.0]) { const p = P.prop(L, x, y, 1.0, 0); p.cyl(0, 0.9, 0, 0.55, 0.9, 'metalClean', 0xb8bcbc, null, 16).cyl(0, 0.35, 0, 0.12, 0.7, 'metalClean').col(0, 0.7, 0, 1.1, 1.4, 1.1, 'metal'); }
  P.kitchenShelf(L, 30.3, y, 0.65, Math.PI, 1.8);
  P.kitchenShelf(L, 32.4, y, 0.65, Math.PI, 1.8);
  kitchenSink(L, 36.4, y, 0.8, Math.PI, 1.8);
  P.fridge(L, 38.6, y, 0.75, Math.PI); P.fridge(L, 39.4, y, 0.75, Math.PI);
  // --- south wall: speed racks, banquet cabinets, room service station
  for (const x of [26, 27, 36.5]) { const p = P.prop(L, x, y, Z1 - 0.7, 0); for (const sx of [-0.25, 0.25]) for (const sz of [-0.3, 0.3]) p.box(sx, 0.9, sz, 0.03, 1.8, 0.03, 'metalClean'); for (let k = 0; k < 10; k++) p.box(0, 0.2 + k * 0.17, 0, 0.5, 0.02, 0.62, 'metalClean', 0xa8acac); p.col(0, 0.9, 0, 0.55, 1.8, 0.65, 'metal', F_SOLID | F_SHOOT); }
  for (const x of [29.5, 31, 32.5]) { const p = P.prop(L, x, y, Z1 - 0.75, 0); p.box(0, 0.95, 0, 0.75, 1.8, 0.7, 'metalClean', 0xa8aca8).box(0, 1.2, -0.36, 0.55, 0.8, 0.01, 'glassDirty', 0x20282a).col(0, 0.95, 0, 0.75, 1.9, 0.7, 'metal'); }
  roomServiceCart(L, 19.4, y, 17.6, 0.3); roomServiceCart(L, 20.8, y, 18.7, -0.2); roomServiceCart(L, 22.3, y, 17.9, 1.2);
  sign(L, 'ROOM SERVICE', 20.2, y + 2.6, Z1 - 0.37, 0, 1.8, 0.35, { bg: '#1a2a3a', fg: '#e8d8a0' });
  // --- east: butcher table, slicer, the way we came in
  P.steelTable(L, 38.2, y, 11.8, Math.PI / 2, 2.0, 0.8);
  const sl = P.prop(L, 38.2, y + 0.93, 11.4, 0.4); sl.cyl(0, 0.2, 0, 0.18, 0.04, 'chrome', null, [Math.PI / 2, 0, 0], 16).box(0, 0.08, 0.1, 0.3, 0.16, 0.3, 'metalClean');
  // lights
  ceilingLight(L, 22, HC, 5.5, { type: 'fluoro', intensity: 10, flicker: 0.5 });
  ceilingLight(L, 36, HC, 5.5, { type: 'fluoro', intensity: 11, flicker: 0.1 });
  ceilingLight(L, 23, HC, 15.8, { type: 'fluoro', on: false });
  ceilingLight(L, 30, HC, 16.5, { type: 'fluoro', intensity: 10, flicker: 0.7 });
  ceilingLight(L, 39.5, HC, 15.5, { type: 'fluoro', intensity: 10, flicker: 0.2 });
  L.box(42.9, y + 2.35, 16.9, 42.92, y + 2.55, 17.5, 'emissiveGreen', NC);
  // posters / notices / the banquet that never happened
  sign(L, 'EMPLOYEES MUST\nWASH HANDS', 18.12, y + 1.8, 12.8, Math.PI / 2, 0.8, 0.45, { bg: '#e8e8e0', fg: '#1a3a6a' });
  sign(L, 'BANQUET · BALLROOM B · SAT\nNEWBURG AIRPORT AUTHORITY GALA\n400 COVERS — ALL HANDS', 34, y + 2.45, 0.37, 0, 2.6, 0.7, { bg: '#f0ecd8', fg: '#2a1a0a' });
  sign(L, 'FIRST IN\nFIRST OUT', 38.6, y + 2.2, 0.37, 0, 0.8, 0.4, { bg: '#c8e0c8', fg: '#1a3a1a' });
  graffiti(L, 'KEEP\nMOVING\nWEST', 18.13, y + 1.55, 5.2, Math.PI / 2, 1.5, 0.9, '#b8201a');
  // the kitchen staff
  P.corpse(L, 33.2, y + 0.01, 13.1, 0.8, 0xe8e8e0); blood(L, 33.2, y, 13.1, 1.8, 4);
  P.corpse(L, 21.3, y + 0.01, 3.4, 2.4, 0xd8d8d0); blood(L, 21.3, y, 3.4, 1.4, 6);
  trail(L, 41.8, 15.2, 36.5, 12.6, y, 6);
  trail(L, 23.6, 12.6, 19.2, 9.6, y, 5);
  for (let i = 0; i < 8; i++) blood(L, 19 + rng() * 23, y, 1 + rng() * 18, 0.6 + rng() * 0.6, i);
  P.debris(L, 27.2, y, 13.2, 0.8, 'plasticGloss', 10);
  // items
  L.item('molotov', 28.6, y + 0.93, 9.35, { chance: 0.5 });
  L.item('pills', 33.2, y + 1.36, 0.6, { chance: 0.5 });
  L.item('health', 38.2, y + 0.95, 12.3, { chance: 0.35 });
  physProp(L, 'propane', 24.3, y, 18.9);
  L.reverb(18, y, 0.2, 43, HC, Z1 - 0.2, 'room');
  L.ambience(18, y, 0.2, 43, HC, Z1 - 0.2, 'apartments');
  // doors: kitchen -> service hall
  new Door(L, 18, y, 9.2, 'z', { width: 1.2, hinge: -1, material: 'metalClean', open: true });
}

function coolerAndOffice(L, game) {
  const y = HG;
  // walk-in cooler (x 43..51.8, z 0.2..6): stainless walls, cold light, trapped cooks
  room(L, { x0: 43, z0: 0.2, x1: X1 - 0.2, z1: 6, y, h: HC - HG, floor: false, ceil: false, wall: 'metalClean', trim: false, walls: { n: {}, s: {}, w: false, e: {} }, light: false });
  L.box(43.1, y - 0.01, 0.3, X1 - 0.3, y + 0.005, 5.9, 'diamond', { collide: false, tint: 0x9a9e9e });
  ceilingLight(L, 47.4, HC, 3.1, { type: 'fluoro', intensity: 6, flicker: 0.35, color: 0xb8d8ff });
  for (const x of [45.2, 46.6, 48, 49.4]) meatHook(L, x, HC - 0.3, 2.2);
  for (const x of [45.6, 48.0, 50.4]) canShelf(L, x, y, 5.5, Math.PI, 2.0, 0.7);
  shelving(L, 51.3, y, 2.4, Math.PI / 2, 2.2, 2.0, 0.8);
  L.box(43.4, y + 2.0, 0.4, 51.4, y + 2.03, 0.45, 'metalClean', NC);
  P.corpse(L, 46.5, y + 0.01, 3.6, 1.2, 0xe8e8e0); blood(L, 46.5, y, 3.6, 2, 4);
  L.item('health', 50.2, y + 0.02, 1.0, { chance: 0.6 });
  L.item('pills', 44.3, y + 1.03, 5.5, { chance: 0.4 });
  sign(L, 'WALK-IN\n2°C  KEEP CLOSED', 42.88, y + 2.3, 3, Math.PI / 2, 0.9, 0.4, { bg: '#e8e8e0', fg: '#1a3a6a' });
  const cooler = new Door(L, 43, y, 5.25, 'z', { width: 1.1, hinge: -1, material: 'metalClean' });
  L.reverb(43, y, 0.2, X1, HC, 6, 'room');
  // chef's office (x 43..51.8, z 6..11.8)
  room(L, { x0: 43, z0: 6, x1: X1 - 0.2, z1: 11.8, y, h: HC - HG, floor: false, ceil: false, wall: 'plasterDirty', walls: { n: false, s: false, w: false, e: {} }, light: { type: 'fluoro', intensity: 7, flicker: 0.6 } });
  L.box(43.1, y - 0.01, 6.1, X1 - 0.3, y + 0.005, 11.7, 'linoleum', { collide: false, tint: 0x8a8070 });
  new Door(L, 43, y, 8.7, 'z', { width: 1.2, hinge: -1, material: 'woodDark', open: true });
  P.desk(L, 49.6, y, 7.0, Math.PI, true);
  P.officeChair(L, 49.4, y, 7.9, 0.4);
  P.filingCabinet(L, 51.3, y, 9.4, Math.PI / 2);
  P.filingCabinet(L, 51.3, y, 10.0, Math.PI / 2);
  const cork = P.prop(L, 47, y + 1.6, 6.12, Math.PI); cork.box(0, 0, 0, 1.6, 0.9, 0.03, 'woodPale', 0xa87a4a);
  for (let i = 0; i < 7; i++) cork.box(-0.6 + rng() * 1.2, (rng() - 0.5) * 0.6, -0.02, 0.21, 0.28, 0.005, 'paper', 0xf0ecd8, [0, 0, (rng() - 0.5) * 0.3]);
  sign(L, 'STAFF SCHEDULE — CANCELLED\nTILL FURTHER NOTICE\n— MGMT', 45.3, y + 1.55, 6.12, 0, 1.1, 0.5, { bg: '#f0ecd8', fg: '#8a1a14' });
  const coat = P.prop(L, 44, y, 11.3, 0); coat.cyl(0, 0.9, 0, 0.03, 1.8, 'metalDark').box(0, 1.5, 0, 0.5, 0.8, 0.3, 'fabric', 0xf0f0e8).col(0, 0.9, 0, 0.3, 1.8, 0.3, 'metal', F_SOLID | F_SHOOT);
  L.item('melee', 49.2, y + 0.8, 6.9, { chance: 0.75 });
  L.item('pipebomb', 51.1, y + 1.34, 9.7, { chance: 0.35 });
  L.reverb(43, y, 6, X1, HC, 11.8, 'room');
  return { cooler };
}

function serviceAndDock(L, game) {
  const y = HG;
  // --- service hall (x 14..18)
  room(L, { x0: 14, z0: 0.2, x1: 18, z1: Z1 - 0.2, y, h: HC - HG, floor: false, ceil: false, wall: 'plasterBlue', trimMat: 'metalDark',
    walls: { n: {}, s: {}, w: { open: [{ at: 6.1, w: 1.3 }, { at: 12.8, w: 1.1 }] }, e: { open: [{ at: 9.2, w: 1.3 }] } }, light: false });
  L.box(14.1, y - 0.01, 0.3, 17.9, y + 0.005, Z1 - 0.3, 'linoleum', { collide: false, tint: 0x7a8088 });
  ceilingLight(L, 16, HC, 4.5, { type: 'fluoro', intensity: 8, flicker: 0.4 });
  ceilingLight(L, 16, HC, 14, { type: 'fluoro', intensity: 7, flicker: 0.8 });
  lockers(L, 17.62, y, 3.2, Math.PI / 2, 8, 0x4a5a6a, 2);
  lockers(L, 17.62, y, 13.8, Math.PI / 2, 8, 0x4a5a6a, 5);
  const tc = P.prop(L, 17.85, y + 1.4, 11.0, Math.PI / 2); tc.box(0, 0, 0, 0.3, 0.4, 0.15, 'plastic', 0x8a8a84).box(0, 0.05, -0.08, 0.2, 0.1, 0.01, 'emissiveGreen', 0x335533);
  const rack = P.prop(L, 17.88, y + 1.4, 11.7, Math.PI / 2); rack.box(0, 0, 0, 0.6, 0.6, 0.04, 'metalDark'); for (let i = 0; i < 10; i++) rack.box(-0.24 + (i % 5) * 0.12, -0.15 + Math.floor(i / 5) * 0.3, -0.03, 0.08, 0.18, 0.005, 'paper', 0xe0dcc8);
  sign(L, 'STAFF ONLY\nNO GUESTS BEYOND THIS POINT', 14.12, y + 2.5, 9.2, Math.PI / 2, 1.4, 0.4, { bg: '#1a2a3a', fg: '#e8e8e0' });
  sign(L, 'LOADING DOCK →', 14.12, y + 2.2, 7.6, Math.PI / 2, 1.2, 0.25, { bg: '#e8c020', fg: '#101010' });
  sign(L, 'EMPLOYEE OF THE MONTH\nMARISOL R. — HOUSEKEEPING', 14.12, y + 1.7, 11.8, Math.PI / 2, 1.3, 0.4, { bg: '#f0ecd8', fg: '#1a1a2a' });
  poster(L, 'health', 14.12, y + 1.6, 3.4, Math.PI / 2, 0.55, 0.8, {});
  wallMessages(L, 14.12, y + 1.5, 17.6, Math.PI / 2, 1.8, 1.0, { lines: ['SHIFT 3 — WHERE IS EVERYONE', 'MANAGER LEFT. KEYS IN OFFICE', 'TOOK 2 VANS TO AIRPORT'], density: 0.5 });
  // bellman cart + linen hampers
  const bc = P.prop(L, 15.2, y, 17.5, 0.2);
  bc.box(0, 0.15, 0, 0.7, 0.05, 1.2, 'carpetBlue', 0x6a1a1a).box(0, 1.9, 0, 0.7, 0.05, 1.2, 'chrome');
  for (const sz of [-0.55, 0.55]) bc.box(0, 1.0, sz, 0.05, 1.8, 0.05, 'chrome');
  bc.box(0, 1.9, 0, 0.05, 0.05, 1.2, 'chrome').box(0, 0.45, 0.2, 0.45, 0.6, 0.3, 'fabric', 0x3a2a2a).box(0.05, 0.4, -0.3, 0.5, 0.45, 0.4, 'fabric', 0x5a4a2a);
  bc.col(0, 1.0, 0, 0.75, 2.0, 1.25, 'metal', F_SOLID | F_SHOOT);
  for (const [x, z] of [[14.8, 2.0], [15.4, 12.8]]) { const p = P.prop(L, x, y, z, rng()); p.box(0, 0.55, 0, 0.8, 0.9, 0.6, 'fabric', 0x8a8a84).box(0, 1.02, 0, 0.7, 0.1, 0.5, 'fabric', 0xf0f0e8).col(0, 0.5, 0, 0.8, 1.0, 0.6, 'fabric', F_SOLID | F_SHOOT); }
  P.corpse(L, 15.9, y + 0.01, 8.2, 1.6, 0x6a1a1a); blood(L, 15.9, y, 8.2, 1.6, 4);
  trail(L, 16, 7.6, 12.6, 5.4, y, 5);
  L.reverb(14, y, 0.2, 18, HC, Z1, 'room');
  new Door(L, 14, y, 6.1, 'z', { width: 1.2, hinge: 1, material: 'metalDark', open: true });
  new Door(L, 14, y, 12.8, 'z', { width: 1.1, hinge: 1, material: 'woodDark' });

  // --- loading dock (x 0.2..14, z 0.2..12)
  L.wallX(0.2, 14, 12, y, HC, 'concrete', 0.2, []);
  L.box(0.3, y - 0.01, 0.3, 13.9, y + 0.005, 11.9, 'concreteFloor', { collide: false, tint: 0x6a6660 });
  // roll-up doors: A closed (truck backed up to it), B open
  rollDoor(L, 3.75, y, 0.2, 3.5, 3.2, 1, { tint: 0x7a7e78 });
  rollDoor(L, 3.75, y, -0.2, 3.5, 3.2, -1, { tint: 0x7a7e78 });
  L.box(8.0, y + 3.2, 0.2, 11.5, y + 3.35, 0.5, 'metalDark', NC);
  L.box(7.85, y + 3.3, -0.55, 11.65, y + 3.75, 0.55, 'metal', { collide: false, tint: 0x7a7e78 });
  for (const x of [8.0, 11.5]) L.box(x - 0.08, y, 0.2, x + 0.08, y + 3.3, 0.35, 'paintedYellow', { collide: false, tint: 0xc8a020 });
  for (let x = 8.1; x < 11.4; x += 0.5) L.box(x, y, 0.3, x + 0.25, y + 0.015, 1.2, 'paintedYellow', { collide: false, tint: 0xc8a020 });
  L.box(8.1, y - 0.01, 0.2, 11.4, y + 0.02, 1.6, 'diamond', { collide: false, tint: 0x8a8a84 });
  forklift(L, 6.2, y, 7.2, 0.6);
  for (const [x, z, r] of [[2.2, 9.8, 0.1], [3.6, 9.9, -0.1], [11.8, 9.6, 0.3], [2.4, 4.2, 1.6]]) wrappedPallet(L, x, y, z, r, 1.0 + rng() * 0.6);
  const jack = P.prop(L, 9.4, y, 5.2, 2.2); jack.box(0, 0.08, 0.3, 0.55, 0.06, 1.2, 'paintedRed', 0xb02a1a).box(0, 0.5, -0.4, 0.08, 1.0, 0.08, 'paintedRed', 0xb02a1a).col(0, 0.1, 0.2, 0.6, 0.2, 1.4, 'metal', F_SOLID);
  for (let i = 0; i < 3; i++) { const p = P.prop(L, 12.6, y, 2.0 + i * 1.3, 0); for (let k = 0; k < 7; k++) p.box(0, 0.45 + k * 0.08, 0, 0.45, 0.05, 0.45, 'fabric', 0x8a1a2a); p.col(0, 0.5, 0, 0.5, 1.0, 0.5, 'fabric', F_SOLID | F_SHOOT); }
  const comp = P.prop(L, 0.9, y, 7.0, -Math.PI / 2); comp.box(0, 1.1, 0, 2.6, 2.2, 1.2, 'paintedGreen', 0x2a4a3a).box(0, 1.5, -0.61, 1.8, 0.6, 0.02, 'metalDark').col(0, 1.1, 0, 2.6, 2.2, 1.2, 'metal');
  sign(L, 'TRASH COMPACTOR\nKEEP HANDS CLEAR', 1.52, y + 2.5, 7.0, Math.PI / 2, 1.2, 0.4, { bg: '#e8c020', fg: '#101010' });
  sign(L, 'RECEIVING — ALL DELIVERIES\nMUST BE SIGNED FOR', 7, y + 2.8, 11.88, 0, 2.2, 0.45, { bg: '#1a2a3a', fg: '#e8e8e0' });
  sign(L, 'DOCK 1', 3.75, y + 3.55, 0.38, 0, 0.8, 0.25, { bg: '#e8c020', fg: '#101010' });
  sign(L, 'DOCK 2', 9.75, y + 3.95, 0.62, 0, 0.8, 0.25, { bg: '#e8c020', fg: '#101010' });
  graffiti(L, 'FIRE ESCAPE\nEND OF ALLEY →', 13.8, y + 1.7, 3.2, Math.PI / 2, 1.8, 0.8, '#d8d8c8');
  P.corpse(L, 10.3, y + 0.01, 2.8, 2.7, 0x2a3a5a); blood(L, 10.3, y, 2.8, 1.6, 4);
  ceilingLight(L, 5, HC, 4, { type: 'cage', intensity: 8, flicker: 0.3 });
  ceilingLight(L, 10, HC, 8, { type: 'cage', intensity: 7, flicker: 0.6 });
  L.item('tier1', 12.6, y + 1.02, 3.3, { chance: 0.4 });
  L.item('ammo', 2.3, y + 1.65, 9.8, { chance: 0.5 });
  L.reverb(0.2, y, 0.2, 14, HC, 12, 'hall');
  // --- linen room (x 0.2..14, z 12..19.8): side room
  L.box(0.3, y - 0.01, 12.1, 13.9, y + 0.005, Z1 - 0.3, 'linoleum', { collide: false, tint: 0x9a9a90 });
  for (const x of [2.0, 4.2, 6.4]) { const p = P.prop(L, x, y, Z1 - 1.1, 0); p.box(0, 0.9, 0, 1.9, 1.8, 1.4, 'metalClean', 0xb8bcbc).cyl(0, 0.9, -0.71, 0.45, 0.04, 'glassDirty', 0x303838, [Math.PI / 2, 0, 0], 16).col(0, 0.9, 0, 1.9, 1.8, 1.4, 'metal'); }
  for (const z of [13.5, 16.5]) shelving(L, 0.75, y, z, -Math.PI / 2, 2.4, 2.2, 0.9);
  for (const [x, z] of [[9, 14], [10.2, 16.6], [11.8, 13.2]]) { const p = P.prop(L, x, y, z, rng() * 3); p.box(0, 0.55, 0, 0.8, 0.9, 0.6, 'fabric', 0x8a8a84).box(0, 1.02, 0, 0.7, 0.12, 0.5, 'fabric', 0xf0f0e8).col(0, 0.5, 0, 0.8, 1.0, 0.6, 'fabric', F_SOLID | F_SHOOT); }
  ceilingLight(L, 7, HC, 16, { type: 'fluoro', intensity: 7, flicker: 0.6 });
  L.item('health', 0.8, y + 1.0, 13.6, { chance: 0.6 });
  L.item('ammo', 8.2, y + 0.02, 18.9, { chance: 0.7 });
  L.item('tier2', 12.6, y + 0.02, 18.6, { chance: 0.25 });
  sign(L, 'LAUNDRY', 14.12, y + 2.5, 12.8, Math.PI / 2, 0.9, 0.25, { bg: '#e8e8e0', fg: '#1a2a4a' });
  L.reverb(0.2, y, 12, 14, HC, Z1, 'room');
  L.ambience(0.2, y, 0.2, 18, HC, Z1, 'apartments');
}

// ================================================================== ALLEY
function alley(L, game) {
  const y = GY, z0 = -9.2, zw = -0.2;
  L.box(-6, y - 0.5, z0, 60, y, zw, 'asphalt');
  L.box(-6, y, z0 - 0.02, 60, y + 0.01, z0 + 0.8, 'concrete', { collide: false, tint: 0x6a6660 });
  // dock apron + steps down
  L.box(0.2, y, -2.2, 12.4, HG, zw, 'concrete', { tint: 0x8a867e });
  L.stairs(12.4, -2.2, 14.4, zw, y, HG, '-x', 'concrete');
  for (const x of [8.4, 11.1]) L.box(x - 0.2, HG - 0.9, -2.35, x + 0.2, HG - 0.1, -2.2, 'rubber', { tint: 0x1a1a1a });
  L.box(0.2, HG - 0.02, -2.25, 12.4, HG, -2.2, 'paintedYellow', { collide: false, tint: 0xc8a020 });
  L.box(8.9, HG + 3.85, -0.5, 10.6, HG + 4.05, -0.2, 'metalDark', NC);
  L.box(9.0, HG + 3.82, -0.48, 10.5, HG + 3.85, -0.22, 'emissiveWarm', NC);
  L.light(9.75, HG + 3.3, -1.2, 0xffc888, 10, 10, { flicker: 0.15 });
  sign(L, 'HARBORVIEW HOTEL\nSERVICE ENTRANCE · DELIVERIES 6AM–2PM', 6.4, HG + 4.25, -0.23, 0, 3.4, 0.55, { bg: '#1a2a3a', fg: '#e8d8a0' });
  // box truck backed into dock 1 (blocks the west end)
  const tk = P.prop(L, 3.75, y, -5.0, 0);
  tk.box(0, 2.0, 1.1, 2.5, 2.6, 5.4, 'paintedWhite', 0xd8d4c8).box(0, 0.7, 1.1, 2.3, 0.3, 5.5, 'metalDark');
  tk.box(0, 1.6, -2.7, 2.4, 1.9, 2.0, 'carPaint', 0x2a4a7a).box(0, 2.1, -3.62, 2.2, 0.8, 0.1, 'glassDirty', 0x1a2024);
  for (const sx of [-1.15, 1.15]) for (const sz of [-2.6, 0.2, 2.6]) tk.cyl(sx, 0.48, sz, 0.48, 0.32, 'rubber', 0x151515, [0, 0, Math.PI / 2], 14);
  tk.col(0, 1.65, 0.3, 2.5, 3.3, 7.4, 'metal');
  sign(L, 'FRESHWAY\nFOODS', 5.02, y + 2.3, -3.9, Math.PI / 2, 2.4, 1.0, { bg: '#d8d4c8', fg: '#2a6a2a' });
  sign(L, 'FRESHWAY\nFOODS', 2.48, y + 2.3, -3.9, Math.PI / 2, 2.4, 1.0, { bg: '#d8d4c8', fg: '#2a6a2a' });
  L.box(-6, y, -9.2, -5.6, y + 16, zw, 'brickDark');
  L.box(-5.6, y, -9.2, 1.6, y + 3.2, -8.8, 'concreteDark', { visible: false });
  P.fenceChain(L, -5.6, -1.2, 1.6, -1.2, y, 3);
  // north side: backs of three buildings
  const backs = [[-6, 14, 15, 'brickDark', 0x6a4a3a], [14, 34, 13.4, 'brick', 0x7a5a48], [34, 60, 17.2, 'brickDark', 0x5a4034]];
  for (const [a, b, h, m, t] of backs) {
    L.box(a, y, z0 - 0.4, b, y + h, z0, m, { tint: t });
    L.box(a, y + h, z0 - 0.4, b, y + h + 0.8, z0 - 0.2, m, { collide: false, tint: t });
    for (let x = a + 2; x < b - 1; x += 3.4) for (let yy = 3.6; yy < h - 1.5; yy += 3.3) {
      const lit = rng() < 0.08;
      L.box(x - 0.55, y + yy, z0 + 0.001, x + 0.55, y + yy + 1.4, z0 + 0.03, lit ? 'emissiveWindow' : 'glassDirty', { collide: false, tint: lit ? 0xffb870 : 0x1a2024 });
      L.box(x - 0.65, y + yy - 0.1, z0, x + 0.65, y + yy, z0 + 0.12, 'concrete', { collide: false, tint: 0x8a847a });
      if (rng() < 0.12) { const p = P.prop(L, x, y + yy - 0.1, z0 + 0.35, 0); p.box(0, 0.25, 0, 0.7, 0.45, 0.6, 'metal', 0xb8b8b0); }
    }
  }
  // back doors + neon of the bar across the alley
  for (const [x, lab] of [[6, 'NO\nPARKING'], [22, 'THE ANCHOR\nDELIVERIES'], [44, 'EXIT ONLY']]) {
    L.box(x - 0.55, y, z0 + 0.001, x + 0.55, y + 2.2, z0 + 0.06, 'metal', { collide: false, tint: 0x4a4a48 });
    sign(L, lab, x, y + 2.6, z0 + 0.08, 0, 0.9, 0.4, { bg: '#1a1a1a', fg: '#e8e8e0' });
  }
  sign(L, 'THE ANCHOR', 22, y + 4.0, z0 + 0.12, 0, 2.2, 0.6, { fg: '#40c8ff', glow: 1.6, lightColor: 0x40a8ff, lightIntensity: 5 });
  // east end: fence, barricade, wrecked garbage truck
  P.fenceChain(L, 58.4, z0, 58.4, -0.2, y, 3.2);
  L.box(58.2, y, z0, 58.6, y + 4.5, zw, 'metal', { visible: false });
  const gt = P.prop(L, 55.5, y, -4.8, 0.2);
  gt.box(0, 1.8, 1.0, 2.5, 2.8, 5.2, 'paintedGreen', 0x3a5a2a).box(0, 1.5, -2.6, 2.4, 2.2, 1.8, 'paintedWhite', 0xd8d8d0).box(0, 2.0, -3.52, 2.2, 0.8, 0.06, 'glassDirty', 0x1a2024);
  for (const sx of [-1.15, 1.15]) for (const sz of [-2.5, 1.2, 2.8]) gt.cyl(sx, 0.5, sz, 0.5, 0.35, 'rubber', 0x151515, [0, 0, Math.PI / 2], 14);
  gt.col(0, 1.7, 0, 2.6, 3.4, 7.2, 'metal');
  sign(L, 'NEWBURG SANITATION', 56.8, y + 2.2, -4.5, Math.PI / 2 + 0.2, 2.6, 0.4, { bg: '#3a5a2a', fg: '#e8e8d8' });
  P.barricade(L, 52.4, y, -1.4, 0.4); P.barricade(L, 52.6, y, -7.6, -0.3);
  // alley dressing
  hittable(L, 'dumpster', 18.6, y, -8.3, 0);
  hittable(L, 'dumpster', 29.4, y, -1.0, 0);
  P.dumpster(L, 47.8, y, -8.4, 0, 0x2a3a5a);
  for (const [x, z] of [[16.4, -8.4], [20.8, -8.6], [27.6, -0.9], [31.8, -1.0], [46, -8.6], [50.8, -0.8], [24.6, -8.7]]) P.trashBags(L, x, y, z, 3 + Math.floor(rng() * 3));
  for (const [x, z] of [[33.2, -8.4], [13.8, -8.5]]) P.trashCan(L, x, y, z);
  P.pallet(L, 25.2, y, -8.2, 0.3, false); P.pallet(L, 25.4, y + 0.14, -8.1, 0.2, true);
  P.crate(L, 42.6, y, -8.3, 0.3); P.crate(L, 43.3, y, -7.9, 0.9, 0.7);
  alarmCar(L, 23.5, y, -6.2, Math.PI / 2 + 0.05, 0x7a1a14);
  P.car(L, 51.0, y, -4.3, Math.PI / 2 - 0.35, { burnt: true });
  fireSource(L, 51.0, y + 0.9, -4.3, 0.9, { hazard: true });
  burningBarrel(L, 15.4, y, -7.6);
  physProp(L, 'gascan', 33.4, y, -7.6);
  physProp(L, 'propane', 14.6, y, -1.0);
  physProp(L, 'cone', 12.0, y, -3.4);
  // puddles, blood, corpses
  for (let i = 0; i < 10; i++) L.decal(2 + rng() * 54, y + 0.012, -8.5 + rng() * 8, 0, 1, 0, 1.2 + rng() * 1.6, DF.POOL, { alpha: 0.35 });
  for (let i = 0; i < 8; i++) blood(L, 14 + rng() * 40, y, -8 + rng() * 7, 0.8 + rng(), i);
  P.corpse(L, 26.2, y + 0.01, -3.1, 0.6, 0x3a4a3a); P.corpse(L, 38.8, y + 0.01, -6.8, 2.2, 0x5a4a3a); P.corpse(L, 44.4, y + 0.01, -2.4, 1.2, 0x2a2a3a);
  // wall packs + overhead cables
  for (const [x, z, nz, on, f] of [[17, zw - 0.02, -1, true, 0.2], [30, zw - 0.02, -1, false, 0], [26, z0 + 0.02, 1, true, 0.5], [38, z0 + 0.02, 1, true, 0.1], [52, zw - 0.02, -1, true, 0.3]]) {
    L.box(x - 0.2, y + 4.6, z - 0.02, x + 0.2, y + 4.95, z + nz * 0.25, 'metalDark', NC);
    L.box(x - 0.16, y + 4.58, z + nz * 0.03, x + 0.16, y + 4.62, z + nz * 0.22, on ? 'emissiveWarm' : 'blackMatte', NC);
    if (on) L.light(x, y + 4.2, z + nz * 1.2, 0xffb070, 11, 12, { flicker: f });
  }
  for (const x of [12, 27, 41]) P.pipe(L, x, y + 7.5, zw - 0.1, x + 2, y + 6.8, z0 + 0.1, 0.018, 'rubber', 0x111111);
  P.pipe(L, 20, y + 8.2, zw - 0.1, 36, y + 8.0, zw - 0.1, 0.05, 'metalDark');
  for (const x of [1.4, 24.8, 33.6]) P.pipe(L, x, y, zw - 0.12, x, HR - 0.4, zw - 0.12, 0.07, 'metalDark');
  // kitchen exhaust on the facade
  const ex = P.prop(L, 30, HG + 3.2, -0.55, 0); ex.box(0, 0, 0, 1.4, 1.0, 0.7, 'metalClean', 0x9a9e9e); for (let i = 0; i < 5; i++) ex.box(0, -0.35 + i * 0.17, -0.36, 1.3, 0.05, 0.02, 'metalDark');
  // posters & graffiti
  for (const [x, t, bg, fg] of [[10.2, 'FLY NEWBURG\nSKYLINE AIR\nNON-STOP TO ANYWHERE', '#1a3a6a', '#f0e8c8'], [30.5, 'MISSING\nHAVE YOU SEEN\nDANA K.?', '#f0ecd8', '#1a1a1a'], [36.8, 'EVACUATION NOTICE\nPROCEED TO\nMETRO INTL AIRPORT', '#e8c020', '#101010'], [48.4, 'SKYLINE AIR\nWE\'RE STILL FLYING', '#1a3a6a', '#f0e8c8']]) sign(L, t, x, y + 2.1, z0 + 0.04, 0, 1.3, 1.0, { bg, fg });
  graffiti(L, 'THEY CLIMB\nFIRE ESCAPES', 28.4, y + 2.4, -0.23, 0, 2.2, 0.9, '#b8201a');
  posterWall(L, 14.2, y + 1.7, z0 + 0.03, 0, 3.2, 1.9, { kinds: ['evac', 'missing', 'concert', 'flyer', 'airline'] });
  posterWall(L, 45.6, y + 1.6, z0 + 0.03, 0, 2.6, 1.7, { kinds: ['quarantine', 'missing', 'movie', 'flyer'] });
  poster(L, 'evac', 17.2, HG + 1.6, -0.23, 0, 0.6, 0.85, { torn: 0.3 });
  poster(L, 'quarantine', 33.2, y + 1.7, -0.23, 0, 0.6, 0.85, {});
  graffiti(L, 'ROOF ↑', 34.6, y + 1.6, -0.23, 0, 1.2, 0.6, '#d8d8c8');
  graffiti(L, 'NO ONE\nIS COMING', 40.5, y + 2.8, z0 + 0.03, 0, 2.2, 0.9, '#d8d8c8');
  L.reverb(-6, y, z0, 60, y + 16, zw, 'outdoor');
  L.ambience(-6, y - 1, z0, 60, y + 14, zw, 'city');
}

// ============================================================ FIRE ESCAPE
// outer lane z -3.6..-1.9, inner lane -1.9..-0.2; flights along X.
function fireEscape(L) {
  const zo0 = -3.6, zm = -1.9, zi1 = -0.2;
  const A = 2.87, B = 5.73;
  const grate = 'diamond', gt = 0x3a3a38;
  L.stairs(36, zo0, 41, zm, GY, A, '+x', grate, { thin: true, tint: gt });
  L.box(41, A - 0.12, zo0, 43, A, zi1, grate, { tint: gt });
  L.stairs(36, zm, 41, zi1, A, B, '-x', grate, { thin: true, tint: gt });
  L.box(34, B - 0.12, zo0, 36, B, zi1, grate, { tint: gt });
  L.stairs(36, zo0, 41, zm, B, H3, '+x', grate, { thin: true, tint: gt });
  L.box(41, H3 - 0.12, zo0, 50, H3, zi1, grate, { tint: gt });
  // railings (visual) + fall guards
  const rail = (xa, ya, za, xb, yb, zb) => railSegment(L, xa, ya, za, xb, yb, zb);
  rail(36, 0.95, zo0 + 0.03, 41, A + 0.95, zo0 + 0.03);
  rail(36, B + 0.95, zo0 + 0.03, 41, H3 + 0.95, zo0 + 0.03);
  rail(41, A + 0.95, zo0 + 0.03, 43, A + 0.95, zo0 + 0.03); rail(43 - 0.03, A + 0.95, zo0, 43 - 0.03, A + 0.95, zi1);
  rail(34, B + 0.95, zo0 + 0.03, 36, B + 0.95, zo0 + 0.03); rail(34.03, B + 0.95, zo0, 34.03, B + 0.95, zi1);
  rail(41, H3 + 0.95, zo0 + 0.03, 50, H3 + 0.95, zo0 + 0.03); rail(50 - 0.03, H3 + 0.95, zo0, 50 - 0.03, H3 + 0.95, zi1);
  rail(41.03, H3 + 0.95, zm, 41.03, H3 + 0.95, zi1);
  rail(36, A + 0.95, zm - 0.03, 41, B + 0.95, zm - 0.03);
  L.clip(36, GY, zo0 - 0.06, 41, H3 + 1.2, zo0 + 0.02, F_SOLID);
  L.clip(36, GY, zm - 0.05, 41, H3 + 1.2, zm + 0.05, F_SOLID);
  L.clip(41, A, zo0 - 0.06, 43.05, A + 1.1, zo0 + 0.02, F_SOLID); L.clip(42.97, A, zo0, 43.05, A + 1.1, zi1, F_SOLID);
  L.clip(33.95, B, zo0 - 0.06, 36, B + 1.1, zo0 + 0.02, F_SOLID); L.clip(33.95, B, zo0, 34.03, B + 1.1, zi1, F_SOLID);
  L.clip(41, H3, zo0 - 0.06, 50.05, H3 + 1.1, zo0 + 0.02, F_SOLID); L.clip(49.97, H3, zo0, 50.05, H3 + 1.1, zi1, F_SOLID);
  L.clip(40.97, H3, zm, 41.05, H3 + 1.1, zi1, F_SOLID);
  // hangers, stringers, brackets into the wall
  for (const [x, y] of [[36, A], [41, A], [43, A], [34, B], [36, B], [41, H3], [45.5, H3], [50, H3]]) {
    P.pipe(L, x, y + 0.02, zo0 + 0.05, x, y + 2.2, zi1 - 0.05, 0.025, 'metalDark');
    L.box(x - 0.05, y - 0.35, zo0, x + 0.05, y - 0.12, zi1, 'metalDark', NC);
  }
  for (const [x, y0, y1] of [[36, GY, B], [41, GY, H3], [43, GY, A], [50, A, H3], [34, B - 2, B]]) L.box(x - 0.04, y0, zo0 - 0.04, x + 0.04, y1, zo0 + 0.04, 'metalDark', NC);
  // counterweighted bottom section + drop ladder
  L.box(35.8, GY, zo0 + 0.1, 35.9, GY + 1.0, zm - 0.1, 'metalDark', NC);
  // gooseneck ladder: landing C -> roof (infected climb; survivors may drop down it)
  // (a 0.5 m steel step in the parapet gap, 5 cm below the roof: infected climb
  // up from landing C; survivors can only drop down it)
  L.box(48.2, HR - 0.25, -0.7, 49.4, HR - 0.05, 0.2, grate, { tint: gt });
  for (const x of [48.3, 49.3]) P.pipe(L, x, H3 + 0.1, -0.62, x, PAR + 1.0, -0.62, 0.025, 'metalDark');
  for (let yy = H3 + 0.4; yy < HR - 0.3; yy += 0.3) L.box(48.3, yy, -0.64, 49.3, yy + 0.03, -0.6, 'metalDark', NC);
  for (const x of [48.15, 49.45]) L.clip(x - 0.05, HR - 0.05, -0.75, x + 0.05, PAR + 1.4, 0.2, F_SOLID);
  L.light(45.5, H3 + 2.6, -1.2, 0xffc080, 6, 8, { flicker: 0.4 });
  L.box(45.3, H3 + 2.7, -0.23, 45.7, H3 + 2.95, -0.2, 'emissiveWarm', NC);
  sign(L, 'FIRE ESCAPE', 47.2, H3 + 2.6, -0.24, 0, 1.0, 0.25, { bg: '#1a6a2a', fg: '#fff' });
  L.reverb(34, GY, -3.7, 50, H3 + 3, -0.2, 'outdoor');
}

// ================================================================= 3F
const CZ0 = 8.2, CZ1 = 10.6; // corridor walls
function thirdFloor(L, game) {
  const y = H3, H = 3.0, top = y + H;
  const cw = 'wallpaper';
  // corridor walls (north side from x 6.1; the stairwell builds its own front)
  L.wallX(6.1, X1 - 0.2, CZ0, y, top, cw, 0.2, [{ a: 25, b: 33.2, y0: y, y1: top }, { a: 34.4, b: 37.6, y0: y, y1: y + 2.6 }, { a: 38.5, b: 39.6, y0: y, y1: y + 2.2 }, { a: 45.05, b: 46.15, y0: y, y1: y + 2.2 }], { tint: 0xc8b89a });
  L.wallX(0.2, X1 - 0.2, CZ1, y, top, cw, 0.2, [{ a: 9.05, b: 10.15, y0: y, y1: y + 2.2 }, { a: 15.05, b: 16.15, y0: y, y1: y + 2.2 }, { a: 24.65, b: 25.75, y0: y, y1: y + 2.2 }, { a: 27.05, b: 28.15, y0: y, y1: y + 2.2 }, { a: 39.05, b: 40.15, y0: y, y1: y + 2.2 }], { tint: 0xc8b89a });
  // corridor carpet, wainscot, ceiling, crown
  L.box(0.3, y - 0.01, CZ0 + 0.1, X1 - 0.3, y + 0.006, CZ1 - 0.1, 'carpet', { collide: false, tint: 0x6a2226 });
  for (let x = 1; x < X1 - 1; x += 1.6) L.box(x, y + 0.007, (CZ0 + CZ1) / 2 - 0.35, x + 0.8, y + 0.009, (CZ0 + CZ1) / 2 + 0.35, 'carpet', { collide: false, tint: 0x9a7a3a });
  for (const z of [CZ0 + 0.11, CZ1 - 0.11]) L.box(0.3, y + 0.9, z - 0.01, X1 - 0.3, y + 0.95, z + 0.01, 'woodDark', NC);
  floorWithHoles(L, 0.2, 0.2, X1 - 0.2, Z1 - 0.2, HR - 0.4, 0.05, 'ceiling', [[0.2, 0.2, 5.9, 8.1], [20.5, 8.6, 22.5, 10.2]], NC);
  // west end window + east end
  sign(L, 'EXIT', 0.25, y + 2.65, 9.4, Math.PI / 2, 0.45, 0.2, { bg: '#1a6a2a', fg: '#fff', glow: 1.2, lightColor: 0x40ff60, lightIntensity: 2 });
  sign(L, '← 301–309\n← STAIRS / ROOF', 6.2, y + 1.9, CZ0 + 0.12, 0, 0.9, 0.4, { bg: '#2a1a14', fg: '#e8c878' });
  sign(L, '301 – 316 →', 33.8, y + 1.9, CZ1 - 0.12, 0, 0.9, 0.25, { bg: '#2a1a14', fg: '#e8c878' });
  poster(L, 'ad', 30.3, y + 1.6, CZ1 - 0.12, 0, 0.7, 0.95, { brand: ['THE HARBORVIEW', 'Rooftop lounge · 12th floor views', '#1a2a3a', '#e8d8a8'] });
  poster(L, 'airline', 12.2, y + 1.6, CZ1 - 0.12, 0, 0.7, 0.95, {});
  // sconces (half of them dead)
  const sc = [[3, CZ1, -1, true, 0.3], [11, CZ0, 1, false], [17, CZ1, -1, false], [24.2, CZ0, 1, true, 0.6], [30, CZ1, -1, false], [36, CZ1, -1, false], [42, CZ0, 1, true, 0.2], [48.5, CZ1, -1, true, 0]];
  for (const [x, z, nz, on, f] of sc) sconce(L, x, y + 2.0, z + nz * 0.11, 0, nz, on, f);
  // fake doors for the rooms we never enter
  fakeDoor(L, 7.2, y, CZ0, 'x', 1, '309', { dnd: true });
  fakeDoor(L, 13.2, y, CZ0, 'x', 1, '307');
  fakeDoor(L, 19.2, y, CZ0, 'x', 1, '305');
  fakeDoor(L, 6.8, y, CZ1, 'x', -1, '316');
  fakeDoor(L, 33.6, y, CZ1, 'x', -1, '306', { dnd: true });
  fakeDoor(L, 45.6, y, CZ1, 'x', -1, '302');
  for (const [x, lab] of [[39.1, '303'], [45.6, '301']]) sign(L, lab, x - 0.95, y + 1.62, CZ0 + 0.12, 0, 0.24, 0.12, { bg: '#c8a860', fg: '#2a1a0a' });
  for (const [x, lab] of [[9.6, '314'], [15.6, '312'], [25.2, '310'], [27.6, '308'], [39.6, '304']]) sign(L, lab, x + 0.95, y + 1.62, CZ1 - 0.12, 0, 0.24, 0.12, { bg: '#c8a860', fg: '#2a1a0a' });
  // --- partition walls (north side)
  for (const [x, z0, z1] of [[12, 0.2, CZ0], [18, 0.2, CZ0], [24, 0.2, CZ0], [34.2, 0.2, CZ0], [37.8, 0.2, CZ0], [44.4, 0.2, CZ0]]) L.wallZ(z0 + 0.1, z1 - 0.1, x, y, top, 'wallpaper', 0.2, []);
  // south side (the 310|312 wall has a smashed hole = the detour)
  for (const x of [8.4, 14.4, 26.4, 32.4, 38.4, 44.4]) L.wallZ(CZ1 + 0.1, Z1 - 0.3, x, y, top, 'wallpaper', 0.2, []);
  L.wallZ(CZ1 + 0.1, Z1 - 0.3, 20.4, y, top, 'wallpaper', 0.2, [{ a: 13.6, b: 15.0, y0: y, y1: y + 2.1 }]);
  // --- elevator lobby (x 24..34.2, z 3.6..8.2) + ice alcove (34.2..37.8, 4.8..8.2)
  L.wallX(24.1, 34.1, 3.6, y, top, 'marble', 0.2, [{ a: 26.2, b: 27.8, y0: y, y1: y + 2.3 }, { a: 30.4, b: 32.0, y0: y, y1: y + 2.3 }]);
  L.box(24.1, y, 0.2, 34.1, top, 3.5, 'concreteDark');
  L.box(26.2, y, 3.48, 27.8, y + 2.3, 3.52, 'metalClean', { tint: 0xb8b0a0 });
  L.box(26.99, y, 3.46, 27.01, y + 2.3, 3.47, 'blackMatte', NC);
  // pried-open car door: a dark shaft behind, taped off
  L.box(30.4, y, 3.45, 30.95, y + 2.3, 3.55, 'metalClean', { tint: 0xb8b0a0 });
  L.box(31.45, y, 3.45, 32.0, y + 2.3, 3.55, 'metalClean', { tint: 0xb8b0a0 });
  L.box(30.95, y - 0.3, 3.0, 31.45, y + 2.3, 3.49, 'blackMatte', NC);
  for (let i = 0; i < 3; i++) P.pipe(L, 31.05 + i * 0.15, y - 0.2, 3.2, 31.05 + i * 0.15, y + 2.3, 3.2, 0.012, 'metalDark');
  P.barricade(L, 31.2, y, 4.4, 0);
  L.clip(30.2, y, 3.55, 32.2, y + 2.3, 3.9, F_SOLID);
  sign(L, 'OUT OF ORDER\nDO NOT ENTER', 31.2, y + 1.55, 3.58, 0, 0.7, 0.35, { bg: '#e8c020', fg: '#101010' });
  for (const x of [27, 31.2]) { L.box(x - 0.9, y + 2.3, 3.49, x + 0.9, y + 2.45, 3.72, 'chrome', NC); sign(L, '3', x, y + 2.62, 3.72, 0, 0.3, 0.2, { bg: '#1a1410', fg: '#ffb040' }); }
  const cp = P.prop(L, 29.1, y + 1.2, 3.7, 0); cp.box(0, 0, 0, 0.16, 0.32, 0.03, 'chrome').box(0, 0.06, -0.02, 0.07, 0.07, 0.02, 'emissiveRed').box(0, -0.06, -0.02, 0.07, 0.07, 0.02, 'metal', 0xd8d0b0);
  L.box(24.1, y - 0.01, 3.7, 34.1, y + 0.006, CZ0, 'marble', { collide: false, tint: 0xd8d0c0 });
  P.bench(L, 25.4, y, 7.2, Math.PI);
  P.planter(L, 33.4, y, 4.3, 0.45);
  const ash = P.prop(L, 28.9, y, 5.2, 0); ash.cyl(0, 0.35, 0, 0.14, 0.7, 'chrome', null, null, 10).col(0, 0.35, 0, 0.3, 0.7, 0.3, 'metal', F_SOLID | F_SHOOT);
  sign(L, 'THIRD FLOOR', 25.0, y + 2.3, 3.72, 0, 1.2, 0.3, { bg: '#1a1410', fg: '#e8c878' });
  L.light(29, y + 2.6, 5.8, 0xffd8a8, 6, 8, { flicker: 0.5 });
  L.box(28.6, top - 0.03, 5.6, 29.4, top, 6.0, 'emissiveWarm', NC);
  L.box(34.3, y, 4.7, 37.7, top, 4.9, 'wallpaper', { tint: 0xc8b89a });
  L.box(34.3, y - 0.01, 4.9, 37.7, y + 0.006, CZ0, 'tileChecker', { collide: false });
  iceMachine(L, 35.3, y, 5.4, Math.PI);
  P.vending(L, 36.9, y, 5.3, Math.PI, 0x1a4a8a);
  L.light(36, y + 2.3, 6.5, 0x9ab8ff, 3.5, 5, { flicker: 0.7, buzz: 1 });
  fakeDoor(L, 36, y, 4.8, 'x', 1, null, { w: 0.9, color: 0x6a6a64 });
  sign(L, 'HOUSEKEEPING', 36, y + 2.32, 4.92, 0, 0.9, 0.18, { bg: '#e8e0c8', fg: '#2a1a0a' });
  // --- the collapse: a rooftop AC unit came through the ceiling
  const cx0 = 18.9, cx1 = 23.9;
  L.box(cx0, y, CZ0 + 0.1, cx1, top, CZ1 - 0.1, 'concrete', { visible: false, flags: F_DEFAULT });
  P.debris(L, 20.2, y, 9.2, 1.1, 'plaster', 14); P.debris(L, 22.6, y, 9.6, 1.0, 'concreteDark', 12);
  const ac = P.prop(L, 21.4, y + 0.6, 9.4, 0.4); ac.box(0, 0.4, 0, 1.8, 1.3, 1.3, 'metal', 0x9a9e9a, [0.3, 0, 0.5]);
  for (const [x, r] of [[19.4, [0.9, 0.2, 0.3]], [23.2, [-0.7, 0.4, -0.2]], [21.0, [0.2, 1.2, 0.8]]]) { const s = P.prop(L, x, y + 1.1, 9.4, 0); s.box(0, 0, 0, 1.2, 0.05, 0.6, 'ceiling', 0xd8d4c8, r); }
  for (let i = 0; i < 6; i++) P.pipe(L, 19.4 + i * 0.7, top - 0.05, 8.5 + (i % 3) * 0.6, 19.2 + i * 0.75, y + 0.8 + (i % 2), 8.9 + (i % 2) * 0.8, 0.012, 'rubber', 0x111111);
  P.pipe(L, 18.9, top - 0.2, 8.8, 22.0, y + 1.4, 9.8, 0.05, 'metal', 0x9a9a9a);
  sparker(L, 23.6, top - 0.35, 9.2, { nz: -1, range: 6 });
  fireSource(L, 22.9, y + 0.5, 9.3, 0.35, { hazard: false, intensity: 6 });
  L.decal(24.3, y + 0.012, 9.4, 0, 1, 0, 2.4, DF.SCORCH);
  graffiti(L, 'BLOCKED\nGO THRU 310', 24.9, y + 1.6, CZ0 + 0.12, 0, 1.6, 0.8, '#b8201a');
  graffiti(L, '← WE BROKE\nTHROUGH', 18.1, y + 1.7, CZ1 - 0.12, 0, 1.6, 0.8, '#b8201a');
  // housekeeping carts + room service trays in the corridor
  housekeepingCart(L, 42.5, y, 9.2, 0.05);
  housekeepingCart(L, 12.6, y, 9.6, Math.PI - 0.1);
  roomServiceCart(L, 34.6, y, 9.9, 1.4);
  P.corpse(L, 37.4, y + 0.01, 9.3, 1.3, 0x2a2a3a); blood(L, 37.4, y, 9.3, 1.8, 4);
  trail(L, 38.2, 9.3, 44.8, 9.6, y, 7);
  for (let i = 0; i < 6; i++) blood(L, 2 + rng() * 48, y, 8.6 + rng() * 1.6, 0.6 + rng() * 0.5, i);
  L.decal(4.1, y + 1.2, CZ1 - 0.11, 0, 0, -1, 1.1, DF.HAND, { noRoll: true });
  L.reverb(0.2, y, CZ0, X1, top, CZ1, 'hall');
  L.ambience(0.2, y, 0.2, X1, top, Z1, 'apartments');
  // --- rooms we enter
  room301(L, game); room303(L, game);
  guestRoom(L, game, { x0: 38.4, x1: 44.4, side: 's', door: 39.6, variant: 'witch' });
  guestRoom(L, game, { x0: 26.4, x1: 32.4, side: 's', door: 27.6, variant: 'camp' });
  guestRoom(L, game, { x0: 20.4, x1: 26.4, side: 's', door: 25.2, variant: 'ransacked', hole: 'w' });
  guestRoom(L, game, { x0: 14.4, x1: 20.4, side: 's', door: 15.6, variant: 'blood', hole: 'e' });
  guestRoom(L, game, { x0: 8.4, x1: 14.4, side: 's', door: 9.6, variant: 'barricade' });
  // doors (real)
  new Door(L, 39.6, y, CZ1, 'x', { width: 1.1, hinge: 1, open: true });
  new Door(L, 27.6, y, CZ1, 'x', { width: 1.1, hinge: -1 });
  new Door(L, 25.2, y, CZ1, 'x', { width: 1.1, hinge: 1, open: true });
  new Door(L, 15.6, y, CZ1, 'x', { width: 1.1, hinge: 1, open: true });
  new Door(L, 9.6, y, CZ1, 'x', { width: 1.1, hinge: -1 });
  new Door(L, 39.05, y, CZ0, 'x', { width: 1.1, hinge: -1, open: true });
  new Door(L, 45.6, y, CZ0, 'x', { width: 1.1, hinge: -1, open: true });
}

// Furnished guest room on the south side (corridor at z 10.6, window at 19.8).
function guestRoom(L, game, o) {
  const y = H3, top = y + 3.0;
  const { x0, x1 } = o;
  const z0 = CZ1 + 0.1, z1 = Z1 - 0.2;
  const cx = (x0 + x1) / 2;
  const doorAtWest = o.door - x0 < x1 - o.door;
  const v = o.variant;
  L.box(x0 + 0.1, y - 0.01, z0, x1 - 0.1, y + 0.006, z1, 'carpet', { collide: false, tint: v === 'witch' ? 0x4a3a3a : 0x6a5a48 });
  // bathroom block beside the entry
  const bx0 = doorAtWest ? o.door + 0.75 : o.door - 3.15, bx1 = bx0 + 2.4;
  const bz1 = z0 + 2.6;
  L.wallX(bx0 - 0.06, bx1 + 0.06, bz1, y, top, 'tileWhite', 0.12, [{ a: (bx0 + bx1) / 2 - 0.4, b: (bx0 + bx1) / 2 + 0.4, y0: y, y1: y + 2.1 }]);
  for (const bx of [bx0, bx1]) L.wallZ(z0, bz1 - 0.06, bx, y, top, 'tileWhite', 0.12, []);
  L.box(bx0 + 0.06, y - 0.01, z0, bx1 - 0.06, y + 0.007, bz1 - 0.06, 'tileWhite', { collide: false });
  P.toilet(L, doorAtWest ? bx1 - 0.4 : bx0 + 0.4, y, z0 + 0.55, doorAtWest ? Math.PI / 2 : -Math.PI / 2);
  P.sink(L, doorAtWest ? bx1 - 0.4 : bx0 + 0.4, y, z0 + 1.6, doorAtWest ? Math.PI / 2 : -Math.PI / 2);
  P.bathtub(L, doorAtWest ? bx0 + 0.45 : bx1 - 0.45, y, z0 + 1.0, 0);
  // beds against the far side wall, headboards on it
  const wallX = doorAtWest ? x1 - 0.1 : x0 + 0.1;
  const bedYaw = doorAtWest ? -Math.PI / 2 : Math.PI / 2; // local -z (headboard) towards the side wall
  const bedX = wallX + (doorAtWest ? -1.1 : 1.1);
  const messy = (v === 'ransacked' || v === 'barricade') && !o.hole;
  const bz = o.hole ? [16.0, 18.55, 17.28] : [14.0, 17.4, 15.7];
  hotelBed(L, bedX + (messy ? 0.3 : 0), y, bz[0], bedYaw + (messy ? 0.4 : 0), { cover: v === 'witch' ? 0x3a1a1a : 0x7a2a2a });
  hotelBed(L, bedX, y, bz[1], bedYaw, { cover: 0x2a3a5a });
  nightstand(L, wallX + (doorAtWest ? -0.3 : 0.3), y, bz[2], bedYaw + Math.PI, v === 'camp' || v === 'blood');
  P.picture(L, wallX + (doorAtWest ? -0.02 : 0.02), y + 1.6, bz[2], doorAtWest ? Math.PI / 2 : -Math.PI / 2, 1.0, 0.7);
  // dresser + TV on the opposite wall
  const ox = doorAtWest ? x0 + 0.1 : x1 - 0.1;
  const oYaw = doorAtWest ? -Math.PI / 2 : Math.PI / 2;
  P.dresser(L, ox + (doorAtWest ? 0.3 : -0.3), y, 15.2, oYaw);
  P.tv(L, ox + (doorAtWest ? 0.3 : -0.3), y + 1.0, 15.2, oYaw);
  // desk + armchair by the window
  P.table(L, cx + (doorAtWest ? -1.2 : 1.2), y, z1 - 0.5, 0, 1.3, 0.6, 'woodDark');
  P.chair(L, cx + (doorAtWest ? -1.2 : 1.2), y, z1 - 1.1, Math.PI + 0.3, 'woodDark', messy);
  const ac = P.prop(L, cx + (doorAtWest ? 1.3 : -1.3), y, z1 - 0.7, 0.5);
  ac.box(0, 0.25, 0, 0.8, 0.5, 0.8, 'fabric', 0x5a4a3a).box(0, 0.65, 0.33, 0.8, 0.5, 0.14, 'fabric', 0x5a4a3a).col(0, 0.4, 0, 0.8, 0.8, 0.8, 'fabric', F_SOLID | F_SHOOT);
  for (const s of [-1, 1]) L.box(cx + s * 1.1 - 0.4, y + 0.6, z1 - 0.12, cx + s * 1.1 + 0.4, top - 0.2, z1 - 0.06, 'fabric', { collide: false, tint: 0x7a6a4a });
  L.box(x0 + 0.2, top - 0.25, z1 - 0.14, x1 - 0.2, top - 0.2, z1 - 0.1, 'metalDark', NC);
  if (!o.hole) luggage(L, cx + (doorAtWest ? 0.4 : -0.4), y, bz1 + 0.6, rng() * 3, rng.pick([0x2a2a3a, 0x6a1a1a, 0x1a3a5a]));
  else luggage(L, wallX + (doorAtWest ? -0.4 : 0.4), y, z1 - 0.4, 0.3, 0x6a1a1a);
  if (v !== 'witch') ceilingLight(L, cx, top, 15, { type: 'bulb', intensity: 6, flicker: 0.4, on: v !== 'blood' });
  // variants
  if (v === 'witch') {
    L.witchSpots.push({ x: cx + (doorAtWest ? -0.8 : 0.8), y, z: 16.2 });
    for (let i = 0; i < 6; i++) blood(L, x0 + 0.6 + rng() * (x1 - x0 - 1.2), y, z0 + 1 + rng() * 7, 1 + rng(), i);
    P.corpse(L, cx, y + 0.01, 12.4, 1.2, 0x4a4a58);
    L.light(cx, y + 0.6, 17.8, 0xff5a3a, 1.6, 4, { flicker: 0.6 });
    graffiti(L, 'SHE CRIES\nLET HER', o.door + (doorAtWest ? -0.9 : 0.9), y + 1.6, CZ1 - 0.12, 0, 1.2, 0.6, '#d8d8c8');
    L.item('pills', ox + (doorAtWest ? 0.3 : -0.3), y + 1.02, 14.6, { chance: 0.6 });
  } else if (v === 'camp') {
    const mt = P.prop(L, cx, y, 12.2, 0.1); mt.box(0, 0.12, 0, 1.4, 0.24, 1.9, 'fabric', 0x8a8a7a);
    for (let i = 0; i < 6; i++) { const c = P.prop(L, x0 + 0.5 + i * 0.2, y, z0 + 3.1, 0); c.cyl(0, 0.07, 0, 0.05, 0.14, 'metalClean', rng.pick([0xc8a040, 0xb83a2a])); }
    L.item('medkit', cx + 0.2, y + 0.26, 12.0, { chance: 0.55 });
    L.item('tier2', cx - 1.6, y + 0.8, z1 - 0.5, { chance: 0.5 });
    L.item('ammo', ox + (doorAtWest ? 0.4 : -0.4), y + 1.02, 16.0, { chance: 0.8 });
    graffiti(L, 'RM 308\nTAKEN\nKNOCK 3X', cx, y + 1.6, z1 - 0.13, 0, 1.4, 0.7, '#1a2a8a');
  } else if (v === 'ransacked') {
    P.debris(L, cx, y, 13.8, 1.4, 'woodDark', 8); P.papers(L, cx, y + 0.01, 15, 2, 12);
    P.corpse(L, cx - 0.5, y + 0.01, 16.2, 2.4, 0x3a2a2a); blood(L, cx - 0.5, y, 16.2, 1.8, 4);
    L.item('throwable', cx + 1.4, y + 0.02, 12.2, { chance: 0.45 });
  } else if (v === 'blood') {
    for (let i = 0; i < 9; i++) blood(L, x0 + 0.6 + rng() * (x1 - x0 - 1.2), y, z0 + 0.8 + rng() * 7.5, 1 + rng() * 1.4, i);
    L.decal(x1 - 0.12, y + 1.3, 14.4, -1, 0, 0, 1.4, DF.SPLAT_BIG);
    P.corpse(L, cx + 0.4, y + 0.01, 13.4, 0.4, 0x4a3a2a);
    L.light(cx, top - 0.6, 15.5, 0xff8050, 2.2, 5, { flicker: 0.8 });
    L.item('health', cx + 0.6, y + 0.02, 18.9, { chance: 0.4 });
  } else if (v === 'barricade') {
    // somebody's last stand: furniture piled against the door (from inside) — the door is closed
    P.dresser(L, x0 + 0.45, y, z0 + 3.4, 1.4); P.chair(L, o.door - 0.4, y, z0 + 3.6, 1.2, 'woodDark', true);
    P.debris(L, o.door, y, z0 + 1.0, 0.5, 'woodDark', 6);
    P.corpse(L, cx, y + 0.01, 16.6, 0.9, 0x2a3a2a); blood(L, cx, y, 16.6, 2, 4);
    L.item('huntingRifle', cx - 0.4, y + 0.02, 18.4, { chance: 0.5 });
    L.item('ammo', cx + 0.6, y + 0.02, 18.7, {});
    graffiti(L, '4 DAYS\nNO FOOD\nSORRY MOM', x0 + 0.13, y + 1.5, 16, Math.PI / 2, 1.4, 0.8, '#202020');
  }
  // the detour hole (310 <-> 312): broken drywall edges + debris
  if (o.hole) {
    const hx = o.hole === 'w' ? x0 : x1;
    P.debris(L, hx + (o.hole === 'w' ? 0.6 : -0.6), y, 14.3, 0.5, 'plaster', 8);
    for (const [dz, dy] of [[-0.1, 2.1], [1.5, 1.4]]) L.box(hx - 0.13, y + dy - 0.2, 13.6 + dz, hx + 0.13, y + dy, 13.8 + dz, 'plaster', NC);
    if (o.hole === 'w') graffiti(L, '→ 312', hx + 0.14, y + 2.4, 14.3, Math.PI / 2, 0.8, 0.4, '#b8201a');
  }
  L.reverb(x0, y, z0, x1, top, z1, 'room');
}

// 301: the fire-escape room (north side, x 44.4..51.8)
function room301(L, game) {
  const y = H3, top = y + 3.0, x0 = 44.4, x1 = X1 - 0.2, z0 = 0.2, z1 = CZ0 - 0.1;
  L.box(x0 + 0.1, y - 0.01, z0 + 0.2, x1, y + 0.006, z1, 'carpet', { collide: false, tint: 0x5a6a5a });
  hotelBed(L, 50.2, y, 5.6, -Math.PI / 2 + 0.2, { cover: 0x2a4a3a });
  nightstand(L, 51.3, y, 3.8, Math.PI / 2, true);
  P.dresser(L, 44.9, y, 4.4, -Math.PI / 2); P.tv(L, 44.9, y + 1.0, 4.4, -Math.PI / 2);
  P.chair(L, 47.2, y, 1.5, 0.3, 'woodDark', true);
  luggage(L, 49.2, y, 7.2, 0.4, 0x6a1a1a);
  L.box(46.3, y, 0.2, 48.1, y + 0.02, 1.2, 'glass', { collide: false, tint: 0xa8c8d0 });
  for (let i = 0; i < 8; i++) { const p = P.prop(L, 46.4 + rng() * 1.6, y + 0.01, 0.4 + rng() * 1.2, rng() * 6); p.box(0, 0, 0, 0.08 + rng() * 0.1, 0.004, 0.06 + rng() * 0.12, 'glass', 0xc8e0e8); }
  P.corpse(L, 47.4, y + 0.01, 2.8, 2.0, 0x3a3a52); blood(L, 47.4, y, 2.8, 1.6, 4);
  graffiti(L, 'FIRE ESCAPE\n= WAY IN', x0 + 0.13, y + 1.7, 2.0, Math.PI / 2, 1.4, 0.7, '#b8201a');
  sign(L, 'IN CASE OF FIRE\nUSE STAIRS — WEST END', 45.2, y + 1.55, z1 - 0.12, 0, 0.6, 0.4, { bg: '#e8e0c8', fg: '#8a1a14' });
  ceilingLight(L, 48, top, 4.2, { type: 'bulb', intensity: 5, flicker: 0.5 });
  L.item('pills', 51.3, y + 0.62, 3.9, { chance: 0.4 });
  L.reverb(x0, y, z0, x1, top, z1, 'room');
}
function room303(L, game) {
  const y = H3, top = y + 3.0, x0 = 37.8, x1 = 44.4, z0 = 0.2, z1 = CZ0 - 0.1;
  L.box(x0 + 0.1, y - 0.01, z0 + 0.2, x1 - 0.1, y + 0.006, z1, 'carpet', { collide: false, tint: 0x6a5a48 });
  hotelBed(L, 39.1, y, 3.2, Math.PI / 2 + 0.3, { cover: 0x5a2a4a });
  hotelBed(L, 42.6, y, 2.6, -Math.PI / 2, { cover: 0x5a2a4a });
  nightstand(L, 43.9, y, 4.6, Math.PI / 2, false);
  P.papers(L, 41, y + 0.01, 4, 1.6, 12); P.debris(L, 40.8, y, 5.2, 1.0, 'woodDark', 7);
  P.sofa(L, 40.8, y, 6.7, Math.PI + 0.5, 0x4a3a2a);
  ceilingLight(L, 41.1, top, 3.8, { type: 'bulb', on: false });
  L.item('throwable', 38.4, y + 0.02, 1.0, { chance: 0.5 });
  L.reverb(x0, y, z0, x1, top, z1, 'room');
}

// ======================================================= STAIRWELL + ROOF
function stairwell(L, game) {
  const y = H3, xm = 3.1;
  // front wall (both levels) + side wall to room 309
  L.wallX(0.2, 6.1, CZ0, y, 15.2, 'concreteDark', 0.2, [{ a: 1.05, b: 2.15, y0: y, y1: y + 2.2 }, { a: 3.95, b: 5.05, y0: HR, y1: HR + 2.2 }]);
  L.wallZ(0.2, CZ0 - 0.1, 6, y, 15.2, 'concreteDark', 0.2, []);
  L.box(-0.2, PAR, -0.2, 6.1, 15.2, 0.2, 'brickTan', { tint: 0x9a7a5c });
  L.box(-0.2, PAR, 0.2, 0.2, 15.2, CZ0 + 0.1, 'brickTan', { tint: 0x9a7a5c });
  L.box(-0.3, 15.2, -0.3, 6.2, 15.45, CZ0 + 0.2, 'concreteDark');
  // flights: F1 west half up north, mid landing, F2 east half up south to the roof door
  L.stairs(0.2, 2.0, xm - 0.07, 6.2, y, 10.3, '-z', 'concrete');
  L.box(0.2, 10.0, 0.2, 5.9, 10.3, 2.0, 'concrete');
  L.box(xm + 0.07, y, 2.0, 5.9, 10.3 - 0.42, 6.2, 'concreteDark');
  L.stairs(xm + 0.07, 2.0, 5.9, 6.2, 10.3, HR, '+z', 'concrete', { thin: true });
  L.box(xm + 0.07, HR - 0.3, 6.2, 5.9, HR, CZ0 - 0.1, 'concrete');
  L.box(xm - 0.07, y, 2.0, xm + 0.07, HR + 1.05, 6.2, 'concreteDark');
  L.box(xm - 0.05, HR, 6.2, xm + 0.05, HR + 1.05, CZ0 - 0.1, 'metalDark', { flags: F_SOLID | F_SHOOT });
  L.box(xm - 0.06, HR + 1.0, 6.2, xm + 0.06, HR + 1.06, CZ0 - 0.1, 'paintedYellow', NC);
  L.box(0.3, y - 0.01, 6.2, 5.9, y + 0.006, CZ0 - 0.1, 'concreteFloor', { collide: false, tint: 0x6a6660 });
  ceilingLight(L, 3, 15.2, 1.4, { type: 'cage', intensity: 7, flicker: 0.3 });
  ceilingLight(L, 1.6, top3(), 7.2, { type: 'cage', intensity: 5, flicker: 0.6 });
  sign(L, 'ROOF ACCESS ↑', 1.6, y + 2.45, CZ0 + 0.12, 0, 1.0, 0.25, { bg: '#1a3a6a', fg: '#fff' });
  sign(L, '3', 0.9, y + 2.3, CZ0 - 0.12, 0, 0.4, 0.4, { bg: '#1a3a6a', fg: '#fff' });
  sign(L, 'R', 3.2, HR + 2.3, CZ0 - 0.12, 0, 0.4, 0.4, { bg: '#1a3a6a', fg: '#fff' });
  graffiti(L, 'ROOF IS\nNOT SAFE\nEITHER', 0.33, 10.8, 1.1, Math.PI / 2, 1.4, 0.7, '#b8201a');
  wallMessages(L, 5.87, 9.9, 4.2, -Math.PI / 2, 2.2, 1.2, { lines: ['ROOF → NEXT DOOR SITE', 'THE CRANE HAS A REMOTE', 'LOUD. REAL LOUD.', 'GOOD LUCK — T.'], density: 0.6 });
  L.reverb(0.2, y, 0.2, 6, 15.2, CZ0, 'stairwell');
  new Door(L, 1.6, y, CZ0, 'x', { width: 1.1, hinge: -1, material: 'paintedGreen' });
  new Door(L, 4.5, HR, CZ0, 'x', { width: 1.1, hinge: 1, material: 'paintedGreen', open: true });
}
const top3 = () => H3 + 3.0;

function roof(L, game) {
  const y = HR;
  // slab + parapet guards
  floorWithHoles(L, 0.2, 0.2, X1 - 0.2, Z1 - 0.2, y, 0.4, 'roof', [[0.2, 0.2, 5.9, CZ0 - 0.1], [20.5, 8.6, 22.5, 10.2]]);
  L.box(34.4, y, Z1 - 0.25, 37.6, y + 0.02, Z1 + 0.25, 'diamond', { collide: false, tint: 0x8a8a84 });
  L.clip(-0.2, PAR, -0.2, 48.2, PAR + 1.5, 0.2, F_SOLID);
  L.clip(49.4, PAR, -0.2, X1 + 0.2, PAR + 1.5, 0.2, F_SOLID);
  L.clip(-0.2, PAR, 0.2, 0.2, PAR + 1.5, Z1, F_SOLID);
  L.clip(X1 - 0.2, PAR, 0.2, X1 + 0.2, PAR + 1.5, Z1, F_SOLID);
  L.clip(-0.2, PAR, Z1 - 0.2, 34.0, PAR + 1.5, Z1 + 0.2, F_SOLID);
  L.clip(38.0, PAR, Z1 - 0.2, X1 + 0.2, PAR + 1.5, Z1 + 0.2, F_SOLID);
  L.box(0.2, y, 0.2, X1 - 0.2, y + 0.25, 0.3, 'roof', { collide: false, tint: 0x5a5a58 });
  // the collapse: a hole where the AC unit fell through, fenced off
  for (const [a, b, c, d] of [[20.2, 8.3, 22.8, 8.4], [20.2, 10.4, 22.8, 10.5], [20.2, 8.4, 20.3, 10.4], [22.7, 8.4, 22.8, 10.4]]) L.box(a, y, b, c, y + 1.0, d, 'paintedYellow', { tint: 0xc8a020, flags: F_SOLID | F_SHOOT });
  L.clip(20.2, y + 1.0, 8.3, 22.8, y + 2.2, 10.5, F_SOLID);
  L.box(20.5, y - 0.4, 8.6, 20.55, y, 10.2, 'metalDark', NC);
  sign(L, 'DANGER\nROOF COLLAPSE', 21.5, y + 0.6, 8.25, 0, 0.9, 0.4, { bg: '#e8c020', fg: '#101010' });
  P.debris(L, 23.4, y, 7.6, 0.8, 'roof', 8);
  // curb where the AC unit used to stand
  L.box(19.8, y, 11.0, 23.2, y + 0.3, 11.2, 'concrete', { tint: 0x8a867e });
  // elevator machine room (spawn source during the crescendo)
  const mx0 = 25, mx1 = 33, mz0 = 0.2, mz1 = 5.4, mh = 3.0;
  L.wallX(mx0, mx1, mz1, y, y + mh, 'brickTan', 0.3, [{ a: 28.3, b: 29.7, y0: y, y1: y + 2.2 }], { tint: 0x8a6a4e });
  L.wallZ(mz0 + 0.2, mz1, mx0, y, y + mh, 'brickTan', 0.3, [], { tint: 0x8a6a4e });
  L.wallZ(mz0 + 0.2, mz1, mx1, y, y + mh, 'brickTan', 0.3, [], { tint: 0x8a6a4e });
  L.box(mx0 - 0.15, PAR, -0.2, mx1 + 0.15, y + mh, 0.2, 'brickTan', { tint: 0x8a6a4e });
  L.box(mx0 - 0.3, y + mh, -0.3, mx1 + 0.3, y + mh + 0.3, mz1 + 0.3, 'concreteDark');
  for (const x of [27, 31]) { const p = P.prop(L, x, y, 2.6, 0); p.box(0, 0.5, 0, 1.4, 1.0, 1.0, 'paintedGreen', 0x3a5a4a).cyl(0.2, 1.3, 0, 0.5, 0.35, 'metalDark', null, [Math.PI / 2, 0, 0], 16).cyl(-0.4, 1.1, 0, 0.3, 0.6, 'paintedGreen', 0x3a5a4a, [0, 0, Math.PI / 2], 12).col(0, 0.8, 0, 1.4, 1.6, 1.1, 'metal'); }
  P.electricPanel(L, 29, y, 0.55, Math.PI, true);
  for (let i = 0; i < 4; i++) P.pipe(L, 26.5 + i * 1.4, y + 0.3, 1.6, 26.5 + i * 1.4, y + mh, 1.6, 0.015, 'metalDark');
  ceilingLight(L, 29, y + mh, 3.4, { type: 'cage', intensity: 4, flicker: 0.8 });
  sign(L, 'ELEVATOR MACHINE ROOM\nAUTHORIZED PERSONNEL ONLY', 29, y + 2.5, mz1 + 0.17, 0, 1.6, 0.35, { bg: '#e8c020', fg: '#101010' });
  new Door(L, 29, y, mz1, 'x', { width: 1.2, hinge: -1, material: 'paintedGreen', open: true });
  L.reverb(mx0, y, mz0, mx1, y + mh, mz1, 'room');
  // water tower
  P.waterTower(L, 12, y, 4.2);
  sign(L, 'HARBORVIEW', 12, y + 7.0, 1.95, 0, 2.6, 0.5, { fg: '#d8c8a0' });
  // neon HARBORVIEW letters on a steel frame along the west edge (read from Harbor St)
  for (let z = 9.2; z <= 19.4; z += 2.04) {
    L.box(0.55, y, z - 0.07, 0.7, y + 3.9, z + 0.07, 'metalDark', { tint: 0x2a2a2a });
    P.pipe(L, 0.62, y + 3.2, z, 2.4, y, z, 0.035, 'metalDark');
  }
  for (const yy of [y + 1.4, y + 3.75]) L.box(0.5, yy, 9.1, 0.75, yy + 0.1, 19.5, 'metalDark', NC);
  L.clip(0.4, y, 9.1, 0.85, y + 3.9, 19.5, F_SOLID | F_SHOOT);
  const neon = neonLetters(L, game, 'HARBORVIEW', 0.42, y + 2.55, 14.3, -Math.PI / 2, { letterW: 1.02, letterH: 1.8, color: '#ff2a55', dead: [7], flicker: [2, 8], sparks: true, lights: [[2.2, y + 2.4, 11.2], [2.2, y + 2.4, 17.2]], lightIntensity: 8, lightRange: 10 });
  for (let z = 9.4; z < 19.4; z += 1.02) P.pipe(L, 0.62, y + 1.5, z, 0.62, y + 3.6, z, 0.012, 'rubber', 0x111111);
  // HVAC, ducts, exhaust fans over the kitchen, satellite dish, antenna
  for (const [x, z, r] of [[40.5, 3.2, 0], [44.2, 3.2, 0], [16.8, 13.8, Math.PI / 2], [8.2, 16.4, 0]]) P.acUnit(L, x, y, z, r);
  const rtu = P.prop(L, 45.8, y, 14.2, 0); rtu.box(0, 0.9, 0, 4.2, 1.8, 2.2, 'metal', 0xa8aca8).box(0, 1.85, 0, 1.6, 0.1, 1.6, 'blackMatte');
  for (let i = 0; i < 8; i++) rtu.box(-1.8 + i * 0.5, 0.9, -1.11, 0.05, 1.5, 0.02, 'metalDark');
  rtu.col(0, 0.9, 0, 4.2, 1.8, 2.2, 'metal');
  P.pipe(L, 43.6, y + 1.2, 14.2, 38.2, y + 1.2, 14.2, 0.3, 'metalClean', 0x9a9e9e);
  P.pipe(L, 38.2, y + 1.2, 14.2, 38.2, y + 1.2, 11.2, 0.3, 'metalClean', 0x9a9e9e);
  L.clip(38.0, y, 11.2, 43.6, y + 1.5, 14.5, F_SOLID | F_SHOOT);
  for (const [x, z] of [[26.6, 11.6], [30.8, 11.6], [34.8, 7.4]]) exhaustFan(L, x, y, z, 0.7);
  const dish = P.prop(L, 49.6, y, 7.4, 0.8); dish.cyl(0, 0.6, 0, 0.06, 1.2, 'metalDark').geo(new THREE.SphereGeometry(0.9, 14, 8, 0, Math.PI * 2, 0, 0.9), 'paintedWhite', 0, 1.4, 0.2, [-1.1, 0, 0], [1, 0.5, 1], 0xd8d8d0).col(0, 0.8, 0, 0.6, 1.6, 0.6, 'metal', F_SOLID | F_SHOOT);
  P.antenna(L, 50.6, y, 1.2, 9);
  // staff smoking corner
  const lc = P.prop(L, 16.2, y, 18.4, 0.3); lc.box(0, 0.3, 0, 0.7, 0.06, 1.8, 'plastic', 0xd8d8d0).box(0, 0.55, 0.85, 0.7, 0.5, 0.06, 'plastic', 0xd8d8d0, [0.5, 0, 0]).col(0, 0.3, 0, 0.7, 0.6, 1.8, 'plastic', F_SOLID | F_SHOOT);
  const cl = P.prop(L, 17.3, y, 17.4, 0); cl.box(0, 0.22, 0, 0.6, 0.44, 0.4, 'plastic', 0x2a5aa8).col(0, 0.22, 0, 0.6, 0.44, 0.4, 'plastic', F_SOLID | F_SHOOT);
  L.item('pills', 17.3, y + 0.45, 17.4, { chance: 0.4 });
  // sleeping bags + a barrel fire: someone held the roof for a while
  burningBarrel(L, 9.6, y, 12.2);
  for (const [x, z, r] of [[7.6, 11.4, 0.3], [8.4, 13.4, 1.4]]) { const sb = P.prop(L, x, y, z, r); sb.box(0, 0.08, 0, 0.8, 0.16, 2.0, 'fabric', rng.pick([0x3a5a3a, 0x5a2a2a])); }
  graffiti(L, 'CRANE GUY\nSAID IT HAS\nA REMOTE', 6.3, y + 1.6, 4.0, Math.PI / 2, 1.8, 0.9, '#d8d8c8');
  P.corpse(L, 10.8, y + 0.01, 14.4, 2.2, 0x3a3a2a);
  // roof lights
  L.reverb(0.2, y, 0.2, X1, y + 12, Z1, 'outdoor');
  L.ambience(-2, y - 0.5, -2, X1 + 2, y + 20, Z1 + 1, 'rooftop');
  return { neon };
}

// ================================================================ BUILD
export function buildHotel(L, game) {
  shell(L);
  kitchenSafeRoom(L, game);
  kitchen(L, game);
  const co = coolerAndOffice(L, game);
  serviceAndDock(L, game);
  alley(L, game);
  fireEscape(L);
  thirdFloor(L, game);
  stairwell(L, game);
  const rf = roof(L, game);
  return { cooler: co.cooler, neon: rf.neon };
}
