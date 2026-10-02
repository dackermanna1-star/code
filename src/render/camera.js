// Cinematic camera. "Director" mode frames the hero plus whatever matters
// around him, widens for crowds, tightens for duels, and triggers slow motion
// and punch-ins for spectacular moments (with cooldowns so it stays special).

import { clamp, smoothDamp, noise1, lerp } from '../core/math.js';
import { PELVIS } from '../fighter/skeleton.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.viewW = 1000; // world units across the screen
    this.zoom = 1;
    this.sx = { v: 0 };
    this.sy = { v: 0 };
    this.sw = { v: 0 };
    this.trauma = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.rot = 0;
    this.mode = 'director';
    this.time = 0;
    this.slow = null; // { t, hold, scale, x, y, punch }
    this.slowCooldown = 0;
    this.timeScale = 1;
    this.letterbox = 0;
    this.punch = 0;
    this.focusX = 0;
    this.focusY = 0;
    this.free = { x: 0, y: 0, w: 1400, active: false };
    this.endT = 0;
    this.idleT = 0;
    this.cut = null; // { x, y, t } cutaway to a brawl elsewhere
    this.cutCooldown = 8;
  }

  reset(sim, W, H) {
    const h = sim.hero;
    this.x = h.x;
    this.y = h.y - 120;
    this.viewW = 1100;
    this.sx.v = this.sy.v = this.sw.v = 0;
    this.trauma = 0;
    this.slow = null;
    this.slowCooldown = 3;
    this.timeScale = 1;
    this.letterbox = 0;
    this.endT = 0;
    this.free.x = this.x;
    this.free.y = this.y;
    this.update(0, sim, W, H, 1, {});
  }

  addTrauma(a, settings) {
    const k = settings ? settings.screenShake : 1;
    this.trauma = clamp(this.trauma + a * k, 0, 1);
  }

  // Ask for a slow-motion beat. score: how spectacular (5..20).
  requestSlowmo(score, x, y, settings, force) {
    const freq = settings ? settings.slowMo : 1;
    if (!force && (freq <= 0 || this.slowCooldown > 0 || score < 7 / Math.max(0.35, freq))) return false;
    const dur = clamp(0.45 + score * 0.04, 0.5, 1.3);
    this.slow = { t: 0, hold: dur, scale: clamp(0.32 - score * 0.006, 0.16, 0.3), x, y, punch: clamp(0.12 + score * 0.01, 0.12, 0.3) };
    this.slowCooldown = force ? 0 : 5 / Math.max(0.35, freq);
    return true;
  }

  onEvent(e, sim, settings) {
    switch (e.t) {
      case 'hit':
        if (e.a && e.a.isHero) {
          this.addTrauma(e.down ? 0.2 + Math.min(0.25, (e.power || 0) * 0.1) + (e.b && e.b.dead ? 0.12 : 0) : 0.08, settings);
          if (e.b && e.b.dead && (e.power || 0) > 1.15) this.requestSlowmo(7.5, e.x, e.y, settings);
        } else if (e.b && e.b.isHero) this.addTrauma(e.power > 1.2 ? 0.22 : 0.13, settings);
        else if (e.down) this.addTrauma(0.05, settings);
        break;
      case 'thud':
        if ((e.power || 0) > 1.3 && e.f && e.f.knock && e.f.knock.by && e.f.knock.by.isHero) this.addTrauma(0.3, settings);
        else if ((e.power || 0) > 0.9) this.addTrauma(0.06 * e.power, settings);
        break;
      case 'explosion':
        this.addTrauma(0.75, settings);
        this.requestSlowmo(16, e.x, e.y, settings);
        break;
      case 'zap':
        if (!e.floor) {
          this.addTrauma(0.25, settings);
          this.requestSlowmo(9, e.x, e.y, settings);
        }
        break;
      case 'break':
        if (e.material === 'glass' && !e.small) {
          this.addTrauma(0.2, settings);
          this.requestSlowmo(9, e.x, e.y, settings);
        }
        break;
      case 'chain':
        if (e.count >= 2) this.requestSlowmo(6 + e.count * 2.5, e.x, e.y, settings);
        break;
      case 'throw':
        if (e.move === 'spinthrow' || e.move === 'reversal' || e.move === 'suplex' || e.move === 'powerbomb') this.requestSlowmo(9, e.x, e.y, settings);
        break;

      case 'parry':
        this.requestSlowmo(7.5, e.x, e.y, settings);
        break;
      case 'ko':
        if (e.cause === 'window' || e.cause === 'fell') this.requestSlowmo(8, e.x, e.y, settings);
        break;
      case 'heroDefeated':
        this.requestSlowmo(20, e.x, e.y, settings, true);
        if (this.slow) {
          this.slow.hold = 2.4;
          this.slow.scale = 0.18;
        }
        break;
      case 'spectacle':
        this.requestSlowmo(e.score, e.x, e.y, settings);
        break;
    }
  }

  // dt is real (unscaled) time.
  update(dt, sim, W, H, alpha, settings) {
    this.time += dt;
    const aspect = W / Math.max(1, H);
    if (this.slowCooldown > 0) this.slowCooldown -= dt;
    // slow-motion envelope
    let ts = 1;
    let punch = 0;
    if (this.slow) {
      const s = this.slow;
      s.t += dt;
      const inT = 0.09;
      const outT = 0.4;
      if (s.t < inT) ts = lerp(1, s.scale, s.t / inT);
      else if (s.t < inT + s.hold) ts = s.scale;
      else if (s.t < inT + s.hold + outT) ts = lerp(s.scale, 1, (s.t - inT - s.hold) / outT);
      else this.slow = null;
      const env = s.t < inT + s.hold ? Math.min(1, s.t / 0.15) : Math.max(0, 1 - (s.t - inT - s.hold) / outT);
      punch = s.punch * env;
      this.focusX = s.x;
      this.focusY = s.y;
    }
    if (sim.over && !sim.over.victory) {
      this.endT += dt;
      if (!this.slow) ts = Math.min(ts, clamp(0.35 + this.endT * 0.25, 0.35, 1));
    }
    this.timeScale = ts;
    this.punch = punch;
    this.letterbox += ((this.slow ? 1 : sim.over ? 1 : 0) - this.letterbox) * Math.min(1, dt * 5);

    // framing target
    const hero = sim.hero;
    const hp = hero.rag.p[PELVIS];
    const hx = hp.ox + (hp.x - hp.ox) * alpha;
    const hy = hp.oy + (hp.y - hp.oy) * alpha;
    let tx = hx;
    let ty = hy - 60;
    let tw = 950;
    const L = sim.level;
    if (this.mode === 'wide') {
      tx = (L.bounds.left + L.bounds.right) / 2;
      ty = (L.bounds.top + L.bounds.bottom) / 2;
      tw = Math.max(L.bounds.right - L.bounds.left, (L.bounds.bottom - L.bounds.top) * aspect) * 1.02;
    } else if (this.mode === 'follow') {
      tw = 1150;
    } else if (this.mode === 'free') {
      tx = this.free.x;
      ty = this.free.y;
      tw = this.free.w;
    } else {
      // director: bounding box of the hero and the action around him
      let x0 = hx - 90;
      let x1 = hx + 90;
      let y0 = hy - 150;
      let y1 = hy + 50;
      let engaged = 0;
      for (const f of sim.fighters) {
        if (f === hero || f.removed) continue;
        const p = f.rag.p[PELVIS];
        const dx = Math.abs(p.x - hx);
        const dy = Math.abs(p.y - hy);
        const flying = f.ragdolled && f.rag.speed(sim.h) > 300;
        const active = !f.dead && !f.ragdolled && dx < 420 && dy < 260;
        if (!(active || (flying && dx < 600 && dy < 500))) continue;
        if (active) engaged++;
        x0 = Math.min(x0, p.x - 70);
        x1 = Math.max(x1, p.x + 70);
        y0 = Math.min(y0, p.y - 130);
        y1 = Math.max(y1, p.y + 50);
      }
      // while Onyx has nobody on him, show the fights going on around him
      this.idleT = engaged === 0 ? this.idleT + dt : 0;
      if (this.cutCooldown > 0) this.cutCooldown -= dt;
      let brawl = null;
      let bd = 1e9;
      if (this.idleT > 1.2 && !sim.over) {
        for (const f of sim.enemies) {
          if (f.dead || f.removed || !f.brain || !f.brain.foe || f.ragdolled) continue;
          const d = Math.abs(f.x - hx) + Math.abs(f.y - hy);
          if (d < bd) {
            bd = d;
            brawl = f;
          }
        }
      }
      if (brawl && bd < 1100) {
        const o = brawl.brain.foe;
        x0 = Math.min(x0, brawl.x - 90, o.x - 90);
        x1 = Math.max(x1, brawl.x + 90, o.x + 90);
        y0 = Math.min(y0, brawl.y - 150, o.y - 150);
        y1 = Math.max(y1, brawl.y + 40, o.y + 40);
      } else if (brawl && !this.cut && this.cutCooldown <= 0) {
        this.cut = { f: brawl, t: 0 };
      }
      if (this.cut) {
        const c = this.cut;
        c.t += dt;
        if (c.t > 5 || engaged > 0 || c.f.dead || !c.f.brain || !c.f.brain.foe || sim.over) {
          this.cut = null;
          this.cutCooldown = 14;
        }
      }
      const minW = engaged <= 1 ? 900 : engaged <= 3 ? 1060 : 1240;
      tw = Math.max(minW, x1 - x0 + 300, (y1 - y0 + 220) * aspect);
      tw = Math.min(tw, 2400);
      // keep the hero inside the inner part of the frame
      tx = clamp((x0 + x1) / 2, hx - tw * 0.3, hx + tw * 0.3);
      ty = clamp((y0 + y1) / 2 - 30, hy - (tw / aspect) * 0.3, hy + (tw / aspect) * 0.15);
      if (this.cut) {
        // meanwhile, across the map...
        const c = this.cut.f;
        const o = c.brain.foe;
        tx = (c.x + o.x) / 2;
        ty = Math.min(c.y, o.y) - 70;
        tw = 980;
      }
      if (punch > 0) {
        tx = lerp(tx, this.focusX, punch * 2.2);
        ty = lerp(ty, this.focusY - 30, punch * 2.2);
        tw *= 1 - punch;
      }
      if (sim.over && !sim.over.victory) {
        tx = hx;
        ty = hy - 30;
        tw = Math.max(520, 820 - this.endT * 40);
      }
    }
    // clamp to level bounds
    const vh = tw / aspect;
    const bw = L.bounds.right - L.bounds.left;
    const bh = L.bounds.bottom - L.bounds.top;
    if (tw < bw) tx = clamp(tx, L.bounds.left + tw / 2, L.bounds.right - tw / 2);
    else tx = (L.bounds.left + L.bounds.right) / 2;
    if (vh < bh + 200) ty = clamp(ty, L.bounds.top + vh / 2, L.bounds.bottom - vh / 2 + 60);
    else ty = (L.bounds.top + L.bounds.bottom) / 2;

    if (dt <= 0) {
      this.x = tx;
      this.y = ty;
      this.viewW = tw;
    } else {
      const fast = this.slow ? 0.18 : 0.32;
      this.x = smoothDamp(this.x, tx, this.sx, fast, dt);
      this.y = smoothDamp(this.y, ty, this.sy, fast * 1.3, dt);
      this.viewW = Math.exp(smoothDamp(Math.log(this.viewW), Math.log(tw), this.sw, this.slow ? 0.25 : 0.6, dt));
    }
    this.zoom = W / this.viewW;
    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    const sh = this.trauma * this.trauma;
    const amp = 16 / this.zoom;
    this.shakeX = sh * amp * noise1(this.time * 25);
    this.shakeY = sh * amp * noise1(this.time * 25 + 100);
    this.rot = sh * 0.025 * noise1(this.time * 18 + 50) + (this.slow ? Math.sin(this.time * 0.8) * 0.004 : 0);
    void settings;
  }

  view(W, H) {
    const hw = W / this.zoom / 2;
    const hh = H / this.zoom / 2;
    return { x0: this.x - hw - 40, x1: this.x + hw + 40, y0: this.y - hh - 40, y1: this.y + hh + 40 };
  }
}
