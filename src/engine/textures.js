// Procedural low-resolution textures drawn on canvases (PS1-sized: 32-128px).
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map();

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

function toTex(c, opts = {}) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = opts.mip ? THREE.NearestMipmapNearestFilter : THREE.NearestFilter;
  t.generateMipmaps = !!opts.mip;
  t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function rgb(r, g, b) { return `rgb(${r | 0},${g | 0},${b | 0})`; }
function hexToRgb(hex) { return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]; }

// Adds per-pixel noise to the whole canvas.
function noise(ctx, w, h, amt, rnd, mono = true) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amt;
    if (mono) { d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    else { d[i] += (rnd() - 0.5) * amt; d[i + 1] += (rnd() - 0.5) * amt; d[i + 2] += (rnd() - 0.5) * amt; }
  }
  ctx.putImageData(img, 0, 0);
}

// Blotchy low-frequency stains.
function stains(ctx, w, h, count, color, alpha, rnd, maxR = 8) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = alpha * (0.4 + rnd() * 0.6);
    const x = rnd() * w, y = rnd() * h, r = 1 + rnd() * maxR;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.arc(x + (rnd() - 0.5) * r, y + (rnd() - 0.5) * r, r * (0.3 + rnd() * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function pixelText(ctx, text, x, y, size, color, align = 'center', weight = 'bold', font = 'monospace') {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Threshold alpha to remove anti-aliasing (crisp pixel text).
function crisp(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) d[i + 3] = d[i + 3] > 100 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
}

const GEN = {
  concrete(rnd, o) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    const [r, g, b] = hexToRgb(o.color || 0x8a8780);
    ctx.fillStyle = rgb(r, g, b); ctx.fillRect(0, 0, w, h);
    stains(ctx, w, h, 14, '#000', 0.08, rnd, 10);
    stains(ctx, w, h, 8, '#fff', 0.05, rnd, 6);
    noise(ctx, w, h, 22, rnd);
    if (o.cracks !== false) {
      ctx.strokeStyle = 'rgba(30,30,30,0.5)'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); let x = rnd() * w, y = rnd() * h; ctx.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 14; y += (rnd() - 0.5) * 14; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }
    return c;
  },
  asphalt(rnd, o) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    ctx.fillStyle = rgb(58, 58, 60); ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 30, rnd);
    stains(ctx, w, h, 10, '#000', 0.12, rnd, 9);
    if (o.line === 'yellow') { ctx.fillStyle = rgb(200, 170, 50); ctx.fillRect(30, 0, 4, h); noise(ctx, w, h, 10, rnd); }
    if (o.line === 'white') { ctx.fillStyle = rgb(200, 200, 195); ctx.fillRect(30, 0, 3, 40); noise(ctx, w, h, 10, rnd); }
    if (o.line === 'crosswalk') { ctx.fillStyle = rgb(200, 200, 195); for (let i = 0; i < 4; i++) ctx.fillRect(i * 16 + 2, 0, 9, h); noise(ctx, w, h, 14, rnd); }
    return c;
  },
  sidewalk(rnd) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    ctx.fillStyle = rgb(150, 146, 136); ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 18, rnd);
    stains(ctx, w, h, 8, '#000', 0.08, rnd, 6);
    ctx.fillStyle = rgb(100, 98, 92); ctx.fillRect(0, 0, w, 1); ctx.fillRect(0, 0, 1, h);
    ctx.fillRect(0, 32, w, 1); ctx.fillRect(32, 0, 1, h);
    return c;
  },
  brick(rnd, o) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    const base = hexToRgb(o.color || 0x8a3c2c);
    ctx.fillStyle = rgb(110, 105, 95); ctx.fillRect(0, 0, w, h);
    const bh = 8, bw = 16;
    for (let row = 0; row < h / bh; row++) {
      const off = (row % 2) * (bw / 2);
      for (let col = -1; col < w / bw + 1; col++) {
        const v = 0.8 + rnd() * 0.35;
        ctx.fillStyle = rgb(base[0] * v, base[1] * v, base[2] * v);
        ctx.fillRect(col * bw + off + 1, row * bh + 1, bw - 1, bh - 1);
      }
    }
    noise(ctx, w, h, 20, rnd);
    stains(ctx, w, h, 6, '#000', 0.12, rnd, 10);
    return c;
  },
  carpet(rnd, o) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    const base = hexToRgb(o.color || 0x6a1c22); const acc = hexToRgb(o.accent || 0xb08a3a);
    ctx.fillStyle = rgb(...base); ctx.fillRect(0, 0, w, h);
    // diamond pattern
    ctx.fillStyle = rgb(base[0] * 0.7, base[1] * 0.7, base[2] * 0.7);
    for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) {
      ctx.beginPath(); ctx.moveTo(x + 8, y + 1); ctx.lineTo(x + 15, y + 8); ctx.lineTo(x + 8, y + 15); ctx.lineTo(x + 1, y + 8); ctx.fill();
    }
    ctx.fillStyle = rgb(...acc);
    for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { ctx.fillRect(x + 7, y + 7, 2, 2); }
    noise(ctx, w, h, 26, rnd);
    stains(ctx, w, h, 5, '#000', 0.12, rnd, 7);
    return c;
  },
  wallpaper(rnd, o) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    const base = hexToRgb(o.color || 0xc8b48a); const st = hexToRgb(o.stripe || 0xa8925e);
    ctx.fillStyle = rgb(...base); ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgb(...st);
    for (let x = 0; x < w; x += 16) { ctx.fillRect(x, 0, 2, h); ctx.fillRect(x + 5, 0, 1, h); }
    for (let y = 4; y < h; y += 16) for (let x = 10; x < w; x += 16) { ctx.fillRect(x, y, 2, 3); ctx.fillRect(x - 1, y + 1, 4, 1); }
    noise(ctx, w, h, 16, rnd);
    stains(ctx, w, h, 6, 'rgb(60,40,20)', 0.12, rnd, 8);
    return c;
  },
  wainscot(rnd, o) {
    const w = 64, h = 32; const { c, ctx } = mk(w, h);
    const base = hexToRgb(o.color || 0x5a3a22);
    ctx.fillStyle = rgb(...base); ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgb(base[0] * 0.7, base[1] * 0.7, base[2] * 0.7);
    for (let x = 0; x < w; x += 32) { ctx.strokeStyle = ctx.fillStyle; ctx.strokeRect(x + 3.5, 4.5, 25, 22); }
    ctx.fillStyle = rgb(base[0] * 1.2, base[1] * 1.2, base[2] * 1.2); ctx.fillRect(0, 0, w, 2);
    noise(ctx, w, h, 18, rnd);
    return c;
  },
  plaster(rnd, o) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    const base = hexToRgb(o.color || 0xc9c4b8);
    ctx.fillStyle = rgb(...base); ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 12, rnd);
    stains(ctx, w, h, 10, 'rgb(70,60,50)', 0.07, rnd, 10);
    return c;
  },
  ceiling(rnd, o) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    const base = hexToRgb(o.color || 0xbdb8aa);
    ctx.fillStyle = rgb(...base); ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { ctx.fillStyle = `rgba(80,80,70,${0.2 + rnd() * 0.3})`; ctx.fillRect(rnd() * w | 0, rnd() * h | 0, 1, 1); }
    ctx.fillStyle = rgb(base[0] * 0.6, base[1] * 0.6, base[2] * 0.6);
    ctx.fillRect(0, 0, w, 2); ctx.fillRect(0, 0, 2, h);
    ctx.fillRect(0, 32, w, 1); ctx.fillRect(32, 0, 1, h);
    stains(ctx, w, h, 3, 'rgb(110,90,50)', 0.15, rnd, 8);
    return c;
  },
  wood(rnd, o) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    const base = hexToRgb(o.color || 0x6b4528);
    ctx.fillStyle = rgb(...base); ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      const v = 0.85 + Math.sin(y * 0.9 + rnd() * 0.5) * 0.08 + rnd() * 0.05;
      ctx.fillStyle = rgb(base[0] * v, base[1] * v, base[2] * v);
      ctx.fillRect(0, y, w, 1);
    }
    if (o.planks) { ctx.fillStyle = rgb(base[0] * 0.5, base[1] * 0.5, base[2] * 0.5); for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 1); for (let y = 0; y < h; y += 16) ctx.fillRect(((y / 16) * 23) % w, y, 1, 16); }
    noise(ctx, w, h, 14, rnd);
    return c;
  },
  door(rnd, o) {
    const w = 32, h = 64; const { c, ctx } = mk(w, h);
    const base = hexToRgb(o.color || 0x6b4528);
    ctx.fillStyle = rgb(...base); ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = rgb(base[0] * 0.6, base[1] * 0.6, base[2] * 0.6);
    ctx.strokeRect(4.5, 4.5, 23, 24); ctx.strokeRect(4.5, 34.5, 23, 25);
    ctx.fillStyle = rgb(190, 160, 70); ctx.fillRect(25, 32, 3, 2);
    if (o.number) { pixelText(ctx, String(o.number), 16, 12, 7, 'rgb(200,170,80)'); }
    noise(ctx, w, h, 14, rnd);
    return c;
  },
  metal(rnd, o) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    const base = hexToRgb(o.color || 0x7a7d80);
    ctx.fillStyle = rgb(...base); ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) { ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.06})`; ctx.fillRect(0, y, w, 1); }
    if (o.rivets) { ctx.fillStyle = rgb(base[0] * 0.6, base[1] * 0.6, base[2] * 0.6); for (let x = 4; x < w; x += 16) { ctx.fillRect(x, 3, 2, 2); ctx.fillRect(x, h - 5, 2, 2); } }
    if (o.diamond) { ctx.fillStyle = rgb(base[0] * 1.2, base[1] * 1.2, base[2] * 1.2); for (let y = 0; y < h; y += 8) for (let x = (y / 8 % 2) * 4; x < w; x += 8) ctx.fillRect(x, y, 3, 1); }
    stains(ctx, w, h, 6, 'rgb(80,50,30)', 0.1, rnd, 7);
    noise(ctx, w, h, 12, rnd);
    return c;
  },
  shutter(rnd, o) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    const base = hexToRgb(o.color || 0x8c8f90);
    for (let y = 0; y < h; y += 4) {
      ctx.fillStyle = rgb(base[0], base[1], base[2]); ctx.fillRect(0, y, w, 3);
      ctx.fillStyle = rgb(base[0] * 0.55, base[1] * 0.55, base[2] * 0.55); ctx.fillRect(0, y + 3, w, 1);
    }
    stains(ctx, w, h, 5, 'rgb(60,40,30)', 0.15, rnd, 8);
    noise(ctx, w, h, 12, rnd);
    return c;
  },
  tile(rnd, o) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    const a = hexToRgb(o.color || 0xd8d4c8); const b = hexToRgb(o.color2 || o.color || 0xd8d4c8);
    const n = o.n || 4; const s = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const col = (o.checker && (x + y) % 2) ? b : a;
      const v = 0.92 + rnd() * 0.1;
      ctx.fillStyle = rgb(col[0] * v, col[1] * v, col[2] * v); ctx.fillRect(x * s, y * s, s, s);
    }
    ctx.fillStyle = o.grout || 'rgba(60,60,55,0.6)';
    for (let i = 0; i <= n; i++) { ctx.fillRect(i * s, 0, 1, h); ctx.fillRect(0, i * s, w, 1); }
    stains(ctx, w, h, 6, 'rgb(60,50,40)', 0.1, rnd, 8);
    noise(ctx, w, h, 10, rnd);
    return c;
  },
  marble(rnd, o) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    const base = hexToRgb(o.color || 0xd0c8b8);
    ctx.fillStyle = rgb(...base); ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = `rgba(90,85,80,0.35)`;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); let x = rnd() * w, y = 0; ctx.moveTo(x, y);
      while (y < h) { x += (rnd() - 0.5) * 8; y += 4; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,40,40,0.4)'; ctx.fillRect(0, 0, w, 1); ctx.fillRect(0, 0, 1, h);
    noise(ctx, w, h, 8, rnd);
    return c;
  },
  gravel(rnd, o) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    const base = hexToRgb(o.color || 0x6d6a64);
    ctx.fillStyle = rgb(...base); ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 600; i++) { const v = 0.5 + rnd(); ctx.fillStyle = rgb(base[0] * v, base[1] * v, base[2] * v); ctx.fillRect(rnd() * w | 0, rnd() * h | 0, 1 + (rnd() * 2 | 0), 1); }
    stains(ctx, w, h, 5, '#000', 0.12, rnd, 10);
    return c;
  },
  grass(rnd) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    ctx.fillStyle = rgb(70, 80, 40); ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { const v = 0.6 + rnd() * 0.8; ctx.fillStyle = rgb(70 * v, 88 * v, 38 * v); ctx.fillRect(rnd() * w | 0, rnd() * h | 0, 1, 2); }
    stains(ctx, w, h, 6, 'rgb(80,60,30)', 0.2, rnd, 9);
    return c;
  },
  dirt(rnd) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    ctx.fillStyle = rgb(96, 78, 58); ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 30, rnd);
    stains(ctx, w, h, 10, '#000', 0.12, rnd, 10);
    return c;
  },
  roof(rnd) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    ctx.fillStyle = rgb(80, 78, 74); ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 26, rnd);
    ctx.fillStyle = 'rgba(30,30,30,0.35)';
    for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 1);
    stains(ctx, w, h, 8, '#000', 0.15, rnd, 12);
    return c;
  },
  glass(rnd, o) {
    const w = 32, h = 32; const { c, ctx } = mk(w, h);
    ctx.fillStyle = o.color || 'rgba(120,150,160,0.35)'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 6; i++) ctx.fillRect(4 + i * 2, 20 - i * 3, 2, 2);
    ctx.fillRect(18, 6, 6, 1);
    return c;
  },
  glassBroken(rnd) {
    const w = 32, h = 32; const { c, ctx } = mk(w, h);
    ctx.fillStyle = 'rgba(120,150,160,0.4)'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(16, 16); ctx.lineTo(16 + Math.cos(i * 0.7) * 20, 16 + Math.sin(i * 0.7) * 20); ctx.stroke(); }
    return c;
  },
  skin(rnd, o) {
    const w = 16, h = 16; const { c, ctx } = mk(w, h);
    const base = hexToRgb(o.color || 0xc09070);
    ctx.fillStyle = rgb(...base); ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 12, rnd);
    return c;
  },
  // Generic grime used on characters (multiplied with vertex colours)
  grime(rnd, o) {
    const w = 64, h = 64; const { c, ctx } = mk(w, h);
    ctx.fillStyle = rgb(235, 235, 235); ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 40, rnd);
    stains(ctx, w, h, 18, 'rgb(60,50,40)', 0.25, rnd, 6);
    if (o.blood) stains(ctx, w, h, 12, 'rgb(110,10,8)', 0.55, rnd, 5);
    return c;
  },
  blood(rnd) {
    const w = 32, h = 32; const { c, ctx } = mk(w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgb(105,6,4)';
    for (let i = 0; i < 9; i++) {
      ctx.beginPath(); ctx.arc(16 + (rnd() - 0.5) * 12, 16 + (rnd() - 0.5) * 12, 2 + rnd() * 6, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 14; i++) { const a = rnd() * Math.PI * 2, r = 8 + rnd() * 8; ctx.fillRect(16 + Math.cos(a) * r, 16 + Math.sin(a) * r, 1 + (rnd() * 2 | 0), 1 + (rnd() * 2 | 0)); }
    ctx.fillStyle = 'rgb(70,0,0)';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(16 + (rnd() - 0.5) * 8, 16 + (rnd() - 0.5) * 8, 1 + rnd() * 3, 0, Math.PI * 2); ctx.fill(); }
    crisp(ctx, w, h);
    return c;
  },
  bulletHole(rnd) {
    const w = 8, h = 8; const { c, ctx } = mk(w, h);
    ctx.fillStyle = 'rgba(20,20,20,1)'; ctx.fillRect(3, 3, 2, 2);
    ctx.fillStyle = 'rgba(40,40,40,0.8)'; ctx.fillRect(2, 3, 1, 2); ctx.fillRect(5, 3, 1, 2); ctx.fillRect(3, 2, 2, 1); ctx.fillRect(3, 5, 2, 1);
    return c;
  },
  scorch(rnd) {
    const w = 32, h = 32; const { c, ctx } = mk(w, h);
    for (let i = 0; i < 20; i++) { ctx.fillStyle = `rgba(10,8,6,${0.2 + rnd() * 0.4})`; ctx.beginPath(); ctx.arc(16 + (rnd() - 0.5) * 16, 16 + (rnd() - 0.5) * 16, 3 + rnd() * 7, 0, Math.PI * 2); ctx.fill(); }
    return c;
  },
  // Soft-ish round particle (pixelated)
  particle(rnd) {
    const w = 8, h = 8; const { c, ctx } = mk(w, h);
    ctx.fillStyle = '#fff'; ctx.fillRect(2, 1, 4, 6); ctx.fillRect(1, 2, 6, 4);
    return c;
  },
  smoke(rnd) {
    const w = 32, h = 32; const { c, ctx } = mk(w, h);
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.08 + rnd() * 0.12})`;
      ctx.beginPath(); ctx.arc(16 + (rnd() - 0.5) * 14, 16 + (rnd() - 0.5) * 14, 4 + rnd() * 7, 0, Math.PI * 2); ctx.fill();
    }
    return c;
  },
  // 4-frame fire sprite sheet (horizontal)
  fire(rnd) {
    const fw = 16, fh = 32, frames = 4; const { c, ctx } = mk(fw * frames, fh);
    for (let f = 0; f < frames; f++) {
      for (let i = 0; i < 40; i++) {
        const t = rnd();
        const y = fh - 2 - t * (fh - 4) * (0.6 + rnd() * 0.4);
        const spread = (1 - t) * 6 + 1;
        const x = f * fw + fw / 2 + (rnd() - 0.5) * spread * 2;
        const col = t < 0.3 ? 'rgb(255,240,160)' : t < 0.6 ? 'rgb(255,170,40)' : 'rgb(220,70,20)';
        ctx.fillStyle = col;
        const s = Math.max(1, (1 - t) * 4) | 0;
        ctx.fillRect(x | 0, y | 0, s, s + 1);
      }
    }
    return c;
  },
  muzzle(rnd) {
    const w = 16, h = 16; const { c, ctx } = mk(w, h);
    ctx.fillStyle = 'rgb(255,200,80)';
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + rnd() * 0.4; ctx.save(); ctx.translate(8, 8); ctx.rotate(a); ctx.fillRect(0, -1, 7 + rnd() * 2, 2); ctx.restore(); }
    ctx.fillStyle = 'rgb(255,250,210)'; ctx.fillRect(5, 5, 6, 6);
    crisp(ctx, w, h);
    return c;
  },
  sky(rnd, o) {
    const w = 128, h = 64; const { c, ctx } = mk(w, h);
    const top = hexToRgb(o.top || 0x3c4a5c), bottom = hexToRgb(o.bottom || 0xc89060);
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1);
      ctx.fillStyle = rgb(top[0] + (bottom[0] - top[0]) * t, top[1] + (bottom[1] - top[1]) * t, top[2] + (bottom[2] - top[2]) * t);
      ctx.fillRect(0, y, w, 1);
    }
    // clouds / smoke plumes
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${o.cloud || '60,55,55'},${0.1 + rnd() * 0.2})`;
      const x = rnd() * w, y = 10 + rnd() * 36;
      ctx.beginPath(); ctx.ellipse(x, y, 6 + rnd() * 16, 2 + rnd() * 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    noise(ctx, w, h, 6, rnd);
    return c;
  },
  skyline(rnd, o) {
    // distant city silhouette band, alpha background
    const w = 256, h = 64; const { c, ctx } = mk(w, h);
    ctx.clearRect(0, 0, w, h);
    const col = o.color || 'rgb(40,38,44)';
    let x = 0;
    while (x < w) {
      const bw = 6 + rnd() * 18, bh = 10 + rnd() * 44;
      ctx.fillStyle = col; ctx.fillRect(x, h - bh, bw, bh);
      ctx.fillStyle = 'rgba(240,200,120,0.5)';
      for (let k = 0; k < bh / 4; k++) if (rnd() < 0.15) ctx.fillRect(x + 1 + (rnd() * (bw - 2) | 0), h - bh + k * 4 + 2, 1, 1);
      x += bw + rnd() * 3;
    }
    // smoke plumes
    for (let i = 0; i < 4; i++) {
      const px = rnd() * w;
      for (let k = 0; k < 12; k++) { ctx.fillStyle = `rgba(30,28,28,${0.25 - k * 0.015})`; ctx.beginPath(); ctx.arc(px + k * 2.5, h - 20 - k * 4, 4 + k * 0.8, 0, Math.PI * 2); ctx.fill(); }
    }
    return c;
  },
  sign(rnd, o) {
    const w = o.w || 64, h = o.h || 16; const { c, ctx } = mk(w, h);
    ctx.fillStyle = o.bg || 'rgb(30,90,40)'; ctx.fillRect(0, 0, w, h);
    if (o.border) { ctx.strokeStyle = o.border; ctx.strokeRect(0.5, 0.5, w - 1, h - 1); }
    const lines = String(o.text || '').split('\n');
    const size = o.size || Math.floor(h * 0.6 / lines.length);
    lines.forEach((ln, i) => pixelText(ctx, ln, w / 2, (i + 0.5) * h / lines.length + 0.5, size, o.fg || 'rgb(240,240,230)', 'center', 'bold', o.font || 'sans-serif'));
    if (o.grime !== false) { noise(ctx, w, h, 14, rnd); stains(ctx, w, h, 3, '#000', 0.15, rnd, 6); }
    return c;
  },
  graffiti(rnd, o) {
    const w = o.w || 64, h = o.h || 32; const { c, ctx } = mk(w, h);
    ctx.clearRect(0, 0, w, h);
    const lines = String(o.text || '').split('\n');
    const size = o.size || Math.floor(h * 0.55 / lines.length);
    lines.forEach((ln, i) => {
      ctx.save(); ctx.translate(w / 2, (i + 0.5) * h / lines.length); ctx.rotate((rnd() - 0.5) * 0.12);
      pixelText(ctx, ln, 0, 0, size, o.color || 'rgb(200,30,30)', 'center', 'bold', 'sans-serif');
      ctx.restore();
    });
    if (o.arrow) {
      ctx.strokeStyle = o.color || 'rgb(200,30,30)'; ctx.lineWidth = 2;
      const y = h - 4; ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(w - 8, y); ctx.lineTo(w - 14, y - 4); ctx.moveTo(w - 8, y); ctx.lineTo(w - 14, y + 4); ctx.stroke();
    }
    crisp(ctx, w, h);
    return c;
  },
  poster(rnd, o) {
    const w = 32, h = 48; const { c, ctx } = mk(w, h);
    const hues = [[180, 40, 40], [40, 90, 160], [200, 160, 40], [60, 120, 60], [120, 60, 140]];
    const hcol = hues[(rnd() * hues.length) | 0];
    ctx.fillStyle = rgb(220, 215, 200); ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgb(...hcol); ctx.fillRect(2, 2, w - 4, 22);
    ctx.fillStyle = rgb(240, 230, 210); ctx.beginPath(); ctx.arc(16, 13, 6, 0, Math.PI * 2); ctx.fill();
    pixelText(ctx, o.text || 'CEDA', 16, 30, 7, 'rgb(30,30,30)');
    for (let i = 0; i < 4; i++) { ctx.fillStyle = 'rgb(90,90,90)'; ctx.fillRect(5, 36 + i * 3, 22 - (rnd() * 8 | 0), 1); }
    noise(ctx, w, h, 16, rnd);
    return c;
  },
  face(rnd, o) {
    // 16x16 face: skin, eyes, brows, mouth; zombie variant has pale eyes and blood
    const w = 16, h = 16; const { c, ctx } = mk(w, h);
    const skin = hexToRgb(o.skin || 0xc89a78);
    ctx.fillStyle = rgb(...skin); ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 10, rnd);
    const hair = o.hair !== undefined ? hexToRgb(o.hair) : null;
    if (hair) { ctx.fillStyle = rgb(...hair); ctx.fillRect(0, 0, w, 3); ctx.fillRect(0, 0, 2, 6); ctx.fillRect(14, 0, 2, 6); }
    if (o.zombie) {
      ctx.fillStyle = 'rgb(40,20,20)'; ctx.fillRect(3, 6, 4, 3); ctx.fillRect(9, 6, 4, 3);
      ctx.fillStyle = 'rgb(220,220,190)'; ctx.fillRect(4, 7, 1, 1); ctx.fillRect(11, 7, 1, 1);
      ctx.fillStyle = 'rgb(60,10,10)'; ctx.fillRect(5, 11, 6, 3);
      ctx.fillStyle = 'rgb(200,190,160)'; ctx.fillRect(6, 11, 4, 1);
      stains(ctx, w, h, 3, 'rgb(110,10,8)', 0.6, rnd, 2);
    } else {
      ctx.fillStyle = 'rgb(250,250,245)'; ctx.fillRect(4, 7, 3, 2); ctx.fillRect(9, 7, 3, 2);
      ctx.fillStyle = o.eye || 'rgb(60,40,30)'; ctx.fillRect(5, 7, 1, 2); ctx.fillRect(10, 7, 1, 2);
      ctx.fillStyle = hair ? rgb(...hair) : 'rgb(50,35,25)'; ctx.fillRect(4, 5, 3, 1); ctx.fillRect(9, 5, 3, 1);
      ctx.fillStyle = rgb(skin[0] * 0.8, skin[1] * 0.75, skin[2] * 0.7); ctx.fillRect(7, 9, 2, 2);
      ctx.fillStyle = 'rgb(120,60,55)'; ctx.fillRect(6, 12, 4, 1);
      if (o.beard) { ctx.fillStyle = rgb(...hexToRgb(o.beard)); ctx.fillRect(3, 11, 10, 5); ctx.fillStyle = 'rgb(120,60,55)'; ctx.fillRect(6, 12, 4, 1); }
    }
    return c;
  },
  fabric(rnd, o) {
    const w = 32, h = 32; const { c, ctx } = mk(w, h);
    const base = hexToRgb(o.color || 0x606060);
    ctx.fillStyle = rgb(...base); ctx.fillRect(0, 0, w, h);
    if (o.plaid) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < w; i += 8) { ctx.fillRect(i, 0, 3, h); ctx.fillRect(0, i, w, 3); } }
    noise(ctx, w, h, 16, rnd);
    return c;
  },
  water(rnd) {
    const w = 32, h = 32; const { c, ctx } = mk(w, h);
    ctx.fillStyle = 'rgb(40,60,60)'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(160,190,190,0.35)'; ctx.fillRect(rnd() * w | 0, rnd() * h | 0, 3, 1); }
    return c;
  },
  acid(rnd) {
    const w = 32, h = 32; const { c, ctx } = mk(w, h);
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) { ctx.fillStyle = `rgba(${150 + rnd() * 60},${200 + rnd() * 55},30,0.8)`; ctx.beginPath(); ctx.arc(16 + (rnd() - 0.5) * 18, 16 + (rnd() - 0.5) * 18, 2 + rnd() * 6, 0, Math.PI * 2); ctx.fill(); }
    crisp(ctx, w, h);
    return c;
  },
  bile(rnd) {
    const w = 32, h = 32; const { c, ctx } = mk(w, h);
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) { ctx.fillStyle = `rgba(${90 + rnd() * 40},${120 + rnd() * 40},20,0.85)`; ctx.beginPath(); ctx.arc(16 + (rnd() - 0.5) * 18, 16 + (rnd() - 0.5) * 18, 2 + rnd() * 6, 0, Math.PI * 2); ctx.fill(); }
    crisp(ctx, w, h);
    return c;
  },
};

/** Get (cached) texture by generator name and options. */
export function tex(name, opts = {}, repeat = null) {
  const key = name + JSON.stringify(opts);
  let t = cache.get(key);
  if (!t) {
    const gen = GEN[name];
    if (!gen) throw new Error('Unknown texture ' + name);
    const seed = opts.seed !== undefined ? opts.seed : hashStr(key);
    const canvas = gen(mulberry32(seed), opts);
    t = toTex(canvas, opts);
    cache.set(key, t);
  }
  if (repeat) { const t2 = t.clone(); t2.repeat.set(repeat[0], repeat[1]); t2.needsUpdate = true; return t2; }
  return t;
}

export function canvasFor(name, opts = {}) {
  const key = name + JSON.stringify(opts);
  return GEN[name](mulberry32(opts.seed !== undefined ? opts.seed : hashStr(key)), opts);
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
