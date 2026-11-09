import { VIEW } from '../config.js';
import { clamp, damp } from './math.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.viewH = VIEW.baseHeight;
    this.trauma = 0;
    this.ox = 0;
    this.oy = 0;
    this.ppm = 40;
    this.W = 1280;
    this.H = 720;
    this.t = 0;
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
  }

  snap(x, y) {
    this.x = x;
    this.y = y + 1.5;
    this.viewH = VIEW.baseHeight;
  }

  shake(amount) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  follow(tx, ty, vx, vy, dt, enableShake = true) {
    this.t += dt;
    const speed = Math.hypot(vx, vy);
    const look = clamp(0.32, 0, 1);
    const gx = tx + clamp(vx * look, -6, 6) + (this.offsetX || 0);
    const gy = ty + 1.2 + clamp(vy * 0.18, -3, 3) + (this.offsetY || 0);
    this.x += (gx - this.x) * damp(5, dt);
    this.y += (gy - this.y) * damp(4, dt);
    const wantH = VIEW.baseHeight + Math.min(VIEW.maxExtra, Math.max(0, speed - 6) * VIEW.speedZoom);
    this.viewH += (wantH - this.viewH) * damp(1.5, dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const s = enableShake ? this.trauma * this.trauma : 0;
    this.ox = (Math.sin(this.t * 61) + Math.sin(this.t * 37)) * 0.5 * s * 0.6;
    this.oy = (Math.sin(this.t * 53 + 1) + Math.sin(this.t * 29)) * 0.5 * s * 0.6;
    this.ppm = this.H / this.viewH;
  }

  get cx() {
    return this.x + this.ox;
  }

  get cy() {
    return this.y + this.oy;
  }

  view() {
    const hw = this.W / this.ppm / 2;
    const hh = this.H / this.ppm / 2;
    return { x0: this.cx - hw, x1: this.cx + hw, y0: this.cy - hh, y1: this.cy + hh };
  }

  /** Set ctx to world transform (metres, y-up). */
  apply(ctx) {
    const k = this.ppm;
    ctx.setTransform(k, 0, 0, -k, this.W / 2 - this.cx * k, this.H / 2 + this.cy * k);
  }

  toScreen(x, y) {
    return { x: (x - this.cx) * this.ppm + this.W / 2, y: this.H / 2 - (y - this.cy) * this.ppm };
  }
}
