// Hand-tuned "light map" per vertex for the coach cabin: [A, B, ao, F]
//   A = ceiling-cove LED wash received (indirect light strips along the central ceiling)
//   B = rack-edge down-light wash received (opal LED strips under the parcel-rack noses)
//   ao = ambient occlusion
//   F = aisle floor LED glow (step lights in the platform nosings)
// The lighting controller multiplies them with the current mode's colours.
import { clamp, smoothstep } from '../../core/util.js';
import { L } from './layout.js';

const SRC_X = 0.625, SRC_Y = L.rackY - 0.002;    // down-light line sources

/** Down-light (B) from the two rack-nose LED strips (line sources along z, emitting downward). */
function downWash(x, y, z, nx, ny, nz) {
  let b = 0;
  for (const s of [-1, 1]) {
    const lx = s * SRC_X - x, ly = SRC_Y - y;
    const d = Math.hypot(lx, ly) || 1e-3;
    const ux = lx / d, uy = ly / d;
    const cosN = Math.max(0, nx * ux + ny * uy);
    const emit = Math.max(0, uy) ** 1.3;         // the strips throw light down and slightly sideways
    b += cosN * emit / (d + 0.25);
  }
  return b * 0.55;
}

/** Cove wash (A): the lit central ceiling acts as a big soft area light. */
function coveWash(x, y, z, nx, ny, nz) {
  const ax = Math.abs(x);
  // central ceiling itself: LED strips at its edges
  if (y > 1.99 && ax < L.ceilEdgeX + 0.005 && ny < -0.4) {
    const t = clamp(ax / L.ceilEdgeX, 0, 1);
    return 0.85 + 1.1 * t ** 3;
  }
  const dy = Math.max(0.05, 2.02 - y);
  const up = clamp(ny * 0.5 + 0.5, 0, 1);
  const toward = clamp(-Math.sign(x || 1) * nx * 0.4 + 0.6, 0.2, 1);   // inward-facing faces see the ceiling
  let a = (0.1 + 0.55 * up * up) * toward / (1 + dy * 0.55);
  if (ax > 0.64 && y > 1.6 && y < 1.95) a *= 0.35;                         // inside the racks
  return a;
}

/** Aisle step lights (F): small LEDs in the platform nosings at |x| = aisleX, y ~ 0.03. */
function floorGlow(x, y, z, nx, ny, nz) {
  if (y > 0.5 || y < -0.05) return 0;
  const ax = Math.abs(x);
  const d = Math.abs(ax - L.aisleX);
  const facing = ny > 0.5 ? 1 : 0.4;
  return facing * Math.exp(-(d * d) / (0.012)) * 0.8 + facing * 0.12 * (1 - smoothstep(0.0, 0.3, d)) * (y < 0.06 ? 1 : 0);
}

function aoAt(x, y, z, nx, ny, nz) {
  const ax = Math.abs(x);
  let ao = 1;
  // floor / wall junctions and low surfaces
  if (y < 0.3 && ax > 0.9) ao *= 0.72 + 0.28 * smoothstep(0.0, 0.3, y);
  // rack interior
  if (ax > 0.64 && y > 1.6 && y < 1.95) ao *= 0.6;
  // just below the rack underside, faces on the wall
  if (ax > 1.1 && y > 1.45 && y < 1.6) ao *= 0.85;
  // stairwells / below deck
  if (y < -0.02) ao *= 0.55 + 0.45 * smoothstep(-1.3, 0, y);
  return clamp(ao, 0.2, 1);
}

export function bakeAt(x, y, z, nx, ny, nz) {
  let A = coveWash(x, y, z, nx, ny, nz);
  let B = downWash(x, y, z, nx, ny, nz);
  let F = floorGlow(x, y, z, nx, ny, nz);
  const ao = aoAt(x, y, z, nx, ny, nz);
  // front area (driver / vestibule / stairs): lit by the entry downlights in the front dome
  if (z < L.deckZ0 + 0.02) {
    const k = smoothstep(L.deckZ0 + 0.02, L.deckZ0 - 0.4, z);
    A = A * (1 - 0.5 * k) + k * 0.12;
    B = B * (1 - k) + k * (0.32 * clamp(ny * 0.6 + 0.4, 0, 1) + 0.08);
    F = F * (1 - k) + (y < -0.3 ? k * 0.25 * clamp(ny, 0, 1) : 0);
  }
  return [A, B, ao, F];
}

/** Constant bakes for small parts by rough location. */
export const BK = {
  ceiling: [1.0, 0.05, 1, 0],
  rackUnder: [0.1, 0.22, 0.92, 0],
  wall: [0.12, 0.12, 0.95, 0],
  low: [0.08, 0.15, 0.8, 0.05],
  dark: [0.06, 0.05, 0.6, 0],
  aisle: [0.18, 0.3, 1, 0.1],
};
