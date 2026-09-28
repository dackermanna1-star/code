// Dead Air 4 — baggage claim (carousels, rental counters, the arrivals glass)
// and the back-of-house baggage handling hall: a maze of floor conveyors with
// overhead transfer belts and sorting chutes, tug trains, ULD containers and
// piles of unclaimed suitcases, the make-up area by the apron doors and a
// control booth. A staff door on the west wall leads into the security area.
import * as THREE from 'three';
import { P, sign, graffiti, poster, posterWall, wallMessages, supplies, ceilingLight, physProp, stencil } from './kit.js';
import { Door } from '../world/dynamic.js';
import { DF } from '../render/decals.js';
import { VisualBatch } from './da_parts.js';
import { CLAIM, BAG, BARR } from './da4_layout.js';
import { rng, NC, glassWallX, wayfind, notice, curtainMat, column, body, strewLuggage, flightBoard, trail, uld, beltLoader, panelLight, wallX, wallZ, hangingSign, interiorGlass, F_SOLID, F_NONAV } from './da4_parts.js';

export function buildBaggage(L, game, S) {
  claim(L, game, S);
  handling(L, game, S);
}

// ================================================================ BAGGAGE CLAIM
function claim(L, game, S) {
  const { x0, x1, z0, z1, h } = CLAIM;
  L.floor(x0 + 0.2, z0 + 0.15, x1, z1, 0, 'tileFloor', 0.3, { tint: 0xb0aca2 });
  L.box(x0 - 0.2, h, z0 - 0.15, x1 + 0.3, h + 0.5, z1 + 0.3, 'concreteDark', { tint: 0x8a8680 });
  L.ceiling(x0 + 0.2, z0 + 0.15, x1, z1, h - 0.3, 'ceiling', 0.3);
  // north wall (shared with baggage handling) with the staff door; east wall; arrivals glass
  wallX(L, x0 + 0.2, BAG.x1 + 0.3, 0, 0, h, 'plasterBlue', [[127.3, 128.7]], 0.3, { tint: 0x9aa8b0 });
  const staff = new Door(L, 128, 0, 0, 'x', { width: 1.4, hinge: 1, material: 'metal' });
  S.staffDoor = staff;
  wallZ(L, z0 + 0.15, z1 + 0.3, x1 + 0.15, 0, h, 'plasterBlue', [], 0.3, { tint: 0x9aa8b0 });
  glassWallX(L, x0 + 0.2, x1, z1, 0, h - 0.3, { step: 3.6, transoms: [2.8] });
  sign(L, 'AUTHORIZED PERSONNEL ONLY\nBAGGAGE SERVICES', 128, 2.6, 0.17, 0, 1.8, 0.45, { bg: '#b01e18', fg: '#ffffff', clean: true });
  sign(L, 'STAFF', 128, 1.6, -0.17, 0, 0.6, 0.2, { bg: '#16191e', fg: '#f2c230', clean: true });
  // carousels fed by inclined belts from ceiling hatches
  for (const [cx, n] of [[121, 1], [130.5, 2]]) {
    P.carousel(L, cx, 0, 29, Math.PI / 2, 12, 3.4);
    const p = P.prop(L, cx, 0, 22.5, 0);
    p.box(0, 3.4, -0.4, 0.9, 0.08, 5.2, 'rubber', 0x151515, [-0.72, 0, 0]).box(0, 3.3, -0.4, 1.0, 0.18, 5.3, 'metalClean', 0x9a9e9e, [-0.72, 0, 0]);
    L.box(cx - 0.8, h - 0.4, 17.6, cx + 0.8, h - 0.3, 19.2, 'blackMatte', NC);
    for (let k = 0; k < 6; k++) L.box(cx - 0.75 + k * 0.25, h - 1.3, 18.1, cx - 0.55 + k * 0.25, h - 0.4, 18.14, 'rubber', { collide: false, tint: 0x141414 });
    hangingSign(L, `BAGGAGE CLAIM  ${n}`, cx, 4.6, 23.2, 0, 2.6, 0.5, h - 0.3);
    flightBoard(L, cx - 2.6, 1.9, 22.2 - 0.02, Math.PI, 1.3, 0.8, { kind: 'arr', seed: 40 + n, rows: 5, light: false, frame: true });
    strewLuggage(L, cx - 3.6, 21, cx - 2.2, 37, 0, 6);
    strewLuggage(L, cx + 2.2, 21, cx + 3.6, 37, 0, 4);
  }
  // columns (the van ends up against the first one)
  for (const [x, z] of [[117.2, 16], [126, 16], [117.2, 40], [126, 40]]) column(L, x, z, 0, h - 0.3, 0.45, { mat: 'concrete', tint: 0xb8b4ac });
  // rental counters + lost & found along the east wall
  for (const [z, name, c] of [[10, 'SKYLINE RENT-A-CAR', '#b01e28'], [18, 'NEWBURG AUTO RENTAL', '#1a3a7a']]) {
    P.receptionDesk(L, 134.2, 0, z, -Math.PI / 2, 5);
    sign(L, name, x1 - 0.02, 3.0, z, -Math.PI / 2, 5, 0.6, { bg: '#e8e8e4', fg: c, clean: true, glow: 0.4, light: false });
  }
  sign(L, 'LOST & FOUND', x1 - 0.02, 3.0, 35, -Math.PI / 2, 3.2, 0.5, { bg: '#16191e', fg: '#f2c230', clean: true });
  for (let i = 0; i < 3; i++) P.metalShelf(L, 135.3, 0, 32 + i * 2.1, -Math.PI / 2, 1.9, 2.0, 0.9);
  // wayfinding + ads
  wayfind(L, 'STAFF ONLY  ·  BAGGAGE SERVICES  ↑', 118, 4.4, 0.18, 0, 4.0, 0.45);
  wayfind(L, '←  CHECK-IN  ·  DEPARTURES', 100.24, 4.6, 30, Math.PI / 2, 3.6, 0.45);
  wayfind(L, 'GROUND TRANSPORTATION  ↓', 118, 4.8, 43.6, 0, 3.6, 0.45);
  poster(L, 'airline', 100.24, 2.2, 34, Math.PI / 2, 1.8, 1.2, { title: 'FLY NEWBURG' });
  poster(L, 'evac', 100.24, 1.8, 38, Math.PI / 2, 0.5, 0.72, { wet: 0.3 });
  posterWall(L, 100.24, 1.6, 8, Math.PI / 2, 3.2, 1.8, { kinds: ['missing', 'missing', 'flyer', 'missing'], seed: 4421 });
  wallMessages(L, 100.24, 1.9, 4.4, Math.PI / 2, 1.6, 1.1, { lines: ['WE WAITED\nFOR BAGS\nLOL', 'CAROUSEL 2\nIS A TRAP'], density: 1.1 });
  // abandoned stuff: strollers, carts, bodies, a sea of bags
  for (const [x, z, n, r] of [[108, 34, 7, 2.2], [112, 6, 5, 1.6], [132, 40, 6, 1.8]]) P.luggagePile(L, x, 0, z, n, r);
  for (const [x, z, r] of [[106.5, 26, 0.4], [124, 8, 2.2], [133.5, 26, 1.1], [111, 40.5, 0.3]]) P.luggageCart(L, x, 0, z, r, true);
  for (const [x, z, r, c] of [[110, 24, 0.8, 0x4a3a2a], [127.5, 4.5, 2.6, 0x2a3a4a], [124.4, 36.5, 1.7, 0x6a2a2a]]) body(L, x, 0, z, r, c);
  P.wheelchair(L, 104.4, 0, 40.6, 2.3);
  strewLuggage(L, 102, 2, 116, 12, 0, 7);
  trail(L, 127.6, 4.4, 128, 0.6, 0, 5);
  // lights
  for (const [x, z, on, fl] of [[108, 8, true, 0.1], [108, 30, true, 0.6], [124, 10, false, 0], [126, 30, true, 0.3], [133, 18, true, 0.2]]) panelLight(L, x, h - 0.3, z, { on, flicker: fl, intensity: 9, range: 11 });
  // post-crescendo pickups
  L.item('ammo', 134.1, 1.17, 10.2, { chance: 0.9 });
  L.item('health', 134.1, 1.17, 17.4, { chance: 0.55 });
  L.item('pills', 128.3, 0.66, 35.2, { chance: 0.5 });
  L.reverb(x0, 0, z0, x1, h, z1, 'hall');
  L.ambience(x0, -0.5, z0, x1, h, z1, 'city');
  S.claimTrigger = [101, -0.5, 10, 116, 3, 26];
}

// ================================================================ BAGGAGE HANDLING
function handling(L, game, S) {
  const { x0, x1, z0, z1, h } = BAG;
  L.floor(x0 + 0.15, z0 + 0.15, x1, z1 - 0.15, 0, 'concreteFloor', 0.3);
  L.box(x0 - 0.15, h, z0 - 0.15, x1 + 0.3, h + 0.5, z1 - 0.15, 'concreteDark', { tint: 0x6a6660 });
  // walls: east, north (apron doors), west (door to security)
  wallZ(L, z0 - 0.15, z1 - 0.15, x1 + 0.15, 0, h, 'concreteDark', [], 0.3);
  wallX(L, x0 - 0.15, x1 + 0.3, z0, 0, h, 'concreteDark', [], 0.3);
  wallZ(L, z0 + 0.15, z1 - 0.15, x0, 0, h, 'concreteDark', [[-22.6, -21.4]], 0.3);
  const exit = new Door(L, x0, 0, -22, 'z', { width: 1.2, hinge: 1, material: 'metal' });
  S.bagExit = exit;
  sign(L, 'SECURITY  ·  STAFF ACCESS', x0 + 0.17, 2.6, -22, Math.PI / 2, 1.8, 0.35, { bg: '#16191e', fg: '#f2c230', clean: true });
  sign(L, 'BAGGAGE MAKE-UP\nAUTHORIZED PERSONNEL ONLY', 122, 3.6, z0 + 0.17, 0, 3.6, 0.8, { bg: '#e8c020', fg: '#101010' });
  // floor walkway paint
  for (const [a, b, c, d] of [[x0 + 0.5, -4.4, x1 - 0.5, -4.0], [x0 + 0.5, -12.9, x1 - 0.5, -12.5], [x0 + 0.5, -22.2, x1 - 0.5, -21.8]]) L.box(a, 0.003, b, c, 0.01, d, 'paintedYellow', { collide: false, tint: 0xc8a020 });
  // floor conveyor lines (the maze): L1 open at the east end, L2 at the west, L3 at the east
  const lines = [[116, -8, 31.6], [128.2, -17, 31.4], [116, -27, 31.6]];
  for (const [cx, cz, len] of lines) {
    P.conveyor(L, cx, 0, cz, 0, len, 0.95, { bags: true });
    for (let x = cx - len / 2 + 2; x < cx + len / 2 - 1; x += 5.5) { const p = P.prop(L, x, 0, cz, 0); p.box(0, 1.35, 0.5, 0.12, 0.3, 0.12, 'paintedYellow', 0xc8a020).glow(0, 1.55, 0.5, 0.1, 0.1, 0.1, 0x3a0808); }
    stencil(L, 'CAUTION  AUTOMATIC EQUIPMENT', cx, 0.62, cz + 0.48, 0, 2.6, 0.18, '#e8c020');
  }
  // end guards + emergency stop posts
  for (const [x, z] of [[132.2, -8], [111.8, -17], [132.2, -27]]) { L.box(x - 0.08, 0, z - 0.6, x + 0.08, 1.4, z + 0.6, 'paintedYellow', { tint: 0xc8a020 }); sign(L, 'E-STOP', x + 0.1, 1.2, z, Math.PI / 2, 0.3, 0.2, { bg: '#b01e18', fg: '#ffffff', clean: true }); }
  // overhead transfer belts on posts (walk underneath) + sloped chutes onto the floor lines
  const B = new VisualBatch(L);
  for (const bx of [106, 121, 139]) {
    B.box(bx - 0.5, 3.4, z0 + 1, bx + 0.5, 3.48, z1 - 1, 'rubber', { tint: 0x151515 });
    B.box(bx - 0.55, 3.25, z0 + 1, bx + 0.55, 3.4, z1 - 1, 'metalClean', { tint: 0x8a8e8e });
    for (const s of [-1, 1]) B.box(bx + s * 0.55 - 0.02, 3.48, z0 + 1, bx + s * 0.55 + 0.02, 3.72, z1 - 1, 'metalClean', { tint: 0xa8acac });
    for (let z = z0 + 2; z < z1 - 1; z += 4.2) {
      // posts avoid the floor conveyor lines
      if ([-8, -17, -27].some((lz) => Math.abs(z - lz) < 1.0)) continue;
      for (const s of [-1, 1]) L.box(bx + s * 0.5 - 0.06, 0, z - 0.06, bx + s * 0.5 + 0.06, 3.25, z + 0.06, 'paintedYellow', { tint: 0xb89a2a });
    }
    for (let z = z0 + 3; z < z1 - 2; z += 7) if (rng() < 0.7) P.suitcase(L, bx + (rng() - 0.5) * 0.4, 3.48, z, rng() * 3, undefined, false);
  }
  for (const [bx, lz] of [[106, -8], [121, -17], [139, -17], [106, -27], [121, -8]]) {
    const p = P.prop(L, bx, 0, lz + 1.4, 0);
    p.box(0, 2.3, 0, 0.9, 0.06, 2.4, 'metalClean', 0xa8acac, [0.75, 0, 0]);
    for (const s of [-1, 1]) p.box(s * 0.46, 2.4, 0, 0.04, 0.3, 2.4, 'metalClean', 0x9a9e9e, [0.75, 0, 0]);
  }
  B.build(L);
  // make-up area: tug trains, ULDs, belt loader, piles; big apron doors (one half open)
  P.baggageTug(L, 136.5, 0, -31.8, -Math.PI / 2, 0xd8a020);
  P.baggageCart(L, 132.6, 0, -31.8, Math.PI / 2, { color: 0x2a4a8a });
  P.baggageCart(L, 128.9, 0, -31.8, Math.PI / 2 + 0.05, { color: 0x8a1a14 });
  P.baggageTug(L, 106, 0, -33.4, Math.PI / 2 + 0.2, 0xd8a020);
  uld(L, 112.4, 0, -33.6, 0, { color: 0xa8acae });
  uld(L, 115.0, 0, -33.8, 0.05, { color: 0x9a9e9e, doorTint: 0x1a3a7a, door: 'fabricBlue' });
  uld(L, 121.6, 0, -34.4, 0, { color: 0xb0b4b6 });
  P.luggagePile(L, 118.8, 0, -31.6, 9, 2.0);
  P.luggagePile(L, 125.4, 0, -33.8, 7, 1.6);
  for (const [x, z] of [[103, -2.4], [141.6, -2.2], [141.8, -11.6], [102.8, -12.6]]) P.luggagePile(L, x, 0, z, 5, 1.1);
  for (const dx of [110, 130]) {
    // apron roll-up doors (visual), one jammed half-open with firelight under it
    for (let y = 0.2; y < 4.6; y += 0.16) L.box(dx - 2.5, y, z0 + 0.16, dx + 2.5, y + 0.12, z0 + 0.2, 'metal', { collide: false, tint: 0x9a9e9e });
    L.box(dx - 2.8, 4.6, z0 + 0.15, dx + 2.8, 5.2, z0 + 0.5, 'metalDark', NC);
    sign(L, dx === 110 ? 'APRON  DOOR  B1' : 'APRON  DOOR  B2', dx, 5.5, z0 + 0.17, 0, 2.0, 0.3, { bg: '#e8c020', fg: '#101010', clean: true });
  }
  L.light(130, 0.5, z0 + 1.0, 0xff7a30, 6, 7, { flicker: 0.5 });
  L.box(127.5, 0.0, z0 + 0.14, 132.5, 0.18, z0 + 0.16, 'emissiveWarm', { collide: false, tint: 0xff7a30 });
  // control booth (east end, glass front, door) with CCTV and a supply stash
  const cb = { x0: 137.5, x1: 144, z0: -36, z1: -28.5 };
  wallX(L, cb.x0, x1, cb.z1, 0, 3.0, 'paintedWhite', [[139.45, 140.55]], 0.2, { tint: 0xc8c8c0 });
  wallZ(L, cb.z0 + 0.15, cb.z1, cb.x0, 0, 3.0, 'paintedWhite', [[-33.6, -30.2, 2.4, 1.0]], 0.2, { tint: 0xc8c8c0 });
  interiorGlass(L, 'z', -33.6, -30.2, cb.x0, 1.0, 2.4);
  L.box(cb.x0 - 0.1, 3.0, cb.z0 + 0.15, x1, 3.2, cb.z1 + 0.1, 'metalDark', { tint: 0x3a3e44 });
  new Door(L, 140, 0, cb.z1, 'x', { width: 1.1, hinge: -1 });
  const desk = P.desk(L, 139.2, 0, -32.2, Math.PI / 2, false);
  for (let i = 0; i < 3; i++) { desk.box(-0.3, 1.0 + i * 0.36, 0.1, 0.42, 0.32, 0.3, 'plastic', 0x2a2a2a); desk.glow(-0.3, 1.0 + i * 0.36, -0.06, 0.36, 0.26, 0.01, i === 1 ? 0x101418 : 0x3a5a4a); }
  P.officeChair(L, 138.4, 0, -32.2, -Math.PI / 2);
  supplies(L, 143.2, 0, -32.2, -Math.PI / 2, [{ type: 'ammo' }, { type: 'health', chance: 0.6 }, { type: 'throwable', chance: 0.6 }], { w: 2.0, mat: 'metalDark' });
  L.light(140.8, 2.6, -32.4, 0x8ac8a8, 4, 6, { flicker: 0.4 });
  graffiti(L, 'RAMP CREW\nLAST STAND', 143.82, 1.8, -29.6, -Math.PI / 2, 1.4, 0.8, '#b8201a');
  // dead ramp workers, blood, drips of hydraulic oil
  for (const [x, z, r, c] of [[134.4, -29.4, 1.2, 0xe07a10], [108.2, -12.8, 2.9, 0xe07a10], [124, -21.6, 0.4, 0x2a3a4a], [115, -4.6, 1.9, 0xd8d020]]) body(L, x, 0, z, r, c);
  trail(L, 124, -21.6, 111, -21.8, 0, 9);
  for (let i = 0; i < 7; i++) L.decal(102 + rng() * 40, 0.012, z0 + 2 + rng() * 32, 0, 1, 0, 1 + rng() * 1.2, DF.BLOOD1 + (i % 4));
  // lighting: cage lights along the walkways, a dead bank, rotating amber beacons (off)
  for (const [x, z, on, fl] of [[104, -3, true, 0.2], [124, -4, true, 0.5], [141, -12.5, true, 0.1], [118, -12.5, false, 0], [104, -22, true, 0.4], [126, -22, true, 0.7], [114, -31.5, true, 0.2]]) ceilingLight(L, x, h - 0.02, z, { type: 'cage', on, flicker: fl, intensity: 9, range: 11 });
  L.reverb(x0, 0, z0, x1, h, z1, 'hall');
  L.ambience(x0, -0.5, z0, x1, h, z1, 'subway');
  L.witchSpots.push({ x: 141, y: 0, z: -34 });
  S.bagTrigger = [120, -0.5, -6, 136, 3, -0.2];
  S.bagExitTrigger = [100.2, -0.5, -26, 108, 3, -18];
  void THREE; void F_SOLID; void F_NONAV; void notice; void curtainMat; void BARR; void beltLoader; void physProp; void ceilingLight;
}
