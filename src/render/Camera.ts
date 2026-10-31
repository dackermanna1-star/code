import { clamp, lerp, noise1, springStep, type Spring } from '../core/math';
import type { CameraView } from './types';

/**
 * Cinematic 2D camera.
 *
 * - Critically damped springs for position / zoom / rotation (smooth, never overshoots).
 * - Trauma-based shake (perlin noise, intensity = trauma^2) with directional kick support.
 * - "Punch" zoom impulses for impacts.
 * - All values are in world units except shake (screen px).
 */
export class Camera implements CameraView {
  x = 0;
  y = -220;
  zoom = 1;
  rotation = 0;
  width = 1280;
  height = 720;
  shakeX = 0;
  shakeY = 0;

  /** Resolution scale: screen px per world unit at camZoom = 1. */
  baseScale = 1;
  /** Logical zoom (1 = ~1280 world units across a 16:9 view). */
  camZoom = 1;

  // Targets driven by the director.
  targetX = 0;
  targetY = -220;
  targetZoom = 1;
  targetRotation = 0;
  /** Spring stiffness (higher = snappier). */
  posOmega = 5;
  zoomOmega = 4;
  rotOmega = 6;

  private sx: Spring = { value: 0, velocity: 0 };
  private sy: Spring = { value: -220, velocity: 0 };
  private sz: Spring = { value: 1, velocity: 0 };
  private sr: Spring = { value: 0, velocity: 0 };

  private trauma = 0;
  private shakeTime = 0;
  private kickX = 0;
  private kickY = 0;
  private punch = 0;
  private punchVel = 0;

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.baseScale = h / 720;
    this.zoom = this.baseScale * this.camZoom;
  }

  /** Teleport the camera (no smoothing). */
  snap(x: number, y: number, zoom: number): void {
    this.targetX = this.sx.value = this.x = x;
    this.targetY = this.sy.value = this.y = y;
    this.targetZoom = this.sz.value = this.camZoom = zoom;
    this.sx.velocity = this.sy.velocity = this.sz.velocity = 0;
    this.zoom = this.baseScale * this.camZoom;
  }

  /** Add shake trauma (0..1). Shake magnitude grows with trauma squared. */
  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** Directional kick in screen px (e.g. recoil away from an impact). */
  kick(dx: number, dy: number): void {
    this.kickX += dx;
    this.kickY += dy;
  }

  /** Quick zoom-in impulse; amount ~0.05 (subtle) .. 0.3 (huge). */
  punchZoom(amount: number): void {
    this.punchVel += amount * 30;
  }

  update(dt: number): void {
    springStep(this.sx, this.targetX, this.posOmega, dt);
    springStep(this.sy, this.targetY, this.posOmega, dt);
    springStep(this.sz, this.targetZoom, this.zoomOmega, dt);
    springStep(this.sr, this.targetRotation, this.rotOmega, dt);

    // Punch zoom: damped spring back to 0.
    const k = 220, c = 22;
    this.punchVel += (-k * this.punch - c * this.punchVel) * dt;
    this.punch += this.punchVel * dt;

    this.shakeTime += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const t2 = this.trauma * this.trauma;
    const maxShake = 28 * this.baseScale;
    const nx = noise1(this.shakeTime * 32, 3);
    const ny = noise1(this.shakeTime * 32, 11);
    const nr = noise1(this.shakeTime * 24, 23);
    this.kickX = lerp(this.kickX, 0, 1 - Math.exp(-14 * dt));
    this.kickY = lerp(this.kickY, 0, 1 - Math.exp(-14 * dt));
    this.shakeX = nx * maxShake * t2 + this.kickX * this.baseScale;
    this.shakeY = ny * maxShake * t2 + this.kickY * this.baseScale;

    this.x = this.sx.value;
    this.y = this.sy.value;
    this.camZoom = Math.max(0.2, this.sz.value * (1 + this.punch));
    this.rotation = this.sr.value + nr * 0.02 * t2;
    this.zoom = this.baseScale * this.camZoom;
  }

  /** Effective scale for a parallax layer. */
  private layerScale(parallax: number): number {
    return this.baseScale * lerp(1, this.camZoom, parallax);
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const s = this.zoom;
    const dx = (wx - this.x) * s;
    const dy = (wy - this.y) * s;
    const c = Math.cos(this.rotation), sn = Math.sin(this.rotation);
    return {
      x: this.width / 2 + this.shakeX + dx * c - dy * sn,
      y: this.height / 2 + this.shakeY + dx * sn + dy * c,
    };
  }

  screenToWorld(px: number, py: number): { x: number; y: number } {
    const s = this.zoom;
    const dx = px - this.width / 2 - this.shakeX;
    const dy = py - this.height / 2 - this.shakeY;
    const c = Math.cos(-this.rotation), sn = Math.sin(-this.rotation);
    return { x: this.x + (dx * c - dy * sn) / s, y: this.y + (dx * sn + dy * c) / s };
  }

  applyTransform(ctx: CanvasRenderingContext2D, parallax = 1): void {
    const s = this.layerScale(parallax);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(this.width / 2 + this.shakeX * parallax, this.height / 2 + this.shakeY * parallax);
    if (this.rotation !== 0) ctx.rotate(this.rotation * parallax);
    ctx.scale(s, s);
    ctx.translate(-this.x * parallax, -this.y * parallax);
  }

  visibleWorldRect(parallax = 1): { left: number; right: number; top: number; bottom: number } {
    const s = this.layerScale(parallax);
    // Pad generously to cover rotation + shake.
    const halfW = (this.width / 2) / s * 1.25 + 60;
    const halfH = (this.height / 2) / s * 1.25 + 60;
    const cx = this.x * parallax, cy = this.y * parallax;
    return { left: cx - halfW, right: cx + halfW, top: cy - halfH, bottom: cy + halfH };
  }
}
