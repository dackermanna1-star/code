// Software pixel rasterizer used for characters.
// Renders shaded primitives (tapered limbs, ellipses, polygons) into a 32-bit
// pixel buffer with no anti-aliasing, then applies selective outlining
// ("sel-out"), interior depth lines, rim light and dynamic point lights.
// Because everything is rasterized at screen resolution, characters stay
// crisp pixel art at every camera zoom level.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U;

  const PROF_SAMPLES = 24;

  class Raster {
    constructor(w, h) {
      this.w = w;
      this.h = h;
      if (typeof ImageData !== 'undefined') this.img = new ImageData(w, h);
      else this.img = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
      this.px = new Uint32Array(this.img.data.buffer);
      this.grp = new Uint8Array(w * h);
      this.tmpIdx = new Int32Array(w * h);
      this.tmpCol = new Uint32Array(w * h);
      this.canvas = null;
      this.ctx = null;
      if (typeof document !== 'undefined') {
        this.canvas = document.createElement('canvas');
        this.canvas.width = w;
        this.canvas.height = h;
        this.ctx = this.canvas.getContext('2d');
      }
      // dirty rect of the current frame and the previous frame
      this.x0 = w; this.y0 = h; this.x1 = -1; this.y1 = -1;
      this.px0 = 0; this.py0 = 0; this.px1 = -1; this.py1 = -1;
      // lighting
      const L = [-0.42, -0.62, 0.66];
      const ll = Math.hypot(L[0], L[1], L[2]);
      this.L = [L[0] / ll, L[1] / ll, L[2] / ll];
      this.rim = { x: 0.8, y: -0.25, c: [255, 120, 60], k: 0.55 };
      this.ambient = [1, 1, 1];
      this.ambKey = 1001001000;
      this.lights = [];
      this.override = 0;
      this.flash = 0;
      this.tint = null; // [r,g,b,k]
      this.ditherAmt = 0.06;
      this.thr = [-0.18, 0.22, 0.74];
      this.profW = new Float32Array(PROF_SAMPLES + 1);
      this.profF = new Float32Array(PROF_SAMPLES + 1);
    }

    begin() {
      // clear previous dirty rect
      const w = this.w;
      if (this.px1 >= this.px0) {
        for (let y = this.py0; y <= this.py1; y++) {
          const o = y * w;
          this.px.fill(0, o + this.px0, o + this.px1 + 1);
          this.grp.fill(0, o + this.px0, o + this.px1 + 1);
        }
      }
      this.x0 = this.w; this.y0 = this.h; this.x1 = -1; this.y1 = -1;
      this.override = 0;
      this.flash = 0;
      this.tint = null;
      this.lights.length = 0;
      this.ambKey = -1;
    }

    // Must be called after changing `ambient` (done lazily by shade via ambKey).
    setAmbient(a) {
      this.ambient = a;
      this.ambKey = Math.round(a[0] * 1000) * 1e6 + Math.round(a[1] * 1000) * 1e3 + Math.round(a[2] * 1000);
    }

    _grow(x0, y0, x1, y1) {
      if (x0 < this.x0) this.x0 = x0;
      if (y0 < this.y0) this.y0 = y0;
      if (x1 > this.x1) this.x1 = x1;
      if (y1 > this.y1) this.y1 = y1;
    }

    // Compute final packed color for a material and a surface normal.
    shade(mat, nx, ny, nz, x, y) {
      if (this.override) return this.override;
      const L = this.L;
      const lum = nx * L[0] + ny * L[1] + nz * L[2];
      const t = this.thr;
      // ordered dither across band edges
      const dz = this.ditherAmt;
      const chk = (x + y) & 1 ? dz : -dz;
      let band;
      if (lum < t[0]) band = lum > t[0] - dz && chk > 0 ? 1 : 0;
      else if (lum < t[1]) band = lum > t[1] - dz && chk > 0 ? 2 : lum < t[0] + dz && chk < 0 ? 0 : 1;
      else if (lum < t[2]) band = lum > t[2] - dz && chk > 0 ? 3 : lum < t[1] + dz && chk < 0 ? 1 : 2;
      else band = lum < t[2] + dz && chk < 0 ? 2 : 3;
      // fast path: no rim, no light in range, no tint/flash -> cached packed tone
      const rim = this.rim;
      const rd = nx * rim.x + ny * rim.y;
      const rimHit = !mat.emissive && rim.k > 0 && rd > 0.66 && nz < 0.5;
      let lightHit = false;
      if (!mat.emissive) {
        const lights = this.lights;
        for (let i = 0; i < lights.length; i++) {
          const li = lights[i];
          const dx = li.x - x, dy = li.y - y;
          if (dx * dx + dy * dy < li.r2) { lightHit = true; break; }
        }
      }
      if (!rimHit && !lightHit && !this.tint && this.flash <= 0) {
        if (mat._ak !== this.ambKey) this.cacheMat(mat);
        return mat._pk[band];
      }
      const c = mat.tones[band];
      let r = c[0], g = c[1], b = c[2];
      if (!mat.emissive) {
        if (rimHit) {
          const k = rim.k * (rd > 0.84 && nz < 0.35 ? 0.62 : 0.3);
          r += (rim.c[0] - r) * k;
          g += (rim.c[1] - g) * k;
          b += (rim.c[2] - b) * k;
        }
        if (lightHit) {
          // dynamic point lights (posterized)
          const lights = this.lights;
          for (let i = 0; i < lights.length; i++) {
            const li = lights[i];
            const dx = li.x - x, dy = li.y - y;
            const d2 = dx * dx + dy * dy;
            if (d2 >= li.r2) continue;
            const d = Math.sqrt(d2) + 0.001;
            const ndl = (nx * dx + ny * dy) / d * 0.85 + nz * 0.35;
            if (ndl <= 0) continue;
            let k = ndl * (1 - d / li.r) * li.i;
            k = Math.round(k * 4) / 4;
            if (k <= 0) continue;
            r += li.c[0] * k;
            g += li.c[1] * k;
            b += li.c[2] * k;
          }
        }
        const a = this.ambient;
        r *= a[0]; g *= a[1]; b *= a[2];
      }
      if (this.tint) {
        const tn = this.tint;
        r += (tn[0] - r) * tn[3];
        g += (tn[1] - g) * tn[3];
        b += (tn[2] - b) * tn[3];
      }
      if (this.flash > 0) {
        const f = this.flash;
        r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f;
      }
      r = r > 255 ? 255 : r < 0 ? 0 : r | 0;
      g = g > 255 ? 255 : g < 0 ? 0 : g | 0;
      b = b > 255 ? 255 : b < 0 ? 0 : b | 0;
      return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    }

    // Pre-pack a material's tones under the current ambient light.
    cacheMat(mat) {
      const a = mat.emissive ? [1, 1, 1] : this.ambient;
      mat._pk = mat.tones.map((c) => U.pack(c[0] * a[0], c[1] * a[1], c[2] * a[2], 255));
      mat._ak = this.ambKey;
    }

    // Tapered limb: axis from (ax,ay) to (bx,by). prof: [[t, wBack, wFront], ...]
    // side: +1/-1 selects which perpendicular is "front".
    limb(ax, ay, bx, by, prof, mat, g, side = 1, capA = true, capB = true) {
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy) || 0.0001;
      const ux = dx / len, uy = dy / len;
      const pX = uy * side, pY = -ux * side;
      // precompute profile
      const N = PROF_SAMPLES;
      const PW = this.profW, PF = this.profF;
      let maxW = 0;
      let k = 0;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        while (k < prof.length - 2 && prof[k + 1][0] < t) k++;
        const p0 = prof[k], p1 = prof[Math.min(k + 1, prof.length - 1)];
        const tt = p1[0] === p0[0] ? 0 : U.clamp((t - p0[0]) / (p1[0] - p0[0]), 0, 1);
        PW[i] = p0[1] + (p1[1] - p0[1]) * tt;
        PF[i] = p0[2] + (p1[2] - p0[2]) * tt;
        if (PW[i] > maxW) maxW = PW[i];
        if (PF[i] > maxW) maxW = PF[i];
      }
      const rA = (PW[0] + PF[0]) * 0.5, rB = (PW[N] + PF[N]) * 0.5;
      let x0 = Math.floor(Math.min(ax, bx) - maxW - 1), x1 = Math.ceil(Math.max(ax, bx) + maxW + 1);
      let y0 = Math.floor(Math.min(ay, by) - maxW - 1), y1 = Math.ceil(Math.max(ay, by) + maxW + 1);
      if (x0 < 0) x0 = 0;
      if (y0 < 0) y0 = 0;
      if (x1 >= this.w) x1 = this.w - 1;
      if (y1 >= this.h) y1 = this.h - 1;
      if (x1 < x0 || y1 < y0) return;
      const w = this.w, px = this.px, grp = this.grp;
      let any = false;
      const maxR = Math.max(maxW, rA, rB);
      for (let y = y0; y <= y1; y++) {
        const ry = y + 0.5 - ay;
        // tight x-interval for this row: |perp| <= maxR and -rA <= along <= len + rB
        let xa = x0, xb = x1;
        if (Math.abs(pX) > 1e-4) {
          const c0 = (-maxR - ry * pY) / pX, c1 = (maxR - ry * pY) / pX;
          const lo = Math.min(c0, c1) + ax - 0.5, hi = Math.max(c0, c1) + ax - 0.5;
          if (lo > xa) xa = Math.floor(lo);
          if (hi < xb) xb = Math.ceil(hi);
        } else if (Math.abs(ry * pY) > maxR) continue;
        if (Math.abs(ux) > 1e-4) {
          const c0 = (-rA - ry * uy) / ux, c1 = (len + rB - ry * uy) / ux;
          const lo = Math.min(c0, c1) + ax - 0.5, hi = Math.max(c0, c1) + ax - 0.5;
          if (lo > xa) xa = Math.floor(lo);
          if (hi < xb) xb = Math.ceil(hi);
        }
        if (xb < xa) continue;
        let o = y * w + xa;
        for (let x = xa; x <= xb; x++, o++) {
          const rx = x + 0.5 - ax;
          const along = rx * ux + ry * uy;
          const s = rx * pX + ry * pY;
          let nx, ny, nz;
          if (along < 0) {
            if (!capA) continue;
            const d2 = rx * rx + ry * ry;
            if (d2 > rA * rA) continue;
            nx = rx / rA; ny = ry / rA;
            nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          } else if (along > len) {
            if (!capB) continue;
            const qx = x + 0.5 - bx, qy = y + 0.5 - by;
            const d2 = qx * qx + qy * qy;
            if (d2 > rB * rB) continue;
            nx = qx / rB; ny = qy / rB;
            nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          } else {
            const ti = (along / len) * N;
            const i0 = ti | 0;
            const f = ti - i0;
            const i1 = i0 < N ? i0 + 1 : N;
            const wv = s >= 0 ? PF[i0] + (PF[i1] - PF[i0]) * f : PW[i0] + (PW[i1] - PW[i0]) * f;
            const as = s < 0 ? -s : s;
            if (as > wv || wv <= 0) continue;
            const nn = s / wv;
            nx = pX * nn; ny = pY * nn;
            nz = Math.sqrt(Math.max(0, 1 - nn * nn));
          }
          px[o] = this.shade(mat, nx, ny, nz, x, y);
          grp[o] = g;
          any = true;
        }
      }
      if (any) this._grow(x0, y0, x1, y1);
    }

    ellipse(cx, cy, rx, ry, ang, mat, g) {
      const c = Math.cos(ang), s = Math.sin(ang);
      const R = Math.max(rx, ry) + 1;
      let x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R), y0 = Math.floor(cy - R), y1 = Math.ceil(cy + R);
      if (x0 < 0) x0 = 0;
      if (y0 < 0) y0 = 0;
      if (x1 >= this.w) x1 = this.w - 1;
      if (y1 >= this.h) y1 = this.h - 1;
      if (x1 < x0 || y1 < y0) return;
      const w = this.w, px = this.px, grp = this.grp;
      let any = false;
      for (let y = y0; y <= y1; y++) {
        const dy = y + 0.5 - cy;
        let o = y * w + x0;
        for (let x = x0; x <= x1; x++, o++) {
          const dx = x + 0.5 - cx;
          const lx = (dx * c + dy * s) / rx, ly = (-dx * s + dy * c) / ry;
          const d2 = lx * lx + ly * ly;
          if (d2 > 1) continue;
          const nx = lx * c - ly * s, ny = lx * s + ly * c;
          px[o] = this.shade(mat, nx, ny, Math.sqrt(1 - d2), x, y);
          grp[o] = g;
          any = true;
        }
      }
      if (any) this._grow(x0, y0, x1, y1);
    }

    // Polygon fill (even-odd). shading: {sphere:[cx,cy,R]} | {n:[nx,ny,nz]} | {band:i}
    poly(pts, mat, g, shading) {
      const n = pts.length >> 1;
      if (n < 3) return;
      let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
      for (let i = 0; i < n; i++) {
        const x = pts[i * 2], y = pts[i * 2 + 1];
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      let y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(this.h - 1, Math.ceil(maxY));
      const w = this.w, px = this.px, grp = this.grp;
      const xs = [];
      let any = false;
      let sx = 0, sy = 0, sR = 1, fixed = null, bandC = 0;
      const mode = shading ? (shading.sphere ? 1 : shading.n ? 2 : shading.color != null ? 3 : 0) : 0;
      if (mode === 1) { sx = shading.sphere[0]; sy = shading.sphere[1]; sR = shading.sphere[2]; }
      else if (mode === 2) fixed = shading.n;
      else if (mode === 3) bandC = shading.color;
      for (let y = y0; y <= y1; y++) {
        const cy = y + 0.5;
        xs.length = 0;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const yi = pts[i * 2 + 1], yj = pts[j * 2 + 1];
          if ((yi > cy) !== (yj > cy)) {
            const xi = pts[i * 2], xj = pts[j * 2];
            xs.push(xi + ((cy - yi) / (yj - yi)) * (xj - xi));
          }
        }
        if (xs.length < 2) continue;
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          let xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
          if (xb < xa) continue;
          let o = y * w + xa;
          for (let x = xa; x <= xb; x++, o++) {
            let col;
            if (mode === 3) col = bandC;
            else if (mode === 1) {
              let nx = (x + 0.5 - sx) / sR, ny = (cy - sy) / sR;
              const d2 = nx * nx + ny * ny;
              let nz;
              if (d2 > 1) { const dd = Math.sqrt(d2); nx /= dd; ny /= dd; nz = 0; }
              else nz = Math.sqrt(1 - d2);
              col = this.shade(mat, nx, ny, nz, x, y);
            } else if (mode === 2) col = this.shade(mat, fixed[0], fixed[1], fixed[2], x, y);
            else col = this.shade(mat, 0, -0.2, 0.98, x, y);
            px[o] = col;
            grp[o] = g;
            any = true;
          }
          if (xa < minX) minX = xa;
        }
      }
      if (any) this._grow(Math.max(0, Math.floor(minX)), y0, Math.min(w - 1, Math.ceil(maxX)), y1);
    }

    // Solid-color thick line for details (no shading). col: packed color.
    line(x0, y0, x1, y1, col, g, width = 1, onlyOver = false) {
      const dx = x1 - x0, dy = y1 - y0;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 1.5));
      const w = this.w, h = this.h, px = this.px, grp = this.grp;
      const r = width / 2;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const cx = x0 + dx * t, cy = y0 + dy * t;
        if (width <= 1) {
          const x = Math.floor(cx), y = Math.floor(cy);
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const o = y * w + x;
          if (onlyOver && !px[o]) continue;
          px[o] = col;
          if (!onlyOver) grp[o] = g;
          this._grow(x, y, x, y);
        } else {
          const xa = Math.floor(cx - r), xb = Math.floor(cx + r - 0.01), ya = Math.floor(cy - r), yb = Math.floor(cy + r - 0.01);
          for (let y = ya; y <= yb; y++)
            for (let x = xa; x <= xb; x++) {
              if (x < 0 || y < 0 || x >= w || y >= h) continue;
              const o = y * w + x;
              if (onlyOver && !px[o]) continue;
              px[o] = col;
              if (!onlyOver) grp[o] = g;
            }
          this._grow(Math.max(0, xa), Math.max(0, ya), Math.min(w - 1, xb), Math.min(h - 1, yb));
        }
      }
    }

    dot(x, y, col, g, onlyOver = false) {
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const o = y * this.w + x;
      if (onlyOver && !this.px[o]) return;
      this.px[o] = col;
      if (!onlyOver) this.grp[o] = g;
      this._grow(x, y, x, y);
    }

    // Selective outline + interior depth lines.
    // dark: [r,g,b] outline base. aura: optional packed outline override (glow).
    outline(dark, aura, interior = true, gap = 2) {
      if (this.x1 < this.x0) return;
      const w = this.w, h = this.h, px = this.px, grp = this.grp;
      const x0 = Math.max(0, this.x0 - 1), x1 = Math.min(w - 1, this.x1 + 1);
      const y0 = Math.max(0, this.y0 - 1), y1 = Math.min(h - 1, this.y1 + 1);
      const idx = this.tmpIdx, cols = this.tmpCol;
      let n = 0;
      const dr = dark[0], dg = dark[1], db = dark[2];
      const sel = (c, k) => {
        const r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
        return U.pack(r * k + dr * (1 - k), g * k + dg * (1 - k), b * k + db * (1 - k), 255);
      };
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const o = y * w + x;
          const c = px[o];
          if (c === 0) {
            // exterior outline
            let nc = 0;
            if (x > 0 && px[o - 1]) nc = px[o - 1];
            else if (x < w - 1 && px[o + 1]) nc = px[o + 1];
            else if (y > 0 && px[o - w]) nc = px[o - w];
            else if (y < h - 1 && px[o + w]) nc = px[o + w];
            if (nc) {
              idx[n] = o;
              cols[n++] = aura || sel(nc, 0.22);
            }
          } else if (interior) {
            const g = grp[o];
            if (g === 0 || g >= 250) continue;
            let hit = false;
            if (x < w - 1 && grp[o + 1] >= g + gap && grp[o + 1] < 250) hit = true;
            else if (x > 0 && grp[o - 1] >= g + gap && grp[o - 1] < 250) hit = true;
            else if (y > 0 && grp[o - w] >= g + gap && grp[o - w] < 250) hit = true;
            else if (y < h - 1 && grp[o + w] >= g + gap && grp[o + w] < 250) hit = true;
            if (hit) {
              idx[n] = o;
              cols[n++] = sel(c, 0.4);
            }
          }
        }
      }
      for (let i = 0; i < n; i++) {
        px[idx[i]] = cols[i];
        if (!grp[idx[i]]) grp[idx[i]] = 251;
      }
      this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
    }

    // Adds a second, outer glow ring (for auras) around the current silhouette.
    glowRing(col) {
      if (this.x1 < this.x0) return;
      const w = this.w, h = this.h, px = this.px, grp = this.grp;
      const x0 = Math.max(0, this.x0 - 1), x1 = Math.min(w - 1, this.x1 + 1);
      const y0 = Math.max(0, this.y0 - 1), y1 = Math.min(h - 1, this.y1 + 1);
      const idx = this.tmpIdx;
      let n = 0;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const o = y * w + x;
          if (px[o]) continue;
          if ((x > 0 && px[o - 1]) || (x < w - 1 && px[o + 1]) || (y > 0 && px[o - w]) || (y < h - 1 && px[o + w]))
            idx[n++] = o;
        }
      for (let i = 0; i < n; i++) {
        px[idx[i]] = col;
        grp[idx[i]] = 252;
      }
      this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
    }

    // Upload dirty region to the backing canvas and remember it for clearing.
    flush() {
      this.px0 = Math.max(0, this.x0);
      this.py0 = Math.max(0, this.y0);
      this.px1 = Math.min(this.w - 1, this.x1);
      this.py1 = Math.min(this.h - 1, this.y1);
      if (this.ctx && this.px1 >= this.px0) {
        // clear previous canvas contents (whole canvas is cheap enough to region-clear)
        this.ctx.clearRect(0, 0, this.w, this.h);
        this.ctx.putImageData(this.img, 0, 0, this.px0, this.py0, this.px1 - this.px0 + 1, this.py1 - this.py0 + 1);
      }
    }

    get bbox() {
      return [this.px0, this.py0, this.px1 - this.px0 + 1, this.py1 - this.py0 + 1];
    }

    drawTo(ctx, alpha = 1) {
      const b = this.bbox;
      if (b[2] <= 0 || b[3] <= 0 || !this.canvas) return;
      if (alpha < 1) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(this.canvas, b[0], b[1], b[2], b[3], b[0], b[1], b[2], b[3]);
        ctx.globalAlpha = 1;
      } else ctx.drawImage(this.canvas, b[0], b[1], b[2], b[3], b[0], b[1], b[2], b[3]);
    }
  }

  JJK.Raster = Raster;
})();
