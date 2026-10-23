/* Claire (Mom), 44. ER nurse, tired and sardonic. Dark curls streaked grey,
 * twisted up in a tortoiseshell claw clip with strands escaping; reading
 * glasses pushed up on her head; cornflower scrubs under a long grey cardigan;
 * a hospital ID badge and a pen. */
(function () {
  'use strict';
  const P = PX.P, RIG = PX.RIG;
  PX.ramp('scrubs_cornflower', ['#141a3c', '#232f66', '#374e96', '#5272c0', '#7b9ce0', '#adc6f4']);
  PX.ramp('tortoiseshell', ['#1a0d0b', '#35190f', '#5a2e15', '#86491d', '#b4732f', '#dca456']);
  PX.ramp('hair_salt', ['#1c1418', '#362c32', '#54494e', '#776c6e', '#9b9190', '#bdb5b0']);

  /* 1px ellipse outline (4-neighbour boundary of the filled ellipse); fn(x, y, nx, ny) -> code */
  function ringPx(s, cx, cy, rx, ry, fn) {
    const inside = (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
    for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx); x++) {
      if (!inside(x, y) || (inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))) continue;
      const c = fn(x, y, (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
      if (c) s.px(x, y, c);
    }
  }
  /* a curl: a lock wound around a centre (a0 start angle, turn in radians, dir ±1) */
  function curl(B, cx, cy, r, ramp, o = {}) {
    const a0 = o.a0 || 0, turn = o.turn || 4.2, dir = o.dir || 1, n = 7, sp = [];
    for (let i = 0; i < n; i++) { const t = i / (n - 1), a = a0 + dir * turn * t, rr = r * (1 - 0.55 * t); sp.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    return B.lock(sp, o.w || r * 1.3, ramp, Object.assign({ tip: 0.8 }, o));
  }
  /* darken a face pixel one shade (age lines that follow the lighting) */
  const crease = (s, c, x, y) => { const v = s.get(x, y); if (v && ((v & 0x7ff0) >> 4) === c.sk.id && (v & 15) >= 2) s.px(x, y, PX.sh(v, -1)); };

  PX.person('mom', {
    name: 'mom',
    skin: 'skin_peach', hair: 'hair_dark', eyes: 'eye_brown', lips: 'lip',
    lashes: true, nose: 'long', browThick: 2,
    head: { l: 37, r: 82, top: 22, eyeY: 41, chinY: 73, chinX: 55, jaw: -1, cheek: 0.5, nearEye: [58, 10], farEye: [42, 7], browY: 36, noseX: 52, noseY: 48, mouthX: 54, mouthY: 62, ear: [80, 43], neck: 8.5 },
    faceBumps: [[44, 56, 3, 3, -0.6], [71, 57, 3.5, 3.5, -0.8], [62, 50, 3, 1.2, 0.4]],
    portraitBox: [20, 2, 76, 76],
    back(B, c) {
      const r = c.hr, g = P.hair_salt;
      // the back of the head and the nape under the twist
      B.shape([[40, 14], [58, 5], [78, 6], [92, 14], [99, 28], [99, 44], [95, 58], [88, 68], [80, 70], [74, 56], [60, 40], [44, 32]], r, { kind: 'hair', round: 9, name: 'hair:back', tone: -1 });
      // the curls sprouting from the claw clip: a soft mass, then fat curls
      B.shape([[86, 16], [84, 9], [89, 3], [97, 1], [105, 4], [109, 11], [108, 19], [101, 21], [93, 20]], r, { kind: 'hair', round: 5, name: 'hair:fount', tone: -1 });
      curl(B, 87, 8, 5, r, { a0: 2.6, dir: 1, w: 8, name: 'hair:t1', tone: -1 });
      curl(B, 96, 5, 5.5, r, { a0: 3.4, dir: 1, w: 9, name: 'hair:t2' });
      curl(B, 92, 12, 3.5, r, { a0: 3.8, dir: -1, w: 6, name: 'hair:t5' });
      curl(B, 104, 9, 5, g, { a0: 4.4, dir: 1, w: 8, name: 'hair:t3', tone: -1 });
      curl(B, 105, 17, 4.5, r, { a0: 5.2, dir: 1, w: 7, name: 'hair:t4', tone: -1 });
    },
    body(B, c) {
      const kg = P.knit_gray, sc = P.scrubs_cornflower, sk = c.sk;
      B.tube([[31, 104], [24, 140], [21, 176]], [11, 10.5, 10], kg, { name: 'body:farArm', tone: -2, kind: 'soft' });
      B.shape([[50, 84], [41, 87], [32, 93], [26, 104], [24, 122], [25, 176], [95, 176], [96, 120], [93, 100], [85, 89], [70, 84]], kg, { round: 12, name: 'body:torso', kind: 'soft', tone: -1 });
      B.shape([[48, 82], [71, 82], [66, 94], [59, 102], [52, 94]], sk, { kind: 'skin', round: 6, name: 'body:chest' });
      c.scrub = B.shape([[47, 86], [51, 92], [55, 97], [59, 101], [63, 97], [67, 92], [71, 86], [78, 91], [80, 118], [80, 176], [40, 176], [40, 118], [41, 91]], sc, { round: 8, name: 'body:scrubs' });
      B.crease(c.scrub, [[52, 126], [55, 150], [53, 172]], 1.1, 1.2);
      B.crease(c.scrub, [[68, 130], [66, 160]], 0.9, 1.1);
      const f1 = B.shape([[45, 85], [39, 88], [32, 95], [27, 108], [26, 124], [27, 176], [47, 176], [46, 140], [45, 112], [44, 94]], kg, { round: 7, name: 'body:front1', kind: 'soft', tone: -1 });
      const f2 = B.shape([[73, 85], [83, 89], [90, 98], [93, 116], [92, 176], [75, 176], [75, 140], [76, 112], [75, 94]], kg, { round: 7, name: 'body:front2', kind: 'soft', tone: -1 });
      B.shape([[42, 88], [46, 86], [48, 98], [49, 176], [44, 176], [43, 118]], kg, { round: 2, name: 'body:band1', kind: 'soft', tone: -1 });
      B.shape([[72, 86], [76, 88], [76, 118], [76, 176], [71, 176], [71, 98]], kg, { round: 2, name: 'body:band2', kind: 'soft', tone: -1 });
      B.crease(f1, [[31, 132], [38, 150], [42, 168]], 1.2, 1.2);
      B.crease(f2, [[90, 130], [84, 152], [80, 170]], 1.2, 1.2);
      c.arm2 = B.tube([[90, 102], [98, 140], [101, 176]], [12, 11.5, 11], kg, { name: 'body:nearArm', kind: 'soft', tone: -1 });
      B.crease(c.arm2, [[94, 124], [99, 129], [103, 127]], 1.3, 1);
      B.crease(c.arm2, [[97, 150], [102, 154]], 1.1, 1);
    },
    front(B, c) {
      const r = c.hr, g = P.hair_salt;
      // loose curls pulled back off the face
      c.crown = B.shape([[34, 44], [32, 30], [36, 18], [45, 9], [57, 4], [71, 4], [83, 8], [92, 15], [97, 25], [98, 38], [94, 47], [88, 46], [84, 37], [79, 30], [72, 26.5], [64, 25], [56, 24.5], [49, 26], [43, 30], [39, 36], [37, 44]], r, { kind: 'hair', round: 7, name: 'hair:crown' });
      for (let y = 9; y < 44; y += 5) for (let x = 37 + ((y / 5) % 2) * 2.7; x < 98; x += 5.5) B.bump(c.crown, x, y, 1.5, 1.4, 2.2);
      B.lock([[42, 31], [45, 20], [53, 12], [64, 8], [78, 9]], 9, r, { name: 'hair:l1' });
      B.lock([[57, 25], [64, 18], [74, 15], [86, 17]], 8, r, { name: 'hair:l2', tone: -1 });
      B.lock([[66, 25], [74, 21], [84, 21], [93, 25]], 8, r, { name: 'hair:l3' });
      B.lock([[40, 34], [42, 27], [46, 22], [51, 19], [56, 14], [62, 12], [68, 9], [75, 10]], 3.2, g, { name: 'hair:g1', tip: 0.9 });
      B.lock([[62, 20], [68, 18], [72, 15], [79, 15], [84, 13]], 2.6, g, { name: 'hair:g2', tip: 0.8 });
      B.lock([[77, 29], [85, 29], [93, 34]], 8, r, { name: 'hair:l4', tone: -1 });
      // the twist up the back of the head
      B.lock([[93, 48], [97, 38], [97, 28], [95, 18]], [8, 10, 9, 7], r, { name: 'hair:twist' });
      // curls along the hairline and escaping strands
      curl(B, 39, 31, 3.5, r, { a0: 4, dir: -1, name: 'hair:c1' });
      curl(B, 47, 26, 3.5, r, { a0: 4.5, dir: -1, name: 'hair:c2' });
      B.lock([[50, 25], [47, 29], [49, 32]], 3.5, r, { name: 'hair:fore' });
      B.lock([[38, 33], [34, 38], [37, 43], [34, 48], [36, 53], [34, 57]], 5, g, { name: 'hair:curl1' });
      B.lock([[36, 36], [33, 41], [35, 46], [33, 51]], 3.5, r, { name: 'hair:curl2' });
      B.lock([[81, 31], [84, 36], [81, 41], [83, 46], [81, 51]], 4, r, { name: 'hair:curl3' });
      B.lock([[91, 50], [93, 56], [90, 61], [92, 67]], 4, r, { name: 'hair:curl4', tone: -1 });
      // the claw clip gripping the top of the twist
      const t = P.tortoiseshell;
      c.clip = B.shape([[88, 15], [94, 12], [101, 12], [105, 15], [104, 21], [98, 23], [91, 22]], t, { kind: 'metal', round: 3, name: 'hat:clip', gloss: 14, tone: -1 });
      B.crease(c.clip, [[95, 13], [95, 22]], 1.1, 0.8);
      B.crease(c.clip, [[100, 13], [100, 22]], 1.1, 0.8);
      for (let k = 0; k < 4; k++) B.tube([[92.5 + k * 3.5, 21], [92 + k * 3.5, 25]], 0.8, t, { kind: 'metal', name: 'hat:tooth' + k, tone: -1 });
    },
    details(s, c) {
      const t = P.tortoiseshell, sc = P.scrubs_cornflower, kg = P.knit_gray, h = c.h;
      // tortoiseshell mottling on the clip
      [[92, 16], [97, 15], [93, 19], [102, 15], [98, 19], [103, 19], [90, 18]].forEach(([x, y]) => s.px(x, y, t[(x + y) % 3 ? 4 : 5]));
      // reading glasses pushed up to her hairline: the hair shows through the lenses, lighter, with a glint
      const lens = (x0, y0, w, hh, far) => {
        for (let y = y0 + 1; y < y0 + hh - 1; y++) for (let x = x0 + 1; x < x0 + w - 1; x++) { const q = s.get(x, y); if (q) s.px(x, y, PX.sh(q, 2)); }
        for (let x = x0 + 1; x < x0 + w - 1; x++) { s.px(x, y0, t[far ? 3 : 4]); s.px(x, y0 + hh - 1, t[1]); }
        for (let y = y0 + 1; y < y0 + hh - 1; y++) { s.px(x0, y, t[far ? 2 : 3]); s.px(x0 + w - 1, y, t[1]); }
        s.px(x0 + 2, y0 + hh - 2, P.white[4]); s.px(x0 + 3, y0 + hh - 3, P.white[4]); s.px(x0 + 4, y0 + hh - 4, P.white[3]);
      };
      lens(60, 16, 11, 7, false);
      lens(46, 17, 8, 6, true);
      s.hline(54, 59, 18, t[3]); s.px(55, 19, t[1]);
      s.path([[71, 18], [79, 18], [87, 21]], t[2]);
      // tired eyes and the start of smile lines
      for (let x = h.nearEye[0] + 2; x < h.nearEye[0] + h.nearEye[1] - 2; x++) crease(s, c, x, h.eyeY + 7);
      crease(s, c, h.nearEye[0] + 1, h.eyeY + 6); crease(s, c, h.farEye[0] + 2, h.eyeY + 7); crease(s, c, h.farEye[0] + 3, h.eyeY + 7); crease(s, c, h.farEye[0] + 4, h.eyeY + 7);
      [[57, 57], [58, 58], [59, 59], [59, 60]].forEach(([x, y]) => crease(s, c, x, y));
      [[48, 57], [47, 58], [47, 59]].forEach(([x, y]) => crease(s, c, x, y));
      // ribbed button bands
      for (let y = 88; y < 176; y++) { if (y % 2) { RIG.over(s, 45, y, kg, -1); RIG.over(s, 73, y, kg, -1); } }
      // ID badge on the scrub top
      const bx = 50, by = 110;
      for (let y = by; y < by + 11; y++) for (let x = bx; x < bx + 8; x++) s.px(x, y, (x === bx || y === by || x === bx + 7 || y === by + 10) ? P.white[1] : P.white[4]);
      s.hline(bx + 1, bx + 6, by + 1, sc[2]); s.hline(bx + 1, bx + 6, by + 2, sc[2]);
      s.rect(bx + 1, by + 4, 2, 3, c.sk[3]); s.px(bx + 1, by + 4, c.hr[2]); s.px(bx + 2, by + 4, c.hr[2]);
      s.hline(bx + 4, bx + 6, by + 4, P.white[2]); s.hline(bx + 4, bx + 5, by + 6, P.white[2]); s.hline(bx + 1, bx + 6, by + 8, P.white[2]);
      s.px(bx + 3, by - 1, P.chrome[4]); s.px(bx + 4, by - 1, P.chrome[2]); s.px(bx + 3, by - 2, P.chrome[3]);
      // pocket and pen
      for (let x = 63; x < 72; x++) RIG.over(s, x, 114, sc, -1);
      for (let y = 114; y < 124; y++) RIG.over(s, 71, y, sc, -1);
      s.vline(66, 106, 114, P.ink[2]); s.px(66, 106, P.ink[4]); s.vline(67, 107, 111, P.chrome[4]);
    }
  });
})();
