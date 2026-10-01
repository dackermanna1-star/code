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
  const c = s.ctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, cw, ch);
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
