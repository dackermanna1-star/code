/**
 * Coarse surface sampling for distant-terrain LOD tiles (worker-side).
 * kinds: 0 land, 1 water, 2 canopy (forest), 3 snow, 4 sand, 5 stone
 */
import type { WorldGenerator } from './generator';
import { BIOMES, biomeGrassColor, biomeFoliageColor } from '../biomes';
import { SEA_LEVEL } from '../../core/constants';

const mul = (c: number, k: number) => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k)), g = Math.min(255, Math.round(((c >> 8) & 255) * k)), b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
};
const lerpC = (a: number, b: number, t: number) => {
  const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
  const g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
  const bl = (a & 255) * (1 - t) + (b & 255) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};

export function lodTile(gen: WorldGenerator, x0: number, z0: number, n: number, step: number) {
  const heights = new Float32Array(n * n);
  const colors = new Uint32Array(n * n);
  const kinds = new Uint8Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      const k = j * n + i;
      if (gen.dimension !== 'overworld') {
        const h = gen.surfaceHeightAt(x, z);
        heights[k] = h + 1;
        colors[k] = gen.dimension === 'end' ? 0xdbde9e : 0x6f3534;
        kinds[k] = 5;
        continue;
      }
      const h = gen.surfaceHeightAt(x, z) + 1;
      const b = BIOMES[gen.biomeAt(x, z)] ?? BIOMES[0];
      const cat = b.category;
      const hash = ((Math.imul(x, 73856093) ^ Math.imul(z, 19349663)) >>> 0) / 4294967296;
      if (h < SEA_LEVEL) {
        heights[k] = SEA_LEVEL - 0.12;
        const depth = Math.min(1, (SEA_LEVEL - h) / 24);
        colors[k] = lerpC(mul(b.water, 0.55), mul(b.water, 0.2), depth);
        kinds[k] = 1;
        continue;
      }
      let col = mul(biomeGrassColor(b), 0.78);
      let kind = 0;
      let hh = h;
      const name = b.name;
      if (cat === 'desert' || cat === 'beach' || name === 'stony_shore') { col = name === 'stony_shore' ? 0x8a8a8a : 0xd9cf9c; kind = 4; }
      else if (cat === 'badlands') { col = [0xa15325, 0xba8523, 0x985e43, 0xd1b1a1][Math.floor((h / 3) % 4)]; kind = 4; }
      else if (b.precipitation === 'snow' || h > 175) { col = 0xeef2fa; kind = 3; }
      else if (name === 'stony_peaks' || (cat === 'mountain' && h > 140) || name === 'windswept_gravelly_hills') { col = 0x868686; kind = 5; }
      else if (cat === 'mushroom') col = 0x7a6a72;
      if ((cat === 'forest' || cat === 'jungle' || cat === 'taiga' || name === 'swamp' || name === 'wooded_badlands' || name === 'savanna' && hash < 0.2) && kind !== 3 && kind !== 5) {
        const density = cat === 'jungle' || name === 'dark_forest' ? 0.95 : name === 'sparse_jungle' || name === 'savanna' ? 0.35 : cat === 'taiga' ? 0.8 : 0.75;
        if (hash < density) {
          kind = 2;
          hh = h + (cat === 'jungle' ? 10 : name === 'dark_forest' ? 7 : cat === 'taiga' ? 8 : 5.5) * (0.75 + hash * 0.5);
          col = name === 'cherry_grove' ? 0xe7a3c4 : cat === 'taiga' ? mul(0x619961, 0.62) : name.startsWith('birch') || name === 'old_growth_birch_forest' ? mul(0x80a755, 0.72) : mul(biomeFoliageColor(b), 0.62);
        }
      } else if (b.precipitation === 'snow' && cat === 'taiga') {
        kind = 2;
        hh = h + 7;
        col = 0xdfe6ee;
      }
      heights[k] = hh;
      colors[k] = col;
      kinds[k] = kind;
    }
  return { heights, colors, kinds };
}
