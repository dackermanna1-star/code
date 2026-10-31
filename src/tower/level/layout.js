// LAST LOOKOUT — the level: a dead farm valley round a fire-lookout tower. Pure data + helpers:
// no THREE, no DOM (the tests and the zombies' flow field import it in Node).
//
// Axes: +X east, -Z north, +Y up; the tower stands at the origin; flat ground at y = 0 over the
// playfield. The sun sets in the west (-X), behind the burnt village's church steeple.
//
//   north  (-Z)   farm (barn, silo, windmill, hay field) up the dirt road; orchard to the NW
//   west   (-X)   cornfield, then the burnt village of Hollow Creek (church, cemetery, water tower)
//   east   (+X)   the highway and the Last Chance gas station; pasture beyond
//   south  (+Z)   the river crossing the valley (two bridges: the concrete highway bridge and the
//                 wooden farm bridge), fields and the south woods beyond it
//
// `LAYOUT` follows CONTRACTS.md section 1. Extra keys used by the scene (and free for the core):
// `bridges`, `river`, `scenery` (everything the meshes are built from), `tower.cabin/balcony`
// details, `floodlightMounts[].aim`.

const S = 7.5; // compound half-size
const PI = Math.PI;

// ---------------------------------------------------------------------------------------------
// The river: a meandering channel from west to east, ~105-145 m south of the tower. Flat (running
// due east) under the two bridges so the decks are straight north-south spans.

const RIVER_PTS = [
  [-760, 70], [-560, 84], [-420, 88], [-330, 94], [-260, 103], [-200, 122], [-140, 134], [-95, 125],
  [-67, 115], [-55, 115], [-43, 115], [-10, 109], [25, 113], [48, 122], [60, 122], [72, 122],
  [105, 133], [150, 140], [200, 128], [260, 117], [330, 112], [420, 106], [560, 96], [760, 84],
];
const BRIDGE_X = [-55, 60];
const WATER_Y = -0.5; // water surface (the ground plane stays at y = 0; the channel is cut below it)

function smooth01(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** River centreline z at x (monotone cubic Hermite through RIVER_PTS). */
export function riverZ(x) {
  const P = RIVER_PTS;
  if (x <= P[0][0]) return P[0][1];
  if (x >= P[P.length - 1][0]) return P[P.length - 1][1];
  let i = 0;
  while (i < P.length - 2 && x > P[i + 1][0]) i++;
  const [x0, z0] = P[i], [x1, z1] = P[i + 1];
  const m = (k) => {
    const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)];
    return (b[1] - a[1]) / (b[0] - a[0]);
  };
  const h = x1 - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * z0 + (t3 - 2 * t2 + t) * h * m(i) + (-2 * t3 + 3 * t2) * z1 + (t3 - t2) * h * m(i + 1);
}

/** Half-width of the open water at x (the waterline), narrower at the bridges. */
export function riverW(x) {
  let w = 8.8 + 1.7 * Math.sin(x * 0.021 + 0.7) + 0.9 * Math.sin(x * 0.057 + 2.1);
  for (const bx of BRIDGE_X) w = 6.4 + (w - 6.4) * smooth01(7, 30, Math.abs(x - bx));
  return w;
}

/**
 * Ground height of the river channel at (x, z): 0 on the banks' tops, the waterline at |dz| = W,
 * the bed 1.8 m down. (The playfield is otherwise flat; the hills beyond it are the scene's.)
 */
export function channelY(x, z) {
  const W = riverW(x), d = Math.abs(z - riverZ(x));
  if (d >= W + 2.4) return 0;
  if (d >= W) return WATER_Y * smooth01(W + 2.4, W, d);
  return WATER_Y - 1.3 * smooth01(W, W - 2.6, d);
}

/** Axis-aligned water rects: x-slabs covering |z - riverZ| < W + 0.3, merged while tight; the
 *  bridge decks' x-ranges are slab edges so a deck covers whole slabs. */
function waterRects(x0, x1, bridges) {
  const span = (xa, xb) => {
    let lo = Infinity, hi = -Infinity;
    for (let x = xa; x <= xb + 1e-6; x += 0.25) {
      const zc = riverZ(x), w = riverW(x) + 0.3;
      lo = Math.min(lo, zc - w);
      hi = Math.max(hi, zc + w);
    }
    return [lo, hi];
  };
  const edges = [];
  for (const b of bridges) edges.push(b.x - b.half, b.x + b.half);
  const cuts = new Set(edges);
  for (let x = x0; x <= x1; x += 2) cuts.add(x);
  const xs = [...cuts].filter((x) => x >= x0 && x <= x1).sort((a, b) => a - b);
  const out = [];
  let cur = null;
  for (let k = 0; k < xs.length - 1; k++) {
    const [lo, hi] = span(xs[k], xs[k + 1]);
    const s = { minX: xs[k], maxX: xs[k + 1], minZ: lo, maxZ: hi };
    if (cur) {
      const atEdge = edges.some((e) => Math.abs(s.minX - e) < 1e-6);
      const mlo = Math.min(cur.minZ, lo), mhi = Math.max(cur.maxZ, hi);
      const slack = Math.max(mhi - mlo - (cur.maxZ - cur.minZ), mhi - mlo - (hi - lo));
      if (!atEdge && slack < 1.5 && s.maxX - cur.minX <= 30) {
        cur = { minX: cur.minX, maxX: s.maxX, minZ: mlo, maxZ: mhi };
        continue;
      }
      out.push(cur);
    }
    cur = s;
  }
  out.push(cur);
  for (const r of out) { r.minZ = Math.floor(r.minZ * 100) / 100; r.maxZ = Math.ceil(r.maxZ * 100) / 100; }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Scenery (what the meshes are built from). Building yaw: rotation about +Y (THREE rotation.y);
// a building's front (door side) is its local +Z, i.e. world (sin yaw, cos yaw).

/** yaw that turns local +Z toward (tx, tz) from (x, z) */
function face(x, z, tx = 0, tz = 0) {
  return Math.atan2(tx - x, tz - z);
}

const BRIDGES = [
  { id: 'farm', kind: 'wood', x: -55, z0: riverZ(-55) - 12, z1: riverZ(-55) + 12, half: 2.6 },
  { id: 'highway', kind: 'concrete', x: 60, z0: riverZ(60) - 12.5, z1: riverZ(60) + 12.5, half: 4.3 },
];

const ROADS = [
  {
    id: 'highway', kind: 'asphalt', width: 7.2,
    pts: [[-40, 380], [-16, 292], [5, 238], [28, 192], [48, 160], [58, 142], [60, BRIDGES[1].z1 + 2], [60, BRIDGES[1].z0 - 2],
      [62, 96], [69, 72], [80, 38], [88, 4], [93, -36], [97, -80], [100, -130], [102, -190], [104, -250], [106, -320], [108, -400]],
  },
  { id: 'north', kind: 'dirt', width: 4.6, pts: [[0, -S], [0, -28], [2, -55], [5, -80], [4, -118], [-1, -160], [-5, -205], [-8, -250], [-11, -330], [-14, -400]] },
  { id: 'west', kind: 'dirt', width: 4.8, pts: [[-S, 0], [-34, 0], [-70, -3], [-110, -6], [-150, -7], [-190, -5], [-230, -3], [-280, 0], [-340, 4], [-400, 8]] },
  {
    id: 'south', kind: 'dirt', width: 4.4,
    pts: [[0, S], [0, 28], [-8, 52], [-26, 76], [-44, 91], [-55, BRIDGES[0].z0 - 3], [-55, BRIDGES[0].z0], [-55, BRIDGES[0].z1], [-55, BRIDGES[0].z1 + 3],
      [-57, 146], [-66, 172], [-82, 204], [-96, 236], [-112, 300], [-126, 380]],
  },
  { id: 'east', kind: 'dirt', width: 4.4, pts: [[S, 0], [30, 1], [58, 3], [86, 5]] },
  { id: 'farmyard', kind: 'track', width: 3.4, pts: [[5, -80], [20, -86], [38, -92], [44, -103]] },
  { id: 'orchard', kind: 'track', width: 3.0, pts: [[-78, -4], [-80, -40], [-84, -80], [-88, -150], [-92, -200]] },
  { id: 'corn', kind: 'track', width: 3.0, pts: [[-92, -6], [-92, 40], [-90, 80]] },
  { id: 'pasture', kind: 'track', width: 3.0, pts: [[90, 22], [130, 30], [150, 46]] },
];

const BUILDINGS = [
  // the farm, north up the dirt road
  { id: 'farmhouse', type: 'house', pos: [24, -72], yaw: -PI / 2, size: [9, 7, 5.6], storeys: 2, wall: 'clapboard', roof: 'shingle', porch: true, chimney: true, burnt: 0.15, help: true },
  { id: 'barn', type: 'barn', pos: [52, -104], yaw: -PI / 2, size: [12, 18, 7] },
  { id: 'shed', type: 'shed', pos: [34, -97], yaw: 0, size: [10, 6, 4] },
  // the Miller place by the orchard (burnt)
  { id: 'miller', type: 'house', pos: [-60, -72], yaw: 0.08, size: [8, 7, 5.2], storeys: 2, wall: 'planks', roof: 'shingle', burnt: 0.85, chimney: true },
  // the gas station
  { id: 'gasShop', type: 'shop', pos: [123, 3], yaw: -PI / 2, size: [13, 8, 4.2], sign: 'LAST CHANCE' },
  // Hollow Creek (west)
  { id: 'church', type: 'church', pos: [-206, -32], yaw: PI / 2, size: [9, 18, 6.5] },
  { id: 'h1', type: 'house', pos: [-158, -22], yaw: 0, size: [8, 7, 5.2], storeys: 2, wall: 'clapboard', roof: 'shingle', burnt: 0.9 },
  { id: 'h2', type: 'house', pos: [-175, -23], yaw: 0.04, size: [7.5, 6.5, 3], storeys: 1, wall: 'planks', roof: 'shingle', burnt: 0.6, porch: true },
  { id: 'h3', type: 'house', pos: [-160, 21], yaw: PI, size: [9, 7, 5.6], storeys: 2, wall: 'brick', roof: 'shingle', burnt: 0.5, chimney: true },
  { id: 'store', type: 'store', pos: [-177, 23], yaw: PI, size: [10, 12, 4.6], sign: 'GENERAL STORE' },
  { id: 'h5', type: 'house', pos: [-191, 21], yaw: PI - 0.05, size: [7, 6.5, 3.1], storeys: 1, wall: 'planks', roof: 'shingle', burnt: 1 },
  { id: 'h6', type: 'house', pos: [-229, -25], yaw: 0.1, size: [8, 7, 5], storeys: 2, wall: 'clapboard', roof: 'shingle', burnt: 0.95 },
  { id: 'h7', type: 'house', pos: [-232, 20], yaw: PI + 0.06, size: [8, 7, 5.2], storeys: 2, wall: 'brick', roof: 'shingle', burnt: 0.7 },
  { id: 'crypt', type: 'crypt', pos: [-217, 41], yaw: PI / 2, size: [4, 5, 3.2] },
  // south of the river: a lone farmhouse
  { id: 'southFarm', type: 'house', pos: [-22, 178], yaw: PI, size: [8.5, 7, 5.4], storeys: 2, wall: 'clapboard', roof: 'shingle', burnt: 0.4, chimney: true },
  // the east pasture's cattle shelter
  { id: 'shelter', type: 'shelter', pos: [150, 52], yaw: -PI / 2 + 0.1, size: [10, 5, 3.2] },
];

const SILOS = [
  { pos: [67, -95], r: 3.2, h: 16 },
  { pos: [66, -84.5], r: 2.3, h: 11 },
];

const WATER_TOWER = { pos: [-168, 48], h: 15, r: 3.6, text: 'HOLLOW CREEK' };
const WINDMILL = { pos: [20, -117], h: 12 };
const GAS = {
  canopy: { pos: [104, 3], yaw: -PI / 2, size: [15, 9], h: 5.2 },
  pumps: [[104, -1.5], [104, 7.5]],
  tanks: [{ pos: [130, -15], yaw: 0, len: 7, r: 1.3, label: 'DIESEL' }, { pos: [130, -9], yaw: 0, len: 7, r: 1.3, label: 'UNLEADED' }],
  sign: { pos: [93, 27], h: 9 },
};

// Car wrecks: type, pos, yaw (local +X = the car's length, i.e. its nose points to local +X).
const WRECKS = [
  { type: 'pickup', pos: [-5.0, -5.0], yaw: PI / 4, color: [0.42, 0.47, 0.5], inside: true },
  { type: 'police', pos: [6, 33], yaw: 2.4, color: [0.12, 0.12, 0.14], burnt: 0 },
  { type: 'sedan', pos: [26, -3.2], yaw: 1.42, color: [0.4, 0.1, 0.08], burnt: 1 },
  { type: 'sedan', pos: [-58, 4.2], yaw: -1.9, color: [0.55, 0.52, 0.36], burnt: 0.2 },
  { type: 'semi', pos: [95.5, -47], yaw: -1.25, color: [0.6, 0.12, 0.08] },
  { type: 'trailer', pos: [91.5, -62], yaw: -0.65, color: [0.62, 0.6, 0.55] },
  { type: 'sedan', pos: [84.5, 33], yaw: -1.2, color: [0.2, 0.32, 0.45], burnt: 0 },
  { type: 'van', pos: [72.5, 69], yaw: -1.8, color: [0.7, 0.68, 0.6], burnt: 0.3 },
  { type: 'sedan', pos: [61.8, BRIDGES[1].z0 + 9], yaw: PI / 2 + 0.12, color: [0.32, 0.36, 0.25], burnt: 0 },
  { type: 'pickup', pos: [101.5, -148], yaw: -1.6, color: [0.5, 0.36, 0.2], burnt: 0.5 },
  { type: 'bus', pos: [-141, -4.5], yaw: 0.22, color: [0.85, 0.62, 0.1], burnt: 0.4 },
  { type: 'sedan', pos: [-197, -1.5], yaw: 2.9, color: [0.3, 0.3, 0.32], burnt: 1 },
  { type: 'sedan', pos: [99.5, 10.5], yaw: PI / 2 + 0.06, color: [0.6, 0.6, 0.62], burnt: 0.7 },
  { type: 'tractor', pos: [13, -63], yaw: 0.6, color: [0.25, 0.4, 0.18] },
];

// Concrete road barriers (jersey) and sandbag walls outside the compound.
const BARRIERS = [
  { type: 'jersey', pos: [-3.6, -24], yaw: 0.12 }, { type: 'jersey', pos: [4.2, -21], yaw: -0.2 },
  { type: 'jersey', pos: [24, -3.8], yaw: PI / 2 + 0.1 }, { type: 'jersey', pos: [-22, 4.4], yaw: PI / 2 - 0.15 },
  { type: 'jersey', pos: [99, -108], yaw: 0.2 }, { type: 'jersey', pos: [95.5, -113], yaw: 0.5 },
  { type: 'sandbags', pos: [-4.5, 20], yaw: 0.2, len: 4 }, { type: 'sandbags', pos: [19, 6.5], yaw: PI / 2, len: 3.5 },
];

// Round hay bales in the mown field NE of the tower (r = 0.8 m, lying on their side).
const BALES = [[36, -36, 0.3], [47, -44, 1.2], [58, -33, 2.0], [66, -52, 0.6], [44, -58, 2.6], [76, -40, 1.6], [79, -60, 0.1], [55, -64, 2.2], [33, -50, 1.0]];

const FIELDS = [
  // kind: corn | stubble | plough | hay | pasture | fallow ; rect + row direction (rad, 0 = rows along x)
  { kind: 'corn', minX: -140, maxX: -95.5, minZ: 12, maxZ: 74, rows: PI / 2 },
  { kind: 'corn', minX: -88.5, maxX: -46, minZ: 12, maxZ: 74, rows: PI / 2 },
  { kind: 'hay', minX: 28, maxX: 86, minZ: -68, maxZ: -28, rows: 0.15 },
  { kind: 'plough', minX: -44, maxX: -12, minZ: -64, maxZ: -24, rows: 0 },
  { kind: 'stubble', minX: 12, maxX: 52, minZ: 20, maxZ: 70, rows: 0.3 },
  { kind: 'plough', minX: -40, maxX: 30, minZ: 150, maxZ: 210, rows: PI / 2 },
  { kind: 'stubble', minX: -150, maxX: -75, minZ: 155, maxZ: 205, rows: 0.4 },
  { kind: 'stubble', minX: 70, maxX: 160, minZ: 155, maxZ: 210, rows: 0 },
  { kind: 'pasture', minX: 112, maxX: 225, minZ: -130, maxZ: 90, rows: 0 },
  { kind: 'fallow', minX: -60, maxX: -14, minZ: 20, maxZ: 60, rows: 0.2 },
  { kind: 'stubble', minX: 18, maxX: 60, minZ: -150, maxZ: -118, rows: 0 },
];

const ORCHARD = { minX: -140, maxX: -92, minZ: -150, maxZ: -88, dx: 7, dz: 6 };
const CEMETERY = { minX: -224, maxX: -196, minZ: 17, maxZ: 46 };

// Rail fences (mesh + a few colliders where they shape the walk).
const RAIL_FENCES = [
  { pts: [[28, -26], [88, -26]], broken: 0.25 },
  { pts: [[28, -26], [28, -64]], broken: 0.3 },
  { pts: [[10, -92], [10, -132], [60, -132]], broken: 0.2 },
  { pts: [[112, -128], [112, -10]], broken: 0.35 },
  { pts: [[112, 16], [112, 92], [226, 92]], broken: 0.3 },
  { pts: [[-140, -152], [-90, -152]], broken: 0.4 },
  { pts: [[-142, 10], [-142, 76], [-44, 76]], broken: 0.5 },
];

// Power lines: poles along a polyline at a spacing; wires sag between them.
const POWER_LINES = [
  { pts: [[96, 250], [70, 140], [74, 96], [96, 4], [104, -90], [110, -250], [112, -330]], spacing: 46 },
  { pts: [[-12, -10], [-60, -12], [-110, -14], [-160, -15], [-200, -13], [-250, -11], [-330, -8]], spacing: 44 },
  { pts: [[8, -12], [9, -60], [16, -82]], spacing: 36 },
];

// Fake light pools that switch on at night (no real light: an emissive lamp + an additive pool).
const LAMPS = [
  { kind: 'sodium', pos: [91, 8.5, -12], pole: true, radius: 13 },
  { kind: 'fluoro', pos: [104, 5.0, 3], pole: false, radius: 11, flicker: 0.3 },
  { kind: 'sodium', pos: [38, 7.5, -90], pole: true, radius: 11 },
  { kind: 'sodium', pos: [-166, 7.5, -11], pole: true, radius: 10, flicker: 1 },
  { kind: 'work', pos: [5.2, 3.3, 3.4], pole: true, radius: 9 },
];

// Window lights (warm glows at night): building id + which wall + count; a candle flicker in the church.
const WINDOW_LIGHTS = [
  { building: 'church', kind: 'candle' },
  { building: 'farmhouse', kind: 'lamp' },
  { building: 'h3', kind: 'candle' },
];

// Crow roosts: where the flocks sit (and come back to after a scare).
const ROOSTS = [
  { id: 'scarecrow', pos: [-112, 2.1, 42], spread: 6, n: 7, ground: true },
  { id: 'barn', pos: [52, 11.2, -104], spread: 7, n: 6 },
  { id: 'church', pos: [-206, 10.6, -32], spread: 6, n: 6 },
  { id: 'wires', pos: [-60, 7.3, -12], spread: 12, n: 8, line: true },
  { id: 'fence', pos: [0, 2.3, 7.6], spread: 6, n: 5 },
  { id: 'deadtree', pos: [150, 7.5, -64], spread: 3, n: 5 },
  { id: 'canopy', pos: [104, 5.6, 3], spread: 5, n: 4 },
  { id: 'field', pos: [-30, 0.05, -44], spread: 12, n: 8, ground: true },
];

// Loose trees on the playfield (big ones: mesh; the woods ring is generated by the scene).
const LONE_TREES = [
  { pos: [150, -64], kind: 'dead', h: 11 },
  { pos: [-24, -16], kind: 'oak', h: 9 },
  { pos: [30, -112], kind: 'oak', h: 10 },
  { pos: [40, -66], kind: 'oak', h: 8.5 },
  { pos: [-215, 30], kind: 'dead', h: 9 },
  { pos: [-150, 42], kind: 'oak', h: 10 },
  { pos: [-30, 30], kind: 'birch', h: 8 },
  { pos: [-36, 36], kind: 'birch', h: 7 },
  { pos: [130, -40], kind: 'oak', h: 9.5 },
  { pos: [70, -16], kind: 'dead', h: 7 },
  { pos: [-48, 110], kind: 'willow', h: 9 },
  { pos: [-66, 108], kind: 'willow', h: 8 },
  { pos: [82, 112], kind: 'willow', h: 10 },
  { pos: [20, 104], kind: 'willow', h: 8.5 },
  { pos: [-118, 128], kind: 'willow', h: 9 },
  { pos: [-170, -48], kind: 'oak', h: 10 },
];

// ---------------------------------------------------------------------------------------------
// Static colliders (<= 150 boxes): only what zombies and ragdolls touch.

const colliders = [];
function box(c, h, yaw, kind, material, extra) {
  const o = { c, h, yaw: yaw || 0, kind, material };
  if (extra) Object.assign(o, extra);
  colliders.push(o);
  return o;
}
const r2 = (v) => Math.round(v * 100) / 100;

// compound fence (gaps where the gates are; the gates themselves are colliders too)
for (const sx of [-1, 1]) {
  box([sx * 4.55, 1.1, S], [2.95, 1.1, 0.06], 0, 'fence', 'metal');
  box([sx * 4.55, 1.1, -S], [2.95, 1.1, 0.06], 0, 'fence', 'metal');
  box([S, 1.1, sx * 4.55], [0.06, 1.1, 2.95], 0, 'fence', 'metal');
  box([-S, 1.1, sx * 4.55], [0.06, 1.1, 2.95], 0, 'fence', 'metal');
}
box([0, 1.1, S], [1.6, 1.1, 0.08], 0, 'gate', 'wood', { gate: 'south' });
box([0, 1.1, -S], [1.6, 1.1, 0.08], 0, 'gate', 'wood', { gate: 'north' });
box([S, 1.1, 0], [0.08, 1.1, 1.6], 0, 'gate', 'wood', { gate: 'east' });
box([-S, 1.1, 0], [0.08, 1.1, 1.6], 0, 'gate', 'wood', { gate: 'west' });

// tower legs (feet)
const LEG = 3.0;
for (const [x, z] of [[-LEG, -LEG], [LEG, -LEG], [LEG, LEG], [-LEG, LEG]]) box([x, 1.5, z], [0.16, 1.5, 0.16], 0, 'leg', 'metal');

// inside the compound: the generator in its sandbag ring, crates, the water tank
box([5.1, 0.55, 5.0], [0.95, 0.55, 0.6], 0, 'generator', 'metal');
box([3.9, 0.45, 6.3], [0.25, 0.45, 0.9], 0, 'sandbags', 'wood');
box([6.4, 0.45, 3.7], [0.9, 0.45, 0.25], 0, 'sandbags', 'wood');
box([-5.2, 0.5, 5.4], [1.1, 0.5, 0.8], 0.15, 'crates', 'wood');
box([5.2, 0.85, -5.3], [0.85, 0.85, 0.85], 0, 'tank', 'metal');

// buildings
for (const b of BUILDINGS) {
  const [w, d, h] = b.size;
  const mat = b.wall === 'brick' || b.type === 'crypt' || b.type === 'shop' || b.type === 'store' ? 'brick' : 'wood';
  if (b.type === 'church') {
    box([b.pos[0], h / 2, b.pos[1]], [w / 2, h / 2, d / 2], b.yaw, 'building', 'wood', { id: b.id });
    // the steeple at the front (east) end
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    box([r2(b.pos[0] + fx * (d / 2 + 1.9)), 4, r2(b.pos[1] + fz * (d / 2 + 1.9))], [2, 4, 2], b.yaw, 'building', 'wood', { id: 'steeple' });
    continue;
  }
  if (b.type === 'shelter') {
    // open-fronted: back wall + two posts at the front
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
    box([r2(b.pos[0] - fx * (d / 2 - 0.15)), h / 2, r2(b.pos[1] - fz * (d / 2 - 0.15))], [w / 2, h / 2, 0.15], b.yaw, 'wall', 'wood');
    for (const s of [-1, 1]) box([r2(b.pos[0] + fx * (d / 2 - 0.2) + rx * s * (w / 2 - 0.2)), h / 2, r2(b.pos[1] + fz * (d / 2 - 0.2) + rz * s * (w / 2 - 0.2))], [0.15, h / 2, 0.15], b.yaw, 'post', 'wood');
    continue;
  }
  if (b.type === 'shed') {
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    box([r2(b.pos[0] - fx * (d / 2 - 0.15)), h / 2, r2(b.pos[1] - fz * (d / 2 - 0.15))], [w / 2, h / 2, 0.15], b.yaw, 'wall', 'metal');
    continue;
  }
  box([b.pos[0], h / 2, b.pos[1]], [w / 2, h / 2, d / 2], b.yaw, 'building', mat, { id: b.id });
}
for (const s of SILOS) box([s.pos[0], s.h / 2, s.pos[1]], [s.r * 0.9, s.h / 2, s.r * 0.9], PI / 4, 'silo', 'concrete');
// water tower and windmill legs: one box each round the four feet would block the gaps; use the
// feet themselves
for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
  box([r2(WATER_TOWER.pos[0] + ox * 2.6), 1.2, r2(WATER_TOWER.pos[1] + oz * 2.6)], [0.25, 1.2, 0.25], 0, 'post', 'metal');
}
box([WINDMILL.pos[0], 1, WINDMILL.pos[1]], [1.3, 1, 1.3], 0, 'windmill', 'metal');

// gas station: the canopy's pillars, the pump islands, the tanks, the sign's pole
{
  const c = GAS.canopy;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box([r2(c.pos[0] + sx * 3.2), c.h / 2, r2(c.pos[1] + sz * 5.4)], [0.25, c.h / 2, 0.25], 0, 'pillar', 'concrete');
  for (const p of GAS.pumps) box([p[0], 0.75, p[1]], [0.7, 0.75, 1.7], 0, 'pumps', 'metal');
  for (const t of GAS.tanks) box([t.pos[0], t.r + 0.4, t.pos[1]], [t.len / 2, t.r + 0.4, t.r], t.yaw, 'tank', 'metal');
  box([GAS.sign.pos[0], 1.5, GAS.sign.pos[1]], [0.3, 1.5, 0.3], 0, 'post', 'metal');
}

// wrecks (local +X = length)
const CAR_DIMS = {
  sedan: [2.3, 0.72, 0.92], police: [2.4, 0.72, 0.94], pickup: [2.6, 0.9, 1.0], van: [2.5, 1.1, 1.0],
  semi: [3.1, 1.6, 1.25], trailer: [6.6, 1.95, 1.3], bus: [5.6, 1.5, 1.25], tractor: [1.9, 1.3, 1.1],
};
for (const w of WRECKS) {
  const d = CAR_DIMS[w.type];
  box([w.pos[0], d[1], w.pos[1]], [d[0], d[1], d[2]], w.yaw, 'car', 'metal', { wreck: w.type });
}
for (const b of BARRIERS) {
  if (b.type === 'jersey') box([b.pos[0], 0.42, b.pos[1]], [1.9, 0.42, 0.32], b.yaw, 'barrier', 'concrete');
  else box([b.pos[0], 0.45, b.pos[1]], [b.len / 2, 0.45, 0.4], b.yaw, 'sandbags', 'wood');
}
// bridges: the rails (decks are flush with the ground)
for (const b of BRIDGES) {
  const hz = (b.z1 - b.z0) / 2, cz = (b.z0 + b.z1) / 2;
  const hy = b.kind === 'concrete' ? 0.5 : 0.55, hw = b.kind === 'concrete' ? 0.22 : 0.12;
  for (const s of [-1, 1]) box([r2(b.x + s * (b.half - hw)), hy, r2(cz)], [hw, hy, r2(hz)], 0, 'rail', b.kind === 'concrete' ? 'concrete' : 'wood');
}
for (const [x, z] of BALES) box([x, 0.8, z], [0.75, 0.8, 0.75], 0, 'hay', 'wood');
// cemetery wall (low stone wall with a gap facing the road) and the big dead tree
{
  const C = CEMETERY, cx = (C.minX + C.maxX) / 2;
  box([cx, 0.45, C.maxZ], [(C.maxX - C.minX) / 2, 0.45, 0.25], 0, 'wall', 'concrete');
  box([C.minX, 0.45, (C.minZ + C.maxZ) / 2], [0.25, 0.45, (C.maxZ - C.minZ) / 2], 0, 'wall', 'concrete');
  box([C.maxX, 0.45, (C.minZ + C.maxZ) / 2], [0.25, 0.45, (C.maxZ - C.minZ) / 2], 0, 'wall', 'concrete');
  // the north wall has the churchyard gate (x -212..-208) facing the road
  box([(C.minX - 212) / 2, 0.45, C.minZ], [(-212 - C.minX) / 2, 0.45, 0.25], 0, 'wall', 'concrete');
  box([(C.maxX - 208) / 2, 0.45, C.minZ], [(C.maxX + 208) / 2, 0.45, 0.25], 0, 'wall', 'concrete');
}
box([150, 2, -64], [0.45, 2, 0.45], 0, 'tree', 'wood');
// the barn's yard fence (shapes the walk round the farm)
box([35, 0.6, -132], [25, 0.6, 0.08], 0, 'fence', 'wood');
box([10, 0.6, -112], [0.08, 0.6, 20], 0, 'fence', 'wood');
// the trailer (camper) burnt out near the compound, and the outhouse
box([-27, 1.3, -26], [3.4, 1.3, 1.2], 0.5, 'trailer', 'metal');
box([13, 1.1, 15], [0.65, 1.1, 0.65], 0.3, 'outhouse', 'wood');

// ---------------------------------------------------------------------------------------------

export const LAYOUT = {
  bounds: { minX: -250, maxX: 250, minZ: -250, maxZ: 250 },
  tower: {
    pos: [0, 0, 0],
    eye: [0, 22.6, 0],
    // cabin: floor at 21 m, walls 0.95 m to the sill, open windows to 2.3 m, eaves at 2.65 m.
    // The eye must lean into a window (toward its plane at |x| or |z| = half) to see down past the
    // sill and the balcony grating to the gates (they are 72 degrees below the horizon).
    cabin: { floorY: 21, half: [1.9, 1.9], sillY: 21.95, lintelY: 23.3, eavesY: 23.65, roofY: 24.75 },
    balcony: { floorY: 21, half: [2.55, 2.55], railY: 21.85 }, // a 0.65 m grating catwalk, low rail
    legs: [[-LEG, -LEG], [LEG, -LEG], [LEG, LEG], [-LEG, LEG]],
    legTop: [[-1.75, 21, -1.75], [1.75, 21, -1.75], [1.75, 21, 1.75], [-1.75, 21, 1.75]],
  },
  compound: {
    rect: { minX: -S, maxX: S, minZ: -S, maxZ: S },
    gates: [
      { id: 'south', a: [-1.6, S], b: [1.6, S], normal: [0, 1] },
      { id: 'north', a: [1.6, -S], b: [-1.6, -S], normal: [0, -1] },
      { id: 'east', a: [S, 1.6], b: [S, -1.6], normal: [1, 0] },
      { id: 'west', a: [-S, -1.6], b: [-S, 1.6], normal: [-1, 0] },
    ],
    fenceHeight: 2.2,
  },
  colliders,
  water: waterRects(-262, 262, BRIDGES),
  bridges: BRIDGES.map((b) => ({ id: b.id, kind: b.kind, minX: b.x - b.half, maxX: b.x + b.half, minZ: b.z0, maxZ: b.z1 })),
  river: { waterY: WATER_Y, bridgeX: BRIDGE_X },
  spawns: [
    { id: 'n', pos: [-6, -228], dir: [0, 1], label: 'North road' },
    { id: 'nh', pos: [103, -222], dir: [-0.42, 0.91], label: 'Highway north' },
    { id: 'ne', pos: [168, -160], dir: [-0.72, 0.69], label: 'Northeast woods' },
    { id: 'e', pos: [232, -20], dir: [-1, 0.09], label: 'East pasture' },
    { id: 'se', pos: [9, 230], dir: [-0.04, -1], label: 'Highway south' },
    { id: 's', pos: [-92, 228], dir: [0.37, -0.93], label: 'South road' },
    { id: 'sw', pos: [-175, 165], dir: [0.73, -0.69], label: 'Southwest woods' },
    { id: 'w', pos: [-236, -3], dir: [1, 0.01], label: 'Village road' },
    { id: 'cem', pos: [-210, 32], dir: [0.99, -0.15], label: 'Churchyard' },
    { id: 'nw', pos: [-165, -168], dir: [0.7, 0.71], label: 'Orchard woods' },
  ],
  cover: {
    cornfield: FIELDS.filter((f) => f.kind === 'corn').map((f) => ({ minX: f.minX, maxX: f.maxX, minZ: f.minZ, maxZ: f.maxZ })),
  },
  rangeMarkers: [], // filled below (points on the roads at 100/150/200/250 m)
  trapZones: [
    { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
    { minX: -22, maxX: 26, minZ: -150, maxZ: -60 },
    { minX: -150, maxX: -60, minZ: -22, maxZ: 12 },
    { minX: -70, maxX: 18, minZ: 60, maxZ: 103 },
    { minX: 60, maxX: 112, minZ: -110, maxZ: 106 },
  ],
  floodlightMounts: [
    { id: 'north', pos: [3.4, 6.8, -8.4], aim: [0, 0, -30] },
    { id: 'south', pos: [-3.4, 6.8, 8.4], aim: [0, 0, 30] },
    { id: 'east', pos: [8.4, 6.8, 3.4], aim: [30, 0, 0] },
    { id: 'west', pos: [-8.4, 6.8, -3.4], aim: [-30, 0, 0] },
    { id: 'bridge', pos: [-46, 7.5, 88], aim: [-55, 0, 106] },
    { id: 'junction', pos: [78, 7.5, -8], aim: [90, 0, 6] },
  ],
  // On the balcony's south-east corner. Yaw as THREE rotation.y of the gun (barrel along local
  // -Z); the cabin blocks yaw 0.15..1.43, so the arc runs from 1.55 round to 6.35 (= 0.07 + 2 pi).
  sentryMount: { pos: [2.3, 21.05, 2.3], arc: [1.55, 6.35] },
  barrelSpots: [
    [-51.4, BRIDGES[0].z0 - 6], [-58.8, BRIDGES[0].z0 - 7.5], [64.6, BRIDGES[1].z0 - 7], [55.6, BRIDGES[1].z0 - 8],
    [3.2, -58], [-46, 4.5], [32, 4.2], [4.4, 22], [99, 3],
  ],
  scenery: {
    roads: ROADS, buildings: BUILDINGS, silos: SILOS, waterTower: WATER_TOWER, windmill: WINDMILL, gas: GAS,
    wrecks: WRECKS, carDims: CAR_DIMS, barriers: BARRIERS, bales: BALES, fields: FIELDS, orchard: ORCHARD,
    cemetery: CEMETERY, railFences: RAIL_FENCES, powerLines: POWER_LINES, lamps: LAMPS, windowLights: WINDOW_LIGHTS,
    roosts: ROOSTS, trees: LONE_TREES, bridges: BRIDGES, scarecrow: [-112, 42],
  },
};

// Range markers: where each road first crosses 100/150/200/250 m from the tower; the sign stands
// at the roadside nearest the tower and faces it.
function addRangeMarkers(road, dists, side, fromEnd = false) {
  const P = fromEnd ? road.pts.slice().reverse() : road.pts;
  for (const dist of dists) {
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[i + 1];
      const d0 = Math.hypot(x0, z0), d1 = Math.hypot(x1, z1);
      if ((d0 - dist) * (d1 - dist) > 0) continue;
      // bisect along the segment
      let a = 0, b = 1;
      for (let k = 0; k < 30; k++) {
        const m = (a + b) / 2;
        const dm = Math.hypot(x0 + (x1 - x0) * m, z0 + (z1 - z0) * m);
        if ((dm - dist) * (d0 - dist) > 0) a = m; else b = m;
      }
      const x = x0 + (x1 - x0) * a, z = z0 + (z1 - z0) * a;
      const len = Math.hypot(x1 - x0, z1 - z0);
      let nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      if (nx * -x + nz * -z < 0) { nx = -nx; nz = -nz; } // the side toward the tower
      const off = road.width / 2 + side;
      LAYOUT.rangeMarkers.push({ pos: [r2(x + nx * off), r2(z + nz * off)], dist, road: road.id });
      break;
    }
  }
}
addRangeMarkers(ROADS[1], [100, 150, 200], 1.6); // north road
addRangeMarkers(ROADS[2], [100, 150, 200, 250], 1.6); // west road
addRangeMarkers(ROADS[0], [100, 150, 200, 250], 2.2, true); // highway, north of the junction

// ---------------------------------------------------------------------------------------------
// Helpers

function inWater(x, z) {
  for (const w of LAYOUT.water) if (x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ) return true; // inclusive: no seams
  return false;
}
function onBridge(x, z) {
  for (const b of LAYOUT.bridges) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
  return false;
}

/** Walkable ground for the zombies (flow field): in bounds, off the colliders, out of the water
 *  (a bridge deck is walkable over the water). Collider yaw: THREE rotation.y. */
export function isWalkable(x, z, grow = 0.35) {
  const B = LAYOUT.bounds;
  if (x < B.minX || x > B.maxX || z < B.minZ || z > B.maxZ) return false;
  if (inWater(x, z) && !onBridge(x, z)) return false;
  for (const c of LAYOUT.colliders) {
    if (c.c[1] - c.h[1] > 1.2) continue; // overhead
    const cy = Math.cos(c.yaw || 0), sy = Math.sin(c.yaw || 0);
    const dx = x - c.c[0], dz = z - c.c[2];
    const lx = dx * cy - dz * sy, lz = dx * sy + dz * cy;
    if (Math.abs(lx) < c.h[0] + grow && Math.abs(lz) < c.h[2] + grow) return false;
  }
  return true;
}

/**
 * Where the lookout's eye should be for a view direction: standing at the window he looks through
 * (0.55 m inside its plane), stepping sideways so the line of sight leaves through the window
 * rather than a corner post, and leaning out over the sill when looking down (the gates are 72
 * degrees below the horizon). yaw/pitch as a THREE camera (rotation order YXZ: yaw 0 looks north,
 * -Z; pitch < 0 looks down). The answer jumps between windows at the diagonals: smooth it over
 * ~0.15 s in the camera. Returns out = [x, y, z].
 */
export function lookoutEye(yaw, pitch, out = [0, 0, 0]) {
  const T = LAYOUT.tower, H = T.cabin.half[0];
  const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
  // leaning: from 0.55 m inside the window plane (looking level) to 0.4 m out over the sill
  // (looking straight down at the gates through the balcony grating)
  const down = Math.min(1, Math.max(0, (-pitch - 0.3) / 0.95));
  // looking straight down he leans out over the catwalk rail (eye 0.75 m past the window plane)
  const inset = H - 0.55 + 1.3 * down * down; // eye's distance from the cabin centre toward the window
  let ex, ez;
  if (Math.abs(dx) >= Math.abs(dz)) {
    const along = dz / Math.abs(dx);
    const s = along * 0.6 - along * (H - inset);
    ex = Math.sign(dx) * inset;
    ez = s;
  } else {
    const along = dx / Math.abs(dz);
    const s = along * 0.6 - along * (H - inset);
    ez = Math.sign(dz) * inset;
    ex = s;
  }
  out[0] = T.eye[0] + ex;
  out[1] = T.eye[1] - 0.32 * down * down;
  out[2] = T.eye[2] + ez;
  return out;
}

/** True over open water (not a bridge deck): bullets splash, bodies sink a little. */
export function isWater(x, z) {
  return inWater(x, z) && !onBridge(x, z);
}

/**
 * A walkability grid sampled at cell centres (same answer as isWalkable there), built by
 * rasterising the colliders instead of testing each one per cell: fast enough for 0.5 m cells.
 * Returns { minX, minZ, cell, nx, nz, data: Uint8Array (1 = walkable) }.
 */
export function buildWalkGrid(cell = 1, grow = 0.35) {
  const B = LAYOUT.bounds;
  const nx = Math.floor((B.maxX - B.minX) / cell), nz = Math.floor((B.maxZ - B.minZ) / cell);
  const data = new Uint8Array(nx * nz);
  const cx = (i) => B.minX + (i + 0.5) * cell, cz = (j) => B.minZ + (j + 0.5) * cell;
  for (let j = 0; j < nz; j++) {
    const z = cz(j);
    for (let i = 0; i < nx; i++) {
      const x = cx(i);
      data[j * nx + i] = inWater(x, z) && !onBridge(x, z) ? 0 : 1;
    }
  }
  for (const c of LAYOUT.colliders) {
    if (c.c[1] - c.h[1] > 1.2) continue;
    const cy = Math.cos(c.yaw || 0), sy = Math.sin(c.yaw || 0);
    const ex = c.h[0] + grow, ez = c.h[2] + grow;
    const rx = Math.abs(cy) * ex + Math.abs(sy) * ez, rz = Math.abs(sy) * ex + Math.abs(cy) * ez;
    const i0 = Math.max(0, Math.floor((c.c[0] - rx - B.minX) / cell - 0.5)), i1 = Math.min(nx - 1, Math.ceil((c.c[0] + rx - B.minX) / cell));
    const j0 = Math.max(0, Math.floor((c.c[2] - rz - B.minZ) / cell - 0.5)), j1 = Math.min(nz - 1, Math.ceil((c.c[2] + rz - B.minZ) / cell));
    for (let j = j0; j <= j1; j++) {
      const dz = cz(j) - c.c[2];
      for (let i = i0; i <= i1; i++) {
        const dx = cx(i) - c.c[0];
        const lx = dx * cy - dz * sy, lz = dx * sy + dz * cy;
        if (Math.abs(lx) < ex && Math.abs(lz) < ez) data[j * nx + i] = 0;
      }
    }
  }
  return { minX: B.minX, minZ: B.minZ, cell, nx, nz, data };
}
