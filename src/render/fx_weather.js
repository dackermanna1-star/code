// Weather & ambience for HW.fx (TECH §9): exterior rain (slanted streaks + ground splashes) and
// drifting dust motes. Both live in world space around the camera so they move with the world,
// and both use fixed pools.
const W = 480;
const H = 270;
const RAIN_MAX = 280;
const SPLASH_MAX = 96;
const MOTE_MAX = 64;
const SLANT = 0.3; // horizontal drift per unit of fall (wind from the west)

/** Pre-rendered streak sprites: 1-px slanted lines, faint tail → brighter head. */
function makeStreaks() {
  const out = [];
  for (let len = 4; len <= 9; len++) {
    const w = Math.ceil(len * SLANT) + 1;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = len;
    const x = c.getContext('2d');
    for (let j = 0; j < len; j++) {
      const a = 0.25 + 0.75 * (j / (len - 1));
      x.fillStyle = `rgba(172,192,214,${a.toFixed(3)})`;
      x.fillRect(Math.round(j * SLANT), j, 1, 1);
    }
    out.push(c);
  }
  return out;
}

export class Rain {
  constructor(rand) {
    this.rand = rand;
    this.target = 0;
    this.level = 0;
    this.x = new Float32Array(RAIN_MAX);
    this.y = new Float32Array(RAIN_MAX);
    this.v = new Float32Array(RAIN_MAX);
    this.len = new Uint8Array(RAIN_MAX);
    this.life = new Float32Array(RAIN_MAX);
    this.sx = new Float32Array(SPLASH_MAX);
    this.sy = new Float32Array(SPLASH_MAX);
    this.st = new Float32Array(SPLASH_MAX).fill(-1);
    this.si = 0;
    this.streaks = null;
    this.cam = null;
    for (let i = 0; i < RAIN_MAX; i++) this._spawn(i, true);
  }

  /** instant: jump straight to the target (no ease) — map loads into interiors (Integration 2). */
  set(on, intensity = 1, instant = false) {
    this.target = on ? Math.max(0, Math.min(1.5, intensity)) : 0;
    if (instant) {
      this.level = this.target;
      if (!this.target) for (let s = 0; s < SPLASH_MAX; s++) this.st[s] = -1;
    }
  }

  get active() { return this.level > 0.01 || this.target > 0; }

  _spawn(i, anywhere) {
    const r = this.rand;
    this.x[i] = r() * (W + 60) - 30;
    this.y[i] = anywhere ? r() * H : r() * H * 0.9 - 30;
    this.v[i] = 250 + r() * 110;
    this.len[i] = 4 + Math.floor(r() * 6);
    this.life[i] = 0.08 + r() * 0.5; // time until it hits the ground
  }

  update(dt, cam) {
    // Ease toward the target intensity (rain swells and fades, never pops).
    const k = 1 - Math.exp(-dt * 1.6);
    this.level += (this.target - this.level) * k;
    if (!this.active) return;
    // World anchoring: drops drift with the scene as the camera moves.
    let dx = 0;
    let dy = 0;
    if (cam) {
      if (this.cam) { dx = cam.x - this.cam.x; dy = cam.y - this.cam.y; }
      this.cam = this.cam || { x: 0, y: 0 };
      this.cam.x = cam.x;
      this.cam.y = cam.y;
    }
    const n = Math.round(RAIN_MAX * Math.min(1, this.level));
    for (let i = 0; i < n; i++) {
      const v = this.v[i];
      this.x[i] += v * SLANT * dt - dx;
      this.y[i] += v * dt - dy;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // Hit the ground: splash where the head is.
        if (this.rand() < 0.7) {
          const s = this.si;
          this.si = (this.si + 1) % SPLASH_MAX;
          this.sx[s] = this.x[i] + (cam ? cam.x : 0) + this.len[i] * SLANT;
          this.sy[s] = this.y[i] + (cam ? cam.y : 0) + this.len[i];
          this.st[s] = 0;
        }
        this._spawn(i, false);
      } else if (this.x[i] > W + 40 || this.y[i] > H + 20 || this.x[i] < -50 || this.y[i] < -60) this._spawn(i, true);
    }
    for (let s = 0; s < SPLASH_MAX; s++) if (this.st[s] >= 0) { this.st[s] += dt; if (this.st[s] > 0.2) this.st[s] = -1; }
  }

  /** flash: 0..1 lightning level (streaks catch the light). */
  render(ctx, cam, flash = 0) {
    if (!this.active) return;
    if (!this.streaks) this.streaks = makeStreaks();
    const n = Math.round(RAIN_MAX * Math.min(1, this.level));
    ctx.globalAlpha = Math.min(1, (0.5 + 0.3 * Math.min(1, this.level)) * (1 + flash * 0.8));
    for (let i = 0; i < n; i++) {
      const s = this.streaks[this.len[i] - 4];
      ctx.drawImage(s, Math.round(this.x[i]), Math.round(this.y[i]));
    }
    // Splash crowns: a dot, then a little 3-px crown.
    ctx.fillStyle = '#b7c7d8';
    for (let s = 0; s < SPLASH_MAX; s++) {
      const t = this.st[s];
      if (t < 0) continue;
      const x = Math.round(this.sx[s] - cam.x);
      const y = Math.round(this.sy[s] - cam.y);
      if (x < -2 || y < -2 || x > W + 2 || y > H + 2) continue;
      ctx.globalAlpha = 0.55 * (1 - t / 0.2) * (1 + flash);
      if (t < 0.06) ctx.fillRect(x, y, 1, 1);
      else { ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1); ctx.fillRect(x, y, 1, 1); }
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * Ambient dust motes: slow, drifting specks around the view. Drawn before the lighting multiply,
 * so they only show where light falls (lamp pools, moon shafts, the flashlight).
 */
export class DustMotes {
  constructor(rand) {
    this.rand = rand;
    this.on = true;
    this.x = new Float32Array(MOTE_MAX);
    this.y = new Float32Array(MOTE_MAX);
    this.ph = new Float32Array(MOTE_MAX);
    this.sp = new Float32Array(MOTE_MAX);
    this.ready = false;
  }

  _seed(cam) {
    for (let i = 0; i < MOTE_MAX; i++) {
      this.x[i] = cam.x + this.rand() * W;
      this.y[i] = cam.y + this.rand() * H;
      this.ph[i] = this.rand() * 100;
      this.sp[i] = 0.4 + this.rand();
    }
    this.ready = true;
  }

  update(dt, cam, t) {
    if (!this.on || !cam) return;
    if (!this.ready) this._seed(cam);
    for (let i = 0; i < MOTE_MAX; i++) {
      const s = this.sp[i];
      const p = this.ph[i];
      this.x[i] += (Math.sin(t * 0.31 * s + p) * 3 + Math.sin(t * 0.07 + p * 3) * 2) * dt;
      this.y[i] += (Math.cos(t * 0.27 * s + p * 1.3) * 2.5 + 0.8) * dt;
      // Wrap around the view so motes stay with the camera.
      if (this.x[i] < cam.x - 8) this.x[i] += W + 16;
      else if (this.x[i] > cam.x + W + 8) this.x[i] -= W + 16;
      if (this.y[i] < cam.y - 8) this.y[i] += H + 16;
      else if (this.y[i] > cam.y + H + 8) this.y[i] -= H + 16;
    }
  }

  render(ctx, cam, t) {
    if (!this.on || !this.ready) return;
    ctx.fillStyle = '#efe6d2';
    for (let i = 0; i < MOTE_MAX; i++) {
      const a = 0.45 + 0.45 * Math.sin(t * 1.3 * this.sp[i] + this.ph[i]);
      if (a < 0.12) continue;
      ctx.globalAlpha = a;
      ctx.fillRect(Math.round(this.x[i] - cam.x), Math.round(this.y[i] - cam.y), 1, 1);
    }
    ctx.globalAlpha = 1;
  }
}
