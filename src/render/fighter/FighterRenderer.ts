import { ASPECT_PALETTES, mixHex, rgba, type AspectPalette } from '../../core/ids';
import { clamp } from '../../core/math';
import type { Fighter } from '../../sim/fighter';
import type { Simulation } from '../../sim/simulation';
import type { WeaponId } from '../../sim/types';
import type { Animator } from './Animator';
import type { Joints } from './skeleton';

/**
 * Draws a godlike stick figure from an Animator: dark ink silhouette with an aspect-coloured
 * rim glow (bloom picks it up), glowing eyes with motion trails, weapon-specific geometry,
 * smear arcs during strikes, afterimages, flowing accessory, and status overlays.
 */
export class FighterRenderer {
  readonly pal: AspectPalette;
  readonly weapon: WeaponId;
  private body = '#08080d';
  private rearBody = '#141420';

  constructor(f: Fighter, readonly anim: Animator) {
    this.pal = ASPECT_PALETTES[f.def.aspect];
    this.weapon = f.def.weapon;
  }

  drawShadow(ctx: CanvasRenderingContext2D, f: Fighter): void {
    const a = this.anim;
    if (a.opacity <= 0.02 || f.state === 'dead') return;
    const s = a.shadow;
    ctx.save();
    ctx.globalAlpha = 0.45 * s * a.opacity;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(a.joints.hip[0], 1, 34 * (0.6 + s * 0.4), 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Afterimages and weapon smears (drawn before the body so the body reads on top). */
  drawGhosts(ctx: CanvasRenderingContext2D): void {
    const a = this.anim;
    if (!a.ghosts.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const g of a.ghosts) {
      const k = 1 - g.age / g.life;
      ctx.globalAlpha = g.alpha * k * k * a.opacity;
      ctx.strokeStyle = this.pal.primary;
      ctx.lineWidth = 7 * (0.7 + 0.3 * k);
      this.strokeSkeleton(ctx, g.joints, true);
      ctx.fillStyle = this.pal.primary;
      ctx.beginPath();
      ctx.arc(g.joints.head[0], g.joints.head[1], 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D, f: Fighter, sim: Simulation, time: number): void {
    const a = this.anim;
    if (a.opacity <= 0.01) return;
    const j = a.joints;
    const pal = this.pal;
    const frozen = f.timeFrozen;
    const flash = sim.tick - f.lastHitTick < 3 && f.state !== 'dead';
    const ascended = f.hasBuff('ascended');
    const lastStand = f.hasBuff('lastStand');
    const wrathFull = f.wrath >= 100;
    let rim = pal.primary;
    if (frozen) rim = '#9fb2c8';
    else if (lastStand) rim = mixHex(pal.primary, '#ff3030', 0.45);
    else if (f.hasBuff('chill')) rim = mixHex(pal.primary, '#9fefff', 0.5);
    else if (f.hasBuff('burn')) rim = mixHex(pal.primary, '#ff7a20', 0.4);

    ctx.save();
    ctx.globalAlpha = a.opacity;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Accessory behind the body.
    this.drawAccessory(ctx, f, rim, ascended, time);

    // ---- Rim glow pass (additive).
    const glowW = ascended ? 17 : wrathFull ? 13.5 : 11.5;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(rim, (ascended ? 0.6 : 0.36) * a.opacity);
    ctx.lineWidth = glowW;
    this.strokeSkeleton(ctx, j, true);
    ctx.fillStyle = rgba(rim, (ascended ? 0.5 : 0.3) * a.opacity);
    ctx.beginPath();
    ctx.arc(j.head[0], j.head[1], 10 + glowW * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // ---- Rear limbs (slightly lighter ink for depth).
    const ink = flash ? '#ffffff' : frozen ? '#3a4352' : this.body;
    const rearInk = flash ? '#f2f2f2' : frozen ? '#4a5466' : this.rearBody;
    ctx.lineWidth = 6.2;
    ctx.strokeStyle = rearInk;
    this.limb(ctx, j.shoulder, j.elbow2, j.hand2);
    this.limb(ctx, j.hip, j.knee2, j.foot2);

    // Second weapon (dual) / off-hand weapon parts.
    if (this.weapon === 'daggers') this.drawWeapon(ctx, f, 2, rim, flash, frozen);
    if (this.weapon === 'gauntlets') this.drawFist(ctx, j.hand2, j.fore2Angle, rim, flash, f, 0.85);

    // ---- Torso + head.
    ctx.strokeStyle = ink;
    ctx.lineWidth = 6.8;
    ctx.beginPath();
    ctx.moveTo(j.hip[0], j.hip[1]);
    ctx.lineTo(j.neck[0], j.neck[1]);
    ctx.stroke();
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(j.neck[0], j.neck[1]);
    ctx.lineTo(j.head[0] - j.spineDirX * 8, j.head[1] - j.spineDirY * 8);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(j.head[0], j.head[1], 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = a.opacity * 0.9;
    ctx.stroke();
    ctx.globalAlpha = a.opacity;

    // Halo / horns sit on the head.
    if (f.def.accessory === 'halo') this.drawHalo(ctx, j, rim, time);
    if (f.def.accessory === 'horns') this.drawHorns(ctx, j, ink, rim, f.facing);

    // ---- Front limbs.
    ctx.strokeStyle = ink;
    ctx.lineWidth = 6.4;
    this.limb(ctx, j.hip, j.knee1, j.foot1);
    this.limb(ctx, j.shoulder, j.elbow1, j.hand1);

    // ---- Main weapon.
    if (this.weapon === 'gauntlets') this.drawFist(ctx, j.hand1, j.fore1Angle, rim, flash, f, 1);
    else this.drawWeapon(ctx, f, 1, rim, flash, frozen);

    // ---- Weapon smear trails.
    this.drawTrail(ctx, a.trail, rim);
    if (this.weapon === 'daggers') this.drawTrail(ctx, a.trail2, rim);

    // ---- Eyes.
    this.drawEyes(ctx, f, rim, wrathFull || ascended || lastStand, frozen);

    ctx.restore();

    // ---- Status overlays.
    this.drawStatus(ctx, f, sim, time);
  }

  /* ------------------------------------------------------------------ */

  private strokeSkeleton(ctx: CanvasRenderingContext2D, j: Joints, withHeadNeck: boolean): void {
    ctx.beginPath();
    ctx.moveTo(j.foot2[0], j.foot2[1]);
    ctx.lineTo(j.knee2[0], j.knee2[1]);
    ctx.lineTo(j.hip[0], j.hip[1]);
    ctx.lineTo(j.knee1[0], j.knee1[1]);
    ctx.lineTo(j.foot1[0], j.foot1[1]);
    ctx.moveTo(j.hip[0], j.hip[1]);
    ctx.lineTo(j.neck[0], j.neck[1]);
    if (withHeadNeck) ctx.lineTo(j.head[0] - j.spineDirX * 8, j.head[1] - j.spineDirY * 8);
    ctx.moveTo(j.hand2[0], j.hand2[1]);
    ctx.lineTo(j.elbow2[0], j.elbow2[1]);
    ctx.lineTo(j.shoulder[0], j.shoulder[1]);
    ctx.lineTo(j.elbow1[0], j.elbow1[1]);
    ctx.lineTo(j.hand1[0], j.hand1[1]);
    ctx.stroke();
  }

  private limb(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], c: [number, number]): void {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.stroke();
  }

  private drawEyes(ctx: CanvasRenderingContext2D, f: Fighter, rim: string, blazing: boolean, frozen: boolean): void {
    const a = this.anim;
    const j = a.joints;
    const fx = f.facing;
    // Eye direction: perpendicular to the spine, toward facing.
    const sx = j.spineDirX, sy = j.spineDirY;
    // Forward = perpendicular to the spine on the facing side.
    const fwdX = fx > 0 ? -sy : sy;
    const fwdY = fx > 0 ? sx : -sx;
    const cx = j.head[0] + fwdX * 4.5 - sx * 1.5;
    const cy = j.head[1] + fwdY * 4.5 - sy * 1.5;
    const col = frozen ? '#c9d6e6' : this.pal.core;
    const blind = f.hasBuff('blind');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Eye trail when moving fast or blazing.
    if (blazing && a.eyeTrail.length > 1 && !frozen) {
      ctx.lineCap = 'round';
      for (let i = 1; i < a.eyeTrail.length; i++) {
        const p0 = a.eyeTrail[i - 1], p1 = a.eyeTrail[i];
        const k = 1 - p1.age / 0.16;
        ctx.strokeStyle = rgba(rim, 0.7 * k);
        ctx.lineWidth = 3.4 * k;
        ctx.beginPath();
        ctx.moveTo(p0.x + fwdX * 4.5, p0.y + fwdY * 4.5);
        ctx.lineTo(p1.x + fwdX * 4.5, p1.y + fwdY * 4.5);
        ctx.stroke();
      }
    }
    if (!blind) {
      ctx.strokeStyle = col;
      ctx.lineWidth = blazing ? 2.6 : 2;
      ctx.beginPath();
      ctx.moveTo(cx - fwdX * 1.5, cy - fwdY * 1.5 - 1);
      ctx.lineTo(cx + fwdX * 3.2, cy + fwdY * 3.2 - 1.5);
      ctx.stroke();
      ctx.fillStyle = rgba(rim, blazing ? 0.6 : 0.3);
      ctx.beginPath();
      ctx.arc(cx, cy - 1, blazing ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (blind) {
      ctx.save();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(j.head[0] - 9, j.head[1] - 1);
      ctx.lineTo(j.head[0] + 9, j.head[1] - 1);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawHalo(ctx: CanvasRenderingContext2D, j: Joints, rim: string, time: number): void {
    const hx = j.head[0] - j.spineDirX * -16, hy = j.head[1] + j.spineDirY * 16;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(this.pal.core, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(hx, hy - 2 + Math.sin(time * 2) * 1.2, 11, 3.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgba(rim, 0.45);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  }

  private drawHorns(ctx: CanvasRenderingContext2D, j: Joints, ink: string, rim: string, facing: number): void {
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    for (const s of [-1, 1]) {
      const bx = j.head[0] + s * 5, by = j.head[1] - 7;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + s * 8 - facing * 3, by - 10, bx + s * 4 - facing * 9, by - 15);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(rim, 0.5);
    ctx.lineWidth = 1.2;
    for (const s of [-1, 1]) {
      const bx = j.head[0] + s * 5, by = j.head[1] - 7;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + s * 8 - facing * 3, by - 10, bx + s * 4 - facing * 9, by - 15);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawAccessory(ctx: CanvasRenderingContext2D, f: Fighter, rim: string, ascended: boolean, time: number): void {
    const a = this.anim;
    const ch = a.chain;
    if (ch.length < 2) return;
    const acc = f.def.accessory;
    const color = acc === 'scarf' || acc === 'cape' || acc === 'headband' ? this.pal.primary : '#0b0b12';
    const baseW = acc === 'cape' ? 13 : acc === 'scarf' ? 6.5 : acc === 'longhair' ? 7 : acc === 'headband' ? 3 : 5;
    ctx.save();
    // Ribbon: tapered quads.
    for (let i = 1; i < ch.length; i++) {
      const p0 = ch[i - 1], p1 = ch[i];
      const k = 1 - i / ch.length;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.2, baseW * (acc === 'cape' ? 0.6 + k * 0.6 : 0.35 + k * 0.75));
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    // Glow along coloured accessories.
    if (color !== '#0b0b12' || ascended) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(rim, ascended ? 0.5 : 0.28);
      ctx.lineWidth = baseW * 1.6;
      ctx.beginPath();
      ctx.moveTo(ch[0].x, ch[0].y);
      for (let i = 1; i < ch.length; i++) ctx.lineTo(ch[i].x, ch[i].y);
      ctx.stroke();
    }
    if (acc === 'headband' && ch.length > 2) {
      // Second tail.
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(ch[0].x, ch[0].y);
      for (let i = 1; i < ch.length; i++) ctx.lineTo(ch[i].x + 2, ch[i].y + i * 1.5 + Math.sin(time * 9 + i) * 1.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawWeapon(ctx: CanvasRenderingContext2D, f: Fighter, which: 1 | 2, rim: string, flash: boolean, frozen: boolean): void {
    const a = this.anim;
    const j = a.joints;
    const h = which === 1 ? j.hand1 : j.hand2;
    const ang = which === 1 ? j.wpnAngle : j.wpn2Angle;
    const L = a.weaponLength;
    const cx = Math.cos(ang), sy = Math.sin(ang);
    const nx = -sy, ny = cx; // normal
    const steel = flash ? '#ffffff' : frozen ? '#aab4c4' : '#dfe3ee';
    const dark = '#1a1b24';
    const empowered = f.hasBuff('empowered') || f.hasBuff('ascended') || f.hasBuff('counter');
    const glowA = empowered ? 0.75 : 0.42;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    switch (this.weapon) {
      case 'katana': {
        const back = 13;
        const bx = h[0] - cx * back, by = h[1] - sy * back;
        const tx = h[0] + cx * (L - back), ty = h[1] + sy * (L - back);
        const curve = 5 * (f.facing > 0 ? 1 : -1);
        const mx = (h[0] + tx) / 2 + nx * curve, my = (h[1] + ty) / 2 + ny * curve;
        this.glowLine(ctx, h[0], h[1], tx, ty, mx, my, rim, glowA, 7);
        ctx.strokeStyle = dark;
        ctx.lineWidth = 3.6;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(h[0], h[1]);
        ctx.stroke();
        ctx.strokeStyle = steel;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(h[0], h[1]);
        ctx.quadraticCurveTo(mx, my, tx, ty);
        ctx.stroke();
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(h[0] + nx * 4.5, h[1] + ny * 4.5);
        ctx.lineTo(h[0] - nx * 4.5, h[1] - ny * 4.5);
        ctx.stroke();
        break;
      }
      case 'greatsword': {
        const back = 15;
        const bx = h[0] - cx * back, by = h[1] - sy * back;
        const gx = h[0] + cx * 3, gy = h[1] + sy * 3;
        const tx = h[0] + cx * (L - back), ty = h[1] + sy * (L - back);
        this.glowLine(ctx, gx, gy, tx, ty, null, null, rim, glowA, 14);
        ctx.fillStyle = steel;
        ctx.beginPath();
        ctx.moveTo(gx + nx * 5.5, gy + ny * 5.5);
        ctx.lineTo(tx - cx * 14 + nx * 4, ty - sy * 14 + ny * 4);
        ctx.lineTo(tx, ty);
        ctx.lineTo(tx - cx * 14 - nx * 4, ty - sy * 14 - ny * 4);
        ctx.lineTo(gx - nx * 5.5, gy - ny * 5.5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = dark;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(tx - cx * 18, ty - sy * 18);
        ctx.stroke();
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(gx, gy);
        ctx.moveTo(gx + nx * 11, gy + ny * 11);
        ctx.lineTo(gx - nx * 11, gy - ny * 11);
        ctx.stroke();
        break;
      }
      case 'spear': case 'staff': {
        const back = L * 0.35;
        const bx = h[0] - cx * back, by = h[1] - sy * back;
        const tx = h[0] + cx * (L - back), ty = h[1] + sy * (L - back);
        this.glowLine(ctx, bx, by, tx, ty, null, null, rim, glowA * 0.6, 6);
        ctx.strokeStyle = this.weapon === 'staff' ? '#2a2230' : '#3a3440';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        if (this.weapon === 'spear') {
          ctx.fillStyle = steel;
          ctx.beginPath();
          ctx.moveTo(tx + cx * 18, ty + sy * 18);
          ctx.lineTo(tx + nx * 5, ty + ny * 5);
          ctx.lineTo(tx - cx * 4, ty - sy * 4);
          ctx.lineTo(tx - nx * 5, ty - ny * 5);
          ctx.closePath();
          ctx.fill();
          this.glowLine(ctx, tx, ty, tx + cx * 18, ty + sy * 18, null, null, rim, glowA, 8);
        } else {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (const [ex, ey] of [[tx, ty], [bx, by]]) {
            ctx.fillStyle = rgba(rim, 0.5 + (empowered ? 0.3 : 0));
            ctx.beginPath();
            ctx.arc(ex, ey, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = rgba(this.pal.core, 0.9);
            ctx.beginPath();
            ctx.arc(ex, ey, 3, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
        break;
      }
      case 'scythe': {
        const back = L * 0.3;
        const bx = h[0] - cx * back, by = h[1] - sy * back;
        const tx = h[0] + cx * (L - back), ty = h[1] + sy * (L - back);
        ctx.strokeStyle = '#2b2430';
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        // Blade: sweeping crescent from the top, curving back toward the wielder.
        const side = f.facing > 0 ? 1 : -1;
        const px = -nx * side, py = -ny * side;
        const ex = tx + px * 44 - cx * 18, ey = ty + py * 44 - sy * 18;
        const c1x = tx + px * 30 + cx * 14, c1y = ty + py * 30 + sy * 14;
        this.glowLine(ctx, tx, ty, ex, ey, c1x, c1y, rim, glowA, 10);
        ctx.fillStyle = steel;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(c1x, c1y, ex, ey);
        ctx.quadraticCurveTo(tx + px * 22 - cx * 2, ty + py * 22 - sy * 2, tx - cx * 6, ty - sy * 6);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'daggers': {
        const tx = h[0] + cx * L, ty = h[1] + sy * L;
        this.glowLine(ctx, h[0], h[1], tx, ty, null, null, rim, glowA, 6);
        ctx.strokeStyle = steel;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(h[0] + cx * 3, h[1] + sy * 3);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(h[0] + nx * 3.5, h[1] + ny * 3.5);
        ctx.lineTo(h[0] - nx * 3.5, h[1] - ny * 3.5);
        ctx.stroke();
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }

  private glowLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, cx: number | null, cy: number | null, color: string, alpha: number, width: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    if (cx !== null && cy !== null) ctx.quadraticCurveTo(cx, cy, x1, y1);
    else ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  private drawFist(ctx: CanvasRenderingContext2D, h: [number, number], foreAngle: number, rim: string, flash: boolean, f: Fighter, scale: number): void {
    const r = 6.5 * scale;
    const x = h[0] + Math.cos(foreAngle) * 3, y = h[1] + Math.sin(foreAngle) * 3;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const empowered = f.hasBuff('empowered') || f.hasBuff('ascended');
    ctx.fillStyle = rgba(rim, empowered ? 0.7 : 0.45);
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = flash ? '#fff' : '#121218';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = this.pal.secondary;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Knuckle spikes.
    ctx.strokeStyle = this.pal.core;
    ctx.lineWidth = 1.4;
    for (let i = -1; i <= 1; i++) {
      const a = foreAngle + i * 0.6;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(a) * (r + 3.5), y + Math.sin(a) * (r + 3.5));
      ctx.stroke();
    }
  }

  private drawTrail(ctx: CanvasRenderingContext2D, trail: Animator['trail'], rim: string): void {
    if (trail.length < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < trail.length; i++) {
      const p0 = trail[i - 1], p1 = trail[i];
      const k = clamp(1 - p1.age / 0.11, 0, 1);
      if (k <= 0) continue;
      ctx.fillStyle = rgba(rim, 0.55 * k * k);
      ctx.beginPath();
      ctx.moveTo(p0.bx, p0.by);
      ctx.lineTo(p0.tx, p0.ty);
      ctx.lineTo(p1.tx, p1.ty);
      ctx.lineTo(p1.bx, p1.by);
      ctx.closePath();
      ctx.fill();
    }
    // Bright cutting edge.
    ctx.strokeStyle = rgba(this.pal.core, 0.85);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    let started = false;
    for (const p of trail) {
      if (p.age > 0.07) continue;
      if (!started) {
        ctx.moveTo(p.tx, p.ty);
        started = true;
      } else ctx.lineTo(p.tx, p.ty);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawStatus(ctx: CanvasRenderingContext2D, f: Fighter, sim: Simulation, time: number): void {
    const a = this.anim;
    const j = a.joints;
    const pal = this.pal;
    const cx = j.hip[0], cy = j.hip[1] - 12;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const shield = f.buff('shield');
    if (shield) {
      const k = clamp(shield.v / 190, 0, 1);
      const r = 92;
      const g = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r);
      g.addColorStop(0, rgba(pal.primary, 0));
      g.addColorStop(0.85, rgba(pal.primary, 0.12 + 0.1 * k));
      g.addColorStop(1, rgba(pal.secondary, 0.5 + 0.2 * k));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(pal.core, 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, time * 2, time * 2 + 1.2);
      ctx.stroke();
      // Hex shimmer.
      ctx.strokeStyle = rgba(pal.secondary, 0.18);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + time * 0.4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r * 0.3, cy + Math.sin(ang) * r * 0.3);
        ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
        ctx.stroke();
      }
    }
    if (f.hasBuff('reflect')) {
      const mx = cx + f.facing * 46;
      const flick = 0.6 + Math.sin(time * 40) * 0.15;
      ctx.strokeStyle = rgba(pal.core, 0.8 * flick);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const px = mx + Math.cos(ang) * 22, py = cy - 30 + Math.sin(ang) * 62;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = rgba(pal.secondary, 0.14 * flick);
      ctx.fill();
    }
    if (f.hasBuff('counter')) {
      ctx.strokeStyle = rgba(pal.core, 0.35 + Math.sin(time * 12) * 0.15);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(j.hip[0], 0, 70, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (f.state === 'bound') {
      const other = sim.opponentOf(f);
      const col = ASPECT_PALETTES[other.def.aspect].primary;
      ctx.strokeStyle = rgba(col, 0.85);
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      for (const [yy, rx] of [[j.hip[1] - 30, 24], [j.hip[1] + 10, 18], [j.hip[1] - 55, 22]] as [number, number][]) {
        ctx.beginPath();
        ctx.ellipse(j.hip[0], yy, rx, 6, 0.15, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (f.timeFrozen) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(200,215,235,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy - 20, 70, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
