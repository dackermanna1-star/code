// Soft camera-facing billboards (steam, sea-fog wisps): one instanced draw
// call per layer, premultiplied alpha, sized in world metres (no point-size
// limits). Positions / sizes / alphas are written from the CPU each frame.
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';

const VERT = /* glsl */ `
  attribute vec4 iPosSize;   // xyz, size (m)
  attribute vec2 iAlphaSeed; // alpha, seed
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    float a = iAlphaSeed.y * 6.2831;
    vec2 p = position.xy;
    p = vec2(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a));
    #ifdef FLAT
    // Lying flat (sea fog over the water).
    vec4 mv = viewMatrix * vec4(iPosSize.xyz + vec3(p.x, 0.0, p.y * 0.6) * iPosSize.w * 0.5, 1.0);
    #else
    vec4 mv = viewMatrix * vec4(iPosSize.xyz, 1.0);
    mv.xy += p * iPosSize.w * 0.5;
    #endif
    gl_Position = projectionMatrix * mv;
    vUv = position.xy;
    vAlpha = iAlphaSeed.x;
    vSeed = iAlphaSeed.y;
  }
`;
const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uWisp;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  ${NOISE_GLSL}
  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float n = envFbm3(vUv * 1.6 + vSeed * 31.0);
    float a = smoothstep(1.0, 0.15, r + (n - 0.5) * uWisp);
    a *= a * vAlpha;
    gl_FragColor = vec4(uColor * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class SoftSprites {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private posSize: Float32Array;
  private alphaSeed: Float32Array;
  private geo: THREE.InstancedBufferGeometry;
  private n = 0;

  constructor(readonly max: number, color = new THREE.Color(1, 1, 1), wisp = 0.8, flat = false) {
    const quad = new THREE.PlaneGeometry(2, 2);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.posSize = new Float32Array(max * 4);
    this.alphaSeed = new Float32Array(max * 2);
    this.geo.setAttribute('iPosSize', new THREE.InstancedBufferAttribute(this.posSize, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iAlphaSeed', new THREE.InstancedBufferAttribute(this.alphaSeed, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uColor: { value: color.clone() }, uWisp: { value: wisp } },
      defines: flat ? { FLAT: '' } : {},
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
  }

  /** Start writing a frame. */
  begin(): void {
    this.n = 0;
  }

  push(x: number, y: number, z: number, size: number, alpha: number, seed: number): void {
    if (this.n >= this.max || alpha <= 0.002) return;
    const i = this.n++;
    this.posSize[i * 4] = x;
    this.posSize[i * 4 + 1] = y;
    this.posSize[i * 4 + 2] = z;
    this.posSize[i * 4 + 3] = size;
    this.alphaSeed[i * 2] = alpha;
    this.alphaSeed[i * 2 + 1] = seed;
  }

  end(): void {
    this.geo.instanceCount = this.n;
    (this.geo.attributes.iPosSize as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.geo.attributes.iAlphaSeed as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
}
