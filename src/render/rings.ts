/**
 * Planetary rings: annulus with a procedural radial optical-depth profile
 * (ringlets, gaps, a Cassini-like division, density gradients), lit from the
 * star with forward/back scattering (rings glow when back-lit), shadowed by
 * the planet. Also provides the ring-shadow function for the planet shader.
 */
import * as THREE from 'three';
import type { Body } from '../astro/body';
import type { FrameContext } from './planetrenderer';
import { Rng } from '../core/rng';

/** GLSL: transmittance through the ring plane toward the sun (uniforms bound by RingSystem.bindShadow). */
export const RING_SHADOW_GLSL = /* glsl */ `
uniform sampler2D uRingTex;
uniform vec3 uRingCenter;
uniform vec3 uRingNormal;
uniform vec2 uRingRadii;
uniform float uRingOn;
float ringShadow(vec3 p, vec3 L) {
  if (uRingOn < 0.5) return 1.0;
  float denom = dot(L, uRingNormal);
  if (abs(denom) < 1e-5) return 1.0;
  float t = dot(uRingCenter - p, uRingNormal) / denom;
  if (t <= 0.0) return 1.0;
  float r = length(p + L * t - uRingCenter);
  if (r < uRingRadii.x || r > uRingRadii.y) return 1.0;
  float x = (r - uRingRadii.x) / (uRingRadii.y - uRingRadii.x);
  float tau = texture(uRingTex, vec2(x, 0.5)).a;
  return exp(-tau / max(abs(denom), 0.05));
}
`;

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorldPos;
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uRingTex;
uniform vec2 uRingRadii;
uniform vec3 uRingCenter;
uniform vec3 uRingNormal;
uniform vec3 uSunDir;
uniform vec3 uSunIllum;
uniform vec3 uColor;
uniform float uPlanetR;
varying vec3 vWorldPos;
varying vec2 vLocal;
void main() {
  #include <logdepthbuf_fragment>
  float r = length(vLocal);
  if (r < uRingRadii.x || r > uRingRadii.y) discard;
  float x = (r - uRingRadii.x) / (uRingRadii.y - uRingRadii.x);
  vec4 tex = texture(uRingTex, vec2(x, 0.5));
  float tau = tex.a;
  vec3 V = normalize(-vWorldPos);
  float muV = abs(dot(V, uRingNormal));
  float muL = abs(dot(uSunDir, uRingNormal));
  // planet shadow on the ring (cylinder-ish: ray toward sun hits the planet sphere)
  vec3 oc = vWorldPos - uRingCenter;
  float b = dot(oc, uSunDir);
  float c = dot(oc, oc) - uPlanetR * uPlanetR;
  float shadow = (b < 0.0 && b * b - c > 0.0) ? 0.0 : 1.0;
  // optical depth along the view ray → opacity
  float alpha = 1.0 - exp(-tau / max(muV, 0.03));
  // lit side vs back-lit: particles forward-scatter strongly
  bool sameSide = sign(dot(V, uRingNormal)) == sign(dot(uSunDir, uRingNormal));
  float phase = dot(-V, uSunDir);
  float fwd = 1.0 + 3.0 * pow(max(phase, 0.0), 6.0);
  float illum = sameSide ? (1.0 - exp(-tau / max(muL, 0.03))) : exp(-tau / max(muL, 0.03)) * (1.0 - exp(-tau)) * fwd;
  vec3 col = uColor * tex.rgb * uSunIllum * illum * shadow * 0.32;
  gl_FragColor = vec4(col, alpha);
}
`;

export class RingSystem {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly texture: THREE.DataTexture;
  private normal = new THREE.Vector3();

  static shadowUniforms(): Record<string, THREE.IUniform> {
    return {
      uRingTex: { value: null },
      uRingCenter: { value: new THREE.Vector3() },
      uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
      uRingRadii: { value: new THREE.Vector2(1, 2) },
      uRingOn: { value: 0 },
    };
  }

  constructor(readonly body: Body) {
    const ri = body.planet!.rings!;
    const rng = new Rng(ri.seed);
    const N = 2048;
    const data = new Uint8Array(N * 4);
    // radial profile: broad components, sharp ringlets, gaps (resonances), edges
    const comps = rng.int(2, 5);
    const bounds: number[] = [0];
    for (let i = 1; i < comps; i++) bounds.push(rng.range(0.15, 0.9));
    bounds.push(1);
    bounds.sort((a, b) => a - b);
    const compDens = bounds.map(() => rng.range(0.2, 1));
    const gaps: { x: number; w: number }[] = [];
    for (let i = 0; i < rng.int(2, 8); i++) gaps.push({ x: rng.range(0.05, 0.95), w: rng.logUniform(0.002, 0.03) });
    let h = ri.seed;
    const n1 = new Float32Array(N);
    for (let i = 0; i < N; i++) { h = (Math.imul(h ^ (h >>> 13), 0x5bd1e995) + 0x9e3779b9) >>> 0; n1[i] = (h % 1000) / 1000; }
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1);
      let ci = 0;
      while (ci < bounds.length - 2 && x > bounds[ci + 1]) ci++;
      let d = compDens[ci];
      // fine ringlets from smoothed noise at several scales
      let s = 0;
      for (const k of [3, 9, 27]) {
        let acc = 0;
        for (let j = -k; j <= k; j++) acc += n1[Math.min(N - 1, Math.max(0, i + j))];
        s += (acc / (2 * k + 1) - 0.5) * (k === 3 ? 1.6 : k === 9 ? 1.2 : 0.8);
      }
      d *= Math.max(0, 1 + s * 1.4);
      for (const g of gaps) d *= 1 - Math.exp(-(((x - g.x) / g.w) ** 2)) * 0.95;
      d *= Math.min(1, x / 0.03) * Math.min(1, (1 - x) / 0.02);
      const tau = Math.max(0, d) * ri.opacity * 1.6;
      const shade = 0.75 + 0.5 * (n1[(i * 7) % N] - 0.5) + 0.25 * compDens[ci];
      data[i * 4] = Math.min(255, 255 * shade * 0.9);
      data[i * 4 + 1] = Math.min(255, 255 * shade * 0.85);
      data[i * 4 + 2] = Math.min(255, 255 * shade * 0.8);
      data[i * 4 + 3] = Math.min(255, Math.round(tau * 100));
    }
    this.texture = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    // alpha channel stores tau × 100 / 255 → rescale in shader by sampling .a * 2.55
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG.replace('float tau = tex.a;', 'float tau = tex.a * 2.55;'),
      uniforms: {
        uRingTex: { value: this.texture },
        uRingRadii: { value: new THREE.Vector2(ri.inner, ri.outer) },
        uRingCenter: { value: new THREE.Vector3() },
        uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
        uSunDir: { value: new THREE.Vector3(1, 0, 0) },
        uSunIllum: { value: new THREE.Vector3(1, 1, 1) },
        uColor: { value: new THREE.Vector3(...ri.color) },
        uPlanetR: { value: body.radius },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const geo = new THREE.RingGeometry(ri.inner, ri.outer, 256, 4);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.rotation.x = -Math.PI / 2; // ring plane = planet equator (XZ in body frame)
    this.mesh.renderOrder = 10;
  }

  bindShadow(u: Record<string, THREE.IUniform>) {
    u.uRingTex.value = this.texture;
    u.uRingRadii.value.copy(this.material.uniforms.uRingRadii.value);
    u.uRingOn.value = 1;
  }

  update(_ctx: FrameContext, rel: THREE.Vector3, rot: THREE.Quaternion, sunDir: THREE.Vector3, sunIllum: THREE.Vector3, shadowU?: Record<string, THREE.IUniform>) {
    this.normal.set(0, 1, 0).applyQuaternion(rot);
    const u = this.material.uniforms;
    u.uRingCenter.value.copy(rel);
    u.uRingNormal.value.copy(this.normal);
    u.uSunDir.value.copy(sunDir);
    u.uSunIllum.value.copy(sunIllum);
    if (shadowU) {
      shadowU.uRingCenter.value.copy(rel);
      shadowU.uRingNormal.value.copy(this.normal);
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
