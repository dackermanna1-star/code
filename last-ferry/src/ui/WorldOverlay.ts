// Per-frame 2D canvas over the 3D view for world-anchored UI:
//   - the hunter's crosshair in front of him with an ammo ring (segmented for
//     small clips), a brass reload ring and the outboard's spin-up arc;
//   - "+$40" money pop-ups that float up and fade;
//   - twitch warnings over downed bodies that are about to rise (and a quiet
//     grey tell a few seconds earlier: that body is not dead yet);
//   - the crane: the hook marker and the drop square, a "line up" arrow by the
//     crosshair, "DROP" when the gun line is on the hook;
//   - markers: mop-up stragglers, red rings under zombies nearing the gangway,
//     the one that boarded (game over);
//   - screen tints: damage vignette, gas-cloud green, night vignette, and a red
//     glow on the right edge when a zombie nears the gangway.
// Positions are CSS px inside the view (Stage.project gives them), or world
// metres through project()/popMoneyAt() which use the fixed camera maths of
// config/view.ts. Sizes are design px scaled by k (CSS px per design px).
import type { WeaponId } from '../config/ids';
import { worldToScreen } from '../config/view';
import { prepareView, viewScale } from './dom';

export interface OverlayCrosshair {
  /** CSS px inside the view. */
  x: number;
  y: number;
  bullets: number;
  clip: number;
  /** 0..1 while reloading, else null. */
  reload: number | null;
  /** Outboard engine spin 0..1. */
  spin?: number;
  /** Outboard barrel heat 0..1. */
  heat?: number;
  weapon?: WeaponId;
  /** 0..1 recent-shot kick (1 right after firing). */
  kick?: number;
  /** Hide the ammo ring (e.g. attract mode). */
  bare?: boolean;
}

export interface OverlayTwitch {
  /** CSS px of the body (the badge is drawn a little above). */
  x: number;
  y: number;
  /** 0..1 progress of the 2 s twitch (1 = rising now). */
  t: number;
}

/** The crane affordance (CSS px). */
export interface OverlayCrane {
  /** The hook block's centre. (The drop square itself is painted on the deck by the game view.) */
  hook: { x: number; y: number };
  /** 0..1 how close the gun line is to the hook's lane (1 = lined up). */
  near: number;
  lined: boolean;
  /** Zombies under the pallet, and how many make it worth a drop. */
  under: number;
  crowd: number;
  /** Which way to move to line up: -1 up, +1 down, 0 lined up. */
  dir: number;
  /** Where the crosshair is (the arrow hangs next to it). */
  ch?: { x: number; y: number };
}

/** A marker on a zombie: head chevron at (x, y), deck ring at (fx, fy) with radius r (CSS px). */
export interface OverlayMark {
  kind: 'straggler' | 'gangway' | 'culprit';
  x: number;
  y: number;
  fx: number;
  fy: number;
  r: number;
}

export interface OverlayFrame {
  crosshair?: OverlayCrosshair | null;
  twitches?: OverlayTwitch[];
  /** Downed bodies a few seconds before they start twitching (t 0..1). */
  stirring?: OverlayTwitch[];
  crane?: OverlayCrane | null;
  marks?: OverlayMark[];
  /** 0..1 red damage vignette. */
  damage?: number;
  /** 0..1 inside a gas cloud: green tint. */
  gas?: number;
  /** 0..1 night vignette (chapter 3). */
  night?: number;
  /** 0..1 a zombie is close to the gangway: red glow on the right edge. */
  danger?: number;
}

export type MoneyReason = 'bounty' | 'headshot' | 'nice' | 'tidy';

interface Popup {
  x: number;
  y: number;
  /** Where it was asked for (merging). */
  x0: number;
  y0: number;
  amount: number;
  text: string;
  sub: string;
  reason: MoneyReason | 'text';
  color: string;
  age: number;
  life: number;
  size: number;
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, system-ui, 'Helvetica Neue', Arial, sans-serif";
const FG = 'rgba(255, 249, 238, 0.96)';
const OUTLINE = 'rgba(6, 8, 12, 0.6)';
const BRASS = '#f0b65a';
const BRASS_HI = '#ffd99a';
const SIGNAL = '#ff4936';
const MAX_POPUPS = 24;
const RANK: Record<MoneyReason, number> = { bounty: 0, tidy: 1, headshot: 2, nice: 3 };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

export class WorldOverlay {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly view: HTMLElement;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private popups: Popup[] = [];
  private time = 0;
  private wasEmpty = false;
  private dirty = true;
  private vignetteCache = new Map<string, CanvasGradient>();
  private spinAngle = 0;
  /** Night vignette strength set by options/chapter; combined with frame.night. */
  nightBase = 0;
  /** Debug: last frame's drawn item counts. */
  readonly stats = { popups: 0, twitches: 0, crosshair: false, marks: 0, crane: '' };

  constructor(view: HTMLElement) {
    prepareView(view);
    this.view = view;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'lf-overlay-canvas';
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    view.appendChild(this.canvas);
    this.resize();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(view);
  }

  /** World metres → CSS px in the view (fixed gameplay camera, no shake). */
  project(x: number, y: number, z: number): { x: number; y: number } {
    const p = worldToScreen(x, y, z);
    return { x: p.u * this.view.clientWidth, y: p.v * this.view.clientHeight };
  }

  /** A floating "+$40" at CSS px (x, y). */
  popMoney(x: number, y: number, amount: number, reason: MoneyReason = 'bounty'): void {
    const a = Math.round(amount);
    if (!a) return;
    const k = this.k;
    // A bounty and its headshot bonus (or a nice-shot bonus) arriving together
    // become one pop-up: "+$45 HEADSHOT".
    for (const p of this.popups) {
      if (p.reason === 'text' || p.age > 0.12) continue;
      if (Math.abs(p.x0 - x) < 34 * k && Math.abs(p.y0 - y) < 34 * k) {
        p.amount += a;
        if (RANK[reason] > RANK[p.reason as MoneyReason]) this.style(p, reason);
        p.text = WorldOverlay.money(p.amount);
        p.age = Math.min(p.age, 0.04);
        return;
      }
    }
    // Stack pop-ups that land on top of each other.
    let yy = y;
    for (const p of this.popups) {
      if (p.age < 0.35 && Math.abs(p.x - x) < 26 * k && Math.abs(p.y - yy) < 14 * k) yy = p.y - 16 * k;
    }
    const p: Popup = { x, y: yy, x0: x, y0: y, amount: a, text: WorldOverlay.money(a), sub: '', reason, color: BRASS, age: 0, life: 1.15, size: 15 };
    this.style(p, reason);
    this.push(p);
  }

  private static money(a: number): string {
    return `${a > 0 ? '+' : '−'}$${Math.abs(a)}`;
  }

  private style(p: Popup, reason: MoneyReason): void {
    p.reason = reason;
    p.sub = reason === 'headshot' ? 'HEADSHOT' : reason === 'nice' ? 'NICE SHOT' : reason === 'tidy' ? 'TIDY' : '';
    p.color = reason === 'headshot' ? '#ffffff' : reason === 'tidy' ? '#c9efc2' : reason === 'nice' ? BRASS_HI : BRASS;
    p.size = reason === 'nice' ? 22 : reason === 'tidy' ? 13 : 15;
    p.life = reason === 'nice' ? 1.6 : 1.15;
  }

  /** popMoney at a world position (metres). */
  popMoneyAt(wx: number, wy: number, wz: number, amount: number, reason: MoneyReason = 'bounty'): void {
    const p = this.project(wx, wy + 0.4, wz);
    this.popMoney(p.x, p.y, amount, reason);
  }

  /** Any short floating text (e.g. "KICK!", "PINNED") at CSS px. */
  popText(x: number, y: number, text: string, color = FG, size = 13): void {
    this.push({ x, y, x0: x, y0: y, amount: 0, text, sub: '', reason: 'text', color, age: 0, life: 1, size });
  }

  /** Remove pop-ups (new game). */
  clear(): void {
    this.popups = [];
    this.dirty = true;
  }

  /** Draw one frame. `dt` (s) ages the pop-ups (pass 0 while paused). */
  render(f: OverlayFrame, dt = 1 / 60): void {
    if (this.view.clientWidth !== this.cssW || this.view.clientHeight !== this.cssH) this.resize();
    this.time += dt;
    this.spinAngle += dt * (2 + 30 * clamp01(f.crosshair?.spin ?? 0));
    for (const p of this.popups) p.age += dt;
    if (this.popups.length) this.popups = this.popups.filter((p) => p.age < p.life);

    const damage = clamp01(f.damage ?? 0);
    const gas = clamp01(f.gas ?? 0);
    const night = clamp01(Math.max(this.nightBase, f.night ?? 0));
    const danger = clamp01(f.danger ?? 0);
    const tw = f.twitches ?? [];
    const stir = f.stirring ?? [];
    const marks = f.marks ?? [];
    const crane = f.crane ?? null;
    const ch = f.crosshair ?? null;
    const empty =
      !ch && !crane && tw.length === 0 && stir.length === 0 && marks.length === 0 && this.popups.length === 0 && damage < 0.002 && gas < 0.002 && night < 0.002 && danger < 0.002;
    this.stats.popups = this.popups.length;
    this.stats.twitches = tw.length;
    this.stats.crosshair = !!ch;
    this.stats.marks = marks.length;
    this.stats.crane = crane ? (crane.lined ? 'lined' : crane.near > 0 ? 'near' : crane.under >= crane.crowd ? 'crowd' : 'idle') : '';
    if (empty && this.wasEmpty && !this.dirty) return;
    this.wasEmpty = empty;
    this.dirty = false;

    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (empty) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const k = this.k;

    if (night > 0.002) this.drawNight(night);
    if (gas > 0.002) this.drawGas(gas);
    if (danger > 0.002) this.drawDanger(danger);
    if (damage > 0.002) this.drawDamage(damage);

    if (crane) this.drawCrane(crane, k);
    for (const m of marks) this.drawMark(m, k);
    for (const t of stir) this.drawStir(t, k);
    for (const t of tw) this.drawTwitch(t, k);
    if (ch) this.drawCrosshair(ch, k);
    if (crane) this.drawCraneHint(crane, k);
    for (const p of this.popups) this.drawPopup(p, k);
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- internals

  private get k(): number {
    return viewScale(this.cssW || this.view.clientWidth, this.cssH || this.view.clientHeight);
  }

  private push(p: Popup): void {
    this.popups.push(p);
    if (this.popups.length > MAX_POPUPS) this.popups.shift();
    this.dirty = true;
  }

  private resize(): void {
    const w = this.view.clientWidth;
    const h = this.view.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (w === this.cssW && h === this.cssH && dpr === this.dpr) return;
    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.vignetteCache.clear();
    this.dirty = true;
  }

  /** Stroke the current path with a soft dark outline under the colour. */
  private outlined(width: number, color: string, alpha = 1): void {
    const { ctx } = this;
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = width + Math.max(1.4, width * 1.1);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawCrosshair(c: OverlayCrosshair, k: number): void {
    const { ctx } = this;
    const kick = clamp01(c.kick ?? 0);
    const gap = (4 + 3.5 * kick + (c.weapon === 'shotgun' ? 3 : 0)) * k;
    const len = 6 * k;
    const w = Math.max(1, 1.3 * k);
    const reloading = c.reload !== null && c.reload !== undefined;
    const col = reloading ? 'rgba(255, 249, 238, 0.5)' : c.bullets <= 0 ? SIGNAL : FG;
    // Cross with a centre dot.
    ctx.beginPath();
    ctx.moveTo(c.x - gap - len, c.y);
    ctx.lineTo(c.x - gap, c.y);
    ctx.moveTo(c.x + gap, c.y);
    ctx.lineTo(c.x + gap + len, c.y);
    ctx.moveTo(c.x, c.y - gap - len);
    ctx.lineTo(c.x, c.y - gap);
    ctx.moveTo(c.x, c.y + gap);
    ctx.lineTo(c.x, c.y + gap + len);
    this.outlined(w, col);
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(1, 1.2 * k), 0, Math.PI * 2);
    ctx.fillStyle = OUTLINE;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(0.7, 0.75 * k), 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    if (c.bare) return;

    const R = 17 * k;
    if (!reloading && c.bullets <= 0) this.keyHint('R', c.x + R + 12 * k, c.y, k);
    const rw = Math.max(1.2, 2.2 * k);
    const clip = Math.max(1, Math.round(c.clip));
    const bullets = Math.max(0, Math.min(clip, Math.round(c.bullets)));
    if (reloading) {
      const p = clamp01(c.reload as number);
      this.arc(c.x, c.y, R, 0, 1, rw, 'rgba(255,255,255,0.16)');
      this.arc(c.x, c.y, R, 0, p, rw, BRASS, true);
      return;
    }
    // Ammo ring: one segment per round for small clips, a continuous arc for big ones.
    if (clip <= 8) {
      const seg = 1 / clip;
      const pad = Math.min(0.06, seg * 0.22);
      for (let i = 0; i < clip; i++) {
        const live = i < bullets;
        this.arc(c.x, c.y, R, i * seg + pad / 2, (i + 1) * seg - pad / 2, rw, live ? (bullets <= 1 ? SIGNAL : FG) : 'rgba(255,255,255,0.14)', live);
      }
    } else {
      const f = bullets / clip;
      this.arc(c.x, c.y, R, 0, 1, rw, 'rgba(255,255,255,0.14)');
      this.arc(c.x, c.y, R, 0, f, rw, f < 0.2 ? SIGNAL : FG, true);
    }
    // Outboard: spin-up arc and heat glow on an inner ring.
    if (c.weapon === 'outboard') {
      const spin = clamp01(c.spin ?? 0);
      const heat = clamp01(c.heat ?? 0);
      const r2 = R - 5 * k;
      if (spin > 0.01) {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(this.spinAngle);
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          const a0 = (i * Math.PI * 2) / 3;
          ctx.arc(0, 0, r2, a0, a0 + 0.9 * spin);
          this.outlined(Math.max(1, 1.4 * k), spin > 0.95 ? '#d6f4fa' : 'rgba(200,236,244,0.75)');
        }
        ctx.restore();
      }
      if (heat > 0.05) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, R + 4 * k, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * heat);
        this.outlined(Math.max(1, 1.6 * k), heat > 0.85 ? SIGNAL : '#ff9a3c', 0.9);
      }
    }
  }

  /** A small key-cap chip (e.g. "R" to reload when the gun is empty). */
  private keyHint(key: string, x: number, y: number, k: number): void {
    const { ctx } = this;
    const s = 15 * k;
    const pulse = 0.75 + 0.25 * Math.sin(this.time * 8);
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x - s / 2, y - s / 2, s, s, 3 * k);
    else ctx.rect(x - s / 2, y - s / 2, s, s);
    ctx.fillStyle = 'rgba(10, 8, 6, 0.75)';
    ctx.fill();
    ctx.lineWidth = Math.max(1, 1.2 * k);
    ctx.strokeStyle = SIGNAL;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${(10 * k).toFixed(2)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(key, x, y + 0.5 * k);
    ctx.globalAlpha = 1;
  }

  /** Arc from fraction a0 to a1 of a full turn, starting at 12 o'clock. */
  private arc(x: number, y: number, r: number, a0: number, a1: number, w: number, color: string, glow = false): void {
    if (a1 <= a0) return;
    const { ctx } = this;
    const s = -Math.PI / 2 + a0 * Math.PI * 2;
    const e = -Math.PI / 2 + a1 * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x, y, r, s, e);
    if (glow) this.outlined(w, color);
    else {
      ctx.lineCap = 'butt';
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.stroke();
    }
  }

  private drawTwitch(t: OverlayTwitch, k: number): void {
    const { ctx } = this;
    const p = clamp01(t.t);
    // Faster bob and pulse as the body is about to get up.
    const freq = 4 + 10 * p;
    const bob = Math.sin(this.time * freq) * (1.5 + 2 * p) * k;
    const x = t.x;
    const y = t.y - (26 * k) + bob;
    const r = 11 * k;
    const appear = easeOut(clamp01(p * 6));
    ctx.globalAlpha = appear;
    // Pulse ring.
    const pulse = (this.time * (1.2 + 2 * p)) % 1;
    ctx.beginPath();
    ctx.arc(x, y, r + pulse * 10 * k, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 73, 54, ${(0.55 * (1 - pulse) * appear).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, 1.5 * k);
    ctx.stroke();
    // Badge.
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16, 6, 6, 0.78)';
    ctx.fill();
    // Countdown arc.
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    ctx.strokeStyle = SIGNAL;
    ctx.lineWidth = Math.max(1.2, 2.2 * k);
    ctx.lineCap = 'round';
    ctx.stroke();
    // "!".
    ctx.fillStyle = p > 0.75 && Math.sin(this.time * 30) > 0 ? '#ffffff' : '#ff6a55';
    const bw = 2.6 * k;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x - bw / 2, y - 6.5 * k, bw, 8 * k, bw / 2);
    else ctx.rect(x - bw / 2, y - 6.5 * k, bw, 8 * k);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y + 4.6 * k, 1.5 * k, 0, Math.PI * 2);
    ctx.fill();
    // Tiny pointer down to the body.
    ctx.beginPath();
    ctx.moveTo(x - 3 * k, y + r + 1 * k);
    ctx.lineTo(x + 3 * k, y + r + 1 * k);
    ctx.lineTo(x, y + r + 5 * k);
    ctx.closePath();
    ctx.fillStyle = SIGNAL;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** "Not dead yet": a small grey ring that fills before the red '!' takes over. */
  private drawStir(t: OverlayTwitch, k: number): void {
    const { ctx } = this;
    const p = clamp01(t.t);
    const x = t.x;
    const y = t.y - 22 * k;
    const r = 5 * k;
    ctx.globalAlpha = 0.35 + 0.45 * p;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 10, 12, 0.6)';
    ctx.fill();
    ctx.lineWidth = Math.max(1, 1.3 * k);
    ctx.strokeStyle = 'rgba(200, 200, 205, 0.35)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    ctx.strokeStyle = 'rgba(225, 222, 215, 0.9)';
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Stragglers (mop-up), zombies nearing the gangway, the one that boarded. */
  private drawMark(m: OverlayMark, k: number): void {
    const { ctx } = this;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (m.kind === 'gangway' ? 9 : 5));
    if (m.kind !== 'straggler') {
      // A ring on the deck under it.
      const rx = m.r * (m.kind === 'culprit' ? 1.6 : 1.25) + pulse * 3 * k;
      ctx.beginPath();
      ctx.ellipse(m.fx, m.fy, rx, rx * 0.42, 0, 0, Math.PI * 2);
      ctx.globalAlpha = m.kind === 'culprit' ? 0.95 : 0.55 + 0.35 * pulse;
      ctx.lineWidth = Math.max(1.2, (m.kind === 'culprit' ? 3 : 2) * k);
      ctx.strokeStyle = SIGNAL;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (m.kind === 'gangway') return;
    // A chevron over the head.
    const s = (m.kind === 'culprit' ? 9 : 5.5) * k;
    const y = m.y - (m.kind === 'culprit' ? 6 : 2) * k - pulse * 2.5 * k;
    ctx.beginPath();
    ctx.moveTo(m.x - s, y - s * 0.9);
    ctx.lineTo(m.x, y);
    ctx.lineTo(m.x + s, y - s * 0.9);
    this.outlined(Math.max(1.4, (m.kind === 'culprit' ? 3 : 2) * k), m.kind === 'culprit' ? SIGNAL : '#ff7a5c', m.kind === 'culprit' ? 1 : 0.85);
  }

  /** The hook marker: brackets around the block, brass when lined up, with DROP / the crowd under it. */
  private drawCrane(c: OverlayCrane, k: number): void {
    const { ctx } = this;
    const crowd = c.under >= c.crowd;
    const show = Math.max(c.near, crowd ? 0.55 : 0);
    if (show <= 0.01) return;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (c.lined ? 7 : 4));
    const r = (11 + (c.lined ? 3 * pulse : 0)) * k;
    const { x, y } = c.hook;
    const col = c.lined ? BRASS_HI : 'rgba(255, 249, 238, 0.95)';
    const a = Math.min(1, 0.3 + show);
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(x + sx * r, y + sy * r * 0.45);
      ctx.lineTo(x + sx * r, y + sy * r);
      ctx.lineTo(x + sx * r * 0.45, y + sy * r);
      this.outlined(Math.max(1.2, 1.8 * k), col, a);
    }
    // Label over the hook: how many are under it, or DROP when lined up.
    const label = c.lined ? (c.under > 0 ? `DROP ×${c.under}` : 'DROP') : crowd ? `×${c.under}` : '';
    if (label) {
      ctx.globalAlpha = a;
      ctx.font = `800 ${(11 * k).toFixed(2)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, 3 * k);
      ctx.strokeStyle = OUTLINE;
      ctx.strokeText(label, x, y - r - 3 * k);
      ctx.fillStyle = c.lined ? BRASS_HI : '#ffd1b8';
      ctx.fillText(label, x, y - r - 3 * k);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Next to the crosshair: "ON THE HOOK" whenever the gun line is on it (a shot
   * drops the pallet), and "HOOK" with an arrow toward its lane when a crowd
   * stands under it and the Bosun is close to that lane.
   */
  private drawCraneHint(c: OverlayCrane, k: number): void {
    if (!c.ch || c.near <= 0.01 || (!c.lined && c.under < c.crowd)) return;
    const { ctx } = this;
    const x = c.ch.x - 26 * k;
    const y = c.ch.y;
    ctx.globalAlpha = Math.min(1, 0.25 + c.near);
    ctx.font = `800 ${(9.5 * k).toFixed(2)}px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, 2.6 * k);
    ctx.strokeStyle = OUTLINE;
    const text = c.lined ? 'ON THE HOOK' : 'HOOK';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = c.lined ? BRASS_HI : FG;
    ctx.fillText(text, x, y);
    if (!c.lined) {
      // A chevron pointing the way to move.
      const ax = x + 8 * k;
      const s = 4 * k;
      const ay = y + c.dir * 1.5 * k;
      ctx.beginPath();
      ctx.moveTo(ax - s, ay - c.dir * s * 0.6);
      ctx.lineTo(ax, ay + c.dir * s * 0.6);
      ctx.lineTo(ax + s, ay - c.dir * s * 0.6);
      this.outlined(Math.max(1.2, 1.6 * k), FG, Math.min(1, 0.25 + c.near));
    }
    ctx.globalAlpha = 1;
  }

  private drawPopup(p: Popup, k: number): void {
    const { ctx } = this;
    const t = p.age / p.life;
    const rise = easeOut(clamp01(t)) * (p.reason === 'nice' ? 46 : 34) * k;
    const pop = t < 0.12 ? 0.7 + (t / 0.12) * 0.45 : t < 0.22 ? 1.15 - ((t - 0.12) / 0.1) * 0.15 : 1;
    const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    const size = p.size * k * pop;
    const x = Math.max(30 * k, Math.min(this.cssW - 30 * k, p.x));
    const y = p.y - rise;
    ctx.globalAlpha = clamp01(alpha);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${size.toFixed(2)}px ${FONT}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * 0.24);
    ctx.strokeStyle = 'rgba(8, 6, 4, 0.72)';
    ctx.strokeText(p.text, x, y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, x, y);
    if (p.sub) {
      const ss = Math.max(7, size * 0.48);
      ctx.font = `800 ${ss.toFixed(2)}px ${FONT}`;
      ctx.lineWidth = Math.max(1.5, ss * 0.28);
      ctx.strokeText(p.sub, x, y - size * 0.86);
      ctx.fillStyle = p.reason === 'headshot' ? '#ff6a55' : p.color;
      ctx.fillText(p.sub, x, y - size * 0.86);
    }
    ctx.globalAlpha = 1;
  }

  private gradient(key: string, make: () => CanvasGradient): CanvasGradient {
    let g = this.vignetteCache.get(key);
    if (!g) {
      g = make();
      this.vignetteCache.set(key, g);
    }
    return g;
  }

  private drawDamage(v: number): void {
    const { ctx, cssW: w, cssH: h } = this;
    const g = this.gradient('damage', () => {
      const r = Math.hypot(w, h) / 2;
      const gr = ctx.createRadialGradient(w / 2, h / 2, r * 0.5, w / 2, h / 2, r);
      gr.addColorStop(0, 'rgba(190, 14, 8, 0)');
      gr.addColorStop(0.5, 'rgba(190, 14, 8, 0.16)');
      gr.addColorStop(1, 'rgba(140, 4, 2, 0.62)');
      return gr;
    });
    ctx.globalAlpha = v;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  private drawGas(v: number): void {
    const { ctx, cssW: w, cssH: h } = this;
    // A sickly green wash plus three slow blotches drifting across the frame.
    ctx.globalAlpha = 0.16 * v;
    ctx.fillStyle = '#7fbf3a';
    ctx.fillRect(0, 0, w, h);
    const t = this.time;
    for (let i = 0; i < 3; i++) {
      const cx = w * (0.5 + 0.38 * Math.sin(t * (0.21 + i * 0.07) + i * 2.1));
      const cy = h * (0.5 + 0.3 * Math.cos(t * (0.17 + i * 0.05) + i * 1.3));
      const r = Math.max(w, h) * (0.32 + 0.08 * Math.sin(t * 0.6 + i));
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(160, 220, 70, 0.32)');
      g.addColorStop(1, 'rgba(160, 220, 70, 0)');
      ctx.globalAlpha = v;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    const edge = this.gradient('gas', () => {
      const r = Math.hypot(w, h) / 2;
      const gr = ctx.createRadialGradient(w / 2, h / 2, r * 0.35, w / 2, h / 2, r);
      gr.addColorStop(0, 'rgba(70, 110, 20, 0)');
      gr.addColorStop(1, 'rgba(60, 100, 10, 0.7)');
      return gr;
    });
    ctx.globalAlpha = v;
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  private drawNight(v: number): void {
    const { ctx, cssW: w, cssH: h } = this;
    const g = this.gradient('night', () => {
      const r = Math.hypot(w, h) / 2;
      const gr = ctx.createRadialGradient(w * 0.55, h * 0.55, r * 0.3, w * 0.55, h * 0.55, r * 1.05);
      gr.addColorStop(0, 'rgba(2, 4, 12, 0)');
      gr.addColorStop(0.6, 'rgba(2, 4, 12, 0.3)');
      gr.addColorStop(1, 'rgba(2, 4, 12, 0.85)');
      return gr;
    });
    ctx.globalAlpha = v;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  private drawDanger(v: number): void {
    const { ctx, cssW: w, cssH: h } = this;
    const g = this.gradient('danger', () => {
      const gr = ctx.createLinearGradient(w, 0, w * 0.8, 0);
      gr.addColorStop(0, 'rgba(255, 40, 20, 0.55)');
      gr.addColorStop(1, 'rgba(255, 40, 20, 0)');
      return gr;
    });
    const pulse = 0.65 + 0.35 * Math.sin(this.time * 9);
    ctx.globalAlpha = v * pulse;
    ctx.fillStyle = g;
    ctx.fillRect(w * 0.8, 0, w * 0.2, h);
    ctx.globalAlpha = 1;
  }
}
