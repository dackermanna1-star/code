// Dead Air 1 — rooftops: Building A (the greenhouse and its brick back room,
// the start safe room), the plank bridge over the alley and Building B's roof
// with the stair bulkhead that leads down into the burning apartments.
import * as THREE from 'three';
import { room, ceilingLight, sign, graffiti, safeRoom, supplies, fireSource, burningBarrel, physProp, P, railSegment } from './kit.js';
import { Door, WindowPane } from '../world/dynamic.js';
import { F_SOLID, F_SHOOT, F_SIGHT, F_NONAV } from '../world/collision.js';
import { DF } from '../render/decals.js';
import { parapet, plankBridge, billboard, adTexture, ADS, emissiveMat, neonSign } from './da_parts.js';
import { YA, F4, ZS, ZN, rng, windowGrid, fireEscapeDeco, deadPlant, pot, roofVent, skylight, satDish, lawnChair, stringLights, scatterBlood, bloodTrail } from './da1_common.js';

const NC = { collide: false };
const GLASS = { flags: F_SOLID, surf: 'glass' };

// greenhouse footprint
export const GH = { x0: 9.6, x1: 27, z0: 20.5, z1: 33.5, zc: 27, eave: 2.8, ridge: 4.6 };

function triangle(L, mat, a, b, c, tint) {
  const geo = new THREE.BufferGeometry();
  const pos = [...a, ...b, ...c, ...a, ...c, ...b];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  L.mesh(geo, mat, new THREE.Matrix4(), { tint });
}

// ================================================================ BUILDING A
function buildA(L, game, S) {
  // body + roof deck
  L.box(0, -0.5, ZN, 32, YA - 0.12, ZS, 'brickTan', { ao: 0.9, tint: 0xc8b8a4 });
  L.box(0, YA - 0.12, ZN, 32, YA, ZS, 'roof');
  windowGrid(L, 's', 0.4, 31.6, ZS, 3.6, YA, { lit: 0.12, ac: 0.3, curtains: 0.6 });
  windowGrid(L, 'e', ZN + 0.4, ZS - 0.4, 32, 0, YA, { lit: 0.05, broken: 0.15 });
  windowGrid(L, 'w', ZN + 0.4, ZS - 0.4, 0, 0, YA, { lit: 0.08 });
  windowGrid(L, 'n', 0.4, 31.6, ZN, 0, YA, { lit: 0.07, ac: 0.2 });
  fireEscapeDeco(L, 'n', 18, 24, ZN, 3.6, YA - 1, 3.6);
  // ground floor: a closed deli with a torn awning
  L.box(2, 0.6, ZS + 0.005, 14, 2.9, ZS + 0.03, 'glassDirty', { collide: false, tint: 0x10161a });
  L.box(1.6, 3.0, ZS, 14.4, 3.15, ZS + 1.6, 'fabric', { collide: false, tint: 0x1e4a2a });
  sign(L, 'PALISADE DELI', 8, 3.55, ZS + 0.03, 0, 5.5, 0.6, { bg: '#1a2a1a', fg: '#e8d8a0', font: 'Georgia, serif' });
  L.box(17, 0.0, ZS + 0.005, 19.4, 2.4, ZS + 0.04, 'woodDark', { collide: false });
  sign(L, 'THE PALISADE  ·  APARTMENTS', 18.2, 2.75, ZS + 0.03, 0, 3.4, 0.3, { bg: '#2a2622', fg: '#c8b890' });
  // cornice + parapet (gap for the plank on the east side)
  L.box(-0.1, YA - 0.5, ZN - 0.1, 32.1, YA - 0.3, ZS + 0.12, 'concrete', { collide: false, tint: 0x9a948a });
  parapet(L, 0, ZN, 32, ZS, YA, { mat: 'brickTan', tint: 0xc8b8a4, e: { gaps: [[36.2, 37.8]] } });

  // ---------------------------------------------------------- brick annex
  // start safe room (the greenhouse back room) x 3..9.6 z 24..33.5, boiler room north of it
  const sr = safeRoom(L, {
    x0: 3, z0: 24, x1: 9.6, z1: 33.5, y: YA, h: 3.0, doorWall: 'e', doorAt: 27, hinge: 1, wall: 'brick', floor: false, ceil: false,
    graffiti: ['PLANES ARE\nSTILL LANDING', 'METRO INTL\nGATE C', 'ROOFTOPS\nARE SAFER', 'WE TRIED\nTHE STREET', 'JOSIE + TOM\nWAITED HERE'],
    extraOpen: { s: [{ at: 7.9, w: 1.1, window: true, sill: 1.15, h: 0.95, glass: false }] },
  });
  S.startDoor = sr.door;
  L.box(3, YA, 24, 9.6, YA + 0.015, 33.5, 'woodFloorDark', NC);
  L.box(3, YA + 2.95, 24, 9.6, YA + 3.0, 33.5, 'wood', { collide: false, tint: 0x8a7a64 });
  for (let z = 24.6; z < 33.4; z += 1.2) L.box(3.1, YA + 2.78, z, 9.5, YA + 2.95, z + 0.14, 'woodDark', NC); // joists
  // barred window (static glass, iron bars)
  L.box(7.35, YA + 1.15, 33.49, 8.45, YA + 2.1, 33.51, 'glassDirty', { flags: F_SOLID, tint: 0x3a4a48 });
  for (let x = 7.45; x < 8.45; x += 0.18) L.box(x, YA + 1.15, 33.36, x + 0.03, YA + 2.1, 33.4, 'metalDark', NC);
  // boiler room (inaccessible) x 3..9.6 z 20.5..24
  L.box(2.9, YA, 20.4, 9.7, YA + 3.0, 20.6, 'brick');
  L.box(2.9, YA, 20.6, 3.1, YA + 3.0, 23.9, 'brick');
  L.box(9.5, YA, 20.6, 9.7, YA + 3.0, 23.9, 'brick');
  L.box(3.1, YA, 20.6, 9.5, YA + 2.95, 23.9, 'concrete', { visible: false });
  L.box(5.4, YA, 20.3, 6.5, YA + 2.15, 20.4, 'metal', { collide: false, tint: 0x5a6a5a });
  sign(L, 'BOILER ROOM\nKEEP LOCKED', 5.95, YA + 1.6, 20.29, Math.PI, 0.7, 0.35, { bg: '#d8d0b0', fg: '#8a1a10' });
  // annex roof slab, low parapet, chimney, small water tank
  L.box(2.8, YA + 3.0, 20.3, 9.8, YA + 3.3, 33.7, 'roof');
  L.box(2.8, YA + 3.3, 20.3, 9.8, YA + 3.6, 20.5, 'brick', NC);
  L.box(2.8, YA + 3.3, 33.5, 9.8, YA + 3.6, 33.7, 'brick', NC);
  L.box(2.8, YA + 3.3, 20.5, 3.0, YA + 3.6, 33.5, 'brick', NC);
  L.box(3.6, YA + 3.3, 21, 4.6, YA + 5.2, 22, 'brickDark', NC);
  L.box(3.5, YA + 5.2, 20.9, 4.7, YA + 5.35, 22.1, 'concrete', NC);
  game && L.dynamics.push({ t: 0, update(dt) { this.t += dt; if (this.t > 0.25) { this.t = 0; if (Math.random() < 0.5 && game.camPos.distanceTo(new THREE.Vector3(4.1, YA + 5.4, 21.5)) < 60) game.fx.smokeColumn(4.1, YA + 5.4, 21.5, 0.25, [0.16, 0.15, 0.15]); } } });
  P.prop(L, 7.4, YA + 3.3, 30.5, 0).cyl(0, 0.7, 0, 0.8, 1.4, 'plastic', 0x2a4a6a, null, 14).cyl(0, 1.42, 0, 0.82, 0.05, 'plastic', 0x1a3a5a, null, 14);

  // ---------------------------------------------------------- safe room dressing
  const Y = YA;
  supplies(L, 3.62, Y, 28.3, Math.PI / 2, ['medkit', 'medkit', 'medkit', 'medkit'], { w: 2.0, mat: 'woodDark' });
  supplies(L, 5.9, Y, 32.95, 0, ['smg', 'pumpShotgun', 'silencedSmg', 'chromeShotgun'], { w: 2.6, mat: 'woodPale' });
  // potting bench with throwables
  const pb = P.prop(L, 6.3, Y, 24.5, 0);
  pb.box(0, 0.86, 0, 2.4, 0.06, 0.7, 'woodPale', 0x9a8a6a);
  for (const sx of [-1.1, 1.1]) for (const sz of [-0.28, 0.28]) pb.box(sx, 0.42, sz, 0.07, 0.84, 0.07, 'woodDark');
  pb.box(0, 0.25, 0, 2.3, 0.03, 0.6, 'woodPale', 0x8a7a5a);
  pb.box(0, 1.25, -0.3, 2.4, 0.8, 0.05, 'wood', 0x7a6a50);
  pb.col(0, 0.45, 0, 2.4, 0.9, 0.7, 'wood');
  for (let i = 0; i < 4; i++) L.item(['molotov', 'pipebomb', 'molotov', 'pipebomb'][i], 5.4 + i * 0.6, Y + 0.9, 24.55, { yaw: 0.3 * i });
  for (let i = 0; i < 5; i++) pot(L, 5.2 + i * 0.5, Y + 0.25, 24.3, 0.09, 0.14, i % 2 === 0);
  L.item('ammo', 8.7, Y + 0.02, 31.9, {});
  L.item('pills', 8.9, Y + 0.02, 24.6, { chance: 0.5 });
  // cot + sleeping bag, crates, lantern, radio
  const cot = P.prop(L, 3.75, Y, 31.4, 0);
  cot.box(0, 0.4, 0, 0.8, 0.05, 1.9, 'fabric', 0x4a5a3a).box(0, 0.47, 0.1, 0.72, 0.1, 1.5, 'fabric', 0x7a2a1a).box(0, 0.5, -0.75, 0.5, 0.12, 0.3, 'fabric', 0xc8c0b0);
  for (const sz of [-0.9, 0.9]) cot.box(0, 0.2, sz, 0.8, 0.4, 0.04, 'metalDark');
  cot.col(0, 0.25, 0, 0.8, 0.5, 1.9, 'fabric');
  P.crate(L, 8.9, Y, 25.2, 0.2, 0.7);
  P.crate(L, 8.9, Y + 0.7, 25.2, 0.6, 0.5);
  P.prop(L, 8.9, Y + 1.2, 25.2, 0.4).box(0, 0.12, 0, 0.35, 0.22, 0.15, 'plastic', 0x2a2a2a).box(0.1, 0.18, -0.08, 0.1, 0.06, 0.01, 'emissiveGreen');
  P.prop(L, 5.2, Y + 0.77, 32.95, 0).cyl(0, 0.15, 0, 0.08, 0.3, 'metalDark', null, null, 8).cyl(0, 0.15, 0, 0.06, 0.18, 'emissiveWarm', null, null, 8);
  L.light(5.2, Y + 1.3, 32.6, 0xffb060, 5, 6, { flicker: 0.15 });
  // soil sacks, tools, shelf of pots
  for (let i = 0; i < 4; i++) P.prop(L, 8.8, Y + i * 0.22, 29.6 + (i % 2) * 0.1, 0.1 * i).box(0, 0.11, 0, 0.55, 0.22, 0.9, 'fabric', i % 2 ? 0x6a5a3a : 0x3a5a2a);
  for (const [dz, r] of [[0, 0.15], [0.35, -0.1]]) P.prop(L, 9.35, Y, 30.9 + dz, 0).box(0, 0.8, 0, 0.04, 1.6, 0.04, 'woodPale', null, [0, 0, r]).box(0, 1.55, 0, 0.3, 0.05, 0.05, 'metalDark', null, [0, 0, r]);
  P.rug(L, 6.5, Y + 0.02, 28.5, 2.2, 3.0, 0x4a2a1a);
  sign(L, 'NEWBURG ROOFTOP\nGARDEN CO-OP', 3.13, Y + 2.2, 28.3, Math.PI / 2, 1.4, 0.45, { bg: '#e0d8c0', fg: '#2a4a2a', font: 'Georgia, serif' });
  // survivors start here, facing the door (east)
  for (const [x, z] of [[6.2, 26.6], [7.4, 27.5], [5.6, 28.4], [7.0, 29.4]]) L.survivorStart.push({ x, y: Y, z, yaw: -Math.PI / 2 });
  L.flowStart = [6.5, Y, 28];

  // ---------------------------------------------------------- the greenhouse
  buildGreenhouse(L, game, S);

  // ---------------------------------------------------------- A roof (outside)
  // north strip: HVAC, ducts, dishes, pigeon coop
  P.acUnit(L, 12.5, YA, 18.3, 0);
  P.acUnit(L, 16, YA, 18.3, 0);
  P.pipe(L, 12.5, YA + 1.3, 18.3, 12.5, YA + 2.2, 18.3, 0.2, 'metal');
  P.pipe(L, 12.5, YA + 2.2, 18.3, 12.5, YA + 2.2, 20.2, 0.2, 'metal');
  satDish(L, 22.5, YA, 17.3, 0.6);
  satDish(L, 24, YA, 17.2, 0.4, 0.45);
  const coop = P.prop(L, 19.6, YA, 18.4, 0);
  coop.box(0, 0.4, 0, 2.2, 0.8, 1.2, 'woodDark').box(0, 1.3, 0, 2.2, 1.0, 1.2, 'metalDark', 0x3a3a3a).box(0, 1.85, 0, 2.4, 0.08, 1.4, 'metal', 0x6a6a64);
  coop.col(0, 0.95, 0, 2.2, 1.9, 1.2, 'wood');
  L.decal(19.6, YA + 0.01, 19.6, 0, 1, 0, 1.2, DF.SPLAT_BIG, { tint: 0xe8e8e0 });
  roofVent(L, 7, YA, 18, 0.3, 1.2);
  roofVent(L, 26.5, YA, 17.6, 0.2, 0.8);
  // east strip: water tower + A's own locked roof door
  P.waterTower(L, 29.4, YA, 19.2);
  const bh = { x0: 28.2, x1: 31.65, z0: 22, z1: 25.2 };
  L.box(bh.x0, YA, bh.z0, bh.x1, YA + 2.7, bh.z1, 'brickTan', { tint: 0xb8a894 });
  L.box(bh.x0 - 0.1, YA + 2.7, bh.z0 - 0.1, bh.x1 + 0.05, YA + 2.9, bh.z1 + 0.1, 'roof');
  L.box(29.4, YA, bh.z1, 30.5, YA + 2.1, bh.z1 + 0.05, 'metal', { collide: false, tint: 0x6a2a1a });
  P.pipe(L, 29.5, YA + 1.0, bh.z1 + 0.08, 30.4, YA + 1.1, bh.z1 + 0.08, 0.02, 'chrome');
  sign(L, 'ROOF ACCESS\nALARMED', 29.95, YA + 2.35, bh.z1 + 0.06, 0, 0.8, 0.32, { bg: '#e8e0c8', fg: '#8a1010' });
  graffiti(L, 'CHAINED\nFROM INSIDE', bh.x0 - 0.02, YA + 1.4, 23.6, -Math.PI / 2, 1.6, 0.8, '#d8d8c8');
  ceilingLight(L, 29.95, YA + 2.6, bh.z1 + 0.35, { type: 'cage', intensity: 6, range: 7, flicker: 0.3 });
  // south strip: rooftop hangout, laundry, billboard (faces the street)
  const bb = billboard(L, 16, YA, 42.9, 0, 13, 4.6, adTexture(ADS.flyNewburg), { lightIntensity: 10 });
  S.billboardA = bb;
  for (const [x, z, r, c] of [[13.2, 37.4, 0.4, 0x3a7a8a], [14.8, 38.2, -0.3, 0xc84a2a], [18.4, 37.2, 2.8, 0x3a7a8a]]) lawnChair(L, x, YA, z, r, c);
  P.table(L, 16.2, YA, 37.6, 0.2, 1.0, 0.7, 'plastic');
  for (let i = 0; i < 4; i++) physProp(L, 'bottle', 15.9 + i * 0.18, YA + 0.76, 37.5 + (i % 2) * 0.12);
  L.item('pills', 16.5, YA + 0.78, 37.8, { chance: 0.5 });
  P.kettleGrill(L, 19.6, YA, 38.8, 0.4);
  P.cooler(L, 21, YA, 37.6, 0.3, 0x2a5ab8);
  for (const x of [11.5, 22.5]) L.box(x - 0.05, YA, 39.95, x + 0.05, YA + 2.6, 40.05, 'metalDark', NC);
  stringLights(L, [[11.5, 40], [17, 36.3], [22.5, 40]], YA + 2.55);
  L.light(17, YA + 2.1, 37.8, 0xffc080, 6, 9, { flicker: 0.08 });
  // laundry lines
  for (const z of [36, 40]) for (const x of [3.2, 8.8]) L.box(x - 0.04, YA, z - 0.04, x + 0.04, YA + 1.9, z + 0.04, 'metalDark', NC);
  for (const z of [36, 40]) {
    P.pipe(L, 3.2, YA + 1.85, z, 8.8, YA + 1.85, z, 0.006, 'fabric', 0xdddddd);
    for (let i = 0; i < 4; i++) if (rng() < 0.8) L.box(3.6 + i * 1.3, YA + 1.15 + rng() * 0.2, z - 0.02, 4.4 + i * 1.3, YA + 1.84, z + 0.02, 'fabric', { collide: false, tint: rng.pick([0xd8d8d0, 0x6a8ab0, 0xb04040, 0xd8c890, 0x3a3a3a]) });
  }
  // lumber (where the plank came from), sawhorses, rope, tools by the bridge
  for (let i = 0; i < 5; i++) L.box(27.8, YA + i * 0.07, 40.2 + i * 0.02, 31.3, YA + 0.06 + i * 0.07, 40.5 + i * 0.02, 'woodPale', { tint: 0x9a8a70 });
  for (let i = 0; i < 3; i++) L.box(27.8, YA, 40.7 + i * 0.35, 31.3, YA + 0.06, 41 + i * 0.35, 'woodPale', { tint: 0x8a7a60, collide: false });
  for (const x of [28.4, 30.6]) P.sawhorse(L, x, YA, 38.9, Math.PI / 2, 1.0, 0xc8b08a, false);
  P.prop(L, 30.8, YA, 42.6, 0).cyl(0, 0.08, 0, 0.35, 0.16, 'fabric', 0x8a7a5a, null, 12);
  P.prop(L, 29.2, YA, 42.8, 0.3).box(0, 0.12, 0, 0.5, 0.24, 0.22, 'paintedRed', 0xb02020).col(0, 0.12, 0, 0.5, 0.24, 0.22, 'metal');
  L.item('ammo', 29.2, YA + 0.26, 42.8, { chance: 0.35 });
  graffiti(L, 'PLANK\n→ BREWER\nBLDG', 31.62, YA + 0.65, 34.8, -Math.PI / 2, 1.5, 0.9, '#f0e0a0');
  L.decal(30.5, YA + 0.01, 37, 0, 1, 0, 1.2, DF.SMEAR);
  // a survivor who didn't make it across
  P.corpse(L, 26.2, YA + 0.01, 41.4, 2.6, 0x3a3a2a);
  L.decal(26.2, YA + 0.012, 41.4, 0, 1, 0, 1.8, DF.POOL);
  bloodTrail(L, 30.8, 37.3, 26.8, 41, YA, 6);
  // lights: bulb over the greenhouse door
  ceilingLight(L, GH.x1 + 0.4, YA + 2.9, GH.zc, { type: 'cage', intensity: 7, range: 8, flicker: 0.15 });
  L.reverb(0, YA, ZN, 32, YA + 12, ZS, 'outdoor');
  L.ambience(0, YA, ZN, 66, YA + 30, ZS, 'rooftop');
}

// ================================================================ GREENHOUSE
function buildGreenhouse(L, game, S) {
  const { x0, x1, z0, z1, zc, eave, ridge } = GH;
  const Y = YA;
  const grow = emissiveMat('daGrowLight', 0xd040ff, 2.6);
  L.box(x0, Y, z0, x1, Y + 0.02, z1, 'tileFloor', { collide: false, tint: 0xa07a62 });
  // knee walls (brick) + wooden cap
  const knee = 0.8;
  L.box(x0, Y, z0, x1, Y + knee, z0 + 0.3, 'brick');
  L.box(x0, Y, z1 - 0.3, x1, Y + knee, z1, 'brick');
  L.box(x1 - 0.3, Y, z0 + 0.3, x1, Y + knee, zc - 1.1, 'brick');
  L.box(x1 - 0.3, Y, zc + 1.1, x1, Y + knee, z1 - 0.3, 'brick');
  L.box(x0, Y + knee, z0 - 0.03, x1, Y + knee + 0.05, z0 + 0.33, 'woodDark', NC);
  L.box(x0, Y + knee, z1 - 0.33, x1, Y + knee + 0.05, z1 + 0.03, 'woodDark', NC);
  L.box(x1 - 0.33, Y + knee, z0, x1 + 0.03, Y + knee + 0.05, zc - 1.1, 'woodDark', NC);
  L.box(x1 - 0.33, Y + knee, zc + 1.1, x1 + 0.03, Y + knee + 0.05, z1, 'woodDark', NC);
  // glass walls with iron mullions. panes: north/south 12 x 1.45 m; some broken, a few breakable
  const np = 12, pw = (x1 - x0) / np;
  const gy0 = Y + knee + 0.05, gy1 = Y + eave;
  const brokenN = new Set([3, 9]), brokenS = new Set([6, 7]), paneN = new Set([5]), paneS = new Set([2, 10]);
  for (let i = 0; i < np; i++) {
    const a = x0 + i * pw, b = a + pw;
    // north
    if (brokenN.has(i)) shards(L, a, b, z0 + 0.15, gy0, 'x');
    else if (paneN.has(i)) new WindowPane(L, a + 0.03, gy0, z0 + 0.13, b - 0.03, gy1, z0 + 0.17, { dirty: true });
    else L.box(a + 0.03, gy0, z0 + 0.135, b - 0.03, gy1, z0 + 0.165, 'glassDirty', { ...GLASS, tint: 0x9aaa98 });
    // south
    if (brokenS.has(i)) shards(L, a, b, z1 - 0.15, gy0, 'x');
    else if (paneS.has(i)) new WindowPane(L, a + 0.03, gy0, z1 - 0.17, b - 0.03, gy1, z1 - 0.13, { dirty: true });
    else L.box(a + 0.03, gy0, z1 - 0.165, b - 0.03, gy1, z1 - 0.135, 'glassDirty', { ...GLASS, tint: 0x9aaa98 });
    // mullions + horizontal glazing bar
    for (const zz of [z0 + 0.15, z1 - 0.15]) {
      L.box(a - 0.035, gy0, zz - 0.045, a + 0.035, gy1, zz + 0.045, 'metalDark', { ...NC, tint: 0x3a4a40 });
      L.box(a, Y + 1.8, zz - 0.03, b, Y + 1.85, zz + 0.03, 'metalDark', { ...NC, tint: 0x3a4a40 });
    }
  }
  // (the safe room's broken south panes allow infected over the knee wall; the glass itself stops nothing but bodies)
  // east wall glazing (door gap zc-1..zc+1, transom above)
  const ez = x1 - 0.15;
  for (const [a, b] of [[z0 + 0.3, zc - 1.1], [zc + 1.1, z1 - 0.3]]) {
    const n = Math.round((b - a) / 1.45);
    for (let k = 0; k < n; k++) {
      const za = a + k * (b - a) / n, zb = za + (b - a) / n;
      if (a > zc && k === 1) shards(L, za, zb, ez, gy0, 'z');
      else L.box(ez - 0.015, gy0, za + 0.03, ez + 0.015, gy1, zb - 0.03, 'glassDirty', { ...GLASS, tint: 0x9aaa98 });
      L.box(ez - 0.045, gy0, za - 0.035, ez + 0.045, gy1, za + 0.035, 'metalDark', { ...NC, tint: 0x3a4a40 });
    }
  }
  L.box(ez - 0.015, Y + 2.3, zc - 1.05, ez + 0.015, gy1, zc + 1.05, 'glassDirty', { collide: false, tint: 0x9aaa98 });
  for (const zz of [zc - 1.1, zc + 1.1]) L.box(ez - 0.06, Y, zz - 0.06, ez + 0.06, gy1, zz + 0.06, 'metalDark', { tint: 0x3a4a40 });
  L.box(ez - 0.06, Y + 2.25, zc - 1.1, ez + 0.06, Y + 2.33, zc + 1.1, 'metalDark', { ...NC, tint: 0x3a4a40 });
  // door leaves swung wide open (outside), one hanging off its hinge
  P.prop(L, x1 + 0.52, Y, zc - 1.55, 0.1).box(0, 1.1, 0, 1.0, 2.2, 0.05, 'metalDark', 0x3a4a40).box(0, 1.2, 0, 0.86, 1.9, 0.02, 'glassDirty', 0x9aaa98);
  P.prop(L, x1 + 0.7, Y, zc + 1.7, -0.5).box(0, 1.05, 0, 1.0, 2.2, 0.05, 'metalDark', 0x3a4a40, [0, 0, 0.12]);
  // eave beams, corner posts, ridge, rafters and the pitched glass roof
  for (const zz of [z0 + 0.15, z1 - 0.15]) L.box(x0, gy1, zz - 0.08, x1, gy1 + 0.12, zz + 0.08, 'metalDark', { ...NC, tint: 0x3a4a40 });
  L.box(ez - 0.08, gy1, z0, ez + 0.08, gy1 + 0.12, z1, 'metalDark', { ...NC, tint: 0x3a4a40 });
  for (const [xx, zz] of [[x1 - 0.15, z0 + 0.15], [x1 - 0.15, z1 - 0.15]]) L.box(xx - 0.08, Y, zz - 0.08, xx + 0.08, gy1 + 0.12, zz + 0.08, 'metalDark', { tint: 0x3a4a40 });
  const run = zc - (z0 + 0.15), rise = ridge - eave;
  const slope = Math.atan2(rise, run), len = Math.hypot(rise, run);
  const roofP = P.prop(L, (x0 + x1) / 2, Y, zc, 0);
  const cxm = (x0 + x1) / 2;
  roofP.box(0, ridge + 0.08, 0, x1 - x0, 0.12, 0.14, 'metalDark', 0x3a4a40);
  const missingRoof = new Set(['n4', 's8', 's9', 'n10']);
  for (let i = 0; i < np; i++) {
    const cx = x0 + (i + 0.5) * pw - cxm;
    for (const [side, sgn] of [['n', -1], ['s', 1]]) {
      const zmid = sgn * run / 2, ymid = eave + rise / 2 + 0.12;
      if (!missingRoof.has(side + i)) roofP.box(cx, ymid, zmid, pw - 0.06, 0.02, len, 'glassDirty', 0x8a9a88, [sgn * slope, 0, 0]);
    }
  }
  for (let i = 0; i <= np; i++) {
    const cx = x0 + i * pw - cxm;
    for (const sgn of [-1, 1]) roofP.box(cx, eave + rise / 2 + 0.16, sgn * run / 2, 0.06, 0.1, len, 'metalDark', 0x3a4a40, [sgn * slope, 0, 0]);
  }
  // purlins
  for (const t of [0.33, 0.66]) for (const sgn of [-1, 1]) roofP.box(0, eave + rise * t + 0.2, sgn * run * (1 - t), x1 - x0, 0.06, 0.06, 'metalDark', 0x3a4a40);
  // roof vents (propped open)
  for (const cx of [-4, 4]) roofP.box(cx, ridge - 0.25, -0.9, 1.4, 0.03, 1.2, 'glassDirty', 0x8a9a88, [-slope - 0.35, 0, 0]);
  // gables (glass triangles above the eave)
  for (const xx of [x0 + 0.02, x1 - 0.12]) {
    triangle(L, 'glassDirty', [xx, Y + eave, z0 + 0.15], [xx, Y + eave, z1 - 0.15], [xx, Y + ridge, zc], 0x8a9a88);
  }
  L.box(x1 - 0.2, Y + eave, zc - 0.05, x1 - 0.08, Y + ridge, zc + 0.05, 'metalDark', { ...NC, tint: 0x3a4a40 });
  // broken roof glass on the floor
  for (const [x, z] of [[x0 + 4.5 * pw, 23.5], [x0 + 8.5 * pw, 30.2], [x0 + 9.5 * pw, 30.8], [x0 + 10.5 * pw, 23.3]]) glassShardsFloor(L, x, Y + 0.02, z);

  // ------------------------------------------------ benches, beds, lights
  // north: two long grow benches (steel), south: two raised soil beds
  for (const [a, b] of [[10.4, 16.9], [19.1, 25.9]]) {
    const cx = (a + b) / 2, w = b - a;
    const bn = P.prop(L, cx, Y, 22.9, 0);
    bn.box(0, 0.86, 0, w, 0.05, 1.3, 'metalDark', 0x5a6a5a);
    bn.box(0, 0.3, 0, w - 0.1, 0.03, 1.2, 'metalDark', 0x4a5a4a);
    for (let k = 0; k <= 4; k++) for (const sz of [-0.58, 0.58]) bn.box(-w / 2 + 0.05 + k * (w - 0.1) / 4, 0.43, sz, 0.05, 0.86, 0.05, 'metalDark');
    bn.col(0, 0.46, 0, w, 0.92, 1.3, 'metal');
    // seed trays + pots (a few still green under the lights)
    for (let k = 0; k < Math.floor(w / 0.7); k++) {
      const tx = a + 0.4 + k * 0.7;
      if (k % 3 === 1) pot(L, tx, Y + 0.89, 22.6 + (k % 2) * 0.5, 0.13, 0.22, true);
      else {
        L.box(tx - 0.28, Y + 0.89, 22.35, tx + 0.28, Y + 0.95, 23.45, 'plastic', { collide: false, tint: 0x1a1a1a });
        const green = cx < 18 && k < 4;
        for (let s = 0; s < 6; s++) L.box(tx - 0.2 + (s % 2) * 0.3, Y + 0.95, 22.5 + Math.floor(s / 2) * 0.35, tx - 0.12 + (s % 2) * 0.3, Y + 1.0 + rng() * 0.08, 22.58 + Math.floor(s / 2) * 0.35, 'foliage', { collide: false, tint: green ? 0x3a7a2a : 0x5a4a2a });
      }
    }
    // bags and buckets under the bench
    for (let k = 0; k < 3; k++) P.prop(L, a + 0.8 + k * (w / 3), Y + 0.33, 22.9, rng()).box(0, 0.12, 0, 0.5, 0.24, 0.35, 'fabric', rng.pick([0x5a4a2a, 0x3a5a3a, 0x7a6a4a]));
  }
  for (const [a, b] of [[10.4, 16.9], [19.1, 25.9]]) {
    const cx = (a + b) / 2, w = b - a;
    L.box(a, Y, 29.6, b, Y + 0.5, 31.9, 'brick', { tint: 0x9a6a50 });
    L.box(a + 0.12, Y + 0.5, 29.72, b - 0.12, Y + 0.52, 31.78, 'dirt', { collide: false, tint: 0x3a2a1c });
    for (let k = 0; k < Math.floor(w / 0.9); k++) {
      const px = a + 0.5 + k * 0.9;
      for (const pz of [30.2, 31.3]) {
        deadPlant(L, px + (rng() - 0.5) * 0.2, Y + 0.52, pz, 1.4 + rng() * 0.8);
        if (rng() < 0.5) L.box(px - 0.012, Y + 0.52, pz - 0.012, px + 0.012, Y + 1.8, pz + 0.012, 'woodPale', NC); // stake
      }
    }
    // hanging grow light fixtures above bench + bed rows
    for (const [zz, on] of [[22.9, true], [30.75, cx > 18 ? false : true]]) {
      const fy = Y + 2.35;
      L.box(a + 0.3, fy, zz - 0.18, b - 0.3, fy + 0.1, zz + 0.18, 'metalClean', { collide: false, tint: 0x8a8e8a });
      L.box(a + 0.4, fy - 0.03, zz - 0.13, b - 0.4, fy, zz + 0.13, on ? grow : 'blackMatte', NC);
      for (const xx of [a + 0.5, b - 0.5]) P.pipe(L, xx, fy + 0.1, zz, xx, Y + eave + 0.2, zz, 0.006, 'metalDark');
    }
  }
  // grow-light glow (magenta), one flickering, plus a warm work lamp by the door
  S.growLights = [
    L.light(13.6, YA + 2.1, 22.9, 0xc050ff, 7, 7, { flicker: 0.05 }),
    L.light(22.5, YA + 2.1, 22.9, 0xc050ff, 7, 7, { flicker: 0.6 }),
    L.light(13.6, YA + 2.1, 30.75, 0xc050ff, 6, 6.5, { flicker: 0.1 }),
  ];
  L.light(24.8, YA + 2.3, 27, 0xffd8a0, 4, 6, { flicker: 0.2 });
  // cross-aisle wheelbarrow, hoses, water tank, potting table, soil sacks, palms by the door
  const wb = P.prop(L, 18.1, Y, 32.2, 0.5);
  wb.box(0, 0.5, 0, 0.7, 0.35, 1.0, 'metal', 0x3a6a3a, [0.1, 0, 0]).cyl(0, 0.2, -0.6, 0.18, 0.08, 'rubber', 0x151515, [0, 0, Math.PI / 2], 10).box(0, 0.45, 0.7, 0.5, 0.04, 0.6, 'woodDark');
  wb.col(0, 0.4, 0, 0.7, 0.8, 1.3, 'metal');
  P.prop(L, 25.9, Y, 21.4, 0).cyl(0, 0.7, 0, 0.55, 1.4, 'plastic', 0x2a5a8a, null, 14).cyl(0, 1.41, 0, 0.3, 0.05, 'plastic', 0x1a3a6a, null, 12).col(0, 0.7, 0, 1.1, 1.4, 1.1, 'plastic');
  P.pipe(L, 25.9, Y + 0.2, 21.9, 25.9, Y + 0.2, 26.5, 0.03, 'plastic', 0x2a7a3a);
  P.pipe(L, 25.9, Y + 0.2, 26.5, 21, Y + 0.02, 27.4, 0.03, 'plastic', 0x2a7a3a);
  P.pipe(L, 10.2, Y + 0.95, 20.9, 26.4, Y + 0.95, 20.9, 0.02, 'metal', 0x6a6a64);
  P.pipe(L, 10.2, Y + 0.95, 33.1, 26.4, Y + 0.95, 33.1, 0.02, 'metal', 0x6a6a64);
  for (let i = 0; i < 5; i++) P.prop(L, 11.2 + (i % 2) * 0.1, Y + Math.floor(i / 2) * 0.22, 32.8 - (i % 2) * 0.05, 0.05 * i).box(0, 0.11, 0, 0.9, 0.22, 0.55, 'fabric', i % 2 ? 0x6a5a3a : 0x3a4a2a);
  for (const zz of [zc - 1.8, zc + 1.8]) {
    const pl = P.prop(L, x1 - 1.0, Y, zz, 0);
    pl.cyl(0, 0.35, 0, 0.42, 0.7, 'dirt', 0x8a4a2a, null, 12).col(0, 0.35, 0, 0.8, 0.7, 0.8, 'concrete');
    pl.cyl(0, 1.3, 0, 0.05, 1.3, 'woodDark', 0x4a3a2a, null, 6);
    for (let k = 0; k < 7; k++) pl.box(Math.cos(k) * 0.35, 1.8 + (k % 3) * 0.12, Math.sin(k) * 0.35, 0.9, 0.02, 0.2, 'foliage', 0x5a4a22, [0.5, k * 0.9, 0.3]);
  }
  // tools leaning on the knee wall, scattered pots
  for (let i = 0; i < 3; i++) P.prop(L, 11 + i * 0.35, Y, z1 - 0.45, 0).box(0, 0.75, 0, 0.03, 1.5, 0.03, 'woodPale', null, [0.25, 0, 0.05 * i]).box(0, 0.05, 0.15, 0.25, 0.06, 0.03, 'metalDark', null, [0.25, 0, 0]);
  for (let i = 0; i < 10; i++) {
    const px = x0 + 1 + rng() * (x1 - x0 - 2), pz = rng() < 0.5 ? 25.6 + rng() * 0.3 : 28.2 + rng() * 0.3;
    if (Math.abs(px - 18) < 1.2) continue;
    if (rng() < 0.5) pot(L, px, Y + 0.02, pz, 0.12 + rng() * 0.06, 0.2, rng() < 0.6);
    else P.debris(L, px, Y + 0.02, pz, 0.3, 'dirt', 4);
  }
  // the gardener: slumped over the broken south wall, machete dropped by his hand
  const bx = x0 + 7 * pw;
  P.corpse(L, bx, Y + 0.02, z1 - 0.9, 1.4, 0x3a5a3a);
  L.decal(bx, Y + 0.03, z1 - 0.9, 0, 1, 0, 1.8, DF.POOL);
  L.decal(bx + 0.4, Y + 0.6, z1 - 0.32, 0, 0, -1, 0.9, DF.BLOOD2);
  L.decal(bx - 0.5, Y + 0.45, z1 - 0.32, 0, 0, -1, 0.7, DF.HAND, { noRoll: true });
  L.item('machete', bx - 1.0, Y + 0.05, z1 - 1.3, {});
  bloodTrail(L, bx - 0.4, z1 - 1.2, 16.8, 27.6, Y, 7);
  scatterBlood(L, 12, 25.8, 24, 28.2, Y, 3);
  // notices
  graffiti(L, 'PLANES STILL\nLANDING!\n→ EAST', x0 + 0.13, Y + 1.7, 29.6, Math.PI / 2, 1.8, 1.0, '#e8e8e0');
  sign(L, 'WATERING ROTA\nMON  ROSA\nTUE  DEV\nWED  MARCUS\nTHU  ROSA', x0 + 0.13, Y + 1.5, 21.8, Math.PI / 2, 0.8, 0.9, { bg: '#e8e4d0', fg: '#2a2a2a', font: 'Courier New, monospace', weight: 'normal' });
  L.reverb(x0, Y, z0, x1, Y + ridge, z1, 'room');
}

// broken pane: jagged shards left in the frame
function shards(L, a, b, fixed, y0, axis) {
  const w = b - a;
  const p = axis === 'x' ? P.prop(L, (a + b) / 2, y0, fixed, 0) : P.prop(L, fixed, y0, (a + b) / 2, Math.PI / 2);
  for (let k = 0; k < 4; k++) {
    const sx = -w / 2 + 0.15 + k * (w - 0.3) / 3;
    p.box(sx, 0.18 + rng() * 0.15, 0, 0.18 + rng() * 0.2, 0.35 + rng() * 0.3, 0.012, 'glassDirty', 0x9aaa98, [0, 0, (rng() - 0.5) * 1.2]);
  }
  p.box(-w / 2 + 0.2, 1.75, 0, 0.3, 0.3, 0.012, 'glassDirty', 0x9aaa98, [0, 0, 0.8]);
}
function glassShardsFloor(L, x, y, z) {
  for (let k = 0; k < 7; k++) L.box(x + (rng() - 0.5) * 1.2, y, z + (rng() - 0.5) * 1.2, x + (rng() - 0.5) * 1.2 + 0.12, y + 0.008, z + (rng() - 0.5) * 1.2 + 0.1, 'glassDirty', { collide: false, tint: 0xb8c8c0 });
}

// ================================================================ PLANK + ALLEY
function buildPlank(L, game, S) {
  plankBridge(L, 31.65, 39.35, 37.0, YA, { width: 1.6 });
  // work light clamped to B's parapet, pointing back across
  L.box(39.1, YA + 1.1, 38.1, 39.3, YA + 1.9, 38.3, 'metalDark', NC);
  L.box(39.0, YA + 1.8, 38.0, 39.4, YA + 2.05, 38.4, 'emissiveWarm', NC);
  L.light(38.6, YA + 1.9, 38.2, 0xfff0d0, 7, 10, { flicker: 0.1 });
  // the alley far below (x 32..39): dumpsters, trash, a flickering lamp; deadly
  L.box(32, -0.3, ZN - 8, 39, 0, ZS, 'asphalt');
  P.dumpster(L, 35.5, 0, 24, Math.PI / 2);
  P.dumpster(L, 35.5, 0, 31, Math.PI / 2, 0x6a2a1a);
  P.trashBags(L, 34, 0, 27.5, 6);
  P.trashBags(L, 36.8, 0, 38, 5);
  burningBarrel(L, 35, 0, 41);
  L.light(32.4, 4.5, 30, 0xffc080, 6, 10, { flicker: 0.5 });
  P.fenceChain(L, 32, 43.8, 39, 43.8, 0, 3.2);
  L.box(32, 0, 43.7, 39, 6, 43.9, 'concrete', { visible: false });
  fireEscapeDeco(L, 'w', 20, 26, 39, 3.6, 14.5, 3.6);
  L.killZone(32.02, -30, ZN - 8, 38.98, YA - 2.2, 43.95);
  // plank horde trigger (A side of the bridge)
  S.plankTrigger = [30.4, YA - 1, 35.8, 33.5, YA + 3, 38.2];
}

// ================================================================ BUILDING B ROOF
// Stair shaft (x 39.3..43.7, z 16.3..27): top landing at the roof, two flights
// down to the 5th floor, door into the corridor at (40.35, F4, 27).
export const SHAFT = { x0: 39.3, x1: 43.7, z0: 16.3, z1: 27, split: 41.5 };
function buildBRoof(L, game, S) {
  const { x0, x1, z0, z1, split } = SHAFT;
  // roof slab (hole over the flights) + parapet
  const hole = [x0, 18.8, x1, 23.8];
  const slabParts = [[39.3, 16.3, 65.7, 18.8], [39.3, 23.8, 65.7, 43.7], [43.7, 18.8, 65.7, 23.8]];
  for (const [a, b, c, d] of slabParts) {
    L.box(a, YA - 0.3, b, c, YA - 0.02, d, 'ceiling');
    L.box(a, YA - 0.02, b, c, YA, d, 'roof');
  }
  void hole;
  parapet(L, 39, ZN, 66, ZS, YA, { mat: 'brick', w: { gaps: [[16, 27.2], [36.2, 37.8]] }, n: { gaps: [[39, 43.9]] } });
  L.box(38.9, YA - 0.5, ZN - 0.1, 66.1, YA - 0.3, ZS + 0.12, 'concrete', { collide: false, tint: 0x8a867e });
  // bulkhead walls around the top of the shaft; door on the east wall over the top landing
  L.box(39, YA, 16, 39.3, YA + 3, 27.2, 'brick');
  L.box(39.3, YA, 16, 43.9, YA + 3, 16.3, 'brick');
  L.wallZ(16.3, 27.2, 43.8, YA, YA + 3, 'brick', 0.2, [{ a: 24.8, b: 25.9, y0: YA, y1: YA + 2.2 }]);
  L.box(39.3, YA, 27, 43.7, YA + 3, 27.2, 'brick');
  L.box(38.9, YA + 3, 15.9, 44.1, YA + 3.25, 27.4, 'roof');
  const bdoor = new Door(L, 43.8, YA, 25.35, 'z', { width: 1.0, hinge: -1, material: 'paintedGreen', hp: 200 });
  S.bulkDoor = bdoor;
  sign(L, 'STAIR B\nNO ROOF ACCESS\nAFTER 10PM', 43.93, YA + 2.45, 25.35, Math.PI / 2, 0.8, 0.4, { bg: '#d8d0b0', fg: '#1a1a1a' });
  ceilingLight(L, 44.25, YA + 2.8, 25.35, { type: 'cage', intensity: 6, range: 7, flicker: 0.35 });
  graffiti(L, 'THEY\'RE\nINSIDE', 43.95, YA + 1.2, 21, Math.PI / 2, 1.6, 0.9, '#b8201a');
  // top landing + flights + mid landing (thin stairs: flights are stacked)
  L.box(x0, YA - 0.3, 23.8, x1, YA, z1, 'concreteFloor');
  L.stairs(split + 0.1, 20.8, x1, 23.8, 16.2, YA, '+z', 'concrete', { thin: true });
  L.box(x0, 15.9, 18.8, x1, 16.2, 20.8, 'concreteFloor');
  L.box(x0, 14.1, z0, x1, 17.7, 18.8, 'concrete', { visible: false }); // dead end behind the mid landing
  L.stairs(x0, 20.8, split - 0.1, 23.8, F4, 16.2, '-z', 'concrete', { thin: true });
  L.box(split + 0.1, 14.1, 20.8, x1, 15.8, 23.8, 'concrete', { visible: false }); // under flight 1
  L.box(split - 0.1, F4, 20.8, split + 0.1, YA + 1.0, 23.8, 'metalDark', { flags: F_SOLID | F_SHOOT });
  L.box(x0, YA, 23.75, split - 0.1, YA + 1.0, 23.85, 'metalDark', { flags: F_SOLID | F_SHOOT });
  railSegment(L, split, 16.2 + 0.95, 20.8, split, YA + 0.95, 23.8);
  // shaft walls between the roof and the 5th floor (east + south sides; west/north are exterior)
  L.box(x1, F4 - 0.3, z0, x1 + 0.2, YA, z1, 'concreteDark');
  L.wallX(x0, x1 + 0.2, z1 + 0.1, F4, YA, 'concreteDark', 0.2, [{ a: 39.85, b: 40.85, y0: F4, y1: F4 + 2.2 }]);
  new Door(L, 40.35, F4, z1 + 0.1, 'x', { width: 1.0, open: true, hinge: -1, material: 'paintedGreen' });
  L.box(x0, F4 - 0.02, 23.8, split, F4 + 0.005, z1, 'concreteFloor', NC);
  ceilingLight(L, 41.5, YA + 2.95, 22, { type: 'cage', intensity: 6, range: 8, flicker: 0.6 });
  ceilingLight(L, 40.4, 17.6, 25.4, { type: 'cage', intensity: 5, range: 6, flicker: 0.25 });
  sign(L, '5', 40.35, F4 + 2.55, z1 - 0.01, Math.PI, 0.35, 0.35, { bg: '#2a4a8a', fg: '#fff' });
  L.reverb(x0, F4, z0, x1, YA + 3, z1, 'stairwell');
  L.ambience(x0, F4, z0, x1, YA + 3, z1, 'apartments');
  L.decal(42.6, YA + 0.01, 25.5, 0, 1, 0, 1.4, DF.SMEAR);
  L.decal(40.5, 16.22, 19.8, 0, 1, 0, 1.4, DF.POOL);
  P.corpse(L, 40.3, 16.21, 19.6, 0.4, 0x2a3a4a);

  // ------------------------------------------------ B roof dressing
  P.waterTower(L, 61.2, YA, 20.8);
  S.smokerPerch = [61.2, YA + 8.6, 20.8];
  const bbB = billboard(L, 53, YA, 42.9, 0, 12, 4.4, adTexture(ADS.skylineAir), { lightIntensity: 9, flicker: 0.2 });
  S.billboardB = bbB;
  for (const [x, z, r] of [[48, 19, 0], [51.2, 19, 0], [52.5, 33.4, 0], [47.5, 34, 0.2]]) P.acUnit(L, x, YA, z, r);
  // fenced residents' enclosure around the stair house: the way in is the gate at the east end
  P.fenceChain(L, 39.35, 31.2, 57.6, 31.2, YA, 2.4);
  P.fenceChain(L, 60.6, 31.2, 65.65, 31.2, YA, 2.4);
  for (const x of [57.6, 60.6]) L.box(x - 0.06, YA, 31.14, x + 0.06, YA + 2.5, 31.26, 'metalDark');
  P.fenceGate(L, 57.85, YA, 31.55, -1.2, 1.4, 2.2); // gate leaf swung open (chain-link, see props.fenceGate)
  sign(L, 'RESIDENTS ONLY\nKEEP GATE CLOSED', 55.5, YA + 1.5, 31.3, 0, 1.3, 0.5, { bg: '#e8e0c8', fg: '#1a1a1a', border: '#1a1a1a' });
  graffiti(L, 'GATE →', 50, YA + 0.9, 31.32, 0, 1.4, 0.6, '#f0e0a0');
  P.pipe(L, 48, YA + 1.25, 19, 48, YA + 1.25, 17, 0.18, 'metal');
  P.pipe(L, 51.2, YA + 1.25, 19, 51.2, YA + 1.25, 17, 0.18, 'metal');
  for (const [x, z] of [[46, 24], [55, 22], [63.5, 36], [44.5, 41.5], [64.5, 27]]) roofVent(L, x, YA, z, 0.22 + rng() * 0.1, 0.8 + rng() * 0.6);
  skylight(L, 49, 26.4, 51, 29.8, YA);
  // broken skylight over the burning corridor: glow + smoke
  L.box(55.6, YA, 27.3, 58.4, YA + 0.5, 29.0, 'metalDark');
  L.box(55.75, YA + 0.5, 27.45, 58.25, YA + 0.52, 28.85, 'emissiveWarm', NC);
  for (let x = 55.8; x < 58.3; x += 0.25) L.box(x, YA + 0.52, 27.4, x + 0.03, YA + 0.56, 28.9, 'metalDark', NC);
  L.light(57, YA + 1.2, 28.1, 0xff6a20, 9, 9, { flicker: 0.5 });
  L.dynamics.push({ t: 0, update(dt) { this.t -= dt; if (this.t <= 0) { this.t = 0.15; const cp = game.camPos; if (Math.abs(cp.x - 57) < 70 && Math.abs(cp.z - 28) < 70) game.fx.smokeColumn(57 + (Math.random() - 0.5), YA + 0.6, 28.1, 0.6, [0.1, 0.09, 0.09]); } } });
  // chimney stacks along the party wall with C
  for (const z of [30, 34.5, 39]) { L.box(64.6, YA, z - 0.5, 65.65, YA + 2.4, z + 0.5, 'brickDark'); L.box(64.5, YA + 2.4, z - 0.6, 65.7, YA + 2.55, z + 0.6, 'concrete', NC); }
  // dead roof garden in tubs + a tarp shelter somebody lived in
  for (const [x, z] of [[46.5, 38.5], [48, 38.5], [49.5, 38.5]]) { L.box(x - 0.6, YA, z - 0.5, x + 0.6, YA + 0.6, z + 0.5, 'woodDark'); deadPlant(L, x, YA + 0.6, z, 2.2); }
  const tarp = P.prop(L, 60, YA, 38.5, 0.2);
  tarp.box(0, 1.6, 0, 3.6, 0.03, 2.8, 'fabric', 0x2a4a7a, [0, 0, 0.12]);
  for (const [sx, sz] of [[-1.7, -1.3], [1.7, -1.3], [-1.7, 1.3], [1.7, 1.3]]) tarp.box(sx, 0.8 + sx * 0.06, sz, 0.05, 1.6 + sx * 0.12, 0.05, 'metalDark');
  tarp.box(0.4, 0.1, 0.2, 1.8, 0.2, 0.8, 'fabric', 0x5a3a2a).box(-1.0, 0.25, -0.4, 0.5, 0.5, 0.5, 'wood', 0x7a6a4a);
  tarp.col(0.4, 0.1, 0.2, 1.8, 0.2, 0.8, 'fabric');
  P.corpse(L, 59.2, YA + 0.21, 38.7, 1.9, 0x6a5a3a);
  L.item('pipebomb', 60.8, YA + 0.5, 38.1, { chance: 0.6 });
  L.item('health', 61.2, YA + 0.02, 39.4, { chance: 0.5 });
  burningBarrel(L, 57.8, YA, 40.8);
  graffiti(L, 'SOS', 52, YA + 0.015, 34.5, 0, 4, 2, '#e8e8e0');
  L.decal(47, YA + 0.01, 27, 0, 1, 0, 2.5, DF.SCORCH);
  // B's facades (roof level down to the 4th floor are real walls; see da1_block)
  L.reverb(39, YA, ZN, 66, YA + 12, ZS, 'outdoor');
}

export function buildRoofs(L, game, S) {
  buildA(L, game, S);
  buildPlank(L, game, S);
  buildBRoof(L, game, S);
}
