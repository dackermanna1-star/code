/* What Derry Keeps — town backgrounds, pixel art (320×180).
 *   road      rain (+ 'sign')          Aug 31, the drive into Derry: inside the wood-panel
 *                                      wagon at dusk in the rain; 'sign' = the DERRY sign
 *   downtown  day dusk night festival  Center Street. day = Sat Oct 12, 3:12 pm, empty;
 *                                      night = after the Lantern Float; festival = Canal Days
 *   (diner and records are in bg_rooms.js; theater is in bg_exteriors.js)
 */
(function () {
  'use strict';
  const P = PX.P, E = PX.E, sh = PX.sh;

  /* ------------------------------------------------------------------ */
  /* ramps (dark → light, hue-shifted). Prefixed tn_ to stay out of the  */
  /* way of the other art files.                                         */
  const R = PX.ramp;
  R('tn_sky_rd', ['#1b1c2b', '#29293c', '#3b3a51', '#544e67', '#756a80', '#9c8e9d']);
  R('tn_glow_rd', ['#3a2a3a', '#5a3b4a', '#825457', '#ab7262', '#cf9873', '#ebc091']);
  R('tn_mist', ['#141a20', '#1d252c', '#28323a', '#36414a', '#47535c', '#5c6871']);
  R('tn_dash', ['#100c0f', '#1c1519', '#2a2024', '#3a2d30', '#4e3e3f', '#685453']);
  R('tn_tan', ['#3b3029', '#5f5145', '#887563', '#ab9880', '#c9b89e', '#e2d6bf']);
  R('tn_card', ['#3a2414', '#5f3d20', '#87592e', '#ab7a41', '#c99c5e', '#e2c08a']);
  R('tn_far1', ['#2f3b4e', '#3f4e63', '#536379', '#6b7b90', '#8697aa', '#a4b3c3']);
  R('tn_far2', ['#1d2b2b', '#283b38', '#365049', '#46665a', '#5a7d6c', '#729682']);
  R('tn_back', ['#232737', '#32374b', '#444a60', '#596077', '#71788f', '#8d94a8']);
  R('tn_cl_dusk', ['#3c2a50', '#6a3d62', '#a65666', '#d97c68', '#f6ab74', '#ffd79e']);
  R('tn_cl_night', ['#0c1229', '#141d3b', '#1f2b4f', '#2c3b63', '#3d4e78', '#52648f']);
  R('tn_sky_fest', ['#191539', '#2c1f55', '#4e2f6a', '#874371', '#c4626a', '#f09a62']);
  R('tn_terra', ['#3d2b26', '#6a4b3f', '#98705a', '#c19a7c', '#dfc0a0', '#f4dfc4']);
  R('tn_brick_tan', ['#33251a', '#59422c', '#806040', '#a68055', '#c6a06e', '#dfc08e']);
  R('tn_signwood', ['#211915', '#372b25', '#4f4036', '#695748', '#86705d', '#a38c76']);

  /* ------------------------------------------------------------------ */
  /* pixel fonts: F5 is 5 px tall with variable width, F7 is 7 px tall.   */
  const F5 = {}, F7 = {};
  const glyphs = (tab, src) => { for (const k of Object.keys(src)) { const rows = src[k].split(' '); tab[k] = { w: rows[0].length, r: rows }; } };
  glyphs(F5, {
    A: '010 101 111 101 101', B: '110 101 110 101 110', C: '011 100 100 100 011', D: '110 101 101 101 110',
    E: '111 100 110 100 111', F: '111 100 110 100 100', G: '011 100 101 101 011', H: '101 101 111 101 101',
    I: '111 010 010 010 111', J: '001 001 001 101 010', K: '101 101 110 101 101', L: '100 100 100 100 111',
    M: '10001 11011 10101 10001 10001', N: '1001 1101 1011 1001 1001', O: '010 101 101 101 010', P: '110 101 110 100 100',
    Q: '010 101 101 110 011', R: '110 101 110 101 101', S: '011 100 010 001 110', T: '111 010 010 010 010',
    U: '101 101 101 101 111', V: '101 101 101 101 010', W: '10001 10001 10101 11011 10001', X: '101 101 010 101 101',
    Y: '101 101 010 010 010', Z: '111 001 010 100 111',
    0: '111 101 101 101 111', 1: '01 11 01 01 01', 2: '110 001 010 100 111', 3: '110 001 010 001 110',
    4: '101 101 111 001 001', 5: '111 100 110 001 110', 6: '011 100 111 101 111', 7: '111 001 010 010 010',
    8: '111 101 111 101 111', 9: '111 101 111 001 110',
    ' ': '00 00 00 00 00', '.': '0 0 0 0 1', ',': '0 0 0 1 1', "'": '1 1 0 0 0', '-': '000 000 111 000 000',
    '&': '010 101 010 101 011', ':': '0 1 0 1 0', '!': '1 1 1 0 1', '?': '110 001 010 000 010', '/': '001 001 010 100 100',
    '$': '011 110 010 011 110', '¢': '010 111 110 111 010', '·': '0 0 1 0 0', '+': '000 010 111 010 000',
    '"': '101 101 000 000 000', '—': '0000 0000 1111 0000 0000', '%': '101 001 010 100 101', '#': '101 111 101 111 101',
    '(': '01 10 10 10 01', ')': '10 01 01 01 10', '*': '000 101 010 101 000'
  });
  glyphs(F7, {
    A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
    C: '01110 10001 10000 10000 10000 10001 01110', D: '11110 10001 10001 10001 10001 10001 11110',
    E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
    G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001',
    I: '111 010 010 010 010 010 111', K: '10001 10010 10100 11000 10100 10010 10001',
    L: '10000 10000 10000 10000 10000 10000 11111', M: '10001 11011 10101 10101 10001 10001 10001',
    N: '10001 11001 10101 10011 10001 10001 10001', O: '01110 10001 10001 10001 10001 10001 01110',
    P: '11110 10001 10001 11110 10000 10000 10000', R: '11110 10001 10001 11110 10100 10010 10001',
    S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
    U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100',
    W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
    Y: '10001 10001 01010 00100 00100 00100 00100', ' ': '000 000 000 000 000 000 000',
    "'": '1 1 0 0 0 0 0', '&': '01100 10010 10100 01000 10101 10010 01101'
  });
  /* text width in pixels */
  function textW(str, o = {}) {
    const f = o.font || F5, sc = o.scale || 1, sp = o.sp === undefined ? 1 : o.sp;
    let w = 0;
    for (const ch of str) w += ((f[ch] || f[' ']).w + sp) * sc;
    return w - sp * sc;
  }
  /* draw text; c is a code or fn(col,row,charIndex)->code. o: font, scale, sp, align, mirror,
   * jitter (fn(i)->dy for hand-lettering), shadow (code drawn 1 px down-right first) */
  function text(s, str, x, y, c, o = {}) {
    const f = o.font || F5, sc = o.scale || 1, sp = o.sp === undefined ? 1 : o.sp;
    const w = textW(str, o);
    if (o.align === 'center') x = Math.round(x - w / 2); else if (o.align === 'right') x = Math.round(x - w);
    const chars = o.mirror ? [...str].reverse() : [...str];
    const pass = (code, ox, oy) => {
      let cx = x;
      chars.forEach((ch, i) => {
        const g = f[ch] || f[' '];
        const dy = o.jitter ? o.jitter(i) : 0;
        for (let row = 0; row < g.r.length; row++) for (let col = 0; col < g.w; col++) {
          if (g.r[row][o.mirror ? g.w - 1 - col : col] !== '1') continue;
          const cc = typeof code === 'function' ? code(col, row, i) : code;
          if (cc) s.rect(cx + col * sc + ox, y + (row + dy) * sc + oy, sc, sc, cc);
        }
        cx += (g.w + sp) * sc;
      });
    };
    if (o.shadow) pass(o.shadow, o.sx === undefined ? 1 : o.sx, o.sy === undefined ? 1 : o.sy);
    pass(c, 0, 0);
    return w;
  }
  /* letters stacked vertically, centred on cx */
  function vtext(s, str, cx, y, c, o = {}) {
    const f = o.font || F5, gap = o.gap === undefined ? 2 : o.gap, h = (f.A ? f.A.r.length : 5) * (o.scale || 1);
    [...str].forEach((ch, i) => text(s, ch, cx, y + i * (h + gap), c, Object.assign({}, o, { align: 'center' })));
  }

  /* ------------------------------------------------------------------ */
  /* small helpers                                                       */
  const clampI = (v, a, b) => Math.max(a, Math.min(b, v));
  /* shift the shade of whatever is at (x,y), keeping emissive pixels emissive */
  const lift = (s, x, y, d) => { const v = s.get(x, y); if (v) s.px(x, y, sh(v, d)); };
  /* dithered radial gradient: codes run from the centre outwards; the outer edge dithers into
   * whatever is already there */
  function radial(s, cx, cy, rx, ry, codes, o = {}) {
    const n = codes.length, dz = o.dither === undefined ? 0.9 : o.dither;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = Math.sqrt(dx * dx + dy * dy);
      if (d >= 1) continue;
      const k = Math.floor(d * n + (PX.bayer(x, y) - 0.5) * dz);
      if (k < n) s.px(x, y, codes[Math.max(0, k)]);
    }
  }
  /* a mask (Uint8Array) of a polygon, for fast inside tests */
  function polyMask(pts) {
    const t = new PX.Surf(PX.W, PX.H); t.poly(pts, 1);
    const m = new Uint8Array(PX.W * PX.H); for (let i = 0; i < m.length; i++) m[i] = t.d[i] ? 1 : 0;
    m.has = (x, y) => x >= 0 && y >= 0 && x < PX.W && y < PX.H && m[y * PX.W + x] === 1;
    return m;
  }
  /* a fir silhouette: drooping tiers drawn bottom-up so each skirt overhangs the one below,
   * lit from the left, dark undersides, seeded ragged hems. o.shade = base shade, o.lit = lit-side lift */
  function fir(s, x, base, h, ramp, o = {}) {
    const rng = o.rng || s.rng, b = o.shade === undefined ? 2 : o.shade, lit = o.lit === undefined ? 1 : o.lit;
    const C = (v) => ramp[clampI(v, 0, ramp.length - 1)];
    const w = h * (o.w || 0.3);
    const trunk = Math.max(1, Math.round(h * 0.06));
    if (h > 40) s.rect(x - 1, base - trunk, 3, trunk + 1, (o.trunk || P.bark)[Math.max(0, b - 1)]);
    const tiers = Math.max(3, Math.round(h / (o.tier || 5.5)));
    const top = base - h, bot = base - trunk;
    const spec = [];
    for (let t = 0; t < tiers; t++) {
      const f = (t + 1) / tiers;
      spec.push({ ty: top + (bot - top) * (t / tiers) * 0.94, th: ((bot - top) / tiers) * 1.8 + 1, tw: Math.max(0.6, w * (0.14 + 0.86 * f) * rng.range(0.86, 1.08)), sk: rng.range(-0.12, 0.12) });
    }
    for (let t = tiers - 1; t >= 0; t--) {
      const { ty, th, tw, sk } = spec[t];
      for (let yy = 0; yy < th; yy++) {
        const y = Math.round(ty + yy); if (y > bot) break;
        const k = (yy + 1) / th, hw = tw * Math.pow(k, 0.8), cx = x + sk * tw * k;
        const xa = Math.round(cx - hw), xb = Math.round(cx + hw);
        for (let xx = xa; xx <= xb; xx++) {
          const u = (xx - cx) / Math.max(1, hw);
          let sd = u < -0.42 ? b + lit : u > 0.45 ? b - 1 : b;
          if (yy >= th - 1.5) sd = u < -0.6 ? b : b - 1;               // the skirt's shadowed underside
          s.px(xx, y, C(sd));
        }
      }
      // ragged hem: needle tips hanging below the skirt
      const hy = Math.round(ty + th), cx = x + sk * tw;
      if (hy <= bot + 1) for (let xx = Math.round(cx - tw); xx <= Math.round(cx + tw); xx++) if (rng() < 0.28) s.px(xx, hy, C(xx < cx - tw * 0.4 ? b : b - 1));
      if (tw > 2.2) { s.px(Math.round(cx - tw - 1), hy - 1, C(b + lit)); s.px(Math.round(cx + tw + 1), hy - 1, C(b - 1)); }
    }
    s.px(x, top - 1, C(b));
  }

  /* ================================================================== */
  /* ROAD — inside the wagon, rain, dusk                                  */
  /* ================================================================== */
  PX.bg('road', {
    times: ['rain'],
    variants: ['sign'],
    draw(s, o) { drawRoad(s, o.variant === 'sign'); }
  });

  function drawRoad(s, sign) {
    const rng = PX.rng('tn_road');                 // same seed for both variants
    const VX = 160, VY = 64, F = 160, EH = 1.1;
    const X2 = (X, Z) => VX + (F * X) / Z, Y2 = (Z, Y = 0) => VY + (F * (EH - Y)) / Z;
    const sk = P.tn_sky_rd, gl = P.tn_glow_rd, mi = P.tn_mist;

    /* -- sky: low rain cloud, the last light smeared along the west -- */
    s.vgrad(0, 0, 320, VY + 4, [E(sk[2]), E(sk[3]), E(sk[4]), E(sk[5])], 6);
    radial(s, 132, VY + 1, 150, 19, [E(gl[4]), E(gl[3]), E(sk[5])]);
    // long cloud streaks
    const streak = (x, y, w, c) => { s.hline(x, x + w, y, c); s.hline(x + 3, x + w - 4, y + 1, c); };
    const r3 = PX.rng('tn_rdclouds');
    for (let i = 0; i < 14; i++) { const y = r3.int(6, 40), x = r3.int(-20, 300); streak(x, y, r3.int(20, 60), E(y < 22 ? sk[1] : sk[2])); }
    for (let i = 0; i < 8; i++) { const y = r3.int(30, 52), x = r3.int(-20, 300); s.hline(x, x + r3.int(12, 40), y, E(sk[3])); }

    /* -- far tree line across the horizon, lost in the rain -- */
    for (let x = -4; x < 324; x += 2) {
      const h = 4 + Math.round(2.5 * Math.sin(x * 0.045) + 1.5 * Math.sin(x * 0.19)) + rng.int(0, 2);
      fir(s, x, VY + 1, h, mi, { rng, shade: 5, lit: 0, w: 0.34 });
    }
    s.rect(0, VY - 1, 320, 3, mi[5]);

    /* -- the ground: verges either side -- */
    s.poly([[-2, VY + 1], [VX, VY + 1], [X2(-6.2, 3.5), Y2(3.5)], [-2, Y2(3.5)]], P.grass_fall[1]);
    s.poly([[VX, VY + 1], [322, VY + 1], [322, Y2(3.5)], [X2(3.0, 3.5), Y2(3.5)]], P.grass_fall[1]);
    for (let y = VY + 4; y < 108; y += 2) {            // grass tufts, coarser nearer
      const step = Math.max(3, Math.round((y - VY) / 4));
      for (let x = (y * 7) % step; x < 320; x += step) if (rng() < 0.3) { const t = Math.max(1, (y - VY) >> 4); s.vline(x, y - t, y, P.grass_fall[2]); if (t > 1) s.px(x, y - t, P.grass_fall[3]); }
    }
    /* -- utility poles on the far side, wires sagging toward the vanishing point -- */
    const poles = [];
    for (let Z = 14; Z < 260; Z *= 1.9) poles.push(Z);
    const ptop = (Z) => [X2(-8.5, Z), Y2(Z, 9.5)];
    for (let i = poles.length - 1; i > 0; i--) {
      const [ax, ay] = ptop(poles[i]), [bx, by] = ptop(poles[i - 1]);
      for (let k = 0; k <= 1; k++) for (let t = 0; t <= 1; t += 1 / Math.max(8, Math.abs(bx - ax))) s.px(ax + (bx - ax) * t, ay + (by - ay) * t + Math.sin(t * Math.PI) * (2 + (by - ay) * 0.08) + k * Math.max(1, 3 / poles[i] * 14), P.ink[2]);
    }

    /* -- tree rows on both sides, far to near -- */
    const trees = [];
    for (let Z = 260; Z > 9; Z /= 1 + rng.range(0.07, 0.16)) {
      trees.push({ Z, X: -rng.range(13, 20), h: rng.range(11, 17) });
      trees.push({ Z: Z * rng.range(0.93, 1.05), X: rng.range(9.5, 15), h: rng.range(11, 18) });
    }
    poles.forEach((Z) => trees.push({ Z, pole: true }));
    trees.sort((a, b) => b.Z - a.Z);
    let misted = false;
    for (const t of trees) {
      if (!misted && t.Z < 80) {        // rain haze between the far rows and the near ones
        misted = true;
        for (let y = VY - 16; y < VY + 3; y++) for (let x = 0; x < 320; x++) {
          const v = s.get(x, y); if (!v || (v & 0x8000)) continue;
          if (PX.bayer(x, y) < 0.5 * (1 - Math.abs(y - (VY - 4)) / 13)) s.px(x, y, mi[5]);
        }
      }
      if (t.pole) {
        const x = Math.round(X2(-8.5, t.Z)), yb = Math.round(Y2(t.Z)), yt = Math.round(Y2(t.Z, 10)), w = Math.max(1, Math.round(F * 0.3 / t.Z));
        s.rect(x - (w >> 1), yt, w, yb - yt, P.wood_dark[2]);
        if (w > 2) s.vline(x - (w >> 1), yt, yb, P.wood_dark[3]);
        const cw = Math.round(F * 1.4 / t.Z), cy = Math.round(Y2(t.Z, 9.4));
        s.hline(x - cw, x + cw, cy, P.wood_dark[2]);
        continue;
      }
      const hpx = Math.round((F * t.h) / t.Z), x = Math.round(X2(t.X, t.Z)), base = Math.round(Y2(t.Z));
      if (x < -50 || x > 370) continue;
      const ramp = t.Z > 42 ? mi : P.pine;
      const shade = t.Z > 150 ? 4 : t.Z > 90 ? 3 : t.Z > 42 ? 2 : t.Z > 20 ? 2 : 1;
      fir(s, x, base, hpx, ramp, { rng, shade, lit: 1, w: 0.22, tier: hpx > 60 ? 7 : 5 });
    }

    /* -- the road: wet asphalt mirroring the sky in long vertical smears -- */
    const roadPoly = [[VX - 1, VY + 1], [VX + 1, VY + 1], [X2(3.0, 3.5), Y2(3.5)], [X2(-6.2, 3.5), Y2(3.5)]];
    const roadM = polyMask(roadPoly);
    const len = [];
    for (let x = 0, v = 0; x < 320; x++) { if (x % 3 === 0) v = 6 + 30 * Math.abs(Math.sin(x * 0.37) * Math.sin(x * 0.11 + 1.3)); len.push(v); }
    for (let y = VY + 1; y < 112; y++) for (let x = 0; x < 320; x++) {
      if (!roadM.has(x, y)) continue;
      const d = y - VY, src = s.get(x, Math.max(0, 2 * VY - y + 1));
      let c = P.asphalt[d < 10 ? 3 : 2];
      if (d < len[x] && src) c = sh(src & 0x7fff, d > len[x] * 0.6 ? -2 : -1);
      else if (d < len[x] + 3 && PX.bayer(x, y) < 0.5 && src) c = sh(src & 0x7fff, -2);
      s.px(x, y, c);
    }
    // shoulders: gravel strips
    const strip = (Xa, Xb, code) => s.poly([[X2(Xa, 400), Y2(400)], [X2(Xb, 400), Y2(400)], [X2(Xb, 3.5), Y2(3.5)], [X2(Xa, 3.5), Y2(3.5)]], code);
    strip(1.6, 3.0, P.stone_warm[2]); strip(-6.2, -4.9, P.stone_warm[2]);
    s.clip(roadPoly, () => { for (let i = 0; i < 120; i++) { const Z = 3.5 + rng() * 40, X = rng() < 0.5 ? rng.range(1.7, 2.9) : rng.range(-6.1, -5.0); s.px(X2(X, Z), Y2(Z), P.stone_warm[rng() < 0.5 ? 1 : 3]); } });
    // lane paint: white edge line, dashed yellow centre line
    const paint = (X, w, code, dash) => {
      for (let Z = 3.5; Z < 300; Z += dash ? 12 : 300) {
        const z1 = dash ? Z + 3.5 : 300;
        s.poly([[X2(X - w, z1), Y2(z1)], [X2(X + w, z1), Y2(z1)], [X2(X + w, Z), Y2(Z)], [X2(X - w, Z), Y2(Z)]], code);
        s.line(X2(X, Z), Y2(Z), X2(X, z1), Y2(z1), code);
      }
    };
    paint(1.45, 0.08, P.trim[3], false);
    paint(-2.25, 0.08, P.mustard[4], true);

    /* -- delineator posts on the right shoulder, reflectors catching the lights -- */
    for (let Z = 8; Z < 170; Z *= 1.5) {
      const x = Math.round(X2(2.7, Z)), yb = Math.round(Y2(Z)), hp = Math.max(1, Math.round((F * 1.0) / Z));
      s.vline(x, yb - hp, yb, P.trim[2]);
      if (hp > 8) s.vline(x + 1, yb - hp, yb, P.trim[1]);
      s.px(x, yb - hp, E(P.lamp[5])); if (hp > 8) { s.px(x, yb - hp + 1, E(P.lamp[4])); s.px(x + 1, yb - hp, E(P.lamp[3])); }
      if (hp > 3) s.vline(x, yb + 1, yb + Math.min(6, hp >> 1), sh(P.lamp[2], 0));     // its smear on the wet gravel
    }

    /* -- headlights on the wet road, rain falling through the beams -- */
    s.lightPoly('white', [[X2(-2.0, 3.5), Y2(3.5)], [X2(2.8, 3.5), Y2(3.5)], [X2(2.3, 45), Y2(45)], [X2(-1.6, 45), Y2(45)]], 0.95, { fade: { x0: 0, y0: 104, x1: 0, y1: Y2(45) } });
    s.clip(roadPoly, () => s.light('warm', X2(0.3, 9), Y2(9), 80, 10, 0.6));

    if (sign) derrySign(s, X2, Y2);

    for (let i = 0; i < 90; i++) {
      const x = rng.int(70, 280), y = rng.int(VY - 10, 102), d = Math.abs(x - 170) / 105 + Math.abs(y - 86) / 26;
      if (d > 1.25) continue;
      s.px(x, y, E(sk[5])); s.px(x - 1, y - 2, E(sk[4]));
    }

    /* -- the car: glass, wipers, frame -- */
    const dashY = (x) => 99 + Math.round(((x - 160) / 160) ** 2 * 6);
    const glass = [[34, 11], [96, 8], [160, 7], [222, 8], [276, 10], [312, dashY(312)], [240, dashY(240)], [160, dashY(160)], [80, dashY(80)], [4, dashY(4)]];
    const gM = polyMask(glass);
    // wipers mid-sweep: the fan each blade has swept is clear, the rest beaded with rain
    const wipers = [{ px: 66, py: 103, len: 92, ang: 1.25 }, { px: 192, py: 103, len: 96, ang: 1.27 }];
    const wiped = (x, y) => wipers.some((w) => { const dx = x - w.px, dy = w.py - y, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx); return r < w.len && a > -0.05 && a < w.ang; });
    rainOnGlass(s, gM, wiped, wipers, rng);
    for (const w of wipers) wiper(s, w);

    carFrame(s, dashY, rng);
  }

  /* drops and runnels on the windshield: each drop is a little lens (bright top-left, dark lip) */
  function rainOnGlass(s, gM, wiped, wipers, rng) {
    const ok = (x, y) => gM.has(x, y) && !wiped(x, y);
    // the swept fans keep a few smeared streaks along the arc
    for (const w of wipers) for (let a = 0.05; a < w.ang; a += 0.012) {
      const r = w.len - 1 - ((a * 97) % 3);
      const x = Math.round(w.px + Math.cos(a) * r), y = Math.round(w.py - Math.sin(a) * r);
      if (gM.has(x, y)) lift(s, x, y, 1);
    }
    // a drop refracts the sky: on dark trees it shows lighter, on the bright sky it shows as a dark lens
    const lum = (x, y) => { const c = PX.rgbOf(s.get(x, y)); return c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; };
    const drop = (x, y, size) => {
      const light = lum(x, y) > 70;
      const body = light ? -1 : 1, hi = light ? 1 : 2, rim = light ? -2 : -1;
      if (size === 1) { lift(s, x, y, light ? -1 : 1); return; }
      if (size === 2) { lift(s, x, y, hi); lift(s, x + 1, y, body); lift(s, x, y + 1, body); lift(s, x + 1, y + 1, rim); return; }
      lift(s, x + 1, y, body); lift(s, x, y + 1, body); lift(s, x + 1, y + 1, body); lift(s, x + 2, y + 1, body);
      lift(s, x, y, hi); lift(s, x + 1, y + 2, rim); lift(s, x + 2, y + 2, rim); lift(s, x, y + 2, rim); lift(s, x + 3, y + 1, rim);
    };
    // runnels: a drop that has slid, leaving a lighter trail above it
    for (let i = 0; i < 46; i++) {
      const x0 = rng.int(6, 312), y0 = rng.int(9, 70), n = rng.int(5, 16);
      if (!ok(x0, y0)) continue;
      let x = x0;
      for (let k = 0; k < n; k++) { if (k % 5 === 4) x += rng() < 0.5 ? 1 : 0; if (ok(x, y0 + k)) lift(s, x, y0 + k, 1); }
      if (ok(x, y0 + n) && ok(x + 2, y0 + n + 2)) drop(x - 1, y0 + n, 3);
    }
    // beads, thicker toward the top of the glass and in the corners the wipers never reach
    for (let i = 0; i < 470; i++) {
      const x = rng.int(4, 314), y = Math.round(8 + Math.pow(rng(), 1.35) * 94);
      if (!gM.has(x, y) || !gM.has(x + 3, y + 2)) continue;
      if (wiped(x, y)) { if (rng() < 0.03) lift(s, x, y, 1); continue; }
      const q = rng();
      drop(x, y, q < 0.3 ? 3 : q < 0.8 ? 2 : 1);
    }
  }

  function wiper(s, w) {
    const ca = Math.cos(w.ang), sa = Math.sin(w.ang);
    const at = (r, off = 0) => [w.px + ca * r - sa * off, w.py - sa * r - ca * off];
    // the water squeegeed up ahead of the blade
    const [a0, a1] = [at(10, 2.5), at(w.len, 2.5)];
    s.line(a0[0], a0[1], a1[0], a1[1], (i, x, y) => sh(s.get(x, y), 1));
    // blade: rubber edge, steel frame with its little bridges, then the arm
    const seg = (r0, r1, off, code) => { const [p, q] = [at(r0, off), at(r1, off)]; s.line(p[0], p[1], q[0], q[1], code); };
    seg(12, w.len, 0, P.ink[0]); seg(12, w.len, 1, P.ink[1]); seg(12, w.len, -1, P.ink[0]);
    for (const r of [24, 46, 68]) { const [p] = [at(r, 1.5)]; s.rect(p[0] - 1, p[1] - 1, 2, 2, P.metal[1]); }
    seg(0, w.len * 0.62, -2, P.metal[1]); seg(0, w.len * 0.62, -3, P.metal[0]);
    const [e] = [at(w.len * 0.62, -2)]; s.rect(e[0] - 1, e[1] - 1, 3, 3, P.ink[1]);
    s.rect(w.px - 3, w.py - 2, 6, 4, P.ink[1]); s.hline(w.px - 3, w.px + 2, w.py - 2, P.metal[2]);
  }

  function carFrame(s, dashY, rng) {
    const D = P.tn_dash, T = P.tn_tan;
    /* headliner and pillars */
    s.poly([[0, 0], [320, 0], [320, 10], [276, 10], [222, 8], [160, 7], [96, 8], [34, 11], [0, 12]], T[2]);
    s.rect(0, 0, 320, 2, T[1]); s.dither(0, 2, 320, 2, T[1], 0.5);
    for (let x = 0; x < 320; x += 4) s.px(x + ((x >> 2) & 1) * 2, 5, T[1]);
    s.rect(150, 1, 18, 4, T[3]); s.hline(150, 167, 1, T[4]); s.hline(150, 167, 4, T[1]);
    s.line(34, 11, 96, 8, T[3]); s.line(96, 8, 160, 7, T[3]); s.line(160, 7, 222, 8, T[3]); s.line(222, 8, 276, 10, T[3]);
    // sun visors folded up
    s.poly([[44, 2], [112, 1], [114, 7], [46, 9]], T[3]); s.line(46, 9, 114, 7, T[1]); s.line(44, 2, 112, 1, T[4]);
    s.poly([[200, 1], [268, 2], [266, 9], [198, 7]], T[3]); s.line(198, 7, 266, 9, T[1]); s.line(200, 1, 268, 2, T[4]);
    // left A-pillar (far side, thin) and right A-pillar (near, wide)
    s.poly([[16, 0], [38, 0], [34, 11], [4, dashY(4)], [-8, 110], [0, 0]], D[2]);
    s.line(34, 11, 4, dashY(4), D[4]); s.line(30, 8, 1, 98, D[3]);
    s.poly([[272, 0], [320, 0], [320, 112], [312, dashY(312)], [276, 10]], D[2]);
    s.line(276, 10, 312, dashY(312), D[4]); s.line(279, 10, 314, 98, D[3]);
    s.line(296, 0, 320, 70, D[1]);
    /* rear-view mirror, and in it the back seat: boxes, the laundry basket of shoes */
    s.rect(124, 6, 4, 6, D[1]); s.hline(124, 127, 6, D[3]);
    s.rect(100, 11, 54, 16, D[1]); s.rect(101, 10, 52, 18, D[1]);
    s.hline(102, 151, 11, D[3]); s.hline(102, 151, 26, D[0]);
    mirrorView(s, 104, 13, 46, 12);
    // pine-tree air freshener on its string
    s.line(118, 27, 119, 33, P.white[1]);
    const tr = [[119, 33], [116, 37], [118, 37], [115, 41], [118, 41], [114, 45], [124, 45], [120, 41], [123, 41], [120, 37], [122, 37]];
    s.poly(tr, P.pine[3]); s.line(119, 33, 115, 44, P.pine[4]); s.line(120, 34, 123, 44, P.pine[1]);
    s.rect(118, 45, 2, 2, P.pine[2]);
    /* dashboard */
    const top = [];
    for (let x = -2; x <= 322; x += 4) top.push([x, dashY(x)]);
    s.poly([...top, [322, 180], [-2, 180]], D[2]);
    for (let x = 0; x < 320; x++) { s.px(x, dashY(x), D[4]); s.px(x, dashY(x) + 1, D[3]); }
    // defroster slot along the glass
    for (let x = 70; x < 270; x++) { const y = dashY(x) + 3; s.px(x, y, (x & 1) ? D[0] : D[1]); }
    // the dash's front lip (rolled vinyl), then the face
    const lip = (x) => 112 + Math.round(((x - 160) / 160) ** 2 * 3);
    for (let x = 0; x < 320; x++) { s.px(x, lip(x) - 1, D[3]); s.px(x, lip(x), D[1]); s.vline(x, lip(x) + 1, 180, D[2]); }
    // instrument hood + cluster (left, behind the wheel)
    s.poly([[2, 104], [98, 100], [104, 113], [0, 116]], D[1]); s.line(2, 104, 98, 100, D[3]);
    s.rect(10, 113, 86, 20, D[0]);
    gauge(s, 32, 121, 8, 0.85); gauge(s, 70, 121, 8, 0.25);
    s.px(51, 117, E(P.neon[3])); s.px(52, 117, E(P.lamp[3])); s.px(50, 125, E(P.tv[3]));
    s.light('warm', 52, 121, 42, 12, 0.5);
    // woodgrain trim across the dash face
    for (let y = 116; y < 121; y++) for (let x = 100; x < 318; x++) {
      const g = Math.sin(x * 0.11 + Math.sin(x * 0.031 + y * 0.9) * 2.2 + y * 0.6);
      s.px(x, y, P.wood[y === 116 ? 4 : y === 120 ? 1 : g > 0.55 ? 2 : g < -0.6 ? 4 : 3]);
    }
    // radio / tape deck
    s.rect(138, 121, 48, 11, D[0]); s.rect(139, 122, 46, 9, P.metal[1]);
    s.hline(139, 184, 122, P.metal[3]);
    s.rect(141, 124, 16, 5, E(P.lamp[1])); text(s, '88.7', 142, 124, E(P.lamp[4]));
    s.rect(160, 125, 18, 2, D[0]); s.rect(162, 124, 14, 1, P.white[3]); s.hline(164, 172, 124, P.red[3]); s.px(181, 124, P.chrome[4]); s.px(181, 127, P.chrome[4]);
    s.light('warm', 150, 126, 16, 6, 0.35);
    // glove box
    s.rect(212, 123, 76, 10, D[3]); s.hline(212, 287, 123, D[4]); s.vline(287, 123, 132, D[1]);
    s.rect(244, 126, 10, 2, P.chrome[3]); s.hline(244, 253, 126, P.chrome[5]);
    // steering wheel rim (most of it under the dialogue box)
    s.ring(56, 172, 66, 64, D[0]); s.ring(56, 172, 65, 63, D[3]); s.ring(56, 172, 64, 62, D[1]); s.ring(56, 172, 63, 61, D[0]);
    // things on the dash: Mom's Nicorette, a folded road map, Gus's mic pointed at the glass
    s.rect(146, 102, 7, 3, P.white[3]); s.hline(146, 152, 102, P.white[4]); s.rect(149, 103, 3, 2, P.tv[2]);
    s.poly([[178, 101], [204, 100], [207, 105], [176, 106]], P.paper[3]); s.line(178, 101, 204, 100, P.paper[5]);
    s.line(190, 101, 189, 105, P.paper[1]); s.line(184, 103, 200, 102, P.red[3]); s.line(181, 104, 194, 101, P.tv[2]);
    s.rect(226, 103, 9, 3, P.ink[1]); s.rect(235, 102, 4, 5, P.ink[2]); s.vline(238, 102, 106, P.metal[2]); s.px(236, 103, P.metal[3]);
    s.line(226, 104, 214, 108, P.ink[1]); s.line(214, 108, 209, 114, P.ink[1]);
    s.light('cool', 170, 103, 150, 7, 0.45);
    /* a moving box riding on Gus's side, flaps open, cassettes inside */
    const B = P.tn_card;
    s.poly([[268, 114], [322, 111], [322, 180], [264, 180]], B[2]);
    s.vline(268, 114, 180, B[3]); s.line(264, 180, 268, 114, B[3]);
    s.poly([[268, 114], [322, 111], [318, 104], [274, 106]], B[0]);         // the open top: dark inside
    for (let k = 0; k < 5; k++) {                                            // cassette cases on end
      const x = 277 + k * 8, y = 104 - (k % 2), lab = [P.red[3], P.white[3], P.tv[2], P.white[3], P.mustard[3]][k];
      s.rect(x, y, 6, 6, P.ink[2]); s.hline(x, x + 5, y, P.ink[4]); s.rect(x + 1, y + 1, 4, 2, lab);
    }
    s.poly([[274, 106], [318, 104], [312, 95], [280, 97]], B[3]); s.line(280, 97, 312, 95, B[4]);   // back flap up
    s.poly([[268, 114], [274, 106], [261, 101], [258, 109]], B[1]); s.line(261, 101, 258, 109, B[2]);   // side flap out
    s.line(268, 114, 322, 111, B[1]); s.line(268, 115, 322, 112, B[3]);
    s.rect(269, 124, 53, 4, B[3]); s.hline(269, 321, 124, B[4]);              // packing tape
    text(s, 'TAPES', 278, 117, P.ink[1], { jitter: (i) => (i === 1 || i === 3 ? 1 : 0) });
    s.hline(277, 299, 123, P.ink[1]);
  }

  /* the back seat seen in the rear-view mirror (it's a mirror: everything is flipped) */
  function mirrorView(s, x, y, w, h) {
    const sk = P.tn_sky_rd, B = P.tn_card;
    s.vgrad(x, y, w, h, [E(sk[3]), E(sk[2])], 1);
    s.rect(x, y + h - 4, w, 4, P.tn_tan[2]); s.hline(x, x + w - 1, y + h - 4, P.tn_tan[3]);
    // boxes
    s.rect(x + 2, y + 3, 12, h - 3, B[3]); s.hline(x + 2, x + 13, y + 3, B[4]); s.vline(x + 13, y + 3, y + h - 1, B[1]); s.vline(x + 7, y + 3, y + 5, B[5]);
    s.rect(x + 31, y + 5, 13, h - 5, B[2]); s.hline(x + 31, x + 43, y + 5, B[4]); s.vline(x + 37, y + 5, y + 7, B[4]);
    s.rect(x + 33, y + 1, 9, 4, B[3]); s.hline(x + 33, x + 41, y + 1, B[5]);
    // laundry basket, shoes sticking up
    s.rect(x + 16, y + 6, 14, h - 6, P.white[2]); s.hline(x + 16, x + 29, y + 6, P.white[4]);
    for (let k = 0; k < 4; k++) s.px(x + 18 + k * 3, y + 9, P.white[1]);
    s.rect(x + 18, y + 4, 4, 2, P.red[3]); s.px(x + 18, y + 4, P.red[4]);
    s.rect(x + 23, y + 3, 4, 3, P.wood[2]); s.px(x + 23, y + 3, P.wood[4]);
    // a few drops on the back window
    s.px(x + 20, y + 1, E(sk[5])); s.px(x + 27, y + 2, E(sk[4])); s.px(x + 5, y + 1, E(sk[4]));
  }

  function gauge(s, cx, cy, r, val) {
    s.circle(cx, cy, r, P.ink[1]); s.ring(cx, cy, r, r, P.metal[2]);
    for (let k = 0; k <= 6; k++) { const a = Math.PI * (0.8 + 1.4 * (k / 6)); s.px(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2), E(P.lamp[3])); }
    const a = Math.PI * (0.8 + 1.4 * val);
    s.line(cx, cy, cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2), E(P.neon[4]));
    s.px(cx, cy, P.metal[3]);
  }

  /* the DERRY sign at the roadside, caught in the headlights:
   * weathered wood, carved letters painted white, and the graffiti from ch1 */
  function derrySign(s, X2, Y2) {
    const W = P.tn_signwood;
    const x0 = 219, y0 = 25, w = 72, h = 49;
    const ground = Math.round(Y2(10.5));
    // posts, with their reflections smeared on the wet gravel
    for (const px of [x0 + 10, x0 + w - 15]) {
      s.rect(px, y0 + h, 5, ground - y0 - h, W[2]); s.vline(px, y0 + h, ground - 1, W[4]); s.vline(px + 4, y0 + h, ground - 1, W[1]);
      s.rect(px, ground, 5, 3, W[1]);
    }
    // board: planks, a routed border, a lip of shadow under the top rail
    s.rect(x0, y0, w, h, W[4]);
    for (let y = y0 + 1; y < y0 + h - 1; y += 6) { s.hline(x0 + 1, x0 + w - 2, y, W[3]); }
    s.hline(x0, x0 + w - 1, y0, W[5]); s.vline(x0, y0, y0 + h - 1, W[5]);
    s.hline(x0, x0 + w - 1, y0 + h - 1, W[1]); s.vline(x0 + w - 1, y0, y0 + h - 1, W[1]);
    s.rect(x0 + 2, y0 + 2, w - 4, 1, W[2]); s.rect(x0 + 2, y0 + 2, 1, h - 4, W[2]);
    s.rect(x0 + 2, y0 + h - 3, w - 4, 1, W[5]); s.rect(x0 + w - 3, y0 + 2, 1, h - 4, W[5]);
    // weathering: grain streaks
    const r2 = PX.rng('tn_signgrain');
    for (let i = 0; i < 26; i++) { const x = r2.int(x0 + 4, x0 + w - 10), y = r2.int(y0 + 4, y0 + h - 5); s.hline(x, x + r2.int(2, 7), y, W[r2() < 0.5 ? 3 : 5]); }
    // carved letters, painted white (the groove's shadow sits up and to the left)
    text(s, 'DERRY', x0 + w / 2 + 1, y0 + 4, P.white[4], { font: F7, scale: 2, sp: 1, align: 'center', shadow: W[1], sx: -1, sy: -1 });
    text(s, 'WELCOME HOME', x0 + w / 2 + 1, y0 + 21, P.white[3], { align: 'center', shadow: W[1], sx: -1, sy: 0 });
    // spray paint: LEAVE WHILE YOU CAN in black, scribbled out; YOU CAN'T in red underneath
    const jit = (i) => ((i * 5) % 4 === 1 ? 1 : 0);
    text(s, 'LEAVE WHILE', x0 + 8, y0 + 29, P.ink[1], { jitter: jit });
    text(s, 'YOU CAN', x0 + 12, y0 + 35, P.ink[1], { jitter: (i) => (i > 3 ? 1 : 0) });
    s.line(x0 + 6, y0 + 32, x0 + 52, y0 + 30, P.red[3]);           // crossed out in red by whoever wrote YOU CAN'T
    s.line(x0 + 10, y0 + 38, x0 + 42, y0 + 36, P.red[3]);
    s.vline(x0 + 17, y0 + 34, y0 + 35, P.ink[1]); s.vline(x0 + 45, y0 + 35, y0 + 37, P.ink[1]);
    text(s, "YOU CAN'T", x0 + 30, y0 + 41, P.red[4], { jitter: (i) => (i === 2 || i === 6 ? 1 : 0), shadow: P.red[2], sx: 0, sy: 1 });
    s.vline(x0 + 40, y0 + 47, y0 + 48, P.red[3]); s.vline(x0 + 58, y0 + 47, y0 + 49, P.red[3]);
    // the headlights find it from the lower left
    s.light('white', x0 + w * 0.4, y0 + h * 0.65, w * 0.85, h * 0.95, 1.0);
    s.light('warm', x0 + w * 0.4, ground, w * 0.7, 10, 0.6);
  }

  /* ================================================================== */
  /* DOWNTOWN — Center Street, looking across at the north side          */
  /*   bank · Dot's · Low Tide · Shop 'n Save · the Aladdin · corner      */
  /* ================================================================== */
  const GY = 124;                                   // the sidewalk line
  PX.bg('downtown', {
    times: ['day', 'dusk', 'night', 'festival'],
    draw(s, o) {
      const t = o.time;
      const K = {
        t, rng: PX.rng('tn_downtown'), day: t === 'day', dusk: t === 'dusk', night: t === 'night', fest: t === 'festival',
        glass: t === 'day' ? 'day' : t === 'night' ? 'night' : 'dusk'
      };
      K.lit = !K.day;                                       // street lamps, marquee, signs
      K.open = K.dusk || K.fest;                            // shops open and lit
      dtSky(s, K); dtHills(s, K); dtBack(s, K); dtCorner(s, K);
      dtBank(s, K); dtDots(s, K); dtLowTide(s, K); dtShop(s, K); dtAladdin(s, K);
      dtStreet(s, K);
      if (K.fest || K.night) dtBooths(s, K);
      if (K.fest) dtBandstand(s, K);
      dtLamps(s, K);
      dtStrings(s, K);
      dtPeople(s, K);
    }
  });

  function dtSky(s, K) {
    const rng = PX.rng('tn_dtsky');
    if (K.day) {
      s.vgrad(0, 0, 320, 100, [E(P.sky_day[1]), E(P.sky_day[2]), E(P.sky_day[3]), E(P.sky_day[4])], 4);
      s.cloud(150, 18, 44, 11, { emit: true, rng }); s.cloud(304, 34, 30, 8, { emit: true, rng }); s.cloud(196, 8, 24, 6, { emit: true, rng });
    } else if (K.dusk) {
      s.vgrad(0, 0, 320, 100, [E(P.sky_dusk[1]), E(P.sky_dusk[2]), E(P.sky_dusk[3]), E(P.sky_dusk[4]), E(P.sky_dusk[5])], 4);
      const cd = P.tn_cl_dusk;
      s.cloud(148, 22, 46, 8, { emit: true, ramp: cd, top: 4, rng }); s.cloud(300, 40, 34, 6, { emit: true, ramp: cd, top: 3, rng }); s.cloud(200, 10, 26, 5, { emit: true, ramp: cd, top: 4, rng });
    } else if (K.night) {
      s.vgrad(0, 0, 320, 100, [E(P.sky_night[0]), E(P.sky_night[1]), E(P.sky_night[2]), E(P.sky_night[3])], 4);
      s.stars(0, 0, 320, 60, 60, { rng });
      s.circle(168, 18, 5, E(P.cloud[4])); s.circle(170, 16, 4.5, E(P.sky_night[1]));
      s.light('cool', 168, 18, 16, 16, 0.25);
      s.cloud(300, 38, 34, 6, { emit: true, ramp: P.tn_cl_night, top: 4, rng });
    } else {
      const fs = P.tn_sky_fest;
      s.vgrad(0, 0, 320, 100, [E(fs[0]), E(fs[1]), E(fs[2]), E(fs[3]), E(fs[4]), E(fs[5])], 4);
      s.stars(0, 0, 320, 18, 14, { rng });
      const cd = P.tn_cl_dusk;
      s.cloud(150, 26, 50, 7, { emit: true, ramp: cd, top: 3, rng }); s.cloud(304, 44, 30, 5, { emit: true, ramp: cd, top: 3, rng });
    }
  }

  function dtHills(s, K) {
    const ridge = (base, amp, seed, ramp, shade) => {
      const r2 = PX.rng(seed), pts = [[0, 130]];
      const yAt = (x) => base + Math.sin(x * 0.019 + seed.length) * amp + Math.sin(x * 0.071) * amp * 0.35;
      for (let x = 0; x <= 320; x += 6) pts.push([x, yAt(x)]);
      pts.push([320, 130]);
      s.poly(pts, ramp[shade]);
      for (let k = 1; k < pts.length - 2; k++) s.line(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], ramp[shade + 1]);
      for (let x = 2; x < 320; x += r2.int(4, 8)) if (r2() < 0.7) fir(s, x, Math.round(yAt(x)) + 2, r2.int(4, 8), ramp, { rng: r2, shade: shade - 1, lit: 1, w: 0.36 });
      return yAt;
    };
    const y1 = ridge(46, 6, 'tn_hA', P.tn_far1, 2);
    ridge(58, 4, 'tn_hB', P.tn_far2, 2);
    // the Standpipe: a broken stone ring on the high ground past the end of downtown
    const sx = 302, sy = Math.round(y1(302)) - 1;
    s.rect(sx - 4, sy - 6, 9, 7, P.tn_far1[1]); s.rect(sx - 4, sy - 9, 3, 3, P.tn_far1[1]); s.rect(sx + 2, sy - 8, 2, 2, P.tn_far1[1]);
    s.px(sx - 2, sy - 10, P.tn_far1[1]); s.hline(sx - 4, sx + 4, sy - 6, P.tn_far1[2]);
  }

  /* rooftops of the next street over, and the steeple of St. Mary's */
  function dtBack(s, K) {
    const B = P.tn_back, rng = PX.rng('tn_dtback');
    const blocks = [[96, 40, 30], [124, 30, 26], [150, 36, 34], [182, 28, 30], [206, 34, 24], [282, 58, 40]];
    for (const [x, y, w] of blocks) {
      s.rect(x, y, w, 100 - y, B[2]); s.hline(x, x + w - 1, y, B[3]); s.vline(x + w - 1, y, 99, B[1]);
      for (let wy = y + 5; wy < 92; wy += 8) for (let wx = x + 3; wx < x + w - 4; wx += 6) {
        const on = (K.night || K.fest || K.dusk) && rng() < (K.night ? 0.22 : 0.3);
        s.rect(wx, wy, 2, 3, on ? E(P.lamp[3]) : B[1]);
      }
      if (rng() < 0.7) { const cx = x + rng.int(3, w - 6); s.rect(cx, y - 4, 3, 4, B[1]); s.hline(cx - 1, cx + 3, y - 4, B[3]); }
    }
    // the steeple, in the gap between the first two heads
    const T = B;
    s.rect(119, 30, 11, 70, T[3]); s.vline(119, 30, 99, T[4]); s.vline(129, 30, 99, T[2]);
    s.rect(120, 22, 9, 8, T[3]); s.rect(122, 24, 5, 5, T[1]);                       // belfry
    s.poly([[118, 22], [124.5, 3], [131, 22]], T[3]); s.line(124, 4, 118, 22, T[4]); s.line(125, 4, 131, 22, T[2]);
    s.vline(124, 0, 3, T[2]); s.hline(123, 125, 1, T[2]);
    s.hline(117, 131, 22, T[4]); s.hline(117, 131, 30, T[4]);
    s.rect(122, 36, 5, 9, K.night || K.fest ? E(P.lamp[2]) : T[1]);                  // a tall church window
    s.px(124, 36, K.night || K.fest ? E(P.lamp[3]) : T[2]);
  }

  /* the corner: the cross street opening onto the Town Hall square */
  function dtCorner(s, K) {
    const W = P.trim;
    // Town Hall: white clapboard, a cupola with a clock
    s.clapboard(286, 78, 40, 40, W, { rng: K.rng, board: 2, base: 3 });
    s.poly([[284, 79], [306, 66], [328, 79]], P.roof[2]); s.line(284, 79, 306, 66, P.roof[4]);
    s.rect(300, 54, 12, 13, W[3]); s.vline(300, 54, 66, W[4]); s.vline(311, 54, 66, W[1]);
    s.poly([[298, 55], [306, 44], [314, 55]], P.roof[3]); s.vline(306, 40, 44, P.metal[2]);
    s.circle(306, 60, 3, K.lit ? E(P.paper[4]) : P.paper[5]); s.px(306, 59, P.ink[1]); s.px(307, 60, P.ink[1]);
    for (const wx of [290, 304, 316]) s.window(wx, 86, 6, 10, { frame: W, glass: K.glass, lit: K.night && wx === 290, rng: K.rng, mull: 'h', light: 0.4 });
    s.rect(300, 102, 8, 16, P.navy[2]); s.hline(300, 307, 102, P.navy[3]);
    s.shift([284, 78, 42, 3], -1);
    // trees in the square
    s.rect(293, 96, 3, 22, P.bark[2]);
    s.foliage(294, 92, 12, 10, [P.leaf_orange, P.leaf_gold, P.leaf_red], { rng: PX.rng('tn_sqtree'), clusters: 16, blob: 3 });
    s.rect(316, 98, 3, 20, P.bark[2]);
    s.foliage(318, 94, 10, 9, [P.leaf_red, P.leaf_orange], { rng: PX.rng('tn_sqtree2'), clusters: 12, blob: 3 });
    // the square's lawn and the cross street
    s.rect(284, 116, 36, 3, P.grass_fall[3]); s.hline(284, 319, 116, P.grass_fall[4]);
    s.rect(284, 119, 36, 2, P.concrete[3]);
    if (K.night) {
      // the Lantern Society tent behind Town Hall, glowing like a paper lantern, shadows moving on it
      const tx = 314;
      s.poly([[tx - 9, 119], [tx - 7, 108], [tx, 101], [tx + 7, 108], [tx + 9, 119]], E(P.lamp[3]));
      s.poly([[tx - 5, 119], [tx - 4, 110], [tx, 105], [tx + 4, 110], [tx + 5, 119]], E(P.lamp[4]));
      s.line(tx - 9, 119, tx, 101, E(P.lamp[2])); s.vline(tx, 99, 101, P.ink[2]);
      s.rect(tx - 4, 111, 2, 8, E(P.lamp[1])); s.circle(tx - 3, 109, 1.2, E(P.lamp[1]));       // a figure's shadow on the canvas
      s.rect(tx + 2, 112, 2, 7, E(P.lamp[2])); s.px(tx + 3, 111, E(P.lamp[2]));
      s.light('warm', tx, 112, 22, 16, 0.9);
    }
  }

  /* -- facade helpers -- */
  function upWin(s, K, x, y, w, h, o = {}) {
    const L = o.lintel || P.stone_warm;
    s.rect(x - 2, y - 3, w + 4, 2, L[3]); s.hline(x - 2, x + w + 1, y - 3, L[4]); s.px(x + (w >> 1), y - 3, L[5]);
    s.window(x, y, w, h, { frame: o.frame || P.trim, glass: K.glass, lit: !!o.lit, curtain: o.curtain, mull: o.mull || 'cross', rng: K.rng, light: o.lit ? (o.light || 0.6) : 0 });
    s.shift([x - 2, y + h + 2, w + 4, 1], -1);
  }
  function cornice(s, x0, x1, y, ramp) {
    s.rect(x0, y - 3, x1 - x0, 4, ramp[3]); s.hline(x0, x1 - 1, y - 3, ramp[5]); s.hline(x0, x1 - 1, y, ramp[1]);
    for (let x = x0 + 1; x < x1 - 1; x += 3) s.px(x, y - 1, ramp[2]);
    for (let x = x0 + 2; x < x1 - 2; x += 9) { s.rect(x, y + 1, 2, 3, ramp[2]); s.px(x, y + 1, ramp[4]); }
    s.shift([x0, y + 1, x1 - x0, 2], -1, { dither: 0.5 });
  }
  /* a striped awning with a scalloped valance; a/b = ramps of the two stripes */
  function awning(s, x0, x1, y, h, a, b, o = {}) {
    const sw = o.sw || 4;
    for (let x = x0; x < x1; x++) {
      const r = Math.floor((x - x0) / sw) % 2 ? b : a;
      for (let yy = 0; yy < h; yy++) s.px(x + Math.round(yy * 0.0), y + yy, r[yy < 1 ? 4 : yy < h - 2 ? 3 : 2]);
      const sc = (x - x0) % sw, dip = sc === 0 || sc === sw - 1 ? 1 : 2;   // scallops
      for (let k = 0; k < dip; k++) s.px(x, y + h + k, r[2]);
    }
    s.hline(x0, x1 - 1, y, a[5]);
    s.shift([x0, y + h + 2, x1 - x0, 3], -1);                 // its shadow on the window below
  }
  function clock(s, cx, cy, r, hh, mm, o = {}) {
    s.circle(cx, cy, r + 1, o.rim || P.camel[2]);
    s.ring(cx, cy, r + 1, r + 1, o.rim2 || P.camel[4]);
    s.circle(cx, cy, r, o.face || P.paper[5]);
    for (let k = 0; k < 12; k += 3) { const a = (k / 12) * Math.PI * 2; s.px(Math.round(cx + Math.sin(a) * (r - 1) - 0.5), Math.round(cy - Math.cos(a) * (r - 1) - 0.5), o.tick || P.ink[3]); }
    const ha = (((hh % 12) + mm / 60) / 12) * Math.PI * 2, ma = (mm / 60) * Math.PI * 2;
    const c0x = cx - 0.5, c0y = cy - 0.5;
    s.line(c0x, c0y, c0x + Math.sin(ma) * (r - 0.6), c0y - Math.cos(ma) * (r - 0.6), o.hand || P.ink[1]);
    s.line(c0x, c0y, c0x + Math.sin(ha) * r * 0.55, c0y - Math.cos(ha) * r * 0.55, o.hand || P.ink[1]);
  }
  /* the time on every clock in town */
  const dtTime = (K) => (K.day ? [3, 12] : K.dusk ? [6, 4] : K.fest ? [6, 35] : [8, 20]);

  function dtBank(s, K) {
    const G = P.stone_warm, x1 = 56, top = 26;
    s.bricks(-2, top, x1 + 2, GY - top, G, { rng: PX.rng('tn_bank'), bw: 12, bh: 6, base: 4, mortar: G[3] });
    s.shift([x1 - 4, top, 4, GY - top], -1);
    // pediment with the clock
    s.poly([[-3, top + 1], [27, 8], [x1 + 3, top + 1]], G[4]);
    s.poly([[3, top - 1], [27, 12], [x1 - 3, top - 1]], G[3]);
    s.line(-3, top, 27, 8, G[5]); s.line(27, 8, x1 + 3, top, G[2]); s.line(-3, top + 1, 27, 9, G[4]);
    const [hh, mm] = dtTime(K);
    clock(s, 27, 19, 5, hh, mm, { face: K.lit ? E(P.paper[4]) : P.paper[5] });
    if (K.lit) s.light('warm', 27, 19, 12, 10, 0.5);
    // entablature: the name cut into the frieze
    s.rect(-2, top, x1 + 3, 15, G[3]); s.hline(-2, x1, top, G[5]); s.hline(-2, x1, top + 1, G[4]); s.hline(-2, x1, top + 14, G[1]); s.hline(-2, x1, top + 13, G[2]);
    text(s, 'KENDUSKEAG', 27, top + 2, G[1], { align: 'center' });
    text(s, 'SAVINGS', 27, top + 8, G[1], { align: 'center' });
    // fluted columns
    for (const cx of [5, 49]) {
      s.rect(cx - 4, top + 15, 9, 3, G[4]); s.hline(cx - 4, cx + 4, top + 15, G[5]); s.hline(cx - 4, cx + 4, top + 17, G[2]);
      s.rect(cx - 3, top + 18, 7, 94 - top, G[4]);
      s.vline(cx - 3, top + 18, 111, G[5]); s.vline(cx + 3, top + 18, 111, G[2]); s.vline(cx + 2, top + 18, 111, G[3]);
      s.vline(cx - 1, top + 18, 111, G[3]); s.vline(cx + 1, top + 18, 111, G[3]);
      s.rect(cx - 4, 112, 9, 4, G[4]); s.hline(cx - 4, cx + 4, 112, G[5]); s.hline(cx - 4, cx + 4, 115, G[2]);
    }
    // tall arched window with a bronze grille
    const wx = 19, wy = 46, ww = 17, wh = 20;
    s.rect(wx - 2, wy - 2, ww + 4, wh + 4, G[2]);
    s.ellipse(wx + ww / 2, wy + 2, ww / 2 + 2, 6, G[2]);
    s.clip([wx, wy - 6, ww, wh + 6], () => {
      s.ellipse(wx + ww / 2, wy + 2, ww / 2, 6, (x, y) => (K.night ? P.sky_night[1] : K.glass === 'day' ? P.sky_day[2] : P.sky_dusk[2]));
      s.vgrad(wx, wy + 2, ww, wh - 2, K.night ? [P.sky_night[2], P.sky_night[1]] : K.glass === 'day' ? [P.sky_day[3], P.sky_day[1]] : [P.sky_dusk[3], P.sky_dusk[1]], 1);
    });
    for (let x = wx + 2; x < wx + ww; x += 4) s.vline(x, wy - 4, wy + wh - 1, P.camel[1]);
    for (let y = wy + 3; y < wy + wh; y += 5) s.hline(wx, wx + ww - 1, y, P.camel[1]);
    s.rect(wx - 3, wy + wh, ww + 6, 2, G[5]); s.hline(wx - 3, wx + ww + 2, wy + wh + 1, G[2]);
    // CANAL DAYS banner, maroon and gold, between the columns
    const by = 70;
    s.rect(10, by, 35, 9, P.maroon[3]); s.hline(10, 44, by, P.maroon[4]); s.hline(10, 44, by + 8, P.maroon[1]);
    s.hline(10, 44, by + 1, P.mustard[4]); s.hline(10, 44, by + 7, P.mustard[3]);
    for (let x = 11; x < 44; x += 4) { s.px(x, by + 9, P.mustard[3]); s.px(x + 1, by + 9, P.maroon[2]); }
    text(s, 'CANAL DAYS', 27, by + 2, P.mustard[5], { align: 'center', sp: 1, shadow: P.maroon[1], sx: 0, sy: 1 });
    s.line(9, by - 1, 5, by - 6, P.ink[2]); s.line(45, by - 1, 49, by - 6, P.ink[2]);
    // bronze doors under a fanlight
    const dx = 17, dy = 86;
    s.rect(dx - 2, dy - 4, 25, 30, G[2]);
    s.ellipse(dx + 10.5, dy, 12, 6, G[2]);
    s.ellipse(dx + 10.5, dy, 10, 5, K.open ? E(P.lamp[3]) : P.ink[2]);
    s.rect(dx, dy, 21, 26, P.camel[2]);
    s.vline(dx + 10, dy, dy + 25, P.camel[0]);
    for (const px of [dx + 2, dx + 12]) { s.rect(px, dy + 3, 7, 9, P.camel[3]); s.rect(px, dy + 14, 7, 9, P.camel[3]); s.hline(px, px + 6, dy + 3, P.camel[4]); s.hline(px, px + 6, dy + 14, P.camel[4]); }
    s.px(dx + 8, dy + 13, P.mustard[5]); s.px(dx + 12, dy + 13, P.mustard[5]);
    s.shift([dx, dy, 21, 3], -1);
    // plinth and the steps Cal sits on
    s.rect(-2, 116, x1 + 2, 8, G[3]); s.hline(-2, x1 - 1, 116, G[5]);
    for (let k = 0; k < 3; k++) { const w = 30 + k * 6, x = 27 - w / 2, y = 116 + k * 3; s.rect(x, y, w, 3, G[k === 1 ? 3 : 4]); s.hline(x, x + w - 1, y, G[5]); }
    // brass plaque
    s.rect(43, 94, 4, 5, P.mustard[3]); s.hline(43, 46, 94, P.mustard[5]);
  }

  function dtDots(s, K) {
    const x0 = 56, x1 = 110, top = 20;
    s.bricks(x0, top, x1 - x0, GY - top, P.brick, { rng: PX.rng('tn_dots'), bw: 6, bh: 3 });
    s.shift([x1 - 3, top, 3, GY - top], -1);
    cornice(s, x0 - 1, x1 + 1, top, P.wood_dark);
    s.rect(x0 - 1, top - 6, x1 - x0 + 2, 3, P.brick[2]); s.hline(x0 - 1, x1, top - 6, P.brick[4]);
    const [hh] = dtTime(K);
    upWin(s, K, 64, 32, 11, 15, { curtain: P.cream });
    upWin(s, K, 91, 32, 11, 15, { lit: K.night || K.fest, curtain: P.wall_rose });
    upWin(s, K, 64, 57, 11, 15, { lit: K.dusk || K.fest });
    upWin(s, K, 91, 57, 11, 15, { curtain: P.cream });
    // storefront: cream cast-iron frame, teal sign, teal-and-white awning
    const T = P.teal, C = P.cream;
    s.rect(x0, 80, x1 - x0, GY - 80, C[3]);
    s.rect(x0, 80, x1 - x0, 9, T[2]); s.hline(x0, x1 - 1, 80, T[4]); s.hline(x0, x1 - 1, 88, T[0]);
    text(s, "DOT'S DINER", 83, 82, C[5], { align: 'center', shadow: T[0], sx: 0, sy: 1 });
    awning(s, x0 + 1, x1 - 1, 90, 6, T, P.white_cloth, { sw: 4 });
    // window
    const gx = 59, gy = 99, gw = 33, gh = 20;
    s.rect(gx - 1, gy - 1, gw + 2, gh + 2, C[1]);
    if (K.open) {
      s.vgrad(gx, gy, gw, gh, [E(P.lamp[4]), E(P.lamp[3])], 2);
      // inside: the counter, stools, a customer's back
      s.rect(gx, gy + 12, gw, 2, E(P.lamp[1])); s.rect(gx, gy + 14, gw, gh - 14, E(P.lamp[2]));
      for (let k = 0; k < 4; k++) { s.rect(gx + 3 + k * 8, gy + 15, 4, 1, E(P.neon[1])); s.vline(gx + 4 + k * 8, gy + 16, gy + 19, E(P.lamp[1])); }
      s.circle(gx + 21, gy + 7, 2, E(P.lamp[1])); s.rect(gx + 19, gy + 9, 5, 4, E(P.lamp[1]));
      s.light('warm', gx + gw / 2, gy + gh, 40, 16, 0.8);
    } else {
      s.vgrad(gx, gy, gw, gh, K.glass === 'day' ? [P.ink[3], P.ink[2]] : [P.ink[2], P.ink[1]], 2);
      // chairs up on the tables (it's Quiet Night day, or after hours)
      for (let k = 0; k < 3; k++) {
        const tx = gx + 3 + k * 11;
        s.rect(tx, gy + 13, 8, 1, P.ink[4]); s.vline(tx + 4, gy + 14, gy + 19, P.ink[4]);
        s.rect(tx + 1, gy + 9, 3, 1, P.ink[4]); s.vline(tx + 1, gy + 5, gy + 12, P.ink[4]); s.vline(tx + 3, gy + 10, gy + 12, P.ink[4]);
        s.rect(tx + 5, gy + 9, 3, 1, P.ink[4]); s.vline(tx + 7, gy + 5, gy + 12, P.ink[4]); s.vline(tx + 5, gy + 10, gy + 12, P.ink[4]);
      }
      if (K.glass === 'day') for (let k = 0; k < gh; k++) { s.px(gx + 6 + k, gy + k, P.ink[4]); s.px(gx + 7 + k, gy + k, P.ink[4]); }
    }
    // the neon OPEN sign and the lettering on the glass
    text(s, 'OPEN', gx + gw - 18, gy + 2, K.open ? E(P.neon[4]) : P.neon[1], { shadow: K.open ? E(P.neon[2]) : 0, sx: 0, sy: 1 });
    if (K.open) s.light('red', gx + gw - 11, gy + 4, 12, 7, 0.4);
    s.rect(gx, gy + gh, gw, 3, T[2]); s.hline(gx, gx + gw - 1, gy + gh, T[4]);
    // door with a glass pane
    s.rect(95, 96, 12, 28, C[1]); s.rect(96, 97, 10, 27, T[2]); s.vline(96, 97, 123, T[3]);
    s.rect(98, 99, 6, 12, K.open ? E(P.lamp[3]) : P.ink[2]);
    s.px(104, 113, P.chrome[4]);
    if (!K.open) { s.rect(99, 101, 4, 3, P.paper[4]); s.hline(99, 102, 102, P.red[3]); }
    s.rect(x0, GY - 2, x1 - x0, 2, C[2]);
  }

  function dtLowTide(s, K) {
    const x0 = 110, x1 = 150, top = 48, B = P.house_blue;
    s.bricks(x0, top, x1 - x0, GY - top, B, { rng: PX.rng('tn_lowtide'), bw: 5, bh: 3, base: 2, mortar: B[1] });
    s.shift([x1 - 3, top, 3, GY - top], -1);
    cornice(s, x0 - 1, x1 + 1, top, B);
    // upstairs: a big window with The Static Hours' flag hung inside
    const wx = 117, wy = 57, ww = 26, wh = 15;
    s.window(wx, wy, ww, wh, { frame: P.trim, glass: K.glass, mull: 'v', rng: K.rng, light: 0 });
    s.rect(wx + 2, wy + 1, 10, wh - 2, P.black_cloth[2]); s.circle(wx + 7, wy + 8, 3, P.leaf_orange[4]);
    s.hline(wx + 3, wx + 11, wy + 11, P.leaf_orange[3]);
    if (K.night || K.fest) { s.rect(wx + 14, wy + 1, 11, wh - 2, E(P.lamp[3])); s.light('warm', wx + 19, wy + 8, 16, 12, 0.5); }
    // the round record sign
    s.circle(124, 51, 0.1, 0);
    // sign board
    s.rect(x0 + 1, 79, x1 - x0 - 2, 10, P.ink[1]); s.hline(x0 + 1, x1 - 2, 79, P.ink[3]);
    text(s, 'LOW TIDE', 130, 81, P.leaf_gold[5], { align: 'center' });
    for (let x = x0 + 4; x < x1 - 4; x += 2) s.px(x, 87, P.tv[3]);                 // a little painted wave
    // shop window full of posters
    const gx = 112, gy = 92, gw = 22, gh = 28;
    s.rect(gx - 1, gy - 1, gw + 2, gh + 2, P.ink[2]);
    s.rect(gx, gy, gw, gh, K.open ? E(P.lamp[2]) : P.ink[2]);
    const posters = [[gx + 1, gy + 1, 8, 11, P.black_cloth[2], 'sun'], [gx + 10, gy + 1, 11, 7, P.pink[3]], [gx + 10, gy + 9, 5, 8, P.yellow[4]], [gx + 16, gy + 9, 5, 9, P.teal[4]],
      [gx + 1, gy + 13, 8, 7, P.red[3]], [gx + 2, gy + 21, 6, 6, P.white[3]], [gx + 10, gy + 19, 11, 8, P.navy[3]]];
    for (const [px, py, pw, ph, c, kind] of posters) {
      s.rect(px, py, pw, ph, c); s.hline(px, px + pw - 1, py, sh(c, 1)); s.vline(px + pw - 1, py, py + ph - 1, sh(c, -1));
      if (kind === 'sun') { s.circle(px + 4, py + 5, 2.4, P.leaf_orange[4]); s.hline(px + 1, px + 6, py + 9, P.leaf_orange[3]); }
    }
    s.rect(gx + 12, gy + 21, 7, 1, P.white[4]); s.rect(gx + 12, gy + 23, 5, 1, P.white[3]);
    if (K.open) s.light('warm', gx + gw / 2, gy + gh, 24, 14, 0.6);
    // door, papered with flyers
    s.rect(136, 92, 13, 32, P.ink[2]); s.rect(137, 93, 11, 31, P.green_jkt[2]); s.vline(137, 93, 123, P.green_jkt[3]);
    s.rect(139, 96, 7, 9, P.paper[4]); s.rect(140, 107, 5, 6, P.pink[4]); s.px(146, 112, P.chrome[4]);
    s.rect(x0, GY - 2, x1 - x0, 2, P.ink[2]);
    // round record sign over the door
    const rx = 142, ry = 70;
    s.line(rx, 63, rx, 65, P.ink[2]);
    s.circle(rx, ry, 5.5, P.ink[1]); s.ring(rx, ry, 4, 4, P.ink[3]); s.circle(rx, ry, 2, P.leaf_orange[4]); s.px(rx - 0.5, ry - 0.5, P.ink[1]);
    s.px(rx - 3, ry - 4, P.ink[4]);
  }

  function dtShop(s, K) {
    const x0 = 150, x1 = 208, top = 40, B = P.tn_brick_tan;
    s.bricks(x0, top, x1 - x0, GY - top, B, { rng: PX.rng('tn_shop'), bw: 6, bh: 3 });
    s.shift([x1 - 3, top, 3, GY - top], -1);
    // stepped parapet
    s.rect(x0, top - 3, x1 - x0, 3, B[3]); s.rect(165, top - 7, 28, 4, B[3]); s.hline(165, 192, top - 7, B[5]); s.hline(x0, x1 - 1, top - 3, B[5]);
    s.hline(x0, x1 - 1, top + 1, B[1]);
    for (const x of [157, 173, 189]) upWin(s, K, x, 52, 11, 15, { lit: (K.night && x === 173) || (K.dusk && x === 189), curtain: x === 157 ? P.wall_green : null });
    // sign band
    s.rect(x0, 79, x1 - x0, 10, P.white_cloth[4]); s.hline(x0, x1 - 1, 79, P.white_cloth[5]); s.hline(x0, x1 - 1, 88, P.white_cloth[1]);
    s.hline(x0, x1 - 1, 80, P.red[3]); s.hline(x0, x1 - 1, 87, P.red[3]);
    text(s, "SHOP 'N SAVE", 179, 82, P.red[3], { align: 'center' });
    // plate windows with sale posters, a door between
    const win = (gx, gw) => {
      s.rect(gx - 1, 91, gw + 2, 30, P.metal[3]);
      if (K.open) { s.vgrad(gx, 92, gw, 28, [E(P.white[4]), E(P.white[3])], 2); s.light('white', gx + gw / 2, 106, gw, 18, 0.45); }
      else { s.vgrad(gx, 92, gw, 28, K.glass === 'day' ? [P.sky_day[2], P.ink[3]] : [P.ink[2], P.ink[1]], 2); }
      // shelves inside
      for (let y = 100; y < 120; y += 6) s.hline(gx + 1, gx + gw - 2, y, K.open ? E(P.white[1]) : P.ink[1]);
    };
    win(152, 22); win(187, 19);
    s.rect(154, 93, 10, 7, P.paper[5]); text(s, 'SALE', 154, 94, P.red[3], {});
    s.rect(166, 95, 8, 8, P.yellow[4]); text(s, '99', 167, 96, P.red[3], {});
    s.rect(189, 93, 15, 6, P.paper[5]); text(s, 'CIDER', 189, 94, P.red[4], { sp: 0 });
    s.rect(176, 91, 10, 33, P.metal[2]); s.rect(177, 92, 8, 32, K.open ? E(P.white[3]) : P.ink[2]); s.vline(181, 92, 123, P.metal[3]);
    // produce out front: pumpkins and a rack of mums
    for (let k = 0; k < 4; k++) { const px = 155 + k * 5; s.ellipse(px, 121, 2.6, 2, (x, y, nx) => P.leaf_orange[nx < -0.3 ? 4 : nx > 0.4 ? 2 : 3]); s.px(px, 118, P.pine[3]); }
    s.rect(188, 117, 18, 6, P.wood[2]); s.hline(188, 205, 117, P.wood[4]);
    for (let k = 0; k < 4; k++) s.foliage(190 + k * 5, 115, 2.6, 2.2, [k % 2 ? P.leaf_gold : P.leaf_red], { rng: PX.rng('mum' + k), clusters: 3, blob: 1.5 });
  }

  function dtAladdin(s, K) {
    const x0 = 208, x1 = 284, top = 14, T = P.tn_terra;
    // cream terracotta in courses
    s.rect(x0, top, x1 - x0, GY - top, T[4]);
    for (let y = top + 4; y < GY; y += 6) s.hline(x0, x1 - 1, y, T[3]);
    for (let y = top + 4, r = 0; y < 92; y += 6, r++) for (let x = x0 + (r % 2 ? 6 : 0); x < x1; x += 12) s.vline(x, y + 1, y + 5, T[3]);
    s.shift([x1 - 4, top, 4, GY - top], -1);
    // scalloped parapet and crest
    for (let x = x0; x < x1; x += 8) s.ellipse(x + 4, top, 4, 3, T[4]);
    s.hline(x0, x1 - 1, top + 1, T[2]);
    s.poly([[236, top], [246, top - 10], [256, top]], T[4]); s.line(236, top, 246, top - 10, T[5]); s.line(246, top - 10, 256, top, T[2]);
    s.circle(246, top - 5, 2, P.tn_terra[2]); s.px(246, top - 6, P.mustard[4]);
    // pilasters
    for (const px of [x0, x1 - 6]) { s.rect(px, top + 2, 6, 66, T[5]); s.vline(px + 5, top + 2, top + 67, T[2]); s.vline(px + 1, top + 2, top + 67, T[4]); for (let y = top + 6; y < top + 66; y += 10) s.rect(px + 2, y, 2, 4, T[3]); }
    // the great onion-arch window with a gilded lattice
    const ax = 246, ay = 30, aw = 18;
    const arch = [[ax - aw, 64], [ax - aw, 38], [ax - aw + 3, 30], [ax - 9, 24], [ax - 3, 20], [ax, 15], [ax + 3, 20], [ax + 9, 24], [ax + aw - 3, 30], [ax + aw, 38], [ax + aw, 64]];
    s.poly(arch.map(([x, y]) => [x + (x < ax ? -2 : 2), y - 2]).concat([[ax + aw + 2, 66], [ax - aw - 2, 66]]), T[2]);
    const lobbyLit = K.lit;
    s.poly(arch, lobbyLit ? E(P.lamp[3]) : K.glass === 'day' ? P.sky_day[1] : P.ink[2]);
    s.clip(arch, () => {
      if (lobbyLit) s.vgrad(ax - aw, 14, aw * 2, 52, [E(P.lamp[4]), E(P.lamp[3]), E(P.lamp[2])], 3);
      else if (K.glass === 'day') { s.vgrad(ax - aw, 14, aw * 2, 52, [P.sky_day[2], P.sky_day[1], P.ink[3]], 2); for (let k = 0; k < 40; k++) s.px(ax - 8 + k * 0.5, 22 + k, P.white[3]); }
      for (let y = 18; y < 66; y += 6) for (let x = ax - aw; x <= ax + aw; x += 6) { s.px(x, y, P.camel[2]); s.px(x + 3, y + 3, P.camel[2]); }
      for (let x = ax - aw + 3; x < ax + aw; x += 6) s.vline(x, 14, 66, P.camel[1]);
      for (let y = 21; y < 66; y += 6) s.hline(ax - aw, ax + aw, y, P.camel[1]);
    });
    s.line(ax - aw - 2, 36, ax, 13, T[5]);
    if (lobbyLit) s.light('warm', ax, 44, 34, 26, 0.6);
    for (const rx of [221, 271]) { s.circle(rx, 40, 4, T[3]); s.circle(rx, 40, 2, P.mustard[3]); s.px(rx - 1, 39, P.mustard[5]); }
    // the vertical ALADDIN sign
    const vx = 271, vy = 4, vw = 13, vh = 64;
    s.rect(vx - 1, vy - 1, vw + 2, vh + 2, P.maroon[1]);
    s.rect(vx, vy, vw, vh, P.maroon[3]); s.vline(vx, vy, vy + vh - 1, P.maroon[4]); s.vline(vx + vw - 1, vy, vy + vh - 1, P.maroon[2]);
    for (let y = vy + 1; y < vy + vh - 1; y += 3) { s.px(vx + 1, y, K.lit ? E(P.lamp[(y >> 1) % 2 ? 5 : 3]) : P.white[2]); s.px(vx + vw - 2, y + 1, K.lit ? E(P.lamp[(y >> 1) % 2 ? 3 : 5]) : P.white[2]); }
    vtext(s, 'ALADDIN', vx + vw / 2, vy + 2, K.lit ? E(P.neon[4]) : P.cream[5], { font: F7, gap: 2, shadow: K.lit ? E(P.neon[2]) : P.maroon[1], sx: 0, sy: 1 });
    s.rect(vx + 3, vy + vh, 7, 3, P.metal[2]);
    if (K.lit) { s.light('red', vx + vw / 2, vy + vh / 2, 20, 40, 0.45); s.light('warm', vx + vw / 2, vy + vh / 2, 14, 36, 0.3); }
    // the marquee: four hundred bulbs, two of them out
    const mx0 = 211, mx1 = 281, my = 70;
    s.rect(mx0 - 2, my, mx1 - mx0 + 4, 24, P.maroon[2]);
    s.hline(mx0 - 2, mx1 + 1, my, P.maroon[4]); s.hline(mx0 - 2, mx1 + 1, my + 23, P.maroon[0]);
    s.rect(mx0 + 2, my + 4, mx1 - mx0 - 4, 16, P.maroon[1]);
    s.hline(mx0 + 2, mx1 - 3, my + 4, P.maroon[0]);
    for (let x = mx0; x <= mx1; x += 2) {
      const on = K.lit && !(x === mx0 + 26 || x === mx1 - 8);
      s.px(x, my + 2, on ? E(P.lamp[(x >> 1) % 2 ? 5 : 4]) : P.white[1]); s.px(x, my + 21, on ? E(P.lamp[(x >> 1) % 2 ? 4 : 5]) : P.white[1]);
    }
    // the letters are bulbs too; the I's are out, so it says NOW SHOW NG
    const bulb = (lit) => (K.lit ? (lit ? E(P.lamp[5]) : P.maroon[3]) : (lit ? P.white[3] : P.maroon[3]));
    const lx = 246 - textW('NOW SHOWING', { font: F7 }) / 2;
    const wI = textW('NOW SHOW', { font: F7 }) + 1;
    text(s, 'NOW SHOW', lx, my + 5, bulb(true), { font: F7 });
    text(s, 'I', lx + wI, my + 5, bulb(false), { font: F7 });
    text(s, 'NG', lx + wI + textW('I', { font: F7 }) + 1, my + 5, bulb(true), { font: F7 });
    text(s, '7 & 9', 246, my + 14, K.lit ? E(P.lamp[4]) : P.white[2], { align: 'center' });
    if (K.lit) { s.light('warm', 246, my + 26, 46, 14, 0.9); s.light('white', 246, my + 10, 44, 16, 0.4); }
    // under the marquee: ticket booth, poster cases, doors
    s.rect(x0 + 2, 94, x1 - x0 - 4, GY - 94, T[2]);
    s.shift([x0 + 2, 94, x1 - x0 - 4, 4], -1);
    for (const dx of [226, 256]) { s.rect(dx, 98, 10, 26, P.ink[2]); s.rect(dx + 1, 99, 8, 12, K.lit ? E(P.lamp[2]) : P.ink[3]); s.px(dx + 8, 112, P.mustard[4]); }
    s.rect(240, 98, 12, 26, P.mustard[2]); s.rect(241, 100, 10, 9, K.lit ? E(P.lamp[4]) : P.sky_day[1]); s.hline(240, 251, 98, P.mustard[4]);
    s.poly([[239, 98], [246, 93], [253, 98]], P.mustard[3]);
    s.rect(242, 112, 8, 2, P.mustard[4]);
    for (const [px, art] of [[212, 0], [268, 1]]) {
      s.rect(px, 97, 12, 19, P.mustard[3]); s.rect(px + 1, 98, 10, 17, K.lit ? E(P.ink[2]) : P.ink[2]);
      if (art === 0) { s.vgrad(px + 2, 99, 8, 15, K.lit ? [E(P.tv[2]), E(P.neon[2])] : [P.tv[2], P.neon[2]], 2); s.rect(px + 5, 102, 2, 8, K.lit ? E(P.ink[1]) : P.ink[1]); s.px(px + 5, 101, K.lit ? E(P.ink[1]) : P.ink[1]); }
      else { s.vgrad(px + 2, 99, 8, 15, K.lit ? [E(P.lamp[1]), E(P.fire[3])] : [P.fire[1], P.fire[3]], 2); s.circle(px + 6, 104, 2, K.lit ? E(P.lamp[5]) : P.yellow[4]); }
      if (K.lit) s.light('warm', px + 6, 106, 10, 12, 0.35);
    }
  }

  function dtStreet(s, K) {
    const rng = PX.rng('tn_dtstreet');
    // sidewalk slabs, curb, street
    s.rect(0, GY, 320, 9, P.concrete[3]); s.hline(0, 319, GY, P.concrete[4]);
    for (let x = 8; x < 320; x += 18) s.vline(x, GY + 1, GY + 8, P.concrete[2]);
    s.rect(0, GY + 9, 320, 2, P.concrete[4]); s.hline(0, 319, GY + 10, P.concrete[2]);
    s.rect(0, GY + 11, 320, 180 - GY - 11, P.asphalt[2]);
    s.noise(0, GY + 11, 320, 180 - GY - 11, [P.asphalt[1], P.asphalt[3]], 0.06, { rng });
    s.rect(284, GY, 36, 11, P.asphalt[2]); s.hline(284, 319, GY, P.concrete[2]);            // the cross street
    s.shift([0, GY, 284, 2], -1);                                                            // contact shadow
    // fallen leaves in the gutter and on the walk
    const fall = [P.leaf_orange[3], P.leaf_orange[4], P.leaf_red[3], P.leaf_gold[4], P.leaf_orange[2]];
    for (let i = 0; i < 120; i++) {
      const x = rng.int(0, 319), y = GY + 1 + Math.floor(Math.pow(rng(), 0.8) * 30);
      const c = fall[rng.int(0, fall.length - 1)]; s.px(x, y, c); if (rng() < 0.4) s.px(x + 1, y, sh(c, -1));
    }
    // a hydrant and a newspaper box
    s.rect(87, 126, 4, 6, P.red[3]); s.rect(86, 128, 6, 2, P.red[2]); s.rect(87, 125, 4, 1, P.red[4]); s.vline(87, 126, 131, P.red[4]);
    s.rect(229, 123, 8, 10, P.navy[3]); s.rect(230, 125, 6, 3, P.paper[4]); s.hline(229, 236, 123, P.navy[4]); s.vline(236, 123, 132, P.navy[1]);
    if (!K.fest) {
      // parked cars (none on Quiet Night day: nobody on Center Street at all)
      if (!K.day) car(s, 20, 138, P.house_blue, K);
      if (K.dusk) car(s, 170, 138, P.roof_red, K);
    }
  }
  /* a parked '80s sedan, side view, mostly under the dialogue box */
  function car(s, x, y, R, K) {
    s.poly([[x, y + 4], [x + 8, y + 3], [x + 16, y - 4], [x + 40, y - 4], [x + 48, y + 3], [x + 62, y + 4], [x + 62, y + 14], [x, y + 14]], R[3]);
    s.hline(x + 16, x + 40, y - 4, R[5]); s.line(x + 8, y + 3, x + 16, y - 4, R[4]);
    s.poly([[x + 11, y + 3], [x + 17, y - 2], [x + 27, y - 2], [x + 27, y + 3]], K.night ? P.ink[2] : P.sky_day[1]);
    s.poly([[x + 30, y - 2], [x + 39, y - 2], [x + 45, y + 3], [x + 30, y + 3]], K.night ? P.ink[2] : P.sky_day[1]);
    s.hline(x + 1, x + 61, y + 8, R[4]); s.rect(x, y + 11, 63, 2, P.chrome[3]);
    for (const wx of [x + 12, x + 50]) { s.circle(wx, y + 14, 4.5, P.ink[1]); s.circle(wx, y + 14, 2, P.chrome[3]); }
    s.rect(x + 60, y + 6, 2, 3, P.red[3]);
  }

  /* cast-iron lampposts between the signs, with Canal Days bunting */
  function dtLamps(s, K) {
    const xs = [52, 150, 205, 290];
    const M = P.maroon, G = P.mustard, I = P.house_green;
    // pennant swags between the posts, above the sign bands
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i] + 2, b = xs[i + 1] - 2;
      for (let x = a; x <= b; x++) {
        const t = (x - a) / (b - a), y = Math.round(66 + Math.sin(t * Math.PI) * 6);
        s.px(x, y, P.ink[2]);
        const k = Math.floor((x - a) / 5), p = (x - a) % 5;
        if (p < 4 && x > a + 2 && x < b - 2) { const c = k % 2 ? G : M; s.vline(x, y + 1, y + (p === 1 || p === 2 ? 3 : 1), c[p === 1 ? 4 : 3]); }
      }
    }
    for (const x of xs) {
      // base, shaft, collars, acorn globe, finial
      s.rect(x - 2, GY + 2, 5, 7, I[1]); s.rect(x - 3, GY + 7, 7, 2, I[1]); s.vline(x - 2, GY + 2, GY + 8, I[3]);
      s.rect(x - 1, 64, 2, GY - 62, I[1]); s.vline(x - 1, 64, GY + 1, I[3]);
      s.rect(x - 2, 92, 4, 2, I[2]); s.rect(x - 2, 64, 4, 2, I[2]); s.hline(x - 2, x + 1, 64, I[3]);
      const gl = K.lit;
      s.rect(x - 3, 56, 6, 8, gl ? E(P.lamp[4]) : P.white[2]);
      s.rect(x - 2, 55, 4, 1, gl ? E(P.lamp[5]) : P.white[3]); s.vline(x - 3, 57, 62, gl ? E(P.lamp[5]) : P.white[3]); s.vline(x + 2, 57, 63, gl ? E(P.lamp[3]) : P.white[1]);
      s.rect(x - 2, 53, 4, 2, I[2]); s.px(x - 1, 51, I[2]); s.px(x - 1, 52, I[3]);
      // bunting fan under the lamp
      for (let yy = 0; yy < 6; yy++) for (let xx = -6; xx <= 6; xx++) {
        if (xx * xx + yy * yy * 2.2 > 40) continue;
        const ang = Math.atan2(yy + 0.5, xx), k = Math.floor((ang / Math.PI) * 5);
        s.px(x + xx, 67 + yy, (k % 2 ? G : M)[yy > 3 ? 2 : 3]);
      }
      s.hline(x - 6, x + 6, 67, G[4]); s.circle(x, 67, 1.4, G[4]);
      if (gl) { s.light('warm', x, 60, 14, 12, 1.0); s.light('warm', x, GY + 4, 22, 6, 0.8); s.lightPoly('warm', [[x - 3, 64], [x + 3, 64], [x + 18, GY + 8], [x - 18, GY + 8]], 0.28, { fade: { x0: x, y0: 64, x1: x, y1: GY + 8 } }); }
      else s.shift([x + 1, GY + 1, 10, 2], -1);
    }
  }

  /* strings of bulbs zigzagging from our side of the street over to theirs */
  function dtStrings(s, K) {
    const lit = K.fest;
    const segs = [[-12, -3, 26, 28], [26, 28, 64, -3], [64, -3, 100, 22], [100, 22, 140, -3], [140, -3, 176, 37], [176, 37, 214, -3], [214, -3, 250, 18], [250, 18, 290, -3], [290, -3, 318, 56]];
    segs.forEach(([ax, ay, bx, by], si) => {
      if (K.night && si === 5) {       // one string's come down: it hangs from its far end
        for (let y = 37; y < 104; y++) { const x = 176 + Math.round(Math.sin((y - 37) * 0.07) * 3); s.px(x, y, P.ink[2]); if (y % 5 === 0) s.px(x + 1, y, P.white[2]); }
        return;
      }
      const near = (y) => y < 6;                                   // the high end is our side: closer, bigger bulbs
      const n = Math.ceil(Math.hypot(bx - ax, by - ay));
      let next = 0;
      for (let i = 0; i <= n; i++) {
        const t = i / n, sag = Math.sin(t * Math.PI) * 4;
        const x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t + sag);
        s.px(x, y, P.ink[2]);
        if (i >= next) {
          const closeness = 1 - Math.min(1, Math.max(0, y) / 40);
          next = i + Math.round(3 + closeness * 4);
          const big = closeness > 0.6;
          if (lit) {
            s.px(x, y + 1, E(P.lamp[5])); if (big) { s.px(x + 1, y + 1, E(P.lamp[4])); s.px(x, y + 2, E(P.lamp[4])); s.px(x + 1, y + 2, E(P.lamp[3])); }
            if (i % 2 === 0) s.light('warm', x, y + 2, big ? 9 : 6, big ? 8 : 5, 0.45);
          } else { s.px(x, y + 1, P.white[3]); if (big) { s.px(x + 1, y + 1, P.white[2]); s.px(x, y + 2, P.white[1]); } }
        }
        void near;
      }
    });
  }

  /* Canal Days booths in the street; after the Float their tarps are down */
  function dtBooths(s, K) {
    const lit = K.fest;
    const booths = [
      { x: 6, w: 40, a: P.red, b: P.white_cloth, sign: ['CIDER', 'DONUTS'], goods: 'donuts' },
      { x: 68, w: 40, a: P.teal, b: P.cream, sign: ['FRIED', 'DOUGH'], goods: 'dough' },
      { x: 140, w: 40, a: P.maroon, b: P.mustard, sign: ['LANTERN', 'SOCIETY'], goods: 'lanterns' },
      { x: 212, w: 40, a: P.navy, b: P.white_cloth, sign: ['RAFFLE'], goods: 'raffle' }
    ];
    for (const B of booths) {
      const x0 = B.x, x1 = B.x + B.w, cx = x0 + B.w / 2;
      // posts
      s.rect(x0 + 1, 102, 2, 30, P.wood[2]); s.rect(x1 - 3, 102, 2, 30, P.wood[1]); s.vline(x0 + 1, 102, 131, P.wood[4]);
      // the back of the booth and its goods
      s.rect(x0 + 3, 109, B.w - 6, 10, lit ? P.cream[2] : P.cream[1]);
      if (lit && B.goods === 'donuts') for (let k = 0; k < 5; k++) { const dx = x0 + 7 + k * 6; s.ring(dx, 114, 1.5, 1.5, P.camel[2]); s.px(dx - 1, 113, P.camel[4]); }
      if (lit && B.goods === 'dough') for (let k = 0; k < 3; k++) { const dx = x0 + 9 + k * 10; s.ellipse(dx, 115, 4, 1.5, P.paper[5]); s.ellipse(dx, 114.5, 3, 1, P.wall_yellow[4]); s.px(dx, 114, P.white[5]); }
      if (lit && B.goods === 'raffle') { s.rect(x0 + 8, 111, 6, 6, P.red[3]); s.hline(x0 + 8, x0 + 13, 111, P.red[4]); s.rect(x0 + 18, 112, 12, 4, P.paper[5]); for (let k = 0; k < 3; k++) s.px(x0 + 20 + k * 3, 113, P.red[3]); }
      // striped canopy and valance
      s.poly([[x0 - 1, 109], [x0 + 3, 102], [x1 - 3, 102], [x1 + 1, 109]], B.a[3]);
      for (let x = x0; x < x1; x++) if (Math.floor((x - x0) / 4) % 2) s.vline(x, 103, 108, B.b[3]);
      s.hline(x0 + 3, x1 - 4, 102, B.a[5]);
      for (let x = x0 - 1; x <= x1; x++) { const r = Math.floor((x - x0 + 1) / 4) % 2 ? B.b : B.a; s.vline(x, 109, 110 + ((x - x0) % 4 === 1 || (x - x0) % 4 === 2 ? 1 : 0), r[2]); }
      s.shift([x0 + 3, 111, B.w - 6, 2], -1);
      // the counter
      s.rect(x0, 119, B.w, 9, P.wood_pale[3]); s.hline(x0, x1 - 1, 119, P.wood_pale[5]); s.hline(x0, x1 - 1, 120, P.wood_pale[2]);
      for (let x = x0 + 4; x < x1; x += 8) s.vline(x, 121, 127, P.wood_pale[2]);
      // the sign board on top
      const sy = B.sign.length > 1 ? 89 : 94;
      s.rect(x0 + 4, sy, B.w - 8, 102 - sy, P.paper[4]); s.hline(x0 + 4, x1 - 5, sy, P.paper[5]); s.hline(x0 + 4, x1 - 5, 101, P.paper[2]);
      s.vline(x0 + 6, sy + 1, 101, P.paper[3]);
      B.sign.forEach((line, i) => text(s, line, cx, sy + 2 + i * 6, B.a[2], { align: 'center' }));
      if (K.night) {
        // closed for the night: tarps rolled down, sign dark
        s.rect(x0 + 2, 110, B.w - 4, 18, P.cream[2]);
        for (let x = x0 + 4; x < x1 - 2; x += 6) s.vline(x, 111, 127, P.cream[1]);
        s.hline(x0 + 2, x1 - 3, 110, P.cream[3]);
        s.rect(x0 + 2, 108, B.w - 4, 2, P.cream[3]);
        continue;
      }
      if (B.goods === 'lanterns') {
        // paper lanterns for the Float, glowing (candlelight: warm, ordinary)
        for (let k = 0; k < 5; k++) { const lx = x0 + 6 + k * 7, ly = 111 + (k % 2) * 2; s.vline(lx, 109, ly - 1, P.ink[2]); s.rect(lx - 2, ly, 5, 4, E(P.lamp[k % 2 ? 4 : 3])); s.hline(lx - 2, lx + 2, ly, E(P.lamp[5])); s.hline(lx - 1, lx + 1, ly + 4, P.wood[1]); }
        s.light('warm', cx, 114, 26, 12, 0.7);
      }
      // bulbs along the valance, warm light under the canopy
      for (let x = x0; x <= x1; x += 4) s.px(x, 112, E(P.lamp[(x >> 2) % 2 ? 5 : 4]));
      s.light('warm', cx, 115, 30, 16, 0.85);
    }
    if (lit) {
      // the riding mower somebody's going to win
      const mx = 254, my = 122;
      s.rect(mx, my - 4, 12, 4, P.red[3]); s.hline(mx, mx + 11, my - 4, P.red[4]); s.rect(mx + 3, my - 8, 4, 4, P.ink[2]); s.rect(mx + 2, my - 9, 6, 1, P.ink[3]);
      s.vline(mx + 9, my - 10, my - 5, P.metal[3]); s.hline(mx + 8, mx + 10, my - 10, P.ink[3]);
      s.circle(mx + 2, my + 1, 2, P.ink[1]); s.circle(mx + 10, my + 1, 2.5, P.ink[1]);
    }
  }

  /* the bandstand at the end of the block: The Static Hours, two fast songs, polite applause */
  function dtBandstand(s, K) {
    const x0 = 268, x1 = 324, W = P.trim;
    // platform with a lattice skirt and steps
    s.rect(x0, 110, x1 - x0, 4, P.wood_pale[3]); s.hline(x0, x1, 110, P.wood_pale[5]); s.hline(x0, x1, 113, P.wood_pale[1]);
    s.rect(x0 + 2, 114, x1 - x0, 12, W[2]);
    for (let x = x0 + 2; x < x1; x += 3) for (let y = 114; y < 126; y++) if ((x + y) % 6 === 0 || (x - y + 60) % 6 === 0) s.px(x, y, W[0]);
    for (let k = 0; k < 3; k++) s.rect(x0 - 6 + k * 2, 115 + k * 3, 8, 3, P.wood_pale[4 - (k % 2)]);
    // the band, lit from the stage bulbs
    const fig = (x, y, h, beanie) => {
      s.circle(x, y + 2, 2.2, P.ink[1]); s.rect(x - 3, y + 4, 7, h - 4, P.ink[1]); s.vline(x - 3, y + 5, y + h - 1, P.plum[2]);
      if (beanie) { s.rect(x - 2, y - 1, 5, 2, P.plum[3]); s.px(x, y - 2, P.plum[3]); }
    };
    fig(280, 94, 16, true); s.line(276, 104, 287, 98, P.wood[3]); s.rect(277, 102, 4, 3, P.wood[2]);          // Nate and his guitar
    fig(296, 96, 13, false); s.circle(296, 106, 4, P.white_cloth[3]); s.ring(296, 106, 4, 4, P.ink[2]);      // the drummer behind his kick drum
    s.line(302, 98, 306, 97, P.mustard[4]); s.vline(304, 98, 109, P.metal[2]);                              // one cymbal
    fig(313, 99, 11, false); s.line(309, 106, 318, 101, P.wood[2]);                                          // the bass player who looks twelve
    // posts and the roof
    for (const px of [x0 + 1, 296, x1 - 3]) { s.rect(px, 86, 2, 24, W[3]); s.vline(px, 86, 109, W[4]); }
    s.poly([[x0 - 4, 87], [296, 66], [x1 + 4, 87]], P.roof_red[2]);
    s.clip([[x0 - 4, 87], [296, 66], [x1 + 4, 87]], () => s.shingles(x0 - 6, 64, 64, 24, P.roof_red, { rng: PX.rng('tn_bandroof'), sw: 4, sh: 3 }));
    s.line(x0 - 4, 87, 296, 66, P.roof_red[4]); s.vline(296, 60, 66, P.metal[2]); s.circle(296, 60, 1.2, P.mustard[4]);
    s.rect(x0 - 4, 87, x1 - x0 + 8, 2, W[3]); s.hline(x0 - 4, x1 + 4, 87, W[4]);
    // bunting swags along the eave, bulbs under it
    for (let k = 0; k < 4; k++) {
      const a = x0 - 2 + k * 14;
      for (let x = a; x < a + 14; x++) { const t = (x - a) / 14, d = Math.round(Math.sin(t * Math.PI) * 4); s.vline(x, 89, 89 + d, P.maroon[3]); s.px(x, 89 + d, P.mustard[4]); }
    }
    for (let x = x0 - 3; x <= x1 + 3; x += 3) s.px(x, 89, E(P.lamp[(x % 2) ? 5 : 4]));
    s.light('warm', 296, 100, 40, 22, 1.0);
    s.light('warm', 296, 112, 34, 10, 0.6);
  }

  /* people: the festival crowd in silhouette, a few walkers at dusk, the street emptying at night */
  function person(s, x, feet, h, R, o = {}) {
    const hr = Math.max(1.8, h * 0.14), hy = feet - h + hr;
    const sw = Math.max(2, Math.round(h * 0.22));
    const body = R[o.shade === undefined ? 1 : o.shade], rim = R[(o.shade === undefined ? 1 : o.shade) + 2];
    // torso and legs
    s.poly([[x - sw, hy + hr + 2], [x + sw, hy + hr + 2], [x + sw - 1, feet - h * 0.42], [x - sw + 1, feet - h * 0.42]], body);
    if (o.legs !== false) { s.rect(x - sw + 1, feet - h * 0.42, sw - 1, h * 0.42, R[0]); s.rect(x + 1, feet - h * 0.42, sw - 1, h * 0.42, R[0]); }
    s.rect(x - 1, hy + hr, 2, 2, body);
    s.ellipse(x + (o.bow ? 1 : 0), hy + (o.bow ? 1 : 0), hr, hr, body);
    if (o.hat) { s.rect(x - hr - 1, hy - hr + 1, hr * 2 + 3, 1, R[0]); s.rect(x - hr + 0.5, hy - hr - 1, hr * 2 - 1, 2, R[0]); }
    if (o.pony) s.rect(x + hr - 1, hy, 2, 3, body);
    // warm rim light on the top and the lit side
    s.px(x - 1, hy - hr + 0.5, rim); s.px(x, hy - hr + 0.5, rim);
    s.vline(x - sw, hy + hr + 2, hy + hr + 4, rim);
    if (o.lantern) { s.vline(x + sw + 1, hy + hr + 3, hy + hr + 5, P.ink[2]); s.rect(x + sw, hy + hr + 6, 3, 3, E(P.lamp[4])); s.light('warm', x + sw + 1, hy + hr + 7, 6, 5, 0.6); }
  }
  function dtPeople(s, K) {
    const rng = PX.rng('tn_people');
    const R = [P.ink, P.plum, P.navy, P.maroon, P.denim, P.olive, P.black_cloth];
    if (K.fest) {
      // three ragged rows, back to front, heads catching the light
      for (let row = 0; row < 3; row++) {
        const feet = 131 + row * 6, hBase = 17 + row * 2;
        for (let x = rng.int(-4, 4); x < 330; x += rng.int(7, 12) + row) {
          if (row === 0 && x > 262 && x < 300) continue;
          const kid = rng() < 0.18, h = kid ? hBase - 5 : hBase + rng.int(-1, 2);
          person(s, x, feet, h, R[rng.int(0, R.length - 1)], { shade: row === 2 ? 0 : 1, hat: rng() < 0.15, pony: rng() < 0.2, lantern: row < 2 && rng() < 0.12, legs: false });
        }
      }
      return;
    }
    if (K.day) {
      // Shop 'n Save: CLOSING 5 P.M. TODAY
      const bx = 157, by = 100;
      s.line(bx + 2, by + 23, bx + 5, by, P.wood[1]); s.line(bx + 30, by + 23, bx + 27, by, P.wood[1]);
      s.rect(bx + 2, by, 29, 20, P.wood[3]); s.hline(bx + 2, bx + 30, by, P.wood[5]); s.rect(bx + 3, by + 1, 27, 18, P.ink[2]);
      text(s, 'CLOSING', bx + 17, by + 2, P.white[4], { align: 'center' });
      text(s, '5 P.M.', bx + 16, by + 8, P.white[4], { align: 'center' });
      text(s, 'TODAY', bx + 17, by + 13, P.mustard[4], { align: 'center' });
      s.shift([bx + 8, GY - 1, 26, 2], -1);
    }
    if (K.dusk) {
      person(s, 70, GY + 6, 17, P.navy, { shade: 2 }); person(s, 74, GY + 6, 11, P.red, { shade: 2, pony: true });
      person(s, 236, GY + 7, 17, P.camel, { shade: 2, hat: true });
    }
    if (K.night) {
      // walking home with their heads down like it's raining, and it isn't
      person(s, 140, GY + 6, 17, P.ink, { shade: 2, bow: true }); person(s, 152, GY + 6, 16, P.plum, { shade: 1, bow: true });
      person(s, 300, GY + 5, 13, P.ink, { shade: 2, bow: true });
    }
  }
})();
