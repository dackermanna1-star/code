/**
 * Large ore veins: a port of Minecraft 1.18's `OreVeinifier`, the long winding bands of granite
 * with copper ore (above the deepslate) and tuff with iron ore (in the deepslate) that miners
 * follow through the stone.
 *
 *  - A low-frequency "toggle" noise selects vein regions: positive -> copper (y 20..56), negative ->
 *    iron (y 1..16). |toggle| must reach 0.4; the threshold rises towards the band limits.
 *  - Two "ridge" noises carve the regions into thin tubes (both must be within 0.08 of zero).
 *  - Per block, 30 % of the candidates are skipped; of the rest 10..30 % (rising with |toggle|)
 *    become ore unless the "gap" noise vetoes it (2 % of those are raw-metal blocks); the others
 *    become the filler stone.
 *
 * As in Minecraft, toggle and ridges are sampled at the corners of 4x8x4 cells and trilinearly
 * interpolated, and per-block randomness is a positional hash: the result is a pure function of
 * (seed, x, y, z) and needs no neighbour information. The generator applies veins after the
 * surface rules (replacing only stone / deepslate) and before the carvers, so caves cut through.
 */
import { OctaveNoise, hash3i as hash3i_ } from '../common/noise';
import { ST as ST_ } from '../common/states';

// module-local bindings (avoid namespace getters in hot loops under tsx/vitest)
const ST = ST_;
const hash3i = hash3i_;

const CU_MIN = 20, CU_MAX = 56, CU_FADE = 12;
const FE_MIN = 1, FE_MAX = 16, FE_FADE = 6;
/** Corner levels y = 0, 8, ..., 64 (the bands end at y = 56). */
const LEVELS = 9;
const CELLS_Y = LEVELS - 1;

export class OreVeins {
  private readonly toggle: OctaveNoise;
  private readonly ridgeA: OctaveNoise;
  private readonly ridgeB: OctaveNoise;
  private readonly gap: OctaveNoise;
  private readonly salt: number;
  // corner grids, index (level * 5 + k) * 5 + i for corner (x0 + 4i, 8 * level, z0 + 4k)
  private readonly tg = new Float32Array(25 * LEVELS);
  private readonly ag = new Float32Array(25 * LEVELS);
  private readonly bg = new Float32Array(25 * LEVELS);
  private readonly rawCopper: number;

  constructor(readonly seed: number) {
    // Minecraft samples single-octave Perlin noises (std ~0.32) at 1.5/256 (toggle) and 1/32 (ridges,
    // gap). Simplex has finer features per unit of frequency, so the frequencies here are lowered to
    // match Minecraft's statistics: ~24 % of the volume in vein regions (MC ~22 %) and ridge sheets
    // ~3.6 blocks thick (MC ~3.7), i.e. vein tubes a few blocks across.
    this.toggle = new OctaveNoise(seed ^ 0x7e1a0, 1 / 256, [1], { sigma: 0.32 });
    this.ridgeA = new OctaveNoise(seed ^ 0x7e1b1, 1 / 50, [1], { sigma: 0.32 });
    this.ridgeB = new OctaveNoise(seed ^ 0x7e1c2, 1 / 50, [1], { sigma: 0.32 });
    this.gap = new OctaveNoise(seed ^ 0x7e1d3, 1 / 48, [1], { sigma: 0.32 });
    this.salt = seed ^ 0x0e7e1;
    this.rawCopper = ST.rawCopperBlock || ST.copperOre;
  }

  /** Replace stone / deepslate of chunk (cx, cz) with vein blocks (y 1..56). */
  apply(cx: number, cz: number, work: Uint16Array): void {
    const x0 = cx * 16, z0 = cz * 16;
    const tg = this.tg, ag = this.ag, bg = this.bg;
    // toggle corners first: most chunks have no vein region at all
    let any = false;
    for (let j = 0; j < LEVELS; j++)
      for (let k = 0; k < 5; k++)
        for (let i = 0; i < 5; i++) {
          const t = this.toggle.noise3(x0 + 4 * i, 8 * j, z0 + 4 * k);
          tg[(j * 5 + k) * 5 + i] = t;
          if (t >= 0.4 ? 8 * j >= CU_MIN - 8 : t <= -0.4 && 8 * j <= FE_MAX + 8) any = true;
        }
    if (!any) return;
    for (let j = 0; j < LEVELS; j++)
      for (let k = 0; k < 5; k++)
        for (let i = 0; i < 5; i++) {
          const n = (j * 5 + k) * 5 + i;
          ag[n] = this.ridgeA.noise3(x0 + 4 * i, 8 * j, z0 + 4 * k);
          bg[n] = this.ridgeB.noise3(x0 + 4 * i, 8 * j, z0 + 4 * k);
        }
    const stone = ST.stone, deepslate = ST.deepslate;
    for (let j = 0; j < CELLS_Y; j++)
      for (let k = 0; k < 4; k++)
        for (let i = 0; i < 4; i++) {
          const n0 = (j * 5 + k) * 5 + i;
          // the interpolated toggle lies between the corner extremes
          let tmin = Infinity, tmax = -Infinity;
          for (const d of CORNERS) {
            const t = tg[n0 + d];
            if (t < tmin) tmin = t;
            if (t > tmax) tmax = t;
          }
          if (tmax < 0.4 && tmin > -0.4) continue;
          for (let dy = 0; dy < 8; dy++) {
            const y = j * 8 + dy;
            const copperBand = y >= CU_MIN && y <= CU_MAX;
            const ironBand = y >= FE_MIN && y <= FE_MAX;
            if (!copperBand && !ironBand) continue;
            const fy = dy / 8;
            for (let dz = 0; dz < 4; dz++) {
              const fz = dz / 4;
              for (let dx = 0; dx < 4; dx++) {
                const fx = dx / 4;
                const t = tri(tg, n0, fx, fy, fz);
                const copper = t > 0;
                if (copper ? !copperBand : !ironBand) continue;
                const d1 = copper ? t : -t;
                // Minecraft: clampedMap(distance to band limit, 0, 20, -0.2, 0)
                const l = copper ? Math.min(CU_MAX - y, y - CU_MIN) : Math.min(FE_MAX - y, y - FE_MIN);
                const fadeLen = copper ? CU_FADE : FE_FADE;
                const fade = l >= fadeLen ? 0 : -0.2 + (0.2 * l) / fadeLen;
                if (d1 + fade < 0.4) continue;
                const lx = i * 4 + dx, lz = k * 4 + dz;
                const idx = (y << 8) | (lz << 4) | lx;
                const s = work[idx];
                if (s !== stone && s !== deepslate) continue;
                const x = x0 + lx, z = z0 + lz;
                const h = hash3i(x, y, z, this.salt);
                if ((h & 1023) >= 717) continue; // nextFloat() > 0.7
                const a = tri(ag, n0, fx, fy, fz), b = tri(bg, n0, fx, fy, fz);
                if ((a < 0 ? -a : a) >= 0.08 || (b < 0 ? -b : b) >= 0.08) continue;
                const d3 = d1 >= 0.6 ? 0.3 : 0.1 + (d1 - 0.4); // clampedMap(d1, 0.4, 0.6, 0.1, 0.3)
                let out: number;
                if (((h >>> 10) & 1023) / 1024 < d3 && this.gap.noise3(x, y, z) > -0.3) {
                  const raw = (h >>> 20) / 4096 < 0.02;
                  if (copper) out = raw ? this.rawCopper : s === deepslate ? ST.dsCopperOre : ST.copperOre;
                  else out = raw ? ST.rawIronBlock : s === stone ? ST.ironOre : ST.dsIronOre;
                } else out = copper ? ST.granite : ST.tuff;
                work[idx] = out;
              }
            }
          }
        }
  }
}

/** Corner offsets of a cell in the corner grids (x stride 1, z stride 5, level stride 25). */
const CORNERS = [0, 1, 5, 6, 25, 26, 30, 31];

/** Trilinear interpolation inside the cell whose minimum corner is grid index n. */
function tri(g: Float32Array, n: number, fx: number, fy: number, fz: number): number {
  const c00 = g[n] + fx * (g[n + 1] - g[n]);
  const c10 = g[n + 5] + fx * (g[n + 6] - g[n + 5]);
  const c01 = g[n + 25] + fx * (g[n + 26] - g[n + 25]);
  const c11 = g[n + 30] + fx * (g[n + 31] - g[n + 30]);
  const c0 = c00 + fz * (c10 - c00);
  const c1 = c01 + fz * (c11 - c01);
  return c0 + fy * (c1 - c0);
}
