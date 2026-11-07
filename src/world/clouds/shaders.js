import { NOISE_PERIOD, BASE_TILE, DETAIL_TILE, WEATHER_TILE, MACRO_SCALE, CIRRUS_TILE } from './noise.js';
import { LAYERS, REGION } from './weather.js';

// =============================================================================
// GLSL for the volumetric clouds.
//
// Frame of reference: every position is RELATIVE TO THE CAMERA with WORLD axes
// (x east, y up, z south). Altitudes are measured on a sphere (R = 6360 km, the
// same as the atmosphere and the terrain's curvature drop) so the sea of clouds
// curves down to the horizon. Noise coordinates = relative position +
// uNoiseOff (= camera world xz mod NOISE_PERIOD, minus the wind drift), so they
// stay precise anywhere along the route.
// =============================================================================

const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

export const CLOUD_COMMON = /* glsl */`
#define ER 6360000.0
#define NOISE_PERIOD ${f(NOISE_PERIOD)}
#define BASE_TILE ${f(BASE_TILE)}
#define DETAIL_TILE ${f(DETAIL_TILE)}
#define WEATHER_TILE ${f(WEATHER_TILE)}
#define MACRO_TILE ${f(WEATHER_TILE * MACRO_SCALE)}
#define CIRRUS_TILE ${f(CIRRUS_TILE)}
#define CU_BASE ${f(LAYERS.cuBase)}
#define DECK_BASE ${f(LAYERS.deckBase)}
#define DECK_TOP ${f(LAYERS.deckTop)}
#define CIRRUS_ALT ${f(LAYERS.cirrusAlt)}

uniform sampler2D tWeather;
uniform sampler3D tBase;
uniform sampler3D tDetail;
uniform float uBaseTexel;        // metres per base texel (BASE_TILE / size)
uniform vec3 uNoiseOff;          // (cam x - wind x) mod P, time-evolution, (cam z - wind z) mod P
uniform float uCamAlt;           // camera altitude (m)
uniform vec2 uDepRel;            // departure origin - camera (xz)
uniform vec2 uArrRelA;           // arrival origin (previous) - camera
uniform vec2 uArrRelB;           // arrival origin (current) - camera
uniform float uArrMix;           // 0 = A, 1 = B
uniform vec4 uPreset;            // preset (cumulus cov, deck cov, towers, cirrus)
uniform float uAuto;             // 1 = route weather ('auto'), 0 = preset
uniform float uCuTop;            // top of the cumulus shell (m) (taller when towers exist)
uniform float uSigma;            // extinction per unit density (1/m)

float cRemap(float x, float a, float b, float c, float d) { return c + (x - a) / (b - a) * (d - c); }
float cSat(float x) { return clamp(x, 0.0, 1.0); }

// ray / sphere (altitude hs) from the camera: roots (near, far) or (-1, -1)
vec2 sphereHits(float hs, vec3 d) {
  float A = ER + uCamAlt;
  float s = length(d.xz);
  float X = (hs - uCamAlt) + A * d.y * d.y / (1.0 + s);
  float disc = X * (ER + hs + A * s);
  if (disc < 0.0) return vec2(-1.0);
  float B = d.y * A;
  float sq = sqrt(disc);
  float q = -(B + (B >= 0.0 ? sq : -sq));
  float Cc = (uCamAlt - hs) * (2.0 * ER + uCamAlt + hs);
  float t1 = q, t2 = abs(q) > 1e-6 ? Cc / q : 0.0;
  return vec2(min(t1, t2), max(t1, t2));
}
// first contiguous interval of the ray inside the shell [hBot, hTop]; x > y means none
vec2 shellInterval(float hBot, float hTop, vec3 d) {
  vec2 o = sphereHits(hTop, d), i = sphereHits(hBot, d);
  if (uCamAlt > hTop) {
    if (o.x <= 0.0) return vec2(1.0, -1.0);
    return vec2(o.x, i.x > 0.0 ? i.x : o.y);
  } else if (uCamAlt >= hBot) {
    return vec2(0.0, i.x > 0.0 ? i.x : o.y);
  }
  return vec2(max(i.y, 0.0), o.y);
}
// altitude (m) of a camera-relative point, numerically stable
float altAt(vec3 p) {
  float A = ER + uCamAlt + p.y;
  float r2 = dot(p.xz, p.xz);
  return uCamAlt + p.y + r2 / (sqrt(A * A + r2) + A);
}

// regional coverage: x = cumulus, y = deck, z = towers, w = cirrus
vec4 cloudRegion(vec2 rel, float mac) {
  float dDep = length(rel - uDepRel) * 0.001;
  float dArr = mix(length(rel - uArrRelA), length(rel - uArrRelB), uArrMix) * 0.001;
  float depF = 1.0 - smoothstep(${f(REGION.depInner)}, ${f(REGION.depOuter)}, dDep);
  float arrF = 1.0 - smoothstep(${f(REGION.arrInner)}, ${f(REGION.arrOuter)}, dArr);
  // en route: fair-weather cumulus + a stratocumulus deck with breaks + embedded towers
  vec4 en = vec4(0.24 + 0.2 * mac, smoothstep(0.30, 0.52, mac) * 0.97, smoothstep(0.66, 0.80, mac), 0.35 + 0.5 * mac);
  // departure: scattered cumulus, deck patches starting further out
  vec4 dep = vec4(0.46, smoothstep(0.42, 0.62, mac) * 0.5 * smoothstep(${f(REGION.depInner * 0.7)}, ${f(REGION.depOuter)}, dDep), 0.0, 0.4);
  // arrival: clear sunset approach, scattered cumulus far out
  vec4 arr = vec4(0.36 * smoothstep(${f(REGION.arrClear)}, ${f(REGION.arrClear * 2.2)}, dArr), 0.0, 0.0, 0.35);
  vec4 c = mix(en, dep, depF);
  c = mix(c, arr, arrF);
  vec4 pre = uPreset;
  pre.y *= mix(1.0, smoothstep(0.2, 0.45, mac), step(pre.y, 0.6));
  return mix(pre, c, uAuto);
}

vec4 weatherAt(vec2 nxz, float lod) { return textureLod(tWeather, nxz / WEATHER_TILE, lod); }
float macroAt(vec2 nxz, float lod) { return textureLod(tWeather, nxz / MACRO_TILE + vec2(0.37, 0.61), max(lod - 2.0, 0.0)).a; }

// cloud density at a camera-relative point. lod: base-noise mip, detailAmt 0 = cheap (no erosion)
// out amb: 0 at the bottom of the layer, 1 at the top (ambient / AO term)
// regional coverage at a camera-relative point (macro map + route regions)
vec4 regionAt(vec3 p, float lod) {
  vec2 nxz = p.xz + uNoiseOff.xz;
  return cloudRegion(p.xz, macroAt(nxz, max(lod - 2.0, 0.0)));
}
// same as cloudDensity() with the regional coverage supplied (light march: reuse the sample's)
float cloudDensityR(vec3 p, float h, float lod, float detailAmt, vec4 reg, out float amb) {
  amb = 1.0;
  if (h < CU_BASE - 250.0 || h > max(uCuTop, DECK_TOP + 400.0)) return 0.0;
  vec2 nxz = p.xz + uNoiseOff.xz;
  float lodW = max(lod - 2.0, 0.0);
  vec4 W = weatherAt(nxz, lodW);
  // --- layer gradients
  float hB = CU_BASE + 160.0 * (W.b - 0.5);
  float hT = hB + mix(650.0, 2100.0, W.b * W.b) + reg.z * smoothstep(0.45, 0.85, W.b) * 4800.0;
  float hf = (h - hB) / (hT - hB);
  float cellCov = cSat(cRemap(W.r, 1.0 - reg.x, 1.0, 0.0, 1.0));
  float cu = 0.0;
  if (hf > 0.0 && hf < 1.0 && cellCov > 0.0) {
    // domes: cells shrink towards the top; flat, slightly ragged bases
    float sh = smoothstep(0.4, 1.0, hf); float shrink = sh * sh * 0.95;   // columns with domed tops
    cu = cSat((cellCov - shrink) / max(1.0 - shrink, 0.05)) * smoothstep(0.0, 0.035, hf);
    cu = sqrt(cu);   // fuller cells: crisp flat bases, solid cores
  }
  float dB = DECK_BASE + 260.0 * (W.r - 0.5);
  float dT = DECK_TOP - 700.0 + 900.0 * W.g;
  float df = (h - dB) / (dT - dB);
  float deck = 0.0;
  if (df > 0.0 && df < 1.0 && reg.y > 0.0) {
    float dc = cSat(cRemap(W.g, 1.0 - reg.y, 1.0, 0.0, 1.0));
    deck = dc * smoothstep(0.0, 0.18, df) * smoothstep(1.0, 0.55, df);
  }
  float shape = max(cu, deck);
  if (shape <= 0.0) return 0.0;
  // --- base noise (cumulus at twice the frequency: ~500 m lumps; deck ~1 km cells)
  float isDeck = deck > cu ? 1.0 : 0.0;
  vec3 q = vec3(nxz.x, h, nxz.y) / (BASE_TILE * mix(0.5, 2.5, isDeck));
  vec4 bn = textureLod(tBase, q, max(lod - 1.0 + isDeck * 2.3, 0.0));
  float lowFbm = bn.g * 0.625 + bn.b * 0.25 + bn.a * 0.125;
  float base = cSat(cRemap(bn.r, lowFbm - 1.0, 1.0, 0.0, 1.0));
  if (isDeck > 0.5) {
    // stratocumulus: broad continuous sheet with soft billows (smaller lumps from the cumulus-scale noise)
    vec4 bn2 = textureLod(tBase, q * 5.0 + 0.31, max(lod - 1.0, 0.0));
    base = mix(0.62, base, 0.55) + (bn2.r - 0.5) * 0.28;
  }
  // (cumulus keep more density towards their edges: crisper, cauliflower silhouettes)
  float dens = cSat(cRemap(base, 1.0 - shape, 1.0, 0.0, 1.0)) * mix(sqrt(shape), shape, isDeck);
  float lf = isDeck > 0.5 ? df : hf;
  amb = lf;
  if (dens <= 0.0) return 0.0;
  // --- erosion detail (wispy at the bottom, billowy at the top)
  if (detailAmt > 0.0) {
    vec3 qd = vec3(nxz.x, h + uNoiseOff.y, nxz.y) / DETAIL_TILE;
    vec3 dn = textureLod(tDetail, qd, max(lod - 1.0, 0.0)).rgb;
    float dfbm = dn.r * 0.625 + dn.g * 0.25 + dn.b * 0.125;
    float mod_ = mix(dfbm, 1.0 - dfbm, cSat(lf * 4.0));
    dens = cSat(cRemap(dens, mod_ * 0.42 * detailAmt * mix(0.55, 1.0, cSat(lf * 3.0)), 1.0, 0.0, 1.0));
  }
  return dens * mix(3.4, 1.8, isDeck);
}
float cloudDensity(vec3 p, float h, float lod, float detailAmt, out float amb) {
  amb = 1.0;
  if (h < CU_BASE - 250.0 || h > max(uCuTop, DECK_TOP + 400.0)) return 0.0;
  return cloudDensityR(p, h, lod, detailAmt, regionAt(p, lod), amb);
}
`;

const PHASE_GLSL = /* glsl */`
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.5663706 * pow(max(1e-4, 1.0 + g2 - 2.0 * g * c), 1.5)); }
float cloudPhase(float c, float k) {
  // dual-lobe Henyey-Greenstein (+ a sharp silver-lining lobe), flattened for higher scattering orders
  return mix(mix(hg(c, 0.8 * k), hg(c, -0.25 * k), 0.3), hg(c, 0.96 * k), 0.06 * k);
}
`;

// -----------------------------------------------------------------------------------------------------------------
// MARCH: low resolution, jittered, writes (in-scattered radiance, transmittance) + (cloud distance km, scene distance km)
export const MARCH_FRAG = (opts) => /* glsl */`
${opts.atmosphere ? opts.atmosphere : ''}
precision highp float;
${CLOUD_COMMON}
${PHASE_GLSL}
${opts.depthGLSL}
layout(location = 0) out highp vec4 gOut0;
layout(location = 1) out highp vec4 gOut1;
uniform sampler2D tDepth;
uniform sampler2D tCirrus;
uniform vec2 uRes;
uniform mat4 uInvProj;
uniform mat3 uCamToWorld;
uniform float uNear, uFar;
uniform int uSteps;
uniform int uLightSteps;
uniform float uFrame;
uniform vec3 uKeyDir;            // towards the key light (world)
uniform vec3 uKeyColor;          // key radiance used for the moon / without the atmosphere module
uniform float uKeyIsSun;
uniform vec3 uAmbTop;
uniform vec3 uAmbBottom;
uniform float uMaxDist;          // m
uniform float uNearOK;           // 1: pixels closer than 30 m can skip the march
uniform float uPixAngle;         // radians per low-res pixel
uniform float uDetail;           // erosion detail amount
uniform vec2 uCirrusOff;         // cirrus noise offset (mod tile)
uniform vec3 uFogColor;          // fallback aerial perspective colour
uniform float uFogDensity;
uniform float uMsScale;          // multiple scattering strength
varying vec2 vUv;

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

vec3 keyRadianceAt(vec3 p, float h) {
${opts.atmosphere ? `
  if (uKeyIsSun > 0.5) {
    vec3 up = normalize(vec3(p.x, ER + uCamAlt + p.y, p.z));
    return uAtmSunIllum * atmSunTransmittance(max(h, 0.0) * 0.001, dot(up, uKeyDir));
  }` : ''}
  return uKeyColor;
}

void aerial(vec3 dir, float dM, out vec3 Td, out vec3 inS) {
${opts.atmosphere ? `
  bool ground;
  vec3 sky = atmSkyView(dir, ground) + atmNightSky(dir);
  float mu = dir.y;
  float D = atmRayEnd(uAtmCamR, uAtmCamH, mu, ground);
  vec3 odD = ground ? atmPathOD(uAtmCamR, uAtmCamH, mu, D) : atmOD(uAtmCamR, mu);
  float d = min(dM * 0.001, D);
  vec3 odd = atmPathOD(uAtmCamR, uAtmCamH, mu, d);
  Td = exp(-odd);
  inS = sky * clamp((1.0 - Td) / max(1.0 - exp(-odD), vec3(1e-5)), 0.0, 1.0);` : `
  float k = 1.0 - exp(-uFogDensity * uFogDensity * dM * dM);
  Td = vec3(1.0 - k);
  inS = uFogColor * k;`}
}

float lightOD(vec3 p, float lod, vec4 reg) {
  float od = 0.0, stepL = 45.0, t = 0.0, a;
  for (int i = 0; i < 8; i++) {
    if (i >= uLightSteps) break;
    t += stepL * 0.5;
    vec3 q = p + uKeyDir * t;
    od += cloudDensityR(q, altAt(q), lod + float(i) * 0.5, 0.0, reg, a) * stepL;
    t += stepL * 0.5;
    stepL *= 2.0;
  }
  return od;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  // view ray
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 vd = normalize(v.xyz / v.w);
  vec3 dir = normalize(uCamToWorld * vd);
  float rawD = texture2D(tDepth, vUv).r;
  float lin = linearizeDepth(rawD, uNear, uFar);
  float sceneDist = lin >= uFar * 0.98 ? 1e9 : lin / max(-vd.z, 1e-4);
  float sceneKm = min(sceneDist, 6e5) * 0.001;

  if (sceneDist < 30.0 && uNearOK > 0.5) {
    gOut0 = vec4(0.0, 0.0, 0.0, 1.0);
    gOut1 = vec4(sceneKm, sceneKm, 0.0, 1.0);
    return;
  }

  float jitter = ign(frag + 5.588238 * mod(uFrame, 64.0));
  vec3 L = vec3(0.0);
  float T = 1.0;
  float wSum = 0.0, dSum = 0.0;
  float tEnd = min(sceneDist, uMaxDist);

  // shells: cumulus [CU_BASE-250, uCuTop], deck [DECK_BASE-150, DECK_TOP+400]; merged when overlapping
  vec2 iA = shellInterval(CU_BASE - 250.0, uCuTop, dir);
  vec2 iB = shellInterval(DECK_BASE - 150.0, DECK_TOP + 400.0, dir);
  vec2 seg0 = iA, seg1 = iB;
  if (uCuTop >= DECK_BASE - 150.0) { seg0 = shellInterval(CU_BASE - 250.0, max(uCuTop, DECK_TOP + 400.0), dir); seg1 = vec2(1.0, -1.0); }
  else if (iB.x <= iB.y && (iA.x > iA.y || iB.x < iA.x)) { seg0 = iB; seg1 = iA; }

  float c = dot(dir, uKeyDir);
  // phase of the multiple-scattering octaves (weights a^i, eccentricity halved each order)
  float ma = 0.5 * uMsScale;
  vec4 ph = vec4(cloudPhase(c, 1.0), ma * cloudPhase(c, 0.5), ma * ma * cloudPhase(c, 0.25), ma * ma * ma * cloudPhase(c, 0.125));
  vec3 keyRad = vec3(0.0);
  bool keySet = false;
  float firstT = -1.0;
  int iters = 0, dense = 0;
  int maxIters = uSteps * 3 + 24;
  for (int s = 0; s < 2; s++) {
    vec2 seg = s == 0 ? seg0 : seg1;
    float t0 = max(seg.x, 0.0), t1 = min(seg.y, tEnd);
    if (t1 <= t0 || T < 0.01) continue;
    // fine step inside cloud grows with distance; coarse (x3) through empty space, backing up on a hit
    float segLen = t1 - t0;
    float fineMin = max(min(24.0, segLen / 8.0), segLen / float(uSteps * 6));
    float t = t0 + max(fineMin, t0 * 0.009) * (segLen < 300.0 ? 1.0 : 3.0) * jitter;
    if (segLen < 300.0) t = t0 + fineMin * jitter;
    bool coarse = segLen >= 300.0;
    int zeros = 0;
    for (int i = 0; i < ${opts.maxSteps}; i++) {
      if (iters >= maxIters || dense >= uSteps || t >= t1 || T < 0.01) break;
      iters++;
      float dtF = max(fineMin, t * 0.009);
      float dt = coarse ? dtF * 3.0 : dtF;
      vec3 p = dir * t;
      float h = altAt(p);
      float foot = max(dtF * 0.35, t * uPixAngle);
      float lod = max(log2(foot / uBaseTexel), 0.0);
      float amb;
      if (h < CU_BASE - 250.0 || h > max(uCuTop, DECK_TOP + 400.0)) { t += dt; continue; }
      vec4 reg = regionAt(p, lod);
      if (coarse) {
        if (cloudDensityR(p, h, lod, 0.0, reg, amb) > 0.0) { coarse = false; zeros = 0; t = max(t - dt * 0.66, t0); continue; }
        t += dt;
        continue;
      }
      // fine mode: one full evaluation (detail erosion fades out with distance)
      float dens = cloudDensityR(p, h, lod, uDetail * (1.0 - smoothstep(8000.0, 40000.0, t)), reg, amb);
      {
        if (dens > 0.001) {
          zeros = 0;
          dense++;
          if (!keySet) { keyRad = keyRadianceAt(p, h); keySet = true; firstT = t; }
          float sig = dens * uSigma;
          float od = lightOD(p, lod + 0.5, reg) * uSigma;
          // multiple-scattering octaves (Wrenninge) + powder
          vec3 S = vec3(ph.x * exp(-od) + ph.y * exp(-od * 0.5) + ph.z * exp(-od * 0.25) + ph.w * exp(-od * 0.125));
          float powder = 1.0 - exp(-dens * uSigma * 140.0);
          S *= mix(0.55, 1.0, powder) * keyRad;
          vec3 ambC = mix(uAmbBottom, uAmbTop, cSat(amb * 1.2)) * (0.45 + 0.55 * cSat(amb));
          // diffuse multiple-scattering floor: cloud interiors and bases glow with scattered sunlight
          vec3 Sall = S + ambC + keyRad * 0.012 * (0.3 + 0.7 * cSat(amb));
          float tr = exp(-sig * dt);
          float w = T * (1.0 - tr);
          L += Sall * w;
          wSum += w; dSum += w * t;
          T *= tr;
        } else if (++zeros > 3) {
          coarse = true;
        }
      }
      t += dt;
    }
  }

  float cloudDist = wSum > 1e-4 ? dSum / wSum : min(sceneDist, 60000.0);
  // aerial perspective on the clouds
  if (wSum > 1e-4) {
    vec3 Td, inS;
    aerial(dir, cloudDist, Td, inS);
    L = L * Td + inS * (1.0 - T);
  }

  // cirrus / cirrostratus (2D, above the volumetric layers)
  if (uPreset.w > 0.0 || uAuto > 0.5) {
    vec2 hc = sphereHits(CIRRUS_ALT, dir);
    float tc = uCamAlt < CIRRUS_ALT ? hc.y : (hc.x > 0.0 ? hc.x : -1.0);
    if (tc > 0.0 && tc < sceneDist && T > 0.01) {
      vec3 pc = dir * tc;
      vec2 nxz = pc.xz + uNoiseOff.xz;
      float mac = macroAt(nxz, 0.0);
      float cov = cloudRegion(pc.xz, mac).w;
      float lodC = log2(max(1.0, tc * uPixAngle / (CIRRUS_TILE / 512.0)));
      vec4 cn = textureLod(tCirrus, (pc.xz + uCirrusOff) / CIRRUS_TILE, lodC);
      vec4 cn2 = textureLod(tCirrus, (pc.xz + uCirrusOff * 0.7) / (CIRRUS_TILE * 0.37) + 0.5, lodC + 1.0);
      float patches = smoothstep(0.45, 0.8, cn.b * 0.7 + cn2.b * 0.5);
      float fib = cSat(cn.r * 1.3 + cn2.r * 0.4) * patches;
      float a = cSat(fib * smoothstep(0.3, 0.9, cov) * 0.32 + cn.g * smoothstep(0.65, 1.0, cov) * 0.22);
      // fade the cirrus towards the horizon (long, hazy paths) and when seen almost edge-on
      a *= smoothstep(0.0, 0.03, abs(dir.y) + 0.004);
      if (a > 0.002) {
        vec3 kr = keyRadianceAt(pc, CIRRUS_ALT);
        vec3 Lc = kr * (hg(c, 0.75) * 0.7 + hg(c, 0.2) * 0.3) * 0.9 + uAmbTop * 0.8;
        vec3 Td, inS;
        aerial(dir, tc, Td, inS);
        Lc = Lc * Td + inS;
        // cirrus is behind the volumetric clouds
        L += T * Lc * a;
        T *= 1.0 - a;
        if (wSum <= 1e-4) cloudDist = tc;
      }
    }
  }

  gOut0 = vec4(L, T);
  gOut1 = vec4(min(cloudDist, 6e5) * 0.001, sceneKm, firstT, 1.0);
}
`;

// -----------------------------------------------------------------------------------------------------------------
// TEMPORAL RESOLVE (low resolution): reproject the history in world space, clamp to the current neighbourhood
export const RESOLVE_FRAG = /* glsl */`
uniform sampler2D tCur;
uniform sampler2D tCurDist;
uniform sampler2D tHist;
uniform mat4 uInvProj;
uniform mat3 uCamToWorld;
uniform mat4 uPrevVP;           // previous view-projection, camera-relative (current camera at origin)
uniform vec3 uDrift;            // cloud motion since the previous frame (m, world)
uniform vec2 uTexel;
uniform float uHistValid;
uniform float uBlend;
varying vec2 vUv;
void main() {
  vec4 cur = texture2D(tCur, vUv);
  if (uHistValid < 0.5) { gl_FragColor = cur; return; }
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dir = normalize(uCamToWorld * normalize(v.xyz / v.w));
  float d = texture2D(tCurDist, vUv).r * 1000.0;
  vec3 P = dir * d - uDrift;
  vec4 clip = uPrevVP * vec4(P, 1.0);
  vec2 puv = clip.xy / clip.w * 0.5 + 0.5;
  bool valid = clip.w > 0.0 && all(greaterThanEqual(puv, vec2(0.0))) && all(lessThanEqual(puv, vec2(1.0)));
  // neighbourhood (3x3) box for clamping
  vec4 mn = cur, mx = cur, m1 = cur, m2 = cur * cur;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    if (i == 0 && j == 0) continue;
    vec4 s = texture2D(tCur, vUv + vec2(float(i), float(j)) * uTexel);
    mn = min(mn, s); mx = max(mx, s); m1 += s; m2 += s * s;
  }
  m1 /= 9.0; m2 /= 9.0;
  vec4 sd = sqrt(max(m2 - m1 * m1, vec4(0.0)));
  vec4 lo = max(mn, m1 - sd * 1.5), hi = min(mx, m1 + sd * 1.5);
  if (!valid) { gl_FragColor = cur; return; }
  vec4 hist = texture2D(tHist, puv);
  hist = clamp(hist, lo, hi);
  gl_FragColor = mix(hist, cur, uBlend);
}
`;

// -----------------------------------------------------------------------------------------------------------------
// UPSAMPLE + COMPOSITE (full resolution): depth-aware (bilateral) upsample of the resolved clouds onto the scene
export const COMPOSITE_FRAG = (depthGLSL) => /* glsl */`
${depthGLSL}
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tCloud;
uniform sampler2D tCloudDist;
uniform vec2 uLowRes;
uniform mat4 uInvProj;
uniform float uNear, uFar;
uniform float uNearOK;
varying vec2 vUv;
void main() {
  vec4 scene = texture2D(tScene, vUv);
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 vd = normalize(v.xyz / v.w);
  float lin = linearizeDepth(texture2D(tDepth, vUv).r, uNear, uFar);
  float dist = lin >= uFar * 0.98 ? 1e9 : lin / max(-vd.z, 1e-4);
  if (dist < 30.0 && uNearOK > 0.5) { gl_FragColor = scene; return; }
  float dk = min(dist, 6e5) * 0.001;
  vec2 p = vUv * uLowRes - 0.5;
  vec2 b = floor(p), fr = p - b;
  vec4 acc = vec4(0.0); float wsum = 0.0;
  vec4 nearest = vec4(0.0, 0.0, 0.0, 1.0); float best = 1e9;
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    vec2 o = vec2(float(i), float(j));
    vec2 uv = (b + o + 0.5) / uLowRes;
    vec4 cl = texture2D(tCloud, uv);
    float ld = texture2D(tCloudDist, uv).g;
    float wb = (i == 0 ? 1.0 - fr.x : fr.x) * (j == 0 ? 1.0 - fr.y : fr.y);
    float rel = abs(ld - dk) / max(min(ld, dk), 0.02);
    float wd = 1.0 / (0.02 + rel * rel * 60.0);
    float w = wb * wd + 1e-6;
    acc += cl * w; wsum += w;
    if (rel < best) { best = rel; nearest = cl; }
  }
  vec4 cl = acc / wsum;
  if (best > 0.5) cl = nearest;
  gl_FragColor = vec4(scene.rgb * cl.a + cl.rgb, scene.a);
}
`;

// -----------------------------------------------------------------------------------------------------------------
// PROBE: 4x1 pixels read back asynchronously
//   x=0: density around the aircraft (r = mean density / 4, g = max / 4)
//   x=1: sun transmittance from the aircraft (r), x=2: sky (upward) transmittance (r)
//   x=3: regional coverage at the aircraft (r = cumulus, g = deck, b = towers, a = cirrus); x=4: density at the camera
export const PROBE_FRAG = /* glsl */`
precision highp float;
${CLOUD_COMMON}
uniform vec3 uProbe;             // aircraft position relative to the camera
uniform vec3 uKeyDir;
uniform vec3 uAxisX;             // aircraft lateral axis (world)
uniform vec3 uAxisZ;             // aircraft longitudinal axis (world, + aft)
uniform vec3 uCamProbe;          // camera (normally 0: positions are camera-relative)
void main() {
  int px = int(gl_FragCoord.x);
  float a;
  vec4 o = vec4(0.0);
  if (px == 0) {
    float s = 0.0, m = 0.0;
    for (int i = 0; i < 7; i++) {
      vec3 off = i == 0 ? vec3(0.0) : i == 1 ? uAxisX * 16.0 : i == 2 ? -uAxisX * 16.0 : i == 3 ? uAxisZ * 20.0 :
        i == 4 ? -uAxisZ * 20.0 : i == 5 ? uAxisX * 30.0 + uAxisZ * 25.0 : -uAxisX * 30.0 + uAxisZ * 25.0;
      vec3 q = uProbe + off;
      float d = cloudDensity(q, altAt(q), 0.0, 1.0, a);
      s += d; m = max(m, d);
    }
    o = vec4(s / 28.0, m * 0.25, 0.0, 1.0);
  } else if (px == 1 || px == 2) {
    vec3 dir = px == 1 ? uKeyDir : vec3(0.0, 1.0, 0.0);
    float od = 0.0, t = 0.0, st = 25.0;
    for (int i = 0; i < 12; i++) {
      t += st * 0.5;
      vec3 q = uProbe + dir * t;
      od += cloudDensity(q, altAt(q), 1.0, 0.5, a) * st;
      t += st * 0.5;
      st *= 1.45;
    }
    o = vec4(exp(-od * uSigma), 0.0, 0.0, 1.0);
  } else if (px == 4) {
    float d = cloudDensity(uCamProbe, altAt(uCamProbe), 0.0, 1.0, a);
    o = vec4(d * 0.25, 0.0, 0.0, 1.0);
  } else {
    vec2 nxz = uProbe.xz + uNoiseOff.xz;
    o = clamp(cloudRegion(uProbe.xz, macroAt(nxz, 0.0)), 0.0, 1.0);
  }
  gl_FragColor = o;
}
`;

// -----------------------------------------------------------------------------------------------------------------
// CLOUD SHADOW MAP (for other modules): transmittance of sunlight through the layers at ground level,
// on a square of uSize metres centred on the aircraft (u along world +x, v along world +z)
export const SHADOW_FRAG = /* glsl */`
precision highp float;
${CLOUD_COMMON}
uniform vec3 uCenter;            // map centre relative to the camera (y = ground level relative to camera)
uniform float uSize;
uniform vec3 uKeyDir;
varying vec2 vUv;
void main() {
  vec3 g = uCenter + vec3((vUv.x - 0.5) * uSize, 0.0, (vUv.y - 0.5) * uSize);
  vec3 dir = uKeyDir.y > 0.05 ? uKeyDir : normalize(vec3(uKeyDir.x, 0.05, uKeyDir.z));
  // start at the cloud base, march up through the layers
  float h0 = altAt(g);
  float tA = max((CU_BASE - 300.0 - h0) / dir.y, 0.0);
  float tB = (max(uCuTop, DECK_TOP + 400.0) - h0) / dir.y;
  float od = 0.0, a;
  const int N = 14;
  float st = (tB - tA) / float(N);
  for (int i = 0; i < N; i++) {
    vec3 q = g + dir * (tA + (float(i) + 0.5) * st);
    od += cloudDensity(q, altAt(q), 1.5, 0.0, a) * st;
  }
  gl_FragColor = vec4(exp(-od * uSigma * 0.6), 0.0, 0.0, 1.0);
}
`;

/** GLSL other modules can include to darken surfaces under clouds (uniforms from app.clouds.shadow.uniforms). */
export const SHADOW_SAMPLE_GLSL = /* glsl */`
uniform sampler2D tCloudShadow;
uniform vec2 uCloudShadowCenter;   // world x/z of the map centre
uniform float uCloudShadowSize;    // metres covered by the map
uniform float uCloudShadowAmount;  // 0 disables
// 1 = full sun, 0 = fully shadowed. worldXZ = WORLD x/z (east, south).
float cloudShadow(vec2 worldXZ) {
  vec2 uv = (worldXZ - uCloudShadowCenter) / uCloudShadowSize + 0.5;
  float edge = smoothstep(0.0, 0.08, min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y)));
  float s = texture2D(tCloudShadow, clamp(uv, 0.0, 1.0)).r;
  return mix(1.0, s, edge * uCloudShadowAmount);
}
`;
