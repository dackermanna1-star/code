// Procedurally generated textures: the particle atlas (4x4 frames) and a
// tiling detail-noise texture used by terrain, buildings and walls.

import * as THREE from 'three';
import { RNG } from '../core/rng.js';

export const FRAME = {
  SMOKE_A: 0,
  SMOKE_B: 1,
  SMOKE_C: 2,
  FLAME: 3,
  FIREBALL: 4,
  SPARK: 5,
  FLASH: 6,
  MUZZLE: 7,
  DUST: 8,
  CHUNK: 9,
  RING: 10,
  GLOW: 11,
  SPLASH: 12,
  SPECKS: 13,
  STREAK: 14,
  LEAF: 15,
};

// Tileable value noise on a small lattice.
function makeNoise(seed, size) {
  const rnd = new RNG(seed);
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rnd.next();
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const s = (t) => t * t * (3 - 2 * t);
    const at = (a, b) => g[((b % size) + size) % size * size + (((a % size) + size) % size)];
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    const u = s(xf);
    const v = s(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

// Octaves use integer frequency multiples, so a lattice that tiles over the
// domain keeps tiling at every octave.
function fbm(noise, x, y, oct) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += noise(x * f, y * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

export function createParticleAtlas(cell = 128) {
  const size = cell * 4;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const n1 = makeNoise(11, 64);
  const n2 = makeNoise(23, 64);
  const rnd = new RNG(77);

  const frameFns = [];
  // Soft billowing smoke puffs.
  const smoke = (seed, lumpiness, edge) => (u, v) => {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const r = Math.hypot(dx, dy) * 2;
    const nz = fbm(n1, u * 8 + seed, v * 8 + seed * 1.7, 4, 64);
    const d = r + (nz - 0.5) * lumpiness;
    const a = Math.max(0, 1 - Math.pow(Math.max(0, d), edge));
    const shade = 0.75 + 0.25 * fbm(n2, u * 6 + seed, v * 6, 3, 64) - (v - 0.5) * 0.25;
    return [shade, shade, shade, a * a];
  };
  frameFns[FRAME.SMOKE_A] = smoke(3, 0.55, 1.6);
  frameFns[FRAME.SMOKE_B] = (u, v) => {
    // Cauliflower: several overlapping lumps.
    let a = 0;
    const lumps = [[0.5, 0.55, 0.32], [0.33, 0.45, 0.22], [0.66, 0.42, 0.24], [0.5, 0.32, 0.2], [0.4, 0.66, 0.2], [0.62, 0.64, 0.2]];
    for (const [cx, cy, r] of lumps) {
      const d = Math.hypot(u - cx, v - cy) / r;
      a = Math.max(a, 1 - d * d);
    }
    const nz = fbm(n1, u * 10 + 9, v * 10, 4, 64);
    a = Math.max(0, a * (0.65 + nz * 0.6));
    const shade = 0.68 + 0.32 * (1 - v) * (0.6 + nz * 0.5);
    return [shade, shade, shade, Math.min(1, a * 1.2)];
  };
  frameFns[FRAME.SMOKE_C] = smoke(17, 0.9, 1.3);
  frameFns[FRAME.FLAME] = (u, v) => {
    // Teardrop pointing up (v=0 is top).
    const x = (u - 0.5) * 2;
    const y = v;
    const w = 0.15 + 0.85 * Math.pow(y, 0.6);
    const nz = fbm(n2, u * 6, v * 4 + 3, 4, 64);
    const d = Math.abs(x) / (w * (0.7 + nz * 0.5));
    let a = Math.max(0, 1 - d) * Math.min(1, (1 - y) * 4) * Math.min(1, y * 3 + 0.2);
    a = Math.pow(a, 0.8);
    const core = Math.max(0, 1 - d * 1.8) * y;
    return [1, 0.75 + core * 0.25, 0.45 + core * 0.5, a];
  };
  frameFns[FRAME.FIREBALL] = (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const nz = fbm(n1, u * 7 + 4, v * 7 + 2, 5, 64);
    const d = r + (nz - 0.5) * 0.6;
    const a = Math.max(0, 1 - Math.pow(Math.max(d, 0), 2));
    const core = Math.max(0, 1 - d * 1.6);
    return [1, 0.6 + core * 0.4, 0.25 + core * 0.6, a];
  };
  frameFns[FRAME.SPARK] = (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const a = Math.exp(-r * r * 18) + Math.exp(-r * r * 3) * 0.25;
    return [1, 1, 1, Math.min(1, a)];
  };
  frameFns[FRAME.FLASH] = (u, v) => {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const r = Math.hypot(dx, dy) * 2;
    const ang = Math.atan2(dy, dx);
    const spikes = Math.pow(Math.abs(Math.cos(ang * 3)), 18) * Math.max(0, 1 - r) * 1.2;
    const core = Math.exp(-r * r * 10);
    const a = Math.min(1, core + spikes + Math.exp(-r * r * 2.5) * 0.3);
    return [1, 0.95, 0.85, a];
  };
  frameFns[FRAME.MUZZLE] = (u, v) => {
    // Cone along +x from the left edge.
    const x = u;
    const y = (v - 0.5) * 2;
    const w = 0.08 + x * 0.55;
    const nz = fbm(n2, u * 9, v * 5, 3, 64);
    const d = Math.abs(y) / w;
    const a = Math.max(0, 1 - d) * Math.max(0, 1 - Math.pow(x, 1.5)) * (0.7 + nz * 0.6);
    const core = Math.max(0, 1 - d * 2.5) * Math.max(0, 1 - x * 1.5);
    return [1, 0.85 + core * 0.15, 0.55 + core * 0.4, Math.min(1, a * 1.4)];
  };
  frameFns[FRAME.DUST] = (u, v) => {
    const r = Math.hypot(u - 0.5, (v - 0.5) * 1.15) * 2;
    const nz = fbm(n1, u * 12 + 33, v * 12, 4, 64);
    const d = r + (nz - 0.5) * 1.1;
    const a = Math.max(0, 1 - d) * (0.6 + nz * 0.5);
    return [0.9, 0.85, 0.78, Math.min(1, a * 1.3)];
  };
  frameFns[FRAME.CHUNK] = (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const nz = fbm(n2, u * 5 + 7, v * 5 + 1, 3, 64);
    const a = r + (nz - 0.5) * 0.9 < 0.55 ? 1 : 0;
    return [0.3 + nz * 0.2, 0.28 + nz * 0.15, 0.25 + nz * 0.12, a];
  };
  frameFns[FRAME.RING] = (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const a = Math.exp(-Math.pow((r - 0.82) * 9, 2)) * (0.8 + 0.2 * fbm(n1, u * 10, v * 10, 2, 64));
    return [1, 1, 1, a];
  };
  frameFns[FRAME.GLOW] = (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const a = Math.max(0, Math.exp(-r * r * 4.5) - 0.012);
    return [1, 1, 1, a];
  };
  frameFns[FRAME.SPLASH] = (u, v) => {
    const x = (u - 0.5) * 2;
    const y = 1 - v;
    const crown = Math.exp(-Math.pow((Math.abs(x) - 0.55 * y) * 5, 2)) * (y < 0.9 ? 1 : 0);
    const nz = fbm(n1, u * 14, v * 14, 3, 64);
    const a = Math.min(1, crown * (0.5 + nz) + Math.exp(-(x * x) * 20 - Math.pow(y - 0.1, 2) * 40) * 0.6);
    return [0.85, 0.9, 0.95, a];
  };
  const specks = [];
  for (let i = 0; i < 22; i++) specks.push([rnd.range(0.15, 0.85), rnd.range(0.15, 0.85), rnd.range(0.02, 0.06)]);
  frameFns[FRAME.SPECKS] = (u, v) => {
    let a = 0;
    for (const [cx, cy, r] of specks) a = Math.max(a, 1 - Math.hypot(u - cx, v - cy) / r);
    return [0.35, 0.3, 0.25, Math.min(1, a * 3)];
  };
  frameFns[FRAME.STREAK] = (u, v) => {
    const x = (u - 0.5) * 2;
    const y = (v - 0.5) * 2;
    const a = Math.exp(-y * y * 30) * Math.max(0, 1 - Math.abs(x)) ** 0.5;
    return [1, 1, 1, a];
  };
  frameFns[FRAME.LEAF] = (u, v) => {
    const x = (u - 0.5) * 2;
    const y = (v - 0.5) * 2;
    const a = x * x * 2.2 + y * y * 0.9 < 0.55 ? 1 : 0;
    const shade = 0.5 + 0.5 * fbm(n2, u * 6, v * 6, 2, 64);
    return [0.42 * shade, 0.55 * shade, 0.22 * shade, a];
  };

  for (let f = 0; f < 16; f++) {
    const fn = frameFns[f];
    const ox = (f % 4) * cell;
    const oy = Math.floor(f / 4) * cell;
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const u = (x + 0.5) / cell;
        const v = (y + 0.5) / cell;
        // Keep a transparent border so frames never bleed into each other.
        const edge = Math.min(u, v, 1 - u, 1 - v);
        let [r, g, b, a] = fn(u, v);
        if (edge < 0.02) a = 0;
        const i = ((oy + y) * size + ox + x) * 4;
        data[i] = Math.max(0, Math.min(255, r * 255));
        data[i + 1] = Math.max(0, Math.min(255, g * 255));
        data[i + 2] = Math.max(0, Math.min(255, b * 255));
        data[i + 3] = Math.max(0, Math.min(255, a * 255));
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 2;
  return tex;
}

// RGBA tiling noise: R fine, G medium, B streaky (grass/brush), A coarse.
export function createDetailTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  // Lattices of 32 cells tile over u, v in [0, 32); the coarse one uses 8 cells over [0, 8).
  const nA = makeNoise(5, 32);
  const nB = makeNoise(9, 32);
  const nC = makeNoise(13, 32);
  const nD = makeNoise(17, 8);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 32;
      const v = (y / size) * 32;
      const fine = fbm(nA, u * 4, v * 4, 3);
      const med = fbm(nB, u, v, 4);
      const streak = fbm(nC, u * 8, v, 3);
      const coarse = fbm(nD, u * 0.25, v * 0.25, 3);
      const i = (y * size + x) * 4;
      d[i] = fine * 255;
      d[i + 1] = med * 255;
      d[i + 2] = streak * 255;
      d[i + 3] = coarse * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}
