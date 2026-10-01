// Shared renderer for fat outlined letters (throw-ups, pieces, outlined tags).
// One scratch canvas per letter so each letter's outline cuts over the previous
// letter's fill:
//   throw-up mode: back layers (fill overspray, 2nd outline, shadow, outline ring)
//     -> interior cleared -> inner ring -> streaky fill pattern drawn
//     'destination-over' into the cleared interior -> shines -> cuts/holes.
//   piece mode (opaque fill): gradient fill -> textures/patterns 'source-atop' ->
//     cuts -> outline, 3D extrusion, 2nd outline, overspray all 'destination-over'.

import { rgba, PAINT, lighten, darken, mix } from '../core/color.js';
import { bboxOf, translate, resample, chaikin, wobble } from '../core/geom.js';
import { addPolyline, addCircle, addDrip } from '../paint/spray.js';
import { createCanvas, get2d } from '../core/canvas.js';

export function smoothSkeleton(strokes, h, rng, round = 2, wob = 0.012) {
  const seed = rng.int(0, 1e6);
  return strokes.map((p, i) => {
    let q = resample(p, h / 14, 80);
    if (round) q = chaikin(q, round, 0.25);
    if (wob) q = wobble(q, wob * h, 1 / (h * 0.7), seed + i * 17);
    return q;
  });
}

export function pathOf(strokes, dx = 0, dy = 0) {
  const path = new Path2D();
  for (const p of strokes) addPolyline(path, dx || dy ? translate(p, dx, dy) : p);
  return path;
}

function strokeP(ctx, path, width, style, cap, join) {
  ctx.lineCap = cap;
  ctx.lineJoin = join;
  ctx.miterLimit = 2.2;
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.stroke(path);
}

// ---------------------------------------------------------------------------
// Streaky spray-fill pattern tiles (seamless), cached per color/alpha bucket.

const TILE = 64;
const tileCache = new Map();

/**
 * Pattern tile of quick zig-zag spray passes in `color` over a thinner base coat.
 * Returns a canvas TILE x TILE (seamless).
 */
export function streakTile(color, varColor, alpha, variant) {
  const key = [color.map((v) => v >> 3).join(','), varColor ? varColor.map((v) => v >> 3).join(',') : '-', Math.round(alpha * 10), variant & 7].join('|');
  let t = tileCache.get(key);
  if (t) return t;
  const c = createCanvas(TILE, TILE);
  const g = get2d(c);
  const base = alpha * (0.5 + 0.08 * (variant % 3));
  g.fillStyle = rgba(color, base);
  g.fillRect(0, 0, TILE, TILE);
  g.lineCap = 'round';
  // pseudo-random but deterministic per variant
  let s = 1234 + variant * 97;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const n = 4 + (variant % 3);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const x = ((i + rnd() * 0.6) / n) * TILE;
      const w = TILE / n * (0.55 + rnd() * 0.5);
      const col = pass === 1 && varColor ? varColor : color;
      const a = Math.min(1, alpha * (pass === 1 && varColor ? 0.35 + rnd() * 0.25 : 0.45 + rnd() * 0.35));
      for (const ox of [-TILE, 0, TILE]) {
        g.strokeStyle = rgba(col, a * 0.35);
        g.lineWidth = w * 1.8;
        g.beginPath(); g.moveTo(x + ox, -4); g.lineTo(x + ox + (rnd() - 0.5) * 6, TILE + 4); g.stroke();
        g.strokeStyle = rgba(col, a);
        g.lineWidth = w;
        g.beginPath(); g.moveTo(x + ox, -4); g.lineTo(x + ox, TILE + 4); g.stroke();
      }
    }
  }
  tileCache.set(key, c);
  return c;
}

function makePattern(ctx, tile, sizeM, angle, offX = 0, offY = 0) {
  const pat = ctx.createPattern(tile, 'repeat');
  if (pat && pat.setTransform && typeof DOMMatrix !== 'undefined') {
    const k = sizeM / TILE;
    const m = new DOMMatrix().translateSelf(offX, offY).rotateSelf((angle * 180) / Math.PI).scaleSelf(k, k);
    pat.setTransform(m);
  }
  return pat;
}

/**
 * Render one fat letter. L = { strokes, cuts, holes } in wall meters.
 * s = {
 *   mode: 'throw' | 'piece', F, o, cap='round', join='round', fill:[r,g,b], fillAlpha, outline:[r,g,b],
 *   fillVar, halo (meters), second:{ w, color }, shadow:{ dx, dy, color },
 *   extrude:{ dx, dy, color, steps }, cuts, holes, inner:{ color, gap, w, alpha },
 *   streak:{ sw, angle, variant }, pieceFill(ctx, box, rng) (piece mode, draws opaque fill
 *   texture with 'source-atop'), gradient (CanvasGradient for piece fill), shine, metal, gloss
 * }
 */
export function renderFatLetter(P, rng, L, s) {
  const F = s.F, o = s.o;
  const cap = s.cap || 'round', join = s.join || 'round';
  const ext = s.extrude ? Math.hypot(s.extrude.dx, s.extrude.dy) : 0;
  const sh = s.shadow ? Math.hypot(s.shadow.dx, s.shadow.dy) : 0;
  const pad = F / 2 + o * 1.5 + (s.second ? s.second.w * 1.4 : 0) + Math.max(ext, sh) + (s.halo || 0) + 0.01;
  const box = bboxOf(L.strokes, pad);
  const T = P.beginScratch(box);
  const t = T.ctx;
  const main = pathOf(L.strokes);
  const oj = o * 0.22;
  const outlineA = pathOf(L.strokes, oj * rng.range(-1, 1), oj * rng.range(0, 1.2));
  const outlineB = pathOf(L.strokes, oj * rng.range(-1, 1), -oj * rng.range(0, 1));
  const lb = bboxOf(L.strokes, F / 2);

  if (s.mode === 'piece') {
    // 1. opaque gradient fill
    strokeP(t, main, F, (typeof s.gradient === 'function' ? s.gradient(t) : s.gradient) || rgba(s.fill, 1), cap, join);
    // 2. textures / patterns on the fill only
    t.globalCompositeOperation = 'source-atop';
    if (s.pieceFill) s.pieceFill(t, lb, rng);
    if (s.cuts && L.cuts && L.cuts.length) strokeP(t, pathOf(L.cuts), o * 1.15, rgba(s.outline, 0.95), 'round', 'round');
    if (s.holes && L.holes && L.holes.length) strokeP(t, pathOf(L.holes), o * 1.3, rgba(s.outline, 0.95), 'round', 'round');
    // 3. everything behind, front-to-back
    t.globalCompositeOperation = 'destination-over';
    strokeP(t, outlineA, F + 2 * o, rgba(s.outline, 0.97), cap, join);
    strokeP(t, outlineB, F + 2 * o * 0.85, rgba(s.outline, 0.97), cap, join);
    strokeP(t, main, F + 2 * o + o * 0.9, rgba(s.outline, 0.22), cap, join);
    if (s.extrude) {
      const steps = s.extrude.steps || 6;
      const pl = [];
      for (let k = 1; k <= steps; k++) pl.push(pathOf(L.strokes, (s.extrude.dx * k) / steps, (s.extrude.dy * k) / steps));
      const ec = s.extrude.color;
      for (let k = 0; k < steps; k++) strokeP(t, pl[k], F, rgba(k === steps - 1 ? darken(ec, 0.25) : ec, 0.97), cap, join);
      for (let k = 0; k < steps; k++) strokeP(t, pl[k], F + 2 * o, rgba(s.outline, 0.97), cap, join);
    } else if (s.shadow) {
      strokeP(t, pathOf(L.strokes, s.shadow.dx, s.shadow.dy), F + 2 * o, rgba(s.shadow.color, s.shadow.alpha ?? 0.9), cap, join);
    }
    if (s.second) {
      const w2 = F + 2 * o + 2 * s.second.w;
      strokeP(t, main, w2, rgba(s.second.color, 0.95), cap, join);
      if (s.extrude) strokeP(t, pathOf(L.strokes, s.extrude.dx, s.extrude.dy), w2, rgba(s.second.color, 0.95), cap, join);
      strokeP(t, main, w2 + s.second.w * 0.6, rgba(s.second.color, 0.25), cap, join);
    }
    if (s.halo > 0) strokeP(t, main, F + 2 * o + 2 * s.halo, rgba(s.fill, 0.08), cap, join);
    t.globalCompositeOperation = 'source-over';
  } else {
    // ---- throw-up mode
    if (s.halo > 0 && s.fillAlpha > 0.05) strokeP(t, main, F + 2 * o + 2 * s.halo, rgba(s.fill, 0.07 + 0.05 * rng.next()), cap, join);
    if (s.second) {
      const w2 = F + 2 * o + 2 * s.second.w;
      strokeP(t, main, w2 + s.second.w * 0.6, rgba(s.second.color, 0.25), cap, join);
      strokeP(t, main, w2, rgba(s.second.color, 0.95), cap, join);
    }
    if (s.shadow) strokeP(t, pathOf(L.strokes, s.shadow.dx, s.shadow.dy), F + 2 * o, rgba(s.shadow.color, s.shadow.alpha ?? 0.9), cap, join);
    strokeP(t, main, F + 2 * o + o * 0.9, rgba(s.outline, 0.22), cap, join);
    strokeP(t, outlineA, F + 2 * o, rgba(s.outline, 0.97), cap, join);
    strokeP(t, outlineB, F + 2 * o * 0.85, rgba(s.outline, 0.97), cap, join);
    // clear interior
    t.globalCompositeOperation = 'destination-out';
    strokeP(t, main, F, '#000', cap, join);
    t.globalCompositeOperation = 'source-over';
    // inner highlight ring
    if (s.inner) {
      strokeP(t, main, Math.max(0.001, F - 2 * s.inner.gap), rgba(s.inner.color, s.inner.alpha ?? 0.9), cap, join);
      t.globalCompositeOperation = 'destination-out';
      strokeP(t, main, Math.max(0.0005, F - 2 * s.inner.gap - 2 * s.inner.w), '#000', cap, join);
    }
    // streaky fill behind ring, inside cleared interior
    if (s.fillAlpha > 0.01) {
      const st = s.streak || {};
      const tile = streakTile(s.fill, s.fillVar || null, s.fillAlpha, st.variant ?? 0);
      const pat = makePattern(t, tile, (st.sw ?? F * 0.3) * 4.5, (st.angle ?? 0), lb.x0, lb.y0);
      t.globalCompositeOperation = 'destination-over';
      strokeP(t, main, F, pat || rgba(s.fill, s.fillAlpha), cap, join);
      // shines
      if (s.shine) {
        t.globalCompositeOperation = 'source-atop';
        drawShine(t, L, s, rng);
      }
    }
    t.globalCompositeOperation = 'source-over';
    if (s.cuts && L.cuts && L.cuts.length) strokeP(t, pathOf(L.cuts), o * 1.15, rgba(s.outline, 0.95), 'round', 'round');
    if (s.holes && L.holes && L.holes.length) strokeP(t, pathOf(L.holes), o * 1.3, rgba(s.outline, 0.95), 'round', 'round');
  }

  P.drawScratch(T);
  P.endScratch(T);

  // props (material)
  if (P.wantProps) {
    P.matStroke(main, F + 2 * o + (s.second ? 2 * s.second.w : 0), s.outlineMetal || 0, s.gloss ?? 150, 0, 0.95);
    if (s.fillAlpha > 0.01) P.matStroke(main, F, s.metal || 0, s.gloss ?? 150, 0, Math.min(1, s.fillAlpha));
  }
  return box;
}

function drawShine(u, L, s, rng) {
  const F = s.F;
  const lb = bboxOf(L.strokes);
  u.lineCap = 'round';
  const n = rng.int(1, 2);
  const p = new Path2D();
  const dots = new Path2D();
  for (let i = 0; i < n; i++) {
    const x = lb.x0 + (lb.x1 - lb.x0) * rng.range(0.05, 0.45);
    const y = lb.y0 + (lb.y1 - lb.y0) * rng.range(0.02, 0.3);
    p.moveTo(x, y + F * 0.25);
    p.quadraticCurveTo(x + F * 0.05, y, x + F * 0.32, y - F * 0.04);
    if (rng.chance(0.6)) addCircle(dots, x + F * 0.45, y - F * 0.02, F * 0.05);
  }
  u.strokeStyle = rgba([250, 250, 248], rng.range(0.6, 0.9));
  u.lineWidth = F * rng.range(0.07, 0.12);
  u.stroke(p);
  u.fillStyle = rgba([250, 250, 248], 0.85);
  u.fill(dots);
}

/** Downward drips from the lowest skeleton points of letters. */
export function letterDrips(P, rng, letters, F, o, color, count, maxLen) {
  const dp = new Path2D(), bp = new Path2D();
  const w = Math.max(0.003, o * 0.45);
  let made = 0;
  for (let k = 0; k < count; k++) {
    const L = letters[rng.int(0, letters.length - 1)];
    const p = L.strokes[rng.int(0, L.strokes.length - 1)];
    if (!p || p.length < 2) continue;
    let bi = 0;
    for (let i = 0; i < p.length; i += 2) if (p[i + 1] > p[bi + 1]) bi = i;
    const x = p[bi] + rng.range(-0.3, 0.3) * F;
    const y = p[bi + 1] + F / 2 + o * 0.6;
    addDrip(dp, bp, x, y - o, Math.min(maxLen, rng.exp(maxLen * 0.35) + 0.02), w * rng.range(0.7, 1.3), rng);
    made++;
  }
  if (!made) return;
  const ctx = P.ctx;
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(color, 0.9);
  ctx.lineWidth = w;
  ctx.stroke(dp);
  ctx.fillStyle = rgba(color, 0.92);
  ctx.fill(bp);
  P.matStroke(dp, w, 0, 150, 0, 0.9);
}

export { PAINT, lighten, darken, mix };
