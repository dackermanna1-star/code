// Dead Air 2 — the crescendo. A T-340 tower crane stands on the unfinished
// deck of the Meridian Phase II site across the light well from the hotel
// roof. Its radio-remote station was left docked at the hotel's loading bay
// (the crew were lifting new rooftop units). Holding the remote powers the
// crane up (diesel start, horn, flashing beacons, floodlights), hoists the
// steel skip it was left holding, slews it across the skyline and lowers it
// into the bay so it bridges the gap — ~52 s of rising noise while hordes pour
// out of the stair bulkhead, the elevator machine room, up the fire escape and
// onto the far deck (held behind the far safety gate until the skip lands).
import * as THREE from 'three';
import { ceilingLight, sign, graffiti, supplies, physProp, usable, P, railSegment } from './kit.js';
import { Door, MovingPlatform } from '../world/dynamic.js';
import { F_SOLID, F_SHOOT, F_DEFAULT } from '../world/collision.js';
import { DF } from '../render/decals.js';
import { buildGroup, vmesh } from './ch3_props.js';
import { railing } from './ch2_parts.js';
import { steelColumn, workLight, cableSpool, concreteBags, rebar, sawhorse, toolCart } from './ch4_parts.js';
import { rng, formStack, concreteHopper, portaJon, cardboard, rotXZ } from './da2_parts.js';
import { HR, LR, CB, SKIP, BAY, GATE_N, GATE_S, CRANE, HOTEL } from './da2_layout.js';

const NC = { collide: false };
const YEL = 0xd8a820;
const HOVER = HR + 12;      // skip bottom height when it starts to lower
const START_H = HR + 8.5;   // skip bottom height while parked
const R = CRANE.z - (SKIP.z0 + SKIP.z1) / 2; // trolley radius over the bay (23.6)

// ======================================================= CONSTRUCTION DECK
function site(L, game) {
  const { x0, z0, x1, z1 } = CB;
  const y = HR;
  // lower floors: dark open frame with slab edges; one invisible solid body
  L.clip(x0, 0, z0, x1, y - 0.3, 44, F_DEFAULT);
  L.clip(x0, 0, 44, 47, y - 0.3, z1, F_DEFAULT);
  L.clip(47, 0, 44, x1, 7.8, z1, F_DEFAULT);
  L.clip(53, 7.8, 44, x1, y - 0.3, z1, F_DEFAULT);
  L.clip(47, 7.8, 55, 53, y - 0.3, z1, F_DEFAULT);
  for (const [a, b, c, d] of [[x0 + 1.2, z0 + 1.2, 46.8, z1 - 1.2], [46.8, z0 + 1.2, x1 - 1.2, 44.2], [53.2, 44.2, x1 - 1.2, z1 - 1.2]]) L.box(a, 0, b, c, y - 0.3, d, 'blackMatte', { collide: false, tint: 0x080808 });
  for (const sy of [3.6, 7.5]) for (const [a, b, c, d] of [[x0, z0, x1, z0 + 1.2], [x0, z1 - 1.2, x1, z1], [x0, z0 + 1.2, x0 + 1.2, z1 - 1.2], [x1 - 1.2, z0 + 1.2, x1, z1 - 1.2]]) L.box(a, sy, b, c, sy + 0.3, d, 'concrete', { collide: false, tint: 0x8a8680 });
  for (let x = x0 + 0.25; x < x1; x += 6) for (const z of [z0 + 0.25, z1 - 0.25]) L.box(x - 0.25, 0, z - 0.25, x + 0.25, y - 0.3, z + 0.25, 'concrete', { collide: false, tint: 0x9a968e });
  for (let z = z0 + 6; z < z1; z += 6) for (const x of [x0 + 0.25, x1 - 0.25]) L.box(x - 0.25, 0, z - 0.25, x + 0.25, y - 0.3, z + 0.25, 'concrete', { collide: false, tint: 0x9a968e });
  // work lights inside the lower floors (the site never slept)
  for (const [x, yy, z] of [[22, 4.2, 26.4], [44, 8.1, 26.4]]) { L.box(x - 0.3, yy, z, x + 0.3, yy + 0.3, z + 0.3, 'emissiveWarm', NC); L.light(x, yy + 0.8, z - 1.2, 0xffd8a0, 6, 9, { flicker: 0.1 }); }
  // scaffold + debris netting on the north face (seen from the hotel roof)
  for (let x = x0 + 1; x < x1; x += 2.6) L.box(x - 0.03, 0, z0 - 1.2, x + 0.03, y - 0.4, z0 - 1.14, 'metalDark', NC);
  for (let yy = 2; yy < y - 0.5; yy += 2) L.box(x0, yy, z0 - 1.2, x1, yy + 0.05, z0 - 1.14, 'metalDark', NC);
  for (const [a, b] of [[x0, 30], [42, x1]]) L.box(a, 1.5, z0 - 1.22, b, y - 1.0, z0 - 1.21, 'fabricGreen', { collide: false, tint: 0x2a4a2e });
  sign(L, 'MERIDIAN PLAZA · PHASE II\nNEWBURG CONSTRUCTION CO.', 36, 7.0, z0 - 1.25, 0, 7, 1.4, { bg: '#1a3a5a', fg: '#e8e0c0' });
  // deck slab (stair hole in the SE corner for the site stair)
  const hole = [47, 44.6, 53, 55];
  L.box(x0, y - 0.3, z0, x1, y, 44.6, 'concreteFloor');
  L.box(x0, y - 0.3, 44.6, hole[0], y, z1, 'concreteFloor');
  L.box(hole[2], y - 0.3, 44.6, x1, y, z1, 'concreteFloor');
  L.box(hole[0], y - 0.3, hole[3], hole[2], y, z1, 'concreteFloor');
  L.box(x0 - 0.05, y - 0.35, z0 - 0.05, x1 + 0.05, y - 0.28, z1 + 0.05, 'concrete', { collide: false, tint: 0x7a766e });
  // site stair down to L3 (spawn area): flight 47..53 x, z 45..52
  L.stairs(47.2, 45.2, 52.8, 52.2, 7.8, y, '+z', 'concrete', { thin: true });
  L.box(47.2, 7.5, 44.6, 52.8, 7.8, 45.2, 'concrete');
  L.box(47, 7.5, 44.4, 53, 7.8, 44.6, 'concrete');
  L.box(47, 7.8, 44.2, 53, y - 0.3, 44.4, 'concreteDark');
  L.box(46.8, 7.8, 44.4, 47.0, y - 0.3, z1, 'concreteDark');
  L.box(53, 7.8, 44.4, 53.2, y - 0.3, z1, 'concreteDark');
  L.box(47, y - 0.3, 52.2, 53, y, 55, 'concreteFloor');
  for (const [a, b, c, d] of [[46.8, 44.4, 53.2, 44.6], [46.8, 44.6, 47.0, 52.2], [53.0, 44.6, 53.2, 52.2]]) L.box(a, y, b, c, y + 1.05, d, 'paintedYellow', { tint: 0xc8a020, flags: F_SOLID | F_SHOOT });
  L.clip(46.8, y + 1.05, 44.4, 53.2, y + 2.4, 44.6, F_SOLID); L.clip(46.8, y + 1.05, 44.6, 47.0, y + 2.4, 52.2, F_SOLID); L.clip(53.0, y + 1.05, 44.6, 53.2, y + 2.4, 52.2, F_SOLID);
  ceilingLight(L, 50, y - 0.3, 46, { type: 'cage', intensity: 4, flicker: 0.7 });
  sign(L, 'SITE STAIR\nL3 ↓', 50, y + 1.7, 44.35, 0, 0.9, 0.4, { bg: '#e8c020', fg: '#101010' });
  // perimeter guard rails (gaps: the bay, the scaffold stair at the south edge)
  railing(L, 'x', x0, BAY.x0 - 0.4, z0 + 0.15, y);
  railing(L, 'x', BAY.x1 + 0.4, x1, z0 + 0.15, y);
  railing(L, 'z', z0, z1, x0 + 0.15, y);
  railing(L, 'z', z0, z1, x1 - 0.15, y);
  railing(L, 'x', x0, 27.7, z1 - 0.15, y);
  railing(L, 'x', 29.9, x1, z1 - 0.15, y);
  for (const [a, b, c, d] of [[x0, z0, BAY.x0 - 0.4, z0 + 0.3], [BAY.x1 + 0.4, z0, x1, z0 + 0.3], [x0, z0, x0 + 0.3, z1], [x1 - 0.3, z0, x1, z1], [x0, z1 - 0.3, 27.7, z1], [29.9, z1 - 0.3, x1, z1]]) L.clip(a, y + 1.05, b, c, y + 2.6, d, F_SOLID);
  for (let x = x0 + 2; x < x1 - 1; x += 4.5) if (Math.abs(x - 36) > 3) sign(L, 'DANGER\nOPEN EDGE', x, y + 0.7, z0 + 0.1, 0, 0.7, 0.35, { bg: '#e8c020', fg: '#101010' });
  // next-floor columns with rebar starters
  const cols = [];
  for (const x of [17.5, 24.5, 31.5, 40.5, 47.5, 53.5]) for (const z of [30.5, 37.5, 44.5, 51.5]) {
    if (x === 47.5 && z >= 44.5) continue;
    if (Math.abs(x - 36) < 5 && Math.abs(z - 46) < 4) continue;
    const h = 1.2 + ((x * 7 + z * 3) % 5) * 0.55;
    L.box(x - 0.3, y, z - 0.3, x + 0.3, y + h, z + 0.3, 'concrete', { tint: 0xa8a49a });
    for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) L.box(x + dx - 0.015, y + h, z + dz - 0.015, x + dx + 0.015, y + h + 1.1, z + dz + 0.015, 'rust', NC);
    cols.push([x, z]);
  }
  // formwork on two columns, props & site junk
  for (const [x, z] of [[24.5, 37.5], [40.5, 51.5]]) { L.box(x - 0.45, y, z - 0.45, x + 0.45, y + 3.2, z - 0.4, 'wood', { collide: false, tint: 0xc8a060 }); L.box(x - 0.45, y, z + 0.4, x + 0.45, y + 3.2, z + 0.45, 'wood', { collide: false, tint: 0xc8a060 }); }
  formStack(L, 20.6, y, 34.0, 0.1, 9); formStack(L, 44.0, y, 36.0, 1.6, 6); formStack(L, 27.2, y, 49.0, 0.3, 11);
  rebar(L, 29.0, y, 40.5, 0.05, 5); rebar(L, 51.0, y, 28.8, 1.57, 4);
  concreteHopper(L, 43.4, y, 30.8);
  concreteBags(L, 18.2, y, 42.2, 0.3); concreteBags(L, 19.6, y, 42.4, -0.2);
  portaJon(L, 54.8, y, 36.2, -Math.PI / 2, 0x2a5a9a); portaJon(L, 54.8, y, 37.6, -Math.PI / 2, 0x3a7a3a);
  cableSpool(L, 22.6, y, 46.8, 0.6, 0.4);
  sawhorse(L, 33.0, y, 33.6, 0.6); sawhorse(L, 38.8, y, 38.0, -0.4);
  toolCart(L, 26.6, y, 29.2, 0.8);
  for (const [x, z, r] of [[16.8, 28.4, 0.2], [52.6, 41.2, 1.0], [30.2, 53.4, 0.5]]) P.pallet(L, x, y, z, r, true);
  const gen = P.prop(L, 21.0, y, 27.4, 0); gen.box(0, 0.6, 0, 2.2, 1.2, 1.1, 'paintedYellow', 0xc8a020).box(0.6, 1.25, 0, 0.12, 0.3, 0.12, 'metalDark').col(0, 0.6, 0, 2.2, 1.2, 1.1, 'metal');
  // steel beams waiting for the crane
  const sb = P.prop(L, 45.0, y, 45.6, 0); for (let i = 0; i < 4; i++) sb.box(0, 0.12 + i * 0.26, 0, 6, 0.22, 0.3, 'rust', 0x7a5a44); sb.col(0, 0.55, 0, 6, 1.1, 0.4, 'metal');
  P.debris(L, 32, y, 44, 1.0, 'concrete', 8); P.debris(L, 19, y, 50, 1.2, 'wood', 7);
  const wb = P.prop(L, 38.6, y, 30.0, 0.6); wb.box(0, 0.45, 0.2, 0.7, 0.35, 1.0, 'paintedGreen', 0x2a5a3a).cyl(0, 0.2, -0.45, 0.2, 0.1, 'rubber', null, [0, 0, Math.PI / 2]).col(0, 0.4, 0, 0.7, 0.8, 1.3, 'metal', F_SOLID | F_SHOOT);
  // tarp-covered pile
  const tp = P.prop(L, 50.4, y, 31.2, 0.2); tp.box(0, 0.6, 0, 3.0, 1.2, 2.2, 'fabricBlue', 0x2a4a8a).col(0, 0.6, 0, 3.0, 1.2, 2.2, 'fabric');
  // lights
  P.floodLight(L, 45.2, y, 29.6, 0.95, { h: 4.2, intensity: 34, range: 24 });
  P.floodLight(L, 16.6, y, 50.5, -2.3, { h: 4.0, intensity: 28, range: 22, flicker: 0.04 });
  P.cementMixer(L, 40.6, y, 52.2, 0.6);
  P.rebarBundle(L, 20.4, y, 38.4, 1.3, 4, 16);
  workLight(L, 26.4, y, 54.4, 0.0, { intensity: 12, range: 13, flicker: 0.2 });
  sign(L, 'HARD HAT AREA', 17.2, y + 1.6, 55.72, 0, 1.3, 0.35, { bg: '#1a6a2a', fg: '#fff' });
  sign(L, 'NO UNAUTHORIZED ACCESS\nMERIDIAN PHASE II', 14.3, y + 1.4, 40, Math.PI / 2, 1.8, 0.45, { bg: '#e8e0c8', fg: '#1a2a3a' });
  graffiti(L, 'THEY WAIT\nFOR THE\nBRIDGE', 31.5, y + 1.0, 30.17, 0, 1.3, 0.8, '#b8201a');
  P.corpse(L, 33.4, y + 0.01, 36.6, 1.1, 0xc8a020); L.decal(33.4, y + 0.012, 36.6, 0, 1, 0, 1.8, DF.POOL);
  P.corpse(L, 46.6, y + 0.01, 41.8, 2.8, 0x3a5a8a);
  for (let i = 0; i < 6; i++) L.decal(18 + rng() * 34, y + 0.012, 28 + rng() * 26, 0, 1, 0, 0.8 + rng(), DF.BLOOD1 + (i % 4));
  L.item('ammo', 22.2, y + 0.02, 29.6, { chance: 0.6 });
  L.item('health', 54.4, y + 0.02, 44.2, { chance: 0.5 });
  L.item('throwable', 43.4, y + 0.02, 33.2, { chance: 0.5 });
  L.reverb(x0, y, z0, x1, y + 20, z1, 'outdoor');
  L.ambience(x0 - 1, y - 0.5, z0, x1 + 1, y + 30, z1 + 1, 'rooftop');

  // --- scaffold stair tower on the south face down to LR + plank bridge to the printing works
  const sy0 = HR, sy1 = LR, szA = z1, szB = z1 + 2.2;
  L.box(27.5, sy0 - 0.12, szA, 30.1, sy0, szB, 'diamond', { tint: 0x5a5a56 });
  L.stairs(21.8, szA, 27.5, szB, sy1, sy0, '+x', 'wood', { thin: true, tint: 0xa88a5a });
  L.box(19.6, sy1 - 0.12, szA, 21.8, sy1, szB, 'diamond', { tint: 0x5a5a56 });
  L.box(19.8, sy1 - 0.1, szB, 21.6, sy1, CBS_BRIDGE_Z1, 'wood', { tint: 0x9a7a4a });
  for (let z = szB + 0.1; z < CBS_BRIDGE_Z1; z += 0.35) L.box(19.8, sy1, z, 21.6, sy1 + 0.02, z + 0.04, 'woodDark', NC);
  // scaffold frame + rails + netting
  for (const x of [19.6, 21.8, 24.6, 27.5, 30.1]) for (const z of [szA + 0.05, szB - 0.05]) L.box(x - 0.03, 0, z - 0.03, x + 0.03, sy0 + 1.1, z + 0.03, 'metal', { collide: false, tint: 0x9a9e9e });
  for (let yy = 2; yy < sy0; yy += 2) L.box(19.6, yy, szB - 0.08, 30.1, yy + 0.04, szB - 0.02, 'metal', { collide: false, tint: 0x9a9e9e });
  L.box(19.6, 0.5, szB - 0.01, 30.1, sy1 - 0.4, szB, 'fabricGreen', { collide: false, tint: 0x2a4a2e });
  L.clip(21.8, sy1, szB - 0.06, 27.5, sy0 + 1.2, szB + 0.02, F_SOLID);
  railSegment(L, 21.8, sy1 + 1.0, szB - 0.04, 27.5, sy0 + 1.0, szB - 0.04);
  L.clip(27.5, sy0, szB - 0.06, 30.1, sy0 + 1.2, szB + 0.02, F_SOLID); railSegment(L, 27.5, sy0 + 1.0, szB - 0.04, 30.1, sy0 + 1.0, szB - 0.04);
  L.clip(30.05, sy0, szA, 30.15, sy0 + 1.2, szB, F_SOLID); railSegment(L, 30.1, sy0 + 1.0, szA, 30.1, sy0 + 1.0, szB);
  L.clip(19.5, sy1, szA, 19.6, sy1 + 1.2, szB, F_SOLID); railSegment(L, 19.55, sy1 + 1.0, szA, 19.55, sy1 + 1.0, szB);
  L.clip(21.6, sy1, szB, 21.7, sy1 + 1.2, CBS_BRIDGE_Z1, F_SOLID); L.clip(19.7, sy1, szB, 19.8, sy1 + 1.2, CBS_BRIDGE_Z1, F_SOLID);
  for (const x of [19.75, 21.65]) railSegment(L, x, sy1 + 1.0, szB, x, sy1 + 1.0, CBS_BRIDGE_Z1);
  L.killZone(8, -20, z1 + 0.05, 62, LR - 3, CBS_BRIDGE_Z1 - 0.05);
  sign(L, 'SCAFFOLD — MAX 4 PERSONS', 28.8, sy0 + 1.35, szA + 0.05, 0, 1.4, 0.25, { bg: '#e8c020', fg: '#101010' });
  L.light(24.6, sy0 + 1.6, szA + 1.1, 0xffc080, 5, 8, { flicker: 0.3 });
}
export const CBS_BRIDGE_Z1 = 60.4;

// ============================================================ LOADING BAY
// Parapet stubs, safety gates (visual + dynamic collider) and hidden infected blockers.
function gate(L, game, zc, dir, ev) {
  const y = HR;
  const x0 = BAY.x0, x1 = BAY.x1;
  // frame (covers the hidden blocker door's wooden jambs / lintel)
  for (const [a, b] of [[x0 - 0.2, x0 + 0.1], [x1 - 0.1, x1 + 0.2]]) L.box(a, y, zc - 0.15, b, y + 2.15, zc + 0.15, 'paintedYellow', { tint: YEL });
  L.box(x0 - 0.2, y + 1.95, zc - 0.15, x1 + 0.2, y + 2.15, zc + 0.15, 'paintedYellow', { tint: YEL });
  for (let x = x0 - 0.1; x < x1 + 0.1; x += 0.6) L.box(x, y + 1.96, zc - 0.155, x + 0.3, y + 2.14, zc - 0.15, 'blackMatte', NC);
  const lamp = [];
  for (const x of [x0 - 0.05, x1 + 0.05]) L.box(x - 0.1, y + 2.15, zc - 0.1, x + 0.1, y + 2.4, zc + 0.1, 'plastic', { collide: false, tint: 0x8a2a14 });
  lamp.push(L.light((x0 + x1) / 2, y + 2.6, zc + dir * 0.4, 0xff3010, 0, 8, { on: false }));
  // two leaves swinging away from the bay
  const leaves = [];
  for (const s of [-1, 1]) {
    const hx = s < 0 ? x0 + 0.1 : x1 - 0.1;
    const w = (x1 - x0 - 0.2) / 2;
    const grp = buildGroup(L, (T) => {
      const a = s < 0 ? 0 : -w, b = s < 0 ? w : 0;
      T.box(a, 0.05, -0.04, b, 0.12, 0.04, 'paintedYellow', { tint: YEL });
      T.box(a, 1.85, -0.04, b, 1.92, 0.04, 'paintedYellow', { tint: YEL });
      T.box(a, 0.95, -0.03, b, 1.0, 0.03, 'paintedYellow', { tint: YEL });
      for (const x of [a, b - 0.06]) T.box(x, 0.05, -0.04, x + 0.06, 1.92, 0.04, 'paintedYellow', { tint: YEL });
      T.box(a + 0.06, 0.12, -0.01, b - 0.06, 1.85, 0.01, 'metal', { tint: 0x4a4a48 });
      sign(T, 'KEEP CLEAR\nCRANE LOAD', (a + b) / 2, 1.35, 0.03, 0, 1.0, 0.45, { bg: '#e8c020', fg: '#101010' });
    });
    grp.position.set(hx, y, zc);
    L.addObject(grp);
    leaves.push({ grp, s });
  }
  const col = L.col.addDynamic([x0 + 0.1, y, zc - 0.1], [x1 - 0.1, y + 2.6, zc + 0.1], { flags: F_SOLID });
  // hidden locked door: marks the gate's nav nodes as blocked for infected
  const blk = new Door(L, (x0 + x1) / 2, y, zc, 'x', { width: x1 - x0 - 0.1, height: 2.0, safe: true, locked: true });
  blk.mesh.visible = false; blk.usable.enabled = false; blk.collider.enabled = false;
  blk.blocksInfected = () => !ev.bridged;
  blk.use = () => {};
  const g = { k: 0, target: 0, lamp, open() { this.target = 1; col.enabled = false; game.audio.play('metalGate', { pos: new THREE.Vector3((x0 + x1) / 2, y + 1, zc), vol: 0.8 }); } };
  L.dynamics.push({
    update(dt) {
      if (g.k !== g.target) g.k = Math.min(1, g.k + dt * 0.8);
      const a = g.k * g.k * (3 - 2 * g.k) * 1.5;
      for (const l of leaves) l.grp.rotation.y = l.s * dir * a;
    },
  });
  return g;
}

function bay(L, game, ev) {
  const y = HR;
  // hotel side: parapet stubs framing the landing zone
  for (const [a, b] of [[BAY.x0 - 0.4, BAY.x0], [BAY.x1, BAY.x1 + 0.4]]) {
    L.box(a, y, GATE_N + 0.15, b, y + 1.1, HOTEL.z1 - 0.2, 'brickTan', { tint: 0x9a7a5c });
    L.box(a - 0.03, y + 1.1, GATE_N + 0.15, b + 0.03, y + 1.18, HOTEL.z1 + 0.25, 'concrete', { collide: false, tint: 0x8a867e });
    L.clip(a, y + 1.1, GATE_N + 0.15, b, y + 2.6, HOTEL.z1 + 0.2, F_SOLID);
  }
  // deck side: rail stubs
  for (const [a, b] of [[BAY.x0 - 0.4, BAY.x0], [BAY.x1, BAY.x1 + 0.4]]) {
    L.box(a + 0.15, y, CB.z0, b - 0.15, y + 1.05, GATE_S - 0.15, 'paintedYellow', { tint: 0xb89a2a, flags: F_SOLID | F_SHOOT });
    L.clip(a, y, CB.z0, b, y + 2.6, GATE_S - 0.15, F_SOLID);
  }
  const gN = gate(L, game, GATE_N, -1, ev);
  const gS = gate(L, game, GATE_S, 1, ev);
  // hazard markings in the landing zones
  for (const [za, zb] of [[GATE_N + 0.3, HOTEL.z1 - 0.2], [CB.z0, GATE_S - 0.3]]) {
    for (let x = BAY.x0 + 0.1; x < BAY.x1 - 0.2; x += 0.6) L.box(x, y + 0.001, za, x + 0.3, y + 0.012, za + 0.15, 'paintedYellow', { collide: false, tint: 0xd8b020 });
  }
  sign(L, 'LOADING BAY\nKEEP CLEAR WHEN CRANE IS OPERATING', 36, y + 2.5, GATE_N, 0, 2.6, 0.5, { bg: '#e8c020', fg: '#101010' });
  // light well below: killzone + ground clutter far below
  L.box(12, -0.3, HOTEL.z1 + 0.2, 58, 0, CB.z0, 'dirt', { collide: false, tint: 0x3a3630 });
  for (let i = 0; i < 8; i++) L.box(14 + rng() * 40, 0, 20.6 + rng() * 3.2, 14.6 + rng() * 40, 0.3 + rng() * 0.8, 21 + rng() * 3.2, rng() < 0.5 ? 'concreteDark' : 'woodDark', NC);
  L.killZone(8, -20, HOTEL.z1 + 0.25, 60, HR - 3.5, CB.z0 - 0.05);
  return { gN, gS };
}

// ================================================================ CRANE
const segUp = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
function setSeg(m, a, b) {
  _d.subVectors(b, a);
  const len = _d.length() || 0.001;
  m.position.addVectors(a, b).multiplyScalar(0.5);
  _q.setFromUnitVectors(segUp, _d.divideScalar(len));
  m.quaternion.copy(_q);
  m.scale.set(1, len, 1);
}
function lattice(T, ax, ay, az, bx, by, bz, mat, tint, t = 0.08) {
  // thin member between two local points
  const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
  const d = b.clone().sub(a), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  const c = a.add(b).multiplyScalar(0.5);
  T.part('box', c.x, c.y, c.z, t, len, t, mat, { rx: e.x, ry: e.y, rz: e.z, tint });
}

function crane(L, game) {
  const { x: cx, z: cz, top } = CRANE;
  const y0 = HR;
  // ---- mast (static): 4 chords + zig-zag lacing, foundation block, ladder
  const b = 1.0;
  for (const [dx, dz] of [[-b, -b], [b, -b], [-b, b], [b, b]]) L.box(cx + dx - 0.09, y0, cz + dz - 0.09, cx + dx + 0.09, top, cz + dz + 0.09, 'paintedYellow', { collide: false, tint: YEL });
  for (let yy = y0 + 0.6, i = 0; yy < top - 1; yy += 2.4, i++) {
    for (const s of [-1, 1]) {
      L.box(cx - b, yy, cz + s * b - 0.04, cx + b, yy + 0.08, cz + s * b + 0.04, 'paintedYellow', { collide: false, tint: YEL });
      L.box(cx + s * b - 0.04, yy, cz - b, cx + s * b + 0.04, yy + 0.08, cz + b, 'paintedYellow', { collide: false, tint: YEL });
      const k = i % 2 ? 1 : -1;
      lattice(L, cx - b, yy, cz + s * b, cx + b, yy + 2.4, cz + s * b, 'paintedYellow', YEL, 0.07);
      lattice(L, cx + s * b, yy, cz - b * k, cx + s * b, yy + 2.4, cz + b * k, 'paintedYellow', YEL, 0.07);
    }
  }
  L.box(cx - 1.8, y0, cz - 1.8, cx + 1.8, y0 + 0.6, cz + 1.8, 'concrete', { tint: 0x9a968e });
  L.box(cx - 1.1, y0 + 0.6, cz - 1.1, cx + 1.1, y0 + 3.4, cz + 1.1, 'metal', { visible: false });
  for (let yy = y0 + 0.9; yy < top; yy += 0.35) L.box(cx - 0.25, yy, cz - b + 0.12, cx + 0.25, yy + 0.03, cz - b + 0.16, 'metalDark', NC);
  const eb = P.prop(L, cx + 2.4, y0, cz - 0.8, -Math.PI / 2); eb.box(0, 0.9, 0, 1.0, 1.8, 0.5, 'paintedGreen', 0x3a5a4a).box(0, 1.2, -0.26, 0.6, 0.5, 0.01, 'paintedYellow', 0xc8a020).col(0, 0.9, 0, 1.0, 1.8, 0.5, 'metal');
  sign(L, 'DANGER 480V', cx + 2.14, y0 + 1.2, cz - 0.8, Math.PI / 2, 0.55, 0.3, { bg: '#e8c020', fg: '#101010' });
  sign(L, 'ATLAS T-340\nSWL 8 t', cx, y0 + 2.2, cz - b - 0.15, 0, 1.4, 0.5, { bg: '#1a1a1a', fg: '#e8c020' });

  // ---- slewing assembly (rotates about the mast axis; jib along local +X)
  const slew = buildGroup(L, (T) => {
    const JL = 40, CJ = 13;
    T.part(new THREE.CylinderGeometry(1.35, 1.35, 0.7, 20), 0, 0.35, 0, 1, 1, 1, 'paintedYellow', { tint: YEL });
    T.box(-1.6, 0.7, -1.6, 1.6, 1.0, 1.6, 'diamond', { tint: 0x6a6a64 });
    // operator cab
    T.box(0.2, 0.4, 1.3, 2.4, 3.0, 3.3, 'paintedWhite', { tint: 0xd8d8cc });
    T.box(2.38, 1.4, 1.45, 2.42, 2.8, 3.15, 'glassDirty', { tint: 0x3a4a50 });
    T.box(0.35, 1.4, 3.28, 2.25, 2.8, 3.32, 'glassDirty', { tint: 0x3a4a50 });
    T.box(0.6, 3.0, 2.0, 1.0, 3.2, 2.4, 'emissiveWarm', { tint: 0xffa020 });
    T.box(0.5, 1.2, 1.5, 2.2, 1.3, 3.1, 'emissiveWarm', { tint: 0x553311 });
    // tower head
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lattice(T, dx, 1.0, dz, 0, 8.0, 0, 'paintedYellow', YEL, 0.16);
    T.box(-0.2, 8.0, -0.2, 0.2, 8.4, 0.2, 'emissiveRed');
    // jib: two bottom chords + top chord + lacing
    for (const s of [-1, 1]) T.box(1.2, 1.0, s * 0.75 - 0.07, JL, 1.14, s * 0.75 + 0.07, 'paintedYellow', { tint: YEL });
    T.box(1.2, 2.66, -0.07, JL - 0.8, 2.8, 0.07, 'paintedYellow', { tint: YEL });
    for (let x = 1.2, i = 0; x < JL - 1.2; x += 1.6, i++) {
      for (const s of [-1, 1]) lattice(T, x, 1.07, s * 0.75, x + 0.8, 2.73, 0, 'paintedYellow', YEL, 0.06);
      for (const s of [-1, 1]) lattice(T, x + 0.8, 2.73, 0, x + 1.6, 1.07, s * 0.75, 'paintedYellow', YEL, 0.06);
      T.box(x - 0.03, 1.0, -0.75, x + 0.03, 1.08, 0.75, 'paintedYellow', { tint: YEL });
    }
    T.box(JL - 0.3, 1.0, -0.2, JL, 1.4, 0.2, 'emissiveRed');
    // counter-jib walkway, winch, counterweights
    T.box(-CJ, 0.95, -1.0, -1.2, 1.05, 1.0, 'diamond', { tint: 0x7a7a74 });
    for (const s of [-1, 1]) { T.box(-CJ, 1.05, s * 1.0 - 0.06, -1.2, 1.2, s * 1.0 + 0.06, 'paintedYellow', { tint: YEL }); T.box(-CJ, 2.0, s * 1.0 - 0.03, -1.2, 2.06, s * 1.0 + 0.03, 'paintedYellow', { tint: YEL }); }
    for (let x = -CJ; x < -1.2; x += 2.2) for (const s of [-1, 1]) T.box(x, 1.05, s * 1.0 - 0.03, x + 0.06, 2.06, s * 1.0 + 0.03, 'paintedYellow', { tint: YEL });
    T.part(new THREE.CylinderGeometry(0.6, 0.6, 1.4, 16), -5.5, 1.75, 0, 1, 1, 1, 'metalDark', { rx: Math.PI / 2 });
    T.box(-7.2, 1.05, -0.6, -6.2, 2.1, 0.6, 'paintedYellow', { tint: 0xa88010 });
    for (let i = 0; i < 4; i++) T.box(-CJ + 0.1 + i * 0.85, -0.9, -1.15, -CJ + 0.9 + i * 0.85, 2.3, 1.15, 'concrete', { tint: i % 2 ? 0x9a968e : 0xa8a49a });
    sign(T, 'NEWBURG CONSTRUCTION', -CJ + 1.8, 0.7, 1.17, 0, 3.2, 0.6, { bg: '#1a3a5a', fg: '#e8e0c0' });
    sign(T, 'NEWBURG CONSTRUCTION', -CJ + 1.8, 0.7, -1.17, 0, 3.2, 0.6, { bg: '#1a3a5a', fg: '#e8e0c0' });
    T.box(-CJ - 0.1, 1.2, -0.2, -CJ + 0.2, 1.5, 0.2, 'emissiveRed');
    sign(T, 'ATLAS', 20, 1.9, 0.08, 0, 3.0, 0.7, { fg: '#1a1a1a' });
    // pendants
    for (const x of [16, 30]) lattice(T, 0, 8.0, 0, x, 2.8, 0, 'metalDark', 0x2a2a2a, 0.05);
    lattice(T, 0, 8.0, 0, -CJ + 0.5, 1.5, 0, 'metalDark', 0x2a2a2a, 0.05);
  });
  slew.position.set(cx, top, cz);
  L.addObject(slew);
  // trolley (child)
  const trolley = buildGroup(L, (T) => {
    T.box(-0.7, 0.55, -0.95, 0.7, 0.95, 0.95, 'paintedYellow', { tint: 0xc89010 });
    for (const s of [-1, 1]) T.part(new THREE.CylinderGeometry(0.25, 0.25, 0.12, 12), 0, 0.5, s * 0.4, 1, 1, 1, 'metalDark', { rx: Math.PI / 2 });
    T.box(-0.12, 0.95, -0.12, 0.12, 1.15, 0.12, 'emissiveWarm', { tint: 0xffa020 });
  });
  trolley.position.set(R, 0, 0);
  slew.add(trolley);
  // hook block, cables, chains (world space, updated each frame)
  const mk = (geo, mat, tint) => { const m = vmesh(geo, mat, tint); m.castShadow = false; L.addObject(m); return m; };
  const cables = [0, 1].map(() => mk(new THREE.CylinderGeometry(0.025, 0.025, 1, 5), 'metalDark', 0x222222));
  const chains = [0, 1, 2, 3].map(() => mk(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), 'metalDark', 0x3a3a3a));
  const hook = buildGroup(L, (T) => {
    T.box(-0.35, -0.2, -0.18, 0.35, 0.55, 0.18, 'paintedYellow', { tint: 0xd8a010 });
    for (const s of [-1, 1]) T.part(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 12), s * 0.18, 0.45, 0, 1, 1, 1, 'metalDark', { rx: Math.PI / 2 });
    T.part(new THREE.TorusGeometry(0.2, 0.05, 6, 12, Math.PI * 1.4), 0, -0.45, 0, 1, 1, 1, 'metalDark', { rz: 0.8 });
  });
  L.addObject(hook);
  // the skip (local: floor bottom at y=0, long axis along Z)
  const W = SKIP.x1 - SKIP.x0, LEN = SKIP.z1 - SKIP.z0, wh = SKIP.wallH;
  const skip = buildGroup(L, (T) => {
    const hw = W / 2, hl = LEN / 2, t = 0.15;
    T.box(-hw, 0, -hl, hw, 0.25, hl, 'diamond', { tint: 0x5a5e58 });
    for (const s of [-1, 1]) {
      T.box(s > 0 ? hw - t : -hw, 0.25, -hl, s > 0 ? hw : -hw + t, 0.25 + wh, hl, 'paintedGreen', { tint: 0x2e5a3a });
      for (let z = -hl + 0.5; z < hl - 0.3; z += 0.9) T.box(s > 0 ? hw : -hw - 0.08, 0.2, z, s > 0 ? hw + 0.08 : -hw, 0.25 + wh, z + 0.14, 'paintedGreen', { tint: 0x24482e });
      T.box(s > 0 ? hw : -hw - 0.1, 0.25 + wh - 0.14, -hl, s > 0 ? hw + 0.1 : -hw, 0.25 + wh + 0.04, hl, 'paintedGreen', { tint: 0x1e3a26 });
      for (const zz of [-hl + 0.2, hl - 0.2]) T.box(s > 0 ? hw - 0.02 : -hw - 0.2, 0.25 + wh, zz - 0.12, s > 0 ? hw + 0.2 : -hw + 0.02, 0.25 + wh + 0.25, zz + 0.12, 'metalDark', { tint: 0x2a2a2a });
      for (let z = -hl; z < hl; z += 0.8) T.box(s > 0 ? hw + 0.001 : -hw - 0.02, 0.4, z, s > 0 ? hw + 0.02 : -hw - 0.001, 0.62, z + 0.4, 'paintedYellow', { tint: 0xd8b020 });
      sign(T, 'NEWBURG DISPOSAL · 30 YD', s * (hw + 0.11), 1.15, 0, s * Math.PI / 2, 3.4, 0.5, { bg: '#1e3a26', fg: '#e8e0c8' });
    }
    // runners underneath + tailgate folded back along one side
    for (const s of [-0.7, 0.7]) T.box(s - 0.1, -0.2, -hl, s + 0.1, 0, hl, 'metalDark', { tint: 0x2a2a2a });
    T.box(hw + 0.12, 0.3, hl - 2.3, hw + 0.24, 0.25 + wh, hl - 0.05, 'paintedGreen', { tint: 0x2a5236 });
    T.box(-hw + 0.2, 0.25, -hl + 0.6, hw - 0.2, 0.26, -hl + 1.2, 'rust', { tint: 0x5a4030 });
  });
  L.addObject(skip);
  for (const o of [skip, hook, ...cables, ...chains]) o.userData.noCull = true;
  // crane lights (moved with the jib each frame)
  const flood = [L.light(cx, top - 2, cz, 0xfff0d8, 0, 32, { on: false, priority: 1 }), L.light(cx, top - 2, cz, 0xfff0d8, 0, 30, { on: false, priority: 1 })];
  const amber = [L.light(cx, top + 3.4, cz, 0xffa020, 0, 12, { on: false, priority: 1 }), L.light(cx, top, cz, 0xffa020, 0, 9, { on: false })];
  const floodMat = new THREE.MeshBasicMaterial({ color: 0x222222, toneMapped: false });
  const lenses = [];
  for (const x of [9, 22]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), floodMat);
    m.position.set(x, 0.9, 0);
    slew.add(m);
    lenses.push(m);
  }
  return { slew, trolley, cables, chains, hook, skip, flood, amber, floodMat };
}

// ============================================================ HOTEL SIDE
function remoteStation(L, game) {
  const y = HR;
  const x = 39.5, z = 17.1;
  const p = P.prop(L, x, y, z, 0.35);
  p.box(0, 0.5, 0, 0.9, 1.0, 0.6, 'paintedYellow', 0xd8a820).box(0, 1.08, 0.02, 0.95, 0.16, 0.62, 'metalDark', 0x2a2a2a);
  p.box(0, 1.2, -0.05, 0.9, 0.08, 0.5, 'paintedYellow', 0xd8a820, [-0.4, 0, 0]);
  p.box(-0.25, 1.28, -0.12, 0.32, 0.03, 0.22, 'plastic', 0x2a2a2a, [-0.4, 0, 0]);
  p.cyl(-0.25, 1.36, -0.12, 0.025, 0.14, 'metalDark').sph(-0.25, 1.44, -0.12, 0.045, 'plasticGloss', 0x1a1a1a);
  p.cyl(0.05, 1.36, -0.12, 0.025, 0.14, 'metalDark').sph(0.05, 1.44, -0.12, 0.045, 'plasticGloss', 0x1a1a1a);
  p.cyl(0.3, 1.34, -0.1, 0.07, 0.07, 'plasticGloss', 0xc01010);
  p.box(0.15, 1.3, 0.12, 0.3, 0.2, 0.02, 'emissiveGreen', 0x3a6a3a, [-0.4, 0, 0]);
  p.cyl(0.4, 1.7, 0.2, 0.012, 1.0, 'metalDark');
  p.cyl(0, 0.03, 0, 0.55, 0.06, 'metalDark');
  p.col(0, 0.6, 0, 0.95, 1.2, 0.62, 'metal');
  const beaconBox = L.box(x - 0.08, y + 1.2, z + 0.24, x + 0.08, y + 1.4, z + 0.36, 'emissiveWarm', NC);
  const lamp = L.light(x, y + 1.9, z + 0.2, 0xffa020, 3, 5, { priority: 1 });
  sign(L, 'TOWER CRANE T-340\nRADIO REMOTE STATION', x - 0.12, y + 0.72, z - 0.33, 0.35, 0.8, 0.3, { bg: '#1a1a1a', fg: '#e8c020' });
  // rigging area: the rooftop unit the crew was lifting, straps, chain, gear box, cones
  const hv = P.prop(L, 31.4, y, 17.4, 0.08);
  hv.box(0, 0.08, 0, 2.6, 0.16, 1.6, 'wood', 0xb09a78).box(0, 0.9, 0, 2.4, 1.5, 1.4, 'metal', 0xb0b4b0).box(0, 1.68, 0, 1.0, 0.06, 1.0, 'blackMatte');
  for (const sx of [-0.9, 0.9]) hv.box(sx, 0.9, 0, 0.08, 1.7, 1.46, 'fabric', 0xe0a020);
  hv.col(0, 0.85, 0, 2.6, 1.7, 1.6, 'metal');
  sign(L, 'HVAC RTU-4\nHARBORVIEW RETROFIT', 31.3, y + 1.1, 16.69, 0, 1.2, 0.4, { bg: '#e8e0c8', fg: '#1a2a3a' });
  const gb = P.prop(L, 43.6, y, 18.9, 0);
  gb.box(0, 0.45, 0, 1.6, 0.9, 0.8, 'paintedYellow', 0xc89a20).box(0, 0.92, 0, 1.62, 0.06, 0.82, 'metalDark').col(0, 0.47, 0, 1.6, 0.94, 0.8, 'metal');
  sign(L, 'RIGGING GEAR', 43.6, y + 0.55, 18.49, 0, 0.9, 0.25, { bg: '#1a1a1a', fg: '#e8c020' });
  for (let i = 0; i < 12; i++) { const cp = P.prop(L, 38.8 + Math.cos(i * 0.5) * 0.4, y + 0.04, 18.9 + Math.sin(i * 0.5) * 0.4, i); cp.box(0, 0, 0, 0.12, 0.08, 0.06, 'metalDark'); }
  for (const [px, pz] of [[33.4, 15.6], [38.9, 15.4], [34.1, 17.9]]) physProp(L, 'cone', px, y, pz);
  for (const [a, b2] of [[[33.6, 15.4], [38.6, 15.4]]]) L.box(a[0], y + 0.85, a[1] - 0.01, b2[0], y + 0.9, a[1] + 0.01, 'paintedRed', { collide: false, tint: 0xd8c020 });
  // work light on a tripod lighting the bay
  const tl = P.prop(L, 33.0, y, 18.8, 0);
  for (let i = 0; i < 3; i++) { const a = i * 2.09; tl.box(Math.cos(a) * 0.3, 0.7, Math.sin(a) * 0.3, 0.03, 1.5, 0.03, 'metalDark', null, [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]); }
  tl.cyl(0, 1.7, 0, 0.02, 1.0, 'metalDark').box(0, 2.25, 0, 0.5, 0.35, 0.2, 'metalDark').box(0, 2.25, 0.105, 0.42, 0.28, 0.01, 'emissiveWarm');
  tl.col(0, 1.1, 0, 0.6, 2.2, 0.6, 'metal', F_SOLID | F_SHOOT);
  L.light(33.4, y + 2.4, 20.2, 0xfff0d0, 9, 12, { flicker: 0.05 });
  // pre-crescendo supplies on a crew table
  supplies(L, 42.1, y, 15.4, Math.PI, [{ type: 'ammo' }, { type: 'health', chance: 0.7 }, { type: 'throwable', chance: 0.7 }, { type: 'tier2', chance: 0.55 }], { w: 2.2, mat: 'metalDark' });
  physProp(L, 'propane', 44.9, y, 16.2);
  physProp(L, 'gascan', 29.2, y, 15.8);
  graffiti(L, 'HOLD THE\nREMOTE\nPRAY', 44.02, y + 1.6, 12.4, -Math.PI / 2, 1.4, 0.8, '#d8d8c8');
  return { pos: new THREE.Vector3(x, y + 1.25, z), lamp };
}

// ================================================================= EVENT
export function buildCraneEvent(L, game) {
  site(L, game);
  const ev = { phase: 'idle', t: 0, bridged: false, theta: 0, hy: START_H, sway: 0, swayV: 0, said: {} };
  const bayParts = bay(L, game, ev);
  const C = crane(L, game);
  const rs = remoteStation(L, game);
  // nav across the gap (disabled after the nav grid is built — see disableNavBridge)
  const navBridge = L.clip(SKIP.x0, HR, SKIP.z0, SKIP.x1, SKIP.floor, SKIP.z1, F_SOLID);
  const hoverDy = HOVER - HR;
  const plat = new MovingPlatform(L, null, [SKIP.x0, HR + hoverDy, SKIP.z0], [SKIP.x1, SKIP.floor + hoverDy, SKIP.z1], {
    to: [0, -hoverDy, 0], duration: 13,
    pauses: [{ at: 0.42, dur: 3.2, onPause: () => ev.stall() }],
    onArrive: () => ev.land(),
  });
  const walls = [
    plat.attachCollider([SKIP.x0, SKIP.floor + hoverDy, SKIP.z0], [SKIP.x0 + 0.15, SKIP.floor + SKIP.wallH + hoverDy, SKIP.z1]),
    plat.attachCollider([SKIP.x1 - 0.15, SKIP.floor + hoverDy, SKIP.z0], [SKIP.x1, SKIP.floor + SKIP.wallH + hoverDy, SKIP.z1]),
  ];
  const setCols = (on) => { plat.col.enabled = on; for (const w of walls) w.enabled = on; };
  setCols(false);
  const pivot = new THREE.Vector3(CRANE.x, CRANE.top, CRANE.z);
  const bayPos = new THREE.Vector3(36, HR + 1, 21);
  const snd = {};
  let horn = null;
  const say = (k, lines) => { if (ev.said[k]) return; ev.said[k] = true; game.voice.script(lines); };
  // spawn anchors for the waves (resolved to nav nodes on first use)
  const anchors = {
    stair: [[3, 8.6, 9.4], [8.5, 8.6, 9.4], [1.6, 10.3, 1.0]],
    machine: [[27.2, HR, 3.2], [30.8, HR, 3.6]],
    fire: [[44, 8.6, -2.6], [48.5, 8.6, -2.8], [40, 0, -6.5], [46, 0, -7.2]],
    deck: [[22, HR, 38], [46, HR, 32], [50, 7.8, 50], [26, HR, 50]],
  };
  let nodes = null;
  const resolve = () => {
    if (nodes) return nodes;
    nodes = {};
    const nav = game.level.nav;
    for (const k in anchors) nodes[k] = anchors[k].map(([x, y, z]) => nav.nearestNode(x, y, z, 2.5)).filter((n) => n >= 0);
    return nodes;
  };
  const waveSets = [['stair', 'machine'], ['fire', 'deck'], ['stair', 'deck', 'machine'], ['fire', 'machine', 'stair'], ['deck', 'stair', 'fire']];
  const waveNodes = (i) => { const n = resolve(); const s = waveSets[i % waveSets.length].flatMap((k) => n[k]); return s.length ? s : undefined; };

  // ---- visual state -> meshes / lights
  const trolleyW = new THREE.Vector3();
  const place = (dt) => {
    C.slew.rotation.y = ev.theta;
    const dx = Math.cos(ev.theta), dz = -Math.sin(ev.theta);
    trolleyW.set(CRANE.x + dx * R, CRANE.top + 0.5, CRANE.z + dz * R);
    // pendulum sway (perpendicular to the jib) driven by slew acceleration
    const px = -dz, pz = dx;
    const sx = trolleyW.x + px * ev.sway, sz = trolleyW.z + pz * ev.sway;
    const hy = ev.phase === 'lower' || ev.phase === 'landed' ? HOVER + plat.offset.y : ev.hy;
    C.skip.position.set(sx, hy, sz);
    C.skip.rotation.set(0, ev.theta + Math.PI / 2, 0);
    C.skip.rotateZ(-ev.sway * 0.03);
    const hookY = hy + SKIP.wallH + 3.6;
    C.hook.position.set(sx, hookY, sz);
    C.hook.rotation.y = ev.theta;
    for (let i = 0; i < 2; i++) {
      _a.set(trolleyW.x + dz * 0.2 * (i ? 1 : -1), trolleyW.y, trolleyW.z - dx * 0.2 * (i ? 1 : -1));
      _b.set(sx + dz * 0.15 * (i ? 1 : -1), hookY + 0.5, sz - dx * 0.15 * (i ? 1 : -1));
      setSeg(C.cables[i], _a, _b);
    }
    const hw = (SKIP.x1 - SKIP.x0) / 2 - 0.1, hl = (SKIP.z1 - SKIP.z0) / 2 - 0.2;
    const ca = Math.cos(ev.theta + Math.PI / 2), sa = Math.sin(ev.theta + Math.PI / 2);
    let i = 0;
    for (const [lx, lz] of [[-hw, -hl], [hw, -hl], [-hw, hl], [hw, hl]]) {
      const wx = sx + ca * lx + sa * lz, wz = sz - sa * lx + ca * lz;
      _a.set(sx, hookY - 0.45, sz);
      _b.set(wx, hy + 0.25 + SKIP.wallH + 0.15, wz);
      setSeg(C.chains[i++], _a, _b);
    }
    // lights follow the jib
    for (const [k, l] of C.flood.entries()) { const r = k ? 22 : 9; l.x = CRANE.x + dx * r; l.z = CRANE.z + dz * r; l.y = CRANE.top - 0.5; }
    C.amber[0].x = CRANE.x + dx * 1.3; C.amber[0].z = CRANE.z + dz * 1.3;
    C.amber[1].x = trolleyW.x; C.amber[1].z = trolleyW.z; C.amber[1].y = trolleyW.y + 1.0;
    if (snd.slew) snd.slew.set({ pos: pivot });
    if (snd.hoist) snd.hoist.set({ pos: trolleyW });
  };
  place(0);

  ev.start = (s) => {
    if (ev.phase !== 'idle') return;
    ev.phase = 'power'; ev.t = 0;
    console.log('[da2] crane started');
    const who = s?.char?.id || 'louis';
    game.audio.play('buttonPress', { pos: rs.pos, vol: 1 });
    game.audio.play('radioBeep', { pos: rs.pos, vol: 1 });
    game.session.objective('Hold out while the crane bridges the gap');
    game.audio.music?.stinger?.('finaleStart');
    say('start', [
      { who, text: who === 'louis' ? 'Link\'s up! Crane\'s powering up — it\'s gonna be LOUD!' : 'It\'s working! Crane\'s powering up — this is gonna be loud!', d: 0.3 },
      { who: who === 'bill' ? 'zoey' : 'bill', text: 'Here they come! Watch the stairs and that machine room!', d: 4.0 },
    ]);
    L.after(0.6, () => { snd.diesel = game.audio.loop('generator', { pos: new THREE.Vector3(CRANE.x, HR + 1, CRANE.z), vol: 0.9 }); game.audio.play('explosion', { pos: new THREE.Vector3(CRANE.x, HR + 1, CRANE.z), vol: 0.15 }); });
    L.after(1.4, () => { horn = game.audio.loop('alarm', { pos: pivot, vol: 1.0 }); });
    L.after(1.8, () => { for (const f of C.flood) { f.on = true; f.intensity = 30; } C.floodMat.color.setHex(0xfff4e0); game.audio.play('metalGate', { pos: pivot, vol: 0.8 }); });
    L.after(3.2, () => {
      game.director.blockWanderers = true;
      game.director.panic('crane', {
        endless: true, interval: 12, size: [10, 14], nodes: waveNodes(0), where: 'any', minD: 8, maxD: 80, force: true, stingEvery: false,
        onWave: (i) => {
          const p = game.director.panicState;
          if (!p || p.name !== 'crane') return;
          p.nodes = waveNodes(i);
          p.size = [10 + Math.min(i, 4), 14 + Math.min(i, 4) * 2];
          if (i === 1) say('fire', [{ who: 'francis', text: 'They\'re climbing the fire escape!', d: 0.2 }]);
          if (i === 2) say('deck', [{ who: 'louis', text: 'They\'re on the other roof too — waiting for us at that gate!', d: 0.3 }]);
        },
      });
    });
  };
  ev.stall = () => {
    snd.hoist?.set({ vol: 0.15 });
    game.audio.play('metalImpact', { pos: trolleyW, vol: 1.2 });
    say('stall', [{ who: 'francis', text: 'It stopped! Why\'d it stop?!', d: 0.1 }, { who: 'louis', text: 'Overload alarm! Just give it a second!', d: 1.5 }]);
    L.after(3.0, () => { snd.hoist?.set({ vol: 1 }); game.audio.play('metalGate', { pos: trolleyW, vol: 0.9 }); });
  };
  ev.land = () => {
    ev.phase = 'landed'; ev.t = 0;
    ev.bridged = true;
    snd.hoist?.stop(0.4); snd.hoist = null;
    game.audio.play('metalImpact', { pos: bayPos, vol: 1.6 });
    L.after(0.25, () => game.audio.play('metalImpact', { pos: bayPos, vol: 1.1 }));
    game.shake?.(0.6);
    for (let i = 0; i < 4; i++) game.fx.dust(34.5 + i * 0.8, HR + 0.3, i % 2 ? 19.4 : 25.4, 0, 0.5, 0, [0.45, 0.42, 0.38], 6, 0.9);
    for (const [x, z] of [[SKIP.x0, SKIP.z0 + 0.3], [SKIP.x1, SKIP.z0 + 0.3], [SKIP.x0, SKIP.z1 - 0.3], [SKIP.x1, SKIP.z1 - 0.3]]) game.fx.sparks(x, HR + 0.1, z, 0, 1, 0, 16);
    L.after(1.0, () => { bayParts.gN.open(); bayParts.gS.open(); horn?.stop(1.5); horn = null; });
    game.session.objective('Cross the skip to the construction site!');
    game.voice.script([{ who: 'bill', text: 'That\'s our bridge! Across — now!', d: 0.8 }, { who: 'zoey', text: 'Don\'t look down. Don\'t look down.', d: 3.0 }]);
    L.after(9, () => {
      const p = game.director.panicState;
      if (p && p.name === 'crane') game.director.stopPanic();
    });
    L.after(30, () => { game.director.blockWanderers = false; snd.diesel?.set({ vol: 0.35 }); });
  };

  const u = usable(L, rs.pos.x, rs.pos.y, rs.pos.z, 'Operate the crane', (s) => ev.start(s), { hold: 3, holdLabel: 'Linking the crane remote...', radius: 1.9 });
  ev.usable = u;

  // ---- per-frame timeline
  const ease = (k) => k * k * (3 - 2 * k);
  const SLEW0 = 7.5, SLEW_T = 26;
  ev.update = (dt) => {
    if (ev.phase === 'idle') {
      // bots-only team: a bot at the remote works it
      const p = game.player;
      if ((!p || p.dead) && game.survivors.some((s) => !s.dead && s.pos.distanceTo(rs.pos) < 2.6)) { u.enabled = false; ev.start(game.survivors.find((s) => !s.dead)); }
      const k = (Math.sin(game.time * 5) > 0) ? 1 : 0.15;
      rs.lamp.intensity = 3 * k;
      // parked skip sways a little in the wind
      ev.sway = Math.sin(game.time * 0.6) * 0.25;
      place(dt);
      return;
    }
    ev.t += dt;
    const T = ev.t;
    // beacons
    const blink = Math.max(0, Math.sin(game.time * 8));
    for (const a of C.amber) { a.on = ev.phase !== 'landed' || T < 3; a.intensity = 10 * blink; }
    for (const g of [bayParts.gN, bayParts.gS]) for (const l of g.lamp) { l.on = !ev.bridged; l.intensity = 6 * Math.max(0, Math.sin(game.time * 7 + l.x)); }
    rs.lamp.intensity = 4 * blink;
    if (ev.phase === 'power') {
      if (T > 3.2) { ev.phase = 'hoist'; snd.hoist = game.audio.loop('elevatorMotor', { pos: trolleyW, vol: 1 }); }
    } else if (ev.phase === 'hoist') {
      ev.hy = START_H + (HOVER - START_H) * ease(Math.min(1, (T - 3.2) / 4.3));
      if (T >= SLEW0) {
        ev.phase = 'slew';
        snd.slew = game.audio.loop('liftMotor', { pos: pivot, vol: 1.1 });
        snd.hoist?.stop(0.4); snd.hoist = null;
        game.audio.play('metalGate', { pos: pivot, vol: 1 });
        say('swing', [{ who: 'zoey', text: 'It\'s swinging over! Keep them off us!', d: 1.2 }]);
      }
    } else if (ev.phase === 'slew') {
      const k = Math.min(1, (T - SLEW0) / SLEW_T);
      const prev = ev.theta;
      ev.theta = (Math.PI / 2) * ease(k);
      const w = (ev.theta - prev) / Math.max(dt, 1e-4);
      // pendulum: driven by angular velocity changes
      const acc = (w - (ev.lastW ?? 0)) / Math.max(dt, 1e-4);
      ev.lastW = w;
      ev.swayV += (-ev.sway * 1.6 - acc * R * 0.35 - ev.swayV * 0.25) * dt;
      ev.sway += ev.swayV * dt;
      ev.dustT = (ev.dustT ?? 1) - dt;
      if (ev.dustT <= 0) { ev.dustT = 0.6 + Math.random() * 1.2; const q = C.skip.position; game.fx.dust(q.x + (Math.random() - 0.5) * 2, q.y - 0.2, q.z + (Math.random() - 0.5) * 2, 0, -1, 0, [0.4, 0.37, 0.33], 4, 0.6); }
      ev.clankT = (ev.clankT ?? 3) - dt;
      if (ev.clankT <= 0) { ev.clankT = 4 + Math.random() * 3; game.audio.play('metalGate', { pos: pivot, vol: 0.7 }); }
      if (k >= 1) {
        ev.phase = 'settle'; ev.st = T;
        snd.slew?.stop(0.8); snd.slew = null;
        game.audio.play('metalImpact', { pos: pivot, vol: 0.9 });
        say('line', [{ who: 'louis', text: 'Lining it up... lowering!', d: 0.2 }]);
      }
    } else if (ev.phase === 'settle') {
      ev.swayV += (-ev.sway * 1.6 - ev.swayV * 1.2) * dt;
      ev.sway += ev.swayV * dt;
      if (T - ev.st > 2.2) {
        ev.phase = 'lower';
        ev.sway = 0; ev.swayV = 0;
        setCols(true);
        plat.start();
        snd.hoist = game.audio.loop('elevatorMotor', { pos: trolleyW, vol: 1 });
      }
    }
    place(dt);
  };
  L.dynamics.push({ update: (dt) => ev.update(dt) });

  // ---- discovery beats
  L.trigger(3, HR - 0.5, 8.3, 8, HR + 3, 11.5, () => {
    game.session.objective('Find a way across to the construction site');
    game.voice.script([
      { who: 'louis', text: 'Whoa. Check out that crane on the site next door.', d: 0.6 },
      { who: 'bill', text: 'Construction deck\'s right across that gap. We need a bridge.', d: 3.0 },
    ]);
  });
  L.trigger(33, HR - 0.5, 12.5, 46, HR + 3, 19.8, () => {
    if (ev.phase !== 'idle') return;
    game.session.objective('Use the crane remote to bridge the gap');
    game.voice.script([
      { who: 'zoey', text: 'There\'s a remote station here. "Tower crane T-340."', d: 0.2 },
      { who: 'louis', text: 'I can work that. It\'s basically a giant joystick.', d: 2.6 },
      { who: 'francis', text: 'I hate cranes.', d: 5.2 },
    ]);
  });
  L.trigger(30, HR - 0.5, 27.2, 42, HR + 3, 31, () => {
    if (!ev.bridged) return;
    game.voice.script([{ who: 'francis', text: 'For the record? I still hate cranes.', d: 1.0 }]);
    const p = game.director.panicState;
    if (p && p.name === 'crane') L.after(4, () => { const q = game.director.panicState; if (q && q.name === 'crane') game.director.stopPanic(); });
  });
  // director: never spawn on the bridge / in the landing zones
  ev.noSpawn = [[SKIP.x0 - 1, HR - 1, GATE_N - 0.5, SKIP.x1 + 1, HR + 3, GATE_S + 0.5]];
  ev.navBridge = navBridge;
  ev.plat = plat;
  ev.gates = bayParts;
  ev.C = C;
  ev.disableNavBridge = () => { if (ev.navBridge >= 0) L.col.disableBox(ev.navBridge); };
  return ev;
}
