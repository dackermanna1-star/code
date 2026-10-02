/**
 * Terrain shaders: G-buffer (opaque / cutout), shadow depth.
 */
import * as THREE from 'three';
import { GLSL_COMMON } from './common';

export const GLSL_TERRAIN_VERTEX_COMMON = /* glsl */ `
in uvec4 a_pos;
in uvec4 a_tex;
in vec4 a_light;
in vec4 a_color;
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float u_time;
uniform float u_wind;

#define MODE_LEAVES 1u
#define MODE_PLANT 2u
#define MODE_PLANT_UPPER 3u
#define MODE_WATER 4u
#define MODE_LAVA 5u
#define MODE_NETHER_PORTAL 6u
#define MODE_END_PORTAL 7u
#define MODE_FIRE 8u
#define MODE_FLUFF 9u
#define MODE_HANGING 10u
#define MODE_TUFT 11u
#define FLAG_SUBMERGED 16u
#define FLAG_NO_POM 32u
#define FLAG_FLOWING 64u
#define FLAG_FOLIAGE 128u

vec3 decodeLocal() { return vec3(a_pos.xyz) / 256.0 - 8.0; }
vec3 decodeNormal() {
  uint w = a_pos.w;
  vec2 e = vec2(float(w >> 8u), float(w & 255u)) / 255.0 * 2.0 - 1.0;
  return octDecode(e);
}

vec3 windOffset(vec3 wp, uint mode, float vc) {
  if (mode == 0u || (mode >= 4u && mode <= 8u)) return vec3(0.0);
  float t = u_time;
  float strength = 0.55 + u_wind * 1.6;
  vec2 dir = normalize(vec2(1.0, 0.35));
  float gust = 0.55 + 0.45 * sin(t * 0.37 + dot(wp.xz, dir) * 0.045) * sin(t * 0.21 + wp.x * 0.013);
  float w1 = sin(t * 1.9 + wp.x * 0.71 + wp.z * 0.43 + wp.y * 0.29);
  float w2 = sin(t * 3.3 + wp.x * 1.37 - wp.z * 1.11) * 0.5;
  float w3 = sin(t * 5.7 + wp.x * 2.9 + wp.z * 2.3) * 0.25;
  if (mode == MODE_LEAVES || mode == MODE_FLUFF) {
    float a = (mode == MODE_FLUFF ? 0.06 : 0.035) * strength * (0.5 + gust);
    return vec3(w1 + w3, w2 * 0.5, w2 + w1 * 0.3) * a;
  }
  float h = vc;
  if (mode == MODE_PLANT_UPPER) h = 0.5 + 0.5 * vc;
  else if (mode == MODE_HANGING) h = 1.0 - vc;
  else if (mode == MODE_PLANT) h = vc * 0.6;
  float amp = (mode == MODE_TUFT ? 0.09 : 0.14) * strength;
  vec2 o = (dir * (gust * 0.7 + 0.15) + vec2(w1, w2 + w3) * 0.45) * amp * h * h;
  return vec3(o.x, -dot(o, o) * 0.6, o.y);
}
`;

const GBUFFER_VERT = /* glsl */ `
precision highp float;
precision highp int;
${GLSL_COMMON}
${GLSL_TERRAIN_VERTEX_COMMON}
uniform mat3 u_viewInvRot;
out vec2 v_uv;
flat out uint v_layer;
flat out uint v_flags;
out vec3 v_normal;
out vec3 v_rel;
out vec4 v_light;
out vec4 v_color;
out vec3 v_wp;

void main() {
  vec3 local = decodeLocal();
  vec3 wp = (modelMatrix * vec4(local, 1.0)).xyz;
  uint flags = a_tex.w;
  uint mode = flags & 15u;
  vec2 uv = vec2(a_tex.xy) / 4096.0;
  vec3 off = windOffset(wp, mode, uv.y);
  vec4 mv = modelViewMatrix * vec4(local + off, 1.0);
  gl_Position = projectionMatrix * mv;
  v_rel = u_viewInvRot * mv.xyz;
  v_wp = wp + off;
  v_uv = uv;
  v_layer = a_tex.z;
  v_flags = flags;
  v_normal = decodeNormal();
  v_light = a_light;
  v_color = a_color;
}
`;

const GBUFFER_FRAG = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2DArray;
${GLSL_COMMON}
#define MODE_LAVA 5u
#define MODE_END_PORTAL 7u
#define MODE_FIRE 8u
#define FLAG_SUBMERGED 16u
#define FLAG_NO_POM 32u
#define FLAG_FOLIAGE 128u
uniform sampler2DArray u_albedo;
uniform sampler2DArray u_normalTex;
uniform sampler2D u_props;
uniform float u_texSize;
uniform float u_pomDepth;
uniform float u_pomDist;
uniform float u_normalStrength;
uniform float u_time;
uniform vec2 u_resolution;
in vec2 v_uv;
flat in uint v_layer;
flat in uint v_flags;
in vec3 v_normal;
in vec3 v_rel;
in vec4 v_light;
in vec4 v_color;
in vec3 v_wp;
layout(location = 0) out vec4 g0;
layout(location = 1) out vec4 g1;
layout(location = 2) out vec4 g2;
layout(location = 3) out vec4 g3;

vec2 parallax(vec2 uv, vec3 Vt, float layer, vec2 dx, vec2 dy, float fade, out float hOut) {
  float steps = floor(mix(20.0, 6.0, clamp(Vt.z, 0.0, 1.0)));
  float layerD = 1.0 / steps;
  vec2 P = Vt.xy / max(Vt.z, 0.25) * u_pomDepth * fade;
  vec2 delta = P / steps;
  vec2 cur = uv;
  float curD = 0.0;
  float d = 1.0 - textureGrad(u_normalTex, vec3(cur, layer), dx, dy).z;
  for (int i = 0; i < 24; i++) {
    if (float(i) >= steps || curD >= d) break;
    cur -= delta;
    curD += layerD;
    d = 1.0 - textureGrad(u_normalTex, vec3(cur, layer), dx, dy).z;
  }
  vec2 prev = cur + delta;
  float after = d - curD;
  float before = (1.0 - textureGrad(u_normalTex, vec3(prev, layer), dx, dy).z) - curD + layerD;
  float w = after / (after - before + 1e-5);
  hOut = 1.0 - (curD - layerD * (1.0 - w));
  return mix(cur, prev, clamp(w, 0.0, 1.0));
}

vec3 endPortalStars(vec3 rel) {
  vec2 sp = gl_FragCoord.xy / u_resolution.y;
  vec3 col = vec3(0.01, 0.015, 0.02);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float sc = 2.0 + fi * 1.7;
    vec2 p = sp * sc * 6.0 + vec2(u_time * 0.01 * (fi + 1.0), -u_time * 0.006 * fi) + v_wp.xz * 0.05 * (fi + 1.0);
    vec2 cell = floor(p);
    vec2 f = fract(p) - 0.5;
    float r = hash12(cell + fi * 17.0);
    float star = smoothstep(0.08, 0.0, length(f + (hash22(cell) - 0.5) * 0.6)) * step(0.82, r);
    vec3 tint = mix(vec3(0.2, 0.6, 0.55), vec3(0.45, 0.3, 0.8), hash12(cell * 1.3));
    col += star * tint * (1.2 - fi * 0.15);
  }
  return col;
}

void main() {
  float layer = float(v_layer);
  uint mode = v_flags & 15u;
  vec3 N0 = normalize(v_normal);
  if (!gl_FrontFacing) N0 = -N0;
  vec2 uv = v_uv;
  if (mode == MODE_LAVA) {
    uv = v_wp.xz * 0.5 + vec2(sin(u_time * 0.2 + v_wp.z * 0.3), cos(u_time * 0.17 + v_wp.x * 0.3)) * 0.08;
  } else if (mode == MODE_FIRE) {
    uv.x += sin(uv.y * 9.0 - u_time * 7.0 + v_wp.x * 3.0) * 0.035 * uv.y;
    uv.y = uv.y * 0.92 + fract(u_time * 0.0) * 0.0;
  }
  // cotangent frame
  vec3 dp1 = dFdx(v_rel), dp2 = dFdy(v_rel);
  vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N0), dp1perp = cross(N0, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  T *= invmax; B *= invmax;
  float dist = length(v_rel);
  float height = 1.0;
#ifndef CUTOUT
  if ((v_flags & FLAG_NO_POM) == 0u && u_pomDepth > 0.0 && dist < u_pomDist) {
    vec3 V = -v_rel / dist;
    vec3 Vt = vec3(dot(V, T), dot(V, B), dot(V, N0));
    float fade = 1.0 - smoothstep(u_pomDist * 0.6, u_pomDist, dist);
    if (Vt.z > 0.0) uv = parallax(uv, Vt, layer, duv1, duv2, fade, height);
  }
#endif
  vec4 alb = textureGrad(u_albedo, vec3(uv, layer), duv1, duv2);
  vec4 nt = textureGrad(u_normalTex, vec3(uv, layer), duv1, duv2);
#ifdef CUTOUT
  // keep alpha coverage at distance (mip-level aware)
  vec2 tx = duv1 * u_texSize, ty = duv2 * u_texSize;
  float lod = 0.5 * log2(max(dot(tx, tx), dot(ty, ty)));
  float a = alb.a * (1.0 + max(lod, 0.0) * 0.28);
  if (a < 0.5) discard;
#endif
  vec4 props = texelFetch(u_props, ivec2(int(v_layer), 0), 0);
  vec3 albedo = srgbToLinear(alb.rgb);
  vec3 tint = srgbToLinear(v_color.rgb);
#ifdef CUTOUT
  float tintMask = 1.0;
#else
  float tintMask = alb.a;
#endif
  albedo *= mix(vec3(1.0), tint, tintMask);
  vec2 nxy = (nt.xy * 2.0 - 1.0) * u_normalStrength;
  vec3 tn = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
  vec3 N;
  if ((v_flags & FLAG_FOLIAGE) != 0u) {
    // thin foliage cards: bend the card normal toward the sky (soft, natural canopy shading)
    N = normalize(N0 * 0.55 + vec3(0.0, 0.75, 0.0) + (T * tn.x + B * tn.y) * 0.25 * step(dot(T, T), 4.0));
  } else {
    N = T * tn.x + B * tn.y + N0 * tn.z;
    float l2 = dot(N, N);
    N = (l2 > 1e-6 && l2 < 1e6) ? N * inversesqrt(l2) : N0;
  }
  float rough = clamp(nt.w, 0.03, 1.0);
  float lum = luminance(alb.rgb);
  float emissive = props.g * (props.b > 0.0 ? smoothstep(props.b, min(1.0, props.b + 0.15), lum) : 1.0);
  float cavity = mix(0.55, 1.0, smoothstep(0.0, 0.6, nt.z));
  float ao = v_color.a * cavity;
  uint gflags = 0u;
  if ((v_flags & FLAG_FOLIAGE) != 0u) gflags |= 1u;
  if ((v_flags & FLAG_SUBMERGED) != 0u) gflags |= 2u;
  if (mode == MODE_END_PORTAL) {
    albedo = endPortalStars(v_rel);
    emissive = 1.0;
    rough = 0.3;
    gflags |= 16u;
  }
  if (mode == MODE_LAVA) {
    emissive = max(emissive, 0.85);
    rough = 0.6;
  }
  if (mode == MODE_FIRE) {
    emissive = 1.0;
    float flick = 0.85 + 0.15 * sin(u_time * 13.0 + v_wp.x * 5.0 + v_wp.z * 3.0);
    albedo *= flick;
  }
  g0 = vec4(sqrt(clamp(albedo, 0.0, 1.0)), props.a);
  g1 = vec4(N, rough);

  g2 = vec4(props.r, emissive, ao, float(gflags) / 255.0);
  g3 = v_light;
}
`;

const SHADOW_VERT = /* glsl */ `
precision highp float;
precision highp int;
${GLSL_COMMON}
${GLSL_TERRAIN_VERTEX_COMMON}
out vec2 v_uv;
flat out uint v_layer;
void main() {
  vec3 local = decodeLocal();
  vec3 wp = (modelMatrix * vec4(local, 1.0)).xyz;
  uint flags = a_tex.w;
  uint mode = flags & 15u;
  vec2 uv = vec2(a_tex.xy) / 4096.0;
  vec3 off = windOffset(wp, mode, uv.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(local + off, 1.0);
  v_uv = uv;
  v_layer = (mode == 4u || mode == 6u) ? 65535u : a_tex.z;
}
`;

const SHADOW_FRAG = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2DArray;
uniform sampler2DArray u_albedo;
in vec2 v_uv;
flat in uint v_layer;
out vec4 o;
void main() {
#ifdef CUTOUT
  if (v_layer == 65535u) discard;
  float a = texture(u_albedo, vec3(v_uv, float(v_layer)), 1.5).a;
  if (a < 0.4) discard;
#endif
  o = vec4(1.0);
}
`;

export interface TerrainUniforms {
  [k: string]: THREE.IUniform;
}

export function createTerrainGBufferMaterial(cutout: boolean, uniforms: TerrainUniforms): THREE.RawShaderMaterial {
  const m = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: GBUFFER_VERT,
    fragmentShader: (cutout ? '#define CUTOUT\n' : '') + GBUFFER_FRAG,
    uniforms,
    side: cutout ? THREE.DoubleSide : THREE.FrontSide,
  });
  return m;
}

export function createTerrainShadowMaterial(cutout: boolean, uniforms: TerrainUniforms): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: SHADOW_VERT,
    fragmentShader: (cutout ? '#define CUTOUT\n' : '') + SHADOW_FRAG,
    uniforms,
    side: THREE.DoubleSide,
    colorWrite: false,
  });
}
