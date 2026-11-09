// Procedural parallax backgrounds drawn in screen space.

import { makeNoise1D, mulberry32 } from '../core/math.js';

const noises = new Map();
function noise(seed) {
  if (!noises.has(seed)) noises.set(seed, makeNoise1D(seed));
  return noises.get(seed);
}

function hash(i, seed) {
  let h = (i * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function drawBackground(ctx, theme, cam, time) {
  const W = cam.W;
  const H = cam.H;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, theme.sky[0]);
  g.addColorStop(0.6, theme.sky[1]);
  g.addColorStop(1, theme.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const k = H / 720;

  if (theme.stars) {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 120; i++) {
      const sx = ((hash(i, 3) * W * 2 - cam.x * 2) % W + W) % W;
      const sy = hash(i, 7) * H * 0.6;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * (1 + hash(i, 9) * 3) + i));
      ctx.globalAlpha = tw * 0.8;
      ctx.fillRect(sx, sy, 1.6 * k, 1.6 * k);
    }
    ctx.globalAlpha = 1;
  }
  if (theme.sun) {
    const s = theme.sun;
    const sx = s.x * W - cam.x * 0.5;
    const sy = s.y * H + cam.y * 0.6;
    const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, s.r * 3 * k);
    rg.addColorStop(0, s.color);
    rg.addColorStop(0.3, s.color + 'aa');
    rg.addColorStop(1, s.color + '00');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(sx, sy, s.r * 3 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(sx, sy, s.r * k, 0, Math.PI * 2);
    ctx.fill();
  }
  if (theme.moon) {
    const m = theme.moon;
    const mx = m.x * W - cam.x * 0.5;
    const my = m.y * H + cam.y * 0.5;
    const rg = ctx.createRadialGradient(mx, my, 0, mx, my, m.r * 4 * k);
    rg.addColorStop(0, 'rgba(220,230,255,0.35)');
    rg.addColorStop(1, 'rgba(220,230,255,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(mx, my, m.r * 4 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#eef1ff';
    ctx.beginPath();
    ctx.arc(mx, my, m.r * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,170,200,0.4)';
    ctx.beginPath();
    ctx.arc(mx - 8 * k, my - 6 * k, 7 * k, 0, Math.PI * 2);
    ctx.arc(mx + 10 * k, my + 8 * k, 5 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  if (theme.clouds) drawClouds(ctx, cam, time, W, H, k, theme.dark);

  for (let li = 0; li < theme.layers.length; li++) {
    drawLayer(ctx, theme.layers[li], li, cam, W, H, k, time);
  }
  if (theme.embers) {
    for (let i = 0; i < 40; i++) {
      const sx = ((hash(i, 11) * W * 1.5 - cam.x * 6 + Math.sin(time + i) * 20) % W + W) % W;
      const sy = H - (((time * (20 + hash(i, 5) * 50) + hash(i, 4) * H) % H));
      ctx.fillStyle = `rgba(255,${120 + Math.round(hash(i, 2) * 100)},40,${0.5 + 0.5 * Math.sin(time * 3 + i)})`;
      ctx.fillRect(sx, sy, 2.5 * k, 2.5 * k);
    }
  }
}

function drawClouds(ctx, cam, time, W, H, k, dark) {
  ctx.fillStyle = dark ? 'rgba(80,90,120,0.4)' : 'rgba(255,255,255,0.85)';
  const span = W + 400 * k;
  for (let i = 0; i < 7; i++) {
    const base = hash(i, 21) * span;
    const x = ((base - cam.x * 4 - time * (6 + i * 2)) % span + span) % span - 200 * k;
    const y = (0.08 + hash(i, 22) * 0.3) * H + cam.y * 0.4;
    const s = (0.6 + hash(i, 23) * 0.8) * k;
    ctx.beginPath();
    ctx.ellipse(x, y, 70 * s, 22 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 40 * s, y + 6 * s, 40 * s, 18 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 45 * s, y + 5 * s, 45 * s, 16 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 10 * s, y - 14 * s, 38 * s, 22 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLayer(ctx, L, li, cam, W, H, k, time) {
  const n = noise(100 + li * 17);
  // world-ish x for this layer in "pixels"
  const offX = cam.x * cam.ppm * L.par;
  const baseY = L.base * H + cam.y * cam.ppm * L.par * 0.35;
  const amp = L.amp * k;
  ctx.fillStyle = L.color;
  if (L.kind === 'hills' || L.kind === 'peaks' || L.kind === 'mesas') {
    ctx.beginPath();
    ctx.moveTo(0, H);
    const step = 8;
    for (let sx = 0; sx <= W + step; sx += step) {
      const wx = (sx + offX) * L.freq * 0.05 / k;
      let h;
      if (L.kind === 'hills') h = (n(wx) * 0.6 + n(wx * 2.3) * 0.3 + 0.5) * amp;
      else if (L.kind === 'peaks') {
        const v = n(wx) * 0.7 + n(wx * 2.7) * 0.3;
        h = (Math.abs(v) * 1.4 + 0.2) * amp;
      } else {
        const v = n(wx * 0.6);
        h = (v > 0.1 ? 1 : v > -0.2 ? 0.55 : 0.25) * amp + n(wx * 4) * 6 * k;
      }
      ctx.lineTo(sx, baseY - h);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    if (L.kind === 'peaks') {
      // snow caps
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(0, 0, W, baseY - amp * 0.95);
      ctx.restore();
    }
    return;
  }
  // discrete silhouettes
  const spacing = (L.kind === 'pines' || L.kind === 'trees' ? 38 : L.kind === 'cranes' ? 420 : L.kind === 'stacks' ? 260 : 90) * k;
  const startI = Math.floor((offX - 200 * k) / spacing);
  const endI = Math.ceil((offX + W + 200 * k) / spacing);
  ctx.fillRect(0, baseY, W, H - baseY);
  for (let i = startI; i <= endI; i++) {
    const r1 = hash(i, li * 31 + 1);
    const r2 = hash(i, li * 31 + 2);
    const x = i * spacing - offX + r2 * spacing * 0.5;
    if (L.kind === 'pines') {
      const h = (0.45 + r1 * 0.55) * amp;
      const w = h * 0.36;
      ctx.beginPath();
      ctx.moveTo(x - w, baseY + 2);
      ctx.lineTo(x, baseY - h);
      ctx.lineTo(x + w, baseY + 2);
      ctx.closePath();
      ctx.fill();
    } else if (L.kind === 'trees') {
      const h = (0.5 + r1 * 0.5) * amp;
      ctx.beginPath();
      ctx.arc(x, baseY - h * 0.7, h * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 2 * k, baseY - h * 0.4, 4 * k, h * 0.45);
    } else if (L.kind === 'city') {
      const w = (40 + r1 * 50) * k;
      const h = (0.3 + r2 * 0.7) * amp;
      ctx.fillRect(x, baseY - h, w, h + 2);
      if (r1 > 0.6) ctx.fillRect(x + w * 0.4, baseY - h - 18 * k, 3 * k, 18 * k);
      if (L.windows) {
        ctx.fillStyle = L.windows;
        for (let wy = baseY - h + 8 * k; wy < baseY - 6 * k; wy += 14 * k) {
          for (let wx = x + 6 * k; wx < x + w - 6 * k; wx += 12 * k) {
            if (hash(Math.round(wx * 7 + wy * 13), i) > 0.72) ctx.fillRect(wx, wy, 5 * k, 7 * k);
          }
        }
        ctx.fillStyle = L.color;
      }
    } else if (L.kind === 'cranes') {
      const h = (0.6 + r1 * 0.4) * amp;
      ctx.fillRect(x, baseY - h, 7 * k, h);
      ctx.fillRect(x - 60 * k, baseY - h, 170 * k, 6 * k);
      ctx.fillRect(x - 60 * k, baseY - h + 6 * k, 14 * k, 14 * k);
      ctx.strokeStyle = L.color;
      ctx.lineWidth = 1.5 * k;
      ctx.beginPath();
      ctx.moveTo(x + 90 * k, baseY - h + 6 * k);
      ctx.lineTo(x + 90 * k, baseY - h + 60 * k + Math.sin(time + i) * 6 * k);
      ctx.stroke();
    } else if (L.kind === 'stacks') {
      const h = (0.5 + r1 * 0.5) * amp;
      ctx.fillRect(x, baseY - h, 18 * k, h);
      ctx.fillRect(x + 40 * k, baseY - h * 0.7, 22 * k, h * 0.7);
      ctx.fillRect(x - 30 * k, baseY - h * 0.35, 120 * k, h * 0.35);
      // smoke
      ctx.fillStyle = 'rgba(120,120,140,0.18)';
      for (let s = 0; s < 4; s++) {
        const t = (time * 0.15 + s * 0.25 + r1) % 1;
        ctx.beginPath();
        ctx.arc(x + 9 * k + t * 40 * k, baseY - h - t * 120 * k, (8 + t * 30) * k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = L.color;
    } else if (L.kind === 'spires') {
      const h = (0.4 + r1 * 0.6) * amp;
      const w = (12 + r2 * 22) * k;
      ctx.beginPath();
      ctx.moveTo(x - w, baseY + 2);
      ctx.lineTo(x - w * 0.3, baseY - h * 0.6);
      ctx.lineTo(x, baseY - h);
      ctx.lineTo(x + w * 0.4, baseY - h * 0.5);
      ctx.lineTo(x + w, baseY + 2);
      ctx.closePath();
      ctx.fill();
    }
  }
}
