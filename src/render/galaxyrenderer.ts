/**
 * Galaxy rendering.
 *  - Volumetric: each galaxy large on screen (or containing the camera) is a
 *    back-faced bounding box whose shader ray-marches the same density model
 *    used to generate stars. Thin-disk emission and dust use an analytic
 *    vertical integral per step, so dust lanes and the Milky Way band stay
 *    sharp with few steps. Units: radiance relative to the solar constant/sr,
 *    identical to star sprites, so exposure balances them physically.
 *  - Unresolved: galaxies smaller than a few pixels are flux-conserving points.
 */
import * as THREE from 'three';
import { NOISE_GLSL } from './shaders/noise.glsl';
import type { GalaxyParams } from '../astro/galaxy';
import { meanLumV } from '../astro/starlib';
import { blackbodyRGB } from '../astro/stellar';
import { LY, SOLAR_CONSTANT, SOLAR_LUMINOSITY } from '../core/constants';
import { UPos } from '../core/upos';
import { PointSprites } from './points';
import { cloudDetailTexture } from './clouds';
import { PRE_EXPOSURE } from './exposure';


export const LUM_K = SOLAR_LUMINOSITY / (4 * Math.PI) / SOLAR_CONSTANT / (LY * LY); // L☉·ly⁻² → radiance units

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  // the box is drawn projectively shrunk to ~1e7 m (only its screen footprint matters)
  vWorld = wp.xyz * 1e-3;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE_GLSL}
uniform float uType;      // 0 disk galaxy, 1 elliptical
uniform float uR, uHs, uHz, uBs, uBw, uBarL, uBarA, uArms, uPitch, uArmW, uArmC, uRing, uDust, uSF, uIrr, uSeed;
uniform vec3 uEll;
uniform float uRho0;
uniform vec3 uCamG;       // camera in galaxy-local ly
uniform mat3 uWorldToG;   // world direction → galaxy local
uniform vec3 uBoxHalf;    // ly
uniform vec3 uColOld, uColYoung, uColBulge;
uniform vec3 uLum;        // mean visual L☉ per star: (disk, young, bulge)
uniform float uK;
uniform float uExclude;   // ly: resolved-star region excluded from the glow
uniform int uSteps;
uniform float uFrame;
uniform sampler2D tDepth;
uniform vec2 uResolution;
uniform float uFar;
uniform float uMetersPerLy;
uniform sampler3D tNoise;
uniform float uPreExposure;
varying vec3 vWorld;
float tex3(vec3 p) { return texture(tNoise, p).r; }

float armF(vec2 xz, float shift) {
  if (uArms < 0.5) return 0.0;
  float r = length(xz) + 1.0;
  float th = atan(xz.y, xz.x);
  float ph = uArms * (th - log(r / (uHs * 0.3)) / tan(uPitch)) + shift;
  float c = 0.5 + 0.5 * cos(ph);
  return pow(c, 1.0 + 8.0 * (1.0 - uArmW));
}
float vertInt(float y0, float vy, float L, float h) {
  if (abs(vy) * L < h * 1e-3) return L * exp(-abs(y0) / h);
  float y1 = y0 + vy * L;
  float k = h / abs(vy);
  if (y0 * y1 >= 0.0) return k * abs(exp(-abs(y0) / h) - exp(-abs(y1) / h));
  return k * ((1.0 - exp(-abs(y0) / h)) + (1.0 - exp(-abs(y1) / h)));
}
vec2 boxHit(vec3 ro, vec3 rd, vec3 b) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (-b - ro) * inv, t1 = (b - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 rdW = normalize(vWorld);
  vec3 rd = normalize(uWorldToG * rdW);
  vec3 ro = uCamG;
  vec2 hit = boxHit(ro, rd, uBoxHalf);
  float t0 = max(hit.x, 0.0), t1 = hit.y;
  // scene depth (planets etc. occlude the galaxy)
  vec2 uv = gl_FragCoord.xy / uResolution;
  float dep = texture(tDepth, uv).r;
  if (dep < 0.99999) {
    float w = exp2(dep * log2(uFar + 1.0)) - 1.0;
    t1 = min(t1, w / uMetersPerLy);
  }
  if (t1 <= t0) discard;
  float jit = ign(gl_FragCoord.xy + uFrame * 7.13);
  vec3 L = vec3(0.0);
  vec3 T = vec3(1.0);
  int N = uSteps;
  float fn = float(N);
  bool inside = hit.x < 0.0;
  for (int i = 0; i < 128; i++) {
    if (i >= N) break;
    float s0 = (float(i)) / fn, s1 = (float(i) + 1.0) / fn;
    float ta, tb;
    if (inside) { ta = t0 + (t1 - t0) * s0 * s0; tb = t0 + (t1 - t0) * s1 * s1; }
    else { ta = t0 + (t1 - t0) * s0; tb = t0 + (t1 - t0) * s1; }
    float seg = tb - ta;
    float tm = ta + seg * (0.25 + 0.5 * jit);
    vec3 p = ro + rd * tm;
    vec3 pa = ro + rd * ta;
    float dCam = tm;
    float near = uExclude > 0.0 ? smoothstep(uExclude * 0.15, uExclude, dCam) : 1.0;
    vec3 emis;
    vec3 tau = vec3(0.0);
    float r = length(p.xz);
    float sph = length(p);
    if (uType > 0.5) {
      vec3 m3 = p / uEll;
      float m = length(m3);
      float bul = uRho0 * pow(1.0 + (m / uBs) * (m / uBs), -1.5);
      emis = uColBulge * bul * uLum.z * seg;
      float dd = uDust * 2e-4 * exp(-m / (uBs * 0.5)) * seg;
      tau = dd * vec3(0.75, 1.0, 1.32);
    } else {
      float radial = exp(-r / uHs);
      if (uRing > 0.0) { float dr = (r - uRing) / (uHs * 0.35); radial = 0.15 * radial + exp(-dr * dr); }
      float arm = armF(p.xz, 0.0);
      float lump = 1.0;
      if (uIrr > 0.5) lump = 0.3 + 1.6 * smoothstep(0.35, 0.75, tex3(p / uHs * 0.35 + uSeed * 0.1));
      float vI = vertInt(pa.y, rd.y, seg, uHz);
      float vIy = vertInt(pa.y, rd.y, seg, uHz * 0.35);
      float disk = uRho0 * radial * (1.0 - uArmC * 0.35 + uArmC * 0.7 * arm) * vI * lump;
      // young population with HII knots along the arms
      float knot = smoothstep(0.62, 0.9, tex3(p / 2600.0 + uSeed * 0.07)) * (0.2 + arm);
      float young = uRho0 * 0.08 * uSF * radial * (0.1 + 3.0 * arm * uArmC) * vIy * lump;
      // bulge + bar + halo (smooth: midpoint rule)
      float bul = uRho0 * uBw * uBs / (sph + uBs * 0.15) * pow(1.0 + sph / uBs, -3.0) * 0.15;
      if (uBarL > 0.0) {
        float ca = cos(uBarA), sa = sin(uBarA);
        float bx = p.x * ca + p.z * sa, bz = -p.x * sa + p.z * ca;
        bul += uRho0 * 1.6 * exp(-sqrt((bx / uBarL) * (bx / uBarL) + (bz / (uBarL * 0.3)) * (bz / (uBarL * 0.3)) + (p.y / (uHz * 1.5)) * (p.y / (uHz * 1.5))) * 2.2);
      }
      bul += uRho0 * 0.0015 * pow(1.0 + sph / (uHs * 1.5), -3.2);
      emis = uColOld * disk * uLum.x + uColYoung * young * uLum.y * (1.0 + 2.5 * knot) + vec3(1.0, 0.3, 0.42) * young * uLum.y * knot * 1.2
           + uColBulge * bul * uLum.z * seg;
      // dust: thin layer, concentrated on the inner (trailing) edges of arms, filamentary
      float fil = 0.25 + 1.5 * smoothstep(0.35, 0.8, tex3(p / 5200.0 + uSeed * 0.13) * 0.65 + tex3(p / 1300.0) * 0.35);
      float dArm = armF(p.xz, 0.55);
      float dd = uDust * 0.0055 * exp(-r / (uHs * 1.2)) * (0.3 + 1.8 * dArm * max(uArmC, 0.3)) * fil * vIy * lump;
      tau = dd * vec3(0.75, 1.0, 1.32);
    }
    emis *= near * uK;
    vec3 Ts = exp(-tau);
    vec3 f = mix(vec3(1.0), (1.0 - Ts) / max(tau, vec3(1e-6)), step(vec3(1e-4), tau));
    L += T * emis * f;
    T *= Ts;
    if (max(T.r, max(T.g, T.b)) < 0.002) break;
  }
  gl_FragColor = vec4(min(L * uPreExposure, vec3(6e4)), 1.0);
}
`;

export class GalaxyVolume {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly half = new THREE.Vector3();

  constructor(readonly g: GalaxyParams) {
    const ell = g.type === 'elliptical' || g.type === 'dwarf-elliptical';
    const R = g.radius;
    this.half.set(R * (ell ? 1.6 : 1.35), ell ? R * 1.6 * g.ellipAxes[1] : Math.max(g.diskHeight * 12, g.bulgeScale * 4, g.barLength * 0.3), R * (ell ? 1.6 : 1.35));
    // luminosity normalisation independent of star-sector normalisation
    const rho0 = Math.max(g.centralDensity, 0) || this.estimateRho0();
    const old = blackbodyRGB(5200), young = blackbodyRGB(14000), bulge = blackbodyRGB(4300);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uType: { value: ell ? 1 : 0 },
        uR: { value: R }, uHs: { value: g.diskScale }, uHz: { value: g.diskHeight }, uBs: { value: g.bulgeScale }, uBw: { value: g.bulgeWeight },
        uBarL: { value: g.barLength }, uBarA: { value: g.barAngle }, uArms: { value: g.arms }, uPitch: { value: g.pitch }, uArmW: { value: g.armWidth },
        uArmC: { value: g.armContrast }, uRing: { value: g.ringRadius }, uDust: { value: g.dust }, uSF: { value: g.starFormation },
        uIrr: { value: g.type === 'irregular' || g.type === 'dwarf-irregular' ? 1 : 0 }, uSeed: { value: (g.seed % 997) / 10 },
        uEll: { value: new THREE.Vector3(...g.ellipAxes) },
        uRho0: { value: rho0 },
        uCamG: { value: new THREE.Vector3() },
        uWorldToG: { value: new THREE.Matrix3() },
        uBoxHalf: { value: this.half.clone() },
        uColOld: { value: new THREE.Vector3(...old) }, uColYoung: { value: new THREE.Vector3(...young) }, uColBulge: { value: new THREE.Vector3(...bulge) },
        uLum: { value: new THREE.Vector3(meanLumV('disk'), meanLumV('young'), meanLumV('bulge')) },
        uK: { value: LUM_K },
        uExclude: { value: 0 },
        uSteps: { value: 48 },
        uFrame: { value: 0 },
        tDepth: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uFar: { value: 1e27 },
        uMetersPerLy: { value: LY },
        tNoise: { value: cloudDetailTexture() },
        uPreExposure: PRE_EXPOSURE,
      },
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });
    const geo = new THREE.BoxGeometry(2, 2, 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  private estimateRho0() {
    // integrated luminosity ≈ L: centralDensity via the same MC integral as stars (cheap version)
    const g = this.g;
    const n = g.stellarMass / 0.6;
    const ell = g.type.includes('elliptical');
    const vol = ell ? (4 / 3) * Math.PI * Math.pow(g.bulgeScale, 3) * 12 : 4 * Math.PI * g.diskScale * g.diskScale * g.diskHeight * 1.6;
    return n / vol;
  }

  /** rel: galaxy centre relative to camera (m, world axes). */
  update(rel: THREE.Vector3, _camQ: THREE.Quaternion, steps: number, frame: number, depth: THREE.Texture, w: number, h: number, exclude: number) {
    const g = this.g;
    const u = this.material.uniforms;
    // camera in galaxy-local ly
    const qi = g.q.clone().invert();
    u.uCamG.value.copy(rel).negate().applyQuaternion(qi).multiplyScalar(1 / LY);
    u.uWorldToG.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(qi));
    u.uSteps.value = steps;
    u.uFrame.value = frame % 64;
    u.tDepth.value = depth;
    u.uResolution.value.set(w, h);
    u.uExclude.value = exclude;
    // box mesh: centred on the galaxy, oriented, then shrunk toward the camera by a
    // common factor (projectively identical) so vertex coordinates stay ~1e7 m —
    // rasterisers produce NaN varyings for ~1e21 m clip coordinates
    const d = rel.length();
    const scale = 1e7 / (d + this.half.length() * LY);
    this.mesh.position.copy(rel).multiplyScalar(scale);
    this.mesh.quaternion.copy(g.q);
    this.mesh.scale.copy(this.half).multiplyScalar(LY * scale);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/** Manages volumetric galaxies + unresolved galaxy points. */
export class GalaxyRenderer {
  /** volumetric boxes: rendered as an overlay pass after the scene (they read scene depth) */
  readonly group = new THREE.Group();
  /** unresolved galaxies: belong in the main scene (depth-tested against planets) */
  readonly points: PointSprites;
  private volumes = new Map<string, GalaxyVolume>();
  steps = 48;

  constructor(adapt: () => THREE.Texture) {
    this.points = new PointSprites(4096, adapt);
    this.points.points.renderOrder = -5;
  }

  update(galaxies: GalaxyParams[], cam: UPos, camQ: THREE.Quaternion, pixelAngle: number, frame: number, depth: THREE.Texture, w: number, h: number, current: GalaxyParams | null) {
    const used = new Set<string>();
    this.points.begin();
    this.points.material.uniforms.uPixelAngle.value = pixelAngle;
    const rel = new THREE.Vector3();
    for (const g of galaxies) {
      g.upos.sub(cam, rel);
      const d = rel.length();
      const ang = (g.radius * LY) / Math.max(d, 1);
      const inside = g === current || d < g.radius * LY * 1.4;
      if (inside || ang > pixelAngle * 6) {
        let v = this.volumes.get(g.id);
        if (!v) {
          v = new GalaxyVolume(g);
          this.volumes.set(g.id, v);
          this.group.add(v.mesh);
        }
        const steps = inside ? this.steps : Math.max(12, Math.min(this.steps, Math.round(ang / pixelAngle / 4)));
        v.update(rel, camQ, steps, frame, depth, w, h, inside ? 900 : 0);
        used.add(g.id);
      }
      if (!inside && ang < pixelAngle * 12) {
        const lumV = g.stellarMass / 1.8; // L☉ visual (mass-to-light ≈ 1.8)
        const flux = (lumV * 3.828e26) / (4 * Math.PI * d * d) / 1361;
        const col = g.type.includes('elliptical') || g.type === 'lenticular' ? [1.15, 1.0, 0.8] : [1.0, 0.98, 1.0];
        const fade = Math.min(1, Math.max(0, (pixelAngle * 12 - ang) / (pixelAngle * 6)));
        this.points.add(rel, col, flux * fade);
      }
    }
    this.points.end();
    for (const [id, v] of this.volumes) {
      if (!used.has(id)) {
        this.group.remove(v.mesh);
        v.dispose();
        this.volumes.delete(id);
      }
    }
  }
}
