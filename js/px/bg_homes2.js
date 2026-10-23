/* What Derry Keeps — more home interiors, pixel art.
 *   hall_up     the upstairs hall at 9 Larch St          night
 *   attic       the attic, by flashlight                  flashlight
 *   teddy_room  Teddy Okafor's room                       night
 *   ashgrove    the Ashgrove front hall, a party          night
 * Uses the Room / box helpers from bg_homes.js (PX.HOME).
 */
(function () {
  'use strict';
  const P = PX.P, E = PX.E, SH = PX.sh, R = PX.ramp, H = PX.HOME;
  const rnd = Math.round, flo = Math.floor;
  const cl = (r, s) => r[Math.max(0, Math.min(r.length - 1, s))];
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const { Room, box, text, textW, shadePoly, shadeRect, band } = H;

  R('stripe_p', ['#2c2230', '#4a3a4c', '#6c5866', '#8f7a84', '#b29ea2', '#d2c2c0']);   // old striped paper
  R('runner2', ['#1a0e14', '#30161e', '#4c2028', '#6a2c30', '#8a4038', '#a85e48']);
  R('damask', ['#1c0a0e', '#330f16', '#4e1820', '#6a222a', '#863434', '#a24e46']);
  R('carpet_b', ['#141a2a', '#202a42', '#2e3b5a', '#3f4f72', '#55688c', '#7084a6']);
  R('glow', ['#1e3a24', '#2e5a36', '#47864c', '#6cb46a', '#a2e092', '#d8ffc8']);      // glow-in-the-dark stars

  /* ================================================================== */
  /* HALL_UP — long and narrow, the runner, Mémère's door ajar on her   */
  /* night light, and the padlocked hatch in the ceiling                 */
  /* ================================================================== */
  PX.bg('hall_up', {
    times: ['night'],
    draw(s, o) { hallUp(s, o); }
  });

  function hallUp(s, o) {
    const rm = Room({ vx: 160, vy: 62, bx0: 124, by0: 26, bx1: 196, by1: 104, z0: 150 });
    const { bx0, bx1, by0, by1 } = rm;
    const paper = (u, v) => { const k = ((u % 8) + 8) % 8; return k < 1 ? P.stripe_p[2] : k < 4 ? P.stripe_p[4] : k < 5 ? P.stripe_p[3] : P.stripe_p[4]; };
    const wall = (u, v) => (v > by1 - 14 ? (v < by1 - 12 ? P.wood[4] : P.wood[3]) : v > by1 - 34 && v < by1 - 32 ? P.wood[4] : paper(u, v));
    s.poly(rm.back, (x, y) => wall(x, y));
    s.poly(rm.left, (x, y) => { const q = rm.onLeft(x, y); return SH(wall(q[0] * 0.9, q[1]), -1); });
    s.poly(rm.right, (x, y) => { const q = rm.onRight(x, y); return SH(wall(q[0] * 0.9, q[1]), -1); });
    s.poly(rm.ceil, P.ceil[3]);
    H.plankFloor(s, rm, P.wood, { pw: 6, base: 3, seed: 'hall-floor' });
    // the runner down the middle
    s.poly(rm.fq(140, 180, 0, rm.far), (x, y) => {
      const q = rm.onFloor(x, y), u = q[0] - 140;
      if (u < 1.5 || u > 38.5) return P.mustard[2];
      if (u < 4 || u > 36) return P.runner2[2];
      const z = Math.abs(((q[1] % 10) + 10) % 10 - 5) + Math.abs(u - 20) * 0.4;
      return z < 3 ? P.runner2[4] : (flo(z) % 3 === 0 ? P.cream[3] : P.runner2[3]);
    });
    band(s, rm.floor, (x, y) => { const q = rm.onFloor(x, y); return (5 - q[1]) / 4; }, 0.4);

    /* ---- the end of the hall: the window, moonlight ---- */
    const wx = 148, wy = 44, ww = 24, wh = 30;
    s.rect(wx - 3, wy - 3, ww + 6, wh + 7, P.trim[3]);
    s.vgrad(wx, wy, ww, wh, [E(P.sky_night[1]), E(P.sky_night[2]), E(P.sky_night[3])], 2);
    s.circle(wx + 17, wy + 7, 3, E(P.white[5])); s.px(wx + 16, wy + 6, E(P.cloud[3]));
    for (let k = 0; k < 6; k++) s.px(wx + 3 + k * 4, wy + 3 + (k * 5) % 9, E(P.cloud[2]));
    s.poly([[wx - 1, wy + 22], [wx + 8, wy + 16], [wx + 16, wy + 21], [wx + ww, wy + 18], [wx + ww, wy + wh], [wx - 1, wy + wh]], E(P.nite[1]));
    s.vline(wx + ww / 2, wy, wy + wh - 1, P.trim[3]); s.hline(wx, wx + ww - 1, wy + wh / 2, P.trim[3]);
    s.rect(wx - 4, wy + wh + 2, ww + 8, 2, P.trim[4]);
    // sheer curtains
    for (const side of [0, 1]) for (let yy = wy - 2; yy < wy + wh + 1; yy++) for (let k = 0; k < 4; k++) { const xx = side ? wx + ww - 4 + k : wx + k; if (PX.bayer(xx, yy) < 0.5) s.px(xx, yy, P.white_cloth[3 + H.fold(k, 2)]); }
    s.lightPoly('cool', [[wx, wy + wh], [wx + ww, wy + wh], [190, 160], [130, 160]], 0.35, { fade: { x0: 160, y0: wy + wh, x1: 160, y1: 170 } });
    s.light('cool', wx + ww / 2, wy + wh / 2, 30, 26, 0.5);

    /* ---- left wall: Gus's door (shut) and the bathroom (dark) ---- */
    const door = (d0, d1, right, ajar) => {
      const q = right ? rm.rq : rm.lq;
      s.poly(q(d0 - 2, d1 + 2, 40, by1), P.trim[3]);
      s.poly(q(d0, d1, 43, by1), ajar ? E(P.lamp[4]) : P.oak[3]);
      if (!ajar) {
        s.poly(q(d0 + 2, d1 - 2, 47, 70), P.oak[2]); s.poly(q(d0 + 2, d1 - 2, 74, by1 - 6), P.oak[2]);
        const kn = rm.pr(right ? bx1 : bx0, 76, right ? d0 + 3 : d1 - 3); s.rect(kn[0], kn[1], 2, 2, P.brass[4]);
      } else {
        // the door itself swung almost shut: a hand's width of warm light
        const lit = q(d0, d0 + 6, 43, by1);
        s.poly(q(d0 + 6, d1, 43, by1), P.oak[2]);
        s.poly(lit, E(P.lamp[4]));
        const kn = rm.pr(bx1, 76, d0 + 9); s.rect(kn[0], kn[1], 2, 2, P.brass[4]);
        const a = rm.pr(bx1, by1, d0), b = rm.pr(bx1, by1, d0 + 6);
        s.lightPoly('warm', [a, b, rm.pr(bx1 - 30, by1, d0 + 20), rm.pr(bx1 - 34, by1, d0 + 2)], 0.8);
        s.light('warm', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 20, 24, 40, 0.55);
      }
    };
    door(10, 30, false, false);
    door(56, 80, false, false);
    door(18, 40, true, true);
    // a holy picture and a little table with the phone
    { const q = rm.rq(52, 66, 50, 68); s.poly(rm.rq(51, 67, 49, 69), P.brass[3]); s.poly(q, P.navy[3]); const c = rm.pr(bx1, 58, 59); s.circle(c[0], c[1], 2, P.mustard[4]); s.rect(c[0] - 1, c[1] + 2, 3, 5, P.sky_day[2]); }
    const tb = box(s, rm, { x0: bx0, x1: bx0 + 10, y0: by1 - 22, y1: by1, d0: 36, d1: 50 }, P.wood, { base: 3 });
    if (tb.faces.top) { const c = rm.pr(bx0 + 5, by1 - 22, 43); s.rect(c[0] - 3, c[1] - 3, 6, 3, P.cream[4]); s.hline(c[0] - 3, c[0] + 2, c[1] - 3, P.cream[5]); s.rect(c[0] - 2, c[1] - 5, 4, 2, P.cream[3]); }

    /* ---- the ceiling: the attic hatch, padlocked ---- */
    const hq = rm.fq(146, 174, 22, 40, by0);
    s.poly(rm.fq(144, 176, 20, 42, by0), P.trim[2]);
    s.poly(hq, P.ceil[2]);
    s.line(...hq[3], ...hq[2], P.ceil[4]);
    const hp = rm.pr(170, by0, 39);
    s.rect(hp[0] - 1, hp[1] + 1, 3, 3, P.metal[4]); s.rect(hp[0] - 2, hp[1] + 4, 5, 4, P.brass[3]); s.hline(hp[0] - 2, hp[0] + 2, hp[1] + 4, P.brass[5]); s.px(hp[0], hp[1] + 6, P.ink[2]);
    // the pull cord
    const pc = rm.pr(152, by0, 36); s.vline(pc[0], pc[1], pc[1] + 9, P.white_cloth[2]); s.px(pc[0], pc[1] + 10, P.cream[4]);
    band(s, rm.ceil, (x, y) => (y < 10 ? 1.5 : 0.6), 0.5);
    // the plug-in night light low on the left
    const nl = rm.pr(bx0, by1 - 18, 46); s.rect(nl[0] - 2, nl[1], 3, 3, E(P.lamp[5])); s.light('warm', nl[0], nl[1] + 8, 18, 14, 0.5);
    band(s, [[0, 0], [320, 0], [320, 180], [0, 180]], (x, y) => Math.abs(x - 160) / 120 - 0.3, 0.5);
  }

  /* ================================================================== */
  /* ATTIC — by flashlight: rafters, NOËL and CLAIRE — SCHOOL and        */
  /* HENRI — TAXES, a dress form, a rocking horse, and the loose board  */
  /* ================================================================== */
  PX.bg('attic', {
    times: ['flashlight'],
    draw(s, o) { attic(s, o); }
  });

  function attic(s, o) {
    const rm = Room({ vx: 160, vy: 70, bx0: 70, by0: 10, bx1: 250, by1: 118, z0: 170 });
    const { bx0, bx1, by0, by1 } = rm, rng = PX.rng('attic');
    // the gable: steep roof planes meeting at the ridge (x = 160)
    const ridgeY = by0, kneeY = 84;
    const roofL = (x) => ridgeY + (kneeY - ridgeY) * (160 - x) / (160 - bx0), roofR = (x) => ridgeY + (kneeY - ridgeY) * (x - 160) / (bx1 - 160);
    const gable = [[160, ridgeY], [bx1, kneeY], [bx1, by1], [bx0, by1], [bx0, kneeY]];
    s.poly(gable, (x, y) => { const k = ((x % 9) + 9) % 9; return k < 1 ? P.wood_pale[1] : hash(flo(x / 9), flo(y / 30)) < 0.2 ? P.wood_pale[2] : P.wood_pale[3]; });
    // roof planes: boards between rafters running into depth
    const plane = (left) => [left ? [bx0, kneeY] : [bx1, kneeY], [160, ridgeY], rm.p(160, ridgeY, rm.far), left ? rm.p(bx0, kneeY, rm.far) : rm.p(bx1, kneeY, rm.far)];
    for (const left of [true, false]) {
      s.poly(plane(left), (x, y) => {
        // find depth along the plane from the screen x (rafters every 16)
        const ex = left ? bx0 : bx1, sx = (x + 0.5 - rm.vx), k = sx / (ex - rm.vx + (160 - ex) * 0);
        const kk = Math.max(1, Math.abs(sx) / Math.abs((left ? bx0 : bx1) - rm.vx) * 0 + 1);
        const v = y; return ((rnd(x * 0.5 + y * (left ? -0.4 : 0.4)) % 4) === 0) ? P.wood_dark[2] : P.wood_dark[3];
      });
    }
    // rafters converging on the vanishing point, and the collar ties
    for (let d = 0; d < 200; d += 22) {
      const a = rm.pr(bx0, kneeY, d), b = rm.pr(160, ridgeY, d), c = rm.pr(bx1, kneeY, d), k = rm.S(d);
      for (let w = 0; w < Math.max(2, rnd(3 * k)); w++) { s.line(a[0], a[1] + w, b[0], b[1] + w, w === 0 ? P.wood[4] : P.wood[2]); s.line(b[0], b[1] + w, c[0], c[1] + w, w === 0 ? P.wood[3] : P.wood[1]); }
      if (d > 0) { const t0 = rm.pr(122, 40, d), t1 = rm.pr(198, 40, d); for (let w = 0; w < Math.max(2, rnd(2.5 * k)); w++) s.line(t0[0], t0[1] + w, t1[0], t1[1] + w, w ? P.wood[2] : P.wood[4]); }
    }
    // knee walls and the floorboards
    s.poly(rm.lq(0, rm.far, kneeY, by1), (x, y) => (x % 7 < 1 ? P.wood_pale[1] : P.wood_pale[2]));
    s.poly(rm.rq(0, rm.far, kneeY, by1), (x, y) => (x % 7 < 1 ? P.wood_pale[1] : P.wood_pale[2]));
    H.plankFloor(s, rm, P.wood_pale, { pw: 9, base: 2, seed: 'attic-floor' });

    /* ---- the round window in the gable, a dusty shaft of night ---- */
    s.circle(160, 40, 13, P.wood[2]); s.circle(160, 40, 11, E(P.sky_night[2]));
    s.vline(160, 29, 51, P.wood[2]); s.hline(149, 171, 40, P.wood[2]);
    s.px(156, 35, E(P.white[4])); s.px(165, 44, E(P.cloud[2]));
    s.lightPoly('cool', [[150, 46], [170, 46], [200, 150], [130, 150]], 0.18, { fade: { x0: 160, y0: 46, x1: 160, y1: 160 } });
    s.light('cool', 160, 40, 18, 18, 0.55);
    // dust motes in the shaft
    for (let i = 0; i < 26; i++) { const t = rng(), x = 152 + rng() * 16 + t * 40 * (rng() - 0.5), y = 50 + t * 90; s.px(x, y, E(P.white_cloth[rng() < 0.5 ? 2 : 3])); }

    /* ---- what the family didn't throw away ---- */
    const crate = (x0, x1, d0, d1, h, label, ramp) => {
      const c = box(s, rm, { x0, x1, y0: by1 - h, y1: by1, d0, d1 }, ramp || P.cardboard, { base: 3 });
      const f = c.front;
      s.rect(f[0] + rnd(f[2] / 2) - 1, f[1], 3, f[3], P.cardboard[2]);
      if (label) label.forEach((l, i) => text(s, f[0] + rnd((f[2] - textW(l)) / 2), f[1] + 3 + i * 7, l, P.ink[2]));
      shadePoly(s, rm.fq(x0 - 1, x1 + 4, d0, d1 + 3), -1, 0.6);
      return c;
    };
    crate(82, 112, 40, 60, 22, ['CLAIRE', 'SCHOOL']);
    crate(86, 108, 42, 58, 14, ['NOËL']).front;
    crate(196, 230, 30, 54, 20, ['HENRI', 'TAXES']);
    crate(204, 226, 34, 50, 12, null);
    // an old steamer trunk
    const tr = box(s, rm, { x0: 112, x1: 146, y0: by1 - 16, y1: by1, d0: 70, d1: 88 }, P.oxblood || P.maroon, { base: 3 });
    { const f = tr.front; for (const xx of [f[0] + 3, f[0] + f[2] - 5]) s.rect(xx, f[1], 2, f[3], P.brass[3]); s.rect(f[0] + rnd(f[2] / 2) - 2, f[1] + 2, 4, 3, P.brass[4]); }
    // the dress form with no head
    const df = rm.pr(208, by1, 74), k = rm.S(74);
    s.vline(df[0], df[1] - rnd(12 * k), df[1], P.wood[2]);
    s.poly([[df[0] - 3 * k, df[1] - 12 * k], [df[0] + 3 * k, df[1] - 12 * k], [df[0] + 2 * k, df[1] - 16 * k], [df[0] + 4 * k, df[1] - 26 * k], [df[0] + 3 * k, df[1] - 33 * k], [df[0] + 1 * k, df[1] - 35 * k], [df[0] - 1 * k, df[1] - 35 * k], [df[0] - 3 * k, df[1] - 33 * k], [df[0] - 4 * k, df[1] - 26 * k], [df[0] - 2 * k, df[1] - 16 * k]], (x, y) => (x < df[0] - k ? P.cream[3] : x < df[0] + k ? P.cream[2] : P.cream[1]));
    s.rect(df[0] - 1, df[1] - 37 * k, 2, 2 * k, P.wood[3]);
    // the rocking horse with one glass eye
    const rh = rm.pr(100, by1, 96), kr = rm.S(96);
    s.ellipse(rh[0], rh[1] - 1, 12 * kr, 2 * kr, (x, y, nx, ny) => (ny < 0 && Math.abs(nx) > 0.2 ? P.wood[3] : 0));
    s.rect(rh[0] - 8 * kr, rh[1] - 12 * kr, 15 * kr, 6 * kr, P.cream[3]); s.rect(rh[0] - 8 * kr, rh[1] - 12 * kr, 15 * kr, 2 * kr, P.cream[4]);
    s.rect(rh[0] + 5 * kr, rh[1] - 19 * kr, 4 * kr, 8 * kr, P.cream[3]); s.rect(rh[0] + 7 * kr, rh[1] - 18 * kr, 5 * kr, 4 * kr, P.cream[4]);
    s.rect(rh[0] + 4 * kr, rh[1] - 20 * kr, 2 * kr, 7 * kr, P.hair_dark[3]);
    s.px(rh[0] + 9 * kr, rh[1] - 17 * kr, E(P.white[5]));
    for (const lx of [-6, -3, 3, 5]) s.vline(rh[0] + lx * kr, rh[1] - 6 * kr, rh[1] - 2 * kr, P.cream[2]);
    // a lamp with no shade, a rolled rug, a sheet over a chair
    const lp = rm.pr(232, by1, 60); s.vline(lp[0], lp[1] - 20, lp[1], P.brass[3]); s.ellipse(lp[0], lp[1], 3, 1, P.brass[2]); s.circle(lp[0], lp[1] - 21, 1.5, P.white[3]);
    s.poly([rm.pr(130, by1 - 10, 30), rm.pr(186, by1 - 10, 30), rm.pr(186, by1, 34), rm.pr(130, by1, 34)], P.rosebud ? P.rosebud[2] : P.red[2]);
    const sh0 = rm.pr(176, by1, 92), ks = rm.S(92);
    s.poly([[sh0[0] - 9 * ks, sh0[1]], [sh0[0] - 7 * ks, sh0[1] - 22 * ks], [sh0[0], sh0[1] - 26 * ks], [sh0[0] + 8 * ks, sh0[1] - 20 * ks], [sh0[0] + 10 * ks, sh0[1]]], (x, y) => (PX.bayer(x, y) < 0.2 ? P.white_cloth[2] : x < sh0[0] ? P.white_cloth[4] : P.white_cloth[3]));

    /* ---- low on the gable wall, under the eaves: the loose board ---- */
    s.rect(226, by1 - 20, 9, 18, P.wood_pale[1]); s.rect(227, by1 - 19, 7, 16, P.ink[1]);
    s.rect(228, by1 - 10, 6, 7, P.cardboard[3]); s.hline(228, 233, by1 - 10, P.cardboard[4]);
    s.line(236, by1 - 21, 240, by1 - 2, P.wood_pale[4]); s.rect(236, by1 - 21, 3, 19, P.wood_pale[3]);

    /* ---- the flashlight: one bright pool, everything else dark ---- */
    s.light('white', 214, 92, 54, 40, 1.15);
    s.light('warm', 214, 92, 30, 24, 0.5);
    s.light('white', 98, 104, 46, 26, 0.55);       // the beam's last sweep, across the boxes
    s.lightPoly('white', [[160, 190], [190, 190], [230, 100], [200, 84]], 0.25);
  }

  /* ================================================================== */
  /* TEDDY_ROOM — a spaceship: stars on the ceiling in real              */
  /* constellations, the ham station glowing amber, a wall of QSL cards */
  /* ================================================================== */
  PX.bg('teddy_room', {
    times: ['night'],
    draw(s, o) { teddyRoom(s, o); }
  });

  function teddyRoom(s, o) {
    const rm = Room({ vx: 160, vy: 72, bx0: 52, by0: 22, bx1: 268, by1: 108, z0: 190 });
    const { bx0, bx1, by0, by1 } = rm, rng = PX.rng('teddy');
    // painted walls (a soft lavender), blue carpet, a white ceiling
    s.poly(rm.back, (x, y) => (hash(x >> 1, y >> 1) < 0.05 ? P.velvet[3] : P.velvet[4]));
    s.poly(rm.left, (x, y) => P.velvet[3]); s.poly(rm.right, (x, y) => P.velvet[3]);
    s.poly(rm.ceil, P.ceil[4]);
    s.poly(rm.floor, (x, y) => (hash(x, y) < 0.18 ? P.carpet_b[2] : hash(x + 1, y) < 0.08 ? P.carpet_b[4] : P.carpet_b[3]));
    s.rect(bx0, by1 - 3, bx1 - bx0, 3, P.white_cloth[3]);
    band(s, rm.back, (x, y) => (by0 + 6 - y) / 4, 0.5);
    // the stars: constellations, glowing on the ceiling
    const star = (u, d, big) => { const p = rm.pr(u, by0, d); s.px(p[0], p[1], E(P.glow[big ? 5 : 4])); if (big) { s.px(p[0] - 1, p[1], E(P.glow[3])); s.px(p[0] + 1, p[1], E(P.glow[3])); s.px(p[0], p[1] - 1, E(P.glow[3])); } };
    const dipper = [[80, 20], [96, 24], [110, 22], [122, 30], [126, 46], [146, 50], [148, 34]];
    const orion = [[190, 18], [214, 22], [198, 34], [204, 35], [210, 36], [192, 52], [218, 50]];
    const cass = [[140, 8], [150, 16], [160, 9], [170, 17], [180, 8]];
    for (const c of [dipper, orion, cass]) c.forEach(([u, d], i) => star(u, d, i % 3 === 0));
    for (let i = 0; i < 40; i++) star(rng.int(60, 260), rng.int(2, 70), false);

    /* ---- left wall: the window, the telescope ---- */
    const wq = rm.lq(26, 70, 34, 80);
    s.poly(rm.lq(24, 72, 32, 82), P.white_cloth[4]);
    s.poly(wq, (x, y) => { const q = rm.onLeft(x, y); return E(q[1] > 70 ? P.nite[1] : hash(flo(q[0]), flo(q[1])) < 0.03 ? P.white[4] : q[1] < 50 ? P.sky_night[1] : P.sky_night[2]); });
    s.line(...rm.pr(bx0, 57, 26), ...rm.pr(bx0, 57, 70), P.white_cloth[4]); s.line(...rm.pr(bx0, 34, 48), ...rm.pr(bx0, 80, 48), P.white_cloth[4]);
    s.lightPoly('cool', [rm.pr(bx0, by1, 30), rm.pr(bx0, by1, 70), rm.pr(bx0 + 40, by1, 90), rm.pr(bx0 + 40, by1, 46)], 0.3);
    // the telescope on its tripod, aimed out
    const tp = rm.pr(bx0 + 22, by1, 64), kt = rm.S(64);
    for (const dx of [-7, 0, 7]) s.line(tp[0] + dx * kt * 0.6, tp[1], tp[0], tp[1] - 22 * kt, P.ink[3]);
    s.line(tp[0] - 9 * kt, tp[1] - 20 * kt, tp[0] + 6 * kt, tp[1] - 28 * kt, P.white_cloth[4]);
    s.line(tp[0] - 9 * kt, tp[1] - 19 * kt, tp[0] + 6 * kt, tp[1] - 27 * kt, P.white_cloth[3]);
    s.line(tp[0] - 9 * kt, tp[1] - 18 * kt, tp[0] + 6 * kt, tp[1] - 26 * kt, P.white_cloth[2]);

    /* ---- back wall: posters, the QSL wall, the ham station ---- */
    // the shuttle, lifting off
    s.rect(70, 30, 26, 36, P.ink[2]); s.rect(71, 31, 24, 34, P.sky_night[3]);
    s.rect(81, 36, 4, 18, P.white[4]); s.poly([[81, 36], [83, 32], [85, 36]], P.white[4]); s.rect(78, 44, 3, 10, P.white[3]); s.rect(85, 44, 3, 10, P.white[3]);
    s.rect(80, 54, 6, 4, P.fire[4]); s.rect(81, 58, 4, 4, P.fire[3]); s.ellipse(83, 63, 9, 2, P.white_cloth[3]);
    text(s, 73, 33, 'STS', P.white[4]);
    // Saturn
    s.rect(214, 28, 30, 26, P.ink[2]); s.rect(215, 29, 28, 24, P.ink[1]);
    s.ellipse(229, 41, 13, 3, (x, y, nx, ny) => (ny > 0 || Math.abs(nx) > 0.55 ? P.mustard[4] : 0)); s.circle(229, 41, 7, (x, y) => (y < 40 ? P.yellow[4] : P.mustard[3]));
    s.ellipse(229, 41, 13, 3, (x, y, nx, ny) => (ny > 0.1 && Math.abs(nx) < 0.55 ? P.mustard[5] : 0));
    for (let i = 0; i < 6; i++) s.px(217 + i * 4, 31 + (i * 7) % 18, P.white[3]);
    // QSL cards from strangers in Belgium and Japan and everywhere
    s.rect(110, 26, 88, 34, P.cork[2]); s.rect(111, 27, 86, 32, P.cork[3]);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) {
      if (hash(c, r) < 0.12) continue;
      const cx = 113 + c * 9 + (r & 1 ? 2 : 0), cy = 28 + r * 8, col = [P.white_cloth, P.yellow, P.sky_day, P.pink, P.cream, P.leaf_orange][flo(hash(c + 7, r) * 6)];
      s.rect(cx, cy, 7, 6, col[4]); s.hline(cx, cx + 6, cy, col[5]); s.px(cx + 1, cy + 2, P.ink[3]); s.hline(cx + 1, cx + 4, cy + 4, col[2]);
    }
    text(s, 124, 20, 'KA1TDO', P.ink[3]);
    // the desk and the radio
    const dk = box(s, rm, { x0: 104, x1: 206, y0: by1 - 28, y1: by1, d0: 0, d1: 20 }, P.white_cloth, { base: 3 });
    const top = dk.faces.top;
    const rx = 126, ry = by1 - 28 - 17;
    s.rect(rx, ry, 40, 17, P.ink[2]); s.rect(rx + 1, ry + 1, 38, 15, P.ink[3]); s.hline(rx, rx + 39, ry, P.ink[4]);
    s.rect(rx + 3, ry + 3, 16, 7, E(P.amber[4])); s.rect(rx + 21, ry + 3, 16, 7, E(P.amber[4]));
    s.line(rx + 6, ry + 9, rx + 12, ry + 4, P.ink[1]); s.line(rx + 28, ry + 9, rx + 25, ry + 4, P.ink[1]);
    for (let k = 0; k < 6; k++) s.circle(rx + 5 + k * 6, ry + 13, 1.2, P.metal[4]);
    s.px(rx + 37, ry + 12, E(P.neon[4]));
    // the microphone on its stand, the logbook, a mug of pencils
    s.vline(rx + 48, ry + 2, by1 - 29, P.metal[3]); s.rect(rx + 46, ry - 2, 5, 5, P.metal[4]); s.rect(rx + 47, ry - 1, 3, 3, P.ink[2]);
    s.rect(rx + 54, by1 - 31, 14, 3, P.paper[5]); s.vline(rx + 61, by1 - 31, by1 - 29, P.paper[2]);
    s.rect(rx - 12, by1 - 34, 5, 6, P.navy[3]); s.vline(rx - 11, by1 - 38, by1 - 34, P.yellow[4]); s.vline(rx - 9, by1 - 37, by1 - 34, P.red[4]);
    // a goose-neck lamp
    s.line(198, by1 - 29, 192, by1 - 48, P.ink[3]); s.line(192, by1 - 48, 184, by1 - 46, P.ink[3]); s.ellipse(183, by1 - 45, 3, 2, P.ink[2]); s.px(183, by1 - 43, E(P.lamp[5]));
    s.light('warm', 180, by1 - 30, 36, 14, 0.85);
    s.light('warm', rx + 20, ry + 6, 50, 36, 0.75);
    s.light('red', rx + 20, ry + 6, 20, 14, 0.15);
    // a chair pushed back
    H.rbox(s, rm, { cx: 150, cd: 40, w: 22, dp: 20, a: 0.3, y0: by1 - 17, y1: by1 - 14 }, (n, poly, lum) => s.poly(poly, cl(P.pink, n === 'top' ? 4 : lum > 0 ? 3 : 2)));
    // the bed on the right, a NASA-blue comforter
    const bed = box(s, rm, { x0: 218, x1: bx1, y0: by1 - 16, y1: by1, d0: 20, d1: 110 }, P.navy, { base: 3, top: 4 });
    s.poly(rm.fq(222, bx1, 22, 40, by1 - 16), P.white_cloth[4]);
    for (let d = 46; d < 108; d += 14) { const a = rm.pr(218, by1 - 16, d), b = rm.pr(bx1, by1 - 16, d + 6); s.px(rnd((a[0] + b[0]) / 2), rnd((a[1] + b[1]) / 2), P.white[4]); }
    // a lava lamp on the nightstand: the one colour that isn't amber or star-green
    const ns = box(s, rm, { x0: 208, x1: 218, y0: by1 - 22, y1: by1, d0: 4, d1: 14 }, P.white_cloth, { base: 3 });
    if (ns.faces.top) { const c = rm.pr(213, by1 - 22, 9); s.rect(c[0] - 1, c[1] - 9, 3, 8, E(P.neon[3])); s.px(c[0], c[1] - 6, E(P.neon[5])); s.rect(c[0] - 2, c[1] - 2, 5, 2, P.chrome[3]); s.light('red', c[0], c[1] - 5, 16, 14, 0.3); }
    band(s, [[0, 0], [320, 0], [320, 180], [0, 180]], (x, y) => Math.abs(x - 160) / 130 + (y - 160) / 40 - 0.2, 0.5);
  }

  /* ================================================================== */
  /* ASHGROVE — the front hall on West Broadway: dark wood, bearded men */
  /* in oils, the sweeping stair, and in its glass case the Keeper's Lamp*/
  /* ================================================================== */
  PX.bg('ashgrove', {
    times: ['night'],
    preset: { night: 'evening' },
    draw(s, o) { ashgrove(s, o); }
  });

  function ashgrove(s, o) {
    const rm = Room({ vx: 150, vy: 64, bx0: 44, by0: 4, bx1: 256, by1: 112, z0: 220 });
    const { bx0, bx1, by0, by1 } = rm, rng = PX.rng('ashgrove'), WAIN = by1 - 34;
    const damask = H.motif(['..o...o.', '.ooo.o.o', '..o...o.', '........', 'o...o...', '.o.ooo..', 'o...o...', '........'], { '.': P.damask[3], o: P.damask[4] });
    const wall = (u, v) => {
      if (v >= WAIN) { const k = ((u % 24) + 24) % 24; return v < WAIN + 2 ? P.wood_dark[5] : k < 1 || k > 22 ? P.wood_dark[1] : (v - WAIN) % 30 < 2 || k < 3 ? P.wood_dark[4] : P.wood_dark[3]; }
      if (v < by0 + 10) return v < by0 + 3 ? P.wood_dark[4] : P.wood_dark[2];
      return damask(u, v);
    };
    s.poly(rm.back, (x, y) => wall(x, y));
    s.poly(rm.left, (x, y) => { const q = rm.onLeft(x, y); return SH(wall(q[0], q[1]), -1); });
    s.poly(rm.right, (x, y) => { const q = rm.onRight(x, y); return SH(wall(-q[0], q[1]), -1); });
    s.poly(rm.ceil, P.wood_dark[2]);
    // checkered marble floor, black and cream, under a long Persian runner
    s.poly(rm.floor, (x, y) => { const q = rm.onFloor(x, y), dark = (flo(q[0] / 14) + flo(q[1] / 14)) & 1; return dark ? P.ink[3] : P.stone_warm[4]; });
    s.poly(rm.fq(118, 180, 6, 200), (x, y) => { const q = rm.onFloor(x, y), u = q[0] - 118; if (u < 3 || u > 59) return P.navy[2]; const z = Math.abs(((q[1] % 16) + 16) % 16 - 8) + Math.abs(u - 31) * 0.3; return z < 3 ? P.mustard[3] : flo(z) % 3 ? P.damask[2] : P.navy[3]; });
    band(s, rm.floor, (x, y) => { const q = rm.onFloor(x, y); return Math.max((6 - q[1]) / 5, (q[1] - 60) / 50); }, 0.4);

    /* ---- the stair sweeping up the right ---- */
    for (let i = 0; i < 12; i++) {
      const d0 = 8 + i * 9, y0 = by1 - (12 - i) * 7;
      box(s, rm, { x0: 200 + i * 2, x1: bx1, y0: by1 - (i + 1) * 7, y1: by1 - i * 7, d0: 100 - i * 8, d1: 110 - i * 8 }, P.wood_dark, { base: 3, top: 4 });
    }
    // the banister, curling into a newel post
    const bn = [];
    for (let i = 0; i <= 12; i++) bn.push(rm.pr(198 + i * 2, by1 - 22 - i * 7, 108 - i * 8));
    for (let i = 1; i < bn.length; i++) { s.line(bn[i - 1][0], bn[i - 1][1], bn[i][0], bn[i][1], P.wood_dark[4]); s.line(bn[i - 1][0], bn[i - 1][1] + 1, bn[i][0], bn[i][1] + 1, P.wood_dark[1]); }
    for (let i = 0; i < 12; i++) { const a = rm.pr(199 + i * 2, by1 - 22 - i * 7, 104 - i * 8), b = rm.pr(199 + i * 2, by1 - i * 7, 104 - i * 8); s.line(a[0], a[1], b[0], b[1], P.wood_dark[2]); }
    { const np = rm.pr(196, by1, 112), k = rm.S(112); s.rect(np[0] - 2 * k, np[1] - 26 * k, 4 * k, 26 * k, P.wood_dark[3]); s.rect(np[0] - 3 * k, np[1] - 29 * k, 6 * k, 3 * k, P.wood_dark[4]); s.circle(np[0], np[1] - 31 * k, 2 * k, P.brass[4]); }
    // a boombox on the third step, red cups on the stairs
    { const c = rm.pr(232, by1 - 21, 86); s.rect(c[0] - 8, c[1] - 7, 16, 7, P.ink[3]); s.circle(c[0] - 4, c[1] - 3, 2, P.ink[1]); s.circle(c[0] + 4, c[1] - 3, 2, P.ink[1]); s.rect(c[0] - 2, c[1] - 6, 4, 2, E(P.tv[3])); s.hline(c[0] - 6, c[0] + 6, c[1] - 8, P.metal[4]); }
    for (const [u, d, h] of [[226, 94, 14], [240, 70, 35], [214, 102, 7]]) { const c = rm.pr(u, by1 - h, d); s.rect(c[0], c[1] - 3, 2, 3, P.red[4]); s.px(c[0], c[1] - 3, P.white[4]); }

    /* ---- the left wall: Ashgroves in oils, beards like hedges ---- */
    const portrait = (d0, d1, y0, y1, beard) => {
      s.poly(rm.lq(d0 - 2, d1 + 2, y0 - 2, y1 + 2), P.brass[3]);
      s.poly(rm.lq(d0, d1, y0, y1), P.wood_dark[1]);
      const c = rm.pr(bx0, (y0 + y1) / 2 - 3, (d0 + d1) / 2), k = rm.S((d0 + d1) / 2);
      s.ellipse(c[0], c[1], 3.5 * k, 4.5 * k, P.skin_old[2]);
      s.ellipse(c[0], c[1] + 5 * k, 5 * k * beard, 4.5 * k, P.hair_gray[2]);
      s.rect(c[0] - 6 * k, c[1] + 8 * k, 12 * k, 6 * k, P.ink[2]);
      s.light('warm', c[0], c[1] - 10 * k, 10 * k, 4 * k, 0.6);
    };
    portrait(6, 30, 26, 64, 1.1); portrait(44, 66, 28, 66, 1.4); portrait(80, 102, 30, 68, 0.9);

    /* ---- back wall: the tall clock, the parlor doors, the Keeper's Lamp ---- */
    const ck = box(s, rm, { x0: 64, x1: 80, y0: 30, y1: by1, d0: 0, d1: 8 }, P.wood_dark, { base: 3 });
    { const f = ck.front; s.circle(f[0] + f[2] / 2, f[1] + 9, 5, P.paper[4]); s.circle(f[0] + f[2] / 2, f[1] + 9, 4, P.paper[5]); s.line(f[0] + f[2] / 2, f[1] + 9, f[0] + f[2] / 2, f[1] + 6, P.ink[1]); s.line(f[0] + f[2] / 2, f[1] + 9, f[0] + f[2] / 2 + 2, f[1] + 10, P.ink[1]); s.rect(f[0] + 4, f[1] + 20, f[2] - 8, 26, P.wood_dark[1]); s.vline(f[0] + f[2] / 2, f[1] + 20, f[1] + 40, P.brass[3]); s.circle(f[0] + f[2] / 2, f[1] + 41, 2.5, P.brass[4]); }
    // double doors into the parlor, light and voices behind them
    s.rect(98, 34, 44, by1 - 34, P.wood_dark[1]);
    for (const dx of [100, 121]) { s.rect(dx, 36, 19, by1 - 36, P.wood_dark[3]); s.rect(dx + 3, 40, 13, 26, E(P.lamp[3])); for (let yy = 44; yy < 66; yy += 6) s.hline(dx + 3, dx + 15, yy, P.wood_dark[2]); s.vline(dx + 9, 40, 65, P.wood_dark[2]); s.rect(dx + 3, 72, 13, 30, P.wood_dark[2]); }
    s.light('warm', 120, 56, 40, 40, 0.6);
    // the glass case, lit from inside like a reliquary
    const cx0 = 168, cx1 = 188;
    const pd = box(s, rm, { x0: cx0 - 2, x1: cx1 + 2, y0: by1 - 30, y1: by1, d0: 2, d1: 16 }, P.wood_dark, { base: 3, top: 4 });
    const cs = box(s, rm, { x0: cx0, x1: cx1, y0: by1 - 60, y1: by1 - 30, d0: 4, d1: 14 }, null, { paint: () => true });
    for (const fc of Object.values(cs.faces)) for (let i = 0; i < fc.length; i++) s.line(...fc[i], ...fc[(i + 1) % fc.length], P.brass[4]);
    const lf = cs.front, lc = [lf[0] + lf[2] / 2, lf[1] + lf[3] / 2 + 3];
    // the Keeper's Lamp: brass cage, panes of thick green glass, a green flame
    s.rect(lc[0] - 5, lc[1] - 9, 10, 15, P.brass[2]);
    s.rect(lc[0] - 4, lc[1] - 7, 8, 11, E(P.lantern[3])); s.rect(lc[0] - 1, lc[1] - 4, 2, 4, E(P.lantern[5])); s.px(lc[0], lc[1] - 5, E(P.white[5]));
    s.vline(lc[0], lc[1] - 7, lc[1] + 3, P.brass[3]); s.hline(lc[0] - 4, lc[0] + 3, lc[1] - 2, P.brass[3]);
    s.poly([[lc[0] - 5, lc[1] - 9], [lc[0], lc[1] - 14], [lc[0] + 5, lc[1] - 9]], P.brass[3]); s.circle(lc[0], lc[1] - 15, 1.5, P.brass[4]);
    s.rect(lc[0] - 6, lc[1] + 6, 12, 2, P.brass[3]);
    s.line(lf[0] + 2, lf[1] + lf[3] - 3, lf[0] + 6, lf[1] + 2, E(P.white[3]));
    // the brass plaque
    { const pf = pd.front; s.rect(pf[0] + 3, pf[1] + 4, pf[2] - 6, 4, P.brass[4]); s.hline(pf[0] + 4, pf[0] + pf[2] - 5, pf[1] + 6, P.brass[2]); }
    s.light('green', lc[0], lc[1], 44, 40, 0.9);
    s.light('green', lc[0], by1 + 6, 40, 12, 0.5);
    // the chandelier
    const ch = rm.pr(150, by0 + 26, 70), kc = rm.S(70);
    s.vline(ch[0], 0, ch[1] - 6, P.brass[2]);
    s.ellipse(ch[0], ch[1], 16 * kc, 3 * kc, (x, y, nx, ny) => (ny < 0 ? P.brass[4] : P.brass[2]));
    for (let i = -3; i <= 3; i++) { const fx = ch[0] + i * 5 * kc; s.vline(fx, ch[1] - 4 * kc, ch[1] - 1, P.white[4]); s.px(fx, ch[1] - 5 * kc, E(P.lamp[5])); s.px(fx, ch[1] - 5 * kc - 1, E(P.fire[4])); }
    for (let i = 0; i < 12; i++) s.px(ch[0] + (rng() - 0.5) * 30 * kc, ch[1] + rng() * 8 * kc, E(P.white[rng() < 0.5 ? 4 : 5]));
    s.light('warm', ch[0], ch[1] + 40, 170, 110, 0.55);
    s.light('warm', ch[0], ch[1], 50, 26, 0.4);
    // coats piled on a bench by the door, a side table with cups and chips
    const bench = box(s, rm, { x0: bx0, x1: bx0 + 14, y0: by1 - 14, y1: by1, d0: 110, d1: 160 }, P.wood_dark, { base: 3 });
    for (let i = 0; i < 4; i++) { const c = rm.pr(bx0 + 6, by1 - 15, 116 + i * 10), k = rm.S(116 + i * 10); s.ellipse(c[0], c[1] - 2 * k, 6 * k, 2.5 * k, rng.pick([P.denim, P.ink, P.maroon, P.olive])[3]); }
    const st = box(s, rm, { x0: 98, x1: 124, y0: by1 - 24, y1: by1, d0: 40, d1: 52 }, P.wood_dark, { base: 4, top: 5 });
    if (st.faces.top) for (let i = 0; i < 6; i++) { const c = rm.pr(100 + i * 4, by1 - 24, 44 + (i % 2) * 4); s.rect(c[0], c[1] - 3, 2, 3, P.red[4]); s.px(c[0], c[1] - 3, P.white[4]); }
  }
})();
