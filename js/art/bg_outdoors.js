/* What Derry Keeps — outdoor locations around Derry.
 *   barrens       the ravine at the edge of town: the stream, the culvert, the trestle
 *   standpipe     the Standpipe ruin in Memorial Park, the town spread out below
 *   canal         the downtown canal; `lanterns` is the night of the Lantern Float
 *   park          Bassey Park: Paul Bunyan, the playground, the canal beyond
 *   street_quiet  a residential street holding its breath during the Quiet
 * Style reference: bg_larch.js (flat two-tone shapes, light drawn as shapes,
 * lantern green only where something is wrong). */
(function () {
  'use strict';
  const K = window.KIT, P = K.PAL, n = K.n;

  const lighting = (t) => ({ L: (c) => K.tone(c, t), S: (c) => K.shade(c, t), T: K.TOD[t] || K.TOD.day });
  const SIGN = "'Barlow Condensed','Arial Narrow',sans-serif";
  const SCRAWL = "'Covered By Your Grace','Comic Sans MS',cursive";

  /* ---------- local helpers ----------
   * Many small shapes (leaves, blades, pebbles, mesh, crowds) are emitted as
   * path data and merged into one <path> per colour, and kept to few points,
   * so element counts and markup size stay phone-friendly. */
  const pd = (pts) => 'M' + pts.map((p) => n(p[0]) + ',' + n(p[1])).join('L') + 'Z';
  const ld = (pts) => 'M' + pts.map((p) => n(p[0]) + ',' + n(p[1])).join('L');
  const ellD = (cx, cy, rx, ry) => `M${n(cx - rx)},${n(cy)}a${n(rx)},${n(ry)} 0 1,0 ${n(2 * rx)},0a${n(rx)},${n(ry)} 0 1,0 ${n(-2 * rx)},0Z`;
  const domeD = (cx, cy, rx, ry) => `M${n(cx - rx)},${n(cy)}A${n(rx)},${n(ry)} 0 0,1 ${n(cx + rx)},${n(cy)}Z`;
  const litDomeD = (cx, cy, rx, ry) => `M${n(cx - rx)},${n(cy)}A${n(rx)},${n(ry)} 0 0,1 ${n(cx)},${n(cy - ry)}Q${n(cx + rx * 0.25)},${n(cy - ry * 0.3)} ${n(cx - rx * 0.1)},${n(cy)}Z`;
  /* a leaf as a rotated diamond (reads as a leaf at these sizes, a quarter of the markup) */
  const leafD = (x, y, len, wid, ang, sy = 1) => {
    const c = Math.cos(ang), si = Math.sin(ang);
    const p = (u, v) => n(x + u * c - v * si) + ',' + n(y + (u * si + v * c) * sy);
    return `M${p(-len, 0)}L${p(0, -wid)}L${p(len, 0)}L${p(0, wid)}Z`;
  };
  const bladeD = (x, y, h, w, lean) => `M${n(x - w)},${n(y)}Q${n(x + lean * 0.35)},${n(y - h * 0.55)} ${n(x + lean)},${n(y - h)}L${n(x + w)},${n(y)}Z`;
  const stroke = (d, color, w, o) => K.path(d, 'none', Object.assign({ stroke: color, strokeWidth: w }, o || {}));
  const smoothD = (pts, move = true) => {
    let d = (move ? 'M' : 'L') + n(pts[0][0]) + ',' + n(pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      d += `Q${n(p[0])},${n(p[1])} ${n((p[0] + q[0]) / 2)},${n((p[1] + q[1]) / 2)}`;
    }
    const l = pts[pts.length - 1];
    return d + `L${n(l[0])},${n(l[1])}`;
  };
  const lerpY = (pts, x) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
    return pts[pts.length - 1][1];
  };
  const bucket = () => {
    const m = new Map();
    return { add(c, d) { m.set(c, (m.get(c) || '') + d); }, out(o) { let r = ''; m.forEach((d, c) => { r += K.path(d, c, o); }); return r; } };
  };
  /* one radial gradient (objectBoundingBox) shared by many glow circles */
  const glowDef = (id, color, op) => K.radial(id, [[0, color, op], [0.35, color, op * 0.45], [1, color, 0]], 0.5, 0.5, 0.5, false);
  /* vertical fade band, transparent at both ends (no hard edges) */
  const band3 = (o, y, h, color, peak, name = 'b3', at = 0.5) => {
    const id = o.id(name);
    return K.defs(K.linear(id, [[0, color, 0], [at, color, peak], [1, color, 0]])) + K.rect(-10, y, 1620, h, `url(#${id})`);
  };

  /* KIT.blob with k points per lobe (fewer than the kit's 6), integer coords for big shapes */
  const blobL = (rng, cx, cy, rx, ry, { lobes = 6, jag = 0.25, scallop = 0.14, k = 3 } = {}) => {
    const N = lobes * k, ph = rng() * 6.28, ph2 = rng() * 6.28, pts = [];
    const r = Math.max(rx, ry) > 14 ? Math.round : n;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, lobe = Math.abs(Math.sin((a * lobes) / 2 + ph));
      const m = 1 + jag * Math.sin(a * 3 + ph2) * 0.6 + scallop * lobe + (rng() - 0.5) * jag * 0.35;
      pts.push([cx + Math.cos(a) * rx * m, cy + Math.sin(a) * ry * m]);
    }
    let d = `M${r((pts[0][0] + pts[N - 1][0]) / 2)},${r((pts[0][1] + pts[N - 1][1]) / 2)}`;
    for (let i = 0; i < N; i++) { const p = pts[i], q = pts[(i + 1) % N]; d += `Q${r(p[0])},${r(p[1])} ${r((p[0] + q[0]) / 2)},${r((p[1] + q[1]) / 2)}`; }
    return d + 'Z';
  };
  /* stones half out of water / ground: shadow domes + lit caps */
  const stonesD = (list) => { let sh = '', li = ''; for (const [x, y, rx, ry] of list) { sh += domeD(x, y, rx, ry); li += litDomeD(x, y, rx, ry); } return [sh, li]; };
  /* deciduous tree, same construction as KIT.tree but with lighter path data */
  const treeL = (rng, { x, base, h = 260, w = 200, colors, trunk }) => {
    const cy = base - h * 0.64, tw = Math.max(6, w * 0.055);
    let s = K.path(`M${n(x - tw)},${n(base)}C${n(x - tw * 0.7)},${n(base - h * 0.2)} ${n(x - tw * 0.6)},${n(cy + h * 0.15)} ${n(x - w * 0.2)},${n(cy - h * 0.1)}L${n(x - w * 0.16)},${n(cy - h * 0.13)}C${n(x - tw)},${n(cy + h * 0.02)} ${n(x)},${n(cy)} ${n(x + w * 0.04)},${n(cy - h * 0.2)}L${n(x + w * 0.08)},${n(cy - h * 0.19)}C${n(x + tw * 0.6)},${n(cy + h * 0.02)} ${n(x + w * 0.12)},${n(cy - h * 0.02)} ${n(x + w * 0.22)},${n(cy - h * 0.08)}L${n(x + w * 0.23)},${n(cy - h * 0.05)}C${n(x + tw)},${n(cy + h * 0.12)} ${n(x + tw * 0.6)},${n(base - h * 0.2)} ${n(x + tw)},${n(base)}Z`, trunk);
    s += K.path(blobL(rng, x, cy, w * 0.5, h * 0.34, { lobes: 8, jag: 0.22, scallop: 0.12, k: 4 }), colors[1]);
    s += K.path(blobL(rng, x - w * 0.08, cy - h * 0.06, w * 0.38, h * 0.25, { lobes: 7, jag: 0.25, scallop: 0.14, k: 4 }), colors[0]);
    let hl = '', pk = '', lv0 = '', lv1 = '';
    for (let i = 0; i < 4; i++) { const a = Math.PI * (1.0 + rng() * 0.7), rr = 0.3 + rng() * 0.5; hl += blobL(rng, x - w * 0.05 + Math.cos(a) * w * 0.3 * rr, cy - h * 0.06 + Math.sin(a) * h * 0.2 * rr, w * (0.07 + rng() * 0.07), h * (0.05 + rng() * 0.04), { lobes: 5, jag: 0.2, k: 3 }); }
    for (let i = 0; i < 3; i++) pk += blobL(rng, x + (rng() - 0.3) * w * 0.4, cy + rng() * h * 0.12, w * 0.07, h * 0.04, { lobes: 5, jag: 0.2, k: 3 });
    for (let i = 0; i < 12; i++) { const a = rng() * Math.PI * 2, d = leafD(x + Math.cos(a) * w * 0.52, cy + Math.sin(a) * h * 0.35, 5 + rng() * 4, 3, rng() * Math.PI); if (rng() < 0.5) lv0 += d; else lv1 += d; }
    return s + K.path(hl, colors[2], { opacity: 0.8 }) + K.path(pk, colors[1], { opacity: 0.7 }) + K.path(lv0, colors[0]) + K.path(lv1, colors[1]);
  };

  /* grass blades scattered over a band (nearer = taller) */
  const grassD = (rng, { x0, x1, y0, y1, count, hMin = 10, hMax = 28, w = 1.6, lean = 7 }) => {
    let d = '';
    for (let i = 0; i < count; i++) {
      const x = x0 + (x1 - x0) * rng(), y = y0 + (y1 - y0) * rng();
      const k = 0.55 + 0.45 * (y - y0) / Math.max(1, y1 - y0);
      d += bladeD(x, y, (hMin + (hMax - hMin) * rng()) * k, w * k, (rng() - 0.5) * 2 * lean * k);
    }
    return d;
  };
  /* fans of blades at [x, y, scale] */
  const tuftsD = (rng, pts, { blades = 7, h = 26, w = 1.6, spread = 12 } = {}) => {
    let d = '';
    for (const [cx, cy, sc = 1] of pts) for (let i = 0; i < blades; i++) {
      const a = i / (blades - 1) - 0.5;
      d += bladeD(cx + a * spread * sc, cy, h * sc * (0.55 + rng() * 0.6), w * sc, a * h * 0.9 * sc + (rng() - 0.5) * 6 * sc);
    }
    return d;
  };
  /* fallen leaves, one path per colour; `flat` squashes them onto the ground */
  const leafField = (rng, { count, x0, x1, y0, y1, colors, size = 7, opacity, flat = 0.55, persp = true }) => {
    const ds = colors.map(() => '');
    for (let i = 0; i < count; i++) {
      const x = x0 + (x1 - x0) * rng(), y = y0 + (y1 - y0) * rng();
      const k = persp ? 0.55 + 0.45 * (y - y0) / Math.max(1, y1 - y0) : 1;
      const sz = size * (0.6 + rng() * 0.8) * k;
      ds[Math.floor(rng() * colors.length)] += leafD(x, y, sz, sz * 0.45, rng() * Math.PI, flat);
    }
    return ds.map((d, i) => (d ? K.path(d, colors[i], opacity !== undefined ? { opacity } : null) : '')).join('');
  };
  /* standing human silhouette, feet at (x, base) */
  const personD = (x, base, h, { child = false, coat = 0 } = {}) => {
    const top = base - h, hr = h * (child ? 0.085 : 0.066);
    const sw = h * (child ? 0.105 : 0.12), shY = top + hr * 2.1 + h * 0.03;
    const hipY = base - h * (child ? 0.42 : 0.47), hw = h * (child ? 0.08 : 0.088);
    const hem = coat ? base - h * 0.18 : hipY, cw = coat * h * 0.035, crotch = coat ? hem : base - h * (child ? 0.38 : 0.43);
    return ellD(x, top + hr, hr * 0.86, hr) + pd([
      [x - hr * 0.45, top + hr * 1.8], [x - sw * 0.72, shY - h * 0.012], [x - sw, shY + h * 0.035],
      [x - sw * 1.04, base - h * 0.43], [x - sw * 0.8, base - h * 0.4], [x - hw - cw, hem],
      [x - hw * 0.8, base], [x - h * 0.014, base], [x, crotch], [x + h * 0.014, base],
      [x + hw * 0.8, base], [x + hw + cw, hem], [x + sw * 0.8, base - h * 0.4], [x + sw * 1.04, base - h * 0.43],
      [x + sw, shY + h * 0.035], [x + sw * 0.72, shY - h * 0.012], [x + hr * 0.45, top + hr * 1.8]]);
  };
  /* a band of autumn canopy: many two-tone blobs merged per colour */
  const canopyBand = (rng, { x0 = -40, x1 = 1640, y, amp = 14, r0 = 22, r1 = 46, step = 34, pairs, k = 0.8 }) => {
    const sh = bucket(), li = bucket();
    for (let x = x0; x < x1; x += step * (0.6 + rng() * 0.8)) {
      const [lc, sc] = rng.pick(pairs), r = r0 + (r1 - r0) * rng(), yy = y + (rng() - 0.5) * 2 * amp;
      sh.add(sc, blobL(rng, x + r * 0.12, yy + r * 0.1, r, r * k, { lobes: 6, jag: 0.25, scallop: 0.14, k: 4 }));
      li.add(lc, blobL(rng, x - r * 0.14, yy - r * 0.16, r * 0.74, r * k * 0.66, { lobes: 6, jag: 0.25, scallop: 0.14, k: 4 }));
    }
    return sh.out() + li.out();
  };
  /* a solid stand of trees: lumpy crown line, lit caps, solid below */
  const canopyMass = (rng, { x0 = -40, x1 = 1640, y, amp = 14, step = 30, r0 = 20, r1 = 40, mass, lits, k = 0.75, bottom = 920 }) => {
    let dm = `M${x0},${bottom}L${x0},${y}L${x1},${y}L${x1},${bottom}Z`;
    const lb = bucket();
    for (let x = x0; x < x1; x += step * (0.6 + rng() * 0.8)) {
      const r = r0 + (r1 - r0) * rng(), yy = y + (rng() - 0.5) * 2 * amp;
      dm += blobL(rng, x, yy, r, r * k, { lobes: 6, jag: 0.25, scallop: 0.14, k: 4 });
      lb.add(rng.pick(lits), blobL(rng, x - r * 0.1, yy - r * 0.22, r * 0.86, r * k * 0.66, { lobes: 6, jag: 0.25, scallop: 0.14, k: 4 }));
    }
    return K.path(dm, mass) + lb.out();
  };
  /* birch: slender pale trunk, dark lenticels, shadow side right; airy crown */
  const birch = (rng, { x, base, h, w = 14, lean = 0, bark, barkS, mark, crown = null, crownR = 1, branches = 5 }) => {
    const tx = x + lean, top = base - h, mx = x + lean * 0.4, my = base - h * 0.5;
    const at = (u) => [(1 - u) * (1 - u) * x + 2 * u * (1 - u) * mx + u * u * tx, (1 - u) * (1 - u) * base + 2 * u * (1 - u) * my + u * u * top];
    let s = K.path(`M${n(x - w / 2)},${n(base)}Q${n(mx - w * 0.42)},${n(my)} ${n(tx - w * 0.2)},${n(top)}L${n(tx + w * 0.2)},${n(top)}Q${n(mx + w * 0.42)},${n(my)} ${n(x + w / 2)},${n(base)}Z`, bark);
    s += K.path(`M${n(x + w * 0.12)},${n(base)}Q${n(mx + w * 0.1)},${n(my)} ${n(tx + w * 0.04)},${n(top)}L${n(tx + w * 0.2)},${n(top)}Q${n(mx + w * 0.42)},${n(my)} ${n(x + w / 2)},${n(base)}Z`, barkS);
    let d = '';
    for (let i = 0, m = Math.floor(h / 13); i < m; i++) {
      const u = rng() * 0.95, [cx, cy] = at(u), ww = w * (1 - u * 0.6);
      const l0 = cx - ww * 0.5, l1 = l0 + ww * (0.3 + rng() * 0.6), th = 1.2 + rng() * 2.2;
      d += `M${n(l0)},${n(cy)}L${n(l1)},${n(cy - th * 0.3)}L${n(l1 - 1)},${n(cy + th * 0.7)}L${n(l0)},${n(cy + th)}Z`;
    }
    s += K.path(d, mark, { opacity: 0.85 });
    let br = '';
    for (let i = 0; i < branches; i++) {
      const u = 0.5 + rng() * 0.45, [cx, cy] = at(u), sd = rng() < 0.5 ? -1 : 1, l = h * (0.1 + rng() * 0.14);
      br += `M${n(cx)},${n(cy)}q${n(sd * l * 0.4)},${n(-l * 0.4)} ${n(sd * l)},${n(-l * 0.9)}`;
    }
    if (br) s += stroke(br, barkS, Math.max(1.2, w * 0.16));
    if (crown) {
      const [lit, shade] = crown;
      let dl = '', ds = '';
      for (let i = 0; i < 9; i++) {
        const bx = tx + (rng() - 0.5) * h * 0.42 * crownR, by = top + h * (0.04 + rng() * 0.26), r = h * (0.045 + rng() * 0.05) * crownR;
        ds += blobL(rng, bx + r * 0.2, by + r * 0.18, r, r * 0.78, { lobes: 6, jag: 0.4, scallop: 0.22, k: 3 });
        dl += blobL(rng, bx - r * 0.18, by - r * 0.16, r * 0.74, r * 0.56, { lobes: 6, jag: 0.4, scallop: 0.22, k: 3 });
      }
      s += K.path(ds, shade) + K.path(dl, lit);
    }
    return s;
  };
  /* tangled shrub mass, lit upper-left, optional bare twigs */
  const shrub = (rng, x, y, rx, ry, [lit, shade], twig) => {
    let s = K.path(blobL(rng, x, y, rx, ry, { lobes: 8, jag: 0.3, scallop: 0.22, k: 4 }), shade);
    s += K.path(blobL(rng, x - rx * 0.16, y - ry * 0.2, rx * 0.72, ry * 0.6, { lobes: 7, jag: 0.3, scallop: 0.22, k: 4 }), lit);
    if (twig) {
      let d = '';
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI * (0.12 + rng() * 0.76), l = rx * (0.5 + rng() * 0.6), bx = x + (rng() - 0.5) * rx;
        d += `M${n(bx)},${n(y - ry * 0.3)}q${n(Math.cos(a) * l * 0.5)},${n(Math.sin(a) * l * 0.6)} ${n(Math.cos(a) * l)},${n(Math.sin(a) * l * 1.1)}`;
      }
      s += stroke(d, twig, 1.3);
    }
    return s;
  };
  /* staghorn sumac: scarlet mass, drooping leaflets at the edge, dark fruit cones */
  const sumac = (rng, x, y, sz, [lit, shade, cone]) => {
    let s = K.path(blobL(rng, x, y - sz * 0.35, sz, sz * 0.5, { lobes: 9, jag: 0.35, scallop: 0.25, k: 4 }), shade);
    s += K.path(blobL(rng, x - sz * 0.15, y - sz * 0.5, sz * 0.7, sz * 0.36, { lobes: 8, jag: 0.35, scallop: 0.25, k: 4 }), lit);
    let dl = '', dsh = '';
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * (1.0 + rng()), px = x + Math.cos(a) * sz * 0.95, py = y - sz * 0.35 + Math.sin(a) * sz * 0.55;
      const d = leafD(px, py, sz * (0.1 + rng() * 0.06), sz * 0.035, a + (rng() - 0.5) * 0.6);
      if (Math.cos(a) < 0.2) dl += d; else dsh += d;
    }
    s += K.path(dsh, shade) + K.path(dl, lit);
    let dc = '';
    for (let i = 0; i < 4; i++) {
      const cx = x + (rng() - 0.5) * sz, cy = y - sz * (0.75 + rng() * 0.2), k = sz / 60;
      dc += `M${n(cx - 3.5 * k)},${n(cy + 10 * k)}Q${n(cx - 4 * k)},${n(cy)} ${n(cx)},${n(cy - 9 * k)}Q${n(cx + 4 * k)},${n(cy)} ${n(cx + 3.5 * k)},${n(cy + 10 * k)}Z`;
    }
    return s + K.path(dc, cone);
  };
  /* chain-link mesh between two posts (top sags); returns path data */
  const chainD = (xa, ta, ba, xb, tb, bb, sag, cell) => {
    const top = (u) => ta + (tb - ta) * u + sag * 4 * u * (1 - u), bot = (u) => ba + (bb - ba) * u;
    const W = xb - xa, du = ((ba - ta) + (bb - tb)) / 2 / W;
    const pt = (u, v) => [xa + W * u, top(u) + (bot(u) - top(u)) * v];
    let d = '';
    for (let u0 = -du; u0 < 1 + du; u0 += cell / W) {
      for (const dir of [1, -1]) {
        let v0 = 0, v1 = 1;
        if (dir > 0) { if (u0 < 0) v0 = -u0 / du; if (u0 + du > 1) v1 = (1 - u0) / du; } else { if (u0 > 1) v0 = (u0 - 1) / du; if (u0 - du < 0) v1 = u0 / du; }
        if (v1 <= v0) continue;
        const pts = [];
        for (let k = 0; k <= 3; k++) { const v = v0 + (v1 - v0) * k / 3; pts.push(pt(u0 + dir * du * v, v)); }
        d += ld(pts);
      }
    }
    return d;
  };
  /* old brass ship's lantern, base at (x, y), burning lantern-green */
  const shipLantern = (o, x, y, sc = 1) => {
    const u = (v) => v * sc;
    const brass = '#3e4a26', brassL = '#7d9050', dark = '#18200f';
    let s = K.glow(o, x, y - u(26), u(70), '#e2fbd2', 0.75, 'lcore');
    s += K.path(`M${n(x - u(16))},${n(y)}L${n(x + u(16))},${n(y)}L${n(x + u(13))},${n(y - u(7))}L${n(x - u(13))},${n(y - u(7))}Z`, brass);
    s += K.rect(x - u(12), y - u(14), u(24), u(7), brassL) + K.rect(x + u(3), y - u(14), u(9), u(7), brass);
    const gid = o.id('lglass');
    s += K.defs(K.radial(gid, [[0, '#fdfff5'], [0.45, '#d9f7c4'], [1, P.lantern]], 0.5, 0.55, 0.6, false));
    s += K.path(`M${n(x - u(10))},${n(y - u(14))}Q${n(x - u(14))},${n(y - u(27))} ${n(x - u(10))},${n(y - u(40))}L${n(x + u(10))},${n(y - u(40))}Q${n(x + u(14))},${n(y - u(27))} ${n(x + u(10))},${n(y - u(14))}Z`, `url(#${gid})`);
    s += stroke(`M${n(x - u(6))},${n(y - u(14))}Q${n(x - u(9))},${n(y - u(27))} ${n(x - u(6))},${n(y - u(40))}M${n(x + u(6))},${n(y - u(14))}Q${n(x + u(9))},${n(y - u(27))} ${n(x + u(6))},${n(y - u(40))}M${n(x)},${n(y - u(14))}V${n(y - u(40))}M${n(x - u(12))},${n(y - u(27))}H${n(x + u(12))}`, dark, u(1.6), { opacity: 0.75 });
    s += K.path(`M${n(x - u(13))},${n(y - u(40))}L${n(x + u(13))},${n(y - u(40))}L${n(x + u(7))},${n(y - u(49))}L${n(x - u(7))},${n(y - u(49))}Z`, brassL);
    s += K.path(`M${n(x + u(2))},${n(y - u(40))}L${n(x + u(13))},${n(y - u(40))}L${n(x + u(7))},${n(y - u(49))}L${n(x + u(1))},${n(y - u(49))}Z`, brass);
    s += K.rect(x - u(4), y - u(55), u(8), u(6), brass) + K.rect(x - u(6), y - u(57), u(12), u(2.5), brassL);
    s += K.circle(x, y - u(63), u(6), 'none', { stroke: brassL, strokeWidth: u(2) });
    return s;
  };

  /* ================================================================== */
  /* The Barrens: an overgrown ravine at the edge of town. The Kenduskeag
   * runs shallow over stones; a concrete culvert mouth stares out of the
   * bank; a rail trestle crosses the valley upstream. */
  ART.bg('barrens', {
    times: ['day', 'dusk'],
    draw(o) {
      const t = o.time, rng = o.rng, dusk = t === 'dusk';
      const { L, S, T } = lighting(t);
      const hz = (c, k) => K.mix(c, T.haze, k);
      let s = K.sky(o, t);

      /* sky: thin overcast with the sun behind it / a low sun behind the trees */
      if (dusk) s += K.glow(o, 190, 330, 720, '#f7b06a', 0.6, 'sun') + K.clouds(rng, { count: 5, y0: 30, y1: 200, color: '#f0a07a', shadow: '#6e4f72', opacity: 0.55, w: 560 });
      else s += K.glow(o, 300, 30, 640, '#fffaf0', 0.5, 'sun') + K.clouds(rng, { count: 6, y0: 20, y1: 210, color: '#f4f1ea', shadow: '#c5cbd1', opacity: 0.7, w: 540 });

      /* distant ridge; the rail trestle crossing the valley upstream; the wooded hill it runs into */
      s += K.path(K.ridge(rng, { y: 300, amp: 16, steps: 18, jag: 0.3 }), hz(L(P.slate), 0.62));
      const tk = dusk ? 0.5 : 0.64, trL = hz(L('#4a3a30'), tk), trS = hz(S('#4a3a30'), tk);
      let tr = '';
      for (let x = 520; x < 1640; x += 42) tr += `M${x - 3},222L${x - 12},392M${x + 3},222L${x + 12},392`;
      for (let x = 520; x < 1620; x += 42) tr += `M${x - 5},236L${x + 47},276M${x + 47},236L${x - 5},276M${x - 8},276L${x + 50},318M${x + 50},276L${x - 8},318M${x - 10},318L${x + 52},360M${x + 52},318L${x - 10},360`;
      s += stroke(tr + 'M470,276H1620M470,318H1620M470,360H1620', trS, 1.3);
      s += K.rect(450, 213, 1180, 9, trL) + K.rect(450, 209, 1180, 3, trS);
      if (dusk) s += K.rect(450, 209, 1180, 2.5, '#f8b070', { opacity: 0.55 });
      const HILL = [[-20, 262], [100, 228], [220, 212], [330, 210], [440, 216], [520, 238], [610, 290], [680, 380]];
      s += K.path(smoothD(HILL) + 'L-20,390Z', hz(L(P.pine), 0.46));
      for (let x = -10; x < 610; x += 22 + rng() * 18) { const b = lerpY(HILL, x) + 12, hh = 20 + rng() * 24; s += K.pine(x, b, hh, hh * 0.42, hz(L(P.pine), 0.4), hz(S(P.pine), 0.4), rng); }

      /* the woods on the far slope: a hazy stand, the dark under-storey with trunks, a nearer stand */
      s += canopyMass(rng, { y: 350, amp: 14, step: 30, r0: 22, r1: 40, mass: hz(S('#6e4a30'), 0.44), lits: [hz(L('#a86a3a'), 0.44), hz(L('#ae8c3e'), 0.44), hz(L('#7a6e40'), 0.44)], bottom: 470 });
            s += K.rect(-10, 420, 1620, 60, hz(S('#3a3424'), 0.26));
      let trk = '';
      for (let x = -10; x < 1640; x += 14 + rng() * 26) trk += `M${n(x)},${n(410 + rng() * 14)}L${n(x + (rng() - 0.5) * 6)},476`;
      s += stroke(trk, hz(S('#2a221c'), 0.24), 3, { opacity: 0.8 });
      const crowns = [[P.ember, P.rust, P.mustard], [P.mustard, '#a87a2a', '#f0c868'], [P.rust, '#7e3a24', P.ember], ['#7a7a44', '#545a34', '#a09a54']];
      for (const [x, h, w, ci] of [[60, 250, 230, 0], [236, 210, 200, 1], [408, 268, 240, 2], [530, 196, 176, 3], [690, 236, 220, 0], [884, 252, 236, 1], [1084, 218, 200, 2], [1240, 272, 252, 0], [1436, 232, 220, 1], [1590, 262, 240, 2]]) {
        const c = crowns[ci], hk = 0.24;
        s += treeL(rng, { x, base: 476, h, w, colors: [hz(L(c[0]), hk), hz(S(c[1]), hk), hz(L(c[2]), hk)], trunk: hz(S('#3a2c26'), hk) });
      }

      s += K.pine(470, 486, 170, 72, hz(L(P.pine), 0.18), hz(S(P.pine), 0.18), rng) + K.pine(1172, 488, 190, 80, hz(L(P.pine), 0.18), hz(S(P.pine), 0.18), rng) + K.pine(1338, 486, 150, 64, hz(L(P.pine), 0.2), hz(S(P.pine), 0.2), rng);

      /* the far bank: brow, a mound of earth over the culvert, the face down to the water */
      const BT = [[-20, 470], [90, 462], [180, 476], [300, 470], [420, 482], [520, 474], [580, 452], [636, 410], [700, 364], [784, 350], [870, 360], [940, 410], [1000, 456], [1080, 470], [1180, 464], [1290, 476], [1400, 470], [1520, 480], [1620, 476]];
      const FW = [[-20, 604], [200, 600], [420, 598], [600, 592], [690, 579], [880, 579], [980, 571], [1120, 560], [1300, 550], [1460, 545], [1620, 541]];
      const NW = [[-20, 840], [240, 790], [480, 744], [740, 702], [980, 664], [1180, 636], [1360, 610], [1500, 594], [1620, 584]];
      const earth = '#6e5240', clay = '#94704c';
      const bg = o.id('bank');
      s += K.defs(K.linear(bg, [[0, L('#7a5c46')], [0.55, L(earth)], [1, S(earth)]], 0, 360, 0, 600, true));
      s += K.path(smoothD(BT) + smoothD(FW.slice().reverse(), false) + 'Z', `url(#${bg})`);
      s += K.path('M870,360 Q940,410 1000,456 L1020,572 L890,580 Q912,460 870,360 Z', S(earth), { opacity: 0.6 });
      // the upper bank is a weedy slope; only the lower cut shows bare earth
      const SL = [];
      for (let x = -20; x <= 1640; x += 40) SL.push([x, lerpY(BT, x) + 36 + 16 * Math.sin(x * 0.013) + rng() * 10]);
      s += K.path(smoothD(BT) + smoothD(SL.slice().reverse(), false) + 'Z', L('#6e6a40'));
      s += K.path(smoothD(BT) + smoothD(BT.map(([x, y]) => [x, y + 12]).reverse(), false) + 'Z', S('#5a5634'), { opacity: 0.8 });
      let hang = '';
      for (let x = -20; x < 1640; x += 7 + rng() * 8) { const y = lerpY(SL, x) - 2; hang += bladeD(x, y, -(6 + rng() * 14), 1.4, (rng() - 0.5) * 6); }
      s += K.path(hang, L('#6e6a40'));
      let clayD = '';
      for (let i = 0; i < 12; i++) {
        const x = rng() * 1640 - 20; if (x > 600 && x < 980) continue;
        const y0 = lerpY(BT, x) + 58, y1 = lerpY(FW, x) - 10; if (y1 - y0 < 14) continue;
        clayD += blobL(rng, x, y0 + rng() * (y1 - y0), 24 + rng() * 36, 5 + rng() * 6, { lobes: 5, jag: 0.3 });
      }
      s += K.path(clayD, L(clay), { opacity: 0.5 });
      let streak = '', roots = '';
      for (let i = 0; i < 40; i++) {
        const x = rng() * 1640 - 20, y0 = lerpY(BT, x) + 16, y1 = lerpY(FW, x) - 4; if (y1 - y0 < 18) continue;
        const a = y0 + rng() * (y1 - y0) * 0.5;
        streak += `M${n(x)},${n(a)}q${n((rng() - 0.5) * 8)},${n((y1 - a) * 0.5)} ${n((rng() - 0.5) * 6)},${n((y1 - a) * (0.4 + rng() * 0.5))}`;
      }
      for (let i = 0; i < 34; i++) {
        const x = rng() * 1640 - 20; if (x > 650 && x < 930) continue;
        const y = lerpY(BT, x) + 6, l = 12 + rng() * 34;
        roots += `M${n(x)},${n(y)}q${n((rng() - 0.5) * 20)},${n(l * 0.6)} ${n((rng() - 0.5) * 22)},${n(l)}`;
      }
      s += stroke(streak, S(earth), 1.6, { opacity: 0.45 }) + stroke(roots, L('#3a2a20'), 1.4, { opacity: 0.85 });
      // overhanging turf along the brow, rusty bracken on the face
      const turf = bucket();
      for (let x = -20; x < 1640; x += 30 + rng() * 40) { if (x > 620 && x < 950) continue; const y = lerpY(BT, x), r = 18 + rng() * 26; turf.add(hz(S('#4a4a2a'), 0.08), blobL(rng, x, y + 4, r, r * 0.45, { lobes: 5, jag: 0.35, k: 4 })); }
      s += turf.out();
      let fern = '';
      for (let i = 0; i < 26; i++) {
        const x = rng() * 1640 - 20; if (x > 620 && x < 960) continue;
        const y = lerpY(BT, x) + 18 + rng() * 40, l = 18 + rng() * 22, a = -Math.PI / 2 + (rng() - 0.5) * 1.6;
        for (let j = 1; j <= 5; j++) { const u = j / 6, px = x + Math.cos(a) * l * u, py = y + Math.sin(a) * l * u + u * u * l * 0.5; fern += leafD(px - 3, py, 5 * (1 - u * 0.5), 1.6, a - 1.2) + leafD(px + 3, py, 5 * (1 - u * 0.5), 1.6, a + 1.2); }
      }
      s += K.path(fern, L('#9a5a2e'), { opacity: 0.9 });
      const [bsS, bsL] = stonesD(Array.from({ length: 22 }, () => { const x = rng() * 1640 - 20, r = 6 + rng() * 12; return [x, lerpY(FW, x) + 1, r * 1.3, r * 0.8]; }).filter(([x]) => x < 640 || x > 960));
      s += K.path(bsS, S('#857e70')) + K.path(bsL, L('#a29a8a'));

      /* thickets, sumac and birches along the brow */
      const thick = [hz(L('#6a6236'), 0.1), hz(S('#4a4226'), 0.1)];
      for (const [x, r] of [[30, 66], [196, 56], [490, 48], [1040, 54], [1250, 70], [1520, 80]]) s += shrub(rng, x, lerpY(BT, x) - r * 0.2, r, r * 0.5, thick, L('#3a2c22'));
      const sumC = [L('#bd3b2a'), S('#8e2a22'), L('#5e1a1a')];
      for (const [x, sz] of [[340, 60], [1124, 66], [1372, 56], [606, 40], [944, 40]]) s += sumac(rng, x, lerpY(BT, x) + 8, sz, sumC);
      const bk = { bark: L(P.birch), barkS: S(P.birch), mark: L('#2a2622'), crown: [L(P.mustard), S(P.mustard)] };
      s += birch(rng, Object.assign({ x: 562, base: 466, h: 250, w: 11, lean: -30 }, bk));
      s += birch(rng, Object.assign({ x: 588, base: 462, h: 196, w: 9, lean: 18 }, bk));
      s += birch(rng, Object.assign({ x: 1016, base: 466, h: 226, w: 10, lean: 26 }, bk));
      s += K.path(tuftsD(rng, Array.from({ length: 44 }, () => { const x = rng() * 1640 - 20; return [x, lerpY(BT, x) + 6, 0.8 + rng() * 0.5]; }), { blades: 6, h: 22 }), L('#7c7a44'));

      /* ---- the culvert: concrete pipe mouth half-buried in the bank ---- */
      const CX = 784, CY = 444, R = 112, r = 88, conc = '#aaa496';
      s += K.path(ellD(CX + 12, CY + 10, R + 6, R + 3), S(earth));
      s += K.circle(CX, CY, R, L(conc));
      s += K.path(`M${n(CX + R * 0.77)},${n(CY - R * 0.64)}A${R},${R} 0 0,1 ${n(CX - R * 0.64)},${n(CY + R * 0.77)}A${n(R * 1.3)},${n(R * 1.2)} 0 0,0 ${n(CX + R * 0.77)},${n(CY - R * 0.64)}Z`, S(conc), { opacity: 0.55 });
      s += K.text(CX - 70, CY - 60, 'D.W.D. 1958', { fontFamily: SIGN, fontSize: 11, fill: S(conc), letterSpacing: 1, transform: `rotate(-38 ${CX - 70} ${CY - 60})`, opacity: 0.8 });
      let stain = '';
      for (let i = 0; i < 12; i++) { const a = Math.PI * (0.3 + rng() * 0.4), x = CX + Math.cos(a) * (r + 4), y = CY + Math.sin(a) * (r + 2); stain += `M${n(x - 2)},${n(y)}l${n(1 + rng() * 2)},${n(8 + rng() * 18)}l${n(2 + rng() * 2)},0Z`; }
      s += K.path(stain, S('#3e4430'), { opacity: 0.6 });
      const ig = o.id('cul');
      s += K.defs(K.radial(ig, [[0, '#030405'], [0.55, '#08090b'], [0.84, dusk ? '#0c0e10' : '#1e2224'], [1, dusk ? '#131518' : S(conc)]], CX - 3, CY - 20, r * 1.08));
      s += K.circle(CX, CY, r, `url(#${ig})`);
      s += stroke(ellD(CX - 1, CY - 9, r * 0.8, r * 0.78) + ellD(CX - 2, CY - 15, r * 0.6, r * 0.58), dusk ? '#101215' : '#262a2c', 2, { opacity: 0.7 });
      s += K.path(`M${n(CX - r * 0.86)},${n(CY + r * 0.5)}A${r},${r} 0 0,0 ${n(CX + r * 0.86)},${n(CY + r * 0.5)}Q${n(CX)},${n(CY + r * 0.62)} ${n(CX - r * 0.86)},${n(CY + r * 0.5)}Z`, dusk ? '#18181a' : S(conc), { opacity: 0.85 });
      s += K.path(`M${n(CX - r * 0.7)},${n(CY + r * 0.72)}A${r},${r} 0 0,0 ${n(CX + r * 0.72)},${n(CY + r * 0.7)}Q${n(CX + 10)},${n(CY + r * 0.78)} ${n(CX - r * 0.7)},${n(CY + r * 0.72)}Z`, dusk ? '#12100e' : '#3a3024');
      s += stroke(`M${n(CX - 40)},${n(CY + r * 0.86)}Q${n(CX)},${n(CY + r * 0.8)} ${n(CX + 46)},${n(CY + r * 0.86)}`, dusk ? '#4a3e4a' : '#8a9aa0', 1.5, { opacity: 0.7 });
      s += K.path(`M${n(CX + 2)},${n(CY + r - 4)}Q${n(CX + 10)},${n(CY + R - 6)} ${n(CX + 6)},${n(CY + R + 4)}L${n(CX + 2)},580L${n(CX + 24)},580L${n(CX + 16)},${n(CY + R + 4)}Q${n(CX + 20)},${n(CY + R - 6)} ${n(CX + 10)},${n(CY + r - 4)}Z`, dusk ? '#8a7a8e' : '#a9b7bc', { opacity: 0.85 });
      s += stroke(`M${n(CX + 8)},${n(CY + r)}Q${n(CX + 14)},${n(CY + R)} ${n(CX + 10)},578`, dusk ? '#c6a6a6' : '#e6eef0', 1.4, { opacity: 0.8 });
      // the grate, hanging askew from its one remaining hinge
      const gx = CX - 66, gy = CY - 58, gc = L('#8a4a2a'), gs = S('#6a3420');
      let gb = '';
      for (let i = 1; i < 8; i++) gb += `M${n(i * 14)},2V122`;
      gb += 'M2,42H110M2,82H110';
      s += `<g transform="translate(${gx},${gy}) rotate(23) skewY(-6)">` + stroke(gb, gs, 4) + stroke(gb, gc, 2, { transform: 'translate(-1,-1)' }) + K.rect(0, 0, 112, 124, 'none', { stroke: gc, strokeWidth: 6 }) + K.rect(-6, -4, 14, 14, gs) + '</g>';
      s += K.path(`M${n(gx - 4)},${n(gy + 4)}l3,24l2,0l-1,-24Z`, L('#8a4a2a'), { opacity: 0.5 });
      // apron slab and a few riprap boulders
      s += K.path(`M${CX - 124},554 L${CX + 130},554 L${CX + 166},580 L${CX - 156},580 Z`, L('#9c9688'));
      s += K.path(`M${CX - 156},575 L${CX + 166},575 L${CX + 168},581 L${CX - 158},581 Z`, S('#9c9688'));
      s += stroke(`M${CX - 60},556 l14,8 l-6,10 M${CX + 70},555 l-10,9 l8,11`, S('#9c9688'), 1.4);
      const [rkS, rkL] = stonesD([[CX - 118, 556, 34, 24], [CX - 92, 562, 22, 15], [CX - 132, 528, 20, 16], [CX + 116, 558, 30, 22], [CX + 140, 562, 20, 13], [CX + 124, 524, 16, 13], [CX - 40, 566, 14, 8]]);
      s += K.path(rkS, S('#8a8478')) + K.path(rkL, L('#a29c90'));
      s += K.path(`M${CX - 126},${CY - 40} Q${CX - 104},${CY - 98} ${CX - 40},${CY - 112} Q${CX + 20},${CY - 122} ${CX + 70},${CY - 104} Q${CX + 114},${CY - 88} ${CX + 132},${CY - 40} Q${CX + 114},${CY - 116} ${CX + 20},${CY - 134} Q${CX - 96},${CY - 134} ${CX - 126},${CY - 40} Z`, L('#7a5c46'));
      let vine = '';
      for (let i = 0; i < 14; i++) { const a = Math.PI * (1.12 + i / 13 * 0.76), x = CX + Math.cos(a) * (R - 4), y = CY + Math.sin(a) * (R - 4), l = 12 + rng() * 32; vine += `M${n(x)},${n(y)}q${n((rng() - 0.5) * 12)},${n(l * 0.5)} ${n((rng() - 0.5) * 10)},${n(l)}`; }
      s += stroke(vine, L('#4a3a28'), 1.5, { opacity: 0.9 });
      s += K.path(tuftsD(rng, Array.from({ length: 16 }, (_, i) => { const a = Math.PI * (1.08 + i / 15 * 0.84); return [CX + Math.cos(a) * (R + 8), CY + Math.sin(a) * (R + 8) + 4, 0.9 + rng() * 0.5]; }), { blades: 6, h: 24 }), L('#86804a'));

      /* ---- the stream ---- */
      const waterD = smoothD(FW) + smoothD(NW.slice().reverse(), false) + 'Z';
      const wg = o.id('water'), wc = o.id('wclip');
      const wS = dusk ? [[0, '#2e2832'], [0.16, '#4e3a46'], [0.4, '#b07e84'], [0.62, '#c69088'], [1, '#382a32']] : [[0, '#3e443c'], [0.16, '#6a6a50'], [0.4, '#a6b6ba'], [0.62, '#bccacc'], [1, '#625c4a']];
      s += K.defs(K.linear(wg, wS, 0, 562, 0, 820, true), `<clipPath id="${wc}"><path d="${waterD}"/></clipPath>`) + K.path(waterD, `url(#${wg})`);
      let wd = '';
      wd += K.path('M1040,574 Q1300,556 1640,548 L1640,560 Q1300,568 1060,586 Z', dusk ? '#e2a490' : '#d4dee0', { opacity: 0.55 });
      // the culvert mirrored under its apron, broken by the current
      // the culvert mirrored under its apron, broken into dashes by the current
      const ry0 = 582 + (582 - CY) * 0.42, rRy = R * 0.44, mRy = r * 0.4;
      let refRing = '', refMouth = '';
      for (let y = 584; y < ry0 + rRy; y += 3.5 + rng() * 2.5) {
        const dy = (y - ry0) / rRy; if (Math.abs(dy) >= 1) continue;
        const hw = R * Math.sqrt(1 - dy * dy) * (0.8 + rng() * 0.3), jx = (rng() - 0.5) * 10, th = 1.6 + rng() * 1.8;
        refRing += `M${n(CX - hw + jx)},${n(y)}h${n(hw * 2)}v${n(th)}h${n(-hw * 2)}Z`;
        const my = (y - ry0) / mRy;
        if (Math.abs(my) < 1) { const mw = r * Math.sqrt(1 - my * my) * (0.75 + rng() * 0.3); refMouth += `M${n(CX - mw + jx)},${n(y)}h${n(mw * 2)}v${n(th + 0.6)}h${n(-mw * 2)}Z`; }
      }
      wd += K.path(refRing, dusk ? '#7a6470' : '#9a968c', { opacity: 0.5 }) + K.path(refMouth, dusk ? '#120e16' : '#26282a', { opacity: 0.6 });
      for (const bx of [552, 590, 1026]) wd += K.rect(bx - 4, lerpY(FW, bx) + 2, 7, 56, L(P.birch), { opacity: 0.28 });
      let ripL = '', ripD = '', spark = '';
      for (let i = 0; i < 150; i++) {
        const x = rng() * 1640 - 20, y0 = lerpY(FW, x), y1 = lerpY(NW, x), y = y0 + (y1 - y0) * rng(), l = (8 + rng() * 30) * (0.5 + (y - 560) / 260);
        if (y < 630) ripL += `M${n(x)},${n(y)}h${n(l)}`; else if (rng() < 0.7) ripD += `M${n(x)},${n(y)}h${n(l)}`; else spark += `M${n(x)},${n(y)}h${n(l * 0.4)}`;
      }
      wd += stroke(ripL, dusk ? '#c89090' : '#c6d0d0', 1.4, { opacity: 0.5 }) + stroke(ripD, dusk ? '#4a3440' : '#6a7a78', 1.4, { opacity: 0.4 }) + stroke(spark, '#ffffff', 1.6, { opacity: dusk ? 0.35 : 0.7 });
      let sub = '';
      for (let i = 0; i < 30; i++) { const x = rng() * 1500 - 20, y = lerpY(NW, x) - 6 - rng() * 44; sub += blobL(rng, x, y, 10 + rng() * 16, 4 + rng() * 5, { lobes: 5, jag: 0.3 }); }
      wd += K.path(sub, dusk ? '#2e2228' : '#5e5444', { opacity: 0.4 });
      s += `<g clip-path="url(#${wc})">${wd}</g>`;
      s += stroke(smoothD(FW), dusk ? '#1a141c' : '#2e2a22', 2.4, { opacity: 0.55 });

      /* stepping stones out to the culvert apron, boulders, a little white water */
      const stones = [[600, 712, 30, 13], [634, 678, 26, 12], [660, 646, 24, 11], [684, 616, 22, 10], [712, 592, 20, 9]];
      for (let i = 0; i < 30; i++) {
        const x = rng() * 1500 - 10; if (x > 560 && x < 960) continue;
        const y0 = lerpY(FW, x) + 6, y1 = lerpY(NW, x) - 2; if (y1 - y0 < 8) continue;
        const y = y0 + (y1 - y0) * Math.sqrt(rng()), k = 0.5 + (y - 560) / 240, rx = (6 + rng() * 12) * k;
        stones.push([x, y, rx, rx * (0.55 + rng() * 0.2)]);
      }
      let wl = '', rif = '';
      for (const [x, y, rx, ry] of stones) { wl += ellD(x, y + 1, rx * 1.12, ry * 0.22); if (rx > 12) rif += `M${n(x + rx * 0.7)},${n(y - ry * 0.1)}q${n(rx * 0.5)},${n(ry * 0.2)} ${n(rx * 0.5)},${n(ry * 0.5)}`; }
      const [stS, stL] = stonesD(stones);
      s += K.path(wl, dusk ? '#1a1418' : '#3a3a34', { opacity: 0.5 }) + K.path(stS, S('#857e70')) + K.path(stL, L('#aaa292')) + stroke(rif, dusk ? '#f0c2b0' : '#f4f8f6', 1.6, { opacity: 0.55, strokeLinecap: 'round' });

      /* the shopping cart, tipped nose-down into the water */
      const cc = L('#8e8676'), cs = S('#4e463e');
      let mesh = '';
      for (let i = 0; i <= 14; i++) { const u = i / 14; mesh += `M${n(u * 110)},0L${n(16 + u * 84)},56`; }
      for (let j = 0; j <= 7; j++) { const v = j / 7; mesh += `M${n(16 * v)},${n(56 * v)}L${n(110 - 10 * v)},${n(56 * v)}`; }
      const cartFrame = 'M0,0L110,0L100,56L16,56Z M110,0L124,-12 M0,0L-16,-10L-18,-30 M18,56L20,72L98,72L100,56 M24,72V82 M94,72V82';
      s += `<g transform="translate(928,514) rotate(18) scale(1.25)">` + stroke(mesh, cs, 2.6, { opacity: 0.6 }) + stroke(mesh, cc, 1.2) + stroke(cartFrame, cs, 4.5) + stroke(cartFrame, cc, 2.6) + K.rect(-26, -36, 16, 9, L('#a83a30')) + K.circle(24, 84, 7, '#1c1a1a') + K.circle(94, 84, 7, '#1c1a1a') + K.circle(24, 84, 2.5, L('#9a9a9a')) + K.circle(94, 84, 2.5, L('#9a9a9a')) + '</g>';
      s += `<g clip-path="url(#${wc})">` + K.path('M880,588 Q980,580 1100,573 L1120,720 L870,720 Z', `url(#${wg})`, { opacity: 0.88 }) + '</g>';
      s += stroke('M912,585 q40,-5 84,-6 q40,-2 80,-6', dusk ? '#f0c2b0' : '#f2f6f4', 1.6, { opacity: 0.75 });

      /* the fallen tree across the stream, root plate up-ended on the far bank */
      const lx0 = 150, ly0 = 462, lx1 = 522, ly1 = 736, la = Math.atan2(ly1 - ly0, lx1 - lx0) * 180 / Math.PI, len = Math.hypot(lx1 - lx0, ly1 - ly0);
      s += K.path(`M${lx0 + 60},${ly0 + 110} L${lx1 + 10},${ly1 + 12} L${lx1 - 2},${ly1 + 26} L${lx0 + 46},${ly0 + 126} Z`, '#1a1612', { opacity: 0.25 });
      s += K.path(K.blob(rng, 128, 432, 52, 64, { lobes: 7, jag: 0.35 }), S('#3a2a20'));
      let rt = '';
      for (let i = 0; i < 16; i++) { const a = rng() * Math.PI * 2, l = 44 + rng() * 34; rt += `M128,432q${n(Math.cos(a) * l * 0.6)},${n(Math.sin(a) * l * 0.4)} ${n(Math.cos(a) * l)},${n(Math.sin(a) * l * 1.1)}`; }
      s += stroke(rt, S('#3a2a20'), 2.4) + K.path(blobL(rng, 122, 424, 32, 42, { lobes: 6, jag: 0.3, k: 5 }), L('#5a4232'));
      const wood = '#958c7c';
      let cracks = '';
      for (let i = 0; i < 9; i++) { const v = (rng() - 0.5) * 30, u0 = rng() * len * 0.6; cracks += `M${n(u0)},${n(v)}L${n(u0 + 60 + rng() * 120)},${n(v * 0.7)}`; }
      s += `<g transform="translate(${lx0},${ly0}) rotate(${n(la)})">` +
        K.path(`M0,-23 Q${n(len * 0.5)},-21 ${n(len)},-14 L${n(len + 8)},-6 L${n(len + 1)},1 L${n(len + 9)},8 L${n(len)},14 Q${n(len * 0.5)},20 0,23 Z`, L(wood)) +
        K.path(`M0,-23 Q${n(len * 0.5)},-21 ${n(len)},-14 L${n(len + 4)},-10 Q${n(len * 0.5)},-14 0,-14 Z`, K.adj(L(wood), 0.18)) +
        K.path(`M0,6 L${n(len)},4 L${n(len + 9)},8 L${n(len)},14 Q${n(len * 0.5)},20 0,23 Z`, S(wood)) +
        stroke(cracks, S(wood), 1.4, { opacity: 0.8 }) +
        K.path(`M${n(len * 0.32)},-19 l-8,-26 l8,0 l5,24Z M${n(len * 0.64)},-13 l12,-22 l6,4 l-10,18Z`, L(wood)) +
        K.path(`M${n(len * 0.44)},-18 q22,-6 48,-1 l-2,7 q-24,-4 -46,2Z`, L('#5f6a36'), { opacity: 0.85 }) +
        K.ellipse(len - 1, 0, 5, 13, K.adj(L(wood), 0.25)) + '</g>';

      /* the near bank: gravel bar, the dirt path climbing upstream, leaf litter */
      s += K.path(smoothD(NW) + 'L1640,920L-20,920Z', L('#6a5840'));
      s += K.path(smoothD(NW) + smoothD(NW.map(([x, y]) => [x, y + 26]).reverse(), false) + 'Z', L('#8e8170'), { opacity: 0.75 });
      let gv = '', gvS = '';
      for (let i = 0; i < 170; i++) { const x = rng() * 1640 - 20, y = lerpY(NW, x) + rng() * 28, k = 0.6 + (y - 570) / 300, rx = (2 + rng() * 5) * k; if (rng() < 0.6) gv += ellD(x, y, rx, rx * 0.55); else gvS += ellD(x, y, rx, rx * 0.55); }
      s += K.path(gvS, S('#9a9286')) + K.path(gv, L('#bdb4a2'));
      s += stroke(smoothD(NW), dusk ? '#2a2026' : '#4a4234', 2, { opacity: 0.5 });
      const moss = bucket();
      for (let i = 0; i < 14; i++) { const x = rng() * 1640 - 20, y0 = lerpY(NW, x) + 40; if (y0 > 880) continue; moss.add(rng() < 0.5 ? L('#6a6a3c') : L('#5e5434'), blobL(rng, x, y0 + rng() * (900 - y0), 50 + rng() * 80, 10 + rng() * 14, { lobes: 6, jag: 0.4, k: 4 })); }
      s += moss.out({ opacity: 0.7 });
      const PATH = [[900, 930], [990, 820], [1100, 740], [1230, 682], [1370, 644], [1500, 622], [1640, 608]], PW = [128, 104, 82, 60, 42, 30, 22];
      const le = [], re = [];
      PATH.forEach(([x, y], i) => {
        const a = PATH[Math.max(0, i - 1)], b = PATH[Math.min(PATH.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
        le.push([x - dy / l * PW[i] / 2, y + dx / l * PW[i] / 2]); re.push([x + dy / l * PW[i] / 2, y - dx / l * PW[i] / 2]);
      });
      s += K.path(smoothD(le) + smoothD(re.slice().reverse(), false) + 'Z', L('#a08562'));
      s += K.path(smoothD(PATH.map(([x, y], i) => [x - PW[i] * 0.1, y])) + smoothD(PATH.map(([x, y], i) => [x + PW[i] * 0.18, y + 2]).reverse(), false) + 'Z', L('#b89c76'), { opacity: 0.55 });
      s += stroke('M930,850 q40,-14 90,-4 M1030,770 q30,-12 60,-2 M1170,706 q20,-8 44,-1', L('#4a3626'), 3, { opacity: 0.7 });
      // an old tire half sunk in the gravel
      s += K.path(ellD(1196, 652, 30, 13), '#141414') + K.path(ellD(1196, 650, 15, 6), L('#6a5840')) + K.path(`M1166,652 A30,13 0 0,1 1226,652 L1220,650 A24,10 0 0,0 1172,650 Z`, L('#3a3a3a'));
      const onBank = (pts) => pts.filter(([x, y]) => y > lerpY(NW, x) + 12);
      const gDots = (count, y0) => onBank(Array.from({ length: count }, () => [rng() * 1660 - 20, y0 + rng() * (905 - y0)]));
      let gA = '', gB = '';
      for (const [x, y] of gDots(320, 590)) { const k = 0.5 + (y - 590) / 320, h = (10 + rng() * 26) * k; if (rng() < 0.6) gA += bladeD(x, y, h, 1.6 * k, (rng() - 0.5) * 14 * k); else gB += bladeD(x, y, h, 1.6 * k, (rng() - 0.5) * 14 * k); }
      s += K.path(gA, L('#6f7440')) + K.path(gB, S('#5a5e34'));
      const lc = [L(P.rust), L(P.ember), L(P.mustard), S(P.rust)], lv = lc.map(() => '');
      for (const [x, y] of gDots(300, 590)) { const k = 0.55 + (y - 590) / 700, sz = 7 * (0.6 + rng() * 0.8) * k; lv[Math.floor(rng() * 4)] += leafD(x, y, sz, sz * 0.45, rng() * Math.PI, 0.55); }
      s += lv.map((d, i) => K.path(d, lc[i])).join('');

      /* foreground: birches framing the left, a yellow canopy overhead, a maple top right, sumac and bramble */
      const fk = { bark: L('#d2cbb8'), barkS: S('#c4bca8'), mark: L('#221e1c') };
      s += birch(rng, Object.assign({ x: 64, base: 940, h: 1010, w: 44, lean: 30, branches: 0 }, fk));
      s += birch(rng, Object.assign({ x: 202, base: 930, h: 990, w: 20, lean: -36, branches: 0 }, fk));
      const crownL = bucket();
      for (let i = 0; i < 24; i++) { const x = -30 + rng() * 420, y = -30 + rng() * 150 + x * 0.08, rr = 30 + rng() * 34; crownL.add(S(P.mustard), blobL(rng, x + rr * 0.2, y + rr * 0.2, rr, rr * 0.7, { lobes: 6, jag: 0.4, scallop: 0.22, k: 4 })); }
      for (let i = 0; i < 20; i++) { const x = -30 + rng() * 400, y = -40 + rng() * 130 + x * 0.06, rr = 24 + rng() * 28; crownL.add(L(P.mustard), blobL(rng, x, y, rr, rr * 0.62, { lobes: 6, jag: 0.4, scallop: 0.22, k: 4 })); }
      s += crownL.out();
      s += leafField(rng, { count: 30, x0: 0, x1: 520, y0: 120, y1: 560, colors: [L(P.mustard), S(P.mustard)], size: 6, flat: 1, persp: false });
      const mapleB = bucket();
      for (let i = 0; i < 18; i++) { const x = 1240 + rng() * 420, y = -40 + rng() * 120 + (x - 1240) * 0.2, rr = 40 + rng() * 40; mapleB.add(S(P.rust), blobL(rng, x + 10, y + 12, rr, rr * 0.72, { lobes: 7, jag: 0.3, k: 4 })); }
      for (let i = 0; i < 14; i++) { const x = 1260 + rng() * 400, y = -50 + rng() * 110 + (x - 1260) * 0.18, rr = 30 + rng() * 32; mapleB.add(L(P.ember), blobL(rng, x, y, rr, rr * 0.66, { lobes: 7, jag: 0.3, k: 4 })); }
      s += mapleB.out();
      s += K.path('M1562,920 C1556,700 1566,420 1592,180 L1640,170 L1640,920 Z', S('#2e241f')) + K.path('M1572,920 C1568,700 1576,430 1598,190 L1606,190 C1586,430 1580,700 1584,920 Z', L('#3e3028'));
      s += sumac(rng, 80, 900, 170, [L('#a8302a'), S('#7a2222'), L('#4e1616')]);
      s += sumac(rng, 290, 950, 120, [L('#b8382a'), S('#8a2a22'), L('#4e1616')]);
      s += shrub(rng, 1500, 770, 170, 120, [L('#5a5430'), S('#3e3a22')], L('#2e2218'));
      s += shrub(rng, 1610, 650, 110, 76, [L('#6a3a26'), S('#4a2a1e')], L('#2e2218'));

      /* light */
      if (!dusk) {
        s += K.shaft(o, [[300, 0], [420, 0], [800, 620], [600, 640]], '#fff4da', 0.1, 'sh1', [0, 0, 0.4, 1]);
        s += K.shaft(o, [[1060, 0], [1130, 0], [1330, 590], [1190, 600]], '#fff4da', 0.07, 'sh2', [0, 0, 0.3, 1]);
        const dap = o.id('dap');
        s += K.defs(K.radial(dap, [[0, '#fff2d0', 0.32], [0.6, '#fff2d0', 0.12], [1, '#fff2d0', 0]], 0.5, 0.5, 0.5, false));
        for (let i = 0; i < 22; i++) {
          const x = 300 + rng() * 1200, y0 = lerpY(NW, x) + 30; if (y0 > 880) continue;
          const y = y0 + rng() * (900 - y0), k = 0.5 + (y - 600) / 300;
          s += K.ellipse(x, y, (24 + rng() * 40) * k, (6 + rng() * 8) * k, `url(#${dap})`);
        }
        s += band3(o, 250, 320, T.haze, 0.16, 'haze');
      } else {
        s += band3(o, 240, 200, '#f6a86a', 0.2, 'treetops', 0.6);
        s += K.band(o, 380, 540, '#22182e', 0, 0.46, 'ravine');
        s += K.shaft(o, [[40, 900], [104, 880], [1640, 700], [1640, 790]], '#100a16', 0.6, 'ls1', [0, 0, 1, 0]);
        s += K.shaft(o, [[188, 912], [220, 902], [1640, 830], [1640, 872]], '#100a16', 0.55, 'ls2', [0, 0, 1, 0]);
        s += K.shaft(o, [[554, 470], [600, 466], [1060, 690], [960, 704]], '#100a16', 0.45, 'ls3', [0, 0, 1, 1]);
        s += K.shaft(o, [[1006, 470], [1030, 466], [1500, 640], [1430, 652]], '#100a16', 0.4, 'ls4', [0, 0, 1, 1]);
        s += K.path('M904,360 Q980,420 1010,470 L1300,600 L1100,640 Z', '#100a16', { opacity: 0.25 });
        s += band3(o, 200, 500, '#d88a68', 0.1, 'haze');
      }
      return s;
    }
  });

  /* ================================================================== */
  /* Memorial Park: the stump of the Standpipe on the hilltop — a ring of
   * broken masonry, fenced off — and Derry spread out below. */
  ART.bg('standpipe', {
    times: ['day', 'dusk', 'night', 'quiet'],
    draw(o) {
      const t = o.time, rng = o.rng;
      const { L, S, T } = lighting(t);
      const quiet = t === 'quiet', night = t === 'night', dark = night || quiet, dusk = t === 'dusk';
      const hz = (c, k) => K.mix(c, T.haze, k);
      const dq = (c) => (quiet ? K.desat(c, 0.6) : c);
      let s = K.sky(o, t);
      if (t === 'day') s += K.clouds(rng, { count: 7, y0: 40, y1: 330, color: '#f2efe8', shadow: '#c3c9cf', opacity: 0.72, w: 560 });
      if (dusk) s += K.glow(o, 1280, 450, 760, '#f2a066', 0.5, 'sun') + K.clouds(rng, { count: 6, y0: 60, y1: 340, color: '#f2a27a', shadow: '#7a5576', opacity: 0.55, w: 600 });
      if (night) s += K.stars(rng, { count: 120, y1: 420 }) + K.clouds(rng, { count: 3, y0: 140, y1: 300, color: '#26324e', shadow: '#151c2e', opacity: 0.5, w: 640 }) + K.circle(1330, 110, 30, '#e9e4d2', { opacity: 0.9 }) + K.glow(o, 1330, 110, 170, '#c8d4f0', 0.25, 'moon');
      if (quiet) s += K.stars(rng, { count: 18, y1: 300, color: '#6f857a' });

      /* the valley: distant hills, the town spread out below the brow of the hill */
      s += K.path(K.ridge(rng, { y: 412, amp: 18, steps: 20, jag: 0.3 }), hz(L(P.slate), dark ? 0.3 : 0.62));
      s += K.path(K.ridge(rng, { y: 438, amp: 9, steps: 22, jag: 0.35 }), hz(L(P.pine), dark ? 0.25 : 0.5));
      s += K.rect(-10, 442, 1620, 230, hz(L('#5e6448'), dark ? 0.2 : 0.42));
      const yC = (x) => 604 - (x - 780) * 0.118 + 8 * Math.sin((x - 780) / 140), hwC = (x) => Math.max(4, 10 - (x - 780) / 170);
      const inCanal = (x, y) => Math.abs(y - yC(x)) < hwC(x) + 7;
      const inDown = (x, y) => x > 1070 && x < 1350 && y > 472 && y < 580;
      const town = bucket(), trees = bucket(), lights = bucket();
      const winC = ['#ffd38a', '#f6c784', '#ffe2a8'];
      for (const ry of [446, 453, 461, 470, 480, 492, 505, 520, 537, 556, 577, 600, 626, 654]) {
        const f = (ry - 440) / 214, k = 0.42 + f * 1.8;
        const hk = dark ? 0.32 * (1 - f) + 0.04 : 0.66 * (1 - f) + 0.16;
        const wl = ['#e2d8c2', '#d4c4a0', '#c9c2b0', '#b4b0a4', '#c7b48c'].map((c) => hz(L(dq(c)), hk)), ws = hz(S('#b9ae96'), hk);
        const rf = ['#4a4448', '#5a4c42', '#3e4352'].map((c) => hz(L(c), hk));
        const tc = [[P.rust, '#7e3a24'], [P.ember, P.rust], [P.mustard, '#a87a2a'], [P.pine, '#22382c'], [P.rust, '#7e3a24']].map(([a, b]) => [hz(L(dq(a)), hk), hz(S(dq(b)), hk)]);
        for (let x = -30 + rng() * 20 * k; x < 1650;) {
          if (x > 150 && x < 790) x = 790 + rng() * 20 * k;
          const y = ry + (rng() - 0.5) * 2 * k;
          if (inCanal(x, y) || inDown(x, y)) { x += 8 * k; continue; }
          if (rng() < 0.6) {
            const [tl, ts] = rng.pick(tc), r = (5 + rng() * 6) * k;
            trees.add(ts, blobL(rng, x + r, y - r * 0.6, r, r * 0.8, { lobes: 4, jag: 0.3, k: 2 }));
            trees.add(tl, blobL(rng, x + r * 0.82, y - r * 0.82, r * 0.72, r * 0.5, { lobes: 4, jag: 0.3, k: 2 }));
            x += r * 1.5;
          } else {
            const w = (5 + rng() * 3.5) * k, h = (3.2 + rng() * 1.6) * k, rh = (2.2 + rng() * 1.4) * k, d = (7 + rng() * 5) * k;
            town.add(rng.pick(wl), pd([[x, y], [x + w, y], [x + w, y - h], [x + w / 2, y - h - rh], [x, y - h]]));
            town.add(ws, pd([[x + w, y], [x + w + d, y - d * 0.26], [x + w + d, y - h - d * 0.26], [x + w, y - h]]));
            town.add(rng.pick(rf), pd([[x + w / 2, y - h - rh], [x + w / 2 + d, y - h - rh - d * 0.26], [x + w + d + 1, y - h - d * 0.26], [x + w + 1, y - h]]));
            if (night && rng() < 0.6) lights.add(rng.pick(winC), `M${n(x + w * 0.3)},${n(y - h * 0.7)}h${n(1.6 * k)}v${n(1.8 * k)}h${n(-1.6 * k)}Z`);
            if (night && rng() < 0.4) lights.add(rng.pick(winC), `M${n(x + w + d * 0.4)},${n(y - h * 0.7 - d * 0.1)}h${n(1.4 * k)}v${n(1.6 * k)}h${n(-1.4 * k)}Z`);
            if (dusk && rng() < 0.22) lights.add(rng.pick(winC), `M${n(x + w * 0.3)},${n(y - h * 0.7)}h${n(1.6 * k)}v${n(1.8 * k)}h${n(-1.6 * k)}Z`);
            x += w + d + (2 + rng() * 5) * k;
          }
        }
        if (night || dusk) for (let x = 800 + rng() * 40; x < 1640; x += (22 + rng() * 34) * Math.max(0.6, k * 0.6)) if (!inCanal(x, ry)) lights.add(P.sodium, ellD(x, ry + 1, 0.8 + 0.7 * k, 0.8 + 0.7 * k));
      }
      s += trees.out() + town.out();
      // the canal winding through, with two bridges
      let cTop = [], cBot = [];
      for (let x = 780; x <= 1640; x += 20) { cTop.push([x, yC(x) - hwC(x)]); cBot.push([x, yC(x) + hwC(x)]); }
      const canalC = quiet ? '#0c1018' : night ? '#1a2640' : dusk ? '#b07c78' : hz('#c4d0d4', 0.2);
      s += K.path(ld(cTop) + ld(cBot.slice().reverse()).replace('M', 'L') + 'Z', canalC) + stroke(ld(cTop), hz(S('#8a8478'), dark ? 0.1 : 0.3), 1.2);
      for (const bx of [1000, 1384]) s += K.rect(bx, yC(bx) - hwC(bx) - 1, 10 * (1.4 - (bx - 780) / 1400), hwC(bx) * 2 + 2, hz(L('#8a8478'), dark ? 0.15 : 0.3));
      // downtown: brick blocks along the canal, the mill and its stack
      const brickCs = [P.brick, '#a0583a', '#7a3a2e', '#b9a37d', '#8a4a36'];
      for (const [x, y, w, h] of [[1078, 560, 34, 26], [1114, 556, 28, 34], [1144, 552, 40, 22], [1186, 548, 92, 20], [1282, 540, 30, 30], [1092, 520, 30, 22], [1126, 514, 26, 30], [1156, 508, 34, 20], [1196, 502, 28, 26], [1228, 498, 40, 18], [1272, 494, 30, 24], [1304, 490, 26, 18]]) {
        const hk = dark ? 0.1 : 0.22 + (560 - y) / 400;
        s += K.rect(x, y - h, w, h, hz(L(dq(rng.pick(brickCs))), hk)) + K.rect(x + w - 5, y - h, 5, h, hz(S(P.brick), hk)) + K.rect(x - 1, y - h - 2, w + 1, 3, hz(S('#4a3a34'), hk));
        if (night) for (let yy = y - h + 4; yy < y - 4; yy += 5) for (let xx = x + 3; xx < x + w - 6; xx += 5) if (rng() < 0.45) lights.add(rng.pick(winC), `M${n(xx)},${n(yy)}h1.8v2h-1.8Z`);
      }
      s += K.rect(1292, 436, 10, 104, hz(L(dq(P.brick)), dark ? 0.1 : 0.28)) + K.rect(1290, 433, 14, 5, hz(S(P.brick), dark ? 0.1 : 0.28));
      // two steeples: white clapboard Congregational, granite St. Mary's
      const sw = hz(L('#ece3cf'), dark ? 0.08 : 0.24), sws = hz(S('#ece3cf'), dark ? 0.08 : 0.24);
      s += K.rect(1112, 488, 20, 66, sw) + K.rect(1125, 488, 7, 66, sws) + K.rect(1110, 466, 24, 24, sw) + K.rect(1115, 471, 14, 13, hz(S('#3a3a40'), 0.2)) + K.rect(1108, 463, 28, 4, sws);
      s += K.path('M1110,463 L1122,378 L1134,463 Z', sw) + K.path('M1122,378 L1134,463 L1125,463 Z', sws);
      const sb = hz(L(dq('#8a7e70')), dark ? 0.08 : 0.26), sbs = hz(S('#8a7e70'), dark ? 0.08 : 0.26);
      s += K.rect(1444, 470, 22, 60, sb) + K.rect(1458, 470, 8, 60, sbs) + K.path('M1442,470 L1455,402 L1468,470 Z', sb) + K.path('M1455,402 L1468,470 L1459,470 Z', sbs);
      if (night) s += K.glow(o, 1122, 500, 80, '#ffd9a0', 0.4, 'steeple') + K.rect(1112, 466, 13, 88, '#f3e6c8', { opacity: 0.3 });
      if (night || dusk) s += lights.out();
      if (night) {
        let cr = '';
        for (const bx of [880, 960, 1060, 1180, 1260, 1360, 1460]) cr += `M${n(bx)},${n(yC(bx) - 2)}v${n(hwC(bx) * 1.6)}`;
        s += stroke(cr, P.sodium, 2, { opacity: 0.5 }) + band3(o, 380, 300, P.sodium, 0.14, 'cityglow', 0.6);
      }
      if (!dark) s += band3(o, 360, 300, T.haze, dusk ? 0.22 : 0.34, 'vhaze', 0.45);

      /* the hilltop: grass from the brow of the hill down to our feet */
      const BROW = [[-20, 590], [800, 596], [940, 600], [1100, 610], [1300, 626], [1500, 644], [1640, 656]];
      const gg = o.id('ground');
      s += K.defs(K.linear(gg, [[0, L(P.moss)], [1, S(P.moss)]], 0, 590, 0, 900, true)) + K.path(smoothD(BROW) + 'L1640,920L-20,920Z', `url(#${gg})`);
      s += K.path(tuftsD(rng, Array.from({ length: 56 }, () => { const x = 780 + rng() * 860; return [x, lerpY(BROW, x) + 3, 0.6 + rng() * 0.5]; }), { blades: 4, h: 18 }), S(P.moss));

      /* ---- the ring of the old Standpipe ---- */
      const RXc = 468, RW = 332, NC = 12;
      const baseY = (th) => 600 - 40 * (1 - Math.cos(th)), topY0 = (th) => 300 + 36 * (1 - Math.cos(th));
      const xAt = (th) => RXc + RW * Math.sin(th);
      const cum = [0];
      for (let k = 0; k < NC; k++) cum.push(cum[k] + 0.72 + rng() * 0.56);
      const cumAt = (k) => { k = Math.max(0, Math.min(NC, k)); const i = Math.floor(k); return i >= NC ? cum[NC] : cum[i] + (cum[i + 1] - cum[i]) * (k - i); };
      const courseY = (k, th) => baseY(th) - (baseY(th) - topY0(th)) * cumAt(k) / cum[NC];
      const BRK = [[-1.571, 5], [-1.36, 4.5], [-1.16, 6], [-0.98, 7.5], [-0.82, 9.5], [-0.66, 10], [-0.52, 8], [-0.4, 3.5], [-0.28, 1.5], [-0.12, 2.5], [0.02, 1], [0.16, 2], [0.3, 0.5], [0.4, 0], [0.48, 0], [0.56, 3], [0.7, 4.5], [0.86, 3.5], [1.0, 5.5], [1.16, 4], [1.34, 6], [1.571, 5.5]];
      const cols = 52, dth = Math.PI / cols, thL = (j) => -Math.PI / 2 + j * dth;
      const keep = [];
      for (let j = 0; j < cols; j++) { const th = thL(j + 0.5), lost = lerpY(BRK, th); keep.push(Math.max(1, Math.min(NC, Math.round(NC - lost + (lost > 0.4 ? (rng() - 0.5) * 2.2 : 0))))); }
      const topPts = [];
      for (let j = 0; j < cols; j++) {
        const a = thL(j), b = thL(j + 1), ya = courseY(keep[j], a), yb = courseY(keep[j], b);
        if (j > 0 && keep[j] !== keep[j - 1] && rng() < 0.35) topPts.push([xAt(a) + (xAt(b) - xAt(a)) * 0.5, (ya + yb) / 2]);
        else topPts.push([xAt(a), ya]);
        topPts.push([xAt(b), yb]);
      }
      const basePts = [];
      for (let j = cols; j >= 0; j--) basePts.push([xAt(thL(j)), baseY(thL(j))]);
      const wallD = pd([[xAt(-Math.PI / 2), baseY(-Math.PI / 2)]].concat(topPts, basePts));
      const stone = '#a69d8c', stL = L(stone), stM = K.mix(L(stone), S(stone), 0.5), stS = S(stone);
      // the inside, seen where the front has fallen: the far wall's inner face, rubble
      const backTop = [];
      let bk = 2;
      for (let j = 0; j < cols; j++) { if (rng() < 0.45) bk = Math.max(0, Math.min(7, bk + Math.round((rng() - 0.5) * 5))); const a = thL(j), b = thL(j + 1); backTop.push([xAt(a), 336 + 36 * Math.cos(a) + bk * 20], [xAt(b), 336 + 36 * Math.cos(b) + bk * 20]); }
      s += K.path(ld(backTop) + `L${xAt(Math.PI / 2)},600L${xAt(-Math.PI / 2)},600Z`, K.mix(stM, stS, 0.55));
      s += K.path(ld(backTop) + 'L' + backTop.slice().reverse().map(([x, y]) => n(x) + ',' + n(y + 6)).join('L') + 'Z', K.mix(stS, '#0b0e14', 0.3), { opacity: 0.5 });
      let bcr = '';
      for (let yy = 392; yy < 600; yy += 17) { const pts = []; for (let j = 0; j <= cols; j += 2) { const th = thL(j); pts.push([xAt(th), yy + 36 * Math.cos(th) * 0.8]); } bcr += ld(pts); }
      s += stroke(bcr, K.mix(stS, '#0d1018', 0.35), 1.2, { opacity: 0.4 });
      s += K.path(`M${n(xAt(-1.4))},560 Q${RXc},520 ${n(xAt(1.4))},560 L${n(xAt(1.4))},600 L${n(xAt(-1.4))},600 Z`, S('#5a5a44'));
      const [ruS, ruL] = stonesD(Array.from({ length: 12 }, () => [200 + rng() * 160, 548 + rng() * 30, 8 + rng() * 14, 6 + rng() * 8]));
      s += K.path(ruS, stS) + K.path(ruL, stM);
      // the wall itself: lit face, a turning band, the shadow side
      const rid = o.id('ring');
      let wall = K.rect(100, 240, 720, 380, stL);
      wall += K.poly([[xAt(0.16), 240], [xAt(0.58), 240], [xAt(0.58), 620], [xAt(0.16), 620]], K.mix(stL, stM, 0.6)) + K.poly([[xAt(0.58), 240], [xAt(0.95), 240], [xAt(0.95), 620], [xAt(0.58), 620]], stM) + K.poly([[xAt(0.95), 240], [820, 240], [820, 620], [xAt(0.95), 620]], stS);
      let blkL = '', blkD = '', crs = '', jts = '';
      for (let k = 0; k < NC; k++) {
        let j0 = rng() * 2;
        while (j0 < cols) {
          const j1 = Math.min(cols, j0 + 1.3 + rng() * 2.2), jm = Math.floor(j0);
          if (jm < cols && k < keep[jm]) {
            const a = thL(j0), b = thL(j1);
            if (j0 > 0.05) jts += `M${n(xAt(a))},${n(courseY(k, a))}L${n(xAt(a))},${n(courseY(k + 1, a))}`;
            if (rng() < 0.16) { const q = pd([[xAt(a), courseY(k, a)], [xAt(b), courseY(k, b)], [xAt(b), courseY(k + 1, b)], [xAt(a), courseY(k + 1, a)]]); if (rng() < 0.5) blkL += q; else blkD += q; }
          }
          j0 = j1;
        }
      }
      for (let k = 1; k < NC; k++) { const pts = []; for (let j = 0; j <= cols; j++) pts.push([xAt(thL(j)), courseY(k, thL(j))]); crs += ld(pts); }
      wall += K.path(blkL, '#fff6e6', { opacity: dark ? 0.025 : 0.05 }) + K.path(blkD, '#0d1018', { opacity: dark ? 0.03 : 0.06 });
      const mort = K.mix(stS, '#0d1018', 0.35);
      wall += stroke(crs, mort, 1.5, { opacity: 0.5 }) + stroke(jts, mort, 1.2, { opacity: 0.45 });
      let stn = '';
      for (let i = 0; i < 20; i++) { const j = Math.floor(rng() * cols), th = thL(j + 0.5), x = xAt(th), y = courseY(keep[j], th); stn += `M${n(x - 3)},${n(y)}l${n(1 + rng() * 2)},${n(40 + rng() * 90)}l${n(3 + rng() * 4)},0l-1,${n(-40 - rng() * 70)}Z`; }
      wall += K.path(stn, '#3a3a30', { opacity: 0.2 });
      // Virginia creeper gone red, climbing the lower wall in thin runners
      if (!quiet) {
        let stem = '', lfA = '', lfB = '';
        for (const th0 of [-1.42, -1.28, -1.12, -0.95, -0.86, -0.3, 1.22, 1.36]) {
          let x = xAt(th0), y = baseY(th0) + 2;
          const top = y - 90 - rng() * 120;
          let d = `M${n(x)},${n(y)}`;
          while (y > top) { const nx = x + (rng() - 0.5) * 14, ny = y - 12 - rng() * 10; d += `Q${n(x + (rng() - 0.5) * 10)},${n((y + ny) / 2)} ${n(nx)},${n(ny)}`; const a = rng() * Math.PI * 2, lf = leafD(nx + Math.cos(a) * 5, ny + Math.sin(a) * 3, 4.5 + rng() * 2, 2.6, a); if (rng() < 0.6) lfA += lf; else lfB += lf; x = nx; y = ny; }
          stem += d;
        }
        wall += stroke(stem, S('#4a2a20'), 1.3, { opacity: 0.8 }) + K.path(lfA, L('#9a3426')) + K.path(lfB, S('#7a2a20'));
      }
      // graffiti: faded spray paint, scratched initials, the lantern with the X
      const colAt = (th) => keep[Math.max(0, Math.min(cols - 1, Math.floor((th + Math.PI / 2) / dth)))];
      const yK = (th, down) => courseY(colAt(th) - down, th);
      const scr = dark ? K.adj(stM, quiet ? 0.12 : 0.28) : K.mix(stL, '#fff8ec', dusk ? 0.42 : 0.6);
      wall += K.text(xAt(-1.0) - 10, yK(-1.0, 3.5), 'CLASS OF 84', { fontFamily: SCRAWL, fontSize: 22, fill: L('#9a3a3a'), opacity: quiet ? 0.25 : 0.5, transform: `rotate(-5 ${n(xAt(-1.0))} ${n(yK(-1.0, 3.5))})` });
      const hx = xAt(-0.12), hy = yK(-0.12, 2.6);
      wall += stroke(`M${n(hx)},${n(hy + 15)}c-28,-19 -24,-42 -6,-40 c5,0 6,5 6,8 c0,-3 2,-8 7,-8 c18,-2 20,24 -7,40Z`, L('#b24a4a'), 2.6, { opacity: quiet ? 0.3 : 0.75 });
      wall += K.text(hx - 13, hy - 4, 'D.S. + K.L.', { fontFamily: SCRAWL, fontSize: 9, fill: L('#b24a4a'), opacity: quiet ? 0.3 : 0.85 });
      wall += K.text(xAt(-0.62) - 24, yK(-0.62, 4.2), 'TOMMY W. WAS HERE', { fontFamily: SCRAWL, fontSize: 13, fill: scr, opacity: 0.55 });
      wall += K.text(xAt(0.2) - 8, yK(0.2, 4.4), 'R.T.', { fontFamily: SCRAWL, fontSize: 15, fill: scr, opacity: 0.6 });
      wall += K.text(xAt(-0.36) - 6, yK(-0.36, 3.2) + 2, 'B.D. 79', { fontFamily: SCRAWL, fontSize: 12, fill: scr, opacity: 0.5 });
      const lanternX = (x, y, k) => `M${n(x - 4 * k)},${n(y - 15 * k)}a${n(4 * k)},${n(3.4 * k)} 0 1,1 ${n(8 * k)},0M${n(x - 6 * k)},${n(y - 12 * k)}h${n(12 * k)}l${n(-2 * k)},${n(4 * k)}h${n(-8 * k)}ZM${n(x - 5 * k)},${n(y - 8 * k)}h${n(10 * k)}v${n(13 * k)}h${n(-10 * k)}ZM${n(x)},${n(y - 8 * k)}v${n(13 * k)}M${n(x - 7 * k)},${n(y + 5 * k)}h${n(14 * k)}v${n(3 * k)}h${n(-14 * k)}ZM${n(x - 11 * k)},${n(y - 17 * k)}L${n(x + 11 * k)},${n(y + 11 * k)}M${n(x + 11 * k)},${n(y - 17 * k)}L${n(x - 11 * k)},${n(y + 11 * k)}`;
      let lx = '';
      for (const [th, dn, sz] of [[0.62, 2.6, 1.3], [0.78, 5.0, 1.1], [0.96, 2.8, 1.2]]) lx += lanternX(xAt(th), yK(th, dn), sz);
      wall += stroke(lx, scr, 1.6, { opacity: dark ? 0.5 : 0.85 });
      if (quiet) {
        const gw = o.id('gwash');
        wall += K.defs(K.radial(gw, [[0, P.lantern, 0.5], [0.35, P.lantern, 0.2], [1, P.lantern, 0]], 606, 300, 380)) + K.rect(100, 240, 720, 380, `url(#${gw})`);
      }
      s += `<clipPath id="${rid}"><path d="${wallD}"/></clipPath><g clip-path="url(#${rid})">${wall}</g>`;
      // weeds and a birch sapling rooted in the broken top; rusted rebar
      let wt = [];
      for (let j = 0; j < cols; j += 2) { const th = thL(j + 0.5); if (rng() < 0.6) wt.push([xAt(th), courseY(keep[j], th) + 2, 0.5 + rng() * 0.5]); }
      s += K.path(tuftsD(rng, wt, { blades: 5, h: 18 }), quiet ? '#141a14' : L('#7a7a44'));
      const sapTh = -0.7, sapX = xAt(sapTh), sapY = courseY(colAt(sapTh), sapTh);
      s += birch(rng, { x: sapX, base: sapY + 2, h: 70, w: 4, lean: 8, bark: quiet ? '#1c2220' : L(P.birch), barkS: quiet ? '#141a18' : S(P.birch), mark: '#2a2622', crown: quiet ? ['#16201a', '#101612'] : [L(P.mustard), S(P.mustard)], branches: 3 });
      let rb = '';
      for (const j of [4, 9, 14, 19, 27, 31, 38, 44, 48]) {
        const th = thL(j + 0.5), x = xAt(th), y = courseY(keep[j], th);
        for (let i = 0; i < 2; i++) { const dx = (rng() - 0.5) * 10, l = 16 + rng() * 28, bend = (rng() - 0.5) * 24; rb += `M${n(x + dx)},${n(y + 2)}q${n(bend * 0.2)},${n(-l * 0.6)} ${n(bend)},${n(-l)}`; }
      }
      s += stroke(rb, quiet ? '#252818' : L('#7a3e24'), 2.2, { strokeLinecap: 'round' });
      let rbS = '', rbL = '';
      for (let i = 0; i < 18; i++) { const x = 190 + rng() * 200, y = 584 + rng() * 36, rr = 6 + rng() * 13; rbS += domeD(x, y, rr * 1.2, rr * 0.8); rbL += litDomeD(x, y, rr * 1.2, rr * 0.8); }
      s += K.path(rbS, stS) + K.path(rbL, stL);
      s += K.path(tuftsD(rng, Array.from({ length: 30 }, () => { const x = 140 + rng() * 660, th = Math.asin(Math.max(-1, Math.min(1, (x - RXc) / RW))); return [x, baseY(th) + 3, 0.8 + rng() * 0.6]; }), { blades: 6, h: 32 }), quiet ? '#121812' : L('#8a8a4a'));

      /* the plaque on its stone, the bench facing the view, a wire trash barrel */
      s += K.path('M1004,688 Q998,650 1026,640 Q1066,632 1094,646 Q1112,662 1106,688 Z', L('#8e8a80')) + K.path('M1076,638 Q1112,656 1106,688 L1066,688 Q1088,664 1076,638 Z', S('#8e8a80'));
      s += K.rect(1030, 652, 50, 26, quiet ? '#14160e' : L('#7a5e2e')) + K.rect(1033, 655, 44, 20, quiet ? '#101208' : L('#5e6a4a'));
      if (!quiet) s += stroke('M1037,660h36M1037,665h36M1037,670h26', L('#c8b070'), 1, { opacity: 0.7 });
      const wd2 = L('#7a5a3e'), wdS = S('#7a5a3e'), iron = dark ? '#0b0e13' : L('#2e2e33');
      s += K.rect(1166, 640, 8, 34, iron) + K.rect(1376, 640, 8, 34, iron) + K.rect(1150, 636, 248, 8, wdS);
      for (let i = 0; i < 3; i++) s += K.rect(1144, 598 + i * 12, 260, 9, wd2) + K.rect(1144, 605 + i * 12, 260, 2, wdS);
      s += K.rect(1158, 588, 9, 58, iron) + K.rect(1382, 588, 9, 58, iron);

      /* the fence: sagging chain-link, one section trampled down, the sign */
      const posts = [[64, 668, 176], [246, 662, 170], [428, 656, 164], [610, 650, 158], [790, 644, 152], [940, 640, 148]];
      const fc = quiet ? '#182020' : dark ? '#3a4150' : L('#8c9096');
      let mesh = '';
      const sags = [8, 70, 10, 12, 8];
      for (let i = 0; i < posts.length - 1; i++) {
        const [xa, ga, ha] = posts[i], [xb, gb, hb] = posts[i + 1], lift = i === 3 ? 26 : 0;
        mesh += chainD(xa + 3, ga - ha + 6, ga - lift * 0.4, xb - 3, gb - hb + 6, gb - lift, sags[i], 14);
        s += stroke(`M${xa},${ga - ha + 6}Q${(xa + xb) / 2},${(ga - ha + gb - hb) / 2 + 6 + sags[i] * 2} ${xb},${gb - hb + 6}`, fc, 3);
      }
      s += stroke(mesh, fc, 1.1, { opacity: 0.72 });
      for (const [x, g, h] of posts) s += K.rect(x - 3.5, g - h, 7, h, fc) + K.rect(x - 5, g - h - 3, 10, 5, fc);
      s += `<g transform="rotate(-3 868 552)">` + K.rect(800, 508, 134, 86, quiet ? '#191c1b' : L('#ece6d8')) + K.rect(800, 508, 134, 25, quiet ? '#171616' : L('#a8322a'));
      if (!quiet) {
        s += K.text(867, 528, 'DANGER', { fontFamily: SIGN, fontSize: 21, fontWeight: 700, fill: L('#f4eee0'), textAnchor: 'middle', letterSpacing: 2 });
        s += K.text(867, 558, 'KEEP OUT', { fontFamily: SIGN, fontSize: 22, fontWeight: 700, fill: L('#1c1c1e'), textAnchor: 'middle', letterSpacing: 1 });
        s += K.text(867, 580, 'CITY OF DERRY', { fontFamily: SIGN, fontSize: 12.5, fontWeight: 600, fill: L('#3a3a3e'), textAnchor: 'middle', letterSpacing: 1.5 });
        s += stroke('M806,514v74M928,514v70M874,588v8', L('#9a5a30'), 1.4, { opacity: 0.45 });
      } else s += K.text(867, 558, 'KEEP OUT', { fontFamily: SIGN, fontSize: 22, fontWeight: 700, fill: '#0a0c0c', textAnchor: 'middle', letterSpacing: 1, opacity: 0.55 });
      s += K.circle(806, 514, 2, fc) + K.circle(928, 514, 2, fc) + '</g>';

      /* the worn path to the bench; tall grass and late wildflowers */
      s += K.path('M640,920 Q760,780 940,716 Q1060,690 1160,688 L1180,698 Q1080,704 980,732 Q820,800 760,920 Z', quiet ? '#0e120e' : L('#8a7a5a'), { opacity: 0.8 });
      const gb2 = (count, y0, hMax) => { let a = '', b = ''; for (let i = 0; i < count; i++) { const x = rng() * 1660 - 20, y = y0 + rng() * (905 - y0), k = 0.6 + (y - 600) / 300, h = (12 + rng() * hMax) * k, d = bladeD(x, y, h, 1.7 * k, (rng() - 0.5) * 18 * k); if (rng() < 0.55) a += d; else b += d; } return [a, b]; };
      const [ga1, gb1] = gb2(200, 640, 30);
      s += K.path(ga1, quiet ? '#141a14' : L('#8a8a50')) + K.path(gb1, quiet ? '#0e120e' : S('#6e7040'));
      s += K.path(tuftsD(rng, Array.from({ length: 34 }, () => [60 + rng() * 880, 652 + rng() * 22, 0.9 + rng() * 0.6]).concat(Array.from({ length: 26 }, () => [rng() < 0.5 ? rng() * 300 : 1340 + rng() * 300, 760 + rng() * 140, 1.4 + rng() * 0.8])), { blades: 6, h: 38 }), quiet ? '#121812' : L('#9a9456'));
      if (!quiet) {
        const fl = bucket();
        for (let i = 0; i < 110; i++) {
          const x = rng() * 1640 - 20, y = 640 + rng() * 250, k = 0.6 + (y - 600) / 300, kind = rng();
          if (kind < 0.45) fl.add(L(P.mustard), leafD(x, y - 26 * k, 7 * k, 2.6 * k, -1.3 + rng() * 0.4) + leafD(x + 4 * k, y - 20 * k, 6 * k, 2.2 * k, -1.1));
          else if (kind < 0.75) fl.add(L('#8e7aa8'), ellD(x, y - 22 * k, 2.6 * k, 2.6 * k) + ellD(x + 5 * k, y - 18 * k, 2.2 * k, 2.2 * k));
          else fl.add(L('#e8e2cc'), ellD(x, y - 30 * k, 5 * k, 2.4 * k));
        }
        s += fl.out();
      }

      /* atmosphere, and the Quiet */
      if (dusk) s += band3(o, 300, 520, '#d88a68', 0.12, 'haze');
      if (night) s += K.band(o, 600, 320, '#05070c', 0, 0.4, 'dark');
      if (quiet) {
        const LX = 606, LY = 303;
        s += band3(o, 470, 300, '#2a3a34', 0.5, 'fog1', 0.55) + band3(o, 600, 300, '#1e2a26', 0.35, 'fog2', 0.4);
        for (let i = 0; i < 7; i++) s += K.pool(o, 120 + rng() * 1360, 580 + rng() * 110, 260 + rng() * 200, 22 + rng() * 18, '#34463e', 0.32, 'fogp');
        s += K.pool(o, LX, 610, 380, 76, P.lantern, 0.2, 'lgrass');
        // figures standing at the edge of the light, very still
        const figs = [[1010, 664, 158, false, 0], [1116, 652, 112, true, 0], [1366, 700, 182, false, 1], [196, 704, 164, false, 0], [372, 642, 104, true, 0]];
        let fg = '', rim = '';
        for (const [x, b, h, child, coat] of figs) { fg += personD(x, b, h, { child, coat }); rim += personD(x + (x < LX ? 1.5 : -1.5), b - 1, h, { child, coat }); }
        s += K.path(rim, P.lantern, { opacity: 0.06 }) + K.path(fg, '#050708', { opacity: 0.34 });
        const dk = o.id('dark');
        s += K.defs(K.radial(dk, [[0, '#010203', 0], [0.22, '#010203', 0], [0.58, '#010203', 0.6], [1, '#010203', 0.9]], LX, LY + 80, 1150)) + K.rect(0, 0, 1600, 900, `url(#${dk})`);
        s += K.glow(o, LX, LY - 28, 340, P.lantern, 0.3, 'lhalo');
        s += shipLantern(o, LX, LY, 0.95);
      }
      return s;
    }
  });

  /* ================================================================== */
  /* The downtown canal, seen from one bridge toward the next: concrete
   * walls, dark water, the brick backs of the mills. `lanterns` is the
   * Lantern Float — and one lantern out there is the wrong colour. */
  ART.bg('canal', {
    times: ['dusk', 'lanterns'],
    light: { lanterns: 'dusk' },
    draw(o) {
      const fest = o.time === 'lanterns', rng = o.rng, tt = fest ? 'night' : 'dusk';
      const { L, S, T } = lighting(tt);
      const VX = 800, VY = 372, F = 760, E = 5;
      const pr = (X, Y, Z) => [VX + F * X / Z, VY + F * (E - Y) / Z];
      const Q = (pts) => pd(pts.map((p) => pr(p[0], p[1], p[2])));
      const hz = (c, k) => K.mix(c, T.haze, k);
      const iron = fest ? '#0b0d14' : L('#26262c');
      let s = K.sky(o, tt);
      if (fest) s += K.stars(rng, { count: 40, y1: 260 }) + K.clouds(rng, { count: 3, y0: 90, y1: 240, color: '#2a3452', shadow: '#151c2e', opacity: 0.6, w: 620 }) + K.glow(o, 800, 380, 640, '#f2a050', 0.32, 'fglow');
      else s += K.clouds(rng, { count: 6, y0: 60, y1: 300, color: '#f2a27a', shadow: '#7a5576', opacity: 0.55, w: 600 }) + K.glow(o, 800, 380, 560, '#f6b070', 0.5, 'sunset');

      const glows = [], wins = [];
      /* a block of brick backs along one side, Z from z0 to z1 */
      const building = (sd, z0, z1, h, kind) => {
        const X = 14 * sd;
        const base = { mill: '#8c3b2e', brick: '#93452f', brick2: '#6e3328', cream: '#c9b48a', green: '#7f8a78', stone: '#8a8478' }[kind];
        const far = z0 > 40, fk = far ? Math.min(0.5, (z0 - 40) / 140) : 0;
        const BL = hz(L(base), fk), BS = hz(S(base), fk);
        const [ex0, ey0] = pr(X, 2.6, z0), [ex1, ey1] = pr(X + sd * 18, h, z0);
        let r = K.poly([[ex0, ey0], [ex1, ey0], [ex1, ey1], [ex0, ey1]], BS);
        r += K.path(Q([[X, 2.6, z0], [X, 2.6, z1], [X, h, z1], [X, h, z0]]), sd < 0 ? BL : K.mix(BL, BS, 0.35));
        let crs = '';
        for (let y = 3.6; y < h - 0.6; y += 1.1) crs += ld([pr(X, y, z0), pr(X, y, z1)]);
        r += stroke(crs, BS, 1, { opacity: 0.3 });
        r += K.path(Q([[X, h - 0.7, z0], [X, h - 0.7, z1], [X, h, z1], [X, h, z0]]), K.adj(BS, -0.2));
        r += K.path(Q([[X, 2.6, z0], [X, 2.6, z1], [X, 3.3, z1], [X, 3.3, z0]]), hz(L('#8a8478'), fk));
        const mill = kind === 'mill', fl = mill ? 4 : 3.4, bay = mill ? 3.2 : 2.7, ww = mill ? 1.5 : 1.1, wh = mill ? 2.6 : 1.8;
        let dk = '', lt = bucket();
        for (let y0 = 4.1; y0 + wh < h - 0.9; y0 += fl) for (let z = z0 + 0.9; z + ww < z1 - 0.4; z += bay) {
          const lit = rng() < (fest ? 0.42 : 0.28);
          const q = Q([[X, y0, z], [X, y0, z + ww], [X, y0 + wh, z + ww], [X, y0 + wh, z]]);
          if (lit) {
            const c = rng.pick([P.window, '#f6c784', '#ffcf86', '#ffe2a8']);
            lt.add(c, q);
            const [wx, wy] = pr(X, y0 + wh / 2, z + ww / 2);
            wins.push([wx, VY + F * (E + y0) / (z + ww / 2), VY + F * (E + y0 + wh) / (z + ww / 2), F * ww / (z + 1) * 0.7, c]);
            if (z < 40) glows.push([wx, wy, F * 1.6 / z, c, 0.18]);
          } else dk += q;
        }
        r += K.path(dk, hz(fest ? '#151a28' : L('#2e3450'), fk)) + lt.out();
        // back doors and loading bays at the promenade
        let doors = '';
        for (let z = z0 + 2; z + 1.4 < z1 - 0.5; z += mill ? 7 : 5.5) doors += Q([[X, 2.6, z], [X, 2.6, z + 1.3], [X, 4.8, z + 1.3], [X, 4.8, z]]);
        r += K.path(doors, K.adj(BS, -0.35));
        return r;
      };
      const fireEscape = (sd, za, zb, levels) => {
        const X = 14 * sd, Xo = X - sd * 1.2;
        let d = '';
        for (const y of levels) {
          d += ld([pr(X, y, za), pr(Xo, y, za), pr(Xo, y, zb), pr(X, y, zb)]) + ld([pr(Xo, y + 1, za), pr(Xo, y + 1, zb)]);
          for (let z = za; z <= zb + 0.01; z += (zb - za) / 4) d += ld([pr(Xo, y, z), pr(Xo, y + 1, z)]);
        }
        for (let i = 0; i < levels.length - 1; i++) d += ld([pr(Xo + sd * 0.15, levels[i], za + 0.4), pr(Xo + sd * 0.15, levels[i + 1], zb - 0.4)]);
        d += ld([pr(Xo + sd * 0.15, levels[0], za + 0.6), pr(Xo + sd * 0.15, 4.6, za + 0.6)]);
        return stroke(d, iron, Math.max(1, F * 0.05 / ((za + zb) / 2)));
      };
      const lamp = (X, Z, Yb) => {
        const [x, yb] = pr(X, Yb, Z), [, yt] = pr(X, Yb + 3.9, Z), [, yg] = pr(X, Yb + 4.25, Z);
        const w = Math.max(1.2, F * 0.13 / Z), gr = F * 0.27 / Z;
        let r = K.rect(x - w / 2, yt, w, yb - yt, iron) + K.rect(x - w * 1.4, yb - w * 3, w * 2.8, w * 3, iron);
        r += K.path(`M${n(x - gr * 0.6)},${n(yg + gr * 0.9)}L${n(x + gr * 0.6)},${n(yg + gr * 0.9)}L${n(x + gr * 0.3)},${n(yt)}L${n(x - gr * 0.3)},${n(yt)}Z`, iron);
        r += K.circle(x, yg, gr, '#fff1cc') + K.path(`M${n(x - gr * 0.85)},${n(yg - gr * 0.7)}Q${n(x)},${n(yg - gr * 1.7)} ${n(x + gr * 0.85)},${n(yg - gr * 0.7)}Z`, iron);
        glows.push([x, yg, F * 2.6 / Z, P.sodium, 0.5]);
        wins.push([x, VY + F * (E + Yb + 4.0) / Z, VY + F * (E + Yb + 4.5) / Z, gr * 1.6, '#ffe0a0']);
        return r;
      };

      /* far: the canal beyond the bridge, a steeple at the end of it */
      s += K.rect(812, 236, 12, 150, hz(L('#ece3cf'), 0.45)) + K.path('M810,238 L818,170 L826,238 Z', hz(L('#ece3cf'), 0.45));
      for (const [sd, z0, z1, h, kind] of [[-1, 130, 230, 14, 'brick2'], [1, 150, 240, 12, 'brick2'], [-1, 84, 130, 11, 'stone'], [1, 92, 150, 18, 'mill'], [-1, 60, 84, 16, 'brick'], [1, 56, 92, 12, 'cream'], [-1, 43, 60, 12, 'brick2'], [1, 43, 56, 14, 'brick']]) s += building(sd, z0, z1, h, kind);
      s += K.path(Q([[-9, 0, 42], [9, 0, 42], [9, 0, 400], [-9, 0, 400]]), fest ? '#1a2238' : '#c78a78');
      s += K.path(Q([[-9, 2.6, 42], [-14, 2.6, 42], [-14, 2.6, 400], [-9, 2.6, 400]]), hz(L('#8e8678'), 0.35)) + K.path(Q([[9, 2.6, 42], [14, 2.6, 42], [14, 2.6, 400], [9, 2.6, 400]]), hz(L('#8e8678'), 0.35));
      s += K.path(Q([[-9, 0, 42], [-9, 2.6, 42], [-9, 2.6, 400], [-9, 0, 400]]), hz(S('#9a968c'), 0.3)) + K.path(Q([[9, 0, 42], [9, 2.6, 42], [9, 2.6, 400], [9, 0, 400]]), hz(S('#9a968c'), 0.3));
      for (const Z of [48, 60, 72, 84, 96]) s += lamp(-9.6, Z, 2.6) + lamp(9.6, Z, 2.6);

      /* lanterns beyond the bridge: a field of warm points (seen through the arch) */
      const lanB = bucket(), lanR = bucket();
      let greenAt = null;
      if (fest) {
        for (let i = 0; i < 520; i++) {
          const Z = 36 + Math.pow(rng(), 0.7) * 170, X = (rng() - 0.5) * 16.6, [x, y] = pr(X, 0.15, Z), sz = Math.max(1.1, F * 0.3 / Z);
          const c = rng() < 0.5 ? '#ffc35a' : rng() < 0.5 ? '#ffdb8a' : '#f29a3c';
          lanB.add(c, `M${n(x - sz / 2)},${n(y - sz * 0.8)}h${n(sz)}v${n(sz * 0.8)}h${n(-sz)}Z`);
          lanR.add(c, `M${n(x - sz * 0.2)},${n(y + 1)}h${n(sz * 0.4)}v${n(sz * 2.2)}h${n(-sz * 0.4)}Z`);
        }
        s += K.pool(o, 800, 446, 230, 26, '#ffb050', 0.5, 'farpool') + lanR.out({ opacity: 0.45 }) + lanB.out();
      }

      /* the bridge at Z 36-42: stone arch, parapet, iron lamps; people along it on the night */
      const ZB = 36, ZB2 = 42;
      const [a0x, a0y] = pr(-9, 0, ZB), [a1x] = pr(9, 0, ZB), RA = 12.125 * F / ZB;
      const [b0x, b0y] = pr(-9, 0, ZB2), [b1x] = pr(9, 0, ZB2), RB = 12.125 * F / ZB2;
      const archF = `M${n(a0x)},${n(a0y)}A${n(RA)},${n(RA)} 0 0,1 ${n(a1x)},${n(a0y)}Z`, archB = `M${n(b0x)},${n(b0y)}A${n(RB)},${n(RB)} 0 0,1 ${n(b1x)},${n(b0y)}Z`;
      s += K.path(archF + archB, fest ? '#090b12' : L('#2a2430'), { fillRule: 'evenodd' });
      if (fest) {
        let ppl = '';
        for (let X = -13.6; X < 13.6; X += 0.48 + rng() * 0.3) { const hh = 1.5 + rng() * 0.35, [x, yb] = pr(X, 5.3, ZB + 1.1); ppl += personD(x, yb, F * hh / (ZB + 1.1), { coat: rng() < 0.4 ? 1 : 0 }); }
        s += K.path(ppl, '#0c0e16');
      }
      const [bx0, by0] = pr(-14.5, 0, ZB), [bx1, by1] = pr(14.5, 6.3, ZB);
      const bst = '#a69c8c';
      s += K.path(`M${n(bx0)},${n(by0)}L${n(bx1)},${n(by0)}L${n(bx1)},${n(by1)}L${n(bx0)},${n(by1)}Z` + archF, L(bst), { fillRule: 'evenodd' });
      const yDeck = pr(0, 5.2, ZB)[1], yCap = pr(0, 6.0, ZB)[1];
      s += K.rect(bx0, yDeck - 4, bx1 - bx0, 8, K.adj(L(bst), 0.1)) + K.rect(bx0, yDeck + 4, bx1 - bx0, 3, S(bst));
      s += K.rect(bx0 - 4, by1 - 2, bx1 - bx0 + 8, yCap - by1 + 4, K.adj(L(bst), 0.12));
      let vs = '', cr = '';
      for (let i = 0; i <= 16; i++) { const a = Math.PI * (0.18 + 0.64 * i / 16), cx = (a0x + a1x) / 2, cy = a0y + RA - 84.4 * F / 760 * 0 - (RA - (RA - Math.sqrt(RA * RA - ((a1x - a0x) / 2) ** 2))); const ux = -Math.cos(a), uy = -Math.sin(a); const p0 = [cx + ux * RA, cy + uy * RA], p1 = [cx + ux * (RA + 26), cy + uy * (RA + 26)]; vs += ld([p0, p1]); }
      for (let y = by0 - 16; y > yDeck + 8; y -= 15) cr += `M${n(bx0)},${n(y)}H${n(bx1)}`;
      s += `<g>${stroke(cr, S(bst), 1, { opacity: 0.35 })}${stroke(vs, S(bst), 1.4, { opacity: 0.6 })}</g>`;
      s += K.path(archF, 'none', { stroke: S(bst), strokeWidth: 3, opacity: 0.6 });
      for (const X of [-10.2, 9.6]) s += K.path(Q([[X, 0, ZB - 0.02], [X + 0.7, 0, ZB - 0.02], [X + 0.7, 5.2, ZB - 0.02], [X, 5.2, ZB - 0.02]]), X < 0 ? K.adj(L(bst), 0.08) : S(bst));
      for (const X of [-11.8, 11.8]) {
        const [x, yb] = pr(X, 6.0, ZB), [, yt] = pr(X, 9.6, ZB), gr = F * 0.24 / ZB;
        s += K.rect(x - 2, yt, 4, yb - yt, iron) + K.rect(x - gr * 2.2, yt + 2, gr * 4.4, 2.5, iron) + K.circle(x - gr * 2, yt - gr * 0.6, gr, '#fff1cc') + K.circle(x + gr * 2, yt - gr * 0.6, gr, '#fff1cc') + K.circle(x, yt - gr * 1.4, gr, '#fff1cc');
        glows.push([x, yt - gr, F * 2.4 / ZB, P.sodium, 0.55]);
        wins.push([x, VY + F * (E + 9.4) / ZB, VY + F * (E + 9.9) / ZB, gr * 3, '#ffe0a0']);
      }

      /* near: the mills and storefront backs, Z < 36 */
      for (const [sd, z0, z1, h, kind] of [[-1, 30, 35.5, 15, 'brick'], [1, 28, 35.5, 11, 'brick2'], [-1, 22, 30, 13, 'cream'], [1, 17, 28, 15, 'brick'], [-1, 8, 22, 17, 'mill'], [1, 8, 17, 12, 'green']]) s += building(sd, z0, z1, h, kind);
      s += fireEscape(-1, 23.5, 27.5, [6, 9.4]) + fireEscape(1, 10.5, 14.5, [5.9, 9.2]);
      // ghost signs painted on the brick
      const ghost = (sd, za, zb, ya, yb, text, size) => {
        const p1 = pr(14 * sd, yb, za), p2 = pr(14 * sd, yb, zb), p3 = pr(14 * sd, ya, za);
        const W = 100, H = 20;
        const m = [(p2[0] - p1[0]) / W, (p2[1] - p1[1]) / W, (p3[0] - p1[0]) / H, (p3[1] - p1[1]) / H, p1[0], p1[1]].map((v) => +v.toFixed(4));
        return `<g transform="matrix(${m.join(' ')})">` + K.text(W / 2, H * 0.8, text, { fontFamily: SIGN, fontSize: size, fontWeight: 700, fill: L('#ece3cf'), textAnchor: 'middle', opacity: fest ? 0.22 : 0.4, letterSpacing: 1 }) + '</g>';
      };
      s += ghost(-1, 10, 21, 14.6, 16.4, 'BOUCHARD WOOLEN CO.', 15) + ghost(1, 18, 27.5, 12.6, 14.4, 'TRACY & SON HARDWARE', 13);

      /* promenades, walls and the water this side of the bridge */
      const pv = '#8e8678';
      s += K.path(Q([[-9, 2.6, 4], [-9, 2.6, ZB], [-14, 2.6, ZB], [-14, 2.6, 4]]), L(pv)) + K.path(Q([[9, 2.6, 4], [9, 2.6, ZB], [14, 2.6, ZB], [14, 2.6, 4]]), K.mix(L(pv), S(pv), 0.3));
      let flag = '';
      for (let z = 6; z < ZB; z *= 1.12) flag += ld([pr(-9, 2.6, z), pr(-14, 2.6, z)]) + ld([pr(9, 2.6, z), pr(14, 2.6, z)]);
      s += stroke(flag, S(pv), 1, { opacity: 0.4 });
      s += K.path(Q([[-9, 0, 4], [-9, 0, ZB], [-9, 2.6, ZB], [-9, 2.6, 4]]), K.mix(L('#9a968c'), S('#9a968c'), 0.3)) + K.path(Q([[9, 0, 4], [9, 0, ZB], [9, 2.6, ZB], [9, 2.6, 4]]), S('#9a968c'));
      s += K.path(Q([[-9, 0, 4], [-9, 0, ZB], [-9, 0.5, ZB], [-9, 0.5, 4]]) + Q([[9, 0, 4], [9, 0, ZB], [9, 0.5, ZB], [9, 0.5, 4]]), L('#3a4632'), { opacity: 0.7 });
      let wst = '';
      for (let z = 6; z < ZB; z += 1.3 + rng() * 2.4) for (const sd of [-1, 1]) { const [x, y0] = pr(9 * sd, 2.5, z), [, y1] = pr(9 * sd, 0.4 + rng() * 1.2, z); wst += `M${n(x)},${n(y0)}L${n(x)},${n(y1)}`; }
      s += stroke(wst, '#2a2a2a', 2, { opacity: 0.2 });

      const waterD = Q([[-9, 0, 4], [9, 0, 4], [9, 0, ZB], [-9, 0, ZB]]);
      const wg = o.id('water'), wcl = o.id('wclip');
      const wStops = fest ? [[0, '#2a2e40'], [0.3, '#151a2a'], [1, '#0a0d16']] : [[0, '#d69a80'], [0.25, '#8a5e70'], [1, '#2a2a40']];
      s += K.defs(K.linear(wg, wStops, 0, a0y, 0, 900, true), `<clipPath id="${wcl}"><path d="${waterD}"/></clipPath>`) + K.path(waterD, `url(#${wg})`);
      let wd = '';
      // dark reflections of the building walls along both sides
      wd += K.path(pd([pr(-9, 0, ZB), pr(-9, 0, 4), pr(-3.5, 0, 4), pr(-6.5, 0, ZB)]), '#0b0c14', { opacity: fest ? 0.5 : 0.35 }) + K.path(pd([pr(9, 0, ZB), pr(9, 0, 4), pr(3.5, 0, 4), pr(6.5, 0, ZB)]), '#0b0c14', { opacity: fest ? 0.5 : 0.35 });
      if (!fest) wd += K.path(`M${VX - 40},${a0y} L${VX + 40},${a0y} L${VX + 120},900 L${VX - 120},900 Z`, '#f6b880', { opacity: 0.22 });
      // the arch reflected, closing the circle
      wd += K.path(`M${n(a0x)},${n(a0y)}A${n(RA)},${n(RA)} 0 0,0 ${n(a1x)},${n(a0y)}Z`, fest ? '#0e1018' : L('#4a3a48'), { opacity: 0.6 });
      for (const [x, y0, y1, w, c] of wins) { const h = Math.max(3, (y1 - y0) * 1.7); wd += K.rect(x - w / 2, y0, w, h, c, { opacity: 0.32 }); }
      let rp = '';
      for (let i = 0; i < 120; i++) { const Z = 5 + Math.pow(rng(), 0.6) * 31, X = (rng() - 0.5) * 17, [x, y] = pr(X, 0, Z), l = F * (0.4 + rng() * 1.2) / Z; rp += `M${n(x - l / 2)},${n(y)}h${n(l)}`; }
      wd += stroke(rp, fest ? '#3a4260' : '#f0b898', 1.3, { opacity: 0.5 });
      s += `<g clip-path="url(#${wcl})">${wd}</g>`;

      /* the Lantern Float: paper lanterns on the near water, with reflections */
      if (fest) {
        const near = [];
        const GX = -6.3, GZ = 31;
        for (let i = 0; i < 140; i++) {
          const Z = 6.5 + Math.pow(rng(), 0.85) * 29.4, X = (rng() - 0.5) * 16.4;
          if (Math.abs(X - GX) < 1.4 && Math.abs(Z - GZ) < 2.4) continue;
          near.push([X, Z]);
        }
        near.push([GX, GZ, true]);
        near.sort((a, b) => b[1] - a[1]);
        s += K.pool(o, 800, 560, 520, 90, '#ffa848', 0.28, 'nearpool');
        const gl = o.id('lg'), gg = o.id('lgg');
        s += K.defs(glowDef(gl, '#ffb24e', 0.55), glowDef(gg, P.lantern, 0.42));
        const body = bucket(), top = bucket(), core = bucket(), refl = bucket(), floats = bucket();
        let glowEls = '';
        for (const [X, Z, green] of near) {
          const [x, y] = pr(X, 0.12, Z), w = F * 0.36 / Z, h = w * 0.82;
          glowEls += K.circle(x, y - h * 0.5, w * (green ? 2.1 : 2.4), `url(#${green ? gg : gl})`);
          const bc = green ? '#c9eab4' : rng.pick(['#f6a540', '#f8b850', '#f09238', '#ffc866']);
          refl.add(green ? '#b8e0a0' : bc, `M${n(x - w * 0.32)},${n(y + 1)}L${n(x + w * 0.32)},${n(y + 1)}L${n(x + w * 0.08)},${n(y + w * 2.6)}L${n(x - w * 0.08)},${n(y + w * 2.6)}Z`);
          body.add(bc, `M${n(x - w / 2)},${n(y)}L${n(x + w / 2)},${n(y)}L${n(x + w * 0.44)},${n(y - h)}L${n(x - w * 0.44)},${n(y - h)}Z`);
          if (w > 7) top.add(green ? '#e6f8da' : '#ffe6b0', `M${n(x - w * 0.44)},${n(y - h)}L${n(x + w * 0.44)},${n(y - h)}L${n(x + w * 0.34)},${n(y - h - w * 0.16)}L${n(x - w * 0.34)},${n(y - h - w * 0.16)}Z`);
          core.add(green ? '#f2fff0' : '#fff6d8', `M${n(x - w * 0.14)},${n(y - h * 0.15)}h${n(w * 0.28)}v${n(-h * 0.55)}h${n(-w * 0.28)}Z`);
          if (w > 6) floats.add('#2a1a14', `M${n(x - w * 0.56)},${n(y)}h${n(w * 1.12)}v${n(w * 0.12)}h${n(-w * 1.12)}Z`);
        }
        s += glowEls + refl.out({ opacity: 0.4 }) + floats.out() + body.out() + top.out() + core.out();
      }

      /* the crowd along both railings (night of the Float) */
      if (fest) {
        const ppl = [];
        for (const sd of [-1, 1]) for (let z = 7; z < 35.5; z += 0.5 + rng() * 0.45) for (let k = 0; k < 3; k++) {
          if (rng() < 0.2) continue;
          const X = sd * (9.5 + k * 0.8 + rng() * 0.35), child = rng() < 0.15;
          ppl.push([X, z, child ? 1.05 + rng() * 0.3 : 1.55 + rng() * 0.32, child, rng() < 0.4 ? 1 : 0, rng() < 0.12]);
        }
        ppl.sort((a, b) => Math.hypot(b[0], b[1]) - Math.hypot(a[0], a[1]));
        const pb = bucket();
        const hand = [];
        for (const [X, z, hh, child, coat, lan] of ppl) {
          const [x, yb] = pr(X, 2.6, z), h = F * hh / z;
          pb.add(z > 24 ? '#191d2a' : z > 14 ? '#121520' : '#0b0d15', personD(x, yb, h, { child, coat }));
          if (lan && !child) hand.push(pr(X - Math.sign(X) * 0.3, 3.5, z).concat([F * 0.09 / z]));
        }
        s += pb.out();
        for (const [x, y, r] of hand) s += K.circle(x, y, r * 2.6, '#ffb24e', { opacity: 0.25 }) + K.circle(x, y, r, '#ffd890');
      } else {
        let few = '';
        for (const [X, z, hh] of [[-10.4, 17, 1.7], [-10.9, 17.4, 1.6], [10.6, 26, 1.75], [-11.5, 31, 1.65]]) { const [x, yb] = pr(X, 2.6, z); few += personD(x, yb, F * hh / z, { coat: 1 }); }
        s += K.path(few, L('#1e1c28'));
      }

      /* railings along both edges, lamps along the promenades */
      for (const sd of [-1, 1]) {
        const X = 9.15 * sd;
        let rl = ld([pr(X, 3.7, 4), pr(X, 3.7, ZB)]) + ld([pr(X, 3.25, 4), pr(X, 3.25, ZB)]), bal = '';
        for (let z = 4.2; z < ZB; z += 0.5) bal += ld([pr(X, 2.6, z), pr(X, 3.7, z)]);
        s += stroke(rl, iron, 3) + stroke(bal, iron, 1.2, { opacity: 0.85 });
      }
      for (const Z of [12, 24]) s += lamp(-9.6, Z, 2.6) + lamp(9.6, Z, 2.6);

      /* string lights across the canal (night of the Float) */
      if (fest) {
        for (const [z, ya, ym] of [[17, 12.4, 11.0], [24, 12.8, 11.4], [31, 12.2, 10.9]]) {
          const pts = [];
          for (let i = 0; i <= 28; i++) { const u = i / 28, X = -14 + 28 * u; pts.push(pr(X, ya - (ya - ym) * 4 * u * (1 - u), z)); }
          const d = ld(pts), b = F * 0.11 / z, sp = F * 0.55 / z;
          s += stroke(d, '#0c0d12', 1.2) + stroke(d, '#ffc870', b * 4, { opacity: 0.1, strokeLinecap: 'round' }) + stroke(d, '#fff0c0', b, { strokeDasharray: `0.1 ${n(sp)}`, strokeLinecap: 'round' });
        }
        const [px0, py0] = pr(-14.5, 6.15, ZB), [px1] = pr(14.5, 6.15, ZB);
        s += stroke(`M${n(px0)},${n(py0)}H${n(px1)}`, '#fff0c0', 2.2, { strokeDasharray: '0.1 9', strokeLinecap: 'round' });
      }

      /* glows (lamps, lit windows) */
      for (const [x, y, r, c, op] of glows) s += K.glow(o, x, y, r, c, op, 'g');

      /* the parapet of the bridge we stand on */
      let bal = '';
      for (let x = -20; x < 1630; x += 26) bal += `M${x},806V866`;
      s += stroke(bal, iron, 5) + K.rect(-10, 792, 1620, 14, iron) + K.rect(-10, 862, 1620, 40, fest ? '#10131c' : L('#4a4448'));
      if (fest) s += K.band(o, 600, 300, '#05070c', 0, 0.3, 'dark');
      else s += K.band(o, 300, 420, '#d88a68', 0, 0.1, 'haze');
      return s;
    }
  });

  /* ================================================================== */
  /* Bassey Park on a gold October afternoon: Paul Bunyan on his plinth,
   * the playground, maples letting go of everything, the canal beyond. */
  ART.bg('park', {
    times: ['afternoon'],
    draw(o) {
      const t = o.time, rng = o.rng;
      const { L, S, T } = lighting(t);
      const hz = (c, k) => K.mix(c, T.haze, k);
      let s = K.sky(o, t);
      s += K.glow(o, 160, 300, 720, '#ffdc9c', 0.55, 'sun');
      s += K.clouds(rng, { count: 5, y0: 60, y1: 300, color: '#ffe2b0', shadow: '#c79a7a', opacity: 0.5, w: 560 });

      /* downtown beyond the canal, hazy in the gold */
      const dt = hz(L('#9a5a44'), 0.6), dts = hz(S('#9a5a44'), 0.6);
      for (let x = 820; x < 1520;) { const w = 30 + rng() * 50, h = 30 + rng() * 50; s += K.rect(x, 452 - h, w, h, dt) + K.rect(x + w - 8, 452 - h, 8, h, dts); x += w + 1; }
      s += K.rect(1238, 330, 14, 100, hz(L('#ece3cf'), 0.55)) + K.path('M1235,332 L1245,262 L1255,332 Z', hz(L('#ece3cf'), 0.55)) + K.rect(1004, 360, 10, 90, dt);
      s += K.rect(820, 444, 720, 10, hz(L('#8a8478'), 0.5));
      s += K.rect(820, 453, 720, 10, hz('#f6dca0', 0.2)) + stroke('M824,446H1536', hz(L('#2e2e33'), 0.5), 1.4) + stroke(Array.from({ length: 48 }, (_, i) => `M${830 + i * 15},446V452`).join(''), hz(L('#2e2e33'), 0.5), 1);
      /* far tree line, gap where the canal shows */
      const pairs = [[P.ember, P.rust], [P.mustard, '#a87a2a'], [P.rust, '#7e3a24'], ['#c86a32', '#8a4a2a']].map(([a, b]) => [hz(L(a), 0.4), hz(S(b), 0.4)]);
      s += canopyBand(rng, { x0: -40, x1: 880, y: 420, amp: 22, r0: 30, r1: 58, step: 40, k: 0.75, pairs });
      s += canopyBand(rng, { x0: 1440, x1: 1660, y: 420, amp: 20, r0: 30, r1: 56, step: 40, k: 0.75, pairs });
      s += K.path(K.ridge(rng, { x0: -20, x1: 880, y: 460, amp: 6, steps: 12 }), hz(S(P.moss), 0.35)) + K.rect(1440, 452, 200, 20, hz(S(P.moss), 0.35));

      /* the lawn */
      const lg = o.id('lawn');
      s += K.defs(K.linear(lg, [[0, hz(L(P.moss), 0.3)], [1, L('#7a8044')]], 0, 455, 0, 900, true)) + K.rect(-10, 455, 1620, 460, `url(#${lg})`);
      s += K.path(grassD(rng, { x0: -20, x1: 1640, y0: 470, y1: 640, count: 260, hMin: 4, hMax: 12, lean: 4 }), S(P.moss), { opacity: 0.6 });

      /* mid maples */
      const mc = (a, b, c, k) => [hz(L(a), k), hz(S(b), k), hz(L(c), k)];
      s += treeL(rng, { x: 300, base: 500, h: 330, w: 290, colors: mc(P.ember, P.rust, P.mustard, 0.22), trunk: hz(S('#3a2c26'), 0.22) });
      s += treeL(rng, { x: 860, base: 486, h: 250, w: 220, colors: mc(P.mustard, '#a87a2a', '#f0c060', 0.28), trunk: hz(S('#3a2c26'), 0.28) });
      s += treeL(rng, { x: 1450, base: 494, h: 300, w: 260, colors: mc(P.rust, '#7e3a24', P.ember, 0.24), trunk: hz(S('#3a2c26'), 0.24) });
      // long afternoon shadows of the trees, falling right
      s += K.path('M300,500 L620,520 L640,534 L300,512 Z M860,486 L1120,500 L1130,510 L860,496 Z M1450,494 L1660,506 L1660,516 L1450,504 Z', S(P.moss), { opacity: 0.45 });

      /* the swing set */
      const tube = L('#7c8a94'), tubeS = S('#7c8a94');
      s += K.path('M1040,598 L1188,612 L1198,622 L1040,608 Z M1000,598 L1460,612 L1470,620 L1000,606 Z', S(P.moss), { opacity: 0.4 });
      s += K.path(ellD(1110, 600, 34, 7) + ellD(1196, 600, 34, 7) + ellD(1282, 600, 34, 7), S('#8a7050'), { opacity: 0.7 });
      s += stroke('M1004,392 L962,600 M1004,392 L1034,594 M1344,392 L1306,598 M1344,392 L1378,602', tube, 7, { strokeLinecap: 'round' });
      s += stroke('M1004,392 L1034,594 M1344,392 L1378,602', tubeS, 7, { strokeLinecap: 'round' });
      s += stroke('M976,520 L1028,522 M1316,520 L1370,524', tubeS, 4);
      s += stroke('M996,392 L1352,392', tube, 8, { strokeLinecap: 'round' }) + stroke('M996,395 L1352,395', tubeS, 3);
      s += stroke('M1090,396 L1092,548 M1130,396 L1128,548 M1176,396 L1200,546 M1216,396 L1236,544 M1262,396 L1270,546 M1300,396 L1296,550', L('#9aa0a6'), 1.4, { strokeDasharray: '3 2' });
      s += K.path('M1086,546 q22,10 46,0 l0,5 q-22,10 -46,0 Z M1196,543 q22,10 44,0 l0,5 q-22,10 -44,0 Z M1266,546 q16,10 34,2 l0,5 q-18,8 -34,-2 Z', L('#1e1c1c'));

      /* the slide */
      s += K.path('M936,588 L1080,600 L1086,608 L936,596 Z', S(P.moss), { opacity: 0.4 });
      s += stroke('M816,592 L832,418 M846,594 L862,418', tube, 5, { strokeLinecap: 'round' });
      let rungs = '';
      for (let i = 1; i < 10; i++) { const y = 418 + i * 17.4, k = (y - 418) / 176; rungs += `M${n(832 - 16 * k)},${n(y)}L${n(862 - 16 * k)},${n(y)}`; }
      s += stroke(rungs, tubeS, 3.4);
      s += stroke('M826,418 Q824,380 846,378 Q868,380 866,418', tube, 4) + K.rect(826, 412, 46, 8, L('#c0c6cc'));
      s += K.path('M866,412 L880,412 Q920,440 940,530 Q950,572 980,580 L986,594 Q936,590 924,540 Q908,450 866,424 Z', L('#d2d8dc'));
      s += K.path('M880,412 Q920,440 940,530 Q950,572 980,580 L986,594 Q942,592 934,560 Q920,470 880,420 Z', S('#c0c6cc'));
      s += stroke('M872,416 Q914,446 932,532 Q942,576 980,586', '#ffffff', 1.6, { opacity: 0.6 });
      s += stroke('M930,540 L934,592 M890,440 L896,594', tubeS, 4);

      /* Paul Bunyan on his plinth */
      const gr = '#9a948a';
      s += K.path('M740,560 L1080,574 L1210,580 L1236,590 L1080,592 L740,572 Z', S(P.moss), { opacity: 0.45 });
      s += K.rect(548, 540, 184, 22, L(gr)) + K.poly([[732, 540], [756, 530], [756, 552], [732, 562]], S(gr)) + K.poly([[548, 540], [732, 540], [756, 530], [572, 530]], K.adj(L(gr), 0.1));
      s += K.rect(562, 474, 156, 66, L(gr)) + K.poly([[718, 474], [738, 466], [738, 532], [718, 540]], S(gr)) + K.poly([[562, 474], [718, 474], [738, 466], [582, 466]], K.adj(L(gr), 0.1));
      s += K.rect(552, 462, 176, 12, K.adj(L(gr), 0.05)) + K.poly([[728, 462], [750, 453], [750, 465], [728, 474]], S(gr)) + K.poly([[552, 462], [728, 462], [750, 453], [574, 453]], K.adj(L(gr), 0.14));
      s += K.rect(598, 488, 84, 32, L('#6e5228')) + K.rect(601, 491, 78, 26, L('#8a6a34'));
      s += K.text(640, 505, 'PAUL BUNYAN', { fontFamily: SIGN, fontSize: 11, fontWeight: 700, fill: L('#e8d498'), textAnchor: 'middle', letterSpacing: 1 }) + K.text(640, 514, 'BASSEY PARK · 1959', { fontFamily: SIGN, fontSize: 6.5, fill: L('#e0c88a'), textAnchor: 'middle', letterSpacing: 0.5 });
      const pid = o.id('plaid'), plaid = L('#b8352c');
      s += `<defs><pattern id="${pid}" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="${plaid}"/><rect width="11" height="22" fill="#161214" opacity="0.6"/><rect width="22" height="11" fill="#161214" opacity="0.6"/></pattern></defs>`;
      const shad = '#2a1c30';
      // boots and jeans
      s += K.path('M598,458 L600,428 L634,428 L636,458 Z M648,458 L650,428 L686,428 L690,458 Z', L('#2e2420'));
      s += K.path('M596,458 Q596,446 604,446 L634,446 L636,458 Z M646,458 Q646,446 654,446 L686,446 L690,458 Z', L('#3e302a'));
      s += K.path('M590,296 L692,296 L686,432 L650,432 L641,324 L634,432 L600,432 Z', L('#3e6090'));
      s += K.path('M662,296 L692,296 L686,432 L664,432 Z M641,324 L634,432 L626,432 Z', shad, { opacity: 0.35 });
      s += K.rect(599, 418, 36, 12, L('#5a7eaa')) + K.rect(649, 418, 38, 12, L('#5a7eaa')) + K.rect(669, 418, 18, 12, shad, { opacity: 0.3 });
      s += stroke('M606,312 Q604,370 610,414', '#ffffff', 2.4, { opacity: 0.18 });
      // shirt, belt
      s += K.path('M574,170 L708,170 L720,188 L700,294 L586,294 L560,190 Z', `url(#${pid})`);
      s += K.path('M668,170 L708,170 L720,188 L700,294 L670,294 Z', shad, { opacity: 0.38 });
      s += K.rect(586, 286, 116, 12, L('#4a3020')) + K.rect(634, 287, 14, 10, L(P.mustard));
      // his left arm, fist on his hip
      s += K.path('M706,174 L730,188 L758,250 L714,298 L696,284 L728,248 L700,208 Z', `url(#${pid})`) + K.path('M706,174 L730,188 L758,250 L714,298 L696,284 L728,248 L700,208 Z', shad, { opacity: 0.38 });
      s += K.circle(704, 288, 12, L('#d49a72')) + K.path('M704,276 a12,12 0 0,1 0,24 Z', shad, { opacity: 0.3 });
      // his right arm up, the axe on his shoulder
      s += K.path('M566,182 L598,178 L580,250 L552,250 Z', `url(#${pid})`);
      s += K.path('M552,240 L580,250 L612,218 L594,204 Z', `url(#${pid})`);
      s += `<g transform="translate(546,112) rotate(-32.6)">` + K.rect(-3.5, 0, 7, 158, L('#c8a46a')) + K.rect(1, 0, 2.5, 158, S('#c8a46a')) +
        K.path('M5,-12 L-38,-22 Q-50,0 -38,22 L5,12 Z', L('#9aa0a6')) + K.path('M5,2 L-44,6 Q-46,14 -38,22 L5,12 Z', S('#9aa0a6')) + K.path('M-38,-22 Q-50,0 -38,22 L-34,21 Q-45,0 -34,-21 Z', '#eef2f4') + K.rect(5, -10, 12, 20, S('#9aa0a6')) + '</g>';
      s += K.circle(602, 210, 13, L('#d49a72')) + K.path('M592,204 q10,-6 20,2', 'none', { stroke: S('#d49a72'), strokeWidth: 2 });
      // head: black beard, black hair, rosy cheeks
      s += K.ellipse(613, 130, 5, 8, L('#d49a72')) + K.ellipse(667, 130, 5, 8, L('#d49a72'));
      s += K.ellipse(640, 128, 26, 31, L('#dca47a'));
      s += K.path('M612,122 Q614,92 640,90 Q668,92 668,122 Q664,104 640,104 Q618,104 612,122 Z', '#141014');
      s += K.path('M612,124 Q608,172 640,196 Q672,172 668,124 Q666,146 656,150 Q648,142 640,146 Q632,142 624,150 Q614,146 612,124 Z', '#161216');
      s += K.path('M626,148 Q640,140 654,148 Q640,152 626,148 Z', '#100c10') + K.path('M633,156 q7,4 14,0', 'none', { stroke: '#a85a5a', strokeWidth: 2.4 });
      s += K.ellipse(630, 124, 3.2, 3.6, '#1a1214') + K.ellipse(651, 124, 3.2, 3.6, '#1a1214') + K.circle(631, 123, 1, '#ffffff');
      s += K.path('M622,115 q8,-5 15,-1 l0,3 q-8,-3 -15,1 Z M644,114 q8,-4 15,1 l0,3 q-7,-4 -15,-1 Z', '#141014');
      s += K.path('M640,126 L636,140 Q640,143 645,140 Z', L('#c68a62'));
      s += K.circle(628, 138, 6, L('#d87a6e'), { opacity: 0.45 }) + K.circle(653, 138, 6, L('#d87a6e'), { opacity: 0.45 });
      s += K.path('M652,100 Q670,110 668,130 Q666,160 640,196 Q660,170 662,130 Q662,112 652,100 Z', shad, { opacity: 0.3 });
      s += stroke('M620,108 Q626,100 636,98 M580,190 Q576,214 570,236', '#ffffff', 2, { opacity: 0.22 });

      /* the bench, the merry-go-round */
      s += K.path('M400,574 L540,580 L548,588 L400,582 Z', S(P.moss), { opacity: 0.4 });
      s += K.rect(404, 548, 6, 26, L('#2e2e33')) + K.rect(524, 548, 6, 28, L('#2e2e33'));
      s += K.poly([[396, 546], [538, 550], [534, 558], [392, 554]], L('#4a6a4a')) + K.poly([[400, 520], [540, 524], [540, 532], [400, 528]], L('#4a6a4a')) + K.poly([[400, 532], [540, 536], [540, 543], [400, 539]], S('#4a6a4a'));
      s += K.path('M330,642 L520,650 L530,660 L330,654 Z', S(P.moss), { opacity: 0.35 });
      s += K.path(ellD(330, 630, 110, 24), S('#7a7064')) + K.rect(220, 620, 220, 10, S('#7a7064'));
      const segs = [L('#b8483a'), L('#d9a441'), L('#4a6a8a'), L('#5a7a4a')];
      for (let i = 0; i < 8; i++) { const a0 = i / 8 * Math.PI * 2, a1 = (i + 1) / 8 * Math.PI * 2; s += K.path(`M330,620 L${n(330 + Math.cos(a0) * 110)},${n(620 + Math.sin(a0) * 24)} A110,24 0 0,1 ${n(330 + Math.cos(a1) * 110)},${n(620 + Math.sin(a1) * 24)} Z`, segs[i % 4]); }
      let hoops = '';
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3, x = 330 + Math.cos(a) * 100, y = 620 + Math.sin(a) * 21; hoops += `M${n(x)},${n(y)}Q${n((x + 330) / 2)},${n(y - 44)} 330,${n(586)}`; }
      s += stroke(hoops, L('#9aa0a6'), 3) + K.rect(326, 580, 8, 40, L('#9aa0a6'));

      /* the asphalt path, a chalk circle for jump rope */
      const ASP = [[-20, 648], [300, 662], [700, 654], [1100, 640], [1640, 630]];
      s += K.path(smoothD(ASP) + 'L1640,920L-20,920Z', L('#7e776c'));
      s += K.path(smoothD(ASP) + smoothD(ASP.map(([x, y]) => [x, y + 8]).reverse(), false) + 'Z', S('#7e776c'));
      s += stroke('M140,720 l40,22 l-10,30 M980,700 l30,18 l40,-6 M1300,760 l-20,30', S('#7e776c'), 1.4, { opacity: 0.6 });
      s += stroke(ellD(800, 690, 118, 24), '#f2ece0', 3, { opacity: 0.8 }) + stroke(ellD(803, 692, 112, 22), '#f0c0c8', 2, { opacity: 0.55 });
      s += stroke('M790,688 l12,6 M802,688 l-12,6 M944,708 l10,-8 l10,8 M900,716 h22', '#f2ece0', 2, { opacity: 0.7 });
      s += K.text(700, 734, 'JUMP 100!', { fontFamily: SCRAWL, fontSize: 16, fill: '#f2ece0', opacity: 0.65, transform: 'rotate(-3 700 734)' });

      /* framing maples, leaves everywhere */
      s += treeL(rng, { x: 60, base: 720, h: 760, w: 560, colors: [L(P.ember), S(P.rust), L(P.mustard)], trunk: S('#3a2c26') });
      s += treeL(rng, { x: 1560, base: 700, h: 700, w: 480, colors: [L(P.rust), S('#7e3a24'), L(P.ember)], trunk: S('#3a2c26') });
      s += leafField(rng, { count: 220, x0: -20, x1: 1640, y0: 470, y1: 640, colors: [L(P.rust), L(P.ember), L(P.mustard), S(P.rust)], size: 5 });
      s += leafField(rng, { count: 320, x0: -20, x1: 1640, y0: 640, y1: 910, colors: [L(P.rust), L(P.ember), L(P.mustard), S(P.rust), S(P.ember)], size: 8 });
      s += leafField(rng, { count: 90, x0: -20, x1: 220, y0: 680, y1: 760, colors: [L(P.ember), L(P.rust), L(P.mustard)], size: 9 });
      s += leafField(rng, { count: 40, x0: 0, x1: 1600, y0: 80, y1: 520, colors: [L(P.ember), L(P.mustard), L(P.rust)], size: 6, flat: 1, persp: false, opacity: 0.9 });

      /* gold light through the trees */
      s += K.shaft(o, [[140, 120], [260, 80], [900, 640], [640, 680]], '#ffe2a0', 0.14, 'sun1', [0, 0, 0.5, 1]);
      s += K.shaft(o, [[300, 180], [360, 160], [1200, 560], [1050, 600]], '#ffe2a0', 0.09, 'sun2', [0, 0, 0.6, 1]);
      s += K.band(o, 360, 220, T.haze, 0, 0.22, 'haze');
      return s;
    }
  });

  /* ================================================================== */
  /* A residential street during the Quiet. Every window dark, the
   * streetlights going out one by one, fog in the road — and one TV on,
   * with someone standing very still behind the curtain. */
  ART.bg('street_quiet', {
    times: ['quiet'],
    draw(o) {
      const t = 'quiet', rng = o.rng;
      const { L, S, T } = lighting(t);
      const VX = 640, VY = 440, F = 900, E = 1.6;
      const pr = (X, Y, Z) => [VX + F * X / Z, VY + F * (E - Y) / Z];
      const Q = (pts) => pd(pts.map((p) => pr(p[0], p[1], p[2])));
      let s = K.sky(o, t);
      s += K.stars(rng, { count: 28, y1: 300, color: '#8fa595' });

      /* the hill at the end of the street; the Standpipe's ruin, and a light */
      s += K.path('M160,470 C300,436 420,380 520,352 C560,342 610,336 640,340 C760,356 920,420 1120,470 Z', '#0d1219');
      s += K.path('M584,340 l2,-8 l3,2 l2,-5 l3,3 l3,-1 l2,6 l3,-2 l2,5 Z', '#141c1f');
      s += K.pool(o, 640, 470, 520, 46, '#1c2622', 0.5, 'hillfog');

      /* ground: road, curbs, grass strips, sidewalks, lawns */
      const far = 420, near = 2.4;
      const strip = (x0, x1, c, o2) => K.path(Q([[x0, 0, near], [x1, 0, near], [x1, 0, far], [x0, 0, far]]), c, o2);
      s += strip(-30, 30, L('#3e4448'));
      s += strip(-6.2, 6.2, L('#33373c'));
      for (const sd of [-1, 1]) {
        s += strip(6.2 * sd, 7.5 * sd, L('#4a5640')) + strip(7.5 * sd, 9 * sd, L('#7a7a74')) + strip(9 * sd, 30 * sd, L('#4e5a42'));
        s += K.path(Q([[6 * sd, 0, near], [6 * sd, 0.15, near], [6 * sd, 0.15, far], [6 * sd, 0, far]]), L('#8a8a82'));
        let seams = '';
        for (let z = 3; z < 120; z += 1.6) seams += ld([pr(7.5 * sd, 0, z), pr(9 * sd, 0, z)]);
        s += stroke(seams, S('#7a7a74'), 1, { opacity: 0.5 });
      }

      /* houses */
      const house = (sd, z0, w, type, opt = {}) => {
        const X0 = 15 * sd, X1 = (15 + (opt.depth || 10)) * sd, z1 = z0 + w, zm = z0 + w / 2;
        const vic = type === 'vic', wallH = vic ? 6.4 : 4.3, ridge = vic ? 10.2 : 8.3;
        const sid = opt.siding || (vic ? '#7f8f86' : '#a89c86');
        const faceF = sd > 0 ? L(sid) : S(sid), faceN = sd > 0 ? S(sid) : K.mix(L(sid), S(sid), 0.5);
        const TR = L('#d8d0bc'), RF = L('#3a3d48'), RFs = S('#3a3d48'), GL = L('#2a3550');
        const farH = z0 > 70;
        let r = '';
        const win = (pts, frame = !farH) => (frame ? K.path(Q(pts.map(([X, Y, Z], i) => [X, Y + ([0, 1].includes(i) ? -0.12 : 0.12), Z])), TR) : '') + K.path(Q(pts), GL);
        if (vic) {
          r += K.path(Q([[X0, 0, z0], [X1, 0, z0], [X1, wallH, z0], [X0, wallH, z0]]), faceN);
          r += K.path(Q([[X0 - sd * 0.4, wallH, z0 - 0.5], [X1 + sd * 0.3, wallH, z0 - 0.5], [X1 + sd * 0.3, ridge, zm], [X0 - sd * 0.4, ridge, zm]]), RFs);
          r += K.path(Q([[X0 - sd * 0.4, wallH - 0.25, z0 - 0.5], [X1 + sd * 0.3, wallH - 0.25, z0 - 0.5], [X1 + sd * 0.3, wallH, z0 - 0.5], [X0 - sd * 0.4, wallH, z0 - 0.5]]), TR);
          for (const fy of [1.0, 3.9]) for (const xx of [2.4, 6.6]) r += win([[X0 + sd * xx, fy, z0], [X0 + sd * (xx + 1.1), fy, z0], [X0 + sd * (xx + 1.1), fy + 1.6, z0], [X0 + sd * xx, fy + 1.6, z0]]);
        } else {
          const Xm = (X0 + X1) / 2;
          r += K.path(Q([[X0, 0, z0], [X1, 0, z0], [X1, wallH, z0], [Xm, ridge, z0], [X0, wallH, z0]]), faceN);
          r += K.path(Q([[X0 - sd * 0.5, wallH - 0.3, z0 - 0.02], [Xm, ridge + 0.2, z0 - 0.02], [X1 + sd * 0.5, wallH - 0.3, z0 - 0.02], [X1 + sd * 0.5, wallH, z0 - 0.02], [Xm, ridge + 0.5, z0 - 0.02], [X0 - sd * 0.5, wallH, z0 - 0.02]]), RF);
          for (const xx of [2.2, 6.7]) r += win([[X0 + sd * xx, 1.0, z0], [X0 + sd * (xx + 1.1), 1.0, z0], [X0 + sd * (xx + 1.1), 2.5, z0], [X0 + sd * xx, 2.5, z0]]);
          r += win([[Xm - sd * 0.55, 5.0, z0], [Xm + sd * 0.55, 5.0, z0], [Xm + sd * 0.55, 6.3, z0], [Xm - sd * 0.55, 6.3, z0]]);
        }
        r += K.path(Q([[X0, 0, z0], [X0, 0, z1], [X0, wallH, z1], [X0, wallH, z0]]), faceF);
        if (vic) r += K.path(Q([[X0, wallH, z0], [X0, ridge, zm], [X0, wallH, z1]]), faceF) + stroke(ld([pr(X0, wallH - 0.1, z0 - 0.4), pr(X0, ridge + 0.25, zm), pr(X0, wallH - 0.1, z1 + 0.4)]), TR, Math.max(1, F * 0.2 / zm));
        else r += K.path(Q([[X0 - sd * 0.45, wallH - 0.1, z0 - 0.3], [X0 - sd * 0.45, wallH - 0.1, z1 + 0.3], [(X0 + X1) / 2, ridge, z1 + 0.3], [(X0 + X1) / 2, ridge, z0 - 0.3]]), RF);
        for (let z = z0 + 1.0; z + 1.1 < z1 - 0.6; z += 2.5) {
          r += win([[X0, 1.0, z], [X0, 1.0, z + 1.1], [X0, 2.6, z + 1.1], [X0, 2.6, z]], false);
          if (vic) r += win([[X0, 3.9, z], [X0, 3.9, z + 1.1], [X0, 5.5, z + 1.1], [X0, 5.5, z]], false);
        }
        if (vic && !opt.noPorch) {
          const za = z0 + 0.4, zb = z0 + w * 0.6, Xp = X0 - sd * 2.3;
          r += K.path(Q([[X0, 0.6, za], [Xp, 0.6, za], [Xp, 0.6, zb], [X0, 0.6, zb]]), L('#3a342e'));
          r += K.path(Q([[X0, 3.0, za], [Xp, 3.0, za], [Xp, 3.0, zb], [X0, 3.0, zb]]), '#07090c');
          r += K.path(Q([[Xp, 3.0, za], [Xp, 3.0, zb], [Xp, 3.4, zb], [Xp, 3.4, za]]), TR);
          let po = '';
          for (const z of [za + 0.1, (za + zb) / 2, zb - 0.1]) po += ld([pr(Xp, 0.6, z), pr(Xp, 3.0, z)]);
          po += ld([pr(Xp, 1.5, za), pr(Xp, 1.5, zb)]) + ld([pr(Xp, 0.6, za + 0.1), pr(X0, 0.6, za + 0.1), pr(X0, 3.0, za + 0.1)]) + ld([pr(Xp, 1.5, za + 0.1), pr(X0, 1.5, za + 0.1)]);
          r += stroke(po, TR, Math.max(1, F * 0.16 / za));
        }
        return r;
      };
      // the TV house: a Victorian whose front wing faces down the street toward us
      const tvZ = 33;
      const tvHouse = () => {
        let r = house(1, tvZ, 12, 'vic', { noPorch: true, siding: '#8a8a7a' });
        const X0 = 11.6, X1 = 15, z0 = tvZ, zw = tvZ + 5.4, wallH = 6.4, rdg = 8.8, sid = '#8a8a7a';
        const TR = L('#d8d0bc'), GL = L('#2a3550');
        r += K.path(Q([[X0, 0, z0], [X1, 0, z0], [X1, wallH, z0], [X0, wallH, z0]]), S(sid));
        r += K.path(Q([[X0 - 0.3, wallH, z0 - 0.4], [X1, wallH, z0 - 0.4], [X1, rdg, z0 + 2.7], [X0 - 0.3, rdg, z0 + 2.7]]), S('#3a3d48'));
        r += K.path(Q([[X0, 0, z0], [X0, 0, zw], [X0, wallH, zw], [X0, wallH, z0]]), L(sid)) + K.path(Q([[X0, wallH, z0], [X0, rdg, z0 + 2.7], [X0, wallH, zw]]), L(sid));
        r += K.path(Q([[X0 + 0.9, 3.8, z0], [X0 + 2.3, 3.8, z0], [X0 + 2.3, 5.4, z0], [X0 + 0.9, 5.4, z0]]), TR) + K.path(Q([[X0 + 1.0, 3.9, z0], [X0 + 2.2, 3.9, z0], [X0 + 2.2, 5.3, z0], [X0 + 1.0, 5.3, z0]]), GL);
        r += K.path(Q([[X0, 0.5, zw], [X0 - 2.2, 0.5, zw], [X0 - 2.2, 0.5, tvZ + 12], [X0, 0.5, tvZ + 12]]), L('#3a342e'));
        return r;
      };
      const right = [[13, 11, 'vic'], [tvZ, 12, 'tv'], [52, 9, 'cape'], [67, 10, 'vic'], [84, 9, 'cape'], [99, 10, 'vic'], [116, 9, 'cape'], [133, 10, 'vic'], [150, 9, 'cape']];
      const left = [[16, 12, 'vic'], [36, 9, 'cape'], [51, 10, 'vic'], [68, 9, 'cape'], [83, 10, 'vic'], [100, 9, 'cape'], [117, 10, 'vic'], [134, 9, 'cape'], [151, 10, 'vic']];
      const sidings = ['#7f8f86', '#a89c86', '#8a7e9a', '#b9b09a', '#7a8a9a', '#9a8070'];
      for (let i = right.length - 1; i >= 0; i--) {
        const [z, w, ty] = left[i];
        s += house(-1, z, w, ty, { siding: sidings[i % sidings.length] });
        const [zr, wr, tr] = right[i];
        s += tr === 'tv' ? tvHouse() : house(1, zr, wr, tr, { siding: sidings[(i + 3) % sidings.length] });
      }

      /* street trees: dark canopies hanging over the sidewalks */
      const tc = ['#0c100e', '#101512'];
      for (const [sd, z, rr] of [[-1, 80, 3.2], [1, 72, 3.2], [-1, 46, 3.4], [-1, 22, 3.6], [1, 15, 3.4]]) {
        const X = 6.9 * sd, [x, yb] = pr(X, 0, z), [, yt] = pr(X, 4.4, z), [cx, cy] = pr(X - sd * 0.6, 7.6, z), R2 = F * rr / z;
        s += K.rect(x - F * 0.18 / z, yt, F * 0.36 / z, yb - yt, '#0a0d10');
        s += K.path(K.blob(rng, cx, cy, R2, R2 * 0.82, { lobes: 9, jag: 0.25, scallop: 0.16 }), tc[0]) + K.path(K.blob(rng, cx - R2 * 0.15, cy - R2 * 0.2, R2 * 0.7, R2 * 0.55, { lobes: 8, jag: 0.25 }), tc[1]);
      }

      /* parked cars, all dark */
      const car = (sd, Xc, z, len, paint, wagon) => {
        const xa = Xc - 0.9, xb = Xc + 0.9, inner = sd > 0 ? xa : xb, zb = z + len;
        const P0 = L(paint), PS = S(paint), GLs = '#07090d';
        let r = K.path(Q([[inner, 0.3, z], [inner, 0.3, zb], [inner, 0.95, zb], [inner, 0.95, z]]), P0);
        r += K.path(Q([[xa, 0.95, z], [xb, 0.95, z], [xb, 0.95, zb], [xa, 0.95, zb]]), K.mix(P0, PS, 0.4));
        r += K.path(Q([[xa, 0.25, z], [xb, 0.25, z], [xb, 0.95, z], [xa, 0.95, z]]), PS);
        const c0 = z + (wagon ? 0.9 : 1.2), c1 = zb - (wagon ? 0.5 : 1.3), ci = sd > 0 ? xa + 0.12 : xb - 0.12;
        r += K.path(Q([[xa + 0.12, 0.95, c0], [xb - 0.12, 0.95, c0], [xb - 0.15, 1.38, c0 + 0.4], [xa + 0.15, 1.38, c0 + 0.4]]), GLs);
        r += K.path(Q([[ci, 0.95, c0], [ci, 0.95, c1], [ci, 1.38, c1 - 0.3], [ci, 1.38, c0 + 0.4]]), GLs);
        r += K.path(Q([[xa + 0.15, 1.38, c0 + 0.4], [xb - 0.15, 1.38, c0 + 0.4], [xb - 0.15, 1.38, c1 - 0.3], [xa + 0.15, 1.38, c1 - 0.3]]), K.mix(P0, PS, 0.2));
        r += K.path(Q([[xa + 0.1, 0.55, z - 0.01], [xa + 0.4, 0.55, z - 0.01], [xa + 0.4, 0.75, z - 0.01], [xa + 0.1, 0.75, z - 0.01]]) + Q([[xb - 0.4, 0.55, z - 0.01], [xb - 0.1, 0.55, z - 0.01], [xb - 0.1, 0.75, z - 0.01], [xb - 0.4, 0.75, z - 0.01]]), '#1a0c0e');
        for (const zw of [z + 0.8, zb - 0.8]) { const [wx, wy] = pr(inner, 0.32, zw), rr = F * 0.33 / zw; r += K.ellipse(wx, wy, rr * 0.45, rr, '#050607'); }
        return r;
      };
      s += car(1, 4.9, 72, 5.2, '#4a4a3a', false) + car(-1, -4.9, 52, 5.4, '#5a4a3a', true) + car(1, 4.9, 41, 4.8, '#3a4660', false) + car(-1, -4.9, 24, 4.8, '#5a2e2e', false) + car(1, 4.9, 13.5, 5.4, '#7a7f86', true);

      /* streetlights: the nearest dead, the next dead, one far one still burning, barely */
      const sl = (sd, z, state) => {
        const X = 6.7 * sd, [x, yb] = pr(X, 0, z), [, yt] = pr(X, 7.0, z), [hx, hy] = pr(4.4 * sd, 6.9, z), w = Math.max(1.4, F * 0.16 / z);
        let r = K.rect(x - w / 2, yt, w, yb - yt, '#090b0e') + stroke(`M${n(x)},${n(yt + w)}Q${n((x + hx) / 2)},${n(yt - F * 0.5 / z)} ${n(hx)},${n(hy)}`, '#090b0e', w * 0.8);
        r += K.ellipse(hx, hy, F * 0.45 / z, F * 0.14 / z, '#0b0d10');
        if (state === 'ember') r += K.ellipse(hx, hy + F * 0.06 / z, F * 0.28 / z, F * 0.05 / z, '#3a2418');
        if (state === 'on') {
          r += K.ellipse(hx, hy + F * 0.06 / z, F * 0.3 / z, F * 0.06 / z, '#d8a050');
          r += K.glow(o, hx, hy, F * 2.2 / z, P.sodium, 0.32, 'slg') + K.shaft(o, [[hx - 3, hy + 2], [hx + 3, hy + 2], [hx + F * 2.2 / z, yb + 4], [hx - F * 2.2 / z, yb + 4]], P.sodium, 0.08, 'sls');
          r += K.pool(o, hx, pr(4.4 * sd, 0, z)[1], F * 3.2 / z, F * 0.5 / z, P.sodium, 0.22, 'slp');
        }
        return r;
      };
      s += sl(1, 64, 'on') + sl(-1, 40, 'ember') + sl(1, 20, 'dead') + sl(-1, 14, 'dead');

      /* fog lying in the street */
      s += K.band(o, 410, 190, '#2b3a33', 0, 0.55, 'fog') + K.band(o, 560, 340, '#1e2a26', 0.35, 0.1, 'fog2');
      for (let i = 0; i < 9; i++) { const z = 10 + rng() * 70, [x, y] = pr((rng() - 0.5) * 18, 0.4, z); s += K.pool(o, x, y, F * (5 + rng() * 6) / z, F * 0.7 / z, '#33443c', 0.35, 'fp'); }

      /* the dark settles over all of it */
      s += K.band(o, 540, 360, '#05070c', 0, 0.55, 'dark') + K.rect(0, 0, 1600, 900, '#05080a', { opacity: 0.22 });
      s += K.glow(o, 600, 333, 40, P.lantern, 0.6, 'hilllant') + K.circle(600, 333, 1.8, '#e8ffd9');

      /* the one TV left on, a figure standing behind the curtain */
      const tq = [[12.3, 1.0, tvZ], [14.1, 1.0, tvZ], [14.1, 2.8, tvZ], [12.3, 2.8, tvZ]].map((p) => pr(p[0], p[1], p[2]));
      const [wx0, wy1] = tq[0], [wx1, wy0] = tq[2], ww = wx1 - wx0, wh = wy1 - wy0;
      s += K.glow(o, (wx0 + wx1) / 2, (wy0 + wy1) / 2, 120, '#5f80c8', 0.22, 'tvg');
      s += K.pool(o, (wx0 + wx1) / 2 - 10, pr(13, 0, tvZ - 2)[1], 110, 14, '#5f80c8', 0.2, 'tvp');
      s += K.rect(wx0 - 4, wy0 - 4, ww + 8, wh + 8, '#1a1e22');
      const tvg = o.id('tv');
      s += K.defs(K.radial(tvg, [[0, '#a8c4f0'], [0.6, '#6a8cd0'], [1, '#3a5290']], 0.45, 0.6, 0.7, false)) + K.rect(wx0, wy0, ww, wh, `url(#${tvg})`);
      let folds = '';
      for (let i = 1; i < 7; i++) folds += `M${n(wx0 + ww * i / 7)},${n(wy0)}V${n(wy1)}`;
      s += stroke(folds, '#2a3a6a', 2, { opacity: 0.35 });
      s += K.path(personD(wx0 + ww * 0.42, wy1 + wh * 0.9, wh * 1.5), '#0a0e18', { opacity: 0.85 });
      s += K.rect(wx0 - 4, wy0 - 6, ww + 8, 6, '#1e2226') + K.rect(wx0 + ww / 2 - 1.5, wy0, 3, wh, '#1a1e22', { opacity: 0.5 });
      return s;
    }
  });
})();
