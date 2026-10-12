// Decoders for DOOM's graphic formats: palettes, colormaps, column-based
// patches, raw flats and composite wall textures (PNAMES + TEXTURE1/2).
// Images are kept as palette indices plus a coverage mask so the renderer can
// do the original palette/colormap lighting on the GPU.

import { lumpName } from './wad.js';

export function readPalettes(bytes) {
  // 14 palettes of 256 RGB triples.
  return new Uint8Array(bytes.slice(0, 14 * 768));
}

export function readColormaps(bytes) {
  // 34 maps of 256 indices: 0-31 light levels, 32 invulnerability, 33 black.
  return new Uint8Array(bytes.slice(0, 34 * 256));
}

export class IndexedImage {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height);
    this.mask = new Uint8Array(width * height);
    this.leftOffset = 0;
    this.topOffset = 0;
  }
}

function isValidPatch(bytes) {
  if (bytes.length < 8) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const w = v.getInt16(0, true);
  const h = v.getInt16(2, true);
  if (w <= 0 || h <= 0 || w > 4096 || h > 4096) return false;
  if (8 + w * 4 > bytes.length) return false;
  for (let x = 0; x < w; x++) {
    const off = v.getUint32(8 + x * 4, true);
    if (off >= bytes.length) return false;
  }
  return true;
}

export function decodePatch(bytes) {
  if (!isValidPatch(bytes)) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = v.getInt16(0, true);
  const height = v.getInt16(2, true);
  const img = new IndexedImage(width, height);
  img.leftOffset = v.getInt16(4, true);
  img.topOffset = v.getInt16(6, true);
  for (let x = 0; x < width; x++) {
    let p = v.getUint32(8 + x * 4, true);
    let lastTop = -1;
    while (p < bytes.length) {
      let top = bytes[p];
      if (top === 0xff) break;
      // DeePsea tall patches: a non-increasing topdelta is relative.
      if (top <= lastTop) top += lastTop;
      lastTop = top;
      const len = bytes[p + 1];
      p += 3;
      for (let i = 0; i < len; i++) {
        const y = top + i;
        if (y >= 0 && y < height && p + i < bytes.length) {
          img.pixels[y * width + x] = bytes[p + i];
          img.mask[y * width + x] = 255;
        }
      }
      p += len + 1;
    }
  }
  return img;
}

export function decodeFlat(bytes) {
  const size = bytes.length >= 4096 ? 64 : Math.floor(Math.sqrt(bytes.length));
  const img = new IndexedImage(64, size === 64 ? 64 : size);
  img.pixels.set(bytes.subarray(0, img.width * img.height));
  img.mask.fill(255);
  return img;
}

// Fullscreen raw 320x200 pictures (some ports store TITLEPIC raw).
export function decodeRaw320(bytes) {
  const img = new IndexedImage(320, 200);
  img.pixels.set(bytes.subarray(0, 64000));
  img.mask.fill(255);
  return img;
}

export function decodeGraphic(bytes) {
  if (!bytes) return null;
  const p = decodePatch(bytes);
  if (p) return p;
  if (bytes.length === 64000) return decodeRaw320(bytes);
  return null;
}

export function readPatchNames(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = v.getInt32(0, true);
  const names = [];
  for (let i = 0; i < n; i++) names.push(lumpName(bytes, 4 + i * 8));
  return names;
}

// Parses TEXTUREx definitions; returns [{name, width, height, patches:[{x,y,patch}] }]
export function readTextureDefs(bytes, patchNames) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = v.getInt32(0, true);
  const defs = [];
  for (let i = 0; i < n; i++) {
    const off = v.getInt32(4 + i * 4, true);
    const name = lumpName(bytes, off);
    const width = v.getInt16(off + 12, true);
    const height = v.getInt16(off + 14, true);
    const count = v.getInt16(off + 20, true);
    const patches = [];
    for (let j = 0; j < count; j++) {
      const p = off + 22 + j * 10;
      patches.push({
        x: v.getInt16(p, true),
        y: v.getInt16(p + 2, true),
        patch: patchNames[v.getInt16(p + 4, true)] || null,
      });
    }
    defs.push({ name, width, height, patches });
  }
  return defs;
}

export function composeTexture(def, getPatch) {
  const img = new IndexedImage(def.width, def.height);
  for (const pd of def.patches) {
    const patch = pd.patch && getPatch(pd.patch);
    if (!patch) continue;
    for (let y = 0; y < patch.height; y++) {
      const ty = pd.y + y;
      if (ty < 0 || ty >= def.height) continue;
      for (let x = 0; x < patch.width; x++) {
        const tx = pd.x + x;
        if (tx < 0 || tx >= def.width) continue;
        const si = y * patch.width + x;
        if (!patch.mask[si]) continue;
        const di = ty * def.width + tx;
        img.pixels[di] = patch.pixels[si];
        img.mask[di] = 255;
      }
    }
  }
  return img;
}

// Convert an indexed image to RGBA using a palette (for canvas previews etc).
export function toRGBA(img, palette, paletteIndex = 0) {
  const out = new Uint8ClampedArray(img.width * img.height * 4);
  const base = paletteIndex * 768;
  for (let i = 0; i < img.pixels.length; i++) {
    const c = img.pixels[i];
    out[i * 4] = palette[base + c * 3];
    out[i * 4 + 1] = palette[base + c * 3 + 1];
    out[i * 4 + 2] = palette[base + c * 3 + 2];
    out[i * 4 + 3] = img.mask[i];
  }
  return out;
}

// Find the palette index closest to an RGB colour.
export function nearestIndex(palette, r, g, b) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < 256; i++) {
    const dr = palette[i * 3] - r;
    const dg = palette[i * 3 + 1] - g;
    const db = palette[i * 3 + 2] - b;
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
