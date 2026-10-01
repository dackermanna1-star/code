// Gojo Satoru — procedural pixel-art painter.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U, Rig = JJK.Rig, Body = JJK.Body;
  const Art = (JJK.Art = JJK.Art || {});

  const PAL = [
    // 0: blindfold / black shirt / grey pants (reference look)
    Body.palette({
      skin: ['#7a4038', '#c4836a', '#efc09e', '#ffe3c9'],
      shirt: ['#06060b', '#111119', '#1e1f2e', '#3a3e58'],
      pants: ['#3e3f52', '#72748a', '#a5a7ba', '#d5d7e4'],
      belt: ['#040407', '#0c0c13', '#181822', '#33354a'],
      shoe: ['#050508', '#101018', '#1d1d29', '#3d3f55'],
      sole: ['#2a2a33', '#3b3b46', '#4c4c58', '#62626f'],
      hair: ['#56618a', '#97a3c6', '#dde3f0', '#ffffff'],
      band: ['#040408', '#0b0b12', '#161722', '#2c2f44'],
    }),
    // 1: Jujutsu High uniform (navy) + round sunglasses
    Body.palette({
      skin: ['#7a4038', '#c4836a', '#efc09e', '#ffe3c9'],
      shirt: ['#0a0c1a', '#161a30', '#262c4c', '#454e7a'],
      pants: ['#0a0c1a', '#161a30', '#262c4c', '#454e7a'],
      belt: ['#040407', '#0c0c13', '#181822', '#33354a'],
      shoe: ['#050508', '#101018', '#1d1d29', '#3d3f55'],
      sole: ['#2a2a33', '#3b3b46', '#4c4c58', '#62626f'],
      hair: ['#56618a', '#97a3c6', '#dde3f0', '#ffffff'],
      band: ['#020203', '#08080c', '#101016', '#3a3d55'],
    }),
  ];
  PAL[1].glasses = true;
  PAL[1].longSleeve = true;

  const C_LINE = U.pack(70, 30, 40);
  const C_MOUTH = U.pack(120, 52, 54);
  const C_HAIRLINE = U.pack(150, 160, 192);
  const C_BANDHI = U.pack(70, 74, 100);
  const C_WHITE = U.pack(250, 252, 255);
  const C_IRIS = U.pack(70, 200, 255);
  const C_IRIS2 = U.pack(20, 110, 230);
  const C_PUPIL = U.pack(10, 30, 80);
  const C_FOLD = U.pack(110, 112, 132);
  const C_SHIRTLINE = U.pack(52, 56, 80);

  // Hair (head-local u forward, v up, w = spring weight for tips).
  const HAIR = [
    [9.6, 4.8, 0], [13.6, 8.6, 0.6], [10.2, 9.8, 0.2], [14.2, 15.4, 0.8], [8.8, 13.6, 0.25],
    [11.2, 21.4, 1.0], [5.2, 16.2, 0.3], [5.0, 25.0, 1.2], [0.6, 17.6, 0.3], [-2.4, 24.6, 1.2],
    [-4.4, 17.2, 0.3], [-9.0, 22.4, 1.1], [-8.6, 15.4, 0.3], [-15.0, 18.6, 1.0], [-11.8, 12.0, 0.3],
    [-17.8, 11.6, 0.9], [-12.6, 7.6, 0.3], [-16.4, 4.4, 0.8], [-12.2, 1.0, 0.3], [-14.4, -4.4, 0.7],
    [-10.4, -3.4, 0.2], [-8.6, -7.6, 0.5], [-6.0, -3.0, 0], [-5.4, 4.2, 0], [-3, 4.8, 0], [4, 5.2, 0],
  ];
  const HAIR_BACK = [
    [-4, 9, 0], [-12, 11, 0.6], [-10.5, 7, 0.2], [-16.5, 6.5, 0.8], [-12.5, 3, 0.2], [-15.5, -2, 0.8],
    [-11.5, -1, 0.2], [-12.5, -6.5, 0.8], [-8.5, -3.5, 0.2], [-6.5, -7, 0.6], [-4.5, -2.5, 0], [-4, 4, 0],
  ];
  const HAIR_LINES = [[2, 7, 4.2, 21], [-2, 7, -2.2, 20.5], [-6, 7, -9.5, 18.5], [6.2, 7, 10.4, 17.5], [-9, 6, -14.5, 15], [8, 6.5, 12, 11]];
  // Fallen hair (blindfold off): soft spikes hang over the forehead and eyes.
  const HAIR_DOWN = [
    [10.6, 0.4, 0.5], [9.4, 3.8, 0.1], [12.0, 6.0, 0.5], [9.8, 9.4, 0.2], [11.4, 13.2, 0.5],
    [6.2, 13.4, 0.2], [5.4, 17.0, 0.6], [1.0, 14.8, 0.2], [-2.0, 17.6, 0.7], [-4.6, 14.0, 0.2],
    [-9.4, 15.6, 0.8], [-9.4, 11.2, 0.2], [-15.0, 10.6, 0.9], [-12.8, 6.2, 0.2], [-17.2, 2.4, 0.9],
    [-13.2, 0.2, 0.3], [-15.4, -5.8, 1.0], [-11.4, -3.8, 0.3], [-10.8, -9.0, 0.9], [-7.4, -4.6, 0.2],
    [-5.6, -1.0, 0], [-5.2, 4.6, 0], [0, 6.6, 0], [2.6, 6.2, 0.1], [3.4, 1.8, 0.5],
    [5.2, 4.6, 0.1], [7.4, 0.8, 0.5], [8.2, 4.4, 0.1],
  ];

  function drawArm(P, J, useN, pal, vis, g) {
    // n* joints = rear arm (drawn behind), f* joints = lead arm (camera side)
    const near = !useN;
    const sh = useN ? J.shN : J.shF, el = useN ? J.elN : J.elF, ha = useN ? J.haN : J.haF;
    const skin = near ? pal.skin : pal.skinF;
    const shirt = near ? pal.shirt : pal.shirtF;
    const shape = useN ? vis.pose.nhs : vis.pose.fhs;
    const ang = useN ? J.hnA : J.hfA;
    P.limb(sh, el, [[0, 6.8, 6.8], [0.45, 6.2, 6.6], [1, 4.6, 4.6]], skin, g, 1);
    if (pal.longSleeve) {
      P.limb(sh, el, [[0, 7.6, 7.6], [1, 5.6, 5.6]], shirt, g + 1, 1);
      P.limb(el, ha, [[0, 5.6, 5.6], [0.8, 4.6, 4.6], [1, 4.4, 4.4]], shirt, g + 2, 1, true, false);
    } else {
      const mid = Body.along(sh, el, 0.5, 0);
      P.limb(sh, mid, [[0, 7.7, 7.7], [1, 7.1, 7.1]], shirt, g + 1, 1, true, false);
      P.limb(el, ha, [[0, 4.9, 4.9], [0.35, 5.3, 5.1], [1, 3.5, 3.5]], skin, g + 2, 1);
    }
    Body.hand(P, ha, ang, shape, skin, g + 3, { lineCol: C_LINE });
  }

  function drawLeg(P, J, useN, pal, g) {
    const near = !useN;
    const hp = useN ? J.hpN : J.hpF, kn = useN ? J.knN : J.knF, an = useN ? J.anN : J.anF;
    const pants = near ? pal.pants : pal.pantsF;
    const fa = useN ? J.ftNA : J.ftFA;
    Body.foot(P, an, fa, near ? pal.shoe : pal.shoeF, g + 3, 'shoe', near ? pal.sole : pal.soleF);
    P.limb(hp, kn, [[0, 11, 11], [0.5, 10, 10.2], [1, 8.4, 8.4]], pants, g, 1);
    P.limb(kn, an, [[0, 8.4, 8.4], [0.45, 9.2, 9.2], [0.85, 8.4, 8.4], [1, 5.2, 5.2]], pants, g + 2, 1, true, false);
    // fabric folds
    const fold = U.pack(...pants.tones[1]);
    P.line(Body.along(hp, kn, 0.45, 2), Body.along(hp, kn, 0.8, -3), fold, g, 1, true);
    P.line(Body.along(kn, an, 0.25, -4), Body.along(kn, an, 0.6, 1), fold, g + 2, 1, true);
    P.line(Body.along(kn, an, 0.62, 3), Body.along(kn, an, 0.85, -2), fold, g + 2, 1, true);
  }

  function drawTorso(P, J, pal, vis, sec, g) {
    const hip = J.hip, waist = J.waist, chest = J.chest;
    // pelvis (pants top)
    P.ell([hip[0] + J.fwd[0] * 0.5, hip[1] - 1], 11.8, 9.4, Math.atan2(waist[1] - hip[1], waist[0] - hip[0]), pal.pants, g);
    // abdomen + chest (shirt)
    P.limb(hip, waist, [[0, 10.4, 10.6], [1, 9.8, 10.4]], pal.shirt, g, -1, false, false);
    P.limb(waist, chest, [[0, 9.8, 10.4], [0.4, 11.4, 12.2], [0.78, 12.4, 12.8], [1, 10.2, 10.4]], pal.shirt, g, -1);
    // pec / abs definition (subtle)
    const up = (t, s) => Body.along(waist, chest, t, -s); // axis up: invert side
    P.line(up(0.52, 11.5), up(0.6, 3), C_SHIRTLINE, g, 1, true);
    P.line(up(0.6, 3), up(0.86, 1.5), C_SHIRTLINE, g, 1, true);
    P.line(up(0.15, 6.5), up(0.4, 7.5), C_SHIRTLINE, g, 1, true);
    // belt
    const b0 = Body.along(hip, waist, 0.18, 0), b1 = Body.along(hip, waist, 0.5, 0);
    P.limb(b0, b1, [[0, 11.4, 11.6], [1, 11, 11.2]], pal.belt, g + 1, -1, false, false);
    P.line(Body.along(hip, waist, 0.34, 11.6 * -1), Body.along(hip, waist, 0.34, 11.4), U.pack(...pal.belt.tones[3]), g + 1, 1, true);
  }

  function drawBeltTails(P, J, pal, sec, g) {
    const knot = Body.along(J.hip, J.waist, 0.3, -9.5);
    const c = sec.cloth;
    Body.strip(P, [knot[0] + 0.5, knot[1]], 15, 2.4, 1.6, [c[1][0] * 0.8 + 1, c[1][1] * 0.6], pal.belt, g, 1);
    Body.strip(P, [knot[0] - 1.5, knot[1]], 12, 2.2, 1.4, [c[2][0] * 0.9 - 1, c[2][1] * 0.6], pal.belt, g, 1);
  }

  function drawHead(P, J, pal, vis, sec, g) {
    const C = J.head;
    const a = -J.headAng;
    const L = (u, v) => P.loc(C, a, u, v);
    const pose = vis.pose;
    const eyesOpen = pose.eyes === 'open' || vis.eyesOpen;
    const lift = vis.hairLift || 0;
    const H = (q) => L(q[0] + sec.hx * q[2] * 1.4, q[1] + sec.hy * q[2] * 1.2 + lift * q[2]);
    // back hair (behind head & neck)
    if (!eyesOpen) P.poly(HAIR_BACK.map(H), pal.hairF, g - 3, { sphere: [L(-8, 2)[0], L(-8, 2)[1], 12] });
    // neck
    P.limb(J.neck, L(-1.5, -5), [[0, 4.6, 4.8], [1, 4.4, 4.4]], pal.skin, g - 1, -1);
    Body.head(P, L, a, pal.skin, g, C_LINE, 0);
    // mouth
    const face2 = pose.face;
    if (face2 === 'shout' || face2 === 'hurt') {
      P.poly([L(7.8, -6.2), L(9.8, -6.0), L(9.6, -8.6), L(8.0, -8.4)], pal.skin, g + 1, { color: C_PUPIL });
      P.line(L(8.0, -6.3), L(9.6, -6.2), C_WHITE, g + 1, 1, true);
    } else if (face2 === 'grin' || face2 === 'smirk') {
      P.line(L(7.2, -7.4), L(9.4, -6.6), C_MOUTH, g + 1, 1, true);
    } else {
      P.line(L(7.4, -7.0), L(9.4, -6.9), C_MOUTH, g + 1, 1, true);
    }
    // eyes (blindfold / glasses are drawn after the hair)
    if (eyesOpen) {
      P.poly([L(3.6, 2.6), L(7.6, 2.8), L(7.5, 0.0), L(3.9, 0.3)], pal.skin, g + 1, { color: C_WHITE });
      P.poly([L(5.0, 2.6), L(7.4, 2.7), L(7.3, 0.0), L(5.1, 0.1)], pal.skin, g + 2, { color: C_IRIS2 });
      P.dot(L(5.9, 1.9), C_IRIS, g + 2);
      P.dot(L(6.4, 0.9), C_PUPIL, g + 2);
      P.dot(L(5.4, 2.2), C_WHITE, g + 2);
      P.line(L(3.2, 3.0), L(8.2, 3.4), C_WHITE, g + 2, 1);
      P.line(L(8.0, 3.4), L(9.6, 4.6), C_WHITE, g + 2, 1);
      P.line(L(4.2, -0.2), L(7.2, -0.3), U.pack(...pal.skin.tones[1]), g + 1, 1);
    }
    // hair
    const hair = (eyesOpen ? HAIR_DOWN : HAIR).map(H);
    const hc = L(-1, 9);
    P.poly(hair, pal.hair, g + 4, { sphere: [hc[0], hc[1], 17] });
    const sl = C_HAIRLINE;
    if (!eyesOpen) {
      for (const h of HAIR_LINES) P.line(H([h[0], h[1], 0.1]), H([h[2], h[3], 0.6]), sl, g + 4, 1, true);
      P.line(H([-1, 13, 0.2]), H([1.4, 19, 0.6]), C_WHITE, g + 4, 1, true);
    } else {
      P.line(L(2, 11), L(6, 4), sl, g + 4, 1, true);
      P.line(L(-4, 11), L(-6.4, 3), sl, g + 4, 1, true);
      P.line(L(-9, 6), L(-11.6, -1), sl, g + 4, 1, true);
    }
    if (!eyesOpen && pal.glasses) {
      P.ell(L(7.6, 1.0), 3.4, 2.9, a, pal.band, g + 6);
      P.line(L(-6, 1.8), L(4.4, 1.8), U.pack(30, 30, 40), g + 6, 1);
      P.dot(L(6.6, 2.0), C_BANDHI, g + 6);
    } else if (!eyesOpen) {
      const band = [[-11.2, 5.0], [9.6, 5.2], [10.4, 0.0], [9.2, -0.8], [-11.0, -0.4]].map((q) => L(q[0], q[1]));
      P.poly(band, pal.band, g + 6, { sphere: [L(0, 2.5)[0], L(0, 2.5)[1], 12] });
      P.line(L(-9.5, 4.2), L(9.0, 4.4), C_BANDHI, g + 6, 1, true);
      const hx = sec.hx * 0.6, hy = sec.hy * 0.6;
      P.poly([L(-10.6, 3.6), L(-16.5 + hx, -0.4 + hy), L(-15.6 + hx, -3.4 + hy), L(-10.4, 0.6)], pal.band, g + 6, { n: [0, 0, 1] });
    }
  }

  Art.gojo = {
    id: 'gojo',
    name: 'GOJO',
    full: 'SATORU GOJO',
    dims: Object.assign({}, Rig.DIMS, { ua: 24, fa: 21, thigh: 37, shin: 36, abd: 19, chest: 24 }),
    palettes: PAL,
    outline: [14, 10, 26],
    draw(r, J, xf, vis) {
      const P = Rig.painter(r, xf);
      const pal = PAL[vis.pal || 0];
      const sec = vis.sec;
      drawArm(P, J, true, pal, vis, 1);
      drawLeg(P, J, true, pal, 6);
      drawTorso(P, J, pal, vis, sec, 12);
      drawLeg(P, J, false, pal, 16);
      drawBeltTails(P, J, pal, sec, 22);
      drawHead(P, J, pal, vis, sec, 25);
      drawArm(P, J, false, pal, vis, 34);
    },
  };
})();
