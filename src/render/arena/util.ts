/**
 * Small rendering helpers for the arena renderer: colour strings, offscreen canvases,
 * cached glow / soft sprites, and procedural geometry (jagged lines, lightning bolts).
 */
import { hexToRgb } from '../../core/ids';
import { clamp01 } from '../../core/math';
import type { Rng } from '../../core/rng';

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctxOf(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  return g;
}

/* ------------------------------------------------------------- colour ---- */

const rgbaCache = new Map<string, string>();
/** "#rrggbb" + alpha -> cached "rgba()" string (alpha quantised to 1/256). */
export function rgbaStr(hex: string, a: number): string {
  const aq = Math.round(clamp01(a) * 255) / 255;
  const key = hex + aq;
  let v = rgbaCache.get(key);
  if (v === undefined) {
    const [r, g, b] = hexToRgb(hex);
    v = `rgba(${r},${g},${b},${aq.toFixed(4)})`;
    if (rgbaCache.size > 6000) rgbaCache.clear();
    rgbaCache.set(key, v);
  }
  return v;
}

const mixCache = new Map<string, string>();
/** Mix two hex colours (t = 0 -> a, 1 -> b). */
export function mix(a: string, b: string, t: number): string {
  const tq = Math.round(clamp01(t) * 100);
  const key = a + b + tq;
  let v = mixCache.get(key);
  if (v === undefined) {
    const ca = hexToRgb(a), cb = hexToRgb(b);
    const f = tq / 100;
    const r = Math.round(ca[0] + (cb[0] - ca[0]) * f);
    const g = Math.round(ca[1] + (cb[1] - ca[1]) * f);
    const bl = Math.round(ca[2] + (cb[2] - ca[2]) * f);
    v = '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
    if (mixCache.size > 4000) mixCache.clear();
    mixCache.set(key, v);
  }
  return v;
}
export const lighten = (hex: string, t: number): string => mix(hex, '#ffffff', t);
export const darken = (hex: string, t: number): string => mix(hex, '#000000', t);

/** Perceived luminance 0..1. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/* ------------------------------------------------------------ sprites ---- */

const glowCache = new Map<string, HTMLCanvasElement>();
/**
 * Radial glow sprite (colour at the centre fading to transparent). Draw it with
 * globalCompositeOperation = 'lighter' for additive light.
 */
export function glowSprite(hex: string, hardness = 0): HTMLCanvasElement {
  const key = hex + '|' + hardness;
  let c = glowCache.get(key);
  if (c) return c;
  const S = 128;
  c = makeCanvas(S, S);
  const g = ctxOf(c);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  const h = hardness;
  grad.addColorStop(0, rgbaStr(hex, 1));
  grad.addColorStop(0.12 + h * 0.25, rgbaStr(hex, 0.75));
  grad.addColorStop(0.32 + h * 0.3, rgbaStr(hex, 0.3));
  grad.addColorStop(0.6 + h * 0.2, rgbaStr(hex, 0.08));
  grad.addColorStop(1, rgbaStr(hex, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  glowCache.set(key, c);
  return c;
}

/** Draw a centred sprite with radius r (sprite is square). */
export function drawSprite(ctx: CanvasRenderingContext2D, sprite: CanvasImageSource, x: number, y: number, r: number, alpha: number): void {
  if (alpha <= 0.002 || r <= 0) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

/** Draw a sprite stretched to an ellipse. */
export function drawSpriteEllipse(ctx: CanvasRenderingContext2D, sprite: CanvasImageSource, x: number, y: number, rx: number, ry: number, alpha: number): void {
  if (alpha <= 0.002 || rx <= 0 || ry <= 0) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(sprite, x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalAlpha = 1;
}

/**
 * Puffy cloud sprite: overlapping soft puffs, lit from above (litColor) and shadowed underneath.
 * Returns a canvas roughly 2:1.
 */
export function cloudSprite(rng: Rng, litColor: string, shadeColor: string, opts: { w?: number; h?: number; puffs?: number; flat?: number; alpha?: number } = {}): HTMLCanvasElement {
  const W = opts.w ?? 512, H = opts.h ?? 224;
  const c = makeCanvas(W, H);
  const g = ctxOf(c);
  const puffs = opts.puffs ?? 26;
  const flat = opts.flat ?? 0.55;
  const alpha = opts.alpha ?? 1;
  // Body puffs: biggest in the middle, smaller toward the ends; flat-ish bottom.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < puffs; i++) {
      const u = rng.next();
      const cx = W * (0.12 + 0.76 * u);
      const edge = 1 - Math.abs(u - 0.5) * 2; // 0 at ends, 1 in middle
      const r = H * (0.12 + 0.28 * edge * (0.6 + 0.4 * rng.next()));
      const baseY = H * (0.78 - 0.05 * rng.next());
      const cy = baseY - r * (0.35 + (1 - flat) * 0.6 * rng.next()) - edge * H * 0.12 * rng.next();
      const grad = g.createRadialGradient(cx - r * 0.15, cy - r * 0.35, r * 0.05, cx, cy, r);
      if (pass === 0) {
        // Shadow underlayer.
        grad.addColorStop(0, rgbaStr(shadeColor, 0.85 * alpha));
        grad.addColorStop(0.7, rgbaStr(shadeColor, 0.55 * alpha));
        grad.addColorStop(1, rgbaStr(shadeColor, 0));
        g.fillStyle = grad;
        g.beginPath();
        g.arc(cx, cy + r * 0.12, r * 1.02, 0, Math.PI * 2);
        g.fill();
      } else {
        const litAmt = clamp01(1 - (cy / H) * 1.1 + 0.25);
        const col = mix(shadeColor, litColor, litAmt);
        grad.addColorStop(0, rgbaStr(col, 0.95 * alpha));
        grad.addColorStop(0.55, rgbaStr(mix(shadeColor, col, 0.7), 0.6 * alpha));
        grad.addColorStop(1, rgbaStr(shadeColor, 0));
        g.fillStyle = grad;
        g.beginPath();
        g.arc(cx, cy - r * 0.08, r * 0.86, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return c;
}

/** Soft round blob (for dust / fog / smoke), white-ish centre. */
const blobCache = new Map<string, HTMLCanvasElement>();
export function blobSprite(hex: string): HTMLCanvasElement {
  let c = blobCache.get(hex);
  if (c) return c;
  const S = 96;
  c = makeCanvas(S, S);
  const g = ctxOf(c);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, rgbaStr(hex, 0.9));
  grad.addColorStop(0.45, rgbaStr(hex, 0.5));
  grad.addColorStop(0.75, rgbaStr(hex, 0.16));
  grad.addColorStop(1, rgbaStr(hex, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  blobCache.set(hex, c);
  return c;
}

/* ----------------------------------------------------------- geometry ---- */

export interface Pt {
  x: number;
  y: number;
}

/** Jagged polyline between two points with perpendicular jitter. */
export function jagged(rng: Rng, x0: number, y0: number, x1: number, y1: number, segments: number, amp: number): Pt[] {
  const pts: Pt[] = [{ x: x0, y: y0 }];
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const j = (rng.next() * 2 - 1) * amp * Math.sin(Math.PI * t) * (0.6 + 0.4 * rng.next());
    pts.push({ x: x0 + dx * t + nx * j, y: y0 + dy * t + ny * j });
  }
  pts.push({ x: x1, y: y1 });
  return pts;
}

export interface Bolt {
  main: Pt[];
  branches: Pt[][];
}

/** Lightning bolt by recursive midpoint displacement, with forked branches. */
export function makeBolt(rand: () => number, x0: number, y0: number, x1: number, y1: number, detail = 6, spread = 0.22, branchChance = 0.35): Bolt {
  let pts: Pt[] = [{ x: x0, y: y0 }, { x: x1, y: y1 }];
  let off = Math.hypot(x1 - x0, y1 - y0) * spread;
  for (let d = 0; d < detail; d++) {
    const next: Pt[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const mx = (a.x + b.x) / 2 + (rand() * 2 - 1) * off;
      const my = (a.y + b.y) / 2 + (rand() * 2 - 1) * off * 0.25;
      next.push({ x: mx, y: my }, b);
    }
    pts = next;
    off *= 0.52;
  }
  const branches: Pt[][] = [];
  for (let i = 2; i < pts.length - 3; i += 2) {
    if (rand() < branchChance * (1 - i / pts.length)) {
      const a = pts[i];
      const len = Math.hypot(x1 - x0, y1 - y0) * (0.1 + rand() * 0.22);
      const ang = Math.atan2(y1 - y0, x1 - x0) + (rand() < 0.5 ? -1 : 1) * (0.35 + rand() * 0.7);
      const bx = a.x + Math.cos(ang) * len, by = a.y + Math.sin(ang) * len;
      const sub: Pt[] = [a];
      const n = 5;
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        sub.push({ x: a.x + (bx - a.x) * t + (rand() * 2 - 1) * len * 0.12, y: a.y + (by - a.y) * t + (rand() * 2 - 1) * len * 0.06 });
      }
      branches.push(sub);
    }
  }
  return { main: pts, branches };
}

export function tracePolyline(ctx: CanvasRenderingContext2D | Path2D, pts: readonly Pt[], from = 0, to = pts.length): void {
  if (to - from < 2) return;
  ctx.moveTo(pts[from].x, pts[from].y);
  for (let i = from + 1; i < to; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

/** Stroke a polyline as a glowing line (wide soft passes + bright core). Assumes 'lighter' mode set by caller if desired. */
export function strokeGlowLine(ctx: CanvasRenderingContext2D, pts: readonly Pt[], color: string, core: string, width: number, alpha: number): void {
  if (pts.length < 2 || alpha <= 0.003) return;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const passes: [number, string, number][] = [
    [width * 6, color, 0.08],
    [width * 3, color, 0.18],
    [width * 1.6, color, 0.5],
    [width * 0.7, core, 0.95],
  ];
  for (const [w, c, a] of passes) {
    ctx.strokeStyle = rgbaStr(c, a * alpha);
    ctx.lineWidth = w;
    ctx.beginPath();
    tracePolyline(ctx, pts);
    ctx.stroke();
  }
}

/** Random irregular convex-ish polygon (for rubble / chunks), unit radius around origin. */
export function chunkShape(rand: () => number, verts = 5): number[] {
  const out: number[] = [];
  const base = rand() * Math.PI * 2;
  for (let i = 0; i < verts; i++) {
    const a = base + (i / verts) * Math.PI * 2 + (rand() - 0.5) * 0.7;
    const r = 0.6 + rand() * 0.45;
    out.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return out;
}

/** Deterministic hash -> [0,1) for integer inputs. */
export function hash01(a: number, b = 0): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
