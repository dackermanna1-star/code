// Procedural canvas textures for the first-person view models.
//
// Textures are mostly neutral detail maps (noise, scratches, grain) that get
// multiplied by a per-vertex tint, so one "metal" map serves black, grey,
// olive and silver parts alike. Colour management is off, so the bytes here
// are what reaches the screen (before lighting).
//
// Every texture declares `unit`: how many GoldSrc units one repeat covers.
// Geometry UVs are authored in units, the shader multiplies by 1/unit.
// unit = 0 means the UVs are already 0..1 (decals such as the C4 keypad).

import * as THREE from 'three';

const cache = new Map();

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// Tileable value noise in [0,1], `cells` lattice cells across.
function vnoise(n, cells, rnd) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const fy = (y / n) * cells, y0 = Math.floor(fy), ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * cells, x0 = Math.floor(fx), tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const a = g[(y0 % cells) * cells + (x0 % cells)];
      const b = g[(y0 % cells) * cells + ((x0 + 1) % cells)];
      const c = g[((y0 + 1) % cells) * cells + (x0 % cells)];
      const d = g[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
      out[y * n + x] = (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
    }
  }
  return out;
}

function makeCanvas(n, m = n) {
  const c = document.createElement('canvas');
  c.width = n; c.height = m;
  return c;
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

// Build an RGB image from a per-pixel function f(x, y) -> [r,g,b] (0..255).
function pixels(n, f) {
  const c = makeCanvas(n);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(n, n);
  const d = img.data;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const [r, g, b] = f(x, y, y * n + x);
      const i = (y * n + x) * 4;
      d[i] = clamp255(r); d[i + 1] = clamp255(g); d[i + 2] = clamp255(b); d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Draw short scratch lines with wrap-around so the texture stays tileable.
function scratches(ctx, n, count, rnd, color, maxLen = 0.25, horiz = 0.4) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    const x = rnd() * n, y = rnd() * n;
    const a = (rnd() - 0.5) * Math.PI * (1 - horiz) * 2;
    const l = (0.03 + rnd() * maxLen) * n;
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
      ctx.stroke();
    }
  }
}

const builders = {
  // Neutral gun metal: mottled grey with fine speckle and light wear scratches.
  metal() {
    const n = 128, r = rng(11);
    const a = vnoise(n, 6, r), b = vnoise(n, 24, r);
    const c = pixels(n, (x, y, i) => {
      const v = 200 + (a[i] - 0.5) * 26 + (b[i] - 0.5) * 18 + (r() - 0.5) * 16;
      return [v, v, v];
    });
    const ctx = c.getContext('2d');
    ctx.globalAlpha = 0.35; scratches(ctx, n, 26, r, '#ffffff', 0.18, 0.6);
    ctx.globalAlpha = 0.25; scratches(ctx, n, 14, r, '#606060', 0.12, 0.3);
    return { canvas: c, unit: 7 };
  },
  // Brushed / satin steel (Deagle slide, Elites, knife spine).
  brushed() {
    const n = 128, r = rng(23);
    const rows = new Float32Array(n);
    for (let y = 0; y < n; y++) rows[y] = (r() - 0.5) * 18;
    const a = vnoise(n, 5, r);
    const c = pixels(n, (x, y, i) => {
      const v = 205 + rows[y] + (a[i] - 0.5) * 30 + (r() - 0.5) * 8;
      return [v, v, v * 1.01];
    });
    const ctx = c.getContext('2d');
    ctx.globalAlpha = 0.3; scratches(ctx, n, 30, r, '#4a4a4a', 0.15, 0.2);
    ctx.globalAlpha = 0.4; scratches(ctx, n, 20, r, '#ffffff', 0.2, 0.8);
    return { canvas: c, unit: 8 };
  },
  // Polymer / parkerized: fine stipple, little wear.
  polymer() {
    const n = 64, r = rng(37);
    const a = vnoise(n, 8, r);
    const c = pixels(n, (x, y, i) => {
      const v = 200 + (a[i] - 0.5) * 18 + (r() - 0.5) * 22;
      return [v, v, v];
    });
    return { canvas: c, unit: 4 };
  },
  // Grip checkering.
  knurl() {
    const n = 64, r = rng(41);
    const c = pixels(n, (x, y) => {
      const p = 8;
      const u = ((x + y) % p) / p, v = ((x - y + 1024) % p) / p;
      const d = Math.min(Math.abs(u - 0.5), Math.abs(v - 0.5));
      const val = 185 + (d < 0.12 ? -70 : 10) + (r() - 0.5) * 18;
      return [val, val, val];
    });
    return { canvas: c, unit: 1.6 };
  },
  // Ribbed / slotted metal (M4 handguard, muzzle brakes, heat shields).
  ribbed() {
    const n = 64, r = rng(43);
    const c = pixels(n, (x, y) => {
      const s = (x % 16) / 16;
      const val = (s < 0.3 ? 70 : s < 0.38 ? 235 : 195) + (r() - 0.5) * 16;
      return [val, val, val];
    });
    return { canvas: c, unit: 1.6 };
  },
  // Horizontal ribs (magazines, grips).
  ribbedH() {
    const n = 64, r = rng(47);
    const c = pixels(n, (x, y) => {
      const s = (y % 16) / 16;
      const val = (s < 0.18 ? 120 : s < 0.26 ? 235 : 200) + (r() - 0.5) * 16;
      return [val, val, val];
    });
    return { canvas: c, unit: 2.4 };
  },
  // Orange-brown furniture wood with dark grain (AK, Galil handguard).
  wood() {
    const n = 128, r = rng(53);
    const warp = vnoise(n, 4, r), fig = vnoise(n, 16, r), lines = vnoise(n, 32, r);
    const c = pixels(n, (x, y, i) => {
      const t = y / n + warp[i] * 0.35;
      let g = Math.sin(t * Math.PI * 2 * 11 + lines[i] * 1.5);
      g = Math.pow(Math.abs(g), 6) * (g > 0 ? 1 : 0.4);
      const k = 1 - g * 0.3 - (fig[i] - 0.5) * 0.16;
      const s = 1 + (r() - 0.5) * 0.06;
      return [150 * k * s, 70 * k * s * (0.97 + warp[i] * 0.06), 34 * k * s];
    });
    return { canvas: c, unit: 9 };
  },
  // Olive-black fingerless glove leather with seams and wrinkles.
  glove() {
    const n = 128, r = rng(61);
    const a = vnoise(n, 8, r), b = vnoise(n, 32, r);
    const c = pixels(n, (x, y, i) => {
      const v = 1 + (a[i] - 0.5) * 0.35 + (b[i] - 0.5) * 0.25 + (r() - 0.5) * 0.18;
      return [56 * v, 60 * v, 44 * v];
    });
    const ctx = c.getContext('2d');
    ctx.globalAlpha = 0.5; scratches(ctx, n, 30, r, '#14160f', 0.12, 0.2);
    ctx.globalAlpha = 0.25; scratches(ctx, n, 18, r, '#8a8f70', 0.08, 0.5);
    // a stitched seam
    ctx.globalAlpha = 0.6; ctx.strokeStyle = '#1a1c14'; ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo(0, n * 0.5); ctx.lineTo(n, n * 0.5); ctx.stroke();
    return { canvas: c, unit: 4 };
  },
  // Khaki / tan sleeve cloth: twill weave plus soft folds.
  sleeve() {
    const n = 128, r = rng(71);
    const folds = vnoise(n, 4, r), b = vnoise(n, 24, r);
    const c = pixels(n, (x, y, i) => {
      const tw = ((x + y * 2) % 4 < 2) ? 1.03 : 0.97;
      const fold = (folds[i] - 0.5) * 0.35;
      const v = (1 + fold + (b[i] - 0.5) * 0.08 + (r() - 0.5) * 0.06) * tw;
      return [222 * v, 184 * v, 118 * v];
    });
    return { canvas: c, unit: 7 };
  },
  // Finger tips.
  skin() {
    const n = 64, r = rng(83);
    const a = vnoise(n, 6, r);
    const c = pixels(n, (x, y, i) => {
      const v = 1 + (a[i] - 0.5) * 0.12 + (r() - 0.5) * 0.05;
      return [228 * v, 182 * v, 118 * v];
    });
    return { canvas: c, unit: 3 };
  },
  // CS knife blade: grey-green steel with pale camo blotches.
  blade() {
    const n = 128, r = rng(97);
    const a = vnoise(n, 5, r), b = vnoise(n, 11, r), f = vnoise(n, 40, r);
    const c = pixels(n, (x, y, i) => {
      const m = a[i] * 0.6 + b[i] * 0.4;
      const k = 1 + (f[i] - 0.5) * 0.12;
      if (m > 0.58) return [150 * k, 165 * k, 105 * k];
      if (m > 0.53) return [105 * k, 125 * k, 92 * k];
      return [62 * k, 88 * k, 76 * k];
    });
    return { canvas: c, unit: 7 };
  },
  // Scope / sight glass (0..1 mapped).
  lens() {
    const n = 32;
    const c = pixels(n, (x, y) => {
      const dx = x / n - 0.35, dy = y / n - 0.3;
      const h = Math.max(0, 1 - Math.hypot(dx, dy) * 4.0);
      const rim = Math.hypot(x / n - 0.5, y / n - 0.5) > 0.42 ? 0.5 : 1;
      return [(14 + h * 70) * rim, (22 + h * 90) * rim, (30 + h * 80) * rim];
    });
    return { canvas: c, unit: 0 };
  },
  // C4 plastic explosive brick.
  c4brick() {
    const n = 128, r = rng(101);
    const a = vnoise(n, 6, r);
    const c = pixels(n, (x, y, i) => {
      const v = 1 + (a[i] - 0.5) * 0.18 + (r() - 0.5) * 0.08;
      return [200 * v, 182 * v, 128 * v];
    });
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(60,50,30,0.55)';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('C4', 12, 40);
    ctx.font = '9px monospace';
    ctx.fillText('CHARGE DEMOLITION', 4, 90);
    ctx.fillText('M112 1.25 LB', 4, 104);
    return { canvas: c, unit: 8 };
  },
  // C4 control box top: LCD + 3x4 keypad (0..1 mapped).
  keypad() {
    const n = 128;
    const c = makeCanvas(n);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#26282a'; ctx.fillRect(0, 0, n, n);
    // LCD
    ctx.fillStyle = '#5d6b3a'; ctx.fillRect(10, 8, 108, 26);
    ctx.fillStyle = '#1d2410'; ctx.font = 'bold 18px monospace';
    ctx.fillText('*******', 22, 28);
    // keys
    const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    ctx.font = 'bold 12px monospace';
    for (let i = 0; i < 12; i++) {
      const cx = 14 + (i % 3) * 36, cy = 42 + Math.floor(i / 3) * 21;
      ctx.fillStyle = '#9a9c96'; ctx.fillRect(cx, cy, 28, 16);
      ctx.fillStyle = '#c8cac2'; ctx.fillRect(cx, cy, 28, 3);
      ctx.fillStyle = '#202020'; ctx.fillText(labels[i], cx + 10, cy + 13);
    }
    return { canvas: c, unit: 0 };
  },
  // Plain near-white for flat-coloured bits (tint gives the colour).
  flat() {
    const n = 16, r = rng(5);
    const c = pixels(n, () => { const v = 225 + (r() - 0.5) * 10; return [v, v, v]; });
    return { canvas: c, unit: 4 };
  },
};

export function getTexture(key) {
  let t = cache.get(key);
  if (t) return t;
  const b = builders[key] || builders.flat;
  const { canvas, unit } = b();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = unit ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 1;
  t = { tex, unit };
  cache.set(key, t);
  return t;
}

export const TEXTURE_KEYS = Object.keys(builders);
