// Vice City's textures: the 26 Poly Haven photo scans of assets/texdata.js
// loaded into ONE colour texture array and ONE normal-map texture array,
// plus a few textures drawn in code (tileable noise, water ripples, clouds).
//
//   const tex = viceTextures(renderer);
//   tex.col   {value: DataArrayTexture}  sRGB colour, 512 px, layer order = TEX (mipmapped, repeat)
//   tex.nor   {value: DataArrayTexture}  tangent-space normal maps (OpenGL, +Y up), 256 px
//   tex.ready Promise                    resolves once the real scans have replaced the placeholders
//   TEX_LAYER[key] -> layer index        e.g. TEX_LAYER.asphalt === 0
//   TEX_KEYS[i] -> key                   texAvg(key) -> THREE.Color (linear) of the scan's average
//
// Put `tex.col` / `tex.nor` (the uniform OBJECTS, not their values) straight
// into your material's uniforms: until decoding finishes each layer is a 4x4
// placeholder in that scan's average colour (normal maps flat), then the
// uniform's value is swapped for the real array, with no recompile.
// In GLSL: `precision highp sampler2DArray; uniform sampler2DArray tCol;`
//          `texture(tCol, vec3(uv, float(layer)))`.
//
// Layers (key: scan): asphalt, asphaltWorn, sidewalk, pavers, herringbone,
// brickPave, lawn, sand, wetSand, stucco, plaster, facade, cladding, concrete,
// blockWall, brick, marble, floorTiles, whiteTiles, roofTiles, deck,
// metalSheet, shutter, rust, palmBark, gravel.
import * as THREE from 'three';
import { TEX } from '../assets/texdata.js';
import { Simplex, rng } from '../../outbreak/noise.js';

export const TEX_KEYS = TEX.map((t) => t.key);
export const TEX_LAYER = Object.fromEntries(TEX.map((t, i) => [t.key, i]));

const cache = {};
let maxAniso = 4;

const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** The average colour of a scan (linear, for tints and far LODs). */
export function texAvg(key) { return new THREE.Color(TEX[TEX_LAYER[key]]?.avg || '#808080'); }

function arrayTexture(data, size, n, normal, mips) {
  const t = new THREE.DataArrayTexture(data, size, size, n);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mips;
  if (mips) t.anisotropy = maxAniso;
  if (!normal) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function placeholder(normal) {
  const n = TEX.length, data = new Uint8Array(4 * 4 * 4 * n);
  for (let l = 0; l < n; l++) {
    const c = normal ? [128, 128, 255] : hexRGB(TEX[l].avg);
    for (let p = 0; p < 16; p++) { const o = (l * 16 + p) * 4; data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255; }
  }
  return arrayTexture(data, 4, n, normal, false);
}

async function decode(url, size) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, size, size);
  return x.getImageData(0, 0, size, size).data;
}

async function build(field, size, normal) {
  const n = TEX.length, data = new Uint8Array(size * size * 4 * n);
  const imgs = await Promise.all(TEX.map((t) => (t[field] ? decode(t[field], size).catch(() => null) : null)));
  imgs.forEach((px, l) => {
    if (px) { data.set(px, l * size * size * 4); return; }
    const c = normal ? [128, 128, 255] : hexRGB(TEX[l].avg);
    for (let p = 0; p < size * size; p++) { const o = (l * size * size + p) * 4; data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255; }
  });
  return arrayTexture(data, size, n, normal, true);
}

/** The photo texture arrays as uniforms {col, nor} plus `ready` (see the top of this file). Shared. */
export function viceTextures(renderer) {
  if (cache.photos) return cache.photos;
  maxAniso = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 4);
  const u = { col: { value: placeholder(false) }, nor: { value: placeholder(true) }, layers: TEX_LAYER, keys: TEX_KEYS };
  u.ready = (typeof document === 'undefined' ? Promise.resolve() : Promise.all([
    build('col', 512, false).then((t) => { const o = u.col.value; u.col.value = t; o.dispose(); }),
    build('nor', 256, true).then((t) => { const o = u.nor.value; u.nor.value = t; o.dispose(); }),
  ])).catch((e) => console.warn('vice textures', e));
  cache.photos = u;
  return u;
}

// ---- textures drawn in code ------------------------------------------------
function dataTex(key, w, h, fill, o = {}) {
  if (cache[key]) return cache[key];
  const data = new Uint8Array(w * h * 4);
  fill(data, w, h);
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = o.aniso || 1;
  t.needsUpdate = true;
  cache[key] = t;
  return t;
}

/** Tileable fbm noise, 256x256, linear: r, g, b = three different fields (a = 1). */
export function noiseTex() {
  return dataTex('noise', 256, 256, (d, w, h) => {
    const ns = [new Simplex(5), new Simplex(11), new Simplex(23)];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const a = (i / w) * Math.PI * 2, b = (j / h) * Math.PI * 2, k = (j * w + i) * 4;
      for (let c = 0; c < 3; c++) {
        // tileable: sample a 4D torus folded into two 2D noise calls
        let v = 0, amp = 1, f = 1, s = 0;
        for (let o = 0; o < 5; o++) {
          v += amp * (ns[c].noise(Math.cos(a) * f * 1.3 + 17 * c, Math.sin(a) * f * 1.3 + Math.cos(b) * f * 1.3) + ns[c].noise(Math.sin(b) * f * 1.3 + 5, Math.cos(b) * f * 1.3 + Math.sin(a) * f * 0.7)) * 0.5;
          s += amp; amp *= 0.5; f *= 2;
        }
        d[k + c] = Math.max(0, Math.min(255, Math.round(128 + 180 * (v / s))));
      }
      d[k + 3] = 255;
    }
  });
}

/** A tileable water normal map (xy in rg, from a sum of waves), 256x256, linear. */
export function waterNormalTex() {
  return dataTex('waterN', 256, 256, (d, w, h) => {
    const r = rng(3), waves = [];
    for (let i = 0; i < 34; i++) {
      const kx = Math.round((r() - 0.5) * 16), ky = Math.round((r() - 0.5) * 16);
      if (!kx && !ky) continue;
      waves.push({ kx, ky, a: 1 / Math.hypot(kx, ky) ** 1.2, p: r() * 6.28 });
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let dx = 0, dy = 0;
      for (const v of waves) { const c = Math.cos((v.kx * i / w + v.ky * j / h) * Math.PI * 2 + v.p) * v.a; dx += c * v.kx; dy += c * v.ky; }
      const nx = -dx * 0.055, ny = -dy * 0.055, l = Math.hypot(nx, ny, 1), k = (j * w + i) * 4;
      d[k] = Math.round((nx / l * 0.5 + 0.5) * 255); d[k + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); d[k + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); d[k + 3] = 255;
    }
  }, { aniso: 4 });
}

/**
 * Cloud noise, 256x256 tileable, linear:
 * r = billowy cumulus shapes (inverted Worley fbm x Perlin), g = fine detail for the edges,
 * b = streaky fbm (cirrus), a = smooth low-frequency coverage.
 */
export function cloudTex() {
  return dataTex('clouds', 256, 256, (d, w, h) => {
    const sn = new Simplex(77), r = rng(41);
    // tileable Worley: feature points on a grid that wraps
    const worley = (u, v, cells) => {
      const pts = worley.cache[cells] || (worley.cache[cells] = Array.from({ length: cells * cells }, () => [r(), r()]));
      const fu = u * cells, fv = v * cells, iu = Math.floor(fu), iv = Math.floor(fv);
      let best = 9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ci = iu + di, cj = iv + dj, p = pts[((cj % cells + cells) % cells) * cells + ((ci % cells + cells) % cells)];
        const dx = ci + p[0] - fu, dy = cj + p[1] - fv, dd = dx * dx + dy * dy;
        if (dd < best) best = dd;
      }
      return Math.sqrt(best);
    };
    worley.cache = {};
    const tor = (u, v, f, o) => {
      // tileable simplex: a torus in 4D approximated by two 2D slices
      const a = u * Math.PI * 2, b = v * Math.PI * 2, R = f / (Math.PI * 2);
      return (sn.noise(Math.cos(a) * R + o, Math.sin(a) * R + Math.cos(b) * R * 0.5) + sn.noise(Math.cos(b) * R + o * 1.7, Math.sin(b) * R + Math.sin(a) * R * 0.5)) * 0.5;
    };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const u = i / w, v = j / h, k = (j * w + i) * 4;
      const wf = (1 - worley(u, v, 4)) * 0.55 + (1 - worley(u, v, 8)) * 0.3 + (1 - worley(u, v, 16)) * 0.15;
      const pf = tor(u, v, 4, 0) * 0.6 + tor(u, v, 8, 3) * 0.3 + tor(u, v, 16, 7) * 0.1;
      const billow = Math.max(0, Math.min(1, wf * 1.15 - 0.25 + pf * 0.45));
      const det = (1 - worley(u, v, 24)) * 0.6 + (1 - worley(u, v, 48)) * 0.4;
      let cir = 0, amp = 1, s = 0;
      for (let o = 0; o < 4; o++) { cir += amp * tor(u * 1, v, 3 * 2 ** o, 11 + o); s += amp; amp *= 0.55; }
      d[k] = Math.round(billow * 255);
      d[k + 1] = Math.round(Math.max(0, Math.min(1, det)) * 255);
      d[k + 2] = Math.round(Math.max(0, Math.min(1, 0.5 + cir / s * 0.9)) * 255);
      d[k + 3] = Math.round(Math.max(0, Math.min(1, 0.5 + tor(u, v, 2, 21) * 0.8)) * 255);
    }
  }, { aniso: 4 });
}
