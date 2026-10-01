// Spray-can / marker / mop / roller stroke rendering on Canvas 2D.
// All coordinates are wall-canvas meters (x right, y down); the painter's contexts
// carry a transform that scales meters to pixels.

import { rgba } from '../core/color.js';
import { resample } from '../core/geom.js';
import { noise1 } from '../core/noise.js';
import { Rng } from '../core/rng.js';

const hyp = (x, y) => Math.sqrt(x * x + y * y);

const TAU = Math.PI * 2;

export function addPolyline(path, p) {
  if (p.length < 2) return;
  path.moveTo(p[0], p[1]);
  if (p.length === 2) { path.lineTo(p[0] + 1e-5, p[1]); return; }
  for (let i = 2; i < p.length; i += 2) path.lineTo(p[i], p[i + 1]);
}

export function addCircle(path, x, y, r) {
  path.moveTo(x + r, y);
  path.arc(x, y, r, 0, TAU, true);
}

export function addPolygon(path, p) {
  if (p.length < 6) return;
  path.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) path.lineTo(p[i], p[i + 1]);
  path.closePath();
}

/**
 * Append a variable-width stroke outline (consistent winding, round caps) to path.
 * pts: flat resampled polyline, hw: half widths per point.
 * Returns indices of sharp corners.
 */
export function addVarStroke(path, pts, hw, cornerCircles = true) {
  const n = pts.length >> 1;
  if (n < 2) {
    addCircle(path, pts[0], pts[1], hw[0]);
    return;
  }
  const nx = new Float64Array(n), ny = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const i0 = i > 0 ? i - 1 : 0, i1 = i < n - 1 ? i + 1 : n - 1;
    let tx = pts[i1 * 2] - pts[i0 * 2], ty = pts[i1 * 2 + 1] - pts[i0 * 2 + 1];
    const l = hyp(tx, ty) || 1;
    tx /= l; ty /= l;
    nx[i] = -ty; ny[i] = tx;
  }
  // left side forward
  path.moveTo(pts[0] + nx[0] * hw[0], pts[1] + ny[0] * hw[0]);
  for (let i = 1; i < n; i++) path.lineTo(pts[i * 2] + nx[i] * hw[i], pts[i * 2 + 1] + ny[i] * hw[i]);
  // end cap
  const ae = Math.atan2(ny[n - 1], nx[n - 1]);
  path.arc(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1], hw[n - 1], ae, ae - Math.PI, true);
  // right side backward
  for (let i = n - 2; i >= 0; i--) path.lineTo(pts[i * 2] - nx[i] * hw[i], pts[i * 2 + 1] - ny[i] * hw[i]);
  const as = Math.atan2(ny[0], nx[0]);
  path.arc(pts[0], pts[1], hw[0], as + Math.PI, as, true);
  path.closePath();
  if (cornerCircles) {
    for (let i = 1; i < n - 1; i++) {
      const ax = pts[i * 2] - pts[i * 2 - 2], ay = pts[i * 2 + 1] - pts[i * 2 - 1];
      const bx = pts[i * 2 + 2] - pts[i * 2], by = pts[i * 2 + 3] - pts[i * 2 + 1];
      const la = hyp(ax, ay), lb = hyp(bx, by);
      if (la < 1e-9 || lb < 1e-9) continue;
      const c = (ax * bx + ay * by) / (la * lb);
      if (c < 0.35) addCircle(path, pts[i * 2], pts[i * 2 + 1], hw[i]);
    }
  }
}

function turnAngles(pts) {
  const n = pts.length >> 1;
  const out = new Float32Array(n);
  for (let i = 1; i < n - 1; i++) {
    const ax = pts[i * 2] - pts[i * 2 - 2], ay = pts[i * 2 + 1] - pts[i * 2 - 1];
    const bx = pts[i * 2 + 2] - pts[i * 2], by = pts[i * 2 + 3] - pts[i * 2 + 1];
    const la = hyp(ax, ay), lb = hyp(bx, by);
    if (la < 1e-9 || lb < 1e-9) continue;
    let c = (ax * bx + ay * by) / (la * lb);
    if (c > 1) c = 1; else if (c < -1) c = -1;
    out[i] = Math.acos(c);
  }
  return out;
}

/** Downward paint run ending in a bulb. Appends to drip path + bulb path. */
export function addDrip(dripPath, bulbPath, x, y, len, w, rng) {
  const n = Math.max(2, Math.min(8, Math.round(len / 0.02) + 2));
  dripPath.moveTo(x, y);
  let cx = x;
  for (let i = 1; i <= n; i++) {
    cx += rng.range(-1, 1) * len * 0.025;
    dripPath.lineTo(cx, y + (len * i) / n);
  }
  addCircle(bulbPath, cx, y + len, w * rng.range(0.75, 1.05));
}

/**
 * Spray-paint a set of strokes.
 * o: { w, color, alpha=0.92, halo=1, fuzz=1, speckle=1, drip=0.2, pressure=0.3,
 *      taperEnd=0, taperStart=0, blob=0.6, rng, metal=0, gloss=150, tool='spray',
 *      dripLen=0.06, noProps=false }
 */
export function sprayStrokes(P, strokes, o) {
  const ctx = P.ctx;
  // private generator: internal draws depend on pixel size (speckle, drip candidates),
  // the caller's stream must advance identically at every resolution
  const rng = new Rng(o.rng.u32());
  const w = o.w;
  const color = o.color;
  const alpha = o.alpha ?? 0.92;
  const halo = o.halo ?? 1;
  const tool = o.tool || 'spray';
  const ppm = P.ppm;
  const pw = w * ppm; // stroke width in pixels
  const lod = o.lod ?? 0;
  const marker = tool === 'marker' || tool === 'mop';
  const pressure = o.pressure ?? (marker ? 0.05 : 0.3);
  const ds = Math.max(w * 0.7, 1.0 / ppm);
  const seed = rng.int(0, 1e6);
  const halos = new Path2D();
  const coreA = new Path2D();
  const coreB = new Path2D();
  const blobs = new Path2D();
  const dripP = new Path2D();
  const bulbs = new Path2D();
  const dripW = Math.max(0.0016, w * (tool === 'mop' ? 0.45 : 0.32));
  const dripChance = o.drip ?? 0.15;
  const dripLen = o.dripLen ?? 0.07;
  const dripMax = o.dripMax ?? 0.25;
  const speckle = marker || lod > 0 || pw < 2.5 ? 0 : (o.speckle ?? 1);
  const blobAmt = lod > 0 ? 0 : (o.blob ?? (marker ? 0.25 : 0.6));
  const dotsPerM = speckle * 160 * Math.min(1, (ppm / 140) ** 2);
  const dotR = Math.max(0.0007, 0.45 / ppm);
  const dotA = Math.min(1, (0.0007 / dotR) ** 2 * 2.2);
  const dots = dotsPerM > 0 ? new Path2D() : null;
  let dripsMade = 0;
  const maxDrips = lod > 0 ? Math.min(2, o.maxDrips ?? 6) : (o.maxDrips ?? 6);
  const tS = o.taperStart ?? 0, tE = o.taperEnd ?? 0;
  let anyB = false;

  for (let si = 0; si < strokes.length; si++) {
    const raw = strokes[si];
    if (!raw || raw.length < 2) continue;
    const pts = resample(raw, ds, 200);
    const n = pts.length >> 1;
    const ang = turnAngles(pts);
    const hw = new Float32Array(n);
    let L = 0;
    const sArr = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      L += hyp(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
      sArr[i] = L;
    }
    const taperLen = Math.min(L * 0.35, w * 6);
    for (let i = 0; i < n; i++) {
      let slow = 0;
      for (let k = -2; k <= 2; k++) {
        const j = i + k;
        if (j > 0 && j < n - 1 && ang[j] / 1.6 > slow) slow = ang[j] / 1.6;
      }
      const endProx = Math.min(sArr[i], L - sArr[i]);
      if (endProx < w * 1.5) slow = Math.max(slow, 1 - endProx / (w * 1.5));
      let f = 1 + pressure * (Math.min(1, slow) - 0.35) + (marker ? 0.03 : 0.14) * (noise1((sArr[i] * 9) / Math.max(w * 4, 0.01), seed + si) - 0.5);
      if (tE > 0 && L - sArr[i] < taperLen) f *= 1 - tE * (1 - (L - sArr[i]) / taperLen) * 0.85;
      if (tS > 0 && sArr[i] < taperLen) f *= 1 - tS * (1 - sArr[i] / taperLen) * 0.85;
      hw[i] = Math.max(0.3 / ppm, w * 0.5 * f);
    }
    // two interleaved groups with different coat strength: crossings get denser
    const useB = !marker && (si & 1) === 1;
    if (useB) anyB = true;
    addVarStroke(useB ? coreB : coreA, pts, hw, true);
    if (halo > 0) addPolyline(halos, pts);
    if (blobAmt > 0) {
      if (rng.chance(blobAmt)) addCircle(blobs, pts[0], pts[1], w * rng.range(0.5, 0.8));
      if (tE < 0.3 && rng.chance(blobAmt * 0.6)) addCircle(blobs, pts[(n - 1) * 2], pts[(n - 1) * 2 + 1], w * rng.range(0.45, 0.7));
    }
    if (dripChance > 0 && dripsMade < maxDrips) {
      const cand = [0, n - 1];
      for (let i = 2; i < n - 2; i++) if (ang[i] > 1.2) cand.push(i);
      for (const ci of cand) {
        if (dripsMade >= maxDrips) break;
        if (!rng.chance(dripChance)) continue;
        const len = Math.min(dripMax, Math.max(0.015, rng.exp(dripLen)));
        addDrip(dripP, bulbs, pts[ci * 2] + rng.range(-0.3, 0.3) * w, pts[ci * 2 + 1] + w * 0.3, len, dripW * rng.range(0.7, 1.2), rng);
        dripsMade++;
      }
    }
    if (dots && L > 0) {
      const cnt = Math.min(100, Math.round(dotsPerM * L * (0.6 + w * 30)));
      for (let k = 0; k < cnt; k++) {
        const idx = rng.int(0, n - 1);
        const i0 = Math.max(0, idx - 1), i1 = Math.min(n - 1, idx + 1);
        let tx = pts[i1 * 2] - pts[i0 * 2], ty = pts[i1 * 2 + 1] - pts[i0 * 2 + 1];
        const tl = hyp(tx, ty) || 1;
        tx /= tl; ty /= tl;
        const off = (w * 0.55 + Math.abs(rng.gauss()) * w * 1.1) * (rng.chance(0.5) ? 1 : -1);
        addCircle(dots, pts[idx * 2] - ty * off + tx * rng.range(-w, w), pts[idx * 2 + 1] + tx * off + ty * rng.range(-w, w), dotR * rng.range(0.6, 1.4));
      }
    }
  }

  ctx.lineCap = 'round';
  // soft halos: bevel joins are much cheaper to stroke and look the same
  ctx.lineJoin = 'bevel';
  // overspray halo + edge fuzz, adapted to the stroke's pixel width
  if (halo > 0 && lod < 2) {
    if (marker) {
      if (pw > 1.5) {
        ctx.strokeStyle = rgba(color, 0.07 * halo);
        ctx.lineWidth = w * 1.4;
        ctx.stroke(halos);
      }
    } else if (pw < 1.3 || lod > 0) {
      ctx.strokeStyle = rgba(color, alpha * 0.13 * halo);
      ctx.lineWidth = w * 2.3;
      ctx.stroke(halos);
    } else if (pw < 4) {
      ctx.strokeStyle = rgba(color, alpha * 0.1 * halo);
      ctx.lineWidth = w * 2.6;
      ctx.stroke(halos);
    } else {
      ctx.strokeStyle = rgba(color, alpha * 0.055 * halo);
      ctx.lineWidth = w * 3.4;
      ctx.stroke(halos);
      ctx.strokeStyle = rgba(color, alpha * 0.12 * halo);
      ctx.lineWidth = w * 2.0;
      ctx.stroke(halos);
      const fz = o.fuzz ?? 1;
      if (fz > 0 && pw > 6) {
        ctx.strokeStyle = rgba(color, alpha * 0.22 * fz);
        ctx.lineWidth = w * 1.28;
        ctx.stroke(halos);
      }
    }
  }
  ctx.lineJoin = 'round';
  const a1 = Math.min(1, alpha * (marker ? 1 : rng.range(0.92, 1.0)));
  ctx.fillStyle = rgba(color, a1);
  ctx.fill(coreA);
  if (anyB) {
    ctx.fillStyle = rgba(color, Math.min(1, alpha * rng.range(0.95, 1.05)));
    ctx.fill(coreB);
  }
  ctx.fillStyle = rgba(color, Math.min(1, alpha * 0.85));
  ctx.fill(blobs);
  if (dripsMade) {
    ctx.strokeStyle = rgba(color, Math.min(1, alpha * 0.9));
    ctx.lineWidth = dripW;
    ctx.stroke(dripP);
    ctx.fillStyle = rgba(color, Math.min(1, alpha * 0.92));
    ctx.fill(bulbs);
  }
  if (dots) {
    ctx.fillStyle = rgba(color, alpha * dotA);
    ctx.fill(dots);
  }
  const defaultMat = !o.metal && Math.abs((o.gloss ?? 150) - 150) < 35;
  if (P.wantProps && !o.noProps && !defaultMat) {
    const all = new Path2D();
    all.addPath(coreA);
    if (anyB) all.addPath(coreB);
    all.addPath(blobs);
    P.matFill(all, o.metal || 0, o.gloss ?? 150, 0, Math.min(1, alpha));
    if (dripsMade) P.matStroke(dripP, dripW, o.metal || 0, o.gloss ?? 150, 0, alpha);
  }
}

/** Constant-width crisp strokes (markers, outlines on scratch canvases). */
export function plainStrokes(ctx, strokes, width, style, cap = 'round', join = 'round') {
  const path = new Path2D();
  for (const p of strokes) addPolyline(path, p);
  ctx.lineCap = cap;
  ctx.lineJoin = join;
  ctx.miterLimit = 3;
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.stroke(path);
  return path;
}

/**
 * Quick zig-zag spray fill over a box (used inside clipped scratch canvases).
 * box in meters, sw = spray line width.
 */
export function zigzagFill(ctx, box, color, alpha, sw, rng, opts = {}) {
  const ang = opts.angle ?? rng.range(-0.35, 0.35); // 0 = vertical strokes
  const passes = opts.passes ?? 2;
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  const R = hyp(box.x1 - box.x0, box.y1 - box.y0) / 2 + sw;
  const cs = Math.cos(ang), sn = Math.sin(ang);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < passes; pass++) {
    const path = new Path2D();
    const step = sw * rng.range(0.7, 1.15) * (opts.spacing ?? 1);
    let u = -R + rng.range(0, step);
    let top = true;
    let first = true;
    while (u <= R) {
      const vv = (top ? -R : R) + rng.range(-0.15, 0.15) * R * (opts.ragged ?? 0.3);
      const x = cx + u * cs - vv * sn;
      const y = cy + u * sn + vv * cs;
      if (first) { path.moveTo(x, y); first = false; } else path.lineTo(x, y);
      top = !top;
      u += step * rng.range(0.8, 1.25);
      if (opts.gaps && rng.chance(opts.gaps)) { first = true; }
    }
    const a = alpha * rng.range(0.75, 1.1);
    ctx.strokeStyle = rgba(color, Math.min(1, a * 0.18));
    ctx.lineWidth = sw * 2.2;
    ctx.stroke(path);
    ctx.strokeStyle = rgba(color, Math.min(1, a));
    ctx.lineWidth = sw;
    ctx.stroke(path);
  }
}
