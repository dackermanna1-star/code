// World material for original BSP surfaces: texture x hlrad lightmap, with a
// GoldSrc-like light curve (lightgamma/brightness) and alpha-tested '{' textures.
import * as THREE from 'three';

export const bspUniforms = {
  lmScale: { value: 1.0 },
  lmGamma: { value: 0.8 },
  brightness: { value: 1.0 },
};

const VERT = /* glsl */`
  attribute vec2 uv1;
  varying vec2 vUv;
  varying vec2 vLm;
  void main() {
    vUv = uv; vLm = uv1;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */`
  uniform sampler2D map;
  uniform sampler2D lightmap;
  uniform float lmScale;
  uniform float lmGamma;
  uniform float brightness;
  varying vec2 vUv;
  varying vec2 vLm;
  void main() {
    vec4 t = texture2D(map, vUv);
    #ifdef ALPHATEST
      if (t.a < 0.5) discard;
    #endif
    vec3 l = pow(texture2D(lightmap, vLm).rgb * lmScale, vec3(lmGamma));
    gl_FragColor = vec4(t.rgb * l * brightness, 1.0);
  }
`;

export function buildWorldMaterial(tex, lmTex, alpha) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, lightmap: { value: lmTex }, ...bspUniforms },
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: alpha ? { ALPHATEST: 1 } : {},
  });
}
