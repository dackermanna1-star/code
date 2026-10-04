/**
 * Volcano visuals drawn as meshes: glowing lava bombs (one instanced draw, HDR emissive with a
 * cooling crust) and lightning bolts inside the ash plume (camera-facing ribbons, additive).
 */
import * as THREE from 'three';
import type { Game } from '../../game';
import { ForwardLayer, GLSL_FOG, GLSL_PRELUDE, atmosphereParts } from './gl';

export interface BombView {
  x: number; y: number; z: number;
  r: number;
  /** 1 = white hot, 0 = dark crust. */
  heat: number;
  seed: number;
}

const MAX_BOMBS = 64;

export class BombRenderer {
  readonly mesh: THREE.Mesh;
  private inst: THREE.InstancedBufferAttribute;
  private heat: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;

  constructor(game: Game, layer: ForwardLayer) {
    const base = new THREE.IcosahedronGeometry(1, 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('normal', base.getAttribute('normal'));
    this.inst = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BOMBS * 4), 4);
    this.heat = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BOMBS * 2), 2);
    this.inst.setUsage(THREE.DynamicDrawUsage);
    this.heat.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('a_inst', this.inst);
    geo.setAttribute('a_heat', this.heat);
    geo.instanceCount = 0;
    this.geo = geo;
    const atmo = atmosphereParts(game);
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...atmo.uniforms, u_cameraPos: layer.cameraPosUniform(), u_time: { value: 0 } },
      vertexShader: `${GLSL_PRELUDE}
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float u_time;
in vec3 position;
in vec3 normal;
in vec4 a_inst;
in vec2 a_heat;
out vec3 v_n;
out vec3 v_wp;
out vec3 v_lp;
out vec2 v_heat;
void main() {
  // lumpy rock: displace the sphere a little with the seed
  float s = a_heat.y;
  vec3 p = position;
  float lump = 1.0 + 0.18 * sin(p.x * 3.1 + s * 7.0) * sin(p.y * 2.7 + s * 3.0) * sin(p.z * 3.3 + s * 5.0);
  // spin around a seed axis
  float a = u_time * (2.0 + fract(s * 13.7) * 4.0);
  vec3 ax = normalize(vec3(sin(s * 9.1), 0.6, cos(s * 5.3)));
  float c = cos(a), sn = sin(a);
  vec3 q = p * c + cross(ax, p) * sn + ax * dot(ax, p) * (1.0 - c);
  vec3 nq = normal * c + cross(ax, normal) * sn + ax * dot(ax, normal) * (1.0 - c);
  vec3 wp = a_inst.xyz + q * a_inst.w * lump;
  v_n = nq;
  v_lp = p * 2.0 + s * 10.0;
  v_wp = wp;
  v_heat = a_heat;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(wp, 1.0);
}`,
      fragmentShader: `${GLSL_PRELUDE}
${atmo.glsl}
${GLSL_FOG}
uniform vec3 u_cameraPos;
in vec3 v_n;
in vec3 v_wp;
in vec3 v_lp;
in vec2 v_heat;
out vec4 o;
void main() {
  vec3 rel = v_wp - u_cameraPos;
  float dist = length(rel);
  vec3 V = -rel / dist;
  vec3 N = normalize(v_n);
  // cracked crust: cells of glowing magma between dark plates
  float n1 = vnoise3(v_lp * 1.7);
  float n2 = vnoise3(v_lp * 4.1 + 3.0);
  float crack = smoothstep(0.42, 0.5, abs(n1 - 0.5) * 2.0 * 0.6 + n2 * 0.4);
  float heat = v_heat.x;
  vec3 hot = mix(vec3(1.0, 0.18, 0.02), vec3(1.0, 0.62, 0.22), heat) * (6.0 + 22.0 * heat);
  vec3 crust = vec3(0.05, 0.035, 0.03) * (0.3 + 0.7 * max(dot(N, vec3(0.3, 0.9, 0.2)), 0.0));
  float glow = mix(1.0 - crack, 1.0, heat * heat * 0.7);
  vec3 col = mix(crust, hot, glow);
  // rim glow (hot halo)
  col += hot * 0.25 * pow(1.0 - max(dot(N, V), 0.0), 3.0);
  o = vec4(dz_fog(col, -V, dist), 1.0);
}`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    layer.scene.add(this.mesh);
  }

  update(bombs: BombView[], time: number) {
    const n = Math.min(MAX_BOMBS, bombs.length);
    const a = this.inst.array as Float32Array, h = this.heat.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const b = bombs[i];
      a[i * 4] = b.x; a[i * 4 + 1] = b.y; a[i * 4 + 2] = b.z; a[i * 4 + 3] = b.r;
      h[i * 2] = b.heat; h[i * 2 + 1] = b.seed;
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n) {
      this.inst.needsUpdate = true;
      this.heat.needsUpdate = true;
      this.inst.addUpdateRange(0, n * 4);
      this.heat.addUpdateRange(0, n * 2);
    }
    (this.mesh.material as THREE.RawShaderMaterial).uniforms.u_time.value = time;
  }
}

// ------------------------------------------------------------------------------- lightning

const MAX_SEG = 160;

interface Bolt {
  /** segment list [ax,ay,az,bx,by,bz,width,bright] */
  segs: number[];
  age: number;
  life: number;
  seed: number;
}

/** Jagged lightning bolts as camera-facing ribbons (additive HDR). */
export class BoltRenderer {
  readonly mesh: THREE.Mesh;
  private bolts: Bolt[] = [];
  private geo = new THREE.BufferGeometry();
  private aA: THREE.BufferAttribute;
  private aB: THREE.BufferAttribute;
  private aP: THREE.BufferAttribute;
  private mat: THREE.RawShaderMaterial;

  constructor(layer: ForwardLayer) {
    // 4 vertices per segment: (end 0/1, side -1/+1)
    const n = MAX_SEG * 4;
    this.aA = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.aB = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.aP = new THREE.BufferAttribute(new Float32Array(n * 4), 4); // end, side, width, brightness
    for (const a of [this.aA, this.aB, this.aP]) a.setUsage(THREE.DynamicDrawUsage);
    const idx = new Uint16Array(MAX_SEG * 6);
    for (let i = 0; i < MAX_SEG; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setAttribute('position', this.aA);
    this.geo.setAttribute('a_b', this.aB);
    this.geo.setAttribute('a_p', this.aP);
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {},
      transparent: true,
      depthWrite: false,
      // premultiplied additive (alpha 0 keeps the target's alpha), like the particle Add pool
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      vertexShader: `${GLSL_PRELUDE}
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
in vec3 position;
in vec3 a_b;
in vec4 a_p;
out float v_side;
out float v_b;
void main() {
  vec4 va = modelViewMatrix * vec4(position, 1.0);
  vec4 vb = modelViewMatrix * vec4(a_b, 1.0);
  vec4 v = mix(va, vb, a_p.x);
  vec2 d = vb.xy / max(-vb.z, 0.1) - va.xy / max(-va.z, 0.1);
  vec2 sd = normalize(vec2(-d.y, d.x) + 1e-6);
  // keep a minimum on-screen width so distant bolts stay visible
  float w = max(a_p.z, -v.z * 0.0035);
  v.xy += sd * a_p.y * w;
  v_side = a_p.y;
  v_b = a_p.w;
  gl_Position = projectionMatrix * v;
}`,
      fragmentShader: `${GLSL_PRELUDE}
in float v_side;
in float v_b;
out vec4 o;
void main() {
  float core = exp(-v_side * v_side * 6.0);
  vec3 c = mix(vec3(0.55, 0.6, 1.0), vec3(1.0), core) * v_b * (0.3 + core * 1.4);
  o = vec4(c, 0.0);
}`,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    layer.scene.add(this.mesh);
  }

  get active() {
    return this.bolts.length;
  }

  /** Adds a branching bolt from a to b (world). */
  strike(ax: number, ay: number, az: number, bx: number, by: number, bz: number, width = 0.35, rand: () => number = Math.random) {
    const segs: number[] = [];
    const branch = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w: number, depth: number) => {
      const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const n = Math.max(3, Math.min(28, Math.round(len / 2.2)));
      let px = x0, py = y0, pz = z0;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const j = i === n ? 0 : len * 0.07;
        const qx = x0 + (x1 - x0) * t + (rand() - 0.5) * j * 2, qy = y0 + (y1 - y0) * t + (rand() - 0.5) * j, qz = z0 + (z1 - z0) * t + (rand() - 0.5) * j * 2;
        if (segs.length / 8 >= MAX_SEG - 1) return;
        segs.push(px, py, pz, qx, qy, qz, w * (1 - t * 0.5), depth === 0 ? 12 : 6);
        if (depth < 2 && rand() < 0.16) {
          const bl = len * (0.2 + rand() * 0.3);
          branch(qx, qy, qz, qx + (rand() - 0.5) * bl, qy + (y1 - y0 > 0 ? 0.3 : -0.6) * bl, qz + (rand() - 0.5) * bl, w * 0.55, depth + 1);
        }
        px = qx; py = qy; pz = qz;
      }
    };
    branch(ax, ay, az, bx, by, bz, width, 0);
    this.bolts.push({ segs, age: 0, life: 0.22 + rand() * 0.25, seed: rand() * 100 });
  }

  update(dt: number) {
    for (let i = this.bolts.length - 1; i >= 0; i--) if ((this.bolts[i].age += dt) > this.bolts[i].life) this.bolts.splice(i, 1);
    const A = this.aA.array as Float32Array, B = this.aB.array as Float32Array, P = this.aP.array as Float32Array;
    let s = 0;
    for (const b of this.bolts) {
      // restrike flicker
      const k = b.age / b.life;
      const fl = (1 - k) * (0.55 + 0.45 * Math.abs(Math.sin(b.age * 70 + b.seed)));
      for (let i = 0; i + 7 < b.segs.length && s < MAX_SEG; i += 8, s++) {
        for (let v = 0; v < 4; v++) {
          const o = (s * 4 + v) * 3;
          A[o] = b.segs[i]; A[o + 1] = b.segs[i + 1]; A[o + 2] = b.segs[i + 2];
          B[o] = b.segs[i + 3]; B[o + 1] = b.segs[i + 4]; B[o + 2] = b.segs[i + 5];
          const q = (s * 4 + v) * 4;
          P[q] = v >> 1; P[q + 1] = v & 1 ? 1 : -1; P[q + 2] = b.segs[i + 6]; P[q + 3] = b.segs[i + 7] * fl;
        }
      }
    }
    this.geo.setDrawRange(0, s * 6);
    this.mesh.visible = s > 0;
    if (s) {
      this.aA.needsUpdate = this.aB.needsUpdate = this.aP.needsUpdate = true;
    }
  }
}
