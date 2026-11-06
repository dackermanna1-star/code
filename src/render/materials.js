// Shared lighting model for voxels and entities.
// All materials read the same global uniforms (sun/moon, ambient, fog, flashlight, dynamic point lights)
// so everything in the scene is lit consistently. Entities get their voxel light level
// (sky / block light sampled at their position) through setEntityLight().
import * as THREE from 'three';

export const MAX_POINT_LIGHTS = 8;

/** Global uniforms – mutated every frame by the renderer / sky system. */
export const globalUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
  uSunColor: { value: new THREE.Color(1.0, 0.95, 0.85) },
  uAmbientColor: { value: new THREE.Color(0.55, 0.6, 0.7) },
  uBlockLightColor: { value: new THREE.Color(1.0, 0.68, 0.38) },
  uMinLight: { value: 0.015 },
  uFogColor: { value: new THREE.Color(0.6, 0.65, 0.7) },
  uFogDensity: { value: 0.012 },
  uCamPos: { value: new THREE.Vector3() },
  uFlashOn: { value: 0 },
  uFlashPos: { value: new THREE.Vector3() },
  uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
  uFlashRange: { value: 28 },
  uFlashCone: { value: new THREE.Vector2(Math.cos(0.42), Math.cos(0.16)) },
  uFlashIntensity: { value: 2.2 },
  uPL: { value: Array.from({ length: MAX_POINT_LIGHTS }, () => new THREE.Vector4(0, -999, 0, 1)) },
  uPLC: { value: Array.from({ length: MAX_POINT_LIGHTS }, () => new THREE.Vector3()) },
  uPLCount: { value: 0 },
  uWind: { value: 0.3 },
  uWetness: { value: 0 },
  uLightning: { value: 0 },
  uShadowMap: { value: null },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowOn: { value: 0 },
  uShadowTexel: { value: 1 / 2048 },
};

export const LIGHTING_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbientColor;
uniform vec3 uBlockLightColor;
uniform float uMinLight;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCamPos;
uniform float uFlashOn;
uniform vec3 uFlashPos;
uniform vec3 uFlashDir;
uniform float uFlashRange;
uniform vec2 uFlashCone;
uniform float uFlashIntensity;
uniform vec4 uPL[${MAX_POINT_LIGHTS}];
uniform vec3 uPLC[${MAX_POINT_LIGHTS}];
uniform int uPLCount;
uniform float uWetness;
uniform float uLightning;
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowOn;
uniform float uShadowTexel;

float sampleShadow(vec3 wp, vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 sc = uShadowMatrix * vec4(wp + n * 0.08, 1.0);
  vec3 p = sc.xyz / sc.w * 0.5 + 0.5;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  float bias = 0.0009;
  float s = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
    float d = texture(uShadowMap, p.xy + vec2(float(x), float(y)) * uShadowTexel).r;
    s += p.z - bias > d ? 0.0 : 1.0;
  }
  s /= 9.0;
  vec2 e = smoothstep(0.0, 0.06, p.xy) * smoothstep(1.0, 0.94, p.xy);
  return mix(1.0, s, e.x * e.y);
}

vec3 computeLighting(vec3 wp, vec3 n, float sky, float blk, float ao) {
  float skyF = sky * sky * (0.35 + 0.65 * sky);
  float ndl = max(dot(n, uSunDir), 0.0);
  float outdoors = smoothstep(0.55, 0.95, sky);
  float shadow = ndl > 0.0 && outdoors > 0.0 ? sampleShadow(wp, n) : 1.0;
  vec3 direct = uSunColor * ndl * outdoors * shadow;
  float hemi = 0.55 + 0.45 * n.y;
  vec3 amb = uAmbientColor * hemi * skyF;
  amb += vec3(0.75, 0.8, 1.0) * uLightning * skyF * 2.5;
  float flick = 1.0 + 0.06 * sin(uTime * 13.0 + wp.x * 1.7) * sin(uTime * 7.3 + wp.z * 2.1);
  vec3 bl = uBlockLightColor * pow(blk, 2.0) * 1.35 * flick;
  vec3 lit = (amb + direct) * ao + bl * mix(1.0, ao, 0.6) + vec3(uMinLight) * ao;

  // flashlight (originates at the camera, so every visible surface is directly lit: no shadows needed)
  if (uFlashOn > 0.0) {
    vec3 L = uFlashPos - wp;
    float d = length(L);
    L /= max(d, 0.0001);
    float cosA = dot(-L, uFlashDir);
    float spot = smoothstep(uFlashCone.x, uFlashCone.y, cosA);
    float spill = smoothstep(uFlashCone.x - 0.25, uFlashCone.x, cosA) * 0.12;
    float att = clamp(1.0 - d / uFlashRange, 0.0, 1.0);
    att = att * att;
    float fl = max(dot(n, L), 0.0) * 0.75 + 0.25;
    lit += vec3(1.0, 0.94, 0.82) * uFlashIntensity * uFlashOn * (spot + spill) * att * fl;
  }
  for (int i = 0; i < ${MAX_POINT_LIGHTS}; i++) {
    if (i >= uPLCount) break;
    vec3 L = uPL[i].xyz - wp;
    float d = length(L);
    float att = clamp(1.0 - d / uPL[i].w, 0.0, 1.0);
    att *= att;
    float fl = max(dot(n, L / max(d, 0.0001)), 0.0) * 0.7 + 0.3;
    lit += uPLC[i] * att * fl;
  }
  return lit;
}

vec3 applyFog(vec3 col, vec3 wp) {
  float d = length(wp - uCamPos);
  float f = 1.0 - exp(-pow(d * uFogDensity, 1.7));
  return mix(col, uFogColor, clamp(f, 0.0, 1.0));
}
`;

// ---------------------------------------------------------------------------
// Entity material (zombies, cars, corpses, items, viewmodel)
const ENTITY_VERT = /* glsl */ `
out vec2 vUv;
out vec3 vWorldPos;
out vec3 vNormal;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ENTITY_FRAG = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
uniform sampler2D map;
uniform vec3 uColor;
uniform vec2 uEntityLight; // sky, block (0..1)
uniform vec4 uTint;        // rgb, amount (hit flash, burning)
uniform float uOpacity;
uniform float uAlphaTest;
uniform float uUseMap;
uniform float uNoFog;
uniform float uEmissive;
in vec2 vUv;
in vec3 vWorldPos;
in vec3 vNormal;
out vec4 fragColor;
void main() {
  vec4 tex = uUseMap > 0.5 ? texture(map, vUv) : vec4(1.0);
  if (tex.a < uAlphaTest) discard;
  vec3 albedo = tex.rgb * uColor;
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 lit = computeLighting(vWorldPos, n, uEntityLight.x, uEntityLight.y, 1.0);
  vec3 col = albedo * lit + albedo * uEmissive;
  col = mix(col, uTint.rgb, uTint.a);
  if (uNoFog < 0.5) col = applyFog(col, vWorldPos);
  fragColor = vec4(col, tex.a * uOpacity);
}
`;

/**
 * Create a material for an entity. Lighting comes from global uniforms; call setEntityLight() every frame
 * (or when the entity moves) with the voxel light at its position.
 * opts: {map?: THREE.Texture, color?: number|THREE.Color, transparent?, alphaTest?, side?, noFog?, emissive?, depthWrite?}
 */
export function createEntityMaterial(opts = {}) {
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: ENTITY_VERT,
    fragmentShader: ENTITY_FRAG,
    uniforms: {
      ...globalUniforms,
      map: { value: opts.map || null },
      uUseMap: { value: opts.map ? 1 : 0 },
      uColor: { value: new THREE.Color(opts.color ?? 0xffffff) },
      uEntityLight: { value: new THREE.Vector2(1, 0) },
      uTint: { value: new THREE.Vector4(1, 0, 0, 0) },
      uOpacity: { value: opts.opacity ?? 1 },
      uAlphaTest: { value: opts.alphaTest ?? (opts.transparent ? 0.01 : 0.5) },
      uNoFog: { value: opts.noFog ? 1 : 0 },
      uEmissive: { value: opts.emissive ?? 0 },
    },
    transparent: !!opts.transparent,
    side: opts.side ?? THREE.FrontSide,
    depthWrite: opts.depthWrite ?? true,
  });
  mat.isEntityMaterial = true;
  return mat;
}

/** Update the voxel light level an entity material uses (sky, block in 0..1). */
export function setEntityLight(mat, sky, block) {
  if (mat && mat.uniforms && mat.uniforms.uEntityLight) mat.uniforms.uEntityLight.value.set(sky, block);
}
/** Tint (hit flash etc.): color hex/Color, amount 0..1 */
export function setEntityTint(mat, color, amount) {
  if (!mat || !mat.uniforms || !mat.uniforms.uTint) return;
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  mat.uniforms.uTint.value.set(c.r, c.g, c.b, amount);
}
export function setEntityOpacity(mat, o) {
  if (mat && mat.uniforms && mat.uniforms.uOpacity) {
    mat.uniforms.uOpacity.value = o;
    mat.transparent = o < 1;
  }
}
/** Set the texture of an entity material */
export function setEntityMap(mat, map) {
  mat.uniforms.map.value = map;
  mat.uniforms.uUseMap.value = map ? 1 : 0;
}
