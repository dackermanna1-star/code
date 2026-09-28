// Dead Air 5 — Metro International, Concourse C (north edge of the map).
// Departure level (y=6): the safe room at the end of Gate C4, the Gate C4
// lounge behind a glass curtain wall (blown in by the crash), the C4 jet
// bridge reaching out over the apron and its service stair down to the
// tarmac. Ground level: the facade with three baggage-hall roll-up doors
// (dark halls the finale hordes pour out of). The rest of the terminal is an
// unreachable mass behind a lit glass facade and the METRO INTERNATIONAL sign.
import * as THREE from 'three';
import { room, ceilingLight, sign, graffiti, stencil, poster, posterWall, wallMessages, safeRoom, supplies, P } from './kit.js';
import { WindowPane } from '../world/dynamic.js';
import { F_SOLID, F_SHOOT, F_SIGHT, F_NONAV, F_DEFAULT } from '../world/collision.js';
import { DF } from '../render/decals.js';
import { VisualBatch, ebsScreen } from './da_parts.js';
import { makeRng } from '../core/math.js';
import { cot } from './ch3_props.js';
import { DEP, FAC_Z, TERM, SAFE, LOUNGE, GATE_X, BRIDGE, CAB, STAIR, HALLS } from './da5_layout.js';

const rng = makeRng(5105);
const NC = { collide: false };
const MASS = F_SOLID | F_SIGHT | F_NONAV;

export function buildTerminal(L, game, S) {
  const B = new VisualBatch(L);
  const fz = FAC_Z; // outer face of the facade
  // ================================================================ mass
  // ground level (below the departure floor): solid except the halls
  let cx = TERM.x0;
  for (const h of HALLS) {
    L.box(cx, 0, TERM.z0, h.x0 - 0.3, DEP - 0.3, fz - 0.3, 'concrete', { visible: false, flags: MASS | F_SHOOT });
    L.box(h.x0 - 0.3, 0, TERM.z0, h.x1 + 0.3, DEP - 0.3, -16.3, 'concrete', { visible: false, flags: MASS | F_SHOOT });
    cx = h.x1 + 0.3;
  }
  L.box(cx, 0, TERM.z0, TERM.x1, DEP - 0.3, fz - 0.3, 'concrete', { visible: false, flags: MASS | F_SHOOT });
  // departure level: solid except the safe room + lounge
  L.box(TERM.x0, DEP - 0.3, TERM.z0, SAFE.x0 - 0.1, TERM.roof, fz - 0.3, 'concrete', { visible: false, flags: MASS });
  L.box(SAFE.x0 - 0.1, DEP - 0.3, TERM.z0, SAFE.x1, TERM.roof, SAFE.z0 - 0.1, 'concrete', { visible: false, flags: MASS });
  L.box(SAFE.x0 - 0.1, DEP + 3.2 + 0.3, SAFE.z0 - 0.1, SAFE.x1, TERM.roof, fz - 0.3, 'concrete', { visible: false, flags: MASS });
  L.box(LOUNGE.x0, DEP - 0.3, TERM.z0, LOUNGE.x1, TERM.roof, LOUNGE.z0 - 0.1, 'concrete', { visible: false, flags: MASS });
  L.box(LOUNGE.x0, DEP + LOUNGE.h + 0.3, LOUNGE.z0 - 0.1, LOUNGE.x1, TERM.roof, fz - 0.3, 'concrete', { visible: false, flags: MASS });
  L.box(LOUNGE.x1 + 0.1, DEP - 0.3, TERM.z0, TERM.x1, TERM.roof, fz - 0.3, 'concrete', { visible: false, flags: MASS });
  // departure floor slabs under the rooms (their own room floors sit on top)

  // ================================================================ safe room
  const sr = safeRoom(L, {
    x0: SAFE.x0, z0: SAFE.z0, x1: SAFE.x1, z1: SAFE.z1 - 0.1, y: DEP, h: 3.2, doorWall: 'e', doorAt: -9.6, wall: 'plasterBlue', floor: 'linoleum',
    extraOpen: { s: [{ at: -41.9, w: 2.4, window: true, sill: 0.95, h: 1.55 }, { at: -38.4, w: 2.2, window: true, sill: 0.95, h: 1.55 }] },
    graffiti: ['THE PLANE\nIS REAL', 'PILOT ON\nCH 3', 'FUEL TRUCK\nBY THE WING', 'GO GO GO', 'THEY CAME\nOFF FLIGHT 88'],
  });
  S.safeDoor = sr.door;
  supplies(L, -42.2, DEP, -11.25, 0, ['medkit', 'medkit', 'medkit', 'medkit'], { w: 2.2 });
  supplies(L, -39.1, DEP, -11.25, 0, ['molotov', 'pipebomb', 'bile', 'pipebomb'], { w: 2.0 });
  supplies(L, -43.25, DEP, -7.4, Math.PI / 2, ['autoShotgun', 'rifle', 'huntingRifle', { type: 'scar', chance: 0.6 }], { w: 2.4 });
  L.item('ammo', -37.1, DEP + 0.02, -11.2, {});
  L.item('pills', -36.8, DEP + 0.02, -5.2, { chance: 0.7 });
  cot(L, -37.4, DEP, -6.2, 0);
  for (let i = 0; i < 4; i++) L.survivorStart.push({ x: -42.2 + i * 1.3, y: DEP, z: -6.4 + (i % 2) * 0.9, yaw: Math.PI });
  L.flowStart = [-42.0, DEP, -5.6]; // at the survivor spawn so progress starts at 0.000
  sign(L, 'GATE C4\nSTAFF ONLY', -36.12, DEP + 2.2, -7.4, -Math.PI / 2, 0.9, 0.45, { bg: '#e8e4d8', fg: '#1a2a4a' });

  // ================================================================ gate C4 lounge
  const { x0, z0, x1, z1, h: LH } = LOUNGE;
  const zg = z1 - 0.1; // glass line
  L.floor(x0, z0, x1, z1, DEP, 'carpetGray', 0.3, { tint: 0x7a8494 });
  L.ceiling(x0, z0, x1, z1, DEP + LH, 'ceiling', 0.3);
  // north wall with the closed concourse shutter (the way back is gone)
  L.wallX(x0, x1, z0, DEP, DEP + LH, 'plaster', 0.25, [{ a: -28, b: -20, y0: DEP, y1: DEP + 3.2 }], { tint: 0xc8c4b8 });
  L.box(-28, DEP, z0 - 0.05, -20, DEP + 3.2, z0 + 0.05, 'metal', { tint: 0x8a8e90 });
  for (let k = 0; k < 20; k++) L.box(-28, DEP + 0.15 + k * 0.155, z0 + 0.05, -20, DEP + 0.2 + k * 0.155, z0 + 0.08, 'metalDark', NC);
  sign(L, 'CONCOURSE C  ·  GATES C1–C3', -24, DEP + 3.55, z0 + 0.15, 0, 5, 0.45, { bg: '#1a2230', fg: '#f0d040', glow: true, lightColor: 0xf0d040, lightIntensity: 3 });
  graffiti(L, 'NO WAY\nBACK', -21.5, DEP + 1.6, z0 + 0.11, 0, 1.5, 0.8, '#c02018');
  // west wall (lounge side of the safe room + restrooms), east wall (shutter to C5-C8)
  L.wallZ(z0, SAFE.z0 - 0.1, x0, DEP, DEP + LH, 'plaster', 0.2, [], { tint: 0xc8c4b8 });
  L.box(x0 - 0.1, DEP + 3.2, SAFE.z0 - 0.1, x0 + 0.1, DEP + LH, zg, 'plaster', { tint: 0xc8c4b8 });
  L.wallZ(z0, zg, x1, DEP, DEP + LH, 'plaster', 0.25, [], { tint: 0xc8c4b8 });
  L.box(x1 - 0.2, DEP, -13.5, x1 - 0.12, DEP + 3.1, -7.5, 'metal', { tint: 0x8a8e90, collide: false });
  sign(L, 'GATES C5–C8 →', x1 - 0.22, DEP + 3.5, -10.5, -Math.PI / 2, 2.4, 0.4, { bg: '#1a2230', fg: '#f0d040' });
  sign(L, 'RESTROOMS', x0 + 0.12, DEP + 2.4, -14.5, Math.PI / 2, 1.2, 0.3, { bg: '#1a2230', fg: '#e8e8e0' });
  L.box(x0 + 0.1, DEP, -15.6, x0 + 0.16, DEP + 2.15, -14.6, 'woodDark', NC);
  // ---------------------------------------------------- glass curtain wall onto the apron
  // sill + mullions + transom (static), panes (breakable), and a player clip in
  // the glass plane so the blown-in wall stays a wall.
  L.box(x0, DEP + LH - 0.35, zg - 0.12, x1, DEP + LH, zg + 0.12, 'metalDark', { tint: 0x3a3e42 });
  const gate = [GATE_X - 1.24, GATE_X + 1.24];
  S.loungePanes = [];
  for (let x = x0; x < x1 - 0.01; x += 2.6) {
    const a = x, b = Math.min(x1, x + 2.6);
    L.box(a - 0.06, DEP, zg - 0.14, a + 0.06, DEP + LH, zg + 0.14, 'metalDark', { tint: 0x2a2e32 });
    if (Math.abs((a + b) / 2 - GATE_X) < 0.2) continue; // the gate bay
    L.box(a, DEP, zg - 0.12, b, DEP + 0.45, zg + 0.12, 'metalDark', { tint: 0x3a3e42 });
    for (const [ya, yb] of [[DEP + 0.45, DEP + 2.8], [DEP + 2.86, DEP + LH - 0.35]]) {
      S.loungePanes.push(new WindowPane(L, a + 0.06, ya, zg - 0.02, b - 0.06, yb, zg + 0.02, { dirty: true }));
    }
    L.box(a, DEP + 2.8, zg - 0.08, b, DEP + 2.86, zg + 0.08, 'metalDark', { tint: 0x2a2e32, collide: false });
    L.clip(a, DEP + 0.45, zg + 0.03, b, DEP + LH, zg + 0.1, F_SOLID | F_NONAV);
  }
  L.box(x1 - 0.06, DEP, zg - 0.14, x1, DEP + LH, zg + 0.14, 'metalDark', { tint: 0x2a2e32 });
  // jet bridge door (gate C4)
  L.box(gate[0], DEP + 2.35, zg - 0.15, gate[1], DEP + LH - 0.35, zg + 0.15, 'metal', { tint: 0x9a9ea0 });
  sign(L, 'C4', GATE_X, DEP + 2.85, zg - 0.17, 0, 0.9, 0.5, { bg: '#1a2230', fg: '#f0d040', glow: true, lightColor: 0xf0d040, lightIntensity: 3 });
  sign(L, 'EVAC 41 · NEWBURG ANG · BOARDING', GATE_X, DEP + 3.4, zg - 0.17, 0, 2.3, 0.3, { bg: '#0a0c10', fg: '#e8b030', glow: true, light: false });
  // gate podium, departure board, seating
  P.checkInDesk(L, -21.5, DEP, -8.2, Math.PI, 1);
  P.departureBoard(L, -21.5, DEP + 3.0, -9.4, Math.PI, 2.6, 1.3, { hanging: true });
  for (let i = 0; i < 3; i++) {
    P.seatingRow(L, -31.5, DEP, -14 + i * 3.1, 0, 6, { double: true, color: 0x2a3a5a });
    P.seatingRow(L, -15.5, DEP, -14 + i * 3.1, 0, 6, { double: true, color: 0x2a3a5a });
  }
  P.seatingRow(L, -31.8, DEP, -5.6, Math.PI, 5, { color: 0x2a3a5a });
  // barricade of seats and luggage against the shutter
  for (let i = 0; i < 4; i++) P.suitcase(L, -26 + i * 1.3 + rng() * 0.4, DEP, -16.4 + rng() * 0.3, rng() * 3);
  P.luggagePile(L, -18.5, DEP, -15.7, 7, 1.1);
  P.luggageCart(L, -12.2, DEP, -6.6, 0.6, true);
  P.wheelchair(L, -34.2, DEP, -14.8, 1.1);
  P.vending(L, -11.0, DEP, -15.6, -Math.PI / 2, 0x1a4a8a);
  P.trashCan(L, -35.45, DEP, -13.4);
  P.corpse(L, -27.6, DEP + 0.01, -7.2, 1.2, 0x2a3a5a);
  L.decal(-27.4, DEP + 0.012, -7.4, 0, 1, 0, 2.2, DF.POOL);
  P.corpse(L, -13.5, DEP + 0.01, -9.8, 2.6, 0x6a2a2a);
  L.decal(-13.2, DEP + 0.012, -9.5, 0, 1, 0, 1.6, DF.BLOOD2);
  for (let i = 0; i < 8; i++) L.decal(-33 + rng() * 22, DEP + 0.012, -15 + rng() * 10, 0, 1, 0, 0.6 + rng(), DF.BLOOD1 + (i % 4));
  // emergency broadcast on a column-mounted TV
  L.box(-26.7, DEP, -12.9, -26.1, DEP + LH, -12.3, 'plaster', { tint: 0xb8b4a8 });
  S.ebs = ebsScreen(L, game, -26.4, DEP + 2.6, -12.28, 0, 1.0, 0.6, {
    messages: ['EVACUATION FLIGHT EVAC 41 · GATE C4 · NEWBURG AIR NATIONAL GUARD', 'ALL CIVILIAN FLIGHTS CANCELLED', 'DO NOT APPROACH THE RUNWAY', 'MILITARY PERSONNEL ONLY BEYOND THIS POINT'],
  });
  poster(L, 'airline', -33.5, DEP + 1.9, z0 + 0.14, 0, 1.2, 0.8, { title: 'SKYLINE AIR', torn: 0.2 });
  poster(L, 'evac', -12.5, DEP + 1.6, z0 + 0.14, 0, 0.5, 0.72, { torn: 0.2 });
  posterWall(L, x1 - 0.13, DEP + 1.5, -15.2, -Math.PI / 2, 1.6, 1.2, { kinds: ['flyer', 'missing', 'evac'] });
  wallMessages(L, x0 + 0.12, DEP + 1.7, -16.2, Math.PI / 2, 1.2, 1.0, { lines: ['WE SAW THE\nPLANE LAND', 'MARCUS\nWAIT FOR US'] });
  // lighting: some fixtures dead, the glass wall lets in the apron glow
  ceilingLight(L, -31, DEP + LH, -10, { type: 'fluoro', intensity: 10, flicker: 0.6 });
  ceilingLight(L, -21.5, DEP + LH, -12, { type: 'fluoro', intensity: 12 });
  ceilingLight(L, -14, DEP + LH, -8, { type: 'fluoro', intensity: 9, on: true, flicker: 0.9 });
  for (const [a, b] of [[-31, -6], [-14, -14.5]]) L.box(a - 0.6, DEP + LH - 0.1, b - 0.1, a + 0.6, DEP + LH - 0.02, b + 0.1, 'blackMatte', NC);
  L.reverb(x0, DEP, z0, x1, DEP + LH, z1, 'hall');
  L.ambience(x0, DEP, z0, x1, DEP + LH, z1, 'hospital');
  L.item('pills', -21.2, DEP + 1.05, -8.1, { chance: 0.6 });
  L.item('throwable', -15.2, DEP + 0.5, -11.0, { chance: 0.6 });
  S.loungeCam = [-22.6, DEP + 1.75, -5.3];

  // ================================================================ jet bridge C4
  const { x0: bx0, x1: bx1 } = BRIDGE;
  L.box(bx0, DEP - 0.25, zg - 0.1, bx1, DEP - 0.004, CAB.z0, 'rubber', { tint: 0x2a2c30 });
  L.box(bx0, DEP - 0.8, zg + 0.12, bx1, DEP - 0.25, CAB.z0, 'metal', { tint: 0x9a9e9e });
  for (const [a, b] of [[bx0, bx0 + 0.15], [bx1 - 0.15, bx1]]) {
    L.box(a, DEP, zg + 0.12, b, DEP + 2.6, CAB.z0, 'metal', { tint: 0xb4b8b8 });
    for (const off of [-0.012, 0.162]) L.box(a + off - 0.004, DEP + 1.05, zg + 0.5, a + off + 0.004, DEP + 1.95, CAB.z0 - 0.4, 'glassDirty', { tint: 0x1a2226, collide: false });
  }
  L.box(bx0 - 0.05, DEP + 2.6, zg + 0.12, bx1 + 0.05, DEP + 2.8, CAB.z0, 'metal', { tint: 0xa8acac });
  for (let z = 0; z < CAB.z0; z += 1.2) L.box(bx0 - 0.02, DEP - 0.8, z, bx1 + 0.02, DEP + 2.82, z + 0.05, 'metalDark', { tint: 0x7a7e7e, collide: false });
  ceilingLight(L, GATE_X, DEP + 2.6, 2, { type: 'fluoro', intensity: 7, flicker: 0.4 });
  ceilingLight(L, GATE_X, DEP + 2.6, 10, { type: 'fluoro', intensity: 7 });
  L.decal(GATE_X + 0.3, DEP + 0.012, 5, 0, 1, 0, 1.4, DF.SMEAR);
  L.decal(GATE_X - 0.2, DEP + 0.012, 8.5, 0, 1, 0, 1.0, DF.BLOOD3);
  // cab (rotunda) at the end
  const c = CAB;
  L.box(c.x0, DEP - 0.3, c.z0, c.x1, DEP, c.z1, 'rubber', { tint: 0x2a2c30 });
  L.box(c.x0, DEP - 1.0, c.z0, c.x1, DEP - 0.3, c.z1, 'metal', { tint: 0x8a8e8e });
  L.box(c.x0, DEP + 2.9, c.z0, c.x1, DEP + 3.1, c.z1, 'metal', { tint: 0xa8acac });
  L.box(c.x0, DEP, c.z0, bx0, DEP + 2.9, c.z0 + 0.15, 'metal', { tint: 0xb4b8b8 });
  L.box(bx1, DEP, c.z0, c.x1, DEP + 2.9, c.z0 + 0.15, 'metal', { tint: 0xb4b8b8 });
  L.box(bx0, DEP + 2.6, c.z0, bx1, DEP + 2.9, c.z0 + 0.15, 'metal', { tint: 0xb4b8b8 });
  L.box(c.x0, DEP, c.z0, c.x0 + 0.15, DEP + 2.9, c.z1, 'metal', { tint: 0xb4b8b8 });
  L.wallZ(c.z0, c.z1, c.x1 - 0.075, DEP, DEP + 2.9, 'metal', 0.15, [{ a: STAIR.z0, b: STAIR.z1, y0: DEP, y1: DEP + 2.3 }], { tint: 0xb4b8b8 });
  L.box(c.x0, DEP, c.z1 - 0.3, c.x1, DEP + 2.9, c.z1, 'rubber', { tint: 0x1a1a1c });
  L.box(c.x0 + 0.8, DEP + 1.2, c.z1 - 0.32, c.x1 - 0.8, DEP + 2.2, c.z1 - 0.3, 'glassDirty', { tint: 0x1a2428, collide: false });
  const con = P.prop(L, -26.6, DEP, 17.7, Math.PI);
  con.box(0, 0.55, 0, 1.4, 1.1, 0.6, 'metalDark', 0x3a3e42).glow(-0.3, 1.12, 0.1, 0.3, 0.02, 0.2, 0x30ff60).glow(0.2, 1.12, 0.1, 0.15, 0.02, 0.15, 0xff3020).col(0, 0.55, 0, 1.4, 1.1, 0.6, 'metal', F_SOLID | F_SHOOT);
  ceilingLight(L, -24.5, DEP + 2.9, 16.4, { type: 'cage', intensity: 6, flicker: 0.3 });
  sign(L, 'SERVICE STAIR →', c.x1 - 0.17, DEP + 2.55, 16.3, -Math.PI / 2, 1.4, 0.3, { bg: '#e8c020', fg: '#101010' });
  // drive legs + bogie under the bridge
  for (const [lx, lz] of [[GATE_X, 10.5], [GATE_X, 16.4]]) {
    L.box(lx - 0.45, 0, lz - 0.35, lx + 0.45, DEP - 0.8, lz + 0.35, 'metal', { tint: 0x9a9ea0 });
  }
  L.box(GATE_X - 1.7, 0, 9.7, GATE_X + 1.7, 1.0, 11.3, 'paintedYellow', { tint: 0xc8a020 });
  for (const s of [-1, 1]) P.pipe(L, GATE_X + s * 1.2, 0.5, 9.85, GATE_X + s * 1.2, 0.5, 11.15, 0.48, 'rubber', 0x151515);
  // ---------------------------------------------------- service stair (down to the apron, +x)
  L.stairs(STAIR.x0, STAIR.z0, STAIR.x1, STAIR.z1, 0, DEP, '-x', 'diamond', { tint: 0x9a9e9a });
  for (const zz of [STAIR.z0 - 0.08, STAIR.z1 + 0.08]) {
    L.clip(STAIR.x0, 0.2, zz - 0.07, STAIR.x1 - 0.3, DEP + 1.2, zz + 0.07, F_SOLID | F_NONAV);
    const P0 = [STAIR.x1 - 0.2, 1.15, zz], P1 = [STAIR.x0, DEP + 1.0, zz];
    P.pipe(L, P0[0], P0[1], zz, P1[0], P1[1], zz, 0.03, 'metalDark');
    P.pipe(L, P0[0], P0[1] - 0.5, zz, P1[0], P1[1] - 0.5, zz, 0.02, 'metalDark');
    for (let k = 0; k <= 6; k++) { const t = k / 6; const px = P0[0] + (P1[0] - P0[0]) * t, py = P0[1] + (P1[1] - P0[1]) * t; L.box(px - 0.03, py - 1.0, zz - 0.03, px + 0.03, py, zz + 0.03, 'metalDark', NC); }
  }
  L.reverb(bx0, DEP, zg, c.x1, DEP + 3, c.z1, 'room');

  // ================================================================ facade (ground level)
  const doorOps = HALLS.map((h) => ({ a: h.door[0], b: h.door[1], y0: 0, y1: 4.2 }));
  L.wallX(TERM.x0, TERM.x1, fz - 0.15, 0, DEP - 0.3, 'concreteDark', 0.3, doorOps, { tint: 0x8a8680 });
  // exclude the gate/lounge span from the facade glass; slab edge band
  B.box(TERM.x0, DEP - 0.45, fz - 0.05, TERM.x1, DEP + 0.25, fz + 0.25, 'concrete', { tint: 0x9a968e });
  B.box(TERM.x0, TERM.roof - 0.9, fz - 0.05, TERM.x1, TERM.roof + 0.4, fz + 0.3, 'concrete', { tint: 0x8a867e });
  B.box(TERM.x0, TERM.roof + 0.4, fz - 0.05, TERM.x1, TERM.roof + 0.55, fz + 0.4, 'metalDark');
  // glass curtain wall + lit interior backdrop elsewhere on the departure level
  const glassSpans = [[TERM.x0, SAFE.x0 - 0.1], [LOUNGE.x1 + 0.1, TERM.x1]];
  for (const [a, b] of glassSpans) {
    B.box(a, DEP + 0.25, fz - 0.06, b, TERM.roof - 0.9, fz - 0.02, 'glassDirty', { tint: 0x2a3440 });
    for (let x = a; x <= b; x += 3) B.box(x - 0.08, DEP + 0.25, fz - 0.05, x + 0.08, TERM.roof - 0.9, fz + 0.18, 'metalDark', { tint: 0x2a2e32 });
    for (const yy of [DEP + 2.9, DEP + 5.2]) B.box(a, yy, fz - 0.05, b, yy + 0.1, fz + 0.12, 'metalDark', { tint: 0x2a2e32 });
    // interior: floor, back wall, ceiling light strips (power out in places)
    B.box(a, DEP - 0.3, fz - 9, b, DEP, fz - 0.3, 'carpetGray', { tint: 0x4a505a });
    B.box(a, DEP, fz - 9.2, b, TERM.roof - 1, fz - 9, 'plaster', { tint: 0x6a665e });
    B.box(a, TERM.roof - 1.3, fz - 9, b, TERM.roof - 1.2, fz - 0.3, 'ceiling', { tint: 0x5a5a58 });
    for (let x = a + 2; x < b - 2; x += 6) {
      const r = rng();
      if (r < 0.35) continue;
      B.box(x - 1.2, TERM.roof - 1.34, fz - 6.5, x + 1.2, TERM.roof - 1.3, fz - 2.5, r < 0.8 ? 'emissiveCool' : 'emissiveWarm');
      if (rng() < 0.3) B.box(x - 1.6, DEP + 2.2, fz - 8.95, x + 1.6, DEP + 3.4, fz - 8.9, 'emissiveWarm');
      if (rng() < 0.4) for (let k = 0; k < 4; k++) B.box(x - 2 + k * 0.7, DEP, fz - 5 - rng(), x - 1.5 + k * 0.7, DEP + 0.9, fz - 4.5 - rng(), 'fabricBlue', { tint: 0x2a3a5a });
    }
  }
  // spandrel panels above the safe room / lounge, cladding around the safe-room windows
  B.box(SAFE.x0 - 0.1, DEP + 3.2, fz - 0.3, SAFE.x1, TERM.roof - 0.9, fz + 0.02, 'metal', { tint: 0x3a3e44 });
  B.box(LOUNGE.x0, DEP + LOUNGE.h, fz - 0.3, LOUNGE.x1 + 0.1, TERM.roof - 0.9, fz + 0.02, 'metal', { tint: 0x3a3e44 });
  for (const [a, b] of [[SAFE.x0 - 0.1, -43.1], [-40.7, -39.5], [-37.3, SAFE.x1]]) B.box(a, DEP, fz + 0.001, b, DEP + 3.2, fz + 0.05, 'metal', { tint: 0x4a4e54 });
  for (const [a, b] of [[-43.1, -40.7], [-39.5, -37.3]]) { B.box(a, DEP, fz + 0.001, b, DEP + 0.95, fz + 0.05, 'metal', { tint: 0x4a4e54 }); B.box(a, DEP + 2.5, fz + 0.001, b, DEP + 3.2, fz + 0.05, 'metal', { tint: 0x4a4e54 }); }
  // rooftop plant
  for (let x = TERM.x0 + 8; x < TERM.x1 - 8; x += 17) {
    B.box(x, TERM.roof, -24, x + 5, TERM.roof + 2.4, -18, 'metal', { tint: 0x7a7e80 });
    if (rng() < 0.5) B.box(x + 7, TERM.roof, -14, x + 9, TERM.roof + 1.4, -12, 'metalDark');
  }
  B.box(TERM.x0, TERM.roof - 0.3, TERM.z0, TERM.x1, TERM.roof, fz, 'roof', { tint: 0x5a5a58 });
  // METRO INTERNATIONAL channel letters over the glass
  sign(L, 'METRO INTERNATIONAL', 12, TERM.roof + 1.9, fz + 0.05, 0, 30, 2.3, { fg: '#e0ecff', glow: true, lightColor: 0xa8c0ff, lightIntensity: 8, font: 'bold 90px Arial, sans-serif' });
  sign(L, 'CONCOURSE C', -60, TERM.roof - 0.4, fz + 0.3, 0, 7, 0.9, { fg: '#f0d040', glow: true, lightColor: 0xf0d040, lightIntensity: 3 });
  // ---------------------------------------------------- ground level: baggage halls
  S.halls = [];
  HALLS.forEach((h, i) => {
    const hz0 = -16, hz1 = fz - 0.3;
    room(L, { x0: h.x0, z0: hz0, x1: h.x1, z1: hz1, y: 0, h: 5.4, floor: 'concreteFloor', ceil: 'concreteDark', wall: 'concreteDark', walls: { n: {}, e: {}, w: {}, s: false }, light: false, trim: false });
    const dx = (h.door[0] + h.door[1]) / 2;
    // half-open roll-up door
    L.box(h.door[0], 2.75, fz - 0.4, h.door[1], 4.2, fz - 0.28, 'metal', { tint: 0x8a8e88 });
    for (let k = 0; k < 9; k++) L.box(h.door[0], 2.8 + k * 0.16, fz - 0.27, h.door[1], 2.83 + k * 0.16, fz - 0.25, 'metalDark', NC);
    L.box(h.door[0] - 0.2, 0, fz - 0.05, h.door[0], 4.3, fz + 0.1, 'paintedYellow', { tint: 0xc8a020, collide: false });
    L.box(h.door[1], 0, fz - 0.05, h.door[1] + 0.2, 4.3, fz + 0.1, 'paintedYellow', { tint: 0xc8a020, collide: false });
    sign(L, `BAGGAGE MAKE-UP  C${i + 1}`, dx, 4.75, fz + 0.03, 0, 3.4, 0.45, { bg: '#1a2230', fg: '#f0f0e8' });
    stencil(L, 'NO ENTRY', dx + 3.9, 1.6, fz + 0.03, 0, 1.3, 0.35, '#d8d8c8');
    // inside: conveyors, carts, luggage, red emergency light
    P.conveyor(L, dx, 0, -12.5, 0, h.x1 - h.x0 - 3, 0.7, { bags: true });
    P.baggageCart(L, h.x0 + 2.2, 0, -8.4, 0.2, { loaded: true });
    P.luggagePile(L, h.x1 - 2.5, 0, -8, 6, 1.0);
    L.light(dx, 4.6, -10, 0xff3020, 5, 10, { flicker: 0.3 });
    L.box(dx - 0.2, 5.1, -15.95, dx + 0.2, 5.3, -15.85, 'emissiveRed', NC);
    L.reverb(h.x0, 0, hz0, h.x1, 5.4, hz1, 'room');
    S.halls.push({ x0: h.x0 + 1, x1: h.x1 - 1, z0: hz0 + 1, z1: -9.5 });
    // wall lamp over the door
    L.box(dx - 0.25, 5.0, fz, dx + 0.25, 5.15, fz + 0.2, 'emissiveWarm', NC);
    L.light(dx, 4.8, fz + 1.2, 0xffc890, 8, 11, { flicker: i === 1 ? 0.5 : 0.05 });
  });
  // service doors and details along the ground floor
  for (const x of [-68, -30, -6, 24, 40, 84]) {
    L.box(x - 0.55, 0, fz - 0.02, x + 0.55, 2.2, fz + 0.04, 'metal', { tint: 0x5a6a7a, collide: false });
    L.box(x - 0.2, 2.35, fz, x + 0.2, 2.5, fz + 0.18, 'emissiveWarm', NC);
  }
  for (const [x, t] of [[-36, 'GATE C4'], [26, 'GATE C5'], [48, 'GATE C6']]) sign(L, t, x, 5.2, fz + 0.03, 0, 1.6, 0.4, { bg: '#1a2230', fg: '#f0d040' });
  posterWall(L, -20, 1.5, fz + 0.03, 0, 2.6, 1.6, { kinds: ['evac', 'quarantine', 'flyer'] });
  poster(L, 'quarantine', 32, 1.6, fz + 0.03, 0, 0.8, 1.0, { torn: 0.3 });
  graffiti(L, 'PLANE LEAVES\nAT DAWN?', 16.5, 1.7, fz + 0.03, 0, 2.2, 0.9, '#e8d8c0');
  graffiti(L, 'THEY CAME\nOFF THE PLANES', -40, 1.7, fz + 0.03, 0, 2.6, 1.0, '#b01810');
  // other gates' jet bridges (retracted, over the service road)
  for (const x of [26, 48, -62]) {
    P.jetBridge(L, x, 0, fz, Math.PI, 13, { floorY: DEP });
  }
  B.build(L);
  L.reverb(TERM.x0, 0, TERM.z0, TERM.x1, TERM.roof, fz - 0.3, 'room');
  return S;
}
