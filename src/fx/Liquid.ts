import * as THREE from 'three';
import { G } from '../core/G';
import { ARENA } from '../world/config';

const MAX_DROPS = 520;
const MAX_PUDDLES = 40;
const GROUND_Y = 0.012;
const PUDDLE_Y = 0.017;

interface Puddle {
  x: number;
  z: number;
  /** Wetted area in m² (grows with inflow, shrinks as it dries or soaks in). */
  area: number;
  /** Displayed radius, easing toward the area's radius so the edge spreads. */
  r: number;
  seed: number;
  /** Ripple/foam strength where the stream currently lands (0..1). */
  hit: number;
  hx: number;
  hz: number;
  grass: boolean;
}

/**
 * Liquid stream and ground puddles. Drops fly ballistically, break up into
 * spray late in their flight, splash on landing and pool: each landing adds
 * area to the puddle it falls in (or starts a new one), puddles creep toward
 * the inflow, merge when they touch and slowly dry out (fast on grass).
 */
export class Liquid {
  // struct-of-arrays drop pool
  private px = new Float32Array(MAX_DROPS);
  private py = new Float32Array(MAX_DROPS);
  private pz = new Float32Array(MAX_DROPS);
  private vx = new Float32Array(MAX_DROPS);
  private vy = new Float32Array(MAX_DROPS);
  private vz = new Float32Array(MAX_DROPS);
  private age = new Float32Array(MAX_DROPS);
  private size = new Float32Array(MAX_DROPS);
  private splash = new Uint8Array(MAX_DROPS);
  private n = 0;
  readonly puddles: Puddle[] = [];
  private stream: THREE.InstancedMesh;
  private puddleMesh: THREE.InstancedMesh;
  private aPud: THREE.InstancedBufferAttribute;
  private pmat: THREE.ShaderMaterial;
  private mergeT = 0;
  private landed = 0;
  private landedWet = 0;
  /** Smoothed share of the stream landing in standing liquid (drives the audio). */
  wetFrac = 0;
  /** Smoothed landings per second. */
  landRate = 0;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private zAxis = new THREE.Vector3(0, 0, 1);

  constructor(scene: THREE.Scene) {
    const sg = new THREE.BoxGeometry(1, 1, 1);
    const smat = new THREE.MeshPhongMaterial({
      color: 0xf0c848,
      emissive: 0x3a2a04,
      specular: 0xffffff,
      shininess: 90,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    this.stream = new THREE.InstancedMesh(sg, smat, MAX_DROPS);
    this.stream.count = 0;
    this.stream.frustumCulled = false;
    this.stream.renderOrder = 4;
    scene.add(this.stream);

    const pg = new THREE.PlaneGeometry(1, 1);
    pg.rotateX(-Math.PI / 2);
    this.aPud = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUDDLES * 4), 4);
    this.aPud.setUsage(THREE.DynamicDrawUsage);
    pg.setAttribute('aPud', this.aPud);
    this.pmat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          time: { value: 0 },
          skyCol: { value: new THREE.Color(0.6, 0.7, 0.8) },
          horizCol: { value: new THREE.Color(0.7, 0.7, 0.7) },
          sunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
          sunCol: { value: new THREE.Color(1, 1, 1) },
          ambCol: { value: new THREE.Color(0.5, 0.5, 0.5) },
          camPos: { value: new THREE.Vector3() },
        },
      ]),
      vertexShader: /* glsl */ `
        attribute vec4 aPud;
        varying vec2 vUv; varying vec4 vPud; varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main(){
          vUv = position.xz * 2.2;
          vPud = aPud;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float time; uniform vec3 skyCol; uniform vec3 horizCol; uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 ambCol; uniform vec3 camPos;
        varying vec2 vUv; varying vec4 vPud; varying vec3 vWorld;
        #include <fog_pars_fragment>
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main(){
          vec2 p = vUv;
          float seed = vPud.x;
          float ang = atan(p.y, p.x);
          vec2 q = vec2(cos(ang), sin(ang)) * 1.7 + seed * 9.0;
          // lobed, irregular outline that keeps its shape as the puddle spreads
          float edge = 0.8 + 0.2 * noise(q) + 0.08 * noise(q * 2.9 + 3.0);
          float d = length(p) / edge;
          if (d > 1.0) discard;
          float hit = vPud.y;
          vec2 hp = vPud.zw;
          vec2 rel = p - hp;
          float hd = length(rel);
          // ripples running out from where the stream lands
          float rip = sin(hd * 34.0 - time * 17.0) * exp(-hd * 3.5) * hit;
          vec3 n = normalize(vec3(-rel.x * rip * 0.5, 1.0, -rel.y * rip * 0.5));
          vec3 v = normalize(camPos - vWorld);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
          vec3 r = reflect(-v, n);
          float spec = pow(max(dot(r, normalize(sunDir)), 0.0), 90.0);
          float deep = smoothstep(1.0, 0.3, d);
          vec3 tint = vec3(0.62, 0.46, 0.06);
          vec3 lit = ambCol * 0.75 + sunCol * max(sunDir.y, 0.0) * 0.35;
          vec3 col = tint * lit * (0.3 + 0.32 * deep);
          // mirror the sky: horizon haze at grazing angles, deeper blue overhead
          vec3 refl = mix(horizCol, skyCol, clamp(r.y * 2.5, 0.0, 1.0));
          col = mix(col, refl, 0.07 + 0.5 * fres) + sunCol * spec * 1.8;
          // bubbles and foam around the landing point
          vec2 cell = floor(p * 26.0 + vec2(seed * 17.0, floor(time * 7.0)));
          float bub = step(0.84, hash(cell)) * smoothstep(0.5, 0.0, hd) * hit;
          col = mix(col, vec3(0.96, 0.93, 0.78) * lit * 1.3, bub * 0.75);
          // darker soaked rim
          float rim = smoothstep(0.8, 1.0, d);
          col *= mix(1.0, 0.55, rim);
          float alpha = mix(0.66, 0.82, rim) * smoothstep(1.0, 0.93, d) + bub * 0.2;
          gl_FragColor = vec4(col, alpha);
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
    this.puddleMesh = new THREE.InstancedMesh(pg, this.pmat, MAX_PUDDLES);
    this.puddleMesh.count = 0;
    this.puddleMesh.frustumCulled = false;
    this.puddleMesh.renderOrder = 2;
    scene.add(this.puddleMesh);
  }

  /** Launch one drop. */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size = 0.009, splash = false) {
    if (this.n >= MAX_DROPS) return;
    const i = this.n++;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.age[i] = 0;
    this.size[i] = size;
    this.splash[i] = splash ? 1 : 0;
  }

  private kill(i: number) {
    const j = --this.n;
    if (i === j) return;
    this.px[i] = this.px[j];
    this.py[i] = this.py[j];
    this.pz[i] = this.pz[j];
    this.vx[i] = this.vx[j];
    this.vy[i] = this.vy[j];
    this.vz[i] = this.vz[j];
    this.age[i] = this.age[j];
    this.size[i] = this.size[j];
    this.splash[i] = this.splash[j];
  }

  private puddleAt(x: number, z: number, slack: number) {
    let best: Puddle | null = null;
    let bd = 1e9;
    for (const p of this.puddles) {
      const d = Math.hypot(p.x - x, p.z - z) - p.r;
      if (d < slack && d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** Pour `a` m² of spread onto the ground at (x, z). Returns true if it landed in standing liquid. */
  private pour(x: number, z: number, a: number) {
    const grass = Math.abs(x) > ARENA.roadHalfWidth + 0.4;
    if (grass) a *= 0.45; // soil and grass drink most of it
    let p = this.puddleAt(x, z, 0.08);
    const wet = !!p && p.r > 0.1;
    if (!p && this.puddles.length >= MAX_PUDDLES) p = this.puddleAt(x, z, 1e9);
    if (p) {
      const na = p.area + a;
      // the pool creeps toward the inflow instead of growing as a perfect circle
      p.x += (x - p.x) * (a / na) * 0.85;
      p.z += (z - p.z) * (a / na) * 0.85;
      p.area = na;
    } else {
      p = { x, z, area: Math.max(a, 0.002), r: 0.02, seed: Math.random() * 100, hit: 0, hx: x, hz: z, grass };
      this.puddles.push(p);
    }
    p.hit = 1;
    p.hx = x;
    p.hz = z;
    return wet;
  }

  update(dt: number) {
    const g = 9.81;
    // ------------------------------------------------ drops
    const zl = G.zombies?.list ?? [];
    const cam = G.camera.position;
    const near = zl.filter((z: any) => z.alive && Math.abs(z.x - cam.x) < 4 && Math.abs(z.z - cam.z) < 4);
    for (let i = this.n - 1; i >= 0; i--) {
      this.age[i] += dt;
      const a = this.age[i];
      // Plateau-Rayleigh breakup: late in flight the jet shatters into spray
      if (!this.splash[i] && a > 0.22) {
        const k = Math.min(1, (a - 0.22) * 3) * dt * 2.2;
        this.vx[i] += (Math.random() - 0.5) * k;
        this.vy[i] += (Math.random() - 0.5) * k;
        this.vz[i] += (Math.random() - 0.5) * k;
        this.size[i] = Math.max(0.0055, this.size[i] - dt * 0.006);
      }
      this.vy[i] -= g * dt;
      const drag = 1 - dt * 0.15;
      this.vx[i] *= drag;
      this.vz[i] *= drag;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      // splatter on nearby zombies
      let hitZ = false;
      for (const z of near) {
        const r = 0.24 * z.scale;
        if (this.py[i] < 1.65 * z.scale && this.py[i] > 0.1 && Math.hypot(this.px[i] - z.x, this.pz[i] - z.z) < r) {
          hitZ = true;
          break;
        }
      }
      if (hitZ) {
        if (Math.random() < 0.5)
          this.emit(this.px[i], this.py[i], this.pz[i], -this.vx[i] * 0.25 + (Math.random() - 0.5) * 0.8, Math.random() * 0.6, -this.vz[i] * 0.25 + (Math.random() - 0.5) * 0.8, 0.005, true);
        this.kill(i);
        continue;
      }
      if (this.py[i] <= GROUND_Y && this.vy[i] < 0) {
        if (!this.splash[i]) {
          const wet = this.pour(this.px[i], this.pz[i], 0.0017);
          this.landed++;
          if (wet) this.landedWet++;
          // splash droplets, livelier into standing liquid
          const ns = Math.random() < (wet ? 0.7 : 0.4) ? 1 + (Math.random() < 0.4 ? 1 : 0) : 0;
          for (let k = 0; k < ns; k++) {
            const hs = wet ? 0.9 : 0.6;
            this.emit(this.px[i], GROUND_Y + 0.005, this.pz[i], this.vx[i] * 0.15 + (Math.random() - 0.5) * hs, 0.5 + Math.random() * (wet ? 1.1 : 0.7), this.vz[i] * 0.15 + (Math.random() - 0.5) * hs, 0.0045 + Math.random() * 0.002, true);
          }
        }
        this.kill(i);
        continue;
      }
      if (a > 3) this.kill(i);
    }
    // audio stats
    const k = Math.min(1, dt * 4);
    this.landRate += (this.landed / Math.max(dt, 1e-4) - this.landRate) * k;
    if (this.landed > 0) this.wetFrac += (this.landedWet / this.landed - this.wetFrac) * Math.min(1, dt * 3);
    this.landed = 0;
    this.landedWet = 0;

    // ------------------------------------------------ puddles
    this.mergeT -= dt;
    if (this.mergeT <= 0) {
      this.mergeT = 0.2;
      for (let i = 0; i < this.puddles.length; i++)
        for (let j = this.puddles.length - 1; j > i; j--) {
          const a = this.puddles[i];
          const b = this.puddles[j];
          if (Math.hypot(a.x - b.x, a.z - b.z) < (a.r + b.r) * 0.6) {
            const na = a.area + b.area;
            a.x = (a.x * a.area + b.x * b.area) / na;
            a.z = (a.z * a.area + b.z * b.area) / na;
            a.area = na;
            a.hit = Math.max(a.hit, b.hit);
            this.puddles.splice(j, 1);
          }
        }
    }
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i];
      p.area *= Math.exp(-dt / (p.grass ? 40 : 260));
      const target = Math.sqrt(p.area / Math.PI);
      p.r += (target - p.r) * Math.min(1, dt * (target > p.r ? 5 : 1));
      p.hit = Math.max(0, p.hit - dt * 2.2);
      if (p.r < 0.025 && target < 0.025) this.puddles.splice(i, 1);
    }
  }

  /** Upload instance data and lighting uniforms. */
  render() {
    const m = this.m4;
    for (let i = 0; i < this.n; i++) {
      this.v.set(this.vx[i], this.vy[i], this.vz[i]);
      const sp = this.v.length();
      if (sp > 1e-4) this.q.setFromUnitVectors(this.zAxis, this.v.multiplyScalar(1 / sp));
      else this.q.identity();
      const t = this.size[i];
      const len = Math.max(t, Math.min(0.09, sp * 0.024));
      this.s.set(t, t, len);
      this.v.set(this.px[i], this.py[i], this.pz[i]);
      m.compose(this.v, this.q, this.s);
      this.stream.setMatrixAt(i, m);
    }
    this.stream.count = this.n;
    this.stream.instanceMatrix.needsUpdate = true;

    const P = this.puddles;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const size = p.r * 2 * 1.1;
      this.v.set(p.x, PUDDLE_Y + i * 0.0002, p.z);
      this.q.identity();
      this.s.set(size, 1, size);
      m.compose(this.v, this.q, this.s);
      this.puddleMesh.setMatrixAt(i, m);
      const inv = 1 / Math.max(0.01, p.r);
      this.aPud.setXYZW(i, p.seed, p.hit, (p.hx - p.x) * inv, (p.hz - p.z) * inv);
    }
    this.puddleMesh.count = P.length;
    this.puddleMesh.instanceMatrix.needsUpdate = true;
    this.aPud.needsUpdate = true;

    const u = this.pmat.uniforms;
    const s = G.atmosphere.state;
    u.time.value = G.time;
    u.skyCol.value.copy(s.hemiSky).multiplyScalar(0.55 + s.hemiIntensity * 0.25);
    u.sunDir.value.copy(s.sunDir);
    u.horizCol.value.copy(G.scene.fog?.color ?? s.hemiSky);
    u.sunCol.value.copy(s.sunColor).multiplyScalar(Math.min(1.6, s.sunIntensity));
    u.ambCol.value.copy(s.hemiSky).multiplyScalar(s.hemiIntensity * 0.6).addScalar(0.08);
    u.camPos.value.copy(G.camera.position);
  }

  setVisible(v: boolean) {
    this.stream.visible = v;
    this.puddleMesh.visible = v;
  }

  clear() {
    this.n = 0;
    this.puddles.length = 0;
    this.stream.count = 0;
    this.puddleMesh.count = 0;
    this.wetFrac = 0;
    this.landRate = 0;
  }
}
