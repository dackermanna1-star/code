// GoldSrc-style studio model lighting shared by player models and world weapons.
//   colour = tex * (ambient + shade * max(0, dot(n, dirToLight)))
// Lighting is evaluated per vertex (Gouraud), like the 2003 software/GL renderers.
import * as THREE from 'three';

const VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
#include <fog_pars_vertex>
uniform vec3 uAmbient;
uniform vec3 uShade;
uniform vec3 uLightDir;   // three.js world space, unit, toward the light
varying vec2 vUv;
varying vec3 vLight;
void main() {
  vUv = uv;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  #include <fog_vertex>
  vec3 n = normalize(mat3(modelMatrix) * objectNormal);
  vLight = uAmbient + uShade * max(0.0, dot(n, uLightDir));
}
`;

const FRAG = /* glsl */`
uniform sampler2D map;
uniform sampler2D woundMap; // per-player bullet wounds / blood (src/game/wounds.js), same UVs
uniform float uWound;
uniform sampler2D glowMap; // self-lit parts (zombie bosses: embers, pustules, eyes), same UVs
uniform vec3 uGlow;
uniform float uChar;       // burnt black by fire (0..1)
varying vec2 vUv;
varying vec3 vLight;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(map, vUv);
  if (uWound > 0.5) {
    vec4 w = texture2D(woundMap, vUv);
    t.rgb = mix(t.rgb, w.rgb, w.a);
  }
#ifdef TRANSLUCENT
  gl_FragColor = vec4(t.rgb * vLight, t.a);
#else
  if (t.a < 0.5) discard;
  vec3 c = t.rgb * mix(vec3(1.0), vec3(0.16, 0.13, 0.11), uChar) * vLight;
  if (uGlow.x + uGlow.y + uGlow.z > 0.0) c += texture2D(glowMap, vUv).rgb * uGlow;
  gl_FragColor = vec4(c, 1.0);
#endif
  #include <fog_fragment>
}
`;

const DEFAULT_DIR = new THREE.Vector3(0.35, 0.25, 0.9).normalize();

/** Light uniforms; share the object between several materials to light them identically. */
export function createLightUniforms() {
  const u = {
    uAmbient: { value: new THREE.Vector3(0.75, 0.75, 0.75) },
    uShade: { value: new THREE.Vector3(0.45, 0.45, 0.45) },
    uLightDir: { value: new THREE.Vector3() },
    dirGS: DEFAULT_DIR.clone(), // not a GL uniform (no .value), kept for re-projection
  };
  gsDirToWorld(u.dirGS, null, u.uLightDir.value);
  return u;
}

/** GoldSrc-space direction -> three world direction, using the GS-space parent's world matrix. */
export function gsDirToWorld(dirGS, gsParent, out) {
  out.copy(dirGS);
  if (gsParent && gsParent.matrixWorld) out.transformDirection(gsParent.matrixWorld);
  else out.set(dirGS.x, dirGS.z, -dirGS.y).normalize(); // world group: rotation.x = -PI/2
  return out;
}

export function setLightUniforms(u, ambient, shade, dirGS, gsParent) {
  if (ambient) u.uAmbient.value.set(ambient[0], ambient[1], ambient[2]);
  if (shade) u.uShade.value.set(shade[0], shade[1], shade[2]);
  if (dirGS) {
    if (Array.isArray(dirGS)) u.dirGS.set(dirGS[0], dirGS[1], dirGS[2]);
    else u.dirGS.copy(dirGS);
    if (u.dirGS.lengthSq() < 1e-8) u.dirGS.set(0, 0, 1);
    u.dirGS.normalize();
  }
  gsDirToWorld(u.dirGS, gsParent, u.uLightDir.value);
}

export function createGsMaterial(map, lightUniforms, translucent = false) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  uniforms.map = { value: map };
  uniforms.uAmbient = lightUniforms.uAmbient;
  uniforms.uShade = lightUniforms.uShade;
  uniforms.uLightDir = lightUniforms.uLightDir;
  uniforms.woundMap = { value: null };
  uniforms.uWound = { value: 0 };
  uniforms.glowMap = { value: null };
  uniforms.uGlow = { value: new THREE.Vector3(0, 0, 0) };
  uniforms.uChar = { value: 0 };
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: true });
  m.name = 'gs-studio';
  if (translucent) {
    m.defines = { TRANSLUCENT: '' };
    m.transparent = true;
    m.depthWrite = false;
    m.name = 'gs-studio-translucent';
  }
  return m;
}

/** GoldSrc GL texture filtering. */
export function canvasTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapNearestFilter;
  t.generateMipmaps = true;
  t.anisotropy = 1;
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}
