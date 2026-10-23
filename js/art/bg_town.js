/* Downtown Derry — the road into town, Center Street, Dot's Diner,
 * Low Tide Records and the Aladdin. Street scenes are built in a tiny
 * pinhole camera (metres: x right, y up, z forward) so storefronts, lamps,
 * cars and signs all share one vanishing point. */
(function () {
  'use strict';
  const K = window.KIT, P = K.PAL, n = K.n;

  /* ---------- local helpers ---------- */
  const FONT = {
    type: "'Special Elite','Courier New',monospace",
    hand: "'Covered By Your Grace','Comic Sans MS',cursive",
    sign: "'Barlow Condensed','Arial Narrow',sans-serif",
    serif: "'IM Fell English SC','Times New Roman',serif"
  };
  /* <text> with an exact advance (textLength) so signs fit whatever font loads. */
  const txt = (x, y, str, { size = 20, fill = '#fff', font = FONT.sign, anchor = 'middle', weight, len, ls, op, tr, style, italic } = {}) => {
    let a = `x="${n(x)}" y="${n(y)}" font-family="${font}" font-size="${n(size)}" fill="${fill}" text-anchor="${anchor}"`;
    if (weight) a += ` font-weight="${weight}"`;
    if (italic) a += ' font-style="italic"';
    if (len) a += ` textLength="${n(len)}" lengthAdjust="spacingAndGlyphs"`;
    if (ls) a += ` letter-spacing="${ls}"`;
    if (op !== undefined) a += ` opacity="${op}"`;
    if (tr) a += ` transform="${tr}"`;
    if (style) a += ` style="${style}"`;
    return `<text ${a}>${K.esc(str)}</text>`;
  };
  const poly = K.poly, rect = K.rect;
  /* Letters stacked down a vertical sign; narrow glyphs keep their natural width. */
  const NARROW = { I: 0.32, J: 0.6, "'": 0.3, '1': 0.5, ' ': 0 };
  const stack = (cx, top, step, str, { size, fill, w, font = FONT.sign, weight = 700, op }) =>
    [...str].map((ch, i) => (ch === ' ' ? '' : txt(cx, top + step * i, ch, { size, fill, font, weight, op, len: w * (NARROW[ch] || 1) }))).join('');
  const pathD = (pts, close = true) => 'M' + pts.map((q) => n(q[0]) + ',' + n(q[1])).join(' L') + (close ? ' Z' : '');

  /* Pinhole camera. VX,VY: vanishing point; f: focal length in px; eye: camera height (m). */
  const cam = (VX, VY, f, eye) => {
    const p = (x, y, z) => [VX + (f * x) / z, VY - (f * (y - eye)) / z];
    Object.assign(p, { VX, VY, f, eye });
    p.pts = (arr) => arr.map((q) => p(q[0], q[1], q[2]));
    p.wx = (x, z0, z1, y0, y1) => p.pts([[x, y1, z0], [x, y1, z1], [x, y0, z1], [x, y0, z0]]); // wall at constant x
    p.wz = (z, x0, x1, y0, y1) => p.pts([[x0, y1, z], [x1, y1, z], [x1, y0, z], [x0, y0, z]]); // wall facing camera
    p.wy = (y, x0, x1, z0, z1) => p.pts([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]); // floor / ceiling
    p.k = (z) => f / z; // px per metre at depth z
    return p;
  };
  /* Axis-aligned box: draws only the faces the camera can see.
   * c.front (facing camera), c.l (face toward -x: lit from the left),
   * c.r (face toward +x: shadow), c.top, c.bot. */
  const box = (p, x0, x1, y0, y1, z0, z1, c, o2) => {
    let s = '';
    if (y1 < p.eye && c.top) s += poly(p.wy(y1, x0, x1, z0, z1), c.top, o2);
    if (y0 > p.eye && c.bot) s += poly(p.wy(y0, x0, x1, z0, z1), c.bot, o2);
    if (x0 > 0 && c.l) s += poly(p.wx(x0, z0, z1, y0, y1), c.l, o2);
    if (x1 < 0 && c.r) s += poly(p.wx(x1, z0, z1, y0, y1), c.r, o2);
    if (c.front) s += poly(p.wz(z0, x0, x1, y0, y1), c.front, o2);
    return s;
  };
  /* Lettering painted on a wall that recedes from the camera (constant x),
   * one glyph at a time so each letter shrinks and leans with the wall.
   * Glyph cells run from zA (first letter) to zB; baseline y0, cap height h. */
  const wallText = (p, x, zA, zB, y0, h, str, { fill = '#fff', font = FONT.sign, weight = 700, op, fit = 0.8, style } = {}) => {
    const N = str.length;
    let s = '';
    for (let i = 0; i < N; i++) {
      const ch = str[i];
      if (ch === ' ') continue;
      const za = zA + ((zB - zA) * i) / N, zb = zA + ((zB - zA) * (i + 1)) / N, zm = (za + zb) / 2;
      const a = p(x, y0, za), b = p(x, y0, zb), m = p(x, y0, zm), mt = p(x, y0 + h, zm);
      const hp = m[1] - mt[1], wp = Math.abs(b[0] - a[0]);
      if (hp < 2 || wp < 0.8) continue;
      const slope = (b[1] - a[1]) / (b[0] - a[0]);
      s += `<text x="0" y="0" transform="matrix(1,${slope.toFixed(4)},0,1,${n(m[0])},${n(m[1])})" font-size="${n(hp / 0.72)}" textLength="${n(wp * fit * (NARROW[ch] || 1))}" lengthAdjust="spacingAndGlyphs" text-anchor="middle">${K.esc(ch)}</text>`;
    }
    return `<g font-family="${font}" font-weight="${weight}" fill="${fill}"${op !== undefined ? ` opacity="${op}"` : ''}${style ? ` style="${style}"` : ''}>${s}</g>`;
  };
  /* A shared soft-halo gradient (objectBoundingBox) so dozens of bulbs cost one <defs>. */
  const haloDef = (id, color, a = 0.7) => `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${a}"/><stop offset="0.35" stop-color="${color}" stop-opacity="${a * 0.4}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
  const screen = 'mix-blend-mode:screen';
  /* Unique gradient names for helpers called in loops (o.id alone repeats within a render). */
  let _u = 0;
  const uq = (nm) => nm + (++_u).toString(36);

  /* Single-stroke spray-paint alphabet on a 0..1 box (x right, y down). */
  const GLYPH = {
    A: [[[0, 1], [0.5, 0], [1, 1]], [[0.22, 0.58], [0.78, 0.58]]],
    C: [[[0.95, 0.15], [0.6, 0], [0.2, 0.08], [0, 0.5], [0.2, 0.92], [0.6, 1], [0.95, 0.85]]],
    E: [[[0.9, 0], [0, 0], [0, 1], [0.9, 1]], [[0, 0.5], [0.7, 0.5]]],
    H: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, 0.5], [1, 0.5]]],
    I: [[[0.5, 0], [0.5, 1]]],
    L: [[[0, 0], [0, 1], [0.85, 1]]],
    N: [[[0, 1], [0, 0], [1, 1], [1, 0]]],
    O: [[[0.5, 0], [0.1, 0.15], [0, 0.5], [0.1, 0.85], [0.5, 1], [0.9, 0.85], [1, 0.5], [0.9, 0.15], [0.5, 0]]],
    T: [[[0, 0], [1, 0]], [[0.5, 0], [0.5, 1]]],
    U: [[[0, 0], [0, 0.75], [0.25, 1], [0.75, 1], [1, 0.75], [1, 0]]],
    V: [[[0, 0], [0.5, 1], [1, 0]]],
    W: [[[0, 0], [0.22, 1], [0.5, 0.35], [0.78, 1], [1, 0]]],
    Y: [[[0, 0], [0.5, 0.5], [1, 0]], [[0.5, 0.5], [0.5, 1]]],
    "'": [[[0.5, 0], [0.4, 0.3]]]
  };
  const GW = { I: 0.3, "'": 0.3, ' ': 0.5 };
  /* Spray-painted words: wobbly round-capped strokes with a soft overspray. */
  const spray = (rng, x, y, h, str, { color = '#eee', w = 0.13, drips = 0, slant = 0, op = 0.92 } = {}) => {
    let core = '', over = '', dr = '';
    let cx = x;
    const jit = () => (rng() - 0.5) * h * 0.06;
    for (const ch of str) {
      const gw = (GW[ch] !== undefined ? GW[ch] : 0.72) * h;
      const g = GLYPH[ch];
      if (g) {
        for (const stroke of g) {
          const pts = stroke.map(([u, v]) => [cx + u * gw + (1 - v) * slant * h + jit(), y - h + v * h + jit()]);
          const d = 'M' + pts.map((q) => n(q[0]) + ',' + n(q[1])).join(' L');
          core += `<path d="${d}"/>`;
          over += `<path d="${d}"/>`;
          if (drips && rng() < drips) {
            const q = pts[pts.length - 1];
            if (q[1] > y - h * 0.3) dr += `<path d="M${n(q[0])},${n(q[1])} l${n((rng() - 0.5) * 2)},${n(h * (0.25 + rng() * 0.7))}"/>`;
          }
        }
      }
      cx += gw + h * 0.22;
    }
    const lw = h * w;
    return `<g fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}">` +
      `<g stroke-width="${n(lw * 2.4)}" opacity="0.18">${over}</g><g stroke-width="${n(lw)}">${core}</g>` +
      (dr ? `<g stroke-width="${n(lw * 0.45)}">${dr}</g>` : '') + '</g>';
  };
  const sprayWidth = (h, str) => [...str].reduce((a, ch) => a + (GW[ch] !== undefined ? GW[ch] : 0.72) * h + h * 0.22, 0) - h * 0.22;

  /* ================================================================== */
  /* 1. The road into Derry, from the station wagon's passenger seat.     */
  ART.bg('road', {
    times: ['rain'],
    draw(o) {
      const rng = o.rng, sign = o.variant === 'sign';
      const L = (c) => K.tone(c, 'rain'), S = (c) => K.shade(c, 'rain');
      const VX = sign ? 690 : 760, VY = 418, f = 1000, eye = 1.25;
      const p = cam(VX, VY, f, eye);
      const haze = '#788292';
      let s = '';

      /* --- sky: rain going to dusk; the town's sodium glow on the cloud deck ahead --- */
      const sk = o.id('sky');
      s += K.defs(K.linear(sk, [[0, '#232a38'], [0.42, '#3a4456'], [0.78, '#5f6979'], [1, '#858b94']])) + rect(0, 0, 1600, VY + 12, `url(#${sk})`);
      s += K.clouds(rng, { count: 6, y0: 70, y1: 300, color: '#4a5366', shadow: '#2a3140', opacity: 0.55, w: 760 });
      s += K.pool(o, VX + 420, VY - 40, 560, 110, '#b08676', 0.30, 'smear');
      s += K.pool(o, VX - 20, VY - 8, 300, 58, P.sodium, 0.26, 'townglow');
      s += K.path(K.ridge(rng, { y: VY - 6, amp: 9, steps: 24, jag: 0.3, bottom: VY + 30 }), K.mix('#3b4658', haze, 0.45));

      /* --- forest: a dark wall each side, then spruce spires on top, far to near --- */
      const nearC = '#18211f', nearS = '#0c1213', fogC = '#4f5966';
      const hz = (z) => 1 - Math.exp(-z / 150);
      for (const side of [-1, 1]) {
        const xe = side > 0 ? 9.5 : -15;
        const g = o.id('fwall' + side);
        s += K.defs(K.linear(g, [[0, K.mix(nearC, fogC, 0.9)], [0.12, K.mix(nearC, fogC, 0.5)], [0.45, nearC], [1, nearS]], VX, 0, side > 0 ? 1600 : 0, 0, true));
        s += poly(p.wx(xe, 4, 900, -0.5, 12.5), `url(#${g})`);
      }
      const things = [];
      for (const side of [-1, 1]) {
        const edge = side > 0 ? 6.2 : -11.2;
        let z = 5.5;
        while (z < 600) {
          things.push({ kind: 'spruce', x: edge + side * rng() * (z < 40 ? 4.5 : 11), z, h: 10 + rng() * 11 });
          z += 0.9 + z * 0.045 * (0.5 + rng());
        }
      }
      // October at the edge of the woods: a few birches and a maple, colour muted by rain
      for (const [x, z, kind] of [[5.5, 17, 'birch'], [6.1, 26, 'birch'], [5.6, 52, 'maple'], [-9.8, 30, 'maple'], [-9.2, 40, 'birch'], [-10.2, 68, 'maple']]) things.push({ kind, x, z, h: kind === 'birch' ? 11 : 8 });
      // telephone poles marching along the left shoulder
      const poles = [];
      for (let z = 9; z < 420; z += 31) poles.push(z);
      for (const z of poles) things.push({ kind: 'pole', x: -7.4, z });
      things.sort((a, b) => b.z - a.z);
      const tops = [];
      for (const tr of things) {
        const [sx, sy] = p(tr.x, 0, tr.z), k = hz(tr.z), hp = (tr.h * f) / tr.z, pk = f / tr.z;
        if (tr.kind === 'spruce') s += K.pine(sx, sy, hp, hp * (0.24 + rng() * 0.08), K.mix('#22302b', fogC, k), K.mix(nearS, fogC, k * 0.95), rng);
        else if (tr.kind === 'birch') {
          const tw = Math.max(1.5, 0.22 * pk), bark = K.mix('#c9c2b0', fogC, 0.25 + k * 0.6);
          s += rect(sx - tw / 2, sy - hp, tw, hp, bark);
          for (let i = 0; i < 7; i++) s += rect(sx - tw / 2, sy - hp * (0.1 + rng() * 0.8), tw * (0.4 + rng() * 0.6), Math.max(1, pk * 0.05), '#2a2a2a', { opacity: 0.6 });
          for (let i = 0; i < 8; i++) { const a = rng() * 6.28, d = rng(); s += K.path(K.blob(rng, sx + Math.cos(a) * d * hp * 0.1, sy - hp * (0.8 + Math.sin(a) * d * 0.12), hp * (0.03 + rng() * 0.035), hp * (0.025 + rng() * 0.02), { lobes: 5, jag: 0.3 }), K.mix(rng() < 0.6 ? '#7d6a34' : '#5e5430', fogC, 0.35 + k * 0.5)); }
        } else if (tr.kind === 'maple') {
          s += K.tree(rng, { x: sx, base: sy, h: hp, w: hp * 0.62, colors: [K.mix('#64342a', fogC, 0.35 + k * 0.5), K.mix('#3a221e', fogC, 0.3 + k * 0.5), K.mix('#7a4a30', fogC, 0.35 + k * 0.5)], trunk: K.mix('#201c1a', fogC, k) });
        } else if (tr.kind === 'pole') {
          const ph = 9.5 * pk, c = K.mix('#1c1a18', fogC, k * 0.9);
          s += rect(sx - Math.max(1, 0.13 * pk), sy - ph, Math.max(2, 0.26 * pk), ph, c) + rect(sx - 1.1 * pk, sy - ph + 0.5 * pk, 2.2 * pk, Math.max(1.2, 0.14 * pk), c);
          tops.push([sx, sy - ph + 0.5 * pk, pk, k]);
        }
      }
      // wires sagging pole to pole, converging on the road ahead
      for (let i = 0; i < tops.length - 1; i++) {
        const [ax, ay, ak, kk] = tops[i], [bx, by, bk] = tops[i + 1];
        const wc = K.mix('#121416', fogC, kk * 0.8);
        for (const off of [-0.9, 0.9]) s += K.wire(ax + off * ak, ay, bx + off * bk, by, 0.9 * (ak + bk) * 0.5, wc, Math.max(0.8, 1.6 - i * 0.15));
      }
      if (tops.length) { const [bx, by, bk] = tops[tops.length - 1]; for (const off of [-0.9, 0.9]) s += K.wire(-40, -30, bx + off * bk, by, 60, '#121416', 1.8); }

      /* --- ground: shoulders, wet asphalt, paint --- */
      const gnd = o.id('gnd');
      s += K.defs(K.linear(gnd, [[0, K.mix('#3a4038', haze, 0.6)], [0.25, '#2a302b'], [1, '#161b19']], 0, VY, 0, 760, true));
      s += poly(p.wy(0, -16, 12, 3, 1200), `url(#${gnd})`);
      const road = o.id('road');
      s += K.defs(K.linear(road, [[0, '#9aa0aa'], [0.06, '#6c7380'], [0.3, '#3e434e'], [1, '#22262e']], 0, VY, 0, 760, true));
      s += poly(p.wy(0, -5.7, 1.6, 2.5, 1200), `url(#${road})`);
      // gravel shoulder edges (slightly lighter, wet)
      s += poly(p.wy(0, 1.6, 2.6, 2.5, 1200), '#3c4146', { opacity: 0.7 });
      s += poly(p.wy(0, -6.9, -5.7, 2.5, 1200), '#3c4146', { opacity: 0.6 });
      // the trees' dark reflections along the road edges
      s += poly(p.wy(0, 0.6, 1.6, 2.5, 1200), '#141a1c', { opacity: 0.35 });
      s += poly(p.wy(0, -5.7, -4.4, 2.5, 1200), '#141a1c', { opacity: 0.35 });
      // edge line (solid white) and centre line (dashed yellow)
      s += poly(p.wy(0, 1.36, 1.5, 2.5, 1200), '#c9ccc8', { opacity: 0.75 });
      for (let z = 3; z < 320; z += 12) s += poly(p.wy(0, -2.24, -2.1, z, z + 3), '#d8b25a', { opacity: 0.85 });

      /* --- the shoulders: dead grass and reflector posts --- */
      {
        let d = '';
        for (let i = 0; i < 90; i++) {
          const side = rng() < 0.62 ? 1 : -1, z = 4 + Math.pow(rng(), 1.6) * 70, x = side > 0 ? 2.8 + rng() * 3.2 : -7.2 - rng() * 3.5;
          const [gx, gy] = p(x, 0, z), k = p.k(z), hgt = (0.3 + rng() * 0.5) * k;
          d += `M${n(gx)},${n(gy)} q${n((rng() - 0.5) * hgt * 0.4)},${n(-hgt * 0.6)} ${n((rng() - 0.3) * hgt * 0.5)},${n(-hgt)} `;
        }
        s += K.path(d, 'none', { stroke: '#6a6450', strokeWidth: 1.3, opacity: 0.55 });
        for (let z = 18; z < 260; z += 24) {
          const [dx, dy] = p(2.4, 0, z), k = p.k(z);
          s += rect(dx - 0.05 * k, dy - 1.1 * k, Math.max(1.2, 0.1 * k), 1.1 * k, '#b9bcb8', { opacity: 0.8 });
          if (z < 60) s += rect(dx - 0.05 * k, dy - 1.0 * k, Math.max(1.2, 0.1 * k), 0.16 * k, '#fff2c0');
        }
      }

      /* --- our headlights on the wet road --- */
      const hl = '#efe6cf';
      s += K.shaft(o, [[430, 760], [1110, 760], [VX + 70, VY + 34], [VX - 120, VY + 34]], hl, 0.09, 'beam', [0, 1, 0, 0]);
      const [, py1] = p(0, 0, 13), [, py2] = p(0, 0, 26);
      s += `<g style="${screen}">` + K.pool(o, VX + 30, py1, 330, 46, hl, 0.24, 'hp1') + K.pool(o, VX + 10, py2, 170, 20, hl, 0.18, 'hp2') + '</g>';
      // paint glints where the beams land
      for (let z = 6; z < 34; z += 12) s += poly(p.wy(0, -2.24, -2.1, z, z + 3), '#fff0b8', { opacity: 0.5 });
      s += poly(p.wy(0, 1.36, 1.5, 6, 34), '#ffffff', { opacity: 0.35 });

      /* --- a deer-crossing sign on the right shoulder (default view) --- */
      if (!sign) {
        const z = 36, x = 3.6;
        const [px, py] = p(x, 0, z), k = p.k(z);
        s += rect(px - 0.05 * k, py - 2.6 * k, 0.1 * k, 2.6 * k, '#3a3d40');
        const cy = py - 2.6 * k, r = 0.5 * k;
        s += poly([[px, cy - r], [px + r, cy], [px, cy + r], [px - r, cy]], K.mix('#d9a441', haze, 0.25));
        s += poly([[px, cy - r * 0.86], [px + r * 0.86, cy], [px, cy + r * 0.86], [px - r * 0.86, cy]], 'none', { stroke: '#2a2a2a', strokeWidth: 1.2 });
        s += K.path(`M${n(px - r * 0.42)},${n(cy + r * 0.2)} l${n(r * 0.18)},${n(-r * 0.32)} l${n(r * 0.42)},0 l${n(r * 0.16)},${n(-r * 0.22)} l${n(r * 0.08)},${n(r * 0.1)} l${n(-r * 0.1)},${n(r * 0.2)} l${n(-r * 0.06)},${n(r * 0.36)} l${n(-r * 0.08)},0 l${n(0)},${n(-r * 0.26)} l${n(-r * 0.36)},0 l${n(-r * 0.06)},${n(r * 0.26)} Z`, '#232323');
      }

      /* --- the town sign, caught in our headlights --- */
      if (sign) {
        const z = 11.5, xa = 3.35, xb = 7.3, yb = 1.05, yt = 3.25;
        const [ax, ay] = p(xa, yt, z), [bx, by] = p(xb, yb, z), k = p.k(z);
        const W = bx - ax, H = by - ay;
        // posts + their long shadows thrown back into the trees
        for (const u of [0.18, 0.82]) {
          const px = ax + W * u, pw = 0.22 * k;
          s += poly([[px - pw / 2, by], [px + pw / 2, by], [px + pw * 3.2, by - 30], [px + pw * 2.2, by - 30]], '#060909', { opacity: 0.5 });
          s += rect(px - pw / 2, by - 4, pw, p(xa, 0, z)[1] - by + 4, '#6d5a48') + rect(px + pw * 0.12, by - 4, pw * 0.38, p(xa, 0, z)[1] - by + 4, '#3e3128');
        }
        // weeds + dry grass at the foot, lit
        const gy = p(xa, 0, z)[1];
        for (let i = 0; i < 46; i++) {
          const gx = ax - 40 + rng() * (W + 90), gh = 14 + rng() * 34;
          s += K.path(`M${n(gx)},${n(gy + 4)} q${n((rng() - 0.5) * 10)},${n(-gh * 0.6)} ${n((rng() - 0.3) * 14)},${n(-gh)}`, 'none', { stroke: rng() < 0.5 ? '#b9a27a' : '#8a7a5c', strokeWidth: 1.6, opacity: 0.85 });
        }
        // the board: weathered planks with a carved crest
        const board = '#5e4330', boardS = '#33261c';
        s += K.path(`M${n(ax - 8)},${n(ay + 10)} Q${n(ax + W / 2)},${n(ay - 36)} ${n(bx + 8)},${n(ay + 10)} L${n(bx + 8)},${n(by + 6)} L${n(ax - 8)},${n(by + 6)} Z`, boardS);
        s += K.path(`M${n(ax)},${n(ay + 12)} Q${n(ax + W / 2)},${n(ay - 26)} ${n(bx)},${n(ay + 12)} L${n(bx)},${n(by)} L${n(ax)},${n(by)} Z`, board);
        for (let i = 1; i < 6; i++) s += rect(ax, ay + 12 + ((H - 12) * i) / 6, W, 1.6, boardS, { opacity: 0.55 });
        for (let i = 0; i < 9; i++) { const yy = ay + 20 + rng() * (H - 26), xx = ax + rng() * W * 0.8; s += rect(xx, yy, 20 + rng() * 60, 1, '#3a2a1f', { opacity: 0.35 }); }
        // weathering: water streaks, lichen, a split plank, a chipped corner of raw wood
        for (let i = 0; i < 14; i++) { const xx = ax + 6 + rng() * (W - 12), y0 = ay + 8 + rng() * 20; s += rect(xx, y0, 1.5 + rng() * 2.5, 20 + rng() * (H * 0.6), '#24190f', { opacity: 0.16 + rng() * 0.14 }); }
        for (let i = 0; i < 10; i++) { const xx = ax + (rng() < 0.5 ? rng() * W * 0.25 : W * (0.75 + rng() * 0.25)), yy = by - 4 - rng() * H * 0.3; s += K.circle(xx, yy, 1.5 + rng() * 3.5, '#8c8a6c', { opacity: 0.45 }); }
        s += K.path(`M${n(ax + W * 0.62)},${n(ay + H * 0.32)} l${n(W * 0.08)},${n(3)} l${n(W * 0.1)},${n(-2)} l${n(W * 0.12)},${n(4)}`, 'none', { stroke: '#1e150e', strokeWidth: 1.4, opacity: 0.7 });
        s += K.path(`M${n(ax - 8)},${n(by + 6)} L${n(ax - 8)},${n(by - 22)} L${n(ax + 4)},${n(by - 14)} L${n(ax + 10)},${n(by - 4)} L${n(ax + 22)},${n(by + 6)} Z`, '#a88a62');
        // routed border
        s += K.path(`M${n(ax + 8)},${n(ay + 18)} Q${n(ax + W / 2)},${n(ay - 14)} ${n(bx - 8)},${n(ay + 18)} L${n(bx - 8)},${n(by - 8)} L${n(ax + 8)},${n(by - 8)} Z`, 'none', { stroke: '#e3d6b4', strokeWidth: 2.4, opacity: 0.8 });
        // lettering
        const cx = ax + W / 2, cream = '#f1e6c8';
        s += txt(cx, ay + H * 0.43, 'DERRY', { size: H * 0.34, fill: cream, font: FONT.serif, len: W * 0.62, ls: 2 });
        s += txt(cx, ay + H * 0.58, 'Welcome Home', { size: H * 0.13, fill: cream, font: FONT.serif, italic: true, len: W * 0.42 });
        // graffiti: crossed-out warning, and the answer under it in a different paint
        const g1 = 'LEAVE WHILE YOU CAN', gh1 = H * 0.096, gw1 = sprayWidth(H * 0.096, g1);
        const g1x = cx - gw1 / 2, g1y = ay + H * 0.74;
        s += spray(rng, g1x, g1y, gh1, g1, { color: '#ece8de', w: 0.17, slant: 0.06, op: 0.88 });
        s += K.path(`M${n(g1x - 10)},${n(g1y - gh1 * 0.42)} C${n(g1x + gw1 * 0.3)},${n(g1y - gh1 * 0.85)} ${n(g1x + gw1 * 0.7)},${n(g1y - gh1 * 0.05)} ${n(g1x + gw1 + 12)},${n(g1y - gh1 * 0.55)}`, 'none', { stroke: '#0e0c0c', strokeWidth: 5.5, strokeLinecap: 'round', opacity: 0.94 });
        s += K.path(`M${n(g1x - 4)},${n(g1y + gh1 * 0.05)} L${n(g1x + gw1 + 6)},${n(g1y - gh1 * 0.95)}`, 'none', { stroke: '#0e0c0c', strokeWidth: 4.2, strokeLinecap: 'round', opacity: 0.9 });
        const g2 = "YOU CAN'T", gh2 = H * 0.15, gw2 = sprayWidth(gh2, g2);
        s += spray(rng, cx - gw2 / 2 + 8, ay + H * 0.945, gh2, g2, { color: '#c0281e', w: 0.23, drips: 0.8, slant: -0.05, op: 1 });
        // headlight wash: hot at the lower left, falling off up and right
        const wash = o.id('wash');
        s += K.defs(K.linear(wash, [[0, '#fff2d2', 0.62], [0.5, '#fff2d2', 0.2], [1, '#fff2d2', 0.02]], 0, 1, 1, 0));
        s += `<g style="${screen}">` + K.path(`M${n(ax - 8)},${n(ay + 10)} Q${n(ax + W / 2)},${n(ay - 36)} ${n(bx + 8)},${n(ay + 10)} L${n(bx + 8)},${n(by + 6)} L${n(ax - 8)},${n(by + 6)} Z`, `url(#${wash})`) + '</g>';
        s += `<g style="${screen}">` + K.pool(o, ax + W * 0.35, gy - 6, W * 0.9, 34, '#fff2d2', 0.25, 'signfoot') + K.glow(o, ax + W * 0.3, ay + H * 0.6, W * 0.9, '#fff2d2', 0.12, 'signhalo') + K.pool(o, ax + W * 0.28, ay + H * 0.78, W * 0.45, H * 0.4, '#fff6e0', 0.22, 'hot') + '</g>';
      }

      /* --- the oncoming car, far ahead: two lights and their long wet reflections --- */
      const oz = sign ? 150 : 120;
      const l1 = p(-4.6, 0.62, oz), l2 = p(-3.2, 0.62, oz);
      s += K.rect(l1[0] - 6, l1[1] - 5, l2[0] - l1[0] + 12, 9, '#1a1e26', { opacity: 0.7, rx: 3 });
      const rf = o.id('refl');
      s += K.defs(K.linear(rf, [[0, '#fff1d0', 0.75], [0.35, '#f8deaa', 0.3], [1, '#f8deaa', 0]]));
      s += `<g style="${screen}">`;
      for (const q of [l1, l2]) s += rect(q[0] - 2.2, q[1] + 3, 4.4, 230, `url(#${rf})`) + rect(q[0] - 7, q[1] + 3, 14, 150, `url(#${rf})`, { opacity: 0.35 });
      s += K.glow(o, (l1[0] + l2[0]) / 2, l1[1], 120, '#fff0cc', 0.42, 'oncg') + K.glow(o, (l1[0] + l2[0]) / 2, l1[1], 34, '#ffffff', 0.7, 'oncc');
      s += rect(l1[0] - 60, l1[1] - 0.8, l2[0] - l1[0] + 120, 1.6, '#fff4dc', { opacity: 0.35 });
      s += '</g>';
      s += K.circle(l1[0], l1[1], 2.6, '#ffffff') + K.circle(l2[0], l2[1], 2.6, '#ffffff');

      /* --- rain on the glass: wiper fans are clearer, the corners are beaded and streaked --- */
      const dg = o.id('drop');
      s += `<defs><radialGradient id="${dg}" cx="0.5" cy="0.5" r="0.5" fx="0.5" fy="0.72"><stop offset="0" stop-color="#e6ecf2" stop-opacity="0.5"/><stop offset="0.45" stop-color="#a7b2bf" stop-opacity="0.18"/><stop offset="0.82" stop-color="#3b4452" stop-opacity="0.16"/><stop offset="1" stop-color="#0e121a" stop-opacity="0.5"/></radialGradient></defs>`;
      const fans = [[150, 690, 620, 0.0, 2.15], [720, 690, 700, 0.0, 1.95]]; // pivot x,y, radius, angle range (rad, ccw from +x)
      const inFan = (x, y) => fans.some(([px, py, r, a0, a1]) => { const dx = x - px, dy = py - y, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx); return d < r && d > 60 && a >= a0 && a <= a1; });
      let drops = '', streaks = '', specs = '';
      for (let i = 0; i < 330; i++) {
        const x = 40 + rng() * 1500, y = 30 + rng() * 620;
        const fan = inFan(x, y);
        if (fan && rng() < 0.55) continue;
        const r = fan ? 1.5 + rng() * 2.5 : 2 + rng() * 5.5;
        drops += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r)}" ry="${n(r * (0.85 + rng() * 0.3))}" fill="url(#${dg})"/>`;
        if (r > 4.5) specs += `<circle cx="${n(x - r * 0.35)}" cy="${n(y - r * 0.35)}" r="${n(r * 0.22)}"/>`;
        if (!fan && r > 4 && rng() < 0.35) {
          const len = 30 + rng() * 120;
          streaks += `<path d="M${n(x)},${n(y + r)} q${n((rng() - 0.5) * 12)},${n(len * 0.5)} ${n((rng() - 0.5) * 10)},${n(len)}"/>`;
        }
      }
      // droplets in front of the bright things light up
      const hot = sign ? [[1090, 330, 200], [l1[0], l1[1], 60]] : [[l1[0], l1[1], 70]];
      for (const [hx, hy, hr] of hot) for (let i = 0; i < (sign ? 26 : 10); i++) {
        const a = rng() * 6.28, d = Math.sqrt(rng()) * hr, r = 1.5 + rng() * 3;
        specs += `<circle cx="${n(hx + Math.cos(a) * d)}" cy="${n(hy + Math.sin(a) * d * 0.7)}" r="${n(r * 0.6)}"/>`;
      }
      s += `<g fill="none" stroke="#c4ced8" stroke-width="1.6" opacity="0.28" stroke-linecap="round">${streaks}</g>${drops}<g fill="#f4f7fa" opacity="0.6">${specs}</g>`;
      // misting low on the glass
      s += K.band(o, 520, 150, '#9aa4b0', 0, 0.12, 'mist');

      /* ---------------- the car ---------------- */
      const trim = '#24242a', trimL = '#34343c';
      // driver-side window beyond the far A-pillar; passenger window beyond ours
      s += poly([[0, 0], [190, 0], [40, 640], [0, 650]], '#151b1c');
      s += poly([[1450, 0], [1600, 0], [1600, 560], [1560, 600]], '#141a1b');
      for (let i = 0; i < 14; i++) { const y = 40 + rng() * 520; s += rect(1500 + rng() * 90, y, 1.5, 18 + rng() * 40, '#8c97a3', { opacity: 0.25 }); }
      // A-pillars
      s += poly([[150, 0], [236, 0], [64, 652], [0, 660], [0, 600]], trim);
      s += poly([[218, 0], [236, 0], [64, 652], [52, 650]], trimL);
      s += poly([[1360, 0], [1462, 0], [1600, 560], [1600, 690], [1520, 680]], trim);
      s += poly([[1360, 0], [1378, 0], [1532, 680], [1520, 680]], trimL);
      // side mirror through the passenger window
      s += K.path('M1556,590 q40,-12 50,10 l0,64 q-34,8 -54,-6 Z', '#1a1a1e');
      // headliner + folded sun visor
      s += K.path('M0,0 H1600 V58 Q1180,24 800,26 Q380,30 0,72 Z', '#2c2b31');
      s += K.path('M0,64 Q380,24 800,20 Q1180,18 1600,52', 'none', { stroke: '#3c3b42', strokeWidth: 3 });
      s += K.path('M880,0 H1360 V40 Q1340,58 1300,56 H930 Q890,56 880,40 Z', '#38363d');
      s += K.path('M896,6 H1344 V36 Q1330,48 1300,48 H932 Q904,48 896,36 Z', 'none', { stroke: '#2a292e', strokeWidth: 2, strokeDasharray: '4 4' });
      // rear-view mirror on its stalk; the back window glows faintly in it
      s += rect(584, 18, 14, 40, '#1d1d22') + K.ellipse(591, 22, 22, 9, '#232328');
      s += rect(468, 56, 250, 66, '#18181c', { rx: 16 });
      const mg = o.id('mirror');
      s += K.defs(K.linear(mg, [[0, '#4a5262'], [0.5, '#2c323d'], [1, '#1c2028']]));
      s += rect(478, 63, 230, 52, `url(#${mg})`, { rx: 11 });
      s += poly([[524, 72], [664, 72], [682, 104], [508, 104]], '#6d7684', { opacity: 0.5 });
      s += rect(512, 88, 48, 27, '#7a6248') + rect(552, 80, 40, 35, '#8a7052') + rect(616, 92, 58, 23, '#6e5840') + K.path('M640,92 l8,-16 l20,0 l6,16 Z', '#3a3036');
      s += rect(512, 88, 48, 3, '#a08664', { opacity: 0.7 }) + K.line(572, 80, 572, 115, '#5a4a38', 1);
      s += rect(478, 63, 230, 6, '#ffffff', { opacity: 0.06, rx: 3 });
      // pine-tree air freshener, hanging a little crooked
      const fx = 612, fy = 196;
      s += K.path(`M600,122 Q604,150 ${fx},${fy - 6}`, 'none', { stroke: '#d8d2c2', strokeWidth: 1.4 });
      const tree = (x, y, sc, c) => `M${n(x)},${n(y)} l${n(9 * sc)},${n(14 * sc)} l${n(-4 * sc)},0 l${n(13 * sc)},${n(17 * sc)} l${n(-5 * sc)},0 l${n(16 * sc)},${n(21 * sc)} l${n(-23 * sc)},0 l0,${n(9 * sc)} l${n(-6 * sc)},0 l0,${n(-9 * sc)} l${n(-23 * sc)},0 l${n(16 * sc)},${n(-21 * sc)} l${n(-5 * sc)},0 l${n(13 * sc)},${n(-17 * sc)} l${n(-4 * sc)},0 Z`;
      s += `<g transform="rotate(-7 ${fx} ${fy})">` + K.path(tree(fx + 2, fy - 4, 1.18, 0), '#0f1512', { opacity: 0.4 }) + K.path(tree(fx, fy - 6, 1.18, 0), '#3d5a48') +
        K.path(`M${fx},${fy - 6} l${n(10.6)},${n(16.5)} l-4.7,0 l15.3,20 l-5.9,0 l18.9,24.8 l-34.2,0 Z`, '#2a4234') + rect(fx - 9, fy + 32, 18, 7, '#e8dcc0', { opacity: 0.85 }) + '</g>';

      // wipers at rest along the cowl
      s += K.path('M150,662 L708,640', 'none', { stroke: '#101012', strokeWidth: 7, strokeLinecap: 'round' });
      s += K.path('M196,654 L700,634', 'none', { stroke: '#1d1d22', strokeWidth: 4 });
      s += K.path('M742,660 L1402,630', 'none', { stroke: '#101012', strokeWidth: 7, strokeLinecap: 'round' });
      s += K.path('M790,652 L1396,624', 'none', { stroke: '#1d1d22', strokeWidth: 4 });

      // dashboard: padded top, defroster slots, instrument hood on the driver's side
      const dash = '#2a2225', dashTop = '#3b3036';
      s += K.path('M0,598 C90,566 220,566 300,620 C420,662 900,654 1600,636 L1600,900 L0,900 Z', dash);
      s += K.path('M0,598 C90,566 220,566 300,620 C420,662 900,654 1600,636 L1600,664 C900,684 420,690 300,654 C220,606 90,604 0,630 Z', dashTop);
      for (let i = 0; i < 26; i++) { const x = 420 + i * 40; s += rect(x, 664 - i * 0.6, 28, 3, '#141114', { opacity: 0.8, rx: 1.5 }); }
      // a folded road map on the dash in front of the passenger
      s += K.path('M1010,668 L1236,656 L1262,682 L1028,696 Z', '#8f8572') + K.path('M1092,664 L1116,690 M1172,660 L1196,686', 'none', { stroke: '#6f6656', strokeWidth: 1.2 });
      s += K.path('M1030,684 C1080,676 1120,684 1160,672 S1220,668 1250,676', 'none', { stroke: '#a8483a', strokeWidth: 1.6, opacity: 0.8 }) + K.path('M1060,692 C1090,680 1150,666 1210,664', 'none', { stroke: '#4a6a8a', strokeWidth: 1.2, opacity: 0.7 });
      // dash glow from the gauges
      s += K.glow(o, 120, 640, 200, '#f2b45a', 0.16, 'gauge');
      s += K.path('M0,626 C90,596 220,598 290,640', 'none', { stroke: '#f2b45a', strokeWidth: 2, opacity: 0.4 });
      // steering wheel rim at the far left
      s += K.path('M-60,900 C-60,700 260,680 300,900', 'none', { stroke: '#151214', strokeWidth: 34 });
      s += K.path('M-50,890 C-40,712 250,694 286,890', 'none', { stroke: '#2a2428', strokeWidth: 6 });
      // the dash face: wood-grain strip across, glovebox, centre stack
      s += K.path('M260,722 C600,712 1100,708 1600,702 L1600,738 C1100,744 600,748 260,758 Z', '#7a4c2e');
      for (let i = 0; i < 7; i++) {
        const y0 = 716 + i * 5 + rng() * 2;
        s += K.path(`M260,${n(y0 + 6)} C${n(500 + rng() * 200)},${n(y0 - 2 + rng() * 6)} ${n(1000 + rng() * 200)},${n(y0 - 8 + rng() * 6)} 1600,${n(y0 - 14)}`, 'none', { stroke: i % 2 ? '#5c3720' : '#93603a', strokeWidth: 1.4, opacity: 0.7 });
      }
      s += K.path('M260,722 C600,712 1100,708 1600,702', 'none', { stroke: '#b98a5a', strokeWidth: 1.6, opacity: 0.6 });
      s += K.path('M860,780 L1380,772 L1384,880 L864,890 Z', '#251e21');
      s += rect(1090, 796, 64, 12, '#8d8a86', { rx: 4 });
      // centre stack: cassette deck, tape half in, amber display
      s += K.path('M250,760 L560,754 L566,900 L240,900 Z', '#1d181b');
      s += rect(282, 772, 252, 72, '#111013', { rx: 4 }) + rect(282, 772, 252, 3, '#6a6670');
      s += rect(330, 790, 156, 22, '#060507') + rect(344, 776, 128, 20, '#e9e1cf') + rect(344, 776, 128, 6, '#c8463a');
      s += txt(408, 794, 'MIX ’91', { size: 13, fill: '#2a2430', font: FONT.hand, len: 60 });
      s += rect(330, 818, 70, 16, '#1b0f05') + txt(365, 831, '88.7', { size: 14, fill: P.sodium, font: FONT.type, len: 50 });
      s += K.circle(304, 812, 12, '#2c2a30') + K.circle(512, 812, 12, '#2c2a30') + K.circle(304, 812, 4, '#77727c') + K.circle(512, 812, 4, '#77727c');
      s += K.glow(o, 365, 826, 50, P.sodium, 0.18, 'radio');

      // dusk light leaking in, a final cool veil over the interior
      s += K.band(o, 600, 300, '#06080c', 0, 0.35, 'low');
      return s;
    }
  });
  /* ================================================================== */
  /* 2. Center Street, looking down the block to the canal bridge.        */
  ART.bg('downtown', {
    times: ['day', 'dusk', 'night', 'festival'],
    draw(o) {
      const t = o.time, rng = o.rng;
      const fest = t === 'festival', night = t === 'night', day = t === 'day', dusk = t === 'dusk' || fest;
      const L = (c) => K.tone(c, t), S = (c) => K.shade(c, t), T = K.TOD[t];
      const on = !day;
      const p = cam(920, 440, 1000, 1.6);
      const xL = -10, xR = 7.8, cL = -6.6, cR = 5.6;
      const FX = (side, dx = 0) => (side < 0 ? xL + dx : xR - dx);
      const face = (side, c) => (side < 0 ? S(c) : L(c));
      const nearFace = (c) => K.mix(L(c), S(c), 0.25);
      let s = '';

      /* shared gradients */
      const gLit = o.id('lit'), gGlass = o.id('glass'), gGlassS = o.id('glassS'), gHalo = o.id('halo'), gHaloW = o.id('halow'), gNeonR = o.id('neonr');
      s += '<defs>' + K.linear(gLit, [[0, '#fff2cf'], [0.55, '#ffd38a'], [1, '#eaa75a']]) +
        K.linear(gGlass, [[0, K.mix(L('#a8b8c6'), T.haze, 0.25)], [0.5, L('#4a586c')], [1, L('#2a3244')]]) +
        K.linear(gGlassS, [[0, K.mix(S('#97a7b8'), T.haze, 0.15)], [0.5, S('#3d4a5e')], [1, S('#20283a')]]) +
        haloDef(gHalo, P.sodium, 0.6) + haloDef(gHaloW, P.window, 0.45) + haloDef(gNeonR, '#ff5a4a', 0.5) + '</defs>';
      const glassFill = (side, lit) => (lit ? `url(#${gLit})` : `url(#${side < 0 ? gGlassS : gGlass})`);
      const halo = (x, y, r, id = gHalo, op = 1) => `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r)}" ry="${n(r)}" fill="url(#${id})" opacity="${op}" style="${screen}"/>`;

      /* ---------- sky ---------- */
      s += K.sky(o, t);
      if (day) s += K.clouds(rng, { count: 9, y0: 20, y1: 320, color: '#f1efe9', shadow: '#c3c9cf', opacity: 0.72, w: 560 });
      if (dusk) s += K.clouds(rng, { count: 7, y0: 40, y1: 330, color: '#f2a27a', shadow: '#7a5576', opacity: 0.55, w: 600 });
      if (night) {
        s += K.stars(rng, { count: 45, x0: 400, x1: 1400, y1: 300 });
        s += K.clouds(rng, { count: 4, y0: 70, y1: 290, color: '#2a3654', shadow: '#151c2e', opacity: 0.7, w: 620 });
        s += K.circle(1012, 96, 24, '#e9e4d2', { opacity: 0.92 }) + K.glow(o, 1012, 96, 130, '#c8d4f0', 0.22, 'moon');
      }
      if (dusk) s += K.pool(o, 930, 420, 560, 190, '#f2a468', 0.38, 'sunset');

      /* ---------- the far town, up the hill past the canal ---------- */
      const g = (z) => (z <= 58 ? 0 : 16 * Math.pow(Math.min(1, (z - 58) / 190), 1.25));
      s += K.path(K.ridge(rng, { x0: 560, x1: 1300, y: 362, amp: 16, steps: 18, jag: 0.3, bottom: 470 }), K.mix(L(P.slate), T.haze, 0.6));
      for (let i = 0; i < 26; i++) {
        const x = 600 + rng() * 660, y = 352 + Math.sin(x * 0.01) * 6 + rng() * 14;
        s += K.path(K.blob(rng, x, y, 14 + rng() * 14, 9 + rng() * 6, { lobes: 5, jag: 0.25 }), K.mix(L(rng.pick([P.rust, P.ember, P.mustard, P.pine])), T.haze, 0.62));
      }
      const fh = (c, k = 0.55) => K.mix(c, T.haze, k);
      // the rising street and its houses
      const farSeg = [[58, 74], [74, 92], [92, 114], [114, 140], [140, 172], [172, 210]];
      for (let i = farSeg.length - 1; i >= 0; i--) {
        const [z0, z1] = farSeg[i], gy = g(z0), k = 0.35 + i * 0.07;
        for (const side of [-1, 1]) {
          const fx = side < 0 ? -9 : 7.5, back = side < 0 ? -26 : 24, hh = 6 + ((i * 7 + (side > 0 ? 3 : 0)) % 5);
          const c = rng.pick(['#d8d0bc', '#8c3b2e', '#c9c2b0', '#7f977a', '#b9a37d']);
          const P3 = (x, y, z) => p(x, y + gy, z);
          s += poly([P3(back, hh, z0), P3(fx, hh, z0), P3(fx, 0, z0), P3(back, 0, z0)], fh(nearFace(c), k));
          s += poly([P3(fx, hh, z0), P3(fx, hh, z1), P3(fx, 0, z1), P3(fx, 0, z0)], fh(face(side, c), k));
          s += poly([P3(fx, hh, z0), P3((fx + back) / 2, hh + 3, z0), P3(back, hh, z0)], fh(L('#4a4550'), k));
          if (on) for (let w = 0; w < 3; w++) if (rng() < 0.6) { const q = P3(fx + (back - fx) * (0.2 + w * 0.25), hh * 0.55, z0); s += rect(q[0] - 1.5, q[1] - 2, 3, 4, P.window, { opacity: 0.9 }); }
        }
      }
      // the white church on the hill
      {
        const z = 196, gy = g(z), P3 = (x, y) => p(x, y + gy, z);
        const wc = fh(L('#ece3cf'), 0.4), ws = fh(S('#ece3cf'), 0.4);
        const a = P3(9, 0), b = P3(17, 7), sp = P3(11.5, 0);
        s += rect(a[0], b[1], b[0] - a[0], a[1] - b[1], wc) + poly([[a[0] - 2, b[1]], [(a[0] + b[0]) / 2, b[1] - 16], [b[0] + 2, b[1]]], fh(L('#4a4550'), 0.4));
        const tw = 0.06 * (b[0] - a[0]) + 6;
        const t0 = P3(11.5, 16), t1 = P3(11.5, 30);
        s += rect(sp[0] - tw, t0[1], tw * 2, b[1] - t0[1] + 2, wc) + rect(sp[0], t0[1], tw, b[1] - t0[1] + 2, ws);
        s += poly([[sp[0] - tw - 1, t0[1]], [sp[0], t1[1]], [sp[0] + tw + 1, t0[1]]], wc) + poly([[sp[0], t1[1]], [sp[0] + tw + 1, t0[1]], [sp[0], t0[1]]], ws);
        s += rect(sp[0] - tw * 0.45, t0[1] + 8, tw * 0.9, 6, fh(L('#3a3440'), 0.3));
        if (on) s += rect(a[0] + 4, b[1] + 8, 3, 5, P.window) + rect(a[0] + 12, b[1] + 8, 3, 5, P.window);
      }
      // the far road surface climbing away
      s += poly([p(-5.2, 0, 58), p(4.2, 0, 58), p(3.8, g(150), 150), p(-4.8, g(150), 150)], fh(L('#404249'), 0.32));
      s += poly([p(-4.8, g(150), 150), p(3.8, g(150), 150), p(3.6, g(240), 240), p(-4.6, g(240), 240)], fh(L('#404249'), 0.45));
      s += poly([p(-0.55, 0, 58), p(-0.35, 0, 58), p(-0.35, g(200), 200), p(-0.55, g(200), 200)], fh(L('#d9b25a'), 0.4));
      if (dusk || night) for (const z of [70, 95, 125, 165]) { const q = p(-6.2, g(z) + 4, z), q2 = p(5.2, g(z) + 4, z); s += K.circle(q[0], q[1], 1.6, P.sodium) + K.circle(q2[0], q2[1], 1.6, P.sodium) + halo(q[0], q[1], 9) + halo(q2[0], q2[1], 9); }

      /* ---------- the canal bridge ---------- */
      // blocks beyond the canal (only their near walls show through the gap)
      for (const side of [-1, 1]) {
        const fx = side < 0 ? xL : xR, back = side < 0 ? -30 : 30, c = side < 0 ? '#b9a37d' : '#8c3b2e';
        s += poly(p.wz(58, Math.min(fx, back), Math.max(fx, back), 0, 9.5), fh(nearFace(c), 0.3));
        s += poly(p.wx(fx, 58, 72, 0, 9.5), fh(face(side, c), 0.3));
      }
      const bridge = L('#b5b0a4'), bridgeS = S('#b5b0a4');
      s += box(p, -6.95, -6.45, 0, 1.1, 51, 58.5, { top: bridge, r: bridgeS, front: bridge });
      s += box(p, 5.15, 5.65, 0, 1.1, 51, 58.5, { top: bridge, l: K.mix(bridge, bridgeS, 0.3), front: bridge });
      // the canal channel itself, seen past the parapet ends
      s += poly(p.wy(0, -10, -6.95, 51, 58.5), L('#2b3542'));
      s += poly(p.wy(0, 5.65, 7.8, 51, 58.5), L('#2b3542'));
      for (const [x, z] of [[-6.7, 51.3], [-6.7, 58.2], [5.4, 51.3], [5.4, 58.2]]) {
        const [bx, by] = p(x, 1.1, z), k = p.k(z);
        s += rect(bx - 0.06 * k, by - 3.2 * k, 0.12 * k, 3.2 * k, L('#2a2c30'));
        s += K.circle(bx, by - 3.3 * k, 0.2 * k, on ? '#fff0c8' : L('#e9e4d8'));
        if (on) s += halo(bx, by - 3.3 * k, 18);
      }

      /* ---------- street, sidewalks, curbs ---------- */
      const road = L(night ? '#3c3f47' : '#4c4e55'), walk = L('#aba596'), curb = L('#c2bdb0');
      s += poly(p.wy(0, cL, cR, 2.2, 51), road);
      s += poly(p.wy(0.15, xL, cL, 2.2, 51), walk) + poly(p.wy(0.15, cR, xR, 2.2, 51), walk);
      s += poly(p.wx(cL, 2.2, 51, 0, 0.15), S('#c2bdb0')) + poly(p.wx(cR, 2.2, 51, 0, 0.15), curb);
      s += poly(p.wy(0.151, cL - 0.35, cL, 2.2, 51), curb) + poly(p.wy(0.151, cR, cR + 0.35, 2.2, 51), curb);
      { // slab joints
        let d = '';
        for (let z = 3; z < 51; z += 1.6) { const a = p(xL, 0.15, z), b = p(cL - 0.35, 0.15, z), c = p(cR + 0.35, 0.15, z), e = p(xR, 0.15, z); d += `M${n(a[0])},${n(a[1])} L${n(b[0])},${n(b[1])} M${n(c[0])},${n(c[1])} L${n(e[0])},${n(e[1])} `; }
        s += K.path(d, 'none', { stroke: S('#aba596'), strokeWidth: 1, opacity: 0.6 });
      }
      // paint: double yellow, parking ticks, the crosswalk at our feet
      s += poly(p.wy(0, -0.62, -0.5, 2.2, 51), L('#d9b25a')) + poly(p.wy(0, -0.38, -0.26, 2.2, 51), L('#d9b25a'));
      for (let z = 8; z < 50; z += 6.5) s += poly(p.wy(0, cL, cL + 2.1, z, z + 0.12), L('#d8d4c8'), { opacity: 0.7 }) + poly(p.wy(0, cR - 2.1, cR, z, z + 0.12), L('#d8d4c8'), { opacity: 0.7 });
      for (let x = cL + 0.4; x < cR - 0.4; x += 1.1) s += poly(p.wy(0, x, x + 0.55, 3.0, 6.0), L('#dedad0'), { opacity: 0.85 });
      { const [mx, my] = p(1.4, 0, 13), k = p.k(13); s += K.ellipse(mx, my, 0.36 * k, 0.36 * k * 1.6 / 13, S('#3a3c42')) + K.ellipse(mx, my, 0.28 * k, 0.28 * k * 1.6 / 13, 'none', { stroke: L('#6a6c70'), strokeWidth: 1 }); }
      // tar-sealed frost cracks, storm drains, leaves banked in the gutters
      {
        let d = '';
        for (let i = 0; i < 9; i++) {
          let x = cL + 1 + rng() * (cR - cL - 2), z = 4 + rng() * 30;
          const pts = [p(x, 0.001, z)];
          for (let j = 0; j < 6; j++) { x += (rng() - 0.5) * 1.2; z += 0.4 + rng() * 1.2; pts.push(p(x, 0.001, z)); }
          d += 'M' + pts.map((q) => n(q[0]) + ',' + n(q[1])).join(' L') + ' ';
        }
        s += K.path(d, 'none', { stroke: night ? '#0c0f16' : K.adj(road, -0.35), strokeWidth: 1.6, opacity: 0.7, strokeLinejoin: 'round' });
        for (const [x, z] of [[cL + 0.15, 12], [cR - 0.75, 18], [cL + 0.15, 31]]) s += poly(p.wy(0.002, x, x + 0.6, z, z + 0.9), K.adj(road, -0.45)) + poly(p.wy(0.003, x + 0.1, x + 0.5, z + 0.15, z + 0.75), K.adj(road, -0.2), { opacity: 0.6 });
        s += K.leaves(rng, { count: 30, x0: 200, x1: 700, y0: 500, y1: 560, colors: [L(P.rust), L(P.ember), L(P.mustard), S(P.rust)], size: 4 });
        s += K.leaves(rng, { count: 26, x0: 1080, x1: 1500, y0: 500, y1: 580, colors: [L(P.rust), L(P.ember), L(P.mustard), S(P.rust)], size: 4 });
      }
      // a darker wet-look band along the gutters
      s += poly(p.wy(0.002, cL, cL + 0.6, 2.2, 51), '#141822', { opacity: 0.25 }) + poly(p.wy(0.002, cR - 0.6, cR, 2.2, 51), '#141822', { opacity: 0.25 });

      /* ---------- puddles, and the wet street at night ---------- */
      // a puddle mirrors the sky at the same angle above the horizon as the puddle lies below it
      const skyAt = (y) => {
        const st = T.sky, u = Math.max(0, Math.min(1, y / 900));
        for (let i = 1; i < st.length; i++) if (u <= st[i][0]) return K.mix(st[i - 1][1], st[i][1], (u - st[i - 1][0]) / (st[i][0] - st[i - 1][0]));
        return st[st.length - 1][1];
      };
      const puddle = (cx, cz, rx, rz) => {
        const pts = [], ph = rng() * 6.28;
        for (let i = 0; i < 20; i++) { const a = (i / 20) * 6.283, k = 1 + 0.2 * Math.sin(a * 3 + ph) + (rng() - 0.5) * 0.14; pts.push(p(cx + Math.cos(a) * rx * k, 0.004, cz + Math.sin(a) * rz * k)); }
        const my = p.VY - (p.f * p.eye) / cz, col = K.mix(skyAt(my), '#000000', night ? 0.1 : 0.06);
        const far = pts.slice(11, 19);
        return poly(pts, col, { opacity: night ? 0.85 : 0.78 }) + K.path('M' + far.map((q) => n(q[0]) + ',' + n(q[1])).join(' L'), 'none', { stroke: K.mix(col, '#ffffff', 0.35), strokeWidth: 1, opacity: 0.6 });
      };
      for (const [x, z, rx, rz] of [[-3.2, 7.5, 1.4, 0.9], [2.6, 11, 1.1, 0.8], [-4.8, 17, 0.9, 1.2], [3.9, 6.2, 0.8, 0.5], [0.8, 24, 1.2, 1.6], [-1.8, 4.6, 0.7, 0.35]]) s += puddle(x, z, rx, rz);
      /* a broken streak of reflected light running toward us down the wet street */
      const wet = (x, z, y0, y1, color, w, op = 0.6) => {
        const k = p.k(z), [rx, gy] = p(x, 0, z);
        const ym = p.VY + (p.f * ((y0 + y1) / 2 + p.eye)) / z, yb = Math.min(902, gy + Math.min(230, (ym - gy) * 1.35));
        if (yb <= gy + 4) return '';
        const id = o.id(uq('wet'));
        let d = '';
        for (let i = 0; i < 16; i++) {
          const u = Math.pow(rng(), 0.8), y = gy + (yb - gy) * u, ww = w * k * (0.25 + rng() * 0.75) * (1 - u * 0.5);
          d += `M${n(rx - ww / 2 + (rng() - 0.5) * w * k * 0.4)},${n(y)} h${n(ww)} `;
        }
        return `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${n(gy)}" x2="0" y2="${n(yb)}"><stop offset="0" stop-color="${color}" stop-opacity="${op}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>` +
          `<g style="${screen}">` + rect(rx - w * k * 0.32, gy, w * k * 0.64, yb - gy, `url(#${id})`, { opacity: 0.35 }) + `<path d="${d}" stroke="url(#${id})" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>`;
      };

      /* ---------- building helpers ---------- */
      const courses = (side, z0, z1, y0, y1, step, color, op = 0.35) => {
        const fx = FX(side);
        let d = '';
        for (let y = y0; y < y1; y += step) { const a = p(fx, y, z0), b = p(fx, y, z1); d += `M${n(a[0])},${n(a[1])} L${n(b[0])},${n(b[1])} `; }
        return K.path(d, 'none', { stroke: color, strokeWidth: 1, opacity: op });
      };
      const shell = (side, z0, z1, h, c, back = 24) => {
        const fx = FX(side), bx = side < 0 ? fx - back : fx + back;
        return poly(p.wz(z0, Math.min(fx, bx), Math.max(fx, bx), 0, h), nearFace(c)) + poly(p.wx(fx, z0, z1, 0, h), face(side, c));
      };
      const cornice = (side, z0, z1, h, c, depth = 0.4, tall = 0.6) => {
        const fx = FX(side);
        return side < 0 ? box(p, fx, fx + depth, h - tall, h, z0, z1, { r: S(c), bot: K.adj(S(c), -0.25), front: L(c) })
          : box(p, fx - depth, fx, h - tall, h, z0, z1, { l: L(c), bot: K.adj(S(c), -0.2), front: L(c) });
      };
      /* window on a facade: trim, glass, sash bar, the lit jamb on its far side */
      const win = (side, za, zb, ya, yb, { lit = false, trim, jamb, curtain, shade, frame = 0.1 } = {}) => {
        const fx = FX(side), fq = FX(side, 0.01);
        let r = '';
        if (trim) r += poly(p.wx(fx, za - frame, zb + frame, ya - frame * 1.4, yb + frame), trim);
        r += poly(p.wx(fq, za, zb, ya, yb), glassFill(side, lit));
        if (lit && curtain) r += poly(p.wx(fq, za, za + (zb - za) * 0.3, ya, yb), curtain, { opacity: 0.85 }) + poly(p.wx(fq, zb - (zb - za) * 0.3, zb, ya, yb), curtain, { opacity: 0.85 });
        if (shade) r += poly(p.wx(fq, za, zb, yb - (yb - ya) * shade, yb), lit ? '#d9a860' : S('#d9ccb0'), { opacity: 0.9 });
        if (trim) r += poly(p.wx(fq, za, zb, (ya + yb) / 2 - 0.035, (ya + yb) / 2 + 0.035), trim);
        if (jamb) r += poly(p.wx(fq, zb - Math.min(0.14, (zb - za) * 0.2), zb, ya, yb), jamb);
        return r;
      };
      const litW = (pr) => on && rng() < pr;
      /* awning: canvas sloping out over the sidewalk, striped valance, lit end panel */
      const awning = (side, z0, z1, c1, c2, { y0 = 3.25, y1 = 2.45, out = 1.5, val = 0.28 } = {}) => {
        const fx = FX(side), ox = FX(side, out);
        let r = '';
        // underside (we're below it)
        r += poly([p(fx, y0, z0), p(fx, y0, z1), p(ox, y1, z1), p(ox, y1, z0)], K.adj(S(c1), -0.35));
        // valance stripes
        const N = Math.max(4, Math.round((z1 - z0) / 0.45));
        for (let i = 0; i < N; i++) {
          const za = z0 + ((z1 - z0) * i) / N, zb = z0 + ((z1 - z0) * (i + 1)) / N;
          r += poly(p.wx(ox, za, zb, y1 - val, y1), face(side, i % 2 ? c2 : c1));
        }
        // end panel facing us
        r += poly([p(fx, y0, z0), p(ox, y1, z0), p(ox, y1 - val, z0), p(fx, y1 - val, z0)], L(c1));
        r += poly([p(fx, y0, z0), p(FX(side, out * 0.5), (y0 + y1) / 2, z0), p(FX(side, out * 0.5), y1 - val, z0), p(fx, y1 - val, z0)], L(c2), { opacity: 0.9 });
        return r;
      };
      /* a sign hanging square to the street, facing us */
      const blade = (side, z, x0, x1, y0, y1, fill, o2 = {}) => {
        const a = p(FX(side, x0), y1, z), b = p(FX(side, x1), y0, z);
        const X0 = Math.min(a[0], b[0]), X1 = Math.max(a[0], b[0]);
        const arm = p(FX(side), y1 + 0.15, z), arm2 = p(FX(side, x1 + 0.1), y1 + 0.15, z);
        let r = K.line(arm[0], arm[1], arm2[0], arm2[1], L('#1d1f24'), Math.max(1.5, p.k(z) * 0.05));
        r += rect(X0, a[1], X1 - X0, b[1] - a[1], fill, { rx: o2.rx || 0 });
        return { svg: r, x: X0, y: a[1], w: X1 - X0, h: b[1] - a[1], k: p.k(z) };
      };
      /* window light spilling on the sidewalk */
      const spill = (side, z0, z1, op = 0.22) => (on ? poly([p(FX(side), 0.16, z0), p(FX(side), 0.16, z1), p(FX(side, 2.6), 0.16, z1 + 0.6), p(FX(side, 2.6), 0.16, z0 + 0.3)], P.window, { opacity: op, style: screen }) : '');

      const BL = [], BR = [];   // drawn far -> near per side

      /* ====== LEFT SIDE ====== */
      // plain clapboard block by the canal
      BL.push(() => {
        const side = -1, z0 = 41, z1 = 51, h = 9.4, c = '#d8d0bc', trim = '#efe7d6';
        let r = shell(side, z0, z1, h, c) + courses(side, z0, z1, 0.3, h, 0.24, S(K.adj(c, -0.3)), 0.4);
        for (const y of [3.9, 6.6]) for (let z = 42; z < 50.4; z += 2.1) r += win(side, z, z + 1, y, y + 1.6, { lit: litW(0.4), trim: face(side, trim), jamb: nearFace(c) });
        r += cornice(side, z0, z1, h, trim, 0.3, 0.5);
        r += poly(p.wx(FX(side, 0.02), 41.6, 50.4, 0.5, 2.7), glassFill(side, on));
        r += awning(side, 41.4, 50.6, '#6e2b29', '#e9e1cf');
        r += spill(side, 41.6, 50.4, 0.16);
        return r;
      });
      // the Derry Town House hotel (four storeys, red neon HOTEL)
      BL.push(() => {
        const side = -1, z0 = 31, z1 = 41, h = 13.6, c = '#7a3428', trim = '#d9ccb0';
        let r = shell(side, z0, z1, h, c) + courses(side, z0, z1, 0.4, h - 0.8, 0.5, S(K.adj(c, -0.35)), 0.3);
        for (const y of [4.3, 7.1, 9.9]) for (let z = 31.8; z < 40.2; z += 2.05) r += win(side, z, z + 1.05, y, y + 1.75, { lit: litW(0.45), trim: face(side, trim), jamb: nearFace(c), shade: 0.25 });
        r += cornice(side, z0, z1, h, trim, 0.55, 0.9);
        r += poly(p.wx(FX(side, 0.02), 31.4, 40.6, 0.0, 3.3), face(side, '#3a2a26'));
        r += poly(p.wx(FX(side, 0.03), 32, 36, 0.6, 2.8), glassFill(side, on)) + poly(p.wx(FX(side, 0.03), 37, 40, 0.6, 2.8), glassFill(side, on));
        r += box(p, xL, xL + 1.6, 2.9, 3.2, 36.2, 37.6, { r: S('#6e2b29'), bot: K.adj(S('#6e2b29'), -0.3), front: L('#6e2b29') });
        r += spill(side, 32, 40, 0.2);
        // vertical HOTEL sign
        const b = blade(side, 31.6, 0.25, 1.15, 5.2, 9.4, on ? '#2a1414' : L('#e9e1cf'));
        r += b.svg;
        const red = on ? '#ff6a52' : L('#b8463a');
        if (on) r += halo(b.x + b.w / 2, b.y + b.h / 2, b.h * 0.8, gNeonR, 0.9);
        r += stack(b.x + b.w / 2, b.y + b.h * 0.19, b.h * 0.185, 'HOTEL', { size: b.h / 6, fill: red, w: b.w * 0.62 });
        return r;
      });
      // Kenduskeag Savings: granite, tall arched windows, the bracket clock
      BL.push(() => {
        const side = -1, z0 = 23, z1 = 31, h = 12.4, c = '#c4bdaa', trim = '#e2dccb';
        let r = shell(side, z0, z1, h, c) + courses(side, z0, z1, 0.6, h - 1.6, 0.6, S(K.adj(c, -0.25)), 0.35);
        // pilasters
        for (const z of [23.2, 25.6, 28.4, 30.6]) r += poly(p.wx(FX(side, 0.18), z, z + 0.4, 0.6, h - 1.8), L(c)) + poly(p.wx(FX(side, 0.18), z + 0.3, z + 0.4, 0.6, h - 1.8), K.adj(S(c), -0.1));
        // tall arched windows (bronze frames)
        for (const [za, zb] of [[24.0, 25.2], [28.9, 30.1]]) {
          r += poly(p.wx(FX(side, 0.01), za, zb, 1.2, 8.2), glassFill(side, on && night ? false : false));
          const top = p(FX(side, 0.01), 8.2, (za + zb) / 2), lft = p(FX(side, 0.01), 8.2, za), rt = p(FX(side, 0.01), 8.2, zb);
          r += K.path(`M${n(lft[0])},${n(lft[1])} Q${n(top[0])},${n(top[1] - (rt[0] - lft[0]) * 1.2)} ${n(rt[0])},${n(rt[1])} Z`, glassFill(side, false));
          for (let y = 2.6; y < 8.2; y += 1.4) r += poly(p.wx(FX(side, 0.02), za, zb, y, y + 0.08), S('#5a4a32'));
          r += poly(p.wx(FX(side, 0.02), (za + zb) / 2 - 0.04, (za + zb) / 2 + 0.04, 1.2, 8.2), S('#5a4a32'));
        }
        // entrance with pediment
        r += poly(p.wx(FX(side, 0.05), 26.2, 27.8, 0.3, 4.4), face(side, trim));
        r += poly(p.wx(FX(side, 0.06), 26.45, 27.55, 0.3, 3.4), on ? '#e8c088' : S('#3a3020'));
        r += poly([p(FX(side, 0.08), 4.4, 26.0), p(FX(side, 0.08), 5.3, 27.0), p(FX(side, 0.08), 4.4, 28.0)], face(side, trim));
        r += box(p, xL, xL + 0.9, 0, 0.3, 25.9, 28.1, { r: S(trim), top: L(trim), front: L(trim) });
        // entablature with the bank's name
        r += box(p, xL, xL + 0.5, h - 1.7, h - 1.2, z0, z1, { r: S(trim), bot: K.adj(S(trim), -0.25), front: L(trim) });
        r += cornice(side, z0, z1, h, trim, 0.7, 0.55);
        r += wallText(p, FX(side, 0.02), 23.6, 30.6, h - 1.15, 0.5, 'KENDUSKEAG SAVINGS', { fill: S('#5a4a3a'), fit: 0.85 });
        // the bracket clock + hanging name board, square to the street
        const zc = 23.35, ck = p.k(zc);
        const [ax, ay] = p(FX(side), 6.9, zc), [cx, cy] = p(FX(side, 1.3), 6.6, zc);
        r += K.line(ax, ay, cx, ay, L('#1d1f24'), 3) + K.path(`M${n(ax)},${n(ay + 14)} q${n((cx - ax) * 0.5)},-4 ${n(cx - ax - 8)},-14`, 'none', { stroke: L('#1d1f24'), strokeWidth: 2 });
        const R = 0.52 * ck;
        r += K.circle(cx, cy, R + 4, L('#2a2c30')) + K.circle(cx, cy, R, on ? '#fff1d0' : L('#efe9da'));
        if (on) r += halo(cx, cy, R * 3, gHaloW, 0.8);
        for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; r += K.line(cx + Math.cos(a) * R * 0.78, cy + Math.sin(a) * R * 0.78, cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92, '#2a2a2e', i % 3 ? 1 : 2); }
        const hm = { day: [2, 10], dusk: [5, 50], night: [9, 20], festival: [6, 35] }[t] || [3, 0];
        const ah = ((hm[0] % 12) + hm[1] / 60) / 12 * 6.283 - 1.571, am = (hm[1] / 60) * 6.283 - 1.571;
        r += K.line(cx, cy, cx + Math.cos(ah) * R * 0.5, cy + Math.sin(ah) * R * 0.5, '#1d1d22', 2.4) + K.line(cx, cy, cx + Math.cos(am) * R * 0.78, cy + Math.sin(am) * R * 0.78, '#1d1d22', 1.6);
        const nb = blade(side, zc, 0.15, 2.35, 4.75, 5.85, L('#2e3a44'));
        r += nb.svg + rect(nb.x + 2, nb.y + 2, nb.w - 4, nb.h - 4, 'none', { stroke: L('#d9b25a'), strokeWidth: 1.2 });
        r += txt(nb.x + nb.w / 2, nb.y + nb.h * 0.47, 'KENDUSKEAG', { size: nb.h * 0.36, fill: L('#e9d9a6'), weight: 700, len: nb.w * 0.86 });
        r += txt(nb.x + nb.w / 2, nb.y + nb.h * 0.85, 'SAVINGS', { size: nb.h * 0.3, fill: L('#e9d9a6'), weight: 600, len: nb.w * 0.6, ls: 1 });
        return r;
      });
      // Low Tide Records: three storeys of faded teal clapboard
      BL.push(() => {
        const side = -1, z0 = 17.5, z1 = 23, h = 11.6, c = '#5b7682', trim = '#e9e1cf';
        let r = shell(side, z0, z1, h, c) + courses(side, z0, z1, 3.4, h - 0.5, 0.22, S(K.adj(c, -0.35)), 0.45);
        for (const y of [5.4, 8.4]) for (const z of [18.4, 21.0]) r += win(side, z, z + 1.1, y, y + 1.7, { lit: litW(0.5), trim: face(side, trim), jamb: nearFace(c), curtain: '#c98a8a' });
        r += cornice(side, z0, z1, h, trim, 0.35, 0.5);
        // storefront
        r += poly(p.wx(FX(side, 0.02), z0 + 0.1, z1 - 0.1, 0, 3.35), face(side, '#2d3a44'));
        r += poly(p.wx(FX(side, 0.03), 17.9, 21.4, 0.55, 2.85), glassFill(side, on));
        r += poly(p.wx(FX(side, 0.03), 21.7, 22.6, 0.1, 2.6), on ? '#f2c27a' : S('#3a4656'));
        // posters taped in the window
        const pc = [P.mustard, P.rose, '#e9e1cf', P.teal, P.ember, '#e9e1cf', P.rust];
        [[18.0, 18.7, 1.6, 2.6], [18.8, 19.5, 1.0, 1.9], [19.6, 20.2, 1.7, 2.7], [20.3, 21.1, 0.9, 1.8], [20.4, 21.2, 1.95, 2.75], [18.1, 18.6, 0.65, 1.4], [19.65, 20.15, 0.7, 1.5]].forEach(([za, zb, ya, yb], i) => {
          r += poly(p.wx(FX(side, 0.035), za, zb, ya, yb), on ? K.mix(pc[i], '#fff1cf', 0.25) : face(side, pc[i]));
          r += poly(p.wx(FX(side, 0.036), za + 0.08, zb - 0.08, yb - 0.25, yb - 0.12), on ? '#3a2a20' : S('#2a2a30'), { opacity: 0.7 });
        });
        // hand-painted board: LOW TIDE / RECORDS with a wave under it
        r += poly(p.wx(FX(side, 0.06), 17.75, 22.75, 3.45, 5.05), face(side, '#24324a'));
        r += poly(p.wx(FX(side, 0.065), 17.85, 22.65, 3.52, 4.98), 'none', { stroke: face(side, '#d9a441'), strokeWidth: 1.2 });
        r += wallText(p, FX(side, 0.07), 18.0, 22.5, 4.3, 0.55, 'LOW TIDE', { fill: L('#efc76a'), font: FONT.hand, weight: 400, fit: 0.86 });
        r += wallText(p, FX(side, 0.07), 18.6, 22.0, 3.68, 0.38, 'RECORDS', { fill: L('#ece3cf'), weight: 600, fit: 0.8 });
        r += awning(side, 17.7, 21.5, '#d9a441', '#e9e1cf', { y0: 3.4, y1: 2.85, out: 1.1, val: 0.2 });
        r += spill(side, 17.9, 21.4, 0.22);
        // the record-shaped blade sign, up high
        const zc = 17.8, rk = p.k(zc), [cx, cy] = p(FX(side, 1.0), 6.55, zc), R = 0.62 * rk;
        const [ax, ay] = p(FX(side), 6.55, zc);
        r += K.line(ax, ay, cx - R, ay, L('#1d1f24'), 3);
        r += K.circle(cx, cy, R, '#15151a') + K.circle(cx, cy, R * 0.78, 'none', { stroke: '#2e2e36', strokeWidth: 1.2 }) + K.circle(cx, cy, R * 0.6, 'none', { stroke: '#2e2e36', strokeWidth: 1.2 });
        r += K.circle(cx, cy, R * 0.38, on ? '#ffcf70' : L('#d9a441')) + K.circle(cx, cy, R * 0.05, '#15151a');
        r += K.path(`M${n(cx - R * 0.95)},${n(cy - R * 0.25)} A${n(R)},${n(R)} 0 0 1 ${n(cx - R * 0.2)},${n(cy - R * 0.96)}`, 'none', { stroke: '#ffffff', strokeWidth: 1.5, opacity: 0.25 });
        r += txt(cx, cy + R * 0.12, 'LOW TIDE', { size: R * 0.2, fill: '#24324a', weight: 700, len: R * 0.62 });
        return r;
      });
      // Dot's Diner: two storeys of brick, neon in the window, the DOT'S sign
      BL.push(() => {
        const side = -1, z0 = 9, z1 = 17.5, h = 8.6, c = '#8c3b2e', trim = '#e6dcc6', red = '#a3302a';
        let r = shell(side, z0, z1, h, c) + courses(side, z0, z1, 3.4, h - 0.6, 0.42, S(K.adj(c, -0.35)), 0.3);
        for (const zc of [10.6, 13.3, 16.0]) r += win(side, zc - 0.55, zc + 0.55, 5.1, 6.9, { lit: on && zc !== 10.6, trim: face(side, trim), jamb: nearFace(c), curtain: '#efe6d2', shade: 0.18 });
        r += cornice(side, z0, z1, h, trim, 0.45, 0.6);
        // storefront frame, teal bulkhead, the big windows, door
        r += poly(p.wx(FX(side, 0.02), z0, z1, 0, 3.4), face(side, trim));
        r += poly(p.wx(FX(side, 0.03), 9.5, 15.6, 0.15, 0.8), face(side, P.teal));
        r += poly(p.wx(FX(side, 0.03), 9.5, 15.6, 0.85, 2.95), glassFill(side, on));
        r += poly(p.wx(FX(side, 0.04), 12.5, 12.6, 0.85, 2.95), face(side, trim));
        if (on) { // the room inside: counter, a pendant, two customers
          r += poly(p.wx(FX(side, 0.04), 9.5, 15.6, 0.85, 1.35), '#9a5a3a', { opacity: 0.6 });
          for (const [zz, yy] of [[10.6, 1.6], [14.1, 1.65]]) { const q = p(FX(side, 0.04), yy, zz), kk = p.k(zz); r += K.ellipse(q[0], q[1], 0.11 * kk * 0.7, 0.13 * kk, '#4a2a20', { opacity: 0.7 }) + poly(p.wx(FX(side, 0.04), zz - 0.22, zz + 0.22, 0.85, yy - 0.12), '#4a2a20', { opacity: 0.7 }); }
        }
        r += poly(p.wx(FX(side, 0.03), 16.0, 17.1, 0.1, 2.7), on ? '#f6d59a' : S('#384252'));
        r += poly(p.wx(FX(side, 0.04), 16.15, 16.95, 1.2, 2.5), on ? '#fff0c8' : S('#56657a'));
        // red sign band, DOT'S DINER
        r += poly(p.wx(FX(side, 0.06), 9.4, 17.3, 3.45, 4.45), face(side, red));
        r += poly(p.wx(FX(side, 0.065), 9.4, 17.3, 3.47, 3.55), face(side, '#e9e1cf'));
        r += wallText(p, FX(side, 0.07), 11.2, 17.0, 3.67, 0.6, "DOT'S DINER", { fill: L('#f6ecd4'), fit: 0.78 });
        r += spill(side, 9.6, 15.6, 0.26);
        // neon in the window: OPEN and a steaming cup
        const neonR = on ? '#ff5d4d' : face(side, '#b0544a'), neonP = on ? '#ff9ab0' : face(side, '#c98a8a');
        if (on) { const q = p(FX(side, 0.05), 2.1, 14.6); r += halo(q[0], q[1], 70, gNeonR, 0.9); }
        r += wallText(p, FX(side, 0.05), 13.7, 15.4, 1.95, 0.36, 'OPEN', { fill: neonR, fit: 0.8, style: on ? 'paint-order:stroke' : '' });
        const cup = [[0, 0], [0.55, 0], [0.5, -0.45], [0.05, -0.45], [0, 0]].map(([dz, dy]) => p(FX(side, 0.05), 1.55 - dy - 0.45, 10.6 + dz));
        r += K.path(pathD(cup, false), 'none', { stroke: neonP, strokeWidth: 2.2, strokeLinejoin: 'round' });
        const st = [[0.15, 1.65], [0.22, 1.8], [0.15, 1.95]].map(([dz, y]) => p(FX(side, 0.05), y, 10.6 + dz));
        r += K.path(`M${n(st[0][0])},${n(st[0][1])} Q${n(st[1][0] + 4)},${n(st[1][1])} ${n(st[2][0])},${n(st[2][1])}`, 'none', { stroke: neonP, strokeWidth: 1.8 });
        // the projecting DOT'S / DINER sign
        const b = blade(side, 13.6, 0.3, 2.3, 4.8, 6.35, on ? '#1e2a2e' : L('#efe6d2'), { rx: 6 });
        r += b.svg + rect(b.x + 3, b.y + 3, b.w - 6, b.h - 6, 'none', { stroke: on ? '#3a6f70' : L(P.teal), strokeWidth: 3, rx: 5 });
        if (on) r += halo(b.x + b.w / 2, b.y + b.h * 0.4, b.w * 0.9, gNeonR, 0.85);
        const scriptC = on ? '#ff6b5a' : L('#b8463a');
        r += txt(b.x + b.w / 2, b.y + b.h * 0.56, "Dot's", { size: b.h * 0.5, fill: scriptC, font: FONT.hand, len: b.w * 0.7 });
        r += txt(b.x + b.w / 2, b.y + b.h * 0.86, 'DINER', { size: b.h * 0.22, fill: on ? '#7fd0cf' : L(P.teal), weight: 700, len: b.w * 0.5, ls: 2 });
        return r;
      });

      /* ====== RIGHT SIDE ====== */
      BR.push(() => { // low brick block by the canal
        const side = 1, z0 = 44, z1 = 51, h = 8, c = '#9a5038', trim = '#e2d6bc';
        let r = shell(side, z0, z1, h, c) + courses(side, z0, z1, 0.5, h, 0.45, S(c), 0.3);
        for (let z = 44.8; z < 50.4; z += 1.9) r += win(side, z, z + 1, 4.4, 6.2, { lit: litW(0.5), trim: face(side, trim), jamb: nearFace(c) });
        r += cornice(side, z0, z1, h, trim, 0.3, 0.45);
        r += poly(p.wx(FX(side, 0.02), 44.5, 50.5, 0.5, 2.8), glassFill(side, on)) + spill(side, 44.5, 50.5, 0.15);
        return r;
      });
      BR.push(() => { // three-storey brick with bay windows
        const side = 1, z0 = 35, z1 = 44, h = 12, c = '#7d3a2c', trim = '#d9ccb0';
        let r = shell(side, z0, z1, h, c) + courses(side, z0, z1, 0.5, h - 0.8, 0.5, S(K.adj(c, -0.3)), 0.3);
        for (const y of [4.4, 7.4]) for (let z = 35.8; z < 43.4; z += 2.1) r += win(side, z, z + 1.05, y, y + 1.8, { lit: litW(0.45), trim: face(side, trim), jamb: nearFace(c), shade: 0.2 });
        r += cornice(side, z0, z1, h, trim, 0.5, 0.8);
        r += poly(p.wx(FX(side, 0.02), 35.4, 43.6, 0.5, 2.8), glassFill(side, on));
        r += awning(side, 35.3, 43.7, '#2e8b8b', '#e9e1cf', { out: 1.3 });
        r += spill(side, 35.4, 43.6, 0.18);
        return r;
      });
      // the Aladdin
      BR.push(() => {
        const side = 1, z0 = 25.4, z1 = 35, h = 11, c = '#dccfb2', rose = '#c98a8a', mar = '#6e2b29';
        let r = shell(side, z0, z1, h, c);
        // stepped deco parapet in the middle
        r += poly(p.wx(FX(side), 28.6, 31.8, h, h + 1.3), face(side, c)) + poly(p.wx(FX(side), 29.4, 31.0, h + 1.3, h + 2.2), face(side, c));
        // vertical fluted piers in rose
        for (const z of [25.6, 27.0, 33.0, 34.4]) r += poly(p.wx(FX(side, 0.12), z, z + 0.45, 3.6, h + 0.2), face(side, rose)) + poly(p.wx(FX(side, 0.12), z + 0.33, z + 0.45, 3.6, h + 0.2), S(rose));
        // the auditorium rises behind the facade; its side wall faces us over the hardware store
        r += poly(p.wz(z0, xR + 0.4, xR + 24, 8.0, 12.7), nearFace('#c9b896'));
        r += poly(p.wz(z0, xR + 0.7, xR + 5.2, 10.2, 12.3), nearFace('#9a4a36'), { opacity: 0.5 });
        { const a = p(xR + 0.9, 10.55, z0), b = p(xR + 5.0, 10.55, z0), k = p.k(z0); r += txt((a[0] + b[0]) / 2, a[1], 'ALADDIN', { size: 1.4 * k, fill: nearFace('#efe2c4'), weight: 700, len: (b[0] - a[0]) * 0.9, op: 0.55 }); }
        // entrance under the marquee: doors, poster cases, ticket booth
        r += poly(p.wx(FX(side, 0.02), 26.0, 34.6, 0, 3.4), face(side, mar));
        r += poly(p.wx(FX(side, 0.03), 28.6, 31.8, 0, 2.6), on ? '#f6cf86' : S('#3a3030'));
        for (const z of [26.4, 32.8]) r += poly(p.wx(FX(side, 0.04), z, z + 1.0, 0.7, 2.5), on ? '#fbe2a8' : L('#e9e1cf')) + poly(p.wx(FX(side, 0.05), z + 0.12, z + 0.88, 0.85, 2.35), face(side, rng.pick([P.bruise, P.slate, P.rust])));
        r += spill(side, 26, 34.6, 0.35);
        // marquee: box out over the sidewalk, bulbs on every edge
        const mz0 = 26.1, mz1 = 33.6, my0 = 3.4, my1 = 5.4, mx = 4.9;
        const mFront = on ? '#fff3d6' : L('#efe6d2'), mDark = on ? '#3a2018' : S(mar);
        r += poly(p.wy(my0, mx, xR, mz0, mz1), on ? '#ffe2a6' : K.adj(S(mar), -0.2)); // soffit, glowing at night
        r += poly(p.wx(mx, mz0, mz1, my0, my1), mDark);
        r += poly(p.wx(mx - 0.01, mz0 + 0.2, mz1 - 0.2, my0 + 0.35, my1 - 0.35), mFront);
        r += poly(p.wz(mz0, mx, xR, my0, my1), on ? '#4a241a' : L(mar));
        // stepped crest
        r += poly(p.wz(mz0, mx + 0.4, xR - 0.2, my1, my1 + 0.45), on ? '#4a241a' : L(mar)) + poly(p.wz(mz0, mx + 0.9, xR - 0.6, my1 + 0.45, my1 + 0.8), on ? '#4a241a' : L(rose));
        const [ex0, ey0] = p(mx, my1, mz0), [ex1, ey1] = p(xR, my0, mz0);
        const fw = ex1 - ex0, fh2 = ey1 - ey0;
        r += rect(ex0 + fw * 0.08, ey0 + fh2 * 0.14, fw * 0.84, fh2 * 0.72, mFront);
        r += txt(ex0 + fw / 2, ey0 + fh2 * 0.42, 'NOW SHOWING', { size: fh2 * 0.22, fill: '#2a1a16', weight: 700, len: fw * 0.74 });
        r += txt(ex0 + fw / 2, ey0 + fh2 * 0.78, '7 & 9', { size: fh2 * 0.34, fill: '#8c1f1a', weight: 700, len: fw * 0.4 });
        // bulbs
        let bulbs = '';
        const bulbC = on ? '#fff4d0' : L('#e9dfc8');
        for (let i = 0; i <= 10; i++) { const x = ex0 + fw * (0.04 + 0.92 * i / 10); bulbs += K.circle(x, ey0 + fh2 * 0.06, 1.8, bulbC) + K.circle(x, ey1 - fh2 * 0.05, 1.8, bulbC); }
        for (let i = 0; i <= 14; i++) { const z = mz0 + (mz1 - mz0) * i / 14, a = p(mx, my1 - 0.12, z), b2 = p(mx, my0 + 0.12, z); bulbs += K.circle(a[0], a[1], 1.4, bulbC) + K.circle(b2[0], b2[1], 1.4, bulbC); }
        r += bulbs;
        if (on) r += halo(ex0 + fw / 2, ey0 + fh2 / 2, fw * 1.4, gHaloW, 0.9) + K.pool(o, ...p(6.2, 0.16, 29.5), 120, 14, '#ffe2a6', 0.4, 'mqpool');
        // the vertical ALADDIN sign above
        const b = blade(side, 25.9, 0.2, 1.75, 6.3, 12.9, on ? '#2a1612' : L('#efe6d2'));
        r += b.svg;
        r += poly([[b.x + b.w / 2, b.y - 12], [b.x + b.w + 2, b.y], [b.x - 2, b.y]], on ? '#2a1612' : L(rose));
        r += rect(b.x + 3, b.y + 3, b.w - 6, b.h - 6, 'none', { stroke: on ? '#ffb070' : L(mar), strokeWidth: 2 });
        if (on) r += halo(b.x + b.w / 2, b.y + b.h / 2, b.h * 0.75, gNeonR, 0.9);
        const neon = on ? '#ff7a5c' : L(mar);
        r += stack(b.x + b.w / 2, b.y + b.h * 0.13, b.h * 0.128, 'ALADDIN', { size: b.h * 0.105, fill: neon, w: b.w * 0.55 });
        return r;
      });
      // hardware store
      BR.push(() => {
        const side = 1, z0 = 17, z1 = 24, h = 8.2, c = '#8a4a34', trim = '#e2d6bc';
        let r = shell(side, z0, z1, h, c) + courses(side, z0, z1, 3.5, h - 0.6, 0.42, S(K.adj(c, -0.3)), 0.3);
        for (const z of [17.8, 20.0, 22.2]) r += win(side, z, z + 1.1, 4.9, 6.8, { lit: litW(0.4), trim: face(side, trim), jamb: nearFace(c), shade: 0.3 });
        r += cornice(side, z0, z1, h, trim, 0.4, 0.55);
        r += poly(p.wx(FX(side, 0.02), z0 + 0.1, z1 - 0.1, 0, 3.4), face(side, '#3e3a34'));
        r += poly(p.wx(FX(side, 0.03), 17.5, 22.3, 0.5, 2.85), glassFill(side, on));
        r += poly(p.wx(FX(side, 0.03), 22.6, 23.6, 0.1, 2.6), on ? '#f2c27a' : S('#3a4656'));
        // window display: paint cans and a saw
        for (let i = 0; i < 5; i++) r += poly(p.wx(FX(side, 0.04), 17.8 + i * 0.5, 18.2 + i * 0.5, 0.55, 0.95), face(side, rng.pick([P.rust, P.teal, P.mustard, '#e9e1cf'])));
        r += poly(p.wx(FX(side, 0.04), 20.5, 21.8, 1.5, 1.8), face(side, '#b9bcc0'));
        r += poly(p.wx(FX(side, 0.06), 17.2, 23.8, 3.45, 4.35), face(side, '#e9e1cf'));
        r += wallText(p, FX(side, 0.07), 23.4, 17.6, 3.6, 0.6, 'HARDWARE', { fill: face(side, '#8c2a22'), fit: 0.8 });
        r += awning(side, 17.3, 22.4, '#a8382c', '#e9e1cf', { out: 1.4 });
        r += spill(side, 17.5, 22.3, 0.22);
        // rakes and a bushel of pumpkins out front
        for (let i = 0; i < 5; i++) { const a = p(FX(side, 0.25), 0.15, 22.4 + i * 0.12), b2 = p(FX(side, 0.35), 1.8, 22.3 + i * 0.12); r += K.line(a[0], a[1], b2[0], b2[1], L('#b98a5a'), 1.6); }
        for (let i = 0; i < 4; i++) { const q = p(FX(side, 0.5 + (i % 2) * 0.4), 0.38, 17.6 + i * 0.35), kk = p.k(17.6 + i * 0.35); r += K.ellipse(q[0], q[1], 0.26 * kk, 0.2 * kk, L(P.ember)) + K.ellipse(q[0] - 0.08 * kk, q[1] - 0.04 * kk, 0.1 * kk, 0.12 * kk, L('#f0a050'), { opacity: 0.6 }); }
        return r;
      });
      // the pharmacy, nearest on the right
      BR.push(() => {
        const side = 1, z0 = 9, z1 = 17, h = 10.2, c = '#a05a40', trim = '#e9e1cf';
        let r = shell(side, z0, z1, h, c) + courses(side, z0, z1, 3.5, h - 0.7, 0.42, S(K.adj(c, -0.3)), 0.3);
        for (const y of [4.8, 7.6]) for (const z of [10.2, 12.6, 15.0]) r += win(side, z, z + 1.1, y, y + 1.7, { lit: litW(0.35), trim: face(side, trim), jamb: nearFace(c), shade: 0.15 });
        r += cornice(side, z0, z1, h, trim, 0.5, 0.7);
        r += poly(p.wx(FX(side, 0.02), z0, z1 - 0.1, 0, 3.4), face(side, '#5a2a24'));
        r += poly(p.wx(FX(side, 0.03), 9.6, 15.0, 0.55, 2.85), glassFill(side, on));
        r += poly(p.wx(FX(side, 0.03), 15.4, 16.6, 0.1, 2.6), on ? '#f2c27a' : S('#3a4656'));
        r += poly(p.wx(FX(side, 0.06), 9.3, 16.8, 3.45, 4.35), face(side, '#2a3a40'));
        r += wallText(p, FX(side, 0.07), 16.4, 12.8, 3.62, 0.56, 'PHARMACY', { fill: L('#ece3cf'), fit: 0.78 });
        r += awning(side, 9.4, 15.1, '#6e2b29', '#e9e1cf', { out: 1.5 });
        r += spill(side, 9.6, 15, 0.22);
        // DRUGS blade
        const b = blade(side, 16.7, 0.2, 1.1, 4.8, 7.6, on ? '#1c2428' : L('#efe6d2'));
        r += b.svg;
        if (on) r += halo(b.x + b.w / 2, b.y + b.h / 2, b.h * 0.7, gHaloW, 0.8);
        const dc = on ? '#ffe6a0' : L('#2a5a6a');
        r += stack(b.x + b.w / 2, b.y + b.h * 0.2, b.h * 0.17, 'DRUGS', { size: b.h * 0.14, fill: dc, w: b.w * 0.55 });
        return r;
      });

      // draw both sides, far first, interleaving so near buildings overlap far ones
      for (let i = 0; i < Math.max(BL.length, BR.length); i++) { if (BR[i]) s += BR[i](); if (BL[i]) s += BL[i](); }

      /* ---------- street furniture, far to near ---------- */
      const items = [];
      const lamp = (x, z) => items.push({ z, d: () => {
        const [bx, by] = p(x, 0.15, z), k = p.k(z);
        const iron = L('#22262a');
        let r = rect(bx - 0.13 * k, by - 0.5 * k, 0.26 * k, 0.5 * k, iron) + rect(bx - 0.06 * k, by - 3.7 * k, 0.12 * k, 3.4 * k, iron);
        r += rect(bx - 0.11 * k, by - 3.8 * k, 0.22 * k, 0.12 * k, iron);
        const gy = by - 4.05 * k, gr = 0.24 * k;
        r += K.ellipse(bx, gy, gr, gr * 1.25, on ? '#fff3d2' : L('#e9e4d8')) + rect(bx - gr * 0.55, gy - gr * 1.45, gr * 1.1, gr * 0.3, iron) + K.path(`M${n(bx - gr * 0.3)},${n(gy - gr * 1.45)} l${n(gr * 0.3)},${n(-gr * 0.5)} l${n(gr * 0.3)},${n(gr * 0.5)} Z`, iron);
        if (on) {
          r += halo(bx, gy, 2.6 * k) + halo(bx, gy, 0.8 * k, gHaloW);
          r += K.pool(o, bx, by, 3.2 * k, 3.2 * k * 1.6 / z + 4, P.sodium, night ? 0.4 : 0.28, uq('lp'));
        }
        return r;
      } });
      for (const z of [8.6, 26, 42]) lamp(-6.95, z);
      for (const z of [9.0, 36]) lamp(5.95, z);
      // parked cars (not during the festival: the street is closed)
      const car = (x0, x1, z0, len, body, kind) => items.push({ z: z0, d: () => {
        const z1 = z0 + len, glass = night ? '#121824' : L('#28303f');
        const cB = L(body), cS = S(body), cT = K.adj(L(body), 0.1);
        const left = x1 < 0, sideX = left ? x1 : x0;
        let r = poly(p.wy(0.01, x0 - 0.15, x1 + 0.15, z0 - 0.25, z1 + 0.3), '#0b0e14', { opacity: 0.45 });
        for (const zz of [z0 + 0.8, z1 - 0.85]) { const q = p(sideX, 0.33, zz), kk = p.k(zz); r += K.ellipse(q[0], q[1], Math.max(2.5, 0.33 * kk * (Math.abs(sideX) / zz) * 1.5), 0.33 * kk, '#0f1115'); }
        if (kind === 'pickup') {
          r += box(p, x0, x1, 0.34, 1.04, z0, z1, { top: cT, l: cB, r: cS, front: cB });
          r += poly(p.wy(1.041, x0 + 0.1, x1 - 0.1, z0 + 0.06, z0 + len * 0.44), K.adj(cS, -0.4));
          r += box(p, x0 + 0.04, x1 - 0.04, 1.04, 1.82, z0 + len * 0.44, z0 + len * 0.72, { top: cT, l: cB, r: cS, front: cB });
          r += poly(p.wz(z0 + len * 0.44, x0 + 0.22, x1 - 0.22, 1.16, 1.7), glass);
          r += poly(p.wz(z0 - 0.01, x0 + 0.1, x1 - 0.1, 0.92, 1.0), K.adj(cS, -0.2));
        } else {
          const zb = z0 + len * 0.24, zr = z0 + len * 0.36, zf = z0 + len * 0.64;
          r += box(p, x0, x1, 0.3, 0.9, z0, z1, { top: cT, l: cB, r: cS, front: cB });
          const sx = left ? x1 - 0.1 : x0 + 0.1;
          r += poly([p(sx, 0.9, zb), p(sx, 0.9, zf + 0.5), p(sx, 1.34, zf), p(sx, 1.34, zr)], left ? K.adj(cS, -0.1) : cB);
          r += poly([p(sx, 0.95, zb + 0.18), p(sx, 0.95, zf + 0.42), p(sx, 1.29, zf - 0.02), p(sx, 1.29, zr + 0.06)], glass);
          r += poly([p(x0 + 0.1, 0.9, zb), p(x1 - 0.1, 0.9, zb), p(x1 - 0.18, 1.35, zr), p(x0 + 0.18, 1.35, zr)], glass);
          r += poly([p(x0 + 0.1, 0.9, zb), p(x0 + 0.2, 0.9, zb), p(x0 + 0.26, 1.35, zr), p(x0 + 0.18, 1.35, zr)], cB) + poly([p(x1 - 0.2, 0.9, zb), p(x1 - 0.1, 0.9, zb), p(x1 - 0.18, 1.35, zr), p(x1 - 0.26, 1.35, zr)], cB);
          r += poly(p.wy(1.35, x0 + 0.18, x1 - 0.18, zr, zf), cT);
        }
        const tl = on ? '#ff4a3a' : L('#8a2a22');
        r += poly(p.wz(z0, x0 + 0.06, x0 + 0.42, 0.6, 0.82), tl) + poly(p.wz(z0, x1 - 0.42, x1 - 0.06, 0.6, 0.82), tl);
        if (on) { const a1 = p(x0 + 0.24, 0.71, z0), a2 = p(x1 - 0.24, 0.71, z0); r += halo(a1[0], a1[1], 14, gNeonR, 0.7) + halo(a2[0], a2[1], 14, gNeonR, 0.7); }
        r += poly(p.wz(z0 - 0.05, x0 - 0.03, x1 + 0.03, 0.3, 0.44), L('#a7abb0'));
        r += poly(p.wz(z0 - 0.06, (x0 + x1) / 2 - 0.16, (x0 + x1) / 2 + 0.16, 0.47, 0.62), L('#e9e4d0'));
        return r;
      } });
      if (!fest) { car(-6.3, -4.55, 15.2, 4.7, '#6e2b29', 'sedan'); car(3.75, 5.5, 20.5, 5.2, '#4a5a72', 'pickup'); }
      // phone booth on the right sidewalk
      items.push({ z: 14.6, d: () => {
        const x0 = 6.3, x1 = 7.25, z0 = 14.6, z1 = 15.5, alu = L('#b8bcc0');
        let r = box(p, x0, x1, 0.15, 2.35, z0, z1, { l: on ? '#d8e4e0' : L('#7f8e9a'), front: on ? '#e8f0ea' : L('#8b9aa6') });
        const fr = p.wz(z0, x0, x1, 0.15, 2.35);
        r += K.path(pathD(fr), 'none', { stroke: alu, strokeWidth: 2 });
        r += poly(p.wz(z0, x0, x1, 2.05, 2.35), on ? '#f4f6f0' : L('#d9dcd8'));
        const [tx, ty] = p((x0 + x1) / 2, 2.12, z0), kk = p.k(z0);
        r += txt(tx, ty, 'PHONE', { size: 0.2 * kk, fill: '#2a4a8a', weight: 700, len: 0.7 * kk });
        if (on) r += halo(tx, ty + 0.9 * kk, 2.2 * kk, gHaloW, 0.6);
        const ph = p(x0 + 0.5, 1.4, z0 + 0.45);
        r += rect(ph[0] - 4, ph[1] - 6, 8, 14, '#2a2c30');
        return r;
      } });
      // the DERRY NEWS box on the left curb
      items.push({ z: 11.2, d: () => {
        const x0 = -7.3, x1 = -6.75, z0 = 11.2, z1 = 11.65, blue = '#2f4f86';
        let r = box(p, x0, x1, 0.15, 1.22, z0, z1, { top: L(blue), r: S(blue), front: L(blue) });
        const [ax, ay] = p(x0, 1.18, z0), [bx2, by2] = p(x1, 0.95, z0);
        r += rect(ax + 2, ay + 1, bx2 - ax - 4, by2 - ay, L('#e9e4d0'));
        r += txt((ax + bx2) / 2, ay + (by2 - ay) * 0.48, 'DERRY', { size: (by2 - ay) * 0.46, fill: L('#2a3a6a'), weight: 700, len: (bx2 - ax) * 0.74 });
        r += txt((ax + bx2) / 2, ay + (by2 - ay) * 0.95, 'NEWS', { size: (by2 - ay) * 0.42, fill: L('#2a3a6a'), weight: 700, len: (bx2 - ax) * 0.6 });
        const [wx0, wy0] = p(x0 + 0.06, 0.88, z0), [wx1, wy1] = p(x1 - 0.06, 0.55, z0);
        r += rect(wx0, wy0, wx1 - wx0, wy1 - wy0, L('#cfd2cc')) + rect(wx0 + 3, wy0 + 4, wx1 - wx0 - 6, 2, '#333') + rect(wx0 + 3, wy0 + 9, (wx1 - wx0) * 0.6, 1.5, '#555');
        return r;
      } });
      // utility pole on the right sidewalk + wires over the street
      const pole = (x, z) => { const [bx, by] = p(x, 0.15, z), k = p.k(z); return { top: [bx, by - 9 * k], arm: [bx - 1.1 * k, bx + 1.1 * k, by - 8.6 * k], svg: rect(bx - 0.14 * k, by - 9 * k, 0.28 * k, 9 * k, L('#4a3a2e')) + rect(bx - 1.2 * k, by - 8.7 * k, 2.4 * k, 0.16 * k, L('#3e3026')) + rect(bx + 0.14 * k, by - 6.2 * k, 0.4 * k, 0.6 * k, L('#5a5a5e')) }; };
      const P1 = pole(7.25, 13.2), P2 = pole(7.25, 60);
      items.push({ z: 60, d: () => P2.svg });
      items.push({ z: 13.2, d: () => P1.svg });
      items.sort((a, b) => b.z - a.z);
      for (const it of items) s += it.d();
      const wc = night ? '#06080c' : K.mix(L(P.ink), T.haze, 0.2);
      s += K.wire(P1.arm[0], P1.arm[2], P2.arm[0], P2.arm[2], 20, wc, 1.4) + K.wire(P1.arm[1], P1.arm[2], P2.arm[1], P2.arm[2], 26, wc, 1.4);
      s += K.wire(P1.arm[0], P1.arm[2] + 8, ...p(-9.8, 7.4, 21), 60, wc, 1.5);
      s += K.wire(P1.top[0], P1.top[1], ...p(-9.8, 8.0, 33), 70, wc, 1.3);
      s += K.wire(...p(-9.8, 7.0, 42), ...p(7.6, 7.2, 47), 14, wc, 1.1);

      if (night) {
        for (const z of [8.6, 26, 42]) s += wet(-6.95, z, 3.8, 4.3, P.sodium, 0.5);
        for (const z of [9.0, 36]) s += wet(5.95, z, 3.8, 4.3, P.sodium, 0.5);
        s += wet(-8.7, 13.6, 4.8, 6.35, '#ff6b5a', 1.6, 0.55) + wet(-9.4, 31.6, 5.2, 9.4, '#ff6a52', 0.7, 0.55);
        s += wet(6.3, 26.1, 3.4, 5.4, '#ffe2a6', 2.4, 0.6) + wet(6.85, 25.9, 6.3, 12.9, '#ff7a5c', 1.2, 0.5) + wet(6.8, 14.6, 0.2, 2.3, '#e8f0ea', 0.8, 0.45);
        s += wet(-9.6, 12.5, 0.9, 2.9, '#ffd38a', 3.5, 0.3) + wet(7.4, 12.3, 0.6, 2.8, '#ffd38a', 3, 0.25) + wet(-9.6, 19.6, 0.6, 2.8, '#ffd38a', 2.5, 0.28);
        for (const z of [51.3, 58.2]) s += wet(-6.7, z, 3.0, 3.6, P.sodium, 0.4, 0.5) + wet(5.4, z, 3.0, 3.6, P.sodium, 0.4, 0.5);
      }
      // a few people out on the sidewalks
      if (!fest) {
        const who = night ? [[6.6, 27.2, '#3b4a63'], [6.95, 27.6, '#6e2b29'], [-8.6, 34, '#4a4a52']] : [[-8.4, 29.5, '#3b4a63'], [-9.0, 38, '#8a5a35'], [6.7, 33, '#6e2b29'], [6.3, 41, '#4a4a52'], [-8.2, 44.5, '#5b4a6b']];
        for (const [x, z, c] of who) s += walker(p, x, z, 1.62 + (z % 3) * 0.06, K.mix(L(c), '#1a1820', night ? 0.6 : 0.25), rng);
      }

      /* ---------- Canal Days ---------- */
      if (fest) s += festival(o, p, rng, { L, S, halo, gHaloW, xL, xR, cL, cR });

      /* ---------- leaves, wet street, atmosphere ---------- */
      s += K.leaves(rng, { count: 40, x0: 0, x1: 560, y0: 520, y1: 700, colors: [L(P.rust), L(P.ember), L(P.mustard), S(P.rust)], size: 5 });
      s += K.leaves(rng, { count: 30, x0: 1150, x1: 1600, y0: 520, y1: 700, colors: [L(P.rust), L(P.ember), L(P.mustard), S(P.rust)], size: 5 });
      s += K.leaves(rng, { count: 26, x0: 300, x1: 1400, y0: 640, y1: 900, colors: [S(P.rust), S(P.ember), S(P.mustard)], size: 8, opacity: 0.85 });
      if (night) s += K.band(o, 470, 430, '#05070c', 0, 0.3, 'dark');
      if (day) s += K.band(o, 300, 300, T.haze, 0, 0.12, 'haze');
      if (dusk) s += K.band(o, 280, 260, '#d88a68', 0, 0.12, 'haze');
      return s;
    }
  });

  /* A small standing figure seen from behind/side: no faces, just a shape. */
  function walker(p, x, z, hgt, c, rng) {
    const [px, py] = p(x, 0.15, z), k = p.k(z), hh = hgt * k, sw = 0.23 * k * (hgt / 1.7), head = 0.115 * k;
    const neck = py - hh + head * 2.1, lean = (rng() - 0.5) * sw * 0.3;
    let r = rect(px - sw * 0.62, py - hh * 0.46, sw * 0.5, hh * 0.46, K.adj(c, -0.4)) + rect(px + sw * 0.12, py - hh * 0.46, sw * 0.5, hh * 0.46, K.adj(c, -0.4));
    r += K.path(`M${n(px - sw)},${n(py - hh * 0.4)} L${n(px - sw * 0.92 + lean)},${n(neck + head * 0.7)} Q${n(px + lean)},${n(neck - head * 0.2)} ${n(px + sw * 0.92 + lean)},${n(neck + head * 0.7)} L${n(px + sw)},${n(py - hh * 0.4)} Z`, c);
    r += K.circle(px + lean, py - hh + head, head, K.adj(c, -0.5));
    return r;
  }

  /* Canal Days dressing for downtown: bulb strings, bunting, booths, banner, lanterns, crowd. */
  function festival(o, p, rng, { L, S, halo, gHaloW, xL, xR, cL, cR }) {
    let s = '';
    const cloth = ['#6e2b29', '#3b4a63', '#b9a37d', '#5b4a6b', '#8a5a35', '#2e5b6b', '#a8573e', '#4a4a52', '#d9a441', '#c98a8a'];
    const dk = (c, k = 0.45) => K.mix(L(c), '#241c26', k);
    // the crowd filling the closed street, far to near
    const ppl = [];
    for (let i = 0; i < 64; i++) ppl.push({ x: cL + 2.6 + rng() * (cR - cL - 5.0), z: 24 + rng() * 26, h: rng() < 0.15 ? 1.1 + rng() * 0.25 : 1.55 + rng() * 0.3 });
    for (let i = 0; i < 10; i++) ppl.push({ x: -8.2 - rng() * 1.2, z: 20 + rng() * 26, h: 1.5 + rng() * 0.3 });
    for (let i = 0; i < 9; i++) ppl.push({ x: 6.2 + rng() * 1.0, z: 22 + rng() * 24, h: 1.5 + rng() * 0.3 });
    ppl.sort((a, b) => b.z - a.z);
    for (const q of ppl) s += walker(p, q.x, q.z, q.h, dk(rng.pick(cloth), 0.35 + (q.z - 20) / 80), rng);
    // booths in the parking lanes: counter, striped skirt, posts, gabled striped canopy, a sign facing us
    const booth = (side, z0, z1, c1, c2, label) => {
      const xo = side < 0 ? cL + 0.15 : cR - 0.15, xi = side < 0 ? cL + 2.25 : cR - 2.25;
      const x0 = Math.min(xo, xi), x1 = Math.max(xo, xi), xm = (x0 + x1) / 2, F = side < 0 ? S : L;
      let r = poly(p.wy(0.01, x0 - 0.2, x1 + 0.2, z0 - 0.2, z1 + 0.3), '#0b0e14', { opacity: 0.35 });
      // back posts first, then counter, then front posts
      const post = (x, z) => { const a = p(x, 0, z), b = p(x, 2.35, z); return K.line(a[0], a[1], b[0], b[1], L('#3e3026'), Math.max(1.2, p.k(z) * 0.07)); };
      r += post(xo, z1) + post(xi, z1);
      r += box(p, x0, x1, 0, 0.98, z0, z1, { top: L('#e2d6bc'), l: L('#a88a62'), r: S('#a88a62'), front: L('#b89a70') });
      for (let i = 0; i < 5; i++) { const xa = x0 + ((x1 - x0) * i) / 5, xb = x0 + ((x1 - x0) * (i + 1)) / 5; r += poly(p.wz(z0 - 0.01, xa, xb, 0.12, 0.9), L(i % 2 ? c2 : '#e9e1cf')); }
      r += poly(p.wz(z0 - 0.012, x0, x1, 0.82, 0.98), L('#8a6440'));
      for (let i = 0; i < 8; i++) { const za = z0 + ((z1 - z0) * i) / 8, zb = z0 + ((z1 - z0) * (i + 1)) / 8; r += poly(p.wx(xi, za, zb, 0.12, 0.9), F(i % 2 ? c2 : '#e9e1cf')); }
      for (let i = 0; i < 5; i++) { const zz = z0 + 0.35 + (i * (z1 - z0 - 0.7)) / 4, q = p(xi + (side < 0 ? -0.25 : 0.25), 1.07, zz), kk = p.k(zz); r += K.ellipse(q[0], q[1], 0.13 * kk, 0.1 * kk, L(rng.pick([P.ember, P.mustard, P.rust, '#e9e1cf', '#7a4a2a']))); }
      r += post(xo, z0) + post(xi, z0);
      // canopy underside, then the side valance with scallops
      const ya = 2.35, yr = 3.05;
      r += poly(p.wy(ya, x0 - 0.12, x1 + 0.12, z0 - 0.12, z1 + 0.12), K.adj(S(c1), -0.4));
      const vx = side < 0 ? x1 + 0.12 : x0 - 0.12;
      for (let i = 0; i < 8; i++) {
        const za = z0 - 0.12 + ((z1 - z0 + 0.24) * i) / 8, zb = z0 - 0.12 + ((z1 - z0 + 0.24) * (i + 1)) / 8;
        r += poly(p.wx(vx, za, zb, ya - 0.24, ya), F(i % 2 ? c2 : c1));
        const q = p(vx, ya - 0.24, (za + zb) / 2), kk = p.k((za + zb) / 2);
        r += K.ellipse(q[0], q[1], Math.max(1.5, (0.13 * kk * Math.abs(vx)) / ((za + zb) / 2)), 0.08 * kk, F(i % 2 ? c2 : c1));
      }
      // gable end facing us, in vertical stripes
      const gx0 = x0 - 0.12, gx1 = x1 + 0.12, half = (gx1 - gx0) / 2;
      const ytop = (x) => ya + (yr - ya) * (1 - Math.abs(x - xm) / half);
      const N = 6;
      for (let i = 0; i < N; i++) {
        const xa = gx0 + ((gx1 - gx0) * i) / N, xb = gx0 + ((gx1 - gx0) * (i + 1)) / N;
        const pts = [p(xa, ya - 0.24, z0 - 0.12), p(xb, ya - 0.24, z0 - 0.12), p(xb, ytop(xb), z0 - 0.12)];
        if (xa < xm && xb > xm) pts.push(p(xm, yr, z0 - 0.12));
        pts.push(p(xa, ytop(xa), z0 - 0.12));
        r += poly(pts, L(i % 2 ? c2 : c1));
      }
      // sign board on top of the gable
      const [ax, ay] = p(x0 + 0.05, yr + 0.6, z0 - 0.14), [bx, by] = p(x1 - 0.05, yr + 0.08, z0 - 0.14);
      r += rect(ax, ay, bx - ax, by - ay, L('#efe6d2')) + rect(ax + 1.5, ay + 1.5, bx - ax - 3, by - ay - 3, 'none', { stroke: L(c1), strokeWidth: 1.4 });
      r += txt((ax + bx) / 2, ay + (by - ay) * 0.76, label, { size: (by - ay) * 0.66, fill: L(side < 0 ? '#6e2b29' : '#2a3a5a'), weight: 700, len: (bx - ax) * Math.min(0.88, 0.14 * label.length) });
      // bulbs along the valance + the warm glow under the canopy
      for (let i = 0; i <= 6; i++) { const q = p(vx, ya - 0.26, z0 + ((z1 - z0) * i) / 6); r += K.circle(q[0], q[1], Math.max(1.2, p.k(z0) * 0.05), '#fff1c8'); }
      const c = p(xm, 1.5, z0 + 0.6);
      r += halo(c[0], c[1], p.k(z0) * 2.4, gHaloW, 0.75);
      return r;
    };
    const booths = [[-1, 13.2, 15.8, '#7a2430', '#d9a441', 'WHOOPIE PIES'], [-1, 19.0, 21.4, '#2e8b8b', '#e9e1cf', 'CIDER'], [-1, 26.0, 28.2, '#7a2430', '#e9e1cf', 'RAFFLE'], [-1, 33, 35, '#d9a441', '#7a2430', 'FUDGE'],
      [1, 15.4, 18.0, '#d9a441', '#7a2430', 'FRIED DOUGH'], [1, 22.4, 24.8, '#b5532e', '#e9e1cf', 'CORN'], [1, 30.6, 32.8, '#7a2430', '#d9a441', 'PIES']];
    booths.sort((a, b) => b[1] - a[1]);
    for (const b of booths) s += booth(...b);
    // a few people at the counters
    for (const [x, z] of [[-3.7, 14.6], [-3.9, 20.0], [-4.05, 20.7], [3.3, 16.6], [3.1, 23.4], [-3.6, 27.0], [3.4, 17.3]]) s += walker(p, x, z, 1.5 + rng() * 0.32, dk(rng.pick(cloth), 0.42), rng);
    // swag bunting under the second-floor windows, maroon and gold
    const swags = (side, z0, z1, y) => {
      const fx = side < 0 ? xL + 0.08 : xR - 0.08, F = side < 0 ? S : L;
      let r = '';
      const cnt = Math.max(1, Math.round((z1 - z0) / 2.3));
      for (let i = 0; i < cnt; i++) {
        const za = z0 + ((z1 - z0) * i) / cnt, zb = z0 + ((z1 - z0) * (i + 1)) / cnt;
        const band = (d0, d1, c) => {
          const top = [], bot = [];
          for (let j = 0; j <= 10; j++) { const u = j / 10, z = za + (zb - za) * u, sag = Math.sin(u * Math.PI); top.push(p(fx, y - d0 * sag, z)); bot.push(p(fx, y - d1 * sag - 0.03, z)); }
          return poly(top.concat(bot.reverse()), F(c));
        };
        r += band(0, 0.2, '#7a2430') + band(0.2, 0.38, '#e2b24e') + band(0.38, 0.56, '#7a2430');
      }
      for (let i = 0; i <= cnt; i++) { const z = z0 + ((z1 - z0) * i) / cnt, q = p(fx, y, z), k = p.k(z); r += K.circle(q[0], q[1], 0.13 * k, F('#e2b24e')); }
      return r;
    };
    s += swags(-1, 9.4, 17.2, 4.85) + swags(-1, 17.7, 22.8, 5.2) + swags(-1, 31.4, 40.6, 4.1) + swags(-1, 41.4, 50.6, 3.75);
    s += swags(1, 9.4, 16.8, 4.6) + swags(1, 17.2, 23.8, 4.6) + swags(1, 35.4, 43.6, 4.15);
    // zig-zag bulb strings across the street, with paper lanterns
    const strings = [[-9.8, 11.5, 7.6, 17], [7.6, 17, -9.8, 23], [-9.8, 23, 7.6, 29.5], [7.6, 29.5, -9.8, 36], [-9.8, 36, 7.6, 43], [7.6, 43, -9.8, 50]];
    let bulbs = '', halos = '', wire = '';
    const lanternAt = [];
    strings.forEach(([xa, za, xb, zb], si) => {
      const N = 32, pts = [];
      for (let i = 0; i <= N; i++) { const u = i / N, x = xa + (xb - xa) * u, z = za + (zb - za) * u, y = 6.5 - Math.sin(u * Math.PI) * 1.15; pts.push([p(x, y, z), z]); }
      wire += 'M' + pts.map((q) => n(q[0][0]) + ',' + n(q[0][1])).join(' L') + ' ';
      pts.forEach(([q, z], i) => { if (i % 2) return; const k = p.k(z); bulbs += K.circle(q[0], q[1] + 0.07 * k, Math.max(1.2, 0.075 * k), i % 4 ? '#fff0c4' : '#ffcf80'); if (i % 4 === 0) halos += halo(q[0], q[1], 0.75 * k, gHaloW, 0.75); });
      if (si < 4) lanternAt.push(pts[11], pts[21]);
    });
    s += K.path(wire, 'none', { stroke: '#1a1416', strokeWidth: 1, opacity: 0.8 }) + halos + bulbs;
    for (const [q, z] of lanternAt) {
      const k = p.k(z), r = 0.34 * k, y = q[1] + 0.55 * k;
      const c = rng.pick(['#f4c27a', '#f0a070', '#efe0c0', '#e88a6a']);
      s += K.line(q[0], q[1], q[0], y - r * 1.1, '#1a1416', 1) + halo(q[0], y, r * 4.2, gHaloW, 0.8);
      s += K.ellipse(q[0], y, r, r * 1.12, c) + K.ellipse(q[0] - r * 0.25, y - r * 0.2, r * 0.42, r * 0.66, '#fff6dc', { opacity: 0.55 });
      s += rect(q[0] - r * 0.5, y - r * 1.22, r, r * 0.18, '#3a2a22') + rect(q[0] - r * 0.5, y + r * 1.05, r, r * 0.18, '#3a2a22');
      s += K.path(`M${n(q[0] - r)},${n(y - r * 0.35)} Q${n(q[0])},${n(y - r * 0.15)} ${n(q[0] + r)},${n(y - r * 0.35)} M${n(q[0] - r)},${n(y + r * 0.35)} Q${n(q[0])},${n(y + r * 0.55)} ${n(q[0] + r)},${n(y + r * 0.35)}`, 'none', { stroke: '#a0603a', strokeWidth: 0.8, opacity: 0.5 });
    }
    // the banner across the street
    {
      const z = 25.2, y0 = 6.9, y1 = 8.0;
      const [ax, ay] = p(xL + 0.3, y1, z), [bx, by] = p(xR - 0.3, y0, z);
      const [lx, ly] = p(xL, y1 + 0.3, z), [rx2, ry2] = p(xR, y1 + 0.3, z);
      s += K.line(lx, ly, ax, ay, '#1a1416', 1.4) + K.line(rx2, ry2, bx, ay, '#1a1416', 1.4);
      const bw = bx - ax, bh = by - ay;
      s += K.path(`M${n(ax)},${n(ay)} Q${n(ax + bw / 2)},${n(ay + 10)} ${n(bx)},${n(ay)} L${n(bx)},${n(by)} Q${n(ax + bw / 2)},${n(by + 10)} ${n(ax)},${n(by)} Z`, L('#7a2430'));
      s += K.path(`M${n(ax)},${n(ay + 4)} Q${n(ax + bw / 2)},${n(ay + 14)} ${n(bx)},${n(ay + 4)}`, 'none', { stroke: L('#e2b24e'), strokeWidth: 2.2 });
      s += K.path(`M${n(ax)},${n(by - 4)} Q${n(ax + bw / 2)},${n(by + 6)} ${n(bx)},${n(by - 4)}`, 'none', { stroke: L('#e2b24e'), strokeWidth: 2.2 });
      s += txt(ax + bw / 2, ay + bh * 0.78 + 7, 'CANAL DAYS 1991', { size: bh * 0.7, fill: L('#f2d488'), weight: 700, len: bw * 0.62, ls: 2 });
      for (let i = 0; i < 14; i++) { const u = (i + 0.5) / 14, x = ax + bw * u, yy = ay - 6 + Math.sin(u * Math.PI) * 6; s += poly([[x - 6, yy], [x + 6, yy], [x, yy + 12]], L(i % 2 ? '#e2b24e' : '#7a2430')); }
    }
    s += K.band(o, 250, 420, '#f0a060', 0, 0.12, 'festhaze');
    return s;
  }
  /* ================================================================== */
  /* 3. The Aladdin at night, from across Center Street.                  */
  ART.bg('theater', {
    times: ['night'],
    draw(o) {
      const t = 'night', rng = o.rng;
      const L = (c) => K.tone(c, t), S = (c) => K.shade(c, t), T = K.TOD[t];
      const D = 24, p = cam(800, 480, 1000, 1.6);
      const gHalo = o.id('halo'), gWarm = o.id('warm'), gRed = o.id('red'), gRose = o.id('rose');
      let s = '<defs>' + haloDef(gHalo, P.sodium, 0.6) + haloDef(gWarm, '#ffe1a0', 0.6) + haloDef(gRed, '#ff5a46', 0.55) + haloDef(gRose, '#ff9fb0', 0.5) + '</defs>';
      const halo = (x, y, r, id = gWarm, op = 1, ry) => `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r)}" ry="${n(ry || r)}" fill="url(#${id})" opacity="${op}" style="${screen}"/>`;
      const F = (x0, x1, y0, y1, z = D) => p.wz(z, x0, x1, y0, y1);
      const Rq = (x0, x1, y0, y1, z = D) => { const a = p(x0, y1, z), b = p(x1, y0, z); return [a[0], a[1], b[0] - a[0], b[1] - a[1]]; };

      /* sky */
      s += K.sky(o, t) + K.stars(rng, { count: 70, y1: 260 });
      s += K.clouds(rng, { count: 4, y0: 40, y1: 200, color: '#26314c', shadow: '#141a2a', opacity: 0.75, w: 640 });

      /* neighbours: the hardware store across the alley on the left, three storeys of brick on the right */
      const brickL = '#8a4a34', brickR = '#7d3a2c';
      s += poly(F(-24, -10.4, 0, 8.2), L(brickL));
      { let d = ''; for (let y = 3.6; y < 7.7; y += 0.45) { const a = p(-24, y, D), b = p(-10.4, y, D); d += `M${n(a[0])},${n(a[1])} H${n(b[0])} `; } s += K.path(d, 'none', { stroke: S(brickL), strokeWidth: 1, opacity: 0.4 }); }
      s += poly(F(-24, -10.4, 7.6, 8.2), L('#d9ccb0'));
      for (const x of [-21.6, -18.4, -15.2, -12.4]) { const lit = x === -15.2; s += poly(F(x, x + 1.1, 4.9, 6.8), lit ? '#f7cf86' : L('#2a3348')); s += poly(F(x - 0.08, x + 1.18, 4.78, 4.9), L('#d9ccb0')); if (lit) s += poly(F(x, x + 1.1, 6.2, 6.8), '#d9a860'); }
      s += poly(F(-24, -10.6, 3.45, 4.35), L('#e9e1cf'));
      { const a = p(-18.6, 3.62, D), b = p(-12.5, 3.62, D); s += txt((a[0] + b[0]) / 2, a[1], 'HARDWARE', { size: 0.62 * p.k(D) / 0.72, fill: L('#8c2a22'), weight: 700, len: b[0] - a[0] }); }
      s += poly(F(-24, -10.6, 0, 3.4), L('#3e3a34')) + poly(F(-23, -11.2, 0.5, 2.85), L('#2a3242'));
      for (let i = 0; i < 12; i++) { const x0 = -24 + i * 1.12; s += poly([p(x0, 3.3, D), p(x0 + 1.12, 3.3, D), p(x0 + 1.12, 2.55, D - 1.4), p(x0, 2.55, D - 1.4)], L(i % 2 ? '#e9e1cf' : '#a8382c')); }
      s += poly(F(-24, -10.6, 2.32, 2.55, D - 1.4), L('#a8382c'));
      // the alley: a dark slot with a fire-escape ladder glinting
      s += poly(F(-10.4, -9.0, 0, 12.5), '#090c14') + poly(F(-10.4, -9.0, 0, 1.2), '#0d111a');
      s += K.line(...p(-9.9, 2.6, D + 2), ...p(-9.9, 7, D + 2), '#2a3040', 1.5) + K.line(...p(-9.5, 2.6, D + 2), ...p(-9.5, 7, D + 2), '#2a3040', 1.5);
      // right block
      s += poly(F(9.0, 26, 0, 12.4), L(brickR));
      { let d = ''; for (let y = 0.5; y < 11.8; y += 0.5) { const a = p(9, y, D), b = p(26, y, D); d += `M${n(a[0])},${n(a[1])} H${n(b[0])} `; } s += K.path(d, 'none', { stroke: S(brickR), strokeWidth: 1, opacity: 0.35 }); }
      s += poly(F(9.0, 26, 11.6, 12.4), L('#d9ccb0'));
      for (const y of [4.6, 7.8]) for (const x of [10.6, 13.2, 15.8, 18.4]) {
        const lit = (x === 13.2 && y === 7.8) || (x === 18.4 && y === 4.6);
        s += poly(F(x - 0.1, x + 1.2, y - 0.14, y + 1.9), L('#d9ccb0')) + poly(F(x, x + 1.1, y, y + 1.8), lit ? '#f7cf86' : L('#283146'));
        if (lit) s += poly(F(x, x + 0.3, y, y + 1.8), '#c98a8a', { opacity: 0.8 }) + poly(F(x + 0.8, x + 1.1, y, y + 1.8), '#c98a8a', { opacity: 0.8 });
      }
      s += poly(F(9.2, 26, 0, 3.4), L('#3a2a26')) + poly(F(10, 20, 0.5, 2.8), L('#2a3242'));
      for (let i = 0; i < 12; i++) { const x0 = 9.4 + i * 1.1; s += poly([p(x0, 3.3, D), p(x0 + 1.1, 3.3, D), p(x0 + 1.1, 2.6, D - 1.3), p(x0, 2.6, D - 1.3)], L(i % 2 ? '#e9e1cf' : '#2e8b8b')); }

      /* ---------------- the Aladdin ---------------- */
      const cream = '#dccfb2', rose = '#c98a8a', mar = '#6e2b29';
      // central tower behind the sign
      s += poly(F(-2.6, 2.6, 11.4, 14.2), L(cream)) + poly(F(-1.8, 1.8, 14.2, 15.4), L(cream));
      s += poly(F(-9.0, 9.0, 0, 12.0), L(cream));
      // stepped parapet edges
      s += poly(F(-9.0, -6.2, 11.6, 12.4), L(cream)) + poly(F(6.2, 9.0, 11.6, 12.4), L(cream));
      s += poly(F(-9.0, 9.0, 11.55, 11.75), L(rose));
      // the marquee lights the wall above it; the neon throws red on the tower
      s += halo(800, p(0, 6.3, D)[1], 520, gWarm, 0.55, 210);
      // fluted piers in rose with a lit edge
      for (const x of [-8.7, -3.6, 3.0, 8.1]) {
        s += poly(F(x, x + 0.6, 0, 12.0, D - 0.2), L(rose)) + poly(F(x + 0.42, x + 0.6, 0, 12.0, D - 0.2), S(rose));
        for (let i = 1; i < 3; i++) s += poly(F(x + i * 0.17, x + i * 0.17 + 0.04, 6.2, 11.4, D - 0.2), S(rose), { opacity: 0.8 });
        s += poly(F(x + 0.06, x + 0.14, 6.2, 11.4, D - 0.21), '#ffb0a0', { opacity: 0.7 });
      }
      // deco relief: chevron frieze along the parapet, sunburst panels at the tops of the bays
      { let d = ''; for (let x = -8.4; x < 8.4; x += 0.6) { const a = p(x, 11.15, D), m = p(x + 0.3, 11.42, D), b = p(x + 0.6, 11.15, D); d += `M${n(a[0])},${n(a[1])} L${n(m[0])},${n(m[1])} L${n(b[0])},${n(b[1])} `; } s += K.path(d, 'none', { stroke: L(mar), strokeWidth: 2, opacity: 0.8 }); }
      for (const xc of [-2.95, 2.95]) {
        const c0 = p(xc, 8.6, D);
        let d = '';
        for (let i = 0; i <= 8; i++) { const a = Math.PI * (i / 8), q = p(xc + Math.cos(a) * 0.55, 8.6 + Math.sin(a) * 0.9, D); d += `M${n(c0[0])},${n(c0[1])} L${n(q[0])},${n(q[1])} `; }
        s += K.path(d, 'none', { stroke: L(rose), strokeWidth: 1.6, opacity: 0.8 }) + K.circle(c0[0], c0[1], 4, L(rose));
      }
      // tall glass-block windows between the piers, faintly lit
      for (const [x0, x1] of [[-7.4, -5.0], [4.4, 6.8]]) {
        s += poly(F(x0, x1, 6.6, 10.9), L('#2c3346'));
        s += poly(F(x0 + 0.15, x1 - 0.15, 6.75, 10.75), '#c98a6a', { opacity: 0.35 });
        let d = '';
        for (let y = 6.75; y < 10.75; y += 0.38) { const a = p(x0 + 0.15, y, D), b = p(x1 - 0.15, y, D); d += `M${n(a[0])},${n(a[1])} H${n(b[0])} `; }
        for (let x = x0 + 0.15; x < x1 - 0.1; x += 0.38) { const a = p(x, 6.75, D), b = p(x, 10.75, D); d += `M${n(a[0])},${n(a[1])} V${n(b[1])} `; }
        s += K.path(d, 'none', { stroke: L('#2c3346'), strokeWidth: 1.2, opacity: 0.8 });
        // deco chevrons above
        for (let i = 0; i < 3; i++) { const yy = 11.0 + i * 0.12, a = p(x0, yy, D), m = p((x0 + x1) / 2, yy + 0.3, D), b = p(x1, yy, D); s += K.path(`M${n(a[0])},${n(a[1])} L${n(m[0])},${n(m[1])} L${n(b[0])},${n(b[1])}`, 'none', { stroke: L(mar), strokeWidth: 2 }); }
      }

      /* the vertical sign: a V-section blade so both faces read from the street */
      {
        const y0 = 5.7, y1 = 11.75, ax = 0, az = D - 1.5, bw = 0.8;
        const Lf = [p(-bw, y1, D - 0.1), p(ax, y1, az), p(ax, y0, az), p(-bw, y0, D - 0.1)];
        const Rf = [p(ax, y1, az), p(bw, y1, D - 0.1), p(bw, y0, D - 0.1), p(ax, y0, az)];
        s += halo(p(0, (y0 + y1) / 2, az)[0], p(0, (y0 + y1) / 2, az)[1], 150, gRed, 0.95, 230);
        s += poly(Lf, '#3a1612') + poly(Rf, '#2a0f0d');
        // finial
        const tp = p(ax, y1, az), tl = p(-bw, y1, D - 0.1), tr = p(bw, y1, D - 0.1);
        s += poly([tl, [tp[0], tp[1] - 22], tr, tp], L(rose)) + poly([[tp[0], tp[1] - 22], tr, tp], S(rose));
        s += K.circle(tp[0], tp[1] - 25, 4.5, '#fff2d0') + halo(tp[0], tp[1] - 25, 24, gWarm, 0.9);
        // neon border tubes
        s += K.path(pathD([p(-bw * 0.86, y1 - 0.12, D - 0.25), p(ax, y1 - 0.12, az + 0.1), p(ax, y0 + 0.12, az + 0.1), p(-bw * 0.86, y0 + 0.12, D - 0.25)]), 'none', { stroke: '#ffb26a', strokeWidth: 2 });
        s += K.path(pathD([p(ax, y1 - 0.12, az + 0.1), p(bw * 0.86, y1 - 0.12, D - 0.25), p(bw * 0.86, y0 + 0.12, D - 0.25), p(ax, y0 + 0.12, az + 0.1)]), 'none', { stroke: '#e0904e', strokeWidth: 2 });
        // ALADDIN down both faces, one glyph at a time on each slanted face
        const word = 'ALADDIN', yLow = 6.3, step = (y1 - 0.3 - yLow) / word.length;
        let gl = '';
        for (let i = 0; i < word.length; i++) {
          const yb = y1 - 0.3 - step * (i + 0.84), ch = word[i];
          for (const [xa, za, xb, zb, col] of [[-bw * 0.9, D - 0.2, ax, az + 0.05, '#ff7a5c'], [ax, az + 0.05, bw * 0.9, D - 0.2, '#f06a50']]) {
            const A = p(xa, yb, za), B = p(xb, yb, zb), M = p((xa + xb) / 2, yb, (za + zb) / 2), Mt = p((xa + xb) / 2, yb + step * 0.72, (za + zb) / 2);
            const hp = M[1] - Mt[1], slope = (B[1] - A[1]) / (B[0] - A[0]);
            gl += `<text x="0" y="0" transform="matrix(1,${slope.toFixed(4)},0,1,${n(M[0])},${n(M[1])})" font-size="${n(hp / 0.72)}" textLength="${n(Math.abs(B[0] - A[0]) * 0.66 * (NARROW[ch] || 1))}" lengthAdjust="spacingAndGlyphs" text-anchor="middle" fill="${col}">${ch}</text>`;
          }
        }
        s += `<g font-family="${FONT.sign}" font-weight="700">${gl}</g>`;
        s += `<g font-family="${FONT.sign}" font-weight="700" opacity="0.35" style="${screen}">${gl.replace(/fill="#[0-9a-f]+"/g, 'fill="#ffd0b0"')}</g>`;
      }

      /* the marquee: a deep box out over the sidewalk, bulbs on every edge */
      const mx0 = -6.9, mx1 = 6.9, my0 = 3.3, my1 = 5.2, mzF = D - 3.1;
      {
        // soffit: a glowing grid of bulbs (we look up into it)
        s += poly(p.wy(my0, mx0, mx1, mzF, D), '#ffe7b0');
        let b = '';
        for (let j = 0; j < 4; j++) for (let i = 0; i <= 26; i++) { const q = p(mx0 + 0.3 + (i * (mx1 - mx0 - 0.6)) / 26, my0, mzF + 0.4 + j * 0.75); b += K.circle(q[0], q[1], 1.3, '#fffaf0'); }
        s += b;
        // ends, front face, crest
        s += poly([p(mx0, my1, mzF), p(mx0, my1, D), p(mx0, my0, D), p(mx0, my0, mzF)], '#3a1a14') + poly([p(mx1, my1, mzF), p(mx1, my1, D), p(mx1, my0, D), p(mx1, my0, mzF)], '#2c120e');
        const [fx, fy, fw, fh] = Rq(mx0, mx1, my0, my1, mzF);
        s += halo(fx + fw / 2, fy + fh / 2, fw * 0.75, gWarm, 1, fh * 2.2);
        s += rect(fx - 6, fy, fw + 12, fh, '#4a1e16', { rx: fh * 0.42 });
        s += rect(fx - 1, fy + 5, fw + 2, fh - 10, '#6e2b29', { rx: fh * 0.36 });
        // crest: stepped deco plate with a sunburst
        const [cx0, cy0, cw, ch] = Rq(-3.2, 3.2, my1, my1 + 0.5, mzF);
        s += rect(cx0, cy0, cw, ch + 2, '#4a1e16') + rect(cx0 + cw * 0.22, cy0 - ch * 0.35, cw * 0.56, ch * 0.4, '#4a1e16');
        for (let i = 0; i < 9; i++) { const a = Math.PI * (0.1 + 0.8 * (i / 8)); s += K.line(fx + fw / 2, cy0 + ch, fx + fw / 2 - Math.cos(a) * cw * 0.3, cy0 + ch - Math.sin(a) * ch * 1.2, '#ffb26a', 1.6, { opacity: 0.9 }); }
        // letter board
        const bx = fx + fw * 0.07, by = fy + fh * 0.17, bw2 = fw * 0.86, bh = fh * 0.66;
        s += rect(bx, by, bw2, bh, '#fff6e0') + rect(bx, by, bw2, bh, 'none', { stroke: '#f2c27a', strokeWidth: 2 });
        s += txt(fx + fw / 2, by + bh * 0.43, 'NOW SHOWING', { size: bh * 0.34, fill: '#2a1a16', weight: 700, len: bw2 * 0.62, ls: 3 });
        s += txt(fx + fw / 2, by + bh * 0.9, '7  &  9', { size: bh * 0.42, fill: '#9a1f18', weight: 700, len: bw2 * 0.3 });
        s += K.circle(fx + fw * 0.2, by + bh * 0.31, 3, '#9a1f18') + K.circle(fx + fw * 0.8, by + bh * 0.31, 3, '#9a1f18');
        // bulb rows top and bottom + chasing round the rounded ends
        let bulbs = '', hal = '';
        for (let i = 0; i <= 34; i++) { const x = fx + fw * (0.04 + (0.92 * i) / 34); bulbs += K.circle(x, fy + 4, 2.4, '#fffbea') + K.circle(x, fy + fh - 4, 2.4, '#fffbea'); if (i % 3 === 0) hal += halo(x, fy + 4, 12, gWarm, 0.7) + halo(x, fy + fh - 4, 12, gWarm, 0.7); }
        for (let i = 0; i < 9; i++) { const a = Math.PI * (0.5 + i / 8); for (const [cx, sg] of [[fx + fh * 0.36, 1], [fx + fw - fh * 0.36, -1]]) bulbs += K.circle(cx + sg * Math.cos(a) * fh * 0.42, fy + fh / 2 + Math.sin(a) * fh * 0.42, 2.2, '#fff1c4'); }
        for (let i = 0; i <= 14; i++) { const x = cx0 + cw * (0.03 + (0.94 * i) / 14); bulbs += K.circle(x, cy0 + 3, 2, '#fff1c4'); }
        s += hal + bulbs;
      }

      /* entrance under the marquee: lobby doors, ticket booth, poster cases */
      {
        s += poly(F(-6.6, 6.6, 0, 3.5), L(mar));
        s += poly(F(-6.2, 6.2, 0, 3.2), '#3a1c16');
        // lobby glow through the doors
        for (const [x0, x1] of [[-5.8, -1.6], [1.6, 5.8]]) {
          s += poly(F(x0, x1, 0, 2.7), '#f7c983');
          s += poly(F(x0, x1, 0, 0.6), '#a83a2a', { opacity: 0.8 });
          for (let i = 0; i <= 2; i++) { const x = x0 + ((x1 - x0) * i) / 2; s += poly(F(x - 0.06, x + 0.06, 0, 2.7), '#b98a4a'); }
          for (let i = 0; i < 2; i++) { const x = x0 + ((x1 - x0) * (i + 0.5)) / 2; s += poly(F(x - 0.5, x + 0.5, 1.05, 1.12), '#e2b45a'); }
          s += poly(F(x0, x1, 2.7, 3.2), '#ffe7b0', { opacity: 0.85 });
        }
        // candy counter + popcorn machine glimpsed inside
        s += poly(F(2.4, 4.6, 0.6, 1.3, D + 3), '#c84a3a', { opacity: 0.7 }) + poly(F(-4.8, -3.6, 0.6, 1.9, D + 3), '#f6e2a0', { opacity: 0.8 });
        // poster cases on the piers either side
        const posters = [[-8.55, -7.05, '#2c3a5a', 'moon'], [7.05, 8.55, '#7a2430', 'car']];
        for (const [x0, x1, c, kind] of posters) {
          s += poly(F(x0 - 0.12, x1 + 0.12, 0.8, 3.2, D - 0.25), '#c9a35a');
          s += poly(F(x0, x1, 0.92, 3.08, D - 0.26), '#fff4dc');
          s += poly(F(x0 + 0.1, x1 - 0.1, 1.02, 2.98, D - 0.27), c);
          const [ax, ay, aw, ah] = Rq(x0 + 0.1, x1 - 0.1, 1.02, 2.98, D - 0.27);
          if (kind === 'moon') {
            s += K.circle(ax + aw * 0.6, ay + ah * 0.3, aw * 0.18, '#f2e6c4') + K.path(`M${n(ax)},${n(ay + ah * 0.75)} l${n(aw * 0.15)},${n(-ah * 0.25)} l${n(aw * 0.1)},${n(ah * 0.12)} l${n(aw * 0.2)},${n(-ah * 0.3)} l${n(aw * 0.18)},${n(ah * 0.28)} l${n(aw * 0.15)},${n(-ah * 0.18)} l${n(aw * 0.22)},${n(ah * 0.33)} V${n(ay + ah)} H${n(ax)} Z`, '#151c2c');
          } else {
            s += K.path(`M${n(ax + aw * 0.1)},${n(ay + ah * 0.66)} q${n(aw * 0.1)},${n(-ah * 0.1)} ${n(aw * 0.3)},${n(-ah * 0.1)} l${n(aw * 0.12)},${n(-ah * 0.06)} h${n(aw * 0.2)} l${n(aw * 0.12)},${n(ah * 0.07)} q${n(aw * 0.06)},0 ${n(aw * 0.06)},${n(ah * 0.06)} v${n(ah * 0.05)} H${n(ax + aw * 0.1)} Z`, '#1a1012');
            s += K.circle(ax + aw * 0.68, ay + ah * 0.22, aw * 0.12, '#f2b45a');
          }
          s += txt(ax + aw / 2, ay + ah * 0.93, 'COMING SOON', { size: ah * 0.06, fill: '#f2e6c4', weight: 600, len: aw * 0.8 });
        }
        // the ticket booth: chrome, curved glass, a cashier in the lamplight
        const bz = D - 1.2;
        const [bx, by0, bw, bh] = Rq(-0.95, 0.95, 0, 2.55, bz);
        s += rect(bx - 2, by0 + bh * 0.62, bw + 4, bh * 0.38, '#7a2a24') + rect(bx - 2, by0 + bh * 0.62, bw + 4, 3, '#d9c08a');
        for (let i = 1; i < 4; i++) s += rect(bx - 2, by0 + bh * (0.62 + i * 0.09), bw + 4, 1.6, '#b98a4a');
        s += rect(bx, by0 + bh * 0.16, bw, bh * 0.46, '#ffe9b8', { rx: 6 });
        s += K.circle(bx + bw * 0.52, by0 + bh * 0.36, bh * 0.07, '#5a3020') + K.path(`M${n(bx + bw * 0.34)},${n(by0 + bh * 0.62)} q${n(bw * 0.18)},${n(-bh * 0.22)} ${n(bw * 0.36)},0 Z`, '#5a3020');
        s += K.circle(bx + bw * 0.52, by0 + bh * 0.3, bh * 0.085, '#8a2e22', { opacity: 0.9 });
        s += rect(bx + bw * 0.08, by0 + bh * 0.16, bw * 0.84, bh * 0.46, 'none', { stroke: '#d9c08a', strokeWidth: 2.5, rx: 6 });
        s += K.path(`M${n(bx - 4)},${n(by0 + bh * 0.16)} Q${n(bx + bw / 2)},${n(by0 - bh * 0.14)} ${n(bx + bw + 4)},${n(by0 + bh * 0.16)} Z`, '#7a2a24');
        s += txt(bx + bw / 2, by0 + bh * 0.12, 'TICKETS', { size: bh * 0.085, fill: '#ffe7b0', weight: 700, len: bw * 0.62 });
        s += rect(bx + bw * 0.62, by0 + bh * 0.42, bw * 0.26, bh * 0.15, '#fffaf0') + txt(bx + bw * 0.75, by0 + bh * 0.52, '$3.50', { size: bh * 0.06, fill: '#2a1a16', font: FONT.type, len: bw * 0.22 });
        s += halo(bx + bw / 2, by0 + bh * 0.4, bw * 1.3, gWarm, 0.6);
      }

      /* sidewalk: wet terrazzo with a sunburst inlay, then the curb and the street */
      const walkZ0 = 18.2;
      s += poly(p.wy(0.15, -26, 26, walkZ0, D), L('#8a8478'));
      // light pooled under the marquee
      s += `<g style="${screen}">` + K.pool(o, 800, p(0, 0.15, D - 2.4)[1], 520, 40, '#ffd690', 0.55, 'mpool') + '</g>';
      { // sunburst inlay
        const cz = D - 1.9;
        let d = '';
        for (let i = 0; i <= 12; i++) { const a = Math.PI * (i / 12), q0 = p(0, 0.152, cz + 0.4), q1 = p(Math.cos(a) * 3.0, 0.152, cz + 0.4 - Math.sin(a) * 2.2); d += `M${n(q0[0])},${n(q0[1])} L${n(q1[0])},${n(q1[1])} `; }
        s += K.path(d, 'none', { stroke: '#c9a35a', strokeWidth: 1.4, opacity: 0.55 });
        const ring = []; for (let i = 0; i <= 24; i++) { const a = Math.PI * (i / 24); ring.push(p(Math.cos(a) * 3.0, 0.152, cz + 0.4 - Math.sin(a) * 2.2)); }
        s += K.path('M' + ring.map((q) => n(q[0]) + ',' + n(q[1])).join(' L'), 'none', { stroke: '#c9a35a', strokeWidth: 1.6, opacity: 0.6 });
      }
      s += poly(p.wz(walkZ0, -26, 26, 0, 0.15), L('#9a958a')) + poly(p.wy(0.151, -26, 26, walkZ0, walkZ0 + 0.3), L('#b5b0a4'));
      // the street
      const rd = o.id('rd');
      s += K.defs(K.linear(rd, [[0, '#1b2130'], [1, '#0d111a']], 0, p(0, 0, walkZ0)[1], 0, 900, true));
      s += poly(p.wy(0, -40, 40, 2.5, walkZ0), `url(#${rd})`);
      // reflections in the wet street: soft smears with brighter streaks under the bright edges
      const ga = p(0, 0, walkZ0)[1];
      const reflect = (x0, x1, h0, h1, z, color, op, streaks) => {
        const yA = Math.max(ga + 6, p(0, -h0, z)[1] - 40), yB = Math.min(905, p(0, -h1, z)[1] + 30);
        const xa = p(x0, 0, z)[0], xb = p(x1, 0, z)[0], id = o.id(uq('rf'));
        const f0 = Math.min(0.9, (yA - ga) / (yB - ga)).toFixed(2);
        let r = `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${n(ga)}" x2="0" y2="${n(yB)}"><stop offset="0" stop-color="${color}" stop-opacity="${(op * 0.35).toFixed(2)}"/><stop offset="${f0}" stop-color="${color}" stop-opacity="${op}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>`;
        r += `<g style="${screen}">` + rect(xa, ga, xb - xa, yB - ga, `url(#${id})`, { opacity: 0.45 });
        for (let i = 0; i < streaks; i++) { const x = xa + ((xb - xa) * (i + 0.5)) / streaks + (rng() - 0.5) * 10, w = 2 + rng() * 3; r += rect(x - w / 2, ga, w, (yB - ga) * (0.7 + rng() * 0.3), `url(#${id})`, { opacity: 0.8 }); }
        return r + '</g>';
      };
      s += reflect(mx0 + 0.4, mx1 - 0.4, my0, my1, mzF, '#ffe2a6', 0.5, 14) + reflect(-0.7, 0.7, 5.7, 11.75, D - 1, '#ff6a50', 0.55, 4) + reflect(-5.8, 5.8, 0.2, 2.7, D, '#ffcf86', 0.35, 6);
      for (const x of [-9.2, 10.4]) s += reflect(x - 0.3, x + 0.3, 3.8, 4.3, walkZ0 + 0.5, P.sodium, 0.45, 2);
      // ripples breaking the reflections
      { let d = ''; for (let i = 0; i < 16; i++) { const y = ga + 10 + rng() * 300, x = 300 + rng() * 1000; d += `M${n(x)},${n(y)} h${n(60 + rng() * 220)} `; } s += K.path(d, 'none', { stroke: '#0b0f18', strokeWidth: 2, opacity: 0.5 }); }
      // puddles holding the lights
      for (const [x, z, rx, rz] of [[-4.5, 13.5, 2.2, 1.1], [3.8, 10.5, 1.6, 0.9], [-1.2, 7.5, 1.2, 0.6]]) {
        const pts = []; for (let i = 0; i < 18; i++) { const a = (i / 18) * 6.283, k = 1 + 0.18 * Math.sin(a * 3 + x) + (rng() - 0.5) * 0.12; pts.push(p(x + Math.cos(a) * rx * k, 0.003, z + Math.sin(a) * rz * k)); }
        s += poly(pts, '#22304c', { opacity: 0.9 });
        const q = p(x, 0, z); s += halo(q[0] + rx * 8, q[1], rx * 30, gWarm, 0.55, rz * 9);
      }
      // a parked car at the curb on the right, catching the marquee light on its roof
      {
        const z = 16.6, k = p.k(z), x0 = 7.6, x1 = 12.4;
        const P2 = (x, y) => p(x, y, z);
        const body = '#3a3036', top = '#5a4a48';
        const [ax, ay] = P2(x0, 0.95), [bx, by] = P2(x1, 0.3);
        s += K.ellipse((ax + bx) / 2, by + 6, (bx - ax) * 0.55, 8, '#05070c', { opacity: 0.6 });
        s += K.path(`M${n(ax)},${n(by)} L${n(ax)},${n(ay + 8)} Q${n(ax + 4)},${n(ay)} ${n(ax + 0.6 * k)},${n(ay)} L${n(P2(x0 + 1.3, 0)[0])},${n(ay)} L${n(P2(x0 + 1.75, 0)[0])},${n(P2(0, 1.38)[1])} L${n(P2(x0 + 3.5, 0)[0])},${n(P2(0, 1.38)[1])} L${n(P2(x0 + 3.95, 0)[0])},${n(ay)} L${n(bx - 6)},${n(ay + 2)} Q${n(bx)},${n(ay + 4)} ${n(bx)},${n(ay + 14)} L${n(bx)},${n(by)} Z`, body);
        s += K.path(`M${n(P2(x0 + 1.4, 0)[0])},${n(ay - 1)} L${n(P2(x0 + 1.8, 0)[0])},${n(P2(0, 1.33)[1])} L${n(P2(x0 + 3.45, 0)[0])},${n(P2(0, 1.33)[1])} L${n(P2(x0 + 3.85, 0)[0])},${n(ay - 1)} Z`, '#141a26');
        s += K.line(P2(x0 + 2.6, 0)[0], P2(0, 1.33)[1], P2(x0 + 2.6, 0)[0], ay - 1, body, 3);
        s += K.path(`M${n(ax + 6)},${n(ay + 1)} L${n(P2(x0 + 1.3, 0)[0])},${n(ay)} L${n(P2(x0 + 1.75, 0)[0])},${n(P2(0, 1.38)[1])} L${n(P2(x0 + 3.5, 0)[0])},${n(P2(0, 1.38)[1])}`, 'none', { stroke: '#ffcf86', strokeWidth: 1.6, opacity: 0.55 });
        s += rect(ax, P2(0, 0.62)[1], bx - ax, 3, '#8a7a70', { opacity: 0.6 });
        for (const xw of [x0 + 0.9, x1 - 0.95]) { const q = P2(xw, 0.33); s += K.circle(q[0], q[1], 0.33 * k, '#08090d') + K.circle(q[0], q[1], 0.15 * k, '#4a4a50'); }
        s += rect(ax - 1, P2(0, 0.72)[1], 5, 5, '#ff4a3a') + halo(ax + 1, P2(0, 0.74)[1], 16, gRed, 0.7);
      }

      /* street lamps either side, people waiting in line */
      for (const x of [-9.2, 10.4]) {
        const z = walkZ0 + 0.5, [bx, by] = p(x, 0.15, z), k = p.k(z), iron = '#12151c';
        s += rect(bx - 0.13 * k, by - 0.5 * k, 0.26 * k, 0.5 * k, iron) + rect(bx - 0.06 * k, by - 3.7 * k, 0.12 * k, 3.3 * k, iron);
        const gy = by - 4.05 * k, gr = 0.24 * k;
        s += K.ellipse(bx, gy, gr, gr * 1.25, '#fff3d2') + rect(bx - gr * 0.55, gy - gr * 1.45, gr * 1.1, gr * 0.3, iron);
        s += halo(bx, gy, 2.6 * k, gHalo) + K.pool(o, bx, by, 3 * k, 18, P.sodium, 0.32, uq('lp'));
      }
      const queue = [[-2.0, 22.4, 1.62, '#3a2a30', 'f'], [-2.75, 22.6, 1.78, '#2a2a34', 'm'], [-3.9, 22.5, 1.7, '#30262c', 'u'], [-4.6, 22.7, 1.2, '#3a3040', 'k']];
      for (const [x, z, h, c, kind] of queue) {
        s += walker(p, x, z, h, c, rng);
        const [px, py] = p(x, 0.15, z), k = p.k(z);
        // warm rim light from the marquee on top of heads and shoulders
        s += K.path(`M${n(px - 0.2 * k)},${n(py - h * k * 0.86)} Q${n(px)},${n(py - h * k * 0.93)} ${n(px + 0.2 * k)},${n(py - h * k * 0.86)}`, 'none', { stroke: '#ffcf80', strokeWidth: 1.5, opacity: 0.7 });
        if (kind === 'u') { // a furled umbrella hooked on an arm
          s += K.line(px + 0.25 * k, py - h * k * 0.55, px + 0.32 * k, py - 0.05 * k, '#151018', 2.5);
        }
        if (kind === 'm') s += rect(px - 0.17 * k, py - h * k - 0.02 * k, 0.34 * k, 0.07 * k, '#151018') + rect(px - 0.11 * k, py - h * k - 0.14 * k, 0.22 * k, 0.13 * k, '#151018');
      }

      /* atmosphere: the night pressing in at the edges */
      s += K.band(o, 0, 220, '#05070c', 0.35, 0, 'top');
      s += K.band(o, 640, 260, '#05070c', 0, 0.35, 'low');
      return s;
    }
  });

  /* ================================================================== */
  /* 4. Inside Dot's Diner: booths under the front windows on the left,   */
  /*    the counter and its stools on the right, the grill behind it.     */
  ART.bg('diner', {
    times: ['day', 'afternoon'],
    draw(o) {
      const t = o.time, rng = o.rng, aft = t === 'afternoon';
      const L = (c) => K.tone(c, t), S = (c) => K.shade(c, t);
      const p = cam(760, 400, 820, 1.5);
      const XL = -2.8, XR = 3.6, YC = 3.0, ZB = 7.5, ZN = 0.6;
      const gWarm = o.id('warm'), gGlass = o.id('glass');
      let s = '<defs>' + haloDef(gWarm, '#ffe0a0', 0.6) + K.linear(gGlass, [[0, '#ffffff', 0.35], [0.5, '#ffffff', 0.08], [1, '#ffffff', 0.25]], 0, 0, 1, 1) + '</defs>';
      const halo = (x, y, r, op = 1, ry) => `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r)}" ry="${n(ry || r)}" fill="url(#${gWarm})" opacity="${op}" style="${screen}"/>`;
      const wall = '#eadfc4', teal = '#2e8b8b', chrome = '#c3c8cc', pink = '#e2b2a4', red = '#b8463a';

      /* ---------- shell: tin ceiling, walls, checkerboard ---------- */
      s += poly(p.wy(YC, XL, XR, ZN, ZB), S('#e6dcc4'));
      { let d = ''; for (let x = XL; x <= XR + 0.01; x += 0.6) { const a = p(x, YC, ZN + 0.4), b = p(x, YC, ZB); d += `M${n(a[0])},${n(a[1])} L${n(b[0])},${n(b[1])} `; } for (let z = 1.2; z <= ZB; z += 0.6) { const a = p(XL, YC, z), b = p(XR, YC, z); d += `M${n(a[0])},${n(a[1])} L${n(b[0])},${n(b[1])} `; } s += K.path(d, 'none', { stroke: K.adj(S('#e6dcc4'), -0.18), strokeWidth: 1.2, opacity: 0.55 }); }
      s += poly(p.wz(ZB, XL, XR, 0, YC), L(wall));
      s += poly(p.wx(XL, ZN, ZB, 0, YC), S(wall));
      s += poly(p.wx(XR, ZN, ZB, 0, YC), K.mix(L(wall), S(wall), 0.25));
      // crown stripe and the teal tile wainscot on the back wall
      s += poly(p.wz(ZB, XL, XR, 2.72, 2.8), L(red)) + poly(p.wx(XR, ZN, ZB, 2.72, 2.8), L(red)) + poly(p.wx(XL, ZN, ZB, 2.72, 2.8), S(red));
      s += poly(p.wz(ZB, XL, XR, 0, 1.0), L(teal)) + poly(p.wz(ZB, XL, XR, 1.0, 1.06), L(chrome));
      { let d = ''; for (let x = XL; x < XR; x += 0.15) { const a = p(x, 0, ZB), b = p(x, 1.0, ZB); d += `M${n(a[0])},${n(a[1])} V${n(b[1])} `; } for (let y = 0.15; y < 1; y += 0.15) { const a = p(XL, y, ZB), b = p(XR, y, ZB); d += `M${n(a[0])},${n(a[1])} H${n(b[0])} `; } s += K.path(d, 'none', { stroke: S(teal), strokeWidth: 1, opacity: 0.5 }); }
      // floor
      s += poly(p.wy(0, XL, XR, ZN, ZB), L('#e6ddc8'));
      { let d = ''; const tile = 0.3; let r = 0; for (let z = ZB - tile; z > 2.0; z -= tile, r++) { let c = 0; for (let x = XL; x < XR - 0.01; x += tile, c++) { if ((r + c) % 2) continue; const q = p.wy(0, x, x + tile, z, z + tile); d += 'M' + q.map((v) => n(v[0]) + ',' + n(v[1])).join(' L') + ' Z '; } } s += K.path(d, L('#2c2e36')); }
      s += poly(p.wy(0, XL, XR, ZN, ZB), '#fff8ea', { opacity: 0.06 });

      /* ---------- back wall: jukebox, restroom door, clock, chalkboard, kitchen door ---------- */
      const BW = (x0, x1, y0, y1) => p.wz(ZB, x0, x1, y0, y1);
      const R = (x0, x1, y0, y1, z = ZB) => { const a = p(x0, y1, z), b = p(x1, y0, z); return [a[0], a[1], b[0] - a[0], b[1] - a[1]]; };
      // restroom door + sign
      s += poly(BW(-2.72, -1.86, 0, 2.18), L('#e9e1cf')) + poly(BW(-2.64, -1.94, 0, 2.1), L('#8a5a35')) + poly(BW(-2.55, -2.03, 1.2, 1.9), L('#7a4c2c'));
      { const [x, y, w, h] = R(-2.7, -1.88, 2.24, 2.46); s += rect(x, y, w, h, L('#2a2c34')) + txt(x + w / 2, y + h * 0.74, 'REST ROOMS', { size: h * 0.62, fill: L('#ece3cf'), weight: 600, len: w * 0.86 }); }
      // the wall clock and a framed photo of the canal flood
      { const [cx, cy] = p(0.25, 2.42, ZB), r = 0.2 * p.k(ZB); s += K.circle(cx, cy, r + 3, L('#2a2c34')) + K.circle(cx, cy, r, L('#f4eedf')); const hm = aft ? [3, 40] : [11, 50]; const ah = ((hm[0] % 12) + hm[1] / 60) / 12 * 6.283 - 1.571, am = (hm[1] / 60) * 6.283 - 1.571; s += K.line(cx, cy, cx + Math.cos(ah) * r * 0.5, cy + Math.sin(ah) * r * 0.5, '#222', 2) + K.line(cx, cy, cx + Math.cos(am) * r * 0.8, cy + Math.sin(am) * r * 0.8, '#222', 1.4); }
      { const [x, y, w, h] = R(-0.3, 0.55, 1.6, 2.12); s += rect(x - 3, y - 3, w + 6, h + 6, L('#5a3a22')) + rect(x, y, w, h, L('#b9b09a')) + rect(x, y + h * 0.55, w, h * 0.45, L('#6f7f8a')) + rect(x + w * 0.1, y + h * 0.2, w * 0.3, h * 0.35, L('#8a8070')) + rect(x + w * 0.55, y + h * 0.1, w * 0.35, h * 0.45, L('#9a9080')); }
      // chalkboard: today's special
      {
        const [x, y, w, h] = R(1.36, 2.94, 1.74, 2.66);
        s += rect(x - 5, y - 5, w + 10, h + 10, L('#7a4c2c')) + rect(x, y, w, h, L('#2b3330'));
        s += rect(x + 4, y + 4, w - 8, h - 8, '#ffffff', { opacity: 0.04 });
        const ch = L('#f2efe6');
        s += txt(x + w * 0.5, y + h * 0.22, 'TODAY:', { size: h * 0.17, fill: ch, font: FONT.hand, len: w * 0.36 });
        s += txt(x + w * 0.5, y + h * 0.45, 'HOT TURKEY', { size: h * 0.19, fill: ch, font: FONT.hand, len: w * 0.76 });
        s += txt(x + w * 0.5, y + h * 0.67, 'SANDWICH', { size: h * 0.19, fill: ch, font: FONT.hand, len: w * 0.66 });
        s += txt(x + w * 0.5, y + h * 0.9, '$3.95', { size: h * 0.2, fill: L('#f2c76a'), font: FONT.hand, len: w * 0.38 });
        s += K.path(`M${n(x + w * 0.2)},${n(y + h * 0.27)} h${n(w * 0.6)}`, 'none', { stroke: ch, strokeWidth: 1.2, opacity: 0.7 });
        s += rect(x + w * 0.1, y + h, w * 0.8, 4, L('#8a6a4a'));
      }
      // kitchen door with a porthole
      s += poly(BW(3.0, 3.58, 0, 2.15), L('#b9bfc4')) + poly(BW(3.0, 3.58, 0, 0.35), S('#9aa0a6'));
      { const [cx, cy] = p(3.29, 1.55, ZB), r = 0.14 * p.k(ZB); s += K.circle(cx, cy, r + 3, L('#8a9096')) + K.circle(cx, cy, r, L('#f6e2b0')); }
      // the jukebox in the corner, glowing
      {
        const z0 = 7.02, x0 = -1.78, x1 = -0.78, hh = 1.46;
        s += box(p, x0, x1, 0, hh, z0, ZB, { front: L('#6b3a22'), l: L('#5a3020'), top: L('#7a4428') });
        const [jx, jy, jw, jh] = R(x0, x1, 0, hh, z0);
        s += halo(jx + jw / 2, jy + jh * 0.35, jw * 1.6, 0.8);
        s += K.path(`M${n(jx)},${n(jy + jh * 0.2)} Q${n(jx + jw / 2)},${n(jy - jh * 0.22)} ${n(jx + jw)},${n(jy + jh * 0.2)} Z`, L('#6b3a22'));
        // lit arch bands
        const bands = ['#ffd38a', '#e8743a', '#ffe9b8', '#c8463a'];
        bands.forEach((c, i) => { const inset = 3 + i * 4; s += K.path(`M${n(jx + inset)},${n(jy + jh * 0.62)} L${n(jx + inset)},${n(jy + jh * 0.2)} Q${n(jx + jw / 2)},${n(jy - jh * 0.2 + inset * 1.4)} ${n(jx + jw - inset)},${n(jy + jh * 0.2)} L${n(jx + jw - inset)},${n(jy + jh * 0.62)}`, 'none', { stroke: c, strokeWidth: 3.2, opacity: 0.95 }); });
        s += K.path(`M${n(jx + jw * 0.25)},${n(jy + jh * 0.42)} Q${n(jx + jw / 2)},${n(jy + jh * 0.12)} ${n(jx + jw * 0.75)},${n(jy + jh * 0.42)} Z`, '#2a1a14');
        for (let i = 0; i < 5; i++) s += rect(jx + jw * (0.3 + i * 0.09), jy + jh * 0.3, 2, jh * 0.1, '#e9e1cf', { opacity: 0.7 });
        s += rect(jx + jw * 0.18, jy + jh * 0.66, jw * 0.64, jh * 0.24, L('#3a2418')) + rect(jx + jw * 0.18, jy + jh * 0.66, jw * 0.64, jh * 0.24, 'none', { stroke: '#d9b25a', strokeWidth: 1.5 });
        for (let i = 1; i < 6; i++) s += rect(jx + jw * 0.2, jy + jh * (0.66 + i * 0.04), jw * 0.6, 1.2, '#d9b25a', { opacity: 0.6 });
        for (const bx of [jx + 3, jx + jw - 7]) s += rect(bx, jy + jh * 0.2, 4, jh * 0.42, '#ffb070', { opacity: 0.85, rx: 2 });
      }

      /* ---------- right wall: shelves of mugs, the pass-through and order wheel, the grill ---------- */
      const RW = (z0, z1, y0, y1, x = XR) => p.wx(x, z0, z1, y0, y1);
      // feed-store calendar
      {
        const q = RW(3.55, 4.15, 1.45, 2.32, XR - 0.01);
        s += poly(q, L('#f1ead8'));
        s += poly(RW(3.6, 4.1, 1.95, 2.27, XR - 0.012), L('#9a6a3a'));
        s += poly(RW(3.6, 4.1, 2.12, 2.27, XR - 0.013), L('#c9a26a'));
        s += poly(RW(3.7, 3.98, 1.98, 2.1, XR - 0.014), L('#b5532e'));
        let d = ''; for (let i = 0; i < 5; i++) { const y = 1.52 + i * 0.08, a = p(XR - 0.014, y, 3.62), b = p(XR - 0.014, y, 4.08); d += `M${n(a[0])},${n(a[1])} L${n(b[0])},${n(b[1])} `; } s += K.path(d, 'none', { stroke: L('#8a8478'), strokeWidth: 1 });
        s += wallText(p, XR - 0.015, 4.08, 3.62, 1.87, 0.06, 'OCTOBER', { fill: L('#3a2a20'), fit: 0.8 });
        s += wallText(p, XR - 0.015, 4.1, 3.6, 2.19, 0.045, 'PELLETIER FEED', { fill: L('#f4ead2'), fit: 0.8 });
      }
      // shelves with mugs and glasses above the back bar
      for (const y of [1.55, 1.98]) {
        s += poly(RW(4.25, 5.35, y - 0.04, y, XR - 0.01), L('#8a5a35')) + poly(p.wy(y, XR - 0.28, XR, 4.25, 5.35), K.adj(S('#8a5a35'), -0.1));
        for (let z = 4.35; z < 5.3; z += 0.16) { const a = p(XR - 0.12, y + 0.13, z), b = p(XR - 0.12, y, z), kk = p.k(z); s += rect(a[0] - 0.05 * kk, a[1], 0.1 * kk, b[1] - a[1], y > 1.8 ? L('#cfd8de') : L('#f2ede2'), { opacity: y > 1.8 ? 0.75 : 1 }); }
      }
      // the pass-through to the kitchen, order wheel with tickets
      s += poly(RW(5.55, 6.55, 1.2, 1.95, XR - 0.01), L('#3a3430')) + poly(RW(5.6, 6.5, 1.25, 1.9, XR - 0.015), '#f2dcaa', { opacity: 0.85 });
      s += poly(p.wy(1.2, XR - 0.3, XR, 5.5, 6.6), L(chrome));
      { const [cx, cy] = p(XR - 0.14, 1.98, 6.05), kk = p.k(6.05); s += K.ellipse(cx, cy, 0.05 * kk, 0.16 * kk, L('#8a9096')); for (let i = 0; i < 5; i++) s += poly([[cx - 2, cy - 0.12 * kk + i * 0.06 * kk], [cx + 0.09 * kk * 0.3, cy - 0.14 * kk + i * 0.06 * kk], [cx + 0.09 * kk * 0.3, cy - 0.08 * kk + i * 0.06 * kk], [cx - 2, cy - 0.06 * kk + i * 0.06 * kk]], L('#f6f2e6')); }
      // hood + grill
      s += box(p, XR - 0.75, XR, 2.2, 2.62, 6.4, ZB, { l: L('#b9bfc4'), bot: S('#9aa0a6'), front: L('#c9ced2') });
      s += box(p, XR - 0.7, XR, 0, 0.92, 6.45, ZB, { l: L('#9aa0a6'), top: L('#5a5e64'), front: L('#a9aeb3') });
      s += poly(p.wx(XR - 0.01, 6.45, ZB, 0.92, 1.4), L('#c3c8cc'));
      for (const [zz, c] of [[6.62, '#7a3a20'], [6.85, '#7a3a20'], [7.1, '#f2e2b0'], [7.3, '#f2e2b0']]) { const q = p(XR - 0.35, 0.93, zz), kk = p.k(zz); s += K.ellipse(q[0], q[1], 0.07 * kk, 0.015 * kk, L(c)); }
      for (let i = 0; i < 4; i++) { const zz = 6.55 + i * 0.22, q = p(XR - 0.06, 1.12, zz), kk = p.k(zz); s += rect(q[0] - 0.025 * kk, q[1] - 0.18 * kk, 0.05 * kk, 0.18 * kk, L(i % 2 ? '#d9a441' : red)); }
      s += poly(p.wy(2.2, XR - 0.72, XR - 0.05, 6.45, ZB - 0.05), '#fff0c8', { opacity: 0.85 });
      { const q = p(XR - 0.4, 1.3, 6.95); s += halo(q[0], q[1], 70, 0.7, 40); }
      for (let i = 0; i < 3; i++) { const q = p(XR - 0.35, 1.2 + i * 0.25, 6.8 + i * 0.12); s += K.ellipse(q[0], q[1], 9 + i * 4, 4 + i * 2, '#ffffff', { opacity: 0.12 - i * 0.03 }); }
      // back bar along the right wall: steel, coffee machine, shake mixer, cake stand
      s += box(p, XR - 0.65, XR, 0, 0.95, 3.2, 6.4, { l: L('#a9aeb3'), top: L('#c9ced2'), front: L('#b9bfc4') });
      {
        // coffee brewer: steel box, black head, two glass pots (orange handle for decaf)
        const z0 = 3.85, z1 = 4.6;
        s += box(p, XR - 0.58, XR - 0.05, 0.95, 1.72, z0, z1, { l: L('#c9ced2'), front: L('#b9bfc4') });
        s += box(p, XR - 0.6, XR - 0.05, 1.5, 1.72, z0 - 0.04, z1, { l: L('#24262a'), front: L('#24262a'), bot: S('#24262a') });
        s += poly(p.wx(XR - 0.605, z0 + 0.1, z0 + 0.35, 1.58, 1.66), '#ff5a3a', { opacity: 0.9 });
        for (const [zz, handle] of [[4.03, '#1a1a1e'], [4.4, '#d9772e']]) {
          const [cx, cy] = p(XR - 0.4, 1.13, zz), kk = p.k(zz), w = 0.085 * kk;
          s += K.path(`M${n(cx - w)},${n(cy - 0.12 * kk)} L${n(cx + w)},${n(cy - 0.12 * kk)} Q${n(cx + w * 1.3)},${n(cy + 0.07 * kk)} ${n(cx)},${n(cy + 0.1 * kk)} Q${n(cx - w * 1.3)},${n(cy + 0.07 * kk)} ${n(cx - w)},${n(cy - 0.12 * kk)} Z`, '#e8eef2', { opacity: 0.6 });
          s += K.path(`M${n(cx - w * 1.15)},${n(cy - 0.01 * kk)} Q${n(cx)},${n(cy + 0.03 * kk)} ${n(cx + w * 1.15)},${n(cy - 0.01 * kk)} Q${n(cx + w * 1.1)},${n(cy + 0.07 * kk)} ${n(cx)},${n(cy + 0.095 * kk)} Q${n(cx - w * 1.1)},${n(cy + 0.07 * kk)} ${n(cx - w * 1.15)},${n(cy - 0.01 * kk)} Z`, L('#3a2216'));
          s += rect(cx - w, cy - 0.16 * kk, w * 2, 0.05 * kk, handle) + rect(cx - w * 1.9, cy - 0.11 * kk, w * 0.45, 0.13 * kk, handle, { rx: 2 });
          s += K.ellipse(cx, cy + 0.12 * kk, w * 1.3, 0.02 * kk, L('#2a2c30'));
        }
        // milkshake mixer: three spindles and steel cups
        const [mx, my] = p(XR - 0.3, 0.95, 4.95), kk = p.k(4.95);
        s += rect(mx - 0.06 * kk, my - 0.62 * kk, 0.12 * kk, 0.62 * kk, L('#e9e1cf')) + rect(mx - 0.12 * kk, my - 0.08 * kk, 0.24 * kk, 0.08 * kk, L('#e9e1cf'));
        s += K.path(`M${n(mx - 0.06 * kk)},${n(my - 0.62 * kk)} q${n(-0.02 * kk)},${n(-0.12 * kk)} ${n(0.1 * kk)},${n(-0.14 * kk)} l${n(0.12 * kk)},0 q${n(0.06 * kk)},0 ${n(0.06 * kk)},${n(0.08 * kk)} l0,${n(0.08 * kk)} Z`, L(teal));
        s += rect(mx + 0.07 * kk, my - 0.42 * kk, 0.012 * kk + 1, 0.2 * kk, L(chrome)) + K.path(`M${n(mx + 0.02 * kk)},${n(my - 0.25 * kk)} l${n(0.14 * kk)},0 l${n(-0.02 * kk)},${n(0.17 * kk)} l${n(-0.1 * kk)},0 Z`, L('#d8dde0'));
        // a cake under a glass dome
        const [cx, cy] = p(XR - 0.35, 0.95, 5.85), k2 = p.k(5.85);
        s += K.ellipse(cx, cy, 0.17 * k2 * 0.7, 0.04 * k2, L('#d8dde0')) + K.path(`M${n(cx - 0.12 * k2 * 0.7)},${n(cy - 0.02 * k2)} v${n(-0.1 * k2)} h${n(0.24 * k2 * 0.7)} v${n(0.1 * k2)} Z`, L('#f2e2c8')) + K.path(`M${n(cx - 0.15 * k2 * 0.7)},${n(cy)} Q${n(cx)},${n(cy - 0.42 * k2)} ${n(cx + 0.15 * k2 * 0.7)},${n(cy)} Z`, `url(#${gGlass})`);
      }

      /* ---------- front windows with Center Street outside ---------- */
      const wins = [[2.0, 3.55], [3.75, 5.25], [5.45, 6.95]];
      const wy0 = 0.95, wy1 = 2.42;
      const cid = o.id('winclip');
      s += `<clipPath id="${cid}">` + wins.map(([z0, z1]) => `<polygon points="${K.pts(p.wx(XL, z0, z1, wy0, wy1))}"/>`).join('') + '</clipPath>';
      {
        // outside: sky, the far side of the street, a parked car, a lamp; drawn in the same camera
        const OX = -21, oT = aft ? 'afternoon' : 'day', OL = (c) => K.tone(c, oT), OS = (c) => K.shade(c, oT);
        let out = rect(0, 0, 800, 900, aft ? '#f0c27c' : '#d6dbd9');
        out += poly(p.wy(0, OX, XL, 2, 80), OL('#6a6c70'));
        out += poly(p.wy(0.15, OX, OX + 3.2, 2, 80), OL('#a9a397'));
        out += poly(p.wy(0, -9.2, -9.0, 2, 80), OL('#d9b25a'));
        const blds = [[8, 17, 9.5, '#a05a40'], [17, 25, 7.2, '#8a4a34'], [25, 34, 10.5, '#dccfb2'], [34, 44, 8.0, '#7d3a2c'], [44, 56, 9.0, '#b9a37d'], [56, 70, 7.5, '#8c3b2e']];
        for (const [z0, z1, h, c] of blds) {
          out += poly(p.wx(OX, z0, z1, 0, h), aft ? OS(c) : OL(c));
          for (let z = z0 + 0.8; z < z1 - 1; z += 2.2) out += poly(p.wx(OX + 0.02, z, z + 1.1, 4.4, 6.2), aft ? OS('#3a4458') : OL('#46546a'));
          out += poly(p.wx(OX + 0.02, z0 + 0.4, z1 - 0.4, 0.5, 2.8), aft ? OS('#2c3446') : OL('#3a4658'));
          out += poly([p(OX, 3.3, z0 + 0.3), p(OX, 3.3, z1 - 0.3), p(OX + 1.4, 2.5, z1 - 0.3), p(OX + 1.4, 2.5, z0 + 0.3)], OL(rng.pick(['#a8382c', '#6e2b29', '#2e8b8b', '#d9a441'])));
        }
        // the DRUGS blade across the street
        { const a = p(OX + 0.3, 7.4, 12), b = p(OX + 1.3, 4.8, 12); out += rect(Math.min(a[0], b[0]), a[1], Math.abs(a[0] - b[0]), b[1] - a[1], OL('#efe6d2')); }
        // a parked car and a lamp post at the far curb
        out += box(p, OX + 3.4, OX + 5.2, 0.3, 0.95, 14, 18.6, { r: OS('#4a5a72'), top: OL('#5a6a82'), front: OL('#4a5a72') });
        out += box(p, OX + 3.5, OX + 5.1, 0.95, 1.4, 15.2, 17.2, { r: OL('#28303f'), top: OL('#5a6a82'), front: OL('#28303f') });
        { const a = p(OX + 3.0, 0, 26), b = p(OX + 3.0, 4.1, 26); out += K.line(a[0], a[1], b[0], b[1], OL('#22262a'), 2.5) + K.circle(b[0], b[1], 4, OL('#e9e4d8')); }
        if (aft) out += K.glow(o, 200, 120, 520, '#ffe8b0', 0.55, 'sunout');
        else out += rect(0, 0, 800, 900, '#e8ecee', { opacity: 0.18 });
        s += `<g clip-path="url(#${cid})">${out}</g>`;
      }
      // glass sheen, frames, blinds
      for (const [z0, z1] of wins) {
        s += poly(p.wx(XL, z0, z1, wy0, wy1), `url(#${gGlass})`, { opacity: 0.5 });
        const blindY = aft ? 1.72 : 2.05;
        s += poly(p.wx(XL + 0.02, z0, z1, blindY, wy1), aft ? '#f7dfae' : L('#e9e4d8'), { opacity: aft ? 0.55 : 0.92 });
        let d = '';
        for (let y = blindY + 0.03; y < wy1; y += aft ? 0.075 : 0.06) { const a = p(XL + 0.03, y, z0), b = p(XL + 0.03, y, z1); d += `M${n(a[0])},${n(a[1])} L${n(b[0])},${n(b[1])} `; }
        s += K.path(d, 'none', { stroke: aft ? '#b98a50' : S('#c9c2b0'), strokeWidth: aft ? 2.2 : 1.5, opacity: 0.9 });
        // frame
        s += poly(p.wx(XL + 0.03, z0 - 0.08, z0, wy0, wy1), L(chrome)) + poly(p.wx(XL + 0.03, z1, z1 + 0.08, wy0, wy1), L(chrome));
        s += poly(p.wx(XL + 0.03, z0 - 0.08, z1 + 0.08, wy1, wy1 + 0.07), L(chrome)) + poly(p.wy(wy0, XL, XL + 0.22, z0 - 0.08, z1 + 0.08), L('#d9d2c0'));
      }
      // reversed lettering on the middle window: the diner's name, seen from inside
      {
        const word = "S'TOD", z0 = 3.95, z1 = 5.05, y0 = 1.45, h = 0.34;
        for (let i = 0; i < word.length; i++) {
          const za = z0 + ((z1 - z0) * i) / word.length, zb = z0 + ((z1 - z0) * (i + 1)) / word.length, zm = (za + zb) / 2;
          const A = p(XL + 0.02, y0, za), B = p(XL + 0.02, y0, zb), M = p(XL + 0.02, y0, zm), Mt = p(XL + 0.02, y0 + h, zm);
          const slope = (B[1] - A[1]) / (B[0] - A[0]), hp = M[1] - Mt[1];
          s += `<text x="0" y="0" transform="matrix(-1,${(-slope).toFixed(4)},0,1,${n(M[0])},${n(M[1])})" font-family="${FONT.hand}" font-size="${n(hp / 0.72)}" textLength="${n(Math.abs(B[0] - A[0]) * 0.85 * (NARROW[word[i]] || 1))}" lengthAdjust="spacingAndGlyphs" text-anchor="middle" fill="${aft ? '#7a2a20' : L('#b8463a')}" opacity="0.85">${K.esc(word[i])}</text>`;
        }
      }

      /* ---------- booths under the windows, far to near ---------- */
      const booth = (z0) => {
        let r = '';
        const z1 = z0 + 1.75, xb = -1.05, seat = 0.46, back = 1.12;
        // far bench (its back faces us) is drawn first: seat facing camera side
        r += box(p, XL, xb, 0, back, z1 - 0.18, z1, { front: L(teal), r: S(teal), top: L('#3fa0a0') });
        r += box(p, XL, xb, 0, seat, z1 - 0.62, z1 - 0.18, { front: S(teal), r: S(teal), top: L('#43a5a5') });
        // the table: chrome edge, cream formica, pedestal
        const [px, py] = p((XL + xb) / 2 - 0.1, 0, z0 + 0.88), kk = p.k(z0 + 0.88);
        r += rect(px - 0.04 * kk, py - 0.72 * kk, 0.08 * kk, 0.72 * kk, L(chrome));
        r += box(p, XL, xb + 0.12, 0.7, 0.76, z0 + 0.55, z1 - 0.62, { top: L('#ece3cf'), r: L(chrome), front: L(chrome) });
        // napkins, ketchup, sugar on the table near the wall
        const cz = z0 + 0.88, [tx, ty] = p(XL + 0.22, 0.76, cz), tk = p.k(cz);
        r += rect(tx - 0.05 * tk, ty - 0.16 * tk, 0.1 * tk, 0.16 * tk, L(chrome)) + rect(tx + 0.07 * tk, ty - 0.2 * tk, 0.05 * tk, 0.2 * tk, L(red)) + rect(tx + 0.14 * tk, ty - 0.18 * tk, 0.05 * tk, 0.18 * tk, L('#d9a441'));
        // near bench: seat + its high back facing away (we see the tufted back)
        r += box(p, XL, xb, 0, seat, z0 + 0.18, z0 + 0.58, { top: L('#43a5a5'), r: S(teal), front: S(teal) });
        r += box(p, XL, xb, 0, back, z0, z0 + 0.18, { front: L(teal), r: S(teal), top: L('#3fa0a0') });
        const [bx0, by0] = p(XL, back, z0), [bx1, by1] = p(xb, 0.05, z0);
        let d = '';
        for (let i = 1; i < 6; i++) { const x = bx0 + ((bx1 - bx0) * i) / 6; d += `M${n(x)},${n(by0 + 6)} L${n(x)},${n(by0 + (by1 - by0) * 0.5)} `; }
        r += K.path(d, 'none', { stroke: S(teal), strokeWidth: 1.4, opacity: 0.8 }) + rect(bx0, by0, bx1 - bx0, 4, L('#e9e1cf'), { opacity: 0.8 });
        return r;
      };
      for (const z0 of [5.45, 3.7, 1.95]) {
        s += booth(z0);
      }

      /* ---------- the counter: steel front, pink formica top ---------- */
      const cx0 = 1.0, cx1 = 1.68, cz0 = 1.2, cz1 = 6.2, ch = 1.04;
      s += box(p, cx0, cx1, 0, ch, cz0, cz1, { l: L('#b9bfc4'), top: L(pink), front: L('#c9ced2') });
      s += poly(p.wx(cx0 - 0.002, cz0, cz1, 0.42, 0.56), L(teal)) + poly(p.wx(cx0 - 0.003, cz0, cz1, 0.0, 0.12), S('#5a5e64'));
      { let d = ''; for (let z = cz0 + 0.6; z < cz1; z += 0.6) { const a = p(cx0 - 0.004, 0.12, z), b = p(cx0 - 0.004, 0.42, z), c = p(cx0 - 0.004, 0.56, z), e = p(cx0 - 0.004, ch - 0.06, z); d += `M${n(a[0])},${n(a[1])} L${n(b[0])},${n(b[1])} M${n(c[0])},${n(c[1])} L${n(e[0])},${n(e[1])} `; } s += K.path(d, 'none', { stroke: S('#9aa0a6'), strokeWidth: 1.2 }); }
      s += poly(p.wx(cx0 - 0.005, cz0, cz1, ch - 0.06, ch), L('#e6eaee'));
      // on the counter: the pie case, napkins, sugar, a coffee cup, the register at the end
      const onC = (x, z) => p(x, ch, z);
      {
        // pie case: a three-tier glass drum
        const z = 4.25, [bx, by] = onC(1.34, z), k = p.k(z), w = 0.27 * k, hh = 0.52 * k;
        s += K.ellipse(bx, by, w, 0.05 * k, L(chrome));
        for (let i = 0; i < 3; i++) {
          const yy = by - hh * (0.12 + i * 0.3);
          s += K.ellipse(bx, yy, w * 0.9, 0.04 * k, L('#d8dde0'), { opacity: 0.9 });
          const pc = [['#c97a3a', '#8a2a22'], ['#d9a441', '#f2e6c8'], ['#b5683a', '#5b3a6b']][i];
          s += K.path(`M${n(bx - w * 0.78)},${n(yy - 2)} Q${n(bx)},${n(yy - 0.13 * k)} ${n(bx + w * 0.78)},${n(yy - 2)} Z`, L(pc[0])) + K.path(`M${n(bx - w * 0.15)},${n(yy - 2)} L${n(bx + w * 0.3)},${n(yy - 0.08 * k)} L${n(bx + w * 0.55)},${n(yy - 2)} Z`, L(pc[1]));
        }
        s += K.path(`M${n(bx - w)},${n(by)} L${n(bx - w)},${n(by - hh)} Q${n(bx)},${n(by - hh - 0.1 * k)} ${n(bx + w)},${n(by - hh)} L${n(bx + w)},${n(by)} Z`, `url(#${gGlass})`, { opacity: 0.9 });
        s += K.path(`M${n(bx - w)},${n(by)} L${n(bx - w)},${n(by - hh)} Q${n(bx)},${n(by - hh - 0.1 * k)} ${n(bx + w)},${n(by - hh)} L${n(bx + w)},${n(by)}`, 'none', { stroke: L(chrome), strokeWidth: 1.5 });
        s += K.ellipse(bx, by - hh - 0.03 * k, 0.03 * k, 0.02 * k, L(chrome));
      }
      for (const z of [2.4, 3.3, 5.3]) { const [x, y] = onC(1.48, z), k = p.k(z); s += rect(x - 0.05 * k, y - 0.13 * k, 0.1 * k, 0.13 * k, L(chrome)) + rect(x + 0.07 * k, y - 0.14 * k, 0.045 * k, 0.14 * k, '#e8eef2', { opacity: 0.7 }) + rect(x + 0.07 * k, y - 0.17 * k, 0.045 * k, 0.03 * k, L(chrome)); }
      { const [x, y] = onC(1.22, 2.9), k = p.k(2.9); s += K.ellipse(x, y, 0.09 * k, 0.025 * k, L('#f2ede2')) + rect(x - 0.045 * k, y - 0.08 * k, 0.09 * k, 0.08 * k, L('#f2ede2')) + K.ellipse(x, y - 0.08 * k, 0.045 * k, 0.012 * k, L('#4a2a1a')); }
      {
        const z = 5.95, [x, y] = onC(1.4, z), k = p.k(z);
        s += K.path(`M${n(x - 0.2 * k)},${n(y)} l${n(0.04 * k)},${n(-0.24 * k)} l${n(0.36 * k)},0 l${n(0.04 * k)},${n(0.24 * k)} Z`, L('#8a8e94'));
        s += rect(x - 0.15 * k, y - 0.4 * k, 0.3 * k, 0.17 * k, L('#a9aeb3')) + rect(x - 0.1 * k, y - 0.37 * k, 0.2 * k, 0.06 * k, '#1b0f05') + txt(x, y - 0.32 * k, '3.95', { size: 0.05 * k, fill: P.sodium, font: FONT.type, len: 0.13 * k });
      }

      /* ---------- stools along the counter, far to near ---------- */
      for (let z = 5.7; z > 1.9; z -= 0.78) {
        const x = 0.62, k = p.k(z), [bx, by] = p(x, 0, z), [sx, sy] = p(x, 0.74, z);
        const ry = (0.19 * k * (p.eye - 0.74)) / z;
        s += K.ellipse(bx, by, 0.2 * k, (0.2 * k * p.eye) / z, L('#9aa0a6'));
        s += rect(bx - 0.035 * k, sy, 0.07 * k, by - sy, L(chrome)) + rect(bx + 0.01 * k, sy, 0.02 * k, by - sy, S(chrome));
        s += rect(sx - 0.19 * k, sy, 0.38 * k, 0.07 * k, S(teal)) + K.ellipse(sx, sy + 0.07 * k, 0.19 * k, ry, S(teal));
        s += K.ellipse(sx, sy, 0.19 * k, ry, L('#3a9e9e')) + K.ellipse(sx - 0.05 * k, sy - ry * 0.2, 0.08 * k, ry * 0.4, '#ffffff', { opacity: 0.12 });
        s += K.ellipse(sx, sy + 0.035 * k, 0.195 * k, ry * 1.05, 'none', { stroke: L(chrome), strokeWidth: 1.4 });
      }

      /* ---------- pendant lights over the counter ---------- */
      for (const z of [2.4, 3.6, 4.8]) {
        const [x0, y0] = p(1.34, YC, z), [x1, y1] = p(1.34, 2.5, z), k = p.k(z);
        s += K.line(x0, y0, x1, y1, '#2a2a2e', 1.2);
        s += K.path(`M${n(x1 - 0.17 * k)},${n(y1 + 0.17 * k)} Q${n(x1 - 0.15 * k)},${n(y1)} ${n(x1)},${n(y1)} Q${n(x1 + 0.15 * k)},${n(y1)} ${n(x1 + 0.17 * k)},${n(y1 + 0.17 * k)} Z`, L(red));
        s += K.ellipse(x1, y1 + 0.17 * k, 0.17 * k, 0.03 * k, '#fff3d0');
        s += halo(x1, y1 + 0.2 * k, 0.9 * k, aft ? 0.55 : 0.8);
        const [fx, fy] = p(1.34, ch, z);
        s += `<g style="${screen}">` + K.pool(o, fx, fy, 0.5 * k, 0.08 * k, '#ffe0a0', 0.3, uq('pp')) + '</g>';
      }

      /* ---------- the light ---------- */
      if (aft) {
        // sun through the blinds: striped light across the booths and the floor, rising dust in the shafts
        const sx = 0.75 / 0.45, szz = 0.4 / 0.45, gold = '#ffd890';
        let stripes = '';
        for (const [z0, z1] of wins) {
          for (let y = 1.75; y < wy1 - 0.02; y += 0.075) {
            const xa = XL + sx * y, xb = XL + sx * (y + 0.035);
            stripes += `<polygon points="${K.pts(p.wy(0.005, xa, xb, z0 + szz * y, z1 + szz * y))}"/>`;
          }
          const xa = XL + sx * wy0, xb = XL + sx * 1.7;
          stripes += `<polygon points="${K.pts(p.wy(0.005, Math.max(xa, -1.0), xb, z0 + szz * 1.2, z1 + szz * 1.2))}"/>`;
          // the shaft through the air
          const A = p(XL, wy1, z0), B = p(XL, wy1, z1), C = p(XL + sx * wy1, 0, z1 + szz * wy1), D2 = p(XL + sx * wy1, 0, z0 + szz * wy1);
          s += K.shaft(o, [A, B, C, D2], gold, 0.26, uq('ray'), [0, 0, 1, 1]);
        }
        s += `<g fill="#ffe2a0" opacity="0.62" style="${screen}">${stripes}</g>`;
        // light caught on the booth tables and the counter front
        s += `<g style="${screen}">` + K.pool(o, 260, 640, 260, 70, gold, 0.3, 'tbl') + K.pool(o, 960, 600, 200, 160, gold, 0.18, 'cfront') + '</g>';
        for (let i = 0; i < 40; i++) { const a = p(XL + rng() * 3.2, 0.5 + rng() * 1.8, 2.2 + rng() * 5); s += K.circle(a[0], a[1], 0.8 + rng() * 1.2, '#fff4d8', { opacity: 0.35 + rng() * 0.4 }); }
        s += K.band(o, 0, 900, '#c06a30', 0.1, 0.18, 'amber');
      } else {
        // flat grey daylight off the street, falling on the booths
        s += `<g style="${screen}">` + K.pool(o, 200, 560, 380, 260, '#eef2f2', 0.22, 'day1') + K.pool(o, 520, 700, 360, 120, '#eef2f2', 0.14, 'day2') + '</g>';
      }
      // depth: corners and ceiling fall off
      s += K.band(o, 0, 200, '#2a2018', 0.3, 0, 'ceil');
      s += K.band(o, 700, 200, '#1a120c', 0, 0.25, 'floor');
      return s;
    }
  });

  /* ================================================================== */
  /* 5. Inside Low Tide Records, looking from the back of the shop toward */
  /*    the sunny front window and Center Street.                         */
  ART.bg('records', {
    times: ['day'],
    light: { day: 'morning' },
    draw(o) {
      const rng = o.rng, tt = 'morning';
      const L = (c) => K.tone(c, tt), S = (c) => K.shade(c, tt);
      const p = cam(800, 340, 820, 1.55);
      const XL = -2.5, XR = 3.0, YC = 3.25, ZF = 8.0, ZN = 0.5;
      const gWarm = o.id('warm'), gSun = o.id('sun');
      let s = '<defs>' + haloDef(gWarm, '#ffd890', 0.65) + K.linear(gSun, [[0, '#fff3d4'], [1, '#ffd890']]) + '</defs>';
      const halo = (x, y, r, op = 1, ry) => `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r)}" ry="${n(ry || r)}" fill="url(#${gWarm})" opacity="${op}" style="${screen}"/>`;
      const R = (x0, x1, y0, y1, z) => { const a = p(x0, y1, z), b = p(x1, y0, z); return [a[0], a[1], b[0] - a[0], b[1] - a[1]]; };
      const brick = '#9a5236', pine = '#b98a52', cream = '#e9dcbc';

      /* ---------- shell ---------- */
      s += poly(p.wy(YC, XL, XR, ZN, ZF), S('#d9c9a4'));
      { let d = ''; for (let z = 1.0; z < ZF; z += 0.9) { const a = p(XL, YC, z), b = p(XR, YC, z); d += `M${n(a[0])},${n(a[1])} L${n(b[0])},${n(b[1])} `; } s += K.path(d, 'none', { stroke: S('#8a6a44'), strokeWidth: 5, opacity: 0.55 }); }
      s += poly(p.wx(XL, ZN, ZF, 0, YC), S(brick));
      { let d = ''; for (let y = 0.25; y < YC; y += 0.25) { const a = p(XL, y, 1.2), b = p(XL, y, ZF); d += `M${n(a[0])},${n(a[1])} L${n(b[0])},${n(b[1])} `; } s += K.path(d, 'none', { stroke: K.adj(S(brick), -0.3), strokeWidth: 1, opacity: 0.45 }); }
      s += poly(p.wx(XR, ZN, ZF, 0, YC), K.mix(L(pine), S(pine), 0.35));
      { let d = ''; for (let z = 1.0; z < ZF; z += 0.22) { const a = p(XR, 0, z), b = p(XR, YC, z); d += `M${n(a[0])},${n(a[1])} L${n(b[0])},${n(b[1])} `; } s += K.path(d, 'none', { stroke: S(pine), strokeWidth: 1, opacity: 0.5 }); }
      // floorboards toward the window
      s += poly(p.wy(0, XL, XR, ZN, ZF), L('#a8743f'));
      { let d = ''; for (let x = XL + 0.14; x < XR; x += 0.14) { const a = p(x, 0, 1.0), b = p(x, 0, ZF); d += `M${n(a[0])},${n(a[1])} L${n(b[0])},${n(b[1])} `; } for (let i = 0; i < 70; i++) { const x = XL + Math.floor(rng() * 39) * 0.14, z = 2 + rng() * 6, a = p(x, 0, z), b = p(x + 0.14, 0, z); d += `M${n(a[0])},${n(a[1])} L${n(b[0])},${n(b[1])} `; } s += K.path(d, 'none', { stroke: S('#7a5028'), strokeWidth: 1, opacity: 0.55 }); }

      /* ---------- the front: window with Center Street, door, listening booth ---------- */
      const FW = (x0, x1, y0, y1) => p.wz(ZF, x0, x1, y0, y1);
      s += poly(FW(XL, XR, 0, YC), L(cream));
      const win = [-2.3, 0.72, 0.55, 2.9], door = [0.95, 1.9, 0, 2.45];
      const cid = o.id('front');
      s += `<clipPath id="${cid}"><polygon points="${K.pts(FW(win[0], win[1], win[2], win[3]))}"/><polygon points="${K.pts(FW(door[0] + 0.12, door[1] - 0.12, 1.0, 2.3))}"/></clipPath>`;
      {
        // outside, in the same camera: the hardware store across the street, the blue pickup, sunlit haze
        const OZ = ZF + 17, OL = (c) => K.tone(c, 'morning'), OS = (c) => K.shade(c, 'morning');
        let out = rect(0, 0, 1600, 900, '#f6e2b8');
        out += poly(p.wy(0, -30, 30, ZF + 0.2, OZ), OL('#8d8a84'));
        out += poly(p.wy(0, -30, 30, ZF + 0.2, ZF + 2.6), OL('#c9c2b0'));
        out += poly(p.wy(0.15, -30, 30, OZ - 3, OZ), OL('#b9b2a2'));
        out += poly(p.wz(OZ, -30, 30, 0, 8.4), OS('#8a4a34'));
        out += poly(p.wz(OZ, -30, 30, 7.8, 8.4), OL('#e2d6bc'));
        for (const x of [-7.5, -5, -2.5, 2.4, 4.9]) out += poly(p.wz(OZ, x, x + 1.1, 4.9, 6.8), OS('#3a4458'));
        out += poly(p.wz(OZ, -6.2, 3.6, 3.45, 4.35), OL('#e9e1cf'));
        out += poly(p.wz(OZ, -6.2, 3.6, 0, 3.4), OS('#3e3a34')) + poly(p.wz(OZ, -5.8, 1.0, 0.5, 2.85), OS('#4a5468'));
        for (let i = 0; i < 9; i++) { const x0 = -6.2 + i * 1.09; out += poly([p(x0, 3.3, OZ), p(x0 + 1.09, 3.3, OZ), p(x0 + 1.09, 2.5, OZ - 1.4), p(x0, 2.5, OZ - 1.4)], OL(i % 2 ? '#e9e1cf' : '#a8382c')); }
        for (let i = 0; i < 4; i++) { const q = p(-4.4 + i * 0.45, 0.4, OZ - 0.6), kk = p.k(OZ); out += K.ellipse(q[0], q[1], 0.25 * kk, 0.2 * kk, OL(P.ember)); }
        // the pickup at the far curb
        out += box(p, -3.2, 2.0, 0.34, 1.04, OZ - 4.4, OZ - 2.6, { front: OL('#4a5a72'), top: OL('#5a6a82') });
        out += box(p, -1.0, 0.8, 1.04, 1.8, OZ - 4.3, OZ - 2.7, { front: OL('#2a3242'), top: OL('#5a6a82') });
        for (const x of [-2.4, 1.2]) { const q = p(x, 0.33, OZ - 4.42), kk = p.k(OZ - 4.4); out += K.circle(q[0], q[1], 0.33 * kk, '#1a1c22'); }
        // a lamp post and a passer-by on our side of the street
        { const a = p(-1.8, 0, ZF + 2.2), b = p(-1.8, 4.1, ZF + 2.2); out += K.line(a[0], a[1], b[0], b[1], OL('#22262a'), 3) + K.circle(b[0], b[1], 6, OL('#efe9da')); }
        out += walker(p, 1.5, ZF + 1.6, 1.68, OL('#6e2b29'), rng);
        // sun flooding past the roofline
        out += K.glow(o, 620, 120, 600, '#fff6dc', 0.8, 'sunsky') + rect(0, 0, 1600, 900, '#fff1d2', { opacity: 0.42 });
        s += `<g clip-path="url(#${cid})">${out}</g>`;
      }
      // window frame + mullions, door frame
      s += K.path(pathD(FW(win[0], win[1], win[2], win[3])), 'none', { stroke: L('#3a2c22'), strokeWidth: 6 });
      for (const x of [-1.29, -0.29]) s += poly(FW(x - 0.03, x + 0.03, win[2], win[3]), L('#3a2c22'));
      s += poly(FW(win[0] - 0.12, win[1] + 0.12, win[2] - 0.16, win[2]), L('#6b4a32')) + poly(p.wy(win[2], win[0] - 0.12, win[1] + 0.12, ZF - 0.3, ZF), L('#8a6440'));
      s += poly(FW(door[0], door[1], 0, door[3]), L('#4a3326')) + poly(FW(door[0] + 0.12, door[1] - 0.12, 0, 0.9), L('#5a4030'));
      s += K.path(pathD(FW(door[0] + 0.12, door[1] - 0.12, 1.0, 2.3)), 'none', { stroke: L('#3a2c22'), strokeWidth: 3 });
      s += poly(FW(door[0] + 0.12, door[1] - 0.12, 1.32, 1.36), L('#d9b25a'));
      // a few records on stands in the window, backlit
      for (const [x, c] of [[-1.95, '#c8463a'], [-0.95, '#2a3a5a'], [0.15, '#d9a441']]) {
        const [rx, ry, rw, rh] = R(x, x + 0.42, 0.6, 1.02, ZF - 0.25);
        s += rect(rx, ry, rw, rh, L(c)) + K.circle(rx + rw / 2, ry + rh / 2, rw * 0.28, '#151515', { opacity: 0.85 }) + K.circle(rx + rw / 2, ry + rh / 2, rw * 0.08, L(cream));
      }
      // reversed gold lettering on the glass, seen from inside: an arc, then NEW & USED
      {
        const word = 'SDROCER EDIT WOL', cx = (win[0] + win[1]) / 2, N = word.length, col = '#f0b848', k = p.k(ZF);
        let g = '';
        for (let i = 0; i < N; i++) {
          const ch = word[i]; if (ch === ' ') continue;
          const u = (i + 0.5) / N - 0.5, x = cx + u * 2.75, y = 2.2 + Math.cos(u * 2.3) * 0.36 - 0.12;
          const [tx, ty] = p(x, y, ZF - 0.01);
          g += `<text transform="translate(${n(tx)},${n(ty)}) rotate(${n(u * 46)}) scale(-1,1)" font-size="${n(0.34 * k)}" text-anchor="middle">${ch}</text>`;
        }
        s += `<g font-family="${FONT.hand}" fill="${col}" stroke="#4a2408" stroke-width="1.2" paint-order="stroke">${g}</g>`;
        const [dx, dy] = p(cx, 1.86, ZF - 0.01);
        s += txt(0, 0, '· NEW & USED ·', { size: 0.2 * k, fill: col, font: FONT.hand, len: 1.5 * k, tr: `translate(${n(dx)},${n(dy)}) scale(-1,1)`, style: 'paint-order:stroke;stroke:#4a2408;stroke-width:1' });
      }
      // above the door, a hand-lettered board facing in
      { const [bx, by, bw, bh] = (() => { const a = p(door[0] - 0.05, 2.98, ZF - 0.02), b2 = p(door[1] + 0.05, 2.56, ZF - 0.02); return [a[0], a[1], b2[0] - a[0], b2[1] - a[1]]; })(); s += rect(bx, by, bw, bh, L('#efe6d2')) + rect(bx + 2, by + 2, bw - 4, bh - 4, 'none', { stroke: L('#a8322a'), strokeWidth: 1.2 }) + txt(bx + bw / 2, by + bh * 0.72, 'WE BUY LPs', { size: bh * 0.56, fill: L('#a8322a'), font: FONT.hand, len: bw * 0.86 }); }
      // the listening booth in the front corner: glass front, headphones on a hook
      {
        const x0 = 2.05, x1 = 3.0, z0 = 6.75, h = 2.32;
        s += box(p, x0, x1, 0, h, z0, ZF, { l: L('#7a4c2c'), front: L('#8a5a35') });
        s += poly(p.wz(z0, x0 + 0.1, x1 - 0.12, 0.95, h - 0.25), L('#e9cf98'));
        s += poly(p.wz(z0, x0 + 0.1, x1 - 0.12, 0.95, h - 0.25), '#fff6dc', { opacity: 0.25 });
        const [hx, hy] = p(x0 + 0.42, 1.72, z0 + 0.4), k = p.k(z0 + 0.4);
        s += K.line(hx, hy - 0.12 * k, hx, hy - 0.05 * k, '#3a2a20', 2);
        s += K.path(`M${n(hx - 0.09 * k)},${n(hy + 0.07 * k)} Q${n(hx)},${n(hy - 0.14 * k)} ${n(hx + 0.09 * k)},${n(hy + 0.07 * k)}`, 'none', { stroke: '#2a2224', strokeWidth: 3 });
        s += K.ellipse(hx - 0.09 * k, hy + 0.08 * k, 0.035 * k, 0.05 * k, '#e2702e') + K.ellipse(hx + 0.09 * k, hy + 0.08 * k, 0.035 * k, 0.05 * k, '#e2702e');
        s += K.path(`M${n(hx + 0.09 * k)},${n(hy + 0.12 * k)} q${n(0.06 * k)},${n(0.25 * k)} ${n(-0.02 * k)},${n(0.4 * k)}`, 'none', { stroke: '#2a2224', strokeWidth: 1.2 });
        const [sx2, sy2] = p(x0 + 0.6, 0.95, z0 + 0.6), k2 = p.k(z0 + 0.6);
        s += rect(sx2 - 0.16 * k2, sy2 - 0.06 * k2, 0.32 * k2, 0.06 * k2, L('#2a2224')) + K.ellipse(sx2, sy2 - 0.07 * k2, 0.11 * k2, 0.02 * k2, L('#151515'));
        s += K.path(pathD(p.wz(z0, x0 + 0.1, x1 - 0.12, 0.95, h - 0.25)), 'none', { stroke: L('#5a3a22'), strokeWidth: 3 });
        const [bx, by, bw, bh] = R(x0 + 0.05, x1 - 0.05, h - 0.22, h - 0.04, z0 - 0.01);
        s += rect(bx, by, bw, bh, L('#2a2224')) + txt(bx + bw / 2, by + bh * 0.76, 'LISTEN', { size: bh * 0.66, fill: L('#efc76a'), weight: 700, len: bw * 0.7, ls: 2 });
      }

      /* ---------- the sun on the floor, through the window ---------- */
      const sd = [0.12 / 0.55, 0.83 / 0.55];   // dx, dz per metre of height
      const floorPt = (x, y) => [x + sd[0] * y, ZF - sd[1] * y];
      {
        const q = (x0, x1, y0, y1) => { const a = floorPt(x0, y0), b = floorPt(x1, y0), c = floorPt(x1, y1), d = floorPt(x0, y1); return [p(a[0], 0.004, a[1]), p(b[0], 0.004, b[1]), p(c[0], 0.004, c[1]), p(d[0], 0.004, d[1])]; };
        let sun = '';
        for (const [x0, x1] of [[win[0], -1.32], [-1.26, -0.32], [-0.26, win[1]]]) sun += `<polygon points="${K.pts(q(x0, x1, win[2], win[3]))}"/>`;
        sun += `<polygon points="${K.pts(q(door[0] + 0.12, door[1] - 0.12, 1.0, 2.3))}"/>`;
        const sg = o.id('sunfloor'), [, yNear] = p(0, 0, floorPt(0, win[3])[1]), [, yFar] = p(0, 0, ZF - 0.5);
        s += `<defs><linearGradient id="${sg}" gradientUnits="userSpaceOnUse" x1="0" y1="${n(yFar)}" x2="0" y2="${n(yNear)}"><stop offset="0" stop-color="#fff0c0" stop-opacity="0.85"/><stop offset="1" stop-color="#ffd890" stop-opacity="0.3"/></linearGradient></defs>`;
        s += `<g fill="url(#${sg})" style="${screen}">${sun}</g>`;
        // shadows of the lettering inside the light
        let sh = '';
        for (let i = 0; i < 14; i++) { const u = (i + 0.5) / 15 - 0.5, fp = floorPt(-0.79 + u * 2.7, 2.2 + Math.cos(u * 2.2) * 0.3), c = p(fp[0], 0.005, fp[1]); sh += `<ellipse cx="${n(c[0])}" cy="${n(c[1])}" rx="${n(5 + rng() * 4)}" ry="2.2"/>`; }
        s += `<g fill="#6a4020" opacity="0.35">${sh}</g>`;
        // the shaft through the dusty air
        const A = p(win[0], win[3], ZF), B = p(win[1], win[3], ZF), fC = floorPt(win[1], win[3]), fD = floorPt(win[0], win[3]);
        s += K.shaft(o, [A, B, p(fC[0], 0, fC[1]), p(fD[0], 0, fD[1])], '#fff0c8', 0.2, 'beam', [0, 0, 0, 1]);
        s += halo(p(-0.8, 1.7, ZF)[0], p(-0.8, 1.7, ZF)[1], 420, 0.55, 260);
      }

      /* ---------- left wall: posters, LP covers, the guitar, the cat clock, crates of records ---------- */
      const LW = (z0, z1, y0, y1, dx = 0.01) => p.wx(XL + dx, z0, z1, y0, y1);
      // LP sleeves on a rail along the top
      const sleeveC = [P.mustard, P.teal, P.rust, '#e9e1cf', P.bruise, P.rose, '#2a3a5a', P.ember, '#c8463a', '#6b7a45', '#e9e1cf', P.slate, '#d9a441'];
      for (let i = 0; i < 13; i++) {
        const z0 = 2.7 + i * 0.4, c = sleeveC[i % sleeveC.length];
        s += poly(LW(z0, z0 + 0.32, 2.3, 2.62), S(c));
        if (i % 3 === 0) s += poly(LW(z0 + 0.08, z0 + 0.24, 2.4, 2.52, 0.012), S(K.adj(c, -0.35)));
        else if (i % 3 === 1) { const c2 = p(XL + 0.012, 2.46, z0 + 0.16); s += K.ellipse(c2[0], c2[1], 0.06 * p.k(z0) * (2.5 / z0), 0.09 * p.k(z0), S('#151515'), { opacity: 0.8 }); }
      }
      s += poly(LW(2.6, 8, 2.27, 2.3, 0.03), S('#5a3a22'));
      // posters: a few big ones at head height, flyers crowding the near end
      const posters = [[2.65, 3.25, 1.05, 2.15, '#2a3a5a'], [3.3, 3.75, 1.5, 2.2, '#e9e1cf'], [3.3, 3.75, 0.9, 1.45, P.rust], [3.85, 4.5, 1.1, 2.15, '#151515'], [4.7, 5.35, 1.2, 2.15, P.mustard], [5.6, 6.2, 1.2, 2.1, P.bruise], [6.5, 7.0, 1.25, 2.05, '#e9e1cf'], [7.25, 7.8, 1.2, 2.1, P.teal]];
      posters.forEach(([z0, z1, y0, y1, c], i) => {
        s += poly(LW(z0, z1, y0, y1), S(c));
        if (i === 3) { // a static-noise square, the Static Hours' sleeve art
          for (let j = 0; j < 30; j++) { const zz = z0 + 0.08 + rng() * (z1 - z0 - 0.16), yy = y0 + 0.4 + rng() * 0.5, a = p(XL + 0.015, yy, zz); s += rect(a[0], a[1], 2, 2, rng() < 0.5 ? '#e9e1cf' : '#6a6a6a'); }
        }
        if (i === 0) s += poly(LW(z0 + 0.08, z1 - 0.08, y1 - 0.4, y1 - 0.12, 0.015), S('#e8b04a'));
        if (i === 4) { const c2 = p(XL + 0.015, (y0 + y1) / 2, (z0 + z1) / 2); s += K.ellipse(c2[0], c2[1], 0.16 * p.k(z0) * (2.5 / z0), 0.24 * p.k(z0), S('#b5532e')); }
        if (i === 6) s += poly(LW(z0 + 0.05, z1 - 0.05, y0 + 0.1, y0 + 0.35, 0.015), S('#c8463a'));
        s += poly(LW(z0, z0 + 0.04, y1 - 0.04, y1, 0.016), '#f2ead6', { opacity: 0.8 });
      });
      for (let i = 0; i < 16; i++) { const z0 = 2.62 + rng() * 1.8, y0 = 0.55 + rng() * 1.5, w = 0.18 + rng() * 0.18; s += poly(LW(z0, z0 + w, y0, y0 + w * 1.3, 0.017), S(rng.pick(['#e9e1cf', '#f2d488', '#c98a8a', '#e9e1cf', '#9fb4cf'])), { opacity: 0.95 }); }
      s += wallText(p, XL + 0.02, 2.72, 3.2, 1.9, 0.11, 'STATIC', { fill: S('#e8b04a'), fit: 0.85 });
      // the cat clock: eyes, bow tie, pendulum tail
      {
        const zc = 4.25, yc = 2.38, cp = (dz, dy) => p(XL + 0.03, yc + dy, zc + dz), k = p.k(zc), sq = 2.5 / zc;
        const head = cp(0, 0.42), body = cp(0, 0.05);
        s += K.ellipse(body[0], body[1], 0.17 * k * sq, 0.36 * k, '#16141a') + K.ellipse(head[0], head[1], 0.15 * k * sq, 0.13 * k, '#16141a');
        const e1 = cp(-0.06, 0.44), e2 = cp(0.06, 0.44), ea = cp(-0.11, 0.56), eb = cp(0.11, 0.56);
        s += K.path(`M${n(ea[0] - 3)},${n(head[1] - 0.06 * k)} L${n(ea[0])},${n(ea[1] - 0.05 * k)} L${n(ea[0] + 0.05 * k * sq)},${n(head[1] - 0.09 * k)} Z M${n(eb[0] + 3)},${n(head[1] - 0.06 * k)} L${n(eb[0])},${n(eb[1] - 0.05 * k)} L${n(eb[0] - 0.05 * k * sq)},${n(head[1] - 0.09 * k)} Z`, '#16141a');
        s += K.ellipse(e1[0], e1[1], 0.035 * k * sq, 0.04 * k, '#f2ead6') + K.ellipse(e2[0], e2[1], 0.035 * k * sq, 0.04 * k, '#f2ead6');
        s += K.ellipse(e1[0] + 1, e1[1], 0.015 * k * sq, 0.03 * k, '#16141a') + K.ellipse(e2[0] + 1, e2[1], 0.015 * k * sq, 0.03 * k, '#16141a');
        const fc = cp(0, 0.12);
        s += K.ellipse(fc[0], fc[1], 0.11 * k * sq, 0.12 * k, '#f2ead6');
        s += K.line(fc[0], fc[1], fc[0] - 0.03 * k * sq, fc[1] - 0.07 * k, '#16141a', 1.6) + K.line(fc[0], fc[1], fc[0] + 0.05 * k * sq, fc[1] + 0.02 * k, '#16141a', 1.2);
        const bt = cp(0, 0.3); s += K.path(`M${n(bt[0] - 0.06 * k * sq)},${n(bt[1] - 0.03 * k)} L${n(bt[0] + 0.06 * k * sq)},${n(bt[1] + 0.03 * k)} L${n(bt[0] + 0.06 * k * sq)},${n(bt[1] - 0.03 * k)} L${n(bt[0] - 0.06 * k * sq)},${n(bt[1] + 0.03 * k)} Z`, '#c8463a');
        const tl0 = cp(0, -0.3), tl1 = cp(0.05, -0.6);
        s += K.path(`M${n(tl0[0])},${n(tl0[1])} Q${n(tl0[0] + 0.06 * k * sq)},${n((tl0[1] + tl1[1]) / 2)} ${n(tl1[0])},${n(tl1[1])}`, 'none', { stroke: '#16141a', strokeWidth: 3.5, strokeLinecap: 'round' });
      }
      // low crates of records along the wall
      for (let z = 2.7; z < 7.6; z += 0.95) {
        s += box(p, XL, XL + 0.55, 0, 0.62, z, z + 0.85, { top: S('#3a2a20'), r: K.adj(S(pine), -0.1), front: L(pine) });
        for (let j = 0; j < 14; j++) { const zz = z + 0.06 + j * 0.055, a = p(XL + 0.05, 0.7, zz + 0.04), b = p(XL + 0.5, 0.72, zz + 0.04), c = p(XL + 0.5, 0.5, zz), e = p(XL + 0.05, 0.5, zz); s += poly([a, b, c, e], S(rng.pick(sleeveC))); }
        s += poly(p.wz(z, XL, XL + 0.55, 0.35, 0.62), L(pine));
      }

      /* ---------- right wall: cassette racks, the counter, stereo shelves ---------- */
      const RW = (z0, z1, y0, y1, dx = 0.01) => p.wx(XR - dx, z0, z1, y0, y1);
      // cassette racks: slatted wood with rows of bright spines
      s += box(p, XR - 0.28, XR, 0, 2.25, 3.0, 4.6, { l: L(pine), front: L('#9a6a3a') });
      {
        const cc = ['#e9e1cf', '#c8463a', '#2a3a5a', '#d9a441', '#2e8b8b', '#151515', '#e88a6a', '#9fb4cf', '#f2d488'];
        for (let r = 0; r < 9; r++) {
          const y = 0.3 + r * 0.21;
          s += poly(RW(3.05, 4.55, y - 0.02, y, 0.29), S('#7a4c2c'));
          let d = '';
          const seg = [];
          for (let z = 3.08; z < 4.52; z += 0.035) seg.push(z);
          for (const z of seg) { const a = p(XR - 0.29, y + 0.02, z), b = p(XR - 0.29, y + 0.17, z); d += `M${n(a[0])},${n(a[1])} L${n(b[0])},${n(b[1])} `; }
          s += K.path(d, 'none', { stroke: L(cc[r % cc.length]), strokeWidth: 2.4, opacity: 0.9 });
          let d2 = ''; for (let i = 0; i < 12; i++) { const z = 3.1 + rng() * 1.4, a = p(XR - 0.29, y + 0.02, z), b = p(XR - 0.29, y + 0.17, z); d2 += `M${n(a[0])},${n(a[1])} L${n(b[0])},${n(b[1])} `; }
          s += K.path(d2, 'none', { stroke: L(rng.pick(cc)), strokeWidth: 2.6 });
        }
        const [hx, hy] = p(XR - 0.3, 2.42, 3.8);
        s += wallText(p, XR - 0.3, 4.4, 3.2, 2.32, 0.16, 'TAPES', { fill: L('#2a1a14'), fit: 0.8 });
        void hx; void hy;
      }
      // shelves behind the counter: a boombox, a tape deck, stacks of LPs, hand-lettered sign
      s += poly(RW(4.85, 6.7, 1.55, 1.6), L('#6b4a32')) + poly(RW(4.85, 6.7, 2.1, 2.15), L('#6b4a32'));
      s += poly(RW(5.0, 5.75, 1.6, 1.92, 0.05), L('#2a2a30')) + K.circle(...p(XR - 0.051, 1.76, 5.18), 6, L('#55555c')) + K.circle(...p(XR - 0.051, 1.76, 5.58), 6, L('#55555c'));
      s += poly(RW(5.95, 6.6, 1.6, 1.75, 0.04), L('#1d1d22'));
      for (let i = 0; i < 4; i++) s += poly(RW(5.05 + i * 0.32, 5.3 + i * 0.32, 2.15, 2.5 - (i % 2) * 0.08, 0.03), L(rng.pick(sleeveC)));
      // a sunburst electric guitar hung on two hooks above the counter
      {
        const zc = 5.4, yc = 2.52, g2 = (dz, dy) => p(XR - 0.04, yc + dy, zc + dz);
        const outline = [[-0.38, 0], [-0.35, 0.12], [-0.25, 0.19], [-0.12, 0.18], [0, 0.12], [0.12, 0.14], [0.27, 0.21], [0.31, 0.16], [0.22, 0.07], [0.36, 0.035], [0.36, -0.035], [0.24, -0.07], [0.31, -0.13], [0.22, -0.18], [0.08, -0.13], [-0.04, -0.16], [-0.2, -0.2], [-0.33, -0.15]];
        const body = outline.map(([dz, dy]) => g2(dz, dy)), inner = outline.map(([dz, dy]) => g2(dz * 0.62 - 0.03, dy * 0.6));
        s += K.path(pathD(body), L('#4a1e10')) + K.path(pathD(inner), L('#d9772e'), { opacity: 0.9 });
        s += K.path(pathD([[-0.24, -0.08], [-0.05, -0.12], [0.16, -0.06], [0.1, 0.06], [-0.1, 0.02]].map(([dz, dy]) => g2(dz, dy))), L('#efe6d2'));
        const n0 = g2(0.34, 0), n1 = g2(1.15, 0.02);
        s += K.line(n0[0], n0[1], n1[0], n1[1], L('#d9b07a'), 4.5);
        s += K.path(pathD([g2(1.12, -0.04), g2(1.36, -0.03), g2(1.38, 0.08), g2(1.12, 0.07)]), L('#2a1a14'));
        for (const dz of [0.2, 0.95]) { const h0 = g2(dz, 0.16), h1 = g2(dz, 0.24); s += K.line(h0[0], h0[1], h1[0], h1[1], L('#2a2a2e'), 2); }
      }
      // the counter
      const kx0 = 1.95, kx1 = 2.9, kz0 = 4.85, kz1 = 6.65, kh = 1.0;
      s += box(p, kx0, kx1, 0, kh, kz0, kz1, { l: L('#7a4c2c'), top: L('#5a3a2a'), front: L('#8a5a35') });
      { let d = ''; for (let z = kz0 + 0.3; z < kz1; z += 0.3) { const a = p(kx0 - 0.002, 0.05, z), b = p(kx0 - 0.002, kh - 0.05, z); d += `M${n(a[0])},${n(a[1])} L${n(b[0])},${n(b[1])} `; } s += K.path(d, 'none', { stroke: S('#7a4c2c'), strokeWidth: 1.2, opacity: 0.7 }); }
      // a flyer taped to the counter front
      s += poly(p.wx(kx0 - 0.004, 5.2, 5.62, 0.4, 0.85), L('#efe6d2')) + poly(p.wx(kx0 - 0.005, 5.25, 5.57, 0.66, 0.8), L('#c8463a'));
      s += wallText(p, kx0 - 0.006, 5.57, 5.25, 0.48, 0.1, 'RATS', { fill: L('#151515'), fit: 0.85 });
      {
        // turntable with a record on the platter
        const z = 5.25, [tx, ty] = p(2.42, kh, z), k = p.k(z), sq = (p.eye - kh) / z;
        s += K.path(pathD(p.wy(kh + 0.08, 2.08, 2.78, 4.95, 5.6)), L('#1d1d22')) + poly(p.wz(4.95, 2.08, 2.78, kh, kh + 0.08), L('#2a2a30'));
        const [cx, cy] = p(2.4, kh + 0.08, 5.27);
        s += K.ellipse(cx, cy, 0.17 * k, 0.17 * k * sq, '#0f0f12') + K.ellipse(cx, cy, 0.05 * k, 0.05 * k * sq, '#c8463a');
        s += K.ellipse(cx, cy, 0.13 * k, 0.13 * k * sq, 'none', { stroke: '#2a2a30', strokeWidth: 1 });
        const ta = p(2.68, kh + 0.12, 5.5), tb = p(2.5, kh + 0.1, 5.2);
        s += K.line(ta[0], ta[1], tb[0], tb[1], L('#c3c8cc'), 2) + K.circle(ta[0], ta[1], 3, L('#9aa0a6'));
        void tx; void ty;
      }
      {
        // the cash register: beige, a small amber display
        const z = 6.05, k = p.k(z);
        s += box(p, 2.15, 2.75, kh, kh + 0.22, 5.85, 6.45, { l: L('#d8cdb8'), top: L('#e6dcc8'), front: L('#cfc4ae') });
        s += box(p, 2.3, 2.7, kh + 0.22, kh + 0.42, 6.2, 6.45, { l: L('#d8cdb8'), top: L('#e6dcc8'), front: L('#cfc4ae') });
        const [dx, dy] = p(2.3, kh + 0.36, 6.2);
        s += rect(dx, dy, 0.18 * k, 0.06 * k, '#1b0f05') + txt(dx + 0.09 * k, dy + 0.05 * k, '8.99', { size: 0.05 * k, fill: P.sodium, font: FONT.type, len: 0.14 * k });
        let d = ''; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const q = p(2.2 + j * 0.12, kh + 0.225, 5.9 + i * 0.1); d += `M${n(q[0] - 2)},${n(q[1])} h4 `; }
        s += K.path(d, 'none', { stroke: L('#6a6458'), strokeWidth: 2 });
      }
      // a stack of LPs and a mug on the counter
      { const q = p(2.25, kh, 4.98), k = p.k(4.98); for (let i = 0; i < 5; i++) s += rect(q[0] - 0.16 * k, q[1] - (i + 1) * 0.018 * k, 0.32 * k, 0.016 * k, L(rng.pick(sleeveC))); }
      { const q = p(2.7, kh, 6.55), k = p.k(6.55); s += rect(q[0] - 0.04 * k, q[1] - 0.1 * k, 0.08 * k, 0.1 * k, L('#2e8b8b')); }

      /* ---------- the record bins down the middle ---------- */
      const bin = (x0, x1, z0, z1) => {
        let r = '';
        const h = 0.86, sh = floorPt(0, h);
        // shadow thrown toward us by the window light
        r += poly([p(x0, 0.003, z0), p(x1, 0.003, z0), p(x1 + sd[0] * h, 0.003, z0 - sd[1] * h * 0.55), p(x0 + sd[0] * h, 0.003, z0 - sd[1] * h * 0.55)], '#3a2210', { opacity: 0.35 });
        r += box(p, x0, x1, 0.12, h - 0.18, z0, z1, { top: L('#5a3a22'), l: L(pine), r: S(pine), front: S('#8a5a35') });
        for (const [lx, lz] of [[x0 + 0.05, z0 + 0.05], [x1 - 0.05, z0 + 0.05]]) { const a = p(lx, 0, lz), b = p(lx, 0.12, lz); r += K.line(a[0], a[1], b[0], b[1], S('#5a3a22'), Math.max(2, p.k(lz) * 0.05)); }
        // records standing in the bin: sleeve tops leaning back, divider tabs
        const N = Math.round((z1 - z0) / 0.045);
        let d = '';
        const cols = [];
        for (let i = 0; i < N; i++) {
          const z = z0 + 0.05 + (i * (z1 - z0 - 0.1)) / N, top = h - 0.02 + (rng() - 0.5) * 0.04;
          const a = p(x0 + 0.04, top, z + 0.04), b = p(x1 - 0.04, top, z + 0.04), c = p(x1 - 0.04, h - 0.2, z), e = p(x0 + 0.04, h - 0.2, z);
          cols.push(`<polygon points="${K.pts([a, b, c, e])}" fill="${L(rng.pick(sleeveC))}"/>`);
          d += `M${n(a[0])},${n(a[1])} L${n(b[0])},${n(b[1])} `;
        }
        r += cols.join('') + K.path(d, 'none', { stroke: '#2a1a10', strokeWidth: 0.8, opacity: 0.6 });
        // the near face of the bin box in front of the records
        r += poly(p.wz(z0, x0, x1, h - 0.3, h - 0.02), L(pine)) + poly(p.wz(z0, x0, x1, h - 0.3, h - 0.27), S(pine));
        void sh;
        return r;
      };
      s += bin(-1.45, -0.55, 5.4, 6.9) + bin(-0.35, 0.55, 5.4, 6.9);
      s += bin(-1.45, -0.55, 3.55, 5.05) + bin(-0.35, 0.55, 3.55, 5.05);
      // light from the window on the bins' tops
      s += `<g style="${screen}">` + K.pool(o, 700, 470, 260, 60, '#ffe6a8', 0.3, 'bintop') + '</g>';
      // divider cards
      for (const [x, z, t2] of [[-1.0, 4.3, 'ROCK'], [0.1, 4.3, 'JAZZ'], [-1.0, 6.2, 'NEW'], [0.1, 6.2, '45s']]) {
        const [cx, cy] = p(x, 0.95, z), k = p.k(z);
        s += rect(cx - 0.16 * k, cy - 0.06 * k, 0.32 * k, 0.11 * k, L('#efe6d2')) + txt(cx, cy + 0.035 * k, t2, { size: 0.085 * k, fill: L('#2a1a14'), weight: 700, len: 0.22 * k * Math.min(1, t2.length / 4) });
      }

      /* ---------- hanging posters + string lights under the ceiling ---------- */
      const hang = (x0, x1, y0, y1, z, draw) => {
        const [ax, ay] = p(x0, y1, z), [bx, by] = p(x1, y0, z);
        const [cx0, cy0] = p(x0 + 0.08, YC, z), [cx1, cy1] = p(x1 - 0.08, YC, z);
        let r = K.line(cx0, cy0, ax + (bx - ax) * 0.08, ay, '#2a1a14', 1) + K.line(cx1, cy1, bx - (bx - ax) * 0.08, ay, '#2a1a14', 1);
        r += rect(ax + 4, ay + 5, bx - ax, by - ay, '#1a0f08', { opacity: 0.25 });
        return r + draw(ax, ay, bx - ax, by - ay);
      };
      s += hang(-2.08, -1.26, 2.22, 3.14, 3.9, (x, y, w, h) => {
        let r = rect(x, y, w, h, L('#1e2a3a'));
        r += rect(x + w * 0.16, y + h * 0.36, w * 0.68, h * 0.42, L('#3a3a42'), { rx: 6 }) + rect(x + w * 0.22, y + h * 0.4, w * 0.56, h * 0.33, L('#9aa4ae'), { rx: 4 });
        for (let i = 0; i < 70; i++) r += rect(x + w * (0.22 + rng() * 0.54), y + h * (0.4 + rng() * 0.31), 2, 1.5, rng() < 0.5 ? '#f2f2ee' : '#3a3a42');
        r += K.line(x + w * 0.4, y + h * 0.36, x + w * 0.3, y + h * 0.27, L('#9aa4ae'), 1.5) + K.line(x + w * 0.6, y + h * 0.36, x + w * 0.7, y + h * 0.27, L('#9aa4ae'), 1.5);
        r += txt(x + w / 2, y + h * 0.13, 'THE STATIC', { size: h * 0.1, fill: L('#f2d488'), weight: 700, len: w * 0.8 });
        r += txt(x + w / 2, y + h * 0.24, 'HOURS', { size: h * 0.1, fill: L('#f2d488'), weight: 700, len: w * 0.5, ls: 2 });
        r += txt(x + w / 2, y + h * 0.9, 'LIVE · FRI OCT 25', { size: h * 0.055, fill: L('#e9e1cf'), font: FONT.type, len: w * 0.8 });
        return r;
      });
      s += hang(1.22, 2.0, 2.36, 3.16, 5.3, (x, y, w, h) => {
        let r = rect(x, y, w, h, L('#efe9dc'));
        r += K.path(`M${n(x + w * 0.18)},${n(y + h * 0.7)} q${n(w * 0.1)},${n(-h * 0.2)} ${n(w * 0.38)},${n(-h * 0.14)} q${n(w * 0.12)},${n(h * 0.02)} ${n(w * 0.18)},${n(h * 0.08)} l${n(w * 0.1)},${n(-h * 0.02)} l${n(-w * 0.06)},${n(h * 0.06)} q${n(-w * 0.2)},${n(h * 0.06)} ${n(-w * 0.6)},${n(h * 0.02)} Z`, L('#151515'));
        r += K.path(`M${n(x + w * 0.18)},${n(y + h * 0.7)} q${n(-w * 0.12)},${n(h * 0.1)} ${n(-w * 0.06)},${n(h * 0.18)}`, 'none', { stroke: L('#151515'), strokeWidth: 1.6 });
        r += txt(x + w / 2, y + h * 0.14, 'CANAL', { size: h * 0.12, fill: L('#c8263a'), weight: 700, len: w * 0.62 });
        r += txt(x + w / 2, y + h * 0.27, 'STREET RATS', { size: h * 0.1, fill: L('#c8263a'), weight: 700, len: w * 0.84 });
        r += txt(x + w / 2, y + h * 0.9, 'ALL AGES · VFW HALL', { size: h * 0.05, fill: L('#151515'), font: FONT.type, len: w * 0.84 });
        r += rect(x, y + h * 0.33, w, 1.5, L('#151515'), { opacity: 0.5 }) + rect(x + w * 0.62, y + h * 0.4, w * 0.3, h * 0.12, L('#151515'), { opacity: 0.85 });
        return r;
      });
      {
        // string lights looping across the ceiling
        const spans = [[XL, 2.6, XR, 4.2], [XR, 4.2, XL, 5.8], [XL, 5.8, XR, 7.4]];
        let wire = '', bulbs = '', glow = '';
        for (const [xa, za, xb, zb] of spans) {
          const pts = [];
          for (let i = 0; i <= 24; i++) { const u = i / 24, x = xa + (xb - xa) * u, z = za + (zb - za) * u, y = YC - 0.12 - Math.sin(u * Math.PI) * 0.38; pts.push([p(x, y, z), z]); }
          wire += 'M' + pts.map((q) => n(q[0][0]) + ',' + n(q[0][1])).join(' L') + ' ';
          pts.forEach(([q, z], i) => { if (i % 2) return; const k = p.k(z); bulbs += K.circle(q[0], q[1] + 0.05 * k, Math.max(1.6, 0.045 * k), i % 4 ? '#fff0c4' : '#ffc26a'); if (i % 4 === 0) glow += halo(q[0], q[1], 0.45 * k, 0.75); });
        }
        s += K.path(wire, 'none', { stroke: '#2a1a14', strokeWidth: 1.1, opacity: 0.8 }) + glow + bulbs;
      }

      /* ---------- dust in the sunbeam, warm corners ---------- */
      for (let i = 0; i < 46; i++) { const a = p(-2.2 + rng() * 2.9, 0.4 + rng() * 2.4, 3.5 + rng() * 4.3); s += K.circle(a[0], a[1], 0.7 + rng() * 1.2, '#fff4d8', { opacity: 0.3 + rng() * 0.45 }); }
      s += K.band(o, 0, 180, '#2a1808', 0.35, 0, 'ceil');
      s += K.band(o, 640, 260, '#1a0f06', 0, 0.35, 'floor');
      return s;
    }
  });

})();
