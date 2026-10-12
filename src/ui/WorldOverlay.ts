// 2D canvas over the 3D view for world-anchored UI: crosshairs with ammo /
// reload text, money above the hunter, "+50$" popups, laser lines, the red
// damage vignette and (first person) the centre reticle and hit markers.
// Coordinates are CSS px of the view; sizes are design px (scaled by --k,
// min(viewW / 640, viewH / 480), like the rest of the UI).
//
// Two looks (Options.hudStyle): 'classic' draws exactly what the 2005 game
// drew (pixel crosshair sprite, Trebuchet numbers); 'modern' draws thin
// outlined strokes, a reload ring and clean system-font pop-ups, and leaves
// money and ammo to the HUD.
import { FP } from '../config/firstPerson';
import { ensureFonts, prepareView, viewScale } from './dom';

export interface OverlayCrosshair {
  x: number;
  y: number;
  text: string;
  textColor: string;
  /** Default: the original player-1 crosshair blue #3b6bcb. */
  color?: string;
  /** 'world' (default): classic crosshair in front of the hunter; 'center': first-person screen-centre reticle. */
  kind?: 'world' | 'center';
  /** First person: 0..1 reload progress (null when not reloading). */
  reload?: number | null;
  /** First person: current weapon spread in degrees (reticle gap). */
  spreadDeg?: number;
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
  /**
   * What the text is (optional; guessed from the text when absent):
   * 'money' the hunter's money above his head ("$123"), 'popup' a bounty
   * ("50$"), 'label' anything else. The modern look hides 'money' (the HUD
   * shows it) and restyles pop-ups.
   */
  role?: 'money' | 'popup' | 'label';
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
  /** 0..1 hit-marker intensity (first person; fades after a bullet hits a creature). */
  hitMarker?: number;
  /** True when the hit that set hitMarker was a kill (draw it emphasised). */
  hitMarkerKill?: boolean;
}

const FONT_FAMILY = "'SH Trebuchet', 'Trebuchet MS', sans-serif";
const MODERN_FONT = "system-ui, -apple-system, 'SF Pro Display', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
/** Modern strokes: icy white over a soft dark outline (legible on bright ice). */
const M_FG = 'rgba(248, 252, 255, 0.96)';
const M_OUTLINE = 'rgba(4, 12, 24, 0.5)';
const M_DANGER = '#ff4d5a';
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
  private style: 'modern' | 'classic' = 'modern';

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

  /** Overlay look (Options.hudStyle). */
  setStyle(style: 'modern' | 'classic'): void {
    style = style === 'classic' ? 'classic' : 'modern';
    if (style === this.style) return;
    this.style = style;
    this.vignetteKey = '';
    this.dirty = true;
  }

  render(items: OverlayItems): void {
    if (this.view.clientWidth !== this.cssW || this.view.clientHeight !== this.cssH) this.resize();
    const { ctx } = this;
    const lines = items.lines ?? [];
    const vig = Math.min(1, Math.max(0, items.vignette ?? 0));
    const hit = Math.min(1, Math.max(0, items.hitMarker ?? 0));
    const empty =
      items.crosshairs.length === 0 && items.texts.length === 0 && lines.length === 0 && vig <= 0.001 && hit <= 0.001;
    // Skip redundant clears when nothing is drawn frame after frame.
    if (empty && this.wasEmpty && !this.dirty) return;
    this.wasEmpty = empty;
    this.dirty = false;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (empty) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const k = viewScale(this.cssW, this.cssH);
    const modern = this.style === 'modern';

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

    for (const c of items.crosshairs) {
      if (c.kind === 'center') this.drawReticle(c, k);
      else if (modern) this.drawModernCrosshair(c, k);
      else this.drawCrosshair(c, k);
    }
    if (hit > 0.001) {
      const c = items.crosshairs.find((x) => x.kind === 'center');
      this.drawHitMarker(c ? c.x : this.cssW / 2, c ? c.y : this.cssH / 2, c, hit, !!items.hitMarkerKill, k);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (modern) {
      this.drawModernTexts(items.texts, k);
      return;
    }
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

  /** Stroke the current path twice: soft dark outline, then the colour. */
  private outlined(width: number, color: string, alpha = 1): void {
    const { ctx } = this;
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.strokeStyle = M_OUTLINE;
    ctx.lineWidth = width + 1.6;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Four arms around (x, y) leaving a gap; returns nothing, strokes outlined. */
  private arms(x: number, y: number, gap: number, len: number, width: number, color: string): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x - gap - len, y);
    ctx.lineTo(x - gap, y);
    ctx.moveTo(x + gap, y);
    ctx.lineTo(x + gap + len, y);
    ctx.moveTo(x, y - gap - len);
    ctx.lineTo(x, y - gap);
    ctx.moveTo(x, y + gap);
    ctx.lineTo(x, y + gap + len);
    this.outlined(width, color);
  }

  /** Thin progress ring (reload), starting at 12 o'clock. */
  private ring(x: number, y: number, r: number, p: number, width: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = M_OUTLINE;
    ctx.lineWidth = width + 1.2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (p > 0.001) {
      ctx.beginPath();
      ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p));
      ctx.lineCap = 'round';
      ctx.strokeStyle = M_FG;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  /** System-font text with a soft dark shadow (legible on bright ice). */
  private label(text: string, x: number, y: number, size: number, color: string, alpha = 1, weight = 600): void {
    const { ctx } = this;
    ctx.font = `${weight} ${size.toFixed(2)}px ${MODERN_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.shadowColor = 'rgba(2, 10, 22, 0.55)';
    ctx.shadowBlur = Math.max(2, size * 0.28) * this.dpr;
    ctx.shadowOffsetY = Math.max(0.5, size * 0.04) * this.dpr;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.globalAlpha = 1;
  }

  /** Small dark glass pill with white text (bounty pop-ups). */
  private pill(text: string, x: number, y: number, size: number, alpha: number): void {
    const { ctx } = this;
    ctx.font = `650 ${size.toFixed(2)}px ${MODERN_FONT}`;
    const w = ctx.measureText(text).width + size * 1.1;
    const hgt = size * 1.55;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(10, 16, 26, 0.5)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x - w / 2, y - hgt / 2, w, hgt, hgt / 2);
    else ctx.rect(x - w / 2, y - hgt / 2, w, hgt);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = M_FG;
    ctx.fillText(text, x, y + size * 0.04);
    ctx.globalAlpha = 1;
  }

  /** Reload progress of a crosshair: explicit, or parsed from the classic "70%" text. */
  private static reloadOf(c: OverlayCrosshair): number | null {
    if (c.reload !== undefined && c.reload !== null) return c.reload;
    const m = /^(\d+)%$/.exec(c.text);
    return m ? Number(m[1]) / 100 : null;
  }

  /** Modern third-person crosshair: thin outlined cross, ammo above, reload ring. */
  private drawModernCrosshair(c: OverlayCrosshair, k: number): void {
    const reload = WorldOverlay.reloadOf(c);
    const width = Math.max(1, 0.55 * k);
    this.arms(c.x, c.y, 1.6 * k, 3 * k, width, c.color ?? M_FG);
    if (reload !== null) {
      this.ring(c.x, c.y, 7 * k, reload, Math.max(1, 0.5 * k));
    } else if (c.text) {
      this.label(c.text, c.x, c.y - 9 * k, 6.5 * k, M_FG);
    }
  }

  /** First-person reticle at the screen centre; the gap follows the weapon spread. */
  private drawReticle(c: OverlayCrosshair, k: number): void {
    const { ctx } = this;
    const halfFov = (FP.fovDeg * Math.PI) / 360;
    const spread = Math.max(0, c.spreadDeg ?? 0);
    const spreadPx = (Math.tan((spread * Math.PI) / 360) / Math.tan(halfFov)) * (this.cssH / 2);
    const gap = 2.4 * k + spreadPx;
    const reload = WorldOverlay.reloadOf(c);
    if (this.style === 'classic') {
      // The 2005 sprite at the centre, ammo / reload text above it.
      this.drawCrosshair({ ...c, kind: 'world' }, k);
      return;
    }
    const width = Math.max(1, 0.6 * k);
    this.arms(c.x, c.y, gap, 4 * k, width, c.color ?? M_FG);
    // Centre dot.
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(0.9, 0.55 * k), 0, Math.PI * 2);
    ctx.fillStyle = M_OUTLINE;
    ctx.globalAlpha = 0.7;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(0.6, 0.38 * k), 0, Math.PI * 2);
    ctx.fillStyle = M_FG;
    ctx.globalAlpha = 1;
    ctx.fill();
    if (reload !== null) this.ring(c.x, c.y, gap + 4 * k + 4 * k, reload, Math.max(1, 0.55 * k));
  }

  /** Hit marker: four short diagonals around the reticle; red and longer for a kill. */
  private drawHitMarker(x: number, y: number, c: OverlayCrosshair | undefined, a: number, kill: boolean, k: number): void {
    const { ctx } = this;
    const halfFov = (FP.fovDeg * Math.PI) / 360;
    const spread = Math.max(0, c?.spreadDeg ?? 0);
    const spreadPx = (Math.tan((spread * Math.PI) / 360) / Math.tan(halfFov)) * (this.cssH / 2);
    const r0 = (kill ? 3.6 : 3) * k + spreadPx * 0.6;
    const r1 = r0 + (kill ? 4.5 : 3.4) * k;
    const d = Math.SQRT1_2;
    ctx.beginPath();
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      ctx.moveTo(x + sx * r0 * d, y + sy * r0 * d);
      ctx.lineTo(x + sx * r1 * d, y + sy * r1 * d);
    }
    this.outlined(Math.max(1, (kill ? 0.85 : 0.6) * k), kill ? M_DANGER : M_FG, a);
  }

  /** Modern texts: bounty pop-ups as clean "+$50", the hunter's money is left to the HUD. */
  private drawModernTexts(texts: OverlayText[], k: number): void {
    for (const t of texts) {
      if (t.alpha <= 0 || !t.text) continue;
      const role = t.role ?? (/^\d+\$$/.test(t.text) ? 'popup' : /^\$\d+$/.test(t.text) ? 'money' : 'label');
      if (role === 'money') continue;
      const size = (t.size ?? 9) * k;
      if (role === 'popup') {
        // Classic pop-ups fade from 0.5; lift them so they stay legible.
        this.pill(`+$${t.text.replace(/[^\d]/g, '')}`, t.x, t.y, size * 0.72, Math.min(1, t.alpha * 2));
      } else if (t.bold) {
        // Bold labels are prompts ("Click to aim"): a chip reads on any background.
        this.pill(t.text, t.x, t.y, size * 0.72, Math.min(1, t.alpha));
      } else {
        this.label(t.text, t.x, t.y, size * 0.85, t.color, t.alpha);
      }
    }
  }

  private drawVignette(v: number): void {
    const { ctx, cssW: w, cssH: h } = this;
    const key = `${w}x${h}x${this.style}`;
    if (key !== this.vignetteKey || !this.vignetteGrad) {
      const r = Math.hypot(w, h) / 2;
      if (this.style === 'modern') {
        // Thin, cool-edged red rim: reads as "hurt" without darkening the view.
        const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.55, w / 2, h / 2, r);
        g.addColorStop(0, 'rgba(200,16,40,0)');
        g.addColorStop(0.55, 'rgba(200,16,40,0.14)');
        g.addColorStop(1, 'rgba(170,8,30,0.55)');
        this.vignetteGrad = g;
      } else {
        const g = ctx.createRadialGradient(w / 2, h * 0.55, r * 0.5, w / 2, h * 0.55, r);
        g.addColorStop(0, 'rgba(160,0,0,0)');
        g.addColorStop(0.45, 'rgba(150,0,0,0.28)');
        g.addColorStop(1, 'rgba(100,0,0,0.85)');
        this.vignetteGrad = g;
      }
      this.vignetteKey = key;
    }
    ctx.globalAlpha = v;
    ctx.fillStyle = this.vignetteGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}
