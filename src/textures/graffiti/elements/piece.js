// Pieces: large multicolor letters with fades, 3D extrusion, outlines,
// highlights and optional background clouds / bubbles / panel.

import { layoutText, placeSymbol } from '../font/font.js';
import { bboxOf, rotateAround, unionBox, resample, wobble } from '../core/geom.js';
import { PAINT, rgba, mix, darken, lighten, jitter } from '../core/color.js';
import { renderFatLetter, smoothSkeleton, letterDrips, streakTile } from './fatletter.js';
import { zigzagFill, addCircle } from '../paint/spray.js';

const SCHEMES = [
  { w: 9, c: ['white', 'silver', 'lightGrey'] },
  { w: 6, c: ['silver', 'white', 'chromeDark'] },
  { w: 3, c: ['lightGrey', 'grey', 'darkGrey'] },
  { w: 3, c: ['cream', 'lightGrey', 'grey'] },
  { w: 4, c: ['paleMint', 'mint', 'teal'] },
  { w: 4, c: ['paleBlue', 'skyBlue', 'blue'] },
  { w: 1.5, c: ['mint', 'paleBlue', 'skyBlue'] },
  { w: 1.5, c: ['skyBlue', 'white', 'paleBlue'] },
  { w: 1.5, c: ['yellow', 'gold', 'orange'] },
  { w: 1.2, c: ['pink', 'rose', 'purple'] },
  { w: 1.2, c: ['lavender', 'purple', 'navy'] },
  { w: 0.8, c: ['orange', 'red', 'maroon'] },
  { w: 1.2, c: ['cream', 'gold', 'ochre'] },
];

function pickScheme(rng) {
  const s = rng.pickW(SCHEMES.map((x) => [x, x.w]));
  return s.c.map((n) => jitter(PAINT[n], rng, 6));
}

/**
 * o: { x, y (center), writer, h, text, style }
 */
export function renderPiece(P, rng, o) {
  const w = o.writer;
  const style = o.style || w.pieceStyle || rng.pickW([['block', 5], ['semi', 3], ['soft', 2]]);
  let text = o.text || w.name;
  if (text.length > 6) text = text.slice(0, 6);
  const h = o.h;
  const Ff = style === 'soft' ? rng.range(0.3, 0.38) : rng.range(0.24, 0.32);
  const F = Ff * h;
  const L = layoutText(text, {
    h,
    wf: style === 'soft' ? rng.range(0.95, 1.15) : rng.range(0.85, 1.12),
    track: Ff - rng.range(-0.04, 0.12),
    slant: rng.range(-0.08, 0.2),
    angular: style === 'soft' ? 0 : rng.range(0.05, 0.1),
    scale: (i) => (style === 'semi' ? rng.range(0.88, 1.12) : rng.range(0.96, 1.04)),
    rot: () => (style === 'semi' ? rng.gauss() * 0.07 : rng.gauss() * 0.025),
    bounce: () => rng.gauss() * (style === 'semi' ? 0.06 : 0.02) * h,
  });
  const cx = (L.box.x0 + L.box.x1) / 2, cy = (L.box.y0 + L.box.y1) / 2;
  let sc = 1;
  if (o.maxW && L.width + F > o.maxW) sc = o.maxW / (L.width + F);
  const rot = rng.gaussC(0, 0.025);
  const xf = (p) => {
    const q = new Array(p.length);
    for (let i = 0; i < p.length; i += 2) {
      q[i] = o.x + (p[i] - cx) * sc;
      q[i + 1] = o.y + (p[i + 1] - cy) * sc;
    }
    return rotateAround(q, o.x, o.y, rot);
  };
  const hh = h * sc;
  const FF = F * sc;
  const letters = L.letters.map((le) => {
    const strokes = le.strokes.map(xf);
    // semi-wild: extend some stroke ends into kicks
    if (style === 'semi') {
      for (const p of strokes) {
        if (rng.chance(0.18)) {
          const n = p.length;
          const dx = p[n - 2] - p[n - 4], dy = p[n - 1] - p[n - 3];
          const l = Math.hypot(dx, dy) || 1;
          const k = hh * rng.range(0.15, 0.35);
          p.push(p[n - 2] + (dx / l) * k, p[n - 1] + (dy / l) * k);
        }
      }
    }
    return {
      strokes: style === 'soft' ? smoothSkeleton(strokes, hh, rng, 2, 0.008) : strokes.map((p) => wobble(resample(p, hh / 10, 60), hh * 0.006, 1 / hh, rng.int(0, 1e5))),
      cuts: le.cuts.map(xf),
      holes: le.holes.map(xf),
      h: le.h * sc,
    };
  });
  const allBox = bboxOf(letters.flatMap((l) => l.strokes), FF / 2);

  const [c1, c2, c3] = pickScheme(rng);
  const outline = rng.chance(0.85) ? PAINT.black : rng.chance(0.5) ? PAINT.navy : PAINT.maroon;
  const oW = hh * rng.range(0.045, 0.075);
  // plain straight letters (fill + outline only) are the most common alley pieces
  const simple = rng.chance(style === 'block' ? 0.45 : 0.25);
  const extrude = !simple && rng.chance(0.6)
    ? { dx: hh * rng.range(0.05, 0.12) * (rng.chance(0.7) ? 1 : -1), dy: hh * rng.range(0.04, 0.1), color: rng.pickW([[darken(c3, 0.35), 3], [PAINT.black, 1.5], [PAINT.purple, 1], [PAINT.navy, 1], [PAINT.maroon, 1], [lighten(c1, 0.3), 1]]), steps: 8 }
    : null;
  const second = !simple && rng.chance(0.6) ? { w: hh * rng.range(0.03, 0.06), color: rng.pickW([[PAINT.white, 5], [PAINT.cream, 2], [lighten(c1, 0.5), 2], [PAINT.black, 1]]) } : null;
  const fillAlpha = rng.range(0.85, 0.97);

  // background
  const bg = simple ? 'none' : rng.pickW([['none', 7], ['cloud', 1.5], ['bubbles', 1.5], ['panel', 1]]);
  let box = unionBox(null, allBox);
  if (bg === 'cloud') box = unionBox(box, drawCloud(P, rng, allBox, hh, outline, rng.pickW([[PAINT.white, 3], [lighten(c1, 0.55), 2], [PAINT.paleBlue, 1], [PAINT.lavender, 1]])));
  else if (bg === 'bubbles') box = unionBox(box, drawBubbles(P, rng, allBox, hh, outline, c2));
  else if (bg === 'panel') box = unionBox(box, drawPanel(P, rng, allBox, hh, mix(rng.pickW([[PAINT.paleMint, 2], [PAINT.mint, 1], [PAINT.paleBlue, 2], [PAINT.lightGrey, 1], [PAINT.lavender, 1], [PAINT.cream, 0.6]]), P.wallTone, rng.range(0.15, 0.35))));

  const fillFn = makeGradientFill(c1, c2, c3, fillAlpha, allBox, rng, FF);
  const st = {
    mode: 'piece',
    gradient: fillFn.gradient,
    pieceFill: fillFn.texture,
    F: FF,
    o: oW,
    cap: style === 'soft' ? 'round' : 'square',
    join: style === 'soft' ? 'round' : 'miter',
    fill: c1,
    fillAlpha,
    outline,
    halo: FF * 0.15,
    extrude,
    second,
    cuts: style === 'soft',
    holes: style === 'soft',
    shine: false,
    metal: c1[0] > 180 && Math.abs(c1[0] - c1[2]) < 14 && c1[0] < 200 ? 200 : 0,
    gloss: 150,
  };
  const order = rng.chance(0.7) ? letters : letters.slice().reverse();
  for (const le of order) box = unionBox(box, renderFatLetter(P, rng, le, st));
  // highlights: white edge ticks + sparkles
  drawHighlights(P, rng, letters, FF, hh);
  if (rng.chance(0.5)) letterDrips(P, rng, letters, FF, oW, outline, rng.int(1, 5), hh * 0.3);
  // occasional arrow / star accents
  if (rng.chance(0.35)) {
    const s = hh * rng.range(0.25, 0.4);
    const sym = placeSymbol(rng.pick(['arrow', 'star', 'star4', 'arrowCurve']), allBox.x1 - s * 0.2, allBox.y0 - s * rng.range(0.2, 0.8), s, rng.range(-0.6, 0.3));
    const symL = { strokes: sym.map((p) => resample(p, s / 8, 40)), cuts: [], holes: [] };
    box = unionBox(box, renderFatLetter(P, rng, symL, { ...st, mode: 'throw', F: s * 0.16, o: oW * 0.6, extrude: null, second: null, fill: c2, fillAlpha: 0.95, cap: 'round', join: 'round', streak: { sw: s * 0.1, variant: 1 } }));
  }
  return box;
}

function makeGradientFill(c1, c2, c3, alpha, box, rng, F) {
  const vertical = rng.chance(0.75);
  const bands = rng.int(2, 3);
  const t1 = rng.range(0.25, 0.45), t2 = rng.range(0.55, 0.8);
  const pat = rng.pickW([['none', 4], ['bubbles', 2], ['stripes', 1.5], ['cracks', 1], ['dots', 1.5]]);
  const texVariant = rng.int(0, 7);
  const texAngle = rng.range(-0.5, 0.5);
  const gradient = (u) => {
    const g = vertical ? u.createLinearGradient(0, box.y0, 0, box.y1) : u.createLinearGradient(box.x0, box.y0, box.x1, box.y1 * 0.6 + box.y0 * 0.4);
    g.addColorStop(0, rgba(c1, 1));
    g.addColorStop(t1, rgba(c1, 1));
    g.addColorStop(Math.min(0.95, t1 + 0.12), rgba(c2, 1));
    if (bands > 2) {
      g.addColorStop(t2, rgba(c2, 1));
      g.addColorStop(Math.min(1, t2 + 0.1), rgba(c3, 1));
    }
    g.addColorStop(1, rgba(bands > 2 ? c3 : c2, 1));
    return g;
  };
  // drawn with 'source-atop' onto the opaque fill
  const texture = (u, lb, r) => {
    const tile = streakTile(lighten(c1, 0.15), null, 0.22, texVariant);
    const p0 = u.createPattern(tile, 'repeat');
    if (p0 && p0.setTransform && typeof DOMMatrix !== 'undefined') {
      const k = (F * 3) / 128;
      p0.setTransform(new DOMMatrix().translateSelf(lb.x0, lb.y0).rotateSelf((texAngle * 180) / Math.PI).scaleSelf(k, k));
    }
    u.fillStyle = p0 || rgba(lighten(c1, 0.1), 0.1);
    u.fillRect(lb.x0, lb.y0, lb.x1 - lb.x0, lb.y1 - lb.y0);
    if (pat === 'bubbles') {
      const p = new Path2D();
      const n = Math.round(((lb.x1 - lb.x0) * (lb.y1 - lb.y0)) / (F * F) * 1.2);
      for (let i = 0; i < n; i++) addCircle(p, r.range(lb.x0, lb.x1), r.range(lb.y0, lb.y1), F * r.range(0.08, 0.25));
      u.fillStyle = rgba(lighten(c1, 0.35), 0.5);
      u.fill(p);
      u.strokeStyle = rgba(darken(c2, 0.2), 0.6);
      u.lineWidth = F * 0.03;
      u.stroke(p);
    } else if (pat === 'stripes') {
      const p = new Path2D();
      const step = F * r.range(0.45, 0.8);
      for (let y = lb.y0; y < lb.y1 + (lb.x1 - lb.x0); y += step) { p.moveTo(lb.x0, y); p.lineTo(lb.x1, y - (lb.x1 - lb.x0) * 0.6); }
      u.strokeStyle = rgba(lighten(c2, 0.3), 0.45);
      u.lineWidth = step * 0.35;
      u.stroke(p);
    } else if (pat === 'cracks') {
      const p = new Path2D();
      for (let i = 0; i < 6; i++) {
        let x = r.range(lb.x0, lb.x1), y = r.range(lb.y0, lb.y1);
        p.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += r.range(-1, 1) * F * 0.4; y += r.range(-1, 1) * F * 0.4; p.lineTo(x, y); }
      }
      u.strokeStyle = rgba(darken(c3, 0.4), 0.7);
      u.lineWidth = F * 0.035;
      u.stroke(p);
    } else if (pat === 'dots') {
      const p = new Path2D();
      const n = Math.round(((lb.x1 - lb.x0) * (lb.y1 - lb.y0)) / (F * F) * 4);
      for (let i = 0; i < n; i++) addCircle(p, r.range(lb.x0, lb.x1), r.range(lb.y0, lb.y1), F * 0.035);
      u.fillStyle = rgba(r.chance(0.5) ? [250, 250, 248] : darken(c3, 0.3), 0.7);
      u.fill(p);
    }
  };
  return { gradient, texture };
}

function drawHighlights(P, rng, letters, F, h) {
  const ctx = P.ctx;
  const p = new Path2D();
  for (const L of letters) {
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const s = L.strokes[rng.int(0, L.strokes.length - 1)];
      if (!s || s.length < 4) continue;
      const k = rng.int(0, (s.length >> 1) - 2) * 2;
      const dx = s[k + 2] - s[k], dy = s[k + 3] - s[k + 1];
      const l = Math.hypot(dx, dy) || 1;
      // offset toward the upper-left edge of the stroke
      let nx = -dy / l, ny = dx / l;
      if (ny > 0) { nx = -nx; ny = -ny; }
      const off = F * 0.3;
      const len = Math.min(l, F * rng.range(0.6, 1.4));
      const x0 = s[k] + nx * off, y0 = s[k + 1] + ny * off;
      p.moveTo(x0, y0);
      p.lineTo(x0 + (dx / l) * len, y0 + (dy / l) * len);
    }
  }
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba([248, 248, 244], 0.85);
  ctx.lineWidth = F * 0.08;
  ctx.stroke(p);
  // sparkles
  const sp = new Path2D();
  const ns = rng.int(1, 4);
  for (let i = 0; i < ns; i++) {
    const L = letters[rng.int(0, letters.length - 1)];
    const b = bboxOf(L.strokes);
    const x = rng.range(b.x0, b.x1), y = rng.range(b.y0, b.y0 + (b.y1 - b.y0) * 0.5);
    const r = F * rng.range(0.25, 0.5);
    sp.moveTo(x - r, y); sp.lineTo(x + r, y); sp.moveTo(x, y - r); sp.lineTo(x, y + r);
    addCircle(sp, x, y, r * 0.12);
  }
  ctx.lineWidth = F * 0.05;
  ctx.stroke(sp);
  ctx.fillStyle = rgba([250, 250, 248], 0.9);
  ctx.fill(sp);
}

function drawCloud(P, rng, box, h, outline, color) {
  const ctx = P.ctx;
  const circles = [];
  const w = box.x1 - box.x0;
  const n = Math.max(4, Math.round(w / (h * 0.45)));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const r = h * rng.range(0.28, 0.5);
    circles.push([box.x0 + w * t + rng.range(-0.1, 0.1) * h, box.y1 - h * rng.range(0.05, 0.35), r]);
  }
  for (let i = 0; i < 3; i++) circles.push([box.x0 + w * rng.range(0, 1), box.y0 + h * rng.range(0.05, 0.4), h * rng.range(0.2, 0.4)]);
  const oW = h * 0.04;
  const po = new Path2D(), pf = new Path2D();
  for (const [x, y, r] of circles) { addCircle(po, x, y, r + oW); addCircle(pf, x, y, r); }
  ctx.fillStyle = rgba(color, 0.1);
  ctx.save();
  ctx.lineWidth = h * 0.12;
  ctx.strokeStyle = rgba(color, 0.08);
  ctx.stroke(po);
  ctx.restore();
  ctx.fillStyle = rgba(outline, 0.95);
  ctx.fill(po);
  ctx.fillStyle = rgba(color, 0.93);
  ctx.fill(pf);
  P.matFill(po, 0, 150, 0, 0.95);
  let b = null;
  for (const [x, y, r] of circles) b = unionBox(b, { x0: x - r - oW, y0: y - r - oW, x1: x + r + oW, y1: y + r + oW });
  return b;
}

function drawBubbles(P, rng, box, h, outline, color) {
  const ctx = P.ctx;
  const n = rng.int(5, 12);
  const po = new Path2D(), pf = new Path2D(), ph = new Path2D();
  let b = null;
  for (let i = 0; i < n; i++) {
    const r = h * rng.range(0.05, 0.22);
    const x = rng.chance(0.5) ? box.x0 - r * rng.range(0, 2) + rng.range(-0.2, 0.3) * h : box.x1 + r * rng.range(-0.5, 2);
    const y = rng.range(box.y0 - h * 0.3, box.y1);
    addCircle(po, x, y, r * 1.12);
    addCircle(pf, x, y, r);
    addCircle(ph, x - r * 0.4, y - r * 0.4, r * 0.18);
    b = unionBox(b, { x0: x - r * 1.2, y0: y - r * 1.2, x1: x + r * 1.2, y1: y + r * 1.2 });
  }
  ctx.fillStyle = rgba(outline, 0.95);
  ctx.fill(po);
  ctx.fillStyle = rgba(lighten(color, 0.2), 0.92);
  ctx.fill(pf);
  ctx.fillStyle = rgba([250, 250, 248], 0.9);
  ctx.fill(ph);
  P.matFill(po, 0, 150, 0, 0.95);
  return b;
}

function drawPanel(P, rng, box, h, color) {
  const ctx = P.ctx;
  const m = h * rng.range(0.15, 0.4);
  const x0 = box.x0 - m, y0 = box.y0 - m * rng.range(0.6, 1.2), x1 = box.x1 + m, y1 = box.y1 + m * rng.range(0.5, 1);
  const p = new Path2D();
  p.moveTo(x0 + rng.range(-0.05, 0.05), y0);
  p.lineTo(x1, y0 + rng.range(-0.05, 0.05));
  p.lineTo(x1 + rng.range(-0.05, 0.05), y1);
  p.lineTo(x0, y1 + rng.range(-0.05, 0.05));
  p.closePath();
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(color, 0.12);
  ctx.lineWidth = h * 0.16;
  ctx.stroke(p);
  ctx.strokeStyle = rgba(color, 0.3);
  ctx.lineWidth = h * 0.07;
  ctx.stroke(p);
  ctx.fillStyle = rgba(color, 0.88);
  ctx.fill(p);
  ctx.clip(p);
  zigzagFill(ctx, { x0, y0, x1, y1 }, color, 0.25, h * 0.12, rng, { angle: rng.range(-0.3, 0.3), passes: 1 });
  ctx.restore();
  P.matFill(p, 0, 130, 0, 0.9);
  return { x0: x0 - h * 0.08, y0: y0 - h * 0.08, x1: x1 + h * 0.08, y1: y1 + h * 0.08 };
}
