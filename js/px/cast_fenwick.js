/* Principal Dale Fenwick — 50s, Derry High's principal and a Lantern Society
 * man. Balding grey (a bare dome, a horseshoe fringe, a hopeful comb-over),
 * a grey walrus mustache, small eyes in a round, ruddy face; brown tweed
 * jacket, white shirt, red bow tie, a brass lantern pin on the lapel. */
(function () {
  'use strict';
  const P = PX.P, RIG = PX.RIG;
  PX.ramp('tweed', ['#1e140f', '#36261b', '#523a28', '#6f5236', '#8c6c48', '#ab8c63']);
  PX.ramp('pin_brass', ['#3a2508', '#6b4a12', '#9c751f', '#c9a032', '#e8c75a', '#fbeaa0']);
  PX.ramp('stubble_fair', ['#4a2139', '#7b4a5c', '#a87882', '#c99d9f', '#dfc0bb', '#f0dcd6']);

  /* parts drawn over the painted mouth (the mustache): pixel index → outline class,
   * recorded once when the body is built */
  let over = null;
  const DOME = { cx: 64, cy: 44, rx: 32, ry: 38 };   // the skull's silhouette
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
        if (q < 0) cls = 1; else if (cls !== 1 && q < p && (B.parts[q].ramp !== part.ramp || (B.parts[q].kind === 'hair' && part.kind === 'hair'))) cls = 2;
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

  PX.person('fenwick', {
    name: 'fenwick',
    skin: 'skin_fair', hair: 'hair_gray', eyes: 'eye_brown', brow: 'hair_gray',
    lashes: false, nose: 'long', lines: 2, rosy: 1, browThick: 2,
    head: {
      l: 34, r: 82, top: 15, eyeY: 43, browY: 38, chinY: 78, chinX: 55, jaw: 3, cheek: 1.6,
      nearEye: [59, 9], farEye: [42, 7], noseX: 52, noseY: 50, mouthX: 55, mouthY: 68, ear: [80, 45], neck: 12
    },
    faceBumps: [
      [52, 57, 2.6, 2.0, 1.6],                                   // round nose tip
      [69, 58, 4.5, 3.5, 1.2], [41, 57, 3, 3.5, 0.9],            // full cheeks
      [72, 72, 4, 3, 1.1], [40, 70, 3, 3, 0.8],                  // jowls
      [58, 24, 14, 9, 1.4]                                       // the dome
    ],
    back(B, c) {
      // fringe round the back of the head, up to the crown
      const arc = []; for (let x = 76; x <= 96; x += 2) arc.push([x, DOME.cy - DOME.ry * Math.sqrt(Math.max(0, 1 - ((x - DOME.cx) / DOME.rx) ** 2)) + 0.5]);
      B.shape(arc.concat([[96.5, 50], [94, 58], [89, 66], [81, 68], [75, 58], [74, 30]]), c.hr, { kind: 'hair', round: 6, name: 'hair:back', tone: -1 });
      B.lock([[93, 32], [95, 45], [92, 58], [87, 66]], [6, 7, 6, 4], c.hr, { name: 'hair:b1', tone: -1 });
      // the far side of the fringe, peeking past the temple
      B.lock([[37, 30], [32, 38], [32, 47], [35, 54]], [5, 7, 6, 3], c.hr, { name: 'hair:far', tone: -1 });
    },
    body(B, c) {
      const tw = P.tweed;
      c.farArm = B.tube([[25, 110], [18, 142], [15, 176]], [14, 13.5, 13], tw, { name: 'body:farArm', tone: -1 });
      c.torso = B.shape([[46, 90], [33, 94], [22, 102], [19, 116], [19, 176], [104, 176], [106, 118], [102, 102], [90, 93], [72, 89]], tw, { round: 12, name: 'body:torso' });
      // white shirt front in the jacket's V
      c.shirt = B.shape([[48, 94], [56, 98], [64, 98], [72, 93], [70, 120], [64, 150], [56, 150], [50, 120]], P.white_cloth, { round: 6, name: 'body:shirt' });
      // notched lapels
      c.lap1 = B.shape([[47, 92], [38, 96], [33, 104], [40, 110], [36, 114], [52, 150], [57, 150], [52, 122]], tw, { round: 4, name: 'body:lapel1' });
      c.lap2 = B.shape([[72, 91], [82, 94], [88, 102], [81, 109], [86, 113], [68, 150], [63, 150], [69, 122]], tw, { round: 4, name: 'body:lapel2' });
      B.crease(c.torso, [[32, 150], [42, 160], [50, 162]], 1.2, 1.2);
      B.crease(c.torso, [[86, 150], [76, 158], [70, 160]], 1.0, 1.2);
      c.nearArm = B.tube([[99, 107], [105, 142], [108, 176]], [14.5, 14, 13], tw, { name: 'body:nearArm' });
      B.crease(c.nearArm, [[92, 108], [96, 103], [103, 101]], 1.0, 0.9);
      B.crease(c.nearArm, [[92, 126], [96, 144], [98, 164]], 1.4, 1.1);
      B.crease(c.farArm, [[26, 122], [23, 148]], 1.2, 1.1);
    },
    collar(B, c) {
      const sk = c.sk;
      B.crease(c.neckPart, [[50, 82], [58, 84], [66, 81]], 0.9, 0.9);
      // white shirt collar and a red bow tie
      B.shape([[47, 86], [56, 92], [55, 97], [46, 96], [42, 90]], P.white_cloth, { round: 3, name: 'collar:1' });
      B.shape([[70, 86], [76, 89], [74, 97], [63, 97], [62, 92]], P.white_cloth, { round: 3, name: 'collar:2' });
      B.shape([[47, 89], [57, 93], [47, 99], [44, 94]], P.red, { round: 2.5, name: 'collar:bow1' });
      B.shape([[73, 88], [61, 93], [74, 100], [77, 94]], P.red, { round: 2.5, name: 'collar:bow2' });
      B.ellipse(59, 93.5, 3.2, 3, P.red, { name: 'collar:knot' });
    },
    front(B, c) {
      const r = c.hr;
      // fringe wrapping forward over the near ear to the temple
      B.lock([[93, 41], [87, 37], [81, 37], [77.5, 40]], [8, 7, 5, 3], r, { name: 'hair:side' });
      // walrus mustache: a full base over the lip, strands fanning down, droops past the corners
      const st = { kind: 'hair', line: 2 };
      B.shape([[47, 58], [53, 56.5], [59, 57], [64, 58.5], [67.5, 62], [66.5, 66], [61, 67], [55, 67.3], [49, 67], [45, 66], [43.5, 62.5]], r, Object.assign({ round: 3.5, name: 'hair:stache' }, st));
      [[50.5, -2.5], [55, 0], [59.5, 2]].forEach(([x, dx], i) => B.lock([[x, 57.5], [x + dx * 0.5, 62], [x + dx, 66.6]], 5.2, r, Object.assign({ name: 'hair:stache' + i, tone: i % 2 }, st)));
      B.lock([[62.5, 59.5], [66.5, 63.5], [68, 67.5], [68.4, 71]], [6, 5.5, 4, 2], r, Object.assign({ name: 'hair:stacheN' }, st));
      B.lock([[48.5, 59.5], [45.5, 63.5], [44.5, 67.5], [44.6, 70.5]], [5, 4.5, 3.5, 2], r, Object.assign({ name: 'hair:stacheF', tone: -1 }, st));
    },
    extras(B) { over = record(B, 'hair:stache'); },
    details(s, c) {
      const h = c.h, sk = c.sk, tw = P.tweed, g = P.hair_gray, b = c.ex.brow, W = s.w;
      const rampOf = (x, y) => (s.get(x, y) & 0x7ff0) >> 4;
      // the bald dome: round the face polygon's top into the skull, outline it, give it a shine
      const { cx, cy, rx, ry } = DOME;
      for (let y = 0; y < 36; y++) for (let x = 30; x < 86; x++) {
        if (rampOf(x, y) !== sk.id) continue;
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
        if (u * u + v * v > 1) s.d[y * W + x] = 0;
      }
      for (let y = 0; y < 38; y++) for (let x = 30; x < 86; x++) {
        if (rampOf(x, y) !== sk.id) continue;
        if (!s.get(x - 1, y) || !s.get(x, y - 1) || !s.get(x + 1, y)) s.px(x, y, sk[0]);
        else if (x > 66 && (!s.get(x + 1, y - 1) || !s.get(x, y - 2) || !s.get(x + 2, y))) RIG.over(s, x, y, sk, -1);
      }
      [[46, 15], [46, 14], [47, 13], [48, 12], [49, 12], [50, 11], [51, 11], [53, 10]].forEach(([x, y]) => { if (rampOf(x, y) === sk.id) s.px(x, y, sk[5]); });
      // bushy brows
      const [nx, nw] = h.nearEye, [fx, fw] = h.farEye;
      RIG.brow(s, nx - 1, nx + nw + 2, h.browY - 1, b[0] + (b[2] || 0), b[1], g[2], g[3], 1);
      RIG.brow(s, fx + fw - 1, fx - 2, h.browY - 1, b[0], b[1], g[2], g[3], 1);
      // the mustache over the mouth's top row
      repaint(s, c, over);
      // ruddy nose tip
      for (const [x, y] of [[50, 56], [51, 56], [52, 56], [51, 55], [50, 57], [51, 57]]) if (rampOf(x, y) === sk.id && (s.get(x, y) & 15) >= 3) s.px(x, y, P.blush[(s.get(x, y) & 15) >= 4 ? 3 : 2]);
      // jacket: a faint tweed weave on the lit cloth, breast-pocket welt, buttons
      for (let y = 96; y < 176; y++) for (let x = 14; x < 114; x++) {
        if (rampOf(x, y) !== tw.id) continue;
        const sh = s.get(x, y) & 15;
        if (sh >= 3 && (y % 12 === 5 || x % 13 === 6)) RIG.over(s, x, y, tw, -1);
      }
      for (let x = 27; x < 41; x++) RIG.over(s, x, 126, tw, -2);
      s.px(30, 125, P.white_cloth[4]); s.px(31, 124, P.red[3]); s.px(32, 125, P.white_cloth[3]);
      s.px(62, 158, P.wood_dark[2]); s.px(62, 170, P.wood_dark[2]);
      // shirt buttons, polka dots on the bow tie
      s.px(60, 104, P.white_cloth[2]); s.px(60, 116, P.white_cloth[2]); s.px(60, 128, P.white_cloth[2]);
      for (const [x, y] of [[48, 93], [51, 96], [71, 93], [68, 96], [74, 96]]) if (rampOf(x, y) === P.red.id) s.px(x, y, P.white_cloth[4]);
      // brass lantern pin on the near lapel
      const lx = 79, ly = 104, br = P.pin_brass;
      s.px(lx + 1, ly, br[2]);
      s.px(lx, ly + 1, br[3]); s.px(lx + 1, ly + 1, br[5]); s.px(lx + 2, ly + 1, br[3]);
      s.px(lx, ly + 2, br[2]); s.px(lx + 1, ly + 2, br[4]); s.px(lx + 2, ly + 2, br[1]);
      s.px(lx, ly + 3, br[2]); s.px(lx + 1, ly + 3, br[4]); s.px(lx + 2, ly + 3, br[1]);
      s.px(lx, ly + 4, br[3]); s.px(lx + 1, ly + 4, br[3]); s.px(lx + 2, ly + 4, br[1]);
    },
    portraitBox: [20, 8, 76, 76]
  });
})();
