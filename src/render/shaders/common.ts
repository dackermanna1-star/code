/** Shared GLSL ES 3.00 snippets. */

export const GLSL_COMMON = /* glsl */ `
#define PI 3.14159265359
#define SUN_ILLUMINANCE 20.0
#define MOON_ILLUMINANCE 0.08
#define EMISSIVE_SCALE 8.0
#define BLOCK_LIGHT_INTENSITY 5.0

float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec3 saturate3(vec3 x) { return clamp(x, 0.0, 1.0); }
float luminance(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 linearToSrgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float pow2(float x) { return x * x; }
float pow5(float x) { float x2 = x * x; return x2 * x2 * x; }

// Interleaved gradient noise (Jimenez)
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float ignT(vec2 p, float frame) { return ign(p + 5.588238 * mod(frame, 64.0)); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = hash13(i), b = hash13(i + vec3(1, 0, 0)), c = hash13(i + vec3(0, 1, 0)), d = hash13(i + vec3(1, 1, 0));
  float e = hash13(i + vec3(0, 0, 1)), f2 = hash13(i + vec3(1, 0, 1)), g = hash13(i + vec3(0, 1, 1)), h = hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f2, u.x), mix(g, h, u.x), u.y), u.z);
}

vec3 octDecode(vec2 e) {
  vec3 v = vec3(e.xy, 1.0 - abs(e.x) - abs(e.y));
  if (v.z < 0.0) v.xy = (1.0 - abs(v.yx)) * vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0);
  return normalize(v);
}

// GGX / Smith / Schlick
float D_GGX(float NoH, float a) { float a2 = a * a; float d = (NoH * a2 - NoH) * NoH + 1.0; return a2 / (PI * d * d + 1e-7); }
float V_SmithGGXCorrelated(float NoV, float NoL, float a) {
  float a2 = a * a;
  float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  float gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / (gv + gl + 1e-6);
}
vec3 F_Schlick(vec3 f0, float VoH) { return f0 + (1.0 - f0) * pow5(1.0 - VoH); }
float Fd_Burley(float NoV, float NoL, float LoH, float rough) {
  float f90 = 0.5 + 2.0 * rough * LoH * LoH;
  float ls = 1.0 + (f90 - 1.0) * pow5(1.0 - NoL);
  float vs = 1.0 + (f90 - 1.0) * pow5(1.0 - NoV);
  return ls * vs / PI;
}
// Karis' analytic env BRDF approximation
vec3 envBRDFApprox(vec3 f0, float rough, float NoV) {
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  vec2 AB = vec2(-1.04, 1.04) * a004 + r.zw;
  return f0 * AB.x + AB.y;
}

// L2 SH irradiance (coefficients already cosine-convolved; standard real SH basis, Y up)
vec3 shIrradiance(vec3 n, vec3 sh[9]) {
  return max(vec3(0.0),
    sh[0] * 0.282095 +
    sh[1] * (0.488603 * n.y) + sh[2] * (0.488603 * n.z) + sh[3] * (0.488603 * n.x) +
    sh[4] * (1.092548 * n.x * n.y) + sh[5] * (1.092548 * n.y * n.z) + sh[6] * (0.315392 * (3.0 * n.z * n.z - 1.0)) +
    sh[7] * (1.092548 * n.x * n.z) + sh[8] * (0.546274 * (n.x * n.x - n.y * n.y)));
}

// Block light level (0..1 in 1/15 steps, smooth-interpolated) -> radiance factor
vec3 blockLightRadiance(vec3 lvl) {
  vec3 L = lvl * 15.0;
  // inverse-square-ish falloff in "level distance", soft toe
  vec3 d = max(vec3(0.0), 15.5 - L);
  vec3 i = 1.0 / (1.0 + d * d * 0.18);
  i *= smoothstep(0.0, 1.5, L);
  return i * BLOCK_LIGHT_INTENSITY;
}

const vec2 POISSON16[16] = vec2[](
  vec2(-0.94201624, -0.39906216), vec2(0.94558609, -0.76890725), vec2(-0.094184101, -0.92938870), vec2(0.34495938, 0.29387760),
  vec2(-0.91588581, 0.45771432), vec2(-0.81544232, -0.87912464), vec2(-0.38277543, 0.27676845), vec2(0.97484398, 0.75648379),
  vec2(0.44323325, -0.97511554), vec2(0.53742981, -0.47373420), vec2(-0.26496911, -0.41893023), vec2(0.79197514, 0.19090188),
  vec2(-0.24188840, 0.99706507), vec2(-0.81409955, 0.91437590), vec2(0.19984126, 0.78641367), vec2(0.14383161, -0.14100790));
`;

/** Cascaded shadow map sampling. Expects camera-relative world positions. */
export const GLSL_SHADOWS = /* glsl */ `
uniform sampler2D u_shadowMap;
uniform mat4 u_shadowMat[4];      // camera-relative world -> [0,1]^3 within the cascade's atlas tile
uniform vec4 u_shadowRects[4];    // atlas sub-rect (x, y, w, h) per cascade in uv
uniform vec4 u_cascadeRadius;     // world radius covered by each cascade (for filter sizing)
uniform float u_shadowTexel;      // 1 / atlas size
uniform float u_shadowEnabled;
uniform float u_shadowSoftness;

float shadowCompare(vec2 uv, float z) { return step(z, texture(u_shadowMap, uv).r); }

// Returns sun visibility 0..1
float sampleShadow(vec3 relPos, vec3 N, vec3 L, float noise, float sss) {
  if (u_shadowEnabled < 0.5) return 1.0;
  float NoL = dot(N, L);
  for (int i = 0; i < 4; i++) {
    float texelWorld = u_cascadeRadius[i] * 2.0 * u_shadowTexel / u_shadowRects[i].z;
    // normal offset bias (scaled by cascade texel size)
    vec3 p = relPos + N * texelWorld * (1.5 + 2.0 * (1.0 - abs(NoL)));
    vec4 sc = u_shadowMat[i] * vec4(p, 1.0);
    vec3 c = sc.xyz;
    if (c.x < 0.002 || c.x > 0.998 || c.y < 0.002 || c.y > 0.998 || c.z > 1.0) continue;
    vec4 r = u_shadowRects[i];
    float bias = 0.0004 + 0.0008 * float(i);
    float z = c.z - bias;
    // PCSS-lite blocker search
    float rot = noise * 6.2831853;
    mat2 R = mat2(cos(rot), sin(rot), -sin(rot), cos(rot));
    float searchR = 3.0 * u_shadowTexel * u_shadowSoftness / max(1.0, float(i) * 0.75 + 1.0);
    float blk = 0.0, nb = 0.0;
    for (int k = 0; k < 8; k++) {
      vec2 o = R * POISSON16[k * 2] * searchR * 2.0;
      vec2 uv = r.xy + clamp(c.xy + o / r.zw, 0.0, 1.0) * r.zw;
      float d = texture(u_shadowMap, uv).r;
      if (d < z) { blk += d; nb += 1.0; }
    }
    if (nb < 0.5) return 1.0;
    blk /= nb;
    float pen = clamp((z - blk) * 120.0 / (1.0 + float(i)), 0.0, 1.0);
    float filterR = mix(1.2, 5.0 + sss * 4.0, pen) * u_shadowTexel * u_shadowSoftness;
    float vis = 0.0;
    for (int k = 0; k < 16; k++) {
      vec2 o = R * POISSON16[k] * filterR;
      vec2 uv = r.xy + clamp(c.xy + o / r.zw, 0.0, 1.0) * r.zw;
      vis += shadowCompare(uv, z);
    }
    vis /= 16.0;
    // fade out at the edge of the last cascade
    if (i == 3) {
      vec2 e = min(c.xy, 1.0 - c.xy);
      vis = mix(1.0, vis, smoothstep(0.0, 0.08, min(e.x, e.y)));
    }
    return vis;
  }
  return 1.0;
}
`;
