import { ASPECT_PALETTES, mixHex, type AspectId } from '../../core/ids';
import type { Simulation } from '../../sim/simulation';
import type { CameraView } from '../types';
import type { IVfx, ShatterStyle } from './types';
import { LAYER, PF, PK, ParticleSystem } from './particles';
import { FL, FX, FxPool, impactBurst, type Fx } from './effects';
import { EntityRenderer } from './entityDraw';
import { darken, lighten } from './sprites';

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: readonly T[]): T => arr[(Math.random() * arr.length) | 0];
const NEUTRAL = { primary: '#ff7a2a', secondary: '#ffd36b', core: '#fff6e0' };

/**
 * GODLINE visual effects: pooled particles, timed shape effects and rendering of the
 * simulation's projectiles, beams, ability zones, decoys and time stop.
 *
 * Conventions: world space (y down, ground y = 0). For body-centred effects
 * (teleportFlash, aura, auraBurst, chargeMotes, healGlow, dashLines, shatter, freezeSolid)
 * pass the fighter's body centre (feet y − 60). rewindTrail takes FEET positions.
 */
export class Vfx implements IVfx {
  private ps = new ParticleSystem(6000);
  private fx = new FxPool();
  /** Screen-space effects advance in real time (they persist through hit-stop freezes). */
  private screenFx = new FxPool();
  private ents = new EntityRenderer();
  private ts = { active: false, x: 0, y: 0, color: '#ffffff' };

  /* ================================================================== */
  /* Frame                                                              */
  /* ================================================================== */

  update(dt: number, realDt: number, sim: Simulation): void {
    this.ps.update(dt);
    this.fx.update(dt, this.ps);
    this.screenFx.update(realDt, this.ps);
    this.ents.update(dt, sim, this.ps, this.fx);
  }

  drawBack(ctx: CanvasRenderingContext2D, cam: CameraView, sim: Simulation): void {
    cam.applyTransform(ctx);
    const top = cam.visibleWorldRect().top;
    if (!sim.timeStop && this.ts.active) this.ents.drawClockAt(ctx, this.ts.x, this.ts.y, this.ts.color);
    this.ents.drawBack(ctx, sim, top);
    this.ps.draw(ctx, LAYER.BACK);
    this.fx.draw(ctx, FL.BACK, 0, 0, top);
  }

  drawMid(ctx: CanvasRenderingContext2D, cam: CameraView, sim: Simulation): void {
    cam.applyTransform(ctx);
    const top = cam.visibleWorldRect().top;
    this.ents.drawMid(ctx, sim, top);
    this.fx.draw(ctx, FL.MID, 0, 0, top);
  }

  drawFront(ctx: CanvasRenderingContext2D, cam: CameraView, sim: Simulation): void {
    cam.applyTransform(ctx);
    const top = cam.visibleWorldRect().top;
    this.ps.draw(ctx, LAYER.FRONT);
    this.fx.draw(ctx, FL.FRONT, 0, 0, top);
    void sim;
  }

  drawScreen(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    this.screenFx.draw(ctx, FL.SCREEN, width, height);
  }

  clear(): void {
    this.ps.clear();
    this.fx.clear();
    this.screenFx.clear();
    this.ents.clear();
    this.ts.active = false;
  }

  /** Live particle count (diagnostics). */
  get particleCount(): number {
    return this.ps.count;
  }
  /** Live timed-effect count (diagnostics). */
  get effectCount(): number {
    return this.fx.list.length + this.screenFx.list.length;
  }

  /* ================================================================== */
  /* Helpers                                                            */
  /* ================================================================== */

  private flash(x: number, y: number, r0: number, r1: number, life: number, color = '#ffffff', layer: number = LAYER.FRONT): number {
    const i = this.ps.emit(PK.FLASH, layer, x, y, 0, 0, life, r0, color);
    this.ps.size2[i] = r1;
    return i;
  }

  private ring(x: number, y: number, r0: number, r1: number, life: number, width: number, color: string, core = true): number {
    const i = this.ps.emit(PK.RING, LAYER.FRONT, x, y, 0, 0, life, r0, color);
    this.ps.size2[i] = r1;
    this.ps.len[i] = width;
    if (core) this.ps.flags[i] |= PF.WHITE_CORE;
    return i;
  }

  private spark(x: number, y: number, ang: number, speed: number, life: number, size: number, color: string, grav = 0, drag = 0, len = 0.03): number {
    const i = this.ps.emit(PK.SPARK, LAYER.FRONT, x, y, Math.cos(ang) * speed, Math.sin(ang) * speed, life, size, color);
    this.ps.grav[i] = grav;
    this.ps.drag[i] = drag;
    this.ps.len[i] = len;
    this.ps.flags[i] |= PF.WHITE_CORE;
    return i;
  }

  private star(x: number, y: number, spikes: number, len: number, width: number, life: number, color: string): Fx {
    const f = this.fx.spawn(FX.STAR, FL.FRONT, x, y, life, color);
    f.a = len;
    f.b = width;
    f.c = Math.random() * TAU;
    for (let i = 0; i < spikes; i++) f.pts.push((i / spikes) * TAU + rnd(-0.12, 0.12), rnd(0.5, 1));
    return f;
  }

  /* ================================================================== */
  /* Impact & combat                                                    */
  /* ================================================================== */

  hitSpark(x: number, y: number, dirX: number, level: number, color: string, opts?: { cut?: boolean; counter?: boolean }): void {
    const counter = !!opts?.counter;
    const L = Math.max(1, Math.min(4, level)) + (counter ? 1 : 0);
    const col = counter ? '#ffd76a' : color;
    const fwd = dirX >= 0 ? 0 : Math.PI;
    this.flash(x, y, 10, 34 + 30 * L, 0.06 + 0.02 * L);
    const n = 5 + L * 4;
    for (let k = 0; k < n; k++) {
      const ang = Math.random() < 0.72 ? fwd + rnd(-0.85, 0.85) : Math.random() * TAU;
      const sp = rnd(700, 1600) * (0.7 + 0.3 * L);
      this.spark(x, y, ang, sp, rnd(0.1, 0.24), 2 + L * 0.8, Math.random() < 0.45 ? '#ffffff' : col, 500, 4.5, 0.034);
    }
    this.ring(x, y, 8, 32 + 22 * L, 0.18 + 0.03 * L, 3.5 + L, col);
    if (L <= 2) this.flash(x, y, 6, 50 + 16 * L, 0.05, col);
    for (let k = 0; k < L * 3; k++) {
      const a = fwd + rnd(-1.4, 1.4);
      const sp = rnd(100, 380);
      const i = this.ps.emit(PK.EMBER, LAYER.FRONT, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 80, rnd(0.3, 0.7), rnd(1.5, 3), col);
      this.ps.drag[i] = 3;
      this.ps.grav[i] = 200;
    }
    if (L >= 3) {
      this.star(x, y, 10 + L * 2, 70 + 42 * (L - 2), 5 + L * 1.6, 0.075, col);
      if (L >= 4) this.flash(x, y, 30, 220, 0.12, col);
    }
    if (opts?.cut) {
      const a = (dirX >= 0 ? -0.3 : 0.3) + rnd(-0.35, 0.35);
      this.slashLine(x, y, a, 170 + L * 60, col, 2.4 + L * 0.4);
    }
    if (counter) {
      this.ring(x, y, 20, 150 + 30 * L, 0.32, 6, '#ffffff');
      this.star(x, y, 8, 120 + 30 * L, 3, 0.1, '#fff2b0');
    }
  }

  blockSpark(x: number, y: number, dirX: number, color: string, heavy: boolean): void {
    const towardAttacker = dirX >= 0 ? Math.PI : 0;
    const f = this.fx.spawn(FX.ARC, FL.FRONT, x, y, heavy ? 0.22 : 0.16, color);
    f.a = heavy ? 58 : 42;
    f.c = towardAttacker;
    const n = heavy ? 16 : 9;
    for (let k = 0; k < n; k++) {
      const a = towardAttacker + rnd(-0.9, 0.9) - 0.5 * Math.sign(Math.cos(towardAttacker) || 1) * 0;
      const up = -rnd(0.1, 0.9);
      const ang = Math.atan2(Math.sin(a) + up, Math.cos(a));
      this.spark(x, y, ang, rnd(450, 1100), rnd(0.12, 0.28), heavy ? 2.6 : 2, Math.random() < 0.5 ? '#fff3b0' : Math.random() < 0.5 ? '#ffffff' : color, 1700, 3);
    }
    this.flash(x, y, 8, heavy ? 70 : 46, 0.06);
    if (heavy) this.ring(x, y, 10, 90, 0.2, 5, color);
  }

  parryFlash(x: number, y: number, perfect: boolean, color: string): void {
    const f = this.fx.spawn(FX.PARRY, FL.FRONT, x, y, perfect ? 0.34 : 0.22, color);
    f.a = perfect ? 95 : 62;
    f.flag = perfect ? 1 : 0;
    f.c = Math.random() * TAU;
    this.ring(x, y, 10, perfect ? 180 : 95, perfect ? 0.34 : 0.24, perfect ? 8 : 5, color);
    this.flash(x, y, 10, perfect ? 130 : 64, perfect ? 0.12 : 0.08);
    if (perfect) {
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * TAU + rnd(-0.05, 0.05);
        const i = this.ps.emit(PK.STREAK, LAYER.FRONT, x + Math.cos(a) * 30, y + Math.sin(a) * 30, Math.cos(a) * 900, Math.sin(a) * 900, rnd(0.14, 0.2), rnd(1.5, 2.5), k % 3 ? '#ffffff' : color);
        this.ps.len[i] = rnd(50, 110);
        this.ps.drag[i] = 6;
      }
      const r2 = this.ring(x, y, 20, 260, 0.45, 4, '#ffffff', false);
      this.ps.delay[r2] = 0.05;
      for (let k = 0; k < 12; k++) {
        const a = Math.random() * TAU;
        const i = this.ps.emit(PK.MOTE, LAYER.FRONT, x, y, Math.cos(a) * rnd(100, 300), Math.sin(a) * rnd(100, 300), rnd(0.4, 0.8), rnd(2, 3.5), Math.random() < 0.5 ? '#ffffff' : color);
        this.ps.drag[i] = 3;
      }
    } else {
      for (let k = 0; k < 8; k++) this.spark(x, y, Math.random() * TAU, rnd(400, 800), rnd(0.1, 0.2), 1.8, Math.random() < 0.5 ? '#ffffff' : color, 600, 4);
    }
  }

  clashBurst(x: number, y: number, heavy: boolean, colorA: string, colorB: string): void {
    const f = this.fx.spawn(FX.CLASHCORE, FL.FRONT, x, y, heavy ? 0.22 : 0.15, colorA);
    f.a = heavy ? 72 : 44;
    f.color2 = colorB;
    const n = heavy ? 44 : 24;
    for (let k = 0; k < n; k++) {
      const left = k % 2 === 0;
      const base = left ? -Math.PI + 0.25 : -0.25;
      const ang = base + (left ? 1 : -1) * rnd(0, 1.05) - (left ? 0 : 0);
      const col = Math.random() < 0.3 ? '#ffffff' : left ? colorA : colorB;
      this.spark(x, y, ang, rnd(600, 1500) * (heavy ? 1.15 : 1), rnd(0.22, 0.5), heavy ? 2.8 : 2.2, col, 1900, 1.4, 0.026);
    }
    const mix = mixHex(colorA, colorB, 0.5);
    this.ring(x, y, 10, heavy ? 230 : 120, heavy ? 0.4 : 0.28, heavy ? 12 : 7, mix);
    this.flash(x, y, 14, heavy ? 180 : 90, heavy ? 0.12 : 0.08);
    if (heavy) {
      this.star(x, y, 14, 150, 7, 0.09, mix);
      for (let k = 0; k < 14; k++) {
        const a = Math.random() * TAU;
        const i = this.ps.emit(PK.EMBER, LAYER.FRONT, x, y, Math.cos(a) * rnd(150, 450), Math.sin(a) * rnd(150, 450), rnd(0.5, 1), rnd(2, 3.5), k % 2 ? colorA : colorB);
        this.ps.drag[i] = 2.5;
      }
      const r2 = this.ring(x, y, 30, 340, 0.55, 5, '#ffffff', false);
      this.ps.delay[r2] = 0.04;
    }
  }

  grindSparks(x: number, y: number, colorA: string, colorB: string): void {
    const n = 6 + ((Math.random() * 4) | 0);
    for (let k = 0; k < n; k++) {
      const ang = -Math.PI / 2 + rnd(-1.3, 1.3);
      this.spark(x + rnd(-6, 6), y + rnd(-6, 6), ang, rnd(350, 900), rnd(0.15, 0.32), rnd(1.4, 2.4), Math.random() < 0.4 ? '#ffffff' : Math.random() < 0.5 ? colorA : colorB, 2000, 1.5, 0.028);
    }
    if (Math.random() < 0.5) this.flash(x, y, 6, 36, 0.05);
  }

  slashLine(x: number, y: number, angle: number, length: number, color: string, width = 4): void {
    const f = this.fx.spawn(FX.SLASH, FL.FRONT, x, y, 0.48, color);
    f.a = length;
    f.b = width;
    f.c = angle;
  }

  shockRing(x: number, y: number, radius: number, color: string, thickness = 6, duration = 0.35): void {
    this.ring(x, y, radius * 0.15, radius, duration, thickness, color);
    const i = this.ring(x, y, radius * 0.1, radius * 0.8, duration * 0.8, thickness * 0.5, lighten(color, 0.5), false);
    this.ps.alpha[i] = 0.6;
  }

  explosion(x: number, y: number, radius: number, aspect: AspectId | null): void {
    const P = aspect ? ASPECT_PALETTES[aspect] : NEUTRAL;
    const s = radius / 200;
    this.flash(x, y, 30, radius * 1.1, 0.12);
    const f = this.fx.spawn(FX.SPHERE, FL.MID, x, y, 0.5 + 0.08 * s, P.primary);
    f.a = radius;
    f.color2 = P.secondary;
    this.ring(x, y, radius * 0.2, radius * 1.5, 0.42, 14 * Math.min(1.6, 0.6 + s), P.primary);
    const n = Math.round(22 + 14 * s);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU;
      this.spark(x, y, a, rnd(600, 1600) * (0.6 + 0.4 * s), rnd(0.2, 0.45), rnd(2, 3.5), Math.random() < 0.35 ? '#ffffff' : Math.random() < 0.5 ? P.secondary : P.primary, 900, 2.2, 0.03);
    }
    for (let k = 0; k < Math.round(4 + 2 * s); k++) {
      const a = Math.random() * TAU;
      const rr = Math.random() * radius * 0.45;
      const i = this.ps.emit(PK.SMOKE, LAYER.BACK, x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7, Math.cos(a) * rnd(40, 200) * s, Math.sin(a) * rnd(40, 160) * s - 40, rnd(0.9, 1.4), radius * 0.25, '#18121a', 0.6);
      this.ps.size2[i] = radius * rnd(0.5, 0.72);
      this.ps.drag[i] = 1.4;
    }
    if (y > -180) this.debris(x, Math.min(-6, y), 6 + 6 * s, '#2a2420', 0.8 + 0.4 * s);
    for (let k = 0; k < 16; k++) {
      const i = this.ps.emit(PK.EMBER, LAYER.FRONT, x + rnd(-radius, radius) * 0.4, y + rnd(-radius, radius) * 0.3, rnd(-160, 160), rnd(-420, -120), rnd(0.8, 1.6), rnd(1.5, 3), Math.random() < 0.5 ? P.secondary : P.primary);
      this.ps.drag[i] = 1.2;
    }
    if (aspect) this.elementBurst(x, y, aspect, 0.8 * Math.min(1.5, s + 0.4));
  }

  dust(x: number, y: number, amount: number, dir = 0): void {
    const n = Math.round(4 + amount * 5);
    for (let k = 0; k < n; k++) {
      const side = dir !== 0 ? (Math.random() < 0.8 ? dir : -dir) : Math.random() < 0.5 ? -1 : 1;
      const i = this.ps.emit(PK.DUST, LAYER.BACK, x + rnd(-16, 16), Math.min(-4, y - rnd(2, 14)), side * rnd(120, 460) * (0.6 + amount * 0.25) + rnd(-50, 50), -rnd(30, 120), rnd(0.5, 1.0), rnd(12, 20), Math.random() < 0.5 ? '#b9aa98' : '#8f8172', 0.55);
      this.ps.size2[i] = rnd(40, 80) * (0.6 + amount * 0.3);
      this.ps.drag[i] = 3.2;
    }
    // A few grit specks kicked up.
    for (let k = 0; k < Math.round(amount * 4); k++) {
      const i = this.ps.emit(PK.DEBRIS, LAYER.FRONT, x + rnd(-10, 10), -4, rnd(-260, 260) + dir * 120, -rnd(150, 420), rnd(0.5, 0.8), rnd(1.5, 3), '#5a4d42');
      this.ps.grav[i] = 2200;
      this.ps.flags[i] |= PF.BOUNCE;
      this.ps.vrot[i] = rnd(-12, 12);
      this.ps.setColor2(i, '#9a8b7c');
    }
  }

  debris(x: number, y: number, amount: number, color: string, power = 1): void {
    const n = Math.round(amount);
    const edge = lighten(color, 0.3);
    for (let k = 0; k < n; k++) {
      const i = this.ps.emit(PK.DEBRIS, LAYER.FRONT, x + rnd(-20, 20), y + rnd(-10, 0), rnd(-500, 500) * power, -rnd(300, 900) * power, rnd(1.3, 2.2), rnd(3, 10), color);
      this.ps.grav[i] = 2400;
      this.ps.flags[i] |= PF.BOUNCE;
      this.ps.vrot[i] = rnd(-15, 15);
      this.ps.setColor2(i, edge);
    }
  }

  teleportFlash(x: number, y: number, color: string, out: boolean): void {
    if (out) {
      this.flash(x, y, 20, 90, 0.1, color);
      this.flash(x, y, 8, 50, 0.07);
      for (const dy of [-1, 1]) {
        const i = this.ps.emit(PK.STREAK, LAYER.FRONT, x, y, 0, dy * 40, 0.14, 4, '#ffffff');
        this.ps.len[i] = 85;
      }
      for (let k = 0; k < 8; k++) {
        const dir = k % 2 ? 1 : -1;
        const i = this.ps.emit(PK.STREAK, LAYER.FRONT, x + dir * rnd(0, 20), y + rnd(-55, 55), dir * rnd(700, 1400), 0, rnd(0.1, 0.18), rnd(1.5, 3), Math.random() < 0.5 ? '#ffffff' : color);
        this.ps.len[i] = rnd(40, 120);
        this.ps.drag[i] = 5;
      }
      for (let k = 0; k < 14; k++) {
        const a = Math.random() * TAU;
        const i = this.ps.emit(PK.MOTE, LAYER.FRONT, x + rnd(-15, 15), y + rnd(-50, 50), Math.cos(a) * rnd(150, 450), Math.sin(a) * rnd(150, 450), rnd(0.25, 0.5), rnd(2, 3.5), Math.random() < 0.4 ? '#ffffff' : color);
        this.ps.drag[i] = 4;
      }
      this.ring(x, y, 10, 80, 0.16, 4, color);
    } else {
      for (let k = 0; k < 18; k++) {
        const a = Math.random() * TAU;
        const r = rnd(90, 150);
        const i = this.ps.emit(PK.MOTE, LAYER.FRONT, x + Math.cos(a) * r, y + Math.sin(a) * r, -Math.cos(a) * 200, -Math.sin(a) * 200, 0.2, rnd(2, 3.5), Math.random() < 0.4 ? '#ffffff' : color);
        this.ps.flags[i] |= PF.HOMING;
        this.ps.hx[i] = x;
        this.ps.hy[i] = y;
        this.ps.homing[i] = 5200;
      }
      const f1 = this.flash(x, y, 20, 110, 0.12, color);
      this.ps.delay[f1] = 0.06;
      const f2 = this.flash(x, y, 10, 60, 0.08);
      this.ps.delay[f2] = 0.06;
      const r = this.ring(x, y, 10, 120, 0.22, 5, color);
      this.ps.delay[r] = 0.06;
      for (const dy of [-1, 1]) {
        const i = this.ps.emit(PK.STREAK, LAYER.FRONT, x, y, 0, dy * 40, 0.16, 4, '#ffffff');
        this.ps.len[i] = 90;
        this.ps.delay[i] = 0.05;
      }
    }
  }

  auraBurst(x: number, y: number, color: string, power: number): void {
    const p = Math.max(0.3, power);
    const f = this.fx.spawn(FX.AURAFLARE, FL.FRONT, x, y, 0.28 + 0.08 * p, color);
    f.a = 90 + 70 * p;
    this.flash(x, y, 30, 140 + 90 * p, 0.14, color);
    this.ring(x, y, 20, 200 + 140 * p, 0.45, 10 * p, color);
    for (let k = 0; k < 22 * p; k++) {
      const a = Math.random() * TAU;
      const i = this.ps.emit(PK.MOTE, LAYER.FRONT, x, y, Math.cos(a) * rnd(250, 700) * p, Math.sin(a) * rnd(250, 700) * p, rnd(0.35, 0.7), rnd(2, 4), Math.random() < 0.4 ? '#ffffff' : color);
      this.ps.drag[i] = 3;
    }
    for (let k = 0; k < 16 * p; k++) {
      const i = this.ps.emit(PK.FLAME, LAYER.FRONT, x + rnd(-30, 30), y + rnd(-60, 50), rnd(-80, 80), -rnd(300, 700), rnd(0.3, 0.55), rnd(14, 26), color);
      this.ps.setColor2(i, '#ffffff');
      this.ps.drag[i] = 1.5;
    }
  }

  aura(x: number, y: number, color: string, intensity: number): void {
    const it = Math.max(0, Math.min(1.5, intensity));
    const n = Math.ceil(1 + 2 * it);
    for (let k = 0; k < n; k++) {
      const i = this.ps.emit(PK.FLAME, LAYER.FRONT, x + rnd(-24, 24), y + rnd(-58, 58), rnd(-40, 40), -rnd(160, 380), rnd(0.26, 0.46), rnd(8, 15) * (0.6 + 0.5 * it), color, 0.8);
      this.ps.setColor2(i, lighten(color, 0.6));
      this.ps.drag[i] = 1.5;
    }
    if (Math.random() < 0.25 * it) {
      const i = this.ps.emit(PK.EMBER, LAYER.FRONT, x + rnd(-30, 30), y + rnd(-50, 50), rnd(-60, 60), -rnd(150, 300), rnd(0.5, 0.9), rnd(1.5, 2.5), lighten(color, 0.4));
      this.ps.drag[i] = 1;
    }
  }

  chargeMotes(x: number, y: number, color: string, intensity: number): void {
    const it = Math.max(0, Math.min(1.5, intensity));
    const n = Math.ceil(1 + 3 * it);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU;
      const r = rnd(110, 230);
      const i = this.ps.emit(PK.MOTE, LAYER.FRONT, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.85, Math.cos(a + 1.57) * 160, Math.sin(a + 1.57) * 160, 0.6, rnd(1.8, 3.2), Math.random() < 0.35 ? '#ffffff' : color);
      this.ps.flags[i] |= PF.HOMING;
      this.ps.hx[i] = x;
      this.ps.hy[i] = y;
      this.ps.homing[i] = 2600;
    }
    if (it > 0.6 && Math.random() < 0.06 * it) {
      const a = Math.random() * TAU;
      this.lightning(x + Math.cos(a) * 30, y + Math.sin(a) * 50, x + Math.cos(a) * 110, y + Math.sin(a) * 120, color, 1.6);
    }
  }

  lightning(x1: number, y1: number, x2: number, y2: number, color: string, width = 3): void {
    const f = this.fx.spawn(FX.LIGHTNING, FL.FRONT, x1, y1, 0.25, color);
    f.x2 = x2;
    f.y2 = y2;
    f.a = width;
  }

  shatter(x: number, y: number, style: ShatterStyle, color: string): void {
    this.flash(x, y, 30, 170, 0.16, color);
    this.flash(x, y, 14, 90, 0.1);
    const body = () => [x + rnd(-24, 24), y + rnd(-62, 62)] as const;
    switch (style) {
      case 'ash': {
        for (let k = 0; k < 80; k++) {
          const [px, py] = body();
          const i = this.ps.emit(PK.FLAKE, LAYER.FRONT, px, py, rnd(-90, 120), -rnd(40, 170), rnd(1.6, 2.8), rnd(2.5, 5.5), pick(['#3c3330', '#5a4e48', '#2a2422', '#7a5a48']));
          this.ps.flags[i] |= PF.FLUTTER;
          this.ps.vrot[i] = rnd(-6, 6);
          this.ps.grav[i] = -30;
          this.ps.drag[i] = 0.5;
          this.ps.delay[i] = rnd(0, 0.35) * ((py - (y - 62)) / 124);
        }
        for (let k = 0; k < 36; k++) {
          const [px, py] = body();
          const i = this.ps.emit(PK.EMBER, LAYER.FRONT, px, py, rnd(-60, 90), -rnd(80, 240), rnd(1, 2), rnd(1.5, 3), Math.random() < 0.5 ? '#ff8a3a' : '#ffcf7a');
          this.ps.drag[i] = 0.6;
          this.ps.delay[i] = rnd(0, 0.3);
        }
        const s = this.ps.emit(PK.SMOKE, LAYER.BACK, x, y, 0, -60, 1.6, 40, '#1a1416', 0.5);
        this.ps.size2[s] = 140;
        break;
      }
      case 'light': {
        for (let k = 0; k < 80; k++) {
          const [px, py] = body();
          const i = this.ps.emit(PK.MOTE, LAYER.FRONT, px, py, rnd(-50, 50), -rnd(120, 460), rnd(1, 1.8), rnd(1.8, 3.8), pick(['#ffffff', color, '#ffe9a0']));
          this.ps.drag[i] = 0.6;
          this.ps.delay[i] = rnd(0, 0.25);
        }
        for (let k = 0; k < 5; k++) {
          const f = this.fx.spawn(FX.SHAFT, FL.FRONT, x + rnd(-50, 50), y + 70, rnd(0.7, 1.1), color);
          f.a = rnd(18, 45);
          f.b = rnd(500, 950);
        }
        this.ring(x, y, 20, 220, 0.5, 6, color);
        break;
      }
      case 'petals': {
        for (let k = 0; k < 70; k++) {
          const [px, py] = body();
          const a = Math.random() * TAU;
          const i = this.ps.emit(PK.PETAL, LAYER.FRONT, px, py, Math.cos(a) * rnd(60, 260), Math.sin(a) * rnd(40, 180) - 160, rnd(1.6, 2.6), rnd(4, 7), pick([color, '#ffb0d0', '#a8ffc8', '#ffffff']));
          this.ps.flags[i] |= PF.FLUTTER;
          this.ps.vrot[i] = rnd(-9, 9);
          this.ps.grav[i] = 90;
          this.ps.drag[i] = 1.1;
          this.ps.delay[i] = rnd(0, 0.25);
        }
        break;
      }
      case 'ice': {
        for (let k = 0; k < 50; k++) {
          const [px, py] = body();
          const a = Math.atan2(py - y, px - x) + rnd(-0.6, 0.6);
          const i = this.ps.emit(PK.SHARD, LAYER.FRONT, px, py, Math.cos(a) * rnd(250, 800), Math.sin(a) * rnd(200, 600) - 200, rnd(1.1, 1.8), rnd(4, 10), pick(['#cdefff', '#ffffff', color]));
          this.ps.grav[i] = 1700;
          this.ps.flags[i] |= PF.BOUNCE;
          this.ps.vrot[i] = rnd(-14, 14);
        }
        for (let k = 0; k < 10; k++) {
          const i = this.ps.emit(PK.DUST, LAYER.FRONT, x + rnd(-30, 30), y + rnd(-50, 50), rnd(-80, 80), rnd(-60, 20), rnd(0.9, 1.4), 24, '#dff6ff', 0.4);
          this.ps.size2[i] = 90;
          this.ps.drag[i] = 2;
        }
        this.ring(x, y, 20, 200, 0.4, 6, '#e8fbff');
        break;
      }
      case 'sparks': {
        for (let k = 0; k < 70; k++) {
          const [px, py] = body();
          this.spark(px, py, Math.random() * TAU, rnd(300, 1300), rnd(0.25, 0.6), rnd(1.5, 3), Math.random() < 0.4 ? '#ffffff' : color, 600, 2, 0.03);
        }
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * TAU;
          const l = rnd(90, 220);
          const f = this.fx.spawn(FX.LIGHTNING, FL.FRONT, x, y, rnd(0.18, 0.4), k % 2 ? '#ffffff' : color);
          f.x2 = x + Math.cos(a) * l;
          f.y2 = y + Math.sin(a) * l;
          f.a = 2.4;
        }
        break;
      }
      case 'void': {
        for (let k = 0; k < 55; k++) {
          const a = Math.random() * TAU;
          const r = rnd(150, 240);
          const i = this.ps.emit(PK.MOTE, LAYER.FRONT, x + Math.cos(a) * r, y + Math.sin(a) * r, Math.cos(a + 1.57) * 200, Math.sin(a + 1.57) * 200, 0.5, rnd(2, 3.5), Math.random() < 0.3 ? '#ffffff' : color);
          this.ps.flags[i] |= PF.HOMING;
          this.ps.hx[i] = x;
          this.ps.hy[i] = y;
          this.ps.homing[i] = 3000;
        }
        const f = this.flash(x, y, 20, 200, 0.18, color);
        this.ps.delay[f] = 0.42;
        for (let k = 0; k < 34; k++) {
          const i = this.ps.emit(PK.WISP, LAYER.FRONT, x + rnd(-30, 30), y + rnd(-50, 50), rnd(-60, 60), -rnd(120, 300), rnd(0.9, 1.5), rnd(4, 8), darken(color, 0.45), 0.75);
          this.ps.delay[i] = 0.42 + rnd(0, 0.15);
          this.ps.drag[i] = 1;
        }
        for (let k = 0; k < 20; k++) {
          const a = Math.random() * TAU;
          const i = this.ps.emit(PK.MOTE, LAYER.FRONT, x, y, Math.cos(a) * rnd(150, 500), Math.sin(a) * rnd(150, 500), rnd(0.6, 1.2), rnd(2, 3), color);
          this.ps.delay[i] = 0.42;
          this.ps.drag[i] = 2.5;
        }
        break;
      }
      case 'clock': {
        for (let k = 0; k < 26; k++) {
          const [px, py] = body();
          const a = Math.random() * TAU;
          const i = this.ps.emit(PK.GLYPH, LAYER.FRONT, px, py, Math.cos(a) * rnd(40, 220), Math.sin(a) * rnd(40, 200) - 60, rnd(1.2, 2.0), rnd(6, 15), Math.random() < 0.5 ? '#ffffff' : color);
          this.ps.shape[i] = Math.random() < 0.5 ? 0 : 1;
          this.ps.vrot[i] = rnd(-3, 3);
          this.ps.drag[i] = 1.2;
        }
        for (let k = 0; k < 40; k++) {
          const [px, py] = body();
          const i = this.ps.emit(PK.MOTE, LAYER.FRONT, px, py, rnd(-120, 120), -rnd(60, 260), rnd(0.8, 1.5), rnd(1.8, 3), Math.random() < 0.3 ? '#ffffff' : color);
          this.ps.drag[i] = 1;
        }
        const f = this.fx.spawn(FX.TSPULSE, FL.FRONT, x, y, 0.5, color);
        f.flag = 1;
        f.b = 170;
        break;
      }
    }
  }

  damageNumber(x: number, y: number, amount: number, color: string, big: boolean): void {
    if (amount < 1) return;
    const f = this.fx.spawn(FX.DAMAGE, FL.FRONT, x + rnd(-12, 12), y + rnd(-8, 8), big ? 1.05 : 0.8, color);
    f.a = amount;
    f.flag = big ? 1 : 0;
  }

  dashLines(x: number, y: number, dirX: number, color: string): void {
    const d = dirX >= 0 ? 1 : -1;
    for (let k = 0; k < 9; k++) {
      const i = this.ps.emit(PK.STREAK, LAYER.BACK, x - d * rnd(10, 70), y + rnd(-58, 58), -d * rnd(80, 260), 0, rnd(0.16, 0.26), rnd(1.4, 3), Math.random() < 0.5 ? '#ffffff' : color, 0.85);
      this.ps.len[i] = rnd(60, 150);
    }
  }

  focusLines(screenX: number, screenY: number, strength: number, duration: number): void {
    for (const f of this.screenFx.list) {
      if (f.kind === FX.FOCUS) {
        f.x = screenX;
        f.y = screenY;
        f.a = Math.max(f.a * (1 - f.t / f.life), strength);
        f.t = 0;
        f.life = Math.max(0.05, duration);
        return;
      }
    }
    const f = this.screenFx.spawn(FX.FOCUS, FL.SCREEN, screenX, screenY, Math.max(0.05, duration), '#ffffff');
    f.a = Math.max(0, Math.min(1, strength));
  }

  elementalClash(x: number, y: number, a: AspectId, b: AspectId): void {
    const pa = ASPECT_PALETTES[a], pb = ASPECT_PALETTES[b];
    this.elementBurst(x, y, a, 0.8);
    this.elementBurst(x, y, b, 0.8);
    this.ring(x, y, 10, 150, 0.32, 7, mixHex(pa.primary, pb.primary, 0.5));
    this.flash(x, y, 16, 120, 0.1);
    const has = (k: AspectId) => a === k || b === k;
    if (has('inferno') && has('frost')) {
      // Steam explosion.
      for (let k = 0; k < 16; k++) {
        const i = this.ps.emit(PK.SMOKE, LAYER.FRONT, x + rnd(-30, 30), y + rnd(-30, 30), rnd(-200, 200), -rnd(60, 260), rnd(0.8, 1.4), 20, '#e9f2f5', 0.45);
        this.ps.size2[i] = rnd(70, 120);
        this.ps.drag[i] = 2;
      }
    } else if (has('void') && has('radiance')) {
      // Annihilation: black and white rings.
      this.ring(x, y, 10, 260, 0.45, 14, '#ffffff', false);
      const i = this.ps.emit(PK.RING, LAYER.FRONT, x, y, 0, 0, 0.5, 20, '#7a2cff');
      this.ps.size2[i] = 200;
      this.ps.len[i] = 18;
      this.flash(x, y, 30, 240, 0.15);
    } else if (has('tempest')) {
      for (let k = 0; k < 3; k++) {
        const ang = Math.random() * TAU;
        this.lightning(x, y, x + Math.cos(ang) * rnd(80, 160), y + Math.sin(ang) * rnd(80, 160), k % 2 ? pa.primary : pb.primary, 2);
      }
    } else {
      for (let k = 0; k < 14; k++) this.spark(x, y, Math.random() * TAU, rnd(400, 1000), rnd(0.15, 0.3), 2, k % 2 ? pa.secondary : pb.secondary, 700, 3);
    }
  }

  elementBurst(x: number, y: number, aspect: AspectId, power: number): void {
    const P = ASPECT_PALETTES[aspect];
    const p = Math.max(0.2, power);
    const N = (n: number) => Math.round(n * p);
    switch (aspect) {
      case 'inferno':
        for (let k = 0; k < N(12); k++) {
          const a = Math.random() * TAU;
          const i = this.ps.emit(PK.FLAME, LAYER.FRONT, x, y, Math.cos(a) * rnd(100, 400), Math.sin(a) * rnd(100, 300) - 200, rnd(0.25, 0.5), rnd(12, 22), Math.random() < 0.5 ? P.primary : '#ff3a10');
          this.ps.setColor2(i, '#fff1c1');
          this.ps.drag[i] = 2;
        }
        for (let k = 0; k < N(10); k++) {
          const i = this.ps.emit(PK.EMBER, LAYER.FRONT, x, y, rnd(-250, 250), -rnd(100, 400), rnd(0.6, 1.2), rnd(1.5, 3), '#ffb347');
          this.ps.drag[i] = 1.5;
          this.ps.grav[i] = 150;
        }
        break;
      case 'radiance':
        for (let k = 0; k < N(14); k++) {
          const a = Math.random() * TAU;
          const i = this.ps.emit(PK.MOTE, LAYER.FRONT, x, y, Math.cos(a) * rnd(120, 420), Math.sin(a) * rnd(120, 420), rnd(0.4, 0.8), rnd(2, 3.5), Math.random() < 0.5 ? '#ffffff' : P.secondary);
          this.ps.drag[i] = 3;
        }
        for (let k = 0; k < N(8); k++) {
          const a = (k / N(8)) * TAU;
          const i = this.ps.emit(PK.STREAK, LAYER.FRONT, x, y, Math.cos(a) * 700, Math.sin(a) * 700, 0.14, 2, '#ffffff');
          this.ps.len[i] = 60;
          this.ps.drag[i] = 6;
        }
        break;
      case 'verdant':
        for (let k = 0; k < N(12); k++) {
          const a = Math.random() * TAU;
          const i = this.ps.emit(PK.PETAL, LAYER.FRONT, x, y, Math.cos(a) * rnd(100, 350), Math.sin(a) * rnd(100, 300) - 150, rnd(0.8, 1.4), rnd(3.5, 6), Math.random() < 0.7 ? P.primary : '#ffb0d0');
          this.ps.vrot[i] = rnd(-10, 10);
          this.ps.grav[i] = 300;
          this.ps.drag[i] = 2;
          this.ps.flags[i] |= PF.FLUTTER;
        }
        for (let k = 0; k < N(6); k++) {
          const i = this.ps.emit(PK.MOTE, LAYER.FRONT, x, y, rnd(-200, 200), rnd(-300, 50), rnd(0.4, 0.7), 2.5, P.secondary);
          this.ps.drag[i] = 3;
        }
        break;
      case 'frost':
        for (let k = 0; k < N(12); k++) {
          const a = Math.random() * TAU;
          const i = this.ps.emit(PK.SHARD, LAYER.FRONT, x, y, Math.cos(a) * rnd(200, 600), Math.sin(a) * rnd(200, 500) - 100, rnd(0.5, 0.9), rnd(3, 7), Math.random() < 0.5 ? '#ffffff' : P.secondary);
          this.ps.grav[i] = 1200;
          this.ps.vrot[i] = rnd(-12, 12);
        }
        for (let k = 0; k < N(5); k++) {
          const i = this.ps.emit(PK.DUST, LAYER.FRONT, x + rnd(-20, 20), y + rnd(-20, 20), rnd(-60, 60), rnd(-40, 20), rnd(0.6, 1), 16, '#dff6ff', 0.4);
          this.ps.size2[i] = 60;
          this.ps.drag[i] = 2;
        }
        break;
      case 'tempest':
        for (let k = 0; k < N(14); k++) this.spark(x, y, Math.random() * TAU, rnd(500, 1300), rnd(0.08, 0.2), rnd(1.5, 2.5), Math.random() < 0.5 ? '#ffffff' : P.secondary, 0, 4, 0.025);
        for (let k = 0; k < Math.max(1, N(2)); k++) {
          const a = Math.random() * TAU;
          this.lightning(x, y, x + Math.cos(a) * rnd(60, 130), y + Math.sin(a) * rnd(60, 130), P.primary, 1.8);
        }
        break;
      case 'void':
        for (let k = 0; k < N(14); k++) {
          const a = Math.random() * TAU;
          const r = rnd(70, 140);
          const i = this.ps.emit(PK.MOTE, LAYER.FRONT, x + Math.cos(a) * r, y + Math.sin(a) * r, 0, 0, 0.35, rnd(2, 3), Math.random() < 0.3 ? '#ffffff' : P.secondary);
          this.ps.flags[i] |= PF.HOMING;
          this.ps.hx[i] = x;
          this.ps.hy[i] = y;
          this.ps.homing[i] = 3500;
        }
        for (let k = 0; k < N(6); k++) {
          const i = this.ps.emit(PK.WISP, LAYER.FRONT, x + rnd(-20, 20), y + rnd(-20, 20), rnd(-80, 80), -rnd(80, 200), rnd(0.6, 1), 5, '#2a0a44', 0.8);
          this.ps.drag[i] = 1.5;
        }
        break;
      case 'chrono':
        for (let k = 0; k < N(7); k++) {
          const a = Math.random() * TAU;
          const i = this.ps.emit(PK.GLYPH, LAYER.FRONT, x, y, Math.cos(a) * rnd(80, 260), Math.sin(a) * rnd(80, 260), rnd(0.6, 1.1), rnd(5, 10), Math.random() < 0.5 ? '#ffffff' : P.secondary);
          this.ps.shape[i] = Math.random() < 0.6 ? 0 : 1;
          this.ps.vrot[i] = rnd(-4, 4);
          this.ps.drag[i] = 2;
        }
        for (let k = 0; k < N(8); k++) {
          const i = this.ps.emit(PK.MOTE, LAYER.FRONT, x, y, rnd(-250, 250), rnd(-250, 250), rnd(0.4, 0.8), 2.5, P.primary);
          this.ps.drag[i] = 3;
        }
        break;
    }
  }

  guardShatter(x: number, y: number, color: string): void {
    const c = this.fx.spawn(FX.CRACKS, FL.FRONT, x, y, 0.2, color);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU + rnd(-0.2, 0.2);
      const l = rnd(45, 80);
      for (let s = 1; s <= 3; s++) {
        const u = s / 3;
        c.pts.push(x + Math.cos(a + rnd(-0.25, 0.25)) * l * u, y + Math.sin(a + rnd(-0.25, 0.25)) * l * u);
      }
    }
    for (let k = 0; k < 34; k++) {
      const a = Math.random() * TAU;
      const r = rnd(30, 56);
      const i = this.ps.emit(PK.SHARD, LAYER.FRONT, x + Math.cos(a) * r, y + Math.sin(a) * r, Math.cos(a) * rnd(300, 750), Math.sin(a) * rnd(250, 600) - 150, rnd(0.7, 1.2), rnd(4, 9), Math.random() < 0.6 ? color : '#ffffff');
      this.ps.grav[i] = 1300;
      this.ps.vrot[i] = rnd(-14, 14);
      this.ps.flags[i] |= PF.BOUNCE;
    }
    this.flash(x, y, 20, 160, 0.12);
    this.ring(x, y, 40, 170, 0.32, 8, color);
  }

  timeStop(x: number, y: number, color: string, active: boolean): void {
    const f = this.fx.spawn(FX.TSPULSE, FL.FRONT, x, y, active ? 0.55 : 0.4, color);
    f.flag = active ? 1 : 0;
    this.flash(x, y, 30, active ? 260 : 160, 0.14, color);
    this.ts.active = active;
    this.ts.x = x;
    this.ts.y = y;
    this.ts.color = color;
  }

  rewindTrail(x1: number, y1: number, x2: number, y2: number, color: string): void {
    const f = this.fx.spawn(FX.REWIND, FL.FRONT, x1, y1, 0.85, color);
    f.x2 = x2;
    f.y2 = y2;
    for (let k = 0; k < 10; k++) {
      const u = k / 9;
      const i = this.ps.emit(PK.GLYPH, LAYER.FRONT, x1 + (x2 - x1) * u, y1 + (y2 - y1) * u - 60 + rnd(-40, 40), rnd(-30, 30), -rnd(20, 80), rnd(0.6, 1.0), rnd(6, 11), Math.random() < 0.5 ? '#ffffff' : color);
      this.ps.shape[i] = 0;
      this.ps.vrot[i] = -rnd(2, 6);
      this.ps.delay[i] = (1 - u) * 0.25;
    }
  }

  healGlow(x: number, y: number, color: string): void {
    for (let k = 0; k < 16; k++) {
      const i = this.ps.emit(PK.MOTE, LAYER.FRONT, x + rnd(-30, 30), y + rnd(-55, 55), rnd(-30, 30), -rnd(80, 220), rnd(0.6, 1.1), rnd(1.8, 3.2), Math.random() < 0.4 ? '#ffffff' : color);
      this.ps.drag[i] = 0.8;
    }
    for (let k = 0; k < 5; k++) {
      const i = this.ps.emit(PK.GLYPH, LAYER.FRONT, x + rnd(-34, 34), y + rnd(-40, 50), 0, -rnd(60, 140), rnd(0.7, 1.1), rnd(5, 8), color);
      this.ps.shape[i] = 3;
    }
    const r = this.ring(x, y + 55, 10, 70, 0.5, 3, color, false);
    this.ps.alpha[r] = 0.7;
  }

  /* ================================================================== */
  /* Finisher set pieces                                                */
  /* ================================================================== */

  meteorStrike(x: number, y: number, color: string): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    const f = this.fx.spawn(FX.METEOR, FL.MID, x, y, 0.85, color);
    f.a = 0.58;
    f.x2 = x + side * 760;
    f.y2 = y - 1500;
  }

  lightPillar(x: number, color: string, duration: number): void {
    this.fx.spawn(FX.PILLAR, FL.MID, x, 0, Math.max(0.3, duration) + 0.3, color);
    const i = this.flash(x, -40, 40, 300, 0.2, color);
    this.ps.delay[i] = 0.1;
    const r = this.ring(x, -6, 20, 360, 0.5, 10, color);
    this.ps.delay[r] = 0.1;
  }

  singularity(x: number, y: number, color: string, duration: number): void {
    this.fx.spawn(FX.SINGULARITY, FL.MID, x, y, Math.max(0.4, duration), color);
  }

  thorns(x: number, color: string): void {
    const f = this.fx.spawn(FX.THORNS, FL.MID, x, 0, 1.5, color);
    const n = 11;
    for (let i = 0; i < n; i++) {
      const off = ((i / (n - 1)) * 2 - 1) * 140 + rnd(-12, 12);
      const h = 250 + Math.random() * 230 * (1 - Math.abs(off) / 200);
      f.pts.push(off, h, Math.sign(off) * rnd(0.1, 0.7) + rnd(-0.15, 0.15), rnd(12, 24));
    }
    this.flash(x, -60, 30, 220, 0.14, color);
  }

  pyre(x: number, color: string): void {
    const f = this.fx.spawn(FX.PYRE, FL.MID, x, 0, 1.5, color);
    f.color2 = '#ffb347';
    this.flash(x, -80, 40, 260, 0.18, color);
  }

  freezeSolid(x: number, y: number): void {
    this.fx.spawn(FX.FREEZE, FL.FRONT, x, y, 1.5, '#bfefff');
    this.flash(x, y, 20, 160, 0.12, '#cdefff');
    for (let k = 0; k < 16; k++) {
      const a = Math.random() * TAU;
      const i = this.ps.emit(PK.SHARD, LAYER.FRONT, x, y, Math.cos(a) * rnd(150, 450), Math.sin(a) * rnd(150, 400), rnd(0.4, 0.7), rnd(3, 6), '#ffffff');
      this.ps.vrot[i] = rnd(-12, 12);
      this.ps.drag[i] = 3;
    }
  }

  bladesConverge(x: number, y: number, color: string, count: number, converge: boolean): void {
    if (converge) {
      for (const f of this.fx.list) {
        if (f.kind === FX.BLADES && f.b < 0 && Math.abs(f.x - x) < 400) {
          f.b = f.t;
          f.life = f.t + 0.32;
          f.x = x;
          f.y = y;
          return;
        }
      }
      const f = this.fx.spawn(FX.BLADES, FL.MID, x, y, 0.36, color);
      f.n = Math.max(3, count);
      f.b = 0;
      return;
    }
    const f = this.fx.spawn(FX.BLADES, FL.MID, x, y, 3.5, color);
    f.n = Math.max(3, count);
    f.b = -1;
    for (let k = 0; k < count; k++) {
      const a = f.seed + (k / count) * TAU;
      this.flash(x + Math.cos(a) * 175, y + Math.sin(a) * 150, 8, 50, 0.12, color);
    }
  }

  finisherBeam(x: number, y: number, dir: number, color: string, duration: number): void {
    const f = this.fx.spawn(FX.FINBEAM, FL.MID, x, y, Math.max(0.3, duration), color);
    f.a = dir >= 0 ? 1 : -1;
    f.color2 = lighten(color, 0.45);
    this.flash(x, y, 30, 240, 0.16, color);
    impactBurst(this.ps, x + f.a * 30, y, 0.5, color);
  }
}
