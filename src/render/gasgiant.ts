/**
 * Gas / ice giant renderer. Zonal bands with latitude-dependent jets are
 * advected with a two-phase flow map (bounded distortion at any time-warp),
 * turbulent eddies along band edges, sparse oval storms and an optional great
 * anticyclone. Lighting: Lambert × limb darkening; the atmosphere composite
 * pass adds the limb haze. Hot giants glow thermally on the night side.
 */
import * as THREE from 'three';
import { NOISE_GLSL } from './shaders/noise.glsl';
import { LIGHTING_GLSL, ECLIPSE_GLSL } from './shaders/lighting.glsl';
import type { Body } from '../astro/body';
import type { FrameContext } from './planetrenderer';
import { sunIlluminanceAt, updateAurora } from './planetrenderer';
import { AtmosphereLUTs } from './atmosphere';
import { AtmospherePass } from './atmospherepass';
import { RING_SHADOW_GLSL, RingSystem } from './rings';
import { PRE_EXPOSURE, PRE_EXPOSURE_TEX, PRE_EXPOSURE_GLSL } from './exposure';


const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vObj;
varying vec3 vWorldPos;
varying vec3 vWorldN;
void main() {
  vObj = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldN = normalize(mat3(modelMatrix) * normal);
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
${RING_SHADOW_GLSL}
uniform vec3 uBand[6];
uniform int uBandN;
uniform float uBandCount;
uniform float uTurb;
uniform float uStorms;
uniform float uSpot;
uniform float uHaze;
uniform vec3 uHazeColor;
uniform float uGlow;
uniform float uGlowTemp;
uniform float uSeed;
uniform float uTime;   // seconds
uniform float uFlowPeriod;
uniform vec3 uSunDir[2];
uniform vec3 uSunIllum[2];
uniform vec3 uCenter;
${PRE_EXPOSURE_GLSL}
varying vec3 vObj;
varying vec3 vWorldPos;
varying vec3 vWorldN;

vec3 bandColor(float x) {
  // smooth palette lookup across up to 6 colours
  float n = float(uBandN);
  float f = fract(x) * n;
  int i0 = int(floor(f));
  int i1 = i0 + 1;
  if (i1 >= uBandN) i1 = 0;
  vec3 a = uBand[0], b = uBand[0];
  for (int k = 0; k < 6; k++) { if (k == i0) a = uBand[k]; if (k == i1) b = uBand[k]; }
  return mix(a, b, smoothstep(0.2, 0.8, fract(f)));
}
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }

vec3 cloudsAt(vec3 p, float phase) {
  float lat = p.y;
  // zonal jets: alternating prograde/retrograde with latitude
  float jet = sin(lat * uBandCount * 1.6 + uSeed) * (1.0 - lat * lat);
  vec3 q = rotY(p, jet * phase * 0.6);
  vec3 w = vec3(fbm3(q * 3.0 + uSeed, 4), fbm3(q * 3.0 + uSeed + 7.0, 4), fbm3(q * 3.0 + uSeed + 13.0, 4));
  float y = lat + uTurb * 0.06 * w.x + 0.012 * fbm3(q * vec3(4.0, 40.0, 4.0) + uSeed, 5);
  float b = y * uBandCount * 0.5 + 0.5 * fbm3(vec3(y * 9.0, uSeed, 0.0), 3);
  vec3 col = bandColor(b * 0.37 + 0.5);
  // fine turbulent eddies along band shear zones
  float shear = abs(cos(lat * uBandCount * 1.6 + uSeed));
  float edd = fbm3(q * vec3(14.0, 22.0, 14.0) + w * 1.5, 5);
  col *= 1.0 + 0.18 * edd * uTurb * (0.4 + shear);
  return col;
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 p = vObj;
  // two-phase flow map: distortion stays bounded under any time-warp
  float t = uTime / uFlowPeriod;
  float ph0 = fract(t), ph1 = fract(t + 0.5);
  float wgt = abs(ph0 - 0.5) * 2.0;
  vec3 col = mix(cloudsAt(p, ph0 * 2.0 - 1.0), cloudsAt(p, ph1 * 2.0 - 1.0), wgt);
  // oval storms
  vec3 c = cellular(p * vec3(9.0, 18.0, 9.0) + uSeed);
  float storm = smoothstep(0.18, 0.05, c.x) * step(1.0 - uStorms * 0.35, c.z);
  col = mix(col, mix(col * 1.25, vec3(0.95), 0.4), storm * 0.7);
  // great spot
  if (uSpot > 0.0) {
    vec3 sc = normalize(vec3(cos(uSeed), -0.36, sin(uSeed)));
    vec3 d = p - sc;
    float e = length(vec3(d.x, d.y * 1.9, d.z)) / (0.12 * uSpot);
    float spot = smoothstep(1.0, 0.6, e);
    float swirl = fbm3(vec3(atan(d.z, d.x) * 2.0 + e * 6.0, e * 3.0, uSeed), 3);
    col = mix(col, uBand[min(1, uBandN - 1)] * vec3(1.15, 0.75, 0.6) * (0.9 + 0.3 * swirl), spot * 0.85);
  }
  // high haze washes out contrast (ice giants)
  col = mix(col, uHazeColor, uHaze * 0.55);

  vec3 N = normalize(vWorldN);
  vec3 V = normalize(-vWorldPos);
  float mu = max(dot(N, V), 0.0);
  vec3 radiance = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    vec3 E = uSunIllum[k];
    if (dot(E, E) <= 0.0) continue;
    float NdotL = dot(N, uSunDir[k]);
    float lit = max(NdotL, 0.0);
    // soft terminator from the deep atmosphere
    lit = smoothstep(-0.06, 0.25, NdotL) * max(NdotL + 0.06, 0.0) / 1.06;
    float limb = 0.55 + 0.45 * pow(mu, 0.4);
    float ecl = eclipseFactor(vWorldPos, k) * ringShadow(vWorldPos, uSunDir[k]);
    radiance += col / PI * E * lit * limb * ecl;
  }
  // thermal glow (hot Jupiters)
  if (uGlow > 0.0) {
    float night = 1.0 - smoothstep(-0.2, 0.3, dot(N, uSunDir[0]));
    radiance += blackbodyColor(uGlowTemp) * uGlow * 0.02 * pow(uGlowTemp / 1500.0, 4.0) * (0.3 + 0.7 * night) * (0.7 + 0.3 * fbm3(p * 8.0 + uSeed, 3));
  }
  gl_FragColor = vec4(min(radiance * uPreExposure, vec3(6e4)), 1.0);
}
`;

export class GasGiantRenderer {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  luts: AtmosphereLUTs | null = null;
  atmPass: AtmospherePass | null = null;
  rings: RingSystem | null = null;
  atmosphereVisible = false;
  occluders: THREE.Vector4[] = [];
  flattening = 0;

  constructor(readonly body: Body, private renderer: THREE.WebGLRenderer) {
    const gg = body.planet!.gasGiant!;
    const bands = gg.bandColors.slice(0, 6).map((c) => new THREE.Vector3(c[0], c[1], c[2]));
    while (bands.length < 6) bands.push(bands[bands.length - 1].clone());
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uBand: { value: bands },
        uBandN: { value: Math.min(6, gg.bandColors.length) },
        uBandCount: { value: gg.bandCount },
        uTurb: { value: gg.turbulence },
        uStorms: { value: gg.storms },
        uSpot: { value: gg.greatSpot },
        uHaze: { value: gg.haze },
        uHazeColor: { value: new THREE.Vector3(...gg.hazeColor) },
        uGlow: { value: gg.glow },
        uGlowTemp: { value: gg.glowTemp },
        uSeed: { value: (gg.seed % 1000) / 10 },
        uTime: { value: 0 },
        uFlowPeriod: { value: 3600 * 24 * 20 },
        uSunDir: { value: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0)] },
        uSunIllum: { value: [new THREE.Vector3(), new THREE.Vector3()] },
        uCenter: { value: new THREE.Vector3() },
        uSunPos: { value: [new THREE.Vector4(), new THREE.Vector4()] },
        uOcc: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
        uOccCount: { value: 0 },
        ...RingSystem.shadowUniforms(),
        tPreExposure: PRE_EXPOSURE_TEX,
      },
    });
    // oblate (rotational flattening ~ up to 10%)
    const geo = new THREE.SphereGeometry(1, 160, 96);
    this.mesh = new THREE.Mesh(geo, this.material);
    const R = body.radius;
    const period = Math.abs(body.rotation.period) || 36000;
    const flat = Math.min(0.1, (4 * Math.PI ** 2 * R ** 3) / (period ** 2 * body.mu) * 0.6);
    this.mesh.scale.set(R, R * (1 - flat), R);
    this.flattening = flat;
    this.group.add(this.mesh);
    if (body.planet!.rings) {
      this.rings = new RingSystem(body);
      this.group.add(this.rings.mesh);
      this.rings.bindShadow(this.material.uniforms);
    }
  }

  private ensureAtmosphere() {
    if (this.luts || !this.body.planet!.atmosphereRender) return;
    this.luts = new AtmosphereLUTs(this.body.planet!.atmosphereRender);
    this.luts.compute(this.renderer);
    this.atmPass = new AtmospherePass(this.luts, null);
  }

  update(ctx: FrameContext, rel: THREE.Vector3, rot: THREE.Quaternion) {
    const R = this.body.radius;
    const dist = rel.length();
    const ang = R / Math.max(dist, 1);
    const visible = ang > ctx.pixelAngle * 1.2;
    this.group.visible = visible;
    this.atmosphereVisible = false;
    if (!visible) return;
    this.group.position.copy(rel);
    this.group.quaternion.copy(rot);
    const u = this.material.uniforms;
    u.uTime.value = ctx.time;
    u.uCenter.value.copy(rel);
    for (let k = 0; k < 2; k++) {
      const s = ctx.suns[k];
      if (s) {
        sunIlluminanceAt(s, rel, u.uSunDir.value[k], u.uSunIllum.value[k]);
        u.uSunPos.value[k].set(s.rel.x, s.rel.y, s.rel.z, s.radius);
      } else u.uSunIllum.value[k].set(0, 0, 0);
    }
    const n = Math.min(4, this.occluders.length);
    for (let i = 0; i < n; i++) u.uOcc.value[i].copy(this.occluders[i]);
    u.uOccCount.value = n;
    if (this.rings) this.rings.update(ctx, rel, rot, u.uSunDir.value[0], u.uSunIllum.value[0], u);
    if (ang > ctx.pixelAngle * 3) {
      this.ensureAtmosphere();
      if (this.atmPass) {
        const au = this.atmPass.material.uniforms;
        au.uCamPos.value.copy(rel).negate();
        au.uInvProj.value.copy(ctx.camera.projectionMatrixInverse);
        au.uViewToWorld.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(ctx.camQuat));
        au.uFar.value = ctx.camera.far;
        au.uFrame.value = ctx.frame % 64;
        au.uSteps.value = Math.max(8, ctx.quality.atmSteps >> 1);
        updateAurora(au, this.body, ctx, rel);
        au.uAxis.value.set(0, 1, 0).applyQuaternion(rot);
        au.uOblate.value = 1 / (1 - this.flattening) - 1;
        for (let k = 0; k < 2; k++) {
          au.uSunDir.value[k].copy(u.uSunDir.value[k]);
          au.uSunIllum.value[k].copy(u.uSunIllum.value[k]);
        }
        this.atmosphereVisible = true;
      }
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.luts?.dispose();
    this.atmPass?.dispose();
    this.rings?.dispose();
  }
}
