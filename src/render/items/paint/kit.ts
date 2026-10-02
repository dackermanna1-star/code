/**
 * Canvas2D painting kit for procedural item icons.
 *
 * Icons are painted in Minecraft's 16×16 "pixel" coordinate space (y down) on a high-res
 * canvas (default 128 px), part by part: each part is filled on a temporary layer, shaded
 * with gradients/speckles clipped to its own silhouette ('source-atop'), then composited.
 * A parallel *material* canvas records PBR hints per texel (R metalness, G roughness,
 * B emissive) used by the 3D extruded item models.
 */

export type Col = number;
export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export function makeCanvas(w: number, h = w): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
export function ctx2d(c: AnyCanvas): Ctx {
  return c.getContext('2d', { willReadFrequently: false }) as Ctx;
}

// ------------------------------------------------------------------------------ colours
export const r8 = (c: Col) => (c >> 16) & 255;
export const g8 = (c: Col) => (c >> 8) & 255;
export const b8 = (c: Col) => c & 255;
const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
export const pack = (r: number, g: number, b: number): Col => (clamp8(r) << 16) | (clamp8(g) << 8) | clamp8(b);
export function rgba(c: Col, a = 1): string {
  return `rgba(${r8(c)},${g8(c)},${b8(c)},${a})`;
}
export function mix(a: Col, b: Col, t: number): Col {
  return pack(r8(a) + (r8(b) - r8(a)) * t, g8(a) + (g8(b) - g8(a)) * t, b8(a) + (b8(b) - b8(a)) * t);
}
export const lighten = (c: Col, t: number) => mix(c, 0xffffff, t);
export const darken = (c: Col, t: number) => mix(c, 0x000000, t);
export function mul(c: Col, f: number): Col {
  return pack(r8(c) * f, g8(c) * f, b8(c) * f);
}
/** Shift hue-ish toward warm (t>0) or cool (t<0) for shading that isn't just grey. */
export function tint(c: Col, t: number): Col {
  return t >= 0 ? pack(r8(c) * (1 + 0.12 * t), g8(c), b8(c) * (1 - 0.15 * t)) : pack(r8(c) * (1 + 0.15 * t), g8(c), b8(c) * (1 - 0.12 * t));
}
export function luma(c: Col): number {
  return (0.2126 * r8(c) + 0.7152 * g8(c) + 0.0722 * b8(c)) / 255;
}
/** Saturation multiplier in HSL-ish space. */
export function saturate(c: Col, f: number): Col {
  const l = luma(c) * 255;
  return pack(l + (r8(c) - l) * f, l + (g8(c) - l) * f, l + (b8(c) - l) * f);
}

// ------------------------------------------------------------------------------ random
export function seeded(seed: string | number) {
  let h = 2166136261 >>> 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------------------ paths
export type Pts = number[];
export function poly(g: Ctx, pts: Pts, close = true) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  if (close) g.closePath();
}
/** Closed (or open) Catmull-Rom spline through points, as cubic Béziers. */
export function smooth(g: Ctx, pts: Pts, close = true, tension = 0.5, begin = true) {
  const n = pts.length / 2;
  const P = (i: number): [number, number] => {
    if (close) i = ((i % n) + n) % n;
    else i = Math.max(0, Math.min(n - 1, i));
    return [pts[i * 2], pts[i * 2 + 1]];
  };
  if (begin) g.beginPath();
  g.moveTo(pts[0], pts[1]);
  const segs = close ? n : n - 1;
  const k = tension / 3 * 2;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * k / 2, p1[1] + (p2[1] - p0[1]) * k / 2, p2[0] - (p3[0] - p1[0]) * k / 2, p2[1] - (p3[1] - p1[1]) * k / 2, p2[0], p2[1]);
  }
  if (close) g.closePath();
}
export function ellipse(g: Ctx, cx: number, cy: number, rx: number, ry: number, rot = 0, begin = true) {
  if (begin) g.beginPath();
  g.ellipse(cx, cy, Math.max(0.001, rx), Math.max(0.001, ry), rot, 0, Math.PI * 2);
}
export function circle(g: Ctx, cx: number, cy: number, r: number, begin = true) {
  ellipse(g, cx, cy, r, r, 0, begin);
}
export function rrect(g: Ctx, x: number, y: number, w: number, h: number, r: number, begin = true) {
  if (begin) g.beginPath();
  r = Math.min(r, w / 2, h / 2);
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
/** A rounded bar between two points (sticks, handles, bones). */
export function capsule(g: Ctx, x0: number, y0: number, x1: number, y1: number, r: number, r1 = r, begin = true) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  if (begin) g.beginPath();
  g.arc(x0, y0, r, a + Math.PI / 2, a - Math.PI / 2);
  g.arc(x1, y1, r1, a - Math.PI / 2, a + Math.PI / 2);
  g.closePath();
}

// ------------------------------------------------------------------------------ gradients
export type Stop = [number, Col, number?];
export function lin(g: Ctx, x0: number, y0: number, x1: number, y1: number, stops: Stop[]) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [t, c, a] of stops) gr.addColorStop(Math.max(0, Math.min(1, t)), rgba(c, a ?? 1));
  return gr;
}
export function rad(g: Ctx, x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, stops: Stop[]) {
  const gr = g.createRadialGradient(x0, y0, Math.max(0, r0), x1, y1, Math.max(0.001, r1));
  for (const [t, c, a] of stops) gr.addColorStop(Math.max(0, Math.min(1, t)), rgba(c, a ?? 1));
  return gr;
}

// ------------------------------------------------------------------------------ materials
export interface Mat {
  metal?: number;
  rough?: number;
  emissive?: number;
}
export const MAT_DEFAULT: Required<Mat> = { metal: 0, rough: 0.62, emissive: 0 };
export const METAL: Mat = { metal: 1, rough: 0.32 };
export const POLISHED: Mat = { metal: 1, rough: 0.18 };
export const GEM: Mat = { metal: 0, rough: 0.08 };
export const GLASS: Mat = { metal: 0, rough: 0.05 };
export const WET: Mat = { metal: 0, rough: 0.28 };
export const CLOTH: Mat = { metal: 0, rough: 0.9 };
export const GLOW: Mat = { metal: 0, rough: 0.5, emissive: 0.8 };
function matColor(m: Mat): string {
  const metal = m.metal ?? MAT_DEFAULT.metal, rough = m.rough ?? MAT_DEFAULT.rough, em = m.emissive ?? MAT_DEFAULT.emissive;
  return `rgb(${Math.round(metal * 255)},${Math.round(rough * 255)},${Math.round(em * 255)})`;
}

// ------------------------------------------------------------------------------ painter
export interface PaintParams {
  color: Col;
  color2: Col;
  name: string;
  data?: Record<string, any>;
}

/** One icon being painted. Units: 16×16 Minecraft pixels (y down). */
export class Painter {
  readonly S: number;
  readonly k: number;
  readonly canvas: AnyCanvas;
  readonly matCanvas: AnyCanvas;
  readonly c: Ctx;
  readonly m: Ctx;
  readonly rand: () => number;
  private tmp: AnyCanvas;
  private tmp2: AnyCanvas;
  private t: Ctx;
  private t2: Ctx;

  constructor(size: number, seed: string, readonly params: PaintParams) {
    this.S = size;
    this.k = size / 16;
    this.canvas = makeCanvas(size);
    this.matCanvas = makeCanvas(size);
    this.tmp = makeCanvas(size);
    this.tmp2 = makeCanvas(size);
    this.c = ctx2d(this.canvas);
    this.m = ctx2d(this.matCanvas);
    this.t = ctx2d(this.tmp);
    this.t2 = ctx2d(this.tmp2);
    for (const g of [this.c, this.m, this.t, this.t2]) {
      g.setTransform(this.k, 0, 0, this.k, 0, 0);
      g.lineJoin = 'round';
      g.lineCap = 'round';
    }
    this.m.fillStyle = matColor(MAT_DEFAULT);
    this.m.fillRect(0, 0, 16, 16);
    this.rand = seeded(seed);
  }

  /**
   * Paint one part: `draw` fills the base silhouette on a clean layer, `shade` paints shading
   * clipped to it (source-atop), then the layer is composited onto the icon.
   */
  part(draw: (g: Ctx) => void, shade?: (g: Ctx) => void, mat?: Mat, alpha = 1) {
    const g = this.t;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, this.S, this.S);
    g.restore();
    g.save();
    draw(g);
    g.restore();
    if (shade) {
      g.save();
      g.globalCompositeOperation = 'source-atop';
      shade(g);
      g.restore();
    }
    this.compositeTmp(alpha, mat);
  }

  private compositeTmp(alpha: number, mat?: Mat) {
    const c = this.c;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = alpha;
    c.drawImage(this.tmp as any, 0, 0);
    c.restore();
    // material: stamp the part silhouette with its material colour
    const g2 = this.t2;
    g2.save();
    g2.setTransform(1, 0, 0, 1, 0, 0);
    g2.globalCompositeOperation = 'source-over';
    g2.clearRect(0, 0, this.S, this.S);
    g2.fillStyle = matColor(mat ?? MAT_DEFAULT);
    g2.fillRect(0, 0, this.S, this.S);
    g2.globalCompositeOperation = 'destination-in';
    g2.drawImage(this.tmp as any, 0, 0);
    g2.restore();
    const m = this.m;
    m.save();
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.drawImage(this.tmp2 as any, 0, 0);
    m.restore();
  }

  /**
   * Draw detail directly onto the icon, clipped to `clipPath` (speckles, cracks, highlights
   * over parts that were already painted). Does not change the material map.
   */
  overlay(clipPath: (g: Ctx) => void, draw: (g: Ctx) => void) {
    const g = this.c;
    g.save();
    clipPath(g);
    g.clip();
    draw(g);
    g.restore();
  }

  /** Simple filled shape with a fill style (no extra shading). */
  fill(path: (g: Ctx) => void, style: string | CanvasGradient | CanvasPattern, mat?: Mat, shade?: (g: Ctx) => void) {
    this.part((g) => {
      path(g);
      g.fillStyle = style;
      g.fill();
    }, shade, mat);
  }

  /** Stroke (lines, strings, fibres) directly onto the icon. */
  stroke(path: (g: Ctx) => void, style: string | CanvasGradient, width: number, mat?: Mat) {
    this.part((g) => {
      path(g);
      g.strokeStyle = style;
      g.lineWidth = width;
      g.stroke();
    }, undefined, mat);
  }

  /** Random speckles inside the current layer (call within `shade`). */
  speckle(g: Ctx, n: number, x0: number, y0: number, x1: number, y1: number, size: number, color: Col, alpha: number, sizeJitter = 0.5) {
    g.fillStyle = rgba(color, alpha);
    for (let i = 0; i < n; i++) {
      const x = x0 + this.rand() * (x1 - x0), y = y0 + this.rand() * (y1 - y0);
      const s = size * (1 - sizeJitter + this.rand() * sizeJitter * 2);
      g.beginPath();
      g.arc(x, y, s / 2, 0, Math.PI * 2);
      g.fill();
    }
  }

  /** Soft specular blob (call within `shade`). */
  spec(g: Ctx, cx: number, cy: number, rx: number, ry: number, rot = 0, alpha = 0.8, color: Col = 0xffffff) {
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.scale(1, ry / rx);
    g.fillStyle = rad(g, 0, 0, 0, 0, 0, rx, [[0, color, alpha], [0.45, color, alpha * 0.55], [1, color, 0]]);
    g.beginPath();
    g.arc(0, 0, rx, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  /** Classic volume shading for a roundish part (call within `shade`). */
  volume(g: Ctx, cx: number, cy: number, r: number, base: Col, light = 0.5, dark = 0.55, lx = -0.45, ly = -0.5) {
    g.fillStyle = rad(g, cx + lx * r * 0.9, cy + ly * r * 0.9, r * 0.05, cx, cy, r * 1.35, [
      [0, lighten(base, light)], [0.38, base], [0.8, darken(tint(base, -0.4), dark * 0.6)], [1, darken(tint(base, -0.6), dark)],
    ]);
    g.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
  }

  /** Cylinder-like shading across an axis from (x0,y0) to (x1,y1) (within `shade`). */
  cylinder(g: Ctx, x0: number, y0: number, x1: number, y1: number, halfW: number, base: Col, light = 0.45, dark = 0.5) {
    const ax = x1 - x0, ay = y1 - y0;
    const l = Math.hypot(ax, ay) || 1;
    const nx = -ay / l, ny = ax / l; // perpendicular
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // light from top-left: choose the side of the perpendicular that points up-left
    const s = nx * -0.6 + ny * -0.8 > 0 ? 1 : -1;
    const gx0 = cx + nx * halfW * s, gy0 = cy + ny * halfW * s, gx1 = cx - nx * halfW * s, gy1 = cy - ny * halfW * s;
    g.fillStyle = lin(g, gx0, gy0, gx1, gy1, [[0, lighten(base, light * 0.6)], [0.25, lighten(base, light)], [0.55, base], [1, darken(tint(base, -0.5), dark)]]);
    g.fillRect(0, 0, 16, 16);
  }

  /**
   * Final pass: bevel rims (light top-left inner edge, dark bottom-right edge) and a thin dark
   * contour for readability, like Minecraft's outlined item sprites.
   */
  finish(opts: { outline?: number; rim?: number; shadow?: number } = {}) {
    const S = this.S;
    const d = Math.max(1, Math.round(S / 96));
    const src = makeCanvas(S);
    const sg = ctx2d(src);
    sg.drawImage(this.canvas as any, 0, 0);
    const edge = (dx: number, dy: number, style: string, alpha: number) => {
      if (alpha <= 0) return;
      const e = makeCanvas(S);
      const eg = ctx2d(e);
      eg.drawImage(src as any, 0, 0);
      eg.globalCompositeOperation = 'source-atop';
      eg.fillStyle = style;
      eg.fillRect(0, 0, S, S);
      eg.globalCompositeOperation = 'destination-out';
      eg.drawImage(src as any, dx, dy);
      const c = this.c;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = alpha;
      c.globalCompositeOperation = 'source-atop';
      c.drawImage(e as any, 0, 0);
      c.restore();
    };
    const rim = opts.rim ?? 0.35;
    const sh = opts.shadow ?? 0.35;
    edge(d * 1.5, d * 1.5, 'rgba(255,255,255,1)', rim);
    edge(-d * 1.5, -d * 1.5, 'rgba(0,0,0,1)', sh);
    // all-around contour
    const ol = opts.outline ?? 0.5;
    if (ol > 0) {
      const inner = makeCanvas(S);
      const ig = ctx2d(inner);
      ig.drawImage(src as any, 0, 0);
      ig.globalCompositeOperation = 'destination-in';
      for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]]) ig.drawImage(src as any, dx, dy);
      const e = makeCanvas(S);
      const eg = ctx2d(e);
      eg.drawImage(src as any, 0, 0);
      eg.globalCompositeOperation = 'source-atop';
      eg.fillStyle = 'rgba(12,10,14,1)';
      eg.fillRect(0, 0, S, S);
      eg.globalCompositeOperation = 'destination-out';
      eg.drawImage(inner as any, 0, 0);
      const c = this.c;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = ol;
      c.globalCompositeOperation = 'source-atop';
      c.drawImage(e as any, 0, 0);
      c.restore();
    }
  }
}
