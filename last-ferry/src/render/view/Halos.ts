// Per-frame additive halo sprites (one draw call): glowing eyes and the sickly
// green glow of the undead (downed bodies that will rise, risen crawlers), the
// crane's hook glint. Callers push sprites every frame between begin() and
// end(); nothing persists.
import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  uniform float uScale;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(2.0, aSize * uScale / max(0.1, -mv.z));
  }
`;
const FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float g = exp(-r2 * 6.0) * 0.8 + exp(-r2 * 2.0) * 0.2;
    g *= 1.0 - r2;
    gl_FragColor = vec4(vColor * g, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Halos {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private n = 0;
  private mat: THREE.ShaderMaterial;
  /** Sprites are pulled this far toward the camera so the deck does not clip them. */
  private toCam: THREE.Vector3;

  constructor(
    scene: THREE.Scene,
    private max = 256,
    camPos: { x: number; y: number; z: number },
  ) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 720 / (2 * Math.tan((12 * Math.PI) / 180)) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 21;
    this.points.name = 'Halos';
    scene.add(this.points);
    this.toCam = new THREE.Vector3(camPos.x, camPos.y, camPos.z);
  }

  /** Pixel scale: drawing-buffer height and vertical field of view. */
  setViewport(heightPx: number, fovDeg: number): void {
    this.mat.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  begin(): void {
    this.n = 0;
  }

  /** A halo of world diameter `size` (m), linear colour × k. `pull`: metres toward the camera. */
  push(x: number, y: number, z: number, color: THREE.Color, k: number, size: number, pull = 0.8): void {
    if (this.n >= this.max || k <= 0.003) return;
    const i = this.n++;
    let dx = this.toCam.x - x;
    let dy = this.toCam.y - y;
    let dz = this.toCam.z - z;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l;
    dy /= l;
    dz /= l;
    this.pos[i * 3] = x + dx * pull;
    this.pos[i * 3 + 1] = y + dy * pull;
    this.pos[i * 3 + 2] = z + dz * pull;
    this.col[i * 3] = color.r * k;
    this.col[i * 3 + 1] = color.g * k;
    this.col[i * 3 + 2] = color.b * k;
    this.size[i] = size;
  }

  end(): void {
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    for (const name of ['position', 'aColor', 'aSize']) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      a.needsUpdate = true;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * a.itemSize);
    }
  }

  clear(): void {
    this.n = 0;
    this.points.geometry.setDrawRange(0, 0);
  }
}
