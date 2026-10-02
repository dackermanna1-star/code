// Small shared helpers for the maintenance / lobby generators.
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E S W N
export const K = { SOLID: 0, TUN: 1, ROOM: 2, DOORWAY: 3, NICHE: 4, PIT: 5 };
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const dirStr = (di) => ['+x', '+z', '-x', '-z'][di];
// decal face name for a wall whose visible side looks toward (nx, nz)
export const faceOfNormal = (nx, nz) => (nx > 0.5 ? 'px' : nx < -0.5 ? 'nx' : nz > 0.5 ? 'pz' : 'nz');
// decal face for a wall at direction (dx, dz) from the cell looking at it
export const faceToward = (dx, dz) => (dx === -1 ? 'px' : dx === 1 ? 'nx' : dz === -1 ? 'pz' : 'nz');
export const keyOf = (x, z, dx, dz) => x + ',' + z + ',' + dx + ',' + dz;
