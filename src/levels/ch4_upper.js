// Chapter 4 — the tower: 28F / 29F under construction (open edges, steel,
// scaffolding outside the east face, plastic sheeting, work lights), the tower
// body below it, a tower crane, the front plaza and the burning city far below.
// Route: upper elevator (x 54, z 22) -> 28F south floor (open to the sky) ->
// east scaffold walkway outside the building -> NE room -> construction stair
// -> 29F mezzanine ledge in front of the core -> safe room below the roof.
import * as THREE from 'three';
import { ceilingLight, wallLamp, sign, graffiti, supplies, fireSource, physProp, burningBarrel, P, floorWithHoles } from './kit.js';
import { Door } from '../world/dynamic.js';
import { DF } from '../render/decals.js';
import {
  CH, rng, pickr, slab, finish, stairwell, steelColumn, steelBeam, workLight, cableSpool, drywallStack, toolCart, sawhorse, concreteBags, rebar,
  PlasticSheets, safeBox, bloodTrail, scatterBlood, boxMesh, F_SOLID, F_SHOOT, F_SIGHT, F_DEFAULT,
} from './ch4_parts.js';

export const Y28 = 108, Y29 = 112, ROOFY = 115.4;
const TX0 = 32, TX1 = 76, TZ0 = 2, TZ1 = 42; // tower footprint
const NOTCH = [66, 32, 76, 42];
const CORE = [45.85, 19.85, 62.15, 24.15];
const STAIR = [64, 2.4, 70, 11.2];

function guard(L, x0, z0, x1, z1, y) {
  // temporary guard rail (2 tubes + posts), solid for movement only
  const along = x1 - x0 > z1 - z0;
  L.box(x0, y, z0, x1, y + 1.1, z1, 'metal', { visible: false, flags: F_SOLID });
  const n = Math.max(1, Math.round((along ? x1 - x0 : z1 - z0) / 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = along ? x0 + (x1 - x0) * t : (x0 + x1) / 2, pz = along ? (z0 + z1) / 2 : z0 + (z1 - z0) * t;
    L.box(px - 0.03, y, pz - 0.03, px + 0.03, y + 1.1, pz + 0.03, 'paintedYellow', { collide: false, tint: 0xb89020 });
  }
  for (const h of [0.55, 1.08]) {
    if (along) L.box(x0, y + h - 0.02, (z0 + z1) / 2 - 0.02, x1, y + h + 0.02, (z0 + z1) / 2 + 0.02, 'paintedYellow', { collide: false, tint: 0xb89020 });
    else L.box((x0 + x1) / 2 - 0.02, y + h - 0.02, z0, (x0 + x1) / 2 + 0.02, y + h + 0.02, z1, 'paintedYellow', { collide: false, tint: 0xb89020 });
  }
}
function edgeSign(L, text, x, y, z, ry) { sign(L, text, x, y, z, ry, 1.2, 0.5, { bg: '#e8c020', fg: '#111', border: '#111' }); }

// Collects visual-only boxes and emits one mesh per material (instead of the
// level's 28 m sector buckets, which would mean hundreds of draw calls for a
// city this size). Same box() signature as Level so kit helpers accept it.
class Collector {
  constructor(L) { this.L = L; this.list = []; }
  mesh(...a) { this.L.mesh(...a); }
  box(x0, y0, z0, x1, y1, z1, mat, o = {}) { if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0]; if (z0 > z1) [z0, z1] = [z1, z0]; this.list.push([x0, y0, z0, x1, y1, z1, mat, o.tint, o.ao ?? 0.72]); }
  build(L) { const g = boxMesh(this.list); g.traverse((m) => { if (m.isMesh) { m.castShadow = false; if (m.material.name?.startsWith('emissive')) m.receiveShadow = false; } }); L.addObject(g); return g; }
}

// Visual-only city block (no collision -> stays out of nav bounds). Only lit
// windows are drawn; the rest of the facade reads as dark glass/concrete.
function cityBlock(L, x0, z0, x1, z1, h, o = {}) {
  const mat = o.mat ?? pickr(['concreteDark', 'brickDark', 'concrete', 'brick']);
  const tint = o.tint ?? pickr([0x6a6660, 0x5a5854, 0x7a7068, 0x4a4a50, 0x6a5a50]);
  L.box(x0, -0.3, z0, x1, h, z1, mat, { collide: false, tint, ao: 0.5 });
  const lit = o.lit ?? 0.06, fire = o.fire ?? 0;
  const fh = 3.4;
  const win = (fx, fy, fz, axis, s) => {
    const r = rng();
    if (r > lit + fire) return;
    const burning = r < fire;
    const m = burning ? 'emissiveWarm' : 'emissiveWindow';
    const t = burning ? 0xff5a18 : rng() < 0.75 ? 0xffc080 : 0x9ab0ff;
    if (axis === 'x') L.box(fx - 0.6, fy, fz + s * 0.02, fx + 0.6, fy + 1.5, fz + s * 0.06, m, { collide: false, tint: t });
    else L.box(fx + s * 0.02, fy, fz - 0.6, fx + s * 0.06, fy + 1.5, fz + 0.6, m, { collide: false, tint: t });
  };
  const faces = o.faces ?? ['n', 's', 'e', 'w'];
  for (let y = 4; y < h - 2; y += fh) {
    if (faces.includes('n')) for (let x = x0 + 1.6; x < x1 - 1; x += 3) win(x, y, z0, 'x', -1);
    if (faces.includes('s')) for (let x = x0 + 1.6; x < x1 - 1; x += 3) win(x, y, z1, 'x', 1);
    if (faces.includes('w')) for (let z = z0 + 1.6; z < z1 - 1; z += 3) win(x0, y, z, 'z', -1);
    if (faces.includes('e')) for (let z = z0 + 1.6; z < z1 - 1; z += 3) win(x1, y, z, 'z', 1);
  }
  // roof: parapet + clutter + (maybe) an aircraft warning light
  L.box(x0, h, z0, x1, h + 0.9, z0 + 0.35, mat, { collide: false, tint });
  L.box(x0, h, z1 - 0.35, x1, h + 0.9, z1, mat, { collide: false, tint });
  if (rng() < 0.6) { const cx = x0 + (x1 - x0) * (0.25 + rng() * 0.5), cz = z0 + (z1 - z0) * (0.25 + rng() * 0.5); L.box(cx - 2, h, cz - 1.5, cx + 2, h + 2.4, cz + 1.5, 'metalDark', { collide: false }); }
  if (h > 55) L.box((x0 + x1) / 2 - 0.2, h + 0.9, (z0 + z1) / 2 - 0.2, (x0 + x1) / 2 + 0.2, h + 1.3, (z0 + z1) / 2 + 0.2, 'emissiveRed', { collide: false });
  if (o.roofFire) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (let i = 0; i < 5; i++) L.box(cx - 3 + rng() * 6, h, cz - 3 + rng() * 6, cx - 2 + rng() * 6, h + 0.6 + rng() * 2.2, cz - 2 + rng() * 6, 'emissiveWarm', { collide: false, tint: pickr([0xff6a20, 0xff4a10, 0xffa040]) });
  }
}

export function buildUpper(L, game, S) {
  const y = Y28, y2 = Y29;
  const plastic = new PlasticSheets();

  // ============================================================ TOWER BODY
  const tower = (x0, z0, x1, z1, top, faces) => {
    L.box(x0, 18, z0, x1, top, z1, 'concrete', { tint: 0x9a9a98, ao: 0.6 });
    for (let wy = 19; wy < top - 1.6; wy += 4) {
      if (faces.includes('n')) for (let x = x0 + 1.4; x < x1 - 1; x += 2.8) L.box(x - 0.9, wy, z0 - 0.04, x + 0.9, wy + 2.2, z0 - 0.01, rng() < 0.08 ? 'emissiveWindow' : 'glassDirty', { collide: false, tint: rng() < 0.08 ? 0x9ab0c8 : 0x1a2228 });
      if (faces.includes('s')) for (let x = x0 + 1.4; x < x1 - 1; x += 2.8) L.box(x - 0.9, wy, z1 + 0.01, x + 0.9, wy + 2.2, z1 + 0.04, rng() < 0.08 ? 'emissiveWindow' : 'glassDirty', { collide: false, tint: rng() < 0.08 ? 0x9ab0c8 : 0x1a2228 });
      if (faces.includes('w')) for (let z = z0 + 1.4; z < z1 - 1; z += 2.8) L.box(x0 - 0.04, wy, z - 0.9, x0 - 0.01, wy + 2.2, z + 0.9, rng() < 0.08 ? 'emissiveWindow' : 'glassDirty', { collide: false, tint: rng() < 0.08 ? 0x9ab0c8 : 0x1a2228 });
      if (faces.includes('e')) for (let z = z0 + 1.4; z < z1 - 1; z += 2.8) L.box(x1 + 0.01, wy, z - 0.9, x1 + 0.04, wy + 2.2, z + 0.9, rng() < 0.08 ? 'emissiveWindow' : 'glassDirty', { collide: false, tint: rng() < 0.08 ? 0x9ab0c8 : 0x1a2228 });
    }
  };
  tower(32, 2, 76, 32, 107.7, ['n', 'e', 'w']);
  tower(32, 32, 66, 42, 107.7, ['s', 'w', 'e']);
  tower(66, 32, 76, 42, 96, ['s', 'e']);
  // collapsed corner: rubble on top of the notch + dangling rebar
  P.debris(L, 71, 96, 37, 3.5, 'concrete', 18);
  for (let i = 0; i < 6; i++) P.pipe(L, 66 + rng() * 10, 107.7, 32.05, 66 + rng() * 10, 104 - rng() * 3, 32.4 + rng(), 0.02, 'rust');
  L.decal(71, 96.02, 37, 0, 1, 0, 6, DF.SCORCH);
  fireSource(L, 70, 96, 38, 1.2, { hazard: false });
  L.reverb(TX0, 104, TZ0, TX1 + 3, 120, TZ1, 'outdoor');

  // ================================================================ 28F
  floorWithHoles(L, TX0, TZ0, TX1, TZ1, y, 0.3, 'concreteFloor', [NOTCH, CORE]);
  finish(L, 46, 24.15, 62, 30, y, 'tileFloor', 0xa8a8a0);
  // 29F slab (over the north half) with core + stair holes, and the roof above it
  floorWithHoles(L, TX0, TZ0, TX1, 26, y2, 0.3, 'concrete', [CORE, [STAIR[0] - 0.15, STAIR[1] - 0.15, STAIR[2] + 0.15, STAIR[3] + 0.15]]);
  L.box(TX0, ROOFY, TZ0, TX1, ROOFY + 0.6, 26, 'concrete', { tint: 0x8a8a88 });
  // columns + beams
  for (const cx of [36, 44, 52, 60, 68]) for (const cz of [6, 14, 30, 38]) {
    if (cx === 68 && cz >= 32) continue; // notch
    if (cz < 26 && cx > 45) continue; // core + NE stair zone
    if (cx === 36 && cz === 6) continue; // end safe room
    steelColumn(L, cx, cz, y, cz < 26 ? ROOFY : ROOFY + 0.5);
  }
  for (const cz of [30, 38]) steelBeam(L, TX0, cz < 32 ? TX1 : 66, cz, ROOFY + 0.05, 'x', { h: 0.5 });
  for (const cx of [36, 44, 52, 60]) steelBeam(L, 26, TZ1, cx, ROOFY + 0.05, 'z', { h: 0.5 });
  steelBeam(L, 26, 32, 68, ROOFY + 0.05, 'z', { h: 0.5 });
  for (const cz of [6, 14]) steelBeam(L, TX0, 61.9, cz, y2 - 0.75, 'x');
  steelBeam(L, TX0, CORE[0], 22, y2 - 0.75, 'x'); steelBeam(L, CORE[2], TX1, 22, y2 - 0.75, 'x');
  steelBeam(L, TX0, TX1, 25.8, y2 - 0.75, 'x', { h: 0.45 });
  // edges: north curtain wall (installed), west precast panels, east panels with gaps
  L.box(TX0, y - 0.3, TZ0 - 0.2, TX1, ROOFY + 0.6, TZ0, 'concrete', { tint: 0x8a8a88 });
  for (let x = TX0 + 2; x < TX1 - 1; x += 3) for (const fy of [y + 0.9, y2 + 0.9]) L.box(x - 1.2, fy, TZ0 - 0.22, x + 1.2, fy + 1.8, TZ0 - 0.2, 'glassDirty', { collide: false, tint: 0x3a4a50 });
  // west: panels to 20, then open bays with some panels
  L.box(TX0 - 0.2, y - 0.3, TZ0, TX0, ROOFY + 0.6, 20, 'concrete', { tint: 0x8a8a88 });
  L.box(TX0 - 0.2, y - 0.3, 20, TX0, y + 1.1, 30, 'concrete', { tint: 0x8a8a88 }); // knee wall
  L.box(TX0 - 0.2, y + 1.1, 20, TX0, y + 1.2, 30, 'metalDark', { collide: false });
  guard(L, TX0 - 0.1, 30, TX0 + 0.1, 36, y);
  edgeSign(L, 'DANGER\nNO GUARDRAIL', TX0 + 0.12, y + 1.25, 33, Math.PI / 2);
  for (const [a, b] of [[20, 26], [26, 30]]) L.box(TX0 - 0.2, y + 1.2, a + 0.1, TX0, y2 - 0.3, b - 0.1, 'glassDirty', { tint: 0x5a6a70 });
  for (const z of [20, 26, 30]) L.box(TX0 - 0.25, y + 1.1, z - 0.1, TX0 + 0.05, y2 - 0.3, z + 0.1, 'metalDark', { collide: false });
  L.box(TX0 - 0.2, y2 - 0.3, 20, TX0, ROOFY + 0.6, 26, 'concrete', { tint: 0x8a8a88 });
  // west windows on 29F
  for (let z = 4; z < 25; z += 3) L.box(TX0 - 0.22, y2 + 0.9, z - 1.1, TX0 - 0.2, y2 + 2.6, z + 1.1, 'glassDirty', { collide: false, tint: 0x3a4a50 });
  // south edge: completely open, a few guard sections + netting
  guard(L, 32, 41.8, 42, 42, y); guard(L, 50, 41.8, 58, 42, y);
  for (const x of [37, 54]) edgeSign(L, 'KEEP BACK\nFROM EDGE', x, y + 1.25, 41.78, Math.PI);
  // notch edges (collapsed SE corner)
  guard(L, 66, 31.8, 70, 32, y); guard(L, 65.8, 34, 66, 42, y);
  P.barricade(L, 72.5, y, 31.4, 0);
  edgeSign(L, 'FLOOR\nCOLLAPSED', 69, y + 1.3, 31.7, Math.PI);
  P.debris(L, 69, y, 30.2, 1.4, 'concrete', 12);
  // east facade: solid 2..6 and 10..20, open 6..10 (re-entry) and 20..32 (to the scaffold)
  L.box(TX1, y - 0.3, TZ0, TX1 + 0.2, ROOFY + 0.6, 6, 'concrete', { tint: 0x8a8a88 });
  L.box(TX1, y - 0.3, 10, TX1 + 0.2, ROOFY + 0.6, 20, 'concrete', { tint: 0x8a8a88 });
  L.box(TX1, y2 - 0.3, 6, TX1 + 0.2, ROOFY + 0.6, 10, 'concrete', { tint: 0x8a8a88 });
  L.box(TX1, y2 - 0.3, 20, TX1 + 0.2, ROOFY + 0.6, 26, 'concrete', { tint: 0x8a8a88 });
  for (let z = 11; z < 20; z += 3) L.box(TX1 + 0.2, y + 0.9, z - 1.1, TX1 + 0.22, y + 2.6, z + 1.1, 'glassDirty', { collide: false, tint: 0x3a4a50 });
  plastic.add(TX1 - 0.02, y, 20.2, TX1 + 0.02, y + 3.0, 23.8);
  plastic.add(TX1 - 0.02, y + 2.6, 6.1, TX1 + 0.02, y + 3.6, 9.9);
  // interior partitions on 28F: seal off the west/north half and the NE room
  L.wallX(TX0, CORE[0], 20, y, y2 - 0.3, 'plasterHosp', 0.16, [{ a: 38, b: 39.1, y0: y, y1: y + 2.2 }]);
  new Door(L, 38.55, y, 20, 'x', { width: 1.1, locked: true, material: 'wood' });
  L.wallX(CORE[2], TX1, 20, y, y2 - 0.3, 'concreteDark', 0.2);
  L.wallZ(TZ0, 20, 62, y, y2 - 0.3, 'concreteDark', 0.2);
  // partial drywall around the lobby (studs + some boards)
  for (const x of [46, 62]) {
    for (let z = 27.5; z < 30.1; z += 0.6) L.box(x - 0.04, y, z - 0.03, x + 0.04, y2 - 0.3, z + 0.03, 'metalClean', { collide: false, tint: 0xa0a4a4 });
    L.box(x - 0.04, y2 - 0.42, 27.2, x + 0.04, y2 - 0.36, 30.1, 'metalClean', { collide: false, tint: 0xa0a4a4 });
    L.box(x - 0.06, y, 24.3, x + 0.06, y2 - 0.3, 27.2, 'plasterHosp', { tint: 0xd8d8d0 });
    L.clip(x - 0.06, y, 27.2, x + 0.06, y2 - 0.3, 30.1, F_SOLID | F_SIGHT);
  }
  sign(L, 'TOWER 28', 50, y + 2.4, 24.17, 0, 1.6, 0.4, { bg: '#d8d8d0', fg: '#2a2a2a' });
  sign(L, 'HARD HAT AREA\nAUTHORIZED PERSONNEL ONLY', 58, y + 2.2, 24.17, 0, 2.2, 0.6, { bg: '#1a4a8a', fg: '#fff' });
  graffiti(L, 'ROOF STAIRS\nNORTH-EAST\nTAKE SCAFFOLD', 61.92, y + 1.6, 25.8, -Math.PI / 2, 1.8, 1.0, '#ff6a20');
  // dressing: south floor
  const R = (a, b) => a + rng() * (b - a);
  drywallStack(L, 40, y, 27.5, 0.1); drywallStack(L, 40.3, y, 29.2, -0.05, 6);
  cableSpool(L, 48.5, y, 35, 0.6, 0.3); cableSpool(L, 71, y, 24.5, 0.5, 1.2);
  toolCart(L, 57, y, 33.2, 0.6); toolCart(L, 35, y, 23, 1.6);
  sawhorse(L, 53, y, 38.8, 0.1); sawhorse(L, 37, y, 33, 1.3);
  concreteBags(L, 64.5, y, 28.5, 0.2); concreteBags(L, 45, y, 39.5, 1.4);
  rebar(L, 58, y, 38.6, Math.PI / 2, 5); rebar(L, 34.5, y, 28, 0.1, 4);
  P.generator(L, 68.5, y, 22.5, Math.PI / 2);
  P.barrel(L, 74.8, y, 21, 0x3a4a6a); P.barrel(L, 74.9, y, 21.8, 0x9a3a1a);
  burningBarrel(L, 42, y, 34);
  for (const [x, z] of [[47, 31], [60.5, 36.5], [38, 38], [70.5, 29]]) physProp(L, rng() < 0.5 ? 'bucket' : 'cone', x, y, z);
  physProp(L, 'gascan', 63.4, y, 21.4); physProp(L, 'propane', 69.6, y, 21.6); physProp(L, 'gascan', 44.2, y, 36.2);
  // site table: supplies after the ride
  supplies(L, 50.5, y, 27.6, 0, ['ammo', { type: 'tier2' }, { type: 'health' }], { w: 2.2, mat: 'wood' });
  L.item('throwable', 57.8, y + 0.86, 33.2, { chance: 0.6 });
  L.item('pills', 35.2, y + 0.86, 23, { chance: 0.6 });
  // plastic sheeting curtains hanging from beams
  for (const [x0, z0, x1, z1] of [[32.2, 30, 40, 30.02], [58.5, 30.5, 58.52, 34], [36, 37, 36.02, 42]]) plastic.add(x0, y + 0.25, z0, x1, ROOFY, z1);
  // bodies: the crew that stayed
  for (const [x, z, r] of [[52, 36.5, 0.4], [66.5, 27.5, 2.1], [39, 25, 1.1]]) { P.corpse(L, x, y + 0.01, z, r, pickr([0xd87a18, 0xc8b020, 0x3a4a6a])); L.decal(x, y + 0.012, z, 0, 1, 0, 1.6, DF.POOL); }
  scatterBlood(L, 34, 25, 74, 41, y, 7);
  bloodTrail(L, 55, 26, 70, 29, y, 7);
  // lighting: work lights + string lights; sky / moon light does the rest up here
  workLight(L, 54, y, 31.5, Math.PI, { intensity: 16, range: 14 });
  workLight(L, 38.5, y, 36, -Math.PI / 2, { intensity: 14, range: 13 });
  workLight(L, 70.5, y, 26.5, Math.PI * 0.75, { intensity: 14, range: 13, flicker: 0.3 });
  workLight(L, 44.5, y, 22.5, 0, { on: false });
  for (let i = 0; i < 7; i++) L.box(34 + i * 5, ROOFY - 0.4 - (i % 2) * 0.2, 33.9, 34.3 + i * 5, ROOFY - 0.2 - (i % 2) * 0.2, 34.1, 'emissiveWarm', { collide: false });
  L.light(48, ROOFY - 1, 34, 0xffd8a0, 7, 12, { flicker: 0.1 });
  L.light(64, ROOFY - 1, 34, 0xffd8a0, 6, 12, { flicker: 0.3 });
  L.ambience(TX0 - 4, 104, TZ0 - 4, TX1 + 6, 125, TZ1 + 4, 'rooftop');
  L.witchSpots.push({ x: 35.5, y, z: 40 });

  // ================================================ EAST SCAFFOLD (x 76..78.4)
  const sx0 = 76.2, sx1 = 78.4;
  L.box(TX1, y - 0.12, 6, sx1, y, 31.8, 'wood', { tint: 0x8a7a5a });
  for (let z = 6.4; z < 31.8; z += 0.28) L.box(TX1 + 0.05, y + 0.001, z, sx1 - 0.05, y + 0.006, z + 0.02, 'woodDark', { collide: false });
  // outer rail (a section is torn away) + toe boards
  L.box(sx1 - 0.1, y, 6, sx1 + 0.1, y + 1.1, 13, 'metal', { visible: false, flags: F_SOLID });
  L.box(sx1 - 0.1, y, 15.6, sx1 + 0.1, y + 1.1, 31.8, 'metal', { visible: false, flags: F_SOLID });
  L.box(TX1, y, 31.7, sx1 + 0.1, y + 1.1, 31.9, 'metal', { visible: false, flags: F_SOLID });
  L.box(TX1, y, 5.9, sx1 + 0.1, y + 1.1, 6.1, 'metal', { visible: false, flags: F_SOLID });
  for (const [a, b] of [[6, 13], [15.6, 31.8]]) {
    for (const h of [0.55, 1.08]) L.box(sx1 - 0.03, y + h - 0.025, a, sx1 + 0.03, y + h + 0.025, b, 'metal', { collide: false, tint: 0x8a8a86 });
    L.box(sx1 - 0.02, y, a, sx1 + 0.02, y + 0.15, b, 'wood', { collide: false, tint: 0x7a6a4a });
  }
  // dangling torn rail
  P.pipe(L, sx1, y + 1.08, 13, sx1 + 0.4, y - 1.2, 13.6, 0.025, 'metal');
  edgeSign(L, 'RAIL OUT\nCLIP IN!', sx1 - 0.05, y + 1.4, 12.2, -Math.PI / 2);
  // tube frame (visual) from 96 to 118
  for (let z = 6; z <= 32; z += 2.2) for (const x of [TX1 + 0.3, sx1]) L.box(x - 0.03, 94, z - 0.03, x + 0.03, 118, z + 0.03, 'metal', { collide: false, tint: 0x8a8a86 });
  for (let yy = 96; yy <= 118; yy += 2) {
    if (Math.abs(yy - y) < 1.5 || Math.abs(yy - y2) < 0.3) continue;
    L.box(sx1 - 0.03, yy - 0.03, 6, sx1 + 0.03, yy + 0.03, 32, 'metal', { collide: false, tint: 0x8a8a86 });
  }
  for (const yy of [100, 104, 112, 116]) L.box(TX1 + 0.2, yy - 0.06, 6, sx1, yy, 32, 'wood', { collide: false, tint: 0x6a5a40 });
  for (let z = 7; z < 32; z += 4.4) P.pipe(L, sx1, 96, z, sx1, 104, z + 4.2, 0.02, 'metal');
  L.light(77.3, y + 2.6, 19, 0xffc080, 5, 8, { flicker: 0.5 });
  L.box(77.2, y + 2.7, 18.9, 77.4, y + 2.85, 19.1, 'emissiveWarm', { collide: false });
  L.reverb(TX1, y, 6, sx1 + 1, y + 6, 32, 'outdoor');
  L.trigger(TX1, y, 20, sx1, y + 3, 30, () => game.voice.script([{ who: 'louis', text: 'Oh no. No no no. Outside? On that?', d: 0.3 }, { who: 'bill', text: 'Don\'t look down. Hug the wall and move.', d: 2.6 }]));
  // ==================================================== NE ROOM + STAIR
  finish(L, 62, TZ0, TX1, 20, y, 'concreteFloor', 0x8a8a84);
  ceilingLight(L, 72, y2 - 0.3, 14, { type: 'cage', intensity: 7, range: 8, flicker: 0.4 });
  const st = stairwell(L, { x0: STAIR[0], z0: STAIR[1], x1: STAIR[2], z1: STAIR[3], y, entry: 's', first: 'w', ground: false, ceiling: false, topH: ROOFY - y2, wall: 'concreteDark', doors: false, labels: ['28', '29'] });
  drywallStack(L, 73, y, 17, Math.PI / 2 + 0.05); toolCart(L, 66, y, 17.8, 0.1);
  cableSpool(L, 74.5, y, 3.5, 0.45);
  P.crate(L, 63, y, 18.5, 0.2); P.crate(L, 63.2, y, 17.5, 0.5, 0.8);
  L.item('ammo', 70.5, y + 0.02, 18.5, {});
  L.item('medkit', 73, y + 0.36, 17, { chance: 0.6 });
  graffiti(L, 'UP TO 29\nSAFE ROOM', 62.12, y + 1.7, 12, Math.PI / 2, 1.6, 0.8, '#ff6a20');
  sign(L, 'STAIR 3 - TEMP', 65.5, y + 2.5, STAIR[3] + 0.17, 0, 1.4, 0.3, { bg: '#1a6a3a', fg: '#fff' });
  plastic.add(TX1 - 0.02, y2 + 0.1, 6.1, TX1 + 0.02, ROOFY, 9.9);
  L.reverb(62, y, TZ0, TX1, y2, 20, 'room');

  // ================================================================ 29F
  // mezzanine edge (z = 26) over the double-height south floor: rail with a gap
  guard(L, 62.2, 25.85, TX1, 26.05, y2); guard(L, TX0, 25.85, 40, 26.05, y2);
  L.box(40, y2, 25.85, 45.8, y2 + 1.1, 26.05, 'metal', { visible: false, flags: F_SOLID });
  for (let x = 40.5; x < 45.8; x += 1.4) L.box(x - 0.02, y2, 25.9, x + 0.02, y2 + 1.1, 26.0, 'metal', { collide: false });
  L.box(40, y2 + 1.05, 25.92, 45.8, y2 + 1.1, 25.98, 'metal', { collide: false });
  edgeSign(L, 'NO RAIL\nWATCH STEP', 49, y2 + 1.1, 24.18, 0);
  // north of the core: blocked by stacked materials (forces the ledge)
  L.wallZ(TZ0, CORE[1], 60.5, y2, ROOFY, 'plasterHosp', 0.16);
  plastic.add(62.3, y2, 12, 62.32, ROOFY, 19.8);
  // west side rooms: end safe room (site office) + roof access
  const sr = safeBox(L, { x0: 34, z0: 3, x1: 42, z1: 10.6, y: y2, h: 3.2, door: { wall: 'e', at: 8.6 }, end: true, wall: 'plasterHosp', floor: false, ceil: 'ceiling' });
  finish(L, 34, 3, 42, 10.6, y2, 'linoleumBlue');
  S.endDoor = sr.door;
  supplies(L, 36.2, y2, 3.7, Math.PI, ['medkit', 'medkit', 'medkit', 'medkit'], { w: 2.2 });
  supplies(L, 34.7, y2, 7.4, -Math.PI / 2, [{ type: 'tier2' }, 'ammo', { type: 'tier2' }], { w: 2.4 });
  L.item('pills', 40.6, y2 + 0.02, 3.6, { chance: 0.7 });
  P.bed(L, 39.5, y2, 5.2, Math.PI, 0x4a5a3a);
  graffiti(L, 'THE CHOPPER\nIS COMING', 38, y2 + 1.6, 10.5, Math.PI, 2.0, 0.8, '#b8201a');
  graffiti(L, 'ONE MORE\nFLIGHT UP', 34.12, y2 + 1.3, 8.5, Math.PI / 2, 1.8, 0.7, '#1a2a8a');
  graffiti(L, 'MERCY\nMY ASS', 41.87, y2 + 1.9, 4.5, -Math.PI / 2, 1.6, 0.7, '#202020');
  // roof access (continues in the next chapter) next to the safe room
  L.wallX(34, 42, 10.6 + 3.2, y2, ROOFY, 'concreteDark', 0.2, [{ a: 37.9, b: 39.1, y0: y2, y1: y2 + 2.2 }]);
  L.wallZ(10.6, 13.8, 34, y2, ROOFY, 'concreteDark', 0.2);
  L.wallZ(10.6, 13.8, 42, y2, ROOFY, 'concreteDark', 0.2);
  new Door(L, 38.5, y2, 13.8, 'x', { width: 1.1, locked: true, material: 'paintedGreen' });
  sign(L, 'ROOF ACCESS', 38.5, y2 + 2.55, 13.92, 0, 1.3, 0.3, { bg: '#1a6a3a', fg: '#fff' });
  // 29F dressing
  for (const [x, z, r] of [[66, 20, 0.2], [44, 14, 1.4], [50, 8, 0.1]]) drywallStack(L, x, y2, z, r, 8);
  cableSpool(L, 70, y2, 16.5, 0.5); cableSpool(L, 55, y2, 12, 0.45, 0.8);
  toolCart(L, 47.5, y2, 17.5, 0.9); sawhorse(L, 65.5, y2, 23, 1.5);
  concreteBags(L, 73.5, y2, 13, 0.1); rebar(L, 53, y2, 4.5, Math.PI / 2, 5);
  for (let x = 56.3; x < 60.5; x += 0.6) L.box(x - 0.04, y2, 14.97, x + 0.04, ROOFY, 15.03, 'metalClean', { collide: false, tint: 0xa0a4a4 });
  L.box(47.5, y2, 14.94, 56, ROOFY, 15.06, 'plasterHosp', { tint: 0xd8d8d0 });
  L.clip(56, y2, 14.95, 60.5, ROOFY, 15.05, F_SOLID | F_SIGHT);
  for (const [x0, z0, x1, z1] of [[68, 15.5, 76, 15.52], [40.5, 14.5, 40.52, 20]]) plastic.add(x0, y2 + 0.2, z0, x1, ROOFY, z1);
  physProp(L, 'propane', 72.8, y2, 24.5); physProp(L, 'gascan', 58.6, y2, 25.2);
  for (const [x, z, r] of [[70, 21, 1.1], [46, 23, 2.6]]) { P.corpse(L, x, y2 + 0.01, z, r, 0xd87a18); L.decal(x, y2 + 0.012, z, 0, 1, 0, 1.4, DF.POOL); }
  scatterBlood(L, 44, 12, 74, 25, y2, 5);
  L.item('pipebomb', 47.5, y2 + 0.9, 17.5, { chance: 0.6 });
  workLight(L, 70.5, y2, 19.5, 0.3, { intensity: 12, range: 12, flicker: 0.2 });
  workLight(L, 44.5, y2, 20, -0.8, { intensity: 12, range: 12 });
  ceilingLight(L, 54, ROOFY, 10, { type: 'cage', intensity: 6, range: 9, flicker: 0.6 });
  L.reverb(TX0, y2, TZ0, TX1, ROOFY, 26, 'room');
  L.trigger(42.5, y2, 3, 50, y2 + 3, 15, () => { game.voice.script('ch4Safe'); game.session.objective('Get inside the safe room and close the door'); });
  L.flowEnd = [38, y2, 6.8];

  // =============================================================== KILL + SKY
  L.killZone(-400, 20, -400, 500, 104, 500);
  L.killZone(-400, -120, -400, 500, -30, 500);
  plastic.build(L);

  // ============================================================ TOWER CRANE + CITY
  const C = new Collector(L), Cfar = new Collector(L);
  crane(C, 88, 14);
  city(L, C, Cfar);
  C.build(L);
  // the far skyline is fully fogged out from the lower floors: only draw it up here
  const far = Cfar.build(L);
  far.visible = false;
  L.dynamics.push({ update() { far.visible = game.camPos.y > 60; } });
  return { stair: st };
}

// Tower crane (visual): lattice mast from the podium roof, jib over the tower.
function crane(L, x, z) { // L: Collector (visual only)
  const b = 1.0, y0 = 16.2, top = 132;
  for (const [dx, dz] of [[-b, -b], [b, -b], [-b, b], [b, b]]) L.box(x + dx - 0.08, y0, z + dz - 0.08, x + dx + 0.08, top, z + dz + 0.08, 'paintedYellow', { collide: false, tint: 0xc8a020 });
  for (let yy = y0 + 2; yy < top; yy += 3) {
    L.box(x - b, yy, z - b - 0.05, x + b, yy + 0.08, z - b + 0.05, 'paintedYellow', { collide: false, tint: 0xc8a020 });
    L.box(x - b, yy, z + b - 0.05, x + b, yy + 0.08, z + b + 0.05, 'paintedYellow', { collide: false, tint: 0xc8a020 });
    L.box(x - b - 0.05, yy + 1.5, z - b, x - b + 0.05, yy + 1.58, z + b, 'paintedYellow', { collide: false, tint: 0xc8a020 });
    L.box(x + b - 0.05, yy + 1.5, z - b, x + b + 0.05, yy + 1.58, z + b, 'paintedYellow', { collide: false, tint: 0xc8a020 });
  }
  // cab, jib (over the tower to the west), counter-jib + weights
  L.box(x - 1.4, top, z - 1.4, x + 1.4, top + 2.6, z + 1.4, 'paintedWhite', { collide: false, tint: 0xd8d8c8 });
  L.box(x - 1.2, top + 0.9, z + 1.38, x + 1.2, top + 2.2, z + 1.42, 'glassDirty', { collide: false, tint: 0x3a4a50 });
  L.box(x - 58, top + 2.6, z - 0.8, x + 1.4, top + 3.4, z + 0.8, 'paintedYellow', { collide: false, tint: 0xc8a020 });
  L.box(x + 1.4, top + 2.6, z - 0.9, x + 18, top + 3.2, z + 0.9, 'paintedYellow', { collide: false, tint: 0xc8a020 });
  L.box(x + 13, top + 0.8, z - 1.2, x + 17.5, top + 2.6, z + 1.2, 'concrete', { collide: false, tint: 0x7a7a78 });
  L.box(x - 0.25, top + 3.4, z - 0.25, x + 0.25, top + 9, z + 0.25, 'paintedYellow', { collide: false, tint: 0xc8a020 });
  P.pipe(L, x, top + 9, z, x - 50, top + 3.4, z, 0.03, 'metalDark');
  P.pipe(L, x, top + 9, z, x + 17, top + 3.2, z, 0.03, 'metalDark');
  // hook line hanging over the tower
  P.pipe(L, x - 30, top + 2.6, z, x - 30, 124, z + 0.2, 0.02, 'metalDark');
  L.box(x - 30.4, 123, z - 0.2, x - 29.6, 124, z + 0.6, 'paintedYellow', { collide: false, tint: 0xc8a020 });
  L.box(x - 0.15, top + 9, z - 0.15, x + 0.15, top + 9.3, z + 0.15, 'emissiveRed', { collide: false });
  L.box(x - 58.15, top + 3.4, z - 0.15, x - 57.85, top + 3.7, z + 0.15, 'emissiveRed', { collide: false });
}

// Front plaza, streets and the burning city around Mercy Hospital. Plaza props
// go into the level (they collide); everything else into the collector C.
function city(Lv, C, Cfar) {
  const L = C;
  // ground (hole under the hospital podium)
  floorWithHoles(L, -260, -260, 360, 360, 0, 0.3, 'asphalt', [[0, 0, 96, 60]], { collide: false });
  // sidewalk ring + plaza in front of the hospital
  L.box(-8, 0, -8, 104, 0.15, 0, 'sidewalk', { collide: false });
  L.box(-8, 0, 0, 0, 0.15, 60, 'sidewalk', { collide: false });
  L.box(96, 0, 0, 104, 0.15, 60, 'sidewalk', { collide: false });
  L.box(-8, 0, 60, 104, 0.15, 104, 'sidewalk', { collide: false, tint: 0xb0aca4 });
  // fountain
  L.box(48, 0.15, 74, 60, 0.7, 86, 'concrete', { collide: false });
  L.box(49, 0.2, 75, 59, 0.6, 85, 'waterSurface', { collide: false });
  L.box(53.4, 0.7, 79.4, 54.6, 3.2, 80.6, 'concrete', { collide: false });
  // military quarantine camp on the plaza
  for (const [x, z, r] of [[28, 72, 0], [34, 82, 0.4], [72, 70, -0.3], [80, 84, 0.1]]) {
    const p = P.prop(Lv, x, 0.15, z, r);
    p.box(0, 1.3, 0, 5, 0.05, 7, 'fabric', 0x4a5a3a).box(-2.45, 0.65, 0, 0.05, 1.3, 7, 'fabric', 0x3a4a2e).box(2.45, 0.65, 0, 0.05, 1.3, 7, 'fabric', 0x3a4a2e);
    p.box(0, 1.9, 0, 0.1, 1.2, 7, 'fabric', 0x4a5a3a).box(-1.25, 1.6, 0, 2.6, 0.05, 7, 'fabric', 0x4a5a3a, [0, 0, 0.45]).box(1.25, 1.6, 0, 2.6, 0.05, 7, 'fabric', 0x4a5a3a, [0, 0, -0.45]);
  }
  P.truck(Lv, 20, 0.15, 90, 0.2, 0x3a4a2a); P.truck(Lv, 88, 0.15, 94, -0.3, 0x3a4a2a);
  P.van(Lv, 40, 0.15, 66, Math.PI / 2 + 0.2, 0xe8e8e0); P.van(Lv, 15, 0.15, 66.5, Math.PI / 2 - 0.1, 0xe8e8e0);
  P.car(Lv, 64, 0.15, 90, 0.8, { burnt: true }); P.car(Lv, 8, 0.15, 98, 2.2, { police: true });
  fireSource(Lv, 64, 1.0, 90, 1.4, { hazard: false });
  fireSource(Lv, 40, 1.6, 66, 1.0, { hazard: false });
  for (const x of [22, 44, 66, 86]) P.sandbags(Lv, x, 0.15, 62.2, 0, 5, 3);
  for (let i = 0; i < 10; i++) P.bodyBag(Lv, 26 + i * 1.1, 0.16, 96, 0.1);
  P.fenceChain(Lv, 2, 101, 100, 101, 0.15, 3);
  for (const [x, z] of [[10, 64], [96, 64], [26, 100], [80, 100]]) P.streetLight(Lv, x, 0.15, z, 0, { intensity: 22, range: 18, on: x !== 26 });
  // streets: avenue south, streets east / west / north
  for (const [x0, z0, x1, z1, ax] of [[-260, 104, 360, 124, 'x'], [104, -260, 124, 360, 'z'], [-28, -260, -8, 360, 'z'], [-260, -28, 360, -8, 'x']]) {
    if (ax === 'x') for (let x = x0 + 2; x < x1; x += 9) L.box(x, 0.003, (z0 + z1) / 2 - 0.08, x + 4, 0.015, (z0 + z1) / 2 + 0.08, 'paintedYellow', { collide: false, tint: 0xd0b030 });
    else for (let z = z0 + 2; z < z1; z += 9) L.box((x0 + x1) / 2 - 0.08, 0.003, z, (x0 + x1) / 2 + 0.08, 0.015, z + 4, 'paintedYellow', { collide: false, tint: 0xd0b030 });
    // street lamps as glowing dots
    if (ax === 'x') for (let x = x0 + 10; x < x1; x += 24) { L.box(x - 0.08, 0, z0 + 0.6, x + 0.08, 6.4, z0 + 0.76, 'metalDark', { collide: false }); L.box(x - 0.25, 6.2, z0 + 0.4, x + 0.25, 6.35, z0 + 1.2, rng() < 0.75 ? 'emissiveWarm' : 'blackMatte', { collide: false }); }
    else for (let z = z0 + 10; z < z1; z += 24) { L.box(x0 + 0.6, 0, z - 0.08, x0 + 0.76, 6.4, z + 0.08, 'metalDark', { collide: false }); L.box(x0 + 0.4, 6.2, z - 0.25, x0 + 1.2, 6.35, z + 0.25, rng() < 0.75 ? 'emissiveWarm' : 'blackMatte', { collide: false }); }
  }
  // wrecks on the avenue (some burning -> emissive glow only, far away)
  for (let i = 0; i < 16; i++) {
    const x = -120 + rng() * 360, z = 106 + rng() * 16, ax = rng() < 0.5;
    const hx = ax ? 2.2 : 0.9, hz = ax ? 0.9 : 2.2, burnt = rng() < 0.5;
    L.box(x - hx, 0.2, z - hz, x + hx, 1.0, z + hz, burnt ? 'rust' : 'carPaint', { collide: false, tint: burnt ? 0x3a3430 : pickr([0x7a1a14, 0x1a2a4a, 0x8a8a88, 0xc8c4b8]) });
    L.box(x - hx * 0.7, 1.0, z - hz * 0.55, x + hx * 0.7, 1.5, z + hz * 0.55, burnt ? 'blackMatte' : 'glassDirty', { collide: false, tint: 0x1a2024 });
    if (burnt && rng() < 0.6) L.box(x - 0.7, 1.0, z - 0.7, x + 0.7, 1.7 + rng(), z + 0.7, 'emissiveWarm', { collide: false, tint: 0xff5a18 });
  }
  // blocks: ring 1 (across the streets) and ring 2 (skyline)
  const blocks = [];
  for (let x = -250; x < 350; x += 38) {
    for (let z = -250; z < 350; z += 38) {
      const bx0 = x + 4, bz0 = z + 4, bx1 = x + 34 + rng() * 2, bz1 = z + 34 + rng() * 2;
      if (bx1 > -30 && bx0 < 126 && bz1 > -30 && bz0 < 126) continue; // hospital + streets
      const d = Math.hypot((bx0 + bx1) / 2 - 54, (bz0 + bz1) / 2 - 30);
      if (d > 300) continue;
      const tall = rng() < 0.18;
      const h = d < 120 ? 12 + rng() * (tall ? 70 : 38) : 20 + rng() * (tall ? 110 : 50);
      blocks.push([bx0, bz0, bx1, bz1, h, d]);
    }
  }
  for (const [bx0, bz0, bx1, bz1, h, d] of blocks) {
    const cx = (bx0 + bx1) / 2 - 54, cz = (bz0 + bz1) / 2 - 22;
    const faces = [];
    if (cz > 20) faces.push('n'); if (cz < -20) faces.push('s'); if (cx > 20) faces.push('w'); if (cx < -20) faces.push('e');
    cityBlock(d < 110 ? C : Cfar, bx0, bz0, bx1, bz1, h, { faces, lit: d < 150 ? 0.07 : 0.05, fire: rng() < 0.15 ? 0.05 : 0, roofFire: rng() < 0.1 });
  }
}
