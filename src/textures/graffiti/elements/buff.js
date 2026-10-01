// Buffs / paint-overs: mismatched paint tinted from the wall tone, applied with a
// roller (vertical strips, ragged tops, lap marks), a brush (paint-out squares) or a
// spray can (blobs over single tags).

import { rgba, mix, lum, clamp255, jitter, PAINT, scale } from '../core/color.js';
import { addPolygon, addPolyline, zigzagFill } from '../paint/spray.js';
import { noise1 } from '../core/noise.js';
import { blobPoly } from '../core/geom.js';

/** Base color for a buff campaign derived from the wall tone. */
export function buffColor(wallTone, rng, family) {
  const l = lum(wallTone);
  const f = family || rng.pickW([['brick', 5], ['grey', 4], ['beige', 3], ['offwhite', 1.5], ['brown', 2], ['darkgrey', 1.5], ['tan', 2]]);
  let c;
  switch (f) {
    case 'brick': {
      const k = rng.range(0.62, 0.9);
      c = [wallTone[0] * k + 8, wallTone[1] * k * 0.84, wallTone[2] * k * 0.78];
      break;
    }
    case 'grey': {
      const g = Math.min(200, Math.max(70, l * rng.range(0.75, 1.3)));
      c = [g + 4, g + 2, g - 2];
      break;
    }
    case 'darkgrey': {
      const g = rng.range(52, 80);
      c = [g + 3, g + 2, g];
      break;
    }
    case 'beige':
      c = mix(wallTone, [202, 190, 168], rng.range(0.4, 0.7));
      break;
    case 'offwhite':
      c = [rng.range(200, 222), rng.range(196, 216), rng.range(184, 205)];
      break;
    case 'brown':
      c = mix(wallTone, [86, 62, 48], rng.range(0.5, 0.8));
      break;
    default: // tan
      c = mix(wallTone, [255, 240, 210], rng.range(0.1, 0.25));
  }
  return { family: f, color: c.map(clamp255) };
}

export function shadeVariant(c, rng, amt = 0.06) {
  const k = 1 + rng.range(-amt, amt);
  return jitter(scale(c, k), rng, 4);
}

/**
 * Roller buff over a rectangle (meters, canvas y-down). top/bottom: y of top/bottom.
 * o: { x0, x1, top, bottom, color, alpha, raggedTop, raggedBottom, lean }
 */
export function renderRollerBuff(P, rng, o) {
  const ctx = P.ctx;
  const pw = rng.range(0.17, 0.24);
  const n = Math.max(1, Math.ceil((o.x1 - o.x0) / (pw * 0.86)));
  const color = o.color;
  const alpha = o.alpha ?? rng.range(0.88, 0.97);
  const all = new Path2D();
  const lean = o.lean ?? rng.range(-0.04, 0.04);
  const rTop = o.raggedTop ?? 0.08;
  const rBot = o.raggedBottom ?? 0.02;
  const sd = rng.int(0, 1e5);
  const passDir = rng.chance(0.8); // vertical passes; else horizontal
  if (passDir) {
    for (let i = 0; i < n; i++) {
      const xa = o.x0 + i * pw * 0.86 + rng.range(-0.01, 0.01);
      const xb = Math.min(o.x1 + 0.005, xa + pw);
      const tA = o.top + rTop * (noise1(i * 0.6, sd) - 0.5) * 2 + rng.range(-0.25, 0.25) * rTop;
      const tB = tA + rng.range(-0.3, 0.3) * rTop;
      const bA = o.bottom + rng.range(-1, 1) * rBot;
      const poly = [xa + lean * 0.5, tA, xb + lean * 0.5, tB, xb, bA + rng.range(-1, 1) * rBot, xa, bA];
      const strip = new Path2D();
      addPolygon(strip, poly);
      all.addPath(strip);
      const c = shadeVariant(color, rng, 0.025);
      ctx.fillStyle = rgba(c, alpha * rng.range(0.93, 1));
      ctx.fill(strip);
      // starved top: lighter coverage near the top of the pass
      ctx.save();
      ctx.clip(strip);
      const g = ctx.createLinearGradient(0, Math.min(tA, tB), 0, Math.min(tA, tB) + rng.range(0.04, 0.12));
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = g;
      ctx.fillRect(xa - 0.05, Math.min(tA, tB) - 0.05, pw + 0.1, 0.25);
      // fine vertical roller streaks (thin coverage)
      const sp = new Path2D();
      const ns = rng.int(3, 8);
      for (let k = 0; k < ns; k++) {
        const x = rng.range(xa, xb);
        sp.moveTo(x, Math.min(tA, tB));
        sp.lineTo(x + rng.range(-0.01, 0.01), bA);
      }
      ctx.strokeStyle = `rgba(0,0,0,${rng.range(0.05, 0.16).toFixed(3)})`;
      ctx.lineWidth = rng.range(0.004, 0.012);
      ctx.stroke(sp);
      ctx.restore();
      P.resetTransform();
    }
    // lap marks where passes overlap: slightly denser vertical lines
    const lp = new Path2D();
    for (let i = 1; i < n; i++) {
      const x = o.x0 + i * pw * 0.86 + 0.02;
      lp.moveTo(x, o.top + rTop);
      lp.lineTo(x, o.bottom);
    }
    ctx.strokeStyle = rgba(scale(color, 0.93), 0.18);
    ctx.lineWidth = 0.02;
    ctx.stroke(lp);
  } else {
    // horizontal brush/roller passes (paint-out style)
    const m = Math.max(1, Math.ceil((o.bottom - o.top) / (pw * 0.86)));
    for (let i = 0; i < m; i++) {
      const ya = o.top + i * pw * 0.86;
      const yb = Math.min(o.bottom, ya + pw);
      const la = o.x0 + rng.range(-1, 1) * rTop * 0.5, ra = o.x1 + rng.range(-1, 1) * rTop * 0.5;
      const poly = [la, ya, ra, ya + rng.range(-0.01, 0.01), ra + rng.range(-0.02, 0.02), yb, la + rng.range(-0.02, 0.02), yb];
      const strip = new Path2D();
      addPolygon(strip, poly);
      all.addPath(strip);
      ctx.fillStyle = rgba(shadeVariant(color, rng, 0.025), alpha * rng.range(0.93, 1));
      ctx.fill(strip);
    }
  }
  P.matFill(all, 0, rng.range(55, 85), 0, alpha);
  return { x0: o.x0 - 0.05, y0: o.top - rTop, x1: o.x1 + 0.05, y1: o.bottom + 0.02 };
}

/** Brushed paint-out rectangle (crisp edges, horizontal brush texture). */
export function renderPaintOut(P, rng, o) {
  const ctx = P.ctx;
  const { x0, x1, top, bottom, color } = o;
  const alpha = o.alpha ?? rng.range(0.9, 0.98);
  const j = 0.012;
  const poly = [x0 + rng.range(-j, j), top + rng.range(-j, j), x1 + rng.range(-j, j), top + rng.range(-j, j), x1 + rng.range(-j, j), bottom + rng.range(-j, j), x0 + rng.range(-j, j), bottom + rng.range(-j, j)];
  const p = new Path2D();
  addPolygon(p, poly);
  ctx.fillStyle = rgba(color, alpha);
  ctx.fill(p);
  ctx.save();
  ctx.clip(p);
  const bp = new Path2D();
  const n = Math.round((bottom - top) / 0.012);
  for (let i = 0; i < n; i++) {
    const y = top + ((i + rng.next()) / n) * (bottom - top);
    bp.moveTo(x0 - 0.02, y);
    bp.lineTo(x1 + 0.02, y + rng.range(-0.01, 0.01));
  }
  ctx.strokeStyle = rgba(scale(color, rng.chance(0.5) ? 0.94 : 1.05), 0.25);
  ctx.lineWidth = 0.004;
  ctx.stroke(bp);
  ctx.restore();
  P.resetTransform();
  // brush overrun at edges
  ctx.strokeStyle = rgba(color, alpha * 0.4);
  ctx.lineWidth = 0.006;
  ctx.lineJoin = 'round';
  ctx.stroke(p);
  P.matFill(p, 0, rng.range(60, 95), 0, alpha);
  return { x0: x0 - 0.02, y0: top - 0.02, x1: x1 + 0.02, y1: bottom + 0.02 };
}

/** Spray-can buff: irregular soft blob over a target box. */
export function renderSprayBuff(P, rng, o) {
  const ctx = P.ctx;
  const b = o.box;
  const m = o.margin ?? rng.range(0.04, 0.14);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const rx = (b.x1 - b.x0) / 2 + m, ry = (b.y1 - b.y0) / 2 + m;
  const poly = blobPoly(cx, cy, rx, ry, rng, 0.12, 22);
  const p = new Path2D();
  addPolygon(p, poly);
  const color = o.color;
  const alpha = o.alpha ?? rng.range(0.82, 0.95);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(color, alpha * 0.12);
  ctx.lineWidth = 0.12;
  ctx.stroke(p);
  ctx.strokeStyle = rgba(color, alpha * 0.3);
  ctx.lineWidth = 0.05;
  ctx.stroke(p);
  ctx.fillStyle = rgba(color, alpha * 0.85);
  ctx.fill(p);
  ctx.clip(p);
  zigzagFill(ctx, { x0: cx - rx, y0: cy - ry, x1: cx + rx, y1: cy + ry }, color, alpha * 0.6, Math.max(0.05, Math.min(0.12, ry * 0.35)), rng, { angle: rng.range(-0.4, 0.4) + (rng.chance(0.5) ? Math.PI / 2 : 0), passes: 2 });
  ctx.restore();
  P.resetTransform();
  P.matFill(p, 0, 120, 0, alpha);
  return { x0: cx - rx - 0.08, y0: cy - ry - 0.08, x1: cx + rx + 0.08, y1: cy + ry + 0.08 };
}

/** Pastel / color block (owner paint, leftover colors, piece backgrounds). */
export function blockColor(rng) {
  return PAINT[rng.pickW([['paleMint', 3], ['mint', 2], ['paleBlue', 3], ['lightGrey', 2], ['cream', 2], ['teal', 1], ['olive', 1], ['maroon', 1], ['navy', 0.6], ['darkGrey', 1], ['lavender', 0.6]])];
}

export { addPolyline };
