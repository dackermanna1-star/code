import { hexToRgb } from '../../core/ids';

/**
 * Cached glow sprites and colour helpers for the VFX layer.
 *
 * Glow is never produced with shadowBlur: every soft light is a pre-rendered radial
 * gradient drawn with drawImage (usually with 'lighter' compositing) — fast and bloom-friendly.
 */

type Canvas = HTMLCanvasElement | OffscreenCanvas;

function makeCanvas(w: number, h: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: Canvas): CanvasRenderingContext2D {
  return c.getContext('2d') as unknown as CanvasRenderingContext2D;
}

const SIZE = 64;
const glowCache = new Map<string, Canvas>();
const hotCache = new Map<string, Canvas>();
const softCache = new Map<string, Canvas>();
const ringCache = new Map<string, Canvas>();

/** Coloured additive glow: bright centre, long soft falloff. */
export function glowSprite(hex: string): Canvas {
  let c = glowCache.get(hex);
  if (c) return c;
  c = makeCanvas(SIZE, SIZE);
  const g = ctx2d(c);
  const [r, gg, b] = hexToRgb(hex);
  const grad = g.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  grad.addColorStop(0, `rgba(${r},${gg},${b},1)`);
  grad.addColorStop(0.18, `rgba(${r},${gg},${b},0.7)`);
  grad.addColorStop(0.45, `rgba(${r},${gg},${b},0.22)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, SIZE, SIZE);
  glowCache.set(hex, c);
  return c;
}

/** White-hot core fading through the colour (impacts, projectile heads). */
export function hotSprite(hex: string): Canvas {
  let c = hotCache.get(hex);
  if (c) return c;
  c = makeCanvas(SIZE, SIZE);
  const g = ctx2d(c);
  const [r, gg, b] = hexToRgb(hex);
  const grad = g.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.16, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.3, `rgba(${r},${gg},${b},0.75)`);
  grad.addColorStop(0.6, `rgba(${r},${gg},${b},0.2)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, SIZE, SIZE);
  hotCache.set(hex, c);
  return c;
}

/** Soft opaque-ish puff for normal-blend smoke and dust. */
export function softSprite(hex: string): Canvas {
  let c = softCache.get(hex);
  if (c) return c;
  c = makeCanvas(SIZE, SIZE);
  const g = ctx2d(c);
  const [r, gg, b] = hexToRgb(hex);
  const grad = g.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  grad.addColorStop(0, `rgba(${r},${gg},${b},0.85)`);
  grad.addColorStop(0.5, `rgba(${r},${gg},${b},0.45)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, SIZE, SIZE);
  softCache.set(hex, c);
  return c;
}

/** Hollow glowing ring sprite (used for lens rings / halos). */
export function ringSprite(hex: string): Canvas {
  let c = ringCache.get(hex);
  if (c) return c;
  c = makeCanvas(SIZE * 2, SIZE * 2);
  const g = ctx2d(c);
  const [r, gg, b] = hexToRgb(hex);
  const S = SIZE;
  const grad = g.createRadialGradient(S, S, 0, S, S, S);
  grad.addColorStop(0, `rgba(${r},${gg},${b},0)`);
  grad.addColorStop(0.62, `rgba(${r},${gg},${b},0)`);
  grad.addColorStop(0.8, `rgba(${r},${gg},${b},0.9)`);
  grad.addColorStop(0.86, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.92, `rgba(${r},${gg},${b},0.5)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, S * 2, S * 2);
  ringCache.set(hex, c);
  return c;
}

/** Draw a sprite centred at (x,y) with radius r. */
export function blit(ctx: CanvasRenderingContext2D, sprite: Canvas, x: number, y: number, r: number): void {
  ctx.drawImage(sprite as CanvasImageSource, x - r, y - r, r * 2, r * 2);
}

/* ------------------------------------------------------------------ */
/* Colour table: particles store a colour index, never a string.      */
/* ------------------------------------------------------------------ */

export class ColorTable {
  readonly hex: string[] = [];
  readonly r: number[] = [];
  readonly g: number[] = [];
  readonly b: number[] = [];
  private map = new Map<string, number>();

  index(hex: string): number {
    let i = this.map.get(hex);
    if (i !== undefined) return i;
    i = this.hex.length;
    const [r, g, b] = hexToRgb(hex);
    this.hex.push(hex);
    this.r.push(r);
    this.g.push(g);
    this.b.push(b);
    this.map.set(hex, i);
    return i;
  }
}

export const COLORS = new ColorTable();

/** Lighten toward white by t (0..1). */
export function lighten(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (v: number) => Math.round(v + (255 - v) * t);
  return '#' + [f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Darken toward black by t (0..1). */
export function darken(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (v: number) => Math.round(v * (1 - t));
  return '#' + [f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Cached "rgba(r,g,b,a)" strings quantised to 1/32 alpha steps (avoids per-frame string building). */
const rgbaCache = new Map<string, string[]>();
export function rgbaQ(hex: string, a: number): string {
  let arr = rgbaCache.get(hex);
  if (!arr) {
    const [r, g, b] = hexToRgb(hex);
    arr = [];
    for (let i = 0; i <= 32; i++) arr.push(`rgba(${r},${g},${b},${(i / 32).toFixed(4)})`);
    rgbaCache.set(hex, arr);
  }
  const i = a <= 0 ? 0 : a >= 1 ? 32 : Math.round(a * 32);
  return arr[i];
}
