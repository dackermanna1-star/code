// 5x7 bitmap pixel font with cached colored atlases, outlines, shadows,
// and stylized banner text (gradient + bevel + outline) for arcade titles.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U;

  const G = {
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
    D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
    H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
    J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
    K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
    X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
    Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
    Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
    0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
    '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
    ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
    ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
    ';': ['00000', '01100', '01100', '00000', '01100', '00100', '01000'],
    '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
    '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
    '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
    '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
    '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
    "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
    '"': ['01010', '01010', '00000', '00000', '00000', '00000', '00000'],
    '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
    ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
    '[': ['01110', '01000', '01000', '01000', '01000', '01000', '01110'],
    ']': ['01110', '00010', '00010', '00010', '00010', '00010', '01110'],
    '%': ['11001', '11001', '00010', '00100', '01000', '10011', '10011'],
    '#': ['01010', '11111', '01010', '01010', '01010', '11111', '01010'],
    '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
    '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
    '*': ['00000', '10101', '01110', '11111', '01110', '10101', '00000'],
    '<': ['00010', '00100', '01000', '10000', '01000', '00100', '00010'],
    '>': ['01000', '00100', '00010', '00001', '00010', '00100', '01000'],
    '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
    '~': ['00000', '00000', '01000', '10101', '00010', '00000', '00000'],
    // special glyphs
    '∞': ['00000', '00000', '01010', '10101', '01010', '00000', '00000'], // infinity
    '↑': ['00100', '01110', '10101', '00100', '00100', '00100', '00100'], // up arrow
    '↓': ['00100', '00100', '00100', '00100', '10101', '01110', '00100'], // down arrow
    '←': ['00000', '00100', '01000', '11111', '01000', '00100', '00000'], // left
    '→': ['00000', '00100', '00010', '11111', '00010', '00100', '00000'], // right
    '↘': ['00000', '10000', '01000', '00101', '00011', '00111', '00000'], // down-right
    '↙': ['00000', '00001', '00010', '10100', '11000', '11100', '00000'], // down-left
    '↗': ['00000', '00111', '00011', '00101', '01000', '10000', '00000'], // up-right
    '↖': ['00000', '11100', '11000', '10100', '00010', '00001', '00000'], // up-left
    '●': ['00000', '01110', '11111', '11111', '11111', '01110', '00000'], // filled circle
    '○': ['00000', '01110', '10001', '10001', '10001', '01110', '00000'], // hollow circle
    '▶': ['01000', '01100', '01110', '01111', '01110', '01100', '01000'], // play
    '♥': ['00000', '01010', '11111', '11111', '01110', '00100', '00000'],
  };
  const GW = 5, GH = 7, ADV = 6;
  const chars = Object.keys(G);
  const index = {};
  chars.forEach((c, i) => (index[c] = i));

  const Font = (JJK.Font = { GW, GH, ADV });
  let atlas = null;
  const colored = new Map();

  function makeCanvas(w, h) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function buildAtlas() {
    atlas = makeCanvas(chars.length * GW, GH);
    if (!atlas) return;
    const x = atlas.getContext('2d');
    x.fillStyle = '#fff';
    chars.forEach((c, i) => {
      const rows = G[c];
      for (let y = 0; y < GH; y++) for (let k = 0; k < GW; k++) if (rows[y][k] === '1') x.fillRect(i * GW + k, y, 1, 1);
    });
  }

  function atlasFor(color) {
    if (!atlas) buildAtlas();
    if (!atlas) return null;
    let c = colored.get(color);
    if (c) return c;
    c = makeCanvas(atlas.width, atlas.height);
    const x = c.getContext('2d');
    x.drawImage(atlas, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    colored.set(color, c);
    return c;
  }

  Font.width = (text, scale = 1) => (String(text).length * ADV - 1) * scale;

  function raw(ctx, text, x, y, color, scale) {
    const a = atlasFor(color);
    if (!a) return;
    text = String(text).toUpperCase();
    let cx = x;
    for (let i = 0; i < text.length; i++) {
      const gi = index[text[i]];
      if (gi !== undefined) ctx.drawImage(a, gi * GW, 0, GW, GH, Math.round(cx), Math.round(y), GW * scale, GH * scale);
      cx += ADV * scale;
    }
  }

  // opts: color, scale, align ('left'|'center'|'right'), shadow (color), outline (color)
  Font.draw = function (ctx, text, x, y, opts = {}) {
    if (!ctx) return;
    const scale = opts.scale || 1;
    const w = Font.width(text, scale);
    if (opts.align === 'center') x -= Math.floor(w / 2);
    else if (opts.align === 'right') x -= w;
    x = Math.round(x);
    y = Math.round(y);
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    if (opts.outline) {
      const o = opts.outlineW || scale;
      for (let dy = -o; dy <= o; dy += o)
        for (let dx = -o; dx <= o; dx += o) if (dx || dy) raw(ctx, text, x + dx, y + dy, opts.outline, scale);
    }
    if (opts.shadow) raw(ctx, text, x + scale, y + scale, opts.shadow, scale);
    raw(ctx, text, x, y, opts.color || '#fff', scale);
    ctx.imageSmoothingEnabled = prevSmooth;
    return w;
  };

  // Stylized banner text cached as a canvas. opts: scale, top, mid, bot (gradient colors), outline, shadow, skew
  const bannerCache = new Map();
  Font.banner = function (text, opts = {}) {
    const key = text + JSON.stringify(opts);
    let c = bannerCache.get(key);
    if (c) return c;
    const s = opts.scale || 6;
    const pad = s * 2 + 4;
    const w = Font.width(text, s) + pad * 2, h = GH * s + pad * 2;
    c = makeCanvas(w + Math.abs(opts.skew || 0) * h, h);
    if (!c) return null;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    const skew = opts.skew || 0;
    // body
    const body = makeCanvas(c.width, h);
    const bx = body.getContext('2d');
    bx.imageSmoothingEnabled = false;
    raw(bx, text, pad + (skew > 0 ? skew * h : 0), pad, '#fff', s);
    // gradient fill
    bx.globalCompositeOperation = 'source-in';
    const g = bx.createLinearGradient(0, pad, 0, pad + GH * s);
    g.addColorStop(0, opts.top || '#fff6a0');
    g.addColorStop(0.45, opts.mid || '#ffd21a');
    g.addColorStop(0.55, opts.mid2 || opts.mid || '#f0a000');
    g.addColorStop(1, opts.bot || '#b04400');
    bx.fillStyle = g;
    bx.fillRect(0, 0, body.width, h);
    // bevel highlight: top row of each glyph pixel row
    bx.globalCompositeOperation = 'source-atop';
    bx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let r = 0; r < GH; r++) bx.fillRect(0, pad + r * s, body.width, Math.max(1, s >> 2));
    bx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let r = 0; r < GH; r++) bx.fillRect(0, pad + r * s + s - Math.max(1, s >> 2), body.width, Math.max(1, s >> 2));
    // silhouette for outline
    const sil = makeCanvas(c.width, h);
    const sx = sil.getContext('2d');
    sx.drawImage(body, 0, 0);
    sx.globalCompositeOperation = 'source-in';
    sx.fillStyle = opts.outline || '#1a0a00';
    sx.fillRect(0, 0, sil.width, h);
    const ow = opts.outlineW || Math.max(2, s >> 1);
    if (opts.shadow !== false) {
      x.globalAlpha = 0.7;
      x.drawImage(sil, ow + 2, ow + 3);
      x.globalAlpha = 1;
    }
    for (let dy = -ow; dy <= ow; dy++)
      for (let dx = -ow; dx <= ow; dx++) if (dx * dx + dy * dy <= ow * ow + 1) x.drawImage(sil, dx, dy);
    x.drawImage(body, 0, 0);
    // apply skew by drawing rows offset
    if (skew) {
      const out = makeCanvas(c.width, h);
      const ox = out.getContext('2d');
      for (let yy = 0; yy < h; yy++) ox.drawImage(c, 0, yy, c.width, 1, Math.round(-skew * yy), yy, c.width, 1);
      c = out;
    }
    bannerCache.set(key, c);
    return c;
  };
})();
