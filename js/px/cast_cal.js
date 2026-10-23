/* Cal — Calvin Ashgrove, 14. Sloane's twin. Pale, long narrow face, dark
 * circles; straight black hair grown too long, the fringe falling over one
 * eye; thin gold wire-rims; an oversized brown tweed jacket over a black tee. */
(function () {
  'use strict';
  const P = PX.P, RIG = PX.RIG;
  PX.ramp('skin_pale', ['#3e2236', '#6e4659', '#9c7380', '#c6a3a6', '#e5cfcb', '#f8ede8']);
  PX.ramp('tweed_oatmeal', ['#20160f', '#3a291b', '#584029', '#785a39', '#997852', '#ba9b73']);
  PX.ramp('pin_brass', ['#3a2508', '#6b4a12', '#9c751f', '#c9a032', '#e8c75a', '#fbeaa0']);

  function ovalPx(s, cx, cy, rx, ry, fn) {
    const inside = (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
    const pts = new Map(), has = (x, y) => pts.has(x + ',' + y);
    for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx); x++) {
      if (inside(x, y) && !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))) pts.set(x + ',' + y, [x, y]);
    }
    for (const [k, [x, y]] of [...pts]) if ((has(x - 1, y) || has(x + 1, y)) && (has(x, y - 1) || has(x, y + 1))) pts.delete(k);
    for (const [x, y] of pts.values()) { const c = fn(x, y, (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry); if (c) s.px(x, y, c); }
  }
  /* The rig paints blush and tears after details; pixels that must stay on top
   * (glasses, hair over an eye) are recorded here and stamped again in decal. */
  let topPx = null;
  const recorder = (s, list) => ({ px: (x, y, v) => { s.px(x, y, v); if (list) list.push([x, y, v]); }, get: (x, y) => s.get(x, y), hline: (x0, x1, y, v) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { s.px(x, y, v); if (list) list.push([x, y, v]); } }, path: (pts, v) => { for (let i = 1; i < pts.length; i++) s.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], (k, x, y) => { if (list) list.push([x, y, v]); return v; }); } });
  const restamp = (s, o) => { if (topPx) for (const [x, y, v] of topPx) s.px(o.flip ? PX.SW - 1 - x : x, y, v); };
  /* The rig paints the eyes after the body, so hair that falls over an eye is
   * repainted in details from a snapshot of the part map taken in extras. */
  let snap = null;
  function snapshot(B, ids) { snap = { pid: Int16Array.from(B.pid), parts: B.parts.map((p) => ({ ramp: p.ramp, outline: p.outline, sil: p.sil, line: p.line, kind: p.kind })), ids, w: B.w, h: B.h }; }
  function repaint(s, tone, list) {
    if (!snap) return;
    const { pid, parts, ids, w, h } = snap;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, p = pid[i]; if (!ids.includes(p)) continue;
      const part = parts[p]; let code = part.ramp[tone[i]];
      if (part.outline) {
        let sil = false, over = false;
        for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (xx < 0 || xx >= w || yy < 0) { sil = true; continue; }
          if (yy >= h) continue;
          const q = pid[yy * w + xx];
          if (q < 0) sil = true; else if (q < p && (parts[q].ramp !== part.ramp || (parts[q].kind === 'hair' && part.kind === 'hair'))) over = true;
        }
        if (sil) code = part.ramp[part.sil]; else if (over) code = part.ramp[Math.min(tone[i], part.line)];
      }
      s.px(x, y, code); if (list) list.push([x, y, code]);
    }
  }

  PX.person('cal', {
    name: 'cal',
    skin: 'skin_pale', hair: 'hair_black', eyes: 'eye_gray',
    lashes: false, nose: 'long', browThick: 2,
    head: { l: 39, r: 79, top: 21, eyeY: 41, chinY: 78, chinX: 56, jaw: 0, cheek: -2, nearEye: [58, 10], farEye: [43, 7], browY: 36, noseX: 53, noseY: 48, mouthX: 55, mouthY: 65, ear: [77, 43], neck: 7.5 },
    faceBumps: [[45, 58, 2.5, 3, -0.9], [70, 59, 3, 3.5, -1.2], [66, 51, 3.5, 2, 0.8], [56, 75, 2.5, 2, 0.6]],
    portraitBox: [21, 4, 76, 76],
    back(B, c) {
      const r = c.hr;
      // straight hair hanging behind the head to the nape, ending in points
      B.shape([[40, 10], [56, 3], [74, 4], [88, 11], [94, 24], [95, 42], [93, 58], [89, 70], [83, 74], [77, 66], [70, 52], [50, 36], [37, 30]], r, { kind: 'hair', round: 8, name: 'hair:back', tone: -1 });
      B.lock([[90, 36], [93, 52], [91, 68], [88, 80]], [10, 9, 6, 2], r, { name: 'hair:b1', tone: -1 });
      B.lock([[84, 50], [86, 64], [83, 77]], [8, 6, 2], r, { name: 'hair:b2', tone: -1 });
    },
    body(B, c) {
      const tw = P.tweed_oatmeal, bk = P.black_cloth;
      B.tube([[25, 107], [17, 139], [14, 176]], [13, 12.5, 12], tw, { name: 'body:farArm', tone: -1 });
      B.shape([[50, 83], [36, 87], [22, 95], [17, 113], [18, 176], [102, 176], [103, 113], [98, 94], [86, 87], [70, 83]], tw, { round: 12, name: 'body:torso' });
      c.tee = B.shape([[50, 85], [55, 90], [61, 91], [67, 89], [71, 85], [75, 115], [77, 176], [45, 176], [46, 115]], bk, { round: 8, name: 'body:tee' });
      B.crease(c.tee, [[58, 123], [61, 143], [59, 165]], 1.1, 1.2);
      const f1 = B.shape([[49, 85], [37, 88], [23, 96], [20, 115], [22, 176], [50, 176], [49, 137], [47, 109], [45, 95]], tw, { round: 7, name: 'body:front1' });
      const f2 = B.shape([[72, 84], [84, 87], [96, 94], [100, 115], [98, 176], [73, 176], [73, 137], [74, 109], [74, 95]], tw, { round: 7, name: 'body:front2' });
      B.crease(f1, [[29, 135], [37, 149], [43, 153]], 1.3, 1.2);
      B.crease(f2, [[94, 131], [86, 147], [79, 151]], 1.3, 1.2);
      // notched lapels
      B.shape([[49, 84], [45, 95], [40, 99], [44, 103], [48, 125], [51, 129], [51, 109], [50, 93]], tw, { round: 3, name: 'body:lapel1' });
      B.shape([[71, 84], [75, 94], [80, 97], [77, 102], [73, 125], [70, 129], [70, 109], [71, 93]], tw, { round: 3, name: 'body:lapel2' });
      c.arm2 = B.tube([[92, 101], [102, 139], [105, 176]], [14, 13.5, 13], tw, { name: 'body:nearArm' });
      B.crease(c.arm2, [[84, 97], [91, 93], [98, 98]], 1.3, 1);
      B.crease(c.arm2, [[98, 123], [103, 128], [107, 126]], 1.4, 1);
      B.crease(c.arm2, [[101, 149], [106, 154]], 1.2, 1);
    },
    collar(B, c) {
      const tw = P.tweed_oatmeal;
      B.bump(c.neckPart, 61, 84, 1.4, 1.6, 1.4);
      B.shape([[45, 79], [53, 83], [52, 89], [46, 91], [40, 86]], tw, { round: 3, name: 'collar:1' });
      B.shape([[67, 82], [76, 78], [82, 85], [76, 90], [69, 88]], tw, { round: 3, name: 'collar:2' });
    },
    front(B, c) {
      const r = c.hr;
      // crown with a part on the near side
      B.shape([[36, 40], [35, 26], [40, 13], [51, 5], [64, 2], [78, 5], [88, 12], [93, 24], [93, 38], [90, 46], [86, 36], [81, 27], [74, 22], [63, 20], [51, 22], [42, 30], [38, 40]], r, { kind: 'hair', round: 9, name: 'hair:crown' });
      // near side: hair falling over the top of the ear and behind it
      B.lock([[80, 8], [87, 17], [91, 30], [91, 44], [89, 58]], [12, 11, 10, 7, 2], r, { name: 'hair:near1' });
      B.lock([[81, 22], [84, 32], [84, 42], [82, 49]], [8, 7, 5, 1.6], r, { name: 'hair:near2', tone: -1 });
      B.lock([[70, 6], [74, 14], [76, 22]], 9, r, { name: 'hair:part' });
      // far side: straight locks down past the cheek
      B.lock([[38, 24], [36, 38], [36, 52], [38, 66]], [9, 8, 6, 1.6], r, { name: 'hair:side' });
      B.lock([[44, 20], [40, 32], [39, 46], [40, 58]], [8, 7, 5, 1.4], r, { name: 'hair:side2', tone: -1 });
      // the fringe sweeping from the part across the brow and down over the far eye
      B.lock([[66, 12], [58, 17], [52, 23], [49, 30]], 10, r, { name: 'hair:f2', tone: -1 });
      B.lock([[73, 9], [61, 14], [53, 21], [47, 29], [44, 37], [43, 45], [43, 53]], [15, 14, 12, 10, 8, 5, 1.6], r, { name: 'hair:fringe' });
    },
    extras(B, c) {
      const ids = B.parts.filter((p) => p.name === 'hair:fringe').map((p) => p.id);
      snapshot(B, ids);
    },
    details(s, c) {
      const h = c.h, br = P.pin_brass, tw = P.tweed_oatmeal;
      // dark circles under the eyes
      const dark = (x, y) => { const v = s.get(x, y); if (v && ((v & 0x7ff0) >> 4) === c.sk.id && (v & 15) >= 3) s.px(x, y, PX.sh(v, -1)); };
      for (let x = h.nearEye[0]; x < h.nearEye[0] + h.nearEye[1]; x++) { dark(x, h.eyeY + 6); if (x > h.nearEye[0] && x < h.nearEye[0] + h.nearEye[1] - 2) dark(x, h.eyeY + 7); }
      for (let x = h.farEye[0]; x < h.farEye[0] + h.farEye[1] + 1; x++) { dark(x, h.eyeY + 6); if (x > h.farEye[0] + 1) dark(x, h.eyeY + 7); }
      dark(h.nearEye[0] + 2, h.eyeY + 8); dark(h.nearEye[0] + 3, h.eyeY + 8);
      // tweed: a fine herringbone and flecks over the jacket
      for (let y = 78; y < 176; y++) for (let x = 0; x < 118; x++) {
        const v = s.get(x, y); if (!v || ((v & 0x7ff0) >> 4) !== tw.id || (v & 15) < 2) continue;
        const band = Math.floor(x / 3) % 2, k = (y + (band ? x : -x)) & 3;
        if (k === 0) RIG.over(s, x, y, tw, -1);
        else if (((x * 13 + y * 7) % 23) === 0) RIG.over(s, x, y, tw, 1);
      }
      // thin gold wire-rims, then the fringe falling over the far eye (both recorded so they stay above blush and tears)
      const list = topPx ? null : [], g = recorder(s, list);
      ovalPx(g, 62.5, 43.6, 6.2, 4.4, (x, y, nx, ny) => br[-(nx * 0.75 + ny * 0.65) > 0.25 ? 4 : ny > 0.35 || nx > 0.6 ? 2 : 3]);
      ovalPx(g, 46.3, 43.6, 4.1, 4.3, (x, y, nx, ny) => br[-(nx * 0.75 + ny * 0.65) > 0.25 ? 3 : 2]);
      g.hline(51, 56, 42, br[3]);
      g.path([[69, 42], [73, 42], [77, 43]], br[2]);
      g.px(58, 41, P.white[5]); g.px(59, 40, P.white[3]);
      repaint(s, c.tone, list);
      if (list) topPx = list;
    },
    decal(s, o) { restamp(s, o); }
  });
})();
