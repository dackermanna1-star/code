import * as THREE from 'three';
import { RNG } from '../core/math';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!] as const;
}
function toTex(c: HTMLCanvasElement, repeat = true, aniso = 4) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Tileable value-noise layer drawn into a canvas. */
function noiseLayer(ctx: CanvasRenderingContext2D, w: number, h: number, rng: RNG, cells: number, color: string, alpha: number) {
  const grid: number[] = [];
  for (let i = 0; i < cells * cells; i++) grid.push(rng.next());
  const img = ctx.getImageData(0, 0, w, h);
  const col = new THREE.Color(color);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * cells, fy = (y / h) * cells;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const g = (a: number, b: number) => grid[((b % cells) + cells) % cells * cells + ((a % cells) + cells) % cells];
      const v = (g(ix, iy) * (1 - sx) + g(ix + 1, iy) * sx) * (1 - sy) + (g(ix, iy + 1) * (1 - sx) + g(ix + 1, iy + 1) * sx) * sy;
      const a = v * alpha;
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i] * (1 - a) + col.r * 255 * a;
      img.data[i + 1] = img.data[i + 1] * (1 - a) + col.g * 255 * a;
      img.data[i + 2] = img.data[i + 2] * (1 - a) + col.b * 255 * a;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, rng: RNG, n: number, colors: string[], size: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = alpha * (0.4 + rng.next() * 0.6);
    const s = size * (0.5 + rng.next());
    ctx.fillRect(rng.next() * w, rng.next() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

export function concreteTexture(seed = 1): THREE.CanvasTexture {
  const S = 1024;
  const [c, ctx] = canvas(S, S);
  const rng = new RNG(seed);
  ctx.fillStyle = '#6c6a66';
  ctx.fillRect(0, 0, S, S);
  noiseLayer(ctx, S, S, rng, 4, '#4a4844', 0.5);
  noiseLayer(ctx, S, S, rng, 12, '#878480', 0.35);
  noiseLayer(ctx, S, S, rng, 32, '#55524e', 0.3);
  speckle(ctx, S, S, rng, 26000, ['#3e3c39', '#8e8b86', '#5a5753'], 2, 0.35);
  // trowel marks
  ctx.globalAlpha = 0.018;
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = rng.chance(0.5) ? '#ffffff' : '#000000';
    ctx.lineWidth = 6 + rng.next() * 20;
    ctx.beginPath();
    const x = rng.next() * S, y = rng.next() * S;
    ctx.arc(x, y, 80 + rng.next() * 200, rng.next() * 6, rng.next() * 6 + 1.2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // cracks
  for (let i = 0; i < 7; i++) {
    let x = rng.next() * S, y = rng.next() * S;
    let a = rng.next() * Math.PI * 2;
    ctx.strokeStyle = '#2a2826';
    ctx.lineWidth = 1.2 + rng.next() * 1.2;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const n = 20 + rng.int(0, 40);
    for (let j = 0; j < n; j++) {
      a += (rng.next() - 0.5) * 0.9;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // expansion joint at tile edge
  ctx.fillStyle = '#2e2c2a';
  ctx.fillRect(0, 0, S, 3);
  ctx.fillRect(0, 0, 3, S);
  return toTex(c);
}

export function brickTexture(seed = 2): THREE.CanvasTexture {
  const W = 1024, H = 1024;
  const [c, ctx] = canvas(W, H);
  const rng = new RNG(seed);
  ctx.fillStyle = '#4a3a32';
  ctx.fillRect(0, 0, W, H);
  const bw = 128, bh = 48;
  for (let row = 0; row < H / bh; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < W / bw + 1; col++) {
      const x = col * bw + off, y = row * bh;
      const base = new THREE.Color().setHSL(0.03 + rng.next() * 0.025, 0.38 + rng.next() * 0.2, 0.22 + rng.next() * 0.1);
      ctx.fillStyle = '#' + base.getHexString();
      ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      // per-brick shading
      const g = ctx.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, 'rgba(255,255,255,0.06)');
      g.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
    }
  }
  speckle(ctx, W, H, rng, 30000, ['#2a1e18', '#6a5448', '#3a2c24'], 2, 0.4);
  noiseLayer(ctx, W, H, rng, 6, '#1e1a18', 0.35);
  return toTex(c);
}

export function metalSidingTexture(seed = 3): THREE.CanvasTexture {
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H);
  const rng = new RNG(seed);
  ctx.fillStyle = '#4b5156';
  ctx.fillRect(0, 0, W, H);
  // corrugation stripes
  for (let x = 0; x < W; x += 32) {
    const g = ctx.createLinearGradient(x, 0, x + 32, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.12)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 32, H);
  }
  // rust streaks
  for (let i = 0; i < 40; i++) {
    const x = rng.next() * W, y = rng.next() * H * 0.6;
    const g = ctx.createLinearGradient(x, y, x, y + 80 + rng.next() * 200);
    g.addColorStop(0, 'rgba(120,60,30,0.55)');
    g.addColorStop(1, 'rgba(120,60,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 3 + rng.next() * 8, 300);
  }
  noiseLayer(ctx, W, H, rng, 8, '#2a2e30', 0.3);
  return toTex(c);
}

export function crateTexture(seed = 4): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const rng = new RNG(seed);
  ctx.fillStyle = '#7a5a36';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 6; i++) {
    const y = (i * S) / 6;
    const base = new THREE.Color().setHSL(0.08 + rng.next() * 0.02, 0.42, 0.28 + rng.next() * 0.08);
    ctx.fillStyle = '#' + base.getHexString();
    ctx.fillRect(0, y + 2, S, S / 6 - 4);
    ctx.strokeStyle = 'rgba(40,24,10,0.35)';
    for (let k = 0; k < 14; k++) {
      ctx.beginPath();
      const yy = y + 4 + rng.next() * (S / 6 - 8);
      ctx.moveTo(0, yy);
      ctx.bezierCurveTo(S * 0.3, yy + rng.next() * 6 - 3, S * 0.6, yy + rng.next() * 6 - 3, S, yy);
      ctx.stroke();
    }
  }
  // frame
  ctx.fillStyle = '#5a3e22';
  ctx.fillRect(0, 0, S, 34);
  ctx.fillRect(0, S - 34, S, 34);
  ctx.fillRect(0, 0, 34, S);
  ctx.fillRect(S - 34, 0, 34, S);
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-S * 0.7, -17, S * 1.4, 34);
  ctx.restore();
  // nails
  ctx.fillStyle = '#2a2a2a';
  for (const [x, y] of [[17, 17], [S - 17, 17], [17, S - 17], [S - 17, S - 17]]) ctx.fillRect(x - 3, y - 3, 6, 6);
  // stencil
  ctx.fillStyle = 'rgba(20,14,8,0.6)';
  ctx.font = 'bold 54px monospace';
  ctx.fillText(rng.pick(['FRAGILE', 'NO 7', 'KX-21', 'EXPORT', 'DOCK 4']), 70, S / 2 + 80);
  speckle(ctx, S, S, rng, 6000, ['#3a2814', '#9a7a50'], 2, 0.3);
  return toTex(c);
}

export function pillarTexture(seed = 5): THREE.CanvasTexture {
  const W = 256, H = 1024;
  const [c, ctx] = canvas(W, H);
  const rng = new RNG(seed);
  ctx.fillStyle = '#76736e';
  ctx.fillRect(0, 0, W, H);
  noiseLayer(ctx, W, H, rng, 8, '#58554f', 0.45);
  speckle(ctx, W, H, rng, 9000, ['#4a4844', '#9a9790'], 2, 0.35);
  // hazard stripes bottom (texture bottom = v0)
  const hb = 150;
  ctx.fillStyle = '#d4a417';
  ctx.fillRect(0, H - hb, W, hb);
  ctx.fillStyle = '#151515';
  for (let i = -4; i < 10; i++) {
    ctx.beginPath();
    const x = i * 60;
    ctx.moveTo(x, H);
    ctx.lineTo(x + 30, H);
    ctx.lineTo(x + 30 + hb, H - hb);
    ctx.lineTo(x + hb, H - hb);
    ctx.fill();
  }
  // grime
  const g = ctx.createLinearGradient(0, H, 0, H - 400);
  g.addColorStop(0, 'rgba(20,16,12,0.45)');
  g.addColorStop(1, 'rgba(20,16,12,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H - 400, W, 400);
  // chips
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = 'rgba(40,38,34,0.6)';
    ctx.fillRect(rng.next() < 0.5 ? 0 : W - 10, rng.next() * H, 10, 4 + rng.next() * 20);
  }
  return toTex(c, false);
}

export function drumTexture(color: string, seed = 6): THREE.CanvasTexture {
  const W = 512, H = 256;
  const [c, ctx] = canvas(W, H);
  const rng = new RNG(seed);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, H * 0.3, W, 8);
  ctx.fillRect(0, H * 0.68, W, 8);
  for (let i = 0; i < 30; i++) {
    const x = rng.next() * W, y = rng.next() * H;
    ctx.fillStyle = 'rgba(110,55,25,0.5)';
    ctx.beginPath();
    ctx.ellipse(x, y, 5 + rng.next() * 20, 3 + rng.next() * 10, rng.next() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  speckle(ctx, W, H, rng, 3000, ['#1a1a1a', '#ffffff'], 2, 0.12);
  return toTex(c);
}

export function graffitiTexture(seed = 7): THREE.CanvasTexture {
  const W = 1024, H = 512;
  const [c, ctx] = canvas(W, H);
  const rng = new RNG(seed);
  ctx.clearRect(0, 0, W, H);
  const words = ['LAST STANCE', 'NO MERCY', 'KX CREW', 'BLOOD DEBT', 'IRON YARD'];
  for (let i = 0; i < 3; i++) {
    const word = words[(seed + i) % words.length];
    ctx.save();
    ctx.translate(80 + rng.next() * 500, 140 + i * 130);
    ctx.rotate((rng.next() - 0.5) * 0.15);
    ctx.font = `bold italic ${70 + rng.int(0, 40)}px Impact, Arial Black, sans-serif`;
    ctx.lineWidth = 10;
    ctx.strokeStyle = rng.pick(['#101010', '#2a0808']);
    ctx.globalAlpha = 0.75;
    ctx.strokeText(word, 0, 0);
    ctx.fillStyle = rng.pick(['#c8301e', '#e0c040', '#30a0c0', '#e8e8e8', '#9a30a0']);
    ctx.fillText(word, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Soft radial sprite for particles/glows. */
export function radialTexture(size = 64, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const [c, ctx] = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}
