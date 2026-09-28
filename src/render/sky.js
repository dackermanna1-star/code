// Night sky dome: a painted panorama in three layers composited by a small
// shader — base sky (gradient, city glow, stars, moon), a drifting cloud deck
// lit from below by the burning city, and the skyline (lit windows, distant
// fires, smoke plumes, the Mercy Hospital landmark). Distant explosions flash
// on the horizon and light the cloud undersides.
import * as THREE from 'three';
import { makeRng } from '../core/math.js';

const W = 2048, H = 1024;
function canvas() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }

function paintSky(opts) {
  const r = makeRng(opts.seed || 5);
  const horizon = H * 0.5;
  const fires = [];
  const nf = opts.fires ?? 7;
  for (let i = 0; i < nf; i++) fires.push({ x: r() * W, s: 0.6 + r() * 0.8 });
  // ------------------------------------------------------------ base sky
  const base = canvas(), g = base.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, horizon);
  gr.addColorStop(0, opts.zenith || '#03050a');
  gr.addColorStop(0.5, opts.mid || '#0a0f1a');
  gr.addColorStop(0.85, '#1c1a1e');
  gr.addColorStop(1, opts.glow || '#4a3024');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, horizon);
  g.fillStyle = opts.ground || '#0a0a0c';
  g.fillRect(0, horizon, W, H - horizon);
  // warm city-glow domes above the fires
  for (const f of fires) {
    const rg = g.createRadialGradient(f.x, horizon, 0, f.x, horizon, 260 * f.s);
    rg.addColorStop(0, 'rgba(150,70,30,0.35)');
    rg.addColorStop(1, 'rgba(120,50,20,0)');
    g.fillStyle = rg; g.fillRect(f.x - 280, horizon - 280, 560, 290);
  }
  // stars (thinned by the overcast near the horizon)
  for (let i = 0; i < 900; i++) {
    const x = r() * W, y = r() * horizon * 0.75;
    const a = r() * r() * 0.9 * (1 - y / horizon);
    g.fillStyle = `rgba(${200 + r() * 55 | 0},${210 + r() * 45 | 0},255,${a})`;
    g.fillRect(x, y, r() < 0.06 ? 2 : 1, 1);
  }
  // moon with halo
  if (opts.moon !== false) {
    const mx = W * (opts.moonAz ?? 0.3), my = horizon * 0.28;
    const mg = g.createRadialGradient(mx, my, 0, mx, my, 180);
    mg.addColorStop(0, 'rgba(200,210,235,0.3)');
    mg.addColorStop(0.3, 'rgba(160,175,210,0.08)');
    mg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = mg; g.fillRect(mx - 180, my - 180, 360, 360);
    g.fillStyle = '#e4e8f0';
    g.beginPath(); g.arc(mx, my, 15, 0, 7); g.fill();
    g.fillStyle = 'rgba(150,158,175,0.45)';
    g.beginPath(); g.arc(mx - 5, my - 3, 4, 0, 7); g.arc(mx + 6, my + 5, 3, 0, 7); g.arc(mx + 2, my - 7, 2.5, 0, 7); g.fill();
  }
  // ------------------------------------------------------------ clouds (RGBA: colour + coverage)
  const cl = canvas(), c = cl.getContext('2d');
  c.clearRect(0, 0, W, H);
  const cloudBand = (n, y0, y1, wmin, wmax, hmin, hmax, dark, lit) => {
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = y0 + r() * (y1 - y0), w = wmin + r() * (wmax - wmin), h = hmin + r() * (hmax - hmin);
      // underlit by nearby fires
      let heat = 0;
      for (const f of fires) { let dx = Math.abs(f.x - x); dx = Math.min(dx, W - dx); heat += Math.max(0, 1 - dx / 380) * f.s; }
      heat = Math.min(1, heat) * (y / horizon) * lit;
      for (let k = 0; k < 3; k++) {
        const ox = x + (r() - 0.5) * w * 0.8, oy = y + (r() - 0.5) * h * 0.6, rw = w * (0.4 + r() * 0.5);
        const cg = c.createRadialGradient(ox, oy, 0, ox, oy, rw);
        const R = dark[0] + heat * 120, G = dark[1] + heat * 55, B = dark[2] + heat * 25;
        const a = 0.18 + r() * 0.25;
        cg.addColorStop(0, `rgba(${R | 0},${G | 0},${B | 0},${a})`);
        cg.addColorStop(0.6, `rgba(${R | 0},${G | 0},${B | 0},${a * 0.5})`);
        cg.addColorStop(1, `rgba(${R | 0},${G | 0},${B | 0},0)`);
        c.save(); c.translate(ox, oy); c.scale(1, h / w); c.fillStyle = cg; c.beginPath(); c.arc(0, 0, rw, 0, 7); c.fill(); c.restore();
      }
    }
  };
  cloudBand(70, horizon * 0.1, horizon * 0.55, 120, 380, 10, 34, [34, 36, 44], 0.35); // high, cool
  cloudBand(120, horizon * 0.45, horizon * 0.93, 90, 320, 12, 40, [30, 28, 32], 1.0); // low deck, fire-lit
  // ------------------------------------------------------------ skyline (RGBA)
  const sk = canvas(), s = sk.getContext('2d');
  s.clearRect(0, 0, W, H);
  // smoke plumes behind the skyline (drawn first so buildings overlap them)
  for (const f of fires) {
    for (let k = 0; k < 22; k++) {
      const sx = f.x + k * (2 + r() * 5) + Math.sin(k * 0.4) * 6, sy = horizon + 4 - k * 13 * f.s - r() * 10, sr = (12 + k * 4.5) * f.s;
      const sg = s.createRadialGradient(sx, sy, 0, sx, sy, sr);
      const heat = Math.max(0, 1 - k / 8);
      sg.addColorStop(0, `rgba(${28 + heat * 90 | 0},${22 + heat * 40 | 0},${20 + heat * 12 | 0},${0.35 - k * 0.008})`);
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      s.fillStyle = sg; s.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
  }
  const layers = [
    { base: horizon + 5, hmin: 16, hmax: 90, col: '#0d0f15', win: 0.035, wmin: 18, wmax: 60, haze: 0.22 },
    { base: horizon + 9, hmin: 26, hmax: 150, col: '#090a0e', win: 0.06, wmin: 22, wmax: 80, haze: 0.1 },
    { base: horizon + 14, hmin: 20, hmax: 110, col: '#060709', win: 0.08, wmin: 30, wmax: 90, haze: 0 },
  ];
  for (const Ly of layers) {
    let x = 0;
    while (x < W) {
      const w = Ly.wmin + r() * (Ly.wmax - Ly.wmin);
      const h = Ly.hmin + r() * (Ly.hmax - Ly.hmin) * (r() < 0.15 ? 1.7 : 1);
      s.fillStyle = Ly.col;
      s.fillRect(x, Ly.base - h, w, h + 60);
      // rooftop details: water towers, antennas, stepped crowns, spires
      const t = r();
      if (t < 0.25) { s.fillRect(x + w * 0.3, Ly.base - h - 14, 2, 14); }
      else if (t < 0.4) { s.fillRect(x + w * 0.2, Ly.base - h - 8, w * 0.3, 8); s.fillRect(x + w * 0.25, Ly.base - h - 14, w * 0.2, 6); }
      else if (t < 0.5) { s.beginPath(); s.moveTo(x + w * 0.35, Ly.base - h); s.lineTo(x + w * 0.5, Ly.base - h - 26); s.lineTo(x + w * 0.65, Ly.base - h); s.fill(); }
      else if (t < 0.58) { s.fillRect(x + w * 0.6, Ly.base - h - 9, 7, 9); s.fillRect(x + w * 0.6 + 1, Ly.base - h - 12, 5, 3); }
      // lit windows: warm / cool / flickering TV blue, whole floors dark
      for (let wy = Ly.base - h + 6; wy < Ly.base - 3; wy += 6) {
        if (r() < 0.3) continue;
        for (let wx = x + 3; wx < x + w - 3; wx += 5) {
          if (r() < Ly.win) {
            const k = r();
            s.fillStyle = k < 0.75 ? `rgba(255,${170 + r() * 60 | 0},${80 + r() * 60 | 0},${0.45 + r() * 0.45})` : k < 0.9 ? 'rgba(170,200,255,0.55)' : 'rgba(255,110,60,0.7)';
            s.fillRect(wx, wy, 2, 3);
          }
        }
      }
      if (Ly.haze) { s.fillStyle = `rgba(60,48,46,${Ly.haze})`; s.fillRect(x, Ly.base - h, w, h + 60); }
      if (h > 110 && r() < 0.6) { s.fillStyle = '#ff2a1a'; s.fillRect(x + w / 2, Ly.base - h - 2, 2, 2); }
      x += w + (r() < 0.2 ? r() * 16 : 0);
    }
  }
  // Mercy Hospital tower landmark
  if (opts.hospitalAz != null) {
    const hx = W * opts.hospitalAz, hw = opts.hospitalW ?? 70, hh = opts.hospitalH ?? 230;
    const b = horizon + 14;
    s.fillStyle = '#0a0b0f';
    s.fillRect(hx - hw / 2, b - hh, hw, hh + 30);
    s.fillRect(hx - hw * 0.8, b - hh * 0.55, hw * 1.6, hh * 0.55 + 30);
    for (let wy = b - hh + 10; wy < b - 6; wy += 8) for (let wx = hx - hw / 2 + 4; wx < hx + hw / 2 - 4; wx += 7) {
      if (r() < 0.12) { s.fillStyle = `rgba(200,230,255,${0.3 + r() * 0.4})`; s.fillRect(wx, wy, 3, 4); }
    }
    s.fillStyle = '#ff3020';
    s.fillRect(hx - 3, b - hh + 14, 6, 18);
    s.fillRect(hx - 9, b - hh + 20, 18, 6);
    const hg = s.createRadialGradient(hx, b - hh + 23, 0, hx, b - hh + 23, 34);
    hg.addColorStop(0, 'rgba(255,60,40,0.35)'); hg.addColorStop(1, 'rgba(255,60,40,0)');
    s.fillStyle = hg; s.fillRect(hx - 34, b - hh - 11, 68, 68);
    s.fillStyle = '#ff2a1a';
    s.fillRect(hx - hw / 2, b - hh - 3, 3, 3); s.fillRect(hx + hw / 2 - 3, b - hh - 3, 3, 3);
  }
  // fires on the horizon (in front of the skyline)
  for (const f of fires) {
    const fy = horizon + 6;
    const fg = s.createRadialGradient(f.x, fy, 0, f.x, fy, 70 * f.s);
    fg.addColorStop(0, 'rgba(255,170,70,0.7)');
    fg.addColorStop(0.35, 'rgba(255,100,30,0.35)');
    fg.addColorStop(1, 'rgba(255,60,10,0)');
    s.fillStyle = fg; s.fillRect(f.x - 80, fy - 80, 160, 100);
    for (let k = 0; k < 8; k++) { s.fillStyle = `rgba(255,${150 + r() * 80 | 0},60,${0.5 + r() * 0.4})`; s.fillRect(f.x + (r() - 0.5) * 30 * f.s, fy - r() * 10 * f.s, 2, 2 + r() * 4); }
  }
  const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t; };
  return { base: tex(base), clouds: tex(cl), skyline: tex(sk), fires };
}

const VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const FS = /* glsl */ `
  uniform sampler2D tBase, tClouds, tSky;
  uniform float time, bright, drift;
  uniform vec4 flash; // x = u (azimuth 0..1), y = v, z = amount, w = size
  uniform vec3 flashColor;
  varying vec2 vUv;
  void main(){
    vec3 c = texture2D(tBase, vUv).rgb;
    vec4 cl = texture2D(tClouds, vec2(vUv.x + time * drift, vUv.y));
    vec4 cl2 = texture2D(tClouds, vec2(vUv.x * 1.0 - time * drift * 0.45 + 0.37, vUv.y + 0.012));
    float cov = max(cl.a, cl2.a * 0.6);
    c = mix(c, cl.rgb, cl.a);
    c = mix(c, cl2.rgb, cl2.a * 0.45);
    // distant explosion flash lighting the cloud deck and horizon
    float du = abs(vUv.x - flash.x); du = min(du, 1.0 - du) * 2.0;
    float dv = (vUv.y - flash.y) * 1.2;
    float fl = flash.z * exp(-(du * du + dv * dv) / (flash.w * flash.w));
    c += flashColor * fl * (0.25 + cov * 1.6);
    vec4 s = texture2D(tSky, vUv);
    c = mix(c, s.rgb, s.a);
    c += flashColor * fl * 0.35 * step(vUv.y, 0.5) * (1.0 - s.a * 0.7);
    gl_FragColor = vec4(c * bright, 1.0);
    #include <colorspace_fragment>
  }
`;

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.t = 0;
    this.last = performance.now();
    this.flashT = 3;
    this.flashEnv = 0;
  }
  set(opts) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      const u = this.mesh.material.uniforms;
      u.tBase.value.dispose(); u.tClouds.value.dispose(); u.tSky.value.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
    if (!opts || opts.none) return;
    const t = paintSky(opts);
    this.fires = t.fires;
    const geo = new THREE.SphereGeometry(450, 48, 24);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tBase: { value: t.base }, tClouds: { value: t.clouds }, tSky: { value: t.skyline },
        time: { value: 0 }, bright: { value: opts.brightness ?? 1 }, drift: { value: opts.cloudDrift ?? 0.0012 },
        flash: { value: new THREE.Vector4(0, 0.5, 0, 0.08) }, flashColor: { value: new THREE.Color(1.0, 0.62, 0.32) },
      },
      vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    this.mesh.rotation.y = opts.rotation ?? 0;
    this.flashes = opts.flashes !== false;
    this.scene.add(this.mesh);
  }
  update(camPos) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.mesh) return;
    this.mesh.position.copy(camPos);
    this.t += dt;
    const u = this.mesh.material.uniforms;
    u.time.value = this.t;
    if (!this.flashes) return;
    // distant explosions: sudden flash, flicker, slow decay; often near a fire
    this.flashT -= dt;
    if (this.flashT <= 0) {
      this.flashT = 4 + Math.random() * 14;
      const f = this.fires?.length && Math.random() < 0.6 ? this.fires[Math.floor(Math.random() * this.fires.length)] : null;
      u.flash.value.set(f ? f.x / W : Math.random(), 0.5 + Math.random() * 0.04, 0, 0.05 + Math.random() * 0.07);
      this.flashEnv = 0.7 + Math.random() * 0.8;
      this.double = Math.random() < 0.35 ? 0.25 + Math.random() * 0.3 : -1;
      u.flashColor.value.setRGB(1.0, 0.55 + Math.random() * 0.2, 0.25 + Math.random() * 0.15);
    }
    if (this.double > 0) { this.double -= dt; if (this.double <= 0) this.flashEnv = Math.max(this.flashEnv, 0.6 + Math.random() * 0.5); }
    this.flashEnv *= Math.exp(-dt * 3.2);
    u.flash.value.z = this.flashEnv * (0.8 + Math.random() * 0.4);
  }
}
