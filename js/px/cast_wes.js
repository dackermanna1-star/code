/* Wes — Wesley Pike, 15. A buzz cut growing out; a lean, tired face; a healing
 * split lip; a too-big red-and-black buffalo-plaid flannel over a grey waffle
 * thermal; a pencil behind his ear. */
(function () {
  'use strict';
  const P = PX.P, RIG = PX.RIG;
  PX.ramp('hair_buzz', ['#2a1915', '#472e25', '#674736', '#87624a', '#a47f63', '#c09d80']);

  /* buffalo check painted over the flannel at the shade already there */
  function plaid(s, x0, y0, x1, y1, ox, oy, inside) {
    const red = P.plaid_r, blk = P.black_cloth, n = 7;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const v = s.get(x, y); if (!v || ((v & 0x7ff0) >> 4) !== red.id || (inside && !inside(x, y))) continue;
      const sh = v & 15; if (sh === 0) continue;
      const u = Math.floor((x + ox) / n) & 1, w = Math.floor((y + oy) / n) & 1;
      if (u && w) s.px(x, y, blk[Math.max(1, sh)]);
      else if (u || w) s.px(x, y, red[Math.max(1, sh - 2)]);
    }
  }

  PX.person('wes', {
    name: 'wes',
    skin: 'skin_warm', hair: 'hair_buzz', eyes: 'eye_hazel',
    lashes: false, nose: 'long', browThick: 2, brow: 'hair_mid',
    head: { l: 38, r: 81, top: 22, eyeY: 40, chinY: 74, chinX: 56, jaw: 1.6, cheek: -1, nearEye: [59, 10], farEye: [43, 7], browY: 35, noseX: 53, noseY: 47, mouthX: 56, mouthY: 63, ear: [79, 42], neck: 9 },
    faceBumps: [[45, 56, 2.5, 3, -0.7], [71, 57, 3, 3.5, -0.9], [67, 49, 3.5, 2, 0.7], [57.5, 64.5, 1.6, 1, 0.6]],
    portraitBox: [21, 2, 76, 76],
    back(B, c) {
      const r = c.hr;
      // the back of the skull, close-cropped
      B.shape([[41, 19], [51, 12], [64, 9.5], [77, 11], [87, 17], [92, 28], [92, 42], [89, 53], [84, 58], [79, 56], [72, 44], [52, 32], [40, 30]], r, { kind: 'hair', round: 7, name: 'hair:back', tone: -1 });
    },
    body(B, c) {
      const red = P.plaid_r, kg = P.knit_gray;
      B.tube([[25, 106], [17, 142], [14, 176]], [13, 12.5, 12], red, { name: 'body:farArm', tone: -1, kind: 'soft' });
      B.shape([[50, 85], [36, 89], [22, 97], [17, 115], [17, 176], [103, 176], [103, 115], [98, 96], [85, 89], [70, 85]], red, { round: 12, name: 'body:torso', kind: 'soft' });
      c.therm = B.shape([[48, 85], [55, 90], [61, 91], [67, 89], [72, 85], [76, 118], [77, 176], [44, 176], [45, 118]], kg, { round: 8, name: 'body:thermal', kind: 'soft' });
      B.crease(c.therm, [[57, 124], [60, 146], [58, 168]], 1.1, 1.2);
      const f1 = B.shape([[49, 87], [36, 91], [23, 98], [19, 116], [21, 176], [49, 176], [48, 140], [47, 112], [46, 98]], red, { round: 7, name: 'body:front1', kind: 'soft' });
      const f2 = B.shape([[72, 86], [84, 90], [96, 97], [101, 116], [99, 176], [73, 176], [73, 140], [74, 112], [74, 98]], red, { round: 7, name: 'body:front2', kind: 'soft' });
      B.crease(f1, [[29, 134], [37, 150], [43, 156]], 1.3, 1.2);
      B.crease(f2, [[94, 132], [86, 148], [79, 152]], 1.3, 1.2);
      c.arm2 = B.tube([[94, 103], [102, 142], [105, 176]], [14, 13.5, 13], red, { name: 'body:nearArm', kind: 'soft' });
      B.crease(c.arm2, [[86, 96], [93, 92], [100, 97]], 1.3, 1);
      B.crease(c.arm2, [[97, 124], [102, 129], [106, 127]], 1.4, 1);
      B.crease(c.arm2, [[100, 150], [105, 155]], 1.2, 1);
    },
    collar(B, c) {
      const red = P.plaid_r;
      B.bump(c.neckPart, 61, 81, 1.4, 1.6, 1.2);
      // flannel collar points
      B.shape([[45, 81], [53, 86], [51, 99], [44, 95], [40, 88]], red, { round: 3, name: 'collar:1', kind: 'soft' });
      B.shape([[68, 84], [77, 80], [81, 88], [77, 98], [70, 92]], red, { round: 3, name: 'collar:2', kind: 'soft' });
    },
    front(B, c) {
      const r = c.hr, rng = PX.rng('wes:fuzz');
      // close-cropped hair growing out: a velvety cap hugging the skull, an M-shaped hairline, a short sideburn
      const top = [[37, 40], [37, 28], [39, 20], [44, 14], [51, 11.2], [62, 9.5], [75, 10.5], [85, 16], [91, 26], [92, 37], [89, 46]];
      const fuzz = [];
      for (let i = 1; i < top.length; i++) { const [x0, y0] = top[i - 1], [x1, y1] = top[i]; for (let k = 0; k < 3; k++) { const t = k / 3; fuzz.push([x0 + (x1 - x0) * t + (rng() - 0.5) * 0.8, y0 + (y1 - y0) * t + (rng() - 0.5) * 0.8]); } }
      fuzz.push(top[top.length - 1]);
      c.crown = B.shape(fuzz.concat([[86, 45], [83, 41], [82, 34], [79, 29], [74, 27.5], [69, 26], [63, 25.5], [56, 25.5], [50, 26.5], [45, 28.5], [41, 29], [39, 34], [39, 41]]), r, { kind: 'hair', round: 4, name: 'hair:crown' });
    },
    extras(B, c) {
      // the pencil resting over his ear: graphite, sharpened wood, yellow barrel, ferrule, eraser
      const y = P.yellow;
      B.tube([[75.5, 38.5], [77.5, 37.8]], 1.1, P.wood_pale, { name: 'pencil:tip', kind: 'cloth', outline: true });
      B.tube([[77.5, 37.8], [91, 33]], 1.5, y, { name: 'pencil:body', kind: 'cloth' });
      B.tube([[91, 33], [93, 32.3]], 1.5, P.chrome, { name: 'pencil:ferrule', kind: 'metal' });
      B.tube([[93, 32.3], [95.5, 31.4]], 1.5, P.pink, { name: 'pencil:eraser', kind: 'soft' });
    },
    details(s, c) {
      const h = c.h, kg = P.knit_gray, hr = c.hr;
      // buzz cut texture: a fine, sparse stipple, lighter in the light and darker in the shade
      const rng = PX.rng('wes:strokes');
      for (let i = 0; i < 120; i++) {
        const x = 38 + Math.floor(rng() * 55), y = 10 + Math.floor(rng() * 36);
        const v = s.get(x, y); if (!v || ((v & 0x7ff0) >> 4) !== hr.id) continue;
        const sh = v & 15; if (sh === 0) continue;
        const nb = [s.get(x - 1, y), s.get(x + 1, y), s.get(x, y - 1), s.get(x, y + 1)];
        if (nb.some((q) => !q || ((q & 0x7ff0) >> 4) !== hr.id || (q & 15) === 0)) continue;
        s.px(x, y, sh >= 4 ? hr[3] : hr[Math.max(1, sh - 1)]);
      }
      // a soft hairline: short hairs and scalp shadow just below the edge
      for (let x = 41; x < 82; x++) for (let y = 24; y < 34; y++) {
        const v = s.get(x, y), up = s.get(x, y - 1);
        if (v && up && ((v & 0x7ff0) >> 4) === c.sk.id && ((up & 0x7ff0) >> 4) === hr.id) { if (x % 3 === 0) s.px(x, y, PX.sh(v, -1)); break; }
      }
      // tired eyes: lid creases and shadows underneath
      const dk = (x, y) => { const v = s.get(x, y); if (v && ((v & 0x7ff0) >> 4) === c.sk.id && (v & 15) >= 2) s.px(x, y, PX.sh(v, -1)); };
      for (let x = h.nearEye[0] + 1; x < h.nearEye[0] + h.nearEye[1] - 1; x++) dk(x, h.eyeY + 6);
      for (let x = h.farEye[0] + 1; x < h.farEye[0] + h.farEye[1]; x++) dk(x, h.eyeY + 6);
      // the healing split on the lower lip: a dark scab and a little swelling, on the near side
      const m = RIG.MOUTH[c.ex.mouth] || RIG.MOUTH.neutral, top = h.mouthY - (m.length > 3 ? 1 : 0), low = top + m.length - 1;
      s.px(h.mouthX + 2, low, P.lip_red[1]);
      const sw = s.get(h.mouthX + 3, low); if (sw && ((sw & 0x7ff0) >> 4) === c.sk.id) s.px(h.mouthX + 3, low, P.lip[3]);
      const sw2 = s.get(h.mouthX + 2, low + 1); if (sw2 && ((sw2 & 0x7ff0) >> 4) === c.sk.id) s.px(h.mouthX + 2, low + 1, PX.sh(sw2, -1));
      // heavy, tired lids
      for (let x = h.nearEye[0] + 2; x < h.nearEye[0] + h.nearEye[1] - 1; x++) dk(x, h.eyeY - 1);
      // waffle thermal
      for (let y = 86; y < 176; y++) for (let x = 40; x < 80; x++) {
        const v = s.get(x, y); if (!v || ((v & 0x7ff0) >> 4) !== kg.id || (v & 15) < 2) continue;
        if ((x % 4 === 0 && y % 2 === 0) || (y % 4 === 0 && x % 2 === 0)) RIG.over(s, x, y, kg, -1);
      }
      // henley buttons
      s.px(60, 96, kg[5]); s.px(60, 97, kg[2]); s.px(60, 102, kg[5]); s.px(60, 103, kg[2]);
      // buffalo plaid: the body and the arms checked on different offsets
      plaid(s, 10, 78, 108, 175, 3, 2, (x, y) => x > 26 && x < 96);
      plaid(s, 0, 90, 30, 175, 5, 4, (x, y) => x <= 26);
      plaid(s, 90, 88, 117, 175, 1, 5, (x, y) => x >= 96);
    }
  });
})();
