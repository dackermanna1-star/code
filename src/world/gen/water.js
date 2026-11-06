// Lake Millbrook + Mill Creek river: 2D water mask and depth (bed below WATER_LEVEL).
import { makeNoise2D } from '../../core/rng.js';
import { LAKE, ISLAND, RIVER } from './plan.js';

/**
 * Fills ctx.water (1 = water column), ctx.waterDepth (blocks of water: bed top = 18 - depth).
 */
export function buildWater(ctx) {
  const { SX, SZ } = ctx;
  const water = new Uint8Array(SX * SZ);
  const depth = new Uint8Array(SX * SZ);
  const n1 = makeNoise2D(ctx.seed ^ 0x51ab);

  // river: capsule segments with noisy half width
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - 14)), maxX = Math.min(SX - 1, Math.ceil(Math.max(ax, bx) + 14));
    const minZ = Math.max(0, Math.floor(Math.min(az, bz) - 14)), maxZ = Math.min(SZ - 1, Math.ceil(Math.max(az, bz) + 14));
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        let t = ((x - ax) * dx + (z - az) * dz) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + dx * t, pz = az + dz * t;
        // gentle meander offset
        const off = n1(px * 0.02, pz * 0.02) * 4;
        const ddx = x - px - off * (dz / Math.sqrt(L2)), ddz = z - pz + off * (dx / Math.sqrt(L2));
        const d = Math.sqrt(ddx * ddx + ddz * ddz);
        const hw = 5.5 + 1.8 * n1(px * 0.05 + 100, pz * 0.05);
        if (d <= hw) {
          const k = z * SX + x;
          water[k] = 1;
          const dep = 1 + Math.round(3.2 * (1 - (d / hw) * (d / hw)));
          if (dep > depth[k]) depth[k] = dep;
        }
      }
    }
  }
  // lake: noisy ellipse
  const { cx, cz, rx, rz } = LAKE;
  for (let z = Math.max(0, cz - rz - 20); z <= Math.min(SZ - 1, cz + rz + 20); z++) {
    for (let x = Math.max(0, cx - rx - 20); x <= Math.min(SX - 1, cx + rx + 20); x++) {
      const ex = (x - cx) / rx, ez = (z - cz) / rz;
      const r = Math.sqrt(ex * ex + ez * ez);
      const ang = Math.atan2(ez, ex);
      const lim = 1 + 0.14 * n1(Math.cos(ang) * 2 + 50, Math.sin(ang) * 2 + 50) + 0.05 * n1(x * 0.05, z * 0.05);
      if (r < lim) {
        const k = z * SX + x;
        const ir = (x - ISLAND.cx) ** 2 + (z - ISLAND.cz) ** 2;
        if (ir < ISLAND.r * ISLAND.r) continue; // island
        water[k] = 1;
        const t = 1 - r / lim;
        const dep = Math.min(9, 1 + Math.round(t * 12));
        if (dep > depth[k]) depth[k] = dep;
      }
    }
  }
  ctx.water = water;
  ctx.waterDepth = depth;
}

/** Chamfer distance transform: distance (blocks, capped) from cells where mask[k] != 0. */
export function distanceField(mask, SX, SZ, cap = 250) {
  const INF = 1e9;
  const d = new Float32Array(SX * SZ);
  for (let k = 0; k < d.length; k++) d[k] = mask[k] ? 0 : INF;
  const D1 = 1, D2 = 1.4142;
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const k = z * SX + x;
      let v = d[k];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[k - 1] + D1);
      if (z > 0) {
        v = Math.min(v, d[k - SX] + D1);
        if (x > 0) v = Math.min(v, d[k - SX - 1] + D2);
        if (x < SX - 1) v = Math.min(v, d[k - SX + 1] + D2);
      }
      d[k] = v;
    }
  }
  for (let z = SZ - 1; z >= 0; z--) {
    for (let x = SX - 1; x >= 0; x--) {
      const k = z * SX + x;
      let v = d[k];
      if (v === 0) continue;
      if (x < SX - 1) v = Math.min(v, d[k + 1] + D1);
      if (z < SZ - 1) {
        v = Math.min(v, d[k + SX] + D1);
        if (x < SX - 1) v = Math.min(v, d[k + SX + 1] + D2);
        if (x > 0) v = Math.min(v, d[k + SX - 1] + D2);
      }
      d[k] = v;
    }
  }
  for (let k = 0; k < d.length; k++) if (d[k] > cap) d[k] = cap;
  return d;
}
