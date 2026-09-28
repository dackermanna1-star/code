// Chapter 2 — THE SUBWAY
// Hawthorne St station maintenance safe room -> ticket concourse -> stairs down
// to the platform -> through a stalled train -> long dark double-track tunnel
// (alcoves, sparking junction box, derailed wreck S-bend, cave-in) ->
// substation maintenance rooms -> SUBSTATION 7 generator hall crescendo (rolling
// gate on a diesel generator, hordes from the catwalks, a hole under the locker
// room and the entrance) -> loading dock & stairs up -> transit authority
// offices -> alley -> Kent Street -> Lucky Star pawn shop (end safe room).
import { ceilingLight, safeRoom, supplies, fireSource, physProp, P, railSegment } from './kit.js';
import { F_SOLID, F_SHOOT } from '../world/collision.js';
import { DF } from '../render/decals.js';
import { track, trainCar, gangway, wreckCar, poster, lockers, sparker, soundEmitter, cableTrayX, rng, sgn, graf } from './ch2_parts.js';
import { buildPowerStation } from './ch2_power.js';
import { buildSurface } from './ch2_surface.js';

export const Y = { CY: 0, PY: -5, TY: -6.2, CW: -1.6 };
const { CY, PY, TY } = Y;
// station / tunnel layout
const PZ1 = 9.5; // platform edge
const NT = 11.1, FT = 17.4; // near / far track centres
const CZ = 14.8; // steel column line between the tracks
const SW = 20.2; // south wall (tracks side)
const HX0 = 40.5, HX1 = 100; // platform hall
const TX1 = 172; // tunnel cave-in
const WRECK = [120.5, 157];

const say = (game, lines) => game.voice.script(lines);

function buildStart(L, game) {
  // ================================================ START SAFE ROOM (maintenance room)
  safeRoom(L, {
    x0: -9, z0: 1.5, x1: 0, z1: 9, y: CY, h: 3.2, doorWall: 'e', doorAt: 6.6, hinge: -1, wall: 'tileSubway', floor: 'concreteFloor', ceil: 'concrete',
    graffiti: ['TRAINS DONT\nRUN. WALK.', 'THE HUM IN\nTHE TUNNELS\nIS THEM', 'MERCY\nOR BUST'],
  });
  graf(L, '47 DAYS\n48', -1.3, 1.25, 1.62, Math.PI, 1.0, 0.55, '#202020');
  graf(L, 'THE PILOT\nIS REAL', -3.2, 2.45, 8.88, 0, 1.6, 0.6, '#1a2a8a');
  graf(L, 'IIII IIII\nIIII II', -8.88, 2.25, 7.6, -Math.PI / 2, 1.1, 0.55, '#1a1a1a');
  supplies(L, -4.6, CY, 2.05, 0, ['smg', 'pumpShotgun', 'silencedSmg', 'chromeShotgun'], { w: 2.4 });
  supplies(L, -8.45, CY, 5.3, Math.PI / 2, ['medkit', 'medkit', 'medkit', 'medkit'], { w: 2.2 });
  L.item('ammo', -1.2, CY + 0.02, 2.2);
  P.crate(L, -8.35, CY, 7.45, 0.2);
  L.item('tier2', -8.35, CY + 0.82, 7.45, { chance: 0.3 });
  L.item('pills', -3.9, CY + 0.02, 8.45, { chance: 0.5 });
  L.item('throwable', -6.1, CY + 0.02, 8.4, { chance: 0.5 });
  lockers(L, -2.2, CY, 8.62, 0, 4, 0x8a9aaa, 2);
  P.electricPanel(L, -7.6, CY, 1.82, Math.PI, true);
  L.box(-7.6, CY, 7.9, -5.9, CY + 0.16, 8.85, 'fabric', { tint: 0x5a5a4a });
  L.box(-7.5, CY + 0.16, 8.3, -7.0, CY + 0.28, 8.8, 'fabric', { tint: 0x8a8a7a, collide: false });
  P.pipe(L, -8.85, 2.9, 3.0, -0.15, 2.9, 3.0, 0.07, 'rust');
  P.pipe(L, -8.85, 2.95, 3.35, -0.15, 2.95, 3.35, 0.045, 'metalDark');
  physProp(L, 'bucket', -0.9, CY, 8.2);
  L.decal(-1.2, CY + 0.012, 6.3, 0, 1, 0, 1.2, DF.SMEAR);
  L.decal(-6.5, CY + 0.012, 4.2, 0, 1, 0, 0.8, DF.BLOOD2);
  L.survivorStart.push(
    { x: -5.2, y: CY, z: 4.4, yaw: -Math.PI / 2 }, { x: -3.2, y: CY, z: 5.5, yaw: -Math.PI / 2 + 0.2 },
    { x: -5.4, y: CY, z: 6.7, yaw: -Math.PI / 2 - 0.1 }, { x: -3.3, y: CY, z: 7.5, yaw: -Math.PI / 2 },
  );
  L.flowStart = [-4.5, CY, 5.5];
  sgn(L, 'SAFE ROOM', 0.13, 2.62, 6.6, -Math.PI / 2, 1.2, 0.32, { bg: '#8a1a14', fg: '#fff' });
  sgn(L, 'MAINTENANCE\nAUTHORIZED PERSONNEL ONLY', 0.13, 1.7, 8.3, -Math.PI / 2, 1.0, 0.36, { bg: '#d8d0b0', fg: '#1a1a1a' });

  // ================================================ CONCOURSE (y 0) x 0..30, z 0..22
  L.floor(0, 0, 30, 22, CY, 'tileFloor', 0.4);
  L.ceiling(0, 0, 30, 22, 4, 'concrete', 0.4);
  const tw = 'tileSubway';
  L.box(-0.4, CY, -0.4, 12.4, 4.4, 0, tw);
  L.box(16.6, CY, -0.4, 30.4, 4.4, 0, tw);
  L.box(-0.4, CY, 22, 30.4, 4.4, 22.4, tw);
  L.box(-0.4, CY, 0, 0, 4.4, 1.4, tw);
  L.box(-0.4, CY, 9.1, 0, 4.4, 22, tw);
  L.box(-0.4, 3.5, 1.4, 0, 4.4, 9.1, tw);
  L.box(30, CY, 0, 30.4, 4.4, 3, tw);
  L.box(30, CY, 8, 30.4, 4.4, 22, tw);
  L.box(30, 3.6, 3, 30.4, 4.4, 8, tw);
  // green tile band
  for (const [x0, x1, za, zb] of [[0, 12.4, 0, 0.02], [16.6, 30, 0, 0.02], [0, 30, 21.98, 22]]) L.box(x0, 2.75, za, x1, 3.0, zb, 'tileGreen', { collide: false });
  // columns
  for (const x of [6, 12, 18, 24]) for (const z of [7.5, 15]) L.box(x - 0.35, CY, z - 0.35, x + 0.35, 4, z + 0.35, 'tileGreen');
  // street stairs (north) up to a closed emergency shutter — the way we came in
  L.box(12, -0.4, -8.4, 12.4, 6.8, -0.4, tw);
  L.box(16.6, -0.4, -8.4, 17, 6.8, -0.4, tw);
  L.stairs(12.4, -7.2, 16.6, 0, CY, 3.6, '-z', 'tileFloor', { stepH: 0.2 });
  L.box(12.4, -0.4, -8.0, 16.6, 3.6, -7.2, 'tileFloor');
  L.box(12.4, 3.6, -3, 16.6, 6.8, 0, 'concrete');
  L.box(12.4, 6.4, -8.4, 16.6, 6.8, -3, 'concrete');
  L.box(12.4, -0.4, -8.4, 16.6, 6.8, -8.0, 'concrete');
  L.box(12.4, 3.6, -7.9, 16.6, 6.4, -7.72, 'metal', { tint: 0x7a7e80 });
  for (let y = 3.8; y < 6.4; y += 0.22) L.box(12.4, y, -7.74, 16.6, y + 0.06, -7.7, 'metalDark', { collide: false });
  railSegment(L, 12.55, 0.95, 0, 12.55, 3.6 + 0.95, -7.2);
  railSegment(L, 16.45, 0.95, 0, 16.45, 3.6 + 0.95, -7.2);
  ceilingLight(L, 14.5, 6.4, -6.2, { type: 'cage', intensity: 5, flicker: 0.6, range: 7 });
  P.debris(L, 14, 3.6, -7.5, 0.5, 'concrete', 6);
  P.barricade(L, 14.5, 3.6, -6.9, 0);
  sgn(L, 'GRAND ST EXIT\nCLOSED', 10, 2.3, 0.03, Math.PI, 1.8, 0.45, { bg: '#1a1a1a', fg: '#e8e8e8' });
  graf(L, 'THEY FOLLOWED\nUS DOWN', 12.43, 2.7, -4.2, -Math.PI / 2, 2.2, 0.8, '#b8201a');
  soundEmitter(L, 14.5, 4.5, -7.6, ['doorBang', 'metalImpact'], { min: 5, max: 9, burst: 3, gap: 420, vol: 0.55, first: 6, range: 40 });
  L.reverb(12.4, CY, -8, 16.6, 6.4, 0, 'stairwell');
  // ticket booth
  const tb = P.prop(L, 10.5, CY, 12.5, 0);
  tb.box(0, 1.2, 0, 3, 2.4, 2.2, 'metalClean', 0x9aa0a0).col(0, 1.2, 0, 3, 2.4, 2.2, 'metal');
  tb.box(0, 1.55, -1.11, 2.6, 0.9, 0.02, 'glassDirty', 0x303838);
  tb.box(0, 1.0, -1.25, 2.8, 0.06, 0.3, 'metalClean');
  sgn(L, 'TOKENS', 10.5, 2.55, 11.37, 0, 1.2, 0.3, { bg: '#1a1a1a', fg: '#ffd040' });
  L.item('pills', 10.1, 1.06, 11.25, { chance: 0.5 });
  // turnstile line (x 21): railings, turnstiles, a toppled one and an open emergency gate
  for (let k = 0; k < 10; k++) {
    const z = 5.8 + k * 1.3;
    if (k === 4) continue;
    P.turnstile(L, 21, CY, z, Math.PI / 2);
  }
  const tt = P.prop(L, 21.6, CY, 11.2, 0.4);
  tt.box(0, 0.16, 0, 0.9, 0.3, 0.9, 'metalClean', null, [0, 0, 0]).box(0.2, 0.34, 0.1, 0.4, 0.04, 0.04, 'chrome');
  L.clip(20.9, CY, 5.2, 21.1, CY + 1.0, 10.4, F_SOLID);
  L.clip(20.9, CY, 11.6, 21.1, CY + 1.0, 18.6, F_SOLID);
  for (const [a, b] of [[0, 5.2], [17.65, 18.6], [20.0, 22]]) {
    L.box(20.95, CY + 0.95, a, 21.05, CY + 1.05, b, 'metalClean', { collide: false });
    for (let z = a; z <= b; z += 0.5) L.box(20.98, CY, z, 21.02, CY + 0.95, z + 0.03, 'metalClean', { collide: false });
    L.clip(20.9, CY, a, 21.1, CY + 1.05, b, F_SOLID | F_SHOOT);
  }
  L.box(21, CY, 20.0, 22.3, CY + 1.05, 20.06, 'metalClean', { collide: false });
  sgn(L, 'EMERGENCY EXIT\nALARM WILL SOUND', 20.94, 1.6, 19.3, Math.PI / 2, 0.9, 0.3, { bg: '#b01a14', fg: '#fff' });
  sgn(L, 'TO ALL TRAINS →', 20.94, 3.0, 11, Math.PI / 2, 2.2, 0.35, { bg: '#1a1a1a', fg: '#fff' });
  for (const z of [10.1, 11.9]) L.box(20.93, 3.17, z - 0.02, 20.97, 4, z + 0.02, 'metalDark', { collide: false });
  // dressing
  P.bench(L, 4, CY, 21.5, 0);
  P.bench(L, 8.5, CY, 21.5, 0);
  P.vending(L, 26, CY, 21.5, 0);
  P.vending(L, 27.1, CY, 21.5, 0, 0x2a5a9a);
  P.trashCan(L, 13, CY, 21.4);
  const ns = P.prop(L, 15.5, CY, 17.8, 0);
  ns.box(0, 0.6, 0, 2.2, 1.2, 1.2, 'woodDark').col(0, 0.6, 0, 2.2, 1.2, 1.2, 'wood');
  ns.box(0, 1.9, 0.5, 2.2, 1.4, 0.1, 'woodDark').box(0, 2.62, 0, 2.4, 0.08, 1.4, 'metalDark');
  for (let i = 0; i < 12; i++) ns.box(-0.95 + (i % 6) * 0.38, 1.3 + Math.floor(i / 6) * 0.45, 0.42, 0.3, 0.38, 0.03, 'paper', [0xd8c8a0, 0xa83a2a, 0x3a5a8a, 0xd8d8d0][i % 4]);
  sgn(L, 'NEWS', 15.5, 2.35, 17.1, 0, 0.9, 0.25, { bg: '#1a3a8a', fg: '#fff' });
  L.item('melee', 16.2, CY + 1.22, 17.8, { chance: 0.5 });
  P.papers(L, 12, CY + 0.01, 10, 7, 26);
  P.barricade(L, 3.2, CY, 11.5, 0.3);
  P.bench(L, 2.2, CY, 13.3, Math.PI / 2 + 0.3);
  P.corpse(L, 7.5, CY + 0.01, 17, 2.1, 0x2a3a4a);
  L.decal(7.5, CY + 0.012, 17, 0, 1, 0, 1.8, DF.POOL);
  P.corpse(L, 24.5, CY + 0.01, 9.8, -0.6, 0x5a4a2a);
  L.decal(24.2, CY + 0.012, 10.5, 0, 1, 0, 1.5, DF.SMEAR);
  for (let i = 0; i < 6; i++) L.decal(3 + rng() * 25, CY + 0.012, 2 + rng() * 18, 0, 1, 0, 0.8 + rng(), DF.BLOOD1 + (i % 4));
  // ads, notices and the system map
  poster(L, 'FAIRVIEW TRANSIT\nRAPID LINES · 1 2 3 · A B', 17, 2.05, 21.98, 0, 2.6, 1.4, { bg: '#f0ece0', fg: '#1a3a6a', border: '#c83a2a' });
  poster(L, 'KESTREL COLA\nice cold since 1931', 5.5, 2.0, 0.02, Math.PI, 2.2, 1.1, { bg: '#a81a1a', fg: '#fff4d8' });
  poster(L, 'PELICAN AIR\nFly somewhere warm', 26.5, 2.0, 0.02, Math.PI, 2.2, 1.1, { bg: '#2a6ab0', fg: '#fff' });
  poster(L, 'NOTICE\nALL SERVICE SUSPENDED\nBY ORDER OF THE CEDA', 22.5, 2.0, 21.98, 0, 1.8, 1.2, { bg: '#e8e4d0', fg: '#a01a14' });
  poster(L, 'MERCY HOSPITAL\nEVACUATION CENTER\nFOLLOW LINE 3 NORTH', 5.8, 2.0, 21.98, 0, 1.8, 1.2, { bg: '#e8e4d0', fg: '#1a2a4a' });
  poster(L, 'HALVERSON LAW\nHurt? We fight for you.\n555-0142', 29.98, 2.0, 16, Math.PI / 2, 2.0, 1.1, { bg: '#e8d8a8', fg: '#2a1a0a' });
  graf(L, 'NO WAY UP', 29.97, 1.4, 13, Math.PI / 2, 1.8, 0.6, '#1a1a1a');
  // lights
  ceilingLight(L, 5, 4, 5, { type: 'fluoro', intensity: 10, flicker: 0.2 });
  ceilingLight(L, 15, 4, 5, { type: 'fluoro', intensity: 9, flicker: 0.9 });
  ceilingLight(L, 25, 4, 5, { type: 'fluoro', intensity: 10, flicker: 0.5 });
  ceilingLight(L, 5, 4, 16, { type: 'fluoro', intensity: 8, flicker: 0.7 });
  ceilingLight(L, 15, 4, 14, { type: 'fluoro', intensity: 12 });
  L.light(10.5, 1.9, 12.6, 0xffd9a0, 4, 5, { flicker: 0.3 });
  L.light(26.6, 1.4, 20.6, 0xb0d0ff, 3, 4);
  ceilingLight(L, 25, 4, 16, { type: 'fluoro', on: false });
  L.reverb(0, CY, 0, 30, 4, 22, 'hall');
  L.ambience(-0.1, CY - 1, -9, 30.4, 7, 22.4, 'subway');

  // ================================================ STAIRS DOWN TO THE PLATFORM (x 30..40.5, z 3..8)
  L.box(30, -0.4, 3, 31.5, CY, 8, 'tileFloor');
  L.stairs(31.5, 3, 40.5, 8, PY, CY, '-x', 'tileFloor', { stepH: 0.2 });
  L.box(30.4, PY - 0.4, 2.6, 40.1, 4.4, 3, tw);
  L.box(30.4, PY - 0.4, 8, 40.1, 4.4, 8.4, tw);
  L.box(30.4, 4.0, 3, 34, 4.4, 8, 'concrete');
  L.box(34, 1.5, 3, 37, 4.4, 8, 'concrete');
  L.box(37, -0.5, 3, 40.5, 4.4, 8, 'concrete');
  railSegment(L, 31.5, CY + 0.95, 3.1, 40.3, PY + 0.95, 3.1);
  railSegment(L, 31.5, CY + 0.95, 7.9, 40.3, PY + 0.95, 7.9);
  ceilingLight(L, 32.2, 4.0, 5.5, { type: 'fluoro', intensity: 8, flicker: 0.3 });
  ceilingLight(L, 38.6, -0.5, 5.5, { type: 'fluoro', intensity: 7, flicker: 0.8 });
  L.box(28.62, 3.45, 5.48, 28.66, 4, 5.52, 'metalDark', { collide: false });
  sgn(L, 'TRAINS ↓\nDOWNTOWN · PLATFORM 1', 28.6, 3.2, 5.5, Math.PI / 2, 1.9, 0.5, { bg: '#1a1a1a', fg: '#ffffff' });
  L.decal(35, -2.75, 5.5, 0, 1, 0, 1.2, DF.SMEAR);
  L.reverb(30.4, PY, 3, 40.5, 4, 8, 'stairwell');
  L.ambience(30.4, PY - 1, 2.6, 40.5, 4.4, 8.4, 'subway');
}

function buildStation(L, game) {
  const tw = 'tileSubway';
  // ================================================ PLATFORM HALL x 40.5..100
  L.box(HX0, TY - 0.4, 2, HX1, PY - 0.05, PZ1, 'concrete', { tint: 0x9a9a92 });
  L.box(HX0, PY - 0.05, 2, HX1, PY, 8.9, 'tileFloor');
  L.box(HX0, PY - 0.05, 8.9, HX1, PY, 9.4, 'paintedYellow', { tint: 0xd8b830 });
  L.box(HX0, PY - 0.05, 9.4, HX1, PY, PZ1, 'concreteDark');
  L.box(36, TY - 0.4, PZ1, TX1, TY, SW, 'concreteDark', { tint: 0x8a8680 });
  L.box(HX0, -0.5, 1.6, HX1, -0.1, 20.6, 'concrete');
  L.box(HX0, PY, 1.6, HX1, -0.5, 2, tw);
  L.box(40.1, PY, 1.6, HX0, -0.1, 3, tw);
  L.box(40.1, TY - 0.4, 8, HX0, -0.1, PZ1, tw);
  L.box(36, TY - 0.4, 20.2, HX1, -0.5, 20.6, tw);
  // west tunnel stub: caved in
  L.box(36, TY - 0.4, 8.4, 40.1, -0.1, PZ1, 'concreteDark');
  L.box(36, -0.5, PZ1, HX0, -0.1, 20.2, 'concreteDark');
  L.box(35.6, TY - 0.4, 8.4, 36, -0.1, 20.6, 'concreteDark');
  L.box(36, TY, PZ1, 38.8, TY + 2.6, SW, 'concreteDark', { tint: 0x6a6660 });
  P.debris(L, 39.4, TY, 12, 1.2, 'concrete', 10);
  P.debris(L, 39.2, TY, 17.5, 1.3, 'concreteDark', 10);
  for (const [z, r] of [[11, 0.5], [14.5, -0.4], [18.4, 0.3]]) P.prop(L, 38.9, TY + 1.3, z, r).box(0, 0, 0, 1.4, 2.6, 2.4, 'concrete', 0x7a766e, [0.4, 0, 0.5]);
  sgn(L, 'DANGER\nTUNNEL COLLAPSE', 38.82, TY + 2.0, 13.2, -Math.PI / 2, 1.4, 0.55, { bg: '#e8c020', fg: '#101010' });
  // east end: platform end wall + tunnel portal lintel
  L.box(HX1, PY, 1.6, HX1 + 0.4, -0.1, 9.1, tw);
  L.box(HX1, -1.4, 9.1, HX1 + 0.4, -0.1, 20.6, 'concreteDark');
  sgn(L, 'NO PASSENGERS\nBEYOND THIS POINT', HX1 - 0.02, PY + 2.4, 5.5, Math.PI / 2, 1.6, 0.6, { bg: '#e8e4d0', fg: '#a01a14' });
  // track work
  track(L, 38.8, TX1, NT, TY, { third: 1, skip: [[WRECK[0] + 17, WRECK[1]]] });
  track(L, 38.8, TX1, FT, TY, { third: 1, skip: [[WRECK[0], WRECK[0] + 17]] });
  // steel columns between the tracks
  for (let x = 45; x < TX1 - 4; x += 5) {
    if (x > WRECK[0] - 1 && x < WRECK[1] + 1) continue;
    const top = x < HX1 ? -0.5 : -1.4;
    L.box(x - 0.15, TY, CZ - 0.12, x + 0.15, top, CZ + 0.12, 'metalDark', { tint: 0x46505a });
    L.box(x - 0.17, TY, CZ - 0.2, x + 0.17, TY + 0.25, CZ + 0.2, 'concreteDark', { collide: false });
    if (x % 10 === 5) L.box(x - 0.16, TY + 1.1, CZ - 0.13, x + 0.16, TY + 1.4, CZ + 0.13, 'paintedWhite', { collide: false, tint: 0xd8d8d0 });
  }
  // platform columns, signage and benches
  for (const x of [50, 60, 70, 80, 90]) L.box(x - 0.3, PY, 5.45, x + 0.3, -0.5, 6.05, 'tileGreen');
  L.box(HX0, PY + 1.55, 2.0, HX1, PY + 1.8, 2.02, 'tileGreen', { collide: false });
  L.box(36, PY + 2.7, 20.18, HX1, PY + 2.95, 20.2, 'tileGreen', { collide: false });
  for (const x of [45.5, 65.5, 85.5]) sgn(L, 'HAWTHORNE ST', x, PY + 2.35, 2.03, Math.PI, 2.6, 0.5, { bg: '#1a3a2a', fg: '#e8f0e8' });
  for (const x of [52, 72, 92]) sgn(L, 'HAWTHORNE ST', x, PY + 3.4, 20.17, 0, 2.8, 0.55, { bg: '#1a3a2a', fg: '#e8f0e8' });
  poster(L, 'SUNNY ACRES\nretire like you mean it', 55.5, PY + 2.0, 2.02, Math.PI, 2.0, 1.1, { bg: '#e0b040', fg: '#3a2a10' });
  poster(L, 'KESTREL COLA\nice cold since 1931', 75.5, PY + 2.0, 2.02, Math.PI, 2.0, 1.1, { bg: '#a81a1a', fg: '#fff4d8' });
  poster(L, 'CEDA ADVISORY\nAVOID CONTACT WITH\nTHE INFECTED', 95, PY + 2.0, 2.02, Math.PI, 1.6, 1.1, { bg: '#e8e4d0', fg: '#1a2a4a' });
  poster(L, 'CLEARWATER\nbottled at the source', 62, PY + 3.4, 20.17, 0, 2.2, 0.9, { bg: '#3a8ab0', fg: '#fff' });
  poster(L, 'STAND CLEAR OF\nTHE CLOSING DOORS', 82, PY + 3.4, 20.17, 0, 2.2, 0.9, { bg: '#1a1a1a', fg: '#ffd040' });
  for (const x of [45, 57, 66, 76, 86, 95]) P.bench(L, x, PY, 2.35, Math.PI);
  P.trashCan(L, 51.2, PY, 2.4);
  P.trashCan(L, 81.2, PY, 2.4);
  // evacuation checkpoint on the platform: sandbags, body bags, supplies
  P.sandbags(L, 69, PY, 7.6, 0, 3.6, 3);
  P.sandbags(L, 66.6, PY, 6.4, Math.PI / 2, 2.4, 3);
  for (const [x, r] of [[62.5, 0.1], [63.4, -0.05], [64.3, 0.2]]) P.bodyBag(L, x, PY + 0.01, 4, r);
  supplies(L, 71.5, PY, 3.2, Math.PI, ['ammo'], { w: 1.4 });
  L.item('tier1', 72.1, PY + 0.78, 3.2, { chance: 0.6 });
  L.item('molotov', 70.8, PY + 0.78, 3.3, { chance: 0.4 });
  P.barricade(L, 68.5, PY, 8.5, 0);
  sgn(L, 'CEDA\nCHECKPOINT', 66.5, PY + 2.4, 2.03, Math.PI, 1.3, 0.55, { bg: '#e8e4d0', fg: '#1a4a2a' });
  // luggage & bodies
  for (const [x, z] of [[48, 4.2], [59, 7.8], [87, 3.6], [91.5, 7.9]]) { const s = P.prop(L, x, PY, z, rng() * 3); s.box(0, 0.3, 0, 0.7, 0.55, 0.28, 'fabric', [0x2a2a3a, 0x6a2a2a, 0x3a4a2a][Math.floor(rng() * 3)]).box(0, 0.62, 0, 0.3, 0.05, 0.05, 'metalDark'); }
  P.corpse(L, 57.5, PY + 0.01, 8.2, 1.4, 0x3a3a52);
  L.decal(57.5, PY + 0.012, 8.2, 0, 1, 0, 1.6, DF.POOL);
  P.corpse(L, 88.5, PY + 0.01, 4.8, -2.2, 0x6a5a3a);
  L.decal(89, PY + 0.012, 5.5, 0, 1, 0, 2.0, DF.SMEAR);
  L.decal(94, PY + 1.3, 2.03, 0, 0, 1, 0.8, DF.HAND, { noRoll: true });
  for (let i = 0; i < 8; i++) L.decal(44 + rng() * 54, PY + 0.012, 2.6 + rng() * 6.2, 0, 1, 0, 0.7 + rng(), DF.BLOOD1 + (i % 4));
  P.papers(L, 60, PY + 0.01, 5, 12, 26);
  // lights: platform fluoros, a few dead, dark track bed
  for (const [x, z, on, fl] of [[46, 4.2, true, 0.2], [54, 7.6, true, 0.6], [62, 4.2, false, 0], [70, 7.6, true, 0.3], [78, 4.2, true, 0.8], [86, 7.6, false, 0], [94, 4.2, true, 0.5]]) ceilingLight(L, x, -0.5, z, { type: 'fluoro', on, intensity: 13, flicker: fl, range: 11 });
  // red signal at the east portal, far-track work light
  L.box(99.7, TY + 2.2, 19.6, 99.95, TY + 2.9, 19.95, 'blackMatte', { collide: false });
  L.box(99.68, TY + 2.65, 19.7, 99.7, TY + 2.8, 19.85, 'emissiveRed', { collide: false });
  L.light(99.2, TY + 2.7, 19.3, 0xff2010, 3, 5);
  ceilingLight(L, 60, -0.5, 18, { type: 'cage', intensity: 5, flicker: 0.4, range: 8 });
  L.reverb(HX0, PY - 1.2, 1.6, HX1, -0.1, 20.6, 'hall');
  L.ambience(36, TY - 1, 1.6, HX1, 0, 20.6, 'subway');
  L.witchSpots.push({ x: 64, y: TY, z: 18.2 });

  // ================================================ STALLED TRAIN (near track, doors open onto the platform)
  const cars = [
    { cx: 51.5, doorsN: [true, true], doorsS: [false, false], endW: 'cabClosed', endE: 'open', lit: true, flicker: 0.35, number: 4417, ads: ['KESTREL COLA', 'HALVERSON LAW 555-0142'] },
    { cx: 67.4, doorsN: [true, false], doorsS: [false, true], endW: 'open', endE: 'open', lit: false, number: 4418 },
    { cx: 83.3, doorsN: [false, true], doorsS: [false, false], endW: 'open', endE: 'open', lit: true, flicker: 0.8, number: 4419, ads: ['SUNNY ACRES', 'PELICAN AIR'] },
    { cx: 99.2, doorsN: [true, false], doorsS: [false, true], endW: 'open', endE: 'cab', lit: true, flicker: 0.5, number: 4420, dest: '3  DOWNTOWN' },
  ];
  for (const c of cars) trainCar(L, c.cx, TY, NT, Object.assign({ len: 15, seat: 0xa8702a }, c));
  for (const x of [59, 74.9, 90.8]) gangway(L, x, x + 0.9, TY, NT);
  const fy = PY;
  // inside the cars
  P.corpse(L, 64.5, fy + 0.01, NT - 0.2, 1.3, 0x4a3a2a);
  L.decal(64.5, fy + 0.012, NT, 0, 1, 0, 1.8, DF.POOL);
  P.corpse(L, 80.2, fy + 0.46, NT + 1.1, 0.1, 0x2a4a3a);
  L.decal(86, fy + 0.012, NT - 0.3, 0, 1, 0, 1.4, DF.SMEAR);
  L.decal(69, fy + 1.3, NT - 1.42, 0, 0, 1, 0.9, DF.HAND, { noRoll: true });
  L.item('pills', 45.6, fy + 0.48, NT + 1.2, { chance: 0.5 });
  L.item('health', 89.2, fy + 0.48, NT - 1.2, { chance: 0.5 });
  L.item('tier1', 69.5, fy + 0.02, NT + 0.2, { chance: 0.45 });
  L.item('throwable', 104.5, fy + 0.48, NT - 1.2, { chance: 0.4 });
  for (const [x, z] of [[53, NT + 0.3], [78, NT - 0.4], [96, NT + 0.2]]) { const s = P.prop(L, x, fy, z, rng() * 3); s.box(0, 0.25, 0, 0.6, 0.45, 0.25, 'fabric', 0x3a3a3a); }
  P.papers(L, 83, fy + 0.01, NT, 5, 12);

  // ================================================ TUNNEL A (x 100..172)
  const cd = 'concreteDark';
  const alcoves = [[112, 114.4], [128.6, 131]];
  L.wallX(HX1, TX1, 9.3, TY - 0.4, -1.4, cd, 0.4, alcoves.map(([a, b]) => ({ a, b, y0: TY, y1: TY + 2.4 })));
  L.wallX(HX1, TX1, 20.4, TY - 0.4, -1.4, cd, 0.4, [{ a: 164, b: 166.4, y0: TY, y1: TY + 2.4 }]);
  L.box(HX1 + 0.4, -1.4, 9.1, TX1, -1.0, 20.6, cd);
  L.box(TX1, TY - 0.4, 9.1, TX1 + 0.4, -1.0, 20.6, cd);
  for (let x = HX1 + 4; x < TX1; x += 6) L.box(x, -1.7, 9.5, x + 0.35, -1.4, 20.2, 'concrete', { collide: false, tint: 0x5a5854 });
  cableTrayX(L, HX1 + 0.4, TX1, TY + 3.3, 9.5, 1);
  for (let x = HX1 + 0.4; x < TX1 - 1; x += 12) P.pipe(L, x, TY + 3.7, 19.95, Math.min(TX1, x + 12), TY + 3.7, 19.95, 0.12, 'rust');
  for (let x = HX1 + 0.4; x < TX1 - 1; x += 12) P.pipe(L, x, TY + 3.35, 20.0, Math.min(TX1, x + 12), TY + 3.35, 20.0, 0.06, 'metalDark');
  // alcoves
  for (const [a, b] of alcoves) {
    L.box(a, TY - 0.4, 7.2, b, TY, 9.1, cd);
    L.box(a - 0.4, TY - 0.4, 6.8, a, TY + 2.8, 9.1, cd);
    L.box(b, TY - 0.4, 6.8, b + 0.4, TY + 2.8, 9.1, cd);
    L.box(a, TY - 0.4, 6.8, b, TY + 2.8, 7.2, cd);
    L.box(a, TY + 2.4, 7.2, b, TY + 2.8, 9.1, cd);
    const cx = (a + b) / 2;
    P.table(L, cx, TY, 7.62, 0, 1.8, 0.7, 'metalDark');
    ceilingLight(L, cx, TY + 2.4, 8.2, { type: 'cage', intensity: 5, range: 6, flicker: a > 120 ? 0.8 : 0.2 });
    sgn(L, 'REFUGE', cx, TY + 2.62, 9.52, Math.PI, 0.8, 0.2, { bg: '#1a5a2a', fg: '#fff' });
  }
  L.item('pipebomb', 112.8, TY + 0.78, 7.6, { chance: 0.6 });
  L.item('ammo', 113.8, TY + 0.02, 8.6, { chance: 0.6 });
  L.item('pills', 129.3, TY + 0.78, 7.6, { chance: 0.5 });
  L.item('health', 130.4, TY + 0.78, 7.7, { chance: 0.35 });
  P.corpse(L, 130.2, TY + 0.01, 8.6, 2.6, 0xb08a2a);
  L.decal(130, TY + 0.012, 8.6, 0, 1, 0, 1.4, DF.POOL);
  // emergency lights (dim pools), phone, signals
  for (const [x, z, on, fl] of [[105, 19.6, true, 0.2], [117.8, 10, true, 0.5], [124, 10, true, 0.15], [136, 10, false, 0], [143, 19.6, true, 0.8], [152, 19.6, true, 0.3], [160, 10, true, 0.3]]) {
    L.box(x - 0.15, TY + 3.0, z - 0.1, x + 0.15, TY + 3.2, z + 0.1, 'metalDark', { collide: false });
    L.box(x - 0.1, TY + 2.95, z - 0.06, x + 0.1, TY + 3.0, z + 0.06, on ? 'emissiveWarm' : 'blackMatte', { collide: false });
    if (on) L.light(x, TY + 2.8, z + (z < 15 ? 0.4 : -0.4), 0xffb070, 8, 11, { flicker: fl });
  }
  const phone = P.prop(L, 124, TY, 20.2, 0);
  phone.box(0, 1.4, -0.12, 0.5, 0.7, 0.24, 'paintedBlue', 0x1a3a8a).box(0, 1.9, -0.13, 0.3, 0.12, 0.2, 'emissiveCool', 0x3355ff);
  L.light(124, TY + 2, 19.5, 0x3a6aff, 4, 6);
  sgn(L, 'EMERGENCY\nTELEPHONE', 124, TY + 2.35, 20.18, 0, 0.8, 0.3, { bg: '#1a3a8a', fg: '#fff' });
  L.box(145.7, TY + 2.2, 9.5, 146, TY + 2.9, 9.8, 'blackMatte', { collide: false });
  L.box(145.8, TY + 2.65, 9.8, 145.95, TY + 2.8, 9.82, 'emissiveGreen', { collide: false });
  graf(L, 'IT WAS THE\nDRIVER', 120.6, TY + 1.8, 9.52, Math.PI, 1.8, 0.8, '#d8d8c8');
  graf(L, 'KEEP LEFT\nOF THE WRECK', 110, TY + 2.35, 20.18, 0, 2.0, 0.8, '#c8b020');
  // raised service walkway along the south wall (x 104..119)
  L.box(104, TY, 19.0, 119, TY + 0.9, SW, 'concrete', { tint: 0x8a8a84 });
  L.stairs(102.2, 19.0, 104, SW, TY, TY + 0.9, '+x', 'concrete', { stepH: 0.3 });
  L.stairs(119, 19.0, 120.4, SW, TY, TY + 0.9, '-x', 'concrete', { stepH: 0.3 });
  L.box(102.2, TY + 0.9, 18.98, 119, TY + 0.93, 19.06, 'paintedYellow', { collide: false, tint: 0xb89a2a });
  for (let x = 104.5; x < 119; x += 2.1) L.box(x - 0.025, TY + 0.9, 19.08, x + 0.025, TY + 1.95, 19.13, 'metalDark', { collide: false });
  P.pipe(L, 104.2, TY + 1.95, 19.1, 118.8, TY + 1.95, 19.1, 0.022, 'metalDark');
  sgn(L, 'TRACK WORKERS\nKEEP TO WALKWAY', 106.5, TY + 2.0, 20.18, 0, 1.4, 0.45, { bg: '#e8e4d0', fg: '#1a1a1a' });
  // sealed track-access door with something pounding on the other side
  L.box(108.1, TY + 0.9, 9.5, 109.3, TY + 3.1, 9.56, 'paintedGreen', { collide: false, tint: 0x3a5a4a });
  L.box(108.0, TY + 3.1, 9.5, 109.4, TY + 3.2, 9.58, 'metalDark', { collide: false });
  L.box(108.0, TY + 0.9, 9.5, 108.1, TY + 3.1, 9.58, 'metalDark', { collide: false });
  L.box(109.3, TY + 0.9, 9.5, 109.4, TY + 3.1, 9.58, 'metalDark', { collide: false });
  L.box(108.0, TY, 9.5, 109.4, TY + 0.9, 10.3, 'concrete', { tint: 0x8a8a84 });
  sgn(L, 'TRACK ACCESS\nNO. 4', 108.7, TY + 2.8, 9.59, Math.PI, 0.7, 0.3, { bg: '#e8e4d0', fg: '#1a1a1a' });
  graf(L, 'DONT OPEN', 108.7, TY + 2.0, 9.6, Math.PI, 1.0, 0.45, '#b8201a');
  soundEmitter(L, 108.7, TY + 1.8, 9.2, ['doorBang', 'doorBang', 'zIdle'], { min: 4, max: 7, burst: 2, gap: 380, vol: 0.6, first: 2, range: 35 });
  // sparking junction box by the north wall (shock hazard on the floor)
  P.electricPanel(L, 117, TY, 9.72, Math.PI, false);
  sparker(L, 117.2, TY + 1.5, 9.95, { nz: 1, hazard: [116.2, TY, 9.5, 118.4, TY + 1.0, 10.9], dps: 16 });
  for (let i = 0; i < 3; i++) P.pipe(L, 116.6 + i * 0.3, TY + 0.03, 9.9, 115.8 + i * 0.6, TY + 0.03, 10.5 + i * 0.2, 0.025, 'rubber', 0x1a1a1a);

  // ---- DERAILED WRECK: car A blocks the far track, car B the near track (S-bend)
  wreckCar(L, 129.2, TY + 0.02, FT + 0.7, 0.035, { rx: 0.06, rz: 0.015, color: 0x9a9ea0 });
  L.clip(WRECK[0], TY, 19.4, 137.5, TY + 2.4, SW, F_SOLID | F_SHOOT);
  wreckCar(L, 147.4, TY - 0.05, NT + 0.15, -0.07, { rx: -0.07, rz: -0.02, burnt: true });
  L.clip(139, TY, PZ1, 156.5, TY + 2.4, 10.6, F_SOLID | F_SHOOT);
  // broken & bent columns, fallen ceiling slabs, debris
  for (const [x, rz] of [[123, 0.5], [133, -0.35], [150, 0.8]]) P.prop(L, x, TY + 1.2, CZ + (rz > 0 ? 0.5 : -0.5), 0).box(0, 0, 0, 0.3, 2.6, 0.25, 'metalDark', 0x46505a, [0, 0, rz]);
  P.prop(L, 141.5, TY + 0.6, 16.3, 0.4).box(0, 0, 0, 3.2, 0.35, 2.2, 'concrete', 0x6a6660, [0.25, 0, 0.1]);
  L.clip(140.4, TY, 15.6, 142.6, TY + 0.55, 17.0, F_SOLID | F_SHOOT);
  for (const [x, z, r] of [[126, 14.4, 0.9], [138.3, 13.5, 1.0], [144, 17.8, 0.8], [153, 14.8, 1.0], [135, 10.4, 0.7]]) P.debris(L, x, TY, z, r, rng() < 0.5 ? 'concrete' : 'metalDark', 8);
  for (const [x, z, r] of [[137.6, 12.0, 0.2], [143.5, 15.0, 1.9], [125.5, 12.2, 2.6]]) { P.corpse(L, x, TY + 0.01, z, r, [0x2a2a3a, 0x5a3a2a, 0x3a4a5a][Math.floor(rng() * 3)]); L.decal(x, TY + 0.012, z, 0, 1, 0, 1.5, DF.POOL); }
  for (const [x, z] of [[134, 12.8], [144.8, 16.4], [148, 18.2]]) { const s = P.prop(L, x, TY, z, rng() * 3); s.box(0, 0.25, 0, 0.65, 0.5, 0.26, 'fabric', 0x5a2a2a); }
  L.item('throwable', 138.2, TY + 0.02, 14.6, { chance: 0.5 });
  L.item('ammo', 152.5, TY + 0.02, 18.9, { chance: 0.5 });
  fireSource(L, 139.4, TY + 0.1, 10.6, 0.8);
  fireSource(L, 155.4, TY + 0.1, 12.6, 0.6, { hazard: false });
  L.decal(147, -1.42, NT + 1.5, 0, -1, 0, 5, DF.SCORCH);
  sparker(L, 136.4, TY + 3.6, 15.6, { ny: -1, min: 0.4, max: 2, vol: 0.2 });
  P.pipe(L, 136.4, TY + 3.6, 15.6, 136.1, TY + 1.8, 15.9, 0.02, 'rubber', 0x1a1a1a);
  ceilingLight(L, 131, -1.4, 14.2, { type: 'cage', intensity: 5, flicker: 0.9, range: 9, color: 0xffc080 });
  L.light(129.5, TY + 2.3, 18.0, 0xd8f0ff, 5, 7, { flicker: 0.85 });
  // rescue crew's abandoned work lamp at the crossing
  const wl = P.prop(L, 138.2, TY, 18.6, 0.6);
  for (let i = 0; i < 3; i++) wl.box(Math.cos(i * 2.1) * 0.3, 0.9, Math.sin(i * 2.1) * 0.3, 0.04, 1.9, 0.04, 'metalDark', null, [Math.sin(i * 2.1) * 0.25, 0, -Math.cos(i * 2.1) * 0.25]);
  wl.box(0, 1.95, 0, 0.5, 0.35, 0.25, 'paintedYellow', 0xc8a020).box(0, 1.95, -0.13, 0.42, 0.28, 0.02, 'emissiveWarm');
  L.light(138.0, TY + 1.9, 18.0, 0xffe0b0, 11, 13, { flicker: 0.05 });
  // tunnel end: cave-in (x 166..172)
  L.box(168.5, TY, PZ1, TX1, TY + 3.2, SW, cd, { tint: 0x6a6660 });
  for (const [z, r] of [[11.5, 0.6], [15.2, -0.5], [18.5, 0.3]]) P.prop(L, 167.8, TY + 1.4, z, r).box(0, 0, 0, 1.6, 2.8, 2.8, 'concrete', 0x767068, [0.5, 0.2, 0.4]);
  P.debris(L, 166.5, TY, 12.5, 1.5, 'concrete', 12);
  P.debris(L, 166.8, TY, 17, 1.5, 'concreteDark', 12);
  sgn(L, 'SUBSTATION 7\nAUTHORIZED PERSONNEL', 165.2, TY + 2.75, 20.18, 0, 1.6, 0.42, { bg: '#e8c020', fg: '#101010' });
  L.box(165, TY + 3.2, 20.0, 165.4, TY + 3.4, 20.2, 'emissiveRed', { collide: false });
  L.light(165.2, TY + 3.0, 19.3, 0xff3020, 7, 9, { flicker: 0.15 });
  const fd = P.prop(L, 163.4, TY + 0.03, 18.9, 0.5);
  fd.box(0, 0.03, 0, 1.1, 0.05, 2.1, 'paintedGreen', 0x3a5a4a);
  L.reverb(HX1, TY, 9.1, TX1, -1.4, 20.6, 'tunnel');
  L.ambience(HX1, TY - 1, 6.8, TX1 + 0.4, -1.0, 20.6, 'subway');
  L.witchSpots.push({ x: 152, y: TY, z: 18.6 });
}

function script(L, game) {
  const d = game.director;
  // --- platform: infected feeding inside the dark car, sleepers on the far track
  L.trigger(HX0, PY - 0.5, 2, 48, PY + 3, PZ1, () => {
    const inf = game.infected;
    for (const [x, z, idle] of [[65.5, NT - 0.4, 'eat'], [64, NT + 0.5, 'eat'], [63.6, NT - 0.6, 'eat'], [70.5, NT, 'stand'], [76, 16.5, 'lie'], [88, 18, 'sit']]) inf.spawnCommon(x, x < 75 ? PY : TY, z, { idle, yaw: Math.random() * 6 });
    L.after(1.5, () => say(game, [
      { who: 'louis', text: 'End of the line, huh?', d: 0 },
      { who: 'bill', text: 'Cut through the cars. We drop onto the tracks on the other side.', d: 2 },
    ]));
  });
  // --- tunnel mouth: hear them before you see them
  L.trigger(104, TY - 0.5, PZ1, 110, TY + 3, SW, () => {
    game.audio.play('hordeScream', { pos: { x: 150, y: TY + 1, z: 15 }, vol: 0.8 });
    say(game, [{ who: 'zoey', text: 'You hear that?', d: 0.6 }, { who: 'bill', text: 'Yeah. They heard us too. Get ready.', d: 2.2 }]);
    L.after(4, () => d.spawnMob(12, { where: 'ahead', minD: 22, maxD: 60 }));
  });
  L.trigger(118, TY - 0.5, PZ1, 122, TY + 3, SW, () => {
    say(game, [{ who: 'francis', text: 'Somebody drove this train like I drive.', d: 0 }]);
    if (Math.random() < 0.6) d.spawnSpecial(Math.random() < 0.5 ? 'smoker' : 'hunter', { where: 'ahead' });
  });
  L.trigger(156, TY - 0.5, PZ1, 166, TY + 3, SW, () => {
    game.session.objective('Find a way around the cave-in');
    say(game, [{ who: 'louis', text: 'Tunnel\'s caved in! There — a maintenance door!', d: 0.3 }]);
  });
}

export default {
  id: 'subway',
  title: 'The Subway',
  def: {
    director: { wanderers: 22, mobInterval: [70, 120], mobSize: [12, 20], tank: 0.35, witches: 1, relax: [30, 50], outfit: 'subway', maxSpecials: 2 },
    navCell: 0.5,
  },
  build(L, game) {
    L.env = Object.assign(L.env, {
      fog: 0x07080a, fogDensity: 0.024, hemiSky: 0x2a3040, hemiGround: 0x0e0c0a, hemiIntensity: 0.34, envIntensity: 0.08,
      exposure: 1.15, reverb: 'tunnel', ambience: 'subway',
      skyOpts: { hospitalAz: 0.7, hospitalH: 240, moonAz: 0.35, fires: 7, rotation: 0.5 },
    });
    L.menuCam = { x: 43, y: PY + 1.7, z: 5, yaw: -1.35, pitch: -0.04 };
    buildStart(L, game);
    buildStation(L, game);
    buildPowerStation(L, game, Y);
    buildSurface(L, game, Y);
    L.killZone(-100, -60, -100, 400, -22, 250);
    script(L, game);
    L.script = {
      start() {
        L.after(1.5, () => game.session.objective('Head through the subway tunnels'));
      },
    };
  },
  onStart(game) {
    game.voice.script('ch2Start');
  },
};
