/* Gus — Augusta Brennan, 14. Messy dark-brown hair with a side-swept fringe,
 * freckles, grey-green eyes; olive army jacket open over a maroon tee with a
 * faded cassette print; black Walkman headphones around her neck. */
(function () {
  'use strict';
  const P = PX.P, RIG = PX.RIG;

  PX.person('gus', {
    name: 'gus',
    skin: 'skin_peach', hair: 'hair_brown', eyes: 'eye_green', lips: 'lip',
    freckles: true, lashes: true,
    back(B, c) {
      const r = c.hr;
      B.shape([[38, 8], [58, 1], [80, 5], [94, 16], [100, 32], [101, 52], [100, 72], [101, 90], [95, 88], [91, 94], [85, 88], [79, 92], [72, 89], [48, 89], [42, 94], [36, 88], [30, 92], [25, 82], [24, 62], [25, 40], [29, 22]], r, { kind: 'hair', round: 10, name: 'hair:back', tone: -1 });
      B.lock([[94, 30], [97, 48], [98, 66], [99, 88]], [12, 10, 8, 5], r, { name: 'hair:b1', tone: -1 });
      B.lock([[28, 46], [26, 62], [27, 78], [30, 91]], [10, 9, 7, 4], r, { name: 'hair:b2', tone: -1 });
    },
    body(B, c) {
      const ol = P.olive, mr = P.maroon;
      // headphone band looping behind the neck (the neck and torso hide most of it)
      B.tube([[44, 94], [41, 86], [44, 78], [52, 74], [60, 73], [68, 74], [76, 79], [79, 87], [77, 94]], 1.3, P.chrome, { kind: 'metal', name: 'hp:band' });
      B.tube([[26, 108], [19, 142], [16, 176]], [13, 12, 11], ol, { name: 'body:farArm', tone: -1 });
      B.shape([[48, 86], [34, 91], [22, 99], [18, 118], [20, 176], [100, 176], [102, 118], [99, 98], [88, 90], [72, 86]], ol, { round: 12, name: 'body:torso' });
      c.tee = B.shape([[49, 92], [55, 96], [61, 97], [67, 95], [73, 91], [76, 120], [78, 176], [46, 176], [46, 120]], mr, { round: 8, name: 'body:tee' });
      B.crease(c.tee, [[58, 128], [61, 146], [59, 166]], 1.2, 1.2);
      const f1 = B.shape([[50, 91], [38, 93], [24, 100], [21, 118], [24, 176], [50, 176], [50, 140], [48, 112], [46, 100]], ol, { round: 7, name: 'body:front1' });
      const f2 = B.shape([[72, 89], [84, 91], [96, 98], [99, 118], [96, 176], [74, 176], [74, 140], [75, 112], [74, 100]], ol, { round: 7, name: 'body:front2' });
      B.crease(f1, [[30, 138], [38, 150], [44, 152]], 1.3, 1.1);
      B.crease(f2, [[92, 136], [84, 150], [78, 152]], 1.3, 1.1);
      c.arm2 = B.tube([[94, 104], [102, 142], [104, 176]], [14, 13, 12], ol, { name: 'body:nearArm' });
      B.crease(c.arm2, [[98, 128], [103, 132], [106, 130]], 1.4, 1);
    },
    collar(B, c) {
      const ol = P.olive;
      B.shape([[43, 84], [52, 87], [54, 95], [48, 100], [37, 95]], ol, { round: 3, name: 'collar:1' });
      B.shape([[70, 84], [79, 82], [85, 91], [78, 97], [71, 93]], ol, { round: 3, name: 'collar:2' });
      B.ellipse(45.5, 95.5, 5, 4.5, P.black_cloth, { kind: 'metal', name: 'collar:hp1', gloss: 18 });
      B.ellipse(77, 94.5, 5.5, 5, P.black_cloth, { kind: 'metal', name: 'collar:hp2', gloss: 18 });
    },
    front(B, c) {
      const r = c.hr;
      B.shape([[30, 40], [29, 26], [34, 14], [46, 5], [60, 1], [75, 3], [87, 10], [95, 20], [96, 34], [91, 40], [88, 30], [82, 22], [72, 18], [58, 18], [46, 22], [38, 30], [33, 40]], r, { kind: 'hair', round: 9, name: 'hair:crown' });
      B.lock([[52, 9], [45, 16], [40, 25], [37, 35]], 12, r, { name: 'hair:l1' });
      B.lock([[83, 12], [81, 20], [78, 27], [76, 32]], 9, r, { name: 'hair:l2', tone: -1 });
      B.lock([[76, 10], [71, 17], [66, 24], [62, 32]], 12, r, { name: 'hair:l3' });
      B.lock([[68, 8], [61, 15], [54, 22], [49, 28], [45, 34]], 14, r, { name: 'hair:l4' });
      B.lock([[37, 28], [34, 40], [34, 52], [35, 64], [33, 75]], 9, r, { name: 'hair:l5' });
    },
    details(s, c) {
      const ol = P.olive, mr = P.maroon;
      // faded cassette print on the tee
      const x0 = 54, y0 = 116;
      const box = (x, y, w, h, d) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) RIG.over(s, xx, yy, mr, d); };
      for (let xx = x0; xx < x0 + 15; xx++) { RIG.over(s, xx, y0, mr, 1); RIG.over(s, xx, y0 + 9, mr, 1); }
      for (let yy = y0; yy < y0 + 10; yy++) { RIG.over(s, x0, yy, mr, 1); RIG.over(s, x0 + 14, yy, mr, 1); }
      box(x0 + 3, y0 + 2, 9, 3, 1);
      RIG.over(s, x0 + 5, y0 + 3, mr, -1); RIG.over(s, x0 + 9, y0 + 3, mr, -1);
      for (let xx = x0 + 3; xx < x0 + 12; xx++) RIG.over(s, xx, y0 + 7, mr, 1);
      // chest pocket flaps and buttons
      const flap = (x, y, w) => {
        for (let xx = x; xx < x + w; xx++) { RIG.over(s, xx, y, ol, 1); RIG.over(s, xx, y + 5, ol, -2); RIG.over(s, xx, y + 16, ol, -2); }
        for (let yy = y; yy <= y + 16; yy++) { RIG.over(s, x, yy, ol, -1); RIG.over(s, x + w - 1, yy, ol, -2); }
        s.px(x + (w >> 1), y + 3, P.metal[4]); s.px(x + (w >> 1), y + 4, P.metal[1]);
      };
      flap(27, 116, 17); flap(79, 114, 16);
      // shoulder strap buttons
      s.px(40, 99, P.metal[4]); s.px(84, 97, P.metal[3]);
      // cord from the near cup down into the pocket
      s.path([[79, 99], [81, 106], [84, 113]], P.ink[2]);
    }
  });
})();
