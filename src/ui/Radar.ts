// First-person radar: a small top-down map of the floe drawn like the classic
// camera sees it (x to the right, z down). Creatures are dots (bosses larger,
// in the danger colour), the hunter is an arrow with a faint view cone, and
// the escape edge on the right is a red line. Redrawn on every HUD update.
import { FP } from '../config/firstPerson';
import { fluidLayer, h, viewScale } from './dom';
import type { HudRadar } from './hudTypes';

/** Map width in design px; the height follows the field's aspect. */
const MAP_W = 116;
const PAD = 5;
const DANGER = '#ff5a64';
const ACCENT = '#8fe0ff';

export class Radar {
  private readonly root: HTMLDivElement;
  private readonly box: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private shown = false;
  private style = '';
  private k = 1;
  private aspect = 4 / 3;
  private cw = 0;
  private ch = 0;
  private dpr = 1;

  constructor(view: HTMLElement) {
    this.root = fluidLayer(view, 'shm-radar-layer');
    this.box = h('div', 'shm-radar');
    this.canvas = h('canvas', 'shm-radar-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.box.appendChild(this.canvas);
    this.root.appendChild(this.box);
    this.root.style.display = 'none';
    const measure = () => {
      const w = view.clientWidth;
      const hh = view.clientHeight;
      this.k = viewScale(w, hh);
      if (w > 0 && hh > 0) this.aspect = w / hh;
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(view);
  }

  update(r: HudRadar | undefined, show: boolean, style = 'modern'): void {
    const on = show && !!r && !!this.ctx;
    if (on !== this.shown) {
      this.shown = on;
      this.root.style.display = on ? '' : 'none';
    }
    if (style !== this.style) {
      this.style = style;
      this.box.classList.toggle('is-classic', style === 'classic');
    }
    if (on && r) this.draw(r);
  }

  private draw(r: HudRadar): void {
    const ctx = this.ctx!;
    // Field extent, always including a strip beyond the escape edge.
    const x0 = r.minX;
    const x1 = Math.max(r.maxX, r.escapeX + 1.5);
    const z0 = r.minZ;
    const z1 = Math.max(r.maxZ, z0 + 1);
    const innerW = MAP_W - PAD * 2;
    const s = innerW / Math.max(1, x1 - x0);
    const mapH = Math.round(Math.min(MAP_W, Math.max(30, (z1 - z0) * s + PAD * 2)));
    const sz = (mapH - PAD * 2) / (z1 - z0);

    // Backing store at device resolution.
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const pw = Math.max(1, Math.round(MAP_W * this.k * dpr));
    const ph = Math.max(1, Math.round(mapH * this.k * dpr));
    if (pw !== this.cw || ph !== this.ch || dpr !== this.dpr) {
      this.cw = pw;
      this.ch = ph;
      this.dpr = dpr;
      this.canvas.width = pw;
      this.canvas.height = ph;
      this.canvas.style.width = `${MAP_W}px`;
      this.canvas.style.height = `${mapH}px`;
    }
    const u = this.k * dpr; // canvas px per design px
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    ctx.setTransform(u, 0, 0, u, 0, 0);
    const mx = (x: number) => PAD + (x - x0) * s;
    const mz = (z: number) => PAD + (z - z0) * sz;

    // Escape zone.
    const ex = mx(r.escapeX);
    ctx.fillStyle = 'rgba(255, 80, 90, 0.16)';
    ctx.fillRect(ex, 0, MAP_W - ex, mapH);
    ctx.strokeStyle = DANGER;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ex, 2);
    ctx.lineTo(ex, mapH - 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Field outline.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(mx(r.minX), mz(r.minZ), (r.maxX - r.minX) * s, (r.maxZ - r.minZ) * sz);

    // Hunter: view cone + arrow. Yaw 0 faces -x (left), +yaw turns toward +z (down).
    const px = mx(r.player.x);
    const pz = mz(r.player.z);
    const dx = -Math.cos(r.player.yaw);
    const dz = Math.sin(r.player.yaw);
    const half = Math.atan(Math.tan((FP.fovDeg * Math.PI) / 360) * this.aspect);
    const head = Math.atan2(dz, dx);
    const reach = MAP_W;
    const cone = ctx.createRadialGradient(px, pz, 0, px, pz, reach * 0.55);
    cone.addColorStop(0, 'rgba(143, 224, 255, 0.28)');
    cone.addColorStop(1, 'rgba(143, 224, 255, 0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.arc(px, pz, reach, head - half, head + half);
    ctx.closePath();
    ctx.fill();

    // Creatures.
    for (const e of r.enemies) {
      const ez = mz(e.z);
      const exx = mx(e.x);
      if (exx < -4 || exx > MAP_W + 4) continue;
      ctx.beginPath();
      if (e.boss) {
        ctx.fillStyle = DANGER;
        ctx.arc(exx, ez, 2.6, 0, Math.PI * 2);
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.arc(exx, ez, 1.45, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(head);
    ctx.beginPath();
    ctx.moveTo(4.2, 0);
    ctx.lineTo(-2.6, 2.8);
    ctx.lineTo(-1.2, 0);
    ctx.lineTo(-2.6, -2.8);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(6, 14, 24, 0.7)';
    ctx.stroke();
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.restore();
  }
}
