import { blit, glowSprite, hotSprite, lighten, darken, rgbaQ, ringSprite } from './sprites';
import { drawGlyph, LAYER, PF, PK, type ParticleSystem } from './particles';

/**
 * Timed shape effects that are not particles: impact stars, slash wipes, lightning, shield
 * arcs, explosion spheres, manga focus lines and the big finisher set pieces.
 */

export const FX = {
  STAR: 1,
  SLASH: 2,
  LIGHTNING: 3,
  ARC: 4,
  PARRY: 5,
  SPHERE: 6,
  SHAFT: 7,
  FOCUS: 8,
  TSPULSE: 9,
  REWIND: 10,
  PILLAR: 11,
  SINGULARITY: 12,
  THORNS: 13,
  PYRE: 14,
  FREEZE: 15,
  BLADES: 16,
  FINBEAM: 17,
  METEOR: 18,
  CRACKS: 19,
  DAMAGE: 20,
  CLASHCORE: 21,
  AURAFLARE: 22,
} as const;

/** Effect layers. */
export const FL = { BACK: 0, MID: 1, FRONT: 2, SCREEN: 3 } as const;

export class Fx {
  kind = 0;
  active = false;
  layer: number = FL.FRONT;
  x = 0;
  y = 0;
  x2 = 0;
  y2 = 0;
  a = 0;
  b = 0;
  c = 0;
  d = 0;
  t = 0;
  life = 1;
  color = '#ffffff';
  color2 = '#ffffff';
  n = 0;
  flag = 0;
  seed = 0;
  frame = 0;
  done = false;
  pts: number[] = [];
}

const TAU = Math.PI * 2;

export class FxPool {
  readonly list: Fx[] = [];
  private free: Fx[] = [];

  spawn(kind: number, layer: number, x: number, y: number, life: number, color: string): Fx {
    const f = this.free.pop() ?? new Fx();
    f.kind = kind;
    f.layer = layer;
    f.active = true;
    f.x = x;
    f.y = y;
    f.x2 = x;
    f.y2 = y;
    f.a = f.b = f.c = f.d = 0;
    f.t = 0;
    f.life = life;
    f.color = color;
    f.color2 = color;
    f.n = 0;
    f.flag = 0;
    f.seed = Math.random() * 1000;
    f.frame = 0;
    f.done = false;
    f.pts.length = 0;
    this.list.push(f);
    return f;
  }

  clear(): void {
    for (const f of this.list) this.free.push(f);
    this.list.length = 0;
  }

  update(dt: number, ps: ParticleSystem): void {
    if (dt <= 0) return;
    for (let i = 0; i < this.list.length; i++) {
      const f = this.list[i];
      f.t += dt;
      f.frame++;
      tickFx(f, dt, ps);
      if (f.t >= f.life) {
        endFx(f, ps);
        this.free.push(f);
        this.list[i] = this.list[this.list.length - 1];
        this.list.length--;
        i--;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, layer: number, w = 0, h = 0, viewTop = -1400): void {
    for (const f of this.list) {
      if (f.layer !== layer) continue;
      drawFx(ctx, f, w, h, viewTop);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

/* ======================================================================== */
/* Per-frame behaviour (particle emission)                                  */
/* ======================================================================== */

function tickFx(f: Fx, dt: number, ps: ParticleSystem): void {
  switch (f.kind) {
    case FX.LIGHTNING:
      if (f.frame % 2 === 1) buildBolt(f);
      break;
    case FX.PILLAR: {
      if (f.t < f.life - 0.25 && Math.random() < dt * 40) {
        const i = ps.emit(PK.MOTE, LAYER.FRONT, f.x + (Math.random() - 0.5) * 140, -Math.random() * 40, (Math.random() - 0.5) * 60, -300 - Math.random() * 500, 0.6 + Math.random() * 0.5, 2 + Math.random() * 3, Math.random() < 0.5 ? '#ffffff' : f.color);
        ps.drag[i] = 1;
      }
      break;
    }
    case FX.SINGULARITY: {
      if (f.t < f.life - 0.2) {
        const rate = dt * 70;
        for (let k = 0; k < rate || Math.random() < rate - k; k++) {
          if (k > 6) break;
          const ang = Math.random() * TAU;
          const rr = 220 + Math.random() * 260;
          const px = f.x + Math.cos(ang) * rr, py = f.y + Math.sin(ang) * rr * 0.7;
          const tang = ang + Math.PI / 2;
          const i = ps.emit(Math.random() < 0.25 ? PK.DEBRIS : PK.MOTE, LAYER.FRONT, px, py, Math.cos(tang) * 260, Math.sin(tang) * 200, 0.9, Math.random() < 0.25 ? 4 + Math.random() * 5 : 2 + Math.random() * 2.5, Math.random() < 0.25 ? '#2a1d33' : f.color);
          ps.flags[i] |= PF.HOMING;
          ps.hx[i] = f.x;
          ps.hy[i] = f.y;
          ps.homing[i] = 1500;
          ps.vrot[i] = (Math.random() - 0.5) * 10;
          ps.setColor2(i, lighten(f.color, 0.4));
        }
      }
      break;
    }
    case FX.PYRE: {
      if (f.t < f.life - 0.3) {
        const n = Math.ceil(dt * 120);
        for (let k = 0; k < n; k++) {
          const i = ps.emit(PK.FLAME, LAYER.FRONT, f.x + (Math.random() - 0.5) * 120 * (1 - Math.random() * 0.5), -Math.random() * 30, (Math.random() - 0.5) * 80, -500 - Math.random() * 700, 0.45 + Math.random() * 0.45, 14 + Math.random() * 22, Math.random() < 0.5 ? f.color : f.color2);
          ps.setColor2(i, '#fff3c4');
          ps.drag[i] = 1.2;
        }
        if (Math.random() < dt * 14) {
          const i = ps.emit(PK.SMOKE, LAYER.BACK, f.x + (Math.random() - 0.5) * 120, -380 - Math.random() * 200, (Math.random() - 0.5) * 40, -120, 1.4, 40, '#1d1414', 0.45);
          ps.size2[i] = 120;
        }
        if (Math.random() < dt * 40) ps.emit(PK.EMBER, LAYER.FRONT, f.x + (Math.random() - 0.5) * 200, -Math.random() * 300, (Math.random() - 0.5) * 200, -200 - Math.random() * 300, 1 + Math.random(), 2 + Math.random() * 2, '#ffb347');
      }
      break;
    }
    case FX.METEOR: {
      const T = f.a;
      if (f.t < T) {
        const k = Math.min(1, f.t / T);
        const e = k * k;
        const mx = f.x2 + (f.x - f.x2) * e, my = f.y2 + (f.y - f.y2) * e;
        for (let j = 0; j < 3; j++) {
          const i = ps.emit(PK.FLAME, LAYER.FRONT, mx + (Math.random() - 0.5) * 50, my + (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 0.35 + Math.random() * 0.3, 26 + Math.random() * 24, Math.random() < 0.5 ? f.color : '#ff7a2a');
          ps.setColor2(i, '#fff1c1');
        }
      } else if (!f.done) {
        f.done = true;
        impactBurst(ps, f.x, f.y, 1.4, f.color);
      }
      break;
    }
    case FX.BLADES: {
      // b = converge start time (−1 = hovering)
      if (f.b >= 0 && !f.done && f.t - f.b > 0.16) {
        f.done = true;
        impactBurst(ps, f.x, f.y, 0.9, f.color);
      }
      break;
    }
    case FX.FINBEAM: {
      if (f.t < f.life - 0.2) {
        const n = Math.ceil(dt * 90);
        for (let k = 0; k < n; k++) {
          const along = Math.random() * 1600;
          const i = ps.emit(PK.SPARK, LAYER.FRONT, f.x + f.a * along, f.y + (Math.random() - 0.5) * 120, f.a * (400 + Math.random() * 900), (Math.random() - 0.5) * 500, 0.2 + Math.random() * 0.2, 2 + Math.random() * 2, Math.random() < 0.4 ? '#ffffff' : f.color);
          ps.len[i] = 0.03;
        }
      }
      break;
    }
    case FX.THORNS: {
      if (f.frame === 2) {
        for (let k = 0; k < 26; k++) {
          const i = ps.emit(PK.PETAL, LAYER.FRONT, f.x + (Math.random() - 0.5) * 220, -Math.random() * 320, (Math.random() - 0.5) * 400, -200 - Math.random() * 400, 1.4 + Math.random(), 5 + Math.random() * 4, Math.random() < 0.6 ? f.color : '#ff9ccf');
          ps.grav[i] = 260;
          ps.vrot[i] = (Math.random() - 0.5) * 10;
          ps.flags[i] |= PF.FLUTTER;
          ps.drag[i] = 1.2;
        }
        for (let k = 0; k < 14; k++) ps.emit(PK.DEBRIS, LAYER.FRONT, f.x + (Math.random() - 0.5) * 160, -6, (Math.random() - 0.5) * 500, -300 - Math.random() * 500, 1.4, 4 + Math.random() * 6, '#2b2219');
      }
      break;
    }
    case FX.FREEZE: {
      if (Math.random() < dt * 30) {
        const i = ps.emit(PK.DUST, LAYER.FRONT, f.x + (Math.random() - 0.5) * 120, f.y + (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 30, -20, 0.9, 16, '#cdefff', 0.35);
        ps.size2[i] = 46;
      }
      break;
    }
    default:
      break;
  }
}

function endFx(f: Fx, ps: ParticleSystem): void {
  if (f.kind === FX.SINGULARITY) {
    // Collapse: implosion flash then outward ring.
    const i = ps.emit(PK.FLASH, LAYER.FRONT, f.x, f.y, 0, 0, 0.22, 60, '#ffffff');
    ps.size2[i] = 420;
    const r = ps.emit(PK.RING, LAYER.FRONT, f.x, f.y, 0, 0, 0.5, 30, f.color);
    ps.size2[r] = 520;
    ps.len[r] = 18;
    ps.flags[r] |= PF.WHITE_CORE;
  }
}

/** Generic heavy impact used by set pieces (flash, rings, sparks, debris, dust). */
export function impactBurst(ps: ParticleSystem, x: number, y: number, power: number, color: string): void {
  let i = ps.emit(PK.FLASH, LAYER.FRONT, x, y, 0, 0, 0.16, 40 * power, '#ffffff');
  ps.size2[i] = 260 * power;
  i = ps.emit(PK.RING, LAYER.FRONT, x, y, 0, 0, 0.45, 20 * power, color);
  ps.size2[i] = 360 * power;
  ps.len[i] = 16 * power;
  ps.flags[i] |= PF.WHITE_CORE;
  for (let k = 0; k < 26 * power; k++) {
    const a = Math.random() * TAU;
    const sp = (500 + Math.random() * 1300) * power;
    const j = ps.emit(PK.SPARK, LAYER.FRONT, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 200, 0.25 + Math.random() * 0.35, 2 + Math.random() * 3, Math.random() < 0.4 ? '#ffffff' : color);
    ps.grav[j] = 1200;
    ps.drag[j] = 2;
    ps.len[j] = 0.035;
  }
  if (y > -160) {
    for (let k = 0; k < 14 * power; k++) {
      const j = ps.emit(PK.DEBRIS, LAYER.FRONT, x + (Math.random() - 0.5) * 60, Math.min(-4, y), (Math.random() - 0.5) * 900 * power, -300 - Math.random() * 900 * power, 1.2 + Math.random() * 0.8, 4 + Math.random() * 7, '#2a2420');
      ps.grav[j] = 2400;
      ps.flags[j] |= PF.BOUNCE;
      ps.vrot[j] = (Math.random() - 0.5) * 16;
      ps.setColor2(j, '#6b5d52');
    }
    for (let k = 0; k < 10 * power; k++) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const j = ps.emit(PK.DUST, LAYER.BACK, x + dir * Math.random() * 60, -14, dir * (200 + Math.random() * 500) * power, -40 - Math.random() * 80, 0.8 + Math.random() * 0.5, 24, '#8d7f72', 0.6);
      ps.size2[j] = 90 * power;
      ps.drag[j] = 2.5;
    }
  }
}

/* ======================================================================== */
/* Geometry builders                                                        */
/* ======================================================================== */

/** Jagged lightning path with branches into f.pts: [n, x0,y0, x1,y1, ... | branches...]. */
export function buildBolt(f: Fx): void {
  const pts = f.pts;
  pts.length = 0;
  const x1 = f.x, y1 = f.y, x2 = f.x2, y2 = f.y2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const segs = Math.max(6, Math.min(18, Math.round(len / 40)));
  const amp = len * 0.08;
  // main
  pts.push(segs + 1);
  const main: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const off = i === 0 || i === segs ? 0 : (Math.random() - 0.5) * 2 * amp * Math.sin(t * Math.PI) ** 0.6;
    const px = x1 + dx * t + nx * off, py = y1 + dy * t + ny * off;
    pts.push(px, py);
    main.push(px, py);
  }
  // branches
  const nb = 1 + ((Math.random() * 3) | 0);
  for (let b = 0; b < nb; b++) {
    const k = 1 + ((Math.random() * (segs - 2)) | 0);
    let bx = main[k * 2], by = main[k * 2 + 1];
    const bl = len * (0.15 + Math.random() * 0.2);
    const ang = Math.atan2(dy, dx) + (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6);
    const bs = 4;
    pts.push(bs + 1, bx, by);
    for (let i = 1; i <= bs; i++) {
      bx += (Math.cos(ang) * bl) / bs + (Math.random() - 0.5) * bl * 0.25;
      by += (Math.sin(ang) * bl) / bs + (Math.random() - 0.5) * bl * 0.25;
      if (f.flag === 1 && by > -2) by = -2;
      pts.push(bx, by);
    }
  }
}

function strokeBolt(ctx: CanvasRenderingContext2D, pts: number[]): void {
  let i = 0;
  let first = true;
  while (i < pts.length) {
    const n = pts[i++];
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const x = pts[i++], y = pts[i++];
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (first) {
      first = false;
      ctx.lineWidth *= 0.55; // branches thinner
    }
  }
}

/** Draws a jagged bolt between two points with glow + white core (used by zones too). */
export function drawBoltNow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number, alpha: number, tmp: Fx): void {
  tmp.x = x1;
  tmp.y = y1;
  tmp.x2 = x2;
  tmp.y2 = y2;
  tmp.flag = y2 >= -1 || y1 >= -1 ? 1 : 0;
  buildBolt(tmp);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha * 0.45;
  ctx.strokeStyle = color;
  ctx.lineWidth = width * 4.5;
  strokeBolt(ctx, tmp.pts);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = lighten(color, 0.55);
  ctx.lineWidth = width * 1.6;
  strokeBolt(ctx, tmp.pts);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = width * 0.7;
  strokeBolt(ctx, tmp.pts);
}

/** Spectral sword silhouette pointing along +x from origin, length L. */
export function swordPath(ctx: CanvasRenderingContext2D, L: number, W: number): void {
  ctx.beginPath();
  ctx.moveTo(L, 0);
  ctx.lineTo(L * 0.18, -W);
  ctx.lineTo(L * 0.1, -W);
  ctx.lineTo(L * 0.1, -W * 2.2);
  ctx.lineTo(L * 0.04, -W * 2.2);
  ctx.lineTo(L * 0.04, -W * 0.5);
  ctx.lineTo(-L * 0.18, -W * 0.5);
  ctx.lineTo(-L * 0.18, W * 0.5);
  ctx.lineTo(L * 0.04, W * 0.5);
  ctx.lineTo(L * 0.04, W * 2.2);
  ctx.lineTo(L * 0.1, W * 2.2);
  ctx.lineTo(L * 0.1, W);
  ctx.lineTo(L * 0.18, W);
  ctx.closePath();
}

/** Simple stick figure (feet at x,y) for ghosts / decoys. phase drives the run cycle. */
export function stickFigure(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, phase: number, running: boolean): void {
  const s = Math.sin(phase), c = Math.cos(phase);
  const hipX = x, hipY = y - 58;
  const lean = running ? 14 * facing : 0;
  const neckX = x + lean, neckY = y - 96;
  ctx.beginPath();
  // torso
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(neckX, neckY);
  // legs
  const stride = running ? 30 : 10;
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(hipX + facing * s * stride * 0.6, hipY + 28);
  ctx.lineTo(hipX + facing * s * stride, y - (s > 0 ? 6 : 0));
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(hipX - facing * s * stride * 0.6, hipY + 28);
  ctx.lineTo(hipX - facing * s * stride, y - (s < 0 ? 6 : 0));
  // arms
  const arm = running ? 26 : 12;
  ctx.moveTo(neckX, neckY + 4);
  ctx.lineTo(neckX - facing * c * arm * 0.6, neckY + 26);
  ctx.lineTo(neckX - facing * c * arm, neckY + 42);
  ctx.moveTo(neckX, neckY + 4);
  ctx.lineTo(neckX + facing * c * arm * 0.6, neckY + 26);
  ctx.lineTo(neckX + facing * c * arm, neckY + 40);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(neckX + facing * 3, neckY - 11, 10, 0, TAU);
  ctx.stroke();
}

/* ======================================================================== */
/* Drawing                                                                  */
/* ======================================================================== */

const tmpFx = new Fx();

function drawFx(ctx: CanvasRenderingContext2D, f: Fx, w: number, h: number, viewTop: number): void {
  const k = f.t / f.life; // 0 → 1
  switch (f.kind) {
    case FX.STAR: {
      // Anime impact star: thick tapered spikes, white core over coloured halo.
      const alpha = 1 - k * k;
      ctx.globalCompositeOperation = 'lighter';
      const pts = f.pts; // [angle, lenFactor]...
      const L = f.a * (0.75 + 0.35 * Math.min(1, k * 3));
      const W = f.b;
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = alpha * (pass === 0 ? 0.55 : 1);
        ctx.fillStyle = pass === 0 ? f.color : '#ffffff';
        const sc = pass === 0 ? 1.25 : 1;
        const ww = pass === 0 ? W * 1.7 : W;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) {
          const a = pts[i] + f.c, l = L * pts[i + 1] * sc;
          const ca = Math.cos(a), sa = Math.sin(a);
          ctx.moveTo(f.x + ca * l, f.y + sa * l);
          ctx.lineTo(f.x - sa * ww + ca * l * 0.08, f.y + ca * ww + sa * l * 0.08);
          ctx.lineTo(f.x + sa * ww + ca * l * 0.08, f.y - ca * ww + sa * l * 0.08);
          ctx.closePath();
        }
        ctx.fill();
      }
      ctx.globalAlpha = alpha;
      blit(ctx, hotSprite(f.color), f.x, f.y, W * 7);
      break;
    }
    case FX.SLASH: {
      // Razor wipe: grow 0.05s, hold, then thin & fade.
      const t = f.t;
      const grow = Math.min(1, t / 0.055);
      const fade = t < 0.14 ? 1 : Math.max(0, 1 - (t - 0.14) / (f.life - 0.14));
      const L = f.a, W = f.b * (t < 0.14 ? 1 : 0.25 + 0.75 * fade);
      const ca = Math.cos(f.c), sa = Math.sin(f.c);
      const sx = f.x - ca * L * 0.5, sy = f.y - sa * L * 0.5;
      const ex = sx + ca * L * grow, ey = sy + sa * L * grow;
      const mx = (sx + ex) / 2, my = (sy + ey) / 2;
      const nx = -sa, ny = ca;
      ctx.globalCompositeOperation = 'lighter';
      const diamond = (ww: number) => {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(mx + nx * ww, my + ny * ww);
        ctx.lineTo(ex, ey);
        ctx.lineTo(mx - nx * ww, my - ny * ww);
        ctx.closePath();
        ctx.fill();
      };
      ctx.globalAlpha = 0.55 * fade;
      ctx.fillStyle = f.color;
      diamond(W * 3.2);
      ctx.globalAlpha = fade;
      ctx.fillStyle = lighten(f.color, 0.6);
      diamond(W * 1.3);
      ctx.fillStyle = '#ffffff';
      diamond(W * 0.55);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx - ca * 20, sy - sa * 20);
      ctx.lineTo(ex + ca * 20, ey + sa * 20);
      ctx.stroke();
      break;
    }
    case FX.LIGHTNING: {
      if (f.pts.length === 0) buildBolt(f);
      const flicker = 0.55 + Math.random() * 0.45;
      const alpha = (1 - k) * flicker;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = alpha * 0.4;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = f.a * 4.5;
      strokeBolt(ctx, f.pts);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = lighten(f.color, 0.5);
      ctx.lineWidth = f.a * 1.6;
      strokeBolt(ctx, f.pts);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = f.a * 0.7;
      strokeBolt(ctx, f.pts);
      break;
    }
    case FX.ARC: {
      // Block: shield arc facing the attacker (angle f.c), radius f.a.
      const alpha = 1 - k;
      const r = f.a * (0.85 + 0.25 * k);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.globalAlpha = alpha * 0.6;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 12 * (1 - k * 0.6);
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, f.c - 1.0, f.c + 1.0);
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3 * (1 - k * 0.6);
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, f.c - 0.8, f.c + 0.8);
      ctx.stroke();
      // hex segments
      ctx.globalAlpha = alpha * 0.35;
      ctx.strokeStyle = lighten(f.color, 0.4);
      ctx.lineWidth = 1.5;
      for (let i = -2; i <= 2; i++) {
        const a = f.c + i * 0.36;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(a) * r * 0.72, f.y + Math.sin(a) * r * 0.72);
        ctx.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r);
        ctx.stroke();
      }
      break;
    }
    case FX.PARRY: {
      // Crisp star flash; perfect = 8 points + rotating.
      const pop = k < 0.2 ? k / 0.2 * 1.25 : 1.25 - (k - 0.2) * 0.4;
      const alpha = 1 - k;
      const n = f.flag ? 8 : 4;
      const L = f.a * pop;
      ctx.globalCompositeOperation = 'lighter';
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = alpha * (pass === 0 ? 0.6 : 1);
        ctx.fillStyle = pass === 0 ? f.color : '#ffffff';
        const ww = (pass === 0 ? 9 : 3.5) * (f.flag ? 1.3 : 1);
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const a = f.c + (i / n) * TAU + k * (f.flag ? 0.8 : 0.3);
          const l = L * (i % 2 === 0 ? 1 : f.flag ? 0.55 : 0.7) * (pass === 0 ? 1.15 : 1);
          const ca = Math.cos(a), sa = Math.sin(a);
          ctx.moveTo(f.x + ca * l, f.y + sa * l);
          ctx.lineTo(f.x - sa * ww, f.y + ca * ww);
          ctx.lineTo(f.x - ca * ww * 1.5, f.y - sa * ww * 1.5);
          ctx.lineTo(f.x + sa * ww, f.y - ca * ww);
          ctx.closePath();
        }
        ctx.fill();
      }
      ctx.globalAlpha = alpha;
      blit(ctx, hotSprite(f.color), f.x, f.y, 30 * pop);
      break;
    }
    case FX.SPHERE: {
      // Explosion fireball: fast expansion, turbulent lobes, fade.
      const R = f.a;
      const e = Math.min(1, f.t / 0.17);
      const r = R * (0.22 + 0.78 * (1 - Math.pow(1 - e, 3)));
      const alpha = f.t < 0.1 ? 1 : Math.max(0, 1 - (f.t - 0.1) / (f.life - 0.1));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, rgbaQ('#ffffff', 1));
      g.addColorStop(0.25, rgbaQ(f.color2, 0.95));
      g.addColorStop(0.6, rgbaQ(f.color, 0.55));
      g.addColorStop(1, rgbaQ(f.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, TAU);
      ctx.fill();
      // Lobes.
      for (let i = 0; i < 4; i++) {
        const a = f.seed + i * 1.57 + f.t * 1.5;
        const d = r * (0.42 + 0.15 * Math.sin(f.seed * 3 + i));
        ctx.globalAlpha = alpha * 0.6;
        blit(ctx, glowSprite(i % 2 ? f.color2 : f.color), f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.85, r * 0.5);
      }
      break;
    }
    case FX.SHAFT: {
      const alpha = Math.min(1, f.t / 0.12) * Math.max(0, 1 - Math.max(0, f.t - f.life * 0.4) / (f.life * 0.6));
      const W = f.a, H = f.b;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.8;
      const g = ctx.createLinearGradient(f.x - W, 0, f.x + W, 0);
      g.addColorStop(0, rgbaQ(f.color, 0));
      g.addColorStop(0.5, rgbaQ('#ffffff', 0.9));
      g.addColorStop(1, rgbaQ(f.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(f.x - W, f.y - H, W * 2, H);
      break;
    }
    case FX.FOCUS: {
      // Screen-space manga focus lines converging on (x, y) px.
      if (f.frame % 2 === 1 || f.pts.length === 0) {
        f.pts.length = 0;
        const n = Math.round(60 + 90 * f.a);
        for (let i = 0; i < n; i++) f.pts.push(Math.random() * TAU, 0.6 + Math.random() * 0.8, Math.random());
      }
      const fade = f.t < 0.05 ? f.t / 0.05 : 1 - Math.max(0, (f.t - f.life * 0.5) / (f.life * 0.5));
      const minDim = Math.min(w, h);
      const far = Math.hypot(w, h);
      const inner = minDim * (0.42 - 0.14 * f.a);
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalCompositeOperation = pass === 0 ? 'source-over' : 'lighter';
        ctx.fillStyle = pass === 0 ? '#06060a' : '#ffffff';
        ctx.globalAlpha = fade * (pass === 0 ? 0.55 : 0.5) * Math.min(1, 0.4 + f.a);
        ctx.beginPath();
        for (let i = 0; i < f.pts.length; i += 3) {
          const isWhite = f.pts[i + 2] > 0.55;
          if ((pass === 1) !== isWhite) continue;
          const a = f.pts[i];
          const ri = inner * f.pts[i + 1];
          const ww = (2 + f.pts[i + 2] * 9) * (minDim / 720);
          const ca = Math.cos(a), sa = Math.sin(a);
          ctx.moveTo(f.x + ca * ri, f.y + sa * ri);
          ctx.lineTo(f.x + ca * far - sa * ww, f.y + sa * far + ca * ww);
          ctx.lineTo(f.x + ca * far + sa * ww, f.y + sa * far - ca * ww);
          ctx.closePath();
        }
        ctx.fill();
      }
      break;
    }
    case FX.TSPULSE: {
      // Clock face pulse (f.flag: 1 = start (expanding), 0 = end (collapsing)).
      const e = f.flag ? 1 - Math.pow(1 - k, 3) : 1 - k;
      const R = 40 + e * (f.b > 0 ? f.b : 900);
      const alpha = f.flag ? 1 - k : 0.4 + 0.6 * (1 - k);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 10 * (1 - k * 0.6);
      ctx.beginPath();
      ctx.arc(f.x, f.y, R, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.lineWidth = 4;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(a) * R * 0.9, f.y + Math.sin(a) * R * 0.9);
        ctx.lineTo(f.x + Math.cos(a) * R, f.y + Math.sin(a) * R);
        ctx.stroke();
      }
      ctx.globalAlpha = alpha * 0.7;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x, f.y - R * 0.7);
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x + R * 0.45, f.y + R * 0.1);
      ctx.stroke();
      break;
    }
    case FX.REWIND: {
      // Ghost silhouettes along the path, appearing in reverse.
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = f.color;
      ctx.lineCap = 'round';
      ctx.lineWidth = 4;
      const n = 6;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const appear = Math.min(1, Math.max(0, (k * 1.6 - u * 0.6) * 3));
        const alpha = appear * (1 - k) * (0.25 + 0.6 * u);
        if (alpha <= 0.01) continue;
        ctx.globalAlpha = alpha;
        const gx = f.x + (f.x2 - f.x) * u, gy = f.y + (f.y2 - f.y) * u;
        stickFigure(ctx, gx, gy, f.x2 >= f.x ? -1 : 1, u * 6, false);
      }
      // Reverse arrow streak.
      ctx.globalAlpha = (1 - k) * 0.7;
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = f.t * 160;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y - 60);
      ctx.quadraticCurveTo((f.x + f.x2) / 2, Math.min(f.y, f.y2) - 160, f.x2, f.y2 - 60);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case FX.PILLAR: {
      // Pillar of judgment light.
      const grow = Math.min(1, f.t / 0.12);
      const out = Math.max(0, (f.t - (f.life - 0.3)) / 0.3);
      const W = 75 * (1 - out * 0.8) * (0.6 + 0.4 * grow);
      const top = viewTop - 200;
      const bottom = top + (0 - top) * grow;
      const flick = 0.85 + Math.random() * 0.15;
      ctx.globalCompositeOperation = 'lighter';
      for (const [ww, col, al] of [[W * 2.4, f.color, 0.3], [W * 1.3, lighten(f.color, 0.4), 0.7], [W * 0.45, '#ffffff', 1]] as [number, string, number][]) {
        ctx.globalAlpha = al * flick * (1 - out);
        const g = ctx.createLinearGradient(f.x - ww, 0, f.x + ww, 0);
        g.addColorStop(0, rgbaQ(col, 0));
        g.addColorStop(0.5, rgbaQ(col, 1));
        g.addColorStop(1, rgbaQ(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(f.x - ww, top, ww * 2, bottom - top);
      }
      if (grow >= 1) {
        ctx.globalAlpha = (1 - out) * flick;
        ctx.save();
        ctx.translate(f.x, 0);
        ctx.scale(1, 0.25);
        blit(ctx, hotSprite(f.color), 0, 0, W * 4);
        ctx.restore();
      }
      break;
    }
    case FX.SINGULARITY: {
      const grow = Math.min(1, f.t / 0.3);
      const out = Math.max(0, (f.t - (f.life - 0.15)) / 0.15);
      const R = 95 * (0.3 + 0.7 * grow) * (1 - out * 0.9);
      // Lens ring.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85;
      blit(ctx, ringSprite(f.color), f.x, f.y, R * 2.1);
      ctx.globalAlpha = 0.5;
      blit(ctx, glowSprite(f.color), f.x, f.y, R * 3.2);
      // Accretion disk (tilted ellipse arcs).
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(1, 0.32);
      for (let i = 0; i < 4; i++) {
        const a0 = f.t * (5 + i) + i * 1.7;
        ctx.globalAlpha = 0.9 - i * 0.15;
        ctx.strokeStyle = i === 0 ? '#ffffff' : i % 2 ? f.color : lighten(f.color, 0.5);
        ctx.lineWidth = (i === 0 ? 5 : 9) / 0.32 * 0.32 * 2.4;
        ctx.beginPath();
        ctx.arc(0, 0, R * (1.35 + i * 0.22), a0, a0 + 4.2);
        ctx.stroke();
      }
      ctx.restore();
      // Event horizon.
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(f.x, f.y, R, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = lighten(f.color, 0.6);
      ctx.lineWidth = 2.5;
      ctx.stroke();
      break;
    }
    case FX.THORNS: {
      const grow = 1 - Math.pow(1 - Math.min(1, f.t / 0.16), 3);
      const out = Math.max(0, (f.t - (f.life - 0.35)) / 0.35);
      const n = f.pts.length / 4;
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalCompositeOperation = pass === 0 ? 'source-over' : 'lighter';
        ctx.globalAlpha = 1 - out;
        for (let i = 0; i < n; i++) {
          const ox = f.pts[i * 4], hgt = f.pts[i * 4 + 1] * grow * (1 - out * 0.3), lean = f.pts[i * 4 + 2], wid = f.pts[i * 4 + 3];
          const bx = f.x + ox, tipX = bx + lean * hgt * 0.5, tipY = -hgt;
          ctx.beginPath();
          ctx.moveTo(bx - wid, 0);
          ctx.quadraticCurveTo(bx - wid * 0.4 + lean * hgt * 0.15, -hgt * 0.55, tipX, tipY);
          ctx.quadraticCurveTo(bx + wid * 0.4 + lean * hgt * 0.25, -hgt * 0.5, bx + wid, 0);
          ctx.closePath();
          if (pass === 0) {
            ctx.fillStyle = darken(f.color, 0.72);
            ctx.fill();
          } else {
            ctx.strokeStyle = f.color;
            ctx.lineWidth = 3;
            ctx.stroke();
          }
        }
      }
      break;
    }
    case FX.PYRE: {
      // Roaring column of fire (particles add the licking flames).
      const grow = Math.min(1, f.t / 0.15);
      const out = Math.max(0, (f.t - (f.life - 0.35)) / 0.35);
      const H = 560 * grow;
      const flick = 0.8 + Math.random() * 0.2;
      ctx.globalCompositeOperation = 'lighter';
      for (const [ww, col, al] of [[120, f.color, 0.35], [70, f.color2, 0.55], [26, '#fff3c4', 0.8]] as [number, string, number][]) {
        ctx.globalAlpha = al * flick * (1 - out);
        const g = ctx.createLinearGradient(f.x - ww, 0, f.x + ww, 0);
        g.addColorStop(0, rgbaQ(col, 0));
        g.addColorStop(0.5, rgbaQ(col, 1));
        g.addColorStop(1, rgbaQ(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(f.x - ww, 0);
        ctx.quadraticCurveTo(f.x - ww * 0.8, -H * 0.6, f.x + Math.sin(f.t * 9) * 20, -H);
        ctx.quadraticCurveTo(f.x + ww * 0.8, -H * 0.6, f.x + ww, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = (1 - out) * flick;
      ctx.save();
      ctx.translate(f.x, -10);
      ctx.scale(1, 0.3);
      blit(ctx, hotSprite(f.color), 0, 0, 260);
      ctx.restore();
      break;
    }
    case FX.FREEZE: {
      const grow = Math.min(1, f.t / 0.12);
      const out = Math.max(0, (f.t - (f.life - 0.2)) / 0.2);
      const s = 0.7 + 0.3 * grow;
      const Wd = 60 * s, H = 95 * s;
      ctx.globalAlpha = 1 - out;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(170,225,255,0.38)';
      ctx.beginPath();
      ctx.moveTo(f.x, f.y - H * 1.15);
      ctx.lineTo(f.x + Wd, f.y - H * 0.55);
      ctx.lineTo(f.x + Wd * 0.9, f.y + H * 0.7);
      ctx.lineTo(f.x, f.y + H * 1.05);
      ctx.lineTo(f.x - Wd * 0.95, f.y + H * 0.65);
      ctx.lineTo(f.x - Wd, f.y - H * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#e8fbff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y - H * 1.15);
      ctx.lineTo(f.x + Wd * 0.15, f.y + H * 1.05);
      ctx.moveTo(f.x + Wd, f.y - H * 0.55);
      ctx.lineTo(f.x - Wd * 0.3, f.y + H * 0.2);
      ctx.moveTo(f.x - Wd, f.y - H * 0.6);
      ctx.lineTo(f.x + Wd * 0.4, f.y + H * 0.5);
      ctx.stroke();
      const glint = (Math.sin(f.t * 9 + f.seed) + 1) / 2;
      ctx.globalAlpha = (1 - out) * glint;
      blit(ctx, hotSprite('#bfefff'), f.x - Wd * 0.4, f.y - H * 0.5, 22);
      break;
    }
    case FX.BLADES: {
      const n = f.n;
      const converging = f.b >= 0;
      const ck = converging ? Math.min(1, (f.t - f.b) / 0.16) : 0;
      const appear = Math.min(1, f.t / 0.25);
      const R = 175 * (1 - ck * ck);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const ang = f.seed + (i / n) * TAU + (converging ? 0 : f.t * 0.6);
        const bob = converging ? 0 : Math.sin(f.t * 4 + i) * 6;
        const bx = f.x + Math.cos(ang) * (R + bob), by = f.y + Math.sin(ang) * (R + bob) * 0.85;
        if (converging && ck >= 1) continue;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(ang + Math.PI);
        ctx.globalAlpha = appear * 0.5;
        ctx.fillStyle = f.color;
        swordPath(ctx, 74, 7);
        ctx.fill();
        ctx.globalAlpha = appear;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();
        if (converging) {
          ctx.globalAlpha = 0.6;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(ang) * 60, by + Math.sin(ang) * 50);
          ctx.stroke();
        }
      }
      break;
    }
    case FX.FINBEAM: {
      const grow = Math.min(1, f.t / 0.08);
      const out = Math.max(0, (f.t - (f.life - 0.25)) / 0.25);
      drawBeamShape(ctx, f.x, f.y, f.a, 0, 3200 * grow, 96 * (1 - out * 0.9), f.color, f.color2, f.t, false, 1 - out);
      break;
    }
    case FX.METEOR: {
      const T = f.a;
      if (f.t >= T) {
        const k2 = (f.t - T) / Math.max(0.01, f.life - T);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - k2;
        blit(ctx, hotSprite(f.color), f.x, f.y, 260 * (1 - k2 * 0.5));
        break;
      }
      const kk = f.t / T;
      const e = kk * kk;
      const mx = f.x2 + (f.x - f.x2) * e, my = f.y2 + (f.y - f.y2) * e;
      const R = 62;
      const ang = Math.atan2(f.y - f.y2, f.x - f.x2);
      ctx.globalCompositeOperation = 'lighter';
      // trail
      ctx.globalAlpha = 0.7;
      for (let i = 1; i <= 6; i++) {
        const tx = mx - Math.cos(ang) * i * 55, ty = my - Math.sin(ang) * i * 55;
        blit(ctx, glowSprite(i < 3 ? '#ffb347' : f.color), tx, ty, R * (2.2 - i * 0.22));
      }
      ctx.globalAlpha = 1;
      blit(ctx, hotSprite(f.color), mx, my, R * 2.6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#2a1712';
      ctx.beginPath();
      ctx.arc(mx, my, R * 0.62, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#ffd38a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(mx, my, R * 0.62, ang + Math.PI * 0.5, ang + Math.PI * 1.5, true);
      ctx.stroke();
      break;
    }
    case FX.CRACKS: {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < f.pts.length; i += 6) {
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.pts[i], f.pts[i + 1]);
        ctx.lineTo(f.pts[i + 2], f.pts[i + 3]);
        ctx.lineTo(f.pts[i + 4], f.pts[i + 5]);
      }
      ctx.stroke();
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 6;
      ctx.globalAlpha = (1 - k) * 0.4;
      ctx.stroke();
      break;
    }
    case FX.DAMAGE: {
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.7 : 1.3 - Math.min(0.3, (k - 0.12) * 1.5);
      const rise = (1 - Math.pow(1 - k, 2)) * 60;
      const alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const size = (f.flag ? 34 : 22) * pop;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${size.toFixed(1)}px system-ui, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = f.flag ? 6 : 4;
      ctx.strokeStyle = '#05050a';
      const txt = String(Math.round(f.a));
      ctx.strokeText(txt, f.x, f.y - rise);
      ctx.fillStyle = f.flag ? '#ffffff' : lighten(f.color, 0.35);
      ctx.fillText(txt, f.x, f.y - rise);
      if (f.flag) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = f.color;
        ctx.fillText(txt, f.x, f.y - rise);
      }
      break;
    }
    case FX.CLASHCORE: {
      const alpha = 1 - k;
      const s = f.a * (0.7 + k * 0.6);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha;
      blit(ctx, hotSprite('#ffffff'), f.x, f.y, s * 0.9);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(f.x - s * 2.6, f.y);
      ctx.lineTo(f.x, f.y - s * 0.07);
      ctx.lineTo(f.x + s * 2.6, f.y);
      ctx.lineTo(f.x, f.y + s * 0.07);
      ctx.closePath();
      ctx.moveTo(f.x, f.y - s * 1.6);
      ctx.lineTo(f.x + s * 0.06, f.y);
      ctx.lineTo(f.x, f.y + s * 1.6);
      ctx.lineTo(f.x - s * 0.06, f.y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = alpha * 0.6;
      blit(ctx, glowSprite(f.color), f.x - s * 0.3, f.y, s * 1.4);
      blit(ctx, glowSprite(f.color2), f.x + s * 0.3, f.y, s * 1.4);
      break;
    }
    case FX.AURAFLARE: {
      // Flame tongues radiating outward.
      const alpha = 1 - k;
      const R = f.a * (0.4 + 0.9 * (1 - Math.pow(1 - k, 2)));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = f.seed + (i / n) * TAU;
        const l = R * (0.75 + 0.5 * Math.abs(Math.sin(f.seed * 7 + i * 2.3)));
        const w = 0.09;
        ctx.moveTo(f.x + Math.cos(a - w) * R * 0.3, f.y + Math.sin(a - w) * R * 0.3);
        ctx.quadraticCurveTo(f.x + Math.cos(a) * l * 0.7, f.y + Math.sin(a) * l * 0.7 - 10, f.x + Math.cos(a) * l, f.y + Math.sin(a) * l);
        ctx.quadraticCurveTo(f.x + Math.cos(a) * l * 0.7, f.y + Math.sin(a) * l * 0.7 + 10, f.x + Math.cos(a + w) * R * 0.3, f.y + Math.sin(a + w) * R * 0.3);
      }
      ctx.fill();
      ctx.globalAlpha = alpha;
      blit(ctx, hotSprite(f.color), f.x, f.y, R * 0.8);
      break;
    }
    default:
      break;
  }
}

/* ======================================================================== */
/* Beam rendering (shared by sim beams and finisher beams)                  */
/* ======================================================================== */

/**
 * Layered energy beam from (ox,oy) along unit (dx,dy) for `len`, half-width = width/2.
 * colors: primary + secondary; white-hot core; travelling ripples; origin flare.
 */
export function drawBeamShape(
  ctx: CanvasRenderingContext2D, ox: number, oy: number, dx: number, dy: number, len: number, width: number,
  primary: string, secondary: string, time: number, struggling: boolean, alpha: number,
): void {
  if (len <= 1 || alpha <= 0.01) return;
  const nx = -dy, ny = dx;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const segs = Math.max(8, Math.min(48, Math.round(len / 50)));
  const layers: [number, string, number][] = [
    [width * 1.7, primary, 0.22],
    [width * 1.2, primary, 0.42],
    [width * 0.78, secondary, 0.78],
    [width * 0.34, '#ffffff', 1],
  ];
  for (let li = 0; li < layers.length; li++) {
    const [ww, col, al] = layers[li];
    ctx.globalAlpha = al * alpha;
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const s = i / segs;
      const along = s * len;
      const taper = Math.min(1, s * 14) * (struggling ? 1 : Math.min(1, (1 - s) * 30 + 0.55));
      const wob = 1 + 0.1 * Math.sin(along * 0.045 - time * 42 + li) + 0.06 * Math.sin(along * 0.11 + time * 27);
      const hw = (ww / 2) * taper * wob;
      const px = ox + dx * along + nx * hw, py = oy + dy * along + ny * hw;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    for (let i = segs; i >= 0; i--) {
      const s = i / segs;
      const along = s * len;
      const taper = Math.min(1, s * 14) * (struggling ? 1 : Math.min(1, (1 - s) * 30 + 0.55));
      const wob = 1 + 0.1 * Math.sin(along * 0.045 - time * 42 + li + 2) + 0.06 * Math.sin(along * 0.11 + time * 27 + 1);
      const hw = (ww / 2) * taper * wob;
      ctx.lineTo(ox + dx * along - nx * hw, oy + dy * along - ny * hw);
    }
    ctx.closePath();
    ctx.fill();
  }
  // Travelling ripples (bright bands).
  ctx.globalAlpha = 0.55 * alpha;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  const spacing = 140;
  const off = (time * 1800) % spacing;
  for (let a = off; a < len - 20; a += spacing) {
    const cx = ox + dx * a, cy = oy + dy * a;
    const hw = width * 0.62;
    ctx.beginPath();
    ctx.moveTo(cx + nx * hw, cy + ny * hw);
    ctx.quadraticCurveTo(cx + dx * 18, cy + dy * 18, cx - nx * hw, cy - ny * hw);
    ctx.stroke();
  }
  // Interior speed streaks rushing outward.
  ctx.globalAlpha = 0.7 * alpha;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const lane = ((i * 0.37 + 0.13) % 1 - 0.5) * width * 0.9;
    const sl = 60 + ((i * 53) % 70);
    const pos = (time * (2200 + i * 170) + i * 211) % Math.max(1, len);
    const a0 = Math.max(0, pos - sl);
    ctx.moveTo(ox + dx * a0 + nx * lane, oy + dy * a0 + ny * lane);
    ctx.lineTo(ox + dx * pos + nx * lane, oy + dy * pos + ny * lane);
  }
  ctx.stroke();
  // Origin flare.
  ctx.globalAlpha = alpha;
  blit(ctx, glowSprite(primary), ox, oy, width * 2.6);
  blit(ctx, hotSprite(secondary), ox, oy, width * 1.2);
  const spin = time * 6;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.8 * alpha;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = spin + (i * Math.PI) / 2;
    const l = width * (i % 2 ? 1.3 : 2.1);
    ctx.moveTo(ox + Math.cos(a) * l, oy + Math.sin(a) * l);
    ctx.lineTo(ox + Math.cos(a + 1.4) * 5, oy + Math.sin(a + 1.4) * 5);
    ctx.lineTo(ox + Math.cos(a - 1.4) * 5, oy + Math.sin(a - 1.4) * 5);
    ctx.closePath();
  }
  ctx.fill();
  // Tip bloom.
  const tx = ox + dx * len, ty = oy + dy * len;
  const tipR = struggling ? width * (2.4 + Math.random() * 0.8) : width * (1.1 + Math.random() * 0.3);
  ctx.globalAlpha = alpha;
  blit(ctx, glowSprite(primary), tx, ty, tipR * 1.6);
  blit(ctx, hotSprite(secondary), tx, ty, tipR * 0.9);
  ctx.restore();
}

export { drawGlyph };
