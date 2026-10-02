// Visual-only effects. Driven by simulation events and live state; updated
// in (scaled) real time so slow motion stays smooth. Uses its own RNG so the
// simulation remains deterministic.

import { RNG } from '../core/rng.js';
import { HEAD, NECK, PELVIS, KNEE_A, KNEE_B, NJ } from '../fighter/skeleton.js';
import { Gore } from './gore.js';

// wound slots on a fighter (visual): head, torso, lead arm, rear arm, lead leg, rear leg
export const W_HEAD = 0;
export const W_TORSO = 1;
const WOUND_PART = { head: [W_HEAD], body: [W_TORSO, W_TORSO, 2, 3], legs: [4, 5] };

export function woundsOf(f) {
  if (!f.gore) f.gore = { w: new Float32Array(6), bleed: 0, pool: 0, poolX: 0, poolY: 0, poolT: 0, smearX: null };
  return f.gore;
}

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
    this.gore = new Gore();
    this.goreK = 1.6;
    this.impact = null; // a stylised black-on-white impact frame
    this.impactCd = 0;
    this.bolts = []; // lightning strikes being drawn
  }

  impactFrame(a, b, x, y, force) {
    if (!force && this.time < this.impactCd) return;
    this.impact = { t: 0.085, a, b, x, y };
    this.impactCd = this.time + 1.5;
  }

  reset(sim, settings) {
    this.gore.reset(sim, settings);
    this.impact = null;
    this.bolts.length = 0;
    this.goreK = settings ? [0, 1, 1.7][settings.gore | 0] || 0 : 1;
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
    p.wallT = o.wallT !== undefined ? o.wallT : -1;
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
          if (this.goreK > 0 && e.b && e.kind !== 'push') this.bleedHit(e, sim, pw);
          if (e.a && e.a.isHero && e.b && !e.friendly && (e.b.dead || (e.down && pw > 1.2))) this.impactFrame(e.a, e.b, e.x, e.y);
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
        if (this.goreK > 0 && e.f && e.f.gore && (e.wall || pw > 0.8)) this.bleedImpact(e, sim, pw);
        if (e.f && pw > 1.25 && e.f.knock && e.f.knock.by && e.f.knock.by.isHero && sim.time - e.f.knock.time < 1.5) {
          // slammed down hard: the floor shakes, dust rings out
          this.impactFrame(e.f.knock.by, e.f, e.x, e.y);
          for (const dir of [-1, 1]) this.burst('dust', e.x + dir * 8, e.y + 4, 5, { ang: dir > 0 ? -0.1 : Math.PI + 0.1, spread: 0.25, speed: [120, 320], life: [0.35, 0.7], size: [6, 11], grow: 30, color: '200,196,190', drag: 4, alpha: 0.5 });
          this.spawn({ type: 'ring', x: e.x, y: e.y, life: 0.25, size: 10, grow: 260, color: '255,255,255', alpha: 0.5 });
        }
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
      case 'shot':
        this.onShot(e, sim);
        break;
      case 'lightning':
        this.onLightning(e, sim);
        break;
      case 'push': {
        this.spawn({ type: 'ring', x: e.x, y: e.y, life: 0.35, size: 20, grow: e.R * 3, color: '255,255,255', alpha: 0.8 });
        this.spawn({ type: 'ring', x: e.x, y: e.y, life: 0.5, size: 10, grow: e.R * 1.8, color: '200,220,255', alpha: 0.5 });
        this.spawn({ type: 'flash', x: e.x, y: e.y, life: 0.15, size: 90, color: '230,240,255', add: true });
        this.burst('dust', e.x, e.y, 18, { speed: [160, 520], life: [0.35, 0.8], size: [8, 16], grow: 30, color: '205,200,195', drag: 3.5, alpha: 0.45 });
        this.flashScreen(0.12, '230,240,255');
        break;
      }
      case 'pspawn':
        this.spawn({ type: 'flash', x: e.x, y: e.y, life: 0.18, size: 40, color: '255,220,150', add: true });
        this.burst('dust', e.x, e.y, 6, { speed: [30, 120], life: [0.3, 0.6], size: [5, 9], grow: 20, color: '220,210,200', drag: 3, alpha: 0.5 });
        break;
      case 'pgrab':
        this.spawn({ type: 'ring', x: e.x, y: e.y, life: 0.2, size: 4, grow: 90, color: '255,255,255', alpha: 0.7 });
        break;
      case 'ko':
        if (this.goreK > 0 && e.f && e.cause !== 'electric' && e.cause !== 'fell' && e.cause !== 'window' && e.cause !== 'lightning') {
          const g = woundsOf(e.f);
          g.bleed = Math.min(2, g.bleed + 0.6);
          const hp = e.f.rag.p[HEAD];
          this.spray(sim, hp.x, hp.y, (e.by ? Math.sign(e.f.x - e.by.x) : 0) || 1, 1.2, 10, e.cause === 'explosion' ? 2 : 1);
        }
        break;
    }
    void settings;
  }

  // A gunshot: tracer, impact, and what the round did when it got there.
  onShot(e, sim) {
    const r = this.rng;
    this.spawn({ type: 'tracer', x: e.x, y: e.y, vx: e.ox, vy: e.oy, life: 0.1, size: 2.4, color: '255,176,40' });
    this.spawn({ type: 'flash', x: e.x, y: e.y, life: 0.06, size: 16, color: '255,240,200', add: true });
    if (e.kind === 'flesh') {
      const f = e.f;
      if (this.goreK > 0) {
        const g = woundsOf(f);
        const slot = e.head ? W_HEAD : W_TORSO;
        g.w[slot] = Math.min(1.5, g.w[slot] + (e.head ? 1.2 : 0.6));
        g.bleed = Math.min(2, g.bleed + (e.head ? 0.9 : 0.5));
        const dir = Math.sign(e.dx) || 1;
        // exit wound: a spray along the line of fire and a splash behind
        this.spray(sim, e.x, e.y, dir, e.head ? 1.8 : 1.3, e.head ? 16 : 10, 1);
        this.gore.wall(e.x + e.dx * r.range(26, 48), e.y + e.dy * r.range(20, 40), e.dx, e.dy, e.head ? 9 : 6);
        if (this.goreK > 1.2) this.burst('mist', e.x, e.y, 4, { ang: Math.atan2(e.dy, e.dx), spread: 0.5, speed: [60, 200], life: [0.25, 0.5], size: [4, 9], grow: 26, color: '150,10,20', drag: 4, alpha: 0.4 });
      }
      f.flash = 1;
      if (e.kill && e.head) this.impactFrame(null, f, e.x, e.y, false);
    } else if (e.kind === 'wall' || e.kind === 'solid') {
      this.gore.hole(e.x, e.y);
      this.burst('dust', e.x, e.y, 4, { speed: [30, 140], life: [0.3, 0.6], size: [3, 6], grow: 16, color: '205,200,190', drag: 3, alpha: 0.5 });
      this.burst('chip', e.x, e.y, 4, { speed: [80, 240], life: [0.3, 0.7], size: [1, 2], color: '140,138,132', g: 1400, floor: this.floorBelow(sim, e.x, e.y) });
    } else if (e.kind === 'metal') {
      this.burst('spark', e.x, e.y, 10, { speed: [150, 480], life: [0.08, 0.25], size: [1.2, 2.2], color: '255,220,150', g: 700, drag: 1.5, add: true });
    }
  }

  // A bolt from above: drawn for a few frames with flicker, plus the arcs
  // it jumped along, a flash and a scorch mark where it landed.
  onLightning(e, sim) {
    this.bolts.push({ ox: e.ox, oy: e.oy, x: e.x, y: e.y, chain: e.chain, t: 0, life: 0.42, seed: this.rng.int(1, 1e6) });
    this.flashScreen(0.4, '220,232,255');
    this.lights.push({ x: e.x, y: e.y - 60, r: 620, life: 0.7, max: 0.7, color: '200,220,255' });
    this.burst('spark', e.x, e.y, 30, { speed: [160, 620], life: [0.1, 0.4], size: [1.2, 2.6], color: '225,240,255', g: 600, drag: 1.5, add: true });
    this.burst('dust', e.x, e.y, 8, { speed: [40, 200], life: [0.4, 0.9], size: [6, 12], grow: 24, color: '120,120,125', drag: 3, alpha: 0.4 });
    this.spawn({ type: 'ring', x: e.x, y: e.y, life: 0.25, size: 8, grow: 300, color: '210,230,255', alpha: 0.6 });
    this.gore.scorch(e.x, e.y, 26);
  }

  // A landed blow: wounds on the struck part, a spray away from the attacker,
  // and on big hits a splash straight onto the wall behind the victim.
  bleedHit(e, sim, pw) {
    const t = e.b;
    const g = woundsOf(t);
    const dmg = pw * 9;
    const slots = WOUND_PART[e.part] || WOUND_PART.body;
    const slot = slots[this.rng.int(0, slots.length - 1)];
    const k = dmg / Math.max(20, t.maxHp * 0.35);
    g.w[slot] = Math.min(1.5, g.w[slot] + k * (e.ground ? 0.8 : 1));
    if (e.part === 'body') {
      const arm = 2 + this.rng.int(0, 1);
      g.w[arm] = Math.min(1.5, g.w[arm] + k * 0.3);
    }
    const cut = e.weapon || e.kind === 'weapon' || e.part === 'head';
    g.bleed = Math.min(2, g.bleed + k * (cut ? 0.9 : 0.5));
    const dir = Math.sign(t.x - (e.a ? e.a.x : t.x - 1)) || 1;
    const heavy = pw > 1.15 || e.down;
    const n = (2 + pw * 5) * (e.part === 'head' ? 1.3 : 1) * (cut ? 1.3 : 1) * (heavy ? 1.3 : 1);
    this.spray(sim, e.x, e.y, dir, pw, n, 1);
    if (heavy && this.rng.chance(0.35 * this.goreK)) {
      // the classic: a splash on the wall right behind the head
      const hx = t.rag.p[HEAD].x + dir * this.rng.range(14, 40);
      const hy = t.rag.p[HEAD].y + this.rng.range(-10, 18);
      this.gore.wall(hx, hy, dir, this.rng.range(-0.4, 0.2), 3 + pw * 3.5 * Math.min(1.4, this.goreK));
    }
  }

  // Bodies slamming into floors and walls leave their mark.
  bleedImpact(e, sim, pw) {
    const g = e.f.gore;
    if (g.bleed < 0.15 && !e.wall) return;
    if (e.wall && e.nx !== undefined) {
      this.gore.wall(e.x, e.y, -e.nx, this.rng.range(-0.3, 0.3), 3 + pw * 4);
      this.spray(sim, e.x, e.y, -Math.sign(e.nx) || 1, pw * 0.8, 6, 1);
    } else {
      const fl = this.floorBelow(sim, e.x, e.y - 20);
      if (fl - e.y < 40) this.gore.floor(e.x, fl, 2 + pw * 3 * Math.min(1.5, g.bleed + 0.4));
    }
  }

  // Droplets thrown from (x, y), mostly in direction dir, some sticking to
  // the wall behind mid-flight, the rest raining onto the floor.
  spray(sim, x, y, dir, pw, n, mul) {
    const r = this.rng;
    const count = Math.round(n * this.goreK * (mul || 1));
    const fl = this.floorBelow(sim, x, y);
    for (let i = 0; i < count; i++) {
      const a = (dir > 0 ? 0 : Math.PI) + dir * r.range(-0.95, 0.45) + (r.chance(0.15) ? Math.PI * r.range(0.8, 1.2) : 0);
      const sp = r.range(90, 260 + pw * 260);
      this.spawn({
        type: 'blood',
        x: x + r.range(-3, 3),
        y: y + r.range(-3, 3),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - r.range(40, 160),
        life: r.range(0.7, 1.6),
        size: r.range(1.1, 2.6) * (0.8 + pw * 0.2),
        color: r.chance(0.3) ? '120,6,14' : '165,12,22',
        g: 1500,
        drag: 0.6,
        floor: fl,
        wallT: r.chance(0.3) ? r.range(0.03, 0.3) : -1,
      });
    }
    if (this.goreK > 1.2 && pw > 0.6) {
      this.burst('mist', x, y, 2 + Math.round(pw * 2), { ang: dir > 0 ? -0.2 : Math.PI + 0.2, spread: 0.7, speed: [20, 90], life: [0.25, 0.5], size: [4, 8], grow: 22, color: '150,10,20', drag: 4, alpha: 0.35 });
    }
  }

  // Blood particles: stick to walls mid-flight or stain the floor on landing.
  bloodStep(p, sim) {
    if (p.wallT >= 0 && p.max - p.life >= p.wallT) {
      p.alive = false;
      if (!this.gore.drop(p.x, p.y, p.vx, p.vy, p.size)) {
        p.alive = true;
        p.wallT = -1;
      }
      return;
    }
    if (p.floor !== null && p.y >= p.floor) {
      const g = sim.level.groundUnder(p.x - 1, p.x + 1, p.floor - 6, 12, true, false);
      if (g) {
        this.gore.floor(p.x, g.y, p.size * 0.9);
        p.alive = false;
      } else p.floor = this.floorBelow(sim, p.x, p.y + 2);
    }
  }

  // Wounded fighters drip; bodies on the floor pool and smear.
  updateBleeding(dt, sim, view) {
    const r = this.rng;
    const h = sim.h;
    for (const f of sim.fighters) {
      const g = f.gore;
      if (!g || g.bleed <= 0.02 || f.removed) continue;
      const pel = f.rag.p[PELVIS];
      if (pel.x < view.x0 - 300 || pel.x > view.x1 + 300) continue;
      if (!f.dead) g.bleed = Math.max(0, g.bleed - dt * 0.012);
      if (!f.ragdolled) {
        if (r.chance(dt * g.bleed * 2.2 * this.goreK)) {
          const src = g.w[W_HEAD] > g.w[W_TORSO] ? f.rag.p[HEAD] : f.rag.p[NECK];
          this.spawn({ type: 'blood', x: src.x + r.range(-4, 4), y: src.y + 6, vx: f.vx * 0.5 + r.range(-15, 15), vy: r.range(0, 40), life: 1.5, size: r.range(1, 1.8), color: '150,10,20', g: 1400, floor: this.floorBelow(sim, src.x, src.y) });
        }
        g.smearX = null;
        continue;
      }
      // lying still: a pool spreads from the head and chest
      const hp = f.rag.p[HEAD];
      const slow = f.rag.sleeping || f.rag.coreSpeed(h) < 40;
      g.poolT -= dt;
      if (slow && g.poolT <= 0) {
        g.poolT = 0.35;
        const cx = (hp.x * 2 + pel.x) / 3;
        const fl = sim.level.groundUnder(cx - 2, cx + 2, Math.max(hp.y, pel.y) - 12, 40, true, false);
        if (fl) {
          const maxR = 10 + Math.min(1.5, g.bleed) * 26 * Math.min(1.3, this.goreK);
          if (Math.abs(cx - g.poolX) > 30 || Math.abs(fl.y - g.poolY) > 4) {
            g.poolX = cx;
            g.poolY = fl.y;
            g.pool = 3;
          }
          if (g.pool < maxR) {
            g.pool = Math.min(maxR, g.pool + 2.2);
            this.gore.pool(g.poolX, g.poolY, g.pool);
          }
        }
      }
      // sliding along the floor: smear
      if (!slow && pel.ground !== undefined) {
        const low = f.rag.p[NECK].ground || pel.ground || f.rag.p[KNEE_A].ground || f.rag.p[KNEE_B].ground;
        if (low) {
          const fl = sim.level.groundUnder(pel.x - 2, pel.x + 2, pel.y - 6, 30, true, false);
          if (fl) {
            if (g.smearX !== null && Math.abs(pel.x - g.smearX) < 60) this.gore.smear(g.smearX, pel.x, fl.y, g.bleed);
            g.smearX = pel.x;
          } else g.smearX = null;
        } else g.smearX = null;
      }
    }
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
    if (this.impact) {
      this.impact.t -= dt;
      if (this.impact.t <= 0) this.impact = null;
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      if (b.t > b.life) this.bolts.splice(i, 1);
    }
    if (settings) this.goreK = [0, 1, 1.7][settings.gore | 0] || 0;
    const r = this.rng;
    for (const p of this.ps) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      if (p.type === 'tracer') continue; // vx/vy hold its origin, not a velocity
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
      if (p.type === 'blood') {
        this.bloodStep(p, sim);
        continue;
      }
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
    if (this.goreK > 0) this.updateBleeding(dt, sim, view);
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
    ctx.restore();
    // electricity reads on white walls too: dark halo, bright core
    this.drawArcs(ctx, t);
    this.drawBolts(ctx);
  }

  drawBolts(ctx) {
    for (const b of this.bolts) {
      const k = 1 - b.t / b.life;
      // re-roll the jag every few hundredths for a crackling flicker
      const r = new RNG(b.seed + Math.floor(b.t * 28));
      const path = (x0, y0, x1, y1, n, amp) => {
        const pts = [[x0, y0]];
        for (let i = 1; i < n; i++) {
          const u = i / n;
          pts.push([x0 + (x1 - x0) * u + r.range(-amp, amp), y0 + (y1 - y0) * u + r.range(-amp * 0.4, amp * 0.4)]);
        }
        pts.push([x1, y1]);
        return pts;
      };
      const stroke = (pts, w, col) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      };
      const len = Math.hypot(b.x - b.ox, b.y - b.oy);
      const main = path(b.ox, b.oy, b.x, b.y, Math.max(8, Math.round(len / 40)), 26);
      stroke(main, 18 * k + 2, `rgba(30,55,160,${0.3 * k})`);
      stroke(main, 7 * k + 2, `rgba(110,160,255,${0.85 * k})`);
      stroke(main, 2.6, `rgba(255,255,255,${k})`);
      // forks off the main channel
      for (let f = 0; f < 3; f++) {
        const i = 2 + Math.floor(r.range(0, main.length - 3));
        const [sx, sy] = main[i];
        const fork = path(sx, sy, sx + r.range(-120, 120), sy + r.range(40, 160), 5, 14);
        stroke(fork, 6 * k, `rgba(30,55,160,${0.25 * k})`);
        stroke(fork, 3 * k, `rgba(120,170,255,${0.75 * k})`);
        stroke(fork, 1.2, `rgba(255,255,255,${0.9 * k})`);
      }
      for (const [x0, y0, x1, y1] of b.chain) {
        const arc = path(x0, y0, x1, y1, 7, 14);
        stroke(arc, 9 * k, `rgba(30,55,160,${0.28 * k})`);
        stroke(arc, 4 * k, `rgba(120,170,255,${0.8 * k})`);
        stroke(arc, 1.6, `rgba(255,255,255,${0.95 * k})`);
      }
    }
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
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = k === 2 ? 'rgba(255,255,255,0.95)' : k === 1 ? 'rgba(120,170,255,0.75)' : 'rgba(30,60,170,0.35)';
        ctx.lineWidth = k === 2 ? 1.6 : k === 1 ? 4 : 9;
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
    case 'tracer': {
      // a streak from off screen (stored in vx/vy) to the impact point
      ctx.strokeStyle = `rgba(${p.color},${k})`;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.vx + (p.x - p.vx) * 0.55, p.vy + (p.y - p.vy) * 0.55);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      break;
    }
    case 'blood': {
      const v = Math.hypot(p.vx, p.vy);
      const st = Math.min(3.2, 1 + v / 260);
      ctx.fillStyle = `rgba(${p.color},${Math.min(1, k * 3)})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size * st, p.size, Math.atan2(p.vy, p.vx), 0, TAU);
      ctx.fill();
      break;
    }
    case 'mist':
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
