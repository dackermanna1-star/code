import * as THREE from 'three';

export const MAX_WOUNDS = 16;

export type WoundType = 0 | 1 | 2; // 0 blood/cut, 1 bruise, 2 splatter speckles
export interface Wound {
  pos: THREE.Vector3; // bind-pose (rest character space)
  radius: number;
  type: WoundType;
  intensity: number;
  drip: number; // drip length (m)
  seed: number;
}

/** GLSL helpers shared by character, corpse and prop shaders. */
export const NOISE_GLSL = /* glsl */ `
float lsHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float lsNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lsHash(i + vec3(0, 0, 0)), lsHash(i + vec3(1, 0, 0)), f.x),
                 mix(lsHash(i + vec3(0, 1, 0)), lsHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(lsHash(i + vec3(0, 0, 1)), lsHash(i + vec3(1, 0, 1)), f.x),
                 mix(lsHash(i + vec3(0, 1, 1)), lsHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float lsFbm(vec3 p) {
  return lsNoise(p) * 0.55 + lsNoise(p * 2.13) * 0.3 + lsNoise(p * 4.37) * 0.15;
}
`;

const WOUND_EVAL_GLSL = /* glsl */ `
void lsWound(vec4 w, vec4 info, vec3 bp, inout float blood, inout float bruise) {
  float r = w.w;
  vec3 dv = bp - w.xyz;
  float n = lsFbm(bp * 55.0 + info.z * 13.7);
  if (info.x < 0.5) {
    float d = length(dv);
    float m = 1.0 - smoothstep(r * 0.35, r, d + (n - 0.5) * r * 0.9);
    // drip streak running down (bind space -Y)
    float down = -dv.y;
    if (info.w > 0.0 && down > 0.0) {
      float lateral = length(dv.xz) + (lsNoise(bp * 140.0 + info.z) - 0.5) * 0.012;
      float streak = (1.0 - smoothstep(0.006, 0.016 + r * 0.12, lateral)) * (1.0 - smoothstep(info.w * 0.5, info.w, down + n * 0.03));
      m = max(m, streak * 0.9);
    }
    blood = max(blood, m * info.y);
  } else if (info.x < 1.5) {
    float d = length(dv);
    float m = 1.0 - smoothstep(r * 0.2, r, d + (n - 0.5) * r * 0.6);
    bruise = max(bruise, m * info.y);
  } else {
    float d = length(dv);
    float sp = smoothstep(0.66, 0.74, lsNoise(bp * 95.0 + info.z * 7.1)) * smoothstep(0.35, 0.6, lsNoise(bp * 23.0 + info.z));
    float m = sp * (1.0 - smoothstep(r * 0.4, r, d)) * 0.85;
    blood = max(blood, m * info.y);
  }
}
`;

const APPLY_GLSL = /* glsl */ `
  bruise *= vSkin;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.52, 0.36, 0.5), clamp(bruise, 0.0, 1.0) * 0.85);
  float bl = clamp(blood, 0.0, 1.0);
  vec3 bloodCol = mix(vec3(0.22, 0.01, 0.008), vec3(0.09, 0.0, 0.0), bl * bl);
  diffuseColor.rgb = mix(diffuseColor.rgb, bloodCol, bl * 0.94);
  lsBloodAmt = bl;
`;

export interface CharacterMaterialUniforms {
  uWounds: { value: THREE.Vector4[] };
  uWoundInfo: { value: THREE.Vector4[] };
  uWoundCount: { value: number };
  uRim: { value: THREE.Vector4 };
  uFlash: { value: number };
  uLayer: { value: number };
  uAtlas: { value: THREE.DataArrayTexture | null };
}

/**
 * MeshStandardMaterial patched with: diffuse from a shared texture array (one layer per outfit variant),
 * wound/bruise evaluation in bind-pose space, wet blood roughness and a rim light.
 * `corpse` variant reads layer/wounds per-vertex/per-corpse (static baked batches).
 */
export function createCharacterMaterial(atlas: THREE.DataArrayTexture, corpse = false) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.0 });
  const uniforms: CharacterMaterialUniforms = {
    uWounds: { value: Array.from({ length: MAX_WOUNDS }, () => new THREE.Vector4(0, -10, 0, 0)) },
    uWoundInfo: { value: Array.from({ length: MAX_WOUNDS }, () => new THREE.Vector4()) },
    uWoundCount: { value: 0 },
    uRim: { value: new THREE.Vector4(0.4, 0.55, 0.8, 0.0) },
    uFlash: { value: 0 },
    uLayer: { value: 0 },
    uAtlas: { value: atlas },
  };
  const corpseUniforms = {
    uCorpseWounds: { value: null as THREE.DataTexture | null },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (corpse) Object.assign(shader.uniforms, corpseUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aSkin;
varying float vSkin;
varying vec3 vBindPos;
varying vec2 vCharUv;
${corpse ? 'attribute vec3 aBindPos;\nattribute float aCorpseId;\nattribute float aLayer;\nflat varying int vCorpseId;\nflat varying float vLayer;' : ''}
`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vSkin = aSkin;
vCharUv = uv;
${corpse ? 'vBindPos = aBindPos; vCorpseId = int(aCorpseId + 0.5); vLayer = aLayer;' : 'vBindPos = position;'}
`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
precision highp sampler2DArray;
varying float vSkin;
varying vec3 vBindPos;
varying vec2 vCharUv;
uniform vec4 uRim;
uniform float uFlash;
uniform sampler2DArray uAtlas;
${corpse ? 'flat varying int vCorpseId;\nflat varying float vLayer;\nuniform highp sampler2D uCorpseWounds;' : `uniform float uLayer;\nuniform vec4 uWounds[${MAX_WOUNDS}];\nuniform vec4 uWoundInfo[${MAX_WOUNDS}];\nuniform int uWoundCount;`}
float lsBloodAmt = 0.0;
${NOISE_GLSL}
${WOUND_EVAL_GLSL}
`,
      )
      .replace(
        '#include <map_fragment>',
        `{
  vec4 texel = texture(uAtlas, vec3(vCharUv, ${corpse ? 'vLayer' : 'uLayer'}));
  diffuseColor *= texel;
}
{
  float blood = 0.0;
  float bruise = 0.0;
  ${
    corpse
      ? `for (int i = 0; i < ${MAX_WOUNDS}; i++) {
    vec4 w = texelFetch(uCorpseWounds, ivec2(i * 2, vCorpseId), 0);
    if (w.w <= 0.0) break;
    vec4 info = texelFetch(uCorpseWounds, ivec2(i * 2 + 1, vCorpseId), 0);
    lsWound(w, info, vBindPos, blood, bruise);
  }`
      : `for (int i = 0; i < ${MAX_WOUNDS}; i++) {
    if (i >= uWoundCount) break;
    lsWound(uWounds[i], uWoundInfo[i], vBindPos, blood, bruise);
  }`
  }
  ${APPLY_GLSL}
}
`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.22, lsBloodAmt);
`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  vec3 vdir = normalize(vViewPosition);
  float rim = pow(1.0 - clamp(abs(dot(normalize(normal), vdir)), 0.0, 1.0), 2.5);
  outgoingLight += uRim.rgb * rim * uRim.w;
  outgoingLight = mix(outgoingLight, vec3(1.0, 0.95, 0.9), uFlash * 0.6);
}
#include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => (corpse ? 'ls-corpse' : 'ls-char');
  return { material: mat, uniforms, corpseUniforms };
}

/** Write wounds into uniform arrays. */
export function writeWounds(u: CharacterMaterialUniforms, wounds: Wound[]) {
  const n = Math.min(wounds.length, MAX_WOUNDS);
  for (let i = 0; i < n; i++) {
    const w = wounds[i];
    u.uWounds.value[i].set(w.pos.x, w.pos.y, w.pos.z, w.radius);
    u.uWoundInfo.value[i].set(w.type, w.intensity, w.seed, w.drip);
  }
  u.uWoundCount.value = n;
}
