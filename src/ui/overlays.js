// CG backdrops and persistent overlays (drawn under dialogue).
//   cg(id | null, { fade })            480×270 art scaled 2×, cross-fades
//   setOverlay(name, params | null)    'locker' | 'vhs' | 'heads_down' | 'compact' | 'black'

import { HW } from '../engine/hw.js';
import { C, F, W, H } from './theme.js';
import { canvas, ctx2d, rect, dither, vignette, noiseFrame, triangle, keycap, AP, clamp, approach, ease } from './gfx.js';
import { hash2, rng } from '../art/util.js';
import * as svc from './services.js';

/** The compact mirror's glass circle, in WORLD px (the renderer draws the 1979 view inside it). */
export const COMPACT_CIRCLE = { x: 240, y: 135, r: 100 };

const LW = 480, LH = 270;

/** Draw one CG (by id) into a 480 offscreen, never throwing. */
function drawArt(c, id, t, params) {
  const x = ctx2d(c);
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  x.fillStyle = '#000';
  x.fillRect(0, 0, LW, LH);   // CGs are full-frame: never let the world show through gaps
  const art = svc.cgArt(id);
  try { art?.draw?.(x, t, params || {}); }
  catch (e) { svc.warnOnce('cg.draw:' + id, e); rect(x, 0, 0, LW, LH, '#06070a'); }
}

// ---- CG backdrop ---------------------------------------------------------------------------------
export class Backdrop {
  constructor() { this.layers = []; this.t = 0; }
  get active() { return this.layers.some((l) => l.target > 0); }
  set(id, o = {}) {
    const fade = o.fade ?? 0.6;
    const top = this.layers[this.layers.length - 1];
    if (id && top && top.id === id && top.target > 0) { Object.assign(top.params, o.params || {}); return Promise.resolve(); }
    for (const l of this.layers) { l.target = 0; l.rate = 1 / Math.max(0.01, fade); }
    if (!id) return this._wait(fade);
    const layer = { id, params: o.params || {}, alpha: fade > 0 ? 0 : 1, target: 1, rate: 1 / Math.max(0.01, fade), c: canvas(LW, LH), t0: this.t };
    this.layers.push(layer);
    return this._wait(fade);
  }
  setParams(params) { const l = this.layers[this.layers.length - 1]; if (l) Object.assign(l.params, params); }
  _wait(sec) { return new Promise((r) => setTimeout(r, Math.max(0, sec * 1000))); }
  update(dt) {
    this.t += dt;
    for (const l of this.layers) l.alpha = approach(l.alpha, l.target, dt * l.rate);
    this.layers = this.layers.filter((l) => l.alpha > 0 || l.target > 0);
  }
  render(ctx) {
    for (const l of this.layers) {
      if (l.alpha <= 0) continue;
      drawArt(l.c, l.id, this.t - l.t0, l.params);
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * l.alpha;
      ctx.drawImage(l.c, 0, 0, W, H);
      ctx.globalAlpha = a0;
    }
  }
  clear() { this.layers = []; }
}

// ---- overlays ------------------------------------------------------------------------------------
const ORDER = ['locker', 'vhs', 'compact', 'heads_down', 'black'];

export class Overlays {
  constructor() {
    this.items = new Map();  // name → { params, alpha, on, t }
    this.t = 0;
    this.c480 = canvas(LW, LH);
    this.fx480 = canvas(LW, LH);
    this.tmp480 = canvas(LW, LH);
  }
  get active() { for (const o of this.items.values()) if (o.on) return true; return false; }
  has(name) { return !!this.items.get(name)?.on; }
  set(name, params) {
    if (!ORDER.includes(name)) { svc.warnOnce('overlay:' + name, 'unknown overlay'); return; }
    let o = this.items.get(name);
    if (params === null || params === undefined || params === false) { if (o) o.on = false; return; }
    if (!o) { o = { params: {}, alpha: 0, on: true, t: 0 }; this.items.set(name, o); }
    if (!o.on) { o.on = true; }
    Object.assign(o.params, params === true ? {} : params);
    if (name === 'compact' && params.on === false) o.on = false;
  }
  clear() { this.items.clear(); }
  update(dt) {
    this.t += dt;
    for (const [k, o] of this.items) {
      o.t += dt;
      const rate = k === 'black' ? 1 / 0.05 : k === 'compact' ? 1 / 0.3 : 1 / 0.25;
      o.alpha = approach(o.alpha, o.on ? 1 : 0, dt * rate);
      if (!o.on && o.alpha <= 0) this.items.delete(k);
    }
  }
  render(ctx) {
    for (const k of ORDER) {
      const o = this.items.get(k);
      if (!o || o.alpha <= 0) continue;
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * o.alpha;
      this[k](ctx, o);
      ctx.globalAlpha = a0;
    }
  }

  // -- 'locker': the view through the vent slits, plus close, breathing darkness
  locker(ctx, o) {
    drawArt(this.c480, 'locker_slits', o.t, o.params);
    ctx.drawImage(this.c480, 0, 0, W, H);
    const breath = 0.5 + 0.5 * Math.sin(this.t * 1.4);
    vignette(ctx, 0.75 + breath * 0.1, 0.62);
    // in free play, a quiet reminder of how to get out
    if (HW.game?.mode === 'play' && HW.player?.hidden) {
      const a = clamp((o.t - 1.2) / 0.8) * 0.8;
      if (a > 0) {
        const f = F.small, key = HW.ui?.input?.keyLabel?.('confirm') || 'Z';
        const label = 'C L I M B   O U T';
        const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * a;
        keycap(ctx, W - 40 - f.width(label) - 44, H - 40, key, f, { face: '#8a8270', hi: '#a89f88', lo: '#5d574a' });
        f.draw(ctx, label, W - 40, H - 40, '#8a8478', { align: 'right' });
        ctx.globalAlpha = a0;
      }
    }
  }

  // -- 'vhs': tape playback (frames from the colonel CG) with tracking noise, chroma bleed, jitter
  vhs(ctx, o) {
    const p = o.params;
    const src = this.c480, out = this.fx480, tmp = this.tmp480;
    const sx = ctx2d(out);
    sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalAlpha = 1; sx.globalCompositeOperation = 'source-over';
    if (p.blue) {
      rect(sx, 0, 0, LW, LH, '#1a2fb0');
      dither(sx, 0, 0, LW, LH, '#2438c8', 0.25, 1);
    } else {
      drawArt(src, 'vhs_frames', o.t, p);
      const tick = Math.floor(this.t * 30);
      sx.clearRect(0, 0, LW, LH);
      // horizontal jitter in bands (head-switching wobble, stronger near the bottom)
      const band = 6;
      for (let y = 0; y < LH; y += band) {
        let dx = (hash2(tick, y) % 3) - 1;
        if (y > LH - 24) dx += (hash2(tick, y + 1) % 7) - 3;
        sx.drawImage(src, 0, y, LW, band, dx, y, LW, band);
      }
      // chroma bleed: a red-only copy shifted right, a blue-only copy shifted left
      const tx = ctx2d(tmp);
      for (const [col, off] of [['#ff2020', 2], ['#2040ff', -1]]) {
        tx.globalCompositeOperation = 'source-over'; tx.clearRect(0, 0, LW, LH); tx.drawImage(out, 0, 0);
        tx.globalCompositeOperation = 'multiply'; tx.fillStyle = col; tx.fillRect(0, 0, LW, LH);
        tx.globalCompositeOperation = 'destination-in'; tx.drawImage(out, 0, 0);
        sx.globalCompositeOperation = 'lighter'; sx.globalAlpha = 0.32; sx.drawImage(tmp, off, 0);
      }
      sx.globalCompositeOperation = 'source-over'; sx.globalAlpha = 1;
      // rolling tracking-noise band + bottom head-switch noise
      const ny = Math.floor((this.t * 37) % (LH + 60)) - 30;
      const nf = noiseFrame(tick);
      sx.globalAlpha = 0.5; sx.drawImage(nf, 0, ny, LW, 10, (hash2(tick, 3) % 9) - 4, ny, LW, 10);
      sx.globalAlpha = 0.75; sx.drawImage(nf, 0, LH - 8, LW, 8, 0, LH - 8, LW, 8);
      sx.globalAlpha = 0.07; sx.drawImage(nf, 0, 0);
      sx.globalAlpha = 1;
      // scanline darkening
      for (let y = 1; y < LH; y += 2) { sx.fillStyle = 'rgba(0,0,0,0.18)'; sx.fillRect(0, y, LW, 1); }
    }
    ctx.drawImage(out, 0, 0, W, H);
    // on-screen display (camcorder OSD): chunky white with a dark drop shadow
    const f = F.monoL;
    const osd = (s, x, y, align) => { f.draw(ctx, s, x + AP, y + AP, '#101010', { align }); f.draw(ctx, s, x, y, '#f4f4ec', { align }); };
    const blink = Math.floor(this.t * 1.6) % 2 === 0;
    if (p.blue) {
      osd('PLAY', W / 2 + 18, H / 2 - 22, 'center');
      triangle(ctx, W / 2 - 62, H / 2 - 14, 9, '#f4f4ec', 'right');
    } else {
      osd('PLAY', 56, 34);
      if (blink) { triangle(ctx, 144 + AP, 42 + AP, 8, '#101010', 'right'); triangle(ctx, 144, 42, 8, '#f4f4ec', 'right'); }
      const ts = p.timestamp || 'OCT 18 1996 10:41PM';
      const [date, time] = splitStamp(ts);
      osd(time, W - 56, H - 108, 'right');
      osd(date, W - 56, H - 72, 'right');
      osd('SP', 56, H - 72);
    }
  }

  // -- 'heads_down': head on the desk, eyes shut — a dark tunnel that breathes
  heads_down(ctx, o) {
    const breath = 0.5 + 0.5 * Math.sin(this.t * 1.15);
    const r = 0.05 + breath * 0.1;
    rect(ctx, 0, 0, W, H, 'rgba(0,0,0,0.6)');
    vignette(ctx, 1, Math.round(r * 20) / 20);
  }

  // -- 'compact': Mom's cracked compact mirror; the world renderer draws the 1979 view inside
  compact(ctx, o) {
    const k = ease.outBack(clamp(o.t / 0.35));
    const c = compactFrame();
    const s = 0.86 + 0.14 * k;
    const w = W * s, h = H * s;
    ctx.drawImage(c, Math.round(W / 2 - w / 2), Math.round(H / 2 - h / 2), Math.round(w), Math.round(h));
    // fill beyond the scaled frame while it opens
    if (s < 1) {
      const x0 = Math.round(W / 2 - w / 2), y0 = Math.round(H / 2 - h / 2);
      rect(ctx, 0, 0, W, y0, '#030305'); rect(ctx, 0, y0 + Math.round(h), W, H, '#030305');
      rect(ctx, 0, 0, x0, H, '#030305'); rect(ctx, x0 + Math.round(w), 0, W, H, '#030305');
    }
    // faint glass glints drifting over the mirror
    const gx = 480 - 120 + Math.round(Math.sin(this.t * 0.4) * 10) * AP;
    dither(ctx, gx, 150, 16, 40, 'rgba(255,250,235,0.5)', 0.18);
    // what Tess notices in the old view (past.hint), as a passing thought under the mirror
    const hint = o.params.hint;
    if (hint && o.params.on !== false) {
      const a = clamp((o.t - 0.8) / 0.6);
      if (a > 0) F.bodyIt.draw(ctx, hint, W / 2, H - 42, C.think, { align: 'center', alpha: a });
    }
  }

  black(ctx, o) { rect(ctx, 0, 0, W, H, `rgba(0,0,0,${clamp(o.params.alpha ?? 1)})`); }
}

function splitStamp(ts) {
  const m = String(ts).match(/^(.*\d{4})\s+(.*)$/);
  return m ? [m[1], m[2]] : [String(ts), ''];
}

let compactCanvas = null;
/** Static compact frame at 480×270 (scaled ×2 when drawn): dark surround, metal rim, hinge, crack. */
function compactFrame() {
  if (compactCanvas) return compactCanvas;
  const c = canvas(LW, LH); const x = ctx2d(c);
  const { x: cx, y: cy, r } = COMPACT_CIRCLE;
  const r2 = (r + 0.5) ** 2;
  const rnd = rng(77);
  // surround: near-black with a faint warm-dark dither (Tess's hand / jacket in shadow)
  for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) {
    const dx = i + 0.5 - cx, dy = j + 0.5 - cy, d2 = dx * dx + dy * dy;
    if (d2 <= r2) continue;
    const d = Math.sqrt(d2);
    let col = '#030305';
    if (d <= r + 3) col = '#2c2a2c';
    else if (d <= r + 9) {
      // rim: brushed brass-silver, lit from the top-left
      const lit = (-dx - dy) / d;
      col = lit > 0.55 ? '#d8cfae' : lit > 0.15 ? '#a99a6c' : lit > -0.35 ? '#7a6c48' : '#4a4030';
      if ((i * 7 + j * 3) % 11 === 0) col = '#5d5238';
    } else if (d <= r + 11) col = '#17140f';
    else if (d <= r + 13 && j < cy) col = '#0d0c0e';
    x.fillStyle = col; x.fillRect(i, j, 1, 1);
  }
  // hinge at the top
  rect(x, cx - 14, cy - r - 16, 28, 6, '#5d5238'); rect(x, cx - 14, cy - r - 16, 28, 2, '#bfb28a');
  rect(x, cx - 10, cy - r - 12, 4, 4, '#2a251b'); rect(x, cx + 6, cy - r - 12, 4, 4, '#2a251b');
  // the crack: a jagged line across the glass with a short branch; bright core, dark edge
  const crack = (pts) => {
    for (let n = 0; n < pts.length - 1; n++) {
      const [ax, ay] = pts[n], [bx, by] = pts[n + 1];
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let s = 0; s <= steps; s++) {
        const px = Math.round(ax + (bx - ax) * s / steps), py = Math.round(ay + (by - ay) * s / steps);
        if ((px - cx) ** 2 + (py - cy) ** 2 > (r - 1) ** 2) continue;
        x.fillStyle = 'rgba(10,10,14,0.55)'; x.fillRect(px + 1, py + 1, 1, 1);
        x.fillStyle = 'rgba(240,236,226,0.75)'; x.fillRect(px, py, 1, 1);
      }
    }
  };
  const main = [[cx - 96, cy - 30]];
  let px = cx - 96, py = cy - 30;
  while (px < cx + 96) { px += 6 + Math.floor(rnd() * 10); py += Math.floor(rnd() * 9) - 2; main.push([px, py]); }
  crack(main);
  const mid = main[Math.floor(main.length / 2)];
  crack([mid, [mid[0] + 8, mid[1] - 14], [mid[0] + 12, mid[1] - 30], [mid[0] + 20, mid[1] - 38]]);
  crack([main[3], [main[3][0] - 4, main[3][1] + 16], [main[3][0] + 2, main[3][1] + 30]]);
  compactCanvas = c;
  return c;
}
