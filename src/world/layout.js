// =============================================================================
// AIRPORT LAYOUT CONTRACT — single source of truth shared by the airport
// generator (which builds pavement, markings, lights, buildings) and the flight
// director (which drives the aircraft along the same paths).
//
// Airport-local frame: origin = runway centre, runway along local +X
// ("runway 09" points east, +X), terminal to the north (-Z). Y up, metres.
// Each airport is placed in the world by `origin` (world position of the
// airport-local origin). Both airports are at sea level (y = 0) and are NOT
// rotated relative to the world (runway heading 090 / 270 in both cases).
//
// Aircraft path points refer to the AIRCRAFT ORIGIN (floor centreline at the
// wing quarter-chord, see core/constants.js) projected on the ground.  The nose
// is ~19.9 m ahead of that point, the main gear ~2.1 m behind it.
//
// Headings are compass degrees (0 = north = -Z, 90 = east = +X).
// =============================================================================

export const RUNWAY = { length: 3000, width: 45, shoulder: 7.5, x0: -1500, x1: 1500 };
export const TAXIWAY_WIDTH = 23;
export const TAXILANE_Z = -370;      // apron taxilane centreline (behind the parked aircraft)
export const TAXIWAY_A_Z = -200;     // parallel taxiway centreline
export const HOLD_SHORT_Z = -88;     // runway holding position (aircraft origin)
export const GATE_STAND_Z = -428;    // aircraft origin when parked nose-in at a gate (nose at ≈ -448)
export const TERMINAL_FACADE_Z = -470;

/** Gate stand positions (aircraft origin, heading 0 = nose towards the terminal). */
function gates(prefix, xs) {
  return xs.map((x, i) => ({ id: `${prefix}${i + 1}`, x, z: GATE_STAND_Z, heading: 0 }));
}

export const DEPARTURE = {
  id: 'departure',
  code: 'CBY',
  name: 'Cedar Bay International',
  city: 'Cedar Bay',
  seed: 1187,
  origin: [0, 0, 0],                 // world position of the airport-local origin
  runwayIds: ['09', '27'],
  activeRunway: '09',                // departing towards +X (east)
  terrainStyle: 'farmland',          // the environment uses this to theme the region
  apron: { xMin: -720, xMax: 720, zMin: -470, zMax: -340 },
  terminal: { xMin: -640, xMax: 640, zMin: -560, zMax: -470, height: 17, style: 'glass-arc' },
  // connectors between runway / taxiway A / apron: x positions (local)
  connectors: [
    { id: 'A1', x: -1500, from: TAXIWAY_A_Z, to: 0 },
    { id: 'A2', x: -760, from: TAXIWAY_A_Z, to: 0 },
    { id: 'A3', x: 0, from: TAXIWAY_A_Z, to: 0 },
    { id: 'A4', x: 760, from: TAXIWAY_A_Z, to: 0 },
    { id: 'A5', x: 1500, from: TAXIWAY_A_Z, to: 0 },
    { id: 'B', x: -700, from: TAXILANE_Z, to: TAXIWAY_A_Z },
    { id: 'C', x: 700, from: TAXILANE_Z, to: TAXIWAY_A_Z },
  ],
  gates: gates('B', [-300, -250, -200, -150, -100, -50, 0, 50, 100, 150, 200, 250, 300]),
  ownGate: 'B7',                     // x = 0
  // which other gates have parked aircraft (the rest are empty with ground equipment)
  occupiedGates: ['B1', 'B2', 'B4', 'B5', 'B6', 'B8', 'B10', 'B11', 'B13'],
  // Departure: pushback from B7 (x = 0) tail-east, then taxi west on the taxilane,
  // south on B, west on A, south on A1 to the hold-short line, then line up 09.
  pushback: {
    // Aircraft is pushed backwards; points are the aircraft origin; final heading 270.
    points: [[0, GATE_STAND_Z], [0, TAXILANE_Z], [45, TAXILANE_Z]],
    filletRadius: 30,
    reverse: true,
    finalHeading: 270,
  },
  taxiOut: {
    points: [[45, TAXILANE_Z], [-700, TAXILANE_Z], [-700, TAXIWAY_A_Z], [-1500, TAXIWAY_A_Z], [-1500, HOLD_SHORT_Z]],
    filletRadius: 45,
    holdShort: [-1500, HOLD_SHORT_Z],
  },
  lineUp: {
    // from the hold-short point onto the runway and align with the centreline
    points: [[-1500, HOLD_SHORT_Z], [-1500, 0], [-1430, 0]],
    filletRadius: 40,
    takeoffStart: [-1430, 0],
    takeoffHeading: 90,
  },
};

export const ARRIVAL = {
  id: 'arrival',
  code: 'PSX',
  name: 'Port Solano International',
  city: 'Port Solano',
  seed: 4721,
  // Default placement; the flight director moves it (app.world.setArrivalOrigin)
  // when the descent begins so it is always ~150 km ahead along the track.
  origin: [620000, 0, 0],
  runwayIds: ['09', '27'],
  activeRunway: '09',                // landing towards +X (east)
  terrainStyle: 'coastal-city',      // ocean bay to the west, city to the north
  apron: { xMin: -520, xMax: 920, zMin: -470, zMax: -340 },
  terminal: { xMin: -540, xMax: 940, zMin: -580, zMax: -470, height: 21, style: 'concourse-piers' },
  connectors: [
    { id: 'A1', x: -1500, from: TAXIWAY_A_Z, to: 0 },
    { id: 'A2', x: -600, from: TAXIWAY_A_Z, to: 0 },
    { id: 'A6', x: 1500, from: TAXIWAY_A_Z, to: 0 },
    { id: 'D', x: 600, from: TAXILANE_Z, to: TAXIWAY_A_Z },
    { id: 'E', x: -300, from: TAXILANE_Z, to: TAXIWAY_A_Z },
  ],
  // high-speed exit leaving the runway to the left (north-east) at 30°
  rapidExits: [{ id: 'A4', start: [100, 0], end: [446, TAXIWAY_A_Z], angleDeg: 30 }],
  gates: gates('C', [-200, -150, -100, -50, 0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500]),
  ownGate: 'C10',                    // x = 250
  occupiedGates: ['C1', 'C3', 'C4', 'C6', 'C7', 'C9', 'C12', 'C13', 'C15'],
  approach: {
    glideslopeDeg: 3.0,
    threshold: [-1500, 0],           // runway 09 threshold
    aimPoint: [-1200, 0],            // touchdown aiming point (300 m past threshold)
    touchdownX: -1130,
    finalApproachFixDistance: 15000, // metres from threshold where the glideslope is intercepted
  },
  rollout: {
    // from touchdown along the centreline, then the rapid exit, taxiway A, D, taxilane, gate
    points: [[-1130, 0], [100, 0], [446, TAXIWAY_A_Z], [520, TAXIWAY_A_Z]],
    filletRadius: 260,               // large radius: rapid exit turn-off
  },
  taxiIn: {
    points: [[520, TAXIWAY_A_Z], [600, TAXIWAY_A_Z], [600, TAXILANE_Z], [250, TAXILANE_Z], [250, GATE_STAND_Z]],
    filletRadius: 45,
    stopAt: [250, GATE_STAND_Z],
    finalHeading: 0,
  },
};

export const AIRPORTS = { departure: DEPARTURE, arrival: ARRIVAL };

/** Look up a gate object by id. */
export function gateById(airport, id) {
  return airport.gates.find((g) => g.id === id);
}

// -----------------------------------------------------------------------------
// Path helper shared by the airport generator (pavement) and the flight
// director (motion): turns a polyline with fillet radius into a dense, smooth
// list of samples {x, z, heading, s} (s = distance along the path).
// For `reverse` paths (pushback) the heading is opposite the travel direction.
// -----------------------------------------------------------------------------
export function buildPath(points, filletRadius = 30, { reverse = false, step = 1.0 } = {}) {
  const P = points.map(([x, z]) => ({ x, z }));
  const out = [];
  const push = (x, z) => {
    const last = out[out.length - 1];
    if (last && Math.hypot(x - last.x, z - last.z) < 1e-6) return;
    out.push({ x, z });
  };
  push(P[0].x, P[0].z);
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const d1x = b.x - a.x, d1z = b.z - a.z, l1 = Math.hypot(d1x, d1z);
    const d2x = c.x - b.x, d2z = c.z - b.z, l2 = Math.hypot(d2x, d2z);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const u1x = d1x / l1, u1z = d1z / l1, u2x = d2x / l2, u2z = d2z / l2;
    const cos = Math.max(-1, Math.min(1, u1x * u2x + u1z * u2z));
    const turn = Math.acos(cos);
    if (turn < 1e-3) { push(b.x, b.z); continue; }
    let r = filletRadius;
    let t = r * Math.tan(turn / 2);
    const maxT = Math.min(l1, l2) * 0.5;
    if (t > maxT) { t = maxT; r = t / Math.tan(turn / 2); }
    const sx = b.x - u1x * t, sz = b.z - u1z * t;     // arc start
    const ex = b.x + u2x * t, ez = b.z + u2z * t;     // arc end
    // arc centre is on the inside of the turn
    const cross = u1x * u2z - u1z * u2x;              // >0 => turning towards +rotation
    const nx = cross > 0 ? -u1z : u1z, nz = cross > 0 ? u1x : -u1x;
    const cx = sx + nx * r, cz = sz + nz * r;
    push(sx, sz);
    const a0 = Math.atan2(sz - cz, sx - cx);
    const a1 = Math.atan2(ez - cz, ex - cx);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const n = Math.max(2, Math.ceil(Math.abs(da) * r / step));
    for (let k = 1; k <= n; k++) {
      const ang = a0 + da * (k / n);
      push(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r);
    }
  }
  push(P[P.length - 1].x, P[P.length - 1].z);

  // resample straight segments densely and compute headings / arc length
  const dense = [];
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i], b = out[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) dense.push({ x: a.x + (b.x - a.x) * (k / n), z: a.z + (b.z - a.z) * (k / n) });
  }
  dense.push({ ...out[out.length - 1] });
  let s = 0;
  for (let i = 0; i < dense.length; i++) {
    const p = dense[i];
    if (i > 0) s += Math.hypot(p.x - dense[i - 1].x, p.z - dense[i - 1].z);
    p.s = s;
    const q = dense[Math.min(i + 1, dense.length - 1)], o = dense[Math.max(i - 1, 0)];
    const dx = q.x - o.x, dz = q.z - o.z;
    // compass heading of travel direction: 0 = -Z, 90 = +X
    let h = Math.atan2(dx, -dz) * 180 / Math.PI;
    if (reverse) h += 180;
    p.heading = ((h % 360) + 360) % 360;
  }
  return { samples: dense, length: s };
}

/** Sample a built path at distance s (clamped). Returns {x, z, heading}. */
export function samplePath(path, s) {
  const S = path.samples;
  if (s <= 0) return { ...S[0] };
  if (s >= path.length) return { ...S[S.length - 1] };
  let lo = 0, hi = S.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid].s <= s) lo = mid; else hi = mid; }
  const a = S[lo], b = S[hi];
  const t = (s - a.s) / Math.max(1e-9, b.s - a.s);
  let dh = b.heading - a.heading;
  while (dh > 180) dh -= 360;
  while (dh < -180) dh += 360;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: (a.heading + dh * t + 360) % 360, s };
}

/** Curvature-based speed limit helper: returns heading change rate (deg/m) near s. */
export function pathTurnRate(path, s, window = 6) {
  const a = samplePath(path, s - window), b = samplePath(path, s + window);
  let dh = b.heading - a.heading;
  while (dh > 180) dh -= 360;
  while (dh < -180) dh += 360;
  return Math.abs(dh) / (2 * window);
}
