// Dead Air 4 — Security Checkpoint C and the airside atrium. The staff door
// from baggage handling opens onto the landside queue hall (low ceiling,
// stanchion maze, the back of the shutter the army pulled down, a CEDA health
// screening post). A glass screening wall with three lanes splits the hall:
// lanes 1 and 2 are fenced off, lane 3 still has emergency power — walking
// through its metal detector trips the terminal alarm (a horde). Shooting the
// detector kills it; the security office behind the lanes is the quiet way
// round. Beyond: the double-height atrium with the stopped escalators and a
// fixed stair up to the departure level (concourse C).
import * as THREE from 'three';
import { P, sign, graffiti, poster, posterWall, wallMessages, supplies, physProp, stencil } from './kit.js';
import { Door } from '../world/dynamic.js';
import { DF } from '../render/decals.js';
import { ebsScreen } from './da_parts.js';
import { jersey, razorWire, locker, cctvDesk, medCrate, cot } from './ch3_props.js';
import { YD } from './da4_layout.js';
import { rng, NC, wayfind, notice, curtainMat, column, body, strewLuggage, flightBoard, trail, stanchions, escalator, panelLight, hangingSign, banner, ADS4, F_SOLID, F_NONAV, F_SHOOT, F_SIGHT } from './da4_parts.js';

const XL = 52, XC = 82, XE = 99.85, ZN = -34, ZS = -0.3;
const LH = 4.6;                 // landside ceiling
const AH = 12.4;                // atrium roof underside (= concourse)
const MASS = F_SOLID | F_SHOOT | F_SIGHT | F_NONAV;
export const LANES = [-7, -13, -19];        // lane 3 (z -19) is live
export const OFFICE = { x0: 78, x1: 86, z0: -34, z1: -26, h: 3.0, door: -30.4 };
export const ESCB = { x0: 52, x1: 64, zA: -14.2, zB: -19.8, s0: -18.87, s1: -15.13 };

export function buildSecurity(L, game, S) {
  shell(L);
  checkpoint(L, game, S);
  office(L, game, S);
  landside(L, game, S);
  atrium(L, game, S);
  S.det = detectorEvent(L, game, S);
}

// ================================================================ SHELL
function shell(L) {
  L.floor(XL, ZN, XC, ZS, 0, 'marble', 0.3, { tint: 0xa6a298 });
  L.floor(XC, ZN, XE, ZS, 0, 'tileFloor', 0.3, { tint: 0x9a968c });
  for (const z of [-8.6, -25.4]) L.box(XL, 0, z - 0.18, XC, 0.004, z + 0.18, 'marble', { collide: false, tint: 0x3a4a5a });
  // walls: north (full height), west under the concourse edge + above it south of the concourse
  L.box(XL, 0, ZN - 0.3, 100, AH + 0.4, ZN, 'concrete', { tint: 0xc4beb2 });
  L.box(XL - 0.3, 0, ZN, XL, YD - 0.3, ZS, 'concrete', { tint: 0xc4beb2 });
  L.box(XL - 0.3, YD - 0.3, -4, XL, AH + 0.4, ZS, 'concrete', { tint: 0xc4beb2 });
  // stone cladding + skirting on the airside walls
  L.box(XL, 0, ZN, XC, 0.12, ZN + 0.03, 'metalDark', { collide: false, tint: 0x2a2c30 });
  // landside low ceiling (acoustic tiles) + bulkhead over the screening wall
  L.ceiling(XC + 0.15, ZN, XE, ZS, LH, 'ceiling', 0.25, { flags: MASS });
  L.box(XC - 0.15, LH, ZN, XC + 0.15, AH + 0.4, ZS, 'plaster', { tint: 0xd0ccc4 });
  // atrium roof with a skylight strip (sky glow falls on the escalators)
  L.box(XL - 0.3, AH, ZN - 0.3, XC + 0.15, AH + 0.5, -21, 'concreteDark', { tint: 0x8a8680, flags: MASS });
  L.box(XL - 0.3, AH, -13, XC + 0.15, AH + 0.5, ZS, 'concreteDark', { tint: 0x8a8680, flags: MASS });
  L.box(XL - 0.3, AH + 0.3, -21, XC + 0.15, AH + 0.34, -13, curtainMat(), NC);
  L.clip(XL - 0.3, AH + 0.3, -21, XC + 0.15, AH + 0.8, -13, MASS);
  for (let x = XL + 2; x < XC; x += 2.5) L.box(x - 0.05, AH, -21, x + 0.05, AH + 0.3, -13, 'metalDark', NC);
  for (const z of [-21, -13]) L.box(XL, AH - 0.5, z - 0.2, XC, AH, z + 0.2, 'paintedWhite', { collide: false, tint: 0xb8bcbe });
  // roof trusses
  for (let x = XL + 5; x < XC; x += 7.5) {
    L.box(x - 0.14, AH - 0.35, ZN, x + 0.14, AH, ZS, 'paintedWhite', { collide: false, tint: 0xb4b8ba });
    L.box(x - 0.08, AH - 1.9, ZN, x + 0.08, AH - 1.75, ZS, 'paintedWhite', { collide: false, tint: 0xb4b8ba });
    for (let z = ZN + 1.2; z < ZS - 1; z += 2.6) L.part('box', x, AH - 1.05, z + 1.3, 0.07, 1.75, 0.07, 'paintedWhite', { rx: (Math.round(z) % 2 ? 1 : -1) * 0.78, tint: 0xb4b8ba });
  }
  // concourse edge: glass balustrade along x 52 at the departure level (escalator bank gap)
  for (const [a, b] of [[ZN, -20.73], [-13.27, -4]]) {
    L.box(XL - 0.3, YD + 0.02, a, XL - 0.26, YD + 1.05, b, curtainMat(), NC);
    L.box(XL - 0.32, YD + 1.05, a, XL - 0.24, YD + 1.11, b, 'chrome', NC);
    L.clip(XL - 0.34, YD, a, XL - 0.22, YD + 2.6, b, F_SOLID | F_NONAV);
    for (let z = a + 1.2; z < b; z += 2.4) L.box(XL - 0.31, YD, z - 0.03, XL - 0.25, YD + 1.05, z + 0.03, 'metalClean', NC);
  }
  L.box(XL - 0.3, YD - 0.62, ZN, XL - 0.18, YD - 0.28, ZS, 'paintedWhite', { collide: false, tint: 0xd0ccc4 });
  L.reverb(XL, 0, ZN, XE, AH, ZS, 'hall');
  L.ambience(XL, -0.5, ZN, XE, AH, ZS, 'apartments');
}

// ================================================================ SCREENING WALL + LANES
function checkpoint(L, game, S) {
  const gm = curtainMat();
  // occupied intervals along the wall (detector arches + x-ray scanners); the office closes the north end
  const occ = [];
  for (const z of LANES) { occ.push([z - 0.72, z + 0.72, 'arch']); occ.push([z + 1.0, z + 2.1, 'xray']); }
  occ.sort((a, b) => a[0] - b[0]);
  let cz = OFFICE.z1;
  const segs = [];
  for (const [a, b] of occ) { if (a > cz + 0.01) segs.push([cz, a]); cz = Math.max(cz, b); }
  if (cz < ZS) segs.push([cz, ZS]);
  for (const [a, b] of segs) {
    L.box(XC - 0.06, 0, a, XC + 0.06, 1.0, b, 'metalDark', { tint: 0x3a3e44 });
    L.box(XC - 0.012, 1.0, a, XC + 0.012, 2.4, b, gm, { flags: F_SOLID, surf: 'glass' });
  }
  for (const [a, b, k] of occ) if (k === 'xray') L.box(XC - 0.012, 1.55, a, XC + 0.012, 2.4, b, gm, { flags: F_SOLID, surf: 'glass' });
  L.box(XC - 0.012, 2.4, OFFICE.z1, XC + 0.012, LH, ZS, gm, { flags: F_SOLID, surf: 'glass' });
  L.box(XC - 0.08, 2.36, OFFICE.z1, XC + 0.08, 2.44, ZS, 'metalDark', { collide: false, tint: 0x2a2c30 });
  for (let z = OFFICE.z1; z <= ZS + 0.01; z += 2.4) if (!occ.some(([a, b]) => z > a - 0.05 && z < b + 0.05)) L.box(XC - 0.05, 1.0, z - 0.04, XC + 0.05, LH, z + 0.04, 'metalDark', { collide: false, tint: 0x2a2c30 });
  // fascia over the lanes (landside face) + lane numbers
  wayfind(L, 'SECURITY CHECKPOINT  C  ·  GATES C1 – C12', XC + 0.17, 3.9, -13, Math.PI / 2, 9, 0.62);
  wayfind(L, 'SECURITY CHECKPOINT  C', XC - 0.17, 3.9, -13, Math.PI / 2, 6, 0.55, { fg: '#e8e8e0' });
  LANES.forEach((z, i) => {
    const live = i === 2;
    sign(L, String(i + 1), XC + 0.17, 3.05, z, Math.PI / 2, 0.5, 0.5, { bg: '#16191e', fg: '#f2c230', clean: true, glow: 0.5, light: false });
    sign(L, live ? 'OPEN' : 'CLOSED', XC + 0.17, 2.62, z, Math.PI / 2, 0.8, 0.26, { bg: live ? '#0e3a1a' : '#3a0a08', fg: live ? '#50ff80' : '#ff4030', clean: true, glow: live ? 1.4 : 0.7, light: false });
    P.xrayScanner(L, XC, 0, z + 1.55, 0);
    // grey bin stacks at the loading end, a bag stuck in the tunnel
    for (let k = 0; k < 3; k++) {
      const p = P.prop(L, XC + 1.9 + k * 0.04, 0.78 + k * 0.1, z + 1.55, rng() * 0.2);
      p.box(0, 0.05, 0, 0.62, 0.1, 0.44, 'plastic', 0x6a6e72);
    }
    if (i !== 1) P.suitcase(L, XC - 2.0, 0.78, z + 1.55, Math.PI / 2 + rng() * 0.3, undefined, false);
    const post = P.prop(L, XC + 3.9, 0, z + 0.85, 0);
    post.cyl(0, 0.75, 0, 0.025, 1.5, 'chrome', null, null, 8).cyl(0, 0.015, 0, 0.16, 0.03, 'chrome', null, null, 12);
    notice(L, 'PLACE ALL ITEMS\nIN BINS', XC + 3.9, 1.68, z + 0.85, Math.PI / 2, 0.42, 0.3, { bg: '#e8e8e0', fg: '#1a2a6a', clean: true });
  });
  // lanes 1 and 2: dead arches, fenced off by the army
  for (const z of [LANES[0], LANES[1]]) {
    archDetector(L, XC, 0, z, false);
    P.fenceGate(L, XC - 1.3, 0, z - 0.7, -Math.PI / 2, 1.4, 2.2, true);
    L.clip(XC - 1.4, 0, z - 0.75, XC - 1.2, 2.4, z + 0.75, F_SOLID | F_SHOOT);
    razorWire(L, XC - 2.0, 0, z, Math.PI / 2, 2.0);
    notice(L, 'LANE CLOSED', XC + 0.82, 0.74, z, Math.PI / 2, 0.6, 0.2, { bg: '#b01e18', fg: '#ffffff', clean: true });
    stanchions(L, [[XC + 0.8, z - 0.7], [XC + 0.8, z + 0.7]], 0, 0x8a1a14);
  }
  P.sandbags(L, XC - 2.4, 0, LANES[0], Math.PI / 2, 2.6, 3);
  jersey(L, XC - 2.6, 0, LANES[1], Math.PI / 2, 2.0, 0xb8b4a8);
  // lane 3 is live: floor arrows, a lit lane
  L.box(XC + 0.3, 0.003, LANES[2] - 0.5, XC + 3.5, 0.008, LANES[2] + 0.5, 'rubber', { collide: false, tint: 0x1a1c20 });
}

// Walk-through metal detector (passage along X). Wider than the kit prop so
// players and the nav grid pass through easily. LED strips recolourable.
function archDetector(L, x, y, z, live) {
  const p = P.prop(L, x, y, z, Math.PI / 2);
  for (const sx of [-1, 1]) {
    p.rbox(sx * 0.63, 1.06, 0, 0.16, 2.12, 0.62, 0.04, 'plastic', 0xc8c8c0);
    p.box(sx * 0.63, 0.03, 0, 0.3, 0.06, 0.72, 'metalDark', 0x2a2a2a);
    p.box(sx * 0.63, 1.9, -0.315, 0.1, 0.12, 0.01, 'blackMatte');
    p.col(sx * 0.63, 1.06, 0, 0.18, 2.12, 0.64, 'plastic', F_SOLID);
  }
  p.rbox(0, 2.25, 0, 1.46, 0.24, 0.64, 0.05, 'plastic', 0xc8c8c0);
  p.box(0, 2.25, -0.325, 0.52, 0.13, 0.01, 'blackMatte');
  p.box(0, 2.25, 0.325, 0.52, 0.13, 0.01, 'blackMatte');
  p.box(0, 0.006, 0, 1.1, 0.012, 0.9, 'rubber', 0x1c1c1c);
  p.cyl(0.8, 0.02, 0.2, 0.012, 0.04, 'rubber', 0x111111, [0, 0, Math.PI / 2], 6);
  p.col(0, 2.25, 0, 1.46, 0.24, 0.64, 'plastic', F_SOLID);
  const mat = new THREE.MeshBasicMaterial({ color: live ? new THREE.Color(0.2, 2.4, 0.5) : new THREE.Color(0.02, 0.02, 0.02), toneMapped: false });
  const grp = new THREE.Group();
  for (const sx of [-1, 1]) for (const side of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.5, 0.05), mat);
    m.position.set(sx * 0.545, 1.15, side * 0.2);
    grp.add(m);
  }
  for (const side of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.012), mat);
    t.position.set(0, 2.25, side * 0.333);
    grp.add(t);
  }
  grp.position.set(x, y, z);
  grp.rotation.y = Math.PI / 2;
  L.addObject(grp);
  return { mat, grp, pos: new THREE.Vector3(x, y + 1.2, z) };
}

// ================================================================ SECURITY OFFICE (the quiet way round)
function office(L, game, S) {
  const { x0, x1, z0, z1, h, door } = OFFICE;
  const d0 = door - 0.6, d1 = door + 0.6;
  L.floor(x0, z0, x1, z1, 0.02, 'linoleum', 0.02, { tint: 0x8a9098 });
  L.wallX(x0 - 0.1, x1 + 0.1, z1, 0, h, 'plasterBlue', 0.2, [{ a: 79.2, b: 81.2, y0: 1.0, y1: 2.2 }, { a: 82.8, b: 84.8, y0: 1.0, y1: 2.2 }], { tint: 0x9aa4ae });
  for (const [a, b] of [[79.2, 81.2], [82.8, 84.8]]) L.box(a, 1.0, z1 - 0.012, b, 2.2, z1 + 0.012, curtainMat(), { flags: F_SOLID, surf: 'glass' });
  L.wallZ(z0, z1 - 0.1, x1, 0, h, 'plasterBlue', 0.2, [{ a: d0, b: d1, y0: 0, y1: 2.2 }], { tint: 0x9aa4ae });
  L.wallZ(z0, z1 - 0.1, x0, 0, h, 'plasterBlue', 0.2, [{ a: d0, b: d1, y0: 0, y1: 2.2 }], { tint: 0x9aa4ae });
  L.box(x0 - 0.1, h, z0, x1 + 0.1, h + 0.2, z1 + 0.1, 'ceiling', { flags: MASS });
  S.officeDoors = [new Door(L, x1, 0, door, 'z', { width: 1.1, hinge: -1 }), new Door(L, x0, 0, door, 'z', { width: 1.1, hinge: 1 })];
  sign(L, 'SECURITY OFFICE\nSTAFF ONLY', x1 + 0.12, 2.5, door, Math.PI / 2, 1.1, 0.34, { bg: '#16191e', fg: '#e8e8e0', clean: true });
  sign(L, 'NO ENTRY', x0 - 0.12, 2.5, door, -Math.PI / 2, 0.9, 0.24, { bg: '#b01e18', fg: '#ffffff', clean: true });
  // CCTV wall + desk, lockers, the confiscation table (supplies), a dead officer
  cctvDesk(L, 82, 0, -33.1, 0);
  for (let i = 0; i < 6; i++) {
    const p = P.prop(L, 80.2 + (i % 3) * 0.9, 1.6 + Math.floor(i / 3) * 0.62, z0 + 0.12, 0);
    p.box(0, 0, 0, 0.82, 0.55, 0.14, 'plastic', 0x1a1a1a).glow(0, 0, 0.075, 0.74, 0.47, 0.005, [0x2a4a3a, 0x3a4a5a, 0x101418, 0x4a5a4a, 0x2a3a4a, 0x0c0c0c][i]);
  }
  P.officeChair(L, 82.3, 0, -32.1, 2.6);
  locker(L, x1 - 0.35, 0, -28.2, -Math.PI / 2, 3);
  P.filingCabinet(L, x0 + 0.35, 0, -27.0, Math.PI / 2);
  P.filingCabinet(L, x0 + 0.35, 0, -27.7, Math.PI / 2);
  supplies(L, x0 + 0.55, 0, -32.6, Math.PI / 2, [{ type: 'ammo' }, { type: 'magnum', chance: 0.7 }, { type: 'health', chance: 0.6 }, { type: 'throwable', chance: 0.7 }], { w: 1.8, mat: 'metalDark' });
  notice(L, 'CONFISCATED ITEMS\nLOG ALL ENTRIES', x0 + 0.12, 1.75, -32.6, Math.PI / 2, 0.6, 0.36, { bg: '#e8e2d0', fg: '#1a1a1a' });
  body(L, 83.8, 0, -28.6, 2.2, 0x1a2a4a);
  P.papers(L, 82.6, 0.02, -29.2, 1.4, 10);
  ebsScreen(L, game, x1 - 0.14, 2.0, -32.4, -Math.PI / 2, 0.8, 0.5);
  wallMessages(L, 81.2, 1.7, z1 - 0.12, Math.PI, 1.4, 0.9, { lines: ['DETECTOR STILL\nON BACKUP POWER', 'GO AROUND\nTHRU HERE'], density: 0.6, seed: 4471 });
  panelLight(L, 82, h - 0.02, -30, { intensity: 6, range: 7, flicker: 0.5 });
  L.reverb(x0, 0, z0, x1, h, z1, 'room');
}

// ================================================================ LANDSIDE QUEUE HALL
function landside(L, game, S) {
  // the back of the army's shutter (the sealed entrance from check-in)
  for (let y = 0.1; y < 4.2; y += 0.14) L.box(86, y, ZS - 0.07, 96, y + 0.1, ZS - 0.01, 'metal', { collide: false, tint: 0x7a7e7e });
  L.box(85.6, 4.2, ZS - 0.4, 96.4, 4.6, ZS, 'metalDark', NC);
  stencil(L, 'SEALED BY ORDER\nCEDA · 3RD BN', 91, 2.2, ZS - 0.09, Math.PI, 2.6, 0.9, '#e8e0c8');
  // queue maze (retractable belt stanchions)
  const pts = [];
  for (let k = 0; k < 5; k++) { const z = -3.2 - k * 2.2; pts.push(k % 2 ? [97.5, z] : [86.5, z]); pts.push(k % 2 ? [86.5, z] : [97.5, z]); }
  stanchions(L, pts.slice(0, 4), 0);
  stanchions(L, pts.slice(4, 8), 0);
  stanchions(L, [[86.5, -14.2], [86.5, -17.6], [84.2, -17.6]], 0);
  sign(L, 'ALL PASSENGERS MUST\nBE SCREENED', 97.2, 1.7, -2.3, 0, 0.9, 0.6, { bg: '#1a2a6a', fg: '#ffffff', clean: true });
  P.prop(L, 97.2, 0, -2.3, 0).cyl(0, 0.7, 0, 0.03, 1.4, 'chrome', null, null, 8).cyl(0, 0.015, 0, 0.18, 0.03, 'chrome', null, null, 12);
  // CEDA health screening post (the army's last filter before the gates)
  P.table(L, 94.8, 0, -24.4, 0.05, 2.2, 0.8, 'metalDark');
  medCrate(L, 94.2, 0.76, -24.4, 0.3, 0.8);
  const th = P.prop(L, 95.6, 0.76, -24.3, 0.4);
  th.box(0, 0.12, 0, 0.14, 0.24, 0.12, 'plastic', 0xd8d8d0).glow(0, 0.14, -0.065, 0.1, 0.08, 0.005, 0x3a6a4a);
  const fr = P.prop(L, 94.8, 0, -25.42, 0);
  for (const sx of [-1.65, 1.65]) fr.cyl(sx, 1.4, 0, 0.03, 2.8, 'metalDark', 0x2a2c30, null, 8).box(sx, 0.02, 0, 0.3, 0.04, 0.5, 'metalDark', 0x2a2c30);
  fr.box(0, 2.3, -0.03, 3.3, 1.0, 0.03, 'metalDark', 0x2a2c30);
  sign(L, 'CEDA HEALTH SCREENING\nHAVE YOUR TEMPERATURE TAKEN\nSYMPTOMATIC TRAVELERS WILL BE ISOLATED', 94.8, 2.3, -25.39, 0, 3.2, 0.9, { bg: '#e8e2d0', fg: '#1a3a6a', paper: false });
  cot(L, 90.6, 0, -31.8, 0.1, true);
  cot(L, 93.4, 0, -32.2, -0.08, false);
  P.bodyBag(L, 96.6, 0, -31.4, 1.5);
  P.bodyBag(L, 97.6, 0, -29.8, 1.7);
  poster(L, 'quarantine', XE - 0.02, 1.7, -8, -Math.PI / 2, 0.8, 1.1, { wet: 0.2 });
  poster(L, 'health', XE - 0.02, 1.6, -11, -Math.PI / 2, 0.55, 0.8);
  posterWall(L, XE - 0.02, 1.6, -30.8, -Math.PI / 2, 2.4, 1.6, { kinds: ['missing', 'missing', 'flyer', 'evac', 'missing'], seed: 4481 });
  graffiti(L, 'IT BEEPS\nFOR GUNS', XE - 0.02, 2.2, -16, -Math.PI / 2, 1.6, 0.8, '#b8201a');
  wallMessages(L, 91, 1.8, ZN + 0.02, 0, 1.6, 1.0, { lines: ['GATE C3 BRIDGE\nGOES TO THE\nTARMAC', 'DONT WALK\nTHRU LANE 3'], density: 1.0, seed: 4482 });
  // the dead + abandoned things
  for (const [x, z, r, c] of [[88.6, -20.8, 0.6, 0x4a5a3a], [96.2, -6.4, 2.2, 0x2a3a4a], [90.4, -11.6, 1.2, 0x6a4a2a]]) body(L, x, 0, z, r, c);
  trail(L, 88.6, -20.8, 84.2, -19.2, 0, 6);
  for (const [x, z, n, r] of [[92, -7, 5, 1.4], [88, -28.6, 6, 1.6], [97, -16, 4, 1.1]]) P.luggagePile(L, x, 0, z, n, r);
  strewLuggage(L, 84, -24, 98, -2, 0, 7);
  P.luggageCart(L, 95.6, 0, -19.6, 0.9, true);
  for (let i = 0; i < 4; i++) { const p = P.prop(L, 84.6 + i * 0.1, 0.02 + i * 0.1, -25.2, rng()); p.box(0, 0.05, 0, 0.62, 0.1, 0.44, 'plastic', 0x6a6e72); }
  P.trashCan(L, 98.8, 0, -3.4);
  physProp(L, 'trashcan', 85.2, 0, -2.6);
  // lights: flickering panels, dark stretches
  for (const [x, z, on, fl] of [[91, -5, true, 0.15], [91, -13, false, 0], [91, -20.5, true, 0.55], [95, -28, true, 0.3], [86.5, -13, true, 0.1]]) panelLight(L, x, LH, z, { on, flicker: fl, intensity: 8, range: 9 });
  L.light(94.8, 1.4, -23.6, 0x6ac8ff, 2.5, 4, { flicker: 0.1 });
  S.secTrigger = [96, -0.5, -26, 99.8, 3, -17];
}

// ================================================================ AIRSIDE ATRIUM
function atrium(L, game, S) {
  const { x0, x1, zA, zB, s0, s1 } = ESCB;
  // escalators (solid, clad sides) and the fixed stair between them
  escalator(L, x0, x1, zA, 0, YD, 1.4, { solid: true, clad: [1] });
  escalator(L, x0, x1, zB, 0, YD, 1.4, { solid: true, clad: [-1] });
  L.stairs(x0 + 1.2, s0, x1 - 1.2, s1, 0, YD, '-x', 'marble', { stepH: 0.2, tint: 0xb0aca4 });
  L.box(x0, YD - 0.3, s0, x0 + 1.2, YD, s1, 'marble', { tint: 0xb0aca4 });
  L.box(x0, YD - 0.3, s0 - 0.25, x0 + 1.2, YD, s0, 'metalClean', { tint: 0x8a8e90 });
  L.box(x0, YD - 0.3, s1, x0 + 1.2, YD, s1 + 0.25, 'metalClean', { tint: 0x8a8e90 });
  // stair handrails on the escalator balustrades are enough; a centre rail + brass nosings
  const len = Math.hypot(x1 - x0 - 2.4, YD), ang = Math.atan2(YD, x1 - x0 - 2.4);
  L.part('box', (x0 + x1) / 2, YD / 2 + 0.95, (s0 + s1) / 2, len, 0.05, 0.05, 'chrome', { rz: -ang });
  for (let i = 0; i < 4; i++) { const t = (i + 0.5) / 4; L.part('box', x1 - 1.2 - t * (x1 - x0 - 2.4), YD * t + 0.45, (s0 + s1) / 2, 0.04, 0.9, 0.04, 'chrome', {}); }
  // escalator lit strips (emergency power) + big DEPARTURES sign over the bank
  for (const zc of [zA, zB]) for (const s of [-1, 1]) L.part('box', (x0 + x1) / 2, YD / 2 + 0.3, zc + s * 0.705, len - 0.4, 0.035, 0.01, 'emissiveCool', { rz: -ang });
  L.box(x0, 0, -20.73, x0 + 1.2, YD - 0.3, -13.27, 'concrete', { tint: 0xb8b4ac, flags: MASS });
  hangingSign(L, 'DEPARTURES  ·  GATES C1 – C12  ↑', 66.2, 8.6, -17, Math.PI / 2, 6.4, 0.8, AH);
  wayfind(L, '↑  ALL GATES', XC - 0.17, 5.4, -24.5, -Math.PI / 2, 3.2, 0.5);
  // departure boards on the north wall + the big CEDA banner
  flightBoard(L, 70, 3.2, ZN + 0.02, 0, 4.2, 2.3, { kind: 'dep', seed: 4491, rows: 10, special: [3, 'MILITARY ONLY'] });
  flightBoard(L, 75.2, 3.2, ZN + 0.02, 0, 4.2, 2.3, { kind: 'dep', seed: 4492, rows: 10, light: false });
  banner(L, ADS4.ceda, 62, 9.2, ZN + 0.25, 0, 7, 3.5, { glow: 0.16 });
  banner(L, ADS4.newburgTourism, 74, 9.2, ZS - 0.25, Math.PI, 7, 3.5, { glow: 0.14 });
  // recomposure benches, bins, planters, columns
  for (const [x, z] of [[76, -3.6], [70, -3.6], [76, -31.4]]) P.bench(L, x, 0, z, z > -10 ? Math.PI : 0);
  for (const [x, z] of [[72.6, -9], [72.6, -25]]) column(L, x, z, 0, AH, 0.55, { tint: 0xd8d4cc });
  for (const [x, z] of [[67, -2.2], [79.6, -32.8]]) P.planter(L, x, 0, z, 0.5);
  P.trashCan(L, 66.6, 0, -24.4);
  physProp(L, 'trashcan', 78.8, 0, -8.8);
  for (let i = 0; i < 5; i++) { const p = P.prop(L, 76.4 + (i % 3) * 0.7, 0.76, -5.2 + Math.floor(i / 3) * 0.5, rng()); p.box(0, 0.05, 0, 0.62, 0.1, 0.44, 'plastic', 0x6a6e72); }
  P.table(L, 77.2, 0, -5, 0, 2.4, 0.8, 'metalDark');
  // the army's last stand at the foot of the escalators: sandbag horseshoe, casings, the dead
  P.sandbags(L, 67.6, 0, -9.6, 0.2, 3.2, 3);
  P.sandbags(L, 67.2, 0, -25.4, -0.15, 3.2, 3);
  for (const [x, z, r, c] of [[69.4, -10.6, 1.1, 0x4a5a3a], [66.4, -27, 2.6, 0x4a5a3a], [74.8, -18.4, 0.3, 0x3a2a2a], [60.5, -9.5, 1.9, 0x5a3a2a], [57.2, -28.6, 0.8, 0x2a3a5a]]) body(L, x, 0, z, r, c);
  L.item('ammo', 68.6, 0.02, -11.4);
  L.item('tier2', 68.0, 0.02, -24.0, { chance: 0.6 });
  L.item('pipebomb', 70.4, 0.02, -26.6, { chance: 0.5 });
  trail(L, 74.8, -18.4, 64.4, -17.2, 0, 7);
  for (let i = 0; i < 10; i++) L.decal(60 + rng() * 20, 0.012, -30 + rng() * 26, 0, 1, 0, 0.6 + rng() * 1.2, DF.BLOOD1 + (i % 4));
  for (const [x, z, n, r] of [[58, -5, 6, 1.6], [58.4, -30, 5, 1.4], [78, -14, 4, 1.2]]) P.luggagePile(L, x, 0, z, n, r);
  strewLuggage(L, 64, -32, 80, -2, 0, 8);
  P.wheelchair(L, 62.4, 0, -4.6, 2.4);
  graffiti(L, 'THEY CAME\nUP THE\nESCALATORS', 57, 3.4, ZN + 0.02, 0, 2.2, 1.2, '#b8201a');
  graffiti(L, 'CEDA\nLIED', 60.2, 2.2, ZS - 0.02, Math.PI, 1.2, 0.7, '#e8e0c8');
  poster(L, 'airline', 56, 1.9, ZS - 0.02, Math.PI, 1.4, 0.95, { title: 'SKYLINE AIR' });
  poster(L, 'evac', 79, 1.6, ZN + 0.02, 0, 0.5, 0.72);
  // lighting: two live high-bay pendants, a dead one, sky light through the strip
  for (const [x, z, it, fl] of [[70, -9, 18, 0.15], [70, -26, 0, 0], [58, -9, 12, 0.5], [58, -27, 14, 0.1]]) {
    const p = P.prop(L, x, 9.6, z, 0);
    p.cyl(0, (AH - 9.6) / 2, 0, 0.012, AH - 9.6, 'metalDark', null, null, 4).frustum(0, -0.2, 0, 0.18, 0.55, 0.45, 'metalDark', 0x2a2c30, null, 14);
    p.glow(0, -0.44, 0, 0.7, 0.02, 0.7, it > 0 ? 0xfff0d0 : 0x1a1a18);
    if (it > 0) { const lt = L.light(x, 8.9, z, 0xffe8c8, it, 20, { flicker: fl }); P.lightCone(L, x, 9.2, z, [0, -1, 0], 8.5, 3.8, 0xffe0b0, lt, 0.45); }
  }
  L.light(66, 3.6, -17, 0x9ac8ff, 5, 9, { flicker: 0.05 });
  L.light(60, 10.8, -17, 0x8a7a9a, 4, 14);
  S.atriumTrigger = [60, -0.5, -32, 78, 3, -2];
  S.escTrigger = [44, YD - 0.5, -21, 52, YD + 3, -13];
}

// ================================================================ THE LIVE DETECTOR
function detectorEvent(L, game, S) {
  const z = LANES[2];
  const D = archDetector(L, XC, 0, z, true);
  const ev = { state: 'armed', t: 0 };
  const beacons = [L.light(XC - 1.5, 3.8, z, 0xff2010, 0, 14, { on: false, priority: 1 }), L.light(66, 8.5, -17, 0xff2010, 0, 22, { on: false, priority: 1 }), L.light(92, 3.8, -10, 0xff2010, 0, 12, { on: false, priority: 0.5 })];
  const bm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.01, 0.01), toneMapped: false });
  for (const [x, y, zz] of [[XC - 0.2, 4.35, z], [XC + 0.2, 4.35, z], [72.4, 11.8, ZN + 0.2]]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.16, 10), bm);
    m.position.set(x, y, zz);
    L.addObject(m);
  }
  let snd = null, hum = null;
  const nav = () => game.level.nav;
  const nodesAt = (pts) => pts.map(([x, y, zz]) => nav().nearestNode(x, y, zz, 3)).filter((n) => n >= 0);
  const say = (lines) => game.voice.script(lines);
  ev.trip = (s) => {
    if (ev.state !== 'armed') return;
    ev.state = 'alarm'; ev.t = 0;
    const who = s?.char?.id || 'francis';
    console.log('[da4] metal detector tripped');
    game.audio.play('buttonPress', { pos: D.pos, vol: 1.2, rate: 0.6 });
    snd = game.audio.loop('alarm', { pos: new THREE.Vector3(72, 6, -17), vol: 1.25 });
    for (const b of beacons) b.on = true;
    game.session.objective('Alarm! Hold them off, then get up the escalators');
    const d = game.director;
    const nodes = nodesAt([[40, YD, -24], [10, YD, -30], [94, 0, -30], [120, 0, -14], [64, 0, -32]]);
    if (d.panicState) d.spawnMob(11, { where: 'any', minD: 16, maxD: 60 });   // another event still running: one extra rush, not a second stacked panic
    else {
      d.panic('detector', {
        waves: 2, size: [14, 20], interval: 16, where: 'any', minD: 14, maxD: 70, nodes: nodes.length ? nodes : undefined,
        onEnd: () => { ev.stop(); say([{ who: 'louis', text: 'Okay... okay. Alarm\'s off. We\'re good.', d: 1.5 }]); },
      });
    }
    L.after(38, () => ev.stop());
    say([
      { who, text: who === 'francis' ? 'Oh, come ON. It\'s a METAL DETECTOR.' : 'Uh... was that us?', d: 0.4 },
      { who: 'zoey', text: 'We\'re carrying half a gun store. Of course it went off.', d: 2.4 },
      { who: 'bill', text: 'Here they come! Back to back!', d: 4.6 },
    ]);
  };
  ev.stop = () => {
    if (ev.state !== 'alarm') return;
    ev.state = 'done';
    snd?.stop(2); snd = null;
    for (const b of beacons) { b.on = false; b.intensity = 0; }
    bm.color.setRGB(0.1, 0.01, 0.01);
    D.mat.color.setRGB(0.02, 0.02, 0.02);
  };
  ev.break = (shooter) => {
    if (ev.broken) return;
    ev.broken = true;
    hum?.stop(0.3); hum = null;
    game.fx.sparks(XC, 1.6, z - 0.55, 1, 0.3, 0, 26);
    game.fx.sparks(XC, 2.2, z + 0.4, -1, 0.5, 0, 18);
    game.audio.play('glassBreak', { pos: D.pos, vol: 0.5, rate: 1.6 });
    game.audio.play('metalImpact', { pos: D.pos, vol: 0.7, rate: 1.4 });
    ev.dieT = 0.8;
    if (ev.state === 'armed') {
      ev.state = 'broken';
      console.log('[da4] metal detector shot out');
      if (shooter?.char) L.after(0.6, () => say([{ who: shooter.char.id, text: shooter.char.id === 'francis' ? 'I hate metal detectors.' : 'Detector\'s dead. Walk through.', d: 0 }]));
    }
  };
  L.col.addDynamic([XC - 0.36, 0.1, z - 0.76], [XC + 0.36, 2.4, z + 0.76], { flags: F_SHOOT, surf: 'plastic', owner: { onShot: (x, y, zz, dir, shooter) => ev.break(shooter) } });
  L.trigger(XC - 0.3, -0.5, z - 0.62, XC + 0.3, 2.5, z + 0.62, (s) => ev.trip(s), { once: false, humanOnly: true });
  ev.update = (dt) => {
    ev.t += dt;
    if (!hum && !ev.broken && ev.state === 'armed' && game.camPos && Math.hypot(game.camPos.x - XC, game.camPos.z - z) < 14) hum = game.audio.loop('generator', { pos: D.pos, vol: 0.12, rate: 2.6 });
    if (ev.state === 'armed') { const k = 1.8 + Math.sin(ev.t * 2.2) * 0.4; D.mat.color.setRGB(0.15, k, 0.4); }
    else if (ev.state === 'alarm') {
      const on = (ev.t % 0.5) < 0.25;
      if (!ev.broken) D.mat.color.setRGB(on ? 3 : 0.2, 0.05, 0.02);
      const k = Math.max(0, Math.sin(ev.t * 7));
      for (const b of beacons) b.intensity = 18 * k * k;
      bm.color.setRGB(0.3 + 3 * k, 0.05, 0.02);
    }
    if (ev.dieT > 0) { ev.dieT -= dt; D.mat.color.setRGB(Math.random() < 0.5 ? 1.5 : 0, 0.05, 0); if (ev.dieT <= 0) D.mat.color.setRGB(0.02, 0.02, 0.02); }
  };
  L.dynamics.push({ update: (dt) => ev.update(dt) });
  ev.D = D;
  return ev;
}
