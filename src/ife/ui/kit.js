// =============================================================================
// IFE drawing kit: typography, colours, shapes, easing and small helpers shared
// by every page of the seatback system (all drawing is Canvas 2D).
// =============================================================================

export const FONT_STACK = 'Inter, "Segoe UI", "SF Pro Text", -apple-system, Roboto, "Helvetica Neue", "Liberation Sans", Arial, sans-serif';

/** Halcyon Airways IFE palette (derived from AIRLINE.colors). */
export const C = {
  bg0: '#06121f',
  bg1: '#0a2036',
  navy: '#0b2a4a',
  panel: 'rgba(255,255,255,0.06)',
  panelHi: 'rgba(255,255,255,0.12)',
  line: 'rgba(255,255,255,0.12)',
  teal: '#1f9fb2',
  tealDeep: '#1f7a8c',
  gold: '#e8b04b',
  text: '#f3f1ea',
  muted: 'rgba(243,241,234,0.62)',
  faint: 'rgba(243,241,234,0.36)',
  red: '#e4574b',
  green: '#4fc38a',
};

const _fontCache = new Map();
export function font(size, weight = 400) {
  const k = size * 1000 + weight;
  let f = _fontCache.get(k);
  if (!f) { f = `${weight} ${Math.round(size)}px ${FONT_STACK}`; _fontCache.set(k, f); }
  return f;
}

/** Rounded rectangle path. */
export function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function fillRR(ctx, x, y, w, h, r, style) { rr(ctx, x, y, w, h, r); ctx.fillStyle = style; ctx.fill(); }
export function strokeRR(ctx, x, y, w, h, r, style, lw = 1) { rr(ctx, x, y, w, h, r); ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.stroke(); }

/** Single-line text with optional ellipsis. Returns the drawn width. */
export function text(ctx, str, x, y, { size = 24, weight = 400, color = C.text, align = 'left', baseline = 'alphabetic', maxWidth = 0, alpha = 1, spacing = 0 } = {}) {
  str = String(str ?? '');
  ctx.font = font(size, weight);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  if (spacing && 'letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  if (maxWidth > 0 && ctx.measureText(str).width > maxWidth) {
    let lo = 0, hi = str.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(str.slice(0, mid) + '…').width <= maxWidth) lo = mid; else hi = mid - 1; }
    str = str.slice(0, lo).trimEnd() + '…';
  }
  const pa = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = pa * alpha;
  ctx.fillText(str, x, y);
  ctx.globalAlpha = pa;
  const w = ctx.measureText(str).width;
  if (spacing && 'letterSpacing' in ctx) ctx.letterSpacing = '0px';
  return w;
}

export function measure(ctx, str, size, weight = 400) { ctx.font = font(size, weight); return ctx.measureText(String(str)).width; }

/** Word-wrapped paragraph. Returns the y after the last line. */
export function wrap(ctx, str, x, y, maxW, lineH, { size = 22, weight = 400, color = C.muted, maxLines = 99 } = {}) {
  ctx.font = font(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const words = String(str).split(/\s+/);
  let line = '', n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      n++;
      if (n >= maxLines) { ctx.fillText(line.replace(/[,.;:]?$/, '…'), x, y); return y + lineH; }
      ctx.fillText(line, x, y);
      y += lineH;
      line = words[i];
    } else line = test;
  }
  if (line) { ctx.fillText(line, x, y); y += lineH; }
  return y;
}

/** Draw an image (or canvas / video) cropped to cover the rectangle. */
export function cover(ctx, img, x, y, w, h, fx = 0.5, fy = 0.5) {
  const iw = img.videoWidth || img.naturalWidth || img.width, ih = img.videoHeight || img.naturalHeight || img.height;
  if (!iw || !ih) return false;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (iw - sw) * fx, (ih - sh) * fy, sw, sh, x, y, w, h);
  return true;
}

/** Draw an image letterboxed inside the rectangle. Returns the drawn rect. */
export function contain(ctx, img, x, y, w, h, out = {}) {
  const iw = img.videoWidth || img.naturalWidth || img.width, ih = img.videoHeight || img.naturalHeight || img.height;
  if (!iw || !ih) return null;
  const s = Math.min(w / iw, h / ih);
  out.w = iw * s; out.h = ih * s; out.x = x + (w - out.w) / 2; out.y = y + (h - out.h) / 2;
  ctx.drawImage(img, out.x, out.y, out.w, out.h);
  return out;
}

/** A small, blurred copy of an image (portable blur: downscale, then the browser upscales smoothly). */
export function blurred(img, w = 48, h = 27, passes = 2) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  cover(x, img, 0, 0, w, h);
  for (let i = 0; i < passes; i++) {
    x.globalAlpha = 0.5;
    x.drawImage(c, 1, 0); x.drawImage(c, -1, 0); x.drawImage(c, 0, 1); x.drawImage(c, 0, -1);
  }
  return c;
}

export const ease = {
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  outQuint: (t) => 1 - (1 - t) ** 5,
};
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** 3:07 or 1:02:45 */
export function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
/** "2h 05m" / "45 min" */
export function fmtHM(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
}
/** Decimal hours -> clock string (12 h with AM/PM in imperial, 24 h otherwise). */
export function fmtClock(hours, h12 = true) {
  let t = ((hours % 24) + 24) % 24;
  let h = Math.floor(t), m = Math.floor((t - h) * 60 + 1e-6);
  if (m >= 60) { m -= 60; h = (h + 1) % 24; }
  if (!h12) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export function compass(deg) { return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]; }

/** Deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Background used behind most pages: deep navy with soft teal/gold light pools. */
export function backdrop(ctx, W, H, t = 0) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b2440');
  g.addColorStop(1, '#050f1c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const r1 = ctx.createRadialGradient(W * 0.82, H * 0.08, 0, W * 0.82, H * 0.08, W * 0.55);
  r1.addColorStop(0, 'rgba(31,159,178,0.28)');
  r1.addColorStop(1, 'rgba(31,159,178,0)');
  ctx.fillStyle = r1;
  ctx.fillRect(0, 0, W, H);
  const r2 = ctx.createRadialGradient(W * 0.1, H * 1.05, 0, W * 0.1, H * 1.05, W * 0.5);
  r2.addColorStop(0, 'rgba(232,176,75,0.12)');
  r2.addColorStop(1, 'rgba(232,176,75,0)');
  ctx.fillStyle = r2;
  ctx.fillRect(0, 0, W, H);
}

/** The Halcyon "kingfisher wave" logo mark (stylised bird over a horizon arc). */
export function logoMark(ctx, x, y, s, color = C.gold) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 100, s / 100);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(6, 58);
  ctx.bezierCurveTo(30, 30, 62, 22, 96, 30);
  ctx.bezierCurveTo(70, 34, 50, 44, 40, 58);
  ctx.bezierCurveTo(60, 48, 80, 46, 94, 50);
  ctx.bezierCurveTo(68, 56, 44, 66, 30, 82);
  ctx.bezierCurveTo(28, 70, 18, 62, 6, 58);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(50, 120, 62, -Math.PI * 0.82, -Math.PI * 0.18);
  ctx.globalAlpha *= 0.55;
  ctx.stroke();
  ctx.restore();
}

/** Wordmark "HALCYON AIRWAYS". */
export function wordmark(ctx, x, y, size, color = C.text, align = 'left') {
  ctx.font = font(size, 700);
  const a = 'HALCYON';
  ctx.font = font(size * 0.62, 400);
  const b = ' AIRWAYS';
  ctx.font = font(size, 700);
  const wa = measureSp(ctx, a, size * 0.12);
  ctx.font = font(size * 0.62, 400);
  const wb = measureSp(ctx, b, size * 0.16);
  let x0 = x;
  if (align === 'center') x0 = x - (wa + wb) / 2;
  else if (align === 'right') x0 = x - wa - wb;
  text(ctx, a, x0, y, { size, weight: 700, color, spacing: size * 0.12 });
  text(ctx, b, x0 + wa, y, { size: size * 0.62, weight: 400, color: C.gold, spacing: size * 0.16 });
  return wa + wb;
}
function measureSp(ctx, s, sp) {
  const w = ctx.measureText(s).width;
  return 'letterSpacing' in ctx ? w + sp * s.length : w;
}

/** Progress / scrubber bar. */
export function bar(ctx, x, y, w, h, p, { fg = C.teal, bg = 'rgba(255,255,255,0.18)', knob = false, buffered = 0 } = {}) {
  fillRR(ctx, x, y, w, h, h / 2, bg);
  if (buffered > 0) fillRR(ctx, x, y, w * clamp01(buffered), h, h / 2, 'rgba(255,255,255,0.22)');
  if (p > 0) fillRR(ctx, x, y, Math.max(h, w * clamp01(p)), h, h / 2, fg);
  if (knob) {
    ctx.beginPath();
    ctx.arc(x + w * clamp01(p), y + h / 2, h * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  }
}

/** Soft drop shadow helper. */
export function withShadow(ctx, blur, color, fn, oy = 4) {
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetY = oy;
  fn();
  ctx.restore();
}
