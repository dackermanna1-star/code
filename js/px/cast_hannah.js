/* Hannah Gagnon — 8, the girl next door. Knows the rhyme; says what grown-ups
 * won't. A round little face with big eyes set low, light-brown pigtails
 * with plastic bobbles, a gap in her front teeth; a hot-pink sweatshirt with
 * a cracked rainbow iron-on. She stands shorter than everyone else. */
(function () {
  'use strict';
  const P = PX.P, RIG = PX.RIG;
  PX.ramp('hair_fawn', ['#2e1c14', '#553522', '#7f5333', '#a57449', '#c69662', '#e0b886']);
  PX.ramp('kid_pink', ['#4a1030', '#82204f', '#b8357a', '#e0559c', '#f685bb', '#ffbfdc']);

  PX.person('hannah', {
    name: 'hannah',
    skin: 'skin_fair', hair: 'hair_fawn', eyes: 'eye_blue', lips: 'lip',
    lashes: false, rosy: 1, browThick: 2,
    head: {
      l: 37, r: 83, top: 36, eyeY: 58, browY: 53, chinY: 82, chinX: 57, jaw: 0.2, cheek: 1.2,
      nearEye: [60, 12], farEye: [42, 9], noseX: 54, noseY: 63, mouthX: 56, mouthY: 73, ear: [81, 60], neck: 7.5
    },
    faceBumps: [
      [54.5, 67, 1.3, 3, -2.2],                               // a button nose: flatten the ridge
      [67, 69, 5.5, 4.5, 1.3], [44, 68, 3.5, 4, 0.8],          // round cheeks
      [60, 42, 12, 7, 1.0]                                     // a big forehead
    ],
    back(B, c) {
      const r = c.hr;
      // pigtails sticking out from high on each side
      B.lock([[36, 46], [29, 51], [25, 60], [25, 71], [28, 80], [32, 84]], [6, 10, 11, 10, 7, 3], r, { name: 'hair:pig1', tone: -1 });
      B.lock([[89, 44], [97, 49], [101, 58], [102, 69], [100, 79], [96, 84]], [6, 11, 12, 11, 7, 3], r, { name: 'hair:pig2' });
      // the back of the head
      B.shape([[42, 24], [56, 19], [72, 20], [86, 26], [93, 38], [94, 54], [90, 66], [82, 70], [76, 62], [72, 36]], r, { kind: 'hair', round: 9, name: 'hair:back', tone: -1 });
    },
    body(B, c) {
      const pk = P.kid_pink;
      c.farArm = B.tube([[34, 108], [29, 140], [27, 176]], [10, 9.5, 9], pk, { name: 'body:farArm', tone: -1, kind: 'soft' });
      c.torso = B.shape([[51, 88], [41, 92], [33, 99], [31, 114], [32, 176], [89, 176], [91, 114], [89, 98], [81, 91], [71, 87]], pk, { kind: 'soft', round: 11, name: 'body:torso' });
      B.crease(c.torso, [[44, 146], [52, 156], [58, 158]], 1.2, 1.2);
      c.nearArm = B.tube([[87, 104], [92, 140], [94, 176]], [10.5, 10, 9.5], pk, { name: 'body:nearArm', kind: 'soft' });
      B.crease(c.nearArm, [[82, 106], [85, 100], [90, 98]], 1.0, 0.9);
      B.crease(c.nearArm, [[82, 120], [86, 140], [88, 160]], 1.2, 1.0);
      B.crease(c.farArm, [[35, 120], [33, 144]], 1.1, 1.0);
    },
    collar(B, c) {
      // the sweatshirt's front over the neck, and the ribbed crew neck
      B.shape([[47, 88], [55, 93], [62, 94], [69, 92], [76, 87], [80, 100], [44, 100]], P.kid_pink, { kind: 'soft', round: 5, name: 'collar:front' });
      B.tube([[49, 88], [55, 93], [62, 94], [69, 92], [74, 87]], 2.4, P.kid_pink, { name: 'collar:rib', kind: 'soft', tone: 1 });
    },
    front(B, c) {
      const r = c.hr;
      // crown with a centre part, choppy little bangs well above the brows
      B.shape([[34, 52], [33, 38], [38, 28], [48, 22], [62, 20], [76, 22], [86, 29], [91, 40], [90, 52], [86, 46], [82, 38], [74, 34], [62, 33], [50, 35], [42, 40], [37, 52]], r, { kind: 'hair', round: 8, name: 'hair:crown' });
      B.lock([[56, 24], [52.5, 32], [51, 41]], [9, 9, 6], r, { name: 'hair:bang1' });
      B.lock([[62, 24], [61.5, 33], [62, 42]], [9, 9, 6], r, { name: 'hair:bang2', tone: 1 });
      B.lock([[68, 25], [71, 33], [73, 41]], [9, 9, 6], r, { name: 'hair:bang3' });
      B.lock([[50, 26], [45, 34], [41.5, 42]], [9, 8, 5], r, { name: 'hair:bang4', tone: -1 });
    },
    details(s, c) {
      const h = c.h, pk = P.kid_pink, hr = c.hr;
      const rampOf = (x, y) => (s.get(x, y) & 0x7ff0) >> 4;
      // the centre part
      for (let y = 21; y < 32; y++) { const x = Math.round(61 - (y - 21) * 0.25); if (rampOf(x, y) === hr.id) s.px(x, y, hr[1]); }
      // big kid eyes: open states get one more row of white and iris
      const st = c.o.blink ? (['happy', 'cry'].includes(c.ex.eye) ? c.ex.eye : 'closed') : c.ex.eye;
      if (st === 'open' || st === 'sad' || st === 'wide') {
        const ir = c.ir, sk = c.sk, y4 = h.eyeY + (st === 'wide' ? 5 : 4);
        for (const [x0, w] of [h.nearEye, h.farEye]) for (let x = x0 + 1; x < x0 + w - 1; x++) {
          const v = s.get(x, y4), id = (v & 0x7ff0) >> 4;
          if (id === ir.id) { s.px(x, y4 + 1, ir[(v & 15) >= 4 ? 4 : 3]); s.px(x, y4 + 2, sk[3]); }
          else if (v === P.white[4] || v === P.white[2]) { s.px(x, y4 + 1, P.white[4]); s.px(x, y4 + 2, sk[3]); }
        }
      }
      // gap in the front teeth
      for (let y = h.mouthY - 1; y <= h.mouthY + 2; y++) if (s.get(h.mouthX, y) === P.white[4]) s.px(h.mouthX, y, P.lip[0]);
      // plastic bobbles on the hair ties
      const bob = (x, y, r) => { s.px(x, y, r[4]); s.px(x + 1, y, r[3]); s.px(x, y + 1, r[3]); s.px(x + 1, y + 1, r[2]); s.px(x - 1, y, r[3]); s.px(x, y - 1, r[3]); s.px(x - 1, y - 1, r[5]); s.px(x - 1, y + 1, r[2]); s.px(x + 1, y - 1, r[3]); };
      bob(34, 47, P.pink); bob(31, 50, P.pink);
      bob(91, 45, P.tv); bob(94, 48, P.tv);
      // a cracked rainbow iron-on with two little clouds
      const cx = 61, cy = 126;
      const bands = [P.red, P.leaf_orange, P.yellow, P.grass, P.denim];
      for (let y = cy - 16; y <= cy; y++) for (let x = cx - 17; x <= cx + 17; x++) {
        if (rampOf(x, y) !== pk.id) continue;
        const d = Math.hypot((x - cx) * 0.95, (y - cy) * 1.1), k = Math.floor((16 - d) / 2.4);
        if (k < 0 || k >= bands.length || d > 16) continue;
        if ((x * 7 + y * 3) % 11 === 0) continue;   // the cracks
        RIG.over(s, x, y, bands[k], 0);
      }
      const cloud = (x, y) => {
        for (const [bx, by, br] of [[-3, 0, 2.2], [0, -1.5, 2.8], [3, 0, 2.2]]) for (let dy = -4; dy <= 3; dy++) for (let dx = -4; dx <= 4; dx++) {
          const xx = x + bx + dx, yy = y + by + dy;
          if ((dx * dx + dy * dy) <= br * br && yy <= y + 2 && rampOf(xx, yy) === pk.id) RIG.over(s, xx, yy, P.white_cloth, dy + by < -1.5 ? 2 : 1);
        }
      };
      cloud(cx - 14, cy); cloud(cx + 14, cy);
    },
    portraitBox: [20, 16, 76, 76]
  });
})();
