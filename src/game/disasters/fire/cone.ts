/**
 * Volcano geometry and materials (pure, no rendering): the stratovolcano plan, its height
 * profile (concave flanks, gullies, summit crater), the rock strata, the uplift order of the
 * columns, lava flow paths and lava bomb ballistics. Unit tested in tests/disasters.fire.test.ts.
 */
import { hash3, noise2 } from '../kit';

export interface VolcanoPlan {
  cx: number;
  cz: number;
  /** Ground level the cone stands on (y of the first cone layer). */
  baseY: number;
  /** Summit (crater rim) height above baseY. */
  H: number;
  /** Base radius. */
  R: number;
  /** Crater radius at the rim. */
  craterR: number;
  /** Crater depth below the rim. */
  craterDepth: number;
  /** Absolute y of the lava lake surface (top lava block). */
  lakeY: number;
  /** Flank concavity exponent. */
  p: number;
  seed: number;
}

/** Plan a volcano at the spawner position. Height 40..70 (clamped to the world top). */
export function planVolcano(x: number, y: number, z: number, seed: number, maxR = 96): VolcanoPlan {
  const baseY = Math.max(1, y);
  let H = 40 + Math.floor(hash3(seed, 1, 7) * 31);
  H = Math.max(18, Math.min(H, 250 - baseY));
  let R = Math.round(H * 1.35);
  if (R > maxR) {
    R = maxR;
    H = Math.min(H, Math.round(R / 1.2));
  }
  const craterR = Math.max(4, Math.round(H * 0.14));
  const craterDepth = Math.max(4, Math.round(craterR * 0.95));
  const lakeY = baseY + H - craterDepth + Math.max(1, Math.round(craterDepth * 0.45)) - 1;
  return { cx: Math.floor(x), cz: Math.floor(z), baseY, H, R, craterR, craterDepth, lakeY, p: 1.65, seed };
}

const smooth = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * Final cone surface height above baseY at column (x,z) (fractional; 0 = outside).
 * Concave flank H·((1-t)/(1-tc))^p with value noise, radial gullies and ridges; a bowl-shaped
 * crater with a raised lip inside craterR.
 */
export function coneHeight(pl: VolcanoPlan, x: number, z: number): number {
  const dx = x - pl.cx, dz = z - pl.cz;
  const r0 = Math.hypot(dx, dz);
  // irregular outline: the radius is perturbed by low-frequency noise
  const warp = 1 + 0.1 * noise2(x / 23, z / 23, pl.seed) + 0.04 * noise2(x / 9, z / 9, pl.seed + 1);
  const r = r0 / warp;
  if (r >= pl.R) return 0;
  const tc = pl.craterR / pl.R;
  const t = r / pl.R;
  if (r < pl.craterR) {
    // crater bowl: floor H - depth, rising to H - 0.35 depth at the inner wall, then the lip
    const k = r / pl.craterR;
    const bowl = pl.H - pl.craterDepth + k * k * pl.craterDepth * 0.55;
    const lip = smooth(0.82, 1, k) * pl.craterDepth * 0.45;
    return bowl + lip + 0.6 * noise2(x / 3, z / 3, pl.seed + 2);
  }
  let h = pl.H * Math.pow((1 - t) / (1 - tc), pl.p);
  // radial gullies / ridges, stronger on the lower flanks
  const a = Math.atan2(dz, dx);
  const g = noise2(Math.cos(a) * 4 + 20, Math.sin(a) * 4 + t * 2.5, pl.seed + 3);
  h *= 1 + 0.13 * g * smooth(0.12, 0.6, t);
  // rough surface
  h += 1.2 * noise2(x / 7, z / 7, pl.seed + 4) * smooth(0.05, 0.3, t) * (1 - t);
  return Math.max(0, h);
}

/** Integer column top (absolute y of the highest cone block), or -1 if outside. */
export function coneTop(pl: VolcanoPlan, x: number, z: number): number {
  const h = coneHeight(pl, x, z);
  if (h < 0.5) return -1;
  return pl.baseY + Math.round(h) - 1;
}

export type Rock = 'basalt' | 'blackstone' | 'tuff' | 'stone' | 'smooth_basalt' | 'andesite' | 'magma_block' | 'gravel' | 'coarse_dirt' | 'cobbled_deepslate';

const LOW: Rock[] = ['stone', 'tuff', 'andesite', 'stone', 'coarse_dirt', 'tuff', 'gravel', 'stone'];
const MID: Rock[] = ['tuff', 'basalt', 'andesite', 'tuff', 'smooth_basalt', 'stone', 'basalt', 'gravel'];
const HIGH: Rock[] = ['basalt', 'blackstone', 'smooth_basalt', 'blackstone', 'basalt', 'tuff', 'cobbled_deepslate', 'blackstone'];

/**
 * Rock at (x,y,z) inside the cone. Strata: noisy 2-4 block thick bands whose palette darkens
 * with elevation (stone/tuff at the foot, basalt/blackstone near the summit), with magma
 * veins near the crater.
 */
export function rockAt(pl: VolcanoPlan, x: number, y: number, z: number): Rock {
  const e = (y - pl.baseY) / pl.H;
  const wob = 2.5 * noise2(x / 17, z / 17, pl.seed + 5);
  const band = Math.floor((y + wob) / 3);
  const hb = hash3(band, 0, 0, pl.seed + 6);
  const pick = hash3(x >> 2, y, z >> 2, pl.seed + 7);
  const pal = e + (hb - 0.5) * 0.25 < 0.33 ? LOW : e + (hb - 0.5) * 0.25 < 0.68 ? MID : HIGH;
  let rock = pal[Math.floor(hb * pal.length)];
  // speckle: a different rock of the same palette
  if (pick < 0.18) rock = pal[Math.floor(hash3(x, y, z, pl.seed + 8) * pal.length)];
  // glowing magma veins around the summit
  const dr = Math.hypot(x - pl.cx, z - pl.cz);
  if (e > 0.72 && dr < pl.craterR * 2.2 && hash3(x, y, z, pl.seed + 9) < 0.06 + (e - 0.72) * 0.3) rock = 'magma_block';
  return rock;
}

/**
 * Column order for the uplift: all cone columns (x,z,top) with integer top >= baseY, sorted
 * by distance from the centre (the summit region is processed first in each sweep).
 */
export function coneColumns(pl: VolcanoPlan): Int32Array {
  const out: number[] = [];
  const R = Math.ceil(pl.R * 1.2) + 1;
  for (let dz = -R; dz <= R; dz++)
    for (let dx = -R; dx <= R; dx++) {
      const x = pl.cx + dx, z = pl.cz + dz;
      const top = coneTop(pl, x, z);
      if (top < pl.baseY) continue;
      out.push(dx * dx + dz * dz, x, z, top);
    }
  const n = out.length / 4;
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => out[a * 4] - out[b * 4]);
  const res = new Int32Array(n * 3);
  for (let i = 0; i < n; i++) {
    res[i * 3] = out[idx[i] * 4 + 1];
    res[i * 3 + 1] = out[idx[i] * 4 + 2];
    res[i * 3 + 2] = out[idx[i] * 4 + 3];
  }
  return res;
}

/** Uplift progress (0..1) at time t of a rise lasting `dur` seconds: fast start, settling end. */
export function riseProgress(t: number, dur: number): number {
  const k = Math.min(1, Math.max(0, t / dur));
  // smoothstep-ish with a quicker start (the ground bulges, then the summit builds)
  return 1 - Math.pow(1 - k, 2.2) * (1 - 0.15 * k);
}

/** Target column height (blocks above baseY, integer) at uplift progress f. */
export function columnHeightAt(finalTop: number, baseY: number, f: number): number {
  const full = finalTop - baseY + 1;
  return Math.max(0, Math.min(full, Math.round(full * f)));
}

// ------------------------------------------------------------------------- lava flows

export type TopFn = (x: number, z: number) => number;

const D8: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Next cell of a lava flow walking downhill from (x,z): the lowest of the 8 neighbours
 * (steepest descent) with inertia toward the previous direction (dirX,dirZ) and noise to break
 * ties; equal-height cells are allowed (spreading over flats), uphill never. `visited` rejects
 * cells already covered by this flow. Returns null when the flow is trapped.
 */
export function nextFlowCell(top: TopFn, x: number, z: number, dirX: number, dirZ: number, visited: (x: number, z: number) => boolean, seed: number, step: number): [number, number] | null {
  const h0 = top(x, z);
  let best: [number, number] | null = null;
  let bestScore = Infinity;
  for (const [dx, dz] of D8) {
    const nx = x + dx, nz = z + dz;
    if (visited(nx, nz)) continue;
    const h = top(nx, nz);
    if (h < 0 || h > h0) continue;
    const diag = dx !== 0 && dz !== 0 ? 1.41 : 1;
    const drop = (h0 - h) / diag;
    const align = (dx * dirX + dz * dirZ) / diag;
    const score = -drop * 1.0 - align * 0.55 + hash3(nx, step, nz, seed) * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = [nx, nz];
    }
  }
  return best;
}

/**
 * A whole flow path (pure helper for tests / planning): repeatedly steps downhill until trapped
 * or `maxLen` cells. Returns [x,z,...].
 */
export function flowPath(top: TopFn, x: number, z: number, dirX: number, dirZ: number, maxLen: number, seed: number): number[] {
  const seen = new Set<number>();
  const key = (a: number, b: number) => (a + 32768) * 65536 + (b + 32768);
  const out = [x, z];
  seen.add(key(x, z));
  let flats = 0;
  for (let i = 0; i < maxLen; i++) {
    const n = nextFlowCell(top, x, z, dirX, dirZ, (a, b) => seen.has(key(a, b)), seed, i);
    if (!n) break;
    if (top(n[0], n[1]) === top(x, z)) {
      if (++flats > 10) break;
    } else flats = 0;
    dirX = dirX * 0.6 + (n[0] - x) * 0.4;
    dirZ = dirZ * 0.6 + (n[1] - z) * 0.4;
    x = n[0];
    z = n[1];
    seen.add(key(x, z));
    out.push(x, z);
  }
  return out;
}

// ------------------------------------------------------------------------- bombs

/** Ballistic position at time t (gravity g, b/s²). */
export function ballistic(x0: number, y0: number, z0: number, vx: number, vy: number, vz: number, g: number, t: number): [number, number, number] {
  return [x0 + vx * t, y0 + vy * t - 0.5 * g * t * t, z0 + vz * t];
}

/** Horizontal range of a projectile landing `drop` blocks below its launch height. */
export function ballisticRange(speed: number, elev: number, g: number, drop: number): number {
  const vy = speed * Math.sin(elev), vh = speed * Math.cos(elev);
  const t = (vy + Math.sqrt(vy * vy + 2 * g * Math.max(0, drop))) / g;
  return vh * t;
}
