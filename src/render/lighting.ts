/**
 * Deferred lighting pass: G-buffer + shadows + SSAO + atmosphere -> HDR radiance.
 */
import * as THREE from 'three';
import { GLSL_COMMON, GLSL_SHADOWS } from './shaders/common';
import { shaderPass, type FullscreenPass } from './post/fullscreen';

export function createLightingPass(atmoGlsl: string, uniforms: Record<string, THREE.IUniform>): FullscreenPass {
  const frag = /* glsl */ `
precision highp float;
precision highp int;
${GLSL_COMMON}
${atmoGlsl}
${GLSL_SHADOWS}
uniform sampler2D g0;
uniform sampler2D g1;
uniform sampler2D g2;
uniform sampler2D g3;
uniform sampler2D u_depth;
uniform sampler2D u_ssao;
uniform mat4 u_projInv;
uniform mat3 u_viewInvRot;
uniform vec3 u_cameraPos;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_sh[9];
uniform float u_frame;
uniform float u_time;
uniform float u_minAmbient;
uniform float u_nightVision;
uniform float u_skyLightScale;
uniform float u_underwater;
uniform vec3 u_waterFog;
uniform float u_dimension;   // 0 overworld, 1 nether, 2 end
uniform vec3 u_dimAmbient;
uniform float u_wetness;
uniform sampler2D u_prevColor;
uniform sampler2D u_linDepth;
uniform mat4 u_prevViewProj;
uniform mat4 u_viewMat;
uniform mat4 u_viewInvMat;
uniform mat4 u_projMat;
uniform float u_ssrEnabled;
uniform float u_hasPrev;
in vec2 v_uv;
out vec4 o;

// Screen-space reflection against linear depth; returns reflected radiance (rgb) and confidence (a)
vec4 traceSSR(vec3 vpos, vec3 vR, float jitter, float rough) {
  if (vR.z > 0.35) return vec4(0.0);
  float stepLen = 0.18 + length(vpos) * 0.012;
  vec3 p = vpos + vR * stepLen * (0.5 + jitter);
  vec3 prev = p;
  for (int i = 0; i < 28; i++) {
    vec4 c = u_projMat * vec4(p, 1.0);
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 || c.w < 0.0) break;
    float sceneD = texture(u_linDepth, uv).r;
    float rayD = length(p);
    float diff = rayD - sceneD;
    if (diff > 0.0 && diff < stepLen * 2.0 + 0.3) {
      vec3 a = prev, b = p;
      for (int k = 0; k < 5; k++) {
        vec3 m = (a + b) * 0.5;
        vec4 mc = u_projMat * vec4(m, 1.0);
        vec2 muv = mc.xy / mc.w * 0.5 + 0.5;
        if (length(m) > texture(u_linDepth, muv).r) b = m; else a = m;
      }
      vec4 bc = u_projMat * vec4(b, 1.0);
      vec2 huv = bc.xy / bc.w * 0.5 + 0.5;
      // reproject hit to the previous frame
      vec3 hitWorld = (u_viewInvMat * vec4(b, 1.0)).xyz;
      vec4 pc = u_prevViewProj * vec4(hitWorld, 1.0);
      vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
      if (puv.x < 0.0 || puv.y < 0.0 || puv.x > 1.0 || puv.y > 1.0) return vec4(0.0);
      vec2 e = min(huv, 1.0 - huv);
      float fade = smoothstep(0.0, 0.1, min(e.x, e.y)) * (1.0 - smoothstep(0.15, 0.45, rough)) * (1.0 - float(i) / 28.0 * 0.5);
      vec3 col = textureLod(u_prevColor, puv, rough * 4.0).rgb;
      return vec4(min(col, vec3(64.0)), fade);
    }
    prev = p;
    p += vR * stepLen;
    stepLen *= 1.14;
  }
  return vec4(0.0);
}

float caustics(vec3 p, float t) {
  vec2 q = p.xz * 0.7 + p.y * 0.2;
  float c = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 a = q * (1.0 + fi * 0.6) + vec2(t * (0.35 + fi * 0.1), -t * 0.27);
    vec2 f = abs(fract(a + 0.5 * sin(a.yx * 1.7 + t)) - 0.5);
    c += pow(1.0 - min(f.x, f.y) * 2.0, 6.0) * (0.6 - fi * 0.15);
  }
  return c;
}

bool foliageFlag(uint f) { return (f & 1u) != 0u; }

void main() {
  float depth = texture(u_depth, v_uv).r;
  if (depth >= 1.0) { o = vec4(0.0); return; }
  vec4 a = texture(g0, v_uv);
  vec4 n = texture(g1, v_uv);
  vec4 m = texture(g2, v_uv);
  vec4 l = texture(g3, v_uv);
  vec4 vp = u_projInv * vec4(v_uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vp /= vp.w;
  vec3 rel = u_viewInvRot * vp.xyz;
  float dist = length(rel);
  vec3 V = -rel / dist;
  vec3 albedo = a.rgb * a.rgb;
  float sss = a.a;
  vec3 N = normalize(n.xyz);
  float rough = n.w;
  float metal = m.r;
  float emis = m.g;
  float vao = m.b;
  uint flags = uint(m.a * 255.0 + 0.5);
  float skyL = l.r * u_skyLightScale;
  vec3 bl = l.gba;
  float ssao = texture(u_ssao, v_uv).r;
  float ao = vao * ssao;
  float noise = ignT(gl_FragCoord.xy, u_frame);
  vec3 wpos = rel + u_cameraPos;

  // ---------------- rain wetness & puddles (exposed surfaces only)
  if (u_wetness > 0.001 && (flags & 16u) == 0u) {
    float exposure = smoothstep(0.86, 0.97, l.r);
    float up = smoothstep(0.55, 0.95, N.y);
    float wet = u_wetness * exposure;
    if (wet > 0.001) {
      float pn = vnoise(wpos.xz * 0.31) * 0.65 + vnoise(wpos.xz * 1.37) * 0.35;
      float cavity = 1.0 - vao;
      float puddle = up * smoothstep(0.5, 0.68, pn + cavity * 0.35 + (u_wetness - 0.5) * 0.25) * step(rough, 0.97) * (foliageFlag(flags) ? 0.0 : 1.0);
      float porous = smoothstep(0.35, 0.9, rough) * (1.0 - metal);
      albedo *= mix(1.0, 0.58, wet * porous * (foliageFlag(flags) ? 0.4 : 1.0));
      rough = mix(rough, foliageFlag(flags) ? rough * 0.75 : 0.32, wet * 0.7);
      if (puddle > 0.0) {
        // rain ripples
        vec2 cell = floor(wpos.xz * 3.0);
        vec2 f = fract(wpos.xz * 3.0) - 0.5;
        float t = fract(u_time * 0.9 + hash12(cell) * 7.0);
        float ring = sin((length(f + (hash22(cell) - 0.5) * 0.4) - t * 0.6) * 40.0) * (1.0 - t) * smoothstep(0.0, 0.1, t);
        vec3 pN = normalize(vec3(f.x * ring * 0.08, 1.0, f.y * ring * 0.08));
        N = normalize(mix(N, pN, puddle * wet));
        rough = mix(rough, 0.02, puddle * wet);
        albedo *= mix(1.0, 0.82, puddle * wet);
      }
    }
  }

  vec3 L = u_lightDir;
  vec3 H = normalize(V + L);
  float NoL = dot(N, L);
  float NoV = max(dot(N, V), 1e-3);
  float NoH = max(dot(N, H), 0.0);
  float LoH = max(dot(L, H), 0.0);
  float alpha = max(rough * rough, 0.002);
  vec3 f0 = mix(vec3(0.04), albedo, metal);
  vec3 diffColor = albedo * (1.0 - metal);

  // ---------------- direct sun / moon
  float shadow = 0.0;
  vec3 direct = vec3(0.0);
  bool foliage = (flags & 1u) != 0u;
  if ((NoL > 0.0 || sss > 0.0) && dot(u_lightColor, u_lightColor) > 1e-8) {
    shadow = sampleShadow(rel, N, L, noise, sss);
    shadow *= atmo_cloudShadow(rel + u_cameraPos);
    // prevent leaks into closed caves beyond the shadow range
    shadow *= smoothstep(0.02, 0.35, l.r);
    if (NoL > 0.0) {
      vec3 F = F_Schlick(f0, LoH);
      float D = D_GGX(NoH, alpha);
      float Vis = V_SmithGGXCorrelated(NoV, NoL, alpha);
      vec3 spec = D * Vis * F;
      vec3 diff = diffColor * Fd_Burley(NoV, NoL, LoH, rough);
      direct += (diff * (1.0 - F) + spec) * NoL;
    }
    if (sss > 0.0) {
      float VoL = dot(V, -L);
      float phase = 0.25 + 1.6 * pow(max(VoL, 0.0), 6.0);
      float wrap = max(0.0, (-NoL + 0.6) / 1.6);
      direct += diffColor * sss * (wrap * 0.35 + phase * 0.5) / PI;
    }
    direct *= u_lightColor * shadow;
    if ((flags & 2u) != 0u) {
      // submerged surfaces: caustics + absorption
      vec3 wp = rel + u_cameraPos;
      direct *= (0.35 + 1.3 * caustics(wp, u_time)) * vec3(0.55, 0.8, 0.9);
    }
  }

  // ---------------- ambient (sky)
  float skyVis = skyL * skyL;
  vec3 irr = shIrradiance(N, u_sh);
  float bounce = max(0.0, -N.y) * 0.5 + 0.5;
  vec3 ambient = diffColor * irr / PI * skyVis * ao;
  // cheap bounce light from sunlit ground
  ambient += diffColor * u_lightColor * 0.018 * skyVis * ao * bounce * (0.5 + 0.5 * max(L.y, 0.0));
  // dimension ambient (nether/end have no sky)
  ambient += diffColor * u_dimAmbient * ao;

  // ---------------- block light (coloured)
  vec3 blk = blockLightRadiance(bl);
  float flick = 1.0 + 0.04 * sin(u_time * 9.0 + rel.x * 0.7) * sin(u_time * 6.3 + rel.z * 0.5);
  vec3 blockDiffuse = diffColor * blk * flick * mix(1.0, ao, 0.8);
  // subtle block light specular
  vec3 blockSpec = blk * envBRDFApprox(f0, max(rough, 0.35), NoV) * 0.15 * ao;

  // ---------------- specular ambient (sky reflections + SSR)
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) * 0.85 + 0.15 * R.y;
  vec3 env = mix(atmo_skyRadiance(normalize(R)), irr / PI, smoothstep(0.2, 0.9, rough));
  vec4 ssrHit = vec4(0.0);
  if (u_ssrEnabled > 0.5 && u_hasPrev > 0.5 && rough < 0.45 && dist < 160.0) {
    vec3 vN = normalize(mat3(u_viewMat) * N);
    vec3 vR = normalize(reflect(normalize(vp.xyz), vN));
    ssrHit = traceSSR(vp.xyz, vR, noise, rough);
  }
  float specOcc = clamp(pow(NoV + ao, exp2(-16.0 * rough - 1.0)) - 1.0 + ao, 0.0, 1.0);
  vec3 specAmb = (env * skyVis * (1.0 - ssrHit.a) + ssrHit.rgb * ssrHit.a) * envBRDFApprox(f0, rough, NoV) * specOcc;

  // ---------------- emissive
  vec3 emissive = albedo * emis * EMISSIVE_SCALE;
  if ((flags & 16u) != 0u) emissive = albedo * 3.0;

  // minimum ambient so unlit caves are not pitch black (Minecraft keeps a faint floor)
  vec3 floorAmb = diffColor * (u_minAmbient + u_nightVision * 0.6) * mix(1.0, ao, 0.5);

  vec3 color = direct + ambient + blockDiffuse + blockSpec + specAmb + emissive + floorAmb;

  // ---------------- fog / aerial perspective
  if (u_underwater > 0.5) {
    vec3 absorb = exp(-dist * vec3(0.32, 0.11, 0.07));
    color = color * absorb + u_waterFog * (1.0 - exp(-dist * 0.08));
  } else {
    color = atmo_applyFog(color, -V, dist);
  }
  o = vec4(color, 1.0);
}
`;
  return shaderPass(frag, uniforms);
}
