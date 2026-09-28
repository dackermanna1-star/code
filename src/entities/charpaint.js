// Procedural character texture painting. Every character uses the shared
// atlas layout from partgeo.RECT; painters run per texel in part coordinates
// (angle around the part, position along it, or the sculpted head surface) so
// pockets, seams, patches, faces and tattoos land on the right spot of the mesh.
// Outputs: albedo (sRGB), tangent-space normal map (from painted height) and
// ORM (R = ambient occlusion, G = roughness, B = skin/subsurface mask).
// Deterministic (own PRNG): level builds run under a seeded Math.random.
import * as THREE from 'three';
import { RECT, headGrid, sampleHead, TORSO_LEN } from './partgeo.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// sRGB hex / array -> linear [r,g,b]
export function lin(c) {
  if (Array.isArray(c)) return c.map((v) => Math.pow(v, 2.2));
  const col = new THREE.Color(c); // three converts hex (sRGB) to linear
  return [col.r, col.g, col.b];
}
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// =============================================================== noise ==
// Tileable noise tables sampled bilinearly (much faster than per-texel fbm).
class Tab {
  constructor(size, fill) {
    this.s = size; this.d = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) this.d[y * size + x] = fill(x / size, y / size);
  }
  at(u, v) {
    const s = this.s;
    let x = u * s - 0.5, y = v * s - 0.5;
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const x0 = ((xi % s) + s) % s, y0 = ((yi % s) + s) % s, x1 = (x0 + 1) % s, y1 = (y0 + 1) % s;
    const d = this.d;
    const a = d[y0 * s + x0], b = d[y0 * s + x1], c = d[y1 * s + x0], e = d[y1 * s + x1];
    return (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
  }
}
function valueNoiseFactory(seed) {
  const r = rng(seed);
  const P = 256, lat = new Float32Array(P * P);
  for (let i = 0; i < P * P; i++) lat[i] = r();
  return (u, v, f) => {
    const x = u * f, y = v * f;
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const m = (k) => ((k % f) + f) % f;
    const x0 = m(xi), x1 = m(xi + 1), y0 = m(yi), y1 = m(yi + 1);
    const a = lat[(y0 & 255) * P + (x0 & 255)], b = lat[(y0 & 255) * P + (x1 & 255)], c = lat[(y1 & 255) * P + (x0 & 255)], d = lat[(y1 & 255) * P + (x1 & 255)];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}
let NZ = null;
export function noise() {
  if (NZ) return NZ;
  const vn = valueNoiseFactory(1234), vn2 = valueNoiseFactory(777), vn3 = valueNoiseFactory(4242);
  const fbm = (u, v, f0, oct, n = vn) => { let s = 0, a = 0.5, t = 0, f = f0; for (let o = 0; o < oct; o++) { s += a * n(u, v, f); t += a; a *= 0.5; f *= 2; } return s / t; };
  // worley cells (tileable)
  const cellR = rng(99); const CN = 16; const cp = new Float32Array(CN * CN * 2); for (let i = 0; i < cp.length; i++) cp[i] = cellR();
  const cells = (u, v) => {
    const x = u * CN, y = v * CN; const xi = Math.floor(x), yi = Math.floor(y); let f1 = 9, f2 = 9;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cx = xi + ox, cy = yi + oy; const wx = ((cx % CN) + CN) % CN, wy = ((cy % CN) + CN) % CN; const k = (wy * CN + wx) * 2;
      const d = Math.hypot(cx + cp[k] - x, cy + cp[k + 1] - y); if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return [f1, f2];
  };
  NZ = {
    fbm: new Tab(256, (u, v) => fbm(u, v, 4, 5)),
    fine: new Tab(256, (u, v) => fbm(u, v, 32, 3, vn2)),
    ridge: new Tab(256, (u, v) => { let s = 0, a = 0.5, t = 0, f = 3; for (let o = 0; o < 4; o++) { const n = 1 - Math.abs(vn3(u, v, f) * 2 - 1); s += a * n * n; t += a; a *= 0.5; f *= 2; } return s / t; }),
    cell: new Tab(128, (u, v) => { const [f1, f2] = cells(u, v); return f2 - f1; }),
    blot: new Tab(256, (u, v) => fbm(u + 0.37, v + 0.71, 3, 4, vn3)),
  };
  return NZ;
}

// =============================================================== atlas ==
export class Atlas {
  constructor(size) {
    this.S = size;
    const n = size * size;
    this.r = new Float32Array(n); this.g = new Float32Array(n); this.b = new Float32Array(n);
    this.h = new Float32Array(n); this.rough = new Float32Array(n).fill(0.9); this.skin = new Float32Array(n); this.ao = new Float32Array(n).fill(1);
    this.a4 = null; // optional 4th channel (crowd detail)
    this.painted = new Uint8Array(n);
  }
  // Paint every texel of rect: fn(c) reads c.u, c.v (0..1 within the rect)
  // and writes c.col (linear rgb), c.h, c.rough, c.skin, c.ao.
  region(rect, fn, extra = {}) {
    const S = this.S;
    const x0 = Math.floor(rect[0] * S), y0 = Math.floor(rect[1] * S);
    const w = Math.round(rect[2] * S), h = Math.round(rect[3] * S);
    const c = Object.assign({ u: 0, v: 0, col: [0.5, 0.5, 0.5], h: 0, rough: 0.9, skin: 0, ao: 1, px: 1 / w, pv: 1 / h }, extra);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        c.u = (x + 0.5) / w; c.v = (y + 0.5) / h;
        c.h = 0; c.rough = 0.9; c.skin = 0; c.ao = 1; c.a4 = 0;
        c.col = [0.5, 0.5, 0.5];
        fn(c);
        const i = (y0 + y) * S + x0 + x;
        this.r[i] = c.col[0]; this.g[i] = c.col[1]; this.b[i] = c.col[2];
        this.h[i] = c.h; this.rough[i] = c.rough; this.skin[i] = c.skin; this.ao[i] = c.ao;
        if (this.a4) this.a4[i] = c.a4;
        this.painted[i] = 1;
      }
    }
  }
  // Grow painted texels into unpainted neighbours (avoids dark seams in mips)
  dilate(passes = 2) {
    const S = this.S, P = this.painted;
    let todo = [];
    for (let i = 0; i < S * S; i++) if (!P[i]) todo.push(i);
    const ch = [this.r, this.g, this.b, this.h, this.rough, this.skin, this.ao];
    if (this.a4) ch.push(this.a4);
    for (let p = 0; p < passes && todo.length; p++) {
      const src = P.slice();
      const next = [];
      for (const i of todo) {
        const x = i % S, y = (i - x) / S;
        let j = -1;
        if (x + 1 < S && src[i + 1]) j = i + 1;
        else if (x > 0 && src[i - 1]) j = i - 1;
        else if (y + 1 < S && src[i + S]) j = i + S;
        else if (y > 0 && src[i - S]) j = i - S;
        if (j < 0) { next.push(i); continue; }
        for (const a of ch) a[i] = a[j];
        P[i] = 1;
      }
      todo = next;
    }
  }
  albedoTexture() {
    const S = this.S, d = new Uint8Array(S * S * 4);
    const enc = (v) => { v = clamp(v, 0, 1); return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255); };
    for (let i = 0; i < S * S; i++) { d[i * 4] = enc(this.r[i]); d[i * 4 + 1] = enc(this.g[i]); d[i * 4 + 2] = enc(this.b[i]); d[i * 4 + 3] = 255; }
    return tex(d, S, THREE.SRGBColorSpace);
  }
  normalTexture(strength = 1) {
    const S = this.S, d = new Uint8Array(S * S * 4), H = this.h;
    const k = strength * S / 512;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const xl = x > 0 ? i - 1 : i, xr = x < S - 1 ? i + 1 : i, yd = y > 0 ? i - S : i, yu = y < S - 1 ? i + S : i;
      let nx = -(H[xr] - H[xl]) * k * 14, ny = -(H[yu] - H[yd]) * k * 14, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      d[i * 4] = Math.round((nx / l * 0.5 + 0.5) * 255); d[i * 4 + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); d[i * 4 + 2] = Math.round((nz / l * 0.5 + 0.5) * 255); d[i * 4 + 3] = 255;
    }
    return tex(d, S, THREE.NoColorSpace);
  }
  // Raw linear RGBA (crowd detail atlas: col = RGB channels, a4 = alpha)
  rawTexture() {
    const S = this.S, d = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) { d[i * 4] = clamp(this.r[i], 0, 1) * 255; d[i * 4 + 1] = clamp(this.g[i], 0, 1) * 255; d[i * 4 + 2] = clamp(this.b[i], 0, 1) * 255; d[i * 4 + 3] = clamp(this.a4 ? this.a4[i] : 1, 0, 1) * 255; }
    return tex(d, S, THREE.NoColorSpace);
  }
  ormTexture() {
    const S = this.S, d = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) { d[i * 4] = clamp(this.ao[i], 0, 1) * 255; d[i * 4 + 1] = clamp(this.rough[i], 0.03, 1) * 255; d[i * 4 + 2] = clamp(this.skin[i], 0, 1) * 255; d[i * 4 + 3] = 255; }
    return tex(d, S, THREE.NoColorSpace);
  }
}
function tex(data, S, cs) {
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = cs;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// ======================================================= part mappings ==
// Region-local (u, v) -> part parameters. Tubes: a = (u - 0.5) * TAU (+aOff),
// t = tA + v * (tB - tA). Values must match partgeo.
export const PARTMAP = {
  torso: { tA: -0.155 / TORSO_LEN, tB: 0.6 / TORSO_LEN, aOff: 0 },
  uarm: { tA: -0.16, tB: 1.12, aOff: Math.PI / 2 },
  farm: { tA: -0.12, tB: 1.04, aOff: Math.PI / 2 },
  thigh: { tA: -0.2, tB: 1.15, aOff: Math.PI / 2 },
  shin: { tA: -0.1, tB: 1.06, aOff: Math.PI / 2 },
};
export function partCoords(name, c) {
  const m = PARTMAP[name];
  c.a = (c.u - 0.5) * TAU + m.aOff;
  c.t = m.tA + c.v * (m.tB - m.tA);
  if (name === 'torso') { c.hm = c.t * TORSO_LEN; c.a0 = (c.u - 0.5) * TAU; }
  else { c.a0 = c.a; } // limbs: a0 = angle with 0 posterior, +pi/2 lateral
}
// wrap-aware angle difference
export const adiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

// ================================================== material painters ==
// All take the painter context c (with c.u/c.v and part coords) and write
// c.col / c.h / c.rough. `su`, `sv` are surface-scale texture coordinates.
export function fabric(c, base, o = {}) {
  const N = noise();
  const su = o.su ?? c.u, sv = o.sv ?? c.v;
  const sc = o.scale ?? 1;
  const weave = N.fine.at(su * 6 * sc, sv * 6 * sc);
  const fine = N.fine.at(su * 2 * sc + 0.37, sv * 2 * sc);
  const blot = N.blot.at(su * 1.3, sv * 1.3);
  let k = 0.93 + (fine - 0.5) * 0.1 + (weave - 0.5) * 0.06 + (blot - 0.5) * (o.mottle ?? 0.18);
  const folds = o.folds ?? 0;
  k *= 1 - folds * 0.3;
  c.col[0] = base[0] * k; c.col[1] = base[1] * k; c.col[2] = base[2] * k;
  c.h = (weave - 0.5) * 0.025 + (fine - 0.5) * 0.04 - folds * 0.5 + (o.h ?? 0);
  c.rough = o.rough ?? 0.92;
}
export function denim(c, base, o = {}) {
  const N = noise();
  const su = o.su ?? c.u, sv = o.sv ?? c.v;
  const tw = N.fine.at((su + sv) * 9, (sv - su) * 2);
  const fine = N.fine.at(su * 3, sv * 3);
  const fade = (o.fade ?? 0) + (N.blot.at(su * 0.8, sv * 0.8) - 0.5) * 0.25;
  const white = [0.55, 0.6, 0.66];
  let col = mix3(base, white, clamp(fade * 0.5 + (tw - 0.5) * 0.12 + (fine - 0.5) * 0.1, 0, 0.7));
  const folds = o.folds ?? 0;
  col = mul3(col, 1 - folds * 0.3);
  c.col[0] = col[0]; c.col[1] = col[1]; c.col[2] = col[2];
  c.h = (tw - 0.5) * 0.03 + (fine - 0.5) * 0.04 - folds * 0.5;
  c.rough = 0.9;
}
export function leather(c, base, o = {}) {
  const N = noise();
  const su = o.su ?? c.u, sv = o.sv ?? c.v;
  const cell = N.cell.at(su * 3, sv * 3), fine = N.fine.at(su * 2, sv * 2), wear = N.blot.at(su, sv);
  const crease = o.folds ?? 0;
  let k = 0.85 + cell * 0.25 + (fine - 0.5) * 0.08 - crease * 0.3;
  let col = mul3(base, k);
  col = mix3(col, mul3(base, 2.2), clamp((wear - 0.6) * 1.5 + crease * 0.3, 0, 0.5));
  c.col[0] = col[0]; c.col[1] = col[1]; c.col[2] = col[2];
  c.h = cell * 0.25 - crease * 0.6;
  c.rough = 0.42 + (1 - cell) * 0.12 + wear * 0.12;
}
// Skin: base tone with capillary redness, mottling, pores; decay for infected.
export function skin(c, tone, o = {}) {
  const N = noise();
  const su = o.su ?? c.u, sv = o.sv ?? c.v;
  const fine = N.fine.at(su * 3, sv * 3), blot = N.blot.at(su * 2, sv * 2), fb = N.fbm.at(su * 1.5, sv * 1.5);
  let col = mul3(tone, 0.95 + (fb - 0.5) * 0.14 + (fine - 0.5) * 0.05);
  const red = (o.red ?? 0) + (blot - 0.5) * 0.12;
  col = [col[0] * (1 + red * 0.35), col[1] * (1 - red * 0.12), col[2] * (1 - red * 0.15)];
  if (o.freckles) { const f = N.fine.at(su * 9, sv * 9); if (f > 0.66) col = mul3(mix3(col, [col[0] * 0.8, col[1] * 0.6, col[2] * 0.45], o.freckles), 1); }
  if (o.decay) {
    const vein = N.ridge.at(su * 2.2, sv * 2.2);
    const v2 = sstep(0.8, 0.92, vein);
    col = mix3(col, [col[0] * 0.55, col[1] * 0.6, col[2] * 0.75], v2 * o.decay);
    const bruise = sstep(0.55, 0.8, blot);
    col = mix3(col, [col[0] * 0.6, col[1] * 0.55, col[2] * 0.65], bruise * o.decay * 0.6);
  }
  if (o.veins) { const v = sstep(0.83, 0.93, N.ridge.at(su * 3.1, sv * 2.7)); col = mix3(col, [col[0] * 0.75, col[1] * 0.8, col[2] * 1.05], v * o.veins); c.h += v * 0.15 * o.veins; }
  c.col[0] = col[0]; c.col[1] = col[1]; c.col[2] = col[2];
  c.h += (fine - 0.5) * 0.05 * (o.pores ?? 1) + (fb - 0.5) * 0.06;
  c.rough = o.rough ?? (0.5 + (1 - fine) * 0.12);
  c.skin = o.sss ?? 1;
}
// Seam: returns darkening factor for a line at distance d (m) with width w.
export function seamLine(d, w = 0.003) { return sstep(w * 2, w * 0.3, Math.abs(d)); }
// Stitch dashes along a line at distance d, with position s along it.
export function stitches(d, s, w = 0.0015, period = 0.006) { return sstep(w * 1.6, w * 0.4, Math.abs(d)) * (Math.sin(s / period * TAU) > 0 ? 1 : 0); }
// Soft rectangle: 1 inside, falloff e. returns [inside, edge]
export function rectMask(x, y, x0, x1, y0, y1, e = 0.004) {
  const dx = Math.min(x - x0, x1 - x), dy = Math.min(y - y0, y1 - y);
  const d = Math.min(dx, dy);
  return [sstep(-e, e, d), sstep(e * 1.8, 0, Math.abs(d))];
}
export function applyDirt(c, amt, su, sv) {
  if (amt <= 0) return;
  const N = noise();
  const b = N.blot.at(su * 1.7 + 0.3, sv * 1.7), f = N.fbm.at(su * 2.3, sv * 2.3);
  const k = sstep(0.45, 0.8, b * 0.6 + f * 0.6) * amt;
  c.col[0] = lerp(c.col[0], c.col[0] * 0.55 + 0.03, k); c.col[1] = lerp(c.col[1], c.col[1] * 0.5 + 0.022, k); c.col[2] = lerp(c.col[2], c.col[2] * 0.42 + 0.012, k);
  c.rough = Math.min(1, c.rough + k * 0.05);
}
// Dried blood splatter (dark brown-red, capped coverage)
export function applyBlood(c, amt, su, sv, o = {}) {
  if (amt <= 0) return;
  const N = noise();
  const f = N.fbm.at(su * 2.2 + 0.61, sv * 1.1 + 0.2), drip = N.fbm.at(su * 5.5, sv * 0.9 + 0.3);
  const sp = N.fine.at(su * 1.2, sv * 1.2);
  const m = sstep(1 - amt * 0.55, 1 - amt * 0.55 + 0.1, f * 0.7 + drip * 0.4) + sstep(0.86, 0.9, sp) * amt;
  const k = clamp(m, 0, 1) * (o.max ?? 0.85);
  const bc = o.fresh ? [0.16, 0.012, 0.01] : [0.075, 0.016, 0.01];
  c.col[0] = lerp(c.col[0], bc[0], k); c.col[1] = lerp(c.col[1], bc[1], k); c.col[2] = lerp(c.col[2], bc[2], k);
  c.rough = lerp(c.rough, 0.55, k * 0.6);
  c.h += k * 0.05;
}

// ====================================================== face painting ==
// Paint a head (region rect) from the sculpted head grid. o: {
//  skin, lips, brow, eye (iris unused here), hair (scalp colour), hairline,
//  stubble (0..1 colour strength), stubbleCol, wrinkles, makeup, freckles,
//  decay (infected), sunkenEyes, scar, dirt, blood, bald }
export function paintHead(atlas, rect, grid, o) {
  const N = noise();
  const p = [0, 0, 0], n = [0, 0, 0];
  const tone = o.skin;
  atlas.region(rect, (c) => {
    const ao = sampleHead(grid, c.u, c.v, p, n);
    const x = p[0], y = p[1], z = p[2], ax = Math.abs(x);
    const su = c.u * 2.2, sv = c.v * 1.4;
    // base skin
    const red = 0.35 * Math.exp(-(((ax - 0.042) / 0.022) ** 2 + ((y - 0.018) / 0.02) ** 2)) // cheeks
      + 0.5 * Math.exp(-((x / 0.014) ** 2 + ((y - 0.014) / 0.014) ** 2 + ((z + 0.115) / 0.02) ** 2)) // nose tip
      + 0.35 * Math.exp(-(((ax - 0.08) / 0.015) ** 2 + ((y - 0.045) / 0.03) ** 2)); // ears
    skin(c, tone, { su, sv, red: red * (o.redness ?? 1), freckles: o.freckles, decay: o.decay, veins: o.veins });
    let col = c.col;
    // under-eye darkness / sunken sockets
    const eyeD = Math.min(Math.hypot((ax - 0.032) / 0.024, (y - 0.052) / 0.02, (z + 0.09) / 0.03), 3);
    const under = Math.exp(-(((ax - 0.032) / 0.018) ** 2 + ((y - 0.037) / 0.008) ** 2)) * (z < -0.06 ? 1 : 0);
    col = mul3(col, 1 - under * (0.12 + (o.sunken ?? 0) * 0.3));
    if (o.sunken) col = mix3(col, [0.03, 0.02, 0.025], sstep(1.1, 0.4, eyeD) * o.sunken * 0.8);
    // lips
    const lipU = Math.exp(-((x / 0.02) ** 2 + ((y + 0.011) / 0.0055) ** 2)) * (z < -0.09 ? 1 : 0);
    const lipL = Math.exp(-((x / 0.018) ** 2 + ((y + 0.025) / 0.0065) ** 2)) * (z < -0.088 ? 1 : 0);
    const lip = clamp((lipU + lipL) * 1.4, 0, 1);
    col = mix3(col, o.lips || mul3([tone[0] * 1.05, tone[1] * 0.72, tone[2] * 0.72], 0.9), lip * 0.85);
    const mouthLine = Math.exp(-((x / 0.019) ** 2 + ((y + 0.0185) / 0.0016) ** 2)) * (z < -0.09 ? 1 : 0);
    col = mul3(col, 1 - mouthLine * 0.75);
    c.rough = lerp(c.rough, 0.35, lip * 0.8);
    // nostrils
    const nos = Math.exp(-(((ax - 0.0085) / 0.0045) ** 2 + ((y - 0.006) / 0.003) ** 2 + ((z + 0.108) / 0.01) ** 2));
    col = mul3(col, 1 - nos * 0.8);
    // stubble / beard shadow
    if (o.stubble) {
      const jawZone = sstep(0.028, 0.0, y) * sstep(-0.1, -0.075, y) * sstep(0.02, -0.03, z) * (1 - lip * 1.2) * (1 - sstep(0.07, 0.078, ax));
      const must = Math.exp(-((x / 0.024) ** 2 + ((y + 0.003) / 0.006) ** 2)) * (z < -0.08 ? 1 : 0);
      const dots = N.fine.at(su * 6, sv * 6);
      const s = clamp((jawZone + must) * (0.55 + dots * 0.6), 0, 1) * o.stubble;
      col = mix3(col, o.stubbleCol || [0.05, 0.04, 0.035], s * 0.7);
      c.h += s * dots * 0.12;
    }
    // eyebrows
    {
      const bx = ax - 0.033, by = y - (0.075 + 0.006 * Math.cos(bx * 40) - 0.004 * (ax > 0.045 ? (ax - 0.045) * 60 : 0));
      const brow = sstep(0.028, 0.02, Math.abs(bx + 0.002)) * sstep(0.0045 * (o.browThick ?? 1), 0.0015, Math.abs(by)) * (z < -0.07 ? 1 : 0);
      const strands = 0.6 + 0.4 * N.fine.at(su * 14, sv * 3);
      col = mix3(col, o.brow || [0.05, 0.035, 0.025], clamp(brow * strands * 1.3, 0, 1) * 0.92);
      c.h += brow * 0.15;
    }
    // eyelid crease + lash line around the eyeball
    {
      const ed = Math.hypot((ax - 0.0318) / 0.0155, (y - 0.056) / 0.0115);
      const lash = sstep(1.05, 0.85, ed) * sstep(0.55, 0.8, ed) * (y > 0.05 ? 1 : 0.5) * (z < -0.08 ? 1 : 0);
      col = mix3(col, [0.02, 0.015, 0.012], lash * (0.5 + (o.makeup ?? 0) * 0.5));
      const crease = Math.exp(-(((ax - 0.032) / 0.016) ** 2 + ((y - 0.07) / 0.0025) ** 2)) * (z < -0.075 ? 1 : 0);
      col = mul3(col, 1 - crease * 0.25);
      if (o.makeup) col = mix3(col, [col[0] * 0.8, col[1] * 0.7, col[2] * 0.75], Math.exp(-(((ax - 0.034) / 0.014) ** 2 + ((y - 0.064) / 0.006) ** 2)) * o.makeup * 0.5);
    }
    // wrinkles
    if (o.wrinkles) {
      const w = o.wrinkles;
      const fore = sstep(0.085, 0.1, y) * sstep(0.14, 0.12, y) * (z < -0.05 ? 1 : 0) * sstep(0.05, 0.03, ax);
      const lines = Math.pow(Math.abs(Math.sin(y * 420 + N.fbm.at(su, sv) * 3)), 6);
      const crow = Math.exp(-(((ax - 0.055) / 0.008) ** 2 + ((y - 0.055) / 0.012) ** 2)) * Math.pow(Math.abs(Math.sin(Math.atan2(y - 0.055, ax - 0.05) * 7)), 4);
      const nl = Math.exp(-((((ax - 0.018 - (0.02 - y) * 0.45) / 0.0035) ** 2) + ((y + 0.0) / 0.02) ** 2)) * (z < -0.08 ? 1 : 0);
      const k = clamp(fore * lines + crow + nl * 0.8, 0, 1) * w;
      col = mul3(col, 1 - k * 0.3);
      c.h -= k * 0.4;
    }
    // ambient occlusion from the sculpt
    c.ao = 0.35 + 0.65 * ao;
    col = mul3(col, 0.55 + 0.45 * ao);
    // scalp hair colour (under hair meshes) / shaved scalp
    if (o.hair || o.shaved) {
      const back = sstep(0.02, 0.07, z);
      const line = (o.hairline ?? 0.09) - 0.05 * sstep(0.0, 0.06, z + 0.03) - 0.07 * back - 0.012 * sstep(0.055, 0.07, ax) * (1 - back);
      const m = sstep(line - 0.006, line + 0.004, y) * (1 - sstep(0.072, 0.082, ax) * sstep(0.08, 0.02, y) * (1 - back));
      if (o.hair) {
        const str = 0.7 + 0.3 * N.fine.at(su * 18, sv * 2);
        col = mix3(col, mul3(o.hair, str), m * (o.hairCover ?? 1));
        c.skin *= 1 - m * 0.8;
        c.rough = lerp(c.rough, 0.7, m);
      }
      if (o.shaved) {
        const dots = N.fine.at(su * 7, sv * 7);
        col = mix3(col, [0.04, 0.03, 0.025], m * (0.18 + dots * 0.16) * o.shaved);
        c.rough = lerp(c.rough, 0.42, m);
      }
    }
    if (o.scar) {
      const sd = Math.abs((x - 0.045) - (y - 0.06) * 0.3);
      const sc = sstep(0.0025, 0.0005, sd) * sstep(0.02, 0.07, y) * sstep(0.1, 0.08, y) * (x > 0 ? 1 : 0);
      col = mix3(col, [col[0] * 1.15, col[1] * 0.85, col[2] * 0.85], sc);
      c.h += sc * 0.3;
    }
    c.col = col;
    if (o.dirt) applyDirt(c, o.dirt, su, sv);
    if (o.blood) {
      const mouthZone = Math.exp(-((x / 0.04) ** 2 + ((y + 0.04) / 0.035) ** 2)) * (z < -0.03 ? 1 : 0);
      applyBlood(c, o.blood * (0.4 + mouthZone), su, sv);
    }
    if (o.post) o.post(c, p, n);
  });
}

// Painted iris / sclera for eyeball meshes.
export function paintEye(atlas, rect, o = {}) {
  const N = noise();
  atlas.region(rect, (c) => {
    const ph = (c.u - 0.5) * TAU, th = (1 - c.v) * Math.PI;
    const x = Math.sin(ph) * Math.sin(th), y = Math.cos(th), z = -Math.cos(ph) * Math.sin(th);
    const r = Math.hypot(x, y) * (z < 0 ? 1 : 3);
    const iris = o.iris || [0.2, 0.12, 0.06];
    const sclera = o.sclera || [0.78, 0.74, 0.7];
    let col = sclera;
    // veins on the sclera
    const v = N.ridge.at(c.u * 3, c.v * 3);
    col = mix3(col, [0.6, 0.2, 0.18], sstep(0.85, 0.95, v) * (o.bloodshot ?? 0.3));
    const ir = 0.42 * (o.irisSize ?? 1);
    const rad = Math.atan2(y, x);
    const fib = 0.75 + 0.25 * Math.sin(rad * 40 + N.fine.at(c.u * 4, c.v * 4) * 6);
    const ic = mul3(iris, fib * (0.7 + 0.5 * sstep(ir, ir * 0.3, r)));
    col = mix3(col, ic, sstep(ir + 0.03, ir - 0.02, r));
    col = mix3(col, mul3(iris, 0.3), sstep(ir + 0.02, ir, r) * sstep(ir - 0.05, ir, r)); // limbal ring
    col = mix3(col, [0.01, 0.01, 0.012], sstep(0.17, 0.13, r)); // pupil
    if (o.glow) col = mix3(col, o.glow, sstep(ir + 0.1, ir * 0.2, r));
    c.col = col;
    c.rough = 0.08;
    c.h = 0;
    c.skin = 0;
  });
}
