/* Larch Street, outside Mémère's house (9 Larch St). Reference background for
 * the pixel style.
 *   day   — an autumn afternoon (unused in Ep 1, kept for later episodes)
 *   dusk  — Aug 31, the arrival: the maple still green, first lights coming on
 *   night — Oct 12, 8:39 pm: porch lights, TVs, the streetlight
 *   quiet — Oct 12, 8:40 pm: every light out; the Gagnons' TV and, far up on
 *           the hill past the end of the street, a small green light. */
(function () {
  'use strict';
  const P = PX.P, E = PX.E;
  PX.ramp('far1', ['#2f3b4e', '#3f4e63', '#536379', '#6b7b90', '#8697aa', '#a4b3c3']);
  PX.ramp('far2', ['#1d2b2b', '#283b38', '#365049', '#46665a', '#5a7d6c', '#729682']);
  PX.ramp('cloud_dusk', ['#3c2a50', '#6a3d62', '#a65666', '#d97c68', '#f6ab74', '#ffd79e']);
  PX.ramp('cloud_night', ['#0c1229', '#141d3b', '#1f2b4f', '#2c3b63', '#3d4e78', '#52648f']);
  PX.ramp('wagon', ['#3a2a22', '#66503f', '#937a62', '#b9a185', '#d6c2a4', '#ece0c6']);

  PX.bg('larch_ext', {
    times: ['dusk', 'day', 'night', 'quiet'],
    draw(s, o) {
      const t = o.time, rng = o.rng;
      const lit = t === 'dusk' || t === 'night';
      const october = t !== 'dusk';
      sky(s, t, rng);
      hills(s, t, rng);
      gagnons(s, t, rng);
      pole(s, t);
      house(s, t, rng, lit, october);
      maple(s, t, rng, october);
      ground(s, t, rng, october);
      wagon(s, t);
      if (t === 'quiet') {
        // the Lamp on the hill
        s.px(117, 63, E(P.lantern[5])); s.px(118, 63, E(P.lantern[4])); s.px(117, 64, E(P.lantern[3]));
        s.light('green', 117.5, 63.5, 7, 6, 0.9);
      }
    }
  });

  function sky(s, t, rng) {
    if (t === 'day') {
      s.vgrad(0, 0, 320, 104, [E(P.sky_day[1]), E(P.sky_day[2]), E(P.sky_day[3]), E(P.sky_day[4])], 4);
      s.cloud(54, 26, 46, 14, { emit: true, rng }); s.cloud(170, 16, 30, 9, { emit: true, rng }); s.cloud(262, 30, 40, 12, { emit: true, rng });
    } else if (t === 'dusk') {
      s.vgrad(0, 0, 320, 104, [E(P.sky_dusk[1]), E(P.sky_dusk[2]), E(P.sky_dusk[3]), E(P.sky_dusk[4]), E(P.sky_dusk[5])], 4);
      const cd = P.cloud_dusk;
      s.cloud(60, 30, 50, 10, { emit: true, ramp: cd, top: 3, rng }); s.cloud(176, 20, 36, 7, { emit: true, ramp: cd, top: 4, rng });
      s.cloud(270, 36, 46, 9, { emit: true, ramp: cd, top: 3, rng });
      // the sun just gone behind the hills on the left
      s.ellipse(22, 92, 26, 10, E(P.sky_dusk[5]));
    } else if (t === 'night') {
      s.vgrad(0, 0, 320, 104, [E(P.sky_night[0]), E(P.sky_night[1]), E(P.sky_night[2]), E(P.sky_night[3])], 4);
      s.stars(0, 0, 320, 70, 70, { rng });
      // crescent moon
      s.circle(58, 22, 6, E(P.cloud[4])); s.circle(61, 20, 5.5, E(P.sky_night[1]));
      s.light('cool', 58, 22, 18, 18, 0.25);
      s.cloud(150, 30, 40, 8, { emit: true, ramp: P.cloud_night, top: 4, rng });
    } else {
      s.vgrad(0, 0, 320, 104, [E(P.sky_quiet[0]), E(P.sky_quiet[1]), E(P.sky_quiet[2]), E(P.sky_quiet[3])], 4);
      s.stars(0, 0, 320, 60, 22, { rng });
    }
  }

  function hills(s, t, rng) {
    // far ridge
    const ridge = (base, amp, seed, ramp, shade, pines) => {
      const r2 = PX.rng(seed);
      const pts = [[0, 180]];
      let y = base;
      for (let x = 0; x <= 320; x += 8) { y = base + Math.sin(x * 0.021 + seed.length) * amp + Math.sin(x * 0.067) * amp * 0.35; pts.push([x, y]); }
      pts.push([320, 180]);
      s.poly(pts, ramp[shade]);
      // a lighter lip along the top, then trees
      for (let k = 1; k < pts.length - 2; k++) s.line(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], ramp[shade + 1]);
      if (pines) for (let x = 2; x < 320; x += r2.int(5, 9)) {
        const yy = base + Math.sin(x * 0.021 + seed.length) * amp + Math.sin(x * 0.067) * amp * 0.35;
        if (r2() < 0.65) s.pine(x, Math.round(yy) + 2, r2.int(5, 9), ramp, { rng: r2, light: shade - 2 });
        else s.foliage(x, yy, 3, 2.5, [ramp], { rng: r2, clusters: 3, blob: 1.6 });
      }
    };
    ridge(74, 5, 'farA', P.far1, 2, true);
    ridge(86, 4, 'farB', P.far2, 2, true);
    // the Standpipe: a broken stone ring on the high point past the end of the street
    s.rect(113, 64, 9, 6, P.far1[1]); s.rect(114, 62, 3, 2, P.far1[1]); s.rect(119, 63, 2, 1, P.far1[1]);
    s.px(116, 61, P.far1[1]); s.hline(113, 121, 64, P.far1[2]);
  }

  function gagnons(s, t, rng) {
    const y0 = 52, y1 = 122;
    // side-gable roof
    s.poly([[-10, y0 + 1], [16, 30], [92, 30], [108, y0 + 1]], P.roof[2]);
    s.clip([[-10, y0 + 1], [16, 30], [92, 30], [108, y0 + 1]], () => s.shingles(-10, 30, 120, 24, P.roof, { rng, sw: 5, sh: 3 }));
    s.line(16, 30, 92, 30, P.roof[4]);
    s.hline(-10, 108, y0, P.trim[1]); s.hline(-10, 108, y0 + 1, P.trim[3]);
    // chimney
    s.rect(70, 20, 9, 12, P.brick[2]); s.bricks(70, 20, 9, 11, P.brick, { rng, bw: 4, bh: 2 }); s.rect(69, 19, 11, 2, P.stone[3]);
    // walls
    s.clapboard(-6, y0 + 2, 108, y1 - y0 - 2, P.house_yellow, { rng, board: 3 });
    s.rect(100, y0 + 2, 2, y1 - y0 - 2, P.trim[3]); s.rect(-6, y0 + 2, 2, y1 - y0 - 2, P.trim[3]);
    s.shift([84, y0 + 2, 16, y1 - y0 - 2], -1);                    // side away from the light
    const nightish = t === 'night' || t === 'quiet' || t === 'dusk';
    // upstairs
    s.window(12, 60, 13, 15, { frame: P.trim, glass: t === 'day' ? 'day' : t === 'dusk' ? 'dusk' : 'night', rng });
    s.window(52, 60, 13, 15, { frame: P.trim, glass: t === 'day' ? 'day' : t === 'dusk' ? 'dusk' : 'night', curtain: P.wall_rose, rng });
    // kitchen (yellow at night) and the living room with the TV
    s.window(12, 88, 15, 15, { frame: P.trim, glass: t === 'day' ? 'day' : 'dark', lit: t === 'dusk' || t === 'night', curtain: P.cream, rng });
    const tv = t === 'night' || t === 'quiet';
    s.window(54, 86, 22, 17, { frame: P.trim, glass: t === 'day' ? 'day' : 'dark', curtain: P.house_blue, rng, light: 0 });
    if (tv) {
      s.vgrad(59, 88, 12, 13, [E(P.tv[4]), E(P.tv[3]), E(P.tv[2])], 2);
      s.vline(64, 87, 102, P.trim[2]); s.hline(54, 75, 94, P.trim[2]);
      s.light('cool', 65, 95, 30, 24, 0.75);
    }
    // door and stoop
    s.rect(33, 92, 12, 30, P.trim[1]); s.rect(34, 93, 10, 29, P.house_blue[2]);
    s.rect(36, 95, 6, 6, P.house_blue[1]); s.px(42, 108, P.mustard[4]);
    s.rect(30, 118, 18, 4, P.concrete[3]); s.hline(30, 47, 118, P.concrete[4]);
    // foundation and shrubs
    s.stones(-6, 116, 108, 7, P.stone, { rng });
    for (let x = -2; x < 100; x += 13) if (x < 26 || x > 50) s.foliage(x + 6, 118, 7, 5, [P.pine], { rng, clusters: 7 });
  }

  function pole(s, t) {
    // wooden utility pole with the streetlight arm
    s.rect(108, 28, 4, 104, P.wood_dark[3]); s.vline(108, 28, 131, P.wood_dark[4]); s.vline(111, 28, 131, P.wood_dark[1]);
    for (let y = 40; y < 130; y += 9) s.px(110, y, P.wood_dark[2]);
    s.rect(98, 32, 24, 2, P.wood_dark[2]); s.px(100, 31, P.white[2]); s.px(119, 31, P.white[2]);
    // wires sagging off both edges of the frame
    const wire = (x0, y0, x1, y1, sag) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { const k = (x - x0) / (x1 - x0); s.px(x, y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * sag, P.ink[2]); } };
    wire(0, 26, 100, 31, 5); wire(119, 31, 320, 22, 9); wire(0, 34, 100, 33, 4); wire(119, 33, 320, 30, 8);
    // streetlight arm and head
    s.path([[112, 50], [118, 47], [126, 47]], P.metal[2]);
    s.rect(122, 47, 9, 3, P.metal[3]); s.hline(122, 130, 47, P.metal[4]);
    const on = t === 'dusk' || t === 'night';
    s.rect(123, 50, 7, 2, on ? E(P.lamp[5]) : P.metal[1]);
    if (on) {
      s.lightPoly('warm', [[123, 51], [130, 51], [150, 132], [102, 132]], t === 'night' ? 0.55 : 0.35, { fade: { x0: 126, y0: 52, x1: 126, y1: 140 } });
      s.light('warm', 126, 132, 30, 7, t === 'night' ? 0.9 : 0.5);
      s.light('warm', 126, 51, 6, 5, 1);
    }
  }

  function house(s, t, rng, lit, october) {
    const hx0 = 140, hx1 = 256, apex = [198, 16], eave = 62, base = 122;
    const G = P.house_green;
    // gable wall + main wall
    s.poly([[hx0, eave], [apex[0], apex[1] + 3], [hx1, eave]], G[3]);
    s.clip([[hx0, eave + 1], [apex[0], apex[1] + 3], [hx1, eave + 1]], () => s.clapboard(hx0, apex[1], hx1 - hx0, eave - apex[1] + 1, G, { rng, board: 3 }));
    s.clapboard(hx0, eave, hx1 - hx0, base - eave, G, { rng, board: 3 });
    s.shift([hx1 - 14, eave, 14, base - eave], -1);
    // roof: rake bands with shingles, trim boards
    const rakeL = [[hx0 - 14, eave + 4], [apex[0], apex[1] - 6], [apex[0], apex[1]], [hx0 - 4, eave + 4]];
    const rakeR = [[apex[0], apex[1] - 6], [hx1 + 14, eave + 4], [hx1 + 4, eave + 4], [apex[0], apex[1]]];
    s.poly(rakeL, P.roof[3]); s.poly(rakeR, P.roof[2]);
    s.clip(rakeL, () => s.shingles(hx0 - 16, apex[1] - 8, 64, 60, P.roof, { rng, sw: 4, sh: 3 }));
    s.clip(rakeR, () => s.shingles(apex[0], apex[1] - 8, 76, 60, P.roof, { rng, sw: 4, sh: 3, base: 2 }));
    s.line(hx0 - 4, eave + 3, apex[0], apex[1], P.trim[4]); s.line(hx0 - 3, eave + 3, apex[0], apex[1] + 1, P.trim[3]);
    s.line(apex[0], apex[1], hx1 + 4, eave + 3, P.trim[3]); s.line(apex[0], apex[1] + 1, hx1 + 3, eave + 3, P.trim[2]);
    s.line(hx0 - 14, eave + 4, apex[0], apex[1] - 6, P.roof[5]);
    // corner boards
    s.rect(hx0, eave, 2, base - eave, P.trim[4]); s.rect(hx1 - 2, eave, 2, base - eave, P.trim[2]);
    // Gus's window in the gable (dark: she's in it, looking out, at night)
    s.window(189, 33, 18, 20, { frame: P.trim, glass: t === 'day' ? 'day' : t === 'dusk' ? 'dusk' : 'night', curtain: P.cream, rng });
    // second gable vent
    s.poly([[194, 24], [198, 21], [202, 24]], P.trim[3]); s.hline(195, 201, 24, P.trim[1]);
    // porch roof (Gus climbs out onto it) — the band just below her window
    s.poly([[hx0 - 8, 74], [hx1 + 8, 74], [hx1 + 10, 84], [hx0 - 10, 84]], P.roof[2]);
    s.clip([[hx0 - 8, 74], [hx1 + 8, 74], [hx1 + 10, 84], [hx0 - 10, 84]], () => s.shingles(hx0 - 12, 74, hx1 - hx0 + 24, 11, P.roof, { rng, sw: 4, sh: 3 }));
    s.hline(hx0 - 10, hx1 + 10, 84, P.trim[4]); s.hline(hx0 - 10, hx1 + 10, 85, P.trim[2]);
    s.hline(hx0 - 8, hx1 + 8, 74, P.roof[5]);
    // under the porch roof: shade
    s.shift([hx0 + 2, 86, hx1 - hx0 - 4, base - 86], -1);
    // living room window (Mémère's; she sings at it at night)
    s.window(150, 91, 24, 19, { frame: P.trim, glass: t === 'day' ? 'day' : 'dark', lit, curtain: P.white_cloth, rng, light: lit ? 0.85 : 0 });
    s.window(232, 92, 14, 17, { frame: P.trim, glass: t === 'day' ? 'day' : 'dark', lit: t === 'night', curtain: P.white_cloth, rng, light: t === 'night' ? 0.5 : 0 });
    // front door: red, a small window, brass knob
    s.rect(203, 89, 15, 30, P.trim[2]); s.rect(204, 90, 13, 29, P.red[3]);
    s.vline(204, 90, 118, P.red[4]); s.vline(216, 90, 118, P.red[1]);
    s.rect(206, 92, 9, 6, P.trim[1]); s.rect(207, 93, 7, 4, t === 'day' ? P.sky_day[2] : lit ? E(P.lamp[3]) : P.ink[2]);
    s.rect(206, 101, 9, 6, P.red[2]); s.rect(206, 110, 9, 6, P.red[2]);
    s.px(214, 105, P.mustard[5]);
    // porch light and mailbox
    s.rect(220, 96, 3, 4, P.metal[1]); s.px(221, 97, lit ? E(P.lamp[5]) : P.metal[3]);
    if (lit) s.light('warm', 221, 99, 16, 14, 0.8);
    s.rect(225, 101, 6, 4, P.ink[2]); s.hline(225, 230, 101, P.metal[3]);
    // porch floor, posts, railing (opening at the steps)
    s.rect(hx0 - 4, 117, hx1 - hx0 + 8, 3, P.wood_pale[3]); s.hline(hx0 - 4, hx1 + 4, 117, P.wood_pale[4]); s.hline(hx0 - 4, hx1 + 4, 119, P.wood_pale[1]);
    for (const px of [hx0 - 2, 176, 200, 220, hx1 - 1]) { s.rect(px, 86, 3, 31, P.trim[3]); s.vline(px, 86, 116, P.trim[4]); s.vline(px + 2, 86, 116, P.trim[1]); }
    const rail = (xa, xb) => { s.rect(xa, 103, xb - xa, 2, P.trim[3]); s.hline(xa, xb - 1, 103, P.trim[4]); for (let x = xa + 2; x < xb; x += 3) s.vline(x, 105, 116, P.trim[2]); s.hline(xa, xb - 1, 116, P.trim[2]); };
    rail(hx0 + 1, 176); rail(179, 200); rail(223, hx1 - 1);
    // steps down to the walk
    for (let k = 0; k < 3; k++) { s.rect(199 - k, 120 + k * 3, 24 + k * 2, 3, P.concrete[3 - (k % 2)]); s.hline(199 - k, 222 + k, 120 + k * 3, P.concrete[4]); }
    // foundation
    s.stones(hx0 - 2, 120, hx1 - hx0 + 4, 5, P.stone, { rng });
    // lilac and trellis at the corner (the way down from the porch roof)
    for (let y = 86; y < 122; y += 4) s.hline(128, 139, y, P.trim[2]);
    for (let x = 128; x < 140; x += 4) s.vline(x, 86, 121, P.trim[2]);
    s.foliage(132, 104, 12, 15, october ? [P.grass_fall, P.pine] : [P.pine, P.grass], { rng, clusters: 18 });
    if (october) {
      // a pumpkin on the porch step
      s.ellipse(233, 114, 4, 3, (x, y, nx, ny) => P.leaf_orange[nx < -0.3 ? 4 : nx > 0.4 ? 2 : 3]);
      s.vline(233, 110, 111, P.pine[3]);
    }
  }

  function maple(s, t, rng, october) {
    s.rect(282, 74, 8, 56, P.bark[2]); s.vline(282, 74, 129, P.bark[3]); s.vline(289, 74, 129, P.bark[1]);
    for (let y = 80; y < 128; y += 6) s.px(285 + (y % 3), y, P.bark[1]);
    s.path([[286, 80], [272, 62], [264, 56]], P.bark[2]); s.path([[287, 78], [302, 60], [312, 54]], P.bark[2]);
    const leaves = october ? [P.leaf_orange, P.leaf_red, P.leaf_gold] : [P.grass, P.pine, P.grass_fall];
    s.foliage(286, 44, 40, 36, leaves, { rng, clusters: 70, blob: 4.2 });
    s.foliage(258, 58, 16, 13, leaves, { rng, clusters: 16, blob: 3.4 });
  }

  function ground(s, t, rng, october) {
    // lawn
    s.grass(0, 122, 320, 9, october ? P.grass_fall : P.grass, { rng, density: 0.12 });
    s.shift([150, 122, 120, 3], -1);                                  // house shadow
    s.shift((x, y) => ((x - 290) ** 2) / 900 + ((y - 128) ** 2) / 9 < 1, -1);   // tree shadow
    // walk to the steps
    s.poly([[199, 129], [223, 129], [226, 131], [196, 131]], P.concrete[3]);
    // sidewalk, verge, curb, street
    s.rect(0, 131, 320, 7, P.concrete[3]); s.hline(0, 319, 131, P.concrete[4]); s.hline(0, 319, 137, P.concrete[2]);
    for (let x = 6; x < 320; x += 17) s.vline(x, 132, 136, P.concrete[2]);
    s.grass(0, 138, 320, 3, october ? P.grass_fall : P.grass, { rng, density: 0.2 });
    s.rect(0, 141, 320, 2, P.concrete[4]); s.hline(0, 319, 142, P.concrete[2]);
    s.rect(0, 143, 320, 37, P.asphalt[2]);
    s.noise(0, 143, 320, 37, [P.asphalt[1], P.asphalt[3]], 0.08, { rng });
    s.rect(150, 143, 22, 3, P.ink[1]); for (let x = 151; x < 171; x += 3) s.vline(x, 143, 145, P.metal[2]);
    // fallen leaves
    const fall = october ? [P.leaf_orange[3], P.leaf_orange[4], P.leaf_red[3], P.leaf_gold[4], P.leaf_orange[2]] : [P.grass_fall[3], P.leaf_gold[3]];
    const n = october ? 220 : 40;
    for (let i = 0; i < n; i++) {
      const x = rng.int(0, 319), y = 122 + Math.floor(Math.pow(rng(), 1.4) * 58);
      if (y > 130 && y < 132) continue;
      const c = fall[rng.int(0, fall.length - 1)];
      s.px(x, y, c); if (rng() < 0.4) s.px(x + 1, y, PX.sh(c, -1));
    }
  }

  function wagon(s, t) {
    // the family's wood-panel station wagon at the curb (side view)
    const x = 18, y = 128, W = P.wagon;
    s.poly([[x + 6, y + 6], [x + 20, y - 4], [x + 56, y - 4], [x + 66, y + 4], [x + 78, y + 6], [x + 80, y + 16], [x, y + 16], [x, y + 8]], W[3]);
    s.hline(x + 20, x + 56, y - 4, W[5]); s.line(x + 6, y + 6, x + 20, y - 4, W[4]);
    // windows
    s.poly([[x + 10, y + 5], [x + 21, y - 2], [x + 36, y - 2], [x + 36, y + 5]], t === 'day' ? P.sky_day[1] : P.ink[2]);
    s.poly([[x + 39, y - 2], [x + 55, y - 2], [x + 63, y + 5], [x + 39, y + 5]], t === 'day' ? P.sky_day[1] : P.ink[2]);
    s.vline(x + 37, y - 2, y + 5, W[2]);
    s.line(x + 12, y + 4, x + 20, y - 1, t === 'day' ? P.white[3] : P.ink[3]);
    // wood panel along the side
    s.rect(x + 3, y + 8, 75, 5, P.wood[3]); s.hline(x + 3, x + 77, y + 8, P.wood[4]); s.hline(x + 3, x + 77, y + 12, P.wood[1]);
    for (let k = x + 8; k < x + 76; k += 9) s.vline(k, y + 9, y + 11, P.wood[2]);
    s.rect(x + 1, y + 13, 79, 3, P.chrome[2]); s.hline(x + 1, x + 79, y + 13, P.chrome[4]);
    // wheels
    for (const wx of [x + 15, x + 63]) { s.circle(wx, y + 17, 5.5, P.ink[1]); s.circle(wx, y + 17, 2.6, P.chrome[3]); s.px(wx - 1, y + 16, P.chrome[5]); }
    s.rect(x + 76, y + 8, 3, 3, t === 'night' || t === 'dusk' ? P.red[4] : P.red[3]);
    s.shift([x - 2, y + 22, 86, 2], -1);
  }
})();
