// Painter: wraps the era color + props contexts with a meters->pixels transform,
// material output and scratch-canvas compositing.

import { acquireScratch, releaseScratch } from '../core/canvas.js';

export class Painter {
  constructor({ ctx, pctx, ppm, widthM, heightM, wallTone, propsScale = 1 }) {
    this.ctx = ctx;
    this.pctx = pctx;
    this.ppm = ppm;
    this.pscale = propsScale;
    this.widthM = widthM;
    this.heightM = heightM;
    this.wallTone = wallTone;
    this.wantProps = !!pctx;
    this.dx = 0;
    this._stack = [];
    this.resetTransform();
  }

  resetTransform() {
    const p = this.ppm;
    if (this._target) {
      const t = this._target;
      this.ctx.setTransform(p, 0, 0, p, -t.px0, -t.py0);
    } else {
      this.ctx.setTransform(p, 0, 0, p, this.dx * p, 0);
    }
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';
    if (this.pctx) {
      const pp = p * this.pscale;
      this.pctx.setTransform(pp, 0, 0, pp, this.dx * pp, 0);
      this.pctx.globalAlpha = 1;
      this.pctx.globalCompositeOperation = 'source-over';
    }
  }

  setOffset(dx) {
    this.dx = dx;
    this.resetTransform();
  }

  matStyle(metal, gloss, paper, alpha) {
    return `rgba(${metal | 0},${gloss | 0},${paper | 0},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
  }

  matFill(path, metal, gloss, paper = 0, alpha = 1) {
    if (!this.pctx || !this.wantProps) return;
    this.pctx.fillStyle = this.matStyle(metal, gloss, paper, alpha);
    this.pctx.fill(path);
  }

  matStroke(path, width, metal, gloss, paper = 0, alpha = 1, cap = 'round', join = 'round') {
    if (!this.pctx || !this.wantProps) return;
    const c = this.pctx;
    c.lineCap = cap;
    c.lineJoin = join;
    c.miterLimit = 3;
    c.lineWidth = width;
    c.strokeStyle = this.matStyle(metal, gloss, paper, alpha);
    c.stroke(path);
  }

  matRect(x, y, w, h, metal, gloss, paper = 0, alpha = 1) {
    if (!this.pctx || !this.wantProps) return;
    this.pctx.fillStyle = this.matStyle(metal, gloss, paper, alpha);
    this.pctx.fillRect(x, y, w, h);
  }

  /**
   * Start drawing into a scratch canvas that covers box (meters). Returns a
   * descriptor whose ctx uses wall-meter coordinates.
   */
  beginScratch(box, pad = 0) {
    const p = this.ppm;
    const x0 = Math.floor((box.x0 - pad) * p) - 1;
    const y0 = Math.floor((box.y0 - pad) * p) - 1;
    const x1 = Math.ceil((box.x1 + pad) * p) + 1;
    const y1 = Math.ceil((box.y1 + pad) * p) + 1;
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
    const s = acquireScratch(w, h);
    s.ctx.setTransform(p, 0, 0, p, -x0, -y0);
    return { s, ctx: s.ctx, px0: x0, py0: y0, pw: w, ph: h };
  }

  /** Composite a scratch canvas back onto target ctx (default: color ctx). */
  drawScratch(sc, target = this.ctx, alpha = 1, op = 'source-over') {
    target.save();
    if (this._target && target === this._target.ctx) target.setTransform(1, 0, 0, 1, -this._target.px0, -this._target.py0);
    else target.setTransform(1, 0, 0, 1, Math.round(this.dx * this.ppm), 0);
    target.globalAlpha = alpha;
    target.globalCompositeOperation = op;
    target.drawImage(sc.s.canvas, 0, 0, sc.pw, sc.ph, sc.px0, sc.py0, sc.pw, sc.ph);
    target.restore();
  }

  endScratch(sc) { releaseScratch(sc.s); }

  /**
   * Redirect color drawing into a scratch canvas covering box; popTarget()
   * composites it onto the real color context. Props drawing is unaffected.
   */
  pushTarget(box, pad = 0) {
    const sc = this.beginScratch(box, pad);
    this._stack.push({ ctx: this.ctx, target: this._target });
    this.ctx = sc.ctx;
    this._target = sc;
    return sc;
  }

  popTarget(alpha = 1) {
    const sc = this._target;
    const prev = this._stack.pop();
    this.ctx = prev.ctx;
    this._target = prev.target;
    this.drawScratch(sc, this.ctx, alpha);
    this.endScratch(sc);
    this.resetTransform();
  }

  /** Fresh scratch canvas sharing geometry with another one. */
  twinScratch(sc) {
    const s = acquireScratch(sc.pw, sc.ph);
    s.ctx.setTransform(this.ppm, 0, 0, this.ppm, -sc.px0, -sc.py0);
    return { s, ctx: s.ctx, px0: sc.px0, py0: sc.py0, pw: sc.pw, ph: sc.ph };
  }

  /** Draw one scratch onto another (same geometry) with an op. */
  static blit(dst, src, op = 'source-over', alpha = 1) {
    const c = dst.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = op;
    c.globalAlpha = alpha;
    c.drawImage(src.s.canvas, 0, 0, src.pw, src.ph, 0, 0, src.pw, src.ph);
    c.restore();
  }
}
