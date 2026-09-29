import * as THREE from 'three';
import { clamp, fbm2, hash2, mulberry32, vnoise2 } from '../core/math';

export type RGB = [number, number, number];

export function hexToRgb(hex: number): RGB {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/** Simple pixel buffer for procedural texture painting. */
export class PixelCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly img: ImageData;
  readonly data: Uint8ClampedArray;
  constructor(readonly w: number, readonly h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.img = this.ctx.createImageData(w, h);
    this.data = this.img.data;
  }
  set(x: number, y: number, r: number, g: number, b: number, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }
  /** Wrapped set (for tiling textures). */
  setW(x: number, y: number, r: number, g: number, b: number, a = 255) {
    x = ((x % this.w) + this.w) % this.w;
    y = ((y % this.h) + this.h) % this.h;
    this.set(x, y, r, g, b, a);
  }
  get(x: number, y: number): [number, number, number, number] {
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  blend(x: number, y: number, r: number, g: number, b: number, a: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const t = a / 255;
    this.data[i] = this.data[i] * (1 - t) + r * t;
    this.data[i + 1] = this.data[i + 1] * (1 - t) + g * t;
    this.data[i + 2] = this.data[i + 2] * (1 - t) + b * t;
    this.data[i + 3] = Math.max(this.data[i + 3], a);
  }
  rect(x: number, y: number, w: number, h: number, c: RGB, a = 255) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c[0], c[1], c[2], a);
  }
  fill(c: RGB, a = 255) {
    this.rect(0, 0, this.w, this.h, c, a);
  }
  commit() {
    this.ctx.putImageData(this.img, 0, 0);
    return this.canvas;
  }
}

export interface TexOpts {
  nearest?: boolean;
  repeat?: boolean;
  srgb?: boolean;
  mipmaps?: boolean;
  anisotropy?: number;
}

export function toTexture(canvas: HTMLCanvasElement, o: TexOpts = {}) {
  const t = new THREE.CanvasTexture(canvas);
  const nearest = o.nearest ?? true;
  t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  const mips = o.mipmaps ?? true;
  t.generateMipmaps = mips;
  t.minFilter = mips ? (nearest ? THREE.NearestMipmapLinearFilter : THREE.LinearMipmapLinearFilter) : nearest ? THREE.NearestFilter : THREE.LinearFilter;
  if (o.repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  if (o.srgb ?? true) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = o.anisotropy ?? 4;
  t.needsUpdate = true;
  return t;
}

const jitter = (c: RGB, amt: number, rnd: () => number): RGB => {
  const j = (rnd() - 0.5) * 2 * amt;
  return [clamp(c[0] + j, 0, 255), clamp(c[1] + j, 0, 255), clamp(c[2] + j, 0, 255)];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Pixels per meter for world ground textures. */
export const GROUND_PPM = 10;
/** Road texture covers this many meters across (centered on x = 0). */
export const ROAD_TEX_WIDTH_M = 25.6;
export const ROAD_TEX_LENGTH_M = 51.2;

/**
 * Road cross-section texture: asphalt, white edge lines, yellow center dashes,
 * sandy shoulders and short verge grass. Tiles along Z.
 */
export function makeRoadTexture() {
  const W = Math.round(ROAD_TEX_WIDTH_M * GROUND_PPM);
  const H = Math.round(ROAD_TEX_LENGTH_M * GROUND_PPM);
  const pc = new PixelCanvas(W, H);
  const rnd = mulberry32(1337);
  const asphalt: RGB = [84, 86, 90];
  const asphaltDark: RGB = [70, 72, 76];
  const white: RGB = [226, 226, 222];
  const yellow: RGB = [232, 212, 44];
  const sand: RGB = [214, 190, 132];
  const sandDark: RGB = [186, 160, 104];
  const verge: RGB = [128, 128, 66];
  const vergeDark: RGB = [100, 104, 52];
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const xm = (px + 0.5) / GROUND_PPM - ROAD_TEX_WIDTH_M / 2; // meters from center
      const zm = (py + 0.5) / GROUND_PPM;
      const ax = Math.abs(xm);
      // tile-safe noise: use periodic coordinates in z
      const nz = (zm / ROAD_TEX_LENGTH_M) * 64;
      const n1 = vnoise2(ax * 1.7 + (xm < 0 ? 100 : 0), nz % 64);
      const r = rnd();
      let c: RGB;
      // edge of asphalt is wobbly
      const edgeWobble = (hash2(Math.floor(zm * 2), xm < 0 ? 7 : 13) - 0.5) * 0.25;
      const asphaltEdge = 5.0 + edgeWobble;
      if (ax < asphaltEdge) {
        c = mix(asphalt, asphaltDark, n1 * 0.9);
        c = jitter(c, 7, rnd);
        if (r < 0.025) c = [c[0] + 18, c[1] + 18, c[2] + 18];
        if (r > 0.992) c = [c[0] - 14, c[1] - 14, c[2] - 14];
        // edge lines
        if (ax > 4.52 && ax < 4.74) {
          const worn = hash2(px, py) < 0.08;
          if (!worn) c = jitter(white, 8, rnd);
        }
        // center dashes: 3.2m dash every 6.4m
        if (ax < 0.1) {
          const phase = zm % 6.4;
          if (phase < 3.2 && hash2(px * 3, py) > 0.05) c = jitter(yellow, 10, rnd);
        }
      } else if (ax < 6.3 + edgeWobble * 2) {
        // sandy shoulder with dithered speckles
        c = mix(sand, sandDark, vnoise2(ax * 3, nz * 3 % 192) * 0.8);
        c = jitter(c, 10, rnd);
        const tt = (ax - asphaltEdge) / 1.3;
        if (hash2(px, py * 7) < tt * tt * 0.5) c = jitter(verge, 12, rnd);
        if (r < 0.03) c = [c[0] - 30, c[1] - 30, c[2] - 30];
      } else {
        c = mix(verge, vergeDark, vnoise2(ax * 2.3, nz * 2 % 128));
        c = jitter(c, 14, rnd);
        if (r < 0.05) c = [c[0] + 30, c[1] + 26, c[2] + 6];
        if (r > 0.97) c = [c[0] - 30, c[1] - 30, c[2] - 20];
      }
      pc.set(px, py, c[0], c[1], c[2]);
    }
  }
  // cracks
  for (let k = 0; k < 10; k++) {
    let x = Math.floor(rnd() * 90 + (W / 2 - 45));
    let y = Math.floor(rnd() * H);
    const len = 8 + rnd() * 26;
    for (let i = 0; i < len; i++) {
      const [r0, g0, b0] = pc.get(((x % W) + W) % W, ((y % H) + H) % H);
      pc.setW(x, y, r0 - 16, g0 - 16, b0 - 15);
      if (rnd() < 0.5) x += rnd() < 0.5 ? -1 : 1;
      else y += 1;
    }
  }
  // tar patches
  for (let k = 0; k < 6; k++) {
    const x0 = Math.floor(W / 2 - 40 + rnd() * 80);
    const y0 = Math.floor(rnd() * H);
    const w = 6 + Math.floor(rnd() * 14);
    const h = 8 + Math.floor(rnd() * 24);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const [r0, g0, b0] = pc.get(((x0 + i) % W + W) % W, ((y0 + j) % H + H) % H);
      if (Math.abs(x0 + i - W / 2) * 1 / GROUND_PPM > 4.4) continue;
      pc.setW(x0 + i, y0 + j, r0 - 9, g0 - 9, b0 - 8);
    }
  }
  return toTexture(pc.commit(), { repeat: true });
}

/** Grass ground (tiling). */
export function makeGrassGroundTexture() {
  const S = 128;
  const pc = new PixelCanvas(S, S);
  const rnd = mulberry32(99);
  const a: RGB = [126, 126, 64];
  const b: RGB = [98, 102, 50];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const n = (vnoise2((x / S) * 8, (y / S) * 8) + vnoise2(((x + 37) / S) * 8 + 8, (y / S) * 8)) * 0.5;
      let c = mix(a, b, n);
      c = jitter(c, 16, rnd);
      const r = rnd();
      if (r < 0.06) c = [c[0] + 34, c[1] + 30, c[2] + 8];
      pc.set(x, y, c[0], c[1], c[2]);
    }
  return toTexture(pc.commit(), { repeat: true });
}

/** Top-down view of dense tall grass canopy (for distant raised field). */
export function makeCanopyTexture() {
  const S = 128;
  const pc = new PixelCanvas(S, S);
  const rnd = mulberry32(2024);
  const base: RGB = [138, 138, 66];
  const dark: RGB = [92, 98, 46];
  const tip: RGB = [186, 176, 100];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const n = vnoise2((x / S) * 16, (y / S) * 16);
      let c = mix(base, dark, n * 0.8);
      c = jitter(c, 14, rnd);
      const r = rnd();
      if (r < 0.1) c = mix(c, tip, 0.7);
      if (r > 0.9) c = mix(c, dark, 0.8);
      pc.set(x, y, c[0], c[1], c[2]);
    }
  return toTexture(pc.commit(), { repeat: true });
}

/**
 * A clump of tall grass blades with alpha. Vertical pixel strokes, darker at
 * the root, yellowish tips (matches the reference's field band).
 */
export function makeTallGrassTexture() {
  const W = 64;
  const H = 96;
  const pc = new PixelCanvas(W, H);
  const rnd = mulberry32(7);
  const root: RGB = [66, 74, 34];
  const mid: RGB = [132, 136, 62];
  const tip: RGB = [196, 186, 110];
  const blades = 70;
  for (let k = 0; k < blades; k++) {
    const x0 = Math.floor(rnd() * W);
    const hgt = Math.floor(H * (0.55 + rnd() * 0.45));
    const lean = (rnd() - 0.5) * 0.35;
    const shade = rnd() * 0.3;
    for (let j = 0; j < hgt; j++) {
      const t = j / hgt;
      const y = H - 1 - j;
      const x = Math.round(x0 + lean * j);
      let c: RGB = t < 0.35 ? mix(root, mid, t / 0.35) : mix(mid, tip, (t - 0.35) / 0.65);
      c = mix(c, root, shade);
      c = jitter(c, 10, rnd);
      pc.setW(x, y, c[0], c[1], c[2], 255);
      if (t < 0.5 && rnd() < 0.5) pc.setW(x + 1, y, c[0] * 0.9, c[1] * 0.9, c[2] * 0.9, 255);
    }
    // seed heads
    if (rnd() < 0.35) {
      const x = Math.round(x0 + lean * hgt);
      for (let j = 0; j < 4; j++) pc.setW(x, H - hgt - j, tip[0] + 20, tip[1] + 10, tip[2], 255);
    }
  }
  return toTexture(pc.commit(), { repeat: false });
}

/** Tileable treeline silhouette strip (alpha). */
export function makeTreelineTexture() {
  const W = 512;
  const H = 64;
  const pc = new PixelCanvas(W, H);
  const rnd = mulberry32(55);
  const dark: RGB = [255, 255, 255];
  for (let x = 0; x < W; x++) {
    // periodic height profile made from overlapping tree crowns
    const u = x / W;
    let h = 18 + 14 * fbmPeriodic(u, 7, 4) + 10 * Math.pow(fbmPeriodic(u, 29, 3), 3);
    // individual tree spikes
    const spike = Math.abs(Math.sin(u * Math.PI * 96 + fbmPeriodic(u, 13, 2) * 6));
    h += spike * 6;
    for (let y = 0; y < H; y++) {
      const fromBottom = H - 1 - y;
      if (fromBottom < h) {
        const shade = 0.55 + 0.45 * (fromBottom / h) + (rnd() - 0.5) * 0.25;
        const v = clamp(shade * 255, 0, 255);
        pc.set(x, y, v * (dark[0] / 255), v * (dark[1] / 255), v * (dark[2] / 255), 255);
      }
    }
  }
  const t = toTexture(pc.commit(), { repeat: true, srgb: false });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function fbmPeriodic(u: number, period: number, oct: number) {
  // sample noise around a circle to be periodic in u
  const a = u * Math.PI * 2;
  const r = period / (Math.PI * 2);
  return fbm2(Math.cos(a) * r + 50, Math.sin(a) * r + 50, oct);
}

/** Grayscale dither/noise used for mountains (tinted in shader). */
export function makeMountainTexture() {
  const S = 256;
  const pc = new PixelCanvas(S, S);
  const rnd = mulberry32(3);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const n = fbm2((x / S) * 12, (y / S) * 12, 4);
      const d = (x + y) % 2 === 0 ? 0.04 : -0.04;
      const v = clamp((0.55 + (n - 0.5) * 0.7 + d + (rnd() - 0.5) * 0.08) * 255, 0, 255);
      pc.set(x, y, v, v, v);
    }
  return toTexture(pc.commit(), { repeat: true, srgb: false });
}

/** Generic tiling grayscale detail noise for props. */
export function makeDetailNoise(seed = 11, size = 32, amount = 0.18) {
  const pc = new PixelCanvas(size, size);
  const rnd = mulberry32(seed);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v = clamp((1 - amount * 0.5 + rnd() * amount) * 255, 0, 255);
      pc.set(x, y, v, v, v);
    }
  return toTexture(pc.commit(), { repeat: true, srgb: false });
}

/** Wood plank texture (grain lines). */
export function makeWoodTexture(base: RGB = [150, 102, 58], seed = 5) {
  const W = 32;
  const H = 32;
  const pc = new PixelCanvas(W, H);
  const rnd = mulberry32(seed);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const grain = Math.sin(y * 1.3 + vnoise2(x * 0.15, y * 0.4) * 5) * 0.5 + 0.5;
      let c: RGB = [base[0] * (0.78 + grain * 0.28), base[1] * (0.78 + grain * 0.28), base[2] * (0.78 + grain * 0.28)];
      c = jitter(c, 8, rnd);
      if (rnd() < 0.01) c = [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6];
      pc.set(x, y, c[0], c[1], c[2]);
    }
  // knots
  for (let k = 0; k < 2; k++) {
    const kx = Math.floor(rnd() * W);
    const ky = Math.floor(rnd() * H);
    pc.setW(kx, ky, base[0] * 0.45, base[1] * 0.45, base[2] * 0.45);
    pc.setW(kx + 1, ky, base[0] * 0.55, base[1] * 0.55, base[2] * 0.55);
  }
  return toTexture(pc.commit(), { repeat: true });
}

/** Soft round puff for smoke (linear, alpha). */
export function makePuffTexture() {
  const S = 64;
  const pc = new PixelCanvas(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S - 0.5;
      const dy = (y + 0.5) / S - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const n = fbm2(x * 0.12, y * 0.12, 3);
      const a = clamp((1 - r) * 1.6 * (0.55 + n * 0.9), 0, 1);
      const shade = clamp(0.75 + (0.5 - dy) * 0.35 + (n - 0.5) * 0.3, 0, 1);
      pc.set(x, y, shade * 255, shade * 255, shade * 255, a * a * 255);
    }
  return toTexture(pc.commit(), { nearest: false, srgb: false });
}

/** Pixel-art style blood splat atlas (4x4 variants), white shapes with alpha. */
export function makeSplatAtlas() {
  const cell = 32;
  const N = 4;
  const pc = new PixelCanvas(cell * N, cell * N);
  const rnd = mulberry32(4242);
  for (let cy = 0; cy < N; cy++)
    for (let cx = 0; cx < N; cx++) {
      const ox = cx * cell;
      const oy = cy * cell;
      const idx = cy * N + cx;
      const blobs = 3 + Math.floor(rnd() * 5);
      const pts: [number, number, number][] = [];
      for (let b = 0; b < blobs; b++) {
        const ang = rnd() * Math.PI * 2;
        const dist = b === 0 ? 0 : rnd() * 7;
        pts.push([16 + Math.cos(ang) * dist, 16 + Math.sin(ang) * dist, b === 0 ? 5 + rnd() * 4 : 1.5 + rnd() * 4]);
      }
      // droplets
      const drops = idx < 8 ? 10 + Math.floor(rnd() * 14) : 4;
      for (let d = 0; d < drops; d++) {
        const ang = rnd() * Math.PI * 2;
        const dist = 7 + rnd() * 8;
        pts.push([16 + Math.cos(ang) * dist, 16 + Math.sin(ang) * dist, 0.5 + rnd() * 1.2]);
      }
      for (let y = 0; y < cell; y++)
        for (let x = 0; x < cell; x++) {
          let v = 0;
          for (const [px, py, r] of pts) {
            const dx = x + 0.5 - px;
            const dy = y + 0.5 - py;
            v = Math.max(v, 1 - Math.sqrt(dx * dx + dy * dy) / r);
          }
          if (v > 0) {
            const inner = clamp(v * 3, 0, 1);
            const shade = 0.7 + 0.3 * inner + (rnd() - 0.5) * 0.2;
            const s = clamp(shade, 0, 1) * 255;
            pc.set(ox + x, oy + y, s, s, s, 255);
          }
        }
    }
  return toTexture(pc.commit(), { nearest: true, srgb: false, mipmaps: false });
}

/** Radial glow sprite (additive). */
export function makeGlowTexture() {
  const S = 64;
  const pc = new PixelCanvas(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S - 0.5;
      const dy = (y + 0.5) / S - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const a = clamp(1 - r, 0, 1);
      const v = Math.pow(a, 2.2);
      pc.set(x, y, 255, 255, 255, v * 255);
    }
  return toTexture(pc.commit(), { nearest: false, srgb: false });
}

/** Pixelated star-burst muzzle flash sprite. */
export function makeFlashTexture() {
  const S = 32;
  const pc = new PixelCanvas(S, S);
  const rnd = mulberry32(8);
  const rays = 7;
  const angs: number[] = [];
  for (let i = 0; i < rays; i++) angs.push((i / rays) * Math.PI * 2 + rnd() * 0.5);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - S / 2;
      const dy = y + 0.5 - S / 2;
      const r = Math.sqrt(dx * dx + dy * dy) / (S / 2);
      const a = Math.atan2(dy, dx);
      let v = clamp(1 - r * 2.2, 0, 1);
      for (const ra of angs) {
        let d = Math.abs(((a - ra + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        v = Math.max(v, clamp(1 - d * (3 + r * 10), 0, 1) * clamp(1 - r, 0, 1));
      }
      if (v > 0.05) {
        const q = Math.round(v * 4) / 4;
        pc.set(x, y, 255, 255, 255, q * 255);
      }
    }
  return toTexture(pc.commit(), { nearest: true, srgb: false, mipmaps: false });
}
