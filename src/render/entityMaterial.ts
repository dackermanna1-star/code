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
uniform vec4 u_wounds[8];
uniform float u_woundCount;
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
  vec3 albedo = srgbToLinear(tex.rgb) * u_color * v_color;
  float rough = u_roughness;
  // bruises & wounds
  for (int i = 0; i < 8; i++) {
    if (float(i) >= u_woundCount) break;
    vec4 w = u_wounds[i];
    float d = length(v_local - w.xyz);
    float r = 0.06 + 0.1 * fract(w.w);
    float sev = floor(w.w) / 10.0;
    float bruise = smoothstep(r * 2.2, r * 0.6, d) * min(1.0, sev * 1.5);
    float wound = smoothstep(r * 0.7, r * 0.25, d + vnoise3(v_local * 40.0) * 0.02) * step(0.35, sev);
    vec3 bruiseCol = u_bloodType == 2.0 ? vec3(0.2, 0.4, 0.1) : u_bloodType == 3.0 ? vec3(0.25, 0.1, 0.3) : vec3(0.32, 0.12, 0.16);
    vec3 woundCol = u_bloodType == 2.0 ? vec3(0.15, 0.45, 0.08) : u_bloodType == 3.0 ? vec3(0.35, 0.05, 0.45) : vec3(0.28, 0.01, 0.01);
    if (u_bloodType != 1.0) {
      albedo = mix(albedo, albedo * bruiseCol * 2.0, bruise * 0.55);
      albedo = mix(albedo, woundCol, wound);
      rough = mix(rough, 0.25, wound);
    } else {
      albedo = mix(albedo, albedo * 0.55, bruise * 0.6);
    }
  }
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
      u_woundCount: { value: 0 },
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
