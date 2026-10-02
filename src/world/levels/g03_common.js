// Helpers shared by the levels of group 03 (outdoor worlds: grass, forests, beaches, bogs...).
// Everything here is coordinate based, so every zone can draw its own slice of an endless world.
import { defineMaterial } from '../materials.js';
import { CF, hr, owns } from './kit.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// A row of materials that share one texture and differ only in brightness / colour tint. Faking a
// sun on terrain: pick the material by the slope (see terrainGrid).
export const SHADES = [0.6, 0.76, 0.9, 1.0, 1.1];
export function matRamp(name, tex, opts = {}, base = [1, 1, 1], shades = SHADES) {
  return shades.map((k, i) => defineMaterial(`${name}_${i}`, tex, { ...opts, tint: [base[0] * k, base[1] * k, base[2] * k] }));
}

// Smooth terrain from a height function hf(x, z) (absolute metres, evaluated at cell centres).
// matFn(x, z, h, shade, i) returns the floor material of a cell; shade (0..1) is a hill-shading
// term from a pretend sun (sun = [dx, dz] direction the light travels along the ground).
// Returns the height grid accessor so callers can place things on the ground.
export function terrainGrid(zb, hf, matFn, sun = [0.7, 0.5], gain = 1.7) {
  const w = zb.x1 - zb.x0, d = zb.z1 - zb.z0, W2 = w + 2;
  const H = new Float32Array(W2 * (d + 2));
  for (let j = 0; j < d + 2; j++) for (let i = 0; i < W2; i++) H[j * W2 + i] = hf(zb.x0 + i - 0.5, zb.z0 + j - 0.5);
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const k = (z + 1) * W2 + x + 1, ci = z * w + x;
      const h = H[k];
      const sx = (H[k + 1] - H[k - 1]) * 0.5, sz = (H[k + W2] - H[k - W2]) * 0.5;
      const shade = clamp(0.55 - (sx * sun[0] + sz * sun[1]) * gain, 0, 1);
      zb.floor[ci] = h;
      zb.ceil[ci] = NaN;
      zb.fmat[ci] = matFn(zb.x0 + x, zb.z0 + z, h, shade, ci);
      zb.flags[ci] = (zb.flags[ci] & ~CF.VOID) | CF.SMOOTH;
    }
  }
  return (x, z) => H[(Math.floor(z) - zb.z0 + 1) * W2 + Math.floor(x) - zb.x0 + 1];
}

export const shadeIdx = (shade, n = SHADES.length) => clamp(Math.floor(shade * n), 0, n - 1);

// Flatten a terrain function around points: pads = [{ x, z, r0, r1 }]: flat (at the height the
// terrain has at the centre) inside r0, blending back to the terrain by r1.
export function padded(hf, pads) {
  for (const p of pads) if (p.h === undefined) p.h = hf(p.x, p.z);
  return (x, z) => {
    let h = hf(x, z);
    for (const p of pads) {
      const dx = x - p.x, dz = z - p.z, d2 = dx * dx + dz * dz;
      if (d2 < p.r1 * p.r1) h = lerp(h, p.h, 1 - sstep(p.r0, p.r1, Math.sqrt(d2)));
    }
    return h;
  };
}

// Jittered grid: one candidate per cell x cell square, in absolute coordinates, so every zone
// agrees on what stands where. Calls fn(x, z, i, j, r1, r2) for the candidates this zone owns.
export function scatter(zb, cell, salt, fn) {
  const i0 = Math.floor(zb.x0 / cell), i1 = Math.ceil(zb.x1 / cell);
  const j0 = Math.floor(zb.z0 / cell), j1 = Math.ceil(zb.z1 / cell);
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) {
      const x = (i + 0.08 + 0.84 * hr(i, j, salt)) * cell, z = (j + 0.08 + 0.84 * hr(i, j, salt + 1)) * cell;
      if (!owns(zb, x, z)) continue;
      fn(x, z, i, j, hr(i, j, salt + 2), hr(i, j, salt + 3));
    }
  }
}

// Every cell (i, j) of a cell-sized grid that overlaps the zone: for placements that compute their
// own position inside the cell (the caller checks owns() so exactly one zone draws each thing).
export function cells(zb, cell, fn) {
  for (let j = Math.floor(zb.z0 / cell); j <= Math.floor((zb.z1 - 1) / cell); j++) {
    for (let i = Math.floor(zb.x0 / cell); i <= Math.floor((zb.x1 - 1) / cell); i++) fn(i, j);
  }
}

// A hand-placed level door per zone (with chance), at a hashed spot well inside the zone so that a
// flat pad around it never crosses a zone border. Returns { x, z, rot } or null.
export function doorSite(zb, chance, salt = 71, margin = 9) {
  const gx = Math.round(zb.x0 / 8), gz = Math.round(zb.z0 / 8);
  if (hr(gx, gz, salt) >= chance) return null;
  const w = zb.x1 - zb.x0, d = zb.z1 - zb.z0;
  const x = Math.floor(zb.x0 + margin + hr(gx, gz, salt + 1) * (w - 2 * margin)) + 0.5;
  const z = Math.floor(zb.z0 + margin + hr(gx, gz, salt + 2) * (d - 2 * margin)) + 0.5;
  return { x, z, rot: Math.floor(hr(gx, gz, salt + 3) * 8) * Math.PI / 4 };
}

// The engine's random "events" (distant doors, phones, pipes...) belong to the main building and
// fall back to those sounds in levels with a tone of their own: keep them quiet here.
export function noEvents(ctx) {
  const e = ctx.game && ctx.game.events;
  if (e) e.timer = 1e6;
}

// Paint helpers --------------------------------------------------------------------------------
// an opaque pixel on an alpha-cut texture
export function px(p, x, y, c) {
  p.set(x, y, c);
  p.alpha(x, y, 255);
}
// a filled rectangle on an alpha-cut texture
export function pr(p, x, y, w, h, c) {
  p.rect(x, y, w, h, c);
  p.rectA(x, y, w, h, 255);
}
// grass blades / reeds growing from the bottom edge: opts { n, cols: [dark, mid, light], min, max, lean, w }
export function blades(p, r, o) {
  const n = o.n ?? 30, cols = o.cols, min = o.min ?? 20, max = o.max ?? 60, lean = o.lean ?? 8, w = o.w ?? 2;
  for (let k = 0; k < n; k++) {
    const x0 = r.range(3, 61), h = r.range(min, max), dx = r.range(-lean, lean);
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const x = x0 + dx * t * t;
      const c = t < 0.35 ? cols[0] : t < 0.75 ? cols[1] : cols[2];
      const ww = t > 0.85 ? 1 : w;
      for (let q = 0; q < ww; q++) px(p, x + q, 63 - y, c);
    }
  }
}
