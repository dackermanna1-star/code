// =============================================================================
// Contrails: billboard puffs emitted behind both engines when cold & high,
// stored in the WORLD frame (child of app.worldRoot) relative to a floating
// anchor so float32 precision is never an issue. One draw call.
// =============================================================================
import * as THREE from 'three';
import { AIRCRAFT } from '../../core/constants.js';

const VERT = /* glsl */`
attribute vec3 aCenter;
attribute vec2 aCorner;
attribute vec2 aInfo;      // birth time, seed
uniform float uTime;
uniform float uLife;
varying vec2 vUv;
varying float vA;
varying float vSeed;
varying float vK;
void main() {
  float age = uTime - aInfo.x;
  float k = clamp(age / uLife, 0.0, 1.0);
  float size = mix(1.6, 32.0, pow(k, 0.62)) * (0.8 + 0.4 * fract(aInfo.y * 7.3));
  vA = smoothstep(0.0, 0.22, age) * pow(1.0 - k, 1.6) * step(0.0, age) * step(age, uLife);
  vUv = aCorner;
  vSeed = aInfo.y;
  vK = k;
  vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
  // spread sideways with age (vortex-induced spreading) + slow sink
  mv.xy += aCorner * size * 0.5;
  gl_Position = projectionMatrix * mv;
  if (vA <= 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const FRAG = /* glsl */`
uniform vec3 uLit;
uniform vec3 uAmb;
varying vec2 vUv;
varying float vA;
varying float vSeed;
varying float vK;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float n = noise(vUv * 2.6 + vSeed * 17.0) * 0.6 + noise(vUv * 6.0 - vSeed * 9.0) * 0.4;
  float a = min(1.0, exp(-r2 * 3.0) * (0.6 + 0.6 * n) * vA * (1.25 - 0.7 * vK));
  vec3 c = uLit * (0.75 + 0.25 * n) + uAmb;
  gl_FragColor = vec4(c * a, a);
}`;

export class Contrails {
  constructor(app, { perEngine = 260 } = {}) {
    this.app = app;
    this.N = perEngine * 2;
    const N = this.N;
    this.center = new Float32Array(N * 12);
    this.info = new Float32Array(N * 8).fill(-1e6);
    const corner = new Float32Array(N * 8);
    const idx = new Uint32Array(N * 6);
    const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < 4; k++) corner.set(cs[k], (i * 4 + k) * 2);
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    const g = new THREE.BufferGeometry();
    this.aCenter = new THREE.BufferAttribute(this.center, 3).setUsage(THREE.DynamicDrawUsage);
    this.aInfo = new THREE.BufferAttribute(this.info, 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aCenter);
    g.setAttribute('aCenter', this.aCenter);
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setAttribute('aInfo', this.aInfo);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.uniforms = {
      uTime: { value: 0 }, uLife: { value: 26 },
      uLit: { value: new THREE.Vector3(1, 1, 1) }, uAmb: { value: new THREE.Vector3(0.3, 0.35, 0.4) },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    this.anchor = new THREE.Vector3();
    this.anchored = false;
    this.next = 0;
    this.time = 0;
    this.distAcc = 0;
    this.strength = 0;
    this.lastPos = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this.alive = 0;
    (app.worldRoot || app.scenes.outside).add(this.mesh);
    const clear = () => { this.info.fill(-1e6); this.aInfo.needsUpdate = true; this.anchored = false; this.alive = 0; };
    app.events?.on?.('flight:restart', clear);
    app.events?.on?.('flight:skip', clear);
    this.clear = clear;
  }

  update(dt, st) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    const pos = st.position;
    if (!pos) return;
    const cold = (st.outsideTempC ?? 15) < -38 && (st.altitude ?? 0) > 7600;
    const running = (st.engines?.[0]?.n1 || 0) > 45 || (st.engines?.[1]?.n1 || 0) > 45;
    const target = cold && running ? 1 : 0;
    this.strength += (target - this.strength) * Math.min(1, dt * 0.25);
    if (!this.anchored || this.lastPos.distanceToSquared(pos) > 2000 * 2000) {
      // teleport (skip / restart) or first frame: start fresh
      if (this.anchored) this.clear();
      this.anchor.copy(pos); this.anchored = true;
      this.lastPos.copy(pos);
    }
    if (pos.distanceToSquared(this.anchor) > 15000 * 15000) this._rebase(pos);
    this.mesh.position.copy(this.anchor);
    // sun lighting
    const sun = this.app.sun;
    if (sun) {
      const k = Math.max(0, Math.min(1, (sun.direction.y + 0.05) / 0.15));
      this.uniforms.uLit.value.set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(sun.intensity * 0.42 * k);
      this.uniforms.uAmb.value.set(sun.skyColor.r, sun.skyColor.g, sun.skyColor.b).multiplyScalar(sun.ambientIntensity * 0.35);
    }
    // emit by distance travelled
    const d = this.lastPos.distanceTo(pos);
    this.lastPos.copy(pos);
    if (this.strength > 0.02) {
      this.distAcc += d;
      const spacing = 9;
      let guard = 0;
      while (this.distAcc >= spacing && guard++ < 8) {
        this.distAcc -= spacing;
        if (Math.random() < this.strength) for (const sx of [-1, 1]) this._emit(sx, st, this.distAcc);
      }
      this.alive = this.time + this.uniforms.uLife.value;
    } else this.distAcc = 0;
    this.mesh.visible = this.time < this.alive;
    if (this.mesh.visible) { this.aCenter.needsUpdate = true; this.aInfo.needsUpdate = true; }
  }

  _emit(sx, st, back) {
    const E = AIRCRAFT.engine;
    // condensation becomes visible some 30-60 m behind the engines
    this._p.set(sx * E.x * 0.92, E.y - 0.4, 38 + back + Math.random() * 6);
    this.app.world.toWorld(this._p, this._p);
    this._p.sub(this.anchor);
    const i = this.next;
    this.next = (this.next + 1) % this.N;
    for (let k = 0; k < 4; k++) {
      this.center.set([this._p.x, this._p.y, this._p.z], (i * 4 + k) * 3);
      this.info.set([this.time, Math.random()], (i * 4 + k) * 2);
    }
  }

  _rebase(pos) {
    const dx = this.anchor.x - pos.x, dy = this.anchor.y - pos.y, dz = this.anchor.z - pos.z;
    for (let i = 0; i < this.center.length; i += 3) { this.center[i] += dx; this.center[i + 1] += dy; this.center[i + 2] += dz; }
    this.anchor.copy(pos);
    this.aCenter.needsUpdate = true;
  }
}
