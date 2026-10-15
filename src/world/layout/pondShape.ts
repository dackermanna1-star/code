// Organic pond outlines: the authored radius is modulated by a smooth, closed angular wave (per pond), so ponds are
// irregular lobed shapes instead of perfect circles. Shared by terrain carving, classification, the map raster,
// the water meshes and World.getWaterHeight (pure functions, worker-safe).

/** Largest outline radius relative to the authored radius. */
export const POND_SHAPE_MAX = 1.27;

interface PondLike {
  x: number;
  z: number;
  radius: number;
}

/** Outline radius (m) of pond #index in the direction of (x, z) from its center. */
export function pondRadiusAt(p: PondLike, index: number, x: number, z: number): number {
  const a = Math.atan2(z - p.z, x - p.x);
  const k = 1.7 + index * 2.39;
  const n = 0.14 * Math.sin(2 * a + k) + 0.08 * Math.sin(3 * a + 2.1 * k + 1) + 0.045 * Math.sin(5 * a + 3.3 * k + 2);
  return p.radius * (1 + n);
}

/**
 * Distance from the pond center rescaled so the (irregular) outline sits at the authored radius:
 * carving/classification profiles written for a circle of p.radius follow the organic outline.
 */
export function pondShapeDistance(p: PondLike, index: number, x: number, z: number): number {
  const dx = x - p.x, dz = z - p.z;
  return (Math.sqrt(dx * dx + dz * dz) * p.radius) / pondRadiusAt(p, index, x, z);
}

/** Radius (m) of a circle that safely contains the pond water (outline + shore margin). */
export function pondReach(p: PondLike): number {
  return p.radius * POND_SHAPE_MAX + 4;
}
