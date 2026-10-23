/* What Derry Keeps — home interiors, pixel art.
 *   kitchen     Mémère's kitchen, 9 Larch St     morning, evening, night
 *   living      Mémère's living room             evening, night
 *   gus_room    Gus's room under the eaves       day, night, dawn
 *   hall_up     the upstairs hall                night
 *   attic       the attic                        day, flashlight
 *   teddy_room  Teddy Okafor's bedroom           night
 *   ashgrove    the Ashgrove front hall          night
 *
 * Rooms are one-point perspective boxes (Room below): world coordinates are
 * back-wall pixels (x across, y down, floor = by1) plus a depth d toward the
 * viewer, so furniture is built as boxes and textures follow the planes.
 * Everything is drawn in daylight colours; the time presets do the ambient
 * light and the practical lights (lamps, screens, windows) lift it back up.
 */
(function () {
  'use strict';
  const P = PX.P, E = PX.E, SH = PX.sh, R = PX.ramp;
  const rnd = Math.round, flo = Math.floor;
  const cl = (r, s) => r[Math.max(0, Math.min(r.length - 1, s))];

  /* ------------------------------------------------------------------ */
  /* materials (dark → light, darks lean violet, lights lean warm)        */
  R('k_paper', ['#4b3828', '#7a5f3c', '#a68852', '#c9aa6c', '#e0c78c', '#f1e1b2']);   // yellowed kitchen paper
  R('sage', ['#1f2a22', '#334535', '#4b6348', '#68825c', '#8aa276', '#b0c49a']);
  R('mint', ['#1f3134', '#33514c', '#4b7264', '#6a977f', '#90b99a', '#bbd8bb']);      // painted cabinets
  R('enamel', ['#3b3547', '#686276', '#9c96a6', '#c8c3c7', '#e5e0d8', '#f8f5eb']);    // fridge, stove, sink
  R('lino_r', ['#30141a', '#4f2023', '#71312d', '#8f4638', '#a85e47', '#bf7a5c']);
  R('lino_c', ['#4a3b34', '#776453', '#a28e76', '#c3b094', '#dccbab', '#efe3c7']);
  R('ceil', ['#3f3640', '#6a5f63', '#998b86', '#c2b4a6', '#ddd0bf', '#f0e6d6']);
  R('avocado', ['#1e220f', '#353c17', '#505921', '#6d782f', '#8e9a43', '#b2bc66']);
  R('brass', ['#2e1b0d', '#5b3a15', '#8a5f20', '#b8892f', '#dcb24d', '#f5dc8a']);
  R('amber', ['#2c1206', '#55250b', '#8a4512', '#bb6a1c', '#de9536', '#f4c06a']);
  R('plaid_b', ['#121a33', '#1f2d52', '#304474', '#486194', '#6c86b2', '#9db1d0']);
  R('nite', ['#0a0e21', '#121933', '#1c2545', '#283459', '#38466f', '#4c5c88']);   // night exteriors (emissive)
  R('violet', ['#24142f', '#3f2453', '#5f3a7a', '#8259a0', '#a982c0', '#d0b2dc']);
  R('cardboard', ['#3a2516', '#634221', '#8c6233', '#b08245', '#cea35f', '#e6c587']);
  R('bakelite', ['#24100e', '#43201a', '#683424', '#8c4a30', '#ae6a44', '#cc9064']);

  /* ------------------------------------------------------------------ */
  /* tiny pixel font (3×5, a few letters wider), for labels and signs     */
  const GL = {
    A: '010 101 111 101 101', B: '110 101 110 101 110', C: '011 100 100 100 011', D: '110 101 101 101 110',
    E: '111 100 110 100 111', F: '111 100 110 100 100', G: '011 100 101 101 011', H: '101 101 111 101 101',
    I: '111 010 010 010 111', J: '001 001 001 101 010', K: '101 101 110 101 101', L: '100 100 100 100 111',
    M: '10001 11011 10101 10001 10001', N: '1001 1101 1011 1001 1001', O: '010 101 101 101 010',
    P: '110 101 110 100 100', Q: '010 101 101 110 011', R: '110 101 110 101 101', S: '011 100 010 001 110',
    T: '111 010 010 010 010', U: '101 101 101 101 111', V: '101 101 101 101 010', W: '10001 10001 10101 11011 10001',
    X: '101 101 010 101 101', Y: '101 101 010 010 010', Z: '111 001 010 100 111',
    0: '111 101 101 101 111', 1: '010 110 010 010 111', 2: '110 001 010 100 111', 3: '110 001 010 001 110',
    4: '101 101 111 001 001', 5: '111 100 110 001 110', 6: '011 100 111 101 111', 7: '111 001 010 010 010',
    8: '111 101 111 101 111', 9: '111 101 111 001 110',
    ' ': '00 00 00 00 00', '-': '00 00 11 00 00', '—': '0000 0000 1111 0000 0000', "'": '1 1 0 0 0',
    '.': '0 0 0 0 1', ',': '0 0 0 1 1', '·': '0 0 1 0 0', ':': '0 1 0 1 0', '!': '1 1 1 0 1',
    '?': '110 001 010 000 010', '#': '01010 11111 01010 11111 01010', '/': '001 001 010 100 100',
    '+': '000 010 111 010 000', '(': '01 10 10 10 01', ')': '10 01 01 01 10', '&': '0100 1010 0100 1010 0101'
  };
  const glyph = (ch) => (GL[ch] || GL['?']).split(' ');
  const base = (ch) => (ch === 'Ë' ? 'E' : ch === 'É' ? 'E' : ch);
  function textW(str, sp = 1) { let w = 0; for (const ch of str) w += glyph(base(ch))[0].length + sp; return Math.max(0, w - sp); }
  /* o: { sp, italic (slant the top rows), jitter (seed: uneven baseline, for handwriting) } */
  function text(s, x, y, str, c, o = {}) {
    const sp = o.sp === undefined ? 1 : o.sp, rng = o.jitter ? PX.rng(o.jitter) : null;
    let cx = x;
    for (const ch0 of str) {
      const rows = glyph(base(ch0));
      const jy = rng && rng() < 0.35 ? (rng() < 0.5 ? -1 : 1) : 0;
      rows.forEach((row, ry) => {
        const sx = o.italic ? (ry < 2 ? 1 : 0) : 0;
        for (let rx = 0; rx < row.length; rx++) if (row[rx] === '1') s.px(cx + rx + sx, y + ry + jy, c);
      });
      if (ch0 === 'Ë') { s.px(cx + (o.italic ? 1 : 0), y - 2 + jy, c); s.px(cx + 2 + (o.italic ? 1 : 0), y - 2 + jy, c); }
      if (ch0 === 'É') { s.px(cx + 1 + (o.italic ? 1 : 0), y - 2 + jy, c); s.px(cx + 2 + (o.italic ? 1 : 0), y - 3 + jy, c); }
      cx += rows[0].length + sp;
    }
    return cx - sp - x;
  }

  /* ------------------------------------------------------------------ */
  /* one-point perspective room                                          */
  function Room(o) {
    const { vx, vy, bx0, by0, bx1, by1, z0 } = o;
    const S = (d) => z0 / (z0 - d), D = (k) => z0 * (1 - 1 / k);
    const p = (x, y, d) => { const k = S(d); return [vx + (x - vx) * k, vy + (y - vy) * k]; };
    const pr = (x, y, d) => { const q = p(x, y, d); return [rnd(q[0]), rnd(q[1])]; };
    const far = D(9);
    const rm = { vx, vy, bx0, by0, bx1, by1, z0, S, D, p, pr, far };
    rm.back = [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]];
    rm.floor = [[bx0, by1], [bx1, by1], p(bx1, by1, far), p(bx0, by1, far)];
    rm.ceil = [p(bx0, by0, far), p(bx1, by0, far), [bx1, by0], [bx0, by0]];
    rm.left = [p(bx0, by0, far), [bx0, by0], [bx0, by1], p(bx0, by1, far)];
    rm.right = [[bx1, by0], p(bx1, by0, far), p(bx1, by1, far), [bx1, by1]];
    /* screen → world on each plane (pixel centres) */
    /* (they return one shared scratch array: read it straight away) */
    const Q = new Float64Array(3);
    rm.onFloor = (x, y, h = by1) => { const k = (y + 0.5 - vy) / (h - vy); Q[0] = vx + (x + 0.5 - vx) / k; Q[1] = z0 - z0 / k; Q[2] = k; return Q; };
    rm.onCeil = (x, y) => { const k = (y + 0.5 - vy) / (by0 - vy); Q[0] = vx + (x + 0.5 - vx) / k; Q[1] = z0 - z0 / k; Q[2] = k; return Q; };
    rm.onLeft = (x, y) => { const k = (x + 0.5 - vx) / (bx0 - vx); Q[0] = z0 - z0 / k; Q[1] = vy + (y + 0.5 - vy) / k; Q[2] = k; return Q; };
    rm.onRight = (x, y) => { const k = (x + 0.5 - vx) / (bx1 - vx); Q[0] = z0 - z0 / k; Q[1] = vy + (y + 0.5 - vy) / k; Q[2] = k; return Q; };
    /* quads on the side walls / floor */
    rm.lq = (d0, d1, y0, y1, x = bx0) => [pr(x, y0, d0), pr(x, y0, d1), pr(x, y1, d1), pr(x, y1, d0)];
    rm.rq = (d0, d1, y0, y1, x = bx1) => [pr(x, y0, d0), pr(x, y0, d1), pr(x, y1, d1), pr(x, y1, d0)];
    rm.fq = (x0, x1, d0, d1, y = by1) => [pr(x0, y, d0), pr(x1, y, d0), pr(x1, y, d1), pr(x0, y, d1)];
    return rm;
  }

  /* A world-space box. Paints visible faces (top lighter, sides darker) and
   * returns its screen corners; c.front = [x, y, w, h] of the front face.
   * o: { base, top, side, bottom, paint(name, poly, c) → true to skip default } */
  function box(s, rm, b, ramp, o = {}) {
    const pr = rm.pr;
    const c = {
      ftl: pr(b.x0, b.y0, b.d1), ftr: pr(b.x1, b.y0, b.d1), fbr: pr(b.x1, b.y1, b.d1), fbl: pr(b.x0, b.y1, b.d1),
      btl: pr(b.x0, b.y0, b.d0), btr: pr(b.x1, b.y0, b.d0), bbr: pr(b.x1, b.y1, b.d0), bbl: pr(b.x0, b.y1, b.d0)
    };
    const bs = o.base === undefined ? 3 : o.base;
    const face = (name, poly, shade) => { if (o.paint && o.paint(name, poly, c)) return; if (ramp) s.poly(poly, cl(ramp, shade)); };
    c.faces = {};
    if (b.y0 > rm.vy) { c.faces.top = [c.btl, c.btr, c.ftr, c.ftl]; face('top', c.faces.top, o.top === undefined ? bs + 1 : o.top); }
    if (b.y1 < rm.vy) { c.faces.bottom = [c.fbl, c.fbr, c.bbr, c.bbl]; face('bottom', c.faces.bottom, o.bottom === undefined ? bs - 2 : o.bottom); }
    if (b.x1 < rm.vx) { c.faces.right = [c.ftr, c.btr, c.bbr, c.fbr]; face('right', c.faces.right, o.side === undefined ? bs - 1 : o.side); }
    if (b.x0 > rm.vx) { c.faces.left = [c.btl, c.ftl, c.fbl, c.bbl]; face('left', c.faces.left, o.side === undefined ? bs - 1 : o.side); }
    c.front = [c.ftl[0], c.ftl[1], c.ftr[0] - c.ftl[0], c.fbl[1] - c.ftl[1]];
    c.faces.front = [c.ftl, c.ftr, c.fbr, c.fbl];
    face('front', c.faces.front, bs);
    return c;
  }

  /* ------------------------------------------------------------------ */
  /* pixel helpers                                                       */
  const isE = (v) => (v & 0x8000) !== 0;
  /* shift the shade of existing pixels in a polygon by d (cast shadow / light);
   * dither (0..1) affects only part of them; emissive pixels are left alone */
  function shadePoly(s, pts, d, dither) {
    s.poly(pts, (x, y) => {
      const v = s.get(x, y);
      if (!v || isE(v)) return 0;
      if (dither !== undefined && PX.bayer(x, y) >= dither) return 0;
      return SH(v, d);
    });
  }
  const shadeRect = (s, x, y, w, h, d, dither) => shadePoly(s, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], d, dither);
  function shadeEll(s, cx, cy, rx, ry, d, dither) {
    s.ellipse(cx, cy, rx, ry, (x, y) => { const v = s.get(x, y); if (!v || isE(v)) return 0; if (dither !== undefined && PX.bayer(x, y) >= dither) return 0; return SH(v, d); });
  }
  /* soft falloff: t(x,y) in 0..2 → darken one shade where bayer < t, two where bayer < t-1 */
  function falloff(s, pts, tfn, d = -1) {
    s.poly(pts, (x, y) => {
      const v = s.get(x, y); if (!v || isE(v)) return 0;
      const t = tfn(x, y); if (t <= 0) return 0;
      const b = PX.bayer(x, y);
      const k = (b < t ? 1 : 0) + (b < t - 1 ? 1 : 0);
      return k ? SH(v, d * k) : 0;
    });
  }
  /* stepped falloff: darken floor(t) shades solidly, dithering only a narrow
   * seam (sw, in t units) before each step, so big areas stay clean */
  function band(s, pts, tfn, sw = 0.25, d = -1) {
    s.poly(pts, (x, y) => {
      const v = s.get(x, y); if (!v || isE(v)) return 0;
      const t = tfn(x, y); if (t <= 1 - sw) return 0;
      let k = flo(t); const f = t - k;
      if (f > 1 - sw && PX.bayer(x, y) < (f - (1 - sw)) / sw) k++;
      return k ? SH(v, d * k) : 0;
    });
  }
  /* rounded rectangle; c is a code or fn(x, y, lx, ly) */
  function rrect(s, x, y, w, h, r, c, o = {}) {
    for (let yy = 0; yy < h; yy++) {
      let ins = 0;
      const top = !o.noTop && yy < r, bot = !o.noBottom && yy >= h - r;
      if (top || bot) { const dy = top ? r - yy - 0.5 : yy - (h - r) + 0.5; ins = rnd(r - Math.sqrt(Math.max(0, r * r - dy * dy))); }
      for (let xx = ins; xx < w - ins; xx++) { const cc = typeof c === 'function' ? c(x + xx, y + yy, xx, yy) : c; if (cc) s.px(x + xx, y + yy, cc); }
    }
  }
  /* draw into a scratch layer, give it a selective outline (darkest shade of
   * each pixel's own ramp: shade `dark` on the bottom/right, `light` on the
   * top/left), then stamp it onto s */
  const TMP = new PX.Surf(PX.W, PX.H);
  function obj(s, draw, o = {}) {
    const d = TMP.d, w = TMP.w, h = TMP.h;
    const bx = o.box ? [Math.max(0, o.box[0] - 1), Math.max(0, o.box[1] - 1), Math.min(w, o.box[0] + o.box[2] + 1), Math.min(h, o.box[1] + o.box[3] + 1)] : [0, 0, w, h];
    d.fill(0); TMP.mask = null; TMP.L = {};
    draw(TMP);
    if (o.outline !== false) {
      const dk = o.dark === undefined ? 0 : o.dark, lt = o.light === undefined ? 1 : o.light, out = [];
      for (let y = bx[1]; y < bx[3]; y++) for (let x = bx[0]; x < bx[2]; x++) {
        const i = y * w + x, v = d[i];
        if (!v || isE(v)) continue;
        const L = x === 0 || !d[i - 1], Rt = x === w - 1 || !d[i + 1], T = y === 0 || !d[i - w], B = y === h - 1 || !d[i + w];
        if (o.skip && o.skip(x, y)) continue;
        if (B || Rt) out.push(i, (v & 0x7ff0) | Math.min(v & 15, dk));
        else if (L || T) out.push(i, (v & 0x7ff0) | Math.min(v & 15, lt));
      }
      for (let k = 0; k < out.length; k += 2) d[out[k]] = out[k + 1];
    }
    for (let y = bx[1]; y < bx[3]; y++) for (let x = bx[0]; x < bx[2]; x++) { const v = d[y * w + x]; if (v) s.px(x, y, v); }
    for (const ch in TMP.L) { const L = s.L[ch] || (s.L[ch] = new Float32Array(w * h)), M = TMP.L[ch]; for (let i = 0; i < M.length; i++) L[i] += M[i]; }
  }
  /* a 1px drop shadow to the lower right of a rect on a wall */
  function wallShadow(s, x, y, w, h, dx = 1, dy = 1) { shadeRect(s, x + w, y + dy, dx, h, -1); shadeRect(s, x + dx, y + h, w, dy, -1); }
  /* a coiled phone cord along a polyline: 2px wide, twisted (lit / mid / dark) */
  function cord(s, pts, r) {
    let k = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const dx = x1 - x0, dy = y1 - y0, n = Math.max(1, rnd(Math.max(Math.abs(dx), Math.abs(dy))));
      const vert = Math.abs(dy) >= Math.abs(dx);
      for (let j = 0; j < n; j++, k++) {
        const x = rnd(x0 + dx * j / n), y = rnd(y0 + dy * j / n), o = k & 1;
        if (vert) { s.px(x, y, o ? r[2] : r[4]); s.px(x + 1, y, o ? r[1] : r[2]); }
        else { s.px(x, y, o ? r[2] : r[4]); s.px(x, y + 1, o ? r[1] : r[2]); }
      }
    }
  }
  /* sagging curve between two points */
  function sag(x0, y0, x1, y1, amt, n = 16) { const pts = []; for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + Math.sin(Math.PI * t) * amt]); } return pts; }

  /* fabric folds: shade offset for a curtain column (period in px) */
  const fold = (x, period, phase = 0) => { const q = (((x + phase) % period) + period) % period / period; return q < 0.2 ? 1 : q < 0.55 ? 0 : q < 0.8 ? -1 : 0; };
  /* gingham: 0 white, 1 single stripe, 2 crossing */
  const gingham = (x, y, n = 2) => ((flo(x / n) & 1) + (flo(y / n) & 1));

  /* a tiled motif: tile = array of strings, map = {char: code | fn(x,y)} */
  function motif(tile, map) {
    const th = tile.length, tw = tile[0].length;
    return (u, v) => { const ch = tile[((flo(v) % th) + th) % th][((flo(u) % tw) + tw) % tw]; return map[ch]; };
  }


  /* A box rotated about the vertical axis (angle a, radians) around its centre
   * (cx, cd) on the floor plan: w across, dp deep, heights y0 (top) .. y1.
   * Visible faces are painted back to front with paint(name, poly, lum), where
   * lum is -1..1 (how much the face turns toward a light from the front left). */
  function rbox(s, rm, b, paint) {
    const ca = Math.cos(b.a), sa = Math.sin(b.a), hw = b.w / 2, hd = b.dp / 2;
    const loc = (lx, ld) => [b.cx + lx * ca - ld * sa, b.cd + lx * sa + ld * ca];
    const q = [loc(-hw, -hd), loc(hw, -hd), loc(hw, hd), loc(-hw, hd)];
    const N = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([x, d]) => [x * ca - d * sa, x * sa + d * ca]);
    const P3 = (pt, y) => rm.pr(pt[0], y, pt[1]);
    const L = b.light || [-0.55, 0.83];
    const faces = [];
    const names = ['back', 'right', 'front', 'left'];
    for (let i = 0; i < 4; i++) {
      const A = q[i], B = q[(i + 1) % 4], mx = (A[0] + B[0]) / 2, md = (A[1] + B[1]) / 2;
      const n = N[i];
      if (n[0] * (rm.vx - mx) + n[1] * (rm.z0 - md) <= 0) continue;
      faces.push({ name: names[i], poly: [P3(A, b.y0), P3(B, b.y0), P3(B, b.y1), P3(A, b.y1)], depth: md, lum: n[0] * L[0] + n[1] * L[1] });
    }
    faces.sort((f, g) => f.depth - g.depth);
    for (const f of faces) paint(f.name, f.poly, f.lum);
    if (b.y0 > rm.vy) paint('top', q.map((pt) => P3(pt, b.y0)), 1);
    return { q, P3 };
  }

  /* hardwood floor: boards running toward the vanishing point, butt joints,
   * a few grain streaks; base = shade, pw = board width in world px */
  function plankFloor(s, rm, ramp, o = {}) {
    const pw = o.pw || 9, base = o.base === undefined ? 3 : o.base, rng = PX.rng(o.seed || 'planks'), B = {};
    const brd = (n) => B[n] || (B[n] = { sh: rng() < 0.28 ? -1 : rng() < 0.18 ? 1 : 0, j: rng.range(0, 80), L: rng.range(46, 84), g: rng.range(0.25, 0.75) });
    const poly = o.poly || rm.floor, h = o.h === undefined ? rm.by1 : o.h;
    s.poly(poly, (x, y) => {
      const q = rm.onFloor(x, y, h), xw = q[0], d = q[1], k = q[2];
      const n = flo(xw / pw), b = brd(n), fx = xw - n * pw, wpx = 1 / k;
      if (fx < wpx) return cl(ramp, base - 2);
      const dpx = rm.z0 / (k * k * Math.abs(h - rm.vy));
      if ((d + b.j) % b.L < dpx) return cl(ramp, base - 2);
      const sh = base + b.sh;
      if (Math.abs(fx - b.g * pw) < wpx * 0.5 && ((d + n * 17) % 29) < 13) return cl(ramp, sh - 1);
      if (fx < wpx * 2 && b.sh >= 0) return cl(ramp, sh + 1);
      return cl(ramp, sh);
    });
  }

  /* chevron-stripe crochet (an afghan) */
  const ripple = (x, y, rows, period = 8) => { const z = Math.abs((((x % period) + period) % period) - period / 2); return rows[(((flo((y + z) / 2)) % rows.length) + rows.length) % rows.length]; };

  /* ================================================================== */
  /* KITCHEN — Mémère's kitchen, 9 Larch Street                          */
  /* ================================================================== */
  const DAISY = [
    '..........',
    '..o.......',
    '.oyo......',
    '..o.......',
    '..........',
    '.......o..',
    '......oyo.',
    '.......o..',
    '..........',
    '..........'
  ];

  PX.bg('kitchen', {
    times: ['morning', 'evening', 'night'],
    draw(s, o) { kitchen(s, o); }
  });

  function kitchen(s, o) {
    const t = o.time, night = t === 'night', eve = t === 'evening', morn = t === 'morning';
    const rm = Room({ vx: 162, vy: 42, bx0: 52, by0: 10, bx1: 272, by1: 106, z0: 210 });
    const { by0, by1, bx0, bx1 } = rm;
    const KP = P.k_paper;

    /* ---- shell ---- */
    s.poly(rm.ceil, (x, y) => { const d = rm.onCeil(x, y)[1]; return P.ceil[d > 30 ? 3 : 4]; });
    const paper = motif(DAISY, { '.': KP[4], o: KP[5], y: P.mustard[4] });
    s.poly(rm.back, (x, y) => paper(x - bx0 + 3, y));
    s.poly(rm.left, (x, y) => { const q = rm.onLeft(x, y), d = q[0], yw = q[1]; return SH(paper(d * 0.9 + 3, yw), -1); });
    s.poly(rm.right, (x, y) => { const q = rm.onRight(x, y), d = q[0], yw = q[1]; return SH(paper(-d * 0.9 + 7, yw), -1); });
    // border strip under the ceiling: little red tulips
    const border = (u, yw) => {
      const r = yw - by0, k = ((flo(u) % 7) + 7) % 7;
      if (r < 1 || r >= 4) return P.red[2];
      if (k === 3) return r < 2 ? P.red[4] : r < 3 ? P.red[3] : P.sage[3];
      if (r === 2 && (k === 2 || k === 4)) return P.sage[4];
      return KP[5];
    };
    s.poly([[bx0, by0], [bx1, by0], [bx1, by0 + 5], [bx0, by0 + 5]], (x, y) => border(x - bx0, y));
    s.poly(rm.lq(0, rm.far, by0, by0 + 5), (x, y) => { const q = rm.onLeft(x, y), d = q[0], yw = q[1]; return SH(border(d, yw), -1); });
    s.poly(rm.rq(0, rm.far, by0, by0 + 5), (x, y) => { const q = rm.onRight(x, y), d = q[0], yw = q[1]; return SH(border(-d, yw), -1); });
    // checkered linoleum
    const TL = 13;
    s.poly(rm.floor, (x, y) => {
      const q = rm.onFloor(x, y), xw = q[0], d = q[1];
      return (((flo((xw - 4) / TL) + flo((d + 6) / TL)) & 1) === 0) ? P.lino_r[3] : P.lino_c[3];
    });
    // the window's sheen on the linoleum
    s.poly(rm.fq(142, 190, 22, 140), (x, y) => {
      const v = s.get(x, y), q = rm.onFloor(x, y), xw = q[0], d = q[1];
      const t2 = 0.55 - (d - 22) / 140 - Math.abs(xw - 166) / 60;
      return PX.bayer(x, y) < t2 ? SH(v, 1) : 0;
    });
    // baseboards on the side walls
    s.poly(rm.lq(0, rm.far, by1 - 3, by1), P.mint[2]); s.poly(rm.rq(0, rm.far, by1 - 3, by1), P.mint[2]);
    s.poly(rm.lq(0, rm.far, by1 - 3, by1 - 2), P.mint[3]); s.poly(rm.rq(0, rm.far, by1 - 3, by1 - 2), P.mint[3]);
    // ambient occlusion: tops of the walls, floor edges, the front of the floor
    band(s, rm.back, (x, y) => (by0 + 13 - y) / 6, 0.5);
    band(s, rm.left, (x, y) => { const q = rm.onLeft(x, y), d = q[0], yw = q[1]; return (by0 + 13 - yw) / 6; }, 0.5);
    band(s, rm.right, (x, y) => { const q = rm.onRight(x, y), d = q[0], yw = q[1]; return (by0 + 13 - yw) / 6; }, 0.5);
    band(s, rm.floor, (x, y) => { const q = rm.onFloor(x, y), xw = q[0], d = q[1]; return Math.max((9 - d) / 6, (xw - bx1 + 10) / 8, (bx0 + 10 - xw) / 8, (d - 64) / 28); }, 0.3);

    /* ---- back wall ---- */
    // tiled backsplash
    for (let yy = 58; yy < 70; yy++) for (let xx = 90; xx < 230; xx++) {
      const g = (xx - 90) % 5 === 4 || (yy - 58) % 5 === 4;
      s.px(xx, yy, g ? P.lino_c[3] : P.lino_c[(xx * 7 + yy * 3) % 11 === 0 ? 5 : 4]);
    }
    kitchenWindow(s, t);
    calendar(s, 106, 24);
    wallClock(s, 74, 24);
    crucifix(s, 165, 13);
    const uc = box(s, rm, { x0: 196, x1: 230, y0: 14, y1: 44, d0: 0, d1: 13 }, P.mint, { base: 3, side: 2 });
    cabinetDoors(s, uc.front, 2, P.mint);
    doorway(s, rm);
    fridge(s, rm);
    counters(s, rm, t);
    stove(s, rm, t);

    /* ---- floor, left & right walls ---- */
    ragRug(s, rm, 168, 42, 22, 10);
    phone(s, rm);
    backDoor(s, rm, t);
    table(s, rm);
    pendant(s, rm, eve);

    /* ---- light ---- */
    if (morn) {
      const a = rm.pr(150, by1, 30), b = rm.pr(198, by1, 30), c = rm.pr(214, by1, 78), d = rm.pr(164, by1, 78);
      s.lightPoly('sun', [[143, 29], [189, 29], c, d], 0.28, { fade: { x0: 166, y0: 30, x1: 186, y1: 150 } });
      s.lightPoly('sun', [a, b, c, d], 0.8);
      s.lightPoly('sun', [[142, 69], [190, 69], [194, 75], [142, 75]], 0.5);
      s.light('sun', 166, 56, 130, 90, 0.3);
    } else if (eve) {
      s.light('warm', 262, 40, 150, 120, 1.0, { core: 0.22 });
      s.light('warm', 240, 98, 60, 22, 0.5);
      s.light('warm', 247, 52, 28, 22, 0.55);
    } else {
      s.light('warm', 247, 56, 30, 26, 1.0, { core: 0.3 });
      s.light('warm', 247, 96, 46, 20, 0.4);
      const m0 = rm.pr(158, by1, 26), m1 = rm.pr(204, by1, 26), m2 = rm.pr(222, by1, 70), m3 = rm.pr(176, by1, 70);
      s.lightPoly('cool', [m0, m1, m2, m3], 0.45);
      s.lightPoly('cool', [[142, 70], [190, 70], [196, 76], [148, 76]], 0.35);
      s.light('cool', 293, 52, 16, 26, 0.35);
    }
  }

  /* the window over the sink; next door, the Gagnons' yellow clapboard */
  function kitchenWindow(s, t) {
    const x = 140, y = 29, w = 50, h = 31;
    const night = t === 'night', eve = t === 'evening';
    s.rect(x - 3, y - 3, w + 6, h + 4, P.trim[3]);
    s.hline(x - 3, x + w + 2, y - 3, P.trim[4]); s.vline(x - 3, y - 3, y + h, P.trim[4]); s.vline(x + w + 2, y - 2, y + h, P.trim[2]);
    // the view, all emissive: sky, the maple, the Gagnons' wall and window
    const sky = night ? [P.sky_night[1], P.sky_night[2], P.sky_night[3]] : eve ? [P.sky_dusk[2], P.sky_dusk[3], P.sky_dusk[4]] : [P.sky_day[3], P.sky_day[4], P.sky_day[5]];
    s.vgrad(x, y, w, 16, sky.map(E), 3);
    if (night) { s.px(x + 12, y + 4, E(P.white[4])); s.px(x + 6, y + 9, E(P.cloud[3])); s.circle(x + 33, y + 6, 2.5, E(P.cloud[4])); s.circle(x + 34, y + 5, 2.2, E(P.sky_night[1])); }
    if (!night) {
      const lv = eve ? [P.leaf_red[1], P.leaf_orange[1], P.violet[1]] : [P.leaf_gold[4], P.leaf_orange[4], P.grass[4], P.leaf_gold[3], P.leaf_orange[3]];
      const rr = PX.rng('k-maple');
      s.line(x + w, y + 3, x + 34, y + 9, E(eve ? P.violet[0] : P.bark[2]));
      for (let i = 0; i < 34; i++) { const lx = x + 30 + rr.int(0, 19), ly = y + rr.int(0, 9); s.px(lx, ly, E(rr.pick(lv))); s.px(lx + 1, ly, E(rr.pick(lv))); }
    }
    const wallR = night ? P.nite : eve ? P.violet : P.house_yellow, wb = night ? 3 : eve ? 2 : 3;
    s.rect(x, y + 12, w, 2, E(night ? P.nite[0] : eve ? P.violet[0] : P.roof[1]));
    s.rect(x, y + 14, w, 1, E(night ? P.nite[1] : eve ? P.violet[1] : P.trim[2]));
    for (let yy = y + 15; yy < y + h; yy++) { const k = (yy - y - 15) % 3; s.hline(x, x + w - 1, yy, E(cl(wallR, k === 0 ? wb + 1 : k === 2 ? wb - 1 : wb))); }
    const wx = x + 29, wy = y + 18;
    s.rect(wx - 1, wy - 1, 14, 13, E(night ? P.nite[1] : eve ? P.violet[3] : P.trim[4]));
    if (eve) s.vgrad(wx, wy, 12, 11, [E(P.lamp[5]), E(P.lamp[4]), E(P.lamp[3])], 2);
    else s.vgrad(wx, wy, 12, 11, night ? [E(P.nite[2]), E(P.nite[1])] : [E(P.sky_day[2]), E(P.sky_day[1])], 2);
    s.vline(wx + 6, wy, wy + 10, E(night ? P.nite[1] : eve ? P.violet[3] : P.trim[3]));
    if (!night && !eve) s.line(wx + 1, wy + 9, wx + 4, wy + 1, E(P.white[3]));
    // sashes
    s.rect(x, y, w, 2, P.trim[4]); s.rect(x, y + h - 2, w, 2, P.trim[3]);
    s.rect(x, y, 2, h, P.trim[4]); s.rect(x + w - 2, y, 2, h, P.trim[3]);
    s.rect(x, y + 14, w, 3, P.trim[4]); s.hline(x, x + w - 1, y + 16, P.trim[2]);
    s.vline(x + 24, y, y + h - 1, P.trim[3]); s.vline(x + 25, y, y + h - 1, P.trim[4]);
    if (!night) { s.px(x + 5, y + 4, E(P.white[4])); s.px(x + 6, y + 3, E(P.white[4])); }
    // sill
    s.rect(x - 5, y + h, w + 10, 3, P.trim[4]); s.hline(x - 5, x + w + 4, y + h, P.trim[5]); s.hline(x - 5, x + w + 4, y + h + 2, P.trim[2]);
    // red gingham: two tied-back panels and a ruffled valance
    const gc = (xx, yy, sh) => { const g = gingham(xx, yy); return g === 0 ? cl(P.white_cloth, 4 + sh) : g === 1 ? cl(P.red, 4 + sh) : cl(P.red, 2 + sh); };
    const panel2 = (side) => {
      const tie = y + 19;
      for (let yy = y; yy < y + h; yy++) {
        const wd = yy < tie ? rnd(8 - (yy - y) * 0.2) : rnd(4 + (yy - tie) * 0.25);
        for (let k = 0; k < wd + 3; k++) {
          const xx = side < 0 ? x - 3 + k : x + w + 2 - k;
          s.px(xx, yy, k === wd + 2 ? P.red[1] : gc(xx, yy, fold(k, 4, 1)));
        }
      }
      const tx = side < 0 ? x - 3 : x + w - 4;
      s.rect(tx, tie - 1, 7, 3, P.red[3]); s.hline(tx, tx + 6, tie - 1, P.red[4]); s.hline(tx, tx + 6, tie + 1, P.red[1]);
    };
    panel2(-1); panel2(1);
    for (let xx = x - 5; xx < x + w + 5; xx++) {
      const drop = 6 + (((xx - x) % 6 + 6) % 6 < 3 ? 1 : 0);
      for (let yy = y - 4; yy < y - 4 + drop; yy++) s.px(xx, yy, gc(xx, yy, fold(xx, 6, 1) + (yy === y - 4 ? 1 : 0)));
      s.px(xx, y - 4 + drop, P.red[1]);
    }
    // on the sill: Mémère's pill bottles and an African violet
    const sy = y + h - 1;
    for (const [px, hh] of [[x + 29, 5], [x + 33, 4], [x + 37, 5]]) {
      s.rect(px, sy - hh + 1, 3, hh - 1, P.amber[3]); s.vline(px, sy - hh + 2, sy - 1, P.amber[4]); s.vline(px + 2, sy - hh + 2, sy - 1, P.amber[1]);
      s.rect(px, sy - hh, 3, 2, P.white_cloth[4]); s.px(px + 2, sy - hh + 1, P.white_cloth[2]);
      s.hline(px, px + 2, sy - 2, P.white_cloth[3]);
    }
    s.rect(x + 10, sy - 2, 7, 3, P.tile_red[3]); s.hline(x + 10, x + 16, sy - 2, P.tile_red[4]); s.vline(x + 16, sy - 1, sy, P.tile_red[2]);
    s.ellipse(x + 13.5, sy - 5, 5.5, 3, (xx, yy, nx, ny) => P.sage[ny < -0.3 ? 4 : nx > 0.4 || ny > 0.5 ? 2 : 3]);
    for (const [fx, fy] of [[x + 10, sy - 7], [x + 13, sy - 8], [x + 16, sy - 6], [x + 12, sy - 5]]) { s.px(fx, fy, P.violet[4]); s.px(fx + 1, fy, P.violet[3]); }
  }

  /* Holy Rosary parish calendar */
  function calendar(s, x, y) {
    const w = 26, h = 34;
    s.px(x + 13, y - 3, P.metal[2]);
    s.line(x + 13, y - 3, x + 3, y, P.ink[4]); s.line(x + 13, y - 3, x + 22, y, P.ink[4]);
    s.rect(x, y, w, h, P.paper[4]); s.hline(x, x + w - 1, y, P.paper[5]); s.vline(x, y, y + h - 1, P.paper[5]);
    s.vline(x + w - 1, y + 1, y + h - 1, P.paper[2]); s.hline(x + 1, x + w - 1, y + h - 1, P.paper[2]);
    // the picture: Holy Rosary church on a blue October day
    const px = x + 2, py = y + 2, pw = w - 4, ph = 13;
    s.vgrad(px, py, pw, ph, [P.sky_day[3], P.sky_day[4]], 2);
    s.rect(px, py + ph - 3, pw, 3, P.grass[4]); s.hline(px, px + pw - 1, py + ph - 3, P.grass[5]);
    s.rect(px + 7, py + 6, 9, 5, P.white_cloth[4]); s.vline(px + 15, py + 6, py + 10, P.white_cloth[2]);
    s.poly([[px + 6, py + 7], [px + 11.5, py + 3], [px + 17, py + 7]], P.roof_red[3]);
    s.rect(px + 10, py, 3, 4, P.white_cloth[5]); s.px(px + 11, py - 1, P.white_cloth[5]);
    s.px(px + 11, py + 8, P.wood[2]); s.px(px + 11, py + 9, P.wood[2]); s.px(px + 11, py + 10, P.wood[2]);
    s.px(px + 8, py + 8, P.sky_day[1]); s.px(px + 14, py + 8, P.sky_day[1]);
    s.rect(px + 1, py + 7, 3, 3, P.leaf_orange[3]); s.px(px + 2, py + 6, P.leaf_orange[4]);
    s.rect(px + pw - 4, py + 6, 3, 4, P.leaf_red[3]); s.px(px + pw - 3, py + 5, P.leaf_red[4]);
    text(s, x + 7, y + 16, 'HOLY', P.red[2]);
    text(s, x + 2, y + 22, 'ROSARY', P.red[2]);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 7; c++) s.px(x + 3 + c * 3, y + 29 + r * 2, P.paper[2]);
    s.px(x + 3 + 6 * 3, y + 29, P.red[3]);
    wallShadow(s, x, y, w, h);
  }

  function wallClock(s, cx, cy) {
    s.circle(cx + 0.5, cy + 0.5, 7, P.red[2]);
    s.circle(cx + 0.5, cy + 0.5, 6, P.red[4]);
    s.circle(cx + 0.5, cy + 0.5, 5, P.white_cloth[5]);
    s.ellipse(cx + 1.5, cy + 1.5, 4.2, 4.2, (x, y, nx, ny) => (nx + ny > 0.9 ? P.white_cloth[3] : 0));
    for (const [dx, dy] of [[0, -4], [4, 0], [0, 4], [-4, 0]]) s.px(cx + dx, cy + dy, P.ink[3]);
    s.line(cx, cy, cx, cy - 3, P.ink[1]); s.line(cx, cy, cx + 2, cy + 1, P.ink[1]);
    s.px(cx, cy, P.red[2]);
    s.ring(cx + 1, cy + 1, 6.6, 6.6, P.red[1]);
    shadeEll(s, cx + 2, cy + 2, 7, 7, -1, 0.5);
  }

  function crucifix(s, cx, y) {
    // a dried palm frond from Palm Sunday tucked behind it
    s.line(cx - 4, y + 10, cx + 5, y - 1, P.grass_fall[3]); s.line(cx - 3, y + 10, cx + 6, y, P.grass_fall[4]);
    s.rect(cx, y, 2, 12, P.wood_dark[3]); s.vline(cx, y, y + 11, P.wood_dark[5]);
    s.rect(cx - 3, y + 3, 8, 2, P.wood_dark[3]); s.hline(cx - 3, cx + 4, y + 3, P.wood_dark[5]);
    s.hline(cx - 2, cx + 3, y + 4, P.brass[3]); s.px(cx, y + 3, P.brass[5]);
    s.vline(cx, y + 5, y + 8, P.brass[4]); s.vline(cx + 1, y + 5, y + 8, P.brass[2]);
    shadeRect(s, cx + 2, y + 1, 1, 12, -1); shadeRect(s, cx + 5, y + 4, 1, 2, -1); shadeRect(s, cx - 2, y + 5, 2, 1, -1);
  }

  /* the old round-shouldered fridge and its magnets */
  function fridge(s, rm) {
    const b = { x0: 58, x1: 90, y0: 42, y1: rm.by1, d0: 0, d1: 28 };
    const c = box(s, rm, b, null);
    const [fx, fy, fw, fh] = c.front;
    obj(s, (T) => {
      // side face: shaded, its top edge rounded over
      T.poly([[c.ftr[0], c.ftr[1] + 5], [c.btr[0], c.btr[1] + 4], c.bbr, c.fbr], (x, y) => P.enamel[2]);
      T.poly([[c.ftr[0] - 1, c.ftr[1] + 2], [c.btr[0], c.btr[1] + 1], [c.btr[0], c.btr[1] + 4], [c.ftr[0], c.ftr[1] + 5]], P.enamel[3]);
      T.line(c.ftr[0] - 2, c.ftr[1] + 1, c.btr[0] - 1, c.btr[1], P.enamel[4]);
      T.poly([[c.ftr[0], c.fbr[1] - 7], [c.btr[0], c.bbr[1] - 6], [c.bbr[0], c.bbr[1]], [c.fbr[0], c.fbr[1]]], P.enamel[1]);
      // the front: rounded shoulders, cylinder shading across, a glossy streak
      rrect(T, fx, fy, fw + 1, fh, 7, (x, y, lx, ly) => {
        const u = lx / fw;
        let sh = u < 0.06 ? 4 : u < 0.16 ? 5 : u < 0.6 ? 4 : u < 0.84 ? 3 : 2;
        if (ly < 3 && u > 0.08 && u < 0.82) sh = 5;
        if (ly === 0) sh = 5;
        return P.enamel[sh];
      }, { noBottom: true });
      // door gap, kick grille
      T.hline(fx + 1, fx + fw - 1, fy + fh - 10, P.enamel[1]); T.hline(fx + 1, fx + fw - 1, fy + fh - 9, P.enamel[5]);
      T.rect(fx + 2, fy + fh - 7, fw - 3, 6, P.ink[3]);
      for (let x = fx + 3; x < fx + fw - 2; x += 2) T.vline(x, fy + fh - 6, fy + fh - 3, P.metal[3]);
      // chrome lever handle and the badge
      T.rect(fx + fw - 6, fy + 17, 3, 15, P.chrome[3]); T.vline(fx + fw - 6, fy + 17, fy + 31, P.chrome[5]); T.vline(fx + fw - 4, fy + 18, fy + 31, P.chrome[1]);
      T.rect(fx + fw - 7, fy + 16, 5, 2, P.chrome[4]);
      T.rect(fx + 11, fy + 5, 14, 2, P.chrome[3]); T.hline(fx + 11, fx + 24, fy + 5, P.chrome[5]);
      for (let x = fx + 12; x < fx + 24; x += 3) T.px(x, fy + 6, P.chrome[1]);
    }, { box: [fx - 1, fy - 1, c.btr[0] - fx + 3, fh + 3] });
    // magnets and papers
    const mx = fx + 6, my = fy + 14;
    s.rect(mx, my + 2, 11, 13, P.paper[5]); s.vline(mx + 10, my + 3, my + 14, P.paper[3]); s.hline(mx + 1, mx + 10, my + 14, P.paper[3]);
    for (let k = 0; k < 4; k++) { const lw = [7, 8, 5, 6][k]; s.hline(mx + 2, mx + 1 + lw, my + 6 + k * 2, P.plaid_b[3]); }
    s.px(mx + 7, my + 13, P.red[3]); s.px(mx + 8, my + 13, P.red[3]);
    shadeRect(s, mx + 11, my + 3, 1, 13, -1); shadeRect(s, mx + 1, my + 15, 11, 1, -1);
    // the lobster: claws up, red shell
    const lx = mx + 3, ly = my - 1;
    for (const [dx, dy, c2] of [[0, 0, 4], [4, 0, 4], [0, 1, 3], [1, 1, 3], [3, 1, 3], [4, 1, 3], [1, 2, 3], [2, 2, 4], [3, 2, 3], [1, 3, 2], [2, 3, 3], [3, 3, 2], [2, 4, 2], [1, 5, 2], [2, 5, 1], [3, 5, 2]]) s.px(lx + dx, ly + dy, P.red[c2]);
    s.px(lx + 2, ly + 1, P.ink[2]);
    // a coupon under a daisy magnet, a green apple, a school picture
    s.rect(fx + 17, fy + 38, 9, 6, P.paper[4]); s.hline(fx + 17, fx + 25, fy + 43, P.paper[2]);
    for (let x = fx + 17; x < fx + 26; x += 2) s.px(x, fy + 38, P.paper[2]);
    s.px(fx + 21, fy + 37, P.white_cloth[5]); s.px(fx + 20, fy + 38, P.white_cloth[5]); s.px(fx + 22, fy + 38, P.white_cloth[5]); s.px(fx + 21, fy + 39, P.white_cloth[5]); s.px(fx + 21, fy + 38, P.yellow[3]);
    s.circle(fx + 8.5, fy + 40.5, 1.6, P.grass[4]); s.px(fx + 8, fy + 39, P.grass[5]); s.px(fx + 9, fy + 38, P.wood[2]);
    s.rect(fx + 15, fy + 9, 5, 6, P.white_cloth[5]); s.rect(fx + 16, fy + 10, 3, 4, P.sky_day[2]); s.rect(fx + 17, fy + 11, 1, 3, P.maroon[3]); s.px(fx + 17, fy + 11, P.skin_peach[3]); s.px(fx + 17, fy + 10, P.hair_brown[2]);
    // contact shadow
    shadePoly(s, [[c.fbl[0], c.fbl[1]], [c.bbr[0] + 3, c.bbr[1]], [c.fbr[0] + 9, c.fbr[1] + 3], [c.fbl[0] + 2, c.fbl[1] + 3]], -1);
  }

  /* base cabinets, counter, sink and what's on the counter */
  function counters(s, rm, t) {
    const F = rm.by1;
    const bc = box(s, rm, { x0: 90, x1: 230, y0: 70, y1: F, d0: 0, d1: 25 }, P.mint, { base: 3 });
    const [x, y, w, h] = bc.front;
    // formica top with a chrome edge
    s.poly(bc.faces.top, P.enamel[4]);
    s.rect(x, y, w, 2, P.chrome[3]); s.hline(x, x + w - 1, y, P.chrome[5]); s.hline(x, x + w - 1, y + 1, P.chrome[2]);
    // toe kick
    s.rect(x, y + h - 3, w, 3, P.ink[2]); s.hline(x, x + w - 1, y + h - 3, P.mint[1]);
    // drawers and doors
    const n = 6, dw = (w - 2) / n;
    for (let k = 0; k < n; k++) {
      const x0 = rnd(x + 1 + k * dw), x1 = rnd(x + 1 + (k + 1) * dw) - 1;
      panel(s, x0, y + 3, x1 - x0, 6, P.mint);
      const hx = rnd((x0 + x1) / 2) - 2;
      s.rect(hx, y + 5, 4, 2, P.chrome[3]); s.hline(hx, hx + 3, y + 5, P.chrome[5]);
      panel(s, x0, y + 10, x1 - x0, h - 14, P.mint);
      const kx = k % 2 ? x0 + 2 : x1 - 3;
      s.rect(kx, y + 13, 2, 2, P.red[3]); s.px(kx, y + 13, P.red[5]);
    }
    // the sink basin and faucet
    const sa = rm.pr(150, 70, 3), sb = rm.pr(182, 70, 3), sc2 = rm.pr(182, 70, 21), sd = rm.pr(150, 70, 21);
    s.poly([sa, sb, sc2, sd], P.enamel[2]);
    s.hline(sd[0], sc2[0] - 1, sd[1] - 1, P.enamel[1]);
    s.rect(164, 63, 3, 7, P.chrome[3]); s.vline(164, 63, 69, P.chrome[5]);
    s.rect(165, 61, 7, 2, P.chrome[4]); s.hline(165, 171, 61, P.chrome[5]); s.px(171, 63, P.chrome[2]);
    s.rect(159, 66, 3, 2, P.chrome[4]); s.rect(169, 66, 3, 2, P.chrome[4]);
    // dish soap, a sponge, a drying rack with a cup
    s.rect(185, 62, 3, 8, P.grass[3]); s.vline(185, 62, 69, P.grass[5]); s.rect(186, 60, 1, 2, P.white_cloth[4]);
    s.rect(189, 67, 5, 3, P.mustard[4]); s.hline(189, 193, 67, P.mustard[5]);
    // left counter: canisters, the radio
    for (const [cx, ch, cw] of [[93, 12, 7], [101, 10, 6], [108, 8, 5]]) {
      s.rect(cx, 70 - ch, cw, ch, P.white_cloth[4]); s.vline(cx, 70 - ch, 69, P.white_cloth[5]); s.vline(cx + cw - 1, 70 - ch + 1, 69, P.white_cloth[2]);
      s.rect(cx - 1, 70 - ch - 2, cw + 2, 2, P.red[3]); s.hline(cx - 1, cx + cw, 70 - ch - 2, P.red[4]);
      s.px(cx + (cw >> 1), 70 - ch - 3, P.red[2]);
      s.hline(cx + 1, cx + cw - 2, 70 - ch + 3, P.red[3]);
    }
    radio(s, 117, 57);
    // right counter: the toaster
    s.rect(199, 62, 12, 8, P.chrome[3]); s.hline(199, 210, 62, P.chrome[5]); s.vline(199, 62, 69, P.chrome[4]); s.vline(210, 63, 69, P.chrome[1]);
    s.hline(201, 204, 62, P.ink[2]); s.hline(206, 209, 62, P.ink[2]); s.hline(200, 209, 66, P.chrome[5]);
    s.rect(211, 65, 1, 2, P.ink[3]);
    s.rect(216, 64, 6, 6, P.white_cloth[4]); s.vline(216, 64, 69, P.white_cloth[5]); s.vline(221, 65, 69, P.white_cloth[2]); s.hline(216, 221, 64, P.white_cloth[5]); s.rect(222, 65, 2, 3, P.white_cloth[3]);
    s.px(218, 66, P.red[3]); s.px(219, 67, P.red[3]);
    // contact shadow on the floor
    shadePoly(s, [[x, y + h], [x + w, y + h], [x + w + 2, y + h + 3], [x + 1, y + h + 3]], -1);
  }

  /* a raised panel (cabinet door / drawer front) */
  function panel(s, x, y, w, h, r) {
    s.rect(x, y, w, h, r[3]);
    s.hline(x, x + w - 1, y, r[4]); s.vline(x, y, y + h - 1, r[4]);
    s.hline(x, x + w - 1, y + h - 1, r[1]); s.vline(x + w - 1, y, y + h - 1, r[1]);
    if (w > 6 && h > 6) {
      s.hline(x + 2, x + w - 3, y + 2, r[2]); s.vline(x + 2, y + 2, y + h - 3, r[2]);
      s.hline(x + 3, x + w - 3, y + h - 3, r[4]); s.vline(x + w - 3, y + 3, y + h - 3, r[4]);
    }
  }
  function cabinetDoors(s, fr, n, r) {
    const [x, y, w, h] = fr, dw = w / n;
    for (let k = 0; k < n; k++) {
      const x0 = rnd(x + k * dw), x1 = rnd(x + (k + 1) * dw) - 1;
      panel(s, x0, y, x1 - x0 + 1, h, r);
      const kx = k % 2 ? x0 + 2 : x1 - 2;
      s.rect(kx, y + h - 6, 2, 2, P.red[3]); s.px(kx, y + h - 6, P.red[5]);
    }
  }

  /* 1950s tabletop radio: cream plastic, a gold dial, a speaker grille */
  function radio(s, x, y) {
    obj(s, (T) => {
      rrect(T, x, y, 18, 13, 3, (xx, yy, lx, ly) => P.cream[ly < 2 ? 5 : lx > 15 ? 3 : 4], { noBottom: true });
      T.rect(x + 2, y + 3, 7, 7, P.bakelite[2]);
      for (let yy = y + 4; yy < y + 10; yy += 2) T.hline(x + 2, x + 8, yy, P.bakelite[1]);
      T.rect(x + 10, y + 3, 6, 4, P.brass[4]); T.hline(x + 10, x + 15, y + 3, P.brass[5]);
      T.vline(x + 13, y + 3, y + 6, P.red[3]);
      T.rect(x + 10, y + 9, 2, 2, P.bakelite[2]); T.rect(x + 14, y + 9, 2, 2, P.bakelite[2]);
    }, { box: [x, y, 18, 13] });
    s.hline(x + 1, x + 18, y + 13, P.enamel[2]);
  }

  /* the range, and its hood with a little light underneath */
  function stove(s, rm, t) {
    const F = rm.by1;
    s.rect(230, 58, 34, 12, P.enamel[4]); s.hline(230, 263, 58, P.enamel[5]); s.vline(263, 59, 69, P.enamel[2]);
    s.rect(243, 60, 8, 6, P.ink[3]); s.rect(244, 61, 6, 4, P.white_cloth[4]); s.px(246, 62, P.ink[2]); s.px(247, 63, P.ink[2]);
    for (const kx of [233, 238, 254, 259]) { s.rect(kx, 62, 3, 3, P.ink[3]); s.px(kx, 62, P.metal[4]); }
    const st = box(s, rm, { x0: 230, x1: 264, y0: 70, y1: F, d0: 0, d1: 26 }, P.enamel, { base: 4, top: 4, side: 3 });
    const [x, y, w, h] = st.front;
    for (const [bx, bd] of [[239, 7], [255, 7], [239, 19], [255, 19]]) {
      const p0 = rm.p(bx, 70, bd), k = rm.S(bd);
      s.ellipse(p0[0], p0[1], 4 * k, 1.3 * k, P.ink[2]);
      s.ellipse(p0[0], p0[1], 2.4 * k, 0.6 * k, P.metal[1]);
    }
    s.rect(x, y, w, 2, P.chrome[3]); s.hline(x, x + w - 1, y, P.chrome[5]);
    s.rect(x + 3, y + 5, w - 6, h - 12, P.enamel[3]); s.hline(x + 3, x + w - 4, y + 5, P.enamel[5]); s.vline(x + w - 4, y + 6, y + h - 8, P.enamel[2]);
    s.rect(x + 7, y + 11, w - 14, 9, P.ink[2]); s.hline(x + 8, x + w - 9, y + 12, P.ink[4]);
    s.rect(x + 4, y + 7, w - 8, 2, P.chrome[4]); s.hline(x + 4, x + w - 5, y + 8, P.chrome[1]);
    // a striped towel over the oven handle
    for (let yy = y + 8; yy < y + 20; yy++) for (let xx = x + 8; xx < x + 15; xx++) s.px(xx, yy, ((yy - y) % 4 === 1) ? P.red[3] : P.white_cloth[xx === x + 14 || yy === y + 19 ? 2 : 4]);
    s.rect(x, y + h - 3, w, 3, P.ink[2]);
    // the red kettle on a back burner
    const kp = rm.pr(255, 70, 9);
    obj(s, (T) => {
      T.ellipse(kp[0], kp[1] - 4, 5, 4.5, (xx, yy, nx, ny) => P.red[nx < -0.35 || ny < -0.6 ? 4 : nx > 0.45 ? 2 : 3]);
      T.rect(kp[0] - 5, kp[1] - 1, 11, 2, P.red[2]);
      T.line(kp[0] + 4, kp[1] - 4, kp[0] + 8, kp[1] - 8, P.red[3]); T.px(kp[0] + 8, kp[1] - 9, P.red[3]);
      T.px(kp[0] - 2, kp[1] - 6, P.red[5]); T.px(kp[0] - 1, kp[1] - 7, P.red[5]);
    }, { box: [kp[0] - 6, kp[1] - 10, 16, 12] });
    s.path([[kp[0] - 3, kp[1] - 8], [kp[0] - 2, kp[1] - 11], [kp[0] + 2, kp[1] - 11], [kp[0] + 3, kp[1] - 8]], P.ink[2]);
    // hood
    const hd = box(s, rm, { x0: 229, x1: 265, y0: 30, y1: 37, d0: 0, d1: 17 }, P.enamel, { base: 4, bottom: 2, side: 3 });
    s.hline(hd.front[0], hd.front[0] + hd.front[2] - 1, hd.front[1], P.enamel[5]);
    s.hline(hd.front[0], hd.front[0] + hd.front[2] - 1, hd.front[1] + hd.front[3] - 1, P.chrome[2]);
    s.hline(hd.front[0], hd.front[0] + hd.front[2] - 1, hd.front[1] + hd.front[3] - 2, P.chrome[4]);
    for (let vx = hd.front[0] + 4; vx < hd.front[0] + hd.front[2] - 4; vx += 3) s.vline(vx, hd.front[1] + 2, hd.front[1] + 4, P.enamel[2]);
    const on = t !== 'morning', bf = hd.faces.bottom;
    if (bf) {
      const mx = rnd((bf[0][0] + bf[1][0]) / 2), my = rnd((bf[0][1] + bf[3][1]) / 2);
      s.rect(mx - 6, my, 12, 2, on ? E(P.lamp[5]) : P.enamel[1]); if (on) s.hline(mx - 6, mx + 5, my + 1, E(P.lamp[4]));
    }
    shadePoly(s, [[x, y + h], [x + w, y + h], [x + w + 2, y + h + 3], [x + 1, y + h + 3]], -1);
  }

  /* a braided rag rug, an oval in rings */
  function ragRug(s, rm, cx, cd, rx, rd) {
    const rings = [P.plaid_b[3], P.cream[4], P.lino_r[3], P.plaid_b[4], P.cream[3], P.sage[3], P.lino_r[4]];
    s.poly(rm.fq(cx - rx - 1, cx + rx + 1, cd - rd - 1, cd + rd + 1), (x, y) => {
      const q = rm.onFloor(x, y), xw = q[0], d = q[1], nx = (xw - cx) / rx, ny = (d - cd) / rd, r = Math.sqrt(nx * nx + ny * ny);
      if (r > 1) return 0;
      const k = Math.min(rings.length - 1, flo((1 - r) * rings.length * 0.999));
      const a = Math.atan2(ny, nx), braid = (flo(a * 9 + k * 1.7) & 1);
      return SH(rings[k], braid ? 0 : -1 + (r > 0.92 ? -1 : 0) + (ny < -0.3 ? 0 : 0));
    });
  }

  /* the doorway to the hall on the left wall */
  function doorway(s, rm) {
    const F = rm.by1, bx0 = rm.bx0;
    s.poly(rm.lq(3, 37, F - 87, F), P.trim[3]);
    const dq = rm.lq(6, 34, F - 84, F);
    s.poly(dq, (x, y) => (y > dq[2][1] - 14 + (x - dq[2][0]) * 0.3 ? P.wood_dark[2] : P.wall_green[1]));
    // the stair newel and banister in the hall beyond
    const np = rm.pr(bx0, F, 22);
    s.rect(np[0] - 1, np[1] - 36, 3, 34, P.wood_dark[3]); s.vline(np[0] - 1, np[1] - 36, np[1] - 3, P.wood_dark[4]);
    s.rect(np[0] - 2, np[1] - 38, 5, 2, P.wood_dark[4]);
    s.line(np[0] + 1, np[1] - 37, dq[0][0], dq[0][1] + 18, P.wood_dark[3]);
    // casing edges
    const e0 = rm.pr(bx0, F - 87, 37), e1 = rm.pr(bx0, F, 37); s.line(e0[0], e0[1], e1[0], e1[1], P.trim[4]);
    const e2 = rm.pr(bx0, F - 87, 3), e3 = rm.pr(bx0, F, 3); s.line(e2[0], e2[1], e3[0], e3[1], P.trim[2]);
    const sw = rm.pr(bx0, F - 50, 42);
    s.rect(sw[0], sw[1], 3, 5, P.trim[4]); s.px(sw[0] + 1, sw[1] + 2, P.trim[1]); s.vline(sw[0] + 3, sw[1] + 1, sw[1] + 5, P.k_paper[2]);
  }

  /* avocado wall phone with a long curly cord looping to the floor */
  function phone(s, rm) {
    const a = rm.pr(rm.bx0, 52, 54);
    const x = a[0] - 3, y = a[1];
    obj(s, (T) => {
      T.rect(x, y, 7, 12, P.avocado[3]); T.vline(x, y, y + 11, P.avocado[4]); T.hline(x, x + 6, y, P.avocado[4]); T.vline(x + 6, y + 1, y + 11, P.avocado[2]);
      T.circle(x + 3.5, y + 8, 2.4, P.avocado[2]); T.px(x + 3, y + 8, P.cream[4]); T.px(x + 2, y + 7, P.avocado[4]); T.px(x + 4, y + 6, P.avocado[4]);
      // the handset hanging on the left side
      T.rect(x - 3, y - 1, 3, 14, P.avocado[3]); T.vline(x - 3, y, y + 12, P.avocado[5]); T.vline(x - 1, y, y + 12, P.avocado[2]);
      T.rect(x - 4, y - 2, 3, 3, P.avocado[3]); T.rect(x - 4, y + 11, 3, 3, P.avocado[3]); T.px(x - 4, y - 2, P.avocado[4]);
    }, { box: [x - 5, y - 3, 14, 18] });
    wallShadow(s, x - 4, y - 2, 11, 16);
    // the cord: a long loop down the wall and onto the floor
    const f = rm.pr(rm.bx0, rm.by1, 62);
    cord(s, [[x - 3, y + 14], [x - 3, y + 26], [x - 1, y + 40], [f[0] + 4, f[1] - 2], [f[0] + 10, f[1] + 3], [f[0] + 17, f[1] + 3], [f[0] + 19, f[1] - 3], [x + 9, y + 30], [x + 4, y + 13]], P.avocado);
  }

  /* the back door on the right wall, half glass, a gingham café curtain */
  function backDoor(s, rm, t) {
    const F = rm.by1, night = t === 'night', eve = t === 'evening';
    s.poly(rm.rq(14, 54, F - 86, F), P.trim[3]);
    s.poly(rm.rq(17, 51, F - 83, F), P.mint[3]);
    s.poly(rm.rq(17, 19, F - 83, F), P.mint[4]);
    s.poly(rm.rq(21, 47, F - 34, F - 8), P.mint[2]); s.poly(rm.rq(21, 47, F - 34, F - 33), P.mint[1]);
    s.poly(rm.rq(21, 47, F - 79, F - 43), (x, y) => E(night ? P.sky_night[2] : eve ? P.sky_dusk[3] : P.sky_day[4]));
    s.poly(rm.rq(21, 47, F - 62, F - 60), P.trim[3]);
    s.poly(rm.rq(33, 35, F - 79, F - 43), P.trim[3]);
    s.poly(rm.rq(21, 47, F - 59, F - 43), (x, y) => { const g = gingham(x, y); return g === 0 ? P.white_cloth[3] : g === 1 ? P.red[3] : P.red[1]; });
    s.poly(rm.rq(21, 47, F - 60, F - 59), P.chrome[3]);
    const k = rm.pr(rm.bx1, F - 44, 46);
    s.rect(k[0], k[1], 2, 2, P.brass[4]); s.px(k[0] + 1, k[1] + 1, P.brass[2]);
    const e0 = rm.pr(rm.bx1, F - 86, 14), e1 = rm.pr(rm.bx1, F, 14); s.line(e0[0], e0[1], e1[0], e1[1], P.trim[2]);
    const e2 = rm.pr(rm.bx1, F - 86, 54), e3 = rm.pr(rm.bx1, F, 54); s.line(e2[0], e2[1], e3[0], e3[1], P.trim[4]);
    // a doormat
    s.poly(rm.fq(rm.bx1 - 14, rm.bx1, 18, 50), (x, y) => (((x + y) & 3) === 0 ? P.cardboard[2] : P.cardboard[3]));
  }

  /* a straw broom leaning in the corner by the stove */
  function broom(s, rm) {
    const a = rm.pr(rm.bx1, 34, 6), b = rm.pr(rm.bx1 - 4, rm.by1 - 14, 8);
    s.line(a[0], a[1], b[0], b[1], P.wood_pale[3]); s.line(a[0] + 1, a[1], b[0] + 1, b[1], P.wood_pale[1]);
    s.poly([[b[0] - 3, b[1]], [b[0] + 4, b[1]], [b[0] + 7, b[1] + 14], [b[0] - 5, b[1] + 14]], P.mustard[3]);
    for (let k = -4; k < 7; k += 2) s.line(b[0], b[1] + 2, b[0] + k, b[1] + 13, P.mustard[2]);
    s.hline(b[0] - 3, b[0] + 4, b[1] + 3, P.red[3]); s.hline(b[0] - 4, b[0] + 5, b[1] + 6, P.red[3]);
    s.hline(b[0] - 4, b[0] + 6, b[1] + 14, P.mustard[4]);
  }

  /* chrome dinette, plaid tablecloth: the top stays clear for the story's plates */
  function table(s, rm) {
    const F = rm.by1, ty = 78;
    const b = { x0: 204, x1: 270, y0: ty, y1: ty + 12, d0: 60, d1: 104 };
    // floor shadow under the table
    shadePoly(s, rm.fq(201, 274, 58, 108), -1, 0.5);
    shadePoly(s, rm.fq(206, 270, 64, 102), -1);
    const c = box(s, rm, b, null);
    const plaid = (xw, d) => {
      const u = ((flo(xw - 204) % 16) + 16) % 16, v = ((flo(d) % 16) + 16) % 16;
      const k = (u < 3 ? 2 : u === 8 ? 1 : 0) + (v < 3 ? 2 : v === 8 ? 1 : 0);
      return k >= 3 ? P.plaid_b[1] : k === 2 ? P.plaid_b[2] : k === 1 ? P.plaid_b[4] : P.white_cloth[4];
    };
    // side drop toward the room
    if (c.faces.left) s.poly([c.btl, c.ftl, [c.ftl[0], c.fbl[1] + 2], [c.btl[0], c.bbl[1] + 1]], (x, y) => SH(plaid(204, rm.onLeft(x, y, 204)[0]), -1));
    s.poly(c.faces.top, (x, y) => { const q = rm.onFloor(x, y, ty), xw = q[0], d = q[1]; return plaid(xw, d); });
    const [fx, fy, fw, fh] = c.front;
    for (let yy = fy; yy < fy + fh + 2; yy++) for (let xx = fx; xx < Math.min(320, fx + fw); xx++) {
      const xw = rm.vx + (xx + 0.5 - rm.vx) / rm.S(104);
      let col = plaid(xw, 104 + (yy - fy) * 0.55);
      col = SH(col, fold(xx - fx, 10, 3) < 0 ? -1 : 0);
      if (yy >= fy + fh) col = SH(col, -1);
      s.px(xx, yy, col);
    }
    s.hline(fx, Math.min(319, fx + fw - 1), fy, P.white_cloth[5]);
    // the near chair, back to us, pushed in at the corner
    const ch0 = rm.pr(196, 70, 114), ch1 = rm.pr(214, 70, 114);
    const cw = ch1[0] - ch0[0];
    obj(s, (T) => {
      rrect(T, ch0[0], ch0[1], cw, 13, 4, (xx, yy, lx, ly) => P.red[ly < 2 ? 4 : lx > cw - 4 ? 2 : ly > 10 ? 2 : 3]);
      T.hline(ch0[0] + 4, ch0[0] + cw - 6, ch0[1] + 2, P.red[5]);
      for (let k = 0; k < 4; k++) T.hline(ch0[0] + 3, ch0[0] + cw - 4, ch0[1] + 5 + k * 2, P.red[k % 2 ? 3 : 2]);
      T.rect(ch0[0] + 2, ch0[1] + 13, 3, 30, P.chrome[3]); T.vline(ch0[0] + 2, ch0[1] + 13, ch0[1] + 42, P.chrome[5]);
      T.rect(ch0[0] + cw - 5, ch0[1] + 13, 3, 30, P.chrome[2]); T.vline(ch0[0] + cw - 3, ch0[1] + 13, ch0[1] + 42, P.chrome[1]);
      T.rect(ch0[0] - 1, ch0[1] + 30, cw + 2, 4, P.red[2]); T.hline(ch0[0] - 1, ch0[0] + cw, ch0[1] + 30, P.red[4]);
    }, { box: [ch0[0] - 2, ch0[1] - 1, cw + 4, 46] });
  }

  /* the milk-glass pendant over the table */
  function pendant(s, rm, on) {
    const p = rm.pr(230, 30, 84);
    s.vline(p[0], 0, p[1] - 6, P.ink[3]);
    s.rect(p[0] - 1, p[1] - 7, 3, 2, P.brass[3]);
    obj(s, (T) => {
      T.ellipse(p[0] + 0.5, p[1] + 1, 7.5, 7, (x, y, nx, ny) => {
        if (ny < -0.05 && y < p[1] - 4 + Math.abs(nx) * 3) return 0;
        if (ny > 0.55) return 0;
        const sh = ny > 0.35 ? (on ? 5 : 3) : nx < -0.4 ? 5 : nx > 0.5 ? 3 : 4;
        return on ? E(P.lamp[Math.min(5, sh)]) : P.white_cloth[sh];
      });
    }, { outline: !on, box: [p[0] - 9, p[1] - 8, 19, 15] });
    if (on) s.hline(p[0] - 5, p[0] + 6, p[1] + 5, E(P.lamp[5]));
    else s.hline(p[0] - 5, p[0] + 6, p[1] + 5, P.white_cloth[2]);
  }

  /* ================================================================== */
  /* LIVING ROOM — Mémère's front room                                   */
  /* ================================================================== */
  const ROSE = [
    '...........s',
    '....o......s',
    '...oco.....s',
    '....o......s',
    '...g.......s',
    '...........s',
    '...........s',
    '...........s',
    '..........os',
    '.........ocs',
    '..........os',
    '.........g.s',
    '...........s',
    '...........s'
  ];
  R('drape', ['#1c2621', '#2c3d33', '#3e5646', '#53705a', '#6d8b6f', '#90aa8c']);       // green velvet drapes
  R('chintz', ['#3d2a2c', '#6e4c4b', '#a37a72', '#c9a593', '#e4cdb6', '#f5e9d6']);       // couch ground
  R('rosebud', ['#3e1222', '#6c1f34', '#9c3246', '#c4505a', '#df7a78', '#f2a7a0']);
  R('velvet', ['#241a2c', '#3e2c47', '#5c4466', '#7d5f86', '#9f80a6', '#c4a7c6']);       // the armchair (mauve)
  R('fringe', ['#4a2b1c', '#7a4a2a', '#a8703c', '#cf9a56', '#e8c27e', '#f6e2b2']);      // the lamp shade
  R('oak', ['#2a1a18', '#4a2f24', '#6c4630', '#8c5f3d', '#aa7a4e', '#c49866']);

  PX.bg('living', {
    times: ['evening', 'night'],
    draw(s, o) { living(s, o); }
  });

  function living(s, o) {
    const t = o.time, night = t === 'night';
    const rm = Room({ vx: 160, vy: 48, bx0: 44, by0: 8, bx1: 276, by1: 104, z0: 220 });
    const { by0, by1, bx0, bx1 } = rm, WR = P.wall_rose;
    const rail = 74;   // chair rail height (world y)

    /* ---- shell ---- */
    s.poly(rm.ceil, (x, y) => { const d = rm.onCeil(x, y)[1]; return P.ceil[d > 26 ? 2 : 3]; });
    const paper = motif(ROSE, { '.': WR[4], s: WR[3], o: WR[5], c: P.rosebud[4], g: P.drape[4] });
    s.poly([[bx0, by0], [bx1, by0], [bx1, rail], [bx0, rail]], (x, y) => paper(x - bx0, y));
    s.poly(rm.lq(0, rm.far, by0, rail), (x, y) => { const q = rm.onLeft(x, y), d = q[0], yw = q[1]; return SH(paper(d * 0.9, yw), -1); });
    s.poly(rm.rq(0, rm.far, by0, rail), (x, y) => { const q = rm.onRight(x, y), d = q[0], yw = q[1]; return SH(paper(-d * 0.9, yw), -1); });
    // stained wainscot below the chair rail
    const wains = (u, yw, side) => {
      const k = ((flo(u) % 22) + 22) % 22, r = yw - rail;
      if (r < 3) return r === 0 ? P.wood[4] : r === 1 ? P.wood[3] : P.wood[1];
      if (yw > by1 - 5) return yw === by1 - 5 ? P.wood[3] : P.wood[2];
      if (k < 2) return P.wood[2];
      if (k === 2 || r === 6) return P.wood[1];
      if (k === 21 || yw === by1 - 9) return P.wood[3];
      return P.wood[2 + side];
    };
    s.poly([[bx0, rail], [bx1, rail], [bx1, by1], [bx0, by1]], (x, y) => wains(x - bx0, y, 0));
    s.poly(rm.lq(0, rm.far, rail, by1), (x, y) => { const q = rm.onLeft(x, y), d = q[0], yw = q[1]; return SH(wains(d, yw, 0), -1); });
    s.poly(rm.rq(0, rm.far, rail, by1), (x, y) => { const q = rm.onRight(x, y), d = q[0], yw = q[1]; return SH(wains(-d, yw, 0), -1); });
    // picture rail
    s.hline(bx0, bx1 - 1, by0 + 5, P.wood[3]); s.hline(bx0, bx1 - 1, by0 + 6, P.wood[1]);
    s.poly(rm.lq(0, rm.far, by0 + 5, by0 + 7), P.wood[2]); s.poly(rm.rq(0, rm.far, by0 + 5, by0 + 7), P.wood[2]);
    // floor
    plankFloor(s, rm, P.oak, { pw: 8, base: 3, seed: 'living-floor' });
    band(s, rm.back, (x, y) => (by0 + 14 - y) / 7, 0.5);
    band(s, rm.left, (x, y) => { const q = rm.onLeft(x, y), d = q[0], yw = q[1]; return (by0 + 14 - yw) / 7; }, 0.5);
    band(s, rm.right, (x, y) => { const q = rm.onRight(x, y), d = q[0], yw = q[1]; return (by0 + 14 - yw) / 7; }, 0.5);
    band(s, rm.floor, (x, y) => { const q = rm.onFloor(x, y), xw = q[0], d = q[1]; return Math.max((10 - d) / 7, (xw - bx1 + 12) / 9, (bx0 + 12 - xw) / 9, (d - 60) / 30); }, 0.3);
    braidedRug(s, rm, 160, 52, 64, 25);

    /* ---- back wall ---- */
    frontWindow(s, rm, t);
    photoWall(s, 66, 24);
    cuckoo(s, 128, 22);
    couch(s, rm);
    coffeeTable(s, rm);
    armchair(s, rm, t);
    floorLamp(s, rm, t);
    consoleTV(s, rm, t);
    curio(s, rm);
    hallDoor(s, rm);

    /* ---- light ---- */
    if (!night) {
      // the fringed lamp, the TV, dusk at the window
      s.light('warm', 247, 52, 110, 76, 1.0, { core: 0.25 });
      s.light('warm', 236, 106, 70, 22, 0.55);
      s.light('warm', 120, 70, 120, 70, 0.32);
      s.light('cool', 258, 82, 40, 30, 0.55);
    } else {
      // the streetlight through the open curtains: a long stripe across the floor
      const a = rm.pr(150, by1, 10), b = rm.pr(176, by1, 10), c = rm.pr(232, by1, 140), d = rm.pr(186, by1, 140);
      s.lightPoly('warm', [a, b, c, d], 0.75, { fade: { x0: a[0], y0: a[1], x1: (c[0] + d[0]) / 2, y1: 190 } });
      s.lightPoly('warm', [[150, 24], [176, 24], [b[0], b[1]], [a[0], a[1]]], 0.25);
      s.light('cool', 166, 50, 70, 50, 0.35);
    }
  }

  /* the front window: heavy green drapes, lace, the radiator below */
  function frontWindow(s, rm, t) {
    const x = 136, y = 22, w = 60, h = 58, night = t === 'night';
    // casing
    s.rect(x - 4, y - 4, w + 8, h + 6, P.wood[3]); s.hline(x - 4, x + w + 3, y - 4, P.wood[4]); s.vline(x - 4, y - 4, y + h + 1, P.wood[4]); s.vline(x + w + 3, y - 3, y + h + 1, P.wood[1]);
    // the view: Larch Street past the porch (emissive)
    const sky = night ? [P.sky_night[1], P.sky_night[2], P.sky_night[3]] : [P.sky_dusk[1], P.sky_dusk[2], P.sky_dusk[3], P.sky_dusk[4]];
    s.vgrad(x, y, w, 34, sky.map(E), 3);
    if (night) { s.px(x + 9, y + 5, E(P.white[4])); s.px(x + 47, y + 3, E(P.cloud[3])); s.px(x + 30, y + 9, E(P.cloud[2])); s.px(x + 52, y + 12, E(P.cloud[2])); }
    // houses across the street
    const far = night ? P.nite : P.violet;
    s.poly([[x, y + 30], [x + 8, y + 22], [x + 20, y + 22], [x + 26, y + 30]], E(far[1]));
    s.rect(x, y + 30, 26, 10, E(far[2]));
    s.poly([[x + 34, y + 28], [x + 44, y + 19], [x + 54, y + 28]], E(far[1]));
    s.rect(x + 34, y + 28, w - 34, 12, E(far[2]));
    // their windows: one lit
    s.rect(x + 6, y + 32, 4, 4, E(night ? P.nite[3] : P.lamp[4])); s.rect(x + 16, y + 32, 4, 4, E(night ? P.lamp[3] : P.lamp[5]));
    s.rect(x + 40, y + 31, 4, 5, E(night ? P.nite[3] : P.violet[3])); s.rect(x + 49, y + 31, 4, 5, E(night ? P.nite[3] : P.lamp[4]));
    // the street, the streetlight and its pool
    s.rect(x, y + 40, w, 4, E(night ? P.nite[1] : P.violet[1]));
    s.rect(x, y + 44, w, h - 44, E(night ? P.nite[2] : P.violet[2]));
    s.vline(x + 28, y + 14, y + 42, E(night ? P.nite[0] : P.violet[0])); s.hline(x + 28, x + 34, y + 14, E(night ? P.nite[0] : P.violet[0]));
    s.rect(x + 32, y + 15, 4, 2, E(P.lamp[5]));
    s.ellipse(x + 34, y + 44, 11, 2.5, E(night ? P.nite[4] : P.violet[3]));
    s.ellipse(x + 34, y + 44, 6, 1.5, E(night ? P.lamp[2] : P.lamp[3]));
    // the porch outside: rail and posts close against the glass
    const pc = night ? P.nite[3] : P.violet[3];
    s.rect(x, y + 46, w, 2, E(pc)); for (let k = x + 2; k < x + w; k += 4) s.vline(k, y + 48, y + h - 1, E(pc));
    s.rect(x + 14, y, 3, h, E(night ? P.nite[3] : P.violet[3])); s.vline(x + 14, y, y + h - 1, E(night ? P.nite[4] : P.violet[4]));
    // sashes
    s.rect(x, y, w, 2, P.wood[4]); s.rect(x, y + h - 2, w, 2, P.wood[3]); s.rect(x, y, 2, h, P.wood[4]); s.rect(x + w - 2, y, 2, h, P.wood[2]);
    s.rect(x, y + 27, w, 3, P.wood[4]); s.hline(x, x + w - 1, y + 29, P.wood[1]);
    s.vline(x + 29, y, y + h - 1, P.wood[3]); s.vline(x + 30, y, y + h - 1, P.wood[4]);
    // lace: drawn shut in the evening (open diamonds show the dusk), pulled aside at night
    const lace = (xx, yy) => {
      const row = flo((yy - y) / 10), u = (((xx - x + (row & 1) * 5) % 10) + 10) % 10, v = (((yy - y) % 10) + 10) % 10;
      const m = Math.abs(u - 5) + Math.abs(v - 5), r2 = (u - 5) * (u - 5) + (v - 5) * (v - 5);
      if (r2 <= 1) return 0;
      if (r2 >= 7 && r2 <= 10) return 2;
      if (m === 5 && (u === 5 || v === 5)) return 2;
      return 1;
    };
    const lacePx = (xx, yy, k, f) => night ? E(k === 2 ? P.white_cloth[1] : P.white_cloth[2]) : cl(P.white_cloth, (k === 2 ? 2 : 3) + f);
    if (!night) {
      for (let yy = y + 2; yy < y + h - 2; yy++) for (let xx = x + 2; xx < x + w - 2; xx++) {
        const k = lace(xx, yy); if (!k) continue;
        s.px(xx, yy, lacePx(xx, yy, k, fold(xx - x, 6, 2) < 0 ? -1 : 0));
      }
      for (let xx = x + 2; xx < x + w - 2; xx++) { const sc = (((xx - x) % 8) + 8) % 8; s.px(xx, y + h - 3, sc === 3 || sc === 4 ? P.white_cloth[3] : 0 || P.white_cloth[4]); }
    } else {
      for (const side of [-1, 1]) for (let yy = y + 2; yy < y + h - 2; yy++) {
        const wd = 7 + rnd(Math.sin((yy - y) / h * Math.PI) * 2);
        for (let k = 0; k < wd; k++) {
          const xx = side < 0 ? x + 2 + k : x + w - 3 - k, l = lace(xx, yy);
          if (k === wd - 1) s.px(xx, yy, E(P.white_cloth[1]));
          else if (l) s.px(xx, yy, lacePx(xx, yy, l, 0));
        }
      }
    }
    // heavy drapes and a pelmet
    for (const side of [-1, 1]) {
      for (let yy = y - 2; yy < y + h + 10; yy++) {
        const wd = 11 + (yy > y + h - 6 ? 1 : 0);
        for (let k = 0; k < wd; k++) {
          const xx = side < 0 ? x - 8 + k : x + w + 7 - k;
          const f = fold(k, 5, side < 0 ? 0 : 2);
          s.px(xx, yy, k === wd - 1 ? P.drape[1] : cl(P.drape, 3 + f));
        }
      }
      const tb = side < 0 ? x - 8 : x + w - 3;
      s.rect(tb, y + 32, 11, 2, P.brass[3]); s.hline(tb, tb + 10, y + 32, P.brass[5]);
    }
    s.rect(x - 9, y - 7, w + 18, 7, P.drape[3]); s.hline(x - 9, x + w + 8, y - 7, P.drape[4]);
    for (let xx = x - 9; xx < x + w + 9; xx++) { const sc = (((xx - x) % 10) + 10) % 10; const dy = sc < 5 ? 0 : 1; s.px(xx, y + dy, P.drape[1]); if (dy) s.px(xx, y, P.drape[2]); }
    for (let xx = x - 7; xx < x + w + 8; xx += 5) s.px(xx, y + 2, P.brass[4]);
    // sill and the radiator under it
    s.rect(x - 6, y + h + 2, w + 12, 3, P.wood[4]); s.hline(x - 6, x + w + 5, y + h + 4, P.wood[1]);
    const rx = x + 6, ry = y + h + 7, rw = w - 12, rh = 17;
    obj(s, (T) => {
      for (let k = 0; k < rw; k += 3) {
        T.rect(rx + k, ry + 1, 2, rh - 2, P.chrome[3]); T.vline(rx + k, ry + 1, ry + rh - 2, P.chrome[4]);
        T.px(rx + k, ry, P.chrome[4]); T.px(rx + k + 1, ry, P.chrome[3]);
      }
      T.rect(rx, ry + rh - 2, rw, 2, P.chrome[2]); T.rect(rx, ry + 3, rw, 1, P.chrome[2]);
      T.rect(rx - 2, ry + rh - 1, 2, 3, P.chrome[2]); T.rect(rx + rw, ry + rh - 1, 2, 3, P.chrome[1]);
    }, { box: [rx - 3, ry - 1, rw + 6, rh + 4] });
    shadeRect(s, rx - 1, ry - 1, rw + 3, rh + 2, -1, 0.5);
  }

  /* framed family photos over the couch, the crucifix, and a paler square
   * of wallpaper where one frame used to hang */
  function photoWall(s, x, y) {
    // crucifix
    const cx = x + 30;
    s.rect(cx, y - 14, 2, 12, P.wood_dark[2]); s.vline(cx, y - 14, y - 3, P.wood_dark[4]);
    s.rect(cx - 3, y - 11, 8, 2, P.wood_dark[2]); s.hline(cx - 3, cx + 4, y - 11, P.wood_dark[4]);
    s.hline(cx - 2, cx + 3, y - 10, P.brass[3]); s.vline(cx, y - 9, y - 6, P.brass[4]); s.vline(cx + 1, y - 9, y - 6, P.brass[2]);
    shadeRect(s, cx + 2, y - 13, 1, 12, -1);
    const frame = (fx, fy, fw, fh, kind, fr = P.wood_dark) => {
      s.rect(fx, fy, fw, fh, fr[2]); s.hline(fx, fx + fw - 1, fy, fr[4]); s.vline(fx, fy, fy + fh - 1, fr[4]); s.vline(fx + fw - 1, fy + 1, fy + fh - 1, fr[1]); s.hline(fx + 1, fx + fw - 1, fy + fh - 1, fr[1]);
      const ix = fx + 2, iy = fy + 2, iw = fw - 4, ih = fh - 4;
      if (kind === 'wedding') {
        s.rect(ix, iy, iw, ih, P.paper[3]); s.rect(ix + 1, iy + 1, iw - 2, ih - 2, P.paper[2]);
        s.rect(ix + 2, iy + 3, 3, 3, P.paper[4]); s.rect(ix + 6, iy + 3, 3, 3, P.paper[4]);
        s.rect(ix + 1, iy + 6, 4, ih - 7, P.ink[3]); s.rect(ix + 5, iy + 6, 5, ih - 7, P.paper[5]);
      } else if (kind === 'portrait') {
        s.rect(ix, iy, iw, ih, P.paper[2]);
        s.rect(ix + 2, iy + 2, iw - 4, 4, P.paper[4]); s.rect(ix + 1, iy + 6, iw - 2, ih - 6, P.navy[2]); s.px(ix + iw / 2, iy + 7, P.white[4]);
        s.rect(ix + 2, iy + 1, iw - 4, 1, P.paper[1]);
      } else if (kind === 'school') {
        s.rect(ix, iy, iw, ih, P.sky_day[2]);
        s.rect(ix + 1, iy + 1, iw - 2, 3, P.hair_dark[3]); s.rect(ix + 1, iy + 3, iw - 2, 3, P.skin_fair[4]); s.rect(ix + 1, iy + 3, 1, 3, P.hair_dark[3]); s.rect(ix, iy + 6, iw, ih - 6, P.denim[3]);
      } else if (kind === 'group') {
        s.rect(ix, iy, iw, ih, P.grass[3]); s.rect(ix, iy, iw, 2, P.sky_day[3]);
        for (let k = 0; k < 4; k++) { s.px(ix + 1 + k * 3, iy + 2, P.skin_peach[4]); s.rect(ix + 1 + k * 3, iy + 3, 2, 3, [P.red[3], P.navy[3], P.mustard[4], P.maroon[3]][k]); }
      } else if (kind === 'baby') {
        s.rect(ix, iy, iw, ih, P.pink[4]); s.circle(ix + iw / 2, iy + ih / 2, 2, P.skin_peach[4]);
      }
    };
    // oval wedding portrait
    s.ellipse(x + 8, y + 12, 7, 9, P.brass[2]); s.ellipse(x + 8, y + 12, 6, 8, P.brass[4]); s.ellipse(x + 8, y + 12, 5, 7, P.paper[2]);
    s.ellipse(x + 8, y + 9, 2, 2.5, P.paper[4]); s.rect(x + 5, y + 12, 7, 6, P.paper[3]); s.rect(x + 8, y + 12, 3, 6, P.paper[5]); s.rect(x + 5, y + 12, 3, 6, P.ink[3]);
    shadeEll(s, x + 9, y + 13, 7, 9, -1, 0.4);
    frame(x + 18, y, 10, 13, 'portrait');
    frame(x + 33, y + 1, 10, 12, 'school', P.brass);
    // the empty place: a hook and a square of brighter paper
    for (let yy = y + 17; yy < y + 29; yy++) for (let xx = x + 18; xx < x + 28; xx++) { const v = s.get(xx, yy); if (v) s.px(xx, yy, SH(v, 1)); }
    s.px(x + 22, y + 15, P.metal[3]); s.px(x + 23, y + 15, P.metal[1]);
    frame(x + 31, y + 17, 14, 11, 'group');
    frame(x + 2, y + 24, 9, 9, 'baby', P.white_cloth);
    for (const [fx, fy, fw, fh] of [[x + 18, y, 10, 13], [x + 33, y + 1, 10, 12], [x + 31, y + 17, 14, 11], [x + 2, y + 24, 9, 9]]) wallShadow(s, fx, fy, fw, fh);
  }

  /* the cuckoo clock, stopped at 4:10 */
  function cuckoo(s, x, y) {
    const W = P.wood_dark;
    obj(s, (T) => {
      T.poly([[x - 1, y + 5], [x + 6, y - 1], [x + 13, y + 5]], W[3]);
      T.line(x - 1, y + 5, x + 6, y - 1, W[5]); T.line(x + 6, y - 1, x + 13, y + 5, W[2]);
      T.rect(x, y + 5, 12, 13, W[3]); T.vline(x, y + 5, y + 17, W[4]); T.vline(x + 11, y + 5, y + 17, W[1]);
      T.rect(x + 4, y + 2, 4, 3, W[1]); T.rect(x + 5, y + 3, 2, 2, W[0]);
      T.circle(x + 6, y + 10.5, 3.6, P.cream[5]);
      T.px(x + 6, y + 8, P.ink[2]); T.px(x + 6, y + 9, P.ink[2]); T.px(x + 7, y + 10, P.ink[2]); T.px(x + 4, y + 11, P.ink[2]); T.px(x + 5, y + 11, P.ink[2]);
      T.rect(x + 1, y + 16, 10, 2, W[2]); T.px(x + 3, y + 15, P.grass[4]); T.px(x + 8, y + 15, P.grass[4]);
      for (let k = 0; k < 3; k++) T.px(x + 2 + k * 4, y + 6, P.leaf_gold[4]);
    }, { box: [x - 2, y - 2, 17, 21] });
    // chains, pine-cone weights, the still pendulum
    s.vline(x + 3, y + 18, y + 30, P.brass[3]); s.vline(x + 9, y + 18, y + 26, P.brass[3]);
    s.rect(x + 2, y + 30, 3, 5, P.brass[2]); s.px(x + 2, y + 30, P.brass[4]);
    s.rect(x + 8, y + 26, 3, 5, P.brass[2]); s.px(x + 8, y + 26, P.brass[4]);
    s.vline(x + 6, y + 18, y + 27, W[2]); s.circle(x + 6.5, y + 28.5, 2, P.brass[3]); s.px(x + 6, y + 28, P.brass[5]);
    shadeRect(s, x + 12, y + 6, 1, 13, -1);
  }

  /* the flowered couch in its plastic slipcovers */
  const chintzPx = (x, y, o) => {
    const row = flo(y / 5), u = (((x + (row & 1) * 3) % 6) + 6) % 6, v = ((y % 5) + 5) % 5;
    if (v === 1 && (u === 1 || u === 2)) return cl(P.rosebud, 3 + o + (u === 1 ? 1 : 0));
    if (v === 2 && u === 1) return cl(P.rosebud, 2 + o);
    if (v === 2 && u === 2) return cl(P.drape, 3 + o);
    return cl(P.chintz, 4 + o);
  };
  function couch(s, rm) {
    const F = rm.by1, x0 = 52, x1 = 128;
    shadePoly(s, rm.fq(x0 - 2, x1 + 3, 0, 37), -1);
    obj(s, (T) => {
      // the back panel behind the cushions
      const bk = box(T, rm, { x0, x1, y0: 62, y1: 90, d0: 0, d1: 10 }, null);
      T.poly(bk.faces.front, (x, y) => chintzPx(x, y, -1));
      if (bk.faces.top) T.poly(bk.faces.top, (x, y) => chintzPx(x, y, 0));
      // three back cushions with rounded shoulders
      const cb = box(T, rm, { x0: x0 + 9, x1: x1 - 9, y0: 66, y1: 88, d0: 10, d1: 14 }, null);
      const [cx, cy, cw, ch] = cb.front;
      for (let k = 0; k < 3; k++) {
        const x0k = rnd(cx + cw * k / 3), x1k = rnd(cx + cw * (k + 1) / 3);
        rrect(T, x0k, cy, x1k - x0k, ch, 4, (x, y, lx, ly) => {
          const w = x1k - x0k;
          let o = ly < 2 ? 1 : ly > ch - 4 ? -1 : 0;
          if (lx === 0 || lx === w - 1) o = -1;
          return chintzPx(x, y, o);
        }, { noBottom: true });
        T.hline(x0k + 3, x1k - 4, cy, P.white_cloth[5]);
        T.vline(x1k - 1, cy + 3, cy + ch - 1, P.chintz[1]);
      }
      // seat cushions
      const st = box(T, rm, { x0: x0 + 9, x1: x1 - 9, y0: 86, y1: 94, d0: 14, d1: 34 }, null);
      T.poly(st.faces.top, (x, y) => chintzPx(x, y, 1));
      T.poly(st.faces.front, (x, y) => chintzPx(x, y, 0));
      const [sx, sy, sw, sh] = st.front;
      for (let k = 1; k < 3; k++) {
        const px = rnd(sx + sw * k / 3), bx = rnd(st.btl[0] + (st.btr[0] - st.btl[0]) * k / 3);
        T.line(px, sy, bx, st.btl[1], P.chintz[1]); T.vline(px, sy, sy + sh - 1, P.chintz[1]);
      }
      T.hline(sx, sx + sw - 1, sy, P.white_cloth[5]); T.hline(sx, sx + sw - 1, sy + sh - 1, P.chintz[1]);
      // skirt with box pleats
      const sk = box(T, rm, { x0: x0 + 9, x1: x1 - 9, y0: 94, y1: F - 2, d0: 14, d1: 34 }, null);
      T.poly(sk.faces.front, (x, y) => { const u = ((x - sk.front[0]) % 7 + 7) % 7; return u === 0 ? P.chintz[1] : u === 1 ? P.chintz[4] : chintzPx(x, y, -1); });
      // rolled arms
      for (const [ax0, ax1, side] of [[x0, x0 + 9, -1], [x1 - 9, x1, 1]]) {
        const ar = box(T, rm, { x0: ax0, x1: ax1, y0: 76, y1: F - 2, d0: 2, d1: 36 }, null);
        const sideF = ar.faces.right || ar.faces.left;
        if (sideF) T.poly(sideF, (x, y) => chintzPx(x, y, -1));
        if (ar.faces.top) T.poly(ar.faces.top, (x, y) => chintzPx(x, y, 1));
        const [ax, ay, aw, ah] = ar.front;
        rrect(T, ax, ay - 2, aw, ah + 2, 4, (x, y, lx, ly) => chintzPx(x, y, ly < 3 ? 1 : lx < 2 ? 0 : lx > aw - 3 ? -2 : -1), { noBottom: true });
        T.ellipse(ax + aw / 2, ay + 3, aw / 2 - 1.5, 3, (x, y, nx, ny) => (nx * nx + ny * ny > 0.45 ? P.chintz[2] : P.rosebud[2]));
        T.hline(ax + 2, ax + aw - 3, ay - 2, P.white_cloth[5]);
        T.vline(ax + 1, ay + 1, ay + ah - 4, P.white_cloth[5]);
      }
    }, { box: [30, 50, 130, 70] });
    // the plastic: long glints across the seat and the cushions
    const g = rm.pr(70, 86, 30), g2 = rm.pr(104, 86, 24);
    s.line(g[0], g[1] + 1, g[0] + 7, g[1] - 1, P.white_cloth[5]); s.line(g2[0], g2[1] + 1, g2[0] + 6, g2[1] - 1, P.white_cloth[5]);
    // a crocheted doily on the middle cushion
    const dp = rm.pr(90, 67, 14);
    for (let xx = -5; xx <= 5; xx++) for (let yy = 0; yy < 4 - (Math.abs(xx) > 3 ? 1 : 0); yy++) s.px(dp[0] + xx, dp[1] + yy, ((xx + yy) & 1) ? P.white_cloth[5] : P.white_cloth[3]);
  }

  function coffeeTable(s, rm) {
    const F = rm.by1, ty = 92;
    shadePoly(s, rm.fq(66, 118, 44, 70), -1);
    const c = box(s, rm, { x0: 68, x1: 116, y0: ty, y1: ty + 3, d0: 46, d1: 68 }, P.wood, { base: 3, top: 4 });
    // legs
    for (const [lx, ld] of [[70, 66], [114, 66], [70, 48], [114, 48]]) { const a = rm.pr(lx, ty + 3, ld), z = rm.pr(lx, F, ld); s.rect(a[0], a[1], 2, z[1] - a[1], P.wood[ld > 60 ? 2 : 1]); }
    s.poly(c.faces.top, (x, y) => { const q = rm.onFloor(x, y, ty), xw = q[0], d = q[1]; return ((flo(d / 3) + flo(xw / 17)) % 5 === 0) ? P.wood[3] : P.wood[4]; });
    const [fx, fy, fw] = c.front;
    s.hline(fx, fx + fw - 1, fy, P.wood[5]);
    // a doily and a dish of ribbon candy
    const dc = rm.pr(92, ty, 57), kk = rm.S(57);
    s.ellipse(dc[0], dc[1], 9 * kk, 3 * kk, (x, y) => (((x * 3 + y * 5) % 4) ? P.white_cloth[5] : P.white_cloth[3]));
    s.ellipse(dc[0], dc[1] - 1, 4 * kk, 1.6 * kk, P.green_glass[4]);
    s.ellipse(dc[0], dc[1] - 2, 3 * kk, 1.1 * kk, (x, y) => [P.red[4], P.yellow[4], P.leaf_orange[4], P.white_cloth[5]][(x + y) & 3]);
  }

  /* Mémère's armchair, its back to us, facing the window; the afghan over it */
  function armchair(s, rm, t) {
    const p = rm.pr(200, rm.by1, 30), cx = p[0], fy = p[1], V = P.velvet;
    shadeEll(s, cx + 2, fy, 24, 4, -1);
    obj(s, (T) => {
      T.rect(cx - 17, fy - 4, 3, 4, P.wood_dark[3]); T.rect(cx + 14, fy - 4, 3, 4, P.wood_dark[2]);
      // the seat base and its skirt
      rrect(T, cx - 19, fy - 18, 38, 15, 2, (x, y, lx, ly) => cl(V, ly < 2 ? 3 : lx < 3 ? 2 : lx > 33 ? 3 : 2));
      for (let x = cx - 16; x < cx + 18; x += 6) T.vline(x, fy - 12, fy - 5, V[1]);
      // rolled arms on both sides
      for (const side of [-1, 1]) {
        const ax = side < 0 ? cx - 23 : cx + 13;
        rrect(T, ax, fy - 33, 10, 20, 5, (x, y, lx, ly) => cl(V, ly < 3 ? 4 : side < 0 ? (lx < 3 ? 3 : 2) : (lx > 6 ? 4 : 3)), { noBottom: true });
        T.hline(ax + 3, ax + 6, fy - 33, V[5]);
      }
      // wing back: wide shoulders, a waist, rounded top
      const top = fy - 54;
      for (let r = 0; r < 40; r++) {
        let hw = r < 14 ? 16 : r < 24 ? 16 - (r - 14) * 0.25 : 13.5;
        let ins = 0;
        if (r < 6) ins = rnd(6 - Math.sqrt(36 - (6 - r) * (6 - r)));
        for (let x = -rnd(hw) + ins; x <= rnd(hw) - ins; x++) {
          const u = (x + hw) / (2 * hw);
          let sh = u < 0.12 ? 1 : u > 0.72 ? 3 : 2;
          if (r < 2) sh = 4;
          T.px(cx + x, top + r, V[sh]);
        }
      }
      // tufting buttons
      for (const [bx, by] of [[-7, 22], [0, 22], [7, 22], [-4, 30], [4, 30]]) { T.px(cx + bx, top + by, V[1]); T.px(cx + bx + 1, top + by, V[3]); }
    }, { box: [cx - 26, fy - 56, 52, 57] });
    // the afghan: chevron stripes over the shoulders of the chair, a fringe
    const rows = [P.leaf_orange[3], P.mustard[4], P.bakelite[2], P.cream[4], P.avocado[3], P.leaf_orange[4], P.bakelite[3], P.cream[3]];
    const top = fy - 55;
    for (let yy = top; yy < top + 27; yy++) {
      const r = yy - top, hw = (r < 3 ? 15 : 17) - (r > 16 ? rnd((r - 16) * 0.4) : 0);
      const sx = cx - hw + (r < 3 ? 3 - r : 0), ex = cx + hw - 1 - (r < 3 ? 3 - r : 0);
      for (let xx = sx; xx <= ex; xx++) {
        let c = ripple(xx, yy, rows, 8);
        if (fold(xx - cx, 11, 3) < 0) c = SH(c, -1);
        if (xx <= sx + 1) c = SH(c, -1);
        if (yy === top) c = SH(c, 1);
        s.px(xx, yy, c);
      }
      if (r === 26) for (let xx = sx + 1; xx <= ex; xx += 2) { s.px(xx, yy + 1, P.cream[3]); s.px(xx, yy + 2, P.cream[2]); }
    }
  }

  /* floor lamp with a fringed shade */
  function floorLamp(s, rm, t) {
    const F = rm.by1, on = t !== 'night';
    const b = rm.pr(240, F, 16), top = rm.pr(240, 46, 16);
    shadeEll(s, b[0], b[1], 7, 2, -1);
    s.ellipse(b[0], b[1] - 1, 5, 1.6, P.brass[2]); s.hline(b[0] - 4, b[0] + 4, b[1] - 2, P.brass[4]);
    s.vline(b[0], top[1] + 8, b[1] - 2, P.brass[3]); s.vline(b[0] + 1, top[1] + 8, b[1] - 2, P.brass[1]);
    s.rect(b[0] - 1, b[1] - 30, 4, 3, P.brass[4]);
    // the shade: a bell of pleated silk with a bead fringe
    const sy = top[1], sx = b[0];
    for (let yy = 0; yy < 12; yy++) {
      const hw = 5 + yy * 0.55;
      for (let xx = -hw; xx <= hw; xx++) {
        const u = (xx + hw) / (2 * hw);
        let sh = u < 0.2 ? 5 : u < 0.7 ? 4 : 3;
        if (((rnd(xx + sx) % 3) + 3) % 3 === 0) sh -= 1;
        s.px(sx + xx, sy + yy, on ? E(cl(P.fringe, sh)) : cl(P.fringe, sh - 1));
      }
    }
    s.hline(sx - 5, sx + 5, sy, on ? E(P.fringe[5]) : P.fringe[4]);
    for (let xx = -11; xx <= 11; xx++) { const L = 2 + ((xx + 30) % 2); for (let k = 0; k < L; k++) s.px(sx + xx, sy + 12 + k, on ? E(P.fringe[k ? 2 : 3]) : P.fringe[k ? 1 : 2]); }
    if (on) s.hline(sx - 10, sx + 10, sy + 11, E(P.lamp[5]));
  }

  /* the console TV, rabbit ears, Wheel of Fortune with the sound off */
  function consoleTV(s, rm, t) {
    const F = rm.by1, on = t !== 'night';
    shadePoly(s, rm.fq(240, 276, 0, 24), -1);
    const c = box(s, rm, { x0: 242, x1: 274, y0: 64, y1: F - 5, d0: 0, d1: 22 }, P.wood, { base: 3, top: 4, side: 2 });
    const [x, y, w, h] = c.front;
    // legs
    for (const lx of [x + 2, x + w - 4]) s.rect(lx, y + h, 2, F - 5 > 0 ? rm.pr(0, F, 22)[1] - (y + h) : 4, P.wood[1]);
    s.hline(x, x + w - 1, y, P.wood[5]); s.vline(x, y, y + h - 1, P.wood[4]); s.vline(x + w - 1, y, y + h - 1, P.wood[1]);
    // screen: rounded, with a deep bezel
    const sx = x + 3, sy = y + 3, sw = w - 13, sh2 = h - 10;
    rrect(s, sx - 1, sy - 1, sw + 2, sh2 + 2, 3, P.ink[2]);
    if (on) {
      rrect(s, sx, sy, sw, sh2, 3, (xx, yy, lx, ly) => E(cl(P.tv, ly < 2 ? 4 : ly > sh2 - 3 ? 2 : 3)));
      // the puzzle board: rows of letter tiles, some turned
      for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) {
        const tx = sx + 2 + k * 3, ty = sy + 3 + r * 4;
        if (tx + 2 > sx + sw - 1) continue;
        const turned = (r * 7 + k * 3) % 5 === 0;
        s.rect(tx, ty, 2, 3, E(turned ? P.white[5] : P.green_jkt[3]));
        if (turned) s.px(tx, ty + 1, E(P.ink[3]));
      }
      s.hline(sx + 1, sx + sw - 2, sy + sh2 - 2, E(P.tv[1]));
    } else {
      rrect(s, sx, sy, sw, sh2, 3, (xx, yy, lx, ly) => cl(P.metal, ly < 3 && lx < sw - 4 ? 2 : 1));
      s.line(sx + 2, sy + 4, sx + 5, sy + 1, P.metal[3]);
    }
    // speaker cloth and knobs
    s.rect(x + w - 9, y + 3, 7, h - 10, P.bakelite[2]);
    for (let yy = y + 4; yy < y + h - 8; yy += 2) s.hline(x + w - 8, x + w - 4, yy, P.bakelite[1]);
    s.rect(x + w - 8, y + h - 6, 2, 2, P.brass[4]); s.rect(x + w - 5, y + h - 6, 2, 2, P.brass[4]);
    s.hline(x + 2, x + w - 3, y + h - 3, P.wood[2]);
    // rabbit ears, a doily, a small plant
    const tp = c.faces.top ? c.faces.top : null;
    const ax = x + w / 2, ay = y - 1;
    s.ellipse(ax, ay, 3, 1.5, P.ink[3]);
    s.line(ax - 1, ay - 1, ax - 9, ay - 15, P.chrome[3]); s.line(ax + 1, ay - 1, ax + 7, ay - 16, P.chrome[2]);
    s.px(ax - 9, ay - 15, P.chrome[5]); s.px(ax + 7, ay - 16, P.chrome[5]);
    s.ellipse(x + 7, y - 1, 5, 1.5, P.white_cloth[5]);
    s.rect(x + 5, y - 5, 4, 4, P.tile_red[3]); s.px(x + 5, y - 5, P.tile_red[4]);
    s.ellipse(x + 7, y - 8, 4, 3, (xx, yy, nx, ny) => P.grass[ny < -0.2 ? 4 : nx > 0.3 ? 2 : 3]);
    if (on) s.light('cool', x + 3 + sw / 2, y + 3 + sh2 / 2, 8, 7, 0.6);
  }

  /* the glass curio cabinet of Hummel figurines, on the left wall */
  function curio(s, rm) {
    const F = rm.by1, bx0 = rm.bx0;
    const b = { x0: bx0, x1: bx0 + 14, y0: 26, y1: F, d0: 16, d1: 50 };
    shadePoly(s, rm.fq(bx0, bx0 + 17, 14, 53), -1);
    const c = box(s, rm, b, P.wood_dark, { base: 3, side: 3 });
    // side panel (facing us): raised panel
    const [fx, fy, fw, fh] = c.front;
    s.rect(fx + 2, fy + 3, fw - 4, fh - 10, P.wood_dark[2]); s.hline(fx + 2, fx + fw - 3, fy + 3, P.wood_dark[1]); s.hline(fx + 2, fx + fw - 3, fy + fh - 8, P.wood_dark[4]);
    s.hline(fx, fx + fw - 1, fy, P.wood_dark[5]); s.vline(fx, fy, fy + fh - 1, P.wood_dark[4]);
    // the glass front, toward the room
    const X = bx0 + 14, q = (y0, y1, d0, d1) => [rm.pr(X, y0, d0), rm.pr(X, y0, d1), rm.pr(X, y1, d1), rm.pr(X, y1, d0)];
    s.poly(q(30, F - 10, 18, 48), P.wood_dark[1]);
    const shelves = [46, 64, 82];
    const coats = [[P.navy[3], P.red[3], P.green_jkt[3]], [P.mustard[3], P.denim[4], P.pink[3]], [P.red[3], P.green_jkt[4], P.navy[3]]];
    for (let si = 0; si < shelves.length; si++) {
      const sy = shelves[si];
      // a plate standing at the back
      const pp = rm.pr(X - 9, sy - 5, 27 + si * 4); s.circle(pp[0], pp[1], 2.6, P.white_cloth[4]); s.ring(pp[0] + 0.5, pp[1] + 0.5, 2.4, 2.4, P.plaid_b[3]);
      for (let k = 0; k < 3; k++) {
        const d = 22 + k * 9 + (si % 2) * 3, p = rm.pr(X - 5, sy, d), coat = coats[si][k];
        // a rosy-cheeked child: base, smock, head, hair or hat
        s.hline(p[0] - 1, p[0] + 3, p[1] - 1, P.cream[3]);
        s.rect(p[0], p[1] - 5, 3, 4, coat); s.px(p[0], p[1] - 5, SH(coat, 1)); s.px(p[0] + 2, p[1] - 2, SH(coat, -1));
        s.rect(p[0], p[1] - 7, 3, 2, P.skin_peach[4]); s.px(p[0] + 2, p[1] - 6, P.blush[2]);
        s.hline(p[0], p[0] + 2, p[1] - 8, k === 1 ? P.red[3] : P.hair_blond[3]);
      }
      const L0 = rm.pr(X, sy, 18), L1 = rm.pr(X, sy, 48);
      s.line(L0[0], L0[1], L1[0], L1[1], P.wood_dark[3]); s.line(L0[0], L0[1] + 1, L1[0], L1[1] + 1, P.wood_dark[0]);
    }
    // glass reflections and the frame
    const gq = q(30, F - 10, 18, 48);
    s.clip(gq, () => { const p0 = rm.pr(X, 30, 40), p1 = rm.pr(X, 50, 30); s.line(p0[0], p0[1], p1[0], p1[1], P.white_cloth[2]); });
    const fr = (y0, y1, d0, d1, c2) => s.poly(q(y0, y1, d0, d1), c2);
    fr(28, 30, 16, 50, P.wood_dark[4]); fr(F - 10, F - 8, 16, 50, P.wood_dark[4]); fr(28, F - 8, 32, 34, P.wood_dark[3]);
    const kn = rm.pr(X, 64, 31); s.px(kn[0], kn[1], P.brass[4]);
    // crown
    const cr = box(s, rm, { x0: bx0, x1: bx0 + 17, y0: 22, y1: 26, d0: 14, d1: 52 }, P.wood_dark, { base: 4, side: 3 });
    s.hline(cr.front[0], cr.front[0] + cr.front[2] - 1, cr.front[1], P.wood_dark[5]);
  }

  /* the doorway to the front hall, on the right wall */
  function hallDoor(s, rm) {
    const F = rm.by1, bx1 = rm.bx1;
    s.poly(rm.rq(6, 44, F - 88, F), P.wood[3]);
    const dq = rm.rq(9, 41, F - 85, F);
    s.poly(dq, (x, y) => (y > dq[2][1] - 12 - (x - dq[0][0]) * 0.25 ? P.wood_dark[2] : P.wall_rose[1]));
    // coats on hooks in the hall beyond
    const h0 = rm.pr(bx1, F - 66, 24);
    s.rect(h0[0] + 2, h0[1], 5, 16, P.maroon[2]); s.vline(h0[0] + 2, h0[1], h0[1] + 15, P.maroon[3]);
    s.rect(h0[0] + 6, h0[1] + 1, 4, 13, P.navy[2]);
    const e0 = rm.pr(bx1, F - 88, 6), e1 = rm.pr(bx1, F, 6); s.line(e0[0], e0[1], e1[0], e1[1], P.wood[2]);
    const e2 = rm.pr(bx1, F - 88, 44), e3 = rm.pr(bx1, F, 44); s.line(e2[0], e2[1], e3[0], e3[1], P.wood[4]);
  }

  /* braided oval rug */
  function braidedRug(s, rm, cx, cd, rx, rd) {
    const rings = [P.bakelite[2], P.cream[3], P.navy[3], P.leaf_orange[2], P.cream[4], P.drape[3], P.bakelite[3], P.cream[3], P.navy[2], P.leaf_orange[3]];
    s.poly(rm.fq(cx - rx - 1, cx + rx + 1, cd - rd - 1, cd + rd + 1), (x, y) => {
      const q = rm.onFloor(x, y), xw = q[0], d = q[1], nx = (xw - cx) / rx, ny = (d - cd) / rd, r = Math.sqrt(nx * nx + ny * ny);
      if (r > 1) return 0;
      const ring = (1 - r) * rx / 3.2, k = flo(ring) % rings.length;
      const a = Math.atan2(ny, nx), bz = flo(a * (8 + flo(ring) * 3) + ring * 2) & 1;
      return SH(rings[k], (bz ? 0 : -1) + (r > 0.95 ? -1 : 0));
    });
  }
})();
