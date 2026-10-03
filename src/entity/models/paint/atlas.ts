/**
 * Texture atlas for a model definition: packs every primitive face into one atlas (shared
 * prims reuse rects), runs the model's painter per texel in rest space, then derives the
 * normal map + cavity AO from the painted height and pads the rects (mip-safe gutters).
 *
 * Output (RGBA8):
 *  - albedo: sRGB colour, .a = subsurface mask (or coverage when the model is alpha-tested)
 *  - pbr:    .rg tangent-space normal (x along +u, y along +v), .b roughness, .a AO
 *  - extra:  .r emissive, .g metalness (only when any texel uses them)
 */
import type { FaceName, ModelDef, PrimDef, Sample } from '../def';
import { primFaces, primPoint, type SurfPoint, type UVRect } from '../prims';

export interface AtlasRect {
  prim: PrimDef;
  face: FaceName;
  /** Face size (m). */
  w: number;
  h: number;
  /** Pixel rect (without gutter). */
  x: number;
  y: number;
  pw: number;
  ph: number;
}

export interface AtlasLayout {
  W: number;
  H: number;
  rects: AtlasRect[];
  /** UV rects per prim id (shared prims point to their source rects). */
  uv: Record<string, Partial<Record<FaceName, UVRect>>>;
  mirror: Record<string, boolean>;
  /** Effective density (px/m) after fitting into maxTex. */
  density: number;
}

export interface TexData {
  key: string;
  W: number;
  H: number;
  albedo: Uint8Array;
  pbr: Uint8Array;
  extra: Uint8Array | null;
  ms: number;
}

const GUTTER = 3;
const SWAP: Partial<Record<FaceName, FaceName>> = { left: 'right', right: 'left' };

/** Atlas slots: only prims of the 'main' (atlas) material are packed. */
function atlasPrims(def: ModelDef): PrimDef[] {
  return def.prims.filter((p) => {
    const slot = p.mat ?? 'main';
    return slot === 'main' || def.slots?.[slot]?.kind === 'atlas';
  });
}

export function layoutAtlas(def: ModelDef): AtlasLayout {
  const prims = atlasPrims(def);
  const maxTex = def.maxTex ?? 2048;
  let density = def.density;
  const items: { prim: PrimDef; face: FaceName; w: number; h: number; pw: number; ph: number }[] = [];
  const build = () => {
    items.length = 0;
    for (const p of prims) {
      if (p.share) continue;
      const d = density * (p.density ?? 1);
      for (const f of primFaces(p)) {
        const pw = Math.max(2, Math.min(maxTex - 2 * GUTTER, Math.ceil(f.w * d)));
        const ph = Math.max(2, Math.min(maxTex - 2 * GUTTER, Math.ceil(f.h * d)));
        items.push({ prim: p, face: f.face, w: f.w, h: f.h, pw, ph });
      }
    }
  };
  let W = 0, H = 0;
  let placed: AtlasRect[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    build();
    let area = 0;
    for (const it of items) area += (it.pw + 2 * GUTTER) * (it.ph + 2 * GUTTER);
    W = 64;
    while (W * W < area * 1.08) W *= 2;
    W = Math.min(W, maxTex);
    // shelf packing (tallest first)
    const order = [...items].sort((a, b) => b.ph - a.ph || b.pw - a.pw);
    placed = [];
    let x = 0, y = 0, rowH = 0;
    let ok = true;
    for (const it of order) {
      const fw = it.pw + 2 * GUTTER, fh = it.ph + 2 * GUTTER;
      if (fw > W) { ok = false; break; }
      if (x + fw > W) { x = 0; y += rowH; rowH = 0; }
      placed.push({ prim: it.prim, face: it.face, w: it.w, h: it.h, x: x + GUTTER, y: y + GUTTER, pw: it.pw, ph: it.ph });
      x += fw;
      rowH = Math.max(rowH, fh);
    }
    H = y + rowH;
    if (ok && H <= maxTex) break;
    density *= 0.85;
  }
  H = Math.max(4, Math.ceil(H / 4) * 4);
  const uv: AtlasLayout['uv'] = {};
  const mirror: AtlasLayout['mirror'] = {};
  for (const r of placed) {
    (uv[r.prim.id] ??= {})[r.face] = [r.x / W, r.y / H, (r.x + r.pw) / W, (r.y + r.ph) / H];
  }
  for (const p of prims) {
    if (!p.share) continue;
    const src = uv[p.share];
    if (!src) continue;
    const m: Partial<Record<FaceName, UVRect>> = {};
    for (const f of primFaces(p)) {
      const sf = p.mirror ? SWAP[f.face] ?? f.face : f.face;
      if (src[sf]) m[f.face] = src[sf];
    }
    uv[p.id] = m;
    mirror[p.id] = !!p.mirror;
  }
  return { W, H, rects: placed, uv, mirror, density };
}

// sRGB encode LUT (linear 0..1 in 4096 steps)
const SRGB = new Uint8Array(4097);
for (let i = 0; i <= 4096; i++) {
  const c = i / 4096;
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  SRGB[i] = Math.round(Math.max(0, Math.min(1, s)) * 255);
}
const enc = (c: number) => SRGB[c <= 0 ? 0 : c >= 1 ? 4096 : (c * 4096) | 0];
const b8 = (c: number) => (c <= 0 ? 0 : c >= 1 ? 255 : Math.round(c * 255));

export function newSample(): Sample {
  return { prim: '', bone: '', face: 'front', u: 0, v: 0, w: 1, h: 1, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 1, du: 0.01, r: 0.5, g: 0.5, b: 0.5, height: 0, rough: 0.6, ao: 1, sss: 0, em: 0, metal: 0, alpha: 1 };
}

/** Paint the atlas of a model definition. */
export function paintAtlas(def: ModelDef, layout = layoutAtlas(def)): TexData {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { W, H } = layout;
  const N = W * H;
  const alb = new Float32Array(N * 3);
  const hgt = new Float32Array(N);
  const rough = new Float32Array(N);
  const ao = new Float32Array(N);
  const sss = new Float32Array(N);
  const em = new Float32Array(N);
  const metal = new Float32Array(N);
  const alpha = new Float32Array(N);
  const s = newSample();
  const sp: SurfPoint = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 1 };
  let anyExtra = false;
  for (const r of layout.rects) {
    s.prim = r.prim.id;
    s.bone = r.prim.bone;
    s.face = r.face;
    s.w = r.w;
    s.h = r.h;
    s.du = Math.min(r.w / r.pw, r.h / r.ph);
    for (let j = 0; j < r.ph; j++) {
      const v = ((j + 0.5) / r.ph) * r.h;
      for (let i = 0; i < r.pw; i++) {
        const u = ((i + 0.5) / r.pw) * r.w;
        primPoint(r.prim, r.face, u, v, r.w, r.h, sp);
        s.u = u; s.v = v;
        s.x = sp.x; s.y = sp.y; s.z = sp.z;
        s.nx = sp.nx; s.ny = sp.ny; s.nz = sp.nz;
        s.r = 0.5; s.g = 0.5; s.b = 0.5;
        s.height = 0; s.rough = 0.6; s.ao = 1; s.sss = 0; s.em = 0; s.metal = 0; s.alpha = 1;
        def.paint(s);
        const k = (r.y + j) * W + r.x + i;
        alb[k * 3] = s.r; alb[k * 3 + 1] = s.g; alb[k * 3 + 2] = s.b;
        hgt[k] = s.height; rough[k] = s.rough; ao[k] = s.ao; sss[k] = s.sss;
        em[k] = s.em; metal[k] = s.metal; alpha[k] = s.alpha;
        if (s.em > 0 || s.metal > 0) anyExtra = true;
      }
    }
  }
  // ---- outputs
  const albedo = new Uint8Array(N * 4);
  const pbr = new Uint8Array(N * 4);
  const extra = anyExtra ? new Uint8Array(N * 4) : null;
  const ns = def.normalScale ?? 1;
  const useAlpha = (def.alphaTest ?? 0) > 0;
  const blur = new Float32Array(N);
  const tmp = new Float32Array(N);
  for (const r of layout.rects) {
    const du = r.w / r.pw, dv = r.h / r.ph;
    // cavity: box-blurred height (radius ~1.2 cm), separable, clamped to the rect
    const rad = Math.max(1, Math.min(12, Math.round(0.012 / Math.min(du, dv))));
    for (let j = 0; j < r.ph; j++) {
      const row = (r.y + j) * W + r.x;
      let acc = 0;
      for (let i = -rad; i <= rad; i++) acc += hgt[row + Math.max(0, Math.min(r.pw - 1, i))];
      for (let i = 0; i < r.pw; i++) {
        tmp[row + i] = acc / (2 * rad + 1);
        acc += hgt[row + Math.min(r.pw - 1, i + rad + 1)] - hgt[row + Math.max(0, i - rad)];
      }
    }
    for (let i = 0; i < r.pw; i++) {
      const col = r.y * W + r.x + i;
      let acc = 0;
      for (let j = -rad; j <= rad; j++) acc += tmp[col + Math.max(0, Math.min(r.ph - 1, j)) * W];
      for (let j = 0; j < r.ph; j++) {
        blur[col + j * W] = acc / (2 * rad + 1);
        acc += tmp[col + Math.min(r.ph - 1, j + rad + 1) * W] - tmp[col + Math.max(0, j - rad) * W];
      }
    }
    for (let j = 0; j < r.ph; j++)
      for (let i = 0; i < r.pw; i++) {
        const k = (r.y + j) * W + r.x + i;
        const kl = (r.y + j) * W + r.x + Math.max(0, i - 1), kr = (r.y + j) * W + r.x + Math.min(r.pw - 1, i + 1);
        const kd = (r.y + Math.max(0, j - 1)) * W + r.x + i, ku = (r.y + Math.min(r.ph - 1, j + 1)) * W + r.x + i;
        const dhdu = ((hgt[kr] - hgt[kl]) / ((Math.min(r.pw - 1, i + 1) - Math.max(0, i - 1)) * du || 1)) * ns;
        const dhdv = ((hgt[ku] - hgt[kd]) / ((Math.min(r.ph - 1, j + 1) - Math.max(0, j - 1)) * dv || 1)) * ns;
        let nx = -dhdu, ny = -dhdv;
        const l = Math.hypot(nx, ny, 1);
        nx /= l; ny /= l;
        const cav = 1 - Math.min(0.65, Math.max(0, (blur[k] - hgt[k]) * 110));
        const o = k * 4;
        albedo[o] = enc(alb[k * 3]); albedo[o + 1] = enc(alb[k * 3 + 1]); albedo[o + 2] = enc(alb[k * 3 + 2]);
        albedo[o + 3] = b8(useAlpha ? alpha[k] : sss[k]);
        pbr[o] = b8(nx * 0.5 + 0.5); pbr[o + 1] = b8(ny * 0.5 + 0.5); pbr[o + 2] = b8(rough[k]); pbr[o + 3] = b8(ao[k] * cav);
        if (extra) { extra[o] = b8(em[k]); extra[o + 1] = b8(metal[k]); extra[o + 2] = 0; extra[o + 3] = 255; }
      }
    // gutters: replicate edge texels
    for (const buf of extra ? [albedo, pbr, extra] : [albedo, pbr]) padRect(buf, W, H, r);
  }
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { key: def.key, W, H, albedo, pbr, extra, ms: t1 - t0 };
}

function padRect(buf: Uint8Array, W: number, H: number, r: AtlasRect) {
  const x0 = r.x, y0 = r.y, x1 = r.x + r.pw - 1, y1 = r.y + r.ph - 1;
  for (let j = y0 - GUTTER; j <= y1 + GUTTER; j++) {
    if (j < 0 || j >= H) continue;
    const sj = Math.max(y0, Math.min(y1, j));
    for (let i = x0 - GUTTER; i <= x1 + GUTTER; i++) {
      if (i < 0 || i >= W) continue;
      if (i >= x0 && i <= x1 && j >= y0 && j <= y1) continue;
      const si = Math.max(x0, Math.min(x1, i));
      const s = (sj * W + si) * 4, d = (j * W + i) * 4;
      buf[d] = buf[s]; buf[d + 1] = buf[s + 1]; buf[d + 2] = buf[s + 2]; buf[d + 3] = buf[s + 3];
    }
  }
}
