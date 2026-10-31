/**
 * Screen-sized bitmap cache for a static, low-parallax layer (used for the sky).
 *
 * The layer is rendered once into an offscreen canvas (screen size + margin) at a reference
 * camera state, then blitted every frame with the current parallax offset / scale / rotation.
 * It re-renders only when the view drifts beyond the margin, the layer scale changes by more
 * than `scaleTol`, or the screen is resized. Far layers (small parallax) almost never re-render.
 */
import type { CameraView } from '../types';
import { makeCanvas } from './util';

export type LayerRect = { left: number; right: number; top: number; bottom: number };

/** Effective scale of parallax layer p (mirrors Camera.applyTransform: baseScale = height / 720). */
export function layerScale(cam: CameraView, p: number): number {
  const base = cam.height / 720;
  const camZoom = cam.zoom / base;
  return base * (1 + (camZoom - 1) * p);
}

export class LayerCache {
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private refCx = 0;
  private refCy = 0;
  private refS = 1;
  private w = 0;
  private h = 0;
  private valid = false;
  /** Number of re-renders (diagnostics). */
  renders = 0;

  /**
   * @param p        parallax of the layer
   * @param margin   extra pixels rendered around the screen (absorbs drift before re-rendering)
   * @param scaleTol relative scale change that triggers a re-render
   * @param snap     always blit unscaled & unrotated at whole pixels (fast copy). Right for
   *                 layers with tiny parallax (sky) where ±scaleTol and p·rotation are invisible.
   */
  constructor(readonly p: number, private margin = 110, private scaleTol = 0.03, private snap = false) {}

  invalidate(): void {
    this.valid = false;
  }

  draw(ctx: CanvasRenderingContext2D, cam: CameraView, render: (g: CanvasRenderingContext2D, rect: LayerRect) => void): void {
    const p = this.p;
    const S = layerScale(cam, p);
    const cx = cam.x * p, cy = cam.y * p;
    const W = cam.width, H = cam.height, m = this.margin;
    const lim = m * 0.85;
    if (
      !this.valid || !this.canvas || W !== this.w || H !== this.h ||
      Math.abs(S / this.refS - 1) > this.scaleTol ||
      Math.abs((this.refCx - cx) * S) > lim || Math.abs((this.refCy - cy) * S) > lim
    ) {
      this.rerender(cam, S, cx, cy, render);
    }
    const c = this.canvas!;
    const k = S / this.refS;
    const rot = cam.rotation * p;
    const dx = S * (this.refCx - cx) - k * (m + W / 2);
    const dy = S * (this.refCy - cy) - k * (m + H / 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.snap || (Math.abs(k - 1) < 0.0015 && Math.abs(rot) < 0.0004)) {
      // Fast path: unscaled, pixel-aligned blit.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const sx = this.snap ? S * (this.refCx - cx) - (m + W / 2) : dx;
      const sy = this.snap ? S * (this.refCy - cy) - (m + H / 2) : dy;
      ctx.drawImage(c, Math.round(W / 2 + cam.shakeX * p + sx), Math.round(H / 2 + cam.shakeY * p + sy));
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(W / 2 + cam.shakeX * p, H / 2 + cam.shakeY * p);
      if (rot !== 0) ctx.rotate(rot);
      ctx.drawImage(c, dx, dy, c.width * k, c.height * k);
    }
  }

  private rerender(cam: CameraView, S: number, cx: number, cy: number, render: (g: CanvasRenderingContext2D, rect: LayerRect) => void): void {
    const W = cam.width, H = cam.height, m = this.margin;
    if (!this.canvas || this.w !== W || this.h !== H) {
      this.canvas = makeCanvas(W + 2 * m, H + 2 * m);
      this.g = this.canvas.getContext('2d');
      this.w = W;
      this.h = H;
    }
    const g = this.g!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(S, 0, 0, S, m + W / 2 - S * cx, m + H / 2 - S * cy);
    const halfW = (W / 2 + m) / S, halfH = (H / 2 + m) / S;
    render(g, { left: cx - halfW, right: cx + halfW, top: cy - halfH, bottom: cy + halfH });
    g.setTransform(1, 0, 0, 1, 0, 0);
    this.refCx = cx;
    this.refCy = cy;
    this.refS = S;
    this.valid = true;
    this.renders++;
  }
}
