// Rigid-skinning entity material: every vertex follows one of up to 11 bone matrices (uniform array)
// and belongs to a visibility group (bit mask). Lighting identical to createEntityMaterial
// (same uniform names, so setEntityLight / setEntityTint / setEntityOpacity work on it).
import * as THREE from 'three';
import { LIGHTING_GLSL, globalUniforms } from '../../render/materials.js';
import { NUM_BONES } from './layout.js';

const VERT = /* glsl */ `
in float aBone;
in float aGroup;
uniform mat4 uBones[${NUM_BONES}];
uniform int uHidden;
out vec2 vUv;
out vec3 vWorldPos;
out vec3 vNormal;
void main() {
  int g = int(aGroup + 0.5);
  if (((uHidden >> g) & 1) != 0) {
    vUv = vec2(0.0); vWorldPos = vec3(0.0); vNormal = vec3(0.0, 1.0, 0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume -> culled
    return;
  }
  mat4 B = uBones[int(aBone + 0.5)];
  vec4 wp = modelMatrix * (B * vec4(position, 1.0));
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * (mat3(B) * normal));
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
uniform sampler2D map;
uniform vec3 uColor;
uniform vec2 uEntityLight;
uniform vec4 uTint;
uniform float uOpacity;
uniform float uAlphaTest;
uniform float uNoFog;
uniform float uEmissive;
uniform float uGlow;
in vec2 vUv;
in vec3 vWorldPos;
in vec3 vNormal;
out vec4 fragColor;
void main() {
  vec4 tex = texture(map, vUv);
  if (tex.a < uAlphaTest) discard;
  // base-layer alpha ~0.9 marks glowing pixels (eyes)
  float glow = (tex.a < 0.96 && tex.a > 0.8) ? 1.0 : 0.0;
  vec3 albedo = tex.rgb * uColor;
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  // cheap occlusion: downward faces slightly darker
  float ao = 0.88 + 0.12 * clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 lit = computeLighting(vWorldPos, n, uEntityLight.x, uEntityLight.y, ao);
  vec3 col = albedo * lit + albedo * uEmissive + tex.rgb * glow * uGlow;
  col = mix(col, uTint.rgb, uTint.a);
  if (uNoFog < 0.5) col = applyFog(col, vWorldPos);
  fragColor = vec4(col, uOpacity);
}
`;

/**
 * @param map THREE.Texture (skin)
 * @returns ShaderMaterial with .uniforms.uBones.value (Float32Array 16*NUM_BONES) and .uniforms.uHidden
 */
export function createSkinnedMaterial(map, opts = {}) {
  const bones = new Float32Array(16 * NUM_BONES);
  for (let i = 0; i < NUM_BONES; i++) { bones[i * 16] = bones[i * 16 + 5] = bones[i * 16 + 10] = bones[i * 16 + 15] = 1; }
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      ...globalUniforms,
      map: { value: map },
      uUseMap: { value: 1 },
      uColor: { value: new THREE.Color(opts.color ?? 0xffffff) },
      uEntityLight: { value: new THREE.Vector2(1, 0) },
      uTint: { value: new THREE.Vector4(1, 0, 0, 0) },
      uOpacity: { value: 1 },
      uAlphaTest: { value: 0.5 },
      uNoFog: { value: 0 },
      uEmissive: { value: 0 },
      uGlow: { value: opts.glow ?? 1.6 },
      uBones: { value: bones },
      uHidden: { value: 0 },
    },
  });
  mat.isEntityMaterial = true;
  return mat;
}

/** Skin DataTexture from RGBA pixel data (row 0 = top of the image). */
export function createSkinTexture(data, size = 64) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}
