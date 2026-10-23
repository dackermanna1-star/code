/* What Derry Keeps — art kit.
 * Shared palette, time-of-day lighting, seeded randomness and SVG helpers.
 * Every background, CG and portrait is drawn with these so the whole game
 * shares one light, one palette and one hand. See docs/ART_DIRECTION.md. */
(function () {
  'use strict';
  const KIT = {};
  const ART = { bgs: {}, cgs: {}, chars: {} };
  ART.bg = (id, def) => { ART.bgs[id] = def; };
  ART.cg = (id, def) => { ART.cgs[id] = def; };
  ART.char = (id, def) => { ART.chars[id] = def; };

  /* ---------- randomness ---------- */
  KIT.hash = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  KIT.rng = (seed) => {
    let a = typeof seed === 'string' ? KIT.hash(seed) : (seed >>> 0);
    const r = () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (lo, hi) => lo + (hi - lo) * r();
    r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    return r;
  };

  /* ---------- color ---------- */
  const clamp = (v, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, v));
  KIT.clamp = clamp;
  KIT.rgb = (hex) => {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  KIT.hex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(Math.round(v)).toString(16).padStart(2, '0')).join('');
  KIT.mix = (a, b, t) => {
    const A = KIT.rgb(a), B = KIT.rgb(b);
    return KIT.hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  };
  KIT.mul = (hex, m) => { const c = KIT.rgb(hex); return KIT.hex(c[0] * m[0], c[1] * m[1], c[2] * m[2]); };
  KIT.rgba = (hex, a) => { const c = KIT.rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  KIT.lum = (hex) => { const c = KIT.rgb(hex); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; };
  KIT.desat = (hex, t) => { const c = KIT.rgb(hex); const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; return KIT.hex(c[0] + (l - c[0]) * t, c[1] + (l - c[1]) * t, c[2] + (l - c[2]) * t); };

  KIT.PAL = {
    ink: '#141824', navy: '#1f2a3d', slate: '#3b4a63', fog: '#8a9bb0',
    bone: '#ece3cf', paper: '#d9ccb0', rust: '#b5532e', ember: '#e08a3c',
    mustard: '#d9a441', pine: '#2f4a3a', moss: '#6b7a45', birch: '#c9c2b0',
    brick: '#8c3b2e', bruise: '#5b4a6b', rose: '#c98a8a', sodium: '#f2b45a',
    window: '#ffd38a', teal: '#2e8b8b', lantern: '#a6e08e'
  };

  /* ---------- time of day ----------
   * sky: gradient stops top->horizon. mul/addC/addT: how a base color is
   * relit for this time (multiply, then mix toward addC by addT).
   * shadowMul: extra multiply for shadow faces. lit/street: windows and
   * streetlights on. light: sprite tint preset name. */
  KIT.TOD = {
    morning:   { sky: [[0, '#9fbad0'], [0.6, '#d9d6c6'], [1, '#f3e2c0']], mul: [1.0, 0.98, 0.95], addC: '#f3e2c0', addT: 0.06, shadowMul: [0.72, 0.76, 0.86], lit: false, street: false, haze: '#e8dcc4', light: 'morning' },
    day:       { sky: [[0, '#aebfcb'], [1, '#e2ded1']], mul: [0.97, 0.97, 0.97], addC: '#c8cfd4', addT: 0.10, shadowMul: [0.74, 0.77, 0.84], lit: false, street: false, haze: '#d6d8d3', light: 'day' },
    afternoon: { sky: [[0, '#b7a48f'], [0.55, '#e8b878'], [1, '#f2c785']], mul: [1.05, 0.94, 0.80], addC: '#f0b56a', addT: 0.08, shadowMul: [0.62, 0.60, 0.74], lit: false, street: false, haze: '#efc58c', light: 'afternoon' },
    dusk:      { sky: [[0, '#28344f'], [0.45, '#7a5576'], [0.8, '#d27f5f'], [1, '#e9a066']], mul: [0.70, 0.60, 0.68], addC: '#7a5576', addT: 0.12, shadowMul: [0.62, 0.62, 0.78], lit: true, street: true, haze: '#9a6a7a', light: 'dusk' },
    night:     { sky: [[0, '#0b1120'], [0.7, '#17223a'], [1, '#22304c']], mul: [0.30, 0.34, 0.46], addC: '#1f2a44', addT: 0.18, shadowMul: [0.62, 0.66, 0.80], lit: true, street: true, haze: '#22304a', light: 'night' },
    quiet:     { sky: [[0, '#05070c'], [0.75, '#0c111c'], [1, '#121826']], mul: [0.17, 0.20, 0.22], addC: '#0b1018', addT: 0.30, shadowMul: [0.6, 0.66, 0.66], lit: false, street: false, haze: '#0f1520', light: 'quiet' },
    rain:      { sky: [[0, '#4f5b6e'], [1, '#8a95a3']], mul: [0.72, 0.76, 0.84], addC: '#7a8696', addT: 0.22, shadowMul: [0.72, 0.76, 0.84], lit: true, street: true, haze: '#7d8999', light: 'rain', desat: 0.3 },
    /* interiors */
    evening:   { sky: [[0, '#1b2236'], [1, '#2c3550']], mul: [0.95, 0.80, 0.64], addC: '#3a2a20', addT: 0.10, shadowMul: [0.55, 0.52, 0.60], lit: true, street: true, haze: '#3a2e28', light: 'interior_lamp' },
    dim:       { sky: [[0, '#0b1120'], [1, '#17223a']], mul: [0.42, 0.40, 0.42], addC: '#1a1714', addT: 0.20, shadowMul: [0.55, 0.55, 0.62], lit: false, street: true, haze: '#1d1a18', light: 'dim' },
    fluorescent: { sky: [[0, '#aebfcb'], [1, '#e2ded1']], mul: [0.95, 0.99, 0.95], addC: '#dfe8dc', addT: 0.10, shadowMul: [0.76, 0.80, 0.82], lit: false, street: false, haze: '#dfe6dc', light: 'fluorescent' },
    flashlight: { sky: [[0, '#05070c'], [1, '#0c111c']], mul: [0.14, 0.15, 0.18], addC: '#07090f', addT: 0.25, shadowMul: [0.6, 0.6, 0.66], lit: false, street: false, haze: '#0a0d14', light: 'quiet' }
  };
  KIT.TOD.lanterns = KIT.TOD.night;
  KIT.TOD.festival = KIT.TOD.dusk;
  KIT.TOD.empty_night = KIT.TOD.dim;

  /* Sprite tints (r,g,b multipliers + optional saturation). */
  KIT.LIGHT = {
    morning: { r: 1.0, g: 0.98, b: 0.94, s: 1.0 },
    day: { r: 0.97, g: 0.97, b: 0.97, s: 0.95 },
    afternoon: { r: 1.03, g: 0.94, b: 0.84, s: 1.0 },
    dusk: { r: 0.92, g: 0.80, b: 0.80, s: 0.9 },
    night: { r: 0.62, g: 0.68, b: 0.86, s: 0.8 },
    quiet: { r: 0.50, g: 0.72, b: 0.58, s: 0.6 },
    rain: { r: 0.78, g: 0.82, b: 0.90, s: 0.75 },
    interior_lamp: { r: 1.0, g: 0.90, b: 0.78, s: 0.95 },
    fluorescent: { r: 0.94, g: 0.98, b: 0.94, s: 0.9 },
    dim: { r: 0.62, g: 0.60, b: 0.62, s: 0.75 }
  };

  /* Relight a base color for a time of day. */
  KIT.tone = (hex, time) => {
    const t = KIT.TOD[time] || KIT.TOD.day;
    let c = KIT.mul(hex, t.mul);
    if (t.desat) c = KIT.desat(c, t.desat);
    return KIT.mix(c, t.addC, t.addT);
  };
  /* The shadow face of a base color under a time of day. */
  KIT.shade = (hex, time) => {
    const t = KIT.TOD[time] || KIT.TOD.day;
    return KIT.mul(KIT.tone(hex, time), t.shadowMul);
  };
  /* Lighten or darken a color toward bone/ink by amt (-1..1). */
  KIT.adj = (hex, amt) => amt >= 0 ? KIT.mix(hex, '#fff6e6', amt) : KIT.mix(hex, '#0d1018', -amt);

  /* ---------- SVG primitives ---------- */
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  KIT.esc = esc;
  const attrs = (o) => {
    if (!o) return '';
    let s = '';
    for (const k in o) {
      const v = o[k];
      if (v === undefined || v === null || v === false) continue;
      const name = k === 'cls' ? 'class' : k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
      s += ` ${name}="${typeof v === 'number' ? +v.toFixed(2) : esc(v)}"`;
    }
    return s;
  };
  KIT.attrs = attrs;
  const n = (v) => +(+v).toFixed(1);
  KIT.n = n;
  KIT.el = (tag, o, inner) => inner === undefined ? `<${tag}${attrs(o)}/>` : `<${tag}${attrs(o)}>${inner}</${tag}>`;
  KIT.g = (o, inner) => `<g${attrs(o)}>${Array.isArray(inner) ? inner.join('') : inner}</g>`;
  KIT.rect = (x, y, w, h, fill, o) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${attrs(o)}/>`;
  KIT.circle = (cx, cy, r, fill, o) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}"${attrs(o)}/>`;
  KIT.ellipse = (cx, cy, rx, ry, fill, o) => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}"${attrs(o)}/>`;
  KIT.pts = (p) => (Array.isArray(p[0]) ? p.map((q) => n(q[0]) + ',' + n(q[1])) : p.reduce((a, v, i) => (i % 2 ? a[a.length - 1] += ',' + n(v) : a.push('' + n(v)), a), [])).join(' ');
  KIT.poly = (p, fill, o) => `<polygon points="${KIT.pts(p)}" fill="${fill}"${attrs(o)}/>`;
  KIT.path = (d, fill, o) => `<path d="${d}" fill="${fill}"${attrs(o)}/>`;
  KIT.line = (x1, y1, x2, y2, stroke, w, o) => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${stroke}" stroke-width="${w || 1}"${attrs(o)}/>`;
  KIT.text = (x, y, str, o) => `<text x="${n(x)}" y="${n(y)}"${attrs(o)}>${esc(str)}</text>`;

  /* Gradients. stops: [[offset, color, opacity?], ...] */
  const stopsXml = (stops) => stops.map((s) => `<stop offset="${s[0]}" stop-color="${s[1]}"${s[2] !== undefined ? ` stop-opacity="${s[2]}"` : ''}/>`).join('');
  KIT.linear = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1, user) =>
    `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${user ? ' gradientUnits="userSpaceOnUse"' : ''}>${stopsXml(stops)}</linearGradient>`;
  KIT.radial = (id, stops, cx, cy, r, user = true) =>
    `<radialGradient id="${id}" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"${user ? ' gradientUnits="userSpaceOnUse"' : ''}>${stopsXml(stops)}</radialGradient>`;
  KIT.defs = (...xs) => `<defs>${xs.join('')}</defs>`;

  /* Unique per-call id for helper-made defs (o.id alone repeats for the same name). */
  KIT.uid = (o, name) => o.id(name + '_' + (o._uid = (o._uid || 0) + 1));

  /* Full-canvas sky gradient for a time of day. */
  KIT.sky = (o, time, h = 900) => {
    const t = KIT.TOD[time] || KIT.TOD.day;
    const id = KIT.uid(o, 'sky');
    return KIT.defs(KIT.linear(id, t.sky)) + KIT.rect(0, 0, 1600, h, `url(#${id})`);
  };

  /* Soft radial glow: a light source's halo. */
  KIT.glow = (o, cx, cy, r, color, opacity = 0.6, name = 'glow') => {
    const id = KIT.uid(o, name);
    return KIT.defs(KIT.radial(id, [[0, color, opacity], [0.35, color, opacity * 0.45], [1, color, 0]], cx, cy, r)) +
      KIT.circle(cx, cy, r, `url(#${id})`);
  };
  /* Elliptical glow (floor pools, light on walls). */
  KIT.pool = (o, cx, cy, rx, ry, color, opacity = 0.4, name = 'pool') => {
    const id = KIT.uid(o, name);
    return KIT.defs(KIT.radial(id, [[0, color, opacity], [0.6, color, opacity * 0.35], [1, color, 0]], 0.5, 0.5, 0.5, false)) +
      KIT.ellipse(cx, cy, rx, ry, `url(#${id})`);
  };
  /* Light shaft: polygon fading from source edge (first two points) outward. */
  KIT.shaft = (o, p, color, opacity = 0.18, name = 'shaft', dir = [0, 0, 0, 1]) => {
    const id = KIT.uid(o, name);
    return KIT.defs(KIT.linear(id, [[0, color, opacity], [1, color, 0]], dir[0], dir[1], dir[2], dir[3])) + KIT.poly(p, `url(#${id})`);
  };
  /* Vertical fade band (fog, haze, darkness pooling at the floor). */
  KIT.band = (o, y, h, color, top = 0, bottom = 0.6, name = 'band') => {
    const id = KIT.uid(o, name);
    return KIT.defs(KIT.linear(id, [[0, color, top], [1, color, bottom]])) + KIT.rect(-10, y, 1620, h, `url(#${id})`);
  };

  /* ---------- nature ---------- */
  /* Hill / treeline silhouette across the canvas, closed to `bottom`. */
  KIT.ridge = (rng, { x0 = -20, x1 = 1620, y = 500, amp = 40, steps = 28, jag = 0.35, bottom = 920, freq = 1 } = {}) => {
    const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = x0 + (x1 - x0) * t;
      const v = Math.sin(t * 3.1 * freq + ph[0]) * 0.55 + Math.sin(t * 7.3 * freq + ph[1]) * 0.3 + Math.sin(t * 17 * freq + ph[2]) * 0.15;
      pts.push([x, y - v * amp + (rng() - 0.5) * amp * jag]);
    }
    let d = `M${n(x0)},${bottom} L${n(pts[0][0])},${n(pts[0][1])}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      d += ` Q${n(p[0])},${n(p[1])} ${n((p[0] + q[0]) / 2)},${n((p[1] + q[1]) / 2)}`;
    }
    d += ` L${n(x1)},${n(pts[pts.length - 1][1])} L${n(x1)},${bottom} Z`;
    return d;
  };

  /* A tiered pine, lit on the left. */
  KIT.pine = (x, base, h, w, fill, shade, rng) => {
    const tiers = h > 120 ? 5 : h > 60 ? 4 : 3;
    let lit = '', dark = '';
    for (let i = 0; i < tiers; i++) {
      const t0 = i / tiers, t1 = (i + 1.25) / tiers;
      const top = base - h * (1 - t0 * 0.92) ;
      const bot = Math.min(base, base - h * (1 - t1) + h * 0.06);
      const ww = w * (0.28 + 0.72 * ((i + 1) / tiers)) * (rng ? 0.88 + rng() * 0.24 : 1);
      const skew = rng ? (rng() - 0.5) * ww * 0.18 : 0;
      lit += `M${n(x)},${n(top)} L${n(x - ww / 2 + skew)},${n(bot)} L${n(x + skew * 0.3)},${n(bot - h * 0.02)} Z `;
      dark += `M${n(x)},${n(top)} L${n(x + skew * 0.3)},${n(bot - h * 0.02)} L${n(x + ww / 2 + skew)},${n(bot)} Z `;
    }
    return `<path d="${lit}" fill="${fill}"/><path d="${dark}" fill="${shade || fill}"/>` +
      KIT.rect(x - w * 0.035, base - h * 0.06, w * 0.07, h * 0.08, shade || fill);
  };
  KIT.pines = (rng, { x0 = 0, x1 = 1600, base = 600, hMin = 60, hMax = 140, gap = 26, fill = '#2f4a3a', shade, jitterY = 10 } = {}) => {
    let s = '';
    for (let x = x0 + rng() * gap; x < x1; x += gap * (0.55 + rng() * 0.9)) {
      const h = hMin + (hMax - hMin) * rng();
      s += KIT.pine(x, base + (rng() - 0.3) * jitterY, h, h * (0.38 + rng() * 0.14), fill, shade, rng);
    }
    return s;
  };

  /* Organic closed blob: a noisy ellipse with scalloped edge. Returns path d. */
  KIT.blob = (rng, cx, cy, rx, ry, { lobes = 9, jag = 0.18, scallop = 0.08 } = {}) => {
    const N = lobes * 6, ph = rng() * 6.28, ph2 = rng() * 6.28;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const lobe = Math.abs(Math.sin((a * lobes) / 2 + ph));
      const k = 1 + jag * Math.sin(a * 3 + ph2) * 0.6 + scallop * lobe + (rng() - 0.5) * jag * 0.35;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    let d = `M${n((pts[0][0] + pts[N - 1][0]) / 2)},${n((pts[0][1] + pts[N - 1][1]) / 2)}`;
    for (let i = 0; i < N; i++) {
      const p = pts[i], q = pts[(i + 1) % N];
      d += ` Q${n(p[0])},${n(p[1])} ${n((p[0] + q[0]) / 2)},${n((p[1] + q[1]) / 2)}`;
    }
    return d + ' Z';
  };

  /* Deciduous tree: forked trunk + organic canopy masses, lit upper-left.
   * colors = [lit, shadow, highlight]. bare 0..1 thins the canopy. */
  KIT.tree = (rng, { x, base, h = 260, w = 200, colors = ['#b5532e', '#7e3a24', '#e08a3c'], trunk = '#3a2c26', bare = 0 } = {}) => {
    const cy = base - h * 0.64;
    let s = '';
    const tw = Math.max(6, w * 0.055);
    s += KIT.path(`M${n(x - tw)},${n(base)} C${n(x - tw * 0.7)},${n(base - h * 0.2)} ${n(x - tw * 0.6)},${n(cy + h * 0.15)} ${n(x - w * 0.2)},${n(cy - h * 0.1)} L${n(x - w * 0.16)},${n(cy - h * 0.13)} C${n(x - tw)},${n(cy + h * 0.02)} ${n(x)},${n(cy)} ${n(x + w * 0.04)},${n(cy - h * 0.2)} L${n(x + w * 0.08)},${n(cy - h * 0.19)} C${n(x + tw * 0.6)},${n(cy + h * 0.02)} ${n(x + w * 0.12)},${n(cy - h * 0.02)} ${n(x + w * 0.22)},${n(cy - h * 0.08)} L${n(x + w * 0.23)},${n(cy - h * 0.05)} C${n(x + tw)},${n(cy + h * 0.12)} ${n(x + tw * 0.6)},${n(base - h * 0.2)} ${n(x + tw)},${n(base)} Z`, trunk);
    if (bare >= 1) return s;
    const k = 1 - bare * 0.45;
    // shadow mass (whole canopy), then lit mass offset up-left, then highlight clusters
    s += KIT.path(KIT.blob(rng, x, cy, w * 0.5 * k, h * 0.34 * k, { lobes: 8, jag: 0.22, scallop: 0.12 }), colors[1]);
    s += KIT.path(KIT.blob(rng, x - w * 0.08, cy - h * 0.06, w * 0.38 * k, h * 0.25 * k, { lobes: 7, jag: 0.25, scallop: 0.14 }), colors[0]);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * (1.0 + rng() * 0.7), rr = 0.3 + rng() * 0.5;
      s += KIT.path(KIT.blob(rng, x - w * 0.05 + Math.cos(a) * w * 0.3 * rr, cy - h * 0.06 + Math.sin(a) * h * 0.2 * rr, w * (0.07 + rng() * 0.07) * k, h * (0.05 + rng() * 0.04) * k, { lobes: 5, jag: 0.2 }), colors[2], { opacity: 0.8 });
    }
    // a few shadow pockets inside the lit mass give it depth
    for (let i = 0; i < 3; i++) s += KIT.path(KIT.blob(rng, x + (rng() - 0.3) * w * 0.4, cy + rng() * h * 0.12, w * 0.07 * k, h * 0.04 * k, { lobes: 5, jag: 0.2 }), colors[1], { opacity: 0.7 });
    // stray leaves at the edge
    for (let i = 0; i < 18; i++) {
      const a = rng() * Math.PI * 2, lx = x + Math.cos(a) * w * 0.52 * k, ly = cy + Math.sin(a) * h * 0.35 * k;
      s += KIT.ellipse(lx, ly, 5 + rng() * 4, 3, rng() < 0.5 ? colors[0] : colors[1], { transform: `rotate(${n(rng() * 180)} ${n(lx)} ${n(ly)})` });
    }
    return s;
  };

  /* Scattered fallen leaves. */
  KIT.leaves = (rng, { count = 60, x0 = 0, x1 = 1600, y0 = 760, y1 = 900, colors = ['#b5532e', '#e08a3c', '#d9a441', '#7e3a24'], size = 7, opacity = 1 } = {}) => {
    let s = '';
    for (let i = 0; i < count; i++) {
      const x = x0 + (x1 - x0) * rng(), y = y0 + (y1 - y0) * rng();
      const sz = size * (0.6 + rng() * 0.8) * (0.6 + 0.4 * (y - y0) / Math.max(1, y1 - y0));
      s += KIT.ellipse(x, y, sz, sz * 0.45, rng.pick(colors), { transform: `rotate(${n(rng() * 180)} ${n(x)} ${n(y)})`, opacity });
    }
    return s;
  };
  KIT.stars = (rng, { count = 80, x0 = 0, x1 = 1600, y0 = 0, y1 = 400, color = '#dfe6f5' } = {}) => {
    let s = '';
    for (let i = 0; i < count; i++) s += KIT.circle(x0 + (x1 - x0) * rng(), y0 + (y1 - y0) * rng() ** 1.4, 0.6 + rng() * 1.3, color, { opacity: n(0.25 + rng() * 0.6) });
    return s;
  };
  /* Long, soft autumn cloud banks: lumpy tops, flat-ish undersides,
   * a lit upper layer over a shadowed lower one. */
  KIT.clouds = (rng, { count = 5, y0 = 60, y1 = 300, color = '#ffffff', shadow = null, opacity = 0.35, w = 380 } = {}) => {
    let s = '';
    const sh = shadow || KIT.mix(color, '#55607a', 0.35);
    for (let i = 0; i < count; i++) {
      const cx = rng() * 1800 - 100, cy = y0 + (y1 - y0) * rng(), ww = w * (0.7 + rng() * 0.9), hh = ww * (0.06 + rng() * 0.04);
      const build = (yo, scale) => {
        const N = 14 + Math.floor(rng() * 8);
        let d = `M${n(cx - ww / 2)},${n(cy + yo)}`;
        for (let j = 0; j <= N; j++) {
          const t = j / N, x = cx - ww / 2 + ww * t;
          const env = Math.sin(t * Math.PI) ** 0.7;
          const y = cy + yo - hh * scale * env * (1.2 + 0.8 * Math.abs(Math.sin(j * 1.7 + i))) - rng() * hh * 0.4 * env;
          d += ` Q${n(x - ww / N / 2)},${n(y - hh * 0.5 * env)} ${n(x)},${n(y)}`;
        }
        d += ` Q${n(cx + ww * 0.3)},${n(cy + yo + hh * 0.35)} ${n(cx)},${n(cy + yo + hh * 0.25)} Q${n(cx - ww * 0.3)},${n(cy + yo + hh * 0.35)} ${n(cx - ww / 2)},${n(cy + yo)} Z`;
        return d;
      };
      s += KIT.path(build(hh * 0.5, 0.9), sh, { opacity: opacity * 0.9 });
      s += KIT.path(build(0, 1.15), color, { opacity });
    }
    return s;
  };

  /* ---------- built world ---------- */
  /* Window: frame, glass (lit or dark), mullions, optional curtains. */
  KIT.window = (o, x, y, w, h, { lit = false, frame = '#e9e1cf', glass = '#2a3550', litColor = '#ffd38a', mullions = 'cross', curtain = null, sill = true, glowR = 0, frameW = 6, blind = false } = {}) => {
    let s = '';
    if (lit && glowR) s += KIT.glow(o, x + w / 2, y + h / 2, glowR, litColor, 0.35, 'wglow');
    s += KIT.rect(x - frameW, y - frameW, w + frameW * 2, h + frameW * 2, frame);
    if (lit) {
      const gid = KIT.uid(o, 'wlit');
      s += KIT.defs(KIT.linear(gid, [[0, KIT.mix(litColor, '#fff4d8', 0.35)], [1, litColor]])) + KIT.rect(x, y, w, h, `url(#${gid})`);
    } else {
      const gid = KIT.uid(o, 'wdark');
      s += KIT.defs(KIT.linear(gid, [[0, KIT.mix(glass, '#9fb4cf', 0.18)], [0.5, glass], [1, KIT.mix(glass, '#000', 0.25)]], 0, 0, 1, 1)) + KIT.rect(x, y, w, h, `url(#${gid})`);
      s += KIT.poly([[x + w * 0.15, y], [x + w * 0.42, y], [x + w * 0.12, y + h], [x, y + h], [x, y + h * 0.7]], '#ffffff', { opacity: 0.06 });
    }
    if (blind) for (let i = 1; i < 9; i++) s += KIT.rect(x, y + (h * i) / 9, w, 1.5, KIT.mix(frame, '#000', 0.2), { opacity: 0.5 });
    if (curtain) {
      s += KIT.path(`M${n(x)},${n(y)} h${n(w * 0.26)} q${n(-w * 0.06)},${n(h * 0.5)} ${n(w * 0.02)},${n(h)} h${n(-w * 0.28)} Z`, curtain);
      s += KIT.path(`M${n(x + w)},${n(y)} h${n(-w * 0.26)} q${n(w * 0.06)},${n(h * 0.5)} ${n(-w * 0.02)},${n(h)} h${n(w * 0.28)} Z`, KIT.mix(curtain, '#000', 0.18));
    }
    const mw = Math.max(2.5, frameW * 0.6);
    if (mullions === 'cross') { s += KIT.rect(x + w / 2 - mw / 2, y, mw, h, frame) + KIT.rect(x, y + h / 2 - mw / 2, w, mw, frame); }
    else if (mullions === 'grid') { for (let i = 1; i < 3; i++) s += KIT.rect(x + (w * i) / 3 - mw / 2, y, mw, h, frame); s += KIT.rect(x, y + h / 2 - mw / 2, w, mw, frame); }
    else if (mullions === 'sash') { s += KIT.rect(x, y + h / 2 - mw / 2, w, mw * 1.4, frame); }
    if (sill) s += KIT.rect(x - frameW * 2, y + h + frameW, w + frameW * 4, frameW * 1.3, KIT.mix(frame, '#000', 0.15));
    return s;
  };

  /* Horizontal clapboard lines over a wall area. */
  KIT.clapboard = (x, y, w, h, line, spacing = 14, opacity = 0.35) => {
    let s = '';
    for (let yy = y + spacing; yy < y + h; yy += spacing) s += KIT.rect(x, yy, w, 1.6, line, { opacity });
    return s;
  };
  /* Brick courses (subtle). */
  KIT.bricks = (rng, x, y, w, h, base, mortar, { bw = 34, bh = 12, vary = 0.06, opacity = 1 } = {}) => {
    let s = KIT.rect(x, y, w, h, mortar);
    let row = 0;
    for (let yy = y; yy < y + h; yy += bh, row++) {
      for (let xx = x - (row % 2 ? bw / 2 : 0); xx < x + w; xx += bw) {
        const x0 = Math.max(x, xx + 1), x1 = Math.min(x + w, xx + bw - 1);
        if (x1 <= x0) continue;
        s += KIT.rect(x0, yy + 1, x1 - x0, Math.min(bh - 2, y + h - yy - 1), KIT.adj(base, (rng() - 0.5) * vary * 2), { opacity });
      }
    }
    return s;
  };
  /* Sagging wire between two points. */
  KIT.wire = (x1, y1, x2, y2, sag = 30, stroke = '#141824', w = 1.6, o2) =>
    `<path d="M${n(x1)},${n(y1)} Q${n((x1 + x2) / 2)},${n((y1 + y2) / 2 + sag)} ${n(x2)},${n(y2)}" fill="none" stroke="${stroke}" stroke-width="${w}"${attrs(o2)}/>`;
  /* Telephone pole with crossbar; returns {svg, top:[x,y] pairs for wires}. */
  KIT.pole = (x, base, h, color = '#2a2420', w = 10) => {
    const top = base - h;
    const svg = KIT.rect(x - w / 2, top, w, h, color) + KIT.rect(x - w * 4, top + h * 0.06, w * 8, w * 0.7, color) +
      KIT.rect(x - w * 3.2, top + h * 0.14, w * 6.4, w * 0.55, color);
    return { svg, wires: [[x - w * 3.5, top + h * 0.06], [x + w * 3.5, top + h * 0.06], [x - w * 2.8, top + h * 0.14], [x + w * 2.8, top + h * 0.14]] };
  };
  /* Streetlight (cobra-head) with optional glow + ground pool. */
  KIT.streetlight = (o, x, base, h, { on = false, color = '#2a2a2e', light = '#f2b45a', flip = false, poolY = null } = {}) => {
    const top = base - h, dir = flip ? -1 : 1;
    let s = KIT.rect(x - 4, top, 8, h, color);
    s += `<path d="M${n(x)},${n(top + 6)} q${n(dir * 30)},-26 ${n(dir * 86)},-14" fill="none" stroke="${color}" stroke-width="6"/>`;
    const hx = x + dir * 86, hy = top - 8;
    s += KIT.ellipse(hx, hy, 20, 7, color);
    if (on) {
      s += KIT.ellipse(hx, hy + 4, 14, 3.5, KIT.mix(light, '#fff', 0.5));
      s += KIT.shaft(o, [[hx - 12, hy + 5], [hx + 12, hy + 5], [hx + 120, poolY || base], [hx - 120, poolY || base]], light, 0.16, 'sl');
      s += KIT.glow(o, hx, hy + 6, 70, light, 0.55, 'slg');
      s += KIT.pool(o, hx, poolY || base, 170, 34, light, 0.35, 'slp');
    }
    return s;
  };

  /* ---------- interiors ----------
   * One-point-perspective room. Back wall from (bx0,by0) to (bx1,by1).
   * Returns helpers to map points on each surface. u = depth (0 front
   * edge of canvas, 1 back wall), v = 0 top..1 bottom. */
  KIT.room = ({ bx0 = 420, by0 = 160, bx1 = 1180, by1 = 640, W = 1600, H = 900 } = {}) => {
    const R = { bx0, by0, bx1, by1, W, H };
    R.back = [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]];
    R.left = [[0, 0], [bx0, by0], [bx0, by1], [0, H]];
    R.right = [[W, 0], [bx1, by0], [bx1, by1], [W, H]];
    R.ceil = [[0, 0], [W, 0], [bx1, by0], [bx0, by0]];
    R.floor = [[0, H], [bx0, by1], [bx1, by1], [W, H]];
    /* point on left wall */
    R.L = (u, v) => { const x = u * bx0, top = u * by0, bot = H + u * (by1 - H); return [x, top + v * (bot - top)]; };
    R.Rt = (u, v) => { const x = W - u * (W - bx1), top = u * by0, bot = H + u * (by1 - H); return [x, top + v * (bot - top)]; };
    /* point on floor: s = 0 left .. 1 right across, u depth */
    R.F = (s, u) => { const y = H + u * (by1 - H); const xl = u * bx0, xr = W - u * (W - bx1); return [xl + s * (xr - xl), y]; };
    R.C = (s, u) => { const y = u * by0; const xl = u * bx0, xr = W - u * (W - bx1); return [xl + s * (xr - xl), y]; };
    /* quad on a surface from (u0,v0) to (u1,v1) */
    R.quadL = (u0, u1, v0, v1) => [R.L(u0, v0), R.L(u1, v0), R.L(u1, v1), R.L(u0, v1)];
    R.quadR = (u0, u1, v0, v1) => [R.Rt(u0, v0), R.Rt(u1, v0), R.Rt(u1, v1), R.Rt(u0, v1)];
    R.quadF = (s0, s1, u0, u1) => [R.F(s0, u0), R.F(s1, u0), R.F(s1, u1), R.F(s0, u1)];
    /* vanishing point: where the floor's side edges meet */
    const tvp = W / (W - (bx1 - bx0));
    R.vp = [tvp * bx0, H + tvp * (by1 - H)];
    /* floorboards converging to the vanishing point, clipped to the floor */
    R.boards = (o, count, color, opacity = 0.35, w = 1.5) => {
      const [vx, vy] = R.vp;
      const id = KIT.uid(o, 'fclip');
      let s = `<clipPath id="${id}"><polygon points="${KIT.pts(R.floor)}"/></clipPath><g clip-path="url(#${id})">`;
      for (let i = 0; i <= count; i++) s += KIT.line(vx, vy, -W * 1.5 + W * 4 * (i / count), H, color, w, { opacity });
      return s + '</g>';
    };
    /* clip any markup to a surface polygon */
    R.clip = (o, poly, inner) => {
      const id = KIT.uid(o, 'sclip');
      return `<clipPath id="${id}"><polygon points="${KIT.pts(poly)}"/></clipPath><g clip-path="url(#${id})">${inner}</g>`;
    };
    return R;
  };

  /* Vignette rectangle (used in CGs; the engine also adds a global one). */
  KIT.vignette = (o, strength = 0.55, color = '#05070c') => {
    const id = KIT.uid(o, 'vig');
    return KIT.defs(KIT.radial(id, [[0.55, color, 0], [1, color, strength]], 0.5, 0.5, 0.75, false)) + KIT.rect(0, 0, 1600, 900, `url(#${id})`);
  };

  /* Render helper used by the engine and the gallery. */
  let renderCount = 0;
  KIT.renderBg = (id, time, variant) => {
    const def = ART.bgs[id] || ART.cgs[id];
    if (!def) return null;
    const t = time && (!def.times || def.times.includes(time)) ? time : (def.times ? def.times[0] : time);
    const prefix = `r${++renderCount}${id.replace(/[^a-z0-9]/gi, '')}`;
    const o = { time: t, variant, W: 1600, H: 900, id: (s) => `${prefix}_${s}`, rng: KIT.rng(id + ':' + (variant || '')) };
    let inner = '';
    try { inner = def.draw(o); } catch (e) { console.error('art error', id, e); inner = KIT.rect(0, 0, 1600, 900, '#141824'); }
    const lightName = (def.light && def.light[t]) || (KIT.TOD[t] && KIT.TOD[t].light) || 'day';
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">${inner}</svg>`, time: t, light: KIT.LIGHT[lightName] || KIT.LIGHT.day, lightName };
  };
  KIT.renderChar = (id, expr, outfit) => {
    const def = ART.chars[id];
    if (!def) return null;
    const prefix = `c${++renderCount}${id}`;
    const o = { expr: expr || 'neutral', outfit: outfit || 'default', id: (s) => `${prefix}_${s}`, rng: KIT.rng('char:' + id) };
    let inner = '';
    try { inner = def.draw(o); } catch (e) { console.error('char error', id, e); }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" preserveAspectRatio="xMidYMax meet">${inner}</svg>`;
  };

  window.KIT = KIT;
  window.ART = ART;
})();

/* ---------- interior extras (appended) ---------- */
(function () {
  const KIT = window.KIT, n = KIT.n;
  /* Perspective checker floor for a KIT.room. colors=[a,b]. cols across, depth rows by world spacing. */
  KIT.checkerFloor = (o, R, { cols = 12, rowDepth = 0.18, colors = ['#d9ccb0', '#8c3b2e'], opacity = 1 } = {}) => {
    const [vx, vy] = R.vp, H = R.H;
    const zBack = (H - vy) / (R.by1 - vy);
    const ys = [];
    for (let z = 1; z < zBack; z += rowDepth * z) ys.push(vy + (H - vy) / z);
    ys.push(R.by1);
    const uAt = (y) => (H - y) / (H - R.by1);
    let s = '';
    const span = 3; // extend columns beyond the visible floor so the side edges are covered
    for (let r = 0; r < ys.length - 1; r++) {
      const u0 = uAt(ys[r]), u1 = uAt(ys[r + 1]);
      for (let c = -cols * span; c < cols * (span + 1); c++) {
        const s0 = c / cols, s1 = (c + 1) / cols;
        const q = [R.F(s0, u0), R.F(s1, u0), R.F(s1, u1), R.F(s0, u1)];
        if (q[1][0] < -50 || q[0][0] > R.W + 50) continue;
        s += KIT.poly(q, colors[(r + c + 1000) % 2]);
      }
    }
    return R.clip(o, R.floor, `<g opacity="${opacity}">${s}</g>`);
  };
  /* Small repeating wallpaper motif over a polygon. */
  KIT.wallpaper = (o, R, poly, { color = '#b89a5a', size = 26, opacity = 0.35, motif = 'dot' } = {}) => {
    const id = KIT.uid(o, 'wp');
    let shape;
    if (motif === 'dot') shape = `<circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.09}" fill="${color}"/><circle cx="0" cy="0" r="${size * 0.06}" fill="${color}"/><circle cx="${size}" cy="${size}" r="${size * 0.06}" fill="${color}"/><circle cx="${size}" cy="0" r="${size * 0.06}" fill="${color}"/><circle cx="0" cy="${size}" r="${size * 0.06}" fill="${color}"/>`;
    else if (motif === 'stripe') shape = `<rect x="0" y="0" width="${size * 0.18}" height="${size}" fill="${color}"/>`;
    else if (motif === 'daisy') shape = [0, 72, 144, 216, 288].map((a) => `<ellipse cx="${size / 2}" cy="${size / 2 - size * 0.14}" rx="${size * 0.06}" ry="${size * 0.13}" fill="${color}" transform="rotate(${a} ${size / 2} ${size / 2})"/>`).join('') + `<circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.06}" fill="${color}"/>`;
    else shape = `<path d="M0,${size / 2} L${size / 2},0 L${size},${size / 2} L${size / 2},${size} Z" fill="none" stroke="${color}" stroke-width="1"/>`;
    return `<defs><pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">${shape}</pattern></defs>` +
      KIT.poly(poly, `url(#${id})`, { opacity });
  };
})();
