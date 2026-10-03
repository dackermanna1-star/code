/**
 * Material "brushes" for mob painters: realistic skin, cloth, denim, fur, wool, bone, chitin,
 * stone, scales... evaluated in rest space (seamless across faces), plus helpers to place
 * Minecraft-pixel-grid features (eyes, mouths) on faces.
 */
import type { Sample } from '../def';
import { PX } from '../def';
import { clamp01, fbm3, hash31, mix, noise3, ridged3, smooth, worley2, worley3 } from './noise';

export type RGB = [number, number, number];

/** 0xRRGGBB (sRGB) -> linear RGB. */
export function hex(c: number): RGB {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return [f((c >> 16) & 255), f((c >> 8) & 255), f(c & 255)];
}

export function setRGB(s: Sample, c: RGB, k = 1) {
  s.r = c[0] * k; s.g = c[1] * k; s.b = c[2] * k;
}
export function mixRGB(s: Sample, c: RGB, t: number) {
  if (t <= 0) return;
  if (t > 1) t = 1;
  s.r += (c[0] - s.r) * t; s.g += (c[1] - s.g) * t; s.b += (c[2] - s.b) * t;
}
export function mulRGB(s: Sample, k: number) {
  s.r *= k; s.g *= k; s.b *= k;
}
export function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}
/** Multiply albedo with per-channel tint variation (hue shifts). */
export function tintRGB(s: Sample, r: number, g: number, b: number) {
  s.r *= r; s.g *= g; s.b *= b;
}

// ------------------------------------------------------------------------------- face grid
/** Minecraft pixel column (from the left as seen) and row (from the top) on the face. */
export function mcCol(s: Sample) {
  return Math.floor(s.u / PX);
}
export function mcRow(s: Sample) {
  return Math.floor((s.h - s.v) / PX);
}
/** Continuous Minecraft pixel coords (x from left, y from top). */
export function mcXY(s: Sample): [number, number] {
  return [s.u / PX, (s.h - s.v) / PX];
}
/**
 * Soft rectangle mask in Minecraft pixel units (x0,y0 top-left, w,h size); `soft` = edge width
 * in pixels, `round` = corner rounding in pixels.
 */
export function rectMask(s: Sample, x0: number, y0: number, w: number, h: number, soft = 0.12, round = 0.25): number {
  const [x, y] = mcXY(s);
  const cx = x0 + w / 2, cy = y0 + h / 2;
  const qx = Math.abs(x - cx) - (w / 2 - round), qy = Math.abs(y - cy) - (h / 2 - round);
  const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - round;
  return 1 - smooth(-soft, soft, d);
}
/** Soft ellipse mask in Minecraft pixel units. */
export function ellipseMask(s: Sample, cx: number, cy: number, rx: number, ry: number, soft = 0.12): number {
  const [x, y] = mcXY(s);
  const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
  return 1 - smooth(1 - soft / Math.min(rx, ry), 1 + soft / Math.min(rx, ry), d);
}

// ------------------------------------------------------------------------------- materials
export interface SkinOpts {
  /** Mottling strength (0..1). */
  mottle?: number;
  /** Pore depth (m). */
  pores?: number;
  /** Wrinkle strength. */
  wrinkles?: number;
  /** Subsurface amount. */
  sss?: number;
  rough?: number;
  /** Blotch colour (bruises, rot) and amount. */
  blotch?: RGB;
  blotchAmt?: number;
  /** Fine vein colour and amount (pale undead skin). */
  vein?: RGB;
  veinAmt?: number;
  seed?: number;
}
/** Realistic skin: mottled albedo, pores, fine wrinkles, subsurface. */
export function skin(s: Sample, base: RGB, o: SkinOpts = {}) {
  const sd = o.seed ?? 0;
  const x = s.x + sd * 13.1, y = s.y + sd * 7.7, z = s.z + sd * 3.3;
  const m = fbm3(x * 6, y * 6, z * 6, 4);
  const m2 = noise3(x * 22, y * 22, z * 22);
  const mot = o.mottle ?? 0.5;
  const k = 1 + m * 0.22 * mot + m2 * 0.06 * mot;
  s.r = base[0] * k * (1 + m2 * 0.03); s.g = base[1] * k; s.b = base[2] * k * (1 - m2 * 0.03);
  if (o.blotch && (o.blotchAmt ?? 0) > 0) {
    const b = smooth(0.15, 0.6, fbm3(x * 3.2 + 9, y * 3.2, z * 3.2, 4) + 0.1);
    mixRGB(s, o.blotch, b * (o.blotchAmt ?? 0));
  }
  if (o.vein && (o.veinAmt ?? 0) > 0) {
    const v = ridged3(x * 9, y * 9, z * 9, 3);
    mixRGB(s, o.vein, smooth(0.82, 0.97, v) * (o.veinAmt ?? 0));
  }
  // pores: small dark pits
  const pd = o.pores ?? 0.00035;
  const p = noise3(x * 420, y * 420, z * 420);
  const pore = smooth(0.35, 0.75, p);
  s.height += -pore * pd + noise3(x * 140, y * 140, z * 140) * pd * 0.5;
  // wrinkles
  const wr = o.wrinkles ?? 0.3;
  if (wr > 0) s.height -= smooth(0.86, 0.98, ridged3(x * 30, y * 55, z * 30, 2)) * 0.0006 * wr;
  mulRGB(s, 1 - pore * 0.06);
  s.rough = (o.rough ?? 0.52) + m2 * 0.06 + pore * 0.1;
  s.sss = o.sss ?? 0.75;
}

export interface ClothOpts {
  /** Thread spacing (m). */
  thread?: number;
  /** Twill (diagonal) instead of plain weave. */
  twill?: boolean;
  /** Fading/wear amount. */
  wear?: number;
  /** Dirt colour and amount. */
  dirt?: RGB;
  dirtAmt?: number;
  rough?: number;
  seed?: number;
}
/** Woven fabric (plain or twill weave) with fibre noise, fading and grime. */
export function cloth(s: Sample, base: RGB, o: ClothOpts = {}) {
  const t = o.thread ?? 0.0035;
  const sd = o.seed ?? 0;
  const a = s.u / t, b = s.v / t;
  let h: number;
  if (o.twill) {
    const d = (a + b) * Math.PI;
    h = Math.sin(d) * 0.5 + 0.5;
    h = h * 0.8 + 0.2 * Math.abs(Math.sin(a * Math.PI * 0.5));
  } else {
    const wa = Math.sin(a * Math.PI), wb = Math.sin(b * Math.PI);
    const ia = Math.floor(a) + Math.floor(b);
    h = (ia & 1 ? Math.abs(wa) : Math.abs(wb)) * 0.7 + 0.3 * Math.abs(wa * wb);
  }
  const fib = noise3(s.x * 300 + sd, s.y * 300, s.z * 300);
  s.height += (h - 0.5) * t * 0.22 + fib * 0.00008;
  const lf = fbm3(s.x * 5 + sd, s.y * 5, s.z * 5, 3);
  const k = 1 + lf * 0.12 + (h - 0.5) * 0.12 + fib * 0.04;
  s.r = base[0] * k; s.g = base[1] * k; s.b = base[2] * k;
  const wear = o.wear ?? 0.2;
  if (wear > 0) {
    const wv = smooth(0.2, 0.8, fbm3(s.x * 4 + 3 + sd, s.y * 4, s.z * 4, 4) + 0.15);
    const l = (s.r + s.g + s.b) / 3;
    s.r = mix(s.r, l * 1.15 + 0.02, wv * wear); s.g = mix(s.g, l * 1.15 + 0.02, wv * wear); s.b = mix(s.b, l * 1.12 + 0.02, wv * wear);
  }
  if (o.dirt && (o.dirtAmt ?? 0) > 0) {
    const d = smooth(0.1, 0.7, fbm3(s.x * 3.1 + 11 + sd, s.y * 3.1, s.z * 3.1, 4) + 0.2 - s.y * 0.1);
    mixRGB(s, o.dirt, d * (o.dirtAmt ?? 0));
  }
  s.rough = o.rough ?? 0.86;
  s.sss = 0.05;
}

export interface FurOpts {
  /** Strand flow direction in rest space (default: down). */
  dir?: [number, number, number];
  /** Strand length (m). */
  len?: number;
  /** Strand width (m). */
  width?: number;
  /** Colour variation between strands. */
  vary?: number;
  rough?: number;
  sss?: number;
  /** Height depth of strands. */
  depth?: number;
  seed?: number;
}
/** Directional fur/hair: anisotropic strands along `dir`, clumping, tip highlights. */
export function fur(s: Sample, base: RGB, o: FurOpts = {}) {
  const d = o.dir ?? [0, -1, 0];
  // project flow on the surface
  const nd = d[0] * s.nx + d[1] * s.ny + d[2] * s.nz;
  let fx = d[0] - s.nx * nd, fy = d[1] - s.ny * nd, fz = d[2] - s.nz * nd;
  let fl = Math.hypot(fx, fy, fz);
  if (fl < 0.2) { fx = 0; fy = 0; fz = 0; fl = 0; }
  else { fx /= fl; fy /= fl; fz /= fl; }
  const len = o.len ?? 0.03, wd = o.width ?? 0.0016;
  // coordinates along / across the flow
  const along = s.x * fx + s.y * fy + s.z * fz;
  // across: use the 3D position with the along component removed, sampled at strand frequency
  const ax = s.x - fx * along, ay = s.y - fy * along, az = s.z - fz * along;
  const sd = o.seed ?? 0;
  const n1 = noise3(ax / wd + sd, ay / wd, az / wd + along / len);
  const n2 = noise3(ax / (wd * 2.7) + 5, ay / (wd * 2.7) + sd, az / (wd * 2.7) + along / (len * 1.6));
  const clump = fbm3(s.x * 18 + sd, s.y * 18, s.z * 18, 3);
  const strand = clamp01(0.5 + 0.5 * (n1 * 0.6 + n2 * 0.4));
  const vary = o.vary ?? 0.25;
  const k = 0.72 + strand * 0.45 + clump * vary;
  s.r = base[0] * k; s.g = base[1] * k; s.b = base[2] * k;
  s.height += (strand - 0.5) * (o.depth ?? 0.0012) + clump * 0.0015;
  s.ao *= 0.85 + strand * 0.15;
  s.rough = (o.rough ?? 0.72) - strand * 0.08;
  s.sss = o.sss ?? 0.35;
}

/** Curly, fluffy wool: clumps (cells) of crimped fibres. */
export function wool(s: Sample, base: RGB, seed = 0) {
  const sc = 26;
  const w = worley3(s.x * sc + seed, s.y * sc, s.z * sc, 1);
  const cell = w.f1, edge = w.f2 - w.f1, id = w.id;
  const crimp = noise3(s.x * 260 + id * 40, s.y * 260, s.z * 260);
  const crimp2 = noise3(s.x * 520 + 3, s.y * 520 + id * 9, s.z * 520);
  const tuft = 1 - smooth(0.0, 0.75, cell);
  s.height += tuft * 0.006 + crimp * 0.0009 + crimp2 * 0.0004 - smooth(0.25, 0.0, edge) * 0.003;
  const big = fbm3(s.x * 4 + seed, s.y * 4, s.z * 4, 3);
  const k = 0.82 + tuft * 0.16 + crimp * 0.06 + big * 0.08 + (id - 0.5) * 0.08;
  s.r = base[0] * k; s.g = base[1] * k * 0.995; s.b = base[2] * k * 0.98;
  s.ao *= 0.7 + 0.3 * smooth(0.0, 0.18, edge);
  s.rough = 0.92;
  s.sss = 0.45;
}

/** Bleached/aged bone: porous, cracked, grime in the cavities. */
export function bone(s: Sample, base: RGB, o: { grime?: RGB; cracks?: number; seed?: number } = {}) {
  const sd = o.seed ?? 0;
  const lf = fbm3(s.x * 7 + sd, s.y * 7, s.z * 7, 4);
  const por = noise3(s.x * 300, s.y * 300 + sd, s.z * 300);
  const k = 1 + lf * 0.14 + por * 0.04;
  s.r = base[0] * k; s.g = base[1] * k; s.b = base[2] * k * 0.98;
  s.height += por * 0.00025 + lf * 0.0012;
  const ck = o.cracks ?? 0.6;
  if (ck > 0) {
    const w = worley3(s.x * 11 + sd, s.y * 11, s.z * 11, 1);
    const crack = smooth(0.06, 0.0, w.f2 - w.f1) * smooth(0.0, 0.5, fbm3(s.x * 9, s.y * 9 + 4, s.z * 9, 2) + 0.2);
    s.height -= crack * 0.0025 * ck;
    mixRGB(s, [base[0] * 0.35, base[1] * 0.3, base[2] * 0.22], crack * ck);
  }
  if (o.grime) {
    const g = smooth(0.0, 0.6, fbm3(s.x * 5 + 9, s.y * 5, s.z * 5, 4) + 0.1);
    mixRGB(s, o.grime, g * 0.35);
  }
  s.rough = 0.58 + por * 0.06;
  s.sss = 0.15;
}

/** Glossy chitin / leathery hide with bristles. */
export function chitin(s: Sample, base: RGB, o: { hair?: number; gloss?: number; seed?: number } = {}) {
  const sd = o.seed ?? 0;
  const w = worley3(s.x * 18 + sd, s.y * 18, s.z * 18, 0.8);
  const plate = smooth(0.0, 0.12, w.f2 - w.f1);
  const lf = fbm3(s.x * 6, s.y * 6 + sd, s.z * 6, 3);
  const k = 0.85 + plate * 0.2 + lf * 0.15 + (w.id - 0.5) * 0.1;
  s.r = base[0] * k; s.g = base[1] * k; s.b = base[2] * k;
  s.height += plate * 0.0012 + lf * 0.001;
  const hair = o.hair ?? 0.6;
  if (hair > 0) {
    const hn = noise3(s.x * 420 + sd, s.y * 90, s.z * 420);
    const hh = smooth(0.55, 0.85, hn);
    s.height += hh * 0.0007 * hair;
    s.r *= 1 + hh * 0.5 * hair; s.g *= 1 + hh * 0.45 * hair; s.b *= 1 + hh * 0.4 * hair;
  }
  s.rough = (1 - (o.gloss ?? 0.5)) * 0.8 + 0.12 + (1 - plate) * 0.1;
  s.sss = 0.05;
}

/** Weathered stone/metal plates with cracks (iron golem). */
export function stone(s: Sample, base: RGB, o: { cracks?: number; pits?: number; seed?: number; rough?: number } = {}) {
  const sd = o.seed ?? 0;
  const lf = fbm3(s.x * 5 + sd, s.y * 5, s.z * 5, 5);
  const hf = noise3(s.x * 120, s.y * 120 + sd, s.z * 120);
  const k = 1 + lf * 0.16 + hf * 0.05;
  s.r = base[0] * k; s.g = base[1] * k; s.b = base[2] * k;
  s.height += lf * 0.002 + hf * 0.0003;
  const pits = o.pits ?? 0.5;
  const p = smooth(0.55, 0.8, noise3(s.x * 60 + 3, s.y * 60, s.z * 60));
  s.height -= p * 0.0012 * pits;
  mulRGB(s, 1 - p * 0.15 * pits);
  const ck = o.cracks ?? 0.5;
  if (ck > 0) {
    const w = worley3(s.x * 6 + sd, s.y * 6, s.z * 6, 1);
    const crack = smooth(0.05, 0.0, w.f2 - w.f1) * smooth(-0.1, 0.4, fbm3(s.x * 7 + 1, s.y * 7, s.z * 7, 3));
    s.height -= crack * 0.004 * ck;
    mulRGB(s, 1 - crack * 0.55 * ck);
  }
  s.rough = o.rough ?? 0.78;
  s.sss = 0;
}

/** Overlapping reptile scales (dragon). `size` = scale size (m). */
export function scales(s: Sample, base: RGB, size = 0.05, seed = 0) {
  // offset rows of scales pointing down/back
  const sx = s.u / size, sy = s.v / (size * 0.8);
  const row = Math.floor(sy);
  const ox = sx + (row & 1) * 0.5;
  const fx = ox - Math.floor(ox) - 0.5, fy = sy - row;
  const d = Math.hypot(fx * 1.1, (fy - 0.15) * 1.0);
  const sc = 1 - smooth(0.42, 0.55, d);
  const id = hash31(Math.floor(ox), row, seed);
  const bevel = smooth(0.55, 0.1, d);
  s.height += bevel * 0.004 * sc + fy * 0.002;
  const k = 0.75 + bevel * 0.35 + (id - 0.5) * 0.15;
  s.r = base[0] * k; s.g = base[1] * k; s.b = base[2] * k;
  s.ao *= 0.6 + 0.4 * sc;
  s.rough = 0.38 + (1 - bevel) * 0.25;
  s.sss = 0.05;
}

/** Feathers: overlapping rows of vaned feathers pointing down (chicken body). */
export function feathers(s: Sample, base: RGB, size = 0.035, seed = 0) {
  const sx = s.u / size, sy = s.v / (size * 1.25);
  const row = Math.floor(sy);
  const ox = sx + (row & 1) * 0.5;
  const fx = ox - Math.floor(ox) - 0.5, fy = sy - row;
  const id = hash31(Math.floor(ox), row, seed);
  const shape = smooth(0.5, 0.42, Math.abs(fx) * (1.2 - fy * 0.6) * 2);
  const rachis = smooth(0.06, 0.0, Math.abs(fx)) * shape;
  const barbs = Math.sin((fy * 30 + Math.abs(fx) * 25) * 1.0) * 0.5 + 0.5;
  s.height += shape * (0.0015 + fy * 0.0025) + barbs * 0.00025 + rachis * 0.0005;
  const k = 0.82 + shape * 0.16 + barbs * 0.05 + (id - 0.5) * 0.06 - rachis * 0.05;
  s.r = base[0] * k; s.g = base[1] * k; s.b = base[2] * k;
  s.ao *= 0.75 + 0.25 * shape;
  s.rough = 0.8;
  s.sss = 0.3;
}

/** Glossy wet eye: iris colour with a dark pupil, soft limbal ring. (cx, cy, r in px). */
export function eye(s: Sample, cx: number, cy: number, rx: number, ry: number, iris: RGB, pupil = 0.45) {
  const [x, y] = mcXY(s);
  const dx = (x - cx) / rx, dy = (y - cy) / ry;
  const d = Math.hypot(dx, dy);
  if (d > 1.15) return 0;
  const m = 1 - smooth(0.92, 1.1, d);
  const ring = smooth(0.6, 1.0, d);
  const fib = noise3(Math.atan2(dy, dx) * 6, d * 4, 0.3) * 0.15;
  let r = iris[0] * (1 - ring * 0.6 + fib), g = iris[1] * (1 - ring * 0.6 + fib), b = iris[2] * (1 - ring * 0.6 + fib);
  const p = 1 - smooth(pupil * 0.85, pupil * 1.05, d);
  r = mix(r, 0.005, p); g = mix(g, 0.005, p); b = mix(b, 0.006, p);
  s.r = mix(s.r, r, m); s.g = mix(s.g, g, m); s.b = mix(s.b, b, m);
  s.rough = mix(s.rough, 0.06, m);
  s.sss = mix(s.sss, 0.1, m);
  s.height += m * 0.0006 * (1 - d * d);
  return m;
}

/** Thin dirt/grime overlay concentrated in low areas (y) and cavities. */
export function grime(s: Sample, c: RGB, amt: number, scale = 4, seed = 0) {
  const g = smooth(0.0, 0.7, fbm3(s.x * scale + seed, s.y * scale, s.z * scale, 4) + 0.15);
  mixRGB(s, c, g * amt);
}

export { fbm3, noise3, ridged3, worley2, worley3, smooth, clamp01, mix, hash31 };
