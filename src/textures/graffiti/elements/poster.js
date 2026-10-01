// Wheat-paste posters (grids/repeats, torn remnants, layers, faded) and stapled
// flyer remnants. No legible text: fake text bars and shapes only.

import { rgba, PAINT, mix, weather, jitter, lighten, darken } from '../core/color.js';
import { addPolygon, addCircle } from '../paint/spray.js';
import { jaggedLine, rotateAround } from '../core/geom.js';
import { Rng } from '../core/rng.js';

const PAPER = [234, 230, 218];

export function makePosterDesign(rng) {
  const type = rng.pickW([['event', 4], ['bold', 3], ['photo', 2], ['type', 2], ['split', 2]]);
  const bg = type === 'event'
    ? rng.pick([[24, 24, 28], [40, 30, 60], [90, 20, 28], [20, 40, 70], [30, 30, 30]])
    : type === 'bold'
      ? rng.pick([PAINT.red, PAINT.yellow, [240, 236, 226], PAINT.orange, PAINT.skyBlue, PAINT.pink, PAINT.mint])
      : type === 'photo' ? [226, 224, 216] : type === 'type' ? [240, 238, 230] : rng.pick([PAINT.yellow, PAINT.white, PAINT.paleBlue, PAINT.pink]);
  const ink = type === 'event' ? rng.pick([PAINT.white, PAINT.yellow, PAINT.pink, PAINT.skyBlue, PAINT.red]) : rng.pick([PAINT.black, PAINT.black, PAINT.red, PAINT.navy, PAINT.purple]);
  const ink2 = rng.pick([PAINT.red, PAINT.black, PAINT.white, PAINT.blue, PAINT.yellow, PAINT.pink]);
  return { type, bg: jitter(bg, rng, 6), ink, ink2, seed: rng.int(0, 1e9) };
}

function bars(ctx, x, y, w, h, rows, rng, gapF = 0.7) {
  const rh = h / (rows + (rows - 1) * gapF);
  for (let r = 0; r < rows; r++) {
    let cx = x;
    const yy = y + r * rh * (1 + gapF);
    const lineW = w * rng.range(0.55, 1);
    while (cx < x + lineW) {
      const ww = Math.min(x + lineW - cx, rh * rng.range(1.2, 5));
      ctx.fillRect(cx, yy, ww, rh);
      cx += ww + rh * rng.range(0.4, 0.9);
    }
  }
}

/** Draw the printed design in local poster space (0..w, 0..h). */
function drawDesign(ctx, d, w, h, age, wall) {
  const r = new Rng(d.seed);
  const f = (c) => weather(c, age, wall);
  ctx.fillStyle = rgba(f(d.bg), 1);
  ctx.fillRect(0, 0, w, h);
  const ink = f(d.ink), ink2 = f(d.ink2);
  if (d.type === 'event') {
    ctx.fillStyle = rgba(ink, 0.95);
    bars(ctx, w * 0.08, h * 0.06, w * 0.84, h * 0.16, 2, r, 0.35);
    ctx.fillStyle = rgba(ink2, 0.9);
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.5, w * r.range(0.22, 0.32), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(f(d.bg), 0.85);
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.47, w * 0.09, w * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(w * 0.36, h * 0.55, w * 0.28, h * 0.12);
    ctx.fillStyle = rgba(ink, 0.85);
    bars(ctx, w * 0.1, h * 0.76, w * 0.8, h * 0.16, 4, r, 0.8);
  } else if (d.type === 'bold') {
    ctx.fillStyle = rgba(ink, 0.95);
    bars(ctx, w * 0.06, h * 0.08, w * 0.88, h * 0.4, 3, r, 0.25);
    ctx.fillStyle = rgba(ink2, 0.9);
    ctx.fillRect(w * 0.06, h * 0.56, w * 0.88, h * 0.18);
    ctx.fillStyle = rgba(ink, 0.8);
    bars(ctx, w * 0.06, h * 0.8, w * 0.7, h * 0.1, 2, r, 0.8);
  } else if (d.type === 'photo') {
    ctx.fillStyle = rgba(f([60, 58, 56]), 0.9);
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.38, w * 0.22, h * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.12, h * 0.8);
    ctx.quadraticCurveTo(w * 0.5, h * 0.42, w * 0.88, h * 0.8);
    ctx.fill();
    ctx.fillStyle = rgba(f([120, 118, 114]), 0.6);
    ctx.fillRect(w * 0.06, h * 0.06, w * 0.88, h * 0.1);
    ctx.fillStyle = rgba(ink, 0.9);
    bars(ctx, w * 0.1, h * 0.84, w * 0.8, h * 0.1, 2, r, 0.5);
  } else if (d.type === 'type') {
    ctx.fillStyle = rgba(ink, 0.9);
    bars(ctx, w * 0.08, h * 0.06, w * 0.84, h * 0.1, 1, r);
    bars(ctx, w * 0.08, h * 0.22, w * 0.84, h * 0.7, 14, r, 0.9);
  } else {
    ctx.fillStyle = rgba(ink2, 0.92);
    ctx.fillRect(0, h * 0.5, w, h * 0.5);
    ctx.fillStyle = rgba(ink, 0.95);
    bars(ctx, w * 0.08, h * 0.1, w * 0.84, h * 0.3, 2, r, 0.3);
    ctx.fillStyle = rgba(f(d.bg), 0.9);
    bars(ctx, w * 0.08, h * 0.6, w * 0.84, h * 0.3, 5, r, 0.7);
  }
}

/** Torn outline of a poster (local coords). keep: fraction of poster remaining. */
function tornShape(rng, w, h, mode) {
  const amp = Math.min(w, h) * 0.02, step = Math.min(w, h) * 0.05;
  const pts = [];
  if (mode === 'full') {
    jaggedLine(0, 0, w, 0, rng, amp * 0.3, step, pts);
    jaggedLine(w, 0, w, h, rng, amp * 0.3, step, pts);
    jaggedLine(w, h, 0, h, rng, amp * 0.3, step, pts);
    jaggedLine(0, h, 0, 0, rng, amp * 0.3, step, pts);
  } else if (mode === 'bottom') {
    const y0 = h * rng.range(0.3, 0.75), y1 = h * rng.range(0.3, 0.75);
    jaggedLine(0, y0, w, y1, rng, amp * 2.5, step, pts);
    pts.push(w, h, 0, h);
  } else if (mode === 'top') {
    const y0 = h * rng.range(0.2, 0.6), y1 = h * rng.range(0.2, 0.6);
    pts.push(0, 0, w, 0);
    jaggedLine(w, y1, 0, y0, rng, amp * 2.5, step, pts);
  } else if (mode === 'corner') {
    const a = w * rng.range(0.25, 0.6), b = h * rng.range(0.25, 0.6);
    pts.push(0, 0);
    jaggedLine(a, 0, 0, b, rng, amp * 2, step, pts);
  } else {
    // strip / patchy: diagonal tear
    const y0 = h * rng.range(0, 0.4), y1 = h * rng.range(0.4, 0.9);
    jaggedLine(0, y0, w, y1 - h * 0.3, rng, amp * 2.5, step, pts);
    pts.push(w, h * rng.range(0.7, 1), 0, h);
  }
  return pts;
}

/**
 * Group of wheat-pasted posters: grid of repeats, several layers.
 * o: { x, y (top-left), cols, rows, pw, ph, layers, age (0..1 per newest), gap }
 */
export function renderPosterGroup(P, rng, o) {
  const ctx = P.ctx;
  const wall = P.wallTone;
  let box = null;
  for (let layer = 0; layer < o.layers; layer++) {
    const d = makePosterDesign(rng);
    const layerAge = Math.min(1, (o.age ?? 0.3) + (o.layers - 1 - layer) * 0.25);
    const ox = o.x + rng.range(-0.1, 0.1) * o.pw, oy = o.y + rng.range(-0.08, 0.08) * o.ph;
    const rot = rng.gaussC(0, 0.012);
    const gap = o.gap ?? rng.range(-0.01, 0.02);
    for (let r = 0; r < o.rows; r++) {
      for (let c = 0; c < o.cols; c++) {
        if (rng.chance(0.12 + layerAge * 0.15)) continue; // missing / fully torn
        const px = ox + c * (o.pw + gap) + rng.range(-0.008, 0.008);
        const py = oy + r * (o.ph + gap) + rng.range(-0.008, 0.008);
        const mode = rng.pickW([['full', 3 - layerAge * 2], ['bottom', 2], ['top', 1], ['corner', 1], ['strip', 1 + layerAge * 2]]);
        const shape = tornShape(rng, o.pw, o.ph, mode);
        const prot = rot + rng.gaussC(0, 0.008);
        const toWall = (pts) => rotateAround(pts.map((v, i) => (i & 1 ? v + py : v + px)), px, py, prot);
        const wpts = toWall(shape);
        const path = new Path2D();
        addPolygon(path, wpts);
        // paper backing (white rim on torn edges)
        ctx.fillStyle = rgba(weather(PAPER, layerAge * 0.7, wall), 0.97);
        ctx.fill(path);
        // printed design clipped slightly inside the tear
        ctx.save();
        const inner = new Path2D();
        const shrink = Math.min(o.pw, o.ph) * 0.012;
        addPolygon(inner, toWall(shape.map((v, i) => (i & 1 ? v + (o.ph / 2 - v) * (shrink / o.ph) * 2 : v + (o.pw / 2 - v) * (shrink / o.pw) * 2))));
        ctx.clip(mode === 'full' ? path : inner);
        ctx.translate(px, py);
        ctx.rotate(prot);
        drawDesign(ctx, d, o.pw, o.ph, layerAge, wall);
        // wrinkles / paste stains
        ctx.strokeStyle = 'rgba(40,36,30,0.12)';
        ctx.lineWidth = 0.003;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const yy = rng.range(0, o.ph);
          ctx.moveTo(0, yy);
          ctx.bezierCurveTo(o.pw * 0.3, yy + rng.range(-0.03, 0.03), o.pw * 0.6, yy + rng.range(-0.03, 0.03), o.pw, yy + rng.range(-0.03, 0.03));
        }
        ctx.stroke();
        ctx.fillStyle = `rgba(255,250,235,${(0.06 + layerAge * 0.2).toFixed(3)})`;
        ctx.fillRect(0, 0, o.pw, o.ph);
        ctx.restore();
        P.resetTransform();
        P.matFill(path, 0, 10, 255, 0.97);
        const b = { x0: px - 0.05, y0: py - 0.05, x1: px + o.pw + 0.05, y1: py + o.ph + 0.05 };
        box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
      }
    }
  }
  return box;
}

/** Stapled flyer remnants (poles): small sheets, mostly torn off, staples left. */
export function renderFlyers(P, rng, o) {
  const ctx = P.ctx;
  const wall = P.wallTone;
  const staples = new Path2D();
  let box = null;
  for (let i = 0; i < o.count; i++) {
    const fw = rng.range(0.14, 0.22), fh = fw * rng.range(1.2, 1.45);
    const px = o.x0 + rng.range(0, Math.max(0.01, o.x1 - o.x0 - fw));
    const py = o.y0 + rng.range(0, Math.max(0.01, o.y1 - o.y0 - fh));
    const age = rng.range(0.2, 1);
    const d = makePosterDesign(rng);
    const mode = rng.pickW([['full', 1], ['top', 3], ['corner', 2], ['strip', 2]]);
    const shape = tornShape(rng, fw, fh, mode);
    const rot = rng.gaussC(0, 0.05);
    const wpts = rotateAround(shape.map((v, k) => (k & 1 ? v + py : v + px)), px, py, rot);
    const path = new Path2D();
    addPolygon(path, wpts);
    ctx.fillStyle = rgba(weather(PAPER, age, wall), 0.96);
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    ctx.translate(px, py);
    ctx.rotate(rot);
    drawDesign(ctx, d, fw, fh, age, wall);
    ctx.fillStyle = `rgba(255,250,235,${(0.1 + age * 0.3).toFixed(3)})`;
    ctx.fillRect(0, 0, fw, fh);
    ctx.restore();
    P.resetTransform();
    P.matFill(path, 0, 10, 255, 0.96);
    // staples at the top corners (+ sometimes bottom)
    const sp = [[px + 0.015, py + 0.012], [px + fw - 0.015, py + 0.012]];
    if (rng.chance(0.4)) sp.push([px + 0.015, py + fh - 0.015], [px + fw - 0.015, py + fh - 0.015]);
    for (const [sx, sy] of sp) {
      const a = rng.range(-0.5, 0.5);
      staples.moveTo(sx - Math.cos(a) * 0.006, sy - Math.sin(a) * 0.006);
      staples.lineTo(sx + Math.cos(a) * 0.006, sy + Math.sin(a) * 0.006);
    }
    const b = { x0: px - 0.03, y0: py - 0.03, x1: px + fw + 0.03, y1: py + fh + 0.03 };
    box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
  }
  // loose old staples everywhere in the band
  const ns = o.staples ?? 0;
  for (let i = 0; i < ns; i++) {
    const sx = rng.range(o.x0, o.x1), sy = rng.range(o.y0, o.y1);
    const a = rng.range(-0.6, 0.6) + (rng.chance(0.2) ? Math.PI / 2 : 0);
    staples.moveTo(sx - Math.cos(a) * 0.006, sy - Math.sin(a) * 0.006);
    staples.lineTo(sx + Math.cos(a) * 0.006, sy + Math.sin(a) * 0.006);
  }
  ctx.lineCap = 'butt';
  ctx.lineWidth = 0.0016;
  ctx.strokeStyle = rgba([150, 140, 128], 0.95);
  ctx.stroke(staples);
  P.matStroke(staples, 0.0016, 210, 120, 0, 0.95, 'butt');
  return box;
}

export { addCircle, lighten, darken, mix };
