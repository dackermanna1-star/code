/* Sloane Ashgrove, 14. Cal's twin, queen bee. A sleek honey-blonde chin-length
 * bob pushed back with a black velvet headband, tucked behind one ear; pearl
 * studs; arched brows; a cream cable-knit cardigan over a white collared blouse.
 * (Her mother Constance shares hair_honey and eye_blue.) */
(function () {
  'use strict';
  const P = PX.P, RIG = PX.RIG;
  PX.ramp('velvet_black', ['#08070c', '#141220', '#211d30', '#2f2a42', '#433b59', '#5c5276']);

  PX.person('sloane', {
    name: 'sloane',
    skin: 'skin_fair', hair: 'hair_honey', eyes: 'eye_blue', lips: 'lip',
    lashes: true, browThick: 1, brow: 'hair_honey',
    head: { l: 38, r: 80, top: 22, eyeY: 41, chinY: 75, chinX: 56, jaw: -0.5, cheek: 0, nearEye: [58, 11], farEye: [42, 8], browY: 35, noseX: 53, noseY: 48, mouthX: 55, mouthY: 63, ear: [78, 43], neck: 8 },
    faceBumps: [[67, 51, 3.5, 2, 0.7], [45, 51, 2.5, 2, 0.5], [56, 72, 2.5, 2, 0.5]],
    portraitBox: [21, 4, 76, 76],
    back(B, c) {
      const r = c.hr;
      // the back of the bob
      B.shape([[41, 13], [56, 6], [74, 7], [87, 13], [92, 25], [93, 42], [92, 57], [89, 67], [84, 70], [78, 68], [72, 58], [56, 40], [39, 32]], r, { kind: 'hair', round: 9, name: 'hair:back', tone: -1 });
    },
    body(B, c) {
      const cr = P.cream, wc = P.white_cloth;
      B.tube([[30, 108], [24, 142], [21, 176]], [11, 10.5, 10], cr, { name: 'body:farArm', tone: -1, kind: 'soft' });
      c.torso = B.shape([[50, 86], [39, 90], [30, 97], [26, 114], [26, 176], [94, 176], [94, 114], [90, 97], [81, 90], [70, 86]], cr, { round: 12, name: 'body:torso', kind: 'soft' });
      // the blouse in the cardigan's V
      B.shape([[49, 84], [71, 84], [66, 100], [60, 110], [54, 100]], wc, { round: 5, name: 'body:blouse' });
      const f1 = B.shape([[49, 88], [39, 92], [31, 99], [27, 114], [27, 176], [61, 176], [61, 112], [55, 100]], cr, { round: 7, name: 'body:front1', kind: 'soft' });
      const f2 = B.shape([[71, 88], [81, 92], [89, 99], [92, 114], [92, 176], [59, 176], [59, 112], [65, 100]], cr, { round: 7, name: 'body:front2', kind: 'soft' });
      B.crease(f1, [[32, 136], [39, 150], [45, 156]], 1.1, 1.1);
      B.crease(f2, [[90, 134], [83, 150], [76, 154]], 1.1, 1.1);
      c.arm2 = B.tube([[88, 104], [96, 142], [99, 176]], [12, 11.5, 11], cr, { name: 'body:nearArm', kind: 'soft' });
      B.crease(c.arm2, [[80, 99], [87, 95], [93, 100]], 1.1, 1);
      B.crease(c.arm2, [[91, 126], [96, 131], [100, 129]], 1.2, 1);
    },
    collar(B, c) {
      const wc = P.white_cloth;
      // pointed blouse collar lying over the cardigan
      B.shape([[50, 83], [58, 90], [57, 101], [51, 97], [45, 90]], wc, { round: 2, name: 'collar:1' });
      B.shape([[70, 83], [75, 89], [69, 98], [63, 102], [62, 90]], wc, { round: 2, name: 'collar:2' });
    },
    front(B, c) {
      const r = c.hr, v = P.velvet_black;
      // smooth hair swept back from the brow to the headband
      B.shape([[37, 44], [36, 30], [38, 20], [44, 12], [53, 7.5], [62, 6], [76, 7], [87, 14], [92, 26], [93, 40], [90, 50], [87, 44], [83, 34], [78, 27], [66, 24.5], [54, 24.5], [45, 28], [40, 36], [39, 44]], r, { kind: 'hair', round: 9, name: 'hair:crown' });
      B.lock([[45, 27], [53, 22.5], [63, 20], [73, 20]], 7, r, { name: 'hair:sweep1' });
      // the black velvet headband across the crown, its ends tucked under the side hair
      B.tube([[39, 34], [44, 25], [53, 18.5], [64, 15], [76, 16], [85, 21], [90, 28]], 2.5, v, { kind: 'soft', name: 'hat:band', gloss: 10 });
      // near side tucked behind the ear; far side along the cheek; blunt ends turned under
      B.lock([[84, 22], [89, 32], [91, 46], [90, 58], [87, 67]], [11, 11, 10, 9, 8], r, { name: 'hair:near' });
      B.lock([[44, 27], [38.5, 37], [37.5, 50], [38.5, 62], [42, 71]], [10, 10, 10, 9, 8], r, { name: 'hair:far' });
      B.lock([[48, 27], [43, 37], [42, 50], [43, 61]], [6, 6, 5, 3], r, { name: 'hair:far2', tone: -1 });
    },
    details(s, c) {
      const h = c.h, cr = P.cream, wc = P.white_cloth, ex = c.ex;
      // a higher arch on the brows
      const bc = P.hair_honey, b = ex.brow;
      const arch = (xi, xo, lift, tilt) => {
        const n = Math.abs(xo - xi), dir = Math.sign(xo - xi) || 1;
        for (let k = 0; k <= n; k++) { const t = k / n; if (t > 0.38 && t < 0.62) s.px(xi + dir * k, h.browY - lift + Math.round(tilt * (1 - t)) - 2, bc[2]); }
      };
      const [nx, nw] = h.nearEye, [fx, fw] = h.farEye;
      arch(nx, nx + nw + 1, b[0] + (b[2] || 0), b[1]);
      arch(fx + fw - 1, fx - 2, b[0], b[1]);
      // velvet sheen along the top of the headband
      [[42, 25], [45, 22], [48, 20], [51, 18], [54, 17], [57, 16], [60, 15], [63, 14]].forEach(([x, y]) => { const q = s.get(x, y); if (q && ((q & 0x7ff0) >> 4) === P.velvet_black.id) s.px(x, y, P.velvet_black[4]); });
      // pearl stud
      s.px(80, 56, P.white[5]); s.px(81, 56, P.white[3]); s.px(80, 57, P.white[2]); s.px(81, 57, P.white[1]);
      // cable knit: twisted columns on both fronts, ribbed bands
      const cable = (x0) => {
        for (let y = 100; y < 176; y++) {
          const k = (y - 100) % 6;
          const lit = k === 0 || k === 3 ? [1, 2] : k === 1 || k === 2 ? [0, 3] : [0, 3];
          for (let dx = 0; dx < 4; dx++) RIG.over(s, x0 + dx, y, cr, lit.includes(dx) ? 1 : (k === 0 || k === 3) ? -1 : 0);
          RIG.over(s, x0 - 1, y, cr, -1); RIG.over(s, x0 + 4, y, cr, -1);
        }
      };
      cable(33); cable(45); cable(70); cable(82);
      for (let y = 102; y < 176; y++) if (y % 2) { RIG.over(s, 57, y, cr, -1); RIG.over(s, 63, y, cr, -1); }
      // buttons
      for (let y = 114; y < 176; y += 10) { s.px(60, y, cr[5]); s.px(61, y, cr[3]); s.px(60, y + 1, cr[2]); s.px(61, y + 1, cr[1]); }
      // blouse buttons
      s.px(60, 103, wc[2]);
    }
  });
})();
