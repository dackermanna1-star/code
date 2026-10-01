// Shared modeling toolkit for prop generators: builder with placement
// conventions, palette presets, shape primitives (lathe, blobs, tubes, SDF
// fills), weathering passes (grime, rust, streaks, chips, dents), canvas paint
// / text rasterization and part composition.
//
// Coordinates: most helpers work in voxel units of the builder grid. `b.m(x)`
// converts a length in meters to voxels (rounded) and `b.vx/vy/vz` convert a
// local position in meters to (fractional) voxel coordinates.
import * as THREE from 'three';
import { VoxelGrid, Palette, VoxelModel } from '../voxel/VoxelGrid.js';
import { MCLS } from '../render/voxelMaterial.js';
import { VS_FINE, VS_MED } from '../world/units.js';
import { smoothstep, clamp, lerp } from '../core/noise.js';
import { hash3i } from '../core/rng.js';

export { VoxelGrid, Palette, VoxelModel, MCLS, VS_FINE, VS_MED, smoothstep, clamp, lerp };

// ───────────────────────────── fast value noise ─────────────────────────────
// Permutation-table value noise (period 256), ~10x faster than the hash-based
// noise in core/noise.js; same call signatures (output in [0,1]).
const PERM = new Uint8Array(512);
const VAL = new Float32Array(256);
{
  let s = 0x2545f491;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  for (let i = 0; i < 256; i++) VAL[i] = r();
}
const fade = (t) => t * t * (3 - 2 * t);
function seedOff(seed) {
  const h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return [h & 255, (h >>> 8) & 255, (h >>> 16) & 255];
}
const _so = new Map();
const so = (seed) => {
  let r = _so.get(seed);
  if (!r) {
    r = seedOff(seed);
    if (_so.size > 4096) _so.clear();
    _so.set(seed, r);
  }
  return r;
};

export function valueNoise3(x, y, z, seed = 0) {
  const o = so(seed);
  const xf = Math.floor(x), yf = Math.floor(y), zf = Math.floor(z);
  const xi = (xf + o[0]) & 255, yi = (yf + o[1]) & 255, zi = (zf + o[2]) & 255;
  const u = fade(x - xf), v = fade(y - yf), w = fade(z - zf);
  const a = PERM[xi] + yi, b = PERM[xi + 1] + yi;
  const aa = PERM[a & 511] + zi, ab = PERM[(a + 1) & 511] + zi, ba = PERM[b & 511] + zi, bb = PERM[(b + 1) & 511] + zi;
  const x00 = VAL[PERM[aa & 511]] + (VAL[PERM[ba & 511]] - VAL[PERM[aa & 511]]) * u;
  const x10 = VAL[PERM[ab & 511]] + (VAL[PERM[bb & 511]] - VAL[PERM[ab & 511]]) * u;
  const x01 = VAL[PERM[(aa + 1) & 511]] + (VAL[PERM[(ba + 1) & 511]] - VAL[PERM[(aa + 1) & 511]]) * u;
  const x11 = VAL[PERM[(ab + 1) & 511]] + (VAL[PERM[(bb + 1) & 511]] - VAL[PERM[(ab + 1) & 511]]) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

export function valueNoise2(x, y, seed = 0) {
  return valueNoise3(x, y, 0.5, seed);
}

export function fbm3(x, y, z, octaves = 3, seed = 0) {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3(x * f, y * f, z * f, seed + i * 131);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

export function fbm2(x, y, octaves = 3, seed = 0) {
  return fbm3(x, y, 0.5, octaves, seed);
}

/** Extra-fine voxel size for tiny debris (cigarette butts, caps, cans, shards, leaves, sign faces). */
export const VS_XFINE = VS_FINE / 2;

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

// ───────────────────────────── colours ─────────────────────────────

export const rgbMul = (c, k) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
export const rgbMix = (a, b, t) => a.map((v, i) => Math.max(0, Math.min(255, Math.round(v + (b[i] - v) * t))));
export const rgbAdd = (c, d) => c.map((v, i) => Math.max(0, Math.min(255, Math.round(v + (Array.isArray(d) ? d[i] : d)))));
/** Random brightness / hue jitter (amt ~ 0.05..0.15). */
export function rgbJitter(rng, c, amt = 0.08, hue = 0.03) {
  const k = 1 + rng.range(-amt, amt);
  return c.map((v) => Math.max(0, Math.min(255, Math.round(v * k * (1 + rng.range(-hue, hue))))));
}
export const desat = (c, t) => {
  const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  return c.map((v) => Math.round(v + (l - v) * t));
};

// Common realistic colours (sRGB 0-255)
export const COL = {
  rustDark: [64, 33, 20],
  rust: [98, 50, 26],
  rustLight: [132, 70, 34],
  rustOrange: [150, 82, 38],
  grime: [44, 38, 32],
  mud: [62, 52, 40],
  galv: [150, 153, 152],
  galvDark: [112, 115, 116],
  steelDark: [48, 48, 50],
  concrete: [126, 124, 118],
  concreteDark: [96, 94, 90],
  asphalt: [40, 40, 42],
  woodGrey: [116, 110, 100],
  woodPallet: [148, 120, 86],
  woodDark: [86, 70, 54],
  cardboard: [154, 116, 76],
  cardboardWet: [112, 82, 54],
  bagBlack: [20, 20, 22],
  bagWhite: [196, 196, 190],
  rubber: [26, 26, 27],
  paperWhite: [206, 202, 190],
  foam: [218, 214, 200],
};

// ───────────────────────────── materials ─────────────────────────────

/** Palette entry presets. Each returns an index (reuses entries by name). */
export const mat = {
  paint: (P, name, color, o = {}) => P.add(name, { color, rough: 0.62, metal: 0.25, cls: MCLS.METAL_PAINTED, vari: 0.07, ...o }),
  rust: (P, name = 'rust', color = COL.rust, o = {}) => P.add(name, { color, rough: 0.92, metal: 0.2, cls: MCLS.RUST, vari: 0.14, ...o }),
  // galvanized steel: GENERIC metal by default (the GALV shader class mottles strongly; pass
  // { cls: MCLS.GALV } explicitly for large galvanized surfaces seen from afar)
  galv: (P, name = 'galv', color = COL.galv, o = {}) => P.add(name, { color, rough: 0.45, metal: 0.7, cls: (globalThis.__propsGalvCls ?? MCLS.GENERIC), vari: 0.08, ...o }),
  steel: (P, name = 'steel', color = COL.steelDark, o = {}) => P.add(name, { color, rough: 0.5, metal: 0.7, cls: MCLS.GENERIC, vari: 0.08, ...o }),
  plastic: (P, name, color, o = {}) => P.add(name, { color, rough: 0.5, metal: 0, cls: MCLS.PLASTIC, vari: 0.05, ...o }),
  rubber: (P, name = 'rubber', color = COL.rubber, o = {}) => P.add(name, { color, rough: 0.85, metal: 0, cls: MCLS.RUBBER, vari: 0.06, ...o }),
  wood: (P, name, color, o = {}) => P.add(name, { color, rough: 0.88, metal: 0, cls: MCLS.WOOD, vari: 0.1, ...o }),
  cardboard: (P, name, color = COL.cardboard, o = {}) => P.add(name, { color, rough: 0.92, metal: 0, cls: MCLS.CARDBOARD, vari: 0.08, ...o }),
  paper: (P, name, color = COL.paperWhite, o = {}) => P.add(name, { color, rough: 0.9, metal: 0, cls: MCLS.PAPER, vari: 0.06, ...o }),
  fabric: (P, name, color, o = {}) => P.add(name, { color, rough: 0.95, metal: 0, cls: MCLS.FABRIC, vari: 0.08, ...o }),
  glass: (P, name, color, o = {}) => P.add(name, { color, rough: 0.06, metal: 0, cls: MCLS.GLASS, vari: 0.04, ...o }),
  concrete: (P, name = 'concrete', color = COL.concrete, o = {}) => P.add(name, { color, rough: 0.93, metal: 0, cls: MCLS.CONCRETE, vari: 0.08, ...o }),
  brick: (P, name, color, o = {}) => P.add(name, { color, rough: 0.9, metal: 0, cls: MCLS.BRICK, vari: 0.1, ...o }),
  bag: (P, name = 'bag', color = COL.bagBlack, o = {}) => P.add(name, { color, rough: 0.3, metal: 0, cls: MCLS.TRASHBAG, vari: 0.12, ...o }),
  organic: (P, name, color, o = {}) => P.add(name, { color, rough: 0.8, metal: 0, cls: MCLS.ORGANIC, vari: 0.12, ...o }),
  wire: (P, name = 'wire', color = [30, 30, 30], o = {}) => P.add(name, { color, rough: 0.5, metal: 0.1, cls: MCLS.WIRE, vari: 0.04, ...o }),
  emissive: (P, name = 'lamp', color = [255, 214, 160], o = {}) => P.add(name, { color, rough: 0.3, metal: 0, cls: MCLS.EMISSIVE, vari: 0.02, ...o }),
  generic: (P, name, color, o = {}) => P.add(name, { color, rough: 0.8, metal: 0, cls: MCLS.GENERIC, vari: 0.08, ...o }),
};

/** Derived palette entry (name~tag) from an existing entry; fn(entryCopy) => entry. Cached by name. */
export function variant(P, idx, tag, fn) {
  const e = P.entries[idx];
  if (!e) return idx;
  const name = `${e.name}~${tag}`;
  if (P.byName.has(name)) return P.byName.get(name);
  const ne = fn({ color: e.color.slice(), rough: e.rough, metal: e.metal, cls: e.cls, vari: e.vari });
  return P.add(name, ne);
}

/** Standard derived variants used by the weathering passes. */
export const V = {
  dirt: (P, i, k = 0.62) => variant(P, i, `dirt${k}`, (e) => ({ ...e, color: rgbMix(rgbMul(e.color, k), COL.mud, 0.25), rough: Math.min(1, e.rough + 0.15), metal: e.metal * 0.5 })),
  dark: (P, i, k = 0.75) => variant(P, i, `dark${k}`, (e) => ({ ...e, color: rgbMul(e.color, k) })),
  light: (P, i, k = 1.18) => variant(P, i, `light${k}`, (e) => ({ ...e, color: rgbMul(e.color, k) })),
  faded: (P, i, t = 0.25) => variant(P, i, `fade${t}`, (e) => ({ ...e, color: rgbMix(desat(e.color, t * 1.6), [150, 150, 146], t), rough: Math.min(1, e.rough + 0.1) })),
  rust: (P, i, shade = 1) => variant(P, i, `rust${shade}`, (e) => ({ color: rgbMix(rgbMul([84, 44, 26], shade), e.color, 0.15), rough: 0.9, metal: 0.12, cls: MCLS.GENERIC, vari: 0.14 })),
  rustHeavy: (P, i) => variant(P, i, 'rustH', (e) => ({ color: [70, 38, 24], rough: 0.92, metal: 0.15, cls: MCLS.RUST, vari: 0.16 })),
  rustStreak: (P, i, t = 0.45) => variant(P, i, `rstreak${t}`, (e) => ({ ...e, color: rgbMix(e.color, [84, 44, 24], t), rough: Math.min(1, e.rough + 0.1) })),
  tone: (P, i, k = 1.05, sat = 0) => variant(P, i, `tone${k}_${sat}`, (e) => ({ ...e, color: rgbMul(sat ? desat(e.color, sat) : e.color, k) })),
  wetDark: (P, i, k = 0.7) => variant(P, i, `wet${k}`, (e) => ({ ...e, color: rgbMul(e.color, k), rough: Math.max(0.15, e.rough * 0.55) })),
  primer: (P, i) => variant(P, i, 'primer', (e) => ({ ...e, color: [112, 58, 46], cls: MCLS.GENERIC, metal: 0.1, rough: 0.8 })),
  bare: (P, i) => variant(P, i, 'bare', (e) => ({ ...e, color: [96, 96, 98], cls: MCLS.GENERIC, metal: 0.75, rough: 0.45 })),
  grease: (P, i) => variant(P, i, 'grease', (e) => ({ ...e, color: rgbMix(rgbMul(e.color, 0.45), [40, 30, 14], 0.4), rough: 0.18, metal: e.metal * 0.6 })),
};

// ───────────────────────────── builder ─────────────────────────────

/**
 * Voxel builder: grid + palette + placement convention.
 * mount: 'floor'   origin at footprint centre, y = 0 at the bottom of the grid
 *        'wall'    origin at bottom centre of the back plane (z = 0), extends +z
 *        'center'  centred on all axes
 *        'corner'  origin at voxel (0,0,0)
 *        [x,y,z]   explicit origin (meters, position of voxel 0,0,0 corner)
 */
export class VB {
  constructor(nx, ny, nz, vs, mount = 'floor') {
    this.nx = Math.max(1, Math.round(nx));
    this.ny = Math.max(1, Math.round(ny));
    this.nz = Math.max(1, Math.round(nz));
    this.vs = vs;
    this.g = new VoxelGrid(this.nx, this.ny, this.nz);
    this.P = new Palette();
    this.setMount(mount);
  }

  static m(w, h, d, vs, mount) {
    return new VB(Math.round(w / vs), Math.round(h / vs), Math.round(d / vs), vs, mount);
  }

  setMount(mount) {
    const { nx, ny, nz, vs } = this;
    const W = nx * vs, H = ny * vs, D = nz * vs;
    this.mount = mount;
    if (Array.isArray(mount)) this.origin = mount.slice();
    else if (mount === 'floor') this.origin = [-W / 2, 0, -D / 2];
    else if (mount === 'wall') this.origin = [-W / 2, 0, 0];
    else if (mount === 'center') this.origin = [-W / 2, -H / 2, -D / 2];
    else this.origin = [0, 0, 0];
  }

  /** meters -> voxels (rounded length) */
  m(x) {
    return Math.round(x / this.vs);
  }
  /** local meters -> fractional voxel coordinate */
  vx(x) {
    return (x - this.origin[0]) / this.vs;
  }
  vy(y) {
    return (y - this.origin[1]) / this.vs;
  }
  vz(z) {
    return (z - this.origin[2]) / this.vs;
  }
  /** voxel coordinate (corner) -> local meters */
  mx(i) {
    return this.origin[0] + i * this.vs;
  }
  my(i) {
    return this.origin[1] + i * this.vs;
  }
  mz(i) {
    return this.origin[2] + i * this.vs;
  }

  get(x, y, z) {
    return this.g.get(x, y, z);
  }
  set(x, y, z, v) {
    this.g.set(x, y, z, v);
  }
  box(x0, y0, z0, x1, y1, z1, v) {
    this.g.box(x0, y0, z0, x1, y1, z1, v);
  }
  /** Box only where currently empty. */
  boxE(x0, y0, z0, x1, y1, z1, v) {
    this.g.boxIf(x0, y0, z0, x1, y1, z1, v, (c) => c === 0);
  }
  /** Box replacing only solid voxels. */
  boxS(x0, y0, z0, x1, y1, z1, v) {
    this.g.boxIf(x0, y0, z0, x1, y1, z1, v, (c) => c !== 0);
  }
  /** Hollow box shell (walls of thickness t), optional open faces {px,nx,py,ny,pz,nz}. */
  shell(x0, y0, z0, x1, y1, z1, t, v, open = {}) {
    const g = this.g;
    if (!open.ny) g.box(x0, y0, z0, x1, y0 + t, z1, v);
    if (!open.py) g.box(x0, y1 - t, z0, x1, y1, z1, v);
    if (!open.nx) g.box(x0, y0, z0, x0 + t, y1, z1, v);
    if (!open.px) g.box(x1 - t, y0, z0, x1, y1, z1, v);
    if (!open.nz) g.box(x0, y0, z0, x1, y1, z0 + t, v);
    if (!open.pz) g.box(x0, y0, z1 - t, x1, y1, z1, v);
  }
  /** Calls fn(x+.5,y+.5,z+.5, x,y,z) for voxels in a box; non-undefined return sets the voxel. */
  fill(x0, y0, z0, x1, y1, z1, fn) {
    const g = this.g;
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    z0 = Math.max(0, Math.floor(z0));
    x1 = Math.min(g.nx, Math.ceil(x1));
    y1 = Math.min(g.ny, Math.ceil(y1));
    z1 = Math.min(g.nz, Math.ceil(z1));
    const { nx, ny, data } = g;
    for (let z = z0; z < z1; z++)
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const r = fn(x + 0.5, y + 0.5, z + 0.5, x, y, z);
          if (r !== undefined) data[x + nx * (y + ny * z)] = r;
        }
  }
  line(ax, ay, az, bx, by, bz, r, v) {
    this.g.line(ax, ay, az, bx, by, bz, r, v);
  }
  /** Polyline capsule chain. pts: [[x,y,z],...] voxel units. */
  poly(pts, r, v) {
    for (let i = 0; i + 1 < pts.length; i++) this.g.line(...pts[i], ...pts[i + 1], r, v);
  }
  model(origin) {
    return new VoxelModel(this.g, this.P, this.vs, origin ?? this.origin);
  }
  sizeM() {
    return [this.nx * this.vs, this.ny * this.vs, this.nz * this.vs];
  }
}

export function emptyModel(vs = VS_FINE) {
  const P = new Palette();
  return new VoxelModel(new VoxelGrid(1, 1, 1), P, vs, [0, 0, 0]);
}

// ───────────────────────────── shapes ─────────────────────────────

/**
 * Surface of revolution around a vertical axis at (cx, cz) (voxel units).
 * prof(y) -> [rOuter, rInner] (rInner <= 0: solid disc) or null to skip the layer.
 * v: palette index or fn(x,y,z,ang,r) -> index.
 */
export function lathe(b, cx, cz, y0, y1, prof, v) {
  const g = b.g;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(g.ny, Math.ceil(y1)); y++) {
    const pr = prof(y + 0.5);
    if (!pr) continue;
    const [ro, ri] = pr;
    if (ro <= 0) continue;
    const ro2 = ro * ro, ri2 = ri > 0 ? ri * ri : -1;
    for (let z = Math.floor(cz - ro - 1); z <= Math.ceil(cz + ro + 1); z++)
      for (let x = Math.floor(cx - ro - 1); x <= Math.ceil(cx + ro + 1); x++) {
        const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 <= ro2 && d2 >= ri2) {
          const val = typeof v === 'function' ? v(x, y, z, Math.atan2(dz, dx), Math.sqrt(d2)) : v;
          if (val !== undefined) g.set(x, y, z, val);
        }
      }
  }
}

/** Lathe around the X axis (profile along x): prof(x) -> [rOuter, rInner]. */
export function latheX(b, cy, cz, x0, x1, prof, v) {
  const g = b.g;
  for (let x = Math.max(0, Math.floor(x0)); x < Math.min(g.nx, Math.ceil(x1)); x++) {
    const pr = prof(x + 0.5);
    if (!pr) continue;
    const [ro, ri] = pr;
    if (ro <= 0) continue;
    const ro2 = ro * ro, ri2 = ri > 0 ? ri * ri : -1;
    for (let z = Math.floor(cz - ro - 1); z <= Math.ceil(cz + ro + 1); z++)
      for (let y = Math.floor(cy - ro - 1); y <= Math.ceil(cy + ro + 1); y++) {
        const dy = y + 0.5 - cy, dz = z + 0.5 - cz;
        const d2 = dy * dy + dz * dz;
        if (d2 <= ro2 && d2 >= ri2) {
          const val = typeof v === 'function' ? v(x, y, z, Math.atan2(dz, dy), Math.sqrt(d2)) : v;
          if (val !== undefined) g.set(x, y, z, val);
        }
      }
  }
}

/** Lathe around the Z axis: prof(z) -> [rOuter, rInner]. */
export function latheZ(b, cx, cy, z0, z1, prof, v) {
  const g = b.g;
  for (let z = Math.max(0, Math.floor(z0)); z < Math.min(g.nz, Math.ceil(z1)); z++) {
    const pr = prof(z + 0.5);
    if (!pr) continue;
    const [ro, ri] = pr;
    if (ro <= 0) continue;
    const ro2 = ro * ro, ri2 = ri > 0 ? ri * ri : -1;
    for (let y = Math.floor(cy - ro - 1); y <= Math.ceil(cy + ro + 1); y++)
      for (let x = Math.floor(cx - ro - 1); x <= Math.ceil(cx + ro + 1); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= ro2 && d2 >= ri2) {
          const val = typeof v === 'function' ? v(x, y, z, Math.atan2(dy, dx), Math.sqrt(d2)) : v;
          if (val !== undefined) g.set(x, y, z, val);
        }
      }
  }
}

/** Torus around Y axis: major radius R, minor radius r (voxel units). */
export function torusY(b, cx, cy, cz, R, r, v, filter) {
  b.fill(cx - R - r - 1, cy - r - 1, cz - R - r - 1, cx + R + r + 1, cy + r + 1, cz + R + r + 1, (px, py, pz, x, y, z) => {
    const dx = px - cx, dy = py - cy, dz = pz - cz;
    const q = Math.sqrt(dx * dx + dz * dz) - R;
    if (q * q + dy * dy <= r * r && (!filter || filter(x, y, z, Math.atan2(dz, dx)))) return v;
    return undefined;
  });
}

/** Torus around X axis (ring in the YZ plane). */
export function torusX(b, cx, cy, cz, R, r, v, filter) {
  b.fill(cx - r - 1, cy - R - r - 1, cz - R - r - 1, cx + r + 1, cy + R + r + 1, cz + R + r + 1, (px, py, pz, x, y, z) => {
    const dx = px - cx, dy = py - cy, dz = pz - cz;
    const q = Math.sqrt(dy * dy + dz * dz) - R;
    if (q * q + dx * dx <= r * r && (!filter || filter(x, y, z, Math.atan2(dz, dy)))) return v;
    return undefined;
  });
}

/** Torus around Z axis (ring in the XY plane). */
export function torusZ(b, cx, cy, cz, R, r, v, filter) {
  b.fill(cx - R - r - 1, cy - R - r - 1, cz - r - 1, cx + R + r + 1, cy + R + r + 1, cz + r + 1, (px, py, pz, x, y, z) => {
    const dx = px - cx, dy = py - cy, dz = pz - cz;
    const q = Math.sqrt(dx * dx + dy * dy) - R;
    if (q * q + dz * dz <= r * r && (!filter || filter(x, y, z, Math.atan2(dy, dx)))) return v;
    return undefined;
  });
}

/**
 * Lumpy blob (bags, sacks, piles). shape(px,py,pz) returns a normalized "radius"
 * (<1 inside) before lumps; bumps: [{x,y,z,r,a}] in voxel units add a*exp(-d²/r²);
 * noise adds wrinkles. Returns count.
 */
export function blob(b, bbox, shapeFn, v, { bumps = [], noiseAmp = 0.06, noiseFreq = 0.18, seed = 1 } = {}) {
  let count = 0;
  const [x0, y0, z0, x1, y1, z1] = bbox;
  b.fill(x0, y0, z0, x1, y1, z1, (px, py, pz, x, y, z) => {
    let r = shapeFn(px, py, pz);
    if (r > 1.6) return undefined;
    for (let i = 0; i < bumps.length; i++) {
      const k = bumps[i];
      const dx = px - k.x, dy = py - k.y, dz = pz - k.z;
      r -= k.a * Math.exp(-(dx * dx + dy * dy + dz * dz) / (k.r * k.r));
    }
    if (noiseAmp) r += (valueNoise3(px * noiseFreq, py * noiseFreq, pz * noiseFreq, seed) - 0.5) * 2 * noiseAmp;
    if (r < 1) {
      count++;
      return typeof v === 'function' ? v(x, y, z, r) : v;
    }
    return undefined;
  });
  return count;
}

/**
 * Fill from a smooth scalar field sampled on a coarse lattice (every `step` voxels) and
 * trilinearly interpolated - ~step³ cheaper for smooth organic shapes. field(px,py,pz)
 * (voxel-space centre coords) returns < 1 inside. val(x,y,z,r) -> index | undefined.
 */
export function fieldFill(b, x0, y0, z0, x1, y1, z1, field, val, step = 2) {
  const g = b.g;
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  z0 = Math.max(0, Math.floor(z0));
  x1 = Math.min(g.nx, Math.ceil(x1));
  y1 = Math.min(g.ny, Math.ceil(y1));
  z1 = Math.min(g.nz, Math.ceil(z1));
  if (step <= 1) {
    b.fill(x0, y0, z0, x1, y1, z1, (px, py, pz, x, y, z) => {
      const r = field(px, py, pz);
      return r < 1.25 ? val(x, y, z, r) : undefined;
    });
    return;
  }
  const lx = Math.ceil((x1 - x0) / step) + 2, ly = Math.ceil((y1 - y0) / step) + 2, lz = Math.ceil((z1 - z0) / step) + 2;
  const F = new Float32Array(lx * ly * lz);
  for (let k = 0; k < lz; k++)
    for (let j = 0; j < ly; j++)
      for (let i = 0; i < lx; i++) F[i + lx * (j + ly * k)] = field(x0 + i * step, y0 + j * step, z0 + k * step);
  const { nx, ny, data } = g;
  for (let z = z0; z < z1; z++) {
    const fz = (z + 0.5 - z0) / step, k = Math.floor(fz), tz = fz - k;
    for (let y = y0; y < y1; y++) {
      const fy = (y + 0.5 - y0) / step, j = Math.floor(fy), ty = fy - j;
      for (let x = x0; x < x1; x++) {
        const fx = (x + 0.5 - x0) / step, i = Math.floor(fx), tx = fx - i;
        const o = i + lx * (j + ly * k);
        const a00 = F[o] + (F[o + 1] - F[o]) * tx;
        const a10 = F[o + lx] + (F[o + lx + 1] - F[o + lx]) * tx;
        const a01 = F[o + lx * ly] + (F[o + lx * ly + 1] - F[o + lx * ly]) * tx;
        const a11 = F[o + lx * ly + lx] + (F[o + lx * ly + lx + 1] - F[o + lx * ly + lx]) * tx;
        const r = (a00 + (a10 - a00) * ty) * (1 - tz) + (a01 + (a11 - a01) * ty) * tz;
        if (r >= 1.25) continue;
        const v = val(x, y, z, r);
        if (v !== undefined) data[x + nx * (y + ny * z)] = v;
      }
    }
  }
}

/** 2D point-in-polygon (even-odd). poly: [[u,v],...] */
export function inPoly(u, v, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ui, vi] = poly[i], [uj, vj] = poly[j];
    if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi + 1e-12) + ui) inside = !inside;
  }
  return inside;
}

/** Distance from point to polygon boundary. */
export function polyDist(u, v, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const abx = bx - ax, aby = by - ay;
    const l2 = abx * abx + aby * aby || 1e-9;
    let t = ((u - ax) * abx + (v - ay) * aby) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = u - ax - abx * t, dy = v - ay - aby * t;
    const d = dx * dx + dy * dy;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * Extrude a 2D polygon profile. axis 'x': profile in (z,y) extruded over x in [a0,a1);
 * 'z': profile in (x,y) over z; 'y': profile in (x,z) over y.
 * shellT > 0 keeps only a shell of that thickness (inside the polygon).
 */
export function extrude(b, axis, poly, a0, a1, v, shellT = 0) {
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  for (const [u, w] of poly) {
    umin = Math.min(umin, u);
    umax = Math.max(umax, u);
    vmin = Math.min(vmin, w);
    vmax = Math.max(vmax, w);
  }
  const mask = [];
  for (let w = Math.floor(vmin); w < Math.ceil(vmax); w++)
    for (let u = Math.floor(umin); u < Math.ceil(umax); u++) {
      const pu = u + 0.5, pw = w + 0.5;
      if (!inPoly(pu, pw, poly)) continue;
      if (shellT > 0 && polyDist(pu, pw, poly) > shellT) continue;
      mask.push(u, w);
    }
  const g = b.g;
  for (let a = Math.max(0, Math.round(a0)); a < Math.round(a1); a++)
    for (let i = 0; i < mask.length; i += 2) {
      const u = mask[i], w = mask[i + 1];
      const val = typeof v === 'function' ? v(a, u, w) : v;
      if (val === undefined) continue;
      if (axis === 'x') g.set(a, w, u, val);
      else if (axis === 'z') g.set(u, w, a, val);
      else g.set(u, a, w, val);
    }
}

// ───────────────────────────── surface iteration ─────────────────────────────

export const F_NX = 1, F_PX = 2, F_NY = 4, F_PY = 8, F_NZ = 16, F_PZ = 32;

/** Exposed-face mask of a voxel (0 if empty or fully buried). */
export function exposure(g, x, y, z) {
  if (!g.get(x, y, z)) return 0;
  let m = 0;
  if (!g.get(x - 1, y, z)) m |= F_NX;
  if (!g.get(x + 1, y, z)) m |= F_PX;
  if (!g.get(x, y - 1, z)) m |= F_NY;
  if (!g.get(x, y + 1, z)) m |= F_PY;
  if (!g.get(x, y, z - 1)) m |= F_NZ;
  if (!g.get(x, y, z + 1)) m |= F_PZ;
  return m;
}

/** fn(v, x, y, z, faceMask, i) for every surface voxel (optionally only materials in set). */
export function eachSurface(g, fn, only) {
  const { nx, ny, nz, data } = g;
  const sx = 1, sy = nx, sz = nx * ny;
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const i = x + nx * (y + ny * z);
        const v = data[i];
        if (!v) continue;
        if (only && !only.has(v)) continue;
        let m = 0;
        if (x === 0 || !data[i - sx]) m |= F_NX;
        if (x === nx - 1 || !data[i + sx]) m |= F_PX;
        if (y === 0 || !data[i - sy]) m |= F_NY;
        if (y === ny - 1 || !data[i + sy]) m |= F_PY;
        if (z === 0 || !data[i - sz]) m |= F_NZ;
        if (z === nz - 1 || !data[i + sz]) m |= F_PZ;
        if (m) fn(v, x, y, z, m, i);
      }
}

const bitCount = (m) => ((m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1) + ((m >> 4) & 1) + ((m >> 5) & 1));

// ───────────────────────────── weathering ─────────────────────────────

/**
 * Material family filter: matches the given palette indices and every variant derived
 * from them (entries named "base~tag..."). Passing null matches everything.
 */
export function famSet(P, mats) {
  if (mats == null) return null;
  if (mats.isFam) return mats;
  const base = mats instanceof Set ? mats : new Set(Array.isArray(mats) ? mats : [mats]);
  const names = new Set([...base].map((i) => P.entries[i]?.name).filter(Boolean));
  const cache = new Map();
  return {
    isFam: true,
    has(i) {
      let r = cache.get(i);
      if (r === undefined) {
        const e = P.entries[i];
        r = !!e && (base.has(i) || names.has(e.name.split('~')[0]));
        cache.set(i, r);
      }
      return r;
    },
  };
}

/**
 * Darken / dirty surface voxels near the bottom. h = height (voxels) of the dirt band.
 * amount 0..1. Patchy via noise.
 */
export function grime(b, mats, { h = 10, amount = 0.6, seed = 1, k = 0.62, freq = 0.08, y0 = 0 } = {}) {
  const only = famSet(b.P, mats);
  const set = [];
  eachSurface(b.g, (v, x, y, z) => {
    const t = 1 - (y - y0) / h;
    if (t <= 0) return;
    const n = fbm3(x * freq, y * freq * 1.5, z * freq, 2, seed);
    const s = n * 0.75 + t * amount;
    if (s > 0.72) set.push(x, y, z, V.dirt(b.P, v, s > 0.95 ? k * 0.85 : k));
  }, only);
  for (let i = 0; i < set.length; i += 4) b.g.set(set[i], set[i + 1], set[i + 2], set[i + 3]);
}

/** Generic noise-driven recolour of surface voxels: pick(v, x,y,z, n, mask) -> new index or undefined. */
export function recolor(b, mats, fn, { freq = 0.15, seed = 3, octaves = 2 } = {}) {
  const only = famSet(b.P, mats);
  const set = [];
  eachSurface(b.g, (v, x, y, z, m) => {
    const n = fbm3(x * freq, y * freq, z * freq, octaves, seed);
    const r = fn(v, x, y, z, n, m);
    if (r !== undefined && r !== v) set.push(x, y, z, r);
  }, only);
  for (let i = 0; i < set.length; i += 4) b.g.set(set[i], set[i + 1], set[i + 2], set[i + 3]);
}

/**
 * Rust on painted metal, physically placed: a ragged band along the bottom (height
 * `bottom` voxels above y0), rust on exposed edges, and optional blotches. amount ~0..1.
 * Coarse patches (low-frequency noise) keep greedy meshing efficient; the shader adds
 * per-voxel variation.
 */
export function rust(b, mats, { amount = 0.4, seed = 5, bottom = 3, y0 = 0, freq = 0.08, edges = true, blotch = false } = {}) {
  recolor(b, mats, (v, x, y, z, n, m) => {
    const n2 = valueNoise3(x * freq * 2.7, y * freq * 2.7, z * freq * 2.7, seed + 17);
    if (bottom > 0) {
      const top = y0 + bottom * (0.3 + 1.1 * n) * (0.5 + amount);
      if (y < top) return V.rust(b.P, v, y < y0 + (top - y0) * 0.5 ? 0.85 : 1.1);
    }
    if (edges && bitCount(m) >= 3 && n2 > 0.82 - amount * 0.3) return V.rust(b.P, v, 1.0);
    if (blotch && n > 0.86 - amount * 0.12 && n2 > 0.5) return V.rust(b.P, v, n2 > 0.72 ? 0.85 : 1.1);
    return undefined;
  }, { freq, seed, octaves: 2 });
}

/**
 * Low-frequency tonal variation of paint (uneven fading / old repaints): mixes two subtle
 * variants in large soft patches.
 */
export function mottle(b, mats, { freq = 0.04, seed = 9, k = [0.92, 1.07], sat = 0.1, cover = 0.33 } = {}) {
  recolor(b, mats, (v, x, y, z, n) => {
    if (n < cover) return V.tone(b.P, v, k[0], 0);
    if (n > 1 - cover) return V.tone(b.P, v, k[1], sat);
    return undefined;
  }, { freq, seed, octaves: 1 });
}

/**
 * Vertical streaks running down vertical faces (rust / dirt / grease drips).
 * sources: count of random start points or explicit [[x,y,z],...].
 */
export function streaks(b, rng, mats, { count = 8, len = [6, 30], width = 1, kind = 'rust', t = 0.45, sources = null, yMin = 0, yMax = null } = {}) {
  const g = b.g;
  const only = famSet(b.P, mats) ?? { has: () => true };
  const cand = [];
  if (!sources) {
    eachSurface(g, (v, x, y, z, m) => {
      if ((m & (F_NX | F_PX | F_NZ | F_PZ)) && y >= yMin && (yMax == null || y <= yMax)) cand.push([x, y, z, m]);
    }, only);
  }
  const n = sources ? sources.length : Math.min(count, cand.length);
  for (let s = 0; s < n; s++) {
    let [x, y, z, m] = sources ? [...sources[s], exposure(g, ...sources[s])] : cand[rng.int(0, cand.length - 1)];
    const L = rng.int(len[0], len[1]);
    const wv = width + (rng.chance(0.3) ? 1 : 0);
    // the face the streak runs on
    const faceBits = m & (F_NX | F_PX | F_NZ | F_PZ);
    const alongX = faceBits & (F_NZ | F_PZ) ? 1 : 0;
    for (let k = 0; k < L; k++) {
      const yy = y - k;
      if (yy < 0) break;
      const fade = 1 - k / L;
      for (let w = 0; w < wv; w++) {
        const xx = x + (alongX ? w : 0), zz = z + (alongX ? 0 : w);
        const cur = g.get(xx, yy, zz);
        if (!cur || !only.has(cur)) continue;
        if (!(exposure(g, xx, yy, zz) & faceBits)) continue;
        if (rng.next() > 0.35 + 0.65 * fade) continue;
        let nv;
        if (kind === 'rust') nv = V.rustStreak(b.P, baseOf(b.P, cur), +(t * (0.5 + 0.5 * fade)).toFixed(2));
        else if (kind === 'grease') nv = V.grease(b.P, baseOf(b.P, cur));
        else nv = V.dirt(b.P, baseOf(b.P, cur), +(0.85 - 0.25 * fade).toFixed(2));
        g.set(xx, yy, zz, nv);
      }
      // drift sideways occasionally
      if (rng.chance(0.06)) {
        if (alongX) x += rng.sign();
        else z += rng.sign();
      }
    }
  }
}

function baseOf(P, idx) {
  const e = P.entries[idx];
  if (!e) return idx;
  const k = e.name.indexOf('~');
  if (k < 0) return idx;
  return P.byName.get(e.name.slice(0, k)) ?? idx;
}


/** Small paint chips revealing primer / bare metal / rust (single voxels and tiny clusters). */
export function chips(b, rng, mats, { density = 0.01, kinds = ['rust', 'primer', 'bare'], edgeBias = 4 } = {}) {
  const only = famSet(b.P, mats) ?? { has: () => true };
  const set = [];
  eachSurface(b.g, (v, x, y, z, m) => {
    const p = density * (bitCount(m) >= 2 ? edgeBias : 1);
    if (rng.next() >= p) return;
    const kind = rng.pick(kinds);
    const nv = kind === 'rust' ? V.rust(b.P, v, rng.chance(0.5) ? 0.8 : 1.1) : kind === 'primer' ? V.primer(b.P, v) : V.bare(b.P, v);
    set.push(x, y, z, nv);
    if (rng.chance(0.4)) {
      const d = rng.pick([[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]]);
      const xx = x + d[0], yy = y + d[1], zz = z + d[2];
      if (only.has(b.g.get(xx, yy, zz)) && exposure(b.g, xx, yy, zz)) set.push(xx, yy, zz, nv);
    }
  }, only);
  for (let i = 0; i < set.length; i += 4) b.g.set(set[i], set[i + 1], set[i + 2], set[i + 3]);
}

/**
 * Dent a planar 1-voxel shell wall. axis: 'x'|'y'|'z' = wall normal axis; plane = voxel
 * layer of the wall; dir = +1/-1 direction the dent pushes; (cu,cv) centre in the other
 * two axes (u<v order: for x: (y,z); y: (x,z); z: (x,y)); r radius, depth (voxels).
 * Keeps the shell watertight by filling between neighbouring depths.
 */
export function dent(b, axis, plane, dir, cu, cv, r, depth, { squash = 1 } = {}) {
  const g = b.g;
  const map = (u, v, a) => (axis === 'x' ? [a, u, v] : axis === 'y' ? [u, a, v] : [u, v, a]);
  const R = Math.ceil(r) + 1;
  const dep = new Map();
  const key = (u, v) => u * 4096 + v;
  for (let v = Math.floor(cv - R); v <= cv + R; v++)
    for (let u = Math.floor(cu - R * squash); u <= cu + R * squash; u++) {
      const du = (u + 0.5 - cu) / squash, dv = v + 0.5 - cv;
      const d = Math.sqrt(du * du + dv * dv) / r;
      if (d >= 1) continue;
      const k = Math.round(depth * (0.5 + 0.5 * Math.cos(Math.PI * d)));
      if (k > 0) dep.set(key(u, v), k);
    }
  const getK = (u, v) => dep.get(key(u, v)) ?? 0;
  for (const [kk, k] of dep) {
    const u = Math.floor(kk / 4096), v = kk - u * 4096;
    const [x, y, z] = map(u, v, plane);
    const val = g.get(x, y, z);
    if (!val) continue;
    // neighbours' depths -> fill range so no see-through gaps
    const kmin = Math.min(k, getK(u - 1, v), getK(u + 1, v), getK(u, v - 1), getK(u, v + 1));
    g.set(x, y, z, 0);
    for (let s = kmin; s <= k; s++) {
      const [xx, yy, zz] = map(u, v, plane + dir * s);
      if (s === 0 || !g.get(xx, yy, zz)) g.set(xx, yy, zz, val);
    }
  }
}

// ───────────────────────────── grid transforms ─────────────────────────────

/** Copy src grid voxels into dst at offset, remapping palette by entry name (prefix optional). */
export function blit(dst, src, ox, oy, oz, { prefix = '', skipZero = true, filter } = {}) {
  const remap = new Map();
  const sp = src.P ?? src.palette;
  const sg = src.g ?? src.grid;
  const map = (v) => {
    let r = remap.get(v);
    if (r === undefined) {
      const e = sp.entries[v];
      r = dst.P.add(prefix + e.name, { color: e.color, rough: e.rough, metal: e.metal, cls: e.cls, vari: e.vari });
      remap.set(v, r);
    }
    return r;
  };
  sg.forEach((v, x, y, z) => {
    if (!v && skipZero) return;
    if (filter && !filter(v, x, y, z)) return;
    dst.g.set(x + ox, y + oy, z + oz, v ? map(v) : 0);
  });
}

/** Rotate a VB's grid by k*90° about an axis (returns new VB with same palette and voxel size). */
export function rotate90(b, axis, k = 1) {
  k = ((k % 4) + 4) % 4;
  let cur = b;
  for (let i = 0; i < k; i++) {
    const { nx, ny, nz } = cur.g;
    let out;
    if (axis === 'y') {
      // (x,y,z) -> (nz-1-z, y, x)
      out = new VB(nz, ny, nx, cur.vs, 'corner');
      cur.g.forEach((v, x, y, z) => v && out.g.set(nz - 1 - z, y, x, v));
    } else if (axis === 'x') {
      // (x,y,z) -> (x, nz-1-z, y)
      out = new VB(nx, nz, ny, cur.vs, 'corner');
      cur.g.forEach((v, x, y, z) => v && out.g.set(x, nz - 1 - z, y, v));
    } else {
      // z: (x,y,z) -> (ny-1-y, x, z)
      out = new VB(ny, nx, nz, cur.vs, 'corner');
      cur.g.forEach((v, x, y, z) => v && out.g.set(ny - 1 - y, x, z, v));
    }
    out.P = cur.P;
    cur = out;
  }
  if (cur !== b) cur.setMount(b.mount);
  return cur;
}

/** Crop a VB to the bounding box of its solid voxels (+pad). Returns { b, off:[x,y,z] }. */
export function crop(b, pad = 0) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -1, y1 = -1, z1 = -1;
  b.g.forEach((v, x, y, z) => {
    if (!v) return;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (z < z0) z0 = z;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
    if (z > z1) z1 = z;
  });
  if (x1 < 0) return { b, off: [0, 0, 0] };
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  z0 = Math.max(0, z0 - pad);
  x1 = Math.min(b.nx - 1, x1 + pad);
  y1 = Math.min(b.ny - 1, y1 + pad);
  z1 = Math.min(b.nz - 1, z1 + pad);
  const out = new VB(x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1, b.vs, 'corner');
  out.P = b.P;
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const v = b.g.get(x, y, z);
    if (v) out.g.set(x - x0, y - y0, z - z0, v);
  }
  return { b: out, off: [x0, y0, z0] };
}

// ───────────────────────────── parts ─────────────────────────────

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export function partMatrix(position = [0, 0, 0], rotation = [0, 0, 0]) {
  return new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2], 'XYZ')), _s);
}

function decompose(m) {
  m.decompose(_p, _q, new THREE.Vector3());
  _e.setFromQuaternion(_q, 'XYZ');
  return { position: [_p.x, _p.y, _p.z], rotation: [_e.x, _e.y, _e.z] };
}

/** Transform a local point by position/rotation. */
export function xform(pt, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const v = new THREE.Vector3(...pt).applyMatrix4(partMatrix(position, rotation));
  return [v.x, v.y, v.z];
}

/**
 * Add a sub-prop result (model + its parts) as parts of a parent, composed with
 * the given placement. Returns the list of added part descriptors.
 */
export function addProp(parts, name, res, position = [0, 0, 0], rotation = [0, 0, 0], extra = {}) {
  const M = partMatrix(position, rotation);
  const added = [];
  if (res.model && res.model.grid.count && res.model.grid.data.some((v) => v)) {
    const p = { name, model: res.model, position: position.slice(), rotation: rotation.slice(), ...extra };
    parts.push(p);
    added.push(p);
  }
  for (const sp of res.parts ?? []) {
    _m2.copy(M).multiply(partMatrix(sp.position, sp.rotation));
    const { position: pp, rotation: rr } = decompose(_m2);
    const p = { ...sp, ...extra, name: `${name}/${sp.name}`, position: pp, rotation: rr };
    parts.push(p);
    added.push(p);
  }
  return added;
}

/**
 * Compose rotations applied in order (first op first): rot(['x', a], ['y', b]) = Ry(b)·Rx(a).
 * Returns Euler XYZ [rx, ry, rz] for parts.
 */
export function rot(...ops) {
  const q = new THREE.Quaternion();
  const t = new THREE.Quaternion();
  const ax = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
  for (const [a, ang] of ops) {
    t.setFromAxisAngle(ax[a], ang);
    q.premultiply(t);
  }
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z];
}

/** Axis-aligned bounds [min, max] of a model's grid after rotation (local meters, before translation). */
export function rotatedBounds(model, rotation) {
  const [sx, sy, sz] = model.size;
  const o = model.origin;
  const m = partMatrix([0, 0, 0], rotation);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const v = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    v.set(o[0] + (i & 1 ? sx : 0), o[1] + (i & 2 ? sy : 0), o[2] + (i & 4 ? sz : 0)).applyMatrix4(m);
    mn[0] = Math.min(mn[0], v.x); mn[1] = Math.min(mn[1], v.y); mn[2] = Math.min(mn[2], v.z);
    mx[0] = Math.max(mx[0], v.x); mx[1] = Math.max(mx[1], v.y); mx[2] = Math.max(mx[2], v.z);
  }
  return [mn, mx];
}

/**
 * Position for a rotated model so that its rotated bounding box rests at y = yMin and, if given,
 * its back (min z) touches zMin / its centre x is at x.
 */
export function restPos(model, rotation, { x = 0, yMin = 0, zMin = null, z = 0 } = {}) {
  const [mn, mx] = rotatedBounds(model, rotation);
  return [x - (mn[0] + mx[0]) / 2, yMin - mn[1], zMin != null ? zMin - mn[2] : z - (mn[2] + mx[2]) / 2];
}

/**
 * Move a part's pivot (its position) to `pivot` (parent frame) without moving its geometry:
 * the model origin is shifted by R^-1 (oldPos - pivot). Used for animated parts whose
 * rotation must happen about a specific point (e.g. shoes swaying about the wire).
 */
export function repivot(part, pivot = [0, 0, 0]) {
  const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...(part.rotation ?? [0, 0, 0]), 'XYZ'));
  const inv = R.clone().invert();
  const d = new THREE.Vector3(part.position[0] - pivot[0], part.position[1] - pivot[1], part.position[2] - pivot[2]).applyMatrix4(inv);
  const o = part.model.origin;
  part.model.origin = [o[0] + d.x, o[1] + d.y, o[2] + d.z];
  part.position = pivot.slice();
  return part;
}

/** Transform anchors of a sub-prop into the parent frame. */
export function xformAnchors(anchors, position, rotation, prefix = '') {
  const out = {};
  if (!anchors) return out;
  const M = partMatrix(position, rotation);
  const R = new THREE.Matrix4().extractRotation(M);
  for (const [k, v] of Object.entries(anchors)) {
    const isDir = /dir/i.test(k);
    const vec = new THREE.Vector3(...v).applyMatrix4(isDir ? R : M);
    out[prefix + k] = [vec.x, vec.y, vec.z];
  }
  return out;
}

// ───────────────────────────── canvas paint / text ─────────────────────────────

export function makeCanvas(w, h) {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const imgCache = new WeakMap();
/** Returns {w,h,data} RGBA for a canvas / ImageData / {color: canvas}. */
export function readImage(src) {
  if (!src) return null;
  if (src.color && !src.data && !src.getContext) src = src.color;
  if (src.data && src.width && src.height && !src.getContext) return { w: src.width, h: src.height, data: src.data };
  let r = imgCache.get(src);
  if (r) return r;
  const ctx = src.getContext('2d', { willReadFrequently: true });
  const id = ctx.getImageData(0, 0, src.width, src.height);
  r = { w: src.width, h: src.height, data: id.data };
  imgCache.set(src, r);
  return r;
}

/** Bilinear-free nearest sample at u,v in [0,1] (v = 0 bottom). Returns [r,g,b,a] (a 0..1). */
export function sampleImage(img, u, v) {
  const x = Math.min(img.w - 1, Math.max(0, Math.floor(u * img.w)));
  const y = Math.min(img.h - 1, Math.max(0, Math.floor((1 - v) * img.h)));
  const i = (x + y * img.w) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3] / 255];
}

/** Box-filtered sample over a footprint (du,dv in uv units). */
export function sampleImageArea(img, u, v, du, dv) {
  const x0 = Math.max(0, Math.floor((u - du / 2) * img.w)), x1 = Math.min(img.w - 1, Math.ceil((u + du / 2) * img.w) - 1);
  const y0 = Math.max(0, Math.floor((1 - v - dv / 2) * img.h)), y1 = Math.min(img.h - 1, Math.ceil((1 - v + dv / 2) * img.h) - 1);
  let r = 0, g = 0, bb = 0, a = 0, n = 0;
  for (let y = y0; y <= Math.max(y0, y1); y++)
    for (let x = x0; x <= Math.max(x0, x1); x++) {
      const i = (x + y * img.w) * 4;
      const al = img.data[i + 3] / 255;
      r += img.data[i] * al;
      g += img.data[i + 1] * al;
      bb += img.data[i + 2] * al;
      a += al;
      n++;
    }
  if (a <= 1e-6) return [0, 0, 0, 0];
  return [r / a, g / a, bb / a, a / n];
}

/**
 * Project a face-mapping onto the outermost voxels of a face. face: '+x','-x','+y','-y','+z','-z'.
 * rect (voxel units, face plane axes as seen from outside: u to the right, v up):
 *   {u0, v0, u1, v1} - the canvas covers this rectangle.
 * fn(u, v, voxelValue, x, y, z) -> new index | undefined. u,v in [0,1].
 * depthLimit: only voxels within this many layers of the outermost layer of the face bbox.
 */
export function projectFace(b, face, rect, fn, { depthLimit = Infinity, from = null } = {}) {
  const g = b.g;
  const { nx, ny, nz } = g;
  const ax = face[1];
  const sgn = face[0] === '+' ? 1 : -1;
  // for each face, (u,v) -> (x,y,z) column definitions
  const cols = (cu, cv) => {
    switch (face) {
      case '+z': return { x: cu, y: cv };
      case '-z': return { x: nx - 1 - cu, y: cv };
      case '+x': return { z: nz - 1 - cu, y: cv };
      case '-x': return { z: cu, y: cv };
      case '+y': return { x: cu, z: nz - 1 - cv };
      default: return { x: cu, z: cv };
    }
  };
  const depthN = ax === 'x' ? nx : ax === 'y' ? ny : nz;
  const start = from ?? (sgn > 0 ? depthN - 1 : 0);
  const { u0, v0, u1, v1 } = rect;
  for (let cv = Math.max(0, Math.floor(v0)); cv < Math.ceil(v1); cv++)
    for (let cu = Math.max(0, Math.floor(u0)); cu < Math.ceil(u1); cu++) {
      const c = cols(cu, cv);
      let first = -1;
      for (let s = 0; s < depthN; s++) {
        const a = start - sgn * s;
        if (a < 0 || a >= depthN) break;
        const x = ax === 'x' ? a : c.x, y = ax === 'y' ? a : c.y, z = ax === 'z' ? a : c.z;
        if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) break;
        const v = g.get(x, y, z);
        if (!v) continue;
        if (first < 0) first = s;
        if (s - first > depthLimit) break;
        const u = (cu + 0.5 - u0) / (u1 - u0), w = (cv + 0.5 - v0) / (v1 - v0);
        const r = fn(u, w, v, x, y, z);
        if (r !== undefined) g.set(x, y, z, r);
        break;
      }
    }
}

/**
 * Rasterize a paint canvas (graffiti layer, alpha = coverage) onto a face.
 * Colours are quantized into palette entries derived from the painted voxel's entry.
 */
export function applyPaint(b, src, face, rect, { threshold = 0.35, quant = 12, skip = null, depthLimit = 3, rough = 0.55 } = {}) {
  const img = readImage(src);
  if (!img) return 0;
  let n = 0;
  const du = 1 / Math.max(1, rect.u1 - rect.u0), dv = 1 / Math.max(1, rect.v1 - rect.v0);
  projectFace(b, face, rect, (u, v, cur) => {
    if (skip && skip.has(cur)) return undefined;
    const e = b.P.entries[cur];
    if (!e || e.cls === MCLS.GLASS || e.cls === MCLS.EMISSIVE) return undefined;
    const s = sampleImageArea(img, u, v, du, dv);
    if (s[3] < threshold) return undefined;
    // blend semi-transparent spray with the surface colour
    const a = Math.min(1, (s[3] - threshold) / (1 - threshold) * 1.4);
    let c = [0, 1, 2].map((k) => e.color[k] + (s[k] - e.color[k]) * a);
    c = c.map((x) => Math.round(x / quant) * quant);
    n++;
    return b.P.color(c, { name: 'paint', rough: Math.min(e.rough, rough), metal: e.metal * 0.3, cls: e.cls === MCLS.METAL_PAINTED ? MCLS.GENERIC : e.cls, vari: 0.05 });
  }, { depthLimit });
  return n;
}

/** Resolve opts.paint for a named face: accepts canvas | ImageData | {color} | {front, left, ...}. */
export function paintFor(paint, faceName, primary = 'front') {
  if (!paint) return null;
  if (paint.getContext || (paint.data && paint.width)) return faceName === primary ? paint : null;
  if (paint.color && (paint.color.getContext || paint.color.data)) return faceName === primary ? paint.color : null;
  return paint[faceName] ?? null;
}

/**
 * Render text into a coverage mask (Float32Array w*h, 1 = ink), supersampled.
 * lines: [{text, size (fraction of h), weight, y (0..1 center), font}] or a string.
 */
export function textMask(w, h, lines, { ss = 4, font = 'Arial, Helvetica, sans-serif', weight = 'bold', align = 'center', draw = null } = {}) {
  const W = w * ss, H = h * ss;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (typeof lines === 'string') lines = [{ text: lines, size: 0.6, y: 0.5 }];
  for (const L of lines) {
    const px = Math.max(4, Math.round(L.size * H));
    ctx.font = `${L.weight ?? weight} ${px}px ${L.font ?? font}`;
    let x = align === 'center' ? W / 2 : align === 'left' ? (L.x ?? 0.05) * W : (L.x ?? 0.95) * W;
    if (L.x != null && align === 'center') x = L.x * W;
    const maxW = (L.maxW ?? 0.92) * W;
    const m = ctx.measureText(L.text);
    ctx.save();
    if (m.width > maxW) {
      ctx.translate(x, 0);
      ctx.scale(maxW / m.width, 1);
      ctx.translate(-x, 0);
    }
    ctx.fillText(L.text, x, (1 - (L.y ?? 0.5)) * H);
    ctx.restore();
  }
  if (draw) draw(ctx, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) a += d[((x * ss + sx) + (y * ss + sy) * W) * 4 + 3];
      // flip so row 0 = bottom
      out[x + (h - 1 - y) * w] = a / (ss * ss * 255);
    }
  return out;
}

// ───────────────────────────── misc ─────────────────────────────

/** Deterministic per-voxel random in [0,1). */
export const vrand = (x, y, z, seed = 0) => hash3i(x, y, z, seed) / 4294967296;

/** Standard result object. */
export function result(model, meta, parts) {
  const r = { model, meta };
  if (parts && parts.length) r.parts = parts;
  return r;
}

/** Count solid voxels quickly (for debugging). */
export function countSolid(g) {
  let n = 0;
  for (let i = 0; i < g.data.length; i++) if (g.data[i]) n++;
  return n;
}
