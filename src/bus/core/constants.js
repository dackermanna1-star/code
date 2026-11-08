// =============================================================================
// COACH ROAD TRIP — shared physical constants and the coach geometry contract.
//
// BUS-LOCAL FRAME (interior, seats, driver cockpit, exterior parts, player):
//   +X = right (door side), +Y = up, -Z = forward (towards the windscreen).
//   Origin = passenger-deck floor centreline at the middle of the body length.
//   Units: metres, seconds, radians. Right-hand traffic: the driver sits on the
//   LEFT, the doors are on the RIGHT.
//
// WORLD FRAME is the same as the flight sim (+X east, -Z north, +Y up), see
// src/world/geo.js / src/bus/world/geo.js. The bus is rendered at the origin and
// the world moves around it (floating origin, src/core/app.js).
// =============================================================================

export { DEG, G } from '../../core/constants.js';
export const KMH = 1 / 3.6;            // m/s per km/h
export const MPH = 0.44704;

// ---------------------------------------------------------------------------
// Coach body: a fictional 13.0 m three-axle high-deck intercity coach
// ("Arden Voyager 13"), 2.55 m wide, 3.65 m high, 47 passenger seats + toilet.
// ---------------------------------------------------------------------------
export const COACH = {
  make: 'Arden', model: 'Voyager 13', registration: 'CX 214 PS',
  length: 13.0,
  frontZ: -6.5,                 // front bumper / windscreen base
  rearZ: 6.5,                   // rear bumper
  width: 2.55,                  // exterior
  halfWidth: 1.275,
  innerHalfWidth: 1.19,         // inner side-wall lining at window height
  floorY: 0,                    // passenger deck
  roadY: -1.32,                 // road surface below the deck (static ride height)
  roofY: 2.33,                  // outer roof (3.65 m overall height)
  ceilingY: 2.02,               // aisle ceiling height above the deck
  rackBottomY: 1.58,            // underside of the parcel racks
  windowSillY: 0.62,            // side windows: sill and head above the deck
  windowTopY: 1.74,
  rideHeightTravel: 0.09,       // air-suspension kneel / raise range
  // driver & front area (lower platform, like a real high-decker)
  driverFloorY: -0.42,
  frontPlatformZ: [-6.35, -4.95],   // z range of the driver / door vestibule platform
  passengerDeckStartZ: -4.95,       // two steps up from the vestibule to the deck
  windscreen: { bottomY: -0.62, topY: 2.12, z: -6.42, rakeDeg: 8 },
  // axles (wheel centre z) and wheels
  axles: { frontZ: -3.85, driveZ: 2.25, tagZ: 3.62 },
  wheelRadius: 0.535,           // 295/80 R22.5
  track: 2.06,
  wheelbase: 6.1,
  // mirrors ("rabbit-ear" mirror arms at the front corners, visible from the front seats)
  mirrors: { left: [-1.42, 1.05, -6.85], right: [1.42, 1.05, -6.85] },
};

export const DOORS = {
  front: { side: 'right', z0: -6.28, z1: -5.28, kind: 'double-plug', stepsTo: COACH.driverFloorY },
  mid: { side: 'right', z0: 0.42, z1: 1.36, kind: 'single-plug', stepsTo: COACH.roadY },
};

export const ZONES = {
  driver: { xMin: -1.19, xMax: -0.18, zMin: -6.35, zMax: -4.95 },
  vestibule: { xMin: -0.18, xMax: 1.19, zMin: -6.35, zMax: -4.95 },   // front door stairs + guide seat
  midStairs: { xMin: 0.2, xMax: 1.19, zMin: 0.42, zMax: 1.36 },      // stairwell down to the mid door
  toilet: { xMin: 0.2, xMax: 1.19, zMin: 1.42, zMax: 2.42, floorY: -0.52 },
  rearWallZ: 6.05,
};

// ---------------------------------------------------------------------------
// Seating: 2+2, pitch 0.80 m. Rows 1-6 both sides, rows 7-9 left only (mid door
// + toilet on the right), rows 10-12 both sides, row 13 = rear bench of 5.
// Seat ids are '7A' style; `number` is the ticket seat number (1..47).
// row.z = Z of the seat-pan centre. Seats face -Z.
// ---------------------------------------------------------------------------
export const SEAT = {
  width: 0.45, pitch: 0.80, cushionY: 0.44, backTopY: 1.22, armrestY: 0.62, depth: 0.48,
  seatedEyeHeight: 1.15, standingEyeHeight: 1.66,
};
export const AISLE = { halfWidth: 0.21 };
const X = { A: -0.93, B: -0.47, C: 0.47, D: 0.93, M: 0 };

function buildRows() {
  const rows = [];
  const add = (row, z, letters, extra = {}) => rows.push({ row, z: Math.round(z * 1000) / 1000, letters, x: X, ...extra });
  for (let i = 0; i < 6; i++) add(i + 1, -4.55 + i * 0.8, ['A', 'B', 'C', 'D'], { front: i === 0 });
  for (let i = 0; i < 3; i++) add(7 + i, 0.25 + i * 0.8, ['A', 'B']);
  for (let i = 0; i < 3; i++) add(10 + i, 2.78 + i * 0.8, ['A', 'B', 'C', 'D']);
  add(13, 5.32, ['A', 'B', 'M', 'C', 'D'], { rearBench: true });
  return rows;
}
export const ROWS = buildRows();

export const SEAT_LIST = (() => {
  let n = 0;
  return ROWS.flatMap((r) => r.letters.map((L) => {
    n++;
    const x = r.x[L];
    return {
      id: `${r.row}${L}`, number: n, row: r.row, letter: L, x, z: r.z,
      side: x < -0.01 ? 'left' : x > 0.01 ? 'right' : 'centre',
      isWindow: L === 'A' || L === 'D', isAisle: L === 'B' || L === 'C', isCentre: L === 'M',
      front: !!r.front, rearBench: !!r.rearBench,
    };
  }));
})();

// ---------------------------------------------------------------------------
// Side window panels (bonded glass), z ranges per side. Pillars sit between
// them. The right side has the glazed front door, the mid door and the small
// frosted toilet window.
// ---------------------------------------------------------------------------
export const WINDOW_PANELS = {
  left: [[-6.2, -5.0], [-4.95, -3.25], [-3.18, -1.48], [-1.41, 0.29], [0.36, 2.06], [2.13, 3.83], [3.9, 5.75]],
  right: [[-5.2, -3.25], [-3.18, -1.48], [-1.41, 0.36], [2.48, 3.83], [3.9, 5.75]],
  rightDoorGlass: [[-6.28, -5.28], [0.42, 1.36]],
  toiletWindow: [1.55, 2.3],
};

// ---------------------------------------------------------------------------
// Operator & trip (fictional, no real branding).
// ---------------------------------------------------------------------------
export const OPERATOR = {
  name: 'Coastline Express',
  short: 'Coastline',
  service: '214',
  routeName: 'Cedar Bay – Port Solano via Hollow Pass',
  colors: { primary: '#0e3b43', secondary: '#f2b134', accent: '#e8f1ef', dark: '#08262c' },
  driver: 'Marco',
  wifi: 'Coastline-Guest',
};
