/* Mr. Teague — night janitor at Derry High since 1957, 68, Korean War vet.
 * Grey thinning crew cut, big ears, deep-set eyes under a heavy brow, grey
 * stubble; a navy work shirt with an oval name patch, a ring of keys on the
 * pocket, a briar pipe in the other pocket. */
(function () {
  'use strict';
  const P = PX.P, RIG = PX.RIG;
  /* faded workwear navy: violet darks, dusty blue lights */
  PX.ramp('work_navy', ['#0f1120', '#1c2135', '#29324d', '#384767', '#506084', '#7181a1']);
  /* name-patch red thread */
  PX.ramp('patch_red', ['#3a0d14', '#6a1620', '#9a2229', '#c23a37', '#de6150', '#f19a7c']);
  /* weathered skin under grey stubble: skin_warm pulled toward cool grey */
  PX.ramp('stubble_warm', ['#45222d', '#734a4b', '#9a6f66', '#b78f81', '#cfae9d', '#e4cdbd']);

  /* 3×5 capitals for the name patch (drawn in decal, so never mirrored) */
  const FONT = {
    T: ['###', '.#.', '.#.', '.#.', '.#.'], E: ['###', '#..', '##.', '#..', '###'],
    A: ['.#.', '#.#', '###', '#.#', '#.#'], G: ['.##', '#..', '#.#', '#.#', '.##'],
    U: ['#.#', '#.#', '#.#', '#.#', '###']
  };
  const PATCH = { x: 80, y: 111, rx: 15, ry: 6 };
  let faceMask = null;   // face polygon, filled once (static geometry)

  PX.person('teague', {
    name: 'teague',
    skin: 'skin_warm', hair: 'hair_gray', eyes: 'eye_gray', brow: 'hair_gray',
    lashes: false, nose: 'long', lines: 2, ear: false,
    head: {
      l: 36, r: 82, top: 25, eyeY: 44, browY: 39, chinY: 79, chinX: 55, jaw: 1, cheek: 0.8,
      nearEye: [59, 10], farEye: [42, 7], noseX: 52, noseY: 51, mouthX: 55, mouthY: 67, neck: 10
    },
    faceBumps: [
      [64, 46, 3.8, 2.4, -1.6], [45, 46, 2.8, 2.2, -1.2],        // deep-set sockets
      [58, 39.5, 11, 1.6, 1.4],                                // heavy brow ridge
      [51.5, 58, 2.6, 2.0, 1.7],                               // bulbous nose tip
      [70, 61, 3.5, 3, -0.9], [42, 60, 2.5, 3, -0.6],          // hollow cheeks
      [72, 72, 4, 3, 1.0], [41, 70, 3, 3, 0.7]                 // jowls
    ],
    back(B, c) {
      // back of the neck behind the ear, and the back of the skull (short grey hair)
      B.shape([[68, 56], [82, 58], [85, 66], [86, 80], [87, 92], [66, 94]], c.sk, { kind: 'skin', round: 4, name: 'nape', flatTone: 2 });
      B.shape([[72, 14], [84, 14], [92, 21], [96, 33], [96, 47], [93, 58], [88, 66], [80, 68], [74, 56], [72, 30]], c.hr, { kind: 'hair', round: 7, name: 'hair:back', tone: -1 });
    },
    body(B, c) {
      const nv = P.work_navy;
      c.farArm = B.tube([[25, 108], [17, 140], [14, 176]], [14, 13.5, 13], nv, { name: 'body:farArm', tone: -1 });
      c.torso = B.shape([[46, 88], [33, 92], [22, 100], [19, 114], [19, 176], [104, 176], [106, 116], [102, 100], [91, 91], [74, 87]], nv, { round: 12, name: 'body:torso' });
      B.crease(c.torso, [[60, 106], [60, 176]], 1.0, 1.0);                        // placket
      B.crease(c.torso, [[24, 104], [40, 100], [56, 102]], 0.8, 0.9);             // yoke seam
      B.crease(c.torso, [[32, 152], [42, 161], [52, 163]], 1.2, 1.2);
      B.crease(c.torso, [[86, 152], [76, 160], [68, 162]], 1.0, 1.2);
      c.nearArm = B.tube([[99, 105], [105, 140], [108, 176]], [14.5, 14, 13], nv, { name: 'body:nearArm' });
      B.crease(c.nearArm, [[92, 106], [96, 101], [103, 99]], 1.0, 0.9);             // shoulder seam
      B.crease(c.nearArm, [[92, 124], [96, 142], [98, 162]], 1.4, 1.1);
      B.crease(c.farArm, [[26, 120], [23, 146]], 1.2, 1.1);
    },
    collar(B, c) {
      const nv = P.work_navy;
      // grey undershirt at the open collar
      B.shape([[48, 88], [56, 95], [64, 96], [72, 90], [74, 100], [62, 107], [48, 100]], P.knit_gray, { round: 4, name: 'collar:tee' });
      // spread work-shirt collar
      B.shape([[45, 84], [53, 92], [57, 103], [48, 104], [38, 97], [36, 92]], nv, { round: 3, name: 'collar:1' });
      B.shape([[72, 84], [82, 84], [90, 92], [84, 101], [70, 105], [66, 99]], nv, { round: 3, name: 'collar:2' });
      B.crease(c.neckPart, [[55, 80], [56, 90]], 0.9, 0.8);
      B.bump(c.neckPart, 58.5, 86, 1.6, 2, 1.3);                                  // Adam's apple
    },
    front(B, c) {
      const r = c.hr, sk = c.sk;
      // thinning crew cut: flat on top, receding at the temples, short over the ears
      B.shape([[34, 41], [33, 30], [35, 20], [41, 13], [50, 10], [62, 9], [74, 10], [84, 14], [90, 22], [93, 32], [92, 42],
        [87, 42], [84, 34], [80, 27], [73, 24], [65, 25], [58, 26.5], [51, 25.5], [45, 27], [40, 31], [37, 41]], r, { kind: 'hair', round: 5, name: 'hair:crown' });
      // big ear, standing off the head
      const ear = B.shape([[78, 42], [83, 38.5], [89, 40], [92.5, 46], [92, 54], [88.5, 61], [83, 63.5], [79.5, 60]], sk, { kind: 'skin', round: 3.5, name: 'ear' });
      B.crease(ear, [[84.5, 44], [87, 49], [85.5, 56]], 1.6, 1.0);
      B.crease(ear, [[81.5, 50], [83, 54]], 0.8, 0.8);
    },
    details(s, c) {
      const h = c.h, sk = c.sk, nv = P.work_navy, g = P.hair_gray, b = c.ex.brow;
      const W = s.w;
      const rampOf = (x, y) => (s.get(x, y) & 0x7ff0) >> 4;
      if (!faceMask) { const m = new PX.Surf(W, s.h); m.poly(RIG.facePoly(h), 1); faceMask = m.d; }
      // crew cut: a few bristle strokes, a ragged hairline with scalp showing through
      for (let x = 34; x < 96; x++) {
        let y = 6; while (y < 30 && !s.get(x, y)) y++;
        if (rampOf(x, y) !== g.id) continue;
        // y = top outline pixel: notch the flat top into bristles
        if (x % 4 === 1 && x > 38 && x < 90) { s.px(x, y - 1, g[0]); s.px(x, y, g[3]); }
        if (x % 4 === 3 && x > 40 && x < 86) { s.px(x, y + 2, g[5]); s.px(x, y + 3, g[4]); }
      }
      for (let x = 38; x < 84; x++) {
        let y = 40; while (y > 14 && rampOf(x, y) === sk.id) y--;
        if (rampOf(x, y) !== g.id) continue;
        // y = lowest hair pixel of this column: darker tips, a few gaps where the scalp shows
        if (x % 3 === 0) RIG.over(s, x, y - 1, g, -1);
        if (x % 5 === 2) s.px(x, y, sk[Math.min(5, (s.get(x, y) & 15) + 1)]);
      }
      // bushy grey brows: a lighter row over the rig's brows
      const [nx, nw] = h.nearEye, [fx, fw] = h.farEye;
      RIG.brow(s, nx, nx + nw + 1, h.browY - 1, b[0] + (b[2] || 0), b[1], g[3], g[3], 1);
      RIG.brow(s, fx + fw - 1, fx - 2, h.browY - 1, b[0], b[1], g[3], g[3], 1);
      // tired, hooded eyes: the lid folds over the outer lash line; the whites a touch dimmer
      const st = c.o.blink ? (['happy', 'cry'].includes(c.ex.eye) ? c.ex.eye : 'closed') : c.ex.eye;
      if (['open', 'sad', 'soft', 'wide'].includes(st)) {
        const K = c.hr[0], y = h.eyeY + (st === 'wide' ? 1 : 0);
        for (let k = nw - 4; k < nw; k++) { s.px(nx + k, y, sk[3]); s.px(nx + k, y + 1, K); }
        s.px(nx + nw - 1, y + 2, K);
        for (let k = 0; k < 3; k++) { s.px(fx + k, y, sk[2]); s.px(fx + k, y + 1, K); }
      }
      for (let y = h.eyeY; y < h.eyeY + 7; y++) for (let x = fx; x < nx + nw; x++) if (s.get(x, y) === P.white[4]) s.px(x, y, P.white[3]);
      // deep-set eyes: the socket shadow under the brow ridge
      for (let x = nx + 1; x < nx + nw - 1; x++) { const y = h.eyeY - 1; if (rampOf(x, y) === sk.id && (s.get(x, y) & 15) > 2) s.px(x, y, sk[2]); }
      for (let x = fx; x < fx + fw - 1; x++) { const y = h.eyeY - 1; if (rampOf(x, y) === sk.id && (s.get(x, y) & 15) > 2) s.px(x, y, sk[2]); }
      // grey stubble: weathered skin cooled toward grey, sparse light whiskers
      const top = (x) => (Math.abs(x - h.mouthX) < 7 ? h.noseY + 9 : h.noseY + 10 + (x > h.mouthX ? Math.max(0, 76 - x) * 0.25 : Math.max(0, x - 40) * 0.3));
      for (let y = h.noseY + 8; y <= h.chinY + 1; y++) for (let x = h.l; x < h.r - 2; x++) {
        if (!faceMask[y * W + x] || rampOf(x, y) !== sk.id) continue;
        if (Math.abs(x - h.mouthX) < 6 && y >= h.mouthY - 1 && y <= h.mouthY + 4) continue;
        const d = (y - top(x)) / 3;
        if (d <= 0 || PX.bayer(x, y) > d) continue;
        const sh = s.get(x, y) & 15;
        s.px(x, y, P.stubble_warm[sh]);
        if (sh >= 2 && (x * 3 + y * 5) % 7 === 0) s.px(x, y, sh >= 4 ? g[5] : sh === 3 ? g[4] : g[3]);
      }
      // crow's feet, marionette lines, the inner ear
      const ex = nx + nw;
      if (rampOf(ex + 2, h.eyeY + 4) === sk.id) { s.px(ex + 2, h.eyeY + 4, sk[2]); s.px(ex + 3, h.eyeY + 3, sk[2]); s.px(ex + 2, h.eyeY + 6, sk[2]); s.px(ex + 3, h.eyeY + 7, sk[2]); }
      s.line(h.mouthX + 6, h.mouthY + 3, h.mouthX + 7, h.mouthY + 7, sk[2]);
      // forehead: two broken furrows
      for (const [x0, x1, y] of [[45, 52, 31], [55, 68, 30], [48, 58, 34], [61, 70, 33.5]]) for (let x = x0; x <= x1; x++) { const yy = Math.round(y + Math.sin(x * 0.5) * 0.4); if (rampOf(x, yy) === sk.id && (s.get(x, yy) & 15) >= 4) s.px(x, yy, sk[3]); }
      // pockets with flaps
      const pocket = (x, y, w) => {
        for (let xx = x; xx < x + w; xx++) { RIG.over(s, xx, y, nv, 1); RIG.over(s, xx, y + 6, nv, -2); RIG.over(s, xx, y + 20, nv, -2); }
        for (let yy = y; yy <= y + 20; yy++) { RIG.over(s, x, yy, nv, -1); RIG.over(s, x + w - 1, yy, nv, -2); }
        s.px(x + (w >> 1), y + 4, P.metal[4]); s.px(x + (w >> 1), y + 5, P.metal[2]);
      };
      pocket(29, 121, 18); pocket(71, 121, 19);
      for (const y of [114, 134, 154, 174]) { s.px(61, y, P.metal[3]); s.px(61, y + 1, P.metal[1]); }
      // briar pipe in the far pocket: the bowl above the flap, the stem curving up
      const wd = P.wood_dark;
      [[33, 117, 3], [34, 117, 4], [35, 117, 4], [36, 117, 3], [33, 118, 3], [34, 118, 4], [35, 118, 3], [36, 118, 2], [33, 119, 2], [34, 119, 3], [35, 119, 2], [36, 119, 1], [34, 120, 2], [35, 120, 1]].forEach(([x, y, k]) => s.px(x, y, wd[k]));
      s.px(34, 116, wd[1]); s.px(35, 116, wd[1]); s.px(33, 116, wd[2]); s.px(36, 116, wd[2]);
      s.line(37, 119, 41, 116, wd[2]); s.line(41, 115, 43, 113, P.ink[2]);
      // oval name patch (the name itself is a decal)
      const { x: px0, y: py0, rx, ry } = PATCH;
      s.ellipse(px0, py0, rx + 1, ry + 1, P.patch_red[1]);
      s.ellipse(px0, py0, rx, ry, (x, y, ux, uy) => P.white_cloth[ux + uy < -0.7 ? 5 : ux + uy > 0.6 ? 3 : 4]);
      // ring of keys on the near pocket button
      s.ring(80.5, 131, 3, 3, P.chrome[3]);
      const key = (x, y, len, r) => { for (let k = 0; k < len; k++) s.px(x, y + k, r[k === 0 ? 4 : 3]); s.px(x + 1, y + len - 1, r[2]); s.px(x + 1, y + 1, r[2]); s.px(x - 1, y + 1, r[2]); };
      key(77, 134, 6, P.chrome); key(79, 135, 8, P.mustard); key(81, 134, 7, P.chrome); key(84, 133, 5, P.metal);
    },
    decal(s, o) {
      const cx = o.flip ? PX.SW - 1 - PATCH.x : PATCH.x;
      const word = 'TEAGUE', x0 = Math.round(cx) - 11, y0 = PATCH.y - 2;
      for (let i = 0; i < word.length; i++) {
        const g = FONT[word[i]];
        for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (g[r][k] === '#') s.px(x0 + i * 4 + k, y0 + r, P.patch_red[2]);
      }
    },
    portraitBox: [20, 12, 76, 76]
  });
})();
