// Sky, lighting and weather visuals: a procedural sky dome (time of day,
// sun, clouds, stars, moon, lightning), the sun/moon directional light with a
// camera-following shadow frustum, hemisphere ambient light, fog, exposure
// and rain streaks.

import * as THREE from 'three';
import { clamp, lerp } from '../core/math.js';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uCloudLit;
uniform vec3 uCloudDark;
uniform vec3 uFogColor;
uniform float uCloud;
uniform float uTime;
uniform float uStars;
uniform float uFlash;
uniform float uHaze;
uniform float uSunVis;
uniform vec2 uWind;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = pow(clamp(h, 0.0, 1.0), 0.42);
  vec3 col = mix(uHorizon, uZenith, t);
  col = mix(col, uGround, smoothstep(0.0, -0.12, h));
  float sd = max(dot(d, uSunDir), 0.0);
  float clear = 1.0 - uCloud * 0.85;
  col += uSunColor * (pow(sd, 6.0) * 0.18 + pow(sd, 48.0) * 0.45) * clear * uSunVis;
  col += uSunColor * smoothstep(0.99955, 0.9998, sd) * 16.0 * clear * uSunVis;
  // Stars and moon.
  if (uStars > 0.001 && h > 0.0) {
    vec3 sp = d * 420.0;
    vec2 cell = floor(sp.xz / (abs(sp.y) * 0.004 + 1.0) * 0.5 + sp.y * 0.13);
    float st = hash(cell);
    float twinkle = 0.7 + 0.3 * sin(uTime * 3.0 + st * 60.0);
    float star = step(0.9965, st) * smoothstep(0.02, 0.25, h) * twinkle;
    col += vec3(0.85, 0.9, 1.0) * star * uStars * (1.0 - uCloud);
    float md = max(dot(d, uMoonDir), 0.0);
    col += vec3(0.75, 0.8, 0.9) * (smoothstep(0.9993, 0.9996, md) * 2.2 + pow(md, 120.0) * 0.08) * uStars * (1.0 - uCloud * 0.9);
  }
  // Clouds projected on a high plane.
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.08) * 1.25 + uWind * uTime;
    float n = fbm(uv);
    float cov = smoothstep(1.02 - uCloud * 0.85, 1.32 - uCloud * 0.85, n + 0.35 * uCloud);
    float thick = fbm(uv * 2.1 + 4.0);
    float lit = clamp(0.55 + dot(d, uSunDir) * 0.25 + (thick - 0.5) * 0.9 - cov * 0.25, 0.0, 1.0);
    vec3 cc = mix(uCloudDark, uCloudLit, lit);
    cc += uSunColor * pow(sd, 10.0) * 0.35 * (1.0 - cov) * uSunVis;
    col = mix(col, cc, cov * smoothstep(0.0, 0.12, h));
  }
  col = mix(col, uFogColor, (1.0 - smoothstep(0.0, 0.3, abs(h))) * uHaze);
  col += vec3(0.55, 0.6, 0.75) * uFlash * (0.4 + 0.6 * clamp(h, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

const RAIN_VERT = /* glsl */ `
attribute vec3 aSeed;
attribute float aEnd;
uniform vec3 uOrigin;
uniform vec3 uBox;
uniform float uTime;
uniform vec3 uVel;
uniform float uLen;
varying float vA;
void main() {
  // World-anchored drops wrapped into a box around the camera.
  vec3 p = aSeed * uBox + uVel * uTime - uOrigin;
  p = mod(p, uBox) - uBox * 0.5 + uOrigin;
  p -= uVel * uLen * aEnd;
  vA = (1.0 - aEnd) * 0.55 + 0.1;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const RAIN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
void main() {
  gl_FragColor = vec4(uColor, vA * uOpacity);
}
`;

function c3(hex) {
  return new THREE.Color(hex);
}

const KEYS = {
  dayZenith: c3(0x3c6aa8),
  dayHorizon: c3(0xaecbe0),
  goldZenith: c3(0x46679a),
  goldHorizon: c3(0xf0a868),
  duskZenith: c3(0x1a2646),
  duskHorizon: c3(0xb0604a),
  nightZenith: c3(0x02040a),
  nightHorizon: c3(0x0a1220),
  overZenith: c3(0x6a737c),
  overHorizon: c3(0x9da3a8),
  overNightZenith: c3(0x07090c),
  overNightHorizon: c3(0x12161b),
  sunDay: c3(0xfff2df),
  sunGold: c3(0xffa860),
  moon: c3(0x8ea6d0),
};

const _a = new THREE.Color();
const _b = new THREE.Color();

export class SkyRenderer {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;
    const geo = new THREE.SphereGeometry(4000, 48, 24);
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color(0x2a2a26) },
      uCloudLit: { value: new THREE.Color() },
      uCloudDark: { value: new THREE.Color() },
      uFogColor: { value: new THREE.Color() },
      uCloud: { value: 0.2 },
      uTime: { value: 0 },
      uStars: { value: 0 },
      uFlash: { value: 0 },
      uHaze: { value: 0.5 },
      uSunVis: { value: 1 },
      uWind: { value: new THREE.Vector2(0.004, 0.002) },
    };
    this.dome = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    // Sun / moon light.
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = !!quality.shadows;
    if (quality.shadows) {
      const s = this.sun.shadow;
      s.mapSize.set(quality.shadowSize, quality.shadowSize);
      s.camera.near = 10;
      s.camera.far = 2400;
      const r = quality.shadowRadius;
      s.camera.left = -r;
      s.camera.right = r;
      s.camera.top = r;
      s.camera.bottom = -r;
      s.bias = -0.0004;
      s.normalBias = 0.6;
    }
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd2ea, 0x4a4632, 0.9);
    scene.add(this.hemi);
    this.fog = new THREE.FogExp2(0x9fb3c4, 0.0003);
    scene.fog = this.fog;

    this.buildRain();
    this.sunDir = new THREE.Vector3();
    this.ambientLevel = new THREE.Color(1, 1, 1);
    this.exposure = 1;
    this.nightFactor = 0;
  }

  buildRain() {
    const N = Math.round(14000 * (this.quality.particles ?? 1));
    const seeds = new Float32Array(N * 2 * 3);
    const ends = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const sx = Math.random();
      const sy = Math.random();
      const sz = Math.random();
      for (let k = 0; k < 2; k++) {
        seeds.set([sx, sy, sz], (i * 2 + k) * 3);
        ends[i * 2 + k] = k;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    this.rainUniforms = {
      uOrigin: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(70, 45, 70) },
      uTime: { value: 0 },
      uVel: { value: new THREE.Vector3(0, -9, 0) },
      uLen: { value: 0.045 },
      uColor: { value: new THREE.Color(0.75, 0.8, 0.88) },
      uOpacity: { value: 0 },
    };
    this.rain = new THREE.LineSegments(
      geo,
      new THREE.ShaderMaterial({ vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, uniforms: this.rainUniforms, transparent: true, depthWrite: false, fog: false }),
    );
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 20;
    this.rainMax = N;
    this.scene.add(this.rain);
  }

  // weather: sim Weather; focus: point the shadow frustum should cover.
  update(dt, time, camera, weather, focus) {
    const el = weather.sunElevation;
    const az = weather.sunAzimuth;
    const cloud = clamp(weather.cloud, 0, 1);
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const moonDir = new THREE.Vector3(-this.sunDir.x * 0.6 + 0.3, Math.max(0.35, -this.sunDir.y + 0.25), -this.sunDir.z * 0.6 + 0.2).normalize();
    const day = clamp((el + 0.08) / 0.4, 0, 1); // 0 night .. 1 day
    const gold = clamp(1 - Math.abs(el - 0.08) / 0.22, 0, 1) * (el > -0.15 ? 1 : 0);
    const night = 1 - clamp((el + 0.2) / 0.25, 0, 1);
    this.nightFactor = night;
    const U = this.uniforms;
    U.uSunDir.value.copy(this.sunDir);
    U.uMoonDir.value.copy(moonDir);
    // Clear-sky colours across the day.
    const zen = _a.copy(KEYS.nightZenith).lerp(KEYS.duskZenith, clamp((el + 0.25) / 0.2, 0, 1)).lerp(KEYS.dayZenith, day);
    const hor = _b.copy(KEYS.nightHorizon).lerp(KEYS.duskHorizon, clamp((el + 0.2) / 0.2, 0, 1)).lerp(KEYS.dayHorizon, day);
    zen.lerp(KEYS.goldZenith, gold * 0.4);
    hor.lerp(KEYS.goldHorizon, gold * 0.75);
    // Overcast greys.
    const oz = KEYS.overNightZenith.clone().lerp(KEYS.overZenith, day);
    const oh = KEYS.overNightHorizon.clone().lerp(KEYS.overHorizon, day);
    zen.lerp(oz, cloud * 0.85);
    hor.lerp(oh, cloud * 0.8);
    U.uZenith.value.copy(zen);
    U.uHorizon.value.copy(hor);
    const sunCol = KEYS.sunGold.clone().lerp(KEYS.sunDay, clamp(el / 0.35, 0, 1));
    U.uSunColor.value.copy(sunCol);
    U.uSunVis.value = clamp((el + 0.03) / 0.08, 0, 1);
    U.uCloud.value = cloud;
    U.uCloudLit.value.copy(sunCol).multiplyScalar(0.95 * day + 0.05).lerp(new THREE.Color(0.55, 0.57, 0.6).multiplyScalar(day * 0.9 + 0.04), cloud * 0.7);
    U.uCloudDark.value.copy(hor).multiplyScalar(0.55 + 0.1 * day);
    U.uStars.value = night;
    U.uTime.value = time;
    U.uFlash.value = weather.flash;
    U.uWind.value.set(weather.windX * 0.0004, weather.windZ * 0.0004);

    // Fog follows the horizon colour; density from fog and rain.
    const fogCol = hor.clone().lerp(new THREE.Color(0.55, 0.57, 0.6).multiplyScalar(0.2 + 0.8 * day), clamp(weather.fog * 1.2, 0, 0.8));
    this.fog.color.copy(fogCol);
    this.fog.density = lerp(0.00026, 0.0042, Math.pow(weather.fog, 1.6)) + weather.rain * 0.0006 + cloud * 0.00008;
    U.uFogColor.value.copy(fogCol);
    U.uHaze.value = 0.35 + weather.fog * 0.6;
    this.renderer.setClearColor(fogCol);

    // Lights.
    const sunUp = el > -0.02;
    const lightDir = sunUp ? this.sunDir : moonDir;
    const sunI = sunUp ? 3.4 * clamp(el / 0.25, 0, 1) * (1 - cloud * 0.72) : 0.22 * (1 - cloud * 0.6);
    this.sun.color.copy(sunUp ? sunCol : KEYS.moon);
    this.sun.intensity = sunI;
    const flash = weather.flash;
    const hemiI = lerp(0.12, 1.15, day) * (1 - cloud * 0.2) + flash * 1.2;
    this.hemi.intensity = hemiI;
    this.hemi.color.copy(zen).lerp(new THREE.Color(1, 1, 1), 0.35);
    this.hemi.groundColor.setRGB(0.28, 0.25, 0.18).multiplyScalar(0.4 + day * 0.6);
    // Ambient level for particles (smoke darkens at night).
    const amb = lerp(0.1, 1, day) * (1 - cloud * 0.25) + flash * 0.8;
    this.ambientLevel.setRGB(amb, amb * (0.97 + 0.03 * day), amb * (1.02 - 0.05 * day));
    this.exposure = lerp(1.6, 1.0, day);

    // Shadow frustum centred on the focus, snapped to texels to avoid shimmer.
    if (focus) {
      const r = this.quality.shadowRadius || 300;
      const texel = (2 * r) / (this.quality.shadowSize || 2048);
      const fx = Math.round(focus.x / texel) * texel;
      const fz = Math.round(focus.z / texel) * texel;
      this.sun.target.position.set(fx, focus.y, fz);
      this.sun.position.set(fx + lightDir.x * 900, focus.y + Math.max(0.15, lightDir.y) * 900, fz + lightDir.z * 900);
      this.sun.target.updateMatrixWorld();
    }

    this.dome.position.copy(camera.position);

    // Rain around the camera.
    const R = this.rainUniforms;
    const rain = weather.rain;
    this.rain.visible = rain > 0.02;
    if (this.rain.visible) {
      const n = Math.round(this.rainMax * clamp(rain, 0, 1));
      this.rain.geometry.setDrawRange(0, n * 2);
      R.uOrigin.value.copy(camera.position);
      R.uTime.value = time;
      R.uVel.value.set(weather.windX * 0.6, -11 - rain * 3, weather.windZ * 0.6);
      R.uOpacity.value = 0.35 + rain * 0.35 + day * 0.15;
      R.uColor.value.setRGB(0.6 + day * 0.25, 0.65 + day * 0.25, 0.72 + day * 0.22);
    }
  }
}
