/**
 * Forward translucent material for chunk translucent layers: water (waves, SSR, refraction,
 * absorption, foam), glass/ice/stained glass, nether portal swirl.
 */
import * as THREE from 'three';
import { GLSL_COMMON, GLSL_SHADOWS } from './shaders/common';
import { GLSL_TERRAIN_VERTEX_COMMON } from './shaders/terrain';

export function createTranslucentMaterial(atmoGlsl: string, uniforms: Record<string, THREE.IUniform>): THREE.RawShaderMaterial {
  const vert = /* glsl */ `
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
out vec4 v_clip;

float waveH(vec2 p, float t) {
  return sin(p.x * 0.8 + t * 1.3) * 0.025 + sin(p.y * 1.1 - t * 1.1 + p.x * 0.3) * 0.02 + sin((p.x + p.y) * 2.3 + t * 2.1) * 0.008;
}

void main() {
  vec3 local = decodeLocal();
  vec3 wp = (modelMatrix * vec4(local, 1.0)).xyz;
  uint flags = a_tex.w;
  uint mode = flags & 15u;
  vec3 off = vec3(0.0);
  if (mode == MODE_WATER && fract(wp.y) > 0.02 && fract(wp.y) < 0.98) off.y = waveH(wp.xz, u_time) - 0.03;
  vec4 mv = modelViewMatrix * vec4(local + off, 1.0);
  gl_Position = projectionMatrix * mv;
  v_clip = gl_Position;
  v_rel = u_viewInvRot * mv.xyz;
  v_wp = wp + off;
  v_uv = vec2(a_tex.xy) / 4096.0;
  v_layer = a_tex.z;
  v_flags = flags;
  v_normal = decodeNormal();
  v_light = a_light;
  v_color = a_color;
}
`;
  const frag = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2DArray;
${GLSL_COMMON}
${atmoGlsl}
${GLSL_SHADOWS}
#define MODE_WATER 4u
#define MODE_NETHER_PORTAL 6u
#define FLAG_FLOWING 64u
uniform sampler2DArray u_albedo;
uniform sampler2DArray u_normalTex;
uniform sampler2D u_props;
uniform sampler2D u_sceneColor;
uniform sampler2D u_linDepth;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform vec3 u_cameraPos;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_sh[9];
uniform float u_time;
uniform float u_frame;
uniform vec2 u_resolution;
uniform float u_underwater;
uniform vec3 u_waterFog;
uniform float u_skyLightScale;
uniform vec3 u_dimAmbient;
uniform float u_ssr;
in vec2 v_uv;
flat in uint v_layer;
flat in uint v_flags;
in vec3 v_normal;
in vec3 v_rel;
in vec4 v_light;
in vec4 v_color;
in vec3 v_wp;
in vec4 v_clip;
out vec4 o;

vec2 waveGrad(vec2 p, float t, vec2 flow, float flowing) {
  vec2 g = vec2(0.0);
  // sum of directional waves (analytic derivatives)
  const int N = 7;
  float amp = 0.065, freq = 0.9;
  for (int i = 0; i < N; i++) {
    float fi = float(i);
    float ang = fi * 2.399 + 0.6;
    vec2 d = vec2(cos(ang), sin(ang));
    if (flowing > 0.5) d = normalize(mix(d, flow, 0.75));
    float ph = dot(d, p) * freq + t * (1.2 + fi * 0.37) * sqrt(freq) * (flowing > 0.5 ? 2.2 : 1.0);
    g += d * cos(ph) * amp * freq;
    amp *= 0.68;
    freq *= 1.62;
  }
  return g;
}

vec3 viewToScreen(vec3 vp) {
  vec4 c = projectionMatrix * vec4(vp, 1.0);
  return vec3(c.xy / c.w * 0.5 + 0.5, -vp.z);
}

// screen space reflection against the linear-depth buffer; returns uv & hit (w)
vec4 ssr(vec3 relPos, vec3 R, float jitter) {
  vec3 vp = (viewMatrix * vec4(relPos + u_cameraPos, 1.0)).xyz;
  vec3 vr = mat3(viewMatrix) * R;
  if (vr.z > 0.2) return vec4(0.0);
  float stepLen = 0.35;
  vec3 p = vp + vr * stepLen * jitter;
  vec3 prevP = p;
  for (int i = 0; i < 40; i++) {
    prevP = p;
    p += vr * stepLen;
    stepLen *= 1.12;
    vec3 s = viewToScreen(p);
    if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) return vec4(0.0);
    float sceneD = texture(u_linDepth, s.xy).r;
    float rayD = length(p);
    if (rayD > sceneD && rayD - sceneD < stepLen * 2.5 + 0.5) {
      // binary refine
      vec3 a = prevP, b = p;
      for (int k = 0; k < 6; k++) {
        vec3 mid = (a + b) * 0.5;
        vec3 ms = viewToScreen(mid);
        if (length(mid) > texture(u_linDepth, ms.xy).r) b = mid; else a = mid;
      }
      vec3 hs = viewToScreen(b);
      vec2 e = min(hs.xy, 1.0 - hs.xy);
      float fade = smoothstep(0.0, 0.12, min(e.x, e.y));
      return vec4(hs.xy, 0.0, fade);
    }
  }
  return vec4(0.0);
}

void main() {
  uint mode = v_flags & 15u;
  vec2 suv = gl_FragCoord.xy / u_resolution;
  float dist = length(v_rel);
  vec3 V = -v_rel / dist;
  vec3 N0 = normalize(v_normal);
  bool back = !gl_FrontFacing;
  if (back) N0 = -N0;
  float skyL = v_light.r * u_skyLightScale;
  float skyVis = skyL * skyL;
  vec3 blk = blockLightRadiance(v_light.gba);
  float noise = ignT(gl_FragCoord.xy, u_frame);
  vec3 sceneBehind = texture(u_sceneColor, suv).rgb;
  float sceneD = texture(u_linDepth, suv).r;

  if (mode == MODE_WATER) {
    vec3 tint = srgbToLinear(v_color.rgb);
    float flowing = (v_flags & FLAG_FLOWING) != 0u ? 1.0 : 0.0;
    float ang = float(v_flags >> 8u) / 255.0 * 6.2831853;
    vec2 flow = vec2(cos(ang), sin(ang));
    vec3 N = N0;
    float fade = 1.0 - smoothstep(30.0, 120.0, dist);
    if (abs(N0.y) > 0.5) {
      vec2 g = waveGrad(v_wp.xz, u_time, flow, flowing) * fade;
      // detail ripples from the water texture
      vec2 dUv = v_wp.xz * 0.5 + (flowing > 0.5 ? flow * u_time * 0.8 : vec2(u_time * 0.03, u_time * 0.02));
      vec4 nt = texture(u_normalTex, vec3(dUv, float(v_layer)));
      g += (nt.xy * 2.0 - 1.0) * 0.12 * fade;
      N = normalize(vec3(-g.x, 1.0, -g.y));
      if (back) N = -N;
    } else {
      vec2 g = vec2(sin(v_wp.y * 6.0 - u_time * 6.0), cos(v_wp.x * 4.0 + v_wp.z * 4.0)) * 0.05;
      N = normalize(N0 + vec3(g.x, g.y, g.x) * 0.3);
    }
    float NoV = max(dot(N, V), 1e-3);
    // refraction
    float waterDepth = max(sceneD - dist, 0.0);
    vec2 refrOff = N.xz * 0.06 * clamp(waterDepth * 0.25, 0.0, 1.0) / max(1.0, dist * 0.05);
    vec2 ruv = clamp(suv + refrOff, 0.001, 0.999);
    float refrD = texture(u_linDepth, ruv).r;
    if (refrD < dist) { ruv = suv; refrD = sceneD; }
    vec3 refr = texture(u_sceneColor, ruv).rgb;
    float path = max(refrD - dist, 0.0);
    if (u_underwater > 0.5) path = 0.0;
    vec3 absorb = exp(-path * vec3(0.45, 0.09, 0.055) * mix(vec3(1.0), (1.0 - tint) * 2.0 + 0.35, 0.6));
    vec3 scatterCol = tint * (shIrradiance(vec3(0, 1, 0), u_sh) / PI * skyVis * 0.12 + u_lightColor * 0.012 * max(u_lightDir.y, 0.0) + blk * 0.05);
    vec3 transmitted = refr * absorb + scatterCol * (1.0 - absorb);
    // reflection
    vec3 R = reflect(-V, N);
    vec3 refl;
    if (back) {
      // under the surface: total internal reflection / Snell window
      float cosT = dot(-V, -N);
      refl = u_waterFog;
      float snell = smoothstep(0.62, 0.7, abs(dot(V, N)));
      vec3 above = atmo_skyRadiance(normalize(refract(-V, N, 1.33)));
      o = vec4(mix(u_waterFog * 0.5, above * 0.6 + refr * 0.4, snell), 1.0);
      return;
    } else {
      vec3 skyRefl = atmo_skyRadianceWithClouds(normalize(vec3(R.x, abs(R.y), R.z))) * mix(0.15, 1.0, skyVis);
      refl = skyRefl;
      if (u_ssr > 0.5) {
        vec4 h = ssr(v_rel, R, noise);
        if (h.w > 0.0) refl = mix(skyRefl, texture(u_sceneColor, h.xy).rgb, h.w);
      }
    }
    float F = 0.02 + 0.98 * pow5(1.0 - NoV);
    // sun glint
    float shadow = sampleShadow(v_rel, N0, u_lightDir, noise, 0.0) * atmo_cloudShadow(v_rel + u_cameraPos);
    vec3 H = normalize(V + u_lightDir);
    float NoL = max(dot(N, u_lightDir), 0.0);
    float a = 0.035;
    float spec = D_GGX(max(dot(N, H), 0.0), a) * V_SmithGGXCorrelated(NoV, NoL, a) * NoL;
    vec3 sunSpec = u_lightColor * spec * F * shadow * 1.0;
    // shoreline foam
    float foam = 0.0;
    if (abs(N0.y) > 0.5) {
      float edge = 1.0 - smoothstep(0.0, 0.45, waterDepth);
      float fn = vnoise(v_wp.xz * 3.5 + u_time * 0.4) * vnoise(v_wp.xz * 7.0 - u_time * 0.3);
      foam = edge * smoothstep(0.15, 0.45, fn + edge * 0.3);
      if (flowing > 0.5) foam += 0.12 * smoothstep(0.55, 0.9, vnoise(v_wp.xz * 4.0 - flow * u_time * 3.0));
    }
    vec3 foamCol = vec3(0.85) * (shIrradiance(vec3(0, 1, 0), u_sh) / PI * skyVis + u_lightColor * max(u_lightDir.y, 0.0) * shadow / PI + blk);
    vec3 col = mix(transmitted, refl, F) + sunSpec;
    col = mix(col, foamCol, clamp(foam, 0.0, 1.0) * 0.8);
    col = atmo_applyFog(col, -V, dist);
    o = vec4(col, 1.0);
    return;
  }

  if (mode == MODE_NETHER_PORTAL) {
    vec2 p = vec2(dot(v_wp.xz, vec2(1.0)), v_wp.y);
    float t = u_time * 0.6;
    float sw = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      vec2 q = p * (1.2 + fi * 0.8);
      q += vec2(sin(q.y * 1.3 + t * (1.0 + fi * 0.3)), cos(q.x * 1.1 - t * (0.8 + fi * 0.2))) * 0.8;
      sw += vnoise(q + t) * (0.5 / (1.0 + fi));
    }
    vec3 c = mix(vec3(0.25, 0.02, 0.6), vec3(0.85, 0.35, 1.0), smoothstep(0.35, 0.9, sw));
    vec3 col = mix(sceneBehind * 0.25, c * 3.5, 0.85);
    o = vec4(col, 1.0);
    return;
  }

  // ---- glass / ice / stained glass / slime / honey
  float layer = float(v_layer);
  vec4 alb = texture(u_albedo, vec3(v_uv, layer));
  vec4 nt = texture(u_normalTex, vec3(v_uv, layer));
  vec3 tint = srgbToLinear(v_color.rgb);
  vec3 albedo = srgbToLinear(alb.rgb) * tint;
  float alpha = alb.a;
  vec3 N = N0;
  float NoV = max(dot(N, V), 1e-3);
  float F = 0.04 + 0.96 * pow5(1.0 - NoV);
  vec3 R = reflect(-V, N);
  vec3 refl = atmo_skyRadiance(normalize(vec3(R.x, abs(R.y), R.z))) * skyVis;
  if (u_ssr > 0.5 && nt.w < 0.3) {
    vec4 h = ssr(v_rel, R, noise);
    if (h.w > 0.0) refl = mix(refl, texture(u_sceneColor, h.xy).rgb, h.w);
  }
  float shadow = sampleShadow(v_rel, N, u_lightDir, noise, 0.0);
  float NoL = max(dot(N, u_lightDir), 0.0);
  vec3 lit = albedo * (u_lightColor * NoL * shadow / PI + shIrradiance(N, u_sh) / PI * skyVis + blk + u_dimAmbient);
  vec2 off = (nt.xy * 2.0 - 1.0) * 0.015;
  vec3 behind = texture(u_sceneColor, clamp(suv + off, 0.001, 0.999)).rgb;
  vec3 trans = behind * mix(vec3(1.0), tint * albedo / max(luminance(albedo), 0.05) * 0.8, clamp(alpha * 1.5, 0.0, 1.0));
  vec3 col = mix(trans, lit, alpha) * (1.0 - F) + refl * F * (1.0 - nt.w * 0.6);
  col = atmo_applyFog(col, -V, dist);
  o = vec4(col, 1.0);
}
`;
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vert,
    fragmentShader: frag,
    uniforms,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
  });
}
