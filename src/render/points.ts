/**
 * Energy-conserving point sprites for unresolved objects (stars, planets,
 * moons seen from afar). Each point carries its irradiance at the camera in
 * solar-constant units; the shader spreads it over a small Gaussian so the
 * HDR pipeline (exposure + bloom) gives a physically ordered brightness.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 color;
attribute float flux;
uniform float uPixelAngle;
uniform sampler2D tAdapt;
uniform float uBoost;
uniform float uMinSize;
varying vec3 vColor;
varying float vPeak;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float e = max(texture(tAdapt, vec2(0.5)).r, 1e-6);
  float F = flux * uBoost;
  // Gaussian with sigma ~0.6 px holds energy F over ~2.3 px²
  float omega = uPixelAngle * uPixelAngle;
  float peak = F / (omega * 2.26);
  float disp = peak * e;
  // grow the footprint for very bright points (simulated glare), keeping energy
  float size = uMinSize * (1.0 + 0.6 * log2(max(disp, 1.0)) );
  size = clamp(size, uMinSize, 48.0);
  vPeak = peak * (uMinSize * uMinSize) / (size * size);
  vColor = color;
  gl_PointSize = size;
  if (flux <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vColor;
varying float vPeak;
void main() {
  #include <logdepthbuf_fragment>
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d) * 4.0;
  float g = exp(-r2 * 4.0) + 0.02 * exp(-r2 * 0.8);
  gl_FragColor = vec4(min(vColor * vPeak * g, vec3(6e4)), 1.0);
}
`;

export class PointSprites {
  readonly points: THREE.Points;
  readonly geometry = new THREE.BufferGeometry();
  readonly material: THREE.ShaderMaterial;
  private pos: Float32Array;
  private col: Float32Array;
  private flux: Float32Array;
  count = 0;

  constructor(readonly capacity: number, adapt: () => THREE.Texture) {
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.flux = new Float32Array(capacity);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('flux', new THREE.BufferAttribute(this.flux, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uPixelAngle: { value: 0.001 }, tAdapt: { value: null }, uBoost: { value: 1 }, uMinSize: { value: 2.6 } },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    const self = this;
    this.material.onBeforeRender = () => {
      self.material.uniforms.tAdapt.value = adapt();
    };
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  begin() {
    this.count = 0;
  }

  /** rel: camera-relative position (m). flux: irradiance at camera / solar constant. */
  add(rel: THREE.Vector3, color: ArrayLike<number>, flux: number) {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    // place far points on a 1e15 m shell (direction preserved) to keep float32 sane
    const d = rel.length();
    const s = d > 1e15 ? 1e15 / d : 1;
    this.pos[i * 3] = rel.x * s;
    this.pos[i * 3 + 1] = rel.y * s;
    this.pos[i * 3 + 2] = rel.z * s;
    this.col[i * 3] = color[0];
    this.col[i * 3 + 1] = color[1];
    this.col[i * 3 + 2] = color[2];
    this.flux[i] = flux;
  }

  end() {
    this.geometry.setDrawRange(0, this.count);
    for (const k of ['position', 'color', 'flux']) (this.geometry.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
  }
}
