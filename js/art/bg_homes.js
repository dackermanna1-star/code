/* Homes — interiors at 9 Larch Street (Mémère's living room, Gus's room,
 * the upstairs hall, the attic), Teddy Okafor's bedroom, and the Ashgrove
 * front hall. Same hand as bg_larch.js: flat two-tone shapes, key light from
 * the upper left, warm light that never quite reaches the corners. */
(function () {
  'use strict';
  const K = window.KIT, P = K.PAL, n = K.n;

  const MARKER = "'Permanent Marker','Comic Sans MS',cursive";
  const HAND = "'Covered By Your Grace','Comic Sans MS',cursive";
  const SANS = "'Barlow Condensed','Arial Narrow',sans-serif";

  /* ---------------------------------------------------------------- */
  /* Light words the kit doesn't have. */
  const XTOD = {
    dawn: { mul: [0.56, 0.62, 0.78], addC: '#7d88a8', addT: 0.3, shadowMul: [0.72, 0.76, 0.9] },
    attic: { mul: [0.66, 0.58, 0.50], addC: '#3a2c22', addT: 0.14, shadowMul: [0.58, 0.58, 0.70] },
    lampnight: { mul: [0.58, 0.52, 0.52], addC: '#1c1a2c', addT: 0.18, shadowMul: [0.52, 0.52, 0.66] }
  };
  const tone = (c, t) => { const x = XTOD[t]; return x ? K.mix(K.mul(c, x.mul), x.addC, x.addT) : K.tone(c, t); };
  const shade = (c, t) => { const x = XTOD[t]; return x ? K.mul(tone(c, t), x.shadowMul) : K.shade(c, t); };

  /* ---------------------------------------------------------------- */
  /* o.id(name) is stable per name, so give every call its own suffix:
   * helpers below create many gradients, patterns and clips per render. */
  const U = (o) => { let c = 0; return Object.assign({}, o, { id: (s) => o.id(s + (++c).toString(36)) }); };

  /* small helpers */
  const F = (p) => n(p[0]) + ',' + n(p[1]);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dOf = (pts) => 'M' + pts.map(F).join(' L') + ' Z';
  const screen = (inner) => `<g style="mix-blend-mode:screen">${inner}</g>`;
  const txt = (x, y, str, { size = 16, fill = '#222', family = SANS, anchor = 'middle', weight, rot, opacity, ls, style } = {}) =>
    `<text x="${n(x)}" y="${n(y)}" font-family="${family}" font-size="${size}" fill="${fill}" text-anchor="${anchor}"` +
    `${weight ? ` font-weight="${weight}"` : ''}${ls !== undefined ? ` letter-spacing="${ls}"` : ''}${opacity !== undefined ? ` opacity="${opacity}"` : ''}` +
    `${style ? ` font-style="${style}"` : ''}${rot ? ` transform="rotate(${rot} ${n(x)} ${n(y)})"` : ''}>${K.esc(str)}</text>`;
  const clipWith = (o, shape, inner, name = 'cl') => {
    const id = o.id(name);
    return `<clipPath id="${id}">${shape}</clipPath><g clip-path="url(#${id})">${inner}</g>`;
  };
  const clipRect = (o, x, y, w, h, inner) => clipWith(o, `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"/>`, inner, 'cr');
  const clipPoly = (o, pts, inner) => clipWith(o, `<polygon points="${K.pts(pts)}"/>`, inner, 'cp');
  const clipPath = (o, d, inner) => clipWith(o, `<path d="${d}"/>`, inner, 'cpa');
  const pattern = (o, name, w, h, inner, extra = '') => {
    const id = o.id(name);
    return { def: `<defs><pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"${extra}>${inner}</pattern></defs>`, url: `url(#${id})` };
  };
  const lin = (o, name, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => {
    const id = o.id(name);
    return { def: K.defs(K.linear(id, stops, x1, y1, x2, y2)), url: `url(#${id})` };
  };
  const rad = (o, name, stops, cx, cy, r) => {
    const id = o.id(name);
    return { def: K.defs(K.radial(id, stops, cx, cy, r)), url: `url(#${id})` };
  };
  /* Darkness that pools away from a light source. */
  const falloff = (o, cx, cy, r, color, max = 0.6, inner = 0.2, name = 'fall') => {
    const g = rad(o, name, [[0, color, 0], [inner, color, 0], [1, color, max]], cx, cy, r);
    return g.def + K.rect(-10, -10, 1620, 920, g.url);
  };
  /* Scalloped ellipse (doilies, lace, shell edges). */
  const scallop = (cx, cy, rx, ry, N = 16, amp = 0.1) => {
    let d = '';
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * 6.2832, a1 = ((i + 0.5) / N) * 6.2832, a2 = ((i + 1) / N) * 6.2832;
      const p0 = [cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry];
      const c = [cx + Math.cos(a1) * rx * (1 + amp * 2), cy + Math.sin(a1) * ry * (1 + amp * 2)];
      const p2 = [cx + Math.cos(a2) * rx, cy + Math.sin(a2) * ry];
      d += (i === 0 ? `M${F(p0)}` : '') + ` Q${F(c)} ${F(p2)}`;
    }
    return d + ' Z';
  };
  /* Scalloped hem along a horizontal edge from x0 to x1 at y, bumps hanging down. */
  const hem = (x0, x1, y, bump, depth) => {
    let d = `M${n(x0)},${n(y)}`;
    for (let x = x0; x < x1 - 0.1; x += bump) d += ` Q${n(x + bump / 2)},${n(y + depth * 2)} ${n(Math.min(x1, x + bump))},${n(y)}`;
    return d;
  };

  /* Wallpaper motifs (screen-space pattern over a polygon). */
  const MOTIF = {
    sprig: (z, c, c2) => {
      const f = (x, y) => `<circle cx="${n(x)}" cy="${n(y - z * 0.07)}" r="${n(z * 0.06)}" fill="${c}"/><circle cx="${n(x - z * 0.065)}" cy="${n(y)}" r="${n(z * 0.06)}" fill="${c}"/><circle cx="${n(x + z * 0.065)}" cy="${n(y)}" r="${n(z * 0.06)}" fill="${c}"/>` +
        `<ellipse cx="${n(x - z * 0.08)}" cy="${n(y + z * 0.14)}" rx="${n(z * 0.08)}" ry="${n(z * 0.03)}" fill="${c2}" transform="rotate(-35 ${n(x - z * 0.08)} ${n(y + z * 0.14)})"/>` +
        `<ellipse cx="${n(x + z * 0.08)}" cy="${n(y + z * 0.13)}" rx="${n(z * 0.08)}" ry="${n(z * 0.03)}" fill="${c2}" transform="rotate(35 ${n(x + z * 0.08)} ${n(y + z * 0.13)})"/>`;
      return f(z / 2, z / 2) + f(0, 0) + f(z, 0) + f(0, z) + f(z, z);
    },
    daisy: (z, c, c2) => {
      const f = (x, y, r) => [0, 72, 144, 216, 288].map((a) => `<ellipse cx="${n(x)}" cy="${n(y - r * 0.55)}" rx="${n(r * 0.22)}" ry="${n(r * 0.5)}" fill="${c}" transform="rotate(${a} ${n(x)} ${n(y)})"/>`).join('') + `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.22)}" fill="${c2}"/>`;
      return f(z / 2, z / 2, z * 0.26) + f(0, 0, z * 0.18) + f(z, 0, z * 0.18) + f(0, z, z * 0.18) + f(z, z, z * 0.18);
    },
    damask: (z, c) => {
      const h = z / 2;
      const leaf = (x, y, s) => `<path d="M${n(x)},${n(y - s)} C${n(x + s * 0.55)},${n(y - s * 0.45)} ${n(x + s * 0.5)},${n(y + s * 0.35)} ${n(x)},${n(y + s)} C${n(x - s * 0.5)},${n(y + s * 0.35)} ${n(x - s * 0.55)},${n(y - s * 0.45)} ${n(x)},${n(y - s)} Z" fill="${c}"/>`;
      return leaf(h, h, z * 0.3) + `<circle cx="${n(h)}" cy="${n(h)}" r="${n(z * 0.06)}" fill="none" stroke="${c}" stroke-width="${n(z * 0.02)}"/>` +
        leaf(0, 0, z * 0.18) + leaf(z, 0, z * 0.18) + leaf(0, z, z * 0.18) + leaf(z, z, z * 0.18);
    },
    stripe: (z, c, c2) => `<rect x="0" y="0" width="${n(z * 0.12)}" height="${z}" fill="${c}"/><rect x="${n(z * 0.2)}" y="0" width="${n(z * 0.04)}" height="${z}" fill="${c2 || c}"/>`
  };
  const tileOf = (motif, size, c, c2) => ({ w: size, h: size, inner: MOTIF[motif](size, c, c2) });
  const paperOn = (o, poly, motif, c, c2, size, opacity) => {
    const p = pattern(o, 'wp', size, size, MOTIF[motif](size, c, c2));
    return p.def + K.poly(poly, p.url, { opacity });
  };

  /* ---------------------------------------------------------------- */
  /* A true one-point room. World X across (front plane = canvas pixels),
   * Y down (front plane = canvas pixels), d = depth behind the canvas.
   * Eye at (vx, vy, -D). Anything parallel to the back wall can be drawn
   * in world units inside R.at(d, ...), which applies the right scale. */
  function mkRoom({ vx = 800, vy = 280, D = 2400, depth = 2000, X0 = 0, X1 = 1600, Yc = 0, Yf = 900 } = {}) {
    const R = { vx, vy, D, depth, X0, X1, Yc, Yf };
    const z = (d) => 1 + d / D;
    const Pt = (X, Y, d) => { const k = 1 / z(d); return [vx + (X - vx) * k, vy + (Y - vy) * k]; };
    R.P = Pt; R.z = z; R.k = (d) => 1 / z(d);
    R.sx = (X, d) => Pt(X, 0, d)[0];
    R.sy = (Y, d) => Pt(0, Y, d)[1];
    R.vp = [vx, vy];
    const b = depth;
    R.back = [Pt(X0, Yc, b), Pt(X1, Yc, b), Pt(X1, Yf, b), Pt(X0, Yf, b)];
    R.left = [Pt(X0, Yc, 0), Pt(X0, Yc, b), Pt(X0, Yf, b), Pt(X0, Yf, 0)];
    R.right = [Pt(X1, Yc, 0), Pt(X1, Yc, b), Pt(X1, Yf, b), Pt(X1, Yf, 0)];
    R.ceil = [Pt(X0, Yc, 0), Pt(X1, Yc, 0), Pt(X1, Yc, b), Pt(X0, Yc, b)];
    R.floor = [Pt(X0, Yf, 0), Pt(X1, Yf, 0), Pt(X1, Yf, b), Pt(X0, Yf, b)];
    /* quads: back-parallel rect at depth d; vertical quad on plane X; horizontal quad on plane Y */
    R.qB = (x0, x1, y0, y1, d = b) => [Pt(x0, y0, d), Pt(x1, y0, d), Pt(x1, y1, d), Pt(x0, y1, d)];
    R.qX = (X, d0, d1, y0, y1) => [Pt(X, y0, d0), Pt(X, y0, d1), Pt(X, y1, d1), Pt(X, y1, d0)];
    R.qY = (Y, x0, x1, d0, d1) => [Pt(x0, Y, d0), Pt(x1, Y, d0), Pt(x1, Y, d1), Pt(x0, Y, d1)];
    /* draw in world units on the plane at depth d */
    R.at = (d, inner) => { const k = 1 / z(d); return `<g transform="matrix(${+k.toFixed(5)} 0 0 ${+k.toFixed(5)} ${n(vx * (1 - k))} ${n(vy * (1 - k))})">${inner}</g>`; };
    /* axis-aligned box; c = {f, t, b, l, r}; only faces turned to the eye are drawn */
    R.box = (x0, x1, y0, y1, d0, d1, c) => {
      let s = '';
      if (y0 > vy && c.t) s += K.poly(R.qY(y0, x0, x1, d0, d1), c.t);
      if (y1 < vy && c.b) s += K.poly(R.qY(y1, x0, x1, d0, d1), c.b);
      if (x1 < vx && c.r) s += K.poly(R.qX(x1, d0, d1, y0, y1), c.r);
      if (x0 > vx && c.l) s += K.poly(R.qX(x0, d0, d1, y0, y1), c.l);
      if (c.f) s += K.poly(R.qB(x0, x1, y0, y1, d0), c.f);
      return s;
    };
    /* a pattern laid on a receding vertical plane X: per-segment affine fit
     * of the perspective so florals and wallpaper foreshorten with the wall */
    R.patX = (o, X, d0, d1, y0, y1, tile, opacity = 1, seg = 300) => {
      const base = o.id('pb');
      let defs = `<pattern id="${base}" width="${tile.w}" height="${tile.h}" patternUnits="userSpaceOnUse">${tile.inner}</pattern>`, polys = '';
      const N = Math.max(1, Math.ceil(Math.abs(d1 - d0) / seg));
      for (let i = 0; i < N; i++) {
        const a0 = d0 + (d1 - d0) * i / N, a1 = d0 + (d1 - d0) * (i + 1) / N;
        const dm = (a0 + a1) / 2, Ym = (y0 + y1) / 2, zm = z(dm);
        const A = -(X - vx) / (zm * zm * D), B = -(Ym - vy) / (zm * zm * D), C = 1 / zm;
        const S0 = Pt(X, Ym, dm);
        const id = o.id('pp');
        defs += `<pattern id="${id}" href="#${base}" patternTransform="matrix(${A.toFixed(5)} ${B.toFixed(5)} 0 ${C.toFixed(5)} ${n(S0[0] - A * dm)} ${n(S0[1] - B * dm - C * Ym)})"/>`;
        polys += K.poly(R.qX(X, a0 - 0.5, a1 + 0.5, y0, y1), `url(#${id})`, opacity < 1 ? { opacity } : undefined);
      }
      return `<defs>${defs}</defs>` + polys;
    };
    /* affine fit of the projection around world point (X,Y,d) for local axes
     * u, v (world vectors): draw face details in local units inside it */
    R.aff = (X, Y, d, u, v) => {
      const k = 1 / z(d), kk = k * k / D;
      const dD = [-(X - vx) * kk, -(Y - vy) * kk];
      const a = u[0] * k + u[2] * dD[0], b = u[1] * k + u[2] * dD[1];
      const c = v[0] * k + v[2] * dD[0], e = v[1] * k + v[2] * dD[1];
      const S0 = Pt(X, Y, d);
      return `matrix(${a.toFixed(5)} ${b.toFixed(5)} ${c.toFixed(5)} ${e.toFixed(5)} ${n(S0[0])} ${n(S0[1])})`;
    };
    /* pattern on any planar world quad q = [A, B, C, D] (A->B = u, A->D = v),
     * split into segs strips along u, each with its own affine fit */
    R.patQuad = (o, q, tile, opacity = 1, segs = 4, bias = 1.5) => {
      const base = o.id('pq');
      let defs = `<pattern id="${base}" width="${tile.w}" height="${tile.h}" patternUnits="userSpaceOnUse">${tile.inner}</pattern>`, polys = '';
      const mixP = (p, r, t) => [lerp(p[0], r[0], t), lerp(p[1], r[1], t), lerp(p[2], r[2], t)];
      const [A, B, C, Dq] = q;
      const uV = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], vV = [Dq[0] - A[0], Dq[1] - A[1], Dq[2] - A[2]];
      const ul = Math.hypot(...uV), vl = Math.hypot(...vV);
      const uu = uV.map((x) => x / ul), vv = vV.map((x) => x / vl);
      for (let i = 0; i < segs; i++) {
        const t0 = Math.pow(i / segs, bias), t1 = Math.pow((i + 1) / segs, bias), tm = (t0 + t1) / 2;
        const cm = mixP(mixP(A, B, tm), mixP(Dq, C, tm), 0.5);
        const k = 1 / z(cm[2]), kk = k * k / D;
        const dd = [-(cm[0] - vx) * kk, -(cm[1] - vy) * kk];
        const a = uu[0] * k + uu[2] * dd[0], b = uu[1] * k + uu[2] * dd[1];
        const c = vv[0] * k + vv[2] * dd[0], e = vv[1] * k + vv[2] * dd[1];
        const S0 = Pt(cm[0], cm[1], cm[2]), pu = tm * ul, pv = vl / 2;
        const id = o.id('pqs');
        defs += `<pattern id="${id}" href="#${base}" patternTransform="matrix(${a.toFixed(5)} ${b.toFixed(5)} ${c.toFixed(5)} ${e.toFixed(5)} ${n(S0[0] - a * pu - c * pv)} ${n(S0[1] - b * pu - e * pv)})"/>`;
        const pts = [mixP(A, B, t0), mixP(A, B, t1), mixP(Dq, C, t1), mixP(Dq, C, t0)].map((p) => Pt(p[0], p[1], p[2]));
        polys += K.poly(pts, `url(#${id})`, opacity < 1 ? { opacity } : undefined);
      }
      return `<defs>${defs}</defs>` + polys;
    };
    /* box turned by ang (radians, 0 = facing the eye) about the vertical
     * axis, centred at (cx, cd). col = {f, k, l, r, t}. Returns
     * {svg, front: transform for local front-face drawing (u right, v down,
     * origin at the face centre)} */
    R.obox = (cx, cd, w, dep, y0, y1, ang, col) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const U = [ca, 0, -sa], N = [-sa, 0, -ca];
      const pt = (su, sn, y) => [cx + U[0] * su * w / 2 + N[0] * sn * dep / 2, y, cd + U[2] * su * w / 2 + N[2] * sn * dep / 2];
      const faces = [
        ['k', [pt(1, -1, y0), pt(-1, -1, y0), pt(-1, -1, y1), pt(1, -1, y1)], [-N[0], 0, -N[2]]],
        ['l', [pt(-1, -1, y0), pt(-1, 1, y0), pt(-1, 1, y1), pt(-1, -1, y1)], [-U[0], 0, -U[2]]],
        ['r', [pt(1, 1, y0), pt(1, -1, y0), pt(1, -1, y1), pt(1, 1, y1)], U],
        ['t', [pt(-1, -1, y0), pt(1, -1, y0), pt(1, 1, y0), pt(-1, 1, y0)], [0, -1, 0]],
        ['f', [pt(-1, 1, y0), pt(1, 1, y0), pt(1, 1, y1), pt(-1, 1, y1)], N]
      ];
      let svg = '';
      for (const [key, p, nr] of faces) {
        if (!col[key]) continue;
        const c = p.reduce((a, q) => [a[0] + q[0] / 4, a[1] + q[1] / 4, a[2] + q[2] / 4], [0, 0, 0]);
        if ((vx - c[0]) * nr[0] + (vy - c[1]) * nr[1] + (-D - c[2]) * nr[2] <= 0) continue;
        svg += K.poly(p.map((q) => Pt(q[0], q[1], q[2])), col[key]);
      }
      const fc = pt(0, 1, (y0 + y1) / 2);
      return { svg, front: R.aff(fc[0], fc[1], fc[2], U, [0, 1, 0]) };
    };
    /* horizontal ellipse (rugs, table tops) on plane Y */
    R.ellY = (Y, cx, cd, rx, rd, N = 36) => {
      const pts = [];
      for (let i = 0; i < N; i++) { const a = (i / N) * 6.2832; pts.push(Pt(cx + Math.cos(a) * rx, Y, cd + Math.sin(a) * rd)); }
      return dOf(pts);
    };
    /* floorboards converging to the eye point, plus staggered board ends */
    R.boards = (o, rng, { w = 70, color = '#000', opacity = 0.3, ends = 0.5, d0 = 0, d1 = b } = {}) => {
      let s = '';
      for (let X = X0 - w * 30; X <= X1 + w * 30; X += w) {
        const a = Pt(X, Yf, d0), c = Pt(X, Yf, d1);
        s += K.line(a[0], a[1], c[0], c[1], color, 1.4, { opacity });
        if (ends && X >= X0 && X < X1) {
          for (let dd = d0 + rng() * 500; dd < d1; dd += 300 + rng() * 700) {
            if (rng() > ends) continue;
            const p = Pt(X, Yf, dd), q = Pt(X + w, Yf, dd);
            s += K.line(p[0], p[1], q[0], q[1], color, 1.2, { opacity: opacity * 0.8 });
          }
        }
      }
      return clipPoly(o, R.floor, s);
    };
    return R;
  }

  /* ---------------------------------------------------------------- */
  /* Cardboard moving box in a room, optionally open, with a marker label. */
  const box3 = (o, R, L, S, { x0, x1, y0, y1, d0, d1, label = '', size = 30, open = false, sleeve = false, fill = null, rot = -2, c = '#b98d5a' }) => {
    let s = '';
    const Pp = R.P, lit = L(c), dk = S(c), tape = L('#d8bc86');
    if (x1 < R.vx) s += K.poly(R.qX(x1, d0, d1, y0, y1), dk);
    if (x0 > R.vx) s += K.poly(R.qX(x0, d0, d1, y0, y1), K.mix(dk, lit, 0.35));
    const cx = (x0 + x1) / 2;
    if (!open) {
      if (y0 > R.vy) s += K.poly(R.qY(y0, x0, x1, d0, d1), K.adj(lit, 0.08)) + K.poly(R.qY(y0, cx - 16, cx + 16, d0, d1), tape, { opacity: 0.85 });
    } else {
      const fd = (d1 - d0) * 0.5, fw = (x1 - x0) * 0.42;
      s += K.poly([Pp(x0, y0, d1), Pp(x1, y0, d1), Pp(x1, y0 - fd * 0.9, d1 + fd * 0.3), Pp(x0, y0 - fd * 0.9, d1 + fd * 0.3)], K.adj(dk, 0.05));
      const hole = R.qY(y0, x0, x1, d0, d1);
      s += K.poly(hole, K.adj(dk, -0.5));
      s += clipPoly(o, hole, K.poly(R.qB(x0, x1, y0, y0 + (y1 - y0) * 0.6, d1), K.adj(dk, -0.25)));
      if (fill) s += fill({ x0, x1, y0, y1, d0, d1 });
      s += K.poly([Pp(x0, y0, d0), Pp(x0, y0, d1), Pp(x0 - fw, y0 - fw * 0.55, d1), Pp(x0 - fw, y0 - fw * 0.55, d0)], K.mix(dk, lit, 0.5));
      s += K.poly([Pp(x1, y0, d0), Pp(x1, y0, d1), Pp(x1 + fw, y0 - fw * 0.55, d1), Pp(x1 + fw, y0 - fw * 0.55, d0)], dk);
    }
    let f = K.rect(x0, y0, x1 - x0, y1 - y0, lit) + K.rect(x0, y1 - 8, x1 - x0, 8, dk, { opacity: 0.5 });
    if (!open) f += K.rect(cx - 16, y0, 32, (y1 - y0) * 0.3, tape, { opacity: 0.85 });
    if (label) f += txt(cx, y0 + (y1 - y0) * 0.62, label, { size, fill: '#1d1d22', family: MARKER, rot });
    if (open) f += K.path(`M${x0},${y0} L${x1},${y0} L${x1 - 6},${y0 + (y1 - y0) * 0.26} L${x0 + 4},${y0 + (y1 - y0) * 0.24} Z`, K.adj(lit, -0.06)) + K.line(x0, y0 + 1, x1, y0 + 1, K.adj(lit, 0.15), 2);
    if (sleeve) {
      const sx = x1 - 4;
      f += K.path(`M${sx - 18},${y0 - 6} C${sx - 22},${y0 + 40} ${sx - 6},${y0 + 80} ${sx + 2},${y1 - 34} L${sx + 34},${y1 - 40} C${sx + 26},${y0 + 70} ${sx + 18},${y0 + 30} ${sx + 18},${y0 - 6} Z`, L('#a9763a'));
      f += K.path(`M${sx + 2},${y1 - 34} L${sx + 34},${y1 - 40} L${sx + 36},${y1 - 22} L${sx + 4},${y1 - 16} Z`, S('#a9763a'));
      for (let i = 0; i < 4; i++) f += K.line(sx + 6 + i * 8, y1 - 37 + i * -1.5, sx + 8 + i * 8, y1 - 19 + i * -1.5, K.adj(S('#a9763a'), -0.15), 1.5);
    }
    return s + R.at(d0, f);
  };
  /* Cassette cases standing in an open box, spines up. */
  const cassetteFill = (R, L, rng) => ({ x0, x1, y0, d0, d1 }) => {
    const cc = ['#c8462e', '#f2e6c8', '#3b5a8a', '#2a2a2e', '#d9a441', '#7a3a6a', '#e9e2d0', '#2e8b8b', '#b8b0a0'];
    let s = '';
    for (let d = d1 - 30; d > d0 + 10; d -= 46) {
      let row = '';
      for (let x = x0 + 8; x < x1 - 14; x += 15) {
        const h = 50 + rng() * 22;
        row += K.rect(x, y0 - h * 0.45, 13, h, L(cc[Math.floor(rng() * cc.length)])) + K.rect(x, y0 - h * 0.45, 13, 4, '#000', { opacity: 0.2 });
      }
      s += R.at(d, row);
    }
    return s;
  };

  /* An oil portrait of a dead Ashgrove, drawn at (x,y,w,h) in local units.
   * kind: patriarch | man | elder | woman. frame=false paints the canvas only. */
  const ashPortrait = (L, S, x, y, w, h, kind, rng, frame = true) => {
    const gilt = L('#a8843a'), giltS = S('#a8843a');
    let p = '';
    let ix = x, iy = y, iw = w, ih = h;
    if (frame) {
      p += K.rect(x, y, w, h, giltS) + K.rect(x + w * 0.035, y + h * 0.03, w * 0.93, h * 0.94, gilt) + K.rect(x + w * 0.08, y + h * 0.065, w * 0.84, h * 0.87, giltS);
      ix = x + w * 0.1; iy = y + h * 0.08; iw = w * 0.8; ih = h * 0.84;
    }
    const cx = ix + iw * 0.5;
    p += K.rect(ix, iy, iw, ih, L('#221c16')) + K.rect(ix, iy, iw * 0.55, ih * 0.7, L('#3a3022'), { opacity: 0.55 });
    const skin = L('#b88a66'), skinS = S('#b88a66'), dark = L('#16120e');
    const hr = iw * 0.16, hy = iy + ih * 0.33;
    // coat and collar
    p += K.path(`M${ix + iw * 0.06},${iy + ih} Q${ix + iw * 0.1},${iy + ih * 0.6} ${cx},${iy + ih * 0.56} Q${ix + iw * 0.9},${iy + ih * 0.6} ${ix + iw * 0.94},${iy + ih} Z`, L('#121010'));
    p += K.path(`M${cx + iw * 0.05},${iy + ih * 0.57} Q${ix + iw * 0.9},${iy + ih * 0.6} ${ix + iw * 0.94},${iy + ih} L${cx + iw * 0.12},${iy + ih} Z`, '#000', { opacity: 0.25 });
    if (kind === 'woman') p += K.path(`M${cx - hr * 0.9},${iy + ih * 0.56} Q${cx},${iy + ih * 0.66} ${cx + hr * 0.9},${iy + ih * 0.56} L${cx + hr * 0.5},${iy + ih * 0.53} Q${cx},${iy + ih * 0.58} ${cx - hr * 0.5},${iy + ih * 0.53} Z`, L('#d8d0c0')) + K.circle(cx, iy + ih * 0.62, hr * 0.12, L('#b8903e'));
    else p += K.path(`M${cx - hr * 0.7},${iy + ih * 0.54} L${cx - hr * 0.15},${iy + ih * 0.64} L${cx + hr * 0.15},${iy + ih * 0.64} L${cx + hr * 0.7},${iy + ih * 0.54} Z`, L('#ddd4c4')) + K.rect(cx - hr * 0.16, iy + ih * 0.58, hr * 0.32, ih * 0.04, dark);
    // neck, face with its shadow side
    p += K.rect(cx - hr * 0.42, hy + hr * 0.7, hr * 0.84, hr * 0.8, skinS);
    p += K.ellipse(cx, hy, hr * 0.78, hr * 1.02, skin);
    p += K.path(`M${cx + hr * 0.12},${hy - hr * 1.0} Q${cx + hr * 0.95},${hy - hr * 0.2} ${cx + hr * 0.3},${hy + hr * 1.0} Q${cx + hr * 0.5},${hy} ${cx + hr * 0.12},${hy - hr * 1.0} Z`, skinS);
    // hair
    const hairC = kind === 'elder' ? L('#b8b2a6') : kind === 'patriarch' ? L('#5a5048') : L('#241a14');
    if (kind === 'woman') p += K.path(`M${cx - hr * 0.86},${hy - hr * 0.05} Q${cx - hr * 0.95},${hy - hr * 1.25} ${cx},${hy - hr * 1.18} Q${cx + hr * 0.95},${hy - hr * 1.25} ${cx + hr * 0.86},${hy - hr * 0.05} Q${cx + hr * 0.6},${hy - hr * 0.75} ${cx},${hy - hr * 0.7} Q${cx - hr * 0.6},${hy - hr * 0.75} ${cx - hr * 0.86},${hy - hr * 0.05} Z`, hairC) + K.ellipse(cx, hy - hr * 1.12, hr * 0.42, hr * 0.26, hairC);
    else p += K.path(`M${cx - hr * 0.8},${hy - hr * 0.35} Q${cx - hr * 0.7},${hy - hr * 1.22} ${cx + hr * 0.1},${hy - hr * 1.14} Q${cx + hr * 0.82},${hy - hr * 1.02} ${cx + hr * 0.8},${hy - hr * 0.4} Q${cx + hr * 0.3},${hy - hr * 0.86} ${cx - hr * 0.8},${hy - hr * 0.35} Z`, hairC);
    // whiskers
    if (kind === 'patriarch' || kind === 'elder') {
      const bc = kind === 'elder' ? L('#d0cabe') : L('#6a6058');
      p += K.path(`M${cx - hr * 0.78},${hy - hr * 0.05} Q${cx - hr * 0.86},${hy + hr * 1.1} ${cx},${hy + hr * 1.45} Q${cx + hr * 0.86},${hy + hr * 1.1} ${cx + hr * 0.78},${hy - hr * 0.05} L${cx + hr * 0.62},${hy + hr * 0.35} Q${cx + hr * 0.3},${hy + hr * 0.62} ${cx},${hy + hr * 0.58} Q${cx - hr * 0.3},${hy + hr * 0.62} ${cx - hr * 0.62},${hy + hr * 0.35} Z`, bc);
      p += K.path(`M${cx - hr * 0.42},${hy + hr * 0.42} Q${cx},${hy + hr * 0.3} ${cx + hr * 0.42},${hy + hr * 0.42} Q${cx},${hy + hr * 0.52} ${cx - hr * 0.42},${hy + hr * 0.42} Z`, bc);
    }
    // stern features: brows pressed down, hard eyes, a flat mouth
    p += K.path(`M${cx - hr * 0.58},${hy - hr * 0.36} L${cx - hr * 0.12},${hy - hr * 0.24} L${cx - hr * 0.12},${hy - hr * 0.16} L${cx - hr * 0.58},${hy - hr * 0.26} Z`, dark) + K.path(`M${cx + hr * 0.58},${hy - hr * 0.36} L${cx + hr * 0.12},${hy - hr * 0.24} L${cx + hr * 0.12},${hy - hr * 0.16} L${cx + hr * 0.58},${hy - hr * 0.26} Z`, dark);
    p += K.ellipse(cx - hr * 0.33, hy - hr * 0.06, hr * 0.13, hr * 0.07, dark) + K.ellipse(cx + hr * 0.33, hy - hr * 0.06, hr * 0.13, hr * 0.07, dark);
    p += K.path(`M${cx - hr * 0.04},${hy - hr * 0.1} L${cx + hr * 0.14},${hy + hr * 0.28} L${cx - hr * 0.06},${hy + hr * 0.3} Z`, skinS);
    if (kind === 'woman' || kind === 'man') p += K.line(cx - hr * 0.26, hy + hr * 0.52, cx + hr * 0.26, hy + hr * 0.54, dark, hr * 0.06);
    p += K.rect(ix, iy, iw, ih, '#1a1008', { opacity: 0.16 }) + K.poly([[ix, iy], [ix + iw * 0.3, iy], [ix, iy + ih * 0.4]], '#ffffff', { opacity: 0.04 });
    return p;
  };

  /* ================================================================ */
  /* 1. Mémère's living room. Rose wallpaper over walnut wainscot, her
   * olive wingback turned to the front window with the afghan over it,
   * the console TV, the curio of Hummels, the photo wall with one empty
   * frame, the crucifix with last spring's palm, the sewing basket with
   * the Lantern Society sash, the plastic-covered sofa. */
  ART.bg('living', {
    times: ['evening', 'night'],
    light: { evening: 'interior_lamp', night: 'night' },
    draw(o) {
      o = U(o);
      const t = o.time, rng = o.rng, eve = t === 'evening';
      const L = (c) => tone(c, t), S = (c) => shade(c, t);
      const R = mkRoom({ vx: 800, vy: 260, D: 2500, depth: 2000, Yc: -60, Yf: 900 });
      const DB = R.depth, at = R.at;
      const paper = '#c49a8e', wain = '#6a4733', walnut = '#5b3a27', ceilC = '#ddd2bd', floorC = '#7a5236';
      const RAIL = 560;
      const mixR = (c) => K.mix(S(c), L(c), 0.3);
      let s = '';

      /* ---- shell ---- */
      s += K.poly(R.ceil, S(ceilC));
      const upB = R.qB(0, 1600, -60, RAIL);
      s += K.poly(upB, L(paper)) + K.poly(R.qX(0, 0, DB, -60, RAIL), S(paper)) + K.poly(R.qX(1600, 0, DB, -60, RAIL), mixR(paper));
      s += paperOn(o, upB, 'sprig', K.adj(L(paper), 0.18), K.adj(L(paper), -0.2), 30, 0.5);
      s += R.patX(o, 0, 0, DB, -60, RAIL, tileOf('sprig', 54, K.adj(S(paper), 0.1), K.adj(S(paper), -0.2)), 0.45);
      s += R.patX(o, 1600, 0, DB, -60, RAIL, tileOf('sprig', 54, K.adj(mixR(paper), 0.1), K.adj(mixR(paper), -0.2)), 0.45);
      // wainscot with raised panels
      s += K.poly(R.qB(0, 1600, RAIL, 900), L(wain)) + K.poly(R.qX(0, 0, DB, RAIL, 900), S(wain)) + K.poly(R.qX(1600, 0, DB, RAIL, 900), mixR(wain));
      let pan = '';
      for (let X = 40; X < 1560; X += 190) pan += K.rect(X + 14, 610, 162, 210, S(wain)) + K.rect(X + 22, 618, 146, 194, K.adj(L(wain), 0.04));
      s += at(DB, pan);
      for (let d = 60; d < DB - 100; d += 300) {
        s += K.poly(R.qX(0, d, d + 240, 610, 820), K.adj(S(wain), -0.12)) + K.poly(R.qX(0, d + 12, d + 228, 620, 810), S(wain));
        s += K.poly(R.qX(1600, d, d + 240, 610, 820), K.adj(mixR(wain), -0.12)) + K.poly(R.qX(1600, d + 12, d + 228, 620, 810), mixR(wain));
      }
      // moldings: crown, picture rail, chair rail, baseboard
      const strip = (y0, y1, c) => K.poly(R.qB(0, 1600, y0, y1), L(c)) + K.poly(R.qX(0, 0, DB, y0, y1), S(c)) + K.poly(R.qX(1600, 0, DB, y0, y1), mixR(c));
      s += strip(-60, -34, '#e8dcc6') + strip(-34, -28, walnut) + strip(30, 40, walnut) + strip(RAIL - 8, RAIL + 8, walnut) + strip(RAIL + 8, RAIL + 12, '#2a1a12') + strip(846, 900, walnut);
      // doorway to the front hall (left wall, near): the newel post in the dark
      s += K.poly(R.qX(0, 100, 660, 40, 900), L(walnut)) + K.poly(R.qX(0, 130, 630, 70, 900), eve ? '#1a120e' : '#05070c');
      const np = R.P(0, 0, 560);
      s += K.rect(np[0] - 40, 520, 22, 380, eve ? '#3a2618' : '#0b0d14') + K.ellipse(np[0] - 29, 518, 16, 9, eve ? '#4a3020' : '#0d1018');
      // an oval mirror on the left wall, holding a little of the light
      const mpts = [], mpts2 = [];
      for (let i = 0; i < 28; i++) { const a = (i / 28) * 6.2832; mpts.push(R.P(0, 250 + Math.sin(a) * 170, 1250 + Math.cos(a) * 170)); mpts2.push(R.P(0, 250 + Math.sin(a) * 146, 1250 + Math.cos(a) * 146)); }
      s += K.poly(mpts, L('#9a7a3e')) + K.poly(mpts2, eve ? K.mix(S('#8a9098'), '#c8a878', 0.25) : S('#6a7488'));
      s += K.poly([R.P(0, 150, 1180), R.P(0, 140, 1230), R.P(0, 330, 1300), R.P(0, 350, 1250)], '#ffffff', { opacity: eve ? 0.12 : 0.06 });
      // floor
      s += K.poly(R.floor, L(floorC));
      s += R.boards(o, rng, { w: 64, color: S('#3a2416'), opacity: 0.45 });
      // braided rug (mostly under the dialogue box)
      const rugC = ['#6e3e30', '#4a4a52', '#9a8050', '#5b3e2c', '#a8946e', '#6e3e30', '#525a68', '#8a5a3c', '#b4a07c'];
      for (let i = 0; i < rugC.length; i++) s += K.path(R.ellY(900, 760, 1040, 600 * (1 - i * 0.1), 420 * (1 - i * 0.1)), L(rugC[i]));
      for (let i = 0; i < rugC.length; i++) s += K.path(R.ellY(900, 760, 1040, 600 * (0.95 - i * 0.1), 420 * (0.95 - i * 0.1)), 'none', { stroke: S(rugC[i]), strokeWidth: 3, strokeDasharray: '5 6', opacity: 0.35 });

      /* ---- the front window (back wall), lace sheers, drapes ---- */
      const W0 = 400, W1 = 800, WT = 90, WB = 590;
      let win = '';
      win += K.rect(W0 - 34, WT - 40, W1 - W0 + 68, WB - WT + 52, L(walnut));
      win += K.rect(W0 - 34, WT - 40, W1 - W0 + 68, 12, K.adj(L(walnut), 0.1));
      win += K.rect(W0 - 48, WB + 6, W1 - W0 + 96, 16, K.adj(L(walnut), 0.06)) + K.rect(W0 - 48, WB + 22, W1 - W0 + 96, 6, S(walnut));
      // outside: Larch Street at dusk / at night
      const sky = lin(o, 'lvsky', eve ? [[0, '#1b2340'], [0.6, '#3d3a5f'], [1, '#7b5a6c']] : [[0, '#070b16'], [0.7, '#0f1729'], [1, '#1a243c']]);
      let view = sky.def + K.rect(W0, WT, W1 - W0, WB - WT, sky.url);
      if (!eve) view += K.glow(o, 480, 168, 110, '#b9c8e8', 0.4, 'lvmoon') + K.circle(480, 168, 15, '#e4e6ea', { opacity: 0.95 });
      const hc = eve ? '#251f33' : '#080c16';
      view += K.path(`M${W0},380 L470,330 L540,380 L540,360 L640,300 L740,360 L800,340 L800,${WB} L${W0},${WB} Z`, hc);
      view += K.rect(610, 390, 26, 30, eve ? '#e8b66c' : '#9a6a36', { opacity: 0.85 }) + K.rect(470, 400, 22, 26, eve ? '#c99a5c' : '#3a2c22', { opacity: 0.7 });
      view += K.path(`M${W0},470 Q560,455 ${W1},470 L${W1},${WB} L${W0},${WB} Z`, eve ? '#1a1626' : '#05080f');
      view += K.rect(728, 300, 5, 300, '#06080e') + K.path('M730,302 q-10,-14 -40,-10', 'none', { stroke: '#06080e', strokeWidth: 4 });
      view += K.glow(o, 690, 296, 90, P.sodium, eve ? 0.55 : 0.7, 'lvsl') + K.ellipse(690, 296, 10, 4, '#ffe6b8');
      win += clipRect(o, W0, WT, W1 - W0, WB - WT, view);
      const sashC = S(walnut);
      win += K.rect(W0, WT, W1 - W0, 10, sashC) + K.rect(W0, WB - 10, W1 - W0, 10, sashC) + K.rect(W0, WT, 10, WB - WT, sashC) + K.rect(W1 - 10, WT, 10, WB - WT, sashC);
      win += K.rect(W0, (WT + WB) / 2 - 9, W1 - W0, 18, sashC) + K.rect((W0 + W1) / 2 - 5, WT, 10, WB - WT, sashC);
      // lace sheers, gathered
      const lc = eve ? '#f0dcb2' : '#9aaccc';
      const lace = pattern(o, 'lace', 24, 24,
        `<path d="M12,4 L16,12 L12,20 L8,12 Z" fill="none" stroke="${lc}" stroke-width="1"/><circle cx="12" cy="12" r="1.6" fill="${lc}"/>` +
        `<circle cx="0" cy="0" r="3" fill="none" stroke="${lc}" stroke-width="1"/><circle cx="24" cy="0" r="3" fill="none" stroke="${lc}" stroke-width="1"/><circle cx="0" cy="24" r="3" fill="none" stroke="${lc}" stroke-width="1"/><circle cx="24" cy="24" r="3" fill="none" stroke="${lc}" stroke-width="1"/>`);
      win += lace.def + K.rect(W0 - 6, WT, W1 - W0 + 12, WB - WT - 8, lc, { opacity: eve ? 0.14 : 0.1 }) + K.rect(W0 - 6, WT, W1 - W0 + 12, WB - WT - 8, lace.url, { opacity: eve ? 0.4 : 0.35 });
      for (let x = W0; x < W1; x += 28) win += K.rect(x + 6, WT, 9, WB - WT - 10, lc, { opacity: 0.1 }) + K.rect(x + 19, WT, 5, WB - WT - 10, '#000', { opacity: 0.07 });
      win += K.path(hem(W0 - 6, W1 + 6, WB - 10, 20, 5) + ` L${W1 + 6},${WB - 30} L${W0 - 6},${WB - 30} Z`, lc, { opacity: 0.3 });
      // heavy drapes tied back, swagged valance
      const drC = '#3e5650';
      const drape = (side) => {
        const e = side < 0 ? W0 : W1, sg = side < 0 ? -1 : 1, x = (dx) => e + sg * dx;
        return K.path(`M${x(-40)},40 L${x(110)},40 C${x(105)},220 ${x(70)},360 ${x(40)},420 C${x(80)},520 ${x(120)},700 ${x(130)},880 L${x(-60)},880 C${x(-40)},700 ${x(-20)},520 ${x(-30)},430 C${x(-50)},360 ${x(-50)},200 ${x(-40)},40 Z`, L(drC)) +
          K.path(`M${x(40)},40 L${x(110)},40 C${x(105)},220 ${x(70)},360 ${x(40)},420 C${x(80)},520 ${x(120)},700 ${x(130)},880 L${x(70)},880 C${x(60)},700 ${x(40)},520 ${x(20)},430 C${x(40)},360 ${x(50)},200 ${x(40)},40 Z`, side < 0 ? S(drC) : K.adj(S(drC), -0.1)) +
          K.path(`M${x(-34)},412 Q${x(10)},440 ${x(46)},414 L${x(48)},428 Q${x(10)},454 ${x(-34)},426 Z`, L('#b8903e'));
      };
      win += drape(-1) + drape(1);
      const mid = (W0 + W1) / 2;
      win += K.path(`M${W0 - 80},30 H${W1 + 80} V70 Q${W1 + 40},120 ${mid + 100},84 Q${mid},130 ${mid - 100},84 Q${W0 - 40},120 ${W0 - 80},70 Z`, L(drC));
      win += K.path(`M${W0 - 80},62 Q${W0 - 40},112 ${mid - 100},76 Q${mid},122 ${mid + 100},76 Q${W1 + 40},112 ${W1 + 80},62 V70 Q${W1 + 40},120 ${mid + 100},84 Q${mid},130 ${mid - 100},84 Q${W0 - 40},120 ${W0 - 80},70 Z`, S(drC));
      win += K.rect(W0 - 90, 24, W1 - W0 + 180, 10, L('#b8903e'));
      s += at(DB, win);

      /* ---- curio cabinet with the Hummels (back wall, left) ---- */
      const CX0 = 10, CX1 = 250, CD0 = DB - 150;
      s += R.box(CX0, CX1, 210, 900, CD0, DB, { r: S(walnut), t: L(walnut) });
      let cur = '';
      cur += K.rect(CX0, 210, CX1 - CX0, 690, L(walnut));
      cur += K.path(`M${CX0 - 10},216 H${CX1 + 10} V196 Q${(CX0 + CX1) / 2},150 ${CX0 - 10},196 Z`, L(walnut)) + K.rect(CX0 - 10, 212, CX1 - CX0 + 20, 10, S(walnut));
      cur += K.circle((CX0 + CX1) / 2, 184, 9, K.adj(L(walnut), 0.12));
      const glass = lin(o, 'cglass', [[0, eve ? '#4a3a34' : '#141a28'], [1, eve ? '#2a2026' : '#0b0f18']]);
      cur += glass.def + K.rect(CX0 + 18, 240, CX1 - CX0 - 36, 470, glass.url);
      const fig = (x, y, h, c1, c2, kind) => {
        let f = K.path(`M${x - h * 0.22},${y} L${x - h * 0.16},${y - h * 0.62} Q${x},${y - h * 0.72} ${x + h * 0.16},${y - h * 0.62} L${x + h * 0.22},${y} Z`, c1);
        f += K.circle(x, y - h * 0.78, h * 0.15, L('#e9cfb4')) + K.path(`M${x - h * 0.2},${y - h * 0.82} Q${x},${y - h * 1.02} ${x + h * 0.2},${y - h * 0.82} Z`, c2);
        if (kind === 1) f += K.path(`M${x + h * 0.1},${y - h * 0.9} Q${x + h * 0.45},${y - h * 1.25} ${x + h * 0.8},${y - h * 0.9} Z`, c2) + K.line(x + h * 0.45, y - h * 1.0, x + h * 0.4, y - h * 0.45, c2, 1.5);
        if (kind === 2) f += K.ellipse(x + h * 0.32, y - h * 0.2, h * 0.16, h * 0.1, L('#f2ede2'));
        if (kind === 3) f += K.line(x - h * 0.3, y, x - h * 0.3, y - h * 1.1, L('#8a6a4a'), 1.6);
        return f;
      };
      const figC = [['#7f9bb8', '#5a6a4a'], ['#c98a8a', '#e9dcc0'], ['#8aa07a', '#6b4a3a'], ['#d9c49a', '#7f9bb8'], ['#b8a0c0', '#5a4a3a']];
      [355, 470, 590, 700].forEach((y, si) => {
        cur += K.rect(CX0 + 18, y, CX1 - CX0 - 36, 4, eve ? '#c9b89a' : '#3a4458', { opacity: 0.7 });
        if (si === 3) return;
        let x = CX0 + 44 + rng() * 10;
        while (x < CX1 - 36) {
          const c = figC[Math.floor(rng() * figC.length)];
          if (rng() < 0.22) cur += K.circle(x + 6, y - 44, 30, L('#e9e1d0'), { opacity: 0.85 }) + K.circle(x + 6, y - 44, 22, L('#8aa0b8'), { opacity: 0.5 });
          else cur += fig(x, y, 58 + rng() * 26, L(c[0]), L(c[1]), Math.floor(rng() * 4));
          x += 50 + rng() * 22;
        }
      });
      cur += K.path(`M${CX0 + 50},700 h34 q-2,22 -17,22 q-15,0 -17,-22 Z`, L('#efe6d6')) + K.path(`M${CX0 + 140},700 h34 q-2,22 -17,22 q-15,0 -17,-22 Z`, L('#e6d2d0'));
      cur += K.poly([[CX0 + 30, 240], [CX0 + 70, 240], [CX0 + 30, 330]], '#ffffff', { opacity: eve ? 0.08 : 0.05 });
      cur += K.rect((CX0 + CX1) / 2 - 3, 240, 6, 470, L(walnut)) + K.circle((CX0 + CX1) / 2 + 14, 480, 5, L(P.mustard));
      cur += K.rect(CX0, 720, CX1 - CX0, 160, K.adj(L(walnut), -0.06)) + K.rect(CX0 + 20, 740, (CX1 - CX0) / 2 - 30, 120, 'none', { stroke: S(walnut), strokeWidth: 4 }) + K.rect((CX0 + CX1) / 2 + 10, 740, (CX1 - CX0) / 2 - 30, 120, 'none', { stroke: S(walnut), strokeWidth: 4 });
      cur += K.path(scallop((CX0 + CX1) / 2, 218, 64, 8, 14, 0.25), L('#efe8da'), { opacity: 0.9 });
      s += at(CD0, cur);

      /* ---- cuckoo clock between the curio and the drapes ---- */
      let cc = '';
      const cx = 300;
      cc += K.line(cx - 14, 210, cx - 14, 330, '#2a1d14', 1.4) + K.line(cx + 14, 210, cx + 14, 290, '#2a1d14', 1.4);
      cc += K.path(`M${cx - 20},330 q6,-34 6,-34 q6,0 6,34 q-6,10 -12,0 Z`, L('#4a3020')) + K.path(`M${cx + 8},290 q6,-34 6,-34 q6,0 6,34 q-6,10 -12,0 Z`, L('#4a3020'));
      cc += K.line(cx, 200, cx, 300, '#2a1d14', 1.6) + K.path(`M${cx},300 q12,8 0,26 q-12,-18 0,-26 Z`, L('#4a3020'));
      cc += K.rect(cx - 40, 120, 80, 92, L(walnut)) + K.rect(cx + 10, 120, 30, 92, S(walnut));
      cc += K.path(`M${cx - 58},126 L${cx},74 L${cx + 58},126 L${cx + 50},132 L${cx},88 L${cx - 50},132 Z`, L('#3e2719'));
      cc += K.path(`M${cx - 8},72 q8,-18 16,-6 q-6,4 -2,10 Z`, L('#3e2719'));
      for (let i = 0; i < 5; i++) cc += K.ellipse(cx - 40 + i * 20, 210, 9, 5, L('#3e2719'));
      cc += K.circle(cx, 172, 22, L('#efe6d2')) + K.line(cx, 172, cx, 156, '#1a120c', 2) + K.line(cx, 172, cx + 12, 176, '#1a120c', 2);
      cc += K.path(`M${cx - 9},140 v-12 q9,-10 18,0 v12 Z`, S('#2a1a10'));
      s += at(DB, cc);

      /* ---- photo wall above the sofa: one frame stands empty ---- */
      let ph = '';
      const frame = (x, y, w, h, fc, inner) => K.rect(x - 8, y - 8, w + 16, h + 16, fc) + K.rect(x - 8, y + h + 4, w + 16, 4, K.adj(fc, -0.25)) + inner;
      const sitter = (x, y, w, h, bg, fg, skin) => K.rect(x, y, w, h, bg) + K.ellipse(x + w / 2, y + h * 0.95, w * 0.36, h * 0.34, fg) + K.ellipse(x + w / 2, y + h * 0.45, w * 0.17, h * 0.2, skin) + K.path(`M${x + w * 0.31},${y + h * 0.42} Q${x + w / 2},${y + h * 0.12} ${x + w * 0.69},${y + h * 0.42} Q${x + w / 2},${y + h * 0.3} ${x + w * 0.31},${y + h * 0.42} Z`, K.adj(fg, -0.2));
      const gilt = L('#b8903e'), dark = L('#3a2618');
      const PX = -110; // shift of the whole cluster
      ph += K.ellipse(PX + 1080, 262, 62, 80, gilt) + K.ellipse(PX + 1080, 262, 52, 70, L('#c9ae84'));
      ph += clipWith(o, `<ellipse cx="${PX + 1080}" cy="262" rx="52" ry="70"/>`, K.ellipse(PX + 1064, 262, 15, 19, L('#e6d6b8')) + K.ellipse(PX + 1062, 318, 28, 34, L('#2e2219')) + K.ellipse(PX + 1096, 258, 13, 17, L('#d9c4a0')) + K.ellipse(PX + 1100, 318, 28, 36, L('#f1e6cf')) + K.path(`M${PX + 1084},300 l16,-8 l16,8 l-16,40 Z`, L('#e9dcc4')), 'oval');
      ph += frame(PX + 1170, 190, 84, 108, dark, sitter(PX + 1170, 190, 84, 108, L('#6f86a6'), L('#7a3a3a'), L('#e3c3a6')));
      ph += frame(PX + 1290, 210, 132, 94, gilt, K.rect(PX + 1290, 210, 132, 94, L('#bdb6a8')) + K.rect(PX + 1290, 270, 132, 34, L('#8a857c')) + [0, 1, 2, 3].map((i) => K.ellipse(PX + 1310 + i * 30, 252, 9, 11, L('#4a4640')) + K.rect(PX + 1301 + i * 30, 262, 18, 34, L('#5a554e'))).join(''));
      // THE EMPTY ONE: gilt frame, mat, nothing in it
      ph += frame(PX + 1150, 330, 92, 116, gilt, K.rect(PX + 1150, 330, 92, 116, L('#efe4cc')) + K.rect(PX + 1162, 344, 68, 88, L('#f7efdc')) + K.rect(PX + 1150, 330, 92, 116, 'none', { stroke: K.adj(L('#efe4cc'), -0.12), strokeWidth: 2 }));
      ph += frame(PX + 1010, 372, 80, 96, dark, sitter(PX + 1010, 372, 80, 96, L('#8f9a86'), L('#5a6440'), L('#e0bc9c')));
      ph += frame(PX + 1290, 344, 76, 92, dark, K.rect(PX + 1290, 344, 76, 92, L('#d8cfc0')) + K.ellipse(PX + 1328, 410, 22, 30, L('#f6f1e6')) + K.circle(PX + 1328, 378, 12, L('#efd6c0')));
      ph += frame(PX + 1388, 340, 54, 70, gilt, sitter(PX + 1388, 340, 54, 70, L('#a88a6a'), L('#3a3a4a'), L('#d9b898')));
      // crucifix with the dried palm from Palm Sunday tucked behind
      const palm = L('#a8955e');
      ph += K.path(`M${PX + 1176},98 C${PX + 1206},120 ${PX + 1236},150 ${PX + 1262},196 L${PX + 1256},200 C${PX + 1230},156 ${PX + 1200},126 ${PX + 1172},104 Z`, palm);
      ph += K.path(`M${PX + 1250},88 C${PX + 1236},120 ${PX + 1222},150 ${PX + 1214},198 L${PX + 1208},196 C${PX + 1214},150 ${PX + 1228},118 ${PX + 1244},86 Z`, K.adj(palm, -0.12));
      ph += K.rect(PX + 1209, 66, 14, 112, L('#4a2e1c')) + K.rect(PX + 1180, 92, 72, 13, L('#4a2e1c')) + K.rect(PX + 1218, 66, 5, 112, S('#4a2e1c'));
      ph += K.path(`M${PX + 1216},96 l-26,6 l26,0 l26,-6 Z`, L('#e6dcc4')) + K.rect(PX + 1213, 98, 6, 40, L('#e6dcc4')) + K.circle(PX + 1216, 94, 4, L('#e6dcc4'));
      s += at(DB, ph);

      /* ---- the plastic-covered floral sofa against the back wall ---- */
      const flTile = (c) => ({ w: 64, h: 64, inner: `<rect width="64" height="64" fill="${c('#e2d3b6')}"/>` +
        `<circle cx="16" cy="16" r="9" fill="${c('#b8555a')}"/><circle cx="16" cy="16" r="4" fill="${c('#8c3b44')}"/><ellipse cx="28" cy="23" rx="8" ry="3.4" fill="${c('#6e7d52')}" transform="rotate(30 28 23)"/>` +
        `<circle cx="48" cy="47" r="7" fill="${c('#c98a7a')}"/><circle cx="48" cy="47" r="3" fill="${c('#a0525a')}"/><ellipse cx="37" cy="53" rx="7" ry="3" fill="${c('#6e7d52')}" transform="rotate(-30 37 53)"/><ellipse cx="50" cy="12" rx="6" ry="2.6" fill="${c('#6e7d52')}" transform="rotate(-60 50 12)"/>` });
      const tL = flTile(L), tS = flTile(S);
      const FL = pattern(o, 'flor', 64, 64, tL.inner), FS = pattern(o, 'flors', 64, 64, tS.inner);
      s += FL.def + FS.def;
      const SA = 840, SZ = 1250, SF = 1700, SBk = 1870;
      const plast = eve ? 0.2 : 0.11;
      // back cushions
      let sf = '';
      const sofaBackD = `M${SA + 20},740 L${SA + 20},584 Q${SA + 20},548 ${SA + 60},548 L${SZ - 60},548 Q${SZ - 20},548 ${SZ - 20},584 L${SZ - 20},740 Z`;
      sf += `<path d="${sofaBackD}" fill="${FL.url}"/>` + K.path(sofaBackD, '#000', { opacity: 0.08 });
      sf += K.line((SA + SZ) / 2, 556, (SA + SZ) / 2, 740, S('#7a6a50'), 3);
      sf += K.path(`M${SA + 40},560 Q${SA + 200},552 ${(SA + SZ) / 2 - 20},560`, 'none', { stroke: '#fff', strokeWidth: 5, opacity: plast }) + K.path(`M${(SA + SZ) / 2 + 20},560 Q${SZ - 200},552 ${SZ - 40},560`, 'none', { stroke: '#fff', strokeWidth: 5, opacity: plast });
      sf += K.path(`M${SA + 70},600 L${SA + 100},600 L${SA + 60},730 L${SA + 44},730 Z`, '#fff', { opacity: plast * 0.8 });
      // antimacassars
      sf += K.path(scallop(SA + 120, 552, 50, 10, 12, 0.3), L('#efe8da')) + K.path(scallop(SZ - 120, 552, 50, 10, 12, 0.3), L('#efe8da'));
      s += at(SBk, sf);
      // seat top, the arms' inner/outer sides
      s += K.poly(R.qY(735, SA + 64, SZ - 64, SF, SBk), FL.url) + K.poly(R.qY(735, SA + 64, SZ - 64, SF, SBk), '#fff', { opacity: 0.05 });
      s += R.patX(o, SZ - 64, SF, SBk + 80, 640, 735, tL, 1, 100) + K.poly(R.qX(SZ - 64, SF, SBk + 80, 640, 735), '#000', { opacity: 0.12 });
      s += R.patX(o, SA, SF, SBk + 80, 640, 880, tL, 1, 100);
      // fronts: skirt, cushions, rolled arms
      let ff = '';
      ff += K.rect(SA, 800, SZ - SA, 92, L('#cdb894'));
      for (let x = SA + 30; x < SZ; x += 46) ff += K.rect(x, 806, 3, 86, S('#cdb894'));
      ff += K.rect(SA, 800, SZ - SA, 7, S('#cdb894'));
      const cush = (x0, x1) => `<path d="M${x0},740 Q${x0},732 ${x0 + 10},731 L${x1 - 10},731 Q${x1},732 ${x1},740 L${x1},796 Q${x1},802 ${x1 - 8},802 L${x0 + 8},802 Q${x0},802 ${x0},796 Z" fill="${FL.url}"/>`;
      ff += cush(SA + 64, (SA + SZ) / 2) + cush((SA + SZ) / 2, SZ - 64);
      ff += K.line(SA + 70, 733, SZ - 70, 733, '#fff', 2.5, { opacity: plast * 1.4 });
      const arm = (x0, x1, lit) => {
        const d = `M${x0},892 L${x0},676 Q${x0 - 14},676 ${x0 - 14},656 Q${x0 - 14},634 ${(x0 + x1) / 2},632 Q${x1 + 14},634 ${x1 + 14},656 Q${x1 + 14},676 ${x1},676 L${x1},892 Z`;
        return `<path d="${d}" fill="${lit ? FL.url : FS.url}"/>` + K.path(`M${x0 - 14},656 Q${x0 - 14},634 ${(x0 + x1) / 2},632 Q${x1 + 14},634 ${x1 + 14},656 Q${x1 + 14},676 ${x1},676 L${x0},676 Q${x0 - 14},676 ${x0 - 14},656 Z`, '#000', { opacity: 0.1 }) +
          K.path(`M${x0 - 8},650 Q${x0},638 ${(x0 + x1) / 2},637`, 'none', { stroke: '#fff', strokeWidth: 4, opacity: plast * 1.3 }) + K.path(`M${x0 + 12},690 L${x0 + 22},690 L${x0 + 16},880 L${x0 + 8},880 Z`, '#fff', { opacity: plast });
      };
      ff += arm(SA, SA + 64, true) + arm(SZ - 64, SZ, true) + K.rect(SZ - 78, 630, 92, 262, '#000', { opacity: 0.12 });
      s += at(SF, ff);

      /* ---- the sewing basket on the sofa, the maroon sash over its arm ---- */
      const bx = SA + 150;
      let sb = '';
      sb += K.path(`M${bx - 54},700 Q${bx - 52},646 ${bx},640 Q${bx + 52},646 ${bx + 54},700 Z`, S('#a0784a'));
      sb += K.rect(bx - 36, 684, 13, 22, L('#3b6b8a')) + K.rect(bx - 20, 680, 13, 26, L('#d9c49a')) + K.circle(bx + 24, 692, 13, L('#b8403a')) + K.path(`M${bx + 18},680 l6,-6 l6,6 Z`, L('#5a7a3a'));
      for (let i = 0; i < 4; i++) sb += K.line(bx + 16 + i * 5, 684, bx + 12 + i * 7, 670, L('#d8d4cc'), 1);
      const wk = pattern(o, 'wicker', 10, 8, `<rect width="10" height="8" fill="${L('#b08a58')}"/><path d="M0,4 Q2.5,0 5,4 T10,4" stroke="${S('#b08a58')}" stroke-width="1.6" fill="none"/>`);
      sb += wk.def + K.path(`M${bx - 58},702 L${bx + 58},702 L${bx + 50},752 L${bx - 50},752 Z`, wk.url) + K.ellipse(bx, 702, 58, 6, L('#c49a62'));
      sb += K.path(`M${bx + 18},702 L${bx + 58},702 L${bx + 50},752 L${bx + 22},752 Z`, '#000', { opacity: 0.18 });
      s += at(SF + 60, sb);
      const sashM = '#6e1f2b';
      let sh2 = '';
      sh2 += K.path(`M${SA + 70},690 Q${SA + 40},622 ${SA + 10},630 Q${SA - 10},636 ${SA - 6},660 L${SA + 2},840 L${SA + 20},868 L${SA + 38},840 L${SA + 34},668 Q${SA + 40},654 ${SA + 70},716 Z`, L(sashM));
      sh2 += K.path(`M${SA + 22},668 L${SA + 34},668 L${SA + 38},840 L${SA + 20},868 Z`, S(sashM));
      sh2 += K.line(SA + 2, 806, SA + 36, 806, L('#c9a050'), 2) + K.line(SA + 2, 814, SA + 36, 814, L('#c9a050'), 1.4);
      const pinC = L('#d9b45a');
      const pin = (x, y) => K.circle(x, y - 22, 3.6, 'none', { stroke: pinC, strokeWidth: 2 }) + K.path(`M${x - 8},${y - 10} Q${x},${y - 20} ${x + 8},${y - 10} Z`, pinC) + K.rect(x - 7, y - 10, 14, 16, pinC) + K.rect(x - 4, y - 7, 8, 10, L('#f3e6c0')) + K.rect(x - 9, y + 6, 18, 4, pinC);
      sh2 += pin(SA + 16, 704);
      if (eve) sh2 += K.circle(SA + 12, 694, 2.4, '#fff6d8');
      s += at(SF - 4, sh2);

      /* ---- console TV turned into the back-right corner ---- */
      const tvA = Math.PI / 4, tcx = 1441, tcd = 1841;
      const walnutTV = '#6b4630';
      const TB = R.obox(tcx, tcd, 300, 150, 606, 868, tvA, { f: L(walnutTV), r: S(walnutTV), t: K.adj(L(walnutTV), 0.12) });
      s += TB.svg;
      let tv = '';
      tv += K.rect(-150, -131, 300, 8, K.adj(L(walnutTV), 0.12)) + K.rect(-150, 119, 300, 12, S(walnutTV));
      [-132, 118].forEach((x) => { tv += K.path(`M${x},131 l14,0 l-4,32 l-6,0 Z`, S('#3a2416')); });
      tv += K.rect(-138, -112, 196, 214, '#17140f', { rx: 14 });
      const scr = lin(o, 'tvscr', eve ? [[0, '#c9dcff'], [0.6, '#7d9ee0'], [1, '#4a64a6']] : [[0, '#e4ecff'], [1, '#98acd8']], 0, 0, 0.3, 1);
      tv += scr.def + K.rect(-128, -102, 176, 194, scr.url, { rx: 20 });
      if (eve) {
        tv += K.rect(-122, 0, 164, 86, '#3a4f9a', { opacity: 0.55, rx: 10 }) + K.rect(-108, -40, 36, 60, '#f2d27a', { opacity: 0.55 }) + K.rect(-58, -50, 36, 70, '#e9a07a', { opacity: 0.5 }) + K.rect(-8, -40, 36, 60, '#f2d27a', { opacity: 0.5 });
        tv += K.circle(-40, -70, 10, '#f6e6d6', { opacity: 0.7 });
      } else {
        const snow = pattern(o, 'snow', 22, 22, Array.from({ length: 26 }, () => `<rect x="${n(rng() * 22)}" y="${n(rng() * 22)}" width="${n(1 + rng() * 2.5)}" height="1.4" fill="${rng() < 0.5 ? '#ffffff' : '#56607a'}"/>`).join(''));
        tv += snow.def + K.rect(-128, -102, 176, 194, snow.url, { rx: 20, opacity: 0.9 });
      }
      tv += K.rect(-128, -102, 176, 194, 'none', { rx: 20, stroke: '#ffffff', strokeWidth: 3, opacity: 0.18 });
      const gr = pattern(o, 'grille', 7, 7, `<rect width="7" height="7" fill="${L('#a88e62')}"/><rect width="2" height="7" fill="${S('#a88e62')}"/>`);
      tv += gr.def + K.rect(70, -30, 66, 132, gr.url, { rx: 4 });
      tv += K.circle(103, -88, 15, L('#cfc8b8')) + K.circle(103, -88, 9, S('#cfc8b8')) + K.circle(103, -52, 10, L('#cfc8b8')) + K.rect(101, -102, 4, 10, S('#57534a'));
      s += `<g transform="${TB.front}">${tv}</g>`;
      // doily + rabbit ears on top (one tip in foil)
      const dpts = [];
      for (let i = 0; i < 40; i++) { const a = (i / 40) * 6.2832, r = 1 + 0.08 * Math.abs(Math.sin(a * 7)); dpts.push(R.P(tcx - 20 + Math.cos(a) * 95 * r, 606, tcd - 10 + Math.sin(a) * 55 * r)); }
      s += K.poly(dpts, L('#efe8da'));
      const rb = R.P(tcx - 10, 600, tcd), r1 = R.P(tcx - 150, 430, tcd - 30), r2 = R.P(tcx + 110, 410, tcd - 60);
      s += K.ellipse(rb[0], rb[1], 15, 6, L('#2a2420')) + K.line(rb[0] - 4, rb[1] - 3, r1[0], r1[1], L('#c9c6bc'), 2) + K.line(rb[0] + 4, rb[1] - 3, r2[0], r2[1], L('#c9c6bc'), 2);
      s += K.circle(r1[0], r1[1], 3, L('#d9d6cc')) + K.path(`M${n(r2[0] - 6)},${n(r2[1] + 2)} l6,-8 l8,4 l-3,9 l-8,1 Z`, L('#d8dadc'));

      /* ---- radiator on the right wall, Sacred Heart above it ---- */
      s += K.poly(R.qY(690, 1530, 1600, 1150, 1450), L('#b9b4a6')) + K.poly(R.qX(1530, 1150, 1450, 690, 880), L('#a9a497'));
      for (let d = 1165; d < 1450; d += 22) { const a = R.P(1530, 694, d), b = R.P(1530, 880, d); s += K.line(a[0], a[1], b[0], b[1], S('#a9a497'), 2.2); }
      s += K.poly(R.qB(1530, 1600, 690, 880, 1150), S('#a9a497')) + K.poly(R.qX(1530, 1150, 1450, 870, 880), S('#6a665c'));
      s += K.poly(R.qX(1600, 1130, 1470, 200, 440), L('#b8903e')) + K.poly(R.qX(1600, 1150, 1450, 218, 422), L('#5a2a26'));
      const shp = (u, v) => R.P(1600, lerp(218, 422, v), lerp(1150, 1450, u));
      s += K.poly([shp(0.28, 0.14), shp(0.72, 0.14), shp(0.82, 1), shp(0.18, 1)], L('#8a3a34')) + K.poly([shp(0.38, 0.14), shp(0.62, 0.14), shp(0.6, 0.36), shp(0.4, 0.36)], L('#e0c0a0'));
      s += K.circle(...shp(0.5, 0.56), 5, eve ? '#f2b45a' : L('#c98a5a'));

      /* ---- the lamp table and the fringed lamp ---- */
      const LX = 360, LD = 1720;
      let lt = '';
      lt += K.rect(LX - 74, 662, 148, 24, L(walnut)) + K.rect(LX - 74, 682, 148, 4, S(walnut));
      lt += K.rect(LX - 8, 686, 16, 172, L(walnut)) + K.rect(LX, 686, 8, 172, S(walnut)) + K.path(`M${LX - 60},898 Q${LX},846 ${LX + 60},898 Z`, L(walnut));
      lt += K.path(`M${LX - 84},664 h168 l-6,18 q-12,24 -24,0 q-12,24 -24,0 q-12,24 -24,0 q-12,24 -24,0 q-12,24 -24,0 q-12,24 -24,0 l-6,-18 Z`, L('#ece4d4'));
      lt += K.path(`M${LX - 26},660 q-10,-30 6,-56 q-14,-22 8,-42 h24 q22,20 8,42 q16,26 6,56 Z`, L('#b08a48')) + K.path(`M${LX + 4},660 q16,-30 6,-56 q12,-22 0,-42 h6 q22,20 8,42 q16,26 6,56 Z`, S('#b08a48'));
      lt += K.rect(LX - 3, 520, 6, 44, L('#9a7a40'));
      // a little prayer book and her glasses case beside the lamp
      lt += K.rect(LX + 34, 650, 34, 12, L('#2f3a52')) + K.rect(LX + 36, 648, 30, 3, L('#e8e0cc'));
      const shadeD = `M${LX - 60},446 L${LX + 60},446 Q${LX + 76},480 ${LX + 90},520 L${LX - 90},520 Q${LX - 76},480 ${LX - 60},446 Z`;
      if (eve) {
        const sg = lin(o, 'shade', [[0, '#fff2cf'], [1, '#f2c47e']]);
        lt += sg.def + K.path(shadeD, sg.url) + K.ellipse(LX, 520, 90, 8, '#fff6dc');
      } else lt += K.path(shadeD, L('#efe0c0')) + K.path(`M${LX + 10},446 L${LX + 60},446 Q${LX + 76},480 ${LX + 90},520 L${LX + 18},520 Z`, S('#efe0c0'));
      for (let x = LX - 88; x <= LX + 88; x += 6) lt += K.line(x, 521, x + (x - LX) * 0.03, 544, eve ? '#e8b46a' : L('#c9a878'), 2);
      lt += K.rect(LX - 90, 518, 180, 5, eve ? '#e2a85e' : L('#b8945e')) + K.circle(LX, 440, 6, L('#b08a48'));
      s += at(LD, lt);

      /* ---- her chair, turned to the window, the afghan over its back ---- */
      const AD = 1560, ax = 650, olive = '#5d6a43';
      let ac = '';
      ac += K.rect(ax - 152, 862, 18, 38, S('#2e2016')) + K.rect(ax + 134, 862, 18, 38, S('#2e2016'));
      ac += K.path(`M${ax - 178},870 L${ax - 178},650 Q${ax - 182},604 ${ax - 140},600 Q${ax - 104},604 ${ax - 108},650 L${ax - 108},870 Z`, L(olive));
      ac += K.path(`M${ax + 178},870 L${ax + 178},650 Q${ax + 182},604 ${ax + 140},600 Q${ax + 104},604 ${ax + 108},650 L${ax + 108},870 Z`, S(olive));
      const backD = `M${ax - 146},872 L${ax - 146},640 C${ax - 158},560 ${ax - 186},500 ${ax - 172},450 C${ax - 160},410 ${ax - 90},392 ${ax},390 C${ax + 90},392 ${ax + 160},410 ${ax + 172},450 C${ax + 186},500 ${ax + 158},560 ${ax + 146},640 L${ax + 146},872 Z`;
      ac += K.path(backD, L(olive));
      ac += clipPath(o, backD, K.rect(ax + 50, 380, 200, 500, S(olive)) + K.rect(ax - 146, 800, 292, 80, S(olive), { opacity: 0.5 }) + K.path(`M${ax - 120},520 Q${ax - 60},540 ${ax - 20},640`, 'none', { stroke: S(olive), strokeWidth: 3, opacity: 0.6 }));
      ac += K.rect(ax - 150, 828, 300, 44, K.adj(L(olive), -0.06)) + K.rect(ax + 50, 828, 100, 44, K.adj(S(olive), -0.06));
      // the afghan: granny squares folded over the top, a shell-stitch edge
      const shell = (x0, y0, x1, y1, N, dep) => { let d = ''; for (let i = 0; i < N; i++) { const a = i / N, b = (i + 1) / N; d += ` Q${n(lerp(x0, x1, (a + b) / 2))},${n(lerp(y0, y1, (a + b) / 2) + dep)} ${n(lerp(x0, x1, b))},${n(lerp(y0, y1, b))}`; } return d; };
      // the afghan: a crocheted ripple throw folded over the top and the left wing
      const afPts = [];
      const zig = (x0, y0, x1, y1, N, amp) => { const pts = []; for (let i = 0; i <= N; i++) { const t2 = i / N; pts.push([lerp(x0, x1, t2), lerp(y0, y1, t2) + (i % 2 ? amp : -amp)]); } return pts; };
      afPts.push(...zig(ax - 206, 652, ax + 138, 470, 12, 9));
      const afD = `M${ax + 132},400 C${ax + 60},374 ${ax - 80},370 ${ax - 150},396 C${ax - 178},412 ${ax - 188},440 ${ax - 192},470 L${ax - 204},560 L${ax - 206},652 ` + afPts.map((q) => 'L' + F(q)).join(' ') + ' Z';
      const rip = ['#8c3b2e', '#c4862e', '#e0cfa6', '#6b4a2e', '#7a7a48', '#d9a441', '#e0cfa6', '#a0522e'];
      let grid = '';
      for (let i = -8; i < 24; i++) {
        const y0 = 640 - i * 22;
        const pts = [];
        for (let x = ax - 320, j = 0; x <= ax + 260; x += 22, j++) pts.push([x, y0 + (j % 2 ? 9 : -9) - (x - (ax - 206)) * 0.53]);
        grid += `<polyline points="${K.pts(pts)}" fill="none" stroke="${L(rip[(i + 80) % rip.length])}" stroke-width="23" stroke-linejoin="miter"/>`;
      }
      grid += K.path(`M${ax - 230},470 L${ax - 168},470 L${ax - 168},680 L${ax - 230},680 Z`, '#fff1d8', { opacity: eve ? 0.1 : 0.03 });
      grid += K.path(`M${ax + 140},380 C${ax + 40},372 ${ax - 120},388 ${ax - 174},440 L${ax - 180},452 C${ax - 120},404 ${ax + 40},392 ${ax + 140},400 Z`, '#000', { opacity: 0.2 });
      grid += K.path(`M${ax + 60},380 L${ax + 160},380 L${ax + 160},500 L${ax + 60},500 Z`, '#0d0a10', { opacity: 0.22 });
      ac += clipPath(o, afD, grid);
      if (!eve) ac += K.path(`M${ax - 186},456 C${ax - 176},400 ${ax - 94},376 ${ax},374 C${ax + 90},392 ${ax + 160},410 ${ax + 172},450`, 'none', { stroke: '#a9bce0', strokeWidth: 5, opacity: 0.4 });
      ac += K.path(`M${ax + 120},470 C${ax + 140},520 ${ax + 128},600 ${ax + 116},680`, 'none', { stroke: K.adj(S(olive), -0.12), strokeWidth: 3, opacity: 0.5 });
      s += at(AD, ac);

      /* ---- light ---- */
      const lampP = R.P(LX, 486, LD), tvP = R.P(1360, 731, 1816);
      if (eve) {
        s += screen(K.glow(o, lampP[0], lampP[1], 460, '#ffcf86', 0.42, 'lampg'));
        s += K.shaft(o, [R.P(LX - 90, 520, LD), R.P(LX + 90, 520, LD), R.P(LX + 330, 900, LD - 320), R.P(LX - 330, 900, LD - 320)], '#ffd38a', 0.18, 'lampdown');
        s += K.shaft(o, [R.P(LX - 60, 446, LD), R.P(LX + 60, 446, LD), R.P(LX + 160, 250, DB), R.P(LX - 160, 250, DB)], '#ffe1a8', 0.2, 'lampup', [0, 1, 0, 0]);
        s += screen(K.glow(o, tvP[0], tvP[1], 260, '#8fb0f0', 0.3, 'tvg'));
        s += K.pool(o, tvP[0] - 40, 690, 260, 40, '#8fb0f0', 0.18, 'tvpool');
        s += falloff(o, lampP[0] + 170, lampP[1] - 30, 1150, '#120b08', 0.66, 0.22);
        s += K.band(o, 0, 160, '#1a120c', 0.5, 0, 'ceil');
      } else {
        const wb = R.P((W0 + W1) / 2, WB, DB);
        s += K.pool(o, wb[0], wb[1] + 30, 200, 26, '#9fb4e0', 0.18, 'moonfloor');
        s += screen(K.glow(o, R.P(mid, 300, DB)[0], R.P(mid, 300, DB)[1], 260, '#8fa8d8', 0.16, 'moonwin'));
        s += screen(K.glow(o, tvP[0], tvP[1], 520, '#7f9fe6', 0.42, 'tvg'));
        s += screen(K.glow(o, tvP[0], tvP[1], 160, '#c8d8ff', 0.4, 'tvg2'));
        s += K.pool(o, tvP[0] - 60, 700, 360, 60, '#8fb0f0', 0.25, 'tvpool');
        s += falloff(o, tvP[0] - 140, tvP[1] - 80, 1050, '#04060c', 0.72, 0.18);
        s += K.band(o, 0, 200, '#04060c', 0.55, 0, 'ceil');
      }
      return s;
    }
  });
  /* ================================================================ */
  /* 2. Gus's room: the back bedroom under the roof slope. Faded daisy
   * paper, the narrow iron bed and somebody's quilt, boxes she hasn't
   * unpacked, the boombox and the tapes, and a closet whose frame keeps
   * the heights of other children. */
  ART.bg('gus_room', {
    times: ['day', 'night', 'dawn'],
    light: { day: 'day', night: 'night', dawn: 'rain' },
    draw(o) {
      o = U(o);
      const t = o.time, rng = o.rng, night = t === 'night', dawn = t === 'dawn', day = t === 'day';
      const L = (c) => tone(c, t), S = (c) => shade(c, t);
      const R = mkRoom({ vx: 800, vy: 260, D: 2400, depth: 1500, Yc: -20, Yf: 900 });
      const DB = R.depth, at = R.at, Pp = R.P;
      const paper = '#d6c287', trim = '#e6ddc6', floorC = '#8f6e4c', ceilC = '#e6dcc6';
      const KX = 980, KY = 500;
      const mid = (c) => K.mix(S(c), L(c), 0.4);
      let s = '';

      /* ---- shell: flat ceiling, the slope, walls, floor ---- */
      const backPoly = [Pp(0, -20, DB), Pp(KX, -20, DB), Pp(1600, KY, DB), Pp(1600, 900, DB), Pp(0, 900, DB)];
      const slopeQ = [[KX, -20, -1300], [KX, -20, DB], [1600, KY, DB], [1600, KY, -1300]];
      s += K.poly([Pp(0, -20, 0), Pp(KX, -20, 0), Pp(KX, -20, DB), Pp(0, -20, DB)], S(ceilC));
      const plaster = '#e4dac2';
      s += K.poly(slopeQ.map((q) => Pp(...q)), K.mix(S(plaster), L(plaster), 0.45));
      s += K.shaft(o, [Pp(KX, -20, DB), Pp(1600, KY, DB), Pp(1600, KY, -1300), Pp(KX, -20, -1300)], '#000', 0.12, 'slsh', [0, 0, 1, 0]);
      s += K.poly(R.qX(0, 0, DB, -20, 900), S(paper));
      s += K.poly(backPoly, L(paper));
      s += K.poly(R.qX(1600, -1300, DB, KY, 900), mid(paper));
      const dz = (base) => tileOf('daisy', 56, K.adj(base, 0.16), K.mix(base, '#9a7a3a', 0.45));
      s += paperOn(o, backPoly, 'daisy', K.adj(L(paper), 0.16), K.mix(L(paper), '#9a7a3a', 0.45), 31, 0.5);
      s += R.patQuad(o, [[0, -20, 0], [0, -20, DB], [0, 900, DB], [0, 900, 0]], dz(S(paper)), 0.45, 6);
      s += R.patQuad(o, [[1600, KY, 0], [1600, KY, DB], [1600, 900, DB], [1600, 900, 0]], dz(mid(paper)), 0.45, 6);
      // an old water stain on the slope where the roof once leaked
      const st = Pp(1300, 220, 1150);
      s += K.path(K.blob(rng, st[0], st[1], 60, 30, { lobes: 6, jag: 0.3 }), '#7a5a2a', { opacity: 0.13 }) + K.path(K.blob(rng, st[0] + 6, st[1] + 4, 40, 18, { lobes: 5, jag: 0.3 }), '#7a5a2a', { opacity: 0.08 });
      // trim: corner boards, baseboards
      s += K.poly([Pp(KX, -20, DB), Pp(KX + 14, -8, DB), Pp(1600, KY + 12, DB), Pp(1600, KY, DB)], L(trim));
      s += K.poly(R.qB(0, 1600, 860, 900), L(trim)) + K.poly(R.qX(0, 0, DB, 860, 900), S(trim)) + K.poly(R.qX(1600, 0, DB, 860, 900), mid(trim));
      s += K.poly(R.qX(1600, -1300, DB, KY - 4, KY + 8), mid(trim));
      // floor: old pine boards
      s += K.poly(R.floor, L(floorC)) + R.boards(o, rng, { w: 74, color: S('#4a3424'), opacity: 0.4 });
      // rag rug by the bed
      const rugS = ['#7f8fa6', '#c98a8a', '#d9ccb0', '#6b7a8a', '#b8a080'];
      for (let i = 0; i < 9; i++) s += K.poly(R.qY(900, 860, 1260, 800 + i * 40, 840 + i * 40), L(rugS[i % rugS.length]), { opacity: 0.9 });
      // ceiling fixture, a frosted dome
      const cf = Pp(520, -20, 760);
      s += K.ellipse(cf[0], cf[1] + 6, 34, 9, L('#efe8d8')) + K.ellipse(cf[0], cf[1] + 2, 38, 5, S(ceilC));

      /* ---- the closet: four-panel door, the casing with pencil marks ---- */
      let cl = '';
      cl += K.rect(26, 106, 368, 794, L(trim));
      cl += K.rect(26, 106, 368, 12, K.adj(L(trim), 0.06));
      cl += K.rect(76, 154, 254, 746, L('#e3d8bf')) + K.rect(76, 154, 8, 746, S('#e3d8bf'));
      for (const [y0, y1] of [[190, 480], [540, 860]]) for (const [x0, x1] of [[106, 194], [214, 302]]) cl += K.rect(x0, y0, x1 - x0, y1 - y0, S('#e3d8bf')) + K.rect(x0 + 6, y0 + 6, x1 - x0 - 12, y1 - y0 - 12, L('#e3d8bf'));
      cl += K.circle(306, 520, 10, L('#c9a050')) + K.circle(303, 517, 3, '#fff2c8', { opacity: 0.5 });
      // pencil height marks on the right casing: two hands, years apart
      const g1 = L('#5a5650'), g2 = L('#8a8478');
      const marks = [[600, g2, 0], [574, g2, 0], [548, g1, 1], [522, g2, 0], [500, g1, 1], [478, g2, 0], [452, g1, 1], [436, g2, 0], [404, g1, 1], [372, g1, 1], [350, g2, 0], [318, g1, 1]];
      marks.forEach(([y, c, k]) => {
        const x0 = 336 + (k ? 0 : 6);
        cl += K.line(x0, y, x0 + 30, y + (rng() - 0.5) * 2, c, 2.4);
        let sc = `M${x0 + 33},${y - 1}`;
        for (let j = 0; j < 3; j++) sc += ` q${n(2 + rng() * 2)},${n(-5 - rng() * 3)} ${n(4 + rng() * 2)},${n(rng() * 2 - 1)}`;
        cl += K.path(sc, 'none', { stroke: c, strokeWidth: 1.4 });
      });
      s += at(DB, cl);

      /* ---- the band poster, one corner come loose ---- */
      let po = '';
      const PXa = 440, PYa = 196, PW = 220, PH = 290;
      po += K.rect(PXa + 6, PYa + 8, PW, PH, '#000', { opacity: 0.12 });
      const pg = `M${PXa},${PYa} H${PXa + PW - 64} L${PXa + PW},${PYa + 70} V${PYa + PH} H${PXa} Z`;
      po += K.path(pg, L('#20222c'));
      po += clipPath(o, pg, K.circle(PXa + PW / 2, PYa + 118, 76, L('#c8562e')) + K.circle(PXa + PW / 2, PYa + 118, 76, 'none', { stroke: L('#e9a24e'), strokeWidth: 6 }) +
        Array.from({ length: 8 }, (_, i) => K.rect(PXa, PYa + 58 + i * 16, PW, 5, L('#20222c'))).join('') +
        K.rect(PXa + 18, PYa + 112, PW - 36, 3, L('#efe4cc'), { opacity: 0.8 }));
      po += txt(PXa + PW / 2, PYa + 236, 'THE STATIC', { size: 38, fill: L('#efe4cc'), weight: 700, ls: 1 });
      po += txt(PXa + PW / 2, PYa + 272, 'HOURS', { size: 38, fill: L('#e9a24e'), weight: 700, ls: 8 });
      po += K.path(`M${PXa + PW - 64},${PYa} L${PXa + PW - 8},${PYa + 84} L${PXa + PW},${PYa + 70} Z`, L('#d8d0c0')) + K.path(`M${PXa + PW - 64},${PYa} L${PXa + PW - 8},${PYa + 84} L${PXa + PW - 24},${PYa + 82} Z`, S('#d8d0c0'));
      po += K.rect(PXa - 14, PYa - 8, 46, 16, L('#e2d2a6'), { opacity: 0.9, transform: `rotate(-30 ${PXa + 8} ${PYa})` });
      po += K.rect(PXa - 12, PYa + PH - 10, 44, 16, L('#e2d2a6'), { opacity: 0.9, transform: `rotate(25 ${PXa + 10} ${PYa + PH})` });
      po += K.rect(PXa + PW - 26, PYa + PH - 8, 44, 16, L('#e2d2a6'), { opacity: 0.9, transform: `rotate(-25 ${PXa + PW} ${PYa + PH})` });
      s += at(DB, po);

      /* ---- the window onto Larch Street ---- */
      const W0 = 860, W1 = 1150, WT = 156, WB = 536;
      let wn = '';
      wn += K.rect(W0 - 30, WT - 32, W1 - W0 + 60, WB - WT + 50, L(trim)) + K.rect(W0 - 44, WB + 12, W1 - W0 + 88, 16, K.adj(L(trim), 0.04)) + K.rect(W0 - 44, WB + 28, W1 - W0 + 88, 5, S(trim));
      const skyStops = day ? [[0, '#c6d0d8'], [1, '#e8e4d8']] : night ? [[0, '#090f1e'], [1, '#1b2642']] : [[0, '#56658a'], [0.65, '#a99db4'], [1, '#e4c2b0']];
      const sk = lin(o, 'gsky', skyStops);
      let v = sk.def + K.rect(W0, WT, W1 - W0, WB - WT, sk.url);
      if (night) v += K.glow(o, W0 + 50, WT + 46, 70, '#b8c6e6', 0.35, 'gmoon') + K.circle(W0 + 50, WT + 46, 12, '#e6e8ec');
      const hcol = day ? '#8a8f8a' : night ? '#0c111d' : '#3d3f56';
      v += K.path(`M${W0 - 10},${WB - 70} L${W0 + 70},${WB - 150} L${W0 + 150},${WB - 70} Z`, day ? '#5a5250' : night ? '#080b14' : '#2c2c40') + K.rect(W0, WB - 72, 140, 80, hcol);
      v += K.rect(W0 + 30, WB - 50, 26, 34, night ? '#c99a52' : day ? '#4a5260' : '#5a5060', { opacity: night ? 0.8 : 1 });
      v += K.path(K.blob(rng, W1 - 30, WB - 110, 80, 70, { lobes: 7, jag: 0.25 }), day ? '#c8743a' : night ? '#0a0d16' : '#3a2e3e');
      v += K.path(K.blob(rng, W1 - 60, WB - 140, 40, 34, { lobes: 6, jag: 0.25 }), day ? '#dd9a4a' : night ? '#0d111c' : '#4a3a48', { opacity: 0.9 });
      // the streetlight
      const slx = W0 + 176, sly = WT + 150;
      v += K.rect(slx + 30, sly, 5, WB - sly, day ? '#4a4a4e' : '#0a0c12') + K.path(`M${slx + 32},${sly + 2} q-8,-16 -34,-10`, 'none', { stroke: day ? '#4a4a4e' : '#0a0c12', strokeWidth: 4 });
      v += K.ellipse(slx - 4, sly - 6, 14, 5, day ? '#3a3a40' : '#0a0c12');
      if (!day) v += K.glow(o, slx - 4, sly - 2, night ? 110 : 60, P.sodium, night ? 0.75 : 0.45, 'gsl') + K.ellipse(slx - 4, sly - 2, 9, 3.5, '#ffe8be');
      wn += clipRect(o, W0, WT, W1 - W0, WB - WT, v);
      // sashes
      const sc2 = L('#efe7d4');
      wn += K.rect(W0, WT, W1 - W0, 9, sc2) + K.rect(W0, WB - 9, W1 - W0, 9, sc2) + K.rect(W0, WT, 9, WB - WT, sc2) + K.rect(W1 - 9, WT, 9, WB - WT, sc2) + K.rect(W0, (WT + WB) / 2 - 8, W1 - W0, 16, sc2);
      wn += K.poly([[W0 + 30, WB - 9], [W0 + 90, WB - 9], [W0 + 40, (WT + WB) / 2 + 8], [W0 + 14, (WT + WB) / 2 + 8]], '#fff', { opacity: day ? 0.12 : 0.05 });
      // roller shade, a quarter down, yellowed
      wn += K.rect(W0 - 6, WT - 4, W1 - W0 + 12, 86, L('#e6d4a4')) + K.rect(W0 - 6, WT + 78, W1 - W0 + 12, 6, S('#c9b07a'));
      wn += K.line((W0 + W1) / 2, WT + 84, (W0 + W1) / 2, WT + 104, S('#8a7a5a'), 1.5) + K.circle((W0 + W1) / 2, WT + 108, 5, 'none', { stroke: S('#8a7a5a'), strokeWidth: 2 });
      if (day) wn += K.rect(W0 - 6, WT - 4, W1 - W0 + 12, 86, '#fff4d8', { opacity: 0.2 });
      s += at(DB, wn);

      /* ---- the desk under the window ---- */
      const DK0 = 820, DK1 = 1190, DD0 = DB - 190;
      const deskC = '#7a5236';
      s += R.box(DK0, DK1, 640, 670, DD0, DB - 10, { t: K.adj(L(deskC), 0.08) });
      let dk = '';
      dk += K.rect(DK0, 640, DK1 - DK0, 30, L(deskC)) + K.rect(DK0, 666, DK1 - DK0, 4, S(deskC));
      dk += K.rect(DK0 + 4, 670, 136, 222, L(deskC)) + K.rect(DK1 - 30, 670, 26, 222, S(deskC));
      dk += K.rect(DK0 + 140, 670, DK1 - DK0 - 170, 222, K.adj(S(deskC), -0.35));
      for (let i = 0; i < 3; i++) dk += K.rect(DK0 + 14, 680 + i * 72, 116, 62, S(deskC)) + K.rect(DK0 + 18, 684 + i * 72, 108, 54, L(deskC)) + K.rect(DK0 + 58, 706 + i * 72, 28, 6, L('#c9a050'));
      s += at(DD0, dk);
      // things on the desk (drawn mid-depth)
      let it = '';
      // cassette towers
      const cassC = ['#c8462e', '#f2e6c8', '#3b5a8a', '#2a2a2e', '#d9a441', '#7a3a6a', '#e9e2d0', '#2e8b8b', '#b8b0a0', '#1a1a20'];
      for (let i = 0; i < 9; i++) it += K.rect(852 + (rng() - 0.5) * 4, 630 - i * 10, 60, 9, L(cassC[(i * 3) % cassC.length])) + K.rect(852, 630 - i * 10 + 7, 60, 2, S('#2a2a2e'), { opacity: 0.4 });
      for (let i = 0; i < 6; i++) it += K.rect(1110 + (rng() - 0.5) * 4, 630 - i * 10, 60, 9, L(cassC[(i * 7 + 2) % cassC.length])) + K.rect(1110, 630 - i * 10 + 7, 60, 2, S('#2a2a2e'), { opacity: 0.4 });
      it += K.rect(1124, 568, 9, 14, L('#efe4cc'), { transform: 'rotate(-12 1128 575)' }) + K.rect(1140, 566, 54, 9, L('#c8462e'), { transform: 'rotate(-8 1167 570)' });
      // the boombox
      const bb = '#2c2e33', bbx = 924, bby = 546, bbw = 180, bbh = 92;
      it += K.path(`M${bbx + 20},${bby} Q${bbx + bbw / 2},${bby - 46} ${bbx + bbw - 20},${bby}`, 'none', { stroke: L('#55585e'), strokeWidth: 6 });
      it += K.line(bbx + bbw - 16, bby, bbx + bbw + 50, bby - 120, L('#b8bcc2'), 2);
      it += K.rect(bbx, bby, bbw, bbh, L(bb), { rx: 10 }) + K.rect(bbx, bby + bbh - 14, bbw, 14, S(bb), { rx: 6 });
      for (const cx2 of [bbx + 38, bbx + bbw - 38]) it += K.circle(cx2, bby + 50, 30, L('#3a3d44')) + K.circle(cx2, bby + 50, 30, 'none', { stroke: L('#6a6e76'), strokeWidth: 2 }) + K.circle(cx2, bby + 50, 12, S('#1a1b1f')) + K.circle(cx2, bby + 50, 4, L('#55585e'));
      it += K.rect(bbx + 74, bby + 22, 32, 38, L('#141519')) + K.rect(bbx + 78, bby + 30, 24, 14, L('#5a5f68'), { opacity: 0.6 }) + K.rect(bbx + 82, bby + 34, 16, 6, L('#efe4cc'));
      for (let i = 0; i < 5; i++) it += K.rect(bbx + 70 + i * 9, bby - 6, 7, 7, L('#9aa0a8'));
      it += K.rect(bbx + 74, bby + 66, 32, 6, L('#c8462e'), { opacity: 0.8 });
      if (!day) it += K.circle(bbx + 112, bby + 14, 2.2, '#ff5a3a');
      // Walkman and the orange foam headphones
      it += K.rect(872, 612, 62, 26, L('#4a6a8a'), { rx: 3 }) + K.rect(877, 617, 30, 13, L('#20242a')) + K.rect(912, 616, 16, 6, L('#c8ccd2'));
      it += K.path('M946,630 Q984,568 1024,628', 'none', { stroke: L('#3a3a40'), strokeWidth: 5 }) + K.circle(946, 626, 18, L(P.ember)) + K.circle(1024, 626, 18, L(P.ember)) + K.circle(946, 626, 7, S(P.ember)) + K.circle(1024, 626, 7, S(P.ember));
      it += K.path('M906,630 C920,660 960,650 980,640', 'none', { stroke: L('#2a2a2e'), strokeWidth: 1.5 });
      // gooseneck desk lamp, off
      it += K.ellipse(1168, 637, 22, 6, L('#3a4a3a')) + K.path('M1168,634 C1170,560 1150,500 1112,488', 'none', { stroke: L('#3a4a3a'), strokeWidth: 5 });
      it += K.path('M1086,500 L1122,466 L1146,492 Q1124,516 1086,500 Z', L('#3e5a46')) + K.path('M1104,500 L1132,478 L1146,492 Q1128,512 1104,500 Z', S('#3e5a46'));
      s += at(DB - 110, it);

      /* ---- nightstand and the clock radio ---- */
      const NS0 = 1200, NS1 = 1296, ND0 = DB - 130;
      s += R.box(NS0, NS1, 650, 900, ND0, DB - 10, { t: K.adj(L('#6b4a32'), 0.1), l: S('#6b4a32') });
      let ns = K.rect(NS0, 650, NS1 - NS0, 250, L('#6b4a32')) + K.rect(NS0 + 8, 668, NS1 - NS0 - 16, 60, S('#6b4a32')) + K.circle((NS0 + NS1) / 2, 698, 5, L('#c9a050'));
      s += at(ND0, ns);
      const clockT = day ? '1:42' : night ? '2:13' : '5:48';
      let cr = K.rect(1204, 604, 80, 46, L('#5a3e2c'), { rx: 4 }) + K.rect(1210, 610, 46, 26, '#120c0c') + K.rect(1260, 610, 18, 34, S('#5a3e2c'));
      cr += txt(1233, 631, clockT, { size: 19, fill: '#ff4a2a', family: "'Courier New',monospace", weight: 700 });
      if (!day) cr += K.glow(o, 1233, 624, 46, '#ff3a1a', night ? 0.35 : 0.25, 'crg');
      s += at(ND0 + 40, cr);

      /* ---- the narrow iron bed, a handmade quilt ---- */
      const B0 = 1312, B1 = 1588, BH = DB - 20, BF = 720, iron = '#2b3034';
      let hb = '';
      for (const x of [B0, B1]) hb += K.rect(x - 10, 470, 20, 430, L(iron)) + K.circle(x, 462, 14, L('#b8903e'));
      hb += K.path(`M${B0},508 Q${(B0 + B1) / 2},466 ${B1},508`, 'none', { stroke: L(iron), strokeWidth: 9 }) + K.rect(B0, 644, B1 - B0, 9, L(iron));
      for (let x = B0 + 34; x < B1 - 20; x += 34) hb += K.rect(x - 3, 500 - 18 * Math.sin(Math.PI * (x - B0) / (B1 - B0)), 6, 150, L(iron));
      s += at(BH, hb);
      // pillow
      s += R.box(B0 + 16, B1 - 16, 604, 652, BH - 130, BH - 10, { t: L('#eee8dc'), f: L('#e6dfd0') });
      // quilt: patchwork on top and down the open side
      const qc = ['#7f93ad', '#c98a7a', '#e6dcc0', '#9aa47a', '#d9b46a', '#b07a6a', '#e6dcc0', '#6f7f98'];
      let qi = `<rect width="160" height="160" fill="${L('#e6dcc0')}"/>`;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) qi += `<rect x="${c * 40 + 1}" y="${r * 40 + 1}" width="38" height="38" fill="${L(qc[(r * 5 + c * 3) % qc.length])}"/>`;
      qi += `<path d="M0,40 H160 M0,80 H160 M0,120 H160 M40,0 V160 M80,0 V160 M120,0 V160" stroke="${S('#e6dcc0')}" stroke-width="2" stroke-dasharray="4 3"/>`;
      const qiS = qi.replace(/fill="(#[0-9a-f]{6})"/g, (m, c2) => `fill="${K.mix(c2, '#1a2030', 0.28)}"`);
      s += R.patQuad(o, [[B0, 650, BF + 20], [B0, 650, BH - 130], [B1, 650, BH - 130], [B1, 650, BF + 20]], { w: 160, h: 160, inner: qi }, 1, 6);
      s += R.patQuad(o, [[B0, 650, BF + 20], [B0, 650, BH - 120], [B0, 800, BH - 120], [B0, 800, BF + 20]], { w: 160, h: 160, inner: qiS }, 1, 6);
      s += K.poly(R.qX(B0, BF + 20, BH - 120, 794, 800), S('#c9b48e'));
      // folded top edge of the quilt near the pillow
      s += K.poly(R.qY(648, B0, B1, BH - 170, BH - 130), L('#efe6d4')) + K.poly(R.qX(B0, BH - 170, BH - 130, 648, 690), S('#efe6d4'));
      // footboard
      let fb = '';
      for (const x of [B0, B1]) fb += K.rect(x - 10, 640, 20, 260, L(iron)) + K.circle(x, 634, 13, L('#b8903e'));
      fb += K.rect(B0, 650, B1 - B0, 9, L(iron)) + K.rect(B0, 790, B1 - B0, 8, L(iron));
      for (let x = B0 + 34; x < B1 - 20; x += 34) fb += K.rect(x - 2.5, 659, 5, 131, L(iron));
      s += at(BF, fb);
      // the open TAPES box sits on the end of the bed
      s += box3(o, R, L, S, { x0: 1330, x1: 1520, y0: 516, y1: 650, d0: BF + 110, d1: BF + 290, label: 'GUS — TAPES', size: 23, open: true, fill: cassetteFill(R, L, rng) });

      /* ---- the boxes she hasn't unpacked ---- */
      s += box3(o, R, L, S, { x0: 130, x1: 350, y0: 736, y1: 900, d0: 880, d1: 1070, label: 'BOOKS', size: 34 });
      s += box3(o, R, L, S, { x0: 146, x1: 336, y0: 580, y1: 736, d0: 895, d1: 1060, label: 'WINTER', size: 31, open: true, sleeve: true });

      /* ---- door to the hall (left wall, near) ---- */
      s += K.poly(R.qX(0, 100, 620, 110, 900), L(trim)) + K.poly(R.qX(0, 130, 590, 140, 900), S('#e3d8bf'));
      for (const [d0, d1] of [[170, 340], [380, 550]]) s += K.poly(R.qX(0, d0, d1, 190, 470), K.adj(S('#e3d8bf'), -0.08)) + K.poly(R.qX(0, d0, d1, 540, 860), K.adj(S('#e3d8bf'), -0.08));
      const kn = Pp(0, 520, 545);
      s += K.circle(kn[0] + 6, kn[1], 8, L('#c9a050'));
      // a flannel shirt on a hook beside it
      const hk = Pp(0, 300, 740);
      s += K.path(`M${n(hk[0])},${n(hk[1])} l26,30 l6,130 l-30,20 l-18,-30 Z`, S('#8c3b3b')) + K.path(`M${n(hk[0] + 8)},${n(hk[1] + 40)} l14,0 m-14,30 l18,0 m-18,30 l20,0`, 'none', { stroke: S('#2a1a1a'), strokeWidth: 3 });

      /* ---- light ---- */
      const wc = Pp((W0 + W1) / 2, (WT + WB) / 2, DB);
      if (day) {
        s += screen(K.glow(o, wc[0], wc[1], 420, '#f4f0e4', 0.32, 'gwin'));
        s += K.shaft(o, [Pp(W0, WB, DB), Pp(W1, WB, DB), Pp(W1 + 260, 900, 450), Pp(W0 - 180, 900, 450)], '#f6f2e6', 0.16, 'gday');
        s += falloff(o, wc[0], wc[1] + 60, 1200, '#2a2a34', 0.4, 0.3);
      } else if (night) {
        s += K.shaft(o, [Pp(W0 + 9, WB - 9, DB), Pp(W1 - 9, WB - 9, DB), Pp(W1 + 120, 900, 520), Pp(W0 - 260, 900, 520)], P.sodium, 0.14, 'gsod');
        s += K.shaft(o, [Pp(W0 + 9, WT + 90, DB), Pp((W0 + W1) / 2, WT + 90, DB), Pp(1500, 700, 820), Pp(1150, 760, 720)], '#9fb4e0', 0.1, 'gmoonf', [0, 0, 1, 0.6]);
        s += K.pool(o, Pp(1000, 900, 640)[0], Pp(1000, 900, 640)[1], 300, 50, P.sodium, 0.16, 'gpool');
        s += screen(K.glow(o, wc[0], wc[1], 300, '#f2b45a', 0.16, 'gwin'));
        s += falloff(o, wc[0], wc[1] + 40, 1050, '#04060c', 0.66, 0.15);
        s += K.band(o, 0, 220, '#04060c', 0.5, 0, 'gceil');
      } else {
        s += screen(K.glow(o, wc[0], wc[1], 460, '#c8cce0', 0.26, 'gwin'));
        s += K.shaft(o, [Pp(W0, WB, DB), Pp(W1, WB, DB), Pp(W1 + 240, 900, 450), Pp(W0 - 200, 900, 450)], '#c8d0e6', 0.12, 'gdawn');
        s += falloff(o, wc[0], wc[1] + 60, 1150, '#141a2a', 0.5, 0.2);
      }
      return s;
    }
  });
  /* ================================================================ */
  /* 3. The upstairs hall at night: long and narrow, the runner, old
   * striped paper, Mémère's door left ajar on her night light, the
   * closet at the end with the attic hatch above it — padlocked. */
  ART.bg('hall_up', {
    times: ['night'],
    light: { night: 'night' },
    draw(o) {
      o = U(o);
      const t = o.time, rng = o.rng;
      const L = (c) => tone(c, t), S = (c) => shade(c, t);
      const YC = -414, YF = 1642, RAIL = 1642 - 860;
      const R = mkRoom({ vx: 700, vy: 360, D: 1250, depth: 5800, Yc: YC, Yf: YF });
      const DB = R.depth, at = R.at, Pp = R.P;
      const paper = '#76806e', wain = '#4a3a2e', trim = '#d9cfb8', floorC = '#5a4030';
      const mixR = (c) => K.mix(S(c), L(c), 0.35);
      let s = '';

      /* ---- shell ---- */
      s += K.poly(R.ceil, S('#d8cfbc'));
      s += K.poly(R.qX(0, 0, DB, YC, RAIL), S(paper)) + K.poly(R.qX(1600, 0, DB, YC, RAIL), mixR(paper));
      s += K.poly(R.qB(0, 1600, YC, RAIL), L(paper));
      const stripe = (c) => ({ w: 90, h: 90, inner: MOTIF.stripe(90, K.adj(c, 0.1), K.adj(c, -0.12)) });
      s += R.patQuad(o, [[0, YC, 0], [0, YC, DB], [0, RAIL, DB], [0, RAIL, 0]], stripe(S(paper)), 0.6, 14, 1.8);
      s += R.patQuad(o, [[1600, YC, 0], [1600, YC, DB], [1600, RAIL, DB], [1600, RAIL, 0]], stripe(mixR(paper)), 0.6, 14, 1.8);
      s += paperOn(o, R.qB(0, 1600, YC, RAIL), 'stripe', K.adj(L(paper), 0.1), K.adj(L(paper), -0.12), 21, 0.6);
      // wainscot, chair rail, baseboard, crown
      s += K.poly(R.qX(0, 0, DB, RAIL, YF), S(wain)) + K.poly(R.qX(1600, 0, DB, RAIL, YF), mixR(wain)) + K.poly(R.qB(0, 1600, RAIL, YF), L(wain));
      for (let d = 80; d < DB - 200; d += 380) {
        s += K.poly(R.qX(0, d, d + 340, RAIL + 90, YF - 120), K.adj(S(wain), -0.15)) + K.poly(R.qX(1600, d, d + 340, RAIL + 90, YF - 120), K.adj(mixR(wain), -0.15));
      }
      const strip = (y0, y1, c) => K.poly(R.qB(0, 1600, y0, y1), L(c)) + K.poly(R.qX(0, 0, DB, y0, y1), S(c)) + K.poly(R.qX(1600, 0, DB, y0, y1), mixR(c));
      s += strip(RAIL - 14, RAIL + 14, '#3a2a20') + strip(YC, YC + 40, trim) + strip(YF - 90, YF, '#3a2a20');
      // floor and the runner
      s += K.poly(R.floor, L(floorC)) + R.boards(o, rng, { w: 120, color: S('#2a1c14'), opacity: 0.45, ends: 0.3 });
      s += K.poly(R.qY(YF, 330, 1270, 0, DB - 120), L('#5a2a2a')) + K.poly(R.qY(YF, 380, 1220, 0, DB - 170), L('#7a3a34'));
      s += K.poly(R.qY(YF, 420, 1180, 0, DB - 210), L('#5a2a2a'));
      for (let d = 200; d < DB - 300; d += 260) s += K.poly(R.qY(YF, 520, 1080, d, d + 120), L('#8a5a3a'), { opacity: 0.5 });

      /* ---- the end: window and closet door ---- */
      let ew = '';
      const W0 = 140, W1 = 600, WT = -230, WB = 974;
      ew += K.rect(W0 - 46, WT - 46, W1 - W0 + 92, WB - WT + 70, L(trim)) + K.rect(W0 - 70, WB + 20, W1 - W0 + 140, 30, K.adj(L(trim), 0.05));
      const msk = lin(o, 'hsky', [[0, '#1a2848'], [1, '#33456a']]);
      let v = msk.def + K.rect(W0, WT, W1 - W0, WB - WT, msk.url);
      v += K.glow(o, W0 + 150, WT + 230, 260, '#c8d6f0', 0.5, 'hmoon') + K.circle(W0 + 150, WT + 230, 46, '#eef0f2');
      v += K.path(K.blob(rng, W1 - 60, WB - 140, 260, 220, { lobes: 7, jag: 0.3 }), '#0c1222');
      v += K.path(K.blob(rng, W0 + 40, WB - 40, 200, 160, { lobes: 6, jag: 0.3 }), '#0a0f1c');
      ew += clipRect(o, W0, WT, W1 - W0, WB - WT, v);
      ew += K.rect(W0, (WT + WB) / 2 - 18, W1 - W0, 36, L(trim)) + K.rect((W0 + W1) / 2 - 14, WT, 28, WB - WT, L(trim));
      // a thin curtain pulled to one side
      ew += K.path(`M${W1 - 150},${WT - 40} L${W1 + 40},${WT - 40} L${W1 + 50},${WB + 10} L${W1 - 40},${WB + 10} Q${W1 - 120},${(WT + WB) / 2} ${W1 - 150},${WT - 40} Z`, L('#c9c6d4'), { opacity: 0.55 });
      // closet door, plain, with a glass knob
      const CD0 = 760, CD1 = 1440, CT = -180;
      ew += K.rect(CD0 - 50, CT - 50, CD1 - CD0 + 100, YF - CT + 50, L(trim));
      ew += K.rect(CD0, CT, CD1 - CD0, YF - CT, L('#5a4232'));
      for (const [y0, y1] of [[CT + 80, 560], [680, YF - 120]]) ew += K.rect(CD0 + 80, y0, CD1 - CD0 - 160, y1 - y0, S('#5a4232')) + K.rect(CD0 + 96, y0 + 16, CD1 - CD0 - 192, y1 - y0 - 32, L('#5a4232'));
      ew += K.circle(CD1 - 90, 640, 30, L('#c8d4dc')) + K.circle(CD1 - 98, 632, 10, '#ffffff', { opacity: 0.5 });
      s += at(DB, ew);

      /* ---- the attic hatch in the ceiling, cord, padlock ---- */
      const H0 = 820, H1 = 1380, HD0 = 3900, HD1 = 4600;
      s += K.poly(R.qY(YC, H0 - 50, H1 + 50, HD0 - 50, HD1 + 50), L(trim)) + K.poly(R.qY(YC, H0 - 10, H1 + 10, HD0 - 10, HD1 + 10), K.adj(S('#d8cfbc'), -0.45));
      s += K.poly(R.qY(YC, H0, H1, HD0, HD1), K.adj(S('#d8cfbc'), -0.04)) + K.poly(R.qY(YC, H0 + 60, H1 - 60, HD0 + 90, HD1 - 90), K.adj(S('#d8cfbc'), -0.12));
      const ca = Pp(1100, YC, HD0 + 20), cb = Pp(1100, YC + 860, HD0 + 20);
      s += K.line(ca[0], ca[1], cb[0], cb[1], L('#b8b0a0'), 1.6) + K.ellipse(cb[0], cb[1] + 6, 3.4, 7, L('#c9b48e'));
      // hasp and a small brass padlock at the hatch's near edge
      const pl = Pp(1300, YC, HD0 - 10);
      s += K.rect(pl[0] - 7, pl[1] - 2, 14, 5, L('#6a6a6a')) + K.path(`M${n(pl[0] - 5)},${n(pl[1] + 8)} a5,6 0 0 1 10,0`, 'none', { stroke: L('#9a9a9a'), strokeWidth: 2.2 }) + K.rect(pl[0] - 7, pl[1] + 8, 14, 12, L('#c9a050'), { rx: 2 }) + K.rect(pl[0] - 5, pl[1] + 10, 4, 6, '#e8e0c8', { opacity: 0.5 }) + K.circle(pl[0] + 1, pl[1] + 15, 1.3, '#1a1410');

      /* ---- right wall: photographs, the table, Mémère's door ajar ---- */
      const frameX = (X, d0, d1, y0, y1, fc, pc) => K.poly(R.qX(X, d0, d1, y0, y1), fc) + K.poly(R.qX(X, d0 + (d1 - d0) * 0.12, d1 - (d1 - d0) * 0.12, y0 + (y1 - y0) * 0.1, y1 - (y1 - y0) * 0.1), pc) +
        K.poly(R.qX(X, d0 + (d1 - d0) * 0.12, d0 + (d1 - d0) * 0.3, y0 + (y1 - y0) * 0.1, y1 - (y1 - y0) * 0.1), '#ffffff', { opacity: 0.06 });
      const gold = L('#9a7a3e'), blk = L('#2a2220');
      [[260, 560, 120, 560, gold, '#7a6a58'], [700, 960, 260, 640, blk, '#5a6470'], [1080, 1300, 100, 400, gold, '#8a7a62'], [1080, 1300, 480, 720, blk, '#6a5a50'], [3400, 3700, 160, 520, gold, '#6a6458'], [3850, 4100, 260, 600, blk, '#7a6a58']].forEach(([d0, d1, y0, y1, fc, pc]) => { s += frameX(1600, d0, d1, y0, y1, fc, L(pc)); });
      // Mémère's door, a crack open; her night light inside
      const MD0 = 2300, MD1 = 3100, MT = YF - 1820, AJ = 0.1;
      s += K.poly(R.qX(1600, MD0 - 70, MD1 + 70, MT - 70, YF), L(trim));
      s += K.poly(R.qX(1600, MD0, MD1, MT, YF), '#120c0a');
      // the slit of warm light at the far jamb, and the door slab turned in
      const slab = [[1600, MT, MD0], [1600 + 800 * Math.sin(AJ), MT, MD0 + 800 * Math.cos(AJ)], [1600 + 800 * Math.sin(AJ), YF, MD0 + 800 * Math.cos(AJ)], [1600, YF, MD0]].map((q) => Pp(...q));
      const gap = [Pp(1600, MT, MD1), slab[1], slab[2], Pp(1600, YF, MD1)];
      const nlG = lin(o, 'nl', [[0, '#1a0e08'], [0.45, '#6a3a1a'], [0.85, '#d88a40'], [1, '#ffc070']], 0, 0, 0, 1);
      s += nlG.def + K.poly(gap, nlG.url);
      s += K.poly(slab, L('#5a4232'));
      for (const [y0, y1] of [[MT + 90, 560], [680, YF - 130]]) s += K.poly([[1600 + 120 * Math.sin(AJ), y0, MD0 + 120 * Math.cos(AJ)], [1600 + 680 * Math.sin(AJ), y0, MD0 + 680 * Math.cos(AJ)], [1600 + 680 * Math.sin(AJ), y1, MD0 + 680 * Math.cos(AJ)], [1600 + 120 * Math.sin(AJ), y1, MD0 + 120 * Math.cos(AJ)]].map((q) => Pp(...q)), S('#5a4232'));
      s += K.line(slab[1][0], slab[1][1], slab[2][0], slab[2][1], '#ffc070', 1.5, { opacity: 0.6 });
      const gc = Pp(1600, 1300, MD1 - 40);
      s += screen(K.glow(o, gc[0], gc[1], 110, '#ffbf70', 0.45, 'nlg') + K.glow(o, gc[0], gc[1] + 60, 200, '#ffaf60', 0.22, 'nlg2'));

      // the hall table: rosary and a glass of water
      const TB0 = 1330, TD0 = 1500, TD1 = 1900, TT = YF - 800;
      s += R.box(TB0, 1600, TT, TT + 40, TD0, TD1, { t: L('#4a3020'), l: S('#4a3020'), f: L('#4a3020') });
      s += R.box(TB0 + 10, TB0 + 50, TT + 40, YF, TD0 + 10, TD0 + 50, { l: S('#3a2418'), f: L('#3a2418') });
      s += R.box(1550, 1590, TT + 40, YF, TD0 + 10, TD0 + 50, { l: S('#3a2418'), f: L('#3a2418') });
      s += K.poly(R.qB(TB0, 1600, TT + 40, TT + 160, TD0), L('#4a3020')) + K.poly(R.qB(TB0 + 40, 1560, TT + 70, TT + 140, TD0), S('#4a3020'));
      // glass of water (catches the moon)
      const gw = 76, gh = 104;
      let gl = K.path(`M${-gw / 2},${-gh} L${gw / 2},${-gh} L${gw * 0.42},0 L${-gw * 0.42},0 Z`, '#9fb4d8', { opacity: 0.32 }) + K.path(`M${-gw * 0.47},${-gh * 0.62} L${gw * 0.47},${-gh * 0.62} L${gw * 0.42},0 L${-gw * 0.42},0 Z`, '#b8cae8', { opacity: 0.32 }) +
        K.ellipse(0, -gh * 0.62, gw * 0.47, 6, '#dfe8f8', { opacity: 0.45 }) + K.line(-gw / 2 + 8, -gh + 4, -gw * 0.42 + 8, -5, '#eef4ff', 4, { opacity: 0.65 }) + K.ellipse(0, -gh, gw / 2, 7, 'none', { stroke: '#dfe8f8', strokeWidth: 3, opacity: 0.65 }) + K.ellipse(0, 0, gw * 0.42, 5, '#dfe8f8', { opacity: 0.25 });
      const gp = Pp(1440, TT, 1680);
      s += `<g transform="translate(${n(gp[0])} ${n(gp[1])}) scale(${R.k(1680).toFixed(3)})">${gl}</g>`;
      // rosary: beads in a loose loop, the crucifix hanging over the edge
      const rp = (X, d, Y = TT) => Pp(X, Y, d);
      let rb = '';
      for (let i = 0; i < 26; i++) { const a = (i / 26) * 6.2832; const q = rp(1500 + Math.cos(a) * 80, 1660 + Math.sin(a) * 90); rb += K.circle(q[0], q[1], 2.2, L('#d9d0c0')); }
      const r0 = rp(1400, TD0), r1 = Pp(1395, TT + 120, TD0 - 4);
      rb += K.line(r0[0], r0[1], r1[0], r1[1], L('#c9c0b0'), 1.2, { strokeDasharray: '1.5 2' }) + K.rect(r1[0] - 1.2, r1[1], 2.4, 9, L('#d9d0c0')) + K.rect(r1[0] - 3.5, r1[1] + 2.5, 7, 2, L('#d9d0c0'));
      s += rb;
      /* ---- left wall: a closed door, more photographs ---- */
      for (const [e0, e1] of [[1300, 2100], [3700, 4400]]) {
        s += K.poly(R.qX(0, e0 - 70, e1 + 70, MT - 70, YF), L(trim)) + K.poly(R.qX(0, e0, e1, MT, YF), L('#5a4232'));
        for (const [y0, y1] of [[MT + 90, 560], [680, YF - 130]]) s += K.poly(R.qX(0, e0 + 80, e1 - 80, y0, y1), S('#5a4232'));
      }
      const kn2 = Pp(0, 640, 2020);
      s += K.circle(kn2[0] + 3, kn2[1], 5, L('#c8d4dc'));
      [[2350, 2650, 150, 520, gold, '#6a6458'], [2800, 3050, 250, 560, blk, '#7a6a58'], [3200, 3450, 120, 400, gold, '#5a6470'], [3200, 3450, 480, 720, blk, '#8a7a62'], [4700, 4950, 200, 560, gold, '#7a6a58']].forEach(([d0, d1, y0, y1, fc, pc]) => { s += frameX(0, d0, d1, y0, y1, fc, L(pc)); });
      // radiator under the photographs
      s += K.poly(R.qX(70, 400, 1000, YF - 520, YF - 60), L('#7a7a74')) + K.poly(R.qY(YF - 520, 0, 70, 400, 1000), L('#8a8a82'));
      for (let d = 420; d < 1000; d += 30) { const a = Pp(70, YF - 510, d), b = Pp(70, YF - 70, d); s += K.line(a[0], a[1], b[0], b[1], S('#7a7a74'), 1.4); }

      /* ---- light: the moon down the hall, the night light, deep dark ---- */
      const wq = [Pp(W0, WB, DB), Pp(W1, WB, DB)];
      s += K.shaft(o, [Pp(W0, WT, DB), Pp(W1, WT, DB), Pp(W1 + 500, YF, DB - 2600), Pp(W0 + 200, YF, DB - 2600)], '#a8bce6', 0.12, 'hshaft');
      const mp = lin(o, 'hmp', [[0, '#b8c8ec', 0.02], [0.5, '#b8c8ec', 0.16], [1, '#b8c8ec', 0.2]]);
      const pa = [Pp(W0 + 320, YF, DB - 1500), Pp(W1 + 460, YF, DB - 1500), Pp(W1 + 140, YF, DB - 60), Pp(W0 + 90, YF, DB - 60)];
      s += mp.def + K.poly(pa, mp.url);
      const mcx = Pp((W0 + W1) / 2 + 160, YF, DB - 700);
      s += K.line(mcx[0], mcx[1] - 30, Pp((W0 + W1) / 2 + 20, YF, DB - 60)[0], Pp(0, YF, DB - 60)[1], '#03050a', 6, { opacity: 0.35 });
      s += K.poly([Pp(W0 + 205, YF, DB - 780), Pp(W1 + 300, YF, DB - 780), Pp(W1 + 300, YF, DB - 720), Pp(W0 + 205, YF, DB - 720)], '#03050a', { opacity: 0.3 });
      const wc = Pp((W0 + W1) / 2, (WT + WB) / 2, DB);
      s += screen(K.glow(o, wc[0], wc[1], 200, '#9fb4e0', 0.3, 'hwin'));
      s += falloff(o, wc[0] + 60, wc[1] + 40, 820, '#03050a', 0.8, 0.1);
      s += K.band(o, 0, 120, '#03050a', 0.6, 0, 'hceil');
      // the night light reaches past the falloff
      s += screen(K.glow(o, gc[0] - 10, gc[1] + 40, 120, '#ffb060', 0.35, 'nlg3'));
      return s;
    }
  });
  /* ================================================================ */
  /* 4. The attic: steep rafters, the round window of the front gable
   * and its dusty shaft, everything the family didn't throw away — and,
   * low on the gable wall, the boards someone pried loose. */
  ART.bg('attic', {
    times: ['day', 'flashlight'],
    light: { day: 'afternoon', flashlight: 'dim' },
    draw(o) {
      o = U(o);
      const t = o.time, rng = o.rng, fl = t === 'flashlight';
      const tt = fl ? 'flashlight' : 'attic';
      const L = (c) => tone(c, tt), S = (c) => shade(c, tt);
      const YF = 733, YK = 562, YR = -213;
      const R = mkRoom({ vx: 800, vy: 300, D: 2200, depth: 1650, Yc: YR, Yf: YF });
      const DB = R.depth, at = R.at, Pp = R.P;
      const roofY = (X) => (X <= 800 ? YK - (X / 800) * (YK - YR) : YK - ((1600 - X) / 800) * (YK - YR));
      const wood = '#8a6a48', board = '#7a5a3c', floorC = '#806044';
      const NEAR = -1500;
      let s = '';

      /* ---- shell: roof planes, knee walls, gable, floor ---- */
      const roofL = [Pp(0, YK, NEAR), Pp(0, YK, DB), Pp(800, YR, DB), Pp(800, YR, NEAR)];
      const roofR = [Pp(1600, YK, NEAR), Pp(1600, YK, DB), Pp(800, YR, DB), Pp(800, YR, NEAR)];
      s += K.poly(roofL, K.adj(L(board), -0.12)) + K.poly(roofR, S(board));
      // roof boards: seams parallel to the ridge, a few bright gaps where the sun gets in
      let seams = '';
      for (let i = 1; i < 12; i++) {
        const f = i / 12;
        for (const side of [0, 1]) {
          const X = side ? 1600 - 800 * f : 800 * f, Y = YK - (YK - YR) * f;
          const a = Pp(X, Y, NEAR), b = Pp(X, Y, DB);
          seams += K.line(a[0], a[1], b[0], b[1], K.adj(S(board), -0.3), 2, { opacity: 0.5 });
        }
      }
      s += seams;
      s += K.poly(R.qX(0, NEAR, DB, YK, YF), S(wood)) + K.poly(R.qX(1600, NEAR, DB, YK, YF), K.mix(S(wood), L(wood), 0.3));
      const gable = [Pp(0, YK, DB), Pp(800, YR, DB), Pp(1600, YK, DB), Pp(1600, YF, DB), Pp(0, YF, DB)];
      s += K.poly(gable, L(board));
      let gb = '';
      for (let X = 40; X < 1600; X += 64) gb += K.rect(X, roofY(X) - 10, 3, YF - roofY(X) + 10, K.adj(S(board), -0.25), { opacity: 0.6 });
      for (let X = 72; X < 1600; X += 192) gb += K.rect(X, roofY(X) + 20, 22, YF - roofY(X), K.adj(L(board), 0.05), { opacity: 0.35 });
      s += clipPoly(o, gable, at(DB, gb));
      R.floor = [Pp(0, YF, NEAR), Pp(1600, YF, NEAR), Pp(1600, YF, DB), Pp(0, YF, DB)];
      s += K.poly(R.floor, L(floorC)) + R.boards(o, rng, { w: 110, color: S('#3a2818'), opacity: 0.5, ends: 0.4, d0: NEAR });
      s += K.band(o, 560, 340, '#000', 0, 0.25, 'adust');

      /* ---- the round window of the front gable ---- */
      const WY = 12, WR = 98;
      let wn = K.circle(800, WY, WR + 22, L('#d9cfb8')) + K.circle(800, WY, WR + 22, 'none', { stroke: S('#d9cfb8'), strokeWidth: 6 });
      const wg = rad(o, 'awin', fl ? [[0, '#3a4a6e'], [1, '#1a2238']] : [[0, '#fff6e2'], [0.7, '#f6dcae'], [1, '#e8c088']], 790, WY - 10, WR);
      wn += wg.def + K.circle(800, WY, WR, wg.url);
      if (fl) wn += K.circle(840, WY - 40, 18, '#cfd6e6', { opacity: 0.5 });
      wn += K.rect(800 - 7, WY - WR, 14, WR * 2, L('#d9cfb8')) + K.rect(800 - WR, WY - 7, WR * 2, 14, L('#d9cfb8'));
      wn += K.path(`M${800 - WR + 10},${WY - 30} A${WR - 10},${WR - 10} 0 0 1 ${800 - 30},${WY - WR + 10}`, 'none', { stroke: fl ? '#8a9ab8' : '#ffffff', strokeWidth: 4, opacity: 0.25 });
      s += at(DB, wn);

      /* ---- the panel low on the gable wall, two boards pried off ---- */
      const PX0 = 1110, PX1 = 1430, PT = 470, OX0 = 1174, OX1 = 1302;
      const panel = (Lc, Sc, lit) => {
        let p = '';
        for (let X = PX0; X < PX1; X += 64) if (X < OX0 || X >= OX1) p += K.rect(X + 1, PT, 62, YF - PT, Lc('#6e5236')) + K.rect(X + 52, PT, 11, YF - PT, Sc('#6e5236')) + K.circle(X + 32, PT + 22, 3, Sc('#4a4a4a')) + K.circle(X + 32, YF - 30, 3, Sc('#4a4a4a'));
        p += K.rect(PX0 - 8, PT - 16, PX1 - PX0 + 16, 18, Lc('#7a5c3e'));
        // the cavity and what's in it
        p += K.rect(OX0, PT + 2, OX1 - OX0, YF - PT - 2, '#07060a');
        p += K.rect(OX0, PT + 2, OX1 - OX0, 40, '#000', { opacity: 0.5 });
        p += K.rect(OX0 + 12, 548, OX1 - OX0 - 24, 178, Lc('#a67e52')) + K.rect(OX0 + 12, 548, OX1 - OX0 - 24, 12, Sc('#a67e52')) + K.rect(OX1 - 34, 560, 22, 166, Sc('#a67e52'), { opacity: 0.6 });
        p += K.rect(OX0 + 12, 600, OX1 - OX0 - 24, 3, Sc('#a67e52'), { opacity: 0.5 });
        p += txt((OX0 + OX1) / 2 - 6, 628, 'NE PAS', { size: 30, fill: lit ? '#2a2420' : Sc('#2a2420'), family: HAND, rot: -4 });
        p += txt((OX0 + OX1) / 2 - 4, 668, 'JETER', { size: 30, fill: lit ? '#2a2420' : Sc('#2a2420'), family: HAND, rot: -4 });
        p += K.line((OX0 + OX1) / 2 - 44, 682, (OX0 + OX1) / 2 + 34, 678, lit ? '#2a2420' : Sc('#2a2420'), 2.5);
        // cobweb in the corner of the opening
        p += K.path(`M${OX0},${PT + 2} L${OX0 + 46},${PT + 40} M${OX0},${PT + 2} L${OX0 + 20},${PT + 56} M${OX0},${PT + 2} L${OX0 + 52},${PT + 14} M${OX0 + 10},${PT + 30} Q${OX0 + 26},${PT + 22} ${OX0 + 34},${PT + 10} M${OX0 + 18},${PT + 48} Q${OX0 + 40},${PT + 34} ${OX0 + 48},${PT + 26}`, 'none', { stroke: lit ? '#d8d4cc' : Sc('#d8d4cc'), strokeWidth: 1.2, opacity: 0.7 });
        // one board hangs by a nail, the other leans against the wall
        p += `<g transform="rotate(-14 ${OX1 + 30} ${PT + 18})">` + K.rect(OX1, PT + 6, 62, YF - PT - 50, Lc('#7a5a3c')) + K.rect(OX1 + 50, PT + 6, 12, YF - PT - 50, Sc('#7a5a3c')) + K.circle(OX1 + 30, PT + 20, 3.5, Sc('#3a3a3a')) + '</g>';
        p += `<g transform="rotate(-8 ${PX1 + 70} ${YF})">` + K.rect(PX1 + 34, PT + 40, 62, YF - PT - 40, Lc('#7a5a3c')) + K.rect(PX1 + 84, PT + 40, 12, YF - PT - 40, Sc('#7a5a3c')) + K.line(PX1 + 64, PT + 56, PX1 + 64, PT + 40, Lc('#9a9a9a'), 3) + '</g>';
        return p;
      };
      s += at(DB, panel(L, S, false));

      /* ---- boxes against the gable, rolled rugs ---- */
      s += box3(o, R, L, S, { x0: 110, x1: 330, y0: 560, y1: 733, d0: DB - 260, d1: DB - 40, label: 'NOËL', size: 30, rot: -3 });
      s += box3(o, R, L, S, { x0: 340, x1: 520, y0: 590, y1: 733, d0: DB - 240, d1: DB - 60, label: '', open: true });
      s += box3(o, R, L, S, { x0: 140, x1: 320, y0: 410, y1: 560, d0: DB - 250, d1: DB - 70, label: '', rot: 2, c: '#a8845a' });
      // rugs rolled and leaning against the right slope
      for (const [X, d, c] of [[1530, 1100, '#7a3a34'], [1570, 1200, '#3b4a63']]) {
        const top = Pp(X - 60, roofY(X - 60) + 40, d), bot = Pp(X, YF, d);
        const w = 52 * R.k(d);
        s += K.path(`M${n(bot[0] - w)},${n(bot[1])} L${n(top[0] - w)},${n(top[1])} L${n(top[0] + w)},${n(top[1])} L${n(bot[0] + w)},${n(bot[1])} Z`, L(c)) + K.path(`M${n(bot[0])},${n(bot[1])} L${n(top[0])},${n(top[1])} L${n(top[0] + w)},${n(top[1])} L${n(bot[0] + w)},${n(bot[1])} Z`, S(c));
        s += K.ellipse(top[0], top[1], w, w * 0.4, K.adj(L(c), 0.15)) + K.ellipse(top[0], top[1], w * 0.5, w * 0.2, S(c));
        for (let i = 1; i < 5; i++) s += K.line(lerp(bot[0], top[0], i / 5) - w, lerp(bot[1], top[1], i / 5), lerp(bot[0], top[0], i / 5) + w, lerp(bot[1], top[1], i / 5) + 3, K.adj(L(c), 0.2), 2, { opacity: 0.5 });
      }

      /* ---- rafters and collar ties (in front of the gable, above everything) ---- */
      const raf = (d) => {
        const k = 1, w = 40;
        let r = K.path(`M0,${YK} L800,${YR} L${800 + 36 * k},${YR + 37 * k + 30} L${36 * k},${YK + 37 * k} Z`, L(wood)) + K.path(`M1600,${YK} L800,${YR} L${800 - 36},${YR + 67} L${1600 - 36},${YK + 37} Z`, S(wood));
        r += K.path(`M${36},${YK + 37} L${836},${YR + 67}`, 'none', { stroke: K.adj(S(wood), -0.2), strokeWidth: 6 }) + K.path(`M${1564},${YK + 37} L${764},${YR + 67}`, 'none', { stroke: K.adj(S(wood), -0.3), strokeWidth: 6 });
        return at(d, r);
      };
      const tie = (d) => { const y = -60, xl = (YK - y) / (YK - YR) * 800 + 30; return at(d, K.rect(xl, y, 1600 - 2 * xl, 46, L(wood)) + K.rect(xl, y + 38, 1600 - 2 * xl, 8, S(wood))); };
      for (let d = DB - 190; d > 300; d -= 150) s += raf(d);
      s += tie(560) + tie(120);

      /* ---- the bare bulb from the ridge, off ---- */
      const bt = Pp(800, YR + 30, 700), bb = Pp(800, -30, 700);
      s += K.line(bt[0], bt[1], bb[0], bb[1], L('#2a2a2a'), 1.5) + K.rect(bb[0] - 4, bb[1], 8, 8, L('#4a4a4a')) + K.ellipse(bb[0], bb[1] + 15, 7, 9, fl ? L('#c8c4b8') : L('#efe6d2')) + K.line(bb[0] + 3, bb[1] + 6, bb[0] + 5, bb[1] + 44, L('#9a9a9a'), 1);

      /* ---- the rocking horse ---- */
      let rh = '';
      const hx = 860, hy = YF, hc = '#d6cfc2';
      // the bow rocker and its stand
      rh += K.path(`M${hx - 200},${hy - 30} Q${hx},${hy - 96} ${hx + 200},${hy - 30} L${hx + 196},${hy - 12} Q${hx},${hy - 78} ${hx - 196},${hy - 12} Z`, L('#7a3a2a'));
      rh += K.path(`M${hx - 200},${hy - 30} Q${hx},${hy - 96} ${hx + 200},${hy - 30}`, 'none', { stroke: K.adj(L('#7a3a2a'), 0.15), strokeWidth: 3 });
      // legs, splayed onto the rocker (far legs in shadow)
      const leg = (x0, x1, c) => K.path(`M${x0 - 9},${hy - 236} L${x0 + 9},${hy - 236} L${x1 + 8},${hy - 66} L${x1 - 8},${hy - 66} Z`, c);
      rh += leg(hx - 92, hx - 150, S(hc)) + leg(hx + 92, hx + 150, S(hc));
      rh += leg(hx - 70, hx - 118, L(hc)) + leg(hx + 70, hx + 120, L(hc));
      // barrel body
      rh += K.path(`M${hx - 128},${hy - 252} Q${hx - 128},${hy - 302} ${hx - 60},${hy - 304} L${hx + 90},${hy - 300} Q${hx + 144},${hy - 292} ${hx + 140},${hy - 250} Q${hx + 130},${hy - 216} ${hx + 60},${hy - 214} L${hx - 70},${hy - 214} Q${hx - 128},${hy - 220} ${hx - 128},${hy - 252} Z`, L(hc));
      rh += K.path(`M${hx - 120},${hy - 236} Q${hx},${hy - 206} ${hx + 132},${hy - 236} Q${hx + 120},${hy - 214} ${hx + 60},${hy - 214} L${hx - 70},${hy - 214} Q${hx - 112},${hy - 218} ${hx - 120},${hy - 236} Z`, S(hc));
      // neck and head, arched
      rh += K.path(`M${hx - 70},${hy - 296} C${hx - 96},${hy - 360} ${hx - 130},${hy - 398} ${hx - 150},${hy - 404} L${hx - 190},${hy - 384} Q${hx - 214},${hy - 368} ${hx - 206},${hy - 346} Q${hx - 196},${hy - 334} ${hx - 178},${hy - 340} L${hx - 150},${hy - 350} C${hx - 128},${hy - 330} ${hx - 120},${hy - 300} ${hx - 120},${hy - 262} Z`, L(hc));
      rh += K.path(`M${hx - 154},${hy - 402} L${hx - 160},${hy - 432} L${hx - 140},${hy - 408} Z`, L(hc)) + K.circle(hx - 170, hy - 382, 4, '#1a1a1a') + K.circle(hx - 200, hy - 352, 2.5, S('#5a4a40'));
      // mane, tail, saddle, bridle
      rh += K.path(`M${hx - 150},${hy - 406} C${hx - 110},${hy - 392} ${hx - 80},${hy - 350} ${hx - 64},${hy - 296} L${hx - 50},${hy - 300} C${hx - 70},${hy - 360} ${hx - 100},${hy - 400} ${hx - 140},${hy - 416} Z`, L('#3a2a20'));
      rh += K.path(`M${hx + 136},${hy - 284} Q${hx + 190},${hy - 270} ${hx + 182},${hy - 186} Q${hx + 166},${hy - 226} ${hx + 132},${hy - 256} Z`, L('#3a2a20'));
      rh += K.path(`M${hx - 40},${hy - 304} L${hx + 56},${hy - 302} L${hx + 62},${hy - 238} L${hx - 46},${hy - 236} Z`, L('#8c2e2a')) + K.path(`M${hx - 40},${hy - 304} L${hx + 56},${hy - 302} L${hx + 52},${hy - 290} L${hx - 36},${hy - 292} Z`, L('#5a1e1a'));
      rh += K.path(`M${hx - 196},${hy - 356} L${hx - 150},${hy - 380} L${hx - 128},${hy - 330}`, 'none', { stroke: L('#5a1e1a'), strokeWidth: 3 });
      for (let i = 0; i < 9; i++) rh += K.circle(hx - 96 + rng() * 200, hy - 290 + rng() * 60, 6 + rng() * 6, S(hc), { opacity: 0.55 });
      s += at(1450, rh);

      /* ---- the dress form ---- */
      let df = '';
      const fx = 470;
      df += K.path(`M${fx - 70},${YF} L${fx},${YF - 60} L${fx + 70},${YF} L${fx + 60},${YF} L${fx},${YF - 44} L${fx - 60},${YF} Z`, L('#3a2a20')) + K.rect(fx - 5, YF - 330, 10, 280, L('#4a3a2a'));
      df += K.path(`M${fx - 18},${YF - 590} L${fx + 18},${YF - 590} L${fx + 22},${YF - 560} Q${fx + 96},${YF - 552} ${fx + 100},${YF - 500} Q${fx + 92},${YF - 440} ${fx + 64},${YF - 410} Q${fx + 56},${YF - 380} ${fx + 82},${YF - 336} L${fx - 82},${YF - 336} Q${fx - 56},${YF - 380} ${fx - 64},${YF - 410} Q${fx - 92},${YF - 440} ${fx - 100},${YF - 500} Q${fx - 96},${YF - 552} ${fx - 22},${YF - 560} Z`, L('#d8ccb0'));
      df += K.path(`M${fx + 10},${YF - 560} Q${fx + 96},${YF - 552} ${fx + 100},${YF - 500} Q${fx + 92},${YF - 440} ${fx + 64},${YF - 410} Q${fx + 56},${YF - 380} ${fx + 82},${YF - 336} L${fx + 20},${YF - 336} Q${fx + 30},${YF - 420} ${fx + 10},${YF - 560} Z`, S('#d8ccb0'));
      df += K.rect(fx - 18, YF - 612, 36, 24, L('#5a3e2a'), { rx: 8 }) + K.path(`M${fx - 40},${YF - 556} Q${fx - 10},${YF - 470} ${fx - 30},${YF - 400}`, 'none', { stroke: L('#d9b44a'), strokeWidth: 5 }) + K.path(`M${fx + 34},${YF - 556} Q${fx + 20},${YF - 500} ${fx + 40},${YF - 440}`, 'none', { stroke: L('#d9b44a'), strokeWidth: 5 });
      s += at(1080, df);

      /* ---- Christmas, boxed and spilling ---- */
      const xd = 300;
      s += box3(o, R, L, S, { x0: 740, x1: 960, y0: 610, y1: YF, d0: xd, d1: xd + 190, label: '', open: true, c: '#b08a5a' });
      let xm = '';
      xm += K.path('M900,606 Q930,570 960,604 T1020,600 T1080,606 T1130,620', 'none', { stroke: L('#c9c6c0'), strokeWidth: 12, strokeDasharray: '2 3', opacity: 0.9 });
      xm += K.path('M906,640 Q950,690 1000,650 T1100,660', 'none', { stroke: L('#a8302a'), strokeWidth: 10, strokeDasharray: '2 2' });
      const bulbs = ['#c8402e', '#3b5a9a', '#e0a040', '#e8e2d2', '#c8402e', '#3b5a9a'];
      xm += K.path('M1110,640 C1160,700 1210,640 1250,720 C1270,760 1320,700 1360,730', 'none', { stroke: L('#26382c'), strokeWidth: 3 });
      [[1134, 670], [1180, 680], [1222, 668], [1258, 728], [1300, 722], [1344, 726]].forEach(([x, y], i) => { xm += K.ellipse(x, y + 10, 8, 13, L(bulbs[i]), { transform: `rotate(${i * 25 - 40} ${x} ${y})` }) + K.rect(x - 5, y - 6, 10, 8, L('#7a7a6a')); });
      xm += K.circle(950, 590, 16, L('#b8303a')) + K.circle(946, 585, 4, '#fff', { opacity: 0.4 }) + K.circle(1060, 586, 14, L('#c9a040')) + K.circle(1056, 582, 3.5, '#fff', { opacity: 0.4 });
      // wreath leaning on the box
      xm += K.circle(860, 640, 74, L('#2f4a3a')) + K.circle(860, 640, 40, S(floorC)) + K.circle(860, 640, 74, 'none', { stroke: L('#3d5a46'), strokeWidth: 10, strokeDasharray: '6 8' }) + K.path('M840,586 l20,16 l20,-16 l-6,30 l-14,-8 l-14,8 Z', L('#a8302a'));
      s += at(xd - 10, `<g transform="translate(-160 6)">${xm}</g>`);

      /* ---- the steamer trunk ---- */
      const tk0 = 120, tk1 = 520, tkd0 = 240, tkd1 = 500, tkT = 520;
      s += K.poly(R.qX(tk1, tkd0, tkd1, tkT, YF), S('#5a4030'));
      s += K.poly([Pp(tk0, tkT, tkd0), Pp(tk1, tkT, tkd0), Pp(tk1, tkT - 40, (tkd0 + tkd1) / 2), Pp(tk1, tkT, tkd1), Pp(tk0, tkT, tkd1), Pp(tk0, tkT - 40, (tkd0 + tkd1) / 2)], K.adj(L('#6a4a34'), 0.06));
      let tk = '';
      tk += K.rect(tk0, tkT, tk1 - tk0, YF - tkT, L('#6a4a34'));
      for (let y = tkT + 30; y < YF; y += 46) tk += K.rect(tk0, y, tk1 - tk0, 3, S('#6a4a34'), { opacity: 0.6 });
      tk += K.rect(tk0, tkT + 64, tk1 - tk0, 18, L('#8a6a44')) + K.rect(tk0, YF - 50, tk1 - tk0, 18, L('#8a6a44'));
      for (const x of [tk0 + 70, tk1 - 100]) tk += K.rect(x, tkT, 30, YF - tkT, L('#4a2e20')) + K.rect(x + 8, tkT + 70, 14, 14, 'none', { stroke: L('#c9a050'), strokeWidth: 3 });
      tk += K.rect(tk0, tkT, 30, 30, L('#c9a050')) + K.rect(tk1 - 30, tkT, 30, 30, L('#c9a050')) + K.rect(tk0, YF - 30, 30, 30, L('#c9a050')) + K.rect(tk1 - 30, YF - 30, 30, 30, L('#c9a050'));
      tk += K.rect((tk0 + tk1) / 2 - 16, tkT + 6, 32, 40, L('#c9a050'), { rx: 4 }) + K.circle((tk0 + tk1) / 2, tkT + 30, 4, S('#2a2018'));
      tk += K.ellipse(tk0 + 200, tkT + 150, 50, 30, L('#c9b48e'), { opacity: 0.8 }) + K.ellipse(tk0 + 200, tkT + 150, 40, 22, 'none', { stroke: L('#8c3b2e'), strokeWidth: 3, opacity: 0.6 });
      s += at(tkd0, tk);

      /* ---- light ---- */
      if (!fl) {
        // the dusty shaft from the round window, down to a pool on the floor
        const wc = Pp(800, WY, DB), wr = WR * R.k(DB);
        const pc = Pp(700, YF, 520), pr = 230 * R.k(520);
        const sh = lin(o, 'ashaft', [[0, '#ffe9bf', 0.34], [1, '#ffe9bf', 0.06]], 0, 0, 0, 1);
        s += sh.def + `<g style="mix-blend-mode:screen">` + K.poly([[wc[0] - wr, wc[1]], [wc[0] + wr, wc[1]], [pc[0] + pr, pc[1]], [pc[0] - pr, pc[1]]], sh.url) + '</g>';
        s += screen(K.pool(o, pc[0], pc[1], pr * 1.1, pr * 0.32, '#ffe2a8', 0.55, 'apool'));
        const cr = Pp(700, YF, 520);
        s += K.line(cr[0] - pr, cr[1], cr[0] + pr, cr[1], '#2a1c12', 4, { opacity: 0.25 }) + K.line(cr[0], cr[1] - pr * 0.3, cr[0], cr[1] + pr * 0.3, '#2a1c12', 4, { opacity: 0.25 });
        let motes = '';
        for (let i = 0; i < 90; i++) {
          const u = rng(), v = rng() - 0.5;
          const x = lerp(wc[0], pc[0], u) + v * 2 * lerp(wr, pr, u), y = lerp(wc[1], pc[1], u) + (rng() - 0.5) * 20;
          motes += K.circle(x, y, 0.7 + rng() * 1.8, '#fff4d8', { opacity: n(0.25 + rng() * 0.6) });
        }
        s += motes;
        s += screen(K.glow(o, wc[0], wc[1], 230, '#ffe2b0', 0.35, 'awg'));
        s += falloff(o, 760, 420, 1000, '#120c08', 0.62, 0.2);
        s += K.band(o, 0, 160, '#0e0a08', 0.45, 0, 'aceil');
      } else {
        // a flashlight from where she's crouched, on the open panel
        const sc = Pp((OX0 + OX1) / 2, 610, DB), src = [300, 990];
        const rx = 175, ry = 130;
        // the lit circle: repaint the panel in torchlight
        const tL = (c) => K.mix(K.tone(c, 'day'), '#ffe8c0', 0.08), tS = (c) => K.mul(tL(c), [0.62, 0.6, 0.66]);
        const spot = `<ellipse cx="${n(sc[0])}" cy="${n(sc[1])}" rx="${rx}" ry="${ry}"/>`;
        s += clipWith(o, spot, K.poly(gable, tL(board)) + clipPoly(o, gable, at(DB, gb)) + K.poly(R.floor, tL(floorC)) + at(DB, panel(tL, tS, true)), 'spot');
        const vg = rad(o, 'spotv', [[0, '#05070c', 0], [0.4, '#05070c', 0.06], [0.78, '#05070c', 0.5], [1, '#05070c', 0.93]], sc[0], sc[1], rx);
        s += vg.def + `<circle cx="${n(sc[0])}" cy="${n(sc[1])}" r="${rx + 1}" fill="${vg.url}" transform="translate(${n(sc[0])} ${n(sc[1])}) scale(1 ${(ry / rx).toFixed(3)}) translate(${n(-sc[0])} ${n(-sc[1])})"/>`;
        const beam = lin(o, 'beam', [[0, '#fff2d0', 0.0], [0.2, '#fff2d0', 0.07], [1, '#fff2d0', 0.03]], 0, 1, 1, 0);
        let bm = '';
        for (const w of [1.15, 0.85, 0.55]) bm += K.poly([[src[0] - 30 * w, src[1] - 10], [src[0] + 30 * w, src[1] + 20], [sc[0] + rx * 0.75 * w, sc[1] + ry * 0.8 * w], [sc[0] - rx * 0.8 * w, sc[1] - ry * 0.8 * w]], beam.url);
        s += beam.def + `<g style="mix-blend-mode:screen">${bm}</g>`;
        s += screen(K.glow(o, sc[0], sc[1], rx * 1.3, '#ffe8c0', 0.14, 'spotg'));
        let motes = '';
        for (let i = 0; i < 50; i++) {
          const u = 0.25 + rng() * 0.75, v = rng() - 0.5;
          const x = lerp(src[0], sc[0], u) + v * lerp(40, rx * 1.4, u) * 0.8, y = lerp(src[1], sc[1], u) + v * lerp(20, ry, u) * 0.6;
          motes += K.circle(x, y, 0.6 + rng() * 1.5, '#fff4d8', { opacity: n(0.15 + rng() * 0.45) });
        }
        s += motes;
        s += falloff(o, sc[0], sc[1], 1100, '#020306', 0.55, 0.25);
      }
      return s;
    }
  });
  /* ================================================================ */
  /* 5. Teddy Okafor's room: painted walls and carpet (a newer house),
   * the ham station glowing amber under a wall of QSL cards, stars stuck
   * on the ceiling, posters of elsewhere, the telescope at the window. */
  ART.bg('teddy_room', {
    times: ['night'],
    light: { night: 'interior_lamp' },
    draw(o) {
      o = U(o);
      const rng = o.rng, tt = 'lampnight';
      const L = (c) => tone(c, tt), S = (c) => shade(c, tt);
      const R = mkRoom({ vx: 800, vy: 300, D: 2400, depth: 1800, Yc: 0, Yf: 900 });
      const DB = R.depth, at = R.at, Pp = R.P;
      const wall = '#557286', ceilC = '#dcd8cc', carpet = '#8a7c6c';
      const mixR = (c) => K.mix(S(c), L(c), 0.35);
      let s = '';

      /* ---- shell ---- */
      s += K.poly(R.ceil, S(ceilC));
      s += K.poly(R.left, S(wall)) + K.poly(R.right, mixR(wall)) + K.poly(R.back, L(wall));
      s += K.poly(R.floor, L(carpet));
      const cp = pattern(o, 'carpet', 6, 6, `<rect width="6" height="6" fill="none"/><circle cx="1.5" cy="1.5" r="0.9" fill="${S(carpet)}"/><circle cx="4.5" cy="4.5" r="0.9" fill="${K.adj(L(carpet), 0.08)}"/>`);
      s += cp.def + K.poly(R.floor, cp.url, { opacity: 0.5 });
      // baseboards, a white door frame on the left wall
      s += K.poly(R.qB(0, 1600, 860, 900), L('#e6e0d2')) + K.poly(R.qX(0, 0, DB, 860, 900), S('#e6e0d2')) + K.poly(R.qX(1600, 0, DB, 860, 900), mixR('#e6e0d2'));
      s += K.poly(R.qX(0, 80, 560, 90, 900), L('#e6e0d2')) + K.poly(R.qX(0, 110, 530, 120, 900), S('#c8bca4'));
      // glow-in-the-dark stars stuck all over the ceiling
      const star = (cx, cy, r, rot) => { let d = ''; for (let i = 0; i < 10; i++) { const a = rot + (i / 10) * 6.2832, rr = i % 2 ? r * 0.42 : r; d += (i ? ' L' : 'M') + n(cx + Math.cos(a) * rr) + ',' + n(cy + Math.sin(a) * rr); } return d + ' Z'; };
      let st = '';
      for (let i = 0; i < 34; i++) {
        const X = 60 + rng() * 1480, d = 60 + rng() * (DB - 120), p = Pp(X, 0, d), r = (10 + rng() * 9) * R.k(d);
        st += K.circle(p[0], p[1], r * 1.5, '#eef0c4', { opacity: 0.07 }) + K.path(star(p[0], p[1], r, rng() * 6), '#eef0c4', { opacity: n(0.55 + rng() * 0.4) });
      }
      st += K.path(star(Pp(980, 0, 900)[0], Pp(980, 0, 900)[1], 34 * R.k(900), 0.3), '#eef0c4', { opacity: 0.6 });
      for (let i = 0; i < 9; i++) { const p = Pp(1000 + rng() * 500, 0, 300 + rng() * 900), r = 4 * R.k(600); st += K.circle(p[0], p[1], r, '#eef0c4', { opacity: 0.6 }); }

      /* ---- QSL cards and a world map over the desk ---- */
      let qs = '';
      qs += K.rect(70, 140, 600, 310, L('#a8865a')) + K.rect(70, 140, 600, 310, 'none', { stroke: L('#7a5a3a'), strokeWidth: 10 });
      const cork = pattern(o, 'cork', 8, 8, `<circle cx="2" cy="3" r="1" fill="${S('#a8865a')}"/><circle cx="6" cy="6" r="0.8" fill="${K.adj(L('#a8865a'), 0.1)}"/>`);
      qs += cork.def + K.rect(75, 145, 590, 300, cork.url);
      const qc = [['#f2e6c8', '#c8402e'], ['#3b5a9a', '#f2e6c8'], ['#e9e2d0', '#2e8b8b'], ['#d9a441', '#2a2a2e'], ['#c98a8a', '#2a2a2e'], ['#f2e6c8', '#3b5a9a'], ['#2e8b8b', '#f2e6c8'], ['#e6dcc0', '#7a3a6a']];
      const calls = ['VE2QX', 'G4RTN', 'JA1KLM', 'W1AW', 'DL3FBQ', 'KH6ZB', 'LU5DX', 'ZL2AQ', 'VK3MO', 'EA7HJ', 'OH2BU', 'K7UGA', 'PY1RW', 'F6BQV', 'ON4UN', 'VE3NZ'];
      let ci = 0;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
        if (r === 1 && c === 5) continue;
        const x = 92 + c * 94 + (rng() - 0.5) * 10, y = 160 + r * 94 + (rng() - 0.5) * 8, rot = (rng() - 0.5) * 12, k2 = qc[(r * 6 + c * 5) % qc.length];
        qs += `<g transform="rotate(${n(rot)} ${n(x + 40)} ${n(y + 30)})">` + K.rect(x + 3, y + 4, 80, 58, '#000', { opacity: 0.18 }) + K.rect(x, y, 80, 58, L(k2[0])) + K.rect(x, y + 40, 80, 18, L(k2[1]), { opacity: 0.85 }) +
          txt(x + 40, y + 30, calls[ci++ % calls.length], { size: 17, fill: L(k2[1]), weight: 700 }) + K.circle(x + 40, y + 3, 4, L('#c8402e')) + '</g>';
      }
      // the world map, time zones
      qs += K.rect(540, 260, 120, 86, L('#7f9bb8')) + K.path('M552,280 q14,-8 24,4 q-4,16 -16,12 Z M590,276 q20,-6 30,6 q6,14 -8,22 q-16,2 -22,-12 Z M600,310 q10,4 6,20 q-8,6 -10,-8 Z M632,286 q14,-4 18,10 q-6,12 -16,6 Z', L('#c8b88a'));
      for (let x = 552; x < 660; x += 12) qs += K.line(x, 262, x, 344, L('#e6e0d2'), 0.8, { opacity: 0.4 });
      s += at(DB, qs);

      /* ---- the window, the night, the telescope ---- */
      const W0 = 840, W1 = 1180, WT = 170, WB = 520;
      let wn = K.rect(W0 - 26, WT - 26, W1 - W0 + 52, WB - WT + 46, L('#e6e0d2')) + K.rect(W0 - 40, WB + 14, W1 - W0 + 80, 14, K.adj(L('#e6e0d2'), 0.04));
      const sk = lin(o, 'tsky', [[0, '#081022'], [0.7, '#16234a'], [1, '#2a3560']]);
      let v = sk.def + K.rect(W0, WT, W1 - W0, WB - WT, sk.url) + K.stars(rng, { count: 40, x0: W0, x1: W1, y0: WT, y1: WB - 80, color: '#e8eef8' });
      v += K.path(`M${W0 + 80},${WT + 70} a26,26 0 1 0 22,40 a20,20 0 1 1 -22,-40 Z`, '#eef0e8');
      v += K.glow(o, W0 + 76, WT + 92, 70, '#b8c8ec', 0.3, 'tmoon');
      v += K.path(K.ridge(rng, { x0: W0 - 10, x1: W1 + 10, y: WB - 50, amp: 30, steps: 12, jag: 0.6, bottom: WB + 10 }), '#070b16');
      v += K.rect(W0 + 200, WB - 70, 30, 20, '#e8b46a', { opacity: 0.7 });
      wn += clipRect(o, W0, WT, W1 - W0, WB - WT, v);
      wn += K.rect(W0, (WT + WB) / 2 - 6, W1 - W0, 12, L('#e6e0d2')) + K.rect(W0, WT, 8, WB - WT, L('#e6e0d2')) + K.rect(W1 - 8, WT, 8, WB - WT, L('#e6e0d2'));
      // purple curtains pulled back
      const cu = '#6a4a7c';
      wn += K.path(`M${W0 - 70},${WT - 46} L${W0 + 40},${WT - 46} Q${W0 + 10},${WT + 120} ${W0 - 4},${WB + 60} L${W0 - 80},${WB + 60} Z`, L(cu)) + K.path(`M${W0 - 20},${WT - 46} L${W0 + 40},${WT - 46} Q${W0 + 10},${WT + 120} ${W0 - 4},${WB + 60} L${W0 - 30},${WB + 60} Z`, S(cu));
      wn += K.path(`M${W1 + 70},${WT - 46} L${W1 - 40},${WT - 46} Q${W1 - 10},${WT + 120} ${W1 + 4},${WB + 60} L${W1 + 80},${WB + 60} Z`, S(cu));
      wn += K.rect(W0 - 90, WT - 56, W1 - W0 + 180, 12, L('#c9c0b0'));
      // boombox on the sill
      const bx0 = W0 + 26, by0 = WB - 70;
      wn += K.path(`M${bx0 + 20},${by0} Q${bx0 + 90},${by0 - 34} ${bx0 + 160},${by0}`, 'none', { stroke: L('#5a5e66'), strokeWidth: 6 });
      wn += K.rect(bx0, by0, 180, 84, L('#3a3d44'), { rx: 8 }) + K.circle(bx0 + 36, by0 + 46, 26, L('#22252a')) + K.circle(bx0 + 144, by0 + 46, 26, L('#22252a')) + K.circle(bx0 + 36, by0 + 46, 9, L('#55585e')) + K.circle(bx0 + 144, by0 + 46, 9, L('#55585e'));
      wn += K.rect(bx0 + 70, by0 + 20, 40, 36, L('#141519')) + K.rect(bx0 + 74, by0 + 64, 32, 6, L('#c8402e'), { opacity: 0.7 }) + K.circle(bx0 + 112, by0 + 14, 2.4, '#ff6a3a');
      s += at(DB, wn);

      /* ---- the desk and the ham station ---- */
      const DK0 = 60, DK1 = 720, DD0 = DB - 220, deskC = '#7a6a5a';
      s += R.box(DK0, DK1, 620, 650, DD0, DB - 10, { t: K.adj(L(deskC), 0.06) });
      let dk = K.rect(DK0, 620, DK1 - DK0, 30, L(deskC)) + K.rect(DK0, 646, DK1 - DK0, 4, S(deskC));
      dk += K.rect(DK0 + 6, 650, 150, 242, L(deskC)) + K.rect(DK1 - 40, 650, 34, 242, S(deskC)) + K.rect(DK0 + 156, 650, DK1 - DK0 - 196, 242, K.adj(S(deskC), -0.4));
      for (let i = 0; i < 3; i++) dk += K.rect(DK0 + 16, 662 + i * 76, 130, 66, S(deskC)) + K.rect(DK0 + 20, 666 + i * 76, 122, 58, L(deskC)) + K.rect(DK0 + 66, 690 + i * 76, 30, 6, L('#c9c0b0'));
      s += at(DD0, dk);
      let rs = '';
      // the transceiver: amber dial window, two VU meters, knobs
      const tx0 = 150, ty0 = 474, tw = 330, th = 146;
      rs += K.rect(tx0, ty0, tw, th, L('#2b2d32'), { rx: 6 }) + K.rect(tx0, ty0, tw, 10, K.adj(L('#2b2d32'), 0.12)) + K.rect(tx0 + 6, ty0 + th - 10, tw - 12, 10, S('#2b2d32'));
      const amber = lin(o, 'amber', [[0, '#ffd890'], [1, '#f0a040']]);
      rs += amber.def + K.rect(tx0 + 20, ty0 + 22, 180, 44, amber.url, { rx: 3 });
      for (let i = 0; i <= 18; i++) rs += K.line(tx0 + 28 + i * 9, ty0 + 30, tx0 + 28 + i * 9, ty0 + (i % 3 ? 38 : 44), '#5a3410', 1.2);
      rs += K.line(tx0 + 120, ty0 + 24, tx0 + 120, ty0 + 64, '#c8281a', 2);
      for (const mx of [tx0 + 214, tx0 + 270]) rs += K.rect(mx, ty0 + 22, 46, 34, amber.url, { rx: 2 }) + K.path(`M${mx + 6},${ty0 + 50} A18,18 0 0 1 ${mx + 40},${ty0 + 50}`, 'none', { stroke: '#5a3410', strokeWidth: 1 }) + K.line(mx + 23, ty0 + 52, mx + 23 + (mx > tx0 + 250 ? 10 : -6), ty0 + 30, '#2a1408', 1.6);
      rs += K.circle(tx0 + 70, ty0 + 106, 26, L('#4a4d54')) + K.circle(tx0 + 70, ty0 + 106, 20, L('#1c1d21')) + K.circle(tx0 + 62, ty0 + 98, 4, L('#8a8e96'));
      for (let i = 0; i < 4; i++) rs += K.circle(tx0 + 140 + i * 44, ty0 + 104, 12, L('#4a4d54')) + K.circle(tx0 + 140 + i * 44, ty0 + 104, 3, L('#9aa0a8'));
      for (let i = 0; i < 6; i++) rs += K.rect(tx0 + 132 + i * 30, ty0 + 76, 18, 8, L(i === 2 ? '#e0a040' : '#5a5e66'));
      // power supply with its own meter, stacked logs of QSOs
      rs += K.rect(tx0 + tw + 14, ty0 + 40, 110, 106, L('#9aa0a6'), { rx: 4 }) + K.rect(tx0 + tw + 30, ty0 + 56, 50, 34, amber.url) + K.line(tx0 + tw + 55, ty0 + 88, tx0 + tw + 64, ty0 + 64, '#2a1408', 1.4) + K.circle(tx0 + tw + 96, ty0 + 112, 8, L('#4a4d54'));
      // desk mic on a stand
      const mx2 = 640;
      rs += K.ellipse(mx2, 618, 40, 8, L('#3a3d44')) + K.rect(mx2 - 5, 470, 10, 148, L('#8a8e96')) + K.circle(mx2, 446, 38, L('#c8ccd2')) + K.circle(mx2, 446, 30, L('#55585e'));
      const grl = pattern(o, 'mgr', 6, 6, `<rect width="6" height="6" fill="${L('#55585e')}"/><circle cx="3" cy="3" r="1.4" fill="${L('#2a2c30')}"/>`);
      rs += grl.def + K.circle(mx2, 446, 28, grl.url) + K.rect(mx2 - 14, 600, 28, 10, L('#c8402e'));
      // headphones hooked over the transceiver
      rs += K.path(`M${tx0 + tw - 70},${ty0 + 4} Q${tx0 + tw - 30},${ty0 - 60} ${tx0 + tw + 10},${ty0 + 4}`, 'none', { stroke: L('#2a2c30'), strokeWidth: 7 }) + K.ellipse(tx0 + tw - 70, ty0 + 14, 14, 20, L('#2a2c30')) + K.ellipse(tx0 + tw + 10, ty0 + 14, 14, 20, L('#2a2c30'));
      s += at(DB - 110, rs);
      // the logbook, open on the desk, a pencil
      s += K.poly(R.qY(620, 120, 300, DD0 + 20, DD0 + 90), L('#f2ecd8')) + K.poly(R.qY(620, 300, 470, DD0 + 20, DD0 + 90), L('#e8e0c8'));
      for (let i = 1; i < 6; i++) { const a = R.P(130, 620, DD0 + 20 + i * 12), b = R.P(460, 620, DD0 + 20 + i * 12); s += K.line(a[0], a[1], b[0], b[1], L('#8a9ab0'), 0.8, { opacity: 0.7 }); }
      const pa = R.P(330, 619, DD0 + 40), pb2 = R.P(470, 619, DD0 + 70);
      s += K.line(pa[0], pa[1], pb2[0], pb2[1], L('#d9a441'), 3);
      // architect's lamp clamped to the desk, bent over the radio
      const lb = Pp(90, 620, DB - 60), le = Pp(140, 330, DB - 120), lh = Pp(330, 400, DB - 150);
      s += K.line(lb[0], lb[1], le[0], le[1], L('#2a2c30'), 3) + K.line(le[0], le[1], lh[0], lh[1], L('#2a2c30'), 3) + K.line(lb[0] + 4, lb[1], le[0] + 4, le[1], L('#2a2c30'), 1.5);
      s += K.circle(le[0], le[1], 4, L('#4a4d54'));
      s += K.path(`M${n(lh[0] - 22)},${n(lh[1] - 6)} L${n(lh[0] + 6)},${n(lh[1] - 18)} L${n(lh[0] + 30)},${n(lh[1] + 22)} Q${n(lh[0] + 4)},${n(lh[1] + 40)} ${n(lh[0] - 22)},${n(lh[1] + 22)} Z`, L('#c8402e'));
      s += K.ellipse(lh[0] + 4, lh[1] + 30, 24, 7, '#fff2cc');

      /* ---- the telescope at the window ---- */
      let ts = '';
      for (const [fx, fy] of [[1050, 900], [1200, 900], [1130, 880]]) ts += K.line(1125, 470, fx, fy, L('#3a3d44'), 7);
      ts += K.rect(1110, 440, 30, 40, L('#4a4d54'));
      ts += `<g transform="rotate(-24 1125 430)">` + K.rect(1000, 408, 280, 46, L('#e8e6e0'), { rx: 10 }) + K.rect(1000, 431, 280, 23, S('#e8e6e0'), { rx: 8 }) + K.rect(1250, 400, 46, 62, L('#2a2c30'), { rx: 6 }) + K.rect(980, 414, 24, 34, L('#2a2c30'), { rx: 3 }) + K.rect(1080, 386, 90, 16, L('#c8ccd2'), { rx: 6 }) + '</g>';
      s += at(DB - 300, ts);

      /* ---- the bed: purple comforter; the nightstand, lava lamp, paperbacks ---- */
      const B0 = 1270, BD0 = 760, BD1 = DB - 110, CT = 692, purple = '#5e3f86';
      s += at(BD1 + 20, K.path(`M${B0 - 10},900 L${B0 - 10},540 Q${B0 + 40},470 ${(B0 + 1600) / 2},466 Q1560,470 1610,540 L1610,900 Z`, L('#7a5e46')) +
        K.path(`M${B0 + 22},880 L${B0 + 22},556 Q${B0 + 60},500 ${(B0 + 1600) / 2},496 Q1540,500 1580,556 L1580,880 Z`, 'none', { stroke: S('#7a5e46'), strokeWidth: 7 }));
      s += R.box(B0 + 10, 1600, CT, 900, BD0 + 30, BD1, { l: S('#d8d0c4'), f: L('#d8d0c4') });
      s += at(BD1 - 50, K.path(`M${B0 + 36},${CT + 4} Q${B0 + 24},${CT - 70} ${B0 + 84},${CT - 78} L${B0 + 236},${CT - 78} Q${B0 + 292},${CT - 70} ${B0 + 282},${CT + 4} Z`, L('#e6e0ee')) +
        K.path(`M${B0 + 170},${CT - 78} L${B0 + 236},${CT - 78} Q${B0 + 292},${CT - 70} ${B0 + 282},${CT + 4} L${B0 + 200},${CT + 4} Z`, S('#e6e0ee')));
      // comforter: quilted top, a soft hem down the near side and over the foot
      s += K.poly(R.qY(CT, B0, 1600, BD0, BD1 - 170), L(purple));
      s += R.patQuad(o, [[B0, CT, BD0], [B0, CT, BD1 - 170], [1600, CT, BD1 - 170], [1600, CT, BD0]], { w: 110, h: 110, inner: `<path d="M0,0 L110,110 M110,0 L0,110" stroke="${S(purple)}" stroke-width="4" opacity="0.55"/>` }, 1, 4);
      s += K.poly(R.qY(CT - 1, B0, 1600, BD0 + 250, BD0 + 320), L('#2e8b8b'), { opacity: 0.8 });
      const hemPts = [];
      for (let i = 0; i <= 12; i++) { const d = lerp(BD1 - 170, BD0, i / 12); hemPts.push(R.P(B0, 846 + Math.sin(i * 1.7) * 10, d)); }
      s += K.poly([R.P(B0, CT, BD0), R.P(B0, CT, BD1 - 170), ...hemPts], S(purple));
      for (const i of [3, 7, 10]) { const d = lerp(BD1 - 170, BD0, i / 12); const a2 = R.P(B0, CT + 10, d), b2 = R.P(B0, 840, d + 20); s += K.line(a2[0], a2[1], b2[0], b2[1], K.adj(S(purple), -0.25), 3, { opacity: 0.6 }); }
      s += K.poly([R.P(B0, CT, BD0 + 250), R.P(B0, CT, BD0 + 320), R.P(B0, 850, BD0 + 320), R.P(B0, 850, BD0 + 250)], S('#2e8b8b'), { opacity: 0.85 });
      let foot = `<path d="M${B0},${CT + 30} Q${B0},${CT} ${B0 + 30},${CT} L1600,${CT} L1600,860 Q${(B0 + 1600) / 2 + 60},876 ${(B0 + 1600) / 2},856 Q${B0 + 80},846 ${B0},866 Z" fill="${K.mix(S(purple), L(purple), 0.55)}"/>`;
      foot += K.rect(B0 + 4, CT + 10, 1600 - B0, 40, L(purple), { opacity: 0.4 }) + K.rect(B0 + 250 - 250 + 0, CT, 0, 0, 'none');
      s += at(BD0, foot);

      // nightstand
      const N0 = 1130, N1 = 1250, ND0 = DB - 150;
      s += R.box(N0, N1, 680, 900, ND0, DB - 20, { t: K.adj(L('#e6e0d2'), 0.04), l: S('#e6e0d2'), f: L('#e6e0d2') });
      let lv = '';
      // paperbacks
      const pbC = ['#c8402e', '#2a3a6a', '#d9a441', '#1a1a20', '#7a3a6a', '#e9e2d0', '#2e6b6b'];
      for (let i = 0; i < 6; i++) lv += K.rect(1140 + (rng() - 0.5) * 8, 668 - i * 12, 70, 11, L(pbC[i % pbC.length]));
      // lava lamp
      const lx = 1218;
      lv += K.path(`M${lx - 22},680 L${lx + 22},680 L${lx + 12},640 L${lx - 12},640 Z`, L('#b8b0a0'));
      const lg = lin(o, 'lava', [[0, '#c8508a'], [1, '#8a3a9a']]);
      lv += lg.def + K.path(`M${lx - 12},640 L${lx + 12},640 L${lx + 20},560 Q${lx + 14},520 ${lx + 8},500 L${lx - 8},500 Q${lx - 14},520 ${lx - 20},560 Z`, lg.url);
      lv += K.ellipse(lx - 2, 610, 9, 13, '#ffa040') + K.ellipse(lx + 5, 552, 7, 10, '#ffb050') + K.circle(lx - 4, 520, 4, '#ffb050');
      lv += K.path(`M${lx - 8},500 L${lx + 8},500 L${lx + 5},486 L${lx - 5},486 Z`, L('#b8b0a0'));
      s += at(ND0 + 40, lv);
      s += screen(K.glow(o, ...R.P(lx, 570, ND0 + 40), 110, '#ff7a6a', 0.4, 'lavag'));

      /* ---- posters: a starship (left), a launch (back), a ringed planet (right) ---- */
      // shuttle launch, back wall above the bed
      let sp = '';
      sp += K.rect(1300, 160, 250, 330, L('#14182a'));
      const plume = lin(o, 'plume', [[0, '#ffe2a0'], [1, '#e08a3c']]);
      sp += plume.def + K.path('M1418,400 Q1380,450 1330,480 L1520,480 Q1470,450 1438,400 Z', '#d8d4cc', { opacity: 0.9 }) + K.path('M1420,360 L1436,360 L1442,402 L1414,402 Z', plume.url);
      sp += K.rect(1421, 230, 14, 130, L('#d07a3a')) + K.rect(1410, 260, 8, 100, L('#efe8dc')) + K.rect(1438, 260, 8, 100, L('#efe8dc'));
      sp += K.path('M1428,250 L1440,276 L1440,350 L1452,362 L1404,362 L1416,350 L1416,276 Z', L('#efe8dc'), { transform: 'translate(-34 0)' });
      sp += K.rect(1300, 160, 250, 330, 'none', { stroke: L('#e6e0d2'), strokeWidth: 6 }) + K.rect(1320, 175, 210, 22, L('#2e8b8b'), { opacity: 0.6 });
      s += at(DB, sp);
      // starship silhouette, left wall
      s += R.patQuad(o, [[0, 160, 640], [0, 160, 1240], [0, 520, 1240], [0, 520, 640]], { w: 600, h: 360, inner: `<rect width="600" height="360" fill="${L('#1a1838')}"/><circle cx="300" cy="560" r="330" fill="${L('#6a5a9a')}"/><circle cx="300" cy="560" r="330" fill="none" stroke="${L('#c8a8e0')}" stroke-width="10" opacity="0.7"/>` + Array.from({ length: 30 }, () => `<circle cx="${n(rng() * 600)}" cy="${n(rng() * 220)}" r="${n(1 + rng() * 2.4)}" fill="#e8eef8" opacity="${n(0.4 + rng() * 0.5)}"/>`).join('') + `<path d="M110,190 L360,150 L500,166 L520,176 L500,186 L360,196 L250,214 L230,246 L196,248 L210,212 L150,206 Z M250,170 L210,110 L240,108 L300,160 Z" fill="#05060c"/><circle cx="112" cy="196" r="9" fill="#9ad0ff"/><circle cx="112" cy="196" r="20" fill="#9ad0ff" opacity="0.3"/>` }, 1, 3, 1);
      s += K.poly(R.qX(0, 640, 1240, 160, 520), 'none', { stroke: L('#e6e0d2'), strokeWidth: 3 });
      // ringed planet, right wall over the bed
      s += R.patQuad(o, [[1600, 140, 900], [1600, 140, 1500], [1600, 470, 1500], [1600, 470, 900]], { w: 600, h: 330, inner: `<rect width="600" height="330" fill="${L('#1a1430')}"/><circle cx="300" cy="165" r="90" fill="${L('#d9a441')}"/><path d="M210,150 Q300,130 390,150 L390,170 Q300,150 210,170 Z" fill="${L('#b8803a')}"/><ellipse cx="300" cy="170" rx="190" ry="34" fill="none" stroke="${L('#e9d2a0')}" stroke-width="14"/><path d="M210,165 A90,90 0 0 0 390,165 Z" fill="#000" opacity="0.25"/>` + Array.from({ length: 20 }, () => `<circle cx="${n(rng() * 600)}" cy="${n(rng() * 330)}" r="${n(1 + rng() * 2)}" fill="#e8eef8" opacity="0.6"/>`).join('') }, 1, 3, 1);
      s += K.poly(R.qX(1600, 900, 1500, 140, 470), 'none', { stroke: L('#e6e0d2'), strokeWidth: 3 });

      /* ---- a low shelf by the door, more paperbacks ---- */
      s += R.box(0, 150, 600, 900, 620, 1150, { r: L('#e6e0d2'), t: K.adj(L('#e6e0d2'), 0.05), f: S('#e6e0d2') });
      for (const y0 of [620, 760]) for (let d = 650; d < 1130; d += 26) { const c = L(pbC[Math.floor(rng() * pbC.length)]); s += K.poly(R.qX(150, d, d + 22, y0 + 10 + rng() * 20, y0 + 130), c); }

      /* ---- light ---- */
      const lampP = R.P(330, 430, DB - 150), radP = R.P(315, 520, DB - 110);
      s += K.shaft(o, [Pp(306, 430, DB - 150), Pp(354, 430, DB - 150), Pp(560, 620, DB - 60), Pp(80, 620, DB - 60)], '#ffd38a', 0.32, 'tlamp');
      s += screen(K.pool(o, ...Pp(330, 620, DB - 120), 260, 40, '#ffcf86', 0.5, 'tdesk'));
      s += screen(K.glow(o, lampP[0], lampP[1] + 30, 380, '#ffc878', 0.45, 'tlg'));
      s += screen(K.glow(o, radP[0], radP[1], 170, '#ffb050', 0.4, 'tradio'));
      s += K.shaft(o, [Pp(W0 + 8, WB, DB), Pp(W1 - 8, WB, DB), Pp(W1 + 200, 900, 900), Pp(W0 - 150, 900, 900)], '#8fa8e0', 0.1, 'tmoonf');
      s += falloff(o, radP[0] + 60, radP[1] - 40, 1050, '#08070f', 0.6, 0.18);
      const cool = rad(o, 'tcool', [[0, '#1a2a50', 0], [0.4, '#1a2a50', 0], [1, '#1a2a50', 0.35]], radP[0], radP[1], 1100);
      s += cool.def + `<rect x="-10" y="-10" width="1620" height="920" fill="${cool.url}" style="mix-blend-mode:multiply"/>`;
      s += K.band(o, 0, 150, '#08070f', 0.3, 0, 'tceil');
      // the stars glow on top of the dark
      s += st;
      return s;
    }
  });
  /* ================================================================ */
  /* 6. The Ashgrove front hall, a party going on without the parents:
   * dark paneling and oxblood damask, the sweeping stair, the stern
   * Ashgroves in oils, the tall clock, the fire — and in its glass case,
   * the old brass ship's lantern, unlit. Red cups on everything. */
  ART.bg('ashgrove', {
    times: ['night'],
    light: { night: 'interior_lamp' },
    draw(o) {
      o = U(o);
      const rng = o.rng, tt = 'lampnight';
      const L = (c) => tone(c, tt), S = (c) => shade(c, tt);
      const YC = -360, PANEL = 300;
      const R = mkRoom({ vx: 800, vy: 300, D: 2200, depth: 2000, Yc: YC, Yf: 900 });
      const DB = R.depth, at = R.at, Pp = R.P;
      const damask = '#5a2024', oak = '#4a2e1e', floorC = '#3e2618';
      const mixR = (c) => K.mix(S(c), L(c), 0.3);
      const cup = (x, y, h = 46) => K.path(`M${x - h * 0.36},${y - h} L${x + h * 0.36},${y - h} L${x + h * 0.27},${y} L${x - h * 0.27},${y} Z`, L('#c8282a')) + K.rect(x - h * 0.37, y - h, h * 0.74, h * 0.12, L('#e8e2da')) + K.path(`M${x + h * 0.06},${y - h * 0.86} L${x + h * 0.28},${y - h * 0.86} L${x + h * 0.21},${y - h * 0.04} L${x + h * 0.04},${y - h * 0.04} Z`, S('#c8282a'));
      // a portrait hung on a side wall: exact gilt frame, canvas mapped into it
      const sidePortrait = (X, d0, d1, y0, y1, kind) => {
        const fw = (d1 - d0) * 0.09, fh = (y1 - y0) * 0.07;
        return K.poly(R.qX(X, d0, d1, y0, y1), S('#a8843a')) + K.poly(R.qX(X, d0 + fw * 0.4, d1 - fw * 0.4, y0 + fh * 0.4, y1 - fh * 0.4), L('#a8843a')) +
          R.patQuad(o, [[X, y0 + fh, d0 + fw], [X, y0 + fh, d1 - fw], [X, y1 - fh, d1 - fw], [X, y1 - fh, d0 + fw]], { w: d1 - d0 - 2 * fw, h: y1 - y0 - 2 * fh, inner: ashPortrait(L, S, 0, 0, d1 - d0 - 2 * fw, y1 - y0 - 2 * fh, kind, rng, false) }, 1, 5, 1);
      };
      let s = '';

      /* ---- shell: damask above, tall oak paneling below ---- */
      s += K.poly(R.ceil, S('#2a1c16'));
      s += K.poly(R.qX(0, 0, DB, YC, PANEL), S(damask)) + K.poly(R.qX(1600, 0, DB, YC, PANEL), mixR(damask)) + K.poly(R.qB(0, 1600, YC, PANEL), L(damask));
      const dmT = (c) => ({ w: 110, h: 110, inner: MOTIF.damask(110, K.adj(c, -0.18)) });
      s += paperOn(o, R.qB(0, 1600, YC, PANEL), 'damask', K.adj(L(damask), -0.18), null, 58, 0.9);
      s += R.patQuad(o, [[0, YC, 0], [0, YC, DB], [0, PANEL, DB], [0, PANEL, 0]], dmT(S(damask)), 0.9, 8);
      s += R.patQuad(o, [[1600, YC, 0], [1600, YC, DB], [1600, PANEL, DB], [1600, PANEL, 0]], dmT(mixR(damask)), 0.9, 8);
      s += K.poly(R.qX(0, 0, DB, PANEL, 900), S(oak)) + K.poly(R.qX(1600, 0, DB, PANEL, 900), mixR(oak)) + K.poly(R.qB(0, 1600, PANEL, 900), L(oak));
      let pn = '';
      for (let X = 20; X < 1580; X += 150) for (const [y0, y1] of [[330, 560], [600, 860]]) pn += K.rect(X + 10, y0, 130, y1 - y0, S(oak)) + K.rect(X + 20, y0 + 10, 110, y1 - y0 - 20, K.adj(L(oak), 0.05));
      s += at(DB, pn);
      for (let d = 40; d < DB - 100; d += 260) for (const [y0, y1] of [[330, 560], [600, 860]]) s += K.poly(R.qX(0, d, d + 220, y0, y1), K.adj(S(oak), -0.15)) + K.poly(R.qX(0, d + 14, d + 206, y0 + 12, y1 - 12), S(oak));
      const strip = (y0, y1, c) => K.poly(R.qB(0, 1600, y0, y1), L(c)) + K.poly(R.qX(0, 0, DB, y0, y1), S(c)) + K.poly(R.qX(1600, 0, DB, y0, y1), mixR(c));
      s += strip(PANEL - 20, PANEL + 12, '#5a3a24') + strip(YC, YC + 60, '#3a2418') + strip(860, 900, '#2a1a10');
      // floor: dark boards, an oriental runner rug
      s += K.poly(R.floor, L(floorC)) + R.boards(o, rng, { w: 60, color: S('#1a0e08'), opacity: 0.5, ends: 0.2 });
      s += K.poly(R.qY(900, 260, 1100, 300, 1750), L('#2a2a48')) + K.poly(R.qY(900, 300, 1060, 340, 1710), L('#6a1e22')) + K.poly(R.qY(900, 520, 840, 800, 1250), L('#b8904a'), { opacity: 0.6 });

      /* ---- back wall: the fireplace under the patriarch, the dark archway, the tall clock ---- */
      let bw = '';
      // fireplace: dark marble surround, oak mantel, a low fire
      const FX0 = 20, FX1 = 400, FM = 450;
      bw += K.rect(FX0, FM + 20, FX1 - FX0, 900 - FM - 20, L('#34302f')) + K.rect(FX1 - 60, FM + 20, 60, 900 - FM - 20, S('#34302f'));
      bw += K.rect(FX0 - 24, FM, FX1 - FX0 + 48, 26, L('#5a3a24')) + K.rect(FX0 - 24, FM + 22, FX1 - FX0 + 48, 6, S('#5a3a24'));
      bw += K.rect(FX0 + 70, 610, FX1 - FX0 - 140, 290, '#0c0706');
      bw += K.path(`M${FX0 + 96},900 L${FX0 + 110},868 Q${FX0 + 150},820 ${FX0 + 170},860 Q${FX0 + 190},800 ${FX0 + 214},850 Q${FX0 + 250},810 ${FX0 + 262},870 L${FX1 - 90},900 Z`, '#c8501e');
      bw += K.path(`M${FX0 + 130},900 Q${FX0 + 170},862 ${FX0 + 196},880 Q${FX0 + 220},850 ${FX0 + 244},900 Z`, '#ffb050');
      bw += K.rect(FX0 + 80, 884, FX1 - FX0 - 160, 16, '#1a0e0a') + K.rect(FX0 + 60, 880, FX1 - FX0 - 120, 8, L('#b08a3e'));
      // candlesticks and cups on the mantel
      for (const x of [FX0 + 10, FX1 - 20]) bw += K.rect(x, FM - 60, 10, 60, L('#b08a3e')) + K.rect(x - 4, FM - 4, 18, 6, L('#b08a3e')) + K.rect(x + 1, FM - 100, 8, 40, L('#e8e0cc'));
      bw += cup(FX0 + 90, FM, 44) + cup(FX0 + 150, FM, 44) + cup(FX1 - 90, FM, 44);
      // the patriarch, over the mantel
      bw += ashPortrait(L, S, FX0 + 30, -250, FX1 - FX0 - 60, 660, 'patriarch', rng);
      // archway into the dark of the house
      const A0 = 480, A1 = 860, AT = 60;
      bw += K.path(`M${A0 - 40},900 L${A0 - 40},${AT + 190} A${(A1 - A0) / 2 + 40},${(A1 - A0) / 2 + 40} 0 0 1 ${A1 + 40},${AT + 190} L${A1 + 40},900 Z`, L('#5a3a24'));
      bw += K.path(`M${A0},900 L${A0},${AT + 190} A${(A1 - A0) / 2},${(A1 - A0) / 2} 0 0 1 ${A1},${AT + 190} L${A1},900 Z`, '#0a0606');
      bw += K.rect(A0 + 60, 380, 120, 300, '#120c0a') + K.rect(A0 + 210, 330, 100, 220, '#1a1210', { opacity: 0.8 }) + K.circle(A0 + 260, 300, 6, '#5a4a30') + K.path(`M${A0 + 220},310 Q${A0 + 260},350 ${A0 + 300},310`, 'none', { stroke: '#4a3a24', strokeWidth: 2 });
      bw += K.path(`M${A0},860 L${A1},860 L${A1},900 L${A0},900 Z`, '#1a1210');
      // a sconce between the fire and the arch
      bw += K.path('M440,280 q-16,0 -16,-16 l0,-24 q0,-12 12,-12 l8,0 q12,0 12,12 l0,24 q0,16 -16,16 Z', L('#b08a3e')) + K.path('M418,226 L462,226 L454,196 L426,196 Z', '#ffd090');
      // grandfather clock between the arch and the stair
      const gc = 990, mah = '#5a2a1c';
      bw += K.rect(gc - 90, 760, 180, 140, L(mah)) + K.rect(gc - 98, 750, 196, 14, K.adj(L(mah), 0.08));
      bw += K.rect(gc - 64, 330, 128, 430, L(mah)) + K.rect(gc + 30, 330, 34, 430, S(mah));
      bw += K.rect(gc - 40, 380, 80, 330, '#120a08') + K.line(gc, 400, gc, 620, L('#b08a3e'), 3) + K.circle(gc, 640, 24, L('#c9a050')) + K.circle(gc - 6, 634, 7, '#fff0c0', { opacity: 0.35 });
      bw += K.rect(gc - 22, 400, 8, 160, L('#b08a3e')) + K.rect(gc + 14, 400, 8, 200, L('#b08a3e'));
      bw += K.rect(gc - 80, 110, 160, 220, L(mah)) + K.rect(gc + 40, 110, 40, 220, S(mah));
      bw += K.circle(gc, 230, 56, L('#d9ccb0')) + K.circle(gc, 230, 56, 'none', { stroke: L('#b08a3e'), strokeWidth: 6 });
      bw += K.path(`M${gc - 44},200 A44,44 0 0 1 ${gc + 44},200 Z`, L('#2a3a6a')) + K.circle(gc - 14, 188, 9, L('#e8dcb8'));
      for (let i = 0; i < 12; i++) { const a2 = i / 12 * 6.2832; bw += K.circle(gc + Math.cos(a2) * 46, 230 + Math.sin(a2) * 46, 2.6, L('#2a2420')); }
      bw += K.line(gc, 230, gc - 6, 196, '#1a1210', 3) + K.line(gc, 230, gc + 26, 238, '#1a1210', 3);
      bw += K.path(`M${gc - 90},112 Q${gc - 70},40 ${gc - 14},60 L${gc - 14},80 Q${gc - 60},70 ${gc - 70},112 Z M${gc + 90},112 Q${gc + 70},40 ${gc + 14},60 L${gc + 14},80 Q${gc + 60},70 ${gc + 70},112 Z`, L(mah)) + K.circle(gc, 52, 10, L('#b08a3e'));
      s += at(DB, bw);

      /* ---- the staircase rising along the right wall to the landing ---- */
      const SX = 1150, N = 15, RISE = 58, RUN = 102, SD = 260;
      const stepD = (i) => SD + i * RUN, stepY = (i) => 900 - (i + 1) * RISE;
      // landing and its balustrade
      s += K.poly(R.qY(stepY(N - 1), SX, 1600, stepD(N - 1), DB), L(oak));
      s += K.poly(R.qB(SX, 1600, stepY(N - 1), stepY(N - 1) + 50, stepD(N - 1)), L('#5a3a24'));
      for (let X = SX + 20; X < 1600; X += 46) { const a = R.P(X, stepY(N - 1), stepD(N - 1)), b = R.P(X, stepY(N - 1) - 320, stepD(N - 1)); s += K.line(a[0], a[1], b[0], b[1], L('#3a2418'), 5); }
      const lr0 = R.P(SX, stepY(N - 1) - 320, stepD(N - 1)), lr1 = R.P(1600, stepY(N - 1) - 320, stepD(N - 1));
      s += K.line(lr0[0], lr0[1], lr1[0], lr1[1], L('#2a1a10'), 10);
      // the closed side of the stair: paneled spandrel
      const side = [R.P(SX, 900, SD)];
      for (let i = 0; i < N; i++) side.push(R.P(SX, stepY(i), stepD(i)), R.P(SX, stepY(i), stepD(i) + RUN));
      side.push(R.P(SX, 900, stepD(N - 1) + RUN));
      s += K.poly(side, S(oak));
      for (let i = 1; i < 6; i++) s += K.poly(R.qX(SX, SD + i * 240, SD + i * 240 + 180, stepY(Math.min(N - 1, Math.floor((i * 240 + 180) / RUN))) + 40, 860), K.adj(S(oak), -0.2));
      // treads and risers, top to bottom
      let stp = '';
      for (let i = N - 1; i >= 0; i--) {
        const d = stepD(i), y = stepY(i);
        if (y > R.vy) stp += K.poly(R.qY(y, SX, 1600, d, d + RUN), K.adj(L(oak), 0.06));
        stp += K.poly(R.qB(SX, 1600, y, y + RISE, d), L('#3a2418'));
        stp += K.poly(R.qB(SX, 1600, y, y + 8, d - 6), K.adj(L(oak), 0.12));
      }
      s += stp;
      // runner carpet up the middle of the stair
      for (let i = N - 1; i >= 0; i--) {
        const d = stepD(i), y = stepY(i);
        if (y > R.vy) s += K.poly(R.qY(y - 1, 1280, 1500, d, d + RUN), L('#5a1a1e'));
        s += K.poly(R.qB(1280, 1500, y, y + RISE, d - 1), L('#6a2024')) + K.poly(R.qB(1280, 1500, y + RISE - 10, y + RISE, d - 1), L('#b8904a'), { opacity: 0.6 });
      }
      // balusters and handrail along the open side
      let bal = '', rail = [];
      for (let i = 0; i < N; i++) for (const f of [0.25, 0.75]) {
        const d = stepD(i) + RUN * f, y = stepY(i);
        const a = R.P(SX + 16, y, d), b = R.P(SX + 16, y - 330 + (f - 0.5) * RISE, d);
        bal += K.line(a[0], a[1], b[0], b[1], L('#2a1a10'), Math.max(2, 7 * R.k(d)));
        rail.push(b);
      }
      s += bal + `<polyline points="${K.pts(rail)}" fill="none" stroke="${L('#2a1a10')}" stroke-width="10" stroke-linecap="round"/><polyline points="${K.pts(rail)}" fill="none" stroke="${L('#6a4a2e')}" stroke-width="3" stroke-linecap="round" transform="translate(-2 -3)"/>`;
      // the newel post with its lamp, at the foot of the sweep
      let nw = '';
      nw += K.path('M1020,900 L1020,862 Q1030,840 1100,842 L1600,842 L1600,900 Z', L('#3a2418'));
      nw += K.rect(1050, 520, 60, 330, L('#3a2418')) + K.rect(1090, 520, 20, 330, S('#3a2418')) + K.rect(1040, 500, 80, 26, L('#4a2e1e'));
      nw += K.rect(1066, 420, 28, 80, L('#7a5a2a')) + K.path('M1060,430 q20,-26 40,0 Z', L('#8a6a30'));
      nw += K.circle(1080, 400, 26, '#ffe2a8') + K.circle(1080, 400, 26, 'none', { stroke: '#fff4d8', strokeWidth: 3, opacity: 0.6 });
      nw += cup(1132, 520, 40);
      s += at(SD - 30, nw);
      // red cups on the stairs, a boombox on the fourth step
      for (const [i, X] of [[1, 1210], [3, 1540], [6, 1260], [7, 1520], [10, 1230]]) s += at(stepD(i) + 50, cup(X, stepY(i), 46));
      let bb = '';
      const bx = 1300, by = stepY(3);
      bb += K.path(`M${bx + 24},${by - 110} Q${bx + 90},${by - 150} ${bx + 156},${by - 110}`, 'none', { stroke: L('#55585e'), strokeWidth: 7 });
      bb += K.rect(bx, by - 110, 180, 110, L('#1e2024'), { rx: 10 }) + K.circle(bx + 40, by - 52, 32, L('#2e3036')) + K.circle(bx + 140, by - 52, 32, L('#2e3036')) + K.circle(bx + 40, by - 52, 12, L('#55585e')) + K.circle(bx + 140, by - 52, 12, L('#55585e'));
      bb += K.rect(bx + 74, by - 88, 32, 34, L('#101114')) + K.circle(bx + 112, by - 98, 3, '#ff5a3a');
      s += at(stepD(3) + 20, bb);
      // portraits climbing the stair wall
      s += sidePortrait(1600, 640, 1000, 160, 600, 'man') + sidePortrait(1600, 1120, 1440, -160, 240, 'patriarch');

      /* ---- the left wall: two more Ashgroves in oils ---- */
      s += sidePortrait(0, 900, 1250, -120, 340, 'woman') + sidePortrait(0, 1420, 1700, -80, 300, 'elder');

      /* ---- coats heaped on a chair by the door (left, near) ---- */
      let ch = '';
      ch += K.rect(60, 330, 24, 570, L('#3a2418')) + K.rect(300, 330, 24, 570, L('#3a2418')) + K.path('M60,330 Q192,290 324,330 L324,360 Q192,322 60,360 Z', L('#3a2418'));
      ch += K.path('M40,560 Q60,500 140,500 Q210,470 260,520 Q340,520 350,600 L360,720 L30,720 Z', L('#3e5a7a'));
      ch += K.path('M90,520 Q160,440 250,480 L300,600 L120,640 Z', L('#7a1e2a')) + K.path('M150,480 L160,520 L240,500 L230,470 Z', L('#d9a441')) + K.rect(118, 560, 120, 10, L('#d9a441'), { transform: 'rotate(-12 178 565)' });
      ch += K.path('M250,520 Q320,540 330,610 Q300,650 260,640 Z', L('#2a2a30')) + K.path('M60,640 Q120,700 200,690 L210,740 Q120,760 50,720 Z', L('#b8a888'));
      ch += K.path('M300,600 Q330,660 316,760', 'none', { stroke: L('#c8402e'), strokeWidth: 12 });
      s += at(640, `<g transform="translate(-20 0)">${ch}</g>`);

      /* ---- the display case and the brass ship's lantern, unlit ---- */
      const C0 = 480, C1 = 680, CD = 900, CT = 260, CB = 560;
      s += R.box(C0, C1, CT, CB, CD, CD + 160, { r: K.adj(S('#2a1a10'), 0.05), t: L('#4a2e1e') });
      let cs = '';
      // pedestal: carved, with the plaque
      cs += K.path(`M${C0 + 30},${CB} L${C1 - 30},${CB} L${C1 - 50},${CB + 60} L${C1 - 60},860 L${C1 - 20},900 L${C0 + 20},900 L${C0 + 60},860 L${C0 + 50},${CB + 60} Z`, L('#3a2418'));
      cs += K.path(`M${(C0 + C1) / 2 + 20},${CB} L${C1 - 30},${CB} L${C1 - 50},${CB + 60} L${C1 - 60},860 L${C1 - 20},900 L${(C0 + C1) / 2 + 30},900 Z`, S('#3a2418'));
      cs += K.rect(C0 + 40, CB + 70, C1 - C0 - 80, 46, L('#b8903e')) + K.rect(C0 + 44, CB + 74, C1 - C0 - 88, 38, 'none', { stroke: S('#b8903e'), strokeWidth: 2 });
      for (let i = 0; i < 3; i++) cs += K.rect(C0 + 60 + (i === 2 ? 20 : 0), CB + 84 + i * 9, C1 - C0 - 120 - (i === 2 ? 40 : 0), 2.5, S('#6a5020'));
      // the case: wood base and top, glass sides
      cs += K.rect(C0 - 6, CB - 20, C1 - C0 + 12, 26, L('#4a2e1e')) + K.rect(C0 - 6, CT - 10, C1 - C0 + 12, 22, L('#4a2e1e'));
      cs += K.rect(C0, CT + 12, C1 - C0, CB - CT - 32, '#2a3038', { opacity: 0.35 });
      s += at(CD, cs);
      // the lantern itself, inside
      let lt = '';
      const lx = (C0 + C1) / 2, brass = L('#b08a3e'), brassS = S('#b08a3e'), hiC = '#f6dc90';
      lt += K.ellipse(lx, CB - 26, 58, 9, brassS) + K.rect(lx - 56, CB - 52, 112, 26, brass) + K.rect(lx + 20, CB - 52, 36, 26, brassS);
      const gl = lin(o, 'lglass', [[0, L('#5a646a')], [0.45, L('#8a969a')], [1, L('#3e464c')]], 0, 0, 1, 0);
      lt += gl.def + K.rect(lx - 42, CB - 196, 84, 144, gl.url, { opacity: 0.85 });
      for (let y = CB - 186; y < CB - 56; y += 14) lt += K.line(lx - 42, y, lx + 42, y, L('#a8b4b8'), 1.2, { opacity: 0.3 });
      lt += K.line(lx - 22, CB - 194, lx - 22, CB - 54, '#f0e8d8', 3, { opacity: 0.22 });
      lt += K.rect(lx - 6, CB - 120, 12, 50, '#5a5040', { opacity: 0.5 });
      for (const x of [lx - 44, lx + 40]) lt += K.rect(x, CB - 200, 5, 150, brass);
      lt += K.rect(lx - 2, CB - 200, 4, 150, brass, { opacity: 0.8 });
      for (const y of [CB - 160, CB - 96]) lt += K.rect(lx - 46, y, 92, 6, brass);
      lt += K.path(`M${lx - 52},${CB - 196} Q${lx},${CB - 246} ${lx + 52},${CB - 196} Z`, brass) + K.path(`M${lx + 10},${CB - 230} Q${lx + 40},${CB - 222} ${lx + 52},${CB - 196} L${lx + 14},${CB - 196} Z`, brassS);
      lt += K.rect(lx - 14, CB - 262, 28, 30, brass) + K.rect(lx - 20, CB - 268, 40, 8, brass) + K.circle(lx, CB - 284, 13, 'none', { stroke: brass, strokeWidth: 4 });
      lt += K.line(lx - 36, CB - 218, lx - 10, CB - 236, hiC, 3, { opacity: 0.7 }) + K.line(lx - 50, CB - 44, lx - 20, CB - 44, hiC, 3, { opacity: 0.6 }) + K.line(lx - 42, CB - 196, lx - 42, CB - 60, hiC, 2, { opacity: 0.45 });
      s += at(CD + 80, lt);
      // glass front with its reflections, a red cup left on top of the case
      let gf = K.rect(C0, CT + 12, C1 - C0, CB - CT - 32, '#c8d4e0', { opacity: 0.06 });
      gf += K.poly([[C0 + 20, CT + 12], [C0 + 70, CT + 12], [C0 + 20, CT + 120]], '#ffffff', { opacity: 0.16 }) + K.poly([[C1 - 60, CB - 20], [C1 - 30, CB - 20], [C1, CB - 70], [C1, CB - 110]], '#ffffff', { opacity: 0.1 });
      gf += K.rect(C0, CT + 12, 6, CB - CT - 32, L('#4a2e1e')) + K.rect(C1 - 6, CT + 12, 6, CB - CT - 32, L('#4a2e1e'));
      gf += cup(C1 - 40, CT - 10, 44);
      s += at(CD, gf);

      /* ---- light: the newel lamp, the sconce, the fire; deep dark above ---- */
      const nl = R.P(1080, 400, SD - 30), sc = R.P(440, 210, DB), fp = R.P(210, 820, DB);
      s += screen(K.glow(o, nl[0], nl[1], 420, '#ffc070', 0.42, 'anl') + K.glow(o, nl[0], nl[1], 90, '#fff0c8', 0.5, 'anl2'));
      s += screen(K.glow(o, sc[0], sc[1], 160, '#ffc070', 0.4, 'asc'));
      s += screen(K.pool(o, fp[0] + 40, Pp(0, 900, DB - 200)[1] + 10, 300, 50, '#ff8a3a', 0.4, 'afp') + K.glow(o, fp[0], fp[1] - 30, 330, '#ff9a4a', 0.32, 'afg') + K.glow(o, fp[0], fp[1], 110, '#ffb060', 0.5, 'afg2'));
      s += screen(K.glow(o, R.P(lx, 420, CD)[0], R.P(lx, 420, CD)[1], 120, '#ffd890', 0.16, 'alant'));
      s += falloff(o, 760, 420, 1000, '#060404', 0.7, 0.2);
      s += K.band(o, 0, 260, '#060404', 0.75, 0, 'aceil');
      return s;
    }
  });
})();
