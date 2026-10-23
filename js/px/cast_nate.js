/* Nate Fortier — 23, behind the counter at Low Tide Records; his band the
 * Static Hours plays "Girl in the Static". Kind, heartbreakable. Long brown
 * hair under a rust knit beanie (tucked behind the near ear so the silver
 * hoop shows), a goatee; an open green flannel over a faded band tee. */
(function () {
  'use strict';
  const P = PX.P, RIG = PX.RIG;
  PX.ramp('skin_olive', ['#3a1f24', '#6a3e35', '#956246', '#b9895f', '#d6ae80', '#ecd1a6']);
  PX.ramp('knit_rust', ['#2c0f0c', '#511c14', '#7c2e1c', '#a44628', '#c66638', '#e08d55']);
  PX.ramp('flannel_green', ['#0f1d17', '#1b3326', '#2a4b36', '#3b6548', '#54825d', '#77a079']);
  PX.ramp('plaid_ink', ['#090c12', '#10151e', '#19202b', '#232c39', '#303b4a', '#3f4c5c']);
  PX.ramp('tee_char', ['#121116', '#1c1a21', '#27242d', '#34303b', '#433e4b', '#57515f']);

  const FONT = {
    S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], A: ['.#.', '#.#', '###', '#.#', '#.#'],
    I: ['###', '.#.', '.#.', '.#.', '###'], C: ['.##', '#..', '#..', '#..', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
    O: ['.#.', '#.#', '#.#', '#.#', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'], R: ['##.', '#.#', '##.', '#.#', '#.#']
  };
  const PRINT = { x: 60, y: 112 };   // centre of the band print (unflipped)

  PX.person('nate', {
    name: 'nate',
    skin: 'skin_olive', hair: 'hair_mid', eyes: 'eye_brown',
    lashes: false, nose: 'long', browThick: 2,
    head: {
      l: 36, r: 82, top: 27, eyeY: 44, browY: 39, chinY: 78, chinX: 55, jaw: 1.5,
      nearEye: [59, 10], farEye: [41, 8], noseX: 52, noseY: 50, mouthX: 55, mouthY: 65, ear: [80, 46], neck: 9.5
    },
    faceBumps: [[70, 60, 3.5, 3, -0.5]],
    back(B, c) {
      const r = c.hr;
      // long hair hanging behind the shoulders; the near side tucked behind the ear
      B.shape([[30, 22], [44, 8], [62, 5], [80, 7], [93, 16], [99, 30], [101, 52], [103, 76], [103, 98], [96, 104], [88, 98], [80, 90], [44, 88], [34, 98], [24, 100], [22, 76], [24, 48], [26, 30]], r, { kind: 'hair', round: 9, name: 'hair:back', tone: -1 });
      B.lock([[90, 36], [95, 58], [98, 82], [99, 103]], [13, 13, 11, 5], r, { name: 'hair:b1', tone: -1, line: 2 });
    },
    body(B, c) {
      const fl = P.flannel_green;
      c.farArm = B.tube([[26, 108], [19, 140], [16, 176]], [13, 12.5, 12], fl, { name: 'body:farArm', tone: -1 });
      c.torso = B.shape([[47, 87], [34, 92], [23, 100], [20, 116], [20, 176], [100, 176], [102, 116], [99, 99], [88, 91], [72, 87]], fl, { round: 12, name: 'body:torso' });
      c.tee = B.shape([[48, 92], [55, 96], [62, 97], [69, 95], [74, 91], [76, 120], [77, 176], [45, 176], [45, 120]], P.tee_char, { round: 8, name: 'body:tee' });
      B.crease(c.tee, [[58, 132], [61, 150], [59, 168]], 1.2, 1.2);
      const f1 = B.shape([[49, 91], [38, 93], [25, 100], [22, 118], [24, 176], [49, 176], [48, 140], [47, 112], [46, 100]], fl, { round: 7, name: 'body:front1' });
      const f2 = B.shape([[73, 89], [84, 91], [96, 98], [99, 118], [96, 176], [75, 176], [75, 140], [76, 112], [75, 100]], fl, { round: 7, name: 'body:front2' });
      B.crease(f1, [[30, 140], [38, 152], [44, 154]], 1.3, 1.1);
      B.crease(f2, [[92, 138], [84, 150], [79, 152]], 1.3, 1.1);
      c.nearArm = B.tube([[95, 104], [102, 140], [104, 176]], [13.5, 13, 12], fl, { name: 'body:nearArm' });
      B.crease(c.nearArm, [[89, 106], [93, 101], [99, 99]], 1.0, 0.9);
      B.crease(c.nearArm, [[90, 124], [94, 142], [96, 160]], 1.3, 1.1);
    },
    collar(B, c) {
      const fl = P.flannel_green;
      B.shape([[44, 84], [52, 88], [54, 98], [47, 102], [38, 96]], fl, { round: 3, name: 'collar:1' });
      B.shape([[70, 84], [79, 83], [86, 92], [79, 99], [71, 94]], fl, { round: 3, name: 'collar:2' });
    },
    front(B, c) {
      const r = c.hr;
      // hair framing the face below the beanie's cuff; the far side falls over the shoulder
      const soft = { line: 2 };
      B.lock([[40, 27], [35, 42], [34, 60], [34, 80], [36, 102], [38, 122]], [11, 11, 11, 10, 8, 3], r, Object.assign({ name: 'hair:f1' }, soft));
      B.lock([[45, 28], [41, 38], [39, 49]], [7, 6, 3], r, Object.assign({ name: 'hair:f2', tone: 1 }, soft));
      B.lock([[30, 66], [28, 88], [30, 110]], [8, 8, 3], r, Object.assign({ name: 'hair:f3', tone: -1 }, soft));
      B.lock([[75, 28], [79, 34], [83, 41]], [7, 6, 3], r, Object.assign({ name: 'hair:f5' }, soft));
      // goatee: a thin mustache over the lip, and a chin beard below it
      const g = { kind: 'hair', line: 2 };
      B.shape([[49, 62.3], [52, 60.6], [55.5, 60.3], [59, 60.6], [62, 62.2], [61, 63.4], [55.5, 62.7], [50, 63.5]], r, Object.assign({ round: 1.5, name: 'hair:stache' }, g));
      B.shape([[52, 68.6], [55.5, 68.2], [59.5, 68.8], [61, 72.5], [58.5, 78.6], [55, 80.6], [51.8, 78.6], [50.2, 72.5]], r, Object.assign({ round: 2.5, name: 'hair:goatee' }, g));
    },
    extras(B, c) {
      const k = P.knit_rust;
      // knit beanie: dome and folded cuff
      B.shape([[31, 25], [31, 14], [37, 6], [48, 1.5], [62, 0.5], [76, 2], [87, 8], [94, 16], [96, 25], [86, 22], [70, 21], [52, 22], [38, 25]], k, { kind: 'soft', round: 9, name: 'hat:dome' });
      B.shape([[30, 22], [44, 21], [60, 21.5], [76, 20], [92, 19.5], [97.5, 22], [97.5, 29], [88, 28.5], [72, 30], [58, 31.5], [44, 31], [30.5, 31]], k, { kind: 'soft', round: 4, name: 'hat:cuff' });
    },
    details(s, c) {
      const h = c.h, k = P.knit_rust, fl = P.flannel_green, W = s.w;
      const rampOf = (x, y) => (s.get(x, y) & 0x7ff0) >> 4;
      // knit ribs: tight on the folded cuff, softer up the dome
      for (let y = 18; y < 33; y++) for (let x = 28; x < 100; x++) if (rampOf(x, y) === k.id && (s.get(x, y) & 15) > 0 && x % 2 === 0) RIG.over(s, x, y, k, -1);
      for (let y = 2; y < 22; y++) for (let x = 30; x < 98; x++) if (rampOf(x, y) === k.id && (s.get(x, y) & 15) >= 3 && Math.round(x + (x - 63) * (21 - y) * 0.02) % 3 === 0) RIG.over(s, x, y, k, -1);
      // thicker brows
      const b = c.ex.brow, [nx, nw] = h.nearEye, [fx, fw] = h.farEye, hr = c.hr;
      RIG.brow(s, nx, nx + nw, h.browY - 1, b[0] + (b[2] || 0), b[1], hr[1], hr[1], 1);
      RIG.brow(s, fx + fw - 2, fx - 1, h.browY - 1, b[0], b[1], hr[1], hr[1], 1);
      // plaid: dark bands and a thin faded line over the green, following the folds
      for (let y = 80; y < 176; y++) for (let x = 0; x < W; x++) {
        if (rampOf(x, y) !== fl.id) continue;
        const v = s.get(x, y), sh = v & 15; if (sh === 0) continue;
        const bx = (x + 3) % 14, by = (y + 2) % 14, dv = bx < 5, dh = by < 5;
        if (dv && dh) s.px(x, y, P.plaid_ink[Math.max(1, sh - 1)]);
        else if (dv || dh) s.px(x, y, P.plaid_ink[Math.min(5, sh + 1)]);
        else if ((bx === 9 || by === 9) && sh >= 2) s.px(x, y, P.flannel_green[Math.min(5, sh + 1)]);
      }
      // the band print: a static waveform (the words are a decal)
      const { x: px0, y: py0 } = PRINT;
      for (let i = -10; i <= 10; i++) { const y = py0 - 7 + [0, -2, 1, -3, 2, -1, 0][(i + 10) % 7]; if (rampOf(px0 + i, y) === P.tee_char.id) RIG.over(s, px0 + i, y, P.cream, 0); }
      // one silver hoop in the near ear
      const [ex, ey] = h.ear;
      s.px(ex + 3, ey + 14, P.chrome[4]); s.px(ex + 2, ey + 15, P.chrome[3]); s.px(ex + 2, ey + 16, P.chrome[2]); s.px(ex + 3, ey + 17, P.chrome[2]); s.px(ex + 4, ey + 16, P.chrome[3]); s.px(ex + 4, ey + 15, P.chrome[5]);
    },
    decal(s, o) {
      const cx = o.flip ? PX.SW - 1 - PRINT.x : PRINT.x;
      const write = (word, y0) => {
        const x0 = Math.round(cx) - Math.floor((word.length * 4 - 1) / 2);
        for (let i = 0; i < word.length; i++) {
          const g = FONT[word[i]];
          for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) {
            if (g[r][k] !== '#') continue;
            const x = x0 + i * 4 + k, y = y0 + r, v = s.get(x, y);
            if (((v & 0x7ff0) >> 4) === P.tee_char.id) s.px(x, y, P.cream[Math.min(4, (v & 15) + 1)]);
          }
        }
      };
      write('STATIC', PRINT.y - 2);
      write('HOURS', PRINT.y + 5);
    },
    portraitBox: [20, 8, 76, 76]
  });
})();
