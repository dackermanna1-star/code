// GoldSrc-style "studio model" material for view models.
//
// Per-vertex lighting with a fixed light coming from the upper left (and a bit
// from behind the viewer), using Half-Life's wrapped hemispherical formula
// (R_StudioLighting, lambert = 1.5):
//   illum = ambient + shade * (1 - clamp((dot(N, Ldir) + 0.5) / 1.5, 0, 1))
// The result is multiplied by the texture, the per-vertex tint and the world
// light sampled under the player (setLight). No PBR, no colour management.

import * as THREE from 'three';
import { getTexture } from './textures.js';

const vertexShader = /* glsl */ `
uniform vec3 uLightDir;
uniform float uAmb;
uniform float uShade;
uniform float uUvScale;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vec3 n = normalize(normalMatrix * normal);
  float c = dot(n, uLightDir);
  float l = clamp((c + 0.5) / 1.5, 0.0, 1.0);
  float illum = uAmb + uShade * (1.0 - l);
  vCol = color * illum;
  vUv = uv * uUvScale;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform vec3 uLight;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vec3 t = texture2D(map, vUv).rgb;
  gl_FragColor = vec4(min(t * vCol * uLight, vec3(1.0)), 1.0);
}`;

// Light travels from upper-left-behind the viewer toward lower-right-forward.
export const LIGHT_DIR = new THREE.Vector3(0.5, -0.78, -0.38).normalize();

// One shared uniform block per ViewModel instance so setLight() is O(1).
export function makeSharedUniforms() {
  return {
    uLight: { value: new THREE.Vector3(1, 1, 1) },
    uLightDir: { value: LIGHT_DIR.clone() },
    uAmb: { value: 0.5 },
    uShade: { value: 0.62 },
  };
}

export function makeStudioMaterial(texKey, shared) {
  const { tex, unit } = getTexture(texKey);
  return new THREE.ShaderMaterial({
    name: `vm_${texKey}`,
    uniforms: {
      map: { value: tex },
      uUvScale: { value: unit ? 1 / unit : 1 },
      uLight: shared.uLight,
      uLightDir: shared.uLightDir,
      uAmb: shared.uAmb,
      uShade: shared.uShade,
    },
    vertexShader,
    fragmentShader,
    vertexColors: true,
    side: THREE.FrontSide,
    fog: false,
    lights: false,
  });
}
