// Props A — dynamic props: chalkboard (chalk text param), clock_wall / clock_hall (live hands),
// memorial_board (Polaroids + Tess's frame). Each has a cached base; per-frame work is a couple of
// drawImage calls plus (clocks) two short hand lines.
import { K, PAL, mix, lt, dk, OUT, woodSet, BRASS, seedOf, GLYPH_FIX, glyphW, textW } from './props_a_kit.js';
import { makeCanvas, ctxOf } from './util.js';

// ---- chalk hand ---------------------------------------------------------------------------------
// 3×5 caps with a hand-drawn lean: per-glyph baseline wobble, the top rows nudged right, chalk
// texture (dim pixels, dropouts). Advance 4 px, words 3 px apart.
const CH = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '101111111111101', O: '010101101101010',
  P: '110101110100100', Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', G: '111100101101111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', '-': '000000111000000', '.': '000000000000010', ':': '000010000010000', "'": '010010000000000',
  '!': '010010010000010', '?': '110001010000010', '/': '001001010100100', '&': '010101010101011', ',': '000000000010100',
  '#': '101111101111101', '+': '000010111010000', '(': '010100100100010', ')': '010001001001010', '"': '101101000000000',
  ' ': '000000000000000',
};
const chalkNorm = (s) => String(s).toUpperCase().replace(/[—–]/g, '-').replace(/[‘’`]/g, "'").replace(/[“”]/g, '"');
const chW = (ch) => (ch === ' ' ? 2 : glyphW(ch));
const lineW = (ln) => { let w = 0; for (const ch of ln) w += chW(ch) + 1; return Math.max(0, w - 1); };
/** Wrap text into lines of at most `max` px (variable glyph widths). Honours '\n'. */
export function chalkWrap(text, max) {
  const out = [];
  for (const para of chalkNorm(text).split('\n')) {
    let line = '';
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (lineW(word) > max) { // hard-break words too long for a line
        let cut = word.length;
        while (cut > 1 && lineW(word.slice(0, cut)) > max) cut--;
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, cut)); word = word.slice(cut);
      }
      if (!line) line = word;
      else if (lineW(line + ' ' + word) <= max) line += ' ' + word;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}
/** Draw chalk text lines into ctx at canvas coords. Glyphs stay whole (legibility); the chalk
 *  texture is a scatter of dimmer pixels plus a per-letter baseline wobble. */
export function chalkLines(ctx, x, y, lines, { pitch = 6, seed = 1, color = '#dcd9cb', dim = '#9aa49c', ghost = false, clipH = 999 } = {}) {
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return s / 4294967296; };
  lines.forEach((ln, li) => {
    const ly = y + li * pitch;
    if (ly - y + 5 > clipH) return;
    let cx = x + (li % 2 && !ghost ? 1 : 0);
    for (const ch of ln) {
      const fix = GLYPH_FIX[ch];
      const rows = fix || (CH[ch] || CH[' ']).match(/.{3}/g);
      const wob = rnd() < 0.2 ? 1 : 0;
      for (let j = 0; j < 5; j++) for (let i = 0; i < rows[j].length; i++) {
        if (rows[j][i] !== '1') continue;
        if (ly + j + wob - y >= clipH) continue; // per-pixel: never onto the frame below the slate
        const r = rnd();
        if (ghost && r < 0.25) continue;
        ctx.fillStyle = r < 0.16 ? dim : color;
        ctx.fillRect(cx + i, ly + j + wob, 1, 1);
      }
      cx += chW(ch) + 1;
    }
  });
}

// ---- chalkboard (3×1 wall) ----------------------------------------------------------------------
const GHOSTS = [['SPELLING', 'P. 47'], ['NOUNS', 'VERBS'], ['2 + 2 = 4'], ['HOMEWORK', 'DUE FRI'], ['QUIET!'], ['PA HISTORY']];
const BOARD = { x: 2, y: -13, w: 44, h: 21 };
function chalkboardBase(o) {
  const { clean, variant } = o;
  const k = new K(50, 34, -1, -16, seedOf('chalkboard', clean, variant));
  const W = woodSet(clean, 'oak');
  const slate = clean ? mix(PAL.slate, PAL.green_dd, 0.45) : PAL.slate;
  const { x, y, w, h } = BOARD;
  // frame
  k.R(x - 2, y - 2, w + 4, h + 4, W.md); k.H(x - 2, y - 2, w + 4, W.hi); k.V(x - 2, y - 2, h + 4, W.lt); k.V(x + w + 1, y - 2, h + 4, W.dk);
  k.H(x - 1, y - 1, w + 2, W.dd); k.V(x - 1, y - 1, h + 1, W.dd);
  // slate with a soft value ramp (lighter where the light hits top-left) and chalk haze at the bottom
  k.bands(x, y, w, h, [mix(slate, PAL.slate_l, 0.45), slate, mix(slate, PAL.ink, 0.18)]);
  const haze = mix(slate, PAL.g6, clean ? 0.1 : 0.18);
  k.S(x, y + h - 5, w, 5, haze, clean ? 0.08 : 0.22); k.S(x, y + h - 2, w, 2, haze, clean ? 0.1 : 0.3);
  // ghosts of erased writing + eraser swipes
  const g = GHOSTS[(variant + (clean ? 3 : 0)) % GHOSTS.length];
  const ghostCol = mix(slate, PAL.g6, clean ? 0.12 : 0.22);
  chalkLines(k.x, x + 3 - k.ox, y + 2 - k.oy, g, { pitch: 7, seed: seedOf('ghost', variant), color: ghostCol, dim: mix(slate, PAL.g6, 0.12), ghost: true });
  for (let i = 0; i < (clean ? 2 : 5); i++) {
    const sx = x + k.ri(0, w - 14), sy = y + k.ri(0, h - 5);
    for (let a = 0; a < 14; a++) { const yy = sy + Math.round(Math.sin(a / 2.2) * 1.5); if ((a + i) % 2 === 0) k.P(sx + a, yy, haze); k.P(sx + a, yy + 2, mix(slate, haze, 0.5)); }
  }
  if (!clean) { k.S(x, y, w, h, mix(slate, PAL.g5, 0.25), 0.02); k.A(x + w - 9, y, 9, 7, 'rgba(100,90,60,0.12)'); }
  // tray with chalk and a felt eraser
  k.R(x - 2, y + h + 2, w + 4, 2, W.lt); k.H(x - 2, y + h + 2, w + 4, W.hi); k.H(x - 2, y + h + 3, w + 4, W.dk);
  k.H(x + 5, y + h + 1, 3, PAL.white); k.H(x + 10, y + h + 1, 2, clean ? PAL.white : PAL.g6); k.P(x + 30, y + h + 1, PAL.yellow_l);
  k.R(x + 18, y + h, 6, 2, clean ? PAL.brown : PAL.brown_d); k.H(x + 18, y + h, 6, PAL.g5);
  k.H(x - 2, y + h + 4, w + 4, 'rgba(6,5,10,0.35)');
  return k;
}
function chalkboardRender(o, text) {
  const k = chalkboardBase(o);
  if (text) {
    const { x, y, w, h } = BOARD;
    const lines = chalkWrap(text, w - 4);
    const pitch = lines.length <= 3 ? 6 : 5;
    // Four lines at pitch 5 need 20 rows: start one row higher so the last line isn't clipped.
    const top = y + (lines.length >= 4 ? 1 : 2) + (lines.length <= 2 ? 2 : 0);
    chalkLines(k.x, x + 2 - k.ox, top - k.oy, lines, { pitch, seed: seedOf('chalk', text), color: o.clean ? '#e8e5d6' : '#d6d4c6', dim: o.clean ? '#b9bdb0' : '#98a097', clipH: y + h - top });
  }
  return k.done({ outline: false });
}
const dynCache = new Map();
function cached(key, make) {
  let v = dynCache.get(key);
  if (!v) { if (dynCache.size > 96) dynCache.clear(); v = make(); dynCache.set(key, v); }
  return v;
}
// The 1979 (clean) board never shows the present-day writing; a map may give `text1979` instead.
const boardText = (o, params) => String((o.clean ? params.text1979 : params.text) || '');
function chalkboardBuild(o) {
  return chalkboardRender(o, boardText(o, o.params));
}
function chalkboardDraw(ctx, px, py, o, params) {
  const text = boardText(o, params);
  const r = cached(`cb|${o.clean ? 1 : 0}|${o.variant}|${text}`, () => chalkboardRender(o, text));
  ctx.drawImage(r.canvas, px + r.ox, py + r.oy);
}

// ---- clocks -------------------------------------------------------------------------------------
const CLK = { cx: 8, cy: -10, r: 5 };
function clockBase(o, hall) {
  const { clean } = o;
  const k = new K(20, 22, -2, -18, seedOf('clock', hall, clean));
  const { cx, cy, r } = CLK;
  if (hall) {
    // bracket from the wall above + the drum's side (double-faced hall clock)
    k.R(cx - 1, -18, 3, 2, PAL.g3); k.V(cx, -17, 2, PAL.g4);
    k.E(cx + 1, cy, r + 1, r + 1, PAL.g1);
    k.R(cx + r - 1, cy - r + 1, 3, r * 2 - 1, PAL.g2);
  }
  // rim, face, hour ticks
  k.E(cx, cy, r + 1, r + 1, clean ? PAL.g2 : PAL.g1);
  k.E(cx, cy, r, r, clean ? PAL.white : mix(PAL.paper, PAL.cream_d, 0.5));
  k.D(cx - r, cy, r * 2 + 1, r + 1, clean ? PAL.g6 : PAL.paper_d, 0.25);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = Math.round(cx + Math.sin(a) * (r - 0.6)), y = Math.round(cy - Math.cos(a) * (r - 0.6));
    if (i % 3 === 0) k.P(x, y, PAL.ink); else k.P(x, y, mix(PAL.g4, PAL.paper, 0.4));
  }
  if (!clean) { k.L(cx - 3, cy - 4, cx + 1, cy + 3, 'rgba(230,236,240,0.35)'); k.S(cx - r, cy - r, r * 2, r * 2, 'rgba(80,60,30,0.25)', 0.08); }
  k.shadow(cx - r + 1, cy + r + 1, r * 2 + 1, 1, 'rgba(6,5,10,0.3)');
  return k.done({ outline: false });
}
function clockOverlay(o) {
  // wire guard: a dark ring standing off the face, two thin bars and a cross-wire (translucent so the
  // hands stay readable), a glint on the glass
  const k = new K(20, 22, -2, -18, 7);
  const { cx, cy, r } = CLK;
  const ring = o.clean ? PAL.g4 : PAL.g3, bar = o.clean ? 'rgba(196,189,176,0.55)' : 'rgba(156,152,151,0.5)';
  for (let a = 0; a < Math.PI * 2; a += 0.04) { const x = Math.round(cx + Math.cos(a) * (r + 1.6)), y = Math.round(cy + Math.sin(a) * (r + 1.6)); k.P(x, y, a > 3.3 && a < 4.9 ? lt(ring, 0.25) : ring); }
  for (const dx of [-2, 2]) for (let j = -r; j <= r; j++) if (dx * dx + j * j <= r * r) k.P(cx + dx, cy + j, bar);
  for (let i = -r; i <= r; i++) if (i !== 0) k.P(cx + i, cy, bar);
  k.P(cx - 3, cy - 3, PAL.white); k.P(cx - 2, cy - 4, PAL.moon_l);
  k.P(cx, cy, PAL.ink);
  return k.done({ outline: false });
}
function clockTime(params, t) {
  if (typeof params.time === 'number' && isFinite(params.time)) return params.time;
  return 1 + 40 / 60 + (t || 0) / 3600; // 1:40 and creeping, in real time
}
function hand(ctx, x0, y0, ang, len, col) {
  const x1 = Math.round(x0 + Math.sin(ang) * len), y1 = Math.round(y0 - Math.cos(ang) * len);
  let x = x0, y = y0;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = col;
  for (;;) { ctx.fillRect(x, y, 1, 1); if (x === x1 && y === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x += sx; } if (e2 <= dx) { err += dx; y += sy; } }
}
function clockDraw(hall) {
  return (ctx, px, py, o, params, t) => {
    const base = cached(`clk|${hall ? 1 : 0}|${o.clean ? 1 : 0}`, () => clockBase(o, hall));
    const over = cached(`clko|${o.clean ? 1 : 0}`, () => clockOverlay(o));
    ctx.drawImage(base.canvas, px + base.ox, py + base.oy);
    const time = clockTime(params, t);
    const mins = Math.floor(((time % 1) + 1) % 1 * 60);
    const hrs = ((time % 12) + 12) % 12;
    const cx = px + CLK.cx, cy = py + CLK.cy;
    hand(ctx, cx, cy, (hrs / 12) * Math.PI * 2, 3, PAL.ink);
    hand(ctx, cx, cy, (mins / 60) * Math.PI * 2, 4, PAL.g1);
    ctx.drawImage(over.canvas, px + over.ox, py + over.oy);
  };
}
function clockStatic(hall) {
  return (o) => {
    // static fallback (e.g. when a caller asks getProp): base + hands at 1:45 + cage, flattened
    const base = clockBase(o, hall), over = clockOverlay(o);
    const c = makeCanvas(base.canvas.width, base.canvas.height), x = ctxOf(c);
    x.drawImage(base.canvas, 0, 0);
    const time = clockTime(o.params, 0);
    hand(x, CLK.cx - base.ox, CLK.cy - base.oy, (((time % 12) / 12) * Math.PI * 2), 3, PAL.ink);
    hand(x, CLK.cx - base.ox, CLK.cy - base.oy, ((Math.floor((time % 1) * 60) / 60) * Math.PI * 2), 4, PAL.g1);
    x.drawImage(over.canvas, 0, 0);
    return { canvas: c, ox: base.ox, oy: base.oy };
  };
}

// ---- memorial_board (3×1 wall) -----------------------------------------------------------------
// "THE HOMECOMING NINE": nine faded school photos under a gold title. Ch7 adds Polaroids of the
// friends (labelled 1996, pencil or ink) and an empty frame for THERESA DOLAN.
const NINE = [
  // [skin, hair, clothes, accent]  Denise, Kevin, Carol Ann, Tommy, Patty, Raymond, Lisa, Anthony, Michelle
  [PAL.dskin, PAL.hair_k, PAL.green_d, PAL.gold], [PAL.skin, PAL.hair_b, PAL.blue, PAL.orange], [PAL.skin_l, PAL.yellow, PAL.velvet, null],
  [PAL.skin, PAL.hair_k, PAL.green, PAL.paper], [PAL.skin, PAL.hair_b_l, PAL.denim_d, PAL.g2], [PAL.skin_l, PAL.hair_r_d, PAL.mustard, null],
  [PAL.skin, PAL.hair_b, PAL.green_l, PAL.yellow], [PAL.skin_d, PAL.hair_k_l, PAL.brown, PAL.g1], [PAL.skin_l, PAL.hair_b, PAL.blue_l, PAL.orange],
];
function schoolPhoto(k, x, y, p, clean, i) {
  const f = (c) => (clean ? mix(c, PAL.paper, 0.1) : mix(mix(c, PAL.tan, 0.4), PAL.paper_d, 0.25));
  k.R(x, y, 6, 7, f(PAL.paper)); // border
  k.R(x + 1, y + 1, 4, 5, f(i % 2 ? PAL.blue_l : PAL.denim)); // studio backdrop
  const [skin, hair, cloth, acc] = p;
  k.R(x + 1, y + 4, 4, 2, f(cloth));
  if (acc) k.P(x + (i === 1 || i === 8 ? 2 : 3), y + 4, f(acc));
  k.R(x + 2, y + 2, 2, 2, f(skin));
  k.H(x + 2, y + 1, 2, f(hair)); if (i === 2 || i === 6 || i === 4) { k.P(x + 1, y + 2, f(hair)); k.P(x + 4, y + 2, f(hair)); }
  if (i === 7) k.H(x + 2, y + 2, 2, f(PAL.g3));
  k.H(x + 1, y + 7, 4, clean ? BRASS.lt : BRASS.dk); // name plate
}
const MICRO = { 1: ['1', '1', '1'], 9: ['11', '11', '01'], 6: ['10', '11', '11'] };
function micro(k, x, y, s, col) {
  let cx = x;
  for (const ch of s) { const g = MICRO[ch]; if (!g) { cx += 2; continue; } for (let j = 0; j < 3; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '1') k.P(cx + i, y + j, col); cx += g[0].length + 1; }
}
const FRIEND = {
  danny: { bg: PAL.g3, skin: PAL.skin, hair: PAL.red_d, cloth: PAL.green, acc: PAL.g6 },
  leah: { bg: PAL.brown_d, skin: PAL.skin_l, hair: PAL.hair_k, cloth: PAL.g4, acc: PAL.g6 },
  marcus: { bg: PAL.slate_l, skin: PAL.dskin, hair: PAL.hair_k, cloth: mix(PAL.green_d, PAL.tan, 0.3), acc: PAL.g2 },
};
function polaroid(k, x, y, who, ink) {
  // 11×14 instant print, pinned; photo above a thick margin with '96 written on it
  const F = FRIEND[who];
  k.R(x, y, 11, 14, PAL.white); k.V(x + 10, y + 1, 13, PAL.g6); k.H(x + 1, y + 13, 10, PAL.g6);
  k.R(x + 1, y + 2, 9, 7, F.bg);
  k.R(x + 4, y + 4, 3, 3, F.skin); k.R(x + 3, y + 7, 5, 2, F.cloth);
  k.H(x + 4, y + 3, 3, F.hair);
  if (who === 'danny') { k.H(x + 3, y + 3, 5, F.hair); k.P(x + 3, y + 4, F.hair); } // backwards cap
  if (who === 'leah') { k.P(x + 3, y + 4, F.hair); k.P(x + 7, y + 4, F.hair); k.P(x + 3, y + 5, F.hair); k.P(x + 7, y + 5, F.hair); k.H(x + 4, y + 5, 3, PAL.g5); }
  if (who === 'marcus') { k.H(x + 4, y + 2, 3, PAL.ink); k.H(x + 3, y + 3, 5, PAL.ink); k.P(x + 3, y + 7, PAL.g2); k.P(x + 7, y + 7, PAL.g2); }
  k.D(x + 1, y + 2, 9, 7, PAL.ink, 0.12);
  const col = ink === 'pencil' ? PAL.g4 : mix(PAL.blue_dd, PAL.ink, 0.2);
  k.P(x + 2, y + 9, col); k.T(x + 4, y + 9, '96', col);
  k.P(x + 5, y, PAL.red_l); k.P(x + 5, y + 1, PAL.g2); // pushpin
}
function memorialBase(o) {
  const { clean } = o;
  const k = new K(50, 32, -1, -16, seedOf('memorial', clean));
  const W = woodSet(clean, 'walnut');
  const felt = clean ? mix(PAL.blue_dd, PAL.navy_d, 0.6) : mix(PAL.blue_dd, PAL.shadow, 0.5);
  k.R(0, -15, 48, 29, W.md); k.H(0, -15, 48, W.hi); k.V(0, -15, 29, W.lt); k.V(47, -15, 29, W.dd); k.H(0, 13, 48, W.dd);
  k.R(2, -13, 44, 25, felt); k.H(2, -13, 44, mix(felt, PAL.ink, 0.5)); k.V(2, -13, 25, mix(felt, PAL.ink, 0.5));
  for (const [cx, cy] of [[0, -15], [46, -15], [0, 12], [46, 12]]) { k.R(cx, cy, 2, 2, clean ? BRASS.lt : BRASS.dk); k.P(cx, cy, BRASS.hi); }
  const gold = clean ? PAL.gold : mix(PAL.gold, PAL.g4, 0.35);
  k.T((48 - textW('HOMECOMING')) >> 1, -12, 'HOMECOMING', gold);
  k.H(5, -6, 39, clean ? BRASS.md : BRASS.dk);
  for (let i = 0; i < 5; i++) schoolPhoto(k, 3 + i * 9, -4, NINE[i], clean, i);
  for (let i = 0; i < 4; i++) schoolPhoto(k, 7 + i * 9, 4, NINE[5 + i], clean, 5 + i);
  // dried carnation tucked in the frame; dust
  if (!clean) {
    k.P(1, -9, PAL.velvet); k.P(2, -10, PAL.red_d); k.P(1, -10, PAL.red_d); k.L(2, -8, 3, -4, PAL.green_d);
    k.S(2, -13, 44, 20, 'rgba(150,140,120,0.2)', 0.05);
  }
  k.shadow(1, 14, 48, 1, 'rgba(6,5,10,0.35)');
  return k;
}
function memorialRender(o, params) {
  const k = memorialBase(o);
  // the 1996 additions don't exist in the 1979 (clean) view
  const pol = o.clean ? null : params.polaroids || null;
  const tf = o.clean ? null : params.tessFrame;
  const hasTess = tf !== undefined && tf !== null && tf !== false;
  // The school pins its new pupils OVER the old: Polaroids on the right, Tess's frame low left.
  if (pol) {
    const slots = hasTess ? [[20, -8], [27, -7], [34, -8]] : [[23, -2], [29, -1], [35, -2]];
    ['danny', 'leah', 'marcus'].forEach((who, i) => { if (pol[who]) polaroid(k, slots[i][0], slots[i][1], who, pol[who] === 'pencil' ? 'pencil' : 'ink'); });
  }
  if (hasTess) {
    const n = tf === true ? 0 : tf === 'sketch' ? 1 : tf === 'photo' ? 2 : Number(tf) || 0;
    const fx = 3, fy = 1;
    k.R(fx, fy, 10, 11, PAL.g1); k.frame(fx, fy, 10, 11, PAL.ink); k.H(fx + 1, fy + 1, 8, PAL.g2); k.V(fx + 1, fy + 1, 9, PAL.g2);
    k.R(fx + 2, fy + 2, 6, 7, n === 0 ? PAL.shadow : PAL.paper);
    if (n === 1) { // a faint pencil sketch: a girl at a desk
      const p = mix(PAL.paper, PAL.g4, 0.55);
      k.H(fx + 3, fy + 3, 3, p); k.P(fx + 3, fy + 4, p); k.P(fx + 5, fy + 4, p); k.V(fx + 4, fy + 5, 2, p); k.H(fx + 2, fy + 7, 6, p);
    } else if (n === 2) { // developed: copper hair, denim, head down on a desk
      k.R(fx + 2, fy + 2, 6, 7, PAL.g2);
      k.R(fx + 3, fy + 3, 4, 3, PAL.hair_r); k.R(fx + 2, fy + 5, 6, 2, PAL.denim); k.H(fx + 2, fy + 7, 6, PAL.tan);
    }
    k.H(fx + 2, fy + 9, 6, PAL.g3);
    k.P(fx + 5, fy - 1, PAL.g4);
    // typed label card
    const card = mix(PAL.paper, PAL.paper_d, 0.5);
    k.R(fx + 12, fy + 4, 30, 11, card); k.H(fx + 12, fy + 14, 30, PAL.paper_d); k.V(fx + 41, fy + 4, 11, PAL.paper_d);
    k.T(fx + 14, fy + 4, 'THERESA', PAL.g1); k.T(fx + 14, fy + 9, 'DOLAN', PAL.g1);
  }
  return k.done({ outline: false });
}
function memorialDraw(ctx, px, py, o, params) {
  const p = params.polaroids || {};
  const key = o.clean ? 'mem|1' : `mem|0|${p.danny || 0}${p.leah || 0}${p.marcus || 0}|${params.tessFrame ?? 'x'}`;
  const r = cached(key, () => memorialRender(o, params));
  ctx.drawImage(r.canvas, px + r.ox, py + r.oy);
}

export const DYNAMIC = {
  chalkboard: { build: chalkboardBuild, draw: chalkboardDraw, variants: 6 },
  clock_wall: { build: clockStatic(false), draw: clockDraw(false) },
  clock_hall: { build: clockStatic(true), draw: clockDraw(true) },
  memorial_board: { build: (o) => memorialRender(o, o.params), draw: memorialDraw },
};
