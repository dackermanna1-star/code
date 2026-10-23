/* What Derry Keeps — story CGs and the title, pixel art.
 *   cg_lanterns     letting go: a lantern touches the water, the river of light   lanterns
 *   cg_standpipe    Quiet Night: the Keeper's Lamp burning green on the ring     quiet
 *   cg_june_window  the epilogue: June on the porch roof outside the glass      night
 *   title           Derry at night, the green light on the hill                  night
 */
(function () {
  'use strict';
  const P = PX.P, E = PX.E, SH = PX.sh;
  const rnd = Math.round, flo = Math.floor;
  const cl = (r, s) => r[Math.max(0, Math.min(r.length - 1, s))];
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const isE = (v) => (v & 0x8000) !== 0;
  const text = (...a) => PX.HOME.text(...a);
  const band = (...a) => PX.HOME.band(...a);
  const FULL = [[0, 0], [320, 0], [320, 180], [0, 180]];

  /* a still figure: h tall, feet at (x, y); kind shapes the outline */
  function shape(s, x, y, h, c, kind) {
    const u = h / 30;
    const R = (dx, dy, w, hh) => s.rect(rnd(x + dx * u), rnd(y - dy * u), Math.max(1, rnd(w * u)), Math.max(1, rnd(hh * u)), c);
    R(-1.5, 30, 3, 4);                                         // head
    if (kind === 'dress') { R(-2.5, 26, 5, 8); s.poly([[x - 2.5 * u, y - 18 * u], [x + 2.5 * u, y - 18 * u], [x + 6 * u, y - 9 * u], [x - 6 * u, y - 9 * u]], c); R(-2, 9, 1.5, 9); R(0.5, 9, 1.5, 9); }
    else if (kind === 'glove') { R(-2.5, 26, 5, 12); R(-2.4, 14, 2, 14); R(0.4, 14, 2, 14); R(2.5, 18, 3, 3); R(-1.5, 31, 3, 1.4); }
    else if (kind === 'hat') { R(-3, 26, 6, 13); R(-2.6, 13, 2.4, 13); R(0.2, 13, 2.4, 13); R(-3, 31.5, 6, 1.2); R(-2, 33, 4, 2); }
    else if (kind === 'coat') { R(-3.4, 26, 6.8, 18); R(-2.4, 8, 2, 8); R(0.4, 8, 2, 8); }
    else { R(-2.5, 26, 5, 13); R(-2.2, 13, 2, 13); R(0.2, 13, 2, 13); }
  }

  /* ================================================================== */
  /* CG_LANTERNS — hundreds of people bending to the black water and    */
  /* letting go; one lantern, blank still, just touching                 */
  /* ================================================================== */
  PX.cg('cg_lanterns', {
    times: ['lanterns'],
    draw(s, o) { cgLanterns(s, o); }
  });

  function cgLanterns(s, o) {
    const rng = PX.rng('cg_lanterns');
    // night sky, the bridge's arch, people along it against the sky
    s.vgrad(0, 0, 320, 64, [E(P.sky_night[1]), E(P.sky_night[2]), E(P.sky_night[3])], 4);
    s.stars(0, 0, 320, 34, 30, { rng });
    s.rect(0, 46, 320, 6, P.stone[2]); s.hline(0, 319, 46, P.stone[3]);
    for (let x = 0; x < 320; x += rng.int(3, 6)) shape(s, x, 46, rng.int(9, 13), P.ink[1], rng.pick(['coat', 'hat', 'plain', 'dress']));
    for (let x = 0; x < 320; x++) {
      const t = (x - 160) / 110, a = Math.abs(t) < 1 ? Math.sqrt(1 - t * t) : 0;
      for (let y = 52; y < 80; y++) if (!(a > 0 && y > 80 - a * 26)) s.px(x, y, ((y - 52) % 5 === 0 || ((x + (flo((y - 52) / 5) & 1) * 4) % 9) === 0) ? P.stone[1] : P.stone[2]);
    }
    // under the arch: the far lanterns, a river of light flowing away
    for (let i = 0; i < 140; i++) { const x = 60 + rng() * 200, y = 60 + rng() * 20; const t = (x - 160) / 110, a = Math.abs(t) < 1 ? Math.sqrt(1 - t * t) : 0; if (a > 0 && y > 80 - a * 26) s.px(x, y, E(rng() < 0.6 ? P.lamp[4] : P.lamp[3])); }
    // the water
    for (let y = 80; y < 180; y++) for (let x = 0; x < 320; x++) { const rip = Math.sin(x * 0.21 + y * 1.3) + Math.sin(x * 0.05 - y * 0.7); s.px(x, y, rip > 1.45 ? P.water[2] : y < 110 ? P.water[0] : P.water[1]); }
    // lanterns all down the canal, bigger as they come near, each doubled in the water
    const lantern = (x, y, k, label) => {
      const w = Math.max(1, rnd(3 * k)), h = Math.max(2, rnd(3.6 * k));
      for (let r = 1; r < h * 1.6; r++) if (PX.bayer(x, y + r) < 0.8 - r / (h * 1.6) * 0.7) s.rect(x - w + (r & 1), y + r, w * 2 + 1, 1, E(P.lamp[r < h * 0.6 ? 3 : 2]));
      s.rect(x - w, y - h, w * 2 + 1, h, E(P.lamp[4]));
      s.vline(x - w, y - h, y - 1, E(P.lamp[5])); s.hline(x - w, x + w, y - h, E(P.lamp[5]));
      if (k > 1.5) { s.vline(x, y - h, y - 1, E(P.lamp[3])); s.poly([[x - w - 1, y - h], [x, y - h - rnd(2.2 * k)], [x + w + 1, y - h]], E(P.lamp[3])); }
      s.light('warm', x, y, 10 * k, 5 * k, 0.6);
    };
    for (let i = 0; i < 90; i++) {
      const t = Math.pow(rng(), 1.3), y = 84 + t * 70, x = 10 + rng() * 300;
      if (Math.abs(x - 160) < 46 && y > 124) continue;          // leave room for the hands
      lantern(rnd(x), rnd(y), 0.45 + t * 1.3);
    }
    // the hands, and the one lantern just touching the water
    const hx = 160, hy = 156;
    lantern(hx, hy, 3.6);
    s.light('warm', hx, hy - 6, 70, 42, 1.0);
    const SK = P.skin_peach, OL = P.olive;
    const hand = (side) => {
      // a sleeve from the bottom corner, the wrist, the palm under the lantern's corner, fingers up its side
      const wx = hx + side * 30, px0 = hx + side * 16;
      s.poly([[hx + side * 26, 180], [hx + side * 62, 180], [hx + side * 44, 164], [hx + side * 24, 168]], OL[2]);
      s.line(hx + side * 24, 168, hx + side * 44, 164, OL[4]);
      s.poly([[hx + side * 22, 170], [hx + side * 36, 166], [hx + side * 26, 156], [hx + side * 16, 160]], SK[2]);
      s.ellipse(px0, hy + 1, 7, 4, (x, y, nx, ny) => cl(SK, ny < -0.2 ? 4 : nx * side > 0.4 ? 2 : 3));
      for (let k = 0; k < 4; k++) {
        const fx = px0 - side * (2 + k * 0) - side * 3 + side * k * 0.5, fy = hy - 3 - k * 3;
        s.rect(side < 0 ? fx - 5 : fx + 1, fy, 5, 2, SK[k === 0 ? 4 : 3]); s.px(side < 0 ? fx - 5 : fx + 5, fy, SK[2]);
      }
      // thumb hooked over the near face
      s.rect(side < 0 ? px0 + 4 : px0 - 7, hy - 4, 3, 5, SK[4]); s.px(side < 0 ? px0 + 5 : px0 - 6, hy - 4, SK[5]);
    };
    hand(-1); hand(1);
    // ripples spreading where the lantern meets the water
    for (const [rx, ry] of [[22, 4], [34, 6]]) s.ring(hx, hy + 2, rx, ry, E(P.lamp[2]));
  }

  /* ================================================================== */
  /* CG_STANDPIPE — the top of the hill on Quiet Night. The Keeper's    */
  /* Lamp on the highest stone, burning green; the still people at the */
  /* edge of the light; the Society watching from under the trees       */
  /* ================================================================== */
  PX.cg('cg_standpipe', {
    times: ['quiet'],
    draw(s, o) { cgStandpipe(s, o); }
  });

  function cgStandpipe(s, o) {
    const rng = PX.rng('cg_standpipe');
    const LX = 200, LY = 52;                                   // the lamp
    s.vgrad(0, 0, 320, 110, [E(P.sky_quiet[0]), E(P.sky_quiet[1]), E(P.sky_quiet[2])], 3);
    for (let i = 0; i < 26; i++) s.px(rng.int(0, 319), rng.int(0, 60), E(P.sky_quiet[4]));
    // the hilltop: grass under a dark that is darker than night
    s.poly([[0, 120], [60, 104], [140, 96], [260, 98], [320, 108], [320, 180], [0, 180]], P.grass[1]);
    s.grass(0, 104, 320, 76, P.grass, { rng, base: 2, density: 0.06 });
    // the broken ring of the Standpipe: courses of granite, highest at the lamp
    const ring = (x) => { const u = (x - 196) / 92; return Math.abs(u) > 1 ? null : 104 - Math.sqrt(1 - u * u) * 6; };
    for (let x = 104; x < 290; x++) {
      const base = ring(x); if (base === null) continue;
      const hgt = 20 + 26 * Math.exp(-Math.pow((x - LX) / 18, 2)) + 10 * Math.exp(-Math.pow((x - 140) / 14, 2)) - (hash(flo(x / 7), 3) < 0.3 ? 8 : 0);
      for (let y = rnd(base - hgt); y < base; y++) {
        const row = flo((base - y) / 5), off = row & 1 ? 4 : 0;
        s.px(x, y, (base - y) % 5 < 1 || (x + off) % 9 === 0 ? P.stone[1] : cl(P.stone, 2 + (hash(flo((x + off) / 9), row) < 0.3 ? 1 : 0)));
      }
    }
    // the Lamp: brass cage, green panes, the flame
    s.rect(LX - 4, LY - 8, 9, 12, P.brass[2]); s.rect(LX - 3, LY - 6, 7, 9, E(P.lantern[3]));
    s.rect(LX - 1, LY - 4, 3, 4, E(P.lantern[5])); s.px(LX, LY - 5, E(P.white[5]));
    s.poly([[LX - 4, LY - 8], [LX, LY - 12], [LX + 5, LY - 8]], P.brass[3]); s.px(LX, LY - 13, P.brass[4]);
    s.light('green', LX, LY + 20, 110, 70, 1.15);
    s.light('green', LX, LY, 30, 24, 0.6);
    // the still people at the edge of the light, faces you can't see
    const edge = [[118, 'dress', 22], [134, 'glove', 25], [262, 'hat', 30], [280, 'plain', 27], [250, 'dress', 19], [292, 'coat', 29]];
    for (const [x, kind, h] of edge) shape(s, x, 116 + (h - 22) * 0.4, h, P.ink[0], kind);
    // Wes, walking toward the light, his back to us
    { const x = 178, y = 132; shape(s, x, y, 34, P.plaid_r ? P.plaid_r[1] : P.red[1], 'plain'); s.rect(x - 2, y - 33, 4, 4, P.hair_brown[1]); for (let k = 0; k < 6; k++) s.px(x - 2 + (k % 3) * 2, y - 26 + flo(k / 3) * 5, P.plaid_r ? P.plaid_r[2] : P.red[2]); }
    // the trees on the near side, and under them the eleven in good coats
    for (let x = -10; x < 120; x += 24) s.foliage(x, 30 + (x & 7), 30, 34, [P.pine, P.grass], { rng, clusters: 30 });
    for (let x = 0; x < 110; x += 26) { s.rect(x + 8, 50, 5, 110, P.bark[1]); s.vline(x + 8, 50, 160, P.bark[2]); }
    for (let i = 0; i < 11; i++) {
      const x = 14 + i * 9 + (i % 2) * 3, y = 160 - (i % 3) * 6, h = 38 - (i % 3) * 5;
      shape(s, x, y, h, P.ink[1], 'coat');
      s.px(x + 1, y - h * 0.74, E(P.brass[4]));             // a little brass lantern on each collar
    }
    s.light('green', 60, 130, 70, 30, 0.2);
    // the dark beyond the circle: darker than night
    band(s, FULL, (x, y) => Math.hypot((x - LX) / 150, (y - LY - 40) / 110) * 2.2 - 1.2, 0.5);
  }

  /* ================================================================== */
  /* CG_JUNE_WINDOW — a girl on the porch roof outside your window.     */
  /* Her breath doesn't fog the glass. She smiles. It's your smile.     */
  /* ================================================================== */
  PX.cg('cg_june_window', {
    times: ['night'],
    draw(s, o) { cgJuneWindow(s, o); }
  });

  function cgJuneWindow(s, o) {
    // the window fills the frame: the night street behind her, the porch roof at her waist
    s.vgrad(0, 0, 320, 120, [E(P.sky_night[0]), E(P.sky_night[1]), E(P.sky_night[2])], 3);
    const rng = PX.rng('june_window');
    s.stars(0, 0, 320, 70, 30, { rng });
    // across the street: the Gagnons' roofline and a dead porch light
    s.poly([[0, 96], [70, 70], [140, 96]], E(P.nite[1])); s.rect(0, 96, 150, 40, E(P.nite[2]));
    s.poly([[190, 90], [262, 64], [334, 90]], E(P.nite[1])); s.rect(190, 90, 130, 40, E(P.nite[2]));
    for (const [wx, wy] of [[24, 106], [100, 106], [214, 100], [290, 100]]) s.rect(wx, wy, 8, 10, E(P.nite[0]));
    // the glass: faint reflections of the room on the dark beyond her
    for (let y = 0; y < 152; y++) for (let x = 0; x < 320; x++) if (PX.bayer(x, y) < 0.06 && (x + y) % 7 === 0) { const v = s.get(x, y); if (v) s.px(x, y, E(SH(v & 0x7fff, 1))); }
    // the porch roof shingles at her waist, wet with dew
    for (let y = 136; y < 152; y++) for (let x = 0; x < 320; x++) { const row = flo((y - 136) / 3), u = ((x + (row & 1) * 3) % 6 + 6) % 6; s.px(x, y, cl(P.roof, (u === 0 ? 1 : 2) + ((y - 136) % 3 === 2 ? -1 : 0))); }
    // June: the ghost's own portrait, outside the glass, giving off a little light of her own
    const def = PX.ART.chars.june_ghost || PX.ART.chars.june;
    if (def) {
      const oo = { expr: 'smile', blink: false, outfit: null, flip: false, rng: PX.rng('char:june_ghost'), W: PX.SW, H: PX.SH };
      const cs = new PX.Surf(PX.SW, PX.SH, oo);
      try { def.draw(cs, oo); if (def.decal) def.decal(cs, oo); } catch (e) { /* drawn without her if the rig changes */ }
      s.stamp(cs, 160 - PX.SW / 2, 16, { map: (v) => E(SH(v & 0x7fff, -1)) });
    }
    s.light('cool', 160, 70, 80, 70, 0.35);
    // the sashes: three over three, the meeting rail across her chest
    const fr = P.trim;
    const bar = (x, y, w, h, lit) => { s.rect(x, y, w, h, fr[2]); if (w > h) { s.hline(x, x + w - 1, y, fr[3]); s.hline(x, x + w - 1, y + h - 1, fr[1]); } else { s.vline(x, y, y + h - 1, fr[3]); s.vline(x + w - 1, y, y + h - 1, fr[1]); } };
    bar(0, 0, 320, 6); bar(0, 146, 320, 8);
    bar(0, 0, 10, 154); bar(310, 0, 10, 154);
    bar(0, 104, 320, 7);
    for (const mx of [107, 211]) bar(mx, 0, 4, 154);
    // the sash lock on the meeting rail, the sill, the curtains you pushed aside
    s.rect(156, 102, 9, 4, P.brass[3]); s.hline(156, 164, 102, P.brass[5]);
    s.rect(0, 154, 320, 26, fr[3]); s.hline(0, 319, 154, fr[4]); s.hline(0, 319, 158, fr[2]);
    for (const side of [0, 1]) for (let y = 0; y < 180; y++) for (let k = 0; k < 18; k++) { const x = side ? 302 + k : k; if (y > 150 || k > 3 + (side ? 0 : 0)) { const sh = 2 + PX.HOME.fold(k, 5); if (PX.bayer(x, y) < 0.85) s.px(x, y, cl(P.white_cloth, sh)); } }
    // the cold off the glass
    band(s, FULL, (x, y) => Math.abs(x - 160) / 150 + (y < 20 ? (20 - y) / 20 : 0) - 0.3, 0.5);
  }

  /* ================================================================== */
  /* TITLE — Derry at night: the town asleep, the canal, the hill, and  */
  /* on the hill the small green light. The menu sits on the left.      */
  /* ================================================================== */
  PX.cg('title', {
    times: ['night'],
    draw(s, o) { title(s, o); }
  });

  function title(s, o) {
    const rng = PX.rng('title');
    s.vgrad(0, 0, 320, 120, [E(P.sky_night[0]), E(P.sky_night[1]), E(P.sky_night[2]), E(P.sky_night[3])], 5);
    s.stars(0, 0, 320, 90, 70, { rng });
    s.circle(262, 26, 9, E(P.white[4])); s.circle(265, 24, 8, E(P.white[5])); s.px(259, 27, E(P.cloud[3])); s.px(262, 30, E(P.cloud[3]));
    // far hills, and the Standpipe hill on the right with its broken ring
    s.poly([[0, 96], [60, 84], [120, 90], [170, 80], [200, 84], [320, 76], [320, 120], [0, 120]], E(P.sky_night[1]));
    s.poly([[150, 108], [196, 86], [232, 64], [254, 58], [276, 62], [306, 80], [320, 92], [320, 120], [150, 120]], P.grass[1]);
    for (let x = 238; x < 272; x++) { const h = 6 + 5 * Math.exp(-Math.pow((x - 262) / 5, 2)) - (hash(x >> 2, 1) < 0.3 ? 3 : 0); s.vline(x, rnd(60 - h), 60, (x % 5) ? P.stone[1] : P.stone[0]); }
    s.px(262, 47, E(P.lantern[5])); s.px(261, 47, E(P.lantern[3])); s.px(263, 47, E(P.lantern[3])); s.px(262, 46, E(P.lantern[4]));
    s.light('green', 262, 50, 40, 26, 0.7);
    // the beam of the lamp, a faint green cone down the hill toward the town
    s.lightPoly('green', [[258, 50], [266, 50], [236, 120], [200, 120]], 0.18, { fade: { x0: 262, y0: 50, x1: 220, y1: 120 } });
    // the town: rooftops, steeples, a few lit windows
    for (let x = -6; x < 330; x += rng.int(9, 18)) {
      const w = rng.int(12, 22), h = rng.int(14, 30) + (x > 120 && x < 240 ? 6 : 0), top = 128 - h;
      s.rect(x, top, w, h, P.roof[1]); s.poly([[x - 1, top], [x + w / 2, top - rng.int(4, 9)], [x + w + 1, top]], P.roof[0]);
      for (let wy = top + 5; wy < 124; wy += 7) for (let wx = x + 3; wx < x + w - 2; wx += 5) if (rng() < 0.18) s.rect(wx, wy, 2, 3, E(P.lamp[rng() < 0.5 ? 3 : 4]));
    }
    for (const [sx, sh] of [[176, 44], [116, 30]]) { s.rect(sx, 128 - sh, 6, sh, P.roof[1]); s.poly([[sx - 2, 128 - sh], [sx + 3, 128 - sh - 14], [sx + 8, 128 - sh]], P.roof[0]); s.px(sx + 3, 128 - sh + 6, E(P.lamp[3])); }
    // the canal in front, a few lanterns and their reflections, the lamps on the bank
    s.rect(0, 128, 320, 4, P.stone[2]); s.hline(0, 319, 128, P.stone[3]);
    for (let y = 132; y < 180; y++) for (let x = 0; x < 320; x++) { const rip = Math.sin(x * 0.17 + y * 1.4) + Math.sin(x * 0.04 - y * 0.6); s.px(x, y, rip > 1.5 ? P.water[2] : P.water[1]); }
    for (let y = 132; y < 160; y++) for (let x = 0; x < 320; x++) { const v = s.get(x, 2 * 129 - y); if (isE(v) && (y & 1) && PX.bayer(x, y) < 0.6) s.px(x + (y % 4 === 1 ? 1 : 0), y, E(SH(v & 0x7fff, -1))); }
    for (const lx of [200, 236, 272, 306]) { s.vline(lx, 112, 128, P.ink[2]); s.rect(lx - 1, 110, 3, 3, E(P.lamp[4])); s.light('warm', lx, 128, 18, 10, 0.6); for (let r = 2; r < 18; r += 2) s.px(lx, 130 + r, E(P.lamp[r < 8 ? 3 : 2])); }
    for (const [lx, ly] of [[150, 150], [176, 158], [210, 146], [252, 164], [284, 152]]) { s.rect(lx - 2, ly - 2, 5, 3, E(P.lamp[4])); s.hline(lx - 2, lx + 2, ly - 2, E(P.lamp[5])); for (let r = 1; r < 6; r++) s.px(lx + (r & 1), ly + r, E(P.lamp[2])); s.light('warm', lx, ly, 10, 5, 0.5); }
    // leaves on the wind, and the left side kept calm for the menu
    for (let i = 0; i < 10; i++) { const x = rng.int(140, 316), y = rng.int(20, 120); s.rect(x, y, 2, 1, rng.pick([P.leaf_orange[3], P.leaf_red[3], P.leaf_gold[3]])); }
    band(s, FULL, (x, y) => (150 - x) / 70, 0.4);
  }
})();
