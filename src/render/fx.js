// FX (TECH §9) — HW.fx: particles, weather and screen effects.
//
// Frame order (renderer.js): world → HW.lighting.render (which first calls fx.renderLit so lit
// particles and dust get lit by the lightmap) → fx.renderWorld (emissive particles, rain) →
// fx.renderPost (pixel pass for distort / chroma / VHS, grain, vignette, pulses, CRT, flash, fade).
//
// Screen effects are presentational and tick in update(dt) (the engine keeps calling it outside
// menus). Camera shake is published as `fx.offset`, which engine/camera.js adds to the view.
// settings: `grain` (film grain on/off), `crt` (scanlines), `reduceFlashing` (caps flashes and
// pulses, softens VHS tearing; lighting softens lightning and strobing tubes).
import HW from '../engine/hw.js';
import { Particles } from './fx_particles.js';
import { Rain, DustMotes } from './fx_weather.js';
import { PixelPass, makeGrainTiles, makeVignette, makeCrt, makeEdgeGlow } from './fx_post.js';

const W = 480;
const H = 270;
const VIGNETTE_BASE = 0.25;   // resting vignette (subtle frame); vignette(target) moves from here
const GRAIN_DEFAULT = 0.5;
const FLASH_CAP_REDUCED = 0.35;

const setting = (k, d) => {
  const v = HW.settings?.get?.(k);
  return v === undefined ? d : v;
};

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A value that eases from `from` to `to` over `d` seconds. */
class Tween {
  constructor(v) { this.v = v; this.from = v; this.to = v; this.d = 0; this.t = 0; }
  go(to, d) {
    this.from = this.v;
    this.to = to;
    this.d = Math.max(0, d || 0);
    this.t = 0;
    if (!this.d) this.v = to;
  }
  update(dt) {
    if (this.v === this.to) return;
    this.t += dt;
    const u = this.d ? Math.min(1, this.t / this.d) : 1;
    this.v = this.from + (this.to - this.from) * (u * u * (3 - 2 * u));
  }
}

/** A decaying effect: strength amount → 0 over d (d = 0: hold until set again). */
class Decay {
  constructor() { this.amount = 0; this.d = 0; this.t = 0; }
  set(amount, d) { this.amount = amount || 0; this.d = d || 0; this.t = 0; }
  update(dt) {
    if (!this.amount || !this.d) return;
    this.t += dt;
    if (this.t >= this.d) this.amount = 0;
  }
  get v() {
    if (!this.amount) return 0;
    if (!this.d) return this.amount;
    const u = 1 - this.t / this.d;
    return this.amount * u * u;
  }
}

export class FxSystem {
  constructor(seed = 0x5eed) {
    this.rand = mulberry(seed);
    /** Camera shake offset in world px (read by engine/camera.js). */
    this.offset = { x: 0, y: 0 };
    this.t = 0;
    this.particles = new Particles(this.rand);
    this._rain = new Rain(this.rand);
    this._dust = new DustMotes(this.rand);
    this._pixel = new PixelPass();
    this._shake = { i: 0, d: 0, t: 0, step: 0 };
    this._flash = { color: '#fff', a: 0, d: 0, t: 0 };
    this._fade = { color: '#000', a: 0, from: 0, to: 0, d: 0, t: 0, resolve: null };
    this._distort = new Decay();
    this._chroma = new Decay();
    this._vig = new Tween(VIGNETTE_BASE);
    this._grainAmt = null; // null = default (settings.grain)
    this._vhs = 0;
    this._vhsOn = false;
    this._pulses = [{ c: null, d: 0, t: -1 }, { c: null, d: 0, t: -1 }, { c: null, d: 0, t: -1 }, { c: null, d: 0, t: -1 }];
    this._glowCache = new Map();
    this._litDrawn = false;
    this._cam = null;
    this._ready = false;
  }

  init() {
    if (this._ready) return;
    this._ready = true;
    this._grain = makeGrainTiles(this.rand);
    this._vigWide = makeVignette(0.42, 1.0, 0.9);
    this._vigTight = makeVignette(0.12, 0.72, 1);
    this._crt = null; // built on first use
    this._grainIdx = 0;
  }

  /** Clear transient effects (map reloads, game over → retry). Fade state is kept. */
  reset() {
    this.particles.clear();
    this._shake.i = 0;
    this.offset.x = this.offset.y = 0;
    this._flash.a = 0;
    this._distort.set(0);
    this._chroma.set(0);
    this._vig.go(VIGNETTE_BASE, 0);
    this._vhsOn = false;
    this._vhs = 0;
    for (const p of this._pulses) p.t = -1;
  }

  // ============================================================================ particles & weather
  /** Spawn n particles of a type at a world point (feet/ground). opts: { z, dir, angle, spread, vx, vy } */
  emit(type, x, y, n = 1, opts) {
    const count = n === undefined || n === null ? 1 : Math.max(0, Math.min(200, n | 0));
    if (count) this.particles.emit(type, x, y, count, opts || {});
  }

  /** Exterior rain: full-screen slanted streaks + ground splashes. Eases in and out; opts.instant snaps. */
  rain(on, intensity = 1, opts) {
    this._rain.set(on, intensity, !!opts?.instant);
  }

  /** Current rain level 0..1.5 (0 = none drawn) and the level it is easing toward. */
  get rainLevel() { return this._rain.active ? this._rain.level : 0; }
  get rainTarget() { return this._rain.target; }

  /** Ambient dust drifting in the light (on by default). */
  dustMotes(on = true) {
    this._dust.on = !!on;
  }

  // ============================================================================ screen effects
  /** Shake the camera: i = amplitude in px, d = seconds. Stronger shakes win. */
  shake(i = 2, d = 0.3) {
    const s = this._shake;
    const remaining = s.d > 0 ? s.i * (1 - s.t / s.d) : 0;
    if (i >= remaining) { s.i = i; s.d = Math.max(0.01, d); s.t = 0; }
  }

  /** Full-screen flash that decays over d seconds (capped with reduceFlashing). */
  flash(color = '#fff', d = 0.25) {
    const f = this._flash;
    const reduce = setting('reduceFlashing', false);
    f.color = color;
    f.a = reduce ? FLASH_CAP_REDUCED : 1;
    f.d = Math.max(reduce ? 0.3 : 0.01, d);
    f.t = 0;
  }

  /** Fade 'out' (to color) or 'in' (from color). Resolves when done. */
  fade(dir = 'out', d = 0.6, color = '#000') {
    const f = this._fade;
    f.resolve?.();
    f.resolve = null;
    f.color = color || '#000';
    const out = dir !== 'in';
    f.from = out ? f.a : (f.a < 0.01 ? 1 : f.a);
    f.to = out ? 1 : 0;
    f.d = Math.max(0, d || 0);
    f.t = 0;
    if (!f.d) {
      f.a = f.to;
      return Promise.resolve();
    }
    f.a = f.from;
    return new Promise((res) => { f.resolve = res; });
  }

  /** Horizontal scanline wave, amount in px, decaying over d (d = 0: hold). */
  distort(amount = 2, d = 0.6) { this._distort.set(amount, d); }

  /** RGB split, amount in px, decaying over d (d = 0: hold). */
  chroma(amount = 1, d = 0.5) { this._chroma.set(amount, d); }

  /** Ease the vignette toward target (0 = none, 0.25 = resting, 1 = tunnel) over d seconds. */
  vignette(target = VIGNETTE_BASE, d = 0.8) { this._vig.go(Math.max(0, Math.min(1, target)), d); }

  /** Film grain strength 0..1 (null = default). Off entirely when settings.grain is false. */
  grain(amount = GRAIN_DEFAULT) { this._grainAmt = amount; }

  /** VHS look: tracking lines, chroma bleed, jitter, a rolling noise band. */
  vhs(on = true) { this._vhsOn = !!on; }

  /** A colored edge pulse (heartbeat, danger) rising and falling over d seconds. */
  pulse(color = '#9a2229', d = 0.8) {
    let slot = this._pulses.find((p) => p.t < 0) || this._pulses[0];
    let c = this._glowCache.get(color);
    if (!c) { c = makeEdgeGlow(color); this._glowCache.set(color, c); }
    slot.c = c;
    slot.d = Math.max(0.05, d);
    slot.t = 0;
  }

  /** Is the screen currently faded to (nearly) opaque? */
  get faded() { return this._fade.a > 0.99; }

  // ============================================================================ update
  update(dt) {
    this.init();
    this.t += dt;
    const cam = HW.camera?.view || this._cam;

    // Shake (stepped at ~30 Hz for a crunchy, pixel-honest jolt).
    const s = this._shake;
    if (s.d > 0) {
      s.t += dt;
      s.step -= dt;
      if (s.t >= s.d) { s.d = 0; this.offset.x = this.offset.y = 0; }
      else if (s.step <= 0) {
        s.step = 1 / 30;
        const k = s.i * (1 - s.t / s.d) ** 2;
        this.offset.x = Math.round((this.rand() * 2 - 1) * k);
        this.offset.y = Math.round((this.rand() * 2 - 1) * k);
      }
    }

    const f = this._flash;
    if (f.a > 0) { f.t += dt; if (f.t >= f.d) f.a = 0; }

    const fd = this._fade;
    if (fd.d > 0 && fd.a !== fd.to) {
      fd.t += dt;
      const u = Math.min(1, fd.t / fd.d);
      fd.a = fd.from + (fd.to - fd.from) * u;
      if (u >= 1) {
        fd.a = fd.to;
        const r = fd.resolve;
        fd.resolve = null;
        r?.();
      }
    }

    this._distort.update(dt);
    this._chroma.update(dt);
    this._vig.update(dt);
    this._vhs += ((this._vhsOn ? 1 : 0) - this._vhs) * Math.min(1, dt * 8);
    if (this._vhs < 0.01 && !this._vhsOn) this._vhs = 0;
    for (const p of this._pulses) if (p.t >= 0) { p.t += dt; if (p.t >= p.d) p.t = -1; }

    this.particles.update(dt, this.t);
    this._rain.update(dt, cam);
    this._dust.update(dt, cam, this.t);
  }

  // ============================================================================ render
  /** Lit particles + dust: drawn before the lighting multiply (called by lighting.render). */
  renderLit(ctx, cam) {
    this._cam = cam;
    this._dust.render(ctx, cam, this.t);
    this.particles.render(ctx, cam, 'lit', this.t);
    this._litDrawn = true;
  }

  /** Emissive particles and rain over the lit world. */
  renderWorld(ctx, cam) {
    this._cam = cam;
    if (!this._litDrawn) this.renderLit(ctx, cam); // lighting skipped (fullbright debug)
    this._litDrawn = false;
    this.particles.render(ctx, cam, 'ghost', this.t);
    this.particles.render(ctx, cam, 'emissive', this.t);
    const flash = HW.lighting?.lightningLevel || 0;
    this._rain.render(ctx, cam, flash);
  }

  /** Screen-space effects on the finished world buffer. */
  renderPost(ctx) {
    this.init();
    const reduce = setting('reduceFlashing', false);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    const distort = this._distort.v;
    const chroma = this._chroma.v;
    const vhs = this._vhs;
    if (distort > 0.05 || chroma > 0.05 || vhs > 0.01) {
      this._pixel.run(ctx, { distort, chroma, vhs, t: this.t, rand: this.rand, reduce });
      if (vhs > 0.01) this._vhsOverlay(ctx, vhs, reduce);
    }

    // Film grain (overlay keeps mid-tones honest; at 1 world px it reads as 16 mm, not static).
    const grainOn = setting('grain', true) !== false;
    const g = grainOn ? (this._grainAmt ?? GRAIN_DEFAULT) : 0;
    if (g > 0.01 || vhs > 0.01) {
      if ((this.t * 24 | 0) !== this._grainFrame) {
        this._grainFrame = this.t * 24 | 0;
        this._grainIdx = (this._grainIdx + 1) % this._grain.length;
        this._grainOx = Math.floor(this.rand() * 96);
        this._grainOy = Math.floor(this.rand() * 96);
      }
      const tile = this._grain[this._grainIdx];
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = Math.min(1, g * 0.16 + vhs * 0.06);
      for (let y = -this._grainOy; y < H; y += 96) for (let x = -this._grainOx; x < W; x += 96) ctx.drawImage(tile, x, y);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Vignette: the wide one first, the tight tunnel on top as the target passes 0.5.
    const v = this._vig.v;
    if (v > 0.005) {
      ctx.globalAlpha = Math.min(1, v * 2);
      ctx.drawImage(this._vigWide, 0, 0);
      if (v > 0.5) {
        ctx.globalAlpha = Math.min(1, (v - 0.5) * 2);
        ctx.drawImage(this._vigTight, 0, 0);
      }
    }

    for (const p of this._pulses) {
      if (p.t < 0) continue;
      const a = Math.sin((p.t / p.d) * Math.PI) * (reduce ? 0.3 : 0.55);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(p.c, 0, 0);
    }

    if (setting('crt', false)) {
      if (!this._crt) this._crt = makeCrt();
      ctx.globalAlpha = 1;
      ctx.drawImage(this._crt, 0, 0);
    }

    const f = this._flash;
    if (f.a > 0 && f.d > 0) {
      const u = 1 - f.t / f.d;
      ctx.globalAlpha = Math.max(0, f.a * u * u);
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, W, H);
    }

    const fd = this._fade;
    if (fd.a > 0.001) {
      ctx.globalAlpha = Math.min(1, fd.a);
      ctx.fillStyle = fd.color;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  /** VHS overlays: a bright tracking line now and then and a soft cool cast over the tape. */
  _vhsOverlay(ctx, vhs, reduce) {
    const r = this.rand;
    ctx.globalCompositeOperation = 'source-over';
    if (r() < 0.35 * vhs) {
      ctx.globalAlpha = (reduce ? 0.12 : 0.28) * vhs;
      ctx.fillStyle = '#e8eef4';
      ctx.fillRect(0, Math.floor(r() * H), W, 1);
    }
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.25 * vhs;
    ctx.fillStyle = '#3a5276';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

export const fx = new FxSystem();
export default fx;
