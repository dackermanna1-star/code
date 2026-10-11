// World material for original BSP surfaces: texture x hlrad lightmap through the same
// light curve as the built-in map (gamma / brightness settings, see meshbuilder.js),
// alpha-tested '{' textures and translucent render modes.
import * as THREE from 'three';
import { worldUniforms } from '../map/meshbuilder.js';

export const bspUniforms = {
  lmScale: { value: 264 / 128 }, // lightstyle 'm' (264) over the 128 overbright base: byte 255 -> ~2.06
  lmGamma: worldUniforms.lightGamma,
  brightness: worldUniforms.brightness,
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
  uniform float opacity;
  uniform vec2 scroll;
  varying vec2 vUv;
  varying vec2 vLm;
  void main() {
    vec4 t = texture2D(map, vUv + scroll);
    #ifdef ALPHATEST
      if (t.a < 0.5) discard;
    #endif
    vec3 l = pow(texture2D(lightmap, vLm).rgb * lmScale, vec3(lmGamma));
    gl_FragColor = vec4(t.rgb * l * brightness, opacity);
  }
`;

/** opts: { alpha (alpha test), opacity (<1: translucent), additive, scroll: THREE.Vector2 uniform value } */
export function buildWorldMaterial(tex, lmTex, alpha, opts = {}) {
  const translucent = (opts.opacity ?? 1) < 1 || opts.additive;
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex }, lightmap: { value: lmTex }, ...bspUniforms,
      opacity: { value: opts.opacity ?? 1 }, scroll: { value: opts.scroll || new THREE.Vector2() },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: alpha ? { ALPHATEST: 1 } : {},
    transparent: translucent,
    depthWrite: !translucent,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
}
