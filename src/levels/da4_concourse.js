// Dead Air 4 — Concourse C (departure level, y = YD). A 100 m long, 6 m tall
// hall: gate holdrooms C1-C5 along the apron glass (seat rows, podiums,
// hanging gate boards), a food court and shops on the landside wall, a fire
// shutter that came down across the concourse at x -3 (the way round is the
// C3 jet bridge, the tarmac and the C4 bridge), restrooms, the SKYLINE CLUB
// lounge (a Witch cries in the dark behind its glass), the army's CEDA
// processing post and the end safe room in the corner overlooking the apron.
import * as THREE from 'three';
import { P, sign, graffiti, poster, posterWall, wallMessages, safeRoom, supplies, physProp, stencil } from './kit.js';
import { Door } from '../world/dynamic.js';
import { DF } from '../render/decals.js';
import { ebsScreen, neonSign } from './da_parts.js';
import { shelving, cashRegister, diner_table, drinkMachine, cot, medCrate, tent, locker } from './ch3_props.js';
import { ceilingPipes } from './clutter.js';
import { YD, CON, GATES, SHUTTER_X, SAFE } from './da4_layout.js';
import { rng, NC, wayfind, notice, curtainMat, column, body, strewLuggage, flightBoard, trail, panelLight, hangingSign, banner, ADS4, F_SOLID, F_NONAV, F_SHOOT, F_SIGHT } from './da4_parts.js';

const { x0: X0, x1: X1, z0: Z0, z1: Z1 } = CON;
const TOP = YD + 6;              // ceiling underside (12.4)
const SH = YD + 3.6;             // shop ceilings
const MASS = F_SOLID | F_SHOOT | F_SIGHT | F_NONAV;
const CT = 0.93;                 // counter top

// Roll-down security grille: side rails + header; curtain from the top down to gh above the floor.
function grille(L, cx, z, w, gh) {
  for (const s of [-1, 1]) L.box(cx + s * w / 2 - 0.06, YD, z - 0.06, cx + s * w / 2 + 0.06, YD + 3.5, z + 0.06, 'metalDark', { tint: 0x4a4e52, collide: false });
  L.box(cx - w / 2 - 0.1, YD + 3.4, z - 0.25, cx + w / 2 + 0.1, YD + 3.75, z + 0.08, 'metalDark', { tint: 0x3a3e42, collide: false });
  if (gh >= 3.3) return;
  L.box(cx - w / 2, YD + gh, z - 0.02, cx + w / 2, YD + 3.4, z + 0.02, 'metal', { tint: 0x8a8e8a, collide: false });
  for (let y = YD + gh + 0.12; y < YD + 3.4; y += 0.14) L.box(cx - w / 2, y, z - 0.035, cx + w / 2, y + 0.025, z + 0.035, 'metalDark', { tint: 0x5a5e62, collide: false });
  L.box(cx - w / 2, YD + gh, z - 0.05, cx + w / 2, YD + gh + 0.06, z + 0.05, 'metalDark', { tint: 0x2a2c30, collide: false });
}
export const GATE_DOOR = { C3: GATES.C3, C4: GATES.C4 };

export function buildConcourse(L, game, S) {
  shell(L, game, S);
  gates(L, game, S);
  shutter(L, game, S);
  foodCourt(L, game);
  shops(L, game);
  westSide(L, game, S);
  endRoom(L, game, S);
  lighting(L, game);
}

// Apron curtain wall with gate doorways (explicit panes, mullions at bays and jambs).
function facadeGlass(L, x0, x1, z, y0, y1, doors = [], step = 3) {
  const gm = curtainMat();
  const cuts = [x0];
  for (let x = x0 + step; x < x1 - 0.01; x += step) cuts.push(x);
  for (const [a, b] of doors) cuts.push(a, b);
  cuts.push(x1);
  const xs = [...new Set(cuts.map((v) => +v.toFixed(3)))].sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1];
    const d = doors.find(([p, q]) => a >= p - 0.01 && b <= q + 0.01);
    const gy = d ? y0 + d[2] : y0;
    L.box(a, gy, z - 0.015, b, y1, z + 0.015, gm, { flags: F_SOLID, surf: 'glass' });
  }
  for (const x of xs) {
    const inDoor = doors.some(([p, q]) => x > p + 0.02 && x < q - 0.02);
    const b0 = inDoor ? y0 + 2.3 : y0;
    L.box(x - 0.05, b0, z - 0.12, x + 0.05, y1, z + 0.12, 'metalDark', { tint: 0x3a3e44, collide: !inDoor });
  }
  for (const ty of [y0 + 2.3, y0 + 4.4]) if (ty < y1) L.box(x0, ty - 0.05, z - 0.1, x1, ty + 0.05, z + 0.1, 'metalDark', { tint: 0x3a3e44, collide: false });
  L.box(x0, y0, z - 0.14, x1, y0 + 0.08, z + 0.14, 'metalDark', { tint: 0x2a2c30, collide: false });
}

// ================================================================ SHELL
function shell(L, game, S) {
  // floor: carpet along the holdrooms, terrazzo walkway (the safe room builds its own)
  L.floor(SAFE.x1, Z0, X1, -30, YD, 'carpetBlue', 0.3, { tint: 0x7a8494 });
  L.floor(X0, SAFE.z1, SAFE.x1, -30, YD, 'carpetBlue', 0.3, { tint: 0x7a8494 });
  L.floor(X0, -30, X1, Z1, YD, 'marble', 0.3, { tint: 0xa8a49a });
  for (const z of [-29.9, -14.2]) L.box(X0, YD, z - 0.12, X1, YD + 0.004, z + 0.12, 'marble', { collide: false, tint: 0x2e3a4a });
  // solid mass under the departure level (no nav, no spawns) + apron-side base wall
  L.box(X0, 0, Z0, X1, YD - 0.3, Z1, 'concrete', { visible: false, flags: MASS });
  L.box(X0 - 0.3, 0, Z0 - 0.3, X1, YD - 0.3, Z0, 'concreteDark', { tint: 0x7a766e });
  L.box(X0 - 0.3, YD - 0.3, Z0 - 0.5, X1, YD + 0.02, Z0 - 0.14, 'metalDark', { tint: 0x2a2c30 });
  // apron glass (the safe room has its own wall; glass continues above it)
  const doors = Object.values(GATES).map((gx) => [gx - 0.75, gx + 0.75, 2.3]);
  facadeGlass(L, SAFE.x1, X1, Z0, YD, TOP, doors);
  facadeGlass(L, X0, SAFE.x1, Z0, YD + 3.4, TOP, [], 2.5);
  // landside wall, west end wall, the east wall north of the atrium
  L.box(X0 - 0.3, YD - 0.3, Z1, X1 - 0.3, TOP + 0.4, Z1 + 0.3, 'plaster', { tint: 0xc8c4bc });
  L.box(X0 - 0.3, YD - 0.3, SAFE.z1, X0, TOP + 0.4, Z1, 'plaster', { tint: 0xc8c4bc });
  L.box(X0 - 0.3, YD + 3.2, Z0 - 0.3, X0, TOP + 0.4, SAFE.z1, 'plaster', { tint: 0xc8c4bc });
  L.box(X1 - 0.3, YD - 0.3, Z0 - 0.3, X1, TOP + 0.4, -34.3, 'plaster', { tint: 0xc8c4bc });
  // roof + ceiling: dark acoustic deck, white box trusses, linear light troughs
  L.box(X0 - 0.3, TOP, Z0 - 0.3, X1 - 0.3, TOP + 0.5, Z1 + 0.3, 'concreteDark', { tint: 0x5a5a5e, flags: MASS });
  for (let x = X0 + 4; x < X1; x += 8) {
    L.box(x - 0.16, TOP - 0.4, Z0, x + 0.16, TOP, Z1, 'paintedWhite', { collide: false, tint: 0xb4b8ba });
    L.box(x - 0.08, TOP - 1.6, Z0, x + 0.08, TOP - 1.45, Z1, 'paintedWhite', { collide: false, tint: 0xb4b8ba });
    for (let z = Z0 + 1; z < Z1 - 1; z += 2.4) L.part('box', x, TOP - 0.92, z + 1.2, 0.07, 1.5, 0.07, 'paintedWhite', { rx: (Math.round(z * 10) % 2 ? 1 : -1) * 0.8, tint: 0xb4b8ba });
  }
  // columns along the holdroom edge
  for (let x = X0 + 16; x < X1 - 2; x += 16) if (Math.abs(x - SHUTTER_X) > 2) column(L, x, -30.4, YD, TOP, 0.42, { tint: 0xd8d4cc });
  L.reverb(X0, YD, Z0, X1, TOP, Z1, 'hall');
  L.ambience(X0, YD - 0.5, Z0, X1, TOP, Z1, 'apartments');
}

// gate podium (staff side toward the window) with a monitor and boarding-pass reader
function podium(L, x, z) {
  const p = P.prop(L, x, YD, z, 0);
  p.rbox(0, 0.52, 0, 1.8, 1.04, 0.62, 0.03, 'plastic', 0x3a4a5a).box(0, 1.06, 0, 1.9, 0.04, 0.7, 'marble', 0xd8d4cc);
  p.box(0, 0.55, 0.316, 1.6, 0.8, 0.01, 'metalClean', 0x9aa0a4);
  p.box(-0.4, 1.3, -0.1, 0.5, 0.36, 0.05, 'plastic', 0x1a1a1a).glow(-0.4, 1.3, -0.075, 0.44, 0.3, 0.005, 0x243446);
  p.box(0.45, 1.13, -0.05, 0.22, 0.1, 0.16, 'plastic', 0x2a2a2a).glow(0.45, 1.19, -0.05, 0.08, 0.005, 0.08, 0x3a1010);
  p.col(0, 0.55, 0, 1.9, 1.1, 0.7, 'wood');
  return p;
}

// ================================================================ GATES
function gates(L, game, S) {
  const info = {
    C1: ['SA 212  ·  BAYPORT', 'CANCELLED', 'SEE MILITARY STAFF'], C2: ['FN 480  ·  RIVERTON', 'BOARDING CLOSED', 'AIRCRAFT NOT CLEARED'],
    C3: ['EVAC 7  ·  MILITARY', 'DEPARTED', 'CEDA PRIORITY ONLY'], C4: ['TM 116  ·  PORT ELLIS', 'CANCELLED', 'SEE AGENT'], C5: ['EVAC 9  ·  MILITARY', 'DELAYED', 'REPORT TO CEDA DESK'],
  };
  S.gateDoors = {};
  for (const [name, gx] of Object.entries(GATES)) {
    const walk = name === 'C3' || name === 'C4';
    // door: C3 / C4 lead onto the walkable jet bridges, the others are locked (bridges retracted)
    const d = new Door(L, gx, YD, Z0, 'x', { width: 1.4, hinge: name === 'C4' ? -1 : 1, material: 'metal', locked: !walk });
    if (!walk) d.usable.enabled = false;
    S.gateDoors[name] = d;
    L.box(gx - 0.85, YD + 2.3, Z0 - 0.14, gx + 0.85, YD + 2.62, Z0 + 0.14, 'metalDark', { tint: 0x2a2c30, collide: false });
    sign(L, name, gx, YD + 2.46, Z0 + 0.16, 0, 0.6, 0.26, { bg: '#16191e', fg: '#f2c230', clean: true });
    // gate board hanging over the door, podium, seat rows facing the apron
    const [fl, st, nt] = info[name];
    flightBoard(L, gx, YD + 3.6, Z0 + 1.2, 0, 2.2, 1.2, { kind: 'gate', gate: name, flight: fl, status: st, note: nt, hang: TOP - (YD + 3.6) - 0.6, light: false, bright: 1.1 });
    hangingSign(L, `GATE  ${name}`, gx, YD + 4.4, Z0 + 3.6, 0, 1.8, 0.45, TOP);
    podium(L, gx + 2.4, Z0 + 2.2);
    const rows = name === 'C5' ? [-33.2, -30.8] : name === 'C4' ? [-35.4] : [-35.6, -33.2];
    for (const [i, rz] of rows.entries()) for (const off of [-4.6, 4.6]) {
      if (name === 'C5' && off > 0 && i === 0) continue;
      const n = 5 + (i % 2);
      P.seatingRow(L, gx + off, YD, rz, 0, n, { double: i === 0, color: [0x2a3a5a, 0x3a3a3a, 0x2a4a4a][(gx | 0) & 1 ? 0 : 2] });
    }
    strewLuggage(L, gx - 6, -40, gx + 6, -31, YD, 4);
    if (walk) {
      notice(L, name === 'C3' ? 'BRIDGE C3\nSTAIRS TO APRON' : 'BRIDGE C4', gx - 1.2, YD + 1.6, Z0 + 0.14, 0, 0.6, 0.36, { bg: '#e8e2d0', fg: '#1a1a1a' });
    } else {
      stencil(L, 'CLOSED', gx, YD + 1.2, Z0 + 0.07, 0, 1.0, 0.3, '#e8e0c8');
    }
  }
  // C1 / C2 dressing
  P.luggageCart(L, 45.2, YD, -38.6, 0.4, true);
  body(L, 43.4, YD, -37.8, 1.2, 0x2a3a4a);
  P.vending(L, 49.4, YD, -41.3, 0, 0x1a3a7a);
  P.vending(L, 48.2, YD, -41.3, 0, 0xb02a1a);
  ebsScreen(L, game, 30, YD + 2.4, -29.93, 0, 0.8, 0.5);
  for (const [x, z] of [[29.4, -40.8], [13.6, -40.8], [-4.6, -40.4]]) P.trashCan(L, x, YD, z);
  body(L, 20.4, YD, -38.8, 2.4, 0x6a2a2a);
  body(L, 25.6, YD, -32.2, 0.3, 0x3a3a3a);
  trail(L, 20.4, -38.8, 16.8, -34.4, YD, 6);
  P.wheelchair(L, 17.8, YD, -40.4, 0.6);
  // C3 holdroom: the army's evacuation gate (sandbag chicane, crates, dead soldier)
  P.sandbags(L, 2.2, YD, -38.2, Math.PI / 2, 2.6, 3);
  P.sandbags(L, 9.8, YD, -38.2, Math.PI / 2, 2.6, 3);
  medCrate(L, 12.8, YD, -39.6, 0.4, 1);
  body(L, 8.4, YD, -36.2, 2.8, 0x4a5a3a);
  L.item('ammo', 12.6, YD + 0.02, -38.4);
  sign(L, 'MILITARY EVACUATION\nCEDA PRIORITY PASSENGERS ONLY', 6, YD + 3.0, Z0 + 0.16, 0, 2.4, 0.6, { bg: '#e8e2d0', fg: '#8a1a14' });
  graffiti(L, 'TARMAC\nTHIS WAY →', 3.6, YD + 1.6, Z0 + 0.16, 0, 1.3, 0.7, '#e8e0c8', { style: 'scrawl' });
  graffiti(L, 'SAFE ROOM\nGATE C5 ←', -7.6, YD + 1.7, Z0 + 0.16, 0, 1.4, 0.7, '#e8e0c8');
  S.gateTriggerC3 = [0, YD - 0.5, -42, 12, YD + 3, -30];
}

// ================================================================ FIRE SHUTTER (x -3)
function shutter(L, game, S) {
  const x = SHUTTER_X;
  L.box(x - 0.2, YD + 4.2, Z0, x + 0.2, TOP, Z1, 'plaster', { tint: 0xc4c0b8 });
  L.box(x - 0.08, YD, Z0 + 0.12, x + 0.08, YD + 4.2, Z1, 'metal', { tint: 0x8a8e8e, surf: 'metal' });
  for (const s of [-1, 1]) {
    for (let y = YD + 0.2; y < YD + 4.2; y += 0.16) L.box(x + s * 0.08, y, Z0 + 0.12, x + s * 0.095, y + 0.03, Z1, 'metalDark', { collide: false, tint: 0x5a5e62 });
    for (let z = Z0 + 0.5; z < Z1; z += 1.2) L.box(x + s * 0.08, YD, z, x + s * 0.11, YD + 0.12, z + 0.6, 'paintedYellow', { collide: false, tint: z % 2.4 < 1.2 ? 0xc8a020 : 0x141414 });
    L.box(x + s * 0.2, YD + 4.2, Z0, x + s * 0.4, YD + 4.6, Z1, 'metalDark', { collide: false, tint: 0x2a2c30 });
    sign(L, 'FIRE DOOR\nKEEP CLEAR', x + s * 0.11, YD + 2.2, -22, s * Math.PI / 2, 1.6, 0.6, { bg: '#b01e18', fg: '#ffffff', clean: true });
    for (let i = 0; i < 3; i++) L.decal(x + s * 0.1, YD + 0.6 + rng() * 2, -34 + rng() * 26, s, 0, 0, 1.2 + rng(), DF.SCORCH);
  }
  // soot + debris on the east face (the fire was on the other side)
  graffiti(L, 'JAMMED\nGO AROUND\nBRIDGE C3', x + 0.12, YD + 1.5, -35.8, Math.PI / 2, 1.4, 0.9, '#e8e0c8');
  graffiti(L, 'FIRE ON\nOTHER SIDE\nDONT OPEN', x - 0.12, YD + 1.6, -12, -Math.PI / 2, 1.4, 0.9, '#b8201a');
  body(L, x + 0.8, YD, -18, 1.6, 0x3a2a2a);
  P.debris(L, x + 1.2, YD, -26, 1.2, 'concrete', 6);
  const strobe = L.light(x + 0.6, YD + 4.9, -22, 0xff3020, 0, 10, { priority: 0.3 });
  const sm = new THREE.MeshBasicMaterial({ color: 0x200000, toneMapped: false });
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.22), sm); m.position.set(x + s * 0.42, YD + 4.9, -22); L.addObject(m); }
  L.dynamics.push({ t: 0, update(dt) { this.t += dt; const on = (this.t % 1.4) < 0.12; strobe.intensity = on ? 14 : 0; sm.color.setRGB(on ? 4 : 0.12, on ? 0.6 : 0, 0); } });
  S.shutterTrigger = [x + 0.3, YD - 0.5, -40, x + 8, YD + 3, -8];
}

// ================================================================ FOOD COURT (x 8..30, south)
const STALLS = [
  { x0: 8, x1: 14.6, name: 'HANGAR BURGERS', neon: '#ff5a2a', bg: '#2a1208' },
  { x0: 14.6, x1: 21.8, name: 'PACIFIC WOK', neon: '#ff2a3a', bg: '#1a0808' },
  { x0: 21.8, x1: 30, name: 'CAFE ALTITUDE', neon: '#40d8ff', bg: '#081820' },
];
function foodCourt(L, game) {
  const zf = -11;   // counter line
  for (const [i, st] of STALLS.entries()) {
    const cx = (st.x0 + st.x1) / 2, w = st.x1 - st.x0;
    L.floor(st.x0, zf, st.x1, Z1, YD + 0.02, 'tileChecker', 0.02, { tint: 0xa8a8a0 });
    L.ceiling(st.x0, zf - 0.6, st.x1, Z1, SH, 'ceiling', 0.2, { flags: MASS });
    L.wallZ(zf - 0.6, Z1, st.x0, YD, SH, 'tileWhite', 0.2);
    L.box(st.x0, SH, zf - 0.8, st.x1, SH + 0.9, zf - 0.6, 'metalDark', { tint: 0x1a1c20 });
    neonSign(L, st.name, cx, SH + 0.45, zf - 0.82, 0, Math.min(w - 0.6, 5.6), 0.62, st.neon);
    // counter with register, menu boards, kitchen line behind
    P.counter(L, cx - 0.8, YD, zf + 0.4, 0, w - 2.6, 'plastic');
    cashRegister(L, cx - 1.4, YD + CT, zf + 0.35, Math.PI);
    L.box(st.x1 - 1.2, YD, zf + 0.1, st.x1 - 0.1, YD + 1.02, zf + 0.7, 'metalClean', { tint: 0x9aa0a4 });
    for (let k = 0; k < 3; k++) flightBoard(L, st.x0 + w * (k + 0.5) / 3, SH - 0.55, Z1 - 0.02, Math.PI, w / 3 - 0.2, 0.7, { kind: 'gate', title: st.name, flight: ['#1 COMBO', '#2 SPECIAL', '#3 FAMILY'][k], status: '$' + (6 + ((i * 3 + k) % 5)) + '.99', note: 'SOLD OUT', frame: false, light: false, bright: 0.8, seed: 70 + i * 3 + k });
    P.kitchenRange(L, st.x0 + 1.4, YD, Z1 - 0.8, Math.PI, 1.8);
    P.exhaustHood(L, st.x0 + 1.4, SH - 1.2, Z1 - 0.8, Math.PI, 2.0);
    P.fryer(L, st.x0 + 2.8, YD, Z1 - 0.7, Math.PI);
    drinkMachine(L, st.x1 - 1.2, YD, Z1 - 0.6, Math.PI);
    P.steelTable(L, cx, YD, zf + 2.6, 0, 2.2, 0.7);
    // grilles: the first stall is shut, the others half down / up
    const gh = [0, 1.4, 2.4][i];
    grille(L, cx, zf - 0.62, w - 0.2, gh);
    if (i === 0) L.box(st.x0 + 0.1, YD, zf - 0.66, st.x1 - 0.1, YD + 3.4, zf - 0.6, 'metal', { visible: false });
    L.light(cx, SH - 0.3, zf + 1.6, i === 2 ? 0xa8d8ff : 0xffc890, i === 0 ? 3 : 7, 7, { flicker: i === 1 ? 0.5 : 0.1 });
  }
  // seating: tables with chairs, trays, spilled food, a knocked-over high chair
  const r = rng;
  for (let x = 9.5; x < 29; x += 3.2) for (let z = -26.5; z < -14; z += 3.0) {
    if (r() < 0.18) continue;
    diner_table(L, x + (r() - 0.5) * 0.5, YD, z + (r() - 0.5) * 0.5, r() * 0.6, 2 + Math.floor(r() * 3));
    if (r() < 0.45) { const p = P.prop(L, x, YD + 0.76, z, r() * 3); p.box(0, 0.01, 0, 0.42, 0.02, 0.3, 'plastic', [0x8a2a1a, 0x2a4a6a, 0x3a3a3a][Math.floor(r() * 3)]); }
  }
  for (const [x, z] of [[8.6, -13], [29.4, -13]]) P.trashCan(L, x, YD, z);
  P.trashBags(L, 29.2, YD, -12.2, 4);
  for (let i = 0; i < 4; i++) physProp(L, i % 2 ? 'chair' : 'bottle', 11 + i * 4.5, YD, -22.6 + (i % 2) * 3);
  for (const [x, z, rr, c] of [[12.6, -18, 0.9, 0x6a4a2a], [24.2, -24.4, 2.2, 0x2a2a3a]]) body(L, x, YD, z, rr, c);
  wayfind(L, 'FOOD COURT', 18.3, SH + 1.5, zf - 0.72, 0, 3.2, 0.5);
  L.item('pills', 21.6, YD + CT, zf + 0.4, { chance: 0.5 });
  L.item('molotov', 25.2, YD + CT, zf + 0.4, { chance: 0.6 });
}

// ================================================================ SHOPS (x 30..51, south)
const SHOPS = [
  { x0: 30, x1: 36.4, name: 'NEWBURG NEWS', fg: '#ffffff', bg: '#1a3a7a', kind: 'store', grille: 0 },
  { x0: 36.4, x1: 43, name: 'SKY DUTY FREE', fg: '#e8d090', bg: '#1a1a1a', kind: 'store', grille: 3.4 },
  { x0: 43, x1: 48.4, name: 'TRAVEL TECH', fg: '#40e0ff', bg: '#101418', kind: 'tv', grille: 1.1 },
];
function shops(L, game) {
  const zf = -12;
  L.wallZ(zf, Z1, SHOPS[0].x0, YD, SH, 'plaster', 0.2, [], { tint: 0xb8b4ac });
  L.wallZ(zf, Z1, SHOPS[2].x1, YD, SH, 'plaster', 0.2, [], { tint: 0xb8b4ac });
  for (const [i, sh] of SHOPS.entries()) {
    const cx = (sh.x0 + sh.x1) / 2, w = sh.x1 - sh.x0;
    L.floor(sh.x0, zf, sh.x1, Z1, YD + 0.02, 'woodFloor', 0.02, { tint: 0x9a8a78 });
    L.ceiling(sh.x0, zf - 0.2, sh.x1, Z1, SH, 'ceiling', 0.2, { flags: MASS });
    if (i > 0) L.wallZ(zf, Z1, sh.x0, YD, SH, 'plaster', 0.2, [], { tint: 0xb8b4ac });
    L.box(sh.x0, SH, zf - 0.4, sh.x1, SH + 0.9, zf - 0.2, 'metalDark', { tint: 0x16181c });
    sign(L, sh.name, cx, SH + 0.45, zf - 0.42, 0, w - 1.0, 0.6, { bg: sh.bg, fg: sh.fg, clean: true, glow: 0.8, light: false });
    // shopfront: glass either side of a 2.4 m entrance; grille height varies
    const e0 = cx - 1.2, e1 = cx + 1.2;
    for (const [a, b] of [[sh.x0 + 0.1, e0], [e1, sh.x1 - 0.1]]) {
      L.box(a, YD, zf - 0.015, b, YD + 0.4, zf + 0.015, 'metalDark', { tint: 0x2a2c30 });
      L.box(a, YD + 0.4, zf - 0.012, b, SH, zf + 0.012, curtainMat(), { flags: F_SOLID, surf: 'glass' });
    }
    grille(L, cx, zf - 0.22, 2.6, sh.grille);
    if (sh.grille < 2.0) L.box(e0, YD, zf - 0.24, e1, YD + 3.4, zf - 0.2, 'metal', { visible: false });
    // interior shelving
    for (let k = 0; k < 2; k++) shelving(L, sh.x0 + 1.4 + k * (w - 2.8), YD, -6.2, 0, 1.8, sh.kind, 0.5);
    shelving(L, cx, YD, -8.4, Math.PI / 2, 2.0, sh.kind === 'tv' ? 'tv' : 'store', 0.5);
    P.counter(L, sh.x1 - 1.2, YD, zf + 1.4, Math.PI / 2, 1.8, 'wood');
    cashRegister(L, sh.x1 - 1.2, YD + CT, zf + 1.4, -Math.PI / 2);
    panelLight(L, cx, SH, -8, { intensity: i === 1 ? 0 : 6, on: i !== 1, range: 7, flicker: 0.3 });
  }
  // TRAVEL TECH: a wall of TVs still showing the emergency broadcast
  for (let k = 0; k < 3; k++) ebsScreen(L, game, 44.2 + k * 1.5, YD + 2.0, Z1 - 0.12, Math.PI, 1.3, 0.78);
  neonSign(L, 'OPEN', 38.2, YD + 2.4, zf + 0.05, 0, 0.8, 0.3, '#ff3a8a');
  // newsstand: magazine racks outside, newspapers everywhere
  for (let k = 0; k < 2; k++) { const p = P.prop(L, 31.4 + k * 1.4, YD, zf - 0.7, 0); p.box(0, 0.7, 0, 1.2, 1.4, 0.35, 'metalDark', 0x2a2c30); for (let r = 0; r < 4; r++) p.box(0, 0.35 + r * 0.32, -0.19, 1.1, 0.26, 0.02, 'paper', [0xc83a2a, 0x2a5a9a, 0xe8d8a0, 0x3a8a4a][(r + k) % 4], [0.2, 0, 0]); p.col(0, 0.7, 0, 1.2, 1.4, 0.35, 'wood'); }
  P.newsBox(L, 36.6, YD, zf - 0.6, 0, 0x1a3a7a);
  P.papers(L, 33, YD + 0.02, -15, 2.4, 14);
  poster(L, 'ad', 41.2, YD + 2.2, zf - 0.03, 0, 1.0, 1.4, { brand: ['NEWBURG', 'SPIRIT OF THE HARBOR', '#1a3a6a', '#e8d090'] });
  graffiti(L, 'LOOTERS\nWILL BE\nSHOT', 44.4, YD + 1.8, zf - 0.03, 0, 1.0, 0.7, '#b8201a');
  L.item('pills', 41.8, YD + CT, -11.0, { chance: 0.6 });
  L.item('adrenaline', 41.8, YD + CT, -10.2, { chance: 0.4 });
  // east end of the concourse: atrium overlook, benches, a charging pillar
  hangingSign(L, '←  GATES C1 – C5', 48, YD + 4.4, -22, Math.PI / 2, 3.2, 0.5, TOP);
  hangingSign(L, 'FOOD COURT  ·  SHOPS  ·  RESTROOMS', 34, YD + 4.4, -22, Math.PI / 2, 5.2, 0.5, TOP);
  for (const z of [-26.5, -17.5]) P.bench(L, 49.2, YD, z, -Math.PI / 2);
  body(L, 47, YD, -24.2, 1.4, 0x2a3a2a);
}

// ================================================================ WEST SIDE (beyond the shutter)
function westSide(L, game, S) {
  // restrooms x -20..-8 (MEN / WOMEN), entrance from the concourse
  const rz = -12;
  L.wallX(-20, -8, rz, YD, SH, 'tileWhite', 0.2, [{ a: -18.4, b: -17.0 }, { a: -11.0, b: -9.6 }]);
  L.wallZ(rz, Z1, -14, YD, SH, 'tileWhite', 0.2);
  L.wallZ(rz, Z1, -20, YD, SH, 'tileWhite', 0.2);
  L.wallZ(rz, Z1, -8, YD, SH, 'tileWhite', 0.2);
  L.floor(-20, rz, -8, Z1, YD + 0.02, 'tileFloor', 0.02, { tint: 0xc8c8c0 });
  L.ceiling(-20.1, rz - 0.1, -7.9, Z1, SH, 'ceiling', 0.2, { flags: MASS });
  L.box(-20.1, SH, rz - 0.3, -7.9, SH + 0.5, rz - 0.1, 'metalDark', { tint: 0x2a2c30 });
  wayfind(L, 'RESTROOMS', -14, SH + 0.25, rz - 0.32, 0, 2.4, 0.4);
  for (const [cx, lab, sgn] of [[-17.7, 'MEN', -1], [-10.3, 'WOMEN', 1]]) {
    sign(L, lab, cx, YD + 2.45, rz - 0.12, 0, 0.7, 0.24, { bg: '#1a3a7a', fg: '#ffffff', clean: true });
    // stalls along the back wall, sinks + mirror on the divider wall
    const x0 = sgn < 0 ? -20 : -14;
    for (let k = 0; k < 3; k++) {
      const sx = x0 + 0.95 + k * 1.5;
      L.box(sx + 0.7, YD, -7.2, sx + 0.74, YD + 2.0, Z1, 'plastic', { tint: 0x8a7a6a });
      P.toilet(L, sx, YD, Z1 - 0.5, Math.PI);
    }
    L.box(x0 + 0.1, YD, -7.24, x0 + 5.9, YD + 2.0, -7.2, 'plastic', { tint: 0x8a7a6a, collide: false });
    for (let k = 0; k < 2; k++) P.sink(L, (sgn < 0 ? -14.25 : -13.75), YD, -10.6 + k * 1.2, sgn < 0 ? -Math.PI / 2 : Math.PI / 2);
    L.box(sgn < 0 ? -14.13 : -13.89, YD + 1.2, -11.2, sgn < 0 ? -14.11 : -13.87, YD + 2.1, -8.8, 'chrome', { collide: false });
    L.light(cx, SH - 0.2, -9.4, 0xd8ecff, sgn < 0 ? 5 : 0, 6, { flicker: 0.7 });
  }
  L.item('pills', -16.4, YD + 0.9, -9.4, { chance: 0.6 });
  body(L, -11.8, YD, -8.6, 0.8, 0x5a3a4a);
  graffiti(L, 'WE HID IN\nHERE 3 DAYS', -8.12, YD + 1.7, -10, -Math.PI / 2, 1.2, 0.7, '#1a1a1a', { style: 'marker' });
  for (let i = 0; i < 4; i++) L.decal(-19 + rng() * 10, YD + 0.03, -11 + rng() * 6, 0, 1, 0, 0.8 + rng(), DF.BLOOD1 + (i % 4));

  // SKYLINE CLUB lounge x -38..-22, z -16..-4 (glass front, dark, the Witch)
  const vz = -16, vx0 = -38, vx1 = -22;
  L.floor(vx0, vz, vx1, Z1, YD + 0.02, 'carpet', 0.02, { tint: 0x5a3a3a });
  L.ceiling(vx0 - 0.1, vz - 0.1, vx1 + 0.1, Z1, SH, 'ceiling', 0.2, { tint: 0x8a8070, flags: MASS });
  L.wallZ(vz, Z1, vx0, YD, SH, 'wallpaper', 0.2, [], { tint: 0x8a7a6a });
  L.wallZ(vz, Z1, vx1, YD, SH, 'wallpaper', 0.2, [], { tint: 0x8a7a6a });
  for (const [a, b] of [[vx0 + 0.1, -25.6], [-23.6, vx1 - 0.1]]) {
    L.box(a, YD, vz - 0.02, b, YD + 0.3, vz + 0.02, 'woodDark');
    L.box(a, YD + 0.3, vz - 0.012, b, SH, vz + 0.012, curtainMat(), { flags: F_SOLID, surf: 'glass' });
  }
  for (let x = vx0 + 2; x < vx1; x += 2.2) if (x < -25.6 || x > -23.6) L.box(x - 0.03, YD, vz - 0.04, x + 0.03, SH, vz + 0.04, 'chrome', NC);
  L.box(vx0, SH, vz - 0.4, vx1, SH + 0.9, vz - 0.1, 'woodDark', { tint: 0x2a1a14 });
  sign(L, 'SKYLINE CLUB', -30, SH + 0.45, vz - 0.42, 0, 3.6, 0.55, { bg: '#e8e2d4', fg: '#b01e28', font: 'Georgia, serif', clean: true, glow: 0.5, light: false });
  notice(L, 'MEMBERS ONLY', -24.6, YD + 1.5, vz - 0.03, 0, 0.5, 0.2, { bg: '#e8e2d4', fg: '#1a1a1a', clean: true });
  // bar, sofas, armchairs, a piano-black TV, rugs
  P.counter(L, -36.6, YD, -8.4, Math.PI / 2, 5.0, 'marble');
  P.kitchenShelf(L, -37.6, YD, -8.4, Math.PI / 2, 2.4);
  for (const [x, z, r, c] of [[-31, -12.4, 0, 0x3a2a2a], [-27.4, -12.4, 0, 0x3a2a2a], [-29.2, -7.2, Math.PI, 0x2a2a3a], [-24.6, -8.6, -Math.PI / 2, 0x3a2a2a]]) P.sofa(L, x, YD, z, r, c);
  for (const [x, z] of [[-29.2, -9.8], [-33.2, -12.8]]) P.table(L, x, YD, z, 0, 1.2, 0.6, 'woodDark');
  P.rug(L, -29.2, YD + 0.03, -9.8, 5.0, 4.4, 0x4a2a24);
  P.tv(L, -29.2, YD, Z1 - 0.4, Math.PI);
  P.chair(L, -34.2, YD, -12.2, 2.6, 'woodDark', true);
  for (let i = 0; i < 5; i++) physProp(L, 'bottle', -36.8 + (rng() - 0.5) * 0.4, YD + 1.02, -10.4 + i * 0.8);
  supplies(L, -24.0, YD, -5.2, Math.PI, [{ type: 'medkit', chance: 0.6 }, { type: 'pills' }, { type: 'molotov', chance: 0.7 }], { w: 1.6, mat: 'woodDark' });
  body(L, -33.6, YD, -6.2, 0.7, 0x2a2a2a);
  for (let i = 0; i < 6; i++) L.decal(-34 + rng() * 10, YD + 0.034, -14 + rng() * 9, 0, 1, 0, 0.6 + rng() * 1.1, DF.BLOOD1 + (i % 4));
  L.light(-29.2, SH - 0.3, -9.6, 0xff9a60, 3.5, 8, { flicker: 0.35 });
  L.light(-36.4, YD + 1.6, -8.4, 0xffb070, 2, 4, { flicker: 0.2 });
  S.witch = { x: -31.8, y: YD + 0.03, z: -9.2 };
  L.reverb(vx0, YD, vz, vx1, SH, Z1, 'room');

  // CEDA processing post x -50..-38, z -30..-4 (the army's last desk before gate C5)
  tent(L, -45, YD, -9, 0, 6.5, 5, {});
  cot(L, -47.6, YD, -18.4, 0.1, true);
  cot(L, -45.4, YD, -18.8, -0.05, false);
  P.table(L, -43.2, YD, -24.6, 0, 2.2, 0.8, 'metalDark');
  P.table(L, -46.2, YD, -24.6, 0, 2.2, 0.8, 'metalDark');
  medCrate(L, -47.6, YD, -27.8, 0.3, 1);
  P.sandbags(L, -40.4, YD, -22, Math.PI / 2, 3.6, 3);
  for (const [x, z] of [[-43.4, -26.8], [-48.6, -22.4]]) P.bodyBag(L, x, YD, z, 0.2);
  sign(L, 'CEDA EVACUATION PROCESSING\nGATE C5 · HAVE PAPERS READY', -45, YD + 3.0, Z1 - 0.32, Math.PI, 3.4, 0.9, { bg: '#e8e2d0', fg: '#1a3a6a' });
  posterWall(L, X0 + 0.02, YD + 1.6, -14, Math.PI / 2, 3.0, 1.8, { kinds: ['missing', 'missing', 'evac', 'flyer', 'missing', 'quarantine'], seed: 4501 });
  wallMessages(L, X0 + 0.02, YD + 1.7, -26.4, Math.PI / 2, 1.6, 1.1, { lines: ['PLANE AT\nGATE C5\nNEVER CAME', 'RUNWAY\nSTILL OPEN?'], density: 1.2, seed: 4502 });
  L.item('ammo', -43.4, YD + 0.8, -24.6);
  L.item('tier2', -46.4, YD + 0.8, -24.4, { chance: 0.7 });
  L.light(-45, YD + 2.8, -24, 0xfff0d0, 5, 8, { flicker: 0.15 });
  // C4 / C5 holdrooms: the dead, a stretcher line, signage to the safe room
  for (const [x, z, r, c] of [[-16, -37.4, 0.4, 0x3a2a4a], [-21.6, -32.4, 2.2, 0x6a4a2a], [-34.8, -38.6, 1.4, 0x2a3a4a]]) body(L, x, YD, z, r, c);
  trail(L, -34.8, -38.6, -38.4, -37.2, YD, 5);
  P.luggageCart(L, -26, YD, -40.6, 1.2, true);
  hangingSign(L, '←  GATE C5', -20, YD + 4.4, -22, Math.PI / 2, 2.6, 0.5, TOP);
  hangingSign(L, 'GATES C3 – C1  →', -8, YD + 4.4, -22, Math.PI / 2, 3.0, 0.5, TOP);
  S.westTrigger = [-16, YD - 0.5, -42, -6, YD + 3, -30];
  S.c5Trigger = [-36, YD - 0.5, -42, -26, YD + 3, -26];
}

// ================================================================ END SAFE ROOM (overlooking the apron)
function endRoom(L, game, S) {
  const { x0, x1, z0, z1 } = SAFE;
  const sr = safeRoom(L, {
    x0, z0, x1, z1, y: YD, h: 3.2, doorWall: 'e', doorAt: -36.4, end: true, floor: 'carpetGray', wall: 'plasterGreen', noWalls: ['n'],
    graffiti: ['THE C-130 IS\nSTILL ON\nTHE APRON', 'PILOT ON\nCH 3', 'WE MADE IT\nTHIS FAR', 'TELL MOM\nIM OK - DAN'],
  });
  S.endDoor = sr.door;
  // north wall with two barred windows onto the apron
  L.wallX(x0, x1, z0, YD, YD + 3.2, 'plasterGreen', 0.2, [{ a: -48.8, b: -46.4, y0: YD + 1.0, y1: YD + 2.4 }, { a: -44.4, b: -42.0, y0: YD + 1.0, y1: YD + 2.4 }]);
  for (const [a, b] of [[-48.8, -46.4], [-44.4, -42.0]]) {
    L.box(a, YD + 1.0, z0 - 0.012, b, YD + 2.4, z0 + 0.012, curtainMat(), { flags: F_DEFAULT_GLASS, surf: 'glass' });
    for (let x = a + 0.3; x < b; x += 0.3) L.box(x - 0.015, YD + 1.0, z0 + 0.1, x + 0.015, YD + 2.4, z0 + 0.13, 'metalDark', { collide: false });
    L.box(a, YD + 0.96, z0 + 0.1, b, YD + 1.0, z0 + 0.24, 'metalDark', NC);
  }
  // supplies: tier 2 on the gun table, medkits, ammo
  supplies(L, -48.6, YD, -36.4, Math.PI / 2, [{ type: 'rifle', chance: 0.8 }, { type: 'autoShotgun', chance: 0.8 }, { type: 'huntingRifle', chance: 0.5 }], { w: 2.2, mat: 'metalDark' });
  for (const [k, t] of ['medkit', 'medkit', 'medkit', 'medkit'].entries()) L.item(t, -44.6 + k * 0.45, YD + 0.8, -33.1);
  P.table(L, -43.9, YD, -33.1, 0, 2.2, 0.8, 'metalDark');
  L.item('ammo', -41.2, YD + 0.02, -40.8);
  P.radioTable(L, -45.6, YD, -41.2, 0);
  cot(L, -48.7, YD, -33.6, Math.PI / 2, false);
  P.papers(L, -45, YD + 0.01, -37, 1.4, 6);
  // lived-in: the gate crew and a squad held out here (lockers, shelving of supplies, sandbagged windows, bedding, trash)
  locker(L, x0 + 0.3, YD, -40.3, Math.PI / 2, 3);
  P.metalShelf(L, -41.3, YD, -32.35, Math.PI, 1.3, 2.0, 0.85);
  P.sandbags(L, -47.6, YD, -41.45, 0, 2.2, 2);
  P.crate(L, -42.9, YD, -41.35, 0.25, 1, 'wood');
  P.crate(L, -42.8, YD + 0.8, -41.4, -0.2, 0.7, 'wood');
  medCrate(L, -41.4, YD, -38.6, -0.5, 0.8);
  cot(L, -47.1, YD, -33.1, Math.PI / 2 + 0.06, false);
  P.chair(L, -44.4, YD, -34.3, Math.PI + 0.3, 'metalDark');
  P.chair(L, -47.3, YD, -38.2, 1.2, 'metalDark', true);
  P.cooler(L, -41.2, YD, -34.9, 0.4, 0x2a5a9a, true);
  P.trashBags(L, -40.9, YD, -33.0, 2);
  P.gasCan(L, -49.4, YD, -34.8, 0.6);
  physProp(L, 'bucket', -45.9, YD, -40.6);
  for (let i = 0; i < 3; i++) physProp(L, 'bottle', -44.2 + i * 0.3, YD + 0.78, -32.85);
  for (const [x, z, r] of [[-43.5, -36.2, 0.4], [-46.2, -35.2, 2.1], [-42.1, -39.4, 1.3]]) P.papers(L, x, YD + 0.01, z, 0.6 + r * 0.2, 4);
  ceilingPipes(L, x0 + 0.2, z1 - 0.45, x1 - 0.2, z1 - 0.45, YD + 3.0, { n: 2, r: 0.05, spacing: 0.3 });
  poster(L, 'evac', x1 - 0.12, YD + 1.7, -34.2, -Math.PI / 2, 0.5, 0.72, { torn: 0.3 });
  L.flowEnd = [-45, YD, -37.2];
  S.endTrigger = [-39.8, YD - 0.5, -40, -34, YD + 3, -33];
}
const F_DEFAULT_GLASS = F_SOLID | F_SHOOT;

// ================================================================ LIGHTING
function lighting(L, game) {
  // big round pendants over the walkway (a few dead), holdroom downlights
  const pend = [[46, 12, 0.1], [34, 0, 0], [22, 14, 0.2], [10, 11, 0.6], [1, 9, 0.3], [-9, 12, 0.2], [-21, 0, 0], [-33, 10, 0.4]];
  for (const [x, it, fl] of pend) {
    const p = P.prop(L, x, TOP - 3.2, -22, 0);
    p.cyl(0, 1.6, 0, 0.015, 3.2, 'metalDark', null, null, 4).cyl(0, 0, 0, 0.9, 0.18, 'metalDark', 0x2a2c30, null, 20);
    p.torus(0, -0.1, 0, 0.62, 0.05, 'metalDark', 0x2a2c30, [Math.PI / 2, 0, 0]);
    p.glow(0, -0.1, 0, 1.1, 0.02, 1.1, it > 0 ? 0x8a8070 : 0x141412);
    if (it > 0) { const lt = L.light(x, TOP - 3.6, -22, 0xffe6c4, it, 16, { flicker: fl }); P.lightCone(L, x, TOP - 3.3, -22, [0, -1, 0], 5.5, 2.4, 0xffe0b0, lt, 0.22); }
  }
  for (const [x, it, fl] of [[40, 8, 0.1], [22, 5, 0.5], [6, 9, 0.1], [-12, 7, 0.3], [-30, 6, 0.2]]) {
    L.box(x - 3, TOP - 1.5, -37.2, x + 3, TOP - 1.4, -36.6, it > 0 ? 'emissiveWarm' : 'blackMatte', NC);
    L.box(x - 3.1, TOP - 1.55, -37.3, x + 3.1, TOP - 1.5, -36.5, 'metalDark', NC);
    for (const s of [-2.4, 2.4]) L.box(x + s - 0.01, TOP - 1.4, -36.91, x + s + 0.01, TOP, -36.89, 'metalDark', NC);
    L.light(x, YD + 3.8, -36.4, 0xffe0b8, it, 10, { flicker: fl });
  }
  // apron light spilling through the glass (floods / fires outside)
  for (const [x, c, i] of [[30, 0xffb070, 5], [-2, 0xff8a3a, 6], [-24, 0xffb070, 4]]) L.light(x, YD + 2.5, Z0 + 1.2, c, i, 12, { flicker: 0.2 });
}
