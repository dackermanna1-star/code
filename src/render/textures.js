// Procedurally painted textures (albedo + derived normal maps). Everything is generated on canvases
// at load time so the game ships with zero image assets. All surface textures tile seamlessly.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';

function hash2(i, j, seed) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Tileable value noise: u,v in [0,1), freq lattice cells across the texture.
function vnoise(u, v, freq, seed) {
  const x = u * freq, y = v * freq;
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % freq) + freq) % freq, y0 = ((yi % freq) + freq) % freq;
  const x1 = (x0 + 1) % freq, y1 = (y0 + 1) % freq;
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(u, v, freq, oct, seed, gain = 0.5) {
  let s = 0, amp = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    s += vnoise(u, v, freq << o, seed + o * 17) * amp;
    norm += amp;
    amp *= gain;
  }
  return s / norm;
}

class Painter {
  constructor(size) {
    this.size = size;
    this.r = new Float32Array(size * size);
    this.g = new Float32Array(size * size);
    this.b = new Float32Array(size * size);
    this.h = new Float32Array(size * size);
    this.a = null;
  }

  toCanvas() {
    const { size } = this;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < size * size; i++) {
      d[i * 4] = Math.max(0, Math.min(255, this.r[i] * 255));
      d[i * 4 + 1] = Math.max(0, Math.min(255, this.g[i] * 255));
      d[i * 4 + 2] = Math.max(0, Math.min(255, this.b[i] * 255));
      d[i * 4 + 3] = this.a ? Math.max(0, Math.min(255, this.a[i] * 255)) : 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  normalCanvas(strength = 2) {
    const { size, h } = this;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        let nx = -dx, ny = dy, nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l; ny /= l; nz /= l;
        const i = (y * size + x) * 4;
        d[i] = (nx * 0.5 + 0.5) * 255;
        d[i + 1] = (ny * 0.5 + 0.5) * 255;
        d[i + 2] = (nz * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
}

function tex(canvas, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const col = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

// ---------------- surfaces ----------------

// Irregular stone bricks with bevelled edges, per-brick tone and grime.
export function makeBrickTexture(theme, seed = 1, opts = {}) {
  const size = 512;
  const P = new Painter(size);
  const rng = new RNG(seed);
  const base = col(theme.wall);
  const mortar = col(theme.mortar);
  const rows = opts.rows || 8;
  const rowH = size / rows;
  // Build brick rectangles per row (wrapping horizontally).
  const brickId = new Int32Array(size * size).fill(-1);
  const bricks = [];
  for (let r = 0; r < rows; r++) {
    let x = Math.floor(rng.range(0, 60));
    const start = x;
    while (x < start + size) {
      const w = Math.floor(rng.range(70, 150));
      const end = Math.min(x + w, start + size);
      bricks.push({ x0: x, x1: end, y0: r * rowH, y1: (r + 1) * rowH, tone: rng.range(-0.12, 0.12), hue: rng.range(-0.03, 0.03), chip: rng.next() });
      x = end;
    }
  }
  bricks.forEach((b, id) => {
    for (let y = b.y0; y < b.y1; y++) for (let xx = b.x0; xx < b.x1; xx++) brickId[y * size + (xx % size)] = id;
  });
  const gap = opts.gap || 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size, v = y / size;
      const b = bricks[brickId[i]];
      // distance to brick edge (wrapping)
      let ex = Math.min(((x - b.x0) % size + size) % size, ((b.x1 - x) % size + size) % size);
      const ey = Math.min(y - b.y0, b.y1 - 1 - y);
      const warp = (fbm(u, v, 16, 3, seed + 5) - 0.5) * 7;
      const e = Math.min(ex, ey) + warp;
      const n = fbm(u, v, 8, 5, seed);
      const fine = vnoise(u, v, 128, seed + 9);
      const grime = fbm(u, v, 4, 3, seed + 33);
      let hgt, cr, cg, cb;
      if (e < gap) {
        // mortar
        hgt = 0.05 + fine * 0.05;
        const m = 0.8 + fine * 0.3;
        cr = mortar[0] * m; cg = mortar[1] * m; cb = mortar[2] * m;
      } else {
        const bevel = Math.min(1, (e - gap) / 7);
        hgt = 0.35 + bevel * 0.45 + n * 0.25 + fine * 0.04;
        // painterly lighting: brighter top, darker bottom of each brick
        const vy = (y - b.y0) / (b.y1 - b.y0);
        const shade = 1 + b.tone + (0.5 - vy) * 0.18 + (n - 0.5) * 0.35 + (bevel - 1) * 0.25;
        const stain = 1 - Math.max(0, grime - 0.55) * 1.2;
        cr = base[0] * shade * stain * (1 + b.hue);
        cg = base[1] * shade * stain;
        cb = base[2] * shade * stain * (1 - b.hue);
        // chipped corners
        if (b.chip > 0.6 && fine > 0.75 && e < gap + 5) { hgt -= 0.2; cr *= 0.75; cg *= 0.75; cb *= 0.75; }
      }
      // moss / tint accent creeping from bottom of texture rows
      if (theme.moss) {
        const m = fbm(u, v, 6, 4, seed + 71);
        if (m > 0.62) {
          const k = Math.min(1, (m - 0.62) * 6);
          const mc = col(theme.moss);
          cr = cr * (1 - k) + mc[0] * k * (0.7 + fine * 0.5);
          cg = cg * (1 - k) + mc[1] * k * (0.7 + fine * 0.5);
          cb = cb * (1 - k) + mc[2] * k * (0.7 + fine * 0.5);
          hgt += k * 0.05;
        }
      }
      P.r[i] = cr; P.g[i] = cg; P.b[i] = cb; P.h[i] = hgt;
    }
  }
  if (opts.cracks) paintCracks(P, rng, opts.cracks, 0.35);
  return { map: tex(P.toCanvas()), normalMap: tex(P.normalCanvas(3.2), false) };
}

function paintCracks(P, rng, count, darkness) {
  const { size } = P;
  for (let c = 0; c < count; c++) {
    let x = rng.range(0, size), y = rng.range(0, size);
    let ang = rng.range(0, Math.PI * 2);
    const len = rng.range(80, 260);
    for (let s = 0; s < len; s++) {
      ang += rng.range(-0.35, 0.35);
      x += Math.cos(ang);
      y += Math.sin(ang);
      const w = Math.max(1, 3 * (1 - s / len));
      for (let oy = -w; oy <= w; oy++) for (let ox = -w; ox <= w; ox++) {
        const xi = ((Math.floor(x + ox) % size) + size) % size;
        const yi = ((Math.floor(y + oy) % size) + size) % size;
        const i = yi * size + xi;
        P.r[i] *= darkness; P.g[i] *= darkness; P.b[i] *= darkness;
        P.h[i] = Math.max(0, P.h[i] - 0.3);
      }
      if (rng.chance(0.015)) {
        // branch
        const sx = x, sy = y;
        let a2 = ang + rng.sign() * rng.range(0.5, 1.2);
        for (let k = 0; k < 40; k++) {
          a2 += rng.range(-0.3, 0.3);
          const bx = sx + Math.cos(a2) * k, by = sy + Math.sin(a2) * k;
          const i = (((Math.floor(by) % size) + size) % size) * size + (((Math.floor(bx) % size) + size) % size);
          P.r[i] *= darkness; P.g[i] *= darkness; P.b[i] *= darkness;
          P.h[i] = Math.max(0, P.h[i] - 0.25);
        }
      }
    }
  }
}

// Large flagstones with irregular sizes, worn edges and cracks.
export function makeFloorTexture(theme, seed = 2) {
  const size = 512;
  const P = new Painter(size);
  const rng = new RNG(seed);
  const base = col(theme.floor);
  const grout = col(theme.mortar);
  // 4x4 grid of tiles, some merged into 2x1
  const cells = 4, cs = size / cells;
  const tileOf = new Int32Array(cells * cells).fill(-1);
  const tiles = [];
  for (let ty = 0; ty < cells; ty++) {
    for (let tx = 0; tx < cells; tx++) {
      if (tileOf[ty * cells + tx] >= 0) continue;
      let w = 1, h = 1;
      if (tx < cells - 1 && tileOf[ty * cells + tx + 1] < 0 && rng.chance(0.3)) w = 2;
      else if (ty < cells - 1 && rng.chance(0.25)) h = 2;
      const id = tiles.length;
      tiles.push({ x0: tx * cs, y0: ty * cs, x1: (tx + w) * cs, y1: (ty + h) * cs, tone: rng.range(-0.13, 0.13), tilt: rng.range(-0.1, 0.1) });
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) tileOf[(ty + yy) * cells + tx + xx] = id;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size, v = y / size;
      const t = tiles[tileOf[Math.floor(y / cs) * cells + Math.floor(x / cs)]];
      const warp = (fbm(u, v, 12, 3, seed + 3) - 0.5) * 9;
      const e = Math.min(x - t.x0, t.x1 - 1 - x, y - t.y0, t.y1 - 1 - y) + warp;
      const n = fbm(u, v, 8, 5, seed + 1);
      const fine = vnoise(u, v, 160, seed + 4);
      const dirt = fbm(u, v, 3, 4, seed + 8);
      let hgt, cr, cg, cb;
      if (e < 3.5) {
        hgt = 0.03;
        const m = 0.7 + fine * 0.3;
        cr = grout[0] * m; cg = grout[1] * m; cb = grout[2] * m;
      } else {
        const bevel = Math.min(1, (e - 3.5) / 10);
        hgt = 0.3 + bevel * 0.4 + n * 0.3 + fine * 0.05 + t.tilt * ((x - t.x0) / cs);
        const shade = (1 + t.tone + (n - 0.5) * 0.4 + (bevel - 1) * 0.3) * (1 - Math.max(0, dirt - 0.5) * 0.9);
        cr = base[0] * shade; cg = base[1] * shade; cb = base[2] * shade;
      }
      P.r[i] = cr; P.g[i] = cg; P.b[i] = cb; P.h[i] = hgt;
    }
  }
  paintCracks(P, rng, 3, 0.72);
  return { map: tex(P.toCanvas()), normalMap: tex(P.normalCanvas(2.6), false) };
}

export function makeRockTexture(theme, seed = 3) {
  const size = 256;
  const P = new Painter(size);
  const base = col(theme.ceiling);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size, v = y / size;
      const n = fbm(u, v, 4, 6, seed);
      const r = Math.abs(fbm(u, v, 8, 4, seed + 9) - 0.5) * 2;
      const hgt = n * 0.7 + (1 - r) * 0.3;
      const shade = 0.6 + hgt * 0.7;
      P.r[i] = base[0] * shade; P.g[i] = base[1] * shade; P.b[i] = base[2] * shade; P.h[i] = hgt;
    }
  }
  return { map: tex(P.toCanvas()), normalMap: tex(P.normalCanvas(4), false) };
}

export function makeWoodTexture(hex = '#6b4a2f', seed = 4, planks = 4) {
  const size = 256;
  const P = new Painter(size);
  const base = col(hex);
  const rng = new RNG(seed);
  const pw = size / planks;
  const tones = Array.from({ length: planks }, () => rng.range(-0.15, 0.15));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size, v = y / size;
      const p = Math.floor(x / pw);
      const ex = Math.min(x - p * pw, (p + 1) * pw - 1 - x);
      const grain = vnoise(u * 1, v, 64, seed + p) * 0.5 + fbm(u, v, 4, 3, seed + 2) * 0.5;
      const rings = Math.sin((u * 40 + grain * 6 + p * 3) * Math.PI) * 0.5 + 0.5;
      let shade = 1 + tones[p] + (rings - 0.5) * 0.25 + (grain - 0.5) * 0.3;
      let hgt = 0.6 + rings * 0.15 + grain * 0.1;
      if (ex < 2) { shade *= 0.35; hgt = 0.1; }
      // nail heads
      const ny = (y % 128);
      if ((ny > 10 && ny < 16) && Math.abs(x - p * pw - pw / 2) < 3) { shade = 0.45; hgt = 0.95; }
      P.r[i] = base[0] * shade; P.g[i] = base[1] * shade; P.b[i] = base[2] * shade; P.h[i] = hgt;
    }
  }
  return { map: tex(P.toCanvas()), normalMap: tex(P.normalCanvas(2), false) };
}

export function makeMetalTexture(hex = '#888888', seed = 5) {
  const size = 128;
  const P = new Painter(size);
  const base = col(hex);
  const rng = new RNG(seed);
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = Math.floor(i / size);
    const n = fbm(x / size, y / size, 8, 4, seed);
    const s = 0.85 + n * 0.3;
    P.r[i] = base[0] * s; P.g[i] = base[1] * s; P.b[i] = base[2] * s; P.h[i] = n * 0.2;
  }
  // scratches
  for (let k = 0; k < 40; k++) {
    let x = rng.range(0, size), y = rng.range(0, size);
    const a = rng.range(0, Math.PI);
    const len = rng.range(5, 30);
    for (let s = 0; s < len; s++) {
      const i = ((Math.floor(y) + size) % size) * size + ((Math.floor(x) + size) % size);
      P.r[i] *= 1.25; P.g[i] *= 1.25; P.b[i] *= 1.25;
      x += Math.cos(a); y += Math.sin(a);
    }
  }
  return { map: tex(P.toCanvas()), normalMap: tex(P.normalCanvas(1), false) };
}

export function makeClothTexture(hex = '#7a2a2a', seed = 6) {
  const size = 128;
  const P = new Painter(size);
  const base = col(hex);
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = Math.floor(i / size);
    const weave = ((x % 4 < 2) !== (y % 4 < 2) ? 0.08 : -0.08);
    const n = fbm(x / size, y / size, 4, 4, seed);
    const s = 0.8 + n * 0.4 + weave;
    P.r[i] = base[0] * s; P.g[i] = base[1] * s; P.b[i] = base[2] * s; P.h[i] = 0.5 + weave;
  }
  return { map: tex(P.toCanvas()), normalMap: tex(P.normalCanvas(1.5), false) };
}

// Near-white tileable detail textures for creatures and gear; the material colour supplies the hue.
// kind: skin (mottling + pores), bone (streaks, pits, hairline cracks), leather (pebbled grain, scuffs).
export function makeDetailTexture(kind, seed = 21) {
  const size = kind === 'skin' ? 256 : 128;
  const P = new Painter(size);
  const rng = new RNG(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size, v = y / size;
      let s = 1, h = 0.5;
      if (kind === 'skin') {
        const mott = fbm(u, v, 4, 4, seed);
        const blotch = fbm(u, v, 3, 2, seed + 5);
        const pores = vnoise(u, v, 96, seed + 9);
        const veins = Math.abs(fbm(u, v, 6, 3, seed + 13) - 0.5);
        s = 0.86 + mott * 0.22 - Math.max(0, blotch - 0.62) * 0.6 - (veins < 0.02 ? 0.1 : 0);
        h = mott * 0.35 + pores * 0.25 + (veins < 0.02 ? 0.15 : 0);
      } else if (kind === 'bone') {
        const streak = fbm(u * 0.25, v, 8, 3, seed);
        const pit = vnoise(u, v, 48, seed + 3);
        s = 0.84 + streak * 0.24 - (pit > 0.82 ? 0.18 : 0);
        h = streak * 0.3 - (pit > 0.82 ? 0.25 : 0) + 0.4;
      } else {
        const grain = vnoise(u, v, 64, seed);
        const grain2 = vnoise(u, v, 32, seed + 1);
        const wear = fbm(u, v, 4, 3, seed + 2);
        const cell = Math.min(grain, grain2);
        s = 0.8 + wear * 0.3 + (cell < 0.25 ? -0.1 : 0.05) + Math.max(0, wear - 0.65) * 0.5;
        h = cell * 0.6 + wear * 0.2;
      }
      P.r[i] = s; P.g[i] = s * (kind === 'bone' ? 0.98 : 1); P.b[i] = s * (kind === 'bone' ? 0.93 : 1); P.h[i] = h;
    }
  }
  if (kind === 'bone') paintCracks(P, rng, 3, 0.7);
  if (kind === 'skin') {
    // a few scars / scratches
    for (let k = 0; k < 6; k++) {
      let x = rng.range(0, size), y = rng.range(0, size);
      const a = rng.range(0, Math.PI), len = rng.range(10, 40);
      for (let t = 0; t < len; t++) {
        const i = ((Math.floor(y) + size) % size) * size + ((Math.floor(x) + size) % size);
        P.r[i] *= 0.82; P.g[i] *= 0.78; P.b[i] *= 0.8; P.h[i] += 0.25;
        x += Math.cos(a); y += Math.sin(a);
      }
    }
  }
  return { map: tex(P.toCanvas()), normalMap: tex(P.normalCanvas(kind === 'skin' ? 3 : 2.5), false) };
}

// Glowing lava / molten crack texture (emissive map).
export function makeLavaTexture(seed = 7) {
  const size = 256;
  const P = new Painter(size);
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = Math.floor(i / size);
    const u = x / size, v = y / size;
    const n = fbm(u, v, 4, 5, seed);
    const r = 1 - Math.abs(fbm(u, v, 6, 4, seed + 3) - 0.5) * 2;
    const k = Math.pow(Math.max(0, r), 6) + n * 0.25;
    P.r[i] = Math.min(1, k * 1.6 + 0.08);
    P.g[i] = Math.min(1, k * k * 0.9 + 0.02);
    P.b[i] = k * k * k * 0.2;
    P.h[i] = 1 - k;
  }
  return { map: tex(P.toCanvas()), normalMap: tex(P.normalCanvas(2), false) };
}

// ---------------- sprites & decals ----------------

export function makeSplatTexture(seed) {
  const size = 128;
  const P = new Painter(size);
  P.a = new Float32Array(size * size);
  const rng = new RNG(seed);
  const blobs = [];
  blobs.push({ x: 64, y: 64, r: rng.range(20, 30) });
  for (let i = 0; i < rng.int(4, 9); i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(15, 45);
    blobs.push({ x: 64 + Math.cos(a) * d, y: 64 + Math.sin(a) * d, r: rng.range(3, 12) });
  }
  for (let i = 0; i < rng.int(6, 14); i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(35, 60);
    blobs.push({ x: 64 + Math.cos(a) * d, y: 64 + Math.sin(a) * d, r: rng.range(1.5, 4) });
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      let f = 0;
      for (const b of blobs) {
        const d2 = (x - b.x) ** 2 + (y - b.y) ** 2;
        f += (b.r * b.r) / (d2 + 1);
      }
      const n = vnoise(x / size, y / size, 16, seed) * 0.4;
      const a = Math.min(1, Math.max(0, (f + n - 1.0) * 3));
      const edge = Math.min(1, Math.max(0, (f - 1.0) * 0.6));
      P.a[i] = a * 0.95;
      // darker centre, brighter rim, white => tinted via material/instance colour
      const s = 0.75 + (1 - edge) * 0.25;
      P.r[i] = s; P.g[i] = s; P.b[i] = s;
    }
  }
  const t = tex(P.toCanvas(), true, false);
  return t;
}

export function makeRadialTexture(inner = 1, power = 2, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1;
      const d = Math.min(1, Math.hypot(dx, dy));
      const a = Math.pow(1 - d, power) * inner;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, true, false);
}

export function makeSmokeTexture(seed = 11) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1;
      const d = Math.hypot(dx, dy);
      const n = fbm(x / size, y / size, 4, 4, seed);
      const a = Math.max(0, 1 - d - (n - 0.5) * 0.8);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 200 + n * 55;
      img.data[i + 3] = Math.min(255, Math.pow(a, 1.5) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, true, false);
}

// Glowing rune circle used for shrines, portals and the stairs.
export function makeRuneTexture(seed = 12) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const rng = new RNG(seed);
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 8;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 118, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 96, 0, Math.PI * 2);
  ctx.stroke();
  // star
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 5; i++) {
    const a = (i * 2 * Math.PI * 2) / 5 - Math.PI / 2;
    const x = Math.cos(a) * 94, y = Math.sin(a) * 94;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // runes around the ring
  ctx.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    ctx.save();
    ctx.rotate((i / 16) * Math.PI * 2);
    ctx.translate(0, -107);
    ctx.beginPath();
    for (let s = 0; s < 3; s++) {
      ctx.moveTo(rng.range(-5, 5), rng.range(-6, 6));
      ctx.lineTo(rng.range(-5, 5), rng.range(-6, 6));
    }
    ctx.stroke();
    ctx.restore();
  }
  return tex(c, true, false);
}

// Tiny pixel-ish icons are drawn as emoji/text in the HUD; this makes a soft vignette for blob shadows.
export function makeShadowTexture() {
  return makeRadialTexture(0.85, 1.6, 64);
}
