/* Mémère — Yvette Thibodeau, 72. Small and soft; white hair in a bun with
 * wisps escaping; small oval gold wire glasses; deep smile lines. A mauve
 * cardigan buttoned wrong (the neckline sits lopsided and a button is left
 * over at the top), a lace collar, and the small brass lantern pin she always
 * wears. */
(function () {
  'use strict';
  const P = PX.P, RIG = PX.RIG;
  PX.ramp('mauve_knit', ['#271626', '#432841', '#653e5e', '#87597c', '#a87b9a', '#c9a3b9']);
  PX.ramp('pin_brass', ['#3a2508', '#6b4a12', '#9c751f', '#c9a032', '#e8c75a', '#fbeaa0']);

  /* thin 1px oval: the 4-neighbour boundary of a filled ellipse with the L-corners removed */
  function ovalPx(s, cx, cy, rx, ry, fn) {
    const inside = (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
    const pts = new Map(), has = (x, y) => pts.has(x + ',' + y);
    for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx); x++) {
      if (inside(x, y) && !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))) pts.set(x + ',' + y, [x, y]);
    }
    for (const [k, [x, y]] of [...pts]) if ((has(x - 1, y) || has(x + 1, y)) && (has(x, y - 1) || has(x, y + 1))) pts.delete(k);
    for (const [x, y] of pts.values()) { const c = fn(x, y, (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry); if (c) s.px(x, y, c); }
  }
  /* a polyline pushed outward in little arcs (lace scallops) */
  function scallop(edge, period, amp) {
    const out = []; let acc = 0;
    for (let i = 1; i < edge.length; i++) {
      const [x0, y0] = edge[i - 1], [x1, y1] = edge[i], L = Math.hypot(x1 - x0, y1 - y0) || 1, nx = (y1 - y0) / L, ny = -(x1 - x0) / L;
      const n = Math.ceil(L / 0.5);
      for (let k = 0; k < n; k++) { const t = k / n, b = amp * Math.sin(Math.PI * (((acc + L * t) / period) % 1)); out.push([x0 + (x1 - x0) * t + nx * b, y0 + (y1 - y0) * t + ny * b]); }
      acc += L;
    }
    out.push(edge[edge.length - 1]);
    return out;
  }
  /* The rig paints blush and tears after details; pixels that must stay on top
   * (glasses, hair over an eye) are recorded here and stamped again in decal. */
  let topPx = null;
  const recorder = (s, list) => ({ px: (x, y, v) => { s.px(x, y, v); if (list) list.push([x, y, v]); }, get: (x, y) => s.get(x, y), hline: (x0, x1, y, v) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { s.px(x, y, v); if (list) list.push([x, y, v]); } }, path: (pts, v) => { for (let i = 1; i < pts.length; i++) s.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], (k, x, y) => { if (list) list.push([x, y, v]); return v; }); } });
  const restamp = (s, o) => { if (topPx) for (const [x, y, v] of topPx) s.px(o.flip ? PX.SW - 1 - x : x, y, v); };
  const crease = (s, c, x, y, d = -1) => { const v = s.get(x, y); if (v && ((v & 0x7ff0) >> 4) === c.sk.id && (v & 15) >= 2) s.px(x, y, PX.sh(v, d)); };

  PX.person('memere', {
    name: 'memere',
    skin: 'skin_old', hair: 'hair_white', eyes: 'eye_blue', lips: 'lip',
    lashes: false, nose: 'long', browThick: 1, brow: 'hair_gray',
    head: { l: 40, r: 80, top: 31, eyeY: 50, chinY: 80, chinX: 57, jaw: 1, cheek: 1, nearEye: [60, 9], farEye: [45, 7], browY: 45, noseX: 55, noseY: 56, mouthX: 57, mouthY: 70, ear: [78, 52], neck: 7.5 },
    faceBumps: [[66, 66, 3, 3, 1.2], [46, 66, 2.5, 3, 0.8], [70, 75, 3.5, 2.5, 0.9], [48, 75, 2.5, 2, 0.6], [44, 42, 2.5, 3, -0.6]],
    portraitBox: [22, 14, 74, 74],
    back(B, c) {
      const r = c.hr;
      B.shape([[44, 22], [58, 15], [74, 15], [86, 20], [93, 30], [94, 44], [90, 58], [84, 66], [79, 60], [70, 44], [50, 36]], r, { kind: 'hair', round: 8, name: 'hair:back' });
      // the bun, coiled at the back of the crown, and a wisp
      c.bun = B.ellipse(89, 22, 10, 9, r, { kind: 'hair', name: 'hair:bun', rz: 8 });
      B.lock([[97, 27], [100, 32], [99, 37]], 2.6, r, { name: 'hair:w0', tip: 0.7, outline: false, tone: 1 });
    },
    body(B, c) {
      const m = P.mauve_knit, wc = P.white_cloth;
      B.tube([[35, 106], [29, 142], [27, 176]], [10, 10, 9.5], m, { name: 'body:farArm', tone: -1 });
      B.shape([[52, 87], [42, 90], [35, 96], [31, 106], [30, 124], [30, 176], [90, 176], [91, 124], [90, 106], [86, 96], [78, 89], [66, 87]], m, { round: 12, name: 'body:torso' });
      // the blouse under the cardigan
      B.shape([[50, 87], [70, 87], [68, 105], [62, 117], [58, 117], [52, 105]], wc, { round: 5, name: 'body:blouse' });
      // cardigan fronts: the near side buttoned one hole too high, so the neckline sits lopsided
      const f1 = B.shape([[50, 89], [42, 92], [35, 98], [31, 108], [30, 124], [30, 176], [62, 176], [62, 130], [61, 116], [55, 103]], m, { round: 7, name: 'body:front1' });
      const f2 = B.shape([[70, 88], [79, 92], [86, 98], [90, 108], [91, 124], [90, 176], [58, 176], [58, 111], [64, 99]], m, { round: 7, name: 'body:front2' });
      B.crease(f1, [[38, 132], [44, 150], [48, 166]], 1.1, 1.1);
      B.crease(f2, [[84, 132], [78, 150], [74, 166]], 1.1, 1.1);
      B.crease(f2, [[60, 113], [67, 121], [74, 125]], 1.1, 1);
      B.crease(f2, [[61, 131], [68, 137]], 0.8, 1);
      c.arm2 = B.tube([[84, 101], [92, 142], [94, 176]], [11, 10.5, 10], m, { name: 'body:nearArm' });
      B.crease(c.arm2, [[80, 100], [86, 97], [91, 101]], 1.3, 1);
      B.crease(c.arm2, [[89, 128], [94, 133], [97, 131]], 1.2, 1);
    },
    collar(B, c) {
      const wc = P.white_cloth;
      B.crease(c.neckPart, [[56, 84], [61, 85.5], [66, 84]], 0.7, 0.7);
      // lace collar flaps lying flat over the neckline, scalloped along the outer edge
      B.shape([[58, 86], [58, 92]].concat(scallop([[56, 96], [51, 98], [46, 96], [42, 92], [43, 88]], 3.6, 1.9)).concat([[49, 85]]), wc, { round: 1.6, name: 'collar:lace1', kind: 'cloth' });
      B.shape([[62, 86], [71, 84]].concat(scallop([[77, 87], [78, 92], [74, 96], [68, 98], [63, 95]], 3.6, 1.9)).concat([[62, 91]]), wc, { round: 1.6, name: 'collar:lace2', kind: 'cloth' });
    },
    front(B, c) {
      const r = c.hr;
      // white hair drawn back in soft waves toward the bun
      B.shape([[38, 50], [37, 38], [41, 26], [50, 18], [62, 14], [75, 14], [85, 19], [91, 28], [92, 40], [88, 52], [83, 50], [80, 42], [75, 36], [68, 33], [60, 32], [52, 33], [46, 37], [42, 43], [41, 52]], r, { kind: 'hair', round: 8, name: 'hair:crown', tone: 1 });
      B.lock([[42, 40], [44, 30], [51, 22], [62, 17], [76, 17], [86, 21]], 9, r, { name: 'hair:l1', tone: 1 });
      B.lock([[52, 33], [60, 26], [71, 23], [83, 25]], 8, r, { name: 'hair:l2' });
      B.lock([[66, 33], [75, 30], [84, 31], [90, 36]], 8, r, { name: 'hair:l3', tone: 1 });
      B.lock([[78, 38], [85, 40], [89, 46]], 6, r, { name: 'hair:l4' });
      // wisps escaping
      B.lock([[41, 44], [38, 50], [39, 56]], 2.6, r, { name: 'hair:w1', tip: 0.7, outline: false, tone: 1 });
      B.lock([[84, 50], [86, 56], [84, 61]], 2.6, r, { name: 'hair:w2', tip: 0.7, outline: false });
      B.lock([[81, 15], [86, 11], [92, 11]], 2.6, r, { name: 'hair:w3', tip: 0.7, outline: false, tone: 1 });
      // swirl of the bun coil, over the crown's back edge
      B.crease(c.bun, [[83, 18], [88, 15], [94, 18], [95, 25], [90, 28], [85, 25], [88, 21]], 1.2, 0.8);
    },
    details(s, c) {
      const h = c.h, br = P.pin_brass, m = P.mauve_knit, wc = P.white_cloth;
      // deep smile lines, crow's feet, a softer forehead line
      [[59, 64], [60, 65], [61, 66], [62, 67], [62, 68], [62, 69], [61, 71]].forEach(([x, y]) => crease(s, c, x, y));
      [[51, 64], [50, 65], [50, 66], [50, 67], [51, 69]].forEach(([x, y]) => crease(s, c, x, y));
      [[71, 50], [72, 49], [71, 52], [72, 53], [71, 54]].forEach(([x, y]) => crease(s, c, x, y));
      for (let x = h.nearEye[0] + 1; x < h.nearEye[0] + h.nearEye[1] - 1; x++) crease(s, c, x, h.eyeY + 7);
      for (let x = h.farEye[0] + 2; x < h.farEye[0] + h.farEye[1] - 1; x++) crease(s, c, x, h.eyeY + 7);
      for (let x = 50; x < 68; x++) if (x % 5 !== 0) crease(s, c, x, 38);
      // small oval gold wire glasses (recorded so they stay above the blush)
      const list = topPx ? null : [], g = recorder(s, list);
      const lensRing = (cx, cy, rx, ry, far) => ovalPx(g, cx, cy, rx, ry, (x, y, nx, ny) => br[-(nx * 0.75 + ny * 0.65) > 0.25 ? (far ? 4 : 5) : ny > 0.35 || nx > 0.6 ? 2 : 3]);
      lensRing(64.5, 53, 6.3, 4.4, false);
      lensRing(48.2, 53, 4.2, 4.2, true);
      g.hline(53, 57, 52, br[3]); g.px(55, 51, br[4]);
      g.path([[71, 52], [75, 52], [78, 53]], br[2]);
      g.px(60, 50, P.white[5]); g.px(61, 50, P.white[4]); g.px(46, 51, P.white[4]);
      if (list) topPx = list;
      // lace eyelets
      [[45, 91], [47, 93], [50, 95], [53, 95], [56, 93], [65, 94], [68, 95], [71, 94], [74, 92], [75, 89]].forEach(([x, y]) => RIG.over(s, x, y, wc, -2));
      [[48, 89], [52, 91], [55, 89], [66, 90], [70, 90], [73, 88]].forEach(([x, y]) => RIG.over(s, x, y, wc, -1));
      // blouse buttons
      s.px(60, 102, wc[2]); s.px(60, 108, wc[2]);
      // cardigan buttons: the near band starts one buttonhole too high, so the top button is left over
      const btn = (x, y) => { s.px(x, y, m[5]); s.px(x + 1, y, m[4]); s.px(x + 2, y, m[2]); s.px(x, y + 1, m[4]); s.px(x + 1, y + 1, m[3]); s.px(x + 2, y + 1, m[1]); s.px(x, y + 2, m[2]); s.px(x + 1, y + 2, m[1]); s.px(x + 2, y + 2, m[1]); };
      for (let y = 115; y < 176; y += 10) btn(58, y);
      for (let y = 110; y < 176; y += 10) { s.px(63, y, m[1]); s.px(64, y, m[1]); s.px(65, y, m[2]); }
      // the left-over top button hanging free on the far front, and the empty hole it should fill
      btn(53, 104);
      s.px(63, 101, m[1]); s.px(64, 101, m[1]); s.px(65, 102, m[2]);
      // the brass lantern pin (the Lantern Society's, the same little lantern the others wear)
      const lx = 76, ly = 109;
      s.px(lx + 1, ly, br[2]);
      s.px(lx, ly + 1, br[3]); s.px(lx + 1, ly + 1, br[5]); s.px(lx + 2, ly + 1, br[3]);
      s.px(lx, ly + 2, br[2]); s.px(lx + 1, ly + 2, br[4]); s.px(lx + 2, ly + 2, br[1]);
      s.px(lx, ly + 3, br[2]); s.px(lx + 1, ly + 3, br[4]); s.px(lx + 2, ly + 3, br[1]);
      s.px(lx, ly + 4, br[3]); s.px(lx + 1, ly + 4, br[3]); s.px(lx + 2, ly + 4, br[1]);
    },
    decal(s, o) { restamp(s, o); }
  });
})();
