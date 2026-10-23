// Object shadow cascades (palms, shrubs) rendered from the key light. Terrain shadows
// come from the clipmap instead; see heightAtlas.js.
export const SHADOW_GLSL = /* glsl */ `
#ifndef SHADOW_GLSL
#define SHADOW_GLSL
#ifdef USE_OBJECT_SHADOWS
uniform highp sampler2DShadow tObjShadow0;
uniform highp sampler2DShadow tObjShadow1;
uniform mat4 uObjShadowMatrix0;
uniform mat4 uObjShadowMatrix1;
uniform vec4 uObjShadowParams; // x: enabled, y: texel (uv) cascade 0, z: cascade 1, w: depth bias

// 2x2 taps of hardware-filtered depth compares (a 3x3 tent).
float pcf4(highp sampler2DShadow tex, vec2 uv, float z, float t) {
  return 0.25 * (texture(tex, vec3(uv + vec2(-0.5, -0.5) * t, z)) +
                 texture(tex, vec3(uv + vec2(0.5, -0.5) * t, z)) +
                 texture(tex, vec3(uv + vec2(-0.5, 0.5) * t, z)) +
                 texture(tex, vec3(uv + vec2(0.5, 0.5) * t, z)));
}

// x = visibility, y = weight (0 outside the cascade, fading to 0 at its border).
vec2 objShadowCascade(highp sampler2DShadow tex, mat4 m, vec3 wp, float texel, float bias) {
  vec3 c = (m * vec4(wp, 1.0)).xyz * 0.5 + 0.5;
  vec2 e = min(c.xy, 1.0 - c.xy);
  float w = smoothstep(0.0, 0.06, min(e.x, e.y)) * step(c.z, 1.0) * step(0.0, c.z);
  if (w <= 0.0) return vec2(1.0, 0.0);
  return vec2(pcf4(tex, c.xy, c.z - bias, texel), w);
}

float objectShadow(vec3 wp) {
  if (uObjShadowParams.x < 0.5) return 1.0;
  vec2 a = objShadowCascade(tObjShadow0, uObjShadowMatrix0, wp, uObjShadowParams.y, uObjShadowParams.w);
  if (a.y >= 1.0) return a.x;
  vec2 b = objShadowCascade(tObjShadow1, uObjShadowMatrix1, wp, uObjShadowParams.z, uObjShadowParams.w * 3.0);
  float far = mix(1.0, b.x, b.y);
  return mix(far, a.x, a.y);
}
#else
float objectShadow(vec3 wp) {
  return 1.0;
}
#endif
#endif
`;
