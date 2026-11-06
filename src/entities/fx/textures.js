// Procedural pixel-art atlases for FX: billboard sprites (4×4 frames of 16 px, greyscale + alpha, tinted
// per particle) and decals (blood splats / pools, bullet holes, scorch marks; painted in colour).
import * as THREE from 'three';
import { makeRng } from '../../core/rng.js';

export const SPRITE = {
  SMOKE_A: 0, SMOKE_B: 1, SMOKE_C: 2, DUST: 3, FLAME_A: 4, FLAME_B: 5, FLAME_C: 6, EMBER: 7,
  STAR: 8, GLOW: 9, STREAK: 10, DROP: 11, RING: 12, MIST: 13, GLINT: 14, CHIP: 15,
};

function tex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let spriteTex = null;
export function getSpriteAtlas() {
  if (spriteTex) return spriteTex;
  const F = 16, N = 4;
  const c = document.createElement('canvas');
  c.width = c.height = F * N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(F * N, F * N);
  const rng = makeRng(4242);
  const put = (frame, fn) => {
    const ox = (frame % N) * F, oy = Math.floor(frame / N) * F;
    for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
      const v = fn(x + 0.5 - F / 2, y + 0.5 - F / 2, x, y); // centred coords
      if (!v) continue;
      const i = ((oy + y) * F * N + ox + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v[0] * 255));
      img.data[i + 3] = Math.max(0, Math.min(255, v[1] * 255));
    }
  };
  const blob = (seed, nb, rad) => {
    const r = makeRng(seed);
    const bs = [];
    for (let i = 0; i < nb; i++) bs.push([(r.next() - 0.5) * 7, (r.next() - 0.5) * 7, rad * (0.55 + r.next() * 0.5)]);
    return (x, y) => {
      let f = 0;
      for (const [bx, by, br] of bs) f = Math.max(f, 1 - Math.hypot(x - bx, y - by) / br);
      return f;
    };
  };
  // smoke puffs: lumpy blobs, lighter top-left (fake self shadowing), dithered edge
  [[11, 6, 5.2], [23, 7, 4.8], [37, 5, 4.2]].forEach(([seed, nb, rad], k) => {
    const b = blob(seed, nb, rad);
    put(SPRITE.SMOKE_A + k, (x, y) => {
      const f = b(x, y);
      if (f <= 0) return null;
      const shade = 0.72 + 0.28 * Math.max(0, Math.min(1, 0.5 - (x + y) / 14)) + (rng.next() - 0.5) * 0.08;
      const a = f > 0.25 ? 1 : (f / 0.25) * ((x + y) & 1 ? 0.9 : 0.6);
      return [shade, a];
    });
  });
  // dust: smaller, very soft and dithered
  const bd = blob(51, 5, 4.6);
  put(SPRITE.DUST, (x, y) => { const f = bd(x, y); return f > 0 ? [0.9 + (rng.next() - 0.5) * 0.1, Math.min(1, f * 2.2) * ((x ^ y) & 1 ? 1 : 0.75)] : null; });
  // flames: teardrops with a hot core
  [[0, 1.0], [1, 0.85], [2, 0.7]].forEach(([k, w]) => {
    put(SPRITE.FLAME_A + k, (x, y) => {
      const yy = (y + 1) / 8; // -1 top .. 1 bottom
      const width = (yy > 0 ? Math.sqrt(1 - Math.min(1, yy * yy)) : Math.max(0, 1 + yy * 0.95)) * 5.4 * w;
      const wob = Math.sin(y * 1.3 + k * 2) * 0.8;
      const d = Math.abs(x - wob * (1 - yy) * 0.5) / Math.max(0.01, width);
      if (d > 1 || yy < -1.1) return null;
      const core = Math.max(0, 1 - d) * Math.max(0, Math.min(1, (yy + 0.6)));
      return [0.55 + core * 0.45, d > 0.8 ? 0.6 : 1];
    });
  });
  put(SPRITE.EMBER, (x, y) => { const d = Math.hypot(x, y); return d < 2.2 ? [1, d < 1.2 ? 1 : 0.6] : d < 3.5 ? [0.8, 0.25] : null; });
  put(SPRITE.STAR, (x, y) => {
    const ax = Math.abs(x), ay = Math.abs(y);
    const arm = Math.max(Math.max(0, 1 - ay / 1.6) * Math.max(0, 1 - ax / 8), Math.max(0, 1 - ax / 1.6) * Math.max(0, 1 - ay / 8));
    const diag = Math.max(0, 1 - Math.abs(ax - ay) / 1.2) * Math.max(0, 1 - (ax + ay) / 9);
    const core = Math.max(0, 1 - Math.hypot(x, y) / 4);
    const f = Math.max(arm, diag * 0.7, core);
    return f > 0.05 ? [0.7 + 0.3 * core, Math.min(1, f * 1.4)] : null;
  });
  put(SPRITE.GLOW, (x, y) => { const d = Math.hypot(x, y) / 8; return d < 1 ? [1, Math.pow(1 - d, 1.6)] : null; });
  put(SPRITE.STREAK, (x, y) => { const ax = Math.abs(x); const ay = Math.abs(y) / 8; return ax < 1.6 && ay < 1 ? [1, (1 - ay * ay) * (ax < 0.9 ? 1 : 0.5)] : null; });
  put(SPRITE.DROP, (x, y) => { const d = Math.hypot(x, (y - 1) * 0.8); return d < 3.2 || (Math.abs(x) < 1.5 - (y + 4) * 0.2 && y < 0 && y > -5) ? [0.9 + (x < 0 && y < 0 ? 0.1 : 0), 1] : null; });
  put(SPRITE.RING, (x, y) => { const d = Math.hypot(x, y); return d > 5.5 && d < 7.6 ? [1, ((x + y) & 1) ? 1 : 0.7] : null; });
  const bm = blob(77, 8, 3.6);
  put(SPRITE.MIST, (x, y) => { const f = bm(x, y); return f > 0 ? [0.8 + rng.next() * 0.2, Math.min(1, f * 1.8) * (rng.next() < 0.85 ? 1 : 0)] : null; });
  put(SPRITE.GLINT, (x, y) => { const ax = Math.abs(x), ay = Math.abs(y); return (ax < 0.8 && ay < 5) || (ay < 0.8 && ax < 5) ? [1, 1 - Math.max(ax, ay) / 6] : null; });
  put(SPRITE.CHIP, (x, y) => (Math.abs(x) < 3 && Math.abs(y) < 3 ? [0.85 + ((x * 3 + y) & 3) * 0.05, 1] : null));
  ctx.putImageData(img, 0, 0);
  spriteTex = tex(c);
  return spriteTex;
}

// ------------------------------------------------------------------ decals
/** decal frames: [u0, v0, du, dv] in uv space (v from the top of the canvas, flipped in the shader) */
export const DECAL = {};
let decalTex = null;
export function getDecalAtlas() {
  if (decalTex) return decalTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const rng = makeRng(9001);
  const set = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
  };
  const frame = (name, x, y, w, h) => {
    (DECAL[name] || (DECAL[name] = [])).push([x / S, y / S, w / S, h / S]);
  };
  // field painter
  const paint = (ox, oy, w, h, fn) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = fn(x - w / 2 + 0.5, y - h / 2 + 0.5, x, y);
      if (v) set(ox + x, oy + y, v[0], v[1], v[2], v[3]);
    }
  };
  const bloodCol = (f, x, y) => {
    // f: coverage 0..1 (1 = centre). darker rim, wet highlight speckles
    const n = rng.next();
    const base = 58 + f * 26 + n * 10;
    if (f > 0.55 && n < 0.02) return [128, 40, 36, 245];
    return [base, 6 + n * 4, 5 + n * 3, f < 0.12 ? 200 : 238];
  };
  // blood splats (6): main blob + satellites + directional spray
  for (let k = 0; k < 6; k++) {
    const r = makeRng(100 + k);
    const blobs = [];
    const main = 5 + r.next() * 4;
    blobs.push([0, 0, main]);
    for (let i = 0; i < 5; i++) blobs.push([(r.next() - 0.5) * 9, (r.next() - 0.5) * 9, main * (0.35 + r.next() * 0.35)]);
    const dir = r.next() * Math.PI * 2;
    for (let i = 0; i < 9; i++) {
      const d = main + 2 + r.next() * 8;
      const a = dir + (r.next() - 0.5) * 1.6;
      blobs.push([Math.cos(a) * d, Math.sin(a) * d, 0.7 + r.next() * 1.4]);
    }
    const ox = k * 32, oy = 0;
    paint(ox, oy, 32, 32, (x, y) => {
      let f = 0;
      for (const [bx, by, br] of blobs) f = Math.max(f, 1 - Math.hypot(x - bx, y - by) / br);
      return f > 0 ? bloodCol(f, x, y) : null;
    });
    frame('blood', ox, oy, 32, 32);
  }
  // drips (2): vertical runs (top of frame = top of the streak)
  for (let k = 0; k < 2; k++) {
    const r = makeRng(200 + k);
    const ox = 192 + k * 32, oy = 0;
    const runs = [];
    for (let i = 0; i < 4; i++) runs.push([(r.next() - 0.5) * 18, 10 + r.next() * 20, 0.8 + r.next() * 1.2]);
    paint(ox, oy, 32, 32, (x, y, px, py) => {
      let f = 0;
      const top = 1 - Math.hypot(x / 12, (py - 4) / 5);
      f = Math.max(f, top);
      for (const [rx, len, wd] of runs) {
        if (py < len && Math.abs(x - rx) < wd) f = Math.max(f, 0.6 - py / len * 0.4);
        if (Math.hypot(x - rx, py - len) < wd + 0.8) f = Math.max(f, 0.5);
      }
      return f > 0 ? bloodCol(f, x, y) : null;
    });
    frame('drip', ox, oy, 32, 32);
  }
  // pools (2): big irregular puddles 64×64
  for (let k = 0; k < 2; k++) {
    const r = makeRng(300 + k);
    const blobs = [];
    for (let i = 0; i < 9; i++) blobs.push([(r.next() - 0.5) * 30, (r.next() - 0.5) * 30, 8 + r.next() * 10]);
    for (let i = 0; i < 8; i++) blobs.push([(r.next() - 0.5) * 50, (r.next() - 0.5) * 50, 1.5 + r.next() * 3]);
    const ox = k * 64, oy = 32;
    paint(ox, oy, 64, 64, (x, y) => {
      let f = 0;
      for (const [bx, by, br] of blobs) f = Math.max(f, 1 - Math.hypot(x - bx, y - by) / br);
      if (f <= 0) return null;
      const c = bloodCol(Math.min(1, f * 1.4), x, y);
      c[0] *= 0.88;
      return c;
    });
    frame('pool', ox, oy, 64, 64);
  }
  // scorch 64×64
  {
    const ox = 128, oy = 32;
    paint(ox, oy, 64, 64, (x, y) => {
      const d = Math.hypot(x, y) / 30 + (rng.next() - 0.5) * 0.12;
      if (d > 1) return null;
      const a = Math.min(1, (1 - d) * 2.2) * 235;
      const v = 14 + d * 30 + rng.next() * 8;
      if (d < 0.45 && rng.next() < 0.04) return [70, 40, 20, a];
      return [v, v * 0.9, v * 0.8, a];
    });
    frame('scorch', ox, oy, 64, 64);
  }
  // bullet holes 16×16 (stone, wood, metal, glass, dirt) at row y=96
  const hole = (name, ox, oy, fn) => { paint(ox, oy, 16, 16, fn); frame(name, ox, oy, 16, 16); };
  hole('hole_stone', 0, 96, (x, y) => {
    const d = Math.hypot(x, y);
    if (d < 1.8) return [18, 18, 18, 255];
    if (d < 3.2) return [55, 55, 55, 235];
    if (d < 5.5 && rng.next() < 0.6 - d * 0.08) return [170, 168, 160, 170];
    return null;
  });
  hole('hole_wood', 16, 96, (x, y) => {
    const d = Math.hypot(x, y);
    if (d < 1.8) return [16, 10, 6, 255];
    if (d < 3) return [60, 40, 22, 240];
    if (Math.abs(y) < 0.8 && Math.abs(x) < 6 && rng.next() < 0.8) return [190, 150, 100, 200]; // splinter line
    if (d < 4.5 && rng.next() < 0.3) return [200, 170, 120, 160];
    return null;
  });
  hole('hole_metal', 32, 96, (x, y) => {
    const d = Math.hypot(x, y);
    if (d < 1.6) return [10, 10, 12, 255];
    if (d < 2.8) return [200, 200, 205, 250];
    if (d < 4) return [90, 92, 96, 200];
    return null;
  });
  hole('hole_glass', 48, 96, (x, y) => {
    const d = Math.hypot(x, y);
    if (d < 1.2) return [20, 24, 28, 230];
    const a = Math.atan2(y, x);
    const spoke = Math.abs(Math.sin(a * 4 + 0.3)) < 0.12 || Math.abs(Math.sin(a * 3 + 1.1)) < 0.08;
    if (spoke && d < 7.5) return [235, 245, 250, 200];
    if (Math.abs(d - 4.2) < 0.5 && rng.next() < 0.7) return [230, 240, 245, 170];
    return null;
  });
  hole('hole_dirt', 64, 96, (x, y) => {
    const d = Math.hypot(x, y);
    if (d < 2.2) return [26, 20, 14, 240];
    if (d < 4.5 && rng.next() < 0.5) return [60, 46, 30, 190];
    return null;
  });
  ctx.putImageData(img, 0, 0);
  decalTex = tex(c);
  return decalTex;
}
