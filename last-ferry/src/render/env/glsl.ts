// Shared GLSL for the environment shaders: noise, and the sky colour function
// used by the backdrop sky, the backdrop sea (mirrored), the main sea and the
// environment map. All colours linear, pre-tone-mapping.
import * as THREE from 'three';

/** Hash, value noise (with derivatives) and fbm (2D). */
export const NOISE_GLSL = /* glsl */ `
#ifndef ENV_NOISE_GLSL
#define ENV_NOISE_GLSL
float envHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 envHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float envNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = envHash12(i);
  float b = envHash12(i + vec2(1.0, 0.0));
  float c = envHash12(i + vec2(0.0, 1.0));
  float d = envHash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// Value noise with analytic derivatives: (value, d/dx, d/dy).
vec3 envNoiseD(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f * (1.0 - f);
  float a = envHash12(i);
  float b = envHash12(i + vec2(1.0, 0.0));
  float c = envHash12(i + vec2(0.0, 1.0));
  float d = envHash12(i + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du.x * (k1 + k4 * u.y), du.y * (k2 + k4 * u.x));
}
const mat2 ENV_ROT = mat2(0.8, 0.6, -0.6, 0.8);
float envFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * envNoise(p);
    p = ENV_ROT * p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
float envFbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * envNoise(p);
    p = ENV_ROT * p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
#endif
`;

/**
 * Sky uniforms shared (same objects) by every material that shows or
 * reflects the sky. Updated from the time-of-day palette.
 */
export interface SkyUniforms {
  uZenith: { value: THREE.Vector3 };
  uUpper: { value: THREE.Vector3 };
  uLower: { value: THREE.Vector3 };
  uHorizon: { value: THREE.Vector3 };
  uSunGlow: { value: THREE.Vector3 };
  uSunGlowWidth: { value: number };
  uSunDisc: { value: THREE.Vector3 };
  /** Unit direction to the sun / moon (backdrop frame: -z forward). */
  uSunDir: { value: THREE.Vector3 };
  uMoonDir: { value: THREE.Vector3 };
  uMoon: { value: number };
  uStars: { value: number };
  uCloudLit: { value: THREE.Vector3 };
  uCloudDark: { value: THREE.Vector3 };
  uCloudCover: { value: number };
  uTownGlow: { value: THREE.Vector3 };
  uHaze: { value: THREE.Vector3 };
  /** tan(elevation) of the top of the visible sky band (matte stretch). */
  uBandTop: { value: number };
  uTime: { value: number };
}

export function createSkyUniforms(): SkyUniforms {
  const v = () => ({ value: new THREE.Vector3() });
  return {
    uZenith: v(),
    uUpper: v(),
    uLower: v(),
    uHorizon: v(),
    uSunGlow: v(),
    uSunGlowWidth: { value: 0.5 },
    uSunDisc: v(),
    uSunDir: { value: new THREE.Vector3(0, 0.05, -1).normalize() },
    uMoonDir: { value: new THREE.Vector3(0.3, 0.06, -1).normalize() },
    uMoon: { value: 0 },
    uStars: { value: 0 },
    uCloudLit: v(),
    uCloudDark: v(),
    uCloudCover: { value: 0.5 },
    uTownGlow: v(),
    uHaze: v(),
    uBandTop: { value: 0.1 },
    uTime: { value: 0 },
  };
}

/** Uniform declarations for SKY_FN_GLSL. */
export const SKY_PARS_GLSL = /* glsl */ `
uniform vec3 uZenith, uUpper, uLower, uHorizon, uSunGlow, uSunDisc, uSunDir, uMoonDir;
uniform vec3 uCloudLit, uCloudDark, uTownGlow, uHaze;
uniform float uSunGlowWidth, uMoon, uStars, uCloudCover, uBandTop, uTime;
`;

/**
 * skyGradient(d, s): sky colour without clouds/sun disc for unit direction d and
 * a 0..1 "height" s (0 = horizon, 1 = top of band / zenith).
 * skyPhysical(d): reflections and the env map (s from the true elevation).
 * skyBand(d): the matte-painted backdrop band (s stretched to the band).
 * Azimuth 0 = -z, positive towards +x.
 */
export const SKY_FN_GLSL = /* glsl */ `
float skyAz(vec3 d) { return atan(d.x, -d.z); }
vec3 skyGradient(vec3 d, float s) {
  float az = skyAz(d);
  float sunAz = skyAz(uSunDir);
  float dAz = az - sunAz;
  vec3 c = mix(uHorizon, uLower, smoothstep(0.0, 0.32, s));
  c = mix(c, uUpper, smoothstep(0.22, 0.75, s));
  c = mix(c, uZenith, smoothstep(0.7, 1.0, s));
  // Warm glow around the sun's azimuth, strongest at the horizon.
  float w2 = uSunGlowWidth * uSunGlowWidth;
  float g = exp(-dAz * dAz / w2) * exp(-s * 3.5);
  float g2 = exp(-dAz * dAz / (w2 * 9.0)) * exp(-s * 1.8);
  c = mix(c, uSunGlow, clamp(g * 0.8, 0.0, 1.0));
  c += uSunGlow * g2 * 0.12;
  // Burning town on the left horizon.
  float ta = az + 0.33;
  float town = exp(-ta * ta / 0.03) * exp(-s * 5.0);
  c += uTownGlow * town * 0.45;
  return c;
}
vec3 skyPhysical(vec3 d) {
  float el = asin(clamp(d.y, -1.0, 1.0));
  float s = clamp(el / 1.5708, 0.0, 1.0);
  s = pow(s, 0.6);
  return skyGradient(d, s);
}
float skyBandS(vec3 d) {
  float t = d.y / max(length(d.xz), 1e-4);
  return clamp(t / uBandTop, 0.0, 1.3);
}
vec3 skyBand(vec3 d) {
  return skyGradient(d, skyBandS(d) * 0.82);
}
`;

/**
 * lights_fragment_begin with the directional lights' specular scaled by
 * `uniformName` (diffuse untouched): the key light's gameplay elevation would
 * otherwise put mirror glints on water and wet planks everywhere.
 */
export function dirSpecularScaledLightsChunk(uniformName: string, maxSpec?: number, pointMaxSpec?: number): string {
  let chunk = THREE.ShaderChunk.lights_fragment_begin;
  const call = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  // Replace the RE_Direct call of one light loop (loops are unrolled without braces: wrap ours).
  const patch = (marker: string, scale: string | null, cap: number | undefined): void => {
    const start = chunk.indexOf(marker);
    const at = chunk.indexOf(call, start);
    if (start < 0 || at < 0) return;
    let delta = '(reflectedLight.directSpecular - lfSpecBefore)';
    if (scale) delta = `${delta} * ${scale}`;
    // Optionally cap what one light adds (a GGX peak on rippled water is ~1000×: blooms to white).
    if (cap !== undefined) delta = `min(${delta}, vec3(${cap.toFixed(3)}))`;
    const patched = `{ vec3 lfSpecBefore = reflectedLight.directSpecular;\n\t\t${call}\n\t\treflectedLight.directSpecular = lfSpecBefore + ${delta}; }`;
    chunk = chunk.slice(0, at) + patched + chunk.slice(at + call.length);
  };
  patch('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )', uniformName, maxSpec);
  if (pointMaxSpec !== undefined) patch('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )', null, pointMaxSpec);
  return chunk;
}

/** Vector3 from an [r,g,b] palette entry. */
export function v3(out: THREE.Vector3, c: readonly number[], k = 1): THREE.Vector3 {
  return out.set(c[0] * k, c[1] * k, c[2] * k);
}
