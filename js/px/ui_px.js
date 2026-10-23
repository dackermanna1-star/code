/* What Derry Keeps — the interface, hand-pixelled.
 *
 * Every frame, key, label, icon and ornament of the interface is drawn here
 * at native pixel size with the PX palette, upscaled by a whole number and
 * handed to the CSS as 9-slice border images and backgrounds (always with
 * image-rendering: pixelated). One interface pixel (--px) is one pixel of the
 * 320×180 stage art, so the UI lives in the same world as the pictures.
 *
 * Two materials, both from 1991:
 *   plastic — Gus's tape recorder and cassettes: smoky dark panels held by
 *             brass screws, piano keys, cassette spines for the main menu;
 *   paper   — her composition notebook, J-cards, Polaroids, Dymo labels,
 *             masking tape, pushpins, a dot-matrix printout.
 * Lantern green appears only where something isn't ordinary.
 *
 * Exposes window.UIPX:
 *   tex          registry of textures (also CSS vars --ui-<name> on :root)
 *   plate(hex)   Dymo-label colours for a speaker      chip(hex) tone sticker colours
 *   wordmark()   the title lettering (2-frame sheet: lamp lit / flickered)
 *   fit()        sets --px (interface pixel), --hpx (HUD), --spx (stage pixel), --t-lab
 * and a stylesheet of icon classes: <i class="pxi pxi-NAME"> carries
 * --i-key --i-keyon --i-light --i-gold --i-teal --i-rose --i-ink; the context
 * picks one (a key on the recorder, a sticker on a toast, ink on paper).
 */
(function () {
  'use strict';
  if (!window.PX) return;
  const P = PX.P;
  const UIPX = (window.UIPX = { tex: {} });
  const K = 6; // textures are upscaled by this whole number before CSS scales them

  /* ------------------------------------------------------------------ */
  /* colour + a tiny raster                                              */
  const rgbOf = (c) => (typeof c === 'string' ? PX.hex(c) : PX.rgbOf(c));
  const css = (c, a) => { const v = rgbOf(c); return a == null || a >= 1 ? PX.rgbHex(v) : `rgba(${v[0]},${v[1]},${v[2]},${a})`; };
  UIPX.css = css;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lum = (h) => { const c = rgbOf(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bayer = (x, y) => BAY[((y & 3) << 2) | (x & 3)];

  class Grid {
    constructor(w, h) { this.w = w; this.h = h; this.c = new Array(w * h).fill(null); }
    set(x, y, v) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.c[y * this.w + x] = v; return this; }
    get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.c[y * this.w + x] : null; }
    rect(x, y, w, h, v) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, v); return this; }
    hline(x0, x1, y, v) { for (let i = x0; i <= x1; i++) this.set(i, y, v); return this; }
    vline(x, y0, y1, v) { for (let j = y0; j <= y1; j++) this.set(x, j, v); return this; }
    /* stamp an ASCII map; characters missing from the legend leave pixels alone */
    map(rows, leg, ox = 0, oy = 0) {
      rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const ch = r[x]; if (ch in leg) this.set(ox + x, oy + y, leg[ch]); } });
      return this;
    }
    stamp(g, ox, oy) { g.each((x, y, v) => { if (v != null) this.set(ox + x, oy + y, v); }); return this; }
    each(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) fn(x, y, this.get(x, y)); return this; }
    canvas() {
      const cv = document.createElement('canvas'); cv.width = this.w; cv.height = this.h;
      const ctx = cv.getContext('2d'), img = ctx.createImageData(this.w, this.h), d = img.data;
      for (let i = 0; i < this.c.length; i++) {
        const v = this.c[i]; if (v == null) continue;
        const code = Array.isArray(v) ? v[0] : v, a = Array.isArray(v) ? v[1] : 1;
        if (code == null) continue;
        const rgb = rgbOf(code);
        d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = Math.round(a * 255);
      }
      ctx.putImageData(img, 0, 0);
      return cv;
    }
    url(k = K) { return PX.upscale(this.canvas(), k).toDataURL(); }
  }
  UIPX.Grid = Grid;
  const A = (code, a) => [code, a]; // a colour with alpha

  /* frame from rings (outside in); each ring {t,l,b,r} or {c}; optional pixel-rounded corners */
  function frame(w, h, rings, fill, o = {}) {
    const g = new Grid(w, h), n = rings.length;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dt = y, dl = x, db = h - 1 - y, dr = w - 1 - x, m = Math.min(dt, dl, db, dr);
      if (m >= n) { g.set(x, y, typeof fill === 'function' ? fill(x, y) : fill); continue; }
      const R = rings[m];
      const side = m === dt && m !== dr ? 't' : m === dl && m !== db ? 'l' : m === db ? 'b' : 'r';
      g.set(x, y, R[side] !== undefined ? R[side] : R.c);
    }
    if (o.round) {
      for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [w - 1, 0, -1, 1], [0, h - 1, 1, -1], [w - 1, h - 1, -1, -1]]) {
        g.set(cx, cy, null);
        if (o.round > 1) { g.set(cx + sx, cy, null); g.set(cx, cy + sy, null); g.set(cx + sx, cy + sy, rings[0].c !== undefined ? rings[0].c : rings[0].t); }
      }
    }
    return g;
  }

  /* register a texture: CSS var --ui-<name> = url(...) */
  const root = document.documentElement;
  function reg(name, g, k = K) {
    const url = g.url(k);
    UIPX.tex[name] = { url, w: g.w, h: g.h, g };
    root.style.setProperty('--ui-' + name, `url("${url}")`);
    return url;
  }
  UIPX.reg = reg;

  /* ------------------------------------------------------------------ */
  /* palette shorthands                                                  */
  const INK = P.ink, PLUM = P.plum, PAPER = P.paper, CREAM = P.cream, LAMP = P.lamp, LANT = P.lantern;
  const MET = P.metal, CAMEL = P.camel, MUST = P.mustard, RED = P.red, TEAL = P.teal, WD = P.wood_dark;
  const WHITE = P.white_cloth, NAVY = P.navy, PINK = P.pink, OLIVE = P.olive, SKYQ = P.sky_quiet, STONE = P.stone, BC = P.black_cloth;

  /* hue-shifted ramp around any hex colour (darks lean violet, lights lean yellow) */
  function rampFrom(hexc, midL) {
    const [h, s, l0] = PX.hsl(PX.hex(hexc));
    const l = midL == null ? l0 : midL;
    const toward = (from, target, amt) => { const d = ((target - from + 540) % 360) - 180; return from + Math.sign(d) * Math.min(Math.abs(d), amt); };
    const out = [];
    for (let i = 0; i < 6; i++) {
      const t = i - 3;
      const L = clamp(l + t * (t < 0 ? 0.115 : 0.1), 0.05, 0.95);
      const H = t < 0 ? toward(h, 250, -t * 8) : toward(h, 55, t * 7);
      const S = clamp(s * (t < 0 ? 1 + -t * 0.05 : 1 - t * 0.1), 0, 1);
      out.push(PX.rgbHex(PX.fromHsl([H, S, L])));
    }
    return out;
  }
  UIPX.rampFrom = rampFrom;

  /* ------------------------------------------------------------------ */
  /* PLASTIC                                                             */
  /* the dialogue box: a smoky cassette shell held by four brass screws  */
  const SCREW = ['.ab.', 'abbc', 'bxbc', '.cc.'];
  const screwLeg = { a: CAMEL[5], b: CAMEL[3], c: CAMEL[1], x: WD[1] };
  function panel(o = {}) {
    const S = 18, rim = o.rim || [INK[4], INK[2]], al = o.alpha == null ? 0.93 : o.alpha;
    const rings = [{ c: o.edge || INK[0] }, { t: rim[0], l: rim[0], b: rim[1], r: rim[1] }, { c: INK[0] }];
    const g = frame(S, S, rings, A(o.fill || INK[1], al), { round: 1 });
    if (o.sheen !== false) for (let x = 3; x < S - 3; x++) g.set(x, 3, A(o.sheenC || INK[2], al));
    if (o.screws) for (const [x, y] of [[4, 4], [S - 8, 4], [4, S - 8], [S - 8, S - 8]]) g.map(SCREW, screwLeg, x, y);
    return g;
  }
  reg('box', panel({ screws: true }));
  reg('box-hot', panel({ screws: true, rim: [LAMP[3], LAMP[1]], fill: INK[2] }));
  reg('card', panel({}));
  reg('card-solid', panel({ alpha: 1 }));

  /* tape: the box becomes a cassette J-card — cream card, the classic stripes */
  (function () {
    const S = 24, g = frame(S, S, [{ c: INK[0] }, { t: CREAM[5], l: CREAM[5], b: CREAM[2], r: CREAM[2] }], CREAM[4], { round: 1 });
    [RED[4], LAMP[2], MUST[4], TEAL[4]].forEach((c, i) => { for (let x = 1; x < S - 1; x++) g.set(x, 2 + i, c); });
    for (let x = 1; x < S - 1; x++) g.set(x, 6, CREAM[3]);
    for (let x = 3; x < S - 3; x++) g.set(x, S - 4, CREAM[3]);
    reg('jcard', g);
  })();

  /* radio: green-black glass, a dim lantern rim; scanlines on top */
  (function () {
    const S = 18, g = frame(S, S, [{ c: SKYQ[0] }, { t: LANT[1], l: LANT[1], b: LANT[0], r: LANT[0] }, { c: SKYQ[0] }], A(SKYQ[1], 0.95), { round: 1 });
    reg('radio', g);
    const s = new Grid(1, 3); s.set(0, 0, A(LANT[0], 0.5));
    reg('scan', s, 1);
  })();

  /* think: Gus's inner voice — dotted outline, softer fill (tiles with 'round') */
  (function () {
    const S = 18, g = new Grid(S, S), fill = A(INK[1], 0.84);
    g.rect(1, 1, S - 2, S - 2, fill);
    for (let i = 0; i < S; i++) {
      const on = i % 2 === 0 && i > 1 && i < S - 2;
      if (on) { g.set(i, 0, P.cloud[2]); g.set(i, S - 1, P.cloud[1]); g.set(0, i, P.cloud[2]); g.set(S - 1, i, P.cloud[1]); }
    }
    g.set(1, 1, P.cloud[2]); g.set(S - 2, 1, P.cloud[2]); g.set(1, S - 2, P.cloud[1]); g.set(S - 2, S - 2, P.cloud[1]);
    reg('think', g);
    const v = new Grid(S, S);
    g.each((x, y, c) => { if (c == null) return; v.set(x, y, Array.isArray(c) ? A(SKYQ[1], 0.9) : (y === S - 1 || x === S - 1 || (y === S - 2 && x === S - 2) || (y === S - 2 && x === 1) ? LANT[1] : LANT[3])); });
    reg('voice', v);
  })();

  /* choices: smoky slabs; hot = lamp-lit rim; free = a dashed paper edge */
  reg('choice', panel({}));
  reg('choice-hot', panel({ rim: [LAMP[4], LAMP[2]], fill: INK[2], alpha: 0.97, sheenC: INK[3] }));
  reg('choice-free', (function () {
    const S = 18, g = frame(S, S, [{ c: INK[0] }], A(INK[1], 0.82), { round: 1 });
    for (let i = 2; i < S - 2; i++) if (i % 3 !== 1) { g.set(i, 1, PAPER[2]); g.set(i, S - 2, PAPER[1]); g.set(1, i, PAPER[2]); g.set(S - 2, i, PAPER[1]); }
    return g;
  })());

  /* piano keys (HUD, buttons): raised plastic with a visible depth; down = pressed in */
  function key(o = {}) {
    const W = 12, H = 12, g = new Grid(W, H);
    const face = o.face || INK[3], hi = o.hi || INK[5], sh = o.sh || INK[2], depth = o.depth || INK[1], edge = o.edge || INK[0];
    g.rect(1, 0, W - 2, H, edge); g.rect(0, 1, W, H - 2, edge);
    if (o.down) {
      g.rect(1, 2, W - 2, H - 3, face);
      g.hline(1, W - 2, 1, edge); g.hline(1, W - 2, 2, sh); g.vline(1, 2, H - 3, sh);
      g.hline(2, W - 3, H - 2, hi);
    } else {
      g.rect(1, 1, W - 2, H - 4, face);
      g.hline(2, W - 3, 1, hi); g.vline(1, 2, H - 5, hi);
      g.vline(W - 2, 2, H - 5, sh); g.hline(1, W - 2, H - 4, sh);
      g.hline(1, W - 2, H - 3, depth); g.hline(1, W - 2, H - 2, depth);
    }
    return g;
  }
  reg('key', key());
  reg('key-hot', key({ face: INK[4], hi: P.white[1], sh: INK[3] }));
  reg('key-down', key({ down: true, face: INK[2], hi: INK[4], sh: INK[1] }));
  reg('btn', key());
  reg('btn-hot', key({ face: INK[4], hi: P.white[1], sh: INK[3] }));
  reg('btn-down', key({ down: true, face: INK[2], hi: INK[4], sh: INK[1] }));
  reg('btn-primary', key({ face: LAMP[3], hi: LAMP[5], sh: LAMP[2], depth: LAMP[1], edge: LAMP[0] }));
  reg('btn-primary-hot', key({ face: LAMP[4], hi: LAMP[5], sh: LAMP[3], depth: LAMP[1], edge: LAMP[0] }));
  reg('btn-primary-down', key({ down: true, face: LAMP[2], hi: LAMP[4], sh: LAMP[1], edge: LAMP[0] }));

  /* sunken fields: inputs, the fader groove, the timer */
  function field(face, o = {}) {
    return frame(10, 10, [{ c: o.edge || INK[3] }, { t: o.dark || BC[0], l: o.dark || BC[0], b: o.light || INK[2], r: o.light || INK[2] }], face, { round: 1 });
  }
  reg('field', field(A(INK[0], 0.92)));
  reg('field-hot', field(A(INK[0], 0.92), { edge: LAMP[3] }));
  reg('groove', field(A(INK[0], 0.88)));

  /* ------------------------------------------------------------------ */
  /* PAPER                                                               */
  function paperSlip(o = {}) {
    const S = 16, base = o.base || PAPER, g = new Grid(S, S);
    g.rect(1, 1, S - 2, S - 2, o.fill || base[4]);
    g.hline(2, S - 3, 0, base[1]); g.hline(2, S - 3, S - 1, base[0]);
    g.vline(0, 2, S - 3, base[1]); g.vline(S - 1, 2, S - 3, base[0]);
    g.set(1, 1, base[1]); g.set(S - 2, 1, base[1]); g.set(1, S - 2, base[0]); g.set(S - 2, S - 2, base[0]);
    g.hline(2, S - 3, 1, base[5]); g.vline(1, 2, S - 3, base[5]);
    g.hline(2, S - 3, S - 2, base[3]); g.vline(S - 2, 2, S - 3, base[3]);
    if (o.stripes) o.stripes.forEach((c, i) => g.hline(2, S - 3, 2 + i, c));
    return g;
  }
  reg('paper', paperSlip());
  reg('paper-white', paperSlip({ base: WHITE, fill: WHITE[5] }));
  reg('note', paperSlip({ base: P.wall_yellow, fill: P.wall_yellow[5] }));
  reg('label', paperSlip({ stripes: [RED[4], MUST[4]] }));
  reg('label-blank', paperSlip({ base: STONE, fill: STONE[4] }));

  /* Polaroid: white frame, wide bottom lip, dark inner edge of the photo */
  (function () {
    const W = 14, H = 18, g = new Grid(W, H);
    g.rect(1, 0, W - 2, H, WHITE[1]); g.rect(0, 1, W, H - 2, WHITE[1]);
    g.rect(1, 1, W - 2, H - 2, WHITE[5]);
    g.vline(W - 2, 2, H - 2, WHITE[3]); g.hline(2, W - 2, H - 2, WHITE[3]);
    g.hline(1, W - 3, 1, P.white[5]);
    g.rect(4, 4, W - 8, H - 12, null);
    g.hline(3, W - 4, 3, INK[1]); g.vline(3, 3, H - 8, INK[1]);
    g.hline(3, W - 4, H - 8, WHITE[3]); g.vline(W - 4, 4, H - 8, WHITE[3]);
    reg('polaroid', g);
  })();

  /* masking tape: translucent, ragged ends */
  (function () {
    const W = 14, H = 5, g = new Grid(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if ((x === 0 && (y === 1 || y === 3)) || (x === W - 1 && (y === 0 || y === 2 || y === 4))) continue;
      g.set(x, y, A(y === 0 ? CREAM[5] : y === H - 1 ? CREAM[3] : CREAM[4], 0.8));
    }
    reg('tape', g);
  })();

  /* the composition-book cover: black-and-white marble (seamless tile) */
  (function () {
    const N = 48, g = new Grid(N, N), rng = PX.rng('composition');
    const lat = (n) => { const a = []; for (let i = 0; i < n * n; i++) a.push(rng()); return a; };
    const L1 = lat(6), L2 = lat(12), L3 = lat(24);
    const noise = (L, n, x, y) => {
      const fx = (x / N) * n, fy = (y / N) * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const v = (i, j) => L[((j % n + n) % n) * n + ((i % n + n) % n)];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      return (v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx) * (1 - sy) + (v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx) * sy;
    };
    g.each((x, y) => {
      const t = noise(L1, 6, x, y) * 0.55 + noise(L2, 12, x, y) * 0.3 + noise(L3, 24, x, y) * 0.15;
      const m = Math.abs(Math.sin(t * 15));               // folded into veins and chips
      const KG = P.knit_gray;
      let c = BC[1];
      if (m > 0.95) c = KG[4];
      else if (m > 0.89) c = KG[2];
      else if (m > 0.84 && bayer(x, y) < 0.5) c = BC[3];
      g.set(x, y, c);
    });
    reg('marble', g, 2);
  })();

  /* notebook index tabs, one per colour; -on = the open tab, joined to the page */
  for (const [name, r] of Object.entries({ teal: TEAL, mustard: MUST, rust: RED, plum: PLUM, olive: OLIVE })) {
    const W = 12, H = 10;
    const t = new Grid(W, H);
    t.rect(1, 0, W - 2, H, r[0]); t.rect(0, 1, W, H - 1, r[0]);
    t.rect(1, 1, W - 2, H - 1, r[3]);
    t.hline(2, W - 3, 1, r[5]); t.vline(1, 2, H - 1, r[4]); t.vline(W - 2, 2, H - 1, r[2]);
    reg('tab-' + name, t);
    const d = new Grid(W, H);
    d.rect(1, 0, W - 2, H, r[0]); d.rect(0, 1, W, H - 1, r[0]);
    d.rect(1, 1, W - 2, H - 1, r[4]); d.hline(2, W - 3, 1, P.white[5]); d.vline(1, 2, H - 1, r[5]); d.vline(W - 2, 2, H - 1, r[3]);
    reg('tab-' + name + '-on', d);
  }

  /* tractor-feed edge of the history printout: one sprocket hole per tile */
  (function () {
    const g = new Grid(9, 6);
    g.rect(0, 0, 9, 6, PAPER[4]);
    g.map(['.ooo.', 'oxxxo', 'oxxxo', '.ooo.'], { o: PAPER[2], x: INK[0] }, 2, 1);
    g.vline(8, 0, 5, PAPER[3]);
    reg('sprocket', g);
    const r = new Grid(9, 6);
    r.rect(0, 0, 9, 6, PAPER[4]);
    r.map(['.ooo.', 'oxxxo', 'oxxxo', '.ooo.'], { o: PAPER[2], x: INK[0] }, 2, 1);
    r.vline(0, 0, 5, PAPER[3]);
    reg('sprocket-r', r);
  })();

  /* ------------------------------------------------------------------ */
  /* Dymo labels (nameplates) and tone stickers: colours per hex         */
  const labelCache = new Map();
  UIPX.plate = function (hexc) {
    hexc = hexc || '#c0623a';
    const k = 'plate|' + hexc;
    if (labelCache.has(k)) return labelCache.get(k);
    const l = PX.hsl(PX.hex(hexc))[2];
    let mid = Math.min(l, 0.5), r = rampFrom(hexc, mid);
    while (contrast(r[2], css(CREAM[5])) < 4.5 && mid > 0.2) { mid -= 0.03; r = rampFrom(hexc, mid); }
    const out = { r, vars: `--np0:${r[0]};--np1:${r[1]};--np2:${r[2]};--np4:${r[4]}` };
    labelCache.set(k, out);
    return out;
  };
  UIPX.chip = function (hexc) {
    hexc = hexc || '#b8b09f';
    const k = 'chip|' + hexc;
    if (labelCache.has(k)) return labelCache.get(k);
    const r = rampFrom(hexc);
    const ink = contrast(hexc, css(INK[0])) >= 4.5 ? css(INK[0]) : css(PAPER[5]);
    const out = { r, vars: `--tc:${hexc};--tc0:${r[0]};--tc2:${r[2]};--tc4:${r[5]};--tk:${ink}` };
    labelCache.set(k, out);
    return out;
  };

  /* ------------------------------------------------------------------ */
  /* the title menu: a stack of cassettes, spines out, one J-card each   */
  function spine(band, blank) {
    const r = rampFrom(band), W = 72, H = 11, g = new Grid(W, H);
    g.rect(1, 0, W - 2, H, INK[0]); g.rect(0, 1, W, H - 2, INK[0]);
    g.rect(1, 1, W - 2, H - 2, INK[2]);
    g.hline(2, W - 3, 1, INK[4]); g.hline(1, W - 2, H - 2, INK[1]); g.vline(W - 2, 2, H - 3, INK[1]);
    const lab = blank ? STONE : PAPER;
    g.rect(2, 2, W - 4, H - 4, lab[4]);
    g.hline(2, W - 3, 2, lab[5]); g.hline(2, W - 3, H - 3, lab[3]);
    const b = blank ? [STONE[1], STONE[2], STONE[3], STONE[3]] : [r[2], r[3], r[4], PAPER[5]];
    g.rect(2, 2, 8, H - 4, b[1]); g.hline(2, 9, 2, b[2]); g.hline(2, 9, H - 3, b[0]);
    g.vline(10, 2, H - 3, b[3]); g.vline(11, 2, H - 3, b[0]);
    g.rect(W - 6, 2, 3, H - 4, b[1]); g.hline(W - 6, W - 4, 2, b[2]); g.vline(W - 7, 2, H - 3, b[0]);
    // the case's hinge pins at both ends
    g.set(1, 5, INK[4]); g.set(W - 2, 5, INK[3]);
    return g;
  }
  ['#c4473c', '#5fb7b0', '#d9a441', '#8e7aa6', '#8a9a5b'].forEach((c, i) => reg('spine-' + i, spine(c)));
  reg('spine-blank', spine('#888888', true));

  /* ------------------------------------------------------------------ */
  /* icons: 7×7 glyphs, several treatments                               */
  const ICONS = {
    journal: ['#.#.#.#', '#######', '#.....#', '#.###.#', '#.....#', '#.##..#', '#######'],
    rec: ['..rrr..', '.rrrrr.', 'rrrrrrr', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..'],
    log: ['#######', '.......', '#####..', '.......', '#######', '.......', '####...'],
    save: ['..rrr..', '.rrrrr.', 'rrrrrrr', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..'],
    tape: ['.......', '#######', '#+++++#', '#+.+.+#', '#+++++#', '#######', '.......'],
    auto: ['##.....', '####...', '######.', '#######', '######.', '####...', '##.....'],
    play: ['##.....', '####...', '######.', '#######', '######.', '####...', '##.....'],
    skip: ['#..#...', '##.##..', '######.', '#######', '######.', '##.##..', '#..#...'],
    hide: ['.......', '..###..', '.#...#.', '#..#..#', '.#...#.', '..###..', '.......'],
    menu: ['.#.....', '#######', '.#.....', '.......', '....#..', '#######', '....#..'],
    clue: ['.###...', '#...#..', '#...#..', '#...#..', '.####..', '....##.', '.....##'],
    heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...', '.......'],
    pencil: ['.....ee', '....yye', '...yyy.', '..yyy..', '.yyy...', 'ww.....', 'k......'],
    close: ['##...##', '###.###', '.#####.', '..###..', '.#####.', '###.###', '##...##'],
    stop: ['.......', '.#####.', '.#####.', '.#####.', '.#####.', '.#####.', '.......'],
    lantern: ['...#...', '..###..', '.#ggg#.', '.#ggg#.', '.#ggg#.', '..###..', '...#...']
  };
  const ICOL = {
    key: { main: PAPER[5], shade: PAPER[3], accent: LAMP[4], shadow: INK[0] },
    keyon: { main: LAMP[4], shade: LAMP[2], accent: LAMP[5], shadow: LAMP[0] },
    light: { main: PAPER[5], shade: PAPER[3], accent: LAMP[4], outline: INK[0] },
    gold: { main: LAMP[4], shade: LAMP[2], accent: LAMP[5], outline: INK[0] },
    teal: { main: TEAL[5], shade: TEAL[3], accent: TEAL[5], outline: INK[0] },
    rose: { main: P.lip[4], shade: P.lip[2], accent: P.lip[5], outline: INK[0] },
    ink: { main: INK[1], shade: INK[3], accent: INK[3], outline: null }
  };
  function glyph(rows, variant) {
    const col = ICOL[variant], treat = variant === 'key' || variant === 'keyon' ? 'key' : col.outline ? 'sticker' : 'flat';
    const w = rows[0].length, h = rows.length, pad = treat === 'sticker' ? 1 : 0;
    const g = new Grid(w + pad * 2, h + pad * 2 + (treat === 'key' ? 1 : 0));
    const leg = { '#': col.main, '+': col.shade || col.main, a: col.accent, r: variant === 'ink' ? RED[3] : RED[4], y: MUST[4], e: PINK[4], w: CREAM[4], k: INK[1], g: LANT[4] };
    if (treat === 'key') {
      rows.forEach((r, y) => { for (let x = 0; x < w; x++) if (r[x] !== '.') g.set(x, y + 1, col.shadow); });
      g.map(rows, leg);
    } else {
      g.map(rows, leg, pad, pad);
      if (treat === 'sticker') {
        const out = [];
        g.each((x, y, v) => { if (v == null && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g.get(x + dx, y + dy) != null)) out.push([x, y]); });
        for (const [x, y] of out) g.set(x, y, col.outline);
      }
    }
    return g;
  }
  UIPX.icon = {};
  const iconCss = [];
  for (const [name, rows] of Object.entries(ICONS)) {
    const vars = [];
    for (const variant of Object.keys(ICOL)) {
      const g = glyph(rows, variant), url = g.url();
      UIPX.icon[name + ':' + variant] = { url, w: g.w, h: g.h };
      vars.push(`--i-${variant}:url("${url}")`);
    }
    iconCss.push(`.pxi-${name}{${vars.join(';')}}`);
  }
  reg('pencil', glyph(ICONS.pencil, 'light'));

  /* the "more" arrow and the menu cursor */
  (function () {
    const more = new Grid(9, 6);
    more.map(['ooooooooo', 'ohhhhhhho', '.ommmmmo.', '..osmso..', '...oso...', '....o....'], { o: INK[0], h: PAPER[5], m: PAPER[4], s: PAPER[2] });
    reg('more', more);
    const cur = new Grid(6, 9);
    cur.map(['oo....', 'oho...', 'ohmo..', 'ohmmo.', 'ohmmso', 'ohmso.', 'ohso..', 'oso...', 'oo....'], { o: INK[0], h: LAMP[5], m: LAMP[4], s: LAMP[2] });
    reg('cursor', cur);
  })();

  /* chapter-card rule: a dotted line either side of a small lantern */
  (function () {
    const g = new Grid(41, 5), c = PAPER[3];
    for (let x = 0; x < 15; x += 2) { g.set(x + 1, 2, c); g.set(39 - x, 2, c); }
    g.map(['..o..', '.ogo.', 'oglgo', '.ogo.', '..o..'], { o: PAPER[2], g: LANT[3], l: LANT[5] }, 18, 0);
    reg('rule', g);
  })();

  /* map pushpins (red; grey once visited) and the paperclip */
  (function () {
    const rows = ['..ooo..', '.ohhro.', 'ohrrrdo', 'orrrrdo', 'ordddmo', '.ommmo.', '..oso..', '...s...', '...s...', '...k...', '.......'];
    const pin = (R) => { const g = new Grid(7, 11); g.map(rows, { o: R[0], h: R[5], r: R[4], d: R[3], m: R[2], s: MET[3], k: MET[1] }); return g; };
    reg('pushpin', pin(RED));
    reg('pushpin-done', pin(STONE));
    const clip = new Grid(5, 12);
    clip.map(['.sss.', 's...s', 's.s.s', 's.s.s', 's.s.s', 's.s.s', 's.s.s', 's.s.s', 's...s', 's...s', '.s.s.', '..s..'], { s: P.chrome[2] });
    clip.map(['.h...', 'h....', 'h.h..', 'h.h..'], { h: P.chrome[4] });
    reg('clip', clip);
  })();

  /* timer: VU-meter segments */
  (function () {
    const seg = new Grid(4, 3);
    seg.rect(0, 0, 3, 3, RED[4]); seg.hline(0, 2, 0, RED[5]); seg.hline(0, 2, 2, RED[3]);
    reg('seg', seg);
  })();

  /* fader knob, select arrow, scrollbar thumbs */
  (function () {
    const knob = new Grid(7, 11);
    knob.map(['.ooooo.', 'ohhhhso', 'ohmmmso', 'ohmmmso', 'oaaaaao', 'ohmmmso', 'ohmmmso', 'ossssso', 'odddddo', '.ooooo.', '.......'],
      { o: INK[0], h: PAPER[5], m: PAPER[4], s: PAPER[2], a: RED[3], d: INK[2] });
    reg('knob', knob);
    const arrow = new Grid(7, 4);
    arrow.map(['#######', '.#####.', '..###..', '...#...'], { '#': PAPER[4] });
    reg('arrow-down', arrow);
    reg('thumb', frame(6, 6, [{ c: INK[0] }, { t: INK[5], l: INK[5], b: INK[3], r: INK[3] }], INK[4], { round: 1 }));
    reg('thumb-paper', frame(6, 6, [{ c: PAPER[1] }, { t: PAPER[4], l: PAPER[4], b: PAPER[2], r: PAPER[2] }], PAPER[3], { round: 1 }));
  })();

  /* ------------------------------------------------------------------ */
  /* cassette sprites                                                    */
  /* reel window: two hubs turning (+ then ×) with tape between, 2 frames */
  const HUB = [
    ['..ooo..', '.o...o.', 'o..s..o', 'o.sss.o', 'o..s..o', '.o...o.', '..ooo..'],
    ['..ooo..', '.o...o.', 'o.s.s.o', 'o..s..o', 'o.s.s.o', '.o...o.', '..ooo..']
  ];
  function reelWin(f, w) {
    const W = w || 23, H = 9, g = new Grid(W, H);
    g.rect(1, 0, W - 2, H, INK[0]); g.rect(0, 1, W, H - 2, INK[0]);
    g.rect(1, 1, W - 2, H - 2, BC[2]); g.hline(2, W - 3, 1, BC[3]);
    g.rect(5, 5, W - 10, 3, WD[2]); g.hline(5, W - 6, 5, WD[3]); // tape wound on, seen through the window
    g.map(HUB[f], { o: PAPER[4], s: PAPER[3] }, 1, 1);
    g.map(HUB[(f + 1) % 2], { o: PAPER[4], s: PAPER[3] }, W - 8, 1);
    return g;
  }
  (function () {
    const a = reelWin(0), b = reelWin(1), sheet = new Grid(a.w * 2, a.h);
    sheet.stamp(a, 0, 0).stamp(b, a.w, 0);
    reg('reels', sheet);
  })();
  /* the whole cassette (32×20), 2 frames side by side for playing */
  function cassette(f, blank) {
    const W = 32, H = 20, g = new Grid(W, H);
    g.rect(1, 0, W - 2, H, INK[0]); g.rect(0, 1, W, H - 2, INK[0]);
    g.rect(1, 1, W - 2, H - 2, INK[2]);
    g.hline(2, W - 3, 1, INK[4]); g.vline(1, 2, H - 3, INK[3]); g.hline(1, W - 2, H - 2, INK[1]); g.vline(W - 2, 2, H - 3, INK[1]);
    for (const [x, y] of [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3], [15, H - 3]]) g.set(x, y, CAMEL[4]);
    const lab = blank ? STONE : PAPER;
    g.rect(3, 3, W - 6, 12, lab[4]); g.hline(3, W - 4, 3, lab[5]); g.vline(W - 4, 4, 14, lab[3]); g.hline(3, W - 4, 14, lab[3]);
    if (!blank) [RED[4], LAMP[2], MUST[4]].forEach((c, i) => g.hline(3, W - 4, 4 + i, c));
    for (let x = 5; x < W - 6; x++) if (x % 6 !== 0) g.set(x, 13, blank ? lab[3] : NAVY[3]);
    g.stamp(reelWin(f, 18), 7, 6);
    g.hline(8, W - 9, H - 4, INK[3]); g.hline(7, W - 8, H - 3, INK[1]);
    return g;
  }
  (function () {
    for (const blank of [false, true]) {
      const a = cassette(0, blank), b = cassette(1, blank), sheet = new Grid(64, 20);
      sheet.stamp(a, 0, 0).stamp(b, 32, 0);
      reg(blank ? 'cassette-blank' : 'cassette', sheet);
    }
  })();

  /* leaves for the title: four little autumn leaves */
  (function () {
    const L = [
      [['.oo..', 'oaao.', 'oaaao', '.oaao', '...o.'], P.leaf_orange],
      [['...o.', '.oaao', 'oaaao', 'oaao.', '.o...'], P.leaf_red],
      [['..o..', '.oao.', 'oaaao', '.oao.', '..o..'], P.leaf_gold],
      [['.o...', 'oao..', '.oaao', '..oao', '...o.'], P.leaf_orange]
    ];
    L.forEach(([rows, r], i) => { const g = new Grid(5, 5); g.map(rows, { o: r[2], a: r[4] }); reg('leaf' + i, g); });
  })();

  /* ------------------------------------------------------------------ */
  /* stage-size overlays, drawn at the art's native 320×180: stepped,     */
  /* dithered light falloff instead of smooth blurs                       */
  function overlay(alphaAt) {
    const W = 320, H = 180, g = new Grid(W, H);
    g.each((x, y) => { const a = alphaAt(x, y); if (a > 0) g.set(x, y, A(INK[0], a)); });
    return g;
  }
  const steps = (t, n, x, y) => Math.min(n, Math.floor(clamp(t, 0, 1) * n + bayer(x, y))) / n;
  reg('vignette', overlay((x, y) => {
    const nx = (x + 0.5 - 160) / 160, ny = (y + 0.5 - 80) / 112;
    return 0.42 * steps((Math.sqrt(nx * nx * 0.9 + ny * ny) - 0.8) / 0.45, 3, x, y);
  }), 1);
  reg('veil', overlay((x, y) => 0.8 * steps(1 - (x - 40) / 120, 4, x, y)), 1);

  /* ------------------------------------------------------------------ */
  /* the title wordmark: blackletter, hand-shaded                         */
  /* letterforms from Jacquard 12 at its native 21 px grid, then lit like */
  /* the scene: warm paper face with a lit top edge, plum outline, a hard */
  /* ink drop shadow, and the Lamp's green on the right-hand edges.       */
  const WM1 = [
    '.###.###..##.#...#..........................#########...................................',
    '#############...##.................#..........########..................................',
    '...##..##..##...##................##.............#..##..................................',
    '...##..##..##...##................##..........##.#..##..................................',
    '.####..##..##...##.##......###...#####......####.#..##....###...##.###..##.###..##..##..',
    '...##..##..##...###.###...#..###..##..........##.#..##...#.###.####.##.####.##.#########',
    '.####..##..##...##..##...##..##...##........####.#..##..##..##...##......##......##..##.',
    '...##..##..##...##..##...##..##...##..........##.#..##..####.....##......##......##..##.',
    '...##..##..##...##..##...##..##...##..........##.#..##..##.......##......##......##..##.',
    '..#...###..##...##..##...##..##...##................#...##.......##......##......##.###.',
    '.#####.#####...####.##..########.#####.......#######...#####....####....####.....##..#..',
    '#..##...##......##..##....##.##....##.......#..####.....##.......##......##.....######..',
    '...................##..........................................................###......',
    '..................##...........................................................#...###..',
    '..................#.............................................................#####...'
  ];
  const WM2 = [
    '.##.#....#......................................',
    '#.##.#.####.....................................',
    '....#.##........................................',
    '....#.##..##...................................#',
    '..###.##.#.##.....###.....###...##..##......##.#',
    '....#.###..##....#.###...#.###.#########...####.',
    '..###.##...#....##..##..##..##...##..##...##...#',
    '....#.##.##.....####....####.....##..##...##.##.',
    '....#.##...#....##......##.......##..##...###.##',
    '........#..##...##......##.......##..##....#..##',
    '...#####...##..#####...#####....########..#####.',
    '..#.###.....##..##......##.....#.##..#...#..##..',
    '.................................##.............',
    '.................................##.............',
    '.................................#..............'
  ];
  UIPX.wordmark = function () {
    if (UIPX._wm) return UIPX._wm;
    const W = 94, H = 36, mask = new Grid(W, H), lines = [[WM1, 2, 1], [WM2, 24, 17]];
    const rowOf = new Grid(W, H); // row index within its line, for the vertical light
    for (const [rows, ox, oy] of lines) rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') { mask.set(ox + x, oy + y, 1); rowOf.set(ox + x, oy + y, y); } });
    const ink = (x, y) => mask.get(x, y) === 1;
    const frames = [0, 1].map((f) => {
      const g = new Grid(W, H);
      mask.each((x, y, v) => { if (v) for (const [dx, dy] of [[1, 2], [0, 2], [1, 1]]) if (!ink(x + dx, y + dy)) g.set(x + dx, y + dy, A(INK[0], 0.88)); });
      mask.each((x, y, v) => { if (!v && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ink(x + dx, y + dy))) g.set(x, y, PLUM[0]); });
      mask.each((x, y, v) => {
        if (!v) return;
        const up = ink(x, y - 1), down = ink(x, y + 1), right = ink(x + 1, y), row = rowOf.get(x, y);
        let c = PAPER[4];
        if (row >= 9 && bayer(x, y) < (row - 8) / 5) c = PAPER[3];
        if (!up) c = PAPER[5];
        else if (!down) c = PAPER[2];
        if (!right && up && row < 12) c = f === 0 ? LANT[4] : CREAM[3];
        g.set(x, y, c);
      });
      return g;
    });
    const sheet = new Grid(W, H * 2);
    sheet.stamp(frames[0], 0, 0).stamp(frames[1], 0, H);
    reg('wordmark', sheet);
    UIPX._wm = { w: W, h: H };
    return UIPX._wm;
  };
  UIPX.wordmark();

  /* ------------------------------------------------------------------ */
  /* icon stylesheet + interface scale                                   */
  const st = document.createElement('style');
  st.id = 'uipx-icons';
  st.textContent = iconCss.join('\n');
  (document.head || document.documentElement).appendChild(st);

  /* --px: one interface pixel in CSS px, snapped to whole device pixels.
   * Landscape: the stage's art pixel (stage width / 320). Stacked phone
   * layout: 2 (3 on wide tablets) for the reading panel, and a finger-sized
   * key for the HUD. Silkscreen stays on its 8 px grid (--t-lab). */
  UIPX.fit = function () {
    const frameEl = document.getElementById('frame'), stage = document.getElementById('stage');
    if (!frameEl || !stage) return;
    const dpr = window.devicePixelRatio || 1;
    const snap = (v) => Math.max(1, Math.round(v * dpr)) / dpr;
    const cs = getComputedStyle(frameEl);
    const stacked = cs.display === 'flex' && cs.flexDirection === 'column';
    const sw = stage.clientWidth || 1280;
    const px = stacked ? snap(clamp(Math.round(frameEl.clientWidth / 210), 2, 3)) : snap(Math.max(1.5, sw / 320));
    const hpx = stacked ? snap(Math.max(2.5, Math.min(3.5, sw / 140))) : px;
    const lab = 8 * Math.max(2, Math.round(px / 2));
    frameEl.style.setProperty('--px', px + 'px');
    frameEl.style.setProperty('--hpx', hpx + 'px');
    frameEl.style.setProperty('--spx', snap(sw / 320) + 'px');
    frameEl.style.setProperty('--t-lab', lab + 'px');
    frameEl.style.setProperty('--t-lab-l', lab + 8 + 'px');
    frameEl.classList.toggle('stacked', stacked);
    UIPX.px = px;
  };
  UIPX.fit();
  const onReady = () => { UIPX.fit(); window.addEventListener('resize', () => { clearTimeout(UIPX._rz); UIPX._rz = setTimeout(UIPX.fit, 60); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady); else onReady();
})();
