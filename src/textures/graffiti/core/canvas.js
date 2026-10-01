// Canvas creation helpers. OffscreenCanvas when available, else a DOM canvas.
// All canvases are created CPU-backed (willReadFrequently) because the generator
// reads every era layer back for per-pixel aging; GPU-backed canvases would make
// those readbacks very slow, and mixing both kinds forces copies on drawImage.

let factory = null;

/** Override canvas creation, e.g. setCanvasFactory((w, h) => myCanvas). Pass null to reset. */
export function setCanvasFactory(fn) { factory = fn || null; }

export function createCanvas(w, h) {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  if (factory) return factory(w, h);
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  throw new Error('graffiti: no canvas implementation available');
}

export function get2d(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true, alpha: true });
}

/**
 * Restore a context to its default state and clear it. Reused canvases must not
 * leak state (lineCap, miterLimit, ...) into the next surface: results would then
 * depend on what was generated before.
 */
export function resetCtx(ctx, w, h) {
  if (typeof ctx.reset === 'function') {
    ctx.reset();
    return;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 10;
  ctx.lineWidth = 1;
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  if (ctx.setLineDash) ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.imageSmoothingEnabled = true;
  if ('filter' in ctx) ctx.filter = 'none';
  ctx.clearRect(0, 0, w, h);
}

// ---------------------------------------------------------------------------
// Scratch canvas pool. drawImage() from a CPU canvas snapshots the WHOLE source
// canvas, so scratch canvases are kept in tight size classes.

const free = new Map();
let live = 0;

function sizeClass(v) {
  if (v <= 256) return Math.ceil(v / 32) * 32;
  if (v <= 512) return Math.ceil(v / 64) * 64;
  return Math.ceil(v / 128) * 128;
}

export function acquireScratch(w, h) {
  const cw = sizeClass(Math.max(1, Math.ceil(w) + 2));
  const ch = sizeClass(Math.max(1, Math.ceil(h) + 2));
  const key = cw * 65536 + ch;
  const list = free.get(key);
  let s = list && list.pop();
  if (!s) {
    const canvas = createCanvas(cw, ch);
    s = { canvas, ctx: get2d(canvas), key };
    live++;
  }
  s.w = w;
  s.h = h;
  resetCtx(s.ctx, cw, ch);
  return s;
}

export function releaseScratch(s) {
  if (!s) return;
  let list = free.get(s.key);
  if (!list) { list = []; free.set(s.key, list); }
  if (list.length < 4) list.push(s);
  else live--;
}

/** Drop pooled scratch canvases (frees memory after a batch). */
export function clearScratchPool() { free.clear(); live = 0; }
