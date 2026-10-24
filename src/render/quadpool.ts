// GPU storage for voxel quads: one big RGBA32UI texture (4 x u32 per quad) with a simple
// first-fit range allocator. All voxel geometry (static regions and dynamic bodies) is drawn with
// vertex pulling from this texture, which lets us issue everything with a handful of multi-draws.

import type { GL } from './gl';

export const QW_SHIFT = 12;
export const QW = 1 << QW_SHIFT; // texels per row
const BLOCK = 16;

export class QuadPool {
  tex: WebGLTexture;
  rows: number;
  capacity: number;
  private top = 0;
  private freeStart: number[] = [];
  private freeSize: number[] = [];
  used = 0;

  constructor(readonly gl: GL, initialRows = 256) {
    this.rows = initialRows;
    this.capacity = initialRows * QW;
    this.tex = this.createTex(initialRows);
  }

  private createTex(rows: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32UI, QW, rows);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return t;
  }

  private grow(minCapacity: number): void {
    const gl = this.gl;
    let rows = this.rows;
    while (rows * QW < minCapacity) rows *= 2;
    const maxRows = Math.min(16384, (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number));
    if (rows > maxRows) throw new Error('QuadPool exhausted');
    const nt = this.createTex(rows);
    const rfb = gl.createFramebuffer(), dfb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rfb);
    gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dfb);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, nt, 0);
    gl.blitFramebuffer(0, 0, QW, this.rows, 0, 0, QW, this.rows, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.deleteFramebuffer(rfb); gl.deleteFramebuffer(dfb);
    gl.deleteTexture(this.tex);
    this.tex = nt;
    this.rows = rows;
    this.capacity = rows * QW;
  }

  /** Rounded allocation size for n quads. */
  static roundSize(n: number): number { return Math.max(BLOCK, ((n + BLOCK - 1) / BLOCK | 0) * BLOCK); }

  alloc(n: number): number {
    const size = QuadPool.roundSize(n);
    // first fit in free list
    const fs = this.freeStart, fz = this.freeSize;
    for (let i = 0; i < fs.length; i++) {
      if (fz[i] >= size) {
        const s = fs[i];
        if (fz[i] === size) { fs.splice(i, 1); fz.splice(i, 1); }
        else { fs[i] += size; fz[i] -= size; }
        this.used += size;
        return s;
      }
    }
    if (this.top + size > this.capacity) this.grow(this.top + size);
    const s = this.top;
    this.top += size;
    this.used += size;
    return s;
  }

  free(start: number, n: number): void {
    const size = QuadPool.roundSize(n);
    this.used -= size;
    const fs = this.freeStart, fz = this.freeSize;
    // binary search insertion point
    let lo = 0, hi = fs.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (fs[m] < start) lo = m + 1; else hi = m; }
    fs.splice(lo, 0, start); fz.splice(lo, 0, size);
    // coalesce with next
    if (lo + 1 < fs.length && fs[lo] + fz[lo] === fs[lo + 1]) { fz[lo] += fz[lo + 1]; fs.splice(lo + 1, 1); fz.splice(lo + 1, 1); }
    // coalesce with previous
    if (lo > 0 && fs[lo - 1] + fz[lo - 1] === fs[lo]) { fz[lo - 1] += fz[lo]; fs.splice(lo, 1); fz.splice(lo, 1); lo--; }
    // give back to the bump region if at the top
    if (fs[lo] + fz[lo] === this.top) { this.top = fs[lo]; fs.splice(lo, 1); fz.splice(lo, 1); }
  }

  upload(start: number, data: Uint32Array, n: number): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    let s = start, rem = n, off = 0;
    while (rem > 0) {
      const x = s & (QW - 1), y = s >> QW_SHIFT;
      let len: number;
      if (x === 0 && rem >= QW) {
        const rows = (rem / QW) | 0;
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y, QW, rows, gl.RGBA_INTEGER, gl.UNSIGNED_INT, data, off * 4);
        len = rows * QW;
      } else {
        len = Math.min(rem, QW - x);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, len, 1, gl.RGBA_INTEGER, gl.UNSIGNED_INT, data, off * 4);
      }
      s += len; off += len; rem -= len;
    }
  }

  get highWater(): number { return this.top; }
}
