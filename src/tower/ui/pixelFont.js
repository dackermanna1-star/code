// LAST LOOKOUT — the built-in pixel font.
//
// A 5×7 bitmap face (caps 7 px, x-height 5, descenders 2) drawn here as ASCII art and compiled at
// runtime into a real TrueType font (glyph outlines traced from the pixel edges), so DOM text, the
// shop and the menus all share one crisp retro face with no font file. The em is 8 font pixels:
// at font-size 16px one font pixel is 2 CSS px, at 24px 3 px, and so on (always use multiples of
// 8px, or of 4px when the display has DPR 2). Canvas code can draw the same glyphs directly with
// drawPixelText(). Nothing here touches the DOM at import time.

export const FONT_FAMILY = 'LL Pixel';
/** CSS font stack: the pixel face, then a monospace fallback while it loads (or if it fails). */
export const FONT_STACK = `'${FONT_FAMILY}', ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;

export const GLYPH_W = 5;
export const GLYPH_ADVANCE = 6; // font pixels per character (monospaced)
export const GLYPH_ROWS = 9; // rows 0..6 sit on the baseline (caps), 7..8 are the descender
const BASE_ROW = 6;
const UNIT = 128; // font units per font pixel
const UPEM = 8 * UNIT; // the em is 8 font pixels

// '#' = ink. Rows top to bottom; 7 rows unless the glyph has a descender (9 rows).
const G = {
  ' ': '',
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.####',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '.###./..#../..#../..#../..#../..#../.###.',
  J: '..###/...#./...#./...#./#..#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/#...#/##..#/#.#.#/#..##/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/#.#.#/.#.#.',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  a: '...../...../.###./....#/.####/#...#/.####',
  b: '#..../#..../#.##./##..#/#...#/#...#/####.',
  c: '...../...../.###./#..../#..../#...#/.###.',
  d: '....#/....#/.##.#/#..##/#...#/#...#/.####',
  e: '...../...../.###./#...#/#####/#..../.###.',
  f: '..##./.#..#/.#.../###../.#.../.#.../.#...',
  g: '...../...../.####/#...#/#...#/#...#/.####/....#/.###.',
  h: '#..../#..../#.##./##..#/#...#/#...#/#...#',
  i: '..#../...../.##../..#../..#../..#../.###.',
  j: '...#./...../..##./...#./...#./...#./...#./#..#./.##..',
  k: '#..../#..../#..#./#.#../##.../#.#../#..#.',
  l: '.##../..#../..#../..#../..#../..#../.###.',
  m: '...../...../##.#./#.#.#/#.#.#/#.#.#/#.#.#',
  n: '...../...../#.##./##..#/#...#/#...#/#...#',
  o: '...../...../.###./#...#/#...#/#...#/.###.',
  p: '...../...../####./#...#/#...#/#...#/####./#..../#....',
  q: '...../...../.####/#...#/#...#/#...#/.####/....#/....#',
  r: '...../...../#.##./##..#/#..../#..../#....',
  s: '...../...../.####/#..../.###./....#/####.',
  t: '.#.../.#.../###../.#.../.#.../.#..#/..##.',
  u: '...../...../#...#/#...#/#...#/#..##/.##.#',
  v: '...../...../#...#/#...#/#...#/.#.#./..#..',
  w: '...../...../#...#/#...#/#.#.#/#.#.#/.#.#.',
  x: '...../...../#...#/.#.#./..#../.#.#./#...#',
  y: '...../...../#...#/#...#/#...#/#...#/.####/....#/.###.',
  z: '...../...../#####/...#./..#../.#.../#####',
  0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  1: '..#../.##../..#../..#../..#../..#../.###.',
  2: '.###./#...#/....#/...#./..#../.#.../#####',
  3: '#####/...#./..#../...#./....#/#...#/.###.',
  4: '...#./..##./.#.#./#..#./#####/...#./...#.',
  5: '#####/#..../####./....#/....#/#...#/.###.',
  6: '..##./.#.../#..../####./#...#/#...#/.###.',
  7: '#####/....#/...#./..#../.#.../.#.../.#...',
  8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
  9: '.###./#...#/#...#/.####/....#/...#./.##..',
  '!': '..#../..#../..#../..#../..#../...../..#..',
  '"': '.#.#./.#.#./.#.#.',
  '#': '.#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.',
  $: '..#../.####/#.#../.###./..#.#/####./..#..',
  '%': '##.../##..#/...#./..#../.#.../#..##/...##',
  '&': '.##../#..#./#.#../.#.../#.#.#/#..#./.##.#',
  "'": '..#../..#../.#...',
  '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
  ')': '.#.../..#../...#./...#./...#./..#../.#...',
  '*': '...../..#../#.#.#/.###./#.#.#/..#../.....',
  '+': '...../..#../..#../#####/..#../..#../.....',
  ',': '...../...../...../...../...../..##./...#./..#..',
  '-': '...../...../...../.###./...../...../.....',
  '.': '...../...../...../...../...../.##../.##..',
  '/': '...../....#/...#./..#../.#.../#..../.....',
  ':': '...../.##../.##../...../.##../.##../.....',
  ';': '...../.##../.##../...../.##../..#../.#...',
  '<': '...#./..#../.#.../#..../.#.../..#../...#.',
  '=': '...../...../#####/...../#####/...../.....',
  '>': '.#.../..#../...#./....#/...#./..#../.#...',
  '?': '.###./#...#/....#/...#./..#../...../..#..',
  '@': '.###./#...#/#.###/#.#.#/#.###/#..../.###.',
  '[': '.###./.#.../.#.../.#.../.#.../.#.../.###.',
  '\\': '...../#..../.#.../..#../...#./....#/.....',
  ']': '.###./...#./...#./...#./...#./...#./.###.',
  '^': '..#../.#.#./#...#',
  _: '...../...../...../...../...../...../...../#####',
  '`': '.#.../..#..',
  '{': '..##./.#.../.#.../##.../.#.../.#.../..##.',
  '|': '..#../..#../..#../..#../..#../..#../..#..',
  '}': '.##../...#./...#./...##/...#./...#./.##..',
  '~': '...../...../.#.../#.#.#/...#./...../.....',
  '×': '...../#...#/.#.#./..#../.#.#./#...#/.....',
  '·': '...../...../...../..#../...../...../.....',
  '•': '...../...../.###./.###./.###./...../.....',
  '–': '...../...../...../#####/...../...../.....',
  '−': '...../...../...../#####/...../...../.....',
  '—': '....../....../....../######/....../....../......',
  '°': '.##../#..#./.##..',
  '…': '...../...../...../...../...../...../#.#.#',
  '’': '..#../..#../.#...',
  '‘': '..#../.#.../.#...',
  '“': '.#.#./#.#../#.#..',
  '”': '.#.#./.#.#./#.#..',
  '→': '...../..#../...#./#####/...#./..#../.....',
  '←': '...../..#../.#.../#####/.#.../..#../.....',
  '↑': '..#../.###./#.#.#/..#../..#../..#../.....',
  '↓': '...../..#../..#../..#../#.#.#/.###./..#..',
  '▶': '#..../##.../###../####./###../##.../#....',
  '◀': '....#/...##/..###/.####/..###/...##/....#',
  '▲': '...../..#../..#../.###./.###./#####/.....',
  '▼': '...../#####/.###./.###./..#../..#../.....',
  '■': '...../#####/#####/#####/#####/#####/.....',
  '□': '...../#####/#...#/#...#/#...#/#####/.....',
  '✕': '#...#/.#.#./..#../.#.#./#...#',
  '✓': '...../....#/...#./#.#../.#.../...../.....',
  '∞': '....../....../.#..#./#.##.#/#.##.#/.#..#./......',
  '█': '######/######/######/######/######/######/######/######/######',
};

let _bitmaps = null;

/** char -> { rows: Uint8Array(GLYPH_ROWS) of bit masks (bit 0 = leftmost column), w } */
export function glyphBitmaps() {
  if (_bitmaps) return _bitmaps;
  _bitmaps = new Map();
  for (const ch of Object.keys(G)) {
    const rows = new Uint8Array(GLYPH_ROWS);
    let w = 0;
    const lines = G[ch] ? G[ch].split('/') : [];
    for (let r = 0; r < lines.length && r < GLYPH_ROWS; r++) {
      const line = lines[r];
      w = Math.max(w, line.length);
      for (let c = 0; c < line.length; c++) if (line[c] === '#') rows[r] |= 1 << c;
    }
    _bitmaps.set(ch, { rows, w });
  }
  return _bitmaps;
}

/** The glyph used for a character (unknown characters fall back to '?'; letters keep case). */
export function glyphFor(ch) {
  const b = glyphBitmaps();
  return b.get(ch) || b.get('?');
}

export function hasGlyph(ch) {
  return glyphBitmaps().has(ch);
}

// ---------------------------------------------------------------------------------------------
// Canvas drawing (pixel-exact; no font loading needed)

/** Width in canvas pixels of `text` drawn at `scale` (font pixel -> scale canvas pixels). */
export function measurePixelText(text, scale = 1, spacing = 0) {
  const n = [...String(text)].length;
  return n ? (n * (GLYPH_ADVANCE + spacing) - 1 - spacing) * scale : 0;
}

/**
 * Draws `text` with its cap top at (x, y) using fillRect runs (fillStyle must be set by the
 * caller, or pass `color`). Returns the advance width. Scale should be an integer for crispness.
 */
export function drawPixelText(ctx, text, x, y, scale = 1, color, spacing = 0) {
  if (color) ctx.fillStyle = color;
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of String(text)) {
    const g = glyphFor(ch);
    for (let r = 0; r < GLYPH_ROWS; r++) {
      const bits = g.rows[r];
      if (!bits) continue;
      let c = 0;
      while (c < 7) {
        if (bits & (1 << c)) {
          let e = c + 1;
          while (e < 7 && bits & (1 << e)) e++;
          ctx.fillRect(cx + c * scale, cy + r * scale, (e - c) * scale, scale);
          c = e;
        } else c++;
      }
    }
    cx += (GLYPH_ADVANCE + spacing) * scale;
  }
  return cx - x;
}

/** Calls fn(px, py) for every inked font pixel of `text` (top-left of the text at 0, 0). */
export function forEachTextPixel(text, fn, spacing = 0) {
  let ox = 0;
  for (const ch of String(text)) {
    const g = glyphFor(ch);
    for (let r = 0; r < GLYPH_ROWS; r++) {
      const bits = g.rows[r];
      for (let c = 0; bits && c < 7; c++) if (bits & (1 << c)) fn(ox + c, r);
    }
    ox += GLYPH_ADVANCE + spacing;
  }
}

// ---------------------------------------------------------------------------------------------
// TrueType compiler

/** Outline contours of one glyph: pixel edges, outer loops clockwise, holes counter-clockwise. */
export function traceGlyph(rows) {
  const H = GLYPH_ROWS, W = 7;
  const on = (c, r) => r >= 0 && r < H && c >= 0 && c < W && (rows[r] & (1 << c)) !== 0;
  // grid point (gx, gy): gx = column boundary, gy = row boundary (0 = top of row 0)
  const edges = []; // [x0, y0, x1, y1] in grid coordinates, y down
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (!on(c, r)) continue;
      // clockwise in y-up font space == counter-clockwise in this y-down grid
      if (!on(c, r - 1)) edges.push([c, r, c + 1, r]); // top: left -> right
      if (!on(c + 1, r)) edges.push([c + 1, r, c + 1, r + 1]); // right: down
      if (!on(c, r + 1)) edges.push([c + 1, r + 1, c, r + 1]); // bottom: right -> left
      if (!on(c - 1, r)) edges.push([c, r + 1, c, r]); // left: up
    }
  }
  const from = new Map();
  const key = (x, y) => x * 64 + y;
  edges.forEach((e, i) => {
    const k = key(e[0], e[1]);
    if (!from.has(k)) from.set(k, []);
    from.get(k).push(i);
  });
  const used = new Uint8Array(edges.length);
  const contours = [];
  for (let s = 0; s < edges.length; s++) {
    if (used[s]) continue;
    const pts = [];
    let i = s;
    while (!used[i]) {
      used[i] = 1;
      const e = edges[i];
      pts.push([e[0], e[1]]);
      const nexts = from.get(key(e[2], e[3])) || [];
      let next = -1;
      for (const j of nexts) {
        if (!used[j]) {
          next = j;
          break;
        }
      }
      if (next < 0) break;
      i = next;
    }
    // drop collinear points
    const out = [];
    for (let k = 0; k < pts.length; k++) {
      const a = pts[(k + pts.length - 1) % pts.length], b = pts[k], c = pts[(k + 1) % pts.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (cross !== 0) out.push(b);
    }
    if (out.length >= 3) {
      // grid -> font units (y up, baseline at the bottom of row BASE_ROW)
      contours.push(out.map(([gx, gy]) => [gx * UNIT, (BASE_ROW + 1 - gy) * UNIT]));
    }
  }
  return contours;
}

class Writer {
  constructor(n = 1024) {
    this.buf = new Uint8Array(n);
    this.dv = new DataView(this.buf.buffer);
    this.p = 0;
  }
  ensure(n) {
    if (this.p + n <= this.buf.length) return;
    const nb = new Uint8Array(Math.max(this.buf.length * 2, this.p + n));
    nb.set(this.buf);
    this.buf = nb;
    this.dv = new DataView(nb.buffer);
  }
  u8(v) { this.ensure(1); this.dv.setUint8(this.p, v); this.p += 1; return this; }
  u16(v) { this.ensure(2); this.dv.setUint16(this.p, v & 0xffff); this.p += 2; return this; }
  i16(v) { this.ensure(2); this.dv.setInt16(this.p, v); this.p += 2; return this; }
  u32(v) { this.ensure(4); this.dv.setUint32(this.p, v >>> 0); this.p += 4; return this; }
  tag(s) { for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i)); return this; }
  bytes(a) { this.ensure(a.length); this.buf.set(a, this.p); this.p += a.length; return this; }
  pad4() { while (this.p % 4) this.u8(0); return this; }
  done() { return this.buf.slice(0, this.p); }
}

function checksum(bytes) {
  let sum = 0;
  const n = bytes.length;
  for (let i = 0; i < n; i += 4) {
    const w = ((bytes[i] << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0)) >>> 0;
    sum = (sum + w) >>> 0;
  }
  return sum;
}

/**
 * Compiles the bitmap glyphs into a TrueType font. Returns a Uint8Array (FontFace accepts its
 * buffer). Pure: runs in Node too.
 */
export function buildPixelFont(familyName = FONT_FAMILY) {
  const bm = glyphBitmaps();
  const chars = [...bm.keys()].filter((c) => c.codePointAt(0) <= 0xffff).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  // glyph 0 is .notdef (a hollow box)
  const notdef = new Uint8Array(GLYPH_ROWS);
  for (let r = 0; r < 7; r++) notdef[r] = r === 0 || r === 6 ? 0b11111 : 0b10001;
  const glyphs = [{ contours: traceGlyph(notdef) }];
  const cmap = [];
  for (const ch of chars) {
    cmap.push([ch.codePointAt(0), glyphs.length]);
    glyphs.push({ contours: traceGlyph(bm.get(ch).rows) });
  }
  const nG = glyphs.length;
  const adv = GLYPH_ADVANCE * UNIT;

  // glyf + loca
  const glyf = new Writer(16384);
  const loca = [];
  let maxPts = 0, maxCont = 0;
  let gxMin = 0, gyMin = 0, gxMax = 0, gyMax = 0;
  for (const g of glyphs) {
    loca.push(glyf.p);
    const cs = g.contours;
    g.xMin = 0;
    if (!cs.length) continue;
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity, nPts = 0;
    for (const c of cs) {
      nPts += c.length;
      for (const [x, y] of c) {
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }
    g.xMin = xMin;
    gxMin = Math.min(gxMin, xMin);
    gyMin = Math.min(gyMin, yMin);
    gxMax = Math.max(gxMax, xMax);
    gyMax = Math.max(gyMax, yMax);
    maxPts = Math.max(maxPts, nPts);
    maxCont = Math.max(maxCont, cs.length);
    glyf.i16(cs.length).i16(xMin).i16(yMin).i16(xMax).i16(yMax);
    let end = -1;
    for (const c of cs) {
      end += c.length;
      glyf.u16(end);
    }
    glyf.u16(0); // no instructions
    for (let i = 0; i < nPts; i++) glyf.u8(0x01); // on-curve, 16-bit deltas
    let px = 0;
    for (const c of cs) for (const [x] of c) { glyf.i16(x - px); px = x; }
    let py = 0;
    for (const c of cs) for (const [, y] of c) { glyf.i16(y - py); py = y; }
    glyf.pad4();
  }
  loca.push(glyf.p);
  const glyfBytes = glyf.done();

  const locaW = new Writer(4 * (nG + 1));
  for (const o of loca) locaW.u32(o);

  // cmap: format 4, runs of consecutive code points with consecutive glyph ids
  const segs = [];
  for (const [cp, gid] of cmap) {
    const s = segs[segs.length - 1];
    if (s && cp === s.end + 1 && gid - cp === s.delta) s.end = cp;
    else segs.push({ start: cp, end: cp, delta: gid - cp });
  }
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const segX2 = segs.length * 2;
  const sr = 2 * 2 ** Math.floor(Math.log2(segs.length));
  const sub = new Writer(64 + segs.length * 8);
  sub.u16(4).u16(16 + segs.length * 8).u16(0).u16(segX2).u16(sr).u16(Math.log2(sr / 2)).u16(segX2 - sr);
  for (const s of segs) sub.u16(s.end);
  sub.u16(0);
  for (const s of segs) sub.u16(s.start);
  for (const s of segs) sub.u16(s.delta & 0xffff);
  for (const s of segs) sub.u16(0);
  const cmapW = new Writer(16 + sub.p);
  cmapW.u16(0).u16(1).u16(3).u16(1).u32(12).bytes(sub.done());

  const ascent = 8 * UNIT, descent = -2 * UNIT;

  const head = new Writer(54);
  head.u16(1).u16(0).u32(0x00010000).u32(0).u32(0x5f0f3cf5).u16(0x000b).u16(UPEM)
    .u32(0).u32(0xe0000000).u32(0).u32(0xe0000000)
    .i16(gxMin).i16(gyMin).i16(gxMax).i16(gyMax).u16(0).u16(8).i16(2).i16(1).i16(0);

  const hhea = new Writer(36);
  hhea.u32(0x00010000).i16(ascent).i16(descent).i16(0).u16(adv).i16(0).i16(0).i16(gxMax)
    .i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(nG);

  const hmtx = new Writer(4 * nG);
  for (const g of glyphs) hmtx.u16(adv).i16(g.xMin);

  const maxp = new Writer(32);
  maxp.u32(0x00010000).u16(nG).u16(maxPts).u16(maxCont).u16(0).u16(0).u16(2)
    .u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);

  const cps = cmap.map((c) => c[0]);
  const os2 = new Writer(96);
  os2.u16(4).i16(adv).u16(400).u16(5).u16(0)
    .i16(5 * UNIT).i16(5 * UNIT).i16(0).i16(UNIT).i16(5 * UNIT).i16(5 * UNIT).i16(0).i16(4 * UNIT)
    .i16(UNIT).i16(3 * UNIT).i16(0)
    .bytes(new Uint8Array([2, 0, 5, 9, 0, 0, 0, 0, 0, 0])) // panose: text, monospaced
    .u32(0x80000003).u32(0x00002020).u32(0).u32(0)
    .tag('LLKT')
    .u16(0x00c0) // REGULAR | USE_TYPO_METRICS
    .u16(Math.min(...cps)).u16(Math.min(0xffff, Math.max(...cps)))
    .i16(ascent).i16(descent).i16(0).u16(ascent).u16(-descent)
    .u32(1).u32(0)
    .i16(5 * UNIT).i16(7 * UNIT).u16(0).u16(32).u16(1);

  const names = [
    [1, familyName], [2, 'Regular'], [3, familyName.replace(/\s/g, '') + '-Regular-1.0'],
    [4, familyName + ' Regular'], [5, 'Version 1.000'], [6, familyName.replace(/\s/g, '') + '-Regular'],
  ];
  const strs = names.map(([, s]) => {
    const w = new Writer(s.length * 2);
    for (const ch of s) w.u16(ch.charCodeAt(0));
    return w.done();
  });
  const name = new Writer(256);
  name.u16(0).u16(names.length).u16(6 + 12 * names.length);
  let off = 0;
  names.forEach(([id], i) => {
    name.u16(3).u16(1).u16(0x409).u16(id).u16(strs[i].length).u16(off);
    off += strs[i].length;
  });
  for (const s of strs) name.bytes(s);

  const post = new Writer(32);
  post.u32(0x00030000).u32(0).i16(-UNIT).i16(UNIT).u32(1).u32(0).u32(0).u32(0).u32(0);

  const tables = [
    ['OS/2', os2.done()], ['cmap', cmapW.done()], ['glyf', glyfBytes], ['head', head.done()],
    ['hhea', hhea.done()], ['hmtx', hmtx.done()], ['loca', locaW.done()], ['maxp', maxp.done()],
    ['name', name.done()], ['post', post.done()],
  ];
  const numTables = tables.length;
  const es = Math.floor(Math.log2(numTables));
  const out = new Writer(12 + 16 * numTables + tables.reduce((a, [, b]) => a + b.length + 4, 0));
  out.u32(0x00010000).u16(numTables).u16(16 * 2 ** es).u16(es).u16(numTables * 16 - 16 * 2 ** es);
  let offset = 12 + 16 * numTables;
  let headOffset = 0;
  for (const [tag, bytes] of tables) {
    if (tag === 'head') headOffset = offset;
    out.tag(tag).u32(checksum(bytes)).u32(offset).u32(bytes.length);
    offset += (bytes.length + 3) & ~3;
  }
  for (const [, bytes] of tables) out.bytes(bytes).pad4();
  const font = out.done();
  const adj = (0xb1b0afba - checksum(font)) >>> 0;
  new DataView(font.buffer).setUint32(headOffset + 8, adj);
  return font;
}

let _fontPromise = null;

/**
 * Registers the pixel font with document.fonts (browser only; resolves to true when it is
 * usable, false when the platform refused it and the monospace fallback is in use).
 */
export function ensurePixelFont() {
  if (_fontPromise) return _fontPromise;
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return (_fontPromise = Promise.resolve(false));
  try {
    const face = new FontFace(FONT_FAMILY, buildPixelFont().buffer, { style: 'normal', weight: '400', display: 'block' });
    _fontPromise = face.load().then((f) => {
      document.fonts.add(f);
      return true;
    }, (e) => {
      if (typeof console !== 'undefined') console.warn('[ui] pixel font rejected, using monospace', e);
      return false;
    });
  } catch (e) {
    _fontPromise = Promise.resolve(false);
  }
  return _fontPromise;
}
