// =============================================================================
// Shared physical constants and the Boeing 737-800 geometry contract.
//
// AIRCRAFT-LOCAL FRAME (used by the cabin, seats, galley, exterior, player):
//   +X = right (starboard), +Y = up, -Z = forward (towards the nose).
//   Origin = cabin floor centreline, at the wing-root quarter-chord station.
//   Units: metres, seconds, radians (headings in the layout are compass degrees).
//
// WORLD FRAME (airports, terrain, clouds):
//   +X = east, -Z = north, +Y = up, origin = departure airport reference point.
//   compass heading 0 = north (-Z), 90 = east (+X).  yaw = -heading (radians).
//
// The cabin is rendered static at the origin; the world is moved by the inverse
// of the aircraft pose every frame ("floating origin"), see core/app.js.
// =============================================================================

export const DEG = Math.PI / 180;
export const KT = 0.514444;            // m/s per knot
export const FT = 0.3048;              // m per foot
export const FPM = FT / 60;            // m/s per foot-per-minute
export const G = 9.80665;

// ---------------------------------------------------------------------------
// Aircraft dimensions (real 737-800 values, slightly rounded)
// ---------------------------------------------------------------------------
export const AIRCRAFT = {
  type: 'Boeing 737-800',
  registration: 'N738HY',
  length: 39.47,
  wingspan: 35.79,             // with blended winglets
  tailHeight: 12.55,
  noseZ: -19.9,                // nose tip
  tailZ: 19.57,                // tail cone tip
  // Fuselage cross-section is (approximately) circular in the cabin zone.
  fuselage: {
    centerY: 0.55,             // centre of the cross-section circle above the floor
    radiusOuter: 1.88,         // outer skin (3.76 m wide)
    radiusInner: 1.76,         // inner skin / frames (3.53 m cabin width)
    liningInset: 0.07,         // sidewall lining sits ~7cm inside the frames at window height
  },
  floorY: 0,
  ceilingY: 2.16,              // centre ceiling panel height above floor (aisle)
  groundHeight: 2.62,          // floor height above ground on the gear (≈ L1 door sill height)
  // Wing (low wing; root passes under the floor)
  wing: {
    rootQuarterChordZ: 0,
    rootChord: 7.32,
    rootLeadingEdgeZ: -2.6,    // root LE station (forward of origin)
    rootTrailingEdgeZ: 4.72,
    rootY: -1.25,              // wing reference plane (root, upper surface ≈ -0.9)
    sweepDeg: 25,
    dihedralDeg: 6,
    semiSpan: 17.15,           // without winglet
    tipChord: 1.25,
    wingletHeight: 2.4,
  },
  engine: {                    // CFM56-7B, centre of the nacelle
    x: 4.93,                   // ± spanwise
    y: -1.18,                  // nacelle centreline (≈ 1.45 m above ground)
    inletZ: -7.3,              // nacelle lip station
    length: 4.7,
    fanRadius: 0.78,
    nacelleRadius: 1.02,
  },
  gear: {
    mainX: 2.86,               // ± main gear track 5.72 m
    mainZ: 2.1,
    noseZ: -15.6,
  },
};

// ---------------------------------------------------------------------------
// Doors (aircraft-local). 'z' is the door centre station; x is the inner lining.
// ---------------------------------------------------------------------------
export const DOORS = {
  L1: { side: 'left', z: -14.35, width: 0.86, height: 1.83, kind: 'entry' },
  R1: { side: 'right', z: -14.35, width: 0.76, height: 1.65, kind: 'service' },
  L2: { side: 'left', z: 12.2, width: 0.86, height: 1.83, kind: 'entry' },
  R2: { side: 'right', z: 12.2, width: 0.76, height: 1.65, kind: 'service' },
  // Type III over-wing exits (two per side)
  OWL1: { side: 'left', z: -0.566, width: 0.51, height: 0.97, kind: 'overwing', sillY: 0.48 },
  OWL2: { side: 'left', z: 0.45, width: 0.51, height: 0.97, kind: 'overwing', sillY: 0.48 },
  OWR1: { side: 'right', z: -0.566, width: 0.51, height: 0.97, kind: 'overwing', sillY: 0.48 },
  OWR2: { side: 'right', z: 0.45, width: 0.51, height: 0.97, kind: 'overwing', sillY: 0.48 },
};

// ---------------------------------------------------------------------------
// Cabin zones (aircraft-local Z ranges). Forward = more negative.
// ---------------------------------------------------------------------------
export const ZONES = {
  flightDeckDoorZ: -16.0,                // cockpit door plane (locked)
  forwardLav: { side: 'left', zMin: -16.0, zMax: -14.95, xMin: -1.62, xMax: -0.42 },
  forwardGalley: { side: 'right', zMin: -16.0, zMax: -14.95, xMin: 0.42, xMax: 1.66 },
  forwardEntry: { zMin: -14.95, zMax: -12.55 },     // L1/R1 door area, attendant jumpseat
  businessFrontBulkheadZ: -12.5,                    // partition in front of row 1
  classDividerZ: -8.32,                             // business / economy divider (curtain + partial wall)
  aftLavs: { zMin: 10.56, zMax: 11.62, left: { xMin: -1.62, xMax: -0.38 }, right: { xMin: 0.38, xMax: 1.62 } },
  aftEntry: { zMin: 11.62, zMax: 12.78 },            // L2/R2 door area
  aftGalley: { zMin: 12.78, zMax: 14.05 },
  aftBulkheadZ: 14.05,
};

// ---------------------------------------------------------------------------
// Seating layout. Business rows 1-4 (2-2), economy rows 6-29 skipping 13 (3-3).
// Row 16 and 17 are over-wing exit rows (extra legroom).
// row.z = Z of the seat-pan centre (top of cushion).  Seats face -Z.
// ---------------------------------------------------------------------------
export const SEAT = {
  economy: { width: 0.432, pitch: 0.775, cushionY: 0.45, backTopY: 1.13, armrestY: 0.63, depth: 0.47 },
  business: { width: 0.53, pitch: 0.965, cushionY: 0.46, backTopY: 1.16, armrestY: 0.65, depth: 0.52 },
  seatedEyeHeight: 1.16,       // above floor (relative to seat-pan centre ~ +0.10 z rearwards)
  standingEyeHeight: 1.66,
};

const ECON_X = { A: -1.425, B: -0.965, C: -0.505, D: 0.505, E: 0.965, F: 1.425 };
const BUS_X = { A: -1.27, C: -0.71, D: 0.71, F: 1.27 };

function buildRows() {
  const rows = [];
  const busZ0 = -11.8;
  for (let i = 0; i < 4; i++) {
    rows.push({
      row: i + 1, cls: 'business', z: Math.round((busZ0 + i * SEAT.business.pitch) * 1000) / 1000, pitch: SEAT.business.pitch,
      letters: ['A', 'C', 'D', 'F'], x: BUS_X, exitRow: false, bulkheadInFront: i === 0,
    });
  }
  const econNumbers = [6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29];
  let z = -7.266;
  for (let k = 0; k < econNumbers.length; k++) {
    const n = econNumbers[k];
    if (k > 0) z += SEAT.economy.pitch;
    // extra legroom at the over-wing exits: the legroom gaps in front of rows 16
    // and 17 line up with the two exit hatches (z = -0.566 and z = 0.45)
    if (n === 16) z += 0.175;
    if (n === 17) z += 0.241;
    rows.push({
      row: n, cls: 'economy', z: Math.round(z * 1000) / 1000, pitch: SEAT.economy.pitch,
      letters: ['A', 'B', 'C', 'D', 'E', 'F'], x: ECON_X, exitRow: n === 16 || n === 17, bulkheadInFront: n === 6,
    });
  }
  return rows;
}

export const ROWS = buildRows();
export const AISLE = { halfWidth: 0.245, businessHalfWidth: 0.4 }; // clear aisle half-width at floor level

/** All seats as flat descriptors (no Three.js objects). The seats module builds meshes from these. */
export const SEAT_LIST = ROWS.flatMap((r) => r.letters.map((L) => {
  const x = r.x[L];
  const left = x < 0;
  const isWindow = L === 'A' || L === 'F';
  const isAisle = r.cls === 'business' ? (L === 'C' || L === 'D') : (L === 'C' || L === 'D');
  return {
    id: `${r.row}${L}`, row: r.row, letter: L, cls: r.cls, side: left ? 'left' : 'right',
    x, z: r.z, isWindow, isAisle, isMiddle: !isWindow && !isAisle, exitRow: r.exitRow,
    bulkheadInFront: r.bulkheadInFront,
  };
}));

// ---------------------------------------------------------------------------
// Passenger windows: 0.508 m (20 in) frame pitch. Windows are deliberately NOT
// aligned with the seat rows (just like the real aircraft).
// The over-wing exit hatches replace the windows at their stations (the hatch
// carries its own window).
// ---------------------------------------------------------------------------
export const WINDOW = {
  pitch: 0.508,
  centerY: 1.03,               // window centre above floor
  paneWidth: 0.265, paneHeight: 0.37,           // outer pane visible size
  revealWidth: 0.33, revealHeight: 0.47,        // opening in the sidewall lining
};

function buildWindows() {
  const list = [];
  const hatchZ = [DOORS.OWL1.z, DOORS.OWL2.z];
  for (let i = 0; i < 46; i++) {
    const z = Math.round((-12.25 + i * WINDOW.pitch) * 1000) / 1000;
    if (z > 10.45) break;
    const hatch = hatchZ.some((hz) => Math.abs(hz - z) < 0.26);
    for (const side of ['left', 'right']) list.push({ index: i, z, side, inHatch: hatch });
  }
  return list;
}
export const WINDOWS = buildWindows();

/** Inner skin half-width at height y above the floor (circle approximation). */
export function innerHalfWidthAt(y, inset = 0) {
  const r = AIRCRAFT.fuselage.radiusInner - inset;
  const dy = y - AIRCRAFT.fuselage.centerY;
  return dy * dy >= r * r ? 0 : Math.sqrt(r * r - dy * dy);
}
export function outerHalfWidthAt(y) {
  const r = AIRCRAFT.fuselage.radiusOuter;
  const dy = y - AIRCRAFT.fuselage.centerY;
  return dy * dy >= r * r ? 0 : Math.sqrt(r * r - dy * dy);
}

// ---------------------------------------------------------------------------
// Fictional airline & route (no real branding).
// ---------------------------------------------------------------------------
export const AIRLINE = {
  name: 'Halcyon Airways',
  shortName: 'Halcyon',
  code: 'HN',
  flightNumber: 'HN 482',
  callsign: 'Halcyon four-eight-two',
  colors: { primary: '#0b2a4a', secondary: '#1f7a8c', accent: '#e8b04b', light: '#f3f1ea' },
  captain: 'Captain Daniel Reyes',
  firstOfficer: 'First Officer Grace Okafor',
  purser: 'Maya',
};

// Render layers (bitmask channels on Object3D.layers) – mostly informational;
// the pipeline separates the outside and cabin via two Scenes.
export const LAYERS = { DEFAULT: 0, NO_CINEMATIC: 1, NO_FIRST_PERSON: 2 };
