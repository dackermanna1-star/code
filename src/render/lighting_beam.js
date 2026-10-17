// Tess's flashlight (TECH §8 `flashlight`): the cone in the lightmap (shadowed per frame), her
// self-glow and the beam's back-spill, a faint haze hanging in the beam, and dust motes glinting
// inside it. Driven by HW.lighting.flashlight = { on, x, y, angle, power, flicker, cone?, color? }.
import { LIGHT_COLORS } from '../art/palette.js';
import { nudgeOrigin, pointInPoly, tracePoly } from './lighting_shadow.js';
import { CONE, noise1 } from './lighting_presets.js';
import { coneTexture } from './lighting_tex.js';

export const FL_RADIUS = 130;   // throw at full power (px)
const HAZE = 0.05;              // additive in-air haze of the beam
const HOT = 0.42;               // hotspot weight in Tess's beam
const SPILL_RADIUS = 44;        // back-spill around the hand (px)
const MOTES = 30;
const MAX_POLY = 4096;

// Luminance of the flashlight color (cone values are color multipliers).
const LUM_FL = (() => {
  const h = parseInt(LIGHT_COLORS.flashlight.slice(1), 16);
  return (0.2126 * ((h >> 16) & 255) + 0.7152 * ((h >> 8) & 255) + 0.0722 * (h & 255)) / 255;
})();
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
/** Full cone angle in degrees from radians (flashlight.js) or degrees (> 2π); ½° steps. */
export function coneDeg(v, d = 55) {
  if (!(v > 0)) return d;
  const deg = v > Math.PI * 2 ? v : (v * 180) / Math.PI;
  return Math.round(deg * 2) / 2;
}

export class Beam {
  constructor() {
    this.poly = new Float32Array(MAX_POLY * 2);
    this.n = 0;
    this.small = new Float32Array(MAX_POLY * 2);
    this.nSmall = 0;
    this.R = FL_RADIUS;
    this.I = 1;
    this.half = (55 * Math.PI) / 360;
    this.tex = null;
    this.texKey = '';
    this.o = { x: 0, y: 0 };
    this.motes = new Float32Array(MOTES * 4); // x, y, phase, speed
    this.motesReady = false;
    this.seed = 0x2545f491;
    this.styles = [];
    for (let i = 0; i < 16; i++) this.styles.push(`rgba(255,238,206,${((i + 1) / 16).toFixed(3)})`);
  }

  reset() {
    this.n = 0;
    this.motesReady = false;
  }

  /** Is the beam emitting this frame (after draw())? */
  get lit() { return this.n >= 3; }

  /** Draw the cone into the lightmap (lc, world → lightmap transform given by lmx/lmy/K). */
  draw(lc, fl, sys, lmx, lmy, K, t, reduce) {
    this.n = 0;
    if (!fl.on || !(fl.power > 0.001)) return;
    const power = Math.min(1, fl.power);
    const R = FL_RADIUS * (0.55 + 0.45 * power) * (fl.radiusScale ?? 1);
    let inten = 0.32 + 0.68 * power;
    // Low batteries and bad contacts: a nervous, uneven beam.
    const fk = (fl.flicker || 0) * (reduce ? 0.3 : 1);
    if (fk > 0) inten *= 1 - fk * 0.32 * noise1(t * 37, 11) - fk * 0.12 * noise1(t * 11, 5);
    if (power < 0.25) inten *= 0.82 + 0.18 * noise1(t * 13, 7);
    const deg = coneDeg(fl.cone);
    const half = (deg * Math.PI) / 360;
    this.R = R;
    this.I = inten;
    this.half = half;
    const key = `${deg}|${fl.color || ''}`;
    if (key !== this.texKey) {
      this.tex = coneTexture(deg, fl.color || LIGHT_COLORS.flashlight, LIGHT_COLORS.flashlight_dim, HOT);
      this.texKey = key;
    }
    const o = nudgeOrigin(sys.grid, fl.x, fl.y, this.o);
    const span = half * 1.3 + 0.06;
    this.n = sys.solver.compute(sys.segs, o.x, o.y, R + 2, this.poly, sys.bleed, fl.angle - span, fl.angle + span);
    lc.save();
    lc.setTransform(K, 0, 0, K, -lmx * K, -lmy * K);
    tracePoly(lc, this.poly, this.n);
    lc.clip();
    lc.globalAlpha = clamp01(inten);
    lc.translate(fl.x, fl.y);
    lc.rotate(fl.angle);
    lc.drawImage(this.tex, -R, -R, R * 2, R * 2);
    lc.restore();
  }

  /**
   * Tess's self-glow (always, unless hidden) plus the beam's back-spill (when on): a small soft
   * light at the flashlight x,y so she is never lost in the dark.
   */
  drawSelf(lc, fl, sg, hidden, sys, lmx, lmy, K) {
    const glowOn = sg.on && !hidden;
    const spill = fl.on && fl.power > 0.001;
    this.nSmall = 0;
    if (!glowOn && !spill) return;
    const x = fl.x;
    const y = fl.y;
    const o = nudgeOrigin(sys.grid, x, y, this.o);
    this.nSmall = sys.solver.compute(sys.segs, o.x, o.y, SPILL_RADIUS + 2, this.small, sys.bleed);
    lc.save();
    lc.setTransform(K, 0, 0, K, -lmx * K, -lmy * K);
    tracePoly(lc, this.small, this.nSmall);
    lc.clip();
    if (glowOn) {
      // Centred a little below the hand: the glow sits around her body, not her fist.
      const cy = y + 4;
      const g = lc.createRadialGradient(x, cy, 0, x, cy, sg.radius);
      const v = sg.intensity;
      g.addColorStop(0, `rgb(${Math.round(222 * v)},${Math.round(212 * v)},${Math.round(204 * v)})`);
      g.addColorStop(0.45, `rgb(${Math.round(122 * v)},${Math.round(117 * v)},${Math.round(113 * v)})`);
      g.addColorStop(1, 'rgb(0,0,0)');
      lc.fillStyle = g;
      lc.fillRect(x - sg.radius, cy - sg.radius, sg.radius * 2, sg.radius * 2);
    }
    if (spill) {
      const v = 0.13 * (0.4 + 0.6 * Math.min(1, fl.power)) * this.I;
      const g = lc.createRadialGradient(x, y, 0, x, y, SPILL_RADIUS);
      g.addColorStop(0, `rgb(${Math.round(255 * v)},${Math.round(241 * v)},${Math.round(214 * v)})`);
      g.addColorStop(1, 'rgb(0,0,0)');
      lc.fillStyle = g;
      lc.fillRect(x - SPILL_RADIUS, y - SPILL_RADIUS, SPILL_RADIUS * 2, SPILL_RADIUS * 2);
    }
    lc.restore();
  }

  /** The light hanging in dusty air: a faint additive copy of the (shadowed) cone over the world. */
  haze(ctx, fl, cam) {
    if (!fl.on || this.n < 3) return;
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    tracePoly(ctx, this.poly, this.n);
    ctx.clip();
    ctx.globalAlpha = HAZE * clamp01(this.I);
    ctx.imageSmoothingEnabled = true;
    ctx.translate(fl.x, fl.y);
    ctx.rotate(fl.angle);
    ctx.drawImage(this.tex, -this.R, -this.R, this.R * 2, this.R * 2);
    ctx.restore();
  }

  /** Cone light at a world point (lightAt): same profile as the texture, same polygon. */
  at(x, y, fl) {
    if (!fl.on || this.n < 3) return 0;
    const dx = x - fl.x;
    const dy = y - fl.y;
    const d = Math.hypot(dx, dy);
    if (d >= this.R || !pointInPoly(this.poly, this.n, x, y)) return 0;
    const th = Math.abs(wrapAngle(Math.atan2(dy, dx) - fl.angle));
    return this.I * CONE.value(d / this.R, th, this.half, HOT) * LUM_FL;
  }

  // ---------------------------------------------------------------------------- dust motes
  _rand() {
    let a = (this.seed = (this.seed + 0x6d2b79f5) >>> 0);
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  }

  _spawnMote(i, fl, anywhere) {
    const d = this.R * (anywhere ? 0.08 + 0.85 * Math.sqrt(this._rand()) : 0.15 + 0.8 * this._rand());
    const a = fl.angle + (this._rand() * 2 - 1) * this.half * 1.1;
    const m = this.motes;
    m[i * 4] = fl.x + Math.cos(a) * d;
    m[i * 4 + 1] = fl.y + Math.sin(a) * d;
    m[i * 4 + 2] = this._rand() * Math.PI * 2;
    m[i * 4 + 3] = 0.5 + this._rand();
  }

  updateMotes(dt, fl, t) {
    if (!fl.on) return;
    if (!this.motesReady) {
      for (let i = 0; i < MOTES; i++) this._spawnMote(i, fl, true);
      this.motesReady = true;
    }
    const m = this.motes;
    for (let i = 0; i < MOTES; i++) {
      const o = i * 4;
      const sp = m[o + 3];
      // Lazy Brownian drift with a slow settle.
      m[o] += (noise1(t * 0.35 * sp, i * 17) - 0.5) * 9 * dt;
      m[o + 1] += ((noise1(t * 0.3 * sp, i * 29 + 5) - 0.5) * 8 + 1.1) * dt;
      const dx = m[o] - fl.x;
      const dy = m[o + 1] - fl.y;
      const d = Math.hypot(dx, dy);
      const th = Math.abs(wrapAngle(Math.atan2(dy, dx) - fl.angle));
      if (d > this.R * 0.98 || th > this.half * 1.35 || d < 4) this._spawnMote(i, fl, false);
    }
  }

  /** Motes glint where the cone is bright (additive 1-px specks, inside the shadowed beam only). */
  drawMotes(ctx, fl, cam, t) {
    if (!fl.on || this.n < 3) return;
    const m = this.motes;
    const inten = clamp01(this.I);
    ctx.globalAlpha = 1;
    for (let i = 0; i < MOTES; i++) {
      const o = i * 4;
      const x = m[o];
      const y = m[o + 1];
      const dx = x - fl.x;
      const dy = y - fl.y;
      const d = Math.hypot(dx, dy) / this.R;
      const th = Math.abs(wrapAngle(Math.atan2(dy, dx) - fl.angle));
      let b = CONE.value(d, th, this.half, HOT) * inten;
      b *= 0.55 + 0.45 * Math.sin(t * 2.2 * m[o + 3] + m[o + 2]);
      if (b < 0.06 || !pointInPoly(this.poly, this.n, x, y)) continue;
      ctx.fillStyle = this.styles[Math.min(15, Math.floor(b * 0.6 * 16))];
      ctx.fillRect(Math.round(x - cam.x), Math.round(y - cam.y), 1, 1);
    }
  }
}
