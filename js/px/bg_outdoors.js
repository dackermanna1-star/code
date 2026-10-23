/* What Derry Keeps — outdoor locations, pixel art.
 *   barrens       day, dusk                — the ravine behind Kansas Street: the stream, the culvert
 *                                            that breathes, Wes's log, the Admiral, the trestle upstream
 *   standpipe     day, dusk, night, quiet  — Memorial Park: the ruined Standpipe above the town;
 *                                            quiet = the Keeper's Lamp burning green on the ring
 *   canal         dusk, lanterns           — the downtown canal between the mill backs;
 *                                            lanterns = the Lantern Float, one lantern going the wrong way
 *   park          afternoon                — Bassey Park: Paul Bunyan and the playground
 *   street_quiet  quiet                    — a residential street on Quiet Night, one TV still on
 * Ramps added here are prefixed od_ so they never collide with other files.
 */
(function () {
  'use strict';
  const P = PX.P, E = PX.E, SH = PX.sh;
  const R = (n, h) => PX.ramp('od_' + n, h);

  /* ------------------------------------------------------------------ */
  /* materials                                                           */
  R('haze', ['#3f4566', '#525a7b', '#677091', '#8088a6', '#9ca3ba', '#bcc0cf']);        // far hills, blue-violet
  R('haze_warm', ['#4a3d52', '#625063', '#7c6571', '#977d7e', '#b1978d', '#c9b2a0']);   // far autumn woods
  R('haze_gold', ['#4f463f', '#695c4c', '#85775c', '#a1926d', '#bbac80', '#d2c59a']);   // far birches
  R('conc', ['#29282c', '#43423f', '#615e56', '#817d71', '#a19d8e', '#c1bca8']);        // culvert concrete
  R('rust', ['#2b1310', '#4b1f15', '#72301b', '#984722', '#ba6631', '#d48a48']);
  R('brook', ['#14140f', '#24241a', '#3a3828', '#545036', '#706a47', '#8f885c']);       // shallow brown stream
  R('cloud_dusk', ['#3c2a50', '#6a3d62', '#a65666', '#d97c68', '#f6ab74', '#ffd79e']);
  R('bronze', ['#2a1a0c', '#4a3012', '#74501c', '#9a7228', '#c09a40', '#e2c46a']);       // plaques, the Lamp's brass
  R('fog', ['#1c2624', '#2e3c39', '#465651', '#62716c', '#83918b', '#a7b3ad']);          // ground fog, teal grey
  R('brick_far', ['#4c3440', '#61414c', '#7a5257', '#946763', '#ad7f72', '#c49a88']);    // the town's brick, hazed by distance
  R('green_far', ['#2c3a3e', '#3a4c48', '#4c6052', '#62775e', '#7c8f6e', '#99a986']);    // the town's trees in September, hazed

  /* ------------------------------------------------------------------ */
  /* tiny pixel font: 5 rows, variable width                             */
  const G = {
    A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
    D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
    G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
    J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
    M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
    P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
    S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
    V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
    Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
    0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
    3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
    6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
    9: ['###', '#.#', '###', '..#', '##.'], '&': ['.#..', '#.#.', '.#..', '#.##', '.##.'], '.': ['.', '.', '.', '.', '#'],
    ',': ['.', '.', '.', '#', '#'], '-': ['..', '..', '##', '..', '..'], "'": ['#', '#', '.', '.', '.'], '!': ['#', '#', '#', '.', '#'],
    '/': ['..#', '..#', '.#.', '#..', '#..'], '+': ['...', '.#.', '###', '.#.', '...']
  };
  /* draw a string; c is a code or fn(x, y, row, col) -> code. o: scale, gap, space, shear (dy per dx) */
  function text(s, str, x, y, c, o = {}) {
    const sc = o.scale || 1, gap = o.gap === undefined ? 1 : o.gap, shear = o.shear || 0;
    let cx = x;
    for (const ch of String(str).toUpperCase()) {
      if (ch === ' ') { cx += (o.space || 2) * sc; continue; }
      const g = G[ch];
      if (!g) { cx += 4 * sc; continue; }
      const w = g[0].length;
      for (let r = 0; r < 5; r++) for (let k = 0; k < w; k++) {
        if (g[r][k] !== '#') continue;
        for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) {
          const px = cx + k * sc + a, py = y + r * sc + b + Math.round((cx + k * sc + a - x) * shear);
          const cc = typeof c === 'function' ? c(px, py, r, k) : c;
          if (cc) s.px(px, py, cc);
        }
      }
      cx += (w + gap) * sc;
    }
    return cx - x - gap * sc;
  }
  const textW = (str, o = {}) => { const sc = o.scale || 1, gap = o.gap === undefined ? 1 : o.gap; let w = 0; for (const ch of String(str).toUpperCase()) w += ch === ' ' ? (o.space || 2) * sc : ((G[ch] ? G[ch][0].length : 3) + gap) * sc; return w - gap * sc; };

  /* ------------------------------------------------------------------ */
  /* shared helpers                                                      */
  /* run a scene's layers in order, each with its own seeded rng (PX.__odprof collects timings when set) */
  function steps(s, arg, fns, tag) {
    for (const f of fns) {
      const t0 = PX.__odprof ? performance.now() : 0;
      f(s, arg, PX.rng(tag + ':' + f.name));
      if (PX.__odprof) PX.__odprof[f.name] = (PX.__odprof[f.name] || 0) + performance.now() - t0;
    }
  }
  const clampR = (r, k) => r[Math.max(0, Math.min(r.length - 1, k))];
  /* a filled band between y = top(x) and y = bot(x); c may be fn(x, y) */
  function band(s, x0, x1, top, bot, c) {
    for (let x = Math.max(0, x0); x <= Math.min(319, x1); x++) {
      const a = Math.round(top(x)), b = Math.round(bot(x));
      for (let y = a; y <= b; y++) { const cc = typeof c === 'function' ? c(x, y, a, b) : c; if (cc) s.px(x, y, cc); }
    }
  }
  /* shift shades of non-emissive pixels inside a bounding box where fn(x, y) holds (faster than a full-frame s.shift) */
  function shiftIn(s, x0, y0, x1, y1, fn, d, dither) {
    for (let y = Math.max(0, y0); y <= Math.min(179, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(319, x1); x++) {
      if (!fn(x, y)) continue;
      if (dither !== undefined && PX.bayer(x, y) >= dither) continue;
      const i = y * 320 + x, v = s.d[i];
      if (v && !(v & 0x8000)) s.d[i] = SH(v, d);
    }
  }
  /* smooth seeded wobble for silhouettes */
  const wob = (seed) => { const r = PX.rng(seed), ph = [r() * 6.28, r() * 6.28, r() * 6.28]; return (x, a, b, c) => Math.sin(x * 0.031 + ph[0]) * a + Math.sin(x * 0.083 + ph[1]) * (b || 0) + Math.sin(x * 0.21 + ph[2]) * (c || 0); };

  /* a rounded boulder: lit top-left, shadow below-right, darker wet base and a contact shadow */
  function rock(s, cx, cy, rx, ry, r, o = {}) {
    const base = o.base === undefined ? 3 : o.base;
    s.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => {
      const l = -nx * 0.55 - ny * 0.85;
      let k = base + (l > 0.55 ? 1 : l < -0.35 ? -1 : 0);
      if (l > 0.82 && rx > 2) k = base + 2;
      if (o.wet && ny > 0.35) k = Math.min(k, base - 1);
      if (nx * nx + ny * ny > 0.72 && (ny > 0 || nx > 0.3)) k = Math.min(k, base - 1);
      return clampR(r, k);
    });
    if (o.outline !== false) s.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => (nx * nx + ny * ny > 0.78 && ny > 0.1 ? clampR(r, base - 2) : 0));
  }

  /* leaf litter: 2–3 pixel leaves, never single specks. region fn(x,y) optional */
  function leaves(s, x0, y0, w, h, colors, n, rng, region) {
    for (let i = 0; i < n; i++) {
      const x = x0 + rng.int(0, w - 1), y = y0 + rng.int(0, h - 1);
      if (region && !region(x, y)) continue;
      const c = colors[rng.int(0, colors.length - 1)], k = rng.int(0, 3);
      s.px(x, y, c);
      if (k === 0) s.px(x + 1, y, SH(c, -1));
      else if (k === 1) { s.px(x + 1, y, c); s.px(x, y + 1, SH(c, -1)); }
      else if (k === 2) { s.px(x - 1, y, SH(c, 1)); s.px(x + 1, y, SH(c, -1)); }
      else { s.px(x + 1, y + 1, SH(c, -1)); s.px(x, y - 1, SH(c, 1)); }
    }
  }

  /* a birch: slim white trunk, lit left, dark lenticels, dark rough base. lean = px per 10 px */
  function birch(s, x, yTop, yBase, w, rng, o = {}) {
    const B = o.ramp || P.birch, lean = o.lean || 0, sh = o.shade || 0;
    for (let y = yTop; y <= yBase; y++) {
      const t = (yBase - y) / Math.max(1, yBase - yTop);
      const ww = Math.max(1, Math.round(w * (1 - t * 0.45)));
      const xx = Math.round(x + (yBase - y) * lean / 10);
      for (let k = 0; k < ww; k++) {
        let c = k === 0 ? 5 : k === ww - 1 && ww > 1 ? 2 : 4;
        if (ww >= 4 && k === ww - 2) c = 3;
        s.px(xx + k, y, clampR(B, c + sh));
      }
      if (o.edge !== false && ww > 1) s.px(xx + ww, y, clampR(B, 1 + sh));
    }
    // lenticels: short dark dashes, denser and wider near the base
    for (let y = yTop + 2; y < yBase - 1; y += rng.int(2, 5)) {
      const t = (yBase - y) / Math.max(1, yBase - yTop), ww = Math.max(1, Math.round(w * (1 - t * 0.45)));
      const xx = Math.round(x + (yBase - y) * lean / 10);
      const len = Math.min(ww, rng.int(1, ww > 2 ? 2 : 1) + (t < 0.15 ? 1 : 0));
      const at = xx + rng.int(0, Math.max(0, ww - len));
      s.hline(at, at + len - 1, y, clampR(B, rng() < 0.5 ? 0 : 1));
    }
    // the rough dark base
    const bx = Math.round(x);
    for (let y = yBase - Math.round(w * 1.2); y <= yBase; y++) if (rng() < 0.7) s.px(bx + rng.int(0, w - 1), y, clampR(B, 1));
  }

  /* bare twigs fanning up from a point (for crowns and dead branches) */
  function twigs(s, x, y, n, len, c, rng, spread = 0.9) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (rng() - 0.5) * 2 * spread, l = len * rng.range(0.6, 1);
      const x1 = x + Math.cos(a) * l, y1 = y + Math.sin(a) * l;
      s.line(x, y, x1, y1, c);
    }
  }

  /* staghorn sumac: a scarlet mass, drooping leaflets at the rim, dark fruit cones */
  function sumac(s, cx, cy, rx, ry, rng, o = {}) {
    const ramps = o.ramps || [P.leaf_red, P.leaf_red, P.leaf_orange];
    s.foliage(cx, cy, rx, ry, ramps, { rng, clusters: Math.round(rx * ry / 5), blob: 2.4 });
    // drooping leaflets along the lower rim
    for (let i = 0; i < rx * 1.2; i++) {
      const a = rng.range(0.15, Math.PI - 0.15), x = cx + Math.cos(a) * rx * 0.95, y = cy + Math.sin(a) * ry * 0.9;
      const c = rng() < 0.5 ? P.leaf_red[2] : P.leaf_red[3];
      s.px(x, y, c); s.px(x + (Math.cos(a) > 0 ? 1 : -1), y + 1, SH(c, -1));
    }
    // fruit cones on top
    const nc = o.cones === undefined ? Math.max(1, Math.round(rx / 5)) : o.cones;
    for (let i = 0; i < nc; i++) {
      const x = Math.round(cx + rng.range(-rx * 0.6, rx * 0.6)), y = Math.round(cy - ry * rng.range(0.55, 0.85));
      s.rect(x, y - 2, 2, 3, P.maroon[2]); s.px(x, y - 3, P.maroon[3]); s.px(x, y - 2, P.maroon[4]);
    }
  }

  /* bracken / weeds along a bank: short arcs */
  function weeds(s, x0, x1, yFn, ramp, rng, o = {}) {
    for (let x = x0; x < x1; x += rng.int(1, o.step || 3)) {
      const y = Math.round(yFn(x)), h = rng.int(o.min || 2, o.max || 5), lean = rng() < 0.5 ? -1 : 1;
      for (let k = 0; k < h; k++) s.px(x + (k > h / 2 ? lean : 0), y - k, clampR(ramp, (o.base || 2) + (k > h * 0.6 ? 1 : 0)));
    }
  }

  /* piecewise-linear function through [[k, v], ...] (k ascending) */
  const pw = (pts) => (k) => {
    if (k <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (k <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * (k - a[0]) / (b[0] - a[0]); }
    return pts[pts.length - 1][1];
  };
  /* a tiny hand-drawn sprite from strings; pal maps characters to codes ('.' and ' ' are clear) */
  function spr(s, x, y, rows, pal, o = {}) {
    for (let r = 0; r < rows.length; r++) for (let k = 0; k < rows[r].length; k++) {
      const ch = rows[r][o.flip ? rows[r].length - 1 - k : k];
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch]; if (c) s.px(x + k, y + r, c);
    }
  }
  /* pebbles: small stones of 2–4 px with a lit top and a dark underside */
  function pebbles(s, n, rng, inside, ramp, o = {}) {
    const box = o.box || [0, 0, 320, 180];
    for (let i = 0; i < n; i++) {
      const x = box[0] + rng.int(0, box[2] - 1), y = box[1] + rng.int(0, box[3] - 1);
      if (!inside(x, y)) continue;
      const w = rng.int(2, o.max || 3), k = rng.pick(o.shades || [2, 3, 3, 4]);
      s.hline(x, x + w - 1, y, ramp[k]); s.px(x, y, ramp[Math.min(5, k + 1)]);
      s.hline(x, x + w - 1, y + 1, ramp[Math.max(0, k - 2)]);
    }
  }
  /* dead bracken: rusty fronds arching left and right */
  function bracken(s, x, y, h, rng, o = {}) {
    const r = o.ramp || P.leaf_orange, base = o.base === undefined ? 1 : o.base;
    for (let f = 0; f < (o.fronds || 3); f++) {
      const dir = f % 2 ? 1 : -1, len = h * rng.range(0.6, 1);
      let px = x + rng.int(-1, 1), py = y;
      for (let k = 0; k < len; k++) {
        const t = k / len;
        px += dir * (t > 0.35 ? 0.8 : 0.25); py -= t < 0.6 ? 1 : 0.2;
        s.px(px, py, clampR(r, base + (t > 0.5 ? 1 : 0)));
        if (k % 2 === 0 && t > 0.2) s.px(px + dir, py + 1, clampR(r, base + (t > 0.7 ? 2 : 1)));
      }
    }
  }

  /* ================================================================== */
  /* THE BARRENS                                                         */
  /* We stand on the near bank looking upstream. The Kenduskeag comes out */
  /* of the woods under the trestle, swings right past the culvert in the */
  /* cut bank, and runs past our feet. Wes's log lies on the gravel bar.  */
  PX.bg('barrens', {
    times: ['day', 'dusk'],
    draw(s, o) {
      const dusk = o.time === 'dusk';
      steps(s, dusk, [bSky, bRidge, bTrestle, bUpstream, bRightWoods, bFarBank, bCulvert, bStream, bNearBank, bFrame, bLight], 'b');
    }
  });
  /* geometry: the far water line y(x), the near water line x(y), the brow of the far bank y(x) */
  const bWL = pw([[100, 86], [130, 88], [160, 91], [190, 95], [220, 99], [250, 104], [275, 108], [300, 111], [330, 114]]);
  const bNL = pw([[86, 101], [92, 104], [98, 110], [104, 120], [110, 132], [116, 144], [122, 153], [128, 159], [140, 163], [160, 165], [181, 163]]);
  const bBrow = pw([[96, 83], [130, 82], [160, 81], [190, 79], [214, 76], [236, 72], [246, 66], [258, 62], [276, 62], [290, 67], [304, 69], [330, 67]]);
  const bCut = (x) => bWL(x) - (2.5 + Math.max(0, x - 100) * 0.03 + Math.max(0, bCutH(x, 1.6, 1.2, 0.8)));
  const inStream = (x, y) => { x = Math.floor(x); y = Math.floor(y); return y >= 86 && y < 180 && x >= 0 && x < 320 && y > B_WLa[x] && x > B_NLa[y]; };
  const inNear = (x, y) => { x = Math.floor(x); y = Math.floor(y); return y >= 86 && y < 180 && x <= B_NLa[y]; };
  /* the Admiral: a one-eyed grey tom. Day: sitting up in his patch of sun. Dusk: head down at the tin. */
  const bPathL = pw([[86, 82], [90, 78], [100, 68], [115, 54], [130, 40], [150, 22], [180, 0]]);
  const bPathR = pw([[86, 90], [90, 90], [100, 86], [115, 80], [130, 74], [150, 66], [180, 58]]);
  const B_CUL = [262, 93, 12, 16];

  function bSky(s, dusk, rng) {
    if (!dusk) {
      s.vgrad(0, 0, 320, 92, [E(P.sky_day[2]), E(P.sky_day[3]), E(P.sky_day[4]), E(P.sky_day[5])], 4);
      s.cloud(150, 12, 44, 9, { emit: true, rng });
      s.cloud(234, 7, 24, 6, { emit: true, rng });
      s.cloud(98, 22, 24, 5, { emit: true, rng, top: 3 });
    } else {
      s.vgrad(0, 0, 320, 92, [E(P.sky_dusk[1]), E(P.sky_dusk[2]), E(P.sky_dusk[3]), E(P.sky_dusk[4]), E(P.sky_dusk[5])], 4);
      // the sun just down behind the woods upstream
      s.ellipse(100, 50, 84, 14, E(P.sky_dusk[5]));
      s.ellipse(100, 52, 40, 6, E(P.od_cloud_dusk[5]));
      const cd = P.od_cloud_dusk;
      s.cloud(160, 13, 60, 7, { emit: true, ramp: cd, top: 4, rng });
      s.cloud(244, 22, 36, 6, { emit: true, ramp: cd, top: 3, rng });
      s.hline(110, 210, 17, E(cd[2])); s.hline(126, 196, 18, E(cd[2]));
      s.hline(60, 120, 38, E(cd[4])); s.hline(70, 108, 39, E(cd[3]));
    }
  }

  function bRidge(s, dusk, rng) {
    const H = P.od_haze, fw = wob('b-ridge');
    const ridge = (x) => 48 + fw(x, 2.5, 1.2) - Math.max(0, (70 - x) * 0.5);
    band(s, 0, 319, ridge, () => 92, H[4]);
    for (let x = 0; x < 320; x++) s.px(x, Math.round(ridge(x)), H[5]);
    for (let x = 2; x < 320; x += rng.int(3, 6)) {
      const y = Math.round(ridge(x)) + 1, h = rng.int(2, 5);
      for (let k = 0; k < h; k++) { const hw = Math.floor((h - k) / 2.2); s.hline(x - hw, x + hw, y - k, H[3]); }
    }
  }

  function bTrestle(s, dusk) {
    // the old timber rail trestle crossing the ravine upstream: deck, ties, splayed bents with X bracing
    const H = P.od_haze, deck = 32, x0 = 10, x1 = 238, bot = 66;
    const leg = dusk ? H[2] : H[4], brace = dusk ? H[1] : H[3];
    for (let bx = x0 + 6; bx < x1; bx += 12) {
      const top = deck + 2;
      s.line(bx - 1, top, bx - 4, bot, leg); s.line(bx + 1, top, bx + 4, bot, leg);
      for (let y = top + 3; y < bot; y += 9) {
        const hw = 1 + (y - top) * 3 / (bot - top), y2 = Math.min(bot, y + 9), hw2 = 1 + (y2 - top) * 3 / (bot - top);
        s.hline(Math.round(bx - hw), Math.round(bx + hw), y, brace);
        s.line(Math.round(bx - hw), y, Math.round(bx + hw2), y2, brace);
        s.line(Math.round(bx + hw), y, Math.round(bx - hw2), y2, brace);
      }
    }
    s.rect(x0, deck, x1 - x0, 2, dusk ? H[2] : H[3]); s.hline(x0, x1 - 1, deck + 1, dusk ? H[1] : H[2]);
    for (let x = x0; x < x1; x += 3) s.px(x, deck - 1, H[2]);
    s.hline(x0, x1 - 1, deck - 2, dusk ? H[2] : H[3]);
  }

  function bUpstream(s, dusk, rng) {
    // the woods the stream comes out of: hazy, lower contrast, a few pale trunks
    const uw = wob('b-up');
    const top = (x) => 54 + uw(x, 3, 2, 1);
    band(s, 0, 236, top, () => 94, P.od_haze_warm[2]);
    for (let x = -4; x < 240; x += rng.int(6, 9)) {
      const rr = rng() < 0.45 ? P.od_haze_gold : P.od_haze_warm;
      s.foliage(x, top(x) + 4, rng.int(6, 9), rng.int(5, 6), [rr], { rng, clusters: 10, blob: 2.6 });
    }
    for (const x of [26, 70, 128]) s.pine(x, Math.round(top(x)) + 16, rng.int(16, 20), P.od_haze, { rng, light: 1 });
    for (let x = -2; x < 240; x += rng.int(8, 11)) {
      const pick = rng();
      const rr = pick < 0.4 ? [P.od_haze_gold, P.leaf_gold] : pick < 0.75 ? [P.od_haze_warm, P.leaf_orange] : [P.od_haze_warm, P.leaf_red];
      s.foliage(x, top(x) + 15 + rng.int(-1, 2), rng.int(7, 10), rng.int(5, 7), rr, { rng, clusters: 12, blob: 2.8 });
    }
    for (const x of [44, 52, 96, 110, 150, 162]) birch(s, x, Math.round(top(x)) + 22, 92, 2, rng, { ramp: P.od_haze_gold, edge: false });
    band(s, 0, 236, (x) => 87 + uw(x * 2, 1.2, 0.8), () => 94, P.od_haze_warm[1]);
    if (dusk) { const tt = new Float32Array(240); for (let x = 0; x < 240; x++) tt[x] = top(x) + 2; shiftIn(s, 0, 50, 235, 94, (x, y) => y > tt[x], -1); }
  }

  function bRightWoods(s, dusk, rng) {
    // the woods on the far bank: nearer, taller, saturated
    const rw = wob('b-rw');
    const top = (x) => 44 - (x - 176) * 0.17 + rw(x, 2.5, 1.5, 0.8);
    band(s, 176, 319, top, (x) => bBrow(x) + 2, P.leaf_orange[1]);
    const crowns = [];
    for (let x = 172; x < 330; x += rng.int(8, 12)) crowns.push([x, top(x) + rng.int(6, 10), rng.int(10, 14), rng.int(8, 10)]);
    for (let x = 178; x < 330; x += rng.int(10, 14)) crowns.push([x, top(x) + rng.int(20, 26), rng.int(10, 13), rng.int(7, 9)]);
    for (const [x, y, rx, ry] of crowns) {
      const pick = rng();
      const rr = pick < 0.4 ? [P.leaf_gold, P.leaf_gold, P.leaf_orange] : pick < 0.7 ? [P.leaf_orange, P.leaf_gold] : pick < 0.88 ? [P.leaf_red, P.leaf_orange] : [P.grass_fall, P.leaf_gold];
      s.foliage(x, y, rx, ry, rr, { rng, clusters: Math.round(rx * ry / 6), blob: 3.2 });
    }
    // a dark spruce in the gap between the stage positions
    s.pine(197, Math.round(bBrow(197)) + 2, 42, P.pine, { rng, w: 9 });
    // pale trunks standing up out of the bank under the crowns
    for (const [x, w] of [[186, 3], [210, 2], [290, 3], [305, 4], [314, 2]]) birch(s, x, Math.round(top(x)) + 22, Math.round(bBrow(x)) + 1, w, rng, { lean: rng.range(-0.6, 0.6) });
  }

  function bFarBank(s, dusk, rng) {
    // the slope from the brow down to the bare cut: dry grass, bracken, sumac
    band(s, 96, 319, bBrow, bCut, (x, y, a, b) => {
      const f = (y - a) / Math.max(1, b - a), g = P.grass_fall;
      if (y <= a + 1) return g[3];
      if (f > 0.72) return PX.bayer(x, y) < (f - 0.72) * 3 ? g[1] : g[2];
      return f < 0.25 && PX.bayer(x, y) < (0.25 - f) * 2.4 ? g[3] : g[2];
    });
    for (let i = 0; i < 150; i++) {
      const x = rng.int(98, 318), y0 = bBrow(x), y1 = bCut(x);
      if (y1 - y0 < 3) continue;
      const y = Math.round(y0 + rng.range(2, y1 - y0));
      if (rng() < 0.5) bracken(s, x, y, rng.int(3, 6), rng, { fronds: 2 });
      else tuft(s, x, y, rng.int(2, 4), P.grass_fall, rng, { n: 3, base: 2 });
    }
    sumac(s, 132, 81, 12, 5, rng, { cones: 1 });
    sumac(s, 212, 76, 13, 7, rng);
    sumac(s, 304, 72, 15, 8, rng);
    // the bare cut: earth, a dark damp foot, roots hanging out of it, bedded stones
    band(s, 96, 319, bCut, bWL, (x, y, a, b) => (y - a < 1 ? P.dirt[3] : y > b - 2 ? P.dirt[1] : P.dirt[2]));
    for (let x = 100; x < 320; x += rng.int(5, 11)) {
      const a = bCut(x), b = bWL(x); if (b - a < 5) continue;
      const y = Math.round(a + rng.range(2, b - a - 2)), len = rng.int(2, 5);
      s.hline(x, x + len, y, P.dirt[1]); s.hline(x + 1, x + len - 1, y - 1, P.dirt[3]);
    }
    for (let x = 104; x < 320; x += rng.int(6, 12)) {
      if (Math.abs(x - B_CUL[0]) < 22) continue;
      const y0 = Math.round(bCut(x)) + 1, len = Math.min(rng.int(2, 6), Math.round(bWL(x) - y0));
      if (len < 2) continue;
      s.path([[x, y0], [x + rng.int(-1, 1), y0 + len / 2], [x + rng.int(-2, 2), y0 + len]], P.bark[1]);
    }
    for (let i = 0; i < 14; i++) {
      const x = rng.int(104, 316); if (Math.abs(x - B_CUL[0]) < 24) continue;
      const y = Math.round(bWL(x)) - rng.int(1, 2);
      rock(s, x, y, rng.range(1.8, 3.6), rng.range(1.2, 2), P.stone_warm, { base: 2 });
    }
    // grass hanging over the lip of the cut
    for (let x = 96; x < 320; x++) {
      const y = Math.round(bCut(x));
      s.px(x, y, P.grass_fall[1]);
      if ((x * 37) % 11 < 3) { s.px(x, y + 1, P.grass_fall[2]); s.px(x, y + 2, P.grass_fall[1]); }
    }
  }

  function bCulvert(s, dusk, rng) {
    const C = P.od_conc, [cx, cy, ri, ro] = B_CUL;
    // earth dug out around the pipe, grass slumping over its shoulders
    s.ellipse(cx + 1, cy - 1, ro + 6, ro + 5, (x, y, nx, ny) => (ny < -0.55 ? P.dirt[3] : nx > 0.5 ? P.dirt[1] : P.dirt[2]));
    // the barrel's top running back into the hill
    s.ellipse(cx + 2, cy - 3, ro, ro, (x, y, nx, ny) => (ny < -0.45 && nx < 0.3 ? C[3] : C[2]));
    weeds(s, cx - 20, cx + 24, (x) => cy - ro - 3 - Math.max(0, 6 - Math.abs(x - cx - 2) * 0.4), P.grass_fall, rng, { min: 2, max: 6, step: 1, base: 2 });
    for (let x = cx - 18; x < cx + 22; x += 3) bracken(s, x, cy - ro - 1 + Math.abs(x - cx) * 0.1, rng.int(3, 5), rng, { fronds: 2 });
    // the ring face
    s.ellipse(cx, cy, ro, ro, (x, y, nx, ny) => { const l = -nx * 0.6 - ny * 0.8; return l > 0.5 ? C[4] : l > -0.05 ? C[3] : l > -0.6 ? C[2] : C[1]; });
    s.ring(cx, cy, ro, ro, C[1]);
    s.ellipse(cx, cy, ro - 1, ro - 1, (x, y, nx, ny) => (nx * nx + ny * ny > 0.86 && nx < -0.2 && ny < 0.2 ? C[5] : 0));
    // rust streaks down the face, moss crusting the bottom
    for (const [x, len] of [[cx - 10, 7], [cx - 3, 5], [cx + 6, 9], [cx + 12, 5]]) for (let k = 0; k < len; k++) s.px(x + (k > 4 ? 1 : 0), cy - ro + 2 + k, k < 2 ? C[1] : P.od_rust[2]);
    s.ellipse(cx, cy + ro - 2, ro - 2, 3, (x, y, nx, ny) => (ny > -0.4 ? (nx < -0.2 ? P.grass[3] : P.grass[2]) : 0));
    // the mouth: inner wall falling away into black
    s.circle(cx, cy, ri, dusk ? P.ink[1] : C[1]);
    s.circle(cx + 1, cy + 0.5, ri - 2, dusk ? P.ink[0] : P.ink[1]);
    s.circle(cx + 1.5, cy + 0.5, ri - 5, P.ink[0]);
    if (!dusk) s.ellipse(cx, cy, ri - 0.5, ri - 0.5, (x, y, nx, ny) => (ny < -0.78 && nx < 0.4 ? C[2] : 0));
    s.hline(cx - 6, cx + 6, cy + ri - 2, dusk ? P.od_brook[1] : P.od_brook[2]); s.hline(cx - 2, cx + 3, cy + ri - 2, dusk ? P.od_brook[2] : P.od_brook[3]);
    // the crossed lantern scratched into the concrete (a kids' sign: don't go to the light)
    const lx = cx - 14, ly = cy + 1;
    s.px(lx + 1, ly - 1, C[1]); s.rect(lx, ly, 3, 4, C[1]); s.px(lx + 1, ly + 1, C[4]); s.px(lx + 1, ly + 2, C[4]); s.hline(lx, lx + 2, ly + 4, C[1]);
    s.line(lx - 1, ly - 1, lx + 3, ly + 5, C[0]); s.line(lx + 3, ly - 1, lx - 1, ly + 5, C[0]);
    // the grate, hanging off its one hinge at the top left, swung down across the mouth
    const gx = cx - 10, gy = cy - 11, a = 0.6, n = 6, step = 3.3, Rr = P.od_rust;
    const ux = Math.cos(a), uy = Math.sin(a), vx = -Math.sin(a), vy = Math.cos(a);
    const at = (i, j) => [gx + ux * i * step + vx * j * step, gy + uy * i * step + vy * j * step];
    for (let i = 0; i <= n; i++) { const p = at(i, 0), q = at(i, n); s.line(p[0], p[1], q[0], q[1], i === 0 ? Rr[4] : Rr[2]); }
    for (let j = 0; j <= n; j++) { const p = at(0, j), q = at(n, j); s.line(p[0], p[1], q[0], q[1], j === 0 ? Rr[4] : Rr[3]); }
    s.rect(gx - 1, gy - 1, 3, 2, Rr[1]); s.px(gx, gy - 1, Rr[4]);
    // the trickle from the invert, riprap around the outfall
    for (let y = cy + ro - 1; y < bWL(cx) + 2; y++) { s.px(cx, y, P.od_brook[3]); s.px(cx + 1, y, y % 2 ? P.white[2] : P.od_brook[4]); }
    for (const [x, y, w, h] of [[cx - 19, cy + 13, 4, 3], [cx - 12, cy + 16, 3.5, 2.4], [cx + 15, cy + 14, 4.5, 3], [cx + 21, cy + 9, 3.5, 3], [cx - 23, cy + 8, 3, 2.4]]) rock(s, x, y, w, h, P.stone, { base: 3 });
    // cold air breathing out at dusk
    if (dusk) for (let k = 0; k < 3; k++) s.ditherPoly([[cx - 9 + k * 2, cy + 5 + k], [cx + 8, cy + 4 + k], [cx + 16 + k * 3, cy + 9 + k], [cx - 6, cy + 11 + k]], P.od_haze[4], 0.2 - k * 0.05);
  }

  function bStream(s, dusk, rng) {
    const W = P.od_brook, nz = vnoise('b-water', 9);
    const xr = (y) => (y < 114 ? Math.min(320, bWLx(y)) : 320);
    const rm = new Float32Array(180), rh = new Float32Array(180);
    for (let y = 86; y < 180; y++) { const xl = B_NLa[y], w = xr(y) - xl; rm[y] = xl + w * (y < 112 ? 0.5 : 0.4); rh[y] = Math.max(3, w * (y < 112 ? 0.36 : 0.3)); }
    const shade = new Float32Array(320); for (let x = 0; x < 320; x++) shade[x] = 3 + nz(x, 0) * 4;
    // water: shaded under the far bank, the sky held in the open middle, light over the shallows
    for (let y = 86; y < 180; y++) for (let x = Math.ceil(B_NLa[y]); x < 320; x++) {
      if (!inStream(x, y)) continue;
      const d = y - B_WLa[x], sh = x - B_NLa[y];
      let c = W[2];
      if (d < shade[x]) c = W[1];
      else if (1 - Math.abs(x - rm[y]) / rh[y] > 0.55 - nz(x, y * 2) * 0.5) c = W[3];
      else if (sh < 2 + (y - 86) * 0.05) c = W[3];
      s.px(x, y, c);
    }
    // reflections of the far bank: dark, with a few muted dabs of the woods' colours
    const refl = [P.leaf_orange[1], W[0], P.leaf_gold[1], W[0], P.grass_fall[1], W[0], P.leaf_red[1]];
    for (let x = 100; x < 320;) {
      const w = 2 + ((x * 7) % 3), len = 2 + ((x * 11) % 3), a = Math.round(B_WLa[x]) + 1, c = refl[((x * 13) >> 2) % refl.length];
      for (let xx = x; xx < x + w; xx++) for (let y = a; y < a + len - (xx === x + w - 1 ? 1 : 0); y++) if (inStream(xx, y) && y !== a + 2) s.px(xx, y, c);
      x += w + 1 + ((x * 5) % 4);
    }
    // the culvert's black reflection
    for (let y = 0; y < 9; y++) { const half = 11 - y; if (half < 2) break; const off = (y % 3) - 1; s.hline(B_CUL[0] - half + off, B_CUL[0] + half + off - 1, Math.round(B_WLa[B_CUL[0]]) + 2 + y, y % 2 ? W[0] : P.ink[1]); }
    // ripple marks: short strokes, longer and further apart toward us, brightest in the sky ribbon
    const hiLight = dusk ? E(P.sky_dusk[4]) : P.sky_day[3], hiMid = dusk ? E(P.sky_dusk[3]) : W[4];
    for (let bi = 0; bi < 4; bi++) {
      const y0 = [87, 100, 118, 142][bi], y1 = [100, 118, 142, 180][bi], sp = [6, 9, 13, 18][bi], ln = [2, 3, 5, 7][bi];
      scatter(s, 260, rng, [100, y0, 220, y1 - y0], (x, y) => inStream(x, y) && inStream(x + ln, y) && y - B_WLa[x] > 4, sp, (x, y) => {
        const v = s.get(x, y), len = Math.max(2, ln + rng.int(-1, 2));
        const c = v === W[3] ? (rng() < 0.2 ? hiLight : hiMid) : W[3];
        s.hline(x, x + len - 1, y, c);
        if (len > 3) s.hline(x + 1, x + len - 2, y + 1, v === W[3] ? W[2] : W[1]);
      });
    }
    // stones showing through the shallows
    for (let i = 0; i < 22; i++) {
      const y = rng.int(100, 172), x = Math.round(B_NLa[y] + rng.range(3, 16));
      if (!inStream(x, y) || !inStream(x + 4, y + 1)) continue;
      const w = 2 + Math.round((y - 90) / 30); s.hline(x, x + w, y, W[4]); s.hline(x + 1, x + w - 1, y + 1, W[1]);
    }
    // stones in the current, white water curling round their upstream side
    for (const [x, y, rx, ry] of [[118, 92, 2.5, 1.4], [148, 99, 3, 1.6], [224, 104, 3, 1.6], [200, 138, 5.5, 2.6], [292, 128, 6.5, 3], [252, 150, 7, 3.2], [314, 144, 5, 2.6]]) {
      rock(s, x, y, rx, ry, P.stone_warm, { base: 3, wet: true });
      s.line(Math.round(x - rx - 1), Math.round(y + ry * 0.2) + 1, Math.round(x - rx * 0.4), Math.round(y - ry), P.white[3]);
      s.hline(Math.round(x - rx), Math.round(x + rx), Math.round(y + ry) + 1, W[4]);
      s.line(Math.round(x + rx), Math.round(y + ry * 0.4), Math.round(x + rx + 3 + rx * 0.6), Math.round(y + ry + 1), P.white[1]);
    }
    // stepping stones out to the culvert apron (the way Gus crosses to record it)
    for (const [x, y, rx, ry] of [[245, 110, 3.6, 1.6], [232, 114, 4.4, 1.8], [218, 117, 5, 2], [203, 121, 5.4, 2.2], [187, 125, 5.8, 2.4], [172, 129, 6, 2.5]]) {
      rock(s, x, y, rx, ry, P.stone, { base: 3, wet: true });
      s.hline(Math.round(x - rx + 1), Math.round(x + rx - 1), Math.round(y + ry) + 1, W[4]);
    }
    shoppingCart(s, 168, 101, dusk);
  }

  function shoppingCart(s, x, y, dusk) {
    // on its side in the water like it drowned there: the basket floor faces us, wheels to the right
    const C = P.chrome, Rr = P.od_rust, W = P.od_brook;
    const bw = 18, bh = 10, ox = 6, oy = -3;
    // far face first, then the near mesh over it
    s.line(x + ox, y + oy, x + bw + ox, y + oy, C[3]); s.line(x + bw + ox, y + oy, x + bw + ox, y + oy + bh - 2, C[2]);
    for (let k = 0; k <= bw; k += 3) s.line(x + k, y, x + k + ox, y + oy, C[2]);
    for (let k = 0; k <= bw; k += 3) s.vline(x + k, y, y + bh, C[2]);
    for (let k = 0; k <= bh; k += 3) s.hline(x, x + bw, y + k, C[2]);
    s.hline(x, x + bw, y, C[4]); s.vline(x, y, y + bh, C[3]); s.vline(x + bw, y, y + bh, C[1]);
    // the handle, its red plastic grip, the wheels
    s.line(x + bw + 1, y - 1, x + bw + 4, y - 5, C[3]); s.line(x + bw + 4, y - 5, x + bw + 10, y - 7, P.red[4]); s.px(x + bw + 10, y - 7, P.red[2]);
    for (const wx of [x + bw + 2, x + bw + 2 + ox - 2]) { s.rect(wx, y + 5, 2, 2, P.ink[2]); s.px(wx, y + 5, C[3]); }
    for (const [rx, ry] of [[x + 4, y + 4], [x + 13, y + 1], [x + 9, y + 7], [x + 16, y + 5]]) { s.px(rx, ry, Rr[3]); s.px(rx + 1, ry, Rr[2]); }
    // water line
    const wl = y + 7;
    s.rect(x - 1, wl, bw + ox + 6, 4, W[2]);
    for (let k = x; k <= x + bw; k += 3) s.px(k, wl + 1, C[1]);
    s.hline(x - 2, x + bw + 6, wl, W[4]); s.hline(x + 2, x + bw - 2, wl + 2, W[3]);
  }

  function bNearBank(s, dusk, rng) {
    const gz = vnoise('b-grass', 13), lz = vnoise('b-leaf', 8);
    // classify every pixel of our bank once: 1 earth, 2 dry grass, 3 gravel bar, 4 path
    const K = new Uint8Array(320 * 180);
    for (let y = 84; y < 180; y++) {
      const nl = y < 86 ? 99 : B_NLa[y], gwy = 2 + (y - 86) * 0.3 + Math.sin(y * 0.3) * 1.5;
      const pl = B_PLa[Math.max(86, y)] - 1, pr = B_PRa[Math.max(86, y)] + 1;
      for (let x = 0; x <= Math.min(319, nl); x++) {
        let k = 1;
        if (y >= 86 && x > nl - gwy) k = 3;
        else if (x >= pl && x <= pr && y >= 86) k = 4;
        else if (gz(x, y * 1.8) > 0.56 && x < nl - gwy - 5) k = 2;
        K[y * 320 + x] = k;
      }
    }
    const kind = (x, y) => (x < 0 || y < 0 || x > 319 || y > 179 ? 0 : K[(y | 0) * 320 + (x | 0)]);
    for (let i = 0; i < K.length; i++) if (K[i]) s.d[i] = K[i] === 3 ? P.stone_warm[2] : K[i] === 2 ? P.grass_fall[2] : P.dirt[2];
    litter(s, rng, [0, 84, 170, 96], (x, y) => kind(x, y) === 1, [P.leaf_orange[2], P.leaf_gold[2], P.dirt[3], P.camel[2], P.leaf_red[2], P.leaf_orange[3]], 0.11, lz);
    scatter(s, 500, rng, [0, 86, 165, 94], (x, y) => kind(x, y) === 2, 4, (x, y) => tuft(s, x, y, 2 + Math.round((y - 86) / 18), P.grass_fall, rng, { n: rng.int(3, 4), base: 2 }));
    // the gravel bar: pebbles, a damp edge at the water
    pebbles(s, 320, rng, (x, y) => kind(x, y) === 3, P.stone_warm, { box: [60, 86, 120, 94], max: 4 });
    pebbles(s, 90, rng, (x, y) => kind(x, y) === 3, P.stone, { box: [60, 86, 120, 94], max: 3, shades: [2, 3, 4] });
    for (let y = 86; y < 180; y++) { const x = Math.round(B_NLa[y]); s.px(x, y, P.od_brook[4]); s.px(x - 1, y, P.stone_warm[1]); }
    // the path: packed earth, a paler worn middle, roots across it
    for (let y = 86; y < 180; y++) {
      const a = B_PLa[y], b = B_PRa[y], w = b - a, wob1 = Math.sin(y * 0.45) * w * 0.06;
      for (let x = Math.round(a + wob1); x <= Math.round(b + wob1); x++) {
        const f = (x - a - wob1) / Math.max(1, w);
        s.px(x, y, f < 0.08 || f > 0.92 ? P.dirt[2] : f > 0.3 && f < 0.62 ? P.dirt[4] : P.dirt[3]);
      }
    }
    for (const y of [150, 118]) { const a = B_PLa[y] - 4, b = B_PRa[y] + 3; s.line(a, y + 2, b, y - 1, P.bark[1]); s.line(a + 1, y + 1, b - 1, y - 2, P.bark[3]); }
    pebbles(s, 40, rng, (x, y) => kind(x, y) === 4 && x > B_PLa[y | 0] + 2 && x < B_PRa[y | 0] - 2, P.dirt, { box: [0, 100, 110, 80], shades: [2, 3] });
    litter(s, rng, [0, 90, 110, 90], (x, y) => kind(x, y) === 4 && (x < B_PLa[y] + 3 || x > B_PRa[y] - 3), [P.leaf_orange[3], P.leaf_gold[3], P.leaf_red[3]], 0.12, null);
    // ferns toward us
    for (const [x, y, h] of [[24, 150, 9], [44, 166, 10], [12, 132, 8], [66, 176, 9], [78, 146, 7], [6, 172, 9]]) bracken(s, x, y, h, rng, { fronds: 4, base: 1 });
    // bushes and saplings upstream on our side
    for (const [x, y, r] of [[30, 84, 10], [52, 86, 8], [74, 86, 9], [94, 88, 6]]) s.foliage(x, y, r, r * 0.6, [P.od_haze_gold, P.grass_fall, P.leaf_gold], { rng, clusters: Math.round(r * 1.6), blob: 2.6 });
    sumac(s, 66, 86, 8, 4, rng, { cones: 1 });
    birch(s, 84, 60, 88, 2, rng, { lean: 0.6 });
    s.foliage(85, 58, 7, 6, [P.leaf_gold], { rng, clusters: 8, blob: 2.2 });
    // the log on the gravel bar — Wes's log — its far end at the water
    const L0 = [76, 132], L1 = [147, 115];
    const span = L1[0] - L0[0];
    const dia = (t) => Math.round(11 - t * 3.5);
    const yb = (x) => L0[1] + (L1[1] - L0[1]) * (x - L0[0]) / span;
    const logTop = (x) => yb(x) - dia((x - L0[0]) / span) + 1;
    for (let x = L0[0] - 1; x < L1[0] + 4; x++) for (let y = Math.ceil(yb(x)); y < yb(x) + 3; y++) { const v = s.get(x, y); if (v) s.px(x, y, SH(v, -1)); }
    for (let x = L0[0]; x <= L1[0]; x++) {
      const t = (x - L0[0]) / span, D = dia(t), y0 = Math.round(yb(x) - D + 1);
      for (let k = 0; k < D; k++) {
        const f = k / (D - 1);
        let c = f < 0.15 ? P.bark[4] : f < 0.42 ? P.bark[3] : f < 0.78 ? P.bark[2] : P.bark[1];
        if (k === 0 || k === D - 1) c = P.bark[0];
        s.px(x, y0 + k, c);
      }
    }
    for (let i = 0; i < 18; i++) { const x = rng.int(L0[0] + 3, L1[0] - 6), y = Math.round(logTop(x)) + rng.int(3, 6), l = rng.int(3, 7); s.line(x, y, x + l, y - Math.round(l * 0.24), P.bark[1]); s.px(x + 1, y - 1, P.bark[3]); }
    for (let x = L0[0] + 3; x < L1[0] - 4; x += rng.int(6, 11)) { const y = Math.round(logTop(x)); s.hline(x, x + rng.int(2, 4), y, P.grass[3]); s.px(x + 1, y - 1, P.grass[4]); }
    // the near end: sawn rings; a broken branch; the splintered far end at the water
    s.ellipse(L0[0], L0[1] - 5, 2.2, 5.4, (x, y, nx, ny) => (nx * nx + ny * ny > 0.6 ? P.bark[1] : nx * nx + ny * ny > 0.25 ? P.wood_pale[3] : P.wood_pale[4]));
    s.px(L0[0], L0[1] - 5, P.wood_pale[2]);
    s.line(94, Math.round(logTop(94)), 90, Math.round(logTop(94)) - 6, P.bark[2]); s.px(89, Math.round(logTop(94)) - 7, P.bark[4]);
    for (const [dx, dy] of [[2, -6], [3, -4], [2, -2]]) s.line(L1[0], L1[1] + dy, L1[0] + dx, L1[1] + dy - 1, P.wood_pale[3]);
    // the sardine tin and the Admiral
    const tx = 99, ty = Math.round(logTop(99));
    s.rect(tx, ty - 2, 5, 2, P.chrome[3]); s.hline(tx, tx + 4, ty - 2, P.chrome[5]); s.px(tx + 4, ty - 3, P.chrome[4]); s.px(tx + 5, ty - 4, P.chrome[4]);
    admiral(s, 113, Math.round(logTop(114)), dusk);
    // leaves drifted against the foot of the log
    leafDrifts(s, [[104, 131, 20, 3, 24], [128, 124, 8, 2, 8]], [P.leaf_gold[3], P.leaf_orange[3], P.leaf_red[3], P.leaf_gold[4]], rng, (x, y) => kind(x, y) && y > yb(x) + 1);
  }
  function admiral(s, x, y, dusk) {
    const C = P.hair_gray;
    const pal = { o: C[0], d: C[2], m: C[3], l: C[4], h: C[5], e: P.eye_hazel[5], x: C[1], n: P.pink[4] };
    if (!dusk) {
      // sitting in profile facing the tin, head turned a little toward us: one bright eye, one scar
      spr(s, x - 4, y - 13, [
        '.o..o..........',
        '.oloolo........',
        'ollhlmo........',
        'olexmmo........',
        'onlllmo........',
        '.ooommo........',
        '..olmmo.....o..',
        '..olmmmo....od.',
        '..olmmmmo...od.',
        '.olmmmmddo..od.',
        '.olmmmmddo.od..',
        '.olmmmdddood...',
        'ooooooooooo....'
      ], pal);
    } else {
      // crouched at the tin, head down to it, ears up, tail out behind
      spr(s, x - 8, y - 8, [
        '.......oooooo..o',
        '.o.o..ollllmo.od',
        'olool.ommmmmdood',
        'ollmloommmmmmdo.',
        'olexmmmmmmmmddo.',
        '.onmmmmmmmmdddo.',
        '..oolmodddddoo..',
        '...oo.oo..oo....'
      ], pal);
    }
  }

  function bFrame(s, dusk, rng) {
    // a big birch on our bank framing the left edge, its gold crown overhead
    birch(s, 3, -2, 156, 8, rng, { lean: 0.3 });
    s.path([[9, 34], [22, 22], [36, 14]], P.birch[1]); s.path([[10, 35], [23, 23]], P.birch[3]);
    s.path([[6, 60], [-2, 48]], P.birch[1]);
    birch(s, 28, 10, 104, 3, rng, { lean: -0.5 });
    s.foliage(28, 6, 36, 15, [P.leaf_gold, P.leaf_gold, P.leaf_orange], { rng, clusters: 50, blob: 3.6 });
    s.foliage(68, -2, 22, 9, [P.leaf_gold, P.grass_fall], { rng, clusters: 18, blob: 3.2 });
    // a maple leaning in over the top right, scarlet and orange
    s.path([[320, 44], [306, 24], [288, 12]], P.bark[1]); s.path([[319, 45], [305, 25]], P.bark[2]);
    s.foliage(302, 4, 40, 16, [P.leaf_red, P.leaf_orange, P.leaf_red], { rng, clusters: 56, blob: 3.8 });
    s.foliage(258, -3, 20, 8, [P.leaf_orange, P.leaf_red], { rng, clusters: 14, blob: 3.2 });
    // a few leaves on the air
    for (const [x, y, c] of [[96, 40, P.leaf_gold[4]], [132, 56, P.leaf_orange[4]], [214, 46, P.leaf_red[4]], [60, 72, P.leaf_gold[3]], [170, 30, P.leaf_gold[4]]]) { s.px(x, y, c); s.px(x + 1, y + 1, SH(c, -1)); }
  }

  function bLight(s, dusk) {
    if (!dusk) {
      // sun from the upper left through a gap in the crowns, a patch on the log where the Admiral sits
      s.lightPoly('sun', [[60, 0], [84, 0], [178, 132], [138, 132]], 0.3, { fade: { x0: 72, y0: 0, x1: 158, y1: 134 } });
      s.light('sun', 110, 116, 18, 8, 0.8);
      s.light('sun', 262, 74, 34, 14, 0.25);
    } else {
      // raking light from the low sun upstream: the treetops on the far bank, its brow, the west side of trunks
      s.lightPoly('sun', [[176, 14], [320, 0], [320, 70], [176, 74]], 0.8, { fade: { x0: 150, y0: 40, x1: 360, y1: 40 } });
      s.lightPoly('sun', [[96, 76], [320, 56], [320, 74], [96, 86]], 0.5, { fade: { x0: 90, y0: 70, x1: 330, y1: 70 } });
      const tx = [186, 210, 290, 305, 84], lit = new Set([P.birch[2], P.birch[3], P.birch[4], P.birch[5]]);
      s.clip((x, y) => y > 28 && y < 100 && tx.some((t) => x >= t - 1 && x <= t + 1) && lit.has(s.d[y * 320 + x]), () => { for (const x of tx) s.light('sun', x, 64, 2, 36, 0.9, { core: 0.6 }); });
      // our side of the ravine already in shadow, deepening toward us (a dithered edge where it starts)
      for (let y = 60; y < 180; y++) for (let x = 0; x < 320; x++) {
        if (!(inNear(x, y) || (x < 44 && y > 60))) continue;
        if (y < 96 && PX.bayer(x, y) > (y - 84) / 12) continue;
        const i = y * 320 + x, v = s.d[i]; if (v && !(v & 0x8000)) s.d[i] = SH(v, -1);
      }
    }
  }
  function tuft(s, x, y, h, ramp, rng, o = {}) {
    const n = o.n || rng.int(3, 5), base = o.base === undefined ? 2 : o.base;
    for (let i = 0; i < n; i++) {
      const lean = (i - (n - 1) / 2) * (o.spread || 0.5) + rng.range(-0.2, 0.2), hh = Math.max(1, Math.round(h * rng.range(0.6, 1)));
      for (let k = 0; k < hh; k++) {
        const t = k / hh;
        s.px(Math.round(x + i - (n >> 1) + lean * k * 0.6), y - k, clampR(ramp, base + (t > 0.66 ? 2 : t > 0.33 ? 1 : 0)));
      }
    }
  }
  /* drifts of fallen leaves: clusters around a few centres, sized by depth */

  function leafDrifts(s, centres, colors, rng, inside) {
    for (const [cx, cy, rx, ry, n] of centres) {
      for (let i = 0; i < n; i++) {
        const a = rng() * 6.283, d = Math.sqrt(rng());
        const x = Math.round(cx + Math.cos(a) * rx * d), y = Math.round(cy + Math.sin(a) * ry * d);
        if (inside && !inside(x, y)) continue;
        const c = colors[rng.int(0, colors.length - 1)], big = y > 140 ? 1 : 0;
        s.px(x, y, c); s.px(x + 1, y, SH(c, -1));
        if (big || rng() < 0.4) s.px(x, y - 1, SH(c, 1));
        if (big && rng() < 0.6) s.px(x + 2, y, SH(c, -1));
      }
    }
  }

  const bWLx = pw([[86, 100], [88, 130], [91, 160], [95, 190], [99, 220], [104, 250], [108, 275], [111, 300], [114, 330]]);

  const bCutH = wob('b-cut');

  const vnoise = (seed, cell) => {
    const r = PX.rng(seed), gw = Math.ceil(340 / cell) + 3, gh = Math.ceil(200 / cell) + 3, g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = r();
    const at = (a, b) => g[Math.max(0, Math.min(gh - 1, b + 1)) * gw + Math.max(0, Math.min(gw - 1, a + 1))];
    return (x, y) => {
      const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const v0 = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx, v1 = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      return v0 + (v1 - v0) * sy;
    };
  };
  /* scatter marks with a minimum spacing (rejection on a coarse grid); fn(x, y) draws one */

  function scatter(s, n, rng, box, inside, spacing, fn) {
    const cs = Math.max(1, spacing), occ = new Set();
    for (let i = 0; i < n; i++) {
      const x = box[0] + rng.int(0, box[2] - 1), y = box[1] + rng.int(0, box[3] - 1);
      if (!inside(x, y)) continue;
      const k = ((x / cs) | 0) + ',' + ((y / Math.max(1, cs >> 1)) | 0);
      if (occ.has(k)) continue;
      occ.add(k); fn(x, y);
    }
  }
  /* forest-floor leaf litter: leaves of 2–4 px with a lit upper edge, density from a noise field */

  function litter(s, rng, box, inside, colors, dens, noise) {
    const n = Math.round(box[2] * box[3] * dens * (noise ? 0.85 : 1));
    for (let i = 0; i < n; i++) {
      const x = box[0] + rng.int(0, box[2] - 1), y = box[1] + rng.int(0, box[3] - 1);
      if (noise && rng() > 0.35 + noise(x, y * 1.8)) continue;
      if (!inside(x, y)) continue;
      const c = colors[rng.int(0, colors.length - 1)], big = y > 130 ? 1 : 0;
      s.px(x, y, c); s.px(x + 1, y, SH(c, -1));
      if (rng() < 0.5) s.px(x, y - 1, SH(c, 1));
      if (big) { s.px(x + 2, y, SH(c, -1)); if (rng() < 0.5) s.px(x + 1, y - 1, c); }
    }
  }


  const lut = (f, n) => { const a = new Float32Array(n + 1); for (let i = 0; i <= n; i++) a[i] = f(i); return a; };

  const B_NLa = lut((y) => bNL(y), 180), B_WLa = lut((x) => bWL(x), 320), B_PLa = lut((y) => bPathL(y), 180), B_PRa = lut((y) => bPathR(y), 180);

  /* ================================================================== */
  /* THE STANDPIPE                                                       */
  /* Memorial Park on the hill: the stump of the old water tower on the   */
  /* right, fenced off; Derry spread out below on the left. September by  */
  /* day and dusk, October at night. Quiet: the Keeper's Lamp burns green */
  /* on the highest stone and the dark beyond its circle is darker.       */
  PX.bg('standpipe', {
    times: ['day', 'dusk', 'night', 'quiet'],
    draw(s, o) {
      const t = o.time;
      const T = { t, day: t === 'day', dusk: t === 'dusk', night: t === 'night', quiet: t === 'quiet' };
      T.dark = T.night || T.quiet; T.fall = T.dark;
      steps(s, T, [spSky, spHills, spTown, spHill, spRing, spFence, spProps, spOak, spNight, spQuiet, spLight], 'sp');
    }
  });
  /* the ring: centre, base line, half-width, base ellipse depth; the brow of our hill */
  const SP = { cx: 262, by: 116, rx: 58, ry: 9 };
  const spBrow = (x) => 104 + Math.sin(x * 0.05) * 1.2 + Math.sin(x * 0.13) * 0.6 + x * 0.012;
  /* jagged top of the front wall (height above the base) and of the far wall's inner face */
  const spTopH = pw([[203, 25], [207, 35], [212, 35], [213, 45], [219, 45], [220, 40], [226, 40], [227, 55], [233, 55], [234, 50], [238, 50], [239, 30], [242, 30], [243, 15], [246, 15], [247, 10], [261, 10], [262, 15], [265, 15], [266, 30], [269, 30], [270, 45], [275, 45], [276, 60], [281, 60], [282, 70], [286, 70], [287, 82], [297, 82], [298, 75], [302, 75], [303, 65], [308, 65], [309, 55], [314, 55], [315, 40], [321, 40]]);
  const spBackH = pw([[236, 40], [241, 40], [242, 50], [248, 50], [249, 58], [255, 58], [256, 50], [261, 50], [262, 55], [272, 55]]);
  const spW = (x) => { const u = (x - SP.cx) / SP.rx; return Math.abs(u) >= 1 ? 0 : Math.sqrt(1 - u * u); };
  const spCourseY = (H, x) => SP.by - H + SP.ry * Math.max(-0.3, 1 - H / 45) * spW(x);   // screen y of a course at height H
  const spH = (y, x) => { const w = spW(x), a = (SP.by + SP.ry * w - y) / (1 + SP.ry * w / 45); return a <= 58.5 ? a : SP.by - 0.3 * SP.ry * w - y; };
  const SP_LAMP = [292, 0];   // x of the highest stone; y filled in below
  SP_LAMP[1] = Math.round(spCourseY(80, 292));

  function spSky(s, T, rng) {
    if (T.day) {
      s.vgrad(0, 0, 320, 80, [E(P.sky_day[1]), E(P.sky_day[2]), E(P.sky_day[3]), E(P.sky_day[4]), E(P.sky_day[5])], 4);
      s.cloud(150, 18, 52, 11, { emit: true, rng }); s.cloud(244, 10, 30, 7, { emit: true, rng }); s.cloud(102, 40, 26, 5, { emit: true, rng, top: 3 });
      s.cloud(196, 44, 22, 4, { emit: true, rng, top: 3 });
    } else if (T.dusk) {
      s.vgrad(0, 0, 320, 80, [E(P.sky_dusk[1]), E(P.sky_dusk[2]), E(P.sky_dusk[3]), E(P.sky_dusk[4]), E(P.sky_dusk[5])], 4);
      const cd = P.od_cloud_dusk;
      s.ellipse(36, 66, 70, 16, E(P.sky_dusk[5])); s.ellipse(36, 68, 34, 8, E(cd[5]));
      s.circle(38, 64, 6, E(P.lamp[5])); s.circle(38, 64, 4, E(P.white[5]));
      s.cloud(150, 22, 64, 8, { emit: true, ramp: cd, top: 4, rng }); s.cloud(250, 14, 40, 6, { emit: true, ramp: cd, top: 3, rng });
      s.hline(84, 200, 33, E(cd[3])); s.hline(100, 170, 34, E(cd[4])); s.hline(60, 130, 50, E(cd[5])); s.hline(70, 118, 51, E(cd[4]));
    } else if (T.night) {
      s.vgrad(0, 0, 320, 80, [E(P.sky_night[0]), E(P.sky_night[1]), E(P.sky_night[2]), E(P.sky_night[3]), E(P.sky_night[4])], 4);
      s.stars(0, 0, 320, 56, 64, { rng });
      s.circle(196, 15, 6, E(P.cloud[4])); s.circle(199, 13, 5.5, E(P.sky_night[1]));
      s.light('cool', 196, 15, 20, 18, 0.25);
      s.cloud(120, 30, 46, 7, { emit: true, ramp: P.od_haze, top: 2, rng });
    } else {
      s.vgrad(0, 0, 320, 80, [E(P.sky_quiet[0]), E(P.sky_quiet[1]), E(P.sky_quiet[2]), E(P.sky_quiet[3])], 4);
      s.stars(0, 0, 320, 50, 18, { rng });
    }
  }

  function spHills(s, T, rng) {
    const H = P.od_haze, w1 = wob('sp-h1'), w2 = wob('sp-h2');
    const far = (x) => 60 + w1(x, 2.5, 1) + (x < 80 ? (80 - x) * 0.05 : 0);
    const near = (x) => 66 + w2(x, 2, 1.2) + (x < 60 ? (60 - x) * 0.04 : 0);
    band(s, 0, 319, far, () => 80, H[4]);
    for (let x = 0; x < 320; x++) s.px(x, Math.round(far(x)), H[5]);
    band(s, 0, 319, near, () => 80, H[3]);
    for (let x = 1; x < 320; x += rng.int(3, 5)) { const y = Math.round(near(x)) + 1, h = rng.int(2, 4); for (let k = 0; k < h; k++) { const hw = Math.floor((h - k) / 2.2); s.hline(x - hw, x + hw, y - k, H[2]); } }
  }

  function spTown(s, T, rng) {
    const fall = T.fall, lit = T.night ? 0.75 : T.dusk ? 0.3 : 0;
    const G = fall ? [P.od_haze_warm, P.od_haze_gold, P.od_brick_far] : [P.od_green_far, P.od_green_far, P.od_haze_gold];
    // the valley floor under the town
    band(s, 0, 319, () => 70, () => 112, G[0][2]);
    const canalY = pw([[0, 99], [40, 95], [80, 91], [120, 87], [160, 84], [200, 81], [240, 79], [320, 76]]);
    const lamps = [];
    const rows = [[72, 3, 1.0], [76, 4, 0.8], [81, 5, 0.6], [87, 6, 0.4], [94, 7, 0.2], [101, 8, 0]];
    rows.forEach(([ry, sz, haze], ri) => {
      const hz = haze > 0.5 ? 1 : 0;
      // a lumpy band of street trees
      for (let x = -4; x < 324; x += rng.int(sz, sz * 2)) {
        const rr = G[rng.int(0, 1)], r = sz * rng.range(0.6, 1);
        s.ellipse(x, ry - 1, r, r * 0.7, (xx, yy, nx, ny) => clampR(rr, 2 + hz + (nx < -0.2 && ny < 0 ? 1 : ny > 0.3 ? -1 : 0)));
      }
      // houses: walls, gabled roofs, a window
      for (let x = rng.int(0, sz); x < 330; x += sz + rng.int(sz, sz * 3)) {
        if (Math.abs(ry - canalY(x)) < 3) continue;
        const w = sz + rng.int(0, 2), h = Math.max(2, Math.round(sz * 0.7)), wall = rng.pick([P.white_cloth, P.house_yellow, P.house_blue, P.house_green, P.od_brick_far, P.cream]);
        const roof = rng.pick([P.roof, P.roof, P.roof_red]);
        const y0 = ry - h;
        s.rect(x, y0, w, h, clampR(wall, 3 + hz)); s.vline(x + w - 1, y0, ry - 1, clampR(wall, 2 + hz));
        const rh = Math.max(1, Math.round(w / 2.4));
        for (let k = 0; k < rh; k++) s.hline(x + k - 1, x + w - k, y0 - 1 - k, clampR(roof, (k === rh - 1 ? 3 : 2) + hz));
        const win = x + 1 + rng.int(0, Math.max(0, w - 3));
        if (lit && rng() < lit) { s.px(win, y0 + 1, E(P.lamp[rng() < 0.5 ? 4 : 3])); if (w > 5 && rng() < 0.5) s.px(win + 2, y0 + 1, E(P.lamp[3])); }
        else s.px(win, y0 + 1, clampR(wall, 1 + hz));
      }
      if (lit && ri > 0) for (let x = rng.int(0, 10); x < 320; x += rng.int(10, 18)) lamps.push([x, ry + 1]);
    });
    // the canal: a grey ribbon straight through the middle of everything, two bridges
    for (let x = 0; x < 320; x++) { const y = Math.round(canalY(x)), w = 2 + (x < 120 ? 1 : 0); s.vline(x, y, y + w - 1, T.dark ? P.water[2] : P.water[4]); s.px(x, y, T.dark ? P.water[3] : P.water[5]); }
    for (const bx of [58, 146]) { const y = Math.round(canalY(bx)); s.rect(bx, y - 1, 4, 4, P.stone[3]); s.hline(bx, bx + 3, y - 1, P.stone[4]); }
    // downtown: brick blocks along the canal
    for (const [x, w, h] of [[66, 9, 9], [76, 7, 12], [84, 10, 8], [96, 8, 11], [106, 12, 9], [134, 9, 10]]) {
      const yb = Math.round(canalY(x)) - 1;
      s.rect(x, yb - h, w, h, P.od_brick_far[3]); s.vline(x + w - 1, yb - h, yb - 1, P.od_brick_far[2]); s.hline(x, x + w - 1, yb - h, P.od_brick_far[4]);
      for (let yy = yb - h + 2; yy < yb - 1; yy += 2) for (let xx = x + 1; xx < x + w - 1; xx += 2) s.px(xx, yy, lit && rng() < lit * 0.8 ? E(P.lamp[3]) : P.od_brick_far[1]);
    }
    // the mill along the canal and its stack
    { const x = 150, w = 40, yb = Math.round(canalY(170)) - 1, h = 9;
      s.rect(x, yb - h, w, h, P.od_brick_far[3]); s.hline(x, x + w - 1, yb - h, P.od_brick_far[4]); s.hline(x, x + w - 1, yb - h - 1, P.roof[2]);
      for (let yy = yb - h + 2; yy < yb - 1; yy += 3) for (let xx = x + 2; xx < x + w - 2; xx += 3) s.rect(xx, yy, 1, 2, lit && rng() < lit * 0.6 ? E(P.lamp[4]) : P.od_brick_far[1]);
      const sx = 196;
      s.rect(sx, 50, 4, yb - 50, P.od_brick_far[3]); s.vline(sx, 50, yb - 1, P.od_brick_far[4]); s.vline(sx + 3, 50, yb - 1, P.od_brick_far[2]);
      s.rect(sx - 1, 49, 6, 2, P.od_brick_far[2]); s.hline(sx - 1, sx + 4, 49, P.od_brick_far[4]);
      for (let yy = 56; yy < yb; yy += 6) s.hline(sx, sx + 3, yy, P.od_brick_far[2]);
      if (T.day) for (let k = 0; k < 5; k++) s.ellipse(sx + 3 + k * 5, 46 - k * 1.5, 2 + k * 0.8, 1.4 + k * 0.3, P.cloud[4 - (k > 2 ? 1 : 0)]);
      if (T.night) { s.px(sx + 1, 52, E(P.neon[4])); s.px(sx + 2, 52, E(P.neon[3])); }
    }
    // the steeples: white clapboard Congregational on the left, granite St. Mary's in the middle
    { const x = 38, base = 80;
      s.rect(x - 3, base - 14, 7, 14, P.white_cloth[4]); s.vline(x + 3, base - 14, base - 1, P.white_cloth[2]); s.vline(x - 3, base - 14, base - 1, P.white_cloth[5]);
      s.rect(x - 2, base - 22, 5, 8, P.white_cloth[4]); s.rect(x - 1, base - 20, 3, 3, T.night ? E(P.lamp[3]) : P.ink[3]); s.vline(x + 2, base - 22, base - 15, P.white_cloth[2]);
      for (let k = 0; k < 20; k++) { const hw = Math.round(2.4 * (1 - k / 20)); s.hline(x - hw, x + hw, base - 23 - k, k > 17 ? P.white_cloth[3] : P.white_cloth[4]); if (hw > 0) s.px(x + hw, base - 23 - k, P.white_cloth[2]); }
      s.px(x, base - 44, P.mustard[4]); s.px(x, base - 45, P.mustard[3]);
    }
    { const x = 124, base = 82;
      s.rect(x - 3, base - 20, 7, 20, P.stone[3]); s.vline(x - 3, base - 20, base - 1, P.stone[4]); s.vline(x + 3, base - 20, base - 1, P.stone[2]);
      for (let yy = base - 18; yy < base; yy += 3) s.hline(x - 2, x + 2, yy, P.stone[2]);
      s.rect(x - 1, base - 17, 3, 4, T.night ? E(P.lamp[2]) : P.ink[3]);
      for (let k = 0; k < 9; k++) { const hw = Math.round(3.6 * (1 - k / 9)); s.hline(x - hw, x + hw, base - 21 - k, P.stone[k < 2 ? 2 : 3]); }
      s.vline(x, base - 33, base - 30, P.stone[4]); s.hline(x - 1, x + 1, base - 32, P.stone[4]);
    }
    // the green house on Larch Street with the round window in its peak
    { const x = 88, yb = 94; s.rect(x, yb - 4, 7, 4, P.house_green[4]); for (let k = 0; k < 3; k++) s.hline(x + k, x + 6 - k, yb - 5 - k, P.house_green[k === 2 ? 4 : 3]); s.px(x + 3, yb - 6, P.trim[5]); s.px(x + 5, yb - 2, T.dark ? E(P.lamp[4]) : P.trim[2]); }
    // streetlights at night: warm dots along the streets
    for (const [x, y] of lamps) { s.px(x, y, E(P.lamp[5])); }
    if (lit) for (let k = 0; k < lamps.length; k += 3) s.light('warm', lamps[k][0], lamps[k][1], 9, 4, 0.35);
  }

  function spHill(s, T, rng) {
    const GR = T.fall ? P.grass_fall : P.grass;
    // the hilltop from the brow to our feet
    band(s, 0, 319, spBrow, () => 179, (x, y, a) => (y - a < 2 ? GR[3] : GR[2]));
    const gz = vnoise('sp-grass', 12);
    for (let y = 104; y < 180; y++) for (let x = 0; x < 320; x++) {
      if (y < spBrow(x) + 3) continue;
      const n = gz(x, y * 1.6);
      if (n < 0.34) s.px(x, y, GR[1]); else if (n > 0.7) s.px(x, y, GR[3]);
    }
    scatter(s, 900, rng, [0, 104, 320, 76], (x, y) => y > spBrow(x) + 1, 5, (x, y) => tuft(s, x, y, 2 + Math.round((y - 104) / 14), GR, rng, { n: rng.int(3, 5), base: 2 }));
    // late wildflowers: goldenrod, asters, Queen Anne's lace
    const fl = T.fall ? [P.leaf_gold[4], P.camel[4], P.white_cloth[3]] : [P.yellow[4], P.pink[4], P.white_cloth[4], P.yellow[5]];
    scatter(s, 260, rng, [0, 106, 320, 60], (x, y) => y > spBrow(x) + 2, 9, (x, y) => { const c = fl[rng.int(0, fl.length - 1)]; s.px(x, y, c); s.px(x + 1, y - 1, c); s.px(x, y + 1, GR[1]); });
    // the worn path up from the gate to the bench and the fence
    const pl = pw([[118, 192], [130, 186], [150, 174], [180, 160]]), pr = pw([[118, 198], [130, 196], [150, 194], [180, 204]]);
    for (let y = 118; y < 180; y++) for (let x = Math.round(pl(y)); x <= Math.round(pr(y)); x++) s.px(x, y, x === Math.round(pl(y)) ? P.dirt[2] : (x + y) % 7 === 0 ? P.dirt[4] : P.dirt[3]);
    const bl = pw([[0, 116], [60, 118], [120, 122], [190, 124]]);
    for (let x = 70; x < 192; x++) { const y = Math.round(bl(x) + (x - 70) * 0.0); s.hline(x, x, y, P.dirt[3]); s.px(x, y + 1, P.dirt[2]); if (x > 120) s.px(x, y - 1, P.dirt[3]); }
  }

  function spRing(s, T, rng) {
    const S = P.stone_warm, { cx, by, rx, ry } = SP, CH = 5, DT = 0.16;
    const lam = (th) => -0.62 * Math.sin(th) + 0.78 * Math.cos(th);
    const shadeOf = (l) => (l > 0.92 ? 5 : l > 0.62 ? 4 : l > 0.28 ? 3 : l > -0.12 ? 2 : 1);
    const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const thOf = (x) => Math.asin(Math.max(-1, Math.min(1, (x - cx) / rx)));
    const bL = 243, bR = 265;
    // the far wall's inner face, seen through the breach: lit above, in the front wall's shadow below
    for (let x = bL - 3; x <= bR + 3; x++) {
      const u = (x - cx) / rx, w = spW(x), yb = Math.round(by - ry * w), yt = Math.round(yb - spBackH(x));
      const l = 0.62 * u + 0.78 * w, k = shadeOf(l), th = thOf(x);
      for (let y = yt; y <= yb; y++) {
        const h = yb - y, row = Math.floor(h / CH), bi = Math.floor((th + (row % 2) * DT / 2) / DT), bi2 = Math.floor((thOf(x + 1) + (row % 2) * DT / 2) / DT);
        let c = clampR(S, (h < 22 ? k - 2 : k - 1) + (hash(row, bi + 50) < 0.2 ? -1 : 0));
        if (h % CH === 0 || bi !== bi2) c = S[Math.max(0, (h < 22 ? k - 3 : k - 2))];
        if (y === yt) c = S[k];
        s.px(x, y, c);
      }
    }
    // the front wall, block by block on the curve of the cylinder, lit from the front left
    for (let x = cx - rx; x <= Math.min(319, cx + rx); x++) {
      const w = spW(x), th = thOf(x), th2 = thOf(x + 1), k0 = shadeOf(lam(th));
      const topH = Math.round(spTopH(x) / CH) * CH, yb = Math.round(by + ry * w), yt = Math.round(spCourseY(topH, x));
      for (let y = yt; y <= yb; y++) {
        const H = Math.max(0, spH(y, x)), row = Math.floor(H / CH), off = (row % 2) * DT / 2;
        const bi = Math.floor((th + off) / DT), v = hash(row, bi);
        let k = k0 + (v < 0.18 ? -1 : v > 0.9 ? 1 : 0);
        const fr = H - row * CH;
        if (fr < 1) k -= 2;                                        // mortar bed under each course
        else if (bi !== Math.floor((th2 + off) / DT)) k -= 2;      // the joint between blocks
        else if (fr > CH - 1.2 && k0 >= 3) k += 1;                 // the lit lip along each block's top
        else if (fr < 2 && k0 <= 2) k -= 1;
        if (row * CH >= topH - CH && v > 0.82 && fr >= 1) k = 0;   // a block missing near the broken top
        s.px(x, y, clampR(S, k));
      }
      // the broken top: a pale edge against the sky; where it is below our eyes we see onto its thickness
      if (topH <= 25) { s.px(x, yt - 1, S[4]); s.px(x, yt - 2, S[5]); s.px(x, yt - 3, S[3]); }
      else s.px(x, yt, clampR(S, k0 + 1));
    }
    // a rubble heap on the wall's stump in the breach, grass in its cracks
    for (const [x, y, w2, h2] of [[249, 100, 3, 2], [254, 99, 3.5, 2.2], [259, 101, 2.6, 1.8], [246, 102, 2.4, 1.6]]) rock(s, x, y, w2, h2, S, { base: 3 });
    const GR = T.fall ? P.grass_fall : P.grass;
    // grass and weeds growing out of the top, a birch sapling in the broken crown
    for (let x = cx - rx + 1; x < 320; x += rng.int(2, 5)) { const topH = Math.round(spTopH(x) / CH) * CH, yt = Math.round(spCourseY(topH, x)) - (topH <= 25 ? 3 : 0); tuft(s, x, yt, rng.int(2, 4), GR, rng, { n: 3, base: 2 }); }
    { const x = 230, yt = Math.round(spCourseY(55, 230)); s.line(x, yt, x - 1, yt - 12, P.birch[4]); s.line(x - 1, yt - 6, x - 4, yt - 9, P.birch[3]); s.px(x, yt - 4, P.birch[1]); s.foliage(x - 2, yt - 13, 4.5, 4, [T.fall ? P.leaf_gold : P.grass, P.leaf_gold], { rng, clusters: 6, blob: 1.8 }); }
    // rebar: rusted iron rods sticking out of the broken top, some bent over
    const Rr = P.od_rust;
    for (const [x, len, bend] of [[216, 6, 2], [229, 4, 0], [244, 6, -3], [256, 5, 2], [272, 5, 0], [284, 8, 3], [290, 5, -2], [300, 7, 2], [311, 5, 0]]) {
      const topH = Math.round(spTopH(x) / CH) * CH, yt = Math.round(spCourseY(topH, x)) - (topH <= 25 ? 2 : 0);
      const up = Math.round(len * 0.6);
      s.vline(x, yt - up, yt - 1, Rr[2]); s.px(x, yt - up, Rr[4]);
      s.line(x, yt - up, x + bend, yt - len, Rr[3]); s.px(x + bend, yt - len, Rr[1]);
    }
    // Virginia creeper gone red, climbing the lower wall in runners
    for (const [x0, h, spread] of [[208, 24, 6], [221, 16, 5], [279, 28, 7], [296, 36, 8], [313, 22, 5]]) {
      const yb = Math.round(by + ry * spW(x0));
      let x = x0;
      for (let k = 0; k < h; k++) { if (k % 4 === 0) x += rng.int(-1, 1); s.px(x, yb - k, P.leaf_red[1]); }
      for (let k = 0; k < h * 1.3; k++) {
        const yy = yb - rng.int(0, h), f = (yb - yy) / h, xx = Math.round(x0 + rng.int(-spread, spread) * (1 - f * 0.7));
        const c = P.leaf_red[rng.pick([2, 3, 3, 4])]; s.px(xx, yy, c); s.px(xx + 1, yy, SH(c, -1)); if (rng() < 0.5) s.px(xx, yy - 1, SH(c, 1));
      }
    }
    // graffiti on the lit side: a heart, initials, KISS, and the crossed lantern scratched small
    const hx = 213, hy = 80;
    for (const [dx, dy] of [[1, 0], [2, 0], [4, 0], [5, 0], [0, 1], [3, 1], [6, 1], [0, 2], [6, 2], [1, 3], [5, 3], [2, 4], [4, 4], [3, 5]]) s.px(hx + dx, hy + dy, P.red[3]);
    text(s, 'TK', hx + 1, hy + 7, P.ink[4]);
    text(s, 'KISS', 225, 99, P.navy[4]);
    const lx = 235, ly = 82;
    s.px(lx + 1, ly, S[1]); s.rect(lx, ly + 1, 3, 4, S[1]); s.px(lx + 1, ly + 2, S[5]); s.px(lx + 1, ly + 3, S[5]);
    s.line(lx - 1, ly, lx + 3, ly + 6, S[0]); s.line(lx + 3, ly, lx - 1, ly + 6, S[0]);
    // the silhouette edge on the shadow side, a contact shadow along the foot, fallen blocks in the grass
    shiftIn(s, cx - rx - 2, by - 2, 319, by + 14, (x, y) => { const yb = by + ry * spW(x); return y > yb && y < yb + 3; }, -1);
    for (const [x, y, w2, h2] of [[200, 121, 4, 2.4], [236, 126, 5, 2.8], [247, 124, 3, 2], [306, 128, 5, 2.6], [218, 125, 3, 1.8]]) rock(s, x, y, w2, h2, S, { base: 3 });
  }

  function spFence(s, T, rng) {
    const M = P.metal, gy = (x) => 121 + (x - 172) * 0.02;
    const posts = [174, 193, 212, 231, 250, 269, 288, 307, 326];
    const topY = (x) => { let i = 0; while (i < posts.length - 2 && x > posts[i + 1]) i++; const f = (x - posts[i]) / (posts[i + 1] - posts[i]); return 89 + Math.sin(f * Math.PI) * (i === 2 ? 5 : 2.5); };
    // chain-link mesh between the top rail and the ground; the bottom peeled up in one bay
    const peel = (x, y) => x > 214 && x < 229 && y > gy(x) - 9 + (Math.abs(x - 221) * 0.9);
    for (let x = posts[0]; x < 320; x++) {
      const t = Math.round(topY(x)), g = Math.round(gy(x));
      for (let y = t + 1; y < g; y++) {
        if (peel(x, y)) continue;
        if ((x + y) % 4 === 0 || (x - y + 400) % 4 === 0) s.px(x, y, T.dark ? M[2] : M[3]);
      }
    }
    // the peeled edge curling up
    s.line(214, Math.round(gy(214)) - 1, 221, Math.round(gy(221)) - 9, M[4]); s.line(221, Math.round(gy(221)) - 9, 229, Math.round(gy(229)) - 2, M[3]);
    // top rail and posts
    for (let x = posts[0]; x < 320; x++) { const t = Math.round(topY(x)); s.px(x, t, M[4]); s.px(x, t + 1, M[2]); }
    for (const px of posts) {
      if (px > 321) continue;
      const g = Math.round(gy(px));
      s.rect(px - 1, 86, 2, g - 86, M[3]); s.vline(px - 1, 86, g - 1, M[4]); s.vline(px, 86, g - 1, M[2]);
      s.rect(px - 2, 85, 4, 2, M[2]); s.hline(px - 2, px + 1, 85, M[4]);
    }
    // the sign: DANGER / KEEP OUT / CITY OF DERRY, wired to the mesh, rust weeping from its bolts
    const sx = 270, sy = 92, sw = 47, sh = 24;
    s.rect(sx + 1, sy + 1, sw, sh, M[1]);
    s.rect(sx, sy, sw, sh, P.white[3]); s.hline(sx, sx + sw - 1, sy, P.white[4]); s.vline(sx + sw - 1, sy, sy + sh - 1, P.white[1]); s.hline(sx, sx + sw - 1, sy + sh - 1, P.white[1]);
    s.rect(sx + 2, sy + 2, sw - 4, 8, P.red[3]); s.hline(sx + 2, sx + sw - 3, sy + 2, P.red[4]);
    const tw = (str) => textW(str, { space: 2 });
    text(s, 'DANGER', sx + Math.round((sw - tw('DANGER')) / 2), sy + 4, P.white[5]);
    text(s, 'KEEP OUT', sx + Math.round((sw - tw('KEEP OUT')) / 2), sy + 11, P.ink[2]);
    text(s, 'CITY OF DERRY', sx + Math.round((sw - tw('CITY OF DERRY')) / 2), sy + 17, P.red[2]);
    for (const [bx, byy] of [[sx + 1, sy + 1], [sx + sw - 2, sy + 1], [sx + 1, sy + sh - 2], [sx + sw - 2, sy + sh - 2]]) { s.px(bx, byy, M[1]); s.px(bx, byy + 1, P.od_rust[2]); }
    s.px(sx + sw - 2, sy + 3, P.od_rust[3]); s.px(sx + sw - 2, sy + 4, P.od_rust[2]);
    // the top right corner bent forward
    s.poly([[sx + sw - 5, sy], [sx + sw, sy], [sx + sw, sy + 5]], P.white[1]); s.line(sx + sw - 5, sy, sx + sw - 1, sy + 4, P.white[4]);
  }

  function spProps(s, T, rng) {
    // the bench on the brow, facing the view (we see its back)
    const bx = 44, by = 106, W = P.wood, I = P.metal;
    s.shift([bx - 2, by + 12, 46, 3], -1);
    for (const lx of [bx + 1, bx + 38]) { s.rect(lx, by + 2, 2, 12, I[1]); s.px(lx, by + 2, I[3]); s.rect(lx - 1, by + 13, 4, 1, I[1]); }
    s.rect(bx, by, 41, 3, W[3]); s.hline(bx, bx + 40, by, W[4]); s.hline(bx, bx + 40, by + 2, W[1]);
    s.rect(bx, by + 4, 41, 3, W[3]); s.hline(bx, bx + 40, by + 4, W[4]); s.hline(bx, bx + 40, by + 6, W[1]);
    s.rect(bx - 1, by + 8, 43, 2, W[2]); s.hline(bx - 1, bx + 41, by + 8, W[3]);
    for (let x = bx + 6; x < bx + 40; x += 9) s.px(x, by + 1, W[2]);
    text(s, 'J+N', bx + 15, by + 4, W[1]);
    // the plaque on its boulder: IN MEMORY OF THOSE LOST IN THE STORM OF 1985
    const px0 = 146, py0 = 110;
    rock(s, px0 + 12, py0 + 6, 13, 7.5, P.stone, { base: 3 });
    s.rect(px0 + 4, py0 + 1, 17, 9, P.od_bronze[2]); s.rect(px0 + 5, py0 + 2, 15, 7, P.od_bronze[3]); s.hline(px0 + 5, px0 + 19, py0 + 2, P.od_bronze[4]);
    s.hline(px0 + 7, px0 + 17, py0 + 3, P.od_bronze[1]); text(s, '1985', px0 + 6, py0 + 4, P.od_bronze[1]);
    s.shift([px0 - 2, py0 + 13, 30, 2], -1);
    // beer cans in the grass by the fence
    for (const [x, y, c] of [[183, 124, P.red[3]], [205, 128, P.chrome[3]], [193, 131, P.navy[4]]]) { s.rect(x, y, 3, 2, c); s.px(x, y, SH(c, 2)); s.px(x + 2, y + 1, SH(c, -2)); }
    // the old cemetery: the back path's top row of slate stones
    for (const [x, y, w, h, lean] of [[24, 112, 6, 10, 0], [33, 116, 5, 8, 1], [2, 118, 6, 11, -1], [40, 121, 4, 6, 0]]) {
      const S2 = P.stone;
      for (let k = 0; k < h; k++) { const xx = x + Math.round(lean * k / h); s.hline(xx, xx + w - 1, y + k, k < 2 ? S2[4] : S2[3]); s.px(xx + w - 1, y + k, S2[2]); s.px(xx, y + k, S2[4]); }
      s.hline(x + 1 + lean, x + w - 2 + lean, y - 1, S2[3]); s.px(x + 1, y, S2[5]);
      s.hline(x + 1, x + w - 2, y + 3, S2[2]); s.hline(x + 1, x + w - 3, y + 5, S2[2]);
      s.px(x + 2, y + h - 3, P.grass_fall[3]); s.px(x + 3, y + h - 3, P.grass_fall[2]);
      s.shift([x + w, y + h - 1, 3, 2], -1);
    }
    s.rect(14, 104, 3, 14, P.stone[3]); s.vline(14, 104, 117, P.stone[4]); s.vline(16, 104, 117, P.stone[2]); s.px(15, 103, P.stone[4]);   // a small obelisk
  }

  function spOak(s, T, rng) {
    // the old oak at the top of the cemetery path, framing the left edge
    const B = P.bark;
    s.poly([[4, 128], [8, 70], [10, 40], [18, 40], [20, 70], [24, 128]], B[2]);
    for (let y = 40; y < 128; y++) { const a = Math.round(4 + (128 - y) * 0.05), b = Math.round(24 - (128 - y) * 0.07); s.px(a, y, B[4]); s.px(a + 1, y, B[3]); s.px(b, y, B[1]); if (y % 5 === 0) s.px(a + 3 + (y % 3), y, B[1]); }
    s.path([[12, 46], [30, 28], [52, 18]], B[2]); s.path([[13, 47], [31, 29]], B[3]); s.path([[10, 50], [-4, 36]], B[2]); s.path([[16, 44], [24, 16]], B[2]);
    s.shift([0, 126, 34, 4], -1);
    // heart carved in the bark
    s.px(12, 92, B[1]); s.px(14, 92, B[1]); s.px(13, 93, B[1]); s.px(11, 93, B[1]); s.px(15, 93, B[1]); s.px(12, 94, B[1]); s.px(14, 94, B[1]); s.px(13, 95, B[1]);
    const L = T.fall ? [P.leaf_orange, P.leaf_red, P.leaf_gold] : [P.grass, P.grass, P.leaf_gold];
    s.foliage(28, 10, 40, 18, L, { rng, clusters: 60, blob: 4 });
    s.foliage(70, 2, 22, 9, L, { rng, clusters: 18, blob: 3.4 });
  }

  function spNight(s, T, rng) {
    if (!T.night) return;
    // the night in chapter four: adults with flashlights pacing out the ring
    const people = [[206, 120, 26], [253, 108, 22], [302, 122, 27]];
    for (const [x, base, h] of people) silhouette(s, x, base, h, P.ink, { coat: true });
    for (const [x, base, h, tx, ty] of [[206, 120, 26, 222, 96], [253, 108, 22, 268, 92], [302, 122, 27, 286, 104]]) {
      const hx = x + (tx > x ? 3 : -3), hy = base - Math.round(h * 0.55);
      s.px(hx, hy, E(P.white[5])); s.px(hx + (tx > x ? 1 : -1), hy, E(P.lamp[5]));
      s.lightPoly('white', [[hx, hy - 1], [hx, hy + 1], [tx + 6, ty + 7], [tx - 6, ty - 5]], 0.8, { fade: { x0: hx, y0: hy, x1: tx, y1: ty } });
      s.light('white', tx, ty, 7, 6, 0.9);
    }
  }

  /* a standing figure seen as a silhouette; feet at (x, base), h tall. o: coat, dress, glove, hat, rim (light code + side) */
  function silhouette(s, x, base, h, R2, o = {}) {
    const k = h / 30, c0 = R2[o.shade === undefined ? 1 : o.shade];
    const head = Math.max(1.5, 2.6 * k), hy = base - h + head;
    s.ellipse(x, hy, head * 0.9, head, c0);
    if (o.hat) { s.hline(Math.round(x - head * 1.5), Math.round(x + head * 1.5), Math.round(hy - head * 0.4), c0); s.rect(Math.round(x - head * 0.9), Math.round(hy - head * 1.6), Math.round(head * 1.8), Math.round(head * 1.2), c0); }
    const sh = hy + head * 0.9, sw = (o.child ? 3.4 : 4.6) * k, hip = base - h * 0.45;
    if (o.dress) {
      s.poly([[x - sw * 0.7, sh], [x + sw * 0.7, sh], [x + sw * 1.5, base - h * 0.32], [x - sw * 1.5, base - h * 0.32]], c0);
      s.rect(Math.round(x - 1.4 * k), Math.round(base - h * 0.32), Math.max(1, Math.round(0.9 * k)), Math.round(h * 0.32), c0);
      s.rect(Math.round(x + 0.6 * k), Math.round(base - h * 0.32), Math.max(1, Math.round(0.9 * k)), Math.round(h * 0.32), c0);
    } else if (o.coat) {
      s.poly([[x - sw, sh], [x + sw, sh], [x + sw * 1.05, base - h * 0.12], [x - sw * 1.05, base - h * 0.12]], c0);
      s.rect(Math.round(x - sw * 0.7), Math.round(base - h * 0.12), Math.round(sw * 0.55), Math.round(h * 0.12), c0);
      s.rect(Math.round(x + sw * 0.15), Math.round(base - h * 0.12), Math.round(sw * 0.55), Math.round(h * 0.12), c0);
    } else {
      s.poly([[x - sw, sh], [x + sw, sh], [x + sw * 0.8, hip], [x - sw * 0.8, hip]], c0);
      s.rect(Math.round(x - sw * 0.75), Math.round(hip), Math.round(sw * 0.65), Math.round(base - hip), c0);
      s.rect(Math.round(x + sw * 0.1), Math.round(hip), Math.round(sw * 0.65), Math.round(base - hip), c0);
    }
    if (o.glove) s.ellipse(x + sw + 1.2 * k, hip - 1, 1.6 * k, 1.8 * k, c0);
    if (o.rim) {
      const [rc, side] = o.rim;
      for (let y = Math.round(base - h); y <= base; y++) {
        let edge = -1;
        if (side > 0) { for (let xx = Math.round(x + sw * 2); xx >= Math.round(x - sw * 2); xx--) if (s.get(xx, y) === c0) { edge = xx; break; } }
        else { for (let xx = Math.round(x - sw * 2); xx <= Math.round(x + sw * 2); xx++) if (s.get(xx, y) === c0) { edge = xx; break; } }
        if (edge >= 0) s.px(edge, y, rc);
      }
    }
  }

  function spQuiet(s, T, rng) {
    if (!T.quiet) return;
    const [lx, ly] = SP_LAMP;
    // beyond the Lamp's circle the dark is darker: everything outside it drops a shade, two at the edges
    const inC = (x, y, k) => ((x - 262) / (96 * k)) ** 2 + ((y - 114) / (30 * k)) ** 2 < 1;
    shiftIn(s, 0, 60, 319, 179, (x, y) => !inC(x, y, 1) && !(y < 112 && x > 196 && y > ly - 6), -1);
    shiftIn(s, 0, 60, 319, 179, (x, y) => !inC(x, y, 1.6) && y > 70, -1);
    // low fog lying on the hilltop and in the cemetery
    const F = P.od_fog, fz = vnoise('sp-fog', 16);
    for (let y = 100; y < 180; y++) for (let x = 0; x < 320; x++) {
      const v = fz(x, y * 2.4) - Math.abs(y - 124) / 60;
      if (v > 0.42 && PX.bayer(x, y) < (v - 0.42) * 2.2) s.px(x, y, v > 0.62 ? F[4] : F[3]);
    }
    // the ones who were kept, standing at the edge of the light, still as fence posts
    const rim = P.od_fog[2];
    silhouette(s, 180, 125, 17, P.od_fog, { shade: 0, dress: true, child: true, rim: [rim, 1] });     // a little girl in a party dress
    silhouette(s, 164, 126, 21, P.od_fog, { shade: 0, glove: true, child: true, rim: [rim, 1] });     // a boy with a baseball glove
    silhouette(s, 146, 124, 30, P.od_fog, { shade: 0, coat: true, hat: true, rim: [rim, 1] });        // a man in an old-fashioned coat
    for (const [x, b, h] of [[112, 118, 24], [96, 116, 20], [70, 117, 22], [314, 128, 26]]) silhouette(s, x, b, h, P.ink, { shade: 1 });
    // the Keeper's Lamp: an old brass ship's lantern, thick glass, burning green
    const B = P.od_bronze, Gn = P.lantern;
    s.rect(lx - 3, ly - 2, 7, 2, B[2]); s.hline(lx - 3, lx + 3, ly - 2, B[3]);                 // base
    s.rect(lx - 2, ly - 9, 5, 7, E(Gn[3])); s.rect(lx - 1, ly - 8, 3, 5, E(Gn[4])); s.px(lx, ly - 6, E(Gn[5])); s.px(lx, ly - 5, E(Gn[5]));
    s.vline(lx - 3, ly - 9, ly - 3, B[1]); s.vline(lx + 3, ly - 9, ly - 3, B[1]);              // cage bars
    s.vline(lx, ly - 9, ly - 8, B[2]);
    s.rect(lx - 3, ly - 11, 7, 2, B[2]); s.hline(lx - 2, lx + 2, ly - 12, B[3]); s.px(lx, ly - 13, B[3]);   // cap
    s.ring(lx + 0.5, ly - 14.5, 1.6, 1.4, B[2]);                                                 // ring handle
    // its light: the circle on the stones and grass, a halo round the glass
    s.light('green', lx, ly - 6, 30, 26, 1.1);
    s.light('green', 262, 114, 96, 30, 1.0, { core: 0.35 });
    s.light('green', lx, ly + 20, 46, 50, 0.6);
    s.px(lx - 4, ly - 6, E(Gn[2])); s.px(lx + 4, ly - 6, E(Gn[2])); s.px(lx, ly - 15 - 2, E(Gn[1]));
  }

  function spLight(s, T, rng) {
    if (T.day) {
      s.lightPoly('sun', [[204, 30], [232, 30], [232, 122], [204, 122]], 0.3, { fade: { x0: 204, y0: 60, x1: 236, y1: 60 } });
    } else if (T.dusk) {
      // the low sun on the left: the ring's west face glows, everything throws long shadows east
      const S = P.stone_warm;
      s.clip((x, y) => x < 262 && y < 122, () => s.lightPoly('sun', [[196, 20], [262, 20], [262, 124], [196, 124]], 0.85, { fade: { x0: 200, y0: 60, x1: 262, y1: 60 } }));
      s.lightPoly('sun', [[0, 104], [200, 104], [200, 116], [0, 120]], 0.35, { fade: { x0: 0, y0: 110, x1: 200, y1: 110 } });
      shiftIn(s, 262, 118, 319, 179, (x, y) => y > 122 + (x - 262) * 0.05 && y < 136 + (x - 262) * 0.1, -1);
      s.light('sun', 38, 64, 40, 18, 0.6);
    } else if (T.night) {
      s.light('cool', 230, 70, 120, 60, 0.18);
    }
  }
})();
