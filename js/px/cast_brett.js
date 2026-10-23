/* Brett Lindqvist, 17. Golden-boy quarterback: square jaw with a cleft chin,
 * swept-back sandy hair, an easy, smug look; a maroon-and-cream Derry High
 * letterman jacket (the chest "D" is a decal so it never mirrors). */
(function () {
  'use strict';
  const P = PX.P, RIG = PX.RIG;
  PX.ramp('hair_sandy', ['#30231a', '#5a4229', '#86663f', '#ad8c5a', '#cdae7c', '#e8d4a8']);

  /* the chenille "D": fill rows (7 × 9); the outline is grown around it */
  const D = ['#####..', '##..##.', '##...##', '##...##', '##...##', '##...##', '##...##', '##..##.', '#####..'];

  PX.person('brett', {
    name: 'brett',
    skin: 'skin_peach', hair: 'hair_sandy', eyes: 'eye_blue', lips: 'lip',
    lashes: false, nose: 'long', browThick: 2, brow: 'hair_sandy',
    head: { l: 36, r: 82, top: 20, eyeY: 38, chinY: 72, chinX: 57, jaw: 2, cheek: 0.5, nearEye: [58, 10], farEye: [41, 8], browY: 33, noseX: 52, noseY: 44, mouthX: 56, mouthY: 59, ear: [79, 40], neck: 10 },
    faceBumps: [[67, 46, 4, 2.5, 1.0], [44, 46, 3, 2.5, 0.8], [57, 68, 3.5, 2, 0.8], [49, 31, 4, 1.5, 0.5], [66, 31, 4, 1.5, 0.6], [72, 56, 3, 3.5, -0.6], [45, 55, 2.5, 3, -0.4]],
    portraitBox: [20, 0, 76, 76],
    back(B, c) {
      const r = c.hr;
      // short at the back and sides
      B.shape([[40, 14], [54, 7], [72, 6], [85, 12], [91, 22], [92, 36], [89, 46], [84, 50], [79, 47], [72, 38], [52, 30], [38, 28]], r, { kind: 'hair', round: 8, name: 'hair:back', tone: -1 });
    },
    body(B, c) {
      const mr = P.maroon, cr = P.cream;
      B.tube([[25, 104], [17, 140], [14, 176]], [13, 12.5, 12], cr, { name: 'body:farArm', tone: -1, gloss: 18 });
      c.torso = B.shape([[50, 81], [34, 85], [21, 93], [16, 111], [16, 176], [102, 176], [102, 111], [97, 92], [84, 85], [70, 81]], mr, { round: 12, name: 'body:torso', tone: -1 });
      B.shape([[50, 81], [70, 81], [66, 93], [60, 99], [54, 93]], P.white_cloth, { round: 4, name: 'body:tee' });
      const f1 = B.shape([[49, 83], [35, 87], [23, 94], [19, 111], [19, 176], [61, 176], [61, 105], [55, 95]], mr, { round: 7, name: 'body:front1', tone: -1 });
      const f2 = B.shape([[71, 83], [83, 87], [95, 94], [99, 111], [99, 176], [59, 176], [59, 105], [65, 95]], mr, { round: 7, name: 'body:front2', tone: -1 });
      B.crease(f1, [[28, 132], [36, 148], [43, 154]], 1.3, 1.2);
      B.crease(f2, [[92, 132], [84, 148], [77, 152]], 1.3, 1.2);
      // cream leather sleeves, set in at the shoulder
      c.arm2 = B.tube([[94, 104], [96.5, 111], [101, 140], [104, 176]], [10, 13, 13, 12.5], cr, { name: 'body:nearArm', gloss: 18 });
      B.crease(c.arm2, [[85, 98], [92, 93], [100, 98]], 1.2, 1);
      B.crease(c.arm2, [[97, 122], [103, 127], [107, 125]], 1.4, 1);
      B.crease(c.arm2, [[100, 149], [106, 154]], 1.2, 1);
    },
    collar(B, c) {
      const mr = P.maroon;
      // rib-knit collar standing around the neck
      B.shape([[44, 78], [52, 82], [53, 88], [46, 90], [40, 85]], mr, { round: 3, name: 'collar:1', kind: 'soft', tone: -1 });
      B.shape([[68, 81], [77, 77], [81, 83], [78, 89], [69, 87]], mr, { round: 3, name: 'collar:2', kind: 'soft', tone: -1 });
    },
    front(B, c) {
      const r = c.hr;
      // swept up off the forehead and back, short and tight at the sides
      B.shape([[35, 38], [34, 26], [37, 15], [45, 7], [57, 3], [71, 3], [83, 8], [90, 17], [92, 29], [91, 40], [88, 45], [85, 36], [80, 28], [73, 23.5], [62, 22], [51, 23], [43, 27], [38, 32], [37, 38]], r, { kind: 'hair', round: 8, name: 'hair:crown' });
      B.lock([[42, 27], [42, 15], [48, 5], [60, 1], [74, 3], [86, 10]], [8, 12, 13, 11, 8, 3], r, { name: 'hair:l1' });
      B.lock([[52, 23], [54, 11], [64, 5], [78, 7], [90, 15]], [8, 11, 11, 9, 3], r, { name: 'hair:l2', tone: -1 });
      B.lock([[62, 22], [66, 13], [77, 10], [89, 16], [93, 24]], [8, 10, 9, 7, 3], r, { name: 'hair:l3' });
      B.lock([[75, 25], [83, 21], [90, 27], [92, 35]], [7, 6, 5, 2], r, { name: 'hair:l4', tone: -1 });
      B.lock([[38, 33], [37, 26], [40, 19]], [5, 5, 3], r, { name: 'hair:temple', tone: -1 });
    },
    details(s, c) {
      const h = c.h, mr = P.maroon, cr = P.cream;
      // cleft chin
      const dk = (x, y) => { const v = s.get(x, y); if (v && ((v & 0x7ff0) >> 4) === c.sk.id && (v & 15) >= 2) s.px(x, y, PX.sh(v, -1)); };
      dk(h.chinX, h.chinY - 3); dk(h.chinX, h.chinY - 2);
      const hl = s.get(h.chinX - 1, h.chinY - 3); if (hl && ((hl & 0x7ff0) >> 4) === c.sk.id) s.px(h.chinX - 1, h.chinY - 3, PX.sh(hl, 1));
      // two cream stripes running around the rib-knit collar
      const stripe = (pts) => { for (let i = 1; i < pts.length; i++) s.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], (k, x, y) => { const v = s.get(x, y); if (v && ((v & 0x7ff0) >> 4) === mr.id && (v & 15) > 0) RIG.over(s, x, y, cr, 1); return 0; }); };
      stripe([[52, 84], [47, 82], [42, 79]]); stripe([[52, 87], [46, 85], [41, 82]]);
      stripe([[70, 84], [75, 81], [79, 79]]); stripe([[70, 87], [76, 84], [80, 82]]);
      // snaps down the front
      for (let y = 106; y < 176; y += 11) { s.px(60, y, cr[5]); s.px(61, y, cr[4]); s.px(60, y + 1, cr[3]); s.px(61, y + 1, cr[2]); }
    },
    decal(s, o) {
      // the chenille D on the wearer's left chest (stays readable when the sprite is mirrored)
      const W = 7, H = D.length, x0 = o.flip ? PX.SW - 71 - W : 71, y0 = 104;
      const fill = (cx, cy) => cy >= 0 && cy < H && cx >= 0 && cx < W && D[cy][cx] === '#';
      for (let cy = -1; cy <= H; cy++) for (let cx = -1; cx <= W; cx++) {
        const x = x0 + cx, y = y0 + cy;
        if (fill(cx, cy)) RIG.over(s, x, y, P.cream, 1);
        else if (fill(cx - 1, cy) || fill(cx + 1, cy) || fill(cx, cy - 1) || fill(cx, cy + 1) || fill(cx - 1, cy - 1) || fill(cx + 1, cy + 1) || fill(cx - 1, cy + 1) || fill(cx + 1, cy - 1)) RIG.over(s, x, y, P.maroon, -2);
      }
    }
  });
})();
