// Half-Life / Counter-Strike HUD numbers (640hud7.spr "number_0".."number_9").
//
// The GoldSrc digits are a 7-segment LCD face in a 20×25 cell: every segment is
// a mitered hexagon with a bright one-pixel outline and a dim interior that gets
// a little brighter towards the middle of the glyph; neighbouring segments share
// their diagonal miter lines. The glyph's outline box is x 3..17, y 1..23 (pixel
// centres), segments are 4 px thick and the middle bar is centred on y = 12.
// We paint that pixel-exactly at the 640 size and let the HUD scale it with
// bilinear filtering for other sprite sets (as GL_LINEAR would).

import { PixelSprite, finishSprite, scaleSprite } from './pixel.js';

export const DIGIT_W = 20;
export const DIGIT_H = 25;

// segment outlines through pixel centres
const SEG = {
  A: [[3, 1], [17, 1], [13, 5], [7, 5]],
  B: [[17, 1], [17, 12], [16, 12], [13, 9], [13, 5]],
  C: [[17, 12], [17, 23], [13, 19], [13, 15], [16, 12]],
  D: [[3, 23], [7, 19], [13, 19], [17, 23]],
  E: [[3, 12], [4, 12], [7, 15], [7, 19], [3, 23]],
  F: [[3, 1], [7, 5], [7, 9], [4, 12], [3, 12]],
  G: [[4, 12], [6, 10], [14, 10], [16, 12], [14, 14], [6, 14]],
};
// the 0 has no middle bar: its side segments run to sharp points at the rim
const SEG0 = {
  ...SEG,
  B: [[17, 1], [17, 12], [13, 8], [13, 5]],
  C: [[17, 12], [17, 23], [13, 19], [13, 16]],
  E: [[3, 12], [7, 16], [7, 19], [3, 23]],
  F: [[3, 1], [7, 5], [7, 8], [3, 12]],
};
const DIGIT_SEGS = ['ABCDEF', 'BC', 'ABGED', 'ABGCD', 'FGBC', 'AFGCD', 'AFGEDC', 'ABC', 'ABCDEFG', 'ABCFG'];

function paintDigit(n) {
  const p = new PixelSprite(DIGIT_W, DIGIT_H);
  // interior: darker near the glyph's outside, brighter towards its middle
  const shade = (x, y) => {
    const d = Math.min(x - 3, 17 - x, y - 1, 23 - y);
    return d <= 1 ? 0.26 : d === 2 ? 0.36 : 0.46;
  };
  const segs = n === 0 ? SEG0 : SEG;
  for (const s of DIGIT_SEGS[n]) p.fill(segs[s], shade);
  for (const s of DIGIT_SEGS[n]) p.outline(segs[s], 1);
  finishSprite(p);
  return p.toCanvas();
}

let base = null;
const cache = new Map();

/** Ten digit sprites (white, alpha = intensity) for sprite scale k. */
export function digitSprites(k = 1) {
  if (!base) base = Array.from({ length: 10 }, (_, i) => paintDigit(i));
  let s = cache.get(k);
  if (!s) {
    s = base.map((c) => scaleSprite(c, k));
    cache.set(k, s);
  }
  return s;
}

/**
 * GoldSrc CHud::DrawHudNumber: draws n at (x, y) using `cells` digit slots
 * (leading slots left blank like DHN_3DIGITS), zero drawn when drawZero.
 * `put(digit, x, y)` draws one digit. Returns x after the number.
 */
export function layoutNumber(n, x, y, cellW, { cells = 3, drawZero = true } = {}, put) {
  n = Math.max(0, Math.floor(n));
  const s = String(n);
  if (n === 0 && !drawZero) return x + cells * cellW;
  const pad = Math.max(0, cells - s.length);
  x += pad * cellW;
  for (const ch of s) {
    put(ch.charCodeAt(0) - 48, x, y);
    x += cellW;
  }
  return x;
}
