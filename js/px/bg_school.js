/* What Derry Keeps — Derry High School, pixel backgrounds (320×180).
 *
 *   school_ext  morning (Sep 4, first day: cool, crisp) | afternoon (gold, long shadows)
 *   school_hall day | empty_night (after hours: EXIT sign, moonlight)
 *   classroom   day, variant board_blank (Room 114, Ms. Whitcomb's English)
 *   cafeteria   day
 *   library     day | evening (the grand old library, with a microfilm corner)
 *   boiler      dim, variant wall (Mr. Teague's wall of names)
 *
 * Shared helpers at the top: a 3×5 pixel font, a one-point perspective
 * camera for the interiors, brick and tile textures.
 */
(function () {
  'use strict';
  const P = PX.P, E = PX.E, SH = PX.sh;
  const R = PX.ramp;

  /* ------------------------------------------------------------------ */
  /* materials (dark → light, hue-shifted)                               */
  R('sch_brick', ['#2a1016', '#4a1c1e', '#6e2a26', '#8f3b2e', '#ac5139', '#c66e4c']);
  R('sch_lime', ['#3b3036', '#625550', '#8e806f', '#b5a68f', '#d6c9ae', '#efe6cf']);
  R('sch_glass', ['#141a2c', '#212c44', '#314263', '#475f84', '#6a87a8', '#9fbad2']);
  R('sch_far', ['#3e4c66', '#4e5e7a', '#62728e', '#7888a2', '#909fb8', '#acb9cc']);
  R('sch_farpine', ['#26343e', '#2f4048', '#3b4e54', '#4a5e60', '#5d716e', '#748680']);
  R('sch_farleaf', ['#3c3044', '#584350', '#7a5a52', '#9a7358', '#b78d64', '#cfa97c']);
  R('sch_skygold', ['#4f4a78', '#7a6a8c', '#b08a86', '#e2a978', '#f6c98a', '#fde6b6']);
  R('sch_cloudgold', ['#6c5c80', '#9c7c8c', '#cc9c8a', '#eec29c', '#fadcb4', '#fff2da']);
  R('sch_bus', ['#3b2309', '#6b400e', '#a46714', '#d4951f', '#efba33', '#fbdc6c']);
  R('sch_locker', ['#1a1f16', '#2b3423', '#3f4b31', '#566444', '#6f7e5b', '#909e78']);
  R('sch_vct', ['#3a3431', '#5b534c', '#82786c', '#a69c8b', '#c6bda9', '#e2dac6']);
  R('sch_vct2', ['#352a2a', '#54403b', '#78604f', '#9b7f64', '#b89c7b', '#d3ba98']);
  R('sch_cork', ['#3a2416', '#5e3b22', '#87592f', '#a87643', '#c4955c', '#dcb67e']);
  R('sch_wire', ['#1d2430', '#2c3646', '#3f4d60', '#5b6c80', '#8293a6', '#b2c0cc']);

  /* ------------------------------------------------------------------ */
  /* pixel font: 3×5 capitals (M, N, W wider), digits, punctuation       */
  const GL = {
    A: '.#.|#.#|###|#.#|#.#', B: '##.|#.#|##.|#.#|##.', C: '.##|#..|#..|#..|.##', D: '##.|#.#|#.#|#.#|##.',
    E: '###|#..|##.|#..|###', F: '###|#..|##.|#..|#..', G: '.##|#..|#.#|#.#|.##', H: '#.#|#.#|###|#.#|#.#',
    I: '###|.#.|.#.|.#.|###', J: '..#|..#|..#|#.#|.#.', K: '#.#|#.#|##.|#.#|#.#', L: '#..|#..|#..|#..|###',
    M: '#...#|##.##|#.#.#|#...#|#...#', N: '#..#|##.#|#.##|#..#|#..#', O: '.#.|#.#|#.#|#.#|.#.',
    P: '##.|#.#|##.|#..|#..', Q: '.#.|#.#|#.#|##.|.##', R: '##.|#.#|##.|#.#|#.#', S: '.##|#..|.#.|..#|##.',
    T: '###|.#.|.#.|.#.|.#.', U: '#.#|#.#|#.#|#.#|###', V: '#.#|#.#|#.#|#.#|.#.', W: '#...#|#...#|#.#.#|##.##|#...#',
    X: '#.#|#.#|.#.|#.#|#.#', Y: '#.#|#.#|.#.|.#.|.#.', Z: '###|..#|.#.|#..|###',
    0: '###|#.#|#.#|#.#|###', 1: '.#.|##.|.#.|.#.|###', 2: '##.|..#|.#.|#..|###', 3: '##.|..#|.#.|..#|##.',
    4: '#.#|#.#|###|..#|..#', 5: '###|#..|##.|..#|##.', 6: '.##|#..|###|#.#|###', 7: '###|..#|..#|.#.|.#.',
    8: '###|#.#|###|#.#|###', 9: '###|#.#|###|..#|##.',
    '.': '.|.|.|.|#', ',': '.|.|.|#|#', '-': '...|...|###|...|...', "'": '#|#|.|.|.', '!': '#|#|#|.|#',
    '?': '##.|..#|.#.|...|.#.', ':': '.|#|.|#|.', '/': '..#|..#|.#.|#..|#..', '(': '.#|#.|#.|#.|.#', ')': '#.|.#|.#|.#|#.',
    '+': '...|.#.|###|.#.|...', '"': '#.#|#.#|...|...|...', '=': '...|###|...|###|...', '&': '.#.|#.#|.#.|#.#|.##',
    '#': '#.#|###|#.#|###|#.#', '%': '#.#|..#|.#.|#..|#.#', '*': '#.#|.#.|#.#|...|...', '$': '.##|##.|.#.|.##|##.',
    '~': '.....|.#...|#.#.#|...#.|.....'
  };
  const GLYPH = {};
  for (const k in GL) GLYPH[k] = GL[k].split('|');
  /* width of a string in pixels */
  function txtW(str, o = {}) {
    const sc = o.scale || 1, sp = o.sp === undefined ? 1 : o.sp, spc = o.space === undefined ? 2 : o.space;
    let w = 0;
    for (const ch of String(str).toUpperCase()) {
      if (ch === ' ') { w += spc * sc; continue; }
      const g = GLYPH[ch]; if (!g) continue;
      w += (g[0].length + sp) * sc;
    }
    return Math.max(0, w - sp * sc);
  }
  /* draw text; c is a code or fn(x, y, i) -> code. o: scale, sp, space, align
   * ('left'|'center'|'right'), jit (rng: hand-lettered wobble), shadow (code, drawn at +sdx,+sdy) */
  function txt(s, x, y, str, c, o = {}) {
    const sc = o.scale || 1, sp = o.sp === undefined ? 1 : o.sp, spc = o.space === undefined ? 2 : o.space;
    const w = txtW(str, o);
    let cx = Math.round(o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x);
    const pts = [];
    let i = 0;
    for (const ch of String(str).toUpperCase()) {
      if (ch === ' ') { cx += spc * sc; continue; }
      const g = GLYPH[ch]; if (!g) continue;
      const dy = o.jit ? (o.jit() < 0.22 ? (o.jit() < 0.5 ? -1 : 1) : 0) : 0;
      for (let r = 0; r < g.length; r++) for (let k = 0; k < g[r].length; k++) {
        if (g[r][k] !== '#') continue;
        for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) pts.push([cx + k * sc + b, y + r * sc + a + dy, i]);
      }
      cx += (g[0].length + sp) * sc; i++;
    }
    if (o.shadow) for (const [px, py] of pts) s.px(px + (o.sdx === undefined ? 1 : o.sdx), py + (o.sdy === undefined ? 1 : o.sdy), o.shadow);
    for (const [px, py, k] of pts) s.px(px, py, typeof c === 'function' ? c(px, py, k) : c);
    return w;
  }

  /* ------------------------------------------------------------------ */
  /* one-point perspective camera: X right, Y up (floor = 0), Z depth     */
  function Cam(vx, vy, f, eye) {
    return {
      vx, vy, f, eye,
      p: (X, Y, Z) => [vx + (f * X) / Z, vy + (f * (eye - Y)) / Z],
      x: (X, Z) => vx + (f * X) / Z,
      y: (Y, Z) => vy + (f * (eye - Y)) / Z,
      k: (Z) => f / Z,
      /* depth of a floor (or any height Y) point at screen row sy */
      zAt: (sy, Y = 0) => (f * (eye - Y)) / (sy - vy)
    };
  }
  /* perspective passes: depth is computed once per row (floor, ceiling) or
   * per column (side walls), then fn(x, y, A, Z) returns a code (0 = skip)
   * that is written straight into the buffer (no clip may be active). */
  function floorPass(s, C, X0, X1, Z0, Z1, fn, Yp = 0) {
    const ceil = Yp > C.eye, D = s.d, W = s.w;
    const ya = Math.max(0, Math.floor(Math.min(C.y(Yp, Z1), C.y(Yp, Z0)))), yb = Math.min(s.h - 1, Math.ceil(Math.max(C.y(Yp, Z1), C.y(Yp, Z0))));
    for (let y = ya; y <= yb; y++) {
      const dy = y + 0.5 - C.vy; if (ceil ? dy >= 0 : dy <= 0) continue;
      const Z = (C.f * (C.eye - Yp)) / dy;
      if (Z < Z0 || Z > Z1) continue;
      const k = Z / C.f, xa = Math.max(0, Math.ceil(C.vx + X0 / k - 0.5)), xb = Math.min(W - 1, Math.floor(C.vx + X1 / k - 0.5));
      for (let x = xa, i = y * W + xa; x <= xb; x++, i++) { const c = fn(x, y, (x + 0.5 - C.vx) * k, Z); if (c) D[i] = c; }
    }
  }
  function wallPass(s, C, Xw, Z0, Z1, Y0, Y1, fn) {
    const D = s.d, W = s.w;
    const xa = Math.max(0, Math.floor(Math.min(C.x(Xw, Z0), C.x(Xw, Z1)))), xb = Math.min(W - 1, Math.ceil(Math.max(C.x(Xw, Z0), C.x(Xw, Z1))));
    for (let x = xa; x <= xb; x++) {
      const dx = x + 0.5 - C.vx; if (dx === 0 || (Xw < 0) !== (dx < 0)) continue;
      const Z = (C.f * Xw) / dx;
      if (Z < Z0 || Z > Z1) continue;
      const k = Z / C.f, ya = Math.max(0, Math.ceil(C.vy + (C.eye - Y1) / k - 0.5)), yb = Math.min(s.h - 1, Math.floor(C.vy + (C.eye - Y0) / k - 0.5));
      for (let y = ya, i = ya * W + x; y <= yb; y++, i += W) { const c = fn(x, y, C.eye - (y + 0.5 - C.vy) * k, Z); if (c) D[i] = c; }
    }
  }

  /* ------------------------------------------------------------------ */
  /* fast region ops (the kit's shift/lightPoly allocate a full-frame mask  */
  /* per call; these touch only the pixels in the region)                  */
  /* darken (d < 0) or lighten every non-emissive pixel in a rect */
  function shadeRect(s, x, y, w, h, d) {
    x = Math.round(x); y = Math.round(y);
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(s.w, x + Math.round(w)), y1 = Math.min(s.h, y + Math.round(h)), D = s.d;
    for (let yy = y0; yy < y1; yy++) for (let i = yy * s.w + x0, e = yy * s.w + x1; i < e; i++) { const v = D[i]; if (v && !(v & 0x8000)) D[i] = SH(v, d); }
  }
  /* same for a polygon; o.dither (0..1) shifts only part of the pixels */
  function shadePoly(s, pts, d, o = {}) {
    const D = s.d, W = s.w, dl = o.dither;
    s.poly(pts, (x, y) => { const v = D[y * W + x]; if (!v || (v & 0x8000) || (dl !== undefined && PX.bayer(x, y) >= dl)) return 0; return SH(v, d); });
  }
  /* same for fn(x, y) -> bool inside a bounding box */
  function shadeFn(s, x0, y0, x1, y1, fn, d) {
    const D = s.d, W = s.w;
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(s.h - 1, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) {
      const i = y * W + x, v = D[i]; if (v && !(v & 0x8000) && fn(x, y)) D[i] = SH(v, d);
    }
  }
  /* light filling a polygon (like s.lightPoly), optional fade {x0,y0,x1,y1} */
  function lightPoly(s, ch, pts, amount, fade) {
    const L = s.L[ch] || (s.L[ch] = new Float32Array(s.w * s.h)), W = s.w;
    const vx = fade ? fade.x1 - fade.x0 : 0, vy = fade ? fade.y1 - fade.y0 : 0, vv = vx * vx + vy * vy;
    s.poly(pts, (x, y) => {
      let a = amount;
      if (fade) a *= 1 - Math.max(0, Math.min(1, ((x - fade.x0) * vx + (y - fade.y0) * vy) / vv));
      L[y * W + x] += a; return 0;
    });
  }

  /* ------------------------------------------------------------------ */
  /* textures                                                            */
  /* running-bond brick with quiet, clustered variation */
  function brickWall(s, x, y, w, h, r, o = {}) {
    const bw = o.bw || 6, bh = o.bh || 3, base = o.base === undefined ? 3 : o.base, rng = o.rng || s.rng;
    const mortar = o.mortar === undefined ? r[base - 1] : o.mortar;
    s.rect(x, y, w, h, mortar);
    for (let row = 0, yy = y; yy < y + h; row++, yy += bh) {
      const off = (row % 2) * Math.floor(bw / 2) + (o.off || 0);
      for (let xx = x - bw + (off % bw); xx < x + w; xx += bw) {
        const q = rng();
        const sh = base + (q < (o.dark || 0.12) ? -1 : q > 1 - (o.light || 0.1) ? 1 : 0);
        const x0 = Math.max(x, xx), x1 = Math.min(x + w, xx + bw - 1), y1 = Math.min(y + h, yy + bh - 1);
        if (x1 <= x0 || y1 <= yy) continue;
        s.rect(x0, yy, x1 - x0, y1 - yy, r[Math.max(0, Math.min(5, sh))]);
      }
    }
  }

  /* one leaf clump: an irregular blob (lobed outline), a highlight clump
   * offset toward the light, a dark rim on the shadow side */
  function clump(s, cx, cy, r, ramp, sh, rng, sq = 0.84) {
    const ph1 = rng() * 6.283, ph2 = rng() * 6.283, a1 = 0.16 + rng() * 0.08;
    const R0 = r * 1.3, hx = cx - r * 0.32, hy = cy - r * 0.36, hr = r * 0.56;
    for (let y = Math.floor(cy - R0); y <= Math.ceil(cy + R0); y++) {
      for (let x = Math.floor(cx - R0); x <= Math.ceil(cx + R0); x++) {
        const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) / sq, d = Math.sqrt(dx * dx + dy * dy);
        if (d > R0) continue;
        const th = Math.atan2(dy, dx), rr = r * (1 + a1 * Math.sin(3 * th + ph1) + 0.09 * Math.sin(5 * th + ph2));
        if (d > rr) continue;
        let k = sh;
        const ex = x + 0.5 - hx, ey = (y + 0.5 - hy) / sq;
        if (ex * ex + ey * ey < hr * hr * (1 + 0.2 * Math.sin(4 * th + ph2))) k = sh + 1;
        else if (d > rr * 0.72 && dx * -0.62 + dy * -0.78 < -0.25 * d) k = sh - 1;
        s.px(x, y, ramp[Math.max(0, Math.min(5, k))]);
      }
    }
  }

  /* leafy canopy lit from the upper left: a solid dark mass, then leaf clumps
   * back to front. ramps: [[ramp, weight], ...] from the crown's outside
   * (turns first) to its inside; o.mix 0..1 blurs the zones. */
  function canopy(s, cx, cy, rx, ry, ramps, o = {}) {
    const rng = o.rng || s.rng, n = o.n || Math.round((rx * ry) / 12), lx = -0.62, ly = -0.78;
    const tot = ramps.reduce((a, r) => a + r[1], 0), mix = o.mix === undefined ? 0.35 : o.mix;
    const zone = (t) => { let q = Math.max(0, Math.min(0.999, t)) * tot; for (const r of ramps) { q -= r[1]; if (q <= 0) return r[0]; } return ramps[ramps.length - 1][0]; };
    const blobs = [];
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng());
      const bx = cx + Math.cos(a) * d * rx * 0.84, by = cy + Math.sin(a) * d * ry * 0.82;
      const lit = ((bx - cx) / rx) * lx + ((by - cy) / ry) * ly;
      const t = 1 - (0.55 * d + 0.45 * (lit * 0.5 + 0.5)) + (rng() - 0.5) * mix;
      blobs.push({ bx, by, r: rng.range(o.rmin || 2.8, o.rmax || 5), ramp: zone(t), lit });
    }
    const base = o.base || 0;
    for (const b of blobs) s.ellipse(b.bx, b.by + 0.6, b.r + 1, (b.r + 1) * 0.84, b.ramp[1 + base]);
    blobs.sort((p, q) => p.lit - q.lit);
    for (const b of blobs) clump(s, b.bx, b.by, b.r, b.ramp, (b.lit > 0.45 ? 4 : b.lit > 0.0 ? 3 : 2) + base, rng);
  }

  /* a tree trunk with bark streaks, a lit left edge and a root flare */
  function trunk(s, x, y0, y1, w, K) {
    s.rect(x, y0, w, y1 - y0, K[2]);
    s.vline(x, y0, y1 - 1, K[3]); s.vline(x + 1, y0, y1 - 1, K[3]); s.vline(x + w - 1, y0, y1 - 1, K[1]);
    const r = PX.rng('trunk' + x);
    for (let k = 0; k < (y1 - y0) / 5; k++) { const sx = x + r.int(2, w - 2), sy = r.int(y0, y1 - 6); s.vline(sx, sy, sy + r.int(3, 6), K[1]); }
    s.rect(x - 1, y1 - 3, w + 2, 3, K[2]); s.hline(x - 1, x + 1, y1 - 3, K[3]); s.px(x + w, y1 - 3, K[1]);
  }

  /* ================================================================== */
  /* SCHOOL EXTERIOR                                                     */
  /* A 1923 three-storey brick school, entrance pavilion at centre-left   */
  /* (so a sprite at stage right stands on the steps without hiding the   */
  /* banner). Beyond the left corner: the chain-link fence, the bike rack */
  /* and the football field with its bleachers; a bus at the right curb.  */
  /* ================================================================== */
  const GROUND = 122;                    // grade line at the building front
  const WX0 = 62, PX0 = 120, PX1 = 192, PCX = 156;
  const FLOOR_Y = [46, 68, 90];          // window heads, 3rd / 2nd / 1st floor
  const MAPLE = [[P.leaf_red, 1.2], [P.leaf_orange, 2.6], [P.leaf_gold, 2.4], [P.grass_fall, 1.4], [P.grass, 2.4]];

  PX.bg('school_ext', {
    times: ['morning', 'afternoon'],
    draw(s, o) {
      const aft = o.time === 'afternoon', rng = o.rng;
      extSky(s, aft, rng);
      extFar(s, aft, rng);
      extSchool(s, aft, rng);
      extGround(s, aft, rng);
      extTrees(s, aft, rng);
      extBus(s, 230, 113, aft);
      extLight(s, aft);
    }
  });

  function extSky(s, aft, rng) {
    if (!aft) {
      s.vgrad(0, 0, 320, 104, [E(P.sky_day[2]), E(P.sky_day[3]), E(P.sky_day[4]), E(P.sky_day[5])], 4);
      s.cloud(206, 10, 34, 7, { emit: true, rng });
      s.cloud(268, 4, 24, 5, { emit: true, rng });
      s.cloud(84, 34, 22, 5, { emit: true, rng, top: 5 });
    } else {
      const G = P.sch_skygold;
      s.vgrad(0, 0, 320, 104, [E(P.sky_day[1]), E(P.sky_day[2]), E(P.sky_day[3]), E(G[4]), E(G[5])], 4);
      const cg = P.sch_cloudgold;
      s.cloud(206, 11, 38, 7, { emit: true, ramp: cg, top: 4, rng });
      s.cloud(270, 5, 26, 5, { emit: true, ramp: cg, top: 4, rng });
      s.cloud(84, 36, 26, 5, { emit: true, ramp: cg, top: 5, rng });
    }
  }

  function extFar(s, aft, rng) {
    const W = WX0 + 2;
    // far ridge, lighter and bluer with distance; a closer, darker one
    const ridge = (base, amp, seed, ramp, sh) => {
      const yAt = (x) => base + Math.sin(x * 0.05 + seed) * amp + Math.sin(x * 0.13 + seed * 2) * amp * 0.35;
      const pts = [[0, 120]]; for (let x = 0; x <= W; x += 4) pts.push([x, yAt(x)]); pts.push([W, 120]);
      s.poly(pts, ramp[sh]);
      for (let k = 1; k < pts.length - 2; k++) s.line(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], ramp[sh + 1]);
      return yAt;
    };
    const y1 = ridge(70, 4, 1.3, P.sch_far, 3);
    const r2 = PX.rng('schfar');
    for (let x = 4; x < W; x += r2.int(9, 14)) s.ellipse(x, y1(x) + 1, r2.int(3, 5), 2.5, P.sch_far[3]);
    ridge(80, 3, 4.1, P.sch_farpine, 3);
    // tree line behind the field: maples turning, a few pines
    for (let x = 2; x < W; x += r2.int(7, 10)) {
      if (r2() < 0.3) s.pine(x, 95, r2.int(11, 14), P.sch_farpine, { rng: r2, light: 1 });
      else canopy(s, x, 88 + r2.int(-1, 1), r2.int(5, 7), r2.int(4, 5), [[P.sch_farleaf, 3], [P.sch_farpine, 1]], { rng: r2, rmin: 2, rmax: 3, base: 0 });
    }
    // the field
    s.rect(0, 96, W, 8, P.grass[3]); s.hline(0, W - 1, 96, P.grass[4]);
    // bleachers across the field: aluminum planks stepping up, rail, a press box
    const bx0 = 16, bx1 = 56, by0 = 84, by1 = 97;
    for (let y = by0; y <= by1; y++) s.hline(bx0, bx1, y, (y - by0) % 2 ? P.metal[2] : P.chrome[3]);
    for (let x = bx0 + 13; x < bx1; x += 14) s.vline(x, by0, by1, P.metal[1]);
    s.hline(bx0, bx1, by0 - 2, P.chrome[2]); s.vline(bx0, by0 - 2, by1, P.metal[1]); s.vline(bx1, by0 - 2, by1, P.metal[1]);
    s.rect(30, 77, 13, 6, P.cream[3]); s.hline(30, 42, 77, P.cream[4]); s.rect(32, 79, 9, 2, P.sch_glass[2]); s.rect(29, 76, 15, 1, P.roof[3]);
    // a light tower
    s.vline(8, 50, 102, P.metal[2]); s.vline(9, 50, 102, P.metal[1]);
    s.rect(5, 46, 8, 5, P.metal[1]); for (let xx = 6; xx < 12; xx += 2) { s.px(xx, 47, P.chrome[4]); s.px(xx, 49, P.chrome[4]); }
    // bus lot / drive
    s.rect(0, 104, W, 18, P.asphalt[3]); s.hline(0, W - 1, 104, P.asphalt[4]);
    // chain-link fence along the field: posts, top rail, diamond mesh
    const fy0 = 92, fy1 = 106;
    for (let y = fy0 + 2; y < fy1; y++) for (let x = 0; x < W; x++) if (((x + y) & 3) === 0 || ((x - y + 400) & 3) === 0) if (((x + y) & 1) === 0) s.px(x, y, P.chrome[2]);
    s.hline(0, W - 1, fy0, P.chrome[4]); s.hline(0, W - 1, fy0 + 1, P.metal[2]);
    for (let x = 4; x < W; x += 14) { s.vline(x, fy0 - 1, fy1, P.chrome[3]); s.vline(x + 1, fy0, fy1, P.metal[1]); }
    // concrete pad and the bike rack in front of the fence
    s.rect(14, 112, 46, 9, P.concrete[3]); s.hline(14, 59, 112, P.concrete[4]); s.hline(14, 59, 120, P.concrete[2]);
    bikeRack(s, 18, 108);
  }

  function bikeRack(s, x, y) {
    const C = P.chrome;
    // a grid rack: top rail and uprights
    s.hline(x, x + 36, y + 3, C[4]); s.hline(x, x + 36, y + 4, C[2]);
    for (let k = 0; k <= 36; k += 4) s.vline(x + k, y + 4, y + 11, k % 8 ? C[2] : C[3]);
    s.hline(x, x + 36, y + 11, C[2]);
    // two bikes parked in it (side view, facing right)
    const bike = (bx, by, r) => {
      for (const wx of [bx + 3, bx + 12]) { s.ring(wx + 0.5, by + 9.5, 3.4, 3.4, P.ink[2]); s.px(wx, by + 9, P.metal[3]); }
      s.line(bx + 3, by + 9, bx + 6, by + 4, r[3]);              // seat stay
      s.line(bx + 6, by + 4, bx + 8, by + 9, r[3]);              // seat tube
      s.line(bx + 6, by + 4, bx + 11, by + 4, r[4]);             // top tube
      s.line(bx + 8, by + 9, bx + 11, by + 4, r[2]);             // down tube
      s.line(bx + 11, by + 4, bx + 12, by + 9, r[2]);            // fork
      s.hline(bx + 5, bx + 7, by + 3, P.ink[3]);                 // saddle
      s.hline(bx + 10, bx + 12, by + 2, P.ink[3]); s.px(bx + 11, by + 3, r[3]);   // bars
    };
    bike(x + 2, y + 1, P.red);
    bike(x + 19, y + 1, P.teal);
  }

  function sashWindow(s, x, y, w, h, o = {}) {
    const T = P.sch_lime, G = P.sch_glass, C = P.cream;
    s.rect(x, y, w, h, T[4]);
    s.vline(x + w - 1, y, y + h - 1, T[3]);
    const gx = x + 1, gy = y + 1, gw = w - 2, gh = h - 2;
    const rail = gy + Math.floor(gh / 2) - 1;
    for (let yy = gy; yy < gy + gh; yy++) {
      const top = yy < rail, k = top ? yy - gy : yy - rail - 2;
      let c = top ? (k < 2 ? G[3] : G[2]) : (k < 1 ? G[2] : G[1]);
      if (o.gold && top && k < 2) c = P.sch_skygold[3];
      s.hline(gx, gx + gw - 1, yy, c);
    }
    if (o.blind) {
      const by1 = gy + Math.max(2, Math.round(o.blind * gh));
      for (let yy = gy; yy < by1; yy++) s.hline(gx, gx + gw - 1, yy, (yy - gy) % 2 ? C[2] : C[3]);
      s.hline(gx, gx + gw - 1, by1 - 1, C[1]);
    }
    if (o.open) { s.rect(gx, gy + gh - 3, gw, 3, G[0]); s.hline(x, x + w - 1, gy + gh - 4, T[4]); }
    s.hline(x, x + w - 1, rail, T[5]); s.hline(x, x + w - 1, rail + 1, T[2]);
    s.vline(x + Math.floor(w / 2), gy, gy + gh - 1, T[3]);
    s.hline(x, x + w - 1, y, T[2]);
  }

  /* a run of windows sharing one limestone lintel and sill */
  function windowGroup(s, gx, wy, n, r2, o = {}) {
    const L = P.sch_lime, w = n * 11 - 2;
    s.rect(gx - 2, wy - 3, w + 4, 2, L[4]); s.hline(gx - 2, gx + w + 1, wy - 2, L[2]);
    s.rect(gx - 2, wy + 16, w + 4, 2, L[4]); s.hline(gx - 2, gx + w + 1, wy + 17, L[1]);
    shadeRect(s, gx - 2, wy + 18, w + 4, 1, -1);
    for (let k = 0; k < n; k++) {
      const blind = o.blind !== undefined ? o.blind[k] : (r2() < 0.7 ? r2.pick([0.25, 0.4, 0.5, 0.5, 0.75, 0.95]) : 0);
      sashWindow(s, gx + k * 11, wy, 9, 16, { blind, open: !o.blind && r2() < 0.1, gold: o.gold && r2() < 0.35 });
    }
  }

  function quoins(s, x, y0, y1, flip) {
    const L = P.sch_lime;
    for (let y = y0, k = 0; y < y1; y += 4, k++) {
      const qw = k % 2 ? 4 : 7, qx = flip ? x - qw + 1 : x;
      s.rect(qx, y, qw, 3, L[3 + (k % 2)]); s.hline(qx, qx + qw - 1, y, L[5]);
      if (flip) s.vline(qx, y, y + 2, L[2]);
    }
  }

  function extSchool(s, aft, rng) {
    const B = P.sch_brick, L = P.sch_lime;
    // the boiler stack behind the right wing
    brickWall(s, 236, 2, 9, 32, B, { bw: 4, bh: 2, base: 3, rng });
    s.rect(235, 1, 11, 2, L[3]); s.hline(235, 245, 1, L[4]); s.vline(244, 3, 33, B[2]);
    if (!aft) {
      const w = PX.rng('schsmoke');
      for (let i = 0; i < 7; i++) s.ellipse(243 + i * 5 + w.int(0, 1), -1 - i * 0.4, 2 + i * 0.5, 1.4 + i * 0.25, E(P.cloud[i < 2 ? 4 : 5]));
    }
    // wings: brick from parapet to grade
    brickWall(s, WX0, 34, 320 - WX0, GROUND - 34, B, { rng });
    s.rect(WX0 - 1, 32, 321 - WX0, 2, L[4]); s.hline(WX0 - 1, 319, 33, L[2]);
    s.rect(WX0 - 2, 40, 322 - WX0, 4, L[3]); s.hline(WX0 - 2, 319, 40, L[5]); s.hline(WX0 - 2, 319, 43, L[1]);
    for (let x = WX0; x < 320; x += 3) s.px(x, 42, L[2]);
    shadeRect(s, WX0, 44, 320 - WX0, 1, -1);
    quoins(s, WX0, 34, GROUND);
    s.vline(WX0, 34, GROUND - 1, L[4]);
    // windows: classrooms in threes; single stair windows at the half landings
    const r2 = PX.rng('schwin');
    for (let fl = 0; fl < 3; fl++) {
      const wy = FLOOR_Y[fl];
      windowGroup(s, 70, wy, 3, r2, { gold: aft });
      for (const gx of [214, 252, 290]) windowGroup(s, gx, wy, 3, r2, { gold: aft });
    }
    for (const [sx, k] of [[106, 0], [106, 1], [198, 0], [198, 1]]) windowGroup(s, sx, FLOOR_Y[k] + 11, 1, r2, { blind: [0] });
    // water table and basement band with low windows
    shadeRect(s, WX0 + 7, 109, 320 - WX0 - 7, GROUND - 109, -1);
    s.rect(WX0, 108, 320 - WX0, 2, L[4]); s.hline(WX0, 319, 109, L[2]);
    for (const gx of [70, 214, 252, 290]) for (let k = 0; k < 3; k++) {
      const x = gx + k * 11;
      s.rect(x, 113, 9, 5, L[2]); s.rect(x + 1, 114, 7, 3, P.sch_glass[1]); s.hline(x + 1, x + 7, 114, P.sch_glass[2]);
    }
    pavilion(s, aft, rng);
  }

  function pavilion(s, aft, rng) {
    const B = P.sch_brick, L = P.sch_lime, cx = PCX;
    cupola(s, cx, aft);
    brickWall(s, PX0, 22, PX1 - PX0, GROUND - 22, B, { rng, off: 2 });
    // raised centre of the parapet with a blank stone tablet
    brickWall(s, cx - 18, 15, 37, 8, B, { rng });
    s.rect(cx - 19, 13, 39, 2, L[4]); s.hline(cx - 19, cx + 19, 14, L[2]);
    s.rect(cx - 7, 16, 15, 6, L[4]); s.rect(cx - 6, 17, 13, 4, L[3]); s.hline(cx - 6, cx + 6, 17, L[5]);
    s.rect(PX0 - 1, 21, PX1 - PX0 + 2, 2, L[4]); s.hline(PX0 - 1, PX1, 22, L[2]);
    s.rect(PX0 - 2, 40, PX1 - PX0 + 4, 4, L[3]); s.hline(PX0 - 2, PX1 + 1, 40, L[5]); s.hline(PX0 - 2, PX1 + 1, 43, L[1]);
    for (let x = PX0; x < PX1; x += 3) s.px(x, 42, L[2]);
    shadeRect(s, PX0, 44, PX1 - PX0, 1, -1);
    quoins(s, PX0, 22, 110); quoins(s, PX1 - 1, 22, 110, true);
    s.vline(PX0, 22, GROUND - 1, L[5]); s.vline(PX1 - 1, 22, GROUND - 1, L[2]);
    // the pavilion stands proud of the wings: its shadow on the right wing
    const shLen = aft ? 9 : 4;
    shadePoly(s, [[PX1, 23], [PX1 + shLen, 23 + shLen], [PX1 + shLen, GROUND], [PX1, GROUND]], -1);
    // upper windows
    const r2 = PX.rng('schpav');
    windowGroup(s, cx - 15, FLOOR_Y[0], 3, r2, { blind: [0.3, 0, 0.3] });
    windowGroup(s, cx - 15, FLOOR_Y[1], 3, r2, { blind: [0, 0, 0] });
    // the banner: WELCOME BACK TIGERS, plus the S somebody added in marker
    const bx = cx - 27, by = 63;
    s.rect(bx, by, 55, 16, P.cream[4]); s.hline(bx, bx + 54, by, P.cream[5]); s.hline(bx, bx + 54, by + 15, P.cream[2]);
    s.vline(bx, by, by + 15, P.cream[3]); s.vline(bx + 54, by, by + 15, P.cream[2]);
    s.hline(bx + 2, bx + 52, by + 1, P.maroon[3]); s.hline(bx + 2, bx + 52, by + 14, P.maroon[3]);
    for (const fx of [bx + 14, bx + 40]) { s.vline(fx, by + 2, by + 13, P.cream[3]); }
    txt(s, cx + 1, by + 3, 'WELCOME BACK', P.maroon[2], { align: 'center' });
    const tw = txtW('TIGERS');
    const tx = txt(s, cx - 2, by + 9, 'TIGERS', P.maroon[2], { align: 'center' });
    const sx = Math.round(cx - 2 - tw / 2) + tw + 1;
    s.px(sx + 1, by + 8, P.ink[1]); s.px(sx + 2, by + 8, P.ink[1]); s.px(sx, by + 9, P.ink[1]); s.px(sx + 1, by + 10, P.ink[1]);
    s.px(sx + 2, by + 11, P.ink[1]); s.px(sx + 2, by + 12, P.ink[1]); s.px(sx, by + 13, P.ink[1]); s.px(sx + 1, by + 13, P.ink[1]);
    s.px(bx + 1, by - 1, P.metal[3]); s.px(bx + 53, by - 1, P.metal[3]);
    shadeRect(s, bx + 1, by + 16, 55, 1, -1);
    // frieze with the name carved in it (incised: dark cut, lit lower lip)
    s.rect(PX0 + 1, 81, PX1 - PX0 - 2, 10, L[3]); s.hline(PX0 + 1, PX1 - 2, 81, L[5]); s.hline(PX0 + 1, PX1 - 2, 90, L[2]);
    txt(s, cx + 1, 83, 'DERRY HIGH SCHOOL', L[1], { align: 'center', shadow: L[5], sdx: 1, sdy: 1 });
    // entrance: limestone surround, arched fanlight, double oak doors
    s.rect(cx - 17, 91, 35, 19, L[3]); s.vline(cx - 17, 91, 109, L[5]); s.vline(cx + 17, 91, 109, L[2]);
    s.rect(cx - 13, 93, 27, 17, P.wood_dark[1]);
    s.ellipse(cx + 0.5, 99, 13, 6, (x, y) => (y < 99 ? (y < 95 ? P.sch_glass[3] : P.sch_glass[2]) : 0));
    for (let a = -2; a <= 2; a++) s.line(cx, 98, cx + a * 5, 93, L[4]);
    s.hline(cx - 13, cx + 13, 98, L[4]);
    for (const dx of [-12, 1]) {
      const W = P.wood;
      s.rect(cx + dx, 99, 11, 11, W[3]); s.vline(cx + dx, 99, 109, W[4]); s.vline(cx + dx + 10, 99, 109, W[2]);
      s.rect(cx + dx + 3, 101, 5, 4, P.sch_glass[2]); s.hline(cx + dx + 3, cx + dx + 7, 101, P.sch_glass[3]);
      s.hline(cx + dx + 2, cx + dx + 8, 106, P.chrome[3]);
    }
    s.rect(cx - 16, 89, 33, 2, L[4]);
    // the date stone set into the brick beside the door, under the name
    s.rect(cx - 35, 96, 17, 9, L[4]); s.hline(cx - 35, cx - 19, 96, L[5]); s.vline(cx - 19, 97, 104, L[2]); s.hline(cx - 35, cx - 19, 104, L[2]);
    txt(s, cx - 33, 98, '1923', L[1], { shadow: L[5] });
    // limestone base and the cornerstone: 1923
    s.rect(PX0, 110, PX1 - PX0, GROUND - 110, L[3]);
    for (let x = PX0 + 6; x < PX1; x += 12) s.vline(x, 111, GROUND - 1, L[2]);
    s.hline(PX0, PX1 - 1, 110, L[5]); s.hline(PX0, PX1 - 1, 116, L[2]);
  }

  /* a white wooden cupola with louvres, a copper dome and a weathervane */
  function cupola(s, cx, aft) {
    const T = P.trim, C = P.teal;
    s.rect(cx - 9, 6, 19, 8, T[3]); s.vline(cx - 9, 6, 13, T[5]); s.vline(cx + 9, 6, 13, T[1]);
    for (let x = cx - 7; x <= cx + 7; x += 2) s.vline(x, 7, 12, x < cx ? T[1] : T[0]);
    s.rect(cx - 10, 5, 21, 1, T[4]); s.rect(cx - 10, 13, 21, 1, T[2]);
    s.poly([[cx - 9, 5], [cx - 5, 1], [cx + 6, 1], [cx + 10, 5]], C[3]);
    s.line(cx - 9, 5, cx - 5, 1, C[4]); s.hline(cx - 4, cx + 5, 1, C[5]); s.line(cx + 6, 1, cx + 10, 5, C[2]);
    s.vline(cx, -2, 0, P.ink[3]); s.hline(cx - 2, cx + 2, -1, P.ink[3]);
  }

  function extGround(s, aft, rng) {
    const st = P.concrete;
    // lawn and foundation shrubs
    s.grass(WX0 - 2, GROUND, 322 - WX0, 12, P.grass, { rng, density: 0.07, base: 2 });
    s.grass(0, GROUND, WX0, 12, P.grass, { rng, density: 0.07, base: 2 });
    const r2 = PX.rng('schshrub');
    for (const [x0, x1] of [[WX0 + 6, PX0 - 6], [PX1 + 6, 320]]) for (let x = x0; x < x1; x += 13) canopy(s, x + 5, 119, 7, 4, [[P.pine, 3], [P.grass, 2]], { rng: r2, rmin: 2, rmax: 3.2 });
    // the wide front steps between limestone cheek walls
    for (let k = 0; k < 6; k++) {
      const y = 110 + k * 3, x0 = PCX - 22 - k * 3, x1 = PCX + 22 + k * 3;
      s.rect(x0, y, x1 - x0 + 1, 3, st[3]); s.hline(x0, x1, y, st[5]); s.hline(x0, x1, y + 2, st[2]);
    }
    for (const cx of [PCX - 48, PCX + 40]) {
      const L = P.sch_lime;
      s.rect(cx, 117, 9, 11, L[3]); s.hline(cx, cx + 8, 117, L[5]); s.vline(cx + 8, 118, 127, L[2]); s.vline(cx, 118, 127, L[4]);
      s.rect(cx + 3, 105, 3, 12, P.ink[3]); s.vline(cx + 3, 105, 116, P.ink[4]);
      s.rect(cx + 2, 104, 5, 1, P.ink[2]);
      s.circle(cx + 4.5, 101, 3, P.cream[4]); s.px(cx + 3, 100, P.cream[5]); s.px(cx + 4, 99, P.cream[5]);
      shadeRect(s, cx + 1, 128, 10, 1, -1);
    }
    // front walk down to the sidewalk
    s.rect(PCX - 40, 128, 81, 6, st[3]); s.hline(PCX - 40, PCX + 40, 128, st[4]);
    // sidewalk, curb, street
    s.rect(0, 134, 320, 6, st[3]); s.hline(0, 319, 134, st[4]); s.hline(0, 319, 139, st[2]);
    for (let x = 9; x < 320; x += 18) s.vline(x, 135, 138, st[2]);
    s.rect(0, 140, 320, 2, st[4]); s.hline(0, 319, 141, st[2]);
    s.rect(0, 142, 320, 38, P.asphalt[2]);
    s.noise(0, 142, 320, 38, [P.asphalt[1], P.asphalt[3]], 0.05, { rng });
    // the flagpole
    const fx = 103;
    s.rect(fx - 4, 124, 9, 4, st[3]); s.hline(fx - 4, fx + 4, 124, st[4]); s.hline(fx - 4, fx + 4, 127, st[2]);
    s.vline(fx, 5, 124, P.chrome[4]); s.vline(fx + 1, 5, 124, P.chrome[2]);
    s.rect(fx, 3, 2, 2, P.mustard[4]);
    flag(s, fx + 2, 6, aft);
    // fallen leaves
    const fall = [P.leaf_orange[3], P.leaf_orange[4], P.leaf_red[3], P.leaf_gold[4], P.leaf_gold[3]];
    for (let i = 0; i < 80; i++) {
      const x = rng.int(0, 319), y = GROUND + rng.int(0, 17);
      if (x > PCX - 40 && x < PCX + 40 && y < 128) continue;
      const c = fall[rng.int(0, fall.length - 1)];
      s.px(x, y, c); if (rng() < 0.6) s.px(x + 1, y, SH(c, -1));
    }
  }

  function flag(s, x, y, aft) {
    const w = 16, h = 10, ph = aft ? 1.2 : 0;
    for (let xx = 0; xx < w; xx++) {
      const wv = Math.sin(xx * 0.5 + ph), dy = Math.round(wv * 0.8 * (xx / w));
      for (let yy = 0; yy < h; yy++) {
        let c = (Math.floor((yy * 11) / h) % 2) ? P.white_cloth[4] : P.red[3];
        if (xx < 7 && yy < 5) c = (xx + yy) % 2 === 0 && xx > 0 && yy > 0 && xx < 6 && yy < 4 ? P.white_cloth[5] : P.navy[3];
        s.px(x + xx, y + yy + dy, wv < -0.45 ? SH(c, -1) : c);
      }
    }
  }

  function extTrees(s, aft, rng) {
    const K = P.bark;
    // the big maple, foreground left
    trunk(s, 0, 46, 134, 10, K);
    s.poly([[6, 60], [22, 40], [27, 41], [9, 64]], K[2]); s.line(7, 60, 23, 40, K[3]);
    s.poly([[2, 64], [-4, 54], [-1, 52], [5, 60]], K[2]);
    canopy(s, 18, 17, 44, 30, MAPLE, { rng: PX.rng('schmapleA'), rmin: 3.2, rmax: 5.6 });
    canopy(s, 47, 37, 15, 10, MAPLE, { rng: PX.rng('schmapleB'), rmin: 2.8, rmax: 4 });
    // a young maple on the lawn, right
    trunk(s, 300, 72, 130, 5, K);
    s.line(302, 84, 292, 72, K[2]); s.line(303, 84, 293, 72, K[1]); s.line(303, 80, 312, 70, K[2]);
    canopy(s, 302, 53, 22, 26, MAPLE, { rng: PX.rng('schmapleC'), rmin: 2.8, rmax: 4.6 });
  }


  function extBus(s, x, y, aft) {
    const Y = P.sch_bus;
    // a conventional school bus at the curb, nose right
    s.rect(x, y, 62, 17, Y[3]);
    s.hline(x + 1, x + 61, y, Y[4]); s.hline(x, x + 62, y + 1, Y[4]); s.vline(x, y + 1, y + 16, Y[4]);
    s.rect(x + 62, y + 7, 12, 10, Y[3]); s.hline(x + 62, x + 72, y + 7, Y[4]); s.vline(x + 73, y + 8, y + 16, Y[2]);
    s.rect(x + 73, y + 12, 2, 4, P.chrome[3]);
    s.rect(x + 71, y + 9, 2, 2, P.chrome[5]);
    // windows, door, windshield
    for (let wx = x + 3; wx < x + 50; wx += 6) { s.rect(wx, y + 3, 5, 5, P.sch_glass[2]); s.hline(wx, wx + 4, y + 3, P.sch_glass[3]); s.px(wx, y + 3, P.sch_glass[4]); }
    s.rect(x + 52, y + 3, 5, 12, P.sch_glass[1]); s.vline(x + 54, y + 3, y + 14, Y[2]);
    s.rect(x + 58, y + 3, 4, 6, P.sch_glass[2]); s.px(x + 58, y + 3, P.sch_glass[4]);
    // black rub rails and the lettering between them
    s.hline(x, x + 62, y + 10, P.ink[3]); s.hline(x, x + 74, y + 14, P.ink[3]);
    txt(s, x + 26, y + 11, 'SCHOOL BUS', P.ink[2], { align: 'center', space: 2 });
    s.px(x + 2, y + 1, P.red[4]); s.px(x + 59, y + 1, P.red[4]);
    s.rect(x - 1, y + 9, 2, 6, P.ink[2]);
    // wheels
    for (const wx of [x + 12, x + 64]) { s.circle(wx + 0.5, y + 17.5, 3.5, P.ink[1]); s.rect(wx, y + 17, 2, 2, P.chrome[2]); }
    shadeRect(s, x - 1, y + 20, 78, 2, -1);
  }

  /* time of day: the morning is cool and short-shadowed; the afternoon sun is
   * low and gold, the shadows long */
  function extLight(s, aft) {
    if (aft) {
      // low gold sun from the left: long shadows reaching right across the lawn
      shadeFn(s, 4, GROUND + 1, 144, 134, (x, y) => ((x - 74) ** 2) / 4900 + ((y - 128.5) ** 2) / 22 < 1, -1);
      shadeFn(s, 297, GROUND + 1, 319, 134, (x, y) => ((x - 330) ** 2) / 900 + ((y - 128) ** 2) / 16 < 1, -1);
      // the big maple's shade climbing the left corner of the building, clumped
      shadeFn(s, WX0, 71, WX0 + 29, GROUND, (x, y) => ((x - WX0 + 6) ** 2) / 600 + ((y - 106) ** 2) / 900 + 0.25 * Math.sin(x * 0.7) * Math.sin(y * 0.5) < 1, -1);
      shadePoly(s, [[104, 127], [176, 133.5], [170, 133.5], [103, 128]], -1);              // flagpole
      for (const lx of [PCX - 44, PCX + 44]) shadePoly(s, [[lx, 128], [lx + 24, 133.5], [lx + 20, 133.5], [lx - 1, 128]], -1);
      lightPoly(s, 'sun', [[WX0, 0], [320, 0], [320, GROUND], [WX0, GROUND]], 0.55);
      lightPoly(s, 'sun', [[0, 60], [WX0, 60], [WX0, 122], [0, 122]], 0.35);
      lightPoly(s, 'sun', [[0, GROUND], [320, GROUND], [320, 135], [0, 135]], 0.4);
    } else {
      shadeFn(s, 0, GROUND + 1, 66, 134, (x, y) => ((x - 28) ** 2) / 1400 + ((y - 128) ** 2) / 14 < 1, -1);
      shadePoly(s, [[104, 127], [124, 132], [120, 132], [103, 128]], -1);
      for (const lx of [PCX - 44, PCX + 44]) shadePoly(s, [[lx, 128], [lx + 7, 130], [lx + 5, 130], [lx - 1, 128]], -1);
      // crisp, cool morning: blue in the shade and over the far yard
      lightPoly(s, 'cool', [[0, 58], [WX0, 58], [WX0, 112], [0, 112]], 0.22);
      lightPoly(s, 'cool', [[PX1, 23], [PX1 + 4, 27], [PX1 + 4, GROUND], [PX1, GROUND]], 0.5);
    }
  }


  /* ================================================================== */
  /* HALLWAY                                                             */
  /* Looking down the first-floor hall to the window at the end. Lockers  */
  /* on the left (odd numbers: 225, 227 — Gus's, dented at knee height —  */
  /* 229 Sloane's, 231 Teddy's), the bulletin board and a classroom door  */
  /* on the right, the trophy case at the far end, Mr. Teague's mop       */
  /* bucket. empty_night: lights off, the EXIT sign, moonlight down the   */
  /* waxed floor.                                                         */
  /* ================================================================== */
  const HC = Cam(160, 62, 165, 5.2), HXL = -8, HXR = 8, HH = 10.5, HZB = 30;
  const hP = HC.p;
  const hRW = (z0, z1, y0, y1, X = HXR) => [hP(X, y1, z0), hP(X, y1, z1), hP(X, y0, z1), hP(X, y0, z0)];
  const hLW = (z0, z1, y0, y1, X = HXL) => [hP(X, y1, z0), hP(X, y1, z1), hP(X, y0, z1), hP(X, y0, z0)];
  const hBW = (x0, x1, y0, y1, Z = HZB) => [hP(x0, y1, Z), hP(x1, y1, Z), hP(x1, y0, Z), hP(x0, y0, Z)];
  const hYon = (y, Z) => HC.eye - ((y - HC.vy) * Z) / HC.f;
  const LOCK0 = 8.0, LOCKW = 1.4, LOCKN = 10;
  const MOON_T = 0.36;                     // moonlight drop per foot (low moon: long light)
  const WIN = { x0: -3.5, x1: 3.5, y0: 2.8, y1: 9.6 };
  const hash2 = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  PX.bg('school_hall', {
    times: ['day', 'empty_night'],
    preset: { day: 'fluorescent' },
    light: { day: 'fluorescent' },
    draw(s, o) {
      const night = o.time === 'empty_night';
      hallCeiling(s, night);
      hallBack(s, night, o.rng);
      hallLeft(s, night);
      hallRight(s, night, o.rng);
      hallFloor(s, night);
      hallProps(s, night);
      hallLight(s, night);
    }
  });

  function hallCeiling(s, night) {
    const W = P.white, f = HC.f, fixLo = night ? P.metal[2] : P.chrome[3], fixA = night ? P.metal[3] : E(W[5]), fixB = night ? P.metal[3] : E(W[4]);
    floorPass(s, HC, HXL, HXR, 3, HZB, (x, y, X, Z) => {
      const pxw = Z / f;
      for (const z0 of [15.5, 22.5]) if (Z > z0 && Z < z0 + 3.4 && X > -1.1 && X < 1.1) {
        const edge = X < -1.1 + pxw * 1.2 || X > 1.1 - pxw * 1.2 || Z < z0 + pxw * 3 || Z > z0 + 3.4 - pxw * 3;
        return edge ? fixLo : (X > -0.4 && X < 0.4 ? fixA : fixB);
      }
      const gx = Math.abs(((X + 100) % 2) - 1) > 1 - pxw * 1.1, gz = Z % 2 < pxw * 3;
      return gx || gz ? P.paper[2] : P.paper[3];
    }, HH);
    s.line(...hP(HXL, HH, 3), ...hP(HXL, HH, HZB), P.paper[1]);
    s.line(...hP(HXR, HH, 3), ...hP(HXR, HH, HZB), P.paper[1]);
  }

  function hallBack(s, night, rng) {
    const C = P.wall_cream;
    s.poly(hBW(HXL, HXR, 0, HH), C[3]);
    s.poly(hBW(HXL, HXR, 6.9, 7.2), P.maroon[3]);
    // the window at the end of the hall
    const [x0, y0] = hP(WIN.x0, WIN.y1, HZB), [x1, y1] = hP(WIN.x1, WIN.y0, HZB);
    const X0 = Math.round(x0), Y0 = Math.round(y0), X1 = Math.round(x1), Y1 = Math.round(y1);
    s.rect(X0 - 2, Y0 - 2, X1 - X0 + 4, Y1 - Y0 + 4, P.trim[2]);
    if (!night) {
      s.vgrad(X0, Y0, X1 - X0, Y1 - Y0, [E(P.sky_day[3]), E(P.sky_day[4]), E(P.sky_day[5])], 2);
      // the top of a maple outside, and the roofline across the way
      const r2 = PX.rng('hallwin');
      for (let x = X0; x < X1; x += 4) s.ellipse(x + 2, Y1 - 9 + r2.int(0, 2), 3, 2.5, E(P.sch_far[3]));
      s.rect(X0, Y1 - 8, X1 - X0, 8, E(P.sch_far[3]));
      s.rect(X0 + 4, Y1 - 12, 14, 12, E(P.sch_far[2])); s.rect(X0 + 3, Y1 - 13, 16, 1, E(P.sch_far[1]));
      s.clip([X0, Y0, X1 - X0, Y1 - Y0], () => canopy(s, X1 - 9, Y1 - 4, 11, 8, [[P.leaf_red, 1], [P.leaf_orange, 2], [P.leaf_gold, 2]], { rng: r2, rmin: 2, rmax: 3 }));
    } else {
      s.vgrad(X0, Y0, X1 - X0, Y1 - Y0, [E(P.sky_night[2]), E(P.sky_night[3]), E(P.sky_night[4])], 2);
      s.circle(X0 + 10, Y0 + 7, 3.2, E(P.cloud[5])); s.px(X0 + 11, Y0 + 6, E(P.cloud[3]));
      s.rect(X0, Y1 - 8, X1 - X0, 8, E(P.sky_night[1]));
      for (let x = X0; x < X1; x += 5) s.rect(x, Y1 - 10 + ((x * 7) % 3), 3, 3, E(P.sky_night[1]));
    }
    // steel sash: two columns, three rows
    const mx = Math.round((X0 + X1) / 2);
    s.vline(mx, Y0, Y1 - 1, P.trim[3]);
    for (const k of [1, 2]) s.hline(X0, X1 - 1, Math.round(Y0 + ((Y1 - Y0) * k) / 3), P.trim[3]);
    s.rect(X0 - 3, Y1 + 1, X1 - X0 + 6, 2, P.trim[4]);
    // radiator under it
    const [rx0, ry0] = hP(-3, 2.2, HZB), [rx1, ry1] = hP(3, 0.4, HZB);
    s.rect(rx0, ry0, rx1 - rx0, ry1 - ry0, P.metal[3]);
    for (let x = Math.round(rx0) + 1; x < rx1 - 1; x += 2) s.vline(x, Math.round(ry0) + 1, Math.round(ry1) - 1, P.metal[2]);
    s.hline(Math.round(rx0), Math.round(rx1) - 1, Math.round(ry0), P.metal[4]);
  }

  /* left wall: painted plaster over a run of olive lockers, then a door */
  function hallLeft(s, night) {
    const L = P.sch_locker, C = P.wall_cream, f = HC.f;
    const lockEnd = LOCK0 + LOCKW * LOCKN;
    wallPass(s, HC, HXL, 3, HZB, 0, HH, (x, y, Y, Z) => {
      if (Y > 6.9 && Y < 7.2) return P.maroon[2];
      if (Z >= LOCK0 && Z < lockEnd && Y < 6.75) return lockerPx(Z, Y, x, y);
      if (Z >= 23 && Z < 26.2 && Y < 7.4) return doorPx(Z, Y, 23, 26.2, x, y, night);
      if (Y < 0.4) return P.wood_dark[2];
      return C[Y > 7.2 ? 3 : 2];
    });
    // locker numbers on the plates of the nearest three
    for (let k = 0; k < 2; k++) {
      const Zc = LOCK0 + LOCKW * (k + 0.53);
      txt(s, HC.x(HXL, Zc), HC.y(5.42, Zc) - 2, String(225 + k * 2), P.ink[2], { align: 'center' });
    }
  }

  function lockerPx(Z, Y, x, y) {
    const L = P.sch_locker;
    const k = Math.floor((Z - LOCK0) / LOCKW), u = (Z - LOCK0) / LOCKW - k;
    const wpx = (LOCKW * HC.f * 8) / (Z * Z);                    // locker width on screen
    const g = Math.max(0.05, 1.05 / wpx);
    if (Y > 6.55) return L[1];                                   // shadowed top
    if (Y < 0.35) return L[1];                                   // base
    if (u < g) return L[0];                                      // gap between doors
    if (u < g * 2.1) return L[4];                                // lit door edge
    let base = 3;
    if ((k === 4 || k === 7)) base = 2;                          // repainted a shade darker
    // vents at top and bottom
    if (wpx > 7 && u > 0.22 && u < 0.82 && ((Y > 5.8 && Y < 6.3) || (Y > 0.65 && Y < 1.15))) {
      const row = Math.floor((Y % 0.5) / 0.125);
      if (row % 2 === 0) return L[1];
    }
    // number plate and handle
    if (wpx > 7 && Y > 5.22 && Y < 5.62 && u > 0.16 && u < 0.9) return Y < 5.27 || Y > 5.57 ? P.chrome[2] : P.chrome[4];
    if (Y > 3.0 && Y < 3.85 && u > 0.76 && u < 0.88) return Y < 3.1 ? P.chrome[5] : P.chrome[3];
    // locker 227: dented at knee height, kicked by generations
    if (k === 1) {
      const dx = (u - 0.5) / 0.26, dy = (Y - 2.15) / 0.5, d = dx * dx + dy * dy + 0.18 * Math.sin(u * 23) * Math.sin(Y * 9);
      if (d < 1) return d > 0.55 && dy > 0 ? L[4] : d > 0.55 ? L[1] : L[2];
    }
    if (k === 5 && u > 0.3 && u < 0.6 && Y > 1.2 && Y < 1.6) return L[2];      // another scuff
    if (k === 3 && u > 0.4 && u < 0.62 && Y > 4.3 && Y < 4.8) return P.red[4];   // a sticker
    if (k === 6 && u > 0.3 && u < 0.55 && Y > 4.6 && Y < 5.0) return P.sky_day[3];
    return L[Y < 1.4 ? base - 1 : base];
  }

  /* a classroom door seen side-on in a wall: wood leaf, wired-glass window */
  function doorPx(Z, Y, z0, z1, x, y, night) {
    const u = (Z - z0) / (z1 - z0), W = P.wood_pale;
    if (Y > 7.05) return P.trim[2];                               // head casing
    if (u < 0.08 || u > 0.92) return P.trim[u < 0.08 ? 3 : 1];    // side casings
    if (u > 0.28 && u < 0.72 && Y > 3.9 && Y < 6.4) {             // wired glass
      if (((x + y) % 3 === 0) || ((x - y + 300) % 3 === 0)) return P.sch_wire[night ? 2 : 4];
      return night ? E(P.sky_night[2]) : P.sch_glass[3];
    }
    if (u > 0.78 && u < 0.86 && Y > 3.1 && Y < 3.5) return P.chrome[4];
    return W[Y < 0.6 ? 2 : 3];
  }

  /* right wall: glazed tile wainscot, cream plaster, the bulletin board, a
   * classroom door, the drinking fountain, the trophy case at the far end */
  function hallRight(s, night, rng) {
    const C = P.wall_cream, T = P.wall_green, f = HC.f;
    wallPass(s, HC, HXR, 3, HZB, 0, HH, (x, y, Y, Z) => {
      if (Z >= 15.6 && Z < 18.8 && Y < 7.4) return doorPx(Z, Y, 15.6, 18.8, x, y, night);
      if (Y > 6.9 && Y < 7.2) return P.maroon[2];
      if (Y < 0.4) return P.wood_dark[2];
      if (Y < 4.0) {
        const pz = Z / f;
        const gy = (Y % 0.5) < pz * 3.2, gz = (Z % 0.5) < pz * 2.2 * (Z / 9);
        return gy || gz ? T[2] : T[Y < 3.85 ? 3 : 4];
      }
      if (Y < 4.18) return T[4];
      return C[Y > 7.2 ? 3 : 2];
    });
    // room number beside the door
    const [nx, ny] = hP(HXR, 5.6, 15.1);
    s.rect(nx - 2, ny - 2, 4, 4, P.ink[3]); s.px(nx - 1, ny - 1, P.white[3]);
    // the bulletin board (perspective), flyers on it
    bulletin(s, night);
    // the drinking fountain past the door, a fire alarm and an extinguisher
    s.poly(hRW(19.4, 20.4, 2.4, 3.3, HXR - 0.01), P.chrome[3]);
    s.poly(hRW(19.4, 20.4, 3.15, 3.3, HXR - 0.01), P.chrome[5]);
    s.poly(hRW(19.6, 20.2, 1.0, 2.4, HXR - 0.01), P.chrome[2]);
    s.poly(hRW(14.75, 15.05, 4.5, 5.15, HXR - 0.01), P.red[3]); s.poly(hRW(14.75, 15.05, 5.0, 5.15, HXR - 0.01), P.red[5]);
    s.poly(hRW(21.0, 21.6, 1.6, 3.6, HXR - 0.01), P.red[2]); s.poly(hRW(21.05, 21.4, 2.0, 3.3, HXR - 0.02), P.red[4]);
    // trophy case: a glass cabinet standing against the far right wall
    trophyCase(s, night, rng);
  }

  function bulletin(s, night) {
    const z0 = 8.45, z1 = 14.2, y0 = 3.3, y1 = 6.85, Xb = HXR - 0.02;
    s.poly(hRW(z0 - 0.14, z1 + 0.14, y0 - 0.16, y1 + 0.16, Xb), P.wood[2]);
    s.poly(hRW(z0 - 0.14, z1 + 0.14, y1 + 0.06, y1 + 0.16, Xb), P.wood[4]);
    s.poly(hRW(z0, z1, y0, y1, Xb), P.sch_cork[3]);
    for (let i = 0; i < 90; i++) {
      const zz = z0 + hash2(i, 3) * (z1 - z0), yy = y0 + hash2(i, 7) * (y1 - y0), [px, py] = hP(Xb, yy, zz);
      if (s.get(px, py) === P.sch_cork[3]) s.px(px, py, P.sch_cork[hash2(i, 11) < 0.5 ? 2 : 4]);
      if (s.get(px + 1, py) === P.sch_cork[3]) s.px(px + 1, py, P.sch_cork[hash2(i, 13) < 0.5 ? 2 : 3]);
    }
    // THE LANTERN SOCIETY: cream flyer with a lantern, nearest
    slantText(s, 'LANTERN', Xb, 6.38, 8.6, 10.95, P.ink[3], P.paper, 4, [6.62, 3.55]);
    slantText(s, 'SOCIETY', Xb, 5.86, 8.6, 10.95, P.ink[3], null);
    const [lx, ly] = hP(Xb, 4.7, 9.75);
    s.rect(lx - 2, ly - 3, 5, 6, P.mustard[3]); s.vline(lx - 2, ly - 3, ly + 2, P.mustard[4]); s.vline(lx + 2, ly - 3, ly + 2, P.mustard[2]);
    s.rect(lx - 1, ly - 2, 3, 4, P.lamp[4]); s.px(lx, ly - 1, P.lamp[5]);
    s.hline(lx - 1, lx + 1, ly - 4, P.mustard[2]); s.px(lx, ly - 5, P.mustard[2]); s.hline(lx - 3, lx + 3, ly + 3, P.mustard[1]);
    // CANAL DAYS: yellow, farther along
    slantText(s, 'CANAL', Xb, 6.4, 11.15, 14.0, P.maroon[2], P.yellow, 4, [6.68, 4.1]);
    slantText(s, 'DAYS', Xb, 5.85, 11.15, 14.0, P.maroon[2], null);
    slantText(s, 'OCT 11', Xb, 5.05, 11.15, 14.0, P.ink[3], null);
    // a lined notice tacked on below
    s.poly(hRW(11.4, 13.0, 3.45, 4.0, Xb - 0.01), P.white_cloth[4]);
    s.poly(hRW(11.55, 12.85, 3.72, 3.78, Xb - 0.02), P.white_cloth[2]);
    for (const [zz, yy, c] of [[8.75, 6.55, P.red[4]], [11.3, 6.6, P.sky_day[2]], [12.5, 3.92, P.leaf_gold[4]]]) { const [px, py] = hP(Xb, yy, zz); s.px(px, py, c); }
  }

  /* text on the right wall between depths za..zb, baseline height Y; each glyph
   * column is dropped along the wall's slope. bg: optional flyer ramp drawn
   * first from y-top..y-bottom (yr = [top, bottom]) */
  function slantText(s, str, X, Y, za, zb, col, bg, sh, yr) {
    if (bg) { s.poly(hRW(za, zb, yr[1], yr[0], X - 0.01), bg[sh]); s.poly(hRW(za, zb, yr[0] - 0.1, yr[0], X - 0.01), bg[Math.min(5, sh + 1)]); s.poly(hRW(za, zb, yr[1], yr[1] + 0.08, X - 0.01), bg[sh - 2]); }
    const zc = (za + zb) / 2, [cx, cy] = hP(X, Y, zc);
    const tmp = new PX.Surf(40, 7);
    const w = txt(tmp, 0, 1, str, 1, {});
    const [ax, ay] = hP(X, Y, za), [bx, by] = hP(X, Y, zb), slope = (by - ay) / (bx - ax);
    const x0 = Math.round(cx - w / 2);
    for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < w; xx++) if (tmp.d[yy * 40 + xx]) s.px(x0 + xx, Math.round(cy - 3 + yy + (x0 + xx - cx) * slope), col);
  }

  function trophyCase(s, night, rng) {
    const X0 = HXR - 1.6, z0 = 21.5, z1 = 27.5, y0 = 0.5, y1 = 6.5, W = P.wood;
    // top and base slabs, the glass front, the near end panel
    s.poly([hP(X0, y1, z0), hP(HXR, y1, z0), hP(HXR, y1, z1), hP(X0, y1, z1)], W[4]);
    s.poly(hLW(z0, z1, y0, y1, X0), W[2]);
    s.poly(hLW(z0 + 0.15, z1 - 0.15, y0 + 0.5, y1 - 0.3, X0), night ? P.sch_glass[1] : P.sch_glass[3]);
    s.poly(hBW(X0, HXR, y0, y1, z0), W[3]);
    s.poly(hBW(X0 + 0.15, HXR - 0.15, y0 + 0.5, y1 - 0.3, z0), night ? P.sch_glass[1] : P.sch_glass[4]);
    // shelves and trophies glinting behind the glass
    for (const sy of [2.2, 3.9, 5.5]) {
      s.line(...hP(X0, sy, z0 + 0.15), ...hP(X0, sy, z1 - 0.15), W[1]);
      s.line(...hP(X0 + 0.15, sy, z0), ...hP(HXR - 0.15, sy, z0), W[1]);
      for (let zz = z0 + 0.6; zz < z1 - 0.4; zz += 0.9) {
        const [tx, ty] = hP(X0 + 0.5, sy, zz), hgt = Math.max(2, Math.round(3.4 - zz * 0.05));
        s.vline(tx, ty - hgt, ty - 1, night ? P.mustard[2] : P.mustard[4]);
        if (rng() < 0.5) s.px(tx, ty - hgt - 1, night ? P.mustard[1] : P.yellow[5]);
      }
      const [ex, ey] = hP(X0 + 0.8, sy, z0);
      s.rect(ex - 2, ey - 4, 2, 4, night ? P.mustard[2] : P.mustard[4]); s.px(ex - 1, ey - 5, night ? P.mustard[2] : P.yellow[5]);
      s.rect(ex + 2, ey - 3, 2, 3, night ? P.chrome[1] : P.chrome[4]);
    }
    // a pennant on the wall above it
    const [p0x, p0y] = hP(HXR, 8.3, 23), [p1x, p1y] = hP(HXR, 7.6, 26.5);
    s.poly([[p0x, p0y - 3], [p0x, p0y + 2], [p1x, p1y]], P.maroon[3]);
  }

  function hallFloor(s, night) {
    const V = P.sch_vct, V2 = P.sch_vct2, f = HC.f;
    const [wx0] = hP(WIN.x0, 0, HZB), [wx1] = hP(WIN.x1, 0, HZB), wcx = (wx0 + wx1) / 2, whw = (wx1 - wx0) / 2;
    const yr = HC.vy + (f * (HC.eye + WIN.y0)) / HZB, T = 1.25;
    const streak = new Float32Array(320); for (let x = 0; x < 320; x++) streak[x] = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(x * 0.9 + 1.3));
    floorPass(s, HC, HXL, HXR, 3, HZB, (x, y, X, Z) => {
      const i = Math.floor(X / T + 100), j = Math.floor(Z / T);
      const pz = (Z * Z) / (f * HC.eye);
      const border = X > 6.25 || X < -6.25;
      let sh = 4, ramp = (i + j) & 1 ? V : V2;
      if (border) { ramp = V2; sh = 3; }
      else if (hash2(i, j) < 0.07) sh = 3;
      if (Z < 19 && ((Z % T) < pz * 1.05 || ((X / T + 100) % 1) < (Z / f) / T * 1.05)) sh--;
      if (!night && y > yr) {
        const dxn = Math.abs(x - wcx) / (whw * (1 + (y - yr) / 60)), fall = 1 - (y - yr) / 70;
        if (fall > 0 && dxn < 1) { const a = fall * (1 - dxn * dxn) * streak[x], b = PX.bayer(x, y); if (b < a * 1.4) sh++; if (b < a * 0.5) sh++; }
      }
      return ramp[sh > 5 ? 5 : sh];
    });
    s.line(...hP(HXL, 0, 8), ...hP(HXL, 0, HZB), V2[1]);
    s.line(...hP(HXR, 0, 8), ...hP(HXR, 0, HZB), V2[1]);
  }

  function hallProps(s, night) {
    // Mr. Teague's mop bucket, left down the hall
    const bz = 19.5, bxw = 2.2;
    const [bx, by] = hP(bxw, 0, bz), k = HC.k(bz);
    const bw = Math.round(1.3 * k), bh = Math.round(1.1 * k);
    s.rect(bx - bw / 2, by - bh, bw, bh, P.yellow[3]); s.hline(bx - bw / 2, bx + bw / 2 - 1, by - bh, P.yellow[4]);
    s.vline(Math.round(bx + bw / 2 - 1), by - bh, by - 1, P.yellow[2]);
    s.rect(bx - 2, by - bh - 3, 5, 3, P.metal[2]);              // wringer
    s.line(bx + 1, by - bh - 3, bx + 5, by - Math.round(5.2 * k), P.wood_pale[3]);   // mop handle
    s.px(bx - bw / 2 + 1, by, P.ink[2]); s.px(bx + bw / 2 - 2, by, P.ink[2]);
    shadeRect(s, bx - bw / 2 - 1, by, bw + 2, 1, -1);
    // the EXIT sign hanging from the ceiling
    const [ex, ey] = hP(0, 9.55, 13), ek = HC.k(13);
    const ew = 21, eh = 9, ex0 = Math.round(ex - ew / 2), ey0 = Math.round(ey);
    s.vline(Math.round(ex), 0, ey0 - 1, P.metal[2]);
    s.rect(ex0, ey0, ew, eh, P.white[2]); s.rect(ex0 + 1, ey0 + 1, ew - 2, eh - 2, night ? E(P.neon[0]) : P.white[3]);
    txt(s, ex, ey0 + 2, 'EXIT', night ? E(P.neon[4]) : P.red[3], { align: 'center' });
    if (night) s.light('red', ex, ey0 + 4, 34, 22, 0.55);
    // the clock above the bulletin board
    const [cx, cy] = hP(HXR, 8.2, 10.4), ck = HC.k(10.4);
    s.ellipse(cx, cy, 4.5, 7, P.ink[3]); s.ellipse(cx - 0.5, cy, 3.5, 6, P.white[4]);
    s.vline(Math.round(cx - 1), Math.round(cy) - 4, Math.round(cy), P.ink[2]); s.line(cx - 1, cy, cx + 1, cy + 2, P.ink[2]);
  }

  function hallLight(s, night) {
    if (!night) {
      // fluorescent pools on the floor and daylight from the end window
      for (const z of [17, 24]) { const [lx, ly] = hP(0, 0, z); s.light('white', lx, ly, 70 * 12 / z, 14 * 12 / z, 0.3); }
      const [wx, wy] = hP(0, 0, HZB - 2);
      s.light('sun', wx, wy, 40, 10, 0.5);
      return;
    }
    // moonlight through the end window, long down the floor; the sash bars
    // cast the long shadows. Computed per floor pixel from the moon's slope.
    const L = s.L.cool || (s.L.cool = new Float32Array(s.w * s.h)), f = HC.f;
    const midY = [WIN.y0 + (WIN.y1 - WIN.y0) / 3, WIN.y0 + (2 * (WIN.y1 - WIN.y0)) / 3];
    floorPass(s, HC, WIN.x0, WIN.x1, 3, HZB, (x, y, X, Z) => {
      const h = (HZB - Z) * MOON_T;
      if (h < WIN.y0 || h > WIN.y1 || X < WIN.x0 || X > WIN.x1) return 0;
      const pz = (Z * Z) / (f * HC.eye) * MOON_T;               // height step per pixel row
      if (Math.abs(X) < Math.max(0.18, Z / f)) return 0;         // the vertical bar
      for (const my of midY) if (Math.abs(h - my) < Math.max(0.16, pz * 0.8)) return 0;
      // the mop bucket and its handle throw long shadows toward us
      if (Math.abs(X - 2.2) < 0.65 && Z < 19.5 && h < 1.1 + (19.5 - Z) * 0 + 1.1) return 0;
      if (Math.abs(X - 2.2 - (19.5 - Z) * 0.02) < Math.max(0.12, Z / f) && Z < 19.5 && Z > 19.5 - 5.2 / MOON_T) return 0;
      L[y * s.w + x] += 1.1 * (0.55 + 0.45 * Math.min(1, (Z - 4) / 20));
      return 0;
    });
    const [wx, wy] = hP(0, 6, HZB);
    s.light('cool', wx, wy, 34, 30, 0.45);
  }
})();
