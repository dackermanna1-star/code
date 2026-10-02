// Frame composition: camera transform, environment layers, bodies, props,
// fighters, effects, lighting and screen-space post effects.

import { EnvRenderer } from './env.js';
import { drawFighter, drawShadow, drawBox, drawStick, drawProjectile } from './figures.js';
import { PELVIS } from '../fighter/skeleton.js';
import { clamp } from '../core/math.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.env = new EnvRenderer();
    this.dpr = 1;
    this.W = 800;
    this.H = 600;
    this.light = null;
    this.order = [];
  }

  setSim(sim) {
    this.sim = sim;
    this.env.setLevel(sim.level);
  }

  resize(quality) {
    const c = this.canvas;
    const maxDpr = quality === 'low' ? 1 : quality === 'medium' ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    if (w !== this.W || h !== this.H || dpr !== this.dpr) {
      this.W = w;
      this.H = h;
      this.dpr = dpr;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
  }

  render(sim, cam, fx, alpha, t, S) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const dpr = this.dpr;
    const L = sim.level;
    const P = this.env.P;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = P.skyBottom || '#000';
    ctx.fillRect(0, 0, W, H);
    // world transform (with a touch of roll from shake / slow motion)
    const z = cam.zoom;
    ctx.translate(W / 2, H / 2);
    if (cam.rot) ctx.rotate(cam.rot);
    ctx.scale(z, z);
    ctx.translate(-(cam.x + cam.shakeX), -(cam.y + cam.shakeY));
    const view = cam.view(W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const env = this.env;
    env.drawBackdrop(ctx, cam, view, t);
    env.drawDecor(ctx, sim, view, t, 'under');
    env.drawInterior(ctx, view);
    env.drawDecor(ctx, sim, view, t, 'back');
    env.drawStairs(ctx, view);
    env.drawHazards(ctx, sim, view, t);
    env.drawDecor(ctx, sim, view, t, 'mid');
    env.drawStructure(ctx, view);
    if (L.puddles) this.drawPuddles(ctx, sim, view, alpha);

    const dark = L.dark;
    if (dark) this.drawDarkness(ctx, sim, cam, fx, view, t, W, H);

    // bodies on the floor first, then props, then the living, hero last
    const order = this.order;
    order.length = 0;
    for (const f of sim.fighters) {
      if (f.removed) continue;
      const px = f.rag.p[PELVIS].x;
      if (px < view.x0 - 150 || px > view.x1 + 150) continue;
      order.push(f);
    }
    order.sort((a, b) => rank(a) - rank(b) || a.id - b.id);
    for (const f of order) if (!f.ragdolled) drawShadow(ctx, f, alpha, P);
    const opts = { t, trails: S.motionTrails, light: undefined, rim: null };
    let i = 0;
    for (; i < order.length && rank(order[i]) === 0; i++) this.drawOne(ctx, order[i], alpha, opts, dark, sim, t);
    for (const b of sim.props.boxes) drawBox(ctx, b, alpha, t, P);
    for (const s of sim.props.sticks) drawStick(ctx, s, alpha);
    for (const pr of sim.props.projectiles) drawProjectile(ctx, pr, alpha);
    for (; i < order.length; i++) this.drawOne(ctx, order[i], alpha, opts, dark, sim, t);

    env.drawFront(ctx, sim, view, t);
    fx.draw(ctx, view, t);
    if (L.rain) fx.drawRain(ctx, view);
    if (L.smoke) fx.drawSmoke(ctx, view);
    if (S.debugAI) this.drawDebug(ctx, sim, view);

    // ---------------------------------------------------- screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (L.smoke) {
      ctx.fillStyle = 'rgba(190,190,190,0.1)';
      ctx.fillRect(0, 0, W, H);
    }
    if (cam.slow) {
      ctx.fillStyle = 'rgba(16,24,48,0.07)';
      ctx.fillRect(0, 0, W, H);
      this.drawSpeedLines(ctx, cam, W, H, t);
    }
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${0.18 + cam.letterbox * 0.12})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    if (fx.flash > 0.01) {
      ctx.fillStyle = `rgba(${fx.flashColor},${clamp(fx.flash, 0, 0.8) * (S.screenShake > 0 ? 1 : 0.4)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (cam.letterbox > 0.01) {
      const bh = H * 0.065 * cam.letterbox;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, bh);
      ctx.fillRect(0, H - bh, W, bh);
    }
  }

  drawOne(ctx, f, alpha, opts, dark, sim, t) {
    if (dark) {
      opts.light = this.lightAt(sim, f.x, f.y - 50, t);
      opts.rim = f.isHero ? 'rgba(150,170,210,0.35)' : null;
    }
    drawFighter(ctx, f, alpha, opts);
  }

  lightAt(sim, x, y, t) {
    let best = 0.25;
    for (const l of sim.level.lights) {
      const d = Math.hypot(l.x - x, l.y - y);
      const on = flickerOn(l, t);
      if (!on) continue;
      best = Math.max(best, clamp(1 - d / l.radius, 0, 1) * l.intensity);
    }
    return clamp(best, 0.25, 1);
  }

  drawDarkness(ctx, sim, cam, fx, view, t, W, H) {
    if (!this.light) this.light = document.createElement('canvas');
    const lc = this.light;
    const scale = 0.5;
    const lw = Math.max(1, Math.round(W * scale));
    const lh = Math.max(1, Math.round(H * scale));
    if (lc.width !== lw || lc.height !== lh) {
      lc.width = lw;
      lc.height = lh;
    }
    const g = lc.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, lw, lh);
    g.fillStyle = this.env.P.darkness;
    g.fillRect(0, 0, lw, lh);
    g.globalCompositeOperation = 'destination-out';
    const z = cam.zoom * scale;
    const toS = (wx, wy) => [(wx - cam.x - cam.shakeX) * z + lw / 2, (wy - cam.y - cam.shakeY) * z + lh / 2];
    const cut = (wx, wy, r, k) => {
      const [sx, sy] = toS(wx, wy);
      const sr = r * z;
      if (sx < -sr || sx > lw + sr || sy < -sr || sy > lh + sr) return;
      const rg = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
      rg.addColorStop(0, `rgba(0,0,0,${k})`);
      rg.addColorStop(0.5, `rgba(0,0,0,${k * 0.6})`);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(sx, sy, sr, 0, Math.PI * 2);
      g.fill();
    };
    for (const l of sim.level.lights) {
      if (!flickerOn(l, t)) continue;
      // cone: brighter pool on the floor below the lamp
      cut(l.x, l.y + 120, l.radius * 0.95, 0.9 * l.intensity);
      cut(l.x, l.y, l.radius * 0.45, 0.8);
    }
    for (const fl of fx.lights) cut(fl.x, fl.y, fl.r, (fl.life / fl.max) * 0.95);
    for (const a of fx.arcs) cut(a.f.x, a.f.y - 40, 260, 0.8);
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.drawImage(lc, 0, 0, W, H);
    ctx.restore();
  }

  drawPuddles(ctx, sim, view, alpha) {
    for (const p of sim.level.puddles) {
      if (p.x + p.w < view.x0 || p.x - p.w > view.x1) continue;
      ctx.fillStyle = 'rgba(150,185,215,0.32)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1, p.w / 2, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // faint reflections of anyone standing in it
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1, p.w / 2, 4, 0, 0, Math.PI * 2);
      ctx.rect(p.x - p.w / 2, p.y, p.w, 60);
      ctx.clip();
      ctx.globalAlpha = 0.16;
      for (const f of sim.fighters) {
        if (f.removed || f.ragdolled || Math.abs(f.x - p.x) > p.w / 2 || Math.abs(f.y - p.y) > 3) continue;
        ctx.save();
        ctx.translate(0, 2 * p.y);
        ctx.scale(1, -1);
        drawFighter(ctx, f, alpha, { t: 0, trails: false });
        ctx.restore();
      }
      ctx.restore();
    }
  }

  drawSpeedLines(ctx, cam, W, H, t) {
    const n = 26;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.sin(t * 3 + i) * 0.05;
      const r0 = Math.max(W, H) * (0.42 + 0.06 * Math.sin(t * 7 + i * 1.7));
      const r1 = Math.max(W, H) * 0.8;
      ctx.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0);
      ctx.lineTo(W / 2 + Math.cos(a) * r1, H / 2 + Math.sin(a) * r1);
    }
    ctx.stroke();
  }

  drawDebug(ctx, sim, view) {
    const hero = sim.hero;
    const b = hero.brain;
    ctx.lineWidth = 2;
    if (b && b.anchor) {
      ctx.strokeStyle = 'rgba(0,160,255,0.8)';
      ctx.beginPath();
      ctx.arc(b.anchor.x, b.anchor.y - 4, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (b) {
      for (const tt of b.threats) {
        ctx.strokeStyle = tt.attacking ? (tt.perceived ? 'rgba(255,60,60,0.9)' : 'rgba(255,170,0,0.9)') : 'rgba(120,120,120,0.35)';
        ctx.beginPath();
        ctx.moveTo(hero.x, hero.y - 60);
        ctx.lineTo(tt.e.x, tt.e.y - 60);
        ctx.stroke();
      }
    }
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    for (const f of sim.fighters) {
      if (f.removed || f.dead || f.x < view.x0 || f.x > view.x1) continue;
      const label = f.isHero ? f.state : `${f.brain ? f.brain.mode : ''} ${f.state}`;
      ctx.fillText(label, f.x - 20, f.y - 110 * f.scale);
    }
    ctx.strokeStyle = 'rgba(0,200,120,0.5)';
    for (const l of sim.nav.links) {
      const S = sim.nav.surfaces[l.from];
      const T = sim.nav.surfaces[l.to];
      const x = l.x !== undefined ? l.x : (l.xa + l.xb) / 2;
      ctx.beginPath();
      ctx.moveTo(x, S.y - 4);
      ctx.lineTo(l.x2 !== undefined ? l.x2 : x, T.y - 4);
      ctx.stroke();
    }
  }
}

function rank(f) {
  if (f.ragdolled && f.state !== 'zap' && (f.rag.sleeping || f.state === 'ko' || f.state === 'down')) return 0;
  if (f.isHero) return 3;
  if (f.ragdolled || f.state === 'grabbed') return 1;
  return 2;
}

function flickerOn(l, t) {
  // power failure: lamps sputter, a few stay dead for long stretches
  const k = Math.sin(t * (3 + l.flicker * 9) + l.flicker * 40) + Math.sin(t * 17.3 + l.flicker * 13);
  if (l.flicker > 0.82) return Math.sin(t * 0.7 + l.flicker * 30) > 0.6 && k > -0.4;
  return k > -1.3;
}
