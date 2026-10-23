import * as THREE from 'three';
import { U } from '../engine/uniforms.js';
import { getOasis, OASIS_CELL, WIND_X, WIND_Z, OASIS_STRETCH } from './heightfield.js';
import { LOGDEPTH_GLSL, CLIPMAP_GLSL, HASH_GLSL } from '../shaders/common.js';
import { ATMOSPHERE_USE_GLSL } from './atmosphere.js';
import { SHADOW_GLSL } from '../shaders/shadows.js';

// Oasis lakes: one flat water surface per nearby oasis. The terrain clips the shoreline
// naturally; the shader reads the clipmap for water depth (colour, shallows) and marches
// the reflected ray through the heightfield so the surrounding dunes appear in the water.

const RANGE = 4200;

const VERT = /* glsl */ `
${LOGDEPTH_GLSL}
uniform vec4 uWater; // centre x, centre z, radius, water level
varying vec3 vWorld;
void main() {
  vec2 perp = vec2(${WIND_Z.toFixed(8)}, ${(-WIND_X).toFixed(8)});
  vec2 wind = vec2(${WIND_X.toFixed(8)}, ${WIND_Z.toFixed(8)});
  vec2 l = position.xy * uWater.z * 2.2;
  vec2 xz = uWater.xy + perp * l.x * ${OASIS_STRETCH.toFixed(3)} + wind * l.y;
  vec3 wp = vec3(xz.x, uWater.w, xz.y);
  vWorld = wp;
  gl_Position = logDepth(projectionMatrix * viewMatrix * vec4(applyCurvature(wp), 1.0));
}
`;

const FRAG = /* glsl */ `
${HASH_GLSL}
${CLIPMAP_GLSL}
${ATMOSPHERE_USE_GLSL}
${SHADOW_GLSL}
uniform vec4 uWater;
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindSpeed;
uniform vec3 uSunDir;
varying vec3 vWorld;

vec2 waveGrad(vec2 p, float t) {
  vec2 g = vec2(0.0);
  vec2 drift = uWindDir * t;
  float e = 0.05;
  // Three octaves of wind-driven wavelets.
  for (int i = 0; i < 3; i++) {
    float s = i == 0 ? 0.9 : (i == 1 ? 2.3 : 5.1);
    float a = i == 0 ? 1.0 : (i == 1 ? 0.55 : 0.3);
    vec2 q = p * s + drift * (0.6 + 0.3 * float(i)) * s;
    float h0 = vnoise(q);
    g += a * vec2(vnoise(q + vec2(e, 0.0)) - h0, vnoise(q + vec2(0.0, e)) - h0) / e * s;
  }
  return g;
}

vec3 duneColour(vec3 hit, float footprint) {
  vec4 nd;
  float sh;
  clipSurface(hit.xz, footprint, nd, sh);
  vec3 N = normalize(vec3(-nd.x, 1.0, -nd.y));
  vec3 alb = vec3(0.62, 0.36, 0.17);
  vec3 c = alb / ATM_PI * (keyLightIrradiance() * max(dot(N, uLightDir), 0.0) * sh + skyIrradiance(N));
  return applyAerial(c, hit);
}

void main() {
  vec3 p = vWorld;
  float ground = clipHeight(p.xz);
  float depth = uWater.w - ground;
  if (depth <= 0.0) discard;
  vec3 toCam = cameraPosition - p;
  float dist = length(toCam);
  vec3 V = toCam / dist;

  float rough = clamp(0.25 + uWindSpeed * 0.035, 0.25, 0.9);
  vec2 g = waveGrad(p.xz, uTime * (0.35 + uWindSpeed * 0.05)) * 0.018 * rough;
  g *= 1.0 - smoothstep(60.0, 400.0, dist) * 0.7;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  float NdotV = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);

  // Reflection: sky, then anything in the dunes the reflected ray runs into.
  vec3 refl = skyRadiance(R);
  float t = 2.0;
  for (int i = 0; i < 22; i++) {
    vec3 q = p + R * t;
    float hq = clipHeight(q.xz);
    if (hq > q.y) {
      refl = duneColour(vec3(q.x, hq, q.z), t * 0.02);
      break;
    }
    t *= 1.32;
  }
  // Sun glint.
  vec3 H = normalize(uLightDir + V);
  float spec = pow(max(dot(N, H), 0.0), 900.0 / rough) * 60.0 / rough;
  vec3 glint = keyLightIrradiance() * spec * objectShadow(p) * clipShadow(p.xz);

  // Refraction: sandy bottom seen through water that absorbs red first.
  vec3 absorb = exp(-depth * vec3(0.55, 0.16, 0.11) * 1.3);
  vec3 bottomAlb = vec3(0.38, 0.27, 0.16);
  vec3 bottom = bottomAlb / ATM_PI * (keyLightIrradiance() * max(uLightDir.y, 0.0) * clipShadow(p.xz) + skyIrradiance(vec3(0.0, 1.0, 0.0)));
  vec3 scatter = vec3(0.012, 0.05, 0.055) * (skyIrradiance(vec3(0.0, 1.0, 0.0)) + keyLightIrradiance() * max(uLightDir.y, 0.0) * 0.3);
  vec3 under = bottom * absorb + scatter * (1.0 - absorb);

  vec3 col = mix(under, refl, F) + glint;
  // Shoreline: the last centimetres blend into wet sand.
  col = mix(bottom * 0.7, col, smoothstep(0.0, 0.08, depth));
  col = applyAerial(col, p);
  gl_FragColor = vec4(col * exposure(), 1.0);
}
`;

export class OasisManager {
  constructor(atmosphere, atlas, quality) {
    this.atmosphere = atmosphere;
    this.atlas = atlas;
    this.quality = quality;
    this.group = new THREE.Group();
    this.geometry = new THREE.CircleGeometry(1, 72);
    this.active = [];
    this.meshes = new Map();
    this.lastCell = '';
  }

  _material(o) {
    const defines = { ...this.atlas.defines };
    if (this.quality.objectShadows) defines.USE_OBJECT_SHADOWS = 1;
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines,
      side: THREE.DoubleSide,
      uniforms: {
        ...this.atmosphere.materialUniforms(),
        uLogDepthFC: U.uLogDepthFC,
        tHeight: U.tHeight,
        tNormal: U.tNormal,
        tShadow: U.tShadow,
        uClip: U.uClip,
        uAtlasInv: U.uAtlasInv,
        uWater: { value: new THREE.Vector4(o.x, o.z, o.radius, o.waterLevel) },
        uTime: U.uTime,
        uWindDir: U.uWindDir,
        uWindSpeed: U.uWindSpeed,
        uSunDir: U.uSunDir,
        tObjShadow0: U.tObjShadow0,
        tObjShadow1: U.tObjShadow1,
        uObjShadowMatrix0: U.uObjShadowMatrix0,
        uObjShadowMatrix1: U.uObjShadowMatrix1,
        uObjShadowParams: U.uObjShadowParams,
      },
    });
  }

  update(center) {
    const cx = Math.floor(center.x / OASIS_CELL);
    const cz = Math.floor(center.z / OASIS_CELL);
    const cellKey = `${cx},${cz},${Math.round(center.x / 400)},${Math.round(center.z / 400)}`;
    if (cellKey !== this.lastCell) {
      this.lastCell = cellKey;
      const found = [];
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          const o = getOasis(cx + i, cz + j);
          if (!o) continue;
          const d = Math.hypot(o.x - center.x, o.z - center.z);
          if (d < RANGE) found.push({ o, d });
        }
      }
      found.sort((a, b) => a.d - b.d);
      this.active = found.map((f) => f.o);
      const keep = new Set(this.active.map((o) => `${o.cx},${o.cz}`));
      for (const [key, mesh] of this.meshes) {
        if (!keep.has(key)) {
          this.group.remove(mesh);
          mesh.material.dispose();
          this.meshes.delete(key);
        }
      }
      for (const o of this.active) {
        const key = `${o.cx},${o.cz}`;
        if (this.meshes.has(key)) continue;
        const mesh = new THREE.Mesh(this.geometry, this._material(o));
        mesh.frustumCulled = false;
        mesh.renderOrder = 8;
        this.group.add(mesh);
        this.meshes.set(key, mesh);
      }
    }
    // Nearest four oases drive wet sand and soil in the terrain shader.
    const list = this.active.slice().sort((a, b) => Math.hypot(a.x - center.x, a.z - center.z) - Math.hypot(b.x - center.x, b.z - center.z));
    U.uOasisCount.value = Math.min(4, list.length);
    for (let i = 0; i < 4; i++) {
      const o = list[i];
      if (o) U.uOases.value[i].set(o.x, o.z, o.radius, o.waterLevel);
    }
  }
}
