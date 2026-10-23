/* Ms. Paige Whitcomb — 23, first-year English teacher, Derry High class of
 * '86, June's best friend (she has forgotten). Voluminous auburn hair with a
 * curled late-'80s bang roll, moon-and-star earrings; a big mustard cable
 * cardigan over a navy floral dress with a Peter Pan collar. */
(function () {
  'use strict';
  const P = PX.P, RIG = PX.RIG;
  PX.ramp('mustard_knit', ['#2c1d0d', '#523715', '#7d5a1f', '#a77f2c', '#c9a243', '#e5c76e']);
  PX.ramp('dress_navy', ['#0e1124', '#18203d', '#232f58', '#324274', '#46598f', '#6075a8']);
  PX.ramp('lip_rose', ['#4a1526', '#7d2638', '#a83c4c', '#c95c66', '#e08486', '#f2b2ae']);
  PX.ramp('pin_brass', ['#3a2508', '#6b4a12', '#9c751f', '#c9a032', '#e8c75a', '#fbeaa0']);

  PX.person('whitcomb', {
    name: 'whitcomb',
    skin: 'skin_fair', hair: 'hair_auburn', eyes: 'eye_hazel', lips: 'lip_rose',
    lashes: true, rosy: 1,
    head: {
      l: 36, r: 82, top: 22, eyeY: 42, browY: 37, chinY: 75, chinX: 56,
      nearEye: [59, 11], farEye: [41, 8], noseX: 53, noseY: 49, mouthX: 55, mouthY: 63, ear: [80, 45], neck: 8.5
    },
    back(B, c) {
      const r = c.hr;
      // a big round mass of curls behind the head and shoulders (the outline bumps are curls)
      B.shape([[40, 6], [58, 0], [78, 2], [94, 10], [103, 21], [108, 33], [105, 41], [109, 50], [106, 60], [108, 70], [104, 80], [106, 90], [99, 98], [91, 103], [84, 97], [76, 90], [44, 90], [36, 97], [27, 103], [19, 98], [13, 90], [15, 80], [10, 70], [13, 60], [9, 50], [13, 40], [12, 30], [20, 17]], r, { kind: 'hair', round: 6, name: 'hair:back', tone: -1 });
      B.lock([[96, 34], [104, 50], [99, 66], [105, 84], [96, 98]], [12, 12, 11, 9, 4], r, { name: 'hair:b1', tone: -1 });
      B.lock([[22, 36], [14, 52], [19, 68], [12, 84], [22, 98]], [12, 12, 11, 9, 4], r, { name: 'hair:b2', tone: -1 });
    },
    body(B, c) {
      const mk = P.mustard_knit, dn = P.dress_navy;
      c.farArm = B.tube([[27, 106], [20, 138], [17, 176]], [13.5, 13, 12.5], mk, { name: 'body:farArm', tone: -1, kind: 'soft' });
      c.dress = B.shape([[48, 87], [55, 92], [62, 93], [69, 91], [74, 86], [78, 116], [80, 176], [43, 176], [44, 116]], dn, { round: 8, name: 'body:dress', bumps: [[52, 120, 6, 6, 2], [69, 119, 6, 6, 1.6]] });
      const f1 = B.shape([[50, 86], [36, 90], [25, 98], [21, 116], [22, 176], [51, 176], [50, 138], [49, 110], [48, 97]], mk, { kind: 'soft', round: 8, name: 'body:front1' });
      const f2 = B.shape([[71, 85], [85, 89], [97, 97], [101, 116], [99, 176], [73, 176], [73, 138], [74, 110], [73, 97]], mk, { kind: 'soft', round: 8, name: 'body:front2' });
      B.crease(f1, [[31, 140], [39, 150], [45, 152]], 1.3, 1.1);
      B.crease(f2, [[91, 138], [83, 149], [78, 151]], 1.3, 1.1);
      c.nearArm = B.tube([[96, 102], [102, 138], [104, 176]], [14, 13.5, 13], mk, { name: 'body:nearArm', kind: 'soft' });
      B.crease(c.nearArm, [[90, 104], [94, 99], [100, 97]], 1.0, 0.9);
      B.crease(c.nearArm, [[90, 122], [94, 140], [96, 158]], 1.4, 1.1);
      B.crease(c.farArm, [[28, 120], [25, 146]], 1.2, 1.1);
    },
    collar(B, c) {
      // Peter Pan collar on the dress
      B.shape([[48, 87], [56, 93], [60, 97], [53, 101], [45, 97], [44, 91]], P.white_cloth, { round: 3, name: 'collar:pp1' });
      B.shape([[72, 86], [64, 93], [61, 97], [68, 101], [76, 96], [77, 90]], P.white_cloth, { round: 3, name: 'collar:pp2', tone: -1 });
    },
    front(B, c) {
      const r = c.hr;
      // teased crown
      B.shape([[29, 40], [27, 23], [35, 9], [50, 1], [67, 0], [83, 4], [95, 15], [99, 30], [94, 37], [88, 28], [77, 22], [60, 19.5], [45, 21], [35, 30], [32, 40]], r, { kind: 'hair', round: 9, name: 'hair:crown' });
      // the bang roll: three big curls swept toward the far side and turned under, above the brows
      B.lock([[80, 13], [76, 20], [70, 26], [64, 28.5], [61, 25]], [12, 12, 10, 7, 3], r, { name: 'hair:bang0', tone: -1 });
      B.lock([[66, 11], [62, 18], [56, 25], [50, 29], [46, 26]], [13, 13, 11, 8, 3], r, { name: 'hair:bang1' });
      B.lock([[51, 10], [46, 17], [41, 24], [37, 30], [36, 35]], [13, 13, 11, 8, 3], r, { name: 'hair:bang2' });
      // curls framing the face; the near side swept back behind the ear
      B.lock([[33, 32], [29, 46], [34, 60], [28, 74], [33, 88]], [11, 11, 10, 9, 4], r, { name: 'hair:f1' });
      B.lock([[83, 21], [88, 30], [90, 40], [93, 47]], [11, 10, 7, 3], r, { name: 'hair:f2', tone: -1 });
    },
    details(s, c) {
      const h = c.h, mk = P.mustard_knit, dn = P.dress_navy, br = P.pin_brass, W = s.w;
      const rampOf = (x, y) => (s.get(x, y) & 0x7ff0) >> 4;
      // cable knit: braided ropes between purl channels, ribbed button bands
      for (let y = 96; y < 176; y++) for (let x = 0; x < W; x++) {
        if (rampOf(x, y) !== mk.id) continue;
        const sh = s.get(x, y) & 15; if (sh === 0) continue;
        const col = (x + 3) % 9, ph = y % 6;
        if (col === 0) RIG.over(s, x, y, mk, -1);
        else if (col >= 2 && col <= 5) {
          const d = ph < 3 ? col - 2 - ph : 5 - col - (ph - 3);   // braid: strokes lean one way, then the other
          if (d === 0) RIG.over(s, x, y, mk, 1); else if (d === -1 || d === 3) RIG.over(s, x, y, mk, -1);
        }
      }
      for (let y = 100; y < 176; y++) { RIG.over(s, 49, y, mk, -1); RIG.over(s, 74, y, mk, -1); if (y % 14 === 6) { s.px(47, y, P.cream[4]); s.px(76, y, P.cream[3]); } }
      // floral print: little sprigs scattered over the dress
      for (let k = 0; k < 40; k++) {
        const x = 44 + ((k * 37) % 36), y = 100 + ((k * 23) % 76);
        if (rampOf(x, y) !== dn.id || rampOf(x + 2, y + 2) !== dn.id || rampOf(x - 1, y - 1) !== dn.id) continue;
        const sh = s.get(x, y) & 15, fl = k % 3 === 0 ? P.cream : P.pink;
        s.px(x, y - 1, fl[Math.min(5, sh + 1)]); s.px(x - 1, y, fl[Math.min(5, sh + 1)]); s.px(x + 1, y, fl[sh]); s.px(x, y + 1, fl[sh]);
        s.px(x, y, P.mustard[4]);
        s.px(x + 2, y + 2, P.green_jkt[Math.min(5, sh + 1)]); s.px(x + 1, y + 2, P.green_jkt[sh]);
      }
      // strands through the dark mass of curls behind the neck
      for (const [x0, y0, y1, ph] of [[80, 46, 96, 0], [86, 50, 98, 2], [26, 50, 96, 1], [20, 56, 92, 3]]) {
        for (let y = y0; y < y1; y++) {
          const x = Math.round(x0 + 2.6 * Math.sin((y + ph * 3) / 5.5));
          const v = s.get(x, y);
          if (((v & 0x7ff0) >> 4) === c.hr.id && (v & 15) >= 1 && (v & 15) <= 2) s.px(x, y, c.hr[(v & 15) + 1]);
        }
      }
      // moon-and-star earring hanging from the near lobe
      const [ex, ey] = h.ear, lx = ex + 3, ly = ey + 15;
      s.px(lx, ly, br[2]);
      [[0, 1, 4], [-1, 2, 3], [-1, 3, 3], [-1, 4, 2], [0, 5, 2], [1, 5, 1]].forEach(([dx, dy, k]) => s.px(lx + dx, ly + dy, br[k]));
      [[2, 6, 5], [1, 7, 3], [2, 7, 4], [3, 7, 3], [2, 8, 2]].forEach(([dx, dy, k]) => s.px(lx + dx, ly + dy, br[k]));
    },
    portraitBox: [20, 6, 76, 76]
  });
})();
