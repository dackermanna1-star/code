// Particle & VFX system. World-space particles (y up) rendered through the camera.
// Includes cached additive glow sprites, pixel-crisp circles, anime hit sparks,
// lightning, slashes, rings, smoke, flames and popup text.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U;
  const hasDoc = typeof document !== 'undefined';

  const FX = (JJK.FX = {});
  const MAX = 2200;
  const parts = [];
  const pool = [];
  FX.parts = parts;
  FX.lights = []; // per-frame dynamic lights {x,y,r,c:[r,g,b],i}
  FX.timeScale = 1;

  function P() {
    return pool.pop() || {};
  }

  // type: spark|px|glow|ring|smoke|debris|flame|slash|text|star|bolt|shock|line|flash|orb
  FX.spawn = function (type, x, y, o = {}) {
    if (parts.length >= MAX) return null;
    const p = P();
    p.type = type;
    p.x = x; p.y = y;
    p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.ax = o.ax || 0; p.ay = o.ay != null ? o.ay : 0;
    p.drag = o.drag != null ? o.drag : 1;
    p.life = o.life || 20; p.t = 0;
    p.size = o.size || 2; p.size2 = o.size2 != null ? o.size2 : p.size;
    p.color = o.color || '#fff';
    p.color2 = o.color2 || p.color;
    p.alpha = o.alpha != null ? o.alpha : 1;
    p.add = !!o.add;
    p.rot = o.rot || 0; p.vr = o.vr || 0;
    p.len = o.len || 0;
    p.x2 = o.x2 || 0; p.y2 = o.y2 || 0;
    p.floor = o.floor != null ? o.floor : false;
    p.text = o.text || '';
    p.scale = o.scale || 1;
    p.layer = o.layer || 'front';
    p.pts = o.pts || null;
    p.w = o.w || 1;
    p.delay = o.delay || 0;
    p.seed = Math.random() * 1000;
    p.follow = o.follow || null; // object with x,y to follow
    p.fx = o.fx || 0; p.fy = o.fy || 0;
    p.fade = o.fade != null ? o.fade : 1;
    p.shape = o.shape || 0;
    parts.push(p);
    return p;
  };

  FX.clear = function () {
    while (parts.length) pool.push(parts.pop());
  };

  FX.update = function () {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.delay > 0) { p.delay--; continue; }
      p.t++;
      if (p.follow) { p.x = p.follow.x + p.fx; p.y = p.follow.y + p.fy; }
      p.vx += p.ax; p.vy += p.ay;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx; p.y += p.vy;
      p.rot += p.vr;
      if (p.floor !== false && p.y < p.floor) {
        p.y = p.floor;
        p.vy = -p.vy * 0.35;
        p.vx *= 0.6;
        p.vr *= 0.5;
      }
      if (p.t >= p.life) {
        parts.splice(i, 1);
        pool.push(p);
      }
    }
  };

  // ---- cached sprites -------------------------------------------------
  const glowCache = new Map();
  function glowSprite(color) {
    let c = glowCache.get(color);
    if (c || !hasDoc) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    const rgb = U.hex(color);
    g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},1)`);
    g.addColorStop(0.25, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.55)`);
    g.addColorStop(0.6, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.15)`);
    g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    glowCache.set(color, c);
    return c;
  }
  FX.glowSprite = glowSprite;

  // additive glow at screen coords
  FX.glow = function (ctx, sx, sy, r, color, alpha = 1) {
    const s = glowSprite(color);
    if (!s || r <= 0) return;
    const pa = ctx.globalAlpha, pc = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = U.clamp(alpha, 0, 1);
    ctx.drawImage(s, sx - r, sy - r, r * 2, r * 2);
    ctx.globalAlpha = pa;
    ctx.globalCompositeOperation = pc;
  };

  // Pixel-crisp filled circle (no AA) at screen coords.
  FX.pxCircle = function (ctx, cx, cy, r, color) {
    if (r < 0.5) return;
    ctx.fillStyle = color;
    const r2 = r * r;
    const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      const d = r2 - dy * dy;
      if (d < 0) continue;
      const hw = Math.sqrt(d);
      const xa = Math.round(cx - hw), xb = Math.round(cx + hw);
      if (xb > xa) ctx.fillRect(xa, y, xb - xa, 1);
    }
  };
  // Pixel-crisp ring
  FX.pxRing = function (ctx, cx, cy, r, w, color) {
    if (r < 1) return;
    ctx.fillStyle = color;
    const ro2 = r * r, ri = Math.max(0, r - w), ri2 = ri * ri;
    const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      const d = ro2 - dy * dy;
      if (d < 0) continue;
      const ho = Math.sqrt(d);
      const di = ri2 - dy * dy;
      if (di <= 0) {
        ctx.fillRect(Math.round(cx - ho), y, Math.round(cx + ho) - Math.round(cx - ho), 1);
      } else {
        const hi = Math.sqrt(di);
        ctx.fillRect(Math.round(cx - ho), y, Math.max(1, Math.round(cx - hi) - Math.round(cx - ho)), 1);
        ctx.fillRect(Math.round(cx + hi), y, Math.max(1, Math.round(cx + ho) - Math.round(cx + hi)), 1);
      }
    }
  };

  // Jagged lightning polyline between two screen points.
  FX.boltPath = function (x0, y0, x1, y1, jag, segs, seed) {
    const pts = [x0, y0];
    const dx = x1 - x0, dy = y1 - y0;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    let s = seed;
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      s = (s * 9301 + 49297) % 233280;
      const r = (s / 233280 - 0.5) * 2 * jag * Math.sin(t * Math.PI);
      pts.push(x0 + dx * t + nx * r, y0 + dy * t + ny * r);
    }
    pts.push(x1, y1);
    return pts;
  };

  function strokePts(ctx, pts, w, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  }
  FX.strokePts = strokePts;

  // ---- draw -------------------------------------------------------------
  FX.draw = function (ctx, cam, layer) {
    if (!ctx) return;
    const z = cam.ez;
    ctx.save();
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.layer !== layer || p.delay > 0) continue;
      const k = p.t / p.life; // 0..1
      const sx = cam.sx(p.x), sy = cam.sy(p.y);
      const a = p.alpha * (p.fade ? 1 - Math.pow(k, 1.6) * p.fade : 1);
      if (a <= 0.01) continue;
      ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      ctx.globalAlpha = U.clamp(a, 0, 1);
      const size = U.lerp(p.size, p.size2, k) * z;
      switch (p.type) {
        case 'px': {
          const s = Math.max(1, Math.round(size));
          ctx.fillStyle = k < 0.3 ? p.color : p.color2;
          ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), s, s);
          break;
        }
        case 'spark': {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const len = Math.max(2, (p.len || 3) * sp * z * (1 - k * 0.6));
          const ex = sx - (p.vx / sp) * len, ey = sy + (p.vy / sp) * len;
          ctx.strokeStyle = k < 0.35 ? '#fff' : p.color;
          ctx.lineWidth = Math.max(1, Math.round(size));
          ctx.beginPath();
          ctx.moveTo(Math.round(sx) + 0.5, Math.round(sy) + 0.5);
          ctx.lineTo(Math.round(ex) + 0.5, Math.round(ey) + 0.5);
          ctx.stroke();
          break;
        }
        case 'glow': {
          ctx.globalAlpha = 1;
          FX.glow(ctx, sx, sy, size, p.color, a);
          break;
        }
        case 'ring': {
          const w = Math.max(1, Math.round(p.w * z * (1 - k * 0.7)));
          FX.pxRing(ctx, sx, sy, size, w, k < 0.25 ? '#fff' : p.color);
          break;
        }
        case 'shock': {
          // flat ellipse ring on the floor
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, p.w * z * (1 - k));
          ctx.beginPath();
          ctx.ellipse(sx, sy, size, size * 0.18, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'smoke': {
          FX.pxCircle(ctx, sx, sy, size, p.color);
          break;
        }
        case 'flame': {
          // teardrop tongue of flame: base blob + tapered tip trailing upward
          const c = k < 0.2 ? '#fff6c0' : k < 0.45 ? p.color : k < 0.75 ? p.color2 : '#3a1008';
          const r = size * (1 - k * 0.55);
          FX.pxCircle(ctx, sx, sy, r, c);
          if (r > 1.5) {
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.moveTo(sx - r * 0.85, sy - r * 0.2);
            ctx.lineTo(sx + Math.sin(p.seed + p.t * 0.4) * r * 0.5, sy - r * 2.4);
            ctx.lineTo(sx + r * 0.85, sy - r * 0.2);
            ctx.fill();
            if (k < 0.5) FX.pxCircle(ctx, sx, sy + r * 0.2, r * 0.45, k < 0.25 ? '#ffffff' : '#ffe9a0');
          }
          break;
        }
        case 'debris': {
          ctx.fillStyle = p.color;
          ctx.translate(Math.round(sx), Math.round(sy));
          ctx.rotate(p.rot);
          const s = Math.max(1, size);
          ctx.fillRect(-s / 2, -s / 2, s, s * 0.7);
          ctx.fillStyle = p.color2;
          ctx.fillRect(-s / 2, -s / 2, s, Math.max(1, s * 0.25));
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          break;
        }
        case 'slash': {
          // line from (x,y) to (x2,y2) world; grows then thins
          const gx = cam.sx(p.x2), gy = cam.sy(p.y2);
          const grow = Math.min(1, p.t / Math.max(1, p.life * 0.25));
          const ex = sx + (gx - sx) * grow, ey = sy + (gy - sy) * grow;
          const w = Math.max(1, size * (1 - k));
          ctx.strokeStyle = p.color;
          ctx.lineWidth = w + 2;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = Math.max(1, w * 0.5);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
          break;
        }
        case 'line': {
          const gx = cam.sx(p.x2), gy = cam.sy(p.y2);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, size);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(gx, gy); ctx.stroke();
          break;
        }
        case 'star': {
          // anime impact star: spiky polygon
          const n = p.shape || 8;
          const R = size, r = size * 0.32;
          ctx.translate(sx, sy);
          ctx.rotate(p.rot);
          ctx.beginPath();
          for (let j = 0; j < n * 2; j++) {
            const ang = (j / (n * 2)) * Math.PI * 2;
            const rr = j % 2 === 0 ? R * (0.7 + 0.3 * Math.abs(Math.sin(p.seed + j * 1.7))) : r;
            ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
          }
          ctx.closePath();
          ctx.fillStyle = p.color2;
          ctx.fill();
          ctx.scale(0.62, 0.62);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          break;
        }
        case 'bolt': {
          const gx = cam.sx(p.x2), gy = cam.sy(p.y2);
          const pts = FX.boltPath(sx, sy, gx, gy, p.size * z, 7, ((p.seed * 1000) | 0) + ((p.t / 2) | 0) * 77);
          strokePts(ctx, pts, Math.max(2, 3 * z), p.color2);
          strokePts(ctx, pts, Math.max(1, 1.4 * z), p.color);
          break;
        }
        case 'flash': {
          FX.pxCircle(ctx, sx, sy, size, p.color);
          break;
        }
        case 'text': {
          const s = Math.max(1, Math.round(p.scale * (k < 0.15 ? 1 + (0.15 - k) * 4 : 1)));
          JJK.Font.draw(ctx, p.text, sx, sy, { color: p.color, scale: s, align: 'center', outline: p.color2 || '#000' });
          break;
        }
        case 'orb': {
          FX.pxCircle(ctx, sx, sy, size, p.color);
          FX.pxCircle(ctx, sx, sy, size * 0.55, p.color2);
          break;
        }
      }
    }
    ctx.restore();
  };

  // ---- composite effects --------------------------------------------------
  const R = (a, b) => a + Math.random() * (b - a);

  // dir: +1/-1 knockback direction. power 0..1.
  FX.hitSpark = function (x, y, dir, power, color = '#ffd27a', opt = {}) {
    const n = Math.round(6 + power * 12);
    FX.spawn('flash', x, y, { life: 4, size: 8 + power * 18, size2: 2, color: '#fff', add: true });
    FX.spawn('glow', x, y, { life: 10, size: 20 + power * 40, size2: 4, color: color, add: true });
    FX.spawn('star', x, y, { life: 5 + Math.round(power * 4), size: 12 + power * 26, size2: 6, color: '#fff', color2: color, rot: R(0, 6.28), shape: 7 + ((Math.random() * 4) | 0) });
    FX.spawn('ring', x, y, { life: 10 + power * 6, size: 4, size2: 18 + power * 40, color: color, w: 2 + power * 2, add: true });
    for (let i = 0; i < n; i++) {
      const ang = R(-1, 1) * (opt.spread || 1.4);
      const sp = R(3, 9) * (0.6 + power);
      const a = dir > 0 ? ang : Math.PI - ang;
      FX.spawn('spark', x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + R(-1, 2), drag: 0.86, ay: -0.15,
        life: R(8, 16), size: power > 0.6 ? 2 : 1, len: 1.6, color,
      });
    }
    for (let i = 0; i < 3 + power * 6; i++)
      FX.spawn('px', x, y, { vx: dir * R(1, 5), vy: R(-1, 5), ay: -0.3, drag: 0.95, life: R(14, 26), size: 2, color: '#fff', color2: color, floor: 0 });
  };

  FX.blockSpark = function (x, y, dir, color = '#9fd8ff') {
    FX.spawn('flash', x, y, { life: 3, size: 10, size2: 3, color: '#fff', add: true });
    FX.spawn('ring', x, y, { life: 9, size: 6, size2: 22, color, w: 2, add: true });
    for (let i = 0; i < 8; i++) {
      const a = (dir > 0 ? Math.PI : 0) + R(-1.1, 1.1);
      FX.spawn('spark', x, y, { vx: Math.cos(a) * R(3, 6), vy: Math.sin(a) * R(3, 6), drag: 0.82, life: R(6, 11), size: 1, len: 1.4, color });
    }
  };

  FX.perfectSpark = function (x, y) {
    FX.spawn('flash', x, y, { life: 5, size: 22, size2: 2, color: '#fff', add: true });
    FX.spawn('ring', x, y, { life: 14, size: 6, size2: 46, color: '#ffffff', w: 3, add: true });
    FX.spawn('ring', x, y, { life: 18, size: 4, size2: 30, color: '#7ff0ff', w: 2, add: true, delay: 3 });
    FX.spawn('star', x, y, { life: 8, size: 30, size2: 8, color: '#fff', color2: '#7ff0ff', shape: 4, rot: Math.PI / 4 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      FX.spawn('spark', x, y, { vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, drag: 0.85, life: 12, size: 1, len: 1.5, color: '#bff8ff' });
    }
  };

  FX.dust = function (x, power = 0.5, dir = 0) {
    for (let i = 0; i < 4 + power * 8; i++)
      FX.spawn('smoke', x + R(-10, 10), R(1, 6), {
        vx: R(-1.5, 1.5) * (1 + power) + dir * R(0.5, 2), vy: R(0.2, 1.4) * power, drag: 0.92,
        life: R(18, 34), size: R(3, 6) * (0.7 + power), size2: R(8, 14) * (0.7 + power), color: '#8a7466', alpha: 0.45, layer: 'back',
      });
  };

  FX.debris = function (x, y, n, power = 1, colors = ['#6a5a52', '#8a7a6a', '#4a3a34']) {
    for (let i = 0; i < n; i++)
      FX.spawn('debris', x + R(-6, 6), y + R(-6, 6), {
        vx: R(-4, 4) * power, vy: R(2, 7) * power, ay: -0.38, drag: 0.99, life: R(40, 80), size: R(2, 5),
        color: colors[i % colors.length], color2: '#b0a090', vr: R(-0.3, 0.3), floor: 0,
      });
  };

  FX.bolt = function (x, y, x2, y2, color = '#ff2030', color2 = '#000', life = 8, jag = 10) {
    FX.spawn('bolt', x, y, { x2, y2, life, size: jag, color, color2 });
  };

  FX.text = function (x, y, text, color = '#fff', outline = '#000', scale = 1, life = 50) {
    FX.spawn('text', x, y, { text, color, color2: outline, scale, life, vy: 0.6, drag: 0.94, fade: 1 });
  };

  FX.light = function (x, y, r, color, i = 1) {
    FX.lights.push({ x, y, r, c: color, i });
  };
})();
