// Animated atmospheric backdrop for the main menu / loading screen:
// dusk sky, moon, pixel-art skyline of Millbrook (water tower, church, houses, silos, pines), drifting fog,
// flickering windows, a blinking radio mast and falling ash / rising embers.
import { h } from '../dom.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 640, H = 150;

function pine(g, x, base, height, col) {
  g.fillStyle = col;
  const w0 = Math.max(3, Math.round(height * 0.42));
  for (let y = 0; y < height; y++) {
    const t = y / height; // 0 top
    const tier = (y % 5) / 5;
    const w = Math.max(1, Math.round((t * 0.85 + 0.15) * w0 * (0.75 + tier * 0.35)));
    g.fillRect(Math.round(x - w / 2), base - height + y, w, 1);
  }
  g.fillRect(Math.round(x), base - 2, 1, 2);
}

function deadTree(g, x, base, height, col, r) {
  g.fillStyle = col;
  g.fillRect(x, base - height, 2, height);
  const branches = 4 + Math.floor(r() * 3);
  for (let i = 0; i < branches; i++) {
    const y = base - height + Math.floor(r() * height * 0.7);
    const dir = r() < 0.5 ? -1 : 1;
    const len = 3 + Math.floor(r() * 7);
    for (let k = 0; k < len; k++) g.fillRect(x + (dir > 0 ? 2 : -1) + dir * k, y - Math.floor(k * 0.6), 1, 1);
  }
}

function house(g, x, base, w, hgt, col, lights, r) {
  g.fillStyle = col;
  g.fillRect(x, base - hgt, w, hgt);
  const roofH = Math.round(w * 0.38);
  for (let i = 0; i < roofH; i++) g.fillRect(x - 1 + i, base - hgt - i, w + 2 - i * 2, 1);
  if (r() < 0.6) g.fillRect(x + Math.round(w * 0.7), base - hgt - roofH + 1, 2, roofH); // chimney
  // windows
  const rows = Math.max(1, Math.floor(hgt / 7));
  for (let ry = 0; ry < rows; ry++) {
    for (let wx = x + 2; wx < x + w - 3; wx += 5) {
      if (r() < 0.16) lights.push([wx, base - hgt + 3 + ry * 7, 2, 3]);
    }
  }
}

function drawFar(c, seed) {
  const g = c.getContext('2d');
  const r = rng(seed);
  g.clearRect(0, 0, W, H);
  // hills
  g.fillStyle = '#2a1512';
  for (let x = 0; x < W; x++) {
    const y = 104 + Math.sin(x * 0.012 + 1) * 8 + Math.sin(x * 0.031) * 4;
    g.fillRect(x, Math.round(y), 1, H);
  }
  // treeline
  for (let x = 0; x < W; x += 3 + Math.floor(r() * 4)) {
    const base = 112 + Math.round(Math.sin(x * 0.012 + 1) * 6);
    pine(g, x, base, 10 + Math.floor(r() * 14), '#241210');
  }
  // water tower
  const tx = 470;
  g.fillStyle = '#211110';
  g.fillRect(tx - 1, 66, 2, 40);
  g.fillRect(tx - 9, 72, 1, 34); g.fillRect(tx + 8, 72, 1, 34);
  for (let i = 0; i < 6; i++) g.fillRect(tx - 9 + i * 3, 90 - i, 1, 1);
  g.fillRect(tx - 12, 54, 24, 14);
  for (let i = 0; i < 6; i++) g.fillRect(tx - 12 + i * 2, 54 - i, 24 - i * 4, 1);
  g.fillRect(tx - 1, 46, 2, 4);
  // silos
  for (const sx of [96, 108]) {
    g.fillRect(sx, 72, 10, 40);
    for (let i = 0; i < 4; i++) g.fillRect(sx + i, 72 - i, 10 - i * 2, 1);
  }
  g.fillRect(84, 88, 12, 24);
  // radio mast
  g.fillRect(560, 30, 1, 80);
  for (let y = 34; y < 108; y += 6) { g.fillRect(558, y, 5, 1); }
}

function drawNear(c, lightsC, seed) {
  const g = c.getContext('2d');
  const lg = lightsC.getContext('2d');
  const r = rng(seed);
  g.clearRect(0, 0, W, H);
  lg.clearRect(0, 0, W, H);
  const col = '#0f0908';
  const lights = [];
  // ground
  g.fillStyle = col;
  g.fillRect(0, 132, W, H - 132);
  // houses
  let x = 4;
  while (x < W - 10) {
    const w = 16 + Math.floor(r() * 18);
    const hh = 12 + Math.floor(r() * 12);
    if (x > 250 && x < 300) { x = 300; continue; }
    house(g, x, 133, w, hh, col, lights, r);
    x += w + 4 + Math.floor(r() * 16);
    if (r() < 0.3) {
      pine(g, x - 2, 133, 14 + Math.floor(r() * 16), col);
      x += 6;
    }
  }
  // church
  const cx = 262;
  g.fillStyle = col;
  g.fillRect(cx - 14, 104, 28, 30);
  for (let i = 0; i < 10; i++) g.fillRect(cx - 15 + i, 104 - i, 30 - i * 2, 1);
  g.fillRect(cx - 5, 70, 10, 36);
  for (let i = 0; i < 14; i++) g.fillRect(cx - 5 + Math.floor(i / 3), 70 - i, Math.max(1, 10 - Math.floor(i / 3) * 2), 1);
  g.fillRect(cx, 48, 1, 9); g.fillRect(cx - 2, 51, 5, 1);
  lights.push([cx - 1, 112, 3, 6]);
  // power line poles
  const poles = [];
  for (let px = 20; px < W; px += 74) {
    g.fillRect(px, 96, 2, 38);
    g.fillRect(px - 5, 99, 12, 1);
    poles.push(px);
  }
  g.fillStyle = 'rgba(15,9,8,0.9)';
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i], b = poles[i + 1];
    for (const off of [-5, 6]) {
      for (let t = 0; t <= 1; t += 1 / (b - a)) {
        const xx = a + off * 0 + (b - a) * t + (off > 0 ? 1 : 0);
        const yy = 99 + Math.sin(t * Math.PI) * 6;
        g.fillRect(Math.round(xx + off), Math.round(yy), 1, 1);
      }
    }
  }
  // foreground dead trees + fence
  g.fillStyle = col;
  for (let fx = 0; fx < W; fx += 6) { g.fillRect(fx, 138, 1, 8); }
  g.fillRect(0, 140, W, 1);
  deadTree(g, 30, 146, 44, col, r);
  deadTree(g, 610, 146, 52, col, r);
  // wrecked car
  g.fillRect(380, 136, 30, 6); g.fillRect(386, 131, 16, 6);
  // lights
  for (const [lx, ly, lw, lh] of lights) {
    lg.fillStyle = r() < 0.5 ? '#c7782e' : '#a85a20';
    lg.fillRect(lx, ly, lw, lh);
  }
}

export class Backdrop {
  constructor({ particles = true, seed = 1997 } = {}) {
    this.particlesOn = particles;
    this.far = h('canvas.bd-sky-layer.bd-far', { width: W, height: H });
    this.near = h('canvas.bd-sky-layer.bd-near', { width: W, height: H });
    this.lights = h('canvas.bd-sky-layer.bd-lights', { width: W, height: H });
    drawFar(this.far, seed);
    drawNear(this.near, this.lights, seed + 7);
    this.pc = h('canvas.bd-particles');
    this.el = h('div.backdrop',
      h('div.bd-sky'), h('div.bd-moon'), h('div.bd-glow'), this.far, h('i.bd-mast-light'),
      h('div.bd-fog.f1'), this.near, this.lights, h('div.bd-fog.f2'), h('div.bd-fog.f3'),
      this.pc, h('div.bd-vignette'), h('div.bd-scan'));
    this.running = false;
    this.parts = [];
    this._loop = (t) => this.loop(t);
  }

  start() {
    if (this.running || !this.particlesOn) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._loop);
  }
  stop() { this.running = false; }

  loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const c = this.pc;
    const w = Math.ceil(window.innerWidth / 3), hh = Math.ceil(window.innerHeight / 3);
    if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, hh);
    while (this.parts.length < 90) {
      const ember = Math.random() < 0.18;
      this.parts.push({
        x: Math.random() * w, y: ember ? hh + Math.random() * 20 : Math.random() * hh - hh * 0.2,
        vx: 3 + Math.random() * 6, vy: ember ? -(6 + Math.random() * 10) : 3 + Math.random() * 6,
        ember, life: 0, max: 6 + Math.random() * 10, ph: Math.random() * 6.28,
      });
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dt;
      p.ph += dt;
      p.x += (p.vx + Math.sin(p.ph * 1.3) * 3) * dt;
      p.y += p.vy * dt;
      const a = Math.min(1, p.life * 0.8, (p.max - p.life) * 0.8);
      if (p.life > p.max || p.y > hh + 4 || p.y < -10 || p.x > w + 4) { this.parts.splice(i, 1); continue; }
      if (p.ember) {
        g.fillStyle = `rgba(255,${120 + Math.floor(Math.sin(p.ph * 6) * 40)},40,${a * 0.9})`;
        g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      } else {
        g.fillStyle = `rgba(180,170,160,${a * 0.35})`;
        g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
    }
    requestAnimationFrame(this._loop);
  }
}
