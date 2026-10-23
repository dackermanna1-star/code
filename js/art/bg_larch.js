/* 9 Larch Street (Mémère's house) — exterior, kitchen, living room,
 * Gus's room, upstairs hall, attic. Reference set for the art style. */
(function () {
  'use strict';
  const K = window.KIT, P = K.PAL, n = K.n;

  /* Lit / shadow helpers bound to a time of day. */
  const lighting = (t) => ({ L: (c) => K.tone(c, t), S: (c) => K.shade(c, t), T: K.TOD[t] });

  /* ------------------------------------------------------------------ */
  ART.bg('larch_ext', {
    times: ['day', 'dusk', 'night', 'quiet'],
    draw(o) {
      const t = o.time, rng = o.rng;
      const { L, S, T } = lighting(t);
      const quiet = t === 'quiet', dark = t === 'night' || quiet;
      const lit = T.lit && !quiet;
      let s = K.sky(o, t);

      if (t === 'night') s += K.stars(rng, { count: 90, y1: 420 });
      if (quiet) s += K.stars(rng, { count: 25, y1: 300, color: '#8fa595' });
      if (t === 'day') s += K.clouds(rng, { count: 7, y0: 50, y1: 300, color: '#f2efe8', shadow: '#c3c9cf', opacity: 0.75, w: 560 });
      if (t === 'dusk') s += K.clouds(rng, { count: 6, y0: 90, y1: 340, color: '#f2a27a', shadow: '#7a5576', opacity: 0.55, w: 600 });
      if (t === 'night') s += K.clouds(rng, { count: 4, y0: 120, y1: 330, color: '#2a3654', shadow: '#151c2e', opacity: 0.7, w: 620 });
      if (t === 'night') s += K.circle(1390, 120, 34, '#e9e4d2', { opacity: 0.9 }) + K.glow(o, 1390, 120, 160, '#c8d4f0', 0.25, 'moon');

      /* far ridge + the Standpipe hill (left), with the broken ring on top */
      s += K.path(K.ridge(rng, { y: 488, amp: 22, steps: 18, jag: 0.25 }), K.mix(L(P.slate), T.haze, 0.6));
      s += K.path('M60,560 C200,430 330,350 460,342 C600,336 720,420 900,560 Z', K.mix(L(P.pine), T.haze, 0.5));
      const ringC = K.mix(L(P.birch), T.haze, quiet ? 0.2 : 0.45);
      s += K.path('M436,346 l3,-22 l9,4 l4,-14 l10,10 l7,-3 l6,18 l8,-6 l3,15 Z', ringC);
      if (quiet) s += K.glow(o, 462, 332, 60, P.lantern, 0.8, 'lant') + K.circle(462, 332, 3.5, '#e8ffd9');

      /* distant pines along the hill line */
      s += K.pines(rng, { base: 548, hMin: 26, hMax: 64, gap: 16, fill: K.mix(L(P.pine), T.haze, 0.38), shade: K.mix(S(P.pine), T.haze, 0.38), jitterY: 18 });

      /* telephone poles + wires across the sky */
      const p1 = K.pole(110, 720, 560, L('#3a302a'), 11), p2 = K.pole(1540, 720, 560, L('#3a302a'), 11);
      const wireC = dark ? '#05070c' : K.mix(L(P.ink), T.haze, 0.25);
      p1.wires.forEach((a, i) => { const b = p2.wires[i]; s += K.wire(a[0], a[1], b[0], b[1], 70 + i * 6, wireC, 1.6); });
      s += K.wire(p1.wires[1][0], p1.wires[1][1], 980, 236, 30, wireC, 1.4);

      /* neighbor (Gagnon) cape on the left */
      const nb = '#c4ac86';
      s += K.poly([[-20, 360], [180, 250], [380, 360]], L('#4a3f3c'));
      s += K.rect(-10, 356, 380, 330, L(nb)) + K.clapboard(-10, 356, 380, 330, S(nb), 13, 0.4);
      s += K.poly([[370, 356], [430, 376], [430, 686], [370, 686]], S(nb));
      s += K.window(o, 40, 430, 90, 120, { lit, frame: L('#efe7d6'), glass: L('#33405a'), mullions: 'grid', curtain: lit ? '#d9a06a' : null, glowR: lit ? 120 : 0 });
      s += K.window(o, 220, 430, 90, 120, { lit: false, frame: L('#efe7d6'), glass: L('#33405a'), mullions: 'grid' });
      s += K.rect(-10, 684, 450, 20, S('#6e6a66'));
      /* chain-link fence */
      const fc = dark ? '#3a4150' : L('#8c9096');
      s += K.rect(-10, 640, 450, 3, fc) + K.g({ opacity: 0.5 }, Array.from({ length: 30 }, (_, i) => K.line(i * 15, 643, i * 15 + 15, 700, fc, 1) + K.line(i * 15 + 15, 643, i * 15, 700, fc, 1)).join(''));
      for (let x = 0; x <= 440; x += 110) s += K.rect(x, 632, 4, 70, fc);

      /* streetlight between the houses */
      s += K.streetlight(o, 560, 712, 330, { on: T.street && !quiet, color: dark ? '#10131a' : L('#2e2e33'), poolY: 735 });

      /* lilac bush and the big maple */
      s += K.path('M612,700 C590,620 640,560 700,566 C740,520 812,548 800,610 C842,640 820,700 800,700 Z', S(P.pine));
      s += K.path('M622,690 C604,628 646,580 698,586 C736,548 790,566 786,612 Z', L('#3f5a44'));

      /* ---------------- the house ---------------- */
      const X0 = 770, X1 = 1300, EAVE = 236, BASE = 700, PEAK = [1035, 92];
      const siding = '#7f977a', trim = '#e9e1cf', roof = '#3e4352';
      // side wall in perspective (shadow)
      s += K.poly([[X1, EAVE - 6], [1372, EAVE + 24], [1372, BASE - 8], [X1, BASE]], S(siding));
      s += K.poly([[X1 - 6, EAVE - 30], [PEAK[0], PEAK[1] - 16], [PEAK[0] + 70, PEAK[1] + 6], [1384, EAVE + 14]], S(roof));
      // front wall + gable
      s += K.poly([[X0, EAVE], [PEAK[0], PEAK[1] + 18], [X1, EAVE], [X1, BASE], [X0, BASE]], L(siding));
      s += K.g({}, K.clapboard(X0, 140, X1 - X0, BASE - 140, S(siding), 15, 0.45));
      // gable trim + roof edge
      s += K.poly([[X0 - 34, EAVE + 8], [PEAK[0], PEAK[1] - 10], [X1 + 34, EAVE + 8], [X1 + 34, EAVE - 6], [PEAK[0], PEAK[1] - 28], [X0 - 34, EAVE - 6]], L(roof));
      s += K.poly([[X0 - 20, EAVE + 8], [PEAK[0], PEAK[1] + 4], [X1 + 20, EAVE + 8], [X1 + 20, EAVE + 16], [PEAK[0], PEAK[1] + 14], [X0 - 20, EAVE + 16]], L(trim));
      // fish-scale shingles in the gable
      for (let row = 0; row < 5; row++) {
        const y = 150 + row * 16, half = (y - PEAK[1] - 18) * ((X1 - X0) / 2) / (EAVE - PEAK[1] - 18);
        for (let x = PEAK[0] - half + 10; x < PEAK[0] + half - 6; x += 18) s += K.path(`M${x - 9},${y} a9,9 0 0 0 18,0`, 'none', { stroke: S(siding), strokeWidth: 1.4, opacity: 0.6 });
      }
      // attic round window
      const attLit = false;
      s += K.circle(PEAK[0], 176, 26, L(trim)) + K.circle(PEAK[0], 176, 20, attLit ? P.window : L('#26314a'));
      s += K.line(PEAK[0] - 20, 176, PEAK[0] + 20, 176, L(trim), 3) + K.line(PEAK[0], 156, PEAK[0], 196, L(trim), 3);
      if (o.variant === 'figure') s += K.ellipse(PEAK[0] + 2, 180, 7, 9, quiet ? '#0a0d12' : '#1a1f2a') + K.rect(PEAK[0] - 7, 186, 18, 12, quiet ? '#0a0d12' : '#1a1f2a');

      // upstairs windows: left = Mémère's room, right = Gus's room (the back room faces the street)
      const winGlass = L('#2b3650');
      s += K.window(o, 846, 270, 86, 128, { lit: lit && t !== 'night', frame: L(trim), glass: winGlass, mullions: 'sash', curtain: L('#d8cdb8'), glowR: 0 });
      s += K.window(o, 1146, 270, 86, 128, { lit: lit, frame: L(trim), glass: winGlass, mullions: 'sash', glowR: lit ? 140 : 0, litColor: '#ffcf86' });
      // shutters
      for (const wx of [846, 1146]) { s += K.rect(wx - 34, 264, 22, 140, S('#2f4038')) + K.rect(wx + 98, 264, 22, 140, S('#2f4038')); }

      // porch roof
      const PR = 430;
      s += K.poly([[X0 - 30, PR], [X1 + 30, PR], [X1 + 14, PR - 34], [X0 - 14, PR - 34]], L(roof));
      s += K.rect(X0 - 30, PR, X1 - X0 + 60, 16, L(trim));
      // porch shadow on wall
      s += K.rect(X0, PR + 16, X1 - X0, 60, S(siding), { opacity: 0.55 });
      // front window (TV glow inside at night/dusk)
      const tvLit = lit;
      s += K.window(o, 820, 486, 170, 128, { lit: tvLit, frame: L(trim), glass: winGlass, litColor: t === 'dusk' ? '#f6c784' : '#e9c99a', mullions: 'grid', curtain: L('#b9a37d'), glowR: tvLit ? 150 : 0 });
      if (tvLit) s += K.rect(920, 520, 60, 60, '#9fc0ff', { opacity: 0.22 });
      // door
      s += K.rect(1074, 470, 86, 172, L(trim));
      s += K.rect(1084, 480, 66, 162, L('#6e2b29'));
      s += K.rect(1096, 494, 42, 50, lit ? '#ffd38a' : L('#28324a'));
      s += K.rect(1092, 560, 50, 3, S('#6e2b29')) + K.circle(1140, 572, 3.5, L(P.mustard));
      // screen door frame
      s += K.rect(1082, 478, 70, 166, 'none', { stroke: L('#d9d2c0'), strokeWidth: 3, opacity: 0.6 });
      // porch light
      if (lit) s += K.glow(o, 1192, 506, 110, '#ffd38a', 0.65, 'plight');
      s += K.rect(1186, 496, 12, 18, lit ? '#fff1c8' : L('#d0c6b0'));
      // porch floor, posts, railing
      s += K.rect(X0 - 30, 640, X1 - X0 + 60, 16, L('#8e8170')) + K.rect(X0 - 30, 656, X1 - X0 + 60, 44, S('#5a524a'));
      for (let x = X0 - 30; x < X1 + 30; x += 22) s += K.rect(x, 662, 10, 34, S('#4a433d'), { opacity: 0.7 });
      for (const px of [X0 - 18, 1040, X1 + 8]) s += K.rect(px, PR + 16, 14, 624 - PR, L(trim)) + K.rect(px + 9, PR + 16, 5, 624 - PR, S(trim));
      const rail = (a, b) => { let r = K.rect(a, 586, b - a, 8, L(trim)) + K.rect(a, 630, b - a, 6, L(trim)); for (let x = a + 8; x < b - 4; x += 15) r += K.rect(x, 594, 5, 36, L(trim)); return r; };
      s += rail(X0 - 4, 1040) + rail(1180, X1 + 8);
      // potted mum by the steps
      s += K.path('M1184,640 l6,-24 h28 l6,24 Z', L('#8a4a2a')) + K.circle(1204, 606, 22, L(P.ember)) + K.circle(1196, 600, 10, L(P.mustard), { opacity: 0.6 });
      // steps
      for (let i = 0; i < 3; i++) s += K.rect(1066 - i * 8, 656 + i * 15, 100 + i * 16, 15, i % 2 ? S('#7a6e60') : L('#8e8170'));
      // foundation
      s += K.rect(X0, 690, X1 - X0, 14, S('#6e6a66'));

      /* ground: grass, sidewalk, curb, street */
      s += K.rect(-10, 700, 1620, 34, L(P.moss));
      s += K.rect(-10, 728, 1620, 34, L('#b7b2a6')) + K.g({ opacity: 0.35 }, Array.from({ length: 16 }, (_, i) => K.rect(i * 104 - 10, 728, 2, 34, S('#b7b2a6'))).join(''));
      s += K.rect(-10, 762, 1620, 10, L('#9a968c'));
      s += K.rect(-10, 772, 1620, 140, L('#4b4d54'));
      if (t === 'night' || t === 'dusk') s += K.pool(o, 646, 780, 300, 50, P.sodium, 0.25, 'street');
      // walkway to the steps
      s += K.poly([[1060, 700], [1172, 700], [1196, 728], [1036, 728]], L('#a9a397'));

      /* the station wagon at the curb (wood paneling) */
      const car = '#7a7f86';
      s += K.path('M150,806 L176,760 Q190,742 230,740 L470,740 Q520,742 546,770 L586,780 Q604,786 604,806 L604,826 L150,826 Z', L(car));
      s += K.path('M196,762 L222,748 L330,748 L330,772 L196,772 Z', L('#2b3446'));
      s += K.path('M342,748 L466,748 Q500,752 520,772 L342,772 Z', L('#2b3446'));
      s += K.rect(176, 784, 400, 22, L('#8a5a35')) + K.rect(176, 784, 400, 3, L('#c9a06a'));
      s += K.circle(240, 826, 26, '#15171c') + K.circle(240, 826, 11, L('#8f949a')) + K.circle(520, 826, 26, '#15171c') + K.circle(520, 826, 11, L('#8f949a'));
      s += K.rect(150, 812, 456, 6, S(car), { opacity: 0.8 });

      /* falling / fallen leaves */
      s += K.leaves(rng, { count: 70, y0: 700, y1: 735, colors: [L(P.rust), L(P.ember), L(P.mustard), S(P.rust)], size: 6 });
      s += K.leaves(rng, { count: 26, y0: 732, y1: 762, colors: [S(P.rust), L(P.ember), S(P.mustard)], size: 6 });
      s += K.leaves(rng, { count: 30, y0: 772, y1: 790, colors: [S(P.rust), S(P.ember), S(P.mustard)], size: 7 });
      s += K.leaves(rng, { count: 10, y0: 790, y1: 900, colors: [S(P.rust), S(P.ember)], size: 8, opacity: 0.8 });

      /* maple at far right, overlapping the side of the house */
      s += K.tree(rng, { x: 1500, base: 742, h: 640, w: 420, colors: [L(P.ember), S(P.rust), L(P.mustard)], trunk: S('#3a2c26') });

      /* atmosphere */
      if (t === 'day') s += K.band(o, 380, 340, T.haze, 0, 0.18, 'haze');
      if (t === 'dusk') s += K.band(o, 300, 450, '#d88a68', 0, 0.12, 'haze');
      if (dark) s += K.band(o, 560, 360, '#05070c', 0, quiet ? 0.6 : 0.35, 'dark');
      if (quiet) s += K.band(o, 600, 220, '#2b3a33', 0, 0.35, 'fog') + K.rect(0, 0, 1600, 900, '#05080a', { opacity: 0.25 });
      return s;
    }
  });

  /* ------------------------------------------------------------------ */
  /* Mémère's kitchen: yellow wallpaper, checker linoleum, the wall phone
   * with the long cord, café curtains, the formica table with pill bottles. */
  ART.bg('kitchen', {
    times: ['morning', 'evening', 'night'],
    light: { morning: 'morning', evening: 'interior_lamp', night: 'night' },
    draw(o) {
      const t = o.time, rng = o.rng;
      const tt = t === 'morning' ? 'morning' : t === 'evening' ? 'evening' : 'night';
      const L = (c) => K.tone(c, tt), S = (c) => K.shade(c, tt);
      const R = K.room({ bx0: 360, by0: 120, bx1: 1240, by1: 610 });
      const night = t === 'night', eve = t === 'evening';
      let s = '';
      const wall = '#d8c27e', plaster = '#e6dcc4', cab = '#efe6d2', counter = '#b9a07a';

      /* surfaces */
      s += K.poly(R.ceil, S(plaster)) + K.poly(R.back, L(wall)) + K.poly(R.left, S(wall)) + K.poly(R.right, K.mix(S(wall), L(wall), 0.35));
      s += K.wallpaper(o, R, R.back, { color: S(wall), size: 28, opacity: 0.55, motif: 'daisy' });
      s += K.wallpaper(o, R, R.left, { color: K.adj(S(wall), -0.15), size: 34, opacity: 0.35, motif: 'daisy' });
      s += K.checkerFloor(o, R, { cols: 16, rowDepth: 0.13, colors: [L('#d6cab0'), L('#a8655a')] });
      s += K.poly(R.floor, L('#e8dcc0'), { opacity: 0.12 });
      // worn path on the linoleum
      s += K.pool(o, 800, 760, 420, 120, L('#e9dfc7'), 0.18, 'worn');

      /* back wall: window over the sink */
      const WX = 820, WY = 220, WW = 250, WH = 190;
      const view = t === 'morning' ? [[0, '#cfe0ea'], [1, '#f6e7c4']] : eve ? [[0, '#1b2440'], [1, '#5a4766']] : [[0, '#070b14'], [1, '#141d30']];
      const vid = o.id('view');
      s += K.rect(WX - 14, WY - 14, WW + 28, WH + 28, L(cab));
      s += K.defs(K.linear(vid, view)) + K.rect(WX, WY, WW, WH, `url(#${vid})`);
      // what's outside: the Gagnons' house and a maple
      const outC = t === 'morning' ? '#b9a98c' : eve ? '#3b3348' : '#0d121c';
      s += K.rect(WX + 20, WY + 80, 130, 110, outC) + K.poly([[WX + 10, WY + 84], [WX + 85, WY + 40], [WX + 160, WY + 84]], K.adj(outC, -0.2));
      if (!night || true) s += K.rect(WX + 50, WY + 110, 26, 30, eve ? '#ffcf86' : night ? '#5a4a2a' : K.adj(outC, -0.25));
      s += K.path(K.blob(rng, WX + 210, WY + 70, 60, 70, { lobes: 6, jag: 0.25 }), t === 'morning' ? '#d08a4a' : eve ? '#2a2236' : '#090c14');
      s += K.rect(WX + WW / 2 - 4, WY, 8, WH, L(cab)) + K.rect(WX, WY + WH / 2 - 4, WW, 8, L(cab));
      // café curtains (red gingham suggestion) + valance
      const cur = L('#b8483a');
      s += K.path(`M${WX - 8},${WY + WH * 0.48} h${WW * 0.46} q-10,${WH * 0.3} 6,${WH * 0.54} h-${WW * 0.46 + 6} Z`, cur, { opacity: 0.92 });
      s += K.path(`M${WX + WW + 8},${WY + WH * 0.48} h-${WW * 0.46} q10,${WH * 0.3} -6,${WH * 0.54} h${WW * 0.46 + 6} Z`, K.adj(cur, -0.15), { opacity: 0.92 });
      for (let i = 0; i < 10; i++) s += K.rect(WX - 6 + i * 26, WY + WH * 0.5, 2, WH * 0.48, '#efe6d2', { opacity: 0.25 });
      s += K.path(`M${WX - 20},${WY - 16} h${WW + 40} v26 q-${(WW + 40) / 6},14 -${(WW + 40) / 3},0 q-${(WW + 40) / 6},14 -${(WW + 40) / 3},0 q-${(WW + 40) / 6},14 -${(WW + 40) / 3},0 Z`, cur);
      // crucifix above the window
      s += K.rect(WX + WW / 2 - 3, WY - 76, 6, 40, S('#6b4a2e')) + K.rect(WX + WW / 2 - 14, WY - 66, 28, 6, S('#6b4a2e'));

      /* upper cabinets left of window, and right */
      const ucab = (x0, x1) => {
        let r = K.rect(x0, 150, x1 - x0, 140, L(cab)) + K.rect(x0, 286, x1 - x0, 10, S(cab));
        const doors = Math.max(1, Math.round((x1 - x0) / 110));
        for (let i = 0; i < doors; i++) {
          const dx = x0 + ((x1 - x0) * i) / doors;
          r += K.rect(dx + 8, 160, (x1 - x0) / doors - 16, 118, 'none', { stroke: S(cab), strokeWidth: 3 }) + K.circle(dx + ((x1 - x0) / doors) * (i % 2 ? 0.18 : 0.82), 262, 4, L(P.mustard));
        }
        return r;
      };
      s += ucab(380, 760) + ucab(1110, 1240);
      // calendar (Holy Rosary Parish) and the radio shelf
      s += K.rect(1128, 320, 84, 110, L('#efe8d8')) + K.rect(1128, 320, 84, 40, L('#5a7a8a')) + K.rect(1138, 372, 64, 3, S('#999')) + K.rect(1138, 384, 64, 3, S('#999')) + K.rect(1138, 396, 64, 3, S('#999')) + K.rect(1138, 408, 64, 3, S('#999'));
      s += K.rect(1166, 312, 8, 10, S('#333'));

      /* counter run along the back wall */
      const CT = 452;
      s += K.rect(372, CT, 868, 18, L(counter)) + K.rect(372, CT + 18, 868, 5, S(counter));
      s += K.rect(380, CT + 23, 852, R.by1 - CT - 23, L(cab));
      for (let x = 590; x + 100 < 1236; x += 106) s += K.rect(x + 8, CT + 34, 90, R.by1 - CT - 60, 'none', { stroke: S(cab), strokeWidth: 3 }) + K.rect(x + 46, CT + 44, 14, 4, S('#8a7a60'));
      s += K.rect(380, R.by1 - 18, 852, 18, S('#5a4a3a'));
      // sink + faucet
      s += K.rect(WX + 30, CT + 2, WW - 60, 10, S('#9aa0a6')) + K.path(`M${WX + WW / 2 - 4},${CT} v-34 q0,-10 10,-10 h22 v8 h-18 v36 Z`, L('#c0c6cc'));
      // stove on the left of the run: white enamel, four burners, kettle
      const SX = 400;
      s += K.rect(SX, CT - 4, 190, R.by1 - CT + 4, L('#f1ede4')) + K.rect(SX, CT - 4, 190, 14, L('#dcd6ca')) + K.rect(SX, CT - 64, 190, 60, L('#ebe5d8'));
      for (let i = 0; i < 4; i++) s += K.circle(SX + 30 + i * 44, CT - 34, 9, S('#cfc8bb')) ;
      s += K.rect(SX + 22, CT + 40, 146, 110, 'none', { stroke: S('#d8d2c6'), strokeWidth: 4 }) + K.rect(SX + 60, CT + 50, 70, 8, S('#9aa0a6'));
      s += K.path(`M${SX + 70},${CT - 4} q0,-46 40,-46 q40,0 40,46 Z`, L('#2f6b6b')) + K.path(`M${SX + 150},${CT - 30} l26,-14 l3,6 l-24,14 Z`, L('#2f6b6b')) + K.rect(SX + 104, CT - 56, 12, 8, S('#2f6b6b'));
      // stove light (night)
      if (night) s += K.rect(SX, CT - 64, 190, 8, '#ffe2a8') + K.shaft(o, [[SX, CT - 56], [SX + 190, CT - 56], [SX + 230, CT + 4], [SX - 40, CT + 4]], '#ffd38a', 0.35, 'stove') + K.glow(o, SX + 95, CT - 40, 160, '#ffcf86', 0.35, 'stoveg');
      // radio on the counter
      s += K.path(`M1150,${CT} v-58 q0,-22 40,-22 q40,0 40,22 v58 Z`, L('#7a4a2a')) + K.rect(1162, CT - 50, 56, 26, L('#d9c49a')) + K.circle(1176, CT - 12, 6, S('#3a2a1a')) + K.circle(1206, CT - 12, 6, S('#3a2a1a'));
      // sugar canister, bread box, a jar of wooden spoons
      s += K.rect(640, CT - 52, 46, 52, L('#c8463a')) + K.rect(640, CT - 52, 46, 8, S('#c8463a'));
      s += K.rect(700, CT - 40, 34, 40, L('#efe6d2')) ;
      for (let i = 0; i < 4; i++) s += K.rect(706 + i * 6, CT - 70 + i * 3, 4, 34, S('#a07850'));

      /* left wall: doorway to the hall, wall phone with the long cord, fridge */
      s += K.poly(R.quadL(0.42, 0.62, 0.18, 1.0), night ? '#05070c' : S('#3a3028'));
      s += K.poly(R.quadL(0.40, 0.42, 0.16, 1.0), L(cab)) + K.poly(R.quadL(0.62, 0.64, 0.16, 1.0), S(cab));
      // fridge (harvest gold), set against the back-left corner
      s += K.poly(R.quadL(0.70, 0.97, 0.30, 1.0), L('#c9a24a'));
      s += K.poly([R.L(0.97, 0.3), [R.bx0 + 40, R.L(0.97, 0.3)[1] + 6], [R.bx0 + 40, R.by1], R.L(0.97, 1.0)], S('#c9a24a'));
      s += K.poly(R.quadL(0.72, 0.95, 0.52, 0.535), S('#a07e32'));
      s += K.poly(R.quadL(0.93, 0.945, 0.36, 0.48), L('#e8e0c8')) + K.poly(R.quadL(0.93, 0.945, 0.58, 0.75), L('#e8e0c8'));
      // magnets + a child's drawing on the fridge
      s += K.poly(R.quadL(0.76, 0.84, 0.38, 0.47), L('#f2ede0')) + K.circle(...R.L(0.8, 0.375), 4, L('#c8463a'));
      // the phone: beige wall phone near the front of the left wall, cord sagging to the floor
      const ph = R.L(0.24, 0.42);
      s += K.poly(R.quadL(0.205, 0.27, 0.36, 0.52), L('#d8ccb0'));
      s += K.poly(R.quadL(0.21, 0.265, 0.34, 0.37), L('#c9bc9e'));
      s += `<path d="M${n(ph[0] + 6)},${n(ph[1] + 60)} C${n(ph[0] + 40)},${n(ph[1] + 300)} ${n(ph[0] + 140)},${n(ph[1] + 330)} ${n(ph[0] + 220)},${n(ph[1] + 230)}" fill="none" stroke="${L('#cfc2a4')}" stroke-width="4" stroke-dasharray="3 2"/>`;

      /* the table in the right foreground: chrome edge, vinyl cloth, pills, rosary */
      s += K.path('M1060,700 L1640,640 L1640,930 L1000,930 Z', L('#e9e1cf'));
      s += K.path('M1060,700 L1640,640 L1640,652 L1060,712 Z', L('#c9ccd0'));
      for (let i = 0; i < 7; i++) s += K.path(`M${1080 + i * 90},${700 - i * 9.5} L${1020 + i * 98},930`, 'none', { stroke: L('#c8463a'), strokeWidth: 10, opacity: 0.35 });
      for (let i = 0; i < 4; i++) s += K.path(`M1040,${760 + i * 50} L1640,${700 + i * 50}`, 'none', { stroke: L('#c8463a'), strokeWidth: 10, opacity: 0.25 });
      s += K.rect(1180, 610, 26, 46, L('#d9893a'), { opacity: 0.9 }) + K.rect(1178, 604, 30, 10, L('#efe6d2'));
      s += K.rect(1220, 620, 22, 38, L('#d9893a'), { opacity: 0.9 }) + K.rect(1218, 614, 26, 9, L('#efe6d2'));
      s += K.path('M1300,660 q20,-30 50,-6 q20,20 -10,30 q-30,10 -40,-24', 'none', { stroke: L('#5a4a6a'), strokeWidth: 3, strokeDasharray: '2 3' });
      s += K.ellipse(1440, 640, 46, 14, L('#efe6d2')) + K.path('M1404,640 q36,-30 72,0', L('#efe6d2'));

      /* hanging lamp over the table */
      s += K.rect(1296, 0, 3, 80, S('#333'));
      s += K.path('M1240,124 Q1298,52 1356,124 Z', eve ? '#f7e3b0' : L('#e9dcc0'));
      if (eve) s += K.ellipse(1298, 126, 56, 7, '#fff1c8') + K.shaft(o, [[1246, 126], [1350, 126], [1560, 760], [1020, 760]], '#ffd38a', 0.2, 'lamp') + K.glow(o, 1298, 150, 340, '#ffcf86', 0.35, 'lampg');

      /* light from the window */
      if (t === 'morning') {
        s += K.shaft(o, [[WX, WY], [WX + WW, WY], [WX + WW + 340, R.by1 + 220], [WX + 120, R.by1 + 260]], '#fff1cf', 0.22, 'sun', [0, 0, 0.3, 1]);
        s += K.pool(o, WX + 260, 760, 260, 70, '#fff1cf', 0.25, 'sunfloor');
        s += K.glow(o, WX + WW / 2, WY + WH / 2, 420, '#fff4da', 0.25, 'wing');
      } else if (night) {
        s += K.shaft(o, [[WX, WY], [WX + WW, WY], [WX + WW + 200, R.by1 + 200], [WX + 60, R.by1 + 230]], '#8fa7d6', 0.08, 'moon', [0, 0, 0.3, 1]);
      }
      /* depth: darken corners and ceiling */
      s += K.band(o, 0, 220, night ? '#05070c' : '#2a2018', 0.45, 0, 'ceil');
      if (night) s += K.rect(0, 0, 1600, 900, '#070a12', { opacity: 0.35 });
      if (eve) s += K.band(o, 600, 300, '#1a120c', 0, 0.35, 'floor');
      return s;
    }
  });
})();
