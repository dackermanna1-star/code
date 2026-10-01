// Marker scribbles, illegible scrawl, tiny doodles, tally marks, scratches.

import { placeSymbol, layoutText } from '../font/font.js';
import { bboxOf, translate, rotateAround, wobble, resample, chaikin } from '../core/geom.js';
import { sprayStrokes, plainStrokes } from '../paint/spray.js';
import { rgba, pickMarkerColor, PAINT } from '../core/color.js';

function scrawlPath(rng, x, y, len, hgt) {
  const p = [x, y];
  let cx = x;
  const n = Math.max(4, Math.round(len / (hgt * 0.35)));
  for (let i = 0; i < n; i++) {
    cx += (len / n) * rng.range(0.5, 1.5);
    const up = i % 2 === 0;
    const loop = rng.chance(0.25);
    if (loop) {
      p.push(cx + hgt * 0.1, y - hgt * rng.range(0.6, 1.1), cx - hgt * 0.15, y - hgt * rng.range(0.4, 0.9), cx + hgt * 0.05, y + hgt * 0.05);
    } else {
      p.push(cx, y - (up ? hgt * rng.range(0.3, 1) : -hgt * rng.range(0, 0.15)));
    }
  }
  return p;
}

/**
 * o: { x, y, kind, writer, color, h }
 */
export function renderScribble(P, rng, o) {
  const kind = o.kind || rng.pickW([['scrawl', 4], ['doodle', 2.5], ['initials', 1.5], ['tally', 0.8], ['marks', 1], ['circle', 0.6], ['date', 1]]);
  const color = o.color || pickMarkerColor(rng);
  const h = o.h ?? rng.range(0.04, 0.12);
  let strokes = [];
  switch (kind) {
    case 'scrawl': {
      const lines = rng.int(1, 3);
      for (let l = 0; l < lines; l++) strokes.push(scrawlPath(rng, o.x, o.y + l * h * 1.4, h * rng.range(2, 6), h));
      break;
    }
    case 'doodle': {
      const sym = rng.pick(['heart', 'smiley', 'star', 'crown', 'eye', 'arrow', 'x', 'spark', 'bolt', 'star4']);
      strokes = placeSymbol(sym, o.x, o.y, h * rng.range(1, 2), rng.range(-0.4, 0.4));
      break;
    }
    case 'initials': {
      const A = String.fromCharCode(65 + rng.int(0, 25)), B = String.fromCharCode(65 + rng.int(0, 25));
      const L = layoutText(A + '+' + B, { h, wf: 0.7, track: 0.15, slant: rng.range(0, 0.3) });
      for (const le of L.letters) for (const p of le.strokes) strokes.push(translate(p, o.x, o.y));
      if (rng.chance(0.5)) {
        const hs = (L.width + h) * 1.1;
        strokes.push(...placeSymbol('heart', o.x + L.width / 2 - hs / 2, o.y - h / 2 - hs * 0.55, hs, 0));
      }
      break;
    }
    case 'tally': {
      const n = rng.int(3, 12);
      for (let i = 0; i < n; i++) {
        const gx = o.x + i * h * 0.22 + Math.floor(i / 5) * h * 0.2;
        if ((i + 1) % 5 === 0) strokes.push([gx - h * 0.9, o.y - h * 0.2, gx + h * 0.05, o.y - h * 0.8]);
        else strokes.push([gx, o.y, gx + h * 0.05, o.y - h]);
      }
      break;
    }
    case 'marks': {
      const n = rng.int(2, 6);
      for (let i = 0; i < n; i++) {
        const mx = o.x + rng.range(-1, 1) * h * 2, my = o.y + rng.range(-1, 1) * h;
        strokes.push([mx, my, mx + rng.range(-1, 1) * h, my + rng.range(-1, 1) * h]);
      }
      break;
    }
    case 'circle': {
      const r = h * rng.range(1.5, 4);
      const p = [];
      const a0 = rng.range(0, 6.28);
      for (let i = 0; i <= 24; i++) {
        const a = a0 + (i / 24) * Math.PI * 2.15;
        p.push(o.x + Math.cos(a) * r * 1.3, o.y + Math.sin(a) * r * 0.8);
      }
      strokes.push(p);
      break;
    }
    case 'date': {
      const txt = (rng.chance(0.5) ? "'" : '') + String(rng.int(0, 99)).padStart(2, '0') + (rng.chance(0.4) ? '!' : '');
      const L = layoutText(txt, { h, wf: 0.7, track: 0.1, slant: rng.range(0, 0.3) });
      for (const le of L.letters) for (const p of le.strokes) strokes.push(translate(p, o.x, o.y));
      break;
    }
  }
  if (!strokes.length) return null;
  const rot = rng.gaussC(0, 0.15);
  strokes = strokes.map((p) => wobble(chaikin(resample(rotateAround(p, o.x, o.y, rot), h / 8, 80), 1), h * 0.03, 1 / (h * 0.8), rng.int(0, 1e5)));
  const w = o.lineW ?? Math.max(0.002, Math.min(0.008, h * rng.range(0.05, 0.1)));
  sprayStrokes(P, strokes, { w, color, alpha: 0.92, rng, tool: 'marker', gloss: 120, drip: 0.01, halo: 0 });
  return bboxOf(strokes, w);
}

/** Scratchiti: light thin scratched lines (mainly on painted metal props). */
export function renderScratches(P, rng, o) {
  const strokes = [];
  const n = o.count ?? rng.int(3, 10);
  for (let i = 0; i < n; i++) {
    const x = o.x + rng.range(-1, 1) * o.r, y = o.y + rng.range(-1, 1) * o.r * 0.5;
    if (rng.chance(0.5)) {
      strokes.push(scrawlPath(rng, x, y, o.r * rng.range(0.5, 1.2), o.r * 0.15));
    } else {
      const a = rng.range(-0.6, 0.6);
      const l = o.r * rng.range(0.2, 0.8);
      strokes.push([x, y, x + Math.cos(a) * l, y + Math.sin(a) * l]);
    }
  }
  const ctx = P.ctx;
  plainStrokes(ctx, strokes, 0.0015, rgba(o.color || [196, 194, 188], 0.75));
  if (P.wantProps) {
    const path = new Path2D();
    for (const p of strokes) { path.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) path.lineTo(p[i], p[i + 1]); }
    P.matStroke(path, 0.0015, o.metal ?? 180, 90, 0, 0.75);
  }
  return bboxOf(strokes, 0.01);
}

export { PAINT };
