/**
 * Particle shaders.
 *
 *  - Billboards (alpha + additive pools): premultiplied-alpha output (alpha 0 = additive),
 *    lit by the same terms as the deferred/translucent passes (sun/moon with a CSM lookup and
 *    cloud shadow, SH sky ambient x sky light², coloured block light, dimension ambient),
 *    soft-particle depth fade against the linear depth buffer, aerial perspective via
 *    atmo_applyFog (evaluated per vertex as transmittance + in-scatter).
 *  - Crumbs: instanced cubes written into the G-buffer (same MRT layout as terrain).
 *
 * Positions are camera-relative (uploaded on the CPU in double precision) and transformed with
 * the rotation part of three's `viewMatrix` and the (TAA-jittered) `projectionMatrix`.
 */
import { GLSL_COMMON } from '../shaders/common';

/** Small CSM lookup usable in vertex shaders (no PCSS, 4-tap PCF). */
export const GLSL_PARTICLE_SHADOW = /* glsl */ `
uniform sampler2D u_shadowMap;
uniform mat4 u_shadowMat[4];
uniform vec4 u_shadowRects[4];
uniform vec4 u_cascadeRadius;
uniform float u_shadowTexel;
uniform float u_shadowEnabled;
float particleShadow(vec3 rel) {
  if (u_shadowEnabled < 0.5) return 1.0;
  for (int i = 0; i < 4; i++) {
    vec4 sc = u_shadowMat[i] * vec4(rel, 1.0);
    vec3 c = sc.xyz;
    if (c.x < 0.01 || c.x > 0.99 || c.y < 0.01 || c.y > 0.99 || c.z > 1.0) continue;
    vec4 r = u_shadowRects[i];
    float z = c.z - 0.0015 - 0.001 * float(i);
    float o = 1.5 * u_shadowTexel;
    float v = 0.0;
    v += step(z, texture(u_shadowMap, r.xy + clamp(c.xy + vec2(-o, -o) / r.zw, 0.0, 1.0) * r.zw).r);
    v += step(z, texture(u_shadowMap, r.xy + clamp(c.xy + vec2(o, -o) / r.zw, 0.0, 1.0) * r.zw).r);
    v += step(z, texture(u_shadowMap, r.xy + clamp(c.xy + vec2(-o, o) / r.zw, 0.0, 1.0) * r.zw).r);
    v += step(z, texture(u_shadowMap, r.xy + clamp(c.xy + vec2(o, o) / r.zw, 0.0, 1.0) * r.zw).r);
    return v * 0.25;
  }
  return 1.0;
}
`;

export function billboardVertex(atmoGlsl: string): string {
  return /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2DArray;
${GLSL_COMMON}
${atmoGlsl}
${GLSL_PARTICLE_SHADOW}
in vec3 position;
in vec4 a_posSize;
in vec4 a_color;
in vec4 a_emis;
in vec4 a_params;
in vec4 a_misc;
in vec4 a_vel;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 u_cameraPos;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform float u_skyLightScale;
uniform vec3 u_dimAmbient;
uniform float u_minAmbient;
uniform sampler2DArray u_albedo;
uniform float u_hasBlockTex;
out vec2 v_uv;
flat out float v_layer;
flat out int v_mode;
out vec4 v_color;
out vec4 v_emis;
out float v_erode;
out vec3 v_sun;
out float v_skyVis;
out vec3 v_blk;
out vec3 v_fogT;
out vec3 v_fogI;
out vec3 v_R;
out vec3 v_U;
out vec3 v_F;
out float v_dist;
out float v_soft;
out float v_seed;

void main() {
  vec3 rel = a_posSize.xyz;
  float size = a_posSize.w;
  int mode = int(a_params.z + 0.5);
  int orient = int(a_misc.z + 0.5);
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 toCam = normalize(-rel);
  vec2 c = position.xy;
  float rot = a_params.x;
  float cr = cos(rot), sr = sin(rot);
  vec3 R, U;
  vec3 off;
  float h = size * 0.5;
  if (orient == 1) {
    // velocity aligned streak: width = size, length = size + |v| * stretch
    vec3 v = a_vel.xyz;
    vec3 vp = v - toCam * dot(v, toCam);
    float vl = length(vp);
    U = vl > 1e-4 ? vp / vl : camU;
    R = normalize(cross(U, toCam));
    float len = h + length(v) * a_misc.w * 0.5;
    off = R * (c.x * h) + U * (c.y * len);
  } else if (orient == 2) {
    R = vec3(cr, 0.0, -sr);
    U = vec3(sr, 0.0, cr);
    off = R * (c.x * h) + U * (c.y * h);
    R = vec3(1.0, 0.0, 0.0); U = vec3(0.0, 0.0, -1.0);
  } else if (orient == 3) {
    U = vec3(0.0, 1.0, 0.0);
    vec3 side = cross(U, toCam);
    R = length(side) > 1e-3 ? normalize(side) : camR;
    off = R * (c.x * h) + U * (c.y * h);
  } else {
    R = camR * cr + camU * sr;
    U = -camR * sr + camU * cr;
    off = R * (c.x * h) + U * (c.y * h);
  }
  vec3 p = rel + off;
  vec4 vpos = vec4(mat3(viewMatrix) * p, 1.0);
  gl_Position = projectionMatrix * vpos;
  v_uv = c * 0.5 + 0.5;
  v_layer = a_params.y;
  v_mode = mode;
  v_color = a_color;
  v_emis = a_emis;
  v_erode = a_params.w;
  v_R = R; v_U = U; v_F = orient == 2 ? vec3(0.0, 1.0, 0.0) : toCam;
  v_dist = length(vpos.xyz);
  v_soft = size;
  v_seed = a_misc.y;

  // dust coloured by its block: average texel (top mip) of the block texture
  if (a_vel.w >= 0.0 && u_hasBlockTex > 0.5) {
    vec4 avg = textureLod(u_albedo, vec3(0.5, 0.5, a_vel.w), 12.0);
    v_color.rgb *= srgbToLinear(avg.rgb) * 1.15;
  }

  // ---- lighting at the particle centre (shared by the 4 vertices)
  int L = int(a_misc.x + 0.5);
  float sky = float((L >> 12) & 15) / 15.0;
  vec3 blk = vec3(float((L >> 8) & 15), float((L >> 4) & 15), float(L & 15)) / 15.0;
  float skyL = sky * u_skyLightScale;
  v_skyVis = skyL * skyL;
  vec3 wp = rel + u_cameraPos;
  float sh = 0.0;
  if (dot(u_lightColor, u_lightColor) > 1e-8) {
    sh = particleShadow(rel) * atmo_cloudShadow(wp);
    // no direct light deep inside caves (outside the shadow-map range)
    sh *= smoothstep(0.05, 0.4, sky);
  }
  v_sun = u_lightColor * sh;
  v_blk = blockLightRadiance(blk) + u_dimAmbient + vec3(u_minAmbient);
  // ---- fog (atmo_applyFog is affine in colour: c * T + I)
  vec3 fdir = normalize(rel + vec3(0.0, 1e-5, 0.0));
  float fd = length(rel);
  vec3 f0 = atmo_applyFog(vec3(0.0), fdir, fd);
  vec3 f1 = atmo_applyFog(vec3(1.0), fdir, fd);
  v_fogI = f0;
  v_fogT = clamp(f1 - f0, 0.0, 1.0);
}
`;
}

export const BILLBOARD_FRAG = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2DArray;
${GLSL_COMMON}
uniform sampler2DArray u_atlas;
uniform sampler2D u_linDepth;
uniform vec2 u_resolution;
uniform vec3 u_lightDir;
uniform vec3 u_sh[9];
uniform float u_additive;
in vec2 v_uv;
flat in float v_layer;
flat in int v_mode;
in vec4 v_color;
in vec4 v_emis;
in float v_erode;
in vec3 v_sun;
in float v_skyVis;
in vec3 v_blk;
in vec3 v_fogT;
in vec3 v_fogI;
in vec3 v_R;
in vec3 v_U;
in vec3 v_F;
in float v_dist;
in float v_soft;
in float v_seed;
out vec4 o;

float hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5);
}

vec3 fireRamp(float h) {
  // blackbody-ish: dark red -> orange -> yellow -> white
  h = clamp(h, 0.0, 1.2);
  vec3 c = mix(vec3(0.5, 0.04, 0.0), vec3(1.0, 0.32, 0.03), smoothstep(0.0, 0.4, h));
  c = mix(c, vec3(1.0, 0.72, 0.25), smoothstep(0.35, 0.75, h));
  c = mix(c, vec3(1.0, 0.95, 0.8), smoothstep(0.75, 1.1, h));
  return c * (0.25 + 1.4 * h * h);
}
vec3 soulRamp(float h) {
  h = clamp(h, 0.0, 1.2);
  vec3 c = mix(vec3(0.0, 0.12, 0.3), vec3(0.05, 0.6, 0.9), smoothstep(0.0, 0.5, h));
  c = mix(c, vec3(0.75, 1.0, 1.0), smoothstep(0.6, 1.1, h));
  return c * (0.25 + 1.4 * h * h);
}

void main() {
  vec4 tex = texture(u_atlas, vec3(v_uv, v_layer));
  vec3 V = -v_F; // from camera toward the particle
  vec3 rgb = vec3(0.0);
  float a = 0.0;
  if (v_mode == 0) {
    // ---- lit volumetric puff
    float dens = tex.a;
    float e = v_erode;
    a = smoothstep(e, e + 0.3, dens) * v_color.a;
    if (a < 0.002) discard;
    vec2 nxy = tex.rg * 2.0 - 1.0;
    vec3 N = normalize(v_R * nxy.x + v_U * nxy.y + v_F * sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
    float thick = tex.b;
    float NoL = dot(N, u_lightDir);
    float wrap = pow(clamp(NoL * 0.55 + 0.45, 0.0, 1.0), 1.4);
    // self-shadowing: thick cores facing away from the light darken
    float selfSh = mix(1.0, 0.45, thick * (1.0 - clamp(NoL * 0.5 + 0.5, 0.0, 1.0)));
    float fwd = hg(dot(V, u_lightDir), 0.55) * (1.0 - dens * 0.6);
    vec3 sunTerm = v_sun * (wrap * selfSh * 0.9 + fwd * 0.12);
    vec3 amb = shIrradiance(N, u_sh) * v_skyVis * mix(0.75, 1.0, 1.0 - thick * 0.5);
    rgb = v_color.rgb * (sunTerm / PI + amb / PI + v_blk) * a;
    rgb += v_emis.rgb * a * smoothstep(0.15, 0.9, dens) * (0.6 + 0.4 * thick);
  } else if (v_mode == 1) {
    // ---- lit colour sprite
    a = tex.a * v_color.a;
    if (a < 0.002) discard;
    vec3 alb = srgbToLinear(tex.rgb) * v_color.rgb;
    vec3 N = v_F;
    float NoL = dot(N, u_lightDir);
    vec3 lit = v_sun * (abs(NoL) * 0.6 + 0.4) / PI + shIrradiance(N, u_sh) * v_skyVis / PI + v_blk;
    rgb = alb * (lit + v_emis.w * 1.2) * a;
  } else if (v_mode == 2) {
    // ---- emissive mask
    float m = tex.a * v_color.a;
    if (m < 0.002) discard;
    rgb = v_emis.rgb * m * mix(1.0, luminance(tex.rgb), 0.5);
    a = m * v_emis.w; // optional occlusion (0 = purely additive)
  } else if (v_mode == 3) {
    // ---- flame
    float m = tex.a * v_color.a;
    if (m < 0.002) discard;
    float heat = tex.r * abs(v_emis.w);
    vec3 c = v_emis.w < 0.0 ? soulRamp(heat) : fireRamp(heat);
    rgb = c * v_emis.rgb * m;
    a = 0.0;
  } else if (v_mode == 4) {
    // ---- sun-lit dust mote (single scattering)
    float m = tex.a * v_color.a;
    if (m < 0.002) discard;
    float ph = hg(dot(V, u_lightDir), 0.7);
    rgb = v_color.rgb * m * (v_sun * ph * 0.06 + shIrradiance(v_F, u_sh) * v_skyVis * 0.004);
    a = 0.0;
  } else {
    // ---- water / blood droplet
    a = tex.a * v_color.a;
    if (a < 0.002) discard;
    float hl = smoothstep(0.82, 1.0, tex.r);
    vec3 skyUp = shIrradiance(vec3(0.0, 1.0, 0.0), u_sh) * v_skyVis / PI;
    float ph = hg(dot(V, u_lightDir), 0.6);
    vec3 body = v_color.rgb * (skyUp * 1.1 + v_sun * (0.25 + 0.08 * ph) / PI + v_blk);
    vec3 spec = (skyUp * 1.5 + v_sun * 0.35 + v_blk * 1.5) * hl;
    rgb = (body + spec) * a;
  }
  // ---- soft particles + near-camera fade
  float scene = texture(u_linDepth, gl_FragCoord.xy / u_resolution).r;
  float soft = clamp((scene - v_dist) / max(0.04, v_soft * 0.5), 0.0, 1.0);
  float nearF = clamp((v_dist - 0.12) / 0.35, 0.0, 1.0);
  float k = soft * nearF;
  rgb *= k;
  a *= k;
  // ---- aerial perspective
  rgb = rgb * v_fogT + v_fogI * a;
  o = vec4(rgb, u_additive > 0.5 ? 0.0 : a);
}
`;

// --------------------------------------------------------------------------------------- crumbs
export const CRUMB_VERT = /* glsl */ `
precision highp float;
precision highp int;
in vec3 position;
in vec3 normal;
in vec2 uv;
in vec3 a_tangent;
in vec4 a_posSize;
in vec4 a_quat;
in vec4 a_tex;
in vec4 a_tint;
in vec4 a_light;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
out vec2 v_uv;
flat out float v_layer;
flat out float v_cutout;
out vec3 v_normal;
out vec3 v_tangent;
out vec3 v_tint;
out vec4 v_light;
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
float h1(float s) { return fract(sin(s * 91.345) * 47453.5453); }
void main() {
  float s = a_tint.w;
  vec3 dims = a_posSize.w * vec3(0.75 + 0.5 * h1(s), 0.5 + 0.5 * h1(s + 1.7), 0.75 + 0.5 * h1(s + 3.1));
  vec3 p = qrot(a_quat, position * dims) + a_posSize.xyz;
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * p, 1.0);
  v_normal = qrot(a_quat, normal);
  v_tangent = qrot(a_quat, a_tangent);
  v_uv = a_tex.yz + uv * a_posSize.w;
  v_layer = a_tex.x;
  v_cutout = a_tex.w;
  v_tint = a_tint.rgb;
  v_light = a_light;
}
`;

export const CRUMB_FRAG = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2DArray;
${GLSL_COMMON}
uniform sampler2DArray u_albedo;
uniform sampler2DArray u_normalTex;
uniform sampler2D u_props;
in vec2 v_uv;
flat in float v_layer;
flat in float v_cutout;
in vec3 v_normal;
in vec3 v_tangent;
in vec3 v_tint;
in vec4 v_light;
layout(location = 0) out vec4 g0;
layout(location = 1) out vec4 g1;
layout(location = 2) out vec4 g2;
layout(location = 3) out vec4 g3;
void main() {
  vec4 alb = texture(u_albedo, vec3(v_uv, v_layer));
  if (v_cutout > 0.5 && alb.a < 0.5) discard;
  vec4 nt = texture(u_normalTex, vec3(v_uv, v_layer));
  vec4 props = texelFetch(u_props, ivec2(int(v_layer), 0), 0);
  vec3 albedo = srgbToLinear(alb.rgb);
  float tintMask = v_cutout > 0.5 ? 1.0 : alb.a;
  albedo *= mix(vec3(1.0), srgbToLinear(v_tint), tintMask);
  vec3 N0 = normalize(v_normal);
  vec3 T = normalize(v_tangent - N0 * dot(v_tangent, N0));
  vec3 B = cross(N0, T);
  vec2 nxy = nt.xy * 2.0 - 1.0;
  vec3 N = normalize(T * nxy.x + B * nxy.y + N0 * sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
  float lum = luminance(alb.rgb);
  float emissive = props.g * (props.b > 0.0 ? smoothstep(props.b, min(1.0, props.b + 0.15), lum) : 1.0);
  g0 = vec4(sqrt(clamp(albedo, 0.0, 1.0)), props.a);
  g1 = vec4(N, clamp(nt.w, 0.05, 1.0));
  g2 = vec4(props.r, emissive, mix(0.6, 1.0, smoothstep(0.0, 0.6, nt.z)), 0.0);
  g3 = v_light;
}
`;
