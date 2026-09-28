// Dead Air 2 — after the crane: the printing works roof (skylights, a
// survivors' camp, the SKYLINE AIR billboard) and the Meridian Trust tower:
// L3 (open plan, glass conference rooms, copy room, break room) -> NE stair ->
// L2 with the power out (server room, a barricaded last stand) -> mezzanine and
// grand stair into the lobby -> the only unblocked way out is an alarmed
// emergency exit onto Commerce Street.
import * as THREE from 'three';
import { ceilingLight, wallLamp, sign, graffiti, poster, posterWall, wallMessages, supplies, fireSource, burningBarrel, physProp, P, floorWithHoles, railSegment } from './kit.js';
import { Door } from '../world/dynamic.js';
import { F_SOLID, F_SHOOT, F_DEFAULT } from '../world/collision.js';
import { DF } from '../render/decals.js';
import { cubicle, officeDesk, seatRow, wallTV } from './ch4_parts.js';
import { tent } from './ch3_props.js';
import { crt, shelving } from './ch2_parts.js';
import { VisualBatch } from './da_parts.js';
import { rng, copier, serverRack, whiteboard, waterCooler, confTable, cardboard, rotXZ } from './da2_parts.js';
import { LR, OL1, OL2, OL3, LB, OT, STREET } from './da2_layout.js';
import { CBS_BRIDGE_Z1 } from './da2_craneEvent.js';

const NC = { collide: false };
const blood = (L, x, y, z, s = 1.2, k = 0) => L.decal(x, y + 0.012, z, 0, 1, 0, s, [DF.BLOOD1, DF.BLOOD2, DF.BLOOD3, DF.BLOOD4, DF.POOL, DF.SMEAR, DF.SPLAT_BIG][k % 7]);

// ======================================================= PRINTING WORKS ROOF
function printingWorks(L, game) {
  const { x0, z0, x1, z1 } = LB;
  const y = LR, PH = 0.9;
  L.box(x0, 0, z0, x1, y, z1, 'brickDark', { tint: 0x6a4a3e });
  L.box(x0 + 0.3, y - 0.01, z0 + 0.3, x1, y + 0.004, z1 - 0.3, 'roof', { collide: false, tint: 0x5a5854 });
  // parapets (north has the plank gap; east is the office tower's glass wall)
  const par = (a, b, c, d) => { L.box(a, y, b, c, y + PH, d, 'brickDark', { tint: 0x6a4a3e }); L.box(a - 0.03, y + PH, b - 0.03, c + 0.03, y + PH + 0.08, d + 0.03, 'concrete', { collide: false, tint: 0x8a867e }); L.clip(a, y + PH, b, c, y + 2.6, d, F_SOLID); };
  par(x0, z0, 19.8, z0 + 0.35); par(21.6, z0, x1, z0 + 0.35);
  par(x0, z1 - 0.35, x1, z1); par(x0, z0 + 0.35, x0 + 0.35, z1 - 0.35);
  // facade: tall factory windows, painted ghost sign on the north wall
  for (let x = x0 + 2.5; x < x1 - 2; x += 4) for (const yy of [1.6, 5.0]) { L.box(x - 1.2, yy, z0 - 0.02, x + 1.2, yy + 2.4, z0, 'glassDirty', { collide: false, tint: 0x1c2428 }); L.box(x - 1.3, yy - 0.12, z0 - 0.1, x + 1.3, yy, z0, 'concrete', { collide: false }); }
  sign(L, 'KESSLER & SONS · FINE PRINTING · EST. 1921', 36, 7.3, z0 - 0.04, 0, 14, 1.0, { fg: '#c8b890', font: 'Georgia, serif' });
  for (let z = z0 + 3; z < z1 - 2; z += 4) L.box(x0 - 0.02, 3.2, z - 1.2, x0, 6.6, z + 1.2, 'glassDirty', { collide: false, tint: 0x1c2428 });
  // sawtooth skylights (3 rows), solid
  for (const [xa, xb, zc] of [[24, 40, 67], [24, 40, 73], [42, 54, 79.5]]) {
    L.box(xa, y, zc - 1.2, xb, y + 0.5, zc + 1.2, 'metalDark', { tint: 0x4a4a48 });
    const g = P.prop(L, (xa + xb) / 2, y + 0.5, zc, 0);
    g.box(0, 0.55, -0.35, xb - xa, 1.2, 0.08, 'glassDirty', 0x5a7078, [0.55, 0, 0]).box(0, 0.4, 0.55, xb - xa, 0.8, 1.2, 'metal', 0x6a6a64, [-0.25, 0, 0]);
    for (let x = xa + 1; x < xb; x += 2) g.box(x - (xa + xb) / 2, 0.55, -0.35, 0.05, 1.25, 0.12, 'metalDark', null, [0.55, 0, 0]);
    L.clip(xa, y, zc - 1.2, xb, y + 1.7, zc + 1.2, F_DEFAULT);
  }
  // SKYLINE AIR billboard (lit by its own lamps) facing the construction deck
  const bx = 22, bz = 81;
  for (const x of [bx - 5, bx + 5]) { L.box(x - 0.15, y, bz - 0.15, x + 0.15, y + 5.6, bz + 0.15, 'metalDark'); P.pipe(L, x, y + 2.5, bz, x, y, bz + 2.2, 0.06, 'metalDark'); }
  L.box(bx - 6.4, y + 5.4, bz - 0.05, bx + 6.4, y + 10.2, bz + 0.3, 'metal', { tint: 0x2a2a2a });
  sign(L, 'FLY NEWBURG\nSKYLINE AIR · DAILY TO 40 CITIES', bx, y + 7.8, bz - 0.07, 0, 12.4, 4.4, { bg: '#123a6a', fg: '#f4e8c8', font: 'Arial Black, Impact, sans-serif' });
  L.box(bx - 6.2, y + 5.2, bz - 1.2, bx + 6.2, y + 5.3, bz - 0.9, 'metalDark', NC);
  for (const x of [bx - 4, bx, bx + 4]) { L.box(x - 0.2, y + 5.1, bz - 1.4, x + 0.2, y + 5.35, bz - 1.1, 'emissiveWarm', NC); }
  L.light(bx - 3, y + 6.0, bz - 2.2, 0xffe0b0, 9, 10, { flicker: 0.08 });
  L.light(bx + 3, y + 6.0, bz - 2.2, 0xffe0b0, 9, 10, { flicker: 0.3 });
  L.box(bx - 6.2, y, bz - 1.4, bx + 6.2, y + 0.05, bz - 1.1, 'diamond', NC);
  // survivors' camp: tarp tents, barrel fire, HELP painted on the roof
  tent(L, 30.5, y, 81.5, 0.1, 3.4, 2.6, {});
  burningBarrel(L, 34.2, y, 79.2);
  for (const [x, z, r] of [[33.2, 81.6, 0.2], [35.6, 80.8, 1.8]]) { const sb = P.prop(L, x, y, z, r); sb.box(0, 0.08, 0, 0.8, 0.16, 2.0, 'fabric', rng.pick([0x3a5a3a, 0x5a2a2a, 0x2a3a5a])); }
  for (let i = 0; i < 5; i++) { const j = P.prop(L, 28.4 + i * 0.35, y, 83.6, 0); j.cyl(0, 0.2, 0, 0.13, 0.4, 'plastic', 0x6a9ac8, null, 8); }
  const letters = { H: [[0, 0, 0.5, 3], [2, 0, 2.5, 3], [0.5, 1.25, 2, 1.75]], E: [[0, 0, 0.5, 3], [0.5, 0, 2.2, 0.5], [0.5, 1.25, 1.8, 1.75], [0.5, 2.5, 2.2, 3]], L: [[0, 0, 0.5, 3], [0.5, 2.5, 2.2, 3]], P: [[0, 0, 0.5, 3], [0.5, 0, 2.2, 0.5], [2.2, 0, 2.6, 1.6], [0.5, 1.2, 2.2, 1.6]] };
  let lx = 38.2;
  for (const ch of 'HELP') { for (const [a, b, c, d] of letters[ch]) L.box(lx + a, y + 0.004, 68.6 + b, lx + c, y + 0.012, 68.6 + d, 'paintedWhite', { collide: false, tint: 0xe8e8e0 }); lx += 3.2; }
  // rooftop plant + water tank + hatch
  P.waterTower(L, 50.5, y, 67.5);
  for (const [x, z] of [[17.5, 70], [17.5, 74.5], [54.6, 84.2]]) P.acUnit(L, x, y, z, Math.PI / 2);
  const hatch = P.prop(L, 46, y, 84.4, 0); hatch.box(0, 0.4, 0, 1.6, 0.8, 1.6, 'metal', 0x6a6a64).box(0, 0.82, 0, 1.7, 0.06, 1.7, 'metalDark').col(0, 0.42, 0, 1.6, 0.84, 1.6, 'metal');
  P.antenna(L, 15.6, y, 84.6, 7);
  // story + loot
  P.corpse(L, 31.8, y + 0.01, 79.6, 0.6, 0x5a5a3a); blood(L, 31.8, y, 79.6, 1.6, 4);
  P.corpse(L, 44.8, y + 0.01, 72.4, 2.2, 0x2a2a3a);
  for (let i = 0; i < 6; i++) blood(L, 22 + rng() * 34, y, 62 + rng() * 22, 0.8 + rng(), i);
  graffiti(L, 'MERIDIAN\nTOWER →\nTHRU THE\nGLASS', 57.55, y + 1.6, 66.2, Math.PI / 2, 1.6, 1.0, '#d8d8c8');
  L.item('health', 30.6, y + 0.02, 82.2, { chance: 0.65 });
  L.item('tier2', 29.4, y + 0.02, 81.0, { chance: 0.45 });
  L.item('ammo', 35.8, y + 0.02, 82.4, { chance: 0.8 });
  L.item('pipebomb', 28.6, y + 0.02, 83.2, { chance: 0.4 });
  L.reverb(x0, y, z0, x1, y + 15, z1, 'outdoor');
  L.ambience(x0, y - 0.5, z0, x1, y + 20, z1, 'rooftop');
  L.witchSpots.push({ x: 31.2, y, z: 81.9 });
}

// ============================================================ OFFICE TOWER
const TX0 = OT.x0, TX1 = OT.x1, TZ0 = OT.z0, TZ1 = OT.z1;
const ST = { x0: 85.2, x1: TX1 - 0.3, z0: TZ0 + 0.3, z1: 63.4 }; // NE stair (L2 <-> L3)
const ATR = [TX0 + 0.3, 84, 72, TZ1 - 0.3];                     // atrium hole in the L2 slab
const CORE = [72, 68, 80, 80];

// glass curtain wall along X (z fixed) with sill / mullions; gaps = [[a,b],...] for openings
function curtainX(L, x0, x1, z, y, h, o = {}) {
  const sill = o.sill ?? 0.6;
  const gaps = o.gaps || [];
  const inGap = (a, b) => gaps.some(([g0, g1]) => a < g1 && b > g0);
  L.box(x0, y - 0.4, z - 0.15, x1, y + sill, z + 0.15, 'concreteDark', { tint: 0x4a4e52, ...(gaps.length ? { collide: false } : {}) });
  if (gaps.length) { let c = x0; for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (g0 > c) L.clip(c, y - 0.4, z - 0.15, g0, y + sill, z + 0.15, F_DEFAULT); c = g1; } if (c < x1) L.clip(c, y - 0.4, z - 0.15, x1, y + sill, z + 0.15, F_DEFAULT); }
  const n = Math.max(1, Math.round((x1 - x0) / 1.6));
  for (let i = 0; i < n; i++) {
    const a = x0 + (x1 - x0) * i / n, b = x0 + (x1 - x0) * (i + 1) / n;
    L.box(a - 0.04, y + sill, z - 0.1, a + 0.04, y + h, z + 0.1, 'metalDark', NC);
    if (inGap(a, b)) continue;
    L.box(a + 0.04, y + sill, z - 0.025, b - 0.04, y + h, z + 0.025, 'glassDirty', { flags: F_SOLID | F_SHOOT, tint: o.tint ?? 0x3a4a58 });
  }
  L.box(x0, y + h - 0.05, z - 0.12, x1, y + h + 0.4, z + 0.12, 'metalDark', { tint: 0x2a2e32 });
}
function curtainZ(L, z0, z1, x, y, h, o = {}) {
  const sill = o.sill ?? 0.6;
  const gaps = o.gaps || [];
  const inGap = (a, b) => gaps.some(([g0, g1]) => a < g1 && b > g0);
  if (!gaps.length) L.box(x - 0.15, y - 0.4, z0, x + 0.15, y + sill, z1, 'concreteDark', { tint: 0x4a4e52 });
  else {
    L.box(x - 0.15, y - 0.4, z0, x + 0.15, y + (o.gapSill ?? 0), z1, 'concreteDark', { tint: 0x4a4e52 });
    let c = z0; for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (g0 > c) L.box(x - 0.15, y + (o.gapSill ?? 0), c, x + 0.15, y + sill, g0, 'concreteDark', { tint: 0x4a4e52 }); c = g1; } if (c < z1) L.box(x - 0.15, y + (o.gapSill ?? 0), c, x + 0.15, y + sill, z1, 'concreteDark', { tint: 0x4a4e52 });
  }
  const n = Math.max(1, Math.round((z1 - z0) / 1.6));
  for (let i = 0; i < n; i++) {
    const a = z0 + (z1 - z0) * i / n, b = z0 + (z1 - z0) * (i + 1) / n;
    L.box(x - 0.1, y + sill, a - 0.04, x + 0.1, y + h, a + 0.04, 'metalDark', NC);
    if (inGap(a, b)) continue;
    L.box(x - 0.025, y + sill, a + 0.04, x + 0.025, y + h, b - 0.04, 'glassDirty', { flags: F_SOLID | F_SHOOT, tint: o.tint ?? 0x3a4a58 });
  }
  L.box(x - 0.12, y + h - 0.05, z0, x + 0.12, y + h + 0.4, z1, 'metalDark', { tint: 0x2a2e32 });
}
// interior glass partition along X with optional door openings
function glassPartX(L, x0, x1, z, y, h, doors = []) {
  let c = x0;
  for (const [a, b] of doors.concat([[x1, x1]]).sort((p, q) => p[0] - q[0])) {
    if (a > c + 0.05) {
      L.box(c, y, z - 0.03, a, y + h, z + 0.03, 'glass', { flags: F_SOLID | F_SHOOT, tint: 0x9ab8c0 });
      for (let x = c; x <= a + 0.01; x += Math.max(0.6, (a - c) / Math.max(1, Math.round((a - c) / 1.5)))) L.box(x - 0.03, y, z - 0.05, x + 0.03, y + h, z + 0.05, 'metalClean', NC);
      L.box(c, y + 1.0, z - 0.035, a, y + 1.12, z + 0.035, 'paintedWhite', { collide: false, tint: 0xd8d8d0 });
    }
    c = b;
  }
  L.box(x0, y + h, z - 0.06, x1, y + h + 0.1, z + 0.06, 'metalClean', NC);
}
// switchback stair shaft, entry wall on the south (z1), lower door west half, upper door east half
function officeStair(L, game, s, yLow, yHigh) {
  const { x0, x1, z0, z1 } = s;
  const xm = (x0 + x1) / 2, ym = (yLow + yHigh) / 2, LD = 1.8;
  L.stairs(x0, z0 + LD, xm - 0.07, z1 - LD, yLow, ym, '-z', 'concrete');
  L.box(x0, ym - 0.3, z0, x1, ym, z0 + LD, 'concrete');
  L.box(xm + 0.07, yLow, z0 + LD, x1, ym - 0.42, z1 - LD, 'concreteDark');
  L.stairs(xm + 0.07, z0 + LD, x1, z1 - LD, ym, yHigh, '+z', 'concrete', { thin: true });
  L.box(xm + 0.07, yHigh - 0.3, z1 - LD, x1, yHigh, z1, 'concrete');
  L.box(xm - 0.07, yLow, z0 + LD, xm + 0.07, yHigh + 1.05, z1 - LD, 'concreteDark');
  L.box(xm - 0.05, yHigh, z1 - LD, xm + 0.05, yHigh + 1.05, z1, 'metalDark', { flags: F_SOLID | F_SHOOT });
  L.box(xm - 0.06, yHigh + 1.0, z1 - LD, xm + 0.06, yHigh + 1.06, z1, 'paintedYellow', NC);
  const top = yHigh + 3.5;
  L.wallX(x0 - 0.1, x1 + 0.1, z1 + 0.1, yLow, top, 'concreteDark', 0.2, [{ a: (x0 + xm) / 2 - 0.55, b: (x0 + xm) / 2 + 0.55, y0: yLow, y1: yLow + 2.2 }, { a: (xm + x1) / 2 - 0.55, b: (xm + x1) / 2 + 0.55, y0: yHigh, y1: yHigh + 2.2 }]);
  L.wallZ(z0, z1, x0 - 0.1, yLow, top, 'concreteDark', 0.2, []);
  ceilingLight(L, xm, top, z0 + 0.9, { type: 'cage', intensity: 5, flicker: 0.5 });
  ceilingLight(L, (xm + x1) / 2, top, z1 - 0.9, { type: 'cage', intensity: 4, flicker: 0.7 });
  sign(L, 'L2', (x0 + xm) / 2, yLow + 2.5, z1 - 0.02, 0, 0.45, 0.35, { bg: '#1a3a6a', fg: '#fff' });
  sign(L, 'L3', (xm + x1) / 2, yHigh + 2.5, z1 - 0.02, 0, 0.45, 0.35, { bg: '#1a3a6a', fg: '#fff' });
  graffiti(L, 'SERVER\nROOM\nIS COLD\nTHEY LIKE\nIT', x0 + 0.03, ym + 1.4, (z0 + z1) / 2, Math.PI / 2, 1.2, 1.1, '#b8201a');
  L.reverb(x0, yLow, z0, x1, top, z1, 'stairwell');
  const low = new Door(L, (x0 + xm) / 2, yLow, z1 + 0.1, 'x', { width: 1.1, hinge: 1, material: 'paintedGreen' });
  const high = new Door(L, (xm + x1) / 2, yHigh, z1 + 0.1, 'x', { width: 1.1, hinge: -1, material: 'paintedGreen', open: true });
  return { low, high, top };
}

function towerShell(L, game) {
  // floors
  L.box(TX0, 0, TZ0, TX1, OL1, TZ1, 'concreteFloor');
  floorWithHoles(L, TX0, TZ0, TX1, TZ1, OL2, 0.4, 'concrete', [ATR]);
  floorWithHoles(L, TX0, TZ0, TX1, TZ1, OL3, 0.4, 'concrete', [[ST.x0, ST.z0, ST.x1, ST.z1 + 0.2]]);
  floorWithHoles(L, TX0, TZ0, TX1, TZ1, OL3 + 4.0, 0.4, 'concrete', []);
  // upper tower body with a curtain wall skin (visual) and crown
  const TOP = 60.6;
  L.box(TX0 + 0.3, OL3 + 4.0, TZ0 + 0.3, TX1 - 0.3, TOP, TZ1 - 0.3, 'concreteDark', { tint: 0x3a3e44 });
  const B = new VisualBatch(L);
  for (let yy = OL3 + 4.0; yy < TOP - 0.5; yy += 4) {
    for (const [a, b, fixed, ax, sgn] of [[TX0, TX1, TZ0, 'x', -1], [TX0, TX1, TZ1, 'x', 1], [TZ0, TZ1, TX0, 'z', -1], [TZ0, TZ1, TX1, 'z', 1]]) {
      if (ax === 'x') B.box(a, yy - 0.4, fixed + sgn * 0.25, b, yy + 0.5, fixed + sgn * 0.32, 'metalDark', { tint: 0x2a2e32 });
      else B.box(fixed + sgn * 0.25, yy - 0.4, a, fixed + sgn * 0.32, yy + 0.5, b, 'metalDark', { tint: 0x2a2e32 });
      for (let c = a + 0.8; c < b - 0.4; c += 1.6) {
        const lit = rng() < 0.05, dark = rng() < 0.2;
        const m = lit ? 'emissiveWindow' : 'glassDirty', t = lit ? rng.pick([0xffc890, 0xa8c0ff]) : dark ? 0x0a0e12 : 0x2a3a4a;
        if (ax === 'x') B.box(c - 0.76, yy + 0.5, fixed + sgn * 0.26, c + 0.76, yy + 3.6, fixed + sgn * 0.3, m, { tint: t });
        else B.box(fixed + sgn * 0.26, yy + 0.5, c - 0.76, fixed + sgn * 0.3, yy + 3.6, c + 0.76, m, { tint: t });
      }
    }
  }
  B.box(TX0 - 0.2, TOP, TZ0 - 0.2, TX1 + 0.2, TOP + 3.2, TZ1 + 0.2, 'metalDark', { tint: 0x1a1e22 });
  for (const [x, z] of [[TX0, TZ0], [TX1, TZ0], [TX0, TZ1], [TX1, TZ1]]) B.box(x - 0.3, TOP + 3.2, z - 0.3, x + 0.3, TOP + 3.6, z + 0.3, 'emissiveRed');
  B.build(L);
  sign(L, 'MERIDIAN TRUST', (TX0 + TX1) / 2, TOP + 1.6, TZ1 + 0.25, 0, 22, 2.6, { fg: '#e8f0ff', glow: 1.4, light: false });
  sign(L, 'MERIDIAN TRUST', TX0 - 0.25, TOP + 1.6, (TZ0 + TZ1) / 2, Math.PI / 2, 22, 2.6, { fg: '#e8f0ff', glow: 1.4, light: false });
  // curtain walls L1..L3
  const hL = 3.9;
  // L3: west wall has the smashed entry panel (floor level)
  curtainZ(L, TZ0, TZ1, TX0, OL3, hL, { gaps: [[70.2, 72.5]], gapSill: 0 });
  curtainZ(L, TZ0, TZ1, TX1, OL3, hL);
  curtainX(L, TX0, TX1, TZ0, OL3, hL);
  curtainX(L, TX0, TX1, TZ1, OL3, hL);
  // L2
  L.box(TX0 - 0.15, OL2 - 0.4, TZ0, TX0 + 0.15, OL3 - 0.4, LB_Z1_GUARD, 'concreteDark', { tint: 0x4a4e52 });
  curtainZ(L, LB_Z1_GUARD, TZ1, TX0, OL2, hL);
  curtainZ(L, TZ0, TZ1, TX1, OL2, hL);
  curtainX(L, TX0, TX1, TZ0, OL2, hL);
  curtainX(L, TX0, TX1, TZ1, OL2, hL, { tint: 0x2a3440 });
  // L1: lobby glazing on the south with the (barricaded) main doors + the emergency exit
  curtainX(L, TX0, 84.4, TZ1, OL1, 4.2, { sill: 0.05, tint: 0x3a4a58 });
  curtainX(L, 85.6, TX1, TZ1, OL1, 4.2, { sill: 0.05, tint: 0x3a4a58 });
  L.box(84.4, OL1 + 2.25, TZ1 - 0.15, 85.6, OL1 + 4.6, TZ1 + 0.15, 'concreteDark', { tint: 0x4a4e52 });
  curtainZ(L, 80, TZ1, TX1, OL1, 4.2, { sill: 0.3 });
  curtainZ(L, 86, TZ1, TX0, OL1, 4.2, { sill: 0.3 });
  L.box(TX0 - 0.15, 0, TZ0, TX0 + 0.15, OL2, 86, 'concreteDark', { tint: 0x4a4e52 });
  L.box(TX1 - 0.15, 0, TZ0, TX1 + 0.15, OL2, 80, 'concreteDark', { tint: 0x4a4e52 });
  L.box(TX0, 0, TZ0 - 0.15, TX1, OL2, TZ0 + 0.15, 'concreteDark', { tint: 0x4a4e52 });
  // entry: smashed panel with glass on the floor
  for (let i = 0; i < 10; i++) { const p = P.prop(L, TX0 + 0.3 + rng() * 1.6, OL3 + 0.01, 70.4 + rng() * 2, rng() * 6); p.box(0, 0, 0, 0.1 + rng() * 0.12, 0.004, 0.08 + rng() * 0.14, 'glass', 0xc8e0e8); }
  // tower address / plaza signage facing the street
  sign(L, '400 COMMERCE ST · MERIDIAN TRUST', 66, 4.55, TZ1 + 0.2, 0, 7, 0.45, { fg: '#e8e0c8', font: 'Georgia, serif' });
}
const LB_Z1_GUARD = 86; // printing works abuts the tower's west face up to here

function levelThree(L, game) {
  const y = OL3, H = 3.6;
  L.box(TX0 + 0.2, y - 0.01, TZ0 + 0.2, ST.x0 - 0.1, y + 0.005, TZ1 - 0.2, 'carpetGray', { collide: false, tint: 0x4a4e56 });
  L.box(ST.x0 - 0.1, y - 0.01, ST.z1 + 0.2, TX1 - 0.2, y + 0.005, TZ1 - 0.2, 'carpetGray', { collide: false, tint: 0x4a4e56 });
  L.box(TX0 + 0.2, y + H, TZ0 + 0.2, TX1 - 0.2, y + H + 0.02, TZ1 - 0.2, 'ceiling', NC);
  // core: elevators (west face), restrooms (east face)
  L.box(CORE[0], y, CORE[1], CORE[2], y + H, CORE[3], 'concrete', { tint: 0x8a8680 });
  for (const z of [70, 74, 78]) { L.box(CORE[0] - 0.03, y, z - 0.8, CORE[0], y + 2.3, z + 0.8, 'metalClean', { collide: false, tint: 0xa8a49a }); L.box(CORE[0] - 0.035, y, z - 0.005, CORE[0] - 0.03, y + 2.3, z + 0.005, 'blackMatte', NC); }
  sign(L, 'ELEVATORS OUT OF SERVICE\nUSE STAIRS', CORE[0] - 0.04, y + 2.6, 74, Math.PI / 2, 1.6, 0.35, { bg: '#e8c020', fg: '#101010' });
  for (const [z, t] of [[71, 'WOMEN'], [77, 'MEN']]) { L.box(CORE[2], y, z - 0.5, CORE[2] + 0.04, y + 2.1, z + 0.5, 'woodDark', { collide: false, tint: 0x6a5a48 }); sign(L, t, CORE[2] + 0.05, y + 2.3, z, Math.PI / 2, 0.6, 0.18, { bg: '#1a1a1a', fg: '#fff' }); }
  // conference rooms along the north (glass fronts at z 63.5)
  glassPartX(L, TX0 + 0.3, ST.x0 - 0.1, 63.5, y, H - 0.4, [[63.2, 64.4], [71.2, 72.4]]);
  L.box(TX0 + 0.3, y + H - 0.3, 63.4, ST.x0 - 0.1, y + H, 63.6, 'ceiling', NC);
  for (const x of [66, 74, 82]) L.box(x - 0.08, y, TZ0 + 0.3, x + 0.08, y + H, 63.4, 'plaster', { tint: 0xd8d4c8 });
  confTable(L, 62, y, 59.8, 0, 4.4); whiteboard(L, 62, y, TZ0 + 0.32, 0, 'EVAC PLAN (?)\n1. ROOF — NO HELI\n2. AIRPORT — PLANES\nSTILL FLYING!! \n3. ??? ', { fg: '#1a2a8a' });
  confTable(L, 70, y, 59.8, 0, 4.4); wallTV(L, 70, y + 1.8, TZ0 + 0.35, 0, true);
  sign(L, 'Q3 RESULTS\n▲ 12%', 70, y + 1.8, TZ0 + 0.39, 0, 0.8, 0.46, { bg: '#1a3a6a', fg: '#e8f0ff' });
  P.corpse(L, 69.2, y + 0.01, 61.4, 0.7, 0x2a2a3a); blood(L, 69.2, y, 61.4, 2.0, 4);
  // conf C (closed, barricaded from inside) + copy room
  confTable(L, 78, y, 59.8, Math.PI / 2 + 0.3, 3.4, false);
  for (let i = 0; i < 6; i++) P.officeChair(L, 76.2 + (i % 3) * 1.4, y, 62.4 + Math.floor(i / 3) * 0.5, rng() * 6);
  graffiti(L, 'NOT\nIN HERE', 78, y + 1.6, 63.46, 0, 1.2, 0.6, '#b8201a');
  copier(L, 83.6, y, 57.2, Math.PI);
  copier(L, 83.6, y, 59.4, Math.PI / 2);
  shelving(L, 83.6, y, 62.6, Math.PI, 2.2, 2.0, 0.9);
  sign(L, 'COPY ROOM', 83.6, y + 2.65, 63.46, 0, 1.0, 0.25, { bg: '#1a2a3a', fg: '#e8e8e0' });
  sign(L, 'PC LOAD LETTER', 83.2, y + 1.3, 57.6, 0, 0.6, 0.15, { bg: '#1a3a1a', fg: '#7aff7a' });
  L.box(82.2, y, 63.4, 82.3, y + H, 63.6, 'plaster', NC);
  P.papers(L, 83.4, y + 0.01, 60.6, 1.2, 14);
  L.item('pipebomb', 84.6, y + 0.9, 62.6, { chance: 0.5 });
  // main aisle (z 64..66) stays clear; cubicles west + east
  for (let x = 60.2; x < 70.5; x += 2.6) for (const z of [67.5, 70.5, 75.5, 78.5, 83.5]) if (!(x < 62 && z < 74)) cubicle(L, x, y, z, (z === 70.5 || z === 78.5) ? Math.PI : 0, rng.pick([0x5a6470, 0x4a5a4a, 0x6a5a4a]));
  for (let x = 82.6; x < 91; x += 2.6) for (const z of [68.6, 71.6, 76.6, 79.6]) cubicle(L, x, y, z, (z === 71.6 || z === 79.6) ? Math.PI : 0, rng.pick([0x5a6470, 0x4a5a4a]));
  // south: executive offices behind glass + break room
  glassPartX(L, TX0 + 0.3, 84, 88, y, H - 0.4, [[64, 65.1], [79, 80.1]]);
  for (const x of [66, 72, 78]) L.box(x - 0.08, y, 88.1, x + 0.08, y + H, TZ1 - 0.3, 'plaster', { tint: 0xd8d4c8 });
  for (const [x0, x1] of [[TX0 + 0.3, 66], [66, 72], [72, 78], [78, 84]]) { officeDesk(L, (x0 + x1) / 2, y, 93.6, Math.PI, {}); P.bookshelf(L, x1 - 0.4, y, 91.2, -Math.PI / 2); }
  L.box(84, y, 86, 84.16, y + H, TZ1 - 0.3, 'plaster', { tint: 0xd8d4c8 });
  L.wallX(84, TX1 - 0.3, 86, y, y + H, 'plaster', 0.16, [{ a: 85.2, b: 86.4, y0: y, y1: y + 2.2 }], { tint: 0xd8d4c8 });
  P.counter(L, 88.4, y, TZ1 - 0.65, Math.PI, 5.2, 'marble');
  P.fridge(L, 91.2, y, 91.4, -Math.PI / 2);
  P.vending(L, 91.2, y, 88.4, -Math.PI / 2, 0xb02a1a);
  P.table(L, 88, y, 90.4, 0.2, 1.4, 0.9, 'woodPale');
  P.chair(L, 87.2, y, 90.2, 1.6); P.chair(L, 88.9, y, 91.1, 4.2, 'woodDark', true);
  const cm = P.prop(L, 86.8, y + 0.92, TZ1 - 0.6, 0); cm.box(0, 0.2, 0, 0.3, 0.4, 0.3, 'plastic', 0x1a1a1a).cyl(0, 0.08, -0.05, 0.08, 0.16, 'glass', 0x3a2a1a);
  sign(L, 'BREAK ROOM', 85.8, y + 2.4, 85.9, 0, 1.0, 0.25, { bg: '#1a2a3a', fg: '#e8e8e0' });
  wallMessages(L, TX1 - 0.33, y + 1.6, 90.6, -Math.PI / 2, 1.8, 1.1, { lines: ['WHO TOOK MY YOGURT', 'EVAC FLIGHTS FROM METRO INTL', 'MEET AT GATE C — K', 'COFFEE MACHINE STILL WORKS'], density: 0.7 });
  poster(L, 'health', 84.3, y + 1.6, 91.5, Math.PI / 2, 0.55, 0.8, {});
  L.item('pills', 88.2, y + 0.94, TZ1 - 0.6, { chance: 0.6 });
  L.item('health', 88, y + 0.78, 90.4, { chance: 0.4 });
  // dressing & story
  waterCooler(L, 71.4, y, 65.2);
  for (const [x, z] of [[58.9, 64.6], [71.2, 85.8], [80.8, 65.2], [91.0, 84.8]]) P.planter(L, x, y, z, 0.4);
  P.papers(L, 66, y + 0.01, 72, 5, 30); P.papers(L, 86, y + 0.01, 74, 4, 20);
  P.corpse(L, 64.4, y + 0.01, 65.1, 1.4, 0x3a3a52); blood(L, 64.4, y, 65.1, 1.8, 4);
  P.corpse(L, 84.3, y + 0.01, 66.8, 2.6, 0x2a3a4a); blood(L, 84.3, y, 66.8, 1.6, 6);
  for (let i = 0; i < 10; i++) blood(L, TX0 + 1 + rng() * 32, y, 64 + rng() * 30, 0.6 + rng(), i);
  for (let i = 0; i < 5; i++) L.decal(60 + i * 4.8 + rng(), y + 0.013, 64.8 + (rng() - 0.5) * 0.6, 0, 1, 0, 0.8, DF.SMEAR);
  graffiti(L, 'STAIRS\nNE CORNER →', CORE[0] - 0.04, y + 1.4, 69.0, -Math.PI / 2, 1.3, 0.6, '#d8d8c8');
  sign(L, 'STAIR B →', 80.8, y + 2.6, 63.35, 0, 0.9, 0.22, { bg: '#1a6a2a', fg: '#fff', glow: 1, lightColor: 0x40ff60, lightIntensity: 1.5 });
  L.item('ammo', 60.6, y + 0.78, 67.6, { chance: 0.5 });
  L.item('tier1', 90.2, y + 0.78, 68.6, { chance: 0.4 });
  // lights (half the floor is out)
  for (const [x, z, on, f] of [[61, 65, true, 0.3], [67, 65, false], [73, 65, true, 0.6], [79, 65, true, 0.1], [86, 65, true, 0.4], [64, 76, true, 0.7], [66, 84, false], [86, 76, false], [88, 90, true, 0.5], [60.5, 60, true, 0.2]]) ceilingLight(L, x, y + H, z, { type: 'fluoro', intensity: 9, flicker: f ?? 0, on });
  L.reverb(TX0, y, TZ0, TX1, y + H, TZ1, 'room');
  L.ambience(TX0, y, TZ0, TX1, y + H, TZ1, 'hospital');
}

function levelTwo(L, game, stair) {
  const y = OL2, H = 3.6;
  L.box(72.1, y - 0.01, 64, TX1 - 0.2, y + 0.005, TZ1 - 0.2, 'carpetBlue', { collide: false, tint: 0x3a4250 });
  L.box(TX0 + 0.2, y + H, TZ0 + 0.2, TX1 - 0.2, y + H + 0.02, TZ1 - 0.2, 'ceiling', NC);
  // closed areas: west offices (x<72, z<84) and north-east (x 72..85, z<64)
  L.wallZ(TZ0 + 0.3, CORE[1], CORE[0], y, y + H, 'plaster', 0.2, [], { tint: 0xc8c4b8 });
  L.wallZ(CORE[3], 84, CORE[0], y, y + H, 'plaster', 0.2, [], { tint: 0xc8c4b8 });
  L.wallX(CORE[0], ST.x0 - 0.1, 64, y, y + H, 'plaster', 0.2, [], { tint: 0xc8c4b8 });
  L.box(CORE[0], y, CORE[1], CORE[2], y + H, CORE[3], 'concrete', { tint: 0x7a7670 });
  for (const z of [70, 74, 78]) { L.box(CORE[2], y, z - 0.8, CORE[2] + 0.03, y + 2.3, z + 0.8, 'metalClean', { collide: false, tint: 0x8a867a }); }
  // server room (x 81..91.7, z 63.6..76): enter from the stair vestibule, out the south door
  const sx0 = 81, sz0 = ST.z1 + 0.2, sz1 = 76;
  L.wallZ(64, sz1, sx0, y, y + H, 'plasterBlue', 0.2, [], { tint: 0x9aa4ac });
  L.wallX(sx0, TX1 - 0.3, sz1, y, y + H, 'plasterBlue', 0.2, [{ a: 83.2, b: 84.4, y0: y, y1: y + 2.2 }], { tint: 0x9aa4ac });
  L.box(sx0 + 0.1, y - 0.01, sz0, TX1 - 0.3, y + 0.03, sz1 - 0.1, 'metalClean', { collide: false, tint: 0x9aa0a4 });
  for (let x = sx0 + 0.7; x < TX1 - 0.5; x += 0.61) L.box(x, y + 0.031, sz0, x + 0.01, y + 0.033, sz1 - 0.1, 'metalDark', NC);
  for (const z of [67.2, 70.6, 74.0]) for (let x = 83.6; x < 90.8; x += 0.68) serverRack(L, x, y, z, z === 70.6 ? 0 : Math.PI);
  const crac = P.prop(L, 91.1, y, 65.0, -Math.PI / 2); crac.box(0, 1.0, 0, 1.8, 2.0, 0.8, 'paintedWhite', 0xc8ccc8).box(0, 1.5, -0.41, 1.4, 0.6, 0.01, 'metalDark').col(0, 1.0, 0, 1.8, 2.0, 0.8, 'metal');
  for (let i = 0; i < 4; i++) { const cy = P.prop(L, 82.2 + i * 0.4, y, 64.2, 0); cy.cyl(0, 0.75, 0, 0.16, 1.5, 'paintedRed', 0xb81a14, null, 10).col(0, 0.75, 0, 0.34, 1.5, 0.34, 'metal', F_SOLID | F_SHOOT); }
  sign(L, 'FM-200 FIRE SUPPRESSION\nEVACUATE WHEN ALARM SOUNDS', 82.4, y + 2.3, 63.9, 0, 1.4, 0.4, { bg: '#b81a14', fg: '#fff' });
  sign(L, 'DATA CENTER · AUTHORIZED ONLY', 83.8, y + 2.5, sz1 - 0.12, 0, 1.6, 0.25, { bg: '#1a2a3a', fg: '#9ac8ff' });
  for (const [x, z] of [[82.2, 70.6], [88.4, 69.0]]) L.light(x, y + 2.9, z, 0x6a9aff, 3.6, 7, { flicker: 0.15, buzz: 1 });
  P.corpse(L, 82.3, y + 0.04, 72.2, 0.2, 0x2a2a3a); blood(L, 82.3, y + 0.03, 72.2, 1.4, 4);
  new Door(L, 83.8, y, sz1, 'x', { width: 1.1, hinge: 1, material: 'metalClean' });
  L.reverb(sx0, y, sz0, TX1, y + H, sz1, 'room');
  // dark office (x 72..91.7, z 76..95.7)
  for (const x of [86.6, 89.2]) for (const z of [79.4, 82.4]) cubicle(L, x, y, z, z === 82.4 ? Math.PI : 0, 0x4a4e58);
  for (const x of [77.4, 80.0]) for (const z of [91.2, 94.2]) cubicle(L, x, y, z, z === 94.2 ? Math.PI : 0, 0x4a4e58);
  // the last stand: SE office, desks piled in the doorway (a gap to squeeze through)
  L.wallX(84, TX1 - 0.3, 86, y, y + H, 'plaster', 0.16, [{ a: 85.4, b: 87.2, y0: y, y1: y + 2.2 }], { tint: 0xc8c4b8 });
  L.box(84, y, 86, 84.16, y + H, TZ1 - 0.3, 'plaster', { tint: 0xc8c4b8 });
  P.desk(L, 87.5, y, 86.9, 0.3, false); P.filingCabinet(L, 84.8, y, 87.4, 0.1);
  P.chair(L, 87.8, y + 0.78, 86.8, 1.2, 'woodDark', true);
  sign(L, 'NO ROOM\nGO AWAY', 85.4, y + 1.9, 85.9, 0, 1.0, 0.45, { bg: '#f0ecd8', fg: '#8a1a14' });
  P.corpse(L, 89.6, y + 0.01, 92.0, 0.4, 0x2a2a3a); P.corpse(L, 87.4, y + 0.01, 94.0, 2.4, 0x4a3a2a);
  for (let i = 0; i < 5; i++) blood(L, 85 + rng() * 6, y, 87 + rng() * 8, 1 + rng(), i);
  for (let i = 0; i < 18; i++) { const sh = P.prop(L, 88 + rng() * 3, y + 0.01, 89 + rng() * 5, rng() * 6); sh.cyl(0, 0.01, 0, 0.012, 0.05, 'chrome', 0xc8a040, [0, 0, Math.PI / 2], 5); }
  officeDesk(L, 90, y, 94.4, Math.PI, { chair: false });
  const dl = P.prop(L, 90.6, y + 0.77, 94.3, 0); dl.cyl(0, 0.2, 0, 0.015, 0.4, 'metalDark').cyl(0, 0.4, -0.1, 0.1, 0.12, 'metalDark', 0x2a2a2a);
  L.light(90.5, y + 1.2, 93.8, 0xffc070, 3.5, 5, { flicker: 0.4 });
  L.item('huntingRifle', 89.4, y + 0.78, 94.4, { chance: 0.55 });
  L.item('ammo', 91.0, y + 0.02, 87.6, {});
  L.item('medkit', 88.2, y + 0.02, 95.0, { chance: 0.5 });
  graffiti(L, 'DAY 9\nJEN WENT\nTO THE\nAIRPORT', TX1 - 0.33, y + 1.6, 91, -Math.PI / 2, 1.4, 1.1, '#202020');
  wallMessages(L, 88, y + 1.5, TZ1 - 0.34, 0, 2.4, 1.2, { lines: ['DAY 1', 'DAY 2', 'DAY 3', 'DAY 4 — WATER GONE', 'DAY 7 — THEY HEAR THE RADIO', 'DAY 9'], density: 0.9 });
  // mezzanine balustrade around the atrium + the grand stair down into the lobby
  const bal = (x0, z0, x1, z1) => { L.box(x0, y, z0, x1, y + 1.05, z1, 'glass', { flags: F_SOLID | F_SHOOT, tint: 0x9ab8c0 }); L.box(x0 - 0.02, y + 1.05, z0 - 0.02, x1 + 0.02, y + 1.1, z1 + 0.02, 'metalClean', NC); L.clip(x0, y + 1.05, z0, x1, y + 2.4, z1, F_SOLID); };
  bal(ATR[2] - 0.05, ATR[1], ATR[2] + 0.05, 86);
  bal(ATR[2] - 0.05, 88.6, ATR[2] + 0.05, ATR[3]);
  L.stairs(63.4, 86, ATR[2], 88.6, OL1, OL2, '+x', 'marble', { tint: 0xd8d0c0 });
  for (const z of [86.03, 88.57]) { railSegment(L, 63.4, OL1 + 1.0, z, ATR[2], OL2 + 1.0, z); L.clip(63.4, OL1, z - 0.04, ATR[2], OL2 + 1.1, z + 0.04, F_SOLID); }
  // emergency lights only
  for (const [x, z] of [[74, 78], [80, 93]]) { L.box(x - 0.15, y + H - 0.12, z - 0.08, x + 0.15, y + H, z + 0.08, 'emissiveRed', NC); L.light(x, y + H - 0.4, z, 0xff3020, 2.4, 6, { flicker: 0.05 }); }
  for (const [x, z] of [[76, 88], [84, 80]]) ceilingLight(L, x, y + H, z, { type: 'fluoro', on: false });
  P.papers(L, 78, y + 0.01, 88, 4, 20);
  for (let i = 0; i < 7; i++) blood(L, 73 + rng() * 17, y, 77 + rng() * 17, 0.7 + rng(), i);
  L.decal(79.6, y + 0.013, 87.2, 0, 1, 0, 2.2, DF.SPLAT_BIG);
  L.reverb(72, y, 76, TX1, y + H, TZ1, 'room');
  L.ambience(72, y, TZ0, TX1, y + H, TZ1, 'apartments');
  L.witchSpots.push({ x: 79.4, y, z: 94.0 });
}

function lobby(L, game) {
  const y = OL1, H = OL2 - 0.4 - OL1;
  L.box(TX0 + 0.2, y - 0.01, 80.1, TX1 - 0.2, y + 0.005, TZ1 - 0.2, 'marble', { collide: false, tint: 0xc8c0b0 });
  L.box(ATR[0], OL2 - 0.4, ATR[1], ATR[2], OL2 - 0.38, ATR[3], 'ceiling', NC);
  // back wall of the lobby (services behind) with the core's elevator doors
  L.wallX(TX0 + 0.2, TX1 - 0.2, 80, y, OL2 - 0.4, 'marble', 0.3, [], { tint: 0xb8b0a0 });
  L.box(TX0 + 0.2, OL2, 83.8, ATR[2], OL3 - 0.4, 84.2, 'marble', { tint: 0xb8b0a0 });
  for (const x of [74, 78]) { L.box(x - 0.8, y, 80.16, x + 0.8, y + 2.4, 80.2, 'metalClean', { collide: false, tint: 0xb8b0a0 }); L.box(x - 0.005, y, 80.2, x + 0.005, y + 2.4, 80.21, 'blackMatte', NC); }
  sign(L, 'MERIDIAN', 65, 2.9, 80.17, 0, 7.5, 1.3, { fg: '#d8c8a0', font: 'Georgia, serif' });
  sign(L, 'TRUST · SINCE 1954', 65, 1.9, 80.17, 0, 4.2, 0.4, { fg: '#a89878', font: 'Georgia, serif' });
  sign(L, 'MERIDIAN', 65, 6.4, 84.22, 0, 6.5, 1.1, { fg: '#d8c8a0', font: 'Georgia, serif' });
  // reception, security line, seating
  P.receptionDesk(L, 77.5, y, 86.2, 0, 5);
  crt(L, 76.6, y + 1.05, 86.4, 0.2, 0.9, true);
  L.light(76.8, y + 1.6, 85.4, 0x7aa0ff, 2.2, 4, { flicker: 0.5 });
  for (let x = 80.5; x < 90; x += 1.3) if (Math.abs(x - 84.4) > 0.8) P.turnstile(L, x, y, 83.4, 0);
  L.clip(79.8, y, 83.3, 83.7, y + 1.0, 83.5, F_SOLID); L.clip(85.1, y, 83.3, 91.7, y + 1.0, 83.5, F_SOLID);
  seatRow(L, 62, y, 93.6, 0, 5, 0x5a2a2a); seatRow(L, 62, y, 91.6, Math.PI, 5, 0x5a2a2a);
  for (const [x, z] of [[59.2, 94.8], [71.4, 94.8], [90.8, 94.8], [59.2, 84.8]]) P.planter(L, x, y, z, 0.5);
  // atrium sculpture
  const sc = P.prop(L, 66.5, y, 91.8, 0.4);
  sc.box(0, 0.3, 0, 2.2, 0.6, 2.2, 'marble', 0x8a8478).cyl(0, 2.4, 0, 1.4, 0.3, 'chrome', 0xc8a060, [Math.PI / 2, 0, 0.4], 24).cyl(0, 2.2, 0, 1.0, 0.25, 'chrome', 0xa87a40, [Math.PI / 2, 0.8, 0], 24).col(0, 0.3, 0, 2.2, 0.6, 2.2, 'concrete');
  // the main entrance: chained + barricaded from inside
  for (const x of [63, 66, 69]) { const s2 = P.prop(L, x, y, 95.1, rng() * 0.3 - 0.15); s2.box(0, 0.22, 0, 2.0, 0.44, 0.9, 'fabric', 0x3a2a2a).box(0, 0.62, 0.36, 2.0, 0.5, 0.2, 'fabric', 0x3a2a2a); }
  P.desk(L, 64.6, y + 0.44, 95.0, 0.2, false); P.desk(L, 67.8, y + 0.44, 95.2, -0.3, false);
  L.clip(61.6, y, 94.2, 70.6, y + 2.8, TZ1 - 0.1, F_DEFAULT);
  for (const x of [62.4, 65.4, 68.4]) P.pipe(L, x - 0.6, y + 1.1, TZ1 - 0.05, x + 0.6, y + 1.1, TZ1 - 0.05, 0.02, 'metalDark');
  sign(L, 'DOORS CHAINED\nUSE EMERGENCY EXIT →', 66, y + 2.5, 94.1, 0, 1.8, 0.5, { bg: '#f0ecd8', fg: '#8a1a14' });
  // emergency exit (alarmed)
  L.box(84.2, y + 2.25, TZ1 - 0.25, 85.8, y + 2.6, TZ1 - 0.15, 'concreteDark', NC);
  sign(L, 'EMERGENCY EXIT ONLY\nALARM WILL SOUND', 85, y + 2.45, TZ1 - 0.27, 0, 1.4, 0.35, { bg: '#b81a14', fg: '#fff', glow: 0.8, lightColor: 0xff3020, lightIntensity: 3 });
  L.box(84.5, y + 1.0, TZ1 - 0.2, 85.5, y + 1.08, TZ1 - 0.12, 'paintedRed', NC);
  // lights: mostly emergency packs + street glow through the glass
  for (const [x, z] of [[60, 81], [90, 81]]) wallLamp(L, x, y + 3.2, z, 0, 1, 0xffd8a0, 4, 9);
  L.light(66, y + 6, 90, 0xb8c8e0, 5, 14, { flicker: 0.1 });
  L.light(85, y + 2.6, TZ1 - 1.2, 0xff4030, 2.5, 5, {});
  // story
  P.corpse(L, 77.2, y + 0.01, 88.3, 1.8, 0x1a2a4a); blood(L, 77.2, y, 88.3, 1.8, 4);
  P.corpse(L, 88.6, y + 0.01, 92.4, 0.4, 0x3a3a3a);
  for (let i = 0; i < 8; i++) blood(L, 60 + rng() * 30, y, 85 + rng() * 10, 0.7 + rng(), i);
  P.papers(L, 80, y + 0.01, 90, 5, 24);
  L.item('pills', 77.9, y + 1.05, 86.0, { chance: 0.6 });
  L.item('molotov', 90.6, y + 0.02, 85.0, { chance: 0.5 });
  L.reverb(TX0, y, 80, TX1, OL3, TZ1, 'hall');
  L.ambience(TX0, y, 80, TX1, OL3, TZ1, 'apartments');
}

export function buildTower(L, game) {
  printingWorks(L, game);
  towerShell(L, game);
  const stair = officeStair(L, game, ST, OL2, OL3);
  levelThree(L, game);
  levelTwo(L, game, stair);
  lobby(L, game);
  const exit = new Door(L, 85, OL1, TZ1, 'x', { width: 1.2, hinge: -1, material: 'paintedRed' });
  return { exit, stair };
}
