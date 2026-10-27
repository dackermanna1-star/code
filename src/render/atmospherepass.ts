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
import { PRE_EXPOSURE } from './exposure';


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
uniform float uPreExposure;
#ifdef CLOUDS
uniform samplerCube uWeather;
uniform sampler3D uCloudDetail;
uniform mat3 uWorldToPlanet;
uniform float uCloudBottom, uCloudTop, uCloudDensity, uCloudScale, uCloudTime, uCloudDrift, uCloudOvercast;
uniform vec3 uCloudAlbedo;
uniform int uCloudSteps;
#endif
varying vec2 vUv;

void integrate(vec3 ro, vec3 rd, float ta, float tb, int n, float jit, inout vec3 L, inout vec3 T) {
  if (tb <= ta || n <= 0) return;
  float cs0 = dot(rd, uSunDir[0]), cs1 = dot(rd, uSunDir[1]);
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
    vec3 S = uSunIllum[0] * ((rs * pr0 + mieS * pm0) * sunTransmittance(h, muS) + (rs + mieS) * multiScat(h, muS));
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
float cloudDensity(vec3 pw, float lodFine, float stepLen) {
  float r = length(pw);
  float hf = (r - uCloudBottom) / (uCloudTop - uCloudBottom);
  if (hf <= 0.0 || hf >= 1.0) return 0.0;
  vec3 p = uWorldToPlanet * pw;
  vec3 d = p / r;
  // solid-body drift of the weather field relative to the surface (angle wraps; no unbounded shear)
  vec3 wd = rotY(d, uCloudDrift);
  vec4 w = texture(uWeather, wd);
  float cov = w.r;
  if (cov < 0.02) return 0.0;
  float topH = mix(0.35, 1.0, w.g);
  // vertical profile: flat bases, rounded tops (cumulus) or uniform deck (overcast)
  float prof = smoothstep(0.0, 0.15, hf) * smoothstep(topH, topH * 0.45, hf);
  prof = mix(prof, smoothstep(0.0, 0.2, hf) * smoothstep(1.0, 0.6, hf), uCloudOvercast);
  float base = cov * prof;
  if (base < 0.01) return 0.0;
  vec3 q = p / uCloudScale + vec3(uCloudTime * 0.002, 0.0, 0.0);
  // mip level from the march step: avoid aliasing detail smaller than a step
  float texel = uCloudScale / 64.0;
  float lod = clamp(log2(max(stepLen / texel, 1.0)), 0.0, 6.0);
  vec2 n = textureLod(uCloudDetail, q, lod).rg;
  float dens = clamp((base - (1.0 - n.r) * 0.55 * (1.0 - hf * 0.3)) / max(1.0 - (1.0 - n.r) * 0.55, 0.1), 0.0, 1.0);
  if (lodFine > 0.5 && dens > 0.0 && lod < 2.5) {
    float n2 = textureLod(uCloudDetail, q * 4.3 + 0.37, lod + 2.1).g;
    dens = clamp(dens - (1.0 - n2) * 0.18 * (1.0 - dens), 0.0, 1.0);
  }
  return dens * uCloudDensity;
}
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
#endif

void main() {
  vec3 scene = texture(tColor, vUv).rgb;
  float depth = texture(tDepth, vUv).r;
  vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, -1.0, 1.0); // near plane: avoids w≈1/far cancellation
  vec3 vdir = normalize(vp.xyz / vp.w);
  vec3 rd = normalize(uViewToWorld * vdir);
  float tScene = 1e30;
  if (depth < 0.99999) {
    float w = exp2(depth * log2(uFar + 1.0)) - 1.0;
    tScene = w / max(-vdir.z, 1e-6);
  }
  vec3 ro = uCamPos;
  vec2 ia = raySphere(ro, rd, uRt);
  if (ia.x > ia.y || ia.y < 0.0) { gl_FragColor = vec4(scene, 1.0); return; }
  float t0 = max(ia.x, 0.0);
  float t1 = min(ia.y, tScene);
  if (tScene >= 1e29) {
    vec2 ig = raySphere(ro, rd, uRg);
    if (ig.x < ig.y && ig.x > 0.0) t1 = min(t1, ig.x);
  }
  if (t1 <= t0) { gl_FragColor = vec4(scene, 1.0); return; }
  float jit = ign(gl_FragCoord.xy + vec2(uFrame * 5.588238, uFrame * 1.13));
  vec3 L = vec3(0.0), T = vec3(1.0);

#ifdef CLOUDS
  // cloud shell interval within [t0, t1]
  vec2 cTop = raySphere(ro, rd, uCloudTop);
  vec2 cBot = raySphere(ro, rd, uCloudBottom);
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
    float c0 = dot(rd, uSunDir[0]);
    float ph = mix(hg(c0, 0.75), hg(c0, -0.2), 0.35);
    float fine = rcam < uCloudTop * 1.02 ? 1.0 : 0.0;
    float rcamC = rcam;
    float tFirst = -1.0;
    for (int i = 0; i < 96; i++) {
      if (i >= N || t > cb) break;
      vec3 p = ro + rd * t;
      float dens = cloudDensity(p, fine, dtc);
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
          od += cloudDensity(lp, 0.0, ls) * ls;
          ls *= 2.2;
        }
        float muS = dot(up, uSunDir[0]);
        vec3 sunE = uSunIllum[0] * sunTransmittance(h, muS);
        // multiple-scattering octaves (Wrenninge)
        float msum = 0.0, a = 1.0, b = 1.0, cc = 1.0;
        for (int o = 0; o < 3; o++) {
          msum += a * exp(-od * b) * mix(hg(c0 * cc, 0.75), hg(c0 * cc, -0.2), 0.35);
          a *= 0.5; b *= 0.4; cc *= 0.6;
        }
        float powder = 1.0 - exp(-od * 2.0 - dens * 60.0);
        vec3 amb = (uSunIllum[0] * skyIrradiance(h, muS)) / PI * (0.6 + 0.4 * (h - uCloudBottom) / (uCloudTop - uCloudBottom));
        vec3 S = uCloudAlbedo * (sunE * msum * mix(1.0, powder, 0.5) * 1.6 + amb);
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
      uPreExposure: PRE_EXPOSURE,
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
