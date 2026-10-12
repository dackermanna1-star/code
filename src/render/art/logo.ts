// Noita-style main-menu backdrop: night sky, twinkling stars, layered jagged mountains and a misty band,
// painted at ~1/3 resolution and scaled up with hard pixels. Browser only.
import { PixelRng, mixHex } from './pixels';

const SKY_TOP = '#1a1530';
const SKY_MID = '#2a1d3c';
const SKY_HORIZON = '#3a2440';
const GLOW = '#7a3048'; // dusky red/violet horizon glow
const MOUNTAINS = ['#4a3e5c', '#3d3550', '#33304a', '#2b2838', '#1c1a26']; // far -> near
const PIXEL = 3; // screen pixels per art pixel

interface Star {
  x: number;
  y: number;
  base: number; // 0..1 brightness
  speed: number;
  phase: number;
  big: boolean;
  tint: string;
}

interface BackdropCache {
  w: number; // low-res size
  h: number;
  low: HTMLCanvasElement;
  lowCtx: CanvasRenderingContext2D;
  sky: HTMLCanvasElement;
  far: HTMLCanvasElement; // two farthest ridges (behind the mist)
  near: HTMLCanvasElement; // two nearest ridges (in front of the mist)
  mist: HTMLCanvasElement; // horizontally tileable cloud band
  mistY: number;
  stars: Star[];
}

let cache: BackdropCache | null = null;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('drawMenuBackdrop: 2D canvas unavailable');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

/** Jagged ridge heights (y per column) built from random-walk segments + midpoint jitter. */
function ridge(w: number, baseY: number, amp: number, rough: number, r: PixelRng): number[] {
  const pts: number[] = new Array(w).fill(baseY);
  // control peaks every 12..30 px, straight-ish slopes between them with stepped jitter
  let x = 0;
  let y = baseY - r.range(0, amp);
  const ctrl: Array<[number, number]> = [[0, y]];
  while (x < w) {
    x += r.int(Math.max(6, Math.floor(amp * 0.6)), Math.max(10, Math.floor(amp * 1.6)));
    const peak = r.chance(0.5);
    y = baseY - (peak ? r.range(amp * 0.55, amp) : r.range(0, amp * 0.45));
    ctrl.push([x, y]);
  }
  for (let i = 0; i + 1 < ctrl.length; i++) {
    const [x0, y0] = ctrl[i];
    const [x1, y1] = ctrl[i + 1];
    for (let xx = Math.floor(x0); xx < Math.min(w, x1); xx++) {
      const t = (xx - x0) / Math.max(1, x1 - x0);
      pts[xx] = y0 + (y1 - y0) * t;
    }
  }
  // stepped roughness: walk +-1 px, pulled back toward the slope line
  let off = 0;
  for (let i = 0; i < w; i++) {
    off += r.int(-1, 1) * rough;
    off *= 0.8;
    pts[i] = Math.round(pts[i] + off);
  }
  return pts;
}

function paintRidge(ctx: CanvasRenderingContext2D, ys: number[], h: number, color: string, rim: string, r: PixelRng): void {
  ctx.fillStyle = color;
  for (let x = 0; x < ys.length; x++) ctx.fillRect(x, ys[x], 1, h - ys[x]);
  // 1px moonlit rim on left-facing slopes + a few snow/rock specks
  ctx.fillStyle = rim;
  for (let x = 1; x < ys.length; x++) if (ys[x] < ys[x - 1] || (ys[x] === ys[x - 1] && r.chance(0.3))) ctx.fillRect(x, ys[x], 1, 1);
  // faint rock ledges following the slope
  ctx.fillStyle = mixHex(color, rim, 0.45);
  for (let i = 0; i < ys.length / 14; i++) {
    const x = r.int(0, ys.length - 4);
    const len = r.int(2, 4);
    const y = ys[x] + r.int(3, 14);
    if (y < h) ctx.fillRect(x, y, len, 1);
  }
}

function build(w: number, h: number): BackdropCache {
  const r = new PixelRng(0x6e017a);
  const [low, lowCtx] = makeCanvas(w, h);

  // --- sky -------------------------------------------------------------------------------
  const [sky, sctx] = makeCanvas(w, h);
  const horizon = Math.round(h * 0.62);
  // banded gradient (stepped, for a pixel-art feel)
  const bands = 18;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const c = t < 0.55 ? mixHex(SKY_TOP, SKY_MID, t / 0.55) : mixHex(SKY_MID, SKY_HORIZON, (t - 0.55) / 0.45);
    sctx.fillStyle = c;
    const y0 = Math.floor((i / bands) * horizon * 1.15);
    sctx.fillRect(0, y0, w, Math.ceil((horizon * 1.15) / bands) + 1);
  }
  sctx.fillStyle = SKY_HORIZON;
  sctx.fillRect(0, Math.floor(horizon * 1.15), w, h);
  // dusky glow: stacked dithered ellipses near the horizon
  const gx = w * 0.62;
  for (let k = 0; k < 5; k++) {
    const rx = w * (0.55 - k * 0.09);
    const ry = h * (0.28 - k * 0.045);
    const col = mixHex(SKY_HORIZON, GLOW, (k + 1) / 6);
    sctx.fillStyle = col;
    for (let y = Math.floor(horizon - ry); y < horizon + ry * 0.4; y++) {
      const dy = (y - horizon) / ry;
      const half = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
      const x0 = Math.max(-2, Math.floor(gx - half));
      const x1 = Math.min(w + 2, Math.ceil(gx + half));
      // solid core, dithered rim (checkerboard) so the bands blend with chunky pixels
      const ditherRow = Math.abs(dy) > 0.85;
      if (!ditherRow && x1 - x0 > 6) sctx.fillRect(x0 + 3, y, x1 - x0 - 6, 1);
      for (let x = x0; x < x1; x++) {
        if (!ditherRow && x >= x0 + 3 && x < x1 - 3) continue;
        if ((x + y) % 2 === 1) continue;
        sctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // --- stars -----------------------------------------------------------------------------
  const stars: Star[] = [];
  const count = Math.round((w * h) / 180);
  for (let i = 0; i < count; i++) {
    const y = Math.floor(Math.pow(r.next(), 1.6) * horizon * 1.05);
    const big = r.chance(0.05);
    stars.push({
      x: r.int(0, w - 1),
      y,
      base: r.range(0.35, 1) * (1 - (y / horizon) * 0.5),
      speed: r.range(0.6, 2.6),
      phase: r.range(0, Math.PI * 2),
      big,
      tint: r.pick(['#ffffff', '#fff4d8', '#d8e4ff', '#ffe0f0']),
    });
  }

  // --- mountains (4 layers) ----------------------------------------------------------------
  const [far, fctx] = makeCanvas(w, h);
  const [near, nctx] = makeCanvas(w, h);
  const layers = [
    { base: h * 0.6, amp: h * 0.2, rough: 1, ctx: fctx, c: MOUNTAINS[1], rim: MOUNTAINS[0] },
    { base: h * 0.7, amp: h * 0.17, rough: 1, ctx: fctx, c: MOUNTAINS[2], rim: MOUNTAINS[1] },
    { base: h * 0.82, amp: h * 0.16, rough: 1, ctx: nctx, c: MOUNTAINS[3], rim: MOUNTAINS[2] },
    { base: h * 0.95, amp: h * 0.12, rough: 2, ctx: nctx, c: MOUNTAINS[4], rim: MOUNTAINS[3] },
  ];
  for (const L of layers) paintRidge(L.ctx, ridge(w, Math.round(L.base), Math.max(4, L.amp), L.rough, r), h, L.c, L.rim, r);

  // --- mist band (tileable, drawn twice side by side when scrolling) --------------------------
  const mistH = Math.max(8, Math.round(h * 0.12));
  const [mist, mctx] = makeCanvas(w, mistH);
  for (let x = 0; x < w; x++) {
    // periodic wobbly thickness so the band tiles seamlessly
    const u = (x / w) * Math.PI * 2;
    const thick = mistH * (0.35 + 0.18 * Math.sin(u * 3) + 0.12 * Math.sin(u * 7 + 1.3));
    const top = Math.round(mistH / 2 - thick / 2);
    for (let y = top; y < top + thick; y++) {
      const edge = y - top < 2 || top + thick - y < 2;
      if (edge && (x + y) % 2 === 0) continue;
      mctx.fillStyle = edge ? 'rgba(150,130,175,0.18)' : 'rgba(160,140,185,0.26)';
      mctx.fillRect(x, y, 1, 1);
    }
  }

  return { w, h, low, lowCtx, sky, far, near, mist, mistY: Math.round(h * 0.66 - mistH / 2), stars };
}

/**
 * Paints the animated menu backdrop into `ctx` over the rect (0, 0, w, h). `t` is time in seconds.
 * Static layers are cached per size; per frame it only blits 5 layers and a few hundred star pixels
 * at 1/3 resolution, then scales up once with nearest-neighbour sampling.
 */
export function drawMenuBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  if (typeof document === 'undefined') return;
  const lw = Math.max(16, Math.ceil(w / PIXEL));
  const lh = Math.max(16, Math.ceil(h / PIXEL));
  if (!cache || cache.w !== lw || cache.h !== lh) cache = build(lw, lh);
  const C = cache;
  const L = C.lowCtx;

  L.globalAlpha = 1;
  L.drawImage(C.sky, 0, 0);

  // twinkling stars
  for (const s of C.stars) {
    const tw = 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
    const a = s.base * tw;
    if (a < 0.12) continue;
    L.globalAlpha = Math.min(1, a);
    L.fillStyle = s.tint;
    L.fillRect(s.x, s.y, 1, 1);
    if (s.big && tw > 0.75) {
      L.globalAlpha = Math.min(1, a * 0.45);
      L.fillRect(s.x - 1, s.y, 1, 1);
      L.fillRect(s.x + 1, s.y, 1, 1);
      L.fillRect(s.x, s.y - 1, 1, 1);
      L.fillRect(s.x, s.y + 1, 1, 1);
    }
  }
  L.globalAlpha = 1;

  L.drawImage(C.far, 0, 0);
  // drifting mist between the far and near ridges
  const off = Math.floor((t * 2) % C.w);
  L.drawImage(C.mist, -off, C.mistY);
  L.drawImage(C.mist, C.w - off, C.mistY);
  L.drawImage(C.near, 0, 0);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(C.low, 0, 0, C.w, C.h, 0, 0, C.w * PIXEL, C.h * PIXEL);
  ctx.restore();
}

/** Drops cached layers (e.g. after a context loss). */
export function resetMenuBackdrop(): void {
  cache = null;
}
