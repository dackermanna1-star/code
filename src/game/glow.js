// Through-wall silhouettes: a second skinned mesh sharing the character's skeleton,
// drawn flat-coloured only where it is occluded (depthFunc = GreaterDepth).
import * as THREE from 'three';
import { G } from '../engine/ps1material.js';

const vs = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
uniform vec2 uSnapRes;
void main() {
  #include <begin_vertex>
  #include <skinbase_vertex>
  #include <skinning_vertex>
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  if (clip.w > 0.05) clip.xy = floor(clip.xy / clip.w * uSnapRes + 0.5) / uSnapRes * clip.w;
  gl_Position = clip;
}`;
const fs = /* glsl */`
uniform vec3 uGlow; uniform float uAlpha;
void main() { gl_FragColor = vec4(uGlow, uAlpha); }`;

export function makeGlowMaterial(color, alpha = 0.55) {
  return new THREE.ShaderMaterial({
    uniforms: { uGlow: { value: new THREE.Color(...color) }, uAlpha: { value: alpha }, uSnapRes: G.uSnapRes },
    vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, depthFunc: THREE.GreaterDepth,
  });
}

export function makeGlowMesh(rig, color) {
  const m = new THREE.SkinnedMesh(rig.mesh.geometry, makeGlowMaterial(color));
  m.bind(rig.skeleton, rig.mesh.bindMatrix);
  m.frustumCulled = false;
  m.renderOrder = 20;
  // follow the character: copy world transform each frame
  m.matrixAutoUpdate = false;
  m.onBeforeRender = () => { m.matrixWorld.copy(rig.mesh.matrixWorld); m.bindMatrix.copy(rig.mesh.bindMatrix); m.bindMatrixInverse.copy(rig.mesh.bindMatrixInverse); };
  return m;
}

/** Glow for static meshes (items). Uses a plain (non skinned) variant. */
const vs2 = /* glsl */`
uniform vec2 uSnapRes;
void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position * 1.08, 1.0);
  if (clip.w > 0.05) clip.xy = floor(clip.xy / clip.w * uSnapRes + 0.5) / uSnapRes * clip.w;
  gl_Position = clip;
}`;
export function makeItemGlowMaterial(color, alpha = 0.6) {
  return new THREE.ShaderMaterial({
    uniforms: { uGlow: { value: new THREE.Color(...color) }, uAlpha: { value: alpha }, uSnapRes: G.uSnapRes },
    vertexShader: vs2, fragmentShader: fs, transparent: true, depthWrite: false, depthTest: true, side: THREE.BackSide,
  });
}
