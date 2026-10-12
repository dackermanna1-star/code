// Pooled low-resolution particles (blood, sparks, smoke, dust, debris,
// casings). Simulated at the 35 Hz tic rate with collision against floors,
// ceilings and walls, rendered as palette-coloured squares that shade
// through COLORMAP like everything else.

import { SPR_FULLBRIGHT, SPR_DITHER, SPR_ROUND } from '../render/renderer.js';

export const P_GRAVITY = 1;
export const P_BOUNCE = 2;
export const P_FULLBRIGHT = 4;
export const P_FADE = 8;
export const P_SMOKE = 16;
export const P_BLOOD = 32;
export const P_STICK = 64;
export const P_CASING = 128;
export const P_NOCOLLIDE = 256;
export const P_FLOATY = 512;

const FIELDS = ['x', 'y', 'z', 'px', 'py', 'pz', 'vx', 'vy', 'vz', 'life', 'max', 'size', 'grow', 'light'];

export class Particles {
  constructor(capacity) {
    this.cap = capacity;
    for (const f of FIELDS) this[f] = new Float32Array(capacity);
    this.color = new Uint8Array(capacity);
    this.color2 = new Uint8Array(capacity);
    this.flags = new Uint16Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.bounces = new Uint8Array(capacity);
    this.count = 0;
    this.cursor = 0;
    this.onLand = null;
    this.onWall = null;
  }

  resize(capacity) {
    if (capacity === this.cap) return;
    const old = this;
    const n = Math.min(old.count, capacity);
    const next = new Particles(capacity);
    for (const f of [...FIELDS, 'color', 'color2', 'flags', 'kind', 'bounces']) next[f].set(old[f].subarray(0, n));
    Object.assign(this, next, { onLand: old.onLand, onWall: old.onWall });
    this.count = n;
  }

  spawn(x, y, z, vx, vy, vz, life, color, size, flags, opts = {}) {
    let i;
    if (this.count < this.cap) i = this.count++;
    else { i = this.cursor; this.cursor = (this.cursor + 1) % this.cap; }
    this.x[i] = this.px[i] = x;
    this.y[i] = this.py[i] = y;
    this.z[i] = this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = this.max[i] = life;
    this.color[i] = color;
    this.color2[i] = opts.color2 ?? color;
    this.size[i] = size;
    this.grow[i] = opts.grow || 0;
    this.flags[i] = flags;
    this.kind[i] = opts.kind || 0;
    this.bounces[i] = 0;
    this.light[i] = opts.light ?? -1;
    return i;
  }

  kill(i) {
    const last = --this.count;
    if (i !== last) {
      for (const f of FIELDS) this[f][i] = this[f][last];
      this.color[i] = this.color[last];
      this.color2[i] = this.color2[last];
      this.flags[i] = this.flags[last];
      this.kind[i] = this.kind[last];
      this.bounces[i] = this.bounces[last];
    }
  }

  tick(w, collide) {
    for (let i = this.count - 1; i >= 0; i--) {
      this.px[i] = this.x[i]; this.py[i] = this.y[i]; this.pz[i] = this.z[i];
      if (--this.life[i] <= 0) { this.kill(i); continue; }
      const f = this.flags[i];
      if (f & P_GRAVITY) this.vz[i] -= (f & P_FLOATY) ? 0.25 : (f & P_CASING ? 0.9 : 0.7);
      if (f & P_SMOKE) {
        this.vz[i] = this.vz[i] * 0.9 + 0.12;
        this.vx[i] *= 0.92; this.vy[i] *= 0.92;
      }
      if (f & P_FLOATY) { this.vx[i] *= 0.95; this.vy[i] *= 0.95; }
      this.size[i] += this.grow[i];
      let nx = this.x[i] + this.vx[i];
      let ny = this.y[i] + this.vy[i];
      let nz = this.z[i] + this.vz[i];
      if (!(f & P_NOCOLLIDE)) {
        const res = collide(this.x[i], this.y[i], nx, ny, nz);
        this.light[i] = res.light;
        if (res.wall) {
          if (this.onWall && this.onWall(i, res)) { this.kill(i); continue; }
          if (f & P_BOUNCE) {
            const nxn = res.nx, nyn = res.ny;
            const d = this.vx[i] * nxn + this.vy[i] * nyn;
            this.vx[i] = (this.vx[i] - 2 * d * nxn) * 0.45;
            this.vy[i] = (this.vy[i] - 2 * d * nyn) * 0.45;
            nx = this.x[i]; ny = this.y[i];
          } else if (f & P_SMOKE) {
            this.vx[i] = 0; this.vy[i] = 0; nx = this.x[i]; ny = this.y[i];
          } else { this.kill(i); continue; }
        }
        if (nz <= res.floor) {
          nz = res.floor;
          if (this.onLand && (f & (P_BLOOD | P_CASING)) && this.onLand(i, res)) { this.kill(i); continue; }
          if (f & P_BOUNCE && Math.abs(this.vz[i]) > 1.2 && this.bounces[i] < 4) {
            this.vz[i] = -this.vz[i] * (f & P_CASING ? 0.38 : 0.3);
            this.vx[i] *= 0.6; this.vy[i] *= 0.6;
            this.bounces[i]++;
          } else {
            this.vz[i] = 0;
            this.vx[i] *= 0.5; this.vy[i] *= 0.5;
            if (!(f & (P_CASING | P_SMOKE))) {
              if (this.life[i] > 20) this.life[i] = 20;
            }
          }
        } else if (nz >= res.ceil - 1) {
          nz = res.ceil - 1;
          if (this.vz[i] > 0) this.vz[i] = (f & P_SMOKE) ? 0 : -this.vz[i] * 0.2;
        }
      }
      this.x[i] = nx; this.y[i] = ny; this.z[i] = nz;
    }
  }

  render(r, frac, lightAt) {
    for (let i = 0; i < this.count; i++) {
      const f = this.flags[i];
      const x = this.px[i] + (this.x[i] - this.px[i]) * frac;
      const y = this.py[i] + (this.y[i] - this.py[i]) * frac;
      const z = this.pz[i] + (this.z[i] - this.pz[i]) * frac;
      const t = this.life[i] / this.max[i];
      const color = t > 0.5 ? this.color[i] : this.color2[i];
      let flags = 0;
      let alpha = 1;
      if (f & P_FULLBRIGHT) flags |= SPR_FULLBRIGHT;
      if (f & P_FADE) { flags |= SPR_DITHER; alpha = Math.min(1, t * 1.6); }
      if (f & P_SMOKE) { flags |= SPR_DITHER | SPR_ROUND; alpha = Math.min(0.55, t * 0.9); }
      else if (this.size[i] > 1.9) flags |= SPR_ROUND;
      const light = this.light[i] >= 0 ? this.light[i] : (this.light[i] = lightAt(x, y));
      r.addParticle(x, y, z, this.size[i], color, light, flags, alpha);
    }
  }
}
