// Handstyle tags: fast single-color signatures with personal letterforms,
// connections, exaggerated first/last letters, swooshes and decorations.

import { layoutText, placeSymbol } from '../font/font.js';
import { chaikin, resample, wobble, bboxOf, rotateAround, translate, cubicPts, quadPts } from '../core/geom.js';
import { sprayStrokes } from '../paint/spray.js';

function lastPt(p) { return [p[p.length - 2], p[p.length - 1]]; }

/** Extend a stroke end along its final direction. */
function extendEnd(p, len) {
  const n = p.length;
  const dx = p[n - 2] - p[n - 4], dy = p[n - 1] - p[n - 3];
  const l = Math.hypot(dx, dy) || 1;
  p.push(p[n - 2] + (dx / l) * len, p[n - 1] + (dy / l) * len);
}

function addHook(p, h, dir, rng) {
  const n = p.length;
  const ex = p[n - 2], ey = p[n - 1];
  let dx = ex - p[n - 4], dy = ey - p[n - 3];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l; dy /= l;
  const k = h * rng.range(0.08, 0.2);
  quadPts(ex, ey, ex + dx * k, ey + dy * k, ex + dx * k * 0.6 + dir * k * 1.1, ey + dy * k * 0.6 - k * 0.15, 5, p);
}

/**
 * Build tag geometry in local space (meters, centered later).
 * Returns { strokes, h, box, lineScale }.
 */
export function buildTagGeometry(writer, h, rng, opts = {}) {
  const hand = writer.hand;
  let text = opts.text || writer.name;
  let numberChars = 0;
  if (!opts.text && hand.number && rng.chance(0.55)) {
    text += hand.number;
    numberChars = hand.number.length;
  }
  const n = [...text].length;
  const wf = Math.max(0.35, Math.min(1.15, hand.wf * (1.25 / hand.aspect)));
  const slant = hand.slant + rng.range(-0.05, 0.05);
  const curveAmp = rng.range(-0.12, 0.12) * h;
  const sizeSeed = rng.int(0, 1e6);
  const L = layoutText(text, {
    h,
    wf,
    track: hand.track + rng.range(-0.04, 0.04),
    slant,
    variant: (ch) => (hand.variants[ch] ?? (rng.chance(0.5) ? 0 : 1)),
    scale: (i, cnt) => {
      let s = 1 + hand.sizeJ * (((sizeSeed * (i + 3)) % 997) / 498 - 1);
      if (i === 0) s *= hand.firstScale;
      if (i === cnt - 1 - numberChars) s *= hand.lastScale;
      if (i >= cnt - numberChars) s *= 0.6;
      return s;
    },
    rot: () => rng.gauss() * hand.rotJ,
    bounce: () => rng.gauss() * hand.bounce * h,
    baseCurve: (t) => curveAmp * Math.sin(t * Math.PI),
  });

  const strokes = [];
  const letters = L.letters;
  for (let li = 0; li < letters.length; li++) {
    const le = letters[li];
    const ls = le.strokes.map((p) => p.slice());
    // stem extension (exaggeration) on first/last letters mostly
    const isEdge = li === 0 || li === letters.length - 1 - numberChars;
    if (ls.length && rng.chance(hand.stemExt * (isEdge ? 1 : 0.35))) {
      // extend the stroke whose end is lowest
      let best = -1, by = -Infinity;
      for (let k = 0; k < ls.length; k++) {
        const [, ey] = lastPt(ls[k]);
        if (ey > by) { by = ey; best = k; }
      }
      if (best >= 0) extendEnd(ls[best], le.h * rng.range(0.2, 0.7));
    }
    if (ls.length && rng.chance(hand.hooks * 0.5)) {
      const k = rng.int(0, ls.length - 1);
      addHook(ls[k], le.h, rng.sign(), rng);
    }
    // connection to the previous letter
    if (hand.connect && strokes.length && ls.length && li > 0 && li < letters.length - numberChars) {
      const prev = strokes[strokes.length - 1];
      const [ex, ey] = lastPt(prev);
      const sx = ls[0][0], sy = ls[0][1];
      const dx = sx - ex;
      if (dx > -0.25 * h && dx < 0.9 * h && Math.abs(sy - ey) < 0.75 * h && rng.chance(0.85)) {
        const midx = (ex + sx) / 2, midy = Math.max(ey, sy) + h * rng.range(0.02, 0.15);
        const merged = prev.slice();
        quadPts(ex, ey, midx, midy, sx, sy, 6, merged);
        for (let q = 2; q < ls[0].length; q++) merged.push(ls[0][q]);
        strokes[strokes.length - 1] = merged;
        ls.shift();
      }
    }
    for (const p of ls) strokes.push(p);
  }

  let box = bboxOf(strokes);
  const baseY = 0;
  // underline / swoosh
  if (rng.chance(hand.underline * (opts.decoScale ?? 1))) {
    const w = box.x1 - box.x0;
    const sw = [];
    const kind = rng.next();
    if (kind < 0.5) {
      // return swoosh from the last letter back under the word
      const sx = box.x1 - h * rng.range(0.05, 0.3), sy = baseY + h * rng.range(-0.05, 0.08);
      sw.push(sx, sy);
      cubicPts(sx, sy, box.x1 + h * rng.range(0.1, 0.5), sy + h * rng.range(0.2, 0.45),
        box.x0 + w * rng.range(0.3, 0.6), baseY + h * rng.range(0.25, 0.4),
        box.x0 - h * rng.range(0, 0.3), baseY + h * rng.range(0.05, 0.25), 14, sw);
    } else if (kind < 0.8) {
      const y0 = baseY + h * rng.range(0.12, 0.25);
      sw.push(box.x0 + h * rng.range(-0.2, 0.2), y0);
      quadPts(sw[0], y0, box.x0 + w * 0.5, y0 + h * rng.range(-0.08, 0.12), box.x1 + h * rng.range(0, 0.4), y0 + h * rng.range(-0.25, 0.05), 10, sw);
    } else {
      // double line
      const y0 = baseY + h * rng.range(0.12, 0.2);
      sw.push(box.x0, y0, box.x1 + h * 0.2, y0 - h * 0.05);
      strokes.push([box.x0 + h * 0.15, y0 + h * 0.1, box.x1 + h * 0.05, y0 + h * 0.06]);
    }
    strokes.push(sw);
    if (hand.deco === 'arrow' && rng.chance(0.7)) {
      const n2 = sw.length;
      const ex = sw[n2 - 2], ey = sw[n2 - 1];
      const dx = ex - sw[n2 - 4], dy = ey - sw[n2 - 3];
      const l = Math.hypot(dx, dy) || 1;
      const ux = dx / l, uy = dy / l;
      const a = h * 0.18;
      strokes.push([ex - ux * a - uy * a * 0.7, ey - uy * a + ux * a * 0.7, ex, ey, ex - ux * a + uy * a * 0.7, ey - uy * a - ux * a * 0.7]);
    }
  }
  // decorations
  if (hand.deco && rng.chance(hand.decoP * (opts.decoScale ?? 1))) {
    const f = letters[0];
    const s = h * rng.range(0.3, 0.5);
    switch (hand.deco) {
      case 'crown':
        strokes.push(...placeSymbol(rng.chance(0.5) ? 'crown' : 'crown2', f.box.x0 + (f.box.x1 - f.box.x0) / 2 - s * 0.5, f.box.y0 - s * 1.05, s, rng.range(-0.25, 0.15)));
        break;
      case 'halo':
        strokes.push(...placeSymbol('halo', f.box.x0 - s * 0.1, f.box.y0 - s * 0.55, s * 1.1, rng.range(-0.2, 0.1)));
        break;
      case 'star':
        strokes.push(...placeSymbol(rng.chance(0.6) ? 'star' : 'star4', box.x1 + s * 0.1, box.y0 + rng.range(-0.3, 0.4) * h, s * 0.8, rng.range(-0.3, 0.3)));
        break;
      case 'dots':
        strokes.push([box.x1 + h * 0.12, baseY - h * 0.02, box.x1 + h * 0.125, baseY - h * 0.01]);
        if (rng.chance(0.5)) strokes.push([box.x1 + h * 0.3, baseY - h * 0.02, box.x1 + h * 0.305, baseY - h * 0.01]);
        break;
      case 'quote':
        strokes.push([box.x1 + h * 0.08, box.y0, box.x1 + h * 0.03, box.y0 + h * 0.22]);
        strokes.push([box.x1 + h * 0.2, box.y0, box.x1 + h * 0.15, box.y0 + h * 0.22]);
        break;
      case 'dash':
        strokes.push([box.x0 - h * 0.45, -h * 0.5, box.x0 - h * 0.12, -h * 0.52]);
        break;
      case 'spark':
        strokes.push(...placeSymbol('spark', box.x1 + h * 0.05, box.y0 - h * 0.2, s * 0.7, 0));
        break;
      case 'heart':
        strokes.push(...placeSymbol('heart', box.x1 + h * 0.1, -h * 0.75, s * 0.7, rng.range(-0.3, 0.3)));
        break;
      case 'arrow':
        if (rng.chance(0.4)) strokes.push(...placeSymbol('arrow', box.x1 + h * 0.08, -h * 0.65, s, rng.range(-0.6, 0.2)));
        break;
    }
  }
  // crew letters
  if (writer.crew && rng.chance(hand.crewP * (opts.decoScale ?? 1))) {
    const ch = h * rng.range(0.3, 0.45);
    const C = layoutText(writer.crew, { h: ch, wf: 0.6, track: 0.2, slant: hand.slant * 0.7 });
    const ox = rng.chance(0.6) ? box.x1 + h * 0.15 : box.x0 + rng.range(0, 0.4) * (box.x1 - box.x0);
    const oy = rng.chance(0.6) ? 0 : h * 0.45 + ch;
    for (const le of C.letters) for (const p of le.strokes) strokes.push(translate(p, ox, oy));
  }

  // hand processing: resample, smooth corners, wobble
  const ds = h / 22;
  const chIters = hand.round > 0.6 ? 2 : hand.round > 0.25 ? 1 : 0;
  const wseed = rng.int(0, 1e6);
  const out = [];
  for (let i = 0; i < strokes.length; i++) {
    let p = strokes[i];
    if (p.length < 4) { out.push(p); continue; }
    p = resample(p, ds * 1.6, 120);
    if (chIters) p = chaikin(p, chIters, 0.22 + hand.round * 0.06);
    p = wobble(p, hand.wobble * h, 1 / (h * 0.55), wseed + i * 13, hand.wobble * h * 0.5);
    out.push(p);
  }
  box = bboxOf(out);
  return { strokes: out, box, text };
}

/**
 * Render a tag centered at (x, y) wall meters. Returns bbox.
 * o: { writer, h, color, tool, alpha, rot, vertical }
 */
export function renderTag(P, rng, o) {
  const writer = o.writer;
  const h = o.h;
  const geo = o.vertical ? buildVerticalTag(writer, h, rng) : buildTagGeometry(writer, h, rng, o);
  const cx = (geo.box.x0 + geo.box.x1) / 2, cy = (geo.box.y0 + geo.box.y1) / 2;
  const rot = o.rot ?? rng.gaussC(0, 0.07);
  let strokes = geo.strokes.map((p) => rotateAround(translate(p, o.x - cx, o.y - cy), o.x, o.y, rot));
  if (o.maxW) {
    const bw = geo.box.x1 - geo.box.x0;
    if (bw > o.maxW) {
      const s = o.maxW / bw;
      strokes = strokes.map((p) => p.map((v, i) => (i & 1 ? o.y + (v - o.y) * s : o.x + (v - o.x) * s)));
    }
  }
  const tool = o.tool || writer.tool;
  let w, extra = {};
  const sizeF = Math.pow(h / 0.22, 0.55);
  switch (tool) {
    case 'marker':
      w = Math.max(0.003, Math.min(0.014, 0.006 * sizeF * rng.range(0.8, 1.3)));
      extra = { tool: 'marker', drip: 0.02, gloss: 120, halo: 0.6 };
      break;
    case 'mop':
      w = Math.max(0.01, Math.min(0.03, 0.016 * sizeF * rng.range(0.8, 1.3)));
      extra = { tool: 'mop', drip: 0.4, dripLen: 0.09, gloss: 120, alpha: (o.alpha ?? 0.92) * rng.range(0.8, 0.95), maxDrips: 14 };
      break;
    case 'fat':
      w = Math.max(0.02, Math.min(0.05, 0.03 * sizeF * rng.range(0.85, 1.2)));
      extra = { drip: 0.25, dripLen: 0.08, maxDrips: 10 };
      break;
    default:
      w = Math.max(0.008, Math.min(0.03, writer.lineW * sizeF * rng.range(0.85, 1.15)));
      extra = { drip: 0.1, dripLen: 0.05 };
  }
  const color = o.color || writer.color;
  const metal = o.metal ?? (color === writer.color && isChrome(color) ? 225 : 0);
  sprayStrokes(P, strokes, {
    w,
    color,
    alpha: o.alpha ?? 0.93,
    rng,
    taperEnd: writer.hand.family === 'caps' ? 0.25 : 0.7,
    taperStart: 0.1,
    pressure: 0.3,
    metal,
    gloss: o.gloss ?? 150,
    lod: o.lod ?? 0,
    ...extra,
    ...(o.alpha != null && extra.alpha == null ? { alpha: o.alpha } : {}),
  });
  return bboxOf(strokes, w * 2);
}

function isChrome(c) { return c[0] > 175 && c[0] < 200 && Math.abs(c[0] - c[2]) < 12; }

/** Letters stacked top to bottom (poles, pipes, door edges). */
export function buildVerticalTag(writer, h, rng) {
  const text = writer.name;
  const hand = writer.hand;
  const strokes = [];
  let y = 0;
  for (const ch of text) {
    const L = layoutText(ch, { h, wf: hand.wf, slant: hand.slant * 0.5, variant: (c) => hand.variants[c] ?? 0, rot: () => rng.gauss() * 0.06 });
    const le = L.letters[0];
    const dx = -(le.box.x0 + le.box.x1) / 2 + rng.range(-0.08, 0.08) * h;
    for (const p of le.strokes) strokes.push(translate(p, dx, y));
    y += h * rng.range(1.12, 1.3);
  }
  const ds = h / 22;
  const wseed = rng.int(0, 1e6);
  const out = strokes.map((p, i) => wobble(chaikin(resample(p, ds * 1.6, 120), hand.round > 0.4 ? 1 : 0), hand.wobble * h, 1 / (h * 0.55), wseed + i));
  return { strokes: out, box: bboxOf(out), text };
}
