// LAST LOOKOUT — level layout (placeholder with the final schema; the World agent replaces the
// contents with the real valley). Pure data + helpers: no THREE, no DOM.

const S = 7.5; // compound half-size

export const LAYOUT = {
  bounds: { minX: -250, maxX: 250, minZ: -250, maxZ: 250 },
  tower: {
    pos: [0, 0, 0],
    eye: [0, 22.6, 0],
    cabin: { floorY: 21, half: [1.9, 1.9] },
    legs: [[-2.4, -2.4], [2.4, -2.4], [2.4, 2.4], [-2.4, 2.4]],
    legTop: [[-1.7, 21, -1.7], [1.7, 21, -1.7], [1.7, 21, 1.7], [-1.7, 21, 1.7]],
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
  colliders: [
    // compound fence (gaps where the gates are; the gates themselves are colliders too)
    { c: [-4.55, 1.1, S], h: [2.95, 1.1, 0.06], yaw: 0, kind: 'fence', material: 'metal' },
    { c: [4.55, 1.1, S], h: [2.95, 1.1, 0.06], yaw: 0, kind: 'fence', material: 'metal' },
    { c: [-4.55, 1.1, -S], h: [2.95, 1.1, 0.06], yaw: 0, kind: 'fence', material: 'metal' },
    { c: [4.55, 1.1, -S], h: [2.95, 1.1, 0.06], yaw: 0, kind: 'fence', material: 'metal' },
    { c: [S, 1.1, -4.55], h: [0.06, 1.1, 2.95], yaw: 0, kind: 'fence', material: 'metal' },
    { c: [S, 1.1, 4.55], h: [0.06, 1.1, 2.95], yaw: 0, kind: 'fence', material: 'metal' },
    { c: [-S, 1.1, -4.55], h: [0.06, 1.1, 2.95], yaw: 0, kind: 'fence', material: 'metal' },
    { c: [-S, 1.1, 4.55], h: [0.06, 1.1, 2.95], yaw: 0, kind: 'fence', material: 'metal' },
    { c: [0, 1.1, S], h: [1.6, 1.1, 0.08], yaw: 0, kind: 'gate', material: 'wood', gate: 'south' },
    { c: [0, 1.1, -S], h: [1.6, 1.1, 0.08], yaw: 0, kind: 'gate', material: 'wood', gate: 'north' },
    { c: [S, 1.1, 0], h: [0.08, 1.1, 1.6], yaw: 0, kind: 'gate', material: 'wood', gate: 'east' },
    { c: [-S, 1.1, 0], h: [0.08, 1.1, 1.6], yaw: 0, kind: 'gate', material: 'wood', gate: 'west' },
    // tower legs
    { c: [-2.4, 1.5, -2.4], h: [0.15, 1.5, 0.15], yaw: 0, kind: 'leg', material: 'metal' },
    { c: [2.4, 1.5, -2.4], h: [0.15, 1.5, 0.15], yaw: 0, kind: 'leg', material: 'metal' },
    { c: [2.4, 1.5, 2.4], h: [0.15, 1.5, 0.15], yaw: 0, kind: 'leg', material: 'metal' },
    { c: [-2.4, 1.5, 2.4], h: [0.15, 1.5, 0.15], yaw: 0, kind: 'leg', material: 'metal' },
    // a few wrecks and a house to path round
    { c: [30, 0.75, 60], h: [2.2, 0.75, 1], yaw: 0.4, kind: 'car', material: 'metal' },
    { c: [-55, 2.5, -40], h: [5, 2.5, 4], yaw: 0, kind: 'house', material: 'wood' },
    { c: [70, 0.75, -30], h: [1, 0.75, 2.2], yaw: 0, kind: 'car', material: 'metal' },
  ],
  water: [],
  spawns: [
    { id: 'n', pos: [0, -210], dir: [0, 1], label: 'North woods' },
    { id: 'ne', pos: [150, -150], dir: [-0.7, 0.7], label: 'Farm road' },
    { id: 'e', pos: [215, 0], dir: [-1, 0], label: 'East field' },
    { id: 'se', pos: [150, 150], dir: [-0.7, -0.7], label: 'Gas station' },
    { id: 's', pos: [0, 215], dir: [0, -1], label: 'Bridge' },
    { id: 'sw', pos: [-150, 150], dir: [0.7, -0.7], label: 'Cornfield' },
    { id: 'w', pos: [-215, 0], dir: [1, 0], label: 'Village' },
    { id: 'nw', pos: [-150, -150], dir: [0.7, 0.7], label: 'Orchard' },
  ],
  cover: { cornfield: [{ minX: -120, maxX: -60, minZ: 60, maxZ: 130 }] },
  rangeMarkers: [{ pos: [0, 100], dist: 100 }, { pos: [0, 200], dist: 200 }, { pos: [100, 0], dist: 100 }],
  trapZones: [{ minX: -150, maxX: 150, minZ: -150, maxZ: 150 }],
  floodlightMounts: [{ id: 'f1', pos: [12, 4, 12] }, { id: 'f2', pos: [-12, 4, 12] }, { id: 'f3', pos: [12, 4, -12] }, { id: 'f4', pos: [-12, 4, -12] }],
  sentryMount: { pos: [0, 21.2, 1.9], arc: [-Math.PI, Math.PI] },
  barrelSpots: [[10, 20], [-14, 22], [25, -12], [-20, -18], [0, 35], [35, 5]],
};

/** Walkable ground for the zombies (flow field): in bounds, off the colliders, out of the water. */
export function isWalkable(x, z, grow = 0.35) {
  const B = LAYOUT.bounds;
  if (x < B.minX || x > B.maxX || z < B.minZ || z > B.maxZ) return false;
  for (const w of LAYOUT.water) if (x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ) return false;
  for (const c of LAYOUT.colliders) {
    if (c.c[1] - c.h[1] > 1.2) continue; // overhead (a bridge deck is walkable, a roof is not touched)
    const cy = Math.cos(c.yaw || 0), sy = Math.sin(c.yaw || 0);
    const dx = x - c.c[0], dz = z - c.c[2];
    const lx = dx * cy - dz * sy, lz = dx * sy + dz * cy;
    if (Math.abs(lx) < c.h[0] + grow && Math.abs(lz) < c.h[2] + grow) return false;
  }
  return true;
}
