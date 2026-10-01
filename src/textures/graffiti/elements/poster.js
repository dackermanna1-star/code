// Wheat-paste posters (grids/repeats, torn remnants, layers, faded) and stapled
// flyer remnants. No legible text: fake text bars and shapes only.

import { rgba, PAINT, mix, weather, jitter } from '../core/color.js';
import { addPolygon } from '../paint/spray.js';
import { jaggedLine, rotateAround } from '../core/geom.js';
import { Rng } from '../core/rng.js';

const PAPER = [234, 230, 218];

export function makePosterDesign(rng) {
  const type = rng.pickW([['event', 4], ['bold', 3], ['photo', 2.5], ['type', 1.5], ['split', 2], ['pattern', 1]]);
  const bg = type === 'event'
    ? rng.pick([[24, 24, 28], [40, 30, 60], [90, 20, 28], [20, 40, 70], [30, 30, 30], [16, 52, 44]])
    : type === 'bold'
      ? rng.pick([PAINT.red, PAINT.yellow, [240, 236, 226], PAINT.orange, PAINT.skyBlue, PAINT.pink, PAINT.mint])
      : type === 'photo' ? [226, 224, 216] : type === 'type' ? [240, 238, 230] : rng.pick([PAINT.yellow, PAINT.white, PAINT.paleBlue, PAINT.pink, [30, 30, 32]]);
  const ink = type === 'event' ? rng.pick([PAINT.white, PAINT.yellow, PAINT.pink, PAINT.skyBlue, PAINT.red]) : rng.pick([PAINT.black, PAINT.black, PAINT.red, PAINT.navy, PAINT.purple]);
  const ink2 = rng.pick([PAINT.red, PAINT.black, PAINT.white, PAINT.blue, PAINT.yellow, PAINT.pink, PAINT.teal]);
  return { type, bg: jitter(bg, rng, 6), ink, ink2, seed: rng.int(0, 1e9) };
}

/** Rows of fake words (illegible text). */
function bars(ctx, x, y, w, h, rows, rng, gapF = 0.7, align = 'left') {
  const rh = h / (rows + (rows - 1) * gapF);
  for (let r = 0; r < rows; r++) {
    const yy = y + r * rh * (1 + gapF);
    const lineW = w * (r === rows - 1 ? rng.range(0.3, 0.8) : rng.range(0.75, 1));
    let cx = align === 'center' ? x + (w - lineW) / 2 : x;
    const end = cx + lineW;
    while (cx < end) {
      const ww = Math.min(end - cx, rh * rng.range(1.2, 4.5));
      ctx.fillRect(cx, yy, ww, rh);
      cx += ww + rh * rng.range(0.45, 0.8);
    }
  }
}

/** Big display "letters": chunky blocks with gaps (title lines). */
function titleBlocks(ctx, x, y, w, h, rng) {
  const n = rng.int(4, 9);
  const gw = w / n;
  for (let i = 0; i < n; i++) {
    const cw = gw * rng.range(0.6, 0.9);
    const kind = rng.int(0, 3);
    const lx = x + i * gw;
    if (kind === 0) ctx.fillRect(lx, y, cw, h);
    else if (kind === 1) { ctx.fillRect(lx, y, cw * 0.3, h); ctx.fillRect(lx, y, cw, h * 0.25); ctx.fillRect(lx, y + h * 0.75, cw, h * 0.25); }
    else if (kind === 2) { ctx.beginPath(); ctx.ellipse(lx + cw / 2, y + h / 2, cw / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillRect(lx, y, cw * 0.3, h); ctx.fillRect(lx + cw * 0.7, y, cw * 0.3, h); ctx.fillRect(lx, y + h * 0.4, cw, h * 0.22); }
  }
}

function portrait(ctx, x, y, w, h, col, bgc) {
  ctx.fillStyle = rgba(col, 0.92);
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + h * 0.36, w * 0.2, h * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + w * 0.08, y + h);
  ctx.bezierCurveTo(x + w * 0.12, y + h * 0.62, x + w * 0.88, y + h * 0.62, x + w * 0.92, y + h);
  ctx.fill();
  ctx.fillStyle = rgba(bgc, 0.75);
  ctx.fillRect(x + w * 0.4, y + h * 0.3, w * 0.07, h * 0.035);
  ctx.fillRect(x + w * 0.53, y + h * 0.3, w * 0.07, h * 0.035);
}

/** Draw the printed design in local poster space (0..w, 0..h). */
function drawDesign(ctx, d, w, h, age, wall) {
  const r = new Rng(d.seed);
  const f = (c) => weather(c, age, wall);
  const bg = f(d.bg), ink = f(d.ink), ink2 = f(d.ink2);
  ctx.fillStyle = rgba(bg, 1);
  ctx.fillRect(0, 0, w, h);
  const m = w * 0.07;
  if (d.type === 'event') {
    ctx.fillStyle = rgba(ink, 0.8);
    bars(ctx, m, h * 0.04, w - 2 * m, h * 0.025, 1, r, 0.5, 'center');
    ctx.fillStyle = rgba(ink, 0.95);
    titleBlocks(ctx, m, h * 0.09, w - 2 * m, h * 0.1, r);
    titleBlocks(ctx, m + w * 0.08, h * 0.21, w - 2 * m - w * 0.16, h * 0.07, r);
    // duotone photo block
    const g = ctx.createLinearGradient(0, h * 0.32, 0, h * 0.72);
    g.addColorStop(0, rgba(mix(ink2, bg, 0.2), 0.95));
    g.addColorStop(1, rgba(mix(ink2, [0, 0, 0], 0.45), 0.95));
    ctx.fillStyle = g;
    ctx.fillRect(m, h * 0.32, w - 2 * m, h * 0.4);
    portrait(ctx, m + w * 0.1, h * 0.36, w - 2 * m - w * 0.2, h * 0.36, mix(bg, [0, 0, 0], 0.3), ink2);
    ctx.fillStyle = rgba(ink, 0.9);
    bars(ctx, m, h * 0.76, w - 2 * m, h * 0.06, 2, r, 0.5, 'center');
    ctx.fillStyle = rgba(ink2, 0.9);
    ctx.fillRect(0, h * 0.86, w, h * 0.07);
    ctx.fillStyle = rgba(bg, 0.9);
    bars(ctx, m, h * 0.875, w - 2 * m, h * 0.04, 1, r, 0.5, 'center');
  } else if (d.type === 'bold') {
    ctx.fillStyle = rgba(ink, 0.96);
    titleBlocks(ctx, m, h * 0.06, w - 2 * m, h * 0.14, r);
    titleBlocks(ctx, m, h * 0.23, w - 2 * m, h * 0.14, r);
    ctx.fillStyle = rgba(ink2, 0.92);
    ctx.beginPath();
    const cx = w * 0.5, cy = h * 0.6, R = w * 0.3;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, rr = k % 2 ? R * 0.78 : R;
      if (k === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(bg, 0.95);
    bars(ctx, cx - R * 0.55, cy - R * 0.25, R * 1.1, R * 0.5, 3, r, 0.4, 'center');
    ctx.fillStyle = rgba(ink, 0.85);
    bars(ctx, m, h * 0.86, w - 2 * m, h * 0.08, 3, r, 0.6);
  } else if (d.type === 'photo') {
    ctx.fillStyle = rgba(f([200, 198, 192]), 1);
    ctx.fillRect(m * 0.6, m * 0.6, w - m * 1.2, h * 0.72);
    portrait(ctx, m, h * 0.08, w - 2 * m, h * 0.62, f([46, 44, 42]), f([210, 208, 200]));
    // photocopy toner noise
    ctx.fillStyle = rgba(f([60, 58, 56]), 0.35);
    for (let k = 0; k < 40; k++) ctx.fillRect(r.range(0, w), r.range(0, h * 0.75), w * r.range(0.005, 0.03), h * 0.004);
    ctx.fillStyle = rgba(ink, 0.92);
    titleBlocks(ctx, m, h * 0.8, w - 2 * m, h * 0.07, r);
    bars(ctx, m, h * 0.9, w - 2 * m, h * 0.05, 2, r, 0.6);
  } else if (d.type === 'type') {
    ctx.fillStyle = rgba(ink, 0.92);
    titleBlocks(ctx, m, h * 0.05, w - 2 * m, h * 0.08, r);
    const colW = (w - 3 * m) / 2;
    bars(ctx, m, h * 0.18, colW, h * 0.74, 18, r, 0.9);
    bars(ctx, 2 * m + colW, h * 0.18, colW, h * 0.74, 18, r, 0.9);
  } else if (d.type === 'split') {
    ctx.fillStyle = rgba(ink2, 0.94);
    ctx.fillRect(0, h * 0.5, w, h * 0.5);
    ctx.fillStyle = rgba(ink, 0.95);
    titleBlocks(ctx, m, h * 0.12, w - 2 * m, h * 0.12, r);
    titleBlocks(ctx, m, h * 0.28, w - 2 * m, h * 0.12, r);
    ctx.fillStyle = rgba(bg, 0.92);
    bars(ctx, m, h * 0.58, w - 2 * m, h * 0.3, 6, r, 0.7);
  } else {
    // repeated motif pattern with a label strip
    ctx.fillStyle = rgba(ink2, 0.9);
    const n = r.int(3, 5), s = w / n;
    for (let iy = 0; iy < Math.ceil(h / s); iy++) for (let ix = 0; ix < n; ix++) {
      ctx.beginPath();
      ctx.arc(ix * s + s / 2 + (iy % 2) * s * 0.25, iy * s + s / 2, s * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = rgba(bg, 0.95);
    ctx.fillRect(0, h * 0.4, w, h * 0.18);
    ctx.fillStyle = rgba(ink, 0.95);
    titleBlocks(ctx, m, h * 0.43, w - 2 * m, h * 0.12, r);
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
