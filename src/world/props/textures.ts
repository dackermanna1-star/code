// Procedural canvas textures for the kitchen: wood, tiles, wallpaper, floor, fabrics, sky...
// All cached by key; sizes kept <= 512 (a few at 1024) for mobile.

import * as THREE from 'three';
import { canvasTex, paintPixels, fbm2, noise2, hexRgb, Rand, roundRectPath, mixHex, shade } from './util';
import { PALETTE } from '../palette';

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------------------------
// Wood

/**
 * Light neutral wood grain running along U (x). Tint with the material colour.
 * `strips` > 0 paints butcher-block strips (rows) with per-strip tone shifts and seams.
 */
export function woodTex(key: string, o: { strips?: number; w?: number; h?: number; rings?: number; contrast?: number; base?: string } = {}): THREE.Texture {
  const W = o.w ?? 512, H = o.h ?? 512;
  const strips = o.strips ?? 0;
  const rings = o.rings ?? 9;
  const contrast = o.contrast ?? 1;
  const base = hexRgb(o.base ?? '#f2dcc0');
  return canvasTex(
    'wood:' + key,
    W,
    H,
    (ctx, w, h) => {
      const rnd = new Rand(strips * 13 + rings * 7 + W);
      const stripTone: number[] = [];
      const stripOff: number[] = [];
      for (let i = 0; i < Math.max(1, strips); i++) {
        stripTone.push(rnd.range(-0.09, 0.07));
        stripOff.push(rnd.range(0, 50));
      }
      paintPixels(ctx, w, h, (x, y) => {
        const u = x / w, v = y / h;
        let tone = 0, off = 0, seam = 0, local = v;
        if (strips > 0) {
          const sv = v * strips;
          const si = Math.floor(sv);
          tone = stripTone[si];
          off = stripOff[si];
          local = sv - si;
          const e = Math.min(local, 1 - local) * (h / strips);
          seam = 1 - smooth(0, 1.6, e);
        }
        const warp = fbm2(u * 3, v * 2 + off, 3, 3, 2) * 0.9;
        const ring = 0.5 + 0.5 * Math.sin((local * rings + warp * 2.2 + off) * Math.PI * 2);
        const ringSharp = Math.pow(ring, 3.5);
        const streak = noise2(u * 6, v * (strips > 0 ? strips * 40 : 90) + off, 6, strips > 0 ? strips * 40 : 90);
        const pores = noise2(u * 64, v * 220, 64, 220);
        let k = 1 + tone - ringSharp * 0.16 * contrast - streak * 0.05 * contrast - Math.max(0, pores) * 0.035;
        k -= seam * 0.28;
        return [clamp255(base[0] * k), clamp255(base[1] * k * 0.995), clamp255(base[2] * k * 0.985)];
      });
    },
    { wrap: true, aniso: 8 },
  );
}

/** Wood planks (vertical boards for wainscot / fences): boards along V with gaps. */
export function plankTex(key: string, boards = 4, base = '#f3e3cc'): THREE.Texture {
  const b = hexRgb(base);
  return canvasTex(
    'plank:' + key,
    256,
    256,
    (ctx, w, h) => {
      paintPixels(ctx, w, h, (x, y) => {
        const u = x / w, v = y / h;
        const bu = u * boards;
        const bi = Math.floor(bu);
        const lu = bu - bi;
        const edge = Math.min(lu, 1 - lu) * (w / boards);
        const gap = 1 - smooth(0.5, 2.2, edge);
        const g = fbm2(bu * 2 + bi * 3.1, v * 6, 2, boards * 2, 6) * 0.06;
        const k = 1 + g - gap * 0.3 + (bi % 2 ? 0.02 : -0.01);
        return [clamp255(b[0] * k), clamp255(b[1] * k), clamp255(b[2] * k)];
      });
    },
    { wrap: true },
  );
}

// ---------------------------------------------------------------------------------------------
// Tiles

/** Square backsplash tiles (mint & white), `n` x `n` per texture. Also returns a bump map. */
export function tileTextures(n = 4): { map: THREE.Texture; bump: THREE.Texture } {
  const S = 512;
  const mint = hexRgb(PALETTE.tile);
  const white = hexRgb('#f7fcfa');
  const grout = hexRgb(PALETTE.tileGrout);
  const tile = S / n;
  const pattern = (i: number, j: number) => {
    // mostly mint, with a playful diagonal of white tiles
    return (i + j) % 2 === 0;
  };
  const map = canvasTex(
    'tiles:' + n,
    S,
    S,
    (ctx, w, h) => {
      const r = new Rand(42);
      const tones: number[] = [];
      for (let i = 0; i < n * n; i++) tones.push(r.range(-0.03, 0.03));
      paintPixels(ctx, w, h, (x, y) => {
        const i = Math.floor(x / tile), j = Math.floor(y / tile);
        const lx = x - i * tile, ly = y - j * tile;
        const e = Math.min(lx, ly, tile - 1 - lx, tile - 1 - ly);
        const g = 4.5;
        if (e < g - 1) return grout.map((c) => c * (0.97 + 0.03 * Math.random()));
        const c = pattern(i, j) ? white : mint;
        const t = tones[j * n + i];
        // glaze: soft bevel highlight near the top-left edge, darker bottom-right, pooled centre
        const bev = smooth(g - 1, g + 7, e);
        const tl = (lx + ly) / (2 * tile);
        let k = 1 + t + (1 - bev) * (tl < 0.5 ? 0.06 : -0.08) + (0.5 - tl) * 0.05;
        k += noise2(x / 9, y / 9, S / 9, S / 9) * 0.008;
        return [clamp255(c[0] * k), clamp255(c[1] * k), clamp255(c[2] * k)];
      });
    },
    { wrap: true, aniso: 8 },
  );
  const bump = canvasTex(
    'tilesBump:' + n,
    S / 2,
    S / 2,
    (ctx, w, h) => {
      const t2 = tile / 2;
      paintPixels(ctx, w, h, (x, y) => {
        const lx = x % t2, ly = y % t2;
        const e = Math.min(lx, ly, t2 - 1 - lx, t2 - 1 - ly);
        const v = 255 * smooth(0.6, 4.5, e);
        return [v, v, v];
      });
    },
    { wrap: true, srgb: false },
  );
  return { map, bump };
}

// ---------------------------------------------------------------------------------------------
// Walls

/** Cream wallpaper with tiny retro starbursts & dots. */
export function wallpaperTex(): THREE.Texture {
  return canvasTex(
    'wallpaper',
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = PALETTE.wall;
      ctx.fillRect(0, 0, w, h);
      // faint vertical stripes
      for (let x = 0; x < w; x += 32) {
        ctx.fillStyle = 'rgba(240,220,192,0.35)';
        ctx.fillRect(x + 14, 0, 4, h);
      }
      const motif = (cx: number, cy: number, s: number) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = PALETTE.wallPattern;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        for (let k = 0; k < 4; k++) {
          ctx.rotate(Math.PI / 4);
          ctx.beginPath();
          ctx.moveTo(-s, 0);
          ctx.lineTo(s, 0);
          ctx.stroke();
        }
        ctx.fillStyle = '#f3c9b0';
        ctx.beginPath();
        ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) {
          const cx = i * 64 + (j % 2 ? 32 : 0) + 16;
          const cy = j * 64 + 32;
          if ((i + j) % 2 === 0) motif(cx % w, cy, 6);
          else {
            ctx.fillStyle = '#e9d3b6';
            ctx.beginPath();
            ctx.arc(cx % w, cy, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
    },
    { wrap: true },
  );
}

/** Soft vertical gradient (used as a multiplier for fake ambient occlusion near floor/ceiling). */
export function aoGradientTex(): THREE.Texture {
  return canvasTex(
    'aoGrad',
    4,
    128,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(0,0,0,0.0)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    { srgb: false },
  );
}

// ---------------------------------------------------------------------------------------------
// Floor

/** Warm two-tone checker floor, 2x2 tiles per texture. */
export function floorTex(): THREE.Texture {
  const A = hexRgb(PALETTE.floorA), B = hexRgb(PALETTE.floorB);
  return canvasTex(
    'floor',
    512,
    512,
    (ctx, w, h) => {
      const tile = w / 2;
      paintPixels(ctx, w, h, (x, y) => {
        const i = Math.floor(x / tile), j = Math.floor(y / tile);
        const lx = x - i * tile, ly = y - j * tile;
        const e = Math.min(lx, ly, tile - 1 - lx, tile - 1 - ly);
        const c = (i + j) % 2 ? A : B;
        const mott = fbm2(x / 64, y / 64, 3, 8, 8) * 0.05 + noise2(x / 3, y / 3, w / 3, h / 3) * 0.012;
        const bev = smooth(0, 6, e);
        let k = 1 + mott - (1 - bev) * 0.12;
        if (e < 1.5) k *= 0.82;
        return [clamp255(c[0] * k), clamp255(c[1] * k), clamp255(c[2] * k)];
      });
    },
    { wrap: true, aniso: 8 },
  );
}

// ---------------------------------------------------------------------------------------------
// Fabric & rugs

export function ginghamTex(color: string, key = color): THREE.Texture {
  const c = hexRgb(color);
  return canvasTex(
    'gingham:' + key,
    128,
    128,
    (ctx, w, h) => {
      const n = 4, cell = w / n;
      paintPixels(ctx, w, h, (x, y) => {
        const a = Math.floor(x / (cell / 2)) % 2 === 0 ? 1 : 0;
        const b = Math.floor(y / (cell / 2)) % 2 === 0 ? 1 : 0;
        const t = (a + b) * 0.42;
        const weave = ((x + y) % 3 === 0 ? -6 : 0) + (noise2(x * 0.5, y * 0.5, 64, 64) * 4);
        return [lerp(255, c[0], t) + weave, lerp(252, c[1], t) + weave, lerp(246, c[2], t) + weave];
      });
    },
    { wrap: true },
  );
}

/** Round braided rug in pastel rings. */
export function rugTex(): THREE.Texture {
  const cols = [PALETTE.coral, PALETTE.cream, PALETTE.cabinet, PALETTE.cream, PALETTE.butter, PALETTE.cream, PALETTE.coral, '#f6c9b8', PALETTE.cabinet];
  return canvasTex(
    'rug',
    512,
    512,
    (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      paintPixels(ctx, w, h, (x, y) => {
        const dx = x - cx, dy = y - cy;
        const d = Math.hypot(dx, dy) / (w / 2);
        const a = Math.atan2(dy, dx);
        const ringF = d * cols.length;
        const ri = Math.min(cols.length - 1, Math.floor(ringF));
        const lr = ringF - ri;
        const c = hexRgb(cols[cols.length - 1 - ri]);
        // braid: diagonal ridges along each ring
        const braid = Math.sin(a * 90 + lr * 6.0 + (ri % 2) * 2) * 0.5 + 0.5;
        const edge = Math.min(lr, 1 - lr);
        const k = 0.9 + braid * 0.12 - (1 - smooth(0, 0.18, edge)) * 0.15;
        return [clamp255(c[0] * k), clamp255(c[1] * k), clamp255(c[2] * k), d > 1 ? 0 : 255];
      });
    },
    {},
  );
}

/** Retro boomerang laminate for the diner table top. */
export function laminateTex(): THREE.Texture {
  return canvasTex(
    'laminate',
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#fff3d6';
      ctx.fillRect(0, 0, w, h);
      const r = new Rand(9);
      const cols = ['#ffb3a3', '#9fdccd', '#ffd978', '#c9b8f5', '#a9d8f2'];
      for (let i = 0; i < 70; i++) {
        const x = r.range(0, w), y = r.range(0, h), s = r.range(10, 18), rot = r.range(0, Math.PI * 2);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.fillStyle = r.pick(cols);
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(-s, -s * 0.2);
        ctx.quadraticCurveTo(0, -s * 0.9, s, -s * 0.2);
        ctx.quadraticCurveTo(s * 0.9, s * 0.25, s * 0.55, s * 0.05);
        ctx.quadraticCurveTo(0, -s * 0.4, -s * 0.55, s * 0.05);
        ctx.quadraticCurveTo(-s * 0.9, s * 0.25, -s, -s * 0.2);
        ctx.fill();
        ctx.restore();
      }
      for (let i = 0; i < 140; i++) {
        const x = r.range(0, w), y = r.range(0, h);
        ctx.fillStyle = r.next() < 0.5 ? '#e8b866' : '#d9c8a8';
        ctx.globalAlpha = 0.8;
        const s = r.range(1.5, 3);
        ctx.fillRect(x - s, y - 0.6, s * 2, 1.2);
        ctx.fillRect(x - 0.6, y - s, 1.2, s * 2);
      }
      ctx.globalAlpha = 1;
    },
    { wrap: true },
  );
}

// ---------------------------------------------------------------------------------------------
// Enamel / cookware surfaces

/** Speckled surface (granite-ware, non-stick interiors). */
export function speckleTex(key: string, base: string, speck: string, density = 900, size: [number, number] = [0.6, 1.6]): THREE.Texture {
  return canvasTex(
    'speckle:' + key,
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      const r = new Rand(density);
      for (let i = 0; i < density; i++) {
        ctx.fillStyle = r.next() < 0.7 ? speck : shade(base, 0.25);
        ctx.globalAlpha = r.range(0.35, 0.9);
        ctx.beginPath();
        ctx.arc(r.range(0, w), r.range(0, h), r.range(size[0], size[1]), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    { wrap: true },
  );
}

/** Polka dots (vintage enamelware). */
export function polkaTex(key: string, base: string, dot: string, n = 6, rad = 0.18): THREE.Texture {
  return canvasTex(
    'polka:' + key,
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = dot;
      const cw = w / n, chh = h / (n / 2);
      for (let j = 0; j < n / 2 + 1; j++)
        for (let i = 0; i < n + 1; i++) {
          const x = i * cw + (j % 2 ? cw / 2 : 0);
          const y = j * chh;
          ctx.beginPath();
          ctx.ellipse(x % (w + 1), y, cw * rad, chh * rad * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
    },
    { wrap: true },
  );
}

/** Soft radial white glow (for halos, flames, hot spots). */
export function radialTex(key = 'radial', inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,0.35)'): THREE.Texture {
  return canvasTex(
    'radial:' + key,
    128,
    128,
    (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, inner);
      g.addColorStop(0.45, mid);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    {},
  );
}

/** Hot ring for burners: transparent centre, glowing ring. */
export function hotRingTex(): THREE.Texture {
  return canvasTex(
    'hotring',
    128,
    128,
    (ctx, w, h) => {
      paintPixels(ctx, w, h, (x, y) => {
        const d = Math.hypot(x - w / 2, y - h / 2) / (w / 2);
        const ring = Math.exp(-Math.pow((d - 0.62) / 0.2, 2)) + Math.exp(-Math.pow((d - 0.3) / 0.12, 2)) * 0.6;
        const a = Math.min(1, ring) * (d < 1 ? 1 : 0);
        return [255, 255, 255, a * 255];
      });
    },
    {},
  );
}

// ---------------------------------------------------------------------------------------------
// Outside: sky, hills, trees, clouds

export function skyTex(): THREE.Texture {
  return canvasTex(
    'sky',
    512,
    512,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#7fc6f0');
      g.addColorStop(0.45, '#b9e3fb');
      g.addColorStop(0.62, '#e7f5fb');
      g.addColorStop(0.7, '#fff3dc');
      g.addColorStop(1, '#fff3dc');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // sun glow (top left)
      const sg = ctx.createRadialGradient(w * 0.18, h * 0.2, 0, w * 0.18, h * 0.2, w * 0.35);
      sg.addColorStop(0, 'rgba(255,248,220,0.9)');
      sg.addColorStop(0.2, 'rgba(255,240,200,0.45)');
      sg.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fffbe9';
      ctx.beginPath();
      ctx.arc(w * 0.18, h * 0.2, w * 0.045, 0, Math.PI * 2);
      ctx.fill();
      const hill = (base: number, amp: number, freq: number, phase: number, col: string, shadeCol: string) => {
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 4) {
          const y = base - Math.sin(x * freq + phase) * amp - Math.sin(x * freq * 2.3 + phase * 1.7) * amp * 0.35;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        const gg = ctx.createLinearGradient(0, base - amp, 0, h);
        gg.addColorStop(0, col);
        gg.addColorStop(1, shadeCol);
        ctx.fillStyle = gg;
        ctx.fill();
      };
      hill(h * 0.64, h * 0.05, 0.012, 0.5, '#bfe3c0', '#a9d6ab');
      // distant trees on the far hill
      const r = new Rand(5);
      for (let i = 0; i < 9; i++) {
        const x = r.range(0, w), y = h * 0.62 - r.range(0, 10);
        ctx.fillStyle = '#9fd09a';
        ctx.beginPath();
        ctx.arc(x, y, r.range(7, 12), 0, Math.PI * 2);
        ctx.fill();
      }
      hill(h * 0.74, h * 0.05, 0.009, 2.2, '#9ed883', '#86c96f');
      hill(h * 0.86, h * 0.04, 0.007, 4.1, '#7fcb6a', '#6cbb5b');
      // a little picket fence
      ctx.fillStyle = '#fffaf0';
      for (let x = -4; x < w; x += 16) {
        const y0 = h * 0.88;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x + 5, y0 - 6);
        ctx.lineTo(x + 10, y0);
        ctx.lineTo(x + 10, y0 + 36);
        ctx.lineTo(x, y0 + 36);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillRect(0, h * 0.9, w, 4);
      ctx.fillRect(0, h * 0.95, w, 4);
      ctx.fillStyle = '#69b65a';
      ctx.fillRect(0, h * 0.97, w, h * 0.03);
    },
    {},
  );
}

/** A stylised round tree for outside the window (alpha). */
export function treeTex(): THREE.Texture {
  return canvasTex(
    'tree',
    256,
    256,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      // trunk
      ctx.fillStyle = '#b07a4a';
      roundRectPath(ctx, w * 0.46, h * 0.55, w * 0.08, h * 0.45, 6);
      ctx.fill();
      const blob = (x: number, y: number, r: number, c: string) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      };
      const dark = '#5fb35a', mid = '#77c66a', light = '#93d77f';
      blob(w * 0.5, h * 0.4, w * 0.3, dark);
      blob(w * 0.33, h * 0.48, w * 0.18, dark);
      blob(w * 0.68, h * 0.46, w * 0.19, dark);
      blob(w * 0.47, h * 0.36, w * 0.26, mid);
      blob(w * 0.36, h * 0.3, w * 0.13, light);
      blob(w * 0.56, h * 0.25, w * 0.1, light);
      // fruit dots
      const r = new Rand(3);
      for (let i = 0; i < 9; i++) blob(w * r.range(0.3, 0.7), h * r.range(0.2, 0.55), 5, '#ff8a74');
    },
    {},
  );
}

export function cloudTex(seed = 1): THREE.Texture {
  return canvasTex(
    'cloud:' + seed,
    256,
    128,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const r = new Rand(seed * 17);
      const puffs: [number, number, number][] = [];
      for (let i = 0; i < 7; i++) puffs.push([r.range(0.22, 0.78) * w, r.range(0.48, 0.66) * h, r.range(0.14, 0.24) * h * (1.4 - Math.abs(i - 3) * 0.12)]);
      for (const [x, y, s] of puffs) {
        const g = ctx.createRadialGradient(x, y - s * 0.2, 0, x, y, s * 1.25);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.7, 'rgba(255,255,255,0.95)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, s * 1.25, 0, Math.PI * 2);
        ctx.fill();
      }
      // flat-ish bottom with a slight blue shade
      const g2 = ctx.createLinearGradient(0, h * 0.55, 0, h * 0.9);
      g2.addColorStop(0, 'rgba(200,225,245,0)');
      g2.addColorStop(1, 'rgba(200,225,245,0.5)');
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fillRect(0, h * 0.82, w, h);
      ctx.globalCompositeOperation = 'source-over';
    },
    {},
  );
}

// ---------------------------------------------------------------------------------------------
// Little printed things

/** A cute framed poster: fruit illustration (original art, drawn procedurally). */
export function posterTex(kind: 'fruit' | 'cake'): THREE.Texture {
  return canvasTex(
    'poster:' + kind,
    256,
    320,
    (ctx, w, h) => {
      ctx.fillStyle = kind === 'fruit' ? '#fff1d9' : '#e8f6f1';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = kind === 'fruit' ? '#ff8a74' : '#6cbfac';
      ctx.lineWidth = 6;
      roundRectPath(ctx, 14, 14, w - 28, h - 28, 14);
      ctx.stroke();
      if (kind === 'fruit') {
        // a smiling pear & cherry duo
        ctx.fillStyle = '#b8de6a';
        ctx.beginPath();
        ctx.ellipse(w * 0.4, h * 0.56, 52, 62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(w * 0.4, h * 0.38, 32, 38, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8a5a3a';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(w * 0.4, h * 0.26);
        ctx.quadraticCurveTo(w * 0.42, h * 0.2, w * 0.47, h * 0.18);
        ctx.stroke();
        ctx.fillStyle = '#6cc36a';
        ctx.beginPath();
        ctx.ellipse(w * 0.5, h * 0.2, 16, 8, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8434f';
        for (const [x, y] of [[0.7, 0.66], [0.8, 0.62]]) {
          ctx.beginPath();
          ctx.arc(w * x, h * y, 20, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = '#6a8a3a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(w * 0.7, h * 0.6);
        ctx.quadraticCurveTo(w * 0.74, h * 0.46, w * 0.78, h * 0.44);
        ctx.quadraticCurveTo(w * 0.79, h * 0.5, w * 0.8, h * 0.56);
        ctx.stroke();
        // faces
        ctx.fillStyle = '#3d2c2a';
        for (const [x, y] of [[0.36, 0.53], [0.45, 0.53]]) {
          ctx.beginPath();
          ctx.arc(w * x, h * y, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = '#3d2c2a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(w * 0.405, h * 0.565, 9, 0.2, Math.PI - 0.2);
        ctx.stroke();
        ctx.fillStyle = '#ff9c8c';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(w * 0.31, h * 0.57, 7, 0, Math.PI * 2);
        ctx.arc(w * 0.5, h * 0.57, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        // a layered cake with a cherry
        const cx = w / 2;
        ctx.fillStyle = '#f7c6d0';
        roundRectPath(ctx, cx - 70, h * 0.5, 140, 70, 14);
        ctx.fill();
        ctx.fillStyle = '#fff7ea';
        roundRectPath(ctx, cx - 70, h * 0.47, 140, 22, 11);
        ctx.fill();
        ctx.fillStyle = '#c98e5a';
        ctx.fillRect(cx - 70, h * 0.6, 140, 8);
        ctx.fillStyle = '#e8434f';
        ctx.beginPath();
        ctx.arc(cx, h * 0.44, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd978';
        ctx.fillRect(cx - 90, h * 0.72, 180, 10);
      }
      ctx.fillStyle = '#3d2c2a';
      ctx.font = `bold 26px 'Baloo 2', 'Fredoka', 'Trebuchet MS', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(kind === 'fruit' ? 'Fresh & Fruity' : 'Sweet Treats', w / 2, h * 0.88);
    },
    {},
  );
}

/** Kid's crayon drawing for the fridge door (Mochi!). */
export function drawingTex(): THREE.Texture {
  return canvasTex(
    'drawing',
    256,
    200,
    (ctx, w, h) => {
      ctx.fillStyle = '#fffdf6';
      ctx.fillRect(0, 0, w, h);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // sun
      ctx.strokeStyle = '#ffc93c';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(w * 0.82, h * 0.2, 18, 0, Math.PI * 2);
      ctx.stroke();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.82 + Math.cos(a) * 26, h * 0.2 + Math.sin(a) * 26);
        ctx.lineTo(w * 0.82 + Math.cos(a) * 36, h * 0.2 + Math.sin(a) * 36);
        ctx.stroke();
      }
      // fuzzy lilac creature
      ctx.fillStyle = PALETTE.lilac;
      ctx.beginPath();
      ctx.ellipse(w * 0.4, h * 0.6, 54, 50, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8f78d8';
      ctx.lineWidth = 4;
      for (let k = 0; k < 26; k++) {
        const a = (k / 26) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.4 + Math.cos(a) * 50, h * 0.6 + Math.sin(a) * 46);
        ctx.lineTo(w * 0.4 + Math.cos(a) * 60, h * 0.6 + Math.sin(a) * 56);
        ctx.stroke();
      }
      ctx.fillStyle = '#3d2c2a';
      ctx.beginPath();
      ctx.arc(w * 0.34, h * 0.55, 6, 0, Math.PI * 2);
      ctx.arc(w * 0.46, h * 0.55, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3d2c2a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(w * 0.4, h * 0.63, 14, 0.15, Math.PI - 0.15);
      ctx.stroke();
      // grass
      ctx.strokeStyle = '#6cc36a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let x = 10; x < w - 10; x += 12) {
        ctx.moveTo(x, h - 10);
        ctx.lineTo(x + 5, h - 26);
      }
      ctx.stroke();
      // heart
      ctx.fillStyle = '#ff6f8f';
      ctx.beginPath();
      const hx = w * 0.78, hy = h * 0.62;
      ctx.moveTo(hx, hy + 14);
      ctx.bezierCurveTo(hx - 26, hy - 4, hx - 10, hy - 22, hx, hy - 8);
      ctx.bezierCurveTo(hx + 10, hy - 22, hx + 26, hy - 4, hx, hy + 14);
      ctx.fill();
    },
    {},
  );
}

export { mixHex, shade };
