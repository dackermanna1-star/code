// Ryomen Sukuna — procedural pixel-art painter.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U, Rig = JJK.Rig, Body = JJK.Body;
  const Art = (JJK.Art = JJK.Art || {});

  const PAL = [
    // 0: black gi with white trim (reference look), black spiky hair
    Body.palette({
      skin: ['#5e3226', '#a5664a', '#d79a74', '#f5c6a0'],
      top: ['#050407', '#0f0d13', '#1d1a24', '#3a3446'],
      trim: ['#7d7a86', '#b4b1be', '#e2e0ea', '#ffffff'],
      pants: ['#050407', '#0e0c12', '#1b1822', '#363042'],
      sash: ['#76737f', '#aeacb8', '#dddbe5', '#fbfbff'],
      wrap: ['#6a6672', '#9e9aa8', '#c9c6d2', '#ebe9f2'],
      sole: ['#2a1c14', '#45301f', '#5e4430', '#7a5a40'],
      hair: ['#050408', '#120f18', '#231e2c', '#463c58'],
      tattoo: ['#050405', '#0b090c', '#141016', '#221c24'],
    }),
    // 1: Heian-era white kimono, pink hair
    Body.palette({
      skin: ['#6a3a2c', '#b67458', '#e6aa84', '#ffd6b2'],
      top: ['#6c6a78', '#a9a7b6', '#dcdae6', '#ffffff'],
      trim: ['#0a080c', '#16131a', '#26222c', '#443c4c'],
      pants: ['#0b080c', '#1a141c', '#2c232e', '#4a3c4c'],
      sash: ['#2a0a0e', '#4c1218', '#781c24', '#a8323a'],
      wrap: ['#6a6672', '#9e9aa8', '#c9c6d2', '#ebe9f2'],
      sole: ['#2a1c14', '#45301f', '#5e4430', '#7a5a40'],
      hair: ['#7a2a44', '#c45a7a', '#f08ca8', '#ffc4d4'],
      tattoo: ['#050405', '#0b090c', '#141016', '#221c24'],
    }),
  ];
  PAL[1].lineTop = true;

  const C_LINE = U.pack(60, 26, 20);
  const C_MARK = U.pack(16, 10, 14);
  const C_EYE = U.pack(255, 40, 40);
  const C_EYE2 = U.pack(150, 0, 10);
  const C_SCLERA = U.pack(240, 220, 210);
  const C_TEETH = U.pack(250, 246, 236);
  const C_MOUTHIN = U.pack(60, 8, 12);
  const C_LIP = U.pack(110, 50, 40);

  const HAIR = [
    [8.8, 4.6, 0.1], [12.4, 3.4, 0.6], [10.2, 7.0, 0.2], [14.4, 8.2, 0.8], [9.8, 10.4, 0.25],
    [13.2, 15.6, 0.9], [7.4, 13.8, 0.3], [8.4, 21.2, 1], [3.2, 16.0, 0.3], [1.6, 23.0, 1.1],
    [-1.4, 16.8, 0.3], [-5.6, 22.4, 1.1], [-6.0, 16.0, 0.3], [-12.2, 19.6, 1], [-10.2, 13.2, 0.3],
    [-17.4, 13.6, 1], [-12.6, 9.0, 0.3], [-18.2, 6.6, 0.9], [-12.8, 4.4, 0.3], [-16.0, 0.2, 0.8],
    [-12.6, -4.6, 0.7], [-9.0, -7.2, 0.5], [-6.0, -2.6, 0], [-5.6, 4.6, 0], [-3.0, 5.4, 0], [2.0, 5.6, 0], [4.8, 3.6, 0.1],
    [6.0, 0.6, 0.3], [7.2, 3.0, 0.1],
  ];
  const HAIR_BACK = [
    [-4, 9, 0], [-13, 10, 0.6], [-11, 6, 0.2], [-17, 4.5, 0.8], [-12.5, 1.5, 0.2], [-15.5, -3.5, 0.8],
    [-11, -2, 0.2], [-11.5, -7.5, 0.8], [-8, -4, 0.2], [-6, -7.5, 0.6], [-4.5, -2.5, 0], [-4, 4, 0],
  ];
  const HAIR_LINES = [[2, 7, 1.6, 21], [-2, 8, -5.4, 20.5], [-7, 7, -12, 17.5], [6.2, 7, 12.6, 14.5], [-10, 5, -16.5, 7.6], [8, 5.5, 13.4, 7.6]];

  function drawArm(P, J, useN, pal, vis, g) {
    // n* joints = rear arm (drawn behind), f* joints = lead arm (camera side)
    const near = !useN;
    const sh = useN ? J.shN : J.shF, el = useN ? J.elN : J.elF, ha = useN ? J.haN : J.haF;
    const skin = near ? pal.skin : pal.skinF;
    const top = near ? pal.top : pal.topF;
    const trim = near ? pal.trim : pal.trimF;
    const tat = near ? pal.tattoo : pal.tattooF;
    const shape = useN ? vis.pose.nhs : vis.pose.fhs;
    const ang = useN ? J.hnA : J.hfA;
    P.limb(sh, el, [[0, 7.2, 7.2], [0.45, 6.8, 7.0], [1, 5.0, 5.0]], skin, g, 1);
    // forearm with tattoo bands
    P.limb(el, ha, [[0, 5.2, 5.2], [0.35, 5.7, 5.4], [1, 3.7, 3.7]], skin, g + 2, 1);
    const b1 = Body.along(el, ha, 0.62, 0), b2 = Body.along(el, ha, 0.74, 0), b3 = Body.along(el, ha, 0.86, 0);
    P.limb(b1, Body.along(el, ha, 0.68, 0), [[0, 5.0, 5.0], [1, 4.8, 4.8]], tat, g + 3, 1, false, false);
    P.limb(b2, Body.along(el, ha, 0.79, 0), [[0, 4.6, 4.6], [1, 4.4, 4.4]], tat, g + 3, 1, false, false);
    P.limb(b3, Body.along(el, ha, 0.9, 0), [[0, 4.2, 4.2], [1, 4.0, 4.0]], tat, g + 3, 1, false, false);
    P.line(Body.along(el, ha, 0.2, -3), Body.along(el, ha, 0.5, 2), U.pack(...tat.tones[2]), g + 2, 1, true);
    // wide kimono sleeve over the upper arm, with a drape hanging under gravity
    const end = Body.along(sh, el, 0.7, 0);
    const o1 = Body.along(sh, el, 0.7, 9.2), o2 = Body.along(sh, el, 0.7, -9.2);
    const lo = o1[1] < o2[1] ? o1 : o2, hi = o1[1] < o2[1] ? o2 : o1;
    const sw = vis.sec ? vis.sec.cloth[0][0] * 0.5 : 0;
    P.poly([Body.along(sh, el, 0.15, lo === o1 ? 8 : -8), lo, [lo[0] - 3 + sw, lo[1] - 7], [lo[0] - 8 + sw, lo[1] - 5], Body.along(sh, el, 0.2, 0)], top, g, { n: [-0.2, 0.3, 0.93] });
    P.limb(sh, end, [[0, 8.6, 8.6], [0.6, 9.4, 9.0], [1, 9.6, 9.0]], top, g + 1, 1, true, false);
    P.line(o1, o2, U.pack(...trim.tones[2]), g + 1, 1, true);
    void hi;
    Body.hand(P, ha, ang, shape, skin, g + 4, { lineCol: C_LINE });
  }

  function drawLeg(P, J, useN, pal, g) {
    const near = !useN;
    const hp = useN ? J.hpN : J.hpF, kn = useN ? J.knN : J.knF, an = useN ? J.anN : J.anF;
    const pants = near ? pal.pants : pal.pantsF;
    const wrap = near ? pal.wrap : pal.wrapF;
    const fa = useN ? J.ftNA : J.ftFA;
    Body.foot(P, an, fa, near ? pal.skin : pal.skinF, g + 4, 'sandal', near ? pal.sole : pal.soleF);
    // wrapped shin
    P.limb(Body.along(kn, an, 0.55, 0), an, [[0, 6.4, 6.6], [1, 4.6, 4.6]], wrap, g + 2, 1, false, true);
    const wl = U.pack(...wrap.tones[1]);
    for (let i = 0; i < 3; i++) P.line(Body.along(kn, an, 0.66 + i * 0.1, -6), Body.along(kn, an, 0.6 + i * 0.1, 6), wl, g + 2, 1, true);
    // hakama
    P.limb(hp, kn, [[0, 12.2, 12.2], [0.6, 11.6, 12], [1, 10.6, 10.8]], pants, g, 1);
    P.limb(kn, Body.along(kn, an, 0.62, 0), [[0, 10.6, 10.8], [0.7, 11.6, 11.4], [1, 9.4, 9.4]], pants, g + 3, 1, true, false);
    const fold = U.pack(...pants.tones[3]);
    P.line(Body.along(hp, kn, 0.3, 4), Body.along(hp, kn, 0.85, -2), fold, g, 1, true);
    P.line(Body.along(kn, an, 0.1, -5), Body.along(kn, an, 0.5, -2), fold, g + 3, 1, true);
  }

  function drawTorso(P, J, pal, vis, sec, g) {
    const hip = J.hip, waist = J.waist, chest = J.chest;
    P.ell([hip[0] + J.fwd[0] * 0.5, hip[1] - 1], 13.4, 10.2, Math.atan2(waist[1] - hip[1], waist[0] - hip[0]), pal.pants, g);
    P.limb(hip, waist, [[0, 11, 11.2], [1, 10.4, 11]], pal.top, g, -1, false, false);
    P.limb(waist, chest, [[0, 10.4, 11], [0.4, 12, 12.8], [0.78, 13.2, 13.4], [1, 10.8, 11]], pal.top, g, -1);
    const up = (t, s) => Body.along(waist, chest, t, -s);
    // V collar: skin showing + white trim lapels
    P.poly([up(1.02, 7), up(1.02, 12), up(0.5, 9.6), up(0.62, 6.4)], pal.skin, g + 1, { n: [0.2, -0.3, 0.93] });
    const trim = U.pack(...pal.trim.tones[2]);
    const trimS = U.pack(...pal.trim.tones[1]);
    P.line(up(1.05, 5.5), up(0.48, 10.4), trim, g + 1, 2);
    P.line(up(1.02, 12.6), up(0.5, 11.4), trimS, g + 1, 1);
    P.line(up(0.95, -2), up(1.05, 5.5), trim, g + 1, 2);
    // chest fold shadows
    const fl = U.pack(...pal.top.tones[3]);
    P.line(up(0.3, 4), up(0.5, -6), fl, g, 1, true);
    P.line(up(0.7, -4), up(0.85, -9), fl, g, 1, true);
    // sash
    const b0 = Body.along(hip, waist, 0.12, 0), b1 = Body.along(hip, waist, 0.62, 0);
    P.limb(b0, b1, [[0, 12.2, 12.6], [1, 11.4, 11.8]], pal.sash, g + 2, -1, false, false);
    P.line(Body.along(hip, waist, 0.37, 12.4), Body.along(hip, waist, 0.37, -12.6), U.pack(...pal.sash.tones[1]), g + 2, 1, true);
  }

  function drawSashTails(P, J, pal, sec, g) {
    const knot = Body.along(J.hip, J.waist, 0.4, 11.2); // back knot
    const c = sec.cloth;
    P.ell(knot, 3.4, 2.8, 0, pal.sash, g);
    Body.strip(P, [knot[0] - 1, knot[1] - 1], 22, 3.2, 2.2, [c[2][0] * 1.1 - 3, c[2][1] * 0.8], pal.sashF, g - 1, 1);
    Body.strip(P, [knot[0] + 1, knot[1] - 1], 17, 3, 2, [c[1][0] * 1.0 - 1.5, c[1][1] * 0.8], pal.sash, g, 1);
  }

  function drawHead(P, J, pal, vis, sec, g) {
    const C = J.head;
    const a = -J.headAng;
    const L = (u, v) => P.loc(C, a, u, v);
    const pose = vis.pose;
    const H = (q) => L(q[0] + sec.hx * q[2] * 1.3, q[1] + sec.hy * q[2] * 1.1 + (vis.hairLift || 0) * q[2]);
    P.poly(HAIR_BACK.map(H), pal.hairF, g - 3, { sphere: [L(-8, 2)[0], L(-8, 2)[1], 12] });
    P.limb(J.neck, L(-1.5, -5), [[0, 5.2, 5.4], [1, 4.8, 4.8]], pal.skin, g - 1, -1);
    Body.head(P, L, a, pal.skin, g, C_LINE, 1);
    // eye: narrow, menacing
    P.poly([L(3.8, 1.8), L(7.7, 2.5), L(7.4, 0.4), L(4.1, 0.6)], pal.skin, g + 1, { color: C_SCLERA });
    P.poly([L(5.4, 2.2), L(7.4, 2.4), L(7.2, 0.5), L(5.5, 0.6)], pal.skin, g + 2, { color: C_EYE2 });
    P.dot(L(6.2, 1.6), C_EYE, g + 2);
    P.line(L(3.6, 2.2), L(7.8, 2.8), C_MARK, g + 2, 1);
    // brow angled down toward the nose
    P.line(L(3.4, 4.6), L(8.4, 3.4), C_MARK, g + 2, 1);
    // markings: two thin lines on the cheek under the eye
    P.line(L(4.4, -0.8), L(7.4, -1.1), C_MARK, g + 2, 1);
    P.line(L(3.8, -2.2), L(6.8, -2.5), C_MARK, g + 2, 1);
    // mouth
    const f = pose.face;
    if (f === 'grin' || f === 'shout') {
      const open = f === 'shout' ? 2.4 : 0.9;
      P.poly([L(6.2, -6.0), L(9.8, -5.8), L(9.6, -6.6 - open), L(7.0, -6.8 - open * 0.7)], pal.skin, g + 1, { color: C_MOUTHIN });
      P.line(L(6.4, -6.1), L(9.6, -5.9), C_TEETH, g + 2, 1);
      if (f === 'shout') P.line(L(7.2, -8.6), L(9.4, -8.4), C_TEETH, g + 2, 1);
    } else if (f === 'hurt') {
      P.poly([L(7.2, -6.2), L(9.6, -6.0), L(9.4, -8.2), L(7.6, -7.8)], pal.skin, g + 1, { color: C_MOUTHIN });
    } else {
      P.line(L(6.6, -6.6), L(9.5, -6.5), C_LIP, g + 1, 1, true);
      P.dot(L(6.4, -6.2), C_LIP, g + 1, true);
    }
    // spiky hair
    const hair = HAIR.map(H);
    const hc = L(-1, 8);
    P.poly(hair, pal.hair, g + 4, { sphere: [hc[0], hc[1], 16] });
    const sl = U.pack(...pal.hair.tones[3]);
    for (const h of HAIR_LINES) P.line(H([h[0], h[1], 0.1]), H([h[2], h[3], 0.6]), sl, g + 4, 1, true);
  }

  Art.sukuna = {
    id: 'sukuna',
    name: 'SUKUNA',
    full: 'RYOMEN SUKUNA',
    dims: Object.assign({}, Rig.DIMS, { ua: 24.5, fa: 21.5, thigh: 35.5, shin: 34.5, abd: 19, chest: 25, shN: -6, shF: 6 }),
    palettes: PAL,
    outline: [16, 6, 10],
    draw(r, J, xf, vis) {
      const P = Rig.painter(r, xf);
      const pal = PAL[vis.pal || 0];
      const sec = vis.sec;
      drawArm(P, J, true, pal, vis, 1);
      drawSashTails(P, J, pal, sec, 6);
      drawLeg(P, J, true, pal, 8);
      drawTorso(P, J, pal, vis, sec, 15);
      drawLeg(P, J, false, pal, 19);
      drawHead(P, J, pal, vis, sec, 27);
      drawArm(P, J, false, pal, vis, 36);
    },
  };
})();
