// Throw-ups: 2-4 fat rounded letters, quick streaky fill, crisp outline,
// overlapping letters, optional shadow / second outline / shines / drips.

import { layoutText } from '../font/font.js';
import { bboxOf, translate, rotateAround, unionBox } from '../core/geom.js';
import { PAINT, mix, darken, lighten, jitter } from '../core/color.js';
import { renderFatLetter, smoothSkeleton, letterDrips } from './fatletter.js';

/**
 * o: { x, y (center, wall meters), writer, h, fresh (0..1), alpha, style overrides }
 * returns bbox
 */
export function renderThrowup(P, rng, o) {
  const w = o.writer;
  const t = w.throw || defaultThrow(rng, w.name);
  const h = o.h;
  const text = o.text || t.text;
  const L = layoutText(text, {
    h,
    wf: t.wf,
    // visual overlap of neighbouring fat letters = fat - track
    track: t.fat - (t.hollow ? t.overlap * 0.4 : t.overlap),
    slant: rng.range(-0.04, 0.16),
    scale: (i, n) => (i === 0 ? rng.range(1, 1.12) : rng.range(0.9, 1.06)),
    rot: () => rng.gauss() * t.rot,
    bounce: () => rng.gauss() * 0.05 * h,
  });
  const cx = (L.box.x0 + L.box.x1) / 2, cy = (L.box.y0 + L.box.y1) / 2;
  const rot = rng.gaussC(0, 0.05);
  const letters = L.letters.map((le) => {
    const xf = (p) => rotateAround(translate(p, o.x - cx, o.y - cy), o.x, o.y, rot);
    return {
      strokes: smoothSkeleton(le.strokes.map(xf), le.h, rng, 2, 0.015),
      cuts: le.cuts.map(xf),
      holes: le.holes.map(xf),
      h: le.h,
    };
  });
  const F = t.fat * h;
  const oW = h * rng.range(0.05, 0.085);
  let fill = PAINT[t.fill] || PAINT.silver;
  let outline = PAINT[t.outline] || PAINT.black;
  fill = jitter(fill, rng, 5);
  const isChrome = t.fill === 'silver';
  const fillAlpha = t.hollow ? 0 : t.fill === 'black' ? 0.9 : rng.range(0.72, 0.95);
  const shadow = t.shadow
    ? { dx: h * rng.range(0.03, 0.06) * (rng.chance(0.7) ? 1 : -1), dy: h * rng.range(0.025, 0.05), color: rng.chance(0.6) ? darken(outline, 0.1) : PAINT[rng.pick(['red', 'blue', 'purple', 'maroon', 'grey'])] }
    : null;
  const second = t.second && !t.hollow ? { w: h * rng.range(0.035, 0.06), color: t.fill === 'white' ? PAINT[rng.pick(['red', 'blue', 'black'])] : PAINT[rng.pick(['white', 'white', 'cream', 'red'])] } : null;
  const inner = t.hollow || rng.chance(0.12)
    ? { color: t.hollow ? PAINT[rng.pick(['white', 'white', 'silver', 'red'])] : PAINT.white, gap: oW * 0.2, w: Math.max(0.006, h * 0.018), alpha: 0.9 }
    : null;
  const order = t.dir > 0 ? letters : letters.slice().reverse();
  let box = null;
  const style = {
    mode: 'throw',
    F, o: oW, fill, fillAlpha, outline,
    fillVar: isChrome ? mix(fill, PAINT.chromeDark, rng.range(0.2, 0.5)) : t.fill === 'white' ? [214, 214, 210] : lighten(fill, 0.08),
    halo: F * rng.range(0.15, 0.4),
    shadow, second, inner,
    cuts: true, holes: true,
    shine: t.shine && !t.hollow,
    metal: isChrome ? 228 : 0,
    gloss: 150,
    streak: { sw: Math.max(0.025, F * rng.range(0.22, 0.38)), angle: rng.range(-0.6, 0.6), variant: rng.int(0, 7) },
  };
  for (const le of order) box = unionBox(box, renderFatLetter(P, rng, le, style));
  // drips
  if (rng.chance(0.45)) letterDrips(P, rng, letters, F, oW, outline, rng.int(1, 4), h * 0.35);
  if (fillAlpha > 0 && rng.chance(0.25)) letterDrips(P, rng, letters, F * 0.5, oW, fill, rng.int(1, 3), h * 0.25);
  return box || bboxOf(letters.flatMap((l) => l.strokes), F);
}

export function defaultThrow(rng, name) {
  return {
    text: name.slice(0, Math.min(4, name.length)),
    fill: rng.pick(['silver', 'white', 'silver', 'black']),
    outline: 'black',
    fat: rng.range(0.34, 0.44),
    overlap: rng.range(0.15, 0.3),
    wf: rng.range(0.8, 1.0),
    rot: 0.06,
    shadow: false,
    second: false,
    shine: true,
    hollow: false,
    dir: 1,
  };
}
