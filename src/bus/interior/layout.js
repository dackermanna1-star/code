// =============================================================================
// Interior layout: every dimension of the coach cabin that more than one file
// of the interior module needs (bus-local metres, +X right/door side, -Z
// forward, deck floor y = 0). Derived from src/bus/core/constants.js.
// =============================================================================
import { COACH, DOORS, ZONES, WINDOW_PANELS, AISLE } from '../core/constants.js';

export const L = {
  // floor
  plat: 0.045,              // raised side platforms (seat rails) above the aisle floor
  aisleX: 0.285,            // half width of the aisle floor (platform nosing edge)
  runnerX: 0.215,           // half width of the aisle carpet runner
  // side wall (right side; the left is mirrored)
  wallX: COACH.innerHalfWidth,    // 1.19 lining at window height
  glassX: 1.248,            // inner surface of the bonded side glass
  skinX: COACH.halfWidth,   // 1.275
  ductX: 1.055,             // heater convector front face
  ductY: 0.19,              // convector top (grille)
  sillY: COACH.windowSillY, // 0.62
  sillX: 1.145,             // inner edge of the window ledge
  winTopY: COACH.windowTopY,// 1.74
  // parcel rack
  rackY: COACH.rackBottomY, // 1.585 underside
  rackFloorY: 1.618,
  rackLipX: 0.598,          // aisle-side nose of the rack
  rackLipTopY: 1.70,
  rackGlassX0: 0.985,       // smoked glass strip in the rack bottom (window side)
  rackGlassX1: 1.205,
  psuX0: 0.645, psuX1: 0.975,
  sideCeilY: 1.93,          // underside of the side ceiling at the rack opening
  fasciaX: 0.56,            // side-ceiling fascia hiding the indirect LED strip
  ceilEdgeX: 0.53,          // central ceiling edge
  ceilY0: 2.012,            // central ceiling height at its edge
  ceilY1: 2.04,             // ... at the centreline
  // longitudinal stations
  deckZ0: COACH.passengerDeckStartZ,   // -4.95
  rearZ: ZONES.rearWallZ,              // 6.05
  frontZ: COACH.frontPlatformZ[0],     // -6.35
  frontCeilY: 2.22,
  // front stairs (road -> platform): 3 treads, 4 risers of 0.225
  roadY: COACH.roadY,
  drvY: COACH.driverFloorY,            // -0.42
  frontStair: { z0: -6.30, z1: -5.265, treads: [{ x0: 0.99, x1: 1.275, y: -1.095 }, { x0: 0.705, x1: 0.99, y: -0.87 }, { x0: 0.42, x1: 0.705, y: -0.645 }] },
  // two steps from the platform up to the deck (aisle only)
  deckStep: { x0: -0.18, x1: 0.30, z0: -5.25, z1: -4.95, y: -0.21 },
  rightPartZ: -5.245,       // partition in front of seats 1C/1D (rear face)
  leftPartZ: -4.95,         // partition behind the driver (rear face)
  partTopY: 1.40, partSolidY: 0.98,
  // dashboard ledge in front of the vestibule (the cockpit module owns the driver's dash)
  dashZ: -6.20, dashY: -0.30,
  // mid door stairwell: deck -> road, 4 treads stepping down towards the door
  midStair: { z0: DOORS.mid.z0, z1: DOORS.mid.z1, treads: [{ x0: 0.20, x1: 0.45, y: -0.26 }, { x0: 0.45, x1: 0.70, y: -0.52 }, { x0: 0.70, x1: 0.95, y: -0.79 }, { x0: 0.95, x1: 1.275, y: -1.05 }] },
  midCoverY: 1.50,          // underside of the mid-door mechanism cover
  // toilet (right side, sunken floor two steps down)
  wc: { x0: ZONES.toilet.xMin, x1: ZONES.toilet.xMax, z0: ZONES.toilet.zMin, z1: ZONES.toilet.zMax, floorY: ZONES.toilet.floorY, wall: 0.035, stepX: 0.47, stepY: -0.26, doorZ0: 1.50, doorZ1: 2.10, ceilY: 1.78, topY: 2.04 },
  // windscreen
  ws: { z: COACH.windscreen.z, y0: COACH.windscreen.bottomY, y1: COACH.windscreen.topY, rake: COACH.windscreen.rakeDeg * Math.PI / 180, halfW: 1.215 },
  // driver's side window sits lower than the passenger windows
  driverWinY0: 0.26,
};

/** z of the (raked) windscreen inner surface at height y. */
export const windscreenZ = (y) => L.ws.z + (y - L.ws.y0) * Math.tan(L.ws.rake) + 0.012;

/** Panes as { side, s, z0, z1, y0, y1, kind } (glass extents, bus-local). */
export function glassPanes() {
  const out = [];
  for (const [side, s] of [['left', -1], ['right', 1]]) {
    for (const [z0, z1] of WINDOW_PANELS[side]) {
      const driver = side === 'left' && z1 <= L.deckZ0 + 0.06;
      out.push({ side, s, z0, z1, y0: driver ? L.driverWinY0 : L.sillY, y1: L.winTopY, kind: driver ? 'driver' : 'side' });
    }
  }
  return out;
}

/** Pillars between panes / doors per side: [{ side, s, z0, z1 }] (gap between glass). */
export function pillars() {
  const out = [];
  const add = (side, z0, z1) => out.push({ side, s: side === 'left' ? -1 : 1, z0, z1, zc: (z0 + z1) / 2 });
  const L0 = WINDOW_PANELS.left;
  for (let i = 0; i < L0.length - 1; i++) add('left', L0[i][1], L0[i + 1][0]);
  const R = [...WINDOW_PANELS.right, ...WINDOW_PANELS.rightDoorGlass, [ZONES.toilet.zMin, ZONES.toilet.zMax]].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < R.length - 1; i++) if (R[i + 1][0] - R[i][1] < 0.2 && R[i + 1][0] > R[i][1]) add('right', R[i][1], R[i + 1][0]);
  return out;
}

/**
 * Walkable floor height (bus-local y) at (x, z). Covers the passenger deck and
 * its side platforms, the front platform, both front step flights, the mid-door
 * stairwell and the sunken toilet floor. Outside the body it returns the road
 * level (COACH.roadY) — the player module may refine that with the station ground.
 */
export function floorHeightAt(x, z) {
  const ax = Math.abs(x);
  if (ax > L.skinX + 0.02 || z < L.frontZ - 0.1 || z > COACH.rearZ) return L.roadY;
  // ---- front: driver platform, vestibule, entry stairs, deck steps
  if (z < L.deckZ0) {
    const fs = L.frontStair;
    if (x > fs.treads[2].x0 && z > fs.z0 && z < fs.z1) {
      for (const t of fs.treads) if (x >= t.x0) return x > L.skinX ? L.roadY : t.y;
    }
    const ds = L.deckStep;
    if (z >= ds.z0 && x >= ds.x0 && x <= ds.x1) return ds.y;
    if (x > ds.x1 && z >= L.rightPartZ) return L.plat;   // floor in front of 1C/1D (behind the partition)
    return L.drvY;
  }
  // ---- mid door stairwell
  const ms = L.midStair;
  if (x > ms.treads[0].x0 && z > ms.z0 && z < ms.z1) {
    let y = 0;
    for (const t of ms.treads) if (x >= t.x0) y = t.y;
    return x > L.skinX ? L.roadY : y;
  }
  // ---- toilet (inside the walls)
  const wc = L.wc;
  if (x > wc.x0 + wc.wall && z > wc.z0 + wc.wall && z < wc.z1 - wc.wall) return x < wc.stepX ? wc.stepY : wc.floorY;
  if (ax <= L.aisleX) return 0;
  return L.plat;
}

/** Which named zone a point is in (for debugging / the player module). */
export function zoneAt(x, z) {
  if (Math.abs(x) > L.skinX) return 'outside';
  if (z < L.deckZ0) return x < -0.18 ? 'driver' : 'vestibule';
  const ms = L.midStair, wc = L.wc;
  if (x > ms.treads[0].x0 && z > ms.z0 && z < ms.z1) return 'midStairs';
  if (x > wc.x0 && z > wc.z0 && z < wc.z1) return 'toilet';
  if (z > 4.9) return 'rear';
  return 'aisle';
}

export { COACH, DOORS, ZONES, WINDOW_PANELS, AISLE };
