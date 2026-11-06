// Terrain: heightmap (flat town, rolling Kentucky hills outside, steep impassable map edge), water carving,
// ground materials. Writes straight into world.blocks for speed.
import { makeNoise2D, fbm2, smoothstep, clamp } from '../../core/rng.js';
import { SURFACE, WATER_LEVEL } from '../World.js';
import { B } from '../blocks.js';
import { distanceField } from './water.js';

export const TOWN_RECT = { x0: 300, z0: 236, x1: 890, z1: 770 };

export function buildTerrain(ctx) {
  const { world, SX, SZ, flat, water, waterDepth } = ctx;
  const SY = world.SY;
  const seed = ctx.seed;
  const nH = makeNoise2D(seed ^ 0x1234);
  const nR = makeNoise2D(seed ^ 0x777);
  const nF = makeNoise2D(seed ^ 0x9e37);
  const nG = makeNoise2D(seed ^ 0x4242);

  const dFlat = distanceField(flat, SX, SZ, 120);
  const dWater = distanceField(water, SX, SZ, 120);
  ctx.dWater = dWater;
  ctx.dFlat = dFlat;

  const ground = new Uint8Array(SX * SZ);
  const forest = new Uint8Array(SX * SZ);
  const T = TOWN_RECT;
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const k = z * SX + x;
      if (water[k]) { ground[k] = WATER_LEVEL - waterDepth[k]; continue; }
      const dxT = x < T.x0 ? T.x0 - x : x > T.x1 ? x - T.x1 : 0;
      const dzT = z < T.z0 ? T.z0 - z : z > T.z1 ? z - T.z1 : 0;
      const dT = Math.sqrt(dxT * dxT + dzT * dzT);
      const amp = 4 + 20 * smoothstep(0, 140, dT);
      let hill = 0;
      if (dT > 0) {
        const n = fbm2(nH, x / 170, z / 170, 4);
        const r = 1 - Math.abs(nR(x / 110, z / 110));
        hill = amp * clamp(0.45 + 0.55 * n + 0.35 * (r * r - 0.4), 0, 1.25) * smoothstep(0, 40, dT);
        hill += 1.2 * nR(x / 23, z / 23) * smoothstep(0, 60, dT);
      }
      const e = Math.min(x, z, SX - 1 - x, SZ - 1 - z);
      if (e < 40) hill += Math.pow((40 - e) / 40, 1.5) * 30;
      hill = Math.min(hill, Math.max(0, dFlat[k] - 2) * 0.62);
      hill = Math.min(hill, Math.max(0, dWater[k] - 2.5) * 0.55);
      let h = SURFACE + Math.floor(Math.max(0, hill));
      if (!flat[k] && dWater[k] <= 2.2) h = SURFACE - 1;
      if (h > SY - 8) h = SY - 8;
      ground[k] = h;
      // forest density (0..255)
      const f = fbm2(nF, x / 140, z / 140, 3) + 0.25;
      forest[k] = flat[k] ? 0 : Math.round(clamp(f * 1.4 + 0.5, 0, 1) * 255);
    }
  }
  ctx.ground = ground;
  ctx.forest = forest;

  // fill columns
  const blocks = world.blocks;
  const STONE = B.stone, DIRT = B.dirt;
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const k = z * SX + x;
      const base = (x + z * SX) * SY;
      const h = ground[k];
      blocks[base] = B.bedrock;
      if (water[k]) {
        const bed = h;
        blocks.fill(STONE, base + 1, base + bed - 2);
        const hv = (nG(x / 9, z / 9) + 1) * 0.5;
        const bedMat = waterDepth[k] <= 2 ? B.sand : hv > 0.62 ? B.mud : hv > 0.35 ? B.gravel : B.sand;
        blocks.fill(DIRT, base + bed - 2, base + bed);
        blocks[base + bed] = bedMat;
        blocks.fill(B.water, base + bed + 1, base + WATER_LEVEL + 1);
        continue;
      }
      blocks.fill(STONE, base + 1, base + h - 3);
      blocks.fill(DIRT, base + h - 3, base + h);
      let top;
      if (dWater[k] <= 2.5 && !flat[k]) top = B.sand;
      else if (flat[k]) top = B.grass;
      else {
        // slope -> rock
        const hn = Math.max(
          Math.abs(h - ground[k - (x > 0 ? 1 : 0)]), Math.abs(h - ground[k + (x < SX - 1 ? 1 : 0)]),
          Math.abs(h - ground[k - (z > 0 ? SX : 0)]), Math.abs(h - ground[k + (z < SZ - 1 ? SX : 0)]));
        const g = nG(x / 30, z / 30);
        if (hn >= 3) top = g > 0.2 ? B.cobblestone : B.stone;
        else if (forest[k] > 130) top = B.forest_floor;
        else if (g > 0.35) top = B.dry_grass;
        else top = B.grass;
        if (hn >= 2 && h > 30 && g < -0.3) { top = B.stone; }
      }
      blocks[base + h] = top;
    }
  }
}

/** Top solid ground y at column (terrain only, before structures) */
export function groundY(ctx, x, z) {
  if (x < 0 || z < 0 || x >= ctx.SX || z >= ctx.SZ) return SURFACE;
  return ctx.ground[z * ctx.SX + x];
}
