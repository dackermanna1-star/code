/**
 * Volumetric nebulae. Each nebula is a back-faced box ray-marched in its own
 * unit-sphere space (axis-scaled, rotated). Emission uses line colours —
 * Hα red, [O III] teal, Hβ blue — distributed by ionisation structure; dust
 * absorbs. Output is premultiplied (emission, 1 − transmittance) so dark
 * clouds dim the stars and galaxy glow behind them.
 */
import * as THREE from 'three';
import { NOISE_GLSL } from './shaders/noise.glsl';
import type { Nebula } from '../astro/nebulae';
import type { GalaxyParams } from '../astro/galaxy';
import { LY } from '../core/constants';
import { cloudDetailTexture } from './clouds';
import { PRE_EXPOSURE_TEX, PRE_EXPOSURE_GLSL } from './exposure';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz * 1e-3;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE_GLSL}
uniform int uType;          // 0 emission, 1 planetary, 2 SNR, 3 reflection, 4 dark
uniform vec3 uRo;           // camera relative to the centre, nebula unit space
uniform mat3 uWorldToN;     // world direction → nebula unit space (rotation + 1/(R·axes))
uniform float uR;           // radius (ly)
uniform float uEmis, uDust, uSeed;
uniform int uSteps;
uniform float uFrame;
uniform sampler2D tDepth;
uniform vec2 uResolution;
uniform float uFar;
uniform float uMetersPerLy;
uniform sampler3D tNoise;
${PRE_EXPOSURE_GLSL}
varying vec3 vWorld;

// line colours, unit luminance
const vec3 HA = vec3(3.9, 0.2, 0.39);
const vec3 O3 = vec3(0.064, 1.28, 0.96);
const vec3 HB = vec3(0.45, 0.85, 2.6);
const vec3 SCAT = vec3(0.55, 0.85, 1.9);

float tx(vec3 p) { return texture(tNoise, p).r; }
float fbmT(vec3 p) { return tx(p) * 0.5 + tx(p * 2.03 + 0.31) * 0.28 + tx(p * 4.1 + 0.77) * 0.14 + tx(p * 8.3 + 0.19) * 0.08; }

// returns emission (rgb) and dust density (a) at unit-space point u
vec4 sampleNeb(vec3 u) {
  float r = length(u);
  if (r > 1.25) return vec4(0.0);
  vec3 q = u * 1.1 + uSeed;
  if (uType == 0) {
    // HII region: sparse clumps of gas lit by the central cluster. Emission
    // falls with the ionising flux (∝ 1/r²) and peaks on the clump faces
    // (ionisation fronts); [O III] dominates the hot inner zone, Hα the
    // outer gas; dust lanes and pillars cut through in silhouette.
    vec3 w = vec3(fbmT(q * 0.7), fbmT(q * 0.7 + 5.2), fbmT(q * 0.7 + 9.7)) - 0.48;
    float n = (fbmT(q + w * 2.5) - 0.48) * 12.0;
    float body = smoothstep(1.1, 0.5, r + n * 0.1) * smoothstep(0.03, 0.2, r);
    float clump = smoothstep(0.2, 1.6, n);
    float front = exp(-(n - 0.7) * (n - 0.7) * 6.0);
    float ion = 1.0 / (r * r * 7.0 + 0.12);
    float dens = body * (clump * 0.35 + front) * (0.5 + 0.9 * tx(q * 3.1 + 2.3)) * ion * 1.6;
    float inner = smoothstep(0.7, 0.05, r);
    float l = (fbmT(q * 1.6 + w * 3.0 + 3.7) - 0.48) * 12.0;
    float lanes = smoothstep(0.7, 1.7, l) * smoothstep(1.0, 0.3, r);
    vec3 e = (HA * (1.0 - 0.65 * inner) + O3 * inner * inner * 1.2 + HB * 0.1) * dens;
    return vec4(e, lanes * 3.0 + body * clump * 0.1);
  }
  if (uType == 1) {
    // planetary nebula: thin ionised shell (limb-brightened into a ring),
    // [O III] inside, Hα / [N II] rim, faint outer halo
    float n = fbmT(q * 2.0);
    float sh = exp(-pow((r - 0.6 - (n - 0.5) * 0.15) / 0.11, 2.0));
    float rim = exp(-pow((r - 0.8 - (n - 0.5) * 0.08) / 0.06, 2.0)) * (0.4 + n);
    float core = smoothstep(0.65, 0.05, r) * 0.18;
    float halo = smoothstep(1.2, 0.85, r) * smoothstep(0.75, 0.95, r) * 0.05;
    vec3 e = O3 * (sh * 0.95 + core) + HA * (rim * 1.6 + sh * 0.25 + halo);
    return vec4(e, 0.0);
  }
  if (uType == 2) {
    // supernova remnant: a thin shell (crossed at most twice per sight line, so
    // limb-brightened) carrying a network of filaments defined on the sphere
    vec3 dir = u / max(r, 1e-3);
    float rs = 0.86 + (tx(dir * 0.45 + uSeed) - 0.48) * 0.35;
    float shell = exp(-pow((r - rs) / 0.05, 2.0));
    vec3 w = vec3(tx(dir * 1.7 + uSeed), tx(dir * 1.7 + uSeed + 4.4), tx(dir * 1.7 + uSeed + 8.8)) - 0.48;
    float f1 = 1.0 - clamp(abs(fbmT(dir * 2.4 + w * 2.5 + uSeed) - 0.48) * 30.0, 0.0, 1.0);
    float f2 = 1.0 - clamp(abs(fbmT(dir * 5.1 + w * 3.5 + uSeed + 1.7) - 0.48) * 36.0, 0.0, 1.0);
    float fil = f1 * f1 * f1 + 0.6 * f2 * f2 * f2;
    float oiii = smoothstep(0.42, 0.56, tx(dir * 0.9 + uSeed + 6.1));
    // young remnants with a pulsar glow inside (synchrotron, bluish white)
    float inside = smoothstep(0.75, 0.0, r);
    vec3 e = (HA * (1.0 - 0.6 * oiii) + O3 * 0.9 * oiii) * fil * shell * 10.0 + vec3(0.7, 0.85, 1.3) * inside * 0.04;
    return vec4(e, 0.0);
  }
  if (uType == 3) {
    // reflection nebula: wispy dust lit by a nearby blue star
    float n = fbmT(q + fbmT(q * 2.1) * 0.4);
    float dens = smoothstep(1.0, 0.15, r) * smoothstep(0.42, 0.8, n);
    return vec4(SCAT * dens * (0.4 + 1.2 * smoothstep(0.9, 0.0, r)), dens * 0.6);
  }
  // dark nebula: absorption only, sharp-edged, filamentary
  float n = fbmT(q * 1.2 + fbmT(q * 2.7) * 0.45);
  float dens = smoothstep(1.0, 0.3, r + (0.5 - n) * 0.8) * smoothstep(0.35, 0.6, n);
  return vec4(0.0, 0.0, 0.0, dens);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 rdW = normalize(vWorld);
  vec3 du = uWorldToN * rdW;          // unit-space displacement per ly
  vec3 ro = uRo;
  // intersect the bounding sphere |u| = 1.25 (t in ly)
  float a = dot(du, du), b = dot(ro, du), c = dot(ro, ro) - 1.5625;
  float disc = b * b - a * c;
  if (disc <= 0.0) discard;
  float sq = sqrt(disc);
  float t0 = max((-b - sq) / a, 0.0), t1 = (-b + sq) / a;
  vec2 uv = gl_FragCoord.xy / uResolution;
  float dep = texture(tDepth, uv).r;
  if (dep < 0.99999) {
    float w = exp2(dep * log2(uFar + 1.0)) - 1.0;
    t1 = min(t1, w / uMetersPerLy);
  }
  if (t1 <= t0) discard;
  float jit = mix(0.5, ign(gl_FragCoord.xy + uFrame * 5.3), 16.0 / float(max(uSteps, 16)));
  float dt = (t1 - t0) / float(uSteps);
  vec3 L = vec3(0.0);
  float T = 1.0;
  for (int i = 0; i < 64; i++) {
    if (i >= uSteps) break;
    float t = t0 + (float(i) + jit) * dt;
    vec4 s = sampleNeb(ro + du * t);
    float tau = s.a * uDust * dt / uR;
    float Ts = exp(-tau);
    float f = tau > 1e-4 ? (1.0 - Ts) / tau : 1.0;
    L += T * s.rgb * uEmis * dt * f;
    T *= Ts;
    if (T < 0.003) break;
  }
  gl_FragColor = vec4(min(L * uPreExposure, vec3(6e4)), 1.0 - T);
}
`;

export class NebulaVolume {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private qN: THREE.Quaternion;

  constructor(readonly n: Nebula) {
    this.qN = new THREE.Quaternion(...n.q);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uType: { value: ['emission', 'planetary', 'supernova-remnant', 'reflection', 'dark'].indexOf(n.type) },
        uRo: { value: new THREE.Vector3() },
        uWorldToN: { value: new THREE.Matrix3() },
        uR: { value: n.radius },
        uEmis: { value: n.emissivity },
        uDust: { value: n.dust },
        uSeed: { value: (n.seed % 1000) / 137 },
        uSteps: { value: 32 },
        uFrame: { value: 0 },
        tDepth: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uFar: { value: 1e27 },
        uMetersPerLy: { value: LY },
        tNoise: { value: cloudDetailTexture() },
        tPreExposure: PRE_EXPOSURE_TEX,
      },
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      // premultiplied "over": dst = src.rgb + dst·(1 − src.a)
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), this.material);
    this.mesh.frustumCulled = false;
  }

  /** relLy: nebula centre relative to the camera in galaxy-local ly; gq: galaxy → world rotation. */
  update(relLy: THREE.Vector3, gq: THREE.Quaternion, steps: number, frame: number, depth: THREE.Texture, w: number, h: number) {
    const n = this.n;
    const u = this.material.uniforms;
    const inv = this.qN.clone().invert();
    // camera in unit space
    u.uRo.value.copy(relLy).negate().applyQuaternion(inv).divide(new THREE.Vector3(...n.axes).multiplyScalar(n.radius));
    // world dir → galaxy local → nebula local → scaled
    const m = new THREE.Matrix4().makeRotationFromQuaternion(inv.clone().multiply(gq.clone().invert()));
    const s = new THREE.Matrix4().makeScale(1 / (n.radius * n.axes[0]), 1 / (n.radius * n.axes[1]), 1 / (n.radius * n.axes[2]));
    u.uWorldToN.value.setFromMatrix4(s.multiply(m));
    u.uSteps.value = steps;
    u.uFrame.value = frame % 64;
    u.tDepth.value = depth;
    u.uResolution.value.set(w, h);
    // projectively shrunk box (see GalaxyVolume)
    const relW = relLy.clone().applyQuaternion(gq).multiplyScalar(LY);
    const half = n.radius * 1.25 * Math.max(...n.axes) * LY;
    const d = relW.length();
    const scale = 1e7 / (d + half);
    this.mesh.position.copy(relW).multiplyScalar(scale);
    this.mesh.quaternion.copy(gq).multiply(this.qN);
    this.mesh.scale.set(n.axes[0], n.axes[1], n.axes[2]).multiplyScalar(n.radius * 1.25 * LY * scale);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/** Keeps volumes for the nebulae worth drawing this frame. */
export class NebulaRenderer {
  readonly scene = new THREE.Scene();
  private volumes = new Map<string, NebulaVolume>();
  maxVolumes = 28;
  steps = 56;
  drawn = 0;

  update(nebulae: Nebula[], g: GalaxyParams | null, camG: THREE.Vector3, pixelAngle: number, frame: number, depth: THREE.Texture, w: number, h: number) {
    const used = new Set<string>();
    if (g) {
      const cand: { n: Nebula; rel: THREE.Vector3; ang: number }[] = [];
      for (const n of nebulae) {
        const rel = n.center.clone().sub(camG);
        const d = rel.length();
        const ang = n.radius / Math.max(d, 1e-6);
        if (ang < pixelAngle * 3 && d > n.radius * 1.3) continue;
        cand.push({ n, rel, ang });
      }
      cand.sort((a, b) => b.ang - a.ang);
      const list = cand.slice(0, this.maxVolumes).sort((a, b) => b.rel.length() - a.rel.length()); // far → near
      let order = 0;
      for (const c of list) {
        let v = this.volumes.get(c.n.id);
        if (!v) {
          v = new NebulaVolume(c.n);
          this.volumes.set(c.n.id, v);
          this.scene.add(v.mesh);
        }
        const px = c.ang / pixelAngle;
        v.update(c.rel, g.q, Math.round(Math.min(this.steps, Math.max(12, px / 2))), frame, depth, w, h);
        v.mesh.renderOrder = order++;
        used.add(c.n.id);
      }
    }
    for (const [id, v] of this.volumes) {
      if (used.has(id)) continue;
      this.scene.remove(v.mesh);
      v.dispose();
      this.volumes.delete(id);
    }
    this.drawn = used.size;
  }
}
