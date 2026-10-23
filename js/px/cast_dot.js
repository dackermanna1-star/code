/* Dot Carrier — 64, Dot's Diner: gossip, pie, free coffee for new kids. Her
 * son Daniel was Kept in 1971; she "never had children". Teased bouffant dyed
 * red (grey at the roots), black cat-eye glasses on a beaded chain, blue
 * eyeshadow and red lipstick; a pink diner uniform, white bib apron, a pencil
 * behind her ear, a name tag. */
(function () {
  'use strict';
  const P = PX.P, RIG = PX.RIG;
  PX.ramp('diner_pink', ['#3d1626', '#6b2a43', '#9a4462', '#c3667f', '#df8fa2', '#f3bcc6']);
  PX.ramp('shadow_blue', ['#26305a', '#3d4f8a', '#5a74b4', '#7f9bd2', '#a9c0e6', '#d2e0f5']);
  PX.ramp('pin_brass', ['#3a2508', '#6b4a12', '#9c751f', '#c9a032', '#e8c75a', '#fbeaa0']);

  /* parts painted over the face features (the glasses): pixel list recorded at build time */
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
  const FONT = { D: ['##.', '#.#', '#.#', '#.#', '##.'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'], T: ['###', '.#.', '.#.', '.#.', '.#.'] };
  const TAG = { x: 80, y: 113 };

  PX.person('dot', {
    name: 'dot',
    skin: 'skin_old', hair: 'hair_red', eyes: 'eye_brown', lips: 'lip_red', brow: 'hair_auburn',
    lashes: true, rosy: 1, browThick: 1,
    head: {
      l: 35, r: 82, top: 27, eyeY: 47, browY: 39.5, chinY: 79, chinX: 56, jaw: 1, cheek: 1.6,
      nearEye: [59, 10], farEye: [42, 7], noseX: 53, noseY: 53, mouthX: 55, mouthY: 68, ear: [80, 50], neck: 9
    },
    faceBumps: [[68, 62, 4.5, 3.5, 1.2], [42, 61, 3, 3.5, 0.9], [72, 75, 4, 3, 0.7]],
    back(B, c) {
      const r = c.hr;
      // the bouffant's back: high and round, the ends flipped under at the jaw
      B.shape([[36, 18], [43, 7], [57, 1], [74, 1.5], [88, 7], [98, 18], [103, 34], [102, 52], [98, 64], [90, 70], [82, 66], [74, 58], [40, 58], [32, 52], [30, 34]], r, { kind: 'hair', round: 10, name: 'hair:back', tone: -1 });
      B.lock([[90, 44], [97, 56], [96, 66], [89, 70], [85, 66]], [12, 11, 9, 6, 3], r, { name: 'hair:flip1', tone: -1 });
    },
    body(B, c) {
      const pk = P.diner_pink, sk = c.sk;
      // bare arms below short puffed sleeves
      c.farArm = B.tube([[25, 116], [21, 146], [19, 176]], [9.5, 9, 8.5], sk, { kind: 'skin', name: 'body:farArm', tone: -1 });
      c.nearArm = B.tube([[97, 114], [101, 146], [103, 176]], [10, 9.5, 9], sk, { kind: 'skin', name: 'body:nearArm' });
      c.torso = B.shape([[48, 89], [35, 93], [26, 101], [25, 118], [27, 176], [93, 176], [95, 118], [94, 100], [86, 92], [71, 88]], pk, { round: 11, name: 'body:torso', bumps: [[50, 122, 8, 7, 2], [72, 121, 8, 7, 1.6]] });
      // puffed sleeves, gathered at the shoulder seam, with white cuffs
      c.slv1 = B.shape([[36, 94], [26, 96], [17, 103], [14, 113], [17, 120], [28, 122], [36, 118], [37, 106]], pk, { round: 7, name: 'body:sleeve1', tone: -1 });
      c.slv2 = B.shape([[86, 93], [96, 93], [105, 99], [109, 109], [107, 118], [96, 121], [86, 117], [84, 104]], pk, { round: 7, name: 'body:sleeve2' });
      B.crease(c.slv2, [[92, 96], [94, 106], [95, 116]], 1.2, 1.0); B.crease(c.slv2, [[100, 97], [103, 107], [103, 116]], 1.1, 1.0);
      B.crease(c.slv1, [[28, 98], [25, 108], [24, 118]], 1.1, 1.0);
      B.tube([[15, 117], [25, 121], [35, 119]], 2.4, P.white_cloth, { name: 'body:cuff1', tone: -1 });
      B.tube([[86, 118], [96, 121], [107, 117]], 2.6, P.white_cloth, { name: 'body:cuff2' });
      // white bib apron on straps, ruffled top edge
      c.bib = B.shape([[45, 108], [76, 106], [78, 176], [43, 176]], P.white_cloth, { round: 6, name: 'body:bib' });
      B.tube([[44, 109], [42, 98], [40, 92]], 2.2, P.white_cloth, { name: 'body:strap1', tone: -1 });
      B.tube([[77, 107], [80, 97], [82, 91]], 2.4, P.white_cloth, { name: 'body:strap2' });
      B.crease(c.bib, [[60, 130], [61, 150], [59, 172]], 1.0, 1.2);
    },
    collar(B, c) {
      // white collar points on the uniform
      B.shape([[47, 86], [56, 93], [58, 101], [49, 103], [42, 96], [42, 90]], P.white_cloth, { round: 3, name: 'collar:1' });
      B.shape([[72, 85], [79, 89], [80, 96], [71, 103], [63, 99], [64, 93]], P.white_cloth, { round: 3, name: 'collar:2', tone: -1 });
    },
    front(B, c) {
      const r = c.hr;
      // teased dome swept up off the forehead, a side swoop, curls flipped under at the cheeks
      B.shape([[31, 46], [29, 30], [34, 15], [46, 5], [62, 2], [78, 5], [90, 13], [96, 26], [96, 40], [90, 44], [86, 33], [78, 27], [66, 25.5], [52, 27], [41, 32], [35, 40], [34, 46]], r, { kind: 'hair', round: 10, name: 'hair:crown' });
      B.lock([[80, 10], [66, 9], [52, 13], [42, 21], [38, 32]], [11, 12, 11, 9, 4], r, { name: 'hair:swoop' });
      B.lock([[34, 40], [30.5, 50], [31, 58], [33.5, 62.5], [35.5, 61]], [10, 10, 9, 6, 3], r, { name: 'hair:curl1' });
      B.lock([[88, 36], [92, 46], [92, 54]], [9, 8, 4], r, { name: 'hair:side', tone: -1 });
    },
    extras(B, c) {
      const ink = P.ink;
      // cat-eye frames: heavy on top, swept up at the outer corners
      const near = [[57, 46.5], [61, 45], [67, 44.4], [72, 43.4], [76.2, 40.6], [75.6, 44.6], [73.6, 49.6], [70, 53.6], [64.5, 55], [59.5, 54.2], [57, 51.2], [56.6, 48.2], [57, 46.5]];
      const far = [[50.6, 46.5], [47, 45], [43, 44.4], [39.6, 43.2], [36.8, 40.8], [37.5, 44.6], [39, 49.6], [42, 53.6], [46.5, 55], [49.6, 54.2], [51.4, 51.2], [51.6, 48.2], [50.6, 46.5]];
      B.tube(near, [1.3, 1.4, 1.5, 1.6, 1.4, 1.1, 0.8, 0.8, 0.8, 0.8, 0.8, 0.9, 1.3], ink, { kind: 'metal', name: 'glasses:near', gloss: 14 });
      B.tube(far, [1.2, 1.3, 1.4, 1.5, 1.3, 1.0, 0.8, 0.8, 0.8, 0.8, 0.8, 0.9, 1.2], ink, { kind: 'metal', name: 'glasses:far', gloss: 14, tone: -1 });
      B.tube([[51.6, 47.5], [54, 46.4], [56.8, 47.5]], 0.8, ink, { kind: 'metal', name: 'glasses:bridge' });
      B.tube([[75, 46], [79, 47.5], [83, 48]], 0.8, ink, { kind: 'metal', name: 'glasses:arm' });
      // pencil tucked behind the near ear
      B.tube([[93, 40], [86, 42.5], [78.5, 45.5]], 1.4, P.yellow, { kind: 'metal', name: 'pencil' });
      over = record(B, 'glasses');
    },
    details(s, c) {
      const h = c.h, sk = c.sk, hr = c.hr, br = P.pin_brass, W = s.w;
      const rampOf = (x, y) => (s.get(x, y) & 0x7ff0) >> 4;
      const [nx, nw] = h.nearEye, [fx, fw] = h.farEye;
      const st = c.o.blink ? (['happy', 'cry'].includes(c.ex.eye) ? c.ex.eye : 'closed') : c.ex.eye;
      // powder-blue eyeshadow in the crease above the lash line
      for (let y = h.eyeY - 2; y < h.eyeY; y++) for (let x = fx - 1; x <= nx + nw; x++) {
        if (rampOf(x, y) !== sk.id) continue;
        const sh = s.get(x, y) & 15;
        if (y === h.eyeY - 1 || x > nx + 4 || x < fx + 2) s.px(x, y, P.shadow_blue[Math.max(1, Math.min(4, sh - 1))]);
      }
      // age: smile lines, marionette lines, a softened jaw
      s.line(h.noseX + 5, h.noseY + 8, h.mouthX + 7, h.mouthY + 1, sk[2]);
      s.line(h.mouthX + 6, h.mouthY + 3, h.mouthX + 7, h.mouthY + 6, sk[2]);
      // grey roots along the parting and the hairline
      for (let x = 44; x < 84; x++) { let y = 44; while (y > 20 && rampOf(x, y) === sk.id) y--; if (rampOf(x, y) === hr.id && x % 2 === 0) RIG.over(s, x, y, P.hair_gray, 1); }
      // the frames over the eyes and brows, and a glint on each lens
      repaint(s, c, over);
      s.px(58, 47, P.white[5]); s.px(58, 48, P.white[3]); s.px(57.5 + 1, 49, P.white[2]);
      s.px(41, 47, P.white[4]); s.px(41, 48, P.white[2]);
      s.px(76, 41, P.white[5]); s.px(37, 41, P.white[4]);   // rhinestones at the tips
      // beaded chain looping from the temples behind the neck
      const chain = (pts) => { let k = 0; for (let i = 1; i < pts.length; i++) s.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], () => (k++ % 2 ? br[2] : br[4])); };
      chain([[85, 52], [87, 60], [86, 70], [81, 80], [74, 88]]);
      chain([[36, 50], [35, 60], [38, 72], [44, 84]]);
      // pencil: pink eraser, ferrule, sharpened point
      s.px(93, 39, P.pink[4]); s.px(94, 40, P.pink[3]); s.px(93, 40, P.pink[3]); s.px(92, 41, P.chrome[3]); s.px(91, 41, P.chrome[4]);
      s.px(79, 45, P.wood_pale[4]); s.px(78, 46, P.wood_pale[3]); s.px(77, 46, P.ink[2]);
      // uniform buttons, apron pocket with an order pad, a ruffle on the bib
      for (let x = 44; x <= 77; x += 3) { RIG.over(s, x, 107, P.white_cloth, 1); RIG.over(s, x + 1, 108, P.white_cloth, -1); }
      for (let x = 48; x < 70; x++) RIG.over(s, x, 150, P.white_cloth, -1);
      for (let y = 150; y < 160; y++) { RIG.over(s, 48, y, P.white_cloth, -1); RIG.over(s, 69, y, P.white_cloth, -1); }
      for (let y = 146; y < 151; y++) for (let x = 52; x < 58; x++) s.px(x, y, P.paper[x === 52 || y === 146 ? 5 : 4]);
      s.px(62, 144, P.ink[3]); s.px(62, 145, P.ink[2]); for (let y = 146; y < 151; y++) s.px(62, y, P.red[3]);
      // name tag (the name is a decal)
      for (let y = TAG.y - 4; y <= TAG.y + 4; y++) for (let x = TAG.x - 8; x <= TAG.x + 8; x++) {
        const edge = y === TAG.y - 4 || y === TAG.y + 4 || x === TAG.x - 8 || x === TAG.x + 8;
        s.px(x, y, edge ? br[1] : P.white_cloth[y < TAG.y - 1 ? 5 : 4]);
      }
    },
    decal(s, o) {
      const cx = o.flip ? PX.SW - 1 - TAG.x : TAG.x, x0 = cx - 5, y0 = TAG.y - 2;
      'DOT'.split('').forEach((ch, i) => { const g = FONT[ch]; for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (g[r][k] === '#') s.px(x0 + i * 4 + k, y0 + r, P.red[2]); });
    },
    portraitBox: [20, 10, 76, 76]
  });
})();
