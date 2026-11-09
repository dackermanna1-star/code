// Particle systems (blood, sparks, smoke, fire, confetti...) and persistent decals.
// Blood droplets are ray-cast against the physics world each frame; on hit they leave
// a decal on the surface (in the hit body's local frame, so blood rides on moving objects).

import { PHYS } from '../config.js';
import { rand, clamp, pick } from './math.js';

const BLOOD = ['#8a0303', '#a40808', '#6e0000', '#b5120f', '#7c0a0a'];
const MAX_P = 2600;
const MAX_STICKY = 420;
const MAX_DECALS = 1800;
const MAX_BODY_DECALS = 26;

export class Particles {
  constructor(game) {
    this.game = game;
    this.ps = [];
    this.sticky = 0;
    this.decals = []; // static-world decals
    this.bodyDecals = new Map(); // body -> decal[]
  }

  get bloodOn() {
    return this.game.settings.blood !== false;
  }

  clear() {
    this.ps.length = 0;
    this.sticky = 0;
    this.decals.length = 0;
    this.bodyDecals.clear();
  }

  add(p) {
    if (this.ps.length >= MAX_P) return;
    p.life0 = p.life;
    this.ps.push(p);
  }

  blood(x, y, vx, vy, n = 10, speed = 3, spread = Math.PI * 2, dir = 0) {
    if (!this.bloodOn) return;
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const v = speed * rand(0.3, 1.2);
      const sticky = this.sticky < MAX_STICKY;
      if (sticky) this.sticky++;
      this.add({
        type: 'blood',
        x: x + rand(-0.03, 0.03),
        y: y + rand(-0.03, 0.03),
        vx: vx + Math.cos(a) * v,
        vy: vy + Math.sin(a) * v,
        life: rand(1.2, 2.6),
        size: rand(0.025, 0.065),
        color: pick(BLOOD),
        g: 1,
        drag: 0.4,
        sticky,
      });
    }
  }

  /** Big gory burst used for dismemberment & gibbing. */
  gore(x, y, vx, vy, scale = 1) {
    this.blood(x, y, vx, vy, Math.round(40 * scale), 5 * scale);
    if (!this.bloodOn) return;
    for (let i = 0; i < 5 * scale; i++) {
      this.add({
        type: 'mist',
        x,
        y,
        vx: vx * 0.3 + rand(-2, 2),
        vy: vy * 0.3 + rand(-1, 2),
        life: rand(0.5, 1.1),
        size: rand(0.1, 0.25) * scale,
        grow: 0.6,
        color: pick(BLOOD),
        g: 0.08,
        drag: 2,
      });
    }
  }

  sparks(x, y, n = 10, speed = 6, dir = 0, spread = Math.PI * 2, color) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const v = speed * rand(0.3, 1.1);
      this.add({
        type: 'spark',
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rand(0.15, 0.5),
        size: rand(0.02, 0.05),
        color: color || pick(['#fff6a0', '#ffd34d', '#ffae33']),
        g: 0.6,
        drag: 1,
      });
    }
  }

  smoke(x, y, n = 6, size = 0.5, color = '#555', vy = 1) {
    for (let i = 0; i < n; i++) {
      this.add({
        type: 'smoke',
        x: x + rand(-0.2, 0.2) * size,
        y: y + rand(-0.2, 0.2) * size,
        vx: rand(-1, 1) * size,
        vy: vy * rand(0.5, 1.5),
        life: rand(0.8, 2.0),
        size: size * rand(0.5, 1),
        grow: size * 0.9,
        color,
        g: -0.02,
        drag: 1.2,
        rot: rand(0, 6),
      });
    }
  }

  dust(x, y, vx, vy, n = 2, color = '#b49a74') {
    for (let i = 0; i < n; i++) {
      this.add({
        type: 'smoke',
        x,
        y,
        vx: vx + rand(-0.6, 0.6),
        vy: vy + rand(0.2, 1),
        life: rand(0.3, 0.7),
        size: rand(0.08, 0.18),
        grow: 0.5,
        color,
        g: 0,
        drag: 3,
        alpha: 0.5,
      });
    }
  }

  fire(x, y, n = 4, size = 0.3, vx = 0, vy = 0) {
    for (let i = 0; i < n; i++) {
      this.add({
        type: 'fire',
        x: x + rand(-0.05, 0.05),
        y: y + rand(-0.05, 0.05),
        vx: vx + rand(-0.6, 0.6),
        vy: vy + rand(0.2, 1.5),
        life: rand(0.2, 0.5),
        size: size * rand(0.6, 1.2),
        grow: -size * 0.8,
        color: pick(['#ffef9a', '#ffc041', '#ff7a1a', '#ff4d12']),
        g: -0.15,
        drag: 2,
      });
    }
  }

  spray(x, y, dirAngle, n, speed, color, size = 0.06, spread = 0.35) {
    for (let i = 0; i < n; i++) {
      const a = dirAngle + (Math.random() - 0.5) * spread;
      const v = speed * rand(0.6, 1.2);
      this.add({
        type: 'smoke',
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rand(0.25, 0.6),
        size,
        grow: size * 5,
        color,
        g: 0.05,
        drag: 3,
        alpha: 0.85,
      });
    }
  }

  explosion(x, y, size = 1) {
    // flash
    this.add({ type: 'flash', x, y, vx: 0, vy: 0, life: 0.18, size: 4 * size, color: '#fff3c4', g: 0, drag: 0 });
    for (let i = 0; i < 26 * size; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(1, 7) * size;
      this.add({
        type: 'fire',
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v + 1,
        life: rand(0.3, 0.8),
        size: rand(0.3, 0.8) * size,
        grow: 0.6,
        color: pick(['#fff1b0', '#ffd24a', '#ff8c1a', '#ff5214', '#e8380c']),
        g: -0.1,
        drag: 3,
      });
    }
    this.smoke(x, y + 0.3, Math.round(16 * size), 1.1 * size, '#3b3b3b', 2.2);
    this.sparks(x, y, Math.round(30 * size), 14 * size);
    for (let i = 0; i < 12 * size; i++) {
      const a = rand(0.2, Math.PI - 0.2);
      const v = rand(4, 12) * size;
      this.add({
        type: 'chip',
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rand(0.8, 1.6),
        size: rand(0.04, 0.1),
        color: pick(['#3a2a1a', '#5a4632', '#2b2b2b']),
        g: 1,
        drag: 0.3,
        rot: rand(0, 6),
        vr: rand(-15, 15),
      });
    }
  }

  chips(x, y, n, colors, speed = 4, size = 0.06) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const v = speed * rand(0.3, 1);
      this.add({
        type: 'chip',
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v + 1,
        life: rand(0.6, 1.4),
        size: size * rand(0.6, 1.3),
        color: pick(colors),
        g: 1,
        drag: 0.3,
        rot: rand(0, 6),
        vr: rand(-15, 15),
      });
    }
  }

  confetti(x, y, n = 80) {
    const cols = ['#ff4d6d', '#ffd23f', '#3bceac', '#4361ee', '#f72585', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 0.15, Math.PI * 0.85);
      const v = rand(5, 13);
      this.add({
        type: 'confetti',
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rand(2, 3.5),
        size: rand(0.06, 0.12),
        color: pick(cols),
        g: 0.25,
        drag: 1.6,
        rot: rand(0, 6),
        vr: rand(-12, 12),
      });
    }
  }

  ring(x, y, color = '#ffffff', size = 1.5) {
    this.add({ type: 'ring', x, y, vx: 0, vy: 0, life: 0.35, size, color, g: 0, drag: 0 });
  }

  addDecal(body, x, y, nx, ny, r, color) {
    if (!this.bloodOn) return;
    if (body && body.isStatic()) {
      if (this.decals.length >= MAX_DECALS) this.decals.shift();
      this.decals.push({ x, y, a: Math.atan2(ny, nx), r, color, seed: Math.random() });
      return;
    }
    if (!body) return;
    let list = this.bodyDecals.get(body);
    if (!list) {
      list = [];
      this.bodyDecals.set(body, list);
    }
    if (list.length >= MAX_BODY_DECALS) list.shift();
    const lp = body.getLocalPoint({ x, y });
    const la = Math.atan2(ny, nx) - body.getAngle();
    list.push({ x: lp.x, y: lp.y, a: la, r, color, seed: Math.random() });
  }

  /** Smear blood onto a body at a local point (used for wounds). */
  stain(body, lx, ly, r) {
    if (!this.bloodOn || !body) return;
    let list = this.bodyDecals.get(body);
    if (!list) {
      list = [];
      this.bodyDecals.set(body, list);
    }
    if (list.length >= MAX_BODY_DECALS) list.shift();
    list.push({ x: lx, y: ly, a: rand(0, 6.28), r, color: pick(BLOOD), seed: Math.random(), round: true });
  }

  update(dt) {
    const g = PHYS.gravity;
    const phys = this.game.phys;
    const ps = this.ps;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.sticky) this.sticky--;
        continue;
      }
      const ox = p.x;
      const oy = p.y;
      p.vy += g * p.g * dt;
      const d = 1 - Math.min(1, p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.vr) p.rot += p.vr * dt;
      if (p.grow) p.size = Math.max(0.005, p.size + p.grow * dt);
      if (p.sticky && phys) {
        const hit = phys.rayCast(ox, oy, p.x, p.y, (f) => !f.isSensor() && !(f.getUserData() && f.getUserData().noBlood));
        if (hit) {
          this.addDecal(hit.body, hit.x, hit.y, hit.nx, hit.ny, p.size * rand(1.4, 2.6), p.color);
          this.sticky--;
          continue;
        }
      }
      if (p.y < -400) {
        if (p.sticky) this.sticky--;
        continue;
      }
      ps[w++] = p;
    }
    ps.length = w;

    // forget decals on destroyed bodies
    if (this.bodyDecals.size > 0 && Math.random() < 0.05) {
      for (const b of this.bodyDecals.keys()) if (b._gone) this.bodyDecals.delete(b);
    }
  }

  drawDecal(ctx, d) {
    ctx.fillStyle = d.color;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.a);
    ctx.beginPath();
    if (d.round) {
      ctx.arc(0, 0, d.r, 0, Math.PI * 2);
    } else {
      ctx.ellipse(0, 0, d.r * 0.45, d.r * 1.35, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    if (d.seed > 0.5) {
      ctx.beginPath();
      ctx.arc(d.r * 0.2, d.r * (d.seed - 0.5) * 3.2, d.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawStaticDecals(ctx, view) {
    for (const d of this.decals) {
      if (d.x < view.x0 - 1 || d.x > view.x1 + 1 || d.y < view.y0 - 1 || d.y > view.y1 + 1) continue;
      this.drawDecal(ctx, d);
    }
  }

  /** Draw decals for a body; ctx must already be in the body's local frame. */
  drawBodyDecals(ctx, body) {
    const list = this.bodyDecals.get(body);
    if (!list) return;
    for (const d of list) this.drawDecal(ctx, d);
  }

  draw(ctx, view) {
    for (const p of this.ps) {
      if (p.x < view.x0 - 2 || p.x > view.x1 + 2 || p.y < view.y0 - 2 || p.y > view.y1 + 2) continue;
      const t = p.life / p.life0;
      switch (p.type) {
        case 'blood':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'mist':
          ctx.globalAlpha = t * 0.3;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        case 'spark': {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.globalAlpha = clamp(t * 1.5, 0, 1);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'smoke':
          ctx.globalAlpha = t * (p.alpha || 0.55);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        case 'fire':
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = clamp(t, 0, 1) * 0.9;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.01, p.size), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          break;
        case 'flash': {
          ctx.globalCompositeOperation = 'lighter';
          const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          gr.addColorStop(0, `rgba(255,245,200,${0.9 * t})`);
          gr.addColorStop(1, 'rgba(255,160,40,0)');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'ring':
          ctx.globalAlpha = t;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 0.08;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.2 - t), 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        case 'chip':
        case 'confetti':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = clamp(t * 3, 0, 1);
          ctx.fillStyle = p.color;
          if (p.type === 'confetti') ctx.fillRect(-p.size, -p.size * 0.5 * Math.abs(Math.cos(p.rot * 2)), p.size * 2, p.size);
          else ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
          ctx.restore();
          ctx.globalAlpha = 1;
          break;
        default:
          break;
      }
    }
  }
}
