// Wall art: procedural graffiti (spray scrawls, tags, throw-ups, stencils,
// drips), handwritten survivor wall messages, posters / flyers / official
// notices with paper aging, and weathered or illuminated signage. Everything
// is drawn on small 2D canvases (<= 512 px) and cached by content key; the
// cache is flushed when a new level starts building.
//
// Handwriting uses a built-in single-stroke vector font, so spray paint and
// marker text look hand-made regardless of the fonts installed on the system.
import * as THREE from 'three';

// ------------------------------------------------------------ utilities --
export function hashStr(s) {
  let h = 2166136261;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rngOf(seed) {
  let s = seed >>> 0;
  const f = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + (b - a) * f();
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  return f;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function parseColor(c) {
  if (typeof c === 'number') return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  c = String(c || '#fff');
  if (c[0] === '#') {
    if (c.length === 4) return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)];
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  const m = c.match(/\d+(\.\d+)?/g);
  return m ? [+m[0], +m[1], +m[2]] : [255, 255, 255];
}
const rgba = (c, a) => { const [r, g, b] = Array.isArray(c) ? c : parseColor(c); return `rgba(${r | 0},${g | 0},${b | 0},${a})`; };
const shade = (c, k) => { const [r, g, b] = Array.isArray(c) ? c : parseColor(c); return [clamp(r * k, 0, 255), clamp(g * k, 0, 255), clamp(b * k, 0, 255)]; };
const mixc = (a, b, t) => { a = Array.isArray(a) ? a : parseColor(a); b = Array.isArray(b) ? b : parseColor(b); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
const lum = (c) => { const [r, g, b] = Array.isArray(c) ? c : parseColor(c); return (0.3 * r + 0.59 * g + 0.11 * b) / 255; };

function canvas(W, H) {
  const c = document.createElement('canvas');
  c.width = Math.max(8, Math.round(W));
  c.height = Math.max(8, Math.round(H));
  return c;
}
// canvas px size for a w x h metre surface (max side `max`, at most ppm px/m)
function sizeFor(w, h, max = 512, ppm = 320) {
  const k = Math.min(max / Math.max(w, h), ppm);
  return [Math.max(16, Math.round(w * k)), Math.max(16, Math.round(h * k)), k];
}

// ---------------------------------------------------------- stroke font --
// Glyphs on a grid: cap height 6 (y down, baseline y = 6), 'wN|' = advance
// width. Commands: M x y (move), L x y (line), Q cx cy x y (quadratic),
// A cx cy rx ry a0 a1 (elliptical arc, degrees, y down).
const GLYPH_SRC = {
  A: 'w4|M0 6 L2 0 L4 6 M0.9 3.9 L3.1 3.9',
  B: 'w4|M0 6 L0 0 L2.4 0 Q3.9 0 3.9 1.5 Q3.9 3 2.3 3 L0 3 M2.3 3 Q4.1 3 4.1 4.5 Q4.1 6 2.4 6 L0 6',
  C: 'w4|A2.2 3 2.1 3 -35 -325',
  D: 'w4|M0 0 L0 6 L1.7 6 Q4 6 4 3 Q4 0 1.7 0 L0 0',
  E: 'w3.6|M3.6 0 L0 0 L0 6 L3.6 6 M0 3 L2.8 3',
  F: 'w3.5|M3.5 0 L0 0 L0 6 M0 3 L2.7 3',
  G: 'w4.2|A2.2 3 2.1 3 -35 -358 M4.3 3.1 L2.5 3.1 M4.3 3.1 L4.3 5.6',
  H: 'w4|M0 0 L0 6 M4 0 L4 6 M0 3 L4 3',
  I: 'w1|M0.5 0 L0.5 6',
  J: 'w3.4|M3 0 L3 4.4 Q3 6 1.5 6 Q0 6 0 4.5',
  K: 'w3.9|M0 0 L0 6 M3.8 0 L0 3.7 M1.3 2.6 L3.9 6',
  L: 'w3.3|M0 0 L0 6 L3.3 6',
  M: 'w5|M0 6 L0 0 L2.5 4 L5 0 L5 6',
  N: 'w4|M0 6 L0 0 L4 6 L4 0',
  O: 'w4.2|A2.1 3 2.1 3 -90 270',
  P: 'w3.9|M0 6 L0 0 L2.4 0 Q3.9 0 3.9 1.6 Q3.9 3.2 2.4 3.2 L0 3.2',
  Q: 'w4.2|A2.1 3 2.1 3 -90 270 M2.6 4.3 L4.3 6.3',
  R: 'w3.9|M0 6 L0 0 L2.4 0 Q3.9 0 3.9 1.6 Q3.9 3.2 2.4 3.2 L0 3.2 M1.9 3.2 L3.9 6',
  S: 'w3.8|M3.6 0.9 Q3 0 1.9 0 Q0.2 0 0.2 1.5 Q0.2 2.8 1.9 3 Q3.8 3.2 3.8 4.6 Q3.8 6 1.9 6 Q0.6 6 0 5.1',
  T: 'w4|M0 0 L4 0 M2 0 L2 6',
  U: 'w4|M0 0 L0 4.2 Q0 6 2 6 Q4 6 4 4.2 L4 0',
  V: 'w4|M0 0 L2 6 L4 0',
  W: 'w5.4|M0 0 L1.3 6 L2.7 1.8 L4.1 6 L5.4 0',
  X: 'w4|M0 0 L4 6 M4 0 L0 6',
  Y: 'w4|M0 0 L2 3 L4 0 M2 3 L2 6',
  Z: 'w4|M0 0 L4 0 L0 6 L4 6',
  0: 'w3.8|A1.9 3 1.9 3 -90 270',
  1: 'w2.2|M0.3 1.2 L1.7 0 L1.7 6',
  2: 'w3.8|M0.2 1.3 Q0.6 0 1.9 0 Q3.7 0 3.7 1.7 Q3.7 3 1.9 4 L0 6 L3.8 6',
  3: 'w3.8|M0.3 0.7 Q1 0 1.9 0 Q3.6 0 3.6 1.5 Q3.6 3 1.8 3 M1.8 3 Q3.9 3 3.9 4.5 Q3.9 6 1.9 6 Q0.7 6 0 5.3',
  4: 'w4|M3 6 L3 0 L0 4.2 L4 4.2',
  5: 'w3.8|M3.6 0 L0.6 0 L0.3 2.8 Q1 2.3 1.9 2.3 Q3.8 2.3 3.8 4.1 Q3.8 6 1.9 6 Q0.7 6 0 5.3',
  6: 'w3.8|M3.3 0.4 Q2.6 0 1.9 0 Q0 0 0 3.5 Q0 6 1.9 6 Q3.8 6 3.8 4.1 Q3.8 2.4 1.9 2.4 Q0.5 2.4 0 3.8',
  7: 'w3.8|M0 0 L3.8 0 L1.4 6',
  8: 'w3.8|A1.9 1.45 1.6 1.45 90 450 M1.9 2.9 A1.9 4.5 1.9 1.55 -90 270',
  9: 'w3.8|M3.8 2.3 Q3.4 3.6 1.9 3.6 Q0 3.6 0 1.8 Q0 0 1.9 0 Q3.8 0 3.8 2.4 Q3.8 6 1.5 6 Q0.8 6 0.3 5.6',
  '.': 'w1|M0.45 5.75 L0.55 6',
  ',': 'w1|M0.7 5.5 L0.2 6.9',
  '!': 'w1|M0.5 0 L0.5 4.2 M0.45 5.75 L0.55 6',
  '?': 'w3.6|M0.2 1.2 Q0.6 0 1.8 0 Q3.5 0 3.5 1.5 Q3.5 2.6 1.9 3.3 L1.9 4.3 M1.85 5.75 L1.95 6',
  '-': 'w3|M0.3 3.3 L2.7 3.3',
  '_': 'w4|M0 6.2 L4 6.2',
  "'": 'w1|M0.5 0 L0.4 1.6',
  '"': 'w2|M0.4 0 L0.3 1.6 M1.5 0 L1.4 1.6',
  '/': 'w3|M3 0 L0 6',
  ':': 'w1|M0.45 1.9 L0.55 2.2 M0.45 5.7 L0.55 6',
  ';': 'w1|M0.45 1.9 L0.55 2.2 M0.7 5.5 L0.2 6.9',
  '+': 'w4|M2 1.4 L2 5 M0.2 3.2 L3.8 3.2',
  '=': 'w3.6|M0.3 2.4 L3.3 2.4 M0.3 4 L3.3 4',
  '&': 'w4.2|M4.2 6 L1 1.9 Q0.6 1.1 1 0.5 Q1.5 0 2 0 Q3 0 3 1 Q3 2 1.5 3 Q0 4 0 4.9 Q0 6 1.7 6 Q3 6 4 4',
  '#': 'w4|M1.4 0.8 L1 5.2 M3 0.8 L2.6 5.2 M0.3 2.2 L3.9 2.2 M0.1 3.9 L3.7 3.9',
  '(': 'w1.8|M1.6 0 Q0 3 1.6 6',
  ')': 'w1.8|M0.2 0 Q1.8 3 0.2 6',
  '%': 'w4|M4 0 L0 6 A0.8 1 0.7 0.9 0 360 A3.2 5 0.7 0.9 0 360',
  '$': 'w3.8|M3.6 1.1 Q3 0.3 1.9 0.3 Q0.2 0.3 0.2 1.7 Q0.2 2.9 1.9 3.1 Q3.8 3.3 3.8 4.6 Q3.8 5.8 1.9 5.8 Q0.6 5.8 0 5 M1.9 -0.5 L1.9 6.6',
  '→': 'w5|M0 3.2 L5 3.2 M3.3 1.6 L5 3.2 L3.3 4.8',
  '►': 'w5|M0 3.2 L5 3.2 M3.3 1.6 L5 3.2 L3.3 4.8',
  '←': 'w5|M5 3.2 L0 3.2 M1.7 1.6 L0 3.2 L1.7 4.8',
  '◄': 'w5|M5 3.2 L0 3.2 M1.7 1.6 L0 3.2 L1.7 4.8',
  '↑': 'w4|M2 6 L2 0.2 M0.4 1.8 L2 0.2 L3.6 1.8',
  '▲': 'w4|M2 6 L2 0.2 M0.4 1.8 L2 0.2 L3.6 1.8',
  '↓': 'w4|M2 0 L2 5.8 M0.4 4.2 L2 5.8 L3.6 4.2',
  '▼': 'w4|M2 0 L2 5.8 M0.4 4.2 L2 5.8 L3.6 4.2',
  '·': 'w1.6|M0.75 3.1 L0.85 3.3',
  '♥': 'w4.4|M2.2 6 L0.3 3.1 Q-0.4 1.6 0.6 0.6 Q1.7 -0.2 2.2 1.4 Q2.7 -0.2 3.8 0.6 Q4.8 1.6 4.1 3.1 L2.2 6',
  '*': 'w3|M1.5 1 L1.5 5 M0 2 L3 4 M3 2 L0 4',
};
const GLYPHS = {};
function parseGlyph(src) {
  const [wpart, body] = src.split('|');
  const w = parseFloat(wpart.slice(1));
  const tok = body.match(/[MLQA]|-?\d*\.?\d+/g);
  const strokes = [];
  let cur = null, px = 0, py = 0, i = 0;
  const num = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M') { px = num(); py = num(); cur = [px, py]; strokes.push(cur); }
    else if (c === 'L') { px = num(); py = num(); cur.push(px, py); }
    else if (c === 'Q') {
      const cx = num(), cy = num(), x = num(), y = num();
      for (let k = 1; k <= 6; k++) { const t = k / 6, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t; cur.push(a * px + b * cx + d * x, a * py + b * cy + d * y); }
      px = x; py = y;
    } else if (c === 'A') {
      const cx = num(), cy = num(), rx = num(), ry = num(), a0 = num(), a1 = num();
      const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 15));
      if (!cur || cur.length !== 2) { cur = []; strokes.push(cur); } // arcs continue only from a bare M
      for (let k = 0; k <= n; k++) { const a = ((a0 + (a1 - a0) * k / n) * Math.PI) / 180; px = cx + Math.cos(a) * rx; py = cy + Math.sin(a) * ry; cur.push(px, py); }
    }
  }
  return { w, strokes: strokes.filter((s) => s.length >= 4) };
}
for (const k in GLYPH_SRC) GLYPHS[k] = parseGlyph(GLYPH_SRC[k]);

// Handwriting style presets.
const HANDS = {
  neat: { slant: 0.08, wide: 0.9, jitter: 0.06, bounce: 0.25, sizeVar: 0.05, letterRot: 0.04, gap: 0.9, rotVar: 0.03, lead: 1.45 },
  scrawl: { slant: 0.18, wide: 0.85, jitter: 0.16, bounce: 0.5, sizeVar: 0.12, letterRot: 0.1, gap: 0.7, rotVar: 0.06, lead: 1.35 },
  shaky: { slant: -0.05, wide: 1.0, jitter: 0.24, bounce: 0.6, sizeVar: 0.15, letterRot: 0.12, gap: 1.0, rotVar: 0.08, lead: 1.4 },
  tall: { slant: 0.25, wide: 0.62, jitter: 0.1, bounce: 0.3, sizeVar: 0.08, letterRot: 0.06, gap: 0.7, rotVar: 0.05, lead: 1.3 },
  wide: { slant: 0.02, wide: 1.2, jitter: 0.1, bounce: 0.35, sizeVar: 0.1, letterRot: 0.05, gap: 1.1, rotVar: 0.04, lead: 1.4 },
  back: { slant: -0.2, wide: 0.8, jitter: 0.12, bounce: 0.4, sizeVar: 0.1, letterRot: 0.08, gap: 0.8, rotVar: 0.05, lead: 1.35 },
};
const HAND_NAMES = Object.keys(HANDS);

// Lay out one line of text in a hand; returns strokes in px (origin = line
// top-left) and the advance width.
function layoutLine(text, size, hand, r) {
  const u = size / 6;
  const out = [];
  let pen = 0;
  for (const ch0 of String(text)) {
    const up = ch0.toUpperCase();
    const gl = GLYPHS[up];
    if (ch0 === ' ') { pen += 2.3 * u * hand.wide; continue; }
    if (!gl) { pen += 2 * u * hand.wide; continue; }
    const lower = ch0 !== up;
    const sc = (1 + (r() - 0.5) * hand.sizeVar * 2) * (lower ? 0.78 : 1);
    const dy = (r() - 0.5) * hand.bounce * u + (lower ? 6 * u * 0.22 : 0);
    const rot = (r() - 0.5) * hand.letterRot * 2;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const gw = gl.w * u * hand.wide * sc;
    const cx = gw / 2, cy = 3 * u * sc;
    for (const s of gl.strokes) {
      const pts = [];
      for (let k = 0; k < s.length; k += 2) {
        let x = s[k] * u * hand.wide * sc + (r() - 0.5) * hand.jitter * u * 2;
        let y = s[k + 1] * u * sc + (r() - 0.5) * hand.jitter * u * 2;
        x += hand.slant * (6 * u * sc - y);
        const lx = x - cx, ly = y - cy;
        pts.push(pen + cx + lx * cs - ly * sn, dy + cy + lx * sn + ly * cs);
      }
      out.push(pts);
    }
    pen += gw + hand.gap * u * (0.7 + r() * 0.6);
  }
  return { strokes: out, width: Math.max(pen - 0.5 * u, u) };
}
// Lay out multi-line text centred in a box; returns {strokes, bbox, size}.
function layoutText(text, box, hand, r, o = {}) {
  const lines = String(text).split('\n');
  const probe = lines.map((l) => layoutLine(l, 60, hand, rngOf(1)).width);
  const maxW = Math.max(...probe, 1);
  let size = Math.min((box.h / (lines.length * hand.lead - (hand.lead - 1))), (box.w * 60) / maxW);
  if (o.maxSize) size = Math.min(size, o.maxSize);
  size *= o.fill ?? 1;
  const lh = size * hand.lead;
  const totalH = lines.length * lh - (lh - size);
  const strokes = [];
  let y = box.y + (box.h - totalH) / 2;
  let minX = 1e9, maxX = -1e9;
  const baseRot = o.rot ?? 0;
  lines.forEach((l) => {
    const L = layoutLine(l, size, hand, r);
    const align = o.align ?? 'center';
    let x = align === 'left' ? box.x : box.x + (box.w - L.width) / 2 + (r() - 0.5) * size * 0.4 * (o.stagger ?? 1);
    const rot = baseRot + (r() - 0.5) * hand.rotVar * 2;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const pcx = x + L.width / 2, pcy = y + size / 2;
    for (const s of L.strokes) {
      const p = [];
      for (let k = 0; k < s.length; k += 2) {
        const lx = s[k] + x - pcx, ly = s[k + 1] + y - pcy;
        const X = pcx + lx * cs - ly * sn, Y = pcy + lx * sn + ly * cs;
        p.push(X, Y);
        if (X < minX) minX = X; if (X > maxX) maxX = X;
      }
      strokes.push(p);
    }
    y += lh;
  });
  return { strokes, size, bbox: { x: minX, y: box.y + (box.h - totalH) / 2, w: maxX - minX, h: totalH } };
}

function pathStrokes(g, strokes, dx = 0, dy = 0) {
  g.beginPath();
  for (const s of strokes) {
    g.moveTo(s[0] + dx, s[1] + dy);
    if (s.length === 2) g.lineTo(s[0] + dx + 0.1, s[1] + dy + 0.1);
    for (let k = 2; k < s.length; k += 2) g.lineTo(s[k] + dx, s[k + 1] + dy);
  }
}

// ------------------------------------------------------------- ink tools --
// tool: spray | marker | pen | chalk | brush
function ink(g, strokes, t, r) {
  const col = parseColor(t.color);
  const w = t.width;
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  switch (t.tool) {
    case 'spray': {
      // overspray halo
      g.globalAlpha = 1;
      g.shadowColor = rgba(col, 0.55 * (t.halo ?? 1));
      g.shadowBlur = w * 1.6;
      g.strokeStyle = rgba(col, 0.16 * (t.halo ?? 1));
      g.lineWidth = w * 2.4;
      pathStrokes(g, strokes); g.stroke();
      g.shadowBlur = w * 0.5;
      g.shadowColor = rgba(col, 0.5);
      g.strokeStyle = rgba(col, 0.82);
      // pressure variation: strokes in three width groups (3 blurred draws, not one per stroke)
      const off = Math.floor(r() * 3);
      for (let q = 0; q < 3; q++) { g.lineWidth = w * (0.82 + q * 0.18); pathStrokes(g, strokes.filter((_, k) => (k + off) % 3 === q)); g.stroke(); }
      g.shadowBlur = 0;
      // paint builds up along the middle of the line
      g.strokeStyle = rgba(col, 0.55);
      g.lineWidth = w * 0.5;
      pathStrokes(g, strokes); g.stroke();
      speckle(g, strokes, col, w, r, t.speckle ?? 1);
      drips(g, strokes, col, w * 0.42, r, t.drips ?? 0.2, t.dripLen ?? 1);
      break;
    }
    case 'marker': {
      g.strokeStyle = rgba(col, 0.22);
      g.lineWidth = w * 1.35;
      pathStrokes(g, strokes); g.stroke();
      g.strokeStyle = rgba(col, 0.88);
      g.lineWidth = w;
      pathStrokes(g, strokes); g.stroke();
      // streaky felt tip
      g.strokeStyle = rgba(shade(col, 1.25), 0.18);
      g.lineWidth = Math.max(0.6, w * 0.25);
      pathStrokes(g, strokes, w * 0.2, -w * 0.15); g.stroke();
      break;
    }
    case 'pen': {
      g.strokeStyle = rgba(col, 0.85);
      g.lineWidth = w;
      pathStrokes(g, strokes); g.stroke();
      break;
    }
    case 'chalk': {
      for (let pass = 0; pass < 3; pass++) {
        g.strokeStyle = rgba(col, 0.28);
        g.lineWidth = w * (0.6 + pass * 0.3);
        g.setLineDash([w * (1 + r() * 2), w * (0.4 + r())]);
        pathStrokes(g, strokes, (r() - 0.5) * w * 0.6, (r() - 0.5) * w * 0.6); g.stroke();
      }
      g.setLineDash([]);
      break;
    }
    case 'brush': {
      g.strokeStyle = rgba(col, 0.93);
      for (const s of strokes) {
        for (let k = 2; k < s.length; k += 2) {
          g.lineWidth = w * (0.75 + r() * 0.5);
          g.beginPath(); g.moveTo(s[k - 2], s[k - 1]); g.lineTo(s[k], s[k + 1]); g.stroke();
        }
      }
      drips(g, strokes, col, w * 0.35, r, t.drips ?? 0.25, t.dripLen ?? 1.3);
      break;
    }
  }
  g.restore();
}
function speckle(g, strokes, col, w, r, amt) {
  g.fillStyle = rgba(col, 0.5);
  for (const s of strokes) {
    for (let k = 0; k < s.length; k += 2) {
      const n = Math.round(2 * amt);
      for (let q = 0; q < n; q++) {
        const a = r() * Math.PI * 2, d = w * (0.8 + r() * 1.6);
        const rad = Math.max(0.4, w * 0.07 * (0.5 + r()));
        g.globalAlpha = 0.25 + r() * 0.5;
        g.fillRect(s[k] + Math.cos(a) * d, s[k + 1] + Math.sin(a) * d, rad, rad);
      }
    }
  }
  g.globalAlpha = 1;
}
function drips(g, strokes, col, w, r, chance, len) {
  if (chance <= 0) return;
  g.strokeStyle = rgba(col, 0.88);
  g.fillStyle = rgba(col, 0.9);
  g.lineCap = 'round';
  for (const s of strokes) {
    for (let k = 0; k < s.length; k += 2) {
      // prefer low points of a stroke (paint pools there)
      const low = k + 3 < s.length ? s[k + 1] >= s[k + 3] - 0.5 : true;
      if (r() > chance * (low ? 1.2 : 0.3)) continue;
      const x = s[k] + (r() - 0.5) * w, y = s[k + 1];
      const L = w * (3 + r() * r() * 26) * len;
      const ww = w * (0.55 + r() * 0.5);
      g.lineWidth = ww;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 1.2, y + L); g.stroke();
      g.beginPath(); g.arc(x, y + L, ww * 0.75, 0, Math.PI * 2); g.fill();
    }
  }
}

// ------------------------------------------------------------- graffiti --
const SPRAY_COLS = ['#c41e16', '#1a1a1a', '#e8e4d8', '#1f4fb0', '#2f8a2a', '#e0a010', '#9a2aa8', '#ff5a1a', '#18a0a8', '#f04a8a'];
// Choose a style from the text for plain graffiti() calls.
export function autoGraffitiStyle(text, color, seed) {
  const t = String(text);
  const words = t.replace(/\n/g, ' ').trim().split(/\s+/).length;
  const r = rngOf(seed ^ hashStr(t));
  if (/[→←↑↓►◄▲▼]/.test(t) && words <= 4) return r() < 0.6 ? 'scrawl' : 'stencil';
  const c = parseColor(color);
  const red = c[0] > 110 && c[1] < 70 && c[2] < 70;
  if (words === 1 && t.length <= 8) return r.pick(['tag', 'throwup', 'scrawl']);
  if (red && t.includes('\n') && r() < 0.45) return 'drip';
  if (lum(c) < 0.25 && r() < 0.4) return 'marker';
  return 'scrawl';
}
export function graffitiCanvas(text, o = {}) {
  const [W, H] = sizeFor(o.w ?? 2, o.h ?? 0.8, o.max ?? 512, o.ppm ?? 256);
  const c = canvas(W, H), g = c.getContext('2d');
  const seed = (o.seed ?? 0) ^ hashStr(text + '|' + (o.color ?? ''));
  const r = rngOf(seed);
  const color = o.color ?? r.pick(SPRAY_COLS);
  const style = o.style ?? autoGraffitiStyle(text, color, o.seed ?? 0);
  const pad = Math.min(W, H) * 0.1;
  const bottom = H * (o.dripSpace ?? 0) + pad;
  const box = { x: pad, y: pad, w: W - pad * 2, h: H - pad - bottom };
  const handName = o.hand ?? r.pick(['scrawl', 'scrawl', 'tall', 'shaky', 'wide', 'back']);
  const hand = HANDS[handName];
  switch (style) {
    case 'tag': drawTag(g, text, box, color, o, r); break;
    case 'throwup': drawBubble(g, text, box, color, o, r, false); break;
    case 'piece': drawBubble(g, text, box, color, o, r, true); break;
    case 'stencil': drawStencil(g, text, box, color, o, r); break;
    case 'marker': {
      const L = layoutText(text, box, HANDS[o.hand ?? 'neat'], r, { fill: 0.9, rot: (r() - 0.5) * 0.08 });
      ink(g, L.strokes, { tool: 'marker', color, width: Math.max(2, L.size * 0.1) }, r);
      break;
    }
    case 'chalk': {
      const L = layoutText(text, box, hand, r, { fill: 0.92 });
      ink(g, L.strokes, { tool: 'chalk', color, width: Math.max(2, L.size * 0.1) }, r);
      break;
    }
    case 'drip': {
      const L = layoutText(text, { x: box.x, y: box.y - pad * 0.4, w: box.w, h: box.h * 0.8 }, hand, r, { fill: 0.95, rot: (r() - 0.5) * 0.1 });
      ink(g, L.strokes, { tool: 'spray', color, width: Math.max(2.5, L.size * 0.15), drips: 0.5, dripLen: 1.6 }, r);
      break;
    }
    default: { // scrawl: spray-can handwriting
      const L = layoutText(text, box, hand, r, { fill: 0.95, rot: (r() - 0.5) * 0.12 });
      ink(g, L.strokes, { tool: 'spray', color, width: Math.max(2, L.size * (0.1 + r() * 0.04)), drips: o.drips ?? 0.18 }, r);
    }
  }
  return c;
}
function drawTag(g, text, box, color, o, r) {
  const hand = { ...HANDS.tall, slant: 0.35 + r() * 0.2, letterRot: 0.25, bounce: 1.2, gap: 0.2, jitter: 0.12 };
  const L = layoutText(text, { x: box.x, y: box.y, w: box.w, h: box.h * 0.75 }, hand, r, { fill: 1, rot: -0.12 + r() * 0.08 });
  const w = Math.max(2, L.size * 0.11);
  const outline = o.color2 ?? (lum(color) > 0.5 ? '#141414' : '#f0f0e8');
  // underline swoosh + crown / star
  const b = L.bbox;
  const sw = [[b.x - w, b.y + b.h + w * 1.5, b.x + b.w * 0.5, b.y + b.h + w * 5, b.x + b.w + w * 3, b.y + b.h - w]];
  const swoosh = [];
  for (const [x0, y0, cx, cy, x1, y1] of sw) { const p = []; for (let k = 0; k <= 12; k++) { const t = k / 12; p.push((1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1); } swoosh.push(p); }
  const all = [...L.strokes, ...swoosh];
  if (r() < 0.5) { const sx = b.x + b.w + w * 2, sy = b.y; all.push([sx - w * 2, sy, sx + w * 2, sy], [sx, sy - w * 2, sx, sy + w * 2]); }
  if (r() < 0.7) ink(g, all, { tool: 'spray', color: outline, width: w * 2.1, drips: 0, halo: 0.6 }, r);
  ink(g, all, { tool: 'spray', color, width: w, drips: 0.12 }, r);
}
function drawBubble(g, text, box, color, o, r, piece) {
  const hand = { ...HANDS.wide, slant: 0.08, jitter: 0.05, letterRot: 0.12, bounce: 0.6, gap: -0.5, sizeVar: 0.1, wide: 1.05 };
  const L = layoutText(String(text).replace(/\n/g, ' '), { x: box.x + box.w * 0.06, y: box.y + box.h * 0.14, w: box.w * 0.88, h: box.h * 0.66 }, hand, r, { fill: 1, rot: (r() - 0.5) * 0.1, stagger: 0 });
  const sw = L.size * 0.34;
  const out = o.color2 ?? (lum(color) > 0.45 ? '#141414' : '#f2f0e6');
  const col = parseColor(color);
  const b = L.bbox;
  if (piece) {
    // background burst / cloud
    g.save();
    g.fillStyle = rgba(o.color3 ?? r.pick(SPRAY_COLS), 0.8);
    g.shadowColor = g.fillStyle; g.shadowBlur = sw;
    g.beginPath();
    for (let k = 0; k < 14; k++) { const cx = b.x + r() * b.w, cy = b.y + b.h * (0.2 + r() * 0.6); g.moveTo(cx + sw * 2, cy); g.arc(cx, cy, sw * (1.2 + r() * 1.2), 0, Math.PI * 2); }
    g.fill();
    g.restore();
  }
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  // 3D extrusion
  const ex = sw * 0.22, ey = sw * 0.25;
  g.strokeStyle = rgba(shade(out, 0.6), 0.95);
  g.lineWidth = sw + sw * 0.5;
  for (let k = 1; k <= 4; k++) { pathStrokes(g, L.strokes, ex * k / 4, ey * k / 4); g.stroke(); }
  // outline
  g.strokeStyle = rgba(out, 1);
  g.lineWidth = sw + sw * 0.5;
  g.shadowColor = rgba(out, 0.5); g.shadowBlur = sw * 0.4;
  pathStrokes(g, L.strokes); g.stroke();
  g.shadowBlur = 0;
  // fill (gradient)
  const gr = g.createLinearGradient(0, b.y, 0, b.y + b.h);
  const c2 = o.fill2 ? parseColor(o.fill2) : piece ? parseColor(r.pick(SPRAY_COLS)) : shade(col, 0.7);
  gr.addColorStop(0, rgba(shade(col, 1.15), 1));
  gr.addColorStop(0.55, rgba(col, 1));
  gr.addColorStop(1, rgba(c2, 1));
  g.strokeStyle = gr;
  g.lineWidth = sw;
  pathStrokes(g, L.strokes); g.stroke();
  // shine
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = sw * 0.18;
  pathStrokes(g, L.strokes, -sw * 0.18, -sw * 0.2); g.stroke();
  g.restore();
  if (piece) {
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (let k = 0; k < 5; k++) { const x = b.x + r() * b.w, y = b.y + r() * b.h, s = sw * (0.3 + r() * 0.5); g.beginPath(); g.moveTo(x - s, y); g.lineTo(x, y - s * 0.2); g.lineTo(x + s, y); g.lineTo(x, y + s * 0.2); g.closePath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.2, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.2, y); g.closePath(); g.fill(); }
  }
  drips(g, L.strokes, col, sw * 0.18, r, 0.08, 1.2);
}
const STENCIL_FONT = '"Stencil", "Stencil Std", "Arial Black", "Arial Bold", Impact, "Helvetica Neue", sans-serif';
function drawStencil(g, text, box, color, o, r) {
  const lines = String(text).split('\n');
  const tmp = canvas(g.canvas.width, g.canvas.height), t = tmp.getContext('2d');
  let size = box.h / (lines.length * 1.1);
  t.font = `900 ${size}px ${STENCIL_FONT}`;
  for (const l of lines) while (t.measureText(l).width > box.w && size > 6) { size -= 1; t.font = `900 ${size}px ${STENCIL_FONT}`; }
  t.fillStyle = rgba(color, 1);
  t.textAlign = 'left'; t.textBaseline = 'middle';
  if ('letterSpacing' in t) t.letterSpacing = `${Math.round(size * 0.06)}px`;
  const bridges = /[ABDOPQRG0689]/;
  lines.forEach((l, li) => {
    const y = box.y + box.h / 2 + (li - (lines.length - 1) / 2) * size * 1.1;
    const tw = t.measureText(l).width;
    const x0 = box.x + (box.w - tw) / 2;
    t.fillText(l, x0, y);
    // stencil bridges
    t.save(); t.globalCompositeOperation = 'destination-out';
    let acc = '';
    for (const ch of l) {
      const a = t.measureText(acc).width; acc += ch; const b2 = t.measureText(acc).width;
      if (bridges.test(ch)) t.fillRect(x0 + (a + b2) / 2 - size * 0.035, y - size * 0.6, size * 0.07, size * 1.2);
    }
    t.restore();
  });
  // paint density noise
  t.save(); t.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 500; k++) { t.globalAlpha = r() * 0.25; const s = 1 + r() * 4; t.fillRect(r() * tmp.width, r() * tmp.height, s, s); }
  t.restore();
  g.save();
  g.shadowColor = rgba(color, 0.6); g.shadowBlur = size * 0.06;
  g.drawImage(tmp, (r() - 0.5) * 2, (r() - 0.5) * 2);
  g.restore();
  g.globalAlpha = 0.9;
  g.drawImage(tmp, 0, 0);
  g.globalAlpha = 1;
}

// ------------------------------------------------------- wall messages --
const NAMES = ['MIKE', 'RAY', 'DEE', 'TOMMY', 'SARAH', 'KATE', 'DEVON', 'LUIS', 'J.T.', 'RUTH', 'OWEN', 'NINA', 'BIG AL', 'HANK', 'MAGGIE', 'PRIYA', 'ELENA', 'COLE', 'VINCE', 'MARCUS', 'ROSA', 'ANDY', 'IVY', 'FRANK B.', 'DOC', 'TERESA', 'BOBBY', 'GRACE', 'SAM + JO', 'OLD PETE', 'LENA', 'KWAME', 'DMITRI', 'WES'];
const PHRASES = ['CEDA LIES', 'NO ONE IS COMING', 'GOD HELP US', 'THEY CAN HEAR YOU', 'STAY QUIET', "DON'T TRUST\nTHE RADIO", 'HOSPITAL IS\nOVERRUN', 'WE WENT NORTH', 'KEEP MOVING', 'SAVE AMMO', 'AIM FOR\nTHE HEAD', 'DAY 4', 'DAY 9', 'OCT 12', "I'M SORRY MOM", 'HOLD THE DOOR', 'NOT BIT\nJUST TIRED', 'ARMY LEFT US', 'EVAC WAS\nA LIE', 'TUNNELS\nFLOODED', 'WATCH THE\nROOFTOPS', 'LOOK UP', 'PILLS UNDER\nTHE SINK', 'BURN THEM', 'WE WERE HERE', 'STILL ALIVE', 'CHOPPERS\nAT MERCY?', "DON'T GO IN\nTHE SEWERS", 'MOM + KATIE\nSAFE AT\nST. JUDE', 'DAN - WAIT\nHERE FOR US', 'THEY SWARM\nAT NIGHT', 'NEVER STOP', 'SHOOT THE\nFAT ONES\nFROM FAR', 'THE CRYING\nONE - RUN', 'NO FOOD\nNO WATER', '3 OF US\nLEFT', 'HE WAS BIT\nWE HAD TO', 'FOLLOW THE\nARROWS', 'RADIO SAYS\nMERCY HOSP.', 'LOCK IT\nBEHIND YOU'];
const REPLIES = ['NO KIDDING', 'LIAR', 'THEY LIED', 'SEE YOU THERE', 'AMEN', 'TOO LATE', '?? WHERE', 'STILL WAITING'];
const INK_COLS = { marker: ['#141414', '#141414', '#1a2a8a', '#8a1410', '#1a5a2a'], pen: ['#1a2a6a', '#141414', '#3a3a3a'], spray: ['#b8201a', '#141414', '#e0ddd0', '#1f4fb0'], chalk: ['#e8e6dc', '#d8d0b0'], brush: ['#7a1410', '#141414'] };

export function wallMessagesCanvas(o = {}) {
  const [W, H, ppm] = sizeFor(o.w ?? 1.6, o.h ?? 1.0, o.max ?? 512, o.ppm ?? 420);
  const c = canvas(W, H), g = c.getContext('2d');
  const r = rngOf((o.seed ?? 1) * 7919 + hashStr((o.lines || []).join('|')));
  const cell = 6, gw = Math.ceil(W / cell), gh = Math.ceil(H / cell);
  const occ = new Uint8Array(gw * gh);
  const free = (x, y, w, h) => {
    if (x < 2 || y < 2 || x + w > W - 2 || y + h > H - 2) return false;
    let hit = 0, tot = 0;
    for (let cy = Math.floor(y / cell); cy <= Math.floor((y + h) / cell); cy++) for (let cx = Math.floor(x / cell); cx <= Math.floor((x + w) / cell); cx++) { tot++; if (occ[cy * gw + cx]) hit++; }
    return hit / tot < 0.04;
  };
  const mark = (x, y, w, h) => { for (let cy = Math.max(0, Math.floor(y / cell)); cy <= Math.min(gh - 1, Math.floor((y + h) / cell)); cy++) for (let cx = Math.max(0, Math.floor(x / cell)); cx <= Math.min(gw - 1, Math.floor((x + w) / cell)); cx++) occ[cy * gw + cx] = 1; };
  const pickTool = (big) => {
    const t = big ? r.pick(['spray', 'spray', 'marker', 'brush', 'marker']) : r.pick(['marker', 'marker', 'marker', 'pen', 'chalk', 'spray']);
    return { tool: t, color: r.pick(INK_COLS[t]) };
  };
  const place = (text, sizeCm, big, extra) => {
    const hand = HANDS[r.pick(HAND_NAMES)];
    const size = sizeCm * 0.01 * ppm;
    const L0 = layoutLine(String(text).split('\n').reduce((a, b) => (b.length > a.length ? b : a), ''), size, hand, rngOf(5));
    const lines = String(text).split('\n').length;
    const bw = L0.width * 1.08 + size * 0.5, bh = lines * size * hand.lead + size * 0.2;
    for (let tries = 0; tries < 28; tries++) {
      const x = r() * (W - bw), y = r() * (H - bh);
      if (!free(x, y, bw, bh)) continue;
      const tool = extra?.tool ? { tool: extra.tool, color: extra.color ?? r.pick(INK_COLS[extra.tool]) } : pickTool(big);
      const L = layoutText(text, { x, y, w: bw, h: bh }, hand, r, { align: r() < 0.5 ? 'left' : 'center', rot: (r() - 0.5) * (big ? 0.12 : 0.2), maxSize: size });
      const lw = tool.tool === 'pen' ? Math.max(1.2, size * 0.06) : tool.tool === 'marker' ? Math.max(1.6, size * 0.1) : Math.max(2, size * 0.12);
      ink(g, L.strokes, { ...tool, width: lw, drips: tool.tool === 'spray' ? 0.15 : 0.3, dripLen: 0.6 }, r);
      if (extra?.strike) { // crossed out
        g.save(); g.strokeStyle = rgba(r.pick(['#141414', '#8a1410', tool.color]), 0.9); g.lineWidth = lw * 1.1; g.lineCap = 'round';
        const b = L.bbox; g.beginPath(); g.moveTo(b.x - lw, b.y + size * 0.55 + (r() - 0.5) * size * 0.3); g.lineTo(b.x + b.w + lw, b.y + size * 0.45 + (r() - 0.5) * size * 0.3); g.stroke();
        if (r() < 0.4) { g.beginPath(); g.moveTo(b.x, b.y + size * 0.8); g.lineTo(b.x + b.w, b.y + size * 0.2); g.stroke(); }
        g.restore();
      }
      if (extra?.circle || (!big && r() < 0.06)) {
        const b = L.bbox; g.save(); g.strokeStyle = rgba(tool.color, 0.85); g.lineWidth = lw; g.beginPath();
        g.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w * 0.62, b.h * 0.8, (r() - 0.5) * 0.2, 0.3, Math.PI * 2 + 0.6); g.stroke(); g.restore();
      }
      if (extra?.underline || (big && r() < 0.35)) {
        const b = L.bbox; g.save(); g.strokeStyle = rgba(tool.color, 0.85); g.lineWidth = lw; g.lineCap = 'round'; g.beginPath();
        g.moveTo(b.x, b.y + b.h + lw * 1.5); g.quadraticCurveTo(b.x + b.w / 2, b.y + b.h + lw * (1 + r() * 2), b.x + b.w, b.y + b.h + lw * 0.5); g.stroke(); g.restore();
      }
      mark(x, y, bw, bh);
      return L.bbox;
    }
    return null;
  };
  const tally = () => {
    const groups = 1 + Math.floor(r() * 5), size = (5 + r() * 4) * 0.01 * ppm;
    const bw = groups * size * 1.1 + size, bh = size * 1.2;
    for (let tries = 0; tries < 20; tries++) {
      const x = r() * (W - bw), y = r() * (H - bh);
      if (!free(x, y, bw, bh)) continue;
      const col = r.pick(['#141414', '#1a2a8a', '#8a1410', '#e0ddd0']);
      const strokes = [];
      let px = x + size * 0.3;
      for (let gI = 0; gI < groups; gI++) {
        const n = gI === groups - 1 ? 1 + Math.floor(r() * 5) : 5;
        for (let k = 0; k < Math.min(4, n); k++) { const lx = px + k * size * 0.2 + (r() - 0.5) * 2; strokes.push([lx, y + (r() - 0.5) * 3, lx + (r() - 0.5) * 3, y + size + (r() - 0.5) * 3]); }
        if (n === 5) strokes.push([px - size * 0.1, y + size * 0.8, px + size * 0.75, y + size * 0.15]);
        px += size * 1.1;
      }
      ink(g, strokes, { tool: 'marker', color: col, width: Math.max(1.5, size * 0.07) }, r);
      mark(x, y, bw, bh);
      return;
    }
  };
  const circ = (cx, cy, rx, ry, a0 = 0, a1 = Math.PI * 2, n = 18) => { const p = []; for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; p.push(cx + Math.cos(a) * rx + (r() - 0.5) * rx * 0.08, cy + Math.sin(a) * ry + (r() - 0.5) * ry * 0.08); } return p; };
  const doodle = () => {
    const s = (6 + r() * 7) * 0.01 * ppm, bw = s * 1.3, bh = s * 1.5;
    for (let tries = 0; tries < 20; tries++) {
      const x = r() * (W - bw), y = r() * (H - bh);
      if (!free(x, y, bw, bh)) continue;
      const cx = x + bw / 2, cy = y + bh / 2, kind = r.pick(['skull', 'smile', 'cross', 'stick', 'xcircle']);
      let st = [];
      if (kind === 'skull') st = [circ(cx, cy - s * 0.1, s * 0.45, s * 0.42, Math.PI / 2 + 0.6, Math.PI * 2.5 - 0.6), circ(cx - s * 0.17, cy - s * 0.1, s * 0.1, s * 0.1), circ(cx + s * 0.17, cy - s * 0.1, s * 0.1, s * 0.1), [cx, cy + s * 0.02, cx - s * 0.05, cy + s * 0.12, cx + s * 0.05, cy + s * 0.12, cx, cy + s * 0.02], [cx - s * 0.25, cy + s * 0.25, cx - s * 0.22, cy + s * 0.5, cx + s * 0.22, cy + s * 0.5, cx + s * 0.25, cy + s * 0.25], [cx - s * 0.08, cy + s * 0.32, cx - s * 0.08, cy + s * 0.5], [cx + s * 0.08, cy + s * 0.32, cx + s * 0.08, cy + s * 0.5]];
      else if (kind === 'smile') st = [circ(cx, cy, s * 0.45, s * 0.45), [cx - s * 0.15, cy - s * 0.12, cx - s * 0.15, cy - s * 0.05], [cx + s * 0.15, cy - s * 0.12, cx + s * 0.15, cy - s * 0.05], circ(cx, cy + s * 0.02, s * 0.25, s * 0.22, 0.3, Math.PI - 0.3, 8)];
      else if (kind === 'cross') st = [[cx, cy - s * 0.6, cx, cy + s * 0.45], [cx - s * 0.3, cy - s * 0.3, cx + s * 0.3, cy - s * 0.3], circ(cx, cy + s * 0.62, s * 0.6, s * 0.18, Math.PI, Math.PI * 2, 10)];
      else if (kind === 'stick') st = [circ(cx, cy - s * 0.45, s * 0.15, s * 0.15), [cx, cy - s * 0.3, cx, cy + s * 0.15], [cx - s * 0.3, cy - s * 0.1, cx, cy - s * 0.15, cx + s * 0.3, cy - s * 0.1], [cx - s * 0.25, cy + s * 0.6, cx, cy + s * 0.15, cx + s * 0.25, cy + s * 0.6]];
      else st = [circ(cx, cy, s * 0.45, s * 0.45), [cx - s * 0.3, cy - s * 0.3, cx + s * 0.3, cy + s * 0.3], [cx + s * 0.3, cy - s * 0.3, cx - s * 0.3, cy + s * 0.3]];
      const tool = pickTool(false);
      ink(g, st, { ...tool, width: Math.max(1.5, s * 0.06), drips: 0.1, dripLen: 0.5 }, r);
      mark(x, y, bw, bh);
      return;
    }
  };
  const arrow = () => {
    const txt = r.pick(['→', '←', '↑', 'THIS WAY →', '← NOT THAT WAY', '→ MERCY', 'EXIT →']);
    place(txt, 6 + r() * 5, false, { tool: r.pick(['spray', 'marker']) });
  };
  // given lines first (prominent)
  const given = (o.lines || []).slice();
  for (const t of given) place(t, (o.bigSize ?? 11) * (0.8 + r() * 0.4), true);
  const density = o.density ?? 1;
  const n = Math.round((W * H) / (ppm * ppm) * 16 * density);
  const used = new Set(given);
  for (let k = 0; k < n; k++) {
    const q = r();
    if (q < 0.3) {
      const name = r.pick(NAMES);
      const withPlus = r() < 0.2 ? name + ' ' + r.pick(['WAS HERE', 'DAY ' + (2 + Math.floor(r() * 12)), '+ ' + r.pick(NAMES)]) : name;
      place(withPlus, 3.5 + r() * 3.5, false, r() < 0.3 ? { strike: true } : null);
    } else if (q < 0.62) {
      let p = r.pick(PHRASES);
      if (used.has(p)) p = r.pick(PHRASES);
      used.add(p);
      const bb = place(p, 3.5 + r() * 5, r() < 0.2, null);
      if (bb && r() < 0.25) place(r.pick(REPLIES), 3 + r() * 2, false, null);
    } else if (q < 0.74) tally();
    else if (q < 0.82) arrow();
    else if (q < 0.88) doodle();
    else if (q < 0.94) place(`${r.pick(['DAY', 'OCT'])} ${1 + Math.floor(r() * 20)}`, 3 + r() * 3, false, null);
    else place(r.pick(NAMES) + '\n' + r.pick(NAMES) + '\n' + r.pick(NAMES), 3 + r() * 2, false, { tool: 'pen', strike: r() < 0.5 });
  }
  return c;
}

// --------------------------------------------------------------- posters --
const F_SANS = '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif';
const F_COND = '"Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", "Helvetica Neue", Arial, sans-serif';
const F_HEAVY = '"Arial Black", "Helvetica Neue", Impact, Arial, sans-serif';
const F_IMPACT = 'Impact, "Haettenschweiler", "Arial Black", sans-serif';
const F_SERIF = 'Georgia, "Times New Roman", "Liberation Serif", serif';
const F_MONO = '"Courier New", Courier, "Liberation Mono", monospace';
function fitText(g, text, x, y, maxW, size, font, weight = 'bold', align = 'center') {
  let s = size;
  g.font = `${weight} ${s}px ${font}`;
  while (g.measureText(text).width > maxW && s > 5) { s -= 1; g.font = `${weight} ${s}px ${font}`; }
  g.textAlign = align;
  g.fillText(text, x, y);
  return s;
}
function textBlock(g, lines, x, y, maxW, size, font, col, lead = 1.25, align = 'center', weight = 'bold') {
  g.fillStyle = col;
  let yy = y;
  for (const l of lines) { fitText(g, l, x, yy, maxW, size, font, weight, align); yy += size * lead; }
  return yy;
}
const LOREM = 'all residents must report to the nearest designated center with identification do not approach persons showing symptoms remain indoors keep windows closed await further instructions from local authorities emergency broadcast channel water supply may be affected boil before use curfew in effect from dusk until dawn by order of the department'.split(' ');
function fineText(g, x, y, w, rows, size, col, r, align = 'left') {
  g.fillStyle = col;
  g.font = `${size}px ${F_SANS}`;
  g.textAlign = align;
  for (let k = 0; k < rows; k++) {
    let s = '';
    while (g.measureText(s).width < w * (0.7 + r() * 0.3)) s += LOREM[Math.floor(r() * LOREM.length)] + ' ';
    g.fillText(s.trim(), align === 'center' ? x + w / 2 : x, y + k * size * 1.3);
  }
}
function silhouette(g, cx, cy, s, col) {
  g.fillStyle = col;
  g.beginPath();
  g.ellipse(cx, cy - s * 0.32, s * 0.2, s * 0.26, 0, 0, Math.PI * 2);
  g.moveTo(cx - s * 0.5, cy + s * 0.5);
  g.quadraticCurveTo(cx - s * 0.48, cy + s * 0.02, cx - s * 0.12, cy - s * 0.02);
  g.lineTo(cx + s * 0.12, cy - s * 0.02);
  g.quadraticCurveTo(cx + s * 0.48, cy + s * 0.02, cx + s * 0.5, cy + s * 0.5);
  g.closePath();
  g.fill();
}
function planeShape(g, x, y, s, col, ang = -0.2) {
  g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = col;
  g.beginPath();
  g.ellipse(0, 0, s, s * 0.09, 0, 0, Math.PI * 2);
  g.moveTo(s * 0.1, 0); g.lineTo(-s * 0.25, -s * 0.65); g.lineTo(-s * 0.4, -s * 0.65); g.lineTo(-s * 0.15, 0);
  g.moveTo(s * 0.1, 0); g.lineTo(-s * 0.25, s * 0.65); g.lineTo(-s * 0.4, s * 0.65); g.lineTo(-s * 0.15, 0);
  g.moveTo(-s * 0.8, 0); g.lineTo(-s * 1.0, -s * 0.3); g.lineTo(-s * 1.08, -s * 0.3); g.lineTo(-s * 0.95, 0);
  g.fill();
  g.restore();
}
function skyline(g, y, W, col, r, hmax) {
  g.fillStyle = col;
  let x = -5;
  while (x < W) { const w = 8 + r() * 26, h = hmax * (0.25 + r() * 0.75); g.fillRect(x, y - h, w, h + 2); if (r() < 0.2) g.fillRect(x + w * 0.4, y - h - hmax * 0.15, 2, hmax * 0.15); x += w + (r() < 0.3 ? 2 : 0); }
}
function halftone(g, x, y, w, h, col, dot, r) {
  g.fillStyle = col;
  for (let yy = y; yy < y + h; yy += dot) for (let xx = x + ((yy / dot) & 1) * dot / 2; xx < x + w; xx += dot) {
    const k = (xx - x) / w; const rr = dot * 0.45 * k;
    if (rr > 0.3) { g.beginPath(); g.arc(xx, yy, rr, 0, Math.PI * 2); g.fill(); }
  }
}
function stripes(g, x, y, w, h, a = '#e0b820', b = '#141414', sw = 14) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = a; g.fillRect(x, y, w, h); g.fillStyle = b;
  for (let k = -h; k < w + h; k += sw * 2) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k + sw, y); g.lineTo(x + k + sw - h, y + h); g.lineTo(x + k - h, y + h); g.fill(); }
  g.restore();
}
function emblem(g, cx, cy, rad, col, bg) {
  g.fillStyle = col; g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();
  g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, rad * 0.8, 0, Math.PI * 2); g.fill();
  g.fillStyle = col; g.fillRect(cx - rad * 0.14, cy - rad * 0.55, rad * 0.28, rad * 1.1); g.fillRect(cx - rad * 0.55, cy - rad * 0.14, rad * 1.1, rad * 0.28);
}
const MOVIES = ['NIGHT SHIFT', 'THE HOLLOW MEN', 'DEAD RECKONING', 'RED HARVEST', 'SILENT COUNTY', 'BLOOD MOON\nRISING', 'LAST TRAIN\nOUT', 'THE QUIET\nROOM', 'GRAVE NEW\nWORLD', 'CARNIVAL\nOF BONES', 'STARFALL', 'MIDNIGHT\nEXPRESSWAY', 'IRON WIDOW', 'DEEP WATER\nPARK 3'];
const TAGLINES = ['THIS FALL, NO ONE SLEEPS', 'SOME DOORS SHOULD STAY SHUT', 'THE END IS ONLY THE BEGINNING', 'YOU CAN RUN', 'HE CAME BACK WRONG', 'THE CITY NEVER SAW IT COMING', 'SURVIVAL IS A CHOICE'];
const BANDS = ['THE RUSTED\nHALOS', 'VOLT\nMOTHERS', 'BLACK\nORCHARD', 'SAINT\nCATHODE', 'NEON\nCOYOTES', 'MARROW', 'GLASS JAW', 'THE STATIC\nKIDS', 'DOG TOOTH', 'PALE\nHORSES', 'LOW TIDE\nHYMNAL'];
const VENUES = ['LIVE AT THE ROXBURY', 'THE DEPOT · 9PM', 'PIER 9 HALL', 'NEWBURG ARENA', 'THE COPPER KETTLE'];
const MISSING_NAMES = ['DANA KOWALSKI', 'ELI MARSH', 'ROSA VEGA', 'THOMAS REID', 'MAYA OKAFOR', 'GRETA LUND', 'SAMUEL PRICE', 'LILY CHEN', 'JAMES "JIMMY" DOYLE'];
const FLYERS = [['LOST DOG', 'BUSTER', 'BROWN LAB · RED COLLAR', 'REWARD'], ['ROOM FOR RENT', '$450/MO', 'UTILITIES INCL.', 'NO PETS'], ['GUITAR LESSONS', 'ALL AGES', 'FIRST ONE FREE', 'CALL RICK'], ['YARD SALE', 'SAT 8AM', '41 HAWTHORNE', 'EVERYTHING GOES'], ['BAND NEEDS\nDRUMMER', 'PUNK/ROCK', 'OWN KIT', 'NO FLAKES'], ['PRAYER\nVIGIL', 'ST. JUDE', 'SUNDAY 7PM', 'ALL WELCOME']];

// Kinds: movie, concert, airline, evac, quarantine, missing, ad, health, flyer, notice
export const POSTER_KINDS = ['movie', 'concert', 'airline', 'evac', 'quarantine', 'missing', 'ad', 'health', 'flyer'];
export function posterCanvas(kind, o = {}) {
  const aspect = (o.w ?? 0.6) / (o.h ?? 0.9);
  const long = o.px ?? (kind === 'flyer' || kind === 'missing' ? 256 : 320);
  const W = Math.round(aspect >= 1 ? long : long * aspect), H = Math.round(aspect >= 1 ? long / aspect : long);
  const c = canvas(W, H), g = c.getContext('2d');
  const seed = (o.seed ?? 1) * 131 + hashStr(kind + (o.title ?? ''));
  const r = rngOf(seed);
  drawPoster(g, kind, W, H, r, o);
  age(g, W, H, r, { wet: o.wet ?? r() * 0.8, fade: o.fade ?? r() * 0.6, torn: o.torn ?? r() * 0.9, tape: o.tape ?? (kind === 'flyer' || kind === 'missing' ? 1 : r() < 0.5 ? 1 : 0), staples: o.staples ?? (r() < 0.6), grime: o.grime ?? 0.3 + r() * 0.5, creases: o.creases ?? r() < 0.6, vandal: o.vandal ?? (r() < 0.15) });
  return c;
}
function drawPoster(g, kind, W, H, r, o) {
  const m = Math.min(W, H) * 0.06;
  switch (kind) {
    case 'movie': {
      const hue = r() * 360;
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, `hsl(${hue},45%,${8 + r() * 10}%)`); gr.addColorStop(0.6, `hsl(${hue + 20},55%,${18 + r() * 14}%)`); gr.addColorStop(1, '#050505');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // key art
      const art = r();
      if (art < 0.4) { g.fillStyle = `hsla(${hue + 180},70%,70%,0.9)`; g.beginPath(); g.arc(W * 0.5, H * 0.34, W * 0.28, 0, Math.PI * 2); g.fill(); skyline(g, H * 0.58, W, '#050505', r, H * 0.2); silhouette(g, W * 0.5, H * 0.52, W * 0.35, '#050505'); }
      else if (art < 0.7) { silhouette(g, W * 0.5, H * 0.46, W * 0.9, `hsl(${hue},30%,6%)`); g.fillStyle = `hsla(${hue + 30},90%,60%,0.85)`; g.beginPath(); g.ellipse(W * 0.44, H * 0.3, W * 0.03, W * 0.015, 0, 0, 7); g.ellipse(W * 0.56, H * 0.3, W * 0.03, W * 0.015, 0, 0, 7); g.fill(); }
      else { g.fillStyle = 'rgba(255,255,255,0.08)'; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(W * 0.5, H * 0.55); g.lineTo(r() * W, 0); g.lineTo(r() * W, 0); g.fill(); } g.fillStyle = '#0a0a0a'; g.beginPath(); g.moveTo(W * 0.3, H * 0.6); g.lineTo(W * 0.5, H * 0.12); g.lineTo(W * 0.7, H * 0.6); g.fill(); }
      g.fillStyle = 'rgba(230,220,200,0.9)'; fitText(g, r.pick(TAGLINES), W / 2, m * 1.6, W - m * 2, H * 0.03, F_SANS, 'bold');
      const title = o.title ?? r.pick(MOVIES);
      const tc = r() < 0.5 ? '#e8dcc0' : `hsl(${hue + 180},80%,62%)`;
      g.save(); g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 6;
      textBlock(g, title.split('\n'), W / 2, H * 0.7, W - m * 2, H * 0.085, r() < 0.5 ? F_IMPACT : F_SERIF, tc, 1.05);
      g.restore();
      g.fillStyle = '#d8d0c0'; fitText(g, r.pick(['OCTOBER 13', 'COMING SOON', 'NOW PLAYING', 'HALLOWEEN']), W / 2, H * 0.86, W * 0.6, H * 0.03, F_SANS, 'bold');
      g.globalAlpha = 0.55; fineText(g, m, H * 0.9, W - m * 2, 3, Math.max(5, H * 0.012), '#c8c0b0', r, 'center'); g.globalAlpha = 1;
      g.strokeStyle = '#c8c0b0'; g.lineWidth = 1; g.strokeRect(W - m * 2.6, H - m * 1.6, m * 1.8, m * 1.1); g.fillStyle = '#c8c0b0'; fitText(g, 'R', W - m * 1.7, H - m * 0.75, m, m * 0.9, F_HEAVY);
      break;
    }
    case 'concert': {
      const bg = r.pick(['#e8d020', '#e85a1a', '#18a0a8', '#e8e0d0', '#d8284a', '#8ac83a']);
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      halftone(g, 0, 0, W, H * 0.6, 'rgba(0,0,0,0.25)', 9, r);
      const ink = lum(bg) > 0.5 ? '#141414' : '#f4f0e0';
      g.fillStyle = ink; g.save(); g.translate(W * 0.5, H * 0.3); g.rotate((r() - 0.5) * 0.2);
      for (let k = 0; k < 7; k++) { g.rotate(Math.PI * 2 / 7); g.fillRect(0, -2, W * 0.35, 4); }
      g.restore();
      let y = textBlock(g, (o.title ?? r.pick(BANDS)).split('\n'), W / 2, H * 0.5, W - m * 2, H * 0.11, F_IMPACT, ink, 0.98);
      g.fillStyle = ink; fitText(g, 'WITH ' + r.pick(BANDS).replace('\n', ' '), W / 2, y + H * 0.01, W - m * 2, H * 0.04, F_COND, 'bold');
      fitText(g, r.pick(['FRI OCT 14', 'SAT OCT 22', 'THU NOV 3']), W / 2, H * 0.82, W - m * 2, H * 0.06, F_HEAVY);
      fitText(g, r.pick(VENUES), W / 2, H * 0.89, W - m * 2, H * 0.035, F_SANS, 'bold');
      fitText(g, r.pick(['$12 AT THE DOOR · ALL AGES', '21+ · $8 ADV', 'FREE SHOW']), W / 2, H * 0.94, W - m * 2, H * 0.025, F_SANS, 'bold');
      break;
    }
    case 'airline': {
      const brand = o.title ?? r.pick(['FLY NEWBURG', 'SKYLINE AIR']);
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#2a6ab8'); gr.addColorStop(0.55, '#8ac0e8'); gr.addColorStop(1, '#f0d8a8');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      for (let k = 0; k < 5; k++) { const x = r() * W, y = H * (0.3 + r() * 0.3); g.beginPath(); g.ellipse(x, y, W * 0.2, H * 0.03, 0, 0, 7); g.fill(); }
      planeShape(g, W * 0.55, H * 0.35, W * 0.32, '#f4f4f4', -0.25);
      skyline(g, H * 0.78, W, '#34465a', r, H * 0.12);
      g.fillStyle = '#12305a'; g.fillRect(0, H * 0.78, W, H * 0.22);
      g.fillStyle = '#f4f0e0'; textBlock(g, brand.split(' '), W / 2, H * 0.14, W - m * 2, H * 0.075, F_HEAVY, '#ffffff', 1.0);
      g.fillStyle = '#ffd24a'; fitText(g, r.pick(['NOW 14 CITIES NONSTOP', 'THE SKY IS OPEN', 'WEEKEND ESCAPES']), W / 2, H * 0.86, W - m * 2, H * 0.04, F_SANS, 'bold');
      g.fillStyle = '#ffffff'; fitText(g, 'FROM $' + (79 + Math.floor(r() * 5) * 20), W / 2, H * 0.93, W - m * 2, H * 0.05, F_HEAVY);
      g.fillStyle = '#c8d8e8'; fitText(g, 'NEWBURG INTL · 1-800-555-0199', W / 2, H * 0.975, W - m * 2, H * 0.02, F_SANS, 'bold');
      break;
    }
    case 'evac': case 'notice': {
      g.fillStyle = '#ecebe4'; g.fillRect(0, 0, W, H);
      const hc = r.pick(['#1a4a8a', '#1a5a3a', '#8a1a14']);
      g.fillStyle = hc; g.fillRect(0, 0, W, H * 0.16);
      emblem(g, m * 2.2, H * 0.08, H * 0.055, '#f4f0e0', hc);
      g.fillStyle = '#f4f0e0'; fitText(g, 'CEDA', m * 4, H * 0.07, W * 0.5, H * 0.055, F_HEAVY, 'bold', 'left');
      fitText(g, 'PUBLIC HEALTH EMERGENCY', m * 4, H * 0.125, W - m * 5, H * 0.03, F_SANS, 'bold', 'left');
      g.fillStyle = '#141414';
      const head = o.title ?? r.pick(['EVACUATION\nNOTICE', 'EMERGENCY\nORDER', 'MANDATORY\nEVACUATION']);
      let y = textBlock(g, head.split('\n'), W / 2, H * 0.25, W - m * 2, H * 0.065, F_HEAVY, '#141414', 1.05);
      g.fillStyle = hc; g.fillRect(m, y - H * 0.03, W - m * 2, 2);
      const body = ['ALL RESIDENTS MUST REPORT TO THE', 'NEAREST EVACUATION CENTER', 'BRING ID · ONE BAG PER PERSON', 'DO NOT APPROACH INFECTED PERSONS'];
      y = textBlock(g, body, W / 2, y + H * 0.02, W - m * 2, H * 0.028, F_SANS, '#1a1a1a', 1.35);
      g.fillStyle = '#d8d4c8'; g.fillRect(m, y, W - m * 2, H * 0.2);
      g.strokeStyle = '#6a6a6a'; g.lineWidth = 1; g.strokeRect(m, y, W - m * 2, H * 0.2);
      g.strokeStyle = '#8a8a80'; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(m + r() * (W - m * 2), y); g.lineTo(m + r() * (W - m * 2), y + H * 0.2); g.stroke(); }
      g.strokeStyle = '#b81a14'; g.lineWidth = 3; g.beginPath(); g.moveTo(m * 2, y + H * 0.17); g.lineTo(W * 0.5, y + H * 0.1); g.lineTo(W - m * 2.5, y + H * 0.05); g.stroke();
      g.fillStyle = '#b81a14'; g.beginPath(); g.arc(W - m * 2.5, y + H * 0.05, 5, 0, 7); g.fill();
      fineText(g, m, y + H * 0.25, W - m * 2, 5, Math.max(5, H * 0.017), '#333', r);
      g.fillStyle = '#141414'; fitText(g, 'EVACUATION CENTER: ' + r.pick(['MERCY HOSPITAL', 'CITY STADIUM', 'NEWBURG HIGH']), W / 2, H * 0.93, W - m * 2, H * 0.026, F_SANS, 'bold');
      break;
    }
    case 'quarantine': {
      stripes(g, 0, 0, W, H, '#e0b820', '#141414', Math.max(8, W * 0.05));
      g.fillStyle = '#ecebe4'; g.fillRect(m * 1.5, m * 1.5, W - m * 3, H - m * 3);
      g.fillStyle = '#b81a14'; g.fillRect(m * 1.5, m * 1.5, W - m * 3, H * 0.14);
      g.fillStyle = '#ffffff'; fitText(g, 'WARNING', W / 2, m * 1.5 + H * 0.105, W - m * 4, H * 0.1, F_HEAVY);
      let y = textBlock(g, (o.title ?? r.pick(['QUARANTINE\nZONE', 'RESTRICTED\nAREA', 'MILITARY\nCHECKPOINT'])).split('\n'), W / 2, H * 0.36, W - m * 4, H * 0.1, F_HEAVY, '#141414', 1.0);
      textBlock(g, ['NO ENTRY BEYOND THIS POINT', 'DEADLY FORCE AUTHORIZED'], W / 2, y + H * 0.02, W - m * 4, H * 0.035, F_SANS, '#141414', 1.4);
      g.fillStyle = '#141414'; fitText(g, 'BY ORDER OF THE MILITARY GOVERNOR', W / 2, H - m * 2.6, W - m * 4, H * 0.025, F_SANS, 'bold');
      break;
    }
    case 'missing': {
      g.fillStyle = '#f2f0e8'; g.fillRect(0, 0, W, H);
      g.fillStyle = r() < 0.5 ? '#b81a14' : '#141414';
      fitText(g, r() < 0.3 ? 'HAVE YOU SEEN ME?' : 'MISSING', W / 2, H * 0.12, W - m * 2, H * 0.11, F_HEAVY);
      // photocopied photo
      const px = W * 0.2, py = H * 0.17, pw = W * 0.6, ph = H * 0.38;
      const gr = g.createLinearGradient(0, py, 0, py + ph); gr.addColorStop(0, '#9a9a94'); gr.addColorStop(1, '#5a5a56');
      g.fillStyle = gr; g.fillRect(px, py, pw, ph);
      silhouette(g, px + pw / 2, py + ph * 0.62, pw * 0.85, '#2a2a28');
      g.fillStyle = 'rgba(210,205,190,0.55)'; g.beginPath(); g.ellipse(px + pw / 2, py + ph * 0.36, pw * 0.13, ph * 0.18, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(20,20,20,0.35)'; for (let k = 0; k < 40; k++) g.fillRect(px + r() * pw, py + r() * ph, 1 + r() * 2, 1);
      g.strokeStyle = '#1a1a1a'; g.lineWidth = 1; g.strokeRect(px, py, pw, ph);
      const name = o.title ?? r.pick(MISSING_NAMES);
      g.fillStyle = '#141414'; fitText(g, name, W / 2, H * 0.62, W - m * 2, H * 0.06, F_HEAVY);
      textBlock(g, ['LAST SEEN OCT ' + (6 + Math.floor(r() * 8)) + ' NEAR ' + r.pick(['5TH & GRAND', 'HAWTHORNE ST', 'THE SUBWAY', 'MERCY HOSP.']), r.pick(['BROWN HAIR · RED JACKET', 'AGE 7 · BLUE BACKPACK', 'AGE 34 · GLASSES', 'AGE 16 · GREY HOODIE']), 'PLEASE CALL 555-0' + (100 + Math.floor(r() * 899))], W / 2, H * 0.69, W - m * 2, H * 0.03, F_SANS, '#1a1a1a', 1.35);
      // tear-off tabs
      const tabs = 8, tw = W / tabs;
      g.strokeStyle = '#6a6a6a'; g.setLineDash([2, 2]);
      g.beginPath(); g.moveTo(0, H * 0.84); g.lineTo(W, H * 0.84); g.stroke();
      for (let k = 1; k < tabs; k++) { g.beginPath(); g.moveTo(k * tw, H * 0.84); g.lineTo(k * tw, H); g.stroke(); }
      g.setLineDash([]);
      for (let k = 0; k < tabs; k++) {
        g.save(); g.translate(k * tw + tw / 2, H * 0.92); g.rotate(-Math.PI / 2); g.fillStyle = '#1a1a1a'; fitText(g, '555-0142', 0, 3, H * 0.14, tw * 0.5, F_SANS, 'bold'); g.restore();
      }
      // some tabs torn off
      g.save(); g.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < tabs; k++) if (r() < 0.45) g.fillRect(k * tw + 1, H * 0.84 + 1, tw - 1, H);
      g.restore();
      // handwritten addition
      if (r() < 0.5) { const L = layoutText(r.pick(['STILL MISSING', 'PLEASE!!', 'SEEN AT MERCY?', 'FOUND - NOT HER']), { x: W * 0.35, y: H * 0.145, w: W * 0.6, h: H * 0.045 }, HANDS.scrawl, r, { rot: -0.1 }); ink(g, L.strokes, { tool: 'marker', color: '#1a2a8a', width: 2 }, r); }
      break;
    }
    case 'ad': {
      const brands = [['KESSLER\nCOLA', 'ICE COLD SINCE 1931', '#b81a14', '#f4f0e0'], ['MERCY\nHOSPITAL', 'WE CARE. WE CURE.', '#1a4a7a', '#f4f4f0'], ['NEWBURG\nTRANSIT', 'GET THERE.', '#1a5a3a', '#f4f0e0'], ['DR. PATEL\nDENTAL', 'SMILE AGAIN', '#e8e4dc', '#1a3a6a'], ['LUCKY\nSTAR PAWN', 'CASH FOR GOLD', '#141414', '#ffd040']];
      const [bn, slogan, bg, fg] = o.brand ?? r.pick(brands);
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      const gr = g.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, W * 0.7); gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      if (bn.includes('COLA')) { g.fillStyle = '#e8e4dc'; g.fillRect(W * 0.38, H * 0.2, W * 0.24, H * 0.36); g.fillStyle = '#b81a14'; g.fillRect(W * 0.38, H * 0.28, W * 0.24, H * 0.18); g.fillStyle = '#a8a8a0'; g.fillRect(W * 0.38, H * 0.18, W * 0.24, H * 0.03); }
      else emblem(g, W / 2, H * 0.32, W * 0.18, fg, bg);
      textBlock(g, bn.split('\n'), W / 2, H * 0.68, W - m * 2, H * 0.09, F_HEAVY, fg, 1.0);
      g.fillStyle = fg; fitText(g, slogan, W / 2, H * 0.9, W - m * 2, H * 0.045, F_SANS, 'bold');
      break;
    }
    case 'health': {
      g.fillStyle = '#f0eee6'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#1a4a8a'; g.fillRect(0, 0, W, H * 0.22);
      g.fillStyle = '#ffffff'; textBlock(g, (o.title ?? r.pick(['STAY INSIDE', 'REPORT THE\nSICK', 'HELP IS\nCOMING'])).split('\n'), W / 2, H * 0.1, W - m * 2, H * 0.075, F_HEAVY, '#ffffff', 1.0);
      const items = r.pick([['FEVER', 'AGGRESSION', 'BLEEDING', 'CONFUSION'], ['LOCK DOORS', 'STAY QUIET', 'RATION WATER', 'LISTEN TO RADIO']]);
      items.forEach((t, k) => {
        const y = H * (0.3 + k * 0.13);
        g.fillStyle = '#1a4a8a'; g.beginPath(); g.arc(m * 2.4, y, H * 0.04, 0, 7); g.fill();
        g.fillStyle = '#ffffff'; fitText(g, String(k + 1), m * 2.4, y + H * 0.015, H * 0.06, H * 0.045, F_HEAVY);
        g.fillStyle = '#141414'; fitText(g, t, m * 4, y + H * 0.015, W - m * 5, H * 0.045, F_HEAVY, 'bold', 'left');
      });
      g.fillStyle = '#b81a14'; g.fillRect(0, H * 0.84, W, H * 0.16);
      g.fillStyle = '#ffffff'; fitText(g, 'EMERGENCY BROADCAST: AM 1040', W / 2, H * 0.93, W - m * 2, H * 0.04, F_SANS, 'bold');
      break;
    }
    case 'flyer': default: {
      const [a, b, c2, d] = o.lines ?? r.pick(FLYERS);
      g.fillStyle = r.pick(['#f2f0e8', '#f0e8a0', '#e8f0f8', '#f8e0e8']); g.fillRect(0, 0, W, H);
      let y = textBlock(g, a.split('\n'), W / 2, H * 0.14, W - m * 2, H * 0.1, F_HEAVY, '#141414', 1.0);
      g.strokeStyle = '#141414'; g.lineWidth = 1; g.strokeRect(W * 0.2, y - H * 0.04, W * 0.6, H * 0.26);
      g.fillStyle = '#b8b4a8'; g.fillRect(W * 0.2 + 1, y - H * 0.04 + 1, W * 0.6 - 2, H * 0.26 - 2);
      silhouette(g, W / 2, y + H * 0.13, W * 0.4, '#6a6a64');
      y += H * 0.3;
      textBlock(g, [b, c2, d], W / 2, y, W - m * 2, H * 0.05, F_SANS, '#141414', 1.3);
      const tabs = 7, tw = W / tabs;
      g.strokeStyle = '#6a6a6a'; g.setLineDash([2, 2]);
      for (let k = 1; k < tabs; k++) { g.beginPath(); g.moveTo(k * tw, H * 0.85); g.lineTo(k * tw, H); g.stroke(); }
      g.beginPath(); g.moveTo(0, H * 0.85); g.lineTo(W, H * 0.85); g.stroke(); g.setLineDash([]);
      for (let k = 0; k < tabs; k++) { g.save(); g.translate(k * tw + tw / 2, H * 0.925); g.rotate(-Math.PI / 2); g.fillStyle = '#1a1a1a'; fitText(g, '555-0' + (110 + k), 0, 3, H * 0.13, tw * 0.5, F_SANS, 'bold'); g.restore(); }
      g.save(); g.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < tabs; k++) if (r() < 0.4) g.fillRect(k * tw + 1, H * 0.85 + 1, tw - 1, H);
      g.restore();
    }
  }
}
// Paper aging: fading, wet blotches with tide lines, grime, creases, torn
// edges / corners (alpha), tape or staples, the odd scribble.
function age(g, W, H, r, a) {
  const s = Math.min(W, H);
  g.save();
  // sun fade
  if (a.fade > 0) { g.globalCompositeOperation = 'screen'; g.fillStyle = `rgba(210,200,170,${a.fade * 0.35})`; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
  // yellowing / wet blotches
  g.globalCompositeOperation = 'multiply';
  const blobs = Math.round(a.wet * 2.2);
  for (let k = 0; k < blobs; k++) {
    const x = r() * W, y = r() * H, rad = s * (0.25 + r() * 0.45);
    const gr = g.createRadialGradient(x, y, rad * 0.1, x, y, rad);
    gr.addColorStop(0, 'rgba(225,210,170,0.22)'); gr.addColorStop(0.9, 'rgba(215,195,150,0.3)'); gr.addColorStop(0.96, 'rgba(165,130,85,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  // grime gradient (bottom) and speckles
  const gg = g.createLinearGradient(0, H * 0.5, 0, H);
  gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(1, `rgba(150,140,120,${a.grime * 0.8})`);
  g.fillStyle = gg; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(110,100,85,0.5)';
  for (let k = 0; k < 150 * a.grime; k++) { const q = 0.5 + r() * 1.5; g.fillRect(r() * W, r() * H, q, q); }
  // ink run streaks when wet
  if (a.wet > 0.5) { g.fillStyle = 'rgba(120,110,95,0.25)'; for (let k = 0; k < 6; k++) { const x = r() * W; g.fillRect(x, r() * H * 0.5, 1 + r() * 2, H * (0.2 + r() * 0.4)); } }
  g.globalCompositeOperation = 'source-over';
  // creases
  if (a.creases) {
    for (const f of [0.33, 0.66]) {
      if (r() < 0.35) continue;
      const y = H * f + (r() - 0.5) * 6;
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + (r() - 0.5) * 4); g.stroke();
      g.strokeStyle = 'rgba(60,50,40,0.25)'; g.beginPath(); g.moveTo(0, y + 1.5); g.lineTo(W, y + 1.5 + (r() - 0.5) * 4); g.stroke();
    }
    if (r() < 0.5) { const x = W * 0.5 + (r() - 0.5) * 6; g.strokeStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.strokeStyle = 'rgba(60,50,40,0.2)'; g.beginPath(); g.moveTo(x + 1.5, 0); g.lineTo(x + 1.5, H); g.stroke(); }
  }
  // vandalism: a marker scribble / X / word
  if (a.vandal) {
    const L = layoutText(r.pick(['LIES', 'X', 'RIP', 'LIARS', 'NO', 'RUN', 'HA']), { x: W * (0.1 + r() * 0.4), y: H * (0.2 + r() * 0.5), w: W * 0.45, h: H * 0.13 }, HANDS.scrawl, r, { rot: (r() - 0.5) * 0.4 });
    ink(g, L.strokes, { tool: r() < 0.5 ? 'marker' : 'spray', color: r.pick(['#141414', '#b8201a', '#1a2a8a']), width: Math.max(2, L.size * 0.1), drips: 0.1 }, r);
  }
  // torn edges (alpha)
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  const jag = (x0, y0, x1, y1, depth) => {
    const n = 18, pts = [];
    for (let k = 0; k <= n; k++) { const t = k / n; pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]); }
    const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny); // inward normal (clockwise edges)
    g.beginPath(); g.moveTo(x0 - (nx / l) * 20, y0 - (ny / l) * 20);
    for (const [x, y] of pts) { const d = r() * depth; g.lineTo(x + (nx / l) * d, y + (ny / l) * d); }
    g.lineTo(x1 - (nx / l) * 20, y1 - (ny / l) * 20); g.closePath(); g.fill();
  };
  const d0 = 1 + a.torn * 3;
  jag(0, 0, W, 0, d0); jag(W, 0, W, H, d0); jag(W, H, 0, H, d0); jag(0, H, 0, 0, d0);
  if (a.torn > 0.35) {
    const nT = 1 + Math.floor(r() * 2 * a.torn);
    for (let k = 0; k < nT; k++) {
      const cx = r() < 0.5 ? 0 : W, cy = r() < 0.5 ? 0 : H;
      const rw = W * (0.15 + r() * 0.4 * a.torn), rh = H * (0.1 + r() * 0.35 * a.torn);
      g.beginPath(); g.moveTo(cx, cy);
      g.lineTo(cx + (cx ? -rw : rw), cy);
      const steps = 9;
      for (let q = 1; q < steps; q++) { const t = q / steps; g.lineTo(cx + (cx ? -1 : 1) * rw * (1 - t) + (r() - 0.5) * s * 0.04, cy + (cy ? -1 : 1) * rh * t + (r() - 0.5) * s * 0.04); }
      g.lineTo(cx, cy + (cy ? -rh : rh)); g.closePath(); g.fill();
    }
    if (a.torn > 0.75 && r() < 0.5) { // a big rip across the bottom
      g.beginPath(); g.moveTo(0, H); let y = H * (0.6 + r() * 0.25);
      for (let x = 0; x <= W; x += W / 12) { y += (r() - 0.45) * H * 0.05; g.lineTo(x, y); }
      g.lineTo(W, H); g.closePath(); g.fill();
    }
  }
  g.globalCompositeOperation = 'source-over';
  // tape / staples
  if (a.tape) {
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      if (r() < 0.3) continue;
      g.save(); g.translate(x + (x ? -1 : 1) * s * 0.06, y + (y ? -1 : 1) * s * 0.05); g.rotate((x ? -1 : 1) * (y ? -1 : 1) * (0.6 + (r() - 0.5) * 0.4));
      g.fillStyle = 'rgba(236,226,190,0.55)'; g.fillRect(-s * 0.1, -s * 0.03, s * 0.2, s * 0.06);
      g.strokeStyle = 'rgba(255,255,255,0.3)'; g.strokeRect(-s * 0.1, -s * 0.03, s * 0.2, s * 0.06);
      g.restore();
    }
  } else if (a.staples) {
    for (const [x, y] of [[s * 0.05, s * 0.05], [W - s * 0.05, s * 0.05], [s * 0.05, H - s * 0.05], [W - s * 0.05, H - s * 0.05]]) {
      if (r() < 0.25) continue;
      g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 0.6);
      g.fillStyle = 'rgba(40,40,40,0.4)'; g.fillRect(-5, 1, 10, 2);
      g.fillStyle = '#b8b8b0'; g.fillRect(-5, -1, 10, 2);
      g.restore();
    }
  }
  g.restore();
}
// Several overlapping posters/flyers + remnants of older torn posters and
// paste residue, composited on one canvas (one texture / draw call).
export function posterWallCanvas(o = {}) {
  const [W, H, ppm] = sizeFor(o.w ?? 2.4, o.h ?? 1.6, o.max ?? 512, 260);
  const c = canvas(W, H), g = c.getContext('2d');
  const r = rngOf((o.seed ?? 1) * 977 + 3);
  // paste residue / old fragments
  for (let k = 0; k < 12; k++) {
    g.save(); g.translate(r() * W, r() * H); g.rotate((r() - 0.5) * 0.1);
    g.fillStyle = r.pick(['rgba(236,232,220,0.8)', 'rgba(220,210,180,0.75)', 'rgba(184,40,30,0.6)', 'rgba(30,70,140,0.6)', 'rgba(230,200,40,0.65)', 'rgba(236,232,220,0.5)']);
    const w = ppm * (0.08 + r() * 0.3), h = ppm * (0.06 + r() * 0.25);
    g.beginPath(); g.moveTo(0, 0);
    for (let q = 1; q <= 6; q++) g.lineTo((w * q) / 6, (r() - 0.5) * ppm * 0.02);
    for (let q = 1; q <= 5; q++) g.lineTo(w + (r() - 0.5) * ppm * 0.03, (h * q) / 5);
    for (let q = 5; q >= 0; q--) g.lineTo((w * q) / 6 + (r() - 0.5) * ppm * 0.02, h + (r() - 0.5) * ppm * 0.04);
    g.closePath(); g.fill();
    g.restore();
  }
  const kinds = o.kinds ?? POSTER_KINDS;
  const n = o.count ?? Math.max(3, Math.round((W * H) / (ppm * ppm) * 4.5));
  const cols = Math.max(1, Math.round(Math.sqrt(n * W / H))), rows = Math.max(1, Math.ceil(n / cols));
  for (let k = 0; k < n; k++) {
    const kind = r.pick(kinds);
    const pw = (kind === 'flyer' || kind === 'missing' ? 0.24 + r() * 0.08 : 0.42 + r() * 0.2);
    const ph = pw * (kind === 'airline' && r() < 0.5 ? 0.7 : 1.45);
    const pc = posterCanvas(kind, { w: pw, h: ph, seed: (o.seed ?? 1) * 31 + k * 7, px: Math.round(Math.max(pw, ph) * ppm * 1.3), torn: 0.2 + r() * 0.8 * (1 - k / n) + 0.1 });
    g.save();
    g.translate(((k % cols) + 0.2 + r() * 0.6) * (W / cols), (Math.floor(k / cols) % rows + 0.25 + r() * 0.5) * (H / rows));
    g.rotate((r() - 0.5) * 0.12);
    g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 3; g.shadowOffsetY = 1;
    g.drawImage(pc, -pw * ppm / 2, -ph * ppm / 2, pw * ppm, ph * ppm);
    g.restore();
  }
  return c;
}

// ----------------------------------------------------------------- signs --
// Replacement renderer for kit.textTexture: printed/metal signs with rounded
// corners, inset borders, bolts, rust and dirt; illuminated channel letters
// for glowing text; painted lettering for plain text; legacy spray text.
// Light, unsaturated backgrounds read as printed paper notices.
export function isPaperColor(bg) {
  if (!bg) return false;
  const c = parseColor(bg);
  return lum(c) > 0.62 && Math.max(...c) - Math.min(...c) < 70;
}
export function signCanvas(text, o = {}) {
  const W = o.w ?? 512, H = o.h ?? 128;
  const c = canvas(W, H), g = c.getContext('2d');
  const r = rngOf(hashStr(text + JSON.stringify(o)));
  const lines = String(text).split('\n');
  const bg = o.bg, fg = o.fg ?? '#fff';
  const rad = bg ? Math.min(W, H) * 0.08 : 0;
  const bgc = bg ? parseColor(bg) : null;
  const light = bg ? lum(bgc) > 0.62 && Math.max(...bgc) - Math.min(...bgc) < 70 : false;
  const glow = !!o.glow;
  const plain = o.plain;
  if (bg) {
    // plate
    g.save();
    roundRect(g, 1, 1, W - 2, H - 2, rad);
    g.clip();
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.14)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.restore();
  }
  if (o.border) {
    const inset = Math.min(W, H) * 0.07;
    g.strokeStyle = o.border; g.lineWidth = Math.max(3, Math.min(W, H) * 0.035);
    roundRect(g, inset, inset, W - inset * 2, H - inset * 2, rad * 0.7); g.stroke();
  }
  // text
  let size = o.size ?? Math.floor(H * 0.6 / lines.length);
  const family = o.font ?? (bg ? (light ? F_SANS : F_HEAVY) : F_HEAVY);
  const weight = o.weight ?? 'bold';
  const setF = () => { g.font = `${weight} ${size}px ${family}`; };
  setF();
  if ('letterSpacing' in g) g.letterSpacing = bg && !light ? `${Math.max(0, Math.round(size * 0.03))}px` : '0px';
  for (const l of lines) while (g.measureText(l).width > W * (o.border ? 0.84 : 0.9) && size > 8) { size -= 2; setF(); }
  const lh = size * 1.12;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    const y = H / 2 + (i - (lines.length - 1) / 2) * lh;
    if (glow && !bg) {
      // illuminated channel letters: halo, dark return, lit face, hot core
      g.save();
      g.shadowColor = rgba(fg, 0.9); g.shadowBlur = size * 0.35;
      g.fillStyle = rgba(fg, 0.9); g.fillText(l, W / 2, y);
      g.shadowBlur = size * 0.12; g.fillText(l, W / 2, y);
      g.restore();
      g.lineWidth = Math.max(1.5, size * 0.035); g.strokeStyle = rgba(shade(fg, 0.45), 0.9); g.strokeText(l, W / 2, y);
      g.fillStyle = rgba(mixc(fg, [255, 255, 255], 0.55), 0.85);
      g.save(); g.scale(1, 0.94); g.fillText(l, W / 2, y / 0.94); g.restore();
    } else if (glow && bg) {
      g.save(); g.shadowColor = rgba(fg, 0.8); g.shadowBlur = size * 0.25;
      g.fillStyle = fg; g.fillText(l, W / 2, y); g.restore();
      g.fillStyle = rgba(mixc(fg, [255, 255, 255], 0.35), 1); g.fillText(l, W / 2, y);
    } else if (!bg && !plain) {
      // painted / cast letters: shadow, extrusion, gradient face
      const col = parseColor(fg);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(l, W / 2 + size * 0.04, y + size * 0.05);
      g.fillStyle = rgba(shade(col, 0.55), 1); g.fillText(l, W / 2 + size * 0.02, y + size * 0.025);
      const gr = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
      gr.addColorStop(0, rgba(mixc(col, [255, 255, 255], 0.25), 1)); gr.addColorStop(1, rgba(shade(col, 0.8), 1));
      g.fillStyle = gr; g.fillText(l, W / 2, y);
    } else {
      g.fillStyle = fg; g.fillText(l, W / 2, y);
    }
  });
  if ('letterSpacing' in g) g.letterSpacing = '0px';
  if (o.clean) return c;
  if (o.paper) {
    age(g, W, H, r, { wet: r() * 0.6, fade: r() * 0.4, torn: 0.25 + r() * 0.1, tape: r() < 0.6, staples: true, grime: 0.25 + r() * 0.3, creases: r() < 0.7, vandal: false });
    return c;
  }
  // weathering
  g.save();
  if (bg) { roundRect(g, 1, 1, W - 2, H - 2, rad); g.clip(); }
  g.globalCompositeOperation = 'source-atop';
  // dirt speckle + rain streaks + faded patches
  for (let k = 0; k < (W * H) / 900; k++) { g.fillStyle = `rgba(40,32,24,${0.05 + r() * 0.15})`; const q = 0.5 + r() * 2; g.fillRect(r() * W, r() * H, q, q); }
  for (let k = 0; k < W / 40; k++) { const x = r() * W; const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(50,40,30,0.18)'); gr.addColorStop(1, 'rgba(50,40,30,0)'); g.fillStyle = gr; g.fillRect(x, 0, 1 + r() * 3, H * (0.3 + r() * 0.7)); }
  const gg = g.createLinearGradient(0, 0, 0, H); gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(1, `rgba(40,30,20,${glow ? 0.08 : 0.22})`);
  g.fillStyle = gg; g.fillRect(0, 0, W, H);
  if (!glow) for (let k = 0; k < 3; k++) { const x = r() * W, y = r() * H, rr = Math.min(W, H) * (0.3 + r() * 0.6); const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(255,250,235,0.14)'); gr.addColorStop(1, 'rgba(255,250,235,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  // scratches
  g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 1;
  for (let k = 0; k < 4; k++) { const x = r() * W, y = r() * H, a = r() * Math.PI; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * W * 0.08, y + Math.sin(a) * H * 0.3); g.stroke(); }
  g.restore();
  if (bg && !light && !glow && H >= 40) {
    // bolts with rust runs
    for (const x of W > H * 2.5 ? [H * 0.16, W - H * 0.16] : [H * 0.16, W - H * 0.16]) for (const y of H > 90 ? [H * 0.16, H * 0.84] : [H * 0.5]) {
      const br = Math.max(2, Math.min(W, H) * 0.035);
      const gr = g.createLinearGradient(0, y, 0, y + H * 0.4); gr.addColorStop(0, 'rgba(120,60,20,0.45)'); gr.addColorStop(1, 'rgba(120,60,20,0)');
      g.fillStyle = gr; g.fillRect(x - br * 0.5, y, br, H * 0.4);
      g.fillStyle = '#8a8a84'; g.beginPath(); g.arc(x, y, br, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(x - br * 0.3, y - br * 0.3, br * 0.35, 0, 7); g.fill();
    }
  } else if (bg && light && !glow && r() < 0.6) {
    // paper/plastic notice: tape at the top corners
    for (const x of [W * 0.06, W * 0.94]) { g.save(); g.translate(x, H * 0.05); g.rotate((x < W / 2 ? -1 : 1) * 0.5); g.fillStyle = 'rgba(236,226,190,0.6)'; g.fillRect(-H * 0.12, -H * 0.04, H * 0.24, H * 0.08); g.restore(); }
  }
  return c;
}
function roundRect(g, x, y, w, h, rr) {
  rr = Math.min(rr, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y); g.lineTo(x + w - rr, y); g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr); g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h); g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr); g.quadraticCurveTo(x, y, x + rr, y); g.closePath();
}

// ------------------------------------------------------ texture caching --
// Canvas textures + materials are cached by key for the level being built and
// disposed when the next level starts building (the old level is gone).
let scopeOwner = null;
const texCache = new Map();
const matCache = new Map();
export function artScope(L) {
  const owner = L?.game?.level ?? L ?? null;
  if (owner && owner !== scopeOwner) {
    if (scopeOwner) {
      for (const t of texCache.values()) t.dispose();
      for (const m of matCache.values()) m.dispose();
      texCache.clear();
      matCache.clear();
    }
    scopeOwner = owner;
  }
}
export function artTexture(key, draw, o = {}) {
  let t = texCache.get(key);
  if (t) return t;
  const c = draw();
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = o.anisotropy ?? 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  texCache.set(key, t);
  return t;
}
// kind: 'decal' (soft alpha, blended), 'paper' (alpha-tested cutout), 'sign'
export function artMaterial(key, tex, kind, o = {}) {
  const mk = key + '|' + kind + '|' + (o.glow ?? 0) + '|' + (o.transparent ? 1 : 0);
  let m = matCache.get(mk);
  if (m) return m;
  const base = { map: tex, polygonOffset: true, polygonOffsetFactor: o.offset ?? -2, polygonOffsetUnits: o.offset ?? -2 };
  if (kind === 'decal') m = new THREE.MeshStandardMaterial({ ...base, transparent: true, depthWrite: false, roughness: o.roughness ?? 0.62, metalness: 0, alphaTest: 0.01 });
  else if (kind === 'paper') m = new THREE.MeshStandardMaterial({ ...base, alphaTest: 0.5, roughness: o.roughness ?? 0.82, metalness: 0 });
  else m = new THREE.MeshStandardMaterial({ ...base, transparent: !!o.transparent, alphaTest: o.transparent ? 0.01 : 0.5, depthWrite: !o.transparent, roughness: o.roughness ?? 0.6, metalness: o.metalness ?? 0, emissive: o.glow ? 0xffffff : 0x000000, emissiveMap: o.glow ? tex : null, emissiveIntensity: o.glow ?? 0 });
  matCache.set(mk, m);
  return m;
}
export function artStats() { return { textures: texCache.size, materials: matCache.size }; }
