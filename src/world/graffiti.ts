import { RNG } from '../core/math';

/**
 * Procedural street art, painted into transparent canvases that overlay wall textures (the paint
 * takes on the bricks' light and shade in the shader, and blood goes on top of it).
 *
 * Everything is drawn the way it's painted: pieces in layers (cloud, 3D, outline, fill with fades
 * and patterns, shines, drips, overspray), throw-ups in two colours, hand-style tags with
 * flourishes, stencils with their bridges and a soft spray edge, wheat-pasted posters torn back to
 * the ones underneath, grey buffs over old tags, and the grime of the street over all of it.
 */

type Ctx = CanvasRenderingContext2D;
const DISPLAY = "'Anton', Impact, 'Arial Black', sans-serif";
const HAND = "'Barlow Condensed', 'Arial Narrow', sans-serif";

export const PALETTES: { fill: string[]; outline: string; d3: string; cloud: string }[] = [
  { fill: ['#ff3d9a', '#ff9ad0', '#ffd6ec'], outline: '#14081a', d3: '#5a1a6a', cloud: '#3ad6ff' },
  { fill: ['#b8ff3a', '#f6ff6a', '#ffffff'], outline: '#0a1408', d3: '#1a4a1a', cloud: '#14181a' },
  { fill: ['#ff6a1a', '#ffb02a', '#ffe85a'], outline: '#1a0a06', d3: '#7a1a0a', cloud: '#2a2a8a' },
  { fill: ['#2ab8ff', '#9ae6ff', '#ffffff'], outline: '#06122a', d3: '#123a8a', cloud: '#ffd22a' },
  { fill: ['#2ae0b0', '#9affd8', '#e8fff4'], outline: '#04140e', d3: '#0a4a3a', cloud: '#ff4a6a' },
  { fill: ['#e0e4e8', '#a8b0b8', '#f8fbff'], outline: '#050505', d3: '#2a3036', cloud: '#c8202a' },
  { fill: ['#a03aff', '#d08aff', '#ffe0ff'], outline: '#0c0414', d3: '#2a0a4a', cloud: '#ffb81a' },
  { fill: ['#ff2a2a', '#ff7a3a', '#ffd0a0'], outline: '#100404', d3: '#3a0606', cloud: '#f0f0f0' },
];
const WORDS = ['KAOS', 'RIOT', 'SKUM', 'VNDL', 'REKT', 'ZERO', 'NOIZ', 'BRUTE', 'GHOST', 'KINGS', 'SLAM', 'HAVOK', 'STAB', 'BLOK', 'FURY', 'DREG', 'NERV'];
const TAGS = ['REKS', 'ZOOT', 'MEZ', 'JKR', 'SKET', 'OKER', 'DEMS', 'VIZE', 'TOXIC', 'KR8', 'NOK', 'SIRE', 'LEWD', 'BEAR', 'OMEN', 'FRAK', 'DUST', 'HAZE'];
const CREWS = ['KX', 'TDS', 'NSK', 'ACB', 'MKS', '13', 'GBK', 'RVL'];

// ============================================================================ spray basics
function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
/** Fine overspray speckle around a box. */
function speckle(x: Ctx, r: RNG, cx: number, cy: number, rw: number, rh: number, color: string, n: number, a = 0.35) {
  x.fillStyle = rgba(color, a);
  for (let i = 0; i < n; i++) {
    const ang = r.next() * Math.PI * 2, d = Math.sqrt(r.next());
    const s = 0.6 + r.next() * 1.6;
    x.fillRect(cx + Math.cos(ang) * rw * d, cy + Math.sin(ang) * rh * d, s, s);
  }
}
/** A run of paint: a thin line down from (px, py) ending in a bead. */
export function drip(x: Ctx, r: RNG, px: number, py: number, len: number, w: number, color: string) {
  x.strokeStyle = color;
  x.fillStyle = color;
  x.lineCap = 'round';
  x.lineWidth = w;
  x.beginPath();
  x.moveTo(px, py);
  const wob = w * 0.4;
  x.quadraticCurveTo(px + (r.next() - 0.5) * wob, py + len * 0.5, px + (r.next() - 0.5) * wob, py + len);
  x.stroke();
  x.beginPath();
  x.arc(px, py + len, w * 0.75, 0, Math.PI * 2);
  x.fill();
}

// ============================================================================ pieces
/** Letters are drawn this much wider than the (condensed) display face. */
const STRETCH = 1.28;
function letterPositions(x: Ctx, word: string, h: number, r: RNG) {
  x.font = `400 ${h}px ${DISPLAY}`;
  const out: { ch: string; x: number; rot: number; dy: number; s: number; w: number }[] = [];
  let cx = 0;
  for (const ch of word) {
    const w = x.measureText(ch).width * STRETCH;
    out.push({ ch, x: cx + w / 2, rot: (r.next() - 0.5) * 0.24, dy: (r.next() - 0.5) * h * 0.12, s: 0.9 + r.next() * 0.22, w });
    cx += w * (0.82 + r.next() * 0.08);
  }
  return { letters: out, width: cx };
}

/**
 * A full-colour piece: bubbled letters overlapping in a run, a cloud or sparkles behind, 3D,
 * a thick outline with overspray, a faded or patterned fill, shines and drips.
 */
export function piece(x: Ctx, r: RNG, word: string, cx: number, cy: number, h: number, pal = PALETTES[0]) {
  const { letters, width } = letterPositions(x, word, h, r);
  const fat = h * 0.15;
  const ow = h * 0.07;
  const x0 = cx - width / 2;
  const base = cy + h * 0.36;
  const d3 = { dx: h * 0.022 * (r.next() < 0.5 ? 1 : -1), dy: h * 0.022, n: 5 };
  // ---- behind: a bubble cloud, or a burst of sparkles
  if (r.next() < 0.6) {
    x.save();
    const blobs: [number, number, number][] = [];
    for (let i = 0; i < 9; i++) blobs.push([x0 + (i / 8) * width, cy - h * 0.05 + (r.next() - 0.5) * h * 0.4, h * (0.32 + r.next() * 0.3)]);
    for (const pass of [0, 1]) {
      x.fillStyle = pass === 0 ? pal.outline : pal.cloud;
      for (const [bx, by, br] of blobs) {
        x.beginPath();
        x.arc(bx, by, br + (pass === 0 ? ow * 0.8 : 0), 0, Math.PI * 2);
        x.fill();
      }
    }
    x.restore();
  }
  const gradFor = (lx: number) => {
    const style = r.next();
    const g = x.createLinearGradient(lx, base - h, lx, base);
    if (style < 0.45) {
      g.addColorStop(0, pal.fill[2]);
      g.addColorStop(0.35, pal.fill[1]);
      g.addColorStop(1, pal.fill[0]);
    } else {
      // a hard split across the letters
      g.addColorStop(0, pal.fill[1]);
      g.addColorStop(0.5, pal.fill[1]);
      g.addColorStop(0.5, pal.fill[0]);
      g.addColorStop(1, pal.fill[0]);
    }
    return g;
  };
  const shapes: { L: (typeof letters)[0]; tx: number }[] = letters.map((L) => ({ L, tx: x0 + L.x }));
  const drawLetter = (L: (typeof letters)[0], tx: number, ox: number, oy: number, mode: 'fill' | 'stroke', lw: number, style: string | CanvasGradient | CanvasPattern) => {
    x.save();
    x.translate(tx + ox, base + L.dy + oy);
    x.rotate(L.rot);
    x.scale(L.s * STRETCH, L.s);
    x.font = `400 ${h}px ${DISPLAY}`;
    x.textAlign = 'center';
    x.textBaseline = 'alphabetic';
    x.lineJoin = 'round';
    x.lineCap = 'round';
    if (mode === 'stroke') {
      x.lineWidth = lw;
      x.strokeStyle = style;
      x.strokeText(L.ch, 0, 0);
    } else {
      x.fillStyle = style;
      x.fillText(L.ch, 0, 0);
    }
    x.restore();
  };
  // ---- 3D block under everything
  for (const { L, tx } of shapes)
    for (let k = d3.n; k >= 1; k--) {
      drawLetter(L, tx, d3.dx * k, d3.dy * k, 'stroke', fat + ow * 2, pal.d3);
      drawLetter(L, tx, d3.dx * k, d3.dy * k, 'fill', 0, pal.d3);
    }
  // ---- per letter: overspray halo, outline, fattened fill (later letters overlap earlier ones)
  const stripes = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 24;
    const p = c.getContext('2d')!;
    p.fillStyle = pal.fill[0];
    p.fillRect(0, 0, 24, 24);
    p.strokeStyle = pal.fill[2];
    p.lineWidth = 5;
    p.beginPath();
    p.moveTo(-6, 30);
    p.lineTo(30, -6);
    p.stroke();
    return x.createPattern(c, 'repeat')!;
  })();
  const patterned = r.next() < 0.3;
  for (const { L, tx } of shapes) {
    x.save();
    x.shadowColor = rgba(pal.outline, 0.55);
    x.shadowBlur = h * 0.05;
    drawLetter(L, tx, 0, 0, 'stroke', fat + ow * 2, pal.outline);
    x.restore();
    const fillStyle = patterned ? stripes : gradFor(tx);
    drawLetter(L, tx, 0, 0, 'stroke', fat, fillStyle);
    drawLetter(L, tx, 0, 0, 'fill', 0, fillStyle);
    // a thin inner keyline
    drawLetter(L, tx, 0, 0, 'stroke', Math.max(1, h * 0.012), rgba('#ffffff', 0.35));
  }
  // ---- shines: short white strokes high on the left of each letter
  x.strokeStyle = 'rgba(255,255,255,0.92)';
  x.lineCap = 'round';
  for (const { L, tx } of shapes) {
    if (r.next() < 0.25) continue;
    const sx = tx - L.w * 0.22, sy = base + L.dy - h * 0.72;
    x.lineWidth = h * 0.035;
    x.beginPath();
    x.moveTo(sx, sy + h * 0.12);
    x.lineTo(sx, sy);
    x.stroke();
    x.lineWidth = h * 0.03;
    x.beginPath();
    x.arc(sx, sy - h * 0.06, h * 0.012, 0, Math.PI * 2);
    x.stroke();
  }
  // ---- sparkles and bubbles around
  for (let i = 0; i < 4; i++) star(x, x0 + r.next() * width, cy - h * (0.5 + r.next() * 0.3), h * (0.06 + r.next() * 0.06), '#ffffff');
  // ---- drips off the bottom
  for (const { L, tx } of shapes) {
    if (r.next() < 0.55) continue;
    drip(x, r, tx + (r.next() - 0.5) * L.w * 0.5, base + L.dy + fat * 0.3, h * (0.15 + r.next() * 0.45), Math.max(1.5, h * 0.018), pal.fill[0]);
  }
  speckle(x, r, cx, cy, width * 0.6, h * 0.7, pal.fill[0], Math.round(width * 0.6), 0.25);
  speckle(x, r, cx, cy, width * 0.62, h * 0.75, pal.outline, Math.round(width * 0.4), 0.3);
  return { x0: x0 - fat, x1: x0 + width + fat, y0: base - h * 1.15, y1: base + fat };
}

/** Four-point sparkle. */
function star(x: Ctx, cx: number, cy: number, s: number, color: string) {
  x.fillStyle = color;
  x.beginPath();
  x.moveTo(cx, cy - s);
  x.quadraticCurveTo(cx, cy, cx + s, cy);
  x.quadraticCurveTo(cx, cy, cx, cy + s);
  x.quadraticCurveTo(cx, cy, cx - s, cy);
  x.quadraticCurveTo(cx, cy, cx, cy - s);
  x.fill();
}

/** A cartoon head beside a piece: grin, big eyes, cap. */
export function character(x: Ctx, r: RNG, cx: number, cy: number, s: number, pal = PALETTES[0]) {
  const skin = r.pick(['#ffd23a', '#8af06a', '#ff8ab0', '#9ad8ff', '#f0f0f0']);
  x.save();
  x.lineJoin = 'round';
  // head
  x.fillStyle = pal.outline;
  x.beginPath();
  x.ellipse(cx, cy, s * 0.62, s * 0.58, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = skin;
  x.beginPath();
  x.ellipse(cx, cy, s * 0.55, s * 0.51, 0, 0, Math.PI * 2);
  x.fill();
  // cap
  x.fillStyle = pal.fill[0];
  x.strokeStyle = pal.outline;
  x.lineWidth = s * 0.06;
  x.beginPath();
  x.ellipse(cx, cy - s * 0.3, s * 0.56, s * 0.3, 0, Math.PI, 0);
  x.closePath();
  x.fill();
  x.stroke();
  x.beginPath();
  x.ellipse(cx + s * 0.42, cy - s * 0.3, s * 0.42, s * 0.09, -0.15, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  // eyes
  for (const sx of [-1, 1]) {
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.ellipse(cx + sx * s * 0.2, cy - s * 0.02, s * 0.15, s * 0.18, 0, 0, Math.PI * 2);
    x.fill();
    x.lineWidth = s * 0.04;
    x.stroke();
    x.fillStyle = '#0a0a0a';
    x.beginPath();
    x.arc(cx + sx * s * 0.2 + s * 0.04, cy, s * 0.07, 0, Math.PI * 2);
    x.fill();
    // angry brow
    x.lineWidth = s * 0.07;
    x.beginPath();
    x.moveTo(cx + sx * s * 0.34, cy - s * 0.22);
    x.lineTo(cx + sx * s * 0.08, cy - s * 0.14);
    x.stroke();
  }
  // grin with teeth
  x.fillStyle = '#1a0a0a';
  x.beginPath();
  x.moveTo(cx - s * 0.3, cy + s * 0.2);
  x.quadraticCurveTo(cx, cy + s * 0.5, cx + s * 0.32, cy + s * 0.16);
  x.closePath();
  x.fill();
  x.stroke();
  x.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) x.fillRect(cx - s * 0.22 + i * s * 0.12, cy + s * 0.2, s * 0.08, s * 0.08);
  x.restore();
  drip(x, r, cx - s * 0.1, cy + s * 0.55, s * 0.4, Math.max(1.5, s * 0.03), skin);
}

/** A throw-up: two or three fat letters, one fill, a heavy outline, done in a minute. */
export function throwUp(x: Ctx, r: RNG, word: string, cx: number, cy: number, h: number) {
  const fill = r.pick(['#e8eaee', '#f4f0e0', '#ffe14a', '#b8bcc4', '#ff5a8a', '#6ae8ff']);
  const outl = r.pick(['#0a0a0a', '#1a1a5a', '#5a0a1a', '#0a3a1a']);
  const { letters, width } = letterPositions(x, word, h, r);
  const x0 = cx - width / 2, base = cy + h * 0.38;
  const fat = h * 0.3;
  for (const pass of [0, 1, 2]) {
    for (const L of letters) {
      x.save();
      x.translate(x0 + L.x, base + L.dy);
      x.rotate(L.rot * 1.4);
      x.scale(STRETCH, 1);
      x.font = `400 ${h}px ${DISPLAY}`;
      x.textAlign = 'center';
      x.lineJoin = 'round';
      if (pass === 0) {
        x.lineWidth = fat + h * 0.12;
        x.strokeStyle = outl;
        x.strokeText(L.ch, 0, 0);
      } else if (pass === 1) {
        x.lineWidth = fat;
        x.strokeStyle = fill;
        x.strokeText(L.ch, 0, 0);
        x.fillStyle = fill;
        x.fillText(L.ch, 0, 0);
      } else {
        x.lineWidth = Math.max(1.5, h * 0.025);
        x.strokeStyle = rgba(outl, 0.6);
        x.strokeText(L.ch, 0, 0);
      }
      x.restore();
    }
  }
  for (let i = 0; i < 3; i++) if (r.next() < 0.7) drip(x, r, x0 + r.next() * width, base + fat * 0.4, h * (0.2 + r.next() * 0.5), Math.max(1.5, h * 0.03), fill);
  speckle(x, r, cx, cy, width * 0.55, h * 0.6, outl, Math.round(width * 0.3), 0.3);
}

/**
 * A hand-style tag: a name in a fast marker hand, skewed and jittered, with a swoosh, a crown or a
 * halo, sometimes the crew underneath, sometimes drips where the can sat too long.
 */
export function tag(x: Ctx, r: RNG, cx: number, cy: number, h: number, color?: string) {
  const col = color ?? r.pick(['#0a0a0a', '#0a0a0a', '#e8e8e8', '#c8202a', '#2a5ae8', '#d8d040', '#18a050', '#a03ae0', '#ffffff']);
  const name = r.pick(TAGS);
  x.save();
  x.translate(cx, cy);
  x.transform(1, 0, -0.35 + r.next() * 0.2, 1, 0, 0);
  x.rotate((r.next() - 0.5) * 0.25);
  x.font = `italic 800 ${h}px ${HAND}`;
  x.textBaseline = 'alphabetic';
  x.fillStyle = col;
  x.strokeStyle = col;
  let px = 0;
  const step: number[] = [];
  for (const ch of name) {
    const w = x.measureText(ch).width;
    x.save();
    x.translate(px, (r.next() - 0.5) * h * 0.18);
    x.rotate((r.next() - 0.5) * 0.3);
    x.scale(1, 1 + (r.next() - 0.3) * 0.5);
    x.fillText(ch, 0, 0);
    x.restore();
    step.push(px);
    px += w * (0.78 + r.next() * 0.1);
  }
  // the flourish: an underline swoosh with an arrow, a crown, or a halo
  x.lineWidth = Math.max(1.2, h * 0.07);
  x.lineCap = 'round';
  const k = r.next();
  if (k < 0.45) {
    x.beginPath();
    x.moveTo(-h * 0.2, h * 0.18);
    x.bezierCurveTo(px * 0.3, h * 0.45, px * 0.7, h * 0.05, px + h * 0.4, h * 0.12);
    x.stroke();
    x.beginPath();
    x.moveTo(px + h * 0.2, h * 0.0);
    x.lineTo(px + h * 0.42, h * 0.12);
    x.lineTo(px + h * 0.22, h * 0.26);
    x.stroke();
  } else if (k < 0.7) {
    const c0 = step[0] ?? 0;
    x.beginPath();
    x.moveTo(c0, -h * 0.85);
    x.lineTo(c0 + h * 0.1, -h * 1.15);
    x.lineTo(c0 + h * 0.22, -h * 0.92);
    x.lineTo(c0 + h * 0.34, -h * 1.2);
    x.lineTo(c0 + h * 0.46, -h * 0.85);
    x.closePath();
    x.stroke();
  } else if (k < 0.85) {
    x.beginPath();
    x.ellipse(px * 0.5, -h * 1.05, px * 0.35, h * 0.12, 0, 0, Math.PI * 2);
    x.stroke();
  }
  if (r.next() < 0.35) {
    x.font = `italic 800 ${h * 0.45}px ${HAND}`;
    x.fillText(r.pick(CREWS), px * 0.15, h * 0.62);
  }
  x.restore();
  if (r.next() < 0.4) for (let i = 0; i < 2; i++) drip(x, r, cx + r.next() * px * 0.9, cy + h * 0.05, h * (0.3 + r.next() * 0.8), Math.max(1, h * 0.05), col);
  return px;
}

/** A scribble: a fast illegible signature in loops, the way a hand tags in a hurry. */
export function scribble(x: Ctx, r: RNG, cx: number, cy: number, w: number, h: number, color: string) {
  x.save();
  x.strokeStyle = color;
  x.lineWidth = Math.max(1.2, h * 0.07);
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.translate(cx, cy);
  x.transform(1, 0, -0.3, 1, 0, 0);
  x.beginPath();
  x.moveTo(0, 0);
  let px = 0;
  const n = 4 + Math.floor(r.next() * 5);
  const step = w / n;
  for (let i = 0; i < n; i++) {
    const tall = r.next() < 0.3 ? 1.6 : 0.7 + r.next() * 0.5;
    const lh = h * tall;
    // up and over into a loop, down to the baseline, on to the next
    x.bezierCurveTo(px + step * 0.1, -lh * 0.6, px + step * 0.9, -lh * 1.05, px + step * 0.55, -lh);
    x.bezierCurveTo(px + step * 0.2, -lh * 0.95, px + step * 0.3, -lh * 0.2, px + step, 0);
    px += step;
  }
  x.lineTo(px + step * 0.6, -h * 0.15);
  x.stroke();
  // a dot, or a slash through it
  if (r.next() < 0.5) {
    x.beginPath();
    x.moveTo(-step * 0.2, -h * 0.5);
    x.lineTo(px + step * 0.3, -h * 0.7);
    x.stroke();
  }
  x.restore();
}

/**
 * A stencil: sharp edges with a soft overspray halo; text stencils keep their bridges.
 */
export function stencil(x: Ctx, r: RNG, cx: number, cy: number, s: number, color = '#0c0c0c') {
  const c = document.createElement('canvas');
  const S = Math.ceil(s * 2.6);
  c.width = c.height = S;
  const p = c.getContext('2d')!;
  p.fillStyle = color;
  p.strokeStyle = color;
  const kind = r.next();
  const m = S / 2;
  if (kind < 0.35) {
    // skull
    p.beginPath();
    p.ellipse(m, m - s * 0.12, s * 0.62, s * 0.58, 0, 0, Math.PI * 2);
    p.fill();
    p.fillRect(m - s * 0.36, m + s * 0.2, s * 0.72, s * 0.4);
    p.globalCompositeOperation = 'destination-out';
    for (const sx of [-1, 1]) {
      p.beginPath();
      p.ellipse(m + sx * s * 0.24, m - s * 0.08, s * 0.17, s * 0.2, sx * 0.3, 0, Math.PI * 2);
      p.fill();
    }
    p.beginPath();
    p.moveTo(m, m + s * 0.08);
    p.lineTo(m - s * 0.08, m + s * 0.24);
    p.lineTo(m + s * 0.08, m + s * 0.24);
    p.fill();
    for (let i = -1; i <= 2; i++) p.fillRect(m - s * 0.05 + i * s * 0.16 - s * 0.08, m + s * 0.4, s * 0.04, s * 0.22);
    p.globalCompositeOperation = 'source-over';
  } else if (kind < 0.55) {
    // crown
    p.beginPath();
    p.moveTo(m - s * 0.7, m + s * 0.4);
    p.lineTo(m - s * 0.7, m - s * 0.4);
    p.lineTo(m - s * 0.35, m);
    p.lineTo(m, m - s * 0.6);
    p.lineTo(m + s * 0.35, m);
    p.lineTo(m + s * 0.7, m - s * 0.4);
    p.lineTo(m + s * 0.7, m + s * 0.4);
    p.closePath();
    p.fill();
    p.fillRect(m - s * 0.7, m + s * 0.5, s * 1.4, s * 0.14);
  } else {
    // words, with the stencil's bridges cut through them
    const words = r.pick(['NO SLEEP', 'STAY LOW', 'THEY WATCH', 'FIGHT BACK', 'DEAD END', 'NOBODY COMES', 'POST NO BILLS', 'KEEP OUT', 'RUN']);
    const lines = words.split(' ');
    const fs = (s * 1.1) / lines.length;
    p.font = `400 ${fs}px ${DISPLAY}`;
    p.textAlign = 'center';
    p.textBaseline = 'middle';
    lines.forEach((l, i) => {
      const w = p.measureText(l).width;
      const k = Math.min(1, (S * 0.92) / w);
      p.save();
      p.translate(m, m + (i - (lines.length - 1) / 2) * fs * 1.02);
      p.scale(k, 1);
      p.fillText(l, 0, 0);
      p.restore();
    });
    p.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 14; i++) p.fillRect(r.next() * S, 0, Math.max(1, s * 0.025), S);
    p.globalCompositeOperation = 'source-over';
  }
  x.save();
  x.globalAlpha = 0.85 + r.next() * 0.15;
  x.shadowColor = rgba(color, 0.6);
  x.shadowBlur = s * 0.08;
  x.translate(cx, cy);
  x.rotate((r.next() - 0.5) * 0.15);
  x.drawImage(c, -m, -m);
  x.restore();
  speckle(x, r, cx, cy, s * 0.9, s * 0.8, color, Math.round(s * 1.5), 0.25);
}

/** Wheat-pasted posters, layered, peeling, torn back to the ones beneath. */
export function poster(x: Ctx, r: RNG, px: number, py: number, w: number, h: number) {
  const layers = 1 + Math.floor(r.next() * 3);
  for (let L = 0; L < layers; L++) {
    const ox = (r.next() - 0.5) * w * 0.3, oy = (r.next() - 0.5) * h * 0.2;
    const paper = r.pick(['#e8dfc8', '#f0e8d0', '#d8d0b8', '#ffd84a', '#ff6a5a', '#e8e8e8', '#9ad0ff']);
    const ink = r.pick(['#141414', '#1a1a5a', '#8a1010']);
    x.save();
    x.translate(px + ox, py + oy);
    x.rotate((r.next() - 0.5) * 0.06);
    // torn outline
    x.beginPath();
    const pts: [number, number][] = [];
    const N = 22;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const side = Math.floor(t * 4), f = (t * 4) % 1;
      const j = () => (r.next() - 0.5) * Math.min(w, h) * 0.05;
      if (side === 0) pts.push([f * w + j(), j()]);
      else if (side === 1) pts.push([w + j(), f * h + j()]);
      else if (side === 2) pts.push([w - f * w + j(), h + j()]);
      else pts.push([j(), h - f * h + j()]);
    }
    // a corner torn away
    if (r.next() < 0.6) pts.splice(Math.floor(r.next() * N), 3);
    pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
    x.closePath();
    x.fillStyle = paper;
    x.fill();
    x.clip();
    // content: a headline, a halftone image, small print
    x.fillStyle = ink;
    const head = r.pick(['FIGHT NIGHT', 'MISSING', 'LIVE TONIGHT', 'NO MERCY TOUR', 'WE BUY GOLD', 'ROOMS 4 RENT', 'THE PIT', 'BOXING', 'REWARD', 'LAST CALL']);
    x.font = `400 ${h * 0.16}px ${DISPLAY}`;
    x.textAlign = 'center';
    const tw = x.measureText(head).width;
    x.save();
    x.translate(w / 2, h * 0.2);
    x.scale(Math.min(1, (w * 0.9) / tw), 1);
    x.fillText(head, 0, 0);
    x.restore();
    // halftone blob
    const hx = w / 2, hy = h * 0.52, hr = Math.min(w, h) * 0.28;
    for (let gy = -hr; gy < hr; gy += 4) {
      for (let gx = -hr; gx < hr; gx += 4) {
        const d = Math.hypot(gx, gy) / hr;
        if (d > 1) continue;
        const k = (1 - d) * (0.6 + 0.4 * Math.sin(gx * 0.1 + gy * 0.07));
        x.beginPath();
        x.arc(hx + gx, hy + gy, Math.max(0.3, k * 2), 0, Math.PI * 2);
        x.fill();
      }
    }
    x.font = `600 ${h * 0.05}px ${HAND}`;
    for (let i = 0; i < 4; i++) x.fillRect(w * 0.12, h * (0.8 + i * 0.045), w * (0.5 + r.next() * 0.26), h * 0.018);
    // age: yellowing, water stain, a wrinkle
    const ag = x.createLinearGradient(0, 0, 0, h);
    ag.addColorStop(0, 'rgba(120,100,40,0.05)');
    ag.addColorStop(1, 'rgba(90,70,30,0.3)');
    x.fillStyle = ag;
    x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(0,0,0,0.12)';
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(0, h * (0.3 + r.next() * 0.4));
    x.lineTo(w, h * (0.3 + r.next() * 0.4));
    x.stroke();
    x.restore();
  }
}

/** The city painted over the old tags: a patch of not-quite-matching colour, roller marks in it. */
export function buff(x: Ctx, r: RNG, px: number, py: number, w: number, h: number, color: string) {
  x.save();
  x.fillStyle = color;
  x.beginPath();
  x.moveTo(px, py + (r.next() - 0.5) * 6);
  x.lineTo(px + w, py + (r.next() - 0.5) * 6);
  x.lineTo(px + w + (r.next() - 0.5) * 10, py + h);
  x.lineTo(px + (r.next() - 0.5) * 10, py + h);
  x.closePath();
  x.fill();
  x.clip();
  for (let i = 0; i < h; i += 3) {
    x.fillStyle = `rgba(${r.next() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + r.next() * 0.04})`;
    x.fillRect(px, py + i, w, 2);
  }
  x.restore();
}

/** Street grime over everything: dirt kicked up the bottom, soot, rain streaks from above. */
export function grime(x: Ctx, r: RNG, w: number, h: number, ppm: number) {
  const g = x.createLinearGradient(0, h, 0, h - ppm * 0.9);
  g.addColorStop(0, 'rgba(22,18,14,0.6)');
  g.addColorStop(1, 'rgba(22,18,14,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // splash marks along the foot of the wall
  for (let i = 0; i < w / 6; i++) {
    x.fillStyle = `rgba(20,16,12,${0.05 + r.next() * 0.12})`;
    const sx = r.next() * w, sy = h - r.next() * ppm * 0.5;
    x.beginPath();
    x.ellipse(sx, sy, 1 + r.next() * 5, 1 + r.next() * 3, 0, 0, Math.PI * 2);
    x.fill();
  }
  // streaks of rainwater
  for (let i = 0; i < w / 40; i++) {
    const sx = r.next() * w, len = (0.3 + r.next() * 0.7) * h;
    const sg = x.createLinearGradient(0, 0, 0, len);
    sg.addColorStop(0, 'rgba(15,15,12,0.22)');
    sg.addColorStop(1, 'rgba(15,15,12,0)');
    x.fillStyle = sg;
    x.fillRect(sx, 0, 2 + r.next() * 8, len);
  }
}

/**
 * Cover one wall's band (w x h metres at `ppm` pixels a metre) with street art: big pieces where
 * there's room, throw-ups, posters near the doors, buffs over old tags, tags everywhere, stencils,
 * then the grime. `avoid` are rectangles (metres, from the wall's left end and the floor) left bare.
 */
export function paintWall(x: Ctx, r: RNG, w: number, h: number, ppm: number, opts: { avoid?: [number, number, number, number][]; pieces?: number; buffColor?: string; density?: number } = {}) {
  const W = w * ppm, H = h * ppm;
  const avoid = (opts.avoid ?? []).map(([u0, v0, u1, v1]) => [u0 * ppm, H - v1 * ppm, u1 * ppm, H - v0 * ppm]);
  const free = (x0: number, y0: number, x1: number, y1: number) => avoid.every(([a, b, c, d]) => x1 < a || x0 > c || y1 < b || y0 > d);
  const dens = opts.density ?? 1;
  // ---- old layer: tags that were buffed over, half showing
  for (let i = 0; i < (w / 2.5) * dens; i++) {
    const tx = r.next() * W, ty = H - (0.5 + r.next() * 2.2) * ppm;
    if (free(tx - 40, ty - 40, tx + 200, ty + 20)) tag(x, r, tx, ty, ppm * (0.18 + r.next() * 0.25), rgba(r.pick(['#3a3a3a', '#5a2a2a', '#2a3a5a']), 0.7));
  }
  for (let i = 0; i < (w / 7) * dens; i++) {
    const bw = (1.2 + r.next() * 3) * ppm, bh = (0.8 + r.next() * 1.6) * ppm;
    const bx = r.next() * (W - bw), by = H - (0.2 + r.next() * 1.0) * ppm - bh;
    if (free(bx, by, bx + bw, by + bh)) buff(x, r, bx, by, bw, bh, opts.buffColor ?? r.pick(['#7a7068', '#6a6660', '#8a6a5a', '#5a5a5e']));
  }
  // ---- posters by the doors and in runs
  for (let i = 0; i < (w / 6) * dens; i++) {
    const pw = (0.55 + r.next() * 0.35) * ppm, ph = pw * 1.4;
    const px = r.next() * (W - pw * 3), py = H - (1.2 + r.next() * 0.8) * ppm - ph;
    const n = 1 + Math.floor(r.next() * 3);
    if (free(px, py, px + pw * n * 1.05, py + ph)) for (let k = 0; k < n; k++) poster(x, r, px + k * pw * 1.05, py, pw, ph);
  }
  // ---- pieces
  const nPieces = opts.pieces ?? Math.max(1, Math.round(w / 8));
  for (let i = 0; i < nPieces; i++) {
    for (let tries = 0; tries < 12; tries++) {
      const ph = (0.95 + r.next() * 0.6) * ppm;
      const word = r.pick(WORDS);
      const pw = ph * word.length * 0.62 * STRETCH;
      const cx = pw / 2 + r.next() * Math.max(1, W - pw), cy = H - (1.15 + r.next() * 0.9) * ppm - ph * 0.2;
      if (!free(cx - pw * 0.6, cy - ph, cx + pw * 0.6, cy + ph * 0.5)) continue;
      const pal = r.pick(PALETTES);
      piece(x, r, word, cx, cy, ph, pal);
      if (r.next() < 0.45) character(x, r, cx + pw * 0.62 + ph * 0.3, cy - ph * 0.1, ph * 0.55, pal);
      // crew name and a dedication underneath
      x.save();
      x.font = `italic 800 ${ph * 0.16}px ${HAND}`;
      x.fillStyle = pal.outline === '#050505' ? '#e8e8e8' : '#0a0a0a';
      x.fillText(`${r.pick(CREWS)} CREW · ${2009 + Math.floor(r.next() * 16)}`, cx - pw * 0.4, cy + ph * 0.62);
      x.restore();
      avoid.push([cx - pw * 0.55, cy - ph * 0.9, cx + pw * 0.55, cy + ph * 0.45]);
      break;
    }
  }
  // ---- a heaven spot: someone climbed for this one
  if (h > 3.8 && r.next() < 0.85) {
    for (let tries = 0; tries < 8; tries++) {
      const ph = (0.75 + r.next() * 0.35) * ppm;
      const word = r.pick(WORDS);
      const pw = ph * word.length * 0.62 * STRETCH;
      const cx = pw / 2 + r.next() * Math.max(1, W - pw), cy = H - (h - 0.75) * ppm;
      if (!free(cx - pw * 0.6, cy - ph, cx + pw * 0.6, cy + ph * 0.5)) continue;
      piece(x, r, word, cx, cy, ph, r.pick(PALETTES));
      avoid.push([cx - pw * 0.55, cy - ph * 0.9, cx + pw * 0.55, cy + ph * 0.45]);
      break;
    }
  }
  // ---- throw-ups
  for (let i = 0; i < (w / 3.2) * dens; i++) {
    const th = (0.45 + r.next() * 0.55) * ppm;
    const cx = r.next() * W, cy = H - (0.6 + r.next() * 1.8) * ppm;
    if (free(cx - th, cy - th * 0.6, cx + th, cy + th * 0.5)) throwUp(x, r, r.pick(['KX', 'OZ', 'RIP', 'ZK', 'MOB', 'VS', 'GBK', 'EX']), cx, cy, th);
  }
  // ---- stencils
  for (let i = 0; i < (w / 6) * dens; i++) {
    const s = (0.25 + r.next() * 0.3) * ppm;
    const cx = r.next() * W, cy = H - (1.0 + r.next() * 1.5) * ppm;
    if (free(cx - s, cy - s, cx + s, cy + s)) stencil(x, r, cx, cy, s, r.pick(['#0c0c0c', '#0c0c0c', '#c81e1e', '#e8e8e8']));
  }
  // ---- the top layer: fresh tags and scribbles over everything (the doors too)
  for (let i = 0; i < (w / 0.65) * dens; i++) {
    const th = (0.14 + r.next() * 0.36) * ppm;
    const tx = r.next() * W, ty = H - (0.35 + r.next() * 2.4) * ppm;
    if (r.next() < 0.75) tag(x, r, tx, ty, th);
    else scribble(x, r, tx, ty, th * 3, th, r.pick(['#0a0a0a', '#e0e0e0', '#c02020']));
  }
  grime(x, r, W, H, ppm);
}
