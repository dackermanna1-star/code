// Named locations and their authored street layouts / building lots.
// Each location has a distinct identity (see docs/DESIGN.md §2). Lots are placed along authored streets by the
// LayoutBuilder (rejecting overlaps with other lots, roads, water) so buildings always line up with streets.
import type { BuildingType, MapLocation } from '../../core/contracts';
import type { LayoutBuilder } from './LayoutBuilder';
import type { RoadDef, XZ } from './types';
import { xz, rotYFacing } from './geometry';
import { DIRT_WIDTH, STREET_WIDTH } from './roads';

export const LOCATIONS: MapLocation[] = [
  { name: 'Volodino', kind: 'town', x: 1380, z: 1400, radius: 190, lootTier: 0.8 },
  { name: 'Ryabinovka School', kind: 'school', x: 1610, z: 930, radius: 140, lootTier: 0.75 },
  { name: 'Zalivsk', kind: 'port', x: 430, z: 560, radius: 220, lootTier: 0.7 },
  { name: 'Ostrov Military Base', kind: 'military', x: 1650, z: 2720, radius: 260, lootTier: 1 },
  { name: 'Teplograd Power Plant', kind: 'industrial', x: 2680, z: 1450, radius: 200, lootTier: 0.65 },
  { name: 'Kamenka Prison', kind: 'landmark', x: 2520, z: 690, radius: 110, lootTier: 0.75 },
  { name: 'Lipovo', kind: 'village', x: 1250, z: 340, radius: 150, lootTier: 0.35 },
  { name: 'Malinovka', kind: 'village', x: 560, z: 2060, radius: 140, lootTier: 0.35 },
  { name: 'Berezovka', kind: 'village', x: 1720, z: 2130, radius: 140, lootTier: 0.4 },
  { name: 'Staroye Ruins', kind: 'ruins', x: 715, z: 1150, radius: 80, lootTier: 0.45 },
  { name: 'Granitny Quarry', kind: 'quarry', x: 430, z: 1490, radius: 130, lootTier: 0.4 },
  { name: 'Vysota Radio Tower', kind: 'landmark', x: 2050, z: 1160, radius: 70, lootTier: 0.5 },
];

const HOUSES: [BuildingType, number][] = [
  ['house_small', 4],
  ['house_two_story', 3],
  ['house_brick', 3],
  ['garage', 0.8],
  ['shed', 0.6],
];
const TOWN_HOUSES: [BuildingType, number][] = [
  ['house_small', 3],
  ['house_two_story', 4],
  ['house_brick', 4],
  ['shop', 1.6],
  ['garage', 0.6],
];
const VILLAGE: [BuildingType, number][] = [
  ['house_small', 5],
  ['house_two_story', 2],
  ['house_brick', 1],
  ['barn', 1],
  ['shed', 1.2],
  ['garage', 0.6],
];

export interface TownStreets {
  [name: string]: RoadDef;
}

/** Streets inside towns (asphalt) and village lanes. Must be added before any lots are placed. */
export function addTownStreets(b: LayoutBuilder): TownStreets {
  const s: TownStreets = {};
  const st = (name: string, pts: XZ[], width = STREET_WIDTH, kind: 'asphalt' | 'dirt' = 'asphalt') =>
    (s[name] = b.addRoad(pts, width, kind, name));
  // Volodino: ring + cross streets around the A3/A4 crossroads.
  st('vN', [xz(1218, 1300), xz(1290, 1270), xz(1372, 1262), xz(1452, 1280), xz(1530, 1312)]);
  st('vS', [xz(1230, 1515), xz(1305, 1540), xz(1392, 1528), xz(1470, 1545), xz(1536, 1500)]);
  st('vW', [xz(1218, 1300), xz(1212, 1350), xz(1226, 1440), xz(1230, 1515)]);
  st('vE', [xz(1530, 1312), xz(1555, 1385), xz(1536, 1500)]);
  st('vC1', [xz(1290, 1270), xz(1310, 1335), xz(1298, 1405)], 6);
  st('vC2', [xz(1470, 1405), xz(1452, 1470), xz(1470, 1545)], 6);
  st('vD', [xz(1305, 1540), xz(1340, 1470), xz(1380, 1400)], 6);
  // Ryabinovka school district
  st('rS', [xz(1532, 960), xz(1640, 958), xz(1760, 950)]);
  st('rE', [xz(1700, 806), xz(1720, 880), xz(1760, 950)], 6);
  // Zalivsk port
  st('pQuay', [xz(215, 615), xz(320, 650), xz(400, 690), xz(480, 702), xz(600, 690)], 9);
  st('pMain', [xz(560, 520), xz(470, 500), xz(370, 482), xz(255, 470)]);
  st('pN', [xz(470, 500), xz(490, 400), xz(520, 320)]);
  st('pX', [xz(370, 482), xz(372, 570), xz(330, 652)], 6);
  // Military base
  st('mMain', [xz(1540, 2700), xz(1650, 2702), xz(1760, 2700)], 8);
  st('mN', [xz(1650, 2702), xz(1652, 2590)], 7);
  st('mS', [xz(1650, 2702), xz(1655, 2840)], 7);
  // Power plant
  st('tMain', [xz(2560, 1450), xz(2650, 1455), xz(2770, 1462)], 8);
  st('tN', [xz(2650, 1455), xz(2655, 1360)], 7);
  // Prison approach
  st('kGate', [xz(2400, 690), xz(2463, 690)], 7);
  // Villages
  st('lS', [xz(1250, 380), xz(1185, 305), xz(1110, 262)], 6);
  st('lE', [xz(1250, 380), xz(1300, 330), xz(1330, 250)], 6);
  st('mlS', [xz(590, 2010), xz(520, 2080), xz(440, 2120)], 6);
  st('bS', [xz(1700, 2140), xz(1765, 2098), xz(1840, 2082)], 6);
  st('bN', [xz(1640, 2020), xz(1760, 2010), xz(1860, 1980)], 6, 'dirt');
  return s;
}

function roadsByName(b: LayoutBuilder): Record<string, RoadDef> {
  const m: Record<string, RoadDef> = {};
  for (const r of b.roads) if (r.name) m[r.name.split(' ')[0]] = r;
  return m;
}

/** Arc-length on a road closest to a point (coarse). */
function sOn(road: RoadDef, x: number, z: number): number {
  let best = Infinity, bestS = 0, acc = 0;
  const p = road.points;
  for (let i = 0; i < p.length; i++) {
    if (i > 0) acc += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z);
    const d = Math.hypot(p[i].x - x, p[i].z - z);
    if (d < best) {
      best = d;
      bestS = acc;
    }
  }
  return bestS;
}

/** Arc-length range of a road inside a circle. */
function rangeIn(road: RoadDef, cx: number, cz: number, r: number): [number, number] {
  let acc = 0, from = Infinity, to = -Infinity;
  const p = road.points;
  for (let i = 0; i < p.length; i++) {
    if (i > 0) acc += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z);
    if (Math.hypot(p[i].x - cx, p[i].z - cz) <= r) {
      from = Math.min(from, acc);
      to = Math.max(to, acc);
    }
  }
  return from <= to ? [from, to] : [0, 0];
}

export function placeLocations(b: LayoutBuilder, s: TownStreets): void {
  const R = roadsByName(b);
  volodino(b, s, R);
  ryabinovka(b, s, R);
  zalivsk(b, s, R);
  military(b, s, R);
  powerPlant(b, s, R);
  prison(b, s);
  lipovo(b, s, R);
  malinovka(b, s, R);
  berezovka(b, s, R);
  ruins(b);
  quarry(b);
  radioTower(b);
  farmsteads(b);
  roadside(b, R);
}

// ── Volodino: dense central town at the A3/A4 crossroads ────────────────────────────────────────
function volodino(b: LayoutBuilder, s: TownStreets, R: Record<string, RoadDef>): void {
  const loc = 'Volodino';
  b.forceLot('church', 1338, 1350, 0, loc); // faces south onto the square
  b.forceLot('police', 1432, 1462, Math.PI, loc); // faces north onto A3
  b.tryLot('shop', 1350, 1430, Math.PI, { location: loc });
  b.tryLot('shop', 1410, 1372, 0, { location: loc });
  b.tryLot('shop', 1420, 1340, 0, { location: loc });
  b.tryLot('gas_station', 1600, 1420, Math.PI, { location: loc });
  const fill = (road: RoadDef, max: number, from?: number, to?: number) =>
    b.lotsAlong(road, { location: loc, side: 0, from, to, gap: [4, 9], setback: [2.5, 5], types: TOWN_HOUSES, max });
  const [a3f, a3t] = rangeIn(R['A3'], 1380, 1400, 170);
  fill(R['A3'], 10, a3f, a3t);
  const [a4f, a4t] = rangeIn(R['A4'], 1380, 1400, 150);
  fill(R['A4'], 9, a4f, a4t);
  const quota: Record<string, number> = { vN: 6, vS: 6, vW: 4, vE: 4, vC1: 3, vC2: 3, vD: 3 };
  for (const k of Object.keys(quota)) fill(s[k], quota[k]);
}

// ── Ryabinovka: the school plus four apartment blocks ──────────────────────────────────────────
function ryabinovka(b: LayoutBuilder, s: TownStreets, R: Record<string, RoadDef>): void {
  const loc = 'Ryabinovka School';
  b.forceLot('school', 1612, 905, -Math.PI / 2, loc);
  b.forceLot('apartment', 1585, 1000, Math.PI, loc);
  b.forceLot('apartment', 1625, 1000, Math.PI, loc);
  b.forceLot('apartment', 1665, 1000, Math.PI, loc);
  b.forceLot('apartment', 1690, 895, -Math.PI / 2, loc);
  b.tryLot('shop', 1500, 900, Math.PI / 2, { location: loc });
  const [f, t] = rangeIn(R['A4'], 1545, 900, 170);
  b.lotsAlong(R['A4'], { location: loc, side: 0, from: f, to: t, gap: [6, 12], setback: [3, 6], types: HOUSES, max: 4 });
  const [f7, t7] = rangeIn(R['A7'], 1545, 830, 220);
  b.lotsAlong(R['A7'], { location: loc, side: 0, from: f7, to: t7, gap: [8, 14], setback: [3, 6], types: HOUSES, max: 4 });
  b.lotsAlong(s['rS'], { location: loc, side: 1, gap: [6, 10], setback: [3, 5], types: HOUSES, max: 3 });
  b.lotsAlong(s['rE'], { location: loc, side: 0, gap: [6, 10], setback: [3, 5], types: HOUSES, max: 2 });
  // school yard fence (metal), gate toward the road
  b.fenceAround({ x: 1630, z: 925, hw: 62, hd: 46, rot: -Math.PI / 2 }, 'fence_metal', 14);
}

// ── Zalivsk: port with a container yard, warehouses, cranes and apartment blocks ────────────────
function zalivsk(b: LayoutBuilder, s: TownStreets, R: Record<string, RoadDef>): void {
  const loc = 'Zalivsk';
  // Warehouses along the north side of the quay road (fronts face the quay).
  b.lotsAlong(s['pQuay'], { location: loc, side: -1, from: 120, gap: [6, 10], setback: [6, 9], types: [['warehouse', 1]], max: 3 });
  b.tryLot('warehouse', 470, 600, Math.PI - 0.15, { location: loc });
  b.tryLot('warehouse', 560, 610, Math.PI - 0.05, { location: loc });
  b.tryLot('warehouse', 300, 540, Math.PI - 0.1, { location: loc });
  b.tryLot('warehouse', 250, 545, Math.PI - 0.1, { location: loc });
  b.tryLot('warehouse', 640, 600, Math.PI, { location: loc });
  // Apartment towers and town houses.
  b.tryLot('apartment', 530, 450, -Math.PI / 2, { location: loc });
  b.tryLot('apartment', 530, 410, -Math.PI / 2, { location: loc });
  b.tryLot('apartment', 445, 440, Math.PI / 2, { location: loc });
  b.tryLot('apartment', 450, 380, Math.PI / 2, { location: loc });
  b.tryLot('hospital', 620, 455, Math.PI, { location: loc });
  b.lotsAlong(s['pMain'], { location: loc, side: 0, gap: [4, 9], setback: [3, 5], types: TOWN_HOUSES, max: 10 });
  b.lotsAlong(s['pN'], { location: loc, side: 0, gap: [5, 10], setback: [3, 5], types: TOWN_HOUSES, max: 6 });
  b.lotsAlong(s['pX'], { location: loc, side: 0, gap: [4, 8], setback: [3, 5], types: [['shop', 2], ['garage', 1], ['house_brick', 2]], max: 3 });
  const [a1f] = rangeIn(R['A1'], 560, 520, 220);
  b.lotsAlong(R['A1'], { location: loc, side: 0, from: a1f, to: a1f + 200, gap: [7, 12], setback: [3, 6], types: HOUSES, max: 4 });
  const [a2f] = rangeIn(R['A2'], 560, 520, 200);
  b.lotsAlong(R['A2'], { location: loc, side: 0, from: a2f, to: a2f + 140, gap: [7, 12], setback: [3, 6], types: HOUSES, max: 3 });

  // Container yard between the quay and the west warehouses: rows of stacked 40ft/20ft containers.
  const yard = { x: 285, z: 600, rot: -0.32 };
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 4; col++) {
      if (b.rng.chance(0.18)) continue;
      const lx = -60 + col * 16 + b.rng.range(-0.3, 0.3);
      const lz = -21 + row * 6.2;
      const c = Math.cos(yard.rot), sn = Math.sin(yard.rot);
      const x = yard.x + lx * c + lz * sn, z = yard.z - lx * sn + lz * c;
      const big = b.rng.chance(0.7);
      const levels = b.rng.weighted<number>([
        [1, 3],
        [2, 4],
        [3, 2],
      ]);
      for (let lv = 0; lv < levels; lv++)
        b.prop(big ? 'container' : 'container_small', x, z, yard.rot + (b.rng.chance(0.1) ? 0.05 : 0), { y: lv * 2.6 });
    }
  }
  // Gantry cranes on the quay edge, facing the water.
  b.prop('crane', 300, 676, -0.32 + Math.PI);
  b.prop('crane', 372, 712, -0.45 + Math.PI);
  b.prop('pallet_stack', 420, 680, 0.1);
  b.prop('pallet_stack', 432, 684, 0.4);
  b.prop('barrel', 440, 676, 0);
}

// ── Ostrov Military Base: barracks, hangars, watchtowers, perimeter fence, checkpoints ──────────
function military(b: LayoutBuilder, _s: TownStreets, R: Record<string, RoadDef>): void {
  const loc = 'Ostrov Military Base';
  // Barracks rows north and south of the main road.
  for (const x of [1560, 1590, 1710, 1740]) b.forceLot('military_barracks', x, 2648, 0, loc);
  for (const x of [1575, 1725]) b.forceLot('military_barracks', x, 2760, Math.PI, loc);
  b.forceLot('military_hangar', 1840, 2790, Math.PI, loc);
  b.forceLot('military_hangar', 1465, 2795, Math.PI, loc);
  b.tryLot('warehouse', 1840, 2620, 0, { location: loc });
  b.tryLot('police', 1615, 2560, 0, { location: loc }); // HQ
  b.tryLot('garage', 1690, 2560, 0, { location: loc });
  b.tryLot('garage', 1500, 2700, Math.PI / 2, { location: loc });
  b.tryLot('hospital', 1650, 2860, Math.PI, { location: loc });
  for (const [x, z] of [
    [1408, 2585],
    [1892, 2585],
    [1408, 2885],
    [1892, 2885],
  ])
    b.forceLot('watchtower', x, z, rotYFacing(1650 - x, 2720 - z), loc);
  // Perimeter fence with gates where mMain enters (west & east).
  const x0 = 1400, x1 = 1900, z0 = 2575, z1 = 2895, gz = 2700;
  b.linearProp('fence_metal', xz(x0, z0), xz(x1, z0));
  b.linearProp('fence_metal', xz(x0, z1), xz(x1, z1));
  b.linearProp('fence_metal', xz(x0, z0), xz(x0, gz - 9));
  b.linearProp('fence_metal', xz(x0, gz + 9), xz(x0, z1));
  b.linearProp('fence_metal', xz(x1, z0), xz(x1, gz - 9));
  b.linearProp('fence_metal', xz(x1, gz + 9), xz(x1, z1));
  // Container stacks by the hangars.
  for (let i = 0; i < 6; i++) {
    const x = 1890 - 2, z = 2650 + i * 7;
    b.prop('container', x - 14, z + 30, Math.PI / 2, { y: 0 });
    if (i % 2 === 0) b.prop('container', x - 14, z + 30, Math.PI / 2, { y: 2.6 });
  }
  for (let i = 0; i < 4; i++) b.prop('container_small', 1430 + i * 3, 2840, 0, { y: 0 });
  // Gate checkpoints (barriers + sandbags) at both gates and both bridge exits.
  checkpoint(b, x0 - 6, gz, 0);
  checkpoint(b, x1 + 6, gz, Math.PI);
  const a5 = R['A5'], a4 = R['A4'];
  for (const road of [a5, a4]) {
    const p = road.points;
    // bridge south end: first point on the military island going south
    for (let i = 1; i < p.length; i++)
      if (p[i].z > 2575 && p[i - 1].z <= 2575) {
        checkpoint(b, p[i].x, p[i].z, Math.atan2(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z));
        break;
      }
  }
}

/** Road checkpoint: staggered concrete barriers (chicane) + sandbag nests on both shoulders. */
function checkpoint(b: LayoutBuilder, x: number, z: number, dirRot: number): void {
  const c = Math.cos(dirRot), s = Math.sin(dirRot);
  const w = (lx: number, lz: number) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
  const p1 = w(-2.2, -4), p2 = w(2.2, 4);
  b.prop('barrier_concrete', p1.x, p1.z, dirRot + Math.PI / 2);
  b.prop('barrier_concrete', p2.x, p2.z, dirRot + Math.PI / 2);
  const s1 = w(-7.5, 0), s2 = w(7.5, 0);
  b.prop('sandbags', s1.x, s1.z, dirRot + Math.PI / 2);
  b.prop('sandbags', s2.x, s2.z, dirRot - Math.PI / 2);
}

// ── Teplograd Power Plant: factory halls, warehouses, cooling towers, tanks ─────────────────────
function powerPlant(b: LayoutBuilder, s: TownStreets, _R: Record<string, RoadDef>): void {
  const loc = 'Teplograd Power Plant';
  b.forceLot('factory', 2705, 1405, 0, loc);
  b.forceLot('factory', 2705, 1512, Math.PI, loc);
  b.tryLot('factory', 2790, 1400, 0, { location: loc });
  b.tryLot('warehouse', 2600, 1395, 0, { location: loc });
  b.tryLot('warehouse', 2610, 1510, Math.PI, { location: loc });
  b.tryLot('shed', 2560, 1480, 0, { location: loc });
  b.tryLot('garage', 2760, 1505, Math.PI, { location: loc });
  b.prop('cooling_tower', 2855, 1530, 0);
  b.prop('cooling_tower', 2875, 1450, 0);
  for (let i = 0; i < 4; i++) b.prop('tank_industrial', 2790 + (i % 2) * 18, 1300 + Math.floor(i / 2) * 18, 0);
  b.prop('chimney', 2740, 1350, 0);
  b.fenceAround({ x: 2700, z: 1450, hw: 140, hd: 120, rot: Math.PI / 2 }, 'fence_metal', 14);
  void s;
}

// ── Kamenka Prison: walled compound, one gate ──────────────────────────────────────────────────
function prison(b: LayoutBuilder, _s: TownStreets): void {
  const loc = 'Kamenka Prison';
  b.forceLot('hospital', 2532, 690, -Math.PI / 2, loc); // main cell block, faces the gate (west)
  b.forceLot('military_barracks', 2525, 652 - 10, Math.PI / 2, loc);
  b.forceLot('military_barracks', 2525, 738 + 10, Math.PI / 2, loc);
  b.forceLot('garage', 2482, 662, Math.PI / 2, loc);
  for (const [x, z] of [
    [2472, 640],
    [2568, 640],
    [2472, 742],
    [2568, 742],
  ])
    b.forceLot('watchtower', x, z, rotYFacing(2520 - x, 690 - z), loc);
  b.fenceAround({ x: 2520, z: 691, hw: 56, hd: 58, rot: -Math.PI / 2 }, 'wall_concrete', 8);
}

// ── Villages ───────────────────────────────────────────────────────────────────────────────────
function lipovo(b: LayoutBuilder, s: TownStreets, R: Record<string, RoadDef>): void {
  const loc = 'Lipovo';
  const [f, t] = rangeIn(R['A1'], 1250, 340, 150);
  b.lotsAlong(R['A1'], { location: loc, side: 0, from: f, to: t, gap: [8, 16], setback: [3, 6], types: VILLAGE, max: 6 });
  b.lotsAlong(s['lS'], { location: loc, side: 0, gap: [8, 16], setback: [3, 6], types: VILLAGE, max: 4 });
  b.lotsAlong(s['lE'], { location: loc, side: 0, gap: [8, 16], setback: [3, 6], types: VILLAGE, max: 3 });
  b.tryLot('barn', 1160, 440, 0.1, { location: loc });
  b.tryLot('shop', 1272, 402, Math.PI / 4, { location: loc });
  b.prop('water_tower', 1300, 440, 0);
}

function malinovka(b: LayoutBuilder, s: TownStreets, R: Record<string, RoadDef>): void {
  const loc = 'Malinovka';
  const [f, t] = rangeIn(R['A2'], 560, 2060, 150);
  b.lotsAlong(R['A2'], { location: loc, side: 0, from: f, to: t, gap: [8, 16], setback: [3, 6], types: VILLAGE, max: 4 });
  const [f5, t5] = rangeIn(R['A5'], 560, 2060, 200);
  b.lotsAlong(R['A5'], { location: loc, side: 0, from: f5, to: t5, gap: [8, 16], setback: [3, 6], types: VILLAGE, max: 4 });
  b.lotsAlong(s['mlS'], { location: loc, side: 0, gap: [8, 16], setback: [3, 6], types: VILLAGE, max: 4 });
  b.tryLot('barn', 660, 1990, 0.4, { location: loc });
}

function berezovka(b: LayoutBuilder, s: TownStreets, R: Record<string, RoadDef>): void {
  const loc = 'Berezovka';
  const [f, t] = rangeIn(R['A4'], 1720, 2130, 150);
  b.lotsAlong(R['A4'], { location: loc, side: 0, from: f, to: t, gap: [8, 16], setback: [3, 6], types: VILLAGE, max: 5 });
  b.lotsAlong(s['bS'], { location: loc, side: 0, gap: [8, 16], setback: [3, 6], types: VILLAGE, max: 4 });
  b.lotsAlong(s['bN'], { location: loc, side: 0, gap: [8, 16], setback: [3, 6], types: VILLAGE, max: 3 });
  const [f6, t6] = rangeIn(R['A6'], 1720, 2130, 160);
  b.lotsAlong(R['A6'], { location: loc, side: 0, from: f6, to: t6, gap: [8, 16], setback: [3, 6], types: VILLAGE, max: 2 });
  b.prop('water_tower', 1790, 2170, 0);
}

// ── Staroye Ruins: broken stone buildings on a hill ───────────────────────────────────────────
function ruins(b: LayoutBuilder): void {
  const loc = 'Staroye Ruins';
  const spots: [number, number, number][] = [
    [700, 1125, 0.2],
    [735, 1130, -0.1],
    [690, 1165, 0.3],
    [740, 1170, 0.05],
    [715, 1195, -0.25],
    [665, 1140, 0.5],
    [760, 1150, 0.15],
  ];
  for (const [x, z, r] of spots) b.tryLot('ruin', x, z, r, { location: loc, margin: 2 });
  for (let i = 0; i < 10; i++) {
    const a = b.rng.range(0, Math.PI * 2), r = b.rng.range(35, 70);
    b.prop('wall_ruin', 715 + Math.cos(a) * r, 1150 + Math.sin(a) * r, b.rng.range(-Math.PI, Math.PI), { length: b.rng.range(4, 9) });
  }
}

// ── Granitny Quarry: open pit with sheds on the rim ──────────────────────────────────────────
function quarry(b: LayoutBuilder): void {
  const loc = 'Granitny Quarry';
  b.tryLot('warehouse', 600, 1365, 0.35 + Math.PI, { location: loc });
  b.tryLot('shed', 560, 1350, 0.3, { location: loc });
  b.tryLot('garage', 530, 1345, 0.35, { location: loc });
  b.tryLot('shed', 420, 1510, 0.35, { location: loc, roadMargin: 1 });
  b.prop('tank_industrial', 380, 1470, 0, { scale: 0.6 });
  b.prop('conveyor', 450, 1470, 0.35);
  for (let i = 0; i < 4; i++) b.prop('container_small', 360 + i * 3.2, 1525 + i * 1.2, 0.35);
}

// ── Vysota Radio Tower: summit with a mast and a hut ─────────────────────────────────────────
function radioTower(b: LayoutBuilder): void {
  b.prop('radio_tower', 2056, 1146, 0);
  b.tryLot('shed', 2068, 1170, Math.PI, { location: 'Vysota Radio Tower', roadMargin: 1.5 });
}

// ── Farmsteads scattered across the countryside (house + barn + sheds, fenced yard, dirt track) ──
const FARMS: [number, number][] = [
  [1890, 560],
  [1640, 720],
  [2450, 1800],
  [2560, 2060],
  [2260, 2160],
  [710, 1830],
  [1960, 2190],
  [1450, 2260],
  [1700, 1210],
  [2410, 1300],
  [880, 660],
  [2150, 450],
  [1050, 2110],
  [2320, 900],
  [850, 1560],
  [2600, 1010],
];

function farmsteads(b: LayoutBuilder): void {
  for (const [fx, fz] of FARMS) {
    // Face the nearest road.
    let best = Infinity, bx = fx, bz = fz + 1;
    for (const r of b.roads) {
      if (r.kind === 'dirt' && r.name?.startsWith('farm')) continue;
      for (const p of r.points) {
        const d = Math.hypot(p.x - fx, p.z - fz);
        if (d < best) {
          best = d;
          bx = p.x;
          bz = p.z;
        }
      }
    }
    const rot = rotYFacing(bx - fx, bz - fz);
    const c = Math.cos(rot), s = Math.sin(rot);
    const w = (lx: number, lz: number) => ({ x: fx + lx * c + lz * s, z: fz - lx * s + lz * c });
    const yard = { x: fx, z: fz, hw: 32, hd: 30, rot };
    // Track from the gate to the road (stops at the road edge).
    const gate = w(0, yard.hd + 1);
    if (best > 25) {
      const mid = w(0, yard.hd + 12);
      b.addRoad([w(0, 6), gate, mid, xz(bx, bz)], DIRT_WIDTH, 'dirt', `farm ${fx},${fz}`, false);
    }
    const loc = undefined;
    const house = b.rng.chance(0.5) ? 'house_small' : 'house_two_story';
    const placed = [
      b.tryLot(house, w(-12, 10).x, w(-12, 10).z, rot, { location: loc, margin: 2, roadMargin: 1 }),
      b.tryLot('barn', w(14, -6).x, w(14, -6).z, rot - Math.PI / 2, { location: loc, margin: 2, roadMargin: 1 }),
      b.tryLot('shed', w(-14, -14).x, w(-14, -14).z, rot, { location: loc, margin: 2, roadMargin: 1 }),
      b.rng.chance(0.6) ? b.tryLot('garage', w(-14, -2).x - 0, w(-14, -2).z, rot + Math.PI / 2, { location: loc, margin: 1.5, roadMargin: 1 }) : null,
    ];
    if (placed.filter(Boolean).length >= 2) b.fenceAround(yard, 'fence_wood', 6);
    if (b.rng.chance(0.4)) b.prop('water_tower', w(24, 20).x, w(24, 20).z, 0);
  }
}

// ── Roadside: gas stations, lone houses, bus stops ───────────────────────────────────────────
function roadside(b: LayoutBuilder, R: Record<string, RoadDef>): void {
  b.tryLotFacing('gas_station', 838, 1250, 800, 1250);
  b.tryLotFacing('gas_station', 2170, 735, 2170, 690);
  b.tryLotFacing('gas_station', 1485, 1975, 1525, 1940);
  b.tryLotFacing('gas_station', 2365, 1520, 2365, 1555);
  for (const k of ['A1', 'A2', 'A3', 'A4', 'A7', 'A9']) {
    const road = R[k];
    if (!road) continue;
    b.lotsAlong(road, { location: '', side: 0, gap: [150, 320], setback: [4, 9], types: HOUSES, skip: 0.6, max: 3 });
  }
  // strip empty location names from lone houses
  for (const l of b.lots) if (l.location === '') delete l.location;
  for (const [x, z, road] of [
    [1300, 1250, 'A4'],
    [760, 600, 'A1'],
    [1560, 1960, 'A4'],
    [2250, 1555, 'A3'],
    [650, 1050, 'A2'],
  ] as [number, number, string][]) {
    const r = R[road];
    if (!r) continue;
    const s = sOn(r, x, z);
    const p = b.at(r, s);
    const side = 1;
    const off = r.width / 2 + 3;
    b.prop('bus_stop', p.x - p.tz * side * off, p.z + p.tx * side * off, rotYFacing(p.tz * side, -p.tx * side));
  }
}
