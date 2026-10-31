import { COLORS, blit, glowSprite, hotSprite, rgbaQ, softSprite } from './sprites';

/**
 * Pooled particle system (struct-of-arrays, zero allocation in update/draw).
 * Particles never touch the simulation; they are pure presentation.
 */

export const PK = {
  SPARK: 0, // velocity-aligned streak (additive)
  EMBER: 1, // glowing dot, drifts (additive)
  SMOKE: 2, // soft dark puff (normal)
  DUST: 3, // ground puff (normal)
  DEBRIS: 4, // rotating chunk, bounces (normal)
  SHARD: 5, // glass / ice triangle (normal)
  MOTE: 6, // energy mote, can home (additive)
  RING: 7, // expanding stroke (additive)
  FLASH: 8, // very short radial flash (additive)
  STREAK: 9, // speed-line segment (additive)
  GLYPH: 10, // clock hands / gears / runes (additive)
  PETAL: 11, // petal / leaf (normal)
  FLAME: 12, // flame tongue (additive)
  FLAKE: 13, // ash flake (normal)
  WISP: 14, // dark smoky wisp streak (normal)
} as const;

export const LAYER = { BACK: 0, FRONT: 1 } as const;

/** Particle flag bits. */
export const PF = {
  BOUNCE: 1,
  FADE_IN: 2,
  HOMING: 4,
  FLUTTER: 8,
  WHITE_CORE: 16,
  GROW: 32,
} as const;

const ADDITIVE = new Uint8Array(16);
ADDITIVE[PK.SPARK] = 1;
ADDITIVE[PK.EMBER] = 1;
ADDITIVE[PK.MOTE] = 1;
ADDITIVE[PK.RING] = 1;
ADDITIVE[PK.FLASH] = 1;
ADDITIVE[PK.STREAK] = 1;
ADDITIVE[PK.GLYPH] = 1;
ADDITIVE[PK.FLAME] = 1;

/** A few rock / chunk silhouettes (unit-sized polygons). */
const SHAPES: number[][] = [
  [-1, -0.6, 0.2, -1, 1, -0.2, 0.6, 0.8, -0.7, 0.7],
  [-0.9, -0.9, 0.9, -0.5, 0.6, 0.9, -0.8, 0.5],
  [-1, 0, -0.2, -1, 1, -0.4, 0.7, 0.9, -0.4, 0.8],
  [-0.8, -0.8, 1, -0.9, 0.4, 1],
  [-1, -0.3, -0.3, -1, 0.8, -0.7, 1, 0.4, 0.1, 1, -0.8, 0.6],
  [-0.6, -1, 0.7, -0.6, 0.9, 0.6, -0.9, 0.9],
];

export class ParticleSystem {
  readonly cap: number;
  count = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly life: Float32Array;
  readonly max: Float32Array;
  readonly size: Float32Array;
  readonly size2: Float32Array;
  readonly rot: Float32Array;
  readonly vrot: Float32Array;
  readonly drag: Float32Array;
  readonly grav: Float32Array;
  readonly alpha: Float32Array;
  readonly len: Float32Array;
  readonly hx: Float32Array;
  readonly hy: Float32Array;
  readonly homing: Float32Array;
  readonly delay: Float32Array;
  readonly seed: Float32Array;
  readonly kind: Uint8Array;
  readonly layer: Uint8Array;
  readonly flags: Uint8Array;
  readonly shape: Uint8Array;
  readonly color: Uint16Array;
  readonly color2: Uint16Array;
  private time = 0;

  constructor(cap = 6000) {
    this.cap = cap;
    const F = () => new Float32Array(cap);
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.life = F(); this.max = F();
    this.size = F(); this.size2 = F(); this.rot = F(); this.vrot = F(); this.drag = F(); this.grav = F();
    this.alpha = F(); this.len = F(); this.hx = F(); this.hy = F(); this.homing = F(); this.delay = F(); this.seed = F();
    this.kind = new Uint8Array(cap);
    this.layer = new Uint8Array(cap);
    this.flags = new Uint8Array(cap);
    this.shape = new Uint8Array(cap);
    this.color = new Uint16Array(cap);
    this.color2 = new Uint16Array(cap);
  }

  clear(): void {
    this.count = 0;
  }

  /**
   * Spawn a particle and return its index (fields beyond these can be set on the arrays).
   * When full, the oldest-indexed slot is recycled (index 0 region), keeping the newest effects.
   */
  emit(kind: number, layer: number, x: number, y: number, vx: number, vy: number, life: number, size: number, colorHex: string, alpha = 1): number {
    let i: number;
    if (this.count < this.cap) i = this.count++;
    else i = (Math.random() * this.cap) | 0; // recycle a random slot under extreme load
    this.kind[i] = kind;
    this.layer[i] = layer;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.size2[i] = size;
    this.rot[i] = 0;
    this.vrot[i] = 0;
    this.drag[i] = 0;
    this.grav[i] = 0;
    this.alpha[i] = alpha;
    this.len[i] = 0.02;
    this.hx[i] = 0;
    this.hy[i] = 0;
    this.homing[i] = 0;
    this.delay[i] = 0;
    this.seed[i] = Math.random() * 1000;
    this.flags[i] = 0;
    this.shape[i] = (Math.random() * SHAPES.length) | 0;
    const c = COLORS.index(colorHex);
    this.color[i] = c;
    this.color2[i] = c;
    return i;
  }

  setColor2(i: number, hex: string): void {
    this.color2[i] = COLORS.index(hex);
  }

  private remove(i: number): void {
    const j = --this.count;
    if (i === j) return;
    this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j];
    this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.size[i] = this.size[j]; this.size2[i] = this.size2[j];
    this.rot[i] = this.rot[j]; this.vrot[i] = this.vrot[j]; this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j];
    this.alpha[i] = this.alpha[j]; this.len[i] = this.len[j]; this.hx[i] = this.hx[j]; this.hy[i] = this.hy[j];
    this.homing[i] = this.homing[j]; this.delay[i] = this.delay[j]; this.seed[i] = this.seed[j];
    this.kind[i] = this.kind[j]; this.layer[i] = this.layer[j]; this.flags[i] = this.flags[j]; this.shape[i] = this.shape[j];
    this.color[i] = this.color[j]; this.color2[i] = this.color2[j];
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this.time += dt;
    const t = this.time;
    for (let i = 0; i < this.count; i++) {
      if (this.delay[i] > 0) {
        this.delay[i] -= dt;
        continue;
      }
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.remove(i);
        i--;
        continue;
      }
      const f = this.flags[i];
      if (this.drag[i] > 0) {
        const k = Math.exp(-this.drag[i] * dt);
        this.vx[i] *= k;
        this.vy[i] *= k;
      }
      this.vy[i] += this.grav[i] * dt;
      if (f & PF.HOMING) {
        const dx = this.hx[i] - this.x[i], dy = this.hy[i] - this.y[i];
        const d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
        const h = this.homing[i];
        this.vx[i] += (dx / d) * h * dt;
        this.vy[i] += (dy / d) * h * dt;
        if (d < 14 && this.life[i] > 0.05) this.life[i] = Math.min(this.life[i], 0.05);
      }
      if (f & PF.FLUTTER) {
        this.vx[i] += Math.sin(t * 5 + this.seed[i]) * 220 * dt;
      }
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.vrot[i] * dt;
      if (f & PF.BOUNCE && this.y[i] > 0) {
        this.y[i] = 0;
        if (this.vy[i] > 0) {
          this.vy[i] = this.vy[i] > 90 ? -this.vy[i] * 0.33 : 0;
          this.vx[i] *= 0.62;
          this.vrot[i] *= 0.6;
          if (this.vy[i] === 0) {
            this.grav[i] = 0;
            this.vx[i] *= 0.5;
          }
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, layer: number): void {
    if (this.count === 0) return;
    // Normal-blend pass.
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < this.count; i++) {
      if (this.layer[i] !== layer || this.delay[i] > 0 || ADDITIVE[this.kind[i]]) continue;
      this.drawOne(ctx, i);
    }
    // Additive pass.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.count; i++) {
      if (this.layer[i] !== layer || this.delay[i] > 0 || !ADDITIVE[this.kind[i]]) continue;
      this.drawOne(ctx, i);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  private drawOne(ctx: CanvasRenderingContext2D, i: number): void {
    const k = this.kind[i];
    const t = this.life[i] / this.max[i]; // 1 → 0
    const age = 1 - t;
    let a = this.alpha[i];
    if (this.flags[i] & PF.FADE_IN) a *= Math.min(1, age * 7);
    const x = this.x[i], y = this.y[i];
    const hex = COLORS.hex[this.color[i]];
    switch (k) {
      case PK.SPARK: {
        const l = this.len[i];
        const w = this.size[i] * (0.35 + 0.65 * t);
        ctx.globalAlpha = a * Math.min(1, t * 2.2);
        ctx.strokeStyle = hex;
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - this.vx[i] * l, y - this.vy[i] * l);
        ctx.lineTo(x, y);
        ctx.stroke();
        if (this.flags[i] & PF.WHITE_CORE && w > 1.6) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = w * 0.4;
          ctx.stroke();
        }
        break;
      }
      case PK.STREAK: {
        const sp = Math.sqrt(this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i]) + 1e-3;
        const l = this.len[i];
        const fade = Math.min(1, age * 6) * t;
        ctx.globalAlpha = a * fade;
        ctx.strokeStyle = hex;
        ctx.lineWidth = this.size[i];
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - (this.vx[i] / sp) * l, y - (this.vy[i] / sp) * l);
        ctx.lineTo(x, y);
        ctx.stroke();
        break;
      }
      case PK.EMBER:
      case PK.MOTE: {
        ctx.globalAlpha = a * (k === PK.EMBER ? Math.min(1, t * 1.6) : Math.min(1, t * 3));
        const r = this.size[i] * (k === PK.EMBER ? 0.55 + 0.45 * t : 1);
        blit(ctx, glowSprite(hex), x, y, r * 2.2);
        if (r > 2) {
          ctx.globalAlpha *= 0.9;
          blit(ctx, hotSprite(hex), x, y, r * 0.9);
        }
        break;
      }
      case PK.FLAME: {
        ctx.globalAlpha = a * Math.min(1, t * 2);
        const r = this.size[i] * (0.4 + 0.6 * t);
        blit(ctx, glowSprite(hex), x, y, r * 2);
        if (r * t > 5) blit(ctx, hotSprite(COLORS.hex[this.color2[i]]), x, y, r * 0.9 * t);
        break;
      }
      case PK.FLASH: {
        const r = this.size[i] + (this.size2[i] - this.size[i]) * (1 - t * t);
        ctx.globalAlpha = a * Math.sqrt(t);
        blit(ctx, hotSprite(hex), x, y, r);
        break;
      }
      case PK.RING: {
        const e = 1 - Math.pow(t, 2.4); // ease-out expansion
        const r = this.size[i] + (this.size2[i] - this.size[i]) * e;
        ctx.globalAlpha = a * t;
        ctx.strokeStyle = hex;
        ctx.lineWidth = Math.max(0.5, this.len[i] * t);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
        ctx.stroke();
        if (this.flags[i] & PF.WHITE_CORE) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(0.5, this.len[i] * t * 0.35);
          ctx.stroke();
        }
        break;
      }
      case PK.GLYPH: {
        ctx.globalAlpha = a * Math.min(1, t * 2) * Math.min(1, age * 5);
        ctx.strokeStyle = hex;
        ctx.lineWidth = Math.max(1, this.size[i] * 0.16);
        drawGlyph(ctx, this.shape[i] % 4, x, y, this.size[i], this.rot[i]);
        break;
      }
      case PK.SMOKE:
      case PK.DUST: {
        const r = this.size[i] + (this.size2[i] - this.size[i]) * (1 - t * t);
        ctx.globalAlpha = a * t * Math.min(1, age * 8);
        blit(ctx, softSprite(hex), x, y, r);
        break;
      }
      case PK.WISP: {
        ctx.globalAlpha = a * t * Math.min(1, age * 5);
        ctx.strokeStyle = hex;
        ctx.lineWidth = this.size[i] * t;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        const s = this.seed[i];
        ctx.quadraticCurveTo(x + Math.sin(s + age * 6) * 14, y + 18, x - this.vx[i] * 0.06, y - this.vy[i] * 0.09 + 26);
        ctx.stroke();
        break;
      }
      case PK.DEBRIS: {
        ctx.globalAlpha = a * Math.min(1, t * 4);
        const s = this.size[i];
        const sh = SHAPES[this.shape[i]];
        const c = Math.cos(this.rot[i]), sn = Math.sin(this.rot[i]);
        ctx.fillStyle = hex;
        ctx.beginPath();
        for (let v = 0; v < sh.length; v += 2) {
          const px = sh[v] * s, py = sh[v + 1] * s;
          const wx = x + px * c - py * sn, wy = y + px * sn + py * c;
          if (v === 0) ctx.moveTo(wx, wy);
          else ctx.lineTo(wx, wy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = COLORS.hex[this.color2[i]];
        ctx.lineWidth = Math.max(0.6, s * 0.14);
        ctx.stroke();
        break;
      }
      case PK.SHARD: {
        ctx.globalAlpha = a * Math.min(1, t * 3);
        const s = this.size[i];
        const c = Math.cos(this.rot[i]), sn = Math.sin(this.rot[i]);
        const flip = 0.35 + 0.65 * Math.abs(Math.sin(this.rot[i] * 1.7 + this.seed[i]));
        ctx.fillStyle = rgbaQ(hex, 0.55);
        ctx.beginPath();
        ctx.moveTo(x + c * s * 1.4, y + sn * s * 1.4);
        ctx.lineTo(x - sn * s * 0.5 * flip - c * s * 0.6, y + c * s * 0.5 * flip - sn * s * 0.6);
        ctx.lineTo(x + sn * s * 0.5 * flip - c * s * 0.6, y - c * s * 0.5 * flip - sn * s * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(0.7, s * 0.12);
        ctx.stroke();
        break;
      }
      case PK.PETAL:
      case PK.FLAKE: {
        ctx.globalAlpha = a * Math.min(1, t * 3);
        const s = this.size[i];
        const flip = Math.abs(Math.sin(this.rot[i] * 2.3 + this.seed[i])) * 0.8 + 0.2;
        ctx.fillStyle = hex;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.rot[i]);
        ctx.scale(1, flip);
        ctx.beginPath();
        if (k === PK.PETAL) {
          ctx.moveTo(-s, 0);
          ctx.quadraticCurveTo(0, -s * 0.8, s, 0);
          ctx.quadraticCurveTo(0, s * 0.8, -s, 0);
        } else {
          ctx.rect(-s * 0.7, -s * 0.5, s * 1.4, s);
        }
        ctx.fill();
        ctx.restore();
        break;
      }
      default:
        break;
    }
  }
}

/** Tiny vector glyphs: 0 clock, 1 gear, 2 rune, 3 cross/plus. */
export function drawGlyph(ctx: CanvasRenderingContext2D, which: number, x: number, y: number, s: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  switch (which) {
    case 0: // clock face + hands
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -s * 0.75);
      ctx.moveTo(0, 0);
      ctx.lineTo(s * 0.5, s * 0.15);
      break;
    case 1: {
      // gear
      const teeth = 8;
      for (let i = 0; i < teeth; i++) {
        const a0 = (i / teeth) * Math.PI * 2;
        const a1 = a0 + (Math.PI * 2) / teeth / 2;
        ctx.moveTo(Math.cos(a0) * s * 0.75, Math.sin(a0) * s * 0.75);
        ctx.lineTo(Math.cos(a0) * s, Math.sin(a0) * s);
        ctx.lineTo(Math.cos(a1) * s, Math.sin(a1) * s);
        ctx.lineTo(Math.cos(a1) * s * 0.75, Math.sin(a1) * s * 0.75);
      }
      ctx.moveTo(s * 0.32, 0);
      ctx.arc(0, 0, s * 0.32, 0, Math.PI * 2);
      break;
    }
    case 2: // rune
      ctx.moveTo(-s * 0.5, -s);
      ctx.lineTo(0, s);
      ctx.lineTo(s * 0.5, -s);
      ctx.moveTo(-s * 0.7, -s * 0.1);
      ctx.lineTo(s * 0.7, -s * 0.1);
      break;
    default: // plus
      ctx.moveTo(-s, 0);
      ctx.lineTo(s, 0);
      ctx.moveTo(0, -s);
      ctx.lineTo(0, s);
      break;
  }
  ctx.stroke();
  ctx.restore();
}
