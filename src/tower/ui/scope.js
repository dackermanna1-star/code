// LAST LOOKOUT — the scope overlay. Two canvases, both redrawn only on resize / mode change:
//   mask    low resolution (2 CSS px cells, nearest upscale): the black tube surround, a dithered
//           lens-edge falloff, a red/cyan chromatic fringe on the rim, a faint lens tint and a
//           reflection arc. It eases in with S.scope (the tube "arrives") and drifts a hair with
//           the sway, like an eye that is not quite centred behind the glass.
//   reticle full device resolution: a mil-dot reticle with duplex posts and holdover numbers,
//           pixel-snapped; black by day, illuminated red at night or in thermal.
// Readouts are DOM text in the pixel font: rangefinder LED inside the glass, zoom and wind
// outside, the breath gauge, thermal / focus tags.

import { el, setText, setStyle, toggle, SegBar } from './dom.js';
import { hudIcon, sprite, PAL } from './sprites.js';
import { drawPixelText } from './pixelFont.js';
import { formatRange, formatZoom, formatSpeed, frac } from './format.js';

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const CELL = 2; // CSS px per mask pixel
const NO_WIND = Object.freeze({ speed: 0, dirScreen: 0 });

function windArrow() {
  return sprite('windArrow', 18, 18, (P) => {
    const c = PAL.amber;
    P.r(2, 8, 10, 2, c);
    for (let i = 0; i < 5; i++) P.r(11 + i, 4 + i, 1, 10 - 2 * i, c);
    P.r(2, 6, 1, 6, PAL.amberD);
  });
}

export class ScopeOverlay {
  constructor(parent) {
    this.el = el('div', 'scope', parent);
    this.mask = el('canvas', 'mask', this.el);
    this.ret = el('canvas', 'ret', this.el);
    this.ret.style.imageRendering = 'auto';
    // readouts
    this.layer = el('div', 'ro-layer', this.el);
    this.rng = el('div', 'ro rng', this.layer);
    el('span', 'lbl', this.rng, 'RANGE');
    const rv = el('div', '', this.rng);
    rv.style.position = 'relative';
    this.rngGhost = el('div', 'v ghost', rv, '888 m');
    this.rngV = el('div', 'v', rv, '---');
    this.zoom = el('div', 'ro zoom', this.layer);
    el('span', 'lbl', this.zoom, 'ZOOM');
    this.zoomV = el('div', 'v', this.zoom, '4.0×');
    this.wind = el('div', 'ro wind', this.layer);
    el('span', 'lbl', this.wind, 'WIND');
    const wl = el('div', '', this.wind);
    this.windArrow = el('canvas', '', wl);
    const wa = windArrow();
    this.windArrow.width = wa.width;
    this.windArrow.height = wa.height;
    this.windArrow.getContext('2d').drawImage(wa, 0, 0);
    this.windV = el('span', 'v', wl, '0.0 m/s');
    this.brth = el('div', 'ro brth', this.layer);
    this.brthLbl = el('span', 'lbl', this.brth, 'BREATH');
    const brow = el('div', 'brow', this.brth);
    const lungs = el('canvas', '', brow);
    const li = hudIcon('lungs');
    lungs.width = li.width;
    lungs.height = li.height;
    lungs.getContext('2d').drawImage(li, 0, 0);
    this.brthBar = new SegBar(brow, 'hp');
    this.fg = el('div', 'fgauge', this.zoom);
    const fi = el('canvas', '', this.fg);
    const fic = hudIcon('focus');
    fi.width = fic.width;
    fi.height = fic.height;
    fi.getContext('2d').drawImage(fic, 0, 0);
    this.fgBar = new SegBar(this.fg);
    el('span', 'key', this.fg, 'F');
    this.tags = el('div', 'ro tags', this.layer);
    this.tagThermal = el('span', 'tag th hide', this.tags, 'THERMAL · WHT');
    this.tagFocus = el('span', 'tag fo hide', this.tags, 'FOCUS');

    this.readouts = [this.rng, this.zoom, this.wind, this.brth, this.tags];
    this.k = 1;
    this.cache = { range: null, zoom: null, wind: null, dir: null };
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.R = 100;
    this.night = false;
    this.lit = false;
    this.vis = -1;
    this.t = 0;
    this.kick = 0;
  }

  /** Lays out and redraws both canvases for a viewport of w×h CSS px at the given DPR. */
  /** k: the UI scale (the readout layer is zoomed by it; positions are given in viewport px). */
  resize(w, h, dpr, k = 1) {
    this.w = w;
    this.h = h;
    this.k = k;
    this.dpr = Math.max(1, Math.min(3, dpr || 1));
    const R = (this.R = Math.round(Math.min(w, h) * 0.47));
    const cx = w / 2, cy = h / 2;
    this._drawMask();
    this._drawReticle();
    // readout positions
    const side = cx - R;
    const wide = side >= 200 * k;
    const px = (v) => `${Math.round(v / k)}px`;
    const place = (e, o) => {
      e.style.left = o.left !== undefined ? px(o.left) : 'auto';
      e.style.right = o.right !== undefined ? px(o.right) : 'auto';
      e.style.top = px(o.top);
      e.style.transform = 'none';
    };
    // off the vertical post: range low-right inside the glass, tags high-left
    place(this.rng, { left: cx + R * 0.2, top: cy + R * 0.6 });
    place(this.tags, { right: w - (cx - R * 0.12), top: cy - R * 0.62 });
    if (wide) {
      const gap = 36 * k;
      place(this.wind, { right: w - (cx - R - gap), top: cy - 70 * k });
      place(this.zoom, { left: cx + R + gap, top: cy - 70 * k });
      place(this.brth, { right: w - (cx - R - gap), top: cy + 40 * k });
    } else {
      place(this.wind, { right: w - 24 * k, top: h - 150 * k });
      place(this.zoom, { left: 24 * k, top: h - 150 * k });
      place(this.brth, { left: cx - 100 * k, top: h - 34 * k });
    }
    this.vis = -1;
  }

  _drawMask() {
    const { w, h } = this;
    const mw = Math.ceil(w / CELL) + 1, mh = Math.ceil(h / CELL) + 1;
    const cv = this.mask;
    cv.width = mw;
    cv.height = mh;
    cv.style.width = `${mw * CELL}px`;
    cv.style.height = `${mh * CELL}px`;
    cv.style.transformOrigin = `${w / 2}px ${h / 2}px`;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(mw, mh);
    const d = img.data;
    const R = this.R, cx = w / 2, cy = h / 2;
    const inner = 0.83; // where the edge falloff starts (fraction of R)
    const fr = 2.2 * CELL; // width of the colour fringe in CSS px
    for (let y = 0; y < mh; y++) {
      const py = (y + 0.5) * CELL - cy;
      for (let x = 0; x < mw; x++) {
        const px = (x + 0.5) * CELL - cx;
        const i = (y * mw + x) * 4;
        const th = BAYER4[(y & 3) * 4 + (x & 3)];
        const r = Math.sqrt(px * px + py * py) / R;
        if (r >= 1.035) {
          d[i + 3] = 255;
          continue;
        }
        let a = 0, cr = 0, cg = 0, cb = 0;
        if (r < inner) {
          // faint olive lens tint and the reflection arc of the objective
          a = 0.06;
          cr = 34;
          cg = 44;
          cb = 18;
          const ang = Math.atan2(py, px);
          const arc = Math.exp(-(((r - 0.66) / 0.07) ** 2)) * Math.max(0, Math.cos(ang + 2.25)) ** 6;
          const glint = Math.exp(-(((r - 0.5) / 0.04) ** 2)) * Math.max(0, Math.cos(ang - 0.8)) ** 24;
          const ref = arc * 0.075 + glint * 0.05;
          if (ref > 0.01) {
            const k = ref / (ref + a);
            cr = cr * (1 - k) + 210 * k;
            cg = cg * (1 - k) + 232 * k;
            cb = cb * (1 - k) + 255 * k;
            a += ref;
          }
        } else {
          // dithered fall-off to black, in 5 levels
          const e = Math.min(1, (r - inner) / (1 - inner));
          const v = e * e * (3 - 2 * e);
          a = Math.min(1, Math.floor(v * v * 4 + th) / 4 + 0.0);
          // chromatic fringe: a thin, dim colour rim just inside the edge (warm toward the
          // top-left, cold toward the bottom-right), strongest along the diagonal
          if (r >= 1 - fr / R && r < 1) {
            const side = (px + py) / (Math.SQRT2 * Math.max(1, r * R));
            const k = Math.abs(side);
            if (k > 0.25 && th < 0.55 + 0.4 * k) {
              a = 0.62;
              cr = side < 0 ? 96 : 10;
              cg = side < 0 ? 22 : 62;
              cb = side < 0 ? 12 : 72;
            }
          }
          if (r >= 1) a = 1;
        }
        d[i] = cr;
        d[i + 1] = cg;
        d[i + 2] = cb;
        d[i + 3] = Math.round(255 * Math.min(1, a));
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  _drawReticle() {
    const { w, h, dpr } = this;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    const cv = this.ret;
    cv.width = W;
    cv.height = H;
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const R = this.R * dpr;
    const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
    const lit = this.lit;
    const col = lit ? '#e2401f' : 'rgba(6,7,5,0.94)';
    const fine = Math.max(1, Math.round(dpr * 0.75));
    const post = Math.max(3, Math.round(4 * dpr));
    const dot = Math.max(3, Math.round(3 * dpr)) | 1;
    const m = R * 0.1; // one "mil"
    // a faint light halo keeps the fine cross readable over a dark field without "lighting" it
    if (!lit) {
      ctx.fillStyle = 'rgba(255,236,200,0.16)';
      const hf = Math.floor(fine / 2), o = Math.max(1, Math.round(dpr * 0.5));
      ctx.fillRect(Math.round(cx - 5 * m), cy - hf - o, Math.round(10 * m), fine + 2 * o);
      ctx.fillRect(cx - hf - o, Math.round(cy - 5 * m), fine + 2 * o, Math.round(10 * m));
    }
    const draw = () => {
      ctx.fillStyle = col;
      const hf = Math.floor(fine / 2), hp = Math.floor(post / 2);
      // fine crosshair (inside 5 mils)
      ctx.fillRect(Math.round(cx - 5 * m), cy - hf, Math.round(10 * m), fine);
      ctx.fillRect(cx - hf, Math.round(cy - 5 * m), fine, Math.round(10 * m));
      // duplex posts from 5 mils out past the rim
      const p0 = Math.round(5 * m), p1 = Math.round(R + 8 * dpr);
      ctx.fillRect(cx + p0, cy - hp, p1 - p0, post);
      ctx.fillRect(cx - p1, cy - hp, p1 - p0, post);
      ctx.fillRect(cx - hp, cy + p0, post, p1 - p0);
      ctx.fillRect(cx - hp, cy - p1, post, p1 - p0);
      // mil dots
      const hd = Math.floor(dot / 2);
      for (let k = 1; k <= 4; k++) {
        const o = Math.round(k * m);
        ctx.fillRect(cx + o - hd, cy - hd, dot, dot);
        ctx.fillRect(cx - o - hd, cy - hd, dot, dot);
        ctx.fillRect(cx - hd, cy - o - hd, dot, dot);
        ctx.fillRect(cx - hd, cy + o - hd, dot, dot);
      }
      // holdover hashes and numbers under the centre (half mils)
      const s = Math.max(1, Math.round(dpr * 1.5));
      for (let k = 1; k <= 4; k++) {
        const y = Math.round(cy + (k - 0.5) * m);
        const half = Math.round(m * (0.22 + 0.04 * k));
        ctx.fillRect(cx - half, y - hf, half * 2, fine);
      }
      for (let k = 2; k <= 4; k++) {
        const y = Math.round(cy + k * m) - Math.round(3.5 * s);
        drawPixelText(ctx, String(k), cx + Math.round(m * 0.42), y, s, col);
      }
      // centre: a tiny gap ring so the target stays visible under the cross
      if (lit) {
        ctx.fillStyle = '#ff6a3a';
        ctx.fillRect(cx - hf - fine, cy - hf - fine, fine * 3, fine * 3);
      }
    };
    if (lit) {
      ctx.save();
      ctx.shadowColor = 'rgba(255,60,20,0.9)';
      ctx.shadowBlur = 6 * dpr;
      draw();
      ctx.restore();
    }
    draw();
  }

  /** Brief recoil jolt of the tube (event 'shot'). */
  shot() {
    this.kick = 1;
  }

  update(dt, S) {
    this.t += dt;
    const s = frac(S.scope);
    const on = s > 0.002;
    if (!on) {
      if (this.vis !== 0) {
        this.vis = 0;
        this.el.style.display = 'none';
      }
      return;
    }
    if (this.vis !== 1) {
      this.vis = 1;
      this.el.style.display = 'block';
    }
    // illuminated reticle at night / in thermal
    const lit = !!S.thermal || num(S.timeOfDay) > 0.45;
    if (lit !== this.lit) {
      this.lit = lit;
      this._drawReticle();
    }
    // tube arrives: scale from far out to 1, mask fades in quickly
    this.kick = Math.max(0, this.kick - dt * 6);
    const e = 1 - s;
    const sway = frac(S.sway);
    const amp = this.R * 0.012 * sway;
    const t = this.t;
    const ox = amp * (Math.sin(t * 1.3) * 0.7 + Math.sin(t * 2.9 + 1.7) * 0.3);
    const oy = amp * (Math.sin(t * 1.7 + 0.5) * 0.6 + Math.sin(t * 3.3) * 0.4);
    const sc = 1 + 1.6 * e * e + this.kick * 0.035;
    setStyle(this.mask, 'transform', `translate(${ox.toFixed(1)}px,${(oy + this.kick * 6).toFixed(1)}px) scale(${sc.toFixed(4)})`);
    const sq = Math.round(s * 100);
    if (sq !== this.cache.s) {
      this.cache.s = sq;
      setStyle(this.el, 'opacity', Math.min(1, s * 1.6).toFixed(3));
      const roS = (s > 0.75 ? (s - 0.75) / 0.25 : 0).toFixed(2);
      setStyle(this.ret, 'opacity', (s > 0.5 ? (s - 0.5) / 0.5 : 0).toFixed(2));
      for (const r of this.readouts) setStyle(r, 'opacity', roS);
    }
    // readouts
    // text only when the shown value changes (no strings built per frame)
    const C = this.cache;
    const rq = Number.isFinite(S.rangeM) ? Math.round(S.rangeM) : -1;
    if (rq !== C.range) {
      C.range = rq;
      setText(this.rngV, formatRange(S.rangeM));
      setStyle(this.rngV, 'opacity', rq >= 0 ? '1' : '0.45');
    }
    const zq = Math.round(num(S.zoom, 1) * 10);
    if (zq !== C.zoom) {
      C.zoom = zq;
      setText(this.zoomV, formatZoom(S.zoom));
    }
    const wind = S.wind || NO_WIND;
    const wq = Math.round(num(wind.speed) * 10);
    if (wq !== C.wind) {
      C.wind = wq;
      setText(this.windV, formatSpeed(wind.speed));
    }
    const dq = Math.round(num(wind.dirScreen) * 100);
    if (dq !== C.dir) {
      C.dir = dq;
      setStyle(this.windArrow, 'transform', `rotate(${(-dq / 100).toFixed(2)}rad)`);
    }
    const br = frac(S.breath ?? 1);
    this.brthBar.set(br);
    this.brthBar.tick(dt);
    toggle(this.brth, 'hold', !!S.holding);
    toggle(this.brth, 'low', br < 0.25);
    setText(this.brthLbl, S.holding ? 'HOLD' : br < 0.25 ? 'GASP' : 'BREATH');
    const fo = frac(S.focus);
    this.fgBar.set(fo);
    this.fgBar.tick(dt);
    toggle(this.fg, 'full', fo >= 0.999);
    toggle(this.tagThermal, 'hide', !S.thermal);
    toggle(this.tagFocus, 'hide', true); // the letterbox label says it
  }
}

function num(x, d = 0) {
  return typeof x === 'number' && Number.isFinite(x) ? x : d;
}
