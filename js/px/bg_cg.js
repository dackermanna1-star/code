/* What Derry Keeps — full-screen illustrations (CGs), the title screen, the
 * Derry map and the black screen, in pixel art.
 *
 *   cg_tape        side_a: the cold open, Oct 9 1982 — June's recorder playing
 *                  in the dark by her window; five: the new Maxell XLII on
 *                  Gus's pillow, "#5 — FOR GUSSIE — PLAY AFTER"
 *   cg_polaroid    the faded Polaroid on the attic boards, in flashlight light
 *   cg_june_window June on the porch roof, through Gus's window
 *   cg_map         the hand-drawn Derry map for the Saturday free roam
 *   cg_lanterns    the Lantern Float, up close
 *   cg_standpipe   Quiet Night at the top of the hill: the Keeper's Lamp
 *   cg_lights_out  from Gus's window, the moment Larch Street goes dark
 *   title          Derry at night from the hill, the Standpipe's green lamp
 *   black          plain near-black
 *
 * Every image is 320×180, drawn in daylight colors; the time presets do the
 * ambient light. Ramps added here are prefixed cg_ so they can't collide with
 * other art files. Text in the art uses the small pixel fonts below. */
(function () {
  'use strict';
  const P = PX.P, E = PX.E, W = 320, H = 180;

  /* ------------------------------------------------------------------ */
  /* ramps (dark → light, hue-shifted)                                   */
  const R = PX.ramp;
  R('cg_void', ['#020203', '#05060a', '#090a10', '#0e1018', '#141722', '#1b1f2c']);
  /* map: parchment, sepia ink, watercolor washes */
  R('cg_parch', ['#3d2b22', '#6b4d36', '#9a7a54', '#c2a479', '#dcc49a', '#efe2bf']);
  R('cg_sepia', ['#1c1218', '#36211f', '#553427', '#764c33', '#976844', '#b5895c']);
  R('cg_mgreen', ['#25301f', '#3d4b2c', '#5a6a3b', '#7b8a4f', '#9fa96a', '#c1c58b']);
  R('cg_mblue', ['#1e2b3a', '#32485a', '#4c6778', '#6c8996', '#90aab0', '#b8cbc8']);
  R('cg_mrose', ['#34191c', '#582b2a', '#7e4236', '#a35e48', '#c2805f', '#dba67e']);
  R('cg_mslate', ['#232430', '#3a3c4a', '#565865', '#767783', '#9a99a0', '#bfbcba']);
  R('cg_mochre', ['#33240f', '#5a4118', '#836224', '#a98536', '#c9a752', '#e2c87c']);

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sh = (r, i) => r[clamp(Math.round(i), 0, r.length - 1)];

  /* ------------------------------------------------------------------ */
  /* smooth value noise (deterministic), for paper, fog, water            */
  const hash2 = (i, j, s) => {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  function noise2(x, y, cell, seed) {
    const gx = x / cell, gy = y / cell, i = Math.floor(gx), j = Math.floor(gy);
    const fx = smooth(gx - i), fy = smooth(gy - j);
    const a = hash2(i, j, seed), b = hash2(i + 1, j, seed), c = hash2(i, j + 1, seed), d = hash2(i + 1, j + 1, seed);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  const fbm = (x, y, seed, cell = 22) => noise2(x, y, cell, seed) * 0.62 + noise2(x, y, cell * 0.42, seed + 7) * 0.28 + noise2(x, y, cell * 0.18, seed + 13) * 0.1;
  /* quantize a continuous shade value with a short ordered-dither seam (solid
   * bands, dithered only near the band edges) */
  const qd = (v, x, y, sharp = 3) => { const f = Math.floor(v), t = clamp((v - f - 0.5) * sharp + 0.5, 0, 1); return f + (PX.bayer(x, y) < t ? 1 : 0); };

  /* ------------------------------------------------------------------ */
  /* small drawing helpers                                               */
  /* a template of characters → codes (like the rig's mouth templates) */
  function tpl(s, x, y, rows, legend) {
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
      const code = legend[rows[r][c]];
      if (code) s.px(x + c, y + r, code);
    }
  }
  /* round brush along a polyline */
  function brush(s, pts, r, c) {
    for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
      for (let i = 0; i <= n; i++) { const t = i / n; s.circle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, c); }
    }
  }
  /* point and tangent along a polyline at arc fraction t */
  function along(pts, t) {
    const L = [0]; for (let k = 1; k < pts.length; k++) L.push(L[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const d = t * L[L.length - 1];
    let k = 1; while (k < pts.length - 1 && L[k] < d) k++;
    const f = (d - L[k - 1]) / ((L[k] - L[k - 1]) || 1);
    const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
    return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, x1 - x0, y1 - y0];
  }
  /* shift shades by d inside the box [x0..x1]×[y0..y1] where test(x, y) holds,
   * optionally on a dither fraction of pixels — Surf.shift without a full-frame mask */
  function shiftIn(s, x0, y0, x1, y1, d, test, dither) {
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(s.w - 1, Math.ceil(x1)); y1 = Math.min(s.h - 1, Math.ceil(y1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (dither !== undefined && PX.bayer(x, y) >= dither) continue;
      const i = y * s.w + x, v = s.d[i];
      if (!v || (v & 0x8000) || (s.mask && !s.mask[i])) continue;
      if (test && !test(x, y)) continue;
      s.d[i] = PX.sh(v, d);
    }
  }
  const shiftR = (s, x, y, w, h, d, dither) => shiftIn(s, x, y, x + w - 1, y + h - 1, d, null, dither);
  /* mark every pixel drawn so far as emissive (a fully self-lit image) */
  function bake(s) { for (let i = 0; i < s.d.length; i++) if (s.d[i]) s.d[i] |= PX.EMIT; }

  /* ------------------------------------------------------------------ */
  /* pixel fonts                                                         */
  /* HAND: June's round, bossy handwriting. Caps are 6 rows; lowercase sits
   * on the same baseline (x-height rows 2–5, descenders rows 6–7). */
  const HAND = {
    A: '.##./#..#/#..#/####/#..#/#..#', B: '###./#..#/###./#..#/#..#/###.', C: '.###/#.../#.../#.../#.../.###',
    D: '###./#..#/#..#/#..#/#..#/###.', E: '####/#.../###./#.../#.../####', F: '####/#.../###./#.../#.../#...',
    G: '.###./#..../#..../#..##/#...#/.###.', H: '#..#/#..#/####/#..#/#..#/#..#', I: '###/.#./.#./.#./.#./###',
    J: '..##/...#/...#/...#/#..#/.##.', K: '#..#/#.#./##../#.#./#..#/#..#', L: '#.../#.../#.../#.../#.../####',
    M: '#...#/##.##/#.#.#/#...#/#...#/#...#', N: '#...#/##..#/#.#.#/#..##/#...#/#...#', O: '.###./#...#/#...#/#...#/#...#/.###.',
    P: '###./#..#/#..#/###./#.../#...', Q: '.###./#...#/#...#/#.#.#/#..#./.##.#', R: '###./#..#/#..#/###./#.#./#..#',
    S: '.###/#.../.##./...#/...#/###.', T: '#####/..#../..#../..#../..#../..#..', U: '#..#/#..#/#..#/#..#/#..#/.##.',
    V: '#...#/#...#/#...#/.#.#./.#.#./..#..', W: '#...#/#...#/#.#.#/#.#.#/##.##/#...#', X: '#...#/.#.#./..#../..#../.#.#./#...#',
    Y: '#...#/.#.#./..#../..#../..#../..#..', Z: '####/...#/..#./.#../#.../####',
    0: '.##./#..#/#..#/#..#/#..#/.##.', 1: '.#/##/.#/.#/.#/.#', 2: '.##./#..#/...#/..#./.#../####', 3: '###./...#/.##./...#/...#/###.',
    4: '#..#/#..#/####/...#/...#/...#', 5: '####/#.../###./...#/...#/###.', 6: '.##./#.../###./#..#/#..#/.##.',
    7: '####/...#/..#./..#./.#../.#..', 8: '.##./#..#/.##./#..#/#..#/.##.', 9: '.##./#..#/#..#/.###/...#/.##.',
    '#': '.#.#./#####/.#.#./#####/.#.#.', '—': '...../...../...../#####', '-': '.../.../.../###', '/': '...#/...#/..#./.#../#.../#...',
    '!': '#/#/#/#/./#', "'": '#/#', '.': './././././#', ',': './././././#/#', '+': '.../.#./.#./###/.#./.#.', '·': './././#',
    a: '..../..../.###/#..#/#..#/.###', e: '..../..../.##./####/#.../.###', i: '#/./#/#/#/#', l: '#/#/#/#/#/#',
    s: '.../.../.##/#../..#/##.', u: '..../..../#..#/#..#/#..#/.###', y: '..../..../#..#/#..#/#..#/.###/...#/.##.'
  };
  /* TINY: a 3×5 print face for labels, counters, the J-card */
  const TINY = {
    A: '.#./#.#/###/#.#/#.#', B: '##./#.#/##./#.#/##.', C: '.##/#../#../#../.##', D: '##./#.#/#.#/#.#/##.', E: '###/#../##./#../###',
    F: '###/#../##./#../#..', G: '.##/#../#.#/#.#/.##', H: '#.#/#.#/###/#.#/#.#', I: '###/.#./.#./.#./###', J: '..#/..#/..#/#.#/.#.',
    K: '#.#/#.#/##./#.#/#.#', L: '#../#../#../#../###', M: '#.#/###/###/#.#/#.#', N: '##./#.#/#.#/#.#/#.#', O: '.#./#.#/#.#/#.#/.#.',
    P: '##./#.#/##./#../#..', Q: '.#./#.#/#.#/###/.##', R: '##./#.#/##./#.#/#.#', S: '.##/#../.#./..#/##.', T: '###/.#./.#./.#./.#.',
    U: '#.#/#.#/#.#/#.#/###', V: '#.#/#.#/#.#/#.#/.#.', W: '#.#/#.#/###/###/#.#', X: '#.#/#.#/.#./#.#/#.#', Y: '#.#/#.#/.#./.#./.#.',
    Z: '###/..#/.#./#../###', 0: '###/#.#/#.#/#.#/###', 1: '.#./##./.#./.#./###', 2: '##./..#/.#./#../###', 3: '##./..#/.#./..#/##.',
    4: '#.#/#.#/###/..#/..#', 5: '###/#../##./..#/##.', 6: '.##/#../###/#.#/###', 7: '###/..#/.#./.#./.#.', 8: '###/#.#/###/#.#/###',
    9: '###/#.#/###/..#/##.', '©': '###/#.#/###', '-': '.../.../###', '.': './././././#'
  };
  const glyph = (font, ch) => {
    const g = font[ch];
    if (!g) return null;
    if (typeof g === 'string') font[ch] = { rows: g.split('/') };
    return font[ch];
  };
  /* write a string; returns its width. o: font, sp (letter gap), space,
   * slope (rise per px), wobble (chance of a ±1 baseline jump, needs rng),
   * slant (shear per row), bold (marker strokes) */
  function write(s, x, y, str, col, o = {}) {
    const font = o.font || HAND, sp = o.sp === undefined ? 1 : o.sp, space = o.space || (font === TINY ? 2 : 3);
    let cx = x;
    for (const ch of str) {
      if (ch === ' ') { cx += space; continue; }
      const g = glyph(font, ch);
      if (!g) { cx += space; continue; }
      const rows = g.rows, w = rows.reduce((m, r) => Math.max(m, r.length), 0);
      let dy = Math.round((o.slope || 0) * (cx - x));
      if (o.rng && o.wobble && o.rng() < o.wobble) dy += o.rng() < 0.5 ? -1 : 1;
      if (col) for (let r = 0; r < rows.length; r++) {
        const shear = o.slant ? Math.round((5 - r) * o.slant) : 0;
        for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === '#') {
          s.px(cx + c + shear, y + r + dy, col);
          if (o.bold) s.px(cx + c + shear + 1, y + r + dy, col);
        }
      }
      cx += w + sp + (o.bold ? 1 : 0);
    }
    return cx - x - sp;
  }
  const measure = (str, o = {}) => write(null, 0, 0, str, 0, o);

  /* ================================================================== */
  /* black                                                               */
  PX.cg('black', {
    times: ['night'],
    draw(s) { s.fill(E(P.cg_void[1])); }
  });

  /* ================================================================== */
  /* cg_map — the Derry map. Landmarks sit at the UI's pin positions     */
  /* (percent of the frame): the pin's dot lands on each icon's roof.    */
  const PINS = {
    diner: [55, 47], records: [61, 40], library: [44, 34], barrens: [24, 66], standpipe: [79, 24],
    park: [38, 58], home: [72, 70], school: [28, 30], teddy: [86, 56]
  };
  const pin = (k) => [Math.round(PINS[k][0] * W / 100), Math.round(PINS[k][1] * H / 100)];

  PX.cg('cg_map', {
    times: ['day'],
    draw(s, o) { drawMap(s, o); }
  });

  /* a map icon on its own small surface: fills first, then a sepia outline */
  function icon(w, h, fn) { const t = new PX.Surf(w, h); fn(t); t.outline({ code: P.cg_sepia[1] }); return t; }
  /* stamp an icon with a one-pixel shadow to the lower right */
  function put(s, t, x, y) {
    x = Math.round(x); y = Math.round(y);
    for (let yy = 0; yy < t.h; yy++) for (let xx = 0; xx < t.w; xx++) if (t.d[yy * t.w + xx]) { const v = s.get(x + xx + 1, y + yy + 1); if (v) s.px(x + xx + 1, y + yy + 1, PX.sh(v, -1)); }
    s.stamp(t, x, y);
  }
  const HOUSE_FRONT = ['..ooo..', '.oRRro.', 'oRRRrro', 'owwwwso', 'okkwwso', 'owwwdso', 'ooooooo'];
  const HOUSE_SIDE = ['..o......', '.oCoooo..', '.oRRRRRo.', 'oRRRRRRro', 'owkkwkkso', 'owwwwwdso', 'ooooooooo'];
  const SHOP = ['oooooo', 'oFFFfo', 'owwwso', 'okkkso', 'owdwso', 'oooooo'];
  const TREE = ['.ooo.', 'oLLmo', 'oLmmo', 'ommdo', '.ooo.', '..t..'];
  const TREE_S = ['.oo.', 'oLmo', 'omdo', '.oo.', '.t..'];
  const PINE = ['..o..', '.oLo.', '.oLdo', 'oLmdo', 'ooooo', '..t..'];

  function drawMap(s, o) {
    const rng = o.rng, pa = P.cg_parch, ink = P.cg_sepia, G = P.cg_mgreen, WB = P.cg_mblue, SL = P.cg_mslate, RO = P.cg_mrose, OC = P.cg_mochre;
    const [scx, scy] = pin('school'), [lbx, lby] = pin('library'), [rcx, rcy] = pin('records'), [dnx, dny] = pin('diner');
    const [pkx, pky] = pin('park'), [brx, bry] = pin('barrens'), [spx, spy] = pin('standpipe'), [hmx, hmy] = pin('home'), [tdx, tdy] = pin('teddy');
    /* the UI writes "Derry" and a subtitle in the top-left corner: keep it bare paper */
    const header = (x, y) => x < 118 && y < 33;

    /* ---- paper: mottled, browner toward the edges, a few age spots ---- */
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = fbm(x, y, 11, 48);
      const e = Math.min(Math.min(x, W - 1 - x) / 16, Math.min(y, H - 1 - y) / 10, 1);
      s.px(x, y, sh(pa, qd(4.2 + (n - 0.5) * 1.4 - (1 - e) * (1 - e) * 2.6, x, y, 7)));
    }
    for (let i = 0; i < 22; i++) {
      const x = rng.int(10, W - 11), y = rng.int(10, H - 11);
      s.px(x, y, pa[3]); if (rng() < 0.7) s.px(x + 1, y, pa[3]); if (rng() < 0.5) s.px(x, y + 1, pa[3]);
    }

    /* ---- fields to the west and southeast: washes with furrows ---- */
    const field = (x, y, w, h, r, horiz) => {
      s.rect(x, y, w, h, r[4]);
      for (let k = 1; k < (horiz ? h : w); k += 2) horiz ? s.hline(x, x + w - 1, y + k, r[3]) : s.vline(x + k, y, y + h - 1, r[3]);
      s.hline(x, x + w - 1, y, r[5]); s.vline(x, y, y + h - 1, r[5]);
      s.hline(x, x + w - 1, y + h, ink[4]); s.vline(x + w, y, y + h, ink[4]);
    };
    field(14, 58, 20, 11, OC, true); field(36, 60, 15, 13, G, false); field(14, 72, 19, 12, G, true); field(36, 76, 14, 9, OC, false);
    field(284, 138, 18, 10, OC, false); field(304, 136, 10, 12, G, true);

    /* ---- woods: dense canopy masses with an ink edge ---- */
    const canopy = (x, y, r) => tpl(s, x - 2, y - 2, ['.LLm.', 'LLmmd', 'mmmdd', '.ddd.'], { L: r[4], m: r[3], d: r[2] });
    const woods = (inside, x0, y0, x1, y1, mix) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x, y)) s.px(x, y, G[1]);
      const pts = [];
      for (let y = y0; y <= y1 + 2; y += 3) for (let x = x0 + ((y / 3) & 1 ? 2 : 0); x <= x1; x += 4) {
        const jx = x + rng.int(-1, 1), jy = y + rng.int(-1, 0);
        if (inside(jx, jy)) pts.push([jx, jy, rng() < mix ? OC : G]);
      }
      for (const [x, y, r] of pts) canopy(x, y, r);
      // ink edge round the mass
      const isW = (x, y) => { const id = (s.get(x, y) & 0x7ff0) >> 4; return id === G.id || id === OC.id; };
      const edge = [];
      for (let y = y0 - 2; y <= y1 + 2; y++) for (let x = x0 - 2; x <= x1 + 2; x++) if (isW(x, y) && (!isW(x - 1, y) || !isW(x + 1, y) || !isW(x, y - 1) || !isW(x, y + 1))) edge.push([x, y]);
      for (const [x, y] of edge) s.px(x, y, ink[2]);
    };
    // the Barrens: low scrubby woods round the stream, southwest of downtown
    const barrens = (x, y) => {
      const d = Math.hypot((x - 60) / 58, (y - 132) / 30) + (fbm(x, y, 5, 14) - 0.5) * 0.5;
      if (d > 1) return false;
      if (x > 104 && y < 116) return false;                 // the park
      if (Math.abs(x - brx) < 7 && y > bry - 2 && y < bry + 9) return false;   // the clearing at the log bridge
      return y < 166;
    };
    woods(barrens, 2, 98, 120, 166, 0.22);
    // a band of woods along the north edge (clear of the header)
    woods((x, y) => !header(x, y) && x > 120 && x < 284 && y < 9 + 4 * fbm(x, 0, 3, 9), 120, 0, 284, 14, 0.15);
    // woods down the east edge
    woods((x, y) => x > 302 + 6 * (fbm(0, y, 4, 12) - 0.5) && y > 34 && y < 86, 290, 34, 319, 86, 0.2);

    /* ---- the Standpipe hill, drawn in profile like an old survey map ---- */
    const hillTop = spy + 7, hx = spx, base = 74, hw = 46;
    const ridgeY = (x) => { const u = (x - hx) / hw; return Math.abs(u) >= 1 ? base : base - (base - hillTop) * Math.pow(1 - u * u, 0.62) + Math.sin(x * 0.4) * 0.5; };
    for (let x = hx - hw; x <= hx + hw; x++) {
      const yt = Math.round(ridgeY(x));
      for (let y = yt; y <= base + 1; y++) {
        const u = (x - hx) / hw, depth = (y - yt) / (base - yt + 1);
        const v = 3.8 - u * 1.3 - depth * 0.3 + (fbm(x, y, 9, 8) - 0.5) * 0.4;
        s.px(x, y, sh(fbm(x, y, 21, 6) > 0.7 ? OC : G, qd(v, x, y, 5)));
      }
      s.px(x, yt, ink[x < hx - 10 ? 3 : 2]);
    }
    // hachures down the shaded flank
    for (let x = hx + 4; x < hx + hw - 2; x += 3) { const yt = ridgeY(x); s.line(x, yt + 2, x + 1, yt + 2 + Math.min(8, (base - yt) * 0.6), ink[4]); }
    for (let x = hx - hw + 6; x < hx - 6; x += 5) { const yt = ridgeY(x); s.line(x, yt + 3, x - 1, yt + 3 + Math.min(5, (base - yt) * 0.4), G[3]); }
    // pines on the flanks, a path up, Mount Hope cemetery on the east slope
    const pine = (x, y) => tpl(s, x - 2, y - 5, PINE, { o: ink[1], L: G[3], m: G[2], d: G[1], t: ink[2] });
    for (const [px, dy] of [[hx - 40, 2], [hx - 34, 0], [hx - 28, 3], [hx - 37, 6], [hx + 26, 2], [hx + 31, 0], [hx + 36, 3], [hx + 41, 5], [hx + 21, 6], [hx - 22, 8], [hx + 14, 9]]) { const yt = ridgeY(px); pine(px, Math.round(yt + 6 + dy)); }
    const path = [[hx - 9, base + 1], [hx - 14, base - 6], [hx - 6, base - 11], [hx - 12, base - 16], [hx - 3, hillTop + 4]];
    for (let k = 0; k < 40; k++) { if (k % 3 === 2) continue; const [x, y] = along(path, k / 40); s.px(x, y, pa[5]); }
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4 - (r & 1); c++) {
      const gx = hx + 12 + c * 4 + (r & 1) * 2, gy = hillTop + 10 + r * 4 + c;
      s.px(gx, gy - 1, SL[4]); s.px(gx, gy, SL[3]); s.px(gx + 1, gy, ink[3]);
    }
    s.px(hx + 11, hillTop + 8, SL[4]); s.vline(hx + 11, hillTop + 7, hillTop + 10, SL[3]); s.hline(hx + 10, hx + 12, hillTop + 8, SL[3]);

    /* ---- water: the Kenduskeag through the Barrens, then the canal downtown ---- */
    const STREAM = [[-4, 141], [8, 138], [20, 140], [32, 136], [44, 131], [56, 128], [66, 125], [brx, bry + 5], [88, 125], [98, 122], [108, 120], [118, 120], [128, 118], [136, 113], [142, 107], [148, 103]];
    const CANAL = [[148, 103], [214, 103], [252, 114], [324, 121]];
    brush(s, CANAL, 3.6, SL[3]);
    brush(s, STREAM, 2.7, WB[3]);
    brush(s, CANAL, 2.5, WB[3]);
    s.edge([WB[3]], WB[1]);
    s.edge([SL[3]], SL[1]);
    for (let i = 0; i < 24; i++) { const [x, y] = along(STREAM, rng()); if (s.get(x - 1, y) === WB[3]) s.hline(Math.round(x) - 1, Math.round(x), Math.round(y), WB[4]); }
    for (let x = 152; x < 320; x += 6) { const [, y] = along(CANAL, (x - 148) / 176); s.hline(x, x + 2, Math.round(y), WB[4]); }

    /* ---- roads: double ink lines with the paper between ---- */
    const road = (pts, wide) => { brush(s, pts, wide ? 1.9 : 1.4, ink[3]); brush(s, pts, wide ? 0.9 : 0.5, pa[5]); };
    const MAIN = [[108, 82], [150, 81], [222, 81], [244, 77], [268, 75], [324, 73]];
    const CENTER = [[163, 30], [163, 140], [168, 184]];
    const WITCHAM = [[163, 60], [134, 52], [104, 45], [64, 40], [-4, 37]];
    const KANSAS = [[150, 81], [126, 87], [104, 93], [90, 103], [64, 111], [34, 117], [-4, 121]];
    const JACKSON = [[163, 93], [214, 93], [242, 94], [324, 92]];
    const LARCH = [[163, 134], [204, 134], [262, 135], [324, 136]];
    const NORTH = [[163, 30], [168, 14], [172, -4]];
    const SCHOOLRD = [[98, 45], [100, 34], [106, 18], [108, -4]];
    const CANALST = [[124, 97], [148, 98], [214, 98]];
    const ELM = [[163, 48], [200, 47], [236, 48]];
    const GROVE = [[163, 120], [200, 121], [232, 123]];
    const PARKSIDE = [[124, 128], [146, 127], [163, 126]];
    const SOUTH = [[163, 156], [220, 157], [300, 157]];
    for (const r of [WITCHAM, KANSAS, JACKSON, LARCH, NORTH, SCHOOLRD, CANALST, ELM, GROVE, PARKSIDE, SOUTH]) road(r, false);
    road(MAIN, true); road(CENTER, true);
    // bridges: Center Street (stone) and a footbridge toward Larch Street
    s.rect(160, 98, 7, 11, SL[4]); s.vline(160, 98, 108, SL[1]); s.vline(166, 98, 108, SL[1]); s.rect(161, 99, 5, 9, pa[5]);
    s.rect(244, 108, 3, 10, P.cg_mochre[3]); s.vline(243, 108, 117, ink[2]); s.vline(247, 108, 117, ink[2]);

    /* ---- the park: lawn, paths, trees, the bandstand ---- */
    const px0 = pkx - 13, py0 = pky - 8;
    s.rect(px0, py0, 27, 18, G[4]);
    for (let y = py0; y < py0 + 18; y++) for (let x = px0; x < px0 + 27; x++) if ((x * 3 + y * 5) % 11 === 0) s.px(x, y, G[3]);
    s.hline(px0, px0 + 26, py0, G[5]);
    for (let x = px0 - 1; x <= px0 + 27; x++) { s.px(x, py0 - 1, ink[3]); s.px(x, py0 + 18, ink[3]); }
    for (let y = py0; y < py0 + 18; y++) { s.px(px0 - 1, y, ink[3]); s.px(px0 + 27, y, ink[3]); }
    s.line(px0, py0, px0 + 26, py0 + 17, pa[5]); s.line(px0 + 26, py0, px0, py0 + 17, pa[5]);
    s.circle(pkx + 0.5, pky + 5.5, 3.2, pa[5]);
    for (const [tx, ty] of [[px0 + 3, py0 + 5], [px0 + 23, py0 + 5], [px0 + 4, py0 + 16], [px0 + 22, py0 + 16]]) tpl(s, tx - 2, ty - 4, TREE_S, { o: ink[1], L: G[4], m: G[3], d: G[2], t: ink[2] });

    /* ---- downtown: rows of brick shopfronts along the streets ---- */
    const shopRow = (x0, x1, yb, hmin, hmax, faces) => {
      const t = icon(x1 - x0 + 2, hmax + 2, (t) => {
        let x = 1;
        while (x < x1 - x0 + 1) {
          const bw = Math.min(x1 - x0 + 1 - x, rng.int(4, 7)), bh = rng.int(hmin, hmax);
          const fr = faces[rng.int(0, faces.length - 1)], rr = rng() < 0.6 ? SL : RO, top = hmax + 1 - bh;
          t.rect(x, top, bw, 2, rr[3]); t.hline(x, x + bw - 1, top, rr[4]);
          t.rect(x, top + 2, bw, bh - 2, fr[4]); t.vline(x + bw - 1, top + 2, hmax, fr[3]);
          for (let wy = top + 3; wy < hmax - 1; wy += 2) for (let wx = x + 1; wx < x + bw - 1; wx += 2) t.px(wx, wy, ink[3]);
          t.hline(x, x + bw - 2, hmax, fr[2]);
          x += bw;
        }
      });
      put(s, t, x0 - 1, yb - hmax - 1);
    };
    const brick = [RO, RO, OC, pa, SL];
    shopRow(170, 187, 70, 4, 6, brick);           // behind Main Street, east of Center
    shopRow(204, 221, 70, 4, 6, brick);
    shopRow(126, 158, 78, 5, 7, brick);           // Main Street, north side
    shopRow(167, 187, 78, 6, 8, brick);
    shopRow(203, 223, 78, 5, 8, brick);
    shopRow(126, 158, 95, 5, 8, brick);           // Main Street, south side
    shopRow(188, 213, 95, 5, 7, brick);
    // the Aladdin's marquee on the north side of Main
    s.rect(171, 74, 7, 2, P.mustard[4]); for (let x = 171; x < 178; x += 2) s.px(x, 74, pa[5]); s.hline(171, 177, 76, ink[2]);
    // two churches: white clapboard and a steeple
    const church = (x, y) => put(s, icon(13, 17, (t) => {
      t.poly([[1, 11], [7, 6], [13, 11]], SL[3]); t.line(2, 10, 6, 6, SL[4]); t.rect(2, 11, 10, 6, pa[5]); t.vline(11, 11, 16, pa[3]);
      t.px(3, 13, WB[3]); t.px(3, 14, WB[2]); t.px(10, 13, WB[3]); t.px(10, 14, WB[2]);
      t.rect(5, 6, 4, 11, pa[5]); t.vline(8, 6, 16, pa[3]); t.rect(6, 8, 2, 2, ink[2]); t.rect(6, 14, 2, 3, ink[2]);
      t.poly([[4.5, 7], [7, -0.5], [9.5, 7]], SL[2]); t.line(5, 6, 6, 1, SL[4]);
    }), x, y);
    church(144, 27); church(194, 112);

    /* ---- houses along the residential streets ---- */
    const walls = [pa, pa, P.cg_mochre, P.cg_mblue, P.cg_mrose, G], roofsR = [SL, SL, RO, P.cg_sepia];
    const houseAt = (x, y, side) => {
      const wr = walls[rng.int(0, walls.length - 1)], rr = roofsR[rng.int(0, roofsR.length - 1)];
      const T = side ? HOUSE_SIDE : HOUSE_FRONT;
      for (let r = 0; r < T.length; r++) for (let c = 0; c < T[r].length; c++) if (T[r][c] !== '.') { const v = s.get(x + c + 1, y + r + 1); if (v) s.px(x + c + 1, y + r + 1, PX.sh(v, -1)); }
      tpl(s, x, y, T, { o: ink[1], R: rr[4], r: rr[2], w: wr[5], s: wr[3], k: ink[3], d: ink[2], C: RO[2] });
    };
    const rowOfHouses = (pts, t0, t1, n, dy, avoid) => {
      for (let i = 0; i < n; i++) {
        const [x, y] = along(pts, t0 + (t1 - t0) * (i + rng.range(0.2, 0.8)) / n);
        const hx2 = Math.round(x) - 4, hy2 = Math.round(y + dy);
        if (avoid && avoid(hx2, hy2)) continue;
        if (header(hx2, hy2) || header(hx2 + 9, hy2)) continue;
        houseAt(hx2, hy2, rng() < 0.5);
      }
    };
    rowOfHouses(WITCHAM, 0.45, 0.98, 6, -9, (x) => x > scx - 18 && x < scx + 16);
    rowOfHouses(WITCHAM, 0.28, 0.95, 5, 3, (x) => x > scx - 34 && x < scx + 16);
    rowOfHouses(JACKSON, 0.42, 0.98, 6, -9, (x) => Math.abs(x - tdx) < 14 || (x > 236 && x < 252));
    rowOfHouses(JACKSON, 0.05, 0.3, 3, 3);
    rowOfHouses(LARCH, 0.25, 0.98, 7, -8, (x) => Math.abs(x + 4 - hmx) < 13);
    rowOfHouses(LARCH, 0.12, 0.95, 7, 3);
    rowOfHouses([[163, 112], [163, 160]], 0.05, 0.95, 4, 0, () => false);
    rowOfHouses(NORTH, 0.1, 0.7, 2, 0);
    rowOfHouses(ELM, 0.1, 0.95, 5, -9);
    rowOfHouses(ELM, 0.1, 0.95, 5, 3);
    rowOfHouses(GROVE, 0.1, 0.95, 4, -8, (x) => x > 186 && x < 204);
    rowOfHouses(PARKSIDE, 0.05, 0.9, 3, 3);
    rowOfHouses(SOUTH, 0.05, 0.95, 8, -8);
    rowOfHouses(CENTER, 0.02, 0.18, 2, 0);

    /* ---- landmarks (pin position = the icon's roofline) ---- */
    // Derry High: brick, a white cupola, the football field beside it
    put(s, icon(29, 15, (t) => {
      t.poly([[1, 6], [4, 3], [25, 3], [28, 6]], SL[3]); t.hline(4, 25, 3, SL[4]);
      t.rect(1, 6, 28, 8, RO[3]); t.hline(1, 28, 6, RO[2]);
      for (let x = 3; x < 27; x += 2) { if (x > 11 && x < 18) continue; t.px(x, 8, pa[5]); t.px(x, 11, pa[5]); }
      t.rect(11, 2, 7, 12, RO[4]); t.poly([[10, 3], [14.5, -0.5], [19, 3]], pa[5]); t.rect(13, 10, 3, 4, ink[2]);
      t.px(12, 6, pa[5]); t.px(16, 6, pa[5]); t.px(14, 2, pa[4]);
    }), scx - 14, scy - 1);
    s.rect(scx - 36, scy + 2, 17, 10, G[4]); s.hline(scx - 36, scx - 20, scy + 2, G[5]);
    for (let x = scx - 34; x < scx - 20; x += 3) s.vline(x, scy + 3, scy + 10, pa[5]);
    for (let x = scx - 37; x <= scx - 19; x++) { s.px(x, scy + 1, ink[3]); s.px(x, scy + 12, ink[3]); }
    s.vline(scx - 37, scy + 1, scy + 12, ink[3]); s.vline(scx - 19, scy + 1, scy + 12, ink[3]);
    // the library: columns and steps, a glass corridor to the children's wing
    put(s, icon(25, 12, (t) => {
      t.poly([[0, 4], [7.5, 0], [15, 4]], SL[4]); t.hline(1, 14, 4, SL[2]);
      t.rect(1, 5, 14, 5, pa[5]); for (let x = 2; x < 15; x += 3) t.vline(x, 5, 9, SL[3]);
      t.rect(0, 10, 16, 2, SL[4]);
      t.rect(15, 6, 4, 3, WB[5]); t.hline(15, 18, 6, WB[4]);
      t.rect(19, 3, 6, 8, pa[4]); t.hline(19, 24, 3, SL[3]); t.px(21, 6, WB[3]); t.px(23, 6, WB[3]); t.rect(21, 8, 2, 3, ink[2]);
    }), lbx - 9, lby - 1);
    // Low Tide Records: a narrow shop, striped awning, a record in the window
    put(s, icon(13, 9, (t) => {
      t.rect(0, 0, 13, 9, pa[4]); t.rect(0, 0, 13, 2, SL[3]); t.hline(0, 12, 0, SL[4]);
      for (let x = 0; x < 13; x++) { t.px(x, 3, x % 2 ? P.teal[4] : pa[5]); t.px(x, 4, x % 2 ? P.teal[3] : pa[4]); }
      t.rect(1, 5, 7, 4, WB[2]); t.circle(4.5, 7, 2.1, P.black_cloth[2]); t.px(4, 6, P.black_cloth[4]); t.px(4, 7, P.neon[3]);
      t.rect(9, 5, 3, 4, ink[2]);
    }), rcx - 6, rcy);
    // Dot's Diner: a chrome railcar with a red band and a sign
    put(s, icon(19, 9, (t) => {
      t.rect(1, 1, 17, 7, P.chrome[3]); t.hline(1, 17, 1, P.chrome[4]);
      for (let x = 2; x < 17; x += 2) t.px(x, 3, WB[4]);
      t.hline(1, 17, 5, P.red[3]); t.hline(1, 17, 6, P.chrome[2]);
      t.px(0, 2, 0); t.px(18, 2, 0);
      t.rect(8, 5, 3, 3, ink[2]);
    }), dnx - 9, dny);
    s.vline(dnx + 11, dny - 3, dny + 6, ink[2]); s.rect(dnx + 10, dny - 4, 3, 2, P.red[3]);
    // Paul Bunyan in Bassey Park
    tpl(s, pkx - 2, pky, ['..o..', '.oso.', 'opppo', 'opppo', '.obo.', '.obo.', 'oSSSo', 'ooooo'], { o: ink[1], s: P.skin_warm[4], p: P.plaid_r[3], b: P.denim[3], S: SL[4] });
    s.line(pkx + 2, pky + 1, pkx + 4, pky - 2, ink[2]); s.px(pkx + 4, pky - 2, SL[4]); s.px(pkx + 5, pky - 2, SL[3]);
    // the Barrens: a fallen log across the stream in a clearing
    s.rect(brx - 5, bry + 4, 11, 3, P.bark[3]); s.hline(brx - 5, brx + 5, bry + 4, P.bark[4]); s.hline(brx - 5, brx + 5, bry + 6, P.bark[1]);
    s.px(brx - 6, bry + 5, P.bark[2]); s.px(brx + 6, bry + 5, P.bark[2]); s.px(brx - 1, bry + 5, P.bark[2]);
    s.px(brx - 7, bry + 2, SL[4]); s.px(brx - 6, bry + 2, SL[3]); s.px(brx + 7, bry + 8, SL[4]);
    // the Standpipe: a broken stone ring on the hilltop
    put(s, icon(17, 11, (t) => {
      t.ellipse(8.5, 7.5, 8.5, 3.2, SL[3]);
      t.rect(0, 3, 17, 5, SL[4]);
      for (let x = 0; x < 17; x++) { const lit = x < 6 ? 5 : x < 12 ? 4 : 3; t.vline(x, 3, 7, SL[lit]); }
      t.ellipse(8.5, 3.2, 7.5, 2.2, SL[2]); t.hline(4, 12, 4, SL[1]);
      for (let x = 1; x < 16; x++) { const yy = 5 + ((x >> 1) & 1) * 2; t.px(x, yy, SL[2]); }
      t.rect(10, 0, 5, 4, 0); t.px(10, 4, SL[3]); t.px(11, 5, SL[3]); t.px(13, 4, SL[2]); t.px(14, 4, SL[2]);
      t.px(3, 0, SL[4]); t.px(4, 0, SL[5]); t.px(2, 1, SL[4]); t.px(7, 1, SL[4]); t.px(16, 2, 0); t.px(16, 3, 0);
    }), spx - 8, spy);
    s.px(spx + 9, spy + 9, SL[4]); s.px(spx + 10, spy + 9, SL[2]); s.px(spx - 10, spy + 9, SL[4]); s.px(spx + 12, spy + 10, SL[3]);
    // home: the green house with the red door, the maple beside it
    put(s, icon(11, 9, (t) => {
      t.poly([[0, 4], [5.5, -0.5], [11, 4]], SL[2]); t.line(1, 3, 5, 0, SL[4]);
      t.rect(1, 4, 9, 5, P.house_green[4]); t.vline(9, 4, 8, P.house_green[3]); t.hline(1, 9, 4, P.trim[4]);
      t.rect(5, 6, 2, 3, P.red[3]); t.px(2, 6, P.trim[4]); t.px(3, 6, WB[2]);
    }), hmx - 5, hmy);
    tpl(s, hmx + 6, hmy - 3, TREE, { o: ink[1], L: P.leaf_orange[4], m: P.leaf_orange[3], d: P.leaf_red[2], t: ink[2] });
    // Teddy's: across the canal, with a ham radio mast
    put(s, icon(11, 9, (t) => {
      t.poly([[0, 4], [5.5, -0.5], [11, 4]], RO[2]); t.line(1, 3, 5, 0, RO[4]);
      t.rect(1, 4, 9, 5, P.wall_blue[4]); t.vline(9, 4, 8, P.wall_blue[3]);
      t.rect(4, 6, 2, 3, ink[2]); t.px(2, 6, pa[5]); t.px(7, 6, pa[5]);
    }), tdx - 5, tdy);
    s.vline(tdx + 8, tdy - 6, tdy + 8, ink[2]); s.hline(tdx + 6, tdx + 10, tdy - 4, ink[2]); s.hline(tdx + 7, tdx + 9, tdy - 1, ink[2]);

    /* ---- street trees in small clumps ---- */
    const clearAt = (x, y) => { for (let yy = y - 5; yy <= y + 2; yy++) for (let xx = x - 3; xx <= x + 3; xx++) if (((s.get(xx, yy) & 0x7ff0) >> 4) !== pa.id) return false; return !header(x, y); };
    for (const [ax, ay] of [[60, 52], [120, 64], [128, 40], [192, 52], [236, 88], [298, 106], [258, 146], [200, 150], [140, 126], [182, 122], [30, 98], [56, 92], [226, 60], [120, 150]]) {
      const n = rng.int(2, 3);
      for (let i = 0; i < n; i++) { const x = ax + rng.int(-5, 5), y = ay + rng.int(-3, 3); if (clearAt(x, y)) tpl(s, x - 2, y - 4, TREE_S, { o: ink[1], L: G[4], m: G[3], d: G[2], t: ink[2] }); }
    }

    /* ---- compass rose ---- */
    const cx0 = 301.5, cy0 = 20.5;
    s.ring(cx0, cy0, 6.5, 6.5, ink[3]);
    const point = (ang, L, w, light, dark) => {
      const tx = cx0 + Math.cos(ang) * L, ty = cy0 + Math.sin(ang) * L, nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
      s.poly([[cx0, cy0], [cx0 + nx, cy0 + ny], [tx, ty]], light); s.poly([[cx0, cy0], [cx0 - nx, cy0 - ny], [tx, ty]], dark);
    };
    for (let k = 0; k < 4; k++) point(Math.PI / 4 + k * Math.PI / 2, 6, 1.6, pa[5], ink[3]);
    for (let k = 0; k < 4; k++) point(-Math.PI / 2 + k * Math.PI / 2, k ? 10 : 12, 2.2, k ? pa[5] : RO[4], k ? ink[2] : RO[2]);
    s.px(cx0, cy0, ink[1]);

    /* ---- folds (the map lives in a back pocket) and a border ---- */
    const crease = (x, y, d, lvl) => { const v = s.get(x, y); if (v && PX.bayer(x, y) < lvl) s.px(x, y, PX.sh(v, d)); };
    for (const fx of [107, 213]) for (let y = 0; y < H; y++) { crease(fx, y, -1, 0.75); crease(fx + 1, y, 1, 0.5); }
    for (let x = 0; x < W; x++) { crease(x, 90, -1, 0.75); crease(x, 91, 1, 0.5); }
    for (let x = 4; x < W - 4; x++) { s.px(x, 4, ink[3]); s.px(x, H - 5, ink[3]); }
    for (let y = 4; y < H - 4; y++) { s.px(4, y, ink[3]); s.px(W - 5, y, ink[3]); }
  }

  /* ================================================================== */
  /* cg_tape — the cassette close-ups                                    */
  R('cg_tapebrown', ['#160c0c', '#2a1712', '#41231a', '#5a3322', '#76462d', '#93603d']);
  R('cg_charcoal', ['#101014', '#1c1c22', '#2a2a32', '#3a3a45', '#4d4d5a', '#666673']);
  R('cg_cork', ['#2e1d12', '#55361f', '#7d5530', '#a07445', '#bf9460', '#d8b37f']);
  R('cg_linen', ['#4a3f46', '#7b6e72', '#a89d9b', '#cdc4bd', '#e9e2d8', '#faf6ee']);
  R('cg_gold', ['#3a2508', '#6a4610', '#9c6d1c', '#c9962e', '#e8bf52', '#fbe39a']);

  /* HAND_L: the same hand, bigger and rounder, for a label written in marker */
  const HAND_L = {
    '#': '.#..#./.#..#./######/.#..#./.#..#./######/.#..#./.#..#.', 5: '######/#...../#...../#####./.....#/.....#/#....#/.####.',
    '—': '....../....../....../....../######', F: '######/#...../#...../#####./#...../#...../#...../#.....',
    O: '..##../.#..#./#....#/#....#/#....#/#....#/.#..#./..##..', R: '#####./#....#/#....#/#####./#..#../#...#./#....#/#....#',
    G: '..###./.#...#/#...../#...../#..###/#....#/.#...#/..###.', U: '#....#/#....#/#....#/#....#/#....#/#....#/.#..#./..##..',
    S: '.####./#....#/#...../.####./.....#/.....#/#....#/.####.', I: '###/.#./.#./.#./.#./.#./.#./###',
    E: '######/#...../#...../####../#...../#...../#...../######', P: '#####./#....#/#....#/#####./#...../#...../#...../#.....',
    L: '#...../#...../#...../#...../#...../#...../#...../######', A: '..##../.#..#./#....#/#....#/######/#....#/#....#/#....#',
    Y: '#...#/#...#/.#.#./..#../..#../..#../..#../..#..', T: '#####/..#../..#../..#../..#../..#../..#../..#..'
  };

  PX.cg('cg_tape', {
    times: ['night'],
    variants: ['side_a', 'five'],
    draw(s, o) { if (o.variant === 'five') tapeFive(s, o); else tapeSideA(s, o); }
  });

  /* A compact cassette lying face up, w×h at (x, y).
   * o: shell, label (ramps), band (ramp|null, the label's top stripe), tape,
   *    hub, full (0..1, tape on the left reel), write(lx, ly, lw, lh) for the
   *    writing area above the window, print(lx, ly, lw, lh) for the band. */
  function cassette(s, x, y, w, h, o) {
    const S = o.shell, L = o.label, T = o.tape || P.cg_tapebrown, HB = o.hub || P.white_cloth;
    const fx = (f) => x + Math.round(f * w), fy = (f) => y + Math.round(f * h);
    /* shell with rounded corners and a bevel */
    s.rect(x + 2, y, w - 4, h, S[3]); s.rect(x + 1, y + 1, w - 2, h - 2, S[3]); s.rect(x, y + 2, w, h - 4, S[3]);
    s.hline(x + 2, x + w - 3, y, S[5]); s.px(x + 1, y + 1, S[4]); s.vline(x, y + 2, y + h - 3, S[4]);
    s.hline(x + 2, x + w - 3, y + h - 1, S[0]); s.px(x + w - 2, y + h - 2, S[1]); s.vline(x + w - 1, y + 2, y + h - 3, S[1]);
    s.hline(x + 2, x + w - 3, y + h - 2, S[2]); s.vline(x + w - 2, y + 2, y + h - 3, S[2]);
    /* the raised lip along the bottom edge: tape-head openings, the tape across them */
    const tx0 = fx(0.19), tx1 = fx(0.81), ty = fy(0.79), sl = Math.max(2, Math.round(w * 0.035));
    s.poly([[tx0, ty], [tx1, ty], [tx1 + sl, y + h - 1], [tx0 - sl, y + h - 1]], S[2]);
    s.line(tx0, ty, tx1, ty, S[4]); s.line(tx0, ty, tx0 - sl, y + h - 2, S[4]);
    const oy = y + h - Math.max(3, Math.round(h * 0.11)), oh = y + h - 1 - oy;
    const hole = (cx, hw) => { s.rect(cx - hw, oy, hw * 2, oh, S[0]); s.hline(cx - hw, cx + hw - 1, oy + oh - 1, T[3]); };
    hole(fx(0.5), Math.round(w * 0.07)); hole(fx(0.31), Math.max(1, Math.round(w * 0.025))); hole(fx(0.69), Math.max(1, Math.round(w * 0.025)));
    for (const f of [0.24, 0.76]) s.circle(fx(f), oy + oh / 2, Math.max(1, w * 0.012), S[1]);
    /* label, with the reel window cut out of it */
    const LY = o.labelY || [0.07, 0.73], WY = o.winY || [0.45, 0.67], bandH = o.band ? (o.bandH || Math.max(3, Math.round(h * 0.15))) : 0;
    const lx0 = fx(0.05), lx1 = fx(0.95), ly0 = fy(LY[0]), ly1 = fy(LY[1]);
    const wx0 = fx(0.24), wx1 = fx(0.76), wy0 = fy(WY[0]), wy1 = fy(WY[1]), wr = Math.floor((wy1 - wy0) / 2);
    /* the molded rim the label sits in */
    s.hline(lx0 - 1, lx1, ly0 - 1, S[2]); s.vline(lx0 - 1, ly0 - 1, ly1, S[2]); s.hline(lx0 - 1, lx1, ly1, S[4]); s.vline(lx1, ly0 - 1, ly1, S[4]);
    s.rect(lx0, ly0, lx1 - lx0, ly1 - ly0, L[4]);
    s.hline(lx0, lx1 - 1, ly0, L[5]); s.vline(lx0, ly0, ly1 - 1, L[5]);
    s.hline(lx0, lx1 - 1, ly1 - 1, L[2]); s.vline(lx1 - 1, ly0, ly1 - 1, L[3]);
    if (o.band) { const bh = bandH; s.rect(lx0, ly0, lx1 - lx0, bh, o.band[3]); s.hline(lx0, lx1 - 1, ly0, o.band[4]); s.hline(lx0, lx1 - 1, ly0 + bh - 1, o.band[2]); if (o.print) o.print(lx0, ly0, lx1 - lx0, bh); }
    const winPoly = [];
    for (let k = 0; k <= 12; k++) { const a = -Math.PI / 2 - (k / 12) * Math.PI; winPoly.push([wx0 + wr + Math.cos(a) * wr, (wy0 + wy1) / 2 + Math.sin(a) * wr]); }
    for (let k = 0; k <= 12; k++) { const a = Math.PI / 2 - (k / 12) * Math.PI; winPoly.push([wx1 - wr + Math.cos(a) * wr, (wy0 + wy1) / 2 + Math.sin(a) * wr]); }
    /* inside the window: smoke plastic, the tape packs, the hubs */
    const cy = (wy0 + wy1) / 2, hl = fx(0.31), hr = fx(0.69), hubR = Math.max(3, w * 0.052);
    const full = o.full === undefined ? 0.75 : o.full, span = w * 0.2;
    s.clip(winPoly, () => {
      s.rect(wx0 - 1, wy0 - 1, wx1 - wx0 + 2, wy1 - wy0 + 2, S[1]);
      const pack = (cx, r) => { s.circle(cx, cy, r, T[2]); s.ring(cx, cy, r - 0.5, r - 0.5, T[1]); s.ring(cx - 0.6, cy - 0.6, r * 0.72, r * 0.72, T[3]); };
      pack(hl, hubR + 1 + span * full); pack(hr, hubR + 1 + span * (1 - full));
      s.line(hl, cy + hubR + span * full, hr, cy + hubR + span * (1 - full), T[1]);
    });
    s.path(winPoly, S[0]);
    for (const cx of [hl, hr]) {
      s.circle(cx, cy, hubR, HB[4]); s.ring(cx, cy, hubR - 0.5, hubR - 0.5, HB[2]);
      s.circle(cx, cy, hubR * 0.6, S[0]);
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + (cx === hl ? 0.3 : 0.9); s.px(cx + Math.cos(a) * hubR * 0.5 - 0.5, cy + Math.sin(a) * hubR * 0.5 - 0.5, HB[3]); }
      s.px(cx - hubR * 0.6, cy - hubR * 0.6, HB[5]);
    }
    /* a glint across the window plastic */
    s.clip(winPoly, () => { s.line(wx0 + wr * 2, wy0, wx0 + wr * 2 - (wy1 - wy0), wy1, S[4]); s.line(wx0 + wr * 2 + 2, wy0, wx0 + wr * 2 + 2 - (wy1 - wy0), wy1, S[3]); });
    /* screws */
    for (const [sx, sy] of [[0.035, 0.06], [0.965, 0.06], [0.035, 0.94], [0.965, 0.94], [0.5, 0.86]]) {
      const px = x + Math.round(sx * (w - 1)), py = y + Math.round(sy * (h - 1));
      s.px(px, py, S[1]); s.px(px - 1, py - 1, S[4]);
    }
    if (o.write) o.write(lx0, ly0 + bandH, lx1 - lx0, wy0 - ly0 - bandH);
    return { lx0, ly0, lx1, ly1, wx0, wy0, wx1, wy1 };
  }

  /* side_a: Saturday, October 9, 1982, 8:52 p.m. June's recorder on the desk
   * under her window. Corson Street has gone dark; the Novaks' TV is still on;
   * past the end of the street, by the Standpipe (still standing in 1982), a
   * small green light. Moonlight through the glass is the only other light. */
  function tapeSideA(s, o) {
    const rng = o.rng, CH = P.chrome, K = P.cg_charcoal, TR = P.trim;
    /* the wall: rose wallpaper with a small sprig pattern */
    s.rect(0, 0, 214, 40, P.wall_rose[3]);
    for (let x = 3; x < 214; x += 7) { s.vline(x, 0, 39, P.wall_rose[2]); for (let y = 3 + (x % 2) * 4; y < 40; y += 8) s.px(x + 3, y, P.wall_rose[4]); }
    /* June's corkboard: notes, a clipping, a hand-drawn map with a circle */
    s.rect(18, -2, 118, 26, P.wood[2]); s.rect(20, -2, 114, 23, P.cg_cork[3]);
    s.hline(18, 135, 23, P.wood[1]); s.hline(20, 133, 20, P.cg_cork[2]);
    for (let i = 0; i < 40; i++) s.px(rng.int(21, 132), rng.int(0, 19), P.cg_cork[rng() < 0.5 ? 2 : 4]);
    const card = (x, y, w, h, c, lines) => { s.rect(x, y, w, h, c[4]); s.hline(x, x + w - 1, y + h, c[1]); s.vline(x + w, y + 1, y + h, c[1]); for (let k = 0; k < lines; k++) s.hline(x + 2, x + w - 3 - (k % 2) * 3, y + 3 + k * 2, P.navy[3]); };
    card(26, 3, 18, 12, P.paper, 4); card(50, 1, 22, 16, P.paper, 6); card(78, 4, 15, 11, P.cream, 3); card(98, 0, 26, 17, P.paper, 0);
    s.line(101, 3, 110, 9, P.navy[3]); s.line(110, 9, 121, 6, P.navy[3]); s.line(104, 13, 112, 9, P.navy[3]); s.ring(116, 8, 3, 2.5, P.red[3]);
    s.rect(52, 3, 8, 6, P.knit_gray[3]);
    for (const [px, py] of [[34, 3], [60, 1], [85, 4], [110, 0], [119, 1]]) { s.px(px, py, P.red[4]); s.px(px, py + 1, P.red[2]); }
    /* the window: casing, sash, glass */
    const gx0 = 220, gy0 = 6, gy1 = 109;
    s.rect(210, 0, 110, 118, TR[3]);
    s.vline(210, 0, 117, TR[4]); s.vline(211, 0, 117, TR[3]); s.vline(215, 0, 109, TR[2]);
    s.clip([gx0, gy0, W - gx0, gy1 - gy0], () => windowView(s, o));
    s.rect(266, gy0, 3, gy1 - gy0, TR[3]); s.vline(266, gy0, gy1 - 1, TR[4]); s.vline(268, gy0, gy1 - 1, TR[1]);
    s.rect(gx0, 55, W - gx0, 4, TR[3]); s.hline(gx0, W - 1, 55, TR[4]); s.hline(gx0, W - 1, 58, TR[1]);
    s.rect(216, gy0 - 1, 4, gy1 - gy0 + 1, TR[3]); s.vline(219, gy0, gy1 - 1, TR[1]);
    s.rect(204, 109, 116, 4, TR[4]); s.hline(204, 319, 109, TR[5]); s.rect(206, 113, 114, 5, TR[2]); s.hline(206, 319, 117, TR[1]);
    /* the curtain, pulled back to look out */
    const cur = P.cream;
    s.poly([[203, 0], [228, 0], [222, 30], [226, 60], [221, 92], [224, 109], [204, 109]], cur[3]);
    for (const [x0, x1, c] of [[206, 207, cur[2]], [211, 212, cur[4]], [216, 216, cur[2]], [220, 221, cur[4]]]) s.poly([[x0 + 2, 0], [x1 + 3, 0], [x1, 50], [x1 + 1, 109], [x0, 109], [x0 - 1, 50]], c);
    s.line(228, 0, 222, 30, cur[1]); s.line(222, 30, 226, 60, cur[1]); s.line(226, 60, 221, 92, cur[1]); s.line(221, 92, 224, 109, cur[1]);
    s.rect(200, 30, 26, 4, cur[2]); s.hline(200, 225, 30, cur[4]);
    /* the desk */
    s.rect(0, 118, W, 62, P.wood[3]);
    for (let y = 118; y < 180; y += 6) { s.hline(0, W - 1, y, P.wood[2]); for (let k = 0; k < 6; k++) { const gx = rng.int(0, W - 10); s.hline(gx, gx + rng.int(3, 9), y + rng.int(2, 4), P.wood[k % 2 ? 2 : 4]); } }
    shiftR(s, 0, 118, W, 4, -1);
    recorder(s, o);
    /* light: the moon through the glass, washing the desk and the recorder */
    s.lightPoly('cool', [[214, 0], [320, 0], [320, 180], [150, 180], [90, 120], [96, 36]], 0.3, { fade: { x0: 250, y0: 20, x1: 80, y1: 170 } });
    s.light('cool', 150, 80, 62, 42, 1.08, { core: 0.32 });
    s.light('cool', 236, 128, 60, 16, 0.55);
  }

  /* what June sees through the glass */
  function windowView(s, o) {
    const rng = PX.rng('cg_tape:view');
    s.vgrad(220, 6, 100, 80, [E(P.sky_night[0]), E(P.sky_night[1]), E(P.sky_night[2]), E(P.sky_night[3])], 3);
    s.stars(222, 8, 96, 38, 12, { rng });
    // a gibbous moon, high up
    s.circle(303, 20, 5.5, E(P.cloud[5])); s.circle(301, 19, 5, E(P.white[5]));
    s.px(304, 18, E(P.cloud[3])); s.px(303, 22, E(P.cloud[3])); s.px(305, 21, E(P.cloud[4]));
    s.ring(303, 20, 8, 8, E(P.sky_night[3]));
    // the hill past the end of the street, and the Standpipe on it (1982: still standing)
    s.poly([[220, 74], [236, 68], [250, 63], [262, 62], [276, 66], [296, 70], [320, 72], [320, 90], [220, 90]], E(P.sky_night[1]));
    s.rect(251, 49, 6, 14, E(P.sky_night[1])); s.poly([[250.5, 49.5], [254, 46], [257.5, 49.5]], E(P.sky_night[1]));
    s.px(252, 62, E(P.lantern[5])); s.px(253, 62, E(P.lantern[4])); s.px(252, 61, E(P.lantern[3]));
    s.px(253, 61, E(P.lantern[2]));
    s.light('green', 252.5, 61.5, 9, 7, 0.9);
    // Corson Street: the houses across the way, every lamp out
    const house = (x, w, eave, apex, wallR, roofR, wins) => {
      s.poly([[x - 2, eave], [x + w / 2, apex], [x + w + 2, eave]], roofR[2]);
      s.line(x - 2, eave, x + w / 2, apex, roofR[3]);
      s.rect(x, eave, w, 110 - eave, wallR[3]);
      s.vline(x + w - 1, eave, 109, wallR[2]);
      for (const [wx, wy, ww, wh] of wins) { s.rect(x + wx, wy, ww, wh, P.ink[2]); s.rect(x + wx - 1, wy - 1, ww + 2, 1, wallR[4]); s.rect(x + wx - 1, wy + wh, ww + 2, 1, wallR[4]); }
    };
    house(222, 30, 76, 62, P.house_blue, P.roof, [[5, 82, 6, 8], [19, 82, 6, 8]]);
    house(282, 34, 78, 64, P.house_yellow, P.roof, [[6, 84, 7, 8], [21, 84, 7, 8]]);
    // the Novaks' TV, flickering blue behind their curtains
    s.rect(303, 84, 7, 8, E(P.tv[3])); s.rect(304, 85, 4, 4, E(P.tv[4])); s.px(305, 86, E(P.tv[5]));
    s.rect(303, 84, 2, 8, P.house_blue[2]); s.px(309, 84, P.house_blue[2]); s.vline(309, 84, 91, P.house_blue[2]);
    s.light('cool', 306, 88, 12, 9, 0.8);
    // a maple between the houses, half bare
    s.rect(262, 78, 2, 32, P.bark[2]);
    s.foliage(263, 74, 12, 9, [P.leaf_red, P.leaf_orange], { rng, clusters: 12, blob: 2.6 });
    s.rect(220, 104, 100, 6, P.asphalt[2]); s.hline(220, 319, 104, P.concrete[2]);
  }

  /* June's portable cassette recorder, seen from the front, a little above */
  function recorder(s, o) {
    const CH = P.chrome, K = P.cg_charcoal, M = P.metal;
    const x0 = -12, x1 = 208, y0 = 36, y1 = 124;
    // contact shadow on the desk
    shiftR(s, x0, y1, x1 - x0 + 4, 3, -2); shiftR(s, x1, y0 + 40, 6, y1 - y0 - 38, -1);
    // top face (we see it from a little above): charcoal plastic
    s.poly([[x0 + 2, 27], [x1 - 3, 27], [x1, y0], [x0, y0]], K[3]);
    s.hline(x0 + 2, x1 - 4, 27, K[5]); s.line(x1 - 3, 27, x1, y0, K[2]);
    for (let x = 8; x < 86; x += 4) s.vline(x, 30, 33, K[2]);
    // tape counter, the red recording light
    s.rect(58, 28, 19, 6, K[1]); s.rect(59, 29, 13, 4, P.white[1]);
    write(s, 60, 29, '036', P.white[4], { font: TINY, sp: 1 });
    s.rect(73, 29, 3, 3, CH[3]); s.px(73, 29, CH[5]);
    s.px(84, 30, E(P.neon[4])); s.px(85, 30, E(P.neon[3])); s.px(84, 31, E(P.neon[2]));
    s.light('red', 84.5, 30.5, 5, 3, 0.6);
    // the piano keys: REC and PLAY are down
    const keys = [['rec', P.red], ['play', CH], ['rew', CH], ['ff', CH], ['stop', CH], ['pause', CH]];
    keys.forEach(([k, r], i) => {
      const kx = 94 + i * 18, down = k === 'rec' || k === 'play', ky = down ? 31 : 28;
      s.rect(kx, ky, 15, 5, r[3]); s.hline(kx, kx + 14, ky, r[5]); s.vline(kx, ky, ky + 4, r[4]); s.vline(kx + 14, ky, ky + 4, r[2]);
      if (!down) { s.rect(kx, ky + 5, 15, 3, r[2]); s.hline(kx, kx + 14, ky + 7, r[1]); }
      const g = k === 'rec' ? ['.#.', '###', '.#.'] : k === 'play' ? ['#..', '##.', '#..'] : k === 'rew' ? ['..#..#', '.##.##', '..#..#'] : k === 'ff' ? ['#..#..', '##.##.', '#..#..'] : k === 'stop' ? ['###', '###', '###'] : ['#.#', '#.#', '#.#'];
      tpl(s, kx + 7 - (g[0].length >> 1), ky + 1, g, { '#': k === 'rec' ? r[5] : K[1] });
    });
    // strap lug
    s.rect(x1 - 5, 28, 4, 5, M[3]); s.px(x1 - 4, 29, M[5]); s.rect(x1 - 4, 30, 2, 2, K[0]);
    // front face: brushed aluminum, bevelled
    s.rect(x0, y0, x1 - x0, y1 - y0, CH[3]);
    for (let y = y0 + 2; y < y1 - 2; y += 3) s.hline(x0, x1 - 1, y, CH[(y % 2) ? 4 : 3]);
    s.hline(x0, x1 - 1, y0, CH[5]); s.hline(x0, x1 - 1, y0 + 1, CH[4]);
    s.hline(x0, x1 - 1, y1 - 1, CH[1]); s.hline(x0, x1 - 1, y1 - 2, CH[2]); s.vline(x1 - 1, y0, y1 - 1, CH[1]); s.vline(x1 - 2, y0 + 1, y1 - 2, CH[2]);
    s.px(x1 - 1, y1 - 1, 0); s.px(x1 - 1, y0, CH[3]);
    // speaker grille: a recessed panel of perforated metal
    const gx0 = x0 + 6, gx1 = 82, gy0 = y0 + 8, gy1 = y1 - 8;
    s.rect(gx0 - 1, gy0 - 1, gx1 - gx0 + 2, gy1 - gy0 + 2, K[1]);
    s.rect(gx0, gy0, gx1 - gx0, gy1 - gy0, M[3]);
    for (let y = gy0 + 1; y < gy1 - 1; y += 3) for (let x = gx0 + 1 + ((y / 3) & 1) * 2; x < gx1 - 1; x += 4) { s.px(x, y, K[0]); s.px(x + 1, y, K[1]); s.px(x, y + 1, M[4]); }
    s.hline(gx0, gx1 - 1, gy0, M[2]); s.vline(gx0, gy0, gy1 - 1, M[2]); s.hline(gx0, gx1 - 1, gy1 - 1, M[4]); s.vline(gx1 - 1, gy0, gy1 - 1, M[4]);
    write(s, gx0 + 2, gy1 + 2, 'AUTO STOP', CH[1], { font: TINY, sp: 1 });
    // the built-in microphone
    s.circle(88, 46, 3, K[1]); s.px(87, 45, K[3]); s.px(89, 46, K[3]); s.px(88, 47, K[3]);
    // cassette door: black frame, smoked window, the tape inside
    const dx0 = 92, dx1 = 204, dy0 = 40, dy1 = 120;
    s.rect(dx0, dy0, dx1 - dx0, dy1 - dy0, K[2]);
    s.hline(dx0, dx1 - 1, dy0, K[4]); s.vline(dx0, dy0, dy1 - 1, K[3]); s.hline(dx0, dx1 - 1, dy1 - 1, K[0]); s.vline(dx1 - 1, dy0, dy1 - 1, K[1]);
    s.rect(142, dy0, 12, 2, K[0]);
    cassette(s, 98, 47, 100, 66, {
      shell: P.white_cloth, label: P.paper, band: P.red, bandH: 4, labelY: [0.06, 0.76], winY: [0.52, 0.73], full: 0.82,
      write(lx, ly, lw, lh) {
        // ruled lines, the printed side marker, June's writing
        for (let k = 0; k < 3; k++) s.hline(lx + 12, lx + lw - 3, ly + 8 + k * 8, P.cg_mblue[4]);
        s.rect(lx + 2, ly + 8, 8, 9, P.red[3]); s.rect(lx + 3, ly + 9, 6, 7, P.paper[5]);
        write(s, lx + 5, ly + 10, 'A', P.red[2], { font: TINY });
        const r2 = PX.rng('june:a');
        write(s, lx + 13, ly + 2, 'QUIET NIGHT', P.navy[3], { rng: r2, wobble: 0.12, slope: -0.02 });
        write(s, lx + 13, ly + 10, '10/9/82', P.navy[3], { rng: r2, wobble: 0.12 });
        write(s, lx + 12, ly + 18, "DON'T TAPE OVER!!", P.red[3], { rng: r2, wobble: 0.1, slope: -0.02 });
      }
    });
    // the smoked door plastic over the cassette: darker at the edges, the window reflected in it
    s.rect(dx0 + 3, dy0 + 3, dx1 - dx0 - 6, 1, K[1]); s.rect(dx0 + 3, dy0 + 3, 1, dy1 - dy0 - 6, K[1]);
    s.hline(dx0 + 4, dx1 - 5, dy1 - 4, K[3]); s.vline(dx1 - 4, dy0 + 4, dy1 - 4, K[3]);
    shiftIn(s, dx0 + 4, dy0 + 4, dx1 - 5, dy1 - 5, -1, (x, y) => x < dx0 + 7 || y > dy1 - 8, 0.5);
    s.line(197, 46, 191, 57, (i, x, y) => { const v = s.get(x, y); return v ? PX.sh(v, 1) : 0; });
    s.line(197, 49, 193, 56, (i, x, y) => { const v = s.get(x, y); return v ? PX.sh(v, 1) : 0; });
    // the strap, off the lug and down over the desk
    const strap = [[x1 - 2, 31], [x1 + 4, 40], [x1 + 7, 70], [x1 + 5, 110], [x1 + 18, 124], [x1 + 50, 135], [x1 + 92, 150]];
    brush(s, strap, 1.6, P.wood_dark[1]); brush(s, strap.map(([x, y]) => [x - 0.5, y - 0.5]), 0.8, P.wood_dark[3]);
    s.path(strap.map(([x, y]) => [x - 1, y - 1]), (i) => (i % 5 ? 0 : P.wood_dark[4]));
  }

  /* five: Sunday, the morning after. A brand-new Maxell XLII on Gus's pillow,
   * labeled in June's round, bossy hand. Drawn self-lit in morning light (the
   * def's single time is side_a's night). */
  function tapeFive(s, o) {
    const rng = PX.rng('cg_tape:five'), LN = P.cg_linen;
    /* the wall and the headboard rail behind the pillow */
    s.rect(0, 0, W, 14, P.wall_cream[3]);
    for (let x = 2; x < W; x += 9) s.vline(x, 0, 6, P.wall_cream[2]);
    s.rect(0, 5, W, 9, P.wood_dark[3]); s.hline(0, W - 1, 5, P.wood_dark[5]); s.hline(0, W - 1, 6, P.wood_dark[4]); s.hline(0, W - 1, 13, P.wood_dark[1]);
    for (let x = 22; x < W; x += 48) { s.rect(x, 0, 7, 6, P.wood_dark[3]); s.vline(x, 0, 5, P.wood_dark[5]); s.vline(x + 6, 0, 5, P.wood_dark[1]); }
    s.rect(0, 14, W, H - 14, P.cg_linen[1]);
    /* the pillow: a soft slab with corner ears and a sagging top edge */
    const top = (x) => 17 + 5 * Math.sin(Math.PI * (x - 8) / 304) ** 0.8;
    const side = (y) => 9 + 3 * Math.sin(Math.PI * (y - 15) / 170);
    const inP = (x, y) => x > side(y) && x < W - side(y) && y > top(x) && y < 178;
    for (let y = 14; y < H; y++) for (let x = 0; x < W; x++) {
      if (!inP(x, y)) continue;
      const nx = (x - 160) / 152, ny = (y - 96) / 82;
      const edge = Math.min(x - side(y), W - side(y) - x, y - top(x)) / 14;      // 0 at the rim → 1 inside
      const dome = Math.min(1, edge) ** 0.6;
      const hollow = Math.exp(-(((x - 150) / 86) ** 2 + ((y - 74) / 52) ** 2));
      const v = 1.9 + dome * 2.3 - nx * 0.5 - ny * 0.4 - hollow * 0.45 + (fbm(x, y, 3, 40) - 0.5) * 0.35;
      s.px(x, y, sh(LN, qd(v, x, y, 4)));
    }
    // the rim catches a little light along the top edge
    for (let x = 12; x < W - 12; x++) { const y = Math.ceil(top(x)) + 1; if (inP(x, y)) s.px(x, y, LN[x < 160 ? 4 : 3]); }
    // soft creases running in from the corners and the top
    const crease = (pts) => {
      s.path(pts, (i, x, y) => { const v = s.get(x, y); return v ? PX.sh(v, -1) : 0; });
      s.path(pts.map(([x, y]) => [x + 1, y + 1]), (i, x, y) => { const v = s.get(x, y); return v && i % 4 !== 3 ? PX.sh(v, 1) : 0; });
    };
    crease([[14, 22], [34, 30], [52, 40]]); crease([[306, 22], [286, 30], [262, 42]]); crease([[150, 22], [152, 30], [148, 38]]);
    crease([[12, 150], [30, 138], [52, 132]]); crease([[300, 140], [284, 128], [262, 122]]); crease([[226, 26], [238, 34]]);
    // the faded rose print (Mémère's linen): pattern follows the shading
    for (let y = 24; y < 176; y += 14) for (let x = 18 + ((y / 14) & 1) * 13; x < W - 14; x += 26) {
      if (!inP(x - 3, y - 2) || !inP(x + 4, y + 4)) continue;
      const shd = s.get(x, y) & 15, rose = P.wall_rose, leaf = P.wall_green;
      const c1 = sh(rose, shd), c2 = sh(rose, shd - 1), l1 = sh(leaf, shd - 1);
      tpl(s, x - 2, y - 1, ['.ab.', 'abba', '.bb.', 'l..l'], { a: c1, b: c2, l: l1 });
    }
    // the case's hem and stitching
    s.path([[16, 158], [160, 160], [304, 157]], LN[2]); s.path([[16, 159], [160, 161], [304, 158]], LN[4]);
    /* the J-card case beside it, the cellophane balled up */
    const jx = 238, jy = 44;
    shiftR(s, jx + 3, jy + 4, 56, 82, -1); shiftR(s, jx + 5, jy + 6, 55, 80, -1, 0.5);
    s.rect(jx, jy, 56, 82, P.cg_charcoal[2]);
    s.rect(jx + 3, jy + 3, 50, 76, P.cg_charcoal[1]);
    s.rect(jx + 3, jy + 3, 50, 20, P.cg_gold[3]); s.hline(jx + 3, jx + 52, jy + 3, P.cg_gold[5]); s.hline(jx + 3, jx + 52, jy + 22, P.cg_gold[1]);
    write(s, jx + 7, jy + 7, 'XLII', P.cg_charcoal[1], { font: TINY, sp: 1 });
    write(s, jx + 7, jy + 14, 'HIGH BIAS', P.cg_charcoal[2], { font: TINY, sp: 1 });
    for (let k = 0; k < 5; k++) s.hline(jx + 8, jx + 44 - (k % 3) * 7, jy + 30 + k * 4, P.cg_charcoal[3]);
    s.rect(jx + 8, jy + 54, 22, 7, P.cg_charcoal[3]); s.rect(jx + 9, jy + 55, 20, 5, P.white_cloth[4]);
    for (let x = jx + 10; x < jx + 28; x += 2) s.vline(x, jy + 55, jy + 59, P.cg_charcoal[1]);
    write(s, jx + 8, jy + 66, '© 1990', P.cg_charcoal[4], { font: TINY, sp: 1 });
    s.hline(jx, jx + 55, jy, P.white_cloth[3]); s.vline(jx, jy, jy + 81, P.white_cloth[2]); s.hline(jx + 1, jx + 54, jy + 1, P.white_cloth[5]);
    s.vline(jx + 55, jy, jy + 81, P.cg_charcoal[0]); s.hline(jx, jx + 55, jy + 81, P.cg_charcoal[0]);
    for (const [cx, cy] of [[226, 128], [236, 133], [246, 127], [231, 138], [252, 136]]) { s.circle(cx, cy, 3, LN[4]); s.px(cx - 1, cy - 1, P.white_cloth[5]); s.px(cx + 1, cy + 1, LN[2]); }
    /* the tape, settled into the hollow, its soft shadow on the linen */
    const cx0 = 66, cy0 = 22, cw = 152, chh = 96;
    shiftR(s, cx0 + 3, cy0 + 4, cw + 1, chh + 1, -1); shiftR(s, cx0 + 5, cy0 + 6, cw + 1, chh + 1, -1, 0.5);
    cassette(s, cx0, cy0, cw, chh, {
      shell: P.cg_charcoal, label: P.white_cloth, band: P.cg_charcoal, full: 1, hub: P.white_cloth,
      print(lx, ly, lw, bh) {
        s.rect(lx, ly, lw, bh, P.cg_charcoal[1]);
        s.hline(lx, lx + lw - 1, ly + bh - 1, P.cg_gold[3]); s.hline(lx, lx + lw - 1, ly + bh - 2, P.cg_gold[1]);
        const big = { X: '#...#/.#.#./..#../.#.#./#...#', L: '#..../#..../#..../#..../#####', I: '#/#/#/#/#' };
        let x = lx + 6;
        for (const ch of 'XLII') { const rows = big[ch].split('/'); for (let r = 0; r < 5; r++) for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === '#') { s.px(x + c, ly + 4 + r, P.cg_gold[r < 2 ? 5 : 4]); s.px(x + c + 1, ly + 4 + r, P.cg_gold[3]); } x += rows[0].length + 3; }
        s.hline(x + 2, lx + lw - 30, ly + 6, P.cg_gold[2]);
        write(s, lx + lw - 27, ly + 4, 'C90', P.cg_gold[4], { font: TINY, sp: 1 });
      },
      write(lx, ly, lw, lh) {
        const r2 = PX.rng('june:5'), ink = P.navy[2];
        const l1 = '#5 — FOR GUSSIE —', l2 = 'PLAY AFTER', fo = { font: HAND_L, bold: true, space: 4 };
        const w1 = measure(l1, fo), w2 = measure(l2, fo);
        write(s, lx + Math.round((lw - w1) / 2), ly + 3, l1, ink, Object.assign({ rng: r2, wobble: 0.15, slope: -0.015 }, fo));
        write(s, lx + Math.round((lw - w2) / 2) + 6, ly + 14, l2, ink, Object.assign({ rng: r2, wobble: 0.15, slope: -0.02 }, fo));
      }
    });
    // the shell catches the window along its upper left; MAXELL molded into the lip
    shiftIn(s, cx0, cy0, cx0 + cw - 1, cy0 + chh - 1, 1, (x, y) => (x - cx0) + (y - cy0) * 1.6 < 40 && ((s.get(x, y) & 0x7ff0) >> 4) === P.cg_charcoal.id, 0.5);
    write(s, cx0 + 47, cy0 + 82, 'MAXELL', P.cg_charcoal[1], { font: TINY, sp: 1 });
    write(s, cx0 + 46, cy0 + 81, 'MAXELL', P.cg_charcoal[3], { font: TINY, sp: 1 });
    /* morning sun through the two-pane window: a warm slant across the bed */
    const pane = (u0, u1, v0, v1) => (x, y) => { const u = x - 0.58 * y, v = y + 0.12 * x; return u > u0 && u < u1 && v > v0 && v < v1; };
    const p1 = pane(30, 112, 18, 200), p2 = pane(118, 200, 18, 200);
    shiftIn(s, 0, 15, W - 1, H - 1, 1, (x, y) => p1(x, y) || p2(x, y));
    bake(s);
  }

  /* ================================================================== */
  /* cg_polaroid — the faded Polaroid on the attic boards                 */
  R('cg_cardboard', ['#2a1c12', '#4d3420', '#76552f', '#9c7644', '#bc965d', '#d8b67f']);
  R('cg_marker', ['#0e1022', '#181c3a', '#232a52', '#30396a', '#424e84', '#5a689c']);
  /* faded-print ramps: each source ramp pulled toward a warm cream, the darks
   * most of all, the way a 1981 print loses its blacks and its cyan */
  const fadeRamp = (name, amt) => {
    const src = P[name];
    return PX.ramp('cg_f_' + name, src.map((c, i) => PX.rgbHex(PX.mixRgb(PX.rgbOf(c), [236, 222, 190], Math.min(0.85, amt + (5 - i) * 0.07)))));
  };
  for (const n of ['sky_day', 'house_green', 'trim', 'roof', 'red', 'grass', 'pine', 'yellow', 'denim', 'hair_dark', 'hair_brown', 'skin_peach', 'navy', 'white_cloth', 'concrete', 'wood_pale']) fadeRamp(n, 0.3);

  PX.cg('cg_polaroid', {
    times: ['flashlight'],
    draw(s, o) {
      const rng = o.rng, WP = P.wood_pale;
      /* old pine boards, grey with dust */
      for (let y = -2, row = 0; y < H; y += 13, row++) {
        const base = 3 - (row % 3 === 1 ? 1 : 0);
        s.rect(0, y, W, 13, WP[base]);
        s.hline(0, W - 1, y, WP[1]); s.hline(0, W - 1, y + 1, WP[base + 1]);
        for (let k = 0; k < 9; k++) { const gx = rng.int(0, W - 20), gy = y + rng.int(3, 11); s.hline(gx, gx + rng.int(6, 22), gy, WP[base - 1]); }
        for (let x = rng.int(10, 70); x < W; x += rng.int(70, 120)) { s.vline(x, y + 1, y + 12, WP[1]); s.px(x + 3, y + 4, P.metal[1]); s.px(x + 3, y + 9, P.metal[1]); }
        if (row % 2) { const kx = rng.int(20, 300); s.ellipse(kx, y + 7, 3, 2, WP[base - 1]); s.px(kx, y + 7, WP[1]); }
      }
      // dust lies thick away from where the box was dragged out
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const drag = x > 150 && Math.abs((y - 64) - (x - 230) * 0.08) < 20;
        if (drag) continue;
        const n = fbm(x, y, 41, 30);
        if (qd(n * 2.4, x, y, 6) >= 2) { const v = s.get(x, y); s.px(x, y, (((v & 0x7ff0) >> 4) === P.wood_pale.id) ? P.stone_warm[Math.min(5, (v & 15) + 1)] : v); }
      }
      /* the open box from behind the loose board, its lid beside it */
      box(s, rng);
      /* the Polaroid */
      const X0 = 102, Y0 = 2, PW = 108, PH = 129;
      shiftR(s, X0 + 3, Y0 + 3, PW, PH, -2); shiftR(s, X0 + 5, Y0 + 5, PW, PH, -1, 0.5);
      const WC = P.white_cloth;
      s.rect(X0, Y0, PW, PH, WC[4]);
      s.hline(X0, X0 + PW - 1, Y0, WC[5]); s.vline(X0, Y0, Y0 + PH - 1, WC[5]);
      s.hline(X0, X0 + PW - 1, Y0 + PH - 1, WC[2]); s.vline(X0 + PW - 1, Y0, Y0 + PH - 1, WC[3]);
      // yellowing and scuffs on the border
      for (let y = Y0 + 1; y < Y0 + PH - 1; y++) for (let x = X0 + 1; x < X0 + PW - 1; x++) { const n = fbm(x, y, 5, 14); if (n > 0.6 && PX.bayer(x, y) < (n - 0.6) * 6) s.px(x, y, n > 0.7 ? P.paper[4] : P.paper[5]); }
      const IX = X0 + 6, IY = Y0 + 7, IS = 96;
      s.rect(IX - 1, IY - 1, IS + 2, IS + 2, WC[2]);
      s.clip([IX, IY, IS, IS], () => photo(s, IX, IY, IS));
      // the caption, in marker
      const cap = "Me + Gussie, July '81", fo = { bold: true, space: 3, sp: 1 };
      const cw = measure(cap, fo);
      write(s, X0 + Math.round((PW - cw) / 2), Y0 + IS + 13, cap, P.cg_marker[2], Object.assign({ rng: PX.rng('june:polaroid'), wobble: 0.12, slope: -0.03 }, fo));
      /* dust in the beam */
      for (const [x, y] of [[96, 40], [214, 22], [128, 118], [200, 96], [86, 88], [222, 70], [150, 6], [182, 124]]) { s.px(x, y, E(P.paper[4])); s.px(x + 1, y, P.paper[3]); }
      /* the flashlight: a warm-white pool on the photo, falling off into the dark */
      s.light('white', 156, 66, 96, 92, 1.25, { core: 0.62 });
      s.light('warm', 158, 70, 150, 112, 0.9, { core: 0.3 });
    }
  });

  /* the photograph: June in her yellow sweater holding Gus on her hip in front
   * of the green house, summer 1981. Faded: low contrast, warm, her face gone. */
  function photo(s, x, y, n) {
    const F = (k) => P['cg_f_' + k], at = (px, py) => [x + px, y + py];
    const R0 = (px, py, w, h, c) => s.rect(x + px, y + py, w, h, c);
    // sky and the maple in full leaf
    s.vgrad(x, y, n, 34, [F('sky_day')[3], F('sky_day')[4], F('sky_day')[5]], 3);
    s.foliage(x + 84, y + 14, 18, 20, [F('grass'), F('pine')], { rng: PX.rng('photo:maple'), clusters: 26, blob: 3.2 });
    s.rect(x + 84, y + 30, 4, 32, F('hair_brown')[2]);
    // the house: gable, Gus's window up top, the porch roof, the porch
    const G = F('house_green'), T = F('trim');
    s.poly([[x - 4, y + 28], [x + 46, y - 6], [x + 96, y + 28]], G[3]);
    s.clip([[x - 4, y + 28], [x + 46, y - 6], [x + 96, y + 28]], () => { for (let yy = y - 6; yy < y + 30; yy += 3) { s.hline(x - 4, x + 96, yy, G[4]); s.hline(x - 4, x + 96, yy + 2, G[2]); } });
    s.line(x - 4, y + 28, x + 46, y - 6, T[4]); s.line(x + 46, y - 6, x + 96, y + 28, T[3]);
    R0(36, 6, 20, 18, T[4]); R0(38, 8, 16, 14, F('sky_day')[2]); s.vline(x + 46, y + 8, y + 21, T[4]); s.hline(x + 38, x + 53, y + 15, T[4]);
    R0(39, 9, 4, 5, F('sky_day')[4]);
    R0(0, 30, n, 6, F('roof')[3]); s.hline(x, x + n - 1, y + 30, F('roof')[4]); s.hline(x, x + n - 1, y + 36, T[4]); s.hline(x, x + n - 1, y + 37, T[3]);
    R0(0, 38, n, 34, G[2]);
    for (let yy = y + 38; yy < y + 72; yy += 3) s.hline(x, x + n - 1, yy, G[3]);
    R0(6, 44, 24, 18, T[4]); R0(8, 46, 20, 14, F('sky_day')[1]); s.vline(x + 18, y + 46, y + 59, T[4]);
    R0(60, 42, 13, 30, T[3]); R0(61, 43, 11, 29, F('red')[3]); R0(63, 45, 7, 5, F('red')[4]); s.px(x + 70, y + 58, F('yellow')[5]);
    for (const px2 of [2, 34, 56, 78]) { R0(px2, 38, 3, 34, T[4]); s.vline(x + px2 + 2, y + 38, y + 71, T[3]); }
    R0(0, 58, n, 2, T[4]); for (let xx = 1; xx < n; xx += 3) s.vline(x + xx, y + 60, y + 70, T[3]);
    R0(0, 70, n, 3, F('wood_pale')[3]); R0(0, 73, n, 3, F('concrete')[3]);
    // the lawn
    R0(0, 76, n, 20, F('grass')[4]);
    for (let k = 0; k < 40; k++) { const gx = (k * 37) % n, gy = 77 + ((k * 11) % 18); s.px(x + gx, y + gy, F('grass')[k % 3 ? 3 : 5]); }
    s.ellipse(x + 40, y + 92, 18, 3, F('grass')[2]);
    // June: dark bob, yellow sweater, jeans, holding Gus on her left hip
    const SK = F('skin_peach'), HR = F('hair_dark'), YL = F('yellow'), DN = F('denim'), WS = F('white_cloth');
    s.ellipse(x + 39, y + 90, 16, 3, F('grass')[2]);                                                 // her shadow on the lawn
    s.poly([[x + 32, y + 63], [x + 39, y + 63], [x + 38.5, y + 88], [x + 33, y + 88]], DN[3]); s.vline(x + 33, y + 64, y + 87, DN[4]);
    s.poly([[x + 39.5, y + 63], [x + 46, y + 63], [x + 45.5, y + 88], [x + 40, y + 88]], DN[2]); s.vline(x + 45, y + 64, y + 87, DN[1]);
    R0(31, 87, 8, 3, WS[4]); R0(40, 87, 7, 3, WS[3]); s.hline(x + 31, x + 38, y + 89, WS[2]); s.hline(x + 40, x + 46, y + 89, WS[2]);
    s.poly([[x + 31, y + 39], [x + 47, y + 39], [x + 49, y + 44], [x + 47.5, y + 64], [x + 30.5, y + 64], [x + 29, y + 44]], YL[4]);
    s.line(x + 30, y + 42, x + 31, y + 63, YL[5]); s.line(x + 48, y + 44, x + 47, y + 63, YL[3]); s.hline(x + 31, x + 47, y + 63, YL[3]);
    s.hline(x + 31, x + 47, y + 61, YL[3]);                                                         // ribbed hem
    s.poly([[x + 29, y + 41], [x + 25, y + 48], [x + 25, y + 60], [x + 29, y + 60], [x + 30, y + 47]], YL[4]); s.vline(x + 25, y + 48, y + 59, YL[5]);   // her right arm, sleeve
    R0(25, 60, 4, 3, SK[4]); s.px(x + 25, y + 62, SK[3]);                                          // hand
    R0(36, 35, 6, 5, SK[4]); s.vline(x + 41, y + 35, y + 38, SK[3]);                               // neck
    s.ellipse(x + 39, y + 27.5, 8, 8.5, HR[2]); R0(31, 27, 16, 8, HR[2]);                           // the bob
    s.px(x + 31, y + 34, HR[1]); s.px(x + 46, y + 34, HR[1]); s.vline(x + 32, y + 26, y + 34, HR[3]); s.line(x + 34, y + 20, x + 38, y + 19, HR[3]);
    s.ellipse(x + 39.5, y + 30.5, 5.5, 6, WS[5]);                                                  // her face, burned out to white
    R0(33, 23, 13, 3, HR[2]); s.hline(x + 34, x + 45, y + 25, HR[1]);                               // blunt bangs
    s.px(x + 37, y + 33, SK[3]); s.px(x + 38, y + 34, SK[3]); s.px(x + 39, y + 34, SK[3]); s.px(x + 40, y + 34, SK[3]); s.px(x + 41, y + 33, SK[3]);   // what's left: her smile
    // little Gus on her hip: a messy brown bob, a scowl, a striped shirt, one shoe untied
    const GH = F('hair_brown'), NV = F('navy');
    R0(46, 53, 4, 9, SK[3]); R0(51, 53, 4, 10, SK[4]); s.vline(x + 49, y + 53, y + 61, SK[2]);        // legs
    R0(45, 61, 5, 3, WS[4]); s.hline(x + 45, x + 49, y + 63, WS[2]); R0(51, 62, 5, 3, WS[4]); s.hline(x + 51, x + 55, y + 64, WS[2]);   // sneakers
    s.line(x + 55, y + 65, x + 57, y + 70, WS[3]); s.line(x + 53, y + 65, x + 53, y + 69, WS[3]);      // the untied laces
    R0(45, 49, 11, 5, DN[3]); s.hline(x + 45, x + 55, y + 53, DN[2]);                                  // shorts
    s.poly([[x + 45, y + 38], [x + 55, y + 38], [x + 57, y + 41], [x + 56, y + 50], [x + 44, y + 50]], WS[4]);
    for (let yy = y + 40; yy < y + 50; yy += 3) s.hline(x + 44, x + 56, yy, NV[3]);                    // stripes
    s.vline(x + 56, y + 40, y + 49, NV[2]);
    s.line(x + 46, y + 39, x + 43, y + 42, WS[4]); s.px(x + 42, y + 42, SK[4]);                       // her arm round June's neck
    s.ellipse(x + 50.5, y + 32, 5.5, 5.5, SK[4]); s.px(x + 46, y + 33, SK[3]); s.vline(x + 55, y + 31, y + 34, SK[3]);
    s.ellipse(x + 50.5, y + 28, 6.5, 4, GH[2]); R0(44, 28, 3, 9, GH[2]); R0(55, 28, 3, 8, GH[2]);         // a messy bob to her jaw
    s.px(x + 44, y + 37, GH[1]); s.px(x + 57, y + 36, GH[1]); s.px(x + 52, y + 24, GH[3]); s.px(x + 48, y + 25, GH[3]); s.px(x + 58, y + 30, GH[2]);
    R0(46, 27, 3, 1, GH[1]); s.px(x + 54, y + 27, F('red')[4]); s.px(x + 55, y + 27, F('red')[3]);    // fringe, a red barrette
    s.line(x + 47, y + 30, x + 49, y + 31, GH[1]); s.line(x + 54, y + 30, x + 52, y + 31, GH[1]);       // the scowl
    s.px(x + 48, y + 32, NV[1]); s.px(x + 53, y + 32, NV[1]);
    s.hline(x + 49, x + 52, y + 35, SK[2]); s.px(x + 48, y + 36, SK[2]); s.px(x + 53, y + 36, SK[2]);
    s.poly([[x + 46, y + 42], [x + 49, y + 46], [x + 50, y + 49], [x + 44, y + 52], [x + 40, y + 50], [x + 41, y + 46]], YL[4]);   // June's arm under her
    s.line(x + 40, y + 50, x + 44, y + 52, YL[3]); s.line(x + 44, y + 52, x + 50, y + 49, YL[3]); R0(50, 47, 4, 3, SK[4]); s.px(x + 53, y + 49, SK[3]);
    // the fade: a light leak from the corner, a darker rim, the bloom round June's face
    shiftIn(s, x + n - 30, y, x + n - 1, y + 30, 1, (px, py) => (px - x - n) ** 2 + (py - y) ** 2 < 900, 0.6);
    shiftIn(s, x + n - 19, y, x + n - 1, y + 19, 1, (px, py) => (px - x - n) ** 2 + (py - y) ** 2 < 330, 0.5);
    shiftIn(s, x, y, x + n - 1, y + n - 1, -1, (px, py) => px < x + 3 || py > y + n - 4 || px > x + n - 3, 0.5);
    shiftIn(s, x + 31, y + 20, x + 48, y + 40, 1, (px, py) => (px - x - 39.5) ** 2 / 64 + (py - y - 30) ** 2 / 90 < 1, 0.6);
  }

  /* the box Mémère hid behind the loose board, opened */
  function box(s, rng) {
    const CB = P.cg_cardboard;
    // the lid, set down at the top right: NE PAS JETER in her careful old hand
    shiftR(s, 231, -4, 92, 34, -1);
    s.rect(228, -6, 92, 34, CB[3]); s.hline(228, 319, 27, CB[1]); s.vline(228, -6, 27, CB[4]);
    s.rect(231, -6, 86, 30, CB[4]); s.hline(231, 316, 23, CB[2]);
    for (let k = 0; k < 6; k++) s.hline(rng.int(232, 280), rng.int(282, 314), rng.int(0, 20), CB[3]);
    write(s, 238, 8, 'NE PAS JETER', P.ink[2], { slant: 0.2, sp: 1, rng: PX.rng('memere'), wobble: 0.06 });
    s.hline(238, 300, 16, P.ink[3]);
    // the box itself, cropped by the frame on the right
    const bx = 236, by = 40;
    shiftR(s, bx + 3, by + 3, 90, 96, -2);
    s.rect(bx, by, 90, 94, CB[2]);
    s.rect(bx + 4, by + 4, 82, 86, CB[1]);
    s.hline(bx, bx + 89, by, CB[4]); s.vline(bx, by, by + 93, CB[4]); s.hline(bx + 4, bx + 85, by + 4, CB[0]); s.vline(bx + 4, by + 4, by + 89, CB[0]);
    // the open flaps folded back
    s.poly([[bx, by], [bx + 90, by], [bx + 84, by - 10], [bx + 6, by - 10]], CB[3]); s.line(bx + 6, by - 10, bx + 84, by - 10, CB[4]);
    s.poly([[bx, by], [bx - 18, by + 6], [bx - 18, by + 88], [bx, by + 94]], CB[3]); s.line(bx - 18, by + 6, bx - 18, by + 88, CB[4]); s.vline(bx - 1, by, by + 93, CB[1]);
    s.poly([[bx, by + 94], [bx + 90, by + 94], [bx + 84, by + 104], [bx + 6, by + 104]], CB[2]);
    // inside: five tapes, the notebook with the lightning bolt, the bleached ID
    const nb = [bx + 10, by + 46, 40, 30];
    s.rect(nb[0] + 2, nb[1] + 2, nb[2], nb[3], CB[0]);
    s.rect(nb[0], nb[1], nb[2], nb[3], P.navy[3]); s.hline(nb[0], nb[0] + nb[2] - 1, nb[1], P.navy[4]); s.vline(nb[0] + 2, nb[1], nb[1] + nb[3] - 1, P.navy[1]);
    s.poly([[nb[0] + 22, nb[1] + 4], [nb[0] + 15, nb[1] + 15], [nb[0] + 20, nb[1] + 15], [nb[0] + 14, nb[1] + 27], [nb[0] + 27, nb[1] + 12], [nb[0] + 21, nb[1] + 12], [nb[0] + 26, nb[1] + 4]], P.yellow[4]);
    s.rect(bx + 54, by + 52, 26, 17, P.white_cloth[3]); s.rect(bx + 56, by + 54, 8, 10, P.white_cloth[5]); for (let k = 0; k < 3; k++) s.hline(bx + 66, bx + 77, by + 55 + k * 3, P.white_cloth[2]); s.hline(bx + 54, bx + 79, by + 52, P.maroon[3]);
    const tape = (tx, ty, lab) => {
      s.rect(tx + 1, ty + 1, 26, 17, CB[0]);
      s.rect(tx, ty, 26, 17, P.cg_charcoal[3]); s.hline(tx, tx + 25, ty, P.cg_charcoal[5]);
      s.rect(tx + 2, ty + 2, 22, 9, P.paper[4]); s.rect(tx + 7, ty + 6, 12, 4, P.cg_charcoal[1]);
      s.circle(tx + 9, ty + 8, 1.5, P.white_cloth[4]); s.circle(tx + 17, ty + 8, 1.5, P.white_cloth[4]);
      s.hline(tx + 3, tx + 3 + lab, ty + 3, P.navy[3]);
    };
    tape(bx + 10, by + 10, 17); tape(bx + 40, by + 8, 19); tape(bx + 64, by + 14, 14); tape(bx + 22, by + 26, 20); tape(bx + 52, by + 30, 18);
  }
})();
