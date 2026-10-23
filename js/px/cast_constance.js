/* Constance Ashgrove — 48, president of the Lantern Society, Sloane and
 * Cal's mother: "Sloane in 34 years". Gracious, cold, certain. Sloane's honey
 * hair and blue eyes, her arched brows; a sleek chignon, pearls, red
 * lipstick, a camel coat with a brass lantern pin. */
(function () {
  'use strict';
  const P = PX.P, RIG = PX.RIG;
  PX.ramp('pin_brass', ['#3a2508', '#6b4a12', '#9c751f', '#c9a032', '#e8c75a', '#fbeaa0']);
  PX.ramp('silk_cream', ['#463a32', '#77665a', '#a5917f', '#c9b7a3', '#e4d6c4', '#f7efe4']);
  PX.ramp('pearl', ['#5a5260', '#8f8696', '#bab2bf', '#d9d3dc', '#efebf0', '#ffffff']);

  PX.person('constance', {
    name: 'constance',
    skin: 'skin_fair', hair: 'hair_honey', eyes: 'eye_blue', lips: 'lip_red',
    lashes: true, browThick: 1, brow: 'hair_honey',
    head: {
      l: 37, r: 82, top: 22, eyeY: 42, browY: 36, chinY: 76, chinX: 56, jaw: -0.6, cheek: 0.6,
      nearEye: [59, 11], farEye: [41, 8], noseX: 53, noseY: 49, mouthX: 55, mouthY: 64, ear: [80, 45], neck: 8
    },
    faceBumps: [[66, 51, 4, 2.5, 0.6], [43, 51, 2.5, 2.5, 0.4]],   // high cheekbones
    back(B, c) {
      const r = c.hr;
      // the back of the head, smooth, and the chignon pinned low at the back
      B.shape([[40, 8], [58, 2], [76, 4], [90, 12], [97, 26], [98, 42], [94, 56], [86, 62], [78, 56], [74, 30]], r, { kind: 'hair', round: 9, name: 'hair:back', tone: -1 });
      B.ellipse(95, 50, 10.5, 11, r, { kind: 'hair', name: 'hair:bun', rz: 9 });
    },
    body(B, c) {
      const cm = P.camel;
      c.farArm = B.tube([[26, 108], [19, 140], [16, 176]], [13.5, 13, 12.5], cm, { name: 'body:farArm', tone: -1 });
      c.torso = B.shape([[48, 86], [33, 89], [21, 96], [19, 114], [20, 176], [100, 176], [101, 114], [99, 95], [88, 88], [71, 85]], cm, { round: 11, name: 'body:torso' });
      c.blouse = B.shape([[50, 88], [56, 93], [64, 93], [70, 88], [70, 110], [62, 132], [56, 132], [50, 110]], P.silk_cream, { round: 6, name: 'body:blouse' });
      // notched lapels
      c.lap1 = B.shape([[49, 86], [38, 90], [31, 98], [38, 104], [34, 108], [52, 138], [57, 138], [51, 114]], cm, { round: 4, name: 'body:lapel1' });
      c.lap2 = B.shape([[71, 85], [83, 89], [89, 97], [82, 103], [87, 107], [67, 138], [62, 138], [69, 114]], cm, { round: 4, name: 'body:lapel2' });
      c.nearArm = B.tube([[96, 104], [102, 140], [105, 176]], [14, 13.5, 13], cm, { name: 'body:nearArm' });
      B.crease(c.nearArm, [[89, 106], [93, 100.5], [100, 98.5]], 1.0, 0.9);
      B.crease(c.nearArm, [[90, 124], [94, 142], [96, 162]], 1.3, 1.1);
      B.crease(c.farArm, [[27, 122], [24, 148]], 1.2, 1.1);
      B.crease(c.torso, [[30, 150], [40, 158], [48, 160]], 1.1, 1.2);
    },
    collar(B, c) {
      // the coat collar standing up behind the neck
      B.shape([[46, 78], [54, 83], [56, 90], [48, 93], [40, 87]], P.camel, { round: 3, name: 'collar:1', tone: -1 });
      B.shape([[70, 77], [81, 78], [87, 87], [78, 91], [69, 86]], P.camel, { round: 3, name: 'collar:2' });
    },
    front(B, c) {
      const r = c.hr;
      // sleek, swept back from a side part into the chignon; a soft wave over the far brow
      B.shape([[31, 40], [30, 26], [36, 13], [48, 5], [64, 3], [79, 7], [89, 15], [94, 27], [92, 38], [86, 32], [82, 25], [74, 21], [62, 20], [52, 22], [43, 26], [36, 33], [34, 40]], r, { kind: 'hair', round: 8, name: 'hair:crown' });
      B.lock([[62, 9], [52, 13], [42, 20], [36, 29], [35, 37]], [10, 11, 10, 7, 3], r, { name: 'hair:wave' });
      B.lock([[66, 8], [76, 12], [84, 20], [88, 30]], [8, 8, 6, 3], r, { name: 'hair:sweep', tone: -1 });
    },
    details(s, c) {
      const h = c.h, sk = c.sk, cm = P.camel, pl = P.pearl, br = P.pin_brass;
      const rampOf = (x, y) => (s.get(x, y) & 0x7ff0) >> 4;
      // arched brows: lift the peak, taper the tail
      const b = c.ex.brow, [nx, nw] = h.nearEye, [fx, fw] = h.farEye, hr = c.hr;
      const lift = b[0] + (b[2] || 0), tilt = b[1];
      const py = h.browY - lift - 2 + Math.round(tilt * 0.4);
      s.px(nx + 5, py, hr[1]); s.px(nx + 6, py, hr[1]); s.px(nx + 7, py, hr[2]);
      s.px(fx + 2, h.browY - b[0] - 2 + Math.round(tilt * 0.4), hr[1]); s.px(fx + 3, h.browY - b[0] - 2 + Math.round(tilt * 0.4), hr[2]);
      // a cool, lidded gaze: the lid rests on the outer lash line
      const st = c.o.blink ? (['happy', 'cry'].includes(c.ex.eye) ? c.ex.eye : 'closed') : c.ex.eye;
      if (st === 'open' || st === 'soft') { s.px(nx + nw - 3, h.eyeY + 1, c.hr[0]); s.px(nx + nw - 2, h.eyeY, sk[3]); s.px(fx + 1, h.eyeY + 1, c.hr[0]); }
      // a strand of pearls on the blouse
      for (let k = 0; k <= 9; k++) {
        const t = k / 9, x = Math.round(49 + 21 * t), y = Math.round(89 + 5 * Math.sin(Math.PI * t));
        s.px(x, y, pl[5]); s.px(x + 1, y, pl[3]); s.px(x, y + 1, pl[3]); s.px(x + 1, y + 1, pl[1]);
      }
      // the chignon's coil
      for (let a = 0; a < 6.6; a += 0.12) {
        if (a > 2.6 && a < 3.4) continue;   // the coil breaks where a strand tucks under
        const rr = 8.5 * (1 - a / 10), x = Math.round(95 + rr * Math.cos(a + 3.6)), y = Math.round(50 + rr * Math.sin(a + 3.6) * 1.05);
        if (rampOf(x, y) === hr.id) RIG.over(s, x, y, hr, -1);
      }
      // fine lines: smile lines on the near side, a crease at the outer eye
      s.line(h.noseX + 6, h.noseY + 10, h.mouthX + 6, h.mouthY + 1, sk[2]);
      if (rampOf(nx + nw + 2, h.eyeY + 5) === sk.id) s.px(nx + nw + 2, h.eyeY + 5, sk[2]);
      // pearl stud
      const [ex, ey] = h.ear;
      s.px(ex + 3, ey + 13, pl[5]); s.px(ex + 4, ey + 13, pl[3]); s.px(ex + 3, ey + 14, pl[3]); s.px(ex + 4, ey + 14, pl[1]);
      // coat buttons and the brass lantern pin on the near lapel
      s.px(60, 152, P.wood_dark[3]); s.px(61, 152, P.wood_dark[2]); s.px(60, 153, P.wood_dark[1]);
      const lx = 79, ly = 101;
      s.px(lx + 1, ly, br[2]);
      s.px(lx, ly + 1, br[3]); s.px(lx + 1, ly + 1, br[5]); s.px(lx + 2, ly + 1, br[3]);
      s.px(lx, ly + 2, br[2]); s.px(lx + 1, ly + 2, br[4]); s.px(lx + 2, ly + 2, br[1]);
      s.px(lx, ly + 3, br[2]); s.px(lx + 1, ly + 3, br[4]); s.px(lx + 2, ly + 3, br[1]);
      s.px(lx, ly + 4, br[3]); s.px(lx + 1, ly + 4, br[3]); s.px(lx + 2, ly + 4, br[1]);
    },
    portraitBox: [20, 6, 76, 76]
  });
})();
