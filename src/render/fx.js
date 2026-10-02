// Visual-only effects. Driven by simulation events and live state; updated
// in (scaled) real time so slow motion stays smooth. Uses its own RNG so the
// simulation remains deterministic.

import { RNG } from '../core/rng.js';
import { HEAD, NECK, PELVIS, NJ } from '../fighter/skeleton.js';

const TAU = Math.PI * 2;
const MAX = 2600;

export class FX {
  constructor() {
    this.rng = new RNG(0xf00d);
    this.ps = [];
    for (let i = 0; i < MAX; i++) this.ps.push({ alive: false });
    this.cursor = 0;
    this.arcs = [];
    this.flash = 0;
    this.flashColor = '255,255,255';
    this.lights = [];
    this.rain = [];
    this.smoke = [];
    this.steamers = new Map();
    this.time = 0;
  }

  reset(sim) {
    for (const p of this.ps) p.alive = false;
    this.arcs.length = 0;
    this.lights.length = 0;
    this.steamers.clear();
    this.flash = 0;
    this.sim = sim;
    this.smoke.length = 0;
    const L = sim.level;
    if (L.smoke) {
      for (let i = 0; i < 26; i++) {
        this.smoke.push({ x: this.rng.range(L.bounds.left, L.bounds.right), y: this.rng.range(L.bounds.top, 0), r: this.rng.range(140, 320), vx: this.rng.range(-14, 14), a: this.rng.range(0.05, 0.12) });
      }
    }
  }

  spawn(o) {
    // ring buffer: reuse the oldest slot when full
    let p = null;
    for (let k = 0; k < 24; k++) {
      const c = this.ps[this.cursor];
      this.cursor = (this.cursor + 1) % MAX;
      if (!c.alive) {
        p = c;
        break;
      }
    }
    if (!p) {
      p = this.ps[this.cursor];
      this.cursor = (this.cursor + 1) % MAX;
    }
    p.alive = true;
    p.type = o.type;
    p.x = o.x;
    p.y = o.y;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.life = p.max = o.life || 0.5;
    p.size = o.size || 3;
    p.grow = o.grow || 0;
    p.rot = o.rot || 0;
    p.vr = o.vr || 0;
    p.color = o.color || '255,255,255';
    p.g = o.g || 0;
    p.drag = o.drag || 0;
    p.floor = o.floor !== undefined ? o.floor : null;
    p.alpha = o.alpha !== undefined ? o.alpha : 1;
    p.add = !!o.add;
    return p;
  }

  burst(type, x, y, n, opt) {
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      const a = opt.ang !== undefined ? opt.ang + r.range(-opt.spread, opt.spread) : r.range(0, TAU);
      const sp = r.range(opt.speed[0], opt.speed[1]);
      this.spawn({
        type,
        x: x + r.range(-(opt.jx || 0), opt.jx || 0),
        y: y + r.range(-(opt.jy || 0), opt.jy || 0),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: r.range(opt.life[0], opt.life[1]),
        size: r.range(opt.size[0], opt.size[1]),
        grow: opt.grow,
        rot: r.range(0, TAU),
        vr: r.range(-12, 12),
        color: opt.color,
        g: opt.g,
        drag: opt.drag,
        floor: opt.floor,
        alpha: opt.alpha,
        add: opt.add,
      });
    }
  }

  // -------------------------------------------------------------- events
  handle(e, sim, settings) {
    const r = this.rng;
    switch (e.t) {
      case 'hit': {
        const pw = Math.min(2, e.power || 0.5);
        if (e.kind === 'block') {
          this.burst('spark', e.x, e.y, 6 + pw * 6, { speed: [120, 380], life: [0.08, 0.22], size: [1.2, 2.2], color: '200,225,255', g: 600, drag: 2, add: true });
          this.spawn({ type: 'ring', x: e.x, y: e.y, life: 0.18, size: 6, grow: 140, color: '210,230,255', alpha: 0.7 });
        } else if (e.kind === 'parry') {
          this.burst('spark', e.x, e.y, 16, { speed: [200, 520], life: [0.1, 0.3], size: [1.5, 2.6], color: '255,240,190', g: 500, drag: 2, add: true });
          this.spawn({ type: 'flash', x: e.x, y: e.y, life: 0.12, size: 34, color: '255,250,230', add: true });
        } else {
          const metal = e.weapon === 'pipe' || e.weapon === 'crowbar';
          this.spawn({ type: 'flash', x: e.x, y: e.y, life: 0.07 + pw * 0.03, size: 14 + pw * 16, color: '255,255,255', add: true });
          this.spawn({ type: 'streaks', x: e.x, y: e.y, life: 0.11, size: 16 + pw * 18, rot: r.range(0, TAU), color: '255,255,255', alpha: 0.95 });
          if (metal) this.burst('spark', e.x, e.y, 8, { speed: [160, 460], life: [0.1, 0.3], size: [1.2, 2.2], color: '255,220,140', g: 700, drag: 1.5, add: true });
          if (e.down && pw > 0.8) this.spawn({ type: 'ring', x: e.x, y: e.y, life: 0.22, size: 8, grow: 220, color: '255,255,255', alpha: 0.55 });
          if (pw > 1.1) this.flashScreen(0.08, '255,255,255');
        }
        break;
      }
      case 'thud': {
        const pw = Math.min(1.6, e.power || 0.5);
        if (e.wall) {
          this.burst('chip', e.x, e.y, 6, { speed: [80, 260], life: [0.4, 0.9], size: [1.5, 3], color: '150,150,150', g: 1500, floor: e.y + 50 });
        }
        this.burst('dust', e.x, e.y, 3 + Math.round(pw * 5), { speed: [30, 120 * pw + 40], life: [0.35, 0.8], size: [6, 12], grow: 30, color: '190,186,180', drag: 3, alpha: 0.5, jx: 10, jy: 4 });
        break;
      }
      case 'land': {
        const pw = Math.min(1.5, e.power || 0.5);
        if (pw < 0.5) break;
        for (const dir of [-1, 1]) this.burst('dust', e.x + dir * 10, e.y - 3, 3, { ang: dir > 0 ? -0.15 : Math.PI + 0.15, spread: 0.3, speed: [40, 140 * pw], life: [0.3, 0.6], size: [5, 9], grow: 26, color: '200,196,190', drag: 4, alpha: 0.45 });
        break;
      }
      case 'step':
        if ((e.power || 0) > 0.7 && r.chance(0.5)) this.burst('dust', e.x, e.y - 2, 1, { speed: [10, 40], life: [0.25, 0.45], size: [3, 6], grow: 14, color: '200,196,190', drag: 4, alpha: 0.35 });
        break;
      case 'trip':
        this.burst('dust', e.x, e.y - 4, 5, { speed: [30, 120], life: [0.3, 0.7], size: [5, 10], grow: 24, color: '200,196,190', drag: 3, alpha: 0.45 });
        break;
      case 'break': {
        const pw = Math.min(1.6, e.power || 0.6);
        if (e.material === 'glass') {
          this.burst('shard', e.x, e.y, e.small ? 8 : 26 + pw * 10, { speed: [80, 420], life: [0.6, 1.4], size: [2, 6], color: '200,230,250', g: 1400, floor: this.floorBelow(sim, e.x, e.y), jx: e.small ? 3 : 10, jy: e.small ? 3 : 60 });
          if (!e.small) this.flashScreen(0.05, '230,245,255');
        } else if (e.material === 'wood' || e.material === 'cardboard') {
          const col = e.material === 'wood' ? '190,140,80' : '200,170,120';
          this.burst('chip', e.x, e.y, e.small ? 6 : 18, { speed: [90, 360], life: [0.6, 1.4], size: [2, 5], color: col, g: 1500, floor: this.floorBelow(sim, e.x, e.y), jx: (e.w || 20) / 2, jy: (e.h || 20) / 2 });
          this.burst('dust', e.x, e.y, 6, { speed: [20, 90], life: [0.4, 0.9], size: [8, 16], grow: 26, color: '210,190,160', drag: 3, alpha: 0.4 });
        } else {
          this.burst('spark', e.x, e.y, 10, { speed: [100, 380], life: [0.1, 0.3], size: [1.2, 2.2], color: '255,220,140', g: 800, drag: 1.5, add: true });
        }
        break;
      }
      case 'clatter':
        if (e.material === 'metal' && (e.power || 0) > 0.5) this.burst('spark', e.x, e.y, 4, { speed: [60, 240], life: [0.08, 0.2], size: [1, 2], color: '255,220,150', g: 800, add: true });
        break;
      case 'zap': {
        this.burst('spark', e.x, e.y, e.floor ? 10 : 24, { speed: [140, 520], life: [0.12, 0.4], size: [1.2, 2.4], color: '220,240,255', g: 500, drag: 1.5, add: true });
        if (e.f) this.arcs.push({ hz: e.hz, f: e.f, until: this.time + (e.floor ? 0.45 : 0.9), floor: !!e.floor, x: e.x, y: e.y });
        this.flashScreen(e.floor ? 0.05 : 0.12, '220,235,255');
        this.lights.push({ x: e.x, y: e.y, r: 320, life: 0.6, max: 0.6, color: '200,225,255' });
        break;
      }
      case 'sparks':
        this.burst('spark', e.x, e.y, 5, { speed: [60, 220], life: [0.08, 0.25], size: [1, 2], color: '230,240,255', g: 600, add: true });
        break;
      case 'explosion': {
        const R = e.R || 220;
        this.spawn({ type: 'flash', x: e.x, y: e.y, life: 0.22, size: R * 0.9, color: '255,240,200', add: true });
        this.spawn({ type: 'ring', x: e.x, y: e.y, life: 0.35, size: 20, grow: R * 3.2, color: '255,230,190', alpha: 0.7 });
        this.burst('fire', e.x, e.y, 26, { speed: [60, 480], life: [0.25, 0.6], size: [10, 24], grow: -16, color: '255,120,30', g: -220, drag: 3.2 });
        this.burst('fire', e.x, e.y, 10, { speed: [20, 200], life: [0.12, 0.3], size: [14, 26], grow: -30, color: '255,236,170', g: -100, drag: 3, add: true });
        this.burst('smoke', e.x, e.y, 20, { speed: [30, 200], life: [1.2, 2.6], size: [16, 30], grow: 38, color: '58,54,52', g: -60, drag: 1.6, alpha: 0.6 });
        this.burst('chip', e.x, e.y, 20, { speed: [200, 700], life: [0.6, 1.4], size: [2, 4], color: '60,55,50', g: 1500, floor: this.floorBelow(sim, e.x, e.y) });
        this.flashScreen(0.45, '255,236,200');
        this.lights.push({ x: e.x, y: e.y, r: R * 2.4, life: 0.9, max: 0.9, color: '255,180,90' });
        break;
      }
      case 'steam':
        if (e.on) this.steamers.set(e.x * 7 + e.y, e);
        else this.steamers.delete(e.x * 7 + e.y);
        break;
      case 'vent':
        this.burst('dust', e.x, e.y + 10, 8, { speed: [20, 120], life: [0.5, 1.0], size: [6, 12], grow: 20, color: '170,170,170', g: 100, drag: 2, alpha: 0.5 });
        break;
      case 'pickup':
        this.spawn({ type: 'flash', x: e.x, y: e.y, life: 0.15, size: 10, color: '255,255,230', add: true });
        break;
      case 'heroDefeated':
        this.flashScreen(0.25, '255,255,255');
        break;
    }
    void settings;
  }

  floorBelow(sim, x, y) {
    const g = sim.level.groundUnder(x - 2, x + 2, y, 600, true, false);
    return g ? g.y : y + 400;
  }

  flashScreen(a, color) {
    if (a > this.flash) {
      this.flash = a;
      this.flashColor = color;
    }
  }

  // --------------------------------------------------------------- update
  update(dt, sim, view, settings) {
    this.time += dt;
    const r = this.rng;
    for (const p of this.ps) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size = Math.max(0.2, p.size + p.grow * dt);
      if (p.floor !== null && p.y > p.floor) {
        p.y = p.floor;
        p.vy *= -0.3;
        p.vx *= 0.5;
        p.vr *= 0.5;
      }
    }
    this.flash = Math.max(0, this.flash - dt * 2.2);
    for (let i = this.lights.length - 1; i >= 0; i--) {
      this.lights[i].life -= dt;
      if (this.lights[i].life <= 0) this.lights.splice(i, 1);
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) if (this.time > this.arcs[i].until || this.arcs[i].f.removed) this.arcs.splice(i, 1);
    // live emitters
    for (const e of this.steamers.values()) {
      for (let k = 0; k < 3; k++) {
        this.spawn({ type: 'steam', x: e.x + e.dir * 16, y: e.y + r.range(-6, 6), vx: e.dir * r.range(260, 520), vy: r.range(-60, 20), life: r.range(0.35, 0.7), size: r.range(6, 10), grow: 70, color: '245,245,245', drag: 2.2, alpha: 0.55 });
      }
    }
    for (const b of sim.props.boxes) {
      if (b.fuse < 0) continue;
      const [cx, cy] = b.center();
      if (r.chance(0.7)) this.spawn({ type: 'spark', x: cx, y: cy - b.h / 2 - 4, vx: r.range(-80, 80), vy: r.range(-260, -80), life: r.range(0.1, 0.25), size: 1.5, color: '255,210,120', g: 600, add: true });
    }
    for (const f of sim.fighters) {
      if (f.state !== 'zap' || f.removed) continue;
      if (r.chance(0.6)) {
        const p = f.rag.p[r.int(0, NJ - 1)];
        this.spawn({ type: 'spark', x: p.x, y: p.y, vx: r.range(-200, 200), vy: r.range(-260, 60), life: r.range(0.06, 0.18), size: 1.4, color: '210,235,255', g: 400, add: true });
      }
    }
    // wind debris & rain
    const L = sim.level;
    if (L.wind && r.chance(dt * 6)) {
      const side = sim.windNow > 0 ? view.x0 - 20 : view.x1 + 20;
      this.spawn({ type: 'leaf', x: side, y: r.range(view.y0, view.y1), vx: sim.windNow * r.range(2.5, 4.5), vy: r.range(-40, 40), life: 4, size: r.range(2.5, 4.5), vr: r.range(-8, 8), color: r.pick(['200,190,170', '235,235,230', '160,150,120']), g: 40 });
    }
    if (L.rain) this.updateRain(dt, view, sim);
    for (const s of this.smoke) {
      s.x += (s.vx + (sim.windNow || 0) * 0.2) * dt;
      if (s.x > L.bounds.right + 400) s.x = L.bounds.left - 300;
      if (s.x < L.bounds.left - 400) s.x = L.bounds.right + 300;
    }
    void settings;
  }

  updateRain(dt, view, sim) {
    const r = this.rng;
    const want = 220;
    while (this.rain.length < want) this.rain.push({ x: r.range(view.x0 - 200, view.x1 + 200), y: r.range(view.y0 - 400, view.y1), v: r.range(900, 1300) });
    const drift = (sim.windNow || 0) * 0.6 - 90;
    for (const d of this.rain) {
      d.y += d.v * dt;
      d.x += drift * dt;
      if (d.y > view.y1 + 20 || d.x < view.x0 - 300 || d.x > view.x1 + 300) {
        d.x = r.range(view.x0 - 200, view.x1 + 200);
        d.y = view.y0 - r.range(0, 300);
        if (r.chance(0.3)) {
          const g = sim.level.groundUnder(d.x - 1, d.x + 1, view.y0, 2000, true, false);
          if (g && g.y < view.y1) this.spawn({ type: 'drop', x: d.x, y: g.y - 1, vx: r.range(-40, 40), vy: r.range(-140, -60), life: 0.25, size: 1.5, color: '210,225,240', g: 900 });
        }
      }
    }
  }

  // ----------------------------------------------------------------- draw
  draw(ctx, view, t) {
    // normal blend first
    for (const p of this.ps) {
      if (!p.alive || p.add) continue;
      if (p.x < view.x0 - 100 || p.x > view.x1 + 100 || p.y < view.y0 - 100 || p.y > view.y1 + 100) continue;
      const k = p.life / p.max;
      drawParticle(ctx, p, k);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.ps) {
      if (!p.alive || !p.add) continue;
      if (p.x < view.x0 - 200 || p.x > view.x1 + 200 || p.y < view.y0 - 200 || p.y > view.y1 + 200) continue;
      drawParticle(ctx, p, p.life / p.max);
    }
    this.drawArcs(ctx, t);
    ctx.restore();
  }

  drawArcs(ctx, t) {
    const r = this.rng;
    for (const a of this.arcs) {
      const f = a.f;
      const hz = a.hz;
      if (!hz) continue;
      const sx = a.floor ? f.x : hz.x;
      const sy = a.floor ? hz.y - 4 : hz.y - hz.h * 0.6;
      const tgt = f.rag.p[r.chance(0.5) ? PELVIS : r.chance(0.5) ? NECK : HEAD];
      for (let k = 0; k < 2; k++) {
        ctx.strokeStyle = k ? 'rgba(255,255,255,0.95)' : 'rgba(140,190,255,0.55)';
        ctx.lineWidth = k ? 1.6 : 5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        const n = 7;
        for (let i = 1; i < n; i++) {
          const u = i / n;
          ctx.lineTo(sx + (tgt.x - sx) * u + r.range(-14, 14), sy + (tgt.y - sy) * u + r.range(-14, 14));
        }
        ctx.lineTo(tgt.x, tgt.y);
        ctx.stroke();
      }
    }
    void t;
  }

  drawRain(ctx, view) {
    ctx.strokeStyle = 'rgba(200,215,235,0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const d of this.rain) {
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 6, d.y - 26);
    }
    ctx.stroke();
    void view;
  }

  drawSmoke(ctx, view) {
    for (const s of this.smoke) {
      if (s.x + s.r < view.x0 || s.x - s.r > view.x1) continue;
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      g.addColorStop(0, `rgba(150,150,150,${s.a})`);
      g.addColorStop(1, 'rgba(150,150,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    }
  }
}

function drawParticle(ctx, p, k) {
  const a = p.alpha * Math.min(1, k * 1.5);
  switch (p.type) {
    case 'spark': {
      ctx.strokeStyle = `rgba(${p.color},${a})`;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
      ctx.stroke();
      break;
    }
    case 'dust':
    case 'smoke':
    case 'steam': {
      ctx.fillStyle = `rgba(${p.color},${p.alpha * k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
      break;
    }
    case 'fire': {
      const col = p.add ? p.color : k > 0.7 ? '255,214,90' : k > 0.4 ? p.color : '170,50,20';
      ctx.fillStyle = `rgba(${col},${a * 0.9})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, p.size), 0, TAU);
      ctx.fill();
      break;
    }
    case 'chip':
    case 'leaf': {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = `rgba(${p.color},${Math.min(1, k * 3)})`;
      ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9);
      ctx.restore();
      break;
    }
    case 'shard': {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = `rgba(${p.color},${Math.min(0.9, k * 2)})`;
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.lineTo(p.size * 0.7, p.size * 0.6);
      ctx.lineTo(-p.size * 0.6, p.size * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'drop': {
      ctx.fillStyle = `rgba(${p.color},${a})`;
      ctx.fillRect(p.x, p.y, 1.6, 1.6);
      break;
    }
    case 'flash': {
      const s = p.size * (1.1 - k * 0.3);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s);
      g.addColorStop(0, `rgba(${p.color},${0.95 * k})`);
      g.addColorStop(0.35, `rgba(${p.color},${0.45 * k})`);
      g.addColorStop(1, `rgba(${p.color},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, TAU);
      ctx.fill();
      break;
    }
    case 'streaks': {
      ctx.strokeStyle = `rgba(${p.color},${p.alpha * k})`;
      ctx.lineCap = 'round';
      ctx.lineWidth = 2.6;
      const r0 = p.size * (0.55 + (1 - k) * 0.5);
      const r1 = p.size * (1.0 + (1 - k) * 0.9);
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const ang = p.rot + (i / 7) * TAU;
        ctx.moveTo(p.x + Math.cos(ang) * r0, p.y + Math.sin(ang) * r0);
        ctx.lineTo(p.x + Math.cos(ang) * r1, p.y + Math.sin(ang) * r1);
      }
      ctx.stroke();
      break;
    }
    case 'ring': {
      ctx.strokeStyle = `rgba(${p.color},${p.alpha * k})`;
      ctx.lineWidth = 2 + 3 * k;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.stroke();
      break;
    }
  }
}
