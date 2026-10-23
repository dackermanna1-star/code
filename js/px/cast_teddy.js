/* Teddy — Theodora Okafor, 14. Dark brown skin; a high round natural puff
 * tied with a teal scrunchie; big round glasses; a purple / teal / pink
 * color-block windbreaker with the collar up; a Saturn enamel pin. */
(function () {
  'use strict';
  const P = PX.P, RIG = PX.RIG;
  PX.ramp('wb_purple', ['#1d1235', '#321f59', '#4a3282', '#674aa8', '#8a6cca', '#b096e2']);
  PX.ramp('wb_teal', ['#0a2025', '#113a40', '#18595b', '#227f78', '#37a594', '#64c8b2']);
  PX.ramp('wb_pink', ['#3b1027', '#691c44', '#982e65', '#c64a86', '#e673a5', '#f9a4c7']);
  PX.ramp('lip_brown', ['#2a0d16', '#4d1c24', '#743138', '#94474b', '#b2635f', '#cf8a7f']);
  PX.ramp('blush_deep', ['#6e2430', '#88303a', '#a03e45', '#b5504f', '#c86a62', '#dc8c7f']);

  function ringPx(s, cx, cy, rx, ry, fn) {
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
  /* a thick ellipse ring (th px); fn(x, y, nx, ny, outer) -> code; outer = on the outside edge */
  function annulus(s, cx, cy, rx, ry, th, fn) {
    const q = (x, y, a, b) => ((x + 0.5 - cx) / a) ** 2 + ((y + 0.5 - cy) / b) ** 2;
    const inO = (x, y) => q(x, y, rx, ry) <= 1, inI = (x, y) => q(x, y, rx - th, ry - th) <= 1;
    for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx); x++) {
      if (!inO(x, y) || inI(x, y)) continue;
      const outer = !(inO(x - 1, y) && inO(x + 1, y) && inO(x, y - 1) && inO(x, y + 1));
      const c = fn(x, y, (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry, outer); if (c) s.px(x, y, c);
    }
  }
  /* repaint pixels of one ramp inside a polygon with another ramp, keeping the shade */
  function block(s, poly, from, to, d = 0) {
    s.clip(poly, () => {
      let x0 = 999, x1 = -1, y0 = 999, y1 = -1;
      for (const [x, y] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(s.h - 1, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(s.w - 1, Math.ceil(x1)); x++) {
        const v = s.get(x, y); if (v && ((v & 0x7ff0) >> 4) === from.id) RIG.over(s, x, y, to, d);
      }
    });
  }
  const YOKE = [[0, 0], [118, 0], [118, 107], [92, 107], [62, 115], [30, 123], [0, 125]];
  const STRIPE = [[0, 125], [30, 123], [62, 115], [92, 107], [118, 107], [118, 114], [92, 114], [62, 122], [30, 130], [0, 132]];

  PX.person('teddy', {
    name: 'teddy',
    skin: 'skin_brown', hair: 'hair_dark', eyes: 'eye_brown', lips: 'lip_brown',
    lashes: true, browThick: 2,
    head: { l: 35, r: 81, top: 36, eyeY: 49, chinY: 79, chinX: 56, jaw: 0.5, cheek: 0.5, nearEye: [57, 12], farEye: [39, 9], browY: 43, noseX: 52, noseY: 56, mouthX: 55, mouthY: 69, ear: [79, 51], neck: 8.5 },
    faceBumps: [[55.5, 64, 2, 1.2, 0.9], [49.5, 63.5, 1.5, 1.2, 0.7], [55, 70, 4, 1.8, 0.8], [66, 62, 4, 3, 0.8]],
    portraitBox: [20, 12, 76, 76],
    back(B, c) {
      const r = c.hr;
      // the back of the head, hair pulled up tight
      B.shape([[40, 33], [52, 25], [70, 24], [85, 29], [91, 39], [91, 50], [88, 58], [83, 61], [77, 52], [56, 43], [42, 41]], r, { kind: 'hair', round: 8, name: 'hair:back', tone: -1 });
      // the puff: a big round cloud with a coily, scalloped edge, sitting on the crown
      const pts = [];
      for (let i = 0; i < 90; i++) { const a = (i / 90) * Math.PI * 2, k = 1 + 0.075 * Math.abs(Math.sin(a * 6.5)); pts.push([71 + Math.cos(a) * 17 * k, 13.2 + Math.sin(a) * 12.2 * k]); }
      c.puff = B.shape(pts, r, { kind: 'hair', round: 13, name: 'hair:puff' });
      for (let row = 0; row < 6; row++) for (let k = 0; k < 8; k++) {
        const x = 57 + k * 4.4 + (row % 2) * 2.2, y = 3.5 + row * 3.8;
        if (((x - 71) / 16) ** 2 + ((y - 13) / 11.5) ** 2 < 0.9) B.bump(c.puff, x, y, 1.6, 1.5, 1.2);
      }
    },
    body(B, c) {
      const pu = P.wb_purple, sk = c.sk;
      B.tube([[27, 111], [19, 145], [16, 176]], [13, 12, 11], pu, { name: 'body:farArm', tone: -1, gloss: 30 });
      c.torso = B.shape([[50, 91], [36, 95], [24, 103], [20, 121], [21, 176], [99, 176], [101, 121], [97, 102], [86, 94], [70, 91]], pu, { round: 12, name: 'body:torso', gloss: 30 });
      B.shape([[52, 89], [68, 89], [66, 101], [60, 104], [54, 101]], P.white_cloth, { round: 4, name: 'body:tee' });
      B.crease(c.torso, [[60, 103], [60, 176]], 1.4, 0.8);
      B.crease(c.torso, [[30, 135], [38, 149], [44, 153]], 1.2, 1.2);
      B.crease(c.torso, [[90, 133], [82, 149], [76, 153]], 1.2, 1.2);
      c.arm2 = B.tube([[94, 107], [102, 145], [104, 176]], [14, 13, 12], pu, { name: 'body:nearArm', gloss: 30 });
      B.crease(c.arm2, [[97, 129], [102, 134], [106, 132]], 1.4, 1);
      B.crease(c.arm2, [[100, 153], [105, 158]], 1.2, 1);
    },
    collar(B, c) {
      const pu = P.wb_purple;
      // the stand collar, turned up around the neck
      B.shape([[46, 84], [53, 87], [56, 100], [50, 103], [43, 99], [42, 91]], pu, { round: 2.5, name: 'collar:1', gloss: 30 });
      B.shape([[66, 87], [75, 83], [81, 87], [82, 97], [75, 102], [66, 101]], pu, { round: 2.5, name: 'collar:2', gloss: 30 });
    },
    front(B, c) {
      const r = c.hr, t = P.teal;
      // hair pulled up sleek from the hairline toward the scrunchie
      B.shape([[35, 50], [34, 41], [36, 33], [41, 27.5], [48, 24.5], [58, 22.5], [70, 22], [81, 24], [87, 30], [90, 40], [89, 50], [86, 55], [83, 49], [80, 43], [75, 39.5], [69, 37.5], [60, 37], [51, 38], [44, 41.5], [39, 45], [37, 50]], r, { kind: 'hair', round: 7, name: 'hair:cap', tone: -1, gloss: 20 });
      B.lock([[38, 47], [40, 39], [47, 32], [57, 27], [66, 25]], 6, r, { name: 'hair:s1', tone: -1 });
      B.lock([[57, 37], [63, 31], [69, 27]], 5, r, { name: 'hair:s2', tone: -1 });
      B.lock([[84, 50], [86, 41], [83, 33], [77, 27]], 6, r, { name: 'hair:s3', tone: -1 });
      // the scrunchie gathering the puff: a ruffled fabric donut
      const sp = [];
      for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2, k = 1 + 0.12 * Math.abs(Math.sin(a * 4.5)); sp.push([71 + Math.cos(a) * 9.5 * k, 24.5 + Math.sin(a) * 4.6 * k]); }
      c.scr = B.shape(sp, t, { kind: 'soft', round: 3.5, name: 'hat:scrunchie' });
      for (const x of [64.5, 68.5, 72.5, 76.5]) B.crease(c.scr, [[x - 0.5, 20.5], [x + 0.5, 28.5]], 1.2, 0.7);
    },
    details(s, c) {
      const h = c.h, pk = P.wb_pink, pu = P.wb_purple;
      // color blocks across the windbreaker: teal yoke, pink stripe, with seams
      block(s, YOKE, pu, P.wb_teal);
      block(s, STRIPE, pu, P.wb_pink);
      // the zipper
      for (let y = 104; y < 176; y++) s.px(60, y, y % 2 ? P.chrome[2] : P.chrome[3]);
      s.px(59, 103, P.chrome[4]); s.px(60, 103, P.chrome[4]); s.px(59, 104, P.chrome[2]); s.px(59, 105, P.chrome[3]); s.px(59, 106, P.chrome[1]);
      // coils: little arches across the puff, lighter in the light, darker in the shadow
      const hr = c.hr;
      for (let row = 0; row < 6; row++) for (let k = 0; k < 9; k++) {
        const x = 56 + k * 4 + (row % 2) * 2 + ((k * 7 + row * 3) % 3) - 1, y = 3 + row * 3.6 + ((k * 5 + row) % 2);
        if (((x - 71) / 15.5) ** 2 + ((y - 13) / 11) ** 2 > 0.85 || y > 19) continue;
        const v = s.get(x, y); if (!v || ((v & 0x7ff0) >> 4) !== hr.id) continue;
        const sh = v & 15, col = sh >= 3 ? hr[Math.min(5, sh + 1)] : hr[Math.max(0, sh - 1)];
        s.px(x, y, col); s.px(x + 1, y - 1, col); s.px(x + 2, y, col);
      }
      // big round glasses: thick plastic frames (recorded so they stay above blush and tears)
      const list = topPx ? null : [], g = recorder(s, list);
      const frame = (cx, cy, rx, ry, far) => annulus(g, cx, cy, rx, ry, 1.7, (x, y, nx, ny, outer) => {
        if (outer) return pk[0];
        const d = -(nx * 0.75 + ny * 0.65);
        return pk[d > 0.35 ? (far ? 3 : 4) : d > -0.4 ? (far ? 2 : 3) : 1];
      });
      frame(62.5, 52, 8.8, 7.6, false);
      frame(43.4, 52, 6.1, 7.4, true);
      g.hline(49, 54, 50, pk[0]); g.hline(49, 54, 51, pk[3]); g.hline(50, 53, 52, pk[0]);
      g.path([[71, 50], [76, 51], [80, 52]], pk[1]);
      g.px(57, 47, P.white[5]); g.px(56, 48, P.white[4]); g.px(40, 48, P.white[4]);
      if (list) topPx = list;
      // gold studs
      s.px(81, 63, P.mustard[5]); s.px(82, 63, P.mustard[3]);
      // the Saturn pin
      const px0 = 72, py0 = 108;
      s.hline(px0 + 1, px0 + 3, py0, P.mustard[4]); s.hline(px0, px0 + 4, py0 + 1, P.mustard[3]); s.hline(px0, px0 + 4, py0 + 2, P.mustard[2]); s.hline(px0 + 1, px0 + 3, py0 + 3, P.mustard[1]);
      s.px(px0 + 1, py0 + 1, P.mustard[5]);
      s.px(px0 - 2, py0 + 3, P.cream[4]); s.px(px0 - 1, py0 + 2, P.cream[5]); s.px(px0 + 5, py0 + 1, P.cream[4]); s.px(px0 + 6, py0, P.cream[3]);
      s.hline(px0, px0 + 4, py0 + 2, P.cream[5]);
    },
    decal(s, o) {
      // a deeper rose blush that reads on dark skin
      const map = {}; P.blush.forEach((code, k) => { map[code] = P.blush_deep[k]; });
      s.recolor(map);
      restamp(s, o);
    }
  });
})();
