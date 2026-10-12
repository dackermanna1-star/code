// Small drawing toolkit shared by the procedural icon generators (spell glyphs, perks, items).
import { PixelImage, ColorLike, lighten, darken, mixSeed } from './pixels';

export type Pal = Record<string, string>;

/** Default glyph outline colour (very dark warm black, like Noita's sprite outlines). */
export const OUTLINE = '#0a0707';

/** Hash-based value in [0, 1) for a pixel / parameter combo (deterministic noise). */
export function noise2(x: number, y: number, seed = 0): number {
  return (mixSeed(x | 0, y | 0, seed | 0) & 0xffff) / 0x10000;
}

/**
 * Paints an ASCII sprite. Each char maps through `pal`; '.' and ' ' are skipped.
 * Throws on unknown chars so typos are caught by tests.
 */
export function spr(g: PixelImage, rows: readonly string[], pal: Pal, ox = 0, oy = 0): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch];
      if (c === undefined) throw new Error(`spr: no colour for '${ch}'`);
      g.set(ox + x, oy + y, c);
    }
  }
}

/** Iterates every pixel of `g`, giving coordinates in a frame rotated by `angDeg` (0 = right, 90 = up)
 * around origin (sx, sy): a = along the direction, b = across it (positive = clockwise side). */
export function diag(
  g: PixelImage,
  sx: number,
  sy: number,
  angDeg: number,
  fn: (a: number, b: number, x: number, y: number) => ColorLike | null,
): void {
  const t = (angDeg * Math.PI) / 180;
  const ux = Math.cos(t);
  const uy = -Math.sin(t);
  const vx = -uy;
  const vy = ux;
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const dx = x - sx;
      const dy = y - sy;
      const c = fn(dx * ux + dy * uy, dx * vx + dy * vy, x, y);
      if (c !== null) g.set(x, y, c);
    }
}

/** Cylinder-like shading across a stroke: light on the negative side, dark on the positive side. */
export function cyl(b: number, half: number, base: string, hi = 0.4, lo = 0.35): string {
  const t = b / Math.max(0.01, half);
  if (t < -0.35) return lighten(base, hi);
  if (t > 0.4) return darken(base, lo);
  return base;
}

/** Shaded sphere: banded highlight upper-left, shadow lower-right, specular pixel. */
export function ball(g: PixelImage, cx: number, cy: number, r: number, base: string, spec: string | null = '#ffffff'): void {
  const lx = -0.62;
  const ly = -0.78;
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const dx = (x - cx) / (r + 0.4);
      const dy = (y - cy) / (r + 0.4);
      const d2 = dx * dx + dy * dy;
      if (d2 >= 0.999) continue;
      const nz = Math.sqrt(1 - d2);
      const l = dx * lx + dy * ly + nz * 0.35;
      let c = base;
      if (l > 0.78) c = lighten(base, 0.5);
      else if (l > 0.45) c = lighten(base, 0.25);
      else if (l < -0.25) c = darken(base, 0.42);
      else if (l < 0.05) c = darken(base, 0.2);
      g.set(x, y, c);
    }
  if (spec && r >= 1.5) {
    const sx = Math.round(cx - r * 0.45);
    const sy = Math.round(cy - r * 0.45);
    g.set(sx, sy, spec);
    if (r >= 3.5) g.set(sx + 1, sy, lighten(base, 0.7));
  }
}

/** 4-point sparkle: white core, arms of colour `c` with length `arm`. */
export function sparkle(g: PixelImage, x: number, y: number, c: string, arm = 1, core = '#ffffff'): void {
  for (let i = 1; i <= arm; i++) {
    const cc = i === arm && arm > 1 ? darken(c, 0.15) : c;
    g.set(x + i, y, cc);
    g.set(x - i, y, cc);
    g.set(x, y + i, cc);
    g.set(x, y - i, cc);
  }
  g.set(x, y, core);
}

/** Thick (2px) line: draws the line and a copy shifted by (ox, oy). */
export function thickLine(
  g: PixelImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: ColorLike,
  ox = 1,
  oy = 0,
): void {
  g.line(x0, y0, x1, y1, c);
  g.line(x0 + ox, y0 + oy, x1 + ox, y1 + oy, c);
}

/** Arrowhead with tip at (x, y) pointing in direction (dirDeg; 0 = right, 90 = up). */
export function arrowHead(g: PixelImage, x: number, y: number, dirDeg: number, size: number, c: ColorLike): void {
  const t = (dirDeg * Math.PI) / 180;
  const ux = Math.cos(t);
  const uy = -Math.sin(t);
  for (let yy = Math.floor(y - size - 1); yy <= Math.ceil(y + size + 1); yy++)
    for (let xx = Math.floor(x - size - 1); xx <= Math.ceil(x + size + 1); xx++) {
      const dx = xx - x;
      const dy = yy - y;
      const a = -(dx * ux + dy * uy); // distance back from the tip
      const b = Math.abs(dx * -uy + dy * ux);
      if (a >= -0.3 && a <= size + 0.3 && b <= a * 0.9 + 0.35) g.set(xx, yy, c);
    }
}

/** Arrow from (x0,y0) to (x1,y1) with a head of `size`. */
export function arrow(g: PixelImage, x0: number, y0: number, x1: number, y1: number, c: ColorLike, size = 2, head?: ColorLike): void {
  g.line(x0, y0, x1, y1, c);
  const dir = (Math.atan2(-(y1 - y0), x1 - x0) * 180) / Math.PI;
  arrowHead(g, x1, y1, dir, size, head ?? c);
}

/** Draws a polyline through points. */
export function polyline(g: PixelImage, pts: ReadonlyArray<readonly [number, number]>, c: ColorLike): void {
  for (let i = 0; i + 1 < pts.length; i++) g.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c);
}

/** Samples a quadratic Bezier into integer points (no duplicates). */
export function bezier(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  steps = 40,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = Math.round(u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]);
    const y = Math.round(u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]);
    const last = out[out.length - 1];
    if (!last || last[0] !== x || last[1] !== y) out.push([x, y]);
  }
  return out;
}

/** Teardrop pointing up: round bottom centred at (cx, cy) radius r, tip at y = tipY. */
export function teardrop(g: PixelImage, cx: number, cy: number, r: number, tipY: number, base: string, spec = true): void {
  const shape = (x: number, y: number) => {
    const dx = (x - cx) / (r + 0.4);
    const dy = (y - cy) / (r + 0.4);
    if (dx * dx + dy * dy < 0.999) return true;
    if (y < cy && y >= tipY) {
      const t = (y - tipY) / Math.max(1, cy - tipY);
      return Math.abs(x - cx) <= t * (r + 0.1) * 0.95 + 0.2;
    }
    return false;
  };
  for (let y = Math.floor(tipY); y <= Math.ceil(cy + r + 1); y++)
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      if (!shape(x, y)) continue;
      const rightEdge = !shape(x + 1, y) || !shape(x, y + 1);
      const leftEdge = !shape(x - 1, y) || !shape(x, y - 1);
      let c = base;
      if (rightEdge && x >= cx) c = darken(base, 0.35);
      else if (leftEdge && x < cx) c = lighten(base, 0.3);
      else if (x > cx + r * 0.3 && y > cy) c = darken(base, 0.18);
      g.set(x, y, c);
    }
  if (spec && r >= 2) {
    g.set(Math.round(cx - r * 0.45), Math.round(cy - r * 0.2), '#ffffff');
    g.set(Math.round(cx - r * 0.45), Math.round(cy - r * 0.2) - 1, lighten(base, 0.6));
  }
}

/** Five-by-five clock badge (timer marker) with its top-left at (x, y). */
export function clockMark(g: PixelImage, x: number, y: number): void {
  spr(
    g,
    ['.ggg.', 'gWkWg', 'gWkkg', 'gWWWg', '.ggg.'],
    { g: '#d8a840', W: '#f4f0e0', k: '#2a1c18' },
    x,
    y,
  );
}

/** Five-by-five trigger badge (diamond burst) with its top-left at (x, y). */
export function triggerMark(g: PixelImage, x: number, y: number, c = '#ffb030'): void {
  spr(g, ['..y..', '.yoy.', 'yoWoy', '.yoy.', '..y..'], { y: c, o: darken(c, 0.35), W: '#ffffff' }, x, y);
}

/** Simple shaded rect bar (light top row, dark bottom row). */
export function bar(g: PixelImage, x: number, y: number, w: number, h: number, base: string): void {
  g.fillRect(x, y, w, h, base);
  g.fillRect(x, y, w, 1, lighten(base, 0.35));
  if (h > 1) g.fillRect(x, y + h - 1, w, 1, darken(base, 0.35));
}

/** Star polygon (n spikes) centred at (cx, cy). */
export function starPoly(cx: number, cy: number, n: number, rOuter: number, rInner: number, rotDeg = -90): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const t = ((rotDeg + (i * 180) / n) * Math.PI) / 180;
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return pts;
}

/** Ring of thickness `th` (outer radius r) with a per-pixel colour function of angle (radians, 0 = right, CCW). */
export function ringFn(
  g: PixelImage,
  cx: number,
  cy: number,
  r: number,
  th: number,
  fn: (angle: number, depth: number, x: number, y: number) => ColorLike | null,
): void {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r + 0.45 || d < r - th + 0.45) continue;
      const ang = Math.atan2(-(y - cy), x - cx);
      const c = fn(ang < 0 ? ang + Math.PI * 2 : ang, r + 0.45 - d, x, y);
      if (c !== null) g.set(x, y, c);
    }
}

/**
 * Fills every pixel for which `inside` is true, with edge lighting: pixels whose upper/left neighbour is
 * outside get the light tone, lower/right edges the dark tone, the rest the base colour.
 */
export function shadedShape(
  g: PixelImage,
  inside: (x: number, y: number) => boolean,
  base: string,
  light: string = lighten(base, 0.35),
  dark: string = darken(base, 0.35),
  x0 = 0,
  y0 = 0,
  x1 = g.w - 1,
  y1 = g.h - 1,
): void {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!inside(x, y)) continue;
      let c = base;
      if (!inside(x + 1, y) || !inside(x, y + 1)) c = dark;
      else if (!inside(x - 1, y) || !inside(x, y - 1)) c = light;
      g.set(x, y, c);
    }
}

/** Classic heart curve test, centred at (cx, cy) with radius-ish scale r. */
export function inHeart(x: number, y: number, cx: number, cy: number, r: number): boolean {
  const X = (x - cx) / r;
  const Y = (cy - y) / r;
  const a = X * X + Y * Y - 1;
  return a * a * a - X * X * Y * Y * Y <= 0;
}
