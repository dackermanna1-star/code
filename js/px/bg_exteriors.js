/* What Derry Keeps — more exteriors, pixel art.
 *   theater       the Aladdin, Friday night, from the curb            night
 *   canal         the Lantern Float on the canal                      lanterns
 *   park          Bassey Park and the fiberglass Paul Bunyan          afternoon
 *   street_quiet  the corner of Larch on Quiet Night                  quiet
 */
(function () {
  'use strict';
  const P = PX.P, E = PX.E, SH = PX.sh, R = PX.ramp;
  const rnd = Math.round, flo = Math.floor;
  const cl = (r, s) => r[Math.max(0, Math.min(r.length - 1, s))];
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  /* the 3×5 font and shading helpers live in bg_homes.js, which loads later */
  const text = (...a) => PX.HOME.text(...a), textW = (...a) => PX.HOME.textW(...a), band = (...a) => PX.HOME.band(...a);
  const isE = (v) => (v & 0x8000) !== 0;
  const textC = (s, cx, y, str, c) => text(s, rnd(cx - textW(str) / 2), y, str, c);
  const TXT = new PX.Surf(240, 8);
  function bigText(s, x, y, str, c, k = 2) {
    TXT.d.fill(0);
    const w = text(TXT, 0, 1, str, 1);
    for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < w + 2; xx++) if (TXT.get(xx, yy)) s.rect(x + xx * k, y + (yy - 1) * k, k, k, typeof c === 'function' ? c(xx, yy) : c);
    return w * k;
  }
  /* a standing figure silhouette, h px tall, feet at (x, y) */
  function figure(s, x, y, h, c, o = {}) {
    const hw = Math.max(1, rnd(h * 0.12)), head = Math.max(2, rnd(h * 0.16));
    s.rect(x - hw, y - h + head, hw * 2 + 1, rnd(h * 0.5), c);                 // torso
    s.rect(x - hw, y - rnd(h * 0.36), hw, rnd(h * 0.36), c); s.rect(x + 1, y - rnd(h * 0.36), hw, rnd(h * 0.36), c);   // legs
    s.rect(x - rnd(head / 2), y - h, head, head, c);                              // head
    if (o.skirt) s.rect(x - hw - 1, y - rnd(h * 0.45), hw * 2 + 3, rnd(h * 0.2), c);
    if (o.rim) s.vline(x - hw, y - h + head, y - rnd(h * 0.4), o.rim);
  }

  /* ================================================================== */
  /* THEATER — the Aladdin's marquee, four hundred bulbs, two out        */
  /* ================================================================== */
  PX.bg('theater', {
    times: ['night'],
    draw(s, o) { theater(s, o); }
  });

  function theater(s, o) {
    const T = P.tn_terra || P.stone_warm, rng = PX.rng('theater');
    const GY = 146;                                   // the curb line
    // sky above the parapet
    s.vgrad(0, 0, 320, 30, [E(P.sky_night[1]), E(P.sky_night[2])], 3);
    s.stars(0, 0, 320, 20, 18, { rng });
    // neighbours: dark brick on both sides
    for (const [x0, x1, top, r] of [[0, 70, 18, P.brick], [250, 320, 22, P.house_blue]]) {
      s.bricks(x0, top, x1 - x0, GY - top, r, { rng, base: 2 });
      s.rect(x0, top, x1 - x0, 3, r[3]);
      for (let wy = top + 10; wy < 90; wy += 26) for (let wx = x0 + 10; wx < x1 - 12; wx += 22) s.window(wx, wy, 12, 16, { glass: 'night', frame: P.trim, lit: hash(wx, wy) < 0.25, rng });
    }
    // the Aladdin: cream terracotta in courses, pilasters, a scalloped parapet
    const x0 = 62, x1 = 258, top = 12;
    s.rect(x0, top, x1 - x0, GY - top, T[4]);
    for (let y = top + 4; y < GY; y += 6) s.hline(x0, x1 - 1, y, T[3]);
    for (let y = top + 4, r = 0; y < GY; y += 6, r++) for (let x = x0 + (r % 2 ? 6 : 0); x < x1; x += 12) s.vline(x, y + 1, y + 5, T[3]);
    for (let x = x0; x < x1; x += 10) s.ellipse(x + 5, top, 5, 3, T[4]);
    s.hline(x0, x1 - 1, top + 1, T[2]);
    for (const px of [x0, x1 - 10]) { s.rect(px, top + 2, 10, GY - top - 2, T[5]); s.vline(px + 9, top + 2, GY - 1, T[2]); for (let y = top + 8; y < GY - 6; y += 12) s.rect(px + 3, y, 4, 6, T[3]); }
    // the onion-arch window over the marquee
    const ax = 160, aw = 24;
    const arch = [[ax - aw, 54], [ax - aw, 34], [ax - aw + 4, 26], [ax - 12, 20], [ax - 4, 15], [ax, 9], [ax + 4, 15], [ax + 12, 20], [ax + aw - 4, 26], [ax + aw, 34], [ax + aw, 54]];
    s.poly(arch.map(([x, y]) => [x + (x < ax ? -3 : x > ax ? 3 : 0), y - 3]).concat([[ax + aw + 3, 56], [ax - aw - 3, 56]]), T[2]);
    s.poly(arch, E(P.lamp[3]));
    s.clip(arch, () => { s.vgrad(ax - aw, 8, aw * 2, 48, [E(P.lamp[4]), E(P.lamp[3]), E(P.lamp[2])], 3); for (let y = 12; y < 56; y += 6) for (let x = ax - aw; x <= ax + aw; x += 6) { s.px(x, y, P.camel[2]); s.px(x + 3, y + 3, P.camel[2]); } });
    s.light('warm', ax, 36, 40, 30, 0.5);
    // the blade sign, ALADDIN in red neon, stacked
    const bx = 228;
    s.rect(bx, 0, 18, 62, P.ink[2]); s.rect(bx + 1, 0, 16, 61, P.maroon[1]); s.vline(bx, 0, 61, P.ink[1]);
    'ALADDIN'.split('').forEach((ch, i) => { text(s, bx + 7, 3 + i * 8, ch, E(P.neon[4])); text(s, bx + 6, 3 + i * 8, ch, E(P.neon[3])); });
    for (let y = 1; y < 60; y += 3) { s.px(bx + 2, y, E(P.lamp[5])); s.px(bx + 15, y + 1, E(P.lamp[5])); }
    s.light('red', bx + 9, 30, 30, 40, 0.7);
    // the marquee: chaser bulbs round a white board
    const mx0 = 72, mx1 = 248, my0 = 58, my1 = 86;
    s.poly([[mx0 - 6, my0], [mx1 + 6, my0], [mx1, my1 + 6], [mx0, my1 + 6]], P.maroon[2]);
    s.rect(mx0 - 6, my0, mx1 - mx0 + 12, 4, P.maroon[3]); s.hline(mx0 - 6, mx1 + 5, my0, P.maroon[4]);
    s.rect(mx0, my0 + 6, mx1 - mx0, my1 - my0 - 4, E(P.white[5]));
    for (let yy = my0 + 7; yy < my1 + 2; yy += 9) s.hline(mx0 + 1, mx1 - 2, yy, E(P.white[3]));
    const lines = ['NOW SHOW NG', '7 & 9'];
    bigText(s, rnd(160 - textW(lines[0])), my0 + 9, lines[0], P.ink[2], 2);
    bigText(s, rnd(160 - textW(lines[1])), my0 + 21, lines[1], P.red[2], 2);
    // the bulbs (two out)
    let n = 0;
    const bulb = (x, y) => { n++; const out = n === 17 || n === 41; s.px(x, y, out ? P.ink[3] : E(n % 2 ? P.lamp[5] : P.white[5])); };
    for (let x = mx0 - 4; x <= mx1 + 4; x += 3) bulb(x, my0 + 2);
    for (let x = mx0 + 1; x <= mx1 - 1; x += 3) bulb(x, my1 + 4);
    s.light('warm', 160, my1 + 10, 150, 50, 1.0);
    s.light('warm', 160, 120, 120, 40, 0.6);
    // under the marquee: the lobby doors, the box office, the poster cases
    s.rect(90, my1 + 6, 140, GY - my1 - 6, T[2]);
    for (let k = 0; k < 4; k++) {
      const dx = 96 + k * 34 - (k > 1 ? -0 : 0);
      if (k === 1 || k === 2) continue;
      s.rect(dx, 100, 26, GY - 100, P.brass[2]);
      s.rect(dx + 2, 102, 22, GY - 102, E(P.lamp[3])); s.vgrad(dx + 2, 102, 22, GY - 102, [E(P.lamp[4]), E(P.lamp[3]), E(P.maroon[3])], 2);
      s.vline(dx + 13, 102, GY - 1, P.brass[3]); s.rect(dx + 9, 120, 2, 6, P.brass[5]); s.rect(dx + 15, 120, 2, 6, P.brass[5]);
    }
    // the box office: a round-topped booth, a face in the window
    s.rect(140, 104, 40, GY - 104, P.maroon[2]); s.ellipse(160, 104, 20, 8, (x, y, nx, ny) => (ny < 0 ? P.maroon[3] : 0));
    s.rect(146, 108, 28, 16, E(P.lamp[4])); s.rect(147, 124, 26, 2, P.brass[4]);
    s.rect(156, 112, 7, 8, P.ink[3]); s.rect(157, 110, 5, 3, P.hair_gray[2]); s.rect(152, 118, 15, 6, P.navy[2]);
    text(s, 149, 129, 'TICKETS', P.brass[5]);
    s.rect(146, 135, 28, 2, P.brass[3]);
    // poster cases, lit from inside
    const poster = (x, kind) => {
      s.rect(x - 2, 96, 34, 44, P.brass[2]); s.rect(x, 98, 30, 40, E(P.white[4]));
      const pal = kind ? [P.navy, P.red, P.yellow] : [P.ink, P.leaf_orange, P.white];
      s.vgrad(x + 2, 100, 26, 36, [E(pal[0][2]), E(pal[0][3]), E(pal[1][2])], 3);
      if (kind) { s.circle(x + 15, 112, 6, E(pal[2][4])); s.rect(x + 6, 122, 18, 2, E(pal[1][4])); s.rect(x + 9, 126, 12, 2, E(P.white[5])); }
      else { s.poly([[x + 15, 104], [x + 26, 126], [x + 4, 126]], E(pal[1][3])); s.rect(x + 6, 129, 18, 2, E(pal[2][4])); s.circle(x + 15, 116, 2, E(P.white[5])); }
      s.light('warm', x + 15, 118, 26, 30, 0.5);
    };
    poster(32, 0); poster(258, 1);
    // the sidewalk, the curb, the street and its reflections
    s.rect(0, GY, 320, 18, P.concrete[3]);
    for (let x = 0; x < 320; x += 24) s.vline(x, GY, GY + 17, P.concrete[2]);
    s.hline(0, 319, GY, P.concrete[4]);
    s.rect(0, GY + 18, 320, 2, P.concrete[4]); s.rect(0, GY + 20, 320, 160 - GY, P.asphalt[2]);
    for (let y = GY + 21; y < 180; y++) for (let x = 0; x < 320; x++) {
      const mirror = 2 * (GY + 20) - y;
      if (hash(x, y) < 0.5 && (y & 1)) { const v = s.get(x, Math.max(0, mirror - 64)); if (isE(v) && PX.bayer(x, y) < 0.5) s.px(x, y, E(SH(v & 0x7fff, -2))); }
    }
    // a few people in line, warm rim light from the doors
    for (const [fx, fh, c] of [[118, 30, P.ink[2]], [126, 27, P.ink[1]], [190, 31, P.ink[2]], [199, 24, P.ink[1]]]) figure(s, fx, GY + 2, fh, c, { rim: E(P.lamp[2]) });
    s.light('warm', 160, GY + 6, 160, 18, 0.45);
  }

  /* ================================================================== */
  /* CANAL — the Lantern Float: little houses of light on black water,  */
  /* the whole town along the railings, the bridge downstream            */
  /* ================================================================== */
  PX.bg('canal', {
    times: ['lanterns'],
    draw(s, o) { canal(s, o); }
  });

  function lanternAt(s, x, y, k, glow = true) {
    // a paper lantern: a little lit house on the water
    const w = Math.max(1, rnd(2 * k)), h = Math.max(1, rnd(2.4 * k));
    s.rect(x - w, y - h, w * 2 + 1, h, E(P.lamp[4]));
    if (h > 1) s.hline(x - w, x + w, y - h, E(P.lamp[5]));
    if (k > 1.4) { s.poly([[x - w - 1, y - h], [x, y - h - rnd(1.6 * k)], [x + w + 1, y - h]], E(P.lamp[3])); }
    if (glow) s.light('warm', x, y, 8 * k, 4 * k, 0.55);
  }

  function canal(s, o) {
    const rng = PX.rng('canal');
    const WL = 104;                                   // the far waterline
    // night sky, the town's roofs and steeples, the church
    s.vgrad(0, 0, 320, 70, [E(P.sky_night[1]), E(P.sky_night[2]), E(P.sky_night[3])], 4);
    s.stars(0, 0, 320, 40, 34, { rng });
    s.circle(258, 18, 5, E(P.white[5])); s.px(256, 16, E(P.cloud[3]));
    for (let x = 0; x < 320; x += rng.int(10, 22)) {
      const w = rng.int(12, 26), h = rng.int(18, 40);
      s.rect(x, 74 - h, w, h, P.roof[2]); s.poly([[x - 1, 74 - h], [x + w / 2, 74 - h - rng.int(4, 9)], [x + w + 1, 74 - h]], P.roof[1]);
      for (let wy = 74 - h + 6; wy < 70; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 6) if (rng() < 0.45) s.rect(wx, wy, 2, 3, E(P.lamp[rng() < 0.5 ? 3 : 4]));
    }
    s.rect(140, 22, 8, 52, P.roof[1]); s.poly([[138, 22], [144, 4], [150, 22]], P.roof[1]); s.px(144, 14, E(P.lamp[4]));
    // the arched stone bridge downstream
    s.rect(0, 74, 320, 8, P.stone[2]);
    for (let x = 0; x < 320; x++) {
      const t = (x - 160) / 60, a = Math.abs(t) < 1 ? Math.sqrt(1 - t * t) : 0;
      for (let y = 74; y < WL; y++) {
        if (a > 0 && y > 104 - a * 26) continue;
        s.px(x, y, (y - 74) % 5 === 0 || (x + (flo((y - 74) / 5) & 1) * 4) % 8 === 0 ? P.stone[1] : P.stone[2]);
      }
    }
    for (let x = 0; x < 320; x += 6) s.vline(x, 70, 74, P.stone[3]);
    s.hline(0, 319, 70, P.stone[3]);
    // people along the bridge rail
    for (let x = 4; x < 316; x += rng.int(5, 9)) figure(s, x, 74, rng.int(9, 12), P.ink[1]);
    // lanterns strung across the bridge
    for (let x = 0; x < 320; x += 10) { const y = 66 + Math.sin(x * 0.05) * 2; s.px(x, y, E(rng() < 0.5 ? P.lamp[4] : P.neon[4])); }
    // the water: black, the arch's reflection, lanterns doubled
    for (let y = WL - 30; y < 180; y++) for (let x = 0; x < 320; x++) {
      if (y < WL && s.get(x, y)) continue;
      const t = (x - 160) / 60, a = Math.abs(t) < 1 ? Math.sqrt(1 - t * t) : 0;
      if (y < WL && !(a > 0 && y > 104 - a * 26)) continue;
      const rip = Math.sin(x * 0.3 + y * 1.7) + Math.sin(x * 0.07 - y * 0.9);
      s.px(x, y, rip > 1.4 ? P.water[2] : y < WL + 20 ? P.water[0] : P.water[1]);
    }
    // the stone walls of the canal, both sides, with railings and the crowd
    const wallL = (y) => 100 - (y - WL) * 1.9, wallR = (y) => 220 + (y - WL) * 1.9;
    for (let y = WL; y < 180; y++) {
      const xl = wallL(y), xr = wallR(y);
      for (let x = 0; x < xl; x++) s.px(x, y, ((y + rnd(x * 0.5)) % 6 === 0) ? P.stone[1] : P.stone[2 + (hash(flo(x / 8), flo(y / 6)) < 0.3 ? 1 : 0)]);
      for (let x = rnd(xr); x < 320; x++) s.px(x, y, ((y + rnd(-x * 0.5)) % 6 === 0) ? P.stone[1] : P.stone[2 + (hash(flo(x / 8), flo(y / 6)) < 0.3 ? 1 : 0)]);
    }
    // the walkways along the top of the walls, crowds at the rail
    for (let y = 80; y < 180; y++) {
      const xl = wallL(y) - (y - 80) * 0.0, xr = wallR(y);
    }
    s.poly([[0, 84], [96, 84], [0, 136]], P.concrete[2]); s.poly([[320, 84], [224, 84], [320, 136]], P.concrete[2]);
    const railL = (t) => [100 - t * 100, 84 + t * 52], railR = (t) => [220 + t * 100, 84 + t * 52];
    // the lanterns light the crowd from below
    s.lightPoly('warm', [[100, 84], [0, 136], [0, 60], [100, 40]], 0.55, { fade: { x0: 60, y0: 110, x1: 30, y1: 40 } });
    s.lightPoly('warm', [[220, 84], [320, 136], [320, 60], [220, 40]], 0.55, { fade: { x0: 260, y0: 110, x1: 290, y1: 40 } });
    for (const rail of [railL, railR]) {
      for (let t = 0; t < 1; t += 0.004) { const [x, y] = rail(t); s.px(x, y - 8 - t * 10, P.metal[3]); }
      for (let t = 0; t < 1; t += 0.06) { const [x, y] = rail(t); s.vline(x, y - 8 - t * 10, y, P.metal[2]); }
      // people at the rail, bigger as they come near
      for (let t = 0.02; t < 1; t += 0.03 + t * 0.03) {
        const [x, y] = rail(t), h = rnd(10 + t * 34);
        const off = rail === railL ? -4 - t * 10 : 4 + t * 10;
        const fx = rnd(x + off + (rng() - 0.5) * 3), coat = rng.pick([P.navy, P.maroon, P.olive, P.camel, P.denim, P.knit_gray]);
        figure(s, fx, y, h, coat[2], { skirt: rng() < 0.3 });
        s.rect(fx - Math.max(1, rnd(h * 0.12)), y - rnd(h * 0.82), Math.max(1, rnd(h * 0.12)), rnd(h * 0.3), coat[3]);
        s.rect(fx - rnd(h * 0.08), y - h, Math.max(2, rnd(h * 0.16)), Math.max(1, rnd(h * 0.06)), rng.pick([P.hair_dark, P.hair_brown, P.hair_gray, P.knit_gray])[2]);
        // lit from below by the water: a warm edge on the side facing the canal
        const ex = rail === railL ? fx + Math.max(1, rnd(h * 0.12)) : fx - Math.max(1, rnd(h * 0.12));
        s.vline(ex, y - rnd(h * 0.84), y - rnd(h * 0.2), E(P.lamp[2])); s.px(fx, y - h, P.ink[3]);
      }
    }
    // the lanterns: hundreds, drifting toward the arch, each doubled below
    for (let i = 0; i < 240; i++) {
      const t = Math.pow(rng(), 1.5), y = WL + 2 + t * 70, half = (wallR(y) - wallL(y)) / 2 - 6, cx = 160 + Math.sin(i * 1.7) * 6 * t;
      const x = cx + (rng() * 2 - 1) * half, k = 0.5 + t * 1.25;
      if (y > 176) continue;
      lanternAt(s, rnd(x), rnd(y), k, i % 3 === 0);
      const rh = rnd(3 + t * 6);
      for (let r = 1; r < rh; r++) if (PX.bayer(rnd(x), rnd(y) + r) < 0.7 - r / rh * 0.6) s.px(rnd(x) + (r & 1 ? 1 : 0), rnd(y) + r, E(P.lamp[r < rh / 2 ? 3 : 2]));
    }
    // and under the arch, the far ones, a river of light
    for (let i = 0; i < 60; i++) { const x = 110 + rng() * 100, y = WL - rng() * 8; if (!s.get(x, y) || isE(s.get(x, y)) || s.get(x, y) === P.water[0] || s.get(x, y) === P.water[1] || s.get(x, y) === P.water[2]) s.px(x, y, E(P.lamp[rng() < 0.5 ? 4 : 3])); }
    s.light('warm', 160, 140, 120, 50, 0.45);
    s.light('warm', 160, WL, 70, 16, 0.4);
  }

  /* ================================================================== */
  /* PARK — Bassey Park: maples turning at the edges, the playground,  */
  /* and the giant fiberglass Paul Bunyan with his axe                  */
  /* ================================================================== */
  R('bunyan_shirt', ['#2a0a10', '#4e121a', '#7a1c24', '#a82c2e', '#d0483e', '#ec7254']);
  R('bunyan_pants', ['#0e1426', '#1a2442', '#28385e', '#3a4e7c', '#52689a', '#7088b6']);

  PX.bg('park', {
    times: ['afternoon'],
    draw(s, o) { park(s, o); }
  });

  function park(s, o) {
    const rng = PX.rng('park');
    const HZ = 92;
    s.vgrad(0, 0, 320, HZ, [E(P.sky_day[2]), E(P.sky_day[3]), E(P.sky_day[4]), E(P.sky_day[5])], 4);
    s.cloud(70, 22, 46, 10, { emit: true, rng }); s.cloud(210, 14, 30, 7, { emit: true, rng });
    // the town beyond: a steeple, roofs, far trees
    s.rect(122, 58, 6, 28, P.house_blue[4]); s.poly([[120, 58], [125, 44], [130, 58]], P.roof[4]); s.px(125, 62, P.ink[3]);
    for (let x = 0; x < 320; x += rng.int(12, 24)) { const h = rng.int(10, 20), w = rng.int(14, 24); s.rect(x, HZ - h, w, h, P.house_yellow[4]); s.poly([[x - 1, HZ - h], [x + w / 2, HZ - h - 6], [x + w + 1, HZ - h]], P.roof_red[4]); }
    for (let x = -10; x < 330; x += 14) s.foliage(x, HZ - 6, 12, 9, [P.grass_fall, P.leaf_gold, P.grass], { rng, clusters: 8 });
    // the lawn, a curving path
    s.grass(0, HZ, 320, 180 - HZ, P.grass, { rng, base: 3, density: 0.08 });
    const pathX = (y) => 150 + Math.sin((y - HZ) * 0.04) * 26 - (y - HZ) * 0.5;
    for (let y = HZ; y < 180; y++) { const w = 4 + (y - HZ) * 0.42, c = pathX(y); for (let x = rnd(c - w); x <= rnd(c + w); x++) s.px(x, y, (hash(x, y) < 0.08) ? P.dirt[3] : x < c - w + 2 ? P.dirt[5] : P.dirt[4]); }
    // dead leaves on the grass, drifted under the trees
    for (let i = 0; i < 900; i++) { const x = rng.int(0, 319), y = rng.int(HZ, 179); if (rng() < 0.6 || y > 150) s.px(x, y, rng.pick([P.leaf_orange[4], P.leaf_red[3], P.leaf_gold[4], P.leaf_orange[3], P.leaf_gold[3]])); }
    // the playground: swings and a slide on wood chips
    s.ellipse(80, 112, 54, 8, (x, y) => (hash(x, y) < 0.3 ? P.wood_pale[3] : P.wood_pale[4]));
    s.line(46, 112, 54, 82, P.red[3]); s.line(62, 112, 54, 82, P.red[3]); s.line(94, 112, 102, 82, P.red[3]); s.line(110, 112, 102, 82, P.red[3]);
    s.hline(54, 102, 82, P.red[4]); s.hline(54, 102, 83, P.red[2]);
    for (const sx of [64, 80, 92]) { s.vline(sx, 84, 102, P.metal[3]); s.vline(sx + 5, 84, 102, P.metal[3]); s.rect(sx - 1, 102, 8, 2, P.ink[3]); }
    // the slide
    s.rect(118, 84, 2, 28, P.metal[3]); s.rect(126, 84, 2, 28, P.metal[3]); for (let y = 88; y < 112; y += 4) s.hline(118, 127, y, P.metal[4]);
    s.rect(117, 82, 12, 3, P.yellow[3]); s.poly([[128, 84], [131, 84], [150, 110], [146, 112]], P.yellow[4]); s.line(128, 84, 147, 111, P.yellow[5]);
    // a bench and a lamppost by the path
    s.rect(214, 120, 26, 3, P.wood[3]); s.rect(214, 114, 26, 2, P.wood[3]); s.hline(214, 239, 114, P.wood[4]); for (const bx of [216, 236]) s.vline(bx, 115, 128, P.ink[3]);
    s.vline(200, 70, 130, P.ink[3]); s.rect(197, 66, 7, 5, P.ink[3]); s.rect(198, 67, 5, 3, P.white[3]);
    // maples framing the scene, just turning at the edges
    const maple = (cx, cy, rx, ry, turn) => {
      const tx = rnd(cx - 3), base = cy + ry + 34;
      for (let y = cy; y < base; y++) { const w = 3 + (y > base - 6 ? 2 : 0); for (let x = tx - w; x <= tx + w; x++) s.px(x, y, x < tx - 1 ? P.bark[4] : x < tx + 2 ? P.bark[3] : P.bark[2]); }
      s.foliage(cx, cy, rx, ry, turn > 0.5 ? [P.leaf_orange, P.leaf_gold, P.leaf_red] : [P.grass, P.leaf_gold, P.grass, P.leaf_orange], { rng, clusters: rnd(rx * ry / 7) });
      s.ellipse(tx, base, rx * 0.8, 4, (x, y) => (PX.bayer(x, y) < 0.6 ? SH(s.get(x, y) || P.grass[2], -1) : 0));
    };
    maple(16, 24, 40, 34, 0.7);
    maple(304, 30, 38, 32, 0.3);
    // Paul Bunyan: thirty feet of fiberglass, axe on his shoulder, cheerful
    bunyan(s, 262, 150);
    // the afternoon sun from the left: long shadows to the right
    s.light('sun', 120, 90, 220, 120, 0.4);
    band(s, [[0, 0], [320, 0], [320, 180], [0, 180]], (x, y) => (y - 150) / 30, 0.5);
  }

  function bunyan(s, x, feet) {
    const SHT = P.bunyan_shirt, PNT = P.bunyan_pants, SK = P.skin_warm, HR = P.hair_dark;
    // plinth
    s.rect(x - 22, feet - 6, 44, 8, P.stone[3]); s.hline(x - 22, x + 21, feet - 6, P.stone[4]); s.rect(x - 22, feet + 1, 44, 1, P.stone[1]);
    text(s, x - 15, feet - 4, 'P. BUNYAN', P.stone[1]);
    // boots and legs
    s.rect(x - 15, feet - 14, 12, 8, P.ink[2]); s.rect(x + 3, feet - 14, 12, 8, P.ink[2]); s.hline(x - 15, x - 4, feet - 14, P.ink[4]); s.hline(x + 3, x + 14, feet - 14, P.ink[4]);
    s.rect(x - 13, feet - 52, 11, 38, PNT[3]); s.rect(x + 3, feet - 52, 11, 38, PNT[2]); s.vline(x - 13, feet - 52, feet - 15, PNT[4]); s.vline(x + 1, feet - 50, feet - 15, PNT[1]);
    // the plaid shirt, belt, arms
    s.rect(x - 18, feet - 92, 36, 42, SHT[3]);
    for (let yy = feet - 92; yy < feet - 50; yy++) for (let xx = x - 18; xx < x + 18; xx++) { if (((xx - x) % 8 + 8) % 8 < 2 || ((yy - feet) % 8 + 8) % 8 < 2) s.px(xx, yy, ((xx - x) % 8 + 8) % 8 < 2 && ((yy - feet) % 8 + 8) % 8 < 2 ? P.ink[2] : SHT[1]); }
    s.vline(x + 17, feet - 92, feet - 51, SHT[1]); s.vline(x - 18, feet - 92, feet - 51, SHT[4]);
    s.rect(x - 18, feet - 54, 36, 4, P.wood_dark[2]); s.rect(x - 3, feet - 54, 6, 4, P.brass[4]);
    s.rect(x - 26, feet - 90, 9, 32, SHT[3]); s.rect(x + 17, feet - 90, 9, 22, SHT[2]);
    s.rect(x - 26, feet - 60, 9, 7, SK[3]);
    // the near arm up to the shoulder, holding the axe
    s.rect(x + 18, feet - 72, 9, 7, SK[3]);
    s.line(x + 22, feet - 66, x - 10, feet - 118, P.wood[3]); s.line(x + 23, feet - 66, x - 9, feet - 118, P.wood[2]);
    s.poly([[x - 14, feet - 124], [x - 2, feet - 120], [x - 6, feet - 110], [x - 18, feet - 114]], P.chrome[4]); s.line(x - 18, feet - 114, x - 14, feet - 124, P.white[5]);
    // the head: a black beard, a red toque, a grin
    s.rect(x - 10, feet - 112, 20, 20, SK[3]); s.vline(x + 9, feet - 112, feet - 93, SK[2]); s.vline(x - 10, feet - 112, feet - 93, SK[4]);
    s.rect(x - 11, feet - 100, 22, 10, HR[2]); s.rect(x - 9, feet - 92, 18, 4, HR[2]); s.rect(x - 5, feet - 98, 10, 2, P.white[5]); s.hline(x - 5, x + 4, feet - 96, P.lip[2]);
    s.rect(x - 7, feet - 106, 3, 3, P.white[5]); s.rect(x + 4, feet - 106, 3, 3, P.white[5]); s.px(x - 6, feet - 105, P.ink[1]); s.px(x + 5, feet - 105, P.ink[1]);
    s.hline(x - 8, x - 4, feet - 108, HR[2]); s.hline(x + 3, x + 7, feet - 108, HR[2]);
    s.rect(x - 2, feet - 104, 4, 3, SK[2]);
    s.rect(x - 11, feet - 118, 22, 7, SHT[3]); s.hline(x - 11, x + 10, feet - 112, P.white[4]); s.rect(x - 3, feet - 122, 6, 4, SHT[4]);
    // fiberglass shine and a shadow on the lawn
    s.vline(x - 16, feet - 90, feet - 60, SHT[5]);
    s.ellipse(x + 30, feet + 2, 34, 4, (xx, yy) => (PX.bayer(xx, yy) < 0.6 ? SH(s.get(xx, yy) || P.grass[2], -2) : 0));
  }

  /* ================================================================== */
  /* STREET_QUIET — the corner of Larch on Quiet Night: every window    */
  /* black, the cars asleep, one TV and a man at the glass, and far off */
  /* on the hill the small green light that never gets closer           */
  /* ================================================================== */
  PX.bg('street_quiet', {
    times: ['quiet'],
    draw(s, o) { streetQuiet(s, o); }
  });

  function streetQuiet(s, o) {
    const rng = PX.rng('street_quiet');
    const VX = 172, VY = 78;                           // the street runs away to the hill
    s.vgrad(0, 0, 320, VY + 4, [E(P.sky_quiet[1]), E(P.sky_quiet[2]), E(P.sky_quiet[3])], 3);
    for (let i = 0; i < 20; i++) s.px(rng.int(0, 319), rng.int(0, 50), E(P.sky_quiet[5]));
    // the hill and the Standpipe's broken ring, the green light on it
    s.ellipse(VX + 8, VY + 6, 80, 20, P.sky_quiet[0]);
    s.rect(VX + 2, VY - 18, 10, 6, P.sky_quiet[0]); s.rect(VX + 4, VY - 20, 3, 3, P.sky_quiet[0]);
    s.px(VX + 9, VY - 20, E(P.lantern[5])); s.px(VX + 8, VY - 20, E(P.lantern[3])); s.px(VX + 10, VY - 20, E(P.lantern[3])); s.px(VX + 9, VY - 21, E(P.lantern[3]));
    s.light('green', VX + 9, VY - 20, 14, 10, 0.6);
    // the street, the sidewalks, the curbs converging
    s.poly([[VX - 2, VY], [VX + 2, VY], [320, 150], [320, 180], [0, 180], [0, 150]], P.asphalt[3]);
    s.poly([[VX - 2, VY], [VX - 4, VY], [-60, 180], [0, 180], [0, 150]], P.concrete[3]);
    s.poly([[VX + 2, VY], [VX + 4, VY], [400, 180], [320, 180], [320, 150]], P.concrete[3]);
    for (let y = VY + 4; y < 180; y += 3) { const t = (y - VY) / (180 - VY); const x = VX + t * 6; if (((y - VY) / 6 | 0) % 2) s.rect(x, y, Math.max(1, rnd(t * 3)), Math.max(1, rnd(t * 2)), P.asphalt[3]); }
    // houses down both sides, every window black
    const house = (side, t0, t1, r) => {
      const xAt = (t) => side < 0 ? VX - 6 - t * 300 : VX + 6 + t * 300, gy = (t) => VY + t * 102;
      const xa = xAt(t0), xb = xAt(t1), ya = gy(t0), yb = gy(t1);
      const ha = 26 * (t0 * 6 + 0.12), hb = 26 * (t1 * 6 + 0.12);
      s.poly([[xa, ya - ha], [xb, yb - hb], [xb, yb], [xa, ya]], r[3]);
      s.line(xb, yb - hb, xb, yb, r[4]);
      s.poly([[xa, ya - ha], [xb, yb - hb], [xb + (xb - xa) * 0.05, yb - hb * 1.5], [xa, ya - ha * 1.5]], P.roof[1]);
      for (let k = 1; k < 4; k++) { const t = t0 + (t1 - t0) * (k / 4), x = xAt(t), y = gy(t), h = 26 * (t * 6 + 0.12); s.rect(x - h * 0.08, y - h * 0.75, Math.max(1, h * 0.16), Math.max(1, h * 0.24), P.ink[1]); }
      return { xa, xb, ya, yb, ha, hb, xAt, gy };
    };
    for (const side of [-1, 1]) {
      let t = 0.02;
      const ramps = side < 0 ? [P.house_green, P.house_yellow, P.house_blue] : [P.house_blue, P.house_green, P.stone_warm];
      let i = 0;
      while (t < 0.62) { const t1 = t + 0.06 + t * 0.7; house(side, t, Math.min(0.66, t1), ramps[i++ % 3]); t = t1 + 0.012; }
    }
    // the one TV: blue through drawn curtains, a man standing at the window, not moving
    const tvx = 222, tvy = 92;
    s.rect(tvx - 1, tvy - 1, 16, 15, P.ink[1]);
    s.vgrad(tvx, tvy, 14, 13, [E(P.tv[4]), E(P.tv[3]), E(P.tv[4])], 2);
    for (const cx of [tvx, tvx + 11]) s.rect(cx, tvy, 3, 13, E(P.tv[2]));          // the drawn curtains
    // the man: head, shoulders, standing, facing out
    s.rect(tvx + 5, tvy + 3, 4, 4, P.ink[0]); s.rect(tvx + 4, tvy + 7, 6, 6, P.ink[0]); s.rect(tvx + 3, tvy + 8, 1, 5, P.ink[0]); s.rect(tvx + 10, tvy + 8, 1, 5, P.ink[0]);
    s.light('cool', tvx + 7, tvy + 10, 34, 26, 0.8);
    s.lightPoly('cool', [[tvx - 4, tvy + 14], [tvx + 18, tvy + 14], [tvx + 40, 150], [tvx - 30, 150]], 0.3, { fade: { x0: tvx, y0: tvy + 14, x1: tvx, y1: 150 } });
    // parked cars like animals asleep
    const car = (x, y, w, r) => { const h = w * 0.32; s.rect(x, y - h * 0.55, w, h * 0.55, r[2]); s.poly([[x + w * 0.2, y - h * 0.55], [x + w * 0.32, y - h], [x + w * 0.7, y - h], [x + w * 0.82, y - h * 0.55]], r[1]); s.rect(x + w * 0.36, y - h * 0.92, w * 0.3, h * 0.3, P.ink[1]); s.rect(x + w * 0.12, y - 2, w * 0.14, 3, P.ink[0]); s.rect(x + w * 0.72, y - 2, w * 0.14, 3, P.ink[0]); };
    car(196, 118, 40, P.house_blue); car(232, 140, 70, P.maroon);
    car(108, 112, 30, P.olive);
    // streetlights, dead
    for (const [x, y, h] of [[132, 104, 30], [86, 128, 58], [252, 112, 40]]) { s.vline(x, y - h, y, P.ink[2]); s.hline(x, x + rnd(h * 0.2), y - h, P.ink[2]); s.rect(x + rnd(h * 0.2) - 1, y - h + 1, 3, 2, P.ink[3]); }
    // the corner mailbox in the near left, big and blue, where Teddy crouched
    const mx = 30, my = 176;
    s.rect(mx, my - 40, 34, 32, P.navy[3]); s.ellipse(mx + 17, my - 40, 17, 8, (x, y, nx, ny) => (ny < 0 ? P.navy[4] : 0));
    s.rect(mx + 4, my - 30, 26, 4, P.navy[1]); s.vline(mx, my - 40, my - 9, P.navy[4]); s.vline(mx + 33, my - 40, my - 9, P.navy[2]);
    text(s, mx + 6, my - 22, 'U.S.', P.white_cloth[3]); text(s, mx + 6, my - 16, 'MAIL', P.white_cloth[3]);
    s.rect(mx + 2, my - 8, 4, 8, P.navy[1]); s.rect(mx + 28, my - 8, 4, 8, P.navy[1]);
    // fog lying in the low places
    for (let y = VY; y < 180; y++) for (let x = 0; x < 320; x++) if (PX.bayer(x, y) < 0.14 * Math.max(0, 1 - Math.abs(y - 120) / 50)) { const v = s.get(x, y); if (v && !isE(v)) s.px(x, y, SH(v, 1)); }
  }
})();
