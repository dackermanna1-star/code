/**
 * Environment particle systems: weather (two depth layers), transient FX particles
 * (sparks, lava blobs, ice shards, void motes, dust, splashes) and physical debris chunks
 * from shattered props. All pooled; no per-frame allocation in the hot paths.
 */
import type { CameraView } from '../types';
import type { WeatherKind } from '../../sim/arena';
import { blobSprite, chunkShape, glowSprite, rgbaStr, mix } from './util';

/* =========================================================== WEATHER ==== */

export interface WeatherLook {
  kind: WeatherKind;
  /** Main particle colour. */
  color: string;
  /** Secondary colour (variation / glow). */
  color2: string;
  /** Horizontal wind (world units / s). */
  wind: number;
}

enum WK { Rain, Snow, Embers, Ash, Motes, Petals, Leaves, Sparkles }
function kindCode(k: WeatherKind): WK {
  switch (k) {
    case 'rain': return WK.Rain;
    case 'snow': return WK.Snow;
    case 'embers': return WK.Embers;
    case 'ash': return WK.Ash;
    case 'motes': return WK.Motes;
    case 'petals': return WK.Petals;
    case 'leaves': return WK.Leaves;
    case 'sparkles': return WK.Sparkles;
  }
}

export class WeatherLayer {
  readonly n: number;
  readonly parallax: number;
  readonly near: boolean;
  private x: Float32Array;
  private y: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private size: Float32Array;
  private phase: Float32Array;
  private rot: Float32Array;
  private rotV: Float32Array;
  private seeded = false;
  private t = 0;
  private code: WK;
  /** Called with world x when a near rain drop hits the ground. */
  onGroundHit: ((x: number) => void) | null = null;

  constructor(private look: WeatherLook, count: number, parallax: number, near: boolean) {
    this.n = count;
    this.parallax = parallax;
    this.near = near;
    this.code = kindCode(look.kind);
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.size = new Float32Array(count);
    this.phase = new Float32Array(count);
    this.rot = new Float32Array(count);
    this.rotV = new Float32Array(count);
  }

  private spawn(i: number, l: number, r: number, t: number, b: number, anywhere: boolean): void {
    const k = this.code;
    const depth = this.near ? 1 : 0.6;
    this.x[i] = l + Math.random() * (r - l);
    this.phase[i] = Math.random() * Math.PI * 2;
    this.rot[i] = Math.random() * Math.PI * 2;
    this.rotV[i] = (Math.random() * 2 - 1) * 4;
    const w = this.look.wind;
    switch (k) {
      case WK.Rain:
        this.vx[i] = w * (0.9 + Math.random() * 0.2);
        this.vy[i] = (1500 + Math.random() * 500) * depth;
        this.size[i] = (0.8 + Math.random() * 0.8) * depth;
        break;
      case WK.Snow:
        this.vx[i] = w * (0.6 + Math.random() * 0.6);
        this.vy[i] = (45 + Math.random() * 80) * depth;
        this.size[i] = (1.2 + Math.random() * 2.6) * (this.near ? 1 : 0.7);
        break;
      case WK.Embers:
        this.vx[i] = w * 0.5 + (Math.random() * 2 - 1) * 25;
        this.vy[i] = -(35 + Math.random() * 90) * depth;
        this.size[i] = (1.0 + Math.random() * 2.4) * (this.near ? 1 : 0.7);
        break;
      case WK.Ash:
        this.vx[i] = w * (0.6 + Math.random() * 0.8);
        this.vy[i] = (28 + Math.random() * 55) * depth;
        this.size[i] = (1.4 + Math.random() * 2.6) * (this.near ? 1 : 0.7);
        break;
      case WK.Motes:
        this.vx[i] = (Math.random() * 2 - 1) * 20;
        this.vy[i] = -(10 + Math.random() * 35) * depth;
        this.size[i] = (1.0 + Math.random() * 2.2) * (this.near ? 1 : 0.75);
        break;
      case WK.Petals:
      case WK.Leaves:
        this.vx[i] = w * (0.7 + Math.random() * 0.6);
        this.vy[i] = (35 + Math.random() * 55) * depth;
        this.size[i] = (3.2 + Math.random() * 3.0) * (this.near ? 1 : 0.65);
        break;
      case WK.Sparkles:
        this.vx[i] = (Math.random() * 2 - 1) * 12 + w * 0.3;
        this.vy[i] = -(6 + Math.random() * 18);
        this.size[i] = (2 + Math.random() * 4) * (this.near ? 1 : 0.7);
        break;
    }
    if (anywhere) {
      this.y[i] = t + Math.random() * (b - t);
    } else {
      // Enter from the edge the motion comes from.
      const rising = this.vy[i] < 0;
      this.y[i] = rising ? b - Math.random() * 30 : t + Math.random() * 30;
    }
  }

  update(dt: number, cam: CameraView): void {
    this.t += dt;
    const rect = cam.visibleWorldRect(this.parallax);
    const l = rect.left, r = rect.right, t = rect.top, b = this.near ? Math.min(rect.bottom, 40) : rect.bottom;
    const w = r - l, h = b - t;
    if (!this.seeded) {
      for (let i = 0; i < this.n; i++) this.spawn(i, l, r, t, b, true);
      this.seeded = true;
    }
    const k = this.code;
    const time = this.t;
    for (let i = 0; i < this.n; i++) {
      let vx = this.vx[i];
      const ph = this.phase[i];
      if (k === WK.Snow || k === WK.Ash) vx += Math.sin(time * 1.3 + ph) * 22;
      else if (k === WK.Embers) vx += Math.sin(time * 2.1 + ph) * 30;
      else if (k === WK.Motes) vx += Math.sin(time * 0.8 + ph) * 26;
      else if (k === WK.Petals || k === WK.Leaves) vx += Math.sin(time * 1.7 + ph) * 40;
      this.x[i] += vx * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.rotV[i] * dt;
      // Ground interaction for the near layer.
      if (this.near && this.vy[i] > 0 && this.y[i] > 0) {
        if (k === WK.Rain && this.onGroundHit && Math.random() < 0.35) this.onGroundHit(this.x[i]);
        this.spawn(i, l, r, t, b, false);
        continue;
      }
      // Wrap / respawn when leaving the view.
      const x = this.x[i], y = this.y[i];
      if (x < l) this.x[i] += w;
      else if (x > r) this.x[i] -= w;
      if (y > b + 20 || y < t - 40) {
        if (h > 0) this.spawn(i, l, r, t, b, false);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, cam: CameraView, alphaMul = 1): void {
    cam.applyTransform(ctx, this.parallax);
    const k = this.code;
    const look = this.look;
    const n = this.n;
    const a0 = (this.near ? 1 : 0.55) * alphaMul;
    const time = this.t;
    ctx.globalAlpha = 1;
    switch (k) {
      case WK.Rain: {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = rgbaStr(look.color, 0.32 * a0);
        ctx.lineWidth = this.near ? 1.5 : 1;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = this.x[i], y = this.y[i];
          const s = 0.022 * this.size[i];
          ctx.moveTo(x, y);
          ctx.lineTo(x - this.vx[i] * s, y - this.vy[i] * s);
        }
        ctx.stroke();
        break;
      }
      case WK.Snow: {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = rgbaStr(look.color, 0.85 * a0);
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const s = this.size[i];
          ctx.moveTo(this.x[i] + s, this.y[i]);
          ctx.arc(this.x[i], this.y[i], s, 0, Math.PI * 2);
        }
        ctx.fill();
        break;
      }
      case WK.Embers:
      case WK.Motes: {
        ctx.globalCompositeOperation = 'lighter';
        const glow = glowSprite(look.color);
        const glow2 = glowSprite(look.color2);
        for (let i = 0; i < n; i++) {
          const flick = k === WK.Embers ? 0.55 + 0.45 * Math.sin(time * 9 + this.phase[i] * 3) : 0.6 + 0.4 * Math.sin(time * 2 + this.phase[i]);
          const s = this.size[i];
          ctx.globalAlpha = Math.max(0, flick) * a0 * 0.9;
          const spr = (i & 3) === 0 ? glow2 : glow;
          ctx.drawImage(spr, this.x[i] - s * 3, this.y[i] - s * 3, s * 6, s * 6);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case WK.Ash: {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = rgbaStr(look.color, 0.6 * a0);
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const s = this.size[i];
          const c = Math.cos(this.rot[i]) * s, sn = Math.sin(this.rot[i]) * s * 0.55;
          const x = this.x[i], y = this.y[i];
          ctx.moveTo(x - c, y - sn);
          ctx.lineTo(x + sn, y - c * 0.4);
          ctx.lineTo(x + c, y + sn);
          ctx.lineTo(x - sn, y + c * 0.4);
          ctx.closePath();
        }
        ctx.fill();
        break;
      }
      case WK.Petals:
      case WK.Leaves: {
        ctx.globalCompositeOperation = 'source-over';
        for (let pass = 0; pass < 2; pass++) {
          ctx.fillStyle = rgbaStr(pass === 0 ? look.color : look.color2, 0.85 * a0);
          ctx.beginPath();
          for (let i = pass; i < n; i += 2) {
            const s = this.size[i];
            const flip = Math.cos(time * 3 + this.phase[i] * 2);
            const ang = this.rot[i];
            const ca = Math.cos(ang), sa = Math.sin(ang);
            const lx = s * 1.6, ly = s * 0.7 * flip;
            const x = this.x[i], y = this.y[i];
            // tip-to-tip leaf with two curved sides
            const tx = ca * lx, ty = sa * lx;
            const nx = -sa * ly, ny = ca * ly;
            ctx.moveTo(x - tx, y - ty);
            ctx.quadraticCurveTo(x + nx, y + ny, x + tx, y + ty);
            ctx.quadraticCurveTo(x - nx, y - ny, x - tx, y - ty);
          }
          ctx.fill();
        }
        break;
      }
      case WK.Sparkles: {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgbaStr(look.color, 0.9 * a0);
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const tw = Math.pow(Math.max(0, Math.sin(time * 2.4 + this.phase[i] * 5)), 4);
          if (tw < 0.05) continue;
          const s = this.size[i] * tw;
          const x = this.x[i], y = this.y[i];
          const q = s * 0.18;
          ctx.moveTo(x, y - s);
          ctx.lineTo(x + q, y - q);
          ctx.lineTo(x + s, y);
          ctx.lineTo(x + q, y + q);
          ctx.lineTo(x, y + s);
          ctx.lineTo(x - q, y + q);
          ctx.lineTo(x - s, y);
          ctx.lineTo(x - q, y - q);
          ctx.closePath();
        }
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
    }
  }
}

/* ======================================================== FX PARTICLES ==== */

export enum FxKind { Spark, Blob, Shard, Mote, Dust, Splash, Ring, Ember }

interface FxParticle {
  active: boolean;
  kind: FxKind;
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  size: number; grow: number;
  color: string; color2: string;
  rot: number; rotV: number;
  gravity: number; drag: number;
  /** Attractor (void motes). */
  ax: number; ay: number; pull: number;
  ground: boolean;
}

export class FxSystem {
  private pool: FxParticle[] = [];
  private cursor = 0;
  constructor(private max = 700, public halfWidth = 1300) {
    for (let i = 0; i < max; i++) {
      this.pool.push({ active: false, kind: FxKind.Spark, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, grow: 0, color: '#ffffff', color2: '#ffffff', rot: 0, rotV: 0, gravity: 0, drag: 0, ax: 0, ay: 0, pull: 0, ground: false });
    }
  }

  spawn(kind: FxKind, x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, opts: Partial<Pick<FxParticle, 'gravity' | 'drag' | 'grow' | 'rotV' | 'color2' | 'ax' | 'ay' | 'pull' | 'ground'>> = {}): void {
    // Ring-buffer allocation: overwrite the oldest when full.
    let p: FxParticle | null = null;
    for (let k = 0; k < this.max; k++) {
      const c = this.pool[(this.cursor + k) % this.max];
      if (!c.active) { p = c; this.cursor = (this.cursor + k + 1) % this.max; break; }
    }
    if (!p) { p = this.pool[this.cursor]; this.cursor = (this.cursor + 1) % this.max; }
    p.active = true; p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.max = life; p.size = size; p.color = color;
    p.color2 = opts.color2 ?? color; p.gravity = opts.gravity ?? 0; p.drag = opts.drag ?? 0;
    p.grow = opts.grow ?? 0; p.rot = Math.random() * Math.PI * 2; p.rotV = opts.rotV ?? 0;
    p.ax = opts.ax ?? 0; p.ay = opts.ay ?? 0; p.pull = opts.pull ?? 0; p.ground = opts.ground ?? false;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      if (p.pull > 0) {
        const dx = p.ax - p.x, dy = p.ay - p.y;
        const d = Math.hypot(dx, dy) + 1;
        p.vx += (dx / d) * p.pull * dt;
        p.vy += (dy / d) * p.pull * dt;
        if (d < 10) { p.active = false; continue; }
      }
      p.vy += p.gravity * dt;
      if (p.drag > 0) {
        const f = Math.exp(-p.drag * dt);
        p.vx *= f; p.vy *= f;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.rotV * dt;
      p.size += p.grow * dt;
      if (p.ground && p.y > 0) {
        p.y = 0;
        p.vy *= -0.3;
        p.vx *= 0.6;
        if (Math.abs(p.vy) < 40) p.vy = 0;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // Normal-blend kinds first (dust, shards), then additive.
    for (const p of this.pool) {
      if (!p.active) continue;
      const f = p.life / p.max;
      if (p.kind === FxKind.Dust) {
        const spr = blobSprite(p.color);
        ctx.globalAlpha = Math.min(1, f * 1.6) * 0.55;
        const s = p.size;
        ctx.drawImage(spr, p.x - s, p.y - s, s * 2, s * 2);
      } else if (p.kind === FxKind.Shard) {
        ctx.globalAlpha = Math.min(1, f * 3);
        const s = p.size;
        const c = Math.cos(p.rot), sn = Math.sin(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x + c * s * 1.4, p.y + sn * s * 1.4);
        ctx.lineTo(p.x - sn * s * 0.5, p.y + c * s * 0.5);
        ctx.lineTo(p.x - c * s * 0.9, p.y - sn * s * 0.9);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = rgbaStr(p.color2, 0.8 * Math.min(1, f * 3));
        ctx.lineWidth = Math.max(0.6, s * 0.15);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pool) {
      if (!p.active) continue;
      const f = p.life / p.max;
      switch (p.kind) {
        case FxKind.Spark: {
          ctx.strokeStyle = rgbaStr(p.color, Math.min(1, f * 2));
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
          ctx.stroke();
          break;
        }
        case FxKind.Blob:
        case FxKind.Mote:
        case FxKind.Ember: {
          const spr = glowSprite(f > 0.5 || p.kind !== FxKind.Blob ? p.color : p.color2);
          const s = p.size * (p.kind === FxKind.Blob ? 2.6 : 3.2);
          ctx.globalAlpha = Math.min(1, f * 2.2) * (p.kind === FxKind.Mote ? 0.9 : 1);
          ctx.drawImage(spr, p.x - s, p.y - s, s * 2, s * 2);
          ctx.globalAlpha = 1;
          break;
        }
        case FxKind.Splash: {
          ctx.strokeStyle = rgbaStr(p.color, 0.5 * f);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size * (1.6 - f), p.size * 0.3 * (1.6 - f), 0, Math.PI, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case FxKind.Ring: {
          ctx.strokeStyle = rgbaStr(p.color, 0.9 * f);
          ctx.lineWidth = Math.max(1, p.size * 0.08 * f + 1);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size, p.size * 0.28, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        default:
          break;
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
  }
}

/* ============================================================ DEBRIS ==== */

interface Chunk {
  active: boolean;
  x: number; y: number; vx: number; vy: number;
  ang: number; angV: number;
  size: number;
  shape: number[];
  color: string;
  edge: string;
  life: number;
  resting: boolean;
}

export class DebrisSystem {
  private chunks: Chunk[] = [];
  private cursor = 0;
  constructor(private max = 240, public halfWidth = 1300) {
    for (let i = 0; i < max; i++) {
      this.chunks.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, ang: 0, angV: 0, size: 4, shape: chunkShape(Math.random, 5), color: '#444', edge: '#888', life: 0, resting: false });
    }
  }

  spawn(x: number, y: number, vx: number, vy: number, size: number, color: string, edge: string, life = 9 + Math.random() * 4): void {
    let c: Chunk | null = null;
    for (let k = 0; k < this.max; k++) {
      const cand = this.chunks[(this.cursor + k) % this.max];
      if (!cand.active) { c = cand; this.cursor = (this.cursor + k + 1) % this.max; break; }
    }
    if (!c) { c = this.chunks[this.cursor]; this.cursor = (this.cursor + 1) % this.max; }
    c.active = true; c.x = x; c.y = y; c.vx = vx; c.vy = vy;
    c.ang = Math.random() * Math.PI * 2; c.angV = (Math.random() * 2 - 1) * 14;
    c.size = size; c.color = color; c.edge = edge; c.life = life; c.resting = false;
    c.shape = chunkShape(Math.random, 4 + ((Math.random() * 3) | 0));
  }

  update(dt: number): void {
    const hw = this.halfWidth;
    for (const c of this.chunks) {
      if (!c.active) continue;
      c.life -= dt;
      if (c.life <= 0) { c.active = false; continue; }
      if (c.resting) continue;
      c.vy += 2100 * dt;
      c.vx *= Math.exp(-0.25 * dt);
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.ang += c.angV * dt;
      const floor = -c.size * 0.55;
      if (c.y > floor) {
        c.y = floor;
        if (c.vy > 0) c.vy = -c.vy * 0.32;
        c.vx *= 0.62;
        c.angV *= 0.55;
        if (Math.abs(c.vy) < 55 && Math.abs(c.vx) < 20) {
          c.vy = 0; c.vx = 0; c.angV = 0; c.resting = true;
        }
      }
      if (c.x < -hw + c.size) { c.x = -hw + c.size; c.vx = Math.abs(c.vx) * 0.4; }
      else if (c.x > hw - c.size) { c.x = hw - c.size; c.vx = -Math.abs(c.vx) * 0.4; }
    }
  }

  draw(ctx: CanvasRenderingContext2D, darkenAmt: number): void {
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineJoin = 'round';
    for (const c of this.chunks) {
      if (!c.active) continue;
      const fade = Math.min(1, c.life / 1.5);
      ctx.globalAlpha = fade;
      const cs = Math.cos(c.ang) * c.size, sn = Math.sin(c.ang) * c.size;
      const sh = c.shape;
      ctx.beginPath();
      for (let i = 0; i < sh.length; i += 2) {
        const px = c.x + sh[i] * cs - sh[i + 1] * sn;
        const py = c.y + sh[i] * sn + sh[i + 1] * cs;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = darkenAmt > 0 ? mix(c.color, '#000000', darkenAmt * 0.6) : c.color;
      ctx.fill();
      ctx.strokeStyle = c.edge;
      ctx.lineWidth = Math.max(0.8, c.size * 0.12);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    for (const c of this.chunks) c.active = false;
  }
}
