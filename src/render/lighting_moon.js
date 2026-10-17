// Moonlight through face windows (TECH §5.1, §8 `window`): a faint cool shaft projected south from
// every face_low window cell, leaning with the moon, crossed by the sash bars and clipped to what
// the window can see; the glass itself catching the light; rain running down the panes as moving
// streak shadows; and the glass blazing white during lightning.
//
// The shafts are static, so they are rendered once per geometry change into one map-sized layer at
// lightmap scale; each frame only the visible part is copied, rain-masked and added.
import { LIGHT_COLORS, hexToRgb } from '../art/palette.js';
import { tracePoly } from './lighting_shadow.js';
import { canvas, rainMask, rgbStr } from './lighting_tex.js';

const TILE = 16;
const SKEW = 11;        // px the far end of a shaft shifts east (the moon is high and a little east)
const SPREAD = 5;       // px each side a shaft widens over its length
const BASE = 0.62;      // shaft brightness at the sill (before the layer alpha)
const LAYER = 0.55;     // overall moonlight strength
const MOON_RGB = hexToRgb(LIGHT_COLORS.moon);
const MOON_LUM = (0.2126 * MOON_RGB[0] + 0.7152 * MOON_RGB[1] + 0.0722 * MOON_RGB[2]) / 255;

const isTallWindow = (map, tx, ty) => map.wallKind(tx, ty - 1) === 'face_high' && /^window/.test(map.tileAt(tx, ty - 1));

export class MoonLayer {
  constructor() {
    this.layer = null;
    this.shafts = [];
    this.glass = [];
    this.level = 0;
    this.scratch = null;
    this.sctx = null;
    this.pattern = null;
    this.poly = new Float32Array(4096 * 2);
  }

  init(lw, lh) {
    this.scratch = canvas(lw, lh);
    this.sctx = this.scratch.getContext('2d');
    this.pattern = this.sctx.createPattern(rainMask(), 'repeat');
  }

  /**
   * Render all shafts for a map. windows: [{ tx, ty, explicit }] (explicit = a `window` light def
   * with optional radius/intensity). Exteriors get no shafts unless map.data.moon says otherwise.
   */
  build(map, windows, solver, segs, K) {
    this.shafts = [];
    this.glass = [];
    const ext = map.data?.floor === 'EXT';
    this.level = map.data?.moon ?? (ext ? 0 : 1);
    if (!windows.length || !this.level) { this.layer = null; return; }
    const mw = Math.ceil(map.w * TILE * K);
    const mh = Math.ceil(map.h * TILE * K);
    if (!this.layer || this.layer.width !== mw || this.layer.height !== mh) this.layer = canvas(mw, mh);
    const c = this.layer.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#000';
    c.fillRect(0, 0, mw, mh);
    c.setTransform(K, 0, 0, K, 0, 0);
    for (const w of windows) {
      const { tx, ty } = w;
      const len = (w.explicit?.radius ?? 4.2) * TILE;
      const inten = w.explicit?.intensity ?? 1;
      const x0 = tx * TILE;
      const y0 = (ty + 1) * TILE;
      this.shafts.push({ x0, y0, len, inten });
      // Clip to what the window can actually see (desks don't stop it, walls and stacks do).
      const n = solver.compute(segs, x0 + 8, y0 + 0.5, len + 24, this.poly, 2);
      c.save();
      tracePoly(c, this.poly, n);
      c.clip();
      c.globalCompositeOperation = 'lighter';
      const g = c.createLinearGradient(0, y0, 0, y0 + len);
      const i0 = BASE * inten;
      g.addColorStop(0, rgbStr(MOON_RGB, i0));
      g.addColorStop(0.25, rgbStr(MOON_RGB, i0 * 0.72));
      g.addColorStop(0.65, rgbStr(MOON_RGB, i0 * 0.3));
      g.addColorStop(1, 'rgb(0,0,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x0 + 1, y0);
      c.lineTo(x0 + 15, y0);
      c.lineTo(x0 + 15 + SKEW + SPREAD, y0 + len);
      c.lineTo(x0 + 1 + SKEW - SPREAD, y0 + len);
      c.closePath();
      c.fill();
      // Sash bars: a cross of shadow carried along the shaft.
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = 'rgb(105,105,105)';
      const mx = x0 + 8;
      c.beginPath();
      c.moveTo(mx - 1, y0);
      c.lineTo(mx + 1, y0);
      c.lineTo(mx + 1 + SKEW, y0 + len);
      c.lineTo(mx - 1 + SKEW, y0 + len);
      c.closePath();
      c.fill();
      const u = 0.42;
      c.fillRect(x0 + 1 + (SKEW - SPREAD) * u, y0 + len * u - 1, 14 + SPREAD * 2 * u, 2);
      c.restore();
    }
    // The glass catches the moon (face_low and, when it is glass too, face_high above).
    c.globalCompositeOperation = 'lighter';
    for (const w of windows) {
      const tall = isTallWindow(map, w.tx, w.ty);
      const gy = (tall ? w.ty - 1 : w.ty) * TILE + 1;
      const gh = tall ? 31 : 15;
      const g = c.createLinearGradient(0, gy, 0, gy + gh);
      g.addColorStop(0, rgbStr(MOON_RGB, 0.42));
      g.addColorStop(1, rgbStr(MOON_RGB, 0.62));
      c.fillStyle = g;
      c.fillRect(w.tx * TILE + 1, gy, 14, gh);
      this.glass.push({ x0: w.tx * TILE + 1, y0: gy, x1: w.tx * TILE + 15, y1: gy + gh });
    }
  }

  /** Add the visible part of the layer to the lightmap, with rain sliding down the panes. */
  draw(lc, lmx, lmy, t, lift, K, lw, lh) {
    if (!this.layer || !this.level) return;
    const alpha = LAYER * this.level * lift;
    const sc = this.sctx;
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalAlpha = 1;
    sc.globalCompositeOperation = 'source-over';
    sc.fillStyle = '#000';
    sc.fillRect(0, 0, lw, lh);
    const sx = lmx * K;
    const sy = lmy * K;
    sc.drawImage(this.layer, -sx, -sy);
    // Streak shadows: the mask is anchored to the world and scrolls south.
    sc.globalCompositeOperation = 'destination-out';
    sc.globalAlpha = 0.55;
    const scroll = (t * 9) % 96;
    const wob = Math.round(Math.sin(t * 0.7) * 1.5);
    const px = ((sx % 48) + 48) % 48;
    const py = (((sy - scroll) % 96) + 96) % 96;
    sc.translate(-px - 48 + wob, -py - 96);
    sc.fillStyle = this.pattern;
    sc.fillRect(0, 0, lw + 100, lh + 200);
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalAlpha = 1;
    sc.globalCompositeOperation = 'source-over';
    // Lightning can push the layer past 1: add it in whole passes.
    for (let a = alpha; a > 0.003; a -= 1) {
      lc.globalAlpha = Math.min(1, a);
      lc.drawImage(this.scratch, 0, 0);
    }
    lc.globalAlpha = 1;
  }

  /** Moonlight luminance at a world point (lightAt). */
  at(x, y, lift) {
    if (!this.level) return 0;
    let v = 0;
    for (const s of this.shafts) {
      const u = (y - s.y0) / s.len;
      if (u < 0 || u > 1) continue;
      const a = s.x0 + 1 + (SKEW - SPREAD) * u;
      const b = s.x0 + 15 + (SKEW + SPREAD) * u;
      if (x < a || x > b) continue;
      v = Math.max(v, BASE * s.inten * (1 - u) * (1 - u * 0.4));
    }
    for (const g of this.glass) {
      if (x >= g.x0 && x < g.x1 && y >= g.y0 && y < g.y1) v = Math.max(v, 0.42 + 0.2 * ((y - g.y0) / (g.y1 - g.y0)));
    }
    return v * MOON_LUM * LAYER * this.level * lift;
  }

  /** Lightning: the glass blazes for a moment (additive, over the lit world). */
  flash(ctx, cam, map, windows, e, reduce, lightningColor) {
    if (e < 0.01 || !windows.length) return;
    ctx.globalAlpha = Math.min(1, e * (reduce ? 0.5 : 0.9));
    ctx.fillStyle = lightningColor;
    for (const w of windows) {
      const x = w.tx * TILE - cam.x;
      if (x < -16 || x > 480) continue;
      const tall = isTallWindow(map, w.tx, w.ty);
      const y = (tall ? w.ty - 1 : w.ty) * TILE - cam.y;
      ctx.fillRect(x + 2, y + 2, 12, tall ? 28 : 12);
    }
    ctx.globalAlpha = 1;
  }
}
