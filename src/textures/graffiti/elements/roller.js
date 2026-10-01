// Roller letters and fire-extinguisher tags: big, rough, drippy, usually high up.

import { layoutText } from '../font/font.js';
import { bboxOf, translate, rotateAround, resample, wobble, polyLen } from '../core/geom.js';
import { rgba } from '../core/color.js';
import { addPolyline, addDrip, sprayStrokes } from '../paint/spray.js';
import { noise1 } from '../core/noise.js';
import { buildTagGeometry } from './tag.js';

/** Roller letters: flat broad bands with streak texture, starved ends and runs. */
export function renderRoller(P, rng, o) {
  const h = o.h;
  const text = o.text;
  const rwF = rng.range(0.15, 0.22);
  const L = layoutText(text, {
    h,
    wf: rng.range(0.5, 0.72),
    // letters nearly touch: the roller band itself is ~0.18 h wide
    track: rwF + rng.range(-0.04, 0.06),
    slant: rng.range(-0.1, 0.18),
    angular: 0.09,
    scale: (i) => (i === 0 ? rng.range(1.0, 1.25) : rng.range(0.85, 1.1)),
    rot: () => rng.gauss() * 0.07,
    bounce: () => rng.gauss() * 0.07 * h,
  });
  const cx = (L.box.x0 + L.box.x1) / 2, cy = (L.box.y0 + L.box.y1) / 2;
  const rot = rng.gaussC(0, 0.03);
  const rw = o.rollerW ?? Math.min(0.3, Math.max(0.14, h * rwF));
  const color = o.color;
  const ctx = P.ctx;
  const strokes = [];
  for (const le of L.letters) for (const p of le.strokes) strokes.push(rotateAround(translate(p, o.x - cx, o.y - cy), o.x, o.y, rot));
  const body = new Path2D();
  const streaks = new Path2D();
  const dp = new Path2D(), bp = new Path2D();
  const alpha = o.alpha ?? 0.9;
  for (const raw of strokes) {
    const p = wobble(resample(raw, rw * 0.5, 120), rw * 0.14, 1 / (rw * 5), rng.int(0, 1e5));
    // band polygon with ragged edges
    const n = p.length >> 1;
    const left = [], right = [];
    const sd = rng.int(0, 1e5);
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      let tx = p[i1 * 2] - p[i0 * 2], ty = p[i1 * 2 + 1] - p[i0 * 2 + 1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const e1 = rw * 0.5 * (1 + 0.22 * (noise1(i * 0.7, sd) - 0.5) + 0.08 * rng.range(-1, 1));
      const e2 = rw * 0.5 * (1 + 0.22 * (noise1(i * 0.7, sd + 9) - 0.5) + 0.08 * rng.range(-1, 1));
      left.push(p[i * 2] - ty * e1, p[i * 2 + 1] + tx * e1);
      right.push(p[i * 2] + ty * e2, p[i * 2 + 1] - tx * e2);
    }
    body.moveTo(left[0], left[1]);
    for (let i = 2; i < left.length; i += 2) body.lineTo(left[i], left[i + 1]);
    for (let i = right.length - 2; i >= 0; i -= 2) body.lineTo(right[i], right[i + 1]);
    body.closePath();
    // streaks along the stroke
    for (let k = 0; k < 5; k++) {
      const off = rng.range(-0.45, 0.45) * rw;
      const sp = [];
      for (let i = 0; i < n; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
        let tx = p[i1 * 2] - p[i0 * 2], ty = p[i1 * 2 + 1] - p[i0 * 2 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        sp.push(p[i * 2] - (ty / tl) * off, p[i * 2 + 1] + (tx / tl) * off);
      }
      addPolyline(streaks, sp);
    }
    // runs from the lower edge: roller paint sags a lot
    const len = polyLen(p);
    const nd = Math.round(len / rw * rng.range(0.25, 0.7));
    for (let k = 0; k < nd; k++) {
      const i = rng.int(0, n - 1);
      const lx = Math.max(left[i * 2 + 1], right[i * 2 + 1]) === left[i * 2 + 1] ? left[i * 2] : right[i * 2];
      const ly = Math.max(left[i * 2 + 1], right[i * 2 + 1]);
      addDrip(dp, bp, lx + rng.range(-0.3, 0.3) * rw, ly - rw * 0.1, Math.min(0.6, rng.exp(0.12) + 0.03), rw * rng.range(0.04, 0.09), rng);
    }
  }
  ctx.fillStyle = rgba(color, alpha);
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  ctx.lineCap = 'butt';
  ctx.strokeStyle = rgba(color, 0.35);
  ctx.lineWidth = rw * 0.08;
  ctx.stroke(streaks);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = rw * 0.05;
  ctx.stroke(streaks);
  ctx.restore();
  P.resetTransform();
  ctx.strokeStyle = rgba(color, alpha * 0.92);
  ctx.lineCap = 'round';
  ctx.lineWidth = rw * 0.06;
  ctx.stroke(dp);
  ctx.fillStyle = rgba(color, alpha);
  ctx.fill(bp);
  P.matFill(body, 0, 70, 0, alpha);
  P.matStroke(dp, rw * 0.06, 0, 70, 0, alpha);
  return bboxOf(strokes, rw);
}

/** Extinguisher tag: the writer's tag blown up, wobbly wide lines, heavy mist, long runs. */
export function renderExtinguisher(P, rng, o) {
  const h = o.h;
  let strokes;
  if (o.writer) {
    const geo = buildTagGeometry(o.writer, h, rng, { decoScale: 0.35, text: o.text });
    const cx = (geo.box.x0 + geo.box.x1) / 2, cy = (geo.box.y0 + geo.box.y1) / 2;
    const rot = rng.gaussC(0, 0.06);
    strokes = geo.strokes.map((p) => wobble(rotateAround(translate(p, o.x - cx, o.y - cy), o.x, o.y, rot), h * 0.035, 1 / (h * 0.4), rng.int(0, 1e5), h * 0.015));
  } else {
    const L = layoutText(o.text, { h, wf: rng.range(0.55, 0.85), track: rng.range(0.05, 0.22), slant: rng.range(-0.05, 0.35), rot: () => rng.gauss() * 0.09, bounce: () => rng.gauss() * 0.08 * h });
    const cx = (L.box.x0 + L.box.x1) / 2, cy = (L.box.y0 + L.box.y1) / 2;
    strokes = [];
    for (const le of L.letters) for (const p of le.strokes) strokes.push(wobble(resample(translate(p, o.x - cx, o.y - cy), h / 20, 120), h * 0.05, 1 / (h * 0.45), rng.int(0, 1e5), h * 0.02));
  }
  const w = Math.min(0.2, Math.max(0.08, h * rng.range(0.065, 0.1)));
  sprayStrokes(P, strokes, {
    w,
    color: o.color,
    alpha: o.alpha ?? 0.85,
    halo: 1.6,
    fuzz: 1.4,
    speckle: 2,
    drip: 0.75,
    dripLen: 0.25,
    dripMax: 0.8,
    maxDrips: 40,
    pressure: 0.5,
    taperEnd: 0.3,
    rng,
    gloss: 120,
  });
  return bboxOf(strokes, w * 3);
}
