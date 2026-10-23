/* Mrs. Fennimore — 60s, Derry Public Library, and a Lantern Society member.
 * Prim and watchful. A steel-grey bob turned under at the jaw, gold half-moon
 * glasses low on her nose (she looks over them, not through them); a teal
 * cardigan buttoned over a white collar, a brass lantern pin. */
(function () {
  'use strict';
  const P = PX.P, RIG = PX.RIG;
  PX.ramp('hair_steel', ['#1d2028', '#353a46', '#555c6a', '#7a8290', '#a3abb7', '#cdd3dc']);
  PX.ramp('pin_brass', ['#3a2508', '#6b4a12', '#9c751f', '#c9a032', '#e8c75a', '#fbeaa0']);
  PX.ramp('stubble_fair', ['#4a2139', '#7b4a5c', '#a87882', '#c99d9f', '#dfc0bb', '#f0dcd6']);

  let over = null;
  const record = (B, prefix) => {
    const ids = new Set(B.parts.filter((p) => p.name.startsWith(prefix)).map((p) => p.id));
    const out = [];
    for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
      const i = y * B.w + x, p = B.pid[i]; if (!ids.has(p)) continue;
      const part = B.parts[p]; let cls = 0;
      for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (xx < 0 || xx >= B.w || yy < 0) { cls = 1; continue; }
        if (yy >= B.h) continue;
        const q = B.pid[yy * B.w + xx];
        if (q < 0) cls = 1; else if (cls !== 1 && q < p && B.parts[q].ramp !== part.ramp) cls = 2;
      }
      out.push(i, cls, part.ramp, part.sil, part.line);
    }
    return out;
  };
  const repaint = (s, c, list) => {
    for (let k = 0; k < list.length; k += 5) {
      const i = list[k], cls = list[k + 1], r = list[k + 2], t = c.tone[i];
      s.d[i] = cls === 1 ? r[list[k + 3]] : cls === 2 ? r[Math.min(t, list[k + 4])] : r[t];
    }
  };

  PX.person('librarian', {
    name: 'librarian',
    skin: 'skin_old', hair: 'hair_steel', eyes: 'eye_gray', lips: 'lip', brow: 'hair_steel',
    lashes: true, nose: 'long', browThick: 1,
    head: {
      l: 37, r: 81, top: 25, eyeY: 45, browY: 40, chinY: 78, chinX: 56, jaw: -0.3,
      nearEye: [59, 10], farEye: [42, 7], noseX: 53, noseY: 52, mouthX: 55, mouthY: 67, ear: [79, 48], neck: 8
    },
    faceBumps: [[53, 55, 1.4, 3.5, 1.4], [66, 55, 3.5, 2.5, 0.6], [70, 63, 3, 3, -0.6]],
    back(B, c) {
      const r = c.hr;
      // the bob: a full crown, the ends turned under at the jaw
      B.shape([[38, 10], [56, 4], [74, 5], [88, 12], [96, 26], [98, 44], [97, 62], [93, 76], [86, 82], [78, 78], [74, 66], [42, 66], [38, 78], [30, 82], [24, 74], [24, 54], [26, 32], [30, 18]], r, { kind: 'hair', round: 9, name: 'hair:back', tone: -1 });
      B.lock([[88, 50], [95, 64], [92, 77], [85, 82], [81, 78]], [11, 11, 9, 6, 3], r, { name: 'hair:end1', tone: -1 });
    },
    body(B, c) {
      const tl = P.teal;
      c.farArm = B.tube([[27, 108], [21, 140], [18, 176]], [12.5, 12, 11.5], tl, { name: 'body:farArm', tone: -1, kind: 'soft' });
      c.torso = B.shape([[48, 88], [35, 92], [25, 100], [23, 116], [24, 176], [96, 176], [98, 116], [96, 99], [86, 91], [71, 87]], tl, { kind: 'soft', round: 12, name: 'body:torso', bumps: [[50, 124, 8, 7, 1.8], [71, 123, 8, 7, 1.4]] });
      B.crease(c.torso, [[60, 100], [60, 176]], 1.0, 1.0);
      c.nearArm = B.tube([[94, 104], [99, 140], [101, 176]], [13, 12.5, 12], tl, { name: 'body:nearArm', kind: 'soft' });
      B.crease(c.nearArm, [[88, 106], [92, 101], [98, 99]], 1.0, 0.9);
      B.crease(c.nearArm, [[88, 124], [92, 142], [94, 160]], 1.3, 1.1);
      B.crease(c.farArm, [[28, 122], [25, 148]], 1.2, 1.1);
    },
    collar(B, c) {
      // white blouse collar over the cardigan's neckline
      B.shape([[48, 86], [56, 92], [59, 98], [52, 104], [44, 94], [43, 89]], P.white_cloth, { round: 2.5, name: 'collar:1' });
      B.shape([[71, 85], [77, 88], [75, 94], [67, 104], [62, 97], [64, 92]], P.white_cloth, { round: 2.5, name: 'collar:2', tone: -1 });
    },
    front(B, c) {
      const r = c.hr;
      // crown swept across from a side part over the near temple
      B.shape([[30, 44], [29, 28], [35, 14], [48, 6], [64, 4], [80, 8], [91, 18], [95, 32], [93, 44], [88, 38], [84, 28], [76, 24], [64, 24], [52, 27], [42, 31], [35, 38], [33, 44]], r, { kind: 'hair', round: 9, name: 'hair:crown' });
      B.lock([[78, 12], [66, 15], [54, 20], [44, 27], [38, 36]], [11, 12, 11, 8, 3], r, { name: 'hair:sweep', line: 2 });
      // the sides, turned under at the jaw
      B.lock([[34, 38], [31, 52], [31.5, 66], [34.5, 75], [38.5, 75.5]], [10, 10, 10, 7, 3], r, { name: 'hair:side1', line: 2 });
      B.lock([[86, 30], [88, 42], [89, 50]], [9, 8, 4], r, { name: 'hair:side2', tone: -1, line: 2 });
    },
    extras(B, c) {
      const g = P.pin_brass, ey = c.h.eyeY;
      // gold half-moons riding low on the nose: flat tops under the eyes
      const half = (x0, x1, top, depth) => {
        const pts = [[x0, top]];
        for (let k = 0; k <= 8; k++) { const t = k / 8, a = Math.PI * t; pts.push([x0 + (x1 - x0) * t, top + depth * Math.sin(a)]); }
        pts.push([x1, top], [x0, top]);
        return pts;
      };
      B.tube(half(57, 71.5, ey + 6.5, 5), 0.55, g, { kind: 'metal', name: 'glasses:near', outline: false, tone: 1 });
      B.tube(half(41, 50.5, ey + 6.5, 4.6), 0.55, g, { kind: 'metal', name: 'glasses:far', outline: false });
      B.tube([[50.5, ey + 7], [53.5, ey + 6.2], [57, ey + 7]], 0.5, g, { kind: 'metal', name: 'glasses:bridge', outline: false });
      B.tube([[71.5, ey + 6.5], [76, ey + 5], [79.5, ey + 4]], 0.5, g, { kind: 'metal', name: 'glasses:arm', outline: false });
      over = record(B, 'glasses');
    },
    details(s, c) {
      const h = c.h, sk = c.sk, tl = P.teal, br = P.pin_brass;
      const rampOf = (x, y) => (s.get(x, y) & 0x7ff0) >> 4;
      // fine lines: under the eyes, beside the mouth, a pucker of a mouth
      s.line(h.noseX + 5, h.noseY + 8, h.mouthX + 7, h.mouthY + 1, sk[2]);
      s.line(h.mouthX + 6, h.mouthY + 3, h.mouthX + 6, h.mouthY + 6, sk[2]);
      const [nx, nw] = h.nearEye;
      if (rampOf(nx + nw + 2, h.eyeY + 4) === sk.id) { s.px(nx + nw + 2, h.eyeY + 4, sk[2]); s.px(nx + nw + 3, h.eyeY + 3, sk[2]); }
      // the half-moons over everything, a glint on each lens
      repaint(s, c, over);
      s.px(60, h.eyeY + 8, P.white[5]); s.px(61, h.eyeY + 9, P.white[3]);
      s.px(43, h.eyeY + 8, P.white[4]);
      // cardigan: ribbed button band, buttons, ribbed cuffs on the hem
      for (let y = 100; y < 176; y++) { RIG.over(s, 58, y, tl, -1); RIG.over(s, 62, y, tl, -1); if (y % 12 === 4) { s.px(60, y, P.cream[4]); s.px(60, y + 1, P.cream[2]); } }
      for (let x = 14; x < 108; x++) for (let y = 168; y < 176; y++) if (rampOf(x, y) === tl.id && x % 2 === 0) RIG.over(s, x, y, tl, -1);
      // brass lantern pin on the near side
      const lx = 75, ly = 106;
      s.px(lx + 1, ly, br[2]);
      s.px(lx, ly + 1, br[3]); s.px(lx + 1, ly + 1, br[5]); s.px(lx + 2, ly + 1, br[3]);
      s.px(lx, ly + 2, br[2]); s.px(lx + 1, ly + 2, br[4]); s.px(lx + 2, ly + 2, br[1]);
      s.px(lx, ly + 3, br[2]); s.px(lx + 1, ly + 3, br[4]); s.px(lx + 2, ly + 3, br[1]);
      s.px(lx, ly + 4, br[3]); s.px(lx + 1, ly + 4, br[3]); s.px(lx + 2, ly + 4, br[1]);
    },
    portraitBox: [20, 8, 76, 76]
  });
})();
