// The camcorder-tape look, shared by the 'vhs' overlay and the 'vhs' scrubber screen:
// banded head-switch jitter, chroma bleed, a rolling tracking-noise band, bottom-edge noise and scanlines
// (vhsFilter, 480×270), plus the camcorder OSD (vhsOSD, UI px) and the blue ▶ PLAY screen (vhsBlue).
import { F, W, H } from './theme.js';
import { ctx2d, rect, dither, noiseFrame, triangle, AP } from './gfx.js';
import { hash2 } from '../art/util.js';

const LW = 480, LH = 270;
const BLEED = [['#ff2020', 2], ['#2040ff', -1]];   // chroma bleed: red right, blue left

/**
 * Filter `src` (480×270, already drawn) into `out` (480×270) using `tmp` as scratch.
 * o: { strength = 1 (jitter/noise), pause = false (paused tape: a steady tear band, less roll) }
 */
export function vhsFilter(src, out, tmp, t, o = {}) {
  const sx = ctx2d(out);
  const k = o.strength ?? 1;
  sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalAlpha = 1; sx.globalCompositeOperation = 'source-over';
  const tick = Math.floor(t * 30);
  sx.clearRect(0, 0, LW, LH);
  // horizontal jitter in bands (head-switching wobble, stronger near the bottom)
  const band = 6;
  for (let y = 0; y < LH; y += band) {
    let dx = k >= 0.5 ? (hash2(tick, y) % 3) - 1 : 0;
    if (y > LH - 24) dx += (hash2(tick, y + 1) % 7) - 3;
    sx.drawImage(src, 0, y, LW, band, dx, y, LW, band);
  }
  // chroma bleed: a red-only copy shifted right, a blue-only copy shifted left
  const tx = ctx2d(tmp);
  for (const [col, off] of BLEED) {
    tx.globalCompositeOperation = 'source-over'; tx.clearRect(0, 0, LW, LH); tx.drawImage(out, 0, 0);
    tx.globalCompositeOperation = 'multiply'; tx.fillStyle = col; tx.fillRect(0, 0, LW, LH);
    tx.globalCompositeOperation = 'destination-in'; tx.drawImage(out, 0, 0);
    sx.globalCompositeOperation = 'lighter'; sx.globalAlpha = 0.32; sx.drawImage(tmp, off, 0);
  }
  tx.globalCompositeOperation = 'source-over';
  sx.globalCompositeOperation = 'source-over'; sx.globalAlpha = 1;
  const nf = noiseFrame(tick);
  if (o.pause) {
    // a paused deck: one fat tear band that shivers in place
    const ny = 182 + (hash2(tick >> 2, 9) % 5);
    sx.globalAlpha = 0.65; sx.drawImage(nf, 0, ny, LW, 7, (hash2(tick, 4) % 7) - 3, ny, LW, 7);
  } else {
    // rolling tracking-noise band
    const ny = Math.floor((t * 37) % (LH + 60)) - 30;
    sx.globalAlpha = 0.5 * k; sx.drawImage(nf, 0, ny, LW, 10, (hash2(tick, 3) % 9) - 4, ny, LW, 10);
  }
  sx.globalAlpha = 0.75; sx.drawImage(nf, 0, LH - 8, LW, 8, 0, LH - 8, LW, 8);
  sx.globalAlpha = 0.07; sx.drawImage(nf, 0, 0);
  sx.globalAlpha = 1;
  // scanline darkening
  sx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 1; y < LH; y += 2) sx.fillRect(0, y, LW, 1);
}

/** The blue ▶ PLAY screen (no tape signal), drawn into a 480×270 context. */
export function vhsBlue(sx) {
  rect(sx, 0, 0, LW, LH, '#1a2fb0');
  dither(sx, 0, 0, LW, LH, '#2438c8', 0.25, 1);
}

/** Split 'OCT 18 1996 10:41PM' → ['OCT 18 1996', '10:41PM']. */
export function splitStamp(ts) {
  const m = String(ts).match(/^(.*\d{4})\s+(.*)$/);
  return m ? [m[1], m[2]] : [String(ts), ''];
}

/** Draw camcorder OSD text: chunky white with a dark drop shadow (UI px). */
export function osd(ctx, s, x, y, align = 'left') {
  const f = F.monoL;
  f.draw(ctx, s, x + AP, y + AP, '#101010', { align });
  f.draw(ctx, s, x, y, '#f4f4ec', { align });
}

/**
 * The camcorder's on-screen display over a playing (or paused) tape, in UI px.
 * o: { timestamp, mode: 'play'|'pause'|'rew'|'ff'|'blue', counter }
 */
export function vhsOSD(ctx, t, o = {}) {
  const mode = o.mode || 'play';
  const blink = Math.floor(t * 1.6) % 2 === 0;
  if (mode === 'blue') {
    osd(ctx, 'PLAY', W / 2 + 18, H / 2 - 22, 'center');
    triangle(ctx, W / 2 - 62, H / 2 - 14, 9, '#f4f4ec', 'right');
    return;
  }
  const glyph = (x, y) => {
    const tri = (xx, yy, dir) => { triangle(ctx, xx + AP, yy + AP, 8, '#101010', dir); triangle(ctx, xx, yy, 8, '#f4f4ec', dir); };
    if (mode === 'play') { if (blink) tri(x, y, 'right'); } else if (mode === 'pause') {
      if (blink) { for (const dx of [0, 14]) { rect(ctx, x + dx + AP, y + AP, 8, 30, '#101010'); rect(ctx, x + dx, y, 8, 30, '#f4f4ec'); } }
    } else if (mode === 'rew') { tri(x + 12, y, 'left'); tri(x - 4, y, 'left'); } else if (mode === 'ff') { tri(x - 4, y, 'right'); tri(x + 12, y, 'right'); }
  };
  const label = { play: 'PLAY', pause: 'STILL', rew: 'REW', ff: 'F.FWD' }[mode] || 'PLAY';
  osd(ctx, label, 56, 34);
  glyph(56 + F.monoL.width(label) + 22, 42);
  const [date, time] = splitStamp(o.timestamp || 'OCT 18 1996 10:41PM');
  osd(ctx, time, W - 56, H - 108, 'right');
  osd(ctx, date, W - 56, H - 72, 'right');
  osd(ctx, 'SP', 56, H - 72);
  if (o.counter) osd(ctx, o.counter, W - 56, 34, 'right');
}
