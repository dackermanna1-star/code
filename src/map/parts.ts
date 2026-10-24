// Reusable building elements for the level: walls with windows, steel frames, trusses, roofs, stairs,
// railings, pipes, lamps... Coordinates are voxels; boxes are [min, max).

import { Builder, Paint } from './builder';
import { P, PAL_GROUP } from '../world/materials';
import { hash3 } from '../engine/math';
import type { PropKind } from './props';

export interface LampDef { x: number; y: number; z: number; r: number; g: number; b: number; radius: number }
export interface PropPlacement { kind: PropKind; x: number; y: number; z: number; rot: number; seed?: number }

export interface Ctx {
  b: Builder;
  G: number;               // ground level (voxels)
  lamps: LampDef[];
  props: PropPlacement[];
}

/** Weathered paint: slight dirt towards the bottom of walls, random stains. */
export function weathered(base: number, dirty: number, ground: number, height = 12): Paint {
  return (x, y, z) => {
    const h = hash3(x, y, z);
    const t = (y - ground) / height;
    if (t < 1 && (h & 255) / 255 > t + 0.15) return dirty;
    return PAL_GROUP[base] > 1 ? base + (((x >> 3) + (z >> 3) + (y >> 4)) % PAL_GROUP[base]) : base;
  };
}

/** Horizontal stripes of two paints (hazard / panels). */
export function stripes(a: number, b: number, period: number, axisY = true): Paint {
  return (x, y, z) => ((((axisY ? y : x + y + z) / period) | 0) % 2 ? a : b);
}

/** Hazard stripes (diagonal). */
export function hazard(): Paint { return (x, y, z) => ((((x + y + z) >> 1) & 1) ? P.paintYellow : P.paintBlack); }

/**
 * Cut a row of windows into a wall that spans axis 'x' or 'z' at fixed coordinate `at` (outer face) with thickness t.
 * Windows: width w, height h, starting at y0, every `step` voxels between [from, to).
 */
export function windowRow(c: Ctx, axis: 'x' | 'z', at: number, t: number, from: number, to: number, y0: number, w: number, h: number, step: number,
  glass = P.glass, frame = P.paintWhite, sill = P.concrete): void {
  const b = c.b;
  for (let s = from; s + w <= to; s += step) {
    if (axis === 'x') {
      b.clear(s, y0, at, s + w, y0 + h, at + t);
      b.box(s, y0, at + (t >> 1), s + w, y0 + h, at + (t >> 1) + 1, glass);
      // frame + mullion
      b.box(s, y0, at + (t >> 1), s + w, y0 + 1, at + (t >> 1) + 1, frame);
      b.box(s, y0 + h - 1, at + (t >> 1), s + w, y0 + h, at + (t >> 1) + 1, frame);
      if (w >= 8) b.box(s + (w >> 1), y0, at + (t >> 1), s + (w >> 1) + 1, y0 + h, at + (t >> 1) + 1, frame);
      if (h >= 10) b.box(s, y0 + (h >> 1), at + (t >> 1), s + w, y0 + (h >> 1) + 1, at + (t >> 1) + 1, frame);
      b.box(s - 1, y0 - 1, at - 1, s + w + 1, y0, at + t + 1, sill);
    } else {
      b.clear(at, y0, s, at + t, y0 + h, s + w);
      b.box(at + (t >> 1), y0, s, at + (t >> 1) + 1, y0 + h, s + w, glass);
      b.box(at + (t >> 1), y0, s, at + (t >> 1) + 1, y0 + 1, s + w, frame);
      b.box(at + (t >> 1), y0 + h - 1, s, at + (t >> 1) + 1, y0 + h, s + w, frame);
      if (w >= 8) b.box(at + (t >> 1), y0, s + (w >> 1), at + (t >> 1) + 1, y0 + h, s + (w >> 1) + 1, frame);
      if (h >= 10) b.box(at + (t >> 1), y0 + (h >> 1), s, at + (t >> 1) + 1, y0 + (h >> 1) + 1, s + w, frame);
      b.box(at - 1, y0 - 1, s - 1, at + t + 1, y0, s + w + 1, sill);
    }
  }
}

/** Opening in a wall (door / gate). */
export function opening(c: Ctx, axis: 'x' | 'z', at: number, t: number, from: number, w: number, y0: number, h: number, lintel: number | null = P.concreteMid): void {
  // wide openings get a steel beam as lintel
  const lh = w > 24 ? 4 : 2, lm = w > 24 && lintel ? P.steelDark : lintel, ext = w > 24 ? 4 : 1;
  if (axis === 'x') { c.b.clear(from, y0, at, from + w, y0 + h, at + t); if (lm) c.b.box(from - ext, y0 + h, at, from + w + ext, y0 + h + lh, at + t, lm); }
  else { c.b.clear(at, y0, from, at + t, y0 + h, from + w); if (lm) c.b.box(at, y0 + h, from - ext, at + t, y0 + h + lh, from + w + ext, lm); }
}

/** Roll-up door: slatted metal filling an opening. */
export function rollerDoor(c: Ctx, axis: 'x' | 'z', at: number, from: number, w: number, y0: number, h: number, openFrac = 0): void {
  const top = y0 + Math.round(h * openFrac);
  const paint: Paint = (x, y) => ((y % 2) ? P.shutter : P.shutter + 1);
  if (axis === 'x') c.b.box(from, top, at, from + w, y0 + h, at + 1, paint);
  else c.b.box(at, top, from, at + 1, y0 + h, from + w, paint);
}

/** Square steel column (box section) or I-beam. */
export function column(c: Ctx, x: number, z: number, y0: number, y1: number, s = 3, paint: Paint = P.paintBlue): void {
  c.b.box(x, y0, z, x + s, y1, z + s, paint);
}

/** I-beam along an axis at given position (top flange at y). */
export function beam(c: Ctx, axis: 'x' | 'z', a0: number, a1: number, y: number, at: number, h = 4, w = 3, paint: Paint = P.paintBlue): void {
  const b = c.b;
  if (axis === 'x') {
    b.box(a0, y - 1, at, a1, y, at + w, paint);
    b.box(a0, y - h, at, a1, y - h + 1, at + w, paint);
    b.box(a0, y - h + 1, at + (w >> 1), a1, y - 1, at + (w >> 1) + 1, paint);
  } else {
    b.box(at, y - 1, a0, at + w, y, a1, paint);
    b.box(at, y - h, a0, at + w, y - h + 1, a1, paint);
    b.box(at + (w >> 1), y - h + 1, a0, at + (w >> 1) + 1, y - 1, a1, paint);
  }
}

/** Warren truss spanning along axis between a0..a1 at fixed `at`, bottom chord at y, height h. */
export function truss(c: Ctx, axis: 'x' | 'z', a0: number, a1: number, y: number, at: number, h: number, paint: Paint = P.steel, pitched = false): void {
  const b = c.b;
  const len = a1 - a0;
  const topY = (a: number) => (pitched ? y + h - Math.round(Math.abs(a - (a0 + a1) / 2) / (len / 2) * (h - 3)) : y + h);
  const L = (xa: number, ya: number, xb: number, yb: number) => {
    if (axis === 'x') b.line(xa, ya, at, xb, yb, at, 2, paint); else b.line(at, ya, xa, at, yb, xb, 2, paint);
  };
  L(a0, y, a1, y);
  const panels = Math.max(2, Math.round(len / (h * 1.2)));
  for (let i = 0; i < panels; i++) {
    const pa = a0 + Math.round((len * i) / panels), pb = a0 + Math.round((len * (i + 1)) / panels);
    L(pa, topY(pa), pb, topY(pb));
    if (i % 2 === 0) L(pa, y, pb, topY(pb)); else L(pa, topY(pa), pb, y);
    L(pa, y, pa, topY(pa));
  }
  L(a1, y, a1, topY(a1));
}

/** Straight staircase rising along +dir (axis), starting at (x,y,z), width w, n steps of 2 voxels rise / 3 run. */
export function stairs(c: Ctx, axis: 'x' | 'z', dir: 1 | -1, x: number, y: number, z: number, w: number, n: number, paint: Paint = P.concrete, rise = 2, run = 3): void {
  for (let i = 0; i < n; i++) {
    const a = i * run * dir;
    const yy = y + i * rise;
    if (axis === 'x') c.b.box(dir > 0 ? x + a : x + a - run + 1, yy, z, dir > 0 ? x + a + run : x + a + 1, yy + rise, z + w, paint);
    else c.b.box(x, yy, dir > 0 ? z + a : z + a - run + 1, x + w, yy + rise, dir > 0 ? z + a + run : z + a + 1, paint);
  }
}

/** Steel stair stringer version (open steps). */
export function steelStairs(c: Ctx, axis: 'x' | 'z', dir: 1 | -1, x: number, y: number, z: number, w: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = i * 3 * dir, yy = y + i * 2;
    if (axis === 'x') c.b.box(dir > 0 ? x + a : x + a - 2, yy + 1, z, dir > 0 ? x + a + 3 : x + a + 1, yy + 2, z + w, P.grate);
    else c.b.box(x, yy + 1, dir > 0 ? z + a : z + a - 2, x + w, yy + 2, dir > 0 ? z + a + 3 : z + a + 1, P.grate);
  }
  // stringers
  const L = n * 3 * dir;
  if (axis === 'x') { c.b.line(x, y, z, x + L, y + n * 2, z, 1, P.paintYellow); c.b.line(x, y, z + w - 1, x + L, y + n * 2, z + w - 1, 1, P.paintYellow); }
  else { c.b.line(x, y, z, x, y + n * 2, z + L, 1, P.paintYellow); c.b.line(x + w - 1, y, z, x + w - 1, y + n * 2, z + L, 1, P.paintYellow); }
}

/** Railing along an axis: posts every 12 voxels, top rail at +10 and mid rail at +5. */
export function railing(c: Ctx, axis: 'x' | 'z', a0: number, a1: number, y: number, at: number, paint: Paint = P.paintYellow): void {
  const b = c.b;
  if (axis === 'x') {
    b.box(a0, y + 10, at, a1, y + 11, at + 1, paint); b.box(a0, y + 5, at, a1, y + 6, at + 1, paint);
    for (let a = a0; a < a1; a += 12) b.box(a, y, at, a + 1, y + 10, at + 1, paint);
    b.box(a1 - 1, y, at, a1, y + 10, at + 1, paint);
  } else {
    b.box(at, y + 10, a0, at + 1, y + 11, a1, paint); b.box(at, y + 5, a0, at + 1, y + 6, a1, paint);
    for (let a = a0; a < a1; a += 12) b.box(at, y, a, at + 1, y + 10, a + 1, paint);
    b.box(at, y, a1 - 1, at + 1, y + 10, a1, paint);
  }
}

/** Grated catwalk with railings on both sides along an axis. */
export function catwalk(c: Ctx, axis: 'x' | 'z', a0: number, a1: number, y: number, at: number, w = 8): void {
  if (axis === 'x') { c.b.box(a0, y, at, a1, y + 1, at + w, P.grate); railing(c, 'x', a0, a1, y + 1, at); railing(c, 'x', a0, a1, y + 1, at + w - 1); }
  else { c.b.box(at, y, a0, at + w, y + 1, a1, P.grate); railing(c, 'z', a0, a1, y + 1, at); railing(c, 'z', a0, a1, y + 1, at + w - 1); }
}

/** Pipe run along an axis with flanges every `fl` voxels. */
export function pipe(c: Ctx, axis: 'x' | 'y' | 'z', a0: number, a1: number, p1: number, p2: number, r: number, paint: Paint = P.steel, fl = 40): void {
  const b = c.b;
  if (a1 < a0) [a0, a1] = [a1, a0];
  const hollow = r >= 3 ? 1 : 0;
  if (axis === 'x') { b.cylX(p1, p2, r, a0, a1, paint, hollow); for (let a = a0 + fl; a < a1 - 2; a += fl) b.cylX(p1, p2, r + 0.9, a, a + 1, P.steelDark); }
  else if (axis === 'z') { b.cylZ(p1, p2, r, a0, a1, paint, hollow); for (let a = a0 + fl; a < a1 - 2; a += fl) b.cylZ(p1, p2, r + 0.9, a, a + 1, P.steelDark); }
  else { b.cylY(p1, p2, r, a0, a1, paint, hollow); for (let a = a0 + fl; a < a1 - 2; a += fl) b.cylY(p1, p2, r + 0.9, a, a + 1, P.steelDark); }
}

/** Ceiling lamp: housing + emissive panel + registered light. */
export function lamp(c: Ctx, x: number, y: number, z: number, warm = true, radius = 14, intensity = 6, long = true): void {
  const b = c.b;
  const lx = long ? 6 : 2, lz = 2;
  b.box(x - lx, y, z - lz, x + lx, y + 1, z + lz, P.paintGreyBlue);
  b.box(x - lx + 1, y - 1, z - lz + 1, x + lx - 1, y, z + lz - 1, warm ? P.lampWarm : P.lampCool);
  const col = warm ? [1.0, 0.82, 0.6] : [0.85, 0.92, 1.0];
  c.lamps.push({ x, y: y - 1, z, r: col[0] * intensity, g: col[1] * intensity, b: col[2] * intensity, radius });
}

/** Hanging lamp on a chain from height yTop down to y. */
export function hangingLamp(c: Ctx, x: number, yTop: number, y: number, z: number, warm = true): void {
  c.b.box(x, y + 1, z, x + 1, yTop, z + 1, P.steelDark);
  c.b.box(x - 2, y, z - 2, x + 3, y + 1, z + 3, P.paintGreen);
  c.b.box(x - 1, y - 1, z - 1, x + 2, y, z + 2, warm ? P.lampWarm : P.lampCool);
  const col = warm ? [1.0, 0.8, 0.55] : [0.85, 0.92, 1.0];
  c.lamps.push({ x, y: y - 1, z, r: col[0] * 7, g: col[1] * 7, b: col[2] * 7, radius: 16 });
}

/** Flat roof slab with a parapet. */
export function flatRoof(c: Ctx, x0: number, z0: number, x1: number, z1: number, y: number, t = 2, paint: Paint = P.concreteMid, parapet = 4): void {
  c.b.box(x0, y, z0, x1, y + t, z1, paint);
  if (parapet > 0) c.b.walls(x0, y + t, z0, x1, y + t + parapet, z1, 2, P.concreteDark);
}

/** HVAC unit for roofs. */
export function hvac(c: Ctx, x: number, y: number, z: number): void {
  const b = c.b;
  b.box(x, y, z, x + 18, y + 10, z + 12, P.sheetGrey);
  b.box(x + 1, y + 2, z - 1, x + 17, y + 8, z, P.grate);
  b.cylY(x + 9, z + 6, 4, y + 10, y + 11, P.grate);
  b.box(x + 18, y + 3, z + 4, x + 24, y + 6, z + 8, P.galv);
}
