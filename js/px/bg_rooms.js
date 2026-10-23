/* What Derry Keeps — school and town interiors, pixel art.
 *   classroom   Room 114, Ms. Whitcomb's English         day (+ board_blank)
 *   library     the library reading room                  day, evening
 *   boiler      the boiler room under the gym             dim (+ wall)
 *   cafeteria   Derry High cafeteria                      day
 *   diner       Dot's Diner                               day, afternoon
 *   records     Low Tide Records                          day
 *
 * Built on the one-point Room and box helpers from bg_homes.js (PX.HOME):
 * world x/y are back-wall pixels, d is depth toward the viewer.
 */
(function () {
  'use strict';
  const P = PX.P, E = PX.E, SH = PX.sh, R = PX.ramp, H = PX.HOME;
  const rnd = Math.round, flo = Math.floor;
  const cl = (r, s) => r[Math.max(0, Math.min(r.length - 1, s))];
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const { Room, box, text, textW, shadePoly, shadeRect, band } = H;

  R('board', ['#0c1612', '#14231c', '#1d3127', '#283f32', '#36503f', '#4a6650']);       // chalkboard slate
  R('chalk', ['#5e6a62', '#7f8b82', '#a0aaa2', '#bfc7c0', '#d9dfda', '#f0f3ef']);
  R('block', ['#3e3a33', '#6a6457', '#968e7b', '#bab19b', '#d6cdb6', '#ebe4d0']);       // painted cinder block
  R('dado', ['#1f2a27', '#33443e', '#4a5f56', '#627b70', '#7e978a', '#a0b5a8']);
  R('vct', ['#3c3832', '#625c52', '#8a8374', '#aea693', '#cbc4b0', '#e2dccb']);         // vinyl floor tile
  R('seat', ['#101a2e', '#1b2b4a', '#283f6a', '#36578c', '#4d74aa', '#7096c6']);        // desk-chair plastic
  R('cork', ['#3a2414', '#61401f', '#8a5f30', '#ad7f45', '#c99d60', '#e0bd86']);
  R('apple', ['#2e070c', '#5a0f16', '#8c1a20', '#bb2a2a', '#dd4a3a', '#f47a5a']);

  /* big chalky letters: the 3×5 font at k× size */
  const TXT = new PX.Surf(200, 8);
  function bigText(s, x, y, str, c, k = 2, o = {}) {
    TXT.d.fill(0);
    const w = text(TXT, 0, 1, str, 1, o);
    for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < w + 2; xx++) if (TXT.get(xx, yy)) s.rect(x + xx * k, y + (yy - 1) * k, k, k, typeof c === 'function' ? c(xx, yy) : c);
    return w * k;
  }
  const textC = (s, cx, y, str, c, o) => text(s, rnd(cx - textW(str) / 2), y, str, c, o);

  /* cinder-block wall texture at wall coords (u along, v up/down) */
  const blockAt = (u, v, r, sh) => {
    const row = flo(v / 6), off = row & 1 ? 7 : 0, col = flo((u + off) / 14);
    const fu = ((u + off) % 14 + 14) % 14, fv = ((v % 6) + 6) % 6;
    if (fv < 1 || fu < 1) return cl(r, sh - 1);
    const h = hash(col, row);
    return cl(r, sh + (h < 0.12 ? -1 : 0) + (fv < 2 && fu > 2 && h > 0.7 ? 1 : 0));
  };


  /* vinyl tile floor: size in world px, every other tile faintly speckled */
  function vctFloor(s, rm, size, o = {}) {
    const r = o.ramp || P.vct;
    s.poly(o.poly || rm.floor, (x, y) => {
      const q = rm.onFloor(x, y), k = q[2], w = 0.8 / k, u = q[0], d = q[1];
      const tu = flo(u / size), td = flo(d / size), fu = ((u % size) + size) % size, fd = ((d % size) + size) % size;
      if (fu < w || fd < w * 1.6) return r[3];
      const alt = (tu + td) & 1, h = hash(x * 7 + 3, y * 13 + 1);
      if (o.checker && alt) return h < 0.03 ? o.checker[2] : o.checker[3];
      let c = alt && PX.bayer(x, y) < 0.22 ? r[3] : r[4];
      if (h < 0.025) c = r[3]; else if (h > 0.992) c = r[5];
      return c;
    });
  }

  /* ================================================================== */
  /* CLASSROOM — Room 114                                                */
  /* ================================================================== */
  PX.bg('classroom', {
    times: ['day'],
    variants: ['board_blank'],
    draw(s, o) { classroom(s, o); }
  });

  function classroom(s, o) {
    const blank = o.variant === 'board_blank';
    const rm = Room({ vx: 160, vy: 58, bx0: 46, by0: 14, bx1: 274, by1: 100, z0: 200 });
    const { bx0, bx1, by0, by1 } = rm, DADO = by1 - 30;
    const rng = PX.rng('classroom');

    /* ---- shell: painted block, a green dado, acoustic tile, VCT floor ---- */
    const wallAt = (u, v) => (v >= DADO ? (v < DADO + 2 ? cl(P.dado, v === DADO ? 4 : 2) : blockAt(u, v, P.dado, 3)) : blockAt(u, v, P.block, 4));
    s.poly(rm.back, (x, y) => wallAt(x, y));
    s.poly(rm.left, (x, y) => { const q = rm.onLeft(x, y); return SH(wallAt(q[0] * 1.0 + 3, q[1]), -1); });
    s.poly(rm.right, (x, y) => { const q = rm.onRight(x, y); return SH(wallAt(-q[0], q[1]), -1); });
    s.poly(rm.ceil, (x, y) => {
      const q = rm.onCeil(x, y), k = q[2], w = 1 / k;
      return (q[0] % 17 + 17) % 17 < w || (q[1] % 17 + 17) % 17 < w * 1.4 ? P.ceil[3] : P.ceil[4];
    });
    vctFloor(s, rm, 9);
    // baseboard (rubber cove) all round
    s.rect(bx0, by1 - 3, bx1 - bx0, 3, P.ink[3]); s.hline(bx0, bx1 - 1, by1 - 3, P.ink[4]);
    s.poly(rm.lq(0, rm.far, by1 - 3, by1), P.ink[2]); s.poly(rm.rq(0, rm.far, by1 - 3, by1), P.ink[2]);
    // occlusion where planes meet, and the far end of the room a touch darker
    band(s, rm.back, (x, y) => Math.max((by0 + 8 - y) / 5, (bx0 + 6 - x) / 5, (x - bx1 + 6) / 5), 0.5);
    band(s, rm.floor, (x, y) => { const q = rm.onFloor(x, y); return Math.max((6 - q[1]) / 5, (bx0 + 8 - q[0]) / 6, (q[0] - bx1 + 8) / 6); }, 0.4);
    band(s, rm.ceil, (x, y) => { const q = rm.onCeil(x, y); return (q[1] - 20) / 30; }, 0.5);

    /* ---- the ceiling: two rows of troffers ---- */
    for (const [x0, x1] of [[96, 132], [188, 224]]) for (const [d0, d1] of [[8, 24], [44, 60]]) {
      const q = rm.fq(x0, x1, d0, d1, by0);
      s.poly(q, P.metal[3]);
      const qi = rm.fq(x0 + 2, x1 - 2, d0 + 1.5, d1 - 1.5, by0);
      s.poly(qi, (x, y) => E(((x + y) & 1) && PX.bayer(x, y) < 0.3 ? P.white[4] : P.white[5]));
      const c = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2];
      s.light('white', c[0], c[1] + 30, 60, 50, 0.18);
    }

    /* ---- left wall: two tall windows, blinds half down, a radiator ---- */
    for (const [d0, d1] of [[6, 40], [50, 84]]) classWindow(s, rm, d0, d1);
    radiator(s, rm, 8, 38);
    // the sun through the windows: patches across the floor and the desk tops
    for (const [d0, d1] of [[6, 40], [50, 84]]) {
      const a = rm.pr(bx0, by1, d0 + 6), b = rm.pr(bx0, by1, d1 + 6), c = rm.pr(bx0 + 74, by1, d1 + 26), dd = rm.pr(bx0 + 74, by1, d0 + 26);
      s.lightPoly('sun', [a, b, c, dd], 0.55);
      s.lightPoly('sun', [rm.pr(bx0, 46, d0), rm.pr(bx0, 46, d1), c, dd], 0.12, { fade: { x0: a[0], y0: a[1] - 30, x1: c[0], y1: c[1] } });
    }

    /* ---- back wall ---- */
    chalkboard(s, 88, 30, 144, 38, blank);
    // the map case above the board, the clock, the flag
    s.rect(94, 25, 64, 3, P.metal[4]); s.hline(94, 157, 25, P.metal[5]); s.hline(94, 157, 27, P.metal[2]);
    s.rect(124, 28, 3, 2, P.metal[3]); s.px(125, 30, P.metal[2]);
    shadeRect(s, 95, 28, 63, 1, -1);
    wallClock(s, 198, 21);
    flag(s, 258, 22);
    bookcase(s, rm, 52, 84);
    bulletin(s, 238, 36, 30, 30);
    // the intercom speaker and a fire-drill card
    s.rect(64, 24, 10, 8, P.block[3]); s.rect(65, 25, 8, 6, P.block[2]);
    for (let yy = 26; yy < 31; yy += 2) s.hline(66, 71, yy, P.ink[3]);
    s.rect(78, 30, 6, 8, P.paper[4]); s.hline(79, 82, 32, P.red[3]); s.hline(79, 82, 34, P.ink[4]); s.hline(79, 81, 36, P.ink[4]);

    /* ---- right wall: the door with its wired glass, a pencil sharpener ---- */
    classDoor(s, rm, 10, 36);
    const sh0 = rm.pr(bx1, 62, 46), sh1 = rm.pr(bx1, 66, 49);
    s.rect(sh0[0], sh0[1], sh1[0] - sh0[0] + 1, sh1[1] - sh0[1] + 1, P.metal[3]); s.px(sh0[0], sh0[1], P.metal[5]);

    /* ---- furniture: teacher's desk, then the rows of desks back to front ---- */
    teacherDesk(s, rm, rng);
    const cols = [70, 104, 138, 182, 216, 250], rows = [22, 46, 70];
    for (const d of rows) for (const x of cols) shadePoly(s, rm.fq(x - 9, x + 13, d + 2, d + 30), -1, 0.5);
    for (const d of rows) for (const x of cols) studentDesk(s, rm, x, d, rng);

    // a soft vignette toward the near corners
    band(s, [[0, 120], [320, 120], [320, 180], [0, 180]], (x, y) => (y - 150) / 26 + Math.abs(x - 160) / 260, 0.5);
  }

  function classWindow(s, rm, d0, d1) {
    const y0 = 26, y1 = 72, by1 = rm.by1;
    const q = rm.lq(d0, d1, y0, y1);
    // frame
    s.poly(rm.lq(d0 - 2, d1 + 2, y0 - 3, y1 + 3), P.trim[3]);
    // view: sky, the tops of the maples, the far wing of the school
    const [ax] = q[0], [bxx] = q[1];
    s.poly(q, (x, y) => {
      const qq = rm.onLeft(x, y), v = qq[1], dd = qq[0];
      const tree = v > 46 + 6 * Math.sin(dd * 0.31) + 3 * Math.sin(dd * 0.9 + 1);
      if (v > 62) return E(P.brick[3]);
      if (tree) { const h = hash(flo(dd * 1.3), flo(v * 0.8)); return E(h < 0.35 ? P.leaf_orange[3] : h < 0.6 ? P.leaf_gold[4] : h < 0.8 ? P.leaf_red[3] : P.leaf_orange[4]); }
      return E(v < 34 ? P.sky_day[3] : P.sky_day[4]);
    });
    // mullions: a centre post and two rails
    const dm = (d0 + d1) / 2;
    s.line(...rm.pr(rm.bx0, y0, dm), ...rm.pr(rm.bx0, y1, dm), P.trim[4]);
    for (const yy of [42, 58]) s.line(...rm.pr(rm.bx0, yy, d0), ...rm.pr(rm.bx0, yy, d1), P.trim[4]);
    // venetian blinds, let down to a third
    s.poly(rm.lq(d0, d1, y0, y0 + 14), (x, y) => { const qq = rm.onLeft(x, y); return ((qq[1] - y0) % 3) < 1.2 ? P.cream[2] : P.cream[4]; });
    s.line(...rm.pr(rm.bx0, y0 + 14, d0), ...rm.pr(rm.bx0, y0 + 14, d1), P.cream[1]);
    s.line(...rm.pr(rm.bx0, y0 + 14, dm + 3), ...rm.pr(rm.bx0, y0 + 28, dm + 3), P.cream[3]);
    // sill
    s.poly(rm.lq(d0 - 3, d1 + 3, y1 + 2, y1 + 4), P.trim[4]);
  }

  function radiator(s, rm, d0, d1) {
    const y0 = rm.by1 - 22, y1 = rm.by1 - 4;
    s.poly(rm.lq(d0, d1, y0, y1), P.metal[3]);
    for (let d = d0 + 1; d < d1; d += 2) s.line(...rm.pr(rm.bx0, y0 + 1, d), ...rm.pr(rm.bx0, y1 - 1, d), P.metal[2]);
    s.line(...rm.pr(rm.bx0, y0, d0), ...rm.pr(rm.bx0, y0, d1), P.metal[5]);
  }

  function chalkboard(s, x, y, w, h, blank) {
    // aluminium frame and the slate, with old eraser swirls
    s.rect(x - 3, y - 3, w + 6, h + 6, P.chrome[3]); s.hline(x - 3, x + w + 2, y - 3, P.chrome[5]); s.vline(x + w + 2, y - 3, y + h + 2, P.chrome[1]);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const n = Math.sin(xx * 0.09 + Math.sin(yy * 0.17) * 2) + Math.sin(yy * 0.13 - xx * 0.04);
      const swirl = Math.sin(Math.hypot(xx - x - w * 0.3, yy - y - h * 0.6) * 0.35) > 0.86;
      s.px(xx, yy, n > 1.1 || (swirl && PX.bayer(xx, yy) < 0.5) ? P.board[3] : P.board[2]);
    }
    s.hline(x, x + w - 1, y, P.board[1]); s.vline(x, y, y + h - 1, P.board[1]);
    // the tray: chalk and a felt eraser
    s.rect(x - 4, y + h + 2, w + 8, 3, P.chrome[4]); s.hline(x - 4, x + w + 3, y + h + 4, P.chrome[1]);
    s.rect(x + 18, y + h + 1, 4, 1, P.chalk[5]); s.rect(x + 25, y + h + 1, 3, 1, P.chalk[4]); s.rect(x + 30, y + h + 1, 2, 1, P.yellow[4]);
    s.rect(x + w - 30, y + h, 9, 2, P.ink[3]); s.hline(x + w - 30, x + w - 22, y + h, P.cream[3]);
    shadeRect(s, x - 3, y + h + 5, w + 8, 1, -1);
    const C = P.chalk[4], C2 = P.chalk[3];
    if (blank) {
      // erased: grey drifts, the date and the room left in the corner
      for (let i = 0; i < 5; i++) {
        const cx = x + 20 + i * 26, cy = y + 14 + (i % 2) * 8;
        s.ellipse(cx, cy, 13, 5, (xx, yy, nx, ny) => (PX.bayer(xx, yy) < 0.28 * (1 - nx * nx - ny * ny) + 0.06 ? P.board[4] : 0));
      }
      text(s, x + w - 38, y + 4, 'TUES 9/3', C, { jitter: 'date' });
      text(s, x + 5, y + 4, 'MS. WHITCOMB', C2, { italic: true });
      text(s, x + 5, y + 11, 'RM 114', C2, { italic: true });
      return;
    }
    const cx = x + w / 2;
    bigText(s, rnd(cx - textW('THE LOTTERY')), y + 4, 'THE LOTTERY', (xx, yy) => (PX.bayer(xx, yy) < 0.85 ? C : C2), 2);
    text(s, rnd(cx - textW('SHIRLEY JACKSON (1948)') / 2), y + 18, 'SHIRLEY JACKSON (1948)', C2, { jitter: 'sj' });
    text(s, rnd(cx - textW('WHY DO THEY KEEP DOING IT?') / 2), y + 27, 'WHY DO THEY KEEP DOING IT?', C, { jitter: 'why' });
    const uw = textW('WHY DO THEY KEEP DOING IT?');
    s.line(rnd(cx - uw / 2), y + 33, rnd(cx + uw / 2), y + 34, C2);
  }

  function wallClock(s, cx, cy) {
    s.circle(cx, cy, 6, P.ink[2]); s.circle(cx, cy, 5, P.white[4]);
    s.px(cx - 2, cy - 3, P.white[5]);
    for (const [dx, dy] of [[0, -4], [4, 0], [0, 4], [-4, 0]]) s.px(cx + dx, cy + dy, P.ink[3]);
    s.line(cx, cy, cx, cy - 3, P.ink[1]); s.line(cx, cy, cx + 2, cy + 1, P.ink[1]); s.px(cx, cy, P.red[3]);
    shadeRect(s, cx - 4, cy + 7, 9, 1, -1);
  }

  function flag(s, x, y) {
    s.line(x, y, x - 8, y + 18, P.brass[4]); s.px(x, y - 1, P.brass[5]);
    for (let i = 0; i < 13; i++) for (let j = 0; j < 9; j++) {
      const fx = x - 2 - i * 0.6 + j * 0, fy = y + 2 + j + i * 0.55 + Math.sin(i * 0.8) * 0.8;
      const star = i < 6 && j < 5;
      s.px(fx - i * 0.0, fy, star ? (((i + j) & 1) ? P.white[4] : P.navy[3]) : (j & 1 ? P.white[4] : P.red[4]));
    }
  }

  function bookcase(s, rm, x0, x1) {
    const y0 = 58, by1 = rm.by1;
    const c = box(s, rm, { x0, x1, y0, y1: by1, d0: 0, d1: 9 }, P.wood);
    const f = c.front;
    s.rect(f[0] + 2, f[1] + 2, f[2] - 4, f[3] - 4, P.wood[1]);
    const rng = PX.rng('bookcase'), cols = [P.red, P.navy, P.olive, P.mustard, P.maroon, P.teal, P.cream];
    for (let shelf = 0; shelf < 3; shelf++) {
      const sy = f[1] + 3 + shelf * rnd((f[3] - 4) / 3), sh = rnd((f[3] - 4) / 3) - 2;
      let xx = f[0] + 3;
      while (xx < f[0] + f[2] - 4) {
        const bw = rng.int(2, 3), bh = sh - rng.int(0, 2), r = rng.pick(cols);
        if (rng() < 0.1) { xx += 2; continue; }
        s.rect(xx, sy + sh - bh, bw, bh, r[3]); s.vline(xx, sy + sh - bh, sy + sh - 1, r[4]);
        if (bh > 4) s.px(xx + 1, sy + sh - bh + 2, r[5]);
        xx += bw;
      }
      s.hline(f[0] + 2, f[0] + f[2] - 3, sy + sh, P.wood[3]);
    }
    // a globe and a stack of dictionaries on top
    s.circle(f[0] + 8, f[1] - 5, 4, P.sky_day[2]); s.px(f[0] + 6, f[1] - 7, P.grass[3]); s.rect(f[0] + 7, f[1] - 4, 3, 2, P.grass[3]); s.px(f[0] + 6, f[1] - 6, P.sky_day[4]);
    s.rect(f[0] + 7, f[1] - 1, 3, 1, P.brass[3]);
    s.rect(f[0] + 16, f[1] - 4, 12, 2, P.maroon[3]); s.rect(f[0] + 17, f[1] - 6, 10, 2, P.navy[3]); s.hline(f[0] + 16, f[0] + 27, f[1] - 4, P.maroon[4]);
    // a READ poster above
    s.rect(54, 28, 20, 24, P.ink[3]); s.rect(55, 29, 18, 22, P.mustard[3]);
    text(s, 57, 31, 'READ', P.ink[2]);
    s.rect(58, 38, 12, 10, P.cream[4]); s.rect(59, 39, 4, 8, P.red[3]); s.rect(64, 39, 5, 8, P.navy[3]); s.vline(63, 39, 46, P.cream[2]);
    shadeRect(s, 74, 29, 1, 24, -1); shadeRect(s, 55, 52, 20, 1, -1);
  }

  function bulletin(s, x, y, w, h) {
    s.rect(x - 2, y - 2, w + 4, h + 4, P.wood[3]); s.hline(x - 2, x + w + 1, y - 2, P.wood[4]);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) s.px(xx, yy, hash(xx, yy) < 0.18 ? P.cork[2] : P.cork[3]);
    const note = (nx, ny, nw, nh, c, lines, pin) => {
      s.rect(nx, ny, nw, nh, c[4]); s.hline(nx, nx + nw - 1, ny, c[5]); shadeRect(s, nx + 1, ny + nh, nw, 1, -1); shadeRect(s, nx + nw, ny + 1, 1, nh, -1);
      lines.forEach((l, i) => (typeof l === 'string' ? text(s, nx + 2, ny + 2 + i * 6, l, P.ink[2]) : s.hline(nx + 2, nx + 2 + l, ny + 3 + i * 3, P.ink[4])));
      s.px(nx + rnd(nw / 2), ny + 1, pin);
    };
    note(x + 2, y + 2, 26, 13, P.paper, ['DERRY', 'VOICES'], P.red[4]);
    note(x + 3, y + 17, 11, 11, P.yellow, [6, 7, 5], P.sky_day[2]);
    note(x + 16, y + 16, 12, 12, P.pink, [7, 6, 8], P.mustard[4]);
    // a Tigers pennant tacked on the side
    s.poly([[x - 3, y + h + 4], [x + 12, y + h + 7], [x - 3, y + h + 10]], P.mustard[4]);
    s.hline(x - 2, x + 5, y + h + 7, P.ink[3]);
  }

  function classDoor(s, rm, d0, d1) {
    const y0 = 30, by1 = rm.by1;
    s.poly(rm.rq(d0 - 2, d1 + 2, y0 - 3, by1), P.trim[2]);
    s.poly(rm.rq(d0, d1, y0, by1), (x, y) => { const q = rm.onRight(x, y); return ((q[0] * 0.8) % 6 < 0.9) ? P.oak[2] : P.oak[3]; });
    // the narrow wired-glass window
    const g = rm.rq(d0 + 4, d0 + 11, y0 + 8, y0 + 34);
    s.poly(g, (x, y) => { const q = rm.onRight(x, y); return ((rnd(q[1]) + rnd(q[0] * 1.6)) % 4 === 0) ? P.metal[3] : P.wall_green[4]; });
    // knob and kick plate
    const kn = rm.pr(rm.bx1, 70, d1 - 4); s.rect(kn[0], kn[1], 2, 2, P.brass[4]);
    s.poly(rm.rq(d0, d1, by1 - 10, by1 - 1), P.chrome[2]);
    // EXIT map card beside it
    const m = rm.rq(d1 + 6, d1 + 13, 40, 52); s.poly(m, P.paper[4]); s.line(...rm.pr(rm.bx1, 43, d1 + 7), ...rm.pr(rm.bx1, 43, d1 + 12), P.red[3]);
  }

  function teacherDesk(s, rm, rng) {
    const by1 = rm.by1, y0 = by1 - 28;
    shadePoly(s, rm.fq(194, 258, 14, 40), -1, 0.6);
    const c = box(s, rm, { x0: 196, x1: 254, y0, y1: by1, d0: 16, d1: 36 }, P.oak);
    // modesty panel grain and the top's lip
    const f = c.front;
    for (let yy = f[1] + 3; yy < f[1] + f[3]; yy += 4) s.hline(f[0] + 1, f[0] + f[2] - 2, yy, P.oak[2]);
    s.hline(f[0], f[0] + f[2] - 1, f[1], P.oak[5]); s.hline(f[0], f[0] + f[2] - 1, f[1] + 1, P.oak[2]);
    // on top: papers, a stack of paperbacks, an apple, a moon mug, a little plant
    const top = c.faces.top;
    const at = (u, v) => [rnd(top[3][0] + (top[2][0] - top[3][0]) * u + (top[0][0] - top[3][0]) * v), rnd(top[3][1] + (top[0][1] - top[3][1]) * v)];
    const [px0, py0] = at(0.1, 0.4); s.rect(px0, py0, 12, 3, P.paper[5]); s.hline(px0 + 1, px0 + 10, py0 + 1, P.paper[3]);
    const [bx, by] = at(0.42, 0.55);
    [[P.red, 11], [P.teal, 10], [P.cream, 12], [P.navy, 9]].forEach(([r, w], i) => { s.rect(bx + (i & 1), by - 2 - i * 2, w, 2, r[3]); s.hline(bx + (i & 1), bx + (i & 1) + w - 1, by - 2 - i * 2, r[4]); });
    const [ax, ay] = at(0.72, 0.5); s.circle(ax, ay - 2, 2.2, P.apple[3]); s.px(ax - 1, ay - 3, P.apple[5]); s.px(ax, ay - 5, P.wood[2]); s.px(ax + 1, ay - 5, P.grass[4]);
    const [mx, my] = at(0.86, 0.35); s.rect(mx, my - 5, 4, 5, P.navy[3]); s.px(mx + 1, my - 4, P.yellow[5]); s.vline(mx + 4, my - 4, my - 2, P.navy[2]); s.hline(mx, mx + 3, my - 5, P.navy[4]);
    const [gx, gy] = at(0.04, 0.6);
    s.rect(gx, gy - 3, 5, 3, P.tile_red[3]); s.hline(gx, gx + 4, gy - 3, P.tile_red[4]);
    for (const [lx, ly] of [[1, -5], [3, -6], [0, -7], [4, -4], [2, -8], [5, -6]]) s.px(gx + lx, gy + ly, ly < -6 ? P.grass[5] : P.grass[3]);
    // the chair tucked behind it
    s.rect(f[0] + 18, f[1] - 9, 16, 9, P.seat[2]); s.hline(f[0] + 18, f[0] + 33, f[1] - 9, P.seat[3]);
  }

  function studentDesk(s, rm, x, d, rng) {
    const by1 = rm.by1, left = x < rm.vx;
    const ty = by1 - 25;
    // legs first (behind the top), then the seat and back nearer the viewer
    const leg = (lx, ld, y0) => { const a = rm.pr(lx, y0, ld), b = rm.pr(lx, by1, ld); s.line(a[0], a[1], b[0], b[1], P.chrome[2]); };
    leg(x - 9, d + 2, ty); leg(x + 9, d + 2, ty); leg(x - 9, d + 13, ty); leg(x + 9, d + 13, ty);
    // book rack under the top
    box(s, rm, { x0: x - 8, x1: x + 8, y0: ty + 2, y1: ty + 6, d0: d + 1, d1: d + 12 }, P.metal, { base: 2 });
    // the top: wood-grain laminate with a dark edge band
    const t = box(s, rm, { x0: x - 10, x1: x + 10, y0: ty - 2, y1: ty, d0: d, d1: d + 14 }, P.wood_pale, { base: 3, top: 4 });
    if (t.faces.top) {
      const tq = t.faces.top;
      s.line(tq[3][0], tq[3][1], tq[2][0], tq[2][1], P.wood_pale[5]);
      // something on most desks
      const r = rng();
      const mid = [rnd((tq[0][0] + tq[2][0]) / 2), rnd((tq[0][1] + tq[2][1]) / 2)];
      if (r < 0.3) { s.rect(mid[0] - 3, mid[1] - 1, 7, 3, rng.pick([P.paper[5], P.cream[5]])); s.hline(mid[0] - 2, mid[0] + 2, mid[1], P.sky_day[3]); }
      else if (r < 0.5) { const bc = rng.pick([P.red, P.navy, P.teal, P.mustard]); s.rect(mid[0] - 3, mid[1] - 2, 6, 3, bc[3]); s.hline(mid[0] - 3, mid[0] + 2, mid[1] - 2, bc[4]); }
      else if (r < 0.6) { s.line(mid[0] - 3, mid[1], mid[0] + 2, mid[1] - 1, P.yellow[4]); s.px(mid[0] + 3, mid[1] - 1, P.pink[4]); }
    }
    // seat
    box(s, rm, { x0: x - 8, x1: x + 8, y0: by1 - 16, y1: by1 - 14, d0: d + 16, d1: d + 27 }, P.seat, { base: 3 });
    leg(x - 7, d + 26, by1 - 14); leg(x + 7, d + 26, by1 - 14);
    // the arm that joins seat and desk
    const a0 = rm.pr(left ? x + 9 : x - 9, by1 - 15, d + 22), a1 = rm.pr(left ? x + 9 : x - 9, ty, d + 12);
    s.line(a0[0], a0[1], a1[0], a1[1], P.chrome[3]);
    // the chair back, facing us: a moulded shell on two chrome posts
    const p0 = rm.pr(x - 6, by1 - 23, d + 28), p1 = rm.pr(x - 6, by1 - 15, d + 28), p2 = rm.pr(x + 6, by1 - 23, d + 28), p3 = rm.pr(x + 6, by1 - 15, d + 28);
    s.line(p0[0], p0[1], p1[0], p1[1], P.chrome[3]); s.line(p2[0], p2[1], p3[0], p3[1], P.chrome[3]);
    const tl = rm.pr(x - 8, by1 - 32, d + 28), br = rm.pr(x + 8, by1 - 24, d + 28);
    const f = [tl[0], tl[1], br[0] - tl[0] + 1, br[1] - tl[1] + 1];
    H.rrect(s, f[0], f[1], f[2], f[3], Math.min(3, f[3] >> 1), (xx, yy, lx, ly) => {
      const edge = lx === 0 || ly === 0 || lx === f[2] - 1 || ly === f[3] - 1;
      if (edge) return ly === 0 ? P.seat[2] : P.seat[1];
      return ly === 1 ? P.seat[5] : ly >= f[3] - 2 ? P.seat[2] : lx < 2 ? P.seat[4] : P.seat[3];
    });
    // now and then a jacket over the back or a backpack on the floor
    const r2 = rng();
    if (r2 < 0.18) { const jc = rng.pick([P.denim, P.olive, P.maroon]); s.rect(f[0] + 1, f[1] - 1, f[2] - 2, rnd(f[3] * 0.8), jc[3]); s.hline(f[0] + 1, f[0] + f[2] - 2, f[1] - 1, jc[4]); s.vline(f[0] + rnd(f[2] / 2), f[1], f[1] + rnd(f[3] * 0.7), jc[2]); }
    else if (r2 < 0.32) { const bp = rng.pick([P.red, P.teal, P.navy, P.pink]); const b0 = rm.pr(x + (left ? 10 : -14), by1, d + 30); s.rect(b0[0], b0[1] - 7, 7, 7, bp[3]); s.rect(b0[0] + 1, b0[1] - 4, 5, 3, bp[2]); s.hline(b0[0], b0[0] + 6, b0[1] - 7, bp[4]); }
  }
  /* ================================================================== */
  /* LIBRARY — the reading room                                          */
  /* tall oak stacks, green-shaded lamps on long tables, arched windows; */
  /* through the far door, the glass corridor to the children's wing.   */
  /* ================================================================== */
  R('lampglass', ['#06200f', '#0b3a1c', '#15592c', '#22803f', '#3fa85a', '#7fd58c']);
  R('runner', ['#1e0a10', '#3a1219', '#5c1c24', '#7e2a2f', '#9c3d3a', '#b85b50']);

  PX.bg('library', {
    times: ['day', 'evening'],
    draw(s, o) { library(s, o); }
  });

  function library(s, o) {
    const eve = o.time === 'evening';
    const rm = Room({ vx: 160, vy: 66, bx0: 60, by0: -30, bx1: 260, by1: 108, z0: 240 });
    const { bx0, bx1, by1 } = rm, WAIN = by1 - 26;
    const rng = PX.rng('library');

    /* ---- back wall: plaster over oak wainscot ---- */
    s.poly(rm.back, (x, y) => {
      if (y >= WAIN) { const u = ((x - bx0) % 20 + 20) % 20; return y === WAIN ? P.oak[4] : y === WAIN + 1 ? P.oak[1] : u < 1 ? P.oak[1] : u < 2 ? P.oak[4] : (y - WAIN) % 12 < 1 ? P.oak[2] : P.oak[3]; }
      return hash(x >> 1, y >> 1) < 0.06 ? P.wall_cream[3] : P.wall_cream[4];
    });
    // the stacks on both side walls, floor to out of sight
    const stack = (side) => (x, y) => {
      const q = side < 0 ? rm.onLeft(x, y) : rm.onRight(x, y), d = q[0], v = q[1], k = q[2];
      const sv = by1 - v;                                     // height above the floor
      if (sv < 6) return P.oak[1];                             // plinth
      const shelf = flo((sv - 6) / 15), fv = (sv - 6) % 15;
      const bay = flo(d / 34), fd = d - bay * 34;
      if (fd < 2.2 / k * 1.6) return P.oak[side < 0 ? 4 : 2];  // uprights
      if (fv < 1.6) return P.oak[side < 0 ? 4 : 3];            // shelf board
      if (fv < 2.4) return P.oak[1];
      const bi = flo(d * 0.9), h = hash(bi, shelf * 31 + (side < 0 ? 0 : 7));
      const top = 2.4 + 9 * (1 - h) * 0.35 + 2;
      if (fv > 15 - (top - 2.4)) return P.oak[0];              // gap above the books
      if (h < 0.06) return P.oak[0];
      const bc = [P.maroon, P.navy, P.green_jkt, P.oak, P.cream, P.red, P.teal, P.mustard][flo(h * 97) % 8];
      const fb = d * 0.9 - bi;
      return cl(bc, (fb < 0.18 ? 2 : 3) + (side < 0 ? 0 : -1) + (fv > 12.5 ? -1 : 0));
    };
    s.poly(rm.left, stack(-1));
    s.poly(rm.right, stack(1));
    // the floor: oak boards, a long red runner down the aisle
    H.plankFloor(s, rm, P.oak, { pw: 8, base: 3, seed: 'lib-floor' });
    s.poly(rm.fq(140, 180, 0, 200), (x, y) => {
      const q = rm.onFloor(x, y), u = q[0] - 140, k = q[2];
      if (u < 2 || u > 38) return P.runner[1];
      if (u < 4 || u > 36) return (flo(q[1] / 3) & 1) ? P.mustard[2] : P.runner[2];
      return ((flo(q[1] / 6) + flo(u / 6)) & 1) && PX.bayer(x, y) < 0.3 ? P.runner[2] : P.runner[3];
    });
    band(s, rm.back, (x, y) => Math.max((10 - y) / 10, 0), 0.5);

    /* ---- back wall: two tall arched windows, the far door, the clock ---- */
    for (const wx of [86, 202]) archWindow(s, wx, 6, 32, 76, eve);
    glassDoor(s, 144, 50, 32, by1 - 50, eve);
    s.circle(160, 30, 9, P.oak[1]); s.circle(160, 30, 8, P.oak[3]); s.circle(160, 30, 6, P.paper[5]);
    for (let a = 0; a < 12; a++) s.px(160 + rnd(Math.cos(a * Math.PI / 6) * 5), 30 + rnd(Math.sin(a * Math.PI / 6) * 5), P.ink[3]);
    s.line(160, 30, 160, 26, P.ink[1]); s.line(160, 30, eve ? 156 : 163, eve ? 31 : 32, P.ink[1]);
    // a card catalogue and a globe on a stand against the wainscot
    cardCatalog(s, rm, 66, 98);
    s.circle(234, WAIN - 2, 7, P.sky_day[2]); s.rect(230, WAIN - 6, 5, 3, P.grass[3]); s.rect(235, WAIN - 1, 4, 3, P.grass_fall[3]); s.px(231, WAIN - 7, P.sky_day[4]);
    s.ring(234, WAIN - 2, 8, 8, P.brass[3]); s.vline(234, WAIN + 6, by1 - 1, P.oak[2]); s.hline(230, 238, by1 - 1, P.oak[2]);
    // a rolling ladder against the left stacks
    const l0 = rm.pr(bx0 + 12, by1, 74), l1 = rm.pr(bx0, -10, 62), l2 = rm.pr(bx0 + 12, by1, 84), l3 = rm.pr(bx0, -10, 72);
    s.line(l0[0], l0[1], l1[0], l1[1], P.oak[4]); s.line(l2[0], l2[1], l3[0], l3[1], P.oak[2]);
    for (let t = 0.08; t < 1; t += 0.085) s.line(rnd(l0[0] + (l1[0] - l0[0]) * t), rnd(l0[1] + (l1[1] - l0[1]) * t), rnd(l2[0] + (l3[0] - l2[0]) * t), rnd(l2[1] + (l3[1] - l2[1]) * t), P.oak[3]);

    /* ---- two long reading tables with chairs and green lamps ---- */
    for (const [x0, x1] of [[86, 128], [192, 234]]) readingTable(s, rm, x0, x1, 26, 132, eve, rng, x0 > 160);

    /* ---- light ---- */
    if (eve) {
      s.light('warm', 160, 70, 150, 80, 0.15);
    } else {
      for (const wx of [86, 202]) {
        const a = rm.pr(wx, by1, 0), b = rm.pr(wx + 32, by1, 0), c = rm.pr(wx + 52, by1, 70), dd = rm.pr(wx + 20, by1, 70);
        s.lightPoly('sun', [[wx + 2, 40], [wx + 30, 40], c, dd], 0.12, { fade: { x0: wx + 16, y0: 40, x1: dd[0], y1: dd[1] } });
        s.lightPoly('sun', [a, b, c, dd], 0.5);
      }
    }
  }

  function archWindow(s, x, y, w, h, eve) {
    const r = w / 2, cx = x + r;
    const inA = (xx, yy) => (yy >= y + r ? xx >= x && xx < x + w && yy < y + h : Math.hypot(xx + 0.5 - cx, yy + 0.5 - (y + r)) < r);
    for (let yy = y - 4; yy < y + h + 4; yy++) for (let xx = x - 4; xx < x + w + 4; xx++) {
      const outer = yy >= y + r ? xx >= x - 3 && xx < x + w + 3 && yy < y + h + 3 : Math.hypot(xx + 0.5 - cx, yy + 0.5 - (y + r)) < r + 3;
      if (!outer) continue;
      if (!inA(xx, yy)) { s.px(xx, yy, xx < cx ? P.stone_warm[4] : P.stone_warm[3]); continue; }
      const v = (yy - y) / h, fx = (xx - x) % 8, fy = (yy - y) % 10;
      let c;
      if (eve) c = v < 0.5 ? P.sky_night[2] : P.sky_night[3];
      else { const tree = yy > y + h * 0.62 + Math.sin(xx * 0.4) * 3; c = tree ? (hash(xx >> 1, yy >> 1) < 0.5 ? P.leaf_gold[4] : P.leaf_orange[3]) : v < 0.35 ? P.sky_day[3] : P.sky_day[4]; }
      if (fx === 0 || fy === 0) c = P.oak[2];
      s.px(xx, yy, fx === 0 || fy === 0 ? c : E(c));
    }
    if (!eve) for (let k = 0; k < 8; k++) { s.px(x + 4 + k, y + r + 6 + k, E(P.white[5])); }
    if (eve) { s.px(x + 9, y + 12, E(P.white[4])); s.px(x + 22, y + 20, E(P.cloud[3])); }
    // deep stone sill and green velvet drapes tied back
    s.rect(x - 5, y + h + 2, w + 10, 3, P.stone_warm[4]); s.hline(x - 5, x + w + 4, y + h + 4, P.stone_warm[1]);
    for (const side of [-1, 1]) {
      for (let yy = y - 2; yy < y + h + 2; yy++) {
        const tie = yy > y + h * 0.55 ? 0 : 1, wv = yy < y + h * 0.55 ? 6 : yy < y + h * 0.62 ? 3 : 5;
        for (let k = 0; k < wv; k++) {
          const xx = side < 0 ? x - 6 + k : x + w + 5 - k;
          s.px(xx, yy, cl(P.drape, 3 + H.fold(k + (tie ? 0 : 1), 3)));
        }
      }
      const ty = rnd(y + h * 0.58); s.rect(side < 0 ? x - 6 : x + w + 1, ty, 5, 2, P.brass[4]);
    }
  }

  function glassDoor(s, x, y, w, h, eve) {
    // an oak door frame, the door standing open on the glass corridor
    s.rect(x - 4, y - 4, w + 8, h + 4, P.oak[2]); s.hline(x - 4, x + w + 3, y - 4, P.oak[4]);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const v = (yy - y) / h, cxp = (xx - x - w / 2) / (w / 2);
      // a corridor of glass: mullions converge to the far door
      const far = Math.abs(cxp) < 0.28 && v > 0.25 && v < 0.95;
      const floor = v > 0.62 + 0.3 * Math.abs(cxp);
      let c;
      if (far) c = eve ? P.lamp[4] : P.wall_yellow[5];
      else if (floor) c = eve ? P.linoleum[2] : P.linoleum[4];
      else c = eve ? (v < 0.5 ? P.sky_night[2] : P.sky_night[3]) : (v < 0.4 ? P.sky_day[4] : P.sky_day[5]);
      const mull = (Math.abs(cxp) > 0.3 && (rnd((xx - x) * 1.0) % 5 === 0)) || (!floor && !far && (yy - y) % 9 === 0);
      s.px(xx, yy, mull ? (eve ? P.metal[1] : P.metal[3]) : E(c));
    }
    if (eve) s.light('warm', x + w / 2, y + h * 0.6, 22, 18, 0.5);
    // the door itself, swung in against the wall
    s.rect(x + w, y, 4, h, P.oak[1]); s.rect(x + w + 1, y + 2, 2, h - 4, P.oak[3]); s.px(x + w + 1, y + h * 0.55, P.brass[4]);
    text(s, x + 2, y - 9, 'CHILDREN\'S', P.brass[3]);
  }

  function cardCatalog(s, rm, x0, x1) {
    const c = box(s, rm, { x0, x1, y0: rm.by1 - 30, y1: rm.by1, d0: 0, d1: 12 }, P.oak);
    const f = c.front;
    for (let yy = f[1] + 2; yy < f[1] + f[3] - 3; yy += 4) for (let xx = f[0] + 2; xx < f[0] + f[2] - 3; xx += 6) {
      s.rect(xx, yy, 5, 3, P.oak[4]); s.hline(xx, xx + 4, yy + 2, P.oak[2]); s.px(xx + 2, yy + 1, P.brass[4]); s.px(xx + 1, yy, P.paper[5]);
    }
    // an open drawer and a stack of cards beside it
    s.rect(f[0] + 8, f[1] + 10, 5, 3, P.oak[5]); s.rect(f[0] + 8, f[1] + 9, 5, 1, P.paper[5]);
    s.rect(f[0] + 4, f[1] - 2, 6, 2, P.paper[5]); s.hline(f[0] + 4, f[0] + 9, f[1] - 2, P.white[5]);
  }

  function readingTable(s, rm, x0, x1, d0, d1, eve, rng, right) {
    const by1 = rm.by1, ty = by1 - 27;
    const cx = (x0 + x1) / 2;
    shadePoly(s, rm.fq(x0 - 2, x1 + 2, d0, d1 + 4), -1, 0.65);
    // chairs on the far side of the aisle first, then the table, then the near chairs
    const chair = (x, d, facing) => {
      const seatY = by1 - 16;
      box(s, rm, { x0: x - 5, x1: x + 5, y0: seatY, y1: seatY + 2, d0: d - 5, d1: d + 5 }, P.oak, { base: 3 });
      for (const [lx, ld] of [[x - 4, d - 4], [x + 4, d - 4], [x - 4, d + 4], [x + 4, d + 4]]) { const a = rm.pr(lx, seatY + 2, ld), b = rm.pr(lx, by1, ld); s.line(a[0], a[1], b[0], b[1], P.oak[1]); }
      // back: three spindles under a curved rail on the side away from the table
      const bx = facing < 0 ? x + 5 : x - 5;
      for (const dd of [d - 4, d, d + 4]) { const a = rm.pr(bx, seatY, dd), b = rm.pr(bx, seatY - 12, dd); s.line(a[0], a[1], b[0], b[1], P.oak[2]); }
      const r0 = rm.pr(bx, seatY - 12, d - 5), r1 = rm.pr(bx, seatY - 12, d + 5);
      s.line(r0[0], r0[1], r1[0], r1[1], P.oak[4]); s.line(r0[0], r0[1] + 1, r1[0], r1[1] + 1, P.oak[2]);
    };
    const ds = [38, 66, 94, 122];
    const outer = right ? x1 + 8 : x0 - 8, inner = right ? x0 - 8 : x1 + 8;
    for (const d of ds) chair(outer + (rng() - 0.5) * 3, d + rng.int(-2, 2), right ? 1 : -1);
    // legs and the long top
    for (const [lx, ld] of [[x0 + 2, d0 + 2], [x1 - 2, d0 + 2], [x0 + 2, d1 - 2], [x1 - 2, d1 - 2], [x0 + 2, (d0 + d1) / 2], [x1 - 2, (d0 + d1) / 2]]) {
      const a = rm.pr(lx, ty, ld), b = rm.pr(lx, by1, ld); s.line(a[0], a[1], b[0], b[1], P.oak[1]); s.line(a[0] + 1, a[1], b[0] + 1, b[1], P.oak[2]);
    }
    const t = box(s, rm, { x0, x1, y0: ty - 2, y1: ty, d0, d1 }, P.oak, { base: 3, top: 4 });
    // things on the table: open books, printouts fanned like solitaire (far end, right table), pencils
    const onTop = (u, d) => rm.pr(x0 + (x1 - x0) * u, ty - 2, d);
    for (let i = 0; i < 7; i++) {
      const d = d0 + 8 + i * 15 + rng.int(-3, 3), u = rng.range(0.2, 0.8), [px, py] = onTop(u, d), k = rm.S(d);
      const w = rnd(5 * k), hh = Math.max(1, rnd(2 * k));
      if (rng() < 0.55) { s.rect(px - w, py, w, hh, P.paper[5]); s.rect(px + 1, py, w, hh, P.paper[4]); s.vline(px, py, py + hh - 1, P.paper[2]); }
      else { const bc = rng.pick([P.maroon, P.navy, P.green_jkt]); s.rect(px - rnd(w / 2), py - 1, w, hh + 1, bc[3]); s.hline(px - rnd(w / 2), px - rnd(w / 2) + w - 1, py - 1, bc[4]); }
    }
    if (right) for (let i = 0; i < 6; i++) { const [px, py] = onTop(0.3 + i * 0.09, d0 + 10 + (i % 2) * 3); s.rect(px - 2, py - 1, 4, 2, P.paper[5]); s.px(px - 1, py, P.ink[4]); }
    // green banker's lamps along the centre line
    for (const d of [44, 86, 126]) {
      const [lx, ly] = rm.pr(cx, ty - 2, d), k = rm.S(d);
      const sw = rnd(4 * k), shh = Math.max(2, rnd(2.2 * k)), ph = rnd(5 * k);
      s.vline(lx, ly - ph, ly - 1, P.brass[3]); s.hline(lx - rnd(2 * k), lx + rnd(2 * k), ly - 1, P.brass[4]);
      for (let yy = 0; yy < shh; yy++) for (let xx = -sw; xx <= sw; xx++) {
        const edge = Math.abs(xx) > sw - (shh - yy) * 0.6;
        if (edge && yy < shh - 1) continue;
        s.px(lx + xx, ly - ph - shh + yy, E(yy === 0 ? P.lampglass[5] : xx < 0 ? P.lampglass[4] : P.lampglass[3]));
      }
      s.hline(lx - sw, lx + sw, ly - ph, E(P.lamp[5]));
      s.light('warm', lx, ly, 14 * k, 6 * k, eve ? 1.05 : 0.35);
      if (eve) s.light('warm', lx, ly - ph, 9 * k, 7 * k, 0.4);
    }
    for (const d of ds) chair(inner + (rng() - 0.5) * 3, d + rng.int(-2, 2), right ? -1 : 1);
  }
  /* ================================================================== */
  /* BOILER ROOM — under the gym; Mr. Teague's chair, and his wall       */
  /* ================================================================== */
  R('grease', ['#0b0908', '#15110e', '#211a15', '#2e241c', '#3d3025', '#4e3e30']);
  R('castiron', ['#0f0e10', '#1b191c', '#29262a', '#3a3639', '#4f4a4b', '#6a6361']);
  R('plaid_g', ['#14100c', '#2a1e14', '#47301c', '#6a4626', '#8e6234', '#b08450']);

  /* one a year, in black grease pencil. Column three, at eye height: June. */
  const WALL = [
    ['WALTER PIKE 1945', 'HELEN VOSE 1946', 'ARTHUR BLAIS 1947', 'NORA CYR 1948', 'EDDIE MARSH 1949', 'RUTH DIONNE 1950', 'FRANCIS ROY 1951', 'IRENE LACHANCE ?', 'PAUL OUELLETTE 1953', 'DORIS HADLEY 1954', 'GEORGE SAWYER 1955', 'ALICE MORIN 1956', 'RAYMOND COTE 1957', 'SUSAN LIBBY 1958', 'LEO GAGNON 1959', 'BETTY ST. PIERRE 1960'],
    ['MARGARET TEAGUE 1961', 'ROSE TEAGUE 1961', 'THOMAS PELLETIER 1962', 'ANNIE MICHAUD 1963', 'DAVID KEANE 1964', 'LINDA BOLDUC 1965', 'FRANKIE NADEAU ?', 'CAROL FLYNN 1967', 'MICHAEL HEBERT 1968', 'KATHY LEVESQUE 1969', 'ROBERT DUBE 1970', 'DANIEL CARRIER 1971', 'DENISE POULIN 1972', 'JAMES PRESCOTT 1973', 'TINA BOUCHARD 1974', 'MARK DONNELLY 1975'],
    ['MARIE PAQUETTE 1976', 'BRIAN HAYES 1977', 'JENNY CLOUTIER 1978', 'SCOTT ALBERT ?', 'AMY THERIAULT 1980', 'KEVIN SIROIS 1981', 'JUNE BRENNAN 1982', 'CHRIS LEBLANC 1983', 'MELISSA DUBOIS 1984', 'MARCUS LOWELL 1985', 'TOBY MERCER 1986', 'HEATHER ROY 1987', 'RYAN BEAULIEU 1988', 'NICOLE THERRIEN 1989', 'PETER DUNN 1990']
  ];

  PX.bg('boiler', {
    times: ['dim'],
    variants: ['wall'],
    draw(s, o) { if (o.variant === 'wall') boilerWall(s, o); else boilerRoom(s, o); }
  });

  /* a pipe running in depth (d0 → d1) at world (x, y), radius r */
  function pipeD(s, rm, x, y, d0, d1, r, ramp) {
    const a = rm.p(x, y, d0), b = rm.p(x, y, d1), ka = rm.S(d0), kb = rm.S(d1);
    const n = Math.max(1, rnd(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let i = 0; i <= n; i++) {
      const t = i / n, cx = a[0] + (b[0] - a[0]) * t, cy = a[1] + (b[1] - a[1]) * t, rr = r * (ka + (kb - ka) * t);
      for (let yy = -rr; yy <= rr; yy++) s.px(cx, cy + yy, cl(ramp, yy < -rr * 0.4 ? 4 : yy < 0 ? 3 : yy < rr * 0.6 ? 2 : 1));
    }
  }

  function boilerRoom(s, o) {
    const rm = Room({ vx: 150, vy: 62, bx0: 36, by0: 6, bx1: 258, by1: 110, z0: 200 });
    const { bx0, bx1, by0, by1 } = rm, rng = PX.rng('boiler');

    /* ---- shell ---- */
    s.poly(rm.back, (x, y) => blockAt(x, y, P.concrete, 3));
    s.poly(rm.left, (x, y) => { const q = rm.onLeft(x, y), row = flo(q[1] / 3), off = row & 1 ? 3 : 0; return ((q[0] + off) % 6 < 0.8 || q[1] % 3 < 0.7) ? P.brick[1] : cl(P.brick, 2 + (hash(flo((q[0] + off) / 6), row) < 0.2 ? -1 : 0)); });
    s.poly(rm.right, (x, y) => { const q = rm.onRight(x, y), row = flo(q[1] / 3), off = row & 1 ? 3 : 0; return ((q[0] + off) % 6 < 0.8 || q[1] % 3 < 0.7) ? P.wall_cream[2] : P.wall_cream[3]; });
    s.poly(rm.ceil, (x, y) => { const q = rm.onCeil(x, y); return (q[1] % 28) < 5 ? P.concrete[1] : P.concrete[2]; });
    s.poly(rm.floor, (x, y) => {
      const q = rm.onFloor(x, y), n = Math.sin(q[0] * 0.07 + q[1] * 0.05) + Math.sin(q[0] * 0.19 - q[1] * 0.11);
      return n > 1.55 && PX.bayer(x, y) < 0.5 ? P.concrete[2] : (hash(x, y) < 0.04 ? P.concrete[2] : P.concrete[3]);
    });
    // oil stains and the floor drain
    for (const [u, d, rx] of [[100, 70, 10], [176, 40, 7], [128, 112, 9]]) { const c = rm.pr(u, by1, d); H.shadeEll(s, c[0], c[1], rx * rm.S(d) * 0.8, 2 * rm.S(d), -1, 0.32); }
    { const c = rm.pr(150, by1, 80); s.ellipse(c[0], c[1], 5, 2, P.castiron[1]); s.hline(c[0] - 3, c[0] + 3, c[1], P.castiron[3]); }
    // the names, faint from here, up the right wall
    s.clip(rm.rq(30, 120, 22, 84), () => {
      s.poly(rm.right, (x, y) => { const q = rm.onRight(x, y); return ((rnd(q[1]) % 4) < 2 && hash(flo(q[0] / 1.5), rnd(q[1] / 4)) < 0.55 && rnd(q[1]) % 4 === 0) ? P.grease[2] : 0; });
    });
    band(s, rm.floor, (x, y) => { const q = rm.onFloor(x, y); return Math.max((8 - q[1]) / 6, (bx0 + 10 - q[0]) / 7, (q[0] - bx1 + 10) / 7); }, 0.4);

    /* ---- pipes along the ceiling and down the walls ---- */
    pipeD(s, rm, bx0 + 8, by0 + 8, 0, 190, 3.2, P.castiron);
    pipeD(s, rm, bx0 + 18, by0 + 6, 0, 190, 2.2, P.metal);
    pipeD(s, rm, bx1 - 10, by0 + 7, 0, 190, 2.6, P.castiron);
    for (const d of [28, 70, 112]) { const a = rm.pr(bx0 + 8, by0 + 4, d), b = rm.pr(bx0 + 8, by0 + 12, d); s.line(a[0] - 4, a[1], b[0] - 4, b[1], P.metal[4]); }
    // a run across the back wall with a valve wheel
    s.rect(bx0, 18, bx1 - bx0, 5, P.castiron[2]); s.hline(bx0, bx1 - 1, 18, P.castiron[4]); s.hline(bx0, bx1 - 1, 22, P.castiron[1]);
    s.ring(206, 20, 4, 4, P.red[3]); s.px(206, 20, P.red[4]); s.line(202, 20, 210, 20, P.red[2]); s.line(206, 16, 206, 24, P.red[2]);
    for (const vx of [124, 182]) { s.rect(vx, 23, 4, by1 - 26, P.castiron[2]); s.vline(vx, 23, by1 - 4, P.castiron[4]); }

    /* ---- the boiler: riveted cast iron, the firebox door glowing ---- */
    shadePoly(s, rm.fq(48, 124, 6, 58), -1, 0.7);
    const bc = box(s, rm, { x0: 52, x1: 120, y0: 36, y1: by1, d0: 8, d1: 52 }, P.castiron, { base: 3 });
    const f = bc.front;
    for (let xx = f[0] + 6; xx < f[0] + f[2] - 4; xx += 8) for (let yy = f[1] + 3; yy < f[1] + f[3] - 2; yy += 9) s.px(xx, yy, P.castiron[5]);
    for (let yy = f[1] + 12; yy < f[1] + f[3]; yy += 18) s.hline(f[0] + 1, f[0] + f[2] - 2, yy, P.castiron[1]);
    // the dome on top, the stack and a pressure gauge
    s.ellipse(f[0] + f[2] / 2, f[1], f[2] / 2, 6, (x, y, nx, ny) => cl(P.castiron, ny < -0.3 ? (nx < 0 ? 4 : 3) : 2));
    s.rect(f[0] + f[2] / 2 - 5, 0, 10, f[1] - 3, P.castiron[2]); s.vline(f[0] + f[2] / 2 - 4, 0, f[1] - 4, P.castiron[4]);
    s.circle(f[0] + 12, f[1] + 8, 5, P.brass[2]); s.circle(f[0] + 12, f[1] + 8, 4, P.paper[4]); s.line(f[0] + 12, f[1] + 8, f[0] + 14, f[1] + 5, P.red[3]);
    // firebox door and its glow
    const dx = f[0] + rnd(f[2] / 2) - 10, dy = f[1] + rnd(f[3] * 0.5);
    s.rect(dx - 2, dy - 2, 24, 18, P.castiron[1]); s.rect(dx, dy, 20, 14, P.castiron[4]); s.hline(dx, dx + 19, dy, P.castiron[5]);
    for (let k = 0; k < 4; k++) s.rect(dx + 3 + k * 4, dy + 8, 2, 4, E(cl(P.fire, 3 + (k & 1))));
    s.rect(dx + 2, dy + 3, 16, 2, P.castiron[2]); s.rect(dx + 17, dy + 5, 2, 3, P.brass[4]);
    s.light('warm', dx + 10, dy + 14, 40, 24, 0.55); s.light('red', dx + 10, by1 + 4, 34, 14, 0.4);
    const sd = bc.faces.right;
    if (sd) for (let k = 0; k < 6; k++) { const a = rm.pr(120, 44 + k * 10, 10), b = rm.pr(120, 44 + k * 10, 50); s.line(a[0], a[1], b[0], b[1], P.castiron[1]); }

    /* ---- the workbench and pegboard on the back wall ---- */
    s.rect(132, 44, 46, 26, P.cork[2]);
    for (let yy = 46; yy < 70; yy += 3) for (let xx = 134; xx < 177; xx += 3) s.px(xx, yy, P.cork[1]);
    for (const [tx, tw, th, c] of [[136, 2, 14, P.metal[4]], [141, 3, 10, P.metal[3]], [147, 2, 16, P.red[3]], [152, 6, 3, P.metal[4]], [161, 2, 12, P.wood[3]], [166, 5, 5, P.metal[3]], [173, 2, 11, P.metal[4]]]) { s.rect(tx, 48, tw, th, c); s.px(tx, 47, P.metal[2]); }
    const wb = box(s, rm, { x0: 130, x1: 180, y0: by1 - 30, y1: by1, d0: 0, d1: 14 }, P.wood, { base: 2 });
    const wt = wb.faces.top;
    if (wt) {
      const [x0, y0] = wt[3];
      s.rect(x0 + 6, y0 - 6, 6, 6, P.red[2]); s.rect(x0 + 7, y0 - 4, 4, 2, P.cream[3]);                      // a coffee can
      s.rect(x0 + 18, y0 - 7, 14, 7, P.castiron[3]); s.rect(x0 + 19, y0 - 6, 6, 4, P.metal[1]); s.circle(x0 + 29, y0 - 4, 2, P.metal[4]); s.vline(x0 + 30, y0 - 13, y0 - 8, P.metal[4]);   // the radio
      s.rect(x0 + 36, y0 - 3, 7, 3, P.tile_red[3]); text(s, x0 + 37, y0 - 3, 'P', P.cream[4]);          // a tobacco tin
    }
    s.light('warm', 160, 66, 26, 10, 0.3);

    /* ---- shelves of paint cans by the right wall ---- */
    const sh = box(s, rm, { x0: 222, x1: 254, y0: 44, y1: by1, d0: 0, d1: 10 }, P.metal, { base: 2 });
    const sf = sh.front;
    for (let k = 0; k < 4; k++) {
      const yy = sf[1] + 2 + k * 16;
      s.hline(sf[0], sf[0] + sf[2] - 1, yy + 12, P.metal[4]);
      for (let c = 0; c < 4; c++) { const cr = rng.pick([P.cream, P.wall_green, P.red, P.metal]); s.rect(sf[0] + 2 + c * 7, yy + 5, 5, 7, cr[3]); s.hline(sf[0] + 2 + c * 7, sf[0] + 6 + c * 7, yy + 5, cr[4]); s.hline(sf[0] + 2 + c * 7, sf[0] + 6 + c * 7, yy + 6, P.metal[2]); }
    }

    /* ---- Mr. Teague's busted armchair, the milk crate and the chessboard ---- */
    const plaid = (sh) => (x, y) => cl(P.plaid_g, sh + (((x % 6) === 0 || (y % 5) === 0) ? -1 : ((x + y) % 6 === 3 && PX.bayer(x, y) < 0.4) ? 1 : 0));
    const chairBox = (b, base) => box(s, rm, b, null, { paint: (name, poly) => { s.poly(poly, plaid(name === 'top' ? base + 1 : name === 'front' ? base : base - 1)); return true; } });
    shadePoly(s, rm.fq(178, 224, 60, 98), -1, 0.75);
    chairBox({ x0: 186, x1: 214, y0: by1 - 42, y1: by1 - 14, d0: 62, d1: 70 }, 3);
    const seat = chairBox({ x0: 186, x1: 214, y0: by1 - 16, y1: by1 - 4, d0: 68, d1: 92 }, 3);
    chairBox({ x0: 212, x1: 219, y0: by1 - 25, y1: by1 - 3, d0: 64, d1: 93 }, 3);
    chairBox({ x0: 181, x1: 188, y0: by1 - 25, y1: by1 - 3, d0: 64, d1: 93 }, 3);
    // the split in the cushion, stuffing showing; a folded newspaper on the arm
    if (seat.faces.top) { const tq = seat.faces.top, mx = rnd((tq[0][0] + tq[2][0]) / 2), my = rnd((tq[0][1] + tq[2][1]) / 2); s.line(mx - 4, my - 1, mx + 3, my + 1, P.cream[4]); s.px(mx, my - 1, P.cream[5]); s.px(mx - 2, my + 1, P.cream[3]); }
    { const np = rm.pr(214, by1 - 25, 80); s.rect(np[0], np[1] - 1, 7, 2, P.paper[4]); s.hline(np[0], np[0] + 6, np[1] - 1, P.paper[5]); }
    // the milk crate in front, and the game on it
    const mc = box(s, rm, { x0: 150, x1: 170, y0: by1 - 14, y1: by1, d0: 84, d1: 100 }, P.navy, { base: 3 });
    const mf = mc.front;
    for (let yy = mf[1] + 2; yy < mf[1] + mf[3] - 1; yy += 3) for (let xx = mf[0] + 2; xx < mf[0] + mf[2] - 1; xx += 3) s.rect(xx, yy, 2, 2, P.navy[1]);
    if (mc.faces.top) {
      const tq = mc.faces.top;
      s.poly(tq, (x, y) => { const q = rm.onFloor(x, y, by1 - 14), u = flo((q[0] - 151) / 2.3), v = flo((q[1] - 85) / 1.8); return u < 0 || v < 0 || u > 7 || v > 7 ? P.wood[3] : ((u + v) & 1 ? P.cream[4] : P.ink[3]); });
      for (const [u, v, c] of [[0.3, 0.3, P.cream[5]], [0.6, 0.4, P.ink[1]], [0.45, 0.7, P.cream[5]], [0.7, 0.75, P.ink[1]], [0.2, 0.6, P.ink[1]]]) { const pp = rm.pr(152 + u * 16, by1 - 14, 85 + v * 14); s.rect(pp[0], pp[1] - 2, 1, 2, c); s.px(pp[0], pp[1] - 3, c); }
    }
    // a mop bucket by the boiler
    const mb = box(s, rm, { x0: 124, x1: 136, y0: by1 - 10, y1: by1, d0: 58, d1: 70 }, P.yellow, { base: 3 });
    const m0 = rm.pr(130, by1 - 10, 64), m1 = rm.pr(126, by1 - 52, 58); s.line(m0[0], m0[1], m1[0], m1[1], P.wood_pale[3]);

    /* ---- the bare bulb ---- */
    const bb = rm.pr(170, by0 + 26, 54);
    const top = rm.pr(170, by0, 54);
    s.vline(bb[0], top[1], bb[1] - 3, P.ink[2]);
    s.rect(bb[0] - 1, bb[1] - 3, 3, 2, P.metal[3]);
    s.circle(bb[0] + 0.5, bb[1] + 1, 2.2, E(P.lamp[5])); s.px(bb[0], bb[1], E(P.white[5]));
    s.vline(bb[0] + 2, bb[1] - 2, bb[1] + 9, P.metal[4]);
    s.light('warm', bb[0], bb[1] + 24, 120, 80, 0.95);
    s.light('warm', bb[0], bb[1], 30, 24, 0.4);
  }

  function boilerWall(s, o) {
    // straight on: painted brick, a pipe across the top, the fuse box's edge
    for (let y = 0; y < PX.H; y++) for (let x = 0; x < PX.W; x++) {
      const row = flo(y / 6), off = row & 1 ? 6 : 0, fu = (x + off) % 12, fv = y % 6;
      const h = hash(flo((x + off) / 12), row);
      s.px(x, y, fu === 0 || fv === 0 ? P.wall_cream[2] : cl(P.wall_cream, 3 + (h < 0.15 ? -1 : 0) + (fv === 1 && fu > 1 ? 1 : 0)));
    }
    // flaking paint
    const rng = PX.rng('flake');
    for (let i = 0; i < 26; i++) { const fx = rng.int(0, 319), fy = rng.int(0, 179); s.ellipse(fx, fy, rng.range(1, 4), rng.range(1, 2.5), (x, y) => (PX.bayer(x, y) < 0.6 ? P.brick[2] : 0)); }
    s.rect(0, 0, 320, 7, P.castiron[2]); s.hline(0, 319, 1, P.castiron[4]); s.hline(0, 319, 6, P.castiron[1]);
    for (const bx of [40, 150, 270]) { s.rect(bx, 0, 4, 9, P.metal[3]); s.px(bx + 1, 8, P.metal[5]); }
    s.rect(300, 76, 20, 60, P.metal[2]); s.vline(300, 76, 135, P.metal[4]); s.rect(304, 86, 12, 6, P.metal[1]);
    // the names: older lines traced over and over until they stand off the brick
    const colX = [10, 106, 204];
    WALL.forEach((col, ci) => col.forEach((name, ri) => {
      const x = colX[ci], y = 12 + ri * 7 + (ci === 2 ? 0 : 0);
      const age = ci === 0 ? 2 : ci === 1 ? 1 + (ri % 2) : (ri < 7 ? 1 : 0);
      const juneLine = name.startsWith('JUNE');
      if (age >= 1) text(s, x + 1, y + 1, name, age >= 2 ? P.wall_cream[1] : P.wall_cream[2]);
      text(s, x, y, name, juneLine ? P.grease[0] : cl(P.grease, 2 - age));
    }));
    // a stub of grease pencil on the ledge of the fuse box
    s.rect(296, 138, 7, 2, P.ink[2]); s.px(302, 138, P.ink[4]);
    // one bulb, up and to the left
    s.light('warm', 110, 40, 260, 170, 1.05);
    s.light('warm', 110, 40, 90, 60, 0.3);
    band(s, [[0, 0], [320, 0], [320, 180], [0, 180]], (x, y) => Math.hypot((x - 120) / 220, (y - 50) / 150) * 1.6 - 0.6, 0.5);
  }
  /* ================================================================== */
  /* CAFETERIA — a hundred tiny nations                                  */
  /* ================================================================== */
  R('tiger', ['#2a0e06', '#55200a', '#8a3a10', '#c25e18', '#e8862a', '#f8b25a']);
  R('steel', ['#2a2d34', '#4a4f58', '#71777f', '#9aa0a6', '#c4c9cc', '#e9ecec']);
  R('tabletop', ['#3a3226', '#605442', '#8a7c62', '#b2a384', '#d2c5a4', '#ebe2c6']);

  PX.bg('cafeteria', {
    times: ['day'],
    draw(s, o) { cafeteria(s, o); }
  });

  /* a tiny seated kid seen from behind or the side: hair, head, shirt */
  function kid(s, x, y, k, rng) {
    const skin = rng.pick([P.skin_peach, P.skin_fair, P.skin_warm, P.skin_brown]);
    const hair = rng.pick([P.hair_brown, P.hair_dark, P.hair_blond, P.hair_black, P.hair_red, P.hair_mid]);
    const shirt = rng.pick([P.red, P.navy, P.denim, P.green_jkt, P.mustard, P.maroon, P.pink, P.white_cloth, P.teal, P.olive]);
    const hw = Math.max(1, rnd(1.6 * k)), hh = Math.max(2, rnd(2.2 * k)), tw = Math.max(2, rnd(2.6 * k)), th = Math.max(2, rnd(3.2 * k));
    s.rect(x - tw, y - th, tw * 2 + 1, th, shirt[3]); s.hline(x - tw, x + tw, y - th, shirt[4]); s.vline(x + tw, y - th + 1, y - 1, shirt[2]);
    s.rect(x - hw, y - th - hh, hw * 2 + 1, hh, skin[3]);
    s.rect(x - hw, y - th - hh - 1, hw * 2 + 1, Math.max(1, rnd(hh * 0.6)), hair[3]); s.px(x - hw, y - th - hh - 1, hair[4]);
    if (rng() < 0.3) s.rect(x - hw, y - th - hh, hw * 2 + 1, Math.max(1, rnd(hh * 0.8)), hair[2]);   // seen from behind
  }

  function cafeteria(s, o) {
    const rm = Room({ vx: 160, vy: 42, bx0: 28, by0: 2, bx1: 292, by1: 98, z0: 230 });
    const { bx0, bx1, by0, by1 } = rm, rng = PX.rng('cafeteria');
    const wallAt = (u, v) => (v >= by1 - 24 ? (v < by1 - 22 ? cl(P.tiger, 3) : blockAt(u, v, P.dado, 3)) : blockAt(u, v, P.block, 4));
    s.poly(rm.back, (x, y) => wallAt(x, y));
    s.poly(rm.left, (x, y) => { const q = rm.onLeft(x, y); return SH(wallAt(q[0] + 3, q[1]), -1); });
    s.poly(rm.right, (x, y) => { const q = rm.onRight(x, y); return SH(wallAt(-q[0], q[1]), -1); });
    s.poly(rm.ceil, (x, y) => { const q = rm.onCeil(x, y), w = 1 / q[2]; return (q[0] % 17 + 17) % 17 < w || (q[1] % 17) < w * 1.4 ? P.ceil[3] : P.ceil[4]; });
    vctFloor(s, rm, 10, { checker: P.linoleum });
    band(s, rm.floor, (x, y) => { const q = rm.onFloor(x, y); return Math.max((5 - q[1]) / 5, (bx0 + 8 - q[0]) / 6, (q[0] - bx1 + 8) / 6); }, 0.4);
    band(s, rm.back, (x, y) => (by0 + 8 - y) / 5, 0.5);

    /* ---- left wall: a run of tall windows, the football field outside ---- */
    for (const [d0, d1] of [[4, 30], [38, 64], [72, 98], [106, 132]]) {
      const q = rm.lq(d0, d1, 14, 72);
      s.poly(rm.lq(d0 - 2, d1 + 2, 11, 75), P.trim[3]);
      s.poly(q, (x, y) => {
        const qq = rm.onLeft(x, y), v = qq[1], dd = qq[0];
        if (v > 58) return E(P.grass[4]);
        if (v > 50) { const t = (v - 50); return E((flo(t) % 2) ? P.concrete[3] : P.concrete[4]); }       // the bleachers
        if (v > 46 + Math.sin(dd * 0.4) * 1.5) return E(hash(flo(dd), flo(v)) < 0.5 ? P.leaf_red[3] : P.leaf_gold[3]);
        return E(v < 30 ? P.sky_day[3] : P.sky_day[4]);
      });
      // a lone figure at the top of the bleachers, sketchbook on his knees
      if (d0 === 38) { const f = rm.pr(bx0, 49, 50); s.rect(f[0], f[1] - 3, 1, 3, E(P.red[2])); s.px(f[0], f[1] - 4, E(P.hair_brown[3])); }
      const dm = (d0 + d1) / 2;
      s.line(...rm.pr(bx0, 14, dm), ...rm.pr(bx0, 72, dm), P.trim[4]);
      s.line(...rm.pr(bx0, 40, d0), ...rm.pr(bx0, 40, d1), P.trim[4]);
      const a = rm.pr(bx0, by1, d0 + 10), b = rm.pr(bx0, by1, d1 + 10), c = rm.pr(bx0 + 64, by1, d1 + 30), dd = rm.pr(bx0 + 64, by1, d0 + 30);
      s.lightPoly('sun', [a, b, c, dd], 0.42);
    }

    /* ---- back wall: the Tigers mural, the clock, the tray return ---- */
    tigerMural(s, 92, 12);
    wallClock(s, 160, 18);
    s.rect(196, 14, 62, 30, P.ink[2]); s.rect(197, 15, 60, 28, P.board[2]);
    text(s, 200, 17, 'TODAY', P.yellow[4]);
    text(s, 200, 24, 'TIGER PIZZA', P.chalk[4]); text(s, 200, 30, 'TATER TOTS', P.chalk[4]); text(s, 200, 36, 'MILK 25¢'.replace('¢', 'C'), P.chalk[3]);
    shadeRect(s, 196, 44, 63, 1, -1);
    // tray return: a hatch onto the dish room
    s.rect(222, 54, 46, 22, P.steel[2]); s.rect(224, 56, 42, 16, P.steel[1]); s.rect(224, 72, 42, 4, P.steel[4]); s.hline(222, 267, 54, P.steel[4]);
    for (let xx = 226; xx < 264; xx += 6) s.rect(xx, 69, 4, 3, P.tabletop[2]);
    text(s, 230, 47, 'TRAYS', P.ink[3]);
    // the doors at the back left
    s.rect(40, 50, 36, by1 - 50, P.trim[2]);
    for (const dx of [42, 59]) { s.rect(dx, 52, 15, by1 - 52, P.tiger[3]); s.vline(dx, 52, by1 - 1, P.tiger[4]); s.rect(dx + 4, 56, 7, 12, P.sky_day[4]); s.rect(dx + 2, 76, 11, 2, P.steel[4]); }
    s.rect(52, 42, 12, 6, P.red[3]); text(s, 53, 43, 'EXIT', P.white[5]);

    /* ---- right wall: the serving line under its sneeze guard ---- */
    const sl = box(s, rm, { x0: 252, x1: 288, y0: by1 - 26, y1: by1, d0: 6, d1: 110 }, P.steel, { base: 3 });
    if (sl.faces.top) {
      for (let d = 12; d < 104; d += 14) { const pans = rm.fq(256, 284, d, d + 10, by1 - 26); s.poly(pans, P.steel[1]); const c = rm.pr(270, by1 - 26, d + 5); s.rect(c[0] - 3, c[1] - 1, 7, 2, rng.pick([P.tiger[4], P.yellow[4], P.leaf_red[3], P.grass[4], P.cream[4]])); }
      for (const d of [8, 108]) { const a = rm.pr(256, by1 - 26, d), b = rm.pr(256, by1 - 46, d); s.line(a[0], a[1], b[0], b[1], P.steel[4]); }
      s.poly([rm.pr(256, by1 - 46, 8), rm.pr(256, by1 - 46, 108), rm.pr(266, by1 - 40, 108), rm.pr(266, by1 - 40, 8)], (x, y) => (PX.bayer(x, y) < 0.25 ? E(P.white[4]) : 0));
    }
    s.light('white', 270, 90, 50, 40, 0.3);
    // stacked trays at the head of the line
    for (let k = 0; k < 6; k++) { const a = rm.pr(240, by1 - 28 - k * 1.2, 112); s.rect(a[0] - 8, a[1], 16, 1, k & 1 ? P.tiger[2] : P.tiger[3]); }

    /* ---- the tables: long, with benches; kids at the far ends ---- */
    const tables = [[50, 90], [110, 144], [176, 210], [230, 244]];
    for (const [x0, x1] of tables) shadePoly(s, rm.fq(x0 - 6, x1 + 6, 8, 140), -1, 0.55);
    for (const [x0, x1] of tables) {
      const ty = by1 - 24, right = x0 > rm.vx;
      const bench = (bx0b, bx1b) => {
        box(s, rm, { x0: bx0b, x1: bx1b, y0: by1 - 14, y1: by1 - 12, d0: 10, d1: 136 }, P.tiger, { base: 2, top: 3 });
        for (const d of [14, 72, 132]) { const a = rm.pr((bx0b + bx1b) / 2, by1 - 12, d), b = rm.pr((bx0b + bx1b) / 2, by1, d); s.line(a[0], a[1], b[0], b[1], P.steel[2]); }
      };
      const far = right ? [x0 - 9, x0 - 3] : [x1 + 3, x1 + 9], near = right ? [x1 + 3, x1 + 9] : [x0 - 9, x0 - 3];
      bench(...far);
      // kids on the far bench, from the back of the room forward
      for (let d = 12; d < 96; d += rng.int(5, 9)) if (rng() < 0.8) { const p = rm.pr((far[0] + far[1]) / 2, by1 - 14, d); kid(s, p[0], p[1], rm.S(d), rng); }
      for (const d of [14, 72, 132]) for (const lx of [x0 + 3, x1 - 3]) { const a = rm.pr(lx, ty, d), b = rm.pr(lx, by1, d); s.line(a[0], a[1], b[0], b[1], P.steel[2]); }
      const t = box(s, rm, { x0, x1, y0: ty - 2, y1: ty, d0: 8, d1: 138 }, P.wood_pale, { base: 2, top: 3 });
      if (t.faces.top) s.line(...t.faces.top[3], ...t.faces.top[2], P.wood_pale[4]);
      // trays and milk cartons
      for (let d = 12; d < 132; d += rng.int(10, 18)) {
        if (rng() < 0.45) continue;
        const u = rng.range(0.2, 0.8), p = rm.pr(x0 + (x1 - x0) * u, ty - 2, d), k = rm.S(d);
        const w = Math.max(3, rnd(5 * k)), hh = Math.max(1, rnd(1.6 * k));
        s.rect(p[0] - w, p[1] - hh, w * 2, hh + 1, P.steel[3]); s.hline(p[0] - w, p[0] + w - 1, p[1] - hh, P.steel[4]); s.px(p[0] - 1, p[1] - hh + 1, rng.pick([P.tiger[4], P.yellow[4], P.leaf_red[3]]));
        if (rng() < 0.6) { s.rect(p[0] + w - 2, p[1] - hh - rnd(2 * k), Math.max(1, rnd(1.5 * k)), rnd(2 * k), P.white[4]); }
      }
      for (let d = 12; d < 90; d += rng.int(6, 10)) if (rng() < 0.65) { const p = rm.pr((near[0] + near[1]) / 2, by1 - 14, d); kid(s, p[0], p[1], rm.S(d), rng); }
      bench(...near);
    }

    /* ---- ceiling lights ---- */
    for (const x0 of [70, 140, 210]) for (const [d0, d1] of [[10, 22], [50, 62]]) {
      s.poly(rm.fq(x0, x0 + 40, d0, d1, by0), P.metal[3]);
      s.poly(rm.fq(x0 + 2, x0 + 38, d0 + 1, d1 - 1, by0), E(P.white[5]));
    }
    s.light('white', 160, 70, 170, 70, 0.22);
  }

  function tigerMural(s, x, y) {
    // a painted tiger head over GO TIGERS, a little faded on the block
    const cx = x + 18, cy = y + 13;
    s.ellipse(cx, cy, 13, 11, (xx, yy, nx, ny) => {
      const stripe = (Math.abs(nx) > 0.45 && ((yy + rnd(Math.abs(nx) * 6)) % 5 < 2)) || (ny < -0.55 && (xx % 5 < 2));
      return stripe ? P.ink[2] : cl(P.tiger, nx < -0.4 ? 4 : 3);
    });
    for (const side of [-1, 1]) { s.poly([[cx + side * 9, cy - 8], [cx + side * 13, cy - 15], [cx + side * 4, cy - 10]], P.tiger[3]); s.px(cx + side * 10, cy - 11, P.pink[4]); }
    s.ellipse(cx, cy + 5, 6, 4, P.white[4]);
    s.rect(cx - 7, cy - 3, 4, 2, P.yellow[5]); s.rect(cx + 3, cy - 3, 4, 2, P.yellow[5]); s.px(cx - 5, cy - 3, P.ink[1]); s.px(cx + 5, cy - 3, P.ink[1]);
    s.rect(cx - 2, cy + 2, 4, 2, P.pink[3]); s.hline(cx - 3, cx + 3, cy + 6, P.ink[2]);
    bigText(s, x + 36, y + 4, 'GO', P.tiger[3], 2); bigText(s, x + 36, y + 16, 'TIGERS!', P.ink[3], 2);
    // fade: dither the block grain back through the paint
    for (let yy = y - 4; yy < y + 30; yy++) for (let xx = x - 2; xx < x + 98; xx++) {
      const v = s.get(xx, yy);
      if (v && PX.bayer(xx, yy) < 0.12 && !H.isE(v)) s.px(xx, yy, SH(v, 1));
    }
  }
  /* ================================================================== */
  /* DOT'S DINER — twelve stools, six booths, a pie case like a jewelry */
  /* store, and the jukebox on Patsy Cline                               */
  /* ================================================================== */
  R('vinyl', ['#2a0810', '#4e0f1a', '#7a1824', '#a2252e', '#c63e3e', '#e26a5c']);
  R('formica', ['#2c3a3a', '#46605c', '#6a8c84', '#90b2a6', '#b6d2c4', '#dcefe2']);
  R('pie', ['#3a1a10', '#6a3418', '#9a5a26', '#c88a3e', '#e6b468', '#f6dca0']);
  R('berry', ['#140c2a', '#24184a', '#3a2a6e', '#56428e', '#7a64b0', '#a48ed0']);

  PX.bg('diner', {
    times: ['day', 'afternoon'],
    draw(s, o) { diner(s, o); }
  });

  function diner(s, o) {
    const aft = o.time === 'afternoon';
    const rm = Room({ vx: 150, vy: 58, bx0: 34, by0: 8, bx1: 276, by1: 104, z0: 210 });
    const { bx0, bx1, by0, by1 } = rm, rng = PX.rng('diner');
    /* ---- shell: cream walls over a chrome band and mint wainscot, checker floor ---- */
    const wall = (u, v) => (v > by1 - 30 ? (v < by1 - 28 ? P.chrome[4] : ((u % 8 + 8) % 8 < 1 ? P.formica[2] : P.formica[3])) : v < by0 + 6 ? P.formica[3] : P.wall_cream[4]);
    s.poly(rm.back, (x, y) => wall(x, y));
    s.poly(rm.left, (x, y) => { const q = rm.onLeft(x, y); return SH(wall(q[0], q[1]), -1); });
    s.poly(rm.right, (x, y) => { const q = rm.onRight(x, y); return SH(wall(q[0], q[1]), -1); });
    s.poly(rm.ceil, (x, y) => { const q = rm.onCeil(x, y); return (q[1] % 20) < 1 / q[2] * 2 ? P.ceil[3] : P.ceil[4]; });
    s.poly(rm.floor, (x, y) => {
      const q = rm.onFloor(x, y), w = 0.7 / q[2], fu = ((q[0] % 6) + 6) % 6, fd = ((q[1] % 6) + 6) % 6;
      const dark = (flo(q[0] / 6) + flo(q[1] / 6)) & 1;
      if (fu < w || fd < w * 1.5) return dark ? P.wall_blue[2] : P.vct[3];
      return dark ? P.wall_blue[3] : P.vct[4];
    });
    band(s, rm.floor, (x, y) => { const q = rm.onFloor(x, y); return Math.max((5 - q[1]) / 5, (q[1] - 70) / 60); }, 0.4);
    band(s, rm.back, (x, y) => (by0 + 10 - y) / 6, 0.5);

    /* ---- left wall: the front windows on Center Street ---- */
    for (const [d0, d1] of [[2, 40], [48, 86], [94, 132]]) {
      s.poly(rm.lq(d0 - 2, d1 + 2, 20, 74), P.chrome[3]);
      s.poly(rm.lq(d0, d1, 22, 72), (x, y) => {
        const q = rm.onLeft(x, y), v = q[1], dd = q[0];
        // across the street: brick fronts, an awning, the sidewalk
        if (v > 64) return E(P.concrete[4]);
        if (v > 58) return E((flo(dd / 6) & 1) ? P.white[4] : P.leaf_red[3]);
        if (v > 30) { const col = flo(dd / 14) % 3; const brk = [P.brick, P.house_yellow, P.stone_warm][col]; return E((v % 8 < 4 && (dd % 14) > 4 && (dd % 14) < 10) ? P.sky_day[2] : brk[3]); }
        return E(P.sky_day[aft ? 4 : 3]);
      });
      s.line(...rm.pr(bx0, 46, d0), ...rm.pr(bx0, 46, d1), P.chrome[4]);
      // DINER in red neon, backwards from in here, on the middle pane
      if (d0 === 48) { const c = rm.pr(bx0, 30, 67); text(s, c[0] - 9, c[1], 'RENID', E(P.neon[4])); s.light('red', c[0], c[1] + 2, 16, 8, 0.4); }
      // sun through the glass across the booths and the floor
      const a = rm.pr(bx0, by1, d0 + (aft ? 14 : 6)), b = rm.pr(bx0, by1, d1 + (aft ? 14 : 6)), c = rm.pr(bx0 + (aft ? 110 : 60), by1, d1 + (aft ? 50 : 26)), dd = rm.pr(bx0 + (aft ? 110 : 60), by1, d0 + (aft ? 50 : 26));
      s.lightPoly('sun', [a, b, c, dd], aft ? 0.75 : 0.45);
    }

    /* ---- back wall: kitchen pass, menu board, clock, the jukebox ---- */
    s.rect(96, 18, 108, 16, P.ink[2]); s.rect(97, 19, 106, 14, P.board[1]);
    text(s, 100, 21, 'PIE 1.25', P.white[5]); text(s, 100, 27, 'COFFEE .50', P.white[5]);
    text(s, 146, 21, 'BLT 2.75', P.white[5]); text(s, 146, 27, 'CHOWDER', P.white[5]); text(s, 178, 21, 'TODAY:', P.yellow[4]); text(s, 178, 27, 'BLUEB.', P.yellow[4]);
    s.rect(110, 40, 80, 24, P.chrome[2]); s.rect(112, 42, 76, 20, P.ink[1]);
    s.rect(112, 52, 76, 2, P.steel[4]); s.light('warm', 150, 52, 50, 20, 0.35);
    for (let k = 0; k < 5; k++) { s.rect(118 + k * 13, 37, 6, 7, P.paper[5]); s.hline(119 + k * 13, 122 + k * 13, 39, P.ink[4]); s.hline(119 + k * 13, 121 + k * 13, 41, P.ink[4]); }
    s.hline(114, 186, 36, P.chrome[4]);
    s.rect(140, 47, 18, 5, P.steel[3]); s.rect(144, 44, 4, 3, P.steel[2]); s.px(150, 45, E(P.fire[4]));   // the grill hood glow
    wallClock(s, 226, 24);
    s.rect(212, 38, 30, 20, P.white[4]); s.rect(213, 39, 28, 18, P.cream[5]); text(s, 216, 42, 'NO', P.ink[3]); text(s, 216, 49, 'CHECKS', P.ink[3]);
    jukebox(s, rm, 70, 94);

    /* ---- right: the counter, its stools, the pie case ---- */
    const cy = by1 - 28;
    const ct = box(s, rm, { x0: 226, x1: 262, y0: cy, y1: by1, d0: 0, d1: 150 }, P.formica, { base: 2, top: 4, paint: (name, poly) => {
      if (name === 'left') { s.poly(poly, (x, y) => { const q = rm.onFloor(x, y, by1); return y > poly[0][1] + 2 && hash(x >> 2, 0) < 0.5 ? P.formica[2] : P.formica[3]; }); return true; }
      return false;
    } });
    // chrome edge and the kick strip
    s.line(...rm.pr(226, cy, 0), ...rm.pr(226, cy, 150), P.chrome[5]);
    s.line(...rm.pr(226, cy + 2, 0), ...rm.pr(226, cy + 2, 150), P.chrome[2]);
    s.poly([rm.pr(226, by1 - 4, 0), rm.pr(226, by1 - 4, 150), rm.pr(226, by1, 150), rm.pr(226, by1, 0)], P.chrome[2]);
    // on the counter: the pie case, cake stands, a coffee urn, sugar and napkins
    pieCase(s, rm, 230, 258, 18, 40, cy);
    for (const d of [56, 92]) { const c = rm.pr(240, cy, d), k = rm.S(d); s.rect(c[0] - rnd(4 * k), c[1] - rnd(4 * k), rnd(8 * k), rnd(4 * k), P.steel[4]); s.hline(c[0] - rnd(4 * k), c[0] + rnd(4 * k) - 1, c[1] - rnd(4 * k), P.steel[5]); }
    { const c = rm.pr(250, cy, 8); s.rect(c[0] - 4, c[1] - 14, 8, 14, P.steel[3]); s.vline(c[0] - 3, c[1] - 13, c[1] - 1, P.steel[5]); s.rect(c[0] - 2, c[1] - 6, 3, 2, P.ink[2]); }
    // twelve stools, chrome posts and red tops
    for (let i = 0; i < 12; i++) {
      const d = 8 + i * 12, top = rm.pr(214, by1 - 18, d), base = rm.pr(214, by1, d), k = rm.S(d);
      s.vline(top[0], top[1], base[1], P.chrome[3]); s.ellipse(base[0], base[1], 3 * k, 0.9 * k, P.chrome[2]);
      s.ellipse(top[0], top[1] - 1, 5 * k, 1.8 * k, (x, y, nx, ny) => (ny < -0.2 ? P.vinyl[4] : P.vinyl[3]));
      s.ellipse(top[0], top[1] + rnd(k), 5 * k, 1.2 * k, (x, y, nx, ny) => (ny > 0.2 ? P.chrome[2] : 0));
    }

    /* ---- left: the booths under the windows, a table between each pair ---- */
    for (let i = 0; i < 4; i++) {
      const d = 6 + i * 34;
      booth(s, rm, bx0, d, d + 10);
      const tb = box(s, rm, { x0: bx0, x1: bx0 + 34, y0: by1 - 27, y1: by1 - 25, d0: d + 11, d1: d + 23 }, P.formica, { base: 3, top: 4 });
      const leg0 = rm.pr(bx0 + 24, by1 - 25, d + 17), leg1 = rm.pr(bx0 + 24, by1, d + 17); s.line(leg0[0], leg0[1], leg1[0], leg1[1], P.chrome[2]);
      if (tb.faces.top) { const c = rm.pr(bx0 + 8, by1 - 27, d + 16), k = rm.S(d + 16); s.rect(c[0], c[1] - rnd(3 * k), Math.max(1, rnd(1.5 * k)), rnd(3 * k), P.red[3]); s.rect(c[0] + rnd(2 * k), c[1] - rnd(2 * k), rnd(2 * k), rnd(2 * k), P.chrome[4]); }
      booth(s, rm, bx0, d + 24, d + 34, true);
    }
    // pendant lamps down the room
    for (const d of [20, 60, 100]) for (const x of [96, 200]) {
      const c = rm.pr(x, by0 + 22, d), t0 = rm.pr(x, by0, d), k = rm.S(d);
      s.vline(c[0], t0[1], c[1] - 2, P.ink[3]);
      s.ellipse(c[0], c[1], 3.4 * k, 2.6 * k, (xx, yy, nx, ny) => E(ny < -0.3 ? P.white[5] : P.lamp[5]));
      s.light('warm', c[0], c[1] + 18 * k, 28 * k, 22 * k, aft ? 0.25 : 0.32);
    }
  }

  function booth(s, rm, x0, d0, d1, facingBack) {
    const by1 = rm.by1;
    // the seat and the tall tufted back
    box(s, rm, { x0, x1: x0 + 30, y0: by1 - 16, y1: by1 - 4, d0, d1 }, P.vinyl, { base: 3, top: 4 });
    const bd = facingBack ? d1 - 3 : d0, bd1 = facingBack ? d1 : d0 + 3;
    const b = box(s, rm, { x0, x1: x0 + 30, y0: by1 - 44, y1: by1 - 16, d0: bd, d1: bd1 }, P.vinyl, { base: 3, top: 5 });
    const f = b.front;
    if (facingBack && f[2] > 4) for (let xx = f[0] + 3; xx < f[0] + f[2] - 2; xx += 4) s.vline(xx, f[1] + 2, f[1] + f[3] - 2, P.vinyl[2]);
    s.poly([rm.pr(x0, by1 - 4, d0), rm.pr(x0 + 30, by1 - 4, d0), rm.pr(x0 + 30, by1, d1), rm.pr(x0, by1, d1)], P.chrome[2]);
  }

  function pieCase(s, rm, x0, x1, d0, d1, cy) {
    const c = box(s, rm, { x0, x1, y0: cy - 22, y1: cy, d0, d1 }, null, { paint: (name, poly) => true });
    const f = c.front;
    // chrome frame edges; the glass itself left clear but for one glint
    for (const fc of Object.values(c.faces)) for (let i = 0; i < fc.length; i++) s.line(...fc[i], ...fc[(i + 1) % fc.length], P.chrome[4]);
    s.line(f[0] + 2, f[1] + f[3] - 3, f[0] + 7, f[1] + 2, E(P.white[4]));
    // shelves of pies glowing under the case light
    for (let k = 0; k < 3; k++) {
      const yy = f[1] + 3 + k * 7;
      s.hline(f[0], f[0] + f[2] - 1, yy + 5, P.chrome[4]);
      for (let i = 0; i < 3; i++) {
        const px0 = f[0] + 2 + i * 8, fill = [P.berry, P.leaf_red, P.yellow, P.pie][(k + i) % 4];
        s.rect(px0, yy + 2, 7, 3, P.pie[4]); s.hline(px0, px0 + 6, yy + 2, P.pie[5]); s.rect(px0 + 1, yy + 3, 5, 1, fill[3]);
        if ((k + i) % 3 === 0) { s.px(px0 + 2, yy + 1, P.pie[4]); s.px(px0 + 4, yy + 1, P.pie[4]); }
      }
    }
    s.rect(f[0], f[1], f[2], 1, E(P.white[4])); s.rect(f[0], f[1] + f[3] - 1, f[2], 1, P.chrome[3]);
    s.light('warm', f[0] + f[2] / 2, f[1] + f[3] / 2, f[2] * 0.8, f[3] * 0.7, 0.45);
  }

  function jukebox(s, rm, x0, x1) {
    const by1 = rm.by1;
    const c = box(s, rm, { x0, x1, y0: by1 - 44, y1: by1, d0: 2, d1: 14 }, P.wood, { base: 3 });
    const f = c.front, cx = f[0] + f[2] / 2;
    // the arched top, bubble tubes and the record window
    s.ellipse(cx, f[1] + 2, f[2] / 2, 9, (x, y, nx, ny) => (y > f[1] + 2 ? 0 : Math.abs(nx) > 0.78 ? E(P.lamp[4]) : Math.abs(nx) > 0.6 ? E(P.neon[4]) : P.wood[3]));
    for (const side of [0, 1]) { const tx = side ? f[0] + f[2] - 5 : f[0] + 2; for (let yy = f[1]; yy < f[1] + f[3] - 6; yy++) { s.px(tx, yy, E(cl(P.lamp, 3 + (yy % 4 === 0 ? 2 : 0)))); s.px(tx + 1, yy, E(cl(P.neon, 3 + (yy % 5 === 2 ? 2 : 0)))); s.px(tx + 2, yy, E(P.tv[3 + (yy % 3 === 0 ? 1 : 0)])); } }
    s.rect(f[0] + 6, f[1] + 3, f[2] - 12, 10, P.ink[2]); s.ellipse(cx, f[1] + 9, 4, 2, P.ink[1]); s.px(cx, f[1] + 9, P.red[3]);
    s.rect(f[0] + 6, f[1] + 15, f[2] - 12, 8, E(P.paper[5])); for (let yy = f[1] + 16; yy < f[1] + 23; yy += 2) s.hline(f[0] + 7, f[0] + f[2] - 8, yy, P.ink[4]);
    for (let xx = f[0] + 6; xx < f[0] + f[2] - 6; xx += 2) s.vline(xx, f[1] + 26, f[1] + f[3] - 4, P.chrome[3]);
    s.light('warm', cx, f[1] + 10, 26, 30, 0.6); s.light('red', cx, f[1] + 20, 18, 24, 0.25);
  }

  /* ================================================================== */
  /* LOW TIDE RECORDS — long and narrow, posters on every inch           */
  /* ================================================================== */
  R('crate', ['#2a1a10', '#4a2e18', '#6e4624', '#926234', '#b48048', '#d0a266']);

  PX.bg('records', {
    times: ['day'],
    draw(s, o) { records(s, o); }
  });

  function records(s, o) {
    // from the back of the shop toward the sunny front window
    const rm = Room({ vx: 158, vy: 60, bx0: 104, by0: 20, bx1: 214, by1: 96, z0: 140 });
    const { bx0, bx1, by0, by1 } = rm, rng = PX.rng('records');
    /* ---- the far wall is the shop front: window, door, Center Street ---- */
    s.poly(rm.back, P.wood_dark[2]);
    s.rect(bx0 + 4, by0 + 6, 64, 54, P.wood_dark[1]);
    for (let y = by0 + 7; y < by0 + 59; y++) for (let x = bx0 + 5; x < bx0 + 67; x++) {
      const v = y - by0 - 7, u = x - bx0 - 5;
      let c = v < 18 ? P.sky_day[4] : v < 40 ? ((u % 16) < 12 ? (v % 9 < 5 && (u % 16) > 3 && (u % 16) < 9 ? P.sky_day[2] : P.brick[3]) : P.stone_warm[3]) : v < 44 ? P.leaf_gold[3] : P.concrete[4];
      if (v > 34 && v < 40 && (u % 12) < 7) c = P.mustard[3];   // an awning across the street
      s.px(x, y, E(c));
    }
    // LOW TIDE RECORDS on the glass, backwards
    text(s, bx0 + 9, by0 + 10, 'SDROCER EDIT WOL', E(P.mustard[4]));
    s.vline(bx0 + 36, by0 + 6, by0 + 59, P.wood_dark[1]);
    // the door, propped open, a sliver of the street
    s.rect(bx0 + 74, by0 + 8, 26, by1 - by0 - 8, P.wood_dark[1]); s.rect(bx0 + 76, by0 + 10, 22, by1 - by0 - 10, E(P.concrete[4])); s.rect(bx0 + 76, by0 + 10, 22, 30, E(P.sky_day[4]));
    s.rect(bx0 + 92, by0 + 10, 6, by1 - by0 - 12, P.wood[3]);
    // the light pouring in along the floor
    s.lightPoly('sun', [[bx0 + 4, by1], [bx0 + 100, by1], [260, 180], [40, 180]], 0.35, { fade: { x0: 158, y0: by1, x1: 158, y1: 180 } });
    s.light('sun', 158, by1 - 10, 90, 40, 0.4);
    /* ---- the side walls: posters on every inch ---- */
    const posterWall = (left) => {
      s.poly(left ? rm.left : rm.right, (x, y) => {
        const q = left ? rm.onLeft(x, y) : rm.onRight(x, y), d = q[0], v = q[1];
        const PW = 11, PH = 15, sh = (flo(v / PH) & 1) * 5;
        const col = flo((d + sh) / PW), row = flo(v / PH), h = hash(col * 3 + (left ? 0 : 99), row);
        const fu = ((d + sh) % PW + PW) % PW, fv = ((v % PH) + PH) % PH;
        if (fu < 0.7 || fv < 1) return P.wood_dark[1];
        const pr = [P.red, P.mustard, P.teal, P.pink, P.navy, P.cream, P.green_jkt, P.ink, P.violet, P.leaf_orange][flo(h * 997) % 10];
        const kind = flo(h * 61) % 3, side = left ? 0 : -1;
        if (fv > 2 && fv < 4 && fu > 2 && fu < PW - 2) return cl(pr, 5 + side);                 // title band
        if (kind === 0 && Math.hypot(fu - PW / 2, fv - 9) < 3) return cl(pr, 1 + side);          // a sun / a face
        if (kind === 1 && fv > 6 && fv < 13 && fu > 2 && fu < PW - 2) return cl(pr, (fv > 9 ? 1 : 2) + side);   // a photo block
        if (kind === 2 && fv > 6 && Math.abs(fu - PW / 2) < (fv - 6) * 0.5) return cl(pr, 1 + side);          // a peak
        return cl(pr, 3 + side);
      });
    };
    posterWall(true); posterWall(false);
    // the Static Hours flyer, right by the counter
    { const q = rm.rq(46, 60, 30, 50); s.poly(q, P.paper[5]); const c = rm.pr(bx1, 33, 48); text(s, c[0] + 1, c[1], 'STATIC', P.ink[2]); text(s, c[0] + 3, c[1] + 6, 'HOURS', P.ink[2]); }
    s.poly(rm.ceil, (x, y) => { const q = rm.onCeil(x, y); return (q[1] % 14) < 1.5 / q[2] ? P.wood_dark[2] : P.wood[2]; });
    H.plankFloor(s, rm, P.wood, { pw: 7, base: 2, seed: 'rec-floor' });
    band(s, rm.floor, (x, y) => (y - 130) / 40, 0.5);
    /* ---- record bins down both sides ---- */
    const bins = (x0, x1, left) => {
      for (let d = 4; d < 128; d += 18) {
        const b = box(s, rm, { x0, x1, y0: by1 - 20, y1: by1, d0: d, d1: d + 16 }, P.crate, { base: 3 });
        if (b.faces.top) {
          // LP spines standing in the crate
          const tq = b.faces.top;
          for (let k = 1; k < 12; k++) {
            const dd = d + k * 1.3, a = rm.pr(x0 + 1, by1 - 20, dd), c = rm.pr(x1 - 1, by1 - 20, dd), hh = rnd(4 * rm.S(dd));
            s.line(a[0], a[1] - hh, c[0], c[1] - hh, cl(rng.pick([P.ink, P.cream, P.red, P.navy, P.mustard, P.white_cloth]), 3 + (k & 1)));
          }
        }
        const f = b.front; if (f[2] > 3) { s.rect(f[0] + 2, f[1] + 2, Math.min(10, f[2] - 4), 3, P.paper[5]); }
      }
    };
    bins(bx0 - 2, bx0 + 22, true);
    // the counter on the right: register, turntable, tape racks behind
    const ct = box(s, rm, { x0: bx1 - 30, x1: bx1, y0: by1 - 26, y1: by1, d0: 30, d1: 100 }, P.wood_dark, { base: 3, top: 4 });
    if (ct.faces.top) {
      const r0 = rm.pr(bx1 - 22, by1 - 26, 44); s.rect(r0[0] - 6, r0[1] - 10, 12, 10, P.metal[3]); s.rect(r0[0] - 5, r0[1] - 9, 10, 3, E(P.lantern[4])); s.hline(r0[0] - 6, r0[0] + 5, r0[1] - 10, P.metal[5]);
      const t0 = rm.pr(bx1 - 18, by1 - 26, 76), k = rm.S(76); s.rect(t0[0] - rnd(8 * k), t0[1] - 3, rnd(16 * k), 3, P.ink[3]); s.ellipse(t0[0], t0[1] - 4, 5 * k, 1.6 * k, P.ink[1]); s.px(t0[0], t0[1] - 4, P.red[3]);
      // a coffee mug of cereal
      const m0 = rm.pr(bx1 - 26, by1 - 26, 62); s.rect(m0[0], m0[1] - 5, 5, 5, P.cream[4]); s.hline(m0[0], m0[0] + 4, m0[1] - 5, P.mustard[4]);
    }
    s.poly(rm.rq(30, 100, by1 - 52, by1 - 32), (x, y) => { const q = rm.onRight(x, y), row = flo(q[1] / 4); return (q[1] % 4 < 1) ? P.wood_dark[1] : cl(rng.pick ? [P.ink, P.red, P.mustard, P.teal, P.cream][(flo(q[0] / 1.2) + row * 3) % 5] : P.ink, 3); });
    // a hand-lettered sign over the bins
    { const a = rm.pr(bx0, 50, 70); s.rect(a[0] - 2, a[1] - 2, 44, 9, P.cream[5]); s.hline(a[0] - 2, a[0] + 41, a[1] + 6, P.cream[2]); text(s, a[0], a[1], 'USED $1.50', P.red[3]); }
    // a ceiling fan and two bare bulbs
    for (const d of [40, 90]) { const c = rm.pr(158, by0 + 8, d); s.vline(c[0], 0, c[1], P.ink[3]); s.circle(c[0], c[1] + 2, 2 * rm.S(d), E(P.lamp[5])); s.light('warm', c[0], c[1] + 30, 50 * rm.S(d), 40 * rm.S(d), 0.4); }
  }
})();
