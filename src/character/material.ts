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
  /** Game time the wound was made (blood dries, bruises deepen as they mature). */
  born?: number;
}

/** Seconds for a wound to fully mature: a bruise to deepen, blood to dry. */
export const WOUND_MATURE = [26, 9, 20];
/** Shader code for a wound's type and maturity at time `now` (type + maturity * 0.4). */
export function woundCode(w: Wound, now: number) {
  const age = w.born === undefined ? 1e9 : Math.max(0, now - w.born);
  return w.type + Math.min(1, age / WOUND_MATURE[w.type]) * 0.4;
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

/**
 * Wound evaluation in bind-pose space. info = (type + maturity * 0.4, intensity, seed, drip length).
 * Type 0 is an open wound: a laceration (a short dark slit with the seed's direction) in a smear of
 * blood, with a run of blood down the body that beads at its end; fresh blood is bright and glossy
 * and dries darker and matte as it matures. Type 1 is a bruise: mottled, red and swollen at first,
 * deepening to a purple core as it matures. Type 2 is a spatter of someone else's blood.
 */
const WOUND_EVAL_GLSL = /* glsl */ `
void lsWound(vec4 w, vec4 info, vec3 bp, inout float blood, inout float bruise, inout float cut, inout float fresh, inout float bAge) {
  float r = w.w;
  vec3 dv = bp - w.xyz;
  float typ = floor(info.x + 0.05);
  float mat = clamp((info.x - typ) / 0.4, 0.0, 1.0);
  float n = lsFbm(bp * 55.0 + info.z * 13.7);
  if (typ < 0.5) {
    float d = length(dv);
    float m = 1.0 - smoothstep(r * 0.3, r, d + (n - 0.5) * r * 0.9);
    // the laceration
    vec3 sd = normalize(vec3(sin(info.z * 2.3), cos(info.z * 1.7) * 0.5, cos(info.z * 2.3)));
    float al = dot(dv, sd);
    float pd = length(dv - sd * al);
    float L = r * 0.6;
    float tip = 1.0 - smoothstep(L * 0.55, L, abs(al));
    float slit = (1.0 - smoothstep(r * 0.04, r * 0.11, pd + (lsNoise(bp * 320.0 + info.z) - 0.5) * r * 0.06)) * tip;
    cut = max(cut, slit * info.y);
    // blood running down the body (bind -Y): measured across the surface, wavering, beading at the end
    float down = -dv.y;
    if (info.w > 0.0 && down > -r * 0.2) {
      vec2 outward = length(w.xz) > 1e-3 ? normalize(w.xz) : vec2(0.0, 1.0);
      float across = dot(dv.xz, vec2(-outward.y, outward.x)) + (lsNoise(vec3(bp.y * 45.0, info.z, 0.0)) - 0.5) * 0.012;
      float len = info.w * (0.65 + 0.35 * lsNoise(vec3(info.z, 3.1, 0.0)));
      float wdt = 0.0045 + r * 0.09;
      float run = (1.0 - smoothstep(wdt * 0.55, wdt, abs(across))) * (1.0 - smoothstep(len * 0.82, len, down)) * step(0.0, down);
      float bead = 1.0 - smoothstep(wdt * 0.9, wdt * 1.7, length(vec2(across, down - len * 0.93)));
      m = max(m, max(run, bead) * 0.95);
    }
    blood = max(blood, m * info.y);
    fresh = max(fresh, m * info.y * (1.0 - mat));
  } else if (typ < 1.5) {
    float d = length(dv);
    float mott = lsNoise(bp * 170.0 + info.z) * 0.55 + lsNoise(bp * 48.0 + info.z * 3.0) * 0.45;
    float m = 1.0 - smoothstep(r * 0.15, r, d + (n - 0.5) * r * 0.6 + (mott - 0.5) * r * 0.4);
    bruise = max(bruise, m * info.y);
    bAge = max(bAge, mat * m);
  } else {
    float d = length(dv);
    float sp = smoothstep(0.66, 0.74, lsNoise(bp * 95.0 + info.z * 7.1)) * smoothstep(0.35, 0.6, lsNoise(bp * 23.0 + info.z));
    float m = sp * (1.0 - smoothstep(r * 0.4, r, d)) * 0.85;
    blood = max(blood, m * info.y);
    fresh = max(fresh, m * info.y * (1.0 - mat) * 0.6);
  }
}
`;

const APPLY_GLSL = /* glsl */ `
  bruise *= vSkin;
  float br = clamp(bruise, 0.0, 1.0);
  // fresh: hot red swelling; maturing: a deep purple-blue core inside a red-brown rim
  vec3 inflamed = vec3(0.95, 0.5, 0.47);
  vec3 deep = vec3(0.4, 0.2, 0.44);
  vec3 bcol = mix(inflamed, deep, smoothstep(0.2, 0.85, br) * (0.25 + 0.75 * bAge));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * bcol, br * 0.92);
  float bl = clamp(blood, 0.0, 1.0);
  float fr = clamp(fresh, 0.0, 1.0);
  vec3 wet = mix(vec3(0.42, 0.014, 0.012), vec3(0.16, 0.0, 0.0), bl * bl);
  vec3 dried = mix(vec3(0.2, 0.025, 0.015), vec3(0.08, 0.008, 0.004), bl * bl);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(dried, wet, smoothstep(0.0, 0.6, fr)), bl * 0.95);
  // the open cut: a dark, wet slit
  float ct = clamp(cut, 0.0, 1.0) * mix(0.6, 1.0, vSkin);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.0, 0.0), ct);
  lsBloodAmt = max(bl, ct);
  lsWet = max(fr, ct);
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
float lsWet = 0.0;
// 4x4 ordered-dither threshold for the screen pixel
float lsBayer4(vec2 fc) {
  ivec2 q = ivec2(mod(fc, 4.0));
  const float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return (m[q.x + q.y * 4] + 0.5) / 16.0;
}
${NOISE_GLSL}
${WOUND_EVAL_GLSL}
`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
{
  // a body right in front of the lens (one flung at the camera, a corpse the camera backs into)
  // dissolves instead of filling the screen
  float lsNear = 1.0 - smoothstep(0.3, 0.85, length(vViewPosition));
  if (lsNear > 0.0 && lsNear > lsBayer4(gl_FragCoord.xy)) discard;
}
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
  float cut = 0.0;
  float fresh = 0.0;
  float bAge = 0.0;
  ${
    corpse
      ? `for (int i = 0; i < ${MAX_WOUNDS}; i++) {
    vec4 w = texelFetch(uCorpseWounds, ivec2(i * 2, vCorpseId), 0);
    if (w.w <= 0.0) break;
    vec4 info = texelFetch(uCorpseWounds, ivec2(i * 2 + 1, vCorpseId), 0);
    lsWound(w, info, vBindPos, blood, bruise, cut, fresh, bAge);
  }`
      : `for (int i = 0; i < ${MAX_WOUNDS}; i++) {
    if (i >= uWoundCount) break;
    lsWound(uWounds[i], uWoundInfo[i], vBindPos, blood, bruise, cut, fresh, bAge);
  }`
  }
  ${APPLY_GLSL}
}
`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, mix(0.55, 0.2, lsWet), lsBloodAmt);
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
export function writeWounds(u: CharacterMaterialUniforms, wounds: Wound[], now = 0) {
  const n = Math.min(wounds.length, MAX_WOUNDS);
  for (let i = 0; i < n; i++) {
    const w = wounds[i];
    u.uWounds.value[i].set(w.pos.x, w.pos.y, w.pos.z, w.radius);
    u.uWoundInfo.value[i].set(woundCode(w, now), w.intensity, w.seed, w.drip);
  }
  u.uWoundCount.value = n;
}
