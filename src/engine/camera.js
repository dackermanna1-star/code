// 2D side-view fighting game camera with trauma-based shake, recoil kicks,
// zoom pulses and scripted cinematic overrides.
//
// World space: x right, y UP (y = 0 is the ground). Screen space: 640x360, y down.
//   screenX = (worldX - cam.x) * cam.zoom + W/2 + shakeX
//   screenY = (cam.y - worldY) * cam.zoom + H/2 + shakeY
// With the default cam.y = 142 and zoom = 1 the ground line sits at screen y = 322.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U;
  const W = JJK.W, H = JJK.H;

  JJK.CAM_BASE_Y = 142;

  class Camera {
    constructor() {
      this.x = 0;
      this.y = JJK.CAM_BASE_Y;
      this.zoom = 1;
      this.rot = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      this.trauma = 0;
      this.kx = 0; this.ky = 0; // recoil offset
      this.kvx = 0; this.kvy = 0;
      this.pulse = 0; // zoom pulse
      this.pulseV = 0;
      this.override = null; // {x, y, zoom, k(0..1 blend)}
      this.ovBlend = 0;
      this.t = 0;
      this.ez = 1;
      this.limit = JJK.STAGE_HALF - W / 2;
    }
    reset() {
      this.x = 0; this.y = JJK.CAM_BASE_Y; this.zoom = 1; this.trauma = 0;
      this.kx = this.ky = this.kvx = this.kvy = 0; this.pulse = this.pulseV = 0;
      this.override = null; this.ovBlend = 0; this.rot = 0; this.ez = 1;
    }
    // ez = effective zoom (zoom including the transient pulse)
    sx(wx) { return (wx - this.x) * this.ez + W / 2 + this.shakeX; }
    sy(wy) { return (this.y - wy) * this.ez + H / 2 + this.shakeY; }
    toScreen(wx, wy) { return [this.sx(wx), this.sy(wy)]; }
    toWorld(sx, sy) {
      return [(sx - W / 2 - this.shakeX) / this.ez + this.x, this.y - (sy - H / 2 - this.shakeY) / this.ez];
    }
    get left() { return this.x - W / 2 / this.ez; }
    get right() { return this.x + W / 2 / this.ez; }

    shake(amount) {
      this.trauma = Math.min(1.2, this.trauma + amount);
    }
    kick(dx, dy) {
      this.kvx += dx; this.kvy += dy;
    }
    zoomPulse(amount) {
      this.pulseV += amount;
    }

    // follow two fighters (world positions)
    update(a, b, opts = {}) {
      this.t++;
      let tx = (a.x + b.x) / 2;
      const hi = Math.max(a.y, b.y);
      let ty = JJK.CAM_BASE_Y + Math.max(0, hi - 70) * 0.45;
      tx = U.clamp(tx, -this.limit, this.limit);
      this.x += (tx - this.x) * 0.2;
      this.y += (ty - this.y) * 0.12;
      let tz = 1;
      this.zoom += (tz - this.zoom) * 0.15;
      this._post();
    }
    _post() {
      // cinematic override blend
      if (this.override) {
        const o = this.override;
        this.ovBlend = U.approach(this.ovBlend, 1, o.speed || 0.12);
      } else this.ovBlend = U.approach(this.ovBlend, 0, 0.1);
      if (this.ovBlend > 0 && (this.override || this._lastOv)) {
        const o = this.override || this._lastOv;
        this._lastOv = o;
        const e = U.ease.inOut(this.ovBlend);
        this.x = U.lerp(this.x, o.x, e);
        this.y = U.lerp(this.y, o.y, e);
        this.zoom = U.lerp(this.zoom, o.zoom, e);
      } else this._lastOv = null;
      // recoil spring
      this.kvx += -this.kx * 0.25; this.kvy += -this.ky * 0.25;
      this.kvx *= 0.7; this.kvy *= 0.7;
      this.kx += this.kvx; this.ky += this.kvy;
      // zoom pulse spring
      this.pulseV += -this.pulse * 0.3;
      this.pulseV *= 0.68;
      this.pulse += this.pulseV;
      this.ez = this.zoom * (1 + this.pulse);
      // shake
      const s = JJK.settings.shake;
      const tr = this.trauma * this.trauma;
      this.shakeX = (Math.sin(this.t * 1.7) * 0.6 + (Math.random() - 0.5)) * tr * 14 * s + this.kx;
      this.shakeY = (Math.cos(this.t * 2.3) * 0.6 + (Math.random() - 0.5)) * tr * 10 * s + this.ky;
      this.trauma = Math.max(0, this.trauma - 0.035);
    }
  }

  JJK.Camera = Camera;
})();
