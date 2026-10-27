/**
 * Atmosphere model + GPU look-up tables.
 *
 * Parameters are derived from the planet's physical model (composition,
 * surface pressure, gravity, temperature – see astro/planetgen.ts):
 *   scale height H = k_B T / (m g)
 *   Rayleigh coefficients ∝ number density × molecular polarisability, λ⁻⁴
 *   Mie (aerosol/dust/haze) amount and tint from dust, sulfuric acid, tholins
 *   absorption from O3 (Chappuis band) or CH4 (red absorption → cyan giants)
 *
 * LUTs (per atmosphere, computed once on the GPU):
 *   transmittance 256×64, multiple-scattering 32×32 (Hillaire 2020),
 *   ground sky-irradiance 64×16.
 */
import * as THREE from 'three';
import { ATMOSPHERE_UNIFORMS, ATMOSPHERE_FUNCS, ATMOSPHERE_LUT_FUNCS } from './shaders/atmosphere.glsl';

export interface AtmosphereParams {
  bottomRadius: number;
  topRadius: number;
  rayleigh: [number, number, number];
  rayleighH: number;
  mieScat: [number, number, number];
  mieExt: [number, number, number];
  mieH: number;
  mieG: number;
  absorb: [number, number, number];
  absCenter: number; // m, or -1 for exponential profile
  absWidth: number;
  groundAlbedo: [number, number, number];
}

/** Earth reference (Hillaire 2020 values). */
export function earthAtmosphere(R = 6.36e6): AtmosphereParams {
  return {
    bottomRadius: R,
    topRadius: R + 100e3,
    rayleigh: [5.802e-6, 13.558e-6, 33.1e-6],
    rayleighH: 8000,
    mieScat: [3.996e-6, 3.996e-6, 3.996e-6],
    mieExt: [4.44e-6, 4.44e-6, 4.44e-6],
    mieH: 1200,
    mieG: 0.8,
    absorb: [0.65e-6, 1.881e-6, 0.085e-6],
    absCenter: 25000,
    absWidth: 15000,
    groundAlbedo: [0.3, 0.3, 0.3],
  };
}

export function setAtmosphereUniforms(u: Record<string, THREE.IUniform>, p: AtmosphereParams) {
  const v3 = (k: string, a: number[]) => {
    if (!u[k]) u[k] = { value: new THREE.Vector3() };
    (u[k].value as THREE.Vector3).set(a[0], a[1], a[2]);
  };
  const f = (k: string, x: number) => {
    if (!u[k]) u[k] = { value: 0 };
    u[k].value = x;
  };
  f('uRg', p.bottomRadius);
  f('uRt', p.topRadius);
  v3('uRayleigh', p.rayleigh);
  f('uRayleighH', p.rayleighH);
  v3('uMieScat', p.mieScat);
  v3('uMieExt', p.mieExt);
  f('uMieH', p.mieH);
  f('uMieG', p.mieG);
  v3('uAbsorb', p.absorb);
  f('uAbsCenter', p.absCenter);
  f('uAbsWidth', p.absWidth);
  v3('uGroundAlbedo', p.groundAlbedo);
}

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const TRANSMITTANCE_FRAG = /* glsl */ `
${ATMOSPHERE_UNIFORMS}
${ATMOSPHERE_FUNCS}
varying vec2 vUv;
void main() {
  float r, mu;
  transmittanceRMu(vUv, r, mu);
  float d = distToTop(r, mu);
  const int N = 48;
  float dt = d / float(N);
  vec3 od = vec3(0.0);
  for (int i = 0; i < N; i++) {
    float t = (float(i) + 0.5) * dt;
    float ri = sqrt(r * r + t * t + 2.0 * r * mu * t);
    vec3 ext, ms;
    atmScattering(ri - uRg, ext, ms);
    od += ext * dt;
  }
  gl_FragColor = vec4(exp(-od), 1.0);
}
`;

const MULTISCAT_FRAG = /* glsl */ `
${ATMOSPHERE_UNIFORMS}
${ATMOSPHERE_FUNCS}
uniform sampler2D uTransmittanceLUT;
varying vec2 vUv;
vec3 tLUT(float r, float mu) { return texture(uTransmittanceLUT, transmittanceUV(atmClampR(r), mu)).rgb; }
vec3 sunT(float r, float muS) {
  float sinH = uRg / r; float cosH = -sqrt(max(0.0, 1.0 - sinH * sinH));
  return muS < cosH ? vec3(0.0) : tLUT(r, muS);
}
void main() {
  vec2 uv = (vUv - 0.5 / 32.0) * (32.0 / 31.0);
  float muS = uv.x * 2.0 - 1.0;
  float r = uRg + clamp(uv.y, 0.002, 0.998) * (uRt - uRg);
  vec3 sunDir = vec3(sqrt(max(0.0, 1.0 - muS * muS)), muS, 0.0);
  vec3 ro = vec3(0.0, r, 0.0);
  const int NDIR = 64;
  const int NS = 20;
  vec3 sumL = vec3(0.0), sumF = vec3(0.0);
  for (int i = 0; i < NDIR; i++) {
    float fi = float(i) + 0.5;
    float z = 1.0 - 2.0 * fi / float(NDIR);
    float a = fi * 2.39996323;
    float s = sqrt(max(0.0, 1.0 - z * z));
    vec3 rd = vec3(s * cos(a), z, s * sin(a));
    float mu = rd.y;
    bool ground = hitsGround(r, mu);
    float tMax = ground ? distToBottom(r, mu) : distToTop(r, mu);
    float dt = tMax / float(NS);
    vec3 T = vec3(1.0), L = vec3(0.0), F = vec3(0.0);
    for (int j = 0; j < NS; j++) {
      float t = (float(j) + 0.5) * dt;
      vec3 p = ro + rd * t;
      float h = length(p);
      vec3 ext, mieS;
      vec3 rs = atmScattering(h - uRg, ext, mieS);
      vec3 sc = rs + mieS;
      vec3 Ts = exp(-ext * dt);
      vec3 Tsun = sunT(h, dot(p, sunDir) / h);
      vec3 S = sc * Tsun * (1.0 / (4.0 * PI));
      vec3 Sint = (S - S * Ts) / max(ext, vec3(1e-12));
      vec3 Fint = (sc - sc * Ts) / max(ext, vec3(1e-12));
      L += T * Sint;
      F += T * Fint;
      T *= Ts;
    }
    if (ground) {
      vec3 p = ro + rd * tMax;
      vec3 n = normalize(p);
      float muSg = dot(n, sunDir);
      L += T * sunT(uRg, muSg) * max(muSg, 0.0) * uGroundAlbedo / PI;
    }
    sumL += L;
    sumF += F;
  }
  vec3 L2 = sumL / float(NDIR);
  vec3 fms = sumF / float(NDIR);
  vec3 psi = L2 / max(1.0 - fms, vec3(1e-3));
  gl_FragColor = vec4(psi, 1.0);
}
`;

const IRRADIANCE_FRAG = /* glsl */ `
${ATMOSPHERE_UNIFORMS}
${ATMOSPHERE_FUNCS}
${ATMOSPHERE_LUT_FUNCS}
varying vec2 vUv;
void main() {
  vec2 uv = (vUv - vec2(0.5/64.0, 0.5/16.0)) / vec2(63.0/64.0, 15.0/16.0);
  float muS = uv.x * 2.0 - 1.0;
  float r = uRg + clamp(uv.y, 0.001, 0.999) * (uRt - uRg);
  vec3 sunDir = vec3(sqrt(max(0.0, 1.0 - muS * muS)), muS, 0.0);
  vec3 ro = vec3(0.0, r, 0.0);
  const int NDIR = 48;
  const int NS = 16;
  vec3 E = vec3(0.0);
  for (int i = 0; i < NDIR; i++) {
    // cosine-weighted hemisphere (Fibonacci)
    float fi = float(i) + 0.5;
    float u1 = fi / float(NDIR);
    float a = fi * 2.39996323;
    float ct = sqrt(1.0 - u1);
    float st = sqrt(u1);
    vec3 rd = vec3(st * cos(a), ct, st * sin(a));
    float mu = rd.y;
    float tMax = hitsGround(r, mu) ? distToBottom(r, mu) : distToTop(r, mu);
    float dt = tMax / float(NS);
    float c = dot(rd, sunDir);
    float pr = phaseRayleigh(c), pm = phaseMie(c, uMieG);
    vec3 T = vec3(1.0), L = vec3(0.0);
    for (int j = 0; j < NS; j++) {
      float t = (float(j) + 0.5) * dt;
      vec3 p = ro + rd * t;
      float h = length(p);
      vec3 ext, mieS;
      vec3 rs = atmScattering(h - uRg, ext, mieS);
      float muSp = dot(p, sunDir) / h;
      vec3 Tsun = sunTransmittance(h, muSp);
      vec3 S = (rs * pr + mieS * pm) * Tsun + (rs + mieS) * multiScat(h, muSp);
      vec3 Ts = exp(-ext * dt);
      L += T * (S - S * Ts) / max(ext, vec3(1e-12));
      T *= Ts;
    }
    E += L;
  }
  // cosine-weighted estimator: E = π/N Σ L
  gl_FragColor = vec4(E * PI / float(NDIR), 1.0);
}
`;

let fsScene: THREE.Scene | null = null;
let fsCam: THREE.OrthographicCamera | null = null;
let fsMesh: THREE.Mesh | null = null;
function fullscreen() {
  if (!fsScene) {
    fsScene = new THREE.Scene();
    fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    fsMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    fsMesh.frustumCulled = false;
    fsScene.add(fsMesh);
  }
  return { scene: fsScene, cam: fsCam!, mesh: fsMesh! };
}

function makeTarget(w: number, h: number) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    generateMipmaps: false,
  });
}

/** Precomputed atmosphere LUTs for one planet. */
export class AtmosphereLUTs {
  readonly transmittance = makeTarget(256, 64);
  readonly multiScat = makeTarget(32, 32);
  readonly irradiance = makeTarget(64, 16);
  readonly uniforms: Record<string, THREE.IUniform> = {};
  private static mats: { t: THREE.ShaderMaterial; m: THREE.ShaderMaterial; i: THREE.ShaderMaterial } | null = null;

  constructor(readonly params: AtmosphereParams) {
    setAtmosphereUniforms(this.uniforms, params);
  }

  compute(renderer: THREE.WebGLRenderer) {
    if (!AtmosphereLUTs.mats) {
      const mk = (frag: string) => {
        const u: Record<string, THREE.IUniform> = {};
        setAtmosphereUniforms(u, this.params);
        u.uTransmittanceLUT = { value: null };
        u.uMultiScatLUT = { value: null };
        return new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms: u, depthTest: false, depthWrite: false });
      };
      AtmosphereLUTs.mats = { t: mk(TRANSMITTANCE_FRAG), m: mk(MULTISCAT_FRAG), i: mk(IRRADIANCE_FRAG) };
    }
    const { t, m, i } = AtmosphereLUTs.mats;
    const fs = fullscreen();
    const prev = renderer.getRenderTarget();
    const run = (mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget) => {
      // update values in place: three.js caches the uniform objects per compiled program
      setAtmosphereUniforms(mat.uniforms, this.params);
      mat.uniforms.uTransmittanceLUT.value = this.transmittance.texture;
      mat.uniforms.uMultiScatLUT.value = this.multiScat.texture;
      mat.uniformsNeedUpdate = true;
      fs.mesh.material = mat;
      renderer.setRenderTarget(target);
      renderer.render(fs.scene, fs.cam);
    };
    run(t, this.transmittance);
    run(m, this.multiScat);
    run(i, this.irradiance);
    renderer.setRenderTarget(prev);
  }

  /** Uniforms (params + LUT textures) for materials that shade with this atmosphere. */
  bind(u: Record<string, THREE.IUniform>) {
    setAtmosphereUniforms(u, this.params);
    u.uTransmittanceLUT = { value: this.transmittance.texture };
    u.uMultiScatLUT = { value: this.multiScat.texture };
    u.uIrradianceLUT = { value: this.irradiance.texture };
  }

  dispose() {
    this.transmittance.dispose();
    this.multiScat.dispose();
    this.irradiance.dispose();
  }
}

export { FS_VERT };
