/**
 * Terrain shading. Inputs come from the worker-built vertex channels
 * (altitude, bedrock exposure, geological unit, moisture, temperature,
 * lineae, liquid depth). Appearance therefore follows the generated geology
 * and climate rather than an arbitrary colour ramp.
 */
import * as THREE from 'three';
import { NOISE_GLSL } from './shaders/noise.glsl';
import { ATMOSPHERE_UNIFORMS, ATMOSPHERE_FUNCS, ATMOSPHERE_LUT_FUNCS } from './shaders/atmosphere.glsl';
import { LIGHTING_GLSL, ECLIPSE_GLSL } from './shaders/lighting.glsl';
import type { SurfaceParams, LiquidKind } from '../terrain/surface';
import { DETAIL_PERIOD } from '../terrain/meshbuilder';
import { PRE_EXPOSURE } from './exposure';


export const LIQUID_CODE: Record<LiquidKind, number> = {
  none: 0, water: 1, brine: 2, methane: 3, ammonia: 4, lava: 5, sulfur: 6, nitrogen: 7,
};

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 a0;
attribute vec4 a1;
attribute vec3 morph;
attribute vec3 detail;
uniform float uLodK;
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec4 vA0;
varying vec4 vA1;
varying vec3 vDetail;
void main() {
  vec4 wp0 = modelMatrix * vec4(position, 1.0);
  float dist = length(wp0.xyz);
  float mEnd = 2.0 * uLodK * a1.w;
  float m = smoothstep(0.62 * mEnd, 0.95 * mEnd, dist);
  vec3 pos = position + morph * m;
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorldPos = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vA0 = a0;
  vA1 = a1;
  vDetail = detail + morph * m;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE_GLSL}
${LIGHTING_GLSL}
${ECLIPSE_GLSL}
#ifdef HAS_ATMOSPHERE
${ATMOSPHERE_UNIFORMS}
${ATMOSPHERE_FUNCS}
${ATMOSPHERE_LUT_FUNCS}
#endif
uniform vec3 uPlanetCenter;
uniform float uRadius;
uniform vec3 uSunDir[2];
uniform vec3 uSunIllum[2];
uniform vec3 uRockA, uRockB, uRegolith, uSand, uHighland, uLowland, uIce, uVeg1, uVeg2, uLiqShallow, uLiqDeep, uLineae;
uniform float uLiquid;
uniform float uLiquidTemp;
uniform float uAeolian;
uniform float uRegolithScatter;
uniform float uVegetation;
uniform float uLifeGlow;
uniform float uIceCap;
uniform float uReliefScale;
uniform float uTime;
uniform float uPixelAngle;
uniform float uDetail;
uniform float uAmbient;
uniform vec3 uPlanetShine;
uniform float uPreExposure;
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec4 vA0;
varying vec4 vA1;
varying vec3 vDetail;

const int PERIOD = ${DETAIL_PERIOD};

float footprint;
float bandFade(float wavelength) { return smoothstep(1.5 * footprint, 5.0 * footprint, wavelength); }

// fractal normal perturbation in detail space (metres). Returns gradient of height.
vec3 detailGradient(vec3 p, float rough, out float hsum) {
  vec3 g = vec3(0.0);
  hsum = 0.0;
  float wl = 256.0;
  float amp = 0.10 * wl * rough;
  for (int i = 0; i < 10; i++) {
    float f = bandFade(wl);
    if (f <= 0.0) break;
    int per = PERIOD / int(wl);
    vec4 n = gnoised(p / wl, per);
    g += n.yzw * (amp / wl) * f;
    hsum += n.x * amp * f;
    wl *= 0.5;
    amp *= 0.5 * (0.85 + 0.3 * rough);
  }
  return g;
}

vec3 lavaColor(float T) { return blackbodyColor(T) * pow(clamp((T - 650.0) / 900.0, 0.0, 3.0), 3.0) * 0.6; }

void main() {
  #include <logdepthbuf_fragment>
  vec3 P = vWorldPos;
  float dist = length(P);
  vec3 V = -P / max(dist, 1e-6);
  vec3 up = normalize(P - uPlanetCenter);
  float rPos = length(P - uPlanetCenter);
  vec3 Ng = normalize(vNormalW);
  footprint = max(dist * uPixelAngle, 1e-4);

  float alt = vA0.x;
  float rock = vA0.y;
  float unit = vA0.z;
  float moist = vA0.w;
  float temp = vA1.x;
  float lineae = vA1.y;
  float depth = vA1.z;

  float slope = 1.0 - dot(Ng, up);
  float rockExp = clamp(rock * 0.8 + smoothstep(0.12, 0.42, slope), 0.0, 1.0);

  // ---- micro detail (normal perturbation), stronger on bedrock
  float hs;
  float roughAmt = mix(0.25, 1.0, rockExp) * uDetail;
  vec3 grad = detailGradient(vDetail, roughAmt, hs);
  vec3 N = normalize(Ng - (grad - dot(grad, Ng) * Ng));

  // ---- albedo from geology
  float strataN = gnoise(vec3(alt / (uReliefScale * 0.015 + 2.0), vDetail.x * 0.002, vDetail.z * 0.002));
  vec3 rockCol = mix(uRockA, uRockB, smoothstep(-0.25, 0.35, strataN));
  float speck = gnoised(vDetail / 3.0, PERIOD / 3).x * bandFade(3.0);
  rockCol *= 1.0 + 0.18 * speck;
  vec3 loose = mix(uRegolith, uSand, uAeolian);
  loose *= 1.0 + 0.08 * gnoised(vDetail / 17.0, PERIOD / 16).x;
  vec3 albedo = mix(loose, rockCol, rockExp);
  albedo = mix(albedo, uLowland, clamp((0.5 - unit) * 2.0, 0.0, 1.0) * 0.85);
  albedo = mix(albedo, uHighland, clamp((unit - 0.5) * 2.0, 0.0, 1.0) * 0.85);
  albedo = mix(albedo, uLineae, clamp(lineae, 0.0, 1.0) * 0.8);

  // cracks / pebbles close up
  if (footprint < 0.05) {
    vec3 c = cellular(vDetail * 2.5);
    float crack = 1.0 - smoothstep(0.0, 0.06, c.y - c.x);
    float f = smoothstep(0.05, 0.01, footprint);
    albedo *= 1.0 - crack * 0.35 * f * rockExp;
    albedo *= 1.0 + (c.z - 0.5) * 0.25 * f * (1.0 - rockExp);
  }

  // vegetation (only where a biosphere exists and climate allows)
  float veg = 0.0;
  if (uVegetation > 0.0) {
    veg = uVegetation * smoothstep(0.18, 0.55, moist) * smoothstep(250.0, 278.0, temp) * smoothstep(335.0, 308.0, temp);
    veg *= 1.0 - smoothstep(0.22, 0.45, slope);
    veg *= step(depth, 0.0);
    float patchN = gnoised(vDetail / 41.0, PERIOD / 32).x * 0.5 + 0.5;
    veg *= smoothstep(0.15, 0.55, patchN + moist * 0.4);
    vec3 vc = mix(uVeg1, uVeg2, smoothstep(0.3, 0.7, gnoised(vDetail / 97.0, PERIOD / 64).x * 0.5 + 0.5 + (temp - 290.0) * 0.01));
    albedo = mix(albedo, vc, clamp(veg, 0.0, 1.0));
  }

  // snow / frost: cold + humidity (+ polar cap bias); avoids steep faces
  float frost = smoothstep(274.0, 262.0, temp) * clamp(moist * 1.6 + uIceCap, 0.0, 1.0);
  frost *= 1.0 - smoothstep(0.3, 0.6, slope) * 0.8;
  frost = clamp(frost + hs * 0.002 * frost, 0.0, 1.0);
  albedo = mix(albedo, uIce, frost);
  float iceSpec = frost;

  // ---- lighting
  float roughness = mix(0.9, 0.35, iceSpec);
  vec3 color = vec3(0.0);
  vec3 emission = vec3(0.0);
  bool liquid = depth > 0.0 && uLiquid > 0.5;
  vec3 Nshade = N;
  vec3 waterBody = vec3(0.0);
  float F = 0.0;
  if (liquid) {
    // animated wave normals
    vec3 wp = vDetail;
    vec3 wg = vec3(0.0);
    float wl = 64.0, amp = 0.06;
    for (int i = 0; i < 6; i++) {
      float f = bandFade(wl);
      if (f <= 0.0) break;
      int per = PERIOD / int(wl);
      vec3 q = wp / wl + vec3(uTime * 0.6 / wl * 4.0, 0.0, uTime * 0.45 / wl * 4.0);
      vec4 n = gnoised(q, 0);
      wg += n.yzw * amp * f;
      wl *= 0.5; amp *= 0.8;
    }
    float viscous = uLiquid > 4.5 && uLiquid < 6.5 ? 0.25 : 1.0; // lava/sulfur barely ripple
    Nshade = normalize(up - (wg - dot(wg, up) * up) * viscous);
    F = fresnelSchlick(max(dot(Nshade, V), 0.0), uLiquid > 4.5 && uLiquid < 6.5 ? 0.04 : 0.02);
    float absorb = 1.0 - exp(-depth / (uLiquid == 1.0 ? 18.0 : 6.0));
    waterBody = mix(uLiqShallow, uLiqDeep, absorb);
    roughness = uLiquid > 4.5 && uLiquid < 6.5 ? 0.5 : 0.06;
    albedo = waterBody;
  }

  float NdotV = max(dot(Nshade, V), 1e-3);
  for (int k = 0; k < 2; k++) {
    vec3 E = uSunIllum[k];
    if (dot(E, E) <= 0.0) continue;
    vec3 L = uSunDir[k];
    float muS = dot(up, L);
    vec3 sunT;
#ifdef HAS_ATMOSPHERE
    sunT = sunTransmittance(rPos, muS);
    vec3 sky = skyIrradiance(rPos, muS);
#else
    float sinH = uRadius / max(rPos, uRadius);
    float cosH = -sqrt(max(0.0, 1.0 - sinH * sinH));
    sunT = vec3(smoothstep(cosH - 0.01, cosH + 0.01, muS));
    vec3 sky = vec3(0.0);
#endif
    float ecl = eclipseFactor(P, k);
    vec3 Ein = E * sunT * ecl;
    float NdotL = max(dot(Nshade, L), 0.0);
    // geometric self-shadowing of the macro normal (mountain back-faces)
    NdotL *= smoothstep(-0.05, 0.1, dot(Ng, L));
    // Lambert blended with Lommel–Seeliger for dusty airless regolith (flat-looking full moon)
    float ls = 2.0 * NdotL / (NdotL + NdotV);
    float diff = mix(NdotL, ls, uRegolithScatter * (1.0 - frost));
    vec3 H = normalize(L + V);
    float NdotH = max(dot(Nshade, H), 0.0);
    float a = roughness * roughness;
    float spec = D_GGX(NdotH, a) * V_SmithGGX(NdotV, NdotL, a) * NdotL;
    bool lavaLike = uLiquid > 4.5 && uLiquid < 6.5;
    float f0 = liquid ? (lavaLike ? 0.04 : 0.02) : mix(0.03, 0.05, iceSpec);
    float Fh = fresnelSchlick(max(dot(H, V), 0.0), f0);
    vec3 diffuse = albedo / PI * Ein * diff * (liquid ? (1.0 - F) : 1.0);
    vec3 specular = Ein * spec * Fh * (liquid ? 1.0 : mix(0.5, 1.0, iceSpec));
    // sky ambient (hemisphere weighted by normal)
    float skyW = 0.5 + 0.5 * dot(Nshade, up);
    vec3 ambient = albedo / PI * E * sky * skyW * ecl * (liquid ? (1.0 - F) : 1.0);
    vec3 reflection = liquid ? E * sky / PI * F * 1.2 * ecl : vec3(0.0);
    color += diffuse + specular + ambient + reflection;
  }
  // faint planet-shine / starlight ambient so night sides are not pure black
  color += albedo * (uPlanetShine + vec3(uAmbient));

  // emission: molten material radiates as a blackbody
  float hotT = liquid && (uLiquid == 5.0 || uLiquid == 6.0) ? uLiquidTemp : temp;
  if (hotT > 700.0) {
    float crust = 1.0;
    if (liquid) {
      vec3 c = cellular(vDetail / 9.0 + vec3(0.0, uTime * 0.01, 0.0));
      crust = smoothstep(0.0, 0.12, c.y - c.x);
      emission += lavaColor(hotT) * mix(1.0, 0.12, crust);
    } else {
      emission += lavaColor(hotT) * 0.8;
    }
  }
  // bioluminescence on the night side
  if (uLifeGlow > 0.0 && veg > 0.05) {
    float night = smoothstep(0.05, -0.15, dot(up, uSunDir[0]));
    float spots = smoothstep(0.55, 0.9, gnoised(vDetail / 5.0, PERIOD / 4).x * 0.5 + 0.5);
    emission += uVeg2 * uLifeGlow * night * veg * (0.02 + 0.2 * spots) * 0.05;
  }
  gl_FragColor = vec4(min((color + emission) * uPreExposure, vec3(6e4)), 1.0);
}
`;

export interface TerrainMaterialOptions {
  hasAtmosphere: boolean;
}

export function createTerrainMaterial(sp: SurfaceParams, opts: TerrainMaterialOptions): THREE.ShaderMaterial {
  const c = (rgb: number[]) => new THREE.Vector3(rgb[0], rgb[1], rgb[2]);
  const pal = sp.palette;
  const uniforms: Record<string, THREE.IUniform> = {
    uPlanetCenter: { value: new THREE.Vector3() },
    uRadius: { value: sp.radius },
    uSunDir: { value: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0)] },
    uSunIllum: { value: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(0, 0, 0)] },
    uSunPos: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uOcc: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uOccCount: { value: 0 },
    uRockA: { value: c(pal.rockA) },
    uRockB: { value: c(pal.rockB) },
    uRegolith: { value: c(pal.regolith) },
    uSand: { value: c(pal.sand) },
    uHighland: { value: c(pal.highland) },
    uLowland: { value: c(pal.lowland) },
    uIce: { value: c(pal.ice) },
    uVeg1: { value: c(pal.veg1) },
    uVeg2: { value: c(pal.veg2) },
    uLiqShallow: { value: c(pal.liquidShallow) },
    uLiqDeep: { value: c(pal.liquidDeep) },
    uLineae: { value: c(pal.lineae) },
    uLiquid: { value: LIQUID_CODE[sp.liquid] },
    uLiquidTemp: { value: sp.liquid === 'lava' ? 1400 : sp.liquid === 'sulfur' ? 450 : 0 },
    uAeolian: { value: sp.dunes > 0.05 ? 1 : 0.25 },
    uRegolithScatter: { value: opts.hasAtmosphere ? 0.15 : 0.85 },
    uVegetation: { value: sp.vegetation },
    uLifeGlow: { value: sp.lifeGlow },
    uIceCap: { value: sp.iceCap },
    uReliefScale: { value: sp.reliefScale },
    uTime: { value: 0 },
    uPixelAngle: { value: 0.001 },
    uDetail: { value: 1 },
    uAmbient: { value: 3e-9 }, // starlight + airglow ≈ 1e-9 of daylight
    uPlanetShine: { value: new THREE.Vector3() },
    uLodK: { value: 3.5 },
    uPreExposure: PRE_EXPOSURE,
  };
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    defines: opts.hasAtmosphere ? { HAS_ATMOSPHERE: 1 } : {},
  });
  m.extensions = { clipCullDistance: false, multiDraw: false };
  return m;
}
