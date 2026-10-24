// Procedurally generated canvas textures (no external assets).

import * as THREE from 'three';
import { Rng, valueNoise2, fbm2 } from '../sim/math.ts';

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, opts: { repeat?: [number, number]; srgb?: boolean; aniso?: number } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = opts.aniso ?? 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function cached<T extends THREE.Texture>(key: string, make: () => T): T {
  let t = cache.get(key) as T | undefined;
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** Fill an image with per-pixel noise using a color function. */
function noiseFill(ctx: CanvasRenderingContext2D, w: number, h: number, fn: (x: number, y: number) => [number, number, number]): void {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * w + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Tileable value noise sample (period p). */
function tnoise(x: number, y: number, p: number, seed: number): number {
  // blend 4 samples for seamless tiling
  const fx = x / p, fy = y / p;
  const a = valueNoise2(x, y, seed), b = valueNoise2(x - p, y, seed);
  const c = valueNoise2(x, y - p, seed), d = valueNoise2(x - p, y - p, seed);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

function tfbm(x: number, y: number, p: number, oct: number, seed: number): number {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) {
    s += amp * tnoise(x * f, y * f, p * f, seed + o * 7);
    n += amp;
    amp *= 0.5;
    f *= 2;
  }
  return s / n;
}

export function asphaltTexture(): THREE.Texture {
  return cached('asphalt', () => {
    const S = 512;
    const [c, ctx] = canvas(S, S);
    const rng = new Rng(7);
    noiseFill(ctx, S, S, (x, y) => {
      const n = tfbm(x / 8, y / 8, S / 8, 4, 3) * 0.5 + 0.5;
      const grain = rng.next();
      const v = 52 + n * 26 + (grain > 0.93 ? 30 * rng.next() : grain * 10);
      return [v, v, v * 1.02];
    });
    return tex(c, { repeat: [1, 1] });
  });
}

export function asphaltRoughness(): THREE.Texture {
  return cached('asphaltR', () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    noiseFill(ctx, S, S, (x, y) => {
      const n = tfbm(x / 6, y / 6, S / 6, 3, 9) * 0.5 + 0.5;
      const v = 190 + n * 60;
      return [v, v, v];
    });
    return tex(c, { srgb: false });
  });
}

export function concreteTexture(): THREE.Texture {
  return cached('concrete', () => {
    const S = 512;
    const [c, ctx] = canvas(S, S);
    const rng = new Rng(11);
    noiseFill(ctx, S, S, (x, y) => {
      const n = tfbm(x / 32, y / 32, S / 32, 5, 5) * 0.5 + 0.5;
      const v = 150 + n * 45 + (rng.next() - 0.5) * 14;
      return [v, v * 0.99, v * 0.96];
    });
    // panel seams
    ctx.strokeStyle = 'rgba(60,60,60,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, S - 2, S - 2);
    return tex(c);
  });
}

export function grassTexture(): THREE.Texture {
  return cached('grass', () => {
    const S = 512;
    const [c, ctx] = canvas(S, S);
    const rng = new Rng(21);
    noiseFill(ctx, S, S, (x, y) => {
      const n = tfbm(x / 24, y / 24, S / 24, 5, 13) * 0.5 + 0.5;
      const m = tfbm(x / 6, y / 6, S / 6, 3, 17) * 0.5 + 0.5;
      const b = rng.next() * 0.25;
      const r = 62 + n * 40 + m * 15;
      const g = 88 + n * 48 + m * 22 - b * 30;
      const bl = 38 + n * 18;
      return [r, g, bl];
    });
    // blades
    for (let i = 0; i < 9000; i++) {
      const x = rng.next() * S, y = rng.next() * S;
      const l = 3 + rng.next() * 5;
      const g = 90 + rng.next() * 80;
      ctx.strokeStyle = `rgba(${60 + rng.next() * 40},${g},${30 + rng.next() * 20},0.55)`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng.next() - 0.5) * 2, y - l);
      ctx.stroke();
    }
    return tex(c);
  });
}

export function dirtTexture(): THREE.Texture {
  return cached('dirt', () => {
    const S = 512;
    const [c, ctx] = canvas(S, S);
    const rng = new Rng(31);
    noiseFill(ctx, S, S, (x, y) => {
      const n = tfbm(x / 20, y / 20, S / 20, 5, 23) * 0.5 + 0.5;
      const pebble = rng.next() > 0.985 ? 35 : 0;
      const r = 118 + n * 45 + pebble;
      const g = 92 + n * 36 + pebble;
      const b = 66 + n * 26 + pebble;
      return [r, g, b];
    });
    return tex(c);
  });
}

export function sandTexture(): THREE.Texture {
  return cached('sand', () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    const rng = new Rng(41);
    noiseFill(ctx, S, S, (x, y) => {
      const n = tfbm(x / 16, y / 16, S / 16, 4, 29) * 0.5 + 0.5;
      const g = rng.next() * 18;
      return [196 + n * 30 + g, 176 + n * 26 + g, 128 + n * 20 + g];
    });
    return tex(c);
  });
}

export function rockTexture(): THREE.Texture {
  return cached('rock', () => {
    const S = 512;
    const [c, ctx] = canvas(S, S);
    noiseFill(ctx, S, S, (x, y) => {
      const n = tfbm(x / 40, y / 40, S / 40, 6, 37) * 0.5 + 0.5;
      const cr = Math.abs(tnoise(x / 9, y / 22, S / 9, 41));
      const v = 92 + n * 70 - (cr < 0.05 ? 40 : 0);
      return [v * 1.02, v, v * 0.95];
    });
    return tex(c);
  });
}

export function metalPlateTexture(): THREE.Texture {
  return cached('metalPlate', () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    noiseFill(ctx, S, S, (x, y) => {
      const n = tfbm(x / 12, y / 12, S / 12, 4, 51) * 0.5 + 0.5;
      const v = 120 + n * 40;
      return [v, v * 1.01, v * 1.03];
    });
    // diamond plate pattern
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let y = 0; y < S; y += 16) {
      for (let x = (y / 16) % 2 ? 8 : 0; x < S; x += 16) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-1.5, -5, 3, 10);
        ctx.restore();
      }
    }
    return tex(c);
  });
}

export function rustTexture(): THREE.Texture {
  return cached('rust', () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    noiseFill(ctx, S, S, (x, y) => {
      const n = tfbm(x / 14, y / 14, S / 14, 5, 61) * 0.5 + 0.5;
      const m = tfbm(x / 40, y / 40, S / 40, 3, 67) * 0.5 + 0.5;
      const rust = Math.min(1, Math.max(0, (m - 0.45) * 3));
      const r = 90 + n * 40 + rust * 80, g = 85 + n * 30 + rust * 10, b = 82 + n * 25 - rust * 30;
      return [r, g, b];
    });
    return tex(c);
  });
}

export function hazardStripeTexture(): THREE.Texture {
  return cached('hazard', () => {
    const [c, ctx] = canvas(256, 64);
    ctx.fillStyle = '#e8b400';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#111';
    for (let x = -64; x < 320; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 64);
      ctx.lineTo(x + 32, 64);
      ctx.lineTo(x + 64, 0);
      ctx.lineTo(x + 32, 0);
      ctx.closePath();
      ctx.fill();
    }
    return tex(c);
  });
}

export function checkerTexture(): THREE.Texture {
  return cached('checker', () => {
    const [c, ctx] = canvas(128, 128);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#eee';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
    return tex(c);
  });
}

export function grilleTexture(): THREE.Texture {
  return cached('grille', () => {
    const [c, ctx] = canvas(128, 128);
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, 128, 128);
    // honeycomb
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 3;
    const r = 8;
    for (let row = -1; row < 12; row++) {
      for (let col = -1; col < 10; col++) {
        const x = col * r * 1.75 + (row % 2 ? r * 0.875 : 0);
        const y = row * r * 1.5;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    return tex(c, { repeat: [3, 1] });
  });
}

export function plateTexture(text: string): THREE.Texture {
  return cached('plate:' + text, () => {
    const [c, ctx] = canvas(256, 64);
    ctx.fillStyle = '#f1f1ea';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#1b3b8c';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 250, 58);
    ctx.fillStyle = '#1b3b8c';
    ctx.fillRect(3, 3, 22, 58);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 140, 34);
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

export function headlightTexture(): THREE.Texture {
  return cached('headlight', () => {
    const [c, ctx] = canvas(256, 128);
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#d8dde2');
    g.addColorStop(1, '#9aa3ab');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 128);
    // projector lenses
    for (const [x, r] of [[70, 34], [170, 30]] as [number, number][]) {
      const rg = ctx.createRadialGradient(x, 64, 2, x, 64, r);
      rg.addColorStop(0, '#ffffff');
      rg.addColorStop(0.4, '#e9f1ff');
      rg.addColorStop(1, '#5c6670');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, 64, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // LED strip
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(12, 108, 232, 7);
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

export function taillightTexture(): THREE.Texture {
  return cached('taillight', () => {
    const [c, ctx] = canvas(256, 128);
    ctx.fillStyle = '#5a0000';
    ctx.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#c8100a' : '#ff2a1a';
      ctx.fillRect(10, 12 + i * 26, 236, 14);
    }
    ctx.fillStyle = '#e9e9e9';
    ctx.fillRect(180, 40, 56, 40);
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

export function crackedGlassTexture(): THREE.Texture {
  return cached('cracked', () => {
    const S = 512;
    const [c, ctx] = canvas(S, S);
    ctx.clearRect(0, 0, S, S);
    const rng = new Rng(77);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    for (let k = 0; k < 3; k++) {
      const cx = S * (0.25 + rng.next() * 0.5), cy = S * (0.25 + rng.next() * 0.5);
      const rays = 14 + Math.floor(rng.next() * 8);
      for (let r = 0; r < rays; r++) {
        let a = (r / rays) * Math.PI * 2 + rng.next() * 0.3;
        let x = cx, y = cy;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const len = S * (0.2 + rng.next() * 0.45);
        for (let s = 0; s < 10; s++) {
          a += (rng.next() - 0.5) * 0.4;
          x += Math.cos(a) * len / 10;
          y += Math.sin(a) * len / 10;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      for (let ring = 1; ring < 5; ring++) {
        ctx.lineWidth = 1;
        ctx.beginPath();
        const rr = ring * S * 0.05 * (1 + rng.next() * 0.3);
        for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.3) {
          const j = 1 + (rng.next() - 0.5) * 0.25;
          const px = cx + Math.cos(a) * rr * j, py = cy + Math.sin(a) * rr * j;
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

export function tireTreadTexture(): THREE.Texture {
  return cached('tread', () => {
    const [c, ctx] = canvas(64, 512);
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(0, 0, 64, 512);
    ctx.fillStyle = '#0c0c0c';
    for (let y = 0; y < 512; y += 16) {
      ctx.fillRect(14, y, 5, 10);
      ctx.fillRect(45, y + 8, 5, 10);
      ctx.save();
      ctx.translate(32, y + 4);
      ctx.rotate(0.5);
      ctx.fillRect(-10, -1.5, 20, 3);
      ctx.restore();
    }
    ctx.fillRect(30, 0, 4, 512);
    return tex(c, { srgb: true });
  });
}

export function sidewallTexture(): THREE.Texture {
  return cached('sidewall', () => {
    const [c, ctx] = canvas(512, 64);
    ctx.fillStyle = '#202020';
    ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = '#2c2c2c';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('WRECKFIELD  RADIAL  225/45 R17', 20, 40);
    return tex(c);
  });
}

export function brakeDiscTexture(): THREE.Texture {
  return cached('disc', () => {
    const [c, ctx] = canvas(256, 256);
    const g = ctx.createRadialGradient(128, 128, 30, 128, 128, 128);
    g.addColorStop(0, '#444');
    g.addColorStop(0.45, '#777');
    g.addColorStop(1, '#8a8a8a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(40,40,40,0.8)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * 70, 128 + Math.sin(a) * 70);
      ctx.lineTo(128 + Math.cos(a + 0.4) * 120, 128 + Math.sin(a + 0.4) * 120);
      ctx.stroke();
    }
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

export function smokeSpriteTexture(): THREE.Texture {
  return cached('smoke', () => {
    const S = 128;
    const [c, ctx] = canvas(S, S);
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
        const r = Math.sqrt(dx * dx + dy * dy);
        const n = fbm2(x / 18, y / 18, 4, 91) * 0.5 + 0.5;
        const a = Math.max(0, 1 - r) ** 1.6 * (0.55 + n * 0.6);
        const i = (y * S + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.min(255, a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

export function sparkSpriteTexture(): THREE.Texture {
  return cached('spark', () => {
    const S = 64;
    const [c, ctx] = canvas(S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,230,160,0.9)');
    g.addColorStop(0.6, 'rgba(255,140,40,0.3)');
    g.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

export function fireSpriteTexture(): THREE.Texture {
  return cached('fire', () => {
    const S = 128;
    const [c, ctx] = canvas(S, S);
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
        const r = Math.sqrt(dx * dx * 1.4 + dy * dy);
        const n = fbm2(x / 14, y / 14, 4, 93) * 0.5 + 0.5;
        const a = Math.max(0, 1 - r) ** 1.3 * (0.6 + n * 0.6);
        const i = (y * S + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 120 + 120 * (1 - r);
        img.data[i + 2] = 40 * (1 - r);
        img.data[i + 3] = Math.min(255, a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

export function roadMarkingsTexture(lanes: number): THREE.Texture {
  return cached('road' + lanes, () => {
    const W = 256, H = 512;
    const [c, ctx] = canvas(W, H);
    const base = asphaltTexture().image as HTMLCanvasElement;
    ctx.drawImage(base, 0, 0, W, H);
    // edge lines
    ctx.fillStyle = '#e8e8e0';
    ctx.fillRect(8, 0, 6, H);
    ctx.fillRect(W - 14, 0, 6, H);
    // center dashed (yellow double for 2+ lanes)
    if (lanes >= 2) {
      ctx.fillStyle = '#e0b000';
      ctx.fillRect(W / 2 - 7, 0, 4, H);
      ctx.fillRect(W / 2 + 3, 0, 4, H);
    } else {
      ctx.fillStyle = '#e8e8e0';
      for (let y = 0; y < H; y += 128) ctx.fillRect(W / 2 - 3, y, 6, 64);
    }
    if (lanes >= 4) {
      ctx.fillStyle = '#e8e8e0';
      for (let y = 0; y < H; y += 128) {
        ctx.fillRect(W / 4 - 2, y, 4, 64);
        ctx.fillRect((3 * W) / 4 - 2, y, 4, 64);
      }
    }
    const t = tex(c);
    t.wrapS = THREE.ClampToEdgeWrapping;
    return t;
  });
}

export function corrugatedTexture(color = '#8c96a0'): THREE.Texture {
  return cached('corr' + color, () => {
    const [c, ctx] = canvas(128, 128);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 8) {
      const g = ctx.createLinearGradient(x, 0, x + 8, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.25)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.15)');
      g.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 8, 128);
    }
    return tex(c);
  });
}

export function brickTexture(): THREE.Texture {
  return cached('brick', () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#9a9288';
    ctx.fillRect(0, 0, 256, 256);
    const rng = new Rng(5);
    for (let row = 0; row < 16; row++) {
      for (let col = -1; col < 5; col++) {
        const x = col * 64 + (row % 2 ? 32 : 0), y = row * 16;
        const v = 120 + rng.next() * 50;
        ctx.fillStyle = `rgb(${v + 40},${v * 0.55},${v * 0.42})`;
        ctx.fillRect(x + 2, y + 2, 60, 12);
      }
    }
    return tex(c);
  });
}

export function windowGridTexture(): THREE.Texture {
  return cached('wingrid', () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#5d646b';
    ctx.fillRect(0, 0, 256, 256);
    const rng = new Rng(3);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const l = rng.next();
      ctx.fillStyle = l > 0.75 ? '#d9c98a' : `rgb(${30 + l * 40},${45 + l * 40},${60 + l * 50})`;
      ctx.fillRect(x * 64 + 10, y * 64 + 12, 44, 40);
    }
    return tex(c);
  });
}

export function treeBarkTexture(): THREE.Texture {
  return cached('bark', () => {
    const [c, ctx] = canvas(128, 256);
    noiseFill(ctx, 128, 256, (x, y) => {
      const n = tnoise(x / 6, y / 40, 128 / 6, 101) * 0.5 + 0.5;
      const v = 60 + n * 50;
      return [v, v * 0.78, v * 0.55];
    });
    return tex(c);
  });
}

export function foliageTexture(): THREE.Texture {
  return cached('foliage', () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    const rng = new Rng(55);
    ctx.fillStyle = '#2e4a1f';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 2500; i++) {
      const x = rng.next() * S, y = rng.next() * S;
      const g = 70 + rng.next() * 90;
      ctx.fillStyle = `rgba(${30 + rng.next() * 40},${g},${20 + rng.next() * 30},0.8)`;
      ctx.beginPath();
      ctx.ellipse(x, y, 3 + rng.next() * 4, 2 + rng.next() * 2, rng.next() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    return tex(c);
  });
}

export function cloudTexture(): THREE.Texture {
  return cached('clouds', () => {
    const S = 512;
    const [c, ctx] = canvas(S, S);
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const n = tfbm(x / 64, y / 64, S / 64, 6, 131) * 0.5 + 0.5;
        const a = Math.max(0, n - 0.5) * 2.4;
        const i = (y * S + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.min(255, a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return tex(c);
  });
}

/** Random plate text */
export function randomPlate(seed: number): string {
  const r = new Rng(seed);
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  return `${L[r.int(0, L.length - 1)]}${L[r.int(0, L.length - 1)]}${r.int(0, 9)}-${r.int(100, 999)}`;
}
