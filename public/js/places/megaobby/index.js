// "MEGA OBBY": 32 stages in five zones, spiralling up into the sky round
// the Mega Tower - Sky Meadows, Volcano Isles, Neon City, Frozen Peaks and
// the Cosmic Void - with trampolines, trusses, conveyors, crushers, rising
// lava, fire spinners, laser gates, sliding and spinning platforms, a glass
// bridge, a disco floor, swinging axes, an avalanche, blizzard gusts, a
// bobsled run, low gravity, invisible paths, a speed run and the Gauntlet.
// Touch a checkpoint to save your stage; beat the Final Ascent to win.
// (A user-made place in the style of the big obbies that came after 2008;
// it uses its own GUI and modern effects.)
import * as THREE from 'three';
import { pick } from '../../engine/Bots.js';
import { GROUP } from '../../engine/Part.js';
import { sounds } from '../../engine/Sound.js';
import { Structure } from '../disasters/structure.js';
import { buildCourse } from './course.js';
import { ZONES } from './stages.js';
import { ObbyBot } from './bot.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const FALL = 30; // fall this far below your checkpoint and you're out
let S = null;

const fmt = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };

// --- the GUI ---------------------------------------------------------------------------------------------------------
const CSS = `
.mob{position:absolute;inset:0;pointer-events:none;font-family:Arial,Helvetica,sans-serif;z-index:6;color:#fff;--zc:#5cc85c}
.mob .top{position:absolute;left:50%;top:32px;transform:translateX(-50%);background:rgba(14,16,24,.74);border:2px solid var(--zc);border-radius:8px;padding:5px 18px 8px;text-align:center;min-width:330px;box-shadow:0 0 18px rgba(0,0,0,.35)}
.mob .top .st{font:bold 22px 'Arial Black',Arial;letter-spacing:1px;text-shadow:0 2px 2px #000}
.mob .top .st b{color:var(--zc)}
.mob .top .nm{font-size:13px;color:#ddd;margin-top:1px}
.mob .prog{position:relative;height:9px;border-radius:5px;margin-top:6px;overflow:hidden;background:rgba(255,255,255,.12);display:flex}
.mob .prog i{display:block;height:100%;flex:1;opacity:.28;border-right:1px solid rgba(0,0,0,.5)}
.mob .prog u{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#5cc85c,#ff7a2a 30%,#c060ff 55%,#8ad8ff 75%,#a080ff);border-radius:5px;transition:width .4s}
.mob .info{font-size:12px;color:#ccc;margin-top:5px;letter-spacing:.5px}
.mob .info span{margin:0 7px}
.mob .fx{font:bold 13px Arial;color:#ffe25a;margin-top:3px;text-shadow:0 1px 2px #000;min-height:0}
.mob .banner{position:absolute;left:0;right:0;top:24%;text-align:center;opacity:0;transition:opacity .7s}
.mob .banner .z{font:bold 16px Arial;letter-spacing:8px;color:#ddd;text-shadow:0 2px 3px #000}
.mob .banner .n{font:bold 58px 'Arial Black',Arial;letter-spacing:3px;-webkit-text-stroke:2px #000;text-shadow:0 4px 0 #000,0 0 30px rgba(0,0,0,.5)}
.mob .toast{position:absolute;left:50%;top:128px;transform:translateX(-50%);background:rgba(20,90,30,.85);border:2px solid #7cf07c;border-radius:6px;padding:6px 18px;font:bold 16px Arial;text-shadow:0 1px 2px #000;opacity:0;transition:opacity .4s;white-space:nowrap}
.mob .toast small{display:block;font:normal 12px Arial;color:#dfd}
.mob .win{position:absolute;left:50%;top:21%;transform:translateX(-50%);background:rgba(26,20,6,.88);border:3px solid #ffd84a;border-radius:10px;padding:16px 34px;text-align:center;display:none;box-shadow:0 0 40px rgba(255,200,40,.45)}
.mob .win h2{margin:0 0 6px;font:bold 34px 'Arial Black',Arial;color:#ffd84a;-webkit-text-stroke:1px #000;text-shadow:0 3px 0 #000}
.mob .win div{font-size:16px;line-height:1.6}
.mob .win small{color:#cba;font-size:12px}
.mob .dead{position:absolute;left:0;right:0;top:44%;text-align:center;font:bold 24px Arial;text-shadow:0 2px 4px #000;display:none}
.mob .help{position:absolute;right:14px;bottom:110px;font-size:12px;text-align:right;color:#eee;text-shadow:0 1px 2px #000;line-height:1.6}
`;
class Gui {
  constructor(root) {
    if (!document.getElementById('mob-css')) { const st = document.createElement('style'); st.id = 'mob-css'; st.textContent = CSS; document.head.appendChild(st); }
    const el = document.createElement('div'); el.className = 'mob';
    el.innerHTML = `<div class="top"><div class="st"></div><div class="nm"></div><div class="prog">${ZONES.map((z) => `<i style="background:${z.color}"></i>`).join('')}<u></u></div><div class="info"></div><div class="fx"></div></div>
      <div class="banner"><div class="z"></div><div class="n"></div></div>
      <div class="toast"></div>
      <div class="win"><h2>YOU BEAT THE MEGA OBBY!</h2><div></div><small>Step on the PLAY AGAIN pad to go round again</small></div>
      <div class="dead"></div>
      <div class="help">Climb to the top of the Mega Obby!<br>WASD move · Space jump · R reset · right-drag look · I/O zoom</div>`;
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    Object.assign(this, { el, st: q('.st'), nm: q('.nm'), bar: q('.prog u'), info: q('.info'), fx: q('.fx'), banner: q('.banner'), toast: q('.toast'), win: q('.win'), dead: q('.dead'), help: q('.help') });
    setTimeout(() => { this.help.style.display = 'none'; }, 30000);
  }
  set(key, el, html) { if (this['_' + key] !== html) { this['_' + key] = html; el.innerHTML = html; } }
  stage(i, n, name, zone) {
    this.set('st', this.st, `STAGE <b>${i + 1}</b> / ${n}`);
    this.set('nm', this.nm, `${name} · ${zone.name}`);
    this.bar.style.width = `${(i / (n - 1)) * 100}%`;
    this.el.style.setProperty('--zc', zone.color);
  }
  showBanner(zone) {
    this.banner.querySelector('.z').textContent = zone.sub.toUpperCase();
    const n = this.banner.querySelector('.n'); n.textContent = zone.name; n.style.color = zone.color;
    this.banner.style.opacity = 1;
    clearTimeout(this._bt); this._bt = setTimeout(() => { this.banner.style.opacity = 0; }, 3200);
  }
  showToast(html, color = '#7cf07c', bg = 'rgba(20,90,30,.85)') {
    this.toast.innerHTML = html; this.toast.style.borderColor = color; this.toast.style.background = bg;
    this.toast.style.opacity = 1;
    clearTimeout(this._tt); this._tt = setTimeout(() => { this.toast.style.opacity = 0; }, 2400);
  }
  showWin(html) {
    if (!html) { this.win.style.display = 'none'; return; }
    this.win.lastElementChild.previousElementSibling.innerHTML = html;
    this.win.style.display = 'block';
    clearTimeout(this._wt); this._wt = setTimeout(() => { this.win.style.display = 'none'; }, 9000);
  }
  setDead(text) { this.dead.style.display = text ? 'block' : 'none'; this.dead.textContent = text || ''; }
}

// --- skies, fog, light and the air in each zone ------------------------------------------------------------------------------
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function skyTexture(id) {
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const R = rng(id.charCodeAt(0) * 131 + id.length);
  const grad = (stops) => { const g = x.createLinearGradient(0, 0, 0, H); for (const [o, col] of stops) g.addColorStop(o, col); x.fillStyle = g; x.fillRect(0, 0, W, H); };
  const blob = (cx, cy, rx, ry, col) => {
    for (const ox of [-W, 0, W]) {
      if (cx + ox + rx < 0 || cx + ox - rx > W) continue;
      const g = x.createRadialGradient(cx + ox, cy, 0, cx + ox, cy, rx); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.save(); x.translate(cx + ox, cy); x.scale(1, ry / rx); x.translate(-(cx + ox), -cy); x.fillStyle = g; x.beginPath(); x.arc(cx + ox, cy, rx, 0, 7); x.fill(); x.restore();
    }
  };
  const clouds = (n, y0, y1, col, sz) => { for (let i = 0; i < n; i++) { const cx = R() * W, cy = y0 + R() * (y1 - y0); for (let j = 0; j < 6; j++) blob(cx + (R() - 0.5) * sz * 2.2, cy + (R() - 0.5) * sz * 0.35, sz * (0.45 + R() * 0.6), sz * 0.32, col); } };
  const stars = (n, y0, y1, a) => { for (let i = 0; i < n; i++) { x.fillStyle = `rgba(255,255,255,${a * (0.3 + R() * 0.7)})`; const s = R() < 0.08 ? 2 : 1; x.fillRect(R() * W, y0 + R() * (y1 - y0), s, s); } };
  if (id === 'meadow') {
    grad([[0, '#2c78d2'], [0.38, '#7fbcf0'], [0.49, '#d2ebff'], [0.53, '#eef7ff'], [1, '#c9dced']]);
    clouds(10, 70, 170, 'rgba(255,255,255,0.45)', 80); clouds(20, 170, 250, 'rgba(255,255,255,0.85)', 46);
  } else if (id === 'volcano') {
    grad([[0, '#160404'], [0.28, '#43100a'], [0.44, '#9a3a18'], [0.5, '#ff8c3c'], [0.55, '#6e240e'], [1, '#1c0704']]);
    clouds(24, 60, 240, 'rgba(30,14,10,0.55)', 62);
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(255,${120 + R() * 100 | 0},40,${0.3 + R() * 0.6})`; x.fillRect(R() * W, 120 + R() * 140, 2, 2); }
  } else if (id === 'neon') {
    grad([[0, '#030109'], [0.3, '#0f0530'], [0.45, '#36096a'], [0.5, '#c12ad2'], [0.53, '#2a0a48'], [1, '#05010c']]);
    stars(500, 0, 230, 0.9);
    for (let b = 0; b < 3; b++) {
      const col = ['rgba(40,255,230,', 'rgba(255,60,220,', 'rgba(120,120,255,'][b], y0 = 90 + b * 34, ph = R() * 6;
      for (let xx = 0; xx < W; xx += 3) { const y = y0 + Math.sin(xx / 90 + ph) * 18 + Math.sin(xx / 31 + ph * 2) * 6; const g = x.createLinearGradient(0, y - 40, 0, y + 8); g.addColorStop(0, col + '0)'); g.addColorStop(1, col + '0.22)'); x.fillStyle = g; x.fillRect(xx, y - 40, 3, 48); }
    }
  } else if (id === 'frozen') {
    grad([[0, '#5f9fd6'], [0.38, '#b6d8f2'], [0.5, '#f2faff'], [1, '#ffffff']]);
    clouds(26, 110, 250, 'rgba(255,255,255,0.7)', 58);
  } else {
    grad([[0, '#010006'], [0.5, '#0b0424'], [1, '#010006']]);
    for (const [cx, cy, r, col] of [[200, 160, 260, 'rgba(120,40,200,0.35)'], [620, 300, 300, 'rgba(30,80,220,0.3)'], [880, 120, 200, 'rgba(230,60,160,0.28)'], [420, 380, 220, 'rgba(60,200,220,0.18)']]) blob(cx, cy, r, r * 0.55, col);
    stars(1600, 0, H, 1);
    // a ringed planet and a moon
    const P = (cx, cy, r, c1, c2) => { const g = x.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r); g.addColorStop(0, c1); g.addColorStop(1, c2); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); };
    P(720, 150, 46, '#ffcf8a', '#7a3a2a');
    x.strokeStyle = 'rgba(255,220,170,0.7)'; x.lineWidth = 4; x.beginPath(); x.ellipse(720, 150, 92, 18, -0.25, 0, 7); x.stroke();
    P(240, 100, 18, '#e8e8f0', '#5a5a70');
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const LOOK = {
  meadow: { fog: 0xcfe6fb, near: 260, far: 1500, sky: 0xe8eef6, ground: 0x9a948a, amb: 1.45, sun: 0xffffff, sunI: 1.35, air: null },
  volcano: { fog: 0x5a2416, near: 140, far: 950, sky: 0xffc8a0, ground: 0x5a2a1a, amb: 1.3, sun: 0xffa060, sunI: 1.35, air: { color: 0xff8a30, size: 0.45, vy: 5, sway: 1.5, opacity: 0.9 } },
  neon: { fog: 0x1a0a33, near: 160, far: 1100, sky: 0xb8a8ff, ground: 0x302050, amb: 1.05, sun: 0xc8b8ff, sunI: 0.85, air: { color: 0xd070ff, size: 0.3, vy: 0.6, sway: 0.8, opacity: 0.7 } },
  frozen: { fog: 0xe2f1ff, near: 110, far: 850, sky: 0xeaf6ff, ground: 0xb0c8d8, amb: 1.5, sun: 0xf0f8ff, sunI: 1.3, air: { color: 0xffffff, size: 0.55, vy: -7, sway: 2.2, opacity: 0.95 } },
  cosmos: { fog: 0x0a0618, near: 220, far: 1700, sky: 0xc8c0ff, ground: 0x302848, amb: 1.1, sun: 0xe0e0ff, sunI: 1.05, air: { color: 0xbfd0ff, size: 0.25, vy: 0.3, sway: 0.4, opacity: 0.8 } },
};
class Atmosphere {
  constructor(world) {
    this.world = world;
    this.tex = Object.fromEntries(ZONES.map((z) => [z.id, skyTexture(z.id)]));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { a: { value: this.tex.meadow }, b: { value: this.tex.meadow }, k: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D a; uniform sampler2D b; uniform float k; varying vec2 vUv; void main(){ gl_FragColor = mix(texture2D(a, vUv), texture2D(b, vUv), k); #include <colorspace_fragment>\n }',
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    if (world.skyMesh) world.scene.remove(world.skyMesh);
    world.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), this.mat);
    world.skyMesh.renderOrder = -1;
    world.scene.add(world.skyMesh);
    world.scene.fog = new THREE.Fog(LOOK.meadow.fog, LOOK.meadow.near, LOOK.meadow.far);
    this.cur = 'meadow'; this.from = LOOK.meadow; this.k = 1;
    // the air: embers, sparkles, snow, space dust
    const N = 700;
    this.N = N; this.box = V(130, 70, 130);
    this.pos = new Float32Array(N * 3); this.ph = new Float32Array(N);
    for (let i = 0; i < N; i++) { this.pos[i * 3] = Math.random() * 130; this.pos[i * 3 + 1] = Math.random() * 70; this.pos[i * 3 + 2] = Math.random() * 130; this.ph[i] = Math.random() * 7; }
    this.geo = new THREE.BufferGeometry();
    this.out = new Float32Array(N * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.out, 3));
    const dot = document.createElement('canvas'); dot.width = dot.height = 32;
    const d = dot.getContext('2d'); const g = d.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); d.fillStyle = g; d.fillRect(0, 0, 32, 32);
    this.pmat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dot), size: 0.5, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.points = new THREE.Points(this.geo, this.pmat);
    this.points.frustumCulled = false;
    world.scene.add(this.points);
    this.air = null; this.airA = 0; this.wind = V();
    this.apply(LOOK.meadow, LOOK.meadow, 1);
  }
  go(id) {
    if (id === this.cur) return;
    this.from = this.mix || LOOK[this.cur];
    this.mat.uniforms.a.value = this.tex[this.cur]; this.mat.uniforms.b.value = this.tex[id];
    this.mat.uniforms.k.value = 0;
    this.cur = id; this.k = 0;
  }
  apply(A, B, k) {
    const w = this.world, c = new THREE.Color(), lerp = (a, b) => a + (b - a) * k;
    w.scene.fog.color.copy(c.set(A.fog).lerp(new THREE.Color(B.fog), k));
    w.scene.fog.near = lerp(A.near, B.near); w.scene.fog.far = lerp(A.far, B.far);
    w.ambient.color.set(A.sky).lerp(new THREE.Color(B.sky), k);
    w.ambient.groundColor.set(A.ground).lerp(new THREE.Color(B.ground), k);
    w.ambient.intensity = lerp(A.amb, B.amb);
    w.sun.color.set(A.sun).lerp(new THREE.Color(B.sun), k);
    w.sun.intensity = lerp(A.sunI, B.sunI);
  }
  update(dt, cam) {
    if (this.k < 1) {
      this.k = Math.min(1, this.k + dt / 2.5);
      const B = LOOK[this.cur];
      this.apply(this.from, B, this.k);
      this.mat.uniforms.k.value = this.k;
      if (this.k >= 1) { this.mat.uniforms.a.value = this.tex[this.cur]; this.mat.uniforms.k.value = 0; }
    }
    // the air: fade out the old, then in the new
    const want = LOOK[this.cur].air;
    if (this.air !== want) { this.airA -= dt * 1.5; if (this.airA <= 0) { this.airA = 0; this.air = want; if (want) { this.pmat.color.set(want.color); this.pmat.size = want.size; } } }
    else if (this.air) this.airA = Math.min(1, this.airA + dt * 0.8);
    this.pmat.opacity = this.air ? this.air.opacity * this.airA : 0;
    this.points.visible = this.pmat.opacity > 0.01;
    if (!this.points.visible) return;
    const a = this.air, B = this.box, t = this.world.time, P = this.pos, O = this.out, N = this.N;
    const wx = this.wind.x, wz = this.wind.z;
    for (let i = 0; i < N; i++) {
      const j = i * 3;
      P[j] += (Math.sin(t * 0.9 + this.ph[i]) * a.sway + wx) * dt;
      P[j + 1] += a.vy * dt * (0.6 + (i % 5) * 0.12);
      P[j + 2] += (Math.cos(t * 0.7 + this.ph[i] * 1.3) * a.sway + wz) * dt;
      // wrap round the camera
      O[j] = cam.x - B.x / 2 + ((((P[j] - cam.x) % B.x) + B.x) % B.x);
      O[j + 1] = cam.y - B.y / 2 + ((((P[j + 1] - cam.y) % B.y) + B.y) % B.y);
      O[j + 2] = cam.z - B.z / 2 + ((((P[j + 2] - cam.z) % B.z) + B.z) % B.z);
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

/** A burst of confetti (for winners). */
class Confetti {
  constructor(world) {
    this.world = world; this.bursts = [];
  }
  burst(at, n = 160) {
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = [];
    const pal = [0xff3b3b, 0xffd23b, 0x3bff6a, 0x3bb4ff, 0xc23bff, 0xffffff].map((h) => new THREE.Color(h));
    for (let i = 0; i < n; i++) {
      pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
      const c = pal[i % pal.length]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      const a = Math.random() * Math.PI * 2, s = rnd(6, 22);
      vel.push(V(Math.cos(a) * s, rnd(25, 55), Math.sin(a) * s));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.7, vertexColors: true, transparent: true, depthWrite: false }));
    pts.frustumCulled = false;
    this.world.scene.add(pts);
    this.bursts.push({ pts, vel, t: 0 });
  }
  update(dt) {
    for (let k = this.bursts.length - 1; k >= 0; k--) {
      const b = this.bursts[k]; b.t += dt;
      const P = b.pts.geometry.attributes.position;
      for (let i = 0; i < b.vel.length; i++) {
        const v = b.vel[i];
        v.y = Math.max(-9, v.y - 60 * dt); v.x *= 1 - dt * 1.2; v.z *= 1 - dt * 1.2;
        P.setXYZ(i, P.getX(i) + v.x * dt + Math.sin(b.t * 6 + i) * dt * 2, P.getY(i) + v.y * dt, P.getZ(i) + v.z * dt);
      }
      P.needsUpdate = true;
      b.pts.material.opacity = Math.min(1, 6 - b.t);
      if (b.t > 6) { this.world.scene.remove(b.pts); b.pts.geometry.dispose(); this.bursts.splice(k, 1); }
    }
  }
}

// --- sounds the engine doesn't have ------------------------------------------------------------------------------------------------
function glassSound(pos) {
  sounds.custom((c, out, t, K) => {
    const n = K.noise(c); const hp = K.filt(c, 'highpass', 2500, 0.7); const g = c.createGain();
    K.env(g.gain, t, 0.002, 0.9, 0.35); K.chain(n, hp, g, out); n.start(t); n.stop(t + 0.5);
    for (let i = 0; i < 6; i++) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 2400 + Math.random() * 3800;
      const og = c.createGain(); const at = t + 0.02 + Math.random() * 0.25;
      K.env(og.gain, at, 0.002, 0.18, 0.18); o.connect(og); og.connect(out); o.start(at); o.stop(at + 0.3);
    }
  }, pos, 0.9);
}
function boostSound(pos) {
  sounds.custom((c, out, t, K) => {
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(1100, t + 0.35);
    const f = K.filt(c, 'lowpass', 2400, 2); const g = c.createGain(); K.env(g.gain, t, 0.01, 0.35, 0.45);
    K.chain(o, f, g, out); o.start(t); o.stop(t + 0.5);
  }, pos, 0.8);
}

// --- the shared context the stages use ----------------------------------------------------------------------------------------------
function makeContext(world) {
  const arrows = [];
  const arrowCanvas = {};
  const C = {
    world, glass: [], gusts: [],
    /** A scrolling arrow texture for a conveyor (dir: true = +x, false = -x, null = forward) w x h studs, at speed studs/s. */
    arrowTex(dir, w = 6, h = 6, speed = 8) {
      const key = String(dir);
      if (!arrowCanvas[key]) {
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const x = c.getContext('2d');
        x.translate(64, 64); x.rotate(dir === true ? Math.PI / 2 : dir === false ? -Math.PI / 2 : 0);
        x.fillStyle = 'rgba(255,255,255,0.95)';
        x.beginPath(); x.moveTo(0, -40); x.lineTo(40, 6); x.lineTo(20, 6); x.lineTo(0, -16); x.lineTo(-20, 6); x.lineTo(-40, 6); x.closePath(); x.fill();
        x.beginPath(); x.moveTo(0, 0); x.lineTo(40, 46); x.lineTo(20, 46); x.lineTo(0, 24); x.lineTo(-20, 46); x.lineTo(-40, 46); x.closePath(); x.fill();
        arrowCanvas[key] = c;
      }
      const t = new THREE.CanvasTexture(arrowCanvas[key]);
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(w / 4, h / 4);
      arrows.push({ t, dir, rate: speed / 4 });
      return t;
    },
    scroll(dt) { for (const a of arrows) { if (a.dir === null) a.t.offset.y -= a.rate * dt; else a.t.offset.x -= a.rate * dt; } },
    kill(ch, cause) { if (!ch?.alive) return; ch.lastCause = cause; ch.breakJoints(); },
    /** Knocked flying by something (a swinging axe): no control for a moment. */
    fling(ch, part, power, cause) {
      if (!ch?.alive || (ch.flungT && world.time - ch.flungT < 0.8)) return;
      const d = ch.rootPosition.clone().sub(part.mesh.position); d.y = 0;
      const v = part.body?.velocity;
      if (v && Math.hypot(v.x, v.z) > 2) d.set(v.x, 0, v.z);
      if (d.lengthSq() < 0.01) d.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      d.normalize();
      ch.body.velocity.set(d.x * power, power * 0.45, d.z * power);
      ch.platformStand = true; ch.flungT = world.time; ch.lastCause = cause; ch.causeT = world.time;
      sounds.play('hit', ch.rootPosition, 0.8);
    },
    breakGlass(g, ch) {
      if (g.broken) return;
      if (ch) { ch.lastCause = 'glass'; ch.causeT = world.time; }
      g.broken = true; g.seenBroken = true;
      g.p.setCanCollide(false); g.p.mesh.visible = false;
      glassSound(g.p.mesh.position);
      const c = g.p.mesh.position;
      for (let i = 0; i < 10; i++) {
        const s = world.add({ size: [rnd(0.6, 1.6), 0.2, rnd(0.6, 1.6)], position: [c.x + rnd(-2, 2), c.y, c.z + rnd(-2, 2)], rotation: [rnd(0, 90), rnd(0, 90), 0], color: 1, transparency: 0.45, anchored: false, canCollide: false, top: 'Smooth', bottom: 'Smooth', name: 'Shard' });
        s.body.velocity.set(rnd(-6, 6), rnd(-4, 6), rnd(-6, 6));
        s.body.angularVelocity.set(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8));
        world.delay(2.5, () => s.destroy());
      }
      world.delay(25, () => { g.broken = false; g.p.mesh.visible = true; g.p.setCanCollide(true); });
    },
    sfx(name, pos) {
      if (name === 'boost') boostSound(pos);
      else sounds.play(name, pos, 0.8);
    },
  };
  return C;
}

function spawnFor(i) {
  const st = S.stages[i];
  const a = Math.random() * Math.PI * 2, r = Math.random() * 2.2;
  return { position: st.spawn.at.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r)), yaw: st.spawn.yaw };
}
function newRun(p) { p.obby = { stage: 0, won: false, deaths: 0, t0: S.world.time, time: null }; p.stats.Stage = 1; p.spawnOverride = spawnFor(0); }

// --- the place --------------------------------------------------------------------------------------------------------------------------
export default {
  build(world, ctx = {}) {
    world.useStaticGrid(24); // thousands of anchored bricks
    const st = new Structure(world, { cell: 48 });
    const C = makeContext(world);
    const course = buildCourse(world, st, C);
    st.flush();
    world.onUpdate((dt, t) => { for (const o of course.kit.obstacles) o.update(t, dt); });
    S = { world, st, C, course, stages: course.stages, kit: course.kit };
    if (course.warnings.length) console.warn('[megaobby] route warnings:\n' + course.warnings.join('\n'));
    void ctx;
    return { thumbnail: { cam: [250, 150, 300], look: [0, 75, 0] } };
  },

  setup(game) {
    const world = game.world;
    world.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    game.resize(window.innerWidth, window.innerHeight);
    if (world.shadows) { const c = world.sun.shadow.camera; c.left = -90; c.right = 90; c.top = 90; c.bottom = -90; c.far = 500; c.updateProjectionMatrix(); }
    game.respawnTime = 2;
    game.forceFieldTime = 0;
    game.setStats(['Stage', 'Wins']);
    Object.assign(S, { game, gui: new Gui(game.gui.root), atmo: new Atmosphere(world), confetti: new Confetti(world), shownZone: -1, localStage: -1 });
    const C = S.C;
    const O = { stages: S.stages, C, game };
    S.O = O;

    C.reach = (ch, i) => {
      const p = ch.player;
      if (!p?.obby || !ch.alive || i <= p.obby.stage) return;
      p.obby.stage = i;
      p.stats.Stage = i + 1;
      p.spawnOverride = spawnFor(i);
      game.gui?.onPlayersChanged();
      if (p.isLocal) {
        for (let j = 0; j <= i; j++) S.stages[j].flag?.setColor(37);
        sounds.play('ping', null, 0.7);
        const s = S.stages[i];
        S.gui.showToast(`CHECKPOINT!<small>Stage ${i + 1}: ${s.name}</small>`);
      }
      p.brain?.onCheckpoint?.(i);
    };
    C.win = (ch) => {
      const p = ch.player;
      if (!p?.obby || p.obby.won || !ch.alive) return;
      p.obby.won = true; p.obby.time = world.time - p.obby.t0;
      p.stats.Wins = (p.stats.Wins || 0) + 1;
      game.gui?.onPlayersChanged();
      game.systemChat(`${p.name} beat the Mega Obby in ${fmt(p.obby.time)}!`);
      S.confetti.burst(ch.rootPosition.clone().add(V(0, 2, 0)));
      if (p.isLocal) {
        sounds.play('victory', null, 0.8);
        S.gui.showWin(`Time: <b>${fmt(p.obby.time)}</b> · Deaths: <b>${p.obby.deaths}</b>${p.stats.Wins > 1 ? ` · Wins: <b>${p.stats.Wins}</b>` : ''}`);
      }
      p.brain?.onWin?.();
      for (const q of game.players) if (q.brain && q !== p && Math.random() < 0.3) world.delay(rnd(1, 4), () => q.brain?.say(pick(['gg', 'gg!!', 'nice', 'wow', 'congrats', `gg ${p.name}`, 'how r u so fast'])));
    };
    C.restart = (ch) => {
      const p = ch.player;
      if (!p?.obby || !ch.alive || (p.obby.stage === 0 && !p.obby.won)) return;
      newRun(p);
      const sp = p.spawnOverride.position;
      ch.body.position.set(sp.x, sp.y + 3, sp.z); ch.body.velocity.set(0, 0, 0);
      ch.facing = p.spawnOverride.yaw;
      if (p.isLocal) {
        S.stages.forEach((s) => s.flag?.setColor(ZONES[s.zone].flag));
        S.stages[0].flag?.setColor(37);
        game.camera.yaw = ch.facing; game.camera.focus.copy(ch.body.position);
        sounds.play('ping', null, 0.6);
        S.gui.showWin(null);
      }
      p.brain?.enterStage?.(0);
      game.gui?.onPlayersChanged();
    };

    game.on('playerAdded', (p) => {
      newRun(p);
      if (p.isBot) p.brain = new ObbyBot(game, p, O);
    });
    game.on('spawned', (p, ch) => {
      // obby players don't bump each other off the course
      ch.body.collisionFilterMask = GROUP.WORLD | GROUP.DYNAMIC;
      ch.speedUntil = 0;
      if (p.isLocal) { S.gui.setDead(null); S.stages[0].flag?.setColor(37); }
      p.brain?.onSpawn?.();
    });
    game.on('died', (p) => {
      const cause = p.character?.lastCause || 'fell';
      if (p.obby) p.obby.deaths++;
      p.brain?.onDied?.(cause);
      if (p.isLocal) {
        const msg = { laser: 'Zapped by a laser!', crusher: 'Crushed!', fire: 'Burned by a fire spinner!', lava: 'Into the lava!', spinner: 'Hit by a spinner!', snowball: 'Flattened by a snowball!', axe: 'Knocked off by an axe!', disco: 'Red means stop!', reset: 'Reset!', glass: 'Wrong glass!', killbrick: "Don't touch the red!" }[cause] || (cause === 'fell' ? 'You fell!' : 'Oof!');
        S.gui.setDead(`${msg}  Back to stage ${p.obby.stage + 1}...`);
      }
    });
    game.on('chatted', (p, text) => {
      // people answer "what stage are you on?"
      if (!p.isLocal || !/stage/i.test(text) || !/\?|what|wat|which/i.test(text)) return;
      const bots = game.players.filter((q) => q.brain instanceof ObbyBot);
      for (const q of bots.sort(() => Math.random() - 0.5).slice(0, 2)) world.delay(rnd(1, 3), () => q.brain.say(q.obby.won ? 'i beat it!' : pick([`stage ${q.obby.stage + 1}`, `im on ${q.obby.stage + 1}`, `${q.obby.stage + 1}`])));
    });
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() !== 'r' || game.gui?.chatFocused || e.repeat) return;
      const ch = game.localPlayer?.character;
      if (ch?.alive) { ch.lastCause = 'reset'; ch.breakJoints(); }
    });
    // for testing
    S.debug = {
      stage: (i, p = game.localPlayer) => { p.obby.stage = i; p.stats.Stage = i + 1; p.spawnOverride = spawnFor(i); const ch = p.character; if (ch?.alive) { const sp = p.spawnOverride.position; ch.body.position.set(sp.x, sp.y + 3, sp.z); ch.body.velocity.set(0, 0, 0); ch.facing = p.spawnOverride.yaw; } p.brain?.enterStage?.(i); },
      bots: () => game.players.filter((q) => q.brain instanceof ObbyBot),
    };
    window.__mob = S;
  },

  update(game, dt) {
    if (!S?.gui) return;
    const world = game.world, t = world.time;
    S.C.scroll(dt);
    // the characters: special zones, speed boosts, getting knocked about, falling off
    for (const ch of world.characters) {
      if (!ch.alive) continue;
      for (const z of S.kit.zones) if (z.contains(ch.rootPosition)) z.apply(ch, dt, t);
      ch.walkSpeed = ch.speedUntil > t ? 36 : 16;
      if (ch.flungT && t - ch.flungT > 1.1) { ch.platformStand = false; ch.flungT = null; }
      const ob = ch.player?.obby;
      if (ob && ch.rootPosition.y - 3 < S.stages[ob.stage].origin.y - FALL) S.C.kill(ch, ch.causeT && t - ch.causeT < 3 ? ch.lastCause : 'fell');
    }
    S.confetti.update(dt);
    hud(game, dt);
  },
};

// --- the HUD, sky and air each frame ----------------------------------------------------------------------------------------------------------
function hud(game, dt) {
  const p = game.localPlayer, ch = p?.character, t = game.world.time;
  const ob = p?.obby;
  if (!ob) return;
  const i = ob.stage, stage = S.stages[i], zone = ZONES[stage.zone];
  S.gui.stage(i, S.stages.length, stage.name, zone);
  const time = ob.won ? ob.time : t - ob.t0;
  S.gui.set('info', S.gui.info, `<span>&#9201; ${fmt(time)}</span><span>&#9760; ${ob.deaths}</span><span>&#127942; ${p.stats.Wins || 0}</span>`);
  // what's happening to you
  const fx = [];
  if (ch?.alive) {
    if (ch.speedUntil > t) fx.push(`&#9889; SPEED BOOST ${(ch.speedUntil - t).toFixed(1)}`);
    if (ch.lowGrav && t - ch.lowGrav < 0.2) fx.push('&#127769; LOW GRAVITY');
  }
  // the wind on the blizzard bridge
  S.atmo.wind.set(0, 0, 0);
  const pos = ch?.alive ? ch.rootPosition : game.camera.focus;
  for (const gz of S.C.gusts) {
    const q = gz.F.L(pos);
    if (q.z > gz.z1 || q.z < gz.z0 || Math.abs(q.x) > 30 || Math.abs(q.y) > 30) continue;
    const g = gz.gust(t);
    if (g) { const d = gz.F.D(g * 3, 0, 0); S.atmo.wind.set(d.x, 0, d.z); fx.push(`&#128168; WIND ${g > 0 ? '&#10145;' : '&#11013;'}`); }
  }
  S.gui.set('fx', S.gui.fx, fx.join(' &nbsp; '));
  // a new zone: its sky, its air, and a banner
  if (stage.zone !== S.shownZone) {
    S.atmo.go(zone.id);
    if (S.shownZone !== -1 || i === 0) S.gui.showBanner(zone);
    S.shownZone = stage.zone;
  }
  S.atmo.update(dt, game.world.camera.position);
  if (ch?.alive) S.gui.setDead(null);
}
