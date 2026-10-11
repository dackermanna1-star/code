// Pixel-level sprite painting for the GoldSrc HUD art (640 sprite set), plus
// the bilinear rescale used for the other sprite sets.

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/**
 * Tiny greyscale pixel painter: intensities 0..1, combined with max().
 * toCanvas() returns a white canvas with alpha = intensity.
 */
export class PixelSprite {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.v = new Float32Array(w * h);
  }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.v[y * this.w + x]; }
  set(x, y, a) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (a > this.v[i]) this.v[i] = a;
  }
  // Bresenham line between pixel centres; diagonal runs get a soft fringe
  line(x0, y0, x1, y1, a = 1, fringe = 0.6) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    const diag = dx && dy;
    let err = dx - dy, x = x0, y = y0;
    for (;;) {
      this.set(x, y, a);
      const end = (x === x0 && y === y0) || (x === x1 && y === y1);
      if (diag && !end) { this.set(x - 1, y, a * fringe); this.set(x + 1, y, a * fringe); }
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }
  // fill pixels whose centres lie strictly inside the polygon
  fill(pts, shade) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        if (insideStrict(pts, x, y)) this.set(x, y, typeof shade === 'function' ? shade(x, y) : shade);
      }
    }
  }
  outline(pts, a = 1) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      this.line(p[0], p[1], q[0], q[1], a);
    }
  }
  toCanvas() {
    const c = makeCanvas(this.w, this.h);
    const g = c.getContext('2d');
    const img = g.createImageData(this.w, this.h);
    for (let i = 0; i < this.v.length; i++) {
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = Math.round(Math.min(1, this.v[i]) * 255);
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}

function insideStrict(pts, x, y) {
  // point strictly inside (not on an edge) via winding + edge test
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    // on-edge test
    const cross = (xj - xi) * (y - yi) - (yj - yi) * (x - xi);
    if (Math.abs(cross) < 1e-9 && x >= Math.min(xi, xj) - 1e-9 && x <= Math.max(xi, xj) + 1e-9 && y >= Math.min(yi, yj) - 1e-9 && y <= Math.max(yi, yj) + 1e-9) return false;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Sprite post-pass shared by the HUD icons: convex outline corners are dimmed
 * and empty pixels beside a bright vertical edge get a faint glow, like the
 * box-filtered GoldSrc sprite art.
 */
export function finishSprite(p) {
  const src = p.v.slice();
  const at = (x, y) => (x < 0 || y < 0 || x >= p.w || y >= p.h ? 0 : src[y * p.w + x]);
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const i = y * p.w + x;
      const v = src[i];
      if (v >= 0.9) {
        let empty = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy) < 0.05) empty++;
        if (empty >= 5) p.v[i] = 0.5;
      } else if (v < 0.05) {
        if (at(x - 1, y) >= 0.9 && at(x - 1, y - 1) >= 0.9 && at(x - 1, y + 1) >= 0.9) p.v[i] = 0.22;
        else if (at(x + 1, y) >= 0.9 && at(x + 1, y - 1) >= 0.9 && at(x + 1, y + 1) >= 0.9) p.v[i] = 0.22;
      }
    }
  }
}

/** Scale a 640-set sprite canvas by k with bilinear filtering (k = 1 returns it). */
export function scaleSprite(c, k) {
  if (k === 1) return c;
  const s = makeCanvas(Math.round(c.width * k), Math.round(c.height * k));
  const g = s.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(c, 0, 0, s.width, s.height);
  return s;
}

