/* What Derry Keeps — pixel character rig.
 *
 * Characters are 118×176 sprites framed chest-up, in a Stardew-style
 * three-quarter view facing the viewer's left, lit from the upper left.
 *
 * Bodies, faces and hair are built from rounded forms rather than flat
 * polygons. A Builder collects primitives in painter's order:
 *   B.shape(poly, ramp, o)      a polygon "inflated" into a rounded surface
 *   B.ellipse(cx, cy, rx, ry, ramp, o)   an ellipsoid
 *   B.tube(spine, radii, ramp, o)        a tapered tube (necks, arms, sleeves)
 *   B.lock(spine, width, ramp, o)        a hair lock (tube tapering to a tip, glossy)
 *   B.crease(part, pts, depth)           a fold pressed into a surface
 *   B.bump(part, x, y, sx, sy, amp)      a soft rise (or dip, amp < 0)
 *   B.shadow(casters, receivers, dx, dy) a cast shadow (hair on the forehead…)
 * B.render() lights every surface, snaps it to 4–5 tones of its ramp, and
 * outlines silhouettes (darkest shade) and overlaps (second-darkest).
 * The rig then paints the expression on top: brows, eyes, nose, mouth, blush.
 *
 *   PX.person('gus', { skin, hair, eyes, back(B, c), body(B, c), collar(B, c), front(B, c), details(s, c) })
 */
(function () {
  'use strict';
  const P = PX.P;
  const RIG = (PX.RIG = {});

  /* ---------------- expressions ---------------- */
  /* brow [lift px, tilt (+ inner end down / angry, − inner end up / sad), near-brow extra lift] */
  RIG.EXPR = {
    neutral: { brow: [0, 0, 0], eye: 'open', mouth: 'neutral' },
    smile: { brow: [1, -1, 0], eye: 'soft', mouth: 'smile', blush: 1 },
    grin: { brow: [1, -1, 0], eye: 'soft', mouth: 'grin', blush: 1 },
    laugh: { brow: [2, -1, 0], eye: 'happy', mouth: 'laugh', blush: 2 },
    sad: { brow: [1, -2, 0], eye: 'sad', mouth: 'frown', gaze: [0, 1] },
    angry: { brow: [-1, 2, 0], eye: 'squint', mouth: 'tight' },
    surprised: { brow: [3, 0, 0], eye: 'wide', mouth: 'o' },
    afraid: { brow: [2, -2, 0], eye: 'wide', mouth: 'grimace', sweat: true },
    worried: { brow: [1, -2, 0], eye: 'open', mouth: 'wobble', gaze: [-1, 0] },
    thinking: { brow: [0, 1, 2], eye: 'open', mouth: 'pursed', gaze: [-1, -1] },
    smirk: { brow: [0, 1, 1], eye: 'half', mouth: 'smirk' },
    flat: { brow: [-1, 0, 0], eye: 'half', mouth: 'line' },
    blush: { brow: [1, -2, 0], eye: 'down', mouth: 'smallsmile', blush: 3, gaze: [-1, 1] },
    cry: { brow: [2, -2, 0], eye: 'cry', mouth: 'cry', tears: true, blush: 1 }
  };
  RIG.EXPRS = Object.keys(RIG.EXPR);

  /* mouth templates, centred on the mouth anchor. Legend:
   * l lip line · c corner · d mouth dark · t teeth · u tongue · p lower lip · P lip highlight · s skin shadow */
  RIG.MOUTH = {
    neutral: ['.cllc.', '..pp..'],
    smile: ['c......c', '.cllllc.', '..sppp..'],
    grin: ['clllllllc', 'ctttttttc', '.cdddddc.', '..cdddc..', '...sss...'],
    laugh: ['.clllllc.', 'ctttttttc', 'cdddddddc', 'cdduuuddc', '.cduuudc.', '..cllc...'],
    frown: ['..cllc..', '.c....c.', 'c......c'],
    tight: ['.cllllc.', '...ss...'],
    o: ['.cllc.', 'cddddc', 'cddddc', '.cllc.'],
    grimace: ['cllllllc', 'cttttttc', 'cllllllc'],
    wobble: ['..c..c..', '.c.cc.c.'],
    pursed: ['..ll..', '.lPpl.', '..ll..'],
    smirk: ['......c', 'cllllc.', '..sp...'],
    line: ['cllllllc'],
    smallsmile: ['c.....c', '.clllc.'],
    cry: ['.cllllc.', 'cddddddc', 'c.cllc.c']
  };

  RIG.tpl = function (s, x, y, rows, legend) {
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c];
      if (ch === '.' || ch === ' ') continue;
      const code = legend[ch];
      if (code) s.px(x + c, y + r, code);
    }
  };

  /* ---------------- eyes ----------------
   * (x, y) = top-left of the eye box (lash row). Near eye: outer corner on the
   * right; far eye (o.far): narrower, mirrored. Rows: 0 lash, 1-4 opening, 5 lid. */
  function eye(s, x, y, w, st, o) {
    const K = o.lash, K2 = o.lash2 || K, W = P.white[4], Ws = P.white[2], ir = o.iris, sk = o.skin;
    const far = !!o.far;
    const gx = (o.gaze && o.gaze[0]) || 0, gy = (o.gaze && o.gaze[1]) || 0;
    const X = (c) => (far ? w - 1 - c : c);
    const px = (c, r, col) => s.px(x + X(c), y + r, col);
    const row = (r, c0, c1, col) => { for (let k = c0; k <= c1; k++) px(k, r, col); };
    const iw = o.irisW || (far ? 3 : 4);
    let ic = Math.round((w - iw) / 2) + (far ? -gx : gx);
    ic = Math.max(1, Math.min(w - 1 - iw, ic));
    const iris = (r0, rows, top = 0, iwOver) => {
      const w2 = iwOver || iw, c0 = iwOver ? ic + Math.floor((iw - iwOver) / 2) : ic;
      for (let r = top; r < rows; r++) for (let c = 0; c < w2; c++) {
        if (w2 >= 4 && r === rows - 1 && (c === 0 || c === w2 - 1)) continue;
        const col = r === 0 ? ir[2] : r === rows - 1 ? ir[4] : ir[3];
        px(c0 + c, r0 + r, col);
      }
      const pc = c0 + Math.floor((w2 - 1) / 2);
      for (let c = 0; c < w2; c++) if (top === 0) px(c0 + c, r0, ir[1]);          // dark rim under the lash
      if (rows > 1) { px(pc, r0 + Math.max(top, 1), ir[0]); if (w2 >= 4) px(pc + 1, r0 + Math.max(top, 1), ir[0]); }
      if (rows > 2) { px(pc, r0 + 2, ir[0]); if (w2 >= 4) px(pc + 1, r0 + 2, ir[1]); }
      px(c0, r0 + Math.max(top, 1), P.white[5]);
      if (rows > 3) px(c0 + w2 - 1, r0 + rows - 2, ir[5]);
    };
    switch (st) {
      case 'happy': {
        const m = Math.floor(w / 2);
        row(1, Math.max(2, m - 2), Math.min(w - 3, m + 1), K);
        px(Math.max(1, m - 3), 2, K); px(Math.min(w - 2, m + 2), 2, K);
        px(Math.max(0, m - 4), 3, K); px(Math.min(w - 1, m + 3), 3, K);
        row(4, 2, w - 3, sk[3]);
        break;
      }
      case 'closed':
        row(2, 2, w - 3, sk[3]);
        row(3, 1, w - 2, K); px(w - 1, 4, K); px(0, 3, K2);
        break;
      case 'cry':
        row(2, 2, w - 2, K); row(3, 1, w - 1, K); px(0, 3, K2);
        row(4, 2, w - 3, sk[2]);
        break;
      case 'half':
        row(0, 1, w - 2, sk[3]); row(1, 1, w - 2, sk[3]);
        row(2, 0, w - 1, K); px(w - 1, 3, K);
        row(3, 1, w - 2, W); row(4, 2, w - 3, W);
        iris(1, 4, 2);
        row(5, 2, w - 3, sk[2]);
        break;
      case 'down':
        row(0, 1, w - 2, sk[3]); row(1, 1, w - 2, sk[3]);
        row(2, 0, w - 1, K); px(w - 1, 3, K);
        row(3, 1, w - 2, W); row(4, 2, w - 3, W);
        iris(2, 3, 1);
        row(5, 2, w - 3, sk[2]);
        break;
      case 'wide':
        row(0, 1, w - 2, K); px(w - 1, 1, K); px(0, 1, K2);
        row(1, 1, w - 2, Ws); for (let r = 2; r <= 4; r++) row(r, 1, w - 2, W); px(w - 1, 2, W); row(5, 2, w - 3, W);
        iris(2 + (gy > 0 ? 1 : 0), 3, 0, Math.max(2, iw - 1));
        row(6, 2, w - 3, sk[2]);
        break;
      case 'squint':
        row(0, Math.ceil(w / 2), w - 2, sk[3]);
        row(1, 0, w - 1, K); px(0, 2, K); px(1, 2, K); px(2, 2, K);
        row(2, 3, w - 2, Ws); row(3, 1, w - 2, W); row(4, 2, w - 3, W);
        iris(1, 4, 1);
        px(1, 2, K); px(2, 2, K);
        row(5, 2, w - 3, sk[2]);
        break;
      case 'sad':
        row(0, 1, w - 4, K); px(w - 3, 1, K); px(w - 2, 1, K); px(w - 1, 2, K); px(0, 1, K2);
        row(1, 1, w - 4, Ws); row(2, 1, w - 2, W); row(3, 1, w - 2, W); row(4, 2, w - 3, W);
        iris(1, 4, 0);
        px(w - 3, 1, K); px(w - 2, 1, K);
        row(5, 1, w - 2, sk[2]);
        break;
      case 'soft':
        row(0, 1, w - 1, K); px(w - 2, 1, K); px(w - 1, 1, K); px(0, 1, K2);
        row(1, 1, w - 3, W); row(2, 1, w - 2, W); row(3, 2, w - 3, W);
        iris(1, 3, 0);
        row(4, 2, w - 3, sk[2]); px(1, 3, sk[3]); px(w - 2, 3, sk[3]); px(1, 4, sk[3]); px(w - 2, 4, sk[3]);
        break;
      default:
        row(0, 1, w - 1, K); px(w - 2, 1, K); px(w - 1, 1, K); px(0, 1, K2);
        row(1, 1, w - 3, W); px(1, 1, Ws); row(2, 1, w - 2, W); row(3, 1, w - 2, W); row(4, 2, w - 3, W); px(w - 1, 2, W);
        iris(1, 4, 0);
        row(5, 2, w - 3, sk[3]); px(w - 2, 4, sk[2]);
        break;
    }
    if (o.lashes && st !== 'happy' && st !== 'cry') { px(w, 0, K); px(w, -1, K); px(w + 1, -1, K); }
  }
  RIG.eye = eye;

  function brow(s, xi, xo, y, lift, tilt, c, cl, thick) {
    const n = Math.abs(xo - xi), dir = Math.sign(xo - xi) || 1;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const arch = t > 0.2 && t < 0.75 ? 1 : 0;
      const yy = y - lift + Math.round(tilt * (1 - t)) - arch;
      const xx = xi + dir * k;
      s.px(xx, yy, c);
      if (thick > 1 && t < 0.8) s.px(xx, yy + 1, t < 0.5 ? c : cl);
    }
  }
  RIG.brow = brow;

  /* ---------------- Builder: rounded forms, lit and toned ---------------- */
  const LX = -0.55, LY = -0.38, LZ = 0.74;                 // light from the left, slightly above, in front
  const LN = Math.hypot(LX, LY, LZ), L = [LX / LN, LY / LN, LZ / LN];
  const HV = [L[0], L[1], L[2] + 1], HN = Math.hypot(...HV), H = HV.map((v) => v / HN);
  /* tone thresholds by material kind: [minimum light, shade] (shade 0 is kept for outlines) */
  const TONES = {
    skin: [[0.93, 5], [0.7, 4], [0.5, 3], [0.33, 2], [-9, 1]],
    hair: [[0.84, 4], [0.6, 3], [0.38, 2], [-9, 1]],
    cloth: [[0.93, 5], [0.72, 4], [0.5, 3], [0.3, 2], [-9, 1]],
    soft: [[0.88, 5], [0.66, 4], [0.45, 3], [0.27, 2], [-9, 1]],
    metal: [[0.85, 5], [0.62, 4], [0.42, 3], [0.25, 2], [-9, 1]]
  };

  class Builder {
    constructor(w, h) {
      this.w = w; this.h = h;
      this.z = new Float32Array(w * h);
      this.pid = new Int16Array(w * h).fill(-1);
      this.parts = [];
      this.shadows = [];
    }
    _part(ramp, o) {
      const p = { id: this.parts.length, ramp, kind: o.kind || 'cloth', outline: o.outline !== false, line: o.line === undefined ? 1 : o.line, sil: o.sil === undefined ? 0 : o.sil, k: o.k || 1, tone: o.tone || 0, name: o.name || '', gloss: o.gloss, flat: o.flatTone };
      this.parts.push(p);
      return p;
    }
    _mask(poly) {
      const s = new PX.Surf(this.w, this.h);
      s.poly(poly, 1);
      let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (s.d[y * this.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return { m: s.d, x0, y0, x1, y1 };
    }
    /* chamfer distance (≈ px) from each mask pixel to the outside */
    _dist(M) {
      const { m, x0, y0, x1, y1 } = M, w = this.w, INF = 1e6;
      const d = new Float32Array(this.w * this.h);
      const at = (x, y) => (x < x0 || x > x1 || y < y0 || y > y1 || !m[y * w + x] ? 0 : d[y * w + x]);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (m[y * w + x]) d[y * w + x] = INF;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * w + x; if (!m[i]) continue;
        d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
      }
      for (let y = y1; y >= y0; y--) for (let x = x1; x >= x0; x--) {
        const i = y * w + x; if (!m[i]) continue;
        d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
      }
      for (let i = 0; i < d.length; i++) d[i] /= 3;
      return d;
    }
    /* polygon inflated into a rounded surface; o.round = edge radius (px), o.z = base height,
     * o.bumps = [[x, y, sx, sy, amp], ...], o.clip = polygon to intersect with */
    shape(poly, ramp, o = {}) {
      const p = this._part(ramp, o), M = this._mask(poly);
      if (o.clip) { const C = this._mask(o.clip); for (let i = 0; i < M.m.length; i++) M.m[i] &= C.m[i]; }
      if (o.under) { for (let i = 0; i < M.m.length; i++) if (M.m[i] && this.pid[i] < 0) M.m[i] = 0; }
      const d = this._dist(M), R = o.round || 6, base = o.z || 0, w = this.w;
      for (let y = M.y0; y <= M.y1; y++) for (let x = M.x0; x <= M.x1; x++) {
        const i = y * w + x; if (!M.m[i]) continue;
        const t = Math.min(1, d[i] / R);
        let zz = base + R * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
        if (o.bumps) for (const [bx, by, sx, sy, a] of o.bumps) zz += a * Math.exp(-(((x + 0.5 - bx) ** 2) / (2 * sx * sx) + ((y + 0.5 - by) ** 2) / (2 * sy * sy)));
        if (o.slope) zz += o.slope[0] * (x - M.x0) + o.slope[1] * (y - M.y0);
        this.z[i] = zz; this.pid[i] = p.id;
      }
      this._smooth(p.id, M, o.smooth === undefined ? 2 : o.smooth);
      return p.id;
    }
    /* box-blur a part's heights a few times to soften chamfer facets */
    _smooth(id, M, passes) {
      const w = this.w, z = this.z, pid = this.pid;
      for (let k = 0; k < passes; k++) {
        const out = new Float32Array(z);
        for (let y = M.y0; y <= M.y1; y++) for (let x = M.x0; x <= M.x1; x++) {
          const i = y * w + x; if (pid[i] !== id) continue;
          let sum = 0, cnt = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= this.h) continue;
            const j = yy * w + xx; sum += pid[j] === id ? z[j] : 0; cnt++;
          }
          out[i] = sum / cnt;
        }
        for (let y = M.y0; y <= M.y1; y++) for (let x = M.x0; x <= M.x1; x++) { const i = y * w + x; if (pid[i] === id) z[i] = out[i]; }
      }
    }
    ellipse(cx, cy, rx, ry, ramp, o = {}) {
      const p = this._part(ramp, o), rz = o.rz || Math.min(rx, ry), w = this.w;
      for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(this.h - 1, Math.ceil(cy + ry)); y++) {
        for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(this.w - 1, Math.ceil(cx + rx)); x++) {
          const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, q = 1 - u * u - v * v;
          if (q <= 0) continue;
          const i = y * w + x;
          if (o.under && this.pid[i] < 0) continue;
          this.z[i] = (o.z || 0) + rz * Math.sqrt(q); this.pid[i] = p.id;
        }
      }
      return p.id;
    }
    /* tube along a spine; radii: number, [r0, r1] or one per point */
    tube(spine, radii, ramp, o = {}) {
      const p = this._part(ramp, o), n = spine.length, w = this.w;
      const rAt = (t) => {
        if (typeof radii === 'number') return radii;
        if (radii.length === n) { const f = t * (n - 1), k = Math.min(n - 2, Math.floor(f)); return radii[k] + (radii[k + 1] - radii[k]) * (f - k); }
        return radii[0] + (radii[1] - radii[0]) * t;
      };
      const cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(spine[i][0] - spine[i - 1][0], spine[i][1] - spine[i - 1][1]));
      const total = cum[n - 1] || 1;
      let rmax = 0; for (let k = 0; k <= 20; k++) rmax = Math.max(rmax, rAt(k / 20));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of spine) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
      const flat = o.flat || 1, caps = o.caps !== false;
      for (let y = Math.max(0, Math.floor(y0 - rmax)); y <= Math.min(this.h - 1, Math.ceil(y1 + rmax)); y++) {
        for (let x = Math.max(0, Math.floor(x0 - rmax)); x <= Math.min(this.w - 1, Math.ceil(x1 + rmax)); x++) {
          let best = Infinity, bt = 0, end = false;
          for (let k = 1; k < n; k++) {
            const ax = spine[k - 1][0], ay = spine[k - 1][1], vx = spine[k][0] - ax, vy = spine[k][1] - ay, L2 = vx * vx + vy * vy || 1;
            let t = ((x + 0.5 - ax) * vx + (y + 0.5 - ay) * vy) / L2;
            const e = (k === 1 && t < 0) || (k === n - 1 && t > 1);
            t = Math.max(0, Math.min(1, t));
            const dd = (x + 0.5 - ax - vx * t) ** 2 + (y + 0.5 - ay - vy * t) ** 2;
            if (dd < best) { best = dd; bt = (cum[k - 1] + t * (cum[k] - cum[k - 1])) / total; end = e; }
          }
          if (end && !caps) continue;
          const r = rAt(bt), dd = Math.sqrt(best);
          if (dd >= r) continue;
          const i = y * w + x;
          if (o.under && this.pid[i] < 0) continue;
          this.z[i] = (o.z || 0) + flat * Math.sqrt(r * r - dd * dd); this.pid[i] = p.id;
        }
      }
      return p.id;
    }
    /* a lock of hair: tube tapering to a tip, glossy */
    lock(spine, width, ramp, o = {}) {
      const n = spine.length, tip = o.tip === undefined ? 0.6 : o.tip;
      const radii = Array.isArray(width) ? width.map((v) => v / 2) : spine.map((_, i) => Math.max(tip, (width / 2) * (1 - 0.86 * Math.pow(i / (n - 1), 1.25))));
      return this.tube(spine, radii, ramp, Object.assign({ kind: 'hair', flat: 0.8 }, o));
    }
    /* press a crease into a part along a polyline */
    crease(part, pts, depth = 1.6, width = 1.1) {
      const w = this.w;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
      const pad = Math.ceil(width * 3);
      for (let y = Math.max(0, Math.floor(y0 - pad)); y <= Math.min(this.h - 1, Math.ceil(y1 + pad)); y++) for (let x = Math.max(0, Math.floor(x0 - pad)); x <= Math.min(this.w - 1, Math.ceil(x1 + pad)); x++) {
        const i = y * w + x; if (this.pid[i] !== part) continue;
        let best = Infinity;
        for (let k = 1; k < pts.length; k++) {
          const ax = pts[k - 1][0], ay = pts[k - 1][1], vx = pts[k][0] - ax, vy = pts[k][1] - ay, L2 = vx * vx + vy * vy || 1;
          const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * vx + (y + 0.5 - ay) * vy) / L2));
          best = Math.min(best, (x + 0.5 - ax - vx * t) ** 2 + (y + 0.5 - ay - vy * t) ** 2);
        }
        this.z[i] -= depth * Math.exp(-best / (2 * width * width));
      }
    }
    bump(part, bx, by, sx, sy, amp) {
      const w = this.w;
      for (let y = Math.max(0, Math.floor(by - sy * 3)); y <= Math.min(this.h - 1, Math.ceil(by + sy * 3)); y++) for (let x = Math.max(0, Math.floor(bx - sx * 3)); x <= Math.min(this.w - 1, Math.ceil(bx + sx * 3)); x++) {
        const i = y * w + x; if (this.pid[i] !== part) continue;
        this.z[i] += amp * Math.exp(-(((x + 0.5 - bx) ** 2) / (2 * sx * sx) + ((y + 0.5 - by) ** 2) / (2 * sy * sy)));
      }
    }
    /* parts (ids or names) cast a shadow offset by (dx, dy) onto receiver parts */
    shadow(casters, receivers, dx = 1, dy = 2, amt = 0.3) { this.shadows.push({ casters, receivers, dx, dy, amt }); }
    _match(sel, id) {
      if (sel === '*') return true;
      const p = this.parts[id];
      return [].concat(sel).some((q) => q === id || (typeof q === 'string' && p.name && (p.name === q || p.name.startsWith(q + ':'))));
    }
    render(s) {
      const w = this.w, h = this.h, n = w * h, pid = this.pid, z = this.z, parts = this.parts;
      const tone = new Int8Array(n).fill(-1), shade = new Float32Array(n);
      for (const sh of this.shadows) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = y * w + x, p = pid[i]; if (p < 0 || !this._match(sh.receivers, p)) continue;
          const sx = x - sh.dx, sy = y - sh.dy;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          const q = pid[sy * w + sx];
          if (q >= 0 && q !== p && this._match(sh.casters, q)) shade[i] = Math.max(shade[i], sh.amt);
        }
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, p = pid[i]; if (p < 0) continue;
        const part = parts[p];
        if (part.flat !== undefined) { tone[i] = part.flat; continue; }
        const zc = z[i];
        const zl = x > 0 && pid[i - 1] === p ? z[i - 1] : 0, zr = x < w - 1 && pid[i + 1] === p ? z[i + 1] : 0;
        const zu = y > 0 && pid[i - w] === p ? z[i - w] : 0, zd = y < h - 1 && pid[i + w] === p ? z[i + w] : (y === h - 1 ? zc : 0);
        const gx = (zr - zl) * 0.5 * part.k, gy = (zd - zu) * 0.5 * part.k;
        const nl = Math.hypot(gx, gy, 1), nx = -gx / nl, ny = -gy / nl, nz = 1 / nl;
        const I = 0.2 + 0.8 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]) - shade[i];
        const T = TONES[part.kind] || TONES.cloth;
        let t = 1; for (const [m, sv] of T) if (I >= m) { t = sv; break; }
        if (part.kind === 'hair' || part.gloss) {
          const spec = Math.pow(Math.max(0, nx * H[0] + ny * H[1] + nz * H[2]), part.gloss || 26);
          if (spec > 0.55 && !shade[i]) t = Math.min(5, t + 1 + (spec > 0.8 ? 1 : 0));
        }
        tone[i] = Math.max(1, Math.min(part.ramp.length - 1, t + part.tone));
      }
      // tidy lone pixels inside a part
      const t2 = Int8Array.from(tone);
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x, p = pid[i]; if (p < 0) continue;
        const nb = [i - 1, i + 1, i - w, i + w];
        if (nb.some((j) => pid[j] !== p)) continue;
        const a = tone[nb[0]];
        if (tone[i] !== a && nb.every((j) => tone[j] === a)) t2[i] = a;
      }
      // outlines: silhouettes take the darkest shade, overlaps the next
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, p = pid[i]; if (p < 0) continue;
        const part = parts[p];
        let code = part.ramp[t2[i]];
        if (part.outline) {
          let sil = false, over = false;
          const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
          for (const [xx, yy] of nb) {
            if (xx < 0 || xx >= w || yy < 0) { sil = true; continue; }
            if (yy >= h) continue;
            const q = pid[yy * w + xx];
            if (q < 0) sil = true; else if (q < p && parts[q].ramp !== part.ramp) over = true; else if (q < p && parts[q].kind === 'hair' && part.kind === 'hair') over = true;
          }
          if (sil) code = part.ramp[part.sil];
          else if (over) code = part.ramp[Math.min(t2[i], part.line)];
        }
        s.px(x, y, code);
      }
      this.tone = t2;
      return this;
    }
  }
  RIG.Builder = Builder;

  /* ---------------- the person ---------------- */
  PX.person = function (id, spec) {
    const def = {
      spec,
      portraitBox: spec.portraitBox || [20, 6, 76, 76],
      draw(s, o) { drawPerson(s, o, spec); },
      decal: spec.decal
    };
    PX.char(id, def);
    return def;
  };

  /* head geometry for the chest-up framing; spec.head overrides any field */
  RIG.head = function (spec) {
    return Object.assign({
      l: 36, r: 82,           // far / near face edge at the eye line
      top: 22,                // hairline (under the bangs)
      eyeY: 42,               // eye box top (lash row)
      chinY: 73, chinX: 56,   // bottom of the chin
      jaw: 0, cheek: 0,
      nearEye: [59, 11], farEye: [41, 8],
      browY: 37,
      noseX: 53, noseY: 49,
      mouthX: 55, mouthY: 62,
      ear: [80, 44],
      neck: 9                 // neck radius
    }, spec.head || {});
  };

  RIG.facePoly = function (h) {
    const Lx = h.l, Rx = h.r, T = h.top, e = h.eyeY + 2, cy = h.chinY, cx = h.chinX, j = h.jaw || 0, ch = h.cheek || 0;
    const lo = cy - e;
    return [
      [Lx + 3, T - 8], [Lx + 1, T + 2], [Lx, e - 4], [Lx, e], [Lx - 0.5 - ch, e + lo * 0.24], [Lx - ch * 0.4, e + lo * 0.44],
      [Lx + 2 - j * 0.6, e + lo * 0.62], [Lx + 6 - j * 0.6, e + lo * 0.8 + j * 0.3], [cx - 5, cy - 1.6], [cx - 1.5, cy + 0.2], [cx + 3, cy],
      [cx + 8 + j, cy - 3 + j * 0.3], [cx + 15 + j, cy - 8 + j * 0.4], [Rx - 4 + j * 0.6, e + lo * 0.52 + j * 0.5], [Rx - 1 + ch * 0.4, e + lo * 0.27], [Rx, e], [Rx, T + 2], [Rx - 2, T - 8]
    ];
  };

  function drawPerson(s, o, spec) {
    const ex = RIG.EXPR[o.expr] || RIG.EXPR.neutral;
    const h = RIG.head(spec);
    const sk = P[spec.skin || 'skin_peach'], hr = P[spec.hair || 'hair_brown'], ir = P[spec.eyes || 'eye_brown'];
    const B = new Builder(s.w, s.h);
    const c = { h, sk, hr, ir, ex, o, spec, B, rng: PX.rng('p:' + (spec.name || '')) };
    if (spec.back) spec.back(B, c);
    if (spec.body) spec.body(B, c);
    // neck
    c.neckPart = B.tube([[h.chinX + 4, h.chinY - 12], [h.chinX + 5, h.chinY + 14]], h.neck, sk, { kind: 'skin', name: 'neck', outline: true, flat: 0.7 });
    if (spec.collar) spec.collar(B, c);
    // face and ear
    const bumps = [
      [h.noseX + 0.5, h.noseY + 4, 1.3, 3.2, 3.2],                       // nose ridge
      [h.noseX - 0.5, h.noseY + 7, 1.8, 1.2, 1.6],                       // nose tip
      [h.nearEye[0] + h.nearEye[1] / 2, h.eyeY + 2, 3.2, 2.2, -1.6],      // eye sockets
      [h.farEye[0] + h.farEye[1] / 2, h.eyeY + 2, 2.6, 2.2, -1.4],
      [(h.l + h.r) / 2, h.browY - 1, 9, 1.8, 1.2],                        // brow ridge
      [h.nearEye[0] + 5, h.eyeY + 11, 4.5, 3, 1.5],                       // cheekbones
      [h.farEye[0] + 2, h.eyeY + 11, 3, 3, 1.0],
      [h.chinX, h.chinY - 4, 3.2, 2.6, 1.1],                              // chin
      [h.mouthX, h.mouthY + 1, 3, 1.4, 0.5]                               // lips
    ].concat(spec.faceBumps || []);
    c.facePart = B.shape(RIG.facePoly(h), sk, { kind: 'skin', round: 18, bumps, name: 'face' });
    if (spec.ear !== false) {
      const [ex0, ey0] = h.ear;
      c.earPart = B.shape([[ex0 - 1, ey0], [ex0 + 3, ey0 - 1], [ex0 + 7, ey0 + 2], [ex0 + 7, ey0 + 9], [ex0 + 4, ey0 + 14], [ex0, ey0 + 13]], sk, { kind: 'skin', round: 3, name: 'ear' });
      B.crease(c.earPart, [[ex0 + 3, ey0 + 3], [ex0 + 3, ey0 + 10]], 1.4, 1);
    }
    if (spec.front) spec.front(B, c);
    if (spec.extras) spec.extras(B, c);
    // shadows: hair on the forehead and temples, chin on the neck, head on the collar
    B.shadow(['hair', 'hat'], ['face', 'ear'], 1, 2, 0.32);
    B.shadow(['face', 'hair'], ['neck'], 2, 7, 0.34);
    B.shadow(['face', 'neck', 'hair'], ['body', 'collar'], 1, 2, 0.2);
    B.render(s);
    c.tone = B.tone;
    features(s, c, o.blink);
    if (spec.details) spec.details(s, c);
    overlays(s, c);
  }

  /* paint code from ramp r at the shade already present (plus delta) — for prints and patterns */
  RIG.over = function (s, x, y, r, delta = 0) {
    const v = s.get(x, y); if (!v) return;
    const sh = v & 15;
    s.px(x, y, r[Math.max(0, Math.min(r.length - 1, sh + delta))]);
  };

  function features(s, c, blink) {
    const h = c.h, sk = c.sk, ex = c.ex, spec = c.spec;
    const lash = spec.lash || c.hr[0];
    const gaze = ex.gaze || [0, 0];
    const bc = spec.brow ? P[spec.brow] : c.hr;
    const b = ex.brow, thick = spec.browThick || 2;
    const [nx, nw] = h.nearEye, [fx, fw] = h.farEye;
    brow(s, nx, nx + nw + 1, h.browY, b[0] + (b[2] || 0), b[1], bc[1], bc[2], thick);
    brow(s, fx + fw - 1, fx - 2, h.browY, b[0], b[1], bc[1], bc[2], thick);
    const st = blink ? (['happy', 'cry'].includes(ex.eye) ? ex.eye : 'closed') : ex.eye;
    const eo = { lash, lash2: sk[1], iris: c.ir, skin: sk, gaze, lashes: spec.lashes };
    eye(s, nx, h.eyeY, nw, st, eo);
    eye(s, fx, h.eyeY, fw, st, Object.assign({}, eo, { far: true, lashes: false }));
    if (spec.lashes && st !== 'happy' && st !== 'cry') { s.px(fx - 1, h.eyeY, lash); s.px(fx - 2, h.eyeY - 1, lash); }
    // nostril and the dark line under the nose tip (the shading does the rest)
    const X = h.noseX, Y = h.noseY;
    s.px(X - 2, Y + 7, sk[1]); s.px(X - 1, Y + 8, sk[2]); s.px(X + 1, Y + 7, sk[2]);
    if (spec.nose === 'long') { s.px(X - 2, Y + 6, sk[1]); s.px(X - 3, Y + 7, sk[1]); }
    // mouth
    const m = RIG.MOUTH[ex.mouth] || RIG.MOUTH.neutral;
    const lipR = spec.lips ? P[spec.lips] : null;
    const legend = {
      l: lipR ? lipR[1] : sk[1], c: lipR ? lipR[0] : sk[0], d: P.lip[0], t: P.white[4], u: P.lip[3],
      p: lipR ? lipR[3] : sk[3], P: lipR ? lipR[4] : sk[5], s: lipR ? lipR[2] : sk[3]
    };
    const w = m[0].length;
    RIG.tpl(s, h.mouthX - Math.floor(w / 2), h.mouthY - (m.length > 3 ? 1 : 0), m, legend);
    // freckles, age lines, stubble
    const inFace = (x, y) => { const v = s.get(x, y); return v && ((v & 0x7ff0) >> 4) === sk.id && (v & 15) >= 3; };
    if (spec.freckles) {
      const fr = [[-6, 10], [-4, 11], [-2, 10], [-5, 12], [-1, 12], [8, 10], [10, 11], [12, 10], [9, 12], [13, 12], [6, 11], [11, 13]];
      for (const [dx, dy] of fr) { const x = h.noseX + dx, y = h.eyeY + dy; if (inFace(x, y)) s.px(x, y, sk[2]); }
    }
    if (spec.lines) {
      const Lv = spec.lines;
      s.line(h.noseX + 5, h.noseY + 8, h.mouthX + 7, h.mouthY + 2, sk[2]);
      s.line(h.noseX - 3, h.noseY + 8, h.mouthX - 6, h.mouthY + 2, sk[2]);
      if (Lv > 1) { s.hline(h.nearEye[0] + 2, h.nearEye[0] + h.nearEye[1] - 3, h.eyeY + 7, sk[2]); s.hline(h.farEye[0] + 1, h.farEye[0] + h.farEye[1] - 2, h.eyeY + 7, sk[2]); }
      if (Lv > 2) { s.hline(h.l + 8, h.r - 10, h.top + 5, sk[3]); s.hline(h.l + 11, h.r - 14, h.top + 8, sk[3]); }
    }
    if (spec.stubble) {
      for (let y = h.mouthY - 3; y <= h.chinY; y++) for (let x = h.l + 4; x < h.r - 3; x++) if (inFace(x, y) && (x * 7 + y * 13) % 5 === 0) s.px(x, y, PX.sh(s.get(x, y), -1));
    }
  }

  function overlays(s, c) {
    const h = c.h, ex = c.ex;
    const lvl = Math.max(ex.blush || 0, c.spec.rosy || 0);
    if (lvl) {
      const [nx] = h.nearEye, [fx] = h.farEye, y = h.eyeY + 8;
      const near = lvl >= 3 ? [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [1, 1], [2, 1], [3, 1], [4, 1]] : lvl === 2 ? [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [1, 1], [2, 1], [3, 1]] : [[1, 0], [2, 0], [3, 0], [2, 1]];
      for (const [dx, dy] of near) s.px(nx + 3 + dx, y + dy, P.blush[lvl >= 3 ? 1 : 2]);
      for (const [dx, dy] of near.slice(0, lvl >= 2 ? 5 : 3)) s.px(fx + dx, y + dy, P.blush[2]);
      if (lvl >= 3) { s.px(nx + 3, y - 1, P.blush[0]); s.px(nx + 5, y - 1, P.blush[0]); s.px(nx + 7, y - 1, P.blush[0]); }
    }
    if (ex.tears) {
      const [nx] = h.nearEye;
      for (let k = 0; k < 10; k++) s.px(nx + 3 + (k > 5 ? 1 : 0), h.eyeY + 6 + k, P.tear[k < 2 ? 4 : 3]);
      for (let k = 0; k < 5; k++) s.px(h.farEye[0] + 2, h.eyeY + 6 + k, P.tear[k < 1 ? 4 : 3]);
    }
    if (ex.sweat) {
      const x = h.r - 5, y = h.top + 4;
      s.px(x, y, P.tear[4]); s.px(x, y + 1, P.tear[4]); s.px(x - 1, y + 2, P.tear[3]); s.px(x, y + 2, P.tear[5]); s.px(x + 1, y + 2, P.tear[3]); s.px(x, y + 3, P.tear[2]);
    }
  }
})();
