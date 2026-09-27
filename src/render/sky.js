// Night sky dome with a painted city skyline (lit windows, distant fires,
// smoke plumes, the Mercy Hospital tower landmark) and a moon.
import * as THREE from 'three';
import { makeRng } from '../core/math.js';

function paintSky(opts) {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = makeRng(opts.seed || 5);
  const horizon = H * 0.5;
  // gradient: zenith -> horizon glow
  const gr = g.createLinearGradient(0, 0, 0, horizon);
  gr.addColorStop(0, opts.zenith || '#04060c');
  gr.addColorStop(0.55, opts.mid || '#0d1320');
  gr.addColorStop(1, opts.glow || '#3a2a22');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, horizon);
  g.fillStyle = opts.ground || '#0a0a0c';
  g.fillRect(0, horizon, W, H - horizon);
  // stars
  for (let i = 0; i < 700; i++) {
    const x = r() * W, y = r() * horizon * 0.8;
    const a = r() * 0.6 * (1 - y / horizon);
    g.fillStyle = `rgba(220,225,255,${a})`;
    g.fillRect(x, y, r() < 0.1 ? 2 : 1, 1);
  }
  // clouds
  for (let i = 0; i < 90; i++) {
    const x = r() * W, y = horizon * (0.15 + r() * 0.7), w = 80 + r() * 300, h = 10 + r() * 30;
    const cg = g.createRadialGradient(x, y, 0, x, y, w);
    const tint = y / horizon;
    cg.addColorStop(0, `rgba(${40 + tint * 50 | 0},${36 + tint * 30 | 0},${40 + tint * 20 | 0},${0.25 + r() * 0.2})`);
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.scale(1, h / w); g.fillStyle = cg; g.beginPath(); g.arc(x, y * w / h, w, 0, 7); g.fill(); g.restore();
  }
  // moon
  if (opts.moon !== false) {
    const mx = W * (opts.moonAz ?? 0.3), my = horizon * 0.28;
    const mg = g.createRadialGradient(mx, my, 0, mx, my, 120);
    mg.addColorStop(0, 'rgba(200,210,230,0.35)');
    mg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = mg; g.fillRect(mx - 120, my - 120, 240, 240);
    g.fillStyle = '#dfe4ee';
    g.beginPath(); g.arc(mx, my, 16, 0, 7); g.fill();
    g.fillStyle = 'rgba(160,165,180,0.5)';
    g.beginPath(); g.arc(mx - 5, my - 3, 4, 0, 7); g.arc(mx + 6, my + 5, 3, 0, 7); g.fill();
  }
  // skyline layers
  const layers = [
    { base: horizon + 6, hmin: 20, hmax: 110, col: '#0b0d12', win: 0.05, wmin: 18, wmax: 60 },
    { base: horizon + 12, hmin: 30, hmax: 170, col: '#07080b', win: 0.08, wmin: 25, wmax: 80 },
  ];
  for (const L of layers) {
    let x = 0;
    while (x < W) {
      const w = L.wmin + r() * (L.wmax - L.wmin);
      const h = L.hmin + r() * (L.hmax - L.hmin) * (r() < 0.15 ? 1.6 : 1);
      g.fillStyle = L.col;
      g.fillRect(x, L.base - h, w, h + 40);
      // rooftop details
      if (r() < 0.3) g.fillRect(x + w * 0.3, L.base - h - 12, 3, 12);
      if (r() < 0.2) g.fillRect(x + w * 0.2, L.base - h - 8, w * 0.3, 8);
      // windows
      for (let wy = L.base - h + 6; wy < L.base - 4; wy += 7) {
        for (let wx = x + 3; wx < x + w - 3; wx += 6) {
          if (r() < L.win) {
            const warm = r() < 0.8;
            g.fillStyle = warm ? `rgba(255,${180 + r() * 50 | 0},${90 + r() * 60 | 0},${0.5 + r() * 0.4})` : 'rgba(170,200,255,0.6)';
            g.fillRect(wx, wy, 3, 3);
          }
        }
      }
      // aircraft warning light
      if (h > 120 && r() < 0.5) { g.fillStyle = '#ff2a1a'; g.fillRect(x + w / 2, L.base - h - 2, 2, 2); }
      x += w + (r() < 0.2 ? r() * 20 : 0);
    }
  }
  // Mercy Hospital tower landmark
  if (opts.hospitalAz != null) {
    const hx = W * opts.hospitalAz, hw = opts.hospitalW ?? 70, hh = opts.hospitalH ?? 230;
    const base = horizon + 12;
    g.fillStyle = '#0a0b0f';
    g.fillRect(hx - hw / 2, base - hh, hw, hh + 30);
    g.fillRect(hx - hw * 0.8, base - hh * 0.55, hw * 1.6, hh * 0.55 + 30);
    for (let wy = base - hh + 10; wy < base - 6; wy += 8) for (let wx = hx - hw / 2 + 4; wx < hx + hw / 2 - 4; wx += 7) {
      if (r() < 0.12) { g.fillStyle = `rgba(200,230,255,${0.3 + r() * 0.4})`; g.fillRect(wx, wy, 3, 4); }
    }
    // red cross sign + helipad lights
    g.fillStyle = '#ff3020';
    g.fillRect(hx - 3, base - hh + 14, 6, 18);
    g.fillRect(hx - 9, base - hh + 20, 18, 6);
    g.fillStyle = 'rgba(255,60,40,0.25)';
    g.beginPath(); g.arc(hx, base - hh + 23, 22, 0, 7); g.fill();
    g.fillStyle = '#ff2a1a';
    g.fillRect(hx - hw / 2, base - hh - 3, 3, 3); g.fillRect(hx + hw / 2 - 3, base - hh - 3, 3, 3);
  }
  // distant fires & smoke plumes
  const fires = opts.fires ?? 7;
  for (let i = 0; i < fires; i++) {
    const fx = r() * W, fy = horizon + 4;
    const fg = g.createRadialGradient(fx, fy, 0, fx, fy, 60 + r() * 60);
    fg.addColorStop(0, 'rgba(255,120,40,0.55)');
    fg.addColorStop(1, 'rgba(255,60,10,0)');
    g.fillStyle = fg; g.fillRect(fx - 120, fy - 120, 240, 160);
    // smoke plume
    for (let k = 0; k < 16; k++) {
      const sx = fx + k * (2 + r() * 4), sy = fy - k * 14 - r() * 10, sr = 14 + k * 4;
      const sg = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
      sg.addColorStop(0, `rgba(${30 + (16 - k) * 3},${24 + (16 - k) * 2},${22},${0.35})`);
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sg; g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
  }
  set(opts) {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.material.map.dispose(); this.mesh = null; }
    if (!opts || opts.none) return;
    const tex = paintSky(opts);
    tex.mapping = THREE.UVMapping;
    const geo = new THREE.SphereGeometry(450, 48, 24);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, color: new THREE.Color(opts.brightness ?? 1, opts.brightness ?? 1, opts.brightness ?? 1) });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    this.mesh.rotation.y = opts.rotation ?? 0;
    this.scene.add(this.mesh);
  }
  update(camPos) {
    if (this.mesh) this.mesh.position.copy(camPos);
  }
}
