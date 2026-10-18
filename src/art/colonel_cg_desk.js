// colonel_hand's background: the worn 1970s laminate under Tess (colonel_cg_tess.js paints her on it).
// The desk is quiet on purpose: flat bands from the tube's falloff (a 1-px dithered seam only where one band
// meets the next), long soft grain, a few fine scratches, tiny faint carved initials, an old can ring — it
// falls to dark toward the left edge and the cuff, so the hand and the girl carry the frame.
import { Cel, celMat, vn } from './colonel_cg_cel.js';
import { CM } from './colonel_cg_handkit.js';
import { buildTessGen, tessLUTPatch, FACE, SKULL } from './colonel_cg_tess.js';
import { rng } from './util.js';

const W = 480, H = 270;
// few, wide steps across the tube's pool (no target rings): each transition a 2-level ordered dither ~0.06
// wide, the level streaked along the grain before banding so no edge is a clean ellipse
const DT = [0.1, 0.2, 0.34, 0.54, 0.8, 1.1];
celMat(CM.DESK, { ramp: ['#0a0807', '#171210', '#271f18', '#3b3024', '#524331', '#6a5940', '#84704f'], th: DT, seam: false, dith: 0.032, smooth: 2, grain: 0.07 });
celMat(CM.DESK_G, { ramp: ['#090706', '#14100c', '#221a13', '#33291e', '#47392a', '#5d4c37', '#756146'], th: DT, seam: false, dith: 0.032, smooth: 2, sgroup: CM.DESK, grain: 0.07 });
celMat(CM.FLOOR, { ramp: ['#020203', '#050608', '#0a0b0f', '#111318', '#1a1c22'], th: [0.1, 0.25, 0.45, 0.7], seam: false });
celMat(CM.DESK_EDGE, { ramp: ['#060606', '#121214', '#222226', '#3a3a40', '#5a5a62', '#86868e'], th: [0.12, 0.28, 0.48, 0.7, 0.92], seam: false });

/** Per-grade LUT fixes (Tess's hair and denim under the fire). */
export function bgLUTPatch(lut, name) { return tessLUTPatch(lut, name); }

// ------------------------------------------------------------------------------------------ the desk
const DESK_EDGE_PTS = [[18, 0], [W + 4, 12]];   // far edge (just in frame at the right)
const DESK_LEFT = [[18, 0], [6, H + 4]];        // left edge
function deskIn(x, y) {
  const [a, b] = DESK_EDGE_PTS, [c, d] = DESK_LEFT;
  const top = a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
  const left = c[0] + (d[0] - c[0]) * (y - c[1]) / (d[1] - c[1]);
  return y >= top && x >= left;
}
function buildDesk(cel, r) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (deskIn(x + 0.5, y + 0.5)) {
      // laminate printed with a wood grain: long, soft, low-contrast streaks
      const g = vn(x * 0.12 + vn(x, y, 50, 3) * 22, y * 1.4, 1, 5);
      cel.put(x, y, g > 0.7 ? CM.DESK_G : CM.DESK, { z: 0, n: [0, 0, 1], sid: 1 });
    } else cel.put(x, y, CM.FLOOR, { z: -40, n: [0, 0, 1], sid: 2, flag: 1 });
  }
  const band = (a, b, nrmv) => {
    cel.stroke([a, b], (x, y) => { for (let k = 0; k < 3; k++) { const xx = x - Math.round(nrmv[0] * k), yy = y - Math.round(nrmv[1] * k); if (cel.matAt(xx, yy) !== CM.FLOOR) cel.put(xx, yy, CM.DESK_EDGE, { z: 0.5, n: [nrmv[0] * 0.6, nrmv[1] * 0.6, 0.8], sid: 3, fix: k === 0 ? 3 : k === 1 ? 2 : -1 }); } });
  };
  band(DESK_EDGE_PTS[0], DESK_EDGE_PTS[1], [0, -1]);
  band(DESK_LEFT[0], DESK_LEFT[1], [-1, 0]);
  // scratches: fine, pale, along the grain, kept off the middle of the frame
  for (let k = 0; k < 26; k++) {
    const x = 20 + r() * 460, y = 18 + r() * 250;
    if (x > 150 && x < 420 && y > 60 && y < 200) continue;
    const a = (r() - 0.5) * 0.35, L = 5 + r() * 16;
    cel.stroke([[x, y], [x + Math.cos(a) * L, y + Math.sin(a) * L]], (px, py, tt) => { if (tt > 0.1 && tt < 0.9) cel.shift(px, py, 1, [CM.DESK, CM.DESK_G]); });
  }
  // carved initials: tiny, faint (one step), filled with years of graphite
  carve(cel, 418, 30, 'KR 91');
  carve(cel, 36, 236, 'J+M');
  // a ring stain from a can, long ago — well away from her
  for (let a = 0.5; a < 5.4; a += 0.02) { const x = Math.round(452 + Math.cos(a) * 10), y = Math.round(52 + Math.sin(a) * 7); if (vn(a * 20, 0, 3, 8) > 0.5) cel.shift(x, y, -1, [CM.DESK, CM.DESK_G]); }
}
const GLYPH = {
  K: ['101', '110', '101', '101'], R: ['110', '101', '110', '101'], 9: ['111', '111', '001', '011'], 1: ['01', '11', '01', '01'],
  J: ['011', '001', '101', '010'], M: ['10001', '11011', '10101', '10001'], '+': ['000', '010', '111', '010'], ' ': ['0', '0', '0', '0'],
};
function carve(cel, x0, y0, text) {
  let cx = x0;
  for (const ch of text) {
    const g = GLYPH[ch] || GLYPH[' '];
    for (let j = 0; j < 4; j++) for (let i = 0; i < g[j].length; i++) {
      if (g[j][i] !== '1' || (i + j + cx) % 5 === 0) continue;                       // worn: broken strokes
      cel.shift(cx + i, y0 + j, -1, [CM.DESK, CM.DESK_G]);
    }
    cx += g[0].length + 1;
  }
}

/** The background in slices (a generator: each step a few tens of ms); returns the cel. */
export function* buildBackgroundGen() {
  const r = rng(1018);
  const cel = new Cel(W, H);
  buildDesk(cel, r); yield;
  yield* buildTessGen(cel, r); yield;
  cel.cavity(5, 0.05, 0.5);
  return cel;
}
export function buildBackground() {
  const g = buildBackgroundGen();
  for (;;) { const s = g.next(); if (s.done) return s.value; }
}
export { FACE, SKULL };
