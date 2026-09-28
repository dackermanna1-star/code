// Dead Air 4 — start safe room (end of the skybridge), the Metro International
// conference-centre wing on the upper level (reception with a view over the
// check-in hall, a barricaded corridor, conference rooms with evacuation
// notes, break room, open office, restrooms), the viewing balcony and the
// grand stair down into the terminal lobby.
import * as THREE from 'three';
import { P, sign, graffiti, poster, posterWall, wallMessages, safeRoom, supplies, ceilingLight, physProp, stencil } from './kit.js';
import { Door } from '../world/dynamic.js';
import { DF } from '../render/decals.js';
import { ebsScreen, VisualBatch } from './da_parts.js';
import { whiteboard, confTable, copier, waterCooler, cardboard, serverRack } from './da2_parts.js';
import { lightCone } from './props.js';
import { YU, WING, START, BAL, STAIR } from './da4_layout.js';
import { rng, NC, interiorGlass, wayfind, curtainMat, panelLight, body, strewLuggage, wallX, wallZ, trail, F_SOLID, F_NONAV, F_SHOOT } from './da4_parts.js';

const H = 3.2;            // wing ceiling height
const CY = YU + H;        // ceiling underside

export function buildOffices(L, game, S) {
  startRoom(L, game, S);
  skybridge(L, game);
  wingShell(L, game);
  reception(L, game, S);
  corridorAndRooms(L, game, S);
  balcony(L, game, S);
}

// ================================================================ START ROOM
function startRoom(L, game, S) {
  const { x0, x1, z0, z1 } = START;
  const sr = safeRoom(L, {
    x0, z0, x1, z1, y: YU, h: H, doorWall: 'n', doorAt: 11, hinge: -1, floor: 'carpetBlue', wall: 'plasterGreen', noWalls: ['s'],
    graffiti: ['THE PLANES ARE\nSTILL FLYING', 'GATE C\nMILITARY\nEVAC', 'DONT TRUST\nTHE ARMY', 'ANNA + J\nMADE IT\nHERE'],
  });
  // conference-office furniture (the room was a meeting room before)
  P.table(L, 8.4, YU, 41.2, Math.PI / 2, 2.2, 0.9, 'woodDark');
  supplies(L, 13.6, YU, 44.9, Math.PI, [{ type: 'smg' }, { type: 'pumpShotgun' }, { type: 'silencedSmg', chance: 0.8 }, { type: 'chromeShotgun', chance: 0.8 }], { w: 2.2, mat: 'metalDark' });
  for (const [z, t] of [[40.4, 'medkit'], [41.0, 'medkit'], [41.6, 'medkit'], [42.2, 'medkit']]) L.item(t, 8.4, YU + 0.78, z, { yaw: 1.5 });
  L.item('ammo', 7.1, YU + 0.02, 44.8);
  L.item('pills', 8.6, YU + 0.78, 39.6, { chance: 0.6 });
  L.item('melee', 15.2, YU + 0.02, 39.2, { chance: 0.7 });
  P.officeChair(L, 9.6, YU, 40.2, 1.2);
  P.chair(L, 7.2, YU, 42.9, -0.8, 'woodDark', true);
  cardboard(L, 15.2, YU, 42.6, 0.3, 3);
  P.papers(L, 10.5, YU + 0.01, 42.5, 1.5, 8);
  // radio + dead battery, a sleeping bag, snack wrappers
  P.radioTable(L, 12.2, YU, 38.8, Math.PI);
  P.rug(L, 12.5, YU + 0.012, 42.2, 1.4, 2.2, 0x3a4a3a);
  // locked door back onto the skybridge (chapter 3 ends behind it) + glass wall
  const d = new Door(L, 11, YU, 46.15, 'x', { width: 1.1, safe: true, locked: true });
  d.usable.enabled = false;
  sign(L, 'SKYBRIDGE\nPARKING P2', 11, YU + 2.52, 45.95, 0, 1.1, 0.34, { bg: '#16191e', fg: '#f2c230', clean: true });
  interiorGlass(L, 'x', 6.4, 10.2, 46.15, YU + 0.9, YU + 2.6);
  interiorGlass(L, 'x', 11.8, 15.6, 46.15, YU + 0.9, YU + 2.6);
  for (let i = 0; i < 4; i++) L.survivorStart.push({ x: 9.8 + i * 1.25, y: YU + 0.02, z: 43.4 - (i % 2) * 0.8, yaw: 0 });
  L.flowStart = [11, YU, 42.5];
  S.startDoor = sr.door;
}

// ================================================================ SKYBRIDGE (visual, behind the locked door)
function skybridge(L, game) {
  const B = new VisualBatch(L);
  const x0 = 8.8, x1 = 13.2, y = YU, z0 = 46.3, z1 = 76;
  B.box(x0, y - 0.35, z0, x1, y, z1, 'carpetBlue', { tint: 0x6a7080 });
  B.box(x0 - 0.1, y - 1.1, z0, x1 + 0.1, y - 0.35, z1, 'concrete', { tint: 0x8a8680 });
  B.box(x0 - 0.2, y + 3.0, z0, x1 + 0.2, y + 3.3, z1, 'metalDark', { tint: 0x3a3e44 });
  for (let z = z0 + 1.5; z < z1; z += 3) for (const x of [x0, x1]) B.box(x - 0.08, y, z - 0.06, x + 0.08, y + 3.0, z + 0.06, 'metalDark', { tint: 0x2a2e34 });
  B.box(x0 - 0.02, y + 0.9, z0, x0 + 0.02, y + 2.9, z1, curtainMat());
  B.box(x1 - 0.02, y + 0.9, z0, x1 + 0.02, y + 2.9, z1, curtainMat());
  for (let z = z0 + 6; z < z1; z += 9) B.box(x0 + 0.6, y + 2.95, z - 0.3, x1 - 0.6, y + 3.0, z + 0.3, z < 62 ? 'emissiveCool' : 'blackMatte');
  // support piers down to the road
  for (const z of [56, 68]) B.box(9.6, -0.3, z - 0.6, 12.4, y - 1.1, z + 0.6, 'concrete', { tint: 0x7a766e });
  B.build(L);
  for (const [x, z, r] of [[10.2, 49.4, 0.4], [12.3, 53.0, 2.2], [11.0, 57.6, 1.2]]) P.suitcase(L, x, y, z, r, undefined, false);
  P.corpse(L, 11.6, y + 0.01, 51.6, 2.4, 0x3a4a6a);
  L.decal(11.4, y + 0.012, 51.2, 0, 1, 0, 1.6, DF.POOL);
  L.light(11, y + 2.6, 50.5, 0xd8ecff, 5, 8, { flicker: 0.5 });
}

// ================================================================ WING SHELL
function wingShell(L, game) {
  const { x0, x1, z0, z1 } = WING;
  // floors (room finishes tile the whole footprint; the start room has its own)
  const floors = [
    [10, 0, 30, 6, 'carpetBlue'], [2, 0, 10, 6, 'tileWhite'], [2, 6, 14, 20, 'carpetGray'], [2, 20, 14, 30, 'linoleum'],
    [14, 6, 17, 30, 'carpetBlue'], [17, 6, 30, 18, 'carpetGray'], [17, 18, 30, 30, 'carpet'], [2, 30, 30, 38, 'marble'], [16, 38, 30, 46, 'carpetGray'],
  ];
  for (const [a, b, c, d, m] of floors) L.floor(a, b, c, d, YU, m, 0.3);
  // ceiling (suspended tile) with a break over the start room (safeRoom builds its own)
  L.ceiling(2, 0, 30, 38, CY, 'ceiling', 0.3);
  L.ceiling(16, 38, 30, 46, CY, 'ceiling', 0.3);
  L.ceiling(2, 38, 6, 46, CY, 'ceiling', 0.3);
  // exterior walls: west (city side), north (blind), south facade (skybridge side)
  wallZ(L, z0, 46.0, x0 - 0.15, 0, CY + 0.3, 'concreteDark', [[9.2, 11.4], [14.4, 16.6], [23, 27], [32, 36]].map(([a, b]) => [a, b, YU + 2.4, YU + 0.9]), 0.3);
  for (const [a, b] of [[9.2, 11.4], [14.4, 16.6], [23, 27], [32, 36]]) L.box(x0 - 0.17, YU + 0.9, a, x0 - 0.13, YU + 2.4, b, 'glassDirty', { tint: 0x2a3036, flags: F_SOLID });
  L.box(x0 - 0.3, 0, z0 - 0.3, 30.2, CY + 0.3, z0, 'concreteDark');
  wallX(L, x0 - 0.3, 30.2, 46.15, 0, CY + 0.3, 'concreteDark', [[6.4, 10.2, YU + 2.6, YU + 0.9], [10.45, 11.55, YU + 2.15, YU], [11.8, 15.6, YU + 2.6, YU + 0.9], [18, 22, YU + 2.6, YU + 0.9], [24, 28, YU + 2.6, YU + 0.9]], 0.3);
  interiorGlass(L, 'x', 18, 22, 46.15, YU + 0.9, YU + 2.6);
  interiorGlass(L, 'x', 24, 28, 46.15, YU + 0.9, YU + 2.6);
  // east wall = the lobby's west wall (x 30), full height, with the balcony doorway and
  // interior windows looking over the check-in hall
  wallZ(L, 0, 46.0, 30, 0, 16.4, 'concrete', [[1, 5, YU + 2.8, YU], [18.8, 29.2, YU + 2.6, YU + 0.95], [30.8, 37.2, YU + 2.6, YU + 0.95], [39.2, 43.4, YU + 2.6, YU + 0.95]], 0.4, { tint: 0xc8c2b6 });
  for (const [a, b] of [[18.8, 29.2], [30.8, 37.2], [39.2, 43.4]]) interiorGlass(L, 'z', a, b, 30, YU + 0.95, YU + 2.6);
  // window sills
  for (const [a, b] of [[18.8, 29.2], [30.8, 37.2], [39.2, 43.4]]) L.box(29.7, YU + 0.9, a, 29.8, YU + 0.95, b, 'marble', NC);
  L.reverb(x0, YU, z0, x1, CY, z1, 'room');
  L.ambience(x0, YU - 0.5, z0, x1, CY, z1, 'hospital');
}

// ================================================================ RECEPTION
function reception(L, game, S) {
  // south wall pieces (start room wall is built by safeRoom)
  wallX(L, 2, 5.9, 38, YU, CY, 'plaster');
  wallX(L, 16.1, 29.8, 38, YU, CY, 'plaster', [[22.45, 23.55]]);
  new Door(L, 23, YU, 38, 'x', { width: 1.1, hinge: 1 });
  // north wall with the corridor archway
  wallX(L, 2, 29.8, 30, YU, CY, 'plaster', [[14.1, 16.9, 2.8]]);
  // the conference centre's reception
  P.receptionDesk(L, 7.4, YU, 34.2, -Math.PI / 2, 4);
  sign(L, 'METRO INTERNATIONAL\nCONFERENCE CENTER', 2.14, YU + 2.25, 34.2, Math.PI / 2, 3.6, 0.8, { fg: '#c8b88a', font: 'Georgia, serif' });
  P.officeChair(L, 6.2, YU, 33.4, -1.2);
  for (const [x, z, r] of [[18.5, 35.5, Math.PI], [21.5, 35.5, Math.PI], [26.8, 31.6, 0]]) P.sofa(L, x, YU, z, r, 0x3a4a5a);
  P.table(L, 20, YU, 33.6, 0, 1.2, 0.6, 'woodDark');
  for (const [x, z] of [[16.4, 31.2], [28.8, 37.2], [3.2, 30.8], [12.8, 37.3]]) { P.planter(L, x, YU, z, 0.4); }
  P.picture(L, 20.5, YU + 1.6, 30.12, 0, 1.4, 0.9);
  // emergency broadcast on the lounge TV
  ebsScreen(L, game, 24.0, YU + 1.75, 37.86, Math.PI, 1.3, 0.78, { intensity: 4, range: 7, messages: [
    'CIVIL DANGER WARNING: METRO INTERNATIONAL AIRPORT',
    'EVACUATION FLIGHTS BOARD AT CONCOURSE C ONLY',
    'ALL PASSENGERS MUST CLEAR MILITARY SCREENING',
    'INFECTED PERSONS WILL BE DENIED BOARDING',
    'TERMINAL LOBBY IS NOW A RESTRICTED AREA',
  ] });
  L.box(23.2, YU + 1.3, 37.87, 24.8, YU + 2.2, 37.9, 'blackMatte', NC);
  // luggage, bodies, evac posters
  strewLuggage(L, 17, 31.5, 28, 34, YU, 5);
  P.luggageCart(L, 12.5, YU, 32.2, 0.7, true);
  body(L, 26.0, YU, 33.8, 1.1, 0x2a2a34);
  poster(L, 'evac', 2.14, YU + 1.6, 31.6, Math.PI / 2, 0.5, 0.72, { torn: 0.2 });
  poster(L, 'airline', 25.6, YU + 1.7, 30.12, 0, 1.2, 0.8, { title: 'SKYLINE AIR' });
  poster(L, 'quarantine', 16.3, YU + 1.5, 30.12, 0, 0.6, 0.85, { wet: 0.3 });
  wayfind(L, 'CHECK-IN · TERMINAL C  ↑', 15.5, YU + 3.0, 30.12, 0, 2.6, 0.34);
  wayfind(L, 'SKYBRIDGE · PARKING  ↓', 15.5, YU + 3.0, 29.88, 0, 2.6, 0.34);
  for (const [x, z] of [[8, 34], [20, 34], [26, 34]]) panelLight(L, x, CY, z, { intensity: x === 20 ? 9 : 7, flicker: x === 8 ? 0.6 : 0.1, range: 9, on: x !== 26 });
  L.item('pills', 7.6, YU + 1.17, 34.8, { chance: 0.5 });
  L.decal(21, YU + 0.012, 32.5, 0, 1, 0, 1.2, DF.BLOOD2);
  // the business centre (side room)
  copier(L, 28.8, YU, 40.2, Math.PI / 2);
  for (const z of [42.2, 44.4]) P.desk(L, 28.9, YU, z, Math.PI / 2, true);
  P.officeChair(L, 27.6, YU, 42.1, 1.8);
  P.filingCabinet(L, 16.6, YU, 44.8, -Math.PI / 2);
  cardboard(L, 17.2, YU, 39.2, 0.2, 2);
  L.item('throwable', 28.9, YU + 0.78, 44.2, { chance: 0.7 });
  L.item('pills', 28.9, YU + 0.78, 42.0, { chance: 0.4 });
  graffiti(L, 'SAW THEM\nTAKE OFF\nFROM C3', 22.5, YU + 1.6, 38.13, 0, 1.4, 0.8, '#b8201a');
  ceilingLight(L, 23, CY, 42, { type: 'fluoro', intensity: 7, flicker: 0.7, range: 8 });
  L.reverb(2, YU, 30, 30, CY, 38, 'room');
  // discovery trigger (lobby view through the windows)
  S.receptionTrigger = [16, YU - 0.5, 30.5, 30, YU + 3, 38];
}

// ================================================================ CORRIDOR + ROOMS
function corridorAndRooms(L, game, S) {
  // corridor walls (x 14 / x 17), room dividers
  wallZ(L, 6, 29.9, 14, YU, CY, 'plaster', [[9.45, 10.55], [24.45, 25.55]]);
  wallZ(L, 6, 29.9, 17, YU, CY, 'plaster', [[7.95, 9.05], [26.45, 27.55]]);
  wallX(L, 2, 13.9, 20, YU, CY, 'plaster');
  wallX(L, 17.1, 29.8, 18, YU, CY, 'plaster', [[25.45, 26.55]]);
  wallX(L, 2, 13.9, 6, YU, CY, 'plaster');
  wallX(L, 17.1, 29.8, 6, YU, CY, 'plaster');
  wallZ(L, 0, 5.9, 10, YU, CY, 'tileWhite', [[2.45, 3.55]]);
  const doors = {
    confB: new Door(L, 14, YU, 10, 'z', { width: 1.1, hinge: 1 }),
    brk: new Door(L, 14, YU, 25, 'z', { width: 1.1, hinge: -1, open: true }),
    office: new Door(L, 17, YU, 8.5, 'z', { width: 1.1, hinge: 1 }),
    confA: new Door(L, 17, YU, 27, 'z', { width: 1.1, hinge: -1 }),
    aToOffice: new Door(L, 26, YU, 18, 'x', { width: 1.1, hinge: 1, open: true }),
    wc: new Door(L, 10, YU, 3, 'z', { width: 1.1, hinge: 1 }),
  };
  S.wingDoors = doors;
  // corridor dressing
  for (const z of [26, 20, 11, 3]) ceilingLight(L, 15.5, CY, z, { type: 'fluoro', intensity: z === 20 ? 0 : 7, on: z !== 20, flicker: z === 11 ? 0.8 : 0.3, range: 8 });
  wayfind(L, 'MEETING ROOMS A · B', 15.5, YU + 2.6, 29.88, 0, 2.2, 0.3);
  for (const [z, t] of [[27, 'SKYLINE ROOM\nA'], [10, 'RUNWAY ROOM\nB']]) sign(L, t, z === 27 ? 16.88 : 14.12, YU + 1.6, z === 27 ? 28.2 : 11.2, z === 27 ? -Math.PI / 2 : Math.PI / 2, 0.6, 0.3, { bg: '#2a2c30', fg: '#e8e0c8' });
  waterCooler(L, 16.6, YU, 22.5);
  poster(L, 'health', 14.12, YU + 1.55, 21.6, Math.PI / 2, 0.5, 0.72, { torn: 0.2 });
  poster(L, 'missing', 16.88, YU + 1.5, 23.3, -Math.PI / 2, 0.3, 0.42, { title: 'DEV PATEL' });
  poster(L, 'missing', 16.88, YU + 1.45, 23.8, -Math.PI / 2, 0.3, 0.42, { title: 'ROSA GUTIERREZ' });
  trail(L, 15.4, 28, 15.8, 17, YU, 9);
  // ---- the barricaded corridor: desks, filing cabinets, a sofa (full height clip)
  const bz = 14.6;
  L.clip(14.1, YU, bz - 0.9, 16.9, CY, bz + 0.9, F_SOLID | F_NONAV | F_SHOOT);
  const pile = [
    () => P.desk(L, 15.5, YU, bz - 0.4, 0.2, false), () => P.filingCabinet(L, 14.5, YU, bz + 0.3, 0.4), () => P.filingCabinet(L, 16.5, YU, bz + 0.5, -0.3),
    () => P.sofa(L, 15.4, YU + 0.8, bz + 0.2, 0.15, 0x4a3a3a), () => P.chair(L, 14.8, YU + 1.6, bz - 0.2, 1.1, 'woodDark', true), () => P.officeChair(L, 16.3, YU, bz - 0.7, 2.4),
  ];
  for (const f of pile) f();
  cardboard(L, 16.2, YU + 0.78, bz - 0.35, 0.3, 2);
  graffiti(L, 'KEEP OUT', 15.5, YU + 2.3, bz + 0.95, 0, 1.6, 0.4, '#d8d8c8', { style: 'stencil' });
  graffiti(L, 'THEY GOT\nIN ANYWAY', 13.88, YU + 1.4, 16.4, -Math.PI / 2, 1.3, 0.6, '#b8201a');
  for (let i = 0; i < 8; i++) L.decal(14.3 + rng() * 2.4, YU + 0.012, bz - 1.2 - rng() * 1.5, 0, 1, 0, 0.3, DF.BLOOD1 + (i % 4));
  // ---- break room (x 2..14, z 20..30)
  P.counter(L, 2.45, YU, 25, -Math.PI / 2, 5.2);
  P.fridge(L, 2.5, YU, 21.1, -Math.PI / 2);
  P.vending(L, 8.6, YU, 29.5, 0, 0x1a3a7a);
  P.vending(L, 10.0, YU, 29.5, 0, 0xb02a1a);
  P.table(L, 7.6, YU, 24.2, 0.2, 1.8, 0.9, 'woodPale');
  for (const [x, z, r, t] of [[6.6, 23.4, 0.4, false], [8.8, 25.0, 2.8, false], [9.4, 22.6, 1.4, true]]) P.chair(L, x, YU, z, r, 'plastic', t);
  sign(L, 'OUT OF ORDER', 13.88, YU + 1.7, 22.4, -Math.PI / 2, 0.7, 0.3, { bg: '#e8e2d0', fg: '#1a1a1a' });
  wallMessages(L, 13.88, YU + 1.75, 27.8, -Math.PI / 2, 1.6, 1.05, { lines: ['EVAC BUSES\nNEVER CAME', 'GATE C OR\nNOTHING'], density: 0.8 });
  poster(L, 'flyer', 2.14, YU + 1.5, 28.4, Math.PI / 2, 0.3, 0.42, { lines: ['STAFF NOTICE', 'Break room closed', 'to non-essential', 'personnel'] });
  L.item('pills', 3.0, YU + 0.95, 26.5, { chance: 0.6 });
  L.item('throwable', 7.4, YU + 0.78, 24.1, { chance: 0.6 });
  L.item('health', 2.9, YU + 0.95, 23.5, { chance: 0.25 });
  ceilingLight(L, 8, CY, 25, { type: 'fluoro', intensity: 6, flicker: 0.5, range: 8 });
  // ---- conference room B "RUNWAY ROOM" (x 2..14, z 6..20): a survivors' last stand
  confTable(L, 7.6, YU, 13.5, Math.PI / 2, 5.2, false);
  for (const [x, z, r] of [[6.3, 11.2, 1.4], [9.2, 12.6, -1.2], [6.1, 16.4, 1.9]]) P.officeChair(L, x, YU, z, r);
  P.chair(L, 11.2, YU, 17.4, 0.6, 'plastic', true);
  sign(L, 'WE WAITED 3 DAYS\nNOBODY CAME FOR US\n—\nTRY GATE C', 2.14, YU + 1.55, 13, Math.PI / 2, 2.3, 1.1, { fg: '#1a2a8a', font: '"Comic Sans MS", "Segoe Print", cursive', weight: 'normal', bg: '#eeeee8' });
  body(L, 4.2, YU, 17.8, 0.6, 0x3a3a52);
  body(L, 11.6, YU, 8.4, 2.3, 0x5a4a3a);
  for (let i = 0; i < 14; i++) L.decal(3 + rng() * 10, YU + 0.012, 7 + rng() * 12, 0, 1, 0, 0.16, DF.HOLE_CONCRETE);
  P.papers(L, 8, YU + 0.01, 10, 2.5, 10);
  supplies(L, 3.0, YU, 8.2, Math.PI / 2, [{ type: 'tier2', chance: 0.7 }, { type: 'ammo' }, { type: 'throwable', chance: 0.5 }], { w: 1.8, mat: 'woodDark' });
  ceilingLight(L, 8, CY, 13, { type: 'fluoro', intensity: 7, flicker: 0.4, range: 9 });
  // ---- conference room A "SKYLINE ROOM" (x 17..30, z 18..30): projector screen + whiteboard
  confTable(L, 23.2, YU, 24.2, 0, 7.2, true);
  whiteboard(L, 17.13, YU, 22.2, Math.PI / 2, 'EVAC — METRO INTL\n• Flights from CONCOURSE C\n• Military escort ONLY\n• C-130 on the apron — Sgt. REYES\n• NO SICK. NO EXCEPTIONS.', { fg: '#1a2a8a' });
  // projector screen showing the evacuation plan (glowing), projector + beam
  sign(L, 'METRO INTERNATIONAL\nEMERGENCY EVACUATION PLAN\n\nCHECK-IN → TRIAGE → SECURITY → GATES C1–C12\nLAST DEPARTURE 06:00', 23.4, YU + 1.8, 29.8, Math.PI, 4.2, 2.1, { bg: '#1a3a7a', fg: '#e8f0ff', glow: 0.8, light: false });
  L.box(21.1, YU + 0.68, 29.83, 25.7, YU + 2.92, 29.9, 'paintedWhite', { collide: false, tint: 0xe8e8e8 });
  const pj = P.prop(L, 23.4, CY - 0.28, 22.6, 0);
  pj.box(0, 0, 0, 0.45, 0.16, 0.4, 'plastic', 0xd8d8d0).cyl(0, 0.18, 0, 0.02, 0.3, 'metalDark').glow(0, 0, 0.205, 0.08, 0.08, 0.01, 0xd8e8ff);
  const plt = L.light(23.4, YU + 1.8, 28.8, 0x8aa8ff, 5, 7, { flicker: 0.08 });
  lightCone(L, 23.4, CY - 0.28, 22.8, [0, -0.12, 1], 7, 1.6, 0xa8c0ff, plt, 0.6);
  sign(L, 'SKYLINE AIR · CREW BRIEFING', 21, YU + 2.5, 18.12, 0, 2.4, 0.3, { bg: '#e8e2d4', fg: '#b01e28', clean: true });
  body(L, 20.2, YU, 20.0, 2.8, 0x1e2a44);
  L.item('health', 26.2, YU + 0.8, 24.6, { chance: 0.35 });
  L.reverb(17, YU, 18, 30, CY, 30, 'room');
  // ---- open office (x 17..30, z 6..18): cubicles, printers, a dead IT guy
  for (const [x, z, r] of [[20.6, 9.2, Math.PI], [23.8, 9.2, Math.PI], [27.0, 9.2, Math.PI], [20.6, 14.2, 0], [23.8, 14.2, 0], [27.0, 14.2, 0]]) P.cubicle(L, x, YU, z, r, { w: 2.8, d: 2.2, h: 1.4, fabric: 0x5a6470 });
  copier(L, 29.2, YU, 11.6, Math.PI / 2);
  serverRack(L, 29.4, YU, 16.9, Math.PI / 2, game);
  for (const z of [6.6, 7.3]) P.filingCabinet(L, 18.0, YU, z, -Math.PI / 2);
  body(L, 24.0, YU, 11.6, 1.2, 0x5a6a8a);
  trail(L, 24, 11.6, 18.2, 8.4, YU, 7);
  P.papers(L, 23, YU + 0.01, 12, 3, 16);
  L.item('pills', 26.4, YU + 0.76, 8.6, { chance: 0.5 });
  L.item('throwable', 20.0, YU + 0.76, 14.8, { chance: 0.45 });
  for (const [x, z, on] of [[20.5, 11.7, true], [26.5, 11.7, false]]) panelLight(L, x, CY, z, { intensity: 7, flicker: 0.5, on, range: 8 });
  poster(L, 'quarantine', 29.78, YU + 1.6, 8.4, -Math.PI / 2, 0.6, 0.85);
  L.reverb(17, YU, 6, 30, CY, 18, 'room');
  // ---- restrooms (x 2..10, z 0..6): stalls; a Witch likes the dark
  for (let i = 0; i < 3; i++) {
    const sx = 3.2 + i * 1.5;
    L.box(sx + 0.72, YU, 0, sx + 0.76, YU + 2.0, 1.6, 'paintedBlue', { tint: 0x5a6a7a });
    P.toilet(L, sx, YU, 0.45, Math.PI);
  }
  for (const x of [3.6, 5.2, 6.8]) P.sink(L, x, YU, 5.65, 0);
  L.box(3.0, YU + 1.2, 5.88, 7.6, YU + 2.2, 5.9, 'chrome', NC);
  ceilingLight(L, 6, CY, 3, { type: 'fluoro', intensity: 3.5, flicker: 0.9, range: 6 });
  L.witchSpots.push({ x: 6.2, y: YU, z: 2.4 });
  sign(L, 'RESTROOMS', 10.12, YU + 2.3, 3, Math.PI / 2, 0.9, 0.24, { bg: '#16191e', fg: '#f2c230', clean: true });
  // ---- north hallway (x 10..30, z 0..6) towards the balcony
  wayfind(L, 'CHECK-IN HALL · VIEWING GALLERY  →', 22, YU + 2.6, 0.12, 0, 3.4, 0.36);
  P.bench(L, 21, YU, 0.55, Math.PI);
  P.planter(L, 28.6, YU, 5.3, 0.4);
  P.picture(L, 18, YU + 1.6, 5.88, Math.PI, 1.2, 0.8);
  P.picture(L, 25, YU + 1.6, 5.88, Math.PI, 1.2, 0.8);
  for (const x of [13, 20, 27]) panelLight(L, x, CY, 3, { intensity: x === 20 ? 0 : 6, on: x !== 20, flicker: 0.3, range: 8 });
  P.wheelchair(L, 27.4, YU, 1.6, 2.2);
  poster(L, 'evac', 12.2, YU + 1.6, 0.12, 0, 0.5, 0.72);
  S.hallTrigger = [24, YU - 0.5, 0, 30, YU + 3, 6];
  S.blockTrigger = [14, YU - 0.5, 16, 17, YU + 3, 22];
  S.whiteboardTrigger = [17, YU - 0.5, 18, 30, YU + 3, 30];
}

// ================================================================ BALCONY + GRAND STAIR
function balcony(L, game, S) {
  const { x0, x1, z0, z1 } = BAL;
  L.box(x0 + 0.2, YU - 0.4, z0, x1, YU, z1, 'tileFloor', { tint: 0xb8b2a8 });
  L.box(x0 + 0.2, YU - 0.5, z1, x1, YU + 0.08, z1 + 0.12, 'metalClean', { tint: 0x9aa0a4 });
  // glass balustrade + handrail + clip (nobody hops over, no nav on top)
  L.box(x0 + 0.2, YU + 0.08, z1 - 0.05, x1, YU + 1.05, z1 + 0.02, curtainMat(), NC);
  L.box(x0 + 0.2, YU + 1.05, z1 - 0.06, x1, YU + 1.11, z1 + 0.04, 'chrome', NC);
  for (let x = x0 + 2; x < x1; x += 2.4) L.box(x - 0.03, YU, z1 - 0.06, x + 0.03, YU + 1.05, z1 - 0.02, 'metalClean', NC);
  L.clip(x0 + 0.2, YU, z1 - 0.1, x1, YU + 2.6, z1 + 0.1, F_SOLID | F_NONAV);
  L.clip(x1 - 0.1, YU, STAIR.z1, x1 + 0.1, YU + 2.6, z1 + 0.1, F_SOLID | F_NONAV);
  L.box(x1 - 0.05, YU, STAIR.z1, x1 + 0.03, YU + 1.05, z1, curtainMat(), NC);
  // balcony dressing: benches facing the hall, planters, a directory, the dead
  for (const x of [38, 46, 54]) P.bench(L, x, YU, 4.6, Math.PI);
  for (const x of [34, 42, 50, 58]) P.planter(L, x, YU, 1.0, 0.45);
  sign(L, 'VIEWING GALLERY\nTERMINAL C · LEVEL 2', 36, YU + 2.2, 0.14, 0, 2.6, 0.7, { bg: '#16191e', fg: '#e8e0c8', clean: true });
  body(L, 44.6, YU, 3.2, 0.4, 0x6a2a2a);
  P.wheelchair(L, 51.2, YU, 2.2, -0.8);
  strewLuggage(L, 38, 1.5, 60, 5, YU, 6);
  P.luggageCart(L, 57.4, YU, 3.0, 1.6, true);
  L.item('pills', 38.2, YU + 0.45, 4.6, { chance: 0.4 });
  graffiti(L, 'NO WAY\nOUT BUT UP', 60, YU + 1.6, 0.14, 0, 1.5, 0.7, '#e8e0c8');
  for (const x of [40, 56]) L.light(x, YU + 2.6, 3, 0xffd8a8, 6, 9, { flicker: 0.15 });
  // underside downlights (shops below) and fascia
  L.box(x0 + 0.2, YU - 0.62, z1 + 0.02, x1, YU - 0.4, z1 + 0.14, 'paintedWhite', { collide: false, tint: 0xd8d4cc });
  // grand stair down into the hall (descending towards +x)
  const s = STAIR;
  L.stairs(s.x0, s.z0, s.x1, s.z1, 0, YU, '-x', 'marble', { stepH: 0.2 });
  const len = Math.hypot(s.x1 - s.x0, YU), ang = Math.atan2(YU, s.x1 - s.x0);
  // stringer panel on the open side, sloped glass balustrade + handrail
  L.part('box', (s.x0 + s.x1) / 2, YU / 2 - 0.35, s.z1 + 0.06, len, 0.9, 0.1, 'metalClean', { rz: -ang, tint: 0x9aa0a4 });
  L.part('box', (s.x0 + s.x1) / 2, YU / 2 + 0.6, s.z1 + 0.02, len, 0.95, 0.03, curtainMat(), { rz: -ang });
  L.part('box', (s.x0 + s.x1) / 2, YU / 2 + 1.1, s.z1 + 0.02, len, 0.06, 0.08, 'chrome', { rz: -ang });
  for (let i = 0; i < 10; i++) {
    const xa = s.x0 + (s.x1 - s.x0) * i / 10, xb = s.x0 + (s.x1 - s.x0) * (i + 1) / 10;
    const y = YU * (1 - (i + 0.5) / 10);
    L.clip(xa, y - 1.2, s.z1, xb, y + 2.4, s.z1 + 0.12, F_SOLID | F_NONAV);
  }
  // the stair's end: a newel post and a hanging "CHECK-IN" sign
  L.box(s.x1 - 0.1, 0, s.z1 - 0.05, s.x1 + 0.12, 1.15, s.z1 + 0.17, 'metalClean', { tint: 0xa8acae });
  wayfind(L, 'CHECK-IN · BAGGAGE CLAIM  ↓', 66.5, YU + 2.4, 0.14, 0, 3.2, 0.4);
  S.balconyTrigger = [30.4, YU - 0.5, 0, 40, YU + 3, 6];
  S.stairTrigger = [62, -0.5, 0, 80, YU + 3, 6];
  L.reverb(30, 0, 0, 100, 16, 44, 'hall');
  void THREE;
}
