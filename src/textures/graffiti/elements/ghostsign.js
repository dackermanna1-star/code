// Faded "ghost sign": an old hand-painted advertisement high on the wall
// (invented business name), drawn with sign-painter block lettering from the stroke
// font. The compose step ages it by many decades.

import { layoutText } from '../font/font.js';
import { addPolyline, addPolygon } from '../paint/spray.js';
import { rgba } from '../core/color.js';

const SYL_A = ['HAL', 'VOR', 'KES', 'BRAN', 'MOR', 'DEL', 'WIN', 'STRA', 'GREL', 'TOR', 'ASH', 'LIND', 'BECK', 'HOLM', 'FEN', 'CAR', 'OST', 'MAR', 'KIL', 'ROD', 'SEV', 'ARN'];
const SYL_B = ['SEN', 'LAND', 'WICK', 'ROW', 'DALE', 'MANN', 'FORD', 'TON', 'LEY', 'BERG', 'STEAD', 'HURST', 'VELD', 'MOOR', 'GATE', 'RICH'];
const TRADES = ['COLD STORAGE', 'FURNITURE CO.', 'PAPER BOX CO.', 'BAKERY', 'MOVING & STORAGE', 'TOOL & DIE', 'PIANO WORKS', 'HARDWARE', 'FUR STORAGE', 'MATTRESS CO.', 'LAUNDRY', 'PRINTING CO.', 'STOVE WORKS', 'WHOLESALE', 'CANDY CO.', 'BOX & CRATE'];
const TAGS = ['FIREPROOF WAREHOUSE', 'WHOLESALE & RETAIL', 'EST. 19', 'SINCE 19', 'OFFICE UPSTAIRS', 'FREIGHT ENTRANCE', 'PHONE 22', 'TRUCKS FOR HIRE'];

const AVOID = new Set(['MARLEY', 'KESWICK', 'CARLEY', 'ASHLEY', 'ASHFORD', 'STRATON', 'MORGATE', 'HOLMSEN']);

export function ghostSignText(rng) {
  let base = rng.pick(SYL_A) + rng.pick(SYL_B);
  for (let i = 0; i < 6 && AVOID.has(base); i++) base = rng.pick(SYL_A) + rng.pick(SYL_B);
  const name = base + (rng.chance(0.3) ? ' BROS.' : rng.chance(0.25) ? ' & SON' : '');
  const trade = rng.pick(TRADES);
  let tag = rng.pick(TAGS);
  if (tag.endsWith('19')) tag += String(rng.int(5, 39)).padStart(2, '0');
  else if (tag.endsWith('22')) tag += String(rng.int(10, 99));
  return { name, trade, tag };
}

function drawLine(P, text, cx, top, h, maxW, color, shadow, rng) {
  const L = layoutText(text, { h, wf: 0.82, track: 0.22, angular: 0 });
  let s = 1;
  if (L.width > maxW) s = maxW / L.width;
  const sw = h * s * rng.range(0.13, 0.17);
  const ox = cx - (L.box.x0 + L.width / 2) * s;
  const oy = top + h * s;
  const path = new Path2D();
  const sp = new Path2D();
  for (const le of L.letters) {
    for (const p of le.strokes) {
      const q = p.map((v, i) => (i & 1 ? oy + v * s : ox + v * s));
      addPolyline(path, q);
      if (shadow) addPolyline(sp, q.map((v, i) => v + (i & 1 ? sw * 0.45 : sw * 0.45)));
    }
  }
  const ctx = P.ctx;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 3;
  if (shadow) {
    ctx.lineWidth = sw;
    ctx.strokeStyle = rgba(shadow, 0.95);
    ctx.stroke(sp);
  }
  ctx.lineWidth = sw;
  ctx.strokeStyle = rgba(color, 0.97);
  ctx.stroke(path);
  P.matStroke(path, sw, 0, 30, 0, 0.95, 'butt', 'miter');
  return h * s;
}

/**
 * o: { x0, y0 (top-left, canvas meters), w, h }
 */
export function renderGhostSign(P, rng, o) {
  const ctx = P.ctx;
  const t = ghostSignText(rng);
  const dark = rng.chance(0.6);
  const bg = dark ? rng.pick([[30, 52, 40], [24, 24, 26], [84, 30, 32], [30, 40, 66]]) : rng.pick([[228, 218, 192], [236, 232, 220]]);
  const ink = dark ? rng.pick([[236, 228, 200], [232, 200, 90], [236, 236, 230]]) : rng.pick([[30, 30, 32], [120, 30, 30], [30, 50, 90]]);
  const shadow = rng.chance(0.5) ? (dark ? [150, 40, 36] : [140, 140, 140]) : null;
  const hasPanel = rng.chance(0.75);
  if (hasPanel) {
    const p = new Path2D();
    addPolygon(p, [o.x0, o.y0, o.x0 + o.w, o.y0, o.x0 + o.w, o.y0 + o.h, o.x0, o.y0 + o.h]);
    ctx.fillStyle = rgba(bg, 0.95);
    ctx.fill(p);
    // painted border lines
    ctx.strokeStyle = rgba(ink, 0.9);
    ctx.lineWidth = Math.min(o.w, o.h) * 0.02;
    const m = Math.min(o.w, o.h) * 0.05;
    ctx.strokeRect(o.x0 + m, o.y0 + m, o.w - 2 * m, o.h - 2 * m);
    P.matFill(p, 0, 30, 0, 0.95);
  }
  const lines = [t.name, t.trade];
  if (o.h > 1.6 && rng.chance(0.7)) lines.push(t.tag);
  const sizes = lines.length === 3 ? [0.36, 0.3, 0.16] : [0.44, 0.34];
  let y = o.y0 + o.h * 0.1;
  for (let i = 0; i < lines.length; i++) {
    const lh = o.h * sizes[i] * 0.8;
    drawLine(P, lines[i], o.x0 + o.w / 2, y, lh, o.w * 0.86, ink, i < 2 ? shadow : null, rng);
    y += o.h * sizes[i] + o.h * 0.04;
  }
  return { x0: o.x0, y0: o.y0, x1: o.x0 + o.w, y1: o.y0 + o.h };
}
