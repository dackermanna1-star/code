// Particles for HW.fx.emit (TECH §9): dust, steam, drip, splash, spark, coal_dust, amber_motes,
// paper, ember, breath. Simple ballistic physics in world space with a height axis z (screen y =
// y - z), crisp 1-px rendering, a fixed pool in typed arrays (no per-frame allocation).
//
// Two render passes: LIT particles (dust, steam, water, coal, paper, breath) are drawn into the
// world BEFORE the lighting multiply, so the scene's lights reveal them — steam glows by the boiler
// and vanishes in the dark. EMISSIVE particles (sparks, embers, amber motes) are drawn after it,
// additively. Lit types may add a faint post-light "ghost" so they never vanish completely.

const MAX = 768;

/**
 * Type table. Ranges are [min, max]. Velocities px/s; g = gravity on z (px/s², positive pulls
 * down); drag per second; grow = blob radius over life; colors are picked per particle (or swept
 * over life when `ramp`).
 */
const TYPES = {
  dust: { lit: true, life: [2.5, 4.5], z: [4, 26], v: [2, 7], vz: [-3, 2], g: 1.5, drag: 0.6, sway: 5, alpha: 0.85,
    colors: ['#cfc4aa', '#a89c84', '#e0d8c4'] },
  steam: { lit: true, ghost: 0.14, life: [1.6, 2.8], z: [0, 3], v: [3, 9], vz: [12, 22], g: -3, drag: 0.9, sway: 8,
    grow: [2, 7], alpha: 0.26, colors: ['#dde1e6', '#c3c9d0'], blob: true },
  drip: { lit: true, ghost: 0.35, life: [3, 3], z: [22, 30], v: [0, 0], vz: [0, 0], g: 320, drag: 0, alpha: 1,
    colors: ['#a9c8dc'], land: 'splash' },
  splash: { lit: true, ghost: 0.3, life: [0.25, 0.45], z: [0, 1], v: [10, 32], vz: [28, 62], g: 320, drag: 0.5, alpha: 0.95,
    colors: ['#c4d8e6', '#8fb0c8'] },
  spark: { emissive: true, life: [0.25, 0.7], z: [2, 10], v: [30, 95], vz: [20, 75], g: 240, drag: 0.4, bounce: 0.35, alpha: 1,
    colors: ['#fff3b0', '#ffd27a', '#ffb04a', '#f07a28', '#b83a17'], ramp: true, trail: true },
  coal_dust: { lit: true, life: [1, 2.4], z: [2, 20], v: [4, 14], vz: [-6, 4], g: 6, drag: 0.9, sway: 3, alpha: 0.95,
    colors: ['#2b2a2e', '#45434a', '#5a575e'], size: [1, 2] },
  amber_motes: { emissive: true, life: [3, 6], z: [4, 22], v: [1, 4], vz: [5, 12], g: -1, drag: 0.3, sway: 7, alpha: 0.9,
    colors: ['#f0cf8c', '#d9a85a', '#a8752f'], twinkle: true },
  paper: { lit: true, ghost: 0.08, life: [6, 9], z: [18, 40], v: [6, 16], vz: [-6, -3], g: 0, drag: 0.4, flutter: true, alpha: 1,
    colors: ['#e4dbc2', '#bfb393', '#d6cfb4'], size: [2, 2] },
  ember: { emissive: true, life: [1, 2.4], z: [2, 10], v: [3, 10], vz: [16, 32], g: -2, drag: 0.3, sway: 9, alpha: 1,
    colors: ['#ffe39a', '#ffb04a', '#f07a28', '#b83a17'], ramp: true, twinkle: true },
  breath: { lit: true, ghost: 0.2, life: [0.9, 1.5], z: [17, 21], v: [8, 14], vz: [1, 4], g: -1, drag: 1.4, sway: 2,
    grow: [1, 4], alpha: 0.3, colors: ['#e6ebf0'], blob: true },
};
export const PARTICLE_TYPES = Object.keys(TYPES);
const TYPE_LIST = PARTICLE_TYPES.map((k) => TYPES[k]);
const DRIP = PARTICLE_TYPES.indexOf('drip');
const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** Soft round puff sprites (radius 1..7) per color: a crisp disc plus a half-alpha rim. */
const blobCache = new Map();
function disc(x, cx, cy, r) {
  if (r <= 0) { x.fillRect(cx, cy, 1, 1); return; }
  for (let j = -r; j <= r; j++) {
    const w = Math.round(r * Math.sqrt(Math.max(0, 1 - (j * j) / (r * r))));
    x.fillRect(cx - w, cy + j, w * 2 + 1, 1);
  }
}
function blob(color, r) {
  const key = `${color}|${r}`;
  let c = blobCache.get(key);
  if (c) return c;
  const s = r * 2 + 3;
  c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.globalAlpha = 0.45;
  disc(x, r + 1, r + 1, r + 1);
  x.globalAlpha = 1;
  disc(x, r + 1, r + 1, Math.max(0, r - 1)); // opaque core over the rim
  blobCache.set(key, c);
  return c;
}

export class Particles {
  constructor(rand) {
    this.rand = rand;
    this.n = 0; // high-water mark of used slots
    this.x = new Float32Array(MAX);
    this.y = new Float32Array(MAX);
    this.z = new Float32Array(MAX);
    this.vx = new Float32Array(MAX);
    this.vy = new Float32Array(MAX);
    this.vz = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.max = new Float32Array(MAX);
    this.seed = new Float32Array(MAX);
    this.type = new Int8Array(MAX).fill(-1);
    this.col = new Uint8Array(MAX);
    this.size = new Uint8Array(MAX);
    this._free = 0;
  }

  clear() {
    this.type.fill(-1);
    this.n = 0;
  }

  _slot() {
    for (let k = 0; k < MAX; k++) {
      const i = (this._free + k) % MAX;
      if (this.type[i] < 0) { this._free = (i + 1) % MAX; if (i >= this.n) this.n = i + 1; return i; }
    }
    // Pool full: recycle the oldest-looking slot.
    const i = this._free;
    this._free = (i + 1) % MAX;
    return i;
  }

  /** opts: { z, dir: 'up'|'down'|'left'|'right' | angle (rad), spread (px), vx, vy } */
  emit(typeName, x, y, n = 1, opts = {}) {
    const ti = PARTICLE_TYPES.indexOf(typeName);
    if (ti < 0) { console.warn(`[fx] unknown particle type '${typeName}'`); return; }
    const T = TYPE_LIST[ti];
    const r = this.rand;
    const rr = (a) => a[0] + (a[1] - a[0]) * r();
    const spread = opts.spread ?? (typeName === 'drip' ? 0 : 3);
    let dirx = 0;
    let diry = 0;
    if (opts.angle !== undefined) { dirx = Math.cos(opts.angle); diry = Math.sin(opts.angle); }
    else if (opts.dir && DIR_VEC[opts.dir]) [dirx, diry] = DIR_VEC[opts.dir];
    for (let k = 0; k < n; k++) {
      const i = this._slot();
      this.type[i] = ti;
      this.x[i] = x + (r() * 2 - 1) * spread;
      this.y[i] = y + (r() * 2 - 1) * spread * 0.6;
      this.z[i] = opts.z ?? rr(T.z);
      const sp = rr(T.v);
      if (dirx || diry) {
        // Directed (breath, sparks off a cut): a cone around the direction.
        const a = Math.atan2(diry, dirx) + (r() * 2 - 1) * 0.45;
        this.vx[i] = Math.cos(a) * sp;
        this.vy[i] = Math.sin(a) * sp * 0.7;
      } else {
        const a = r() * Math.PI * 2;
        this.vx[i] = Math.cos(a) * sp;
        this.vy[i] = Math.sin(a) * sp * 0.6;
      }
      if (opts.vx !== undefined) this.vx[i] += opts.vx;
      if (opts.vy !== undefined) this.vy[i] += opts.vy;
      this.vz[i] = rr(T.vz);
      this.max[i] = this.life[i] = rr(T.life);
      this.seed[i] = r() * 1000;
      this.col[i] = Math.floor(r() * T.colors.length);
      this.size[i] = T.size ? Math.round(rr(T.size)) : 1;
    }
  }

  update(dt, t) {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const ti = this.type[i];
      if (ti < 0) continue;
      const T = TYPE_LIST[ti];
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.type[i] = -1; continue; }
      const drag = Math.max(0, 1 - T.drag * dt);
      this.vx[i] *= drag;
      this.vy[i] *= drag;
      if (T.sway) {
        const s = this.seed[i];
        this.vx[i] += Math.sin(t * 1.7 + s) * T.sway * dt;
        this.vy[i] += Math.cos(t * 1.3 + s * 1.7) * T.sway * 0.5 * dt;
      }
      if (T.flutter) {
        // Paper: side-to-side glide, terminal fall speed.
        const s = this.seed[i];
        this.vx[i] += Math.sin(t * 3.1 + s) * 30 * dt;
        this.vz[i] = -4 - 3 * Math.abs(Math.sin(t * 3.1 + s));
      }
      this.vz[i] -= T.g * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
      if (this.z[i] <= 0) {
        this.z[i] = 0;
        if (T.land === 'splash') {
          this.type[i] = -1;
          this.emit('splash', this.x[i], this.y[i], 3, { spread: 1 });
        } else if (T.bounce && this.vz[i] < -20) {
          this.vz[i] = -this.vz[i] * T.bounce;
          this.vx[i] *= 0.6;
          this.vy[i] *= 0.6;
        } else {
          this.vz[i] = 0;
          if (T.g > 0) { this.vx[i] *= 1 - Math.min(1, 6 * dt); this.vy[i] *= 1 - Math.min(1, 6 * dt); }
        }
      }
    }
    // Shrink the scan range to the last live slot (splashes may have been spawned meanwhile).
    let hi = this.n;
    while (hi > 0 && this.type[hi - 1] < 0) hi--;
    this.n = hi;
  }

  /** pass: 'lit' (before lighting), 'ghost' (lit types, faint, after lighting), 'emissive'. */
  render(ctx, cam, pass, t) {
    const n = this.n;
    const prevOp = ctx.globalCompositeOperation;
    if (pass === 'emissive') ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const ti = this.type[i];
      if (ti < 0) continue;
      const T = TYPE_LIST[ti];
      if (pass === 'emissive' ? !T.emissive : !T.lit) continue;
      if (pass === 'ghost' && !T.ghost) continue;
      const sx = Math.round(this.x[i] - cam.x);
      const sy = Math.round(this.y[i] - this.z[i] - cam.y);
      if (sx < -8 || sy < -8 || sx > 488 || sy > 278) continue;
      const u = 1 - this.life[i] / this.max[i]; // 0 → 1 over life
      // Fade in quickly, out over the last 40 %.
      let a = T.alpha * Math.min(1, u * 8) * Math.min(1, (1 - u) / 0.4);
      if (T.twinkle) a *= 0.6 + 0.4 * Math.sin(t * 9 + this.seed[i]);
      if (pass === 'ghost') a *= T.ghost;
      if (a <= 0.02) continue;
      const color = T.ramp ? T.colors[Math.min(T.colors.length - 1, Math.floor(u * T.colors.length))] : T.colors[this.col[i]];
      ctx.globalAlpha = a;
      if (T.blob) {
        const rad = Math.max(1, Math.round(T.grow[0] + (T.grow[1] - T.grow[0]) * Math.sqrt(u)));
        const b = blob(color, rad);
        ctx.drawImage(b, sx - rad - 1, sy - rad - 1);
        continue;
      }
      ctx.fillStyle = color;
      const s = this.size[i];
      if (T.flutter) {
        // Paper scrap: turns over as it falls (2×1 ↔ 1×2).
        if (Math.sin(t * 6 + this.seed[i]) > 0) ctx.fillRect(sx, sy, 2, 1);
        else ctx.fillRect(sx, sy, 1, 2);
        continue;
      }
      ctx.fillRect(sx, sy, s, s);
      if (T.trail) {
        // One-pixel streak behind fast sparks.
        const vx = this.vx[i];
        const vy = this.vy[i] - this.vz[i];
        const m = Math.hypot(vx, vy);
        if (m > 25) {
          ctx.globalAlpha = a * 0.5;
          ctx.fillRect(Math.round(sx - vx / m * 1.5), Math.round(sy - vy / m * 1.5), 1, 1);
        }
      }
      if (ti === DRIP && this.vz[i] < -60) {
        // Falling drops stretch.
        ctx.fillRect(sx, sy - 1, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prevOp;
  }

  get count() {
    let c = 0;
    for (let i = 0; i < this.n; i++) if (this.type[i] >= 0) c++;
    return c;
  }
}
