// Sprite-chunk gibs. When a demon is torn apart, its current sprite frame is
// cut into chunks of the original pixel art (cached per frame image), which
// then fly as physical bodies: tumbling, bouncing off walls and floors,
// sliding down steps and leaving blood. A head slice is used for head pops.

import { IndexedImage } from '../wad/graphics.js';

export class ChunkCache {
  constructor(res) {
    this.res = res;
    this.cache = new Map();
    this.heads = new Map();
  }

  // Returns [{id, ox, oy, w, h}] where ox/oy is the chunk centre relative to
  // the sprite's origin in sprite pixels (x right, y up from the bottom).
  chunks(imageId, cell = 11) {
    const key = `${imageId}:${cell}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const info = this.res.images[imageId];
    const out = [];
    if (info && info.img) {
      const img = info.img;
      const cols = Math.max(1, Math.round(img.width / cell));
      const rows = Math.max(1, Math.round(img.height / cell));
      const cw = Math.ceil(img.width / cols), ch = Math.ceil(img.height / rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // Jagged cut: each chunk takes a slightly irregular region.
          const x0 = c * cw, y0 = r * ch;
          const w = Math.min(cw + 2, img.width - x0), h = Math.min(ch + 2, img.height - y0);
          if (w <= 1 || h <= 1) continue;
          const chunk = new IndexedImage(w, h);
          let solid = 0;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const si = (y0 + y) * img.width + (x0 + x);
              const edge = (x >= cw || y >= ch) ? 0.5 : 0;
              if (img.mask[si] && Math.random() > edge) {
                chunk.pixels[y * w + x] = img.pixels[si];
                chunk.mask[y * w + x] = 255;
                solid++;
              }
            }
          }
          if (solid < w * h * 0.22 || solid < 6) continue;
          chunk.leftOffset = w >> 1;
          chunk.topOffset = h >> 1;
          const id = this.res.addImage(chunk, `gib-${imageId}-${r}-${c}`);
          out.push({
            id, w, h,
            ox: x0 + w / 2 - info.leftOffset,
            oy: info.topOffset - (y0 + h / 2),
          });
        }
      }
    }
    this.cache.set(key, out);
    return out;
  }

  // Top slice of a sprite (head) as one chunk.
  head(imageId, frac = 0.24) {
    if (this.heads.has(imageId)) return this.heads.get(imageId);
    const info = this.res.images[imageId];
    let out = null;
    if (info && info.img) {
      const img = info.img;
      // Find the first opaque row, then take `frac` of the visible height.
      let top = 0;
      outer: for (; top < img.height; top++) for (let x = 0; x < img.width; x++) if (img.mask[top * img.width + x]) break outer;
      const h = Math.max(4, Math.round((img.height - top) * frac));
      let minx = img.width, maxx = -1;
      for (let y = top; y < top + h; y++) {
        for (let x = 0; x < img.width; x++) if (img.mask[y * img.width + x]) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); }
      }
      if (maxx >= minx) {
        const w = maxx - minx + 1;
        const chunk = new IndexedImage(w, h);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const si = (top + y) * img.width + minx + x;
            if (img.mask[si]) { chunk.pixels[y * w + x] = img.pixels[si]; chunk.mask[y * w + x] = 255; }
          }
        }
        chunk.leftOffset = w >> 1;
        chunk.topOffset = h >> 1;
        out = {
          id: this.res.addImage(chunk, `head-${imageId}`), w, h,
          ox: minx + w / 2 - info.leftOffset,
          oy: info.topOffset - (top + h / 2),
          neck: info.topOffset - (top + h),
        };
      }
    }
    this.heads.set(imageId, out);
    return out;
  }
}

// A flying piece of a body. Integrated per tic.
export class Gib {
  constructor(x, y, z, vx, vy, vz, image, blood, opts = {}) {
    this.x = this.px = x;
    this.y = this.py = y;
    this.z = this.pz = z;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.image = image;
    this.blood = blood;
    this.roll = Math.random() * Math.PI * 2;
    this.proll = this.roll;
    this.spin = (Math.random() - 0.5) * 0.9;
    this.life = opts.life || 35 * 30;
    this.age = 0;
    this.resting = false;
    this.bounces = 0;
    this.trail = opts.trail ?? 18;
    this.flip = Math.random() < 0.5;
    this.light = 160;
    this.radius = opts.radius || 4;
    this.sound = opts.sound !== false;
    this.isHead = !!opts.isHead;
    this.scale = opts.scale || 1;
  }
}
