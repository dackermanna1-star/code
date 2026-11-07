// Hand-tuned "light map" values per vertex: x = ceiling LED wash received,
// y = sidewall LED wash received, z = ambient occlusion, w = cove glow.
// They are multiplied by the mood-lighting colours in the shader (materials.js).
import { smoothstep, clamp } from '../../core/util.js';
import { PROF, ceilingY } from './profile.js';

/** Generic bake for any cabin surface, chosen by region & normal. */
export function bakeAt(x, y, z, nx, ny, nz) {
  const ax = Math.abs(x);
  // ceiling panel
  if (y > 2.05 && ax < PROF.ceilEdgeX + 0.01 && ny < -0.5) return bakeCeiling(ax);
  // floor
  if (y < 0.03 && ny > 0.8) return [0.26, 0.04 + 0.1 * smoothstep(1.2, 1.6, ax), 1, 0];
  // sidewall / dado (normal pointing inboard)
  const inward = -(x >= 0 ? nx : -nx);
  if (ax > 1.15 && y < 1.52 && inward > 0.2) return bakeSidewall(y, inward, ny);
  // bins outer faces & lips
  if (ax > 0.5 && ax < 1.4 && y > 1.55 && y < 2.12) {
    const top = smoothstep(1.75, 2.07, y);
    const facing = clamp(0.6 - ny * 0.4, 0.2, 1);   // faces towards the aisle catch bounce from the seats
    return [0.34 + 0.32 * top, 0.18 * facing, 1, 0];
  }
  // generic: lit from above by the ceiling
  return [0.10 + 0.16 * clamp(ny * 0.5 + 0.5, 0, 1), 0.04, 1, 0];
}

export function bakeCeiling(ax) {
  const t = clamp(ax / PROF.ceilEdgeX, 0, 1);
  return [0.62 + 0.55 * t * t * t, 0.0, 1, 0];
}

export function bakeSidewall(y, inward = 1, ny = 0) {
  const sw = 0.28 + 0.95 * smoothstep(0.45, 1.44, y) * (0.6 + 0.4 * smoothstep(0.9, 1.44, y));
  const cw = 0.10 + 0.07 * smoothstep(0.3, 1.4, y);
  const ao = 1 - 0.32 * (1 - smoothstep(0.0, 0.32, y));
  return [cw, sw * clamp(0.55 + 0.45 * inward, 0, 1), ao, 0];
}

/** Entry/door area sidewall (no PSU wash, ceiling light reaches further down). */
export function bakeEntryWall(y, inward = 1) {
  const cw = 0.18 + 0.26 * smoothstep(0.4, 2.0, y);
  const ao = 1 - 0.3 * (1 - smoothstep(0.0, 0.3, y));
  return [cw, 0.06, ao, 0];
}

export function ceilingYAt(x) { return ceilingY(x); }
