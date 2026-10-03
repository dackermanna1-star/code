/**
 * G-buffer material for entities (mobs, players, items, falling blocks ...). Writes the same
 * 4 MRT outputs as terrain. Supports an albedo map (sRGB), vertex colours, PBR params,
 * hurt flash (Minecraft red tint), per-entity light (sampled from the world light grid), and
 * up to 8 wound/bruise spots in model space.
 */
import * as THREE from 'three';
import { GLSL_COMMON } from './shaders/common';

const VERT = /* glsl */ `
precision highp float;
in vec3 position;
in vec3 normal;
in vec2 uv;
#ifdef USE_COLOR
in vec3 color;
#endif
#ifdef USE_SKIN
in vec4 skinIndex;
in vec4 skinWeight;
uniform mat4 u_bones[24];
#endif
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 u_viewInvRot;
out vec3 v_normal;
out vec2 v_uv;
out vec3 v_local;
out vec3 v_rel;
out vec3 v_color;
void main() {
  vec3 p = position;
  vec3 n = normal;
#ifdef USE_SKIN
  mat4 sk = u_bones[int(skinIndex.x)] * skinWeight.x + u_bones[int(skinIndex.y)] * skinWeight.y;
  p = (sk * vec4(p, 1.0)).xyz;
  n = mat3(sk) * n;
#endif
  v_local = position;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  v_rel = u_viewInvRot * mv.xyz;
  v_normal = normalize(mat3(modelMatrix) * n);
  v_uv = uv;
#ifdef USE_COLOR
  v_color = color;
#else
  v_color = vec3(1.0);
#endif
}
`;

const FRAG = /* glsl */ `
precision highp float;
${GLSL_COMMON}
uniform sampler2D u_map;
uniform float u_hasMap;
uniform vec3 u_color;
uniform float u_roughness;
uniform float u_metalness;
uniform float u_emissive;
uniform float u_sss;
uniform float u_hurt;
uniform vec4 u_light;
uniform vec4 u_wounds[8];   // xyz = rest-space position, w = type*100 + severity*10 + size (fract)
uniform vec4 u_woundDir[8]; // xyz = direction (slashes), w = growth/age 0..1
uniform float u_woundCount;
uniform float u_fade;       // 1 = opaque; < 1 dissolves (dithered) for fading corpses
uniform float u_bloodType; // 0 red blood, 1 none (skeleton), 2 green (slime/creeper), 3 purple (enderman)
uniform float u_alphaTest;
in vec3 v_normal;
in vec2 v_uv;
in vec3 v_local;
in vec3 v_rel;
in vec3 v_color;
layout(location = 0) out vec4 g0;
layout(location = 1) out vec4 g1;
layout(location = 2) out vec4 g2;
layout(location = 3) out vec4 g3;
void main() {
  vec4 tex = u_hasMap > 0.5 ? texture(u_map, v_uv) : vec4(1.0);
  if (tex.a < u_alphaTest) discard;
  if (u_fade < 0.999 && hash12(gl_FragCoord.xy) > u_fade) discard;
  vec3 albedo = srgbToLinear(tex.rgb) * u_color * v_color;
  float rough = u_roughness;
  // bruises & wounds. Type code 0 = legacy generic wound, 1 blunt bruise, 2 cut, 3 puncture, 4 burn
  float wetness = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= u_woundCount) break;
    vec4 w = u_wounds[i];
    vec4 wd = u_woundDir[i];
    float code = floor(w.w / 100.0 + 0.001);
    float rem = w.w - code * 100.0;
    float sev = floor(rem) / 10.0;
    float sz = fract(w.w);
    vec3 q = v_local - w.xyz;
    float nz = vnoise3(v_local * 40.0);
    vec3 bruiseCol = u_bloodType == 2.0 ? vec3(0.2, 0.4, 0.1) : u_bloodType == 3.0 ? vec3(0.25, 0.1, 0.3) : vec3(0.32, 0.12, 0.16);
    vec3 woundCol = u_bloodType == 2.0 ? vec3(0.15, 0.45, 0.08) : u_bloodType == 3.0 ? vec3(0.35, 0.05, 0.45) : vec3(0.28, 0.01, 0.01);
    if (code < 0.5) {
      float d = length(q);
      float r = 0.06 + 0.1 * sz;
      float bruise = smoothstep(r * 2.2, r * 0.6, d) * min(1.0, sev * 1.5);
      float wound = smoothstep(r * 0.7, r * 0.25, d + nz * 0.02) * step(0.35, sev);
      if (u_bloodType != 1.0) {
        albedo = mix(albedo, albedo * bruiseCol * 2.0, bruise * 0.55);
        albedo = mix(albedo, woundCol, wound);
        rough = mix(rough, 0.25, wound);
      } else {
        albedo = mix(albedo, albedo * 0.55, bruise * 0.6);
      }
    } else if (code < 1.5) {
      // bruise: starts reddish-purple, spreads and turns blue/dark, yellow-green fringe when old
      float d = length(q + (vec3(nz, vnoise3(v_local * 23.0), nz) - 0.5) * 0.03);
      float r = (0.05 + 0.08 * sz + 0.05 * sev) * (0.6 + 0.4 * wd.w);
      float body = smoothstep(r, r * 0.2, d);
      float fringe = smoothstep(r * 1.5, r * 0.8, d);
      vec3 young = vec3(0.34, 0.08, 0.13);
      vec3 old = vec3(0.16, 0.09, 0.26);
      vec3 bcol = u_bloodType == 2.0 ? vec3(0.18, 0.38, 0.1) : u_bloodType == 3.0 ? vec3(0.22, 0.08, 0.3) : mix(young, old, wd.w);
      float k = min(1.0, 0.35 + sev * 0.9);
      if (u_bloodType == 1.0) { albedo = mix(albedo, albedo * 0.6, body * 0.5); }
      else {
        albedo = mix(albedo, albedo * vec3(0.9, 0.85, 0.35), fringe * wd.w * 0.25 * (1.0 - body));
        albedo = mix(albedo, albedo * bcol * 2.2, body * k * 0.7);
        if (sev > 0.7) { albedo = mix(albedo, woundCol, smoothstep(r * 0.45, r * 0.1, d) * (sev - 0.6)); wetness = max(wetness, smoothstep(r * 0.45, r * 0.1, d) * 0.6); }
      }
    } else if (code < 2.5) {
      // slash: elongated along the swing direction, a deep dark core and a bruised rim
      vec3 t = normalize(wd.xyz + vec3(1e-4));
      float al = dot(q, t);
      float pp = length(q - t * al) + (nz - 0.5) * 0.01;
      float len = 0.09 + 0.12 * sz + 0.07 * sev;
      float wid = 0.011 + 0.014 * sev;
      float ends = smoothstep(len, len * 0.65, abs(al));
      float core = smoothstep(wid, wid * 0.3, pp) * ends;
      float rim = smoothstep(wid * 3.0, wid, pp) * smoothstep(len * 1.15, len * 0.6, abs(al));
      vec3 dry = mix(woundCol, vec3(0.1, 0.025, 0.015), wd.w);
      if (u_bloodType == 1.0) { albedo = mix(albedo, vec3(0.04), core * 0.85); }
      else {
        albedo = mix(albedo, albedo * bruiseCol * 1.6, rim * 0.5);
        albedo = mix(albedo, dry * (0.55 + 0.45 * smoothstep(wid * 0.6, 0.0, pp)), core);
        wetness = max(wetness, core * (1.0 - wd.w * 0.7));
      }
    } else if (code < 3.5) {
      // puncture: tiny dark hole, red ring and a blood trickle running down
      float d = length(q);
      float hr = 0.011 + 0.009 * sev;
      float hole = smoothstep(hr, hr * 0.4, d);
      float ring = smoothstep(hr * 3.2, hr, d);
      float len = 0.05 + 0.14 * sev;
      float tw = 0.007 + 0.004 * sev;
      float tri = smoothstep(tw, tw * 0.3, length(q.xz) + (nz - 0.5) * 0.008) * step(q.y, 0.0) * smoothstep(-len, -len * 0.55, q.y);
      vec3 dry = mix(woundCol, vec3(0.1, 0.025, 0.015), wd.w * 0.8);
      if (u_bloodType == 1.0) { albedo = mix(albedo, vec3(0.03), hole); }
      else {
        albedo = mix(albedo, albedo * bruiseCol * 1.5, ring * 0.35);
        albedo = mix(albedo, dry, max(ring * 0.7, tri * 0.9));
        albedo = mix(albedo, vec3(0.015, 0.0, 0.0), hole);
        wetness = max(wetness, max(ring, tri) * (1.0 - wd.w * 0.7));
      }
    } else {
      // burn: black char with a brown scorched halo and ash flecks
      float d = length(q) + (nz - 0.5) * 0.04;
      float r = 0.07 + 0.09 * sz + 0.05 * sev;
      float chr = smoothstep(r, r * 0.35, d);
      float halo = smoothstep(r * 1.5, r * 0.8, d);
      vec3 c = mix(albedo * vec3(0.55, 0.35, 0.25), vec3(0.025, 0.02, 0.018), chr);
      float ash = step(0.74, vnoise3(v_local * 95.0)) * chr * 0.5;
      c = mix(c, vec3(0.2, 0.19, 0.18), ash);
      albedo = mix(albedo, c, halo);
      rough = mix(rough, 0.95, halo);
    }
  }
  rough = mix(rough, 0.18, wetness);
  // Minecraft hurt flash (red tint overlay)
  albedo = mix(albedo, vec3(0.9, 0.08, 0.05), u_hurt * 0.55);
  vec3 N = normalize(v_normal);
  if (!gl_FrontFacing) N = -N;
  g0 = vec4(sqrt(clamp(albedo, 0.0, 1.0)), u_sss);
  g1 = vec4(N, rough);
  g2 = vec4(u_metalness, u_emissive + u_hurt * 0.04, 1.0, 4.0 / 255.0);
  g3 = u_light;
}
`;

export interface EntityMaterialOptions {
  map?: THREE.Texture | null;
  color?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  sss?: number;
  vertexColors?: boolean;
  skinned?: boolean;
  alphaTest?: number;
  bloodType?: number;
  side?: THREE.Side;
}

/** Shared per-frame uniform (camera rotation) for all entity materials. */
export const ENTITY_SHARED = { u_viewInvRot: { value: new THREE.Matrix3() } };

export function createEntityMaterial(o: EntityMaterialOptions = {}): THREE.RawShaderMaterial {
  const defines: string[] = [];
  if (o.vertexColors) defines.push('#define USE_COLOR');
  if (o.skinned) defines.push('#define USE_SKIN');
  const m = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: defines.join('\n') + '\n' + VERT,
    fragmentShader: FRAG,
    side: o.side ?? THREE.FrontSide,
    uniforms: {
      u_viewInvRot: ENTITY_SHARED.u_viewInvRot,
      u_map: { value: o.map ?? null },
      u_hasMap: { value: o.map ? 1 : 0 },
      u_color: { value: new THREE.Color(o.color ?? 0xffffff) },
      u_roughness: { value: o.roughness ?? 0.7 },
      u_metalness: { value: o.metalness ?? 0 },
      u_emissive: { value: o.emissive ?? 0 },
      u_sss: { value: o.sss ?? 0 },
      u_hurt: { value: 0 },
      u_light: { value: new THREE.Vector4(1, 0, 0, 0) },
      u_wounds: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
      u_woundDir: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 1, 0, 0)) },
      u_woundCount: { value: 0 },
      u_fade: { value: 1 },
      u_bloodType: { value: o.bloodType ?? 0 },
      u_alphaTest: { value: o.alphaTest ?? 0 },
      ...(o.skinned ? { u_bones: { value: Array.from({ length: 24 }, () => new THREE.Matrix4()) } } : {}),
    },
  });
  return m;
}

/** Depth-only material for entity shadow casting. */
export function createEntityDepthMaterial(skinned = false): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: (skinned ? '#define USE_SKIN\n' : '') + `precision highp float; in vec3 position;
#ifdef USE_SKIN
in vec4 skinIndex; in vec4 skinWeight; uniform mat4 u_bones[24];
#endif
uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix;
void main(){ vec3 p = position;
#ifdef USE_SKIN
mat4 sk = u_bones[int(skinIndex.x)] * skinWeight.x + u_bones[int(skinIndex.y)] * skinWeight.y; p = (sk * vec4(p,1.0)).xyz;
#endif
gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `precision highp float; out vec4 o; void main(){ o = vec4(1.0); }`,
    side: THREE.DoubleSide,
  });
}

/** Set per-entity light uniform from packed world light. */
export function setEntityLight(mat: THREE.RawShaderMaterial, packedLight: number) {
  const v = mat.uniforms.u_light.value as THREE.Vector4;
  v.set(((packedLight >>> 12) & 15) / 15, ((packedLight >>> 8) & 15) / 15, ((packedLight >>> 4) & 15) / 15, (packedLight & 15) / 15);
}
