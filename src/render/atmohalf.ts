/**
 * Reduced-resolution atmosphere: the atmosphere/cloud raymarch (the most
 * expensive pass on a planet with air) writes in-scattered light and
 * transmittance to a low-resolution two-target buffer, and this pass applies
 * them at full resolution: colour = scene · T + L.
 *
 * The upsampling is depth-aware: of the four nearest low-resolution samples,
 * those whose depth matches the pixel's dominate. So a mountain's silhouette
 * against a cloudy sky keeps a crisp edge, with no halo of sky colour on the
 * rock or of rock-coloured haze in the sky. Each low-resolution sample read
 * the full-resolution depth at its own centre, so the same depth is fetched
 * again here to compare against.
 */
import * as THREE from 'three';
import { FS_VERT } from './fullscreen';

const APPLY_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tL;
uniform sampler2D tT;
uniform vec2 uLowSize;
varying vec2 vUv;
void main() {
  vec3 scene = texture(tColor, vUv).rgb;
  float d0 = texture(tDepth, vUv).r;
  vec2 p = vUv * uLowSize - 0.5;
  vec2 b = floor(p), f = p - b;
  vec3 L = vec3(0.0), T = vec3(0.0);
  float wsum = 0.0;
  for (int k = 0; k < 4; k++) {
    vec2 o = vec2(float(k == 1 || k == 3), float(k >= 2));
    vec2 uv = (clamp(b + o, vec2(0.0), uLowSize - 1.0) + 0.5) / uLowSize;
    float dk = texture(tDepth, uv).r;
    float wb = mix(1.0 - f.x, f.x, o.x) * mix(1.0 - f.y, f.y, o.y);
    // log depth: a factor of two in distance is ≈ 0.011, so this separates surfaces sharply
    float w = (wb + 1e-3) / (1e-4 + abs(dk - d0) * 300.0);
    L += texture(tL, uv).rgb * w;
    T += texture(tT, uv).rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4(min(scene * (T / wsum) + L / wsum, vec3(6e4)), 1.0);
}
`;

export class LowResAtmosphere {
  readonly target: THREE.WebGLRenderTarget;
  readonly apply: THREE.ShaderMaterial;

  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      count: 2, type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    });
    this.apply = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: APPLY_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tColor: { value: null }, tDepth: { value: null }, tL: { value: null }, tT: { value: null }, uLowSize: { value: new THREE.Vector2(1, 1) } },
    });
  }

  setSize(w: number, h: number) {
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    (this.apply.uniforms.uLowSize.value as THREE.Vector2).set(w, h);
    this.apply.uniforms.tL.value = this.target.textures[0];
    this.apply.uniforms.tT.value = this.target.textures[1];
  }

  dispose() {
    this.target.dispose();
    this.apply.dispose();
  }
}
