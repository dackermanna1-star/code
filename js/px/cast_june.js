/* June Brennan, 14 forever. Gus's big sister: a dark bob with blunt bangs, a
 * yellow knit sweater gone greyish, a cassette-recorder strap across her
 * chest, and Gus's smile (same skin, the same face). 'june_ghost' is the same
 * drawing, faded and cold: skin_ghost, desaturated ramps, no warm blush, and
 * she dissolves toward the bottom of the frame. */
(function () {
  'use strict';
  const P = PX.P, RIG = PX.RIG;
  PX.ramp('knit_yellow', ['#2f2210', '#583f1a', '#83622c', '#ae8a40', '#d1ae5c', '#ecd18d']);
  PX.ramp('strap_webbing', ['#120e14', '#211b24', '#322a36', '#453a4a', '#5a4d60', '#706277']);
  // the ghost's cold, washed-out versions
  PX.ramp('hair_ghost', ['#0d1116', '#192028', '#262f39', '#36414d', '#4a5664', '#626f7e']);
  PX.ramp('eye_ghost', ['#18212a', '#2c3843', '#475663', '#687b88', '#93a5b0', '#c3d0d6']);
  PX.ramp('lip_ghost', ['#262838', '#40465a', '#5d667c', '#7f8b9e', '#a3afbf', '#c8d2de']);
  PX.ramp('knit_ghost', ['#1f2328', '#373d44', '#555c62', '#767c80', '#989d9e', '#bbbfbc']);
  PX.ramp('strap_ghost', ['#0c0f14', '#171c23', '#232a33', '#323b46', '#45505c', '#5b6774']);
  PX.ramp('blush_ghost', ['#6f7f9c', '#7f8fab', '#8f9fba', '#a0afc7', '#b3c0d4', '#c8d3e2']);

  function june(id, pal) {
    PX.person(id, {
      name: id,
      skin: pal.skin, hair: pal.hair, eyes: pal.eyes, lips: pal.lips,
      lashes: true, browThick: 2,
      head: { l: 36, r: 82, top: 22, eyeY: 42, chinY: 72, chinX: 56, jaw: 0, cheek: 0.5, nearEye: [59, 11], farEye: [41, 8], browY: 37.5, noseX: 53, noseY: 49, mouthX: 55, mouthY: 62, ear: [80, 44], neck: 8.5 },
      faceBumps: [[66, 54, 3.5, 2.5, 0.5], [45, 54, 2.5, 2.5, 0.4]],
      portraitBox: [20, 4, 76, 76],
      back(B, c) {
        const r = c.hr;
        // the back of the bob, cut blunt at the jaw
        B.shape([[38, 12], [54, 3], [74, 3], [89, 10], [97, 24], [99, 42], [99, 60], [97, 70], [90, 72], [80, 72], [74, 60], [56, 40], [36, 32]], r, { kind: 'hair', round: 9, name: 'hair:back', tone: -1 });
      },
      body(B, c) {
        const kn = P[pal.knit];
        B.tube([[27, 108], [20, 142], [17, 176]], [12.5, 12, 11.5], kn, { name: 'body:farArm', tone: -1, kind: 'soft' });
        c.torso = B.shape([[50, 86], [37, 90], [26, 97], [21, 115], [21, 176], [99, 176], [99, 115], [95, 97], [84, 90], [70, 86]], kn, { round: 12, name: 'body:torso', kind: 'soft' });
        B.crease(c.torso, [[30, 136], [38, 150], [44, 156]], 1.1, 1.2);
        B.crease(c.torso, [[90, 134], [83, 150], [77, 154]], 1.1, 1.2);
        c.arm2 = B.tube([[93, 104], [100, 142], [103, 176]], [13, 12.5, 12], kn, { name: 'body:nearArm', kind: 'soft' });
        B.crease(c.arm2, [[85, 98], [92, 94], [99, 99]], 1.1, 1);
        B.crease(c.arm2, [[96, 126], [101, 131], [105, 129]], 1.2, 1);
        // the cassette recorder hanging at her hip, and its strap over her shoulder
        B.shape([[15, 160], [33, 156], [37, 176], [17, 176]], P[pal.box], { kind: 'metal', round: 2.5, name: 'body:recorder' });
        c.strap = B.tube([[80, 86], [84, 92], [70, 112], [50, 136], [32, 160], [26, 170]], 1.7, P[pal.strap], { kind: 'cloth', name: 'body:strap' });
      },
      collar(B, c) {
        const kn = P[pal.knit];
        // ribbed crew neck
        B.tube([[46, 85], [52, 89.5], [60, 91], [68, 89.5], [74, 85]], 2.1, kn, { kind: 'soft', name: 'collar:rib', tone: -1 });
      },
      front(B, c) {
        const r = c.hr;
        // crown and heavy blunt bangs, cut straight above the brows
        B.shape([[34, 42], [33, 26], [37, 14], [47, 6], [61, 2], [76, 4], [88, 11], [95, 23], [96, 38], [93, 46], [89, 38], [83, 30], [74, 26], [62, 24], [50, 25], [42, 30], [37, 42]], r, { kind: 'hair', round: 9, name: 'hair:crown' });
        c.bangs = B.shape([[37, 31], [38, 20], [45, 11], [57, 6.5], [70, 7.5], [80, 13], [84, 21], [84, 28.5], [78, 29.5], [70, 30.5], [62, 31], [54, 31.5], [46, 31.5], [40, 31.5]], r, { kind: 'hair', round: 6, name: 'hair:bangs' });
        for (const x of [44, 50, 56, 62, 68, 74, 79]) B.crease(c.bangs, [[x + 2, 13], [x, 31]], 0.9, 0.7);
        // the sides fall straight to the jaw and stop, cut blunt
        const far = B.shape([[41, 24], [36, 31], [34, 46], [34, 62], [35, 71], [44, 71], [42, 60], [41, 46], [42, 34]], r, { kind: 'hair', round: 4, name: 'hair:far' });
        B.crease(far, [[39, 34], [38, 50], [38, 68]], 0.9, 0.7);
        const near = B.shape([[81, 22], [88, 29], [91, 42], [92, 58], [92, 71], [80, 71], [82, 60], [83, 46], [82, 32]], r, { kind: 'hair', round: 4, name: 'hair:near' });
        B.crease(near, [[87, 34], [88, 50], [87, 68]], 0.9, 0.7);
        B.shape([[90, 28], [96, 38], [98, 54], [98, 71], [91, 71], [92, 56], [91, 40]], r, { kind: 'hair', round: 4, name: 'hair:near2', tone: -1 });
      },
      details(s, c) {
        const kn = P[pal.knit], h = c.h;
        // knit: ribbed columns, and a rib on the crew neck
        for (let y = 92; y < 176; y++) for (let x = 0; x < 118; x++) {
          const v = s.get(x, y); if (!v || ((v & 0x7ff0) >> 4) !== kn.id || (v & 15) < 2) continue;
          if (x % 4 === 0 && (y % 4) !== 0 && (v & 15) >= 3) RIG.over(s, x, y, kn, -1);
        }
        for (let x = 46; x < 75; x += 2) { const y = x < 60 ? 87 + Math.round((x - 46) * 0.25) : 87 + Math.round((74 - x) * 0.25); RIG.over(s, x, y, kn, -1); }
        // strap adjuster buckle
        s.rect(57, 122, 4, 3, P[pal.metal][3]); s.px(57, 122, P[pal.metal][5]); s.hline(57, 60, 124, P[pal.metal][1]);
        // recorder buttons
        [[21, 162], [24, 161], [27, 160]].forEach(([x, y]) => { s.px(x, y, P[pal.metal][5]); s.px(x, y + 1, P[pal.metal][2]); });
        s.rect(22, 166, 9, 4, P[pal.metal][2]); s.hline(22, 30, 166, P[pal.metal][4]); s.px(24, 168, P[pal.box][0]); s.px(28, 168, P[pal.box][0]);
      },
      decal: pal.ghost ? function (s) {
        // cold, not warm: the rig's blush and mouth colors are remapped, then she fades out downward
        const map = {};
        P.blush.forEach((code, k) => { map[code] = P.blush_ghost[k]; });
        P.lip.forEach((code, k) => { map[code] = P.lip_ghost[k]; });
        s.recolor(map);
        for (let y = 118; y < s.h; y++) {
          const t = Math.min(1, (y - 118) / 58) * 0.9;
          for (let x = 0; x < s.w; x++) if (PX.bayer(x, y) < t) s.d[y * s.w + x] = 0;
        }
      } : undefined
    });
  }

  june('june', { skin: 'skin_peach', hair: 'hair_dark', eyes: 'eye_green', lips: 'lip', knit: 'knit_yellow', strap: 'strap_webbing', metal: 'metal', box: 'black_cloth' });
  june('june_ghost', { skin: 'skin_ghost', hair: 'hair_ghost', eyes: 'eye_ghost', lips: 'lip_ghost', knit: 'knit_ghost', strap: 'strap_ghost', metal: 'stone', box: 'strap_ghost', ghost: true });
})();
