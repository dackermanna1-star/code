// Lightweight pooled GPU-point particle systems (steam, water, sparkles, bubbles, crumbs...).
import * as THREE from 'three';
import { canvas, toTexture, cached } from '../core/textures.js';

const VERT = /* glsl */`
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
attribute float aRot;
varying float vAlpha;
varying vec3 vColor;
varying float vRot;
uniform float uScale;
void main() {
  vAlpha = aAlpha; vColor = aColor; vRot = aRot;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.05, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
varying float vRot;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  vec4 t = texture2D(uMap, p);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  if (gl_FragColor.a < 0.004) discard;
}`;

function softTex() {
  return cached('p:soft', () => {
    const c = canvas(64, 64); const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    return toTexture(c, { wrap: false, srgb: false });
  });
}
function dotTex() {
  return cached('p:dot', () => {
    const c = canvas(32, 32); const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
    return toTexture(c, { wrap: false, srgb: false });
  });
}
function bubbleTex() {
  return cached('p:bubble', () => {
    const S = 128; const c = canvas(S, S); const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.03)'); g.addColorStop(0.75, 'rgba(190,230,255,0.25)'); g.addColorStop(0.9, 'rgba(255,200,240,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, 7); ctx.fill();
    // rainbow sheen
    const lg = ctx.createLinearGradient(0, 0, S, S);
    ['rgba(255,120,200,0.25)', 'rgba(120,200,255,0.25)', 'rgba(150,255,170,0.2)', 'rgba(255,230,120,0.25)'].forEach((col, i) => lg.addColorStop(i / 3, col));
    ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = lg; ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(S * 0.35, S * 0.3, S * 0.08, S * 0.05, -0.6, 0, 7); ctx.fill();
    return toTexture(c, { wrap: false });
  });
}
function starTex() {
  return cached('p:star', () => {
    const S = 64; const c = canvas(S, S); const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.moveTo(32, 0); ctx.lineTo(35, 29); ctx.lineTo(64, 32); ctx.lineTo(35, 35); ctx.lineTo(32, 64); ctx.lineTo(29, 35); ctx.lineTo(0, 32); ctx.lineTo(29, 29); ctx.fill();
    return toTexture(c, { wrap: false, srgb: false });
  });
}
function streakTex() {
  return cached('p:streak', () => {
    const c = canvas(16, 64); const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(6, 0, 4, 64);
    const c2 = canvas(64, 64); c2.getContext('2d').drawImage(c, 24, 0);
    return toTexture(c2, { wrap: false, srgb: false });
  });
}

class System {
  constructor(scene, { map, blending = THREE.NormalBlending, capacity = 1500 }) {
    this.cap = capacity;
    this.count = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 3);
    this.rot = new Float32Array(capacity);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 600 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.p = []; // particle objects
  }
  emit(o) {
    const n = o.count ?? 1;
    for (let i = 0; i < n; i++) {
      if (this.p.length >= this.cap) this.p.shift();
      const r = o.spread ?? 0;
      const vr = o.velRand ?? 0;
      const c = new THREE.Color(Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : (o.color || '#ffffff'));
      this.p.push({
        x: o.pos.x + (Math.random() - 0.5) * r, y: o.pos.y + (Math.random() - 0.5) * r * (o.spreadY ?? 1), z: o.pos.z + (Math.random() - 0.5) * r,
        vx: (o.vel?.x || 0) + (Math.random() - 0.5) * vr, vy: (o.vel?.y || 0) + (Math.random() - 0.5) * vr * (o.velRandY ?? 1), vz: (o.vel?.z || 0) + (Math.random() - 0.5) * vr,
        life: 0, max: (o.life || 1) * (0.7 + Math.random() * 0.6),
        s0: (o.size || 0.05) * (0.7 + Math.random() * 0.6), s1: o.sizeEnd ?? (o.size || 0.05),
        a0: o.alpha ?? 1, gravity: o.gravity ?? 0, drag: o.drag ?? 0, r: c.r, g: c.g, b: c.b,
        rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * (o.spin || 0), fadeIn: o.fadeIn ?? 0.1,
        floor: o.floor ?? -100, onDie: o.onDie, wobble: o.wobble || 0, seed: Math.random() * 100,
      });
    }
  }
  update(dt, t) {
    const arr = this.p;
    let w = 0;
    for (let i = 0; i < arr.length; i++) {
      const q = arr[i];
      q.life += dt;
      if (q.life >= q.max) { q.onDie?.(q); continue; }
      q.vy -= q.gravity * dt;
      const d = Math.exp(-q.drag * dt);
      q.vx *= d; q.vy *= d; q.vz *= d;
      if (q.wobble) { q.vx += Math.sin(t * 3 + q.seed) * q.wobble * dt; q.vz += Math.cos(t * 2.6 + q.seed) * q.wobble * dt; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < q.floor) { q.y = q.floor; q.vy *= -0.2; q.vx *= 0.5; q.vz *= 0.5; }
      q.rot += q.spin * dt;
      arr[w++] = q;
    }
    arr.length = w;
    for (let i = 0; i < w; i++) {
      const q = arr[i]; const k = q.life / q.max;
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      this.size[i] = q.s0 + (q.s1 - q.s0) * k;
      const fin = Math.min(1, q.life / Math.max(0.001, q.fadeIn * q.max));
      this.alpha[i] = q.a0 * fin * (1 - k * k);
      this.color[i * 3] = q.r; this.color[i * 3 + 1] = q.g; this.color[i * 3 + 2] = q.b;
      this.rot[i] = q.rot;
    }
    this.geo.setDrawRange(0, w);
    for (const a of ['position', 'aSize', 'aAlpha', 'aColor', 'aRot']) this.geo.attributes[a].needsUpdate = true;
  }
}

export class Particles {
  constructor(scene) {
    this.soft = new System(scene, { map: softTex() });
    this.add = new System(scene, { map: starTex(), blending: THREE.AdditiveBlending });
    this.dots = new System(scene, { map: dotTex() });
    this.bubbles = new System(scene, { map: bubbleTex(), capacity: 400 });
    this.streaks = new System(scene, { map: streakTex(), capacity: 600 });
    this.t = 0;
  }
  setScale(h) { for (const s of [this.soft, this.add, this.dots, this.bubbles, this.streaks]) s.mat.uniforms.uScale.value = h * 0.9; }
  update(dt) { this.t += dt; for (const s of [this.soft, this.add, this.dots, this.bubbles, this.streaks]) s.update(dt, this.t); }

  steam(pos, n = 1, o = {}) { this.soft.emit({ pos, count: n, vel: { x: 0, y: o.up ?? 0.25, z: 0 }, velRand: 0.08, life: o.life ?? 2.2, size: o.size ?? 0.06, sizeEnd: o.sizeEnd ?? 0.3, color: o.color ?? '#ffffff', alpha: o.alpha ?? 0.22, wobble: 0.15, spread: o.spread ?? 0.04, fadeIn: 0.2 }); }
  sparkle(pos, n = 12, color = ['#fff6c9', '#ffffff', '#ffd27a'], o = {}) { this.add.emit({ pos, count: n, velRand: o.speed ?? 1.4, vel: { x: 0, y: o.up ?? 0.6, z: 0 }, life: o.life ?? 0.9, size: o.size ?? 0.07, sizeEnd: 0.0, color, alpha: 1, gravity: o.gravity ?? 0.8, drag: 1.5, spin: 6, spread: o.spread ?? 0.1 }); }
  burst(pos, n = 20, color = ['#ff6b8b', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff'], o = {}) { this.dots.emit({ pos, count: n, velRand: o.speed ?? 2.4, vel: { x: 0, y: o.up ?? 1.6, z: 0 }, life: o.life ?? 1.6, size: o.size ?? 0.03, sizeEnd: 0.025, color, gravity: 3.5, drag: 0.8, spread: 0.05, floor: o.floor ?? 0.01 }); }
  crumbs(pos, color = '#c99a5b', n = 6) { this.dots.emit({ pos, count: n, velRand: 0.8, vel: { x: 0, y: 0.3, z: 0 }, life: 1.2, size: 0.012, sizeEnd: 0.012, color, gravity: 5, drag: 0.5, spread: 0.03, floor: 0.0 }); }
  drops(pos, vel, n = 3, color = '#cfe8ff', o = {}) { this.streaks.emit({ pos, count: n, vel, velRand: o.rand ?? 0.15, life: o.life ?? 0.6, size: o.size ?? 0.05, sizeEnd: o.size ?? 0.05, color, alpha: o.alpha ?? 0.7, gravity: o.gravity ?? 9, spread: o.spread ?? 0.02, floor: o.floor ?? -100 }); }
  mist(pos, dir, n = 10, color = '#ffffff', o = {}) { this.soft.emit({ pos, count: n, vel: { x: dir.x * (o.speed ?? 1.6), y: dir.y * (o.speed ?? 1.6), z: dir.z * (o.speed ?? 1.6) }, velRand: o.rand ?? 0.5, life: o.life ?? 0.9, size: 0.02, sizeEnd: o.sizeEnd ?? 0.16, color, alpha: o.alpha ?? 0.35, drag: 2.5, spread: 0.01 }); }
  bubble(pos, vel, o = {}) { this.bubbles.emit({ pos, count: 1, vel, velRand: o.rand ?? 0.25, velRandY: 0.5, life: o.life ?? 4, size: o.size ?? 0.06, sizeEnd: (o.size ?? 0.06) * 1.05, color: '#ffffff', alpha: 0.95, gravity: o.gravity ?? -0.03, drag: 0.9, wobble: 0.3, fadeIn: 0.02, onDie: o.onDie }); }
  smoke(pos, n = 1, color = '#bbbbbb') { this.soft.emit({ pos, count: n, vel: { x: 0, y: 0.18, z: 0 }, velRand: 0.04, life: 3, size: 0.02, sizeEnd: 0.18, color, alpha: 0.25, wobble: 0.08, spread: 0.01 }); }
  confetti(pos, n = 40) { this.burst(pos, n, ['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#c77dff', '#ffffff'], { speed: 3, up: 2.5, life: 2.5, size: 0.03 }); }
}
