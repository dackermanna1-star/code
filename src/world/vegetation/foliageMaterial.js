import * as THREE from 'three';
import { U } from '../../engine/uniforms.js';
import { LOGDEPTH_GLSL, CLIPMAP_GLSL, HASH_GLSL } from '../../shaders/common.js';
import { ATMOSPHERE_USE_GLSL } from '../atmosphere.js';
import { SHADOW_GLSL } from '../../shaders/shadows.js';

// Instanced vegetation. Per instance: aOffset = (x, y, z, yaw), aParams = (scale, tint,
// phase, height above ground scale). Vertex wind: the whole plant leans with gusts and
// leaves flutter with their sway weight.

const WIND_GLSL = /* glsl */ `
attribute vec4 aOffset;
attribute vec4 aParams;
attribute float aKind;
attribute float aSway;
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindSpeed;
uniform float uGust;
uniform float uStiffness;

vec3 plantPosition(out vec3 nrm) {
  float s = aParams.x;
  float c = cos(aOffset.w);
  float sn = sin(aOffset.w);
  vec3 p = position * s;
  p = vec3(c * p.x - sn * p.z, p.y, sn * p.x + c * p.z);
  nrm = vec3(c * normal.x - sn * normal.z, normal.y, sn * normal.x + c * normal.z);
  float w = uWindSpeed * (0.75 + 0.5 * uGust) / uStiffness;
  float ph = aParams.z * 6.2831 + dot(aOffset.xz, vec2(0.071, 0.057));
  float hgt = max(p.y, 0.0);
  // Slow lean of the whole plant, growing with height squared.
  float lean = (0.65 + 0.35 * sin(uTime * 0.9 + ph)) * w * 0.0011 * hgt * hgt / max(s, 0.3);
  // Fluttering leaves.
  float f = aSway * w * 0.012;
  vec3 flutter = vec3(sin(uTime * 6.1 + ph + p.y * 1.7), sin(uTime * 8.3 + ph * 1.7 + p.x) * 0.7, cos(uTime * 5.3 + ph + p.z * 1.3)) * f;
  p.xz += uWindDir * (lean + aSway * w * 0.025 * (0.6 + 0.4 * sin(uTime * 1.6 + ph)));
  p += flutter;
  return aOffset.xyz + p;
}
`;

const VERT = /* glsl */ `
${LOGDEPTH_GLSL}
${WIND_GLSL}
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vKind;
varying float vSway;
varying vec4 vParams;
varying float vBaseY;
void main() {
  vec3 n;
  vec3 wp = plantPosition(n);
  vBaseY = aOffset.y;
  vWorld = wp;
  vNormal = n;
  vUv = uv;
  vKind = aKind;
  vSway = aSway;
  vParams = aParams;
  gl_Position = logDepth(projectionMatrix * viewMatrix * vec4(applyCurvature(wp), 1.0));
}
`;

const FRAG = /* glsl */ `
${HASH_GLSL}
${CLIPMAP_GLSL}
${ATMOSPHERE_USE_GLSL}
${SHADOW_GLSL}
uniform sampler2D tMap;
uniform vec2 uMapSize;
uniform vec3 uLeafTint;
uniform vec3 uDeadTint;
uniform float uTranslucency;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vKind;
varying float vSway;
varying vec4 vParams;
varying float vBaseY;

vec3 toLinear(vec3 c) {
  return pow(c, vec3(2.2));
}

// Date-palm bark: a lattice of old leaf bases spiralling up the trunk.
vec3 bark(vec2 uv, out float rough) {
  vec2 p = vec2(uv.x * 9.0, uv.y * 3.1);
  vec2 q = vec2(p.x + p.y * 0.5, p.x - p.y * 0.5);
  vec2 cell = floor(q);
  vec2 f = fract(q) - 0.5;
  float edge = smoothstep(0.32, 0.5, max(abs(f.x), abs(f.y)));
  float h = hash12(cell);
  vec3 c = mix(vec3(0.19, 0.14, 0.095), vec3(0.3, 0.24, 0.16), h);
  c *= 1.0 - 0.55 * edge;
  rough = edge;
  return c;
}

void main() {
  vec3 albedo;
  float ao = 1.0;
  if (vKind < 0.5) {
    float e;
    albedo = bark(vUv, e);
    ao = mix(0.55, 1.0, smoothstep(0.0, 1.5, vUv.y)) * (1.0 - 0.3 * e);
  } else {
    vec4 tex = texture2D(tMap, vUv);
    // Thin leaves average away in the mip chain; boost alpha with the mip level so
    // distant fronds keep their coverage, then sharpen the edge to a crisp cutout.
    vec2 tc = vUv * uMapSize;
    vec2 dx = dFdx(tc);
    vec2 dy = dFdy(tc);
    float lod = 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1e-8));
    float cov = tex.a * (1.0 + max(lod, 0.0) * 0.32);
    float a = (cov - 0.5) / max(fwidth(cov), 1e-4) + 0.5;
    if (a < 0.5) discard;
    albedo = toLinear(tex.rgb);
    if (vKind > 1.5 && vKind < 2.5) albedo = mix(albedo, uDeadTint * (0.7 + 0.6 * hash12(vec2(vParams.z * 91.0, 3.0))), 0.85);
    else albedo *= uLeafTint * (0.85 + 0.3 * vParams.y);
    ao = mix(0.45, 1.0, vSway);
  }
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing && vKind > 0.5) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = uLightDir;
  float ndl = dot(N, L);
  float diff = vKind < 0.5 ? max(ndl, 0.0) : max((ndl + 0.35) / 1.35, 0.0);
  // Light through thin leaves when looking toward the sun.
  float trans = (vKind > 0.5 && vKind < 1.5) || vKind > 2.5 ? uTranslucency * pow(max(dot(-V, L), 0.0), 3.0) : 0.0;
  // Terrain shadow at the plant base, fading with height (crowns poke out of dune shadow).
  float hAbove = max(vWorld.y - vBaseY, 0.0);
  float tShadow = mix(clipShadow(vWorld.xz), 1.0, smoothstep(2.0, 18.0, hAbove) * 0.6);
  float vis = tShadow * objectShadow(vWorld);
  vec3 E = keyLightIrradiance();
  vec3 col = albedo / ATM_PI * (E * (diff * vis) + skyIrradiance(N) * ao);
  col += albedo * vec3(0.9, 1.0, 0.55) * E * trans * vis * 0.35;
  col = applyAerial(col, vWorld);
  gl_FragColor = vec4(col * exposure(), 1.0);
}
`;

const DEPTH_VERT = /* glsl */ `
${WIND_GLSL}
varying vec2 vUv;
varying float vKind;
void main() {
  vec3 n;
  vec3 wp = plantPosition(n);
  vUv = uv;
  vKind = aKind;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const DEPTH_FRAG = /* glsl */ `
uniform sampler2D tMap;
uniform vec2 uMapSize;
varying vec2 vUv;
varying float vKind;
void main() {
  if (vKind > 0.5) {
    vec2 tc = vUv * uMapSize;
    vec2 dx = dFdx(tc);
    vec2 dy = dFdy(tc);
    float lod = 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1e-8));
    if (texture2D(tMap, vUv).a * (1.0 + max(lod, 0.0) * 0.32) < 0.5) discard;
  }
  gl_FragColor = vec4(1.0);
}
`;

function windUniforms(stiffness) {
  return {
    uTime: U.uTime,
    uWindDir: U.uWindDir,
    uWindSpeed: U.uWindSpeed,
    uGust: U.uGust,
    uStiffness: { value: stiffness },
  };
}

export function createFoliageMaterial(atmosphere, atlas, { map, leafTint = [1, 1, 1], deadTint = [0.55, 0.42, 0.26], translucency = 1, stiffness = 1, objectShadows = false, alphaToCoverage = false }) {
  const defines = { ...atlas.defines };
  if (objectShadows) defines.USE_OBJECT_SHADOWS = 1;
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines,
    side: THREE.DoubleSide,
    alphaToCoverage,
    uniforms: {
      ...atmosphere.materialUniforms(),
      ...windUniforms(stiffness),
      uLogDepthFC: U.uLogDepthFC,
      tHeight: U.tHeight,
      tNormal: U.tNormal,
      tShadow: U.tShadow,
      uClip: U.uClip,
      uAtlasInv: U.uAtlasInv,
      tMap: { value: map },
      uMapSize: { value: new THREE.Vector2(map.image.width, map.image.height) },
      uLeafTint: { value: new THREE.Vector3(...leafTint) },
      uDeadTint: { value: new THREE.Vector3(...deadTint) },
      uTranslucency: { value: translucency },
      tObjShadow0: U.tObjShadow0,
      tObjShadow1: U.tObjShadow1,
      uObjShadowMatrix0: U.uObjShadowMatrix0,
      uObjShadowMatrix1: U.uObjShadowMatrix1,
      uObjShadowParams: U.uObjShadowParams,
    },
  });
}

export function createFoliageDepthMaterial({ map, stiffness = 1 }) {
  return new THREE.ShaderMaterial({
    vertexShader: DEPTH_VERT,
    fragmentShader: DEPTH_FRAG,
    side: THREE.DoubleSide,
    uniforms: { ...windUniforms(stiffness), tMap: { value: map }, uMapSize: { value: new THREE.Vector2(map.image.width, map.image.height) } },
  });
}
