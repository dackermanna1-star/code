// Shared world units. Architecture snaps to one brick course (CV); brick
// relief detail lives on a 5x finer grid (BV) evaluated in the shader.
export const CV = 0.0677; // coarse voxel = one brick course (6.77 cm)
export const BV = CV / 5; // fine brick voxel (1.354 cm)
export const VS_FINE = BV; // small props: windows, doors, meters, cans
export const VS_MED = BV * 2; // medium props: dumpsters, carts, AC units, fire escapes

export const ALLEY_HALF = 2.8; // facades at x = ±2.8
export const ALLEY_END_Z = -74; // cross alley starts
export const CROSS_FAR_Z = -79.5; // end building facade
export const FENCE_Z = 7.0; // chain-link fence behind the start

// Paint (graffiti) texture array layer size in meters
export const PAINT_LAYER_W = 32;
export const PAINT_LAYER_H = 10;

// Camera layers
export const LAYER_REFLECT = 1; // rendered into the planar ground reflection
export const LAYER_NO_MAIN = 2; // helper-only objects

export const snapCV = (m) => Math.round(m / CV);
