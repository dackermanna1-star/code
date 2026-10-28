/**
 * Full-screen atmosphere + cloud composite for one planet.
 *
 * For each pixel the view ray is clipped against the atmosphere shell and the
 * scene depth (reconstructed from the logarithmic depth buffer). In-scattering
 * and transmittance are integrated along the visible segment, so the same
 * pass produces the daytime sky, sunsets, aerial perspective over terrain,
 * the thin limb seen from orbit, and the attenuation of stars, moons and
 * other planets seen through the air. Clouds are marched inside the same
 * segment and composited between the near and far atmosphere integrals.
 */
import * as THREE from 'three';
import { FS_VERT } from './fullscreen';
import { NOISE_GLSL } from './shaders/noise.glsl';
import { ATMOSPHERE_UNIFORMS, ATMOSPHERE_FUNCS, ATMOSPHERE_LUT_FUNCS } from './shaders/atmosphere.glsl';
import type { AtmosphereLUTs } from './atmosphere';
import { CloudLayer, cloudDetailTexture } from './clouds';
import { PRE_EXPOSURE, PRE_EXPOSURE_TEX, PRE_EXPOSURE_GLSL } from './exposure';


const FRAG = /* glsl */ `
${NOISE_GLSL}
${ATMOSPHERE_UNIFORMS}
${ATMOSPHERE_FUNCS}
${ATMOSPHERE_LUT_FUNCS}
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform mat3 uViewToWorld;
uniform vec3 uCamPos;      // camera relative to planet centre (world axes)
uniform float uFar;
uniform vec3 uSunDir[2];
uniform vec3 uSunIllum[2];
uniform float uFrame;
uniform int uSteps;
uniform vec2 uResolution;
${PRE_EXPOSURE_GLSL}
uniform float uDebug;
uniform vec3 uAxis;    // planet spin axis (world)
uniform float uAurora;         // aurora intensity (0 = none)
uniform vec3 uAuroraLow, uAuroraHigh; // emission colours: lower curtain (O 557.7 nm / H) and upper (O 630 nm)
uniform float uAuroraTime;
uniform float uStorm;          // lightning activity
uniform float uOblate; // 1/(1-f) - 1 : stretch along the axis that maps the oblate body onto a sphere
#ifdef CLOUDS
uniform samplerCube uWeather;
uniform sampler3D uCloudDetail;
uniform mat3 uWorldToPlanet;
uniform float uCloudBottom, uCloudTop, uCloudDensity, uCloudScale, uCloudTime, uCloudDrift, uCloudOvercast;
uniform vec3 uCloudAlbedo;
uniform int uCloudSteps;
uniform float uPixelAngle;
#endif
varying vec2 vUv;

vec2 raySphereG(vec3 ro, vec3 rd, float r) {
  float a = dot(rd, rd);
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float d = b * b - a * c;
  if (d < 0.0) return vec2(1e30, -1e30);
  float s = sqrt(d);
  return vec2((-b - s) / a, (-b + s) / a);
}
#ifdef CLOUDS
// fraction of direct sunlight reaching air below the deck (weather-map lookup
// where the sun ray crosses the middle of the deck)
float belowCloudShadow(vec3 p, float h, vec3 L) {
  float rMid = (uCloudBottom + uCloudTop) * 0.5;
  if (h >= rMid) return 1.0;
  float mu = max(dot(p / h, L), 0.04);
  vec3 q = uWorldToPlanet * (p + L * (rMid - h) / mu);
  vec3 d = normalize(q);
  float c = cos(uCloudDrift), s = sin(uCloudDrift);
  vec4 w = textureLod(uWeather, vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z), 2.0);
  float cov = smoothstep(0.25, 0.85, w.r) * smoothstep(0.15, 0.6, w.g) * clamp(uCloudDensity * (uCloudTop - uCloudBottom) * 0.02, 0.0, 1.0);
  return 1.0 - cov * 0.95;
}
#endif
// positions are evaluated along rs (the axis-stretched ray); t stays metric (|rd| = 1 in world space)
vec3 RD_PHASE;
void integrate(vec3 ro, vec3 rd, float ta, float tb, int n, float jit, inout vec3 L, inout vec3 T) {
  if (tb <= ta || n <= 0) return;
  float cs0 = dot(RD_PHASE, uSunDir[0]), cs1 = dot(RD_PHASE, uSunDir[1]);
  float pr0 = phaseRayleigh(cs0), pm0 = phaseMie(cs0, uMieG);
  float pr1 = phaseRayleigh(cs1), pm1 = phaseMie(cs1, uMieG);
  bool two = dot(uSunIllum[1], uSunIllum[1]) > 0.0;
  float fn = float(n);
  for (int i = 0; i < 48; i++) {
    if (i >= n) break;
    float s0 = float(i) / fn, s1 = (float(i) + 1.0) / fn;
    float ta_i = ta + (tb - ta) * s0 * s0;
    float tb_i = ta + (tb - ta) * s1 * s1;
    float dt = tb_i - ta_i;
    float t = ta_i + dt * jit;
    vec3 p = ro + rd * t;
    float h = length(p);
    vec3 ext, mieS;
    vec3 rs = atmScattering(h - uRg, ext, mieS);
    float muS = dot(p, uSunDir[0]) / h;
    float shade = 1.0;
#ifdef CLOUDS
    shade = belowCloudShadow(p, h, uSunDir[0]);
#endif
    vec3 S = uSunIllum[0] * ((rs * pr0 + mieS * pm0) * sunTransmittance(h, muS) * shade + (rs + mieS) * multiScat(h, muS) * (0.55 + 0.45 * shade));
    if (two) {
      float muS1 = dot(p, uSunDir[1]) / h;
      S += uSunIllum[1] * ((rs * pr1 + mieS * pm1) * sunTransmittance(h, muS1) + (rs + mieS) * multiScat(h, muS1));
    }
    vec3 Ts = exp(-ext * dt);
    L += T * (S - S * Ts) / max(ext, vec3(1e-12));
    T *= Ts;
  }
}

#ifdef CLOUDS
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
float gStorm;   // set by cloudDensity: tall, dense convective cloud (0..1)
vec3 gCell;     // weather-map cell of the last sample (for lightning)
float cloudDensity(vec3 pw, float lodFine, float stepLen, bool primary) {
  float r = length(pw);
  float hf = (r - uCloudBottom) / (uCloudTop - uCloudBottom);
  if (hf <= 0.0 || hf >= 1.0) return 0.0;
  vec3 p = uWorldToPlanet * pw;
  vec3 d = p / r;
  // solid-body drift of the weather field relative to the surface (angle wraps; no unbounded shear)
  vec3 wd = rotY(d, uCloudDrift);
  vec4 w = texture(uWeather, wd);
  float cov = w.r;
  gStorm = cov * smoothstep(0.65, 0.95, w.g);
  gCell = floor(wd * 60.0);
  if (cov < 0.02) return 0.0;
  float topH = mix(0.35, 1.0, w.g);
  // vertical profile: flat bases, rounded tops (cumulus) or uniform deck (overcast)
  float prof = smoothstep(0.0, 0.15, hf) * smoothstep(topH, topH * 0.45, hf);
  prof = mix(prof, smoothstep(0.0, 0.2, hf) * smoothstep(1.0, 0.6, hf), uCloudOvercast);
  float base = cov * prof;
  if (base < 0.01) return 0.0;
  if (primary) {
    // meso-scale structure (broken fields, cells, gaps: ~25–250 km), drifting
    // with the weather; light samples skip it (cheap, slightly softer shadows)
    vec3 pr = rotY(p, uCloudDrift);
    float m1 = gnoise(pr / 150000.0 + 3.7);
    // each octave fades in only once it spans several pixels (no speckle)
    float m2 = gnoise(pr / 41000.0 + 1.3) * smoothstep(41000.0 * 0.4, 41000.0 * 0.12, stepLen);
    float m3 = gnoise(pr / 11000.0 + 5.1) * smoothstep(11000.0 * 0.4, 11000.0 * 0.12, stepLen);
    base *= clamp(0.8 + m1 * 1.1 + m2 * 0.5, 0.0, 1.5);
    base -= max(0.0, -m2) * 0.45 + max(0.0, -m3) * 0.3;
    if (base < 0.01) return 0.0;
  }
  vec3 q = p / uCloudScale + vec3(uCloudTime * 0.002, 0.0, 0.0);
  // mip level from the sample footprint (march step or pixel cone, whichever is
  // larger): detail smaller than a pixel is averaged instead of aliasing into a
  // uniform veil of sub-pixel wisps
  float texel = uCloudScale / 64.0;
  float lod = clamp(log2(max(stepLen / texel, 1.0)), 0.0, 6.0);
  vec2 n = lod < 5.99 ? textureLod(uCloudDetail, q, lod).rg : vec2(0.5);
  float dens = clamp((base - (1.0 - n.r) * 0.55 * (1.0 - hf * 0.3)) / max(1.0 - (1.0 - n.r) * 0.55, 0.1), 0.0, 1.0);
  if (lodFine > 0.5 && dens > 0.0 && lod < 2.5) {
    float n2 = textureLod(uCloudDetail, q * 4.3 + 0.37, lod + 2.1).g;
    dens = clamp(dens - (1.0 - n2) * 0.18 * (1.0 - dens), 0.0, 1.0);
  }
  // clear air between clouds: suppress the faint fringe (even dens ≈ 0.01 is τ ≈ 2 through a deck)
  dens = max(dens - 0.03, 0.0) * (1.0 / 0.97);
  return dens * uCloudDensity;
}
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
#endif

void main() {
  vec3 scene = texture(tColor, vUv).rgb;
  float depth = texture(tDepth, vUv).r;
  vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, -1.0, 1.0); // near plane: avoids w≈1/far cancellation
  vec3 vdir = normalize(vp.xyz / vp.w);
  vec3 rdW = normalize(uViewToWorld * vdir);
  RD_PHASE = rdW;
  float tScene = 1e30;
  if (depth < 0.99999) {
    float w = exp2(depth * log2(uFar + 1.0)) - 1.0;
    tScene = w / max(-vdir.z, 1e-6);
  }
  vec3 ro = uCamPos + uAxis * dot(uCamPos, uAxis) * uOblate;
  vec3 rd = rdW + uAxis * dot(rdW, uAxis) * uOblate;
  vec2 ia = raySphereG(ro, rd, uRt);
  if (ia.x > ia.y || ia.y < 0.0) { gl_FragColor = vec4(scene, 1.0); return; }
  float t0 = max(ia.x, 0.0);
  float t1 = min(ia.y, tScene);
  if (tScene >= 1e29) {
    vec2 ig = raySphereG(ro, rd, uRg);
    if (ig.x < ig.y && ig.x > 0.0) t1 = min(t1, ig.x);
  }
  if (uDebug > 0.5 && uDebug < 1.5) { gl_FragColor = vec4(t0 / 1e6, t1 / 1e6, tScene / 1e6, 1.0); return; }
  if (t1 <= t0) { gl_FragColor = vec4(scene, 1.0); return; }
  float jit = ign(gl_FragCoord.xy + vec2(uFrame * 5.588238, uFrame * 1.13));
  vec3 L = vec3(0.0), T = vec3(1.0);

#ifdef CLOUDS
  // cloud shell interval within [t0, t1]
  vec2 cTop = raySphereG(ro, rd, uCloudTop);
  vec2 cBot = raySphereG(ro, rd, uCloudBottom);
  float ca = 1e30, cb = -1e30;
  float rcam = length(ro);
  if (cTop.x < cTop.y && cTop.y > 0.0) {
    if (rcam > uCloudTop) {
      ca = cTop.x;
      cb = (cBot.x < cBot.y && cBot.x > 0.0) ? cBot.x : cTop.y;
    } else if (rcam > uCloudBottom) {
      ca = 0.0;
      cb = (cBot.x < cBot.y && cBot.x > 0.0) ? cBot.x : cTop.y;
    } else {
      ca = cBot.y; cb = cTop.y;
    }
  }
  ca = max(ca, t0); cb = min(cb, t1);
  if (cb > ca) {
    vec3 L1 = vec3(0.0), T1 = vec3(1.0);
    integrate(ro, rd, t0, ca, max(4, uSteps / 2), jit, L1, T1);
    // march clouds
    int N = uCloudSteps;
    float seg = cb - ca;
    float dtc = seg / float(N);
    float minStep = (uCloudTop - uCloudBottom) / 48.0;
    dtc = max(dtc, minStep);
    vec3 Lc = vec3(0.0);
    float Tc = 1.0;
    // far above a thin deck, per-pixel jitter shows as dither: fade it toward fixed sampling
    float jitAmt = clamp(1.0 - (rcam - uCloudTop) / (25.0 * (uCloudTop - uCloudBottom)), 0.1, 1.0);
    float t = ca + dtc * mix(0.5, jit, jitAmt);
    float c0 = dot(rdW, uSunDir[0]);
    float ph = mix(hg(c0, 0.75), hg(c0, -0.2), 0.35);
    float fine = rcam < uCloudTop * 1.02 ? 1.0 : 0.0;
    float rcamC = rcam;
    float tFirst = -1.0;
    for (int i = 0; i < 96; i++) {
      if (i >= N || t > cb) break;
      vec3 p = ro + rd * t;
      float dens = cloudDensity(p, fine, max(dtc, t * uPixelAngle * 1.5), true);
      if (dens > 1e-5) {
        if (tFirst < 0.0) tFirst = t;
        float h = length(p);
        vec3 up = p / h;
        // light march toward the primary star
        float od = 0.0;
        float ls = (uCloudTop - uCloudBottom) * 0.06;
        vec3 lp = p;
        for (int j = 0; j < 4; j++) {
          lp += uSunDir[0] * ls;
          od += cloudDensity(lp, 0.0, ls, false) * ls;
          ls *= 2.2;
        }
        float muS = dot(up, uSunDir[0]);
        vec3 sunE = uSunIllum[0] * sunTransmittance(h, muS);
        // multiple-scattering octaves (Wrenninge): each octave scatters less
        // forward (eccentricity × c^o) and is attenuated less (extinction × b^o)
        float msum = 0.0, a = 1.0, b = 1.0, cc = 1.0;
        for (int o = 0; o < 3; o++) {
          msum += a * exp(-od * b) * mix(hg(c0, 0.75 * cc), hg(c0, -0.2 * cc), 0.35);
          a *= 0.5; b *= 0.4; cc *= 0.45;
        }
        // diffuse light inside an optically thick deck (two-stream estimate):
        // transmitted fraction ≈ 1 / (1 + 0.75·τ·(1 − g)), g ≈ 0.85, so cloud
        // bases are grey (10–30 % of daylight) rather than black
        float diffuse = 0.95 / PI / (1.0 + 0.11 * od) * (0.35 + 0.65 * clamp(muS * 1.5 + 0.3, 0.0, 1.0));
        float powder = 1.0 - exp(-od * 2.0 - dens * 60.0);
        vec3 amb = (uSunIllum[0] * skyIrradiance(h, muS)) / PI * (0.6 + 0.4 * (h - uCloudBottom) / (uCloudTop - uCloudBottom));
        vec3 S = uCloudAlbedo * (sunE * (msum * mix(1.0, powder, 0.5) * 1.6 + diffuse) + amb);
        if (uStorm > 0.0 && gStorm > 0.05) {
          // lightning: random cells in tall convective cloud flash for ~0.1 s
          float slot = floor(uCloudTime * 6.0);
          float hsh = hash31(gCell + vec3(slot * 1.37, slot * 0.71, 0.0));
          if (hsh > 1.0 - 0.012 * uStorm * gStorm) {
            float ph = fract(uCloudTime * 6.0);
            float pulse = exp(-ph * 9.0) * (0.6 + 0.4 * sin(ph * 60.0));
            S += vec3(0.75, 0.82, 1.0) * 0.02 * pulse * (0.5 + hsh);
          }
        }
        float Ts = exp(-dens * dtc);
        Lc += Tc * S * (1.0 - Ts);
        Tc *= Ts;
        if (Tc < 0.01) { Tc = 0.0; break; }
      }
      t += dtc;
    }
    vec3 L2 = vec3(0.0), T2 = vec3(1.0);
    float split = tFirst > 0.0 ? tFirst : ca;
    // atmosphere between camera and the cloud front attenuates the cloud
    vec3 La = vec3(0.0), Ta = vec3(1.0);
    integrate(ro, rd, ca, split, 3, jit, La, Ta);
    integrate(ro, rd, split, t1, max(4, uSteps / 2), jit, L2, T2);
    L = L1 + T1 * (La + Ta * (Lc + Tc * L2));
    T = T1 * Ta * Tc * T2;
  } else {
    integrate(ro, rd, t0, t1, uSteps, jit, L, T);
  }
#else
  integrate(ro, rd, t0, t1, uSteps, jit, L, T);
#endif
  if (uAurora > 0.0) {
    // auroral ovals around the magnetic poles (≈ spin axis), 95–320 km,
    // shifted toward the night side; folded curtains with fine vertical rays
    float rA0 = uRg + 95000.0, rA1 = uRg + 320000.0;
    vec2 a1 = raySphereG(ro, rd, rA1);
    if (a1.x < a1.y && a1.y > 0.0) {
      vec2 a0 = raySphereG(ro, rd, rA0);
      float ta = max(a1.x, 0.0), tb = a1.y;
      // stop at the planet / the inner shell on the near side
      if (a0.x < a0.y && a0.x > 0.0) tb = min(tb, a0.x);
      tb = min(tb, t1 > t0 ? max(t1, ta) : tb);
      vec3 Lau = vec3(0.0);
      float dta = (tb - ta) / 32.0;
      for (int i = 0; i < 32; i++) {
        vec3 p = ro + rd * (ta + (float(i) + jit) * dta);
        float r = length(p);
        float hA = (r - uRg) / 1000.0;
        if (hA < 95.0 || hA > 320.0) continue;
        vec3 n = p / r;
        float mlat = asin(clamp(dot(n, uAxis), -1.0, 1.0));
        float night = clamp(-dot(n, uSunDir[0]) * 0.5 + 0.5, 0.0, 1.0);
        float ovalLat = 1.17 - 0.08 * night;            // ≈ 67° (lower toward midnight)
        // longitude in magnetic local time: measured from the anti-sun meridian,
        // so the oval stays fixed relative to the star while the planet turns
        vec3 e1 = -uSunDir[0] + uAxis * dot(uSunDir[0], uAxis);
        e1 = dot(e1, e1) > 1e-8 ? normalize(e1) : normalize(cross(uAxis, vec3(0.31, 0.95, 0.07)));
        vec3 e2 = cross(uAxis, e1);
        float lon = atan(dot(n, e2), dot(n, e1));
        float wob = gnoise(vec3(lon * 3.0, uAuroraTime * 0.02, 0.0)) * 0.05;
        float dl = abs(abs(mlat) - ovalLat - wob);
        float oval = exp(-dl * dl / (0.035 * 0.035));
        if (oval < 0.01) continue;
        float curtain = smoothstep(0.35, 0.9, gnoise(vec3(lon * 26.0, abs(mlat) * 40.0, uAuroraTime * 0.05)) * 0.5 + 0.5);
        float rays = 0.6 + 0.4 * gnoise(vec3(lon * 260.0, uAuroraTime * 0.3, 0.0));
        float lowP = exp(-pow((hA - 115.0) / 25.0, 2.0));
        float highP = exp(-pow((hA - 230.0) / 60.0, 2.0)) * 0.4;
        Lau += (uAuroraLow * lowP + uAuroraHigh * highP) * oval * curtain * rays * (0.4 + 0.6 * night);
      }
      // seen from above, nothing lies between the observer and the emitting
      // layer; from below, the whole atmosphere (and clouds) attenuate it
      L += (length(ro) > rA0 ? vec3(1.0) : T) * Lau * dta * uAurora;
    }
  }
  gl_FragColor = vec4(min(scene * T + L * uPreExposure, vec3(6e4)), 1.0);
}
`;

export class AtmospherePass {
  readonly material: THREE.ShaderMaterial;
  constructor(readonly luts: AtmosphereLUTs, readonly clouds: CloudLayer | null) {
    const u: Record<string, THREE.IUniform> = {
      tColor: { value: null },
      tDepth: { value: null },
      uInvProj: { value: new THREE.Matrix4() },
      uViewToWorld: { value: new THREE.Matrix3() },
      uCamPos: { value: new THREE.Vector3() },
      uFar: { value: 1e27 },
      uSunDir: { value: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0)] },
      uSunIllum: { value: [new THREE.Vector3(1, 1, 1), new THREE.Vector3()] },
      uFrame: { value: 0 },
      uSteps: { value: 24 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      tPreExposure: PRE_EXPOSURE_TEX,
      uDebug: { value: 0 },
      uAxis: { value: new THREE.Vector3(0, 1, 0) },
      uOblate: { value: 0 },
      uAurora: { value: 0 },
      uAuroraLow: { value: new THREE.Vector3(0.2, 1, 0.35) },
      uAuroraHigh: { value: new THREE.Vector3(1, 0.15, 0.1) },
      uAuroraTime: { value: 0 },
      uStorm: { value: clouds ? clouds.params.storminess : 0 },
    };
    luts.bind(u);
    const defines: Record<string, number> = {};
    if (clouds) {
      const c = clouds.params;
      defines.CLOUDS = 1;
      Object.assign(u, {
        uWeather: { value: clouds.weather.texture },
        uCloudDetail: { value: cloudDetailTexture() },
        uWorldToPlanet: { value: new THREE.Matrix3() },
        uCloudBottom: { value: luts.params.bottomRadius + c.bottom },
        uCloudTop: { value: luts.params.bottomRadius + c.top },
        uCloudDensity: { value: c.density },
        uCloudScale: { value: c.scale },
        uCloudTime: { value: 0 },
        uCloudDrift: { value: 0 },
        uCloudOvercast: { value: c.overcast },
        uCloudAlbedo: { value: new THREE.Vector3(...c.albedo) },
        uCloudSteps: { value: 48 },
        uPixelAngle: { value: 1e-3 },
      });
    }
    this.material = new THREE.ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: FRAG,
      uniforms: u,
      defines,
      depthTest: false,
      depthWrite: false,
    });
  }
}

/**
 * Aurora parameters from planet physics: needs a magnetosphere and an
 * atmosphere; colour from composition (atomic oxygen: green 557.7 nm and red
 * 630 nm; hydrogen-dominated giants: pink/purple Balmer + H₂ bands; N₂/CO₂:
 * blue–violet).
 */
export function auroraFor(field: number, composition: Record<string, number>, starActivity: number, distAU: number, giant: boolean) {
  if (field < 0.05) return null;
  const o2 = (composition.O2 ?? 0) + (composition.O ?? 0) + (composition.CO2 ?? 0) * 0.3;
  const h2 = (composition.H2 ?? 0) + (composition.He ?? 0) * 0.2;
  let low: [number, number, number], high: [number, number, number];
  if (h2 > 0.5) { low = [0.9, 0.3, 0.8]; high = [0.6, 0.2, 1.0]; }
  else if (o2 > 0.05) { low = [0.2, 1.0, 0.35]; high = [1.0, 0.12, 0.08]; }
  else { low = [0.4, 0.35, 1.0]; high = [0.7, 0.3, 0.9]; }
  // Calibration: an active terrestrial aurora is ~10–100 kR in the 557.7 nm
  // line ≈ 3e-6–3e-5 W m⁻² sr⁻¹, i.e. 1e-8–1e-7 in visual radiance units
  // (solar constant per sr, photopic-weighted) through ~100 km of emitting
  // layer. Solar-wind pressure falls with distance; stronger fields capture more.
  const wind = (0.4 + starActivity) / Math.max(distAU, 0.05);
  const I = 3e-10 * Math.min(4, Math.sqrt(field)) * Math.min(3, Math.sqrt(wind)) * (giant ? 2 : 1);
  return { intensity: I, low, high };
}
