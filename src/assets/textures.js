// Procedural texture library: de_dust2 (cs_dust.wad look, circa 2003).
//
// Every texture is painted on the CPU into typed arrays with a seeded PRNG, so the
// output is identical on every run. World textures tile seamlessly and are
// quantised to a 256-colour palette like the original 8-bit WAD3 textures.
//
//   TEXTURES[name] = { size:[w,h], world:[u,v], alpha?, additive?, fit?, frames? }
//     size     canvas pixel size (power of two)
//     world    world units covered by one repeat (~1 texel per unit; the cliff
//              rock is authored at scale 2 so its strata read at cliff size)
//     alpha    RGBA sprite / decal with a transparent background
//     additive glow sprite: drawn on black with opaque alpha, render additively
//     fit      meant to be stretched to fit a whole face (crates, doors, shutters)
//     frames   [cols, rows] sprite-sheet layout (row-major, frame 0 top-left);
//              for sheets `world` is the size of one frame
//     data     the RGBA channels hold shader inputs, not colours (decal_blood_pool)
//
// Opaque textures are authored for 100 % brightness = sunlit (see docs/conventions.md).
// Decals are non-premultiplied RGBA. Additive sprites are colour on black with
// alpha 255; spr_flare is neutral white so it can be tinted.
//
//   generateTexture(name) -> HTMLCanvasElement (a fresh canvas each call)
//   generateAll()         -> Map<name, HTMLCanvasElement>
//   averageColor(name)    -> [r,g,b] 0..255 (alpha / brightness weighted for sprites)
//   generatePixels(name)  -> { w, h, data: Uint8ClampedArray RGBA } (DOM-free, cached)

import { toRGBA, quantize, recycle, drainPool } from './tex/core.js';
import { wallStone, wallStoneBig, wallTunnel, trimBand, trimCap, wallPlaster } from './tex/stone.js';
import { groundSand, groundStone, groundDirt, rock } from './tex/ground.js';
import { crate, crateB, crateGreen, door, shutter, woodBeam, woodPlanks, metal } from './tex/wood.js';
import {
  decalBullet, decalBlood1, decalBlood2, decalBlood3, decalScorch,
  sprMuzzle1, sprMuzzle2, sprMuzzle3, sprSmoke, sprDust, sprSpark, sprExplosion, sprFlare,
} from './tex/fx.js';
import { decalBloodSplats, decalBloodDrops, decalBloodPool, sprBlood } from './tex/blood.js';

export const TEXTURES = {
  // world surfaces
  wall_stone: { size: [128, 128], world: [128, 128] },
  wall_stone_big: { size: [256, 256], world: [256, 256] },
  wall_tunnel: { size: [128, 128], world: [128, 128] },
  trim_band: { size: [128, 32], world: [128, 32] },
  trim_cap: { size: [64, 16], world: [64, 16] },
  ground_sand: { size: [128, 128], world: [128, 128] },
  ground_stone: { size: [256, 256], world: [256, 256] },
  ground_dirt: { size: [128, 128], world: [128, 128] },
  rock: { size: [256, 256], world: [512, 512] },
  crate: { size: [64, 64], world: [64, 64], fit: true },
  crate_b: { size: [64, 64], world: [64, 64], fit: true },
  crate_green: { size: [64, 64], world: [64, 64], fit: true },
  door: { size: [128, 256], world: [64, 128], fit: true },
  shutter: { size: [64, 128], world: [48, 96], fit: true },
  wood_beam: { size: [64, 64], world: [64, 64] },
  wood_planks: { size: [128, 128], world: [128, 128] },
  metal: { size: [64, 64], world: [64, 64] },
  wall_plaster: { size: [128, 128], world: [128, 128] },
  // decals
  decal_bullet: { size: [16, 16], world: [8, 8], alpha: true },
  decal_blood1: { size: [64, 64], world: [64, 64], alpha: true },
  decal_blood2: { size: [64, 64], world: [64, 64], alpha: true },
  decal_blood3: { size: [64, 64], world: [64, 64], alpha: true },
  decal_scorch: { size: [128, 128], world: [128, 128], alpha: true },
  // blood atlases (see tex/blood.js; decal_blood_pool is a data map, not colours)
  decal_blood_splats: { size: [256, 128], world: [64, 64], alpha: true, frames: [4, 2] },
  decal_blood_drops: { size: [128, 128], world: [16, 16], alpha: true, frames: [4, 4] },
  decal_blood_pool: { size: [256, 128], world: [96, 96], alpha: true, frames: [2, 1], data: true },
  // sprites
  spr_muzzle1: { size: [64, 64], world: [24, 24], alpha: true, additive: true },
  spr_muzzle2: { size: [64, 64], world: [24, 24], alpha: true, additive: true },
  spr_muzzle3: { size: [64, 64], world: [24, 24], alpha: true, additive: true },
  spr_smoke: { size: [64, 64], world: [48, 48], alpha: true },
  spr_dust: { size: [64, 64], world: [32, 32], alpha: true },
  spr_spark: { size: [32, 32], world: [8, 8], alpha: true, additive: true },
  spr_explosion: { size: [256, 256], world: [192, 192], alpha: true, additive: true, frames: [4, 4] },
  spr_flare: { size: [32, 32], world: [8, 8], alpha: true, additive: true },
  spr_blood: { size: [64, 64], world: [4, 4], alpha: true, frames: [2, 2] },
};

const GENERATORS = {
  wall_stone: wallStone,
  wall_stone_big: wallStoneBig,
  wall_tunnel: wallTunnel,
  trim_band: trimBand,
  trim_cap: trimCap,
  ground_sand: groundSand,
  ground_stone: groundStone,
  ground_dirt: groundDirt,
  rock,
  crate,
  crate_b: crateB,
  crate_green: crateGreen,
  door,
  shutter,
  wood_beam: woodBeam,
  wood_planks: woodPlanks,
  metal,
  wall_plaster: wallPlaster,
  decal_bullet: decalBullet,
  decal_blood1: decalBlood1,
  decal_blood2: decalBlood2,
  decal_blood3: decalBlood3,
  decal_scorch: decalScorch,
  decal_blood_splats: decalBloodSplats,
  decal_blood_drops: decalBloodDrops,
  decal_blood_pool: decalBloodPool,
  spr_muzzle1: sprMuzzle1,
  spr_muzzle2: sprMuzzle2,
  spr_muzzle3: sprMuzzle3,
  spr_smoke: sprSmoke,
  spr_dust: sprDust,
  spr_spark: sprSpark,
  spr_explosion: sprExplosion,
  spr_flare: sprFlare,
  spr_blood: sprBlood,
};

/** Palettise opaque textures to 256 colours like WAD3 (kept subtle). */
const QUANTIZE = true;

const cache = new Map();

// Scratch buffers are pooled across one synchronous batch of generation and
// released afterwards so they do not stay resident.
let drainPending = false;
function scheduleDrain() {
  if (drainPending || typeof setTimeout !== 'function') return;
  drainPending = true;
  setTimeout(() => {
    drainPending = false;
    drainPool();
  }, 0);
}

/** DOM-free generation; cached. Returns { w, h, data: Uint8ClampedArray (RGBA) }. */
export function generatePixels(name) {
  let e = cache.get(name);
  if (e) return e;
  const meta = TEXTURES[name];
  const gen = GENERATORS[name];
  if (!meta || !gen) throw new Error(`textures: unknown texture "${name}"`);
  let data, img;
  try {
    img = gen();
    if (img.w !== meta.size[0] || img.h !== meta.size[1]) {
      throw new Error(`textures: ${name} generated ${img.w}x${img.h}, expected ${meta.size.join('x')}`);
    }
    data = toRGBA(img);
  } finally {
    recycle();
    scheduleDrain();
  }
  if (QUANTIZE && !meta.alpha) quantize(data, 256);
  e = { w: img.w, h: img.h, data, avg: null };
  cache.set(name, e);
  return e;
}

function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

/** Generate one texture as a canvas (deterministic; a new canvas per call). */
export function generateTexture(name) {
  const p = generatePixels(name);
  const c = makeCanvas(p.w, p.h);
  // CPU-backed canvas: putImageData is a plain copy and WebGL uploads read it directly
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.w, p.h), 0, 0);
  return c;
}

/** Generate every texture. */
export function generateAll() {
  const out = new Map();
  for (const name of Object.keys(TEXTURES)) out.set(name, generateTexture(name));
  drainPool();
  return out;
}

/**
 * Average colour [r,g,b] (0..255). Alpha textures are alpha-weighted; additive
 * sprites are weighted by brightness so the black background does not count.
 */
export function averageColor(name) {
  const p = generatePixels(name);
  if (p.avg) return p.avg.slice();
  const meta = TEXTURES[name];
  const d = p.data;
  let r = 0, g = 0, b = 0, wsum = 0;
  for (let i = 0; i < d.length; i += 4) {
    let wgt = 1;
    if (meta.additive) wgt = Math.max(d[i], d[i + 1], d[i + 2]) / 255;
    else if (meta.alpha) wgt = d[i + 3] / 255;
    r += d[i] * wgt;
    g += d[i + 1] * wgt;
    b += d[i + 2] * wgt;
    wsum += wgt;
  }
  wsum = wsum || 1;
  p.avg = [Math.round(r / wsum), Math.round(g / wsum), Math.round(b / wsum)];
  return p.avg.slice();
}
