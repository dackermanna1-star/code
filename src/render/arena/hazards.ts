/**
 * Environmental hazard visuals: readable telegraphs during the warning phase and violent
 * strikes (lightning, lava geysers, plunging icicles, void rifts, starfall).
 * Driven entirely by HazardView snapshots from the simulation.
 */
import type { ArenaTheme, HazardKind } from '../../sim/arena';
import type { CameraView, HazardView } from '../types';
import { clamp01, ease, smoothstep } from '../../core/math';
import { FxKind, type FxSystem } from './particles';
import { drawSprite, glowSprite, lighten, makeBolt, rgbaStr, strokeGlowLine, type Bolt } from './util';

interface HazState {
  bolt: Bolt | null;
  preview: Bolt | null;
  boltTimer: number;
  previewTimer: number;
  struck: boolean;
  last: HazardView;
  seen: number;
}

interface Fading { view: HazardView; age: number; bolt: Bolt | null }

const COLORS: Record<HazardKind, { main: string; core: string }> = {
  lightning: { main: '#9fd0ff', core: '#ffffff' },
  lava: { main: '#ff6a1a', core: '#ffe48a' },
  icicles: { main: '#9fe8ff', core: '#ffffff' },
  voidrift: { main: '#b05cff', core: '#ffd6ff' },
  starfall: { main: '#ffd86a', core: '#fffbe6' },
  none: { main: '#ffffff', core: '#ffffff' },
};

export class HazardFx {
  private states = new Map<number, HazState>();
  private fading: Fading[] = [];
  private frame = 0;
  private t = 0;
  /** Requested light flashes (consumed by the arena renderer). */
  flashRequests: { color: string; intensity: number; x: number }[] = [];

  constructor(private theme: ArenaTheme, private fx: FxSystem) {}

  update(dt: number, hazards: readonly HazardView[], cam: CameraView): void {
    this.frame++;
    this.t += dt;
    const top = cam.visibleWorldRect(1).top - 120;
    for (const h of hazards) {
      let s = this.states.get(h.id);
      if (!s) {
        s = { bolt: null, preview: null, boltTimer: 0, previewTimer: 0, struck: false, last: h, seen: this.frame };
        this.states.set(h.id, s);
      }
      s.seen = this.frame;
      s.last = { ...h };
      const col = COLORS[h.kind];
      if (h.striking && !s.struck) {
        s.struck = true;
        this.onStrikeStart(h, top);
      }
      if (h.kind === 'lightning') {
        s.previewTimer -= dt;
        if (!h.striking && s.previewTimer <= 0) {
          s.previewTimer = 0.05 + Math.random() * 0.08;
          s.preview = Math.random() < 0.35 + h.warn * 0.5 ? makeBolt(Math.random, h.x + (Math.random() - 0.5) * 140, top, h.x, 0, 5, 0.18, 0.2) : null;
        }
        s.boltTimer -= dt;
        if (h.striking && s.boltTimer <= 0) {
          s.boltTimer = 0.045;
          s.bolt = makeBolt(Math.random, h.x + (Math.random() - 0.5) * 120, top, h.x, 0, 7, 0.16, 0.5);
        }
      }
      // Continuous particles.
      if (h.kind === 'lava') {
        if (!h.striking && Math.random() < h.warn * 0.6) {
          this.fx.spawn(FxKind.Blob, h.x + (Math.random() - 0.5) * h.radius * 1.4, -2, (Math.random() - 0.5) * 30, -60 - Math.random() * 90, 0.5, 2 + Math.random() * 3, col.main, { gravity: 400, color2: '#ff3a00' });
        }
        if (h.striking && h.strikeAge < 1.1) {
          for (let k = 0; k < 3; k++) {
            const hgt = this.geyserHeight(h);
            this.fx.spawn(FxKind.Blob, h.x + (Math.random() - 0.5) * h.radius * 0.6, -hgt * (0.85 + Math.random() * 0.15), (Math.random() - 0.5) * 520, -120 - Math.random() * 260, 1.0 + Math.random() * 0.6, 3 + Math.random() * 5, col.core, { gravity: 1500, color2: col.main, ground: true });
          }
        }
      } else if (h.kind === 'voidrift' && h.striking && h.strikeAge < 1.4) {
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * Math.PI * 2;
          const d = h.radius * (1.4 + Math.random() * 1.6);
          const cy = -h.radius * 1.6;
          this.fx.spawn(FxKind.Mote, h.x + Math.cos(a) * d, cy + Math.sin(a) * d, 0, 0, 0.9, 1.5 + Math.random() * 2.5, Math.random() < 0.5 ? col.main : '#ff7ae8', { pull: 1400, ax: h.x, ay: cy });
        }
      } else if (h.kind === 'voidrift' && !h.striking && Math.random() < h.warn * 0.4) {
        this.fx.spawn(FxKind.Mote, h.x + (Math.random() - 0.5) * 30, -Math.random() * h.radius * 3, (Math.random() - 0.5) * 40, -20, 0.6, 1.5, col.main);
      }
    }
    // Hazards that vanished: fade out their last visuals briefly.
    for (const [id, s] of this.states) {
      if (s.seen !== this.frame) {
        if (s.last.striking) this.fading.push({ view: s.last, age: 0, bolt: s.bolt });
        this.states.delete(id);
      }
    }
    for (const f of this.fading) f.age += dt;
    this.fading = this.fading.filter((f) => f.age < 0.35);
  }

  private geyserHeight(h: HazardView): number {
    const rise = ease.outCubic(clamp01(h.strikeAge / 0.14));
    const fall = 1 - smoothstep(0.9, 1.6, h.strikeAge) * 0.85;
    return 560 * rise * fall;
  }

  private onStrikeStart(h: HazardView, top: number): void {
    const col = COLORS[h.kind];
    const fx = this.fx;
    switch (h.kind) {
      case 'lightning':
        for (let i = 0; i < 18; i++) {
          const a = -Math.PI * Math.random();
          const sp = 300 + Math.random() * 700;
          fx.spawn(FxKind.Spark, h.x, -2, Math.cos(a) * sp, Math.sin(a) * sp, 0.3 + Math.random() * 0.3, 1.5 + Math.random() * 1.5, col.core, { gravity: 900, drag: 2 });
        }
        fx.spawn(FxKind.Ring, h.x, 0, 0, 0, 0.35, h.radius * 0.6, col.main, { grow: h.radius * 4 });
        this.flashRequests.push({ color: col.main, intensity: 0.9, x: h.x });
        break;
      case 'lava':
        for (let i = 0; i < 14; i++) fx.spawn(FxKind.Dust, h.x + (Math.random() - 0.5) * h.radius, -10, (Math.random() - 0.5) * 120, -40 - Math.random() * 60, 1.4, 20 + Math.random() * 20, '#3a1a10', { grow: 30, drag: 1.5 });
        fx.spawn(FxKind.Ring, h.x, 0, 0, 0, 0.45, h.radius * 0.5, col.main, { grow: h.radius * 3 });
        this.flashRequests.push({ color: col.main, intensity: 0.55, x: h.x });
        break;
      case 'icicles':
        // Shatter happens at impact (handled in draw timing) — pre-spawn delayed shards via age check below.
        break;
      case 'voidrift':
        fx.spawn(FxKind.Ring, h.x, -h.radius * 1.6, 0, 0, 0.5, h.radius * 0.3, col.main, { grow: h.radius * 3 });
        this.flashRequests.push({ color: col.main, intensity: 0.45, x: h.x });
        break;
      case 'starfall':
        for (let i = 0; i < 26; i++) {
          const a = -Math.PI * Math.random();
          const sp = 250 + Math.random() * 650;
          fx.spawn(FxKind.Spark, h.x, -4, Math.cos(a) * sp, Math.sin(a) * sp, 0.4 + Math.random() * 0.4, 2, Math.random() < 0.5 ? col.core : col.main, { gravity: 700, drag: 1.5 });
        }
        fx.spawn(FxKind.Ring, h.x, 0, 0, 0, 0.5, h.radius * 0.5, col.main, { grow: h.radius * 4.5 });
        this.flashRequests.push({ color: col.main, intensity: 1, x: h.x });
        break;
      case 'none':
        break;
    }
    void top;
  }

  /** Icicle impact is time-delayed: spawn its burst the first frame after landing. */
  private iceImpacts = new Set<number>();

  draw(ctx: CanvasRenderingContext2D, cam: CameraView, hazards: readonly HazardView[]): void {
    cam.applyTransform(ctx, 1);
    const top = cam.visibleWorldRect(1).top - 120;
    ctx.globalAlpha = 1;
    for (const h of hazards) this.drawOne(ctx, h, top, 1, this.states.get(h.id)?.bolt ?? null, this.states.get(h.id)?.preview ?? null);
    for (const f of this.fading) this.drawOne(ctx, f.view, top, 1 - f.age / 0.35, f.bolt, null);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private marker(ctx: CanvasRenderingContext2D, x: number, r: number, col: string, warn: number, pulse: number): void {
    const a = 0.25 + 0.65 * warn;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgbaStr(col, (0.06 + 0.14 * warn) * (0.7 + 0.3 * pulse));
    ctx.beginPath();
    ctx.ellipse(x, -2, r, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgbaStr(col, a);
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // Converging ring.
    const k = 1.7 - 0.7 * warn;
    ctx.strokeStyle = rgbaStr(col, a * 0.6);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(x, -2, r * k, r * k * 0.26, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Chevron ticks.
    ctx.strokeStyle = rgbaStr(lighten(col, 0.4), a);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + this.t * 1.5;
      const cx = x + Math.cos(ang) * r * 0.82, cy = -2 + Math.sin(ang) * r * 0.82 * 0.26;
      ctx.moveTo(cx - 5, cy - 2);
      ctx.lineTo(cx, cy + 1);
      ctx.lineTo(cx + 5, cy - 2);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawOne(ctx: CanvasRenderingContext2D, h: HazardView, top: number, alpha: number, bolt: Bolt | null, preview: Bolt | null): void {
    if (h.kind === 'none' || alpha <= 0) return;
    const col = COLORS[h.kind];
    const t = this.t;
    const pulse = 0.5 + 0.5 * Math.sin(t * 18);
    ctx.globalAlpha = 1;
    switch (h.kind) {
      case 'lightning': {
        if (!h.striking) {
          this.marker(ctx, h.x, h.radius, col.main, h.warn, pulse);
          if (preview) {
            ctx.globalCompositeOperation = 'lighter';
            strokeGlowLine(ctx, preview.main, col.main, col.core, 0.8, (0.12 + 0.3 * h.warn) * alpha);
            ctx.globalCompositeOperation = 'source-over';
          }
          // Gathering charge high above.
          ctx.globalCompositeOperation = 'lighter';
          drawSprite(ctx, glowSprite(col.main), h.x, top + 140, 30 + 50 * h.warn, 0.25 * h.warn * (0.6 + 0.4 * pulse));
          ctx.globalCompositeOperation = 'source-over';
        } else {
          const age = h.strikeAge;
          const flick = age < 0.08 ? 1 : (0.45 + 0.55 * Math.random()) * Math.max(0, 1 - (age - 0.08) / 0.5);
          const a = flick * alpha;
          ctx.globalCompositeOperation = 'lighter';
          // Light column.
          const g = ctx.createLinearGradient(h.x - h.radius, 0, h.x + h.radius, 0);
          g.addColorStop(0, rgbaStr(col.main, 0));
          g.addColorStop(0.5, rgbaStr(col.main, 0.22 * a));
          g.addColorStop(1, rgbaStr(col.main, 0));
          ctx.fillStyle = g;
          ctx.fillRect(h.x - h.radius, top, h.radius * 2, -top);
          if (bolt) {
            strokeGlowLine(ctx, bolt.main, col.main, col.core, 4.2, a);
            for (const b of bolt.branches) strokeGlowLine(ctx, b, col.main, col.core, 1.8, a * 0.75);
          }
          drawSprite(ctx, glowSprite(col.main), h.x, -4, h.radius * 2.2, 0.8 * a);
          drawSprite(ctx, glowSprite(col.core), h.x, -4, h.radius * 0.7, 0.9 * a);
          ctx.globalCompositeOperation = 'source-over';
        }
        break;
      }
      case 'lava': {
        // Glowing bubbling patch (also during the strike as the vent).
        const w = h.striking ? 1 : h.warn;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(h.x, -2, 0, h.x, -2, h.radius);
        g.addColorStop(0, rgbaStr(col.core, (0.25 + 0.5 * w) * alpha));
        g.addColorStop(0.45, rgbaStr(col.main, (0.2 + 0.4 * w) * alpha));
        g.addColorStop(1, rgbaStr(col.main, 0));
        ctx.fillStyle = g;
        ctx.save();
        ctx.translate(h.x, -2);
        ctx.scale(1, 0.26);
        ctx.translate(-h.x, 2);
        ctx.beginPath();
        ctx.arc(h.x, -2, h.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (!h.striking) {
          this.marker(ctx, h.x, h.radius, col.main, h.warn, pulse);
          // Heat shimmer columns.
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 3; i++) {
            const yy = -((t * 90 + i * 40) % 120);
            drawSprite(ctx, glowSprite(col.main), h.x + Math.sin(t * 3 + i) * h.radius * 0.4, yy, 14, 0.25 * h.warn * (1 + yy / 120));
          }
        } else {
          const hgt = this.geyserHeight(h);
          const bw = h.radius * 0.55;
          const fade = alpha * (1 - smoothstep(1.2, 1.7, h.strikeAge));
          // Outer column.
          ctx.fillStyle = rgbaStr(col.main, 0.75 * fade);
          ctx.beginPath();
          ctx.moveTo(h.x - bw, 0);
          const segs = 10;
          for (let i = 0; i <= segs; i++) {
            const u = i / segs;
            const y = -hgt * u;
            const wv = Math.sin(u * 9 - t * 16) * bw * 0.18;
            ctx.lineTo(h.x - bw * (1 - u * 0.3) + wv, y);
          }
          for (let i = segs; i >= 0; i--) {
            const u = i / segs;
            const y = -hgt * u;
            const wv = Math.sin(u * 9 - t * 16 + 1.7) * bw * 0.18;
            ctx.lineTo(h.x + bw * (1 - u * 0.3) + wv, y);
          }
          ctx.closePath();
          ctx.fill();
          // Hot core.
          ctx.fillStyle = rgbaStr(col.core, 0.85 * fade);
          ctx.beginPath();
          ctx.moveTo(h.x - bw * 0.4, 0);
          ctx.lineTo(h.x - bw * 0.15 + Math.sin(t * 20) * 3, -hgt * 0.95);
          ctx.lineTo(h.x + bw * 0.15 + Math.sin(t * 23) * 3, -hgt * 0.95);
          ctx.lineTo(h.x + bw * 0.4, 0);
          ctx.closePath();
          ctx.fill();
          drawSprite(ctx, glowSprite(col.main), h.x, -hgt * 0.5, hgt * 0.7, 0.45 * fade);
          drawSprite(ctx, glowSprite(col.core), h.x, -hgt, bw * 2.2, 0.6 * fade);
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'icicles': {
        const FALL = 0.12;
        if (!h.striking) {
          // Shadow + target ring + glint above.
          ctx.fillStyle = rgbaStr('#000000', 0.25 + 0.35 * h.warn);
          ctx.beginPath();
          ctx.ellipse(h.x, -2, h.radius * (0.35 + 0.65 * h.warn), h.radius * 0.2 * (0.35 + 0.65 * h.warn), 0, 0, Math.PI * 2);
          ctx.fill();
          this.marker(ctx, h.x, h.radius, col.main, h.warn, pulse);
          ctx.globalCompositeOperation = 'lighter';
          const gy = top + 160 + h.warn * 120;
          drawSprite(ctx, glowSprite(col.main), h.x, gy, 20 + 16 * pulse, 0.6);
          ctx.strokeStyle = rgbaStr(col.core, 0.8);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(h.x - 12, gy); ctx.lineTo(h.x + 12, gy);
          ctx.moveTo(h.x, gy - 12); ctx.lineTo(h.x, gy + 12);
          ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        } else {
          const age = h.strikeAge;
          const len = 300, wd = h.radius * 0.6;
          const u = clamp01(age / FALL);
          const tipY = top + (0 - top) * u * u;
          let a = alpha;
          if (u >= 1) {
            if (!this.iceImpacts.has(h.id)) {
              if (this.iceImpacts.size > 256) this.iceImpacts.clear();
              this.iceImpacts.add(h.id);
              for (let i = 0; i < 22; i++) {
                const ang = -Math.PI * Math.random();
                const sp = 200 + Math.random() * 600;
                this.fx.spawn(FxKind.Shard, h.x + (Math.random() - 0.5) * wd, -10, Math.cos(ang) * sp, Math.sin(ang) * sp, 0.8 + Math.random() * 0.6, 4 + Math.random() * 7, rgbaStr('#dff8ff', 0.85), { gravity: 1600, rotV: (Math.random() - 0.5) * 20, color2: '#ffffff', ground: true });
              }
              for (let i = 0; i < 8; i++) this.fx.spawn(FxKind.Dust, h.x + (Math.random() - 0.5) * h.radius, -10, (Math.random() - 0.5) * 160, -30 - Math.random() * 50, 1.2, 24 + Math.random() * 16, '#cfefff', { grow: 40, drag: 2 });
              this.fx.spawn(FxKind.Ring, h.x, 0, 0, 0, 0.4, h.radius * 0.5, col.main, { grow: h.radius * 4 });
              this.flashRequests.push({ color: '#cdefff', intensity: 0.5, x: h.x });
            }
            a *= 1 - smoothstep(0.25, 0.8, age);
          }
          if (a <= 0) break;
          // Icicle body (embedded and shortened after impact).
          const shown = u >= 1 ? len * 0.55 : len;
          const ty = u >= 1 ? 30 : tipY;
          const g = ctx.createLinearGradient(h.x - wd / 2, 0, h.x + wd / 2, 0);
          g.addColorStop(0, rgbaStr('#e8fbff', 0.9 * a));
          g.addColorStop(0.5, rgbaStr('#9fdcff', 0.75 * a));
          g.addColorStop(1, rgbaStr('#5aa8d8', 0.85 * a));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(h.x, ty);
          ctx.lineTo(h.x - wd / 2, ty - shown);
          ctx.lineTo(h.x - wd * 0.2, ty - shown - 20);
          ctx.lineTo(h.x + wd * 0.25, ty - shown - 12);
          ctx.lineTo(h.x + wd / 2, ty - shown);
          ctx.closePath();
          ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = rgbaStr('#ffffff', 0.7 * a);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(h.x - wd * 0.12, ty - 10);
          ctx.lineTo(h.x - wd * 0.3, ty - shown + 6);
          ctx.stroke();
          if (u < 1) {
            // Speed streaks.
            ctx.strokeStyle = rgbaStr(col.main, 0.35 * a);
            ctx.beginPath();
            for (let k = -1; k <= 1; k++) {
              ctx.moveTo(h.x + k * wd * 0.35, ty - shown - 20);
              ctx.lineTo(h.x + k * wd * 0.35, ty - shown - 220);
            }
            ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        break;
      }
      case 'voidrift': {
        const H = h.radius * 3.4;
        if (!h.striking) {
          this.marker(ctx, h.x, h.radius, col.main, h.warn, pulse);
          ctx.globalCompositeOperation = 'lighter';
          const flick = Math.random() < 0.3 + h.warn * 0.6 ? 1 : 0.3;
          const pts = [];
          for (let i = 0; i <= 8; i++) pts.push({ x: h.x + (Math.random() - 0.5) * 6, y: -H * (i / 8) * (0.4 + 0.6 * h.warn) });
          strokeGlowLine(ctx, pts, col.main, col.core, 0.9, (0.25 + 0.55 * h.warn) * flick * alpha);
          ctx.globalCompositeOperation = 'source-over';
        } else {
          const age = h.strikeAge;
          const open = ease.outBack(clamp01(age / 0.18)) * (1 - smoothstep(1.0, 1.5, age));
          const w = h.radius * 0.6 * Math.max(0, open);
          const a = alpha;
          const cy = -H / 2;
          // Dark interior.
          ctx.fillStyle = rgbaStr('#04000a', 0.95 * a);
          ctx.beginPath();
          ctx.moveTo(h.x, 0);
          ctx.quadraticCurveTo(h.x - w * 2, cy, h.x, -H);
          ctx.quadraticCurveTo(h.x + w * 2, cy, h.x, 0);
          ctx.closePath();
          ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          // Inner swirl glow.
          drawSprite(ctx, glowSprite(col.main), h.x, cy, H * 0.55, 0.35 * a * Math.max(0, open));
          // Edges.
          const left = [], right = [];
          for (let i = 0; i <= 14; i++) {
            const u = i / 14;
            const yy = -H * u;
            const ww = w * Math.sin(u * Math.PI) * 1.0;
            const jit = (Math.random() - 0.5) * 4;
            left.push({ x: h.x - ww + jit, y: yy });
            right.push({ x: h.x + ww - jit, y: yy });
          }
          strokeGlowLine(ctx, left, col.main, col.core, 2.2, a);
          strokeGlowLine(ctx, right, col.main, col.core, 2.2, a);
          // Crackling arcs.
          if (Math.random() < 0.6) {
            const yy = -H * (0.2 + Math.random() * 0.6);
            const b = makeBolt(Math.random, h.x + (Math.random() < 0.5 ? -w : w), yy, h.x + (Math.random() - 0.5) * h.radius * 3, yy + (Math.random() - 0.5) * 80, 3, 0.3, 0);
            strokeGlowLine(ctx, b.main, '#ff7ae8', '#ffffff', 0.8, 0.7 * a);
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        break;
      }
      case 'starfall': {
        if (!h.striking) {
          this.marker(ctx, h.x, h.radius, col.main, h.warn, pulse);
          if (h.warn > 0.15) {
            const u = Math.pow((h.warn - 0.15) / 0.85, 1.6);
            const sx = h.x + 700 * (1 - u), sy = top + (0 - top) * u;
            const tx = sx + 700 * 0.22, ty = sy - (0 - top) * 0.22;
            ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createLinearGradient(sx, sy, tx, ty);
            g.addColorStop(0, rgbaStr(col.core, 0.9));
            g.addColorStop(1, rgbaStr(col.main, 0));
            ctx.strokeStyle = g;
            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(tx, ty);
            ctx.stroke();
            drawSprite(ctx, glowSprite(col.main), sx, sy, 40, 0.8);
            drawSprite(ctx, glowSprite(col.core), sx, sy, 14, 1);
            ctx.globalCompositeOperation = 'source-over';
          }
        } else {
          const age = h.strikeAge;
          const f = clamp01(1 - age / 0.6);
          const a = f * alpha;
          ctx.globalCompositeOperation = 'lighter';
          drawSprite(ctx, glowSprite(col.main), h.x, -10, h.radius * (2 + age * 4), 0.8 * a);
          drawSprite(ctx, glowSprite(col.core), h.x, -10, h.radius * 0.9, a);
          const len = h.radius * (2.5 + age * 6);
          const rg = ctx.createRadialGradient(h.x, -10, 0, h.x, -10, len);
          rg.addColorStop(0, rgbaStr(col.core, 0.5 * a));
          rg.addColorStop(0.4, rgbaStr(col.main, 0.22 * a));
          rg.addColorStop(1, rgbaStr(col.main, 0));
          ctx.fillStyle = rg;
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * Math.PI * 2 + age * 1.5;
            ctx.moveTo(h.x, -10);
            ctx.lineTo(h.x + Math.cos(ang - 0.05) * len, -10 + Math.sin(ang - 0.05) * len * 0.6);
            ctx.lineTo(h.x + Math.cos(ang + 0.05) * len, -10 + Math.sin(ang + 0.05) * len * 0.6);
            ctx.closePath();
          }
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
        break;
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Forget per-hazard bookkeeping (e.g. on a new battle). */
  reset(): void {
    this.states.clear();
    this.fading = [];
    this.iceImpacts.clear();
  }

  get themeId(): string {
    return this.theme.id;
  }
}
