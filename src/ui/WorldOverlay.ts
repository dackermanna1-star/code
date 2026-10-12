// 2D canvas over the 3D view for world-anchored UI: crosshairs with ammo /
// reload text, money above the hunter, "+50$" popups, laser lines and the red
// damage vignette. Coordinates are CSS px of the view; sizes are design px
// (scaled by view width / 640, like the rest of the UI).
import { DESIGN_W, ensureFonts, prepareView } from './dom';

export interface OverlayCrosshair {
  x: number;
  y: number;
  text: string;
  textColor: string;
  /** Default: the original player-1 crosshair blue #3b6bcb. */
  color?: string;
}

export interface OverlayText {
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  /** Design px (default 9). */
  size?: number;
  bold?: boolean;
}

export interface OverlayLine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  /** Line width in design px. */
  width: number;
  alpha: number;
}

export interface OverlayItems {
  crosshairs: OverlayCrosshair[];
  texts: OverlayText[];
  lines?: OverlayLine[];
  /** 0..1 red damage vignette. */
  vignette?: number;
}

const FONT_FAMILY = "'SH Trebuchet', 'Trebuchet MS', sans-serif";
const CROSS_COLOR = '#3b6bcb';
/** blue_crosshair_1.png: 9x9, 3-px arms, 1-px gap, centre dot. */
const CROSS_RECTS: Array<[number, number, number, number]> = [
  [4, 0, 1, 3],
  [4, 6, 1, 3],
  [0, 4, 3, 1],
  [6, 4, 3, 1],
  [4, 4, 1, 1],
];

export class WorldOverlay {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly view: HTMLElement;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private dirty = true;
  private wasEmpty = false;
  private vignetteGrad: CanvasGradient | null = null;
  private vignetteKey = '';

  constructor(view: HTMLElement) {
    ensureFonts();
    prepareView(view);
    this.view = view;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sh-overlay-canvas';
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    view.appendChild(this.canvas);
    this.resize();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(view);
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    const w = this.view.clientWidth;
    const h = this.view.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (w === this.cssW && h === this.cssH && dpr === this.dpr) return;
    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.vignetteKey = '';
    this.dirty = true;
  }

  render(items: OverlayItems): void {
    if (this.view.clientWidth !== this.cssW || this.view.clientHeight !== this.cssH) this.resize();
    const { ctx } = this;
    const lines = items.lines ?? [];
    const vig = Math.min(1, Math.max(0, items.vignette ?? 0));
    const empty = items.crosshairs.length === 0 && items.texts.length === 0 && lines.length === 0 && vig <= 0.001;
    // Skip redundant clears when nothing is drawn frame after frame.
    if (empty && this.wasEmpty && !this.dirty) return;
    this.wasEmpty = empty;
    this.dirty = false;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (empty) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const k = this.cssW / DESIGN_W;

    if (vig > 0.001) this.drawVignette(vig);

    for (const l of lines) {
      if (l.alpha <= 0) continue;
      ctx.globalAlpha = Math.min(1, l.alpha);
      ctx.strokeStyle = l.color;
      ctx.lineWidth = Math.max(0.5, l.width * k);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(l.x0, l.y0);
      ctx.lineTo(l.x1, l.y1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const c of items.crosshairs) this.drawCrosshair(c, k);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of items.texts) {
      if (t.alpha <= 0 || !t.text) continue;
      const size = (t.size ?? 9) * k;
      ctx.font = `${t.bold ? 'bold ' : ''}${size.toFixed(2)}px ${FONT_FAMILY}`;
      ctx.globalAlpha = Math.min(1, t.alpha);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawCrosshair(c: OverlayCrosshair, k: number): void {
    const { ctx } = this;
    // Snap the 9x9 design-pixel sprite to device pixels so the arms stay sharp.
    const px = Math.max(1, Math.round(k * this.dpr)) / this.dpr;
    const ox = Math.round((c.x - 4.5 * px) * this.dpr) / this.dpr;
    const oy = Math.round((c.y - 4.5 * px) * this.dpr) / this.dpr;
    ctx.fillStyle = c.color ?? CROSS_COLOR;
    for (const [x, y, w, h] of CROSS_RECTS) ctx.fillRect(ox + x * px, oy + y * px, w * px, h * px);
    if (c.text) {
      // player.py centres the info text MONEY_FONT_SIZE (9) px above the
      // crosshair; the 2005 frames show ~10 px digits about 8 px above it.
      ctx.font = `${(10 * k).toFixed(2)}px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = c.textColor;
      ctx.fillText(c.text, c.x, c.y - 8.5 * k);
    }
  }

  private drawVignette(v: number): void {
    const { ctx, cssW: w, cssH: h } = this;
    const key = `${w}x${h}`;
    if (key !== this.vignetteKey || !this.vignetteGrad) {
      const r = Math.hypot(w, h) / 2;
      const g = ctx.createRadialGradient(w / 2, h * 0.55, r * 0.5, w / 2, h * 0.55, r);
      g.addColorStop(0, 'rgba(160,0,0,0)');
      g.addColorStop(0.45, 'rgba(150,0,0,0.28)');
      g.addColorStop(1, 'rgba(100,0,0,0.85)');
      this.vignetteGrad = g;
      this.vignetteKey = key;
    }
    ctx.globalAlpha = v;
    ctx.fillStyle = this.vignetteGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}
