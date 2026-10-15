// PS1-style material system.
// - Vertex snapping to a low-resolution screen grid (the classic "wobble")
// - Affine (non perspective-correct) texture mapping, blendable for readability
// - Per-vertex (Gouraud) dynamic point lights, baked vertex-color lighting
// - Per-pixel flashlights (spot lights) so dark interiors stay readable
// - Linear distance fog
import * as THREE from 'three';

export const MAX_POINT_LIGHTS = 8;
export const MAX_SPOT_LIGHTS = 4;

function makeArray(n, f) { const a = []; for (let i = 0; i < n; i++) a.push(f()); return a; }

// Uniforms shared by every PS1 material (by reference).
export const G = {
  uTime: { value: 0 },
  uSnapRes: { value: new THREE.Vector2(160, 120) },
  uJitter: { value: 1 },
  uAffine: { value: 0.6 },
  uFogColor: { value: new THREE.Color(0x202020) },
  uFogNear: { value: 10 },
  uFogFar: { value: 60 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
  uSunColor: { value: new THREE.Color(0, 0, 0) },
  uHemiSky: { value: new THREE.Color(0.25, 0.25, 0.28) },
  uHemiGround: { value: new THREE.Color(0.12, 0.11, 0.1) },
  uPointPos: { value: makeArray(MAX_POINT_LIGHTS, () => new THREE.Vector3(0, -9999, 0)) },
  uPointColor: { value: makeArray(MAX_POINT_LIGHTS, () => new THREE.Color(0, 0, 0)) },
  uPointRange: { value: new Float32Array(MAX_POINT_LIGHTS).fill(1) },
  uSpotPos: { value: makeArray(MAX_SPOT_LIGHTS, () => new THREE.Vector3(0, -9999, 0)) },
  uSpotDir: { value: makeArray(MAX_SPOT_LIGHTS, () => new THREE.Vector3(0, 0, -1)) },
  uSpotColor: { value: makeArray(MAX_SPOT_LIGHTS, () => new THREE.Color(0, 0, 0)) },
  // x = cos(outer), y = cos(inner), z = range
  uSpotParams: { value: makeArray(MAX_SPOT_LIGHTS, () => new THREE.Vector3(0.9, 0.97, 20)) },
};

const vertexShader = /* glsl */`
#include <common>
#include <skinning_pars_vertex>

uniform vec2 uSnapRes;
uniform float uJitter;
uniform vec3 uPointPos[${MAX_POINT_LIGHTS}];
uniform vec3 uPointColor[${MAX_POINT_LIGHTS}];
uniform float uPointRange[${MAX_POINT_LIGHTS}];
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uHemiSky;
uniform vec3 uHemiGround;
uniform vec3 uAmbient;      // per-object ambient (light probe) for dynamic objects
uniform float uBakedMix;    // 1 = use vertex color as baked lighting, 0 = use hemi + ambient
uniform vec2 uUvScroll;
uniform float uTime;

varying vec2 vUv;
varying vec3 vAffine;
varying vec3 vLight;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vViewDepth;
varying vec3 vTint;

void main() {
  #include <begin_vertex>
  vec3 objectNormal = vec3(normal);
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>

  vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
  vec3 wn = normalize(mat3(modelMatrix) * objectNormal);
  vec4 mvPos = viewMatrix * worldPos;
  vec4 clip = projectionMatrix * mvPos;

  // PS1 vertex snapping (only for vertices in front of the camera)
  if (uJitter > 0.0 && clip.w > 0.05) {
    vec2 grid = uSnapRes * uJitter;
    clip.xy = floor(clip.xy / clip.w * grid + 0.5) / grid * clip.w;
  }
  gl_Position = clip;

  vUv = uv + uUvScroll * uTime;
  vAffine = vec3(vUv * clip.w, clip.w);
  vWorldPos = worldPos.xyz;
  vWorldNormal = wn;
  vViewDepth = -mvPos.z;

  #ifdef UNLIT
    vLight = vec3(1.0);
    #ifdef USE_VCOLOR_TINT
      vTint = color;
    #else
      vTint = vec3(1.0);
    #endif
  #else
    // Baked or hemispheric ambient
    float hemi = wn.y * 0.5 + 0.5;
    vec3 amb = mix(uHemiGround, uHemiSky, hemi) + uAmbient;
    vec3 sun = uSunColor * max(dot(wn, uSunDir), 0.0);
    vec3 base;
    #ifdef USE_VCOLOR_TINT
      // vertex color is albedo tint, lighting is dynamic
      base = amb + sun;
      vTint = color;
    #else
      base = mix(amb + sun, color, uBakedMix);
      vTint = vec3(1.0);
    #endif
    // Gouraud point lights
    vec3 dyn = vec3(0.0);
    for (int i = 0; i < ${MAX_POINT_LIGHTS}; i++) {
      vec3 L = uPointPos[i] - worldPos.xyz;
      float d = length(L);
      float att = clamp(1.0 - d / uPointRange[i], 0.0, 1.0);
      att *= att;
      float ndl = max(dot(wn, L / max(d, 0.001)) * 0.75 + 0.25, 0.0);
      dyn += uPointColor[i] * att * ndl;
    }
    vLight = base + dyn;
  #endif
}
`;

const fragmentShader = /* glsl */`
uniform sampler2D map;
uniform vec3 uColor;
uniform vec3 uEmissive;
uniform float uOpacity;
uniform float uAffine;
uniform float uAlphaTest;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uSpotPos[${MAX_SPOT_LIGHTS}];
uniform vec3 uSpotDir[${MAX_SPOT_LIGHTS}];
uniform vec3 uSpotColor[${MAX_SPOT_LIGHTS}];
uniform vec3 uSpotParams[${MAX_SPOT_LIGHTS}];
uniform float uFlash;       // hit flash / highlight
uniform vec3 uFlashColor;
uniform float uFogScale;

varying vec2 vUv;
varying vec3 vAffine;
varying vec3 vLight;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vViewDepth;
varying vec3 vTint;

void main() {
  vec2 uvA = vAffine.xy / vAffine.z;
  vec2 uv = mix(vUv, uvA, uAffine);
  #ifdef USE_MAP
    vec4 tex = texture2D(map, uv);
  #else
    vec4 tex = vec4(1.0);
  #endif
  float alpha = tex.a * uOpacity;
  #ifdef USE_ALPHATEST
    if (alpha < uAlphaTest) discard;
  #endif
  vec3 albedo = tex.rgb * uColor * vTint;
  vec3 light = vLight;
  #ifndef UNLIT
    vec3 n = normalize(vWorldNormal);
    for (int i = 0; i < ${MAX_SPOT_LIGHTS}; i++) {
      vec3 L = uSpotPos[i] - vWorldPos;
      float d = length(L);
      vec3 l = L / max(d, 0.001);
      float cosA = dot(-l, uSpotDir[i]);
      float cone = smoothstep(uSpotParams[i].x, uSpotParams[i].y, cosA);
      float att = clamp(1.0 - d / uSpotParams[i].z, 0.0, 1.0);
      float ndl = max(dot(n, l), 0.0) * 0.8 + 0.2;
      light += uSpotColor[i] * cone * att * ndl;
    }
  #endif
  vec3 col = albedo * light + uEmissive * tex.rgb;
  col = mix(col, uFlashColor, uFlash);
  #ifndef NO_FOG
    float f = smoothstep(uFogNear, uFogFar, vViewDepth) * uFogScale;
    col = mix(col, uFogColor, f);
  #endif
  gl_FragColor = vec4(col, alpha);
}
`;

/**
 * Create a PS1 material.
 * opts: map, color, emissive, transparent, opacity, alphaTest, side, unlit, baked (vertex colors are light),
 *       tint (vertex colors are albedo tint), fog (default true), uvScroll [x,y], depthWrite, blending
 */
export function createPS1Material(opts = {}) {
  const defines = {};
  if (opts.map) defines.USE_MAP = '';
  if (opts.unlit) defines.UNLIT = '';
  if (opts.tint) defines.USE_VCOLOR_TINT = '';
  if (opts.fog === false) defines.NO_FOG = '';
  if (opts.alphaTest) defines.USE_ALPHATEST = '';
  const uniforms = {
    ...G,
    map: { value: opts.map || null },
    uColor: { value: new THREE.Color(opts.color !== undefined ? opts.color : 0xffffff) },
    uEmissive: { value: new THREE.Color(opts.emissive !== undefined ? opts.emissive : 0x000000) },
    uOpacity: { value: opts.opacity !== undefined ? opts.opacity : 1 },
    uAlphaTest: { value: opts.alphaTest || 0 },
    uAmbient: { value: new THREE.Color(0, 0, 0) },
    uBakedMix: { value: opts.baked ? 1 : 0 },
    uUvScroll: { value: new THREE.Vector2(...(opts.uvScroll || [0, 0])) },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uFogScale: { value: opts.fogScale !== undefined ? opts.fogScale : 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    defines,
    vertexShader,
    fragmentShader,
    transparent: !!opts.transparent,
    side: opts.side !== undefined ? opts.side : THREE.FrontSide,
    depthWrite: opts.depthWrite !== undefined ? opts.depthWrite : !opts.transparent,
    depthTest: opts.depthTest !== undefined ? opts.depthTest : true,
    blending: opts.blending !== undefined ? opts.blending : THREE.NormalBlending,
  });
  mat.vertexColors = true; // our shader always declares 'color'; geometries must provide it
  mat.isPS1 = true;
  return mat;
}

/** Ensure geometry has a color attribute (white) so the shared shader works. */
export function ensureColor(geo, r = 1, g = 1, b = 1) {
  if (!geo.getAttribute('color')) {
    const n = geo.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = r; arr[i * 3 + 1] = g; arr[i * 3 + 2] = b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return geo;
}

/** Clone a PS1 material keeping the global (shared) uniforms linked. */
export function clonePS1(m) {
  const c = m.clone();
  for (const k in G) if (c.uniforms[k]) c.uniforms[k] = G[k];
  c.isPS1 = true;
  return c;
}
