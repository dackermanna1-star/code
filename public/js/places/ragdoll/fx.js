// Effects: one particle system (a THREE.Points cloud with per-particle
// colour, size, fade and shape: soft puffs, square confetti, sparks) for dust,
// water spray, smoke, confetti and fireworks; flames for the cauldron and the
// braziers; ripples on the water; the comic "impact star" for the big hits.
import * as THREE from 'three';

const MAX = 4000;
const VERT = `
#include <fog_pars_vertex>
uniform float uScale;
attribute float size; attribute float alpha; attribute float shape; attribute float spin;
varying vec3 vColor; varying float vAlpha; varying float vShape; varying float vSpin;
void main() {
  vColor = color; vAlpha = alpha; vShape = shape; vSpin = spin;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = `
varying vec3 vColor; varying float vAlpha; varying float vShape; varying float vSpin;
#include <fog_pars_fragment>
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float a;
  if (vShape < 0.5) { a = smoothstep(0.5, 0.0, length(p)); a *= a; }            // soft puff
  else if (vShape < 1.5) {                                                       // confetti: a spinning card
    float c = cos(vSpin), s = sin(vSpin);
    vec2 q = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    a = step(abs(q.x), 0.42) * step(abs(q.y), 0.22 * abs(cos(vSpin * 1.7)) + 0.04);
  } else { float d = length(p); a = smoothstep(0.5, 0.1, d) + smoothstep(0.12, 0.0, d); } // spark
  if (a * vAlpha < 0.01) discard;
  gl_FragColor = vec4(vColor, a * vAlpha);
  #include <fog_fragment>
}`;
const SCALE = { value: 520 };

class Points {
  constructor(world, additive) {
    this.n = 0;
    this.p = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX); this.alpha = new Float32Array(MAX); this.shape = new Float32Array(MAX); this.spin = new Float32Array(MAX);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('shape', new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('spin', new THREE.BufferAttribute(this.spin, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
    uniforms.uScale = SCALE;
    const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, transparent: true, depthWrite: false, fog: true, uniforms, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    world.scene.add(this.points);
  }
  add(o) {
    if (this.p.length >= MAX) this.p.shift();
    this.p.push(o);
  }
  update(dt, gy) {
    const P = this.p;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const o = P[i];
      o.t += dt;
      if (o.t >= o.life) continue;
      o.vy -= gy * o.g * dt;
      const d = Math.pow(o.drag, dt);
      o.vx *= d; o.vy *= d; o.vz *= d;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      if (o.floor != null && o.y < o.floor) { o.y = o.floor; o.vy *= -0.3; o.vx *= 0.6; o.vz *= 0.6; }
      o.spin += o.spinV * dt;
      P[w++] = o;
    }
    P.length = w;
    for (let i = 0; i < w; i++) {
      const o = P[i], k = o.t / o.life;
      this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
      const c = o.c2 ? [o.c[0] + (o.c2[0] - o.c[0]) * k, o.c[1] + (o.c2[1] - o.c[1]) * k, o.c[2] + (o.c2[2] - o.c[2]) * k] : o.c;
      this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
      this.size[i] = o.s0 + (o.s1 - o.s0) * k;
      this.alpha[i] = o.a * (k < o.fin ? k / o.fin : 1) * (k > o.fout ? (1 - k) / (1 - o.fout) : 1);
      this.shape[i] = o.shape; this.spin[i] = o.spin;
    }
    this.geo.setDrawRange(0, w);
    for (const k of ['position', 'color', 'size', 'alpha', 'shape', 'spin']) this.geo.attributes[k].needsUpdate = true;
  }
}

const _v2 = new THREE.Vector2();
const rnd = (a, b) => a + Math.random() * (b - a);
const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const CONFETTI = ['#ee334e', '#0081c8', '#fcb131', '#00a651', '#ffffff', '#f06aa6', '#7a3fc4'].map(C);

export class Effects {
  constructor(world) {
    this.world = world;
    this.soft = new Points(world, false);
    this.glow = new Points(world, true);
    this.fires = [];
    this.ripples = [];
    this.rockets = [];
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);
    this.starTex = starTexture();
  }
  _p(sys, o) {
    sys.add({ t: 0, life: 1, g: 0, drag: 1, a: 1, fin: 0.05, fout: 0.6, shape: 0, spin: 0, spinV: 0, s0: 1, s1: 1, c: [1, 1, 1], floor: null, vx: 0, vy: 0, vz: 0, ...o });
  }

  /** A puff of dust where something hit the ground (k: how hard, 0..1+). */
  dust(p, k = 0.5, color = '#d8ccb0') {
    const c = C(color), n = Math.round(4 + k * 10);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(3, 9) * (0.5 + k);
      this._p(this.soft, { x: p.x, y: p.y + 0.2, z: p.z, vx: Math.cos(a) * s, vy: rnd(1, 5) * (0.4 + k), vz: Math.sin(a) * s, drag: 0.08, life: rnd(0.6, 1.2) + k * 0.4, s0: 1.2 + k, s1: 4 + k * 4, a: 0.42, c, fout: 0.3 });
    }
  }
  /** Water thrown up (k: how big the splash). */
  splash(p, k = 1, surface = p.y) {
    const n = Math.round(14 + k * 30);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = rnd(0, 1);
      const up = rnd(10, 26) * Math.sqrt(k) * (1.2 - r * 0.6);
      this._p(this.soft, { x: p.x + Math.cos(a) * r * 1.5, y: surface + 0.3, z: p.z + Math.sin(a) * r * 1.5, vx: Math.cos(a) * rnd(2, 9) * k, vy: up, vz: Math.sin(a) * rnd(2, 9) * k, g: 0.55, drag: 0.6, life: rnd(0.7, 1.4), s0: rnd(0.6, 1.3) * (0.6 + k * 0.4), s1: 0.4, a: 0.9, c: [0.92, 0.97, 1], floor: surface - 1, fout: 0.7 });
    }
    // foam
    for (let i = 0; i < 6 + k * 6; i++) this._p(this.soft, { x: p.x + rnd(-2, 2) * k, y: surface + 0.25, z: p.z + rnd(-2, 2) * k, life: rnd(1.5, 3), s0: 2 * k, s1: 6 * k, a: 0.55, c: [1, 1, 1], fout: 0.4 });
    this.ripple(p.x, surface + 0.08, p.z, 3 + k * 5);
  }
  ripple(x, y, z, size = 6, life = 1.6) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
    m.position.set(x, y, z); m.scale.setScalar(0.5);
    this.world.scene.add(m);
    this.ripples.push({ m, t: 0, life, size });
  }
  smoke(p, dir, k = 1) {
    for (let i = 0; i < 18 * k; i++) {
      const s = rnd(4, 26);
      this._p(this.soft, { x: p.x, y: p.y, z: p.z, vx: dir.x * s + rnd(-3, 3), vy: dir.y * s + rnd(-1, 4), vz: dir.z * s + rnd(-3, 3), g: -0.02, drag: 0.15, life: rnd(1.5, 3), s0: 2, s1: rnd(8, 14), a: 0.55, c: [0.85, 0.85, 0.85], c2: [0.6, 0.6, 0.62], fout: 0.25 });
    }
    for (let i = 0; i < 14; i++) {
      const s = rnd(10, 40);
      this._p(this.glow, { x: p.x, y: p.y, z: p.z, vx: dir.x * s + rnd(-4, 4), vy: dir.y * s + rnd(-4, 4), vz: dir.z * s + rnd(-4, 4), drag: 0.05, life: rnd(0.15, 0.35), s0: rnd(3, 6), s1: 1, a: 1, c: [1, 0.85, 0.4], c2: [1, 0.3, 0.05], shape: 0 });
    }
  }
  /** Sparks (white-yellow, additive). */
  sparks(p, n = 12, speed = 18, color = [1, 0.9, 0.5]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = rnd(-0.3, 1.2), s = rnd(0.4, 1) * speed;
      this._p(this.glow, { x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s, vz: Math.sin(a) * Math.cos(e) * s, g: 0.3, drag: 0.3, life: rnd(0.3, 0.7), s0: 0.9, s1: 0.2, a: 1, c: color, shape: 2 });
    }
  }
  confetti(p, n = 120, spread = 12, up = 22) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(0, 1) * spread;
      this._p(this.soft, { x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * s, vy: rnd(0.5, 1) * up, vz: Math.sin(a) * s, g: 0.06, drag: 0.35, life: rnd(3, 5.5), s0: rnd(0.9, 1.4), s1: 1, a: 1, c: CONFETTI[i % CONFETTI.length], shape: 1, spin: rnd(0, 6), spinV: rnd(-9, 9), fout: 0.85, floor: 0.1 });
    }
  }
  /** Confetti raining over an area. */
  confettiRain(x, y, z, w, n = 200) {
    for (let i = 0; i < n; i++) this._p(this.soft, { x: x + rnd(-w, w), y: y + rnd(0, 20), z: z + rnd(-w, w), vx: rnd(-2, 2), vy: rnd(-6, -2), vz: rnd(-2, 2), drag: 0.6, life: rnd(4, 7), s0: rnd(0.9, 1.4), s1: 1, a: 1, c: CONFETTI[i % CONFETTI.length], shape: 1, spin: rnd(0, 6), spinV: rnd(-9, 9), fout: 0.85, floor: 0.1 });
  }
  /** A firework: a rocket climbs from p and bursts (colours: hex strings). */
  firework(p, height = 70, colors = null) {
    const col = (colors || [['#ff4f6a', '#ffd0d8'], ['#4fc8ff', '#e0f6ff'], ['#ffd24f', '#fff6d0'], ['#6aff8a', '#e0ffe8'], ['#c07aff', '#f0e0ff']][Math.floor(Math.random() * 5)]).map(C);
    this.rockets.push({ x: p.x, y: p.y, z: p.z, vy: 80, vx: rnd(-6, 6), vz: rnd(-6, 6), top: p.y + height * rnd(0.8, 1.1), col });
  }
  _burst(r) {
    const n = 90;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = rnd(28, 36), q = Math.sqrt(1 - u * u);
      this._p(this.glow, { x: r.x, y: r.y, z: r.z, vx: Math.cos(a) * q * s, vy: u * s, vz: Math.sin(a) * q * s, g: 0.12, drag: 0.25, life: rnd(1.2, 1.9), s0: 2.2, s1: 0.6, a: 1, c: r.col[1], c2: r.col[0], shape: 2, fout: 0.5 });
    }
    this._p(this.glow, { x: r.x, y: r.y, z: r.z, life: 0.35, s0: 30, s1: 10, a: 0.8, c: r.col[1], shape: 0 });
    this.onBurst?.(r);
  }
  /** The comic star where someone got hit hard. */
  star(p, k = 1, color = 0xfff2a0) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.starTex, color, transparent: true, depthWrite: false, depthTest: false }));
    s.position.copy(p); s.scale.setScalar(0.1); s.renderOrder = 5;
    this.world.scene.add(s);
    this.ripples.push({ m: s, t: 0, life: 0.35, size: 3 + k * 4, sprite: true, rot: Math.random() * 6 });
  }
  /** A fire that keeps burning (the cauldron, the braziers). */
  fire(p, size = 1) { const f = { p: p.clone(), size, acc: 0, on: true }; this.fires.push(f); return f; }

  update(dt) {
    // particle sizes are in studs: scale them to the screen
    const cam = this.world.camera, r = this.world.renderer;
    SCALE.value = r.getDrawingBufferSize(_v2).y / (2 * Math.tan((cam.fov * Math.PI) / 360));
    const gy = -this.world.physics.gravity.y * 0.5;
    // fires
    for (const f of this.fires) {
      if (!f.on) continue;
      f.acc += dt * 60 * f.size;
      while (f.acc > 1) {
        f.acc -= 1;
        const s = f.size;
        this._p(this.glow, { x: f.p.x + rnd(-1.5, 1.5) * s, y: f.p.y + rnd(0, 0.6) * s, z: f.p.z + rnd(-1.5, 1.5) * s, vx: rnd(-1, 1) * s, vy: rnd(6, 13) * s, vz: rnd(-1, 1) * s, drag: 0.5, life: rnd(0.45, 0.9), s0: rnd(3.5, 6) * s, s1: 0.8 * s, a: 0.85, c: [1, 0.78, 0.3], c2: [0.95, 0.22, 0.03], shape: 0, fin: 0.1, fout: 0.4 });
        if (Math.random() < 0.15) this._p(this.soft, { x: f.p.x + rnd(-1, 1) * s, y: f.p.y + 6 * s, z: f.p.z + rnd(-1, 1) * s, vx: rnd(-1, 1), vy: rnd(5, 9) * s, vz: rnd(-1, 1), drag: 0.6, life: rnd(1.5, 2.5), s0: 3 * s, s1: 9 * s, a: 0.2, c: [0.4, 0.38, 0.36], fout: 0.3 });
      }
    }
    // rockets
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt; r.vy -= 30 * dt;
      this._p(this.glow, { x: r.x, y: r.y, z: r.z, vy: -4, life: 0.4, s0: 1.4, s1: 0.2, a: 0.9, c: [1, 0.8, 0.5], shape: 2 });
      if (r.y >= r.top || r.vy < 15) { this._burst(r); this.rockets.splice(i, 1); }
    }
    // ripples and stars
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) { this.world.scene.remove(r.m); r.m.material.dispose(); this.ripples.splice(i, 1); continue; }
      if (r.sprite) { const s = r.size * (k < 0.3 ? k / 0.3 : 1); r.m.scale.setScalar(s); r.m.material.opacity = k < 0.5 ? 1 : (1 - k) * 2; r.m.material.rotation = r.rot + k; }
      else { r.m.scale.setScalar(0.5 + r.size * k); r.m.material.opacity = 0.7 * (1 - k); }
    }
    this.soft.update(dt, gy);
    this.glow.update(dt, gy);
  }
}

function starTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.translate(64, 64);
  const spikes = 9;
  x.beginPath();
  for (let i = 0; i < spikes * 2; i++) { const r = i % 2 ? 26 : 60, a = (i / (spikes * 2)) * Math.PI * 2; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  x.closePath();
  x.fillStyle = '#fff6b0'; x.fill(); x.lineWidth = 6; x.strokeStyle = '#ff8a1a'; x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
