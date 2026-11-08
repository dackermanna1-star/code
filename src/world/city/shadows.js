// =============================================================================
// Projected sun shadows for the city (the engine's shadow map only covers
// ~±40 m around the aircraft). Every caster vertex is projected along the sun
// direction onto the horizontal plane of its own building base, and the
// flattened polygons multiply the frame (dst * shadowColour).
//
//  * buildings / houses: only sun-facing faces are kept (flat-shaded convex
//    parts), so each shadowed ground point is covered once.
//  * trees (smooth, closed, ~convex): all faces kept -> every point is covered
//    exactly twice, so they use the square root of the shadow factor.
//  * The shadow draws after the terrain (renderOrder 60), writes depth and uses
//    a strict depth test, so overlapping shadows of different objects at the
//    same ground plane do not darken twice.
//  * Shadow strength follows the ratio of direct sun to sky light on the ground
//    (fades out at dusk and with distance / haze).
// =============================================================================
import * as THREE from 'three';
import { CITY_U, CURVE_GLSL } from './materials.js';

export const SHADOW_U = {
  uSunL: { value: new THREE.Vector3(0, 1, 0) },        // WORLD direction towards the sun (y clamped)
  uShadowMul: { value: new THREE.Vector3(1, 1, 1) },   // colour multiplier inside shadows
};

const COMMON = /* glsl */`
${CURVE_GLSL}
uniform vec3 uSunL;
uniform vec3 uShadowMul;
uniform float uFogD;
varying vec3 vMul;
vec4 shadowProject(vec3 p, float ground, float keep, float sqrtMode) {
  float h = max(p.y - ground, 0.0);
  p.xz -= uSunL.xz / uSunL.y * h;
  p.y = ground;
  vec4 w = modelMatrix * vec4(p, 1.0);
  float d = length(w.xyz - uCamPos);
  w.xyz += uUp * (0.4 + d * 0.00034);
  vec4 mv = viewMatrix * cityCurve(w);
  float fade = exp(-uFogD * uFogD * d * d) * (1.0 - smoothstep(6000.0, 12000.0, d));
  vec3 m = mix(vec3(1.0), uShadowMul, fade);
  vMul = sqrtMode > 0.5 ? sqrt(m) : m;
  if (keep < 0.5) return vec4(2.0, 2.0, 2.0, 1.0);
  return projectionMatrix * mv;
}
`;

const FRAG = /* glsl */`
varying vec3 vMul;
void main() { gl_FragColor = vec4(vMul, 1.0); }
`;

function mat(name, vertexShader) {
  const m = new THREE.ShaderMaterial({
    name,
    uniforms: { ...CITY_U, ...SHADOW_U },
    vertexShader,
    fragmentShader: FRAG,
    depthWrite: true,
    depthTest: true,
    depthFunc: THREE.LessDepth,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.ZeroFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  return m;
}

/** Shadow material for merged GeoBuilder meshes (attribute aGround, NO_SHADOW = skip). */
export function createMergedShadowMaterial() {
  return mat('city.shadow.merged', /* glsl */`
${COMMON}
attribute float aGround;
void main() {
  float keep = (aGround > -90000.0 && dot(normal, uSunL) > 0.0) ? 1.0 : 0.0;
  gl_Position = shadowProject(position, aGround + 0.05, keep, 0.0);
}`);
}

/** Shadow material for the custom-instanced box buildings (houses, barns, boats). */
export function createHouseShadowMaterial() {
  return mat('city.shadow.houses', /* glsl */`
${COMMON}
attribute vec4 iPos;
attribute vec4 iSize;
attribute vec3 aOver;
attribute float aPart;
void main() {
  float cR = cos(iPos.w), sR = sin(iPos.w);
  mat3 cRot = mat3(cR, 0.0, -sR, 0.0, 1.0, 0.0, sR, 0.0, cR);
  float isRoof = step(0.5, aPart);
  vec3 cSc = vec3(iSize.x, mix(iSize.y, max(iSize.w, 0.05), isRoof), iSize.z);
  vec3 n = cRot * normalize(normal / cSc);
  vec3 lp = vec3(position.x * iSize.x, min(position.y, 1.0) * iSize.y + max(position.y - 1.0, 0.0) * iSize.w, position.z * iSize.z);
  lp += aOver * vec3(0.45, 0.45 * iSize.w / max(iSize.z * 0.5, 0.5), 0.45);
  vec3 p = cRot * lp + iPos.xyz;
  float keep = (dot(n, uSunL) > 0.0 && iSize.y > 1.5) ? 1.0 : 0.0;
  gl_Position = shadowProject(p, iPos.y + 0.65, keep, 0.0);
}`);
}

/** Shadow material for instanced trees (all faces, square-root factor). */
export function createTreeShadowMaterial() {
  return mat('city.shadow.trees', /* glsl */`
${COMMON}
attribute vec4 iPos;
attribute vec4 iCol;
void main() {
  float tA = fract(iPos.x * 0.0137 + iPos.z * 0.0291) * 6.2831;
  float tC = cos(tA), tS = sin(tA);
  mat3 tRot = mat3(tC, 0.0, -tS, 0.0, 1.0, 0.0, tS, 0.0, tC);
  vec3 p = tRot * (position * vec3(1.0, iCol.w, 1.0)) * iPos.w + iPos.xyz;
  gl_Position = shadowProject(p, iPos.y + 0.35, 1.0, 1.0);
}`);
}

/** Clone a caster mesh (sharing its geometry) as a shadow mesh. */
export function shadowMesh(src, material, name) {
  if (!src) return null;
  const m = new THREE.Mesh(src.geometry, material);
  m.name = name;
  m.matrixAutoUpdate = false;
  m.frustumCulled = false;          // shadows extend beyond the caster bounds at low sun
  m.renderOrder = 60;
  m.userData.isShadow = true;
  return m;
}
