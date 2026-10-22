// Display: the on-screen canvas plus two offscreen buffers (TECH §3).
//   world buffer 480×270 — the game world, drawn by render/renderer.js
//   UI buffer    960×540 — dialogue, menus, HUD (one UI pixel = ½ world pixel), drawn by HW.ui
// Both are composited each frame onto the screen canvas at the same rect, letterboxed in black.
//
// Scaling (tech-18): by default the image fills the window. When a whole-number scale is within 6 %
// of the fit it is used as is (perfectly crisp: 960×540, 1920×1080, 1440×810…); otherwise the fit is
// fractional and drawn "sharp": each layer is first blown up by the next whole number with nearest
// neighbour, then scaled down to the fit with smoothing, so every art pixel keeps the same size and
// only its edges are blended — no uneven 2-3-2 pixel columns, no blur. settings.pixelPerfect forces
// the strict whole-number scale (smaller, black border) instead.
import HW from './hw.js';

export const WORLD_W = 480;
export const WORLD_H = 270;
export const UI_W = 960;
export const UI_H = 540;
const MAX_BACKING_PIXELS = 3840 * 2160; // cap the backing store on very large / high-DPI screens
const SNAP = 0.94; // use the whole-number scale when it is at least this much of the fit

function makeBuffer(w, h, opts) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', opts);
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

const isWhole = (k) => Math.abs(k - Math.round(k)) < 1e-6;

export function createDisplay(canvas) {
  // The world buffer stays GPU-friendly (no willReadFrequently): the post FX pixel pass copies it into
  // its own CPU-side canvas and reads that back (render/fx_post.js), so nothing getImageData's it.
  const [world, worldCtx] = makeBuffer(WORLD_W, WORLD_H);
  const [ui, uiCtx] = makeBuffer(UI_W, UI_H);
  const ctx = canvas.getContext('2d', { alpha: false });
  // Sharp-scaling intermediates (one per layer), sized on demand.
  const pre = new Map();
  function prescaled(src, n) {
    let p = pre.get(src);
    if (!p) {
      p = makeBuffer(1, 1);
      pre.set(src, p);
    }
    const [c, x] = p;
    const w = src.width * n;
    const h = src.height * n;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      x.imageSmoothingEnabled = false;
    } else x.clearRect(0, 0, w, h);
    x.drawImage(src, 0, 0, w, h);
    return c;
  }
  /** Draw one layer at scale k (screen px per layer px) into rect r. */
  function blitLayer(src, r, k) {
    if (k >= 1 && isWhole(k)) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, r.x, r.y, r.w, r.h);
    } else if (k > 1) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'low'; // plain bilinear: blends only the edges of the blown-up pixels
      ctx.drawImage(prescaled(src, Math.ceil(k)), r.x, r.y, r.w, r.h);
    } else {
      ctx.imageSmoothingEnabled = true; // smaller than the buffer (a phone held upright): filter it down
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, r.x, r.y, r.w, r.h);
    }
  }

  const display = {
    W: WORLD_W, H: WORLD_H, UI_W, UI_H,
    screen: canvas, ctx,
    world, worldCtx, ui, uiCtx,
    /** Screen pixels per world pixel (fractional when the window doesn't fit a whole number). */
    scale: 1,
    /** Destination rect of the game image on the screen canvas, in canvas (device) pixels. */
    rect: { x: 0, y: 0, w: WORLD_W, h: WORLD_H },
    dpr: 1,
    /** Strict whole-number scaling (settings.pixelPerfect); off = fill the window, sharp. */
    pixelPerfect: false,

    resize() {
      let dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || window.innerWidth || WORLD_W;
      const cssH = canvas.clientHeight || window.innerHeight || WORLD_H;
      if (cssW * cssH * dpr * dpr > MAX_BACKING_PIXELS) dpr = Math.sqrt(MAX_BACKING_PIXELS / (cssW * cssH));
      const cw = Math.max(1, Math.round(cssW * dpr));
      const ch = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      let s = Math.min(cw / WORLD_W, ch / WORLD_H);
      if (s >= 1 && (this.pixelPerfect || Math.floor(s) / s >= SNAP)) s = Math.floor(s);
      const w = Math.round(WORLD_W * s);
      const h = Math.round(WORLD_H * s);
      this.scale = s;
      this.dpr = dpr;
      this.rect.x = (cw - w) >> 1;
      this.rect.y = (ch - h) >> 1;
      this.rect.w = w;
      this.rect.h = h;
    },

    applySettings(v) {
      const pp = v?.pixelPerfect === true;
      if (pp !== this.pixelPerfect) {
        this.pixelPerfect = pp;
        this.resize();
      }
    },

    /** Composite world + UI buffers onto the screen. */
    present() {
      const r = this.rect;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      blitLayer(world, r, r.w / WORLD_W);
      // The UI layer is twice the world resolution, so at an odd whole scale (×3) its own scale is
      // fractional (×1.5) and it goes through the sharp path too: text stays evenly weighted.
      blitLayer(ui, r, r.w / UI_W);
    },

    /** Client (CSS px) → UI-buffer coordinates. Writes into `out` to avoid allocation. */
    toUI(clientX, clientY, out = { x: 0, y: 0 }) {
      const b = canvas.getBoundingClientRect();
      const sx = canvas.width / (b.width || 1);
      const sy = canvas.height / (b.height || 1);
      out.x = (((clientX - b.left) * sx - this.rect.x) / this.rect.w) * UI_W;
      out.y = (((clientY - b.top) * sy - this.rect.y) / this.rect.h) * UI_H;
      return out;
    },

    get fullscreen() {
      return !!document.fullscreenElement;
    },

    async toggleFullscreen(force) {
      const want = force === undefined ? !document.fullscreenElement : !!force;
      try {
        if (want && !document.fullscreenElement) await document.documentElement.requestFullscreen?.();
        else if (!want && document.fullscreenElement) await document.exitFullscreen?.();
      } catch (e) {
        console.warn('[display] fullscreen request refused', e?.message || e);
      }
      this._syncFullscreen();
    },

    /** settings.fullscreen mirrors the live state (Esc / F11 / the browser's own controls too). */
    _syncFullscreen() {
      if (HW.settings?.values) HW.settings.values.fullscreen = !!document.fullscreenElement;
    },

    /** Settings-screen helpers (aliases used by the UI). */
    setFullscreen(on) { return this.toggleFullscreen(!!on); },
    setPixelPerfect(on) { this.applySettings({ pixelPerfect: !!on }); },

    /** Minimal loading screen shown while art is generated (before the loop runs). */
    drawLoading(progress, label = 'loading') {
      const g = worldCtx;
      g.fillStyle = '#000';
      g.fillRect(0, 0, WORLD_W, WORLD_H);
      const w = 160;
      const x = (WORLD_W - w) >> 1;
      const y = 150;
      g.fillStyle = '#272834';
      g.fillRect(x, y, w, 3);
      g.fillStyle = '#c4bdb0';
      g.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, progress))), 3);
      uiCtx.clearRect(0, 0, UI_W, UI_H);
      uiCtx.fillStyle = '#9c9897';
      uiCtx.textAlign = 'center';
      uiCtx.textBaseline = 'alphabetic';
      uiCtx.font = '600 44px "Pixelify Sans", monospace';
      uiCtx.fillText('HALLOWELL', UI_W / 2, 260);
      uiCtx.font = '20px "Pixelify Sans", monospace';
      uiCtx.fillStyle = '#52525e';
      uiCtx.fillText(label, UI_W / 2, 336);
      this.present();
    },

    /** Fatal boot error: show it on screen so a broken build is never just a black page. */
    drawError(message) {
      worldCtx.fillStyle = '#000';
      worldCtx.fillRect(0, 0, WORLD_W, WORLD_H);
      uiCtx.clearRect(0, 0, UI_W, UI_H);
      uiCtx.fillStyle = '#c8423b';
      uiCtx.textAlign = 'left';
      uiCtx.font = '20px monospace';
      String(message).split('\n').slice(0, 20).forEach((line, i) => uiCtx.fillText(line.slice(0, 90), 24, 40 + i * 24));
      this.present();
    },
  };

  window.addEventListener('resize', () => display.resize());
  document.addEventListener('fullscreenchange', () => {
    display.resize();
    display._syncFullscreen();
  });
  display.resize();
  return display;
}
