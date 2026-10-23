import * as THREE from 'three';
import { U } from '../engine/uniforms.js';
import { FullscreenPass, makeFullscreenMaterial } from '../engine/fullscreen.js';

// Physically based atmosphere after Hillaire 2020 ("A Scalable and Production Ready Sky
// and Atmosphere Rendering Technique"): transmittance LUT, multiple-scattering LUT and a
// per-frame sky-view LUT, plus a tiny lighting probe so every material shares the same
// sun colour and sky ambient. Distances are in km inside the atmosphere shaders.
//
// Saharan dust is modelled as extra Mie aerosol: more scattering, a taller layer, and
// absorption that removes more blue than red (iron oxides), so haze turns ochre.

const TRANS_W = 256;
const TRANS_H = 64;
const MS_SIZE = 32;
const SKY_W = 192;
const SKY_H = 108;
export const PROBE_TEXELS = 8;

// Probe texel layout (also read by materials via texelFetch).
// 0: sun irradiance at the camera, 1: moon irradiance, 2: SH irradiance constant,
// 3-5: SH irradiance x/y/z terms, 6: storm-dust radiance, 7: r = auto-exposure target.

export const ATMOSPHERE_PARAMS_GLSL = /* glsl */ `
#ifndef ATMOSPHERE_PARAMS_GLSL
#define ATMOSPHERE_PARAMS_GLSL
const float ATM_RG = 6360.0;
const float ATM_RT = 6460.0;
const float ATM_PI = 3.14159265359;
uniform vec3 uRayleighScat;
uniform vec3 uMieScat;
uniform vec3 uMieExt;
uniform float uMieH;
uniform float uMieG;
uniform vec3 uOzoneAbs;
uniform vec3 uGroundAlbedo;
uniform vec3 uSunIllum;
uniform vec3 uMoonIllum;

struct AtmMedium {
  vec3 scatR;
  vec3 scatM;
  vec3 ext;
};

AtmMedium atmMedium(float h) {
  float dR = exp(-h / 8.0);
  float dM = exp(-h / uMieH);
  float dO = max(0.0, 1.0 - abs(h - 25.0) / 15.0);
  AtmMedium m;
  m.scatR = uRayleighScat * dR;
  m.scatM = uMieScat * dM;
  m.ext = m.scatR + uMieExt * dM + uOzoneAbs * dO;
  return m;
}

// Distance to the sphere of radius R along rd, nearest positive hit; -1 if none.
float atmRaySphere(vec3 ro, vec3 rd, float R) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - R * R;
  float disc = b * b - c;
  if (disc < 0.0) return -1.0;
  float s = sqrt(disc);
  float t0 = -b - s;
  float t1 = -b + s;
  if (t0 > 0.0) return t0;
  if (t1 > 0.0) return t1;
  return -1.0;
}

float atmPhaseR(float c) {
  return 3.0 / (16.0 * ATM_PI) * (1.0 + c * c);
}

// Cornette-Shanks phase function.
float atmPhaseM(float c, float g) {
  float g2 = g * g;
  float k = 3.0 / (8.0 * ATM_PI) * (1.0 - g2) / (2.0 + g2);
  return k * (1.0 + c * c) / pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5);
}

float atmFromUnitToSubUv(float u, float res) {
  return (u + 0.5 / res) * (res / (res + 1.0));
}
float atmFromSubUvToUnit(float u, float res) {
  return (u - 0.5 / res) * (res / (res - 1.0));
}

vec2 atmTransmittanceUV(float r, float mu) {
  float H = sqrt(ATM_RT * ATM_RT - ATM_RG * ATM_RG);
  float rho = sqrt(max(0.0, r * r - ATM_RG * ATM_RG));
  float disc = r * r * (mu * mu - 1.0) + ATM_RT * ATM_RT;
  float d = max(0.0, -r * mu + sqrt(max(disc, 0.0)));
  float dMin = ATM_RT - r;
  float dMax = rho + H;
  return vec2((d - dMin) / (dMax - dMin), rho / H);
}
#endif
`;

export const TRANSMITTANCE_LOOKUP_GLSL = /* glsl */ `
#ifndef ATM_TRANSMITTANCE_LOOKUP
#define ATM_TRANSMITTANCE_LOOKUP
uniform sampler2D tTransmittance;
vec3 atmTransmittance(float r, float mu) {
  vec2 uv = atmTransmittanceUV(r, mu);
  uv = vec2(atmFromUnitToSubUv(uv.x, ${TRANS_W}.0), atmFromUnitToSubUv(uv.y, ${TRANS_H}.0));
  return textureLod(tTransmittance, uv, 0.0).rgb;
}
// Transmittance toward a light, zero when the planet blocks it (with a soft edge for
// the solar disc sinking below the horizon).
vec3 atmLightTransmittance(vec3 pos, vec3 L) {
  float r = length(pos);
  vec3 up = pos / r;
  float mu = dot(up, L);
  float horizon = -sqrt(max(0.0, 1.0 - (ATM_RG * ATM_RG) / (r * r)));
  float vis = smoothstep(horizon - 0.0046, horizon + 0.0046, mu);
  return atmTransmittance(r, mu) * vis;
}
#endif
`;

const TRANSMITTANCE_FRAG = /* glsl */ `
${ATMOSPHERE_PARAMS_GLSL}
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(${TRANS_W}.0, ${TRANS_H}.0);
  float xmu = atmFromSubUvToUnit(uv.x, ${TRANS_W}.0);
  float xr = atmFromSubUvToUnit(uv.y, ${TRANS_H}.0);
  float H = sqrt(ATM_RT * ATM_RT - ATM_RG * ATM_RG);
  float rho = H * xr;
  float r = sqrt(rho * rho + ATM_RG * ATM_RG);
  float dMin = ATM_RT - r;
  float dMax = rho + H;
  float d = dMin + xmu * (dMax - dMin);
  float mu = d == 0.0 ? 1.0 : (H * H - rho * rho - d * d) / (2.0 * r * d);
  mu = clamp(mu, -1.0, 1.0);
  vec3 ro = vec3(0.0, r, 0.0);
  vec3 rd = vec3(sqrt(max(0.0, 1.0 - mu * mu)), mu, 0.0);
  float tMax = atmRaySphere(ro, rd, ATM_RT);
  vec3 od = vec3(0.0);
  const int STEPS = 40;
  float dt = tMax / float(STEPS);
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * (float(i) + 0.5) * dt;
    od += atmMedium(length(p) - ATM_RG).ext * dt;
  }
  gl_FragColor = vec4(exp(-od), 1.0);
}
`;

const MULTISCATTER_FRAG = /* glsl */ `
${ATMOSPHERE_PARAMS_GLSL}
${TRANSMITTANCE_LOOKUP_GLSL}
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(${MS_SIZE}.0);
  float muS = atmFromSubUvToUnit(uv.x, ${MS_SIZE}.0) * 2.0 - 1.0;
  float r = ATM_RG + clamp(atmFromSubUvToUnit(uv.y, ${MS_SIZE}.0), 0.0, 1.0) * (ATM_RT - ATM_RG) + 0.01;
  vec3 ro = vec3(0.0, r, 0.0);
  vec3 L = vec3(sqrt(max(0.0, 1.0 - muS * muS)), muS, 0.0);
  const int SQ = 8;
  const int STEPS = 20;
  vec3 lum = vec3(0.0);
  vec3 fms = vec3(0.0);
  float phaseU = 1.0 / (4.0 * ATM_PI);
  for (int i = 0; i < SQ; i++) {
    for (int j = 0; j < SQ; j++) {
      float theta = 2.0 * ATM_PI * (float(i) + 0.5) / float(SQ);
      float cphi = 1.0 - 2.0 * (float(j) + 0.5) / float(SQ);
      float sphi = sqrt(max(0.0, 1.0 - cphi * cphi));
      vec3 rd = vec3(cos(theta) * sphi, cphi, sin(theta) * sphi);
      float tG = atmRaySphere(ro, rd, ATM_RG);
      float tT = atmRaySphere(ro, rd, ATM_RT);
      float tMax = tG > 0.0 ? tG : tT;
      float dt = tMax / float(STEPS);
      vec3 thr = vec3(1.0);
      vec3 Lr = vec3(0.0);
      vec3 Fr = vec3(0.0);
      for (int s = 0; s < STEPS; s++) {
        vec3 p = ro + rd * (float(s) + 0.5) * dt;
        AtmMedium m = atmMedium(length(p) - ATM_RG);
        vec3 scat = m.scatR + m.scatM;
        vec3 stepT = exp(-m.ext * dt);
        vec3 integ = (vec3(1.0) - stepT) / max(m.ext, vec3(1e-7));
        vec3 sunT = atmLightTransmittance(p, L);
        Lr += thr * scat * phaseU * sunT * integ;
        Fr += thr * scat * integ;
        thr *= stepT;
      }
      if (tG > 0.0) {
        vec3 pg = ro + rd * tG;
        vec3 up = normalize(pg);
        Lr += thr * atmLightTransmittance(pg, L) * max(dot(up, L), 0.0) * uGroundAlbedo / ATM_PI;
      }
      lum += Lr;
      fms += Fr;
    }
  }
  float w = 4.0 * ATM_PI / float(SQ * SQ) * phaseU;
  lum *= w;
  fms *= w;
  gl_FragColor = vec4(lum / max(vec3(1e-4), vec3(1.0) - fms), 1.0);
}
`;

// Sky-view LUT, absolute azimuth (so both sun and moon can light it) and a latitude
// mapping that concentrates texels near the horizon.
export const SKYVIEW_MAPPING_GLSL = /* glsl */ `
#ifndef SKYVIEW_MAPPING_GLSL
#define SKYVIEW_MAPPING_GLSL
// dir: world direction (y up). Returns LUT uv.
vec2 skyViewUV(vec3 dir, float camR) {
  float horizonDip = acos(clamp(sqrt(max(0.0, camR * camR - ATM_RG * ATM_RG)) / camR, -1.0, 1.0));
  float elev = asin(clamp(dir.y, -1.0, 1.0)) + horizonDip;
  float halfPi = 0.5 * ATM_PI;
  float v = elev >= 0.0
    ? 0.5 + 0.5 * sqrt(clamp(elev / (halfPi + horizonDip), 0.0, 1.0))
    : 0.5 - 0.5 * sqrt(clamp(-elev / (halfPi - horizonDip), 0.0, 1.0));
  float az = atan(dir.x, -dir.z); // 0 = north (-z), clockwise toward east (+x)
  return vec2(az / (2.0 * ATM_PI) + 0.5, v);
}
vec3 skyViewDir(vec2 uv, float camR) {
  float horizonDip = acos(clamp(sqrt(max(0.0, camR * camR - ATM_RG * ATM_RG)) / camR, -1.0, 1.0));
  float halfPi = 0.5 * ATM_PI;
  float elev;
  if (uv.y >= 0.5) {
    float t = (uv.y - 0.5) * 2.0;
    elev = t * t * (halfPi + horizonDip) - horizonDip;
  } else {
    float t = (0.5 - uv.y) * 2.0;
    elev = -t * t * (halfPi - horizonDip) - horizonDip;
  }
  float az = (uv.x - 0.5) * 2.0 * ATM_PI;
  float ce = cos(elev);
  return vec3(sin(az) * ce, sin(elev), -cos(az) * ce);
}
#endif
`;

const SKYVIEW_FRAG = /* glsl */ `
${ATMOSPHERE_PARAMS_GLSL}
${TRANSMITTANCE_LOOKUP_GLSL}
${SKYVIEW_MAPPING_GLSL}
uniform sampler2D tMultiScatter;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uCameraAltitude;

vec3 msLookup(float r, float muS) {
  vec2 uv = vec2(muS * 0.5 + 0.5, (r - ATM_RG) / (ATM_RT - ATM_RG));
  uv = vec2(atmFromUnitToSubUv(uv.x, ${MS_SIZE}.0), atmFromUnitToSubUv(clamp(uv.y, 0.0, 1.0), ${MS_SIZE}.0));
  return textureLod(tMultiScatter, uv, 0.0).rgb;
}

void main() {
  vec2 uv = gl_FragCoord.xy / vec2(${SKY_W}.0, ${SKY_H}.0);
  float camR = ATM_RG + max(uCameraAltitude, 0.002);
  vec3 rd = skyViewDir(uv, camR);
  vec3 ro = vec3(0.0, camR, 0.0);
  float tG = atmRaySphere(ro, rd, ATM_RG);
  float tT = atmRaySphere(ro, rd, ATM_RT);
  float tMax = tG > 0.0 ? tG : tT;
  tMax = min(tMax, 900.0);
  const int STEPS = 34;
  float cosS = dot(rd, uSunDir);
  float cosM = dot(rd, uMoonDir);
  float pRS = atmPhaseR(cosS);
  float pMS = atmPhaseM(cosS, uMieG);
  float pRM = atmPhaseR(cosM);
  float pMM = atmPhaseM(cosM, uMieG);
  vec3 L = vec3(0.0);
  vec3 thr = vec3(1.0);
  float tPrev = 0.0;
  for (int i = 0; i < STEPS; i++) {
    // Quadratic step distribution: dense near the camera where the dust lives.
    float f = (float(i) + 1.0) / float(STEPS);
    float t = tMax * f * f;
    float dt = t - tPrev;
    float tm = 0.5 * (t + tPrev);
    tPrev = t;
    vec3 p = ro + rd * tm;
    float r = length(p);
    vec3 up = p / r;
    AtmMedium m = atmMedium(r - ATM_RG);
    vec3 scat = m.scatR + m.scatM;
    vec3 sunT = atmLightTransmittance(p, uSunDir);
    vec3 moonT = atmLightTransmittance(p, uMoonDir);
    vec3 S = uSunIllum * (sunT * (m.scatR * pRS + m.scatM * pMS) + scat * msLookup(r, dot(up, uSunDir)))
           + uMoonIllum * (moonT * (m.scatR * pRM + m.scatM * pMM) + scat * msLookup(r, dot(up, uMoonDir)));
    vec3 stepT = exp(-m.ext * dt);
    L += thr * (S - S * stepT) / max(m.ext, vec3(1e-7));
    thr *= stepT;
  }
  gl_FragColor = vec4(L, 1.0);
}
`;

// Lighting probe: sun/moon irradiance at the camera, L1 spherical-harmonic sky
// irradiance, dust radiance for sandstorms, and the average horizon radiance.
const PROBE_FRAG = /* glsl */ `
${ATMOSPHERE_PARAMS_GLSL}
${TRANSMITTANCE_LOOKUP_GLSL}
${SKYVIEW_MAPPING_GLSL}
uniform sampler2D tSkyView;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uCameraAltitude;
uniform float uStorm;
uniform float uCloud;
uniform float uNight;
uniform float uExposureBias;

void main() {
  int texel = int(gl_FragCoord.x);
  float camR = ATM_RG + max(uCameraAltitude, 0.002);
  vec3 camPos = vec3(0.0, camR, 0.0);
  // Thick dust blots out direct light during storms; cloud cover dims it a little.
  float directDim = mix(1.0, 0.22, uStorm) * (1.0 - 0.25 * uCloud * uCloud);
  vec3 sunIrr = uSunIllum * atmLightTransmittance(camPos, uSunDir) * directDim;
  vec3 moonIrr = uMoonIllum * atmLightTransmittance(camPos, uMoonDir) * directDim;

  // Upper-hemisphere SH projection of the sky-view LUT.
  vec3 c0 = vec3(0.0);
  vec3 cx = vec3(0.0);
  vec3 cy = vec3(0.0);
  vec3 cz = vec3(0.0);
  vec3 horizon = vec3(0.0);
  const int NA = 16;
  const int NE = 8;
  float dA = 2.0 * ATM_PI / float(NA);
  float dE = 0.5 * ATM_PI / float(NE);
  for (int i = 0; i < NA; i++) {
    float az = (float(i) + 0.5) * dA;
    for (int j = 0; j < NE; j++) {
      float el = (float(j) + 0.5) * dE;
      vec3 d = vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
      vec3 Ls = textureLod(tSkyView, skyViewUV(d, camR), 0.0).rgb;
      float w = cos(el) * dA * dE;
      c0 += Ls * 0.282095 * w;
      cx += Ls * 0.488603 * d.x * w;
      cy += Ls * 0.488603 * d.y * w;
      cz += Ls * 0.488603 * d.z * w;
      if (j == 0) horizon += Ls / float(NA);
    }
  }
  // Irradiance from the upper hemisphere on an upward surface, to light the ground bounce.
  vec3 eUp = ATM_PI * 0.282095 * c0 + (2.0 * ATM_PI / 3.0) * 0.488603 * cy;
  vec3 ground = uGroundAlbedo / ATM_PI * (sunIrr * max(uSunDir.y, 0.0) + moonIrr * max(uMoonDir.y, 0.0) + eUp);
  c0 += ground * 0.282095 * 2.0 * ATM_PI;
  cy += ground * 0.488603 * (-ATM_PI);

  vec3 shA = ATM_PI * 0.282095 * c0;
  float k1 = (2.0 * ATM_PI / 3.0) * 0.488603;

  vec3 outv = vec3(0.0);
  if (texel == 0) outv = sunIrr;
  else if (texel == 1) outv = moonIrr;
  else if (texel == 2) outv = shA;
  else if (texel == 3) outv = k1 * cx;
  else if (texel == 4) outv = k1 * cy;
  else if (texel == 5) outv = k1 * cz;
  else if (texel == 6) {
    vec3 dustAlbedo = vec3(0.78, 0.56, 0.36);
    outv = dustAlbedo / ATM_PI * (sunIrr * 0.55 + moonIrr * 0.55 + eUp * 0.9 + horizon * 0.6);
  } else {
    // Auto-exposure target from the light actually reaching the ground. Adaptation is
    // partial (power < 1), so sunsets stay warm and dim and nights stay dark.
    vec3 lw = vec3(0.2126, 0.7152, 0.0722);
    float sunI = dot(sunIrr, lw) * (0.3 + 0.7 * max(uSunDir.y, 0.0));
    float moonI = dot(moonIrr, lw) * (0.3 + 0.7 * max(uMoonDir.y, 0.0));
    float skyI = dot(shA + k1 * cy, lw);
    float illum = sunI + moonI + skyI + 1e-7;
    float target = 4.6 / pow(illum, 0.82) * (1.0 - 0.55 * uNight) * exp2(uExposureBias);
    outv = vec3(min(target, 4.0e4), horizon.g, horizon.b);
  }
  gl_FragColor = vec4(outv, 1.0);
}
`;

const EXPOSURE_FRAG = /* glsl */ `
uniform highp sampler2D tPrev;
uniform sampler2D tProbe;
uniform float uAdapt;
void main() {
  float prev = texelFetch(tPrev, ivec2(0), 0).r;
  float target = texelFetch(tProbe, ivec2(7, 0), 0).r;
  if (!(prev > 1e-6) || !(prev < 1e7) || uAdapt >= 1.0) prev = target;
  float e = exp(mix(log(prev), log(max(target, 1e-6)), uAdapt));
  gl_FragColor = vec4(e, 0.0, 0.0, 1.0);
}
`;

// GLSL used by world materials: probe access, sky lookups and aerial perspective.
export const ATMOSPHERE_USE_GLSL = /* glsl */ `
${ATMOSPHERE_PARAMS_GLSL}
${SKYVIEW_MAPPING_GLSL}
#ifndef ATMOSPHERE_USE_GLSL
#define ATMOSPHERE_USE_GLSL
uniform sampler2D tSkyView;
uniform sampler2D tProbe;
uniform highp sampler2D tExposure;
uniform float uCameraAltitude;
uniform vec3 uExtinction;
uniform vec2 uFarFade;
uniform float uStorm;
uniform vec3 uLightDir;
uniform float uNight;

vec3 probe(int i) {
  return texelFetch(tProbe, ivec2(i, 0), 0).rgb;
}
// Pre-exposure: materials write exposed values so night scenes keep HDR precision.
float exposure() {
  return texelFetch(tExposure, ivec2(0), 0).r;
}
// Irradiance of the key light (sun by day, moon by night) on a surface facing it.
vec3 keyLightIrradiance() {
  return mix(probe(0), probe(1), uNight);
}
// Diffuse sky irradiance for normal n (L1 spherical harmonics).
vec3 skyIrradiance(vec3 n) {
  return max(probe(2) + probe(3) * n.x + probe(4) * n.y + probe(5) * n.z, vec3(0.0));
}
vec3 skyRadiance(vec3 dir) {
  float camR = ATM_RG + max(uCameraAltitude, 0.002);
  return textureLod(tSkyView, skyViewUV(dir, camR), 0.0).rgb;
}

// Aerial perspective: transmittance along the view ray times the object colour, plus the
// in-scattered sky toward the horizon in that direction. Sandstorm dust is layered on top.
vec3 applyAerial(vec3 color, vec3 wp, out vec3 transmittance) {
  vec3 d = wp - cameraPosition;
  float dist = length(d);
  vec3 dir = d / max(dist, 1e-3);
  vec3 T = exp(-uExtinction * dist);
  T *= 1.0 - smoothstep(uFarFade.x, uFarFade.y, dist);
  vec3 hdir = normalize(vec3(dir.x, max(dir.y, 0.015), dir.z));
  vec3 inscatter = skyRadiance(hdir);
  vec3 c = color * T + inscatter * (vec3(1.0) - T);
  float stormT = exp(-uStorm * uStorm * dist * (1.0 / 95.0));
  c = mix(probe(6), c, stormT);
  transmittance = T * stormT;
  return c;
}
vec3 applyAerial(vec3 color, vec3 wp) {
  vec3 t;
  return applyAerial(color, wp, t);
}
#endif
`;

export class Atmosphere {
  constructor(renderer) {
    this.renderer = renderer;
    const common = { depthBuffer: false, stencilBuffer: false, generateMipmaps: false, type: THREE.HalfFloatType };
    this.transmittanceRT = new THREE.WebGLRenderTarget(TRANS_W, TRANS_H, { ...common, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.multiScatterRT = new THREE.WebGLRenderTarget(MS_SIZE, MS_SIZE, { ...common, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.skyViewRT = new THREE.WebGLRenderTarget(SKY_W, SKY_H, {
      ...common,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
    this.probeRT = new THREE.WebGLRenderTarget(PROBE_TEXELS, 1, {
      ...common,
      type: THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    for (const rt of [this.transmittanceRT, this.multiScatterRT, this.skyViewRT, this.probeRT]) {
      rt.texture.colorSpace = THREE.NoColorSpace;
    }

    // Atmosphere parameters (per km).
    this.uniforms = {
      uRayleighScat: { value: new THREE.Vector3(5.802e-3, 13.558e-3, 33.1e-3) },
      uMieScat: { value: new THREE.Vector3() },
      uMieExt: { value: new THREE.Vector3() },
      uMieH: { value: 1.2 },
      uMieG: { value: 0.78 },
      uOzoneAbs: { value: new THREE.Vector3(0.65e-3, 1.881e-3, 0.085e-3) },
      uGroundAlbedo: { value: new THREE.Vector3(0.42, 0.27, 0.15) },
      uSunIllum: { value: new THREE.Vector3(1.0, 0.985, 0.96) },
      uMoonIllum: { value: new THREE.Vector3(0, 0, 0) },
    };
    const uni = (extra = {}) => ({ ...this.uniforms, ...extra });

    this.transmittanceMat = makeFullscreenMaterial(TRANSMITTANCE_FRAG, uni());
    this.multiScatterMat = makeFullscreenMaterial(MULTISCATTER_FRAG, uni({ tTransmittance: { value: this.transmittanceRT.texture } }));
    this.skyViewMat = makeFullscreenMaterial(
      SKYVIEW_FRAG,
      uni({
        tTransmittance: { value: this.transmittanceRT.texture },
        tMultiScatter: { value: this.multiScatterRT.texture },
        uSunDir: U.uSunDir,
        uMoonDir: U.uMoonDir,
        uCameraAltitude: U.uCameraAltitude,
      }),
    );
    this.probeMat = makeFullscreenMaterial(
      PROBE_FRAG,
      uni({
        tTransmittance: { value: this.transmittanceRT.texture },
        tSkyView: { value: this.skyViewRT.texture },
        uSunDir: U.uSunDir,
        uMoonDir: U.uMoonDir,
        uCameraAltitude: U.uCameraAltitude,
        uStorm: U.uStorm,
        uCloud: U.uCloud,
        uNight: U.uNight,
        uExposureBias: U.uExposureBias,
      }),
    );
    this.exposureRT = [0, 1].map(
      () =>
        new THREE.WebGLRenderTarget(1, 1, {
          ...common,
          type: THREE.FloatType,
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
        }),
    );
    this.exposureIndex = 0;
    this.exposureMat = makeFullscreenMaterial(EXPOSURE_FRAG, {
      tPrev: { value: null },
      tProbe: U.tProbe,
      uAdapt: { value: 1 },
    });
    this.pass = new FullscreenPass(this.transmittanceMat);

    U.tTransmittance.value = this.transmittanceRT.texture;
    U.tSkyView.value = this.skyViewRT.texture;
    U.tProbe.value = this.probeRT.texture;

    this.dust = -1;
    this.lutsDirty = true;
    this.firstExposure = true;
    this.setDust(0.3);
  }

  /** Shared atmosphere uniforms for materials that include ATMOSPHERE_USE_GLSL. */
  materialUniforms() {
    return {
      ...this.uniforms,
      tSkyView: U.tSkyView,
      tProbe: U.tProbe,
      uCameraAltitude: U.uCameraAltitude,
      uExtinction: U.uExtinction,
      uFarFade: U.uFarFade,
      tExposure: U.tExposure,
      uStorm: U.uStorm,
      uLightDir: U.uLightDir,
      uNight: U.uNight,
    };
  }

  /** dust: 0 = very clear, 0.3 = typical Saharan haze, 1 = sandstorm. */
  setDust(dust) {
    if (Math.abs(dust - this.dust) < 0.01) return;
    this.dust = dust;
    const d = dust;
    // Mie scattering grows strongly with dust; absorption favours blue.
    const scale = 1.0 + 9.0 * d + 30.0 * d * d * d;
    const base = 3.996e-3 * scale;
    const tint = [1.0, 0.97 - 0.05 * d, 0.92 - 0.12 * d];
    this.uniforms.uMieScat.value.set(base * tint[0], base * tint[1], base * tint[2]);
    const absBase = 0.6e-3 * scale;
    const absTint = [0.55 + 0.2 * d, 0.85, 1.5 + 0.8 * d];
    this.uniforms.uMieExt.value.set(
      this.uniforms.uMieScat.value.x + absBase * absTint[0],
      this.uniforms.uMieScat.value.y + absBase * absTint[1],
      this.uniforms.uMieScat.value.z + absBase * absTint[2],
    );
    this.uniforms.uMieH.value = 1.2 + 1.6 * d;
    this.uniforms.uMieG.value = 0.8 - 0.12 * d;
    this.lutsDirty = true;
  }

  /** Ground-level extinction (per metre) used for aerial perspective. */
  updateExtinction(altitudeKm) {
    const r = this.uniforms.uRayleighScat.value;
    const m = this.uniforms.uMieExt.value;
    const dR = Math.exp(-altitudeKm / 8.0);
    const dM = Math.exp(-altitudeKm / this.uniforms.uMieH.value);
    // Slightly boosted so the far dunes melt into the haze like in photographs.
    const k = 1.35e-3;
    U.uExtinction.value.set((r.x * dR + m.x * dM) * k, (r.y * dR + m.y * dM) * k, (r.z * dR + m.z * dM) * k);
  }

  /** adapt: 0..1 blend toward the target this frame (1 = snap). */
  update(moonIntensity, adapt = 1) {
    const renderer = this.renderer;
    this.uniforms.uMoonIllum.value.set(0.82, 0.9, 1.0).multiplyScalar(moonIntensity);
    if (this.lutsDirty) {
      this.pass.material = this.transmittanceMat;
      this.pass.render(renderer, this.transmittanceRT);
      this.pass.material = this.multiScatterMat;
      this.pass.render(renderer, this.multiScatterRT);
      this.lutsDirty = false;
    }
    this.pass.material = this.skyViewMat;
    this.pass.render(renderer, this.skyViewRT);
    this.pass.material = this.probeMat;
    this.pass.render(renderer, this.probeRT);
    const prev = this.exposureRT[this.exposureIndex];
    this.exposureIndex ^= 1;
    const next = this.exposureRT[this.exposureIndex];
    this.exposureMat.uniforms.tPrev.value = prev.texture;
    this.exposureMat.uniforms.uAdapt.value = this.firstExposure ? 1 : adapt;
    this.firstExposure = false;
    this.pass.material = this.exposureMat;
    this.pass.render(renderer, next);
    U.tExposure.value = next.texture;
    this.updateExtinction(U.uCameraAltitude.value);
  }

  dispose() {
    for (const rt of [this.transmittanceRT, this.multiScatterRT, this.skyViewRT, this.probeRT, ...this.exposureRT]) rt.dispose();
  }
}
